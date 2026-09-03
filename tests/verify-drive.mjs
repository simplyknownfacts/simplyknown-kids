// Drive the real app in a real browser, as a child (and a parent glancing at a
// tablet or a laptop) would.
//
// This is the Drive step of docs/verify/VERIFYING.md, and it is the one command
// that answers "is the app actually working?". It opens each screen, watches for
// errors the browser reports, checks something was actually drawn, and saves a
// screenshot as evidence.
//
//   node scripts/serve.mjs            (in one terminal)
//   node tests/verify-drive.mjs       (in another)
//
// Exits NON-ZERO if anything fails. A checker that exits 0 on a broken page is
// worse than no checker at all.
//
// Needs a browser, installed locally and never committed:
//   npm i playwright --no-save
//   npx playwright install chromium-headless-shell
//
// ---------------------------------------------------------------------------
// SCOPE (2026-08-31 rewrite — read this before changing the numbers below)
// ---------------------------------------------------------------------------
// The screen list is no longer hand-typed. It is built from js/profiles.js's
// ACTIVITY_FEATURES (the app's own registry of every activity + its minTier/
// maxTier) and js/tiers.js's TIERS (the app's own age-to-tier boundaries), so
// this file cannot quietly drift from the app the way the old hand-typed list
// and the old "8 tiers" docs did. Every path pulled from the registry is also
// checked with fs.existsSync before it's trusted (see checkRegistryMatchesDisk
// below) — a registry entry with no file on disk fails the run loudly instead
// of silently skipping.
//
// A full cross-product of every destination x every tier x every width would
// be 700+ page loads (15-30+ minutes, a huge shots/ folder) for very little
// extra confidence: the thing that actually breaks per-tier is gating (does
// this tier see the right activities?), and the thing that breaks per-width
// is layout (does the shell still fit?) — not "does every activity re-break
// differently at every combination of the two". So this run is scoped in four
// passes instead of one cross-product:
//
//   1. Every activity + Watch + Listen, ONCE each, at phone width, signed in
//      as the youngest tier allowed to see it (its ACTIVITY_FEATURES minTier).
//      This is the main coverage requirement: every real destination proven
//      to load, correctly tier-gated — not a gated-away tier finding it
//      "missing", which would be the gate working, not a bug.
//   2. The child home screen for all TEN tiers, at phone width. Home is the
//      one screen whose entire job is deciding what a kid's age may see, so
//      it's the one screen worth opening once per tier rather than once
//      overall — every other activity page looks the same regardless of
//      which eligible tier opened it.
//   3. The shell screens (profile picker, the three section menus, the
//      achievements shelf, the parent PIN gate) ONCE at phone width.
//   4. The same shell screens again at tablet width and again at PC width,
//      to prove the responsive layout holds, without re-driving all 24
//      destinations at those widths too.
//
// Counted at the bottom of this file's startup log every run. As of this
// rewrite: 21 activity pages (7 games + 10 learning + 4 art — NOT 22; see
// "Known traps" #6 in VERIFYING.md for why that number in the original work
// order didn't add up) + Watch + Listen = 23 destinations driven once each,
// + 10 tier homes, + 7 shell screens x 3 widths (1 phone + 2 responsive) = 21
// shell loads. Total: 23 + 10 + 21 = 54 screen loads, one real browser tab
// each. NOT driven: peek-a-boo.html (registered in ACTIVITY_FEATURES but has
// had no menu link since commit 5e37113 — deliberately excluded, not drift).
// Full list of what this run does NOT prove is in features/NOT-COVERED.md.
import { chromium } from 'playwright';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:8790';
const ROOT = path.resolve(import.meta.dirname, '..');
const SHOTS = path.join(ROOT, 'docs', 'verify', 'shots');

/* ---------------------------------------------------------------------------
   Pull ACTIVITY_FEATURES and TIERS straight out of the app's own source, so
   this file has exactly one source of truth for "what activities exist" and
   "what a tier's age range is" — the app's code, not a hand-copied list that
   can go stale the moment someone adds or re-tiers an activity.

   js/profiles.js is written for the browser (plain <script> tag, no export),
   and its top-level code touches `localStorage`, which doesn't exist in
   Node. Rather than stub the whole browser environment to run the whole
   file, this pulls out ONLY the ACTIVITY_FEATURES array literal by matching
   brackets (tracking string literals so a stray [ or ] inside a label can't
   confuse it) and evaluates that snippet on its own. Same approach for
   js/tiers.js's TIERS. Neither file's functions are called from here at all
   — only the plain data arrays are read. ------------------------------- */
function extractArrayLiteral(source, varName) {
  const marker = `const ${varName} = `;
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error(`Could not find "${marker}" — has the shape of js/profiles.js or js/tiers.js changed?`);
  }
  let i = start + marker.length;
  while (source[i] !== '[') i++;
  const arrStart = i;
  let depth = 0, inStr = null;
  for (; i < source.length; i++) {
    const c = source[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { i++; break; } }
  }
  const literalText = source.slice(arrStart, i);
  return new Function(`"use strict"; return (${literalText});`)();
}

