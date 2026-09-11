// Count Along T1-T10 phone/desktop repeated-play and visual audit.
// Browser-driven clicks/touches and silent media stubs do not prove a child's
// physical touch or the human-audible quality of prerecorded voice clips.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(import.meta.dirname, 'out', 'count-along-visual-play');
const AUDIT_START = '789d20f844966358138121794b0b67bee13aa91a';
const VIEWPORTS = {
  desktop: { width: 1280, height: 900, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
};
const PROBE_VIEWPORTS = {
  'short-phone': { width: 320, height: 568, isMobile: true, hasTouch: true },
  tablet: { width: 820, height: 1180, isMobile: true, hasTouch: true },
};
const TIERS = [1,2,3,4,5,6,7,8,9,10];
const SELECTED_TIERS = process.env.TIERS ? process.env.TIERS.split(',').map(Number) : TIERS;
const SELECTED_VIEWPORTS = process.env.VIEWPORTS ? process.env.VIEWPORTS.split(',') : Object.keys(VIEWPORTS);
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

function init({ tier, bday, probe = false, quiz = false }) {
  const profile = {
    id: `count-t${tier}`,
    name: 'Count Test',
    birthday: bday,
    color: '#4ECDC4',
    voice: 'girl',
    mascot: { id: 'dog' },
    tierOverrides: { 'count-along': tier },
    activitiesVisible: { 'count-along': true },
    features: { 'count-along': { quizMode: quiz } },
    achievements: {
      unlocked: {
        'count-along.first': { at: 1 },
        'count-along.milestone.bronze': { at: 1 },
      },
      counters: { 'count-along': probe ? 0 : 119 },
      repeats: {},
      streak: { last: null, current: 0, best: 0 },
      xp: 2,
      rank: 'sprout',
    },
  };
  if (!sessionStorage.__countSeed) {
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    sessionStorage.__countSeed = '1';
  }
  if (sessionStorage.getItem('__countQuizMode') === '1') {
    const profiles = JSON.parse(localStorage.getItem('vb_profiles') || '[]');
    if (profiles[0]) {
      profiles[0].features ||= {};
      profiles[0].features['count-along'] = { quizMode: true };
      localStorage.setItem('vb_profiles', JSON.stringify(profiles));
    }
  }
  let state = (0x6d2b79f5 + tier * 977) >>> 0;
  const seeded = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000);
  window.__countRandom = [];
  Math.random = () => window.__countRandom.length ? window.__countRandom.shift() : seeded();
  window.__silentMediaPlays = 0;
  try { HTMLMediaElement.prototype.play = function () { window.__silentMediaPlays++; return Promise.resolve(); }; } catch {}
  try { navigator.vibrate = () => true; } catch {}
}

async function saveShot(page, rowId, label, screenshots, fullPage = false) {
  const directory = path.join(OUT, 'screenshots');
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${rowId.replaceAll(':', '-')}-${String(screenshots.length + 1).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: file, fullPage });
  screenshots.push({ rowId, label, file });
}

async function profileState(page) {
  return page.evaluate(() => {
    const profile = JSON.parse(localStorage.vb_profiles || '[]')[0] || {};
    return {
      counter: profile.achievements?.counters?.['count-along'] || 0,
      repeat: profile.achievements?.repeats?.['count-along'] || 0,
      mastery: !!profile.achievements?.unlocked?.['count-along.mastery'],
    };
  });
}

async function setQuiz(page, enabled) {
  return page.evaluate(value => {
    const profile = getActiveProfile();
    if (!profile) throw new Error('active profile missing while switching Count Along mode');
    setProfileFeature(profile.id, 'count-along', 'quizMode', value);
    sessionStorage.setItem('__countQuizMode', value ? '1' : '0');
    return getProfileFeature(getActiveProfile(), 'count-along', 'quizMode') === value;
  }, enabled);
}

async function queueNextAdvancedMode(page, mode) {
  await page.evaluate(value => {
    // First value chooses a new THINGS entry. If it repeats the prior entry,
    // the second value chooses another; either way the branch value lands in
    // the requested range on the next call.
    const branch = value === 'adjacent' ? 0.2 : 0.8;
    window.__countRandom = [0.99, branch, branch, 0.1, 0.55, 0.25, 0.75, 0.35, 0.65, 0.45, 0.85];
  }, mode);
}

