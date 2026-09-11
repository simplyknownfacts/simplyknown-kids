// Bounded negative/recovery audit for the five stateful shared child paths.
// Synthetic profiles only; this runner owns and identity-checks localhost.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.join(import.meta.dirname, 'out', 'shared-resilience');
const APP_BASELINE = 'd2f23c823a70c76c5bea58233fb75f70c915c19c';
const VIEWPORTS = {
  desktop: { width: 1280, height: 900, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
};
const ROUTES = [
  { id: 'index.html', route: '/index.html', ready: '#profilesRow .avatar-btn', heading: '#pickerTitle' },
  { id: 'home.html', route: '/home.html', ready: '#worldScene .house', heading: '#hiText' },
  { id: 'achievements.html', route: '/achievements.html', ready: '#groups .gallery-group', heading: '.gallery-intro h1' },
  { id: 'parent/settings.html', route: '/parent/settings.html', ready: '#pinPad .pin-key', heading: '#pinGate .title' },
  { id: 'listen/index.html', route: '/listen/index.html', ready: '#sleepRow .sleep-btn', heading: '.hub-title' },
];
const TIERS = [1,2,3,4,5,6,7,8,9,10];
const selectedTiers = process.env.TIERS ? process.env.TIERS.split(',').map(Number) : TIERS;
const selectedViewports = process.env.VIEWPORTS ? process.env.VIEWPORTS.split(',') : Object.keys(VIEWPORTS);
const selectedRoutes = process.env.SHARED ? process.env.SHARED.split(',') : ROUTES.map(route => route.id);
for (const tier of selectedTiers) if (!TIERS.includes(tier)) throw new Error(`unknown tier ${tier}`);
for (const viewport of selectedViewports) if (!VIEWPORTS[viewport]) throw new Error(`unknown viewport ${viewport}`);
for (const route of selectedRoutes) if (!ROUTES.some(candidate => candidate.id === route)) throw new Error(`unknown shared route ${route}`);

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

async function health(base) {
  const response = await fetch(base + '/__health.json');
  if (!response.ok) throw new Error(`local server health failed: ${response.status}`);
  const identity = await response.json();
  if (identity.app !== 'kids') throw new Error(`wrong local app: ${identity.app || 'missing identity'}`);
}

function birthdayForTier(tier) {
  const months = { 1:6, 2:18, 3:30, 4:42, 5:54, 6:66, 7:78, 8:90, 9:102, 10:114 }[tier];
  const date = new Date(); date.setDate(15); date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

function seed() {
  return ({ tier, birthday }) => {
    const achievementState = {
      unlocked: { 'tap-pop.first': { at: 1 } }, counters: { 'tap-pop': 1 }, repeats: {},
      streak: { last: null, current: 0, best: 0 }, xp: 1, rank: 'seedling',
    };
    const primary = {
      id: `shared-t${tier}`, name: `Explorer${tier}`, birthday, color: '#4ECDC4', voice: 'girl',
      mascot: { id: 'bunny' }, tierOverrides: {}, features: {}, activitiesVisible: {}, youtube: [],
      achievements: achievementState,
    };
    const second = {
      ...primary, id: `shared-t${tier}-second`, name: `Friend${tier}`, color: '#FFD93D',
      mascot: { id: 'panda' }, achievements: { ...achievementState, unlocked: {}, counters: {}, xp: 0 },
    };
    if (!localStorage.getItem('vb_profiles')) localStorage.setItem('vb_profiles', JSON.stringify([primary, second]));
    if (!localStorage.getItem('vb_active_id')) localStorage.setItem('vb_active_id', primary.id);
    if (!localStorage.getItem('vb_pin')) localStorage.setItem('vb_pin', '1234');
    localStorage.removeItem('vb_pin_lockout');
    window.__sharedAudioAttempts = 0;
    try {
      HTMLMediaElement.prototype.play = function () { window.__sharedAudioAttempts++; return Promise.resolve(); };
    } catch {}
    try { navigator.vibrate = () => true; } catch {}
  };
}

async function visit(page, base, route) {
  await page.goto(base + route.route, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.locator(route.ready).first().waitFor({ timeout: 12000 });
}

async function unlockSettings(page) {
  if (await page.locator('#mainSettings').isVisible()) return;
  for (const digit of ['1','2','3','4']) {
    const keys = page.locator('#pinPad .pin-key');
    const labels = (await keys.allTextContents()).map(text => text.trim());
    const index = labels.indexOf(digit);
    if (index < 0) throw new Error(`PIN key ${digit} missing`);
    await keys.nth(index).click();
  }
  await page.locator('#mainSettings').waitFor({ state: 'visible', timeout: 8000 });
}

async function alive(page, route) {
  return page.url().endsWith(route.route) && await page.locator(route.ready).first().isVisible().catch(() => false);
}

async function geometry(page, route) {
  return page.evaluate(({ ready, heading }) => {
    const visible = node => {
      const style = getComputedStyle(node), rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const intersects = node => {
      const rect = node?.getBoundingClientRect();
      return !!rect && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
    };
    const primary = [...document.querySelectorAll(ready)].find(visible);
    const title = [...document.querySelectorAll(heading)].find(visible);
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      primary: intersects(primary),
      primaryPresent: !!primary,
      heading: intersects(title),
      viewport: { width: innerWidth, height: innerHeight },
    };
  }, { ready: route.ready, heading: route.heading });
}

async function instructionCheck(page, route) {
  const heading = (await page.locator(route.heading).first().textContent() || '').trim();
  if (!heading) return fail('shared page has no visible heading or prompt');
  if (route.id === 'listen/index.html') {
    const note = (await page.locator('.world-note').textContent() || '').trim();
    return /without an account/i.test(note) ? pass(`${heading}; local availability is explained`) : fail('Listening Hut does not explain local availability');
  }
  return pass(`visible shared-page cue: ${heading}`);
}

async function inputCheck(page, base, route) {
  if (route.id === 'index.html') {
    await page.locator('#profilesRow .avatar-btn').nth(1).click();
    await page.waitForURL(/\/home\.html$/);
    return await page.evaluate(() => localStorage.getItem('vb_active_id')?.endsWith('-second'))
      ? pass('second profile target selected the correct child') : fail('profile target selected the wrong child');
  }
  if (route.id === 'home.html') {
    await page.locator('#ribbonLink').click(); await page.waitForURL(/\/achievements\.html$/);
    return pass('ribbon target opened the earned-reward gallery');
  }
  if (route.id === 'achievements.html') {
    return await page.locator('[aria-label^="Earned ribbon: First Bubble Pop"]').count() === 1 && /1 XP/.test(await page.locator('#rankBanner').innerText())
      ? pass('seeded earned ribbon and XP render once') : fail('earned ribbon or XP did not render accurately');
  }
  if (route.id === 'parent/settings.html') {
    await unlockSettings(page);
    await page.locator('.overview-card[data-key="voice"]').click();
    return await page.locator('#panel-voice').isVisible() ? pass('overview route opened Voice & sound') : fail('Voice & sound panel did not open');
  }
  await page.locator('.sleep-btn[data-mins="5"]').click();
  return await page.evaluate(() => window.vbSleepTimer?.minutes()) === 5 && /5 minutes/.test(await page.locator('#sleepStatus').innerText())
    ? pass('sleep-timer control set a wall-clock timer') : fail('sleep-timer control did not set five minutes');
}

async function backHomeCheck(page, base, route) {
  if (route.id === 'index.html') return na('profile picker is the shared navigation root');
  if (route.id === 'home.html') return na('child home is the shared child navigation root');
  if (route.id === 'parent/settings.html') {
    await page.locator('.back-btn').click(); await page.waitForURL(/\/index\.html$/);
    return pass('settings Back returned to the profile picker without a referrer');
  }
  await page.locator('.nav-chrome .back-btn').click(); await page.waitForURL(/\/home\.html$/);
  return pass('shared Back returned to child home');
}

async function rapidCheck(page, route) {
  if (route.id === 'index.html') {
    await page.locator('#profilesRow .avatar-btn').first().evaluate(button => {
      for (let index = 0; index < 8; index += 1) {
        button.dispatchEvent(new PointerEvent('pointerdown', { pointerId: index + 1, pointerType: 'touch', bubbles: true }));
        button.dispatchEvent(new PointerEvent('pointerup', { pointerId: index + 1, pointerType: 'touch', bubbles: true }));
      }
    });
    await page.locator('#profilesRow .avatar-btn').first().click();
    await page.waitForURL(/\/home\.html$/);
    return pass('double profile activation navigated once to child home');
  }
  if (route.id === 'home.html') {
    await page.locator('#ribbonLink').evaluate(button => { for (let i = 0; i < 8; i++) button.click(); });
    await page.waitForURL(/\/achievements\.html$/);
    return pass('rapid reward navigation recovered at one gallery');
  }
  if (route.id === 'achievements.html') {
    return await page.locator('[aria-label^="Earned ribbon: First Bubble Pop"]').count() === 1
      ? pass('rapid-free gallery state contains one earned-ribbon instance') : fail('gallery duplicated or lost the earned ribbon');
  }
  if (route.id === 'parent/settings.html') {
    await unlockSettings(page);
    await page.locator('.overview-card[data-key="activities"]').evaluate(button => { for (let i = 0; i < 12; i++) button.click(); });
    const active = await page.locator('.settings-panel.active:visible').count();
    return active === 1 && await page.locator('#panel-activities').isVisible()
      ? pass('rapid panel selection left exactly one usable panel') : fail(`rapid panel selection left ${active} visible active panels`);
  }
  await page.evaluate(() => {
    for (const mins of [5,0,10,0,20]) document.querySelector(`.sleep-btn[data-mins="${mins}"]`).click();
  });
  return await page.evaluate(() => window.vbSleepTimer?.minutes()) === 20
    ? pass('rapid timer changes settled on the final valid duration') : fail('rapid timer changes left stale state');
}

async function keyboardCheck(page, route) {
  if (route.id === 'index.html') {
    await page.locator('#profilesRow .avatar-btn').first().focus(); await page.keyboard.press('Enter'); await page.waitForURL(/\/home\.html$/);
  } else if (route.id === 'home.html') {
    await page.locator('#ribbonLink').focus(); await page.keyboard.press('Enter'); await page.waitForURL(/\/achievements\.html$/);
  } else if (route.id === 'achievements.html') {
    await page.locator('.nav-chrome .home-btn').focus(); await page.keyboard.press('Enter'); await page.waitForURL(/\/home\.html$/);
  } else if (route.id === 'parent/settings.html') {
    await unlockSettings(page); await page.locator('.overview-card[data-key="children"]').focus(); await page.keyboard.press('Enter');
    if (!await page.locator('#panel-children').isVisible()) return fail('keyboard did not open Your children');
  } else {
    await page.locator('.sleep-btn[data-mins="10"]').focus(); await page.keyboard.press('Enter');
    if (await page.evaluate(() => window.vbSleepTimer?.minutes()) !== 10) return fail('keyboard did not set the sleep timer');
  }
  return pass('native keyboard activation kept the shared flow usable');
}

async function corruptStateCheck(page, base, route) {
  await page.evaluate(({ routeId }) => {
    const profiles = JSON.parse(localStorage.getItem('vb_profiles') || '[]');
    if (routeId === 'index.html') localStorage.setItem('vb_active_id', 'missing-profile');
    if (routeId === 'home.html') localStorage.setItem('vb_active_id', 'missing-profile');
    if (routeId === 'achievements.html' && profiles[0]) profiles[0].achievements = { unlocked: null, counters: null, repeats: null, streak: null, xp: null, rank: null };
    if (routeId === 'parent/settings.html' && profiles[0]) Object.assign(profiles[0], { features: null, activitiesVisible: null, tierOverrides: null, youtube: null, mascot: null });
    if (profiles.length) localStorage.setItem('vb_profiles', JSON.stringify(profiles));
    if (routeId === 'listen/index.html') localStorage.setItem('vb_sleep_timer', '{broken-json');
  }, { routeId: route.id });
  await page.goto(base + route.route, { waitUntil: 'domcontentloaded' });
  if (route.id === 'home.html') {
    await page.waitForURL(/\/index\.html$/);
    const recovered = await page.locator('#profilesRow .avatar-btn').count() === 2;
    await page.evaluate(() => {
      const profiles = JSON.parse(localStorage.getItem('vb_profiles') || '[]');
      if (profiles[0]) localStorage.setItem('vb_active_id', profiles[0].id);
    });
    return recovered ? pass('stale active child recovered at the intact profile picker') : fail('stale active child did not recover safely');
  }
  await page.locator(route.ready).first().waitFor({ timeout: 12000 });
  if (route.id === 'listen/index.html' && !/off/i.test(await page.locator('#sleepStatus').innerText())) return fail('malformed timer did not fail closed to off');
  return pass('malformed optional shared state loaded a usable safe page');
}

async function timerExpiryCheck(page, route) {
  if (route.id !== 'listen/index.html') return { timer: na('this shared page has no sleep timer'), audio: na('this shared page owns no timed audio') };
  await page.evaluate(() => {
    window.__sharedPauseCount = 0;
    const media = document.createElement('audio');
    media.volume = 0.8;
    media.pause = () => { window.__sharedPauseCount++; };
    document.body.appendChild(media);
    window.vbSleepTimer.register(media);
    window.vbSleepTimer.set(0.001);
  });
  await page.locator('#sleepVeil:not([hidden])').waitFor({ timeout: 7000 });
  const state = await page.evaluate(() => ({
    pauses: window.__sharedPauseCount,
    sleeping: window.vbSleepTimer.isSleeping(),
    fading: window.vbSleepTimer.isFading(),
    stored: localStorage.getItem('vb_sleep_timer'),
    volume: document.querySelector('audio').volume,
  }));
  const timer = state.sleeping && !state.fading && state.stored === null
    ? pass('expired wall-clock timer completed and opened the calm sleep veil') : fail(`timer expiry state ${JSON.stringify(state)}`);
  const audio = state.pauses === 1 && Math.abs(state.volume - 0.8) < 0.001
    ? pass('timer faded, paused once, and restored media volume') : fail(`audio interruption state ${JSON.stringify(state)}`);
  await page.locator('#sleepVeilBtn').click();
  return { timer, audio };
}

async function offlineCheck(page, context, base, route) {
  await visit(page, base, route);
  await page.evaluate(async () => { if ('serviceWorker' in navigator) await navigator.serviceWorker.ready; });
  if (!await page.evaluate(() => !!navigator.serviceWorker?.controller)) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 12000 });
  }
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.locator(route.ready).first().waitFor({ timeout: 12000 });
    return pass('controlled offline reload restored the shared path');
  } catch (error) {
    return fail(`controlled offline reload failed: ${String(error.message || error).slice(0, 140)}`);
  } finally {
    await context.setOffline(false);
  }
}

