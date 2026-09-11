// Magic Touch visual, reward, progression and repeated-play audit at T1-T10.
// Synthetic profiles and silent local media stubs only.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.join(import.meta.dirname, 'out', 'magic-touch-visual-play');
const REPAIR_START = 'a7c9ac06feba7a7a3d193583e4fd4669bfa8892f';
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

function initScript({ tier, birthday }) {
  const profile = {
    id: `magic-touch-visual-t${tier}`,
    name: `Magic Touch Test ${tier}`,
    birthday,
    color: '#4ECDC4',
    voice: 'girl',
    mascot: { id: 'dog' },
    tierOverrides: { 'magic-touch': tier },
    activitiesVisible: { 'magic-touch': true },
    features: {},
    youtube: [],
    achievements: {
      unlocked: {
        'magic-touch.first': { at: 1 },
        'magic-touch.milestone.bronze': { at: 1 },
        'magic-touch.milestone.silver': { at: 1 },
      },
      counters: { 'magic-touch': 299 },
      repeats: {},
      streak: { last: null, current: 0, best: 0 },
      xp: 2,
      rank: 'sprout',
    },
  };
  if (!sessionStorage.getItem('__magic_touch_visual_seeded')) {
    sessionStorage.clear();
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    localStorage.setItem('vb_pin', '1234');
    sessionStorage.setItem('__magic_touch_visual_seeded', '1');
  }
  try { HTMLMediaElement.prototype.play = () => Promise.resolve(); } catch {}
  try { if (speechSynthesis) speechSynthesis.speak = () => {}; } catch {}
  try { navigator.vibrate = () => true; } catch {}
  let state = 97331 + tier;
  Math.random = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
  window.__auditDotLabels = {};
  const fillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (value, x, y, ...rest) {
    if (this.canvas?.id === 'canvas' && /^\d+$/.test(String(value))) {
      window.__auditDotLabels[String(value)] = { x, y };
    }
    return fillText.call(this, value, x, y, ...rest);
  };
}

async function saveShot(page, rowId, label, screenshots) {
  const dir = path.join(OUT, 'screenshots');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${rowId.replaceAll(':', '-')}-${label}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: 'allow' });
  screenshots.push({ rowId, label, file });
}

async function installAuditHooks(page) {
  await page.evaluate(() => {
    window.__auditProgressCalls = [];
    const record = window.vbProgress.record;
    const show = window.vbCelebrate.show;
    window.vbProgress.record = (...args) => {
      window.__auditProgressCalls.push(['record', Date.now(), ...args]);
      return record.apply(window.vbProgress, args);
    };
    window.vbCelebrate.show = (...args) => {
      window.__auditProgressCalls.push(['show', Date.now(), (args[0] || []).map(def => def.id)]);
      return show.apply(window.vbCelebrate, args);
    };
  });
}

async function progressSnapshot(page) {
  return page.evaluate(() => {
    const profiles = JSON.parse(localStorage.getItem('vb_profiles') || '[]');
    const profile = profiles.find(item => item.id === localStorage.getItem('vb_active_id')) || profiles[0] || {};
    const state = profile.achievements || {};
    return {
      counter: state.counters?.['magic-touch'] || 0,
      repeat: state.repeats?.['magic-touch'] || 0,
      recordCalls: window.__auditProgressCalls?.filter(call => call[0] === 'record').length || 0,
      rewardShows: window.__auditProgressCalls?.filter(call => call[0] === 'show').length || 0,
    };
  });
}

async function clickCanvas(page, x, y) {
  await page.mouse.click(x, y);
}

