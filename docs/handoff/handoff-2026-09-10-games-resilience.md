# Kids App handoff — Games resilience audit (2026-09-10, codex)

## Exact state

1. Project: Kids App.
2. Checkout: `C:\Users\HomeSeer\.codex\worktrees\f502\Kids_App`.
3. Branch: `codex/kids-experience-audit-20260910`.
4. Accepted shipped-behavior baseline for this batch: `d6687a38b2a466e13de00f9553efeb23e9f84d8f`.
5. Games audit evidence commit: `81f7af62c62bde58e7195862584a55049e8fb08a`.
6. The next handoff commit contains this file only; checkout is clean after it.

## Completed

1. Preserved accepted Yoto withdrawal `df25aec` and independently reviewed compact-menu fix `d6687a3`; no product code changed in the Games batch.
2. Added a self-owned, health-checked local resilience runner in three small test commits, then recorded the guarded ledger import and evidence at `81f7af6`.
3. Exercised all 8 Games × T1-T10 × desktop 1280×900 and touch-phone 390×844 = 160 rows against the exact app baseline.
4. Final report: 2,115 PASS / 8 FAIL / 718 explicit NA / 359 BLK checks; no runner/runtime or other product failure. Full details: `docs/audit/2026-09-10-child-experience/baseline-observations.md#games-resilience-at-d6687a3`.
5. Ledger after import: 3,238 PASS / 8 FAIL / 12,538 BLK / 716 NA across 16,500 dimensions; 8 row verdicts FAIL, 652 rows still BLK.
6. Full `npm test`: 287/287 pass, zero fail/skip. Runner/importer syntax and `git diff --check` pass. Standalone Games runner exits non-zero by design while the eight confirmed product failures remain.

## Confirmed defect and next decision

1. P2 child-experience defect: Bubble Pop T1-T4 has no visible or spoken instruction on phone or desktop. Repro: select T1-T4 child → Games → Bubble Pop. Expected an immediate age-appropriate cue such as “Tap the bubbles!” Actual: only Back, Home, score and moving bubbles. T5-T10 display/speak the target-colour instruction and pass.
2. Source cause: `games/tap-pop.html` creates instruction UI/speech only inside the `tier >= 5` target-colour branch. Existing regression explicitly expects younger tiers to have score only and no replay instruction, so the repair must deliberately update that old expectation.
3. Proposed bounded repair, awaiting authorization: add a compact visible toddler cue and existing replay-instruction affordance for T1-T4 without changing scoring or motion; test red first; rerun the eight failed cells, Bubble HUD/rapid-input tests, full suite and independent fixed-commit review.
4. If repair is not authorized yet, continue the audit with Learning negative/failure/recovery T1-T10 phone/desktop, test/evidence only.

## Recovery and boundaries

1. The original claimed `e2bb` worktree disappeared externally during an uncommitted run; its preview then returned `not found`. The old 160-row/270-failure report is invalid environment evidence and was never imported. The branch survived intact; CEO authorized recovery into clean unclaimed `f502` and the runner was rebuilt/committed before rerun.
2. Preserve the orphan `C:\Users\HomeSeer\.codex\worktrees\e2bb\Kids_App` directory untouched until the CEO decides cleanup; its ignored evidence is not authoritative.
3. Scott's company identity-provider exception applies only to an exact Cloudflare-protected non-production site required by existing testing. Verify environment first; this local batch required no login.
4. No production/main, push, merge, deploy/promote, secrets/credential files, customer data, provider/account/grant/token/security change, paid call, upload/post, remote application-data mutation or gate change.
