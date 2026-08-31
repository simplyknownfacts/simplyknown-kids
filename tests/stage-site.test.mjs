// Publishing the wrong files to a public children's site is a leak, not a bug.
// This pins exactly what reaches Cloudflare Pages.
import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.publish');

// Stage ONCE per run, not once per test. All three tests inspect the same
// .publish/ folder, and rebuilding a 5,000-file tree three times over gave
// Windows a chance to still be holding handles from the previous wipe --
// which showed up as an intermittent ENOTEMPTY that looked like a real
// failure. One build, three readers, no race, and it finishes far quicker.
let staged = false;
function stage() {
  if (staged) return;
  execFileSync(process.execPath, ['scripts/stage-site.mjs'], { cwd: ROOT, stdio: 'pipe' });
  staged = true;
}
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
                   'voice-test.html', 'voice-test', 'mascot-preview.html']) {
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
    for (const m of html.matchAll(/(?:src|href)="(?!https?:|data:|mailto:|#)([^"?#]+)/g)) {
      if (m[1].includes('${') || m[1].includes("' +") || m[1].includes('" +')) continue;
      const target = m[1].startsWith('/')
        ? path.join(OUT, m[1])
        : path.resolve(path.dirname(p), m[1]);
      if (!fs.existsSync(target)) broken.push(path.relative(OUT, p) + ' -> ' + m[1]);
    }
  }
  assert.deepStrictEqual(broken, [], 'published pages reference missing files');
});
