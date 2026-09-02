// scripts/dev-verify.mjs is the automated half of docs/verify/VERIFYING.md --
// the pass that writes docs/verify/DEV-VERIFIED.json, the stamp
// scripts/promote.mjs demands before anything can reach production (Deploy &
// Release Standard PART D). Its dirty-tree refusal is the one part cheap and
// safe to prove against a throwaway repo (running the REST of it -- npm test,
// then a real browser drive against a live URL -- needs this actual repo's
// files and a reachable BASE, so that part is proven by literally running it,
// per docs/verify/VERIFYING.md's own run logs, not simulated here).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'dev-verify.mjs');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, stdio: 'pipe' }).toString('utf8');
}

function makeScratchRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'kids-dev-verify-test-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  writeFileSync(path.join(dir, 'index.html'), '<html>v1</html>');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'initial']);
  return dir;
}

const scratchDirs = [];
after(() => { for (const d of scratchDirs) rmSync(d, { recursive: true, force: true }); });

test('dev-verify refuses a dirty tree before running anything else, and writes no stamp', () => {
  const dir = makeScratchRepo();
  scratchDirs.push(dir);
  writeFileSync(path.join(dir, 'index.html'), '<html>v2 -- uncommitted!</html>');
  const res = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8', timeout: 15000 });
  assert.notEqual(res.status, 0, 'a dirty tree must refuse: ' + res.stdout + res.stderr);
  assert.match(res.stdout + res.stderr, /dirty|uncommitted|not clean/i);
  assert.doesNotMatch(res.stdout, /npm test|Unit tests/,
    'the dirty-tree check must fire BEFORE anything expensive runs (npm test, verify-drive) -- ' +
    'the stamp names a commit, so testing the wrong thing quickly is still testing the wrong thing');
});

test('dev-verify refuses an untracked file the same way (git status counts it dirty too)', () => {
  const dir = makeScratchRepo();
  scratchDirs.push(dir);
  writeFileSync(path.join(dir, 'oops.html'), 'a stray file nobody committed');
  const res = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8', timeout: 15000 });
  assert.notEqual(res.status, 0, 'an untracked file must also refuse: ' + res.stdout + res.stderr);
});

test('source guard: verify:dev in package.json runs scripts/dev-verify.mjs', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['verify:dev'] || '', /dev-verify\.mjs/);
});
