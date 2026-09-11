import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ANIMALS = ['Rabbit', 'Cat', 'Panda'];
let server, browser, base;

before(async () => {
  const port = await new Promise(resolve => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const value = probe.address().port;
      probe.close(() => resolve(value));
    });
  });
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: root, env: { ...process.env, PORT:String(port) }, stdio:'ignore',
  });
  let ready = false;
  for (let i=0; i<60; i++) {
    try { if ((await fetch(base + '/__health.json')).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Hide and Seek test server did not start');
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.kill();
});

async function open(tier=5, { features={}, viewport={width:390,height:844}, fallback=false, slow=false }={}) {
  const ctx = await browser.newContext({ viewport, serviceWorkers:'block', reducedMotion:'reduce' });
  await ctx.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  if (slow) await ctx.route('**/hide-seek-scene.js', async route => {
    await new Promise(resolve => setTimeout(resolve, 4100));
    await route.continue();
  });
  if (fallback) await ctx.route('**/hide-seek-scene.js', route => route.abort());
  await ctx.addInitScript(({ tier, features }) => {
    const profile = {
      id:'seek-test', name:'Test Explorer', birthday:'2022-01-01', voice:'girl', mascot:{id:'bunny'},
      tierOverrides:{'peek-a-boo':tier}, features:{'peek-a-boo':features}, activitiesVisible:{}, youtube:[],
      achievements:{unlocked:{'peek-a-boo.first':{at:1}},counters:{},repeats:{},streak:{last:null,current:0,best:0},xp:0,rank:'sprout'},
    };
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    Math.random = () => 0.25;
  }, { tier, features });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/games/peek-a-boo.html', { waitUntil:'domcontentloaded' });
  await page.locator('#roundAction').waitFor();
  await page.evaluate(() => {
    window.seekAwards = [];
    window.vbProgress = { record:id => seekAwards.push(id) };
  });
  return { ctx, page, errors };
}

const phase = (page, value) => page.waitForFunction(expected => document.querySelector('#stage')?.dataset.phase === expected, value);
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

async function neutral(page) {
  await phase(page, 'watch');
  const result = await page.evaluate(() => ({
    friendVisible: !!document.querySelector('#friendIntro') && !document.querySelector('#friendIntro').hidden,
    friendInSpot: !!document.querySelector('.hiding-spot #friendIntro'),
    markers: document.querySelectorAll('.peek-marker').length,
    clues: document.querySelectorAll('.hiding-spot.clue-peek,.hiding-spot.clue-rustle,.hiding-spot.clue-glow,.hiding-spot.has-peek').length,
    fullAnimals: [...document.querySelectorAll('.hiding-spot .fallback-animal')].filter(element => element.textContent.trim()).length,
    answerClasses: [...document.querySelectorAll('.hiding-spot')].filter(element => /(^|\s)(guide|target|answer|clue-peek|clue-rustle|clue-glow|has-peek)(\s|$)/.test(element.className)).length,
    hint: document.querySelector('#hint').textContent,
    action: document.querySelector('#roundAction').textContent,
  }));
  assert.equal(result.friendVisible, true, 'neutral friend card is missing');
  assert.equal(result.friendInSpot, false, 'intro friend is attached to an answer bush');
  assert.equal(result.markers, 0, 'intro marks an answer bush');
  assert.equal(result.clues, 0, 'intro leaks a clue');
  assert.equal(result.fullAnimals, 0, 'intro places the full animal over an answer bush');
  assert.equal(result.answerClasses, 0, 'intro identifies an answer bush in its classes');
  assert.doesNotMatch(result.hint, /pink flower|yellow flower|blue flower/i, 'intro names the answer location');
  assert.match(result.action, new RegExp(`Find (${ANIMALS.join('|')})`, 'i'));
}

async function beginSeek(page) {
  await page.waitForFunction(() => document.querySelector('#roundAction').getAttribute('aria-disabled') === 'false');
  await page.evaluate(() => {
    const stage=document.querySelector('#stage');
    window.seekTransition=[];
    window.seekTransitionObserver=new MutationObserver(() => {
      if (stage.dataset.phase === 'hiding') {
        const element=document.querySelector('#hideCover'),style=getComputedStyle(element),r=element.getBoundingClientRect(),s=stage.getBoundingClientRect();
        window.seekTransition.push({
          phase:'hiding',visible:!element.hidden&&style.display!=='none'&&style.visibility!=='hidden',
          background:style.backgroundColor,covers:r.left<=s.left+1&&r.top<=s.top+1&&r.right>=s.right-1&&r.bottom>=s.bottom-1,
          clues:document.querySelectorAll('.hiding-spot.clue-peek,.hiding-spot.clue-rustle,.hiding-spot.clue-glow,.hiding-spot.has-peek,.peek-marker').length,
          enabled:document.querySelectorAll('.hiding-spot:not(:disabled)').length,
        });
      }
      if (stage.dataset.phase === 'seek') window.seekTransitionObserver.disconnect();
    });
    window.seekTransitionObserver.observe(stage,{attributes:true,attributeFilter:['data-phase']});
  });
  await page.locator('#roundAction').click();
  await phase(page, 'seek');
  const cover = await page.evaluate(() => window.seekTransition.find(entry=>entry.phase==='hiding'));
  assert.ok(cover,'hiding phase was skipped');
  assert.equal(cover.visible, true, 'opaque hiding cover is not visible');
  assert.equal(cover.background, 'rgb(223, 243, 238)', 'hiding cover is not opaque garden color');
  assert.equal(cover.covers, true, 'hiding cover does not cover the garden');
  assert.equal(cover.clues, 0, 'answer appears while hiding');
  assert.equal(cover.enabled, 0, 'a bush accepts answers while hiding');
  assert.equal(await page.locator('#hideCover').isVisible(), false);
}

async function clueSpot(page, kind) {
  const selector = kind ? `.hiding-spot.clue-${kind}` : '.hiding-spot.clue-peek,.hiding-spot.clue-rustle,.hiding-spot.clue-glow';
  await page.locator(selector).first().waitFor();
  assert.equal(await page.locator(selector).count(), 1, 'clue identifies more than one bush');
  return Number(await page.locator(selector).first().getAttribute('data-spot'));
}

async function physicalClick(page, locator) {
  const box = await locator.boundingBox();
  assert.ok(box, 'physical target is not visible');
  await page.mouse.click(box.x + box.width/2, box.y + box.height*.7);
}

test('neutral intro conceals the answer; hiding, retry, hint, found, and replay form one fair round', async () => {
  const { ctx, page, errors } = await open(6);
  try {
    await neutral(page);
    assert.equal(await page.locator('.hiding-spot').count(), 8);
    await page.locator('.hiding-spot').first().dispatchEvent('click');
    assert.equal(await page.locator('#stage').getAttribute('data-phase'), 'watch', 'intro bush click answered before seeking');
    assert.deepEqual(await page.evaluate(() => seekAwards), []);

    await beginSeek(page);
    assert.match(await page.locator('#showAgain').textContent(), /A little hint/i);
    const target = await clueSpot(page, 'rustle');
    const places = await page.locator('.hiding-spot').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label').split(' — ')[0]));
    const wrong = (target + 1) % places.length;
    await physicalClick(page, page.locator('.hiding-spot').nth(wrong));
    assert.equal(await page.locator('#stage').getAttribute('data-phase'), 'seek');
    assert.deepEqual(await page.evaluate(() => seekAwards), [], 'wrong bush earned progress');
    assert.equal(await page.locator('.hiding-spot').nth(wrong).isDisabled(), true, 'empty bush can be retried forever');
    assert.equal((await page.locator('.hiding-spot').nth(wrong).getAttribute('class')).includes('empty'), true);
    assert.equal(await clueSpot(page, 'peek'), target, 'wrong answer pointed at a different bush');
    assert.match(await page.locator('#hint').getAttribute('aria-label'), /look for|movement/i, 'wrong-answer clue lost accessible guidance');
    assert.equal(await page.locator('.hiding-spot .fallback-animal').evaluateAll(elements => elements.some(element => element.textContent.trim())), false,
      'hint reveals the full animal');

    const targetBox = await page.locator('.hiding-spot').nth(target).boundingBox();
    for (let i=0; i<10; i++) await page.mouse.click(targetBox.x + targetBox.width/2, targetBox.y + targetBox.height*.7);
    await phase(page, 'found');
    assert.deepEqual(await page.evaluate(() => seekAwards), ['peek-a-boo'], 'correct answer was not awarded exactly once');
    assert.equal(await page.locator('#seekCompanion').evaluate(host=>host.dataset.pose), 'found', 'found companion is not fully shown');
    await page.waitForFunction(() => document.querySelector('#playAgain').getAttribute('aria-disabled') === 'false');
    await physicalClick(page, page.locator('#playAgain'));
    await neutral(page);
    assert.deepEqual(await page.evaluate(() => seekAwards), ['peek-a-boo']);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('each age gets a fair automatic clue and A little hint sustains the same accessible peek', async t => {
  for (const config of [
    { tier:1, count:4, automatic:'glow', requested:'glow', mode:'sustained' },
    { tier:4, count:6, automatic:'peek', requested:'peek', mode:'sustained' },
    { tier:6, count:8, automatic:'rustle', requested:'peek', mode:'periodic' },
  ]) await t.test(`tier ${config.tier} ${config.mode} ${config.automatic}`, async () => {
    const { ctx, page, errors } = await open(config.tier);
    try {
      await neutral(page);
      assert.equal(await page.locator('.hiding-spot').count(), config.count);
      await beginSeek(page);
      const target = await clueSpot(page, config.automatic);
      if (config.mode === 'sustained') {
        await page.waitForTimeout(1300);
        assert.equal(await clueSpot(page, config.automatic), target, 'young-child visual clue disappeared');
      } else {
        await page.waitForFunction(({ target, automatic }) =>
          !document.querySelector(`.hiding-spot[data-spot="${target}"].clue-${automatic}`), { target, automatic:config.automatic });
        await page.waitForFunction(({ target, automatic }) =>
          !!document.querySelector(`.hiding-spot[data-spot="${target}"].clue-${automatic}`),
          { target, automatic:config.automatic }, { timeout:4500 });
      }
      await page.locator('#showAgain').click();
      assert.equal(await page.locator('#stage').getAttribute('data-phase'), 'seek', 'hint reset the round');
      assert.equal(await clueSpot(page, config.requested), target, 'hint changed the hiding place');
      assert.match(await page.locator('#hint').getAttribute('aria-label'), /look for|movement/i, 'hint is not accessible');
      await page.waitForTimeout(1300);
      assert.equal(await clueSpot(page, config.requested), target, 'requested hint was not sustained');
      assert.deepEqual(await page.evaluate(() => seekAwards), []);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
});

test('feature-based extra bushes and keyboard play work in the fallback garden on a short phone', async () => {
  const { ctx, page, errors } = await open(1, { features:{multiChoice:true}, fallback:true, viewport:{width:320,height:568} });
  try {
    await page.waitForFunction(() => document.querySelector('#stage').dataset.renderer === 'fallback');
    await neutral(page);
    assert.equal(await page.locator('.hiding-spot').count(), 8);
    await page.waitForFunction(() => document.querySelector('#roundAction').getAttribute('aria-disabled') === 'false');
    await page.locator('#roundAction').focus();
    await page.keyboard.press('Enter');
    await phase(page, 'hiding');
    await phase(page, 'seek');
    const target = await clueSpot(page, 'glow');
    await page.locator('.hiding-spot').nth(target).focus();
    await page.keyboard.press('Space');
    await phase(page, 'found');
    assert.deepEqual(await page.evaluate(() => seekAwards), ['peek-a-boo']);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'playAgain');
    await page.waitForFunction(() => document.querySelector('#playAgain').getAttribute('aria-disabled') === 'false');
    await page.keyboard.press('Enter');
    await neutral(page);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'roundAction');
    const fit = await page.evaluate(() => ({
      overflow:document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
      controls:[...document.querySelectorAll('.hiding-spot,#roundAction')].map(element => {
        const r=element.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};
      }), width:innerWidth, height:innerHeight,
    }));
    assert.equal(fit.overflow, false);
    for (const r of fit.controls) {
      assert.ok(r.width >= 44 && r.height >= 44, `short-phone target is too small: ${JSON.stringify(r)}`);
      assert.ok(r.left >= 0 && r.top >= 0 && r.right <= fit.width+1 && r.bottom <= fit.height+1, `short-phone target is clipped: ${JSON.stringify(r)}`);
    }
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('late WebGL upgrade preserves the active clue and physical answer', async () => {
  const { ctx, page, errors } = await open(6, { slow:true });
  try {
    await neutral(page);
    await beginSeek(page);
    const target = await clueSpot(page, 'rustle');
    await page.locator('#showAgain').click();
    assert.equal(await clueSpot(page, 'peek'), target);
    await page.waitForFunction(() => document.querySelector('#stage').dataset.renderer === 'fallback');
    assert.equal(await clueSpot(page, 'peek'), target, 'fallback changed the active clue');
    await page.waitForFunction(() => document.querySelector('#stage').dataset.renderer === 'webgl');
    assert.equal(await clueSpot(page, 'peek'), target, 'late renderer changed the active clue');
    await physicalClick(page, page.locator('.hiding-spot').nth(target));
    await phase(page, 'found');
    assert.deepEqual(await page.evaluate(() => seekAwards), ['peek-a-boo']);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('rapid hiding input and page restore cannot run a stale answer callback', async () => {
  const { ctx, page, errors } = await open(5);
  try {
    await neutral(page);
    await page.waitForFunction(() => document.querySelector('#roundAction').getAttribute('aria-disabled') === 'false');
    for (let i=0; i<8; i++) await page.locator('#roundAction').dispatchEvent('click');
    await phase(page, 'hiding');
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted:true })));
    await page.waitForTimeout(900);
    assert.equal(await page.locator('#stage').getAttribute('data-phase'), 'hiding', 'stale hiding callback ran after pagehide');
    assert.deepEqual(await page.evaluate(() => seekAwards), []);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted:true })));
    await neutral(page);
    await beginSeek(page);
    await page.locator('#showAgain').click();
    const target = await clueSpot(page, 'peek');
    const box = await page.locator('.hiding-spot').nth(target).boundingBox();
    for (let i=0; i<12; i++) await page.mouse.click(box.x+box.width/2, box.y+box.height*.7);
    await phase(page, 'found');
    assert.deepEqual(await page.evaluate(() => seekAwards), ['peek-a-boo']);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('landscape controls, hint, replay, grown-up gear, Back, and Home remain physically reachable', async () => {
  const { ctx, page, errors } = await open(6, { viewport:{width:844,height:390} });
  try {
    await neutral(page);
    await beginSeek(page);
    await page.locator('#showAgain').click();
    const target = await clueSpot(page, 'peek');
    for (const viewport of [{width:844,height:390},{width:568,height:320}]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(100);
      const fit = await page.evaluate(() => {
        const rect = element => { const r=element.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
        const selectors = { hint:'#hint', showAgain:'#showAgain', back:'.back-btn', home:'.home-btn', replay:'.vb-replay-instruction', gear:'#gameSettingsGear' };
        return {
          overflow:document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
          width:innerWidth,height:innerHeight,
          spots:[...document.querySelectorAll('.hiding-spot')].map(rect),
          controls:Object.fromEntries(Object.entries(selectors).map(([name,selector]) => [name,rect(document.querySelector(selector))])),
        };
      });
      assert.equal(fit.overflow, false);
      for (const [name,r] of [...Object.entries(fit.controls), ...fit.spots.map((r,index)=>[`spot${index}`,r])]) {
        assert.ok(r.width >= 44 && (name === 'hint' ? r.height > 0 : r.height >= 44),
          `${name} is too small at ${viewport.width}x${viewport.height}: ${JSON.stringify(r)}`);
        assert.ok(r.left >= 0 && r.top >= 0 && r.right <= fit.width+1 && r.bottom <= fit.height+1,
          `${name} is clipped at ${viewport.width}x${viewport.height}: ${JSON.stringify(r)}`);
      }
      const controls = Object.entries(fit.controls);
      for (let i=0; i<controls.length; i++) for (let j=i+1; j<controls.length; j++) {
        assert.equal(overlaps(controls[i][1],controls[j][1]), false,
          `${controls[i][0]} overlaps ${controls[j][0]} at ${viewport.width}x${viewport.height}`);
      }
    }
    await page.evaluate(() => { window.seekRoutes=[]; window.goTo=path=>seekRoutes.push(path); });
    await physicalClick(page, page.locator('.back-btn'));
    await physicalClick(page, page.locator('.home-btn'));
    assert.deepEqual(await page.evaluate(() => seekRoutes), ['index.html','../home.html']);
    await physicalClick(page, page.locator('.hiding-spot').nth(target));
    await phase(page, 'found');
    assert.deepEqual(await page.evaluate(() => seekAwards), ['peek-a-boo']);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
