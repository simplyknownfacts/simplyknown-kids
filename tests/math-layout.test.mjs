import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const NOTICE_CASES = [
  ...Array.from({ length: 8 }, (_, index) => ({ tier: index + 3, name: 'phone', width: 390, height: 844 })),
  { tier: 6, name: 'short-phone', width: 320, height: 568 },
  { tier: 10, name: 'tablet', width: 820, height: 1180 },
  { tier: 10, name: 'desktop', width: 1280, height: 900 },
];
const ANSWER_CASES = [
  ...[6, 8, 10].map(tier => ({ tier, name: 'short-phone', width: 320, height: 568 })),
  { tier: 10, name: 'phone', width: 390, height: 844 },
  { tier: 10, name: 'tablet', width: 820, height: 1180 },
  { tier: 10, name: 'desktop', width: 1280, height: 900 },
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

function seed(tier) {
  const profile = {
    id: `math-layout-t${tier}`,
    name: 'Math Layout Test',
    birthday: '2020-01-01',
    color: '#4ECDC4',
    voice: 'girl',
    mascot: { id: 'dog' },
    tierOverrides: { math: tier },
    activitiesVisible: { math: true },
    features: { math: { subtract: true, multiply: true, divide: true, missingNumber: true } },
    achievements: {
      unlocked: { 'math.first': { at: 1 } },
      counters: { math: 119 },
      repeats: {},
      streak: { last: null, current: 0, best: 0 },
      xp: 0,
      rank: 'sprout',
    },
  };
  localStorage.setItem('vb_profiles', JSON.stringify([profile]));
  localStorage.setItem('vb_active_id', profile.id);
  localStorage.setItem('vb_pin', '1234');
  sessionStorage.removeItem('vb_award_last_shown');
  window.Audio = class {
    play() { queueMicrotask(() => this.onended?.()); return Promise.resolve(); }
    pause() {}
    load() {}
    removeAttribute() {}
  };
}

async function openMath(browser, port, entry) {
  const phone = entry.width <= 600;
  const context = await browser.newContext({
    viewport: { width: entry.width, height: entry.height },
    hasTouch: phone,
    isMobile: phone,
    reducedMotion: 'no-preference',
    serviceWorkers: 'block',
  });
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await context.addInitScript(seed, entry.tier);
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/learning/math.html`, { waitUntil: 'load' });
  await page.locator('.num-btn').first().waitFor();
  return { context, page };
}

test('Math phone reward and short-phone answers stay unobscured', { timeout: 120000 }, async t => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('local Math server did not start')), 12000);
      server.stdout.on('data', data => {
        if (String(data).includes('localhost:' + port)) { clearTimeout(timer); resolve(); }
      });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', () => { clearTimeout(timer); reject(new Error('local Math server exited')); });
    });
    browser = await chromium.launch();

    for (const entry of NOTICE_CASES) {
      await t.test(`reward T${entry.tier} ${entry.name} ${entry.width}x${entry.height}`, async () => {
        const { context, page } = await openMath(browser, port, entry);
        try {
          await page.evaluate(() => {
            speakInstruction('What is the answer?');
            vbCelebrate.show([{ id: 'math-layout', type: 'milestone', tier: 'gold', title: 'Math Mountain Star' }]);
          });
          await page.locator('.vb-celebrate.in').waitFor();
          const geometry = await page.evaluate(() => {
            const rect = element => {
              if (!element || getComputedStyle(element).display === 'none' || getComputedStyle(element).visibility === 'hidden') return null;
              const value = element.getBoundingClientRect();
              return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
            };
            return {
              notice: rect(document.querySelector('.vb-celebrate')),
              title: rect(document.querySelector('.title')),
              hint: rect(document.querySelector('#hint')),
              replayVisible: getComputedStyle(document.querySelector('.vb-replay-instruction')).visibility !== 'hidden',
              desktopTop: document.querySelector('.vb-celebrate').getBoundingClientRect().top,
              viewport: { width: innerWidth, height: innerHeight },
            };
          });
          assert.ok(geometry.notice.left >= 0 && geometry.notice.top >= 0 &&
            geometry.notice.right <= geometry.viewport.width && geometry.notice.bottom <= geometry.viewport.height,
          `reward notice is clipped: ${JSON.stringify(geometry.notice)}`);
          if (entry.width <= 600) {
            assert.equal(overlaps(geometry.notice, geometry.title), false,
              `reward notice overlaps title: ${JSON.stringify({ notice: geometry.notice, title: geometry.title })}`);
            assert.equal(overlaps(geometry.notice, geometry.hint), false,
              `reward notice overlaps hint: ${JSON.stringify({ notice: geometry.notice, hint: geometry.hint })}`);
            assert.equal(geometry.replayVisible, false, 'phone reward should temporarily replace the replay control');
          } else {
            assert.equal(geometry.desktopTop, 72, 'tablet/desktop shared reward placement changed');
            assert.equal(geometry.replayVisible, true, 'tablet/desktop replay control should remain visible');
          }
          if (entry.tier === 3 && entry.name === 'phone') {
            const fading = await page.evaluate(() => new Promise(resolve => {
              const notice = document.querySelector('.vb-celebrate');
              const capture = () => resolve({
                attached: notice.isConnected,
                opacity: Number(getComputedStyle(notice).opacity),
                replayVisible: getComputedStyle(document.querySelector('.vb-replay-instruction')).visibility !== 'hidden',
                timedOut: false,
              });
              const observer = new MutationObserver(() => {
                if (!notice.classList.contains('in')) { observer.disconnect(); capture(); }
              });
              observer.observe(notice, { attributes: true, attributeFilter: ['class'] });
              setTimeout(() => { observer.disconnect(); resolve({ timedOut: true }); }, 4000);
            }));
            assert.equal(fading.timedOut, false, 'automatic dismissal did not begin');
            assert.equal(fading.attached, true, 'automatic dismissal skipped the visible transition');
            assert.ok(fading.opacity > 0, 'automatic dismissal transition was not visible');
            assert.equal(fading.replayVisible, false, 'replay returned before the reward DOM disappeared');
          } else {
            await page.locator('.vb-celebrate').click();
          }
          await page.locator('.vb-celebrate').waitFor({ state: 'detached', timeout: 1000 });
          await page.locator('.vb-replay-instruction').waitFor({ state: 'visible', timeout: 1000 });
        } finally {
          await context.close();
        }
      });
    }

    for (const entry of ANSWER_CASES) {
      await t.test(`answers T${entry.tier} ${entry.name} ${entry.width}x${entry.height}`, async () => {
        const { context, page } = await openMath(browser, port, entry);
        try {
          await page.locator('#stage').evaluate(element => { element.scrollTop = 0; });
          const geometry = await page.evaluate(() => {
            const read = element => {
              const value = element.getBoundingClientRect();
              return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
            };
            return {
              gear: read(document.querySelector('#gameSettingsGear')),
              answers: [...document.querySelectorAll('.num-btn')].map(read),
              horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
            };
          });
          assert.equal(geometry.answers.length, 4, 'Math needs four answer choices');
          assert.ok(geometry.answers.every(answer => Math.min(answer.width, answer.height) >= 44), 'answer target shrank below 44px');
          assert.equal(geometry.answers.some(answer => overlaps(geometry.gear, answer)), false,
            `settings gear covers an answer: ${JSON.stringify(geometry)}`);
          assert.ok(Math.min(geometry.gear.width, geometry.gear.height) >= 44, 'settings target shrank below 44px');
          assert.ok(geometry.horizontalOverflow <= 1, `horizontal overflow is ${geometry.horizontalOverflow}px`);
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
