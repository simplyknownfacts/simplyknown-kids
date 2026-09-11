// Tilt Drive full visual, sensor-edge, fallback-input and repeated-play audit.
// DeviceOrientation events and pointer input are browser-emulated. They do not
// prove a real phone's motion sensor or a child's physical touch interaction.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(import.meta.dirname, 'out', 'tilt-drive-visual-play');
const AUDIT_START = '0c6d9e5cec3f0f49bea623dce561c9b727bbffa9';
const VIEWPORTS = {
  desktop: { width: 1280, height: 900, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
};
const TIERS = [1,2,3,4,5,6,7,8,9,10];
const SELECTED_TIERS = process.env.TIERS ? process.env.TIERS.split(',').map(Number) : TIERS;
const SELECTED_VIEWPORTS = process.env.VIEWPORTS ? process.env.VIEWPORTS.split(',') : Object.keys(VIEWPORTS);
const pass = note => ({ status: 'PASS', note });
const fail = note => ({ status: 'FAIL', note });
const blk = note => ({ status: 'BLK', note });
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

function init({ tier, bday }) {
  const profile = {
    id: `tilt-t${tier}`,
    name: 'Tilt Test',
    birthday: bday,
    color: '#4ECDC4',
    voice: 'girl',
    mascot: { id: 'dog' },
    tierOverrides: { 'tilt-drive': tier },
    activitiesVisible: { 'tilt-drive': true },
    features: {},
    achievements: {
      unlocked: {
        'tilt-drive.first': { at: 1 },
        'tilt-drive.milestone.bronze': { at: 1 },
        'tilt-drive.milestone.silver': { at: 1 },
      },
      counters: { 'tilt-drive': 299 },
      repeats: {},
      streak: { last: null, current: 0, best: 0 },
      xp: 3,
      rank: 'sprout',
    },
  };
  if (!sessionStorage.__tiltSeed) {
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    sessionStorage.__tiltSeed = '1';
  }

  let randomState = (0x9e3779b9 + tier * 313) >>> 0;
  const seededRandom = () => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 0x100000000);
  window.__useCenterObstacles = false;
  Math.random = () => window.__useCenterObstacles ? 0.5 : seededRandom();
  try { HTMLMediaElement.prototype.play = () => Promise.resolve(); } catch {}
  try { navigator.vibrate = () => true; } catch {}

  window.__tiltPermission = 'denied';
  window.__installOrientationCapability = mode => {
    if (mode === 'unavailable') {
      Object.defineProperty(window, 'DeviceOrientationEvent', { configurable: true, writable: true, value: undefined });
      return;
    }
    class SyntheticDeviceOrientationEvent extends Event {
      static requestPermission() {
        if (window.__tiltPermission === 'rejected') return Promise.reject(new Error('permission prompt failed'));
        return Promise.resolve(window.__tiltPermission);
      }
    }
    Object.defineProperty(window, 'DeviceOrientationEvent', { configurable: true, writable: true, value: SyntheticDeviceOrientationEvent });
    window.__tiltPermission = mode;
  };
  window.__emitGamma = value => {
    const event = new Event('deviceorientation');
    Object.defineProperty(event, 'gamma', { value });
    window.dispatchEvent(event);
  };

  const realNow = performance.now.bind(performance);
  const realSetTimeout = window.setTimeout.bind(window);
  let virtualNow = realNow(), nextFrame = 1;
  const frameTimers = new Map();
  Date.now = () => 1700000000000 + Math.max(0, virtualNow);
  window.requestAnimationFrame = callback => {
    const id = nextFrame++;
    const timer = realSetTimeout(() => {
      if (!frameTimers.has(id)) return;
      frameTimers.delete(id);
      virtualNow = Math.max(virtualNow, realNow()) + 50;
      callback(virtualNow);
    }, 5);
    frameTimers.set(id, timer);
    return id;
  };
  window.cancelAnimationFrame = id => {
    const timer = frameTimers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    frameTimers.delete(id);
  };

  window.__carTrace = [];
  const originalTranslate = CanvasRenderingContext2D.prototype.translate;
  CanvasRenderingContext2D.prototype.translate = function (x, y) {
    if (y > innerHeight * 0.7) {
      window.__carTrace.push({ x, y, at: Date.now() });
      if (window.__carTrace.length > 1000) window.__carTrace.shift();
    }
    return originalTranslate.call(this, x, y);
  };
}

