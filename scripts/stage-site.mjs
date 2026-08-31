// Build .publish/ — the exact set of files that goes to Cloudflare Pages.
//
// This is an ALLOW-list on purpose. The repo root also holds audit screenshots,
// Worker source, tests and scratch pages; an exclude-list would silently start
// publishing the next stray file someone drops here. Copying only. No bundling,
// no minifying, no rewriting — the zero-build simplicity is the point.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

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

const PUBLISH = [
  // pages
  'index.html', 'home.html', 'about.html', 'privacy.html', 'achievements.html',
  'yoto-callback.html',
  // PWA plumbing
  'manifest.json', 'offline-manifest.json', 'sw.js', 'icon-192.png', 'icon-512.png',
  // app directories
  'css', 'js', 'assets', 'audio', 'mascots',
  'art', 'games', 'learning', 'listen', 'parent', 'videos',
];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let files = 0;
for (const entry of PUBLISH) {
  const from = path.join(ROOT, entry);
  if (!fs.existsSync(from)) throw new Error('stage-site: missing ' + entry);
  fs.cpSync(from, path.join(OUT, entry), { recursive: true });
}
(function count(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) count(path.join(d, e.name));
    else files++;
  }
})(OUT);

console.log('staged ' + files + ' files into ' + path.relative(ROOT, OUT) + '/');
if (files > 20000) throw new Error('over the Cloudflare Pages 20,000-file limit: ' + files);
