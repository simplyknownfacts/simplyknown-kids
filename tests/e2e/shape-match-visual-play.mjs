// Shape Match visual and repeated-play audit at T1-T10 on desktop and phone.
// This intentionally covers only ledger dimensions still BLK after the accepted
// Games resilience run. It uses synthetic profiles, local media stubs and no
// external/provider traffic; screenshots require a separate visual inspection.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.join(import.meta.dirname, 'out', 'shape-match-visual-play');
const APP_BASELINE = '3683e2028044ba1812a1c44202725ffbb1858d5b';
const AUDIT_START = '77b84c1284c53617c93d0d6444480b3cd24c707f';
const ROUNDS = 9;
const VIEWPORTS = {
  desktop: { width: 1280, height: 900, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
};
const TIERS = [1,2,3,4,5,6,7,8,9,10];
const SELECTED_TIERS = process.env.TIERS ? process.env.TIERS.split(',').map(Number) : TIERS;
const SELECTED_VIEWPORTS = process.env.VIEWPORTS ? process.env.VIEWPORTS.split(',') : Object.keys(VIEWPORTS);
const pass = note => ({ status: 'PASS', note });
const fail = note => ({ status: 'FAIL', note });
const na = note => ({ status: 'NA', note });
const blk = note => ({ status: 'BLK', note });

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

async function freePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

async function health(base) {
  const response = await fetch(base + '/__health.json');
  if (!response.ok) throw new Error(`local server health failed: ${response.status}`);
  const body = await response.json();
  if (body.app !== 'kids') throw new Error(`wrong app health identity: ${JSON.stringify(body)}`);
}

function birthdayForTier(tier) {
  const months = { 1: 6, 2: 18, 3: 30, 4: 42, 5: 54, 6: 66, 7: 78, 8: 90, 9: 102, 10: 114 }[tier];
  const date = new Date();
  date.setDate(15);
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

function modePlan(tier) {
  if (tier < 7) return Array(ROUNDS + 2).fill(tier < 3 ? 'tap' : 'drag');
  if (tier === 7) return Array.from({ length: ROUNDS + 2 }, (_, index) => index % 2 ? 'drag' : 'sides');
  const cycle = ['sides', 'odd', 'drag'];
  return Array.from({ length: ROUNDS + 2 }, (_, index) => cycle[index % cycle.length]);
}

function initScript({ tier, birthday, plan }) {
  const profile = {
    id: `shape-visual-t${tier}`,
    name: `Shape Test ${tier}`,
    birthday,
    color: '#4ECDC4',
    voice: 'girl',
    mascot: { id: 'dog' },
    tierOverrides: { 'shape-match': tier },
    activitiesVisible: { 'shape-match': true },
    features: {},
    youtube: [],
    achievements: {
      unlocked: { 'shape-match.first': { at: 1 } },
      counters: { 'shape-match': 119 },
      repeats: {},
      streak: { last: null, current: 0, best: 0 },
      xp: 1,
      rank: 'sprout',
    },
  };
  if (!sessionStorage.getItem('__shape_visual_play_seeded')) {
    sessionStorage.clear();
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    localStorage.setItem('vb_pin', '1234');
    localStorage.removeItem('vb_pin_lockout');
    sessionStorage.setItem('__shape_visual_play_seeded', '1');
  }

  // No audible-media claim: keep the UI's real call path but make local playback
  // deterministic and silent for the automated run.
  try { HTMLMediaElement.prototype.play = () => Promise.resolve(); } catch {}
  try { if (speechSynthesis) speechSynthesis.speak = () => {}; } catch {}
  try { navigator.vibrate = () => true; } catch {}

  // Force each age-available round family through the game's own branch points.
  // Other random calls retain a deterministic LCG so shape selection still uses
  // the product's real rendering and interaction code.
  let state = 24681357 + tier;
  let plannedIndex = 0;
  let currentPlan = null;
  Math.random = () => {
    const stack = String(new Error().stack || '');
    const caller = stack.split('\n')[1] || '';
    if (caller.includes('shape-match.html:263:')) {
      currentPlan = plan[plannedIndex++] || 'drag';
      return currentPlan === 'sides' ? 0.1 : 0.9;
    }
    if (caller.includes('shape-match.html:264:')) return currentPlan === 'odd' ? 0.1 : 0.9;
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };

  // Track only Shape Match's own outstanding timers and temporary window drag
  // listeners. This does not alter their timing or behavior.
  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  const ownedTimers = new Set();
  window.setTimeout = (callback, delay, ...args) => {
    const stack = String(new Error().stack || '');
    const owned = /shape-match\.html:(101|185|212|249|295):/.test(stack);
    let handle;
    handle = nativeSetTimeout(() => {
      if (owned) ownedTimers.delete(handle);
      callback(...args);
    }, delay);
    if (owned) ownedTimers.add(handle);
    return handle;
  };
  window.clearTimeout = handle => {
    ownedTimers.delete(handle);
    return nativeClearTimeout(handle);
  };
  window.__auditShapeTimerCount = () => ownedTimers.size;

  const nativeAdd = EventTarget.prototype.addEventListener;
  const nativeRemove = EventTarget.prototype.removeEventListener;
  const tracked = { pointermove: new Set(), pointerup: new Set(), pointercancel: new Set() };
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (this === window && tracked[type] && String(new Error().stack || '').includes('shape-match.html:')) {
      tracked[type].add(listener);
    }
    return nativeAdd.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    if (this === window && tracked[type]) tracked[type].delete(listener);
    return nativeRemove.call(this, type, listener, options);
  };
  window.__auditShapeListenerCounts = () => Object.fromEntries(
    Object.entries(tracked).map(([key, listeners]) => [key, listeners.size]),
  );
}

async function detectMode(page) {
  if (await page.locator('.num-choice').count()) return 'sides';
  if (await page.locator('.target').count()) return 'drag';
  if (await page.locator('#shapesRow > .shapes-row svg.shape').count() === 4) return 'odd';
  return 'tap';
}

async function geometry(page) {
  return page.evaluate(() => {
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const rectOf = element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const play = [...document.querySelectorAll('#shapesRow svg.shape, .target, .num-choice')].filter(visible);
    const targets = [...document.querySelectorAll('.target')].filter(visible);
    const sources = [...document.querySelectorAll('#shapesRow > svg.shape')].filter(visible);
    const chrome = [...document.querySelectorAll('.back-btn, .home-btn, #settingsGear, .settings-gear')].filter(visible);
    const clipped = play.filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.left < -1 || rect.top < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1;
    }).length;
    let targetOverlap = 0;
    for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
      targetOverlap = Math.max(targetOverlap, overlap(rectOf(targets[i]), rectOf(targets[j])));
    }
    let sourceTargetOverlap = 0;
    for (const source of sources) for (const target of targets) {
      sourceTargetOverlap = Math.max(sourceTargetOverlap, overlap(rectOf(source), rectOf(target)));
    }
    let chromeOverlap = 0;
    for (const item of play) for (const control of chrome) {
      chromeOverlap = Math.max(chromeOverlap, overlap(rectOf(item), rectOf(control)));
    }
    const minimumTarget = play.length ? Math.min(...play.map(element => {
      const rect = element.getBoundingClientRect();
      return Math.min(rect.width, rect.height);
    })) : 0;
    const title = document.querySelector('.title');
    const hint = document.querySelector('#hint');
    return {
      mode: document.querySelector('.num-choice') ? 'sides' : document.querySelector('.target') ? 'drag'
        : document.querySelector('#shapesRow > .shapes-row') ? 'odd' : 'tap',
      playCount: play.length,
      clipped,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      targetOverlap,
      sourceTargetOverlap,
      chromeOverlap,
      minimumTarget,
      titleFont: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
      hintFont: hint ? parseFloat(getComputedStyle(hint).fontSize) : 0,
      titleVisible: !!title && visible(title),
      hintVisible: !!hint && visible(hint),
    };
  });
}

