# Achievements & Ribbons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-child achievement/ribbon system across all 16 activities (first-play, milestone, mastery, streak, rank), shown on the Learn-screen shelf and a scrollable gallery, plus a visual overhaul of activity backgrounds.

**Architecture:** Pure dual-mode JS modules (browser global + `module.exports`) hold the achievement *definitions* and *logic* so the logic is unit-testable under Node's built-in `node --test`. A thin browser glue layer (`progress.js`) reads the active profile's `achievements` field, runs the logic, persists via the existing `updateProfile` (which already triggers cloud sync), and fires a celebration overlay. Rendering (`ribbon.js`) is shared by celebration, shelf, and gallery.

**Tech Stack:** Vanilla ES5/ES6 browser JS loaded via `<script>` tags (no bundler), SVG for ribbons, `localStorage` for persistence, Node 24 `node --test` for engine tests. No new dependencies, no `package.json` required (tests run via `node --test tests/`).

---

## File Structure

**New files:**
- `js/achievement-defs.js` — definition data + expansion builder + lookups. Dual-mode.
- `js/achievement-logic.js` — pure unlock/counter/streak/rank logic. Dual-mode. No DOM/storage.
- `js/progress.js` — browser glue: `window.vbProgress`. Reads/writes profile, fires celebration.
- `js/ribbon.js` — `renderRibbon(def, opts)` → SVG element. Browser.
- `js/celebrate.js` — unlock celebration overlay + queue. Browser.
- `css/achievements.css` — ribbon, shelf, gallery, celebration styles.
- `achievements.html` — gallery page (repo root, sibling of `home.html`).
- `tests/achievement-defs.test.js` — Node tests for the data/builder.
- `tests/achievement-logic.test.js` — Node tests for the engine.
- `dev/ribbon-preview.html` — throwaway visual harness for the step-1 screenshot checkpoint.

**Modified files:**
- `learning/index.html` — add shelf, gallery link, new script includes.
- All 16 activity pages (instrumentation + visual overhaul):
  `games/tap-pop.html`, `games/shape-match.html`, `games/peek-a-boo.html`,
  `learning/hello-colors.html`, `learning/animal-sounds.html`, `learning/count-along.html`,
  `learning/abcs.html`, `learning/days.html`, `learning/math.html`,
  `learning/spelling.html`, `learning/money.html`, `learning/body-parts.html`,
  `art/stamp-art.html`, `art/finger-paint.html`, `art/color-splash.html`, `art/color-in.html`.

**Dual-mode module footer** (use on `achievement-defs.js` and `achievement-logic.js` so both the browser and `node --test` can load them):

```js
// at end of file, after the local `const API = {...}` (or named consts):
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
} else {
  (typeof self !== 'undefined' ? self : this).VB_NAMESPACE = API;
}
```

Each module below specifies its exact `API` shape and global name.

---

## Phase 0 — Setup

### Task 0: Test directory + Node sanity check

**Files:**
- Create: `tests/smoke.test.js`

- [ ] **Step 1: Write a trivial Node test to confirm the runner works**

```js
// tests/smoke.test.js
const { test } = require('node:test');
const assert = require('node:assert');

test('node test runner works', () => {
  assert.strictEqual(1 + 1, 2);
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/`
Expected: `# pass 1` (exit code 0).

- [ ] **Step 3: Commit**

```bash
git add tests/smoke.test.js
git commit -m "test: add node --test smoke test"
```

---

## Phase 1 — Ribbon look (checkpoint before mass production)

### Task 1: `js/ribbon.js` — ribbon renderer

**Files:**
- Create: `js/ribbon.js`
- Create: `css/achievements.css`
- Create: `dev/ribbon-preview.html`

- [ ] **Step 1: Create `css/achievements.css` with ribbon base styles**

```css
/* css/achievements.css — ribbons, shelf, gallery, celebration */

.vb-ribbon { display:inline-block; line-height:0; }
.vb-ribbon svg { display:block; overflow:visible; }
.vb-ribbon.locked { filter: grayscale(1) brightness(0.7); opacity:0.55; }

/* Gallery */
.gallery-screen {
  min-height:100vh; padding: calc(100px + env(safe-area-inset-top)) 20px 140px;
  display:flex; flex-direction:column; align-items:center; gap:24px;
}
.rank-banner {
  display:flex; flex-direction:column; align-items:center; gap:6px;
  color:var(--text); text-align:center;
}
.rank-banner .rank-name { font-family:var(--font-display); font-size:clamp(28px,6vw,44px); font-weight:700; }
.rank-xp-track { width:min(420px,80vw); height:14px; border-radius:999px;
  background:var(--chip-bg); overflow:hidden; }
.rank-xp-fill { height:100%; background:var(--accent); border-radius:999px;
  transition:width 600ms cubic-bezier(0.22,1,0.36,1); }
.gallery-group { width:min(640px,92vw); }
.gallery-group h2 { color:var(--text); font-size:18px; margin:0 0 10px; display:flex; gap:8px; align-items:center; }
.gallery-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(96px,1fr)); gap:14px; }
.gallery-cell { display:flex; flex-direction:column; align-items:center; gap:6px; text-align:center; }
.gallery-cell .cell-label { font-size:12px; color:var(--text-soft); line-height:1.2; }
.gallery-cell .cell-hint  { font-size:11px; color:var(--text-soft); opacity:0.75; line-height:1.2; }

/* Shelf on Learn screen */
.ribbon-shelf {
  position:fixed; inset:auto 0 0 0; z-index:0; pointer-events:auto;
  display:flex; flex-wrap:wrap; gap:8px; justify-content:center;
  padding:14px 16px calc(18px + env(safe-area-inset-bottom));
  opacity:0.5;
}
.ribbon-shelf.empty { font-size:14px; color:var(--text-soft); opacity:0.6; }

/* Celebration overlay */
.vb-celebrate {
  position:fixed; inset:0; z-index:1200; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:16px; pointer-events:none;
  background:radial-gradient(circle at 50% 45%, rgba(0,0,0,0.45), rgba(0,0,0,0.15));
}
.vb-celebrate .cele-title { color:#fff; font-family:var(--font-display); font-weight:700;
  font-size:clamp(24px,7vw,40px); text-shadow:0 3px 14px rgba(0,0,0,0.5); }
.vb-celebrate .cele-ribbon { animation: celePop 700ms cubic-bezier(0.22,1,0.36,1) both; }
@keyframes celePop {
  0% { transform: translateY(40px) scale(0.4); opacity:0; }
  60%{ transform: translateY(0) scale(1.12); opacity:1; }
  100%{ transform: translateY(0) scale(1); opacity:1; }
}
@media (prefers-reduced-motion: reduce) {
  .vb-celebrate .cele-ribbon { animation: celeFade 250ms ease both; }
  @keyframes celeFade { from{opacity:0} to{opacity:1} }
  .rank-xp-fill { transition:none; }
}
```

