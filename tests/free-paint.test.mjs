import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const legacyHtml = process.env.LEGACY_FREE_PAINT
  ? execFileSync('git', ['show', '77e1773:art/finger-paint.html'], { cwd: root, encoding: 'utf8' })
  : null;
let server;
let browser;
let base;

before(async () => {
  const port = await new Promise(resolve => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const selected = probe.address().port;
      probe.close(() => resolve(selected));
    });
  });
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(base + '/__health.json')).ok) break; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.kill();
});

async function open(viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (legacyHtml && url.pathname === '/art/finger-paint.html') {
      return route.fulfill({ status: 200, contentType: 'text/html', body: legacyHtml });
    }
    return url.origin === base ? route.continue() : route.abort();
  });
  await context.addInitScript(() => {
    localStorage.setItem('vb_profiles', JSON.stringify([{
      id: 'paint-test', name: 'Painter', birthday: '2024-01-01', voice: 'girl',
      mascot: { id: 'bunny' }, tierOverrides: { 'finger-paint': 1 },
      features: { 'finger-paint': {} }, activitiesVisible: {}, youtube: [],
    }]));
    localStorage.setItem('vb_active_id', 'paint-test');
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(base + '/art/finger-paint.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#canvas').waitFor();
  return { context, page, errors };
}

async function alphaCount(page) {
  return page.locator('#canvas').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 3; index < data.length; index += 4) if (data[index]) count += 1;
    return count;
  });
}

test('Free Paint gives every tier a blank, bounded studio with reachable tools', async t => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 390, height: 667 },
    { width: 844, height: 390 },
    { width: 320, height: 568 },
  ]) await t.test(`${viewport.width}x${viewport.height}`, async () => {
    const { context, page, errors } = await open(viewport);
    try {
      assert.equal(await page.title(), 'Free Paint');
      assert.equal(await page.locator('[data-color]').count(), 6, 'palette is intrinsic at tier 1');
      assert.equal(await page.locator('[data-brush]').count(), 3, 'brush styles are intrinsic at tier 1');
      assert.equal(await page.locator('[data-size]').count(), 3, 'brush sizes are intrinsic at tier 1');
      await page.locator('#eraserButton').waitFor();
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        width: innerWidth,
        height: innerHeight,
        controls: Array.from(document.querySelectorAll('.paint-control')).map(button => {
          const box = button.getBoundingClientRect();
          return { width: box.width, height: box.height, right: box.right, bottom: box.bottom };
        }),
        canvas: (() => { const box = document.querySelector('#canvas').getBoundingClientRect(); return { width: box.width, height: box.height, right: box.right, bottom: box.bottom }; })(),
      }));
      assert.ok(metrics.scrollWidth <= metrics.width + 1 && metrics.scrollHeight <= metrics.height + 1, 'studio scrolls');
      assert.ok(metrics.controls.every(box => box.width >= 44 && box.height >= 44), 'a control is below 44px');
      assert.ok(metrics.controls.every(box => box.right <= metrics.width + 1 && box.bottom <= metrics.height + 1), 'a control leaves the viewport');
      assert.ok(metrics.canvas.width >= 120 && metrics.canvas.height >= 120, 'paper is not usable');
      assert.equal(await alphaCount(page), 0, 'new paper is not blank');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
});

test('brushes paint real pixels while pointer ownership, undo, clear, and resize preserve state', async () => {
  const { context, page, errors } = await open();
  try {
    await page.evaluate(() => { window.paintAwards = []; window.vbProgress = { record: id => paintAwards.push(id) }; });
    const paper = await page.locator('#canvas').boundingBox();
    const x = paper.x + paper.width * 0.45;
    const y = paper.y + paper.height * 0.42;

    await page.mouse.click(x, y);
    const tapped = await alphaCount(page);
    assert.ok(tapped > 20, 'a tap did not leave a mark');
    assert.deepEqual(await page.evaluate(() => paintAwards), ['finger-paint']);

    await page.locator('[data-color="#9b6be8"]').click();
    await page.locator('[data-brush="marker"]').click();
    await page.locator('[data-size="large"]').click();
    await page.mouse.move(x - 70, y + 70);
    await page.mouse.down();
    await page.mouse.move(x + 70, y + 70, { steps: 8 });
    await page.mouse.up();
    const marked = await alphaCount(page);
    assert.ok(marked > tapped, 'marker did not add pixels');
    assert.deepEqual(await page.evaluate(() => freePaintApp.getState()), {
      color: '#9b6be8', brush: 'marker', size: 'large', erasing: false, undoDepth: 2,
    });

    await page.locator('#undoButton').click();
    assert.equal(await alphaCount(page), tapped, 'undo did not restore the prior pixels');
    await page.locator('#clearButton').click();
    assert.equal(await alphaCount(page), 0, 'clear left paint behind');
    await page.locator('#undoButton').click();
    assert.equal(await alphaCount(page), tapped, 'clear could not be undone');

    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(80);
    assert.ok(await alphaCount(page) > 0, 'resize lost the artwork');

    await page.locator('#clearButton').click();
    const awardsBeforeNoop = await page.evaluate(() => paintAwards.length);
    await page.locator('#eraserButton').click();
    const resizedPaper = await page.locator('#canvas').boundingBox();
    await page.mouse.click(resizedPaper.x + resizedPaper.width * 0.6, resizedPaper.y + resizedPaper.height * 0.5);
    assert.equal(await page.evaluate(() => paintAwards.length), awardsBeforeNoop, 'blank erasing awarded progress');

    const ownership = await page.locator('#canvas').evaluate(canvas => {
      const box = canvas.getBoundingClientRect();
      const fire = (name, id, x, y, buttons) => canvas.dispatchEvent(new PointerEvent(name, {
        pointerId: id, pointerType: 'touch', clientX: box.left + x, clientY: box.top + y,
        buttons, bubbles: true, cancelable: true,
      }));
      fire('pointerdown', 41, 30, 40, 1);
      fire('pointerdown', 42, 180, 110, 1);
      fire('pointermove', 42, 230, 140, 1);
      fire('pointerup', 42, 230, 140, 0);
      fire('pointermove', 41, 95, 75, 1);
      fire('pointercancel', 41, 95, 75, 0);
      return freePaintApp.getState();
    });
    assert.equal(ownership.erasing, true);
    assert.equal(await page.evaluate(() => paintAwards.length), awardsBeforeNoop, 'blank eraser gesture awarded progress');

    await page.locator('[data-brush="sprinkle"]').click();
    await page.locator('[data-color="#35b9d4"]').click();
    await page.locator('#canvas').evaluate(canvas => {
      const box = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 51, pointerType: 'touch', clientX: box.left + 80, clientY: box.top + 90, buttons: 1, bubbles: true }));
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
    });
    assert.ok(await alphaCount(page) > 0, 'sprinkle tap or pagehide finalization failed');
    assert.equal(await page.evaluate(() => paintAwards.length), awardsBeforeNoop + 1);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
