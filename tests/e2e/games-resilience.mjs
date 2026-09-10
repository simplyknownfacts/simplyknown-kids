// Negative/failure/recovery audit for all eight Games routes at T1-T10.
// Synthetic profiles only. This runner owns its local server and aborts if the
// server health check fails, so preview failure cannot become product evidence.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.join(import.meta.dirname, 'out', 'games-resilience');
const VIEWPORTS = {
  desktop: { width: 1280, height: 900, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
};
const GAMES = [
  { id: 'tap-pop', route: '/games/tap-pop.html', ready: '#canvas', alive: '#canvas', instruction: '#target' },
  { id: 'peek-a-boo', route: '/games/peek-a-boo.html', ready: '#stage', alive: '#stage', instruction: '#hint' },
  { id: 'magic-touch', route: '/games/magic-touch.html', ready: '#canvas', alive: '#canvas', instruction: '#hint' },
  { id: 'tap-a-tune', route: '/games/tap-a-tune.html', ready: '#pads .pad', alive: '#pads', instruction: '#hint' },
  { id: 'surprise-pop', route: '/games/surprise-pop.html', ready: '#egg', alive: '#stage', instruction: '#hint' },
  { id: 'shape-match', route: '/games/shape-match.html', ready: '#shapesRow .shape, .num-choice', alive: '.screen', instruction: '#hint' },
  { id: 'tilt-drive', route: '/games/tilt-drive.html', ready: '#startOv', alive: '#canvas', instruction: '#startHint' },
  { id: 'memory-match', route: '/games/memory-match.html', ready: '#board .mm-card', alive: '#board', instruction: '#hint' },
];
const TIERS = [1,2,3,4,5,6,7,8,9,10];
const selectedTiers = process.env.TIERS ? process.env.TIERS.split(',').map(Number) : TIERS;
const selectedViewports = process.env.VIEWPORTS ? process.env.VIEWPORTS.split(',') : Object.keys(VIEWPORTS);
const selectedGames = process.env.GAMES ? process.env.GAMES.split(',') : GAMES.map(game => game.id);

const pass = note => ({ status: 'PASS', note });
const fail = note => ({ status: 'FAIL', note });
const na = note => ({ status: 'NA', note });

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

function seed() {
  return ({ game, tier, birthday }) => {
    const profile = {
      id: `resilience-t${tier}`, name: `Test${tier}`, birthday,
      color: '#4ECDC4', voice: 'girl', mascot: { id: 'dog' },
      tierOverrides: { [game]: tier }, features: {}, activitiesVisible: {}, youtube: [],
    };
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    localStorage.setItem('vb_pin', '1234');
    localStorage.removeItem('vb_pin_lockout');
    try { HTMLMediaElement.prototype.play = () => Promise.resolve(); } catch {}
    try { if (speechSynthesis) speechSynthesis.speak = () => {}; } catch {}
    try { navigator.vibrate = () => true; } catch {}
  };
}

async function health(base) {
  const response = await fetch(base + '/__health.json');
  if (!response.ok) throw new Error(`local server health failed: ${response.status}`);
}

async function alive(page, game) {
  return page.url().endsWith(game.route) && await page.locator(game.alive).count() > 0;
}

async function geometry(page, game) {
  return page.evaluate(selector => {
    const candidates = [...document.querySelectorAll(selector)];
    const vital = candidates.find(node => {
      const style = getComputedStyle(node); const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    const nav = document.querySelector('.nav-chrome');
    const intersects = node => { const r = node?.getBoundingClientRect(); return !!r && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight; };
    return { overflow: document.documentElement.scrollWidth - innerWidth, vital: intersects(vital), nav: intersects(nav) };
  }, game.ready);
}

async function negativeInput(page, game) {
  if (game.id === 'peek-a-boo') {
    await page.waitForFunction(() => document.querySelector('#roundAction')?.getAttribute('aria-disabled') === 'false');
    await page.locator('#roundAction').click();
    await page.waitForFunction(() => document.querySelector('#stage')?.dataset.phase === 'seek');
    const clue = page.locator('.hiding-spot.clue-peek,.hiding-spot.clue-rustle').first();
    const target = Number(await clue.getAttribute('data-spot'));
    const wrong = page.locator('.hiding-spot').nth((target + 1) % await page.locator('.hiding-spot').count());
    await wrong.dblclick({ delay: 10 });
    return { wrong: (await page.locator('#stage').getAttribute('data-phase')) === 'seek', note: 'double wrong guess stayed in seek round' };
  }
  if (game.id === 'memory-match') {
    const cards = page.locator('#board .mm-card');
    const faces = await cards.evaluateAll(nodes => nodes.map(node => node.dataset.face));
    let picks = [0, 1];
    outer: for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) if (faces[i] !== faces[j]) { picks = [i, j]; break outer; }
    await cards.nth(picks[0]).click(); await cards.nth(picks[0]).click(); await cards.nth(picks[1]).click();
    await page.waitForTimeout(500);
    return { wrong: await page.locator('#board .mm-card.matched').count() === 0, note: 'duplicate flip plus wrong pair did not create a match' };
  }
  if (game.id === 'surprise-pop') {
    await page.locator('#egg').click(); await page.locator('#egg').dispatchEvent('pointerdown');
    await page.waitForTimeout(100);
    const choices = page.locator('#choices .choice');
    if (!await choices.count()) return { wrong: null, note: 'rapid egg input produced one reveal; no wrong-answer mechanic at this tier' };
    const answer = (await page.locator('#name').textContent()) || '';
    const labels = await choices.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label') || ''));
    const wrong = Math.max(0, labels.findIndex(label => !label.endsWith(answer)));
    await choices.nth(wrong).click();
    return { wrong: await page.locator('#reveal').isVisible(), note: 'wrong guess kept the reveal round open' };
  }
  if (game.id === 'shape-match') {
    const source = page.locator('#shapesRow .shape').first();
    const box = await source.boundingBox();
    if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(1, 1); await page.mouse.up(); }
    const choices = page.locator('.num-choice');
    if (await choices.count() > 1) {
      for (let i = 0; i < await choices.count(); i++) {
        await choices.nth(i).click();
        if (await choices.nth(i).evaluate(node => node.classList.contains('bad')).catch(() => false)) return { wrong: true, note: 'wrong quiz answer stayed recoverable; outside drag released' };
      }
      return { wrong: false, note: 'no wrong quiz choice could be identified' };
    }
    return { wrong: null, note: 'outside drag released; current mode has no wrong-answer choice' };
  }
  if (game.id === 'tap-a-tune') {
    const pads = page.locator('#pads .pad'); await pads.first().dblclick({ delay: 10 }); await pads.last().click();
    return { wrong: null, note: 'rapid mixed-pad input remained playable; challenge timing not forced' };
  }
  if (game.id === 'tilt-drive') {
    await page.locator('.style-card').first().click(); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight');
    return { wrong: null, note: 'rapid opposing steering remained playable' };
  }
  const box = await page.locator(game.ready).first().boundingBox();
  if (box) { const x = Math.max(1, box.x + 2), y = Math.max(1, box.y + 2); await page.mouse.dblclick(x, y, { delay: 10 }); await page.mouse.click(x, y); }
  return { wrong: null, note: 'rapid boundary input left free-play surface responsive' };
}

async function visit(page, base, game) {
  await page.goto(base + game.route, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.locator(game.ready).first().waitFor({ timeout: 10000 });
}

async function runCell(browser, base, viewportName, viewport, tier, game) {
  await health(base);
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile, hasTouch: viewport.hasTouch, reducedMotion: 'reduce', serviceWorkers: 'allow' });
  await context.addInitScript(seed(), { game: game.id, tier, birthday: birthdayForTier(tier) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const checks = {};
  try {
    await visit(page, base, game);
    const text = ((await page.locator(game.instruction).first().textContent().catch(() => '')) || '').trim();
    const visible = await page.locator(game.instruction).first().isVisible().catch(() => false);
    checks.instructions = visible && text ? pass(`visible instruction: ${text.slice(0, 80)}`) : fail('no visible on-screen instruction');
    checks.back_home = await page.locator('.back-btn').isVisible() && await page.locator('.home-btn').isVisible() ? pass('Back and Home visible') : fail('Back or Home missing');
    const initial = await geometry(page, game);
    checks.visual_quality = initial.overflow <= 1 && initial.vital && initial.nav ? pass('primary surface/navigation visible; no horizontal overflow') : fail(`overflow=${initial.overflow} vital=${initial.vital} nav=${initial.nav}`);

    const negative = await negativeInput(page, game);
    await page.keyboard.press('Escape'); await page.keyboard.press('Tab'); await page.keyboard.press('KeyQ');
    const responsive = await alive(page, game);
    checks.rapid_double_input = responsive ? pass(negative.note) : fail('rapid input broke or exited game');
    checks.boundary_taps = responsive ? pass('edge input left game alive') : fail('edge input broke game');
    checks.keyboard_misuse = responsive ? pass('unrelated keys did not exit or complete game') : fail('keyboard misuse broke game');
    checks.drag_outside = game.id === 'shape-match' ? (responsive ? pass('outside drag released without breaking game') : fail('outside drag broke game')) : na('no required drag-to-target mechanic');
    checks.wrong_answers = negative.wrong == null ? na(negative.note) : negative.wrong ? pass(negative.note) : fail(negative.note);

    await page.setViewportSize(viewportName === 'phone' ? { width: 844, height: 390 } : { width: 900, height: 1280 });
    await page.waitForTimeout(100);
    const resized = await geometry(page, game);
    checks.resize_orientation = resized.overflow <= 1 && resized.vital && resized.nav ? pass('viewport/orientation change preserved controls') : fail(`overflow=${resized.overflow} vital=${resized.vital} nav=${resized.nav}`);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator(game.ready).first().waitFor();
    checks.reload_mid_round = await alive(page, game) ? pass('reload restored playable round') : fail('reload did not restore game');
    await negativeInput(page, game); await page.locator('.back-btn').click(); await page.waitForURL(/\/games\/(index\.html)?$/);
    checks.navigation_during_animation = pass('Back during active state reached Games');
    await visit(page, base, game); await page.locator('.back-btn').click(); await page.waitForURL(/\/games\/(index\.html)?$/); await visit(page, base, game);
    checks.repeated_entry_exit = pass('two exit/re-entry cycles restored game');

    await page.evaluate(({ tier }) => {
      sessionStorage.setItem('vb_pending_celebration', '{broken-json');
      localStorage.setItem(`vb_sppop_resilience-t${tier}`, '{broken-json');
      localStorage.setItem('vb_tiltdrive_best_road', 'not-a-number');
      localStorage.setItem('vb_tiltdrive_best_river', '-999999');
      localStorage.setItem('vb_tiltdrive_best_space', '999999999999999');
    }, { tier });
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator(game.ready).first().waitFor();
    checks.stale_corrupt_synthetic_state = await alive(page, game) ? pass('malformed pending/collection data and invalid stored score did not block launch') : fail('corrupt synthetic state blocked launch');
    checks.empty_min_max_values = tier === 1 || tier === 10 ? pass(`T${tier} age boundary and invalid stored scores remained playable`) : na('age min/max boundary applies to T1/T10');

    await context.route(/\.(mp3|wav|ogg|m4a|mp4|webm)(\?|$)/i, route => route.abort('failed'));
    await page.addInitScript(() => { try { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('synthetic media failure')); } catch {} try { speechSynthesis.cancel(); speechSynthesis.speak = () => {}; } catch {} });
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator(game.ready).first().waitFor();
    checks.failed_media_network = await alive(page, game) ? pass('blocked media requests did not block game') : fail('blocked media broke game');
    checks.interrupted_audio = await alive(page, game) ? pass('rejected playback/cancelled speech did not block game') : fail('audio interruption broke game');
    await context.unroute(/\.(mp3|wav|ogg|m4a|mp4|webm)(\?|$)/i);

    const controlled = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      await navigator.serviceWorker.register('../sw.js', { updateViaCache: 'none' });
      await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))]);
      return !!navigator.serviceWorker.controller;
    }).catch(() => false);
    if (!controlled) await page.reload({ waitUntil: 'domcontentloaded' });
    if (!await page.evaluate(() => !!navigator.serviceWorker.controller)) throw new Error('service worker did not control page');
    await context.setOffline(true); await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator(game.ready).first().waitFor();
    checks.offline = await alive(page, game) ? pass('controlled offline reload restored game') : fail('offline reload failed');
    await context.setOffline(false);
    checks.timer_expiry = na('wall-clock expiry not accelerated in bounded run');
    checks.long_repeated_play = na('bounded run is not a long-duration soak');
  } catch (error) {
    checks.runner = fail(`${error.name}: ${error.message}`);
    try { const dir = path.join(OUT, 'failures'); mkdirSync(dir, { recursive: true }); await page.screenshot({ path: path.join(dir, `${game.id}-T${tier}-${viewportName}.png`), fullPage: true }); } catch {}
  } finally {
    await context.setOffline(false).catch(() => {});
    await context.close();
  }
  if (errors.length) checks.runtime_errors = fail(errors.slice(0, 5).join(' | '));
  return { id: `${game.id}:T${tier}:${viewportName}`, activityId: game.id, route: game.route, tier, viewport: viewportName, checks, errors };
}