- [ ] **Step 2: Create `js/ribbon.js`**

```js
/* js/ribbon.js — renderRibbon(def, opts) -> SVG-wrapped element.
   def: { id, type, tier, title, icon, color }
   opts: { earned=true, size=96 } */
(function () {
  'use strict';

  var TIER_COLORS = {
    bronze:'#CD7F32', silver:'#BFC4CC', gold:'#FFC53D',
    sapphire:'#3B6CE7', ruby:'#E0115F', diamond:'#67E8E0'
  };
  // type fallbacks when no tier (first/mastery/streak/rank)
  var TYPE_COLORS = {
    first:'#7BD389', mastery:'#FF8FB1', streak:'#FFB454', rank:'#9B8CFF'
  };

  function ribbonColor(def) {
    return def.color || TIER_COLORS[def.tier] || TYPE_COLORS[def.type] || '#9B8CFF';
  }

  function renderRibbon(def, opts) {
    opts = opts || {};
    var earned = opts.earned !== false;
    var size = opts.size || 96;
    var color = ribbonColor(def);

    var wrap = document.createElement('span');
    wrap.className = 'vb-ribbon' + (earned ? '' : ' locked');
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label',
      (earned ? 'Earned ribbon: ' : 'Locked ribbon: ') + (def.title || def.id));

    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', Math.round(size * 1.35));
    svg.setAttribute('viewBox', '0 0 100 135');

    // Two hanging tails (behind the medal)
    svg.appendChild(elNS(NS, 'path', {
      d:'M38 78 L30 122 L50 110 L46 80 Z', fill: shade(color, -18)
    }));
    svg.appendChild(elNS(NS, 'path', {
      d:'M62 78 L70 122 L50 110 L54 80 Z', fill: shade(color, -8)
    }));

    // Medal disc with a soft radial highlight
    var defs = elNS(NS, 'defs', {});
    var grad = elNS(NS, 'radialGradient', { id:'rg-'+sanitize(def.id), cx:'38%', cy:'34%', r:'72%' });
    grad.appendChild(elNS(NS, 'stop', { offset:'0%',  'stop-color': shade(color, 32) }));
    grad.appendChild(elNS(NS, 'stop', { offset:'60%', 'stop-color': color }));
    grad.appendChild(elNS(NS, 'stop', { offset:'100%','stop-color': shade(color, -22) }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    // Scalloped rosette ring
    svg.appendChild(elNS(NS, 'circle', { cx:50, cy:46, r:40, fill: shade(color,-26) }));
    svg.appendChild(elNS(NS, 'circle', { cx:50, cy:46, r:34, fill:'url(#rg-'+sanitize(def.id)+')',
      stroke:'rgba(255,255,255,0.7)', 'stroke-width':2 }));

    // Center glyph
    var glyph = elNS(NS, 'text', { x:50, y:46, 'text-anchor':'middle',
      'dominant-baseline':'central', 'font-size':34 });
    glyph.textContent = def.icon || '★';
    svg.appendChild(glyph);

    wrap.appendChild(svg);
    return wrap;
  }

  function elNS(NS, tag, attrs) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function sanitize(s) { return String(s).replace(/[^a-z0-9]/gi, '-'); }
  // lighten(+)/darken(-) a hex color by pct toward white/black
  function shade(hex, pct) {
    var c = hex.replace('#',''); if (c.length === 3) c = c.replace(/(.)/g,'$1$1');
    var r = parseInt(c.substr(0,2),16), g = parseInt(c.substr(2,2),16), b = parseInt(c.substr(4,2),16);
    var t = pct < 0 ? 0 : 255, p = Math.abs(pct)/100;
    r = Math.round((t-r)*p)+r; g = Math.round((t-g)*p)+g; b = Math.round((t-b)*p)+b;
    return '#' + [r,g,b].map(function(v){ return ('0'+v.toString(16)).slice(-2); }).join('');
  }

  window.renderRibbon = renderRibbon;
  window.vbRibbonColor = ribbonColor;
})();
```

- [ ] **Step 3: Create `dev/ribbon-preview.html` harness**

```html
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ribbon preview</title>
<link rel="stylesheet" href="../css/style.css">
<link rel="stylesheet" href="../css/achievements.css">
<style>body{padding:30px;display:flex;flex-wrap:wrap;gap:24px;align-items:flex-end;}</style>
</head><body>
<script src="../js/ribbon.js"></script>
<script>
  var demos = [
    { id:'count.bronze',  type:'milestone', tier:'bronze',  title:'Bronze',  icon:'🔢' },
    { id:'count.silver',  type:'milestone', tier:'silver',  title:'Silver',  icon:'🔢' },
    { id:'count.gold',    type:'milestone', tier:'gold',    title:'Gold',    icon:'🔢' },
    { id:'count.sapph',   type:'milestone', tier:'sapphire',title:'Sapphire',icon:'🔢' },
    { id:'count.ruby',    type:'milestone', tier:'ruby',    title:'Ruby',    icon:'🔢' },
    { id:'count.diamond', type:'milestone', tier:'diamond', title:'Diamond', icon:'🔢' },
    { id:'first.tap',     type:'first',     title:'First Bubble', icon:'🫧' },
    { id:'mastery.math',  type:'mastery',   title:'Math Master',  icon:'➕' },
    { id:'rank.legend',   type:'rank',      title:'Legend',       icon:'👑' },
    { id:'locked.demo',   type:'milestone', tier:'gold', title:'Locked', icon:'🔒' }
  ];
  demos.forEach(function(d, i){
    document.body.appendChild(renderRibbon(d, { earned: d.id !== 'locked.demo', size: 110 }));
  });
</script>
</body></html>
```

- [ ] **Step 4: Screenshot checkpoint — STOP for sign-off**

Serve the repo (e.g. `python -m http.server 8765`) and open `http://localhost:8765/dev/ribbon-preview.html`, or use the Preview/Playwright MCP to screenshot it. Confirm the ribbon look (earned tiers + locked greyscale) with Scott **before** proceeding. Do not mass-produce definitions until approved.

- [ ] **Step 5: Commit**

```bash
git add js/ribbon.js css/achievements.css dev/ribbon-preview.html
git commit -m "feat: ribbon renderer + preview harness"
```

---

## Phase 2 — Celebration overlay

### Task 2: `js/celebrate.js`

**Files:**
- Create: `js/celebrate.js`

- [ ] **Step 1: Create `js/celebrate.js`**

