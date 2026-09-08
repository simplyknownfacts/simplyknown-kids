// Regression coverage for Scott's reported rapid-input/audio failures.
// These checks drive the real pages in Chromium: no source-regex stand-ins.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* reported as skips below */ }
const NEEDS_BROWSER = chromium ? false :
  'playwright is not installed. Install it and these checks run: npm i playwright --no-save';

let server = null;
let browser = null;
let BASE = '';
const SYSTEM_BROWSER = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync);

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

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], {
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const giveUp = setTimeout(() => reject(new Error('scripts/serve.mjs did not start within 15s')), 15000);
    child.stdout.on('data', (data) => {
      if (String(data).includes('localhost:' + port)) {
        clearTimeout(giveUp);
        resolve(child);
      }
    });
    child.once('error', (error) => { clearTimeout(giveUp); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(giveUp);
      reject(new Error('scripts/serve.mjs exited early, code ' + code));
    });
  });
}

function profile(id, activity, tier) {
  return {
    id,
    name: 'Resilience',
    birthday: '2020-01-15',
    color: '#4ECDC4',
    voice: 'woman',
    mascot: { id: 'dog' },
    tierOverrides: { [activity]: tier },
    features: {},
    youtube: [],
  };
}

async function contextFor(p, options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...options });
  await ctx.addInitScript((seed) => {
    localStorage.setItem('vb_profiles', JSON.stringify([seed]));
    localStorage.setItem('vb_active_id', seed.id);
  }, p);
  return ctx;
}

before(async () => {
  if (!chromium) return;
  const port = await freePort();
  BASE = 'http://localhost:' + port;
  server = await startServer(port);
  browser = await chromium.launch(SYSTEM_BROWSER ? { executablePath: SYSTEM_BROWSER } : {});
});

after(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
});

test('essential speech survives feedback bursts, exposes replay, and cancels on pagehide',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await contextFor(profile('speech', 'count-along', 5));
    await ctx.addInitScript(() => {
      window.__audioEvents = [];
      window.__audioInstances = [];
      class FakeAudio {
        constructor() {
          this._src = '';
          this.preload = '';
          this.onended = null;
          this.onerror = null;
          window.__audioInstances.push(this);
        }
        set src(value) { this._src = value; window.__audioEvents.push(['src', value]); }
        get src() { return this._src; }
        play() { window.__audioEvents.push(['play', this._src]); return Promise.resolve(); }
        pause() { window.__audioEvents.push(['pause', this._src]); }
        removeAttribute(name) { if (name === 'src') this.src = ''; }
        load() {}
      }
      window.Audio = FakeAudio;
    });
    const page = await ctx.newPage();
    await page.goto(BASE + '/learning/count-along.html', { waitUntil: 'load' });

    const result = await page.evaluate(async () => {
      cancelSpeak();
      window.__audioEvents.length = 0;
      speakInstruction('How many sides?');
      await Promise.resolve();
      const instructionSrc = window.__audioInstances.at(-1).src;
      for (let i = 0; i < 20; i++) { speak('Try again!'); replayInstruction(); }
      await Promise.resolve();
      const afterBurstSrc = window.__audioInstances.at(-1).src;
      const sourcesBeforeHide = window.__audioEvents.filter((e) => e[0] === 'src' && e[1]);
      const replay = document.querySelector('.vb-replay-instruction');
      window.__audioInstances.at(-1).onended();
      await Promise.resolve();
      await Promise.resolve();
      speak('Try again!');
      await Promise.resolve();
      const feedbackAfterEndSrc = window.__audioInstances.at(-1).src;
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
      speakInstruction('How many sides?'); // stale callback after leaving must stay silent
      return {
        instructionSrc,
        afterBurstSrc,
        sourceCount: sourcesBeforeHide.length,
        replayText: replay && replay.textContent.trim(),
        replayLabel: replay && replay.getAttribute('aria-label'),
        feedbackAfterEndSrc,
        finalSrc: window.__audioInstances.at(-1).src,
      };
    });

    assert.ok(result.instructionSrc.includes('/audio/'), 'the essential instruction did not start a recorded clip');
    assert.equal(result.afterBurstSrc, result.instructionSrc, 'ordinary feedback replaced the essential instruction');
    assert.equal(result.sourceCount, 1, 'feedback burst created extra audio work instead of being coalesced/discarded');
    assert.match(result.replayText || '', /again/i, 'the instruction has no visible replay control');
    assert.match(result.replayLabel || '', /instruction/i, 'the replay control has no clear accessible name');
    assert.notEqual(result.feedbackAfterEndSrc, result.instructionSrc,
      'finishing the instruction left ordinary feedback permanently locked out');
    assert.equal(result.finalSrc, '', 'pagehide left stale speech loaded');
    await ctx.close();
  });

