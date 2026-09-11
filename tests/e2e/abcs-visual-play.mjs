// ABC Quest T1-T10 game-play, persistence, reward, and visual audit.
// Browser-driven pointer/touch emulation does not prove a child's physical touch.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(import.meta.dirname, 'out', 'abcs-visual-play');
const VIEWPORTS = {
  desktop: { width: 1280, height: 900, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
  'short-phone': { width: 320, height: 568, isMobile: true, hasTouch: true },
};
const ALL_TIERS = [1,2,3,4,5,6,7,8,9,10];
const tiers = process.env.TIERS ? process.env.TIERS.split(',').map(Number) : ALL_TIERS;
const viewportNames = process.env.VIEWPORTS ? process.env.VIEWPORTS.split(',') : ['desktop', 'phone'];
for (const tier of tiers) if (!ALL_TIERS.includes(tier)) throw new Error(`unknown tier ${tier}`);
for (const name of viewportNames) if (!VIEWPORTS[name]) throw new Error(`unknown viewport ${name}`);

const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

function seed({ tier, bday }) {
  let randomState = (0x9e3779b9 ^ tier) >>> 0;
  Math.random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const profile = {
    id: `abcs-t${tier}`, name: 'ABC Test', birthday: bday,
    color: '#4ECDC4', voice: 'girl', mascot: { id: 'dog' },
    tierOverrides: { abcs: tier }, activitiesVisible: { abcs: true },
    features: { abcs: { wordHints: tier >= 4 } },
    achievements: {
      unlocked: { 'abcs.first': { at: 1 }, 'abcs.milestone.bronze': { at: 1 } },
      counters: { abcs: 119 }, repeats: {}, streak: { last: null, current: 0, best: 0 },
      xp: 2, rank: 'sprout',
    },
  };
  if (!sessionStorage.__abcsSeed) {
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    sessionStorage.__abcsSeed = '1';
  }
  try { HTMLMediaElement.prototype.play = function () { return Promise.resolve(); }; } catch {}
  try { navigator.vibrate = () => true; } catch {}
}

async function saveShot(page, rowId, label, screenshots) {
  const directory = path.join(OUT, 'screenshots');
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${rowId.replaceAll(':', '-')}-${String(screenshots.length + 1).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  screenshots.push({ rowId, label, file });
}

async function progressState(page) {
  return page.evaluate(() => {
    const profile = JSON.parse(localStorage.vb_profiles || '[]')[0] || {};
    return {
      counter: profile.achievements?.counters?.abcs || 0,
      repeat: profile.achievements?.repeats?.abcs || 0,
      mastery: !!profile.achievements?.unlocked?.['abcs.mastery'],
    };
  });
}

async function roundState(page) {
  return page.locator('#body').evaluate(body => ({
    round: Number(body.dataset.round), mode: body.dataset.mode,
    prompt: document.querySelector('#prompt')?.textContent.trim() || '',
    choices: document.querySelectorAll('.abc-choice').length,
    answers: document.querySelectorAll('.abc-choice[data-answer="true"]').length,
    hud: [...document.querySelectorAll('.hud-pill')].map(node => node.textContent.trim()),
  }));
}

function expectedShape(tier, mode) {
  if (mode === 'find-letter') return { choices: tier === 1 ? 2 : 3, answers: 1 };
  if (mode === 'starts-with') return { choices: tier === 3 ? 3 : 4, answers: 1 };
  if (mode === 'first-letter') return { choices: tier >= 10 ? 6 : tier >= 8 ? 5 : 4, answers: 1 };
  if (mode === 'match-case') return { choices: tier >= 10 ? 8 : tier === 9 ? 7 : 6, answers: 1 };
  if (mode === 'sound-sort') return { choices: tier >= 8 ? 8 : tier === 7 ? 7 : 6, answers: 3 };
  return { choices: -1, answers: -1 };
}

async function measureGeometry(page) {
  await page.waitForTimeout(80);
  return page.evaluate(() => {
    const visible = node => {
      const style = getComputedStyle(node); const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const rects = selector => [...document.querySelectorAll(selector)].filter(visible).map(node => {
      const rect = node.getBoundingClientRect();
      return { left:rect.left, top:rect.top, right:rect.right, bottom:rect.bottom, width:rect.width, height:rect.height };
    });
    const choices = rects('.abc-choice');
    const nav = rects('.back-btn,.home-btn,#gameSettingsGear,.settings-gear');
    const overlap = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return {
      minTarget: choices.length ? Math.min(...choices.map(rect => Math.min(rect.width, rect.height))) : 0,
      minNavTarget: nav.length ? Math.min(...nav.map(rect => Math.min(rect.width, rect.height))) : 0,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      clippedChoices: choices.filter(rect => rect.left < -1 || rect.top < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1).length,
      clippedNav: nav.filter(rect => rect.left < -1 || rect.top < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1).length,
      navContentOverlap: nav.some(a => choices.some(b => overlap(a,b))),
    };
  });
}

async function solveRound(page, { wrongFirst = false, rapid = false } = {}) {
  const before = await progressState(page);
  const beforeRound = Number(await page.locator('#body').getAttribute('data-round'));
  const wrong = page.locator('.abc-choice[data-answer="false"]').first();
  let wrongRejected = true;
  if (wrongFirst) {
    await wrong.dispatchEvent('pointerdown');
    await page.waitForTimeout(50);
    wrongRejected = await wrong.evaluate(node => node.classList.contains('wrong'));
    const afterWrong = await progressState(page);
    wrongRejected = wrongRejected && afterWrong.counter === before.counter;
  }
  const answers = page.locator('.abc-choice[data-answer="true"]');
  const answerCount = await answers.count();
  for (let index = 0; index < answerCount; index++) {
    await answers.nth(index).dispatchEvent('pointerdown');
    if (rapid && index === 0) {
      await answers.nth(index).dispatchEvent('pointerdown');
      await answers.nth(index).dispatchEvent('pointerdown');
    }
  }
  await page.waitForFunction(expected => {
    const profile = JSON.parse(localStorage.vb_profiles || '[]')[0] || {};
    return (profile.achievements?.counters?.abcs || 0) === expected;
  }, before.counter + 1, { timeout: 2500 });
  const after = await progressState(page);
  return { beforeRound, wrongRejected, exactProgress: after.counter === before.counter + 1 };
}

async function waitNextRound(page, previousRound) {
  await page.waitForFunction(round => Number(document.querySelector('#body')?.dataset.round) > round, previousRound, { timeout: 3000 });
  await page.locator('.abc-choice').first().waitFor();
}

async function inspectReward(page, { tier, base, rowId, label, expectedTitle, screenshots }) {
  if (tier <= 2) {
    await page.locator('.back-btn').click();
    await page.waitForURL(/\/learning\/(index\.html)?$/);
  }
  const modal = page.locator('.vb-celebrate.in');
  await modal.waitFor({ timeout: 5000 });
  await page.waitForTimeout(180);
  const reward = await modal.evaluate(element => {
    const visible = node => {
      const style = getComputedStyle(node); const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const box = node => { const r = node.getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom }; };
    const overlap = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const rewardBox = box(element);
    const covered = [...document.querySelectorAll('.game-title,.abc-hud,#prompt,#clue,#choices,#feedback,.back-btn,.home-btn,#gameSettingsGear,.settings-gear')]
      .filter(node => node !== element && visible(node) && overlap(rewardBox, box(node)))
      .map(node => node.id || node.className);
    const rect = element.getBoundingClientRect();
    return {
      title: element.querySelector('.cele-title')?.textContent?.trim() || '',
      hint: element.querySelector('.cele-hint')?.textContent?.trim() || '',
      inViewport: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
      covered,
    };
  });
  await saveShot(page, rowId, label, screenshots);
  await modal.click();
  await modal.waitFor({ state: 'detached', timeout: 1600 });
  if (tier <= 2) await page.goto(base + '/learning/abcs.html', { waitUntil: 'load' });
  const restored = tier <= 2 || await page.locator('#choices').evaluate(node => getComputedStyle(node).visibility !== 'hidden');
  return { ...reward, pass: reward.title === expectedTitle && reward.hint === 'Saved in your gallery' && reward.inViewport && !reward.covered.length && restored };
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
  const rowId = `abcs:T${tier}:${viewportName}`;
  const context = await browser.newContext({ viewport, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort('blockedbyclient'));
  await context.addInitScript(seed, { tier, bday: birthday(tier) });
  const page = await context.newPage();
  const pageErrors = [], failedLocalRequests = [], expectedMediaAborts = [], screenshots = [], modes = [], shapes = [], geometry = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => {
    if (!request.url().startsWith(base)) return;
    const detail = `${request.url()} ${request.failure()?.errorText || ''}`;
    if (request.resourceType() === 'media' && request.failure()?.errorText === 'net::ERR_ABORTED') expectedMediaAborts.push(detail);
    else failedLocalRequests.push(detail);
  });
  let fatal = null, repeatReward = null, masteryReward = null, wrongRejected = false, rapidExact = false, reloadRecovered = false;
  let counterBefore = null, final = null;
  try {
    await page.goto(base + '/learning/abcs.html', { waitUntil: 'load' });
    await page.locator('.abc-choice').first().waitFor();
    counterBefore = (await progressState(page)).counter;
    const initial = await roundState(page);
    modes.push(initial.mode); shapes.push(initial); geometry.push(await measureGeometry(page));
    await saveShot(page, rowId, 'initial', screenshots);
    const first = await solveRound(page, { wrongFirst:true, rapid:true });
    wrongRejected = first.wrongRejected;
    rapidExact = first.exactProgress;
    repeatReward = await inspectReward(page, { tier, base, rowId, label:'repeat-reward', expectedTitle:'ABCs Star', screenshots });

    // The production UI intentionally spaces separate award notices by 30s.
    // Clear only this synthetic browser session's timestamp before reloading so
    // the later, distinct mastery notice can be inspected without a 30s/row wait.
    await page.evaluate(() => sessionStorage.removeItem('vb_award_last_shown'));
    await page.reload({ waitUntil: 'load' });
    await page.locator('.abc-choice').first().waitFor();
    reloadRecovered = (await progressState(page)).counter === counterBefore + 1;
    for (let index = 0; index < 5; index++) {
      const current = await roundState(page);
      modes.push(current.mode); shapes.push(current);
      const solved = await solveRound(page, { wrongFirst:true });
      if (!solved.exactProgress) throw new Error(`round ${index + 1} did not record exactly once`);
      if (index < 4) await waitNextRound(page, solved.beforeRound);
    }
    masteryReward = await inspectReward(page, { tier, base, rowId, label:'mastery-reward', expectedTitle:'Alphabet Ace', screenshots });

    await page.reload({ waitUntil: 'load' });
    await page.locator('.abc-choice').first().waitFor();
    const recovery = await solveRound(page);
    reloadRecovered = reloadRecovered && recovery.exactProgress;
    geometry.push(await measureGeometry(page));
    await saveShot(page, rowId, 'recovery', screenshots);
    final = await progressState(page);
    if (pageErrors.length || failedLocalRequests.length) throw new Error(`browser/runtime request failure ${JSON.stringify({ pageErrors, failedLocalRequests })}`);
  } catch (error) {
    fatal = `${error.name}: ${error.message}`;
    try { await saveShot(page, rowId, 'failure', screenshots); } catch {}
  } finally {
    allScreenshots.push(...screenshots.map(item => ({ ...item, viewport: viewportName, tier })));
    await context.close();
  }
  const shapePass = shapes.length === 6 && shapes.every(shape => {
    const expected = expectedShape(tier, shape.mode);
    return shape.prompt && shape.choices === expected.choices && shape.answers === expected.answers && shape.hud.length === 3;
  });
  const expectedModes = tier <= 2 ? ['find-letter'] : tier <= 4 ? ['starts-with'] : tier === 5 ? ['first-letter'] : tier <= 7 ? ['sound-sort'] : ['sound-sort','first-letter','match-case'];
  const modePass = expectedModes.every(mode => modes.includes(mode));
  const geometryPass = geometry.length === 2 && geometry.every(sample => sample.minTarget >= 44 && sample.minNavTarget >= 44 && sample.horizontalOverflow <= 1 && !sample.clippedChoices && !sample.clippedNav && !sample.navContentOverlap);
  const exactFinal = final && counterBefore != null && final.counter === counterBefore + 7 && final.repeat === 1 && final.mastery;
  return {
    id:rowId, tier, viewport:viewportName,
    checks: {
      input: !fatal && wrongRejected && rapidExact ? 'PASS' : 'FAIL',
      progression: !fatal && shapePass && modePass && exactFinal ? 'PASS' : 'FAIL',
      rewards: !fatal && repeatReward?.pass && masteryReward?.pass ? 'PASS' : 'FAIL',
      restart: !fatal && reloadRecovered ? 'PASS' : 'FAIL',
      long_repeated_play: !fatal && exactFinal ? 'PASS' : 'FAIL',
      visual_quality: !fatal && geometryPass ? 'PASS' : 'FAIL',
    },
    counterBefore, final, modes, shapes, geometry, wrongRejected, rapidExact, reloadRecovered,
    repeatReward, masteryReward, pageErrors, failedLocalRequests, expectedMediaAborts,
    screenshotCount:screenshots.length, fatal,
  };
}

if (path.dirname(OUT) !== path.join(ROOT, 'tests', 'e2e', 'out') || path.basename(OUT) !== 'abcs-visual-play') throw new Error(`refusing unsafe output cleanup: ${OUT}`);
rmSync(OUT, { recursive:true, force:true });
mkdirSync(path.join(OUT, 'contact-sheets'), { recursive:true });
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], { cwd:ROOT, env:{ ...process.env, PORT:String(port) }, stdio:'ignore' });
for (let attempt = 0; attempt < 100; attempt++) {
  try { await health(base); break; }
  catch { if (attempt === 99) throw new Error('local server did not start'); await sleep(100); }
}
const browser = await chromium.launch();
const screenshots = [], rows = [];
try {
  const jobs = [];
  for (const viewportName of viewportNames) for (const tier of tiers) jobs.push({ viewportName, viewport:VIEWPORTS[viewportName], tier });
  async function worker() {
    while (jobs.length) {
      const job = jobs.shift();
      const row = await runCell(browser, base, job.viewportName, job.viewport, job.tier, screenshots);
      rows.push(row);
      console.log(`${row.fatal ? 'ERROR' : 'DONE'} ${row.id}${row.fatal ? ' ' + row.fatal : ''}`);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  for (const viewportName of viewportNames) {
    const items = screenshots.filter(item => item.viewport === viewportName);
    if (items.length) await createContactSheet(browser, items, path.join(OUT, 'contact-sheets', `${viewportName}.png`), `ABC Quest ${viewportName}`);
  }
} finally {
  await browser.close();
  server.kill();
}

rows.sort((a,b) => a.id.localeCompare(b.id));
const counts = { rows:rows.length, pass:0, fail:0 };
for (const row of rows) for (const status of Object.values(row.checks)) counts[status.toLowerCase()]++;
const report = {
  generatedAt:new Date().toISOString(), abcsSha256:sha256(path.join(ROOT, 'learning', 'abcs.html')),
  evidenceBoundary:'Browser-driven pointer/touch emulation, silent local media stubs, and inspected renders; no physical child-touch or human-audible voice-quality claim.',
  counts, screenshots:screenshots.length, rows,
};
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...counts, screenshots:screenshots.length }));
if (rows.length !== tiers.length * viewportNames.length || rows.some(row => row.fatal || Object.values(row.checks).includes('FAIL') || row.pageErrors.length || row.failedLocalRequests.length)) process.exitCode = 1;
