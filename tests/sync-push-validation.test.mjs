// Codex 0825-11, MED. Two real gaps in workers/sync/src/index.js:
// (1) handlePush accepted ANY truthy body.profiles -- a string, a number, a
//     deeply nested object under the 1MB cap all passed, then got stored
//     verbatim and handed back to every device that pulls it.
// (2) the top-level catch-all handed the raw exception message straight
//     back to the caller -- a real risk on a Worker whose errors can carry
//     internal detail (a D1 column name, a query fragment).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/sync/src/index.js';
import { makeFakeD1 } from './helpers/fake-d1.mjs';

const URL_SIGNUP = 'https://simplyknown-kids-sync.example.workers.dev/signup';
const URL_PUSH = 'https://simplyknown-kids-sync.example.workers.dev/push';
const URL_PULL = 'https://simplyknown-kids-sync.example.workers.dev/pull';

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

async function createAccount(env, email) {
  const res = await worker.fetch(new Request(URL_SIGNUP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.40' },
    body: JSON.stringify({ email, password: 'a-real-password-1', code: env.SIGNUP_CODE }),
  }), env);
  assert.equal(res.status, 201, 'test setup: account creation should succeed');
  return (await res.json()).syncKey;
}

function pushReq(token, profiles) {
  return new Request(URL_PUSH, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ profiles }),
  });
}

test('push refuses a non-array profiles value (string)', async () => {
  const env = makeEnv();
  const token = await createAccount(env, 'family1@example.com');
  const res = await worker.fetch(pushReq(token, 'not-an-array'), env);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /must be an array/i);
});

test('push refuses a non-array profiles value (a plain object)', async () => {
  const env = makeEnv();
  const token = await createAccount(env, 'family2@example.com');
  const res = await worker.fetch(pushReq(token, { id: 'sneaky', not: 'an array' }), env);
  assert.equal(res.status, 400);
});

test('push refuses more than the profile-count cap', async () => {
  const env = makeEnv();
  const token = await createAccount(env, 'family3@example.com');
  const tooMany = Array.from({ length: 21 }, (_, i) => ({ id: 'kid' + i, name: 'Kid ' + i }));
  const res = await worker.fetch(pushReq(token, tooMany), env);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /too many profiles/i);
});

test('push still works normally for a real, reasonable family', async () => {
  const env = makeEnv();
  const token = await createAccount(env, 'family4@example.com');
  const profiles = [{ id: 'kid1', name: 'Ava' }, { id: 'kid2', name: 'Ben' }];
  const res = await worker.fetch(pushReq(token, profiles), env);
  assert.equal(res.status, 200);

  const pullRes = await worker.fetch(new Request(URL_PULL, { headers: { Authorization: 'Bearer ' + token } }), env);
  assert.equal(pullRes.status, 200);
  const pulled = await pullRes.json();
  assert.deepEqual(pulled.profiles, profiles);
});

test('an unhandled server error never leaks the raw exception message to the caller', async () => {
  const env = makeEnv();
  const token = await createAccount(env, 'family5@example.com');
  // Inject a failure whose message looks like real internal detail -- exactly
  // the kind of string that must never reach the client.
  env.DB._failNextRunMatching(/^INSERT OR REPLACE INTO data/i,
    new Error('D1_ERROR: column "profiles_v2" does not exist in table "data" at row 4'));
  const res = await worker.fetch(pushReq(token, [{ id: 'kid1', name: 'Ava' }]), env);
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.doesNotMatch(body.error, /column|D1_ERROR|profiles_v2|table "data"/,
    'the response leaked real internal error detail: ' + body.error);
  assert.equal(body.error, 'server error');
});
