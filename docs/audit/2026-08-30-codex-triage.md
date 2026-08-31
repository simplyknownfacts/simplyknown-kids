# Codex audit — triage (2026-08-30)

Codex reviewed the whole project on 2026-08-25 and wrote 21 findings into `CODEX-NOTES.md`.
This document checks each one against the actual code and says what is worth doing.

**Findings 1 and 3 are not re-triaged here.** #1 (anyone could trigger the backup) was fixed
and deployed on 2026-08-29. #3 (signing in on a second device kicks off the first) is already
scheduled as Stage 1b of the Cloudflare migration. That leaves the 19 findings below.

## How severity was decided

The app has **no outside users** today. One family uses it, one cloud account exists, and it
collects nothing from a child that a parent did not type in themselves. So a finding was ranked
by what it costs **today** — real money, something breaking, or data being lost — not by how bad
it would sound in a textbook. A classic security hole that only a stranger could exploit does not
score highly when there are no strangers.

Verdicts used:

1. **REAL-DO-SOON** — confirmed, and it costs money, breaks something, or misleads you now.
2. **REAL-LATER** — confirmed and genuinely wrong, but nothing bad happens until the app has real users.
3. **ALREADY-FIXED** — was true when Codex looked, is not true now.
4. **NOT-A-PROBLEM** — Codex was wrong, or it is a deliberate design choice working as intended.

---

## Summary table

| # | One-line title | Verdict |
|---|---|---|
| 2 | Untrusted text pasted into HTML in four screens | REAL-LATER |
| 4 | Cloud sign-in has no limit on guessing, and tells you which emails exist | **REAL-DO-SOON** |
| 5 | Anyone can download a child's name-voice clips without signing in | REAL-LATER |
| 6 | No password reset and no account deletion, but the privacy page promises both | REAL-LATER |
| 7 | Sign-in sticks on "Working…" forever when the network drops | **REAL-DO-SOON** |
| 8 | Main child navigation cannot be used by keyboard or screen reader | REAL-LATER |
| 9 | Parent PIN is a toddler gate, not security; two copies of the code; hold is 0.7s not 3s | REAL-LATER |
| 10 | Sync and Yoto tokens sit in browser storage with no content security policy | REAL-LATER |
| 11 | The cloud accepts any shape of profile data, and leaks raw error text | REAL-LATER |
| 12 | The paid voice spend guard can be walked past | **REAL-DO-SOON** |
| 13 | A birthday in the future is accepted and makes the child a newborn | **REAL-DO-SOON** |
| 14 | "Stamp picker" toggle does nothing; tier-10 memory cards are too small to tap | **REAL-DO-SOON** |
| 15 | Zoom is switched off everywhere, and the parent-settings escape hatch was never wired up | REAL-LATER |
| 16 | Offline download says "done" by counting files, not checking them | REAL-LATER |
| 17 | The database structure exists only as a code comment — a rebuild is hand-typed | REAL-LATER |
| 18 | Nothing runs before a push goes live | REAL-LATER |
| 19 | Fancy italic type and low-contrast text on child screens | REAL-LATER (contrast half looks fixed) |
| 20 | Docs and public descriptions are out of date | REAL-LATER (one sub-claim wrong) |
| 21 | The repo history is 1.2 GB and the service worker starts with 140 lines of notes | REAL-LATER |

**Scoreboard: 19 checked. 19 confirmed as real defects. 0 disputed outright. 1 (finding 20)
contains a sub-claim that is wrong. 5 marked do-soon, 14 marked later.**

Every file-and-line reference Codex gave was checked. All of them landed on the code Codex
described, except two in `js/sync.js` that were off by a handful of lines — the code is there,
just slightly further down the file. Codex's aim is good.

---

## The five things that actually matter

If nothing else gets done, do these:

1. **Findings 4 + 12 together are a way for a stranger to spend your ElevenLabs money.**
   Anyone can create a cloud account (no invite, no email confirmation, no limit on how many),
   and each account may generate 5 new name-voices per day at roughly 10 cents each. A script
   that makes a few hundred accounts turns into a real bill. This is the single highest-value
   item in the whole audit and neither half is hard to close.
