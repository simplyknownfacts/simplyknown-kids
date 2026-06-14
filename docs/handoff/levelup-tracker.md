# Level-up tracker — make every activity evolve for 6–10yos

Scott's call (2026-06-14): many activities cap at ~Tier 4 and don't keep getting
harder/interesting for 6–10yos. Goal: every activity should evolve with age.
Latest directive: **"do it all. dont hide games"** — finish the whole queue, and
**EVOLVE the toddler games for older kids rather than hiding them.**

## ▶ RESUME HERE (next session)
- Live = **v120** (`sw.js` line 1 → next bump **v121**). Branch work pushed to `main`;
  worktree HEAD == origin/main.
- Remaining to build (verify each in-browser at a high tier via Playwright + `?cb=`,
  then bump sw + commit + `git push origin HEAD:main`):
  Count Along, Days, Body Parts, Shape Match, then the 5 baby games (evolve, don't hide).
- Seed a test kid: `vb_profiles` Noah (`2024-07-11`) + `tierOverrides[id]=8/10` to test older tiers.
- Pattern that worked (see Hello Colors/Animal Sounds): keep the toddler mode unchanged,
  add a tier-gated round-type dispatcher for older kids.

## ✅ Already scales well (no work needed)
- Math Mountain (+ → −,×,÷, missing-number, to T10)
- Money (identify → count totals → make change, to T9)
- Clock (o'clock → half → quarters → 5-min, to T10)
- Memory Match (2 → 12 pairs, to T10)
- Tilt Drive (difficulty auto-scales)

## ✅ DONE — Batch 1 (dedupe), shipped v117
- **ABCs** — removed duplicate spell-a-word mode (Spelling Bee owns spelling now);
  ABCs is letters + "starts with" only and auto-hides past Tier 6 (new `maxTier`).
- **Spelling Bee** — now scales by tier: 3-letter (T4–6) → +4 (T7) → 4–5 (T8) →
  5–6 (T9) → 6–8-letter trickiest (T10); decoy bank grows 4→7. Verified T8/T10.

## ✅ DONE — Batch 2 (Hello Colors + Animal Sounds), shipped v118
- **Hello Colors** — T6+ adds trickier colours (brown/gray/black/white) + odd-one-out
  ("which is NOT blue?"); T8+ adds colour-MIXING ("red + blue = ?" → tap result swatch).
  Verified T8: identify/odd/mix all render + correct.
- **Animal Sounds** — T6+ adds classification ("which is a mammal/bird?"); T8+ adds habitat
  ("which lives in the ocean?"), via a factual group/habitat table. Verified T8.

## ⏳ QUEUE — remaining to build (do all)
- **Count Along** (`learning/count-along.html`) — gap: the "How many?" quiz is gated
  `quizOn && tier <= 6`, so **tier 7+ falls through to plain tap-to-count (to 50) with NO quiz**.
  Add older round types: skip-counting ("2,4,6,__" by 2s/5s/10s, T7+), before/after ("what comes
  after 15?", T7+), "how many more / +10" (T9+). maxCount already 50 at tier>6.
- **Days** (`learning/days.html`) — quiz is `tier>=5` ("after Monday"). Add for older: months of
  the year + "what month comes after March?" (T6+), "3 days after Wednesday" (T7+), ordinals /
  yesterday-tomorrow / seasons. (Emojis already kid-friendly per v114.)
- **Body Parts** (`learning/body-parts.html`) — caps T4 (allParts). Don't hide. Add harder PART
  NAMES for older (elbow / wrist / knee / shoulder / ankle) — derive zones from the existing
  measured ANCHORS (elbow≈mid-arm, knee≈mid-leg, shoulder≈top-arm, wrist≈above hand, ankle≈above
  foot). NOTE: zones are now a measured ANCHORS table (v115) — extend `standing(m)` to add these.
- **Shape Match** (`games/shape-match.html`) — caps ~T8 (6 shapes). Add for older: count
  sides/vertices ("how many sides? □=4"), harder polygons (pentagon/hexagon/octagon), 3D shapes
  (cube/sphere/cone), "odd one out". (Drag from T3 already; T2 tap from v113.)
- **Baby games — EVOLVE, do NOT hide** (Scott's call):
  - Tap & Pop → older: target/score mode ("pop only the RED bubbles", timed, combo counter).
  - Tap-a-Tune → older: follow-the-notes "play the song" mode (highlight keys in sequence).
  - Magic Touch → older: trace-a-shape / connect-the-dots / pattern challenge.
  - Surprise Pop → older: memory/sequence ("pop them in 1-2-3 order") or matching reveal.
  - Peek-a-boo → already has multiChoice (T5); add more choices / "who makes this sound" at T7+.

## ✅ DONE — Art (shipped v119 + v120)
- Shared **js/paint.js** engine — MS-Paint-lite, toolset scales by tier (palette / 3 sizes T5+ /
  brush types round·marker·crayon·spray T6+ / eraser T4+ / undo T6+ / clear). DOM bg layer.
- **Color Splash** → freeform blank paint canvas (was tap-to-splat). v119.
- **Color In** → opens on a coloring page you brush-colour; 🖼️ flips pages ↔ uploaded photos ↔
  blank canvas; same scaling tools. v120. Verified T8 (page renders, brush paints, tools).
- **Finger Paint** kept as the simple toddler finger-draw. **Stamp Art** unchanged (Scott's call).

## Full level-up shipped so far (all live)
- v117 dedupe ABCs/Spelling · v118 Hello Colors + Animal Sounds · v119 Color Splash paint ·
  v120 Color In paint. (Earlier this session: v110 sync, v111 stamp-scroll, v112 hold-to-settings,
  v113 shape-match toddler tap, v114 day emojis, v115 body-parts zones, v116 offline tiles.)

## Notes / lessons
- `maxTier` (ACTIVITY_FEATURES) + `isActivityVisible` support auto-hiding an activity past a tier.
  Used ONLY for ABCs (letters mastered by ~6, part of the Spelling dedupe). **Open Q for Scott:**
  he later said "dont hide games" — confirm ABCs auto-hide (maxTier:6) should stay, or ABCs should
  remain visible. (It's a learn card, not a "game", so likely fine, but flag it.)
- Verify tier behavior with `tierOverrides[activityId]` in `vb_profiles`; SW staleness during
  dev → load activity pages with a `?cb=<ts>` query to bypass the cached HTML.
- Shared paint engine: `js/paint.js` `vbPaint.mount({tier, pages, onStroke})`. pages =
  `[{name,svg},{name,src},{name}]` (svg inline / src image / blank). Reusable if other art evolves.
- Deploy = bump `sw.js` CACHE + commit + `git push origin HEAD:main`; verify
  `curl -s "https://kids.simplyknown.co/sw.js?cb=$(date +%s)" | head -c 30`.
