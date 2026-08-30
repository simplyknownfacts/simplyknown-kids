# Design — Kids App joins the fleet deploy standard

**Date:** 2026-08-29
**Status:** approved by Scott 2026-08-29
**Supersedes:** the "documented exception" in [[Deploy & Release Standard]] §5 / §9.1 and adoption-spec item 2

Move the Kids App off free GitHub Pages onto Cloudflare Pages, give it a gated `kids1` dev
environment, put a promote gate in front of production, and take the repository private.

---

## 1. Why

Kids is the last snowflake in the fleet. Free GitHub Pages gives one site per repo, which forced
three things the rest of the fleet does not accept: no dev environment, no gate in front of prod,
and a public repository (free Pages requires it). [[Deploy & Release Standard]] PART D5 records
Scott's decision of 2026-08-29 to end that exception.

## 2. Decisions on record

Each was decided by Scott on 2026-08-29 in this session unless noted.

1. **Three stages, hosting first.** Each stage ends in a working, provable state.
2. **GitHub Pages stays alive as a fallback** during cutover, and is retired only after Cloudflare
   is proven.
3. **Both sites are gated by a Cloudflare email link — production included.** The Kids app becomes
   a **private family app, not a public one, for now.**
   ⚠️ This deliberately reverses the Kids exception written into global rule 8.13, which names the
   Kids app as public-by-design alongside the marketing site and the car listings. Recorded here as
   a change of decision, not an oversight. Rule 8.13's *other* half still binds harder than ever:
   **every address gets gated, custom domain and `.pages.dev` alike.**
4. **Session length: 1 month** — Cloudflare's longest. Confirm the exact ceiling when building.
5. **Allow-list is two hand-listed addresses:** `satinker2004@yahoo.com` and
   `simplyknownfacts@gmail.com`. Verified 2026-08-29 against the stored email hashes: the first is
   a registered app account (created 2026-05-16, last synced 2026-06-16); the second is not
   registered in the app but is allow-listed so Scott can open the site. The only other account
   (created 2026-07-09) has never synced any data — a dead test signup, not a user to preserve.
   Re-verify before cutover in case that changes.
6. **No self-service access requests.** The Cloudflare login screen carries a "need access, email
   us" line; Scott approves by asking for the address to be added. Cloudflare's built-in
   request/approve flow was rejected: its grants are short-lived and it requires opening the gate
   to everyone. Revisit only if the app gets real outside demand.
7. **Direct upload, not Cloudflare's GitHub auto-build.** Auto-build would redeploy production on
   every push to `main`, which is a second door to prod and banned by the standard's "one door to
   prod, per app" rule.
8. **The dev site gets its own database.** Global rule 8.10 forbids using prod data where dev data
   would do, and a dev copy of the app pointed at the live sync Worker would write into real family
   profiles.
9. **A `package.json` with scripts only.** No dependencies, no bundler, no transform of app code.
   The zero-build simplicity is what makes this app easy to host, and the Testing Standard
   explicitly says not to introduce a build step.

## 3. Target state

| | Production | Dev |
|---|---|---|
| Address | `kids.simplyknown.co` | `kids1.simplyknown.co` |
| Host | Cloudflare Pages `simplyknown-kids` | Cloudflare Pages `simplyknown-kids1` |
| Gate | Cloudflare Access, 2 emails, 1-month session | same |
| Sync backend | `simplyknown-kids-sync` → D1 `sync` | `simplyknown-kids-sync-dev` → D1 `sync-dev` |
| Deploy | `promote-kids.bat` + desktop icon — the only door | `npm run deploy:dev1` |

GitHub Pages retired. Repository private. This matches the fleet's Land/Cars/ERP shape.

## 4. Architecture

### 4.1 Which backend the app talks to

`js/sync.js` picks its Worker address from the page's own hostname: a `kids1` host uses the dev
Worker, anything else uses production. One runtime check, no build step, no separate copy of the
app. Every other page inherits it because they all load `sync.js`.

### 4.2 The dev Worker

