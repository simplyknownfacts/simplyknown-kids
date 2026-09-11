import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const VIEWPORTS = [[320,568],[390,844],[783,1270],[844,390],[568,320]];
const KINDS = ['art','games','learn','listen','my-room','ribbons','watch'];
const ROUTES = {
  art: 'art/index.html',
  games: 'games/index.html',
  learn: 'learning/index.html',
  listen: 'listen/index.html',
  'my-room': 'my-room.html',
  ribbons: 'achievements.html',
  watch: 'videos/index.html',
};
const child = {
  id: 'island-test', name: 'Island Explorer', birthday: '2021-01-01', color: '#78b99b', voice: 'girl',
  mascot: { id: 'bunny', voice: 'girl' }, features: {}, activitiesVisible: {},
};

async function freePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

test('ocean archipelago keeps seven separated destination islands selectable and its water inert', { timeout: 180000 }, async t => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.mjs')], {
    cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ['ignore','pipe','pipe'],
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('local island server did not start')), 12000);
      server.stdout.on('data', data => {
        if (String(data).includes('localhost:' + port)) { clearTimeout(timer); resolve(); }
      });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', () => { clearTimeout(timer); reject(new Error('local island server exited')); });
    });
    browser = await chromium.launch();
    const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await context.addInitScript(profile => {
      localStorage.setItem('vb_profiles', JSON.stringify([profile]));
      localStorage.setItem('vb_active_id', profile.id);
    }, child);
    const page = await context.newPage();
    const errors = [];
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));

    async function open() {
      await page.goto(`http://127.0.0.1:${port}/home.html`);
      await page.waitForSelector('#worldScene[data-state="ready"]');
      await page.waitForFunction(() => !!window.vbWorldScene?.snapshot().oceanPoint);
    }
    async function canvasPoint(point) {
      const box = await page.locator('#worldCanvas').boundingBox();
      assert.ok(box, 'world canvas has no visible bounds');
      return { x: box.x + point.x, y: box.y + point.y };
    }
    async function shore(kind) {
      const point = await page.evaluate(kind => vbWorldScene.snapshot().islands.find(island => island.kind === kind)?.shore, kind);
      assert.ok(point, `missing ${kind} shore test point`);
      return canvasPoint(point);
    }

    for (const [width,height] of VIEWPORTS) {
      await t.test(`${width}×${height}: islands fit, keep water gaps, and own their scenery taps`, async () => {
        await page.setViewportSize({ width, height });
        await open();
        const result = await page.evaluate(() => {
          const canvas = document.getElementById('worldCanvas');
          const rect = canvas.getBoundingClientRect();
          const snapshot = vbWorldScene.snapshot();
          const islands = snapshot.islands.filter(island => island.kind !== 'companion');
          return {
            overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
            canvas: { width: rect.width, height: rect.height },
            oceanPoint: snapshot.oceanPoint,
            oceanPick: vbWorldScene.pick(rect.x + snapshot.oceanPoint.x, rect.y + snapshot.oceanPoint.y),
            oceanTarget: document.elementFromPoint(rect.x + snapshot.oceanPoint.x, rect.y + snapshot.oceanPoint.y)?.id,
            islands: islands.map(island => {
              const button = document.querySelector(`[data-world="${island.kind}"]`).getBoundingClientRect();
              return {
                kind: island.kind,
                center: island.center,
                shore: island.shore,
                shorePick: vbWorldScene.pick(rect.x + island.shore.x, rect.y + island.shore.y),
                shoreTarget: document.elementFromPoint(rect.x + island.shore.x, rect.y + island.shore.y)?.id,
                button: { x: button.x, y: button.y, right: button.right, bottom: button.bottom, width: button.width, height: button.height },
              };
            }),
          };
        });

        assert.equal(result.overflow, false, 'world requires scrolling');
        assert.deepEqual(result.islands.map(island => island.kind).sort(), KINDS);
        assert.ok(result.oceanPoint.x >= 0 && result.oceanPoint.x <= result.canvas.width, 'ocean test point is offscreen');
        assert.ok(result.oceanPoint.y >= 0 && result.oceanPoint.y <= result.canvas.height, 'ocean test point is offscreen');
        assert.equal(result.oceanPick, null, 'empty ocean raycast selected an activity');
        assert.equal(result.oceanTarget, 'worldCanvas', 'empty ocean point is covered by another control');
        for (const island of result.islands) {
          assert.equal(island.center.length, 3, `${island.kind} has no world center`);
          assert.ok(island.shore.x >= 0 && island.shore.x <= result.canvas.width, `${island.kind} shore is offscreen`);
          assert.ok(island.shore.y >= 0 && island.shore.y <= result.canvas.height, `${island.kind} shore is offscreen`);
          assert.equal(island.shorePick, island.kind, `${island.kind} scenery does not own its raycast`);
          assert.equal(island.shoreTarget, 'worldCanvas', `${island.kind} shore is covered by another control`);
          assert.ok(island.button.x >= 0 && island.button.y >= 0 && island.button.right <= width && island.button.bottom <= height,
            `${island.kind} activity target is clipped: ${JSON.stringify(island.button)}`);
          assert.ok(island.button.width >= 44 && island.button.height >= 44, `${island.kind} target is smaller than 44px`);
        }
        for (let i = 0; i < result.islands.length; i++) {
          for (let j = i + 1; j < result.islands.length; j++) {
            const a = result.islands[i], b = result.islands[j];
            const distance = Math.hypot(a.center[0] - b.center[0], a.center[2] - b.center[2]);
            assert.ok(distance >= 7, `${a.kind} and ${b.kind} have no visible water gap (${distance.toFixed(2)} world units)`);
          }
        }

        await page.evaluate(() => { window.testNav = []; window.goTo = path => testNav.push(path); });
        const emptyWater = await canvasPoint(result.oceanPoint);
        await page.mouse.click(emptyWater.x, emptyWater.y);
        assert.deepEqual(await page.evaluate(() => testNav), [], 'empty ocean tap navigated');
        assert.ok(page.url().endsWith('/home.html'));

        for (const kind of KINDS) {
          await open();
          await page.evaluate(() => { window.testNav = []; window.goTo = path => testNav.push(path); });
          const point = await shore(kind);
          await page.mouse.click(point.x, point.y);
          assert.deepEqual(await page.evaluate(() => testNav), [ROUTES[kind]], `${kind} scenery opened the wrong activity`);
        }
      });
    }

    await t.test('ocean animation pauses, resumes, follows page lifecycle, and freezes for reduced motion', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await open();
      const movingStart = await page.evaluate(() => vbWorldScene.snapshot().ocean);
      await page.waitForFunction(time => vbWorldScene.snapshot().ocean.time > time, movingStart.time);
      const movingEnd = await page.evaluate(() => vbWorldScene.snapshot().ocean);
      assert.ok(movingEnd.time > movingStart.time, 'ocean time did not advance');
      assert.notDeepEqual(movingEnd.boats, movingStart.boats, 'ocean scenery did not move');

      const paused = await page.evaluate(() => { vbWorldScene.pause(); return vbWorldScene.snapshot(); });
      await page.waitForTimeout(700);
      const stillPaused = await page.evaluate(() => vbWorldScene.snapshot());
      assert.equal(stillPaused.frames, paused.frames, 'renderer advanced while paused');
      assert.deepEqual(stillPaused.ocean, paused.ocean, 'ocean advanced while paused');
      await page.evaluate(() => vbWorldScene.resume());
      await page.waitForFunction(time => vbWorldScene.snapshot().ocean.time > time, paused.ocean.time);

      const hidden = await page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
        return vbWorldScene.snapshot();
      });
      await page.waitForTimeout(700);
      assert.deepEqual(await page.evaluate(() => vbWorldScene.snapshot().ocean), hidden.ocean, 'ocean advanced after pagehide');
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
      await page.waitForFunction(time => vbWorldScene.snapshot().ocean.time > time, hidden.ocean.time);

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => vbWorldScene.snapshot().reducedMotion);
      await page.waitForTimeout(100);
      const reduced = await page.evaluate(() => vbWorldScene.snapshot());
      await page.waitForTimeout(700);
      const stillReduced = await page.evaluate(() => vbWorldScene.snapshot());
      assert.equal(stillReduced.frames, reduced.frames, 'renderer advanced under reduced motion');
      assert.deepEqual(stillReduced.ocean, reduced.ocean, 'ocean animation advanced under reduced motion');
      await page.evaluate(() => vbWorldScene.pause());
    });

    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    if (browser) await browser.close();
    const ended = once(server, 'exit');
    server.kill();
    await ended;
  }
});
