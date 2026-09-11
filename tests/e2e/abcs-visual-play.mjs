// ABCs T1-T10 phone/desktop repeated-play and visual audit.
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
const OUT = path.join(import.meta.dirname, 'out', 'abcs-visual-play');
const AUDIT_START = 'd2467b97ee7db79863d76211eed8d360e35a01c7';
const VIEWPORTS = {
  desktop: { width: 1280, height: 900, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
};
const PROBE_VIEWPORTS = {
  'short-phone': { width: 320, height: 568, isMobile: true, hasTouch: true },
  tablet: { width: 820, height: 1180, isMobile: true, hasTouch: true },
};
const TIERS = [1,2,3,4,5,6,7,8,9,10];
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
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

function init({ tier, bday, probe = false, wordHints = false }) {
  const profile = {
    id: `abcs-t${tier}`,
    name: 'ABCs Test',
    birthday: bday,
    color: '#4ECDC4',
    voice: 'girl',
    mascot: { id: 'dog' },
    tierOverrides: { abcs: tier },
    activitiesVisible: { abcs: true },
    features: { abcs: { wordHints } },
    achievements: {
      unlocked: {
        'abcs.first': { at: 1 },
        'abcs.milestone.bronze': { at: 1 },
      },
      counters: { abcs: probe ? 0 : 119 },
      repeats: {},
      streak: { last: null, current: 0, best: 0 },
      xp: 2,
      rank: 'sprout',
    },
  };
  if (!sessionStorage.__abcsSeed) {
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    sessionStorage.__abcsSeed = '1';
  }
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

async function state(page) {
  return page.evaluate(() => {
    const profile = JSON.parse(localStorage.vb_profiles || '[]')[0] || {};
    return {
      counter: profile.achievements?.counters?.abcs || 0,
      repeat: profile.achievements?.repeats?.abcs || 0,
      mastery: !!profile.achievements?.unlocked?.['abcs.mastery'],
    };
  });
}

async function letter(page) {
  return (await page.locator('.letter-big').innerText()).trim();
}

async function measureGeometry(page) {
  await page.waitForTimeout(100);
  const targets = page.locator('.letter-big,.start-tile,.pager-btn');
  const boxes = [];
  for (let index = 0; index < await targets.count(); index++) {
    await targets.nth(index).scrollIntoViewIfNeeded();
    const box = await targets.nth(index).boundingBox();
    if (box) boxes.push({ left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height, width: box.width, height: box.height });
  }
  await page.locator('.screen').evaluate(element => { element.scrollTop = 0; });
  return page.evaluate(targets => {
    const nav = [...document.querySelectorAll('.back-btn,.home-btn,#gameSettingsGear,.settings-gear')].map(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    });
    return {
      targetCount: targets.length,
      minTarget: targets.length ? Math.min(...targets.map(box => Math.min(box.width, box.height))) : null,
      clippedTargets: targets.filter(box => box.left < -1 || box.right > innerWidth + 1 || box.top < -1 || box.bottom > innerHeight + 1).length,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      minNavTarget: nav.length ? Math.min(...nav.map(box => Math.min(box.width, box.height))) : null,
      navClipped: nav.filter(box => box.left < -1 || box.top < -1 || box.right > innerWidth + 1 || box.bottom > innerHeight + 1).length,
    };
  }, boxes);
}

async function inspectReward(page, tier, base, rowId, screenshots) {
  if (tier <= 2) {
    await page.locator('.back-btn').click();
    await page.waitForURL(/\/learning\/(index\.html)?$/);
  }
  await page.locator('.vb-celebrate.in').waitFor({ timeout: 5000 });
  await page.waitForTimeout(200);
  const reward = await page.locator('.vb-celebrate').evaluate(element => {
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
  if (tier <= 2) await page.goto(base + '/learning/abcs.html', { waitUntil: 'load' });
  return reward;
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
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch, reducedMotion: 'no-preference', serviceWorkers: 'block' });
  const pageErrors = [], failedLocalRequests = [], expectedMediaAborts = [], screenshots = [], geometrySamples = [], sequence = [];
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort('blockedbyclient'));
  await context.addInitScript(init, { tier, bday: birthday(tier), wordHints: false });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => {
    if (!request.url().startsWith(base)) return;
    const detail = `${request.url()} ${request.failure()?.errorText || ''}`;
    if (request.resourceType() === 'media' && request.failure()?.errorText === 'net::ERR_ABORTED') expectedMediaAborts.push(detail);
    else failedLocalRequests.push(detail);
  });
  let fatal = null, reward = null, masteryGallery = null, counterBefore = null, counterAfter = null, repeatAfter = null, masteryAfter = null;
  let tileInput = false, featureMode = tier >= 3, fullCycle = false, rapidExact = false, previousExact = false, reloadRecovered = false;
  try {
    await page.goto(base + '/learning/abcs.html', { waitUntil: 'load' });
    counterBefore = (await state(page)).counter;
    const labels = await page.locator('.start-name').count();
    if (labels !== (tier >= 3 ? 4 : 0)) throw new Error(`default word-hint labels=${labels}`);
    geometrySamples.push(await measureGeometry(page));
    await saveShot(page, rowId, 'initial-a', screenshots);

    await page.evaluate(() => {
      window.__abcsSpoken = [];
      const original = window.speak;
      window.speak = function (...args) {
        window.__abcsSpoken.push(String(args[0]));
        return original.apply(this, args);
      };
    });
    await page.locator('.letter-big').click();
    for (const tile of await page.locator('.start-tile').all()) await tile.click();
    const spoken = await page.evaluate(() => window.__abcsSpoken.slice());
    tileInput = spoken.length === 5 && spoken[0] === 'A' && spoken.slice(1).join(',') === 'Apple,Ant,Airplane,Alligator';

    if (tier === 2) {
      await page.evaluate(() => setProfileFeature(getActiveProfile().id, 'abcs', 'wordHints', true));
      await page.reload({ waitUntil: 'load' });
      featureMode = await page.locator('.start-name').count() === 4;
      await saveShot(page, rowId, 'word-hints-enabled', screenshots);
      await page.evaluate(() => setProfileFeature(getActiveProfile().id, 'abcs', 'wordHints', false));
      await page.reload({ waitUntil: 'load' });
    }

    await page.locator('.pager-btn:not(.secondary)').dispatchEvent('pointerdown');
    await page.waitForFunction(() => JSON.parse(localStorage.vb_profiles)[0].achievements.counters.abcs === 120);
    reward = await inspectReward(page, tier, base, rowId, screenshots);

    await page.reload({ waitUntil: 'load' });
    sequence.push(await letter(page));
    for (let index = 0; index < 26; index++) {
      await page.locator('.pager-btn:not(.secondary)').dispatchEvent('pointerdown');
      sequence.push(await letter(page));
      if (index === 11) {
        geometrySamples.push(await measureGeometry(page));
        await saveShot(page, rowId, 'mid-m', screenshots);
      }
      if (index === 24) await saveShot(page, rowId, 'letter-z', screenshots);
    }
    fullCycle = sequence.length === 27 && sequence.slice(0, 26).join('') === ALPHABET.join('') && sequence.at(-1) === 'A';
    await saveShot(page, rowId, 'wrapped-a', screenshots);

    const beforeRapid = (await state(page)).counter;
    await page.locator('.pager-btn:not(.secondary)').dispatchEvent('pointerdown');
    await page.locator('.pager-btn:not(.secondary)').dispatchEvent('pointerdown');
    await page.locator('.pager-btn:not(.secondary)').dispatchEvent('pointerdown');
    rapidExact = (await state(page)).counter === beforeRapid + 3 && await letter(page) === 'D';
    await saveShot(page, rowId, 'rapid-d', screenshots);

    const beforePrevious = (await state(page)).counter;
    await page.locator('.pager-btn.secondary').dispatchEvent('pointerdown');
    const afterBack = await letter(page);
    await page.locator('.pager-btn:not(.secondary)').dispatchEvent('pointerdown');
    previousExact = afterBack === 'C' && await letter(page) === 'D' && (await state(page)).counter === beforePrevious + 1;

    const beforeReload = (await state(page)).counter;
    await page.reload({ waitUntil: 'load' });
    const reloadLetter = await letter(page);
    await page.locator('.pager-btn:not(.secondary)').dispatchEvent('pointerdown');
    reloadRecovered = reloadLetter === 'A' && await letter(page) === 'B' && (await state(page)).counter === beforeReload + 1;
    geometrySamples.push(await measureGeometry(page));
    await saveShot(page, rowId, 'reload-recovery-b', screenshots);

    const final = await state(page);
    counterAfter = final.counter;
    repeatAfter = final.repeat;
    masteryAfter = final.mastery;
    if (tier === 6 && viewportName === 'desktop') {
      await page.goto(base + '/achievements.html', { waitUntil: 'load' });
      const cell = page.locator('.gallery-cell').filter({ hasText: 'Word Builder' }).first();
      await cell.scrollIntoViewIfNeeded();
      masteryGallery = await cell.evaluate(element => ({
        title: element.querySelector('.cell-label')?.textContent?.trim() || '',
        hint: element.querySelector('.cell-hint')?.textContent?.trim() || '',
        locked: element.querySelector('.vb-ribbon')?.classList.contains('locked') || false,
        ariaLabel: element.querySelector('.vb-ribbon')?.getAttribute('aria-label') || '',
      }));
      const file = path.join(OUT, 'screenshots', `${rowId.replaceAll(':', '-')}-${String(screenshots.length + 1).padStart(2, '0')}-impossible-mastery-gallery.png`);
      await cell.screenshot({ path: file });
      screenshots.push({ rowId, label: 'impossible-mastery-gallery', file });
    }
    if (pageErrors.length || failedLocalRequests.length) throw new Error(`browser/runtime request failure: ${JSON.stringify({ pageErrors, failedLocalRequests })}`);
  } catch (error) {
    fatal = `${error.name}: ${error.message}`;
    try { await saveShot(page, rowId, 'failure', screenshots); } catch {}
  } finally {
    allScreenshots.push(...screenshots.map(item => ({ ...item, viewport: viewportName, tier })));
    await context.close();
  }
  const geometryPass = geometrySamples.length === 3 && geometrySamples.every(sample => sample.minTarget >= 44 && sample.minNavTarget >= 44 && sample.horizontalOverflow <= 1 && !sample.clippedTargets && !sample.navClipped);
  const repeatRewardPass = reward?.title === 'ABCs Star' && reward?.hint === 'Saved in your gallery' && reward?.inViewport && repeatAfter === 1;
  const exactProgression = counterAfter === counterBefore + 32;
  const masteryDefinitionUnreachable = masteryAfter === false;
  return {
    id: rowId,
    activityId: 'abcs',
    route: '/learning/abcs.html',
    tier,
    viewport: viewportName,
    checks: {
      input: !fatal && tileInput && rapidExact && previousExact ? 'PASS' : 'FAIL',
      progression: !fatal && exactProgression && fullCycle ? 'PASS' : 'FAIL',
      rewards: !fatal && repeatRewardPass && !masteryDefinitionUnreachable ? 'PASS' : 'FAIL',
      restart: !fatal && reloadRecovered ? 'PASS' : 'FAIL',
      long_repeated_play: !fatal && fullCycle && rapidExact ? 'PASS' : 'FAIL',
      visual_quality: !fatal && geometryPass ? 'PASS' : 'FAIL',
    },
    counterBefore,
    counterAfter,
    expectedCounter: counterBefore == null ? null : counterBefore + 32,
    repeatAfter,
    masteryAfter,
    masteryDefinitionUnreachable,
    masteryGallery,
    reward,
    tileInput,
    featureMode,
    sequence,
    fullCycle,
    rapidExact,
    previousExact,
    reloadRecovered,
    geometrySamples,
    pageErrors,
    failedLocalRequests,
    expectedMediaAborts,
    screenshotCount: screenshots.length,
    fatal,
  };
}