function geometryOk(result) {
  return result.playCount > 0 && result.clipped === 0 && result.horizontalOverflow <= 1
    && result.targetOverlap < 1 && result.sourceTargetOverlap < 1 && result.chromeOverlap < 1
    && result.minimumTarget >= 44 && result.titleVisible && result.hintVisible
    && result.titleFont >= 24 && result.hintFont >= 12;
}

async function drag(page, source, target) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('drag geometry unavailable');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
}

async function clickCenter(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('click geometry unavailable');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function saveShot(page, rowId, label, screenshots) {
  const dir = path.join(OUT, 'screenshots');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${rowId.replaceAll(':', '-')}-${label}.png`);
  await page.screenshot({ path: file, fullPage: false, animations: 'allow' });
  screenshots.push({ rowId, label, file });
}

async function waitNextRound(page, oldHandle) {
  await page.waitForFunction(node => !node.isConnected, oldHandle, { timeout: 3500 });
  await page.locator('#shapesRow .shape, .num-choice').first().waitFor({ timeout: 1500 });
}

async function progressSnapshot(page) {
  return page.evaluate(() => {
    const profile = JSON.parse(localStorage.getItem('vb_profiles') || '[]')[0] || {};
    const state = profile.achievements || {};
    return {
      counter: state.counters?.['shape-match'] || 0,
      repeat: state.repeats?.['shape-match'] || 0,
      bronze: !!state.unlocked?.['shape-match.milestone.bronze'],
      mastery: !!state.unlocked?.['shape-match.mastery'],
      recordCalls: window.__auditProgressCalls?.filter(call => call[0] === 'record').length || 0,
      masteryCalls: window.__auditProgressCalls?.filter(call => call[0] === 'mastery').length || 0,
    };
  });
}

async function playRound(page, rowId, mode, capture, screenshots) {
  const before = await progressSnapshot(page);
  const oldHandle = await page.locator('#shapesRow .shape, .num-choice').first().elementHandle();
  if (!oldHandle) throw new Error(`no round element in ${mode}`);
  let wrongRecovered = mode === 'tap';
  let expectedRecords = 1;

  if (mode === 'tap') {
    const shape = page.locator('#shapesRow > svg.shape').first();
    const box = await shape.boundingBox();
    if (!box) throw new Error('tap shape geometry unavailable');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const afterOne = await progressSnapshot(page);
    await shape.dispatchEvent('pointerdown', { pointerId: 55, pointerType: 'touch', bubbles: true });
    const afterDuplicate = await progressSnapshot(page);
    if (afterDuplicate.recordCalls !== afterOne.recordCalls) throw new Error('tap completion awarded twice');
  } else if (mode === 'sides') {
    const correctSides = await page.locator('#shapesRow > svg.shape').evaluate(svg => {
      const polygon = svg.querySelector('polygon');
      return polygon ? polygon.points.numberOfItems : svg.querySelector('rect') ? 4 : 0;
    });
    const buttons = page.locator('.num-choice');
    const labels = (await buttons.allTextContents()).map(Number);
    const wrongIndex = labels.findIndex(value => value !== correctSides);
    const correctIndex = labels.findIndex(value => value === correctSides);
    await clickCenter(page, buttons.nth(wrongIndex));
    wrongRecovered = await buttons.nth(wrongIndex).evaluate(button => button.classList.contains('bad'));
    if ((await progressSnapshot(page)).recordCalls !== before.recordCalls) throw new Error('wrong side count awarded progress');
    if (capture) await saveShot(page, rowId, `wrong-${mode}`, screenshots);
    await clickCenter(page, buttons.nth(correctIndex));
    const afterOne = await progressSnapshot(page);
    await buttons.nth(correctIndex).dispatchEvent('pointerdown', { pointerId: 56, pointerType: 'touch', bubbles: true });
    const afterDuplicate = await progressSnapshot(page);
    if (afterDuplicate.recordCalls !== afterOne.recordCalls) throw new Error('side-count completion awarded twice');
  } else if (mode === 'odd') {
    const items = page.locator('#shapesRow > .shapes-row svg.shape');
    const signatures = await items.evaluateAll(nodes => nodes.map(node => node.innerHTML));
    const counts = new Map(signatures.map(value => [value, signatures.filter(other => other === value).length]));
    const wrongIndex = signatures.findIndex(value => counts.get(value) > 1);
    const correctIndex = signatures.findIndex(value => counts.get(value) === 1);
    await clickCenter(page, items.nth(wrongIndex));
      wrongRecovered = await items.nth(wrongIndex).evaluate(item => item.style.opacity === '0.35');
    if ((await progressSnapshot(page)).recordCalls !== before.recordCalls) throw new Error('wrong odd-one-out choice awarded progress');
    if (capture) await saveShot(page, rowId, `wrong-${mode}`, screenshots);
    await clickCenter(page, items.nth(correctIndex));
    const afterOne = await progressSnapshot(page);
    await items.nth(correctIndex).dispatchEvent('pointerdown', { pointerId: 57, pointerType: 'touch', bubbles: true });
    const afterDuplicate = await progressSnapshot(page);
    if (afterDuplicate.recordCalls !== afterOne.recordCalls) throw new Error('odd-one-out completion awarded twice');
  } else if (mode === 'drag') {
    const sources = page.locator('#shapesRow > svg.shape[data-shape]');
    expectedRecords = await sources.count();
    const first = sources.first();
    const firstName = await first.getAttribute('data-shape');
    const wrongTarget = page.locator(`.target:not([data-shape="${firstName}"])`).first();
    await drag(page, first, wrongTarget);
    wrongRecovered = await first.isVisible() && await page.locator('.target.matched').count() === 0;
    if ((await progressSnapshot(page)).recordCalls !== before.recordCalls) throw new Error('wrong drag awarded progress');
    if (capture) await saveShot(page, rowId, `wrong-${mode}`, screenshots);
    const names = await sources.evaluateAll(nodes => nodes.map(node => node.dataset.shape));
    for (const name of names) {
      const source = page.locator(`#shapesRow > svg.shape[data-shape="${name}"]`);
      const target = page.locator(`.target[data-shape="${name}"]`);
      await drag(page, source, target);
      if (!await target.evaluate(element => element.classList.contains('matched'))) throw new Error(`correct ${name} drag did not match`);
    }
    const afterOne = await progressSnapshot(page);
    await page.locator('#shapesRow > svg.shape').first().dispatchEvent('pointerdown', {
      pointerId: 58, pointerType: 'touch', bubbles: true,
    });
    const afterDuplicate = await progressSnapshot(page);
    if (afterDuplicate.recordCalls !== afterOne.recordCalls) throw new Error('finished drag round awarded twice');
  } else {
    throw new Error(`unknown round mode ${mode}`);
  }

  const after = await progressSnapshot(page);
  if (after.recordCalls - before.recordCalls !== expectedRecords) {
    throw new Error(`${mode} recorded ${after.recordCalls - before.recordCalls}, expected ${expectedRecords}`);
  }
  if (capture) await saveShot(page, rowId, `success-${mode}`, screenshots);
  await waitNextRound(page, oldHandle);
  return { wrongRecovered, records: expectedRecords };
}

