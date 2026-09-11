// Surprise Pop full visual/repeated-play audit at T1-T10 on phone and desktop.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(import.meta.dirname, 'out', 'surprise-pop-visual-play');
const AUDIT_START = 'e690d35c89d0fb6eaa66f090637b42b1e3f5c74d';
const PRODUCT_BASELINE = '45edc17709d5624213bae49ec568615b31acc028';
const ROUNDS = 6;
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
    id: `surprise-t${tier}`,
    name: 'Surprise Test',
    birthday: bday,
    color: '#4ECDC4',
    voice: 'girl',
    mascot: { id: 'dog' },
    tierOverrides: { 'surprise-pop': tier },
    activitiesVisible: { 'surprise-pop': true },
    features: {},
    achievements: {
      unlocked: {
        'surprise-pop.first': { at: 1 },
        'surprise-pop.milestone.bronze': { at: 1 },
        'surprise-pop.milestone.silver': { at: 1 },
      },
      counters: { 'surprise-pop': 299 },
      repeats: {},
      streak: { last: null, current: 0, best: 0 },
      xp: 3,
      rank: 'sprout',
    },
  };
  if (!sessionStorage.__surpriseSeed) {
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    sessionStorage.__surpriseSeed = '1';
  }
  let state = (0x9e3779b9 + tier * 101) >>> 0;
  Math.random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000);
  try { HTMLMediaElement.prototype.play = () => Promise.resolve(); } catch {}
  try { navigator.vibrate = () => true; } catch {}
}

async function saveShot(page, rowId, label, screenshots) {
  const directory = path.join(OUT, 'screenshots');
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${rowId.replaceAll(':', '-')}-${screenshots.length}-${rowId.endsWith(':phone') ? 'phone' : 'desktop'}-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);
  await page.screenshot({ path: file });
  screenshots.push({ rowId, label, file });
}

async function installHooks(page) {
  await page.evaluate(() => {
    window.__surpriseRecords = 0;
    const record = window.vbProgress.record;
    window.vbProgress.record = (...args) => {
      window.__surpriseRecords++;
      return record.apply(window.vbProgress, args);
    };
  });
}

async function progress(page) {
  return page.evaluate(() => {
    const profile = JSON.parse(localStorage.vb_profiles || '[]')[0] || {};
    const achievements = profile.achievements || {};
    return {
      counter: achievements.counters?.['surprise-pop'] || 0,
      repeat: achievements.repeats?.['surprise-pop'] || 0,
      records: window.__surpriseRecords || 0,
    };
  });
}

