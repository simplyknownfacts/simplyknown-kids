// D8 enforcement (Deploy & Release Standard PART D8, Scott's ruling
// 2026-09-01): "production is reachable through exactly one reviewed door."
// This greps the whole repo for a raw wrangler deploy / wrangler pages
// deploy invocation, or a bare --commit-dirty=true, landing anywhere OTHER
// than the small, reviewed allow-list below -- the exact "a forgotten .bat
// two folders over ships anyway" failure D8 exists to close. Worth having
// even before a full promote-kids.bat gate exists: it also catches a bad
// FIRST gate script the moment it's written.
//
// Run: node scripts/verify/no-ungated-deploy.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

// Every file allowed to mention a raw wrangler deploy call or
// --commit-dirty=true, because each has been reviewed against D6/D8: a
// hard-coded target identity checked in code, never an inferred or ambient
// project name. Add to this list only with a reason, and review the file
// before you do.
const REVIEWED = new Set([
  // package.json is NOT in this list -- as of 2026-09-02, deploy:prod-preview is a plain
  // refusal (no wrangler mention) and deploy:dev1/promote both just invoke a guarded script,
  // so package.json's own text no longer contains a raw wrangler/--commit-dirty pattern. If a
  // future edit makes it match again, that is exactly what this guard exists to catch -- do
  // not add it back preemptively.
  'scripts/deploy-dev1.mjs',                // DEV wrapper -- hard-coded target, --commit-dirty=true is a documented dev-only allowance
  'scripts/promote.mjs',                    // THE one door to prod (D6/D8) -- target is PROD_PROJECT imported from deploy-dev1.mjs, never
                                             // an inferred/typed-in-place string, and every refusal above this line has already run and
                                             // re-run by the time this line is reached. --commit-dirty=true is safe here only because
                                             // this script's OWN clean-tree check (stricter than wrangler's) already ran twice.
  'scripts/verify/no-ungated-deploy.mjs',   // this file, whose own doc comment names the pattern being searched for
  'scripts/require-clean-tree.mjs',         // never invokes wrangler at all; its comment just NAMES --commit-dirty=true while explaining the problem it guards against
]);

let tracked;
try {
  tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8').split('\0').filter(Boolean);
} catch (e) {
  console.error('no-ungated-deploy: could not read git ls-files (' + e.message + ').');
  process.exit(1);
}

// Scan only things that can actually RUN as a script, plus package.json (npm
// scripts). This deliberately excludes tests/ (fixture strings that PROVE
// this guard catches a bad pattern would otherwise flag themselves) and
// docs/ (prose describing or historically recording a command is not a
// script that executes) -- the real risk this guard exists for is an
// executable file, not a mention of the word "deploy" anywhere in the repo.
const SCAN_EXTENSIONS = new Set(['.mjs', '.js', '.cjs', '.sh', '.bat', '.cmd', '.ps1']);
const EXCLUDED_PREFIXES = ['tests/', 'docs/', 'node_modules/'];

const DEPLOY_RE = /\bwrangler(@[\w.]+)?\s+(pages\s+)?deploy\b/;
const DIRTY_RE = /--commit-dirty(=|\s)/;

const problems = [];
for (const rel of tracked) {
  if (REVIEWED.has(rel)) continue;
  if (EXCLUDED_PREFIXES.some((p) => rel.startsWith(p))) continue;
  const isPackageJson = rel === 'package.json';
  if (!isPackageJson && !SCAN_EXTENSIONS.has(path.extname(rel))) continue;

  const abs = path.join(ROOT, rel);
  let text;
  try { text = readFileSync(abs, 'utf8'); } catch { continue; } // binary/unreadable -- not a text deploy script

  if (DEPLOY_RE.test(text)) {
    problems.push(rel + ': a raw wrangler deploy invocation outside the reviewed list');
  }
  if (DIRTY_RE.test(text)) {
    problems.push(rel + ': --commit-dirty=true outside the reviewed list');
  }
}

if (problems.length) {
  console.error('D8 VIOLATION -- production must be reachable through one reviewed door only:\n');
  for (const p of problems) console.error('  - ' + p);
  console.error(
    '\nEither remove this, or add the file to REVIEWED in scripts/verify/no-ungated-deploy.mjs ' +
    'with a comment explaining why its target is hard-coded and checked, not inferred.'
  );
  process.exit(1);
}

console.log('no-ungated-deploy: clean -- only the reviewed scripts invoke wrangler deploy.');
