// Local-only negative/recovery audit for Watch, About, and Privacy.
// Synthetic profiles and a YouTube API lifecycle stub exercise application
// behavior without claiming that real remote audio/video quality was heard.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.join(import.meta.dirname, 'out', 'video-info-resilience');
const SHOTS = path.join(ROOT, 'docs', 'verify', 'shots', 'audit-20260910-video-info');
const APP_BASELINE = '7c9b14cf4d712513a8f9c69690a780c53ea4f54a';
const VIEWPORTS = {
  desktop: { width: 1280, height: 900, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
};
const ROUTES = [
  { id: 'videos/index.html', route: '/videos/index.html', ready: '.channel-tile', heading: '.hub-title', shot: 'videos' },
  { id: 'about.html', route: '/about.html', ready: '.summary-does-not-exist, .card', heading: 'h1', shot: 'about' },
  { id: 'privacy.html', route: '/privacy.html', ready: '.summary', heading: 'h1', shot: 'privacy' },
];
const TIERS = [1,2,3,4,5,6,7,8,9,10];
const selectedTiers = process.env.TIERS ? process.env.TIERS.split(',').map(Number) : TIERS;
const selectedViewports = process.env.VIEWPORTS ? process.env.VIEWPORTS.split(',') : Object.keys(VIEWPORTS);
const selectedRoutes = process.env.INFO ? process.env.INFO.split(',') : ROUTES.map(route => route.id);
for (const tier of selectedTiers) if (!TIERS.includes(tier)) throw new Error(`unknown tier ${tier}`);
for (const viewport of selectedViewports) if (!VIEWPORTS[viewport]) throw new Error(`unknown viewport ${viewport}`);
for (const route of selectedRoutes) if (!ROUTES.some(candidate => candidate.id === route)) throw new Error(`unknown route ${route}`);

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
    const profile = {
      id: `info-t${tier}`, name: `Explorer${tier}`, birthday, color: '#4ECDC4', voice: 'girl',
      mascot: { id: 'bunny' }, tierOverrides: {}, features: {}, activitiesVisible: {},
      youtube: [{ label: `Learning ${tier}`, emoji: '🧪', channelId: `UC_TEST_${tier}` }],
      achievements: { unlocked: {}, counters: {}, repeats: {}, streak: {}, xp: 0, rank: 'seedling' },
    };
    if (!localStorage.getItem('vb_profiles')) localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    if (!localStorage.getItem('vb_active_id')) localStorage.setItem('vb_active_id', profile.id);
    if (!localStorage.getItem('vb_pin')) localStorage.setItem('vb_pin', '1234');
    localStorage.removeItem('vb_pin_lockout');
    window.__auditMarkupRan = 0;
  };
}

const YOUTUBE_STUB = `
window.__ytAudit={created:0,destroyed:0,stopped:0,loaded:[]};
window.YT={PlayerState:{ENDED:0},Player:class{
  constructor(target,options){this.options=options;this.dead=false;window.__ytAudit.created++;window.__ytAudit.loaded.push(options.videoId);}
  loadVideoById(id){window.__ytAudit.loaded.push(id);}
  stopVideo(){window.__ytAudit.stopped++;}
  destroy(){if(!this.dead){this.dead=true;window.__ytAudit.destroyed++;}}
}};
if(window.onYouTubeIframeAPIReady)window.onYouTubeIframeAPIReady();`;

async function visit(page, base, route) {
  await page.goto(base + route.route, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.locator(route.ready).first().waitFor({ timeout: 12000 });
}

async function primeOffline(page, base) {
  await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#profilesRow .avatar-btn').first().waitFor();
  await page.evaluate(async () => { if ('serviceWorker' in navigator) await navigator.serviceWorker.ready; });
  if (!await page.evaluate(() => !!navigator.serviceWorker?.controller)) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 12000 });
  }
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
      primary: intersects(primary), primaryPresent: !!primary, heading: intersects(title),
      viewport: { width: innerWidth, height: innerHeight },
    };
  }, { ready: route.ready, heading: route.heading });
}