2. **Finding 7** — sign-in hangs forever on a bad connection. You will hit this yourself on a
   tablet with poor wifi, and there is no way out except closing the page.
3. **Finding 13** — mistype a birth year and the app silently treats a 9-year-old as a newborn.
4. **Finding 14** — the "Stamp picker" switch in parent settings does nothing at all, which will
   waste your time during the activity test matrix.
5. **Finding 16** (a "later", but the most expensive later) — the offline download reports success
   by counting files rather than checking them. It fails in exactly the situation where you cannot
   fix it: on a plane.

---

## Finding 2 — untrusted text pasted into HTML in four screens

**Verdict: REAL-LATER.** Confirmed, every location.

1. What Codex said: several screens drop text straight into the page as HTML rather than as
   plain text. If that text contained markup, the browser would run it.
2. What I found. All four are real:
   1. `videos/index.html:151` — the channel emoji and label go in as HTML.
   2. `js/game-settings.js:270` — the child's name goes in as HTML. This file has no escaping
      helper at all.
   3. `parent/settings.html:1320` — the sync email goes in as HTML. This one is notable: the file
      already has an `esc()` helper at line 638 and uses it 16 other times. It was simply missed here.
   4. `listen/index.html:218`, `269`, `279`, `301` — Yoto card titles, chapter titles and cover
      image URLs, all as HTML.
3. Why it does not bite today. Every one of those values is either typed in by you (channel labels,
   child names, your own email) or comes from Yoto, which is not connected. There is one cloud
   account, so there is nobody else who could poison the synced record. The only person who could
   attack this is you, on purpose.
4. Already partly scheduled. Stage 2 of the Cloudflare migration plan already calls for a
   `tests/hostile-input.test.mjs` covering exactly these fields.
5. Recommended action: fix the two one-word cases opportunistically (`esc(s.email)` in parent
   settings, and escaping the name in `js/game-settings.js`), and let the rest land with the
   planned Stage 2 test.

---

## Finding 4 — cloud sign-in has no limit on guessing, and tells you which emails exist

**Verdict: REAL-DO-SOON.** Confirmed.

1. What I found. `workers/sync/src/index.js` has no rate limiting anywhere. Sign-up and sign-in
   can be called as fast as a script can call them. The replies also differ by case:
   "account exists" (409), "no account for that email" (404), "wrong password" (401). That tells a
   stranger which email addresses are registered.
2. The password minimum is 8 characters and passwords are hashed properly (PBKDF2, 100,000
   rounds), so cracking is not trivial — but there is nothing stopping someone from trying
   forever, and every attempt burns Cloudflare Worker CPU time, which you pay for.
3. The bigger problem is that **sign-up is completely open**. No invite, no email confirmation, no
   limit. That is the door that makes finding 12 expensive — see below.
4. Recommended action, in order of value:
   1. Close or throttle sign-up. Since there is exactly one family using this, the cheapest correct
      answer is to require a shared invite code, or turn off sign-up entirely and create accounts
      by hand.
   2. Add a Cloudflare rate-limit rule on `/signup` and `/signin` by IP.
   3. Make the sign-in errors say the same thing whether the email exists or not.

---

## Finding 5 — anyone can download a child's name-voice clips without signing in

**Verdict: REAL-LATER.** Confirmed.

1. What I found. `handleVoiceClip` at `workers/sync/src/index.js:298` checks no token at all. A
   request like `/voice-clip?name=Emma&voice=girl&i=0` returns the MP3 if it exists and a 404 if it
   does not. Line 315 marks the response cacheable for a year.
2. So a stranger can guess common first names and learn which ones this app has generated clips
   for, then download them.
3. Why it is lower than Codex ranked it: this endpoint cannot *spend* anything — generation is
   behind a sign-in. It only serves clips that already exist. With one family using the app, the
   worst outcome is that someone learns a child's first name, and only if they guessed it first.
4. Recommended action: require the sync token on `/voice-clip`, or sign the URL. Small job, worth
   doing before the app has any outside family on it.

---

## Finding 6 — no password reset and no account deletion, but the privacy page promises both

**Verdict: REAL-LATER.** Confirmed.

1. What I found. `/reset` at `workers/sync/src/index.js:149` returns a polite "not yet enabled"
   message and does nothing else. `/signout` at line 140 clears the sync key but deletes no data
   and no account. There is no delete endpoint at all.
