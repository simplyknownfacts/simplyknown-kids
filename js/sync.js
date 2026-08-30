// Cloud sync — automatic, progress-aware (v110).
//   - On every page load: pull from cloud, then MERGE with local so a kid's
//     progress (ribbons/XP/counters) carried on EITHER device is never lost.
//     Same kids + newer progress on the other device → the merged result is
//     written locally (and a safe page reloads so the new progress shows).
//   - On every saveProfiles() call: debounced push to cloud (2s of idle).
//   - On app close / background (pagehide + visibilitychange→hidden): an
//     immediate keepalive push flushes the last play, so closing the phone the
//     instant a kid finishes does NOT drop that progress.
//   - "Sync now" (Parent Settings) forces an immediate merge both ways.
//   - Different SET of kids (added/removed/renamed) = a real conflict → chooser.
//
// Merge rule (per kid, matched by id): progress = best-of-both (counters/xp/
// repeats = the higher; unlocked ribbons = the union; streak = the more recent).
// Plain settings (mascot/voice/YouTube/toggles) = the newer device wins. All of
// the merged progress fields only ever grow, so the merge is order-independent
// and both devices converge on the same result.
//
// localStorage keys:
//   vb_sync_email           email user signed in with
//   vb_sync_key             auth token
//   vb_local_updated_at     ms timestamp of last local saveProfiles
//   vb_cloud_pulled_at      ms timestamp of last successful cloud pull
//   vb_cloud_pushed_at      ms timestamp of last successful cloud push

// Which backend this copy of the app talks to is decided by the page's own
// hostname -- kids1.simplyknown.co and simplyknown-kids1.pages.dev are the dev
// site and get the dev Worker and dev database. Rule 8.10: dev must never write
// real family data. A runtime check, so there is still no build step.
const SYNC_BASE = /^(kids1\.|simplyknown-kids1\.)/.test(location.hostname)
  ? 'https://simplyknown-kids-sync-dev.simplyknownfacts.workers.dev'
  : 'https://simplyknown-kids-sync.simplyknownfacts.workers.dev';

// Don't auto-pull more than once per this window (covers spam navigation AND
// stops the merge→reload from re-triggering itself: the reloaded page sees a
// fresh pulled-at and skips). Handoff is unaffected — a freshly opened device
// has not pulled in far longer than this.
const PULL_COOLDOWN_MS = 30000;

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
// Used to decide whether cloud and local are the SAME set of kids (mergeable) or
// a true roster conflict (added/removed/renamed → chooser).
function _profilesSignature(list) {
  return (list || [])
    .map(p => `${p.id}:${p.name}:${p.birthday}`)
    .sort()
    .join('|');
}

function _localProfiles() {
  try { return JSON.parse(localStorage.getItem('vb_profiles') || '[]'); }
  catch { return []; }
}
function _localUpdatedAt() {
  return parseInt(localStorage.getItem('vb_local_updated_at') || '0');
}

// ---------- Progress-aware merge ----------
// Merge two achievement states keeping the best of each (all fields grow only).
function _mergeAchievements(a, b) {
  if (!a && !b) return undefined;
  a = a || {}; b = b || {};
  const au = a.unlocked || {}, bu = b.unlocked || {};
  const unlocked = {};
  new Set([...Object.keys(au), ...Object.keys(bu)]).forEach(id => {
    const ats = [au[id] && au[id].at, bu[id] && bu[id].at].filter(x => x > 0);
    unlocked[id] = { at: ats.length ? Math.min(...ats) : 0 };  // earliest earn time
  });
  const maxMap = (x, y) => {
    x = x || {}; y = y || {}; const o = {};
    new Set([...Object.keys(x), ...Object.keys(y)]).forEach(k => { o[k] = Math.max(x[k] || 0, y[k] || 0); });
    return o;
  };
  const sa = a.streak || {}, sb = b.streak || {};
  const best = Math.max(sa.best || 0, sb.best || 0);
  // keep the streak from whichever device played most recently
  let streak;
  if (!sa.last && !sb.last) streak = { last: null, current: 0, best };
  else if ((sa.last || '') >= (sb.last || '')) streak = { last: sa.last, current: sa.current || 0, best };
  else streak = { last: sb.last, current: sb.current || 0, best };
  // xp = the higher of the two. (Re-summing from unlocked needs the defs table,
  // which isn't loaded here; max is exact unless both devices unlocked DIFFERENT
  // one-shot ribbons fully offline at once — a rare single-kid edge — and it only
  // ever self-corrects upward on the next play.)
  return {
    unlocked,
    counters: maxMap(a.counters, b.counters),
    repeats: maxMap(a.repeats, b.repeats),
    streak,
    xp: Math.max(a.xp || 0, b.xp || 0),
    rank: (a.xp || 0) >= (b.xp || 0) ? (a.rank || 'sprout') : (b.rank || 'sprout'),
  };
}

