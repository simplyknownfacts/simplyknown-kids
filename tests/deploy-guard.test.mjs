// HIGH finding (relayed by master, live security review 2026-09-01): the
// `deploy:prod-preview` script (package.json) stages the CURRENT WORKING TREE
// (scripts/stage-site.mjs copies each git-tracked file's bytes as they sit on
// disk right now, not the last commit) and ships it to the PRODUCTION
// Cloudflare Pages project with `--commit-dirty=true` -- nothing stops an
// uncommitted, unreviewed change from going live. This is the same "what's
// running matches nothing in git" trap the sync Worker hit once before
// (TECH-STACK.md's v141 lesson) -- here for the static site's deploy path.
//
// scripts/require-clean-tree.mjs is the fix: refuse to proceed if the git
// working tree is not clean. This file proves it two ways: the script's own
// behavior (spawned against a scratch git repo, never this real repo), and a
// source guard that deploy:prod-preview actually calls it.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const GUARD = path.join(ROOT, 'scripts', 'require-clean-tree.mjs');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, stdio: 'pipe' }).toString('utf8');
}

function makeScratchRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'kids-clean-tree-test-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  writeFileSync(path.join(dir, 'index.html'), '<html>v1</html>');
  git(dir, ['add', 'index.html']);
  git(dir, ['commit', '-q', '-m', 'initial']);
  return dir;
}

function runGuard(cwd) {
  return spawnSync(process.execPath, [GUARD], { cwd, encoding: 'utf8' });
}

const scratchDirs = [];
after(() => { for (const d of scratchDirs) rmSync(d, { recursive: true, force: true }); });

test('the clean-tree guard passes (exit 0) on a freshly committed repo', () => {
  const dir = makeScratchRepo();
  scratchDirs.push(dir);
  const res = runGuard(dir);
  assert.equal(res.status, 0, 'a clean tree should not be refused: ' + res.stderr);
});

test('the clean-tree guard refuses (non-zero exit) when a tracked file has uncommitted edits', () => {
  const dir = makeScratchRepo();
  scratchDirs.push(dir);
  writeFileSync(path.join(dir, 'index.html'), '<html>v2 -- uncommitted!</html>');
  const res = runGuard(dir);
  assert.notEqual(res.status, 0, 'a dirty tracked file must refuse the deploy');
  assert.match(res.stderr, /uncommitted|dirty|not clean/i);
});

test('the clean-tree guard refuses when there is a new, untracked file', () => {
  const dir = makeScratchRepo();
  scratchDirs.push(dir);
  writeFileSync(path.join(dir, 'oops.html'), 'a stray file nobody committed');
  const res = runGuard(dir);
  assert.notEqual(res.status, 0, 'an untracked file must also refuse the deploy -- it would ship too');
});

test('source guard: deploy:prod-preview runs the clean-tree guard before staging/deploying to production', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const script = pkg.scripts && pkg.scripts['deploy:prod-preview'];
  assert.ok(script, 'deploy:prod-preview should still exist in package.json');
  assert.match(script, /require-clean-tree\.mjs/,
    'deploy:prod-preview must call scripts/require-clean-tree.mjs before anything else, or a dirty tree can ship to the PRODUCTION Pages project again');
  assert.ok(
    script.indexOf('require-clean-tree.mjs') < script.indexOf('npm run stage'),
    'the clean-tree guard must run BEFORE `npm run stage`, not after -- staging succeeding first defeats the point');
});
