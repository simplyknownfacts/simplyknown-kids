# Kids App handoff — Spelling repair and Art resilience complete (2026-09-10, codex)

## Exact state

1. Project: Kids App.
2. Outgoing checkout: `C:\Users\HomeSeer\.codex\worktrees\e0c5\Kids_App`.
3. Outgoing task: `01a08d26-7fcf-7623-8647-e7d4afa2d640`; CEO return address: `01a08c18-4f34-7570-a14b-42cb8afa6339`.
4. Branch: `codex/kids-spelling-art-20260910-e0c5`.
5. Starting commit: `7429db500533b1c1945e9b60016d6fb52c9ce7e6` from released `codex/kids-learning-audit-20260910-4779`.
6. Spelling red test `f5f2ced`; accepted product fix `33a26ea4851dc70d74d6bb8b51f2a577e5251de6`; Spelling evidence `aeba4d504eac8cb49df68bda8cf05e9d5ac52327`.
7. Art runner checkpoints `fb9e9b3`, `6dd3b49`, `2b500ff`; final tracked audit evidence `ccef5184390311bb0fe70d7ecb414606f29b3fb9`.
8. The next commit contains this final handoff only. Release the outgoing checkout at that exact clean commit.

## Spelling repair complete

1. The unchanged baseline reproduced all five Spelling T6-T10 phone clipping rows. T10 GUITAR placed its required `U` at `x=-64..-8` outside 390px with no horizontal scroll, blocking completion and wrong-answer recovery.
2. Permanent red-first regression failed 8/15 before the fix. The minimal product change adds only width/box-sizing/padding constraints to the Spelling body and letter grid; words, scoring and difficulty are unchanged.
3. Post-fix regression is 15/15. Focused T6-T10 Learning rerun is 77 PASS / 0 FAIL / 23 NA / 20 BLK. Phone 390x844, narrow 320x568 natural scroll, tablet and desktop renders show 58-65px letter targets and zero horizontal overflow.
4. Independent exact-commit review at `33a26ea` found no P1/P2. Historical red was reproduced; the committed regression passed 15/15; expanded T1-T10 × four viewports passed 40/40 with 316 letter clicks, 40 reloads, 3-8-letter and duplicate-letter words, plus wrong/correct recovery.
5. Guarded import changed exactly seven dimensions from FAIL to PASS and five row verdicts from FAIL to BLK. No broader ledger claim was made.

## Art resilience complete

1. Read all four activities and their engines/tests before writing activity-specific probes. Final scope: Stamp Art, Free Paint, Color Splash and Color In × T1-T10 × desktop 1280x900 and touch-phone 390x844 = 80 rows.
2. Final guarded report: **1,202 PASS / 20 expected FAIL / 628 NA / 230 BLK**. There are no runner/runtime or unexpected failures. The corrected Color In known-ray drag probe passed all 10/10 desktop rows before the final full run; its preliminary harness-error captures were not imported or archived.
3. **Confirmed P2, reported before any fix:** Color Splash phone color pips are 42x42px in every T1-T10 row, below the Kids 44px child-target floor. Desktop pips are 52px. Ten internal layout failures and ten canonical visual-quality failures describe the same geometry; only the ten canonical dimensions enter the ledger.
4. All 80 rows passed launch, visible play affordance, input, Back/Home, rapid/multi-pointer recovery, boundary input, keyboard misuse, rotation with artwork preservation, reload, repeated exit/re-entry, malformed synthetic state and controlled offline reload. Mechanic-level PASS/NA remains explicit for scene/page progression, Clear/Undo recovery, outside drag, animation interruption, score, wrong answers, media/audio and timer expiry. Rewards, long soak and unaudited full visual judgement remain BLK.
5. Representative T1/T5/T10 phone and desktop renders for all activities were inspected. No other clipping, crowding or unreadable control was found. No Art product fix was made.

## Current truth and durable evidence

1. Canonical ledger: **6,857 PASS / 26 FAIL / 7,323 BLK / 2,294 NA** across 16,500 dimensions; 26 FAIL rows and 634 BLK rows. All 660 rows remain unfinished; PARTIAL/NOT_RUN is distinct from product failure and access/environment block.
2. Final `npm test`: 312 tests, 303 pass, 9 fail, zero skip. All failures are existing expected-red Bubble Pop T1-T4 cue assertions including Node parent-group accounting. This is not an all-green suite. The earlier `seek-companions` suite-concurrency-only failure did not recur.
3. Animal Sounds remains report-only. All 30 manifest animal SFX exist and seven extra files are present. Quiz cue `Which animal makes this sound?` has all four clips but is wrong for garden exploration. Proposed bounded garden cue `Tap an animal to hear its sound!` is absent from the manifest and needs four real clips through the separately approved credential route; no provider call or Animal fix occurred.
4. Unique same-project archive: `C:\Users\HomeSeer\OneDrive\Documents\Claude\Projects\Kids_App\audit-evidence-archive\2026-09-10-spelling-art-01a08d26`.
5. The archive contains two final reports, nine Spelling renders, 24 representative Art renders, ten exact Color Splash finding renders, README and SHA256SUMS. All 46 listed artifacts independently matched; manifest SHA-256 `67424f7182d4eee3481b1539f63ef3c42e07a7021eccf3aaa41b358a18d8a53c`.
6. Source evidence remains ignored and was not moved or deleted. No child screenshot is committed.

## Next authorized decision

1. Color Splash P2 and Animal Sounds P2 are reported findings. Do not fix either without the next bounded authorization; Color Splash needs a minimal 44px phone target repair and exact-commit review, while Animal also needs the approved four-clip route.
2. Bubble remains blocked on its four actual clips and approved credential route. Preserve its expected-red suite and do not make speech claims from manifest/file existence alone.
3. Continue the remaining child-experience audit only through a new CEO-created same-project task and managed checkout at this handoff commit. Do not reuse e0c5, 4779, 4683, f502 or e2bb.

## Boundaries

1. No production/main, push, merge, deploy/promote, secrets/credential-file read, PII/customer data, provider/account/paid call, upload/post, remote application-data mutation, security or gate change occurred.
2. Non-production Cloudflare company login remains allowed only if necessary for an exact audit scope; localhost required none here.