```js
/* js/celebrate.js — window.vbCelebrate.show(def[]). Queues, never blocks.
   Depends on ribbon.js (renderRibbon) and app.js (speak, playSuccess) when present. */
(function () {
  'use strict';
  var queue = [], busy = false;

  function show(defs) {
    if (!defs) return;
    if (!Array.isArray(defs)) defs = [defs];
    defs.forEach(function (d) { queue.push(d); });
    if (!busy) next();
  }

  function next() {
    if (!queue.length) { busy = false; return; }
    busy = true;
    var def = queue.shift();

    var overlay = document.createElement('div');
    overlay.className = 'vb-celebrate';

    var ribbon = (typeof renderRibbon === 'function')
      ? renderRibbon(def, { size: 150 })
      : document.createElement('div');
    ribbon.classList.add('cele-ribbon');
    overlay.appendChild(ribbon);

    var title = document.createElement('div');
    title.className = 'cele-title';
    title.textContent = def.title || 'New ribbon!';
    overlay.appendChild(title);

    document.body.appendChild(overlay);
    if (typeof playSuccess === 'function') try { playSuccess(); } catch (e) {}
    if (typeof speak === 'function') try { speak('You earned ' + (def.title || 'a ribbon') + '!'); } catch (e) {}

    var dwell = 2000;
    setTimeout(function () {
      overlay.style.transition = 'opacity 300ms ease';
      overlay.style.opacity = '0';
      setTimeout(function () { overlay.remove(); next(); }, 320);
    }, dwell);
  }

  window.vbCelebrate = { show: show };
})();
```

- [ ] **Step 2: Manual verify via preview**

Add `<script src="../js/celebrate.js"></script>` temporarily to `dev/ribbon-preview.html` and call `vbCelebrate.show(demos[2])` in the console; confirm the fly-in + auto-dismiss. (No persistent change to the harness needed.)

- [ ] **Step 3: Commit**

```bash
git add js/celebrate.js
git commit -m "feat: ribbon unlock celebration overlay"
```

---

## Phase 3 — Definitions data (dual-mode, tested)

### Task 3: `js/achievement-defs.js`

**Files:**
- Create: `js/achievement-defs.js`
- Test: `tests/achievement-defs.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/achievement-defs.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const defs = require('../js/achievement-defs.js');

test('exports list, ranks, and lookups', () => {
  assert.ok(Array.isArray(defs.VB_ACHIEVEMENTS));
  assert.ok(Array.isArray(defs.VB_RANKS));
  assert.strictEqual(typeof defs.byCounter, 'function');
  assert.strictEqual(typeof defs.byId, 'function');
});

test('each activity has exactly one first-play + six milestone tiers', () => {
  const tapFirst = defs.VB_ACHIEVEMENTS.filter(d => d.activity === 'tap-pop' && d.type === 'first');
  const tapMiles = defs.VB_ACHIEVEMENTS.filter(d => d.activity === 'tap-pop' && d.type === 'milestone');
  assert.strictEqual(tapFirst.length, 1);
  assert.strictEqual(tapMiles.length, 6);
});

test('milestone thresholds are 5/10/25/50/75/100', () => {
  const t = defs.VB_ACHIEVEMENTS
    .filter(d => d.activity === 'tap-pop' && d.type === 'milestone')
    .map(d => d.threshold).sort((a,b)=>a-b);
  assert.deepStrictEqual(t, [5,10,25,50,75,100]);
});

test('ids are unique', () => {
  const ids = defs.VB_ACHIEVEMENTS.map(d => d.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test('ranks are ascending by minXp and start at 0', () => {
  const xs = defs.VB_RANKS.map(r => r.minXp);
  assert.strictEqual(xs[0], 0);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i-1]);
  assert.strictEqual(defs.VB_RANKS.length, 7);
});

test('byCounter returns milestone defs for a counter key, ascending', () => {
  const ms = defs.byCounter('tap-pop');
  assert.strictEqual(ms.length, 6);
  assert.ok(ms[0].threshold <= ms[5].threshold);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/achievement-defs.test.js`
Expected: FAIL — `Cannot find module '../js/achievement-defs.js'`.

- [ ] **Step 3: Create `js/achievement-defs.js`**

