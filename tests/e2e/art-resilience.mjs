// Bounded negative/failure/recovery audit for all four Art routes at T1-T10.
// Synthetic profiles only; this runner owns and identity-checks its local server.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.join(import.meta.dirname, 'out', 'art-resilience');
const APP_BASELINE = '33a26ea4851dc70d74d6bb8b51f2a577e5251de6';
const VIEWPORTS = {
  desktop: { width: 1280, height: 900, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
};
const ACTIVITIES = [
  { id: 'stamp-art', route: '/art/stamp-art.html', ready: '#canvas', alive: '#canvas' },
  { id: 'finger-paint', route: '/art/finger-paint.html', ready: '#canvas', alive: '#paintApp' },
  { id: 'color-splash', route: '/art/color-splash.html', ready: '#vbPaintCanvas', alive: '#vbPaintWrap' },
  { id: 'color-in', route: '/art/color-in.html', ready: '#colorFillCanvas[data-ready="1"]', alive: '.stage' },
];
const TIERS = [1,2,3,4,5,6,7,8,9,10];
const selectedTiers = process.env.TIERS ? process.env.TIERS.split(',').map(Number) : TIERS;
const selectedViewports = process.env.VIEWPORTS ? process.env.VIEWPORTS.split(',') : Object.keys(VIEWPORTS);
const selectedActivities = process.env.ART ? process.env.ART.split(',') : ACTIVITIES.map(activity => activity.id);

for (const tier of selectedTiers) if (!TIERS.includes(tier)) throw new Error(`unknown tier ${tier}`);
for (const viewport of selectedViewports) if (!VIEWPORTS[viewport]) throw new Error(`unknown viewport ${viewport}`);
for (const activity of selectedActivities) if (!ACTIVITIES.some(candidate => candidate.id === activity)) throw new Error(`unknown Art route ${activity}`);

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
  return ({ activity, tier, birthday }) => {
    let state = (2166136261 ^ tier) >>> 0;
    for (const char of activity) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
    Math.random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const profile = {
      id: `art-resilience-t${tier}`, name: `Artist${tier}`, birthday,
      color: '#4ECDC4', voice: 'girl', mascot: { id: 'dog' },
      tierOverrides: { [activity]: tier }, features: {},
      activitiesVisible: { [activity]: true }, youtube: [],
    };
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    localStorage.setItem('vb_pin', '1234');
    localStorage.removeItem('vb_pin_lockout');
    localStorage.removeItem('vb_coloring_pages');
    window.__auditMediaPlay = 0;
    try {
      HTMLMediaElement.prototype.play = function () {
        window.__auditMediaPlay++;
        queueMicrotask(() => { try { if (typeof this.onended === 'function') this.onended(); } catch {} });
        return Promise.resolve();
      };
    } catch {}
    try { navigator.vibrate = () => true; } catch {}
  };
}

async function visit(page, base, activity) {
  await page.goto(base + activity.route, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.locator(activity.ready).first().waitFor({ timeout: 12000 });
}

async function alive(page, activity) {
  return page.url().endsWith(activity.route) && await page.locator(activity.alive).count() > 0;
}

async function canvasStats(page, selector) {
  return page.locator(selector).evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const corner = [data[0], data[1], data[2], data[3]];
    let alpha = 0, unlikeCorner = 0;
    for (let at = 0; at < data.length; at += 4) {
      if (data[at + 3]) alpha++;
      if (Math.abs(data[at] - corner[0]) + Math.abs(data[at + 1] - corner[1]) +
          Math.abs(data[at + 2] - corner[2]) + Math.abs(data[at + 3] - corner[3]) > 24) unlikeCorner++;
    }
    return { alpha, unlikeCorner, width: canvas.width, height: canvas.height };
  });
}

async function colorInPixel(page, x = 200, y = 150) {
  return page.locator('#colorFillCanvas').evaluate((canvas, point) =>
    [...canvas.getContext('2d').getImageData(point.x, point.y, 1, 1).data], { x, y });
}

