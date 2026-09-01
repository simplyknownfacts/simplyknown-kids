// HIGH finding (relayed by master, live security review 2026-09-01, verified
// against workers/sync/src/index.js): the invite word gates account creation
// -- and an account is the key to paid ElevenLabs voice generation -- but a
// wrong guess was checked with a constant-time compare and otherwise cost the
// caller NOTHING: never logged, never throttled, never slowed. A script could
// try an entire wordlist against /signup for free, forever.
//
// No network and no Cloudflare account needed: the worker module is imported
// directly and driven with a fake D1 (tests/helpers/fake-d1.mjs), the same
// pattern tests/backup-auth.test.mjs already uses for the backup worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/sync/src/index.js';
import { makeFakeD1 } from './helpers/fake-d1.mjs';

const URL_SIGNUP = 'https://simplyknown-kids-sync.example.workers.dev/signup';

function makeEnv(overrides = {}) {
  return {
    DB: makeFakeD1(),
    SIGNUP_CODE: 'correct-horse-battery-staple',
    SIGNUP_DAILY_PER_IP: 50,
    SIGNUP_DAILY_GLOBAL: 200,
    INVITE_FAIL_LIMIT: 5,
    ...overrides,
  };
}

function signupReq({ ip = '203.0.113.9', code = 'wrong-guess', email = 'parent@example.com', password = 'a-real-password-1' } = {}) {
  return new Request(URL_SIGNUP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ email, password, code }),
  });
}

test('a wrong invite word is refused, every time, before any throttle kicks in', async () => {
  const env = makeEnv();
  const res = await worker.fetch(signupReq({ code: 'wrong-guess' }), env);
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.match(body.error, /invite word/i);
});

test('repeated wrong guesses from the same caller are eventually throttled (429), not answered forever', async () => {
  const env = makeEnv({ INVITE_FAIL_LIMIT: 5 });
  const ip = '203.0.113.10';
  const statuses = [];
  // A wordlist attack: many guesses, different emails so the (separate,
  // success-only) account-creation caps never enter into it.
  for (let i = 0; i < 8; i++) {
    const res = await worker.fetch(
      signupReq({ ip, code: 'guess-' + i, email: `attacker${i}@example.com` }),
      env,
    );
    statuses.push(res.status);
  }
  // First 5 wrong guesses are each individually refused (403, "not right").
  assert.deepEqual(statuses.slice(0, 5), [403, 403, 403, 403, 403],
    'the first 5 wrong guesses should each be told the word is wrong');
  // From the 6th onward, the caller is throttled, not still being told to
  // keep guessing -- an unthrottled 403 forever is exactly the free oracle.
  assert.ok(statuses.slice(5).every((s) => s === 429),
    `guesses 6-8 should be throttled (429), got: ${statuses.slice(5).join(', ')}`);
});

test('the guess throttle is keyed per caller (IP), not shared globally', async () => {
  const env = makeEnv({ INVITE_FAIL_LIMIT: 3 });
  const attackerIp = '203.0.113.11';
  const familyIp = '203.0.113.12';

  for (let i = 0; i < 4; i++) {
    await worker.fetch(signupReq({ ip: attackerIp, code: 'guess-' + i, email: `a${i}@example.com` }), env);
  }
  const attackerBlocked = await worker.fetch(
    signupReq({ ip: attackerIp, code: 'guess-more', email: 'a-more@example.com' }), env);
  assert.equal(attackerBlocked.status, 429, 'the exhausted IP should be throttled');

  // A different family, from a different address, typing the CORRECT word
  // must not be caught in the attacker's throttle.
  const familyRes = await worker.fetch(
    signupReq({ ip: familyIp, code: env.SIGNUP_CODE, email: 'family@example.com' }), env);
  assert.equal(familyRes.status, 201, 'an unrelated caller with the right word must still get through');
});

test('a few real typos do not lock a family out of their own invite word', async () => {
  const env = makeEnv({ INVITE_FAIL_LIMIT: 5 });
  const ip = '203.0.113.13';
  // Two fat-fingered attempts, well under the limit...
  await worker.fetch(signupReq({ ip, code: 'korrect-horse', email: 'family2@example.com' }), env);
  await worker.fetch(signupReq({ ip, code: 'correct-hourse', email: 'family2@example.com' }), env);
  // ...then the real word, from the same address, must still work.
  const res = await worker.fetch(
    signupReq({ ip, code: env.SIGNUP_CODE, email: 'family2@example.com' }), env);
  assert.equal(res.status, 201, 'the account should be created once the correct word is typed');
  const body = await res.json();
  assert.ok(body.syncKey, 'a real signup should still return a syncKey');
});

test('wrong invite-word guesses do not burn the account-creation IP/global caps', async () => {
  const env = makeEnv({ INVITE_FAIL_LIMIT: 50, SIGNUP_DAILY_PER_IP: 3 });
  const ip = '203.0.113.14';
  for (let i = 0; i < 10; i++) {
    await worker.fetch(signupReq({ ip, code: 'nope-' + i, email: `x${i}@example.com` }), env);
  }
  // signup_log only ever records a SUCCESSFUL signup (existing, deliberate
  // design so a typo'd email doesn't cost a family their daily allowance) --
  // the new invite-guess throttle must not change that.
  const dump = env.DB._dump();
  assert.equal((dump.signup_log || []).length, 0,
    'ten wrong guesses should not have written anything to signup_log');
  // And the account-creation cap (3/day for this IP) must still be fully
  // available for a real signup right after.
  const res = await worker.fetch(
    signupReq({ ip, code: env.SIGNUP_CODE, email: 'real-family@example.com' }), env);
  assert.equal(res.status, 201, 'the per-IP signup cap must be untouched by prior wrong guesses');
});
