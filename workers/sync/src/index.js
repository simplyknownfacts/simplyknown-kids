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

// Signup throttle store. Only a HASH of the caller's address is kept, never the
// address itself: this is a children's app and it should hold as little about
// anyone as it can get away with.
async function suEnsureTable(env) {
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS signup_log (id TEXT PRIMARY KEY, ip_hash TEXT, created_at INTEGER)'
  ).run();
}

async function handleSignup(req, env) {
  const body = await readJson(req);
  if (!body) return err('bad json', 400);
  const email = normEmail(body.email);
  const password = body.password || '';
  if (!validEmail(email)) return err('invalid email', 400);
  if (password.length < 8) return err('password must be 8+ chars', 400);

  // Signup is open to anyone, and an account is the key to paid voice generation.
  // Two ceilings so a script cannot mint accounts in bulk. Both are deliberately
  // generous for a family app and stingy for a robot.
  await suEnsureTable(env);
  const suSince = Date.now() - 24 * 3600 * 1000;
  const ipHash = await sha256Hex('ip-v1:' + (req.headers.get('CF-Connecting-IP') || 'unknown'));
  const perIp = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM signup_log WHERE ip_hash = ? AND created_at > ?'
  ).bind(ipHash, suSince).first();
  if (perIp && perIp.n >= Number(env.SIGNUP_DAILY_PER_IP || 3)) {
    return err('too many accounts created from here today', 429);
  }
  const allSignups = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM signup_log WHERE created_at > ?'
  ).bind(suSince).first();
  if (allSignups && allSignups.n >= Number(env.SIGNUP_DAILY_GLOBAL || 20)) {
    console.warn('signup: global daily cap hit (' + allSignups.n + ')');
    return err('sign-ups are resting — try again tomorrow', 429);
  }

  const eh = await emailHash(email);
  const existing = await getAccountByEmailHash(env, eh);
  if (existing) return err('account exists — sign in instead', 409);
  const salt = randomHex(16);
  const pwHash = await pbkdf2(password, salt);
  const syncKey = randomHex(24);
  await env.DB.prepare(
    'INSERT INTO accounts (email_hash, pw_hash, pw_salt, sync_key, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(eh, pwHash, salt, syncKey, Date.now()).run();
  // Record the attempt only after it succeeded, so a typo'd email does not burn
  // a family's allowance.
  await env.DB.prepare('INSERT INTO signup_log (id, ip_hash, created_at) VALUES (?, ?, ?)')
    .bind(randomHex(12), ipHash, Date.now()).run();
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

// YouTube RSS feed proxy — fetches a channel's videos.xml (no API key needed) and returns video IDs.
// Result is cached for 10 minutes via Cache API so we don't hammer YouTube.
async function handleYTFeed(req) {
  const url = new URL(req.url);
  const channelId = url.searchParams.get('channel');
  if (!channelId || !/^UC[A-Za-z0-9_-]+$/.test(channelId)) {
    return jsonResp({ error: 'bad channel id' }, 400);
  }
  const cache = caches.default;
  const cacheKey = new Request('https://yt-feed-cache.invalid/v4/' + channelId);
  const cached = await cache.match(cacheKey);
  if (cached && !url.searchParams.get('nocache')) return cached;

  const ytUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const ytRes = await fetch(ytUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/atom+xml, application/xml, text/xml, */*',
    },
  });
  if (!ytRes.ok) return jsonResp({ error: 'feed fetch failed: ' + ytRes.status }, 502);
  const xml = await ytRes.text();
  const ids = [...xml.matchAll(/<yt:videoId>([^<]+)<\/yt:videoId>/g)].map(m => m[1]);
  const titles = [...xml.matchAll(/<entry>[\s\S]*?<title>([^<]+)<\/title>/g)].map(m => m[1]);
  // Filter to only embeddable videos. Many "made for kids" channels disable
  // embedding on certain uploads. YouTube's oEmbed endpoint returns 401 in
  // that case. Check top 15 in parallel, keep only those that work.
  const candidates = ids.slice(0, 15);
  const checks = await Promise.all(candidates.map(async id => {
    try {
      const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
      return r.ok ? id : null;
    } catch { return null; }
  }));
  const embeddableSet = new Set(checks.filter(Boolean));
  const videos = ids
    .filter(id => embeddableSet.has(id))
    .map(id => ({ id, title: titles[ids.indexOf(id)] || '' }));
  const debug = url.searchParams.get('debug');
  const body = JSON.stringify(debug
    ? { videos, all: candidates, embeddable: [...embeddableSet], len: xml.length }
    : { videos });
  const resp = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=600',
    },
  });
  await cache.put(cacheKey, resp.clone());
  return resp;
}

// ─── Name-voice generation ("~10¢ real voice" add-kid option) ────────────────
// POST /voice-name  Auth: Bearer <syncKey>, { name } → generates the 3 greeting
//   phrases × 4 voices via ElevenLabs (key = Worker secret ELEVENLABS_API_KEY),
//   stores mp3s in D1 name_clips. Idempotent per (name, voice, i) — re-adding a
//   name is free. Rate-limited to 5 NEW names per account per 24h.
// GET  /voice-clip?name=&voice=&i=0..2 → audio/mpeg (public read; clips are just
//   a first name spoken aloud — cache hard so repeat plays are free).
// NOTE: girl/boy static clips in the app are pitch-shifted +3 semitones offline
// (ffmpeg); Workers can't run ffmpeg, so name clips play at ElevenLabs' natural
// pitch. Greetings are standalone (never stitched mid-sentence), so it's fine.

const NV_VOICES = {
  girl:  'EXAVITQu4vr4xnSDxMaL',
  boy:   'TX3LPaxmHKxFdv7VOQHJ',
  woman: '21m00Tcm4TlvDq8ikWAM',
  man:   'pNInz6obpgDQGcFmaJgB',
};
const NV_MODEL = 'eleven_turbo_v2_5';
function nvPhrases(name) {
  return [
    'Hi ' + name + '!',
    'Hi ' + name + "! Let's play!",
    'Hi ' + name + '! Welcome to your play space.',
  ];
}
function nvNormName(n) {
  n = (n || '').trim();
  if (!/^[A-Za-z][A-Za-z' -]{0,19}$/.test(n)) return null;
  // Title-case first letter, keep the rest as typed (matches profile display).
  return n[0].toUpperCase() + n.slice(1);
}
async function nvEnsureTable(env) {
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS name_clips (clip_key TEXT PRIMARY KEY, name_norm TEXT, voice TEXT, i INTEGER, mp3 BLOB, acct_hash TEXT, created_at INTEGER)'
  ).run();
}

async function handleVoiceName(req, env) {
  const token = extractToken(req);
  const acc = await getAccountBySyncKey(env, token);
  if (!acc) return err('unauthorized', 401);
  if (!env.ELEVENLABS_API_KEY) return err('voice generation not configured', 503);
  const body = await readJson(req);
  const name = nvNormName(body && body.name);
  if (!name) return err('invalid name (letters, max 20 chars)', 400);
  await nvEnsureTable(env);

  // Already generated (any account)? Then this is free — report ready.
  const have = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM name_clips WHERE name_norm = ?'
  ).bind(name).first();
  if (have && have.n >= 12) return jsonResp({ ok: true, name, ready: true, generated: 0 });

  const since = Date.now() - 24 * 3600 * 1000;

  // GLOBAL money ceiling, checked first.
  //
  // The per-account limit below is not a spending cap on its own: signup is open,
  // accounts are free and unlimited, so anyone can mint as many accounts as they
  // like and get 5 more names with each. This ceiling is what actually bounds the
  // bill, because it counts every new name generated by everyone. Each name costs
  // 12 ElevenLabs calls (3 phrases x 4 voices), so this caps the whole service at
  // VOICE_DAILY_GLOBAL x 12 paid calls a day no matter how many accounts exist.
  //
  // The key is shared with another project, so an exhausted balance breaks more
  // than this app.
  const globalCap = Number(env.VOICE_DAILY_GLOBAL || 20);
  const globalUsed = await env.DB.prepare(
    'SELECT COUNT(DISTINCT name_norm) AS n FROM name_clips WHERE created_at > ?'
  ).bind(since).first();
  if (globalUsed && globalUsed.n >= globalCap) {
    console.warn('voice: global daily cap hit (' + globalUsed.n + '/' + globalCap + ')');
    return err('voice generation is resting — try again tomorrow', 429);
  }

  // Per-account limit: max 5 NEW names per account per 24h.
  const recent = await env.DB.prepare(
    'SELECT COUNT(DISTINCT name_norm) AS n FROM name_clips WHERE acct_hash = ? AND created_at > ?'
  ).bind(acc.email_hash, since).first();
  if (recent && recent.n >= 5) return err('daily limit reached — try again tomorrow', 429);

  const phrases = nvPhrases(name);
  let generated = 0;
  for (const [voice, voiceId] of Object.entries(NV_VOICES)) {
    for (let i = 0; i < phrases.length; i++) {
      const clipKey = await sha256Hex('nv1:' + name + '|' + voice + '|' + i);
      const exists = await env.DB.prepare('SELECT clip_key FROM name_clips WHERE clip_key = ?')
        .bind(clipKey).first();
      if (exists) continue;
      const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, {
        method: 'POST',
        headers: {
          'xi-api-key': env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text: phrases[i],
          model_id: NV_MODEL,
          voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.30 },
        }),
      });
      if (!r.ok) return err('voice generation failed (' + r.status + ') after ' + generated + ' clips — tap Yes again to resume', 502);
      const buf = await r.arrayBuffer();
      await env.DB.prepare(
        'INSERT INTO name_clips (clip_key, name_norm, voice, i, mp3, acct_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(clipKey, name, voice, i, buf, acc.email_hash, Date.now()).run();
      generated++;
    }
  }
  return jsonResp({ ok: true, name, ready: true, generated });
}

async function handleVoiceClip(req, env) {
  const url = new URL(req.url);
  const name = nvNormName(url.searchParams.get('name'));
  const voice = url.searchParams.get('voice');
  const i = parseInt(url.searchParams.get('i'), 10);
  if (!name || !NV_VOICES[voice] || !(i >= 0 && i <= 2)) return err('bad params', 400);
  await nvEnsureTable(env);
  const clipKey = await sha256Hex('nv1:' + name + '|' + voice + '|' + i);
  const row = await env.DB.prepare('SELECT mp3 FROM name_clips WHERE clip_key = ?')
    .bind(clipKey).first();
  if (!row || !row.mp3) return err('no clip', 404);
  // D1 returns BLOB as ArrayBuffer (or array) depending on driver — normalise.
  const bytes = row.mp3 instanceof ArrayBuffer ? row.mp3 : new Uint8Array(row.mp3).buffer;
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
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
        case '/yt-feed': response = await handleYTFeed(req); break;
        case '/voice-name': response = await handleVoiceName(req, env); break;
        case '/voice-clip': response = await handleVoiceClip(req, env); break;
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
