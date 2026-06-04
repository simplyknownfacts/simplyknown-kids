# Body rotation + session finalize — plan

**Goal:** Rotate the body-parts figure (random body on open, switch every ~5 actions) using Scott's real kid images; then merge ALL outstanding work, leave git at +0, and write a clean handoff. Drop nothing.

## Outstanding work inventory (so nothing is dropped)
1. **Achievements/ribbons re-integration** — STAGED (53 files: 20 wired pages + 30 hats + ribbon.js + sw.js v79 + run-sweep). Commit once the running regression sweep (bblvr4o6a) confirms 0 FAIL.
2. **Body-parts multi-body** — NEW (this plan). Source: `learning/img/bodies-src/kids1.jpg` + `kids2.jpg` (1024×559, 6 kids each, on green; kids2 has a wheelchair child).
3. **Merge everything to main** + deploy + confirm live.
4. **Clean handoff doc** + **git status = +0** (nothing uncommitted).

## Body-parts feature (Task A — delegated to one agent)
- **Crop** the 12 kids from the two rows into tight per-kid boxes; **chroma-key the green** → transparent PNGs at `learning/img/bodies/body-01..12.png`.
- **Zones:** standing kids share a tuned template (verify per kid by rendering outlined zones, like the existing `scripts/_bodycheck.mjs`); the wheelchair child gets custom zones. Store as a per-body array `{ img, zones }` in `learning/body-parts.html`.
- **Rotation:** on open pick a random body; after every 5 correct taps switch to a different random body (re-render image + zones). Keep all existing logic (prompts, success/fail glow, `haptic`, `vbProgress.record('body-parts')` + mastery).
- **Verify (real):** render the game per body with outlined zones to confirm each part is tappable on each body; confirm a switch happens after 5 actions; no console errors; sweep `--only=body-parts` PASS.

## Finalize (Task B — me, after A)
- Commit achievements (after sweep PASS), commit body-parts.
- Full verification: regression sweep 0 FAIL; earn a ribbon (click-through); Back/Home/settings nav click-through still pass.
- Bump cache if not already (v79 covers achievements; bump to v80 if body-parts ships same release).
- Merge `claude/reverent-spence-47072a` → main (--no-ff), push, confirm vNN live.
- Write `docs/handoff/2026-06-03-handoff.md`. Confirm `git status` clean in worktree + main (+0).
