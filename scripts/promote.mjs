// PROMOTE TO PRODUCTION — the one way a release reaches kids.simplyknown.co.
//
// WHAT THIS IS, IN PLAIN ENGLISH:
//   Deploying is easy; deploying the WRONG thing is easy too. This does the whole release —
//   the checks, the deploy, the read-back, the release log — and it stops and asks you before
//   the part that cannot be undone.
//
// SCOTT'S RULES:
//   1. Dev (kids1) is free. Prod requires the desktop button and typing the VERSION NUMBER.
//   2. Only Scott runs it.
//   3. Prod stays human-gated — it must STOP for him every time. THE FRICTION IS THE FEATURE.
//      Never "helpfully" automate around it. No --yes flag. No CI hook.
//
// HOW SCOTT RUNS IT: double-click `Promote Kids` in Desktop\SimplyKnown Promote\. That launches
// promote-kids.bat at the repo root, which runs this. It prints what is about to ship and asks
// for the version number; type it exactly and press Enter. Anything else cancels.
//
// BUILT TO: Deploy & Release Standard PART D6 (the canonical gate) + Testing Standard §3.5.
// COPIED FROM Land's scripts/promote.mjs (the proven template) and adapted for what is
// Kids-specific. The refusal order below is D6's, deliberately, so every app refuses in the
// same order:
//   1 dirty tree · 2 HEAD != freshly fetched origin/main · 3 wrong branch ·
//   4 DEV-VERIFIED stamp missing / not clean / wrong commit · 5 migration parity (Kids has no
//   migrations system at all -- a LOUD notice, never a faked check) · 6 typed approval = the
//   VERSION NUMBER · 7 an untriaged HIGH Codex finding · 8 post-deploy record + live-URL
//   check = ALARM, not refusal.
// Every refusal is re-run AFTER the typed approval, immediately before the deploy.
//
// KIDS-SPECIFIC, and NOT to be "fixed" back to Land's shape:
//   - Kids is a PUBLIC app (rule 8.13's deliberate exception) -- there is no Cloudflare Access
//     on production, by design, for anyone to check. So step 8 here does something Land's
//     twin CANNOT: fetch the live version.js on both real addresses and read the number back,
//     a genuine end-to-end proof, not just a deployment-record read.
//   - Kids has NO migrations system of any kind (no D1, no schema.sql) for the STATIC SITE this
//     gate deploys. Said out loud as a notice, never fabricated as a check that could not fail.
//     The sync Worker (workers/sync/, its own D1) is explicitly OUT OF SCOPE of this gate --
//     it deploys separately, by hand, `wrangler deploy` from workers/sync/, a Scott-run step.
//   - Kids' custom domain (kids.simplyknown.co) is STILL served by GitHub Pages as of this
//     writing, auto-deploying on every push to main -- the Cloudflare Pages project
//     (simplyknown-kids) this gate deploys to is not yet the thing the public URL points at.
//     Until Scott does the DNS cutover (his typed go, a public app + DNS change), this gate is
//     "built, not yet the only door": it deploys the RIGHT thing to the RIGHT place, but
//     kids.simplyknown.co itself will keep showing GitHub Pages' old content regardless. Said
//     plainly at step 8, every run, not glossed over.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { PROD_PROJECT } from './deploy-dev1.mjs';
import { PUBLISH } from './stage-site.mjs';
import { stageFromGitHead } from './lib/stage-from-git.mjs';

const CFG = {
  app: 'Kids',
  prodUrl: 'https://kids.simplyknown.co',
  pagesProject: PROD_PROJECT, // 'simplyknown-kids' -- never retyped, imported from the one place it's hard-coded
  accountId: '800641c6f1cf4d042c8ed396c6d901a1',
  tokenFile: 'secrets/cf_api_token.txt',
  versionFile: 'js/version.js',
  stampFile: 'docs/verify/DEV-VERIFIED.json',
  releaseLog: 'docs/releases.md',
  codexNotes: 'CODEX-NOTES.md',
  codexTriage: 'docs/CODEX-TRIAGE.md',
  // Both real addresses this Pages project answers on, per rule 8.13's spirit (check both, not
  // just the pretty one) -- adapted here into a version-string proof instead of an Access
  // redirect check, because Kids is deliberately PUBLIC and has no Access to check.
  versionCheckHosts: ['https://kids.simplyknown.co', 'https://simplyknown-kids.pages.dev'],
};

