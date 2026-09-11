import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const CASES = [
  ...Array.from({ length: 10 }, (_, index) => ({
    tier: index + 1,
    name: 'short-phone',
    width: 320,
    height: 568,
    mobile: true,
  })),
  { tier: 10, name: 'phone', width: 390, height: 844, mobile: true },
  { tier: 10, name: 'tablet', width: 820, height: 1180, mobile: false },
  { tier: 10, name: 'desktop', width: 1280, height: 900, mobile: false },
];

async function freePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

async function withApp(run) {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('local Tap-a-Tune server did not start')), 12000);
      server.stdout.on('data', data => {
        if (String(data).includes('localhost:' + port)) { clearTimeout(timer); resolve(); }
      });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', () => { clearTimeout(timer); reject(new Error('local Tap-a-Tune server exited')); });
    });
    browser = await chromium.launch();
    await run(browser, `http://127.0.0.1:${port}`);
  } finally {
    await browser?.close();
    if (server.exitCode === null) server.kill();
    await once(server, 'exit').catch(() => {});
  }
}

test('Tap-a-Tune keys meet the 44px child-target floor without clipping or overlap', { timeout: 120000 }, async t => {
  await withApp(async (browser, base) => {
    for (const entry of CASES) {
      await t.test(`T${entry.tier} ${entry.name}`, async () => {
        const context = await browser.newContext({
          viewport: { width: entry.width, height: entry.height },
          hasTouch: entry.mobile,
          isMobile: entry.mobile,
          reducedMotion: 'reduce',
          serviceWorkers: 'block',
        });
        await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
        await context.addInitScript(tier => {
          const profile = {
            id: `tune-layout-t${tier}`,
            name: 'Tune Layout Test',
            birthday: '2021-01-01',
            color: '#4ECDC4',
            voice: 'girl',
            mascot: { id: 'dog' },
            tierOverrides: { 'tap-a-tune': tier },
            activitiesVisible: { 'tap-a-tune': true },
            features: {},
            achievements: { unlocked: {}, counters: {}, repeats: {}, streak: { last: null, current: 0, best: 0 }, xp: 0, rank: 'sprout' },
          };
          localStorage.setItem('vb_profiles', JSON.stringify([profile]));
          localStorage.setItem('vb_active_id', profile.id);
        }, entry.tier);
        const page = await context.newPage();
        try {
          await page.goto(base + '/games/tap-a-tune.html', { waitUntil: 'load' });
          const geometry = await page.locator('.pad').evaluateAll(elements => elements.map(element => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
          }));
          assert.equal(geometry.length, 6);
          for (const box of geometry) {
            assert.ok(box.width >= 44 && box.height >= 44, `key is ${box.width}x${box.height}px`);
            assert.ok(box.left >= 0 && box.top >= 0 && box.right <= entry.width && box.bottom <= entry.height, `key is clipped: ${JSON.stringify(box)}`);
          }
          for (let index = 1; index < geometry.length; index++) {
            assert.ok(geometry[index - 1].right <= geometry[index].left, `keys overlap: ${JSON.stringify(geometry.slice(index - 1, index + 1))}`);
          }
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'page overflows horizontally');
        } finally {
          await context.close();
        }
      });
    }
  });
});

test('Tap-a-Tune keeps six-key glissando and single-tap accounting', { timeout: 120000 }, async () => {
  await withApp(async (browser, base) => {
    const context = await browser.newContext({
      viewport: { width: 320, height: 568 },
      hasTouch: true,
      isMobile: true,
      serviceWorkers: 'block',
    });
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await context.addInitScript(() => {
      const profile = {
        id: 'tune-glissando',
        name: 'Tune Glissando Test',
        birthday: '2021-01-01',
        color: '#4ECDC4',
        voice: 'girl',
        mascot: { id: 'dog' },
        tierOverrides: { 'tap-a-tune': 2 },
        activitiesVisible: { 'tap-a-tune': true },
        features: {},
        achievements: { unlocked: {}, counters: {}, repeats: {}, streak: { last: null, current: 0, best: 0 }, xp: 0, rank: 'sprout' },
      };
      localStorage.setItem('vb_profiles', JSON.stringify([profile]));
      localStorage.setItem('vb_active_id', profile.id);
      class AudioContextStub {
        constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; }
        createOscillator() { return { type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} }; }
        createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
        createBiquadFilter() { return { type: '', frequency: { value: 0 }, connect() {} }; }
        resume() { return Promise.resolve(); }
      }
      window.AudioContext = window.webkitAudioContext = AudioContextStub;
    });
    const page = await context.newPage();
    try {
      await page.goto(base + '/games/tap-a-tune.html', { waitUntil: 'load' });
      const client = await context.newCDPSession(page);
      const geometry = await page.locator('.pad').evaluateAll(elements => {
        const first = elements[0].getBoundingClientRect();
        const last = elements.at(-1).getBoundingClientRect();
        return {
          count: elements.length,
          y: Math.round(first.top + first.height / 2),
          firstX: Math.round(first.left + first.width / 2),
          lastX: Math.round(last.left + last.width / 2),
        };
      });
      assert.equal(geometry.count, 6);
      const counter = () => page.evaluate(() => window.vbProgress?.getState()?.counters?.['tap-a-tune'] || 0);
      const before = await counter();
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: geometry.firstX, y: geometry.y }] });
      for (let step = 1; step <= 24; step++) {
        const x = Math.round(geometry.firstX + (geometry.lastX - geometry.firstX) * step / 24);
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: geometry.y }] });
        await page.waitForTimeout(8);
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(80);
      assert.equal(await counter() - before, 6, 'glissando should play each key once, in row order');
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: geometry.firstX, y: geometry.y }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(80);
      assert.equal(await counter() - before, 7, 'single tap should add exactly one note');
    } finally {
      await context.close();
    }
  });
});
