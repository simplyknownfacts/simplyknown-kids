# Level-up tracker — make every activity evolve for 6–10yos

Scott's call (2026-06-14): many activities cap at ~Tier 4 and don't keep getting
harder/interesting for 6–10yos. Goal: every activity should evolve with age.
Latest directive: **"do it all. dont hide games"** — finish the whole queue, and
**EVOLVE the toddler games for older kids rather than hiding them.**

## ✅ CAMPAIGN COMPLETE (2026-06-20) — every activity now evolves for 6–10yos
- Live = **v131** (`sw.js` line 1 → next bump **v132**). Branch work pushed to `main`;
  worktree HEAD == origin/main.
- **v130 BODY PARTS accuracy rebuild** (Scott: zones "always not on right"): the AI
  figures are framed inconsistently, so the old ANCHORS table/fixed-% zones drifted.
  Now SELF-CALIBRATING — each PNG is measured from its alpha pixels at render (head-top→
  feet + per-row centre/width) and zones placed by proportion (`_PARTS`). Wheelchair child
  re-tuned. Verify by overlaying `.hit` borders + screenshotting (wiring tests don't catch
  visual drift). See [[body-parts-zones]] memory.
- **v131 extras**: Count Along before/after rounds (T7+); Shape Match 3D shapes + odd-one-out
  (T8+). Body Parts wrist/ankle were evaluated + SKIPPED (too close to hand/foot/elbow →
  would hurt tap accuracy).
- Final batch shipped this session: **v125** Peek-a-boo (find-the-animal, baby tap-to-reveal)
  + Surprise Pop (hatch/guess/collect); **v126** Days (months, T6+) + no-robot-voice hardening;
  **v127** Tap & Pop (target-colour challenge + combo, T5+); **v128** Tap-a-Tune (memory game, T7+)
  + Magic Touch (connect-the-dots, T6+); **v129** Body Parts (shoulder/elbow/knee, T6+) + Shape Match
  ("how many sides?" polygons, T7+). Count Along confirmed already-evolved (skip-counting T7+).
- ⚠️ STILL TRUE — no robot voice anywhere: any NEW spoken prompt must be recorded (manifest →
  generate-voices.mjs → gen-offline-manifest.mjs → bump sw) or it plays SILENT. Verify with
  `_matchClips('...') != null` against the ACTUAL speak() strings.
- Possible future polish (optional, not requested): Count Along before/after rounds; Shape Match
  3D shapes / odd-one-out; more Body Parts joints (wrist/ankle — keep centres well-separated).

## ▶ (archived) RESUME HERE
- Was: Live = **v127**.
- ⚠️ **NEW HARD CONSTRAINT (v126): no robot voice anywhere.** The browser-TTS fallback
  is now a NO-OP — any phrase with no recorded clip plays SILENT (caption still shows).
  So **every NEW spoken prompt you add MUST be recorded** or it won't be heard: add the
  phrase (or atoms) to `js/voice-manifest.js`, run `VOICE_BUDGET=N node scripts/generate-voices.mjs`
  (auto-finds the key in the main-repo .env), regen `gen-offline-manifest.mjs`, redeploy.
  Verify a phrase is covered in-browser with `_matchClips('...') != null`.
- Remaining to build (verify each in-browser at a high tier via Playwright + `?cb=`,
  then bump sw + commit + `git push origin HEAD:main`):
  - **Body Parts** — add elbow/knee/wrist/shoulder/ankle for older. ⚠️ needs NEW recorded
    clips ("Where's the elbow?", "Tap the elbows!", "Yes! That's the elbows." etc.) or they'll be silent.
  - **Shape Match** — sides/vertices, polygons (pentagon/hexagon/octagon), 3D, odd-one-out.
    ⚠️ needs NEW recorded clips for the shape vocab + "How many sides?" or silent.
  - **Baby games (mostly NO new voice → cheapest):** ✅ Tap & Pop DONE (v127: target-colour
    challenge + combo for T5+). Remaining: Tap-a-Tune (follow-the-notes "play the song"),
    Magic Touch (trace/connect-dots). Use SFX + captions; avoid new spoken prompts (or record them).
- Seed a test kid: `vb_profiles` + `tierOverrides[id]=6/8/10` to test older tiers.
- Pattern that worked (Hello Colors/Animal Sounds/Days): keep the toddler mode unchanged,
  add a tier-gated round-type dispatcher for older kids; reuse already-recorded phrases where possible.

## ✅ DONE — Batch (this session, shipped v125 + v126)
- **Peek-a-boo** (v125) — now the FIND-the-hidden-animal game; youngest tier (≤2) TAPS a big
  wiggling curtain to reveal (was auto-cycling, no tap). T3-4 single-curtain reveal; T5+ listen quiz.
- **Surprise Pop** (v125) — now HATCH/GUESS/COLLECT (was a Peek-a-boo clone): babies tap (unchanged);
  T3+ fill a 16-item collection (persisted per kid, celebrates+resets at full); T5+ get a black
  silhouette clue + 3 picture guesses before reveal. Broad content (animals+objects+magic).
- **Days** (v126) — fixed "before" to recorded wording; added Months-of-the-Year round (T6+).
- **No-robot-voice hardening** (v126) — TTS fallback neutralized (see constraint above).
- **Count Along** — reviewed: already evolves (tap-count → "how many?" quiz T5-6 → skip-counting T7+).
  No change needed. (Optional future: before/after + "+10" rounds, but they'd need recorded prompts.)

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