async function createContactSheet(browser, items, target, title) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const cards = items.map(item => {
    const data = readFileSync(item.file).toString('base64');
    return `<figure><img src="data:image/png;base64,${data}"><figcaption>${item.rowId} · ${item.label}</figcaption></figure>`;
  }).join('');
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:20px;background:#111827;color:#f9fafb;font:16px Arial,sans-serif}
    h1{font-size:26px;margin:0 0 18px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
    figure{margin:0;background:#1f2937;border:1px solid #4b5563;border-radius:10px;padding:8px}
    img{display:block;width:100%;height:230px;object-fit:contain;background:#05070d;border-radius:6px}
    figcaption{font-size:13px;margin-top:7px;overflow-wrap:anywhere}
  </style><h1>${title}</h1><div class="grid">${cards}</div>`, { waitUntil: 'load' });
  await page.screenshot({ path: target, fullPage: true });
  await context.close();
}

async function runCell(browser, base, viewportName, viewport, tier, allScreenshots) {
  await health(base);
  const rowId = `shape-match:T${tier}:${viewportName}`;
  const plan = modePlan(tier);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
    reducedMotion: 'no-preference',
    serviceWorkers: 'block',
  });
  let blockedExternal = 0;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) { blockedExternal++; return route.abort('blockedbyclient'); }
    return route.continue();
  });
  await context.addInitScript(initScript, { tier, birthday: birthdayForTier(tier), plan });
  const page = await context.newPage();
  const pageErrors = [];
  const failedLocalRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => {
    if (request.url().startsWith(base)) failedLocalRequests.push(`${request.url()} ${request.failure()?.errorText || ''}`);
  });
  const screenshots = [];
  const modesSeen = new Set();
  const wrongModes = new Set();
  const geometrySamples = [];
  let completedRounds = 0;
  let totalRecords = 0;
  let midPlayNotices = 0;
  let reward = null;
  let littleRewardDebug = null;
  let initialListenerCounts = null;
  let listenerCounts = null;
  let shapeTimers = null;
  let postRewardPlayable = false;
  let fatal = null;

  try {
    await page.goto(base + '/games/shape-match.html', { waitUntil: 'load', timeout: 20000 });
    await page.locator('#shapesRow .shape, .num-choice').first().waitFor({ timeout: 10000 });
    await page.evaluate(() => {
      window.__auditProgressCalls = [];
      const record = window.vbProgress.record;
      const mastery = window.vbProgress.mastery;
      window.vbProgress.record = (...args) => { window.__auditProgressCalls.push(['record', ...args]); return record.apply(window.vbProgress, args); };
      window.vbProgress.mastery = (...args) => { window.__auditProgressCalls.push(['mastery', ...args]); return mastery.apply(window.vbProgress, args); };
      const show = window.vbCelebrate.show;
      const glint = window.vbCelebrate.glint;
      window.vbCelebrate.show = defs => { window.__auditProgressCalls.push(['show', (defs || []).map(def => def.id)]); return show.call(window.vbCelebrate, defs); };
      window.vbCelebrate.glint = def => { window.__auditProgressCalls.push(['glint', def?.id]); return glint.call(window.vbCelebrate, def); };
    });
    initialListenerCounts = await page.evaluate(() => window.__auditShapeListenerCounts());
    await saveShot(page, rowId, 'initial', screenshots);

    for (let round = 0; round < ROUNDS; round++) {
      if (await page.locator('.vb-celebrate.in').isVisible().catch(() => false)) midPlayNotices++;
      const mode = await detectMode(page);
      modesSeen.add(mode);
      const sample = await geometry(page);
      geometrySamples.push(sample);
      if (!geometryOk(sample)) throw new Error(`bad ${mode} geometry: ${JSON.stringify(sample)}`);
      const result = await playRound(page, rowId, mode, !wrongModes.has(mode), screenshots);
      if (mode !== 'tap') wrongModes.add(mode);
      if (!result.wrongRecovered) throw new Error(`${mode} wrong action did not remain recoverable`);
      completedRounds++;
      totalRecords += result.records;
    }

    const expectedModes = new Set(tier < 7 ? [tier < 3 ? 'tap' : 'drag'] : tier === 7 ? ['sides', 'drag'] : ['sides', 'odd', 'drag']);
    for (const mode of expectedModes) if (!modesSeen.has(mode)) throw new Error(`planned mode not reached: ${mode}`);

    await page.waitForTimeout(300);
    listenerCounts = await page.evaluate(() => window.__auditShapeListenerCounts());
    shapeTimers = await page.evaluate(() => window.__auditShapeTimerCount());
    if (JSON.stringify(listenerCounts) !== JSON.stringify(initialListenerCounts)) {
      throw new Error(`temporary drag listeners changed: ${JSON.stringify(initialListenerCounts)} -> ${JSON.stringify(listenerCounts)}`);
    }
    if (shapeTimers !== 0) throw new Error(`Shape Match timer leak after stable round: ${shapeTimers}`);

    if (tier >= 3) {
      await page.locator('.vb-celebrate.in').waitFor({ timeout: 4000 });
      await page.waitForTimeout(350);
      reward = await page.locator('.vb-celebrate').evaluate(notice => {
        const r = notice.getBoundingClientRect();
        const visible = [...document.querySelectorAll('#shapesRow svg.shape, .target, .num-choice')].filter(element => {
          const s = getComputedStyle(element), b = element.getBoundingClientRect();
          return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0;
        });
        const overlap = visible.filter(element => {
          const b = element.getBoundingClientRect();
          return Math.min(r.right, b.right) > Math.max(r.left, b.left)
            && Math.min(r.bottom, b.bottom) > Math.max(r.top, b.top);
        }).length;
        return {
          title: notice.querySelector('.cele-title')?.textContent?.trim() || '',
          hint: notice.querySelector('.cele-hint')?.textContent?.trim() || '',
          inViewport: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
          playOverlap: overlap,
        };
      });
      await saveShot(page, rowId, 'reward', screenshots);
      const beforeDismiss = Date.now();
      await page.locator('.vb-celebrate').click();
      await page.locator('.vb-celebrate').waitFor({ state: 'detached', timeout: 500 });
      reward.dismissMs = Date.now() - beforeDismiss;
    } else {
      await page.waitForTimeout(2800);
      if (await page.locator('.vb-celebrate.in').isVisible().catch(() => false)) throw new Error('little-tier reward interrupted active play');
      const pendingBeforeBack = await page.evaluate(() => sessionStorage.getItem('vb_pending_celebration'));
      const progressBeforeBack = await progressSnapshot(page);
      const callsBeforeBack = await page.evaluate(() => window.__auditProgressCalls);
      await page.locator('.back-btn').click();
      await page.waitForURL(/\/games\/(index\.html)?$/);
      const appeared = await page.locator('.vb-celebrate.in').waitFor({ timeout: 2000 }).then(() => true).catch(() => false);
      littleRewardDebug = await page.evaluate(pendingBefore => ({
        pendingBefore,
        pendingAfter: sessionStorage.getItem('vb_pending_celebration'),
        lastShown: sessionStorage.getItem('vb_award_last_shown'),
        hasCelebrateApi: !!window.vbCelebrate,
        url: location.href,
      }), pendingBeforeBack);
      littleRewardDebug.progressBeforeBack = progressBeforeBack;
      littleRewardDebug.callsBeforeBack = callsBeforeBack;
      if (!appeared) throw new Error(`little-tier arrival reward missing: ${JSON.stringify(littleRewardDebug)}`);
      await page.waitForTimeout(350);
      reward = await page.locator('.vb-celebrate').evaluate(notice => ({
        title: notice.querySelector('.cele-title')?.textContent?.trim() || '',
        hint: notice.querySelector('.cele-hint')?.textContent?.trim() || '',
        inViewport: (() => { const r = notice.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; })(),
        playOverlap: 0,
      }));
      await saveShot(page, rowId, 'reward', screenshots);
      const beforeDismiss = Date.now();
      await page.locator('.vb-celebrate').click();
      await page.locator('.vb-celebrate').waitFor({ state: 'detached', timeout: 500 });
      reward.dismissMs = Date.now() - beforeDismiss;
      await page.goto(base + '/games/shape-match.html', { waitUntil: 'load' });
      await page.locator('#shapesRow .shape, .num-choice').first().waitFor();
      await page.evaluate(() => {
        window.__auditProgressCalls = [];
        const record = window.vbProgress.record;
        window.vbProgress.record = (...args) => { window.__auditProgressCalls.push(['record', ...args]); return record.apply(window.vbProgress, args); };
      });
    }

    if (!reward.title || reward.hint !== 'Saved in your gallery' || !reward.inViewport || reward.playOverlap || reward.dismissMs > 250) {
      throw new Error(`reward notice failed geometry/copy/dismissal: ${JSON.stringify(reward)}`);
    }

    const mode = await detectMode(page);
    const recovery = await playRound(page, rowId, mode, false, screenshots);
    totalRecords += recovery.records;
    postRewardPlayable = recovery.wrongRecovered;
    if (!postRewardPlayable) throw new Error('game did not recover after reward dismissal/navigation');

    const progress = await progressSnapshot(page);
    if (progress.counter !== 119 + totalRecords) throw new Error(`counter ${progress.counter}, expected ${119 + totalRecords}`);
    if (progress.repeat !== 1 || !progress.bronze) throw new Error(`reward state did not accumulate exactly once: ${JSON.stringify(progress)}`);
    if (tier >= 7 && !progress.mastery) throw new Error(`mastery reward missing at T${tier}`);
  } catch (error) {
    fatal = `${error.name}: ${error.message}`;
    try { await saveShot(page, rowId, 'failure', screenshots); } catch {}
  } finally {
    allScreenshots.push(...screenshots.map(item => ({ ...item, viewport: viewportName, tier })));
    await context.close();
  }

  const expectedWrong = tier >= 3;
  const rewardPass = !fatal && reward && reward.inViewport && reward.playOverlap === 0 && reward.dismissMs <= 250;
  const longPass = !fatal && completedRounds === ROUNDS && postRewardPlayable && midPlayNotices === 0
    && JSON.stringify(listenerCounts) === JSON.stringify(initialListenerCounts) && shapeTimers === 0;
  const checks = {
    score: na('Shape Match has no visible score or score-state mechanic; progress is tracked as matched shapes.'),
    rewards: rewardPass
      ? pass(`seeded 119→120 threshold produced one persisted repeat reward${tier >= 7 ? ' plus mastery' : ''}; notice stayed clear and dismissed in ${reward.dismissMs}ms`)
      : fail(fatal || 'reward path did not complete'),
    restart: na('Rounds auto-advance; this activity has no explicit restart control. Prior accepted reload recovery is not relabeled as restart.'),
    wrong_answers: expectedWrong
      ? (!fatal && wrongModes.size ? pass(`wrong action recovered in ${[...wrongModes].sort().join(', ')} mode(s) before correct completion`) : fail(fatal || 'wrong-action recovery missing'))
      : na('T1-T2 tap-to-name mode has no wrong-answer or loss state.'),
    long_repeated_play: longPass
      ? pass(`${ROUNDS} full rounds plus post-reward recovery; ${totalRecords} real UI progress actions; every available mode; no mid-play notice or timer/listener growth`)
      : fail(fatal || 'repeated play did not complete cleanly'),
    visual_quality: blk('Automated geometry passed; screenshots/contact sheets require visual inspection before ledger import.'),
  };
  return {
    id: rowId,
    activityId: 'shape-match',
    route: '/games/shape-match.html',
    tier,
    viewport: viewportName,
    checks,
    completedRounds,
    totalRecords,
    modesSeen: [...modesSeen].sort(),
    wrongModes: [...wrongModes].sort(),
    midPlayNotices,
    initialListenerCounts,
    listenerCounts,
    shapeTimers,
    reward,
    littleRewardDebug,
    blockedExternal,
    pageErrors,
    failedLocalRequests,
    geometrySamples,
    screenshotCount: screenshots.length,
    fatal,
  };
}

const ownedOutputRoot = path.join(ROOT, 'tests', 'e2e', 'out');
if (path.dirname(OUT) !== ownedOutputRoot || path.basename(OUT) !== 'shape-match-visual-play') {
  throw new Error(`refusing unsafe output cleanup: ${OUT}`);
}
rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, 'contact-sheets'), { recursive: true });
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
for (let attempt = 0; attempt < 100; attempt++) {
  try { await health(base); break; }
  catch { if (attempt === 99) throw new Error('local server did not start'); await new Promise(resolve => setTimeout(resolve, 100)); }
}

const browser = await chromium.launch();
const started = Date.now();
const jobs = [];
for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) if (SELECTED_VIEWPORTS.includes(viewportName)) for (const tier of SELECTED_TIERS) {
  jobs.push({ viewportName, viewport, tier });
}
const rows = [];
const screenshots = [];
try {
  async function worker() {
    while (jobs.length) {
      const job = jobs.shift();
      const row = await runCell(browser, base, job.viewportName, job.viewport, job.tier, screenshots);
      rows.push(row);
      console.log(`${row.fatal ? 'FAIL' : 'PASS'} ${row.id} rounds=${row.completedRounds} modes=${row.modesSeen.join(',')}${row.fatal ? ` ${row.fatal}` : ''}`);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));

  for (const viewportName of SELECTED_VIEWPORTS) {
    const overview = screenshots.filter(item => item.viewport === viewportName && ['initial', 'reward'].includes(item.label));
    const modes = screenshots.filter(item => item.viewport === viewportName && /^(wrong|success)-/.test(item.label));
    await createContactSheet(browser, overview,
      path.join(OUT, 'contact-sheets', `${viewportName}-overview.png`),
      `Shape Match ${viewportName} — T1-T10 opening and reward states`);
    await createContactSheet(browser, modes,
      path.join(OUT, 'contact-sheets', `${viewportName}-modes.png`),
      `Shape Match ${viewportName} — first wrong and completed state per available mode`);
  }
} finally {
  await browser.close();
  server.kill();
}

rows.sort((a, b) => a.id.localeCompare(b.id));
const counts = { rows: rows.length, pass: 0, fail: 0, na: 0, blk: 0 };
for (const row of rows) for (const result of Object.values(row.checks)) counts[result.status.toLowerCase()]++;
const report = {
  appBaseline: APP_BASELINE,
  auditStart: AUDIT_START,
  shapeMatchSha256: sha256(path.join(ROOT, 'games', 'shape-match.html')),
  base,
  generatedAt: new Date().toISOString(),
  durationSec: Math.round((Date.now() - started) / 1000),
  roundsPerRow: ROUNDS,
  mediaProof: 'Synthetic local playback stubs only; no audible or provider claim.',
  counts,
  contactSheets: ['desktop-overview.png', 'desktop-modes.png', 'phone-overview.png', 'phone-modes.png'],
  rows,
};
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...counts, screenshots: screenshots.length, durationSec: report.durationSec }));
if (rows.length !== SELECTED_TIERS.length * SELECTED_VIEWPORTS.length
  || counts.fail || rows.some(row => row.pageErrors.length || row.failedLocalRequests.length)) process.exitCode = 1;
