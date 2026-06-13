# Handoff — 2026-06-13 — Noah-tier UX review (in progress) + 3 fixes shipped

## ▶ START HERE
Scott kicked off the full hands-on UX review (see `2026-06-13-handoff-v109-full-ux-review.md`
for the method/checklist). Mid-review he scoped it: **do Noah's tier FIRST, then the rest.**
Noah = born **2024-07-11** → **23 months → Tier 2 "Explore" (1–2 yr)**. Noah also plays
older-kid games, so toddler-safety applies even on higher-tier activities.

Continue the deep, first-person, play-every-screen review (NO agents). Same 5-step method:
play for real → screenshot + look → trace voice vs correct answer → toddler lens → parent lens.

## Shipped LIVE today (kids.simplyknown.co)
1. **v110** — reliable cross-device sync (merge-best on open, flush-push on close, "Sync now" button). See [[cross-device-sync]].
2. **v111** — Stamp Art scene switcher no longer needs endless scrolling. Scenes = always-visible
   top pill (tablet/desktop) or bottom-dock row (phone); stamp rail wraps into columns; restored the
   wiped in-game ⚙️ gear. Verified at 390×844 / 1024×768 / 1440×900.
3. **v112** — **Hold-to-open Parent Settings** (toddler guard). Chooser "⚙️ Grown-ups" gear + the
   in-game ⚙️ gear now need a ~0.7s press (fill-ring animation) via new `holdToActivate()` in
   `js/app.js`. **Game Back/Home stay INSTANT on purpose** (Scott's explicit call — do NOT add
   hold-to-exit to games). Verified: tap ignored, hold opens.
4. **v113** — **Shape Match is tap-to-name for toddlers** (T1-T2), drag from T3+. Drag-and-drop is
   ~3yr+ motor skill but was on from tier 2 (Noah, 23mo). `games/shape-match.html` line ~75
   `dragOn = tier >= 3 || feature`. Verified: T2 → tap (1 shape, no boxes); T4 → drag (boxes) intact.

Next version bump = **vb-v114** (`sw.js` line 1).

## Noah-tier (T2) review — status so far
Confirmed GOOD for a toddler (big targets, simple, auto-cycle, voiced):
- `games/tap-pop.html` — huge bubbles. (Minor: bubbles can spawn under the Back/Home buttons →
  tapping one = accidental exit. Low severity; note only.)
- `games/peek-a-boo.html` — auto-cycles at ≤T2, big animal reveal + label. Good. (Image is smallish
  vs the empty screen — could be bigger/more engaging, not a bug.)
- `art/color-splash.html` — simple splat, big targets. Good.
- `art/stamp-art.html` — fixed in v111.
- `games/shape-match.html` — fixed in v113 (now tap mode at T2).
- `learning/animal-sounds.html` — VOICE/IMAGE VERIFIED GOOD: all 30 manifest animals have a correct
  emoji (no 🐾 fallbacks) and tap plays "The <name> says," + `audio/sounds/<id>.mp3` (its real sound,
  e.g. cow→Moo). At T2 it's garden free-play (quiz is T4+). No fix needed. (Didn't byte-verify every
  sound FILE exists, but audio/ has 1565 files incl. sounds/ — low risk.)

## OPEN concrete findings (verify by playing before "fixing" — sweeps over-flag)
1. **finger-paint older-tier toolbar clip** (`art/finger-paint.html`): the `@media (landscape &
   min-width:768px)` rule makes the toolbar a right rail with `overflow:hidden`, `max-width:200px`,
   `height:100vh`. At tier ≥3 it holds 8 colors + eraser + Clear (~680px); on a SHORT landscape
   (e.g. 1024×600) that **clips the Clear button**. Not Noah's tier (T2 has no palette → no toolbar),
   but it's the same class of bug as stamp-art. Fix: wrap into columns like stamp-art's rail
   (`flex-wrap:wrap; align-content:flex-end; overflow-y:auto`). Check `art/color-splash.html` and
   `art/color-in.html` toolbars the same way at older tiers.
2. **Accidental game exit** (cross-cutting): Back/Home are instant taps. Scott decided NOT to gate
   game exits (only settings). Leave as-is unless he revisits.

## STILL TO REVIEW at T2 (then repeat key ones at older tiers)
- Games: magic-touch, tap-a-tune, surprise-pop, memory-match. (tap-pop ✓, peek-a-boo ✓, shape-match fixed)
- Learn (heaviest voice/image scrutiny): hello-colors, count-along, abcs, body-parts. (animal-sounds ✓)
  At T2 these are free-play/tap-to-hear (quiz modes are tier ≥4), so voice↔answer mismatch risk is
  lower, but VERIFY each tap speaks the right word + shows a sensible image. **body-parts** has a long
  tap-zone-drift history (per-kid configs) — re-verify the nose/ear zones if touched.
- Art: color-in (page-flip arrows layout), finger-paint (see finding #1).
- Then: older tiers (Noah plays them too), 16-mascot spot-check, captions, ribbons cadence.

## How to drive it (lessons from this session)
- Local server: `python -m http.server 8799` from worktree root. Playwright MCP for real clicks.
- Seed Noah: `localStorage.vb_profiles=[{id:'noah',name:'Noah',birthday:'2024-07-11',voice:'boy',
  mascot:{id:'dog'},tierOverrides:{},features:{},youtube:[]}]`, `vb_active_id='noah'`. He computes T2.
  Force a feature/tier with `tierOverrides[id]` / `features[id][key]=true`.
- **SERVICE WORKER STALENESS bit me repeatedly**: after editing a JS/HTML file, the page can load the
  OLD SW-cached copy. Fix during dev: in the page, `await caches.keys()`→delete all +
  `navigator.serviceWorker.getRegistrations()`→unregister, **then RE-NAVIGATE once more** (the first
  post-clear load can still be stale). Confirm with `typeof <newFn>` in-page + fetch the file with
  `?cb=` to compare served vs loaded.
- Screenshots to worktree root are gitignored ONLY for known prefixes (stamp-*, splash-*, paint-*,
  shape-*, animals-*, count-*, hello-colors-*, home-*, tap-pop-*, videos-*). Use one of those prefixes
  or `rm` your PNGs before committing. `.playwright-mcp/` is gitignored.
- Deploy = bump `sw.js` CACHE + commit + `git push origin HEAD:main` (this worktree branch is level
  with main). Verify: `curl -s "https://kids.simplyknown.co/sw.js?cb=$(date +%s)" | head -c 30`.
- e2e runner (`tests/e2e/run-e2e.mjs`) needs the `playwright` npm package, which is NOT installed in
  this worktree → use Playwright MCP instead, or `npm i` first.

## Suggested next order
1. Finish T2 games (magic-touch → memory-match), then T2 learn (voice/image), then T2 art.
2. Fix finding #1 (finger-paint/color toolbars) — quick, same pattern as stamp-art.
3. Older-tier pass for the games Noah also plays.
4. Batch fixes into vb-v113; ship; verify live.