// Merge two profile sets that share the same kids (same signature). Settings come
// from the newer device; achievements are best-of-both.
function _mergeProfileSets(local, cloud, cloudNewer) {
  const cloudById = {};
  (cloud || []).forEach(p => { cloudById[p.id] = p; });
  return (local || []).map(lp => {
    const cp = cloudById[lp.id];
    if (!cp) return lp;
    const merged = Object.assign({}, cloudNewer ? cp : lp);  // settings: newer wins
    const ach = _mergeAchievements(lp.achievements, cp.achievements);
    if (ach) merged.achievements = ach; else delete merged.achievements;
    return merged;
  });
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
  const local = _localProfiles();
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
    // Same kids — merge progress so re-signing in also pulls a kid's ribbons.
    const cloudNewer = (pull.updatedAt || 0) > _localUpdatedAt();
    const merged = _mergeProfileSets(local, cloud, cloudNewer);
    localStorage.setItem('vb_profiles', JSON.stringify(merged));
    localStorage.setItem('vb_local_updated_at', String(Math.max(_localUpdatedAt(), pull.updatedAt || 0)));
    await _push();
    return { ok: true, merged: true };
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

async function _push(opts) {
  const key = localStorage.getItem('vb_sync_key');
  if (!key) return { ok: false, error: 'not signed in' };
  const profiles = _localProfiles();
  const r = await _request('/push', {
    method: 'POST',
    // keepalive lets the request survive the page being closed/backgrounded,
    // so a flush on pagehide actually reaches the server.
    keepalive: !!(opts && opts.keepalive),
    headers: { Authorization: 'Bearer ' + key },
    body: JSON.stringify({ profiles }),
  });
  if (!r.ok) return { ok: false, error: r.error };
  localStorage.setItem('vb_cloud_pushed_at', String(r.body.updatedAt));
  _dirty = false;
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
let _dirty = false;  // local changes not yet confirmed pushed (drives flush-on-close)
function _onLocalChange() {
  if (!localStorage.getItem('vb_sync_key')) return;
  _dirty = true;
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => { _push().catch(() => {}); }, 2000);
}

// Immediate push on app close / background. visibilitychange→hidden is the
// reliable signal on mobile (pagehide/beforeunload often don't fire there).
function _flush() {
  if (!_dirty || !localStorage.getItem('vb_sync_key')) return;
  clearTimeout(_pushTimer);
  _push({ keepalive: true }).catch(() => {});
}

// Core reconcile: pull, then merge-or-conflict. Shared by auto-sync + "Sync now".
async function _reconcile() {
  if (!localStorage.getItem('vb_sync_key')) return { ok: false, error: 'not signed in' };
  const r = await _pull(false);
  if (!r.ok) return r;
  const local = _localProfiles();
  const cloud = r.profiles || [];
  if (!local.length) {
    localStorage.setItem('vb_profiles', JSON.stringify(cloud));
    localStorage.setItem('vb_local_updated_at', String(r.updatedAt || Date.now()));
    return { ok: true, pulled: true, reload: true };
  }
  if (!cloud.length) {
    _push().catch(() => {});
    return { ok: true, pushed: true };
  }
  if (_profilesSignature(local) !== _profilesSignature(cloud)) {
    // Different SET of kids — never silently overwrite; surface the chooser.
    _setConflict(local, cloud, r.updatedAt);
    return { ok: true, conflict: true };
  }
  // Same kids → merge progress (best-of) + newer settings.
  const cloudNewer = (r.updatedAt || 0) > _localUpdatedAt();
  const merged = _mergeProfileSets(local, cloud, cloudNewer);
  const mergedStr = JSON.stringify(merged);
  const changedLocal = mergedStr !== JSON.stringify(local);
  const changedCloud = mergedStr !== JSON.stringify(cloud);
  if (changedLocal) {
    localStorage.setItem('vb_profiles', mergedStr);
    localStorage.setItem('vb_local_updated_at', String(Math.max(_localUpdatedAt(), r.updatedAt || 0)));
  }
  if (changedCloud) await _push();  // converge cloud onto the merged result
  return { ok: true, merged: true, changedLocal };
}

// Auto-sync on page load (cooldown-gated).
async function _autoSync() {
  if (!localStorage.getItem('vb_sync_key')) return { ok: false, error: 'not signed in' };
  const lastPull = parseInt(localStorage.getItem('vb_cloud_pulled_at') || '0');
  if (Date.now() - lastPull < PULL_COOLDOWN_MS) return { ok: true, skipped: true };
  return _reconcile();
}

// "Sync now" — forced, ignores the cooldown. Returns the reconcile result.
async function _syncNow() {
  return _reconcile();
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
  syncNow: _syncNow,
  onLocalChange: _onLocalChange,
  status: _status,
  getConflict: _getConflict,
  resolveConflict: _resolveConflict,
  isExpired: () => localStorage.getItem('vb_sync_expired') === '1',
};

// Activity/hub pages (games/learning/art/videos/listen) still PUSH progress and
// flush on close, but they do NOT auto-pull/merge/reload — a kid is never yanked
// out of a game, and a roster-conflict chooser never pops over play. The shell
// screens (chooser/home/ribbons/settings) do the pull+merge on open.
function _isActivityArea() {
  return /\/(games|learning|art|videos|listen)\//.test(location.pathname);
}
function _safeToReload() { return !_isActivityArea(); }

// Fire auto-sync as soon as profiles.js + this script have both loaded.
function _afterAutoSync(r) {
  if (!r) return;
  const wantReload = r.reload || (r.merged && r.changedLocal && _safeToReload());
  if (wantReload && !window._vbSyncReloaded) {
    window._vbSyncReloaded = true; location.reload(); return;
  }
  // A pending conflict (from this autoSync OR a prior unresolved one) shows
  // the chooser overlay. Wait for body to exist.
  if (_getConflict()) {
    if (document.body) _renderConflictOverlay();
    else document.addEventListener('DOMContentLoaded', _renderConflictOverlay);
  }
}
function _kickAutoSync() {
  if (_isActivityArea()) return;  // push + flush stay wired below; just no pull here
  _autoSync().then(_afterAutoSync).catch(() => {});
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _kickAutoSync);
} else {
  _kickAutoSync();
}

// Flush unsaved progress the moment the app is closed or backgrounded.
window.addEventListener('pagehide', _flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) _flush(); });
