// Cloud sync — automatic.
//   - On every page load: if signed in, pull from cloud. Replace local if cloud is newer.
//   - On every saveProfiles() call: debounced push to cloud (2s of idle = push).
//   - Sign in returns a sync key + immediately auto-pulls the most recent cloud data.
//
// Parent-facing UI shows status only (signed in as / last synced).
//
// localStorage keys:
//   vb_sync_email           email user signed in with
//   vb_sync_key             auth token
//   vb_local_updated_at     ms timestamp of last local saveProfiles
//   vb_cloud_pulled_at      ms timestamp of last successful cloud pull
//   vb_cloud_pushed_at      ms timestamp of last successful cloud push

const SYNC_BASE = 'https://simplyknown-kids-sync.simplyknownfacts.workers.dev';

async function _request(path, opts) {
  const url = SYNC_BASE + path;
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const res = await fetch(url, { ...opts, headers });
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok) {
    // 401/403 = our sync key is dead (expired, or invalidated when the user
    // signed in elsewhere). Flag it so the UI can prompt a re-sign-in instead
    // of silently drifting forever. Do NOT delete vb_sync_email — we want to
    // show "signed in as X — session expired".
    if (res.status === 401 || res.status === 403) {
      localStorage.setItem('vb_sync_expired', '1');
    }
    return { ok: false, status: res.status, error: (body && body.error) || res.statusText };
  }
  // Any successful authed request clears a prior expired flag.
  localStorage.removeItem('vb_sync_expired');
  return { ok: true, body };
}

// Escape untrusted strings before interpolating into innerHTML. Profile data
// (name/avatar/birthday) round-trips through the cloud, so a poisoned or
// compromised cloud record must not be able to inject markup/script.
function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Stable signature of a profile set: sorted ids + each profile's name/birthday.
// Used to decide whether cloud and local actually differ (a true conflict) vs
// are the same set in a different order.
function _profilesSignature(list) {
  return (list || [])
    .map(p => `${p.id}:${p.name}:${p.birthday}`)
    .sort()
    .join('|');
}

async function _signup(email, password) {
  const r = await _request('/signup', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (!r.ok) return { ok: false, error: r.error };
  localStorage.setItem('vb_sync_email', email.toLowerCase().trim());
  localStorage.setItem('vb_sync_key', r.body.syncKey);
  await _push();
  return { ok: true };
}

async function _signin(email, password) {
  const r = await _request('/signin', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (!r.ok) return { ok: false, error: r.error };
  localStorage.setItem('vb_sync_email', email.toLowerCase().trim());
  localStorage.setItem('vb_sync_key', r.body.syncKey);
  localStorage.removeItem('vb_sync_expired');
  // Pull WITHOUT replacing, then reconcile. Blindly replacing here was the
  // data-loss bug: a device with fewer kids would wipe out kids added on
  // another device. Now we detect a true difference and surface a chooser.
  const pull = await _pull(false);
  if (!pull.ok) return { ok: true, lastSync: r.body.lastSync, pulled: false };
  const local = JSON.parse(localStorage.getItem('vb_profiles') || '[]');
  const cloud = pull.profiles || [];
  if (!local.length) {
    // Nothing local — just take the cloud copy.
    localStorage.setItem('vb_profiles', JSON.stringify(cloud));
    localStorage.setItem('vb_local_updated_at', String(pull.updatedAt || Date.now()));
    return { ok: true, pulled: true };
  }
  if (!cloud.length) {
    // Cloud empty — push local up.
    await _push();
    return { ok: true, pushed: true };
  }
  if (_profilesSignature(local) === _profilesSignature(cloud)) {
    return { ok: true, inSync: true };
  }
  // Real conflict — stash both sets for the chooser overlay.
  _setConflict(local, cloud, pull.updatedAt);
  return { ok: true, conflict: true };
}

async function _signout() {
  const key = localStorage.getItem('vb_sync_key');
  if (key) {
    await _request('/signout', { method: 'POST', headers: { Authorization: 'Bearer ' + key } });
  }
  localStorage.removeItem('vb_sync_email');
  localStorage.removeItem('vb_sync_key');
  localStorage.removeItem('vb_cloud_pulled_at');
  localStorage.removeItem('vb_cloud_pushed_at');
  return { ok: true };
}

async function _push() {
  const key = localStorage.getItem('vb_sync_key');
  if (!key) return { ok: false, error: 'not signed in' };
  const profiles = JSON.parse(localStorage.getItem('vb_profiles') || '[]');
  const r = await _request('/push', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key },
    body: JSON.stringify({ profiles }),
  });
  if (!r.ok) return { ok: false, error: r.error };
  localStorage.setItem('vb_cloud_pushed_at', String(r.body.updatedAt));
  return { ok: true, updatedAt: r.body.updatedAt };
}