async function measureGeometry(page) {
  await page.waitForTimeout(120);
  const targets = page.locator('.dot,.num-btn,.number-big[style*="cursor"]');
  const targetBoxes = [];
  for (let index = 0; index < await targets.count(); index++) {
    const target = targets.nth(index);
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (box) targetBoxes.push(box);
  }
  return page.evaluate(boxes => {
    const nav = [...document.querySelectorAll('.back-btn,.home-btn,#gameSettingsGear,.settings-gear')].map(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    });
    const title = document.querySelector('.title')?.getBoundingClientRect();
    const instruction = document.querySelector('#instruction')?.getBoundingClientRect();
    const overlap = title && instruction
      ? Math.max(0, Math.min(title.bottom, instruction.bottom) - Math.max(title.top, instruction.top))
      : 0;
    return {
      targetCount: boxes.length,
      minTarget: boxes.length ? Math.min(...boxes.map(box => Math.min(box.width, box.height))) : null,
      unreachableTargets: boxes.filter(box => box.left < -1 || box.right > innerWidth + 1 || box.top < -1 || box.bottom > innerHeight + 1).length,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      navClipped: nav.filter(box => box.left < -1 || box.top < -1 || box.right > innerWidth + 1 || box.bottom > innerHeight + 1),
      minNavTarget: nav.length ? Math.min(...nav.map(box => Math.min(box.width, box.height))) : null,
      titleInstructionOverlap: overlap,
      screenScrollable: document.querySelector('.screen')?.scrollHeight > document.querySelector('.screen')?.clientHeight,
    };
  }, targetBoxes);
}

async function waitForCounter(page, expected) {
  await page.waitForFunction(value => {
    const profile = JSON.parse(localStorage.vb_profiles || '[]')[0] || {};
    return profile.achievements?.counters?.['count-along'] === value;
  }, expected, { timeout: 2500 });
}

async function solveTap(page, rapid, nextMode) {
  const dots = page.locator('#stage .dot');
  const total = await dots.count();
  if (total < 1) throw new Error('tap-count round has no dots');
  const before = (await profileState(page)).counter;
  const oldStage = await page.locator('#stage').evaluate(element => element.innerHTML);
  await page.evaluate(() => { window.__countAuditRoundNode = document.querySelector('#stage')?.firstElementChild; });
  for (let index = 0; index < total; index++) {
    await dots.nth(index).scrollIntoViewIfNeeded();
    await dots.nth(index).click({ clickCount: rapid && index === total - 1 ? 3 : 1, delay: rapid ? 8 : 0 });
  }
  await waitForCounter(page, before + 1);
  if (nextMode) await queueNextAdvancedMode(page, nextMode);
  const counted = await page.locator('#stage .dot.counted').count();
  const badges = await page.locator('#stage .count-badge').evaluateAll(nodes => nodes.map(node => Number(node.textContent)));
  const completedStage = await page.locator('#stage').evaluate(element => element.innerHTML);
  return { mode: 'tap', exactCount: counted === total, badgeSequence: badges, total, before, after: before + 1, oldStage, completedStage, wrongRecovered: null, rapid };
}