async function canvasGeometry(page) {
  return page.evaluate(() => {
    const visibleRect = selector => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      const r = element.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || !r.width || !r.height) return null;
      return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height };
    };
    const canvas = document.querySelector('#canvas');
    const r = canvas.getBoundingClientRect();
    const controls = ['.back-btn', '.home-btn', '#gameSettingsGear', '.settings-gear', '#dotsBtn']
      .map(selector => {
        const value = visibleRect(selector);
        return value ? { selector, ...value } : null;
      }).filter(Boolean);
    return {
      canvas: { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height },
      controls,
      hint: visibleRect('#hint'),
      dotsAvailable: !!visibleRect('#dotsBtn'),
      minControlTarget: Math.min(...controls.map(control => Math.min(control.width, control.height))),
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
}

async function captureReward(page, rowId, screenshots) {
  await page.locator('.vb-celebrate.in').waitFor({ timeout: 8000 });
  const reward = await page.locator('.vb-celebrate').evaluate(notice => {
    const box = element => {
      const r = element.getBoundingClientRect();
      return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height };
    };
    const r = box(notice);
    const controls = [...document.querySelectorAll('.back-btn,.home-btn,#gameSettingsGear,.settings-gear,#dotsBtn,.vb-replay-instruction')]
      .filter(element => {
        const style = getComputedStyle(element), value = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && value.width && value.height;
      }).map(element => ({ name: element.id || element.className, ...box(element) }));
    const overlaps = controls.filter(value => Math.min(r.right, value.right) > Math.max(r.left, value.left)
      && Math.min(r.bottom, value.bottom) > Math.max(r.top, value.top)).map(value => value.name);
    return {
      title: notice.querySelector('.cele-title')?.textContent?.trim() || '',
      hint: notice.querySelector('.cele-hint')?.textContent?.trim() || '',
      inViewport: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
      overlaps,
      box: r,
    };
  });
  await saveShot(page, rowId, 'reward', screenshots);
  const beforeDismiss = Date.now();
  await page.locator('.vb-celebrate').click();
  await page.locator('.vb-celebrate').waitFor({ state: 'detached', timeout: 1000 });
  reward.dismissMs = Date.now() - beforeDismiss;
  return reward;
}

async function waitForDotLabels(page) {
  await page.waitForFunction(() => Object.keys(window.__auditDotLabels || {}).length >= 3);
  return page.evaluate(() => Object.entries(window.__auditDotLabels)
    .map(([n, point]) => ({ n: Number(n), x: point.x, y: point.y }))
    .sort((a, b) => a.n - b.n));
}

async function playDotShape(page, rowId, index, screenshots) {
  const labels = await waitForDotLabels(page);
  const first = labels[0];
  const viewport = page.viewportSize();
  const candidates = [
    { x: viewport.width * 0.12, y: viewport.height * 0.52 },
    { x: viewport.width * 0.88, y: viewport.height * 0.52 },
    { x: viewport.width * 0.5, y: viewport.height * 0.82 },
  ];
  const wrong = candidates.sort((a, b) => Math.hypot(b.x - first.x, b.y - first.y) - Math.hypot(a.x - first.x, a.y - first.y))[0];
  const before = await progressSnapshot(page);
  await clickCanvas(page, wrong.x, wrong.y);
  await page.waitForTimeout(80);
  const afterWrong = await progressSnapshot(page);
  if (afterWrong.recordCalls !== before.recordCalls) throw new Error('wrong dot awarded progress');

  for (const point of labels) {
    await clickCanvas(page, point.x, point.y);
    await page.waitForTimeout(70);
  }
  await page.waitForFunction(() => /^✨ A .+! ✨$/.test(document.querySelector('#hint')?.textContent || ''));
  const after = await progressSnapshot(page);
  const records = after.recordCalls - before.recordCalls;
  if (records !== 1) throw new Error(`connected shape recorded ${records} progress events instead of one`);
  const shape = (await page.locator('#hint').textContent()).replace(/^✨ A /, '').replace(/! ✨$/, '');
  if (index === 0) await saveShot(page, rowId, 'mode', screenshots);
  await page.waitForFunction(() => document.querySelector('#hint')?.textContent?.includes('Tap the dots'), null, { timeout: 4000 });
  await page.evaluate(() => { window.__auditDotLabels = {}; });
  await waitForDotLabels(page);
  return { shape, records, wrongRecovered: true, dots: labels.length };
}