const [profilesSrc, tiersSrc] = await Promise.all([
  readFile(path.join(ROOT, 'js', 'profiles.js'), 'utf8'),
  readFile(path.join(ROOT, 'js', 'tiers.js'), 'utf8'),
]);
const ACTIVITY_FEATURES = extractArrayLiteral(profilesSrc, 'ACTIVITY_FEATURES');
const TIERS = extractArrayLiteral(tiersSrc, 'TIERS');

// peek-a-boo.html is still registered in ACTIVITY_FEATURES but has had no
// menu link since commit 5e37113 (see CLAUDE.md's "8 total" activity list).
// Deliberately excluded here — this is a documented retirement, not drift.
const RETIRED_IDS = new Set(['peek-a-boo']);

// `section` on each ACTIVITY_FEATURES entry ('games' | 'learn' | 'art') is a
// logical category, not literally the folder name — every activity page
// navigates with a same-folder relative link (e.g. learning/index.html does
// `goTo(a.file)`, not `goTo(a.section + '/' + a.file)`), and the folder on
// disk is plural: learning/, not learn/. Games and art happen to match their
// section name, which is exactly the kind of coincidence that makes a wrong
// assumption look right until it silently isn't.
const SECTION_FOLDER = { games: 'games', learn: 'learning', art: 'art' };

const ACTIVITIES = ACTIVITY_FEATURES
  .filter(a => !RETIRED_IDS.has(a.id))
  .map(a => {
    const folder = SECTION_FOLDER[a.section];
    if (!folder) throw new Error('Unknown ACTIVITY_FEATURES section "' + a.section + '" on activity "' + a.id + '" — add it to SECTION_FOLDER.');
    return {
      id: a.id,
      section: a.section,
      minTier: a.minTier || 1,
      maxTier: a.maxTier || 10,
      url: '/' + folder + '/' + a.file,
      diskPath: path.join(ROOT, folder, a.file),
    };
  });

/* Fail loud, before opening a single browser tab, if the registry and disk
   disagree — a registered activity with no matching file is a real bug, not
   something to skip quietly. */
function checkRegistryMatchesDisk() {
  const missing = ACTIVITIES.filter(a => !existsSync(a.diskPath));
  const extraChecks = [
    { id:'watch',  diskPath: path.join(ROOT, 'videos', 'index.html') },
    { id:'listen', diskPath: path.join(ROOT, 'listen', 'index.html') },
  ].filter(a => !existsSync(a.diskPath));
  if (missing.length || extraChecks.length) {
    console.error('ACTIVITY_FEATURES (js/profiles.js) and disk have drifted:');
    for (const a of [...missing, ...extraChecks]) console.error('  ' + a.id + ' -> ' + a.diskPath + ' (not found)');
    process.exit(1);
  }
}
checkRegistryMatchesDisk();

/* ---------------------------------------------------------------------------
   Ten test children, one per tier, birthday computed to land solidly in the
   middle of that tier's month range — never near a boundary. VERIFYING.md's
   Known Traps warns boundary ages are flaky (a birthday one day off a tier
   edge can land in the wrong tier); picking the midpoint of each ~12-month
   tier gives about six months of slack either side, which easily absorbs the
   +/-1 month uncertainty from where "today" falls in the current month. ---*/
function birthdayForTier(tier) {
  const t = TIERS.find(x => x.tier === tier);
  // Tier 10 has no upper bound (9999) — treat it as a further 24-month-wide
  // band past its floor so it gets a midpoint instead of an absurd age.
  const hi = t.maxMonths >= 9999 ? t.minMonths + 24 : t.maxMonths;
  const midMonths = t.minMonths + Math.floor((hi - t.minMonths) / 2);
  const d = new Date();
  d.setDate(15);                    // fixed mid-month day sidesteps getAgeMonths()'s day-of-month edge case entirely
  d.setMonth(d.getMonth() - midMonths);
  return d.toISOString().slice(0, 10);
}

const TIER_COLORS = ['#7CC6FF','#FFB347','#FF8FAB','#B98CFF','#7FE0B0','#FFD166','#6FCF97','#F76E6E','#56CCF2','#C39BD3'];
const TIER_PROFILES = TIERS.map((t, i) => ({
  id: 'verify-tier-' + t.tier,
  name: 'Tier' + t.tier,
  birthday: birthdayForTier(t.tier),
  color: TIER_COLORS[i % TIER_COLORS.length],
  voice: i % 2 === 0 ? 'woman' : 'man',
  mascot: null, tierOverrides: {}, features: {}, youtube: [],
}));
const tierProfileId = (tier) => 'verify-tier-' + tier;

/* Errors that are true of a healthy local run and are NOT the app breaking.
   Every entry needs a reason. Keep this list short and suspicious. */
const IGNORE = [
  { match:/favicon\.ico/i,                    why:'no favicon is served locally' },
  { match:/googleapis\.com|gstatic\.com/i,    why:'web fonts are not fetched offline in CI' },
  { match:/workers\.dev/i,                    why:'cloud sync is deliberately not signed in during verification' },
];
const ignorable = (t) => IGNORE.some(i => i.match.test(t));

