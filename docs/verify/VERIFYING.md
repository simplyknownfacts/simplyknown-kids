# Verifying the Kids App

How to prove this app actually works before saying it does. Five steps, in order.
Written 2026-08-30. Run end to end the same day; results at the bottom.

**The one rule:** a check that passes on a broken app is worse than no check at all.
Every step below either proves something or fails loudly. If you cannot run a step,
say so out loud rather than skipping it quietly.

---

## 1. Launch

Serve the app over real HTTP. Opening `index.html` from disk does **not** work — the
service worker, `fetch()` and the sync layer all need an `http://` origin.

```bash
node scripts/serve.mjs
```

Serves the repo at `http://localhost:8790`. No dependencies; the repo has no build
step and no runtime dependencies, and this does not change that.

One-time browser install for step 3 (never committed — `node_modules/` is ignored):

```bash
npm i playwright --no-save && npx playwright install chromium-headless-shell
```

## 2. Health check

Before driving anything, confirm the pieces are sane.

```bash
npm test
```

Expected: **41 passing, 0 failing.** These cover the achievement rules, the backup
Worker's authentication, the service worker's caching policy, what is allowed to be
published to the web, and that hostile text typed into a name or synced from the
cloud is displayed as words rather than run as code.

```bash
curl -s http://localhost:8790/__health.json
```

Expected: a small JSON block whose `app` is **`kids`**.

This is the identity check, and it is not decoration. Every app in the fleet runs a
dev server on a similar port, and a sibling's server answering here would let a whole
verify run drive the wrong application and report a confident pass — which is exactly
what happened to Land, and is now a fleet non-negotiable. The Drive step in section 3
asserts this before it opens a single page and stops dead if anything else replies.

`scripts/serve.mjs` also refuses to start on a busy port rather than quietly
attaching to whatever is already there. Both take `PORT=`:

```bash
PORT=8877 node scripts/serve.mjs
BASE=http://localhost:8877 node tests/verify-drive.mjs
```

```bash
node --check sw.js
```

Expected: no output. A service worker that does not parse silently kills offline mode.

## 3. Drive

Open the app in a real browser, as a child (and a parent glancing at a tablet or a
laptop) would use it.

```bash
node tests/verify-drive.mjs
```

It seeds **ten test children, one per tier** (birthdays landing mid-tier, never on a
boundary), then drives **53 screen loads** in four passes:

1. Every activity page — 21 of them, plus Watch and Listen — opened **once each**,
   signed in as the youngest tier allowed to see it. This is the main coverage
   requirement: every real destination proven to load, correctly tier-gated.
2. The child home screen, opened **once per tier** (10 loads) — home is the one screen
   whose whole job is deciding what a kid's age may see.
3. The seven shell screens (profile picker, the three section menus, the achievements
   shelf, the parent PIN gate) opened once at phone size.
4. The same seven shell screens again at **tablet size** and again at **PC size**, to
   prove the responsive layout holds.

The activity pages themselves are only ever opened at phone size, and each one only at
the single tier used to pick it — see
[`features/NOT-COVERED.md`](features/NOT-COVERED.md) for exactly what that trade-off
leaves unproven. On every screen it watches for errors the browser itself reports,
confirms something was actually drawn, and saves a screenshot.

Expected: **53 screens driven, 53 passed, 0 failed**, and **exit code 0**. Takes a
little over a minute.

