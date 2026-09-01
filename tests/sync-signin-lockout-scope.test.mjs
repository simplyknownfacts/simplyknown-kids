// HIGH finding (relayed by master, live security review 2026-09-01, verified
// against workers/sync/src/index.js): the sign-in failed-attempt lockout was
// keyed SOLELY on the email address. That closes password brute-forcing, but
// it also means anyone who merely knows (or guesses) a family's email can
// send a handful of WRONG-password requests and lock the real family out for
// 15 minutes -- repeatably, for free, forever, from anywhere. The very
// mechanism meant to protect the account becomes a denial-of-service weapon
// against it.
//
// No network and no Cloudflare account needed: the worker module is imported
// directly and driven with a fake D1 (tests/helpers/fake-d1.mjs), same
// pattern as tests/sync-signup-invite-throttle.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/sync/src/index.js';
import { makeFakeD1 } from './helpers/fake-d1.mjs';

const URL_SIGNUP = 'https://simplyknown-kids-sync.example.workers.dev/signup';
const URL_SIGNIN = 'https://simplyknown-kids-sync.example.workers.dev/signin';

function makeEnv(overrides = {}) {
  return {
    DB: makeFakeD1(),
    SIGNUP_CODE: 'the-real-invite-word',
    SIGNUP_DAILY_PER_IP: 50,
    SIGNUP_DAILY_GLOBAL: 200,
    INVITE_FAIL_LIMIT: 50,
    SIGNIN_FAIL_LIMIT: 8,
    ...overrides,
  };
}

async function createAccount(env, { ip = '203.0.113.20', email, password }) {
  const res = await worker.fetch(new Request(URL_SIGNUP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ email, password, code: env.SIGNUP_CODE }),
  }), env);
  assert.equal(res.status, 201, 'test setup: account creation should succeed');
}

function signinReq({ ip, email, password }) {
  return new Request(URL_SIGNIN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ email, password }),
  });
}

test('a stranger sending wrong passwords cannot lock the real family out of their own account', async () => {
  const env = makeEnv();
  const email = 'family@example.com';
  const realPassword = 'the-real-family-password-1';
  await createAccount(env, { email, password: realPassword });

  const attackerIp = '198.51.100.5';
  const familyIp = '203.0.113.21';

  // The attacker never knows the password -- they don't need to, to weaponize
  // the lockout. 8 wrong guesses is enough to trip SIGNIN_FAIL_LIMIT.
  for (let i = 0; i < 8; i++) {
    const res = await worker.fetch(
      signinReq({ ip: attackerIp, email, password: 'guess-' + i }), env);
    assert.equal(res.status, 401, `attacker guess ${i} should just be told wrong, not throttled yet`);
  }

  // The REAL family, from their OWN address, typing their OWN correct
  // password, must still get in. If this comes back 429, the attacker just
  // denied a real family access to their kids' saved profiles for free.
  const familyRes = await worker.fetch(
    signinReq({ ip: familyIp, email, password: realPassword }), env);
  assert.equal(familyRes.status, 200,
    'the family must be able to sign in from their own address even while an attacker is failing elsewhere');
  const body = await familyRes.json();
  assert.ok(body.syncKey, 'a successful sign-in should return a syncKey');
});

test('a single caller repeatedly guessing wrong passwords against one email is still throttled', async () => {
  const env = makeEnv({ SIGNIN_FAIL_LIMIT: 5 });
  const email = 'family2@example.com';
  await createAccount(env, { email, password: 'the-real-password-2' });
  const ip = '198.51.100.9';

  const statuses = [];
  for (let i = 0; i < 7; i++) {
    const res = await worker.fetch(signinReq({ ip, email, password: 'wrong-' + i }), env);
    statuses.push(res.status);
  }
  assert.deepEqual(statuses.slice(0, 5), [401, 401, 401, 401, 401],
    'the first 5 wrong guesses from one caller should each just be told wrong');
  assert.ok(statuses.slice(5).every((s) => s === 429),
    `guesses 6-7 from the SAME caller should be throttled, got: ${statuses.slice(5).join(', ')}`);
});

test('a couple of real typos do not lock the family out of their own device/address', async () => {
  const env = makeEnv({ SIGNIN_FAIL_LIMIT: 5 });
  const email = 'family3@example.com';
  const realPassword = 'the-real-password-3';
  await createAccount(env, { email, password: realPassword });
  const ip = '203.0.113.22';

  await worker.fetch(signinReq({ ip, email, password: 'the-real-passwrod-3' }), env);
  await worker.fetch(signinReq({ ip, email, password: 'the-real-password-e' }), env);
  const res = await worker.fetch(signinReq({ ip, email, password: realPassword }), env);
  assert.equal(res.status, 200, 'the real password should still work after a couple of typos');
});

test('a wrong password against an email with no account gives the same generic refusal (enumeration still closed)', async () => {
  const env = makeEnv();
  const res = await worker.fetch(
    signinReq({ ip: '198.51.100.11', email: 'nobody-here@example.com', password: 'anything' }), env);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.match(body.error, /email or password is not right/i);
});
