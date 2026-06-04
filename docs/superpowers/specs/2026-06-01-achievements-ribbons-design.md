# Achievements & Ribbons — Design Spec

**Date:** 2026-06-01
**Status:** Approved (design), pending spec review
**Scope:** One mega-build — an achievement/ribbon system across all 16 activities (games, learning, art; **not** videos), plus the visual overhaul of activity backgrounds.

---

## 1. Goal

When a child reaches a milestone in any activity, they earn a **ribbon**. Ribbons are
celebrated the moment they're earned, pinned to a **shelf on the Learn screen
background**, and reviewable in a **scrollable gallery**. An overall **rank** climbs as
ribbons accumulate. Everything is per-child and syncs across devices using the existing
cloud-sync path.

Non-goals: leaderboards, child-vs-child comparison, server-side logic, achievements for
the Videos/TV section.

---

## 2. Kid-facing behavior

1. Mid-activity unlock: a ribbon flies onto the screen, sparkles, a voice announces it
   ("You earned the Counting Star!"), then play resumes. Reduced-motion: gentle fade + chime.
2. Learn screen: earned ribbons sit on a dimmed **shelf/wall behind the activity cards**;
   the wall fills as more are earned. Tapping it (or a trophy button) opens the gallery.
3. Gallery (`achievements.html`): scrollable, grouped by activity. Earned = full colour;
   locked = greyed silhouette + a short kid-friendly hint ("Count 50 things!"). A rank badge
   and XP progress sit at the top.

---

## 3. Achievement types

1. **First-play** — 1 per activity (16 total). Earned on first open of that activity.
2. **Milestone** — six tiers per activity, on a cumulative counter, at
   **5 / 10 / 25 / 50 / 75 / 100** (correct or created):
   Bronze / Silver / Gold / Sapphire / Ruby / Diamond.
3. **Mastery** — clear the hardest mode of an activity (where one exists).
4. **Streak** — play on 3 / 7 distinct calendar days in a row.
5. **Rank** — XP from every ribbon rolls into an overall rank; crossing a threshold awards a
   special rank ribbon and a bigger celebration.

**XP values:** first-play 1; milestone bronze 1 / silver 2 / gold 3 / sapphire 5 /
ruby 7 / diamond 10; mastery 8; streak-3 3; streak-7 6.

**Rank ladder (7 ranks, cumulative XP):** Sprout 0 · Explorer 15 · Star 40 ·
Super Star 80 · Champion 140 · Hero 220 · Legend 320. (Thresholds tunable in the data file.)

Estimated total: ~150–180 ribbons (six milestone tiers × 16 activities + first-play,
mastery, streak, rank).

---

## 4. Data model

New optional field on each profile object (in `vb_profiles` localStorage; auto-synced via
`saveProfiles` → `cloudSync.onLocalChange`):

```js
profile.achievements = {
  unlocked: {                       // earned ribbons
    'count-along.first': { at: 1717200000000 },
    'count-along.milestone.silver': { at: 1717300000000 }
  },
  counters: {                       // cumulative progress
    'count-along': 38,
    'tap-pop': 142
  },
  streak: { last: '2026-06-01', current: 3, best: 5 },  // 'YYYY-MM-DD' local
  xp: 24,
  rank: 'star'                      // derived from xp, cached for display
};
```

- Backward compatible: a profile without `achievements` is treated as empty.
- Counters are keyed by activity id; some activities may use sub-keys
  (e.g. `math.add`, `math.sub`) where it matters for mastery.
- Writes go through a single `updateProfile(id, { achievements })` call so sync fires once.

---

## 5. Components

### 5.1 `js/achievements.js` — definitions (data only)
Exports `VB_ACHIEVEMENTS`: an array (or map) of definitions. Each:

```js
{
  id: 'count-along.milestone.silver',
  activity: 'count-along',
  type: 'milestone',            // first | milestone | mastery | streak | rank
  tier: 'silver',               // for milestone/rank styling
  title: 'Counting Star',
  hint: 'Count 50 things',
  icon: '🔢',                   // center glyph (defaults to activity icon)
  xp: 3,
  // trigger metadata, read by the engine:
  counter: 'count-along', threshold: 50
}
```

Also exports `VB_RANKS` (ordered list with `id`, `label`, `minXp`, `color`).
This file is the single source of truth; everything else is generic over it.

### 5.2 `js/progress.js` — the engine
Exposes `window.vbProgress` with:

- `firstPlay(activityId)` — unlock the first-play ribbon if new.
- `record(counterKey, amount = 1)` — increment a counter, check all milestone defs bound to
  that key, unlock any newly crossed.
- `mastery(achievementId)` — unlock a specific mastery ribbon.
- `touchStreak()` — update streak based on today's local date; unlock streak ribbons.
- Internal `_unlock(def)` — idempotent; on a genuinely new unlock: add to `unlocked`, add XP,
  recompute rank (award rank ribbon if it changed), persist once, fire celebration callback.
- `getState()` / helpers for the gallery and shelf to read earned/locked + progress.

Engine is pure logic + persistence; it knows nothing about DOM beyond invoking the
celebration hook. Persistence via `updateProfile`. Guards against double-fire and missing
profile.

