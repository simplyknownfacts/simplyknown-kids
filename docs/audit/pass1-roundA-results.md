# Pass 1 Round A — Shell UI audit results

**Cells tested:** 32 (8 pages × 4 viewports)
**Cells with issues:** 9

## Executive summary

The shell pages render cleanly on tablet sizes and phone-portrait. The dominant bug pattern is hub content that exceeds the viewport height with `body { overflow: hidden }` — meaning users on smaller heights physically cannot reach the lower hub tiles or, in one case, the lower half of the PIN entry pad. The worst case is **Learning hub**, which overflows in three of four viewports (phone-portrait at 1284px, phone-landscape at 1039px, tablet-landscape at 1042px) — its 9-tile grid is the largest of the hubs. **Games**, **Art**, **Videos channels**, and **Listen** all overflow in phone-landscape only (390px tall is too short for any vertical stack of hub tiles). **Parent settings phone-landscape** has the same pattern — the bottom PIN keys (7/8/9/0/⌫) and the "Set up new PIN" / "Forgot your PIN" footer block render below 390px without scroll; only the PIN seeding (via JS click) succeeded in this audit because clicks fire on offscreen DOM. A real parent on a 390px-tall phone in landscape literally cannot tap the lower PIN keys. The 7 phone-portrait and 7 tablet-portrait cells are clean. Console is silent except for a single benign `/favicon.ico` 404 emitted globally (not page-specific) — surfaced once here, not per-cell.

**Global, non-blocking:** `GET /favicon.ico → 404` on every page. Worth adding a 32×32 favicon to the root.

---

## index.html @ phone-portrait
- Screenshot: tests/audit/pass1-roundA/phone-portrait-index.png
- Overflow count: 0
- Issues: looks clean

## home.html @ phone-portrait
- Screenshot: tests/audit/pass1-roundA/phone-portrait-home.png
- Overflow count: 0
- Issues: looks clean

## games/index.html @ phone-portrait
- Screenshot: tests/audit/pass1-roundA/phone-portrait-games.png
- Overflow count: 0
- Issues: looks clean

## learning/index.html @ phone-portrait
- Screenshot: tests/audit/pass1-roundA/phone-portrait-learning.png
- Overflow count: 1
- Issues:
  - `.hub-screen` is 1284px tall in an 844px viewport — lower learning tiles below the fold are unreachable (body overflow:hidden).

## art/index.html @ phone-portrait
- Screenshot: tests/audit/pass1-roundA/phone-portrait-art.png
- Overflow count: 0
- Issues: looks clean

## videos/index.html @ phone-portrait
- Screenshot: tests/audit/pass1-roundA/phone-portrait-videos.png
- Overflow count: 0
- Issues: looks clean

## listen/index.html @ phone-portrait
- Screenshot: tests/audit/pass1-roundA/phone-portrait-listen.png
- Overflow count: 0
- Issues: looks clean

## parent/settings.html @ phone-portrait
- Screenshot: tests/audit/pass1-roundA/phone-portrait-settings.png
- Overflow count: 0
- Issues: looks clean

---

## index.html @ phone-landscape
- Screenshot: tests/audit/pass1-roundA/phone-landscape-index.png
- Overflow count: 1 (decorative SVG circle — ignored per audit rules)
- Issues: looks clean

## home.html @ phone-landscape
- Screenshot: tests/audit/pass1-roundA/phone-landscape-home.png
- Overflow count: 0
- Issues: looks clean

## games/index.html @ phone-landscape
- Screenshot: tests/audit/pass1-roundA/phone-landscape-games.png
- Overflow count: 1
- Issues:
  - `.hub-screen` is 801px tall in a 390px viewport — most game tiles are off-screen and unreachable.

## learning/index.html @ phone-landscape
- Screenshot: tests/audit/pass1-roundA/phone-landscape-learning.png
- Overflow count: 1
- Issues:
  - `.hub-screen` is 1039px tall in a 390px viewport — most learning tiles unreachable.

## art/index.html @ phone-landscape
- Screenshot: tests/audit/pass1-roundA/phone-landscape-art.png
- Overflow count: 1
- Issues:
  - `.hub-screen` is 868px tall in a 390px viewport — most art tiles unreachable.