async function _pull(replaceLocal = true) {
  const key = localStorage.getItem('vb_sync_key');
  if (!key) return { ok: false, error: 'not signed in' };
  const r = await _request('/pull', { method: 'GET', headers: { Authorization: 'Bearer ' + key } });
  if (!r.ok) return { ok: false, error: r.error };
  if (!r.body.profiles) return { ok: false, error: 'no cloud data yet' };
  localStorage.setItem('vb_cloud_pulled_at', String(r.body.updatedAt || Date.now()));
  if (replaceLocal) {
    localStorage.setItem('vb_profiles', JSON.stringify(r.body.profiles));
    // Update localUpdatedAt to match cloud so we don't immediately push it back
    localStorage.setItem('vb_local_updated_at', String(r.body.updatedAt || Date.now()));
  }
  return { ok: true, profiles: r.body.profiles, updatedAt: r.body.updatedAt };
}

// Debounced auto-push, invoked by profiles.js whenever saveProfiles runs.
let _pushTimer = null;
function _onLocalChange() {
  if (!localStorage.getItem('vb_sync_key')) return;
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => { _push().catch(() => {}); }, 2000);
}

// Auto-sync on page load: pull from cloud, replace local if cloud is newer.
async function _autoSync() {
  if (!localStorage.getItem('vb_sync_key')) return { ok: false, error: 'not signed in' };
  // Cooldown: don't auto-pull more than once per 30s (covers spam navigation)
  const lastPull = parseInt(localStorage.getItem('vb_cloud_pulled_at') || '0');
  if (Date.now() - lastPull < 30000) return { ok: true, skipped: true };
  const localUpdated = parseInt(localStorage.getItem('vb_local_updated_at') || '0');
  // Pull WITHOUT replacing; compare timestamps; replace only if cloud is newer
  const r = await _pull(false);
  if (!r.ok) return r;
  const local = JSON.parse(localStorage.getItem('vb_profiles') || '[]');
  const cloud = r.profiles || [];
  // Same set of kids? Nothing to do (ignore pure ordering/timestamp diffs).
  if (_profilesSignature(local) === _profilesSignature(cloud)) {
    return { ok: true, inSync: true };
  }
  if (!local.length) {
    localStorage.setItem('vb_profiles', JSON.stringify(cloud));
    localStorage.setItem('vb_local_updated_at', String(r.updatedAt));
    return { ok: true, pulled: true, reload: true };
  }
  if (!cloud.length) {
    _push().catch(() => {});
    return { ok: true, pushed: true };
  }
  // Both non-empty AND different — a real conflict. Per Scott's choice, never
  // silently overwrite: surface a chooser. (Old code auto-replaced on
  // cloud-newer, which is how devices lost kids.)
  _setConflict(local, cloud, r.updatedAt);
  return { ok: true, conflict: true };
}

// ---------- Conflict state + chooser overlay ----------
function _setConflict(local, cloud, cloudUpdatedAt) {
  localStorage.setItem('vb_sync_conflict', JSON.stringify({
    local, cloud, cloudUpdatedAt: cloudUpdatedAt || 0,
  }));
}
function _getConflict() {
  try { return JSON.parse(localStorage.getItem('vb_sync_conflict') || 'null'); }
  catch { return null; }
}
function _clearConflict() { localStorage.removeItem('vb_sync_conflict'); }

// Apply the user's chosen kid set: it becomes the new local truth AND is
// pushed up so every device converges on it.
async function _resolveConflict(chosenProfiles) {
  localStorage.setItem('vb_profiles', JSON.stringify(chosenProfiles));
  localStorage.setItem('vb_local_updated_at', String(Date.now()));
  _clearConflict();
  await _push().catch(() => {});
  return { ok: true };
}

