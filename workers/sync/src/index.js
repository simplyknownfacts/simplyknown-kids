// SimplyKnown Kids — profile sync worker (D1 backend)
//
// Endpoints (all JSON):
//   POST   /signup     { email, password }                  → 201 { syncKey }
//   POST   /signin     { email, password }                  → 200 { syncKey, lastSync }
//   POST   /push       Auth: Bearer <syncKey>, body=profiles → 200 { updatedAt }
//   GET    /pull       Auth: Bearer <syncKey>                → 200 { profiles, updatedAt }
//   POST   /signout    Auth: Bearer <syncKey>                → 200
//   POST   /reset      { email }                              → 202 (v2 — email reset, stub)
//
// D1 schema:
//   accounts(email_hash, pw_hash, pw_salt, sync_key, created_at)
//   data(email_hash, profiles, updated_at)

const PBKDF2_ITER = 100000;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResp(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}

function err(msg, status) { return jsonResp({ error: msg }, status); }

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
function normEmail(e) { return (e || '').trim().toLowerCase(); }
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
async function emailHash(e) { return await sha256Hex('email-v1:' + normEmail(e)); }
async function readJson(req) { try { return await req.json(); } catch { return null; } }
function extractToken(req) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(\S+)/i);
  return m ? m[1] : null;
}

async function getAccountBySyncKey(env, syncKey) {
  if (!syncKey) return null;
  const r = await env.DB.prepare('SELECT * FROM accounts WHERE sync_key = ?').bind(syncKey).first();
  return r || null;
}
async function getAccountByEmailHash(env, eh) {
  const r = await env.DB.prepare('SELECT * FROM accounts WHERE email_hash = ?').bind(eh).first();
  return r || null;
}

async function handleSignup(req, env) {
  const body = await readJson(req);
  if (!body) return err('bad json', 400);
  const email = normEmail(body.email);
  const password = body.password || '';
  if (!validEmail(email)) return err('invalid email', 400);
  if (password.length < 8) return err('password must be 8+ chars', 400);
  const eh = await emailHash(email);
  const existing = await getAccountByEmailHash(env, eh);
  if (existing) return err('account exists — sign in instead', 409);
  const salt = randomHex(16);
  const pwHash = await pbkdf2(password, salt);
  const syncKey = randomHex(24);
  await env.DB.prepare(
    'INSERT INTO accounts (email_hash, pw_hash, pw_salt, sync_key, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(eh, pwHash, salt, syncKey, Date.now()).run();
  return jsonResp({ syncKey }, 201);
}

async function handleSignin(req, env) {
  const body = await readJson(req);
  if (!body) return err('bad json', 400);
  const email = normEmail(body.email);
  const password = body.password || '';
  if (!validEmail(email)) return err('invalid email', 400);
  const eh = await emailHash(email);
  const account = await getAccountByEmailHash(env, eh);
  if (!account) return err('no account for that email', 404);
  const check = await pbkdf2(password, account.pw_salt);
  if (check !== account.pw_hash) return err('wrong password', 401);
  const newKey = randomHex(24);
  await env.DB.prepare('UPDATE accounts SET sync_key = ? WHERE email_hash = ?')
    .bind(newKey, eh).run();
  const dataRow = await env.DB.prepare('SELECT updated_at FROM data WHERE email_hash = ?')
    .bind(eh).first();
  return jsonResp({ syncKey: newKey, lastSync: dataRow ? dataRow.updated_at : null });
}

async function handlePush(req, env) {
  const token = extractToken(req);
  const acc = await getAccountBySyncKey(env, token);
  if (!acc) return err('unauthorized', 401);
  const body = await readJson(req);
  if (!body || !body.profiles) return err('missing profiles', 400);
  const payload = JSON.stringify(body.profiles);
  if (payload.length > 1024 * 1024) return err('too large', 413);
  const updatedAt = Date.now();
  await env.DB.prepare(
    'INSERT OR REPLACE INTO data (email_hash, profiles, updated_at) VALUES (?, ?, ?)'
  ).bind(acc.email_hash, payload, updatedAt).run();
  return jsonResp({ updatedAt });
}

async function handlePull(req, env) {
  const token = extractToken(req);
  const acc = await getAccountBySyncKey(env, token);
  if (!acc) return err('unauthorized', 401);
  const row = await env.DB.prepare('SELECT profiles, updated_at FROM data WHERE email_hash = ?')
    .bind(acc.email_hash).first();
  if (!row) return jsonResp({ profiles: null, updatedAt: null });
  return jsonResp({ profiles: JSON.parse(row.profiles), updatedAt: row.updated_at });
}

async function handleSignout(req, env) {
  const token = extractToken(req);
  const acc = await getAccountBySyncKey(env, token);
  if (!acc) return err('unauthorized', 401);
  await env.DB.prepare('UPDATE accounts SET sync_key = NULL WHERE email_hash = ?')
    .bind(acc.email_hash).run();
  return jsonResp({ ok: true });
}

async function handleReset() {
  return jsonResp({ message: 'Email-based password reset is not yet enabled. Contact the app owner for help.' }, 202);
}

export default {
  async fetch(req, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const headers = corsHeaders(origin);
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
        case '/reset':   response = await handleReset(); break;
        case '/health':  response = jsonResp({ ok: true }); break;
        default:         response = err('not found', 404);
      }
    } catch (e) {
      response = err('server error: ' + e.message, 500);
    }
    const finalHeaders = new Headers(response.headers);
    for (const [k, v] of Object.entries(headers)) finalHeaders.set(k, v);
    return new Response(response.body, { status: response.status, headers: finalHeaders });
  },
};
