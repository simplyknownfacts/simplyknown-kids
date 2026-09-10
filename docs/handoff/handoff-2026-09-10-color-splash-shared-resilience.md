# Kids App handoff — Color Splash repair and shared-flow resilience

Date: 2026-09-10  
Vendor/session: Codex task `01a08d4b-cc43-73e1-8d60-f2c7aea359cd`  
CEO return target: `01a08c18-4f34-7570-a14b-42cb8afa6339`

## Exact state

- Project: Kids App.
- Checkout: `C:\Users\HomeSeer\.codex\worktrees\2457\Kids_App`.
- Branch: `codex/kids-color-splash-audit-20260910-2457`.
- Authorized start: `a0bafc8d6424a843c3d77877900e8d449accc9df` from released branch `codex/kids-spelling-art-20260910-e0c5`.
- Evidence state immediately before this handoff: `db6099770c38dbc056f7f0780d29c3eab0a86568`.
- This file is the final repo change. Use the exact released branch tip recorded in `Notes\Inbox - Kids App.md` and `Notes\Work register.md`, not a cached remote-tracking ref.
- Uncommitted work at release: none expected; verify `git status --short` before continuing.

## Completed work

1. Added a permanent Color Splash geometry/interaction regression at `01640c451aefe9dd7a759eb1a425b2e074b027ca`. The unchanged baseline failed 12/14 Node tests: all eleven phone device-tier cells had 42x42px palette targets; tablet and desktop remained 52x52px.
2. Fixed only the shared phone palette size in `js/paint.js` at `9cffb545a9898502073449cd625a147eb7bce1c9`, changing the base `.vb-sw` width/height from 42px to 44px while preserving the existing 52px tablet/desktop rule, layout, scoring and paint behavior.
3. Exact-commit review used separate detached checkout `C:\Users\HomeSeer\.codex\worktrees\color-splash-review-9cffb54\Kids_App`; verdict PASS/no P1/P2. It reproduced the historical red, then passed 14/14 focused tests and the full Art matrix.
4. Accepted exactly ten Color Splash phone `visual_quality` FAIL dimensions as PASS at `d2f23c823a70c76c5bea58233fb75f70c915c19c`; no unrelated row changed.
5. Added selected shared-route resilience runner at `955b70103a8d7b9fc7d283b772a737f7193c0784` for profile picker, child home, ribbon gallery, parent settings and Listening Hut across T1-T10 on desktop 1280x900 and touch phone 390x844.
6. Accepted the guarded shared evidence at `db6099770c38dbc056f7f0780d29c3eab0a86568`: 1,020 BLK dimensions became PASS and 440 became NA; a second import made zero changes.

## Verification

- Color Splash focused regression: red 2 pass / 12 fail; fixed 14/14 pass.
- Color Splash old focused Art runner: 20 rows; 304 PASS / 0 FAIL / 156 NA / 60 BLK.
- Full Art runner: 80 rows; 1,212 PASS / 0 FAIL / 628 NA / 240 BLK.
- Local phone inspection at 390x844 and 320x568 after palette selection and painting: controls visible with no clipping, overlap or horizontal overflow.
- Full project suite: 326 tests; 317 pass / 9 fail / 0 skip. All nine failures are the already reported Bubble Pop T1-T4 missing-cue checks plus parent accounting; this suite is not green.
- Shared runner: 100/100 rows; 1,160 PASS / 0 FAIL / 440 NA / 100 BLK. It covered visible guidance, primary and rapid input, native keyboard activation, reload, resize/orientation, repeated exit/re-entry, malformed optional state and controlled offline reload on every selected row.
- Listening Hut: all 20 rows set, changed, reloaded and cancelled the wall-clock timer. A compressed positive timer completed the real four-second fade, paused registered synthetic media once, restored volume, cleared storage, showed the sleep veil and dismissed it. This is not a claim that unavailable real music was heard.
- Accepted ledger: 7,887 PASS / 16 FAIL / 5,863 BLK / 2,734 NA across 16,500 dimensions; row verdicts remain 16 FAIL / 644 BLK. Execution is 600 PARTIAL / 60 NOT_RUN.

## Durable evidence

- Archive: `C:\Users\HomeSeer\OneDrive\Documents\Claude\Projects\Kids_App\audit-evidence-archive\2026-09-10-color-splash-shared-01a08d4b`.
- Contents: final Art report, final shared report, accepted coverage ledger, README and SHA manifest; no child screenshots.
- Manifest entries: 4; archive files: 5; verified hash mismatches: 0.
- `SHA256SUMS` SHA-256: `6f4cfc927ce6a9b27a600c0a30467412e6c78ef1496182812de759c4998e0174`.

## Known gaps and next action

1. Video, About and Privacy are the remaining 60 wholly NOT_RUN shared rows. The next bounded audit should start from the exact released branch tip and cover those routes without repeating accepted shared or activity-family evidence.
2. All 660 rows are still unfinished because complete long-run and visual judgement remain blocked; do not describe the comprehensive audit as complete or the ledger as green.
3. Sixteen FAIL rows remain from the already reported Bubble Pop and Animal Sounds immediate-cue defects. Bubble and Animal real-audio work remains blocked on four missing approved real clips; synthetic media evidence cannot close those product findings.
4. Preserve Yoto/header/Spelling/Color Splash fixes and all accepted ledger evidence. Re-run only the smallest relevant checks unless a touched dependency requires wider verification.

## Authorization boundaries

- No production or `main` action, push, merge, deploy, promote, secret/credential/PII access, provider/paid call, remote-data write, security/gate weakening or audio-generation claim was made or authorized.
- Any product fix beyond the completed Color Splash target repair needs its own explicit authorization and red-first checkpoint.
- Production remains Scott's typed action through the approved flow.
