// Days T1-T10 phone/desktop repeated-play and visual audit.
// Browser-driven pointer/touch emulation and silent media stubs do not prove a
// child's physical touch or the human-audible quality of prerecorded clips.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(import.meta.dirname, 'out', 'days-visual-play');
const AUDIT_START = '888bed870999f655f8bd87baf497daffca2af5b4';
const VIEWPORTS = {
  desktop: { width: 1280, height: 900, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
};
const PROBE_VIEWPORTS = {
  'short-phone': { width: 320, height: 568, isMobile: true, hasTouch: true },
  tablet: { width: 820, height: 1180, isMobile: true, hasTouch: true },
};
const TIERS = [1,2,3,4,5,6,7,8,9,10];
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');

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
  const body = await response.json();
  if (!response.ok || body.app !== 'kids') throw new Error('wrong local app');
}

function birthday(tier) {
  const months = {1:6,2:18,3:30,4:42,5:54,6:66,7:78,8:90,9:102,10:114};
  const date = new Date();
  date.setDate(15);
  date.setMonth(date.getMonth() - months[tier]);
  return date.toISOString().slice(0, 10);
}

function init({ tier, bday, feature = false, counter = 119 }) {
  const profile = {
    id: `days-t${tier}`,
    name: 'Days Test',
    birthday: bday,
    color: '#4ECDC4',
    voice: 'girl',
    mascot: { id: 'dog' },
    tierOverrides: { days: tier },
    activitiesVisible: { days: true },
    features: { days: { quizMode: feature } },
    achievements: {
      unlocked: {
        'days.first': { at: 1 },
        'days.milestone.bronze': { at: 1 },
        'days.milestone.silver': { at: 1 },
        'days.mastery': { at: 1 },
      },
      counters: { days: counter },
      repeats: {},
      streak: { last: null, current: 0, best: 0 },
      xp: 4,
      rank: 'sprout',
    },
  };
  if (!sessionStorage.__daysSeed) {
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    localStorage.setItem('vb_pin', '1234');
    sessionStorage.__daysSeed = '1';
  }
  let state = (0x9e3779b9 + tier * 991) >>> 0;
  const seeded = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000);
  window.__daysRandom = tier >= 6 ? [0, 0.25] : [0.1, 0.25];
  Math.random = () => {
    const stack = String(new Error().stack || '');
    if ((stack.includes('nextRound') || stack.includes('renderMonthRound')) && window.__daysRandom.length) return window.__daysRandom.shift();
    return seeded();
  };
  window.__silentMediaPlays = 0;
  try { HTMLMediaElement.prototype.play = function () { window.__silentMediaPlays++; return Promise.resolve(); }; } catch {}
  try { navigator.vibrate = () => true; } catch {}
}

async function saveShot(page, rowId, label, screenshots) {
  const directory = path.join(OUT, 'screenshots');
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${rowId.replaceAll(':', '-')}-${String(screenshots.length + 1).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: file });
  screenshots.push({ rowId, label, file });
}

async function state(page) {
  return page.evaluate(() => {
    const profile = JSON.parse(localStorage.vb_profiles || '[]')[0] || {};
    return {
      counter: profile.achievements?.counters?.days || 0,
      repeat: profile.achievements?.repeats?.days || 0,
      mastery: !!profile.achievements?.unlocked?.['days.mastery'],
      feature: !!profile.features?.days?.quizMode,
    };
  });
}

async function mode(page) {
  const prompt = (await page.locator('#hint').innerText()).trim();
  if (/Tap a day/i.test(prompt)) return { type: 'explore', prompt };
  if (/What month comes after/i.test(prompt)) return { type: 'month', prompt };
  if (/What day comes after/i.test(prompt)) return { type: 'day-after', prompt };
  if (/What was the day before/i.test(prompt)) return { type: 'day-before', prompt };
  throw new Error(`unknown Days prompt: ${prompt}`);
}

