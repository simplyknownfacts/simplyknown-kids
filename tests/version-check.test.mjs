// Codex 0903-2, HIGH. scripts/dev-verify.mjs's stamp used to prove only that
// SOMETHING answered correctly at BASE -- BASE can be set to anywhere via an
// env var, and nothing tied the commit being stamped to what was actually
// live there. A stale dev1, or BASE pointed at localhost while the real dev
// deployment sat versions behind, would still pass and stamp the CURRENT
// commit as verified. scripts/lib/version-check.mjs is the fix, extracted so
// it can be unit tested with a fake fetch instead of needing a real server
// (the expensive full pipeline -- npm test + a real browser drive -- stays
// proven by literally running dev-verify.mjs, per tests/dev-verify.test.mjs's
// own header).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractVersion, checkLiveVersionMatches } from '../scripts/lib/version-check.mjs';

function fakeFetch(response) {
  return async () => response;
}

test('extractVersion reads APP_VERSION out of real js/version.js source', () => {
  assert.equal(extractVersion("const APP_VERSION = '1.2.3';\n"), '1.2.3');
});

test('extractVersion returns null for unreadable source', () => {
  assert.equal(extractVersion('not js at all'), null);
  assert.equal(extractVersion(''), null);
  assert.equal(extractVersion(null), null);
});

test('checkLiveVersionMatches passes when the live version matches', async () => {
  const fetchImpl = fakeFetch({ ok: true, text: async () => "const APP_VERSION = '1.0.0';\n" });
  const res = await checkLiveVersionMatches('http://localhost:8790', '1.0.0', fetchImpl);
  assert.equal(res.ok, true);
});

test('checkLiveVersionMatches fails when the live version does not match (the real bug)', async () => {
  const fetchImpl = fakeFetch({ ok: true, text: async () => "const APP_VERSION = '0.9.0';\n" });
  const res = await checkLiveVersionMatches('http://localhost:8790', '1.0.0', fetchImpl);
  assert.equal(res.ok, false);
  assert.match(res.reason, /0\.9\.0/);
});

test('checkLiveVersionMatches fails on a non-OK HTTP response', async () => {
  const fetchImpl = fakeFetch({ ok: false, status: 404, text: async () => '' });
  const res = await checkLiveVersionMatches('http://localhost:8790', '1.0.0', fetchImpl);
  assert.equal(res.ok, false);
  assert.match(res.reason, /404/);
});

test('checkLiveVersionMatches fails when the fetch itself throws (BASE unreachable)', async () => {
  const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
  const res = await checkLiveVersionMatches('http://localhost:1', '1.0.0', fetchImpl);
  assert.equal(res.ok, false);
  assert.match(res.reason, /ECONNREFUSED/);
});

test('checkLiveVersionMatches fails when the response has no readable APP_VERSION', async () => {
  const fetchImpl = fakeFetch({ ok: true, text: async () => '<html>404</html>' });
  const res = await checkLiveVersionMatches('http://localhost:8790', '1.0.0', fetchImpl);
  assert.equal(res.ok, false);
  assert.match(res.reason, /no readable APP_VERSION/);
});
