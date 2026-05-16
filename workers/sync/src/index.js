// SimplyKnown Kids — profile sync worker
//
// Endpoints (all JSON):
//   POST   /signup     { email, password }                  → 201 { syncKey }
//   POST   /signin     { email, password }                  → 200 { syncKey, lastSync }
//   POST   /push       Auth: Bearer <syncKey>, body=profiles → 200 { updatedAt }
//   GET    /pull       Auth: Bearer <syncKey>                → 200 { profiles, updatedAt }
//   POST   /signout    Auth: Bearer <syncKey>                → 200 (rotates syncKey, future calls need re-signin)
//   POST   /reset      { email }                              → 202 (v2 — sends reset code; v1 stub)
//
// KV layout:
//   account:<emailHash>  → { pwHash, pwSalt, syncKey, createdAt }
//   key:<syncKey>        → emailHash      (reverse lookup for auth)
//   data:<emailHash>     → { profiles, updatedAt }

const PBKDF2_ITER = 100000;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResp(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
  });
}

function err(msg, status, headers) {
  return jsonResp({ error: msg }, status, headers);
}

function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(s) {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}

async function pbkdf2(password, saltHex) {
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    key, 256
  );
  return toHex(bits);
}

function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr);
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function emailHash(email) {
  return await sha256Hex('email-v1:' + normalizeEmail(email));
}

async function readJson(req) {
  try { return await req.json(); } catch { return null; }
}

async function getAccountByKey(env, syncKey) {
  if (!syncKey) return null;
  const emailHashVal = await env.SYNC_KV.get('key:' + syncKey);
  if (!emailHashVal) return null;
  const accountJson = await env.SYNC_KV.get('account:' + emailHashVal);
  if (!accountJson) return null;
  return { emailHash: emailHashVal, account: JSON.parse(accountJson) };
}

async function handleSignup(req, env) {
  const body = await readJson(req);
  if (!body) return err('bad json', 400);
  const email = normalizeEmail(body.email);
  const password = body.password || '';
  if (!validEmail(email)) return err('invalid email', 400);
  if (password.length < 8) return err('password must be 8+ chars', 400);
  const eh = await emailHash(email);
  const existing = await env.SYNC_KV.get('account:' + eh);
  if (existing) return err('account exists — sign in instead', 409);
  const salt = randomHex(16);
  const pwHash = await pbkdf2(password, salt);
  const syncKey = randomHex(24);
  const account = { pwHash, pwSalt: salt, syncKey, createdAt: Date.now() };
  await env.SYNC_KV.put('account:' + eh, JSON.stringify(account));
  await env.SYNC_KV.put('key:' + syncKey, eh);
  return jsonResp({ syncKey }, 201);
}

async function handleSignin(req, env) {
  const body = await readJson(req);
  if (!body) return err('bad json', 400);
  const email = normalizeEmail(body.email);
  const password = body.password || '';
  if (!validEmail(email)) return err('invalid email', 400);
  const eh = await emailHash(email);
  const accountJson = await env.SYNC_KV.get('account:' + eh);
  if (!accountJson) return err('no account for that email', 404);
  const account = JSON.parse(accountJson);
  const check = await pbkdf2(password, account.pwSalt);
  if (check !== account.pwHash) return err('wrong password', 401);
  // Rotate syncKey on every sign-in
  if (account.syncKey) await env.SYNC_KV.delete('key:' + account.syncKey);
  const newKey = randomHex(24);
  account.syncKey = newKey;
  await env.SYNC_KV.put('account:' + eh, JSON.stringify(account));
  await env.SYNC_KV.put('key:' + newKey, eh);
  const dataJson = await env.SYNC_KV.get('data:' + eh);
  const lastSync = dataJson ? JSON.parse(dataJson).updatedAt : null;
  return jsonResp({ syncKey: newKey, lastSync });
}

function extractToken(req) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(\S+)/i);
  return m ? m[1] : null;
}

async function handlePush(req, env) {
  const token = extractToken(req);
  const auth = await getAccountByKey(env, token);
  if (!auth) return err('unauthorized', 401);
  const body = await readJson(req);
  if (!body || !body.profiles) return err('missing profiles', 400);
  // Cap size at 1MB
  const payload = JSON.stringify(body.profiles);
  if (payload.length > 1024 * 1024) return err('too large', 413);
  const updatedAt = Date.now();
  await env.SYNC_KV.put('data:' + auth.emailHash, JSON.stringify({ profiles: body.profiles, updatedAt }));
  return jsonResp({ updatedAt });
}

async function handlePull(req, env) {
  const token = extractToken(req);
  const auth = await getAccountByKey(env, token);
  if (!auth) return err('unauthorized', 401);
  const dataJson = await env.SYNC_KV.get('data:' + auth.emailHash);
  if (!dataJson) return jsonResp({ profiles: null, updatedAt: null });
  return jsonResp(JSON.parse(dataJson));
}

async function handleSignout(req, env) {
  const token = extractToken(req);
  const auth = await getAccountByKey(env, token);
  if (!auth) return err('unauthorized', 401);
  await env.SYNC_KV.delete('key:' + token);
  auth.account.syncKey = null;
  await env.SYNC_KV.put('account:' + auth.emailHash, JSON.stringify(auth.account));
  return jsonResp({ ok: true });
}

async function handleReset(req, env) {
  // v1: stub. v2 will email a reset code via Resend.
  return jsonResp({ message: 'Password reset by email is not yet enabled. Contact the app owner for help.' }, 202);
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('origin');
    const allowed = env.ALLOWED_ORIGIN || '*';
    const headers = corsHeaders(allowed);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const url = new URL(req.url);
    let response;
    try {
      switch (url.pathname) {
        case '/signup':  response = await handleSignup(req, env); break;
        case '/signin':  response = await handleSignin(req, env); break;
        case '/push':    response = await handlePush(req, env); break;
        case '/pull':    response = await handlePull(req, env); break;
        case '/signout': response = await handleSignout(req, env); break;
        case '/reset':   response = await handleReset(req, env); break;
        case '/health':  response = jsonResp({ ok: true }); break;
        default:         response = err('not found', 404);
      }
    } catch (e) {
      response = err('server error: ' + e.message, 500);
    }
    // Add CORS headers to the response
    const finalHeaders = new Headers(response.headers);
    for (const [k, v] of Object.entries(headers)) finalHeaders.set(k, v);
    return new Response(response.body, { status: response.status, headers: finalHeaders });
  },
};