`simplyknown-kids-sync-dev` is the same committed source as production, deployed under a second
name with its own D1 binding. **It is deployed without the ElevenLabs key.** The sync Worker also
hosts the paid voice-generation endpoints, and a dev environment must not be able to spend money;
without the key those endpoints fail closed and the rest of the Worker is unaffected.

### 4.3 What is *not* gated

The Workers stay ungated on `*.workers.dev`. They are called by the browser as data endpoints, and
an Access gate in front of them would block those calls rather than protect anything — they carry
their own authentication (password sign-in, per-device keys, and now a secret header on the backup
trigger). This is a deliberate exclusion from decision 3, not an omission.

### 4.4 What gets published

Only the app itself. The repository also holds tests, docs, Worker source, generator scripts and
several hundred audit screenshots, none of which belong on a public-facing site. The exact
mechanism — an ignore file or a staged copy directory — is settled in the implementation plan
under one binding constraint: **it must not transform app code.** Copying or excluding files is
fine; bundling, minifying or rewriting is not.

Measured 2026-08-29: 5,475 tracked files, 216 MB, largest file 3.4 MB. Cloudflare Pages allows
20,000 files at up to 25 MiB each, so the site fits with room to spare. The repository's 1.23 GB
is almost entirely `.git` history, which direct upload never touches.

## 5. Stage 1 — hosting

Ordered so that every step before the last one is undoable by flipping a single DNS record back.

1. Create both Pages projects. Publish the current site to each. Prove both load on their
   `.pages.dev` addresses.
2. Stand up the dev Worker and dev database. Wire the hostname check in `sync.js`. Prove the dev
   site reads and writes dev data and **cannot** reach production data.
3. **Prove the offline app survives the gate — before anything points at Cloudflare.** See §7.
4. Create the Access application covering the dev addresses. Prove `kids1.simplyknown.co` and its
   `.pages.dev` both redirect to a Cloudflare login, by fetching them, never by reading config.
5. Point `kids1.simplyknown.co` at the dev project.
6. Point `kids.simplyknown.co` at the production project. **GitHub Pages is left running.** Confirm
   the live site serves from Cloudflare and behaves normally, including an installed home-screen
   copy.
7. Soak. Then, in one step: gate production, and take the repository private. Going private is what
   kills GitHub Pages, and leaving an ungated copy of a gated app running is exactly the failure
   found on 2026-08-14. Confirm afterwards that `simplyknownfacts.github.io/simplyknown-kids` and
   the old address are both gone.

## 6. Stage 1b — make cross-device sign-in real

Scott's requirement, in his words: *a parent should be able to sign in on any device and their
kids' stuff should sync to its current cloud state.* **This does not work today.**

The account row stores a single `sync_key`, and `handleSignin` overwrites it on every sign-in
(`workers/sync/src/index.js:107`, verified 2026-08-29). Signing in on a second device silently
invalidates the first, which then shows "session expired" — while parent settings promises sync
across tablets. This is Codex finding #3.

**Fix:** a `sessions` table holding one hashed token per device, with the account row no longer
acting as the single key. Signing in anywhere mints a new session and leaves existing ones alone.
Signing out removes only that device's session.

**Migration constraint:** one live account has real synced data. Existing devices must keep
working — an old-style key is accepted once and upgraded to a session rather than rejected. Nobody
gets logged out by the upgrade.

**Deliberately deferred:** a "your devices" screen with per-device revoke. The requirement is
sign-in that works everywhere, not device management, and one account with two devices does not
justify the UI. Revisit if accounts grow.

The existing merge-on-open and flush-on-close behaviour already handles "gets current cloud state"
once sessions stop fighting each other.

## 7. Must prove before cutover: the offline app behind a gate

The app is an installed PWA with a service worker and a working offline mode. Cloudflare Access
answers unauthenticated requests with a redirect to a login page. Two ways that can break a child's
tablet:

1. The service worker caches the login page as though it were app content, and afterwards serves a
   login screen — or a white screen — from cache even when the session is valid.
