# Level-up tracker — make every activity evolve for 6–10yos

Scott's call (2026-06-14): many activities cap at ~Tier 4 and don't keep getting
harder/interesting for 6–10yos. Goal: every activity should evolve with age.
Process: review activities **card by card, in batches of 2, then check with Scott**
before the next batch.

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

## ⏳ QUEUE — review + level up (batches of 2; pick order with Scott)
1. **Hello Colors** — caps T4 (color quiz). Ideas: shades/specific colors, "which is NOT red",
   color mixing (red+blue=purple), spell the color, speed rounds.
2. **Animal Sounds** — caps T4 (sound quiz). Ideas: more choices, habitats, mammal/reptile/bird,
   baby-animal names, "which does NOT…", sound→spell.
3. **Count Along** — caps ~T5 (count to 10). Ideas: skip-counting (2s/5s/10s), bigger numbers,
   "how many more", simple place value, before/after.
4. **Body Parts** — caps T4 (extra parts). Ideas: harder labels (elbow/wrist/ankle/shoulder),
   organs/systems for older; OR hide for big kids (maxTier) if it can't get meaningfully harder.
5. **Days** — caps T5 (after Monday). Ideas: months + calendar, "3 days after Wed", ordinal
   dates, yesterday/tomorrow, seasons.
6. **Shape Match** — caps ~T8 (6 shapes, easy). Ideas: 3D shapes, count sides/vertices,
   pentagon/hexagon/octagon, symmetry, "odd one out".

## ↔ Decide with Scott (own batch)
- **Baby games** (Tap & Pop, Magic Touch, Surprise Pop, Peek-a-boo, Tap-a-Tune) are minTier 1
  so they show on a 10yo's hub. Inherently young → likely give them a `maxTier` (hide for big
  kids) rather than force-evolve a bubble-pop. Confirm hide vs evolve.
- **Art** (Stamp / Finger Paint / Color Splash / Color In) — open-ended; features cap ~T4 but
  creativity scales with the kid. Low priority; maybe add older-kid tools (brush sizes, undo,
  save/share) later.

## Notes / lessons
- `maxTier` (ACTIVITY_FEATURES) + `isActivityVisible` now support auto-hiding an activity for
  kids past a tier (parent override still wins). Reusable for the baby-games decision.
- Verify tier behavior with `tierOverrides[activityId]` in `vb_profiles`; SW staleness during
  dev → load activity pages with a `?cb=<ts>` query to bypass the cached HTML.
