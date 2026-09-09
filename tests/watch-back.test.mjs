// Scott, 2026-09-09, on his phone: on Watch the "back button [fires] within ms"
// and tapping back from a channel's video "goes to main island page not back to
// video page". One cause: the player's ← closed the player on pointerdown, i.e.
// the instant the finger touched down. The player vanished, and when the finger
// lifted the browser delivered that tap's click to whatever was now under it --
// the world Back/Home chrome sitting in the exact same top-left corner, whose
// Back goes to home.html. Reproduced in both the Chromium and WebKit (iPhone)
// engines before the fix.
//
// Rule this locks in: tapping the player's ← closes the player and leaves the
// child on the Watch channel list -- nothing underneath may receive that tap.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
let server, browser, BASE;

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

before(async () => {
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(BASE + '/__health.json')).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
});

after(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
});

const YT_STUB = `window.YT={PlayerState:{ENDED:0},Player:function(id){window.__ytPlayers=(window.__ytPlayers||0)+1;
  return{destroy(){},stopVideo(){},loadVideoById(){}}}};if(window.onYouTubeIframeAPIReady)window.onYouTubeIframeAPIReady();`;

async function openWatchOnPhone() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE)) return route.continue();
    if (url.includes('/yt-feed')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: [{ id: 'vid1' }] }) });
    if (url === 'https://www.youtube.com/iframe_api') return route.fulfill({ status: 200, contentType: 'text/javascript', body: YT_STUB });
    return route.abort();
  });
  await ctx.addInitScript(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 4);
    const p = { id: 'watch-kid', name: 'Testy', birthday: d.toISOString().slice(0, 10), color: '#7CC6FF', voice: 'woman',
      mascot: null, tierOverrides: {}, features: {},
      youtube: [{ emoji: '🎀', label: 'Ms Rachel', channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa' }] };
    localStorage.setItem('vb_profiles', JSON.stringify([p]));
    localStorage.setItem('vb_active_id', p.id);
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/videos/index.html', { waitUntil: 'load' });
  await page.waitForSelector('.channel-tile');
  await page.locator('.channel-tile').first().tap();
  await page.waitForFunction(() => document.getElementById('playerWrap').classList.contains('active') && window.__ytPlayers > 0, null, { timeout: 8000 });
  return { ctx, page };
}

test('a finger tap on the player\'s back button closes the player and stays on Watch', { timeout: 60000 }, async () => {
  const { ctx, page } = await openWatchOnPhone();
  // A real finger takes a moment to move from the tile to the corner. Without
  // this pause the second tap lands inside Chromium's double-tap window and its
  // click is swallowed, which hid the bug (the test passed against broken code).
  await page.waitForTimeout(500);
  const back = await page.locator('#playerBack').boundingBox();
  // Touch down and up at the same spot, like Scott's phone.
  await page.touchscreen.tap(back.x + back.width / 2, back.y + back.height / 2);
  await page.waitForTimeout(800);
  assert.ok(page.url().includes('/videos/index.html'),
    `the tap leaked through to the world Back button underneath -- the page went to ${page.url()} instead of staying on Watch`);
  assert.equal(await page.evaluate(() => document.getElementById('playerWrap').classList.contains('active')), false,
    'the player should be closed after tapping its back button');
  assert.ok(await page.locator('.channel-tile').first().isVisible(), 'the channel list should be showing again');
  await ctx.close();
});

test('the player\'s back button also works from the keyboard', { timeout: 60000 }, async () => {
  const { ctx, page } = await openWatchOnPhone();
  await page.focus('#playerBack');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.getElementById('playerWrap').classList.contains('active')), false,
    'Enter on the focused back button should close the player');
  assert.ok(page.url().includes('/videos/index.html'), 'keyboard back must stay on Watch');
  await ctx.close();
});
