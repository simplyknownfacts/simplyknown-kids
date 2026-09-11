import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const EVIDENCE_LABEL = process.env.MEMORY_LAYOUT_EVIDENCE || '';
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'verify', 'shots', 'memory-match-layout', EVIDENCE_LABEL);

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

async function openMemory(browser, port, tier, viewport) {
  const phone = viewport.width <= 600;
  const context = await browser.newContext({
    viewport,
    hasTouch: phone,
    isMobile: phone,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await context.addInitScript(tierValue => {
    const profile = {
      id: `memory-layout-t${tierValue}`,
      name: 'Memory Layout Test',
      birthday: '2020-01-01',
      color: '#7c5cff',
      voice: 'girl',
      mascot: { id: 'dog' },
      tierOverrides: { 'memory-match': tierValue },
      activitiesVisible: { 'memory-match': true },
      features: {},
      youtube: [],
    };
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    localStorage.setItem('vb_pin', '1234');
    try { HTMLMediaElement.prototype.play = () => Promise.resolve(); } catch {}
  }, tier);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/games/memory-match.html`, { waitUntil: 'load' });
  await page.locator('.mm-card').first().waitFor();
  return { context, page, errors };
}

async function boardGeometry(page) {
  return page.evaluate(() => {
    const box = element => {
      const value = element.getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    const cards = [...document.querySelectorAll('.mm-card')].map(box);
    const stage = document.querySelector('#stage');
    return {
      cards,
      controls: [...document.querySelectorAll('.back-btn,.home-btn,#gameSettingsGear')].filter(element => getComputedStyle(element).display !== 'none').map(box),
      title: box(document.querySelector('.title')),
      hint: box(document.querySelector('#hint')),
      viewport: { width: innerWidth, height: innerHeight },
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      stageScrollOverflow: Math.max(0, stage.scrollHeight - stage.clientHeight),
    };
  });
}

async function saveShot(page, name) {
  if (!EVIDENCE_LABEL) return;
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`), fullPage: false });
}

function assertBoardFits(geometry, name) {
  assert.equal(geometry.horizontalOverflow, 0, `${name} has horizontal overflow`);
  for (const [index, card] of geometry.cards.entries()) {
    assert.ok(card.left >= -1 && card.right <= geometry.viewport.width + 1,
      `${name} card ${index + 1} is clipped horizontally: ${JSON.stringify(card)}`);
    assert.ok(card.top >= -1 && card.bottom <= geometry.viewport.height + 1,
      `${name} card ${index + 1} starts outside the viewport: ${JSON.stringify(card)}`);
    assert.ok(Math.min(card.width, card.height) >= 44,
      `${name} card ${index + 1} is too small: ${JSON.stringify(card)}`);
    for (const control of geometry.controls) assert.equal(intersects(card, control), false,
      `${name} card ${index + 1} overlaps a control`);
  }
}

test('Memory Match keeps normal desktop and tablet boards together', { timeout: 120000 }, async t => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.mjs')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('local Memory Match server did not start')), 12000);
      server.stdout.on('data', data => {
        if (String(data).includes('localhost:' + port)) { clearTimeout(timer); resolve(); }
      });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', () => { clearTimeout(timer); reject(new Error('local Memory Match server exited')); });
    });
    browser = await chromium.launch();

    for (let tier = 1; tier <= 10; tier++) {
      await t.test(`T${tier} desktop 1280x900`, async () => {
        const { context, page, errors } = await openMemory(browser, port, tier, { width: 1280, height: 900 });
        try {
          await saveShot(page, `T${tier}-desktop-1280x900`);
          assert.deepEqual(errors, []);
          assertBoardFits(await boardGeometry(page), `T${tier} desktop`);
        } finally {
          await context.close();
        }
      });
    }

    await t.test('T10 tablet 820x1180', async () => {
      const { context, page, errors } = await openMemory(browser, port, 10, { width: 820, height: 1180 });
      try {
        await saveShot(page, 'T10-tablet-820x1180');
        assert.deepEqual(errors, []);
        assertBoardFits(await boardGeometry(page), 'T10 tablet');
      } finally {
        await context.close();
      }
    });

    await t.test('T10 short phone keeps finger targets and natural vertical scrolling', async () => {
      const { context, page, errors } = await openMemory(browser, port, 10, { width: 320, height: 568 });
      try {
        const geometry = await boardGeometry(page);
        await saveShot(page, 'T10-short-phone-320x568');
        assert.deepEqual(errors, []);
        assert.equal(geometry.horizontalOverflow, 0);
        assert.ok(geometry.stageScrollOverflow > 0, 'short phone should preserve natural vertical scrolling');
        assert.ok(geometry.cards.every(card => Math.min(card.width, card.height) >= 48),
          `short-phone targets shrank below 48px: ${JSON.stringify(geometry.cards)}`);
        await page.locator('.mm-card').last().scrollIntoViewIfNeeded();
        assert.ok(await page.locator('#stage').evaluate(stage => stage.scrollTop > 0), 'last card is not reachable through the stage scroller');
      } finally {
        await context.close();
      }
    });
  } finally {
    await browser?.close();
    if (server.exitCode === null) server.kill();
    await once(server, 'exit').catch(() => {});
  }
});

