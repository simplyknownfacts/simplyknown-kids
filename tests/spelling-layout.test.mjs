import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SPELLING_HTML = path.join(ROOT, 'learning', 'spelling.html');
const WORDS = {
  EGG: { w: 'EGG', e: '🥚' },
  MOON: { w: 'MOON', e: '🌙' },
  APPLE: { w: 'APPLE', e: '🍎' },
  GUITAR: { w: 'GUITAR', e: '🎸' },
  PENGUIN: { w: 'PENGUIN', e: '🐧' },
  ELEPHANT: { w: 'ELEPHANT', e: '🐘' },
};

let browser;
let server;
let base;

async function freePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

before(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('local Spelling server did not start')), 12000);
    server.stdout.on('data', chunk => {
      if (String(chunk).includes(`localhost:${port}`)) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`local Spelling server exited ${code}`)); });
  });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (server) {
    const ended = once(server, 'exit');
    server.kill();
    await ended;
  }
});

async function openCase({ tier, word, viewport }) {
  const phone = viewport.width <= 390;
  const context = await browser.newContext({
    viewport,
    hasTouch: phone,
    isMobile: phone,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  await context.route('**/learning/spelling.html', async route => {
    let html = await readFile(SPELLING_HTML, 'utf8');
    const target = JSON.stringify(WORDS[word]);
    const multipleChoice = "const target = WORDS[Math.floor(Math.random() * WORDS.length)];";
    const spellMode = "const target = pool[Math.floor(Math.random() * pool.length)];";
    assert.ok(html.includes(multipleChoice) && html.includes(spellMode), 'Spelling target hooks changed');
    html = html.replace(multipleChoice, `const target = ${target};`)
      .replace(spellMode, `const target = ${target};`);
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await context.addInitScript(({ tier }) => {
    const profile = {
      id: `spelling-layout-t${tier}`,
      name: 'Layout Test',
      birthday: '2020-01-01',
      color: '#4ECDC4',
      voice: 'girl',
      mascot: null,
      tierOverrides: { spelling: tier },
      features: {},
      activitiesVisible: { spelling: true },
    };
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    try {
      HTMLMediaElement.prototype.play = () => Promise.resolve();
      HTMLMediaElement.prototype.pause = () => {};
    } catch {}
  }, { tier });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  await page.goto(`${base}/learning/spelling.html`, { waitUntil: 'domcontentloaded' });
  await page.locator(tier >= 6 ? '.letter-tile' : '.word-card').first().waitFor();
  return { context, page };
}

async function assertReachableLayout(page, viewport, requireVerticalScroll = false) {
  const before = await page.evaluate(() => {
    const screen = document.querySelector('.screen');
    return {
      rootWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      screenWidth: screen.scrollWidth,
      screenClientWidth: screen.clientWidth,
      screenHeight: screen.scrollHeight,
      screenClientHeight: screen.clientHeight,
    };
  });
  assert.ok(before.rootWidth <= viewport.width + 1, `document clips horizontally: ${JSON.stringify(before)}`);
  assert.ok(before.bodyWidth <= viewport.width + 1, `body clips horizontally: ${JSON.stringify(before)}`);
  assert.ok(before.screenWidth <= before.screenClientWidth + 1, `Spelling screen clips horizontally: ${JSON.stringify(before)}`);
  if (requireVerticalScroll) {
    assert.ok(before.screenHeight > before.screenClientHeight, `short phone should scroll vertically: ${JSON.stringify(before)}`);
  }

  const controls = page.locator('.letter-tile, .word-card');
  for (let index = 0; index < await controls.count(); index++) {
    const control = controls.nth(index);
    await control.scrollIntoViewIfNeeded();
    const rect = await control.boundingBox();
    assert.ok(rect, `control ${index} has no box`);
    assert.ok(rect.x >= -0.5 && rect.x + rect.width <= viewport.width + 0.5,
      `control ${index} is horizontally unreachable: ${JSON.stringify(rect)}`);
    assert.ok(rect.width >= 44 && rect.height >= 44,
      `control ${index} is smaller than 44px: ${JSON.stringify(rect)}`);
  }
  if (requireVerticalScroll) {
    assert.ok(await page.locator('.screen').evaluate(element => element.scrollTop > 0),
      'last letter did not move through the natural vertical scroller');
  }
}

async function wrongThenCorrect(page, tier, word) {
  if (tier < 6) {
    const cards = page.locator('.word-card');
    const labels = (await cards.allTextContents()).map(label => label.trim());
    const wrong = labels.findIndex(label => label !== word);
    assert.ok(wrong >= 0, `no wrong word choice beside ${word}`);
    await cards.nth(wrong).click();
    assert.match(await page.locator('#hint').textContent(), /is not/i);
    const correct = cards.filter({ hasText: new RegExp(`^${word}$`) }).first();
    await correct.click();
    assert.equal(await correct.evaluate(element => element.classList.contains('matched')), true);
    return;
  }

  const letters = page.locator('.letter-tile');
  const labels = (await letters.allTextContents()).map(label => label.trim());
  const wrong = labels.findIndex(label => label !== word[0]);
  assert.ok(wrong >= 0, `no wrong letter choice beside ${word}`);
  await letters.nth(wrong).click();
  assert.match(await page.locator('#hint').textContent(), new RegExp(`Next letter:\\s*${word[0]}`, 'i'));
  for (const letter of word) {
    await letters.filter({ hasText: new RegExp(`^${letter}$`) }).first().click();
  }
  assert.equal((await page.locator('.spelled-slot').allTextContents()).join(''), word,
    `${word} did not recover after a wrong letter`);
}

test('Spelling choices stay reachable across tiers, widths, word lengths, and recovery', { timeout: 180000 }, async t => {
  const tierWords = ['EGG', 'EGG', 'EGG', 'EGG', 'EGG', 'EGG', 'MOON', 'APPLE', 'GUITAR', 'ELEPHANT'];
  for (let tier = 1; tier <= 10; tier++) {
    await t.test(`T${tier} at 390x844`, async () => {
      const word = tierWords[tier - 1];
      const { context, page } = await openCase({ tier, word, viewport: { width: 390, height: 844 } });
      try {
        await assertReachableLayout(page, { width: 390, height: 844 });
        await wrongThenCorrect(page, tier, word);
      } finally {
        await context.close();
      }
    });
  }

  for (const word of ['PENGUIN']) {
    await t.test(`${word.length}-letter ${word} bank`, async () => {
      const { context, page } = await openCase({ tier: 10, word, viewport: { width: 390, height: 844 } });
      try {
        await assertReachableLayout(page, { width: 390, height: 844 });
        await wrongThenCorrect(page, 10, word);
      } finally {
        await context.close();
      }
    });
  }

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 820, height: 1180 },
    { width: 1280, height: 900 },
  ]) {
    await t.test(`GUITAR at ${viewport.width}x${viewport.height}`, async () => {
      const { context, page } = await openCase({ tier: 10, word: 'GUITAR', viewport });
      try {
        await assertReachableLayout(page, viewport, viewport.width === 320);
        await wrongThenCorrect(page, 10, 'GUITAR');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('.letter-tile').first().waitFor();
        await assertReachableLayout(page, viewport, viewport.width === 320);
      } finally {
        await context.close();
      }
    });
  }
});