async function tapColorInSource(page, x, y, times = 1) {
  const box = await page.locator('#colorFillCanvas').boundingBox();
  const size = await page.locator('#colorFillCanvas').evaluate(canvas => ({ width: canvas.width, height: canvas.height }));
  for (let index = 0; index < times; index++) {
    await page.mouse.click(box.x + x / size.width * box.width, box.y + y / size.height * box.height);
  }
}

async function drawStroke(page, selector, from = [.42, .43], to = [.58, .53]) {
  const box = await page.locator(selector).boundingBox();
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 6 });
  await page.mouse.up();
}

async function geometry(page, activity) {
  const controlSelector = {
    'stamp-art': '.stamp-chip, .scene-chip, #gameSettingsGear, .nav-btn',
    'finger-paint': '.paint-control, #gameSettingsGear, .nav-btn',
    'color-splash': '.vb-sw, .vb-tool, #gameSettingsGear, .nav-btn',
    'color-in': '.pip, .tool-btn, .page-nav, #gameSettingsGear, .nav-btn',
  }[activity.id];
  return page.evaluate(({ ready, aliveSelector, controlSelector }) => {
    const visible = node => {
      const style = getComputedStyle(node), rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const intersects = node => {
      const rect = node?.getBoundingClientRect();
      return !!rect && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight;
    };
    const readyNode = [...document.querySelectorAll(ready)].find(visible);
    const aliveNode = [...document.querySelectorAll(aliveSelector)].find(visible);
    const controls = [...document.querySelectorAll(controlSelector)].filter(visible).map(node => {
      const rect = node.getBoundingClientRect();
      return {
        name: node.getAttribute('aria-label') || node.getAttribute('title') || node.className || node.id || node.tagName,
        width: rect.width, height: rect.height, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
      };
    });
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      verticalOverflow: document.documentElement.scrollHeight - innerHeight,
      ready: intersects(readyNode), readyPresent: !!readyNode, alive: intersects(aliveNode),
      nav: intersects([...document.querySelectorAll('.nav-chrome')].find(visible)),
      controls, allControlsInView: controls.every(rect => rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1),
      safeTargets: controls.every(rect => rect.width >= 44 && rect.height >= 44),
    };
  }, { ready: activity.ready, aliveSelector: activity.alive, controlSelector });
}

async function visibleGuidance(page, activity, tier) {
  if (activity.id === 'stamp-art') {
    if (tier >= 2) return await page.locator('.stamp-chip:visible').count() === 10
      ? pass('visible stamp palette exposes the play action') : fail('stamp palette is incomplete or hidden');
    const before = await canvasStats(page, '#canvas');
    await page.waitForTimeout(1350);
    const after = await canvasStats(page, '#canvas');
    return after.unlikeCorner > before.unlikeCorner
      ? pass('automatic first stamp visibly demonstrates the play action') : fail('T1 has no visible play cue or automatic demonstration');
  }
  if (activity.id === 'finger-paint') {
    const title = (await page.locator('.paint-title').textContent() || '').trim();
    return title === 'Free Paint' && await page.locator('#paintDock:visible').count()
      ? pass('Free Paint title and visible painting tools identify the studio') : fail('painting title or tools missing');
  }
  if (activity.id === 'color-splash') {
    return await page.locator('#vbPaintDock .vb-sw:visible').count() >= 6
      ? pass('large visible color palette exposes the free-paint action') : fail('paint palette missing');
  }
  const message = (await page.locator('[data-fill-message]').textContent() || '').trim();
  const title = (await page.locator('.scene-title').textContent() || '').trim();
  return /tap a space/i.test(message) && title
    ? pass(`visible picture title and cue: ${message}`) : fail('Color In title or tap cue missing');
}