/* ---- Prove we are pointed at THIS app, before driving anything. ----
   Every app in the fleet defaults to a similar dev port. A sibling's server
   answering here would let this run drive the wrong application and report a
   confident pass. Fleet Verification Standard §2: assert the identity, and
   exit non-zero if anything else replies. */
{
  let who = null, why = '';
  try {
    const r = await fetch(BASE + '/__health.json', { cache: 'no-store' });
    if (!r.ok) why = 'HTTP ' + r.status;
    else who = await r.json();
  } catch (e) { why = e.message; }

  if (!who) {
    console.error('Nothing identifiable is serving at ' + BASE + ' (' + why + ').');
    console.error('Start it first:  node scripts/serve.mjs');
    process.exit(1);
  }
  if (who.app !== 'kids') {
    console.error('WRONG APP at ' + BASE + ' — it says app="' + who.app + '", expected "kids".');
    console.error('Another project is serving on this port. Stop it, or point elsewhere:');
    console.error('  PORT=8877 node scripts/serve.mjs   then   BASE=http://localhost:8877 node tests/verify-drive.mjs');
    process.exit(1);
  }
  console.log('serving: ' + (who.name || who.app) + '  (' + BASE + ')\n');
}

/* ---------------------------------------------------------------------------
   Build the flat screen list. Every entry is one browser tab, one navigation,
   one screenshot. See the SCOPE comment at the top of the file for why it is
   organised into these four passes instead of a full cross-product. ------ */
const SCREENS = [];

// Pass 1 — every activity + Watch + Listen, once each, phone width, using the
// youngest tier allowed to see it.
for (const a of ACTIVITIES) {
  SCREENS.push({
    id: 'act-' + a.id,
    url: a.url,
    what: a.section + ': ' + a.id + ' (tier ' + a.minTier + '+)',
    profileId: tierProfileId(a.minTier),
    viewport: 'phone',
  });
}
SCREENS.push({ id:'act-watch',  url:'/videos/index.html', what:'Watch (no tier gate)',  profileId: tierProfileId(5), viewport:'phone' });
SCREENS.push({ id:'act-listen', url:'/listen/index.html', what:'Listen (no tier gate)', profileId: tierProfileId(5), viewport:'phone' });

// Pass 2 — the child home screen, once per tier, phone width.
for (const t of TIERS) {
  SCREENS.push({
    id: 'tier-' + t.tier + '-home',
    url: '/home.html',
    what: 'Child home — tier ' + t.tier + ' (' + t.label + ', ' + t.ageRange + ')',
    profileId: tierProfileId(t.tier),
    viewport: 'phone',
  });
}

// Pass 3 + 4 — shell screens at phone width once, tablet + PC width again,
// to prove the responsive layout holds without re-driving every destination
// at every width. Home is skipped at phone width here — tier 3's home was
// already driven in Pass 2 above; re-adding it would just be the same
// screenshot twice.
const SHELL = [
  { id:'profiles',   url:'/index.html',           what:'Profile picker' },
  { id:'home',       url:'/home.html',             what:'Child home' },
  { id:'games-menu', url:'/games/index.html',      what:'Games menu' },
  { id:'learn-menu', url:'/learning/index.html',   what:'Learning menu' },
  { id:'art-menu',   url:'/art/index.html',        what:'Art menu' },
  { id:'ribbons',    url:'/achievements.html',     what:'Achievements shelf' },
  { id:'parent',     url:'/parent/settings.html',  what:'Parent settings (PIN gate)' },
];
const SHELL_PROFILE = tierProfileId(3);   // a typical toddler — same role the old two-child seed's "Tot" played
for (const s of SHELL) {
  if (s.id !== 'home') {
    SCREENS.push({ id:'shell-' + s.id, url:s.url, what:s.what, profileId:SHELL_PROFILE, viewport:'phone' });
  }
  SCREENS.push({ id:'shell-' + s.id + '-tablet',  url:s.url, what:s.what + ' (tablet)',  profileId:SHELL_PROFILE, viewport:'tablet' });
  SCREENS.push({ id:'shell-' + s.id + '-desktop', url:s.url, what:s.what + ' (desktop)', profileId:SHELL_PROFILE, viewport:'desktop' });
}

const counts = {
  phone: SCREENS.filter(s => s.viewport === 'phone').length,
  tablet: SCREENS.filter(s => s.viewport === 'tablet').length,
  desktop: SCREENS.filter(s => s.viewport === 'desktop').length,
};
console.log(
  ACTIVITIES.length + ' activity pages + Watch + Listen = ' + (ACTIVITIES.length + 2) + ' destinations, ' +
  TIERS.length + ' tiers, ' + SHELL.length + ' shell screens.'
);
console.log(
  'Driving ' + SCREENS.length + ' screens total: ' +
  counts.phone + ' at phone width, ' + counts.tablet + ' at tablet width, ' + counts.desktop + ' at PC width.\n'
);

/* ---------------------------------------------------------------------------
   One browser context per viewport (deviceScaleFactor is fixed per context in
   Playwright, so a shared context can't serve all three sizes). Each context
   seeds the same ten tier profiles via addInitScript; each individual page
   then picks which one is "active" via its own addInitScript, which runs
   after the context-level one on every navigation for that page. --------- */
const VIEWPORTS = {
  phone:   { width:390,  height:844,  deviceScaleFactor:2 },
  tablet:  { width:820,  height:1180, deviceScaleFactor:2 },
  desktop: { width:1440, height:900,  deviceScaleFactor:1 },
};

