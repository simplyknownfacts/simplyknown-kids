// Hello Colors T1-T10 phone/desktop repeated-play and visual audit.
// Pointer events are browser-driven; they do not prove a child's physical touch
// or the human-audible quality of prerecorded voice clips.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(import.meta.dirname, 'out', 'hello-colors-visual-play');
const AUDIT_START = '12314eff5258a1969f3bb1d0d204d8bc243ab3d5';
const VIEWPORTS = {
  desktop: { width: 1280, height: 900, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
  'short-phone': { width: 320, height: 568, isMobile: true, hasTouch: true },
};
const DEFAULT_VIEWPORTS = ['desktop', 'phone'];
const TIERS = [1,2,3,4,5,6,7,8,9,10];
const SELECTED_TIERS = process.env.TIERS ? process.env.TIERS.split(',').map(Number) : TIERS;
const SELECTED_VIEWPORTS = process.env.VIEWPORTS ? process.env.VIEWPORTS.split(',') : DEFAULT_VIEWPORTS;
const COLOR_THINGS = {
  Red: ['Apple','Rose','Fire Truck','Heart'], Blue: ['Blueberry','Ocean','Dolphin','Heart'],
  Yellow: ['Sunflower','Lemon','Star','Bee'], Green: ['Frog','Leaf','Broccoli','Turtle'],
  Purple: ['Grapes','Purple Circle','Flower','Heart'], Orange: ['Orange','Pumpkin','Fox','Carrot'],
  Pink: ['Pig','Blossom','Flamingo','Heart'], Brown: ['Bear','Chocolate','Log','Potato'],
  Gray: ['Elephant','Fog','Shark','Rock'], Black: ['Bat','Cat','Hat','Spider'],
  White: ['Cloud','Swan','Milk','Snow'],
};
const COLOR_EMOJIS = {
  Red: ['🍎','🌹','🚒','❤️'], Blue: ['🫐','🌊','🐬','💙'], Yellow: ['🌻','🍋','⭐','🐝'],
  Green: ['🐸','🌿','🥦','🐢'], Purple: ['🍇','🟣','🪻','💜'], Orange: ['🍊','🎃','🦊','🥕'],
  Pink: ['🐷','🌸','🦩','🩷'], Brown: ['🐻','🍫','🪵','🥔'], Gray: ['🐘','🌫️','🦈','🪨'],
  Black: ['🦇','🐈‍⬛','🎩','🕷️'], White: ['☁️','🦢','🥛','❄️'],
};
const MIXES = { 'Red + Blue': 'Purple', 'Red + Yellow': 'Orange', 'Blue + Yellow': 'Green', 'Red + White': 'Pink', 'Black + White': 'Gray' };
const COLOR_RGB = {
  Red:'rgb(255, 68, 68)', Blue:'rgb(68, 136, 255)', Yellow:'rgb(255, 215, 0)',
  Green:'rgb(68, 204, 68)', Purple:'rgb(153, 102, 204)', Orange:'rgb(255, 140, 0)',
  Pink:'rgb(255, 105, 180)', Brown:'rgb(139, 90, 43)', Gray:'rgb(154, 160, 166)',
  Black:'rgb(43, 43, 51)', White:'rgb(239, 239, 243)',
};
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
    id: `colors-t${tier}`,
    name: 'Colors Test',
    birthday: bday,
    color: '#4ECDC4',
    voice: 'girl',
    mascot: { id: 'dog' },
    tierOverrides: { 'hello-colors': tier },
    activitiesVisible: { 'hello-colors': true },
    features: {},
    achievements: {
      unlocked: {
        'hello-colors.first': { at: 1 },
        'hello-colors.milestone.bronze': { at: 1 },
        'hello-colors.milestone.silver': { at: 1 },
      },
      counters: { 'hello-colors': 999 },
      repeats: {},
      streak: { last: null, current: 0, best: 0 },
      xp: 3,
      rank: 'sprout',
    },
  };
  if (!sessionStorage.__colorSeed) {
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    sessionStorage.__colorSeed = '1';
  }
  let state = (0x9e3779b9 + tier * 991) >>> 0;
  const seeded = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000);
  window.__colorRandom = [];
  Math.random = () => window.__colorRandom.length ? window.__colorRandom.shift() : seeded();
  try { HTMLMediaElement.prototype.play = () => Promise.resolve(); } catch {}
  try { navigator.vibrate = () => true; } catch {}
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
    window.__colorRecords = [];
    const original = window.vbProgress.record;
    window.vbProgress.record = (...args) => {
      window.__colorRecords.push(args);
      return original.apply(window.vbProgress, args);
    };
  });
}

