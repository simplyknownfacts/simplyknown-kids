import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
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
    cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base + '/__health.json')).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
});

after(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
});

function uploadLineArt() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80">
    <rect width="120" height="80" fill="white"/>
    <rect x="4" y="4" width="112" height="72" fill="none" stroke="#555" stroke-width="5"/>
    <path d="M60 5V75" stroke="#777" stroke-width="5"/>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function openLineArt() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80">
    <rect width="120" height="80" fill="white"/><path d="M60 0V34" stroke="#555" stroke-width="5"/>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function tapSource(page, x, y, times = 1) {
  const box = await page.locator('#colorFillCanvas').boundingBox();
  const size = await page.locator('#colorFillCanvas').evaluate(c => ({ w: c.width, h: c.height }));
  const px = box.x + x / size.w * box.width;
  const py = box.y + y / size.h * box.height;
  for (let i = 0; i < times; i++) await page.mouse.click(px, py);
}

async function pixel(page, x, y) {
  return page.locator('#colorFillCanvas').evaluate((canvas, point) =>
    [...canvas.getContext('2d').getImageData(point.x, point.y, 1, 1).data], { x, y });
}

test('Color In fills bounded regions, recolors once, undoes, and survives resize', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('vb_profiles', JSON.stringify([{
      id: 'fill-kid', name: 'Fill', birthday: '2020-01-01', color: '#4ECDC4', voice: 'girl',
      mascot: { id: 'dog' }, tierOverrides: { 'color-in': 4 }, features: {}, activitiesVisible: {}, youtube: [],
    }]));
    localStorage.setItem('vb_active_id', 'fill-kid');
    localStorage.removeItem('vb_coloring_pages');
  });
  const page = await ctx.newPage();
  await page.goto(base + '/art/color-in.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#colorFillCanvas[data-ready="1"]');
  await page.evaluate(() => {
    window.__records = [];
    window.vbProgress = { record: id => window.__records.push(id) };
  });

  const box = await page.locator('#colorFillCanvas').boundingBox();
  assert.ok(Math.abs(box.width / box.height - 1) < 0.03, 'the square built-in picture was stretched');
  await page.locator('[data-color="#FF5A67"]').click();
  await page.locator('#colorFillCanvas').evaluate(canvas => {
    const rect = canvas.getBoundingClientRect();
    const init = { pointerId: 41, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height * .375, bubbles: true };
    canvas.dispatchEvent(new PointerEvent('pointerdown', init));
    canvas.dispatchEvent(new PointerEvent('pointercancel', init));
    canvas.dispatchEvent(new PointerEvent('pointerup', init));
  });
  assert.equal(await page.evaluate(() => window.__records.length), 0, 'cancelled pointer filled a region');
  await tapSource(page, 200, 150, 8);
  assert.deepEqual((await pixel(page, 200, 150)).slice(0, 3), [255, 90, 103]);
  assert.ok((await pixel(page, 200, 45))[1] > 230, 'face color crossed into the top ray');
  assert.ok((await pixel(page, 305, 200))[0] < 100, 'the main outline was painted over');
  assert.ok((await pixel(page, 168, 188))[0] < 100, 'the pupil detail was painted over');
  assert.equal(await page.evaluate(() => window.__records.length), 1, 'same-color mashing awarded progress');
  await tapSource(page, 305, 200);
  await page.mouse.click(box.x - 4, box.y - 4);
  assert.equal(await page.evaluate(() => window.__records.length), 1, 'outline/outside tap awarded progress');

  await page.locator('[data-color="#3988FF"]').click();
  await tapSource(page, 200, 150);
  assert.deepEqual((await pixel(page, 200, 150)).slice(0, 3), [57, 136, 255]);
  await page.locator('#undoFill').click();
  assert.deepEqual((await pixel(page, 200, 150)).slice(0, 3), [255, 90, 103]);
  await page.setViewportSize({ width: 844, height: 390 });
  assert.deepEqual((await pixel(page, 200, 150)).slice(0, 3), [255, 90, 103]);
  await page.locator('#nextPage').click();
  await page.waitForFunction(() => document.querySelector('.scene-title')?.textContent === 'Friendly Cat');
  await page.locator('#prevPage').click();
  await page.waitForFunction(() => document.querySelector('.scene-title')?.textContent === 'Smiling Sun');
  assert.deepEqual((await pixel(page, 200, 150)).slice(0, 3), [255, 90, 103]);
  assert.equal(await page.evaluate(() => window.__records.length), 2);
  assert.equal(await page.getByText('Blank Page', { exact: true }).count(), 0);
  assert.equal(await page.locator('#vbPaintCanvas, [data-brush], [data-eraser]').count(), 0);
  await ctx.close();
});

