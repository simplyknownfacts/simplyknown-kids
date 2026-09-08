import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const child = { id: 'world-test', name: '<Explorer>', birthday: '2021-01-01', color: '#78b99b', voice: 'girl', mascot: { id: 'bunny', voice: 'girl' }, features: {}, activitiesVisible: {} };
async function freePort() {
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve)); return port;
}
test('world home supports visible, aligned house targets and personal companions', { timeout: 60000 }, async t => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.mjs')], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ['ignore','pipe','pipe'] });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('local world server did not start')), 12000);
      server.stdout.on('data', d => { if (String(d).includes('localhost:' + port)) { clearTimeout(timer); resolve(); } });
      server.once('error', e => { clearTimeout(timer); reject(e); });
      server.once('exit', () => { clearTimeout(timer); reject(new Error('local server exited')); });
    });
    browser = await chromium.launch();
    const context = await browser.newContext({ serviceWorkers: 'block' });
    // All test data is synthetic. Block optional external services/paid name routes.
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await context.addInitScript(p => { localStorage.setItem('vb_profiles', JSON.stringify([p])); localStorage.setItem('vb_active_id', p.id); }, child);
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    for (const [width,height] of [[390,844],[320,568],[768,1024],[756,1270],[1440,900],[844,390],[568,320]]) {
      await t.test(`${width}×${height}: houses fit and receive their own touch points`, async () => {
        await page.setViewportSize({width,height});
        await page.goto(`http://127.0.0.1:${port}/home.html`);
        await page.waitForSelector('.house svg');
        const result = await page.evaluate(() => {
          const houses = [...document.querySelectorAll('.house')];
          return { overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
            houses: houses.map(el => {
              const r = el.getBoundingClientRect();
              const points = [[.5,.5],[.15,.3],[.85,.7],[.5,.92]];
              return { world: el.dataset.world, box: {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height},
                hits: points.map(([x,y]) => document.elementFromPoint(r.x+r.width*x,r.y+r.height*y)?.closest('.house')?.dataset.world) };
            }) };
        });
        assert.equal(result.overflow, false);
        assert.equal(result.houses.length, 5);
        for (const h of result.houses) {
          assert.ok(h.box.x >= -1 && h.box.y >= 0 && h.box.right <= width+1 && h.box.bottom <= height, JSON.stringify(h));
          assert.ok(h.box.width >= 56 && h.box.height >= 56);
          assert.ok(h.hits.every(hit => hit === h.world), JSON.stringify(h));
        }
      });
    }
    await t.test('profile name is text, selected bunny is integrated, navigation acts once', async () => {
      await page.setViewportSize({width:390,height:844});
      await page.goto(`http://127.0.0.1:${port}/home.html`);
      assert.equal(await page.locator('#hiText').textContent(), 'Hello, <Explorer>!');
      assert.equal(await page.locator('#worldCompanion').getAttribute('data-animal'), 'bunny');
      assert.equal(await page.locator('#worldCompanion #mascotWrap').count(), 1);
      await page.waitForFunction(() => [...document.querySelectorAll('#mascotWrap video')].some(v => v.readyState >= 2 && v.currentSrc.includes('/bunny/')));
      // aria-disabled describes availability; an actual child tap can still
      // explain why the house is unavailable without navigating away.
      const hut = await page.locator('[data-world="listen"]').boundingBox();
      await page.mouse.click(hut.x + hut.width/2, hut.y + hut.height/2);
      assert.ok(page.url().endsWith('/home.html'));
      assert.match(await page.locator('#worldStatus').textContent(), /grown-up/);
      await page.evaluate(() => { window.testNav=[]; window.goTo = p => window.testNav.push(p); for(let n=0;n<30;n++) document.querySelector('[data-world="games"]').click(); });
      await page.waitForTimeout(300);
      assert.deepEqual(await page.evaluate(() => window.testNav), ['games/index.html']);
    });
    await t.test('reduced motion holds the companion and decorative clip still', async () => {
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.goto(`http://127.0.0.1:${port}/home.html`);
      await page.waitForFunction(() => [...document.querySelectorAll('#mascotWrap video')].some(v => v.readyState >= 2));
      const before = await page.locator('#worldCompanion').boundingBox();
      await page.waitForTimeout(650);
      assert.deepEqual(await page.locator('#worldCompanion').boundingBox(), before);
      assert.equal(await page.locator('#mascotWrap video').evaluateAll(vs => vs.every(v => v.paused)), true);
      assert.equal(await page.locator('.house-flag').evaluate(el => getComputedStyle(el).animationName), 'none');
    });
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    if (browser) await browser.close();
    const ended = once(server, 'exit'); server.kill(); await ended;
  }
});
