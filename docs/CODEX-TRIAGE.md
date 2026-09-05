# Codex triage — Kids

Real verdicts for every HIGH finding on file in `CODEX-NOTES.md` (git-ignored, local-only --
Scott's own copy, not reproduced here). MED and LOW findings are not gated by the promote script
and are not repeated here; they are tracked in the app inbox. Each entry below was checked against
the CURRENT code (or an explicit, cited git history) before writing a verdict -- a verdict without
reading the code is not a verdict (Testing Standard §3.5 / Deploy & Release Standard PART D6.7).

The one entry marked **PENDING** below is deliberate: it is a real, still-open gap discovered in
the most recent (2026-09-02) review, and no prior session has made a considered risk call on it.
Writing "ACCEPTED RISK" myself for a fresh, undecided security gap on a children's app would be
inventing Scott's answer for him -- so it stays untriaged on purpose, and `scripts/promote.mjs`
will correctly refuse to promote until a human writes a real verdict for it. This is the gate
working as designed, not a bug in this triage pass.

---

### 1. HIGH — The new public-endpoint throttles are still easy to bypass and their log tables grow forever.
**Verdict: PENDING — no verdict written.** Confirmed real by reading the cited lines
(`workers/sync/src/index.js`): the invite check counts failures then inserts afterward (a
concurrent burst can pass the count before any row exists), sign-in's PBKDF2 hash runs before the
failure is logged (one caller cycling fake emails from one IP spends unlimited CPU), and
`invite_fail_log`/`signin_fail_log_v2`/`signup_log` have no index and no expiry. None of this is
reachable through the static-site gate this task built (it lives entirely in the sync Worker,
which is its own separate, manual deploy) -- but it is a real, currently-live gap, not a
theoretical one, and the fix (edge-level rate limiting, atomic bounded counters, indexes +
scheduled expiry) is real engineering work, not something to wave through to unblock a gate.
Flagged plainly in this session's report to master/Scott. Existing mitigation already in place
(so this is a refinement gap, not an absent one): per-IP invite throttle (finding #5 below) and
(email, IP)-keyed sign-in lockout (finding #6 below) both already ship.

### 2. HIGH — Production can still be deployed from the wrong clean branch without the required promotion confirmation.
**Verdict: FIXED** (this session, commits `a77aabb`, `d2dd2c3`, `cef5157`). `deploy:prod-preview`
is retired -- it now refuses outright with no wrangler invocation at all (`package.json`).
`scripts/promote.mjs` is the one production door: it requires a clean tree, `HEAD` matching
freshly-fetched `origin/main` exactly, branch `main`, a `DEV-VERIFIED.json` stamp for that exact
commit, and Scott typing the version number -- all re-checked immediately before the deploy call.
Proven with 13 negative-control tests in `tests/promote.test.mjs`, each spawning the real script
against a scratch repo with exactly one thing wrong.

### 3. HIGH — The new local verification server can serve forbidden files to other devices on the network.
**Verdict: FIXED** (commit `378b594`). `scripts/serve.mjs` now binds explicitly to `127.0.0.1`
(confirmed in current code: `server.listen(PORT, '127.0.0.1', ...)`), so no other device on the
network can reach it at all -- the exact concern this title names. Dotfile paths (`.env` and
friends) are also refused outright now. A narrower gap remains -- a LOCAL browser request can
still traverse a sibling folder or reach a non-dot sensitive filename via the `startsWith(ROOT)`
text-comparison boundary -- but that is the 2026-09-02 review's own item 3, downgraded to MEDIUM
there precisely because the network-exposure half (what made this a HIGH) is closed. MED findings
do not block promote; tracked in the app inbox.

### 4. HIGH — Yoto cover data can still execute script after navigating away from Listening Hut.
**Verdict: FIXED** (commit `cf9513b`). `js/yoto-player.js`'s shared mini-player now runs the cover
URL through the same HTTPS-only allow-list `listen/index.html` already used, builds the image via
`createElement`/`.src` (never `innerHTML`), and `listen/index.html` publishes the validated address
to shared state instead of the raw one. Confirmed live today: `tests/hostile-input.test.mjs`'s
"Yoto mini-player: a hostile cover address stays inert, a real https one still shows" passes.

### 5. HIGH — The invite word has an unlimited online guessing oracle.
**Verdict: FIXED** (commit `6ffd21a`). A per-caller (IP-hash) throttle now exists
(`invite_fail_log`, 15 wrong guesses/hour), confirmed live today via
`tests/sync-signup-invite-throttle.test.mjs`'s passing suite ("a wrong invite word is refused...",
"repeated wrong guesses... eventually throttled", "the guess throttle is keyed per caller"). The
throttle's OWN refinement gaps (count-then-insert race, unbounded log growth) are a distinct,
newer finding -- tracked as #1 above (PENDING), not reopened here.

### 6. HIGH — The new sign-in limiter enables account lockout and unbounded database/CPU abuse.
**Verdict: FIXED** (commit `d810d54`). The failure counter is now keyed on (email, caller) rather
than email alone, closing the "anyone can lock out a real family for free" bypass -- confirmed
live today via `tests/sync-signin-lockout-scope.test.mjs` ("a stranger sending wrong passwords
cannot lock the real family out", "a single caller repeatedly guessing... is still throttled").
The (email, IP) keying itself is a deliberate, documented 2026-09-01 trade-off (an attacker
rotating real IPs gets a fresh budget per IP, judged worth it for a family app, not a bank) -- not
silently accepted, explicitly decided and written down at the time. The PBKDF2-before-log and
unbounded-log gaps in this same code are the newer finding tracked as #1 above (PENDING).

### 7. HIGH — Account deletion can remove the login while leaving the child's synced data behind permanently.
**Verdict: FIXED** (commit `d810d54`). Deletion now runs as one `env.DB.batch([...])` call --
both rows go or neither does. Confirmed live today: `tests/sync-delete-account-atomic.test.mjs`'s
"if the data delete fails, the account delete is rolled back too (nothing orphaned, nothing
half-gone)" and "a normal, fully-successful delete removes both the account and its data" both
pass.

### 8. HIGH — The new production deployment command explicitly permits uncommitted or incomplete code.
**Verdict: FIXED** (this session, commits `a77aabb`, `d2dd2c3`). `deploy:prod-preview` (the
`--commit-dirty=true` command this finding names) is retired outright -- it no longer invokes
wrangler at all. `scripts/stage-site.mjs` still technically reads working-tree bytes for
git-tracked files (not `git show HEAD:`), and still silently skips a tracked-but-locally-deleted
file -- both true today, unchanged -- but the ONLY path that now reaches a real production deploy
is `scripts/promote.mjs`, whose own clean-tree check (re-run immediately before the deploy call
too) guarantees disk and `HEAD` are identical by the time staging runs. A locally-deleted tracked
file would show as a pending deletion in `git status --porcelain` and refuse the whole promote
before staging is ever reached. The residual behavior in `stage-site.mjs` is real but unreachable
through the one door that exists now.

### 9. HIGH — The new staging allow-list can still publish ignored or untracked private files.
**Verdict: FIXED** (commit `18e4970`). Confirmed in current `scripts/stage-site.mjs`: it builds
its file list from `git ls-files -z -- <allowed paths>` and copies only files git tracks --
exactly the suggested fix. The commit's own verification (dropping a junk file inside `js/` and
confirming it does not appear in the build) matches this finding's suggested test.

### 10. HIGH — Lock down the public backup trigger immediately.
**Verdict: FIXED** (commit `b1fb4ae`). `/run` on the backup Worker now requires an
`X-Backup-Secret` header, confirmed live today: `tests/backup-auth.test.mjs`'s "/run with no
secret header is rejected", "/run with the wrong secret is rejected", "/run with a same-length
wrong secret is still rejected", and "/run is refused when BACKUP_SECRET is not configured" all
pass.

### 11. HIGH — Stored script injection remains in several screens.
**Verdict: FIXED** (commits `31361b7` videos/index.html, `0a2f4dc` js/game-settings.js, `a9bb07e`
listen/index.html, `74092fc` parent/settings.html). All four files this finding cites now render
untrusted values as text (`textContent`/DOM construction), never raw markup. Confirmed live today
via `tests/hostile-input.test.mjs`: every one of "the Watch screen does not paste a channel label
into markup", "the in-game settings overlay does not paste a name into markup", "parent settings
does not paste the sync email/picture address into markup", "the Yoto mini-player does not paste a
cover address into markup", plus the corresponding hostile-input browser tests, pass.

### 12. HIGH — Cloud sign-in supports only one signed-in device despite promising multi-device sync.
**Verdict: ACCEPTED RISK — pre-existing, already-disclosed limitation, not a new decision made
here.** Confirmed still true in current code: `accounts.sync_key` is a single column, replaced on
every sign-in (`workers/sync/src/index.js`). `docs/verify/VERIFYING.md`'s own "Known traps" #2
already documents this exact behavior ("Signing in on a second device silently signs the first one
out... Do not read a green sync check as 'sync works'") and tracks a real fix as "Stage 1b in the
migration spec." A per-device sessions table is a genuine architecture change, correctly scoped
outside a promote-gate task -- recorded here, not decided here.

### 13. HIGH — Add brute-force protection to cloud accounts.
**Verdict: FIXED** (commits `356c3b1`, `6ffd21a`, `d810d54`). Brute-force protection now exists on
both the endpoints this finding named: invite-word guessing is throttled per caller, and sign-in
has an (email, caller)-keyed lockout after repeated failures, with enumeration closed (identical
response/timing for "no account" and "wrong password", confirmed in `356c3b1`'s own verified
description). Refinement gaps discovered in that same protection by the newer 2026-09-02 review
are tracked separately as finding #1 above (PENDING) -- this finding's original, narrower ask
(some protection exists) is met.

### 14. HIGH — Personalized voice clips are publicly enumerable.
**Verdict: ACCEPTED RISK — a real, disclosed, deliberate partial fix, not a fresh call made here.**
Commit `356c3b1` added a hashed-IP daily cap (50/day) and made the response non-publicly-cacheable,
a genuine mitigation against the exact "test many names for free, cache the results" abuse this
finding describes. The endpoint deliberately still needs no session token: `home.html` fetches a
purchased greeting from a child's own home screen on whatever device the family is using,
including offline, and the commit message says plainly why a full signed-URL fix was not
attempted ("a client change I cannot safely verify without a real device") and that this was
"documented as the honest partial fix, not claimed as the full one." Recording that existing,
disclosed decision here, not inventing a new one.

### 15. HIGH — Account deletion and password recovery do not exist, while the privacy page implies complete deletion is available.
**Verdict: ACCEPTED RISK — deletion half is fixed; recovery half is a real, disclosed, still-open gap.**
Deletion is real now: `POST /delete-account` (commit `356c3b1`) removes both rows atomically
(hardened further in `d810d54`), with a real two-step confirm UI in `parent/settings.html`.
Checked `privacy.html` today -- its current wording ("use 'Delete cloud account & synced data' in
Parent Settings -- this deletes the account and every synced profile immediately... Nightly
backups made before a deletion may retain a copy for a short period afterward") is accurate to
what the code actually does; it does not overpromise recovery. Password recovery is still
genuinely a stub: `workers/sync/src/index.js`'s `/reset` returns `202` with "Email-based password
reset is not yet enabled. Contact the app owner for help." -- confirmed in current code. Commit
`356c3b1` already flagged this as "a cost/infra decision, not a code fix; flagged to master rather
than built silently" (it needs a real email-sending capability). Recorded here, not decided here.

### 16. HIGH — Sign-in can remain stuck on “Working…” when the network is unavailable.
**Verdict: FIXED** (commit `c887d87`). Confirmed live today via 4 passing tests: "the sync request
cannot throw, and cannot hang for ever", "the words js/sync.js uses for a dead network are words
parent settings understands", "signing in with no network at all recovers with a readable
message", "signing in when the sync server never answers recovers once the deadline passes."

### 17. HIGH — Core child navigation is not accessible to keyboards or screen readers.
**Verdict: FIXED** (commits `b22bc84` home screen, `cad187d` profile picker, plus matching
conversions in the section hubs). Confirmed in current code: `index.html`'s avatar buttons,
`home.html`'s hub-world landmarks (`document.createElement('button')`, class `spot`), and
`games/index.html`, `learning/index.html`, `art/index.html`'s activity cards all construct real
`<button>` elements now, not clickable `<div>`s -- exactly the suggested fix. `listen/index.html`
and `videos/index.html` also confirmed on real `<button>`s via their own dedicated a11y commits
(`d91b447`, `0ba9069`).

### 18. HIGH — The DEV-VERIFIED stamp does not prove BASE is running the commit it names (Codex 0903-2).
**Verdict: FIXED** (commit `ebf599f`). `scripts/dev-verify.mjs` now fetches `js/version.js` live
from `BASE` after the drive passes and requires its `APP_VERSION` to match `git show
HEAD:js/version.js` for the commit being stamped -- extracted into
`scripts/lib/version-check.mjs` (`extractVersion`, `checkLiveVersionMatches`) so a mismatch, a
non-OK response, or an unreachable `BASE` all fail loud and write no stamp instead of silently
stamping the current commit as verified. Confirmed live today via `tests/version-check.test.mjs`
(7 cases: match, mismatch, non-OK response, unreachable BASE, unreadable version). `npm test`:
140/140 at the time of the fix.

### 19. HIGH — Production could still stage from the working tree instead of the reviewed commit (Codex 0903-3).
**Verdict: FIXED** (commit `457f984`). `scripts/promote.mjs` no longer runs `npm run stage`
(`fs.copyFileSync` off disk) for the prod path -- it now calls `stageFromGitHead`
(`scripts/lib/stage-from-git.mjs`), which reads every file's bytes straight out of git's object
database (`git show <sha>:<path>`) for the exact commit being promoted, closing the window where a
background process or editor autosave between the last clean-tree check and the network upload
could ship unreviewed content. `--commit-dirty=true` is dropped from the prod wrangler call, since
a git-object build owes wrangler no dirty-tree exception. `scripts/stage-site.mjs`'s own `npm run
stage` (used by `deploy:dev1`) is unchanged and still working-tree-based on purpose -- dev wants
fast uncommitted iteration. Confirmed live today via `tests/stage-from-git.test.mjs` (commits a
file, dirties the same path on disk without committing, and asserts the staged output has the
committed bytes, not the dirty ones) and a `tests/promote.test.mjs` source guard confirming
`--commit-dirty=true` is gone from the prod deploy line. `npm test`: 144/144.

### 20. HIGH — The new shared PIN lockout is missing from the offline app, so both protected doors fail open (Codex 0905-1).
**Verdict: FIXED** (commit `6506690`). `js/pin-lockout.js` is loaded by both `home.html`'s
exit dialog and `parent/settings.html`'s PIN gate, but was missing from `sw.js`'s `ASSETS`
precache list -- confirmed by reading the array directly. After a service-worker update plus an
offline launch the file could be uncached, and both fallbacks failed OPEN: `parent/settings.html`'s
`_isLocked()` (line 724) returned `false` with no lockout module, and `home.html`'s
`refreshLockout()` (line ~512) re-enabled the keypad -- unlimited PIN guesses at either door.
Fixed three ways: (1) `./js/pin-lockout.js` added to `sw.js`'s `ASSETS`, `CACHE` bumped to
`vb-v145`; (2) a new source-guard test, `tests/sw-required-shell.test.mjs`'s "every js/*.js
<script> tag in home.html and parent/settings.html is in the SW ASSETS precache list", checks the
whole class of page-script-vs-ASSETS gaps, not just this one file; (3) both fallbacks now fail
CLOSED instead of open -- `parent/settings.html`'s `_isLocked()` returns `true` (not `false`) and
`_refreshLockoutUI()` blocks the pad with a plain message when the module is absent;
`home.html`'s `refreshLockout()` and its digit-click handler do the same. Confirmed live today via
`tests/pin-lockout-fails-closed.test.mjs` (2 new browser tests: blocks the real network request
for `js/pin-lockout.js` the way an incomplete offline cache would, then proves the keypad refuses
input at both doors -- even the correct PIN does not get through the exit dialog). Negative
control: removing `./js/pin-lockout.js` from `ASSETS` makes the new source-guard test fail;
restoring it passes again. Full suite: 153/153 passing, 0 failing (before this fix, with the same
new tests present: 150/153, the 3 new tests failing as designed).

### 21. HIGH — Test-only environment variables can replace the real production deploy and both verification targets. (Codex 0905-2)
**Verdict: FIXED** (commit `0d6914e`). `scripts/promote.mjs:114-118`'s four env-var overrides
(`PROMOTE_WRANGLER_CMD`, `PROMOTE_CF_API_BASE`, `PROMOTE_VERSION_CHECK_HOSTS`,
`PROMOTE_VERIFY_POLL_MS`) now refuse loudly, in the same `die()`/refusal format as the rest of the
D6 list, unless `PROMOTE_ALLOW_OVERRIDES=1` is also set by hand (`scripts/promote.mjs:123-136`, a
new check 0, run before anything else). `promote-kids.bat` clears every `PROMOTE_*` variable
before ever calling `npm run promote`, so a real run never has any of them set to begin with.
Confirmed live today via `tests/promote.test.mjs`: "promote refuses when a PROMOTE_* override is
set without the opt-in", "promote refuses on EACH of the four override env vars alone", a source
guard proving `promote-kids.bat`'s clear runs before `npm run promote`, and "promote honors
overrides once PROMOTE_ALLOW_OVERRIDES=1 is also set" (the one legitimate test user of these
overrides, updated to set the opt-in explicitly). Full file: 22/22 passing.

### 22. HIGH — The attempted dev-verification fix still proves only a shared version number, not the commit it stamps. (Codex 0905-3)
**Verdict: FIXED** (commit `a5ddff3`). `js/version.js`'s `APP_VERSION` is unchanged (still `1.0.0`,
still the only place it is hard-coded) -- the fix adds a second, separate signal instead of
overloading that one. A new served artifact, `version.json`, names the full commit sha a build was
staged from: written by `scripts/lib/stage-from-git.mjs` (prod, resolving a short sha to full) and
`scripts/stage-site.mjs` (dev, at `npm run stage` time), and computed live by `scripts/serve.mjs`
for local testing (the workflow `scripts/dev-verify.mjs`'s own header documents, which would
otherwise 404 on this new check). `scripts/lib/version-check.mjs` gains
`checkLiveCommitMatches(base, localCommit, fetchImpl)`; `scripts/dev-verify.mjs` adds a `[4/4]`
step that fetches it and refuses unless the live commit equals `git rev-parse HEAD` for the
commit being stamped. Confirmed live today via `tests/version-check.test.mjs` (6 new unit tests
with a fake fetch, including "refuses when the SAME version is running but a DIFFERENT commit" --
the exact scenario this finding names), `tests/stage-from-git.test.mjs` and `tests/stage-site.test.mjs`
(each proving their build writes `version.json` naming the real commit), and
`tests/serve-version-json.test.mjs` (new; proves the local server's live route). Manually confirmed
end-to-end against a real `node scripts/serve.mjs`: same commit -> `ok:true`; a wrong commit ->
`ok:false` naming both shas. Combined 9 touched test files: 61/61 passing.

### 23. HIGH — Production staging still takes its file list from the mutable index, not from the commit being shipped. (Codex 0905-4)
**Verdict: FIXED** (commit `e90bb78`). `scripts/lib/stage-from-git.mjs:19` now enumerates with
`git ls-tree -r -z --name-only <commit>` instead of `git ls-files` (the mutable index), so there is
no second, driftable source of truth for what the target commit contains. A path the commit's own
tree names whose blob then cannot be read is now a hard abort (throws, names the file, wipes the
partial output) instead of the old silent `continue`. Confirmed live today via
`tests/stage-from-git.test.mjs`: "staged output is complete even when the INDEX has been changed
after the target commit" (a real `git add` / `git rm --cached` after the target commit, proving
`ls-tree` is immune to the exact drift this finding names) and "a blob the target commit lists but
cannot actually be read is a HARD failure, never a silent skip" (a negative control built with real
git plumbing -- `git mktree --missing` + `git commit-tree` -- a tree entry referencing a blob sha
never written to the object database). Full file: 7/7 passing;
`tests/promote.test.mjs` (calls `stageFromGitHead` for its own runtime test): 22/22 still passing.

---

## Summary

22 of 23 HIGH findings on file have a real, code-verified decision. 1 (finding #1, the throttle
refinement gaps from the 2026-09-02 review) is left genuinely open on purpose -- `scripts/
promote.mjs` will refuse to promote until a human writes a real FIXED/REJECTED/ACCEPTED RISK
verdict for it here. That is correct, intended behavior for a live, undecided security gap on a
children's app, not a defect in this triage pass. (2026-09-04: master has already ruled finding #1
FIXED-by-build, size M -- see `Notes\Kids — open Codex ledger (2026-09-04).md` §2.1 -- but the
verdict here stays PENDING until the actual D1 fix lands and is verified, not merely ordered.)

Findings #5-#7 of the 2026-09-05 daily delta review (CSP `media-src` blocking Yoto audio, an
expired sleep timer racing the mini-player's `register()`, and sync accepting malformed profile
entries) are MEDIUM and are not gated by the promote script -- left untriaged here on purpose,
tracked in the app inbox instead, per this file's own header.
