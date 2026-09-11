# Kids Watch lifecycle repair and section-hub audit handoff — 2026-09-10 (codex)

## Exact state

1. Checkout: `C:\Users\HomeSeer\.codex\worktrees\75f5\Kids_App`.
2. Branch: `codex/kids-watch-lifecycle-audit-20260910-75f5`.
3. Exact clean start: `b82a12ef56cd8a7f12f44037fad075be38fb6645`; predecessor `61eb` was released before this checkout was claimed.
4. Product fix: `3683e2028044ba1812a1c44202725ffbb1858d5b`.
5. Audit evidence/tooling: `78d7ae0602600998446db4596832a38b0f88f998`.
6. No push, merge, main, deploy, promote, production, secret, PII, provider, paid, account, gate/security or remote-data action occurred.

## Completed repair

1. The unchanged T1-T10 desktop/phone Watch matrix reproduced the pending-feed Back race in all 20 rows: 380 PASS / 20 FAIL / 100 NA / 20 BLK, with each failed cell observing a hidden orphaned player after Back.
2. The focused regression was red before the source repair: 2 pass / 6 fail across feed readiness, API readiness, late rejection, rapid replacement, close/reopen, repeated Back, recovery and normal controls.
3. `3683e20` adds a minimal open-generation token, checks it after both asynchronous waits and invalidates it synchronously at close, so stale continuations return before the only player replacement block and cannot destroy a newer player.
4. Green proof: 8/8 focused lifecycle, 22/22 combined lifecycle/Back/CSP/hostile-input and 20/20 unchanged age/device matrix rows, now 400 PASS / 0 FAIL / 100 NA / 20 BLK.
5. Independent separate-checkout review at exact `3683e20` is PASS/no P1/P2: lifecycle 8/8, Back controls 2/2 and an independent 20/20 matrix. Reviewer checkout remains present, detached, clean and released.
6. Only 20 Watch `navigation_during_animation` cells changed FAIL to PASS. Real provider output, remote stream endurance and audible interruption remain blocked; all lifecycle media was honestly synthetic.

## Completed audit evidence

1. Selected only the untouched Games, Learning and Art section hubs; accepted activity and shared resilience batches were not repeated.
2. Scope: 3 routes x T1-T10 x desktop 1280x900/touch-phone 390x844 = 60 rows. Runner result: 120 PASS / 0 FAIL / 60 visual placeholders.
3. Every row retained its exact ordered age-appropriate card set through 20 reloads. Sixty full-page screenshots and six contact sheets were inspected; no overlap, clipping, horizontal overflow or tier-specific visual break was found.
4. Guarded importers changed exactly 20 Watch and 120 hub cells, then each changed zero on its immediate second run.
5. Final ledger: 9,027 PASS / 16 FAIL / 4,083 BLK / 3,374 NA; row verdicts 40 PASS / 16 FAIL / 604 BLK; execution 40 COMPLETE / 620 PARTIAL / 0 NOT_RUN.
6. Full suite after the product repair: 334 tests, 325 pass / 9 known Bubble Pop failures / 0 skip. It is not green.

## Durable evidence

1. Archive: `C:\Users\HomeSeer\OneDrive\Documents\Claude\Projects\Kids_App\audit-evidence-archive\2026-09-10-watch-lifecycle-section-hubs-01a08d94`.
2. Verification: 78 payloads / 79 total files, 12,986,843 bytes, zero missing, mismatched, extra or source-divergent files.
3. `SHA256SUMS` SHA-256: `e268ae0b392c5b96fa7ca4214b3affae1832682cccf5321bd440c7dc31903c47`.
4. Retained red matrix SHA-256: `70e5beb293d5a22db071826ceed91473f9a9def517cc32ae363469cd3e22fa0b`; green: `d74ba5f2b8ed8d68ec9b1c336ee181630fa3977bf623007274d9f4c1d919895a`; hub report: `a4f4185700710626bb044a7fc89699cd43d71336c1c1e4ebafcce5dbab220f31`.
5. Predecessor archive was also independently verified before work: 182 payloads / 183 files, zero mismatch/extra, manifest `6b498749593a74ce31b19d5f185fdea78939d46eaefc146ae230edd08e06e3b7`.

## Remaining work and boundaries

1. Remaining confirmed ledger failures are Bubble Pop T1-T4 missing cue and Animal Sounds T1-T4 missing guidance on desktop and phone: 16 cells total.
2. Bubble and Animal real clips remain blocked; no mock may close a real audiovisual/provider gap.
3. Other untouched activity visual and long-run dimensions remain blocked. A successor may select another bounded ledger batch without repeating accepted Games, Learning, Art or shared resilience.
4. Preserve Yoto withdrawal, compact headers, Spelling, Color Splash and Watch fixes. No other product fix without exact authorization and red-first proof.
5. Production/main/push/merge/deploy/promote, secrets/PII, provider/paid calls, remote-data writes and gate/security changes remain outside scope.
6. Report continuation through coordination task `01a08c18-4f34-7570-a14b-42cb8afa6339`; do not archive tasks or delete worktrees while autoarchive is paused.