// Self-contained chooser overlay. Injected on any page when a conflict is
// pending. Lists every kid from cloud + local (deduped by id), pre-checked,
// with a chip showing where each came from. Parent unchecks any to drop.
function _renderConflictOverlay() {
  const c = _getConflict();
  if (!c || document.getElementById('vbSyncConflict')) return;

  // Build a deduped union keyed by id; remember which side(s) each came from.
  const byId = {};
  (c.cloud || []).forEach(p => { byId[p.id] = { p, from: ['Cloud'] }; });
  (c.local || []).forEach(p => {
    if (byId[p.id]) byId[p.id].from.push('This device');
    else byId[p.id] = { p, from: ['This device'] };
  });
  const entries = Object.values(byId);

  const ov = document.createElement('div');
  ov.id = 'vbSyncConflict';
  ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(8,6,28,0.92);' +
    'display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;' +
    'font-family:system-ui,sans-serif;';
  const rows = entries.map((e, i) => {
    const ageBits = e.p.birthday ? ` · ${_esc(e.p.birthday)}` : '';
    return `<label style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;` +
      `background:rgba(255,255,255,0.06);margin-bottom:8px;cursor:pointer;color:#fff;">` +
      `<input type="checkbox" data-i="${i}" checked style="width:22px;height:22px;flex-shrink:0;">` +
      `<span style="font-size:28px;">${_esc(mascotEmoji(e.p))}</span>` +
      `<span style="flex:1;"><b>${_esc(e.p.name || 'Unnamed')}</b>` +
      `<span style="opacity:0.6;font-size:12px;">${ageBits}</span><br>` +
      `<span style="font-size:11px;opacity:0.55;">${_esc(e.from.join(' + '))}</span></span></label>`;
  }).join('');
  ov.innerHTML =
    `<div style="background:#1a1430;border-radius:20px;max-width:460px;width:100%;padding:24px;color:#fff;` +
    `box-shadow:0 20px 60px rgba(0,0,0,0.5);max-height:90vh;overflow:auto;">` +
    `<h2 style="margin:0 0 6px;font-size:22px;">Which kids should we keep?</h2>` +
    `<p style="margin:0 0 16px;font-size:14px;opacity:0.7;line-height:1.5;">` +
    `This device and the cloud have different kid lists. Pick the ones to keep — ` +
    `your choice is saved everywhere.</p>` +
    `<div id="vbConflictRows">${rows}</div>` +
    `<button id="vbConflictSave" style="margin-top:16px;width:100%;padding:14px;border:none;` +
    `border-radius:14px;background:#7FE6D2;color:#10243f;font-weight:800;font-size:16px;cursor:pointer;">` +
    `Keep selected kids</button></div>`;
  document.body.appendChild(ov);

  ov.querySelector('#vbConflictSave').addEventListener('click', async () => {
    const chosen = [];
    ov.querySelectorAll('input[type=checkbox]').forEach(cb => {
      if (cb.checked) chosen.push(entries[Number(cb.dataset.i)].p);
    });
    ov.querySelector('#vbConflictSave').textContent = 'Saving…';
    await _resolveConflict(chosen);
    ov.remove();
    location.reload();
  });
}

function _status() {
  return {
    email: localStorage.getItem('vb_sync_email'),
    syncKey: localStorage.getItem('vb_sync_key'),
    expired: localStorage.getItem('vb_sync_expired') === '1',
    lastPushed: parseInt(localStorage.getItem('vb_cloud_pushed_at') || '0'),
    lastPulled: parseInt(localStorage.getItem('vb_cloud_pulled_at') || '0'),
  };
}

window.cloudSync = {
  signup: _signup,
  signin: _signin,
  signout: _signout,
  push: _push,
  pull: () => _pull(true),
  autoSync: _autoSync,
  onLocalChange: _onLocalChange,
  status: _status,
  getConflict: _getConflict,
  resolveConflict: _resolveConflict,
  isExpired: () => localStorage.getItem('vb_sync_expired') === '1',
};

// Fire auto-sync as soon as profiles.js + this script have both loaded.
function _afterAutoSync(r) {
  if (r && r.reload && !window._vbSyncReloaded) {
    window._vbSyncReloaded = true; location.reload(); return;
  }
  // A pending conflict (from this autoSync OR a prior unresolved one) shows
  // the chooser overlay. Wait for body to exist.
  if (_getConflict()) {
    if (document.body) _renderConflictOverlay();
    else document.addEventListener('DOMContentLoaded', _renderConflictOverlay);
  }
}
function _kickAutoSync() { _autoSync().then(_afterAutoSync).catch(() => {}); }
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _kickAutoSync);
} else {
  _kickAutoSync();
}
