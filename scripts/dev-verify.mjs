// THE DEV VERIFICATION PASS — the automated half of docs/verify/VERIFYING.md.
//
// It runs the checks that recipe describes end to end -- unit tests, then a
// real browser drive against the dev deployment -- and if both come back
// clean, writes docs/verify/DEV-VERIFIED.json, the stamp
// scripts/promote.mjs demands before anything can reach production (Deploy &
// Release Standard, PART D6).
//
// Run it:  npm run verify:dev
//
// Unlike Land's twin of this script, Kids has no LOCAL server to launch as
// part of "dev" -- Kids' dev environment (kids1) is a real, persistent
// Cloudflare Pages deployment (`simplyknown-kids1`, pushed to separately via
// `npm run deploy:dev1`). So this script does not spin anything up; it
// assumes dev1 already has the commit under test on it, and its job is to
// PROVE that, not to deploy it. Reuses the SAME `BASE` override
// tests/verify-drive.mjs and docs/verify/VERIFYING.md's own examples already
// document (`BASE=https://kids1.simplyknown.co node tests/verify-drive.mjs`)
// -- no new mechanism invented.
//
// THREE THINGS IT DELIBERATELY WILL NOT DO:
//   1. It will not stamp a dirty tree. The stamp names a commit; if the
//      working copy has edits, the thing tested is not the thing the commit
//      contains and the stamp would be a lie.
//   2. It will not deploy anything. If dev1 does not yet have this commit on
//      it, the drive will fail honestly (wrong content, or -- see the known
//      trap below -- Access will refuse to answer at all) rather than this
//      script quietly pushing a deploy on your behalf.
//   3. It will not pass quietly on a failure. Any failing part exits
//      non-zero and writes no stamp.
//
// ⚠️ KNOWN TRAP, found live 2026-09-02: kids1.simplyknown.co and
// simplyknown-kids1.pages.dev are BOTH currently behind Cloudflare Access
// (the original migration plan gated the dev copy on purpose, so an
// unfinished build is never publicly indexable). There is no CF Access
// Service Token in secrets/ today, so an unattended run of this script
// against the real kids1 URL cannot get past the Access login page --
// verify-drive.mjs's own identity check will fail loud ("Nothing
// identifiable is serving...") rather than false-passing, which is the
// correct failure mode, but it means `npm run verify:dev` cannot complete
// end-to-end against kids1 until EITHER Access is removed from dev1
// (matching production's public-by-design posture) OR a Kids-scoped Access
// Service Token is added and wired in here -- both are infrastructure
// decisions for Scott, not something this script should route around on its
// own. Until then, prove this script locally instead:
//   node scripts/serve.mjs                                  (one terminal)
//   BASE=http://localhost:8790 npm run verify:dev            (another)
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

const R = '\x1b[31m', G = '\x1b[32m', Y = '\x1b[33m', B = '\x1b[1m', X = '\x1b[0m';
const say = (s = '') => process.stdout.write(s + '\n');
const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

const BASE = process.env.BASE || 'https://kids1.simplyknown.co';
const STAMP = 'docs/verify/DEV-VERIFIED.json';

const fail = (why) => {
  say(`\n${R}${B}VERIFICATION FAILED — no stamp written.${X}`);
  say(`${R}${why}${X}\n`);
  process.exit(1);
};

say(`\n${B}Kids — dev verification pass${X}`);
say(`${Y}against: ${BASE}${X}\n`);

// ── 0. The tree must be clean, or the stamp would name the wrong code ───────
// Runs BEFORE anything else -- npm test and the browser drive both take real
// time, and none of it means anything if the commit the stamp will name does
// not actually match what is sitting on disk.
let dirty;
try {
  dirty = sh('git status --porcelain').split('\n').filter((l) => l.trim());
} catch (e) {
  fail(`could not read git status (${e.message}).`);
}
if (dirty.length) {
  fail(`${dirty.length} uncommitted change(s). Commit first — the stamp records a COMMIT, so a\n` +
       `dirty tree would stamp code that is not in that commit:\n  ` + dirty.join('\n  '));
}
const commit = sh('git rev-parse --short HEAD');
say(`  commit under test : ${B}${commit}${X}  ${sh('git log -1 --format=%s')}\n`);

// ── 1. Unit tests ────────────────────────────────────────────────────────────
say(`${B}[1/2] Unit tests${X}`);
try {
  execSync('npm test', { stdio: 'inherit' });
} catch {
  fail('unit tests failed.');
}
say(`  ${G}✓${X} npm test clean\n`);

// ── 2. Drive — the real end-to-end harness, against the dev deployment ─────
say(`${B}[2/2] Drive — tests/verify-drive.mjs against ${BASE}${X}`);
try {
  execSync('node tests/verify-drive.mjs', { stdio: 'inherit', env: { ...process.env, BASE } });
} catch {
  fail(`the browser drive reported failures against ${BASE}.\n` +
       `If nothing identifiable answered at all, check: is ${BASE} up, does it have this\n` +
       `commit deployed (npm run deploy:dev1), and — see this file's header — is Access\n` +
       `gating it with no service token configured?`);
}
say(`  ${G}✓${X} drive clean\n`);

// ── Evidence ─────────────────────────────────────────────────────────────────
if (!existsSync('docs/verify')) mkdirSync('docs/verify', { recursive: true });
const stamp = { commit, result: 'clean', when: new Date().toISOString() };
writeFileSync(STAMP, JSON.stringify(stamp, null, 2) + '\n');
say(`${G}${B}DEV VERIFICATION CLEAN${X} for commit ${B}${commit}${X} against ${BASE}.`);
say(`  ${G}✓${X} stamp written: ${STAMP}`);
say(`\n${Y}Still owed by a human:${X} open ${BASE} yourself and look at it (or the local`);
say(`server if that's what you pointed this at) — this proves the app answers correctly,`);
say(`not that it looks right to a person.`);
say(`\nNext: bump APP_VERSION if this is a real release, then \`npm run promote\`.`);
say(`The stamp is git-ignored — it is local evidence, and committing it would change HEAD`);
say(`and make itself stale.\n`);