async function geometry(page) {
  await page.waitForTimeout(150);
  const tiles = page.locator('.day-tile');
  const boxes = [];
  for (let index = 0; index < await tiles.count(); index++) {
    await tiles.nth(index).scrollIntoViewIfNeeded();
    const box = await tiles.nth(index).boundingBox();
    if (box) boxes.push({ left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height, width: box.width, height: box.height });
  }
  await page.locator('#stage').evaluate(element => { element.scrollTop = 0; });
  return page.evaluate(targets => {
    const rect = selector => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return { left:value.left, top:value.top, right:value.right, bottom:value.bottom, width:value.width, height:value.height };
    };
    const nav = [...document.querySelectorAll('.back-btn,.home-btn,#gameSettingsGear,.settings-gear')].map(element => {
      const value = element.getBoundingClientRect();
      return { left:value.left, top:value.top, right:value.right, bottom:value.bottom, width:value.width, height:value.height };
    });
    const title = rect('.title');
    const hint = rect('#hint');
    const overlap = (a, b) => !!a && !!b && Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
    return {
      tileCount: targets.length,
      minTarget: targets.length ? Math.min(...targets.map(box => Math.min(box.width, box.height))) : null,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      clippedTargets: targets.filter(box => box.left < -1 || box.right > innerWidth + 1).length,
      minNavTarget: nav.length ? Math.min(...nav.map(box => Math.min(box.width, box.height))) : null,
      navClipped: nav.filter(box => box.left < -1 || box.top < -1 || box.right > innerWidth + 1 || box.bottom > innerHeight + 1).length,
      navTitleOverlap: nav.filter(box => overlap(box, title)).length,
      navHintOverlap: nav.filter(box => overlap(box, hint)).length,
      scrollHeight: document.querySelector('#stage')?.scrollHeight || 0,
      clientHeight: document.querySelector('#stage')?.clientHeight || 0,
    };
  }, boxes);
}

async function enableQuizThroughSettings(page) {
  const gear = page.locator('#gameSettingsGear');
  await gear.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 });
  await page.locator('#gameSettingsOverlay').waitFor({ timeout: 2000 });
  await gear.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 0 });
  for (const digit of ['1','2','3','4']) await page.locator(`.gs-key[data-k="${digit}"]`).click();
  const checkbox = page.locator('input[data-fk="quizMode"]');
  await checkbox.waitFor({ timeout: 1500 });
  if (!await checkbox.isChecked()) await checkbox.check();
  await page.locator('#gsClose').click();
  await page.waitForLoadState('load');
  return (await state(page)).feature && (await mode(page)).type !== 'explore';
}

function nextPlan(tier, index) {
  if (tier >= 6) {
    const plans = [
      { expected: 'month', values: [0, 0.25] },
      { expected: 'day-after', values: [0.99, 0.1, 0.25] },
      { expected: 'day-before', values: [0.99, 0.9, 0.25] },
    ];
    return plans[index % plans.length];
  }
  return index % 2
    ? { expected: 'day-before', values: [0.9, 0.25] }
    : { expected: 'day-after', values: [0.1, 0.25] };
}

async function solveRound(page, rapid, plan) {
  const current = await mode(page);
  const tiles = page.locator('.day-tile');
  const labels = await tiles.evaluateAll(nodes => nodes.map(node => node.textContent.replace('TODAY','').trim()));
  let correct = -1;
  if (current.type === 'month') {
    const match = current.prompt.match(/after (.+)\?/i);
    correct = MONTHS.indexOf(MONTHS[(MONTHS.indexOf(match?.[1]) + 1) % 12]);
  } else if (current.type === 'day-after' || current.type === 'day-before') {
    const match = current.prompt.match(/(?:after|before) (.+)\?/i);
    const base = DAYS.indexOf(match?.[1]);
    correct = current.type === 'day-after' ? (base + 1) % 7 : (base + 6) % 7;
  }
  if (correct < 0 || correct >= labels.length) throw new Error(`cannot solve ${current.prompt}: ${labels.join(',')}`);
  const wrong = labels.findIndex((_, index) => index !== correct);
  await tiles.nth(wrong).dispatchEvent('pointerdown');
  const wrongRecovered = await tiles.nth(wrong).evaluate(element => element.classList.contains('wrong'));
  const before = (await state(page)).counter;
  const oldFirst = await tiles.first().elementHandle();
  await tiles.nth(correct).dispatchEvent('pointerdown');
  if (rapid) {
    await tiles.nth(correct).dispatchEvent('pointerdown');
    await tiles.nth(wrong).dispatchEvent('pointerdown');
  }
  await page.evaluate(values => { window.__daysRandom = values.slice(); }, plan.values);
  const exactIncrement = (await state(page)).counter === before + 1;
  return { ...current, wrongRecovered, exactIncrement, oldFirst, expectedNext: plan.expected };
}

