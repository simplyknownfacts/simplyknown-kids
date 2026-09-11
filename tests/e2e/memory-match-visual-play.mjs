// Memory Match visual and repeated complete-board audit at T1-T10 on desktop
// and phone. Synthetic profiles and silent local media stubs only.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.join(import.meta.dirname, 'out', 'memory-match-visual-play');
const APP_BASELINE = 'd92e248a45507a0be8c7fe7dd9274924f17c07cf';
const AUDIT_START = '80f026ff45fe04591e35abe06a9e7a0929e27e99';
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

function pairsForTier(tier) {
  return tier <= 2 ? 2 : tier <= 3 ? 3 : tier <= 4 ? 4 : tier <= 6 ? 6 : tier <= 8 ? 8 : tier <= 9 ? 10 : 12;
}

function initScript({ tier, birthday }) {
  const profile = {
    id: `memory-visual-t${tier}`,
    name: `Memory Test ${tier}`,
    birthday,
    color: '#7c5cff',
    voice: 'girl',
    mascot: { id: 'dog' },
    tierOverrides: { 'memory-match': tier },
    activitiesVisible: { 'memory-match': true },
    features: {},
    youtube: [],
    achievements: {
      unlocked: {
        'memory-match.first': { at: 1 },
        'memory-match.milestone.bronze': { at: 1 },
      },
      counters: { 'memory-match': 119 },
      repeats: {},
      streak: { last: null, current: 0, best: 0 },
      xp: 2,
      rank: 'sprout',
    },
  };
  if (!sessionStorage.getItem('__memory_visual_play_seeded')) {
    sessionStorage.clear();
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    localStorage.setItem('vb_pin', '1234');
    sessionStorage.setItem('__memory_visual_play_seeded', '1');
  }
  try { HTMLMediaElement.prototype.play = () => Promise.resolve(); } catch {}
  try { if (speechSynthesis) speechSynthesis.speak = () => {}; } catch {}
  try { navigator.vibrate = () => true; } catch {}
  let state = 97531 + tier;
  Math.random = () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

async function clickCenter(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('card geometry unavailable');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function saveShot(page, rowId, label, screenshots) {
  const dir = path.join(OUT, 'screenshots');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${rowId.replaceAll(':', '-')}-${label}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: 'allow' });
  screenshots.push({ rowId, label, file });
}

