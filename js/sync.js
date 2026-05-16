// Cloud sync client — talks to the Cloudflare Worker for cross-device profile sync.
//
// Public API on window.cloudSync:
//   signup(email, password)  → Promise<{ ok, error? }>
//   signin(email, password)  → Promise<{ ok, error? }>
//   signout()                → clears local session
//   push()                   → uploads current profiles to cloud
//   pull()                   → downloads profiles, replacing local
//   status()                 → { email, syncKey, lastSync } from localStorage
//
// localStorage keys:
//   vb_sync_email      — signed-in email
//   vb_sync_key        — sync key returned by /signin or /signup
//   vb_sync_last_push  — timestamp of last successful push

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

async function signup(email, password) {
  const r = await _request('/signup', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (!r.ok) return { ok: false, error: r.error };
  localStorage.setItem('vb_sync_email', email.toLowerCase().trim());
  localStorage.setItem('vb_sync_key', r.body.syncKey);
  // Upload current profiles immediately after signup
  await push();
  return { ok: true };
}

async function signin(email, password) {
  const r = await _request('/signin', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (!r.ok) return { ok: false, error: r.error };
  localStorage.setItem('vb_sync_email', email.toLowerCase().trim());
  localStorage.setItem('vb_sync_key', r.body.syncKey);
  return { ok: true, lastSync: r.body.lastSync };
}

async function signout() {
  const key = localStorage.getItem('vb_sync_key');
  if (key) {
    await _request('/signout', { method: 'POST', headers: { Authorization: 'Bearer ' + key } });
  }
  localStorage.removeItem('vb_sync_email');
  localStorage.removeItem('vb_sync_key');
  localStorage.removeItem('vb_sync_last_push');
  return { ok: true };
}

async function push() {
  const key = localStorage.getItem('vb_sync_key');
  if (!key) return { ok: false, error: 'not signed in' };
  const profiles = JSON.parse(localStorage.getItem('vb_profiles') || '[]');
  const r = await _request('/push', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key },
    body: JSON.stringify({ profiles }),
  });
  if (!r.ok) return { ok: false, error: r.error };
  localStorage.setItem('vb_sync_last_push', String(r.body.updatedAt));
  return { ok: true, updatedAt: r.body.updatedAt };
}

async function pull() {
  const key = localStorage.getItem('vb_sync_key');
  if (!key) return { ok: false, error: 'not signed in' };
  const r = await _request('/pull', { method: 'GET', headers: { Authorization: 'Bearer ' + key } });
  if (!r.ok) return { ok: false, error: r.error };
  if (!r.body.profiles) return { ok: false, error: 'no profiles in cloud yet — push first from another device' };
  localStorage.setItem('vb_profiles', JSON.stringify(r.body.profiles));
  return { ok: true, profiles: r.body.profiles, updatedAt: r.body.updatedAt };
}

function status() {
  return {
    email: localStorage.getItem('vb_sync_email'),
    syncKey: localStorage.getItem('vb_sync_key'),
    lastPush: Number(localStorage.getItem('vb_sync_last_push') || 0),
  };
}

window.cloudSync = { signup, signin, signout, push, pull, status };