async function waitNext(page, round) {
  await page.waitForFunction(element => !element?.isConnected, round.oldFirst, { timeout: 4000 });
  const next = await mode(page);
  return next.type === round.expectedNext;
}

async function reward(page, tier, base, rowId, screenshots) {
  if (tier <= 2) {
    await page.locator('.back-btn').click();
    await page.waitForURL(/\/learning\/(index\.html)?$/);
  }
  await page.locator('.vb-celebrate.in').waitFor({ timeout: 5000 });
  await page.waitForTimeout(250);
  const result = await page.locator('.vb-celebrate').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const title = document.querySelector('.title');
    const titleRect = title?.getBoundingClientRect();
    const overlapWidth = titleRect ? Math.max(0, Math.min(rect.right, titleRect.right) - Math.max(rect.left, titleRect.left)) : 0;
    const overlapHeight = titleRect ? Math.max(0, Math.min(rect.bottom, titleRect.bottom) - Math.max(rect.top, titleRect.top)) : 0;
    return {
      title: element.querySelector('.cele-title')?.textContent?.trim() || '',
      hint: element.querySelector('.cele-hint')?.textContent?.trim() || '',
      inViewport: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
      overlapsTitle: overlapWidth > 1 && overlapHeight > 1,
      overlapWidth,
      overlapHeight,
      noticeRect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      titleRect: titleRect ? { left: titleRect.left, top: titleRect.top, right: titleRect.right, bottom: titleRect.bottom } : null,
    };
  });
  await saveShot(page, rowId, 'reward', screenshots);
  await page.locator('.vb-celebrate').click();
  await page.locator('.vb-celebrate').waitFor({ state: 'detached', timeout: 1200 });
  if (tier <= 2) await page.goto(base + '/learning/days.html', { waitUntil: 'load' });
  return result;
}

async function bottomProof(page, rowId, screenshots) {
  await page.locator('#stage').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.waitForTimeout(2100);
  const result = await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.day-tile')].at(-1);
    if (!tile) return { pass: false, reason: 'missing final tile' };
    const rect = tile.getBoundingClientRect();
    const blockers = [...document.querySelectorAll('.back-btn,.home-btn,#gameSettingsGear,.settings-gear,.vb-caption.show')].map(element => element.getBoundingClientRect());
    const overlap = blocker => Math.min(rect.right, blocker.right) - Math.max(rect.left, blocker.left) > 1
      && Math.min(rect.bottom, blocker.bottom) - Math.max(rect.top, blocker.top) > 1;
    return {
      pass: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1 && !blockers.some(overlap),
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      blockerOverlaps: blockers.filter(overlap).length,
    };
  });
  await saveShot(page, rowId, 'bottom-reachable', screenshots);
  await page.locator('#stage').evaluate(element => { element.scrollTop = 0; });
  return result;
}

async function createContactSheet(browser, items, target, title) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const cards = items.map(item => `<figure><img src="data:image/png;base64,${readFileSync(item.file).toString('base64')}"><figcaption>${item.rowId} · ${item.label}</figcaption></figure>`).join('');
  await page.setContent(`<style>body{background:#111827;color:white;font:16px Arial;margin:0;padding:18px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}figure{margin:0;background:#1f2937;padding:6px}img{width:100%;height:250px;object-fit:contain}figcaption{font-size:12px}</style><h1>${title}</h1><div class="grid">${cards}</div>`);
  await page.screenshot({ path: target, fullPage: true });
  await context.close();
}