```js
/* js/achievement-defs.js — definition data + builder + lookups. Dual-mode. */
(function () {
  'use strict';

  // section: games | learn | art. counter = the record() key.
  // mastery: { id, title, hint } or null. art uses creation counts (no mastery).
  var ACTIVITIES = [
    { id:'tap-pop',      name:'Tap & Pop',    icon:'🫧', section:'games', noun:'bubbles popped', mastery:null },
    { id:'shape-match',  name:'Shape Match',  icon:'🔷', section:'games', noun:'shapes matched',
      mastery:{ title:'Shape Master', hint:'Finish a 6-shape round' } },
    { id:'peek-a-boo',   name:'Peek-a-Boo',   icon:'👀', section:'games', noun:'peeks', mastery:null },

    { id:'hello-colors', name:'Hello Colors', icon:'🌈', section:'learn', noun:'colors named',
      mastery:{ title:'Color Whiz', hint:'Win the color quiz' } },
    { id:'animal-sounds',name:'Animal Sounds',icon:'🐘', section:'learn', noun:'animals',
      mastery:{ title:'Animal Expert', hint:'Win the sound quiz' } },
    { id:'count-along',  name:'Count Along',  icon:'🔢', section:'learn', noun:'things counted',
      mastery:{ title:'Counting Champ', hint:'Win the how-many quiz' } },
    { id:'abcs',         name:'ABCs',         icon:'🔤', section:'learn', noun:'letters',
      mastery:{ title:'Word Builder', hint:'Spell a short word' } },
    { id:'days',         name:'Days',         icon:'📅', section:'learn', noun:'days right',
      mastery:{ title:'Calendar Kid', hint:'Win the days quiz' } },
    { id:'math',         name:'Math Mountain',icon:'➕', section:'learn', noun:'problems solved',
      mastery:{ title:'Math Master', hint:'Solve a take-away problem' } },
    { id:'spelling',     name:'Spelling Bee', icon:'🐝', section:'learn', noun:'words spelled',
      mastery:{ title:'Spelling Star', hint:'Spell from the letter bank' } },
    { id:'money',        name:'Money',        icon:'💰', section:'learn', noun:'coins known',
      mastery:{ title:'Money Smart', hint:'Count a coin total' } },
    { id:'body-parts',   name:'Body Parts',   icon:'👤', section:'learn', noun:'parts named',
      mastery:{ title:'Body Boss', hint:'Name an extra part' } },

    { id:'stamp-art',    name:'Stamp Art',    icon:'⭐', section:'art', noun:'stamps placed', mastery:null },
    { id:'finger-paint', name:'Finger Paint', icon:'🖌️', section:'art', noun:'strokes painted', mastery:null },
    { id:'color-splash', name:'Color Splash', icon:'💥', section:'art', noun:'splashes made', mastery:null },
    { id:'color-in',     name:'Color In',     icon:'🖍️', section:'art', noun:'areas colored', mastery:null }
  ];

  var MILESTONE_TIERS = [
    { tier:'bronze',   threshold:5,   xp:1, label:'Bronze' },
    { tier:'silver',   threshold:10,  xp:2, label:'Silver' },
    { tier:'gold',     threshold:25,  xp:3, label:'Gold' },
    { tier:'sapphire', threshold:50,  xp:5, label:'Sapphire' },
    { tier:'ruby',     threshold:75,  xp:7, label:'Ruby' },
    { tier:'diamond',  threshold:100, xp:10, label:'Diamond' }
  ];

  var STREAKS = [
    { id:'streak.3', type:'streak', title:'3-Day Streak', hint:'Play 3 days in a row', icon:'🔥', xp:3, days:3 },
    { id:'streak.7', type:'streak', title:'7-Day Streak', hint:'Play 7 days in a row', icon:'⚡', xp:6, days:7 }
  ];

  var VB_RANKS = [
    { id:'sprout',     label:'Sprout',     minXp:0,   color:'#7BD389' },
    { id:'explorer',   label:'Explorer',   minXp:15,  color:'#4ECDC4' },
    { id:'star',       label:'Star',       minXp:40,  color:'#FFD93D' },
    { id:'superstar',  label:'Super Star', minXp:80,  color:'#FF9F43' },
    { id:'champion',   label:'Champion',   minXp:140, color:'#FF6B6B' },
    { id:'hero',       label:'Hero',       minXp:220, color:'#9B8CFF' },
    { id:'legend',     label:'Legend',     minXp:320, color:'#E0115F' }
  ];

  var VB_ACHIEVEMENTS = [];

  ACTIVITIES.forEach(function (a) {
    VB_ACHIEVEMENTS.push({
      id: a.id + '.first', activity: a.id, section: a.section, type:'first',
      title: 'First ' + a.name, hint: 'Open ' + a.name, icon: a.icon, xp: 1
    });
    MILESTONE_TIERS.forEach(function (m) {
      VB_ACHIEVEMENTS.push({
        id: a.id + '.milestone.' + m.tier, activity: a.id, section: a.section,
        type:'milestone', tier: m.tier, counter: a.id, threshold: m.threshold,
        title: a.name + ' ' + m.label, hint: 'Reach ' + m.threshold + ' ' + a.noun,
        icon: a.icon, xp: m.xp
      });
    });
    if (a.mastery) {
      VB_ACHIEVEMENTS.push({
        id: a.id + '.mastery', activity: a.id, section: a.section, type:'mastery',
        title: a.mastery.title, hint: a.mastery.hint, icon: a.icon, xp: 8
      });
    }
  });
  STREAKS.forEach(function (s) { VB_ACHIEVEMENTS.push(Object.assign({ activity:'_streak', section:'all' }, s)); });
  VB_RANKS.forEach(function (r) {
    if (r.minXp === 0) return; // Sprout is the start, not an earned ribbon
    VB_ACHIEVEMENTS.push({
      id:'rank.' + r.id, activity:'_rank', section:'all', type:'rank',
      title: r.label, hint:'Earn ' + r.minXp + ' XP', icon:'👑', color:r.color, xp:0, minXp:r.minXp
    });
  });

  function byCounter(key) {
    return VB_ACHIEVEMENTS
      .filter(function (d) { return d.type === 'milestone' && d.counter === key; })
      .sort(function (x, y) { return x.threshold - y.threshold; });
  }
  function byId(id) { return VB_ACHIEVEMENTS.filter(function (d) { return d.id === id; })[0] || null; }
  function byActivity(id) { return VB_ACHIEVEMENTS.filter(function (d) { return d.activity === id; }); }

  var API = {
    VB_ACHIEVEMENTS: VB_ACHIEVEMENTS, VB_RANKS: VB_RANKS,
    ACTIVITIES: ACTIVITIES, byCounter: byCounter, byId: byId, byActivity: byActivity
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else {
    var g = (typeof self !== 'undefined' ? self : this);
    g.VB_ACHIEVEMENTS = VB_ACHIEVEMENTS; g.VB_RANKS = VB_RANKS;
    g.vbDefs = API;
  }
})();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/achievement-defs.test.js`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add js/achievement-defs.js tests/achievement-defs.test.js
git commit -m "feat: achievement definitions + builder (tested)"
```

---

## Phase 4 — Logic engine (dual-mode, TDD)

### Task 4: `js/achievement-logic.js`

**Files:**
- Create: `js/achievement-logic.js`
- Test: `tests/achievement-logic.test.js`

State shape passed in/out (a plain object, the profile's `achievements` field):
`{ unlocked:{}, counters:{}, streak:{last,current,best}, xp:0, rank:'sprout' }`.

Each function returns `{ state, unlocked:[def,...] }` where `unlocked` is the list of
newly-earned defs (for celebration). Functions never mutate the input state.

- [ ] **Step 1: Write the failing tests**

```js
// tests/achievement-logic.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const defs = require('../js/achievement-defs.js');
const logic = require('../js/achievement-logic.js');

const RANKS = defs.VB_RANKS;
function fresh() { return logic.emptyState(); }

test('emptyState is well-formed', () => {
  const s = fresh();
  assert.deepStrictEqual(s.unlocked, {});
  assert.deepStrictEqual(s.counters, {});
  assert.strictEqual(s.xp, 0);
  assert.strictEqual(s.rank, 'sprout');
});

test('firstPlay unlocks once and adds xp', () => {
  let { state, unlocked } = logic.firstPlay(fresh(), 'tap-pop', defs);
  assert.strictEqual(unlocked.length, 1);
  assert.strictEqual(unlocked[0].id, 'tap-pop.first');
  assert.strictEqual(state.xp, 1);
  // second call: nothing new
  const again = logic.firstPlay(state, 'tap-pop', defs);
  assert.strictEqual(again.unlocked.length, 0);
  assert.strictEqual(again.state.xp, 1);
});

test('record crosses exactly the tiers passed', () => {
  // jump from 0 to 12 -> bronze(5) + silver(10) unlock, gold(25) not yet
  const { state, unlocked } = logic.record(fresh(), 'tap-pop', 12, defs);
  const ids = unlocked.map(d => d.id).sort();
  assert.deepStrictEqual(ids, ['tap-pop.milestone.bronze','tap-pop.milestone.silver']);
  assert.strictEqual(state.counters['tap-pop'], 12);
});

test('record does not re-unlock already-earned tiers', () => {
  let s = logic.record(fresh(), 'tap-pop', 12, defs).state;
  const r2 = logic.record(s, 'tap-pop', 1, defs); // 13, still below 25
  assert.strictEqual(r2.unlocked.length, 0);
  assert.strictEqual(r2.state.counters['tap-pop'], 13);
});

test('mastery unlocks a specific ribbon once', () => {
  const r1 = logic.mastery(fresh(), 'math.mastery', defs);
  assert.strictEqual(r1.unlocked.length, 1);
  assert.strictEqual(r1.state.xp, 8);
  const r2 = logic.mastery(r1.state, 'math.mastery', defs);
  assert.strictEqual(r2.unlocked.length, 0);
});