async function geometry(page) {
  return page.evaluate(() => {
    const visible = selector => [...document.querySelectorAll(selector)].filter(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    const targets = visible('.back-btn,.home-btn,#gameSettingsGear,.settings-gear,#egg,.choice');
    const content = visible('#egg,#reveal,#surprise,#name,#sub,#choices,#collection,#hint');
    const box = element => {
      const rect = element.getBoundingClientRect();
      return {
        name: element.id || element.className,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const targetBoxes = targets.map(box);
    const contentBoxes = content.map(box);
    const choiceBoxes = targetBoxes.filter(item => item.name === 'choice');
    const overlaps = [];
    for (let index = 1; index < choiceBoxes.length; index++) {
      const a = choiceBoxes[index - 1], b = choiceBoxes[index];
      if (Math.min(a.right, b.right) > Math.max(a.left, b.left)
        && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)) overlaps.push([a, b]);
    }
    return {
      minTarget: Math.min(...targetBoxes.map(item => Math.min(item.width, item.height))),
      clippedTargets: targetBoxes.filter(item => item.left < -1 || item.top < -1 || item.right > innerWidth + 1 || item.bottom > innerHeight + 1),
      clippedContent: contentBoxes.filter(item => item.left < -1 || item.top < -1 || item.right > innerWidth + 1 || item.bottom > innerHeight + 1),
      choiceOverlaps: overlaps.length,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      targets: targetBoxes,
      content: contentBoxes,
    };
  });
}

function geometryOk(sample) {
  return sample.minTarget >= 44 && !sample.clippedTargets.length && !sample.clippedContent.length
    && !sample.choiceOverlaps && sample.horizontalOverflow <= 1;
}

async function triggerEgg(page, rapid = false) {
  const egg = page.locator('#egg');
  await egg.waitFor({ state: 'visible', timeout: 5000 });
  const before = await progress(page);
  const attempts = rapid ? 5 : 1;
  for (let index = 0; index < attempts; index++) {
    await egg.dispatchEvent('pointerdown', { pointerId: 40 + index, pointerType: 'touch', bubbles: true });
  }
  await page.locator('#reveal').waitFor({ state: 'visible' });
  return before;
}

async function finishRound(page, tier, rowId, screenshots, captureWrong = false, rapid = false) {
  const before = await triggerEgg(page, rapid);
  let wrongRecovered = null;
  if (tier >= 5) {
    const shadow = (await page.locator('#surprise').textContent()).trim();
    const choices = page.locator('#choices .choice');
    await choices.first().waitFor();
    const values = await choices.allTextContents();
    const correctIndex = values.findIndex(value => value.trim() === shadow);
    const wrongIndex = values.findIndex((value, index) => index !== correctIndex && value.trim() !== shadow);
    if (correctIndex < 0 || wrongIndex < 0) throw new Error(`could not identify choices: ${JSON.stringify(values)}`);
    await choices.nth(wrongIndex).dispatchEvent('pointerdown', { pointerId: 70, pointerType: 'touch', bubbles: true });
    wrongRecovered = await choices.nth(wrongIndex).isDisabled()
      && /does not match the hidden shape\. Try again!/.test(await page.locator('#sub').textContent())
      && (await progress(page)).counter === before.counter;
    if (!wrongRecovered) throw new Error('wrong choice did not remain recoverable');
    if (captureWrong) await saveShot(page, rowId, 'wrong', screenshots);
    await choices.nth(correctIndex).dispatchEvent('pointerdown', { pointerId: 71, pointerType: 'touch', bubbles: true });
  }
  await page.waitForFunction(() => !document.querySelector('#surprise')?.classList.contains('shadow'));
  const after = await progress(page);
  if (after.counter !== before.counter + 1 || after.records !== before.records + 1) {
    throw new Error(`round recorded ${after.counter - before.counter}/${after.records - before.records}, expected 1/1`);
  }
  const state = await page.evaluate(t => ({
    eggHidden: getComputedStyle(document.querySelector('#egg')).display === 'none',
    surprise: document.querySelector('#surprise').textContent.trim(),
    name: document.querySelector('#name').textContent.trim(),
    sub: document.querySelector('#sub').textContent.trim(),
    choices: document.querySelectorAll('#choices .choice').length,
    tier: t,
  }), tier);
  if (!state.eggHidden || !state.surprise || state.choices) throw new Error(`invalid reveal: ${JSON.stringify(state)}`);
  if (tier < 3 && state.name) throw new Error('T1-T2 revealed a written name');
  if (tier >= 3 && !state.name.endsWith('!')) throw new Error('T3+ omitted the surprise name');
  if (tier >= 5 && state.sub !== 'Yes!') throw new Error('T5+ correct guess omitted confirmation');
  const sample = await geometry(page);
  if (!geometryOk(sample)) throw new Error(`bad reveal geometry: ${JSON.stringify(sample)}`);
  return { wrongRecovered, state, sample };
}

async function inspectReward(page) {
  await page.locator('.vb-celebrate.in').waitFor({ timeout: 5000 });
  return page.locator('.vb-celebrate').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      title: element.querySelector('.cele-title')?.textContent?.trim() || '',
      hint: element.querySelector('.cele-hint')?.textContent?.trim() || '',
      inViewport: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
    };
  });
}

async function dismissReward(page, reward) {
  const started = Date.now();
  await page.locator('.vb-celebrate').click();
  await page.locator('.vb-celebrate').waitFor({ state: 'detached', timeout: 1000 });
  reward.dismissMs = Date.now() - started;
}

