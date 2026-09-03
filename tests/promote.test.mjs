// scripts/promote.mjs is the ONE door to production (Deploy & Release Standard PART D6).
// Every refusal below is proven with a NEGATIVE CONTROL: a scratch repo built to be otherwise
// perfectly promotable, with exactly one thing wrong, spawned as a REAL child process running
// the REAL script (never a reimplementation or a mock) -- the same style already established in
// tests/deploy-guard.test.mjs and tests/deploy-one-door.test.mjs for this repo's other gates.
//
// The real network deploy (wrangler pages deploy) is NEVER reached by any test here: every
// refusal below dies before the interactive prompt, and the one test that DOES reach the prompt
// (promote-reaches-the-prompt-when-everything-is-clean) always types the WRONG version, so the
// script exits cleanly at the "Stopped. Nothing was deployed." line (exit 0) without ever
// touching wrangler. Nothing in this file may weaken that guarantee.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'promote.mjs');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, stdio: 'pipe' }).toString('utf8').trim();
}

const scratchDirs = [];
after(() => { for (const d of scratchDirs) rmSync(d, { recursive: true, force: true }); });

// Builds a scratch repo that is, by default, PERFECTLY promotable: clean, on main, tracking
// origin/main (a real local bare repo -- no network needed), with a matching version in
// js/version.js + package.json, a valid dev-verify stamp for HEAD, a clean releases.md, no Codex
// findings, and a dummy Cloudflare token. Each negative-control test starts from this baseline
// and breaks exactly ONE thing, so a failure can only be attributed to the thing under test.
function makeScratchRepo(opts = {}) {
  const {
    version = '1.0.0',
    branch = 'main',           // pass e.g. 'feature' to break the branch/upstream check
    trackMain = true,          // if branch !== 'main' and this is true, upstream tracks origin/<branch> (a real "wrong branch", not "no upstream")
    writeStamp = true,
    stampCommit = null,        // null = use the real HEAD sha
    stampResult = 'clean',
    releaseRows = [],          // extra markdown rows to seed into docs/releases.md
    codexNotes = null,         // raw CODEX-NOTES.md content, or null to omit the file entirely
    codexTriage = '',          // raw docs/CODEX-TRIAGE.md content
    withToken = true,
  } = opts;

  const bareDir = mkdtempSync(path.join(tmpdir(), 'kids-promote-origin-'));
  execFileSync('git', ['init', '--bare', '-q', bareDir]);

  const dir = mkdtempSync(path.join(tmpdir(), 'kids-promote-test-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);

  // Files that must be TRACKED (real promote.mjs reads them via `git show HEAD:...` or expects
  // them committed in the real repo): js/version.js, package.json, docs/releases.md,
  // docs/CODEX-TRIAGE.md. Gitignore the ones that are gitignored for real (the stamp, Codex's
  // own notes, secrets) so writing them afterward does not itself dirty the tree.
  writeFileSync(path.join(dir, '.gitignore'), 'docs/verify/DEV-VERIFIED.json\nCODEX-NOTES.md\nsecrets/\n');
  mkdirSync(path.join(dir, 'js'), { recursive: true });
  writeFileSync(path.join(dir, 'js', 'version.js'), `const APP_VERSION = '${version}';\n`);
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'scratch', version }, null, 2) + '\n');
  mkdirSync(path.join(dir, 'docs'), { recursive: true });
  const releaseTable = ['| Date | Version | Commit | Notes |', '|---|---|---|---|', ...releaseRows];
  writeFileSync(path.join(dir, 'docs', 'releases.md'), releaseTable.join('\n') + '\n');
  writeFileSync(path.join(dir, 'docs', 'CODEX-TRIAGE.md'), codexTriage);

  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'initial']);
  git(dir, ['remote', 'add', 'origin', bareDir]);
  git(dir, ['push', '-q', '-u', 'origin', 'main']);

  if (branch !== 'main') {
    git(dir, ['checkout', '-q', '-b', branch]);
    if (trackMain) {
      git(dir, ['push', '-q', '-u', 'origin', branch]); // real "wrong branch": tracks origin/<branch>, not origin/main
    }
    // else: leave it with no upstream at all -- a different flavor of "wrong branch"
  }

  const headSha = git(dir, ['rev-parse', '--short', 'HEAD']);

  // Gitignored files, written AFTER the commit (so they can't make the tree dirty):
  if (writeStamp) {
    mkdirSync(path.join(dir, 'docs', 'verify'), { recursive: true });
    writeFileSync(path.join(dir, 'docs', 'verify', 'DEV-VERIFIED.json'),
      JSON.stringify({ commit: stampCommit || headSha, result: stampResult, when: new Date().toISOString() }, null, 2));
  }
  if (codexNotes !== null) writeFileSync(path.join(dir, 'CODEX-NOTES.md'), codexNotes);
  if (withToken) {
    mkdirSync(path.join(dir, 'secrets'), { recursive: true });
    writeFileSync(path.join(dir, 'secrets', 'cf_api_token.txt'), 'dummy-token-never-used\n');
  }

  return { dir, headSha, version };
}

function runPromote(dir, input) {
  return spawnSync(process.execPath, [SCRIPT], {
    cwd: dir, encoding: 'utf8', timeout: 20000, input: input !== undefined ? input + '\n' : '\n',
  });
}

test('promote refuses a dirty tree (before touching git remotes, stamps, or Codex)', () => {
  const { dir } = makeScratchRepo();
  scratchDirs.push(dir);
  writeFileSync(path.join(dir, 'oops.html'), 'a stray uncommitted file');
  const res = runPromote(dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stdout, /uncommitted change/i);
});

