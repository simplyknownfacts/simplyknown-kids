# Pass 2 — Round B Audit Results

**Date:** 2026-05-22
**Server:** http://localhost:8866
**Worktree:** recursing-gagarin-a837d8
**Scope:** 15 activities × 4 viewports × 2 tiers = 120 cells

## Executive Summary

- **Total cells:** 120
- **Cells with bugs:** 0
- **JS console errors (excluding favicon):** 0 across all cells
- **New bugs found:** 0
- **Pass 1 fixes holding:** Yes — every activity that was fixed in Pass 1 remained clean across all 4 viewports and both tested tiers.

Round B is a clean sweep. Every one of the 15 activities renders all interactive content within viewport bounds (or inside a scrollable ancestor) at both Baby (test-1, tier 1) and 7yo (test-8, tier 8) profiles, across phone-portrait (390×844), phone-landscape (844×390), tablet-portrait (800×1280), and tablet-landscape (1280×800). The only console noise observed was the harmless `/favicon.ico` 404, which is excluded per the audit rules.

## Bugs Found

None.

## Methodology Notes

- Each cell: navigated with `?cb=p2b-<slug>-<vp>[8]` cache-bust, set `vb_active_id` to `test-1` or `test-8` before navigation, ran the overflow-detection evaluator (with the corrected scrollable-ancestor walk that includes `<body>`), screenshotted to `tests/audit/pass2-roundB/<vp>-<slug>-<tier>.png`.
- The eval walks `body *`, filters animated game canvas/sky containers, then for any element whose bounding rect extends >50px beyond any viewport edge, walks up the DOM (including body) checking `overflowY: auto|scroll`. If no scrollable ancestor is found, the element is flagged.
- Console errors are sampled per page; the only recurring error is the favicon 404 (`http://localhost:8866/favicon.ico`), filtered out of the bug count.

## Pass 2 Round A → Round B Diff

Round A audited 8 shell pages (`/`, `/home`, `/games`, `/learning`, `/art`, `/videos`, `/listen`, `/parent`) and surfaced one bug: PIN keypad clipped on `/parent` at phone-landscape. Round B audits the 15 activity pages — a non-overlapping scope. No new bugs found; Round A's PIN keypad bug is still tracked separately (not retested in Round B since `/parent` is not in scope here).

## Clean Cells (120 / 120)

### phone-portrait (390×844)
- **tier 1:** tap-pop, shape-match, hello-colors, animal-sounds, count-along, abcs, days, math, spelling, money, body-parts, stamp-art, finger-paint, color-splash, color-in — 0 overflow / 0 errors
- **tier 8:** tap-pop, shape-match, hello-colors, animal-sounds, count-along, abcs, days, math, spelling, money, body-parts, stamp-art, finger-paint, color-splash, color-in — 0 overflow / 0 errors

### phone-landscape (844×390)
- **tier 1:** all 15 activities — 0 overflow / 0 errors
- **tier 8:** all 15 activities — 0 overflow / 0 errors

### tablet-portrait (800×1280)
- **tier 1:** all 15 activities — 0 overflow / 0 errors
- **tier 8:** all 15 activities — 0 overflow / 0 errors

### tablet-landscape (1280×800)
- **tier 1:** all 15 activities — 0 overflow / 0 errors
- **tier 8:** all 15 activities — 0 overflow / 0 errors

## Artifacts

Screenshots saved to: `tests/audit/pass2-roundB/<viewport>-<activity-slug>-t<tier>.png` (120 files).

Filename pattern examples:
- `phone-portrait-tap-pop-t1.png`
- `phone-landscape-shape-match-t8.png`
- `tablet-portrait-spelling-t1.png`
- `tablet-landscape-color-in-t8.png`