test('uploaded gray line art fills one enclosed side and handles a broken page safely', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const lineArt = uploadLineArt();
  const openArt = openLineArt();
  await ctx.addInitScript(({ lineArt, openArt }) => {
    localStorage.setItem('vb_profiles', JSON.stringify([{
      id: 'upload-kid', name: 'Upload', birthday: '2020-01-01', color: '#4ECDC4', voice: 'girl',
      mascot: { id: 'dog' }, tierOverrides: { 'color-in': 4 }, features: {}, activitiesVisible: {}, youtube: [],
    }]));
    localStorage.setItem('vb_active_id', 'upload-kid');
    localStorage.setItem('vb_coloring_pages', JSON.stringify([
      { id: 'safe', name: '<img id="hostile-name">', lineArt },
      { id: 'open', name: 'Open Lines', lineArt: openArt },
      { id: 'broken', name: 'Broken Page', lineArt: 'data:image/png;base64,broken' },
      { id: 'remote', name: 'Remote', lineArt: 'https://example.invalid/tracker.png' },
    ]));
  }, { lineArt, openArt });
  const page = await ctx.newPage();
  await page.goto(base + '/art/color-in.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#colorFillCanvas[data-ready="1"]');
  for (let i = 0; i < 6; i++) await page.locator('#nextPage').click();
  await page.waitForFunction(() => document.querySelector('.scene-title')?.textContent.includes('hostile-name'));
  assert.equal(await page.locator('#hostile-name').count(), 0, 'stored upload name created markup');
  await page.waitForSelector('#colorFillCanvas[data-ready="1"]');
  await page.locator('[data-color="#46C76B"]').click();
  await tapSource(page, 30, 40);
  assert.deepEqual((await pixel(page, 30, 40)).slice(0, 3), [70, 199, 107]);
  assert.ok((await pixel(page, 90, 40))[0] > 230, 'fill crossed the gray divider');
  assert.ok((await pixel(page, 60, 40))[0] < 150, 'gray divider was painted over');
  await page.locator('#nextPage').click();
  await page.waitForFunction(() => document.querySelector('.scene-title')?.textContent === 'Open Lines');
  await page.waitForSelector('#colorFillCanvas[data-ready="1"]');
  const beforeOpen = await pixel(page, 30, 40);
  await tapSource(page, 30, 40);
  assert.deepEqual(await pixel(page, 30, 40), beforeOpen, 'an unenclosed area flooded the whole sheet');
  assert.match(await page.locator('[data-fill-message]').textContent(), /inside the lines/i);
  await page.locator('#nextPage').click();
  await page.waitForSelector('[data-fill-error]');
  assert.match(await page.locator('[data-fill-error]').textContent(), /couldn't open/i);
  await ctx.close();
});

test('malformed stored uploads fall back to the six safe built-in pictures', async () => {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 568 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('vb_profiles', JSON.stringify([{
      id: 'json-kid', name: 'JSON', birthday: '2020-01-01', voice: 'girl', mascot: { id: 'dog' },
      tierOverrides: { 'color-in': 2 }, features: {}, activitiesVisible: {}, youtube: [],
    }]));
    localStorage.setItem('vb_active_id', 'json-kid');
    localStorage.setItem('vb_coloring_pages', '{not valid json');
  });
  const page = await ctx.newPage();
  await page.goto(base + '/art/color-in.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#colorFillCanvas[data-ready="1"]');
  for (let i = 0; i < 6; i++) await page.locator('#nextPage').click();
  await page.waitForFunction(() => document.querySelector('.scene-title')?.textContent === 'Smiling Sun');
  assert.equal(await page.locator('[data-fill-error]:visible').count(), 0);
  await ctx.close();
});

test('BFCache return can open an unvisited picture and lost capture releases the next primary tap', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('vb_profiles', JSON.stringify([{
      id: 'lifecycle-kid', name: 'Life', birthday: '2020-01-01', voice: 'girl', mascot: { id: 'dog' },
      tierOverrides: { 'color-in': 3 }, features: {}, activitiesVisible: {}, youtube: [],
    }]));
    localStorage.setItem('vb_active_id', 'lifecycle-kid');
    localStorage.removeItem('vb_coloring_pages');
  });
  const page = await ctx.newPage();
  await page.goto(base + '/art/color-in.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#colorFillCanvas[data-ready="1"]');
  assert.deepEqual(await page.locator('#colorPalette .pip').evaluateAll(buttons =>
    buttons.map(button => button.getAttribute('aria-label'))),
  ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple']);

  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await page.locator('#nextPage').click();
  await page.waitForFunction(() =>
    document.querySelector('.scene-title')?.textContent === 'Friendly Cat' &&
    document.querySelector('#colorFillCanvas')?.dataset.ready === '1', null, { timeout: 1500 });

  await page.evaluate(() => {
    window.__records = [];
    window.vbProgress = { record: id => window.__records.push(id) };
    const canvas = document.getElementById('colorFillCanvas');
    const rect = canvas.getBoundingClientRect();
    const point = { clientX: rect.left + rect.width * .5, clientY: rect.top + rect.height * .65, bubbles: true };
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...point, pointerId: 71, pointerType: 'touch', isPrimary: true }));
    canvas.dispatchEvent(new PointerEvent('lostpointercapture', { ...point, pointerId: 71, pointerType: 'touch', isPrimary: true }));
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...point, pointerId: 72, pointerType: 'touch', isPrimary: true }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...point, pointerId: 72, pointerType: 'touch', isPrimary: true }));
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...point, pointerId: 73, pointerType: 'touch', isPrimary: false }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...point, pointerId: 73, pointerType: 'touch', isPrimary: false }));
  });
  assert.equal(await page.evaluate(() => window.__records.length), 1,
    'lost capture blocked the next tap or non-primary input filled again');
  await ctx.close();
});
