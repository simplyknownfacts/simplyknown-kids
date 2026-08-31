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

Serves the repo at `http://localhost:8866`. No dependencies; the repo has no build
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
curl -s http://localhost:8866/__health.json
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

Open the app in a real browser, at phone size, as a child would use it.

```bash
node tests/verify-drive.mjs
```

It seeds two test children (a three-year-old and an eight-year-old, so tier-gated
screens are exercised at both ends), then opens ten screens: the profile picker, the
child home, all three section menus, one activity from each section, the achievements
shelf and the parent area. On each it watches for errors the browser itself reports,
confirms something was actually drawn, and saves a screenshot.

Expected: **10 screens driven, 10 passed, 0 failed**, and **exit code 0**.

To drive a deployed environment instead of your machine:

```bash
BASE=https://kids1.simplyknown.co node tests/verify-drive.mjs
```

**Prove the checker still works** whenever you change it, by pointing it somewhere broken:

```bash
BASE=http://localhost:8866/does-not-exist node tests/verify-drive.mjs; echo "exit $?"
```

Expected: **10 failed, exit 1.** If that prints exit 0, the checker is lying and must be
fixed before it is trusted again.

Deeper per-area recipes live in [`features/`](features/). They cover the parent PIN gate,
profile switching, an activity with voice, and the achievements shelf. **Cloud sync,
offline mode, the Yoto integration and the Watch section are deliberately NOT written up
yet** — see [`features/NOT-COVERED.md`](features/NOT-COVERED.md) for why and what that
leaves unproven.

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
   docs gives you a wrong expected value. The code is right.
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