The screen list is not hand-typed — it's built from `js/profiles.js`'s
`ACTIVITY_FEATURES` (the app's own activity registry) and `js/tiers.js`'s `TIERS` (the
app's own age boundaries), with every path double-checked against disk before the
browser opens. See the long comment at the top of `tests/verify-drive.mjs` for the
full reasoning behind the four-pass scope.

To drive a deployed environment instead of your machine:

```bash
BASE=https://kids1.simplyknown.co node tests/verify-drive.mjs
```

**Prove the checker still works** whenever you change it, by pointing it somewhere broken:

```bash
BASE=http://localhost:8790/does-not-exist node tests/verify-drive.mjs; echo "exit $?"
```

Expected: **exit 1**, with a message saying nothing identifiable is serving at that
address — the `__health.json` identity check (§2) catches a broken address before a
single browser tab opens, so this is *not* "N screens failed"; it never gets that far.
If that prints exit 0, the checker is lying and must be fixed before it is trusted again.
A wrong-app stub (something else answering `/__health.json` with a different `app`
value) is caught the same way, with a "WRONG APP" message instead.

Deeper per-area recipes live in [`features/`](features/). They cover the parent PIN gate,
profile switching, an activity with voice, and the achievements shelf. **Cloud sync,
offline mode, and the Yoto integration are deliberately NOT written up yet** — see
[`features/NOT-COVERED.md`](features/NOT-COVERED.md) for why and what that leaves
unproven. The Watch and Listen screens *are* now opened by the automated drive (as of
2026-08-31), but only their empty/default state — no hand-written deep-dive recipe for
either exists yet.

## 4. Evidence

Screenshots land in `docs/verify/shots/`, one per screen, named for the step.

`docs/verify/shots/` is **git-ignored and must stay that way.** These are pictures of a
child's screen. No photograph or screenshot of a child is ever committed, in any
circumstance, public repository or private.

To keep evidence for a release, copy it somewhere outside the repo and reference it from
the handoff note. Do not commit it.

## 5. Cleanup

1. Stop the server (Ctrl+C in its terminal).
2. `docs/verify/shots/` is wiped and rewritten by every run, so stale pictures cannot be
   mistaken for fresh ones. Nothing to tidy by hand.
3. `node_modules/` may stay; it is ignored and makes the next run faster.
4. Confirm you are leaving the tree clean: `git status --short` should print nothing.

---

## Known traps

Ways this app has produced, or can produce, a false pass. Read before trusting a green run.

1. **Everything lives in browser storage.** A run that does not clear `localStorage` will
   happily pass on last week's data. `tests/verify-drive.mjs` seeds its own children in a
   fresh browser context every time, which is why it can be trusted; a manual check in your
   own browser cannot, unless you clear site data first.
2. **Cloud sync is single-device.** Signing in on a second device silently signs the first
   one out, because the account stores only one key (`workers/sync/src/index.js`, in
   `handleSignin`). A sync test can therefore pass while the advertised feature does not
   work. Do not read a green sync check as "sync works". Tracked as Stage 1b in the
   migration spec.
3. **The tier count disagrees between code and docs.** `js/tiers.js` defines **ten** tiers.
   Parts of the documentation, and `about.html`, still say eight or "ages 1-8". Trusting the
   docs gives you a wrong expected value. The code is right. (`tests/verify-drive.mjs` reads
   `TIERS` straight out of `js/tiers.js` rather than hand-copying the count, precisely so it
   can't develop this same disagreement.)
4. **Cloudflare Pages answers 200 for URLs that do not exist**, serving the app's HTML
   instead. A missing file therefore looks fine in production while failing locally, where
   `scripts/serve.mjs` returns a real 404. Verify missing-asset problems locally, never on
   Pages.
5. **A pipe hides the exit code.** `node tests/verify-drive.mjs | tail` reports `tail`'s
   status, not the checker's, so a failing run looks like a pass. Check `$?` on the bare
   command. This one bit during the first run of this very recipe.

---

## First run — 2026-08-30

Run end to end on Windows, Node v24.15.0, against `http://localhost:8866`.

1. **Health check:** 33 tests passed, 0 failed. Server returned 200. `sw.js` parsed.
2. **Drive:** 10 screens driven, **10 passed, 0 failed**, exit 0.
3. **Negative control:** pointed at a broken address — 10 failed, **exit 1**. The checker
   fails honestly.
4. **Fixed during the run:** trap 5 above. The first exit-code measurement was taken through
   a pipe and wrongly reported 0 on a fully failing run.
5. **Not yet proven:** everything listed in `features/NOT-COVERED.md`, most importantly
   offline mode and cloud sync.

---

## Second run — 2026-08-31: extended to every activity, all ten tiers, three widths

The first run above proved ten hand-picked screens at one phone size, for two
hand-picked ages. This run rebuilt the Drive step to prove the whole app instead: every
activity, every tier, and that the layout survives a tablet or a PC.

Run end to end on Windows, Node v24.15.0, against `http://localhost:8866`.

1. **Recount against the repo, not the old doc.** The activity/tier numbers this task
   started from didn't match reality: `js/profiles.js`'s `ACTIVITY_FEATURES` has 21 live
   activities (7 games + 10 learning + 4 art; `peek-a-boo.html` is still registered but
   has had no menu link since commit `5e37113`, so it's deliberately excluded), not 22.
   `js/tiers.js` defines 10 tiers, confirming trap 3 above. `tests/verify-drive.mjs` now
   pulls both lists straight from that source code instead of a hand-typed copy.
2. **Scope chosen to avoid the cross-product.** 21 activities x Watch x Listen x 10
   tiers x 3 widths would be 690+ page loads. Instead: every destination once at phone
   width (tier-gated correctly), the child home screen once per tier, and the shell
   screens (picker + 3 menus + achievements + parent) once at phone and again at tablet
   + PC. Total: **53 screen loads**. Full reasoning in the header comment of
   `tests/verify-drive.mjs`.
3. **Drive:** 53 screens driven, **53 passed, 0 failed**, exit 0, in **1m17s**.
4. **Negative controls, both re-confirmed:** a broken address exits 1 at the
   `__health.json` check before any screen opens; a stub server answering
   `/__health.json` with `app: "not-kids"` is caught the same way ("WRONG APP") and also
   exits 1. The identity-check block itself was not touched — same logic as the first run.
5. **`npm test`:** unaffected — 53 tests passed, 0 failed (a coincidence that it's also
   53; that suite doesn't depend on this file).
6. **Fixed while doing this:** the activity `section` field ('games' | 'learn' | 'art')
   is a logical category, not a folder name — `learn` activities actually live in
   `learning/`. Assuming otherwise on the first pass produced ten false "file not found"
   failures against real, working pages; caught immediately by the registry-vs-disk
   check because it fails loud instead of silently skipping.
7. **Not yet proven:** everything already listed in `features/NOT-COVERED.md`, which was
   rewritten alongside this run to describe the new, larger gap accurately — most
   importantly, no activity is driven at more than one tier or at more than phone width,
   and no activity's optional feature toggles (quiz modes, drag-to-match, etc.) are
   switched on by this pass.
8. **Observed, not mine to touch:** another worker was concurrently editing
   `home.html`, `index.html`, and the three section-menu `index.html` files (accessibility
   changes — converting section tiles to real `<button>` elements) while this run was in
   progress. Those files were not modified, committed, or reverted by this work — this
   task's scope is `tests/verify-drive.mjs` and the two `docs/verify/` files only, and the
   drive passed cleanly against their in-progress state either way.

---

## Third run — 2026-09-01: hub-home (branch `hub-home`, not merged to main)

`home.html` stopped being a tile grid and became the fox hub-world (the approved
`redesign-hub-mock.html` prototype, promoted to production): the same 5 sections, reached
by tapping a landmark instead of a card. Added Pass 7 to `tests/verify-drive.mjs` to prove
what a screenshot alone cannot — that a tap actually navigates, that Listening Hut stays
hidden without Yoto, that reduced motion doesn't leave the world invisible, and that the
offline gate still refuses to open a dead screen. `docs/verify/features/NOT-COVERED.md`
does not need edits — nothing this run touches was previously proven there.

Run end to end on Windows, Node v24.15.0, against `http://localhost:8790`.

1. **TDD, not just added-after:** ran the new Pass 7 against the OLD (tile-grid) home.html
   first. Result: `hub-landmarks-present`, `hub-reduced-motion`, all five `hub-nav-*`, and
   `hub-offline-dim` failed — correctly, since `.spot` elements don't exist on the old
   home. Only then was the new home.html written and the same pass turned green.
2. **A real bug Pass 7 caught that a screenshot-only pass would have missed:** the
   approved v1 art is a wide/landscape island (1376x768); cover-fitting it to a phone's
   HEIGHT (the same math `redesign-hub-mock.html` used) renders it far wider than the
   screen. The prototype was never driven at phone width by this suite (it isn't a
   published route), so nobody had proven it there before. On first landing, `hub-nav-games`
   failed with Playwright's own "element is outside of the viewport" — the Games landmark
   was cropped completely off-screen on a real phone aspect ratio, reachable only in the
   first draft because a test runner's `scrollIntoViewIfNeeded` force-scrolled to it in one
   direction, which a child's finger cannot do to a clipped, non-scrolling box. Fix: the
   home screen scrolls horizontally now (chrome stays fixed; only the world pans), starting
   centered so the default view is unchanged. Re-ran Pass 7 clean afterward.
3. **A second issue caught by hand, not by the drive:** a manual phone-width screenshot
   review (not exercised by the drive, which doesn't compare screenshots pixel-by-pixel)
   showed the standalone prototype's bottom-LEFT exit button sitting exactly on top of
   `js/mascot.js`'s own fixed `#mascotWrap` widget (`bottom:16px; left:16px` — every real
   page loads it; the prototype never did). Moved the exit button to bottom-right, stacked
   above the avatar pill, instead.
4. **Drive:** 74 screens/checks driven, **74 passed, 0 failed**, exit 0.
5. **`npm test`:** 81 passed, 0 failed, 0 skipped. Includes the updated
   `tests/stage-site.test.mjs` — `redesign-hub-bg.jpg` (the island art) is now on the
   PUBLISH allow-list in `scripts/stage-site.mjs` and asserted published; the prototype
   shell `redesign-hub-mock.html` and the unrelated `redesign-mocks.html` stay excluded.
6. **`sw.js`:** `node --check sw.js` clean; `CACHE` bumped to `vb-v143`; `redesign-hub-bg.jpg`
   added to the offline precache list.
7. **Negative controls, both re-confirmed:** a broken address exits 1 before any screen
   opens; the identity-check block was not touched.
8. **Not yet proven:** a real on-device touch swipe was not tested (only DOM-level
   `scrollLeft` + Playwright's programmatic scroll-then-click, which drive real
   `overflow-x:auto` + `-webkit-overflow-scrolling:touch` the same way a finger would, but
   is not the same as an actual finger). Recommend a real-device pass before wide rollout.
