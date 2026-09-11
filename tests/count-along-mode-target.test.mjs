import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const VIEWPORTS = {
  'short-phone': { width: 320, height: 568, mobile: true },
  phone: { width: 390, height: 844, mobile: true },
  tablet: { width: 820, height: 1180, mobile: false },
  desktop: { width: 1280, height: 900, mobile: false },
};

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
      const timer = setTimeout(() => reject(new Error('local Count Along server did not start')), 12000);
      server.stdout.on('data', data => {
        if (String(data).includes('localhost:' + port)) { clearTimeout(timer); resolve(); }
      });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', () => { clearTimeout(timer); reject(new Error('local Count Along server exited')); });
    });
    browser = await chromium.launch();
    await run(browser, `http://127.0.0.1:${port}`);
  } finally {
    await browser?.close();
    if (server.exitCode === null) server.kill();
    await once(server, 'exit').catch(() => {});
  }
}

async function openCountAlong(browser, base, { tier, viewport, quiz }) {
  const vp = VIEWPORTS[viewport];
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: vp.mobile,
    isMobile: vp.mobile,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await context.addInitScript(({ tier, quiz }) => {
    const activityFeatures = {};
    if (quiz !== undefined) activityFeatures['count-along'] = { quizMode: quiz };
    const profile = {
      id: `count-repair-t${tier}`,
      name: 'Count Repair Test',
      birthday: '2021-01-01',
      color: '#4ECDC4',
      voice: 'girl',
      mascot: { id: 'dog' },
      tierOverrides: { 'count-along': tier },
      activitiesVisible: { 'count-along': true },
      features: activityFeatures,
      achievements: {
        unlocked: {
          'count-along.first': { at: 1 },
          'count-along.milestone.bronze': { at: 1 },
        },
        counters: { 'count-along': 119 },
        repeats: {},
        streak: { last: null, current: 0, best: 0 },
        xp: 0,
        rank: 'sprout',
      },
    };
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  }, { tier, quiz });
  const page = await context.newPage();
  await page.goto(base + '/learning/count-along.html', { waitUntil: 'load' });
  return { context, page, vp };
}

test('Count Along T4 setting selects how-many only when enabled', { timeout: 120000 }, async t => {
  await withApp(async (browser, base) => {
    for (const viewport of Object.keys(VIEWPORTS)) {
      await t.test(`${viewport} disabled keeps counting`, async () => {
        const { context, page } = await openCountAlong(browser, base, { tier: 4, viewport, quiz: false });
        try {
          assert.match(await page.locator('#instruction').innerText(), /^Tap each /);
          assert.ok(await page.locator('.dot:not(.counted)').count() >= 1);
          assert.equal(await page.locator('.num-btn').count(), 0);
        } finally { await context.close(); }
      });

      await t.test(`${viewport} enabled reaches how-many`, async () => {
        const { context, page } = await openCountAlong(browser, base, { tier: 4, viewport, quiz: true });
        try {
          assert.match(await page.locator('#instruction').innerText(), /^How many /);
          assert.ok(await page.locator('.dot.counted').count() >= 2);
          assert.equal(await page.locator('.num-btn').count(), 3);
        } finally { await context.close(); }
      });
    }
  });
});

test('Count Along preserves T5-T6 default quiz and T7-T10 advanced modes', { timeout: 120000 }, async t => {
  await withApp(async (browser, base) => {
    for (const tier of [5, 6]) {
      await t.test(`T${tier} default stays how-many`, async () => {
        const { context, page } = await openCountAlong(browser, base, { tier, viewport: 'phone' });
        try {
          assert.match(await page.locator('#instruction').innerText(), /^How many /);
          assert.equal(await page.locator('.num-btn').count(), 3);
        } finally { await context.close(); }
      });
    }
    for (const tier of [7, 8, 9, 10]) {
      for (const quiz of [false, true]) {
        await t.test(`T${tier} remains advanced with setting ${quiz}`, async () => {
          const { context, page } = await openCountAlong(browser, base, { tier, viewport: 'desktop', quiz });
          try {
            assert.match(await page.locator('#instruction').innerText(), /^(What comes (before|after)|Counting by )/);
            assert.equal(await page.locator('.dot').count(), 0);
            assert.equal(await page.locator('.num-btn').count(), 3);
          } finally { await context.close(); }
        });
      }
    }
  });
});

test('Count Along T1-T2 phone digit skip target meets the 44px floor without clipping', { timeout: 120000 }, async t => {
  await withApp(async (browser, base) => {
    for (const tier of [1, 2]) {
      for (const viewport of ['short-phone', 'phone']) {
        await t.test(`T${tier} ${viewport}`, async () => {
          const { context, page, vp } = await openCountAlong(browser, base, { tier, viewport, quiz: false });
          try {
            const box = await page.locator('.number-big').boundingBox();
            assert.ok(box, 'digit target is missing');
            assert.ok(box.width >= 44 && box.height >= 44, `digit target is ${box.width}x${box.height}px`);
            assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height,
              `digit target is clipped: ${JSON.stringify(box)}`);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'page overflows horizontally');
          } finally { await context.close(); }
        });
      }
    }
  });
});

test('Count Along T4 how-many accepts wrong then rapid correct input exactly once', { timeout: 120000 }, async () => {
  await withApp(async (browser, base) => {
    const { context, page } = await openCountAlong(browser, base, { tier: 4, viewport: 'phone', quiz: true });
    try {
      const answer = await page.locator('.dot.counted').count();
      const buttons = page.locator('.num-btn');
      const labels = await buttons.allInnerTexts();
      const correctIndex = labels.findIndex(label => Number(label) === answer);
      const wrongIndex = labels.findIndex(label => Number(label) !== answer);
      assert.ok(correctIndex >= 0 && wrongIndex >= 0, 'quiz choices need one correct and one wrong answer');
      await buttons.nth(wrongIndex).click();
      assert.equal(await page.evaluate(() => getActiveProfile().achievements.counters['count-along']), 119);
      await page.evaluate(index => {
        const button = document.querySelectorAll('.num-btn')[index];
        button.click(); button.click(); button.click();
      }, correctIndex);
      await page.waitForTimeout(80);
      const state = await page.evaluate(() => {
        const achievements = getActiveProfile().achievements;
        return {
          counter: achievements.counters['count-along'],
          mastery: !!achievements.unlocked['count-along.mastery'],
          repeat: achievements.repeats['count-along'] || 0,
        };
      });
      assert.equal(state.counter, 120);
      assert.equal(state.mastery, true);
      assert.ok(state.repeat <= 1, `rapid correct input produced ${state.repeat} repeat rewards`);
    } finally { await context.close(); }
  });
});
