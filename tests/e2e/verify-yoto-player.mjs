// Standalone browser proof for the retired integration.
// Runs phone and desktop against the local app only; no external request is allowed.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

async function freePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('local server did not start')), 15000);
  server.stdout.on('data', data => {
    if (String(data).includes('localhost:' + port)) {
      clearTimeout(timeout);
      resolve();
    }
  });
  server.once('error', error => {
    clearTimeout(timeout);
    reject(error);
  });
});

const browser = await chromium.launch();
const results = [];
let offlineResult = null;

try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const externalYoto = [];
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(base)) return route.continue();
      if (/yoto/i.test(url)) externalYoto.push(url);
      return route.abort();
    });
    await context.addInitScript(profile => {
      localStorage.setItem('vb_profiles', JSON.stringify([profile]));
      localStorage.setItem('vb_active_id', profile.id);
      localStorage.setItem('vb_pin', '1234');
      localStorage.setItem('vb_yoto_tokens', JSON.stringify({ access_token: 'stale' }));
      localStorage.setItem('vb_yoto_client_id', 'stale-client');
      sessionStorage.setItem('vb_yoto_now_playing', JSON.stringify({
        src: 'https://api.yotoplay.com/old.mp3',
        playing: true,
        title: 'Old playback',
      }));
      sessionStorage.setItem('vb_yoto_pkce_verifier', 'stale-verifier');
      sessionStorage.setItem('vb_yoto_oauth_state', 'stale-state');
    }, {
      id: 'retired-test', name: 'Explorer', birthday: '2020-01-01', color: '#7CC6FF',
      voice: 'woman', mascot: { id: 'bunny' }, tierOverrides: {}, features: {},
      activitiesVisible: {}, youtube: [],
    });

    const page = await context.newPage();
    page.setDefaultTimeout(12000);

    await page.goto(base + '/home.html', { waitUntil: 'load' });
    const home = {
      retiredUi: await page.locator('#yotoMini, #yotoLaunch').count(),
      retiredText: /yoto/i.test(await page.locator('body').innerText()),
      staleState: await page.evaluate(() => [
        localStorage.getItem('vb_yoto_tokens'),
        localStorage.getItem('vb_yoto_client_id'),
        sessionStorage.getItem('vb_yoto_now_playing'),
        sessionStorage.getItem('vb_yoto_pkce_verifier'),
        sessionStorage.getItem('vb_yoto_oauth_state'),
      ]),
    };

    await page.goto(base + '/listen/index.html', { waitUntil: 'load' });
    const listen = {
      tuneLink: await page.locator('a[href="../games/tap-a-tune.html"]').count(),
      timerButtons: await page.locator('.sleep-btn').count(),
      retiredUi: await page.locator('#yotoMini, #yotoLaunch, #player, .card-tile').count(),
      retiredText: /yoto/i.test(await page.locator('body').innerText()),
    };

    await page.goto(base + '/parent/settings.html', { waitUntil: 'load' });
    for (const digit of ['1', '2', '3', '4']) {
      await page.locator('#pinPad .pin-key', { hasText: new RegExp(`^${digit}$`) }).click();
    }
    await page.locator('#mainSettings').waitFor({ state: 'visible' });
    const parent = {
      retiredPanel: await page.locator('[data-key="yoto"], #panel-yoto').count(),
      retiredText: /yoto/i.test(await page.locator('#mainSettings').innerText()),
    };

    await page.goto(base + '/yoto-callback.html?code=old&state=old', { waitUntil: 'load' });
    await page.waitForURL('**/index.html');
    const callbackSafe = page.url() === base + '/index.html';

    results.push({
      viewport: `${viewport.width}x${viewport.height}`,
      home,
      listen,
      parent,
      callbackSafe,
      externalYoto,
    });
    await context.close();
  }

  const offlineContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'allow',
  });
  await offlineContext.route('**/*', route =>
    route.request().url().startsWith(base) ? route.continue() : route.abort());
  await offlineContext.addInitScript(profile => {
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
  }, {
    id: 'offline-listen', name: 'Offline Explorer', birthday: '2020-01-01', color: '#7CC6FF',
    voice: 'woman', mascot: { id: 'bunny' }, tierOverrides: {}, features: {},
    activitiesVisible: {}, youtube: [],
  });
  const offlinePage = await offlineContext.newPage();
  offlinePage.setDefaultTimeout(15000);
  await offlinePage.goto(base + '/home.html', { waitUntil: 'load' });
  await offlinePage.evaluate(async () => { await navigator.serviceWorker.ready; });
  await offlinePage.reload({ waitUntil: 'load' });
  await offlinePage.waitForFunction(() => !!navigator.serviceWorker.controller);
  const cacheName = await offlinePage.evaluate(async () =>
    (await caches.keys()).find(name => name === 'vb-v166') || null);

  await offlineContext.setOffline(true);
  await offlinePage.goto(base + '/listen/index.html', { waitUntil: 'load' });
  const listenOffline = await offlinePage.locator('a[href="../games/tap-a-tune.html"]').count() === 1 &&
    await offlinePage.locator('#yotoMini, #yotoLaunch, #player, .card-tile').count() === 0;
  await offlinePage.locator('a[href="../games/tap-a-tune.html"]').click();
  await offlinePage.waitForURL('**/games/tap-a-tune.html');
  const tuneOffline = await offlinePage.locator('.pad').count() > 0;
  offlineResult = { cacheName, listenOffline, tuneOffline };
  await offlineContext.setOffline(false);
  await offlineContext.close();
} finally {
  await browser.close();
  server.kill();
}

const pass = results.every(result =>
  result.home.retiredUi === 0 &&
  result.home.retiredText === false &&
  result.home.staleState.every(value => value === null) &&
  result.listen.tuneLink === 1 &&
  result.listen.timerButtons === 5 &&
  result.listen.retiredUi === 0 &&
  result.listen.retiredText === false &&
  result.parent.retiredPanel === 0 &&
  result.parent.retiredText === false &&
  result.callbackSafe === true &&
  result.externalYoto.length === 0) &&
  offlineResult?.cacheName === 'vb-v166' &&
  offlineResult.listenOffline === true &&
  offlineResult.tuneOffline === true;

console.log(JSON.stringify({ online: results, offline: offlineResult }, null, 2));
console.log(`VERDICT: ${pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