test('Memory Match phone reward stays clear of title, controls, and play', { timeout: 120000 }, async t => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('local Memory Match server did not start')), 12000);
      server.stdout.on('data', data => {
        if (String(data).includes('localhost:' + port)) { clearTimeout(timer); resolve(); }
      });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', () => { clearTimeout(timer); reject(new Error('local Memory Match server exited')); });
    });
    browser = await chromium.launch();
    const cases = [
      ...Array.from({ length: 8 }, (_, index) => ({ tier: index + 3, name: 'phone', width: 390, height: 844 })),
      { tier: 10, name: 'short-phone', width: 320, height: 568 },
    ];
    for (const entry of cases) {
      await t.test(`T${entry.tier} ${entry.name} ${entry.width}x${entry.height}`, async () => {
        const { context, page, errors } = await openMemory(browser, port, entry.tier, { width: entry.width, height: entry.height });
        try {
          await page.evaluate(() => vbCelebrate.show([{
            id: 'memory-match-layout', type: 'milestone', tier: 'gold', title: 'Memory matching star',
          }]));
          await page.locator('.vb-celebrate.in').waitFor();
          const geometry = await page.evaluate(() => {
            const box = element => {
              if (!element || getComputedStyle(element).display === 'none') return null;
              const value = element.getBoundingClientRect();
              return value.width && value.height ? { left:value.left, top:value.top, right:value.right, bottom:value.bottom, width:value.width, height:value.height } : null;
            };
            return {
              notice: box(document.querySelector('.vb-celebrate')),
              title: box(document.querySelector('.title')),
              hint: box(document.querySelector('#hint')),
              navigation: box(document.querySelector('.nav-chrome')),
              cards: [...document.querySelectorAll('.mm-card')].map(box),
              viewport: { width: innerWidth, height: innerHeight },
            };
          });
          await saveShot(page, `T${entry.tier}-${entry.name}-reward-${entry.width}x${entry.height}`);
          assert.deepEqual(errors, []);
          assert.ok(geometry.notice.left >= 0 && geometry.notice.top >= 0 &&
            geometry.notice.right <= geometry.viewport.width && geometry.notice.bottom <= geometry.viewport.height,
          `reward notice is clipped: ${JSON.stringify(geometry.notice)}`);
          for (const [name, value] of [['title', geometry.title], ['hint', geometry.hint], ['navigation', geometry.navigation]]) {
            if (value) assert.equal(intersects(geometry.notice, value), false,
              `reward notice overlaps ${name}: ${JSON.stringify({ notice: geometry.notice, [name]: value })}`);
          }
          for (const card of geometry.cards) assert.equal(intersects(geometry.notice, card), false,
            `reward notice overlaps a card: ${JSON.stringify({ notice: geometry.notice, card })}`);
          await page.locator('.vb-celebrate').click();
          await page.locator('.vb-celebrate').waitFor({ state: 'detached', timeout: 1000 });
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
