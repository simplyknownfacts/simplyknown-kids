# Kids App handoff — 2026-09-09, Scott's 4 phone bugs (claude)

Branch `kids/child-experience`, worktree `.worktrees/kids-child-experience`. Start `6c55ae1` → fix commit `5fe1dc0`.

## What Scott reported (from his phone, kids1 dev deploy)

1. Color In can't see pages
2. Watch: no YouTube videos
3. Watch: back button fires within ms
4. Watch: tapping a Rachel video goes to the home island instead of back to the video page

## Root causes (2, not 4)

1. **The CSP in `_headers` is live on Cloudflare Pages but no test ever ran under it.** `img-src` lacked `blob:` (Color In's pictures and the parent photo upload are blob: images → "We couldn't open this picture"). `script-src` lacked `https://www.youtube.com` (the iframe API `<script>`; it was only in `frame-src`) → the player never built, black screen. Bugs 1 + 2. Invisible on GitHub Pages prod and on `scripts/serve.mjs`, both ignore `_headers`. **This would have hit prod the day of the DNS cutover.**
2. **The player's ← closed on `pointerdown`.** Overlay gone before the finger lifted, so the tap's click landed on the world Back button in the same corner → `home.html`. Bugs 3 + 4. Reproduced in Chromium and WebKit (iPhone engine). Pre-existing on `main` too.

## What changed (`5fe1dc0`)

1. `_headers`: `img-src` + `blob:`, `script-src` + `https://www.youtube.com`.
2. `videos/index.html`: back closes on `click`; keydown shim removed (a real button's click covers Enter/Space).
3. NEW `tests/csp-live.test.mjs`: serves the app with the exact `_headers` policy stamped on every HTML response and drives Color In + Watch. Red before, green after.
4. NEW `tests/watch-back.test.mjs`: finger-tap on ← stays on Watch. Keep the 500 ms pause: an instant re-tap hits Chromium's double-tap window and the test passes against broken code.
5. `tests/csp-headers.test.mjs`: directive-level check (host in the wrong directive used to pass).

## Verification

1. Targeted files: 9/9. Full suite: 281/282 at concurrency 2 — the miss was `tests/activity-content-browser.test.mjs` failing as a whole file in 0.5 s (parallel-load flake, untouched), 4/4 alone.
2. Playwright WebKit installed locally this session (`npx playwright install webkit`) — use it for anything iPhone-shaped; the WebKit engine itself drew Color In fine once blob: was allowed.
3. Dev redeployed: `kids1.simplyknown.co` (Access-gated, confirmed 302 to cloudflareaccess). Deploy id `5b582f0b`. Done by calling `wrangler pages deploy` directly — `scripts/deploy-dev1.mjs` still throws ENOENT on Windows (bare `npx`), unchanged, same as last session.

## Open / for master

1. **Access gap (rule 8.13):** the per-deploy hash address `https://5b582f0b.simplyknown-kids1.pages.dev` answered 200 with NO Access redirect. The custom domain is gated. Access config is not this chat's to change — filed QUESTION FOR MASTER in the Kids inbox.
2. `main` still has 2 unpushed commits (`e768dee` bat consolidation + `e7498f8` handoff) — push to `main` = live prod, needs the typed go.
3. Scott re-tests the 4 bugs on his phone at kids1. Then: old-ledger items 0901-7, 0825-6, 0902-1 relevance check → real promote.
