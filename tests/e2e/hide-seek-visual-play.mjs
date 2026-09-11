// Hide & Seek visual and repeated-play audit at T1-T10 on desktop and phone.
// Synthetic profiles and silent local media stubs only.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.join(import.meta.dirname, 'out', 'hide-seek-visual-play');
const APP_BASELINE = '3cb61a63b28beff0d9796fac49fd4ca85f6ece75';
const AUDIT_START = 'c1fa8b37eda1ed788254806e7c4d15d84b7b80d4';
const ROUNDS = 3;
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
    id: `hide-seek-visual-t${tier}`,
    name: `Hide Seek Test ${tier}`,
    birthday,
    color: '#4ECDC4',
    voice: 'girl',
    mascot: { id: 'dog' },
    tierOverrides: { 'peek-a-boo': tier },
    activitiesVisible: { 'peek-a-boo': true },
    features: {},
    youtube: [],
    achievements: {
      unlocked: {
        'peek-a-boo.first': { at: 1 },
        'peek-a-boo.milestone.bronze': { at: 1 },
        'peek-a-boo.milestone.silver': { at: 1 },
      },
      counters: { 'peek-a-boo': 299 },
      repeats: {},
      streak: { last: null, current: 0, best: 0 },
      xp: 2,
      rank: 'sprout',
    },
  };
  if (!sessionStorage.getItem('__hide_seek_visual_seeded')) {
    sessionStorage.clear();
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    localStorage.setItem('vb_pin', '1234');
    sessionStorage.setItem('__hide_seek_visual_seeded', '1');
  }
  try { HTMLMediaElement.prototype.play = () => Promise.resolve(); } catch {}
  try { if (speechSynthesis) speechSynthesis.speak = () => {}; } catch {}
  try { navigator.vibrate = () => true; } catch {}
  let state = 86413 + tier;
  Math.random = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

async function saveShot(page, rowId, label, screenshots) {
  const dir = path.join(OUT, 'screenshots');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${rowId.replaceAll(':', '-')}-${label}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: 'allow' });
  screenshots.push({ rowId, label, file });
}

async function clickCenter(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('control geometry unavailable');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function geometry(page) {
  return page.evaluate(() => {
    const visible = element => {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const rect = element => { const r = element.getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; };
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const stage = rect(document.querySelector('#stage'));
    const spots = [...document.querySelectorAll('.hiding-spot')].filter(visible).map(rect);
    const buttons = [...document.querySelectorAll('.seek-controls button')].filter(visible).map(rect);
    const chrome = [...document.querySelectorAll('.back-btn,.home-btn,#settingsGear,.settings-gear')].filter(visible).map(rect);
    return {
      stage,
      spotCount: spots.length,
      minTarget: Math.min(...spots.concat(buttons).map(value => Math.min(value.width, value.height))),
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      clippedSpots: spots.filter(value => value.left < stage.left - 1 || value.right > stage.right + 1 || value.top < stage.top - 1 || value.bottom > stage.bottom + 1).length,
      viewportClips: [stage, ...spots, ...buttons].filter(value => value.left < -1 || value.right > innerWidth + 1 || value.top < -1 || value.bottom > innerHeight + 1).length,
      chromeOverlap: Math.max(0, ...spots.concat(buttons).flatMap(item => chrome.map(control => overlap(item, control)))),
      titleVisible: visible(document.querySelector('.seek-heading h1')),
      hintVisible: visible(document.querySelector('#hint')),
      renderer: document.querySelector('#stage').dataset.renderer,
      phase: document.querySelector('#stage').dataset.phase,
    };
  });
}

async function progressSnapshot(page) {
  return page.evaluate(() => {
    const profile = JSON.parse(localStorage.getItem('vb_profiles') || '[]')[0] || {};
    const state = profile.achievements || {};
    return {
      counter: state.counters?.['peek-a-boo'] || 0,
      repeat: state.repeats?.['peek-a-boo'] || 0,
      recordCalls: window.__auditProgressCalls?.filter(call => call[0] === 'record').length || 0,
    };
  });
}

async function waitReady(page, selector) {
  await page.waitForFunction(selector => {
    const button = document.querySelector(selector);
    return button && !button.disabled && button.getAttribute('aria-disabled') === 'false' && getComputedStyle(button).visibility !== 'hidden';
  }, selector);
}

async function playRound(page, rowId, round, screenshots) {
  await waitReady(page, '#roundAction');
  await clickCenter(page, page.locator('#roundAction'));
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.phase === 'seek');
  const target = await page.waitForFunction(() => {
    const spot = document.querySelector('.hiding-spot.clue-peek,.hiding-spot.clue-rustle');
    return spot ? Number(spot.dataset.spot) + 1 : 0;
  }).then(handle => handle.jsonValue()).then(value => value - 1);
  const spotCount = await page.locator('.hiding-spot').count();
  const wrong = (target + 1) % spotCount;
  const before = await progressSnapshot(page);
  await clickCenter(page, page.locator(`.hiding-spot[data-spot="${wrong}"]`));
  await page.waitForFunction(index => document.querySelector(`.hiding-spot[data-spot="${index}"]`)?.classList.contains('empty'), wrong);
  if ((await progressSnapshot(page)).recordCalls !== before.recordCalls) throw new Error('wrong hiding spot awarded progress');
  if (round === 0) await saveShot(page, rowId, 'wrong', screenshots);
  await clickCenter(page, page.locator(`.hiding-spot[data-spot="${target}"]`));
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.phase === 'found');
  if ((await progressSnapshot(page)).recordCalls !== before.recordCalls + 1) throw new Error('correct hiding spot did not record exactly once');
  const animal = (await page.locator('#hint').textContent()).replace(/^You found /, '').replace(/!$/, '');
  if (round === 0) await saveShot(page, rowId, 'found', screenshots);
  await page.locator(`.hiding-spot[data-spot="${target}"]`).dispatchEvent('pointerdown', { pointerId: 71, pointerType: 'touch', bubbles: true });
  if ((await progressSnapshot(page)).recordCalls !== before.recordCalls + 1) throw new Error('found phase accepted duplicate progress');
  await waitReady(page, '#playAgain');
  await clickCenter(page, page.locator('#playAgain'));
  await page.waitForFunction(() => document.querySelector('#stage')?.dataset.phase === 'watch');
  return { target, wrong, animal, spotCount };
}

