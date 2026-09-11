# Kids App handoff — Days repair and Math audit (codex)

## Exact state

1. Checkout: `C:\Users\HomeSeer\.codex\worktrees\8807\Kids_App`.
2. Branch: `codex/kids-days-repair-math-audit-20260911-8807`.
3. Authorized clean start: `9140ce8e04b0999fabeb6b285f7bd35cbda4b90e`.
4. Days repair commits: `4e0ef39f62cd85a5c975daf2cfbef55f03fddaf2` and `a23a0ea4ef49c2ddb79e62fbfb382fd98b1efde7`.
5. Math audit/evidence commit: `55eef789f183be85beb628f114df026321efa482`.
6. The clean released tip is the later handoff-only commit containing this file. Uncommitted tracked work at handoff: none.

## Days repair completed and independently accepted

1. The prior archive was independently reverified before work: 196 manifest payloads / 197 total files, 40,117,279 payload bytes / 40,144,638 total bytes, manifest SHA-256 `970a5dc54f47b6dc6d6dd4fec085b8848b864d977170f566f25dab9b852a71be`, and zero bad formats, unsafe paths, duplicates, missing files, hash mismatches, extras or reparse points.
2. Red proof reproduced the accepted T3-T10 phone reward/title overlap. Days now places only its compact reward notice in the safe top corner and hides the replay prompt while the notice DOM remains attached; desktop keeps the shared 72px placement.
3. The first independent review found a P2 during automatic fade-out: replay returned while the reward remained 0.92 opaque. Follow-up `a23a0ea` fixed the entire attached-DOM transition and added an automatic-dismiss assertion.
4. Final focused proof passes 13/13. Final Days play passes 20/20 T1-T10 phone/desktop rows plus 8/8 short-phone/tablet probes, 160 correct answers, 180 renders and zero reward/title overlap.
5. T1-T2 reward deferral, T3-T10 in-game rewards, tap and automatic dismissal, navigation, settings, persistence, targets and gameplay remain intact.
6. Independent separate-checkout re-review at exact `a23a0ea4ef49c2ddb79e62fbfb382fd98b1efde7` reports PASS with no remaining P1/P2 after focused 13/13, full 20/20 rows and 8/8 probes, inspected compact/desktop frames and a real 390x844 automatic-fade probe.

## Math audit completed; findings are report-only

1. All 20 T1-T10 rows at 1280x900 desktop and 390x844 touch phone completed 160 correct answers. Every row used the real PIN settings to enable subtraction, multiplication, division and missing numbers, then completed all six operation/missing modes plus repeated plus/minus play.
2. Every round rejected a real wrong answer without progress and accepted the correct answer exactly once; rapid input did not duplicate progress. Counters advanced exactly 119 to 127, repeat state became one, settings persisted, and navigation return, reload recovery and fresh play passed.
3. Rewards persisted and stayed in view. T1-T2 deferred to the Learning hub; T3-T10 displayed in the activity.
4. Confirmed P2 on Math T3-T10 phone: the reward notice covers the `Math Mountain` title at 390x844. Desktop and deferred T1-T2 states are clear. No Math product repair was authorized or made.
5. Confirmed P2 responsive collision in tested T6/T8/T10 320x568 probes: `gameSettingsGear` covers one answer choice. Targets remain 70px and the stage scrolls, but a fixed parent control must not cover a child answer. Tablet and T4 short-phone probes pass; standard 390x844 rows do not reproduce this collision.
6. Final Math evidence: 20/20 complete main rows, 100 PASS / 0 behavioral FAIL / 20 reviewed visual placeholders, 8 probes with 5 pass and only the three documented short-phone visual failures, and 212 inspected renders. Report SHA-256: `5a190c03a48c92b1c66705a388620c2d17f5bf24e315c325a5d3ba3ed38a23db`; Math source SHA-256: `2401654f8a321619172e06e4029c56ff406a723fd03a89d6d5540c58da7e1a2d`.
7. Guarded import changed exactly 100 cells on first run and zero on repeat: eight repaired Days FAIL to PASS, plus 92 Math BLK to 84 PASS and eight phone visual FAIL. Ledger is 10,061 PASS / 44 FAIL / 2,821 BLK / 3,574 NA; 252 PASS / 44 FAIL / 364 BLK rows; 280 COMPLETE / 380 PARTIAL.

## Evidence, boundaries and next action

1. Exact full suite: 462 tests, 453 pass, nine already-ledgered Bubble Pop guidance failures and zero skipped; intentionally not green and no new failure.
2. Durable no-overwrite archive: `C:\Users\HomeSeer\OneDrive\Documents\Claude\Projects\Kids_App\audit-evidence-archive\2026-09-11-days-repair-math-audit-8807`.
3. Independent archive verification: 431 manifest entries / 431 payload files / 432 total files; 91,900,735 payload bytes / 91,961,445 total bytes; zero bad formats, unsafe paths, duplicates, missing files, bad hashes, extras or reparse points.
4. Archive manifest SHA-256: `c3aeb3febac2bf8aa61b62b35800b2561b4b1e634b503aee6aef36799609555f`.
5. Browser-emulated pointer/touch actions are not physical child-touch proof. Silent media handling does not prove human-audible quality or provider behavior. ABCs remains report-only for impossible mastery; Bubble Pop and Animal Sounds remain blocked on truthful real guidance audio.
6. An ignored dependency junction remains at `node_modules`; it is not tracked or archived. Do not bypass the existing cleanup guard.
7. No production/main, push, merge, deploy/promote, secrets, PII, paid/provider, gate/security, remote-data, task-archive or worktree-delete action occurred.
8. Next exact eligible activity is Clock Time. A successor must use its own managed checkout from this clean released tip, re-read the live ledger, independently reverify this archive, and not use `8807` or predecessor folders.