const R = '\x1b[31m', G = '\x1b[32m', Y = '\x1b[33m', B = '\x1b[1m', X = '\x1b[0m';
const say = (s = '') => process.stdout.write(s + '\n');
const step = (label) => say(`${B}→ ${label}${X}`);
const die = (why, fix) => {
  say(`\n${R}${B}STOPPED — nothing has been deployed.${X}`);
  say(`${R}${why}${X}`);
  if (fix) say(`\n  What to do: ${fix}`);
  process.exit(1);
};
const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

// Read the version from the constant AS IT IS AT HEAD, not as it sits on disk. The tree has to be
// clean to get this far, so they are the same thing — but reading from the commit means the number
// Scott types is provably the number in the code that ships.
function versionAtHead() {
  let src;
  try { src = sh(`git show HEAD:${CFG.versionFile}`); }
  catch { die(`${CFG.versionFile} does not exist at HEAD.`, `create it with  const APP_VERSION = '1.0.0';`); }
  const m = src.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!m) die(`Could not read APP_VERSION out of ${CFG.versionFile}.`, 'it must be a plain string constant.');
  if (!/^\d+\.\d+\.\d+$/.test(m[1])) {
    die(`APP_VERSION is "${m[1]}", which is not MAJOR.MINOR.PATCH.`, 'use semver, with no leading "v".');
  }
  return m[1];
}

// Codex 0903-3: stageFromGitHead (scripts/lib/stage-from-git.mjs) builds
// .publish/ straight from git's own object database at a commit -- never
// fs.copyFileSync from the working tree (that's what scripts/stage-site.mjs's
// own runnable form does, and stays correct for dev, which wants fast
// uncommitted iteration). A file changing on disk after the last clean-tree
// check -- mid-stage, mid-upload -- can no longer ship anything that was not
// actually reviewed. Extracted to its own module so it's unit-testable
// against a scratch repo, not provable only by running this whole
// interactive, network-touching script end to end.
const OUT_DIR = path.resolve(path.resolve(import.meta.dirname, '..'), '.publish');

say(`\n${B}Promote ${CFG.app} to PRODUCTION${X}\n`);

// ── the refusals, in the standard's order ────────────────────────────────────────────────────

// 1. A deploy uploads what is ON DISK, not what is in git. An uncommitted edit ships silently and
//    then exists nowhere but this machine.
const dirty = sh('git status --porcelain').split('\n').filter((l) => l.trim());
if (dirty.length) {
  die(`${dirty.length} uncommitted change(s):\n  ` + dirty.join('\n  '),
      'commit and push them first, so what ships is what is in git.');
}

// 2. Fetch, then require an EXACT match with origin/main — in both directions. Checking only
//    "not ahead" let a clean but STALE checkout deploy older code over a newer production release.
try { execSync('git fetch --quiet origin main', { stdio: 'ignore' }); }
catch { die('Could not reach GitHub to check what is really on origin/main.',
            'connect and re-run. A gate that cannot check must not wave you through.'); }

let upstream;
try { upstream = sh('git rev-parse --abbrev-ref --symbolic-full-name @{u}'); }
catch { die('This branch has no upstream configured.', 'set it to track origin/main first.'); }
if (upstream !== 'origin/main') die(`This branch tracks "${upstream}", not origin/main.`, 'switch to main.');

const remoteSha = sh('git rev-parse origin/main');
if (sh('git rev-parse HEAD') !== remoteSha) {
  const ahead = sh('git rev-list --count origin/main..HEAD');
  const behind = sh('git rev-list --count HEAD..origin/main');
  die(`Local main does not match origin/main (${ahead} ahead, ${behind} behind).`,
      Number(behind) > 0
        ? 'git pull first — someone else pushed, and deploying now would ship OLDER code to production.'
        : 'git push first — GitHub is the backup of truth.');
}

// 3. Wrong branch.
const branch = sh('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') die(`You are on branch "${branch}", not main.`, 'switch to main.');