async function runProbe(browser, base, viewportName, viewport, tier, allScreenshots) {
  const rowId = `abcs-probe:T${tier}:${viewportName}`;
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort('blockedbyclient'));
  await context.addInitScript(init, { tier, bday: birthday(tier), probe: true, wordHints: tier === 2 });
  const page = await context.newPage();
  const screenshots = [], geometrySamples = [];
  let fatal = null;
  try {
    await page.goto(base + '/learning/abcs.html', { waitUntil: 'load' });
    for (let index = 0; index < 3; index++) {
      geometrySamples.push(await measureGeometry(page));
      await saveShot(page, rowId, `letter-${await letter(page)}`, screenshots);
      await page.locator('.pager-btn:not(.secondary)').dispatchEvent('pointerdown');
    }
  } catch (error) {
    fatal = `${error.name}: ${error.message}`;
  } finally {
    allScreenshots.push(...screenshots.map(item => ({ ...item, viewport: viewportName, tier })));
    await context.close();
  }
  const geometryPass = geometrySamples.length === 3 && geometrySamples.every(sample => sample.minTarget >= 44 && sample.minNavTarget >= 44 && sample.horizontalOverflow <= 1 && !sample.clippedTargets && !sample.navClipped);
  return { id: rowId, tier, viewport: viewportName, pass: !fatal && geometryPass, geometrySamples, screenshotCount: screenshots.length, fatal };
}

