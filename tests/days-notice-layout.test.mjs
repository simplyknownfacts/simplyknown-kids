import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const EVIDENCE_LABEL = process.env.DAYS_NOTICE_EVIDENCE || '';
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'verify', 'shots', 'days-notice', EVIDENCE_LABEL);
const CASES = [
  ...Array.from({ length: 8 }, (_, index) => ({ tier: index + 3, name: 'phone', width: 390, height: 844 })),
  { tier: 3, name: 'short-phone', width: 320, height: 568 },
  { tier: 10, name: 'short-phone', width: 320, height: 568 },
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

test('Days reward notice stays clear of title, controls, and play', { timeout: 120000 }, async t => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('local Days server did not start')), 12000);
      server.stdout.on('data', data => {
        if (String(data).includes('localhost:' + port)) { clearTimeout(timer); resolve(); }
      });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', () => { clearTimeout(timer); reject(new Error('local Days server exited')); });
    });
    browser = await chromium.launch();
    if (EVIDENCE_LABEL) await mkdir(EVIDENCE_DIR, { recursive: true });

    for (const entry of CASES) {
      await t.test(`T${entry.tier} ${entry.name} ${entry.width}x${entry.height}`, async () => {
        const phone = entry.width <= 600;
        const compact = entry.width <= 900;
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
            id: `days-notice-t${tier}`,
            name: 'Days Notice Test',
            birthday: '2021-01-01',
            color: '#78b99b',
            voice: 'girl',
            mascot: { id: 'bunny', voice: 'girl' },
            tierOverrides: { days: tier },
            features: {},
            activitiesVisible: { days: true },
            achievements: {
              unlocked: { 'days.first': { at: 1 } },
              counters: { days: 119 },
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
          await page.goto(`http://127.0.0.1:${port}/learning/days.html`, { waitUntil: 'load' });
          await page.waitForSelector('.title');
          await page.evaluate(() => {
            speakInstruction('What day comes after Monday?');
            vbCelebrate.show([{
              id: 'days-notice-layout',
              type: 'milestone',
              tier: 'gold',
              title: 'Days Star',
            }]);
          });
          await page.locator('.vb-celebrate.in').waitFor();

          const geometry = await page.evaluate(() => {
            const rect = element => {
              if (!element || getComputedStyle(element).display === 'none' || getComputedStyle(element).visibility === 'hidden') return null;
              const value = element.getBoundingClientRect();
              return value.width && value.height
                ? { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height }
                : null;
            };
            return {
              notice: rect(document.querySelector('.vb-celebrate')),
              title: rect(document.querySelector('.title')),
              hint: rect(document.querySelector('#hint')),
              replayVisible: getComputedStyle(document.querySelector('.vb-replay-instruction')).visibility !== 'hidden',
              navigation: [...document.querySelectorAll('.back-btn,.home-btn,#gameSettingsGear,.settings-gear,.vb-replay-instruction')].map(rect).filter(Boolean),
              targets: [...document.querySelectorAll('.day-tile')].map(rect).filter(Boolean),
              viewport: { width: innerWidth, height: innerHeight },
            };
          });
          if (EVIDENCE_LABEL) {
            await page.screenshot({
              path: path.join(EVIDENCE_DIR, `days-T${entry.tier}-${entry.name}-${entry.width}x${entry.height}.png`),
              fullPage: false,
            });
          }

          assert.deepEqual(errors, [], `browser errors: ${errors.join('; ')}`);
          assert.ok(geometry.notice, 'reward notice is not visible');
          assert.ok(geometry.notice.left >= 0 && geometry.notice.top >= 0 &&
            geometry.notice.right <= geometry.viewport.width && geometry.notice.bottom <= geometry.viewport.height,
          `reward notice is clipped: ${JSON.stringify(geometry.notice)}`);
          if (compact) {
            assert.equal(geometry.replayVisible, false, 'compact reward should temporarily replace the replay control');
            assert.equal(overlaps(geometry.notice, geometry.title), false,
              `reward notice overlaps title: ${JSON.stringify({ notice: geometry.notice, title: geometry.title })}`);
            assert.equal(overlaps(geometry.notice, geometry.hint), false,
              `reward notice overlaps hint: ${JSON.stringify({ notice: geometry.notice, hint: geometry.hint })}`);
            for (const [kind, values] of [['navigation', geometry.navigation], ['play target', geometry.targets]]) {
              for (const value of values) assert.equal(overlaps(geometry.notice, value), false,
                `reward notice overlaps ${kind}: ${JSON.stringify({ notice: geometry.notice, [kind]: value })}`);
            }
          } else {
            assert.equal(geometry.notice.top, 72, 'desktop shared reward placement changed');
            assert.equal(geometry.replayVisible, true, 'desktop replay control should remain visible');
          }
          const center = { x: geometry.notice.left + geometry.notice.width / 2, y: geometry.notice.top + geometry.notice.height / 2 };
          assert.equal(await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.closest('.vb-celebrate')?.classList.contains('vb-celebrate'), center), true,
            'reward notice cannot be tapped to dismiss');
          if (entry.tier === 3 && entry.name === 'phone') {
            const fading = await page.evaluate(() => new Promise(resolve => {
              const notice = document.querySelector('.vb-celebrate');
              const capture = () => resolve({
                noticeAttached: notice.isConnected,
                noticeOpacity: Number(getComputedStyle(notice).opacity),
                replayVisible: getComputedStyle(document.querySelector('.vb-replay-instruction')).visibility !== 'hidden',
                timedOut: false,
              });
              if (!notice.classList.contains('in')) return capture();
              const observer = new MutationObserver(() => {
                if (!notice.classList.contains('in')) {
                  observer.disconnect();
                  capture();
                }
              });
              observer.observe(notice, { attributes: true, attributeFilter: ['class'] });
              setTimeout(() => {
                observer.disconnect();
                resolve({ timedOut: true });
              }, 4000);
            }));
            assert.equal(fading.timedOut, false, 'automatic dismissal did not begin');
            assert.equal(fading.noticeAttached, true, 'automatic dismissal skipped the notice transition');
            assert.ok(fading.noticeOpacity > 0, 'automatic dismissal transition was not visible');
            assert.equal(fading.replayVisible, false, 'replay control returned before the automatic reward transition ended');
          } else {
            await page.mouse.click(center.x, center.y);
          }
          await page.locator('.vb-celebrate').waitFor({ state: 'detached', timeout: 1000 });
          await page.locator('.vb-replay-instruction').waitFor({ state: 'visible', timeout: 1000 });
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