async function exercise(page, activity, tier) {
  await page.evaluate(() => { window.__artRecords = []; window.vbProgress = { record: id => window.__artRecords.push(id) }; });
  const result = { progression: na('freeform activity has no round progression'), restart: na('activity has no dedicated reset control') };

  if (activity.id === 'stamp-art') {
    const before = await canvasStats(page, '#canvas');
    await page.locator('#canvas').click({ position: { x: Math.max(80, Math.floor((await page.locator('#canvas').boundingBox()).width / 2)), y: 280 } });
    const after = await canvasStats(page, '#canvas');
    result.input = after.unlikeCorner > before.unlikeCorner ? pass('canvas tap placed a visible stamp') : fail('canvas tap placed no stamp');
    if (tier >= 5) {
      await page.locator('.scene-chip[title="farm"]').click();
      result.progression = await page.locator('.scene-chip[title="farm"].active').count() && (await page.locator('.stamp-chip').first().textContent()) === '🐮'
        ? pass('scene switch changed the palette and active scene') : fail('scene switch did not apply');
    }
    const records = await page.evaluate(() => window.__artRecords.length);
    result.input = result.input.status === 'PASS' && records === 1 ? pass('canvas tap placed a stamp and recorded one art action') : fail(`stamp action records=${records}`);
    result.restart = na('Stamp Art exposes no clear/restart control');
    result.drag_outside = na('Stamp Art uses taps, not drag-to-target input');
    return result;
  }

  if (activity.id === 'finger-paint') {
    await drawStroke(page, '#canvas');
    const painted = await canvasStats(page, '#canvas');
    result.input = painted.alpha > 0 && await page.evaluate(() => window.__artRecords.length) === 1
      ? pass('bounded stroke painted pixels and recorded one art action') : fail('stroke did not paint or record once');
    await page.locator('#clearButton').click();
    const cleared = await canvasStats(page, '#canvas');
    await page.locator('#undoButton').click();
    const restored = await canvasStats(page, '#canvas');
    result.restart = cleared.alpha === 0 && restored.alpha > 0
      ? pass('Clear reset the page and Undo recovered the artwork') : fail('Clear/Undo recovery failed');
    result.drag_outside = await pointerOutsideRecovery(page, '#canvas')
      ? pass('captured drag outside completed and the next stroke remained usable') : fail('outside drag left paint input stuck');
    return result;
  }

  if (activity.id === 'color-splash') {
    await drawStroke(page, '#vbPaintCanvas');
    const painted = await canvasStats(page, '#vbPaintCanvas');
    result.input = painted.alpha > 0 && await page.evaluate(() => window.__artRecords.length) === 1
      ? pass('bounded stroke painted pixels and recorded one art action') : fail('stroke did not paint or record once');
    const expected = { palette: tier <= 3 ? 6 : tier <= 6 ? 9 : 12, eraser: tier >= 4, sizes: tier >= 5 ? 3 : 0, brushes: tier >= 6 ? 4 : 0, undo: tier >= 6 };
    const tools = await page.evaluate(() => ({
      palette: document.querySelectorAll('.vb-sw').length,
      eraser: !!document.querySelector('[title="Eraser"]'),
      sizes: [...document.querySelectorAll('.vb-tool')].filter(node => !node.title && !!node.querySelector('span')).length,
      brushes: ['round','marker','crayon','spray'].filter(title => document.querySelector(`[title="${title}"]`)).length,
      undo: !!document.querySelector('[title="Undo"]'),
    }));
    result.instructions = JSON.stringify(tools) === JSON.stringify(expected)
      ? pass(`tier-appropriate tools visible: ${JSON.stringify(tools)}`) : fail(`wrong T${tier} toolset ${JSON.stringify(tools)} expected ${JSON.stringify(expected)}`);
    await page.locator('[title="Clear"]').click();
    const cleared = await canvasStats(page, '#vbPaintCanvas');
    if (tier >= 6) {
      await page.locator('[title="Undo"]').click();
      result.restart = cleared.alpha === 0 && (await canvasStats(page, '#vbPaintCanvas')).alpha > 0
        ? pass('Clear reset the page and Undo recovered the artwork') : fail('Clear/Undo recovery failed');
    } else {
      await drawStroke(page, '#vbPaintCanvas');
      result.restart = cleared.alpha === 0 && (await canvasStats(page, '#vbPaintCanvas')).alpha > 0
        ? pass('Clear reset the page and fresh paint recovered input') : fail('Clear/fresh-input recovery failed');
    }
    result.drag_outside = await pointerOutsideRecovery(page, '#vbPaintCanvas')
      ? pass('captured drag outside completed and the next stroke remained usable') : fail('outside drag left paint input stuck');
    return result;
  }

  const before = await colorInPixel(page);
  await tapColorInSource(page, 200, 150);
  const painted = await colorInPixel(page);
  result.input = JSON.stringify(before) !== JSON.stringify(painted) && await page.evaluate(() => window.__artRecords.length) === 1
    ? pass('tap filled one bounded region and recorded one art action') : fail('tap did not fill or record once');
  await page.locator('#undoFill').click();
  const undone = await colorInPixel(page);
  await tapColorInSource(page, 200, 150);
  result.restart = JSON.stringify(undone) === JSON.stringify(before) && JSON.stringify(await colorInPixel(page)) === JSON.stringify(painted)
    ? pass('Undo restored the blank region and a fresh fill recovered input') : fail('Color In undo/recovery failed');
  await page.locator('#nextPage').click();
  await page.waitForFunction(() => document.querySelector('.scene-title')?.textContent === 'Friendly Cat' && document.querySelector('#colorFillCanvas')?.dataset.ready === '1');
  await page.locator('#prevPage').click();
  await page.waitForFunction(() => document.querySelector('.scene-title')?.textContent === 'Smiling Sun' && document.querySelector('#colorFillCanvas')?.dataset.ready === '1');
  result.progression = JSON.stringify(await colorInPixel(page)) === JSON.stringify(painted)
    ? pass('next/previous picture navigation preserved the first page fill') : fail('picture navigation lost or failed to restore the fill');
  result.drag_outside = await colorInDragRejected(page)
    ? pass('drag gesture was rejected and the next tap remained usable') : fail('drag filled a region or blocked the next tap');
  return result;
}

