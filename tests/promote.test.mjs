// scripts/promote.mjs is the ONE door to production (Deploy & Release Standard PART D6).
// Every refusal below is proven with a NEGATIVE CONTROL: a scratch repo built to be otherwise
// perfectly promotable, with exactly one thing wrong, spawned as a REAL child process running
// the REAL script (never a reimplementation or a mock) -- the same style already established in
// tests/deploy-guard.test.mjs and tests/deploy-one-door.test.mjs for this repo's other gates.
//
// The real network deploy (wrangler pages deploy) is NEVER reached by any test here: every
// refusal below dies before the interactive prompt, and every OTHER test that DOES reach the
// prompt types the WRONG version, so the script exits cleanly at the "Stopped. Nothing was
// deployed." line (exit 0) without ever touching wrangler. Nothing in this file may weaken that
// guarantee.
//
// ONE test (below, "promote runs the real post-approval path...") is the deliberate exception:
// Codex 0903-5 found the post-approval half (the re-check block with a version that actually
// matches, the wrangler deploy args, the release-log write) had ZERO coverage, because every
// other test's wrong-version answer stops before reaching any of it. That test types the REAL
// version and lets the real promote.mjs run all the way to "Done" -- but scripts/promote.mjs
// reads three of its network/process targets from env vars that default to the real ones
// (PROMOTE_WRANGLER_CMD, PROMOTE_CF_API_BASE, PROMOTE_VERSION_CHECK_HOSTS), and that one test is
// the only place in this repo that ever sets them: to a fake local script and a local mock HTTP
// server, so it proves the real logic without a real deploy or a real network call, same
// no-real-deploy guarantee as every other test here, just proven from the other side of the gate.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

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

function runPromote(dir, input, extraEnv = {}) {
  return spawnSync(process.execPath, [SCRIPT], {
    cwd: dir, encoding: 'utf8', timeout: 20000, input: input !== undefined ? input + '\n' : '\n',
    env: { ...process.env, ...extraEnv },
  });
}