function staticDimensions(route) {
  const information = route.id === 'about.html' ? 'product overview' : 'privacy disclosure';
  return {
    progression: na(`${information} has no round progression`),
    score: na(`${information} has no score`),
    rewards: na(`${information} has no rewards`),
    wrong_answers: na(`${information} has no answer mechanic`),
    boundary_taps: na(`${information} has no positioned game target`),
    drag_outside: na(`${information} has no drag mechanic`),
    navigation_during_animation: na(`${information} has no animated transition`),
    stale_corrupt_synthetic_state: na(`${information} does not read child state`),
    empty_min_max_values: na(`${information} has no editable minimum or maximum`),
    timer_expiry: na(`${information} has no timer`),
    interrupted_audio: na(`${information} owns no audio`),
    long_repeated_play: na(`${information} has no repeated-play mechanic`),
    failed_media_network: na(`${information} owns no media request`),
  };
}

async function staticChecks(page, context, base, route, checks) {
  const title = (await page.locator('h1').innerText()).trim();
  checks.instructions = title && (route.id !== 'privacy.html' || await page.locator('.summary li').count() >= 5)
    ? pass(`${title} renders with its primary explanatory content`) : fail(`${route.id} lacks visible explanatory content`);
  if (route.id === 'about.html') {
    checks.input = await page.locator('a[href="privacy.html"]').count() === 1
      ? pass('Privacy Policy link is present as a native anchor') : fail('Privacy Policy link is missing');
    await page.locator('a[href="privacy.html"]').focus(); await page.keyboard.press('Enter');
    await page.waitForURL(/\/privacy\.html$/);
    checks.keyboard_misuse = pass('keyboard activation opened the local Privacy Policy once');
    await visit(page, base, route);
    await page.locator('a[href="privacy.html"]').dblclick(); await page.waitForURL(/\/privacy\.html$/);
    checks.rapid_double_input = pass('double activation settled on one Privacy Policy document');
  } else {
    const links = await page.locator('a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
    checks.input = links.includes('mailto:simplyknownfacts@gmail.com') && links.includes('https://kids.simplyknown.co')
      ? pass('contact and app destinations are explicit native links') : fail('privacy contact or app destination is missing');
    checks.keyboard_misuse = await page.locator('a').first().evaluate(node => node.matches(':any-link') && node.tabIndex >= 0)
      ? pass('privacy links remain keyboard-focusable native anchors') : fail('privacy links are not keyboard reachable');
    checks.rapid_double_input = na('privacy disclosure has no mutating or double-action control');
  }
  await visit(page, base, route);
  checks.back_home = await page.locator('a').evaluateAll(nodes => nodes.some(node => node.href === 'https://kids.simplyknown.co/' || node.href === 'https://kids.simplyknown.co'))
    ? pass('document exposes the canonical app destination') : fail('canonical app destination is missing');
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator(route.ready).first().waitFor();
  checks.restart = pass('fresh document reload restarted at the heading');
  checks.reload_mid_round = pass('reload restored the complete informational document');
  await page.setViewportSize(route.id && page.viewportSize().width < 600 ? { width: 844, height: 390 } : { width: 900, height: 1280 });
  const resized = await geometry(page, route);
  checks.resize_orientation = resized.overflow <= 1 && resized.primaryPresent && resized.heading
    ? pass('orientation change kept the document readable without horizontal overflow') : fail(`resized geometry ${JSON.stringify(resized)}`);
  await page.setViewportSize(checks.__viewport); delete checks.__viewport;
  await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' }); await page.locator('#profilesRow .avatar-btn').first().waitFor();
  await visit(page, base, route); await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' }); await visit(page, base, route);
  checks.repeated_entry_exit = pass('two entries around a picker exit restored the document');
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.locator(route.ready).first().waitFor({ timeout: 12000 });
    checks.offline = pass('installed-app cache restored the previously visited document offline');
  } catch (error) {
    checks.offline = fail(`offline document reload failed: ${String(error.message || error).slice(0, 140)}`);
  } finally { await context.setOffline(false); }
  Object.assign(checks, staticDimensions(route));
}

async function resetVideo(page, base, route) {
  await visit(page, base, route);
  await page.evaluate(() => { if (window.__ytAudit) Object.assign(window.__ytAudit, { created:0, destroyed:0, stopped:0, loaded:[] }); });
}