async function progress(page) {
  return page.evaluate(() => {
    const profile = JSON.parse(localStorage.vb_profiles || '[]')[0] || {};
    return {
      counter: profile.achievements?.counters?.['hello-colors'] || 0,
      records: window.__colorRecords || [],
    };
  });
}

async function geometry(page) {
  await page.waitForTimeout(400);
  const cards = page.locator('#thingsRow .thing-card');
  let minTarget = Infinity;
  for (let i = 0; i < await cards.count(); i++) {
    await cards.nth(i).scrollIntoViewIfNeeded();
    const box = await cards.nth(i).boundingBox();
    if (box) minTarget = Math.min(minTarget, box.width, box.height);
  }
  return page.evaluate(value => {
    const screen = document.querySelector('#screen');
    const nav = [...document.querySelectorAll('.back-btn,.home-btn,#gameSettingsGear,.settings-gear')].map(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    });
    return {
      minTarget: Number.isFinite(value) ? value : null,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      navClipped: nav.filter(box => box.left < -1 || box.top < -1 || box.right > innerWidth + 1 || box.bottom > innerHeight + 1),
      minNavTarget: nav.length ? Math.min(...nav.map(box => Math.min(box.width, box.height))) : null,
      scrollable: screen.scrollHeight > screen.clientHeight,
    };
  }, minTarget);
}

async function presentation(page) {
  return page.evaluate(expected => {
    const label = document.querySelector('#colorLabel');
    const labelVisible = getComputedStyle(label).display !== 'none';
    const labelName = label.textContent.trim();
    const mixWords = [...document.querySelectorAll('.quiz-color-word')].map(word => ({
      name: word.textContent.trim(), color: getComputedStyle(word).color,
    }));
    return {
      bodyBackground: getComputedStyle(document.body).backgroundImage,
      overlay: document.querySelector('#bg').style.background,
      labelVisible,
      labelName,
      labelColor: getComputedStyle(label).color,
      wordsMatch: (!labelVisible || expected[labelName] === getComputedStyle(label).color)
        && mixWords.every(word => expected[word.name] === word.color),
      mixWords,
    };
  }, COLOR_RGB);
}

function answerIndex(prompt, names, emojis) {
  const clean = prompt.replace(/[!?]/g, '').trim();
  if (clean.includes(' + ')) {
    const answer = MIXES[clean.replace(/ = $/, '').replace(/ =$/, '')];
    return names.indexOf(answer);
  }
  const odd = clean.match(/^Which one is NOT (.+)$/);
  if (odd) return emojis.findIndex(emoji => !(COLOR_EMOJIS[odd[1]] || []).includes(emoji));
  const identify = clean.match(/^Tap the (\w+)(?: (.+))? thing$/);
  if (identify) return emojis.findIndex(emoji => (COLOR_EMOJIS[identify[1]] || []).includes(emoji));
  const strict = clean.match(/^Tap the (\w+) (.+)$/);
  if (strict) return names.findIndex((name, index) => name === strict[2] && (COLOR_EMOJIS[strict[1]] || []).includes(emojis[index]));
  return -1;
}