### 5.3 `js/ribbon.js` — rendering
`renderRibbon(def, { earned, size })` returns an SVG element: a rosette medal (circle +
two hanging tails), colour by `tier`/`type`, the `icon` glyph centered. Earned = full
colour; `earned:false` = greyscale silhouette. Pure, no side effects. Used by celebration,
shelf, and gallery so the look is identical everywhere.

### 5.4 Celebration overlay
A function (in `progress.js` or a small `js/celebrate.js`) that, on unlock, overlays the
ribbon flying in + sparkle, speaks the title via existing `speak()`, plays `playSuccess()`.
Queues if multiple unlock at once. Reduced-motion (`prefers-reduced-motion`) → fade + chime,
no fly-in. Auto-dismiss after a beat; never blocks the activity.

### 5.5 Ribbon shelf — `learning/index.html`
A layer behind `.cards-row`: earned ribbons laid out in rows on a subtle wooden/“shelf”
band, dimmed (~opacity 0.5) so cards stay readable and pass contrast. Empty state: a faint
"Play to earn ribbons!" prompt. The shelf is tappable → `achievements.html`.

### 5.6 Gallery — `achievements.html` (new)
Standalone page reachable from the Learn screen (and optionally home). Top: rank badge + XP
progress to next rank. Body: ribbons grouped by activity, earned in colour, locked as greyed
silhouette + hint text. Scrollable, uses the existing style system + `atmosphere.js`
background. Back button to Learn.

### 5.7 Instrumentation
Each activity page loads `tiers.js`, `profiles.js`, `achievements.js`, `progress.js`, then
calls the engine at the right success points. Map:

| Activity | Section | Counter (record) | Mastery trigger |
|---|---|---|---|
| tap-pop | games | bubbles popped | — |
| shape-match | games | shapes matched | complete a 6-shape drag round |
| peek-a-boo | games | reveals | — |
| hello-colors | learn | colors correct | clear color-quiz mode |
| animal-sounds | learn | animals correct | clear sound-quiz mode |
| count-along | learn | items counted | clear how-many quiz |
| abcs | learn | letters done | spell a short word |
| days | learn | days correct | clear quiz mode |
| math | learn | problems solved | solve with subtraction on |
| spelling | learn | words spelled | spell from letter bank |
| money | learn | coins identified | count a coin+bill total |
| body-parts | learn | parts named | name an extra part |
| stamp-art | art | stamps placed | — (creation milestones only) |
| finger-paint | art | strokes painted | — |
| color-splash | art | splashes made | — |
| color-in | art | areas filled | — |

All 16 also get `firstPlay(id)` on load and `touchStreak()` once per session. The six
milestone thresholds (5/10/25/50/75/100) live in `achievements.js` and are tuned per
activity (art uses creation counts, not correctness).

---

## 6. Visual overhaul (bundled)

1. Load `atmosphere.js` (dimmed) on every activity page so the living sky sits behind play.
2. Drag-and-drop glow-up on Shape Match + the Spelling/Days/Math drag screens: physical-feel
   shapes (soft shadow + light gradient), lift-on-pickup, magnetic snap with target glow,
   particle reward on match, drag trail.
3. Per-area background character (games = sky, learn = subject tint + themed floaters,
   art = paper-on-easel surface).
4. Shared polish: soft vignette + grain, content entrance motion.
5. Reduced-motion fallback for every new animation.

---

## 7. Build order (checkpoints)

1. **Ribbon look** — build `ribbon.js` + celebration; screenshot one ribbon for sign-off
   before mass-producing definitions.
2. **Engine + data** — `achievements.js` + `progress.js` with unit tests (unlock logic,
   idempotency, counters, streak rollover, rank thresholds).
3. **Wire 2–3 activities** end-to-end; manually earn a real ribbon and confirm sync.
4. **Gallery + shelf.**
5. **Roll `vbProgress` into the remaining activities.**
6. **Visual overhaul pass.**

Each step is committed and verifiable on the dev server before the next.

---

## 8. Testing

- **Unit (engine):** first-play once only; counter crossing unlocks exactly the right tier;
  re-crossing doesn't re-unlock; streak increments on consecutive days, resets on a gap,
  same-day no double count; XP sums; rank flips at thresholds and awards its ribbon once.
- **Manual:** earn a ribbon in an activity → celebration fires → appears on shelf → appears
  earned in gallery → survives reload → syncs to a second profile/device.
- **Reduced-motion:** celebration degrades to fade+chime.
- **Accessibility:** shelf dimming keeps card text ≥ contrast; gallery hints readable;
  ribbons have `aria-label`s; locked silhouettes announced as locked.

---

## 9. Edge cases & risks

1. **No active profile** — engine no-ops gracefully (activities already redirect to profiles).
2. **Multiple unlocks at once** (e.g. milestone + rank) — celebration queue, not overlap.
3. **Counter inflation** — record() only at genuine success points, not on every render/tick.
4. **Sync conflicts** — achievements merge with the profile; rely on existing
   last-write-wins. Counters could regress on a stale overwrite; acceptable for v1, noted.
5. **Art has no "correct"** — use creation counts; keep thresholds gentle so it stays fun,
   not grindy.
6. **Scope size** — ~100 ribbons + touching all 16 pages. The phased order keeps each step
   shippable and reviewable; a stall mid-build still leaves earlier phases working.