async function collectionCount(page, profileId) {
  return page.evaluate(id => {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('vb_sppop_' + id) || '{}'); } catch {}
    return { saved: Object.keys(saved).length, text: document.querySelector('.col-count')?.textContent?.trim() || '' };
  }, profileId);
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
  const rowId = `surprise-pop:T${tier}:${viewportName}`;
  const profileId = `surprise-t${tier}`;
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
  let reward = null, rounds = 0, wrongRecovered = tier < 5, collectionBeforeReload = null;
  let collectionAfterReload = null, rapidProtected = false, reloadRecovered = false, fatal = null;
  try {
    await page.goto(base + '/games/surprise-pop.html', { waitUntil: 'load' });
    await installHooks(page);
    const initialGeometry = await geometry(page);
    geometrySamples.push(initialGeometry);
    if (!geometryOk(initialGeometry)) throw new Error(`bad initial geometry: ${JSON.stringify(initialGeometry)}`);
    await saveShot(page, rowId, 'initial', screenshots);

    const first = await finishRound(page, tier, rowId, screenshots, tier >= 5, true);
    rounds++;
    wrongRecovered = wrongRecovered || first.wrongRecovered;
    geometrySamples.push(first.sample);
    rapidProtected = (await progress(page)).records === 1;
    if (!rapidProtected) throw new Error('rapid egg input recorded more than one reveal');
    await saveShot(page, rowId, 'first-reveal', screenshots);

    if (tier <= 2) {
      await page.waitForTimeout(250);
      if (await page.locator('.vb-celebrate.in').isVisible().catch(() => false)) throw new Error('T1-T2 reward interrupted the activity');
      await page.locator('.back-btn').click();
      await page.waitForURL(/\/games\/(index\.html)?$/);
      reward = await inspectReward(page);
      await saveShot(page, rowId, 'reward', screenshots);
      await dismissReward(page, reward);
      await page.goto(base + '/games/surprise-pop.html', { waitUntil: 'load' });
      await installHooks(page);
    } else {
      reward = await inspectReward(page);
      await saveShot(page, rowId, 'reward', screenshots);
      await dismissReward(page, reward);
    }
    if (!reward.title || reward.hint !== 'Saved in your gallery' || !reward.inViewport || reward.dismissMs > 500) {
      throw new Error(`invalid reward result: ${JSON.stringify(reward)}`);
    }

    for (let index = 1; index < ROUNDS; index++) {
      await page.locator('#egg').waitFor({ state: 'visible', timeout: 5000 });
      const result = await finishRound(page, tier, rowId, screenshots, false, index === 1);
      rounds++;
      geometrySamples.push(result.sample);
      if (index === ROUNDS - 1) await saveShot(page, rowId, 'repeated', screenshots);
    }
    const stable = await progress(page);
    if (stable.counter !== 299 + ROUNDS) throw new Error(`counter ${stable.counter}, expected ${299 + ROUNDS}`);
    collectionBeforeReload = await collectionCount(page, profileId);
    if (tier >= 3 && (collectionBeforeReload.saved < 2 || !collectionBeforeReload.text.endsWith('/ 16'))) {
      throw new Error(`collection did not persist varied finds: ${JSON.stringify(collectionBeforeReload)}`);
    }

    await page.reload({ waitUntil: 'load' });
    await installHooks(page);
    await page.locator('#egg').waitFor({ state: 'visible' });
    collectionAfterReload = await collectionCount(page, profileId);
    if (collectionAfterReload.saved !== collectionBeforeReload.saved) throw new Error('collection changed across reload');
    const recovery = await finishRound(page, tier, rowId, screenshots, false, true);
    geometrySamples.push(recovery.sample);
    rounds++;
    const recoveryProgress = await progress(page);
    reloadRecovered = recoveryProgress.counter === 299 + rounds;
    if (!reloadRecovered) throw new Error(`reload recovery did not record exactly once: ${JSON.stringify(recoveryProgress)}, expected ${299 + rounds}`);
    await saveShot(page, rowId, 'recovered', screenshots);
    await page.locator('#egg').waitFor({ state: 'visible', timeout: 5000 });
    if (pageErrors.length || failedLocalRequests.length) throw new Error('browser/runtime request failure');
  } catch (error) {
    fatal = `${error.name}: ${error.message}`;
    try { await saveShot(page, rowId, 'failure', screenshots); } catch {}
  } finally {
    allScreenshots.push(...screenshots.map(item => ({ ...item, viewport: viewportName, tier })));
    await context.close();
  }
  const longPass = !fatal && rounds === ROUNDS + 1 && wrongRecovered && rapidProtected && reloadRecovered;
  return {
    id: rowId,
    activityId: 'surprise-pop',
    route: '/games/surprise-pop.html',
    tier,
    viewport: viewportName,
    checks: {
      score: na('Surprise Pop has no score or win/loss score state.'),
      rewards: !fatal && reward ? pass(`299 to 300 produced one persisted repeat reward ${tier <= 2 ? 'deferred to the Games hub' : 'in the activity'}.`) : fail(fatal || 'reward incomplete'),
      restart: na('Surprises auto-reset; this activity has no explicit restart control.'),
      long_repeated_play: longPass ? pass(`${ROUNDS} reveals plus post-reload recovery; rapid input stayed single-settled${tier >= 5 ? '; wrong guess recovered' : ''}.`) : fail(fatal || 'repeated play incomplete'),
      visual_quality: blk('Automated geometry passed; screenshots/contact sheets require visual inspection.'),
    },
    rounds,
    wrongRecovered,
    rapidProtected,
    reloadRecovered,
    reward,
    collectionBeforeReload,
    collectionAfterReload,
    geometrySamples,
    blockedExternal,
    pageErrors,
    failedLocalRequests,
    screenshotCount: screenshots.length,
    fatal,
  };
}