async function solveExploration(page, rapid = false) {
  const cards = page.locator('#thingsRow .thing-card');
  const count = await cards.count();
  if (count !== 4) throw new Error(`expected four exploration cards, found ${count}`);
  await page.waitForTimeout(350);
  await page.evaluate(() => { window.__roundFirst = document.querySelector('.thing-card'); });
  for (let i = 0; i < count; i++) {
    const box = await cards.nth(i).boundingBox();
    if (!box) throw new Error(`exploration card ${i} has no visible box`);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    if (rapid) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    if (!await cards.nth(i).evaluate(element => element.classList.contains('revealed'))) await cards.nth(i).click();
  }
  const colors = await cards.evaluateAll(nodes => nodes.map(node => node.dataset.color));
  return { mode: 'explore', wrongRecovered: null, choiceCount: count, distinctColors: new Set(colors).size, answerCount: count };
}

async function solveQuiz(page, rapid = false) {
  const prompt = (await page.locator('#quizLabel').textContent()).trim();
  const cards = page.locator('#thingsRow .thing-card');
  const count = await cards.count();
  const names = await cards.evaluateAll(nodes => nodes.map(node => node.querySelector('.thing-name')?.textContent?.trim() || ''));
  const emojis = await cards.evaluateAll(nodes => nodes.map(node => node.querySelector('.thing-emoji')?.textContent?.trim() || ''));
  const correct = answerIndex(prompt, names, emojis);
  if (correct < 0) throw new Error(`could not identify answer for ${prompt}: ${names.join(',')}`);
  const wrong = names.findIndex((_, index) => index !== correct);
  await cards.nth(wrong).click();
  const wrongRecovered = await cards.nth(wrong).evaluate(element => element.classList.contains('wrong'));
  await page.evaluate(() => { window.__roundFirst = document.querySelector('.thing-card'); });
  await cards.nth(correct).click();
  if (rapid) {
    await cards.nth(correct).dispatchEvent('pointerdown');
    await cards.nth(correct).dispatchEvent('pointerdown');
  }
  const colors = await cards.evaluateAll(nodes => nodes.map(node => node.dataset.color));
  const answerCount = await cards.evaluateAll(nodes => nodes.filter(node => node.dataset.answer === 'true').length);
  return {
    mode: prompt.includes(' + ') ? 'mix' : prompt.startsWith('Which') ? 'odd' : 'identify',
    wrongRecovered,
    choiceCount: count,
    distinctColors: new Set(colors).size,
    answerCount,
  };
}

