import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const EVIDENCE_LABEL = process.env.SHAPE_NOTICE_EVIDENCE || '';
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'verify', 'shots', 'shape-match-notice', EVIDENCE_LABEL);
const CASES = [
  ...Array.from({ length: 8 }, (_, index) => ({ tier: index + 3, name: 'phone', width: 390, height: 844 })),
  ...Array.from({ length: 8 }, (_, index) => ({ tier: index + 3, name: 'short-phone', width: 320, height: 568 })),
  { tier: 3, name: 'tablet', width: 820, height: 1180 },
  { tier: 3, name: 'desktop', width: 1280, height: 900 },
];

async function freePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

test('Shape Match reward notice stays clear of its title, controls, and play', { timeout: 120000 }, async t => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.mjs')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('local Shape Match server did not start')), 12000);
      server.stdout.on('data', data => {
        if (String(data).includes('localhost:' + port)) { clearTimeout(timer); resolve(); }
      });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', () => { clearTimeout(timer); reject(new Error('local Shape Match server exited')); });
    });
    browser = await chromium.launch();
    if (EVIDENCE_LABEL) await mkdir(EVIDENCE_DIR, { recursive: true });

    for (const entry of CASES) {
      await t.test(`T${entry.tier} ${entry.name} ${entry.width}x${entry.height}`, async () => {
        const context = await browser.newContext({
          viewport: { width: entry.width, height: entry.height },
          serviceWorkers: 'block',
          reducedMotion: 'reduce',
        });
        await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(tier => {
          const profile = {
            id: `shape-notice-t${tier}`,
            name: 'Shape Tester',
            birthday: '2021-01-01',
            color: '#78b99b',
            voice: 'girl',
            mascot: { id: 'bunny', voice: 'girl' },
            tierOverrides: { 'shape-match': tier },
            features: {},
            activitiesVisible: { 'shape-match': true },
            achievements: {
              unlocked: { 'shape-match.first': { at: 1 } },
              counters: { 'shape-match': 1 },
              repeats: {},
              streak: { last: null, current: 0, best: 0 },
              xp: 0,
              rank: 'sprout',
            },
          };
          localStorage.setItem('vb_profiles', JSON.stringify([profile]));
          localStorage.setItem('vb_active_id', profile.id);
          sessionStorage.removeItem('vb_award_last_shown');
          window.Audio = class {
            play() { queueMicrotask(() => this.onended?.()); return Promise.resolve(); }
            pause() {}
            load() {}
            removeAttribute() {}
          };
        }, entry.tier);
        await page.goto(`http://127.0.0.1:${port}/games/shape-match.html`, { waitUntil: 'load' });
        await page.waitForSelector('.title');
        await page.evaluate(() => vbCelebrate.show([{
          id: 'shape-match-notice-layout',
          type: 'milestone',
          tier: 'gold',
          title: 'Shape matching star',
        }]));
        await page.locator('.vb-celebrate.in').waitFor();

        const geometry = await page.evaluate(() => {
          const rect = selector => {
            const element = document.querySelector(selector);
            if (!element || getComputedStyle(element).display === 'none') return null;
            const value = element.getBoundingClientRect();
            if (!value.width || !value.height) return null;
            return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
          };
          return {
            notice: rect('.vb-celebrate'),
            title: rect('.title'),
            hint: rect('#hint'),
            navigation: rect('.nav-chrome'),
            back: rect('.back-btn'),
            home: rect('.home-btn'),
            sources: [...document.querySelectorAll('#shapesRow .shape')].map(element => {
              const value = element.getBoundingClientRect();
              return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
            }),
            targets: [...document.querySelectorAll('.target,.num-choice')].filter(element => getComputedStyle(element).display !== 'none').map(element => {
              const value = element.getBoundingClientRect();
              return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
            }),
            viewport: { width: innerWidth, height: innerHeight },
          };
        });
        if (EVIDENCE_LABEL) {
          await page.screenshot({
            path: path.join(EVIDENCE_DIR, `shape-match-T${entry.tier}-${entry.name}-${entry.width}x${entry.height}.png`),
            fullPage: false,
          });
        }

        assert.deepEqual(errors, [], `browser errors: ${errors.join('; ')}`);
        assert.ok(geometry.notice, 'reward notice is not visible');
        assert.ok(geometry.notice.left >= 0 && geometry.notice.top >= 0 &&
          geometry.notice.right <= geometry.viewport.width && geometry.notice.bottom <= geometry.viewport.height,
        `reward notice is clipped: ${JSON.stringify(geometry.notice)}`);
        for (const [name, value] of Object.entries({
          title: geometry.title,
          hint: geometry.hint,
          navigation: geometry.navigation,
          back: geometry.back,
          home: geometry.home,
        })) {
          if (value) assert.equal(overlaps(geometry.notice, value), false,
            `reward notice overlaps ${name}: ${JSON.stringify({ notice: geometry.notice, [name]: value })}`);
        }
        for (const [kind, values] of [['source shape', geometry.sources], ['play target', geometry.targets]]) {
          for (const value of values) assert.equal(overlaps(geometry.notice, value), false,
            `reward notice overlaps ${kind}: ${JSON.stringify({ notice: geometry.notice, [kind]: value })}`);
        }
        const center = { x: geometry.notice.left + geometry.notice.width / 2, y: geometry.notice.top + geometry.notice.height / 2 };
        assert.equal(await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.closest('.vb-celebrate')?.classList.contains('vb-celebrate'), center), true,
          'reward notice cannot be tapped to dismiss');
        await page.mouse.click(center.x, center.y);
        await page.locator('.vb-celebrate').waitFor({ state: 'detached', timeout: 1000 });
        await context.close();
      });
    }
  } finally {
    await browser?.close();
    if (server.exitCode === null) server.kill();
    await once(server, 'exit').catch(() => {});
  }
});
