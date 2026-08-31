// Automated verification sweep for the SimplyKnown Kids PWA.
//
// Captures a screenshot + structured result for every activity x tier 1..8,
// plus feature-flag variants, plus home/section-index gating per tier, plus
// the parent settings screen. Writes report.json + report.md.
//
// It does NOT modify app source. It only seeds localStorage (via
// page.addInitScript) before navigation to force deterministic state.
//
// Usage:
//   node tests/sweep/run-sweep.mjs                 (full sweep, default base http://localhost:8866)
//   BASE=http://localhost:8877 node tests/sweep/run-sweep.mjs
//   node tests/sweep/run-sweep.mjs --only=math,abcs (subset of activity ids)
//   node tests/sweep/run-sweep.mjs --tiers=1,8      (subset of tiers)
//   node tests/sweep/run-sweep.mjs --no-features    (skip feature variants)
//
// Re-runnable: clears tests/sweep/<id> png dirs are overwritten in place.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname; // tests/sweep
const REPO_ROOT = resolve(__dirname, '..', '..');

// ── config ──────────────────────────────────────────────────────────────────
const BASE = process.env.BASE || 'http://localhost:8866';
const args = process.argv.slice(2);
const argVal = (name) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : null;
};
const ONLY = argVal('only') ? argVal('only').split(',') : null;
const TIER_SET = argVal('tiers') ? argVal('tiers').split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 8];
const DO_FEATURES = !args.includes('--no-features');
const SETTLE_MS = Number(argVal('settle') || 1500);
const VIEWPORT = { width: 414, height: 896 }; // phone portrait (matches app target)

// ── activities (id, section, file relative to repo root) ──────────────────────
const ACTIVITIES = [
  { id: 'tap-pop',       section: 'games', file: 'games/tap-pop.html' },
  { id: 'shape-match',   section: 'games', file: 'games/shape-match.html' },
  { id: 'hello-colors',  section: 'learn', file: 'learning/hello-colors.html' },
  { id: 'animal-sounds', section: 'learn', file: 'learning/animal-sounds.html' },
  { id: 'count-along',   section: 'learn', file: 'learning/count-along.html' },
  { id: 'abcs',          section: 'learn', file: 'learning/abcs.html' },
  { id: 'days',          section: 'learn', file: 'learning/days.html' },
  { id: 'math',          section: 'learn', file: 'learning/math.html' },
  { id: 'spelling',      section: 'learn', file: 'learning/spelling.html' },
  { id: 'money',         section: 'learn', file: 'learning/money.html' },
  { id: 'body-parts',    section: 'learn', file: 'learning/body-parts.html' },
  { id: 'stamp-art',     section: 'art',   file: 'art/stamp-art.html' },
  { id: 'finger-paint',  section: 'art',   file: 'art/finger-paint.html' },
  { id: 'color-splash',  section: 'art',   file: 'art/color-splash.html' },
  { id: 'color-in',      section: 'art',   file: 'art/color-in.html' },
];

// feature flags per activity: { key, minTier } — toggled on at a tier >= minTier
const FEATURES = {
  'shape-match':   [{ key: 'dragMode', minTier: 1 }],
  'hello-colors':  [{ key: 'colorQuiz', minTier: 4 }],
  'animal-sounds': [{ key: 'quizMode', minTier: 4 }],
  'count-along':   [{ key: 'quizMode', minTier: 4 }],
  'abcs':          [{ key: 'wordHints', minTier: 3 }, { key: 'spellMode', minTier: 6 }],
  'days':          [{ key: 'quizMode', minTier: 5 }],
  'math':          [{ key: 'subtract', minTier: 5 }, { key: 'multiply', minTier: 8 }],
  'spelling':      [{ key: 'spellMode', minTier: 6 }],
  'money':         [{ key: 'countMode', minTier: 6 }],
  'body-parts':    [{ key: 'allParts', minTier: 4 }],
  'stamp-art':     [{ key: 'stampPalette', minTier: 2 }, { key: 'themeSwitcher', minTier: 4 }],
  'finger-paint':  [{ key: 'colorPalette', minTier: 2 }, { key: 'eraser', minTier: 4 }],
  'color-splash':  [{ key: 'colorPicker', minTier: 2 }, { key: 'clearButton', minTier: 3 }],
  'color-in':      [{ key: 'extraPics', minTier: 2 }],
};