await rm(SHOTS, { recursive: true, force: true });
await mkdir(SHOTS, { recursive: true });

const browser = await chromium.launch();
const contexts = {};
for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await ctx.addInitScript((profiles) => {
    try { localStorage.setItem('vb_profiles', JSON.stringify(profiles)); } catch {}
  }, TIER_PROFILES);
  contexts[name] = ctx;
}

async function driveScreen(ctx, s) {
  const page = await ctx.newPage();
  await page.addInitScript((id) => {
    try { localStorage.setItem('vb_active_id', id); } catch {}
  }, s.profileId);

  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !ignorable(m.text())) errs.push('console: ' + m.text()); });
  page.on('pageerror', e => errs.push('crash: ' + e.message));
  page.on('requestfailed', r => {
    const t = r.url() + ' ' + (r.failure()?.errorText || '');
    if (!ignorable(t)) errs.push('failed request: ' + t);
  });

  let drew = 0;
  try {
    const resp = await page.goto(BASE + s.url, { waitUntil: 'load', timeout: 20000 });
    if (!resp || !resp.ok()) errs.push('page did not load: HTTP ' + (resp ? resp.status() : 'no response'));
    await page.waitForTimeout(1200);           // let entrance animation and audio setup settle

    // "Did anything actually render?" — count elements that occupy real space.
    drew = await page.evaluate(() => {
      let n = 0;
      for (const el of document.body.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width > 8 && r.height > 8) n++;
        if (n > 40) break;
      }
      return n;
    });
    if (drew < 5) errs.push('page rendered almost nothing (' + drew + ' visible elements)');

    await page.screenshot({ path: path.join(SHOTS, s.id + '.png'), fullPage: false });
  } catch (e) {
    errs.push('threw: ' + e.message);
  }
  await page.close();

  return { ...s, ok: errs.length === 0, drew, errs };
}

const results = [];
let failures = 0;
for (const s of SCREENS) {
  const r = await driveScreen(contexts[s.viewport], s);
  results.push(r);
  if (!r.ok) failures++;
  console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.id.padEnd(26) + r.what + (r.ok ? '' : '\n        ' + r.errs.join('\n        ')));
}

/* ---------------------------------------------------------------------------
   Pass 5 — the forbidden side of tier gating.
   Every check above only proves an ELIGIBLE tier can open its own activities
   without error — a wall with no gate in it would pass every one of them.
   This pass proves the other direction, both ways it could leak: the menu
   must never show a card for something the kid is too young/old for, and
   typing the activity's own address directly must not work either.

   Reuses ACTIVITY_FEATURES' own minTier/maxTier and the ten profiles already
   seeded above — no new fixtures, so this can't quietly drift from Pass 1-4.
------------------------------------------------------------------------- */
async function gateURL(url, profileId) {
  const page = await contexts.phone.newPage();
  await page.addInitScript((id) => { try { localStorage.setItem('vb_active_id', id); } catch {} }, profileId);
  await page.goto(BASE + url, { waitUntil: 'load', timeout: 15000 });
  await page.waitForTimeout(500);
  const finalUrl = page.url();
  await page.close();
  return finalUrl;
}
async function gateMenuHidesCard(menuUrl, profileId, activityName) {
  const page = await contexts.phone.newPage();
  await page.addInitScript((id) => { try { localStorage.setItem('vb_active_id', id); } catch {} }, profileId);
  await page.goto(BASE + menuUrl, { waitUntil: 'load', timeout: 15000 });
  await page.waitForTimeout(500);
  const shown = await page.evaluate((name) =>
    [...document.querySelectorAll('.activity-card .label')].some(el => el.textContent.trim() === name),
    activityName);
  await page.close();
  return shown;
}

const belowTier = ACTIVITIES.find(a => a.minTier >= 4);          // e.g. Money, minTier 4
const abcs = ACTIVITIES.find(a => a.id === 'abcs');               // minTier 2, maxTier 6 — has both edges
const gateResults = [];

{
  const kid1 = tierProfileId(1);                                  // well under belowTier's minTier
  const url = await gateURL(belowTier.url, kid1);
  const ok = !url.endsWith(belowTier.url);
  gateResults.push({ id:'gate-below-min-url', ok,
    what:'Tier 1 kid direct-URLs to ' + belowTier.id + ' (minTier ' + belowTier.minTier + ') — must NOT load',
    errs: ok ? [] : ['landed on ' + url + ' — the activity loaded for a kid too young for it'] });

  const menuUrl = '/' + belowTier.section.replace('learn', 'learning') + '/index.html';
  const shown = await gateMenuHidesCard(menuUrl, kid1, ACTIVITY_FEATURES.find(a => a.id === belowTier.id).name);
  gateResults.push({ id:'gate-below-min-menu', ok: !shown,
    what:'Tier 1 kid\'s ' + belowTier.section + ' menu — must NOT show ' + belowTier.id,
    errs: shown ? ['the card is in the DOM for a kid too young for it'] : [] });
}

