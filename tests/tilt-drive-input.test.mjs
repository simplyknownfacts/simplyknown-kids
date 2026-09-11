import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const CASES = [
  { tier: 1, name: 'short-phone', width: 320, height: 568, mobile: true },
  { tier: 10, name: 'tablet', width: 820, height: 1180, mobile: false },
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
      const timer = setTimeout(() => reject(new Error('local Tilt Drive server did not start')), 12000);
      server.stdout.on('data', data => {
        if (String(data).includes('localhost:' + port)) { clearTimeout(timer); resolve(); }
      });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', () => { clearTimeout(timer); reject(new Error('local Tilt Drive server exited')); });
    });
    browser = await chromium.launch();
    await run(browser, `http://127.0.0.1:${port}`);
  } finally {
    await browser?.close();
    if (server.exitCode === null) server.kill();
    await once(server, 'exit').catch(() => {});
  }
}

function installHarness({ tier }) {
  const profile = {
    id: `tilt-repair-t${tier}`,
    name: 'Tilt Repair Test',
    birthday: '2021-01-01',
    color: '#4ECDC4',
    voice: 'girl',
    mascot: { id: 'dog' },
    tierOverrides: { 'tilt-drive': tier },
    activitiesVisible: { 'tilt-drive': true },
    features: {},
    achievements: { unlocked: {}, counters: {}, repeats: {}, streak: { last: null, current: 0, best: 0 }, xp: 0, rank: 'sprout' },
  };
  localStorage.setItem('vb_profiles', JSON.stringify([profile]));
  localStorage.setItem('vb_active_id', profile.id);
  try { HTMLMediaElement.prototype.play = () => Promise.resolve(); } catch {}
  try { navigator.vibrate = () => true; } catch {}
  Math.random = () => 0.5;

  window.__permission = 'denied';
  window.__installOrientation = mode => {
    if (mode === 'unavailable') {
      Object.defineProperty(window, 'DeviceOrientationEvent', { configurable: true, writable: true, value: undefined });
      return;
    }
    class SyntheticDeviceOrientationEvent extends Event {
      static requestPermission() {
        if (window.__permission === 'rejected') return Promise.reject(new Error('permission prompt failed'));
        return Promise.resolve(window.__permission);
      }
    }
    window.__permission = mode;
    Object.defineProperty(window, 'DeviceOrientationEvent', { configurable: true, writable: true, value: SyntheticDeviceOrientationEvent });
  };
  window.__emitGamma = value => {
    const event = new Event('deviceorientation');
    Object.defineProperty(event, 'gamma', { value });
    window.dispatchEvent(event);
  };

  window.__orientationAdds = 0;
  const realAdd = window.addEventListener.bind(window);
  window.addEventListener = (type, listener, options) => {
    if (type === 'deviceorientation') window.__orientationAdds++;
    return realAdd(type, listener, options);
  };

  window.__carTrace = [];
  const translate = CanvasRenderingContext2D.prototype.translate;
  CanvasRenderingContext2D.prototype.translate = function (x, y) {
    if (this.canvas?.id === 'canvas' && y > innerHeight * 0.7) window.__carTrace.push({ x, y });
    return translate.call(this, x, y);
  };

  const realNow = performance.now.bind(performance);
  const realSetTimeout = window.setTimeout.bind(window);
  let virtualNow = realNow(), nextFrame = 1;
  const frames = new Map();
  Date.now = () => 1700000000000 + virtualNow;
  window.requestAnimationFrame = callback => {
    const id = nextFrame++;
    const timer = realSetTimeout(() => {
      if (!frames.has(id)) return;
      frames.delete(id);
      virtualNow = Math.max(virtualNow, realNow()) + 50;
      callback(virtualNow);
    }, 5);
    frames.set(id, timer);
    return id;
  };
  window.cancelAnimationFrame = id => {
    const timer = frames.get(id);
    if (timer !== undefined) clearTimeout(timer);
    frames.delete(id);
  };
  window.__activeTiltFrames = () => frames.size;
}