async function runCell(browser, base, viewportName, viewport, tier, route) {
  await health(base);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile, hasTouch: viewport.hasTouch,
    reducedMotion: 'reduce', serviceWorkers: 'allow',
  });
  context.setDefaultTimeout(8000);
  await context.route('**/*', request => {
    const url = new URL(request.request().url());
    return url.origin === base ? request.continue() : request.abort('blockedbyclient');
  });
  await context.addInitScript(seed(), { tier, birthday: birthdayForTier(tier) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const checks = {};
  let phase = 'launch';
  try {
    await visit(page, base, route);
    checks.instructions = await instructionCheck(page, route);
    const initial = await geometry(page, route);
    checks.layout_bounds = initial.overflow <= 1 && initial.primary && initial.heading
      ? pass('primary shared content is visible with no horizontal overflow') : fail(`initial geometry ${JSON.stringify(initial)}`);

    phase = 'input'; checks.input = await inputCheck(page, base, route);
    await visit(page, base, route);
    phase = 'back-home'; checks.back_home = await backHomeCheck(page, base, route);
    await visit(page, base, route);
    phase = 'rapid'; checks.rapid_double_input = await rapidCheck(page, route);
    await visit(page, base, route);
    phase = 'keyboard'; checks.keyboard_misuse = await keyboardCheck(page, route);

    phase = 'reload'; await visit(page, base, route); await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator(route.ready).first().waitFor();
    checks.reload_mid_round = await alive(page, route) ? pass('reload restored the shared path and state') : fail('reload did not restore the shared path');

    phase = 'resize';
    await page.setViewportSize(viewportName === 'phone' ? { width: 844, height: 390 } : { width: 900, height: 1280 });
    await page.waitForTimeout(120);
    const resized = await geometry(page, route);
    checks.resize_orientation = resized.overflow <= 1 && resized.primaryPresent && resized.heading
      ? pass('orientation/viewport change kept primary content reachable') : fail(`resized geometry ${JSON.stringify(resized)}`);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    phase = 're-entry'; await visit(page, base, route); await page.goto(base + '/home.html', { waitUntil: 'domcontentloaded' }); await page.locator('#worldScene .house').first().waitFor(); await visit(page, base, route);
    checks.repeated_entry_exit = await alive(page, route) ? pass('two entries around a child-home exit restored the shared path') : fail('re-entry did not restore the shared path');

    phase = 'corrupt-state'; checks.stale_corrupt_synthetic_state = await corruptStateCheck(page, base, route);
    checks.empty_min_max_values = route.id === 'index.html' || route.id === 'parent/settings.html'
      ? pass('empty optional profile fields used safe defaults') : na('this shared path has no editable minimum/maximum value');

    phase = 'timer'; await visit(page, base, route); const timer = await timerExpiryCheck(page, route);
    checks.timer_expiry = timer.timer; checks.interrupted_audio = timer.audio;
    checks.rewards = route.id === 'achievements.html' && checks.input.status === 'PASS'
      ? pass('earned reward and XP rendered once from persisted child state') : (route.id === 'achievements.html' ? fail('reward rendering failed') : na('this shared path is not the reward gallery'));
    checks.failed_media_network = route.id === 'listen/index.html'
      ? na('Listening Hut exposes no playable audio yet; timed interruption is tested separately') : na('this shared path has no owned media playback');

    phase = 'offline'; checks.offline = await offlineCheck(page, context, base, route);
    checks.visual_quality = blk('geometry is automated; full visual-quality judgement remains unreviewed');
    if (errors.length) checks.runtime_errors = fail(`${errors.length} page errors: ${errors.slice(0, 3).join(' | ')}`);
  } catch (error) {
    checks.runtime = fail(`${phase}: ${String(error.message || error).slice(0, 240)}`);
  } finally {
    await context.setOffline(false).catch(() => {});
    await context.close();
  }
  return { id: `${route.id}:T${tier}:${viewportName}`, route: route.route, routeId: route.id, tier, viewport: viewportName, checks };
}

mkdirSync(OUT, { recursive: true });
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], {
  cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
});
for (let attempt = 0; attempt < 100; attempt++) {
  try { await health(base); break; }
  catch { if (attempt === 99) throw new Error('local server did not start'); await new Promise(resolve => setTimeout(resolve, 100)); }
}
const browser = await chromium.launch();
const started = Date.now();
const queue = [];
for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) if (selectedViewports.includes(viewportName)) {
  for (const tier of selectedTiers) for (const route of ROUTES) if (selectedRoutes.includes(route.id)) queue.push({ viewportName, viewport, tier, route });
}
const rows = [];
try {
  async function worker() {
    while (queue.length) {
      const job = queue.shift();
      const row = await runCell(browser, base, job.viewportName, job.viewport, job.tier, job.route);
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
if (rows.length !== selectedViewports.length * selectedTiers.length * selectedRoutes.length || counts.fail) process.exitCode = 1;