async function runCell(browser, base, viewportName, viewport, tier, allScreenshots) {
  await health(base);
  const rowId = `days:T${tier}:${viewportName}`;
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch, reducedMotion: 'no-preference', serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort('blockedbyclient'));
  await context.addInitScript(init, { tier, bday: birthday(tier), feature: false, counter: 119 });
  const page = await context.newPage();
  const pageErrors = [], failedLocalRequests = [], expectedMediaAborts = [], screenshots = [], geometrySamples = [], rounds = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => {
    if (!request.url().startsWith(base)) return;
    const detail = `${request.url()} ${request.failure()?.errorText || ''}`;
    if (request.resourceType() === 'media' && request.failure()?.errorText === 'net::ERR_ABORTED') expectedMediaAborts.push(detail);
    else failedLocalRequests.push(detail);
  });
  let fatal = null, rewardResult = null, counterBefore = null, counterAfter = null, repeatAfter = null;
  let explorationPass = tier >= 5, settingsPass = tier >= 5, reloadRecovered = false, navigationRecovered = false;
  try {
    await page.goto(base + '/learning/days.html', { waitUntil: 'load' });
    counterBefore = (await state(page)).counter;
    geometrySamples.push(await geometry(page));
    await saveShot(page, rowId, 'initial', screenshots);

    if (tier <= 4) {
      const beforeExplore = (await state(page)).counter;
      const tiles = page.locator('.day-tile');
      if (await tiles.count() !== 7 || (await mode(page)).type !== 'explore') throw new Error('expected seven-tile exploration mode');
      for (let index = 0; index < 7; index++) await tiles.nth(index).dispatchEvent('pointerdown');
      explorationPass = (await state(page)).counter === beforeExplore;
      settingsPass = await enableQuizThroughSettings(page);
      geometrySamples.push(await geometry(page));
      await saveShot(page, rowId, 'quiz-enabled', screenshots);
    }

    for (let index = 0; index < 8; index++) {
      const plan = nextPlan(tier, index);
      const round = await solveRound(page, index === 0, plan);
      rounds.push({ type: round.type, prompt: round.prompt, wrongRecovered: round.wrongRecovered, exactIncrement: round.exactIncrement, expectedNext: round.expectedNext });
      if (index === 0 && tier >= 3) rewardResult = await reward(page, tier, base, rowId, screenshots);
      if (index < 7) {
        const planned = await waitNext(page, round);
        rounds.at(-1).plannedNext = planned;
      }
      if ([0,3,7].includes(index)) {
        geometrySamples.push(await geometry(page));
        await saveShot(page, rowId, `round-${index + 1}`, screenshots);
      }
    }

    if (tier <= 2) rewardResult = await reward(page, tier, base, rowId, screenshots);
    counterAfter = (await state(page)).counter;
    repeatAfter = (await state(page)).repeat;
    const beforeReload = counterAfter;
    await page.reload({ waitUntil: 'load' });
    reloadRecovered = (await state(page)).counter === beforeReload && (await mode(page)).type !== 'explore';
    geometrySamples.push(await geometry(page));
    await saveShot(page, rowId, 'reload', screenshots);

    await page.locator('.back-btn').click();
    await page.waitForURL(/\/learning\/(index\.html)?$/);
    const card = page.locator('[data-activity="days"]');
    navigationRecovered = await card.isVisible();
    await card.click();
    await page.waitForURL(/\/learning\/days\.html$/);
    navigationRecovered = navigationRecovered && (await state(page)).counter === beforeReload;
    await saveShot(page, rowId, 'navigation-return', screenshots);
    if (pageErrors.length || failedLocalRequests.length) throw new Error(`browser/runtime request failure: ${JSON.stringify({ pageErrors, failedLocalRequests })}`);
  } catch (error) {
    fatal = `${error.name}: ${error.message}`;
    try { await saveShot(page, rowId, 'failure', screenshots); } catch {}
  } finally {
    allScreenshots.push(...screenshots.map(item => ({ ...item, viewport: viewportName, tier })));
    await context.close();
  }
  const observed = new Set(rounds.map(round => round.type));
  const expectedModes = tier >= 6 ? ['month','day-after','day-before'] : ['day-after','day-before'];
  const modePass = expectedModes.every(value => observed.has(value));
  const exactProgression = counterBefore != null && counterAfter === counterBefore + 8;
  const geometryPass = geometrySamples.length >= 5 && geometrySamples.every(sample => sample.minTarget >= 44 && sample.minNavTarget >= 44 && sample.horizontalOverflow <= 1 && !sample.clippedTargets && !sample.navClipped && !sample.navTitleOverlap && !sample.navHintOverlap);
  const rewardPass = !!rewardResult?.title && rewardResult.hint === 'Saved in your gallery' && rewardResult.inViewport && repeatAfter === 1;
  return {
    id: rowId,
    activityId: 'days',
    route: '/learning/days.html',
    tier,
    viewport: viewportName,
    checks: {
      input: !fatal && settingsPass && explorationPass && rounds.length === 8 && rounds.every(round => round.wrongRecovered && round.exactIncrement) ? 'PASS' : 'FAIL',
      progression: !fatal && exactProgression ? 'PASS' : 'FAIL',
      rewards: !fatal && rewardPass ? 'PASS' : 'FAIL',
      restart: !fatal && reloadRecovered && navigationRecovered ? 'PASS' : 'FAIL',
      long_repeated_play: !fatal && rounds.length === 8 && modePass && rounds.slice(0, 7).every(round => round.plannedNext) ? 'PASS' : 'FAIL',
      visual_quality: !fatal && geometryPass ? 'BLK' : 'FAIL',
    },
    counterBefore,
    counterAfter,
    expectedCounter: counterBefore == null ? null : counterBefore + 8,
    repeatAfter,
    reward: rewardResult,
    explorationPass,
    settingsPass,
    reloadRecovered,
    navigationRecovered,
    rounds,
    geometrySamples,
    pageErrors,
    failedLocalRequests,
    expectedMediaAborts,
    screenshotCount: screenshots.length,
    fatal,
  };
}

