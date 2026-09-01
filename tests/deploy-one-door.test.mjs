// "ONE DOOR TO PROD" (Deploy & Release Standard PART D8, Scott's ruling
// 2026-09-01): production is reachable through exactly one reviewed door.
// The gap flagged for Kids: `deploy:dev1` shipped with `--commit-dirty=true`
// straight to a project name typed once as a bare CLI flag -- nothing
// checked, in code, that the string it was about to deploy to was really the
// DEV project and not (through a future typo, copy-paste, or override) the
// PRODUCTION one. D6's own precedent (Land, Deploy & Release Standard PART B
// §11) is exactly this shape: an unchecked target let a dev deploy nearly
// bind to a production database.
//
// Two pieces, two sets of tests:
//   1. scripts/deploy-dev1.mjs -- wraps the wrangler call behind a hard-coded,
//      explicitly-checked target identity (assertSafeDevTarget), never an
//      inferred or ambient project name. Its refusal logic is pure and
//      exported, so it's tested directly -- no real wrangler/network call.
//   2. scripts/verify/no-ungated-deploy.mjs -- a repo-wide grep that fails
//      loud if a raw wrangler deploy/pages-deploy invocation, or a bare
//      --commit-dirty=true, turns up outside the small reviewed allow-list.
//      Proven against a scratch repo, never this real one.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEPLOY_DEV1_URL = pathToFileURL(path.join(ROOT, 'scripts', 'deploy-dev1.mjs'));

// ─────────────────────────────────────────────────────────────────────────
// 1. deploy-dev1.mjs's target-identity check
// ─────────────────────────────────────────────────────────────────────────

test('assertSafeDevTarget: the real configured dev/prod pair passes', async () => {
  const { assertSafeDevTarget, DEV_PROJECT, PROD_PROJECT } =
    await import(DEPLOY_DEV1_URL);
  assert.equal(DEV_PROJECT, 'simplyknown-kids1');
  assert.equal(PROD_PROJECT, 'simplyknown-kids');
  assert.doesNotThrow(() => assertSafeDevTarget(DEV_PROJECT, PROD_PROJECT));
});

test('assertSafeDevTarget: refuses when the dev target equals the prod target', async () => {
  const { assertSafeDevTarget } =
    await import(DEPLOY_DEV1_URL);
  assert.throws(
    () => assertSafeDevTarget('simplyknown-kids', 'simplyknown-kids'),
    /identical|same|production/i,
    'a dev deploy whose target string matches prod must refuse before ever calling wrangler');
});

test('assertSafeDevTarget: refuses an empty/missing dev target', async () => {
  const { assertSafeDevTarget } =
    await import(DEPLOY_DEV1_URL);
  assert.throws(() => assertSafeDevTarget('', 'simplyknown-kids'));
  assert.throws(() => assertSafeDevTarget(undefined, 'simplyknown-kids'));
});

test('source guard: deploy:dev1 calls the guarded wrapper, not a raw wrangler invocation', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const script = pkg.scripts && pkg.scripts['deploy:dev1'];
  assert.ok(script, 'deploy:dev1 should still exist');
  assert.match(script, /deploy-dev1\.mjs/,
    'deploy:dev1 must run scripts/deploy-dev1.mjs (the hard-coded-target wrapper), not call wrangler pages deploy directly with a bare string');
  assert.ok(!/wrangler[^&]*pages\s+deploy/.test(script),
    'deploy:dev1 must not invoke `wrangler ... pages deploy` directly -- that belongs inside the reviewed wrapper only');
});

// ─────────────────────────────────────────────────────────────────────────
// 2. scripts/verify/no-ungated-deploy.mjs
// ─────────────────────────────────────────────────────────────────────────

const GUARD = path.join(ROOT, 'scripts', 'verify', 'no-ungated-deploy.mjs');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, stdio: 'pipe' }).toString('utf8');
}

function makeScratchRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'kids-ungated-deploy-test-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'scratch' }));
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'initial']);
  return dir;
}

function runGuard(cwd) {
  return spawnSync(process.execPath, [GUARD], { cwd, encoding: 'utf8' });
}

const scratchDirs = [];
after(() => { for (const d of scratchDirs) rmSync(d, { recursive: true, force: true }); });

test('no-ungated-deploy: a clean scratch repo (no deploy calls at all) passes', () => {
  const dir = makeScratchRepo();
  scratchDirs.push(dir);
  const res = runGuard(dir);
  assert.equal(res.status, 0, 'no deploy invocations anywhere should never be flagged: ' + res.stderr);
});

test('no-ungated-deploy: a raw wrangler pages deploy call outside the reviewed list is caught', () => {
  const dir = makeScratchRepo();
  scratchDirs.push(dir);
  mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  writeFileSync(path.join(dir, 'scripts', 'oops-ship-it.sh'),
    'npx wrangler pages deploy .publish --project-name=whatever-i-typed\n');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'add stray deploy script']);
  const res = runGuard(dir);
  assert.notEqual(res.status, 0, 'a raw, unreviewed wrangler pages deploy call must fail the guard');
  assert.match(res.stderr + res.stdout, /oops-ship-it\.sh/);
});

test('no-ungated-deploy: a bare --commit-dirty=true outside the reviewed list is caught', () => {
  const dir = makeScratchRepo();
  scratchDirs.push(dir);
  writeFileSync(path.join(dir, 'sneaky.sh'), 'some command --commit-dirty=true here\n');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'add stray dirty flag']);
  const res = runGuard(dir);
  assert.notEqual(res.status, 0, 'a --commit-dirty=true outside the reviewed list must fail the guard');
});

test('no-ungated-deploy: prose in docs/ or a test fixture is NOT flagged (scope is executable scripts only)', () => {
  const dir = makeScratchRepo();
  scratchDirs.push(dir);
  mkdirSync(path.join(dir, 'docs'), { recursive: true });
  mkdirSync(path.join(dir, 'tests'), { recursive: true });
  writeFileSync(path.join(dir, 'docs', 'plan.md'),
    'Historically we ran `wrangler pages deploy .publish --commit-dirty=true` for Stage 1.\n');
  writeFileSync(path.join(dir, 'tests', 'fixture.test.mjs'),
    "const PAYLOAD = 'wrangler pages deploy --commit-dirty=true';\n");
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'add docs and test fixture mentioning the pattern']);
  const res = runGuard(dir);
  assert.equal(res.status, 0, 'docs/ prose and tests/ fixtures must not trip the guard: ' + res.stdout + res.stderr);
});

test('source guard: the real repo passes its own no-ungated-deploy check', () => {
  const res = spawnSync(process.execPath, [GUARD], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(res.status, 0, 'this repo should currently be clean under D8: ' + res.stdout + res.stderr);
});