async function videoChecks(page, context, base, route, checks, setExternalMode) {
  const note = (await page.locator('.world-note').innerText()).trim();
  checks.instructions = /only channels added in Parent Settings/i.test(note)
    ? pass('Watch explains that a grown-up controls available channels') : fail('Watch lacks visible parent-control guidance');
  await page.locator('.channel-tile').click(); await page.locator('#playerWrap.active').waitFor();
  await page.waitForFunction(() => window.__ytAudit?.created === 1);
  checks.input = pass('channel target opened the contained player');
  checks.progression = await page.evaluate(() => window.__ytAudit.loaded[0] === 'video-audit-1')
    ? pass('successful feed advanced into its first video') : fail('feed did not load its first video');
  const backBox = await page.locator('#playerBack').boundingBox();
  checks.boundary_taps = backBox && backBox.width >= 44 && backBox.height >= 44 && backBox.x >= 0 && backBox.y >= 0
    ? pass(`player Back target remains reachable at ${Math.round(backBox.width)}x${Math.round(backBox.height)}px`) : fail(`player Back geometry ${JSON.stringify(backBox)}`);
  await page.locator('#playerBack').click(); await page.waitForFunction(() => !document.querySelector('#playerWrap').classList.contains('active'));
  const closed = await page.evaluate(() => ({ ...window.__ytAudit }));
  checks.interrupted_audio = closed.stopped === 1 && closed.destroyed === 1
    ? pass('player close called stop and destroy once; this is lifecycle proof, not real-audio proof') : fail(`player close lifecycle ${JSON.stringify(closed)}`);

  await resetVideo(page, base, route);
  await page.locator('.channel-tile').focus(); await page.keyboard.press('Enter'); await page.locator('#playerWrap.active').waitFor();
  await page.waitForFunction(() => window.__ytAudit?.created === 1);
  await page.locator('#playerBack').focus(); await page.keyboard.press('Enter'); await page.waitForFunction(() => !document.querySelector('#playerWrap').classList.contains('active'));
  checks.keyboard_misuse = pass('native keyboard activation opened and closed the player');

  await resetVideo(page, base, route);
  await page.locator('.channel-tile').evaluate(button => { for (let index = 0; index < 8; index++) button.click(); });
  await page.locator('#playerWrap.active').waitFor(); await page.waitForTimeout(150);
  checks.rapid_double_input = await page.evaluate(() => window.__ytAudit.created >= 1)
    ? pass('rapid channel activation settled on a visible player') : fail('rapid channel activation never produced a player');
  await page.locator('#playerBack').click();

  await resetVideo(page, base, route); setExternalMode('slow');
  await page.locator('.channel-tile').click(); await page.locator('#playerWrap.active').waitFor();
  await page.locator('#playerBack').click(); await page.waitForFunction(() => !document.querySelector('#playerWrap').classList.contains('active'));
  await page.waitForTimeout(550); setExternalMode('success');
  const pendingClose = await page.evaluate(() => ({ ...window.__ytAudit, active: document.querySelector('#playerWrap').classList.contains('active') }));
  checks.navigation_during_animation = !pendingClose.active && pendingClose.created === pendingClose.destroyed
    ? pass('closing during a pending feed left no hidden player') : fail(`pending-feed close leaked a hidden player ${JSON.stringify(pendingClose)}`);

  await resetVideo(page, base, route);
  await page.locator('.channel-tile').click(); await page.waitForFunction(() => window.__ytAudit?.created === 1);
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('.channel-tile').waitFor();
  checks.reload_mid_round = pass('reload abandoned the old player and restored the parent-picked channel list');
  checks.restart = pass('reloading the Watch route restarts at the safe channel list');

  const original = checks.__viewport;
  await page.setViewportSize(original.width < 600 ? { width: 844, height: 390 } : { width: 900, height: 1280 });
  const resized = await geometry(page, route);
  checks.resize_orientation = resized.overflow <= 1 && resized.primaryPresent && resized.heading
    ? pass('orientation change kept a channel and heading reachable') : fail(`resized geometry ${JSON.stringify(resized)}`);
  await page.setViewportSize(original);

  await page.locator('.nav-chrome .back-btn').click(); await page.waitForURL(/\/home\.html$/);
  checks.back_home = pass('Watch Back returned to child home');
  await visit(page, base, route); await page.goto(base + '/home.html', { waitUntil: 'domcontentloaded' }); await visit(page, base, route);
  checks.repeated_entry_exit = pass('two entries around a child-home exit restored Watch');

  setExternalMode('fail'); await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('.channel-tile').waitFor();
  await page.locator('.channel-tile').click(); await page.locator('#playerHost').getByText("Couldn't load shows right now.").waitFor();
  checks.failed_media_network = pass('failed feed shows a recoverable child-safe message');
  await page.locator('#playerBack').click(); setExternalMode('success');

  await page.evaluate(() => {
    const profiles = JSON.parse(localStorage.getItem('vb_profiles'));
    profiles[0].youtube = {};
    localStorage.setItem('vb_profiles', JSON.stringify(profiles));
  });
  const corruptErrors = [];
  const onCorrupt = error => corruptErrors.push(error.message);
  page.on('pageerror', onCorrupt);
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(200);
  const corruptUsable = await page.locator('.channel-tile, .empty-state').first().isVisible().catch(() => false);
  page.off('pageerror', onCorrupt);
  checks.stale_corrupt_synthetic_state = corruptUsable && !corruptErrors.length
    ? pass('malformed optional channel state failed safely to a usable Watch page') : fail(`malformed channel state left Watch unusable: ${corruptErrors.join(' | ') || 'no usable content'}`);

  await page.evaluate(({ tier }) => {
    const profiles = JSON.parse(localStorage.getItem('vb_profiles'));
    profiles[0].youtube = [{ label: '<img src=x onerror="window.__auditMarkupRan=1">', emoji: '', channelId: '' }];
    profiles[0].name = `Explorer${tier}`;
    localStorage.setItem('vb_profiles', JSON.stringify(profiles));
  }, { tier: Number((await page.evaluate(() => JSON.parse(localStorage.getItem('vb_profiles'))[0].id)).split('t')[1]) });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('.channel-tile').waitFor();
  const emptySafe = await page.evaluate(() => ({ ran: window.__auditMarkupRan, images: document.querySelectorAll('.channel-tile img').length, aria: document.querySelector('.channel-tile').getAttribute('aria-label') }));
  checks.empty_min_max_values = !emptySafe.ran && !emptySafe.images && emptySafe.aria.includes('<img')
    ? pass('empty channel values and markup-shaped labels remain inert text') : fail(`empty/hostile channel rendering ${JSON.stringify(emptySafe)}`);

  await page.evaluate(({ tier }) => {
    const profiles = JSON.parse(localStorage.getItem('vb_profiles'));
    profiles[0].youtube = [{ label: `Learning ${tier}`, emoji: '🧪', channelId: `UC_TEST_${tier}` }];
    localStorage.setItem('vb_profiles', JSON.stringify(profiles));
  }, { tier: Number((await page.evaluate(() => JSON.parse(localStorage.getItem('vb_profiles'))[0].id)).split('t')[1]) });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('.channel-tile').waitFor();
  await page.evaluate(() => Object.assign(window.__ytAudit, { created:0, destroyed:0, stopped:0, loaded:[] }));
  for (let index = 0; index < 20; index++) {
    await page.locator('.channel-tile').click(); await page.waitForFunction(value => window.__ytAudit.created === value, index + 1);
    await page.locator('#playerBack').click(); await page.waitForFunction(() => !document.querySelector('#playerWrap').classList.contains('active'));
  }
  const repeated = await page.evaluate(() => ({ ...window.__ytAudit }));
  checks.long_repeated_play = repeated.created === 20 && repeated.destroyed === 20 && repeated.stopped === 20
    ? pass('twenty sequential synthetic player lifecycles stopped and destroyed cleanly') : fail(`repeated lifecycle ${JSON.stringify(repeated)}`);

  await primeOffline(page, base); await visit(page, base, route); setExternalMode('fail');
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }); await page.locator('.channel-tile').waitFor();
    await page.locator('.channel-tile').click(); await page.locator('#playerHost').getByText("Couldn't load shows right now.").waitFor();
    checks.offline = pass('Watch shell and parent-picked channels load offline with an honest unavailable-media message');
  } catch (error) {
    checks.offline = fail(`offline Watch recovery failed: ${String(error.message || error).slice(0, 140)}`);
  } finally { await context.setOffline(false); setExternalMode('success'); }

  checks.score = na('Watch has no score'); checks.rewards = na('Watch has no rewards');
  checks.wrong_answers = na('Watch has no answer mechanic'); checks.drag_outside = na('Watch has no drag mechanic');
  checks.timer_expiry = na('Watch has no timer');
}

