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

// RETIRED 2026-09-02 (Deploy & Release Standard PART D8, Codex finding #2 of
// the 2026-09-02 review): deploy:prod-preview was a second, weaker door to
// production -- clean tree only, no branch check, no version, no dev-verify
// stamp, no Codex triage. `scripts/promote.mjs` (via `npm run promote`) is
// now the ONE door. The old assertion above (that this script called
// require-clean-tree.mjs before staging) is exactly the shape being closed,
// not a bar to keep clearing -- replaced with a test that the script now
// refuses outright instead of ever reaching a real deploy.
test('deploy:prod-preview is retired: it refuses outright and points at npm run promote', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const script = pkg.scripts && pkg.scripts['deploy:prod-preview'];
  assert.ok(script, 'deploy:prod-preview should still exist in package.json (as a refusal, not removed -- so muscle memory hits an explanation, not "command not found")');
  assert.doesNotMatch(script, /wrangler[^&]*pages\s+deploy/,
    'deploy:prod-preview must not invoke wrangler pages deploy at all -- it is retired, not just re-guarded');
  assert.match(script, /npm run promote/,
    'the refusal must point at the real one door (npm run promote)');
  const res = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'deploy:prod-preview'], { cwd: ROOT, encoding: 'utf8' });
  assert.notEqual(res.status, 0, 'running deploy:prod-preview must exit non-zero, not silently succeed');
});
