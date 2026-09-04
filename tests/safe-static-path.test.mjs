// Codex 0902-3, MED. scripts/serve.mjs used to gate every request with a
// plain TEXT prefix check: `file.startsWith(ROOT)`. A sibling directory
// whose name merely starts with this repo's own name (e.g. a backup folder
// like "Kids_App-old") has a path that ALSO starts with the string ROOT --
// even though it sits entirely outside ROOT -- so that sibling's files
// would have been served. Also found: no realpath (a symlink inside the
// repo pointing outside it was never re-checked) and no denylist for
// credential-shaped extensions (.key/.pem/...) that don't happen to start
// with a dot in their filename, so the existing dotfile rule missed them.
//
// The check now lives in scripts/lib/safe-static-path.mjs, a pure module
// with no server/ROOT side effects, specifically so it can be proven here
// against synthetic sibling-directory paths that don't require touching
// anything on disk outside this repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveSafePath, isWithinRoot } from '../scripts/lib/safe-static-path.mjs';

const ROOT = path.win32.resolve('C:\\Users\\Test\\Projects\\Kids_App');

// The exact old logic, kept here ONLY to prove what it used to let through --
// never imported from serve.mjs, which no longer contains it.
function oldUnsafeCheck(root, file) { return file.startsWith(root); }

test('a sibling directory that merely starts with the repo name is NOT contained (the 0902-3 bug)', () => {
  const siblingFile = path.win32.resolve(ROOT + '-old', 'secrets', 'cf_api_token.txt');
  // Prove the OLD logic really did let this through -- the actual live bug.
  assert.equal(oldUnsafeCheck(ROOT, siblingFile), true,
    'sanity check: the old startsWith() logic must actually exhibit the bug for this proof to mean anything');
  // The real fix must refuse it.
  assert.equal(isWithinRoot(ROOT, siblingFile), false);
  assert.equal(resolveSafePath(ROOT, '/../Kids_App-old/secrets/cf_api_token.txt'), null);
});

test('a normal file inside the repo still resolves correctly', () => {
  const expected = path.win32.resolve(ROOT, 'index.html');
  assert.equal(resolveSafePath(ROOT, '/index.html'), expected);
});

test('a root request resolves to index.html', () => {
  const expected = path.win32.resolve(ROOT, 'index.html');
  assert.equal(resolveSafePath(ROOT, '/'), expected);
});

test('a dotfile anywhere in the path is refused (regression: the 2026-09-01 .env fix)', () => {
  assert.equal(resolveSafePath(ROOT, '/.env'), null);
  assert.equal(resolveSafePath(ROOT, '/some/dir/.hidden'), null);
});

test('secrets/ and node_modules/ directories are refused (regression)', () => {
  assert.equal(resolveSafePath(ROOT, '/secrets/cf_api_token.txt'), null);
  assert.equal(resolveSafePath(ROOT, '/node_modules/pkg/index.js'), null);
});

test('a credential-shaped extension is refused even without a leading dot in the filename', () => {
  for (const name of ['server.key', 'cert.pem', 'bundle.p12', 'client.pfx', 'ca.crt']) {
    assert.equal(resolveSafePath(ROOT, '/' + name), null, name + ' must be refused');
  }
});

test('a file that merely CONTAINS ".key" as a substring, not as its extension, is not caught by that rule', () => {
  // Not a security requirement (nothing in this repo is named this way) --
  // documents that the check is a real extension match, not a loose substring
  // scan that would also snag "monkey.png".
  assert.notEqual(resolveSafePath(ROOT, '/monkey.png'), null);
});