async function pointerOutsideRecovery(page, selector) {
  const before = await canvasStats(page, selector);
  await page.locator(selector).evaluate(canvas => {
    const box = canvas.getBoundingClientRect();
    const fire = (name, id, x, y, buttons) => canvas.dispatchEvent(new PointerEvent(name, {
      pointerId: id, pointerType: 'touch', isPrimary: true, button: 0, buttons,
      clientX: x, clientY: y, bubbles: true, cancelable: true,
    }));
    fire('pointerdown', 71, box.left + box.width * .3, box.top + box.height * .4, 1);
    fire('pointermove', 71, box.right + 40, box.bottom + 40, 1);
    fire('pointerup', 71, box.right + 40, box.bottom + 40, 0);
    fire('pointerdown', 72, box.left + box.width * .55, box.top + box.height * .45, 1);
    fire('pointermove', 72, box.left + box.width * .65, box.top + box.height * .5, 1);
    fire('pointerup', 72, box.left + box.width * .65, box.top + box.height * .5, 0);
  });
  const after = await canvasStats(page, selector);
  return after.alpha > before.alpha || after.unlikeCorner > before.unlikeCorner;
}

async function colorInDragRejected(page) {
  const beforeRecords = await page.evaluate(() => window.__artRecords.length);
  // Use the known top sun ray, not an eye/face point that may already share
  // the filled face component at a particular rendered scale.
  const before = await colorInPixel(page, 200, 45);
  await page.locator('#colorFillCanvas').evaluate(canvas => {
    const box = canvas.getBoundingClientRect();
    const start = { pointerId: 81, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1, clientX: box.left + box.width * .5, clientY: box.top + box.height * .1125, bubbles: true };
    canvas.dispatchEvent(new PointerEvent('pointerdown', start));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...start, buttons: 0, clientX: start.clientX + 50 }));
  });
  const after = await colorInPixel(page, 200, 45);
  await tapColorInSource(page, 200, 45);
  return JSON.stringify(before) === JSON.stringify(after) && await page.evaluate(count => window.__artRecords.length > count, beforeRecords);
}