if (abcs) {
  const kid7 = tierProfileId(7);                                  // past abcs.maxTier (6)
  const url = await gateURL(abcs.url, kid7);
  const ok = !url.endsWith(abcs.url);
  gateResults.push({ id:'gate-max-tier-url', ok,
    what:'Tier 7 kid direct-URLs to abcs (maxTier ' + abcs.maxTier + ') — must NOT load',
    errs: ok ? [] : ['landed on ' + url + ' — ABCs loaded for a kid past its cap'] });

  const shown = await gateMenuHidesCard('/learning/index.html', kid7, ACTIVITY_FEATURES.find(a => a.id === 'abcs').name);
  gateResults.push({ id:'gate-max-tier-menu', ok: !shown,
    what:'Tier 7 kid\'s learning menu — must NOT show ABCs',
    errs: shown ? ['the card is in the DOM for a kid past ABCs\' age cap'] : [] });

  // The escape hatch: a parent can force an activity back on via
  // activitiesVisible (js/profiles.js, isActivityVisible). If the guard
  // ignored that override it would break a feature that already ships —
  // proving the override still works is as important as proving the gate.
  const forcedId = 'verify-gate-abcs-forced';
  await contexts.phone.addInitScript((id, base) => {
    try {
      const list = JSON.parse(localStorage.getItem('vb_profiles') || '[]');
      list.push({ ...base, id, activitiesVisible: { abcs: true } });
      localStorage.setItem('vb_profiles', JSON.stringify(list));
    } catch {}
  }, forcedId, TIER_PROFILES[6]);
  const forcedUrl = await gateURL(abcs.url, forcedId);
  const forcedOk = forcedUrl.endsWith(abcs.url);
  gateResults.push({ id:'gate-max-tier-override', ok: forcedOk,
    what:'Same kid, parent override on — ABCs must still open',
    errs: forcedOk ? [] : ['landed on ' + forcedUrl + ' — the parent override was ignored'] });
}

for (const g of gateResults) {
  results.push(g);
  if (!g.ok) failures++;
  console.log((g.ok ? 'PASS  ' : 'FAIL  ') + g.id.padEnd(26) + g.what + (g.ok ? '' : '\n        ' + g.errs.join('\n        ')));
}