// 4. The dev verification stamp must vouch for THIS EXACT COMMIT. "Fresh" is not about wall-clock
//    age — a stamp written ten minutes ago for a different commit is stale, and a week-old stamp
//    for the same unchanged commit is valid. Written only by `npm run verify:dev`, never by hand,
//    and git-ignored (committing it would change HEAD and instantly invalidate itself).
const headSha = sh('git rev-parse --short HEAD');
if (!existsSync(CFG.stampFile)) {
  die(`No dev verification for this exact commit — run the dev pass first.\n  (${CFG.stampFile} does not exist.)`,
      'run  npm run verify:dev  (the stamp is git-ignored local evidence — do not commit it).');
}
let stamp;
try { stamp = JSON.parse(readFileSync(CFG.stampFile, 'utf8')); }
catch (e) { die(`${CFG.stampFile} is not readable JSON: ${e.message}`, 're-run  npm run verify:dev'); }
if (stamp.commit !== headSha) {
  die(`No dev verification for this exact commit — run the dev pass first.\n` +
      `  stamped commit : ${stamp.commit}\n  shipping commit: ${headSha}`,
      'run  npm run verify:dev  (the stamp is git-ignored local evidence — do not commit it).');
}
if (stamp.result !== 'clean') {
  die(`The dev verification for ${headSha} did not come back clean (result: "${stamp.result}").`,
      'fix what failed, then re-run  npm run verify:dev');
}

// The version, and the two places it is written must agree.
const version = versionAtHead();
const pkgVersion = JSON.parse(sh('git show HEAD:package.json')).version;
if (pkgVersion !== version) {
  die(`${CFG.versionFile} says ${version} but package.json says ${pkgVersion}.`,
      'make them match, then re-run the dev pass — the number Scott types must be unambiguous.');
}

// Codex finding #2 of the 2026-09-02 review (this exact gap): nothing stopped the SAME version
// shipping twice with different code, which makes the release log a lie and "which version am I
// on?" unanswerable. The log is the record of what has already gone out, so it is the right thing
// to check against.
if (existsSync(CFG.releaseLog)) {
  const log = readFileSync(CFG.releaseLog, 'utf8');
  // Plain column scan rather than a regex — the log is a markdown table and the escaping
  // needed to match a dotted version inside one was its own bug waiting to happen.
  const already = log.split(/\r?\n/).some((line) => {
    const cols = line.split('|').map((c) => c.trim());
    return cols.length > 3 && cols[2] === version;
  });
  if (already) {
    die(`Version ${version} has already been released — see ${CFG.releaseLog}.`,
        `bump APP_VERSION in ${CFG.versionFile} (and package.json), re-run npm run verify:dev, then try again.`);
  }
}

// 7. An untriaged HIGH Codex finding refuses (D6.7 / Testing Standard §3.5). MED and LOW never
//    block. The point is not that Codex is right — often it is not — but that somebody looked and
//    wrote down what they decided. CODEX-NOTES.md is git-ignored, so a fresh clone has none: no
//    notes means nothing to triage, which is a pass.
// Logic copied VERBATIM from Land's scripts/promote.mjs (rebuilt there 2026-09-01 after Codex
// found the first version was security theatre — see that file's own history for why).
const DECISION = /\b(FIXED|REJECTED|ACCEPTED RISK)\b/;

function highTitlesIn(notes) {
  const out = new Set();
  const patterns = [
    /^\s*\d+\.\s*\*\*HIGH\s*[-–—:]\s*([^*]+?)\*\*/gim,   // 1. **HIGH — title**
    /^\s*[-*]\s*\*\*HIGH\s*[-–—:]\s*([^*]+?)\*\*/gim,    // - **HIGH — title**
    /^\s*#+\s*HIGH\s*[-–—:]\s*(.+)$/gim,                 // ### HIGH — title
    // Anchored to the start of a line on purpose. Unanchored, this matched a sentence that merely
    // MENTIONED "Severity: HIGH" while explaining another finding, and invented a phantom HIGH that
    // no decision could ever satisfy — a gate that can never pass is as broken as one that always does.
    /^\s*(?:\*\*)?Severity:\s*HIGH(?:\*\*)?[^\n]*\n+\s*(?:\*\*)?([^\n*]+)/gim,
  ];
  for (const re of patterns) for (const m of notes.matchAll(re)) {
    const t = (m[1] || '').trim().replace(/\s+/g, ' ');
    if (t) out.add(t);
  }
  return [...out];
}

// A title is triaged only if a verdict word sits within the same entry — searched from the title
// to the next blank-line-separated heading, capped so a verdict three findings away cannot count.
function isTriaged(title, triage) {
  const at = triage.indexOf(title);
  if (at < 0) return false;
  return DECISION.test(triage.slice(at, at + 800));
}

