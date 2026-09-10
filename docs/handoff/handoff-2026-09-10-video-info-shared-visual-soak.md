# Kids App handoff — Video/info audit and shared visual soak

Date: 2026-09-10  
Vendor/session: Codex task `01a08d6b-ff78-7110-a0a0-5972581cbb00`  
CEO return target: `01a08c18-4f34-7570-a14b-42cb8afa6339`

## Exact state

1. Project: Kids App.
2. Checkout: `C:\Users\HomeSeer\.codex\worktrees\61eb\Kids_App`.
3. Branch: `codex/kids-video-legal-audit-20260910-61eb`.
4. Exact authorized start: `7c9b14cf4d712513a8f9c69690a780c53ea4f54a` from released Color Splash/shared-resilience work.
5. Audit evidence/tooling commit: `f378716973e3afa66a4066e821083c2e682d395d`.
6. This handoff is the final repo change. Use the clean released tip recorded in `Notes\Inbox - Kids App.md` and `Notes\Work register.md` rather than a cached remote-tracking ref.
7. Uncommitted work at release: none expected; verify `git status --short`.

## Completed work

1. Independently verified the predecessor archive `audit-evidence-archive\2026-09-10-color-splash-shared-01a08d4b`: 5 files, 4 manifest entries, 4/4 payload hashes, zero mismatch, manifest SHA-256 `6f4cfc927ce6a9b27a600c0a30467412e6c78ef1496182812de759c4998e0174`.
2. Ran every previously NOT_RUN row: Watch, About and Privacy at T1-T10 on desktop 1280x900 and touch phone 390x844 = 60 rows. Final report before visual acceptance: 840 PASS / 20 expected FAIL / 640 NA / 60 visual-review BLK.
3. Captured and inspected all 60 route screenshots through six ten-tier contact sheets plus full-size representatives. Watch, About and Privacy show no clipping, overlap, unreadable hierarchy or horizontal overflow. About and Privacy are locally COMPLETE; Watch remains PARTIAL.
4. Exercised Watch input, stubbed queue progression, 56x56px Back geometry, keyboard/rapid input, reload, resize, repeated entry/exit, failed-feed messaging, malformed and hostile synthetic state, installed-app offline recovery/failure messaging, and twenty sequential player create/stop/destroy cycles per row. Synthetic player lifecycle evidence makes no real YouTube audiovisual-quality claim.
5. Used the ledger to select only two untouched dimensions on the five already-resilience-tested shared routes: visual quality and long repeated use. The 100-row batch passed 200 focused checks with zero fail: twenty profile-selection cycles, twenty home/gallery round trips, twenty ribbon-gallery re-entries, one hundred settings-panel transitions, or fifty timer set/cancel cycles as applicable.
6. Captured and inspected all 100 shared-route screenshots through ten contact sheets. Profile picker, child home, ribbons, unlocked settings and Listening Hut remain coherent across all tiers on both viewports. No accepted behavior test was repeated in this batch.
7. Guarded importers were run twice. Second runs changed zero dimensions. Exactly 160 ledger rows and 1,660 dimensions changed, limited to the eight authorized shared route families.

## Finding

1. **P2 — Watch pending-feed close lifecycle leak:** all 20 T1-T10 phone/desktop rows reproduce it. Open a parent-picked channel, press Back while the feed is still pending, then let the response finish. The overlay stays hidden, but `openChannel()` resumes and constructs a new autoplay player after `closePlayer()` already saw `_player === null`. Evidence is `created:1, destroyed:0, stopped:0, active:false` in every row. This proves an unowned hidden player and ignored Back intent; it does not prove real audio was heard. Smallest proposed fix: cancellation generation or abort guard checked after both asynchronous waits, with the existing red runner retained as the regression. No product fix was authorized or made.
2. The About/Privacy multi-device wording was not reopened as a new finding. `docs/CODEX-TRIAGE.md` item 12 already records the single-sync-key limitation as an accepted risk pending Stage 1b architecture work.

## Verification and ledger

1. Final canonical ledger: **8,887 PASS / 36 FAIL / 4,203 BLK / 3,374 NA** across 16,500 dimensions.
2. Row verdicts: **40 PASS / 36 FAIL / 584 BLK**. Execution: **40 COMPLETE / 620 PARTIAL / 0 NOT_RUN**. The comprehensive audit is incomplete and not green.
3. New transitions: Video/About/Privacy changed 800 BLK→PASS, 20 BLK→FAIL and 640 BLK→NA; shared visual/soak changed 200 BLK→PASS.
4. Full project suite: 326 tests, **317 pass / 9 fail / 0 skip**. All nine are the existing Bubble Pop T1-T4 missing-cue assertions plus Node parent-group accounting. The suite is not green.
5. Both new runners and importers plus `sw.js` pass syntax checks; guarded importers are idempotent; `git diff --check` passes. The Video/info runner intentionally exits nonzero on the 20 confirmed Watch failures.

## Durable evidence

1. Archive: `C:\Users\HomeSeer\OneDrive\Documents\Claude\Projects\Kids_App\audit-evidence-archive\2026-09-10-video-info-shared-soak-01a08d6b`.
2. Contents: two final reports, accepted ledger, audit README/observations, archive README, 160 tier/device screenshots, 16 inspected contact sheets, and SHA manifest. All profiles are synthetic; no child photos or real family state.
3. Independent Node verification: 182 manifest entries/payload files, 183 archive files including the manifest, zero missing, zero extra and zero hash mismatch.
4. `SHA256SUMS` SHA-256: `6b498749593a74ce31b19d5f185fdea78939d46eaefc146ae230edd08e06e3b7`.
5. Evidence was copied without moving or overwriting the ignored checkout artifacts.

## Remaining real gaps and next action

1. Sixteen prior FAIL rows remain: Bubble Pop T1-T4 and Animal Sounds T1-T4 on phone/desktop. Bubble/Animal real-audio repair remains blocked on four missing approved real clips; no credential, provider, paid generation or synthetic closure is permitted.
2. Twenty new Watch FAIL rows remain until the pending-feed close lifecycle is fixed under separate scoped authorization and a red-first checkpoint. Real Watch stream endurance, visible player output and audible interruption remain provider/real-media gaps; synthetic media cannot close them.
3. 4,203 dimensions remain BLK across 620 PARTIAL rows. The next evidence-only batch should use the ledger to select untouched section-hub or activity visual/long-run dimensions; do not repeat accepted shared, Games, Learning or Art resilience checks.
4. Preserve the accepted Yoto withdrawal, compact headers, Spelling and Color Splash fixes, all guarded ledger evidence, the known Bubble/Animal audio blocks and the honest non-green suite.
5. Any Watch product repair needs CEO-scoped authorization; then reuse the existing failing `navigation_during_animation` matrix as the red checkpoint before the smallest cancellation fix. No product repair is included here.

## Authorization boundaries

1. No product source, production, `main`, push, merge, deploy, promote, secret/credential/PII, provider/paid call, remote-data mutation, login, security/gate change or real-media claim occurred.
2. Production remains Scott's typed action through the approved flow. Do not archive tasks or delete worktrees; autoarchive remains paused.