## videos/index.html @ phone-landscape
- Screenshot: tests/audit/pass1-roundA/phone-landscape-videos.png
- Overflow count: 1
- Issues:
  - `.channels-screen` is 502px tall in a 390px viewport — lower video channels clipped.

## listen/index.html @ phone-landscape
- Screenshot: tests/audit/pass1-roundA/phone-landscape-listen.png
- Overflow count: 1
- Issues:
  - `.listen-screen` is 649px tall in a 390px viewport — Yoto connect UI lower half clipped.

## parent/settings.html @ phone-landscape
- Screenshot: tests/audit/pass1-roundA/phone-landscape-settings.png
- Overflow count: 10
- Issues:
  - PIN entry keys 7, 8, 9, 0, ⌫ render below 390px viewport (top ranges 424–521px). A parent on a 390-tall landscape phone cannot tap the lower PIN row to unlock parent settings.
  - "Set up new PIN" button and "Forgot your PIN? Email simplyknownfacts@gmail.com" footer block render at top=627–738px, fully off-screen.
  - Body is `overflow:hidden` so no scroll workaround exists.

---

## index.html @ tablet-portrait
- Screenshot: tests/audit/pass1-roundA/tablet-portrait-index.png
- Overflow count: 0
- Issues: looks clean

## home.html @ tablet-portrait
- Screenshot: tests/audit/pass1-roundA/tablet-portrait-home.png
- Overflow count: 0
- Issues: looks clean

## games/index.html @ tablet-portrait
- Screenshot: tests/audit/pass1-roundA/tablet-portrait-games.png
- Overflow count: 0
- Issues: looks clean

## learning/index.html @ tablet-portrait
- Screenshot: tests/audit/pass1-roundA/tablet-portrait-learning.png
- Overflow count: 0
- Issues: looks clean

## art/index.html @ tablet-portrait
- Screenshot: tests/audit/pass1-roundA/tablet-portrait-art.png
- Overflow count: 0
- Issues: looks clean

## videos/index.html @ tablet-portrait
- Screenshot: tests/audit/pass1-roundA/tablet-portrait-videos.png
- Overflow count: 0
- Issues: looks clean

## listen/index.html @ tablet-portrait
- Screenshot: tests/audit/pass1-roundA/tablet-portrait-listen.png
- Overflow count: 0
- Issues: looks clean

## parent/settings.html @ tablet-portrait
- Screenshot: tests/audit/pass1-roundA/tablet-portrait-settings.png
- Overflow count: 0
- Issues: looks clean

---

## index.html @ tablet-landscape
- Screenshot: tests/audit/pass1-roundA/tablet-landscape-index.png
- Overflow count: 0
- Issues: looks clean

## home.html @ tablet-landscape
- Screenshot: tests/audit/pass1-roundA/tablet-landscape-home.png
- Overflow count: 0
- Issues: looks clean

## games/index.html @ tablet-landscape
- Screenshot: tests/audit/pass1-roundA/tablet-landscape-games.png
- Overflow count: 0
- Issues: looks clean

## learning/index.html @ tablet-landscape
- Screenshot: tests/audit/pass1-roundA/tablet-landscape-learning.png
- Overflow count: 1
- Issues:
  - `.hub-screen` is 1042px tall in an 800px viewport — bottom row of learning tiles (9-tile grid) clipped below the fold.

## art/index.html @ tablet-landscape
- Screenshot: tests/audit/pass1-roundA/tablet-landscape-art.png
- Overflow count: 1
- Issues:
  - `.hub-screen` is 868px tall in an 800px viewport — bottom row of art tiles clipped.

## videos/index.html @ tablet-landscape
- Screenshot: tests/audit/pass1-roundA/tablet-landscape-videos.png
- Overflow count: 0
- Issues: looks clean

## listen/index.html @ tablet-landscape
- Screenshot: tests/audit/pass1-roundA/tablet-landscape-listen.png
- Overflow count: 0
- Issues: looks clean

## parent/settings.html @ tablet-landscape
- Screenshot: tests/audit/pass1-roundA/tablet-landscape-settings.png
- Overflow count: 0
- Issues: looks clean
