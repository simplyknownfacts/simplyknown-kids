# Ocean islands preview - 2026-09-08 (codex)

## Resume here
1. Scott's latest direction is an ocean with a separate island for each activity, related animated details, and the personal companion resting in the center. Implemented locally at application commit `17f1360` on `kids/child-experience`. Preview: http://localhost:8795/home.html . Scott's visual approval and physical-phone feedback remain pending; do not equate working 3D geometry with approved artwork.
2. Five separate sandy islands now hold Games, Learn, Art, Watch and Listen. Watch has a marquee/curtain entry/reel/popcorn; Listen has headphones/speakers/music notes; Learn has books/ABC blocks/globe; Art has palette/brush/easel/pots; Games has blocks/beachball/umbrella. The lit ocean has moving highlights, waves, shore foam, boats and seabirds. The companion stays on a central sixth island and retains its bounded tap-to-sound behavior.
3. Whole buildings, beaches and related scenery select their own activity; open water does nothing. Portrait spacing adapts to the available height; landscape uses a wider arrangement. Keyboard equivalents cover each island. Reduced motion and page pause stop decorative updates. Existing Body Parts, Hide & Seek, art tools, parent hold/settings, ribbon and speech fixes remain.
4. This is a reviewable procedural 3D iteration. No external AI service was selected, connected or charged. Scott's offered service list remains unanswered; a higher-quality model/asset workflow is still an option after feedback. The earlier separate black-arrow report remains unresolved; no animal asset was edited here.
5. Keep the production gate. Original `main` remains `30d28e772aea51d5b19b80fbca46aeb34d05787e`. Promote/deploy/verification scripts and app release version are unchanged. No production push/deploy, main merge, dev-verification stamp, scheduled review, Video takeover, secret/account read or paid generation occurred. Prior direct Claude application review remains pending; the independent review below was a Codex subagent.

## Evidence at 17f1360
1. Full regression: **272 passed, 0 failed, 0 skipped**, exit 0 (`ocean-full-suite.log`, ignored). This includes real facade taps, 30 rapid navigation taps, companion sound mashing, graphics fallback, seven home viewports, and the new island oracle.
2. New oracle: **7/7 passed**, including exact 320x568, 390x844, 783x1270, 844x390 and 568x320 layouts, separate island centers, physical beach selection, inert ocean taps, pause/resume, persisted page lifecycle and reduced-motion stability. Independent fixed-checkout reviewer reproduced 7/7 and 4/4 required-shell checks, with no functional finding.
3. Offline: a fresh synthetic browser installed `vb-v158`; all four scene modules were present. Its separate server was stopped, browser put offline, home reloaded into six live 3D islands, and a physical Games beach tap routed correctly (`ocean-offline.log`, ignored). User's preview server on8795 stays running.
4. Local staging: **5,378 files**, with source/staged hashes equal for scene, huts, islands, ocean and service worker. All new imports are in both required and optional shell lists. Health identity is `kids`; service worker syntax and diff checks passed.
5. Visual checks caught and corrected downward-facing island tops, sign faces hidden by bevels, obscured rear props, and companion overlap on a short landscape screen. Final independent screenshots show distinct unclipped islands. The actual in-app preview was refreshed and visually inspected after integration.
6. Performance limit: scene reports **341 draw calls / 97,176 triangles**. Independent headless Chromium observed roughly **12.8 fps** during concurrent local verification. A quiet follow-up reproduced **12.6 fps** and identified the renderer as **SwiftShader software rendering**, not a hardware phone GPU (`ocean-performance.log`, ignored). Smooth physical-phone animation is not yet established. Obtain device feedback/measurement before promotion, and optimize if needed.
7. **Full screen walkthrough: 80 screens passed, 0 failed**, exit 0 (`ocean-walkthrough.log`, ignored), including home navigation, offline/media fallback and celebration behavior.

## Files and isolated work
1. Root integration: `js/world-scene.js`, new `js/world-ocean.js`, and `sw.js` cache v158. Application commit `17f1360`.
2. `ocean_land` used `kids-worlds`, branch `kids/ocean-islands`, final `c6f5724`; `js/world-islands.js` and follow-up geometry/placement fixes integrated.
3. `island_huts` used `kids-resilience`, branch `kids/island-landmarks`, final `921db0e`; improved huts and sign-depth correction integrated.
4. `ocean_review` wrote test commit `156460f` on `kids/ocean-tests`, then independently reviewed fixed `17f1360` in `kids-content`. Review checkout clean and detached.
5. Screenshots and verification logs are ignored local evidence, never committed. Synthetic profiles only; existing user profile/storage preserved. The shared register/inbox/handoff pointers record the completed result and release these exact claims.

## Next
1. Scott reviews this ocean direction and phone feel before more artwork refinement or any promotion.
2. Resolve physical-device performance and remaining visual feedback; keep all navigation, reduced-motion and offline checks when replacing assets.
3. Preserve the earlier shared documentation/Claude coordination evidence and Video writer ownership. Do not recreate retired schedules or repeat incorrect Notes-only/restart advice; actual Full Access was sufficient throughout.
