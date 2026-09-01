// Publishing the wrong files to a public children's site is a leak, not a bug.
// This pins exactly what reaches Cloudflare Pages.
import { test, after } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// Build into a folder of OUR OWN, never the real .publish.
//
// Two reasons. First, .publish is the deploy output: a test run should not wipe
// what someone is about to upload. Second, and the actual bug this fixes, two
// `npm test` runs at once -- easy to hit with more than one agent in the repo --
// had both processes wiping and rebuilding the same 5,000-file directory. On
// Windows the recursive delete then failed with ENOTEMPTY while the other run
// was still writing into it, and all three tests in this file failed together
// for a reason that had nothing to do with the app.
//
// The pid makes it unique per process, so concurrent runs cannot collide.
const OUT = path.join(ROOT, '.publish-test-' + process.pid);

// Stage once, read three times. Cheaper, and there is nothing to race.
let staged = false;
function stage() {
  if (staged) return;
  execFileSync(process.execPath, ['scripts/stage-site.mjs', OUT], { cwd: ROOT, stdio: 'pipe' });
  staged = true;
}

after(() => { fs.rmSync(OUT, { recursive: true, force: true }); });
const has = (p) => fs.existsSync(path.join(OUT, p));

test('the app itself is published', () => {
  stage();
  for (const f of ['index.html', 'home.html', 'sw.js', 'manifest.json', 'icon-192.png',
                   'js/sync.js', 'css/style.css', 'games/tap-pop.html',
                   'learning/count-along.html', 'art/stamp-art.html', 'parent/settings.html']) {
    assert.ok(has(f), `expected ${f} to be published`);
  }
});

test('nothing internal is published', () => {
  stage();
  for (const f of ['tests', 'docs', 'workers', 'scripts', 'secrets', '.env', '.git',
                   'CODEX-NOTES.md', 'TECH-STACK.md', 'CNAME',
                   'bp-review-06.png', 'design-after-home2.png', 'v136-candy-home.png',
                   'voice-test.html', 'voice-test', 'mascot-preview.html', 'trophy-demo.html',
                   'redesign-mocks.html']) {
    assert.ok(!has(f), `${f} must NOT be published`);
  }
});

test('no published page links to something we excluded', () => {
  stage();
  const pages = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) pages.push(p);
    }
  })(OUT);
  const broken = [];
  for (const p of pages) {
    // Strip inline scripts first. This app builds image sources at runtime
    // (`src="${coverUrl}"`, `src="' + body.img + '"`), and those are not static
    // links to check -- only real markup references count.
    const html = fs.readFileSync(p, 'utf8').replace(/<script\b[\s\S]*?<\/script>/gi, '');
    // Both quote styles: matching only double quotes let single-quoted markup
    // reference a missing file and still pass, then 404 in production.
    for (const m of html.matchAll(/(?:src|href)\s*=\s*(["'])(?!https?:|data:|mailto:|#)([^"'?#]+)\1?/g)) {
      const href = m[2];
      if (href.includes('${') || href.includes("' +") || href.includes('" +')) continue;
      const target = href.startsWith('/')
        ? path.join(OUT, href)
        : path.resolve(path.dirname(p), href);
      // A link that climbs out of the staged folder must FAIL, not quietly find
      // the file back in the repo. In production there is no repo to fall back
      // on, so "../something-we-excluded" is a broken link even though it
      // resolves here.
      if (!target.startsWith(OUT + path.sep)) {
        broken.push(path.relative(OUT, p) + ' -> ' + href + ' (escapes the published folder)');
        continue;
      }
      if (!fs.existsSync(target)) broken.push(path.relative(OUT, p) + ' -> ' + href);
    }
  }
  assert.deepStrictEqual(broken, [], 'published pages reference missing files');
});
