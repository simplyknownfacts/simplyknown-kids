# Spec — Full E2E Test (real-click, all activities × all ages)

**Date:** 2026-06-03  **Status:** approved (build & run mode)

## Goal
Exercise the live PWA the way a real parent + kid would — actual clicks on actual UI,
every activity, every age, every option, plus add/delete kids, PIN, settings, ribbons.
Replace the old "inject localStorage + screenshot" sweep (which never clicked real flows
and hung on reporting).

## Target
- **Live site:** https://kids.simplyknown.co (cache v80).
- Harness uses its **own fresh Playwright browser contexts** → isolated localStorage.
  Add/delete-kid only touches the throwaway test context, **never** Scott's real devices.
- Integrations (Yoto OAuth, cloud-sync sign-in, live YouTube): **UI up to the login
  boundary only** — click the button, confirm the right screen/redirect appears, do not
  log in. Post-login marked "manual — not covered."

## Approach — hybrid, two engines
1. **Parallel click-harness** (Node + Playwright): 8 browser contexts = one per age tier,
   run concurrently. Each context, for its tier, performs the real human flow:
   add kid (real Add-Child UI, birthday→tier) → home gating check → open all 16
   activities via real tiles + interact enough to confirm play/score → Parent Settings via
   real PIN gate, toggle every age-appropriate feature (~25) + a tier override + an
   activity show/hide, reopen to confirm → earn + view a ribbon → change voice → delete
   kid via real button. Screenshot every step; capture every console/page/network error.
2. **Live watchable pass** (Claude via browser tool): drive the riskiest flows manually on
   live, screenshot each click, adapt to what's on screen — human judgment + Scott can watch.

## Coverage
- 16 activities: tap-pop, shape-match, peek-a-boo (games); abcs, animal-sounds, body-parts,
  count-along, days, hello-colors, math, money, spelling (learn); color-in, color-splash,
  finger-paint, stamp-art (art).
- 8 tiers (Sensory 0-12mo → Grade 2+ 7yr+).
- ~25 feature checkboxes (age-gated), tier overrides, activity show/hide, child switching,
  voice picker, parent PIN gate, achievements/ribbons gallery, home + section-index gating.

## Pass / fail
- ❌ FAIL = page crash, nav failure, dead button (click no-op), JS exception.
- ⚠️ WARN = real console/network error, wrong age-gating, visual red flag (blank canvas, overflow).
- ✅ PASS = loads + interaction works + clean.
- Mascot/audio/video 404s filtered as known noise (reuse sweep's asset-noise filter).

## Anti-hang
Incremental result writes + hard per-page and global timeouts. Cannot silently stall.

## Review (cost-aware)
Harness auto-flags broken cells. Claude deep-reviews flagged screenshots + a sample per age
(not all ~200 shots). Optional: one review subagent per age over flagged items.

## Deliverable
`tests/e2e/report.md` — 16×8 pass/fail matrix + every failure with screenshot + live-pass
notes + plain-English "broken vs clean" summary. Screenshots + node_modules gitignored.

## Phases
0. Map real selectors across ~20 pages (parallel Explore agents).
1. Build harness (Node + Playwright) from the selector map.
2. Run parallel across 8 ages (~20–40 min wall-clock).
3. Review flagged cells + live watchable pass → write report.

## Out of scope
Completing external logins; grinding every game level to 100%; load/perf testing;
cross-browser (Chromium only, phone-portrait viewport matching app target).