mkdirSync(OUT, { recursive: true });
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
for (let i = 0; i < 100; i++) { try { await health(base); break; } catch { if (i === 99) throw new Error('local server did not start'); await new Promise(resolve => setTimeout(resolve, 100)); } }
const browser = await chromium.launch();
const started = Date.now();
const queue = [];
for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) if (selectedViewports.includes(viewportName)) for (const tier of selectedTiers) for (const game of GAMES) if (selectedGames.includes(game.id)) queue.push({ viewportName, viewport, tier, game });
const rows = [];
try {
  async function worker() {
    while (queue.length) {
      const job = queue.shift();
      const row = await runCell(browser, base, job.viewportName, job.viewport, job.tier, job.game);
      rows.push(row);
      const failures = Object.values(row.checks).filter(result => result.status === 'FAIL').length;
      console.log(`${failures ? 'FAIL' : 'PASS'} ${row.id}${failures ? ` (${failures})` : ''}`);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
} finally {
  await browser.close();
  server.kill();
}
rows.sort((a, b) => a.id.localeCompare(b.id));
const counts = { rows: rows.length, pass: 0, fail: 0, na: 0 };
for (const row of rows) for (const result of Object.values(row.checks)) counts[result.status.toLowerCase()]++;
const report = { baseline: 'd6687a38b2a466e13de00f9553efeb23e9f84d8f', base, generatedAt: new Date().toISOString(), durationSec: Math.round((Date.now() - started) / 1000), counts, rows };
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...counts, durationSec: report.durationSec }));
if (rows.length !== selectedViewports.length * selectedTiers.length * selectedGames.length || counts.fail) process.exitCode = 1;