if (path.dirname(OUT) !== path.join(ROOT, 'tests', 'e2e', 'out') || path.basename(OUT) !== 'abcs-visual-play') throw new Error(`refusing unsafe output cleanup: ${OUT}`);
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
      console.log(`${row.fatal ? 'ERROR' : 'DONE'} ${row.id} letters=${row.sequence.length}${row.fatal ? ' ' + row.fatal : ''}`);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);

  const probeJobs = [];
  for (const [viewportName, viewport] of Object.entries(PROBE_VIEWPORTS)) for (const tier of [2,3,6,10]) probeJobs.push({ viewportName, viewport, tier });
  async function probeWorker() {
    while (probeJobs.length) {
      const job = probeJobs.shift();
      const probe = await runProbe(browser, base, job.viewportName, job.viewport, job.tier, screenshots);
      probes.push(probe);
      console.log(`${probe.pass ? 'DONE' : 'ERROR'} ${probe.id}`);
    }
  }
  await Promise.all([probeWorker(), probeWorker(), probeWorker(), probeWorker()]);

  for (const viewportName of [...Object.keys(VIEWPORTS), ...Object.keys(PROBE_VIEWPORTS)]) {
    const items = screenshots.filter(item => item.viewport === viewportName);
    if (items.length) await createContactSheet(browser, items, path.join(OUT, 'contact-sheets', `${viewportName}.png`), `ABCs ${viewportName}`);
  }
} finally {
  await browser.close();
  server.kill();
}