2. Meanwhile `privacy.html:82` and `privacy.html:85` tell parents they can "contact us to request
   deletion" and "email us to request deletion of your synced account data". Neither is backed by
   any code, and the nightly R2 snapshots keep historical copies with no stated retention period.
3. The practical bite for you today: **if you forget the cloud sync password, there is no way back
   in.** The profiles themselves are safe — they live on each device — but that account and its
   synced copy become unreachable.
4. Recommended action:
   1. Cheap now (5 minutes): change the privacy page to describe what the app actually does today,
      and put a line on the sign-in screen saying there is no password reset yet.
   2. Later: build real deletion and reset, and state the backup retention window.
5. Separate observation while reading `privacy.html`: the contact address on the public page is a
   personal Yahoo address, not the business account. Worth deciding on, but outside this audit.

---

## Finding 7 — sign-in sticks on "Working…" forever when the network drops

**Verdict: REAL-DO-SOON.** Confirmed.

1. What I found. `_request` in `js/sync.js` calls `fetch` with no `try/catch` around it. When the
   network is unavailable, `fetch` throws rather than returning a response, so the error never
   reaches the friendly error handling below it.
2. `syncSubmit` in `parent/settings.html:1385` then awaits that call with no `try/catch` of its own.
   The result is the button stays on "Working…" and nothing ever happens.
3. This is the most likely thing on this whole list to actually happen to you: a tablet on weak
   wifi, or a device that has gone offline.
4. Recommended action: wrap the `fetch` in `_request` so a network failure returns a normal
   "couldn't reach the server" result, add a timeout so it does not hang forever, and restore the
   button text either way. Small, contained fix in two files.
5. Codex cited `js/sync.js:34`; the function actually starts a few lines lower. The problem is real,
   the line number drifted.

---

## Finding 8 — main child navigation cannot be used by keyboard or screen reader

**Verdict: REAL-LATER.** Confirmed.

1. What I found. The main navigation is built from `<div>` elements with click handlers and no
   keyboard support: the profile cards (`index.html:164`), the avatar pill and all four section
   tiles on the home screen (`home.html:111`, `122`, `139`, `158`, `178`), and the activity cards in
   each section hub (`games/index.html:71`).
2. Credit where due: the settings gear (`index.html:103`) and the exit button (`home.html:220`) are
   real `<button>` elements with proper labels, so this is not a blanket failure.
3. Why it is later: the audience is small children on touch screens. Nobody is driving this app
   with a keyboard today.
4. Recommended action: when a screen gets touched for another reason, convert its clickable divs to
   real `<button>` elements. Not worth a dedicated sweep right now.

---

## Finding 9 — parent PIN is a toddler gate; two copies of the code; the hold is 0.7s not 3s

**Verdict: REAL-LATER.** All three parts confirmed.

1. The PIN check and the lockout counter both live in browser storage (`parent/settings.html:659`
   onward). Anyone with the browser developer tools open can clear the lockout or read the stored
   hash. That is a fact, not a surprise — the PIN's job is to stop a toddler, and it does that.
2. There is a **second, separate** PIN check in `home.html:277` for the exit button. It has no
   lockout at all. Two copies of the same idea that behave differently is the part most likely to
   cause a real bug later.
3. **The gear hold is 700 milliseconds, not 3 seconds.** `index.html:196` calls
   `holdToActivate(_gear, ...)` with no duration, and `js/app.js:405` defaults to 700ms. The app's
   own tooltip just says "Hold to open" — but `CLAUDE.md` still tells you 3 seconds, and that is the
   thing you look up most often. Worth correcting in the handoff doc next time it is touched.
4. Recommended action: describe the PIN honestly as a child deterrent, fold the exit PIN into the
   same helper as the settings PIN, and fix the 3-second claim in the docs.

---

## Finding 10 — sync and Yoto tokens sit in browser storage with no content security policy

**Verdict: REAL-LATER.** Confirmed.

1. The sync key is written to browser storage in `js/sync.js` (lines 144 and 153) and the Yoto
   tokens in `js/yoto.js:44`. Any script running on the site could read both.
