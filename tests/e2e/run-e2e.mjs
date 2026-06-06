// Full real-click E2E harness for the Valiant Breeze kids PWA.
// Drives the LIVE site with real clicks (no localStorage state-injection beyond
// the unavoidable "a kid exists" precondition + PIN seed). One isolated browser
// context per age tier, run concurrently. Implements tests/e2e/MAP.md.
//
// Usage:
//   node run-e2e.mjs                 full run, 8 tiers, BASE=https://kids.simplyknown.co
//   node run-e2e.mjs --tiers=1       single tier (validation)
//   node run-e2e.mjs --tiers=1,8 --conc=2
//   BASE=http://localhost:8866 node run-e2e.mjs
//
// Anti-hang: per-op timeouts, bounded interaction loops, per-tier result file
// written as each tier finishes. Cannot silently stall.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'out');
const BASE = (process.env.BASE || 'https://kids.simplyknown.co').replace(/\/$/, '');
const args = process.argv.slice(2);
const argVal = (n) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : null; };
const TIERS = argVal('tiers') ? argVal('tiers').split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 8];
const CONC = Number(argVal('conc') || 4);
const VIEWPORT = { width: 1280, height: 900 }; // wide => settings sidebar layout

// ── catalog (15 in ACTIVITY_FEATURES) + peek-a-boo orphan ────────────────────
const SECTION_DIR = { games: 'games', learn: 'learning', art: 'art' };
const ACTIVITIES = [
  { id: 'tap-pop', name: 'Tap & Pop', section: 'games', file: 'games/tap-pop.html', minTier: 1 },
  { id: 'shape-match', name: 'Shape Match', section: 'games', file: 'games/shape-match.html', minTier: 1 },
  { id: 'hello-colors', name: 'Hello Colors', section: 'learn', file: 'learning/hello-colors.html', minTier: 1 },
  { id: 'animal-sounds', name: 'Animal Sounds', section: 'learn', file: 'learning/animal-sounds.html', minTier: 1 },
  { id: 'count-along', name: 'Count Along', section: 'learn', file: 'learning/count-along.html', minTier: 2 },
  { id: 'abcs', name: 'ABCs', section: 'learn', file: 'learning/abcs.html', minTier: 2 },
  { id: 'body-parts', name: 'Body Parts', section: 'learn', file: 'learning/body-parts.html', minTier: 2 },
  { id: 'days', name: 'Days', section: 'learn', file: 'learning/days.html', minTier: 3 },
  { id: 'math', name: 'Math Mountain', section: 'learn', file: 'learning/math.html', minTier: 4 },
  { id: 'spelling', name: 'Spelling Bee', section: 'learn', file: 'learning/spelling.html', minTier: 4 },
  { id: 'money', name: 'Money', section: 'learn', file: 'learning/money.html', minTier: 4 },
  { id: 'stamp-art', name: 'Stamp Art', section: 'art', file: 'art/stamp-art.html', minTier: 1 },
  { id: 'finger-paint', name: 'Finger Paint', section: 'art', file: 'art/finger-paint.html', minTier: 1 },
  { id: 'color-splash', name: 'Color Splash', section: 'art', file: 'art/color-splash.html', minTier: 1 },
  { id: 'color-in', name: 'Color In', section: 'art', file: 'art/color-in.html', minTier: 2 },
  { id: 'peek-a-boo', name: 'Peek-a-boo', section: 'games', file: 'games/peek-a-boo.html', minTier: 1, orphan: true },
];
// features per activity (key, label text in #featuresTable, minTier)
const FEATURES = {
  'shape-match': [{ k: 'dragMode', t: 1, label: 'Drag-to-match mode' }],
  'hello-colors': [{ k: 'colorQuiz', t: 4, label: 'Color quiz mode' }],
  'animal-sounds': [{ k: 'quizMode', t: 4, label: 'Sound quiz mode' }],
  'count-along': [{ k: 'quizMode', t: 4, label: 'How-many quiz mode' }],
  'abcs': [{ k: 'wordHints', t: 3, label: 'Show "A is for Apple" word hints' }, { k: 'spellMode', t: 6, label: 'Spell short words' }],
  'days': [{ k: 'quizMode', t: 5, label: 'Quiz mode (what comes after Monday?)' }],
  'math': [{ k: 'subtract', t: 5, label: 'Include subtraction' }, { k: 'multiply', t: 8, label: 'Include multiplication' }],
  'spelling': [{ k: 'spellMode', t: 6, label: 'Spell from letter bank' }],
  'money': [{ k: 'countMode', t: 6, label: 'Count coin + bill totals' }],
  'body-parts': [{ k: 'allParts', t: 4, label: 'Include extra parts (hair, belly, etc.)' }],
  'stamp-art': [{ k: 'themeSwitcher', t: 4, label: 'Theme switcher (farm/ocean/space)' }],
  'finger-paint': [{ k: 'colorPalette', t: 2, label: 'Color palette' }, { k: 'eraser', t: 4, label: 'Eraser tool' }],
  'color-splash': [{ k: 'colorPicker', t: 2, label: 'Color picker' }],
};
const EXPECT_VISIBLE = { // per tier: games/learn/art (for gating assertion)
  1: { games: 2, learn: 2, art: 3 }, 2: { games: 2, learn: 5, art: 4 },
  3: { games: 2, learn: 6, art: 4 }, 4: { games: 2, learn: 9, art: 4 },
  5: { games: 2, learn: 9, art: 4 }, 6: { games: 2, learn: 9, art: 4 },
  7: { games: 2, learn: 9, art: 4 }, 8: { games: 2, learn: 9, art: 4 },
};

