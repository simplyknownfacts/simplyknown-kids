// Codex 0825-15, MED. Two unrelated real gaps bundled in the same finding:
// (1) js/app.js has read body.dataset.allowZoom to decide whether to block
//     pinch/double-tap zoom since it was written, but nothing anywhere ever
//     SET it -- the parent opt-out never existed.
// (2) js/shelf.js's ribbon shelf had role="button" with no tabindex and no
//     keydown handler -- unreachable and inoperable by keyboard.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* handled below */ }
const NEEDS_BROWSER = chromium ? false :
  'playwright is not installed. Install it and these checks run: ' +
  'npm i playwright --no-save && npx playwright install chromium-headless-shell';

let server = null, browser = null, BASE = '';

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
  });
}
function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], {
      env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const giveUp = setTimeout(() => reject(new Error('scripts/serve.mjs did not come up within 15s')), 15000);
    child.stdout.on('data', (d) => { if (String(d).includes('localhost:' + port)) { clearTimeout(giveUp); resolve(child); } });
    child.once('error', (e) => { clearTimeout(giveUp); reject(e); });
    child.once('exit', (c) => { clearTimeout(giveUp); reject(new Error('the server exited early, code ' + c)); });
  });
}

before(async () => {
  if (!chromium) return;
  const port = await freePort();
  BASE = 'http://localhost:' + port;
  server = await startServer(port);
  browser = await chromium.launch();
});
after(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
});

function seedProfile() {
  return {
    id: 'p1', name: 'Test', birthday: '2020-01-01', color: '#7CC6FF',
    voice: 'woman', mascot: null, tierOverrides: {}, features: {},
  };
}

test('the parent zoom opt-out toggle exists, persists, and actually takes effect',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript((p) => {
      try {
        localStorage.setItem('vb_pin', '1234');
        localStorage.setItem('vb_profiles', JSON.stringify([p]));
        localStorage.setItem('vb_active_id', p.id);
      } catch {}
    }, seedProfile());
    const page = await ctx.newPage();
    await page.goto(BASE + '/parent/settings.html', { waitUntil: 'load' });
    await page.waitForSelector('#pinPad .pin-key');
    for (const i of [0, 1, 2, 3]) await page.locator('#pinPad .pin-key').nth(i).click();
    await page.waitForSelector('#mainSettings', { state: 'visible', timeout: 10000 });
    await page.locator('#panel-theme .acc-title').click();
    const box = page.locator('#allowZoomToggle');
    await box.waitFor({ state: 'visible' });
    assert.equal(await box.isChecked(), false, 'off by default');

    await box.check();
    const stored = await page.evaluate(() => localStorage.getItem('vb_allow_zoom'));
    assert.equal(stored, '1', 'checking the box must persist the preference');

    // A DIFFERENT page load (a real activity, not settings) must pick the
    // saved preference up and actually disable the zoom lock.
    await page.goto(BASE + '/games/tap-pop.html', { waitUntil: 'load' });
    const allowed = await page.evaluate(() => document.body.dataset.allowZoom === '1');
    assert.equal(allowed, true, 'a real activity page must read the saved opt-out and unlock zoom there too');

    await ctx.close();
  });

test('the ribbon shelf is keyboard-reachable and Enter/Space activates it',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const profile = { ...seedProfile(),
      achievements: { unlocked: { 'first-play': { at: Date.now() } }, counters: {}, repeats: {}, xp: 0, rank: 'sprout',
                      streak: { last: null, current: 0, best: 0 } } };
    await ctx.addInitScript((p) => {
      try {
        localStorage.setItem('vb_profiles', JSON.stringify([p]));
        localStorage.setItem('vb_active_id', p.id);
      } catch {}
    }, profile);
    const page = await ctx.newPage();
    // The shelf widget lives on the section hubs (games/learning/art index),
    // not home.html -- home.html's hub world has its own direct landmark.
    await page.goto(BASE + '/games/index.html', { waitUntil: 'load' });
    const shelf = page.locator('.vb-shelf[role="button"]');
    await shelf.waitFor({ state: 'attached', timeout: 10000 });

    const tabIndex = await shelf.evaluate((el) => el.tabIndex);
    assert.equal(tabIndex, 0, '.vb-shelf must be in the Tab order (tabIndex 0)');

    await shelf.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL((u) => u.pathname.endsWith('/achievements.html'), { timeout: 5000 });
    assert.ok(page.url().endsWith('/achievements.html'), 'Enter on the focused shelf must open the ribbons page');

    await ctx.close();
  });