async function runProbe(browser, base, viewportName, viewport, tier, allScreenshots) {
  const rowId = `days-probe:T${tier}:${viewportName}`;
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort('blockedbyclient'));
  await context.addInitScript(init, { tier, bday: birthday(tier), feature: true, counter: 0 });
  const page = await context.newPage();
  const screenshots = [], geometrySamples = [], rounds = [];
  let bottomReachable = null;
  let fatal = null;
  try {
    await page.goto(base + '/learning/days.html', { waitUntil: 'load' });
    for (let index = 0; index < 3; index++) {
      geometrySamples.push(await geometry(page));
      await saveShot(page, rowId, `round-${index + 1}`, screenshots);
      if (index === 0) bottomReachable = await bottomProof(page, rowId, screenshots);
      const plan = nextPlan(tier, index);
      const round = await solveRound(page, index === 0, plan);
      rounds.push({ type: round.type, wrongRecovered: round.wrongRecovered, exactIncrement: round.exactIncrement, expectedNext: round.expectedNext });
      if (index < 2) rounds.at(-1).plannedNext = await waitNext(page, round);
    }
  } catch (error) {
    fatal = `${error.name}: ${error.message}`;
  } finally {
    allScreenshots.push(...screenshots.map(item => ({ ...item, viewport: viewportName, tier })));
    await context.close();
  }
  const geometryPass = geometrySamples.length === 3 && geometrySamples.every(sample => sample.minTarget >= 44 && sample.minNavTarget >= 44 && sample.horizontalOverflow <= 1 && !sample.clippedTargets && !sample.navClipped && !sample.navTitleOverlap && !sample.navHintOverlap);
  return { id: rowId, tier, viewport: viewportName, pass: !fatal && geometryPass && bottomReachable?.pass && rounds.length === 3 && rounds.every(round => round.wrongRecovered && round.exactIncrement) && rounds.slice(0,2).every(round => round.plannedNext), geometrySamples, bottomReachable, rounds, screenshotCount: screenshots.length, fatal };
}