async function reward(page, tier, base, rowId, screenshots) {
  if (tier <= 2) {
    await page.locator('.back-btn').click();
    await page.waitForURL(/\/learning\/(index\.html)?$/);
  }
  await page.locator('.vb-celebrate.in').waitFor({ timeout: 5000 });
  await page.waitForTimeout(500);
  const result = await page.locator('.vb-celebrate').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const blockers = [...document.querySelectorAll('#colorLabel,#quizLabel,#thingsRow .thing-card,.back-btn,.home-btn,#gameSettingsGear,.settings-gear')]
      .filter(node => { const box = node.getBoundingClientRect(), style = getComputedStyle(node); return style.display !== 'none' && style.visibility !== 'hidden' && box.width && box.height; })
      .map(node => { const box = node.getBoundingClientRect(); return { name:node.id || node.className,left:box.left,top:box.top,right:box.right,bottom:box.bottom }; });
    return {
      title: element.querySelector('.cele-title')?.textContent?.trim() || '',
      hint: element.querySelector('.cele-hint')?.textContent?.trim() || '',
      inViewport: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
      overlaps: blockers.filter(box => Math.min(rect.right,box.right)>Math.max(rect.left,box.left)
        && Math.min(rect.bottom,box.bottom)>Math.max(rect.top,box.top)).map(box => box.name),
    };
  });
  await saveShot(page, rowId, 'reward', screenshots);
  await page.locator('.vb-celebrate').click();
  await page.locator('.vb-celebrate').waitFor({ state: 'detached', timeout: 1000 });
  if (tier <= 2) {
    await page.goto(base + '/learning/hello-colors.html', { waitUntil: 'load' });
    await installProgressHook(page);
  }
  result.contentRestored = await page.evaluate(() => ['#colorLabel','#quizLabel'].every(selector => getComputedStyle(document.querySelector(selector)).visibility === 'visible'));
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
  const rowId = `hello-colors:T${tier}:${viewportName}`;
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch, reducedMotion: 'no-preference', serviceWorkers: 'block' });
  let blockedExternal = 0;
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== base) { blockedExternal++; return route.abort('blockedbyclient'); }
    return route.continue();
  });
  await context.addInitScript(init, { tier, bday: birthday(tier) });
  const page = await context.newPage();
  const pageErrors = [], failedLocalRequests = [], interruptedAudio = [], screenshots = [], rounds = [], geometrySamples = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => {
    if (!request.url().startsWith(base)) return;
    const failure = `${request.url()} ${request.failure()?.errorText || ''}`;
    if (/\/audio\/[^/]+\/[0-9a-f]+\.mp3 /.test(failure) && /ERR_ABORTED/.test(failure)) interruptedAudio.push(failure);
    else failedLocalRequests.push(failure);
  });
  let counterBefore = null, counterAfter = null, autoAdvanced = null, rewardResult = null, fatal = null;
  const presentationSamples = [];
  try {
    await page.goto(base + '/learning/hello-colors.html', { waitUntil: 'load' });
    await installProgressHook(page);
    geometrySamples.push(await geometry(page));
    presentationSamples.push(await presentation(page));
    await saveShot(page, rowId, 'initial', screenshots);
    counterBefore = (await progress(page)).counter;

    if (tier === 1) {
      const first = await page.locator('#colorLabel').textContent();
      await page.waitForFunction(value => document.querySelector('#colorLabel')?.textContent !== value, first, { timeout: 5000 });
      autoAdvanced = true;
      await saveShot(page, rowId, 'auto-cycle', screenshots);
    }

    for (let round = 0; round < 7; round++) {
      if (tier >= 8) await page.evaluate(value => { window.__colorRandom = [value]; }, [0, 0.3, 0.6, 0][round % 4]);
      else if (tier >= 6) await page.evaluate(value => { window.__colorRandom = [value]; }, [0, 0.4, 0][round % 3]);
      const before = (await progress(page)).records.length;
      const result = tier === 1 ? await solveExploration(page, round === 0) : await solveQuiz(page, round === 0);
      await page.waitForFunction(value => (window.__colorRecords || []).length === value + 1, before, { timeout: 2000 });
      rounds.push(result);
      presentationSamples.push(await presentation(page));
      if (round === 0 && tier >= 3) rewardResult = await reward(page, tier, base, rowId, screenshots);
      if (round < 6) await page.waitForFunction(() => document.querySelector('.thing-card') !== window.__roundFirst, null, { timeout: 4000 });
      if ([0,3,6].includes(round)) await saveShot(page, rowId, `round-${round + 1}`, screenshots);
    }

    if (tier <= 2) rewardResult = await reward(page, tier, base, rowId, screenshots);
    counterAfter = (await progress(page)).counter;
    geometrySamples.push(await geometry(page));
    await saveShot(page, rowId, 'final', screenshots);
    if (pageErrors.length || failedLocalRequests.length) throw new Error(`browser/runtime request failure: ${JSON.stringify({ pageErrors, failedLocalRequests })}`);
  } catch (error) {
    fatal = `${error.name}: ${error.message}`;
    try { await saveShot(page, rowId, 'failure', screenshots); } catch {}
  } finally {
    allScreenshots.push(...screenshots.map(item => ({ ...item, viewport: viewportName, tier })));
    await context.close();
  }
  const expectedCounter = counterBefore == null ? null : counterBefore + 7;
  const geometryPass = geometrySamples.length === 2 && geometrySamples.every(sample => sample.minTarget >= 44 && sample.minNavTarget >= 44 && sample.horizontalOverflow <= 1 && !sample.navClipped.length);
  const modes = new Set(rounds.map(round => round.mode));
  const expectedModes = tier >= 8 ? ['identify','odd','mix'] : tier >= 6 ? ['identify','odd'] : tier >= 2 ? ['identify'] : ['explore'];
  const modePass = expectedModes.every(mode => modes.has(mode));
  const wrongPass = tier === 1 || rounds.every(round => round.wrongRecovered);
  const choicesPass = rounds.every(round => {
    if (tier === 1) return round.choiceCount === 4 && round.distinctColors === 1;
    if (tier === 2) return round.choiceCount === 2 && round.distinctColors === 2 && round.answerCount === 1;
    if (tier === 3) return round.choiceCount === 3 && round.distinctColors === 3 && round.answerCount === 1;
    return round.choiceCount === 4 && round.distinctColors >= (round.mode === 'identify' ? 3 : 2) && round.answerCount === 1;
  });
  const firstBackground = presentationSamples[0]?.bodyBackground;
  const presentationPass = presentationSamples.length === 8 && presentationSamples.every(sample =>
    sample.overlay === '' && sample.wordsMatch && sample.bodyBackground === firstBackground && /gradient/.test(sample.bodyBackground));
  const rewardPass = rewardResult?.title && rewardResult.hint === 'Saved in your gallery' && rewardResult.inViewport && !rewardResult.overlaps.length && rewardResult.contentRestored;
  return {
    id: rowId,
    activityId: 'hello-colors',
    route: '/learning/hello-colors.html',
    tier,
    viewport: viewportName,
    checks: {
      input: !fatal && rounds.length === 7 && wrongPass && choicesPass ? 'PASS' : 'FAIL',
      progression: !fatal && counterAfter === expectedCounter ? 'PASS' : 'FAIL',
      rewards: !fatal && rewardPass ? 'PASS' : 'FAIL',
      restart: !fatal && rounds.length === 7 && modePass ? 'PASS' : 'FAIL',
      long_repeated_play: !fatal && rounds.length === 7 && modePass && (tier !== 1 || autoAdvanced) ? 'PASS' : 'FAIL',
      visual_quality: !fatal && geometryPass && presentationPass ? 'PASS' : 'FAIL',
    },
    rounds,
    autoAdvanced,
    reward: rewardResult,
    counterBefore,
    counterAfter,
    expectedCounter,
    geometrySamples,
    presentationSamples,
    blockedExternal,
    pageErrors,
    failedLocalRequests,
    interruptedAudio,
    screenshotCount: screenshots.length,
    fatal,
  };
}

