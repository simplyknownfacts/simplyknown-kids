// Codex 0905-1, HIGH. js/pin-lockout.js is loaded by both home.html's exit
// dialog and parent/settings.html's PIN gate, but was missing from sw.js's
// ASSETS precache list (see tests/sw-required-shell.test.mjs). After a
// service-worker update plus an offline launch, the file can be unavailable
// -- and both fallbacks used to fail OPEN: parent/settings.html's _isLocked()
// returned false with no module, and home.html's refreshLockout() re-enabled
// the keypad. A child got unlimited PIN guesses at both doors.
//
// These tests reproduce the exact failure mode (block the network request
// for js/pin-lockout.js, the same way an incomplete offline cache would) and
// prove the fallback now fails CLOSED: the PIN pad refuses input and shows a
// message, rather than silently allowing unlimited guesses.
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

test('home.html exit dialog: with js/pin-lockout.js unavailable, the keypad refuses PIN entry instead of re-enabling unlimited guesses',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript((p) => {
      try {
        localStorage.setItem('vb_profiles', JSON.stringify([p]));
        localStorage.setItem('vb_active_id', p.id);
        localStorage.setItem('vb_pin', '1234');
      } catch {}
    }, seedProfile());
    const page = await ctx.newPage();
    // Simulate the exact failure mode: the lockout module did not load
    // (an incomplete offline cache, a dropped request after an SW update).
    await page.route('**/js/pin-lockout.js', (route) => route.abort());

    await page.goto(BASE + '/home.html', { waitUntil: 'load' });
    assert.strictEqual(
      await page.evaluate(() => window.vbPinLockout === undefined), true,
      'test setup check: window.vbPinLockout must actually be absent for this test to mean anything'
    );

    await page.click('#exitBtn');
    await page.waitForSelector('#exitKeys');

    const padBlocked = await page.locator('#exitKeys').evaluate((el) => el.style.pointerEvents === 'none');
    assert.ok(padBlocked, 'with the lockout module missing, the exit keypad must be disabled (fail closed), not left open for unlimited guessing');

    const msg = await page.locator('#exitMsg').textContent();
    assert.match(msg, /connection|reload|unavailable/i,
      'a child-safe message must explain why the pad is blocked: got "' + msg + '"');

    // Strongest proof: even typing the CORRECT PIN must not exit the app,
    // because the pad must refuse input entirely while the module is absent.
    for (const digit of '1234') {
      await page.locator('#exitKeys').getByText(digit, { exact: true }).click({ timeout: 500 }).catch(() => {});
    }
    await page.waitForTimeout(300);
    assert.ok(!page.url().includes('about:blank'), 'sanity: page did not navigate away');
    const stillShowingKeypad = await page.locator('#exitKeys').isVisible();
    assert.ok(stillShowingKeypad, 'the exit dialog must still be showing the (disabled) keypad -- the correct PIN must not have gotten through');

    await ctx.close();
  });

test('parent/settings.html PIN gate: with js/pin-lockout.js unavailable, the gate reports locked and disables its pad instead of failing open',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript((p) => {
      try {
        localStorage.setItem('vb_profiles', JSON.stringify([p]));
        localStorage.setItem('vb_active_id', p.id);
        localStorage.setItem('vb_pin', '1234');
      } catch {}
    }, seedProfile());
    const page = await ctx.newPage();
    await page.route('**/js/pin-lockout.js', (route) => route.abort());

    await page.goto(BASE + '/parent/settings.html', { waitUntil: 'load' });
    assert.strictEqual(
      await page.evaluate(() => window.vbPinLockout === undefined), true,
      'test setup check: window.vbPinLockout must actually be absent for this test to mean anything'
    );
    await page.waitForSelector('#pinPad .pin-key');

    const bannerVisible = await page.locator('#lockoutBanner').evaluate((el) => el.style.display !== 'none');
    assert.ok(bannerVisible, 'with the lockout module missing, the gate must show a locked banner (fail closed), not stay silent as if unlocked');

    const bannerText = await page.locator('#lockoutBanner').textContent();
    assert.match(bannerText, /connection|reload|unavailable/i,
      'a child-safe message must explain why the gate is blocked: got "' + bannerText + '"');

    const padBlocked = await page.locator('#pinPad').evaluate((el) => el.style.pointerEvents === 'none');
    assert.ok(padBlocked, 'the PIN pad must be disabled while the lockout module is missing');

    await ctx.close();
  });
