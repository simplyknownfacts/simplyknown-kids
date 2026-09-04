// Codex 0825-16, MED: parent/settings.html's offline-download status used to
// decide "done" by comparing cache ENTRY COUNT to the expected file count
// (parent/settings.html's buildOfflineSection(), was `have >= list.length`).
// A stray or stale cache entry padding the total was enough to report
// "Downloaded" even with a specific required file missing. This drives the
// real page in a real browser and proves the fix checks each URL, not just
// a count.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* handled below */ }
const NEEDS_BROWSER = chromium ? false :
  'playwright is not installed. Install it and this check runs: ' +
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

test('offline download status checks each required file, not just how many cache entries exist',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('vb_pin', '1234');
        localStorage.setItem('vb_profiles', JSON.stringify([
          { id: 'p1', name: 'Test', birthday: '2020-01-01', color: '#7CC6FF', voice: 'woman', mascot: null, tierOverrides: {}, features: {} },
        ]));
      } catch {}
    });
    const page = await ctx.newPage();
    await page.goto(BASE + '/parent/settings.html', { waitUntil: 'load' });
    await page.waitForSelector('#pinPad .pin-key');
    for (const i of [0, 1, 2, 3]) await page.locator('#pinPad .pin-key').nth(i).click();
    await page.waitForSelector('#mainSettings', { state: 'visible', timeout: 10000 });
    await page.locator('#panel-offline .acc-title').click();
    await page.waitForSelector('#offlineStatus');

    // Let it render for real once so we can read off the actual expected
    // file count from the page's own DOM text, rather than hand-computing
    // it from the manifest and risking the two ever drifting apart.
    const listLength = await page.evaluate(async () => {
      await buildOfflineSection();
      const m = document.querySelector('#offlineSection').textContent.match(/\((\d+) files\)/);
      return m ? parseInt(m[1], 10) : 0;
    });
    assert.ok(listLength > 0, 'expected the real offline manifest to list at least one file');

    // Pad the real offline cache with `listLength` entries that are NOT any
    // of the actually-required URLs -- the exact shape of the bug: the
    // COUNT matches, but not one required file is really there.
    await page.evaluate(async (n) => {
      const cache = await caches.open('vb-offline');
      for (let i = 0; i < n; i++) {
        await cache.put('/definitely-not-a-required-file-' + i, new Response('x'));
      }
    }, listLength);

    const status = await page.evaluate(async () => {
      await buildOfflineSection();
      return document.getElementById('offlineStatus').textContent;
    });
    assert.doesNotMatch(status, /✓ Downloaded/,
      'a padded cache with the right ENTRY COUNT but none of the required files must not read as "Downloaded": ' + status);

    await ctx.close();
  });