// ── helpers ──────────────────────────────────────────────────────────────────
function birthdayForTier(tier) {
  const months = { 1: 6, 2: 18, 3: 30, 4: 42, 5: 54, 6: 66, 7: 78, 8: 120 }[tier];
  const d = new Date(); d.setDate(15); d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}
function makeProfile(tier, id, name) {
  return { id, name, birthday: birthdayForTier(tier), color: '#4ECDC4', voice: 'girl', mascot: { id: 'dog' }, tierOverrides: {}, features: {}, youtube: [] };
}
function initScript(profile) {
  return `
    try {
      // idempotent: seed only if absent, so state accrues across navigations
      // (re-seeding every load would wipe earned ribbons + added/deleted kids).
      if (!localStorage.getItem('vb_profiles')) localStorage.setItem('vb_profiles', JSON.stringify([${JSON.stringify(profile)}]));
      if (!localStorage.getItem('vb_active_id')) localStorage.setItem('vb_active_id', ${JSON.stringify(profile.id)});
      if (!localStorage.getItem('vb_pin')) localStorage.setItem('vb_pin', '1234');
      localStorage.removeItem('vb_pin_lockout');
    } catch (e) {}
    try { HTMLMediaElement.prototype.play = function () { return Promise.resolve(); }; } catch (e) {}
    try { if (window.speechSynthesis) window.speechSynthesis.speak = function () {}; } catch (e) {}
    try { navigator.vibrate = function () { return true; }; } catch (e) {}
  `;
}
const isAssetNoise = (u) => !!u && (/\/(mascots|audio|voices|videos|hats)\//i.test(u) || /\/assets\/(ribbons|hats)\//i.test(u) || /\.(mp4|webm|mp3|wav|ogg|m4a)(\?|$)/i.test(u));
const rnd = (a, b) => a + Math.random() * (b - a);
const counter = (page, id) => page.evaluate((i) => (window.vbProgress && vbProgress.getState().counters[i]) || 0, id).catch(() => 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// attach error capture to a page; returns a buffer + a per-cell reset
function attachErrors(page) {
  const buf = { console: [], page: [], net: [], noise: 0 };
  page.on('pageerror', (e) => buf.page.push(String(e && e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); const u = (m.location && m.location().url) || ''; (isAssetNoise(t) || isAssetNoise(u)) ? buf.noise++ : buf.console.push(t); } });
  page.on('requestfailed', (r) => { const u = r.url(); const err = r.failure()?.errorText || ''; (isAssetNoise(u) || /aborted/i.test(err)) ? buf.noise++ : buf.net.push(`${u} ${err}`); });
  page.on('response', (r) => { if (r.status() >= 400) { const u = r.url(); isAssetNoise(u) ? buf.noise++ : buf.net.push(`${r.status()} ${u}`); } });
  return buf;
}
function snapErrors(buf) { const s = { console: buf.console.length, page: buf.page.length, net: buf.net.length, samples: [...buf.page, ...buf.console.slice(0, 3), ...buf.net.slice(0, 3)] }; buf.console.length = 0; buf.page.length = 0; buf.net.length = 0; return s; }

// ── activity play recipes: return { ok, signal, note } ───────────────────────
async function play(page, act, tier) {
  const id = act.id;
  const before = await counter(page, id);
  const bumped = async () => (await counter(page, id)) > before;

  try {
    if (id === 'tap-pop') {
      const box = await page.locator('#canvas').boundingBox();
      for (let i = 0; i < 70 && !(await bumped()); i++) {
        await page.mouse.move(box.x + box.width * rnd(0.15, 0.85), box.y + box.height * rnd(0.4, 0.95));
        await page.mouse.down(); await page.mouse.up(); await sleep(100);
      }
      return { ok: await bumped(), signal: 'score/counter +1 via canvas pops' };
    }
    if (id === 'shape-match') {
      // detect drag vs tap mode
      const hasTargets = await page.locator('.target').count();
      if (!hasTargets) { // tap mode (t1)
        await page.locator('#shapesRow svg.shape').first().click({ timeout: 5000 }).catch(() => {});
        const hint = await page.textContent('#hint').catch(() => '');
        return { ok: /Circle|Square|Triangle|Star|Heart|Diamond/.test(hint || '') || await bumped(), signal: `tap mode, #hint="${(hint || '').trim()}"` };
      }
      const shapes = await page.locator('#shapesRow svg.shape').evaluateAll((els) => els.map((e) => e.getAttribute('data-shape')));
      let matched = 0;
      for (const sh of shapes) {
        const src = page.locator(`#shapesRow svg.shape[data-shape="${sh}"]`).first();
        const tgt = page.locator(`.target[data-shape="${sh}"]`).first();
        const sb = await src.boundingBox().catch(() => null); const tb = await tgt.boundingBox().catch(() => null);
        if (!sb || !tb) continue;
        await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await page.mouse.down();
        await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 6 }); await page.mouse.up();
        await sleep(250);
        if (await page.locator(`.target[data-shape="${sh}"].matched`).count()) matched++;
      }
      return { ok: matched > 0 || await bumped(), signal: `drag mode, ${matched}/${shapes.length} matched` };
    }
    if (id === 'peek-a-boo') {
      if (tier <= 2) { const solo = await page.locator('.animal-solo').count(); return { ok: solo > 0, signal: 'auto mode (no input)', note: 'tier<=2 auto-cycles' }; }
      // single (3-4) or multi (>=5)
      const curtains = page.locator('#stage .curtain-wrap .curtain');
      const n = await curtains.count();
      for (let i = 0; i < Math.max(1, n); i++) {
        await curtains.nth(i).click({ timeout: 4000 }).catch(() => {});
        await sleep(400);
        if (await page.locator('#stage .curtain.open').count()) return { ok: true, signal: 'curtain opened' };
      }
      return { ok: await bumped(), signal: 'clicked curtains' };
    }
    if (id === 'abcs') {
      if (tier >= 7 || await page.locator('.spelled-slot').count()) {
        const slots = await page.locator('.spelled-slot').evaluateAll((els) => els.map((e) => e.dataset.target));
        for (const ch of slots) { await page.locator(`.letter-grid .letter-tile`, { hasText: new RegExp(`^${ch}$`, 'i') }).first().click({ timeout: 3000 }).catch(() => {}); await sleep(150); }
        return { ok: await bumped(), signal: `spell "${slots.join('')}"` };
      }
      await page.locator('.nav-row .pager-btn:not(.secondary)').first().click({ timeout: 4000 }).catch(() => {});
      return { ok: await bumped(), signal: 'clicked Next (default mode)' };
    }
    if (id === 'animal-sounds') {
      const garden = await page.locator('#garden .animal-float').count();
      if (garden && !(await page.locator('#quizArea').isVisible().catch(() => false))) {
        await page.locator('#garden .animal-float').first().click({ timeout: 4000 }).catch(() => {});
        return { ok: await bumped(), signal: 'tapped garden animal' };
      }
      const choices = page.locator('#quizStage .choice-btn');
      const c = await choices.count();
      for (let i = 0; i < c && !(await bumped()); i++) { await choices.nth(i).click({ timeout: 3000 }).catch(() => {}); await sleep(300); }
      return { ok: await bumped(), signal: `quiz, tried ${c} choices` };
    }
    if (id === 'body-parts') {
      const hint = (await page.textContent('#hint').catch(() => '')) || '';
      const map = { eyes: 'eye', feet: 'foot', hands: 'hand', ears: 'ear', arms: 'arm', legs: 'leg' };
      let part = (hint.match(/\b(eyes?|nose|mouth|ears?|hands?|feet|foot|arms?|legs?|hair|belly)\b/i) || [])[1] || '';
      part = part.toLowerCase(); part = map[part] || part.replace(/s$/, '');
      if (part) await page.locator(`#figure .hit[data-name="${part}"]`).first().click({ timeout: 4000 }).catch(() => {});
      return { ok: await bumped() || !!(await page.locator('#figure .hit.flash').count()), signal: `tapped "${part}" (hint="${hint.trim()}")` };
    }
    if (id === 'count-along') {
      if (await page.locator('.num-btn').count()) { // quiz/skip
        const cnt = await page.locator('.dot.counted').count();
        if (cnt) { await page.locator('.num-btn', { hasText: new RegExp(`^${cnt}$`) }).first().click({ timeout: 3000 }).catch(() => {}); }
        else { const btns = page.locator('.num-btn'); const m = await btns.count(); for (let i = 0; i < m && !(await bumped()); i++) { await btns.nth(i).click().catch(() => {}); await sleep(250); } }
        return { ok: await bumped(), signal: `quiz, pile=${cnt}` };
      }
      const dots = page.locator('.row .dot'); const m = await dots.count();
      for (let i = 0; i < m; i++) { await dots.nth(i).click({ timeout: 2000 }).catch(() => {}); await sleep(120); }
      return { ok: await bumped(), signal: `tapped ${m} dots` };
    }
    if (id === 'days') {
      if (tier <= 4 && !(await page.locator('.day-tile.matched').count())) {
        await page.locator('.day-tile').first().click({ timeout: 3000 }).catch(() => {});
        const n = await page.locator('.day-tile').count();
        return { ok: n >= 7, signal: 'tap-to-hear (no success path < t5)', note: 'no-record-by-design' };
      }
      // quiz: compute the after/before answer when the hint gives a base day
      const dhint = (await page.textContent('#hint').catch(() => '')) || '';
      const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const baseM = dhint.match(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/);
      if (baseM && /(after|before)/i.test(dhint)) {
        const target = DAYS[(DAYS.indexOf(baseM[1]) + (/after/i.test(dhint) ? 1 : 6)) % 7];
        await page.locator('.day-tile', { hasText: target }).first().click({ timeout: 3000 }).catch(() => {});
        if (await bumped()) return { ok: true, signal: `quiz: ${baseM[1]} ${/after/i.test(dhint) ? 'after' : 'before'} → ${target}` };
      }
      const tiles = page.locator('.day-tile'); const m = await tiles.count();
      for (let i = 0; i < m && !(await bumped()); i++) { await tiles.nth(i).click().catch(() => {}); await sleep(200); }
      return { ok: await bumped(), signal: 'quiz, tried day tiles' };
    }
    if (id === 'hello-colors') {
      if (tier === 1) { const n = await page.locator('.thing-card').count(); return { ok: n > 0, signal: 'auto mode', note: 'tier1 auto-cycles' }; }
      const cards = page.locator('#thingsRow .thing-card'); const m = await cards.count();
      for (let i = 0; i < m && !(await bumped()); i++) { await cards.nth(i).click({ timeout: 2000 }).catch(() => {}); await sleep(200); }
      return { ok: await bumped(), signal: `clicked ${m} thing-cards` };
    }
    if (id === 'math') {
      const eq = await page.evaluate(() => {
        const piles = [...document.querySelectorAll('.eq-row .pile')];
        const op = (document.querySelector('.eq-row .op') || {}).textContent || '+';
        let a, b;
        if (piles.length >= 2) { a = piles[0].querySelectorAll('.item').length; b = piles[1].querySelectorAll('.item').length; }
        else { const ns = [...document.querySelectorAll('.eq-row')].map(e => (e.textContent.match(/\d+/g) || [])).flat().map(Number); a = ns[0]; b = ns[1]; }
        return { a, b, op };
      }).catch(() => null);
      if (eq && eq.a != null && eq.b != null) {
        const ans = eq.op.includes('-') || eq.op.includes('−') ? eq.a - eq.b : eq.op.includes('×') || eq.op.includes('x') ? eq.a * eq.b : eq.a + eq.b;
        await page.locator('.num-row .num-btn', { hasText: new RegExp(`^${ans}$`) }).first().click({ timeout: 3000 }).catch(() => {});
      }
      return { ok: await bumped() || !!(await page.locator('.answer-box.filled').count()), signal: eq ? `${eq.a}${eq.op}${eq.b}` : 'parse failed' };
    }
    if (id === 'money') {
      if (await page.locator('.num-row .num-btn').count()) { // count mode
        const btns = page.locator('.num-row .num-btn'); const m = await btns.count();
        for (let i = 0; i < m && !(await bumped()); i++) { await btns.nth(i).click().catch(() => {}); await sleep(250); }
        return { ok: await bumped(), signal: 'count mode, tried choices' };
      }
      const hint = (await page.textContent('#hint').catch(() => '')) || '';
      const nameMap = { Penny: 'penny', Nickel: 'nickel', Dime: 'dime', Quarter: 'quarter', 'Dollar Bill': 'dollar', 'Five Dollar Bill': 'five', 'Ten Dollar Bill': 'ten' };
      const key = Object.keys(nameMap).find((nm) => hint.includes(nm));
      if (key) await page.locator(`.coin-svg[data-id="${nameMap[key]}"], .bill-svg[data-id="${nameMap[key]}"]`).first().click({ timeout: 3000 }).catch(() => {});
      return { ok: await bumped() || !!(await page.locator('.matched').count()), signal: `identify "${key || '?'}"` };
    }
    if (id === 'spelling') {
      if (tier >= 6 || await page.locator('.spelled-slot').count()) {
        const slots = await page.locator('.spelled-slot').evaluateAll((els) => els.map((e) => e.dataset.target));
        for (const ch of slots) { await page.locator('.letter-tile', { hasText: new RegExp(`^${ch}$`, 'i') }).first().click({ timeout: 3000 }).catch(() => {}); await sleep(150); }
        return { ok: await bumped(), signal: `spell "${slots.join('')}"` };
      }
      const cards = page.locator('.word-choices .word-card'); const m = await cards.count();
      for (let i = 0; i < m && !(await bumped()); i++) { await cards.nth(i).click({ timeout: 2500 }).catch(() => {}); await sleep(250); }
      return { ok: await bumped() || !!(await page.locator('.word-card.matched').count()), signal: `MC, tried ${m} words` };
    }
    if (id === 'color-in') {
      const region = page.locator('#pageA:not([style*="display: none"]) svg.pic-svg .region, #pageB:not([style*="display: none"]) svg.pic-svg .region').first();
      const has = await region.count();
      if (has) {
        await region.click({ timeout: 4000 }).catch(() => {});
        const filled = await region.evaluate((el) => getComputedStyle(el).fill).catch(() => '');
        return { ok: filled && !/255,\s*255,\s*255|#fff/i.test(filled), signal: `region fill=${filled}` };
      }
      return { ok: false, signal: 'no svg region found' };
    }
    if (['color-splash', 'finger-paint', 'stamp-art'].includes(id)) {
      const box = await page.locator('#canvas').boundingBox();
      if (!box) return { ok: false, signal: 'no canvas' };
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      if (id === 'finger-paint') { await page.mouse.move(cx - 130, cy); await page.mouse.down(); await page.mouse.move(cx + 130, cy, { steps: 14 }); await page.mouse.up(); }
      else { await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.up(); }
      await sleep(300);
      // sample a box centered on canvas center (where the stroke/stamp/splash lands)
      const painted = await page.evaluate((boxsz) => {
        const c = document.querySelector('#canvas'); if (!c) return false; const ctx = c.getContext('2d'); if (!ctx) return false;
        const px = Math.floor(c.width / 2), py = Math.floor(c.height / 2), half = Math.floor(boxsz / 2);
        const sx = Math.max(0, px - half), sy = Math.max(0, py - half);
        const w = Math.min(boxsz, c.width - sx), h = Math.min(boxsz, c.height - sy);
        const d = ctx.getImageData(sx, sy, w, h).data; const bg = [26, 26, 46];
        for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 0 && Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 24) return true; }
        return false;
      }, id === 'stamp-art' ? 80 : 44).catch(() => false);
      return { ok: painted, signal: painted ? 'canvas painted (non-bg pixels)' : 'canvas appears unchanged' };
    }
    return { ok: false, signal: 'no recipe' };
  } catch (e) {
    return { ok: false, signal: 'recipe threw', note: String(e.message || e).slice(0, 120) };
  }
}

