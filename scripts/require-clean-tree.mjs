// Refuse to continue if the git working tree is not clean.
//
// HIGH, found live 2026-09-01: deploy:prod-preview stages whatever bytes are
// currently on disk (scripts/stage-site.mjs copies each git-tracked file's
// WORKING TREE content, not its last commit) and ships that straight to the
// PRODUCTION Cloudflare Pages project with --commit-dirty=true. Nothing
// stopped an uncommitted, unreviewed change from going live -- the same
// "what's running matches nothing in git" trap the sync Worker hit once
// before (TECH-STACK.md's v141 lesson), here on the static-site deploy path.
//
// Run from the repo this script lives in (no args needed); a test spawns it
// with a different `cwd` to check it against a scratch repo instead.
import { execSync } from 'node:child_process';

let status;
try {
  status = execSync('git status --porcelain', { encoding: 'utf8' });
} catch (e) {
  console.error('deploy refused: could not read git status (' + e.message + ').');
  process.exit(1);
}

if (status.trim()) {
  console.error('deploy refused: the working tree is not clean.');
  console.error('');
  console.error(status);
  console.error('Commit (or stash) first -- production only ever ships from committed source.');
  process.exit(1);
}

console.log('working tree is clean.');
