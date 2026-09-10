# Yoto surface inventory and implementation handoff (codex)

Scott's 2026-09-10 instruction via CEO: API access will not be granted; hide/remove every discoverable Yoto feature. Prefer reversible changes; dormant integration may remain only unreachable, inert, unable to request media/network, and outside offline preloads. This is the only authorized application change during the audit.

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