2. I also confirmed there is **no Content-Security-Policy header or meta tag anywhere** in the app.
3. This only matters if finding 2 becomes exploitable, which needs a stranger able to poison your
   data. Today there is no such stranger.
4. Recommended action: add a Content-Security-Policy once the app is served from Cloudflare Pages
   (Pages makes this a headers file, which is much easier than the GitHub Pages setup). Do finding 2
   first; this is the belt to that pair of braces.

---

## Finding 11 — the cloud accepts any shape of profile data, and leaks raw error text

**Verdict: REAL-LATER.** Both parts confirmed.

1. `handlePush` at `workers/sync/src/index.js:115` checks only that a `profiles` value exists and
   that the JSON is under 1 MB. Anything else — wrong types, nonsense dates, arbitrary nesting —
   is stored as-is, and `handlePull` hands it straight back.
2. The catch-all at line 342 returns `'server error: ' + e.message` to the caller, which sends
   internal error text to anyone who can make the Worker fail.
3. Why it is later: the only thing pushing data is your own app, which writes well-formed profiles.
4. Recommended action: the error-message leak is a genuine one-line fix worth taking any time you
   are in that file. Full schema validation can wait for the sessions work in Stage 1b, since that
   is the next time this Worker gets serious attention.

---

## Finding 12 — the paid voice spend guard can be walked past

**Verdict: REAL-DO-SOON.** Confirmed, and worse in combination than Codex described.

1. What I found. `handleVoiceName` counts how many new names this account has generated in the last
   24 hours (`workers/sync/src/index.js:259`) and refuses at 5. But the count and the spending are
   two separate steps with no lock between them, so several requests sent at once can all read
   "4 so far" and all proceed.
2. That race on its own is worth pennies. **The real problem is the combination with finding 4.**
   Sign-up is wide open — no invite, no email confirmation, no rate limit. So the actual sequence
   available to a stranger is: create an account, generate 5 names, create another account, repeat.
   Each name is roughly 10 cents of ElevenLabs (12 clips: 4 voices × 3 phrases). A few hundred
   accounts is a few hundred dollars, and nothing in the code stops it.
3. This is the only endpoint in the whole app that spends real money, which is why it tops the list.
4. Recommended action, cheapest first:
   1. Close or gate sign-up (see finding 4). This alone removes the whole path.
   2. Add a **global** daily cap on generation, not just a per-account one, so the worst case is
      bounded no matter how many accounts exist.
   3. Reserve the quota atomically before calling ElevenLabs.
   4. Set a spend alert on the ElevenLabs account so you find out from your own alarm, not the bill.
5. Note: the shared ElevenLabs key is the same one the video pipeline uses, so a drained balance
   would break that project too.

---

## Finding 13 — a birthday in the future is accepted and makes the child a newborn

**Verdict: REAL-DO-SOON.** Confirmed.

1. The birthday input at `parent/settings.html:532` has no `max` attribute, so the date picker
   happily offers future dates. `saveNewProfile` at line 1896 only checks that a birthday was
   entered, not that it is sensible.
2. `getAgeMonths` in `js/tiers.js:17` ends with `Math.max(0, months)`, so a future date becomes
   0 months old, which is Tier 1 — "Sensory", the baby tier.
3. So typing 2027 instead of 2017 gives a 9-year-old baby activities, with no warning and no
   obvious clue about what went wrong.
4. Recommended action: add `max` (today's date) to the date input, and reject future or absurd
   dates in `saveNewProfile` with a plain-English message. Roughly a 10-minute job.

---

## Finding 14 — "Stamp picker" toggle does nothing; tier-10 memory cards are too small to tap

**Verdict: REAL-DO-SOON.** Both parts confirmed.

1. **Dead setting.** `js/profiles.js:67` advertises a "Stamp picker" toggle for Stamp Art. But
   `art/stamp-art.html:175` reads, verbatim:
   `const showPalette = true; // always show — toddlers benefit most from tapping big colorful stamps`
   The toggle is never consulted. Turning it off in parent settings changes nothing.
2. **Small cards.** At tier 10, Memory Match uses 12 pairs in 6 columns
   (`games/memory-match.html:87-88`). The board is `min(94vw, 700px)` wide with 10px gaps, so on a
   320-pixel phone each card works out to about **42 pixels wide** — under the 48-pixel minimum
   that reliably works for a child's finger. (The cards are 3:4 so they are taller than they are
   wide, which softens it slightly, but the horizontal target is still too narrow.)