async function setCapability(page, mode) {
  await page.evaluate(value => window.__installOrientationCapability(value), mode);
}

async function emitGamma(page, value) {
  await page.evaluate(v => window.__emitGamma(v), value);
}

async function saveShot(page, rowId, label, screenshots) {
  const directory = path.join(OUT, 'screenshots');
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${rowId.replaceAll(':', '-')}-${String(screenshots.length + 1).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: file });
  screenshots.push({ rowId, label, file });
}

async function installProgressHook(page) {
  await page.evaluate(() => {
    window.__tiltRecords = [];
    const original = window.vbProgress.record;
    window.vbProgress.record = (...args) => {
      window.__tiltRecords.push(args);
      return original.apply(window.vbProgress, args);
    };
  });
}

async function progress(page) {
  return page.evaluate(() => {
    const profile = JSON.parse(localStorage.vb_profiles || '[]')[0] || {};
    const achievements = profile.achievements || {};
    return {
      counter: achievements.counters?.['tilt-drive'] || 0,
      repeat: achievements.repeats?.['tilt-drive'] || 0,
      records: window.__tiltRecords || [],
      best: {
        road: Number(localStorage.vb_tiltdrive_best_road || 0),
        river: Number(localStorage.vb_tiltdrive_best_river || 0),
        space: Number(localStorage.vb_tiltdrive_best_space || 0),
      },
    };
  });
}

