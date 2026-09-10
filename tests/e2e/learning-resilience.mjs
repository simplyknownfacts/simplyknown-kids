// Negative/failure/recovery audit scaffold for all ten Learning routes at T1-T10.
// Synthetic profiles only. The runner owns and health-checks its localhost
// server before every row so a vanished preview cannot become product evidence.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.join(import.meta.dirname, 'out', 'learning-resilience');
const APP_BASELINE = 'd6687a38b2a466e13de00f9553efeb23e9f84d8f';
const VIEWPORTS = {
  desktop: { width: 1280, height: 900, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
};
const LESSONS = [
  { id: 'hello-colors', route: '/learning/hello-colors.html', ready: '.thing-card', alive: '#screen', instruction: '#quizLabel, #colorLabel' },
  { id: 'animal-sounds', route: '/learning/animal-sounds.html', ready: '#garden .animal-float, #quizStage .choice-btn', alive: '#garden, #quizArea', instruction: '#instruction' },
  { id: 'count-along', route: '/learning/count-along.html', ready: '#stage .dot, #stage .num-btn', alive: '#stage', instruction: '#instruction' },
  { id: 'abcs', route: '/learning/abcs.html', ready: '#body .letter-big', alive: '#stage', instruction: '#body .subtitle' },
  { id: 'days', route: '/learning/days.html', ready: '#body .day-tile', alive: '#stage', instruction: '#hint' },
  { id: 'math', route: '/learning/math.html', ready: '#body .num-btn', alive: '#stage', instruction: '#hint' },
  { id: 'clock', route: '/learning/clock.html', ready: '#choices .num-btn', alive: '#stage', instruction: '#hint' },
  { id: 'spelling', route: '/learning/spelling.html', ready: '#body .word-card, #body .letter-tile', alive: '#stage', instruction: '#hint' },
  { id: 'money', route: '/learning/money.html', ready: '#body .coin-svg, #body .bill-svg, #body .num-btn', alive: '#stage', instruction: '#hint' },
  { id: 'body-parts', route: '/learning/body-parts.html', ready: '#figure .hit', alive: '#stage', instruction: '#hint' },
];
const TIERS = [1,2,3,4,5,6,7,8,9,10];
const selectedTiers = process.env.TIERS ? process.env.TIERS.split(',').map(Number) : TIERS;
const selectedViewports = process.env.VIEWPORTS ? process.env.VIEWPORTS.split(',') : Object.keys(VIEWPORTS);
const selectedLessons = process.env.LEARNING ? process.env.LEARNING.split(',') : LESSONS.map(lesson => lesson.id);

for (const tier of selectedTiers) if (!TIERS.includes(tier)) throw new Error(`unknown tier ${tier}`);
for (const viewport of selectedViewports) if (!VIEWPORTS[viewport]) throw new Error(`unknown viewport ${viewport}`);
for (const lesson of selectedLessons) if (!LESSONS.some(candidate => candidate.id === lesson)) throw new Error(`unknown Learning route ${lesson}`);

const pass = note => ({ status: 'PASS', note });
const fail = note => ({ status: 'FAIL', note });
const na = note => ({ status: 'NA', note });
const blk = note => ({ status: 'BLK', note });

async function freePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

function birthdayForTier(tier) {
  const months = { 1: 6, 2: 18, 3: 30, 4: 42, 5: 54, 6: 66, 7: 78, 8: 90, 9: 102, 10: 114 }[tier];
  const date = new Date(); date.setDate(15); date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

function featuresFor(id, tier) {
  const features = {
    'hello-colors': { colorQuiz: tier >= 4 },
    'animal-sounds': { quizMode: tier >= 4 },
    'count-along': { quizMode: tier >= 4 },
    abcs: { wordHints: tier >= 3 },
    days: { quizMode: tier >= 5 },
    math: { subtract: tier >= 5, multiply: tier >= 8, divide: tier >= 9, missingNumber: tier >= 10 },
    spelling: { spellMode: tier >= 6 },
    money: { countMode: tier >= 6, makeChange: tier >= 9 },
    'body-parts': { allParts: tier >= 4 },
  };
  return features[id] || {};
}

function seed() {
  return ({ lesson, tier, birthday, features }) => {
    const profile = {
      id: `learning-resilience-t${tier}`, name: `Test${tier}`, birthday,
      color: '#4ECDC4', voice: 'girl', mascot: { id: 'dog' },
      tierOverrides: {}, features: { [lesson]: features },
      activitiesVisible: { [lesson]: true }, youtube: [],
    };
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    localStorage.setItem('vb_pin', '1234');
    localStorage.removeItem('vb_pin_lockout');
    window.__auditMediaPlay = 0;
    try {
      const nativePlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        window.__auditMediaPlay++;
        return nativePlay.apply(this, args).catch(() => {});
      };
    } catch {}
    try { navigator.vibrate = () => true; } catch {}
  };
}

async function health(base) {
  const response = await fetch(base + '/__health.json');
  if (!response.ok) throw new Error(`local server health failed: ${response.status}`);
  const identity = await response.json();
  if (identity.app !== 'kids') throw new Error(`wrong local app: ${identity.app || 'missing identity'}`);
}

async function alive(page, lesson) {
  return page.url().endsWith(lesson.route) && await page.locator(lesson.alive).count() > 0;
}

async function visibleInstruction(page, lesson) {
  return page.locator(lesson.instruction).evaluateAll(nodes => {
    const node = nodes.find(candidate => {
      const style = getComputedStyle(candidate); const rect = candidate.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 && candidate.textContent.trim();
    });
    return node ? node.textContent.trim() : '';
  });
}

async function geometry(page, lesson) {
  return page.evaluate(({ ready, aliveSelector }) => {
    const visible = selector => [...document.querySelectorAll(selector)].find(node => {
      const style = getComputedStyle(node); const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    const intersects = node => { const r = node?.getBoundingClientRect(); return !!r && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight; };
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      ready: intersects(visible(ready)), alive: intersects(visible(aliveSelector)),
      nav: intersects(visible('.nav-chrome')),
    };
  }, { ready: lesson.ready, aliveSelector: lesson.alive });
}

async function visit(page, base, lesson) {
  await page.goto(base + lesson.route, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.locator(lesson.ready).first().waitFor({ timeout: 12000 });
}

async function rapidAndBoundaryProbe(page, lesson) {
  const target = page.locator(lesson.ready).first();
  const box = await target.boundingBox();
  if (!box) return false;
  const x = Math.max(1, box.x + Math.min(2, box.width / 2));
  const y = Math.max(1, box.y + Math.min(2, box.height / 2));
  await page.mouse.dblclick(x, y, { delay: 10 });
  await page.mouse.click(x, y);
  return true;
}

async function runCell(browser, base, viewportName, viewport, tier, lesson) {
  await health(base);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile, hasTouch: viewport.hasTouch,
    reducedMotion: 'reduce', serviceWorkers: 'allow',
  });
  await context.addInitScript(seed(), {
    lesson: lesson.id, tier, birthday: birthdayForTier(tier), features: featuresFor(lesson.id, tier),
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const checks = {};
  let phase = 'launch';
  try {
    await visit(page, base, lesson);
    checks.launch = pass('Learning route loaded with its primary activity surface');
    const instruction = await visibleInstruction(page, lesson);
    checks.instructions = instruction ? pass(`visible instruction: ${instruction.slice(0, 100)}`) : fail('no visible on-screen instruction');
    checks.back_home = await page.locator('.back-btn').isVisible() && await page.locator('.home-btn').isVisible()
      ? pass('Back and Home visible') : fail('Back or Home missing');
    const initial = await geometry(page, lesson);
    checks.layout_bounds = initial.overflow <= 1 && initial.ready && initial.alive && initial.nav
      ? pass('primary activity/navigation visible; no horizontal overflow')
      : fail(`overflow=${initial.overflow} ready=${initial.ready} alive=${initial.alive} nav=${initial.nav}`);
    checks.visual_quality = blk('geometry is automated; full visual-quality judgement remains unreviewed');
    checks.score = na('Learning route has no score counter');
    checks.rewards = blk('bounded resilience pass does not prove award timing or duplication');
    checks.restart = blk('reload recovery is tested separately; no dedicated restart control is asserted');

    const probed = await rapidAndBoundaryProbe(page, lesson);
    await page.keyboard.press('Escape'); await page.keyboard.press('Tab'); await page.keyboard.press('KeyQ');
    const responsive = await alive(page, lesson);
    checks.rapid_double_input = probed && responsive ? pass('rapid repeated input left lesson responsive') : fail('rapid input broke or exited lesson');
    checks.boundary_taps = probed && responsive ? pass('edge-of-control input left lesson responsive') : fail('boundary input broke lesson');
    checks.keyboard_misuse = responsive ? pass('unrelated keys did not exit or complete lesson') : fail('keyboard misuse broke lesson');
    checks.drag_outside = na('no Learning route requires drag-to-target input');
    checks.wrong_answers = lesson.id === 'abcs' || (lesson.id === 'hello-colors' && tier <= 3)
      || (lesson.id === 'animal-sounds' && tier <= 3) || (lesson.id === 'count-along' && tier <= 3)
      || (lesson.id === 'days' && tier <= 4)
      ? na('this age/mode has no wrong-answer mechanic')
      : blk('applicable wrong-answer recovery needs the activity-specific probe');

    await page.setViewportSize(viewportName === 'phone' ? { width: 844, height: 390 } : { width: 900, height: 1280 });
    await page.waitForTimeout(100);
    const resized = await geometry(page, lesson);
    checks.resize_orientation = resized.overflow <= 1 && resized.ready && resized.alive && resized.nav
      ? pass('viewport/orientation change preserved controls')
      : fail(`overflow=${resized.overflow} ready=${resized.ready} alive=${resized.alive} nav=${resized.nav}`);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    phase = 'reload';
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator(lesson.ready).first().waitFor({ timeout: 12000 });
    checks.reload_mid_round = await alive(page, lesson) ? pass('reload restored a playable lesson') : fail('reload did not restore lesson');
    phase = 'navigation';
    await rapidAndBoundaryProbe(page, lesson);
    await page.locator('.back-btn').click(); await page.waitForURL(/\/learning\/(index\.html)?$/);
    checks.navigation_during_animation = pass('Back during active state reached Learning');
    await visit(page, base, lesson); await page.locator('.back-btn').click(); await page.waitForURL(/\/learning\/(index\.html)?$/); await visit(page, base, lesson);
    checks.repeated_entry_exit = pass('two exit/re-entry cycles restored lesson');

    phase = 'corrupt-state';
    await page.evaluate(({ lessonId }) => {
      sessionStorage.setItem('vb_pending_celebration', '{broken-json');
      const profiles = JSON.parse(localStorage.getItem('vb_profiles') || '[]');
      if (profiles[0]) {
        profiles[0].features = profiles[0].features || {};
        profiles[0].features[lessonId] = 'malformed-feature-state';
        profiles[0].tierOverrides = { [lessonId]: 'not-a-tier' };
        localStorage.setItem('vb_profiles', JSON.stringify(profiles));
      }
    }, { lessonId: lesson.id });
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator(lesson.ready).first().waitFor({ timeout: 12000 });
    checks.stale_corrupt_synthetic_state = await alive(page, lesson)
      ? pass('malformed pending/feature/tier-override data did not block launch')
      : fail('corrupt synthetic state blocked lesson');
    checks.empty_min_max_values = tier === 1 || tier === 10
      ? pass(`T${tier} age boundary remained playable`) : na('age min/max boundary applies to T1/T10');

    phase = 'media-failure';
    let blockedMediaRequests = 0;
    await context.route(/\.(mp3|wav|ogg|m4a|mp4|webm)(\?|$)/i, route => { blockedMediaRequests++; return route.abort('failed'); });
    await page.addInitScript(() => {
      window.__auditRejectedMedia = 0;
      try { HTMLMediaElement.prototype.play = () => { window.__auditRejectedMedia++; return Promise.reject(new DOMException('synthetic media failure')); }; } catch {}
    });
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator(lesson.ready).first().waitFor({ timeout: 12000 });
    await rapidAndBoundaryProbe(page, lesson);
    await page.waitForTimeout(150);
    const rejectedMedia = await page.evaluate(() => window.__auditRejectedMedia || 0);
    checks.failed_media_network = blockedMediaRequests
      ? (await alive(page, lesson) ? pass(`${blockedMediaRequests} blocked media requests did not block lesson`) : fail('blocked media broke lesson'))
      : na('this route made no media request during the bounded probe');
    checks.interrupted_audio = rejectedMedia
      ? (await alive(page, lesson) ? pass(`recovered from ${rejectedMedia} rejected media plays`) : fail('audio interruption broke lesson'))
      : na('this route made no media play during the bounded probe');
    await context.unroute(/\.(mp3|wav|ogg|m4a|mp4|webm)(\?|$)/i);

    phase = 'offline';
    const controlled = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      await navigator.serviceWorker.register('../sw.js', { updateViaCache: 'none' });
      await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))]);
      return !!navigator.serviceWorker.controller;
    }).catch(() => false);
    if (!controlled) await page.reload({ waitUntil: 'domcontentloaded' });
    if (!await page.evaluate(() => !!navigator.serviceWorker.controller)) throw new Error('service worker did not control page');
    await page.reload({ waitUntil: 'networkidle' }); await page.locator(lesson.ready).first().waitFor({ timeout: 12000 });
    await page.waitForFunction(() => caches.match(location.href).then(Boolean), null, { timeout: 8000 });
    await context.setOffline(true); await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator(lesson.ready).first().waitFor({ timeout: 12000 });
    checks.offline = await alive(page, lesson) ? pass('controlled offline reload restored lesson') : fail('offline reload failed');
    await context.setOffline(false);
    checks.timer_expiry = na('Learning route has no child-facing countdown-expiry mechanic');
    checks.long_repeated_play = blk('bounded run is not a long-duration soak');

    if (Object.values(checks).some(result => result.status === 'FAIL')) {
      const dir = path.join(OUT, 'failures'); mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${lesson.id}-T${tier}-${viewportName}.png`), fullPage: true });
    }
  } catch (error) {
    checks.runner = fail(`${phase}: ${error.name}: ${error.message}`);
    try { const dir = path.join(OUT, 'failures'); mkdirSync(dir, { recursive: true }); await page.screenshot({ path: path.join(dir, `${lesson.id}-T${tier}-${viewportName}.png`), fullPage: true }); } catch {}
  } finally {
    await context.setOffline(false).catch(() => {});
    await context.close();
  }
  if (errors.length) checks.runtime_errors = fail(errors.slice(0, 5).join(' | '));
  return { id: `${lesson.id}:T${tier}:${viewportName}`, activityId: lesson.id, route: lesson.route, tier, viewport: viewportName, checks, errors };
}

mkdirSync(OUT, { recursive: true });
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], {
  cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
});
for (let i = 0; i < 100; i++) {
  try { await health(base); break; }
  catch { if (i === 99) throw new Error('local server did not start'); await new Promise(resolve => setTimeout(resolve, 100)); }
}
const browser = await chromium.launch();
const started = Date.now();
const queue = [];
for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) if (selectedViewports.includes(viewportName)) {
  for (const tier of selectedTiers) for (const lesson of LESSONS) if (selectedLessons.includes(lesson.id)) queue.push({ viewportName, viewport, tier, lesson });
}
const rows = [];
try {
  async function worker() {
    while (queue.length) {
      const job = queue.shift();
      const row = await runCell(browser, base, job.viewportName, job.viewport, job.tier, job.lesson);
      rows.push(row);
      const failures = Object.values(row.checks).filter(result => result.status === 'FAIL').length;
      console.log(`${failures ? 'FAIL' : 'PASS'} ${row.id}${failures ? ` (${failures})` : ''}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, queue.length || 1) }, worker));
} finally {
  await browser.close();
  server.kill();
}
rows.sort((a, b) => a.id.localeCompare(b.id));
const counts = { rows: rows.length, pass: 0, fail: 0, na: 0, blk: 0 };
for (const row of rows) for (const result of Object.values(row.checks)) counts[result.status.toLowerCase()]++;
const report = { baseline: APP_BASELINE, base, generatedAt: new Date().toISOString(), durationSec: Math.round((Date.now() - started) / 1000), counts, rows };
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...counts, durationSec: report.durationSec }));
if (rows.length !== selectedViewports.length * selectedTiers.length * selectedLessons.length || counts.fail) process.exitCode = 1;