// expected default-visible activities per tier (mirrors profiles.js minTier).
// Used to validate home/section gating.
const ACTIVITY_MINTIER = {
  'tap-pop': 1, 'shape-match': 1, 'hello-colors': 1, 'animal-sounds': 1,
  'count-along': 2, 'abcs': 2, 'days': 3, 'math': 4, 'spelling': 4, 'money': 4,
  'body-parts': 2, 'stamp-art': 1, 'finger-paint': 1, 'color-splash': 1, 'color-in': 2,
};

// birthday that computes to a given tier (months: tier1=0-12 ... tier8>=84).
// Pick a representative age in the middle of each band.
const TIER_AGE_MONTHS = { 1: 6, 2: 18, 3: 30, 4: 42, 5: 54, 6: 66, 7: 78, 8: 120 };
function birthdayForTier(tier) {
  const months = TIER_AGE_MONTHS[tier];
  const d = new Date();
  d.setDate(15); // mid-month to avoid day-of-month edge in getAgeMonths
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

const PROFILE_ID = 'sweep-kid';

// Build the profile object seeded into localStorage. tierOverrides forces the
// activity tier deterministically; birthday drives home/section gating.
function buildProfile({ tier, featureKey, activityId }) {
  const tierOverrides = {};
  for (const a of ACTIVITIES) tierOverrides[a.id] = tier; // force every card to this tier
  const features = {};
  if (featureKey && activityId) {
    features[activityId] = { [featureKey]: true };
  }
  return {
    id: PROFILE_ID,
    name: 'Sweepy',
    birthday: birthdayForTier(tier),
    color: '#7c5cff',
    voice: 'girl',
    mascot: { id: 'dog' },
    tierOverrides,
    features,
    youtube: [],
  };
}

// init script writes localStorage before any app JS runs.
function seedScript(profile) {
  return `
    try {
      localStorage.setItem('vb_profiles', JSON.stringify([${JSON.stringify(profile)}]));
      localStorage.setItem('vb_active_id', ${JSON.stringify(profile.id)});
      // unlock parent settings: seed a legacy plaintext PIN so the gate exists
      localStorage.setItem('vb_pin', '1234');
    } catch (e) {}
  `;
}

// classify a failed/console message as asset-404 noise (mascot/audio/video, and
// the optional ribbon hat/topper PNGs which degrade gracefully when absent)
function isAssetNoise(url) {
  if (!url) return false;
  return /\/(mascots|audio|voices|videos|hats)\//i.test(url) ||
         /\.(mp4|webm|mp3|wav|ogg|m4a)(\?|$)/i.test(url);
}

// ── per-cell capture ──────────────────────────────────────────────────────────
async function captureCell(context, { label, urlPath, profile, pngPath, postLoad }) {
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const assetNoise = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      // network 404s surface here too; route them to noise if asset. The text of
      // a resource-load error doesn't include the URL, so also check the message
      // location (where the asset 404 actually originated).
      const locUrl = (msg.location && msg.location().url) || '';
      if (isAssetNoise(t) || isAssetNoise(locUrl)) assetNoise.push(t);
      else consoleErrors.push(t);
    }
  });
  page.on('pageerror', (err) => pageErrors.push(String(err && err.message || err)));
  page.on('requestfailed', (req) => {
    const u = req.url();
    if (isAssetNoise(u)) assetNoise.push(u);
    else failedRequests.push(`${u} (${req.failure()?.errorText || 'failed'})`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400) {
      const u = res.url();
      if (isAssetNoise(u)) assetNoise.push(`${res.status()} ${u}`);
      else failedRequests.push(`${res.status()} ${u}`);
    }
  });

  await page.addInitScript(seedScript(profile));

  let fatal = null;
  let loaded = true;
  const url = `${BASE}/${urlPath}`;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    // networkidle can time out on canvas/animation pages; fall back to domcontentloaded
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e2) {
      fatal = `nav failed: ${e2.message}`;
      loaded = false;
    }
  }

  if (loaded && postLoad) {
    try { await postLoad(page); } catch (e) { /* non-fatal */ }
  }

  await page.waitForTimeout(SETTLE_MS);

  // programmatic red-flag detection
  let redFlags = [];
  let probe = {};
  if (loaded) {
    try {
      probe = await page.evaluate(() => {
        const vw = window.innerWidth, vh = window.innerHeight;
        const body = document.body;
        const out = {
          title: document.title,
          bodyText: (body && body.innerText || '').trim().length,
          activityCards: document.querySelectorAll('.activity-card').length,
          sectionBtns: document.querySelectorAll('.section-btn').length,
          canvases: [],
          overflow: false,
          scrollW: document.documentElement.scrollWidth,
          vw, vh,
          mainSettingsVisible: false,
          pinGateVisible: false,
        };
        // horizontal overflow beyond viewport (>2px tolerance)
        out.overflow = document.documentElement.scrollWidth > vw + 2;
        // canvas blank-ish detection (sample): non-zero size + any non-transparent pixel
        document.querySelectorAll('canvas').forEach((c) => {
          const info = { w: c.width, h: c.height, blank: null };
          try {
            const ctx = c.getContext('2d');
            if (ctx && c.width && c.height) {
              // sample a sparse grid across the WHOLE canvas (not just a corner)
              // so off-center content (e.g. bubbles rising from the bottom) counts.
              const data = ctx.getImageData(0, 0, c.width, c.height).data;
              let painted = false;
              const step = Math.max(1, Math.floor((c.width * c.height) / 4000)) * 4; // ~4000 samples max
              for (let i = 3; i < data.length; i += step) { if (data[i] !== 0) { painted = true; break; } }
              info.blank = !painted;
            }
          } catch (e) { info.blank = 'unreadable'; }
          out.canvases.push(info);
        });
        const ms = document.getElementById('mainSettings');
        const pg = document.getElementById('pinGate');
        if (ms) out.mainSettingsVisible = getComputedStyle(ms).display !== 'none';
        if (pg) out.pinGateVisible = getComputedStyle(pg).display !== 'none';
        return out;
      });
    } catch (e) {
      redFlags.push(`probe failed: ${e.message}`);
    }
    if (probe.overflow) redFlags.push(`horizontal overflow (scrollW=${probe.scrollW} > vw=${probe.vw})`);
    if (probe.bodyText === 0) redFlags.push('empty body text');
    for (const c of (probe.canvases || [])) {
      if (c.w === 0 || c.h === 0) redFlags.push('canvas zero-sized');
      else if (c.blank === true) redFlags.push('canvas appears blank');
    }
  }

  // screenshot
  try {
    await page.screenshot({ path: pngPath, fullPage: false });
  } catch (e) {
    redFlags.push(`screenshot failed: ${e.message}`);
  }

  await page.close();

  const realErrorCount = consoleErrors.length + pageErrors.length + failedRequests.length;
  let status = 'PASS';
  if (fatal || !loaded || pageErrors.length > 0) status = 'FAIL';
  else if (realErrorCount > 0 || redFlags.length > 0) status = 'WARN';

  return {
    label,
    url: urlPath,
    status,
    fatal,
    loaded,
    consoleErrors,
    pageErrors,
    failedRequests,
    assetNoise: assetNoise.length, // count only, it's expected noise
    redFlags,
    probe,
    png: pngPath.replace(REPO_ROOT + '\\', '').replace(REPO_ROOT + '/', '').replace(/\\/g, '/'),
  };
}