2. A session expiring while the device is offline leaves the app unable to re-authenticate, with no
   clear route back.

This is checked in Stage 1 step 3, on the `.pages.dev` addresses, before any production DNS moves.
Expected shape of the fix: the service worker must refuse to cache navigations that were redirected
away from our own origin. **If this cannot be made to behave, stop and report — gating production
is not worth a bricked tablet.**

## 8. Stage 2 — the prerequisites the gate depends on

PART D5 makes the promote gate refuse any commit without a fresh `docs/verify/DEV-VERIFIED.json`
stamp, and that stamp is only written by a clean full dev pass. Neither the pass nor the recipe
exists, so building the gate first would produce a gate nothing can satisfy. These come first.

1. **One-command smoke run** over the eight activities: parent settings → pick a voice → run the
   activity → assert no console error. Most of the logic already exists unwired in `tests/e2e/`.
   It must exit non-zero on a console error, an empty render or a missing prompt.
2. **`tests/hostile-input.test.mjs`** — poisons every user-editable or synced field Codex
   enumerated (profile name, sync email, Yoto title/chapter/cover URL, YouTube channel label) and
   asserts the app writes text, never markup.
3. **`docs/verify/VERIFYING.md`** in the mandatory five-part shape (Launch → Health check → Drive →
   Evidence → Cleanup), plus feature recipes, run end to end at least once. Evidence goes to
   `docs/verify/shots/`, which **must be git-ignored** — no photograph of a child is ever committed,
   under any circumstance, private repository or not.

Seed the Known traps section with the three false passes already known: state lives in browser
storage so an uncleared run passes on stale data; sync is single-device today so a sync test can
pass while the feature does not work; and the code defines ten tiers while the docs still say
eight, so trusting the docs yields a wrong expected value.

## 9. Stage 3 — the gate

`promote-kids.bat` in the repo root, with a `Promote Kids` shortcut in
`Desktop\SimplyKnown Promote\`. Same face as every other app's gate: refuse loudly with the reason
in one line, show what will ship, make Scott type the version, deploy, confirm.

Refusals: uncommitted changes; missing, stale, or wrong-commit `DEV-VERIFIED.json`; and anything the
fleet's Piece 3 list requires. No stamp, no prod — including for Scott.

## 10. Rollback

Stage 1 steps 1–6 are reversible by pointing the DNS record back at GitHub Pages, which stays live
throughout. The one-way door is step 7: once the repository is private, GitHub Pages stops
permanently. That step happens only after the site is confirmed serving from Cloudflare and the
offline check in §7 has passed.

## 11. Cost

**$0/month.** Pages, Access (well under the 50-user free allowance), the extra Worker and the extra
D1 database are all free tier. No new vendor. Two things to watch rather than assume: the account
has hit Cloudflare's cron cap once before (not touched here — the backup Worker's own cron was
already folded out), and the dev Worker is deliberately built without the ElevenLabs key so a dev
environment can never spend money on voice generation.

## 12. Out of scope

Codex's other findings stay back-burner triage and are not smuggled in here — with one exception,
finding #3, which Scott's cross-device requirement makes load-bearing (§6). Finding #1 was already
fixed and deployed earlier in this session.

## 13. Done when

1. `kids.simplyknown.co` and `kids1.simplyknown.co` both serve from Cloudflare Pages and both
   redirect to a Cloudflare login when unauthenticated — proven by fetching all four addresses,
   custom domains and `.pages.dev` alike.
2. Signing in on a second device does not sign out the first, proven on two devices.
3. The dev site cannot read or write production family data.
4. The smoke run and the hostile-input test each run from one command and fail honestly.
5. `docs/verify/VERIFYING.md` exists, has been run end to end, and `shots/` is git-ignored.
6. `promote-kids.bat` refuses an unstamped commit, and its desktop shortcut exists.
7. The repository is private, GitHub Pages is gone, and no secret or child photograph was ever
   committed.
8. `CLAUDE.md` describes the new deploy story and no longer claims the old exception.