async function solveQuiz(page, rapid, nextMode) {
  const dots = page.locator('#stage .dot');
  const total = await dots.count();
  const buttons = page.locator('#stage .num-btn');
  const values = await buttons.evaluateAll(nodes => nodes.map(node => Number(node.textContent)));
  const correct = values.indexOf(total);
  const wrong = values.findIndex(value => value !== total);
  if (total < 2 || correct < 0 || wrong < 0) throw new Error(`invalid how-many round dots=${total} choices=${values.join(',')}`);
  const before = (await profileState(page)).counter;
  const oldStage = await page.locator('#stage').evaluate(element => element.innerHTML);
  await page.evaluate(() => { window.__countAuditRoundNode = document.querySelector('#stage')?.firstElementChild; });
  await buttons.nth(wrong).click();
  await page.waitForTimeout(60);
  const wrongMarked = await buttons.nth(wrong).evaluate(element => element.style.background.includes('255'));
  const wrongRecovered = wrongMarked && (await profileState(page)).counter === before;
  await buttons.nth(correct).click({ clickCount: rapid ? 3 : 1, delay: rapid ? 8 : 0 });
  await waitForCounter(page, before + 1);
  if (nextMode) await queueNextAdvancedMode(page, nextMode);
  const completedStage = await page.locator('#stage').evaluate(element => element.innerHTML);
  return { mode: 'quiz', exactCount: true, total, choices: values, before, after: before + 1, oldStage, completedStage, wrongRecovered, rapid };
}

async function solveAdvanced(page, rapid, nextMode) {
  const prompt = (await page.locator('#instruction').textContent()).trim();
  const sequence = (await page.locator('#stage .number-big').textContent()).trim();
  let answer;
  let mode;
  let exactCount = true;
  const adjacent = prompt.match(/^What comes (after|before) (\d+)\?$/);
  if (adjacent) {
    mode = 'adjacent';
    const source = Number(adjacent[2]);
    answer = adjacent[1] === 'after' ? source + 1 : source - 1;
    exactCount = sequence === (adjacent[1] === 'after' ? `${source}, ?` : `?, ${source}`);
  } else {
    mode = 'skip';
    const terms = sequence.split(',').map(part => Number(part.trim())).filter(Number.isFinite);
    if (terms.length !== 4) throw new Error(`invalid skip-count sequence ${sequence}`);
    const step = terms[1] - terms[0];
    exactCount = step > 0 && terms.every((term, index) => index === 0 || term - terms[index - 1] === step);
    answer = terms.at(-1) + step;
  }
  const buttons = page.locator('#stage .num-btn');
  const values = await buttons.evaluateAll(nodes => nodes.map(node => Number(node.textContent)));
  const correct = values.indexOf(answer);
  const wrong = values.findIndex(value => value !== answer);
  if (correct < 0 || wrong < 0) throw new Error(`answer ${answer} missing from ${values.join(',')}`);
  const before = (await profileState(page)).counter;
  const oldStage = await page.locator('#stage').evaluate(element => element.innerHTML);
  await page.evaluate(() => { window.__countAuditRoundNode = document.querySelector('#stage')?.firstElementChild; });
  await buttons.nth(wrong).click();
  await page.waitForTimeout(60);
  const wrongMarked = await buttons.nth(wrong).evaluate(element => element.style.background.includes('255'));
  const wrongRecovered = wrongMarked && (await profileState(page)).counter === before;
  await buttons.nth(correct).click({ clickCount: rapid ? 3 : 1, delay: rapid ? 8 : 0 });
  await waitForCounter(page, before + 1);
  if (nextMode) await queueNextAdvancedMode(page, nextMode);
  const completedStage = await page.locator('#stage').evaluate(element => element.innerHTML);
  return { mode, exactCount, sequence, answer, choices: values, before, after: before + 1, oldStage, completedStage, wrongRecovered, rapid };
}

async function solveCurrent(page, tier, rapid, nextMode) {
  if (tier <= 4 && await page.locator('#stage .dot:not(.counted)').count()) return solveTap(page, rapid, nextMode);
  if (tier <= 6) return solveQuiz(page, rapid, nextMode);
  return solveAdvanced(page, rapid, nextMode);
}

async function waitForNextRound(page) {
  await page.waitForFunction(() => document.querySelector('#stage')?.firstElementChild !== window.__countAuditRoundNode, null, { timeout: 3500 });
}

