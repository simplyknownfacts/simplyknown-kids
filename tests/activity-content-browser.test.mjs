import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const port = 8896;
const base = `http://127.0.0.1:${port}`;
let server;
let browser;

before(async () => {
  server = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(base + '/index.html');
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
});

after(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
});

async function activityPage(id, tier, features = {}, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
  await ctx.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await ctx.addInitScript(({ id, tier, features }) => {
    localStorage.setItem('vb_profiles', JSON.stringify([{
      id: 'content-kid', name: 'Test Kid', birthday: '2020-01-01', color: '#4ECDC4',
      voice: 'girl', mascot: { id: 'dog' }, tierOverrides: { [id]: tier },
      features: { [id]: features }, activitiesVisible: {}, youtube: [],
    }]));
    localStorage.setItem('vb_active_id', 'content-kid');
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  }, { id, tier, features });
  const page = await ctx.newPage();
  return { ctx, page };
}

test('changed activity behavior survives real pointer input', async (t) => {
  await t.test('Animal Sounds does not announce the answer before the quiz sound', async () => {
    const { ctx, page } = await activityPage('animal-sounds', 5, { quizMode: true });
    // Observe before the page's inline initialization. Instructions now start
    // immediately, so installing a spy after DOMContentLoaded misses the event.
    await page.route('**/js/app.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + `
        window.__contentInstructions = []; window.__contentSpeech = []; window.__playedSounds = [];
        window.speakInstruction = text => { window.__contentInstructions.push(text); return Promise.resolve(); };
        window.speak = text => window.__contentSpeech.push(text);
        HTMLMediaElement.prototype.play = function() { window.__playedSounds.push(this.src); return Promise.resolve(); };
      ` });
    });
    await page.goto(base + '/learning/animal-sounds.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2400);
    const heard = await page.evaluate(() => ({ instructions: window.__contentInstructions, speech: window.__contentSpeech, sounds: window.__playedSounds.filter(s => s.includes('/audio/sounds/')) }));
    assert.deepEqual(heard.instructions, ['Which animal makes this sound?']);
    assert.equal(heard.speech.some((s) => /^The .+ says,?$/.test(s)), false);
    assert.equal(heard.sounds.length, 1, 'the question must lead to one animal sound');
    await ctx.close();
  });

  await t.test('Surprise Pop keeps the silhouette after a wrong guess, then accepts the right guess', async () => {
    const { ctx, page } = await activityPage('surprise-pop', 5);
    await page.goto(base + '/games/surprise-pop.html', { waitUntil: 'domcontentloaded' });
    await page.locator('#egg').dispatchEvent('pointerdown', { pointerId: 1 });
    await page.locator('#choices .choice').first().waitFor();
    const answer = await page.locator('#surprise').textContent();
    const choices = page.locator('#choices .choice');
    const total = await choices.count();
    let wrong = null;
    for (let i = 0; i < total; i++) {
      if ((await choices.nth(i).textContent()) !== answer) { wrong = choices.nth(i); break; }
    }
    assert.ok(wrong);
    await wrong.dispatchEvent('pointerdown', { pointerId: 2 });
    assert.equal(await page.locator('#surprise').getAttribute('class'), 'shadow');
    assert.match(await page.locator('#sub').textContent(), /does not match the hidden shape/i);
    await page.locator('#choices .choice').filter({ hasText: answer }).dispatchEvent('pointerdown', { pointerId: 3 });
    assert.equal(await page.locator('#surprise').getAttribute('class'), '');
    assert.notEqual((await page.locator('#name').textContent()).trim(), '');
    await ctx.close();
  });

  await t.test('Surprise Pop shows and persists the promised collection for the youngest tier', async () => {
    const { ctx, page } = await activityPage('surprise-pop', 1);
    await page.goto(base + '/games/surprise-pop.html', { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#collection').isVisible(), true);
    assert.match(await page.locator('.col-title').textContent(), /my collection/i);
    assert.match(await page.locator('.col-count').textContent(), /0\s*\/\s*16/);
    assert.equal(await page.locator('.col-item').count(), 16);
    await page.locator('#egg').dispatchEvent('pointerdown', { pointerId: 4 });
    assert.equal(await page.locator('.col-item.got').count(), 1);
    assert.match(await page.locator('.col-count').textContent(), /1\s*\/\s*16/);
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('.col-item.got').count(), 1);
    await ctx.close();

    for (const viewport of [{ width: 320, height: 568 }, { width: 1280, height: 900 }]) {
      const sample = await activityPage('surprise-pop', 1, {}, viewport);
      await sample.page.goto(base + '/games/surprise-pop.html', { waitUntil: 'domcontentloaded' });
      const layout = await sample.page.evaluate(() => {
        const collection = document.querySelector('#collection').getBoundingClientRect();
        const blockers = [...document.querySelectorAll('.back-btn,.home-btn,#gameSettingsGear,.settings-gear,#egg,#hint')]
          .filter(element => { const style = getComputedStyle(element), box = element.getBoundingClientRect(); return style.display !== 'none' && box.width && box.height; })
          .map(element => { const box = element.getBoundingClientRect(); return { name:element.id || element.className,left:box.left,top:box.top,right:box.right,bottom:box.bottom }; });
        const overlaps = blockers.filter(box => Math.min(collection.right,box.right)>Math.max(collection.left,box.left)
          && Math.min(collection.bottom,box.bottom)>Math.max(collection.top,box.top)).map(box => box.name);
        return { clipped:collection.left < -1 || collection.top < -1 || collection.right > innerWidth + 1 || collection.bottom > innerHeight + 1, overlaps };
      });
      assert.equal(layout.clipped, false, `${viewport.width}x${viewport.height} collection is clipped`);
      assert.deepEqual(layout.overlaps, [], `${viewport.width}x${viewport.height} collection covers ${layout.overlaps}`);
      await sample.ctx.close();
    }
  });

  await t.test('Math records one result when the correct choice is mashed', async () => {
    const { ctx, page } = await activityPage('math', 4);
    await page.goto(base + '/learning/math.html', { waitUntil: 'domcontentloaded' });
    const answer = await page.evaluate(() => {
      const piles = [...document.querySelectorAll('.eq-row .pile')];
      return piles.reduce((sum, p) => sum + p.querySelectorAll('.item').length, 0);
    });
    const right = page.locator('.num-btn', { hasText: new RegExp(`^${answer}$`) });
    await right.evaluate((el) => {
      for (let i = 0; i < 6; i++) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: i + 1 }));
    });
    const count = await page.evaluate(() => vbProgress.getState().counters.math || 0);
    assert.equal(count, 1);
    await ctx.close();
  });
});
