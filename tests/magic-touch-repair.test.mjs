import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const EVIDENCE_LABEL = process.env.MAGIC_TOUCH_REPAIR_EVIDENCE || '';
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'verify', 'shots', 'magic-touch-repair', EVIDENCE_LABEL);
const CASES = [
  { tier: 6, name: 'phone', width: 390, height: 844, mobile: true },
  { tier: 10, name: 'phone', width: 390, height: 844, mobile: true },
  { tier: 6, name: 'desktop', width: 1280, height: 900, mobile: false },
  { tier: 10, name: 'desktop', width: 1280, height: 900, mobile: false },
  { tier: 6, name: 'short-phone', width: 320, height: 568, mobile: true },
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
      const timer = setTimeout(() => reject(new Error('local Magic Touch server did not start')), 12000);
      server.stdout.on('data', data => {
        if (String(data).includes('localhost:' + port)) { clearTimeout(timer); resolve(); }
      });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', () => { clearTimeout(timer); reject(new Error('local Magic Touch server exited')); });
    });
    browser = await chromium.launch();
    await run(browser, `http://127.0.0.1:${port}`);
  } finally {
    await browser?.close();
    if (server.exitCode === null) server.kill();
    await once(server, 'exit').catch(() => {});
  }
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
  await context.addInitScript(tier => {
    const profile = {
      id: `magic-repair-t${tier}`,
      name: 'Magic Repair Test',
      birthday: '2021-01-01',
      color: '#4ECDC4',
      voice: 'girl',
      mascot: { id: 'dog' },
      tierOverrides: { 'magic-touch': tier },
      activitiesVisible: { 'magic-touch': true },
      features: {},
      achievements: {
        unlocked: { 'magic-touch.first': { at: 1 } },
        counters: { 'magic-touch': 10 },
        repeats: {},
        streak: { last: null, current: 0, best: 0 },
        xp: 0,
        rank: 'sprout',
      },
    };
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    window.__magicDotLabels = {};
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, x, y, ...rest) {
      if (this.canvas?.id === 'canvas' && /^\d+$/.test(String(value))) {
        window.__magicDotLabels[String(value)] = { x, y };
      }
      return fillText.call(this, value, x, y, ...rest);
    };
    try { HTMLMediaElement.prototype.play = () => Promise.resolve(); } catch {}
    try { navigator.vibrate = () => true; } catch {}
  }, entry.tier);
  const page = await context.newPage();
  await page.goto(base + '/games/magic-touch.html', { waitUntil: 'load' });
  return { context, page };
}

test('Magic Touch Connect the dots control meets the 44px child-target floor', { timeout: 120000 }, async t => {
  await withApp(async (browser, base) => {
    for (const entry of CASES) {
      await t.test(`T${entry.tier} ${entry.name}`, async () => {
        const { context, page } = await openCase(browser, base, entry);
        try {
          const size = await page.locator('#dotsBtn').evaluate(element => {
            const rect = element.getBoundingClientRect();
            return { width: rect.width, height: rect.height };
          });
          assert.ok(size.width >= 44 && size.height >= 44, `mode control is ${size.width}x${size.height}px`);
          if (EVIDENCE_LABEL) {
            await mkdir(EVIDENCE_DIR, { recursive: true });
            await page.screenshot({ path: path.join(EVIDENCE_DIR, `magic-T${entry.tier}-${entry.name}-initial.png`) });
          }
        } finally {
          await context.close();
        }
      });
    }
  });
});

test('Magic Touch records exactly once for each completed connected shape', { timeout: 120000 }, async t => {
  await withApp(async (browser, base) => {
    for (const entry of CASES) {
      await t.test(`T${entry.tier} ${entry.name}`, async () => {
        const { context, page } = await openCase(browser, base, entry);
        try {
          await page.evaluate(() => {
            window.__magicRecordCalls = 0;
            const record = window.vbProgress.record;
            window.vbProgress.record = (...args) => {
              window.__magicRecordCalls++;
              return record.apply(window.vbProgress, args);
            };
          });
          await page.locator('#dotsBtn').click();
          await page.waitForFunction(() => Object.keys(window.__magicDotLabels || {}).length >= 3);
          const labels = await page.evaluate(() => Object.entries(window.__magicDotLabels)
            .map(([number, point]) => ({ number: Number(number), ...point }))
            .sort((a, b) => a.number - b.number));
          for (const point of labels) await page.mouse.click(point.x, point.y);
          await page.waitForFunction(() => /^✨ A .+! ✨$/.test(document.querySelector('#hint')?.textContent || ''));
          assert.equal(await page.evaluate(() => window.__magicRecordCalls), 1);
          for (const point of [...labels, ...labels]) await page.mouse.click(point.x, point.y);
          await page.waitForTimeout(100);
          assert.equal(await page.evaluate(() => window.__magicRecordCalls), 1, 'rapid completion taps added progress');
          if (EVIDENCE_LABEL) {
            await mkdir(EVIDENCE_DIR, { recursive: true });
            await page.screenshot({ path: path.join(EVIDENCE_DIR, `magic-T${entry.tier}-${entry.name}-complete.png`) });
          }
          await page.locator('#dotsBtn').click();
          assert.match(await page.locator('#hint').textContent(), /Touch the sky/);
          await page.evaluate(() => { window.__magicDotLabels = {}; });
          await page.locator('#dotsBtn').click();
          await page.waitForFunction(() => Object.keys(window.__magicDotLabels || {}).length >= 3);
          assert.match(await page.locator('#hint').textContent(), /Tap the dots/);
          assert.equal(await page.evaluate(() => window.__magicRecordCalls), 1, 'mode reset/re-entry added progress');
        } finally {
          await context.close();
        }
      });
    }
  });
});
