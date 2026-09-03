// The remaining LOW items from the "Professional review — queued fixes"
// (2026-06-12, CLAUDE.md) not already covered by their own test file:
//
//   #2  PIN warning line in parent settings.
//   #3  font-display: swap on the Google Fonts link.
//   #4  aria-labels on profile cards + activity buttons.
//
// Plus regression guards for two items from the earlier 2026-06-10 security
// audit that turned out to already be fixed by prior work on this branch
// (safeHexColor() in index.html, and this same font-display:swap) — locking
// them in here so a future edit can't quietly drop either one.
//
// (Audit finding 1 — profile-name XSS — and finding 2 — SVG sanitizing, see
// tests/svg-sanitize.test.mjs — are handled elsewhere.)
//
// Source guards only: every item here is a static piece of markup/CSS, so
// reading the file proves the fix is in place without needing a browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// #2 — PIN warning line
// ─────────────────────────────────────────────────────────────────────────────

test('parent settings: the PIN screen warns that clearing browser data erases the PIN', () => {
  const src = read('parent/settings.html');
  assert.match(src, /Write your PIN down/i,
    'the PIN-loss warning sentence has gone missing from the Change PIN panel.');
  assert.match(src, /clearing browser data erases it/i,
    'the warning no longer says clearing browser data erases the PIN.');
  assert.match(src, /backup file restores everything else/i,
    'the warning no longer points at the backup file as the way back — it should now that ' +
    'Export/Import exists (review #1).');
  // Anchor it to the actual PIN panel, not just anywhere on the page.
  const pinPanelStart = src.indexOf('id="panel-pin"');
  assert.notEqual(pinPanelStart, -1, 'panel-pin has gone missing');
  const pinPanelEnd = src.indexOf('</section>', pinPanelStart);
  const pinPanel = src.slice(pinPanelStart, pinPanelEnd);
  assert.match(pinPanel, /Write your PIN down/i,
    'the warning sentence exists somewhere in the file but not inside the Change PIN panel itself.');
});

// ─────────────────────────────────────────────────────────────────────────────
// #3 — font-display: swap (+ regression guard: this was already fixed)
// ─────────────────────────────────────────────────────────────────────────────

test('the only Google Fonts stylesheet in the app requests font-display: swap', () => {
  const css = read('css/style.css');
  const importLine = css.split('\n').find((l) => l.includes('fonts.googleapis.com'));
  assert.ok(importLine, 'css/style.css no longer imports Google Fonts — this guard needs rewriting');
  assert.match(importLine, /display=swap/,
    'css/style.css\'s Google Fonts @import lost its &display=swap param — text would stay invisible ' +
    '(FOIT) instead of showing in a fallback font while the webfont loads.');
});

// ─────────────────────────────────────────────────────────────────────────────
// #4 — aria-labels on activity buttons
// ─────────────────────────────────────────────────────────────────────────────

test('Tap-a-Tune: every note pad has an aria-label even when visual note names are hidden', () => {
  const src = read('games/tap-a-tune.html');
  // showLabels only controls textContent (younger tiers see no visible note
  // name) — the accessible name must not depend on that same gate, or a
  // screen reader announces six identical, unlabeled "button"s below tier 5.
  const mountStart = src.indexOf('const pads = NOTES.map');
  assert.notEqual(mountStart, -1, 'the pad-building code has moved or been renamed');
  const mountBlock = src.slice(mountStart, src.indexOf('\n    });', mountStart));
  assert.match(mountBlock, /setAttribute\(\s*['"]aria-label['"]/,
    'the note pads never call setAttribute("aria-label", ...) — each pad needs an accessible name ' +
    'that does not depend on showLabels.');
});

test('Animal Sounds: the icon-only replay button has an aria-label', () => {
  const src = read('learning/animal-sounds.html');
  const idx = src.indexOf("r.textContent = '🔊'");
  assert.notEqual(idx, -1, 'the 🔊 replay button has moved or been renamed — this guard needs rewriting');
  const nearby = src.slice(Math.max(0, idx - 300), idx + 300);
  assert.match(nearby, /setAttribute\(\s*['"]aria-label['"]/,
    'the 🔊 replay button (its only content is an emoji, no visible text) has no aria-label — a ' +
    'screen reader announces it as a bare "button".');
});

test('Parent settings: the icon-only "remove coloring page" button has an aria-label', () => {
  const src = read('parent/settings.html');
  const idx = src.indexOf('data-i="${i}"');
  assert.notEqual(idx, -1, 'the coloring-page tile button markup has moved — this guard needs rewriting');
  const nearby = src.slice(idx, idx + 120);
  assert.match(nearby, /aria-label\s*=\s*["']Remove/i,
    'the ✕ remove button for a coloring page (icon-only, no visible text) has no aria-label.');
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression guard — security audit 2026-06-10 finding 3, already fixed on this
// branch (commit 7a5984f) before this task started. Locked in so it stays fixed.
// ─────────────────────────────────────────────────────────────────────────────

test('regression guard: a profile color is validated as hex before reaching setProperty', () => {
  const src = read('index.html');
  assert.match(src, /function\s+safeHexColor/,
    'safeHexColor() has gone missing from index.html — a profile color (round-trips through ' +
    'cloud sync) would go straight into inline CSS unvalidated again.');
  const setPropIdx = src.indexOf("setProperty('--avatar-bg'");
  assert.notEqual(setPropIdx, -1, 'the avatar-bg setProperty call has moved — this guard needs rewriting');
  const before = src.slice(Math.max(0, setPropIdx - 400), setPropIdx);
  assert.match(before, /safeHexColor\(/,
    'the color used in setProperty(\'--avatar-bg\', ...) is no longer run through safeHexColor() first.');
});