async function geometry(page) {
  return page.evaluate(() => {
    const visible = element => {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const cards = [...document.querySelectorAll('.mm-card')].filter(visible);
    const controls = [...document.querySelectorAll('.back-btn,.home-btn,#settingsGear,.settings-gear')].filter(visible);
    const rect = element => { const r = element.getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; };
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    let chromeOverlap = 0;
    for (const card of cards) for (const control of controls) chromeOverlap = Math.max(chromeOverlap, overlap(rect(card), rect(control)));
    const cardRects = cards.map(rect);
    const stage = document.querySelector('#stage');
    return {
      cardCount: cards.length,
      minTarget: Math.min(...cardRects.map(value => Math.min(value.width, value.height))),
      horizontalClip: cardRects.filter(value => value.left < -1 || value.right > innerWidth + 1).length,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      chromeOverlap,
      titleVisible: !!document.querySelector('.title') && visible(document.querySelector('.title')),
      hintVisible: !!document.querySelector('#hint') && visible(document.querySelector('#hint')),
      boardScrolls: stage.scrollHeight > stage.clientHeight,
      stageScrollOverflow: Math.max(0, stage.scrollHeight - stage.clientHeight),
      verticalOffscreen: cardRects.filter(value => value.top < -1 || value.bottom > innerHeight + 1).length,
      maxBottomOverflow: Math.max(0, ...cardRects.map(value => value.bottom - innerHeight)),
      columns: getComputedStyle(document.querySelector('#board')).gridTemplateColumns.split(' ').length,
    };
  });
}

async function progressSnapshot(page) {
  return page.evaluate(() => {
    const profile = JSON.parse(localStorage.getItem('vb_profiles') || '[]')[0] || {};
    const state = profile.achievements || {};
    return {
      counter: state.counters?.['memory-match'] || 0,
      repeat: state.repeats?.['memory-match'] || 0,
      mastery: !!state.unlocked?.['memory-match.mastery'],
      recordCalls: window.__auditProgressCalls?.filter(call => call[0] === 'record').length || 0,
      masteryCalls: window.__auditProgressCalls?.filter(call => call[0] === 'mastery').length || 0,
    };
  });
}

async function cardMap(page) {
  return page.locator('.mm-card').evaluateAll(cards => {
    const map = {};
    cards.forEach((card, index) => (map[card.dataset.face] ||= []).push(index));
    return map;
  });
}

async function wrongThenRecover(page, rowId, capture, screenshots) {
  const cards = page.locator('.mm-card');
  const faces = await cards.evaluateAll(nodes => nodes.map(node => node.dataset.face));
  const second = faces.findIndex(face => face !== faces[0]);
  if (second < 1) throw new Error('deck did not contain two different faces');
  const before = await progressSnapshot(page);
  await clickCenter(page, cards.nth(0));
  await clickCenter(page, cards.nth(second));
  await page.waitForFunction(([a, b]) => {
    const cards = document.querySelectorAll('.mm-card');
    return cards[a]?.classList.contains('wrong') && cards[b]?.classList.contains('wrong');
  }, [0, second]);
  if (capture) await saveShot(page, rowId, 'wrong', screenshots);
  if ((await progressSnapshot(page)).recordCalls !== before.recordCalls) throw new Error('wrong pair awarded progress');
  await page.waitForFunction(([a, b]) => {
    const cards = document.querySelectorAll('.mm-card');
    return cards[a] && cards[b] && !cards[a].classList.contains('up') && !cards[b].classList.contains('up');
  }, [0, second], { timeout: 1800 });
}

async function completeBoard(page, rowId, round, screenshots) {
  const map = await cardMap(page);
  const pairs = Object.values(map);
  const expected = pairs.length;
  const before = await progressSnapshot(page);
  for (const indexes of pairs) {
    if (indexes.length !== 2) throw new Error(`face appeared ${indexes.length} times`);
    const cards = page.locator('.mm-card');
    await clickCenter(page, cards.nth(indexes[0]));
    await clickCenter(page, cards.nth(indexes[1]));
    await page.waitForFunction(indexes => indexes.every(index => document.querySelectorAll('.mm-card')[index]?.classList.contains('matched')), indexes);
  }
  const after = await progressSnapshot(page);
  if (after.recordCalls - before.recordCalls !== expected) throw new Error(`board recorded ${after.recordCalls - before.recordCalls}, expected ${expected}`);
  const first = page.locator('.mm-card').first();
  await first.dispatchEvent('pointerdown', { pointerId: 71, pointerType: 'touch', bubbles: true });
  if ((await progressSnapshot(page)).recordCalls !== after.recordCalls) throw new Error('completed board accepted duplicate input');
  await page.waitForFunction(count => document.querySelectorAll('.mm-card.matched').length === count * 2 && document.querySelector('#hint')?.textContent.includes('You found them all'), expected);
  if (round === 0) {
    // Let the last card's flip transition settle so the evidence captures the stable completed board.
    await page.waitForTimeout(400);
    await saveShot(page, rowId, 'complete', screenshots);
  }
  return expected;
}

async function waitFreshBoard(page, oldCard, expectedCards) {
  await page.waitForFunction(node => !node.isConnected, oldCard, { timeout: 3200 });
  await page.waitForFunction(count => document.querySelectorAll('.mm-card').length === count && !document.querySelector('.mm-card.up'), expectedCards);
}

async function rewardGeometry(page) {
  return page.locator('.vb-celebrate').evaluate(notice => {
    const r = notice.getBoundingClientRect();
    const play = [...document.querySelectorAll('.mm-card,.title,#hint,.back-btn,.home-btn')].filter(element => {
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    });
    const overlaps = play.filter(element => {
      const b = element.getBoundingClientRect();
      return Math.min(r.right, b.right) > Math.max(r.left, b.left) && Math.min(r.bottom, b.bottom) > Math.max(r.top, b.top);
    }).map(element => element.className || element.id || element.tagName);
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
  const rowId = `memory-match:T${tier}:${viewportName}`;
  const pairs = pairsForTier(tier);
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
  let completedRounds = 0;
  let totalRecords = 0;
  let wrongRecoveries = 0;
  let freshBoards = 0;
  let midPlayNotices = 0;
  let reward = null;
  let titleOverlap = false;
  let postRewardPlayable = false;
  let fatal = null;

  try {
    await page.goto(base + '/games/memory-match.html', { waitUntil: 'load', timeout: 20000 });
    await page.locator('.mm-card').first().waitFor({ timeout: 10000 });
    await page.evaluate(() => {
      window.__auditProgressCalls = [];
      const record = window.vbProgress.record;
      const mastery = window.vbProgress.mastery;
      window.vbProgress.record = (...args) => { window.__auditProgressCalls.push(['record', ...args]); return record.apply(window.vbProgress, args); };
      window.vbProgress.mastery = (...args) => { window.__auditProgressCalls.push(['mastery', ...args]); return mastery.apply(window.vbProgress, args); };
    });
    await saveShot(page, rowId, 'initial', screenshots);

    for (let round = 0; round < ROUNDS; round++) {
      if (await page.locator('.vb-celebrate.in').isVisible().catch(() => false)) midPlayNotices++;
      const sample = await geometry(page);
      geometrySamples.push(sample);
      if (sample.cardCount !== pairs * 2 || sample.minTarget < 44 || sample.horizontalClip || sample.horizontalOverflow > 1 || sample.chromeOverlap || !sample.titleVisible || !sample.hintVisible) {
        throw new Error(`bad board geometry: ${JSON.stringify(sample)}`);
      }
      await wrongThenRecover(page, rowId, round === 0, screenshots);
      wrongRecoveries++;
      const oldCard = await page.locator('.mm-card').first().elementHandle();
      totalRecords += await completeBoard(page, rowId, round, screenshots);
      completedRounds++;
      await waitFreshBoard(page, oldCard, pairs * 2);
      freshBoards++;
    }

    if (tier >= 3) {
      await page.locator('.vb-celebrate.in').waitFor({ timeout: 4500 });
    } else {
      await page.waitForTimeout(2800);
      if (await page.locator('.vb-celebrate.in').isVisible().catch(() => false)) throw new Error('little-tier reward interrupted active play');
      await page.locator('.back-btn').click();
      await page.waitForURL(/\/games\/(index\.html)?$/);
      await page.locator('.vb-celebrate.in').waitFor({ timeout: 2000 });
    }
    reward = await rewardGeometry(page);
    await saveShot(page, rowId, 'reward', screenshots);
    const beforeDismiss = Date.now();
    await page.locator('.vb-celebrate').click();
    await page.locator('.vb-celebrate').waitFor({ state: 'detached', timeout: 1000 });
    reward.dismissMs = Date.now() - beforeDismiss;
    titleOverlap = reward.overlaps.includes('title');
    const nonTitleOverlaps = reward.overlaps.filter(name => name !== 'title');

    if (tier <= 2) {
      await page.goto(base + '/games/memory-match.html', { waitUntil: 'load' });
      await page.locator('.mm-card').first().waitFor();
      await page.evaluate(() => {
        window.__auditProgressCalls = [];
        const record = window.vbProgress.record;
        window.vbProgress.record = (...args) => { window.__auditProgressCalls.push(['record', ...args]); return record.apply(window.vbProgress, args); };
      });
    }
    const firstPair = Object.values(await cardMap(page))[0];
    await clickCenter(page, page.locator('.mm-card').nth(firstPair[0]));
    await clickCenter(page, page.locator('.mm-card').nth(firstPair[1]));
    await page.waitForFunction(indexes => indexes.every(index => document.querySelectorAll('.mm-card')[index]?.classList.contains('matched')), firstPair);
    postRewardPlayable = true;
    totalRecords++;

    const progress = await progressSnapshot(page);
    if (progress.counter !== 119 + totalRecords) throw new Error(`counter ${progress.counter}, expected ${119 + totalRecords}`);
    if (progress.repeat !== 1 || !progress.mastery) throw new Error(`reward state did not persist exactly once: ${JSON.stringify(progress)}`);
    if (!reward.title || reward.hint !== 'Saved in your gallery' || !reward.inViewport || nonTitleOverlaps.length || reward.dismissMs > 1000) {
      throw new Error(`reward geometry/copy/dismissal failed: ${JSON.stringify(reward)}`);
    }
    if (pageErrors.length || failedLocalRequests.length) throw new Error(`browser/runtime errors: ${JSON.stringify({ pageErrors, failedLocalRequests })}`);
  } catch (error) {
    fatal = `${error.name}: ${error.message}`;
    try { await saveShot(page, rowId, 'failure', screenshots); } catch {}
  } finally {
    allScreenshots.push(...screenshots.map(item => ({ ...item, viewport: viewportName, tier })));
    await context.close();
  }

  const repeatedPass = !fatal && completedRounds === ROUNDS && wrongRecoveries === ROUNDS && freshBoards === ROUNDS && postRewardPlayable && midPlayNotices === 0;
  return {
    id: rowId,
    activityId: 'memory-match',
    route: '/games/memory-match.html',
    tier,
    viewport: viewportName,
    checks: {
      input: repeatedPass ? pass(`${totalRecords} physical pair completions recorded through real card controls`) : fail(fatal || 'input path incomplete'),
      progression: repeatedPass ? pass(`${completedRounds} complete boards advanced to fresh decks; exact pair progress persisted`) : fail(fatal || 'progression incomplete'),
      score: na('Memory Match has no score mechanic; its visible progress is matched pairs per board.'),
      rewards: !fatal && reward ? pass(`119→120 repeat reward plus mastery persisted, stayed clear and dismissed in ${reward.dismissMs}ms`) : fail(fatal || 'reward path incomplete'),
      restart: !fatal && freshBoards === ROUNDS ? pass(`${freshBoards} completed boards automatically reset to full fresh playable decks`) : fail(fatal || 'fresh-board restart incomplete'),
      long_repeated_play: repeatedPass ? pass(`${ROUNDS} complete boards plus post-reward pair; wrong recovery every board; no reload-only credit or mid-play notice`) : fail(fatal || 'repeated play incomplete'),
      visual_quality: blk(titleOverlap
        ? 'Automated geometry found a phone reward/title overlap candidate; full-page screenshots/contact sheets require visual confirmation before ledger import.'
        : 'Automated geometry passed; full-page screenshots/contact sheets require visual inspection before ledger import.'),
    },
    expectedPairs: pairs,
    completedRounds,
    totalRecords,
    wrongRecoveries,
    freshBoards,
    midPlayNotices,
    postRewardPlayable,
    reward,
    titleOverlap,
    blockedExternal,
    pageErrors,
    failedLocalRequests,
    geometrySamples,
    screenshotCount: screenshots.length,
    fatal,
  };
}

const ownedOutputRoot = path.join(ROOT, 'tests', 'e2e', 'out');
if (path.dirname(OUT) !== ownedOutputRoot || path.basename(OUT) !== 'memory-match-visual-play') throw new Error(`refusing unsafe output cleanup: ${OUT}`);
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
      console.log(`${row.fatal ? 'FAIL' : 'PASS'} ${row.id} boards=${row.completedRounds} records=${row.totalRecords}${row.fatal ? ` ${row.fatal}` : ''}`);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  for (const viewportName of SELECTED_VIEWPORTS) {
    const items = screenshots.filter(item => item.viewport === viewportName);
    await createContactSheet(browser, items, path.join(OUT, 'contact-sheets', `${viewportName}.png`), `Memory Match ${viewportName} — T1-T10 repeated complete play`);
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
  memoryMatchSha256: sha256(path.join(ROOT, 'games', 'memory-match.html')),
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