if (path.dirname(OUT) !== path.join(ROOT, 'tests', 'e2e', 'out') || path.basename(OUT) !== 'surprise-pop-visual-play') {
  throw new Error(`refusing unsafe output cleanup: ${OUT}`);
}
rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, 'contact-sheets'), { recursive: true });
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.mjs')], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
});
for (let attempt = 0; attempt < 100; attempt++) {
  try { await health(base); break; }
  catch { if (attempt === 99) throw new Error('local server did not start'); await new Promise(resolve => setTimeout(resolve, 100)); }
}
const browser = await chromium.launch();
const jobs = [];
for (const viewportName of SELECTED_VIEWPORTS) for (const tier of SELECTED_TIERS) {
  jobs.push({ viewportName, viewport: VIEWPORTS[viewportName], tier });
}
const rows = [], screenshots = [];
try {
  async function worker() {
    while (jobs.length) {
      const job = jobs.shift();
      const row = await runCell(browser, base, job.viewportName, job.viewport, job.tier, screenshots);
      rows.push(row);
      console.log(`${row.fatal ? 'FAIL' : 'PASS'} ${row.id} rounds=${row.rounds}${row.fatal ? ' ' + row.fatal : ''}`);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  for (const viewportName of SELECTED_VIEWPORTS) {
    await createContactSheet(browser, screenshots.filter(item => item.viewport === viewportName), path.join(OUT, 'contact-sheets', `${viewportName}.png`), `Surprise Pop ${viewportName} T1-T10`);
  }
} finally {
  await browser.close();
  server.kill();
}
rows.sort((a, b) => a.id.localeCompare(b.id));
const counts = { rows: rows.length, pass: 0, fail: 0, na: 0, blk: 0 };
for (const row of rows) for (const value of Object.values(row.checks)) counts[value.status.toLowerCase()]++;
const report = {
  auditStart: AUDIT_START,
  productBaseline: PRODUCT_BASELINE,
  surprisePopSha256: sha256(path.join(ROOT, 'games/surprise-pop.html')),
  generatedAt: new Date().toISOString(),
  roundsPerRow: ROUNDS,
  counts,
  screenshots: screenshots.length,
  rows,
};
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...counts, screenshots: screenshots.length }));
if (rows.length !== SELECTED_TIERS.length * SELECTED_VIEWPORTS.length
  || counts.fail || rows.some(row => row.fatal || row.pageErrors.length || row.failedLocalRequests.length)) process.exitCode = 1;
