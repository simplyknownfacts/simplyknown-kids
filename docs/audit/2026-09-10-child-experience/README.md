# Comprehensive child-experience audit — 2026-09-10 (codex)

Status: INCOMPLETE full audit; baseline checkpoint saved. The authorized Yoto withdrawal is accepted at `df25aec3ba72b33e698d16a40fac7004e8f2171e` after independent fixed-commit review in a separate checkout.

1. Audit starting baseline: `c96cdbc15b1065f89575f6c3fc4c4ff4e0e92946`, matching local `kids/child-experience`; accepted post-withdrawal app state `df25aec3ba72b33e698d16a40fac7004e8f2171e`; isolated checkout `C:\Users\HomeSeer\.codex\worktrees\e2bb\Kids_App`, audit branch `codex/kids-experience-audit-20260910`. No remote baseline claim.
2. Charter missing from isolated worktree: read canonical same-project `C:\Users\HomeSeer\OneDrive\Documents\Claude\Projects\Kids_App\CLAUDE.md`; latest project handoff `handoff-2026-09-09-phone-bugs.md`. Its obsolete eight-activity list is not the inventory.
3. Local preview: `http://localhost:8798`; `/__health.json` identifies Kids and `/version.json` names `df25aec`. Standard server ignores Cloudflare `_headers`: CSP deployment parity remains a separate check.
4. Browser: initial spot checks used visible Codex in-app Chromium after Chrome creation timed out; the bounded cross-tier run used local Playwright Chromium with isolated synthetic profiles and no real family state. Desktop 1280×900 and touch-phone 390×844 are now partially exercised. Physical devices, audio heard by a human, iOS sensor behavior and external services remain separate gaps.
5. Evidence: screenshots under ignored `docs/verify/shots/audit-20260910/`; text observations and findings here. Yoto proof includes 287/287 regression tests plus a standalone phone/desktop/offline browser drive. Independent review first found the legacy per-profile token cleanup gap at `998852f`; red-before-green repair `df25aec` then passed re-review. Do not treat that bounded fix proof as completion of the wider activity matrix.

## Desk-routing screen (Scott.MD 6.4)

1. Change: complete child-experience audit; documentation and local evidence only. (codex)
2. Relevant desks: PMO/Design for child UX; Engineering/Audit for behavior and reproducible evidence, routed by CEO. (codex)
3. Not needed: Legal, Finance, Marketing and other desks; no product, sale, pricing, release or policy change. (codex)

## Boundaries

1. App implementation is limited to Scott's later explicit Yoto withdrawal, followed by independent fixed-commit review. No other fixes, production, deploy, promotion, merge, push, secrets, PII, paid service, gate edits or unrelated backend work.
2. Stop this task's preview when done. Claim/release documentation ownership and use same-project CEO continuation at context threshold.
3. Findings separate confirmed defects, blocked checks, design-quality findings and subjective taste. Each finding must name route, steps, expected/actual, severity, ages/devices, evidence and smallest plausible fix.

## Coverage protocol

1. Matrix rows are all 22 registered activities (8 Games, 10 Learn, 4 Art), plus shared child paths; reconcile against actual menu routes and on-disk pages.
2. Expanded requirement: every activity × T1–T10 × desktop/phone, with default-hidden tiers retained for visibility/parent-override checks. `coverage.json` is the canonical ledger: 440 activity plus 220 shared combinations, with 25 behavioral/negative/visual dimensions each.
3. Verdicts are PASS/FAIL/BLK/NA; unfinished BLK rows separately say NOT_RUN or PARTIAL, so queued work cannot be mistaken for a product failure. NA needs an explicit reason. After the Games and Learning resilience batches, all 440 activity combinations and 122/220 shared combinations are PARTIAL; 98 shared combinations remain NOT_RUN. Current dimensions: 5,878 PASS / 23 FAIL / 8,933 BLK / 1,666 NA; 21 rows have verdict FAIL and 639 remain BLK.

## Findings

See `baseline-observations.md` for exact partial interactions and gaps; `yoto-inventory.md` for Scott's authorized requirement and implementation direction; `matrix.md` for the original route inventory. Confirmed P2s are Bubble Pop T1-T4 missing play guidance, Animal Sounds T1-T4 missing play guidance, and clipped Spelling phone letter banks at T6-T10 with a required T10 letter unreachable. This remains an incomplete full audit, not a clean verdict.