// Codex 0903-4: this used to be a one-shot check, run only here, before the prompt. Nothing
// stopped CODEX-NOTES.md or docs/CODEX-TRIAGE.md from changing in the seconds the prompt sat
// open -- a fresh Codex finding landing, or a triage verdict getting reverted, same race the
// dirty-tree/HEAD/origin/stamp checks below already guard against. Now a function, called here
// AND again in the post-approval re-check, so both moments see the same file state.
function checkCodexTriage(quiet) {
  if (existsSync(CFG.codexNotes)) {
    const notes = readFileSync(CFG.codexNotes, 'utf8');
    const triage = existsSync(CFG.codexTriage) ? readFileSync(CFG.codexTriage, 'utf8') : '';
    const highs = highTitlesIn(notes);
    const untriaged = highs.filter((h) => !isTriaged(h, triage));
    if (untriaged.length) {
      die(`${untriaged.length} of ${highs.length} HIGH Codex finding(s) have no written decision:\n  ` +
          untriaged.map((h) => '• ' + h).join('\n  '),
          `in ${CFG.codexTriage}, under each title, write one of:\n` +
          '    FIXED <commit>   ·   REJECTED — <reason>   ·   ACCEPTED RISK — <reason>\n' +
          '  Pasting the finding in without a verdict is NOT a decision, and no longer passes.');
    }
    if (highs.length && !quiet) say(`${G}✓${X} ${highs.length} HIGH Codex finding(s), each with a written decision\n`);
  } else if (!quiet) {
    say(`${Y}(no ${CFG.codexNotes} in this checkout — nothing to triage, which is a pass)${X}\n`);
  }
}
checkCodexTriage(false);

if (!existsSync(CFG.tokenFile)) {
  die(`No Cloudflare token at ${CFG.tokenFile}.`, 'this script only runs on Scott\'s machine.');
}
process.env.CLOUDFLARE_API_TOKEN = readFileSync(CFG.tokenFile, 'utf8').trim();
process.env.CLOUDFLARE_ACCOUNT_ID = CFG.accountId;

// ── what is about to ship ────────────────────────────────────────────────────────────────────
// 5. Migration parity: Kids has NO migrations system at all for the static site this gate
//    deploys (no D1, no schema.sql here) — said out loud, never faked with a check that could
//    not fail. The sync Worker DOES have its own D1 (workers/sync/), but that Worker is a
//    separate, manual, Scott-run deploy (`wrangler deploy` from workers/sync/) — explicitly
//    OUT OF SCOPE of this gate. If this release needs a sync Worker change, that is a second,
//    independent step this script does not touch and cannot verify.
const subject = sh('git log -1 --format=%s');

say(`${B}About to deploy to PRODUCTION${X}`);
say(`  Version   ${B}${version}${X}`);
say(`  Commit    ${headSha} (main, pushed)  ${subject}`);
say(`  Goes to   Cloudflare Pages project ${B}${CFG.pagesProject}${X}`);
say(`  Migration ${Y}NOT CHECKED — Kids has no migrations system for the static site (no D1, no`);
say(`            schema.sql). The sync Worker's own D1 is a SEPARATE, manual, Scott-run deploy`);
say(`            (\`wrangler deploy\` from workers/sync/) — this gate does not touch it and cannot`);
say(`            tell you whether this release needs that step too. If in doubt, check by hand.${X}`);
say(`  Cutover   ${Y}kids.simplyknown.co is STILL served by GitHub Pages as of right now — this`);
say(`            deploy goes to the Cloudflare Pages project, which is not yet what the public`);
say(`            domain points at. The custom domain will keep showing the OLD (GitHub Pages)`);
say(`            file until Scott does the DNS cutover. Step 8 below checks and reports this`);
say(`            plainly — it is an ALARM condition today, not a bug in this deploy.${X}`);
say('');
say(`${Y}This puts code in front of the internet. It cannot be undone from here.${X}`);
say('');

// ── 6. the gate: type the VERSION ────────────────────────────────────────────────────────────
// Mashing y is easy. Typing the number of what is shipping is a deliberate act. This is the whole
// point of the script; do not replace it with a yes/no prompt, and do not add a --yes flag.
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await new Promise((res) => rl.question(`Type the version number to go ahead, or anything else to stop: `, res));
rl.close();

if (answer.trim() !== version) {
  say(`\n${G}Stopped. Nothing was deployed.  (you typed "${answer.trim()}", expected "${version}")${X}\n`);
  process.exit(0);
}

