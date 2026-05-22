# Pass 1 Round B — End-to-End UI Audit Results

## Executive Summary

- **Total cells tested:** 120 (15 activities × 2 tiers × 4 viewports)
- **Cells with UI bugs:** 3
- **Console errors (non-favicon):** 0
- **Note:** Every page emits a benign `favicon.ico` 404 — filtered out as non-UI noise.

### Top 5 most severe bugs (only 3 found; all stamp-art)

1. **stamp-art phone-landscape t8 (844x390)** — entire right palette + scene strip cut off. stamp-chip ☀️ at l=870; scene-sep at l=986; scene-label at l=1008; scene-chips ✨ 🏡 🌊 at l=1069. Scenes unreachable without horizontal scroll.
2. **stamp-art tablet-landscape t8 (1280x800)** — scene chips (✨ 🏡 🌊 🚀) at l=1285 on vp 1280. Scene-selector strip clipped by ~5px on right.
3. **stamp-art phone-landscape t1 (844x390)** — stamp-chip ☀️ at l=870 on vp 844. Rightmost stamp tile cut off.
4. (none)
5. (none)

Affected screenshots:
- `tests/audit/pass1-roundB/phone-landscape-stamp-art-t1.png`
- `tests/audit/pass1-roundB/phone-landscape-stamp-art-t8.png`
- `tests/audit/pass1-roundB/tablet-landscape-stamp-art-t8.png`

---

## tap-pop
All 8 cells (t1+t8 × 4 viewports) — clean. Screenshots: `tests/audit/pass1-roundB/{viewport}-tap-pop-{t1,t8}.png`

## shape-match
All 8 cells — clean.

## hello-colors
All 8 cells — clean.

## animal-sounds
All 8 cells — clean.

## count-along
All 8 cells — clean.

## abcs
All 8 cells — clean.

## days
All 8 cells — clean.

## math
All 8 cells — clean.

## spelling
All 8 cells — clean.

## money
All 8 cells — clean.

## body-parts
All 8 cells — clean.

## stamp-art
- phone-portrait t1 — clean
- **phone-landscape t1** — Overflow: 1. Bug: stamp-chip ☀️ at l=870 overflows vp.w=844 (rightmost palette tile cut off, not in scrollable container).
- tablet-portrait t1 — clean
- tablet-landscape t1 — clean
- phone-portrait t8 — clean
- **phone-landscape t8** — Overflow: 6. Bug: entire right palette + scene selector strip off-screen (stamp ☀️ at l=870; scene-sep at l=986; scene-label at l=1008; scene-chips ✨ 🏡 🌊 at l=1069). Scenes unreachable.
- tablet-portrait t8 — clean
- **tablet-landscape t8** — Overflow: 4. Bug: scene-chips (✨ 🏡 🌊 🚀) at l=1285 overflow vp.w=1280 by ~5px (scene picker clipped).

## finger-paint
All 8 cells — clean.

## color-splash
All 8 cells — clean.

## color-in
All 8 cells — clean.

---

## Recommendation
All bugs are in stamp-art, concentrated in **landscape viewports**. The fixed-width side palette + scene strip overflows when viewport height (which constrains aspect) collapses available width. Suggest: make the right palette/scene rail horizontally scrollable, or convert it to a bottom-overlay strip below the canvas in landscape mode (matches existing bottom-strip pattern used elsewhere).
