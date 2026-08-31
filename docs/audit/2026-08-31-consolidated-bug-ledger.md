# Consolidated bug ledger

Merges three sources into one numbered list with a real status per item: the
2026-08-25 holistic audit (`CODEX-NOTES.md`), the 2026-08-30 triage of that
audit's follow-up findings (`docs/audit/2026-08-30-codex-triage.md`), and
everything actually fixed in this repo since. Written 2026-08-31 for the
Kids-app-overhaul work order (Phase 1, item 2).

Status key: **FIXED** (shipped, and how it was proven) · **OPEN** (real, not
started) · **PARKED** (real, deliberately deferred, with the reason).

---

## HIGH

| # | Finding | Status |
|---|---|---|
| 1 | Backup Worker `/run` — no authentication, anyone could dump the DB | **FIXED.** `X-Backup-Secret` header required, fails closed if unset. Proved live: unauthed 401, wrong-secret 401, correct 200, nightly cron unaffected. Commit `b1fb4ae`. |
| 2 | Stored XSS in 4 screens (videos channel label, game-settings profile name, parent-settings sync email, listen/Yoto titles+covers) | **FIXED**, all four plus one more found in passing (a coloring-page image address). `tests/hostile-input.test.mjs` proves it by reverting each fix and watching the test fail, then restoring it. Commits `a9bb07e`, `31361b7`, `0a2f4dc`, `59b6001`, `688220e`. |
| 3 | Cloud sign-in is single-device — a new sign-in silently kicks the old one | **OPEN.** This is Stage 1b of the hosting migration spec and is the literal meaning of Scott's "sign in on any device" ask. Needs a sessions table (one hashed token per device) replacing the single `sync_key`. Not started. |
| 4 | No brute-force protection on signup/signin; sign-in errors reveal which emails exist | **FIXED, 2026-08-31.** Signup needs an invite word (`SIGNUP_CODE`, fails closed) plus per-IP/global daily caps. Sign-in: "no account" and "wrong password" now return the identical status+message, pbkdf2 always runs (timing-safe), and 8 failed attempts in 15 min locks the account out — proved live to block even the *correct* password while locked. Commit `356c3b1`. |
| 5 | Voice clips served with no auth, predictable key, cached publicly for a year | **PARTLY FIXED, 2026-08-31.** Hashed-IP daily cap (50/day) added, and the response is no longer publicly cacheable. **Deliberately not full session auth** — the endpoint is fetched from a child's own home screen, possibly signed-out/offline, and a stricter fix couldn't be verified without a real device. Master's ruling: check at the tablet-in-hand step of the Cloudflare migration. Commit `356c3b1`. |
| 6 | No account deletion or password recovery, while `privacy.html` implies both | **PARTLY FIXED, 2026-08-31.** Real authenticated `POST /delete-account` ships — proved live end to end (signup → delete → sign-in on that email fails). `privacy.html` rewritten to describe it. **Password recovery still open** — needs an email-sending vendor this Worker doesn't have; spec written (`docs/superpowers/specs/2026-08-31-password-recovery.md`, proposes Resend, ~$0/mo, Kids-scoped key), nothing built, rides to Scott through master. Commit `356c3b1`. |
| 7 | Sign-in hangs on "Working…" forever offline | **FIXED.** `_request` in `js/sync.js` never throws now; every failure returns `{ok:false, error}`. 15s abort timeout added. Proved with a real browser against both a dead connection and a stalled one. Commit `c887d87`. |
| 8 | Core child navigation not reachable by keyboard or screen reader | **FIXED, 2026-08-31.** Every clickable `<div>` across `index.html`, `home.html`, the three section hubs, Watch, and Listen converted to a real `<button>`. Proved live: Tab/Enter/Space walked through all 7 pages in real Chromium, 43/43 checks passed (every control reachable, named, activates on both keys). Before/after screenshots pixel-identical. Commits `cad187d`, `b22bc84`, `baeef4f`, `0ba9069`, `d91b447`. **Deliberately out of scope:** Listen's play/pause/skip transport buttons were already fully accessible and untouched — flagged, not a gap in this fix. |
| — | (2026-08-31) Tier gating only ever proven from the allowed side — nothing stopped a direct URL/bookmark opening an above-tier activity | **FIXED.** Investigation found NO activity page enforced its own tier at all — only menus hid the card. One shared guard added in `js/app.js` (every activity page already loads it), reusing the app's own `isActivityVisible()`. Proved 4 directions: below-min blocked by URL and by menu, past-maxTier (ABCs) blocked the same way, parent override still works. Commit `c6b94d8`. |
| — | (2026-08-30 sweep) Deploy could publish untracked/ignored files — `stage-site.mjs` copied whole working-tree directories | **FIXED.** Now builds the staged copy from `git ls-files`, not the filesystem. Proved by planting a junk file inside an allowed directory and confirming it does not appear in the build. Commit `18e4970`. |

## MEDIUM