async function rapidAndBoundary(page, activity) {
  const beforeRecords = await page.evaluate(() => window.__artRecords.length);
  if (activity.id === 'color-in') {
    await tapColorInSource(page, 200, 150, 3);
    await tapColorInSource(page, 305, 200);
    const responsive = await alive(page, activity);
    const delta = await page.evaluate(count => window.__artRecords.length - count, beforeRecords);
    return { rapid: responsive && delta === 0, boundary: responsive && delta === 0, note: `same-fill/outline record delta=${delta}` };
  }
  const selector = activity.ready.replace('[data-ready="1"]', '');
  const before = await canvasStats(page, selector);
  await page.locator(selector).evaluate(canvas => {
    const box = canvas.getBoundingClientRect();
    const fire = (name, id, x, y, buttons, primary = true) => canvas.dispatchEvent(new PointerEvent(name, {
      pointerId: id, pointerType: 'touch', isPrimary: primary, button: 0, buttons,
      clientX: x, clientY: y, bubbles: true, cancelable: true,
    }));
    const x = box.left + Math.max(2, box.width * .7), y = box.top + Math.max(2, box.height * .35);
    fire('pointerdown', 91, x, y, 1); fire('pointerdown', 92, x + 20, y + 20, 1, false);
    fire('pointermove', 92, x + 35, y + 25, 1, false); fire('pointerup', 92, x + 35, y + 25, 0, false);
    fire('pointermove', 91, x + 45, y + 15, 1); fire('pointerup', 91, x + 45, y + 15, 0);
    fire('pointerdown', 93, Math.max(1, box.left + 1), box.top + box.height * .55, 1);
    fire('pointerup', 93, Math.max(1, box.left + 1), box.top + box.height * .55, 0);
  });
  const after = await canvasStats(page, selector);
  const responsive = await alive(page, activity);
  const changed = after.alpha > before.alpha || after.unlikeCorner > before.unlikeCorner;
  return { rapid: responsive && changed, boundary: responsive && changed, note: `canvas changed=${changed}` };
}

async function resizeCheck(page, activity, viewportName) {
  const selector = activity.id === 'color-in' ? '#colorFillCanvas' : activity.ready;
  const before = activity.id === 'color-in' ? await colorInPixel(page) : await canvasStats(page, selector);
  await page.setViewportSize(viewportName === 'phone' ? { width: 844, height: 390 } : { width: 900, height: 1280 });
  await page.waitForTimeout(120);
  const metrics = await geometry(page, activity);
  const after = activity.id === 'color-in' ? await colorInPixel(page) : await canvasStats(page, selector);
  const kept = activity.id === 'color-in'
    ? JSON.stringify(before) === JSON.stringify(after)
    : (activity.id === 'stamp-art' ? after.unlikeCorner > 0 : after.alpha > 0);
  return metrics.overflow <= 1 && metrics.readyPresent && metrics.alive && metrics.nav && metrics.allControlsInView && kept
    ? pass('orientation change kept artwork and all controls reachable')
    : fail(`resize overflow=${metrics.overflow} ready=${metrics.readyPresent} alive=${metrics.alive} nav=${metrics.nav} controls=${metrics.allControlsInView} artwork=${kept}`);
}