// ── re-check the WHOLE list, now that a human has been typing ────────────────────────────────
// Every refusal above ran BEFORE the prompt, and the deploy uploads what is on disk. An editor
// saving a file, a background git process, a colleague's push, or a second terminal switching
// branches during those seconds would otherwise ship something nobody verified.
step('Re-checking everything before the point of no return');
const stillDirty = sh('git status --porcelain').split('\n').filter((l) => l.trim());
if (stillDirty.length) {
  die(`The working tree CHANGED while the prompt was open:\n  ` + stillDirty.join('\n  '),
      'nothing was deployed. Check what altered those files, then start again.');
}
if (sh('git rev-parse --abbrev-ref HEAD') !== 'main') {
  die('The branch CHANGED while the prompt was open.', 'nothing was deployed. Return to main and start again.');
}
if (sh('git rev-parse --short HEAD') !== headSha) {
  die(`HEAD CHANGED while the prompt was open — it is now ${sh('git rev-parse --short HEAD')}, not ${headSha}.`,
      'nothing was deployed. Start again so you type what is actually shipping.');
}
try { execSync('git fetch --quiet origin main', { stdio: 'ignore' }); }
catch { die('Lost contact with GitHub while the prompt was open.', 'nothing was deployed. Reconnect and start again.'); }
if (sh('git rev-parse HEAD') !== sh('git rev-parse origin/main')) {
  die('origin/main MOVED while the prompt was open — your machine no longer matches GitHub.',
      'nothing was deployed. Pull, re-run the dev pass, and start again.');
}
if (!existsSync(CFG.stampFile)) {
  die('The dev verification stamp DISAPPEARED while the prompt was open.', 'nothing was deployed. Re-run npm run verify:dev.');
}
{
  const again = JSON.parse(readFileSync(CFG.stampFile, 'utf8'));
  if (again.commit !== headSha || again.result !== 'clean') {
    die(`The dev verification stamp CHANGED while the prompt was open (commit ${again.commit}, result "${again.result}").`,
        'nothing was deployed. Re-run npm run verify:dev and start again.');
  }
}
if (versionAtHead() !== version) {
  die(`The version CHANGED while the prompt was open — ${CFG.versionFile} now says ${versionAtHead()}, not ${version}.`,
      'nothing was deployed. Start again so you type what is actually shipping.');
}
checkCodexTriage(true); // Codex 0903-4 -- same check the pre-prompt pass ran, in case a HIGH landed (or a verdict was reverted) while the prompt sat open

// ── deploy ───────────────────────────────────────────────────────────────────────────────────
// Codex 0903-3, HIGH: `npm run stage` (scripts/stage-site.mjs) copies each git-tracked file's
// WORKING TREE bytes via fs.copyFileSync -- correct for dev (deploy:dev1 wants fast, uncommitted
// iteration) but wrong here. Everything above proves the tree was clean a moment ago; staging and
// the network upload below take real wall-clock time, and nothing re-checked disk at the instant
// those bytes were read. A background process, an editor autosave, mid-upload, could ship
// something nobody verified, silently. Prod stages from `git show HEAD:<path>` instead --
// straight out of the commit object, never touching whatever the working tree says right now, so
// there is no window left for this to matter. --commit-dirty=true is DROPPED here on purpose: a
// git-archive-style build owes wrangler no dirty-tree exception, because it was never built from
// the (possibly dirty) working tree to begin with.
step('Staging (from git HEAD, not the working tree)');
{
  const { files } = stageFromGitHead(process.cwd(), OUT_DIR, headSha, PUBLISH);
  if (!files) die('git listed no files for the publish set at this commit.', 'is this a git checkout?');
  if (files > 20000) die(`over the Cloudflare Pages 20,000-file limit: ${files}`, 'trim the PUBLISH list in scripts/stage-site.mjs.');
  say(`  ${G}✓${X} staged ${files} files from commit ${headSha}, not the working tree`);
}

step(`Deploying ${version} to ${CFG.pagesProject}`);
execSync(`npx --yes wrangler@4.127.1 pages deploy .publish --project-name=${CFG.pagesProject} --branch=main`,
  { stdio: 'inherit', env: { ...process.env, CI: 'true' } });

// ── 8. verify the END STATE — an ALARM, never a refusal (the release is already out) ─────────
say('');
step(`Verifying against Cloudflare's deployment record`);
let verified = false;
const wantSha = sh('git rev-parse HEAD');
for (let i = 1; i <= 3; i++) {
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CFG.accountId}` +
                `/pages/projects/${CFG.pagesProject}/deployments?per_page=5`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` } });
    const list = (await res.json())?.result || [];
    const dep = list.find((d) => (d.deployment_trigger?.metadata?.commit_hash || '') === wantSha)
             || list.find((d) => (d.deployment_trigger?.metadata?.commit_hash || '').startsWith(headSha));
    if (dep) {
      const status = dep.latest_stage?.status;
      say(`  read ${i}/3 → ${dep.id?.slice(0, 8)}  env=${dep.environment}  ${dep.latest_stage?.name}/${status}  commit=${headSha}`);
      verified = dep.environment === 'production' && status === 'success';
      if (verified) break;
    } else {
      say(`  read ${i}/3 → no production deployment recorded for commit ${headSha} yet`);
    }
  } catch (e) { say(`  read ${i}/3 → ${Y}could not read the record: ${e.message}${X}`); }
  if (i < 3) await new Promise((r) => setTimeout(r, 5000));
}

