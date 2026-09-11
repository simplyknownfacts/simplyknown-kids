import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import worker from '../workers/sync/src/index.js';
import { makeFakeD1 } from './helpers/fake-d1.mjs';

const SIGNUP_URL = 'https://sync.example.workers.dev/signup';
const SIGNIN_URL = 'https://sync.example.workers.dev/signin';
const ROOT = join(import.meta.dirname, '..');

function makeEnv(overrides = {}) {
  return {
    DB: makeFakeD1(),
    SIGNUP_CODE: 'the-real-invite-word',
    SIGNUP_DAILY_PER_IP: 50,
    SIGNUP_DAILY_GLOBAL: 200,
    INVITE_FAIL_LIMIT: 3,
    SIGNIN_FAIL_LIMIT: 50,
    SIGNIN_FAIL_IP_LIMIT: 3,
    ...overrides,
  };
}

function withConcurrentCountBarrier(db, pattern, participants) {
  let waiting = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  return {
    ...db,
    prepare(sql) {
      const statement = db.prepare(sql);
      if (!pattern.test(sql)) return statement;
      return {
        ...statement,
        bind(...args) {
          const bound = statement.bind(...args);
          return {
            ...bound,
            async first() {
              waiting++;
              if (waiting === participants) release();
              await barrier;
              return bound.first();
            },
          };
        },
      };
    },
  };
}

function signupReq({ ip, code, email, password = 'a-real-password' }) {
  return new Request(SIGNUP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ email, password, code }),
  });
}

function signinReq({ ip, email, password = 'wrong-password' }) {
  return new Request(SIGNIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ email, password }),
  });
}

test('concurrent wrong invite guesses cannot all pass the reserve-and-count ceiling', async () => {
  const env = makeEnv({ INVITE_FAIL_LIMIT: 3 });
  env.DB = withConcurrentCountBarrier(
    env.DB,
    /SELECT COUNT\(\*\) AS n FROM invite_fail_log/i,
    8,
  );
  const ip = '203.0.113.80';
  const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => worker.fetch(signupReq({
    ip,
    code: 'wrong-' + i,
    email: `guess-${i}@example.com`,
  }), env)));
  const statuses = responses.map((response) => response.status);

  assert.equal(statuses.filter((status) => status === 403).length, 3,
    'only the configured number of wrong guesses may reach the invite-word refusal');
  assert.equal(statuses.filter((status) => status === 429).length, 5,
    'every concurrent guess beyond the limit must be throttled');
  assert.equal(env.DB._dump().invite_fail_log.length, 3,
    'over-limit reservations must be removed so the retained rows equal the real failure budget');
});

test('an unreadable atomic throttle count fails closed instead of admitting a guess', async () => {
  const env = makeEnv();
  env.DB._corruptNextBatchCount();
  const response = await worker.fetch(signupReq({
    ip: '203.0.113.82',
    code: 'wrong',
    email: 'guess@example.com',
  }), env);
  assert.equal(response.status, 500,
    'a missing D1 count must abort the request, never become an assumed zero');
});

test('one IP rotating fake emails is capped before more password hashes are admitted', async () => {
  const env = makeEnv({ SIGNIN_FAIL_LIMIT: 50, SIGNIN_FAIL_IP_LIMIT: 3 });
  const ip = '198.51.100.80';
  const responses = [];
  for (let i = 0; i < 7; i++) {
    responses.push(await worker.fetch(signinReq({ ip, email: `rotated-${i}@example.com` }), env));
  }
  const statuses = responses.map((response) => response.status);

  assert.deepEqual(statuses.slice(0, 3), [401, 401, 401]);
  assert.deepEqual(statuses.slice(3), [429, 429, 429, 429],
    'the IP-only ceiling must not reset when the caller rotates email addresses');

  const source = readFileSync(join(ROOT, 'workers', 'sync', 'src', 'index.js'), 'utf8');
  const reserveAt = source.indexOf('signin throttle reservation');
  const hashAt = source.indexOf('const check = await pbkdf2');
  assert.ok(reserveAt >= 0 && reserveAt < hashAt,
    'the IP-only reservation/count must happen before the costly PBKDF2 call');
});