async function runCell(browser, base, viewportName, viewport, tier, activity) {
  await health(base);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile, hasTouch: viewport.hasTouch,
    reducedMotion: 'reduce', serviceWorkers: 'allow',
  });
  context.setDefaultTimeout(5000);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === base ? route.continue() : route.abort('blockedbyclient');
  });
  await context.addInitScript(seed(), { activity: activity.id, tier, birthday: birthdayForTier(tier) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const checks = {};
  let phase = 'launch';
  try {
    await visit(page, base, activity);
    checks.launch = pass('Art route loaded with its primary studio surface');
    checks.instructions = await visibleGuidance(page, activity, tier);
    checks.back_home = await page.locator('.nav-chrome .back-btn').isVisible() && await page.locator('.nav-chrome .home-btn').isVisible()
      ? pass('Back and Home are visible') : fail('Back or Home is missing');
    const initial = await geometry(page, activity);
    checks.layout_bounds = initial.overflow <= 1 && initial.ready && initial.alive && initial.nav && initial.allControlsInView && initial.safeTargets
      ? pass('studio, navigation and 44px controls are inside the viewport')
      : fail(`overflow=${initial.overflow} ready=${initial.ready} alive=${initial.alive} nav=${initial.nav} controls=${initial.allControlsInView} safeTargets=${initial.safeTargets} unsafe=${JSON.stringify(initial.controls.filter(rect => rect.width < 44 || rect.height < 44))}`);
    checks.visual_quality = activity.id === 'color-splash' && viewportName === 'phone' && !initial.safeTargets
      ? fail('Color Splash phone color pips are 42x42px, below the Kids 44px child-target floor')
      : blk('geometry is automated; full visual-quality judgement remains unreviewed');
    checks.score = na('Art route has no score counter');
    checks.rewards = blk('action recording does not by itself prove award timing or duplication');

    const exercised = await exercise(page, activity, tier);
    Object.assign(checks, exercised);
    const negative = await rapidAndBoundary(page, activity);
    checks.rapid_double_input = negative.rapid ? pass(`rapid/multi-pointer input left the studio responsive; ${negative.note}`) : fail(`rapid/multi-pointer input failed; ${negative.note}`);
    checks.boundary_taps = negative.boundary ? pass(`edge/outline input left the studio responsive; ${negative.note}`) : fail(`boundary input failed; ${negative.note}`);
    await page.keyboard.press('Escape'); await page.keyboard.press('Tab'); await page.keyboard.press('KeyQ');
    checks.keyboard_misuse = await alive(page, activity) ? pass('unrelated keys did not exit or disable the studio') : fail('keyboard misuse broke the studio');
    checks.wrong_answers = na('freeform Art has no correct/wrong answer mechanic');
    checks.resize_orientation = await resizeCheck(page, activity, viewportName);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    phase = 'reload';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator(activity.ready).first().waitFor({ timeout: 12000 });
    checks.reload_mid_round = await alive(page, activity) ? pass('reload restored a playable studio') : fail('reload did not restore a playable studio');

    phase = 'navigation';
    if (activity.id === 'stamp-art' && tier <= 2) {
      await page.locator('.nav-chrome .back-btn').click(); await page.waitForURL(/\/art\/(index\.html)?$/);
      checks.navigation_during_animation = pass('Back during automatic stamp demonstration reached Art');
    } else {
      checks.navigation_during_animation = na('activity has no active transition animation to interrupt');
      await page.locator('.nav-chrome .back-btn').click(); await page.waitForURL(/\/art\/(index\.html)?$/);
    }
    await visit(page, base, activity); await page.locator('.nav-chrome .back-btn').click(); await page.waitForURL(/\/art\/(index\.html)?$/); await visit(page, base, activity);
    checks.repeated_entry_exit = pass('two exit/re-entry cycles restored the studio');

    phase = 'corrupt-state';
    await page.evaluate(({ activityId }) => {
      sessionStorage.setItem('vb_pending_celebration', '{broken-json');
      localStorage.setItem('vb_coloring_pages', '{not valid json');
      const profiles = JSON.parse(localStorage.getItem('vb_profiles') || '[]');
      if (profiles[0]) {
        profiles[0].features = { [activityId]: 'malformed-feature-state' };
        profiles[0].tierOverrides = { [activityId]: 'not-a-tier' };
        localStorage.setItem('vb_profiles', JSON.stringify(profiles));
      }
    }, { activityId: activity.id });
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator(activity.ready).first().waitFor({ timeout: 12000 });
    checks.stale_corrupt_synthetic_state = await alive(page, activity)
      ? pass('malformed pending, feature, tier and upload state did not block launch') : fail('corrupt synthetic state blocked the studio');
    checks.empty_min_max_values = tier === 1 || tier === 10 ? pass(`T${tier} boundary remained playable`) : na('age min/max boundary applies to T1/T10');

    phase = 'media-failure';
    let blockedMediaRequests = 0;
    await context.route(/\.(mp3|wav|ogg|m4a|mp4|webm)(\?|$)/i, route => { blockedMediaRequests++; return route.abort('failed'); });
    await page.addInitScript(() => {
      window.__auditRejectedMedia = 0;
      try { HTMLMediaElement.prototype.play = () => { window.__auditRejectedMedia++; return Promise.reject(new DOMException('synthetic media failure')); }; } catch {}
    });
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator(activity.ready).first().waitFor({ timeout: 12000 });
    if (activity.id === 'stamp-art') await page.locator('#canvas').click({ position: { x: 200, y: 250 } });
    else if (activity.id === 'color-in') await tapColorInSource(page, 200, 150);
    else await drawStroke(page, activity.ready);
    await page.waitForTimeout(120);
    const rejectedMedia = await page.evaluate(() => window.__auditRejectedMedia || 0);
    checks.failed_media_network = blockedMediaRequests
      ? (await alive(page, activity) ? pass(`${blockedMediaRequests} blocked media requests did not block Art`) : fail('blocked media broke Art'))
      : na('Art route made no media-file request during the bounded probe');
    checks.interrupted_audio = rejectedMedia
      ? (await alive(page, activity) ? pass(`recovered from ${rejectedMedia} rejected media plays`) : fail('audio interruption broke Art'))
      : na('Art route made no HTML media play during the bounded probe');
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
    await page.reload({ waitUntil: 'networkidle' }); await page.locator(activity.ready).first().waitFor({ timeout: 12000 });
    await page.waitForFunction(() => caches.match(location.href).then(Boolean), null, { timeout: 8000 });
    await context.setOffline(true); await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator(activity.ready).first().waitFor({ timeout: 12000 });
    checks.offline = await alive(page, activity) ? pass('controlled offline reload restored Art') : fail('offline reload failed');
    await context.setOffline(false);
    checks.timer_expiry = na('Art route has no child-facing countdown-expiry mechanic');
    checks.long_repeated_play = blk('bounded run is not a long-duration soak');

    if (process.env.ART_EVIDENCE === '1' && [1,5,10].includes(tier)) {
      const dir = path.join(OUT, 'evidence'); mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${activity.id}-T${tier}-${viewportName}.png`), fullPage: true });
    }
    if (Object.values(checks).some(result => result.status === 'FAIL')) {
      const dir = path.join(OUT, 'failures'); mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `${activity.id}-T${tier}-${viewportName}.png`), fullPage: true });
    }
  } catch (error) {
    checks.runner = fail(`${phase}: ${error.name}: ${error.message}`);
    try { const dir = path.join(OUT, 'failures'); mkdirSync(dir, { recursive: true }); await page.screenshot({ path: path.join(dir, `${activity.id}-T${tier}-${viewportName}.png`), fullPage: true }); } catch {}
  } finally {
    await context.setOffline(false).catch(() => {});
    await context.close();
  }
  if (errors.length) checks.runtime_errors = fail(errors.slice(0, 5).join(' | '));
  return { id: `${activity.id}:T${tier}:${viewportName}`, activityId: activity.id, route: activity.route, tier, viewport: viewportName, checks, errors };
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
  for (const tier of selectedTiers) for (const activity of ACTIVITIES) if (selectedActivities.includes(activity.id)) queue.push({ viewportName, viewport, tier, activity });
}
const rows = [];
try {
  async function worker() {
    while (queue.length) {
      const job = queue.shift();
      const row = await runCell(browser, base, job.viewportName, job.viewport, job.tier, job.activity);
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
if (rows.length !== selectedViewports.length * selectedTiers.length * selectedActivities.length || counts.fail) process.exitCode = 1;
