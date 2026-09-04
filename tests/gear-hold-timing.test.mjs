// Codex 0825-9, MED (second half of the same finding as exit-pin-lockout.test.mjs).
// index.html's own comment calls this "the 3s hold-to-open guard", the visible
// hint text says "Hold ⚙️ for 3 seconds to open Parent Settings", and
// CLAUDE.md documents 3 seconds -- but holdToActivate() was called with no
// override, so it ran at js/app.js's generic 700ms default. A toddler could
// wander into Parent Settings well under a second, exactly what the hold
// guard exists to prevent.
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

test('holding the parent-settings gear for under 3s does NOT open settings, matching what the app tells a parent',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/index.html', { waitUntil: 'load' });
    const gear = page.locator('#settingsGear');
    const box = await gear.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1500); // half the documented hold
    await page.mouse.up();
    await page.waitForTimeout(300);
    assert.ok(page.url().endsWith('/index.html') || page.url().endsWith('/'),
      'a 1.5s hold (half the documented 3s) must not be enough to open Parent Settings: landed on ' + page.url());
    await ctx.close();
  });

test('holding the parent-settings gear for the documented 3s opens settings',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/index.html', { waitUntil: 'load' });
    const gear = page.locator('#settingsGear');
    const box = await gear.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForURL((u) => u.pathname.endsWith('/parent/settings.html'), { timeout: 4000 });
    await page.mouse.up();
    await ctx.close();
  });