test('award bursts stay in one small corner notice without speech or focus theft',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await contextFor(profile('ribbon', 'count-along', 5), { reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(BASE + '/learning/count-along.html', { waitUntil: 'load' });

    const result = await page.evaluate(() => {
      const focusKeeper = document.createElement('button');
      focusKeeper.textContent = 'keep focus';
      document.body.appendChild(focusKeeper);
      focusKeeper.focus();
      let spoken = 0;
      window.speak = () => { spoken++; };
      vbCelebrate.show([{ id: 'one', type: 'milestone', tier: 'gold', title: 'Gold finder' }]);
      const first = document.querySelector('.vb-celebrate');
      vbCelebrate.show([{ id: 'two', type: 'mastery', title: 'Shape master' }]);
      const current = document.querySelector('.vb-celebrate');
      const rect = current.getBoundingClientRect();
      const replayRect = document.querySelector('.vb-replay-instruction').getBoundingClientRect();
      const navRect = document.querySelector('.nav-chrome').getBoundingClientRect();
      const controls = [...document.querySelectorAll('.num-btn')].map((el) => el.getBoundingClientRect());
      const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const title = current.textContent;
      const noticeCount = document.querySelectorAll('.vb-celebrate').length;
      current.click();
      vbCelebrate.show([{ id: 'three', type: 'first', title: 'Another ribbon' }]);
      return {
        sameNode: first === current,
        count: noticeCount,
        width: rect.width,
        height: rect.height,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        title,
        spoken,
        keptFocus: document.activeElement === focusKeeper,
        tabIndex: current.tabIndex,
        cooldownDelayed: !document.querySelector('.vb-celebrate'),
        overlapsReplay: overlaps(rect, replayRect),
        overlapsNav: overlaps(rect, navRect) || overlaps(replayRect, navRect),
        overlapsPlay: controls.some((control) => overlaps(rect, control) || overlaps(replayRect, control)),
      };
    });

    assert.equal(result.count, 1, 'award burst stacked more than one automatic notice');
    assert.equal(result.sameNode, true, 'a burst replaced the notice instead of batching into it');
    assert.ok(result.width <= 280 && result.height <= 190,
      `notice is too large for corner UI: ${result.width}x${result.height}`);
    assert.ok(result.width < result.viewportWidth && result.height < result.viewportHeight,
      'notice still fills the viewport');
    assert.match(result.title, /2 ribbons/i, 'batched notice does not report the combined burst');
    assert.equal(result.spoken, 0, 'award notification spoke over activity guidance');
    assert.equal(result.keptFocus, true, 'award notification stole focus');
    assert.equal(result.tabIndex, -1, 'automatic award notification entered the focus order');
    assert.equal(result.cooldownDelayed, true, 'a separate award ignored the notification cooldown');
    assert.equal(result.overlapsReplay, false, 'award notice overlaps the instruction replay control');
    assert.equal(result.overlapsNav, false, 'corner UI overlaps Back/Home navigation');
    assert.equal(result.overlapsPlay, false, 'corner UI covers an answer control');
    await ctx.close();
  });

test('Count Along accepts one correct answer once and clears its transition on pagehide',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await contextFor(profile('count', 'count-along', 5));
    const page = await ctx.newPage();
    await page.goto(BASE + '/learning/count-along.html', { waitUntil: 'load' });

    const immediate = await page.evaluate(() => {
      const calls = [];
      window.vbProgress = {
        record: (id) => calls.push(['record', id]),
        mastery: (id) => calls.push(['mastery', id]),
      };
      const answer = document.querySelectorAll('.dot.counted').length;
      const correct = [...document.querySelectorAll('.num-btn')]
        .find((el) => Number(el.textContent) === answer);
      for (let i = 0; i < 8; i++) correct.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const htmlAfterAnswer = document.getElementById('stage').innerHTML;
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
      speakInstruction('How many sides?'); // stale callback after leaving must stay silent
      return { calls, htmlAfterAnswer };
    });

    assert.deepEqual(immediate.calls, [
      ['record', 'count-along'],
      ['mastery', 'count-along.mastery'],
    ], 'one correct answer awarded more than once');
    await page.waitForTimeout(1750);
    assert.equal(await page.locator('#stage').evaluate((el) => el.innerHTML), immediate.htmlAfterAnswer,
      'a stale Count Along transition ran after pagehide');
    await ctx.close();
  });