test('streak increments on consecutive day, no double same-day', () => {
  let s = logic.touchStreak(fresh(), '2026-06-01', defs).state;
  assert.strictEqual(s.streak.current, 1);
  s = logic.touchStreak(s, '2026-06-01', defs).state; // same day
  assert.strictEqual(s.streak.current, 1);
  s = logic.touchStreak(s, '2026-06-02', defs).state; // next day
  assert.strictEqual(s.streak.current, 2);
});

test('streak resets after a gap', () => {
  let s = logic.touchStreak(fresh(), '2026-06-01', defs).state;
  s = logic.touchStreak(s, '2026-06-05', defs).state; // gap
  assert.strictEqual(s.streak.current, 1);
});

test('3-day streak unlocks the streak ribbon', () => {
  let s = fresh(); let unlocked = [];
  ['2026-06-01','2026-06-02','2026-06-03'].forEach(d => {
    const r = logic.touchStreak(s, d, defs); s = r.state; unlocked = r.unlocked;
  });
  assert.ok(unlocked.some(d => d.id === 'streak.3'));
});

test('rank flips at threshold and awards rank ribbon once', () => {
  // drive xp to >=15 (explorer). first-play(1) + record 12 -> bronze(1)+silver(2)=3 -> xp 4.
  // add mastery(8) -> 12, add another mastery? only one per id. Use multiple activities.
  let s = fresh();
  s = logic.firstPlay(s, 'tap-pop', defs).state;        // 1
  s = logic.record(s, 'tap-pop', 100, defs).state;       // all 6 tiers: 1+2+3+5+7+10=28 -> xp 29
  assert.ok(s.xp >= 15);
  assert.strictEqual(s.rank, 'explorer'); // 29 -> explorer(15) but <40
  assert.ok(Object.keys(s.unlocked).includes('rank.explorer'));
});

