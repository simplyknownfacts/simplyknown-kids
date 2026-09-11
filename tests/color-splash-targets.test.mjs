import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { chromium } from 'playwright';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CASES = [
  ...Array.from({ length: 10 }, (_, index) => ({
    name: `T${index + 1} phone 390x844`, tier: index + 1, viewport: { width: 390, height: 844 }, minimumPip: 44,
  })),
  { name: 'T10 short phone 320x568', tier: 10, viewport: { width: 320, height: 568 }, minimumPip: 44 },
  { name: 'T10 tablet 820x1180', tier: 10, viewport: { width: 820, height: 1180 }, minimumPip: 52 },
  { name: 'T10 desktop 1280x900', tier: 10, viewport: { width: 1280, height: 900 }, minimumPip: 52 },
];

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
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(base + '/__health.json');
      if (response.ok && (await response.json()).app === 'kids') break;
    } catch {}
    if (attempt === 99) throw new Error('local Color Splash server did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
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

async function openCase({ tier, viewport }) {
  const isPhone = viewport.width < 768;
  const context = await browser.newContext({
    viewport,
    isMobile: isPhone,
    hasTouch: isPhone,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === base ? route.continue() : route.abort('blockedbyclient');
  });
  await context.addInitScript(({ tier }) => {
    const profile = {
      id: `color-splash-t${tier}`,
      name: 'Paint Tester',
      birthday: '2020-01-01',
      color: '#4ECDC4',
      voice: 'girl',
      mascot: { id: 'bunny' },
      tierOverrides: { 'color-splash': tier },
      features: {},
      activitiesVisible: { 'color-splash': true },
      youtube: [],
    };
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    try { HTMLMediaElement.prototype.play = () => Promise.resolve(); } catch {}
  }, { tier });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(base + '/art/color-splash.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#vbPaintCanvas').waitFor();
  await page.evaluate(() => {
    window.__colorSplashRecords = [];
    window.vbProgress = { record: id => window.__colorSplashRecords.push(id) };
  });
  return { context, page, errors };
}

async function alphaCount(page) {
  return page.locator('#vbPaintCanvas').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 3; index < data.length; index += 4) if (data[index]) count += 1;
    return count;
  });
}

async function layout(page) {
  return page.evaluate(() => {
    const visible = node => {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    };
    const read = node => {
      const box = node.getBoundingClientRect();
      return { name: node.title || node.className || node.id, left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const pips = [...document.querySelectorAll('.vb-sw')].filter(visible).map(read);
    const controls = [...document.querySelectorAll('.vb-sw, .vb-tool, #gameSettingsGear, .nav-btn')].filter(visible).map(read);
    const overlaps = [];
    for (let left = 0; left < controls.length; left += 1) for (let right = left + 1; right < controls.length; right += 1) {
      const a = controls[left], b = controls[right];
      const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (width > 0.5 && height > 0.5) overlaps.push([a.name, b.name, width, height]);
    }
    const dock = read(document.querySelector('#vbPaintDock'));
    return {
      innerWidth,
      innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      pips,
      controls,
      overlaps,
      dock,
    };
  });
}

async function stroke(page, from, to) {
  const canvas = await page.locator('#vbPaintCanvas').boundingBox();
  assert.ok(canvas, 'paint canvas has no box');
  await page.mouse.move(canvas.x + canvas.width * from[0], canvas.y + canvas.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * to[0], canvas.y + canvas.height * to[1], { steps: 5 });
  await page.mouse.up();
}

async function rapidRecovery(page) {
  return page.locator('#vbPaintCanvas').evaluate(canvas => {
    const box = canvas.getBoundingClientRect();
    const fire = (type, pointerId, x, y, buttons) => canvas.dispatchEvent(new PointerEvent(type, {
      pointerId,
      pointerType: 'touch',
      clientX: box.left + x,
      clientY: box.top + y,
      buttons,
      bubbles: true,
      cancelable: true,
    }));
    fire('pointerdown', 41, 50, 70, 1);
    fire('pointermove', 41, 95, 95, 1);
    fire('pointerup', 41, 95, 95, 0);
    fire('pointerdown', 42, 115, 80, 1);
    fire('pointercancel', 42, 135, 100, 0);
    return true;
  });
}

test('Color Splash keeps child-sized pips and paint recovery across tiers and devices', { timeout: 180000 }, async t => {
  for (const testCase of CASES) await t.test(testCase.name, async () => {
    const { context, page, errors } = await openCase(testCase);
    try {
      const expectedPips = testCase.tier <= 3 ? 6 : testCase.tier <= 6 ? 9 : 12;
      const initial = await layout(page);
      assert.equal(initial.pips.length, expectedPips, 'tier palette changed');
      assert.ok(initial.pips.every(pip => pip.width >= testCase.minimumPip && pip.height >= testCase.minimumPip),
        `color pip below ${testCase.minimumPip}px: ${JSON.stringify(initial.pips)}`);
      assert.ok(initial.controls.every(control => control.left >= -1 && control.top >= -1 && control.right <= initial.innerWidth + 1 && control.bottom <= initial.innerHeight + 1),
        `control clipped outside viewport: ${JSON.stringify(initial.controls)}`);
      assert.deepEqual(initial.overlaps, [], `controls overlap: ${JSON.stringify(initial.overlaps)}`);
      assert.ok(initial.scrollWidth <= initial.innerWidth + 1, `horizontal overflow: ${JSON.stringify(initial)}`);
      assert.ok(initial.dock.left >= -1 && initial.dock.right <= initial.innerWidth + 1 && initial.dock.bottom <= initial.innerHeight + 1,
        `paint dock clipped: ${JSON.stringify(initial.dock)}`);

      for (let index = 0; index < initial.pips.length; index += 1) {
        await page.locator('.vb-sw').nth(index).click();
        assert.equal(await page.locator('.vb-sw').nth(index).evaluate(node => node.classList.contains('active')), true,
          `pip ${index} did not accept input through its hit target`);
      }

      await stroke(page, [0.35, 0.34], [0.55, 0.44]);
      const firstStroke = await alphaCount(page);
      assert.ok(firstStroke > 0, 'ordinary stroke painted no pixels');
      assert.deepEqual(await page.evaluate(() => window.__colorSplashRecords), ['color-splash'], 'one stroke must record exactly one action');

      await rapidRecovery(page);
      assert.ok(await alphaCount(page) > firstStroke, 'rapid touch input painted no additional pixels');
      assert.equal(await page.evaluate(() => window.__colorSplashRecords.length), 3, 'rapid completed/cancelled strokes must each finalize once');

      await page.locator('[title="Clear"]').click();
      assert.equal(await alphaCount(page), 0, 'Clear left paint behind');
      const recordsAfterClear = await page.evaluate(() => window.__colorSplashRecords.length);
      await stroke(page, [0.6, 0.3], [0.72, 0.4]);
      assert.ok(await alphaCount(page) > 0, 'fresh input did not recover after Clear');
      assert.equal(await page.evaluate(() => window.__colorSplashRecords.length), recordsAfterClear + 1, 'recovery stroke changed scoring semantics');

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('#vbPaintCanvas').waitFor();
      const reloaded = await layout(page);
      assert.ok(reloaded.pips.every(pip => pip.width >= testCase.minimumPip && pip.height >= testCase.minimumPip), 'reload restored undersized pips');
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });
});