3. Why do-soon: the dead toggle will actively confuse you while working through the activity test
   matrix in `CLAUDE.md`, and both fixes are small.
4. Recommended action: either honour the `stampPalette` setting or remove it from the registry so
   parent settings stops offering it; and cap the memory board at 4 columns on narrow screens.

---

## Finding 15 — zoom is switched off everywhere, and the escape hatch was never wired up

**Verdict: REAL-LATER.** Confirmed, plus one detail Codex missed.

1. Every page carries `maximum-scale=1, user-scalable=no` in its viewport tag (`index.html:5`), and
   `js/app.js` blocks zoom twice more in JavaScript — once at line 5 for pinch and Ctrl+wheel, and
   again at line 69 for pinch and double-tap.
2. **The detail Codex missed:** the comment at `js/app.js:70` says "Parent settings opts out by
   setting `body.dataset.allowZoom = '1'`", and the code checks for it — but **nothing anywhere in
   the app ever sets it.** I searched every HTML and JS file. The parent-facing escape hatch was
   written and never connected, so an adult reading parent settings on a phone cannot pinch to
   enlarge it either.
3. `js/shelf.js:49` does set `role="button"` and an `aria-label` on the ribbon shelf, but gives it
   no `tabindex` and no keyboard handler, so it announces itself as a button and then cannot be
   pressed by keyboard.
4. Blocking zoom for children is a deliberate and defensible choice. The bug is that the adult
   opt-out does not work.
5. Recommended action: wire up the `allowZoom` flag on `parent/settings.html` so the parent screens
   can be enlarged. Small fix, and it makes the existing comment true.

---

## Finding 16 — offline download says "done" by counting files, not checking them

**Verdict: REAL-LATER**, but this is the most expensive item in the "later" pile.

1. What I found. `parent/settings.html:1525-1527` opens the `vb-offline` cache, counts the entries,
   and declares the download complete when the count reaches the number of files in the manifest.
   It never checks that the *right* files are there.
2. That cache is only written by the download routine, so random files will not sneak in — but
   entries left over from an **older manifest** absolutely can. Rename an asset or swap a mascot,
   and the stale entry still counts toward the total while the new file is missing.
3. Why it matters more than its rank suggests: this feature exists for travel. It fails silently and
   the failure only shows up when you are offline and cannot re-download.
4. Recommended action: check each required URL with `cache.match()` instead of counting, list the
   ones that failed, and clear entries that are no longer in the manifest.

---

## Finding 17 — the database structure exists only as a code comment

**Verdict: REAL-LATER.** Confirmed.

1. The `accounts` and `data` table definitions appear only as a comment at
   `workers/sync/src/index.js:11-13`. There is no migrations folder, no `.sql` file, nothing
   executable. Only the `name_clips` table is created by code, and only lazily
   (`nvEnsureTable`, line 237).
2. So if the database were lost, rebuilding it means reading a comment and hand-typing the SQL.
3. The mitigation is real and already in place: the fleet backup writes every table to R2 nightly,
   and D1 Time Travel keeps a 30-day rewind. The data is protected; only the *structure* is not
   reproducible.
4. Recommended action: check in a `schema.sql` with the three `CREATE TABLE` statements. That is
   about five lines of work and removes the whole risk.

---

## Finding 18 — nothing runs before a push goes live

**Verdict: REAL-LATER.** Confirmed, and part of it is already planned.

1. Verified directly: there is **no `.github/workflows/` folder at all**, and GitHub reports the
   `main` branch as unprotected. GitHub Pages is serving `kids.simplyknown.co` from `main`, so every
   push publishes immediately with nothing checked.
2. The test drift is real too. `tests/e2e/v2/lib/harness.mjs:13` sets `TIERS = [1,2,3,4,5,6,7,8]`
   although the app has ten tiers — and the birthday table right below it has all ten entries, so
   the truncation looks accidental. `tests/e2e/MAP.md:15` still documents an old profile shape and a
   tier map that stops at 8. Line 31 of the harness refers to a "separate suite covers offline/PWA",
   and there is no such suite in `tests/e2e/v2/`.