test('Shape Match resolves a quiz once and only the owning pointer moves a drag',
  { skip: NEEDS_BROWSER }, async () => {
    const quizCtx = await contextFor(profile('shape-quiz', 'shape-match', 7));
    await quizCtx.addInitScript(() => {
      const values = [0.1, 0, 0.1, 0.9, 0.8, 0.2, 0.4, 0.2];
      let index = 0;
      let state = 123456;
      Math.random = () => {
        if (index < values.length) return values[index++];
        state = (state * 16807) % 2147483647;
        return (state - 1) / 2147483646;
      };
    });
    const quizPage = await quizCtx.newPage();
    await quizPage.goto(BASE + '/games/shape-match.html', { waitUntil: 'load' });
    await quizPage.waitForSelector('.num-choice');
    const calls = await quizPage.evaluate(() => {
      const out = [];
      window.vbProgress = {
        record: (id) => out.push(['record', id]),
        mastery: (id) => out.push(['mastery', id]),
      };
      const buttons = [...document.querySelectorAll('.num-choice')];
      let correct = null;
      for (const button of buttons) {
        button.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true }));
        if (out.some((entry) => entry[0] === 'record')) { correct = button; break; }
      }
      for (let i = 0; i < 7; i++) {
        correct.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true }));
      }
      return out;
    });
    assert.deepEqual(calls, [
      ['record', 'shape-match'],
      ['mastery', 'shape-match.mastery'],
    ], 'one Shape Match answer completed or awarded more than once');
    await quizCtx.close();

    const dragCtx = await contextFor(profile('shape-drag', 'shape-match', 3));
    const dragPage = await dragCtx.newPage();
    await dragPage.goto(BASE + '/games/shape-match.html', { waitUntil: 'load' });
    await dragPage.waitForSelector('#shapesRow > svg.shape');
    const drag = await dragPage.evaluate(() => {
      const source = document.querySelector('#shapesRow > svg.shape');
      const rect = source.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      source.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 11, pointerType: 'touch', clientX: x, clientY: y, bubbles: true,
      }));
      const afterDown = Number.parseFloat(source.style.left);
      window.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 22, pointerType: 'touch', clientX: x + 100, clientY: y + 20, bubbles: true,
      }));
      const afterOtherMove = Number.parseFloat(source.style.left);
      window.dispatchEvent(new PointerEvent('pointercancel', {
        pointerId: 22, pointerType: 'touch', clientX: x, clientY: y, bubbles: true,
      }));
      window.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 11, pointerType: 'touch', clientX: x + 40, clientY: y, bubbles: true,
      }));
      const afterOwnerMove = Number.parseFloat(source.style.left);
      window.dispatchEvent(new PointerEvent('pointercancel', {
        pointerId: 11, pointerType: 'touch', clientX: x + 40, clientY: y, bubbles: true,
      }));
      return {
        afterDown,
        afterOtherMove,
        afterOwnerMove,
        reset: source.style.position === '' && source.style.left === '' && source.style.top === '',
        matched: document.querySelectorAll('.target.matched').length,
      };
    });
    assert.equal(drag.afterOtherMove, drag.afterDown, 'a second pointer moved another pointer\'s shape');
    assert.equal(drag.afterOwnerMove, drag.afterDown + 40, 'the owning pointer stopped controlling its shape');
    assert.equal(drag.reset, true, 'pointer cancellation did not restore the source shape');
    assert.equal(drag.matched, 0, 'pointer cancellation completed a drop');
    await dragCtx.close();
  });


test('award dwell is bounded under a late burst and cooldown survives navigation',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await contextFor(profile('ribbon-travel', 'count-along', 5));
    const page = await ctx.newPage();
    await page.goto(BASE + '/learning/count-along.html');
    await page.evaluate(() => vbCelebrate.show([{id:'dwell-one',type:'milestone',title:'First'}]));
    await page.waitForTimeout(2100);
    await page.evaluate(() => vbCelebrate.show([{id:'dwell-two',type:'milestone',title:'Second'}]));
    await page.waitForTimeout(850);
    assert.equal(await page.locator('.vb-celebrate').count(), 0, 'late award extended the notice over play');
    await page.goto(BASE + '/games/index.html');
    await page.evaluate(() => vbCelebrate.show([{id:'travel',type:'milestone',title:'Travel'}]));
    assert.equal(await page.locator('.vb-celebrate').count(), 0, 'navigation reset the shared cooldown');
    await ctx.close();
  });


test('early age-gate redirects can cancel speech before activity startup',
  { skip: NEEDS_BROWSER }, async t => {
    for (const [activity, months] of [['math', 6], ['abcs', 96]]) {
      await t.test(activity, async () => {
        const seed = profile('guard-' + activity, activity, 5);
        const birthday = new Date(); birthday.setMonth(birthday.getMonth() - months);
        seed.birthday = birthday.toISOString().slice(0, 10);
        const ctx = await contextFor(seed, { serviceWorkers: 'block' });
        const page = await ctx.newPage(), errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await Promise.all([
          page.waitForURL('**/home.html'),
          page.goto(BASE + '/learning/' + activity + '.html').catch(e => {
            if (!e.message.includes('ERR_ABORTED')) throw e;
          }),
        ]);
        assert.match(page.url(), /home\.html$/);
        assert.deepEqual(errors, [], 'early navigation threw before it could enforce the age gate');
        await ctx.close();
      });
    }
  });