async function geometry(page) {
  return page.evaluate(() => {
    const visible = selector => [...document.querySelectorAll(selector)].filter(element => {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    const elements = visible('.back-btn,.home-btn,#gameSettingsGear,.settings-gear,.style-card,.ov-btn,#hud,#overStat');
    const boxes = elements.map(element => {
      const rect = element.getBoundingClientRect();
      return { name: element.id || element.className, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    });
    const targets = boxes.filter(item => /back-btn|home-btn|Gear|settings-gear|style-card|ov-btn/.test(item.name));
    return {
      minTarget: targets.length ? Math.min(...targets.map(item => Math.min(item.width, item.height))) : null,
      clipped: boxes.filter(item => item.left < -1 || item.top < -1 || item.right > innerWidth + 1 || item.bottom > innerHeight + 1),
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      boxes,
    };
  });
}

function geometryOk(sample) {
  return (sample.minTarget == null || sample.minTarget >= 44) && !sample.clipped.length && sample.horizontalOverflow <= 1;
}

async function chooseTheme(page, theme, capability) {
  if (await page.locator('#overOv.show').isVisible().catch(() => false)) {
    await page.locator('#changeBtn').click();
  }
  await page.locator('#startOv.show').waitFor({ timeout: 3000 });
  await setCapability(page, capability);
  await page.evaluate(() => { window.__useCenterObstacles = true; window.__carTrace = []; });
  const index = { road: 0, river: 1, space: 2 }[theme];
  await page.locator('.style-card').nth(index).click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#hud')).display !== 'none');
  return (await page.locator('.vb-caption').textContent().catch(() => '')).trim();
}

async function waitForCrash(page) {
  await page.locator('#overOv.show').waitFor({ timeout: 6000 });
  const text = (await page.locator('#overStat').innerText()).replace(/\s+/g, ' ').trim();
  const match = text.match(/You drove (\d+) m/);
  if (!match || Number(match[1]) <= 0) throw new Error(`invalid crash score: ${text}`);
  return { meters: Number(match[1]), text };
}

async function reward(page, tier, base, rowId, screenshots) {
  if (tier <= 2) {
    await page.locator('.back-btn').click();
    await page.waitForURL(/\/games\/(index\.html)?$/);
  }
  await page.locator('.vb-celebrate.in').waitFor({ timeout: 5000 });
  // The class is applied before the 240 ms entrance transition completes.
  await page.waitForTimeout(500);
  const result = await page.locator('.vb-celebrate').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      title: element.querySelector('.cele-title')?.textContent?.trim() || '',
      hint: element.querySelector('.cele-hint')?.textContent?.trim() || '',
      inViewport: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
    };
  });
  await saveShot(page, rowId, 'reward', screenshots);
  const started = performance.now();
  await page.locator('.vb-celebrate').click();
  await page.locator('.vb-celebrate').waitFor({ state: 'detached', timeout: 1000 });
  result.dismissMs = performance.now() - started;
  if (tier <= 2) {
    await page.goto(base + '/games/tilt-drive.html', { waitUntil: 'load' });
    await installProgressHook(page);
  }
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
  const rowId = `tilt-drive:T${tier}:${viewportName}`;
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
    reducedMotion: 'no-preference',
    serviceWorkers: 'block',
  });
  let blockedExternal = 0;
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== base) { blockedExternal++; return route.abort('blockedbyclient'); }
    return route.continue();
  });
  await context.addInitScript(init, { tier, bday: birthday(tier) });
  const page = await context.newPage();
  const pageErrors = [], failedLocalRequests = [], screenshots = [], geometrySamples = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => {
    if (request.url().startsWith(base)) failedLocalRequests.push(`${request.url()} ${request.failure()?.errorText || ''}`);
  });
  let completedRounds = 0, unavailableCaption = '', deniedCaption = '', rejectedCaption = '', grantedCaption = '';
  let unavailableFallback = false, deniedFallback = false, rejectedFallback = false, validSensor = false;
  let invalidFirstIgnored = false, invalidSensorPoisoned = false, invalidSensorFallbackRecovered = null, reloadRecovered = false;
  let rewardResult = null, scoreResults = [], counterBefore = null, counterAfter = null, fatal = null;
  try {
    await page.goto(base + '/games/tilt-drive.html', { waitUntil: 'load' });
    await installProgressHook(page);
    const initial = await geometry(page);
    geometrySamples.push(initial);
    if (!geometryOk(initial)) throw new Error(`bad picker geometry: ${JSON.stringify(initial)}`);
    await saveShot(page, rowId, 'picker', screenshots);
    counterBefore = (await progress(page)).counter;

    unavailableCaption = await chooseTheme(page, 'road', 'unavailable');
    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    await page.keyboard.press('ArrowLeft');
    await canvas.dispatchEvent('pointermove', { pointerId: 11, pointerType: 'touch', clientX: box.x + box.width * 0.8, clientY: box.y + box.height * 0.8, bubbles: true });
    unavailableFallback = await page.waitForFunction(() => {
      const xs = window.__carTrace.map(item => item.x).filter(Number.isFinite);
      return xs.length > 2 && Math.max(...xs.slice(-20)) > innerWidth * 0.55;
    }, null, { timeout: 3000 }).then(() => true).catch(() => false);
    await canvas.dispatchEvent('pointermove', { pointerId: 12, pointerType: 'touch', clientX: box.x + box.width / 2, clientY: box.y + box.height * 0.8, bubbles: true });
    await saveShot(page, rowId, 'unavailable-fallback', screenshots);
    scoreResults.push({ theme: 'road-unavailable', ...(await waitForCrash(page)) });
    completedRounds++;
    rewardResult = await reward(page, tier, base, rowId, screenshots);

    deniedCaption = await chooseTheme(page, 'river', 'denied');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    deniedFallback = await page.waitForFunction(() => window.__carTrace.filter(item => Number.isFinite(item.x)).length > 3, null, { timeout: 3000 }).then(() => true).catch(() => false);
    await saveShot(page, rowId, 'denied-fallback', screenshots);
    scoreResults.push({ theme: 'river-denied', ...(await waitForCrash(page)) });
    completedRounds++;

    rejectedCaption = await chooseTheme(page, 'road', 'rejected');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    rejectedFallback = await page.waitForFunction(() => window.__carTrace.filter(item => Number.isFinite(item.x)).length > 3, null, { timeout: 3000 }).then(() => true).catch(() => false);
    scoreResults.push({ theme: 'road-rejected', ...(await waitForCrash(page)) });
    completedRounds++;

    grantedCaption = await chooseTheme(page, 'space', 'granted');
    for (const value of [null, NaN, Infinity, -Infinity]) await emitGamma(page, value);
    await page.waitForTimeout(60);
    invalidFirstIgnored = await page.evaluate(() => window.__carTrace.length > 2 && window.__carTrace.every(item => Number.isFinite(item.x)));
    await emitGamma(page, 0);
    await emitGamma(page, 1000);
    const movedRight = await page.waitForFunction(() => {
      const xs = window.__carTrace.map(item => item.x).filter(Number.isFinite);
      return xs.length && xs.at(-1) > innerWidth * 0.58;
    }, null, { timeout: 3000 }).then(() => true).catch(() => false);
    await emitGamma(page, -1000);
    const movedLeft = await page.waitForFunction(() => {
      const xs = window.__carTrace.map(item => item.x).filter(Number.isFinite);
      return xs.length && xs.at(-1) < innerWidth * 0.42;
    }, null, { timeout: 3000 }).then(() => true).catch(() => false);
    validSensor = movedRight && movedLeft;
    await emitGamma(page, 0);
    await canvas.dispatchEvent('pointermove', { pointerId: 13, pointerType: 'touch', clientX: box.x + box.width / 2, clientY: box.y + box.height * 0.8, bubbles: true });
    await saveShot(page, rowId, 'granted-extremes', screenshots);
    scoreResults.push({ theme: 'space-granted', ...(await waitForCrash(page)) });
    completedRounds++;

    await page.locator('#againBtn').click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#hud')).display !== 'none');
    await emitGamma(page, 0);
    for (const value of [NaN, Infinity, -Infinity, null]) await emitGamma(page, value);
    await page.waitForTimeout(60);
    invalidSensorPoisoned = await page.evaluate(() => window.__carTrace.some(item => !Number.isFinite(item.x)));
    const traceMarker = await page.evaluate(() => window.__carTrace.length);
    await canvas.dispatchEvent('pointermove', { pointerId: 14, pointerType: 'touch', clientX: box.x + box.width / 2, clientY: box.y + box.height * 0.8, bubbles: true });
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(120);
    invalidSensorFallbackRecovered = await page.evaluate(marker => window.__carTrace.slice(marker).some(item => Number.isFinite(item.x)), traceMarker);
    await saveShot(page, rowId, 'invalid-sensor', screenshots);

    await page.reload({ waitUntil: 'load' });
    await installProgressHook(page);
    const afterReloadPicker = await geometry(page);
    geometrySamples.push(afterReloadPicker);
    if (!geometryOk(afterReloadPicker)) throw new Error(`bad reload geometry: ${JSON.stringify(afterReloadPicker)}`);
    await chooseTheme(page, 'road', 'unavailable');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    scoreResults.push({ theme: 'road-reload', ...(await waitForCrash(page)) });
    completedRounds++;
    reloadRecovered = true;
    await saveShot(page, rowId, 'reload-recovered', screenshots);

    const overGeometry = await geometry(page);
    geometrySamples.push(overGeometry);
    if (!geometryOk(overGeometry)) throw new Error(`bad over geometry: ${JSON.stringify(overGeometry)}`);
    counterAfter = (await progress(page)).counter;
    const expectedAdded = scoreResults.reduce((sum, item) => sum + item.meters, 0);
    if (counterAfter !== counterBefore + expectedAdded) throw new Error(`progress counter ${counterAfter}, expected ${counterBefore + expectedAdded}`);
    if (pageErrors.length || failedLocalRequests.length) throw new Error(`browser/runtime request failure: ${JSON.stringify({ pageErrors, failedLocalRequests })}`);
  } catch (error) {
    fatal = `${error.name}: ${error.message}`;
    try { await saveShot(page, rowId, 'failure', screenshots); } catch {}
  } finally {
    allScreenshots.push(...screenshots.map(item => ({ ...item, viewport: viewportName, tier })));
    await context.close();
  }
  const unavailableInstructionCorrect = /drag left/i.test(unavailableCaption);
  const permissionFallbacks = unavailableFallback && deniedFallback && rejectedFallback;
  const progressPass = !fatal && completedRounds === 5 && counterAfter > counterBefore;
  const scorePass = !fatal && scoreResults.length === 5 && scoreResults.every(item => item.meters > 0 && /You drove \d+ m/.test(item.text));
  const rewardPass = !fatal && rewardResult?.title && rewardResult.hint === 'Saved in your gallery' && rewardResult.inViewport && rewardResult.dismissMs < 500;
  const restartPass = !fatal && reloadRecovered && new Set(scoreResults.map(item => item.theme)).size === 5;
  const repeatedPass = !fatal && progressPass && permissionFallbacks && validSensor && reloadRecovered;
  return {
    id: rowId,
    activityId: 'tilt-drive',
    route: '/games/tilt-drive.html',
    tier,
    viewport: viewportName,
    checks: {
      instructions: unavailableInstructionCorrect ? pass('Unavailable motion sensor produced an honest drag instruction.') : fail(`Unavailable motion sensor still announced "${unavailableCaption}" instead of the working drag fallback.`),
      input: invalidFirstIgnored && !invalidSensorPoisoned && invalidSensorFallbackRecovered ? pass('Finite tilt and pointer/keyboard fallback remained recoverable after invalid first and later sensor events.') : fail('Invalid sensor input was not safely ignored or fallback steering did not recover.'),
      progression: progressPass ? pass(`${completedRounds} crashes recorded exact cumulative meters.`) : fail(fatal || 'distance progression incomplete'),
      score: scorePass ? pass('Every completed run showed a positive distance and persisted per-ride best state.') : fail(fatal || 'distance/best score incomplete'),
      rewards: rewardPass ? pass(`Threshold reward persisted once ${tier <= 2 ? 'and deferred to the Games hub' : 'in the activity'}.`) : fail(fatal || 'reward incomplete'),
      restart: restartPass ? pass('Play again, change ride and full reload recovery all returned to playable rounds.') : fail(fatal || 'restart/recovery incomplete'),
      long_repeated_play: repeatedPass ? pass('Road, River and Space completed with unavailable, denied and granted sensor paths plus post-reload play.') : fail(fatal || 'repeated play incomplete'),
      visual_quality: fatal ? fail(fatal) : blk('Automated geometry passed; full renders and contact sheets require separate visual inspection.'),
    },
    completedRounds,
    unavailableCaption,
    deniedCaption,
    rejectedCaption,
    grantedCaption,
    unavailableFallback,
    deniedFallback,
    rejectedFallback,
    validSensor,
    invalidFirstIgnored,
    invalidSensorPoisoned,
    invalidSensorFallbackRecovered,
    reloadRecovered,
    reward: rewardResult,
    scoreResults,
    counterBefore,
    counterAfter,
    geometrySamples,
    blockedExternal,
    pageErrors,
    failedLocalRequests,
    screenshotCount: screenshots.length,
    fatal,
  };
}