async function createContactSheet(browser, items, target, title) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const cards = items.map(item => {
    const data = readFileSync(item.file).toString('base64');
    return `<figure><img src="data:image/png;base64,${data}"><figcaption>${item.rowId} · ${item.label}</figcaption></figure>`;
  }).join('');
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:20px;background:#111827;color:#f9fafb;font:16px Arial,sans-serif}
    h1{font-size:26px;margin:0 0 18px}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
    figure{margin:0;background:#1f2937;border:1px solid #4b5563;border-radius:10px;padding:7px}
    img{display:block;width:100%;height:240px;object-fit:contain;background:#05070d;border-radius:6px}
    figcaption{font-size:12px;margin-top:6px;overflow-wrap:anywhere}
  </style><h1>${title}</h1><div class="grid">${cards}</div>`, { waitUntil: 'load' });
  await page.screenshot({ path: target, fullPage: true });
  await context.close();
}

async function runCell(browser, base, viewportName, viewport, tier, allScreenshots) {
  await health(base);
  const rowId = `magic-touch:T${tier}:${viewportName}`;
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
  await context.addInitScript(initScript, { tier, birthday: birthdayForTier(tier) });
  const page = await context.newPage();
  const pageErrors = [];
  const failedLocalRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => {
    if (request.url().startsWith(base)) failedLocalRequests.push(`${request.url()} ${request.failure()?.errorText || ''}`);
  });
  const screenshots = [];
  const dotRounds = [];
  let reward = null;
  let deferredReward = false;
  let freeRecords = 0;
  let recoveredAfterReload = false;
  let finalProgress = null;
  let initialGeometry = null;
  let fatal = null;

  try {
    await page.goto(base + '/games/magic-touch.html', { waitUntil: 'load', timeout: 20000 });
    await page.locator('#canvas').waitFor({ state: 'visible' });
    await installAuditHooks(page);
    initialGeometry = await canvasGeometry(page);
    if (initialGeometry.canvas.width !== viewport.width || initialGeometry.canvas.height !== viewport.height
      || initialGeometry.horizontalOverflow > 1 || !initialGeometry.hint
      || initialGeometry.controls.some(control => control.left < -1 || control.top < -1 || control.right > viewport.width + 1 || control.bottom > viewport.height + 1)
      || initialGeometry.dotsAvailable !== (tier >= 6)) {
      throw new Error(`bad initial geometry ${JSON.stringify(initialGeometry)}`);
    }
    await saveShot(page, rowId, 'initial', screenshots);

    const firstBefore = await progressSnapshot(page);
    await clickCanvas(page, viewport.width * 0.48, viewport.height * 0.38);
    await page.waitForFunction(() => {
      const profiles = JSON.parse(localStorage.getItem('vb_profiles') || '[]');
      return profiles[0]?.achievements?.counters?.['magic-touch'] === 300;
    });
    const firstAfter = await progressSnapshot(page);
    if (firstAfter.recordCalls !== firstBefore.recordCalls + 1) throw new Error('first free-play burst did not record exactly once');
    freeRecords++;

    if (tier >= 3) {
      reward = await captureReward(page, rowId, screenshots);
    } else {
      await page.waitForTimeout(2800);
      if (await page.locator('.vb-celebrate.in').isVisible().catch(() => false)) throw new Error('little-tier reward interrupted active play');
      await page.locator('.back-btn').click();
      await page.waitForURL(/\/games\/(index\.html)?$/);
      deferredReward = true;
      reward = await captureReward(page, rowId, screenshots);
      await page.goto(base + '/games/magic-touch.html', { waitUntil: 'load' });
      await page.locator('#canvas').waitFor({ state: 'visible' });
      await installAuditHooks(page);
    }

    if (!reward.title || reward.hint !== 'Saved in your gallery' || !reward.inViewport || reward.overlaps.length || reward.dismissMs > 1000) {
      throw new Error(`reward geometry/copy/dismissal failed ${JSON.stringify(reward)}`);
    }

    const repeatedBefore = await progressSnapshot(page);
    for (let index = 0; index < 3; index++) {
      const x = viewport.width * (0.28 + index * 0.2);
      const y = viewport.height * (0.32 + index * 0.07);
      await clickCanvas(page, x, y);
      await page.waitForTimeout(100);
    }
    if (tier >= 3) {
      await page.mouse.move(viewport.width * 0.3, viewport.height * 0.45);
      await page.mouse.down();
      await page.mouse.move(viewport.width * 0.68, viewport.height * 0.48, { steps: 8 });
      await page.mouse.up();
      freeRecords++;
    }
    freeRecords += 3;
    const repeatedAfter = await progressSnapshot(page);
    const expectedRepeated = tier >= 3 ? 4 : 3;
    if (repeatedAfter.recordCalls - repeatedBefore.recordCalls !== expectedRepeated) {
      throw new Error(`repeated free play recorded ${repeatedAfter.recordCalls - repeatedBefore.recordCalls}, expected ${expectedRepeated}`);
    }
    await saveShot(page, rowId, 'repeated', screenshots);

    if (tier >= 6) {
      await page.evaluate(() => { window.__auditDotLabels = {}; });
      await page.locator('#dotsBtn').click();
      await waitForDotLabels(page);
      for (let index = 0; index < 3; index++) dotRounds.push(await playDotShape(page, rowId, index, screenshots));
      await page.locator('#dotsBtn').click();
      if (!await page.locator('#hint').textContent().then(text => text.includes('Touch the sky'))) throw new Error('Free play did not restore its instruction');
    } else {
      await clickCanvas(page, viewport.width * 0.08, viewport.height * 0.7);
      freeRecords++;
      await saveShot(page, rowId, 'mode', screenshots);
    }

    await page.reload({ waitUntil: 'load' });
    await page.locator('#canvas').waitFor({ state: 'visible' });
    await installAuditHooks(page);
    const recoveryBefore = await progressSnapshot(page);
    await clickCanvas(page, viewport.width * 0.52, viewport.height * 0.36);
    await page.waitForTimeout(120);
    const recoveryAfter = await progressSnapshot(page);
    if (recoveryAfter.recordCalls !== recoveryBefore.recordCalls + 1) throw new Error('post-reload free play did not record exactly once');
    freeRecords++;
    recoveredAfterReload = true;
    await saveShot(page, rowId, 'recovered', screenshots);

    finalProgress = await progressSnapshot(page);
    const dotRecords = dotRounds.reduce((sum, round) => sum + round.records, 0);
    const expectedCounter = 299 + freeRecords + dotRecords;
    if (finalProgress.counter !== expectedCounter || finalProgress.repeat !== 1) {
      throw new Error(`persisted progress mismatch expected counter ${expectedCounter}: ${JSON.stringify(finalProgress)}`);
    }
    if (pageErrors.length || failedLocalRequests.length) throw new Error(`browser/runtime errors ${JSON.stringify({ pageErrors, failedLocalRequests })}`);
  } catch (error) {
    fatal = `${error.name}: ${error.message}`;
    try { await saveShot(page, rowId, 'failure', screenshots); } catch {}
  } finally {
    allScreenshots.push(...screenshots.map(item => ({ ...item, viewport: viewportName, tier })));
    await context.close();
  }

  const singleDotProgress = tier < 6 || (dotRounds.length === 3 && dotRounds.every(round => round.records === 1));
  const stable = !fatal && recoveredAfterReload && freeRecords >= 5
    && singleDotProgress && (tier < 6 || dotRounds.every(round => round.wrongRecovered));
  return {
    id: rowId,
    activityId: 'magic-touch',
    route: '/games/magic-touch.html',
    tier,
    viewport: viewportName,
    checks: {
      progression: fatal || !singleDotProgress
        ? fail(fatal || 'Connect-the-dots progress was not exactly one record per completed shape.')
        : pass(`${freeRecords} free-play bursts and ${dotRounds.length || 0} goal rounds persisted at one record per completed action.`),
      score: na('Magic Touch has no visible score, win/loss score state or score reset mechanic.'),
      rewards: !fatal && reward
        ? pass(`299→300 repeat reward persisted once, ${tier <= 2 ? 'deferred to the Games hub' : 'appeared at the in-game pause'}, and dismissed in ${reward.dismissMs}ms.`)
        : fail(fatal || 'reward path incomplete'),
      restart: na('Magic Touch has no explicit restart control; reload recovery remains a separate, previously accepted dimension.'),
      long_repeated_play: stable
        ? pass(`${freeRecords} free-play bursts${tier >= 6 ? ' plus three wrong-to-correct connected shapes' : ''}; mode switch and reload recovery remained playable.`)
        : fail(fatal || 'repeated play or recovery incomplete'),
      visual_quality: blk(tier >= 6 && initialGeometry?.minControlTarget < 44
        ? `Automated geometry found a ${initialGeometry.minControlTarget}px minimum control target; full-page renders require visual inspection before ledger import.`
        : 'Automated geometry passed; all full-page renders and contact sheets require visual inspection before ledger import.'),
    },
    deferredReward,
    freeRecords,
    dotRounds,
    singleDotProgress,
    recoveredAfterReload,
    reward,
    finalProgress,
    initialGeometry,
    blockedExternal,
    pageErrors,
    failedLocalRequests,
    screenshotCount: screenshots.length,
    fatal,
  };
}

const ownedOutputRoot = path.join(ROOT, 'tests', 'e2e', 'out');
if (path.dirname(OUT) !== ownedOutputRoot || path.basename(OUT) !== 'magic-touch-visual-play') {
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
      console.log(`${row.fatal ? 'ERROR' : 'PASS'} ${row.id} free=${row.freeRecords} dots=${row.dotRounds.map(round => round.records).join(',')}${row.fatal ? ` ${row.fatal}` : ''}`);
    }
  }
  await Promise.all(Array.from({ length: 2 }, worker));
  for (const viewportName of SELECTED_VIEWPORTS) {
    await createContactSheet(browser, screenshots.filter(item => item.viewport === viewportName),
      path.join(OUT, 'contact-sheets', `${viewportName}.png`),
      `Magic Touch ${viewportName} — T1-T10 reward, repeated play, goal mode and recovery`);
  }
} finally {
  await browser.close();
  server.kill();
}

rows.sort((a, b) => a.id.localeCompare(b.id));
const counts = { rows: rows.length, pass: 0, fail: 0, na: 0, blk: 0 };
for (const row of rows) for (const result of Object.values(row.checks)) counts[result.status.toLowerCase()]++;
const report = {
  repairStart: REPAIR_START,
  magicTouchSha256: sha256(path.join(ROOT, 'games', 'magic-touch.html')),
  base,
  generatedAt: new Date().toISOString(),
  durationSec: Math.round((Date.now() - started) / 1000),
  mediaProof: 'Synthetic profiles, browser-rendered canvas and silent local media stubs only; no audible, provider or physical-device claim.',
  counts,
  contactSheets: ['desktop.png', 'phone.png'],
  rows,
};
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...counts, screenshots: screenshots.length, durationSec: report.durationSec }));
const expectedRows = SELECTED_TIERS.length * SELECTED_VIEWPORTS.length;
const expectedDotRows = SELECTED_TIERS.filter(tier => tier >= 6).length * SELECTED_VIEWPORTS.length;
if (rows.length !== expectedRows || rows.some(row => row.fatal || row.pageErrors.length || row.failedLocalRequests.length)
  || rows.filter(row => row.tier >= 6 && row.singleDotProgress).length !== expectedDotRows) process.exitCode = 1;
