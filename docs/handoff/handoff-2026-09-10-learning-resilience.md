# Kids App handoff — Learning resilience audit (2026-09-10, codex)

## Exact state

1. Project: Kids App.
2. Outgoing checkout: `C:\Users\HomeSeer\.codex\worktrees\4779\Kids_App`.
3. Outgoing task: `01a08d02-9ccd-7fb1-89ea-3fe756550f70`; CEO return address: `01a08c18-4f34-7570-a14b-42cb8afa6339`.
4. Branch: `codex/kids-learning-audit-20260910-4779`.
5. Starting commit: `6bf49eebe010f8b407c858d99c87f1f43e231ff8` from released `codex/kids-bubble-learning-audit-20260910-4683`.
6. Early test checkpoints: scaffold `ecfb0ef`; activity-specific failure/recovery probes `023fd27`; corrected default-mode classification `f782603`.
7. Tracked Learning evidence and canonical ledger: `6740bf745b1b8b091206919e3f294bd57597890b`.
8. The next commit contains this handoff only; the checkout is clean after it.

## Completed

1. Built a self-owned, health-checked Learning resilience runner using deterministic valid lesson randomness, synthetic profiles, a free local port and a guarded report. It tests all 10 Learning routes × T1-T10 × desktop 1280×900 and touch-phone 390×844 = 200 rows.
2. Final report: 3,036 PASS checks / 20 expected FAIL / 950 explicit NA / 795 BLK; zero runner/runtime or unexpected product failures. The importer rejects incomplete, duplicate, wrong-baseline, unexpected-failure or missing-expected-failure reports and is idempotent.
3. **Confirmed P2:** Animal Sounds T1-T4 has no title, visible instruction, protected spoken instruction or replay control on phone or desktop. Eight canonical instruction cells fail. The garden branch returns before the quiz guidance UI. Reported in the Kids inbox before any fix; no fix is authorized or made.
4. **Confirmed P2:** Spelling Bee T6-T10 phone clips letter tiles beyond 390px with no horizontal scroll. Deterministic T10 GUITAR hides required `U` at `x=-64..-8`, so completion and wrong-answer recovery are impossible. Five visual-quality cells plus T10 input/wrong-answer cells fail. Reported before any fix; no fix is authorized or made.
5. Canonical ledger after guarded import: **5,878 PASS / 23 FAIL / 8,933 BLK / 1,666 NA** across 16,500 dimensions; 21 FAIL rows, 639 BLK rows; 562 PARTIAL and 98 shared NOT_RUN. Unexecuted work remains distinct from access/environment block and product failure. The invalid vanished-preview Games report remains excluded.
6. Full project suite is intentionally not green at this branch: Node reported 292 tests, 282 pass, 10 fail, zero skip. Eight expected Bubble toddler subtests plus their failed parent group account for nine. The remaining concurrent whole-file `seek-companions.test.mjs` failure passed 6/6 alone in 16.25s; no companion product defect was reproduced.
7. Representative final Animal Sounds T4 desktop and Spelling T10 phone captures were visually inspected and match DOM evidence. Audio success was not called human-heard proof; media rejection checks prove recovery only.
8. Durable evidence: `C:\Users\HomeSeer\OneDrive\Documents\Claude\Projects\Kids_App\audit-evidence-archive\2026-09-10-learning-resilience-01a08d02`. It contains final `report.json`, 13 final failure-row captures, an evidence README and `SHA256SUMS.txt`. All 15 listed artifacts independently matched; manifest SHA-256 `72d16c6b72f0d8574f5d2b524f62f4ff65730d737d39475178d1c66cf7ce5ae6`.
9. Two stale local Clock/Math captures from early harness-only failures remain in the ignored source output and were excluded from the final archive, not deleted. The ignored `node_modules` junction points only to the canonical same-project Kids dependencies; no install or package mutation was made.

## Bubble audio gate unchanged

1. No four recorded `Tap the bubbles!` clips were supplied in this task. No credential/secret file was read and no provider, paid or account action occurred.
2. Do not infer that the predecessor's suggested real generator command is safe merely because it is in a handoff. Inspect code dry-only before proposing a user run, and require the approved credential route plus actual four clips.
3. When approved clips exist, the already-authorized P2 remains narrow: T1-T4 compact visible cue, one `speakInstruction` call and existing replay only; no scoring, motion, T5-T10, settings or global audio change; independent exact-commit review required.

## Next continuation

1. CEO should create a new managed Kids task and checkout at this handoff commit; never reuse 4779, 4683, f502 or e2bb. Claim it before writing.
2. Bubble remains blocked; do not wait idle. Continue the comprehensive child-experience audit with the next untouched family: Art negative/failure/recovery T1-T10 on desktop and phone, evidence/tooling only. Report defects before any product fix.
3. Reuse the health-check, deterministic-randomness, explicit NA/BLK and guarded-import discipline from `learning-resilience.mjs`; commit early checkpoints. Do not copy Learning expectations into Art without reading each activity.
4. Preserve the current ledger exactly before import: 5,878 PASS / 23 FAIL / 8,933 BLK / 1,666 NA; 21 FAIL rows, 639 BLK rows. Preserve the invalid vanished-preview exclusion and distinguish NOT_RUN from runtime/access BLK.
5. Preserve new final reports in another unique same-project archive with verified hashes before release. No child screenshot commit and no source-evidence deletion.

## Boundaries

1. No Learning or Art product fix is authorized by this audit continuation; report defects first.
2. No production/main, push, merge, deploy/promote, secrets/credential-file read, PII/customer data, provider/account/paid call, upload/post, remote application-data mutation, security or gate change.
3. Non-production Cloudflare company login remains allowed only if necessary for the exact audit scope; localhost required none here.
