// Security audit 2026-06-10, finding 2 (MED): art/color-in.html's coloring-page
// background comes from js/paint.js's setPage(), which used to hand a stored
// `pages[i].svg` string straight to `bgLayer.innerHTML =`. Built-in scenes are
// hard-coded and trusted, but the function itself does not know that — it is a
// shared engine (js/paint.js doc header: "pages: [{ name, svg?, src? }]") that
// any future caller, or a tampered `vb_coloring_pages` entry, could hand a hostile
// string to. `<svg onload=...>` fires even when inserted via innerHTML (unlike
// <script>), so this was a real hole, not a theoretical one.
//
// Fix: setPage() now runs `svg` through an allow-list sanitizer (only known shape
// elements/attributes survive; everything else — <script>, <foreignObject>,
// <image>/<use> [href], any `on*` handler — is dropped) and rebuilds the DOM from
// that allow-list rather than re-inserting a string. The `src` (uploaded photo)
// path is now built as a real <img> element with a validated address, instead of
// interpolated into an HTML string where a crafted value could break out of the
// src="..." attribute.
//
// Two layers, the same shape as tests/hostile-input.test.mjs:
//   1. Browser drive — calls the real, shipped window.vbPaint.mount() with a
//      hostile page and proves nothing fires and nothing dangerous gets built,
//      while a legitimate scene still renders correctly.
//   2. Source guard — no browser needed, so this always runs even without
//      playwright installed. Placed AFTER the browser tests, not before (as
//      every other file in this suite orders it): on this machine/Node
//      version, a plain synchronous test() running before this file's async
//      browser tests + before()/after() hooks made browser.close() hang long
//      enough to stall every file queued behind this one under node --test.
//      Moving it after was sufficient to avoid that — verified by removing it
//      entirely (fixed it) and by moving it to the end (also fixed it, with
//      the assertions intact), so the ordering, not the assertions, was the
//      trigger. Root cause not fully pinned down; this ordering is the known
//      stable workaround.
//
// The browser half loads js/paint.js on its own into a blank page (no server,
// no navigation to a real activity page). paint.js is a self-contained module
// (see its own header — "shared freeform paint engine", no dependency on the
// app's other globals for mount()/setPage()), so this exercises the exact
// real, unmodified file under test without also booting every other script a
// real activity page would load.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const PAINT_JS_PATH = path.join(ROOT, 'js', 'paint.js');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Browser drive — the real function, in a real browser.
// ─────────────────────────────────────────────────────────────────────────────

let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* handled below */ }

const NEEDS_BROWSER = chromium ? false :
  'playwright is not installed. Install it and these checks run: ' +
  'npm i playwright --no-save && npx playwright install chromium-headless-shell';

let browser = null;

before(async () => {
  if (!chromium) return;
  browser = await chromium.launch();
});

after(async () => {
  if (browser) await browser.close();
});

const MARK = 'vbxss2';
// Three ways an inline SVG payload can run once it's actually in the DOM:
// onload fires as the parser builds the element (works even via innerHTML,
// unlike <script>), <image onerror> fires when its bogus href 404s, and
// <foreignObject> can smuggle in an HTML <script>. A legitimate <circle> rides
// along so the test can also prove ordinary shape content survives.
// The tracking class marks only nodes that must NOT survive; the <svg> root
// itself is expected to survive (sanitized, onload stripped), so it doesn't
// carry the mark.
const HOSTILE_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" onload="window.__svgFired=1">` +
  `<script>window.__svgFired=1;</script>` +
  `<image class="${MARK}" href="x" onerror="window.__svgFired=1"/>` +
  `<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>window.__svgFired=1;</script></body></foreignObject>` +
  `<use class="${MARK}" href="javascript:window.__svgFired=1"/>` +
  `<circle class="region ${MARK}-ok" cx="50" cy="50" r="20" onclick="window.__svgFired=1"/>` +
  `</svg>`;

const GOOD_SVG =
  `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">` +
  `<rect class="region" x="10" y="10" width="30" height="30"/>` +
  `</svg>`;

const PAINT_JS_SOURCE = readFileSync(PAINT_JS_PATH, 'utf8');

// A blank page with the real, unmodified js/paint.js evaluated into it —
// nothing else. No server, no navigation, no other app script.
async function newPaintPage(ctx) {
  const page = await ctx.newPage();
  await page.setContent('<!DOCTYPE html><html><body></body></html>');
  await page.evaluate(PAINT_JS_SOURCE);
  await page.waitForFunction(() => !!window.vbPaint);
  return page;
}

