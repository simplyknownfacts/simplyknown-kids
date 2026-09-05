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
import { extractVersion, checkLiveVersionMatches, checkLiveCommitMatches } from '../scripts/lib/version-check.mjs';

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

// Codex 0905-3, HIGH: js/version.js's APP_VERSION does not change on every commit -- it is
// '1.0.0' across this app's entire history so far, bumped by hand only for a real release. So
// checkLiveVersionMatches above can be satisfied by ANY commit that happens to share that
// version string, not necessarily the commit a given dev-verify pass is actually trying to
// authorize -- an older, stale dev1 deploy can pass forever. Deploy & Release Standard PART D10:
// "the stamp names the commit that was verified." checkLiveCommitMatches checks the one thing
// that actually identifies a specific commit: the full git SHA, read from version.json, a build
// artifact written fresh at STAGE time (scripts/stage-site.mjs for dev, scripts/lib/stage-from-
// git.mjs for prod) -- never a hand-maintained string that can go stale.
const fakeCommitFetch = (response) => async () => response;

test('checkLiveCommitMatches passes when the live commit matches', async () => {
  const sha = 'abc123def456abc123def456abc123def456abc';
  const fetchImpl = fakeCommitFetch({ ok: true, text: async () => JSON.stringify({ commit: sha }) });
  const res = await checkLiveCommitMatches('http://localhost:8790', sha, fetchImpl);
  assert.equal(res.ok, true);
});

test('checkLiveCommitMatches refuses when the SAME version is running but a DIFFERENT commit (the exact bug)', async () => {
  // Simulates the real failure: an OLDER dev deploy that happens to share today's APP_VERSION
  // ('1.0.0' both times) but is NOT the commit this pass is trying to authorize.
  const staleCommit = '1111111111111111111111111111111111111111';
  const currentCommit = '2222222222222222222222222222222222222222';
  const fetchImpl = fakeCommitFetch({ ok: true, text: async () => JSON.stringify({ commit: staleCommit, version: '1.0.0' }) });
  const res = await checkLiveCommitMatches('http://localhost:8790', currentCommit, fetchImpl);
  assert.equal(res.ok, false);
  assert.match(res.reason, new RegExp(staleCommit));
  assert.match(res.reason, new RegExp(currentCommit));
});

test('checkLiveCommitMatches fails on a non-OK HTTP response', async () => {
  const fetchImpl = fakeCommitFetch({ ok: false, status: 404, text: async () => '' });
  const res = await checkLiveCommitMatches('http://localhost:8790', 'deadbeef', fetchImpl);
  assert.equal(res.ok, false);
  assert.match(res.reason, /404/);
});

test('checkLiveCommitMatches fails when the fetch itself throws (BASE unreachable)', async () => {
  const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
  const res = await checkLiveCommitMatches('http://localhost:1', 'deadbeef', fetchImpl);
  assert.equal(res.ok, false);
  assert.match(res.reason, /ECONNREFUSED/);
});

test('checkLiveCommitMatches fails when version.json is not valid JSON', async () => {
  const fetchImpl = fakeCommitFetch({ ok: true, text: async () => '<html>not json</html>' });
  const res = await checkLiveCommitMatches('http://localhost:8790', 'deadbeef', fetchImpl);
  assert.equal(res.ok, false);
  assert.match(res.reason, /did not parse as JSON/);
});

test('checkLiveCommitMatches fails when version.json has no readable "commit" field', async () => {
  const fetchImpl = fakeCommitFetch({ ok: true, text: async () => JSON.stringify({ version: '1.0.0' }) });
  const res = await checkLiveCommitMatches('http://localhost:8790', 'deadbeef', fetchImpl);
  assert.equal(res.ok, false);
  assert.match(res.reason, /no readable "commit" field/);
});