async function inspectReward(page, tier, base, rowId, screenshots) {
  if (tier <= 2) {
    await page.locator('.back-btn').click();
    await page.waitForURL(/\/learning\/(index\.html)?$/);
  }
  await page.locator('.vb-celebrate.in').waitFor({ timeout: 5000 });
  await page.waitForTimeout(250);
  const result = await page.locator('.vb-celebrate').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      title: element.querySelector('.cele-title')?.textContent?.trim() || '',
      hint: element.querySelector('.cele-hint')?.textContent?.trim() || '',
      inViewport: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
    };
  });
  await saveShot(page, rowId, 'reward', screenshots);
  await page.locator('.vb-celebrate').click();
  await page.locator('.vb-celebrate').waitFor({ state: 'detached', timeout: 1200 });
  if (tier <= 2) await page.goto(base + '/learning/count-along.html', { waitUntil: 'load' });
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
  const rowId = `count-along:T${tier}:${viewportName}`;
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch, reducedMotion: 'no-preference', serviceWorkers: 'block' });
  let blockedExternal = 0;
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== base) { blockedExternal++; return route.abort('blockedbyclient'); }
    return route.continue();
  });
  await context.addInitScript(init, { tier, bday: birthday(tier), quiz: false });
  const page = await context.newPage();
  const pageErrors = [], failedLocalRequests = [], expectedMediaAborts = [], screenshots = [], rounds = [], geometrySamples = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => {
    if (!request.url().startsWith(base)) return;
    const detail = `${request.url()} ${request.failure()?.errorText || ''}`;
    // speak() deliberately interrupts the previous clip during rapid counting.
    // Chromium reports that replaced local media fetch as ERR_ABORTED; retain it
    // in evidence, but do not confuse intentional cancellation with a failed asset.
    if (request.resourceType() === 'media' && request.failure()?.errorText === 'net::ERR_ABORTED') expectedMediaAborts.push(detail);
    else failedLocalRequests.push(detail);
  });
  const targetRounds = tier === 4 ? 8 : 7;
  let rewardResult = null, timerCleared = false, reloadRecovered = false, featureSwitch = tier !== 4;
  let counterBefore = null, counterAfter = null, finalState = null, silentMediaPlays = 0, fatal = null;
  try {
    await page.goto(base + '/learning/count-along.html', { waitUntil: 'load' });
    counterBefore = (await profileState(page)).counter;
    geometrySamples.push(await measureGeometry(page));
    await saveShot(page, rowId, 'initial', screenshots);

    for (let roundIndex = 0; roundIndex < targetRounds; roundIndex++) {
      if (tier === 4 && roundIndex === 3) {
        const stored = await setQuiz(page, true);
        await page.reload({ waitUntil: 'load' });
        const loaded = await page.evaluate(() => getProfileFeature(getActiveProfile(), 'count-along', 'quizMode'));
        featureSwitch = stored && loaded && (await page.locator('#instruction').textContent()).startsWith('How many');
        geometrySamples.push(await measureGeometry(page));
        await saveShot(page, rowId, 'quiz-mode', screenshots);
      }
      const nextMode = tier >= 7 && roundIndex < targetRounds - 1 ? (roundIndex % 2 ? 'adjacent' : 'skip') : null;
      const result = await solveCurrent(page, tier, roundIndex === 0, nextMode);
      rounds.push(result);
      if (roundIndex === 0) {
        rewardResult = await inspectReward(page, tier, base, rowId, screenshots);
        geometrySamples.push(await measureGeometry(page));
      } else if (roundIndex === 1) {
        const html = await page.locator('#stage').evaluate(element => element.innerHTML);
        await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
        await page.waitForTimeout(2350);
        timerCleared = await page.locator('#stage').evaluate((element, value) => element.innerHTML === value, html);
        await page.reload({ waitUntil: 'load' });
        reloadRecovered = await page.locator('#stage').evaluate(element => element.children.length > 0);
        await saveShot(page, rowId, 'reload-recovery', screenshots);
      } else if (roundIndex < targetRounds - 1) {
        await waitForNextRound(page);
      }
      if ([2, targetRounds - 1].includes(roundIndex)) {
        geometrySamples.push(await measureGeometry(page));
        await saveShot(page, rowId, `round-${roundIndex + 1}`, screenshots, roundIndex === targetRounds - 1);
      }
    }
    finalState = await profileState(page);
    counterAfter = finalState.counter;
    silentMediaPlays = await page.evaluate(() => window.__silentMediaPlays || 0);
    if (pageErrors.length || failedLocalRequests.length) throw new Error(`browser/runtime request failure: ${JSON.stringify({ pageErrors, failedLocalRequests })}`);
  } catch (error) {
    fatal = `${error.name}: ${error.message}`;
    try { await saveShot(page, rowId, 'failure', screenshots); } catch {}
  } finally {
    allScreenshots.push(...screenshots.map(item => ({ ...item, viewport: viewportName, tier })));
    await context.close();
  }
  const expectedCounter = counterBefore == null ? null : counterBefore + targetRounds;
  const modes = new Set(rounds.map(round => round.mode));
  const expectedModes = tier === 4 ? ['tap','quiz'] : tier <= 3 ? ['tap'] : tier <= 6 ? ['quiz'] : ['adjacent','skip'];
  const geometryPass = geometrySamples.length >= 3 && geometrySamples.every(sample => sample.minTarget >= 44 && sample.minNavTarget >= 44 && sample.horizontalOverflow <= 1 && !sample.navClipped.length && sample.unreachableTargets === 0 && sample.titleInstructionOverlap <= 1);
  const wrongPass = tier <= 3 || rounds.filter(round => round.mode !== 'tap').every(round => round.wrongRecovered);
  const exactCountPass = rounds.length === targetRounds && rounds.every(round => round.exactCount && round.after === round.before + 1);
  const rewardPass = !!rewardResult?.title && rewardResult.hint === 'Saved in your gallery' && rewardResult.inViewport && finalState?.repeat === 1;
  const modePass = expectedModes.every(mode => modes.has(mode));
  const masteryPass = ![5,6].includes(tier) || finalState?.mastery;
  return {
    id: rowId,
    activityId: 'count-along',
    route: '/learning/count-along.html',
    tier,
    viewport: viewportName,
    checks: {
      input: !fatal && exactCountPass && wrongPass && masteryPass && (tier !== 4 || featureSwitch) ? 'PASS' : 'FAIL',
      progression: !fatal && counterAfter === expectedCounter && masteryPass ? 'PASS' : 'FAIL',
      rewards: !fatal && rewardPass ? 'PASS' : 'FAIL',
      restart: !fatal && timerCleared && reloadRecovered ? 'PASS' : 'FAIL',
      long_repeated_play: !fatal && exactCountPass && (tier === 4 ? modes.has('tap') : modePass) ? 'PASS' : 'FAIL',
      visual_quality: !fatal && geometryPass ? 'PASS' : 'FAIL',
    },
    targetRounds,
    rounds,
    modes: [...modes],
    expectedModes,
    modePass,
    counterBefore,
    counterAfter,
    expectedCounter,
    finalState,
    reward: rewardResult,
    timerCleared,
    reloadRecovered,
    featureSwitch,
    geometrySamples,
    blockedExternal,
    pageErrors,
    failedLocalRequests,
    expectedMediaAborts,
    silentMediaPlays,
    screenshotCount: screenshots.length,
    fatal,
  };
}

