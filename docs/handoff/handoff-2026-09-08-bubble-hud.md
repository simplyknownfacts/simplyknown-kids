# Bubble Pop controls - 2026-09-08 (codex)

## Resume here
1. Scott reported that the top-right Again button covered something in Bubble Pop. It covered the score/combo: both occupied the same fixed corner. Fixed locally on `kids/child-experience`; application commits `a2eb871` and `a803bdd`, regression tests `5fe12ad` and `b98fa1b`. Preview: http://localhost:8795/games/tap-pop.html . The actual in-app tab was refreshed and visually inspected.
2. Navigation and Again retain the top row. The color instruction and score now flow together below them, wrapping on narrow phones. Bubbles use the remaining play area; its drawing size follows the same measurement as its visible size. Small ribbon notices appear above the bottom controls, clear of the score and replay. Gameplay, scoring, recorded instructions and the shared replay control are retained.
3. Keep the production gate. Original `main` remains `30d28e772aea51d5b19b80fbca46aeb34d05787e`. Promote/deploy/verification scripts and app release version are unchanged; no push, deployment, main merge or dev-verification stamp. The service-worker cache is `vb-v160` so the local preview can pick up this revision.
4. Previous ocean-island work and its limits remain in [the ocean handoff](handoff-2026-09-08-ocean-islands.md): artwork acceptance and physical-phone performance are still pending. The prior direct Claude application review is also pending; this fix received an independent Codex review, not Claude signoff. Video ownership and retired schedules remain untouched.
5. Separate arrow feedback was inspected read-only after the ocean handoff: the Body Parts source image had no arrow, and the figure had no extra arrow element or pseudo-element. A mouse cursor is the current inference, not a confirmed asset defect. Scott's clarification about whether it moves with the mouse remains unanswered; no cursor/asset patch was made.

## Verification
1. Focused browser regression: **9/9 passed** on final `b98fa1b` (`bubble-hud-focused-final.log`, ignored). Covers 1111x1272, 390x844, 320x568 and 568x320; enlarged score/combo; distinct visible controls; no scrolling; canvas sizing; replaying one unchanged recorded instruction; physical Back/Home clicks; ribbon clearance; younger-tier score-only layout; and a physical bubble tap scoring after the canvas offset.
2. Independent reviewer used its own `kids-content` checkout and reproduced **9/9 twice**, with no material source finding. Its final commit is `3c36b45`, integrated as `b98fa1b`. A baseline negative control reproduced the original overlapping controls.
3. The reviewer found a canvas sizing discrepancy during HUD reflow; application `a803bdd` makes CSS and drawing size use one computed play-area measurement. A concurrent full run then caught the test sampling before the ResizeObserver settled (279 pass, 2 failure records including the parent test). Test `b98fa1b` waits for the canvas to settle after asserting control collisions; the collision assertions remain unchanged. Final full regression on `b98fa1b`: **281 passed, 0 failed, 0 skipped**, exit 0 (`bubble-hud-full-verified.log`, ignored).
4. Full screen walkthrough on the final application: **80 screens passed, 0 failed**, exit 0 (`bubble-hud-walkthrough-final.log`, ignored).
5. Fresh synthetic offline check installed `vb-v160`, stopped its own server, went offline, reloaded home and navigated to cached Bubble Pop: HUD present, replay/score separate, canvas below the HUD (`bubble-hud-offline-final.log`). The user's preview server on8795 stays running.
6. Local staging: **5,378 files**, source/staged hashes match `games/tap-pop.html` and `sw.js`. Service-worker syntax and diff checks pass. Tests use disposable synthetic profiles; the user's saved profiles and storage were preserved.

## Changed files and ownership
1. `games/tap-pop.html`: responsive information row and measured play area; local ribbon placement and resize-observer cleanup. `sw.js`: cache v160.
2. `tests/bubble-hud.test.mjs`: regression coverage and explicit observer settling. Ignored scripts, screenshots and logs are local evidence only.
3. Root used the integration checkout; `ocean_review` used the separate `kids-content` checkout on `kids/bubble-hud-tests`, clean at `3c36b45`. Shared Work register, Kids inbox and Handoffs pointers record this result and release these exact claims. The local preview remains running for Scott.

## Next
1. Scott checks the refreshed Bubble Pop screen and continues reviewing the Kids preview before any promotion.
2. Preserve all earlier Kids feedback and the shared documentation/Claude coordination evidence. Do not repeat Notes-only/restart advice or recreate retired reviews; actual Full Access was sufficient for this work.
