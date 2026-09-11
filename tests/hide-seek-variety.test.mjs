import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CASES = [
  { tier: 1, spots: 4, automatic: 'glow', words: false },
  { tier: 3, spots: 6, automatic: 'peek', words: true },
  { tier: 6, spots: 8, automatic: 'rustle', words: true },
  { tier: 10, spots: 12, automatic: 'none', words: true },
];
let server, browser, base;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

before(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(base + '/__health.json')).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.kill();
});

async function open(tier, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(value => {
    const profile = {
      id: `seek-t${value}`, name: 'Seek Test', birthday: '2020-01-01', color: '#4ECDC4',
      voice: 'girl', mascot: { id: 'bunny' }, tierOverrides: { 'peek-a-boo': value },
      features: {}, activitiesVisible: { 'peek-a-boo': true }, youtube: [],
    };
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    localStorage.setItem('vb_pin', '1234');
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  }, tier);
  const page = await context.newPage();
  await page.goto(base + '/games/peek-a-boo.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#roundAction')?.getAttribute('aria-disabled') === 'false');
  return { context, page };
}

for (const expected of CASES) {
  test(`Hide & Seek T${expected.tier} scales search density and visual clue`, async () => {
    const { context, page } = await open(expected.tier);
    try {
      assert.equal(await page.locator('.hiding-spot').count(), expected.spots);
      await page.locator('#roundAction').click();
      await page.waitForFunction(() => document.querySelector('#stage')?.dataset.phase === 'seek');
      const state = await page.evaluate(() => ({
        hint: document.querySelector('#hint').textContent.trim(),
        hintLabel: document.querySelector('#hint').getAttribute('aria-label'),
        glow: document.querySelectorAll('.hiding-spot.clue-glow').length,
        peek: document.querySelectorAll('.hiding-spot.clue-peek').length,
        rustle: document.querySelectorAll('.hiding-spot.clue-rustle').length,
        visibleParts: [...document.querySelectorAll('.hiding-spot .peek-piece')]
          .filter(piece => getComputedStyle(piece).display !== 'none').length,
        peekOwnsPoint: (() => {
          const spot = document.querySelector('.hiding-spot.has-peek');
          const box = spot?.querySelector('.peek-piece')?.getBoundingClientRect();
          return !!box && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('.hiding-spot') === spot;
        })(),
        allPeekPointsOwned: (() => {
          const active = document.querySelector('.hiding-spot.has-peek');
          return [...document.querySelectorAll('.hiding-spot')].every(spot => {
            active?.classList.remove('has-peek');
            spot.classList.add('has-peek');
            const box = spot.querySelector('.peek-piece').getBoundingClientRect();
            const owned = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('.hiding-spot') === spot;
            spot.classList.remove('has-peek');
            active?.classList.add('has-peek');
            return owned;
          });
        })(),
        part: document.querySelector('#stage').dataset.peekPart,
      }));
      assert.ok(['ears', 'face', 'paw', 'tail'].includes(state.part), `missing varied peek part: ${state.part}`);
      assert.equal(state.glow, expected.automatic === 'glow' ? 1 : 0);
      assert.equal(state.peek, expected.automatic === 'peek' ? 1 : 0);
      assert.equal(state.rustle, expected.automatic === 'rustle' ? 1 : 0);
      assert.equal(state.visibleParts, 1, 'round does not expose exactly one small animal part');
      assert.equal(state.peekOwnsPoint, true, 'another bush steals taps from the visible animal part');
      assert.equal(state.allPeekPointsOwned, true, 'a possible hiding place cannot own taps on its animal part');
      if (expected.automatic === 'none') assert.equal(state.glow + state.peek + state.rustle, 0);
      if (!expected.words) {
        assert.doesNotMatch(state.hint, /[a-z]/i, 'youngest visual prompt still requires reading');
        assert.match(state.hintLabel || '', /glowing bush/i, 'visual prompt lost screen-reader meaning');
      }
    } finally {
      await context.close();
    }
  });
}

test('Hide & Seek changes hiding place and peek part across repeated young-child rounds', { timeout: 30000 }, async () => {
  const { context, page } = await open(1);
  try {
    const targets = [], parts = [];
    for (let round = 0; round < 4; round++) {
      await page.locator('#roundAction').click();
      await page.waitForFunction(() => document.querySelector('#stage')?.dataset.phase === 'seek');
      const target = Number(await page.locator('.clue-glow').getAttribute('data-spot'));
      targets.push(target);
      parts.push(await page.locator('#stage').getAttribute('data-peek-part'));
      await page.locator('.hiding-spot').nth(target).click();
      await page.waitForFunction(() => document.querySelector('#stage')?.dataset.phase === 'found');
      await page.waitForTimeout(520);
      if (round < 3) {
        await page.locator('#playAgain').click();
        await page.waitForFunction(() => document.querySelector('#stage')?.dataset.phase === 'watch');
        await page.waitForTimeout(370);
      }
    }
    assert.ok(targets.every((target, index) => index === 0 || target !== targets[index - 1]), `location repeated immediately: ${targets}`);
    assert.equal(new Set(targets).size, 4, `young-child shuffle bag did not use all four bushes: ${targets}`);
    assert.equal(new Set(parts).size, 4, `peek-part shuffle bag did not vary ears/face/paw/tail: ${parts}`);
  } finally {
    await context.close();
  }
});