async function runProbe(browser, base, viewportName, viewport, tier, allScreenshots) {
  const rowId = `count-along-probe:T${tier}:${viewportName}`;
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort('blockedbyclient'));
  await context.addInitScript(init, { tier, bday: birthday(tier), probe: true, quiz: tier === 4 });
  const page = await context.newPage();
  const screenshots = [], geometrySamples = [], rounds = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let fatal = null;
  try {
    await page.goto(base + '/learning/count-along.html', { waitUntil: 'load' });
    for (let index = 0; index < 3; index++) {
      geometrySamples.push(await measureGeometry(page));
      await saveShot(page, rowId, `round-${index + 1}`, screenshots);
      const nextMode = tier >= 7 && index < 2 ? (index ? 'adjacent' : 'skip') : null;
      const result = await solveCurrent(page, tier, index === 0, nextMode);
      rounds.push(result);
      if (index < 2) await waitForNextRound(page);
    }
  } catch (error) {
    fatal = `${error.name}: ${error.message}`;
    try { await saveShot(page, rowId, 'failure', screenshots); } catch {}
  } finally {
    allScreenshots.push(...screenshots.map(item => ({ ...item, viewport: viewportName, tier })));
    await context.close();
  }
  const geometryPass = geometrySamples.length === 3 && geometrySamples.every(sample => sample.minTarget >= 44 && sample.minNavTarget >= 44 && sample.horizontalOverflow <= 1 && !sample.navClipped.length && sample.unreachableTargets === 0 && sample.titleInstructionOverlap <= 1);
  return { id: rowId, tier, viewport: viewportName, rounds: rounds.length, geometrySamples, screenshotCount: screenshots.length, errors, fatal, pass: !fatal && !errors.length && rounds.length === 3 && rounds.every(round => round.exactCount && (tier <= 3 || round.wrongRecovered)) && geometryPass };
}