/* ---------------------------------------------------------------------------
   Pass 6 — Trophy Joy: prove the celebration never interrupts a tap-frenzy.
   (2026-08-31 spec, approved by master.) A real DOM assertion, not a visual
   check — this is exactly the kind of thing that regresses silently if it's
   only ever eyeballed.
------------------------------------------------------------------------- */
const trophyResults = [];
{
  const ctx = await browser.newContext({ viewport: VIEWPORTS.phone, reducedMotion: 'reduce' });
  const profile = { id:'verify-trophy', name:'Trophy', birthday: birthdayForTier(5),
    color:'#FFD93D', voice:'woman', mascot:'dog', tierOverrides:{}, features:{}, youtube:[],
    // 295 — five short of achievement-defs.js's REPEAT_FAST (300) star
    // threshold, so a handful of rapid taps crosses it live.
    achievements: { unlocked:{}, counters:{ 'tap-pop':295 }, repeats:{}, xp:0, rank:'sprout',
                    streak:{ last:null, current:0, best:0 } } };
  await ctx.addInitScript((p) => { try { localStorage.setItem('vb_profiles', JSON.stringify([p])); } catch {} }, profile);
  const page = await ctx.newPage();
  await page.addInitScript((id) => { try { localStorage.setItem('vb_active_id', id); } catch {} }, 'verify-trophy');
  await page.goto(BASE + '/games/tap-pop.html', { waitUntil: 'load', timeout: 15000 });
  await page.waitForTimeout(500);

  // Cross the threshold with a burst of rapid calls through the REAL
  // production path (vbProgress -> achievement-logic -> celebrate.js) —
  // this isn't a simulation, it's the same code an actual tap runs.
  const overlayDuring = await page.evaluate(async () => {
    for (let i = 0; i < 8; i++) {
      vbProgress.record('tap-pop');
      await new Promise(r => setTimeout(r, 60)); // ~60ms apart — a fast but human tap cadence
      if (document.querySelector('.vb-celebrate')) return true; // caught mid-burst = FAIL
    }
    return false;
  });
  trophyResults.push({ id:'trophy-no-interrupt', ok: !overlayDuring,
    what:'Celebration must NOT appear during a rapid tap burst',
    errs: overlayDuring ? ['.vb-celebrate appeared mid-burst — the never-interrupt rule regressed'] : [] });

  // Now stop tapping and let the idle timer (2500ms) elapse.
  await page.waitForTimeout(3200);
  const appearedAfterIdle = await page.evaluate(() => !!document.querySelector('.vb-celebrate'));
  trophyResults.push({ id:'trophy-fires-on-idle', ok: appearedAfterIdle,
    what:'Celebration MUST appear once input goes idle (tier 5, not a little)',
    errs: appearedAfterIdle ? [] : ['.vb-celebrate never appeared after 3.2s idle — the batch was lost or never flushed'] });

  // Tap-dismiss: must be gone almost immediately, not after the normal dwell.
  if (appearedAfterIdle) {
    await page.click('.vb-celebrate');
    await page.waitForTimeout(120);
    const stillThere = await page.evaluate(() => !!document.querySelector('.vb-celebrate'));
    trophyResults.push({ id:'trophy-tap-dismiss', ok: !stillThere,
      what:'Tapping the celebration must dismiss it almost instantly',
      errs: stillThere ? ['.vb-celebrate was still present 120ms after being tapped'] : [] });
  } else {
    trophyResults.push({ id:'trophy-tap-dismiss', ok: false, what:'Tap-dismiss (skipped — nothing appeared to dismiss)',
      errs: ['prerequisite trophy-fires-on-idle failed'] });
  }

  await page.close();
  await ctx.close();
}
{
  // Master's condition 1: tiers 1-2 get idle-fire OFF (littles pause
  // constantly; a timer would ambush a natural breather). Only leaving the
  // page fires it for them. This exact case is what caught a real bug during
  // this build (home.html loaded progress.js but not celebrate.js, so the
  // pickup on arrival silently no-opped) — worth a permanent check, not just
  // a one-off probe.
  const ctx = await browser.newContext({ viewport: VIEWPORTS.phone, reducedMotion: 'reduce' });
  const little = { id:'verify-trophy-little', name:'Little', birthday: birthdayForTier(2),
    color:'#fff', voice:'woman', mascot:'dog', tierOverrides:{}, features:{}, youtube:[],
    achievements: { unlocked:{}, counters:{ 'tap-pop':295 }, repeats:{}, xp:0, rank:'sprout',
                    streak:{ last:null, current:0, best:0 } } };
  await ctx.addInitScript((p) => { try { localStorage.setItem('vb_profiles', JSON.stringify([p])); } catch {} }, little);
  const page = await ctx.newPage();
  await page.addInitScript((id) => { try { localStorage.setItem('vb_active_id', id); } catch {} }, 'verify-trophy-little');
  await page.goto(BASE + '/games/tap-pop.html', { waitUntil: 'load', timeout: 15000 });
  await page.waitForTimeout(400);
  await page.evaluate(async () => {
    for (let i = 0; i < 8; i++) { vbProgress.record('tap-pop'); await new Promise(r => setTimeout(r, 60)); }
  });
  await page.waitForTimeout(3200); // well past the 2500ms idle window
  const firedOnIdle = await page.evaluate(() => !!document.querySelector('.vb-celebrate'));
  trophyResults.push({ id:'trophy-little-no-idle-fire', ok: !firedOnIdle,
    what:'Tier 2 kid — celebration must NOT fire on idle (littles only flush on leave/arrival)',
    errs: firedOnIdle ? ['.vb-celebrate appeared on idle for a tier-2 profile'] : [] });

  // The real navigation this bug lived in — same tab, mirrors goTo().
  await page.goto(BASE + '/home.html', { waitUntil: 'load', timeout: 15000 });
  await page.waitForTimeout(700);
  const firedOnArrival = await page.evaluate(() => !!document.querySelector('.vb-celebrate'));
  trophyResults.push({ id:'trophy-little-fires-on-leave', ok: firedOnArrival,
    what:'Tier 2 kid — celebration MUST fire on the next page after leaving',
    errs: firedOnArrival ? [] : ['.vb-celebrate never appeared on home.html after leaving — the batch was lost'] });

  await page.close();
  await ctx.close();
}
for (const t of trophyResults) {
  results.push(t);
  if (!t.ok) failures++;
  console.log((t.ok ? 'PASS  ' : 'FAIL  ') + t.id.padEnd(26) + t.what + (t.ok ? '' : '\n        ' + t.errs.join('\n        ')));
}

