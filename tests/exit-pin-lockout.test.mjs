// Codex 0825-9, MED. home.html's exit-PIN dialog (exitApp()) had NO lockout
// at all while parent/settings.html's PIN gate did -- a kid locked out of
// settings could just tap the exit button and keep guessing the same PIN
// there instead. Fixed by extracting the lockout rules into js/pin-lockout.js
// and sharing ONE counter (vb_pin_lockout) between both doors.
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

// Types a 4-digit PIN into whichever dialog's number pad is open (both
// home.html's exit dialog and parent/settings.html's gate use plain
// data-less digit buttons/divs with the digit as their visible text).
async function typePin(page, selector, pin) {
  for (const digit of pin) {
    await page.locator(selector).getByText(digit, { exact: true }).click();
  }
}

test('the exit-PIN dialog locks out after repeated wrong guesses, sharing settings\' counter',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    // addInitScript re-runs on EVERY navigation in this context (by design --
    // that's how it seeds a fresh reload) -- so it must NOT touch
    // vb_pin_lockout, or navigating to settings.html later in this same test
    // would silently wipe the very lockout state being checked there.
    await ctx.addInitScript((p) => {
      try {
        localStorage.setItem('vb_profiles', JSON.stringify([p]));
        localStorage.setItem('vb_active_id', p.id);
        localStorage.setItem('vb_pin', '1234');
      } catch {}
    }, seedProfile());
    const page = await ctx.newPage();
    await page.goto(BASE + '/home.html', { waitUntil: 'load' });

    await page.click('#exitBtn');
    await page.waitForSelector('#exitKeys');

    // 5 wrong guesses trips the lockout (js/pin-lockout.js: attempts >= 5).
    for (let i = 0; i < 5; i++) {
      await typePin(page, '#exitKeys', '0000');
      await page.waitForTimeout(300); // let the wrong-PIN branch run and reset the dots
    }

    const msg = await page.locator('#exitMsg').textContent();
    assert.match(msg, /locked/i, 'the exit dialog must show a lockout message after 5 wrong guesses: got "' + msg + '"');

    const padDisabled = await page.locator('#exitKeys').evaluate((el) => el.style.pointerEvents === 'none');
    assert.ok(padDisabled, 'the exit keypad must be disabled while locked out');

    // Cross-door proof: the SAME counter must also lock the settings gate,
    // not just the exit dialog -- otherwise a kid just walks to the other
    // door instead, which is exactly the gap this fix closes.
    await page.goto(BASE + '/parent/settings.html', { waitUntil: 'load' });
    await page.waitForSelector('#pinPad .pin-key');
    const bannerVisible = await page.locator('#lockoutBanner').evaluate((el) => el.style.display !== 'none');
    assert.ok(bannerVisible, 'parent/settings.html\'s own PIN gate must also show locked, sharing the same counter');

    await ctx.close();
  });
