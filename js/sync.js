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
  if (!res.ok) return { ok: false, status: res.status, error: (body && body.error) || res.statusText };
  return { ok: true, body };
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
  // Immediately pull the most recent cloud data on sign-in
  const pulled = await _pull();
  return { ok: true, lastSync: r.body.lastSync, pulled: pulled.ok };
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
  if (r.updatedAt > localUpdated) {
    localStorage.setItem('vb_profiles', JSON.stringify(r.profiles));
    localStorage.setItem('vb_local_updated_at', String(r.updatedAt));
    return { ok: true, pulled: true, reload: true };
  } else if (localUpdated > r.updatedAt) {
    // Local is newer — push so the other devices catch up
    _push().catch(() => {});
    return { ok: true, pushed: true };
  }
  return { ok: true, inSync: true };
}

function _status() {
  return {
    email: localStorage.getItem('vb_sync_email'),
    syncKey: localStorage.getItem('vb_sync_key'),
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
};

// Fire auto-sync as soon as profiles.js + this script have both loaded.
// If the page wants to reload on cloud-newer pull, it can opt in via:
//   cloudSync.autoSync().then(r => { if (r.reload) location.reload(); });
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    _autoSync().then(r => { if (r && r.reload && !window._vbSyncReloaded) {
      window._vbSyncReloaded = true; location.reload();
    }});
  });
} else {
  _autoSync().then(r => { if (r && r.reload && !window._vbSyncReloaded) {
    window._vbSyncReloaded = true; location.reload();
  }});
}