// classify a cell from render + recipe + errors
function classify({ loaded, redirected, recipe, errs, noSuccessByDesign, loadOnly }) {
  if (!loaded || redirected || errs.page > 0) return 'FAIL';
  if (recipe && recipe.note === 'recipe threw') return 'FAIL';
  if ((recipe && recipe.ok) || noSuccessByDesign || loadOnly) return errs.console || errs.net ? 'WARN' : 'PASS';
  return 'WARN'; // rendered but no expected success signal
}

// ── per-tier runner ──────────────────────────────────────────────────────────
async function runTier(browser, tier) {
  const cells = [];
  const tdir = join(OUT, `t${tier}`); mkdirSync(tdir, { recursive: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' });
  ctx.setDefaultTimeout(15000);
  const baseProfile = makeProfile(tier, 'e2e-base', `Test${tier}`);
  await ctx.addInitScript(initScript(baseProfile));
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept().catch(() => {}));
  const errs = attachErrors(page);
  const shot = async (n) => { try { await page.screenshot({ path: join(tdir, n + '.png') }); } catch (e) {} };
  const record = (label, kind, status, extra = {}) => { cells.push({ tier, label, kind, status, ...extra }); console.log(`  [t${tier}] ${status.padEnd(4)} ${kind} ${label}${extra.signal ? ' — ' + extra.signal : ''}${extra.note ? ' (' + extra.note + ')' : ''}`); };

  const goto = async (path) => {
    snapErrors(errs);
    try { await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
    catch (e) { return false; }
    return true;
  };
  const redirectedToPicker = () => { const p = page.url().replace(BASE, ''); return p === '/' || p === '/index.html' || p === ''; };

  // ── STEP 1: add a 2nd kid via the REAL UI ──
  try {
    await goto('index.html');
    await page.waitForSelector('#addBtn', { timeout: 12000 });
    await page.locator('#addBtn').click();
    await page.waitForSelector('#pinPad', { timeout: 12000 });
    for (const d of ['1', '2', '3', '4']) await page.locator('#pinPad .pin-key', { hasText: new RegExp('^' + d + '$') }).first().click().catch(() => {});
    await page.waitForSelector('#addForm', { state: 'visible', timeout: 10000 });
    await page.fill('#newName', `Added${tier}`);
    await page.fill('#newBirthday', birthdayForTier(tier));
    await page.locator('button', { hasText: /^Save$/ }).first().click();
    await sleep(600);
    const count = await page.evaluate(() => JSON.parse(localStorage.getItem('vb_profiles') || '[]').length);
    await shot('01-add-kid');
    record('add child via UI', 'flow', count === 2 ? 'PASS' : 'FAIL', { signal: `profiles=${count} (expect 2)`, ...snapErrors(errs) });
  } catch (e) { await shot('01-add-kid-ERR'); record('add child via UI', 'flow', 'FAIL', { note: String(e.message || e).slice(0, 140), ...snapErrors(errs) }); }

  // ── STEP 2: home + section gating ──
  for (const sec of ['games', 'learn', 'art']) {
    try {
      const dir = SECTION_DIR[sec];
      const ok = await goto(`${dir}/index.html`);
      await page.waitForSelector('#cardsRow .activity-card, #emptyMsg', { timeout: 12000 }).catch(() => {});
      const n = await page.locator('#cardsRow .activity-card').count();
      const exp = EXPECT_VISIBLE[tier][sec];
      await shot(`02-gate-${sec}`);
      record(`${sec} gating`, 'gating', !ok || redirectedToPicker() ? 'FAIL' : n === exp ? 'PASS' : 'WARN', { signal: `visible=${n} expect=${exp}`, ...snapErrors(errs) });
    } catch (e) { record(`${sec} gating`, 'gating', 'FAIL', { note: String(e.message || e).slice(0, 120), ...snapErrors(errs) }); }
  }

  // ── STEP 3: activities ──
  for (const act of ACTIVITIES) {
    const visible = !act.orphan && tier >= act.minTier;
    const playable = visible || act.orphan; // orphan games still played via direct load
    try {
      let loaded, viaTile = false;
      if (visible) {
        // navigate via REAL tile click from section index; fall back to direct
        // load if the tile is slow under parallel load (so contention != FAIL)
        await goto(`${SECTION_DIR[act.section]}/index.html`);
        const cards = await page.waitForSelector('#cardsRow .activity-card', { timeout: 20000 }).then(() => true).catch(() => false);
        if (cards) {
          const tile = page.locator('#cardsRow .activity-card').filter({ has: page.locator(`.label:text-is("${act.name}")`) }).first();
          if (await tile.count()) { try { await tile.click({ timeout: 8000 }); viaTile = true; } catch (e) {} }
        }
        loaded = viaTile ? true : await goto(act.file);
        await page.waitForLoadState('domcontentloaded').catch(() => {});
      } else {
        loaded = await goto(act.file); // gated (below minTier) / orphan: direct load
      }
      await sleep(700);
      const redirected = redirectedToPicker();
      const hasApp = await page.evaluate(() => !!window.vbProgress).catch(() => false);
      let recipe = null;
      const noSuccessByDesign = (act.id === 'days' && tier <= 4) || (act.id === 'hello-colors' && tier === 1) || (act.id === 'peek-a-boo' && tier <= 2);
      if (playable && !redirected && hasApp) recipe = await play(page, act, tier);
      await shot(`act-${act.id}`);
      const kind = act.orphan ? 'orphan' : (visible ? 'play' : 'gated-load');
      const status = classify({ loaded, redirected, recipe, errs: snapErrors(errs), noSuccessByDesign, loadOnly: !visible && !act.orphan });
      record(act.name, kind, redirected ? 'FAIL' : status, {
        signal: recipe ? recipe.signal : 'load-only',
        note: [act.orphan ? 'not in catalog — unreachable by kids via nav' : '', visible && !viaTile ? 'nav: direct (tile slow under load)' : '', recipe && recipe.note ? recipe.note : '', redirected ? 'redirected to picker' : ''].filter(Boolean).join('; ') || undefined,
      });
    } catch (e) { await shot(`act-${act.id}-ERR`); record(act.name, act.orphan ? 'orphan' : (visible ? 'play' : 'gated-load'), 'FAIL', { note: String(e.message || e).slice(0, 140), ...snapErrors(errs) }); }
  }

  // ── STEP 4: settings — features, voice, hide/show ──
  try {
    await goto('parent/settings.html');
    await page.waitForSelector('#pinGate', { timeout: 12000 }).catch(() => {});
    for (const d of ['1', '2', '3', '4']) await page.locator('#pinPad .pin-key', { hasText: new RegExp('^' + d + '$') }).first().click().catch(() => {});
    const unlocked = await page.waitForSelector('#mainSettings', { state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
    await shot('04-settings');
    record('settings PIN unlock', 'flow', unlocked ? 'PASS' : 'FAIL', { ...snapErrors(errs) });
    if (unlocked) {
      // 2 kids exist now — make sure settings is editing the base kid
      await page.locator('#kidsBar .kid-pill', { hasText: `Test${tier}` }).first().click().catch(() => {});
      await sleep(200);
      // features panel
      await page.locator('#sideNav .navitem[data-key="features"]').click().catch(() => {});
      await sleep(300);
      let toggled = 0, toggleFail = 0;
      for (const act of ACTIVITIES) {
        for (const f of (FEATURES[act.id] || [])) {
          if (f.t > tier) continue;
          const row = page.locator('#featuresTable tr', { hasText: act.name });
          const cb = row.locator('label.feat-label', { hasText: f.label }).locator('input[type=checkbox]').first();
          if (!(await cb.count())) continue;
          await cb.check({ timeout: 3000 }).catch(() => {});
          const on = await page.evaluate(({ a, k }) => { const p = JSON.parse(localStorage.vb_profiles).find((x) => x.id === 'e2e-base'); return !!(p && p.features && p.features[a] && p.features[a][k]); }, { a: act.id, k: f.k }).catch(() => false);
          on ? toggled++ : toggleFail++;
        }
      }
      record('feature toggles', 'settings', toggleFail ? 'WARN' : 'PASS', { signal: `${toggled} toggled, ${toggleFail} failed`, ...snapErrors(errs) });
      // voice
      await page.locator('#sideNav .navitem[data-key="voice"]').click().catch(() => {});
      await sleep(300);
      await page.locator('#voiceSection .vcard[data-voice="woman"]').click().catch(() => {});
      const vsel = await page.locator('#voiceSection .vcard[data-voice="woman"].sel').count().catch(() => 0);
      record('voice pick', 'settings', vsel ? 'PASS' : 'WARN', { ...snapErrors(errs) });
      // hide an activity then restore
      await page.locator('#sideNav .navitem[data-key="activities"]').click().catch(() => {});
      await sleep(300);
      const visCb = page.locator('#activitiesSection input.act-vis[data-aid="tap-pop"]').first();
      let hideOk = false;
      if (await visCb.count()) { await visCb.uncheck().catch(() => {}); hideOk = await page.evaluate(() => { const p = JSON.parse(localStorage.vb_profiles).find((x) => x.id === 'e2e-base'); return !!(p && p.activitiesVisible && p.activitiesVisible['tap-pop'] === false); }).catch(() => false); await visCb.check().catch(() => {}); }
      record('activity hide/show', 'settings', hideOk ? 'PASS' : 'WARN', { ...snapErrors(errs) });
    }
  } catch (e) { record('settings', 'flow', 'FAIL', { note: String(e.message || e).slice(0, 140), ...snapErrors(errs) }); }

  // ── STEP 5: ribbon gallery ──
  try {
    await goto('achievements.html');
    await page.waitForSelector('.gallery-screen, #groups', { timeout: 12000 }).catch(() => {});
    await sleep(400);
    const earned = await page.locator('.gallery-cell .vb-ribbon:not(.locked)').count().catch(() => 0);
    await shot('05-ribbons');
    record('ribbon gallery', 'ribbon', earned > 0 ? 'PASS' : 'WARN', { signal: `${earned} earned ribbons`, ...snapErrors(errs) });
  } catch (e) { record('ribbon gallery', 'ribbon', 'FAIL', { note: String(e.message || e).slice(0, 120), ...snapErrors(errs) }); }

  // ── STEP 6: delete the added kid via UI ──
  try {
    await goto('parent/settings.html');
    await page.waitForSelector('#pinPad', { timeout: 12000 }).catch(() => {});
    for (const d of ['1', '2', '3', '4']) await page.locator('#pinPad .pin-key', { hasText: new RegExp('^' + d + '$') }).first().click().catch(() => {});
    await page.waitForSelector('#mainSettings', { state: 'visible', timeout: 10000 }).catch(() => {});
    await page.locator('#sideNav .navitem[data-key="children"]').click().catch(() => {});
    await sleep(300);
    const card = page.locator('#profilesList .card', { hasText: `Added${tier}` });
    if (await card.count()) await card.getByRole('button', { name: 'Delete' }).click().catch(() => {});
    await sleep(500);
    const count = await page.evaluate(() => JSON.parse(localStorage.getItem('vb_profiles') || '[]').length);
    await shot('06-delete-kid');
    record('delete child via UI', 'flow', count === 1 ? 'PASS' : 'FAIL', { signal: `profiles=${count} (expect 1)`, ...snapErrors(errs) });
  } catch (e) { record('delete child via UI', 'flow', 'FAIL', { note: String(e.message || e).slice(0, 140), ...snapErrors(errs) }); }

  await ctx.close();
  // write per-tier result immediately (anti-hang)
  writeFileSync(join(tdir, 'result.json'), JSON.stringify({ tier, cells }, null, 2));
  return { tier, cells };
}

// ── main: concurrency pool ─────────────────────────────────────────────────
(async () => {
  const started = Date.now();
  mkdirSync(OUT, { recursive: true });
  console.log(`[e2e] base=${BASE} tiers=${TIERS.join(',')} conc=${CONC}`);
  const browser = await chromium.launch();
  const results = [];
  const queue = [...TIERS];
  async function worker() { while (queue.length) { const t = queue.shift(); try { results.push(await runTier(browser, t)); } catch (e) { console.error(`[t${t}] TIER FATAL`, e.message); results.push({ tier: t, cells: [{ tier: t, label: 'tier crashed', kind: 'fatal', status: 'FAIL', note: String(e.message || e).slice(0, 200) }] }); } } }
  await Promise.all(Array.from({ length: Math.min(CONC, TIERS.length) }, worker));
  await browser.close();

  results.sort((a, b) => a.tier - b.tier);
  const all = results.flatMap((r) => r.cells);
  const summary = { base: BASE, generatedAt: new Date().toISOString(), durationSec: Math.round((Date.now() - started) / 1000), counts: { total: all.length, pass: all.filter((c) => c.status === 'PASS').length, warn: all.filter((c) => c.status === 'WARN').length, fail: all.filter((c) => c.status === 'FAIL').length }, results };
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(summary, null, 2));
  writeFileSync(join(OUT, 'report.md'), renderMd(summary));
  console.log(`\n[e2e] DONE: ${summary.counts.pass} PASS / ${summary.counts.warn} WARN / ${summary.counts.fail} FAIL of ${summary.counts.total} in ${summary.durationSec}s`);
  console.log(`[e2e] report: tests/e2e/out/report.md`);
})().catch((e) => { console.error('[e2e] FATAL', e); process.exit(1); });

function renderMd(s) {
  const L = [];
  L.push('# Full E2E Report', '', `- Base: ${s.base}`, `- Generated: ${s.generatedAt}`, `- Duration: ${s.durationSec}s`, `- **${s.counts.pass} PASS / ${s.counts.warn} WARN / ${s.counts.fail} FAIL** of ${s.counts.total}`, '');
  // activity x tier matrix (play + gated-load cells)
  const acts = ACTIVITIES.map((a) => a.id);
  const tiers = s.results.map((r) => r.tier);
  L.push('## Activity × Tier', '', '| activity | ' + tiers.map((t) => `t${t}`).join(' | ') + ' |', '|' + '---|'.repeat(tiers.length + 1));
  for (const id of acts) {
    const name = ACTIVITIES.find((a) => a.id === id).name;
    const row = tiers.map((t) => { const c = (s.results.find((r) => r.tier === t)?.cells || []).find((x) => (x.kind === 'play' || x.kind === 'gated-load' || x.kind === 'orphan') && x.label === name); if (!c) return '·'; return c.status === 'PASS' ? '✅' : c.status === 'WARN' ? '⚠️' : '❌'; });
    L.push(`| ${name} | ${row.join(' | ')} |`);
  }
  L.push('');
  // flows/settings/gating/ribbon per tier
  L.push('## Flows, gating, settings, ribbons (per tier)', '');
  for (const r of s.results) {
    L.push(`### Tier ${r.tier}`);
    for (const c of r.cells.filter((x) => x.kind !== 'play' && x.kind !== 'gated-load' && x.kind !== 'orphan')) {
      const m = c.status === 'PASS' ? '✅' : c.status === 'WARN' ? '⚠️' : '❌';
      L.push(`- ${m} **${c.label}** ${c.signal || ''}${c.note ? ` _(${c.note})_` : ''}`);
    }
    L.push('');
  }
  // all non-pass, prioritized
  L.push('## All issues (WARN/FAIL)', '');
  const bad = s.results.flatMap((r) => r.cells).filter((c) => c.status !== 'PASS');
  if (!bad.length) L.push('_None._');
  else for (const c of bad.sort((a, b) => (a.status === 'FAIL' ? 0 : 1) - (b.status === 'FAIL' ? 0 : 1))) L.push(`- ${c.status === 'FAIL' ? '❌' : '⚠️'} t${c.tier} ${c.kind} **${c.label}** — ${c.signal || ''}${c.note ? ` _(${c.note})_` : ''}${c.samples && c.samples.length ? ' · errs: `' + c.samples.slice(0, 2).join(' | ').slice(0, 200) + '`' : ''}`);
  L.push('');
  return L.join('\n');
}
