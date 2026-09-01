// HIGH finding (relayed by master, live security review 2026-09-01, verified
// against workers/sync/src/index.js): account deletion ran as TWO separate
// D1 statements -- `DELETE FROM accounts` then `DELETE FROM data` -- not one
// atomic unit. If the second failed (a dropped connection, a D1 hiccup), the
// login was already gone but the child's synced data stayed forever, AND the
// parent could no longer sign in to even retry, because their account no
// longer existed. A half-finished delete is worse than no delete.
//
// No network and no Cloudflare account needed: the worker module is imported
// directly and driven with a fake D1 (tests/helpers/fake-d1.mjs) whose
// batch() mirrors D1's real atomic-batch semantics and can inject a failure
// into one statement to prove the other is (or isn't) rolled back with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/sync/src/index.js';
import { makeFakeD1 } from './helpers/fake-d1.mjs';

const URL_SIGNUP = 'https://simplyknown-kids-sync.example.workers.dev/signup';
const URL_DELETE = 'https://simplyknown-kids-sync.example.workers.dev/delete-account';
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

async function createAccount(env, { email, password }) {
  const res = await worker.fetch(new Request(URL_SIGNUP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.30' },
    body: JSON.stringify({ email, password, code: env.SIGNUP_CODE }),
  }), env);
  assert.equal(res.status, 201, 'test setup: account creation should succeed');
  return (await res.json()).syncKey;
}

function deleteReq(token) {
  return new Request(URL_DELETE, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
  });
}

test('if the data delete fails, the account delete is rolled back too (nothing orphaned, nothing half-gone)', async () => {
  const env = makeEnv();
  const email = 'family4@example.com';
  const token = await createAccount(env, { email, password: 'the-real-password-4' });

  // Push some real data so there's something to (fail to) delete.
  await worker.fetch(new Request('https://x.example.workers.dev/push', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ profiles: [{ id: 'kid-1', name: 'Test Kid' }] }),
  }), env);

  env.DB._failNextRunMatching(/^DELETE FROM data WHERE/i);
  const res = await worker.fetch(deleteReq(token), env);
  // Whatever status a mid-batch failure surfaces as, it must not be a quiet
  // 200 "ok" over a half-finished delete.
  assert.notEqual(res.status, 200, 'a failed delete must not report success');

  const dump = env.DB._dump();
  const stillHasAccount = (dump.accounts || []).some((a) => a.email_hash);
  const stillHasData = (dump.data || []).some((d) => d.email_hash);
  assert.equal(stillHasAccount, true,
    'the account row must still exist -- it must not be deleted while the data row survives (that locks the family out permanently with their data orphaned)');
  assert.equal(stillHasData, true,
    'the data row must still exist -- a rolled-back delete means BOTH rows survive, not just one');

  // And concretely: the family must still be able to sign in with their
  // original password, proving the account genuinely was not removed.
  const signinRes = await worker.fetch(new Request(URL_SIGNIN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.31' },
    body: JSON.stringify({ email, password: 'the-real-password-4' }),
  }), env);
  assert.equal(signinRes.status, 200, 'the family must still be able to sign in after a failed delete');
});

test('a normal, fully-successful delete removes both the account and its data', async () => {
  const env = makeEnv();
  const email = 'family5@example.com';
  const token = await createAccount(env, { email, password: 'the-real-password-5' });
  await worker.fetch(new Request('https://x.example.workers.dev/push', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ profiles: [{ id: 'kid-2', name: 'Another Kid' }] }),
  }), env);

  const res = await worker.fetch(deleteReq(token), env);
  assert.equal(res.status, 200);

  const dump = env.DB._dump();
  assert.equal((dump.accounts || []).length, 0, 'the account row should be gone');
  assert.equal((dump.data || []).length, 0, 'the data row should be gone');
});
