# Parent hold repair - 2026-09-08 (codex)

## Resume here
1. Scott reported the picker Grown-ups button did not work and asked for a continuous three-second hold with visible fill. Fixed locally at application **55649194e7c813f93387089fd26ff070301df302** on `kids/child-experience` in `.worktrees/kids-child-experience`.
2. Refreshed preview: http://localhost:8795/index.html . The retained in-app browser tab is confirmed to contain the new fill element, idle progress0, and visible **Hold 3 seconds** instruction. Local server8795 remains running.
3. This adds to [the Art studios](handoff-2026-09-08-art-studios.md), Hide and Seek, Body Parts and the corrected 3D home. No production push/deploy/promote, main merge, dev-verification stamp, Video takeover or scheduled review. Main remains **30d28e772aea51d5b19b80fbca46aeb34d05787e**; gate and staging implementation are unchanged.

## What failed and what changed
1. The picker already passed3000ms to the shared helper, but feedback was a faint shadow animation. Global reduced-motion styling completed that animation immediately even though the timer still ran for three seconds. Real edge-jitter input also cancelled when the press transform moved the button boundary; another finger's release could cancel the primary hold.
2. The shared helper now uses a stable button shape, captures and owns the initiating pointer, and draws a mint fill from elapsed time. Reduced motion changes no timing. The picker shows a polite accessible countdown, then Opening at completion. Release, deliberate movement outside, matching cancellation/lost capture, blur, page exit or hiding reset the hold.
3. One held gesture can activate only once. Non-primary/right-button input and unrelated fingers cannot start or cancel it. Enter/Space now use the same full configured hold, with key-repeat protection; the old instant keyboard shortcut on the picker was removed deliberately for consistent behavior.
4. The picker remains a three-second hold. Existing in-game gears retain their700ms duration and gain the same reliable progress/cancellation helper. Game Back/Home stay immediate. Completing a hold opens the existing PIN gate; it does not bypass it.
5. Changed source: `js/app.js`, `index.html`, `css/style.css`, cache `vb-v155`; new behavioral tests are `tests/gear-hold-feedback.test.mjs`.

## Validation
1. Full final application run: **254/254 tests**, zero failures/skips,222.6s. Focused run: **7/7** (five new behavior tests plus two existing duration tests). The new progress test failed against the old implementation; independent baseline probes reproduced edge jitter, incorrect reduced-motion feedback and second-finger cancellation.
2. Tests exercise physical mouse edge+jitter, real Chromium touch events, timed partial fill, early release, rapid taps, pointer ownership/cancellation, page exit/blur and keyboard repeat. Independent fixed-commit reviewer passed5/5 new tests and found no remaining material issue.
3. Separate visual checks at756x1270 and320x568 showed47-49% fill after1.4s, a visible countdown, and idle reset. Completed holds landed on a visible `#pinGate` with `#mainSettings` hidden. Independent in-game probe confirmed exactly one settings overlay while a completed press stayed held.
4. Ignored evidence: `.publish-test-first-pass-evidence/hold-*`. Tests use synthetic profiles. This is Chromium automation and visual verification, not a physical iPhone/Android long-press certification. The previous Art80/80 walkthrough and offline results remain evidence for that earlier application commit; they were not re-labelled as new runs here.

## Remaining
1. Scott can try the updated hold in the open preview. The prior full-app Claude code review remains pending; independent Codex review is not Claude signoff. Direct Claude documentation confirmation was completed earlier.
2. Release the two exact Parent hold claims after recording the handoff. Preserve preview access and Scott's production promote gate.