if (path.dirname(OUT) !== path.join(ROOT, 'tests', 'e2e', 'out') || path.basename(OUT) !== 'count-along-visual-play') throw new Error(`refusing unsafe output cleanup: ${OUT}`);
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
const screenshots = [], rows = [], probes = [];
try {
  const jobs = [];
  for (const viewportName of SELECTED_VIEWPORTS) for (const tier of SELECTED_TIERS) jobs.push({ viewportName, viewport: VIEWPORTS[viewportName], tier });
  async function worker() {
    while (jobs.length) {
      const job = jobs.shift();
      const row = await runCell(browser, base, job.viewportName, job.viewport, job.tier, screenshots);
      rows.push(row);
      console.log(`${row.fatal ? 'ERROR' : 'DONE'} ${row.id} rounds=${row.rounds.length}${row.fatal ? ' ' + row.fatal : ''}`);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);

  if (!process.env.TIERS && !process.env.VIEWPORTS) {
    const probeJobs = [];
    for (const viewportName of Object.keys(PROBE_VIEWPORTS)) for (const tier of [2,4,7,10]) probeJobs.push({ viewportName, viewport: PROBE_VIEWPORTS[viewportName], tier });
    async function probeWorker() {
      while (probeJobs.length) {
        const job = probeJobs.shift();
        const result = await runProbe(browser, base, job.viewportName, job.viewport, job.tier, screenshots);
        probes.push(result);
        console.log(`${result.pass ? 'DONE' : 'ERROR'} ${result.id} rounds=${result.rounds}${result.fatal ? ' ' + result.fatal : ''}`);
      }
    }
    await Promise.all([probeWorker(), probeWorker(), probeWorker(), probeWorker()]);
  }
  for (const viewportName of [...SELECTED_VIEWPORTS, ...Object.keys(PROBE_VIEWPORTS)]) {
    const items = screenshots.filter(item => item.viewport === viewportName);
    if (items.length) await createContactSheet(browser, items, path.join(OUT, 'contact-sheets', `${viewportName}.png`), `Count Along ${viewportName}`);
  }
} finally {
  await browser.close();
  server.kill();
}
rows.sort((a, b) => a.id.localeCompare(b.id));
probes.sort((a, b) => a.id.localeCompare(b.id));
const counts = { rows: rows.length, pass: 0, fail: 0 };
for (const row of rows) for (const status of Object.values(row.checks)) counts[status.toLowerCase()]++;
const report = {
  auditStart: AUDIT_START,
  countAlongSha256: sha256(path.join(ROOT, 'learning/count-along.html')),
  generatedAt: new Date().toISOString(),
  evidenceBoundary: 'Browser-driven pointer/touch emulation and silent media stubs with inspected renders; no physical child-touch, human-audible voice-quality or provider claim.',
  counts,
  screenshots: screenshots.length,
  rows,
  probes,
};
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...counts, probes: probes.length, probePass: probes.filter(probe => probe.pass).length, screenshots: screenshots.length }));
if (rows.length !== SELECTED_TIERS.length * SELECTED_VIEWPORTS.length || rows.some(row => row.fatal || row.rounds.length !== row.targetRounds || Object.values(row.checks).includes('FAIL') || row.pageErrors.length || row.failedLocalRequests.length) || probes.some(probe => !probe.pass)) process.exitCode = 1;