test('promote refuses when the branch has no upstream at all', () => {
  const { dir } = makeScratchRepo({ branch: 'feature', trackMain: false });
  scratchDirs.push(dir);
  const res = runPromote(dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stdout, /no upstream configured/i);
});

test('promote refuses when the branch tracks something other than origin/main', () => {
  const { dir } = makeScratchRepo({ branch: 'feature', trackMain: true });
  scratchDirs.push(dir);
  const res = runPromote(dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stdout, /tracks "origin\/feature", not origin\/main/i);
});

test('promote refuses when no dev-verify stamp exists for this commit', () => {
  const { dir } = makeScratchRepo({ writeStamp: false });
  scratchDirs.push(dir);
  const res = runPromote(dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stdout, /No dev verification for this exact commit/i);
  assert.match(res.stdout, /verify:dev/);
});

test('promote refuses when the stamp names a different commit', () => {
  const { dir } = makeScratchRepo({ stampCommit: 'deadbee' });
  scratchDirs.push(dir);
  const res = runPromote(dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stdout, /No dev verification for this exact commit/i);
  assert.match(res.stdout, /deadbee/);
});

test('promote refuses when the stamp did not come back clean', () => {
  const { dir } = makeScratchRepo({ stampResult: 'dirty' });
  scratchDirs.push(dir);
  const res = runPromote(dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stdout, /did not come back clean/i);
});

test('promote refuses when this version was already released', () => {
  const version = '1.0.0';
  const { dir } = makeScratchRepo({ version, releaseRows: [`| 2026-01-01 | ${version} | abc1234 | earlier release |`] });
  scratchDirs.push(dir);
  const res = runPromote(dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stdout, /has already been released/i);
});

test('promote refuses an untriaged HIGH Codex finding', () => {
  const notes = '## 2026-09-02 — review\n\n1. **HIGH — Something real and unfixed.** Details here.\n';
  const { dir } = makeScratchRepo({ codexNotes: notes, codexTriage: '' });
  scratchDirs.push(dir);
  const res = runPromote(dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stdout, /have no written decision/i);
  assert.match(res.stdout, /Something real and unfixed/);
});

test('promote proceeds past an already-TRIAGED HIGH Codex finding (does not die at that check)', () => {
  const notes = '## 2026-09-02 — review\n\n1. **HIGH — Already handled.** Details here.\n';
  const triage = '## Already handled.\nACCEPTED RISK — out of scope for this test, tracked separately.\n';
  const { dir } = makeScratchRepo({ codexNotes: notes, codexTriage: triage });
  scratchDirs.push(dir);
  // No real Cloudflare token behavior is exercised -- typing the wrong version below means the
  // script exits at the prompt (exit 0) long before any network call, regardless of the token
  // file's (fake) content. Reaching the prompt at all proves the Codex check passed.
  const res = runPromote(dir, 'not-the-real-version');
  assert.equal(res.status, 0, 'should reach the prompt and cleanly cancel, not die earlier: ' + res.stdout + res.stderr);
  assert.match(res.stdout, /Type the version number to go ahead/);
  assert.doesNotMatch(res.stdout, /have no written decision/i);
});

test('promote refuses when no Cloudflare token file exists', () => {
  const { dir } = makeScratchRepo({ withToken: false });
  scratchDirs.push(dir);
  const res = runPromote(dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stdout, /No Cloudflare token/i);
});

test('promote cancels cleanly (exit 0, no deploy) when the typed version does not match', () => {
  const { dir, version } = makeScratchRepo();
  scratchDirs.push(dir);
  const res = runPromote(dir, 'definitely-not-' + version);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /Stopped\. Nothing was deployed\./);
  // The migration notice legitimately MENTIONS "wrangler deploy" in prose (describing the
  // separate, out-of-scope sync-Worker command) -- what must never appear is the deploy STEP
  // labels, which only print once execSync actually starts staging/deploying.
  assert.doesNotMatch(res.stdout + res.stderr, /Staging \(npm run stage\)|Deploying \S+ to/,
    'a mismatched version must never reach the staging/deploy step');
});

test('promote reaches the prompt when everything about the repo is clean (no CODEX-NOTES.md at all)', () => {
  const { dir } = makeScratchRepo({ codexNotes: null });
  scratchDirs.push(dir);
  const res = runPromote(dir, 'wrong-on-purpose');
  assert.equal(res.status, 0, 'a fully clean repo must reach the prompt, not die on an earlier check: ' + res.stdout + res.stderr);
  assert.match(res.stdout, /nothing to triage, which is a pass/i);
  assert.match(res.stdout, /Type the version number to go ahead/);
  assert.match(res.stdout, /NOT CHECKED — Kids has no migrations system/i);
  assert.doesNotMatch(res.stdout + res.stderr, /Staging \(npm run stage\)|Deploying \S+ to/);
});

test('source guard: promote in package.json runs scripts/promote.mjs', () => {
  const pkg = JSON.parse(execFileSync('git', ['show', 'HEAD:package.json'], { cwd: ROOT, encoding: 'utf8' }));
  assert.match(pkg.scripts.promote || '', /promote\.mjs/);
});

test('source guard: promote-kids.bat exists at the repo root and runs npm run promote', () => {
  const bat = execFileSync('git', ['show', 'HEAD:promote-kids.bat'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(bat, /npm run promote/);
});
