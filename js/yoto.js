// Yoto API client — OAuth 2.0 with PKCE + content fetch.
//
// Requires a client_id from Yoto's developer portal. Apply at:
//   https://yoto.dev/get-started/api-guidelines/
// Set the client_id below or via parent settings UI.
//
// Auth flow:
//   1. parent taps "Connect Yoto" → connect() generates PKCE pair + redirects
//      browser to https://login.yotoplay.com/authorize
//   2. user logs in at Yoto, approves → redirect back to /yoto-callback.html
//   3. callback page calls completeAuth() to exchange code for tokens
//   4. tokens stored in localStorage; access token refreshed automatically
//
// API:
//   yoto.isConfigured() → boolean (client_id set?)
//   yoto.isConnected()  → boolean (have valid tokens?)
//   yoto.connect()      → start OAuth flow (redirects browser)
//   yoto.completeAuth(code, state) → finish OAuth flow (called by callback page)
//   yoto.disconnect()   → wipe tokens
//   yoto.listContent()  → array of cards { cardId, title, cover, ... }
//   yoto.getCard(id)    → full card with chapters/tracks
//   yoto.getStreamUrl(track) → audio URL ready to play

const YOTO_CONFIG = (typeof window !== 'undefined' && window.YOTO_CONFIG) || {};
const CLIENT_ID = YOTO_CONFIG.clientId || localStorage.getItem('vb_yoto_client_id') || '';
const REDIRECT_URI = (typeof window !== 'undefined' ? window.location.origin : '') + '/yoto-callback.html';
const AUTH_URL = 'https://login.yotoplay.com/authorize';
const TOKEN_URL = 'https://login.yotoplay.com/oauth/token';
const API_BASE = 'https://api.yotoplay.com';
// Scopes requested at login. offline_access (refresh tokens / stay-logged-in)
// was enabled in the Yoto dashboard 2026-06-04, so it's back in the request.
// NOTE: family:library:view is requested but Yoto is NOT yet granting it for
// this unverified app — the issued token returns scope "openid profile" only,
// so the card-library API (/card/family/library) 403s until family:library:view
// is approved/verified on Yoto's side.
const SCOPES = 'family:library:view offline_access openid profile';

function _isConfigured() { return !!(CLIENT_ID && CLIENT_ID.length > 5); }

// Yoto is ONE family account → ONE shared library, so the app uses a single
// SHARED connection (Scott's call 2026-06-04): connect once and every kid profile
// on the device sees the same family library. There's no separate library per
// child within a family, so per-profile tokens were unnecessary.
const TOKENS_KEY = 'vb_yoto_tokens';

function _getTokens() {
  const raw = localStorage.getItem(TOKENS_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function _setTokens(t, refreshTokenFallback) {
  // Yoto refresh tokens are single-use — always replace; fallback retains old if API omits it.
  const stored = {
    access_token: t.access_token,
    refresh_token: t.refresh_token || refreshTokenFallback,
    expires_at: Date.now() + ((t.expires_in || 3600) * 1000),
    scope: t.scope || '',
  };
  localStorage.setItem(TOKENS_KEY, JSON.stringify(stored));
}
function _clearTokens() { localStorage.removeItem(TOKENS_KEY); }

function _isConnected() { return !!_getTokens(); }

function _b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function _randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2,'0')).join('');
}
async function _sha256B64u(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return _b64url(buf);
}

async function _connect() {
  if (!_isConfigured()) { alert('Yoto client_id is not set. Ask parent to configure it in settings.'); return; }
  const verifier = _randomHex(48); // 96 chars hex = plenty of entropy
  sessionStorage.setItem('vb_yoto_pkce_verifier', verifier);
  const state = _randomHex(16);
  sessionStorage.setItem('vb_yoto_oauth_state', state);
  const challenge = await _sha256B64u(verifier);
  const url = AUTH_URL + '?' + new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  window.location.href = url;
}

async function _completeAuth(code, state) {
  const expected = sessionStorage.getItem('vb_yoto_oauth_state');
  if (state !== expected) throw new Error('state mismatch — possible CSRF, aborting');
  const verifier = sessionStorage.getItem('vb_yoto_pkce_verifier');
  if (!verifier) throw new Error('no PKCE verifier — restart the connect flow');
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  if (!r.ok) throw new Error('Yoto token exchange ' + r.status + ': ' + (await r.text()));
  const t = await r.json();
  _setTokens(t);
  sessionStorage.removeItem('vb_yoto_pkce_verifier');
  sessionStorage.removeItem('vb_yoto_oauth_state');
  return true;
}

async function _refreshIfNeeded() {
  const t = _getTokens();
  if (!t) return null;
  if (Date.now() < t.expires_at - 60_000) return t.access_token;
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: t.refresh_token,
    }),
  });
  if (!r.ok) { _clearTokens(); return null; }
  const nu = await r.json();
  _setTokens(nu, t.refresh_token);
  return nu.access_token;
}

async function _apiGet(path) {
  const token = await _refreshIfNeeded();
  if (!token) return { error: 'not connected' };
  const r = await fetch(API_BASE + path, { headers: { Authorization: 'Bearer ' + token } });
  if (r.status === 401) { _clearTokens(); return { error: 'auth lost — reconnect' }; }
  if (!r.ok) return { error: 'api ' + r.status + ': ' + (await r.text()) };
  return { ok: true, body: await r.json() };
}

async function _listContent() {
  // Try the documented MYO endpoint first
  let r = await _apiGet('/content/mine');
  if (r.error) return { error: r.error };
  // Response shape per Yoto docs: array of cards or { cards: [...] }
  const cards = Array.isArray(r.body) ? r.body : (r.body.cards || r.body.content || []);
  return { ok: true, cards };
}

async function _getCard(cardId) {
  const r = await _apiGet('/content/' + encodeURIComponent(cardId));
  if (r.error) return { error: r.error };
  return { ok: true, card: r.body };
}

// Resolve a streamable audio URL from a track object. Yoto's track data
// usually has a `trackUrl` or a media item that needs resolution; handle both.
async function _getStreamUrl(track) {
  if (!track) return null;
  if (track.trackUrl && /^https?:/.test(track.trackUrl)) return track.trackUrl;
  if (track.url && /^https?:/.test(track.url)) return track.url;
  // Some tracks reference a media ID — resolve via /media/transcode-stream
  if (track.mediaId || track.id) {
    const id = track.mediaId || track.id;
    const r = await _apiGet('/media/transcode-stream?mediaId=' + encodeURIComponent(id));
    if (!r.error && r.body && r.body.url) return r.body.url;
  }
  return null;
}

function _disconnect() {
  _clearTokens();
  sessionStorage.removeItem('vb_yoto_pkce_verifier');
  sessionStorage.removeItem('vb_yoto_oauth_state');
}

window.yoto = {
  isConfigured: _isConfigured,
  isConnected: _isConnected,
  connect: _connect,
  completeAuth: _completeAuth,
  disconnect: _disconnect,
  listContent: _listContent,
  getCard: _getCard,
  getStreamUrl: _getStreamUrl,
};