// ── main ──────────────────────────────────────────────────────────────────────
(async () => {
  const started = Date.now();
  console.log(`[sweep] base=${BASE} tiers=${TIER_SET.join(',')} features=${DO_FEATURES}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce', // settle animations faster
  });

  const results = [];
  const acts = ONLY ? ACTIVITIES.filter((a) => ONLY.includes(a.id)) : ACTIVITIES;

  // 1) activity x tier (+ feature variants)
  for (const act of acts) {
    mkdirSync(join(OUT_DIR, act.id), { recursive: true });
    for (const tier of TIER_SET) {
      // base
      {
        const profile = buildProfile({ tier });
        const png = join(OUT_DIR, act.id, `t${tier}.png`);
        const r = await captureCell(context, {
          label: `${act.id} t${tier}`,
          urlPath: act.file,
          profile,
          pngPath: png,
        });
        r.activity = act.id; r.tier = tier; r.kind = 'activity';
        results.push(r);
        console.log(`  ${r.status.padEnd(4)} ${r.label}`);
      }
      // feature variants (only at/above the flag's minTier)
      if (DO_FEATURES && FEATURES[act.id]) {
        for (const f of FEATURES[act.id]) {
          if (tier < f.minTier) continue;
          const profile = buildProfile({ tier, featureKey: f.key, activityId: act.id });
          const png = join(OUT_DIR, act.id, `t${tier}_${f.key}.png`);
          const r = await captureCell(context, {
            label: `${act.id} t${tier} +${f.key}`,
            urlPath: act.file,
            profile,
            pngPath: png,
          });
          r.activity = act.id; r.tier = tier; r.kind = 'feature'; r.feature = f.key;
          results.push(r);
          console.log(`  ${r.status.padEnd(4)} ${r.label}`);
        }
      }
    }
  }

  // 2) home + section index gating per tier
  if (!ONLY) {
    const gateTargets = [
      { id: 'home', file: 'home.html' },
      { id: 'games-index', file: 'games/index.html', section: 'games' },
      { id: 'learning-index', file: 'learning/index.html', section: 'learn' },
      { id: 'art-index', file: 'art/index.html', section: 'art' },
    ];
    mkdirSync(join(OUT_DIR, '_gating'), { recursive: true });
    for (const t of gateTargets) {
      for (const tier of TIER_SET) {
        const profile = buildProfile({ tier });
        // gating uses birthday (not tierOverrides), already set by buildProfile
        const png = join(OUT_DIR, '_gating', `${t.id}_t${tier}.png`);
        const r = await captureCell(context, {
          label: `${t.id} t${tier}`,
          urlPath: t.file,
          profile,
          pngPath: png,
        });
        r.kind = 'gating'; r.tier = tier; r.target = t.id;
        // validate visible vs expected for section pages
        if (t.section) {
          const expected = ACTIVITIES
            .filter((a) => a.section === t.section)
            .filter((a) => tier >= (ACTIVITY_MINTIER[a.id] || 1))
            .map((a) => a.id);
          r.expectedVisibleCount = expected.length;
          r.actualVisibleCount = r.probe ? r.probe.activityCards : null;
          if (r.actualVisibleCount != null && r.actualVisibleCount !== expected.length) {
            r.redFlags = r.redFlags || [];
            r.redFlags.push(`tile gating mismatch: expected ${expected.length} (${expected.join(',')}), saw ${r.actualVisibleCount}`);
            if (r.status === 'PASS') r.status = 'WARN';
          }
        }
        results.push(r);
        console.log(`  ${r.status.padEnd(4)} ${r.label} (gating)`);
      }
    }
  }

  // 3) parent settings — seed PIN, then force showMain() past the gate
  if (!ONLY || ONLY.includes('parent-settings')) {
    mkdirSync(join(OUT_DIR, 'parent-settings'), { recursive: true });
    const profile = buildProfile({ tier: 8 });
    const png = join(OUT_DIR, 'parent-settings', 'settings.png');
    const r = await captureCell(context, {
      label: 'parent-settings (unlocked)',
      urlPath: 'parent/settings.html',
      profile,
      pngPath: png,
      postLoad: async (page) => {
        // bypass the PIN gate for capture: the app exposes showMain() globally
        await page.evaluate(() => { if (typeof showMain === 'function') showMain(); });
      },
    });
    r.kind = 'settings';
    if (r.probe && !r.probe.mainSettingsVisible) {
      r.redFlags = r.redFlags || [];
      r.redFlags.push('could not reveal mainSettings (PIN bypass failed) — gate captured instead');
    }
    results.push(r);
    console.log(`  ${r.status.padEnd(4)} ${r.label}`);

    // also capture the gate itself (no bypass) for the record
    const pngGate = join(OUT_DIR, 'parent-settings', 'settings_gate.png');
    const rg = await captureCell(context, {
      label: 'parent-settings (gate)',
      urlPath: 'parent/settings.html',
      profile,
      pngPath: pngGate,
    });
    rg.kind = 'settings-gate';
    results.push(rg);
    console.log(`  ${rg.status.padEnd(4)} ${rg.label}`);
  }

  await context.close();
  await browser.close();

  // ── write report.json ──
  const summary = {
    base: BASE,
    generatedAt: new Date().toISOString(),
    durationSec: Math.round((Date.now() - started) / 1000),
    viewport: VIEWPORT,
    counts: {
      total: results.length,
      pass: results.filter((r) => r.status === 'PASS').length,
      warn: results.filter((r) => r.status === 'WARN').length,
      fail: results.filter((r) => r.status === 'FAIL').length,
    },
    results,
  };
  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(summary, null, 2));

  // ── write report.md ──
  writeFileSync(join(OUT_DIR, 'report.md'), renderMarkdown(summary));

  console.log(`[sweep] done: ${summary.counts.pass} PASS / ${summary.counts.warn} WARN / ${summary.counts.fail} FAIL of ${summary.counts.total} in ${summary.durationSec}s`);
})().catch((e) => {
  console.error('[sweep] FATAL', e);
  process.exit(1);
});

// ── markdown report ─────────────────────────────────────────────────────────
function renderMarkdown(s) {
  const lines = [];
  lines.push('# Sweep Report');
  lines.push('');
  lines.push(`- Base: ${s.base}`);
  lines.push(`- Generated: ${s.generatedAt}`);
  lines.push(`- Duration: ${s.durationSec}s   Viewport: ${s.viewport.width}x${s.viewport.height}`);
  lines.push(`- Totals: **${s.counts.pass} PASS / ${s.counts.warn} WARN / ${s.counts.fail} FAIL** of ${s.counts.total}`);
  lines.push('');
  lines.push('Status legend: PASS = loaded, no real errors/flags. WARN = loaded but real console/network errors or red flags. FAIL = page error / nav failure. asset-404 (mascot/audio/video) noise is counted separately and never causes WARN/FAIL.');
  lines.push('');

  // activity x tier matrix (base cells only)
  lines.push('## Activity × Tier matrix (base cells)');
  lines.push('');
  const tiers = [...new Set(s.results.filter(r => r.kind === 'activity').map(r => r.tier))].sort((a, b) => a - b);
  lines.push('| activity | ' + tiers.map(t => `t${t}`).join(' | ') + ' |');
  lines.push('|' + '---|'.repeat(tiers.length + 1));
  const actIds = [...new Set(s.results.filter(r => r.kind === 'activity').map(r => r.activity))];
  for (const id of actIds) {
    const cells = tiers.map(t => {
      const r = s.results.find(x => x.kind === 'activity' && x.activity === id && x.tier === t);
      if (!r) return '·';
      const mark = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️' : '❌';
      const n = r.consoleErrors.length + r.pageErrors.length + r.failedRequests.length;
      return n ? `${mark}${n}` : mark;
    });
    lines.push(`| ${id} | ${cells.join(' | ')} |`);
  }
  lines.push('');
  lines.push('(number after a mark = count of real console/page/network errors, excluding asset-404 noise)');
  lines.push('');

  // worst cells
  const bad = s.results
    .filter(r => r.status !== 'PASS')
    .map(r => ({
      r,
      score: (r.status === 'FAIL' ? 1000 : 0) + r.pageErrors.length * 100 + r.consoleErrors.length * 10 + r.failedRequests.length * 5 + (r.redFlags ? r.redFlags.length : 0),
    }))
    .sort((a, b) => b.score - a.score);

  lines.push('## Prioritized issues (worst first)');
  lines.push('');
  if (!bad.length) {
    lines.push('_No WARN/FAIL cells._');
  } else {
    for (const { r } of bad) {
      lines.push(`### [${r.status}] ${r.label}`);
      lines.push(`- artifact: \`${r.png}\``);
      if (r.fatal) lines.push(`- fatal: ${r.fatal}`);
      if (r.pageErrors.length) lines.push(`- page errors: ${r.pageErrors.map(e => '`' + e + '`').join('; ')}`);
      if (r.consoleErrors.length) lines.push(`- console errors: ${r.consoleErrors.slice(0, 6).map(e => '`' + e + '`').join('; ')}${r.consoleErrors.length > 6 ? ' …' : ''}`);
      if (r.failedRequests.length) lines.push(`- failed requests (non-asset): ${r.failedRequests.slice(0, 6).map(e => '`' + e + '`').join('; ')}${r.failedRequests.length > 6 ? ' …' : ''}`);
      if (r.redFlags && r.redFlags.length) lines.push(`- red flags: ${r.redFlags.map(e => '`' + e + '`').join('; ')}`);
      lines.push('');
    }
  }

  // gating section
  const gating = s.results.filter(r => r.kind === 'gating' && r.target && r.target.endsWith('-index'));
  if (gating.length) {
    lines.push('## Tile gating (section index pages)');
    lines.push('');
    lines.push('| target | tier | expected | actual | ok |');
    lines.push('|---|---|---|---|---|');
    for (const r of gating.sort((a, b) => a.target.localeCompare(b.target) || a.tier - b.tier)) {
      const ok = r.expectedVisibleCount === r.actualVisibleCount ? '✅' : '❌';
      lines.push(`| ${r.target} | t${r.tier} | ${r.expectedVisibleCount} | ${r.actualVisibleCount} | ${ok} |`);
    }
    lines.push('');
  }

  // settings
  const settings = s.results.filter(r => r.kind === 'settings' || r.kind === 'settings-gate');
  if (settings.length) {
    lines.push('## Parent settings');
    lines.push('');
    for (const r of settings) {
      lines.push(`- ${r.label}: ${r.status} — \`${r.png}\`${r.redFlags && r.redFlags.length ? ' — ' + r.redFlags.join('; ') : ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
