# Kids App handoff — Count Along repair + ABCs audit (codex)

## Exact state

1. Checkout: `C:\Users\HomeSeer\.codex\worktrees\d8b4\Kids_App`.
2. Branch: `codex/kids-count-along-repair-abcs-audit-20260911-d8b4`.
3. Authorized clean start: `dc703cd06247c0e0b1c99308fc1aa72cf899ffe0`.
4. Count Along product/test commit: `d2467b97ee7db79863d76211eed8d360e35a01c7`.
5. ABCs audit/evidence commit: `3927c9561a582c4253b1d72a273d9f108824f49b`.
6. The clean released tip is the later handoff-only commit containing this file. Uncommitted tracked work at handoff: none.

## Count Along completed and independently accepted

1. Red-first proof reproduced all four authorized failures: enabled T4 still rendered tap-count on phone, desktop, 320x568 and 820x1180; the tappable T1-T2 digit `1` measured 39px at 320x568 and 42px at 390x844.
2. The minimal repair gives the clickable T1-T2 number a 44px minimum target and allows enabled T4 to reach the existing how-many branch. Disabled T4 remains tap-count, T5-T6 remain default quiz, and T7-T10 retain adjacent/skip modes.
3. Focused proof passes 26/26. Full proof passes 20/20 T1-T10 phone/desktop rows, 120/120 checks, 142 main rounds, eight responsive probes, 24 probe rounds and 126 inspected renders. Report SHA-256: `d92e67a772a425c62dc0660d6739945c299839cfe37fa0400709e330d432b925`.
4. Independent separate-checkout review found no P1/P2 at exact `d2467b9`; it repeated 26/26 focused and 120/120 full checks and inspected all 126 renders. The digit measured 44px wide at both phone sizes.
5. Exact full suite: 449 tests, 440 pass, nine already-ledgered Bubble Pop guidance failures and zero skipped; intentionally not green.

## ABCs audit completed; repair not authorized

1. ABCs was the next eligible Learning activity in exact registry order after Count Along; Bubble Pop and Animal Sounds remain blocked on truthful real guidance audio. No ABCs product source changed.
2. All 20 T1-T10 rows at 1280x900 desktop and 390x844 touch phone completed 20 full alphabet cycles and 640 recorded letter actions, including reward threshold, rapid input, Previous/Next recovery, reload recovery and repeated play. Eight 320x568/820x1180 probes also passed.
3. The final report is 100 PASS / 20 reward FAIL, with 167 inspected renders and no additional visual finding. Report SHA-256: `cb54a3dd15b6148246bb5a0f51a39cdd1572476fdc4eb2a4b57df91647f91c69`.
4. Confirmed report-only P2 on every tier/device row: Gallery advertises `Word Builder` and tells the child to spell a short word, but spelling was removed from ABCs and the page has no mastery-award path. The repeat reward works; the advertised mastery remains locked after every full alphabet cycle.
5. Guarded import changed 80 BLK cells to PASS, 20 ABCs rewards from BLK to FAIL and the four repaired Count Along FAIL cells to PASS; repeat import changed zero. Final ledger: 9,885 PASS / 36 FAIL / 3,005 BLK / 3,574 NA; 220 PASS / 36 FAIL / 404 BLK rows; 240 COMPLETE / 420 PARTIAL.

## Evidence, boundaries and next action

1. Durable archive: `C:\Users\HomeSeer\OneDrive\Documents\Claude\Projects\Kids_App\audit-evidence-archive\2026-09-11-count-repair-abcs-d8b4`.
2. Independent verification: 318 manifest entries / 318 payload files / 319 total files; 66,228,740 payload bytes / 66,274,915 total bytes; zero bad hashes, extras, missing files or reparse points.
3. Archive manifest SHA-256: `3b1cedb60301250f04cd044cfeb802fdc75dfc6bbdf7a790a7d6e75f4da31826`.
4. Browser-emulated pointer/touch actions are not physical child-touch proof. Silent media handling records intended speech calls but does not prove human-audible quality or provider behavior.
5. A temporary ignored `node_modules` junction remains because policy forbids deleting the guard-blocked dependency junction; it is not tracked or archived.
6. No ABCs repair, production/main, push, merge, deploy/promote, secrets, PII, paid/provider, gate/security, remote-data, task-archive or worktree-delete action occurred.
7. Next exact eligible activity is Days. A successor must use its own managed checkout from this clean released tip, re-read the live ledger, independently reverify this archive, and not use `d8b4` or predecessor folders.