// Kids is PUBLIC (rule 8.13's deliberate exception -- no Access on this app, by design), so
// unlike Land this gate can do a REAL end-to-end proof: fetch the live version.js on both real
// addresses this Pages project answers on, and check the typed version actually shows up. This
// is strictly better evidence than the deployment record alone, so it runs even when the record
// above already came back verified.
step('Checking the live version.js on both addresses');
say(`${Y}⚠ Until the DNS cutover, kids.simplyknown.co is still GitHub Pages -- expect it to show`);
say(`  the OLD version until Scott moves the CNAME to Cloudflare Pages. That is not a failure of`);
say(`  THIS deploy; it is the known, tracked gap this gate cannot close by itself.${X}`);
let liveOk = true;
for (const host of CFG.versionCheckHosts) {
  const url = host + '/js/version.js';
  try {
    const r = await fetch(url, { cache: 'no-store' });
    const body = r.ok ? await r.text() : '';
    const has = body.includes(`'${version}'`) || body.includes(`"${version}"`);
    say(`  ${has ? G + '✓' + X : R + '✗' + X} ${url}  HTTP ${r.status}${has ? '  contains v' + version : '  does NOT show v' + version}`);
    if (!has) liveOk = false;
  } catch (e) {
    say(`  ${Y}?${X} ${url}  could not be checked: ${e.message}`);
    liveOk = false;
  }
}
if (!liveOk) {
  say(`\n${Y}${B}⚠ ALARM — at least one address does not yet show v${version}.${X}`);
  say(`${Y}The deploy went out and Cloudflare may confirm it above, but the public-facing check`);
  say(`did not pass on every address. If kids.simplyknown.co is the one that failed and GitHub`);
  say(`Pages still owns that domain, this is EXPECTED until the cutover — see the notice above.`);
  say(`If simplyknown-kids.pages.dev also failed, that is a real problem: investigate now.${X}`);
}

if (!verified) {
  say(`\n${Y}${B}Deployed, but Cloudflare has not confirmed this commit as a successful production deployment.${X}`);
  say(`${Y}It may still be building. Nothing has been written to ${CFG.releaseLog} — check the`);
  say(`Cloudflare dashboard, then check ${CFG.versionCheckHosts[1]}/js/version.js yourself.${X}\n`);
  process.exit(1);
}

// ── the release log ──────────────────────────────────────────────────────────────────────────
// Written by the gate, so the log cannot drift from what actually shipped.
step('Writing the release log');
try {
  const today = new Date().toISOString().slice(0, 10);
  const row = `| ${today} | ${version} | ${headSha} | ${subject.replace(/\|/g, '\\|')} |`;
  const log = readFileSync(CFG.releaseLog, 'utf8');
  const placeholder = /^\|\s*—\s*\|.*$/m;
  const updated = placeholder.test(log)
    ? log.replace(placeholder, row)
    : log.replace(/^(\|---\|---\|---\|---\|\s*)$/m, `$1\n${row}`);
  writeFileSync(CFG.releaseLog, updated);
  say(`  ${G}✓${X} Release ${version} logged in ${CFG.releaseLog}`);
  say(`  ${Y}commit that file — the log is part of the repo, and the next promote refuses on a dirty tree.${X}`);
} catch (e) {
  say(`  ${Y}could not write ${CFG.releaseLog}: ${e.message}${X}`);
}

say(`\n${G}${B}Done. ${CFG.app} ${version} is deployed and Cloudflare confirms it.${X}`);
if (!liveOk) {
  say(`${Y}Reminder: the live version.js check above did not pass on every address — see the`);
  say(`ALARM note. Kids is public, so open ${CFG.versionCheckHosts[1]} yourself and look.${X}\n`);
} else {
  say(`${Y}Note:${X} open ${CFG.prodUrl} yourself and check Parent Settings shows ${B}v${version}${X}.\n`);
}