/* ---------------------------------------------------------------------------
   Pass 7 — Hub home world (branch hub-home). home.html stopped being a tile
   grid and became the fox hub-world: the same 5 real routes, now reached by
   tapping a landmark instead of a card, plus chrome (greeting/avatar pill/
   exit) living IN the world instead of a page header. The screenshot-only
   passes above can prove the page renders; they cannot prove a tap actually
   goes anywhere, that Listening Hut stays hidden without Yoto, that reduced
   motion doesn't leave the world invisible, or that the offline gate still
   refuses to open a dead screen. This pass proves all four.
------------------------------------------------------------------------- */
const hubResults = [];
{
  const HUB_PROFILE = tierProfileId(5);

  // 7a — chrome + landmark presence + the reduced-motion path. Every context
  // in this file is created with reducedMotion:'reduce' (see VIEWPORTS
  // contexts above), so this is exactly what a device with "reduce motion"
  // set actually renders — not a separate, easy-to-forget code path.
  {
    const page = await contexts.phone.newPage();
    await page.addInitScript((id) => { try { localStorage.setItem('vb_active_id', id); } catch {} }, HUB_PROFILE);
    await page.goto(BASE + '/home.html', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(600);

    const chrome = await page.evaluate(() => {
      const vis = (sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      return { hi: vis('#hiText'), pill: vis('#avatarPill'), exit: vis('#exitBtn') };
    });
    const chromeOk = chrome.hi && chrome.pill && chrome.exit;
    hubResults.push({ id: 'hub-chrome', ok: chromeOk,
      what: 'Hub chrome present (greeting, avatar pill, exit)',
      errs: chromeOk ? [] : ['missing: ' + JSON.stringify(chrome)] });

    const landmarks = await page.evaluate(() =>
      ['games', 'learn', 'watch', 'art', 'ribbons'].map(id => !!document.querySelector('.spot[data-id="' + id + '"]')));
    const landmarksOk = landmarks.every(Boolean);
    hubResults.push({ id: 'hub-landmarks-present', ok: landmarksOk,
      what: '5 real-section landmarks present (games/learn/watch/art/ribbons)',
      errs: landmarksOk ? [] : ['games/learn/watch/art/ribbons present: ' + JSON.stringify(landmarks)] });

    const listenAbsent = await page.evaluate(() => !document.querySelector('.spot[data-id="listen"]'));
    hubResults.push({ id: 'hub-listen-hidden', ok: listenAbsent,
      what: 'Listening Hut landmark hidden when Yoto is not connected',
      errs: listenAbsent ? [] : ['.spot[data-id="listen"] rendered without a Yoto connection'] });

    // The real risk of a prefers-reduced-motion bug is content stuck at
    // opacity:0 forever because the entrance animation never gets to run.
    const bandsVisible = await page.evaluate(() => {
      const bands = [...document.querySelectorAll('.band')];
      return bands.length > 0 && bands.every(b => parseFloat(getComputedStyle(b).opacity) === 1);
    });
    hubResults.push({ id: 'hub-reduced-motion', ok: bandsVisible,
      what: 'Reduced motion: island bands render at full opacity immediately (not stuck invisible)',
      errs: bandsVisible ? [] : ['one or more .band elements were not at opacity:1 under prefers-reduced-motion'] });

    await page.close();
  }

  // 7b — each landmark actually navigates to its real section. minTier/
  // maxTier don't apply at this level (the old tile grid didn't gate section
  // access either — the section pages gate individual activities), so any
  // tier profile proves this; HUB_PROFILE (tier 5) is reused from above.
  const NAV_LANDMARKS = [
    { id: 'games',   endsWith: '/games/index.html' },
    { id: 'learn',   endsWith: '/learning/index.html' },
    { id: 'art',     endsWith: '/art/index.html' },
    { id: 'ribbons', endsWith: '/achievements.html' },
    { id: 'watch',   endsWith: '/videos/index.html' },   // online by default in this pass — must navigate
  ];
  for (const lm of NAV_LANDMARKS) {
    const page = await contexts.phone.newPage();
    await page.addInitScript((id) => { try { localStorage.setItem('vb_active_id', id); } catch {} }, HUB_PROFILE);
    await page.goto(BASE + '/home.html', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(300);
    let landed = null;
    try {
      await page.click('.spot[data-id="' + lm.id + '"]', { timeout: 5000 });
      await page.waitForURL((u) => u.pathname.endsWith(lm.endsWith), { timeout: 5000 });
      landed = page.url();
    } catch (e) { landed = 'ERROR: ' + e.message; }
    const ok = !!(landed && landed.includes(lm.endsWith));
    hubResults.push({ id: 'hub-nav-' + lm.id, ok,
      what: 'Tapping "' + lm.id + '" navigates to ' + lm.endsWith,
      errs: ok ? [] : ['landed on: ' + landed] });
    await page.close();
  }

  // 7c — offline gate: Watch/Listen must dim to "Needs wifi" and refuse to
  // navigate rather than open a dead screen a toddler would tap and melt down
  // over — the same behavior the old tile grid had. Flips navigator.onLine
  // and fires the real 'offline' event instead of context.setOffline(), which
  // would also block this same-origin dev server's own requests.
  {
    const page = await contexts.phone.newPage();
    await page.addInitScript((id) => { try { localStorage.setItem('vb_active_id', id); } catch {} }, HUB_PROFILE);
    await page.goto(BASE + '/home.html', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(600);

    await page.evaluate(() => {
      Object.defineProperty(Object.getPrototypeOf(navigator), 'onLine', { get: () => false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });
    await page.waitForTimeout(200);

    const dimmed = await page.evaluate(() => {
      const el = document.querySelector('.spot[data-id="watch"]');
      return !!el && el.classList.contains('needs-wifi');
    });
    hubResults.push({ id: 'hub-offline-dim', ok: dimmed,
      what: 'Watch landmark shows "Needs wifi" while offline',
      errs: dimmed ? [] : ['.spot[data-id="watch"] did not get .needs-wifi while offline'] });

    await page.click('.spot[data-id="watch"]').catch(() => {});
    await page.waitForTimeout(600);
    const stillHome = page.url().endsWith('/home.html');
    hubResults.push({ id: 'hub-offline-no-nav', ok: stillHome,
      what: 'Tapping Watch while offline must NOT navigate into a dead screen',
      errs: stillHome ? [] : ['navigated to ' + page.url() + ' while offline'] });

    await page.close();
  }
}
for (const h of hubResults) {
  results.push(h);
  if (!h.ok) failures++;
  console.log((h.ok ? 'PASS  ' : 'FAIL  ') + h.id.padEnd(26) + h.what + (h.ok ? '' : '\n        ' + h.errs.join('\n        ')));
}

/* ---------------------------------------------------------------------------
   Pass 8 — Backup / Restore (professional review 2026-06-12, finding #1).
   The screenshot-only passes above never touch parent/settings.html's data
   flows. This proves the two things a screenshot cannot: that "Download
   backup" actually produces a file with the family's real data in it (and a
   legacy plaintext PIN comes out hashed, never in the clear), and that
   "Restore from backup" actually replaces the on-device roster after the
   parent confirms.
------------------------------------------------------------------------- */
const backupResults = [];
{
  const ctx = await browser.newContext({ viewport: VIEWPORTS.phone, reducedMotion: 'reduce', acceptDownloads: true });
  const BACKUP_KID = { id: 'verify-backup-kid', name: 'BackupKid', birthday: birthdayForTier(4),
    color: '#7CC6FF', voice: 'woman', mascot: null, tierOverrides: {}, features: {}, youtube: [] };

  async function openUnlockedSettings() {
    const page = await ctx.newPage();
    await page.addInitScript((profile) => {
      try {
        localStorage.setItem('vb_profiles', JSON.stringify([profile]));
        localStorage.setItem('vb_active_id', profile.id);
        localStorage.setItem('vb_pin', '1234');   // legacy plaintext — the export must upgrade it
      } catch {}
    }, BACKUP_KID);
    await page.goto(BASE + '/parent/settings.html', { waitUntil: 'load', timeout: 15000 });
    await page.waitForSelector('#pinPad .pin-key', { timeout: 10000 });
    for (const i of [0, 1, 2, 3]) await page.locator('#pinPad .pin-key').nth(i).click();
    await page.waitForSelector('#mainSettings', { state: 'visible', timeout: 10000 });
    await page.locator('.navitem[data-key="backup"]').click().catch(() => {});
    const acc = page.locator('#panel-backup .acc-title');
    if (await acc.isVisible().catch(() => false)) await acc.click();
    await page.waitForSelector('#downloadBackupBtn', { state: 'visible', timeout: 10000 });
    return page;
  }

  // 8a — Download backup: real data in, no plaintext PIN, no credentials out.
  try {
    const page = await openUnlockedSettings();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.locator('#downloadBackupBtn').click(),
    ]);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const dump = JSON.stringify(payload);

    const ok = payload.version === 1 && payload.app === 'kids' &&
      Array.isArray(payload.keys?.vb_profiles) && payload.keys.vb_profiles.length === 1 &&
      payload.keys.vb_profiles[0].name === 'BackupKid' &&
      payload.keys.vb_pin && typeof payload.keys.vb_pin.hash === 'string' &&
      !dump.includes('"vb_pin":"1234"') && !/vb_sync_key|vb_yoto_tokens/.test(dump);
    backupResults.push({ id: 'backup-download', ok,
      what: 'Download backup contains the real profile + a hashed (never plaintext) PIN, no credentials',
      errs: ok ? [] : ['unexpected payload shape: ' + dump.slice(0, 400)] });
    await page.close();
  } catch (e) {
    backupResults.push({ id: 'backup-download', ok: false,
      what: 'Download backup contains the real profile + a hashed (never plaintext) PIN, no credentials',
      errs: ['threw: ' + e.message] });
  }

  // 8b — Restore from backup: confirms, replaces the roster, and needs no
  // network at all (this whole context never calls anything but BASE).
  try {
    const page = await openUnlockedSettings();
    page.on('dialog', (d) => d.accept());
    const restorePayload = {
      version: 1, app: 'kids', exportedAt: new Date().toISOString(),
      keys: { vb_profiles: [{ ...BACKUP_KID, id: 'verify-restored-kid', name: 'RestoredKid' }],
              vb_active_id: 'verify-restored-kid' },
    };
    const tmp = path.join(SHOTS, '..', '_verify-restore-payload.json');
    await (await import('node:fs/promises')).writeFile(tmp, JSON.stringify(restorePayload));
    await page.setInputFiles('#restoreBackupInput', tmp);
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('vb_profiles') || '[]').some((p) => p.id === 'verify-restored-kid'),
      { timeout: 10000 },
    );
    const profiles = await page.evaluate(() => JSON.parse(localStorage.getItem('vb_profiles')));
    const ok = profiles.length === 1 && profiles[0].name === 'RestoredKid';
    backupResults.push({ id: 'backup-restore', ok,
      what: 'Restore from backup replaces the on-device roster after confirming',
      errs: ok ? [] : ['profiles after restore: ' + JSON.stringify(profiles)] });
    await (await import('node:fs/promises')).rm(tmp, { force: true });
    await page.close();
  } catch (e) {
    backupResults.push({ id: 'backup-restore', ok: false,
      what: 'Restore from backup replaces the on-device roster after confirming',
      errs: ['threw: ' + e.message] });
  }

  await ctx.close();
}
for (const b of backupResults) {
  results.push(b);
  if (!b.ok) failures++;
  console.log((b.ok ? 'PASS  ' : 'FAIL  ') + b.id.padEnd(26) + b.what + (b.ok ? '' : '\n        ' + b.errs.join('\n        ')));
}

for (const ctx of Object.values(contexts)) await ctx.close();
await browser.close();

console.log('\n' + '-'.repeat(62));
console.log(results.length + ' screens driven, ' + (results.length - failures) + ' passed, ' + failures + ' failed');
console.log('evidence: docs/verify/shots/  (git-ignored — never commit a child\'s screen)');
if (failures) {
  console.log('\nFAILED: ' + results.filter(r => !r.ok).map(r => r.id).join(', '));
  process.exit(1);
}