if (path.dirname(OUT) !== path.join(ROOT, 'tests', 'e2e', 'out') || path.basename(OUT) !== 'hello-colors-visual-play') throw new Error(`refusing unsafe output cleanup: ${OUT}`);
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
      console.log(`${row.fatal ? 'ERROR' : 'DONE'} ${row.id} rounds=${row.rounds.length}${row.fatal ? ' ' + row.fatal : ''}`);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  for (const viewportName of SELECTED_VIEWPORTS) await createContactSheet(browser, screenshots.filter(item => item.viewport === viewportName), path.join(OUT, 'contact-sheets', `${viewportName}.png`), `Hello Colors ${viewportName} T1-T10`);
} finally {
  await browser.close();
  server.kill();
}
rows.sort((a, b) => a.id.localeCompare(b.id));
const counts = { rows: rows.length, pass: 0, fail: 0 };
for (const row of rows) for (const status of Object.values(row.checks)) counts[status.toLowerCase()]++;
const report = {
  auditStart: AUDIT_START,
  helloColorsSha256: sha256(path.join(ROOT, 'learning/hello-colors.html')),
  generatedAt: new Date().toISOString(),
  evidenceBoundary: 'Browser-driven pointer events and inspected renders; no physical child-touch or human-audible voice-quality claim.',
  counts,
  screenshots: screenshots.length,
  rows,
};
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...counts, screenshots: screenshots.length }));
if (rows.length !== SELECTED_TIERS.length * SELECTED_VIEWPORTS.length || rows.some(row => row.fatal || row.rounds.length !== 7 || Object.values(row.checks).includes('FAIL') || row.pageErrors.length || row.failedLocalRequests.length)) process.exitCode = 1;
