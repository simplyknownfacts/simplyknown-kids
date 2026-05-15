# Kids_App — Project Handoff (the "toddler chat")

**Operator:** Scott (simplyknownfacts@gmail.com)
**Live URL:** https://kids.simplyknown.co
**Repo:** https://github.com/simplyknownfacts/valiant-breeze
**Stack:** Static HTML/CSS/JS PWA — no backend, no remote APIs at runtime
**Hosting:** GitHub Pages (auto-deploys on push to `main`). Cloudflare is **DNS-only** for this domain — not proxied, no WAF, no Workers.
**Audience:** Ages 0–5. Single device per child (iPad/phone). No accounts, no remote auth, no MFA.

> Codename in the repo is "Valiant Breeze." Scott calls this the "kids app." Same thing.

---

## How to reach Parent Settings (the #1 thing Scott asks)

Hold the faint **⚙️ gear icon in the bottom-right corner** of the home screen for **3 seconds**. It opens `parent/settings.html`.

- Markup: [index.html:34](index.html) — `<div id="settingsGear">⚙️</div>` (opacity 0.3, fixed position)
- Hold handler: [index.html:87-94](index.html) — `pointerdown` → 3-second `setTimeout` → `goTo('parent/settings.html')`
- Hint text shown to the user: [index.html:31-32](index.html) — "Hold ⚙️ for 3 seconds to open Parent Settings"

Also: the "+ Add child" button on the home screen routes to `parent/settings.html?action=add` directly ([index.html:83-85](index.html)) — used the first time you set up a kid profile.

---

## Architecture quick-reference

```
Kids_App/
├── CNAME                      ← kids.simplyknown.co
├── index.html                 ← profile picker (home)
├── home.html                  ← per-child home (post-profile-select)
├── sw.js                      ← service worker (offline caching)
├── manifest.json              ← PWA install manifest
├── .env                       ← ELEVENLABS_API_KEY (gitignored)
├── parent/settings.html       ← PIN gate + child profiles + feature toggles + voice picker
├── js/
│   ├── profiles.js            ← child profile CRUD in localStorage + ACTIVITY_FEATURES registry
│   ├── tiers.js               ← age → tier mapping (months-based)
│   ├── voice-manifest.js      ← all the phrases the app speaks, per voice
│   └── app.js                 ← speak(), goTo(), navigation glue
├── css/style.css              ← global styles
├── audio/{girl,boy}/*.mp3     ← pre-generated ElevenLabs clips (committed)
├── games/      *.html         ← activity pages
├── learning/   *.html
├── art/        *.html
└── scripts/generate-voices.mjs ← Node script: read .env → call ElevenLabs → write MP3s
```

State lives entirely in `localStorage`. Profile-shape constants: `vb_profiles`, `vb_active_profile`, `vb_pin`, `vb_recovery`, `vb_pin_lockout`.

---

## Parent PIN gate — what's there now

Recently hardened, **shipped in commit `1877c13` (Phase B)**:

- PIN is **hashed** (SHA-256 + per-PIN salt via Web Crypto) and stored as `{hash, salt}` JSON under `vb_pin`. Old plaintext PINs auto-migrate on first successful unlock.
- **Lockout**: 5 wrong attempts → 5-min lock. 10 wrong → 30-min lock. Live countdown banner on the PIN gate. Resets only on correct PIN or recovery phrase.
- **Recovery phrase** (`vb_recovery`): hashed, 12+ chars. Set on first PIN setup or anytime via main settings → "Set / change recovery phrase." From the PIN gate, "Forgot PIN?" appears only when a recovery phrase exists.
- No MFA, no email, no remote anything — appropriate for a kids' app on a single device.

All code lives in the inline `<script>` block of [parent/settings.html](parent/settings.html). Helper functions prefixed `_` (`_sha256Hex`, `_hashWithSalt`, `_getLockout`, `_recordFailedAttempt`, `_matchesStored`, etc.).

---

## Voices & games/apps — testing checklist

Three voice options for each child profile (set in parent/settings → 🎙️ Voice section):

| ID | Label | Source |
|---|---|---|
| `browser` | Browser default | Web Speech API (varies by device) |
| `girl`    | Nurturing Girl (Sarah) | Pre-generated ElevenLabs MP3s in `audio/girl/` |
| `boy`     | Nurturing Boy (Josh)   | Pre-generated ElevenLabs MP3s in `audio/boy/` |

When testing: switch the active profile's voice in parent settings → use **▶ Play sample** to hear "Yes! Apple is Red!" → then launch each activity below and confirm the in-activity phrases sound right.

### Activities to test (8 total — Peek-a-Boo removed from nav in commit `5e37113`; HTML still on disk but no link points to it)

| Category | File | Toggles to exercise from parent settings | Status |
|---|---|---|---|
| Art    | art/stamp-art.html      | stamp picker, theme switcher (farm/ocean/space) | ☐ |
| Art    | art/finger-paint.html   | color palette, eraser tool | ☐ |
| Art    | art/color-splash.html   | color picker, clear button | ☐ |
| Game   | games/tap-pop.html      | score counter, floating bubbles (race mode) | ☐ |
| Game   | games/shape-match.html  | drag-to-match mode | ☐ |
| Learn  | learning/hello-colors.html  | color quiz mode | ☐ |
| Learn  | learning/animal-sounds.html | sound quiz mode | ☐ |
| Learn  | learning/count-along.html   | how-many quiz mode | ☐ |

**Smoke-test path per activity:**
1. Parent settings → set active profile's voice → ▶ Play sample
2. Toggle the activity's feature flags ON for that profile
3. Back to home → enter that profile → open the activity
4. Verify: it loads, voice prompts play, feature flags do what they say, no console errors

Mark items above with ✅/⚠️/🐛 as you go.

---

## Current open action items

1. **Work through the voice + activity test matrix** above. Open one activity at a time and verify voice playback + feature toggles. Pre-generated MP3s exist for both Sarah and Josh — `Browser default` is the wild card (varies per device/OS).
2. **Decide on desktop layout.** The app is currently iPad/phone-only. Confirm whether you want it to also render well on a desktop browser (parents previewing on a laptop, etc.). If yes, this is a future task; if no, lock that as a decision in this doc.

---

## Hosting + deploy facts

- Push to `main` → GitHub Pages auto-builds and serves. No CI step. No `wrangler`. No Cloudflare deploy.
- HTTPS enforced via GitHub Pages-managed Let's Encrypt cert (provisioned 2026-05-15 — `https_enforced: true` confirmed via `gh api repos/simplyknownfacts/valiant-breeze/pages`). Cert valid through 2026-08-13.
- Service worker `sw.js` caches assets — bump the cache version string when shipping major changes or users will see stale files.

---

## Cross-project note

The **ElevenLabs API key** in `.env` here is the same one used by Scott's Tiktok video pipeline (at `Tiktok - DEV1\video-bot\secrets\elevenlabs_key.txt`). If you rotate it, update BOTH places or one of the projects breaks.

---

## What lives elsewhere

- Cross-project rules (how Scott wants to work) → `C:\Users\HomeSeer\.claude\CLAUDE.md` — auto-loaded on every session, every project.
- Tiktok video pipeline → `C:\Users\HomeSeer\OneDrive\Documents\Claude\Projects\Tiktok - DEV1\` (different chat, different repo).

---

End of handoff. Read this first on every new toddler chat.