// For the ONE thing spawnSync can't do: change a file WHILE the interactive prompt is open,
// the exact window Codex 0903-4 found. Runs the real script async, waits for the prompt, lets
// the caller mutate the scratch repo, types the answer, then races for either the refusal or
// the first real deploy-side-effect line -- and kills the child THE INSTANT one of those two
// appears, so this (like every other test in this file) never lets a real deploy step run.
function runPromoteAcrossThePrompt(dir, { beforeAnswer, answer }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT], { cwd: dir });
    let out = '';
    let answered = false;
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('timed out: ' + out)); }, 20000);
    function checkDone() {
      // The one thing that must NEVER be allowed to actually happen, fixed or not.
      if (/Staging \(npm run stage\)|Deploying \S+ to/.test(out)) {
        clearTimeout(timer);
        child.kill('SIGKILL');
        resolve({ out, reachedDeploy: true });
      }
    }
    child.stdout.on('data', (d) => {
      out += d.toString();
      if (!answered && /Type the version number to go ahead/.test(out)) {
        answered = true;
        try { beforeAnswer(); } catch (e) { clearTimeout(timer); child.kill('SIGKILL'); reject(e); return; }
        child.stdin.write(answer + '\n');
      }
      checkDone();
    });
    child.on('exit', () => { clearTimeout(timer); resolve({ out, reachedDeploy: false }); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

// spawnSync (used everywhere else in this file) blocks this test process's OWN event loop until
// the child exits -- fine for every other test, since none of them need this process to do
// anything while the child runs. The post-approval test below is different: its child calls back
// into an http.Server this SAME process hosts (the mock Cloudflare/version.js stand-in), and a
// blocked event loop cannot service that server's requests, so a spawnSync-based version of that
// test would deadlock (proven while building it: the child hung until spawnSync's own timeout
// killed it). Real async spawn, mirroring runPromoteAcrossThePrompt just above, keeps this
// process's event loop free to answer the child while still typing the prompt answer and
// collecting output the same way.
function runPromoteAsync(dir, { input, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT], { cwd: dir, env: { ...process.env, ...env } });
    let out = '', err = '', answered = false;
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('timed out: ' + out + err)); }, 20000);
    child.stdout.on('data', (d) => {
      out += d.toString();
      if (!answered && input !== undefined && /Type the version number to go ahead/.test(out)) {
        answered = true;
        child.stdin.write(input + '\n');
      }
    });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('exit', (code) => { clearTimeout(timer); resolve({ code, stdout: out, stderr: err }); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
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

test('promote refuses when local main has diverged from a freshly-fetched origin/main', () => {
  const { dir } = makeScratchRepo();
  scratchDirs.push(dir);
  // Simulate "someone else pushed": commit locally WITHOUT pushing, so origin/main (the real
  // bare repo this scratch tracks) still points at the earlier commit. HEAD now differs from
  // what a fresh `git fetch origin main` reports, while staying on branch main tracking
  // origin/main correctly -- a different failure than "wrong branch" or "no upstream".
  writeFileSync(path.join(dir, 'js', 'version.js'), `const APP_VERSION = '1.0.1';\n`);
  git(dir, ['commit', '-aqm', 'local-only change, never pushed']);
  const res = runPromote(dir);
  assert.notEqual(res.status, 0);
  assert.match(res.stdout, /does not match origin\/main/i);
  assert.match(res.stdout, /ahead/i);
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

test('promote re-checks for an untriaged HIGH Codex finding that appeared WHILE the prompt was open (Codex 0903-4)', async () => {
  const { dir, version } = makeScratchRepo({ codexNotes: null }); // starts clean: nothing to triage
  scratchDirs.push(dir);
  const { out, reachedDeploy } = await runPromoteAcrossThePrompt(dir, {
    // Simulate a colleague's push, or Codex's own file landing, in the seconds the prompt sat
    // open -- exactly the race the OTHER re-checks (dirty tree, HEAD, origin/main, the stamp)
    // already cover. This one didn't, until now.
    beforeAnswer: () => {
      writeFileSync(path.join(dir, 'CODEX-NOTES.md'),
        '## 2026-09-04 — review\n\n1. **HIGH — Landed mid-prompt.** Details here.\n');
    },
    // Must be the REAL version: a wrong answer exits cleanly at the typed-approval check,
    // before the re-check block this test targets ever runs.
    answer: version,
  });
  assert.equal(reachedDeploy, false,
    'a HIGH finding that appeared during the prompt must never be allowed anywhere near a real deploy step: ' + out);
  assert.match(out, /have no written decision/i,
    'the post-approval re-check must catch a HIGH finding that only appeared after the prompt opened: ' + out);
  assert.match(out, /Landed mid-prompt/, out);
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

// Codex 0903-5: the ONE test that types the REAL version and lets promote.mjs run all the way
// through the re-check block, the wrangler deploy call, the Cloudflare read-back, and the
// release-log write -- none of which any other test in this file exercises, because every other
// prompt test answers wrong on purpose. Faked entirely via the three env-var overrides
// scripts/promote.mjs reads for exactly this (PROMOTE_WRANGLER_CMD / PROMOTE_CF_API_BASE /
// PROMOTE_VERSION_CHECK_HOSTS / PROMOTE_VERIFY_POLL_MS), all of which default to the real thing
// and are never set outside this test -- so it proves the real code path without a real deploy or
// a real network call, same guarantee the file header promises.
test('promote runs the real post-approval path (fake wrangler, mock Cloudflare) and writes the release log', async () => {
  const { dir, version, headSha } = makeScratchRepo();
  scratchDirs.push(dir);
  const fullSha = git(dir, ['rev-parse', 'HEAD']);

  // A fake wrangler: never touches the network, records exactly what it was called with so the
  // deploy args (Codex named these explicitly: :320-325) get a real runtime assertion, not just
  // the existing static source-guard below. Lives OUTSIDE the scratch repo `dir` on purpose --
  // promote.mjs's very first check refuses on ANY uncommitted file in the repo it runs in, and
  // this support tooling is not part of what is being promoted.
  const supportDir = mkdtempSync(path.join(tmpdir(), 'kids-promote-support-'));
  scratchDirs.push(supportDir);
  const argsFile = path.join(supportDir, 'wrangler-args.json');
  const fakeWranglerPath = path.join(supportDir, 'fake-wrangler.mjs');
  writeFileSync(fakeWranglerPath,
    `import { writeFileSync } from 'node:fs';\n` +
    `writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));\n` +
    `console.log('fake wrangler: Deployment complete!');\n`);
  const wranglerCmd = `${JSON.stringify(process.execPath)} ${JSON.stringify(fakeWranglerPath)}`;

  // A local mock standing in for BOTH the Cloudflare deployments API and the two live
  // version.js hosts -- same server, branches on the request path.
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/js/version.js')) {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      res.end(`const APP_VERSION = '${version}';\n`);
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ result: [{
      id: 'fake-deployment-id',
      environment: 'production',
      deployment_trigger: { metadata: { commit_hash: fullSha } },
      latest_stage: { name: 'deploy', status: 'success' },
    }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  try {
    const res = await runPromoteAsync(dir, {
      input: version,
      env: {
        PROMOTE_WRANGLER_CMD: wranglerCmd,
        PROMOTE_CF_API_BASE: origin,
        PROMOTE_VERSION_CHECK_HOSTS: `${origin},${origin}`,
        PROMOTE_VERIFY_POLL_MS: '10',
      },
    });

    assert.equal(res.code, 0, 'a fully clean repo with the real version typed must deploy cleanly: ' + res.stdout + res.stderr);
    assert.match(res.stdout, /Re-checking everything before the point of no return/);
    assert.match(res.stdout, /staged \d+ files from commit/);
    assert.match(res.stdout, new RegExp(`Deploying ${version} to simplyknown-kids`));
    assert.match(res.stdout, /fake wrangler: Deployment complete!/, 'the fake wrangler must actually have run: ' + res.stdout);
    assert.match(res.stdout, /Done\. Kids .* is deployed and Cloudflare confirms it\./);

    const calledWith = JSON.parse(readFileSync(argsFile, 'utf8'));
    assert.ok(calledWith.includes('pages'), calledWith.join(' '));
    assert.ok(calledWith.includes('deploy'), calledWith.join(' '));
    assert.ok(calledWith.some((a) => a === '--project-name=simplyknown-kids'), calledWith.join(' '));
    assert.ok(calledWith.some((a) => a === '--branch=main'), calledWith.join(' '));
    assert.ok(!calledWith.some((a) => a.includes('--commit-dirty')),
      'the real wrangler call must never receive --commit-dirty=true: ' + calledWith.join(' '));

    const releaseLog = readFileSync(path.join(dir, 'docs', 'releases.md'), 'utf8');
    assert.match(releaseLog, new RegExp(`\\|\\s*${version}\\s*\\|\\s*${headSha}\\s*\\|`),
      'the release log must gain a row for this exact version and commit: ' + releaseLog);
  } finally {
    server.close();
  }
});

test('source guard: promote in package.json runs scripts/promote.mjs', () => {
  const pkg = JSON.parse(execFileSync('git', ['show', 'HEAD:package.json'], { cwd: ROOT, encoding: 'utf8' }));
  assert.match(pkg.scripts.promote || '', /promote\.mjs/);
});

test('source guard: promote-kids.bat exists at the repo root and runs npm run promote', () => {
  const bat = execFileSync('git', ['show', 'HEAD:promote-kids.bat'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(bat, /npm run promote/);
});

// Codex 0903-3: the prod deploy stages from git HEAD now (see
// tests/stage-from-git.test.mjs), not the working tree, so it owes wrangler
// no dirty-tree exception -- if --commit-dirty=true is ever back, it means
// someone reverted to fs.copyFileSync-from-disk staging without reverting
// this flag too, silently reopening the same race.
test('source guard: the prod wrangler deploy does not pass --commit-dirty=true', () => {
  const src = execFileSync('git', ['show', 'HEAD:scripts/promote.mjs'], { cwd: ROOT, encoding: 'utf8' });
  // Codex 0903-5 made the wrangler command an (overridable-in-tests-only) constant, so the
  // pinned version and the actual deploy invocation now live on different lines -- check both,
  // and the runtime test above ("promote runs the real post-approval path...") proves the args a
  // real invocation receives too, not just this static source scan.
  assert.match(src, /WRANGLER_CMD\s*=\s*process\.env\.PROMOTE_WRANGLER_CMD\s*\|\|\s*'npx --yes wrangler@4\.127\.1'/,
    'the default (real, production) wrangler command must stay pinned to wrangler@4.127.1');
  const deployLine = src.split('\n').find((l) => l.includes('pages deploy'));
  assert.ok(deployLine, 'could not find the wrangler pages deploy line in scripts/promote.mjs');
  assert.doesNotMatch(deployLine, /--commit-dirty=true/,
    'the prod deploy must not pass --commit-dirty=true -- it stages from git HEAD, not the working tree, so it needs no dirty-tree exception');
});