test('a successful sign-in removes its provisional reservation and preserves ordinary family use', async () => {
  const env = makeEnv({ SIGNIN_FAIL_LIMIT: 8, SIGNIN_FAIL_IP_LIMIT: 8 });
  const email = 'family@example.com';
  const password = 'the-real-family-password';
  const ip = '203.0.113.81';
  const signup = await worker.fetch(signupReq({ ip, code: env.SIGNUP_CODE, email, password }), env);
  assert.equal(signup.status, 201);

  assert.equal((await worker.fetch(signinReq({ ip, email, password }), env)).status, 200);
  assert.equal((env.DB._dump().signin_fail_log_v2 || []).length, 0,
    'a correct password must not consume a failed-sign-in allowance');
});

test('scheduled cleanup expires only stale rows from all three bounded throttle logs', async () => {
  const env = makeEnv();
  const now = Date.now();
  await env.DB.prepare('INSERT INTO invite_fail_log (id, ip_hash, created_at) VALUES (?, ?, ?)')
    .bind('iv-old', 'ip', now - 2 * 60 * 60 * 1000).run();
  await env.DB.prepare('INSERT INTO invite_fail_log (id, ip_hash, created_at) VALUES (?, ?, ?)')
    .bind('iv-new', 'ip', now).run();
  await env.DB.prepare('INSERT INTO signin_fail_log_v2 (id, email_hash, ip_hash, created_at) VALUES (?, ?, ?, ?)')
    .bind('si-old', 'email', 'ip', now - 30 * 60 * 1000).run();
  await env.DB.prepare('INSERT INTO signin_fail_log_v2 (id, email_hash, ip_hash, created_at) VALUES (?, ?, ?, ?)')
    .bind('si-new', 'email', 'ip', now).run();
  await env.DB.prepare('INSERT INTO signup_log (id, ip_hash, created_at) VALUES (?, ?, ?)')
    .bind('su-old', 'ip', now - 25 * 60 * 60 * 1000).run();
  await env.DB.prepare('INSERT INTO signup_log (id, ip_hash, created_at) VALUES (?, ?, ?)')
    .bind('su-new', 'ip', now).run();

  let cleanup;
  worker.scheduled({ scheduledTime: now }, env, { waitUntil(promise) { cleanup = promise; } });
  await cleanup;
  const dump = env.DB._dump();
  assert.deepEqual(dump.invite_fail_log.map((row) => row.id), ['iv-new']);
  assert.deepEqual(dump.signin_fail_log_v2.map((row) => row.id), ['si-new']);
  assert.deepEqual(dump.signup_log.map((row) => row.id), ['su-new']);
});

test('reviewable schema declares the lookup and expiry indexes used by throttles', () => {
  const schema = readFileSync(join(ROOT, 'workers', 'sync', 'schema.sql'), 'utf8');
  for (const index of [
    'idx_invite_fail_ip_created',
    'idx_invite_fail_created',
    'idx_signin_fail_email_ip_created',
    'idx_signin_fail_ip_created',
    'idx_signin_fail_created',
    'idx_signup_ip_created',
    'idx_signup_created',
  ]) {
    assert.match(schema, new RegExp(`CREATE INDEX IF NOT EXISTS ${index}\\b`), `${index} is missing`);
  }
});

test('dev and production Worker configs both schedule throttle-log expiry', () => {
  const production = readFileSync(join(ROOT, 'workers', 'sync', 'wrangler.toml'), 'utf8');
  const development = readFileSync(join(ROOT, 'workers', 'sync', 'wrangler.dev.toml'), 'utf8');
  for (const [name, config] of [['production', production], ['development', development]]) {
    assert.match(config, /\[triggers\][\s\S]*?crons\s*=\s*\[\s*"17 \*\/6 \* \* \*"\s*\]/,
      `${name} Worker config must run the same periodic cleanup handler`);
  }
});
