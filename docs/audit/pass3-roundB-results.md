# Pass 3 Round B — Viewport Audit Results

## Executive Summary

- **Total cells tested:** 120 (4 viewports x 15 activities x 2 tiers)
- **Viewports:**
  - `pl` phone-landscape 844x390
  - `pp` phone-portrait 390x844
  - `tp` tablet-portrait 800x1280
  - `tl` tablet-landscape 1280x800
- **Tiers tested:** test-1 (t1) and test-8 (t8)
- **Cells with bugs:** 0
- **Result:** ALL CLEAN

All 120 cells reported `overflowCount: 0` from the standard diagnostic (no off-viewport elements outside scrollable ancestors, with #vbSky and full-bleed canvas excluded). The only console output across the entire sweep was a single 404 for `/favicon.ico` per page load, which is cosmetic and not a viewport/layout defect.

## Bug list

None.

## Per-cell entries

### phone-landscape (pl) 844x390 — completed in prior round

All 30 cells (15 activities x 2 tiers) verified clean. Screenshots: `tests/audit/pass3-roundB/pl-*-t{1,8}.png`.

### phone-portrait (pp) 390x844 — completed in prior round

All 30 cells verified clean. Screenshots: `tests/audit/pass3-roundB/pp-*-t{1,8}.png`.

### tablet-portrait (tp) 800x1280

All 30 cells verified clean. Tier 1 plus the 7 tier-8 cells (abcs, count-along, days, finger-paint, hello-colors, shape-match, tap-pop) were completed in prior rounds. This round filled in the remaining 9 tier-8 cells:

| Activity | Result |
|---|---|
| tp-animal-sounds-t8 | overflow 0 — clean |
| tp-body-parts-t8 | overflow 0 — clean |
| tp-color-in-t8 | overflow 0 — clean |
| tp-color-splash-t8 | overflow 0 — clean |
| tp-finger-paint-t8 | overflow 0 — clean |
| tp-math-t8 | overflow 0 — clean |
| tp-money-t8 | overflow 0 — clean |
| tp-spelling-t8 | overflow 0 — clean |
| tp-stamp-art-t8 | overflow 0 — clean |

### tablet-landscape (tl) 1280x800

All 30 cells tested fresh this round. All clean.

**Tier 1:**

| Activity | Result |
|---|---|
| tl-tap-pop-t1 | overflow 0 — clean |
| tl-shape-match-t1 | overflow 0 — clean |
| tl-hello-colors-t1 | overflow 0 — clean |
| tl-animal-sounds-t1 | overflow 0 — clean |
| tl-count-along-t1 | overflow 0 — clean |
| tl-abcs-t1 | overflow 0 — clean |
| tl-days-t1 | overflow 0 — clean |
| tl-math-t1 | overflow 0 — clean |
| tl-spelling-t1 | overflow 0 — clean |
| tl-money-t1 | overflow 0 — clean |
| tl-body-parts-t1 | overflow 0 — clean |
| tl-stamp-art-t1 | overflow 0 — clean |
| tl-finger-paint-t1 | overflow 0 — clean |
| tl-color-splash-t1 | overflow 0 — clean |
| tl-color-in-t1 | overflow 0 — clean |

**Tier 8:**

| Activity | Result |
|---|---|
| tl-tap-pop-t8 | overflow 0 — clean |
| tl-shape-match-t8 | overflow 0 — clean |
| tl-hello-colors-t8 | overflow 0 — clean |
| tl-animal-sounds-t8 | overflow 0 — clean |
| tl-count-along-t8 | overflow 0 — clean |
| tl-abcs-t8 | overflow 0 — clean |
| tl-days-t8 | overflow 0 — clean |
| tl-math-t8 | overflow 0 — clean |
| tl-spelling-t8 | overflow 0 — clean |
| tl-money-t8 | overflow 0 — clean |
| tl-body-parts-t8 | overflow 0 — clean |
| tl-stamp-art-t8 | overflow 0 — clean |
| tl-finger-paint-t8 | overflow 0 — clean |
| tl-color-splash-t8 | overflow 0 — clean |
| tl-color-in-t8 | overflow 0 — clean |

## Methodology

- Server: http://localhost:8866
- Cache-bust per nav: `?cb=p3b2-<slug>-<vp>-<tier>`
- Active profile set via `localStorage.setItem('vb_active_id', 'test-1' | 'test-8')` before nav
- Overflow diagnostic: walks `body *`, skips `#vbSky` and large canvases, ignores elements inside scrollable ancestors, reports any element whose bounding rect extends >50px past any viewport edge
- Screenshots saved to `tests/audit/pass3-roundB/<vp>-<slug>-<tier>.png`
- Total screenshots on disk: 120 / 120 expected
