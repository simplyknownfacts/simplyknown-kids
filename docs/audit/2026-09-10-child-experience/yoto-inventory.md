# Yoto surface inventory and implementation handoff (codex)

Scott's 2026-09-10 instruction via CEO: API access will not be granted; hide/remove every discoverable Yoto feature. Prefer reversible changes; dormant integration may remain only unreachable, inert, unable to request media/network, and outside offline preloads. This is the only authorized application change during the audit.

## Implementation checkpoint

1. Implemented in `998852f` with the review repair in `df25aec`; independent fixed-commit re-review passed at exact clean `df25aec3ba72b33e698d16a40fac7004e8f2171e`. Child home and Listen no longer require an account or network, parent controls and public copy are removed, the callback is a script-free local redirect, shared-player imports are gone, stale stored state is erased at startup, and cache `vb-v166` excludes the retired scripts and callback.
2. Preserved behavior: Listen exposes the visibility-gated Tap-a-Tune route, all five sleep-timer choices remain, and a real browser test proves local DOM audio fades, pauses, restores volume and clears the timer after Listen → Tap-a-Tune navigation.
3. Red-before-green: `tests/yoto-retired.test.mjs` was 0/4 on the baseline and is 4/4 now. The first independent review reproduced a P2 legacy `vb_yoto_tokens_<profileId>` record surviving startup; the extended browser guard failed before the repair and passed after it. Full local suite: 287/287. Standalone runtime proof: phone 390×844 and desktop 1280×900 child/parent/callback/stale-state checks PASS; forced-offline Listen and Tap-a-Tune PASS from `vb-v166`; zero retired-service requests observed. Re-review additionally proved three legacy keys are removed while unrelated and near-prefix storage remains.
4. Intentionally retained: dormant `js/yoto*.js` source for reversibility and existing `_headers` domain allowances because release/security gate edits were outside scope. No shipped HTML imports those files and the service worker does not preload them.

## Baseline inventory — c96cdbc

| Surface | Baseline source | Required result |
|---|---|---|
| Child home Listen island and connection status | `home.html:33`, imports at 50–53; `js/world-home.js:23–44` | Preserve useful non-Yoto Listen/audio; remove account/connection gate and misleading setup message; no blank island/gap |
| Shared launcher and mini-player, including previously saved playback | `js/yoto-player.js`, imported on home, achievements, all three category menus, Watch, and activity pages | No imports on user pages; old synthetic playing/token state must never create launcher, player, audio request or navigation |
| Listen library, empty state, covers, chapter sheet, playback | `listen/index.html:271–277`, 322–339 and primary script 361–583 | Remove Yoto UI and its execution path; retain local Tap-a-Tune link, parent visibility gate, sleep timer and honest Coming soon section |
| Parent overview button, panel, dynamic nav, client ID, connect/disconnect setup/status | `parent/settings.html:454`, 614–625, 681–682, 868, 887, 1329–1388 | No entry, panel or discoverable deep-link destination; remove builders and imports, update APP_PANELS/nav; leave adjacent voice/settings intact |
| Parent offline help | `parent/settings.html:645,1695` | Remove Yoto from help strings; preserve honest YouTube internet requirement |
| About | `about.html:32,35,42,47–48` | Remove Yoto marketing/integration claims; accurately describe available Listen features |
| Privacy | `privacy.html:50,65–66,88` | Remove retired integration references only; no broader policy change; account for any intentionally retained dormant local data honestly |
| Old callback/deep link | `yoto-callback.html` | Inert local landing/redirect with no auth parameter processing, status messages or API calls; no Yoto title/UI |
| Offline shell | `sw.js:186,203`; `offline-manifest.json` | Exclude retired scripts/callback from preloads and bump cache for changed UI. Do not edit release gates or staging allow-list |
| Dormant integration files | `js/yoto.js`, `js/yoto-config.js`, `js/yoto-player.js` | May remain in Git for reversibility, but not loaded/reachable through app UI or cache preload; evaluate stale state and direct script paths; no credential reads |
| Sleep timer compatibility | `js/sleep-timer.js:119–121` | Optional old-player hook must not revive anything; local registered/DOM audio fading must remain functional |
| Achievements/rewards | No Yoto definitions found in `js/achievement-defs.js`; `achievements.html:32` imports old player | Remove import; test old state cannot introduce player; complete reward-source scan before claiming absence |

## Tests to evolve without hiding failures

1. New `tests/yoto-retired.test.mjs` guards seen fail 4/4 before app changes. Add independent runtime assertions for no discoverable controls/network with stale synthetic Yoto state, callback URLs, desktop/phone parent/child paths, Listen → Tap-a-Tune, sleep timer and offline behavior.
2. Existing `tests/hostile-input.test.mjs`: mini-player tests around 376 and 414 expect `#yotoMini`; Listen source guard around 140 may become vacuous. Change these to verify retired state remains inert, retaining the hostile-input safety intent.
3. `tests/sleep-timer-mini-player.test.mjs` expects cross-page Yoto playback. Replace obsolete behavior expectation with actual local audio fade/expiry/navigation coverage, not a skip. Its synthetic silent WAV helper is available.
4. `tests/world-home.test.mjs:85,137` and `tests/world-islands.test.mjs:139` expect Listen disabled; adapt to the authorized local Listen behavior and retain navigation/input tests.
5. `tests/e2e/verify-yoto-player.mjs` is a legacy standalone driver for the removed feature. Replace or clearly retire the driver; do not claim its old green result. Check whether any wrapper invokes it.
6. `_headers` and `tests/csp-headers.test.mjs` contain allowed Yoto domains. No gate/security-policy edits are authorized. With no reachable execution/import they do not themselves create a user surface or request; record retained dormant allowance rather than editing gates.

## Desk screen for this expansion

1. Change: hide unsupported Yoto integration; retain adjacent local Listen/audio. (codex)
2. Relevant: PMO/Design for removal/no gaps; Engineering/Audit for inert code, offline behavior and fixed-commit regression review, routed by CEO. (codex)
3. Other desks not needed for the bounded UI withdrawal; no new sale, pricing, release, data-collection or broader policy decision. (codex)
