import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const VIEWPORTS = [[1111,1272],[390,844],[320,568],[568,320]];

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

test('Bubble Pop HUD keeps navigation, instructions, score, and playfield separate', { timeout: 120000 }, async t => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.mjs')], {
    cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ['ignore','pipe','pipe'],
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('local Bubble Pop server did not start')), 12000);
      server.stdout.on('data', data => {
        if (String(data).includes('localhost:' + port)) { clearTimeout(timer); resolve(); }
      });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', () => { clearTimeout(timer); reject(new Error('local Bubble Pop server exited')); });
    });
    browser = await chromium.launch();
    const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    const errors = [];

    async function open(tier, viewport, controlledFrames = false) {
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width: viewport[0], height: viewport[1] });
      await page.addInitScript(({ tier, controlledFrames }) => {
        const profile = {
          id: `bubble-tier-${tier}`, name: 'Bubble Tester', birthday: '2021-01-01', color: '#78b99b', voice: 'girl',
          mascot: { id: 'bunny', voice: 'girl' }, tierOverrides: { 'tap-pop': tier }, features: {}, activitiesVisible: {},
          achievements: { unlocked: { 'tap-pop.first': { at: 1 } }, counters: {}, repeats: {},
            streak: { last: null, current: 0, best: 0 }, xp: 0, rank: 'sprout' },
        };
        localStorage.setItem('vb_profiles', JSON.stringify([profile]));
        localStorage.setItem('vb_active_id', profile.id);
        window.__audioPlays = [];
        window.Audio = class {
          constructor() { this.currentTime = 0; this.src = ''; }
          play() {
            window.__audioPlays.push(this.src);
            queueMicrotask(() => this.onended?.());
            return Promise.resolve();
          }
          pause() {}
          load() {}
          removeAttribute(name) { if (name === 'src') this.src = ''; }
        };
        if (!controlledFrames) return;
        let randomState = 0x6d2b79f5;
        Math.random = () => {
          randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
          return randomState / 0x100000000;
        };
        let nextId = 0;
        const queue = [];
        window.requestAnimationFrame = callback => {
          const id = ++nextId;
          queue.push({ id, callback });
          return id;
        };
        window.cancelAnimationFrame = id => {
          const index = queue.findIndex(item => item.id === id);
          if (index >= 0) queue.splice(index, 1);
        };
        window.__runFrame = () => {
          const pending = queue.splice(0);
          pending.forEach(item => item.callback(performance.now()));
        };
        const nativeArc = CanvasRenderingContext2D.prototype.arc;
        window.__bubbleArcs = [];
        CanvasRenderingContext2D.prototype.arc = function(x, y, radius, ...rest) {
          if (radius >= 35) window.__bubbleArcs.push({ x, y, radius });
          return nativeArc.call(this, x, y, radius, ...rest);
        };
      }, { tier, controlledFrames });
      await page.goto(`http://127.0.0.1:${port}/games/tap-pop.html`);
      await page.waitForSelector('.nav-chrome');
      await page.waitForSelector('#score', { state: 'visible' });
      return page;
    }

    const layoutPage = await open(6, VIEWPORTS[0]);
    for (const [width,height] of VIEWPORTS) {
      await t.test(`${width}×${height}: expanded challenge HUD does not cover another control or the canvas`, async () => {
        await layoutPage.setViewportSize({ width, height });
        await layoutPage.locator('#scoreVal').evaluate(element => { element.textContent = '999999'; });
        await layoutPage.locator('#combo').evaluate(element => { element.textContent = '  🔥 x999'; });
        await layoutPage.locator('#targetName').evaluate(element => { element.textContent = 'Purple'; });
        const result = await layoutPage.evaluate(() => {
          const visibleRect = selector => {
            const element = document.querySelector(selector);
            if (!element || getComputedStyle(element).display === 'none') return null;
            const r = element.getBoundingClientRect();
            return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height };
          };
          const hud = document.getElementById('bubbleHud');
          return {
            overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
            parentIds: { target: document.getElementById('target').parentElement?.id, score: document.getElementById('score').parentElement?.id },
            rects: {
              navigation: visibleRect('.nav-chrome'), replay: visibleRect('.vb-replay-instruction'),
              target: visibleRect('#target'), score: visibleRect('#score'), hud: visibleRect('#bubbleHud'), canvas: visibleRect('#canvas'),
            },
            canvasSize: { width: document.getElementById('canvas').width, height: document.getElementById('canvas').height },
            hudExists: !!hud,
          };
        });
        assert.equal(result.overflow, false, 'Bubble Pop scrolls instead of fitting');
        const controls = ['navigation','replay','target','score'];
        for (let i = 0; i < controls.length; i++) {
          const a = controls[i];
          assert.ok(result.rects[a], `${a} is not visible`);
          const r = result.rects[a];
          assert.ok(r.left >= 0 && r.top >= 0 && r.right <= width && r.bottom <= height, `${a} is clipped: ${JSON.stringify(r)}`);
          for (let j = i + 1; j < controls.length; j++) {
            const b = controls[j];
            assert.equal(overlaps(r, result.rects[b]), false, `${a} overlaps ${b}: ${JSON.stringify({[a]:r,[b]:result.rects[b]})}`);
          }
        }
        await layoutPage.waitForFunction(() => {
          const canvas = document.getElementById('canvas'), hud = document.getElementById('bubbleHud');
          if (!hud) return false;
          const canvasRect = canvas.getBoundingClientRect(), hudRect = hud.getBoundingClientRect();
          return canvasRect.top >= hudRect.bottom &&
            canvas.width === Math.round(canvasRect.width) && canvas.height === Math.round(canvasRect.height);
        });
        const playfield = await layoutPage.evaluate(() => {
          const canvas = document.getElementById('canvas'), r = canvas.getBoundingClientRect();
          return {
            rect: { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height },
            size: { width:canvas.width, height:canvas.height },
          };
        });
        assert.equal(result.hudExists, true, 'dedicated Bubble Pop HUD is missing');
        assert.equal(result.parentIds.target, 'bubbleHud');
        assert.equal(result.parentIds.score, 'bubbleHud');
        assert.ok(result.rects.hud.top >= Math.max(result.rects.navigation.bottom, result.rects.replay.bottom), 'HUD is not below top controls');
        assert.ok(playfield.rect.top >= result.rects.hud.bottom, 'bubble canvas begins behind the HUD');
        assert.ok(playfield.rect.bottom <= height, 'bubble canvas extends below the viewport');
        assert.equal(playfield.size.width, Math.round(playfield.rect.width), 'canvas drawing width does not match its visible width');
        assert.equal(playfield.size.height, Math.round(playfield.rect.height), 'canvas drawing height does not match its visible height');
      });
    }

    await t.test('tier 6 replay repeats one unchanged instruction; Back and Home remain physically reachable', async () => {
      await layoutPage.setViewportSize({ width: 390, height: 844 });
      await layoutPage.waitForFunction(() => window.__audioPlays.length >= 1);
      await layoutPage.waitForTimeout(25);
      const before = await layoutPage.evaluate(() => {
        document.getElementById('scoreVal').textContent = '37';
        document.getElementById('combo').textContent = '  🔥 x4';
        return {
          plays: [...window.__audioPlays], score: document.getElementById('score').textContent,
          instruction: document.querySelector('.vb-caption')?.textContent,
        };
      });
      const replay = await layoutPage.locator('.vb-replay-instruction').boundingBox();
      assert.ok(replay);
      await layoutPage.mouse.click(replay.x + replay.width / 2, replay.y + replay.height / 2);
      await layoutPage.waitForFunction(count => window.__audioPlays.length === count + 1, before.plays.length);
      const after = await layoutPage.evaluate(() => ({
        plays: [...window.__audioPlays], score: document.getElementById('score').textContent,
        instruction: document.querySelector('.vb-caption')?.textContent,
      }));
      assert.equal(after.plays.length, before.plays.length + 1, 'Again started more than one instruction');
      assert.equal(after.plays.at(-1), before.plays.at(-1), 'Again played a different instruction');
      assert.equal(after.instruction, before.instruction);
      assert.equal(after.score, before.score, 'Again changed the score/combo');

      await layoutPage.evaluate(() => { window.__nav = []; window.goTo = path => __nav.push(path); });
      for (const selector of ['.back-btn','.home-btn']) {
        const box = await layoutPage.locator(selector).boundingBox();
        assert.ok(box);
        const topmost = await layoutPage.evaluate(({x,y,selector}) => document.elementFromPoint(x,y)?.closest(selector)?.matches(selector),
          { x:box.x+box.width/2, y:box.y+box.height/2, selector });
        assert.equal(topmost, true, `${selector} is covered`);
        await layoutPage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
      assert.deepEqual(await layoutPage.evaluate(() => __nav), ['index.html','../home.html']);
    });
    await layoutPage.close();

    await t.test('a Bubble Pop ribbon stays clear of navigation, replay, target, and score', async () => {
      const page = await open(6, [320,568]);
      await page.evaluate(() => vbCelebrate.show([{ id:'bubble-hud-ribbon', type:'milestone', tier:'gold', title:'Bubble ribbon' }]));
      await page.locator('.vb-celebrate').waitFor({ state: 'visible' });
      const result = await page.evaluate(() => {
        const rect = selector => {
          const element = document.querySelector(selector), r = element.getBoundingClientRect();
          return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height,
            visible:getComputedStyle(element).display !== 'none' && r.width > 0 && r.height > 0 };
        };
        return {
          toast:rect('.vb-celebrate'), navigation:rect('.nav-chrome'), replay:rect('.vb-replay-instruction'),
          target:rect('#target'), score:rect('#score'), width:innerWidth, height:innerHeight,
        };
      });
      assert.equal(result.toast.visible, true);
      assert.ok(result.toast.left >= 0 && result.toast.top >= 0 && result.toast.right <= result.width && result.toast.bottom <= result.height,
        `ribbon is clipped: ${JSON.stringify(result.toast)}`);
      for (const name of ['navigation','replay','target','score']) {
        assert.equal(result[name].visible, true, `${name} disappeared when a ribbon opened`);
        assert.equal(overlaps(result.toast, result[name]), false, `ribbon overlaps ${name}: ${JSON.stringify({toast:result.toast,[name]:result[name]})}`);
      }
      await page.close();
    });

    await t.test('younger Bubble Pop has score only, without a target or instruction replay', async () => {
      const page = await open(2, [320,568]);
      assert.equal(await page.locator('#target').isVisible(), false);
      assert.equal(await page.locator('.vb-replay-instruction').count(), 0);
      assert.equal(await page.locator('#score').isVisible(), true);
      assert.equal(await page.locator('#score').evaluate(element => element.parentElement?.id), 'bubbleHud');
      const positions = await page.evaluate(() => {
        const hud = document.getElementById('bubbleHud').getBoundingClientRect();
        const canvas = document.getElementById('canvas').getBoundingClientRect();
        return { hudBottom:hud.bottom, canvasTop:canvas.top };
      });
      assert.ok(positions.canvasTop >= positions.hudBottom);
      assert.deepEqual(await page.evaluate(() => window.__audioPlays), []);
      await page.close();
    });

    await t.test('physical bubble tap still scores at canvas-local coordinates below the HUD', async () => {
      const page = await open(6, [390,844], true);
      const bubble = await page.evaluate(() => {
        const canvas = document.getElementById('canvas');
        for (let frame = 0; frame < 140; frame++) {
          window.__bubbleArcs.length = 0;
          window.__runFrame();
          const found = window.__bubbleArcs.find(arc => arc.radius >= 50 && arc.y >= arc.radius && arc.y <= canvas.height - arc.radius);
          if (found) return found;
        }
        return null;
      });
      assert.ok(bubble, 'controlled renderer did not expose a visible bubble');
      const geometry = await page.evaluate(() => {
        const canvas = document.getElementById('canvas'), r = canvas.getBoundingClientRect();
        const hud = document.getElementById('bubbleHud').getBoundingClientRect();
        return { rect:{left:r.left,top:r.top,width:r.width,height:r.height}, width:canvas.width, height:canvas.height, hudBottom:hud.bottom };
      });
      const x = geometry.rect.left + bubble.x * geometry.rect.width / geometry.width;
      const y = geometry.rect.top + bubble.y * geometry.rect.height / geometry.height;
      assert.ok(y > geometry.hudBottom, 'observed bubble is behind the HUD');
      assert.equal(await page.locator('#scoreVal').textContent(), '0');
      await page.mouse.click(x, y);
      assert.equal(await page.locator('#scoreVal').textContent(), '1');
      await page.close();
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