test('rankForXp picks the highest threshold not exceeding xp', () => {
  assert.strictEqual(logic.rankForXp(0, RANKS).id, 'sprout');
  assert.strictEqual(logic.rankForXp(14, RANKS).id, 'sprout');
  assert.strictEqual(logic.rankForXp(15, RANKS).id, 'explorer');
  assert.strictEqual(logic.rankForXp(999, RANKS).id, 'legend');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/achievement-logic.test.js`
Expected: FAIL — `Cannot find module '../js/achievement-logic.js'`.

- [ ] **Step 3: Create `js/achievement-logic.js`**

```js
/* js/achievement-logic.js — pure achievement engine. No DOM, no storage. Dual-mode. */
(function () {
  'use strict';

  function emptyState() {
    return { unlocked:{}, counters:{}, streak:{ last:null, current:0, best:0 }, xp:0, rank:'sprout' };
  }

  // deep-ish clone of the parts we mutate
  function clone(s) {
    return {
      unlocked: Object.assign({}, s.unlocked),
      counters: Object.assign({}, s.counters),
      streak: Object.assign({}, s.streak || { last:null, current:0, best:0 }),
      xp: s.xp || 0,
      rank: s.rank || 'sprout'
    };
  }

  function rankForXp(xp, ranks) {
    var chosen = ranks[0];
    for (var i = 0; i < ranks.length; i++) if (xp >= ranks[i].minXp) chosen = ranks[i];
    return chosen;
  }

  // unlock a def into state (idempotent). returns true if newly unlocked.
  function _apply(state, def, out) {
    if (!def || state.unlocked[def.id]) return false;
    state.unlocked[def.id] = { at: 0 }; // caller stamps real time in glue layer
    state.xp += (def.xp || 0);
    out.push(def);
    return true;
  }

  // after xp changes, award any rank ribbons newly reached + update cached rank
  function _reconcileRank(state, defsApi, out) {
    var ranks = defsApi.VB_RANKS;
    var newRank = rankForXp(state.xp, ranks);
    state.rank = newRank.id;
    // award rank ribbons for every rank threshold now met (except sprout)
    ranks.forEach(function (r) {
      if (r.minXp > 0 && state.xp >= r.minXp) {
        var rdef = defsApi.byId('rank.' + r.id);
        if (rdef) _apply(state, rdef, out); // xp:0, so no xp feedback loop
      }
    });
  }

  function firstPlay(prev, activityId, defsApi) {
    var state = clone(prev), out = [];
    var def = defsApi.byId(activityId + '.first');
    _apply(state, def, out);
    _reconcileRank(state, defsApi, out);
    return { state: state, unlocked: out };
  }

  function record(prev, counterKey, amount, defsApi) {
    var state = clone(prev), out = [];
    var before = state.counters[counterKey] || 0;
    var after = before + (amount == null ? 1 : amount);
    state.counters[counterKey] = after;
    defsApi.byCounter(counterKey).forEach(function (def) {
      if (after >= def.threshold) _apply(state, def, out);
    });
    _reconcileRank(state, defsApi, out);
    return { state: state, unlocked: out };
  }

  function mastery(prev, achievementId, defsApi) {
    var state = clone(prev), out = [];
    _apply(state, defsApi.byId(achievementId), out);
    _reconcileRank(state, defsApi, out);
    return { state: state, unlocked: out };
  }

  // todayISO = 'YYYY-MM-DD' (local). Caller supplies it (keeps logic pure/testable).
  function _daysBetween(a, b) {
    var da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
    return Math.round((db - da) / 86400000);
  }
  function touchStreak(prev, todayISO, defsApi) {
    var state = clone(prev), out = [];
    var st = state.streak;
    if (st.last === todayISO) {
      // same day, no change
    } else if (st.last && _daysBetween(st.last, todayISO) === 1) {
      st.current += 1;
    } else {
      st.current = 1;
    }
    st.last = todayISO;
    if (st.current > st.best) st.best = st.current;
    defsApi.VB_ACHIEVEMENTS.forEach(function (def) {
      if (def.type === 'streak' && st.current >= def.days) _apply(state, def, out);
    });
    _reconcileRank(state, defsApi, out);
    return { state: state, unlocked: out };
  }

  var API = {
    emptyState: emptyState, rankForXp: rankForXp,
    firstPlay: firstPlay, record: record, mastery: mastery, touchStreak: touchStreak
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else (typeof self !== 'undefined' ? self : this).vbLogic = API;
})();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/achievement-logic.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Run the whole suite**

Run: `node --test tests/`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add js/achievement-logic.js tests/achievement-logic.test.js
git commit -m "feat: achievement logic engine (TDD)"
```

---

## Phase 5 — Browser glue

### Task 5: `js/progress.js`

**Files:**
- Create: `js/progress.js`

Depends (load order in pages): `tiers.js`, `profiles.js`, `app.js`, `achievement-defs.js`,
`achievement-logic.js`, `ribbon.js`, `celebrate.js`, then `progress.js`.

- [ ] **Step 1: Create `js/progress.js`**

```js
/* js/progress.js — window.vbProgress. Bridges activities to the logic engine,
   persists to the active profile, fires celebrations. Safe no-op if no profile. */
(function () {
  'use strict';

  function defsApi() { return (window.vbDefs) || null; }
  function logic()   { return (window.vbLogic) || null; }

  function load() {
    var p = (typeof getActiveProfile === 'function') ? getActiveProfile() : null;
    if (!p) return null;
    var L = logic();
    var state = p.achievements && p.achievements.unlocked
      ? p.achievements
      : (L ? L.emptyState() : null);
    return { profile: p, state: state };
  }

  function persist(profileId, state, unlocked) {
    // stamp unlock times on the newly unlocked defs
    var now = Date.now();
    (unlocked || []).forEach(function (d) {
      if (state.unlocked[d.id] && !state.unlocked[d.id].at) state.unlocked[d.id].at = now;
    });
    if (typeof updateProfile === 'function') updateProfile(profileId, { achievements: state });
  }

  function celebrate(unlocked) {
    if (unlocked && unlocked.length && window.vbCelebrate) window.vbCelebrate.show(unlocked);
  }

  function run(fnName, args) {
    var ctx = load(), L = logic(), D = defsApi();
    if (!ctx || !ctx.state || !L || !D) return;
    var res = L[fnName].apply(null, [ctx.state].concat(args, [D]));
    if (res.unlocked.length) {
      persist(ctx.profile.id, res.state, res.unlocked);
      celebrate(res.unlocked);
    } else {
      // still persist counter/streak progress even with no unlock
      persist(ctx.profile.id, res.state, []);
    }
  }

  function todayISO() {
    var d = new Date(), m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  window.vbProgress = {
    firstPlay: function (activityId) { run('firstPlay', [activityId]); },
    record:    function (counterKey, amount) { run('record', [counterKey, amount == null ? 1 : amount]); },
    mastery:   function (achievementId) { run('mastery', [achievementId]); },
    touchStreak: function () { run('touchStreak', [todayISO()]); },
    getState:  function () { var c = load(); return c ? c.state : null; }
  };
})();
```

- [ ] **Step 2: Commit**

```bash
git add js/progress.js
git commit -m "feat: vbProgress browser glue (persist + celebrate)"
```

---

## Phase 6 — Wire 2-3 activities end to end

Shared include block to insert into each activity page, **after** `<script src="../js/game-settings.js"></script>` (and after `app.js`):

```html
  <link rel="stylesheet" href="../css/achievements.css">
  <script src="../js/achievement-defs.js"></script>
  <script src="../js/achievement-logic.js"></script>
  <script src="../js/ribbon.js"></script>
  <script src="../js/celebrate.js"></script>
  <script src="../js/progress.js"></script>
```

(The `<link>` goes in `<head>`; the five `<script>`s go with the other script tags before the page's own inline IIFE.)

### Task 6a: Instrument `games/tap-pop.html`

**Files:**
- Modify: `games/tap-pop.html`

- [ ] **Step 1: Add the achievements include block** (head `<link>` + five scripts before the inline IIFE).

- [ ] **Step 2: Add firstPlay + streak on init.** Inside the IIFE, right after `gameSettings.attach('tap-pop');` (line ~34), add:

```js
    if (window.vbProgress) { vbProgress.firstPlay('tap-pop'); vbProgress.touchStreak(); }
```

- [ ] **Step 3: Record on each pop.** In `popBubble(b)`, right after `playPop();` (line ~161), add:

```js
      if (window.vbProgress) vbProgress.record('tap-pop');
```

- [ ] **Step 4: Manual verify.** Serve the app, open Tap & Pop with a profile active. Pop 5 bubbles → Bronze celebration fires. Reload → no re-fire. Confirm in DevTools: `JSON.parse(localStorage.vb_profiles)` shows `achievements.counters['tap-pop'] >= 5` and `unlocked['tap-pop.milestone.bronze']`.

- [ ] **Step 5: Commit**

```bash
git add games/tap-pop.html
git commit -m "feat: instrument Tap & Pop with achievements"
```

### Task 6b: Instrument `learning/count-along.html`

**Files:**
- Modify: `learning/count-along.html`

- [ ] **Step 1:** Add the include block.
- [ ] **Step 2:** After the activity's `gameSettings.attach('count-along');`, add the firstPlay + touchStreak line (counter key `'count-along'`).
- [ ] **Step 3: Read the file first** to find the success point (where a count is completed / `playSuccess` or `playChime` fires on a correct count). Add `if (window.vbProgress) vbProgress.record('count-along');` there. If a "how-many quiz" correct-answer branch exists (quizMode), add `if (window.vbProgress) vbProgress.mastery('count-along.mastery');` in that branch.
- [ ] **Step 4: Manual verify** count to 5 → Bronze fires.
- [ ] **Step 5: Commit** `git commit -m "feat: instrument Count Along with achievements"`.

### Task 6c: Instrument `learning/math.html`

**Files:**
- Modify: `learning/math.html`

- [ ] **Step 1:** Add the include block.
- [ ] **Step 2:** After `gameSettings.attach('math');` (line ~66) add firstPlay + touchStreak for `'math'`.
- [ ] **Step 3:** In the correct-answer branch (line ~156-160, `if (n === ans) {`), after `playSuccess();` add:

```js
            if (window.vbProgress) {
              vbProgress.record('math');
              if (op === '−') vbProgress.mastery('math.mastery');
            }
```

- [ ] **Step 4: Manual verify** solve 5 problems → Bronze; solve a subtraction → Math Master.
- [ ] **Step 5: Commit** `git commit -m "feat: instrument Math Mountain with achievements"`.

**CHECKPOINT:** Stop after 6c. Demo earning a real ribbon to Scott and confirm sync (sign into cloud on a 2nd device/profile, verify the ribbon appears) before mass instrumentation.

---

## Phase 7 — Gallery page

### Task 7: `achievements.html`

**Files:**
- Create: `achievements.html`

- [ ] **Step 1: Create `achievements.html`** (repo root). It loads the same stack, reads `vbProgress.getState()`, and renders rank banner + grouped grid (earned colour / locked greyscale + hint).

```html
<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>My Ribbons</title>
<link rel="stylesheet" href="css/style.css">
<link rel="stylesheet" href="css/achievements.css">
</head>
<body class="section-learn">
  <div class="gallery-screen">
    <div class="rank-banner" id="rankBanner"></div>
    <div id="groups" style="width:100%;display:flex;flex-direction:column;align-items:center;gap:26px;"></div>
  </div>
  <script src="js/atmosphere.js"></script>
  <script src="js/tiers.js"></script>
  <script src="js/profiles.js"></script>
  <script src="js/voice-manifest.js"></script>
  <script src="js/app.js"></script>
  <script src="js/yoto-player.js"></script>
  <script src="js/achievement-defs.js"></script>
  <script src="js/achievement-logic.js"></script>
  <script src="js/ribbon.js"></script>
  <script src="js/celebrate.js"></script>
  <script src="js/progress.js"></script>
  <script>
    renderBackBtn('learning/index.html');
    var profile = getActiveProfile();
    if (!profile) goProfiles();
    var state = (window.vbProgress && vbProgress.getState()) || vbLogic.emptyState();
    var ranks = vbDefs.VB_RANKS;
    var cur = vbLogic.rankForXp(state.xp, ranks);
    var idx = ranks.indexOf(cur);
    var nextR = ranks[idx + 1] || null;

    // Rank banner + XP progress to next rank
    var banner = document.getElementById('rankBanner');
    var nm = document.createElement('div'); nm.className = 'rank-name';
    nm.textContent = cur.label; banner.appendChild(nm);
    var sub = document.createElement('div'); sub.style.color = 'var(--text-soft)';
    sub.textContent = state.xp + ' XP' + (nextR ? '  ·  next: ' + nextR.label + ' at ' + nextR.minXp : '  ·  max rank!');
    banner.appendChild(sub);
    var track = document.createElement('div'); track.className = 'rank-xp-track';
    var fill = document.createElement('div'); fill.className = 'rank-xp-fill';
    var lo = cur.minXp, hi = nextR ? nextR.minXp : cur.minXp + 1;
    fill.style.width = Math.max(4, Math.min(100, ((state.xp - lo) / (hi - lo)) * 100)) + '%';
    track.appendChild(fill); banner.appendChild(track);

    // Group ribbons by activity (using ACTIVITIES order), then streak + rank
    var groupsEl = document.getElementById('groups');
    function group(title, icon, defs) {
      if (!defs.length) return;
      var g = document.createElement('div'); g.className = 'gallery-group';
      var h = document.createElement('h2'); h.textContent = (icon ? icon + ' ' : '') + title; g.appendChild(h);
      var grid = document.createElement('div'); grid.className = 'gallery-grid';
      defs.forEach(function (d) {
        var earned = !!state.unlocked[d.id];
        var cell = document.createElement('div'); cell.className = 'gallery-cell';
        cell.appendChild(renderRibbon(d, { earned: earned, size: 86 }));
        var lbl = document.createElement('div'); lbl.className = 'cell-label'; lbl.textContent = d.title;
        cell.appendChild(lbl);
        if (!earned) { var hint = document.createElement('div'); hint.className = 'cell-hint'; hint.textContent = d.hint; cell.appendChild(hint); }
        grid.appendChild(cell);
      });
      g.appendChild(grid); groupsEl.appendChild(g);
    }
    vbDefs.ACTIVITIES.forEach(function (a) { group(a.name, a.icon, vbDefs.byActivity(a.id)); });
    group('Streaks', '🔥', vbDefs.VB_ACHIEVEMENTS.filter(function (d) { return d.type === 'streak'; }));
    group('Ranks', '👑', vbDefs.VB_ACHIEVEMENTS.filter(function (d) { return d.type === 'rank'; }));
  </script>
</body></html>
```

- [ ] **Step 2: Manual verify** open `achievements.html` with a profile that has earned ribbons → earned in colour, locked greyscale with hints, rank banner + XP bar correct.

- [ ] **Step 3: Commit** `git add achievements.html && git commit -m "feat: achievements gallery page"`.

---

## Phase 8 — Ribbon shelf on the Learn screen

### Task 8: shelf in `learning/index.html`

**Files:**
- Modify: `learning/index.html`

- [ ] **Step 1: Add includes** — in `<head>` add `<link rel="stylesheet" href="../css/achievements.css">`; before the inline script add the five achievement scripts (defs, logic, ribbon, celebrate, progress).

- [ ] **Step 2: Add the shelf container + trophy link.** Inside `.hub-screen`, after the `cards-row` div, add nothing (shelf is fixed); instead append a shelf at body level via script. After the existing card-render block, add:

```js
    // Ribbon shelf — earned ribbons pinned along the bottom, tap to open gallery
    (function renderShelf() {
      if (!window.vbProgress || !window.vbDefs) return;
      var state = vbProgress.getState(); if (!state) return;
      var shelf = document.createElement('div'); shelf.className = 'ribbon-shelf';
      shelf.setAttribute('role', 'button');
      shelf.setAttribute('aria-label', 'Open my ribbons');
      shelf.onclick = function () { playChime(); goTo('../achievements.html'); };
      var earned = vbDefs.VB_ACHIEVEMENTS.filter(function (d) { return state.unlocked[d.id]; });
      if (!earned.length) {
        shelf.classList.add('empty');
        shelf.textContent = '🎀 Play to earn ribbons!';
      } else {
        earned.slice(0, 24).forEach(function (d) { shelf.appendChild(renderRibbon(d, { earned: true, size: 56 })); });
      }
      document.body.appendChild(shelf);
    })();
```

- [ ] **Step 3: Ensure cards sit above the shelf.** Confirm `.cards-row`/`.hub-screen` content has higher stacking than `.ribbon-shelf` (shelf is `z-index:0`, opacity 0.5). The `.hub-screen` already scrolls with bottom padding 220px so the shelf won't cover cards. Verify on a narrow viewport.

- [ ] **Step 4: Manual verify** Learn screen shows the shelf with earned ribbons (or the empty prompt); tapping opens the gallery; cards remain readable (contrast OK over the dimmed shelf).

- [ ] **Step 5: Commit** `git add learning/index.html && git commit -m "feat: ribbon shelf on Learn screen"`.

---

## Phase 9 — Instrument the remaining 13 activities

For each activity below: add the include block, add `firstPlay(id)` + `touchStreak()` after
`gameSettings.attach(...)`, add `record(counter)` at the success point, and `mastery(id)`
in the hardest-mode branch where listed. **Read each file first** to locate the exact
success handler (the line that calls `playSuccess()`/`playChime()`/`playPop()` on a correct
or completed action). Commit per activity.

| Task | File | counter id | record() success point | mastery() trigger |
|---|---|---|---|---|
| 9a | `games/shape-match.html` | `shape-match` | matched branch (after `playSuccess()` ~line 242) AND tap-reveal (after `playChime()` ~line 128) | `if (count === 6) vbProgress.mastery('shape-match.mastery')` after a full 6-shape round completes |
| 9b | `games/peek-a-boo.html` | `peek-a-boo` | on each successful reveal | — |
| 9c | `learning/hello-colors.html` | `hello-colors` | on each color named/correct | color-quiz correct → `hello-colors.mastery` |
| 9d | `learning/animal-sounds.html` | `animal-sounds` | on each animal shown/correct | sound-quiz correct → `animal-sounds.mastery` |
| 9e | `learning/abcs.html` | `abcs` | on each letter completed | spell-a-word success → `abcs.mastery` |
| 9f | `learning/days.html` | `days` | on each day correct | quiz correct → `days.mastery` |
| 9g | `learning/spelling.html` | `spelling` | on each word spelled | letter-bank spell success → `spelling.mastery` |
| 9h | `learning/money.html` | `money` | on each coin identified | count-total success → `money.mastery` |
| 9i | `learning/body-parts.html` | `body-parts` | on each part named | extra-part named → `body-parts.mastery` |
| 9j | `art/stamp-art.html` | `stamp-art` | on each stamp placed | — |
| 9k | `art/finger-paint.html` | `finger-paint` | on pointer-up after a stroke (one record per completed stroke, not per move) | — |
| 9l | `art/color-splash.html` | `color-splash` | on each splash/tap | — |
| 9m | `art/color-in.html` | `color-in` | on each region filled | — |

For each: **Step 1** add includes; **Step 2** firstPlay+touchStreak; **Step 3** record (+mastery); **Step 4** manual verify Bronze fires at 5; **Step 5** commit `feat: instrument <name> with achievements`.

> Note for art (9j-9m): keep `record()` on a *completed creative act* (a placed stamp, a finished stroke on pointer-up, a filled region), never inside a `pointermove`/animation loop, to avoid counter inflation (spec §9.3).

---

## Phase 10 — Visual overhaul

### Task 10a: Atmosphere on every activity

**Files:** all 16 activity pages.

- [ ] **Step 1:** Add `<script src="../js/atmosphere.js"></script>` to each activity page's script list (root pages use `js/atmosphere.js`).
- [ ] **Step 2:** Each activity currently sets a flat `body { background: linear-gradient(...) }`. Add a CSS rule so the atmosphere sits behind content and the flat gradient becomes a dimmed base. In `css/achievements.css` (already linked) add:

```css
/* dim the living sky behind active play so it doesn't distract */
#vbSky { opacity: 0.4; }
body.section-learn #vbSky,
body.section-games #vbSky { opacity: 0.45; }
```

- [ ] **Step 3:** Add the appropriate `class="section-games"` / `section-learn` / `section-art` to each activity `<body>` (matches the menu convention) so per-section dimming/tints apply.
- [ ] **Step 4: Manual verify** each section shows the living sky, dimmed, content readable.
- [ ] **Step 5: Commit** `feat: living-sky background on all activities`.

### Task 10b: Drag-and-drop glow-up (Shape Match + Spelling/Days/Math drag screens)

**Files:** `games/shape-match.html` (+ any learning page using a drag-to-target pattern).

- [ ] **Step 1:** Give draggable shapes physical depth — in shape-match `<style>`, add to `svg.shape`:

```css
    svg.shape { filter: drop-shadow(0 6px 10px rgba(0,0,0,0.35)); transition: transform 120ms cubic-bezier(0.22,1,0.36,1); }
    svg.shape.lifted { transform: scale(1.08); filter: drop-shadow(0 14px 22px rgba(0,0,0,0.45)); }
    .target { transition: box-shadow 160ms ease, transform 160ms ease; }
    .target.near { box-shadow: 0 0 0 6px color-mix(in srgb, currentColor 45%, transparent); transform: scale(1.06); }
    @keyframes targetBreathe { 0%,100%{ transform:scale(1) } 50%{ transform:scale(1.04) } }
    .target:not(.matched) { animation: targetBreathe 2.4s ease-in-out infinite; }
    @media (prefers-reduced-motion: reduce) { .target:not(.matched){ animation:none } svg.shape{ transition:none } }
```

- [ ] **Step 2:** In the `pointerdown` handler add `svg.classList.add('lifted')`; in `pointerup` remove it.
- [ ] **Step 3:** In `pointermove`, compute distance to the matching target; toggle `target.classList.toggle('near', within ~80px)` (magnetic affordance).
- [ ] **Step 4:** On a correct drop, before hiding the shape, spawn a particle burst. Reuse the existing `colorBurst(ctx,...)` pattern from `app.js` if a canvas is available, or append a short-lived CSS sparkle element. (Check `app.js` for `colorBurst`/`confetti` helpers first; prefer reuse — DRY.)
- [ ] **Step 5: Manual verify** pickup lifts, target glows when near, match bursts; reduced-motion calm.
- [ ] **Step 6: Commit** `feat: tactile drag-and-drop in Shape Match`.

### Task 10c: Shared polish (vignette + entrance motion)

**Files:** `css/achievements.css` (or `css/style.css` if that's where shared lives — check first).

- [ ] **Step 1:** Add a global vignette + content entrance:

```css
.vb-vignette::after {
  content:''; position:fixed; inset:0; pointer-events:none; z-index:1;
  box-shadow: inset 0 0 180px 40px rgba(0,0,0,0.28);
}
.screen, .hub-screen, .gallery-screen { animation: vbRise 420ms cubic-bezier(0.22,1,0.36,1) both; }
@keyframes vbRise { from{ opacity:0; transform:translateY(14px) } to{ opacity:1; transform:none } }
@media (prefers-reduced-motion: reduce) {
  .screen,.hub-screen,.gallery-screen{ animation:none }
}
```

- [ ] **Step 2:** Add `vb-vignette` class to activity `<body>` tags (or apply the `::after` to `body`).
- [ ] **Step 3: Manual verify** subtle vignette, content rises in on load, reduced-motion static.
- [ ] **Step 4: Commit** `feat: shared vignette + entrance motion`.

---

## Self-Review (completed during planning)

**Spec coverage:**
- §3 achievement types → Tasks 3 (defs build first/milestone/mastery/streak/rank), 4 (logic).
- §4 data model → Task 4 `emptyState` + Task 5 persistence via `updateProfile` (auto-sync). ✓
- §5.1–5.4 components → Tasks 1,2,3,4,5. ✓
- §5.5 shelf → Task 8. §5.6 gallery → Task 7. §5.7 instrumentation → Tasks 6,9. ✓
- §6 visual overhaul → Task 10a/b/c. ✓
- §8 testing → Tasks 3,4 (unit), per-task manual verifies. ✓
- §9 edge cases → no-profile no-op (Task 5 `load()` guard); multi-unlock queue (Task 2); counter-inflation note (Task 9 art note); art-no-correct (defs `mastery:null`). ✓

**Placeholder scan:** instrumentation tasks 9/6b say "read the file first" with an exact call to add — this is a real instruction (the success line varies per file), not a placeholder; the call text, counter id, and mastery id are all given explicitly.

**Type consistency:** `vbProgress.record/firstPlay/mastery/touchStreak/getState`, `vbDefs.{VB_ACHIEVEMENTS,VB_RANKS,ACTIVITIES,byCounter,byId,byActivity}`, `vbLogic.{emptyState,rankForXp,firstPlay,record,mastery,touchStreak}`, `renderRibbon(def,opts)`, `vbCelebrate.show()` — names consistent across Tasks 3–9. State shape `{unlocked,counters,streak,xp,rank}` consistent in Tasks 4,5,7,8.
