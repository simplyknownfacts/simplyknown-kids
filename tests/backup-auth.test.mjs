// Pins the fix for Codex finding #1 (2026-08-25): the backup Worker's manual
// /run trigger used to be reachable by anyone on the internet, so a stranger
// could make us dump the whole D1 database to R2 over and over.
//
// Run:  node --test tests/backup-auth.test.mjs
//
// No network and no Cloudflare account needed — we import the Worker module and
// call its fetch() with a fake env, so this is safe to run in CI.
import { test } from 'node:test';
import assert from 'node:assert';
import worker from '../workers/backup-worker/index.js';

const SECRET = 'test-secret-value';
const URL_RUN = 'https://simplyknown-kids-backup.example.workers.dev/run';
const URL_ROOT = 'https://simplyknown-kids-backup.example.workers.dev/';

// Minimal stand-ins for the D1 and R2 bindings. `puts` records every write, so a
// test can prove the backup did NOT run, not just that the status code was 401.
function fakeEnv(secret) {
  const puts = [];
  return {
    BACKUP_SECRET: secret,
    puts,
    DB: { prepare: () => ({ all: async () => ({ results: [{ name: 'accounts' }] }) }) },
    BACKUPS: { put: async (key, body) => { puts.push({ key, body }); } },
  };
}

const run = (env, headers) => worker.fetch(new Request(URL_RUN, { headers }), env);

test('/run with no secret header is rejected and does not back up', async () => {
  const env = fakeEnv(SECRET);
  const res = await run(env, {});
  assert.strictEqual(res.status, 401);
  assert.strictEqual(env.puts.length, 0);
});

test('/run with the wrong secret is rejected and does not back up', async () => {
  const env = fakeEnv(SECRET);
  const res = await run(env, { 'x-backup-secret': 'wrong-value-here' });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(env.puts.length, 0);
});

test('/run with a same-length wrong secret is still rejected', async () => {
  const env = fakeEnv(SECRET);
  const res = await run(env, { 'x-backup-secret': 'x'.repeat(SECRET.length) });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(env.puts.length, 0);
});

test('/run with the correct secret backs up and reports the key', async () => {
  const env = fakeEnv(SECRET);
  const res = await run(env, { 'x-backup-secret': SECRET });
  assert.strictEqual(res.status, 200);
  assert.match(await res.text(), /^backup written: kids\/backup-/);
  assert.strictEqual(env.puts.length, 1);
  assert.match(env.puts[0].key, /^kids\/backup-.+\.json$/);
});

// Fail closed: if the secret was never set on the Worker, /run must refuse
// rather than fall through to "no secret configured, so anything matches".
test('/run is refused when BACKUP_SECRET is not configured', async () => {
  const env = fakeEnv(undefined);
  const noHeader = await run(env, {});
  const emptyHeader = await run(env, { 'x-backup-secret': '' });
  assert.strictEqual(noHeader.status, 401);
  assert.strictEqual(emptyHeader.status, 401);
  assert.strictEqual(env.puts.length, 0);
});

test('any other path returns the public info line and backs up nothing', async () => {
  const env = fakeEnv(SECRET);
  const res = await worker.fetch(new Request(URL_ROOT), env);
  assert.strictEqual(res.status, 200);
  assert.match(await res.text(), /backup worker/);
  assert.strictEqual(env.puts.length, 0);
});
