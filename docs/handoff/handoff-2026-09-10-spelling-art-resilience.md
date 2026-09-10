# Kids App handoff — Spelling repair and Art resilience checkpoint (2026-09-10, codex)

## Exact state

1. Project: Kids App.
2. Active checkout: `C:\Users\HomeSeer\.codex\worktrees\e0c5\Kids_App`.
3. Active task: `01a08d26-7fcf-7623-8647-e7d4afa2d640`; CEO return address: `01a08c18-4f34-7570-a14b-42cb8afa6339`.
4. Branch: `codex/kids-spelling-art-20260910-e0c5`.
5. Starting commit: `7429db500533b1c1945e9b60016d6fb52c9ce7e6` from released `codex/kids-learning-audit-20260910-4779`.
6. Red test checkpoint: `f5f2ced`; accepted Spelling product fix: `33a26ea4851dc70d74d6bb8b51f2a577e5251de6`; guarded ledger evidence: `aeba4d504eac8cb49df68bda8cf05e9d5ac52327`.
7. The next commit contains this context-checkpoint handoff. Art has not started yet. The active checkout remains claimed while the authorized coherent Art batch continues.

## Completed Spelling repair

1. The unchanged baseline reproduced all five Spelling T6-T10 phone clipping rows. T10 GUITAR placed its required `U` at `x=-64..-8` outside 390px with no horizontal scroll, blocking completion and wrong-answer recovery.
2. Permanent red-first regression `tests/spelling-layout.test.mjs` failed 8/15 before the fix. The minimal product change adds only width/box-sizing/padding constraints to the Spelling body and letter grid; words, scoring and difficulty are unchanged.
3. Post-fix regression is 15/15. Focused T6-T10 Learning rerun is 77 PASS / 0 FAIL / 23 NA / 20 BLK across five rows. Phone 390x844, narrow 320x568 natural scroll, tablet and desktop renders were inspected with 58-65px letter targets and zero horizontal overflow.
4. Independent exact-commit review at `33a26ea` found no P1/P2. Historical red was reproduced; the committed regression passed 15/15; an expanded T1-T10 × four-viewport matrix passed 40/40, 316 letter clicks and 40 reloads, including 3-8-letter and duplicate-letter words plus wrong/correct recovery.
5. Guarded idempotent importer changed exactly seven ledger dimensions from FAIL to PASS and five row verdicts from FAIL to BLK. Current canonical ledger: **5,885 PASS / 16 FAIL / 8,933 BLK / 1,666 NA**; 16 FAIL rows and 644 BLK rows. Unfinished checks remain BLK.
6. Current full suite is intentionally not green: 312 tests, 303 pass, 9 fail, zero skip. All failures are existing expected-red Bubble Pop T1-T4 cue assertions including Node parent-group accounting. The earlier `seek-companions` suite-concurrency-only incident did not recur and remains distinct from product failure.

## Animal Sounds report-only result

1. T1-T4 returns from its garden branch before the quiz-only title, instruction and replay controls. The child gets no immediate cue until already knowing to tap an animal.
2. Every one of the 30 manifest animals has a real matching sound file; seven extra sound files are present. The quiz phrase `Which animal makes this sound?` has hash `37c85ff9` and all four configured voice clips, but it is misleading for exploration.
3. Bounded proposed repair: display `Tap an animal to hear its sound!`, speak it once on garden entry and expose the existing replay affordance; do not change animals, sound effects or scoring. The exact phrase is absent from the manifest and requires four real clips through the separately approved credential route. No provider call or product fix occurred.

## Authorized next batch

1. Read all four Art activities before encoding expectations: Stamp Art, Free Paint, Color Splash and Color In.
2. Build and checkpoint a self-owned Art runner for 4 activities × T1-T10 × desktop 1280x900 and touch-phone 390x844 = 80 rows, with activity-appropriate negative, failure and recovery checks. Also inspect 320x568 natural scroll where geometry warrants it.
3. Evidence/tooling only. Report any confirmed Art defect in the Kids inbox before a product fix; no Art product change is authorized in this batch.
4. Update only dimensions directly proven by the guarded report. Keep NOT_RUN, access/environment block, mechanic-level NA and product FAIL separate. Do not infer full visual quality or long-play completion from geometry.
5. Preserve final Spelling and Art reports plus selected ignored renders in a new unique same-project archive with independently verified hashes. Do not commit child screenshots or delete source evidence.

## Boundaries

1. Bubble audio remains blocked on four actual clips and its approved credential route. Do not call the full suite green and do not make speech claims from file existence alone.
2. No production/main, push, merge, deploy/promote, secrets/credential-file read, PII/customer data, provider/account/paid call, upload/post, remote application-data mutation, security or gate change.
3. Non-production Cloudflare company login is allowed only if necessary for the exact audit scope; localhost has required none.