async function openCase(browser, base, entry) {
  const context = await browser.newContext({
    viewport: { width: entry.width, height: entry.height },
    hasTouch: entry.mobile,
    isMobile: entry.mobile,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await context.addInitScript(installHarness, { tier: entry.tier });
  const page = await context.newPage();
  await page.goto(base + '/games/tilt-drive.html', { waitUntil: 'load' });
  return { context, page };
}

async function start(page, mode, card = 0) {
  await page.evaluate(value => window.__installOrientation(value), mode);
  await page.locator('.style-card').nth(card).click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#hud')).display !== 'none');
  return (await page.locator('.vb-caption').textContent()).trim();
}

async function returnToPicker(page) {
  await page.locator('#overOv.show').waitFor({ timeout: 8000 });
  assert.match(await page.locator('#overStat').innerText(), /You drove [1-9]\d* m/);
  await page.locator('#changeBtn').click();
  await page.locator('#startOv.show').waitFor();
}

test('Tilt Drive tells the truth for unavailable, denied, rejected, and granted orientation permission', { timeout: 120000 }, async t => {
  await withApp(async (browser, base) => {
    for (const entry of CASES) {
      await t.test(`T${entry.tier} ${entry.name}`, async () => {
        const { context, page } = await openCase(browser, base, entry);
        try {
          assert.match(await start(page, 'unavailable'), /Drag left & right/);
          await returnToPicker(page);
          assert.match(await start(page, 'denied', 1), /Drag left & right/);
          await returnToPicker(page);
          assert.match(await start(page, 'rejected', 2), /Drag left & right/);
          await returnToPicker(page);
          assert.match(await start(page, 'granted'), /Tilt to steer/);
          assert.equal(await page.evaluate(() => window.__orientationAdds), 1, 'orientation listener registered more than once');
          assert.ok(await page.evaluate(() => window.__activeTiltFrames()) <= 1, 'more than one animation frame remained active');
          await page.locator('#overOv.show').waitFor({ timeout: 8000 });
          assert.match(await page.locator('#overStat').innerText(), /You drove [1-9]\d* m/);
          assert.equal(await page.evaluate(() => window.__activeTiltFrames()), 0, 'animation frame survived crash');
        } finally {
          await context.close();
        }
      });
    }
  });
});

test('Tilt Drive rejects nonfinite gamma and keeps finite tilt, pointer, and keyboard steering recoverable', { timeout: 120000 }, async t => {
  await withApp(async (browser, base) => {
    for (const entry of CASES) {
      await t.test(`T${entry.tier} ${entry.name}`, async () => {
        const { context, page } = await openCase(browser, base, entry);
        try {
          await start(page, 'granted');
          const canvas = page.locator('#canvas');
          const box = await canvas.boundingBox();
          for (const value of [null, NaN, Infinity, -Infinity]) await page.evaluate(v => window.__emitGamma(v), value);
          await canvas.dispatchEvent('pointermove', { pointerId: 1, pointerType: 'touch', clientX: box.x + box.width * 0.75, clientY: box.y + box.height * 0.8, bubbles: true });
          await page.keyboard.press('ArrowLeft');
          await page.waitForTimeout(100);
          assert.ok(await page.evaluate(() => window.__carTrace.length > 2 && window.__carTrace.every(item => Number.isFinite(item.x))), 'invalid first sensor event poisoned fallback steering');

          await page.evaluate(() => { window.__carTrace = []; window.__emitGamma(0); window.__emitGamma(1000); });
          await page.waitForFunction(() => window.__carTrace.some(item => item.x > innerWidth * 0.58));
          await page.evaluate(() => window.__emitGamma(-1000));
          await page.waitForFunction(() => window.__carTrace.some(item => item.x < innerWidth * 0.42));

          const marker = await page.evaluate(() => window.__carTrace.length);
          for (const value of [NaN, Infinity, -Infinity, null]) await page.evaluate(v => window.__emitGamma(v), value);
          await canvas.dispatchEvent('pointermove', { pointerId: 2, pointerType: 'touch', clientX: box.x + box.width * 0.25, clientY: box.y + box.height * 0.8, bubbles: true });
          await page.keyboard.press('ArrowRight');
          await page.waitForTimeout(100);
          assert.ok(await page.evaluate(index => window.__carTrace.slice(index).length > 2 && window.__carTrace.slice(index).every(item => Number.isFinite(item.x)), marker), 'invalid later sensor event poisoned steering recovery');

          await page.reload({ waitUntil: 'load' });
          assert.match(await start(page, 'unavailable'), /Drag left & right/);
          assert.ok(await page.evaluate(() => window.__activeTiltFrames()) <= 1, 'reload started duplicate animation frames');
        } finally {
          await context.close();
        }
      });
    }
  });
});
