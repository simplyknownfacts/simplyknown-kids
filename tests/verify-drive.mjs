// Drive the real app in a real browser at phone size, as a child would.
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
import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:8866';
const ROOT = path.resolve(import.meta.dirname, '..');
const SHOTS = path.join(ROOT, 'docs', 'verify', 'shots');

/* Two children, so tier-gated screens are exercised at both ends. Birthdays are
   computed from today so the ages never drift stale. */
function birthdayYearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}
const PROFILES = [
  { id:'verify-tot', name:'Tot', birthday:birthdayYearsAgo(3), color:'#7CC6FF',
    voice:'woman', mascot:null, tierOverrides:{}, features:{}, youtube:[] },
  { id:'verify-big', name:'Bigkid', birthday:birthdayYearsAgo(8), color:'#FFB347',
    voice:'man', mascot:null, tierOverrides:{}, features:{}, youtube:[] },
];

/* The screens a parent would check before believing a release. One activity per
   section, plus the shell and the parent area. */
const SCREENS = [
  { id:'01-profiles',  url:'/index.html',                 what:'Profile picker' },
  { id:'02-home',      url:'/home.html',                  what:'Child home' },
  { id:'03-games',     url:'/games/index.html',           what:'Games menu' },
  { id:'04-tap-pop',   url:'/games/tap-pop.html',         what:'Game: Bubble Pop' },
  { id:'05-learn',     url:'/learning/index.html',        what:'Learning menu' },
  { id:'06-count',     url:'/learning/count-along.html',  what:'Learning: Count Along' },
  { id:'07-art',       url:'/art/index.html',             what:'Art menu' },
  { id:'08-paint',     url:'/art/finger-paint.html',      what:'Art: Finger Paint' },
  { id:'09-ribbons',   url:'/achievements.html',          what:'Achievements shelf' },
  { id:'10-parent',    url:'/parent/settings.html',       what:'Parent settings (PIN gate)' },
];

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

const results = [];
let failures = 0;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },      // a phone, which is how this is used
  deviceScaleFactor: 2,
  reducedMotion: 'reduce',                    // steadier screenshots
});

/* Seed a child BEFORE any page script runs, otherwise the app redirects to the
   "add a child" flow and every screen after it is meaningless. */
await ctx.addInitScript(([profiles, activeId]) => {
  try {
    localStorage.setItem('vb_profiles', JSON.stringify(profiles));
    localStorage.setItem('vb_active_id', activeId);
  } catch {}
}, [PROFILES, PROFILES[0].id]);

await rm(SHOTS, { recursive: true, force: true });
await mkdir(SHOTS, { recursive: true });

for (const s of SCREENS) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !ignorable(m.text())) errs.push('console: ' + m.text()); });
  page.on('pageerror', e => errs.push('crash: ' + e.message));
  page.on('requestfailed', r => {
    const t = r.url() + ' ' + (r.failure()?.errorText || '');
    if (!ignorable(t)) errs.push('failed request: ' + t);
  });

  let drew = 0, note = '';
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

  const ok = errs.length === 0;
  if (!ok) failures++;
  results.push({ ...s, ok, drew, errs });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + s.id.padEnd(12) + s.what + (ok ? '' : '\n        ' + errs.join('\n        ')));
}

await browser.close();

console.log('\n' + '-'.repeat(62));
console.log(results.length + ' screens driven, ' + (results.length - failures) + ' passed, ' + failures + ' failed');
console.log('evidence: docs/verify/shots/  (git-ignored — never commit a child\'s screen)');
if (failures) {
  console.log('\nFAILED: ' + results.filter(r => !r.ok).map(r => r.id).join(', '));
  process.exit(1);
}
