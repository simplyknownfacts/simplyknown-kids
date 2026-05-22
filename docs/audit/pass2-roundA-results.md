# Pass 2 — Round A Audit Results

**Date:** 2026-05-22
**Server:** http://localhost:8866
**Worktree:** recursing-gagarin-a837d8
**Scope:** 8 shell pages × 4 viewports = 32 cells

## Summary

- **Total cells:** 32
- **Cells with bugs:** 1
- **JS console errors:** 0 across all cells
- **New bugs found:** 1
- **Pass 1 fixes holding:** Yes (all pages that were fixed in Pass 1 remained clean)

## Bugs Found

### 1. parent/settings.html @ phone-landscape (844×390) — PIN keypad clipped below viewport

**Severity:** High — interactive controls unreachable
**Cell:** `phone-landscape-parent.png`

The PIN entry keypad's bottom two rows (7, 8, 9, blank, 0, ⌫ delete) render with top positions ranging from 424px to 521px on a 390px-tall viewport. Bottom edges extend to 606px — **216px below the viewport bottom**. The PIN screen has no scroll affordance (no scrollable ancestor detected by the auditor), so a parent on a phone in landscape mode literally cannot tap any digit in the 7–9 or 0/⌫ row.

Overflow sample:
```
DIV.pin-key "7"  → top=424, bottom=509 (vp.h=390)
DIV.pin-key "8"  → top=424, bottom=509
DIV.pin-key "9"  → top=424, bottom=509
DIV.pin-key "0"  → top=521, bottom=606
DIV.pin-key "⌫"  → top=521, bottom=606
```

This blocks PIN entry → blocks access to all parent settings on phone landscape. PIN 1,2,0,1 specifically still works in this audit only because the auditor calls `.click()` programmatically (which fires on offscreen elements); a real user cannot reach the 0.

**Fix direction:** Make the PIN screen scrollable on short viewports, OR shrink the pin-key size + gap so all 4 rows fit within ~390px, OR switch to a two-column layout at landscape phone breakpoints.

## Clean Cells (31)

### phone-portrait (390×844) — all clean
- index, home, games, learning, art, videos, listen, parent → 0 overflow / 0 errors

### phone-landscape (844×390)
- index, home, games, learning, art, videos, listen → 0 overflow / 0 errors
- **parent → BUG (see above)**

### tablet-portrait (800×1280) — all clean
- index, home, games, learning, art, videos, listen, parent → 0 overflow / 0 errors

### tablet-landscape (1280×800) — all clean
- index, home, games, learning, art, videos, listen, parent → 0 overflow / 0 errors

## Pass 1 → Pass 2 Diff

Pass 1 cleared its known issues; Pass 2 found one **new** issue not flagged in Pass 1: the PIN keypad clipping at phone-landscape. This was likely missed in Pass 1 because the PIN keypad is only visible after navigating to the parent settings page (not on auto-load), and the 844×390 viewport is the only tested viewport short enough to expose it.

## Artifacts

Screenshots saved to: `tests/audit/pass2-roundA/<viewport>-<page-slug>.png` (32 files)
