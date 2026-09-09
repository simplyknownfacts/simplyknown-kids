// Scott, 2026-09-09, from his phone on the kids1 dev deploy: "Color In can't see
// pages" and "Watch can't see any YouTube videos". Both traced to the same thing:
// the checked-in Content-Security-Policy in `_headers` is LIVE on Cloudflare
// Pages (dev today, prod after the DNS cutover) but invisible on GitHub Pages and
// on scripts/serve.mjs -- so every browser test passed while the real dev site
// blocked Color In's blob: picture and the YouTube iframe API script.
//
// This test closes that gap for good: it serves the app locally WITH the exact
// CSP line from `_headers` stamped on every HTML response, the way Cloudflare
// Pages does, then drives the two screens Scott saw fail. A future integration
// (a new CDN, a new blob: use) that the policy silently blocks fails here, not on
// Scott's phone. tests/csp-headers.test.mjs still checks the policy's text; this
// checks what a browser does with it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
let server, browser, BASE;

export function cspFromHeadersFile() {
  const src = readFileSync(path.join(ROOT, '_headers'), 'utf8');
  const m = src.match(/^\s*Content-Security-Policy:\s*(.+)$/m);
  assert.ok(m, '_headers has no Content-Security-Policy line');
  return m[1].trim();
}

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

function profile() {
  const d = new Date(); d.setFullYear(d.getFullYear() - 4);
  return {
    id: 'csp-kid', name: 'Testy', birthday: d.toISOString().slice(0, 10), color: '#7CC6FF',
    voice: 'woman', mascot: null, tierOverrides: {}, features: {},
    youtube: [{ emoji: '📺', label: 'A channel', channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa' }],
  };
}

// A stand-in for https://www.youtube.com/iframe_api: enough of the real API's
// shape for videos/index.html to build its player. If the CSP lets the script
// load, window.__ytPlayers goes up; if the CSP blocks it, this never runs.
const YT_STUB = `window.YT={PlayerState:{ENDED:0},Player:function(id){window.__ytPlayers=(window.__ytPlayers||0)+1;
  return{destroy(){},stopVideo(){},loadVideoById(){}}}};if(window.onYouTubeIframeAPIReady)window.onYouTubeIframeAPIReady();`;

/* Serve the app with the real CSP applied, exactly as Cloudflare Pages would. Off-
   origin requests get canned answers (the feed, the YouTube API) or are aborted --
   the point is what the BROWSER does with the policy, not the network. */
async function openWithCsp(csp) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  const violations = [];
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE)) {
      const res = await route.fetch();
      const headers = { ...res.headers() };
      if ((headers['content-type'] || '').includes('text/html')) headers['content-security-policy'] = csp;
      return route.fulfill({ response: res, headers });
    }
    if (url.includes('/yt-feed')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: [{ id: 'vid1' }, { id: 'vid2' }] }) });
    }
    if (url === 'https://www.youtube.com/iframe_api') {
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: YT_STUB });
    }
    return route.abort();
  });
  await ctx.addInitScript((p) => {
    localStorage.setItem('vb_profiles', JSON.stringify([p]));
    localStorage.setItem('vb_active_id', p.id);
  }, profile());
  const page = await ctx.newPage();
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  return { ctx, page, violations };
}

test('the checked-in CSP still lets Color In open a built-in picture', { timeout: 60000 }, async () => {
  const { ctx, page, violations } = await openWithCsp(cspFromHeadersFile());
  await page.goto(BASE + '/art/color-in.html', { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const c = document.getElementById('colorFillCanvas');
    const err = document.querySelector('[data-fill-error]');
    return (c && c.dataset.ready === '1') || (err && !err.hidden);
  }, null, { timeout: 15000 });
  const state = await page.evaluate(() => ({
    ready: document.getElementById('colorFillCanvas').dataset.ready === '1',
    errorShown: !document.querySelector('[data-fill-error]').hidden,
  }));
  assert.equal(state.errorShown, false,
    'Color In showed "We couldn\'t open this picture" under the real CSP -- the policy is blocking the picture. ' +
    'Violations: ' + (violations.join(' | ') || '(none logged)'));
  assert.equal(state.ready, true, 'Color In never got its picture ready under the real CSP');
  assert.deepEqual(violations, [], 'the browser reported CSP violations on Color In');
  await ctx.close();
});

test('the checked-in CSP still lets Watch load the YouTube player', { timeout: 60000 }, async () => {
  const { ctx, page, violations } = await openWithCsp(cspFromHeadersFile());
  await page.goto(BASE + '/videos/index.html', { waitUntil: 'load' });
  await page.waitForSelector('.channel-tile');
  await page.locator('.channel-tile').first().tap();
  const built = await page.waitForFunction(() => window.__ytPlayers > 0, null, { timeout: 8000 })
    .then(() => true).catch(() => false);
  assert.equal(built, true,
    'Watch never built its YouTube player under the real CSP -- the iframe API script is being blocked. ' +
    'Violations: ' + (violations.join(' | ') || '(none logged)'));
  assert.deepEqual(violations, [], 'the browser reported CSP violations on Watch');
  await ctx.close();
});