async function runCell(browser, base, viewportName, viewport, tier, route) {
  await health(base);
  let externalMode = 'success';
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch, reducedMotion: 'reduce', serviceWorkers: 'allow',
  });
  context.setDefaultTimeout(9000);
  await context.route('**/*', async request => {
    const url = new URL(request.request().url());
    if (url.origin === base) return request.continue();
    if (/\/yt-feed$/.test(url.pathname)) {
      if (externalMode === 'slow') await new Promise(resolve => setTimeout(resolve, 350));
      if (externalMode === 'fail') return request.abort('failed');
      return request.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: [{ id: 'video-audit-1' }] }) });
    }
    if (url.href === 'https://www.youtube.com/iframe_api') {
      if (externalMode === 'fail') return request.abort('failed');
      return request.fulfill({ status: 200, contentType: 'text/javascript', body: YOUTUBE_STUB });
    }
    return request.abort('blockedbyclient');
  });
  await context.addInitScript(seed(), { tier, birthday: birthdayForTier(tier) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const checks = { __viewport: { width: viewport.width, height: viewport.height } };
  let phase = 'launch';
  try {
    await primeOffline(page, base);
    await visit(page, base, route);
    const initial = await geometry(page, route);
    checks.launch = initial.primaryPresent && initial.heading ? pass('real browser rendered identifiable route content') : fail(`initial geometry ${JSON.stringify(initial)}`);
    checks.layout_bounds = initial.overflow <= 1 && initial.primary && initial.heading
      ? pass('primary content is visible with no horizontal overflow') : fail(`initial geometry ${JSON.stringify(initial)}`);
    const shotPath = path.join(SHOTS, `${route.shot}-T${tier}-${viewportName}.png`);
    try { await page.screenshot({ path: shotPath, fullPage: route.id !== 'videos/index.html' }); }
    catch { await page.waitForTimeout(150); await page.screenshot({ path: shotPath, fullPage: route.id !== 'videos/index.html' }); }
    phase = 'route checks';
    if (route.id === 'videos/index.html') await videoChecks(page, context, base, route, checks, mode => { externalMode = mode; });
    else await staticChecks(page, context, base, route, checks);
    checks.visual_quality = blk('screenshots captured for separate human/model visual review');
    delete checks.__viewport;
    const unexpected = errors.filter(message => !/Failed to load resource/i.test(message));
    if (unexpected.length && !Object.values(checks).some(check => check.status === 'FAIL' && check.note.includes(unexpected[0]))) {
      checks.runtime_errors = fail(`${unexpected.length} page errors: ${unexpected.slice(0, 3).join(' | ')}`);
    }
  } catch (error) {
    delete checks.__viewport;
    checks.runtime = fail(`${phase}: ${String(error.message || error).slice(0, 260)}`);
  } finally {
    await context.setOffline(false).catch(() => {});
    await context.close();
  }
  return { id: `${route.id}:T${tier}:${viewportName}`, route: route.route, routeId: route.id, tier, viewport: viewportName, checks };
}

mkdirSync(OUT, { recursive: true }); mkdirSync(SHOTS, { recursive: true });
const port = await freePort(); const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], {
  cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
});
for (let attempt = 0; attempt < 100; attempt++) {
  try { await health(base); break; }
  catch { if (attempt === 99) throw new Error('local server did not start'); await new Promise(resolve => setTimeout(resolve, 100)); }
}
const browser = await chromium.launch(); const started = Date.now(); const queue = [];
for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) if (selectedViewports.includes(viewportName)) {
  for (const tier of selectedTiers) for (const route of ROUTES) if (selectedRoutes.includes(route.id)) queue.push({ viewportName, viewport, tier, route });
}
const rows = [];
try {
  async function worker() {
    while (queue.length) {
      const job = queue.shift(); const row = await runCell(browser, base, job.viewportName, job.viewport, job.tier, job.route);
      rows.push(row);
      const failures = Object.values(row.checks).filter(result => result.status === 'FAIL').length;
      console.log(`${failures ? 'FAIL' : 'PASS'} ${row.id}${failures ? ` (${failures})` : ''}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, queue.length || 1) }, worker));
} finally { await browser.close(); server.kill(); }
rows.sort((a, b) => a.id.localeCompare(b.id));
const counts = { rows: rows.length, pass: 0, fail: 0, na: 0, blk: 0 };
for (const row of rows) for (const result of Object.values(row.checks)) counts[result.status.toLowerCase()]++;
const report = { baseline: APP_BASELINE, base, generatedAt: new Date().toISOString(), durationSec: Math.round((Date.now() - started) / 1000), counts, rows };
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...counts, durationSec: report.durationSec }));
if (rows.length !== selectedViewports.length * selectedTiers.length * selectedRoutes.length || counts.fail) process.exitCode = 1;
