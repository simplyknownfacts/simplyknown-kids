// Real-browser regressions for round ownership under rapid input.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
let server;
let browser;
let base;

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
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 50; i++) {
    try {
      const response = await fetch(base + '/__health.json');
      if (response.ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
});

after(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
});

async function activityPage(id, tier, { random } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(({ id, tier, random }) => {
    localStorage.setItem('vb_profiles', JSON.stringify([{
      id: 'rapid-kid', name: 'Rapid', birthday: '2020-01-01', color: '#4ECDC4',
      voice: 'girl', mascot: { id: 'dog' }, tierOverrides: { [id]: tier },
      features: {}, activitiesVisible: {}, youtube: [],
    }]));
    localStorage.setItem('vb_active_id', 'rapid-kid');
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    if (random != null) Math.random = () => random;
  }, { id, tier, random });
  return { ctx, page: await ctx.newPage() };
}

test('Body Parts accepts the current target once and owns its prompt/transition timers', async () => {
  const { ctx, page } = await activityPage('body-parts', 4);
  await page.goto(base + '/learning/body-parts.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#figure .hit');

  const point = await page.evaluate(() => {
    window.bodyCalls = [];
    window.vbProgress = {record:id=>bodyCalls.push(['record',id]),mastery:id=>bodyCalls.push(['mastery',id])};
    const prompt = document.getElementById('hint').textContent;
    const names = [...document.querySelectorAll('#figure .hit')].map(el=>el.dataset.name);
    const plural = {eye:'eyes',ear:'ears',hand:'hands',foot:'feet',arm:'arms',leg:'legs'};
    const target = names.find(name=>prompt.toLowerCase().includes((plural[name]||name).toLowerCase()));
    const r = document.querySelector('#figure .hit[data-name="'+target+'"]').getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2};
  });
  // This check owns timing/once-only behavior; the visible-art suite supplies
  // independent picture coordinates for anatomical correctness.
  for(let i=0;i<8;i++) await page.mouse.click(point.x,point.y);
  const result = await page.evaluate(()=>{
    const html=document.getElementById('figure').innerHTML;
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    return {calls:bodyCalls,html};
  });
  assert.equal(result.calls.filter(([kind]) => kind === 'record').length, 1,
    'one Body Parts target recorded more than once');
  await page.waitForTimeout(2000);
  assert.equal(await page.locator('#figure').evaluate((el) => el.innerHTML), result.html,
    'Body Parts advanced after pagehide');
  await ctx.close();

  const delayed = await activityPage('body-parts', 4);
  await delayed.page.goto(base + '/learning/body-parts.html', { waitUntil: 'domcontentloaded' });
  const spoken = await delayed.page.evaluate(async () => {
    const calls = [];
    window.speakInstruction = (text) => calls.push(text);
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    await new Promise((resolve) => setTimeout(resolve, 500));
    return calls;
  });
  assert.deepEqual(spoken, [], 'Body Parts restarted a delayed instruction after pagehide');
  await delayed.ctx.close();
});

test('Peek-a-Boo reveals, awards, and advances once under repeated curtain taps', async () => {
  const { ctx, page } = await activityPage('peek-a-boo', 5);
  await page.goto(base + '/games/peek-a-boo.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.curtain');
  const result = await page.evaluate(() => {
    const calls = [];
    window.vbProgress = { record: (id) => calls.push(id) };
    let correct;
    for (const curtain of document.querySelectorAll('.curtain')) {
      curtain.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      if (calls.length) { correct = curtain; break; }
    }
    for (let i = 0; i < 7; i++) correct.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const html = document.getElementById('stage').innerHTML;
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    return { calls, html };
  });
  assert.deepEqual(result.calls, ['peek-a-boo'], 'one curtain reveal recorded more than once');
  await page.waitForTimeout(3500);
  assert.equal(await page.locator('#stage').evaluate((el) => el.innerHTML), result.html,
    'Peek-a-Boo advanced after pagehide');
  await ctx.close();
});

test('Tap-a-Tune blocks memory input while one replay is pending', async () => {
  const { ctx, page } = await activityPage('tap-a-tune', 7, { random: 0.01 });
  await page.goto(base + '/games/tap-a-tune.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#memBtn').click();
  await page.waitForFunction(() => document.getElementById('hint').textContent.includes('Your turn'));

  const result = await page.evaluate(async () => {
    const calls = [];
    window.vbProgress = { record: (id) => calls.push(id) };
    let watchCount = 0;
    const hint = document.getElementById('hint');
    const observer = new MutationObserver(() => {
      if (hint.textContent.includes('Watch the colors')) watchCount++;
    });
    observer.observe(hint, { childList: true, subtree: true });
    const pad = document.querySelector('.pad[data-i="0"]');
    const rect = pad.getBoundingClientRect();
    for (let i = 0; i < 8; i++) {
      pad.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: i + 1,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        bubbles: true,
      }));
    }
    await new Promise((resolve) => setTimeout(resolve, 1100));
    observer.disconnect();
    return { calls, watchCount };
  });
  assert.equal(result.calls.length, 2, 'input during the replay delay progressed hidden memory rounds');
  assert.equal(result.watchCount, 1, 'more than one memory playback started for one completed round');
  const cleanup = await page.evaluate(async () => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    await new Promise((resolve) => setTimeout(resolve, 500));
    return document.querySelectorAll('.pad.active, .pad.wrong').length;
  });
  assert.equal(cleanup, 0, 'memory playback left a pad active after pagehide');
  await ctx.close();
});