| # | Finding | Status |
|---|---|---|
| 9 | Parent PIN is a deterrent, not security; inconsistent lockouts; gear hold was 700ms not 3s | **PARTLY.** Gear-hold discrepancy documented (`docs/verify/features/parent-pin-gate.md`) but not changed — 3s vs 700ms is a real product decision, not obviously a bug, and is flagged for Scott rather than silently "fixed" either direction. Exit-PIN's missing lockout still open. |
| 10 | Sync key and Yoto tokens sit in localStorage, unencrypted | **OPEN.** Mitigated somewhat by closing the XSS paths above, but the tokens are still readable by any script that runs on-origin. |
| 11 | Cloud profile payloads have no schema validation | **OPEN.** |
| 12 | Voice generation quota is per-account and non-atomic — open signup made it walkable | **FIXED**, alongside item 4: a global daily cap (`VOICE_DAILY_GLOBAL`) now bounds total spend regardless of account count, checked before the per-account limit. Not atomic yet (a true race between two simultaneous requests near the cap could still slip one extra through) — acceptable given the global cap now exists at all; a stronger fix would need a D1 transaction. |
| 13 | Future birthday accepted, silently makes a child Tier 1 | **FIXED.** `max` on the date input, and the save path refuses a future date outright. 12 new tests, proved to fail on the reverted code. Commit `6d2ab94`. |
| 14 | "Stamp picker" toggle does nothing; Memory Match cards ~42px at tier 10 on a small phone | **FIXED**, both. Stamp Art now reads the flag like every other activity does; Memory Match caps columns so cards stay ≥48px at any width, same difficulty. Commits `998ee8b`, `2ea6850`. One product call made in passing: honoring the toggle means under-12-month-olds no longer see the stamp row by default — correct per the tier label the app already shows, but a visible change; flagged to Scott, not yet confirmed. |
| 15 | Pinch-zoom disabled app-wide; ribbon shelf not keyboard-reachable | **OPEN.** |
| 16 | Offline download reports success by counting cached files, not verifying each one | **OPEN.** Written up explicitly as a known gap in `docs/verify/features/NOT-COVERED.md` rather than silently assumed fine. |
| 17 | No D1 schema migrations; disaster recovery unproven | **OPEN.** |
| 18 | No CI gate before Pages serves `main`; e2e harness had drifted (8 of 10 tiers) | **PARTLY.** `docs/verify/` recipe now exists and the nightly-test-kids robot runs it 4 nights/week (enabled 2026-08-30). It still only drives 10 of the app's activities and tiers 1–8 (see item below, and the ledger for what Phase 1 must close). No GitHub Action gate yet. |

## LOW

| # | Finding | Status |
|---|---|---|
| 19 | Default-theme contrast/readability issues in screenshots | **LIKELY ALREADY FIXED** by a later CSS override, per the 2026-08-30 agent's read — not re-verified visually this round. |
| 20 | Stale docs: old tier counts, old ages, old GitHub description | **MOSTLY FIXED.** Tier docs corrected earlier; GitHub description updated 2026-08-31. `TECH-STACK.md` still carries one historical "8" in an old comment — cosmetic. |
| 21 | Repo history is 1.2GB; `main` unprotected; no changelog separate from `sw.js` comments | **PARKED**, deliberately — rewriting history is a never-without-explicit-approval action and would break every clone/worktree. Worth knowing, not fixing. |
| — | (2026-08-31 sweep) `sw.js` cache write not awaited/`waitUntil`-bound; backup Worker's public message claimed a cron it no longer has; link checker missed single-quoted/escaping links | **FIXED**, all three. Commit `18e4970`. |

---

## What Phase 1(a) already answers

**The 2026-08-25 #1 backup-endpoint HIGH is independently verified fixed**, live,
today — not just claimed. Proof, repeated for this ledger:

```
curl -s -o /dev/null -w "%{http_code}\n" https://simplyknown-kids-backup.simplyknownfacts.workers.dev/run
```
→ `401` with no header, `401` with a wrong header, `200` only with the correct
`X-Backup-Secret`. The nightly scheduled backup runs through a separate code
path (`scheduled()`) untouched by this change.

## What Phase 1(b) still needs — updated 2026-08-31, close of Phase 1

1. ~~Voice-clip enumeration (HIGH #5)~~ — partly closed (rate limit); full session auth parked to the migration's tablet-in-hand step.
2. ~~Account deletion (HIGH #6)~~ — shipped. Password recovery still open, spec written, needs Scott's yes on Resend + a Kids-scoped key.
3. ~~Keyboard/screen-reader core navigation (HIGH #8)~~ — shipped and proven, 43/43 checks.
4. ~~Sign-in brute force + account-enumeration (HIGH #4)~~ — shipped and proven.
5. **Single-device sync (HIGH #3)** — the only item not started. Scoped as migration Stage 1b; not part of Phase 1's own close, since it needs the Cloudflare migration's dev environment to build against safely.

**Phase 1 is closed** except #3, which was always scoped to a different piece
of work (the hosting migration), and password recovery, which is a spec
awaiting Scott's decision, not a code task. One clean full run confirms
everything landed together: **58 screens driven, 58 passed, exit 0**; `npm
test` 53/53; negative control still exits 1 on a broken app.

## Extending the verify drive — the discrepancy to flag

The work order says "today 10 of 28" activities and tiers "1–8." Counted directly
against the repo: **22 activity pages** on disk (7 Play + 10 Learn + 4 Make, plus
Watch and Listen as their own screens = 24 reachable destinations), and the tier
system defines **10** tiers, not 8. The "28" and "1–8" figures don't match what's
on disk today — flagged for master rather than silently reconciled, since it
changes how big the extended-drive task actually is. `docs/verify/VERIFYING.md`
already documents that some historical docs said 8 tiers when the code says 10;
this may be the same stale-count habit resurfacing.

## Noted for a later phase (not action items now)

- **Parent preview of an above-tier activity.** Since `js/app.js`'s new direct-URL
  tier guard shipped (commit `c6b94d8`), a signed-in parent trying to preview an
  above-tier activity while a young kid's profile is active also gets bounced —
  correctly, since the guard can't tell "parent glancing ahead" from "kid found a
  link." The existing `activitiesVisible` per-profile override already covers this
  (a parent can force an activity visible), but master's note (2026-08-31): make
  that path obvious enough in Parent Settings that a parent finds it without being
  told. For the Phase 3 design pass, not a Phase 1 fix.
