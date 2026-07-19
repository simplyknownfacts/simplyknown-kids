# TECH-STACK.md — Kids App "Valiant Breeze" (kids.simplyknown.co)
*Orientation for external consultants / auditors / any AI tool or account working on this code. Operational state + house rules live in `CLAUDE.md` (same folder) — read that second.*

## What this is
A kids' learning PWA (ages 0–10): games, art, learning activities, recorded voice prompts, parent-PIN settings, multi-device family sync. **⚠️ THIS REPO IS PUBLIC** (GitHub Pages hosting) — never commit secrets, kid photos, or personal data.

## Languages
| Language | Where | Used for |
|---|---|---|
| **JavaScript (vanilla — NO framework, NO build step)** | `js/*.js`, inline scripts in `index.html` / `home.html` / activity pages | The entire app |
| HTML/CSS | root + `games/` `learning/` `art/` `parent/` `videos/` | One page per activity |
| JavaScript (Cloudflare Worker) | `workers/sync/src/index.js` (+ `workers/backup-worker/`) | Family cloud sync + voice endpoints + backup |
| Node.js scripts | `scripts/*.mjs` (`generate-voices.mjs`, mascot/asset generators) | Pre-generating ElevenLabs voice MP3s + art assets |

## Architecture
1. **Hosting = GitHub Pages** (NOT Cloudflare Pages): push to `main` on `github.com/simplyknownfacts/valiant-breeze` → auto-deploys to kids.simplyknown.co. No CI, no build.
2. **State lives in `localStorage`** (`vb_profiles`, `vb_active_profile`, `vb_pin`…) — the app works fully offline. PWA: `manifest.json` + service worker `sw.js`.
3. **Cloudflare Worker `simplyknown-kids-sync`** (optional cloud layer): signup/signin/push/pull family sync → D1 database `sync`; also `/yt-feed` proxy (Watch page) and `/voice-name` + `/voice-clip` (paid name-voice generation; ElevenLabs key lives as a Worker secret, never client-side).
4. **Voices are pre-generated MP3s** (`audio/{girl,boy,woman,man}/`) committed to the repo. There is NO runtime TTS fallback — unrecorded phrases stay silent + captioned (by design, v124+). New kid names need a voice pre-gen run (`scripts/generate-voices.mjs`).
5. **Parent PIN**: SHA-256 + salt hashed in localStorage, lockout after failed attempts, recovery phrase. All in `parent/settings.html` inline script.
6. Backups: nightly D1(`sync`)→R2 dump owned by the fleet `backup-orchestrator` (lives in the Video Bot repo); `workers/backup-worker/` stays for manual `/run`.

## Run / test
- Local: open `index.html` in a browser (or any static server). No build.
- Tests: `tests/e2e/` (Playwright-driven verification scripts + MAP.md).
- **Service worker gotcha:** bump the `CACHE` version string in `sw.js` when shipping changes, or users see stale files.

## Deploy
`git push` to `main` = deploy (GitHub Pages). The **sync Worker deploys separately** (wrangler / CF API) from `workers/sync/` — its live version must stay committed (history lesson: the worker was once edited + deployed from disk without committing; don't repeat that).

## Secrets — NEVER commit (public repo!)
- `.env` (`ELEVENLABS_API_KEY`) — gitignored, used only by local Node scripts. **⚠️ This key is SHARED with the Video Bot + Car App projects** — rotating it breaks all three (see CLAUDE.md cross-project note).
- Worker secret `ELEVENLABS_API_KEY` (Cloudflare-side) for `/voice-name`.
- No kid personal data in the repo — profiles/birthdays live only in localStorage + the family's own synced D1 rows.

## Conventions & gotchas
1. **Escape user data before DOM insertion** — profile names/colors go through `_esc` / `safeHexColor` (stored-XSS was found + fixed in v141). Keep the pattern for any new user-entered field.
2. Age tiers T1–T10 (`js/tiers.js`) gate features by months-of-age — new activities should respect the tier system + per-profile feature toggles (`js/profiles.js` ACTIVITY_FEATURES).
3. Audience is toddlers: huge touch targets, no reading required for kid-facing screens, voice prompts everywhere.
4. iPad/phone-first layout; desktop rendering is a known open decision.
5. Repo codename "Valiant Breeze" = the kids app. Same thing.

## Doc map
`CLAUDE.md` = operational truth (voice table, activity test matrix, security notes) · `docs/handoff/` = session handoffs · `tests/e2e/MAP.md` = screen map.