if (path.dirname(OUT) !== path.join(ROOT, 'tests', 'e2e', 'out') || path.basename(OUT) !== 'days-visual-play') throw new Error(`refusing unsafe output cleanup: ${OUT}`);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, 'contact-sheets'), { recursive: true });
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
for (let attempt = 0; attempt < 100; attempt++) {
  try { await health(base); break; }
  catch { if (attempt === 99) throw new Error('local server did not start'); await new Promise(resolve => setTimeout(resolve, 100)); }
}
const browser = await chromium.launch();
const screenshots = [], rows = [], probes = [];
try {
  const jobs = [];
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) for (const tier of TIERS) jobs.push({ viewportName, viewport, tier });
  async function worker() {
    while (jobs.length) {
      const job = jobs.shift();
      const row = await runCell(browser, base, job.viewportName, job.viewport, job.tier, screenshots);
      rows.push(row);
      console.log(`${row.fatal ? 'ERROR' : 'DONE'} ${row.id} rounds=${row.rounds.length}${row.fatal ? ' ' + row.fatal : ''}`);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);

  const probeJobs = [];
  for (const [viewportName, viewport] of Object.entries(PROBE_VIEWPORTS)) for (const tier of [3,5,7,10]) probeJobs.push({ viewportName, viewport, tier });
  async function probeWorker() {
    while (probeJobs.length) {
      const job = probeJobs.shift();
      const probe = await runProbe(browser, base, job.viewportName, job.viewport, job.tier, screenshots);
      probes.push(probe);
      console.log(`${probe.pass ? 'DONE' : 'ERROR'} ${probe.id}${probe.fatal ? ' ' + probe.fatal : ''}`);
    }
  }
  await Promise.all([probeWorker(), probeWorker(), probeWorker(), probeWorker()]);

  for (const viewportName of [...Object.keys(VIEWPORTS), ...Object.keys(PROBE_VIEWPORTS)]) {
    const items = screenshots.filter(item => item.viewport === viewportName);
    if (items.length) await createContactSheet(browser, items, path.join(OUT, 'contact-sheets', `${viewportName}.png`), `Days ${viewportName}`);
  }
} finally {
  await browser.close();
  server.kill();
}

rows.sort((a, b) => a.id.localeCompare(b.id));
probes.sort((a, b) => a.id.localeCompare(b.id));
const counts = { rows: rows.length, pass: 0, fail: 0, blk: 0 };
for (const row of rows) for (const status of Object.values(row.checks)) counts[status.toLowerCase()]++;
const report = {
  auditStart: AUDIT_START,
  daysSha256: sha256(path.join(ROOT, 'learning', 'days.html')),
  generatedAt: new Date().toISOString(),
  evidenceBoundary: 'Browser-driven pointer/touch emulation and silent local media stubs with inspected renders; no physical child-touch or human-audible voice-quality claim.',
  counts,
  screenshots: screenshots.length,
  recordedCorrectAnswers: rows.reduce((sum, row) => sum + Math.max(0, (row.counterAfter || 0) - (row.counterBefore || 0)), 0),
  rewardTitleOverlaps: rows.filter(row => row.reward?.overlapsTitle).map(row => ({ id: row.id, overlapWidth: row.reward.overlapWidth, overlapHeight: row.reward.overlapHeight })),
  rows,
  probes,
};
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...counts, probes: probes.length, probePass: probes.filter(probe => probe.pass).length, screenshots: screenshots.length, recordedCorrectAnswers: report.recordedCorrectAnswers, rewardTitleOverlaps: report.rewardTitleOverlaps.length }));
if (rows.length !== 20 || rows.some(row => row.fatal || Object.values(row.checks).includes('FAIL') || row.pageErrors.length || row.failedLocalRequests.length) || probes.some(probe => !probe.pass)) process.exitCode = 1;