rows.sort((a, b) => a.id.localeCompare(b.id));
probes.sort((a, b) => a.id.localeCompare(b.id));
const counts = { rows: rows.length, pass: 0, fail: 0 };
for (const row of rows) for (const status of Object.values(row.checks)) counts[status.toLowerCase()]++;
const abcsSource = readFileSync(path.join(ROOT, 'learning', 'abcs.html'), 'utf8');
const masterySourceCalls = [...abcsSource.matchAll(/vbProgress\.mastery\s*\(/g)].length;
const report = {
  auditStart: AUDIT_START,
  abcsSha256: sha256(path.join(ROOT, 'learning', 'abcs.html')),
  generatedAt: new Date().toISOString(),
  evidenceBoundary: 'Browser-driven pointer/touch emulation and silent local media stubs with inspected renders; no physical child-touch or human-audible voice-quality claim.',
  counts,
  screenshots: screenshots.length,
  fullAlphabetCycles: rows.filter(row => row.fullCycle).length,
  recordedLetterActions: rows.reduce((sum, row) => sum + Math.max(0, (row.counterAfter || 0) - (row.counterBefore || 0)), 0),
  mastery: {
    definition: 'abcs.mastery / Word Builder / Spell a short word',
    sourceCalls: masterySourceCalls,
    unlockedAfterEveryFullCycle: rows.filter(row => row.masteryAfter).length,
    finding: masterySourceCalls === 0 && rows.every(row => row.masteryDefinitionUnreachable)
      ? 'ABCs still advertises Word Builder mastery, but the activity removed spelling and has no mastery award path.'
      : null,
  },
  rows,
  probes,
};
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...counts, probes: probes.length, probePass: probes.filter(probe => probe.pass).length, screenshots: screenshots.length, fullAlphabetCycles: report.fullAlphabetCycles, masteryFinding: !!report.mastery.finding }));
if (rows.length !== 20 || rows.some(row => row.fatal || Object.values(row.checks).includes('FAIL') || row.pageErrors.length || row.failedLocalRequests.length) || probes.some(probe => !probe.pass) || !report.mastery.finding) process.exitCode = 1;