test('a hostile inline SVG page cannot execute', { skip: NEEDS_BROWSER }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await newPaintPage(ctx);

  const result = await page.evaluate(({ hostile, mark }) => {
    window.__svgFired = 0;
    window.vbPaint.mount({ tier: 1, pages: [{ svg: hostile }] });
    const bg = document.getElementById('vbBgLayer');
    const dangerous = bg.querySelectorAll(
      `script, foreignObject, image, use, [onload], [onclick], [onerror], .${mark}`);
    return {
      fired: window.__svgFired || 0,
      dangerousCount: dangerous.length,
      hasSvgRoot: !!bg.querySelector('svg'),
    };
  }, { hostile: HOSTILE_SVG, mark: MARK });

  assert.equal(result.fired, 0,
    'the hostile SVG page EXECUTED. Anything running here can read the cloud sync key.');
  assert.equal(result.dangerousCount, 0,
    `the sanitized page still contains ${result.dangerousCount} dangerous node(s)/attribute(s) ` +
    '— <script>/<foreignObject>/<image>/<use>/on* must all be stripped.');
  assert.ok(result.hasSvgRoot, 'the sanitized <svg> root itself should still be inserted');

  await ctx.close();
});

test('a legitimate SVG scene still renders correctly after sanitizing', { skip: NEEDS_BROWSER }, async () => {
  // The exact thing color-in.html's own built-in scenes rely on: a plain
  // shape with a CSS class and geometry attributes must survive untouched.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await newPaintPage(ctx);

  const good = await page.evaluate((svg) => {
    window.__svgFired = 0;
    window.vbPaint.mount({ tier: 1, pages: [{ svg }] });
    const bg = document.getElementById('vbBgLayer');
    const rect = bg.querySelector('rect.region');
    return {
      hasRect: !!rect,
      width: rect && rect.getAttribute('width'),
      fired: window.__svgFired || 0,
    };
  }, GOOD_SVG);
  assert.ok(good.hasRect, 'a legitimate <rect class="region"> should survive sanitizing unharmed');
  assert.equal(good.width, '30', 'a legitimate shape\'s geometry attributes must be preserved exactly');
  assert.equal(good.fired, 0, 'nothing should ever fire for legitimate content');

  await ctx.close();
});

test('a hostile uploaded-photo address stays inert as an <img>, a real one still displays',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await newPaintPage(ctx);

    const GOOD_PNG =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAA' +
      'DUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const HOSTILE_SRC = `x"><img class="${MARK}" src="x" onerror="window.__svgFired=1">`;

    const result = await page.evaluate(({ hostile, good, mark }) => {
      window.__svgFired = 0;
      window.vbPaint.mount({ tier: 1, pages: [{ name: 'bad', src: hostile }, { name: 'good', src: good }] });
      const bg = document.getElementById('vbBgLayer');
      return {
        fired: window.__svgFired || 0,
        plantedCount: bg.querySelectorAll('.' + mark).length,
        imgCount: bg.querySelectorAll('img').length,
        src: bg.querySelector('img') ? bg.querySelector('img').getAttribute('src') : null,
      };
    }, { hostile: HOSTILE_SRC, good: GOOD_PNG, mark: MARK });

    assert.equal(result.fired, 0, 'the hostile picture address EXECUTED via attribute breakout.');
    assert.equal(result.plantedCount, 0, 'no element should have been built from the hostile string.');
    assert.equal(result.imgCount, 1, 'exactly one (harmless) <img> should exist for the bad page.');
    assert.notEqual(result.src, HOSTILE_SRC, 'the raw hostile string must never reach the src attribute.');

    await ctx.close();
  });

// ─────────────────────────────────────────────────────────────────────────────
// 2. Source guard — no browser needed, so this always runs even without
//    playwright installed. See the file header for why this comes last.
// ─────────────────────────────────────────────────────────────────────────────

test('source guard: js/paint.js no longer pastes a stored svg string straight into innerHTML', () => {
  const src = read('js/paint.js');
  assert.ok(
    !/bgLayer\.innerHTML\s*=\s*p\.svg/.test(src),
    'js/paint.js assigns p.svg to bgLayer.innerHTML again — that is the exact shape that let ' +
    '<svg onload="..."> execute on insert. Run it through the sanitizer instead.',
  );
  assert.ok(
    !/bgLayer\.innerHTML\s*=\s*`<img[^`]*\$\{p\.src\}/.test(src),
    'js/paint.js builds the background <img> by interpolating p.src into an HTML string again. ' +
    'A crafted lineArt value could break out of the src="..." attribute — build the element and ' +
    'set .src as a property instead.',
  );
  assert.match(src, /function\s+sanitizeSvgMarkup/,
    'sanitizeSvgMarkup() (the allow-list SVG sanitizer) has gone missing from js/paint.js.');
  assert.match(src, /foreignObject/i,
    'the sanitizer no longer mentions foreignObject — it must be excluded from the allow-list.');
});