async function rewardGeometry(page) {
  return page.locator('.vb-celebrate').evaluate(notice => {
    const r = notice.getBoundingClientRect();
    const candidates = [...document.querySelectorAll('.seek-heading h1,#hint,#stage,.seek-controls button,.back-btn,.home-btn')].filter(element => {
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    }).map(element => {
      if (element.matches('.seek-heading h1,#hint')) {
        const range = document.createRange();
        range.selectNodeContents(element);
        return { element, box: range.getBoundingClientRect() };
      }
      return { element, box: element.getBoundingClientRect() };
    });
    const overlaps = candidates.filter(element => {
      const b = element.box;
      return Math.min(r.right, b.right) > Math.max(r.left, b.left) && Math.min(r.bottom, b.bottom) > Math.max(r.top, b.top);
    }).map(candidate => candidate.element.id || candidate.element.className || candidate.element.tagName);
    return {
      title: notice.querySelector('.cele-title')?.textContent?.trim() || '',
      hint: notice.querySelector('.cele-hint')?.textContent?.trim() || '',
      inViewport: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
      overlaps,
    };
  });
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
    h1{font-size:26px;margin:0 0 18px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
    figure{margin:0;background:#1f2937;border:1px solid #4b5563;border-radius:10px;padding:8px}
    img{display:block;width:100%;height:260px;object-fit:contain;background:#05070d;border-radius:6px}
    figcaption{font-size:13px;margin-top:7px;overflow-wrap:anywhere}
  </style><h1>${title}</h1><div class="grid">${cards}</div>`, { waitUntil: 'load' });
  await page.screenshot({ path: target, fullPage: true });
  await context.close();
}

async function runCell(browser, base, viewportName, viewport, tier, allScreenshots) {
  await health(base);
  const rowId = `peek-a-boo:T${tier}:${viewportName}`;
  const expectedSpots = tier >= 5 ? 3 : 2;
  const context = await browser.newContext({ ...viewport, viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'no-preference', serviceWorkers: 'block' });
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
  page.on('requestfailed', request => { if (request.url().startsWith(base)) failedLocalRequests.push(`${request.url()} ${request.failure()?.errorText || ''}`); });
  const screenshots = [];
  const geometrySamples = [];
  const rounds = [];
  let completedRounds = 0;
  let wrongRecoveries = 0;
  let freshRounds = 0;
  let midPlayNotices = 0;
  let reward = null;
  let postRewardPlayable = false;
  let fatal = null;

  try {
    await page.goto(base + '/games/peek-a-boo.html', { waitUntil: 'load', timeout: 20000 });
    await page.locator('.hiding-spot').first().waitFor({ timeout: 10000 });
    await page.evaluate(() => {
      window.__auditProgressCalls = [];
      const record = window.vbProgress.record;
      window.vbProgress.record = (...args) => { window.__auditProgressCalls.push(['record', ...args]); return record.apply(window.vbProgress, args); };
    });
    await saveShot(page, rowId, 'initial', screenshots);

    for (let round = 0; round < ROUNDS; round++) {
      if (await page.locator('.vb-celebrate.in').isVisible().catch(() => false)) midPlayNotices++;
      const sample = await geometry(page);
      geometrySamples.push(sample);
      if (sample.spotCount !== expectedSpots || sample.minTarget < 44 || sample.horizontalOverflow > 1 || sample.clippedSpots || sample.viewportClips || sample.chromeOverlap || !sample.titleVisible || !sample.hintVisible) {
        throw new Error(`bad Hide & Seek geometry: ${JSON.stringify(sample)}`);
      }
      rounds.push(await playRound(page, rowId, round, screenshots));
      completedRounds++;
      wrongRecoveries++;
      freshRounds++;
    }

    if (tier >= 3) {
      try {
        await page.locator('.vb-celebrate.in').waitFor({ timeout: 8000 });
      } catch (error) {
        throw new Error(`reward notice did not appear after persisted state ${JSON.stringify(await progressSnapshot(page))}: ${error.message}`);
      }
    } else {
      await page.waitForTimeout(2800);
      if (await page.locator('.vb-celebrate.in').isVisible().catch(() => false)) throw new Error('little-tier reward interrupted active play');
      await page.locator('.back-btn').click();
      await page.waitForURL(/\/games\/(index\.html)?$/);
      await page.locator('.vb-celebrate.in').waitFor({ timeout: 2000 });
    }
    reward = await rewardGeometry(page);
    await saveShot(page, rowId, 'reward', screenshots);
    const tappedNotice = await page.evaluate(() => {
      const notice = document.querySelector('.vb-celebrate.in');
      if (!notice) return false;
      notice.click();
      return true;
    });
    if (tappedNotice) {
      const beforeDismiss = Date.now();
      await page.locator('.vb-celebrate').waitFor({ state: 'detached', timeout: 1000 });
      reward.dismissMs = Date.now() - beforeDismiss;
      reward.dismissMode = 'tap';
    } else {
      reward.dismissMs = null;
      reward.dismissMode = 'automatic';
    }

    if (tier <= 2) {
      await page.goto(base + '/games/peek-a-boo.html', { waitUntil: 'load' });
      await page.locator('.hiding-spot').first().waitFor();
      await page.evaluate(() => {
        window.__auditProgressCalls = [];
        const record = window.vbProgress.record;
        window.vbProgress.record = (...args) => { window.__auditProgressCalls.push(['record', ...args]); return record.apply(window.vbProgress, args); };
      });
    }
    await playRound(page, rowId, ROUNDS, screenshots);
    postRewardPlayable = true;

    const progress = await progressSnapshot(page);
    if (progress.counter !== 299 + ROUNDS + 1) throw new Error(`counter ${progress.counter}, expected ${299 + ROUNDS + 1}`);
    if (progress.repeat !== 1) throw new Error(`reward state did not persist exactly once: ${JSON.stringify(progress)}`);
    if (!reward.title || reward.hint !== 'Saved in your gallery' || !reward.inViewport || (reward.dismissMs != null && reward.dismissMs > 1000)) throw new Error(`reward geometry/copy/dismissal failed: ${JSON.stringify(reward)}`);
    if (pageErrors.length || failedLocalRequests.length) throw new Error(`browser/runtime errors: ${JSON.stringify({ pageErrors, failedLocalRequests })}`);
  } catch (error) {
    fatal = `${error.name}: ${error.message}`;
    try { await saveShot(page, rowId, 'failure', screenshots); } catch {}
  } finally {
    allScreenshots.push(...screenshots.map(item => ({ ...item, viewport: viewportName, tier })));
    await context.close();
  }

  const animalSequence = rounds.map(round => round.animal);
  const repeatedPass = !fatal && completedRounds === ROUNDS && wrongRecoveries === ROUNDS && freshRounds === ROUNDS && postRewardPlayable && midPlayNotices === 0;
  return {
    id: rowId,
    activityId: 'peek-a-boo',
    route: '/games/peek-a-boo.html',
    tier,
    viewport: viewportName,
    checks: {
      score: na('Hide & Seek has no score mechanic; progress is one recorded find per completed round.'),
      rewards: !fatal && reward ? pass(`299→300 repeat reward persisted, stayed in view and dismissed by ${reward.dismissMode}${reward.dismissMs == null ? '' : ` in ${reward.dismissMs}ms`}`) : fail(fatal || 'reward path incomplete'),
      restart: !fatal && freshRounds === ROUNDS ? pass(`${freshRounds} Play again controls returned to fresh watch phases`) : fail(fatal || 'fresh-round restart incomplete'),
      long_repeated_play: repeatedPass ? pass(`${ROUNDS} complete wrong-to-correct rounds plus post-reward play; no mid-play notice`) : fail(fatal || 'repeated play incomplete'),
      visual_quality: blk(reward?.overlaps?.length
        ? `Automated geometry found reward overlaps (${reward.overlaps.join(', ')}); full renders require visual judgement.`
        : 'Automated geometry passed; full-page screenshots/contact sheets require visual inspection before ledger import.'),
    },
    expectedSpots,
    completedRounds,
    wrongRecoveries,
    freshRounds,
    midPlayNotices,
    postRewardPlayable,
    animalSequence,
    rounds,
    reward,
    blockedExternal,
    pageErrors,
    failedLocalRequests,
    geometrySamples,
    screenshotCount: screenshots.length,
    fatal,
  };
}

const ownedOutputRoot = path.join(ROOT, 'tests', 'e2e', 'out');
if (path.dirname(OUT) !== ownedOutputRoot || path.basename(OUT) !== 'hide-seek-visual-play') throw new Error(`refusing unsafe output cleanup: ${OUT}`);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, 'contact-sheets'), { recursive: true });
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
for (let attempt = 0; attempt < 100; attempt++) {
  try { await health(base); break; }
  catch { if (attempt === 99) throw new Error('local server did not start'); await new Promise(resolve => setTimeout(resolve, 100)); }
}

const browser = await chromium.launch();
const started = Date.now();
const jobs = [];
for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) if (SELECTED_VIEWPORTS.includes(viewportName)) for (const tier of SELECTED_TIERS) jobs.push({ viewportName, viewport, tier });
const rows = [];
const screenshots = [];
try {
  async function worker() {
    while (jobs.length) {
      const job = jobs.shift();
      const row = await runCell(browser, base, job.viewportName, job.viewport, job.tier, screenshots);
      rows.push(row);
      console.log(`${row.fatal ? 'FAIL' : 'PASS'} ${row.id} rounds=${row.completedRounds} wrong=${row.wrongRecoveries}${row.fatal ? ` ${row.fatal}` : ''}`);
    }
  }
  await Promise.all(Array.from({ length: 2 }, worker));
  for (const viewportName of SELECTED_VIEWPORTS) {
    const items = screenshots.filter(item => item.viewport === viewportName);
    await createContactSheet(browser, items, path.join(OUT, 'contact-sheets', `${viewportName}.png`), `Hide & Seek ${viewportName} — T1-T10 repeated play`);
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
  hideSeekSha256: sha256(path.join(ROOT, 'js', 'hide-seek.js')),
  base,
  generatedAt: new Date().toISOString(),
  durationSec: Math.round((Date.now() - started) / 1000),
  roundsPerRow: ROUNDS,
  mediaProof: 'Synthetic local playback stubs only; no audible or provider claim.',
  counts,
  contactSheets: SELECTED_VIEWPORTS.map(name => `${name}.png`),
  rows,
};
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...counts, screenshots: screenshots.length, durationSec: report.durationSec }));
if (rows.length !== SELECTED_TIERS.length * SELECTED_VIEWPORTS.length || counts.fail || rows.some(row => row.pageErrors.length || row.failedLocalRequests.length)) process.exitCode = 1;
