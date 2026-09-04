// Codex 0825-20, LOW: js/tiers.js's own top comment said "8 developmental
// tiers" and about.html advertised "roughly ages 1 to 8" while the real
// TIERS array has had 10 entries (0mo - 9+yr) for a while. Both were stale
// docs describing a version of the app that no longer exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const require = createRequire(import.meta.url);

test('js/tiers.js: the top comment names the real tier count', () => {
  // TIERS is declared with `const`, not exported -- read the source directly
  // rather than eval/require it (this file has no module.exports).
  const src = readFileSync(join(ROOT, 'js', 'tiers.js'), 'utf8');
  const tierCount = [...src.matchAll(/\{ tier: \d+,/g)].length;
  assert.equal(tierCount, 10, 'sanity check: expected 10 tier entries in the TIERS array');
  assert.match(src.split('\n')[0], /10 developmental tiers/,
    'the top comment must say "10 developmental tiers", matching the real TIERS array');
});

test('about.html does not claim a stale "ages 1 to 8" range', () => {
  const src = readFileSync(join(ROOT, 'about.html'), 'utf8');
  assert.doesNotMatch(src, /ages 1 to 8/i,
    'about.html still claims the old 8-tier, "ages 1 to 8" range -- the real range is 0 months to 9+ years');
});
