import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const EVIDENCE_LABEL = process.env.HIDE_SEEK_NOTICE_EVIDENCE || '';
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'verify', 'shots', 'hide-seek-notice', EVIDENCE_LABEL);

async function freePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

function intersects(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

test('Hide & Seek reward notice stays clear of heading, navigation, and play', { timeout: 120000 }, async t => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('local Hide & Seek server did not start')), 12000);
      server.stdout.on('data', data => {
        if (String(data).includes('localhost:' + port)) { clearTimeout(timer); resolve(); }
      });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', () => { clearTimeout(timer); reject(new Error('local Hide & Seek server exited')); });
    });
    browser = await chromium.launch();
    const cases = [
      ...Array.from({ length: 8 }, (_, index) => ({ tier: index + 3, name: 'phone', width: 390, height: 844 })),
      { tier: 10, name: 'short-phone', width: 320, height: 568 },
      { tier: 10, name: 'tablet', width: 820, height: 1180 },
      { tier: 10, name: 'desktop', width: 1280, height: 900 },
    ];

    for (const entry of cases) {
      await t.test(`T${entry.tier} ${entry.name} ${entry.width}x${entry.height}`, async () => {
        const phone = entry.width <= 600;
        const context = await browser.newContext({
          viewport: { width: entry.width, height: entry.height },
          hasTouch: phone,
          isMobile: phone,
          reducedMotion: 'reduce',
          serviceWorkers: 'block',
        });
        await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
        await context.addInitScript(tier => {
          const profile = {
            id: `hide-seek-notice-t${tier}`,
            name: 'Hide Seek Notice Test',
            birthday: '2021-01-01',
            color: '#78b99b',
            voice: 'girl',
            mascot: { id: 'bunny', voice: 'girl' },
            tierOverrides: { 'peek-a-boo': tier },
            features: {},
            activitiesVisible: { 'peek-a-boo': true },
            achievements: {
              unlocked: { 'peek-a-boo.first': { at: 1 } },
              counters: { 'peek-a-boo': 1 },
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
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
          await page.goto(`http://127.0.0.1:${port}/games/peek-a-boo.html`, { waitUntil: 'load' });
          await page.waitForSelector('.seek-heading h1');
          await page.evaluate(() => vbCelebrate.show([{
            id: 'hide-seek-notice-layout',
            type: 'milestone',
            tier: 'gold',
            title: 'Hide and seek star',
          }]));
          await page.locator('.vb-celebrate.in').waitFor();
          const geometry = await page.evaluate(() => {
            const box = (element, textOnly = false) => {
              if (!element || getComputedStyle(element).display === 'none' || getComputedStyle(element).visibility === 'hidden') return null;
              const value = textOnly
                ? (() => { const range = document.createRange(); range.selectNodeContents(element); return range.getBoundingClientRect(); })()
                : element.getBoundingClientRect();
              return value.width && value.height
                ? { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height }
                : null;
            };
            return {
              notice: box(document.querySelector('.vb-celebrate')),
              heading: box(document.querySelector('.seek-heading h1'), true),
              instruction: box(document.querySelector('#hint'), true),
              navigation: [...document.querySelectorAll('.back-btn,.home-btn,#gameSettingsGear,.settings-gear,.vb-replay-instruction')].map(element => box(element)).filter(Boolean),
              stage: box(document.querySelector('#stage')),
              controls: [...document.querySelectorAll('.seek-controls button')].filter(element => getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none').map(element => box(element)).filter(Boolean),
              replayVisible: getComputedStyle(document.querySelector('.vb-replay-instruction')).visibility !== 'hidden',
              viewport: { width: innerWidth, height: innerHeight },
            };
          });
          if (EVIDENCE_LABEL) {
            await mkdir(EVIDENCE_DIR, { recursive: true });
            await page.screenshot({
              path: path.join(EVIDENCE_DIR, `hide-seek-T${entry.tier}-${entry.name}-${entry.width}x${entry.height}.png`),
              fullPage: false,
            });
          }

          assert.deepEqual(errors, [], `browser errors: ${errors.join('; ')}`);
          assert.ok(geometry.notice, 'reward notice is not visible');
          assert.equal(geometry.replayVisible, entry.width > 600,
            'phone reward should temporarily replace the replay prompt without hiding it on larger screens');
          assert.ok(geometry.notice.left >= 0 && geometry.notice.top >= 0 &&
            geometry.notice.right <= geometry.viewport.width && geometry.notice.bottom <= geometry.viewport.height,
          `reward notice is clipped: ${JSON.stringify(geometry.notice)}`);
          for (const [name, value] of [['heading', geometry.heading], ['instruction', geometry.instruction], ['stage', geometry.stage]]) {
            assert.equal(intersects(geometry.notice, value), false,
              `reward notice overlaps ${name}: ${JSON.stringify({ notice: geometry.notice, [name]: value })}`);
          }
          for (const [kind, values] of [['navigation', geometry.navigation], ['game control', geometry.controls]]) {
            for (const value of values) assert.equal(intersects(geometry.notice, value), false,
              `reward notice overlaps ${kind}: ${JSON.stringify({ notice: geometry.notice, [kind]: value })}`);
          }
          const center = { x: geometry.notice.left + geometry.notice.width / 2, y: geometry.notice.top + geometry.notice.height / 2 };
          assert.equal(await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.closest('.vb-celebrate')?.classList.contains('vb-celebrate'), center), true,
            'reward notice cannot be tapped to dismiss');
          await page.mouse.click(center.x, center.y);
          await page.locator('.vb-celebrate').waitFor({ state: 'detached', timeout: 1000 });
          await page.locator('.vb-replay-instruction').waitFor({ state: 'visible', timeout: 1000 });
          await page.locator('.vb-replay-instruction').click();
        } finally {
          await context.close();
        }
      });
    }
  } finally {
    await browser?.close();
    if (server.exitCode === null) server.kill();
    await once(server, 'exit').catch(() => {});
  }
});