3. On the branch-protection half: for a solo operator pushing to his own repo, branch protection
   mostly gets in the way. The valuable half is "run the tests before it goes live", not "stop Scott
   pushing to main".
4. Already planned. Stage 2 of the Cloudflare migration spec calls for a one-command smoke run and a
   hostile-input test, and Stage 3 builds a promote gate that refuses an unverified commit. That
   covers the useful part of this finding.
5. Recommended action: let Stage 2 and 3 handle it. Separately, fix the `TIERS` list to `1..10` —
   it is a one-line change and today the test suite silently skips the two hardest tiers.

---

## Finding 19 — fancy italic type and low-contrast text on child screens

**Verdict: REAL-LATER**, and the contrast half appears already fixed.

1. I opened the screenshots Codex cited. `v136-arcade-count.png` is damning — the instruction line
   under "COUNT ALONG" is dark blue on dark blue and essentially invisible.
2. **But that screenshot is stale.** The element is `<div class="subtitle" id="instruction">`
   (`learning/count-along.html:65`), and `css/themes.css` now carries a per-theme override that sets
   `.subtitle` to a light colour on the arcade theme. That specific bug looks fixed after v136. I
   could not confirm it live without running the app, so this is a code reading, not a live check.
3. The typography half stands. `design-after-home2.png` shows the child navigation — Games, Learn,
   Art, Watch — set in an ornate italic serif, along with "Where shall we go?". That is a taste and
   legibility call for early readers, not a defect.
4. Recommended action: no code change needed for the contrast case. If you want the typography
   revisited, treat it as a design task with fresh screenshots, not an audit item.

---

## Finding 20 — docs and public descriptions are out of date

**Verdict: REAL-LATER. One sub-claim is wrong.**

1. **Wrong:** Codex says "`TECH-STACK.md` and comments still say eight tiers". `TECH-STACK.md` is
   correct — line 38 says "Age tiers T1–T10". Codex over-reached by naming that file.
2. **Right:** the comment at the very top of `js/tiers.js` says "8 developmental tiers" while the
   list immediately below it defines ten. That is the confusing one, because it sits on top of the
   authoritative data.
3. **Right:** `about.html:35` tells the public the app is for "roughly ages 1 to 8". The product
   targets 0 to 10.
4. **Right:** the GitHub repository description still reads "Valiant Breeze — toddler tablet PWA" —
   old codename, and "toddler" undersells a ten-tier app. Verified live.
5. Recommended action: fix the `js/tiers.js` comment and the `about.html` age range (both one-liners).
   The GitHub description is a public-facing change on an outside service, so it is left for you to
   change or explicitly approve.

---

## Finding 21 — the repo history is 1.2 GB and the service worker starts with 140 lines of notes

**Verdict: REAL-LATER.** Confirmed exactly.

1. Measured: `size-pack: 1.22 GiB`, and the `.git` folder on disk is 1.3 GB. Codex's number was
   right to two decimal places. The cause is generated media (mascots, audio) committed over time.
2. Confirmed: `sw.js` opens with about 140 lines of release-history comments before the actual asset
   list begins at line 143.
3. **Important caveat: do not act on the size half.** The only way to shrink existing history is to
   rewrite it, which is on the never-do-without-explicit-approval list, and would break every clone
   and worktree. This is worth *knowing*, not *fixing*. Note that this repo lives in OneDrive, so the
   1.3 GB is also being synced to the cloud continuously.
4. Recommended action: the only safe lever is forward-looking — decide where new large media goes
   (R2 rather than Git) before the next batch of assets. Moving the service worker's release history
   into a changelog is a safe, small tidy-up whenever `sw.js` is next edited.

---

## What I could not check

1. Anything requiring the live site in a browser. All findings above were verified by reading code,
   running the test suite, opening the committed screenshots, and querying GitHub for repository
   settings. No live click-through was done.
2. Finding 19's claim that the contrast fix works — the CSS override exists and targets the right
   element, but I did not load the page to see it.
3. The Cloudflare side of findings 4 and 12: I did not check whether any Cloudflare rate-limit or
   WAF rule already sits in front of the Worker. If one does, those findings are less urgent than
   stated here.
