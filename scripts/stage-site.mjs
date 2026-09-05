// Build .publish/ — the exact set of files that goes to Cloudflare Pages.
//
// This is an ALLOW-list on purpose. The repo root also holds audit screenshots,
// Worker source, tests and scratch pages; an exclude-list would silently start
// publishing the next stray file someone drops here. Copying only. No bundling,
// no minifying, no rewriting — the zero-build simplicity is the point.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');

// Exported so scripts/promote.mjs can reuse this SAME list for its own
// git-archive-based prod build (Codex 0903-3) -- one allow-list, never
// retyped, whichever way a given deploy path stages its files.
export const PUBLISH = [
  // pages
  'index.html', 'home.html', 'about.html', 'privacy.html', 'achievements.html',
  'yoto-callback.html',
  // home.html hub-world art (the approved v1 island image — see CLAUDE.md hub-home).
  // Its prototype file (redesign-hub-mock.html) and the sibling direction mocks
  // stay OUT on purpose — internal-only, never shipped.
  'redesign-hub-bg.jpg',
  // PWA plumbing
  'manifest.json', 'offline-manifest.json', 'sw.js', 'icon-192.png', 'icon-512.png',
  // Identity marker, so the verify pass can prove it is grading THIS app.
  // Shipped on purpose: it must be reachable on a deployed environment too.
  '__health.json',
  // Codex 0825-10: Cloudflare Pages' header-injection file. No effect on
  // GitHub Pages (still what kids.simplyknown.co serves as of this
  // writing) -- shipped anyway so it's ready and reviewed before the
  // cutover, not another thing to remember on that day.
  '_headers',
  // app directories
  'css', 'js', 'assets', 'audio', 'mascots',
  'art', 'games', 'learning', 'listen', 'parent', 'videos',
];

// Codex 0903-3: this whole build-from-working-tree step used to run
// unconditionally at module load, which meant simply IMPORTING this file
// for its PUBLISH list (scripts/promote.mjs does, for its own git-archive-
// based prod build) would ALSO wipe and rebuild .publish/ from whatever is
// currently on disk -- exactly the working-tree drift the git-archive path
// exists to avoid. Guarded now: this only runs when the file is executed
// directly (`node scripts/stage-site.mjs`), never on import.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  // Where to build. Defaults to .publish, which is what the deploy uploads.
  // Overridable so a test can build into its OWN folder instead of wiping the
  // real one: two builds sharing a directory race each other, and on Windows the
  // recursive delete then fails with ENOTEMPTY while the other run is still
  // writing. Accepts an argument or PUBLISH_DIR.
  //   node scripts/stage-site.mjs                     -> .publish
  //   node scripts/stage-site.mjs .publish-test-123   -> that folder
  //   PUBLISH_DIR=.publish-test-123 node scripts/stage-site.mjs
  const OUT = path.resolve(ROOT, process.argv[2] || process.env.PUBLISH_DIR || '.publish');
  if (!OUT.startsWith(ROOT + path.sep)) throw new Error('stage-site: destination must be inside the repo');

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  // Copy only files GIT TRACKS.
  //
  // Copying whole directories copies the WORKING TREE, so anything sitting
  // untracked or git-ignored inside js/, parent/, audio/ and the rest would be
  // published to a public website -- scratch notes, a stray export, a key
  // someone parked "just for a second". The allow-list above says which parts of
  // the app ship; git says which files are really part of it. Both must agree.
  const tracked = execFileSync('git', ['ls-files', '-z', '--', ...PUBLISH], {
    cwd: ROOT, maxBuffer: 64 * 1024 * 1024,
  }).toString('utf8').split('\0').filter(Boolean);

  if (!tracked.length) throw new Error('stage-site: git listed no files — is this a git checkout?');

  let files = 0;
  for (const rel of tracked) {
    const from = path.join(ROOT, rel);
    if (!fs.existsSync(from)) continue;           // tracked but deleted locally
    const to = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  // Codex 0905-3, HIGH: record the commit HEAD was at when this dev build was staged, so a live
  // host can be asked "which commit are you actually running" -- not just "which APP_VERSION
  // string", which does not change on every commit and can therefore authorize a stale dev
  // deploy forever (Deploy & Release Standard PART D10). Mirrors what stageFromGitHead already
  // writes for the prod build (scripts/lib/stage-from-git.mjs). Generated here, never committed
  // to git itself -- this file describes the BUILD, not the source.
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(OUT, 'version.json'),
    JSON.stringify({ commit, staged: new Date().toISOString() }, null, 2) + '\n');

  (function count(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) count(path.join(d, e.name));
      else files++;
    }
  })(OUT);

  console.log('staged ' + files + ' files into ' + path.relative(ROOT, OUT) + '/');
  if (files > 20000) throw new Error('over the Cloudflare Pages 20,000-file limit: ' + files);
}