if (path.dirname(OUT) !== path.join(ROOT, 'tests', 'e2e', 'out') || path.basename(OUT) !== 'tilt-drive-visual-play') {
  throw new Error(`refusing unsafe output cleanup: ${OUT}`);
}
rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, 'contact-sheets'), { recursive: true });
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.mjs')], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
for (let attempt = 0; attempt < 100; attempt++) {
  try { await health(base); break; }
  catch { if (attempt === 99) throw new Error('local server did not start'); await new Promise(resolve => setTimeout(resolve, 100)); }
}
const browser = await chromium.launch();
const jobs = [];
for (const viewportName of SELECTED_VIEWPORTS) for (const tier of SELECTED_TIERS) jobs.push({ viewportName, viewport: VIEWPORTS[viewportName], tier });
const rows = [], screenshots = [];
try {
  async function worker() {
    while (jobs.length) {
      const job = jobs.shift();
      const row = await runCell(browser, base, job.viewportName, job.viewport, job.tier, screenshots);
      rows.push(row);
      console.log(`${row.fatal ? 'ERROR' : 'DONE'} ${row.id} rounds=${row.completedRounds} sensorInvalid=${row.invalidSensorPoisoned && !row.invalidSensorFallbackRecovered}${row.fatal ? ' ' + row.fatal : ''}`);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  for (const viewportName of SELECTED_VIEWPORTS) {
    await createContactSheet(browser, screenshots.filter(item => item.viewport === viewportName), path.join(OUT, 'contact-sheets', `${viewportName}.png`), `Tilt Drive ${viewportName} T1-T10`);
  }
} finally {
  await browser.close();
  server.kill();
}
rows.sort((a, b) => a.id.localeCompare(b.id));
const counts = { rows: rows.length, pass: 0, fail: 0, blk: 0 };
for (const row of rows) for (const value of Object.values(row.checks)) counts[value.status.toLowerCase()]++;
const report = {
  auditStart: AUDIT_START,
  tiltDriveSha256: sha256(path.join(ROOT, 'games/tilt-drive.html')),
  generatedAt: new Date().toISOString(),
  evidenceBoundary: 'Browser-emulated DeviceOrientation events and pointer input; no physical-device sensor or child touch claim.',
  counts,
  screenshots: screenshots.length,
  rows,
};
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...counts, screenshots: screenshots.length }));
if (rows.length !== SELECTED_TIERS.length * SELECTED_VIEWPORTS.length
  || rows.some(row => row.fatal || row.completedRounds !== 5 || row.pageErrors.length || row.failedLocalRequests.length)) process.exitCode = 1;
