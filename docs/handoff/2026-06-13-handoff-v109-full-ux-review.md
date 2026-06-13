# Handoff — 2026-06-13 — live at v109 — NEXT CHAT: full hands-on UX review (toddler + parent eyes)

## ▶ START HERE — read this, then DO THE REVIEW YOURSELF

Scott's ask, verbatim intent: **"Go game by game, tile by tile, option by option, and test everything.
Look for more than just bugs — usability, voices aligning with the correct choices, pictures/images
that make sense, ways to improve the art games, etc. Look at it from the eyes of a toddler AND a
toddler parent. NO AGENTS — you do it yourself. Test every little tiny feature we have."**

This is NOT a bug sweep and NOT a job to delegate to subagents. It is a slow, first-person,
play-every-screen UX audit. You personally drive the app in the browser, click every control, flip
every toggle, **listen to (trace) every voice line against what's on screen**, look at every image,
and judge it as (a) a 1–4 year old who can barely tap, and (b) the parent watching over their shoulder.

**Method for EVERY item below — do all five:**
1. **Play it for real** in the browser (Playwright MCP, real clicks/drags, multiple rounds). Local server
   `python -m http.server 8799` from the worktree root; `BASE`/`BASE_URL` both work for the e2e script.
2. **Screenshot + actually look** — does the picture match the word? Is it cramped/clipped/ugly on phone AND tablet?
   (Sweep history: the app's automated tests check wiring, NOT pixels — eyes are required.)
3. **Trace the voice** — when the app says X, confirm the spoken clip + caption match the on-screen
   correct answer. The map: `speak(text)` in `js/app.js` → looks up `VOICE_MANIFEST.phraseHash[text]`
   → plays `audio/<voice>/<hash>.mp3`. For mascots: `mascots/<id>/green/audio/<voice>_<action>.mp3`.
   Animal SFX: `audio/sounds/<id>.mp3`. **Verify the RIGHT sound plays for the RIGHT choice** (e.g. tap
   the cow → "moo", not a generic ding; the quiz says "tap the red rose" → red rose is actually present
   and tapping it is the success path).
4. **Toddler lens** — targets big enough for fat fingers? No fail-punishment? No tiny text? No reading
   required where a 2yo plays? Does a wrong tap feel gentle? Is the reward obvious + delightful?
5. **Parent lens** — is it age-appropriate? Educationally honest (right answers actually right)? Any
   choking-hazard UX (easy accidental exit, easy to wander into settings)? Anything embarrassing/ugly?

**Record findings** in a running list: per item → `[activity/screen] severity(High/Med/Low/Polish) — what
+ why it matters to a toddler/parent + suggested fix`. Separate "bug" from "improvement" from "art idea."
Fix the safe/clear ones as you go (surgical), batch the bigger calls for Scott. **Confirm with Scott
before any heavy art rework or new asset spend** (he has cost rules; image/voice gen costs money).

---

## App state (so you can trust this cold)

- **Repo:** `simplyknownfacts/valiant-breeze`, vanilla-JS PWA, GitHub Pages from `main` root.
  **Live:** https://kids.simplyknown.co. Non-technical owner (Scott): plain English, numbered todo list
  at the end of every reply, caveman/terse by default (global CLAUDE.md). Confirm before spend / prod push.
- **Version:** `sw.js` line 1, `const CACHE = 'vb-v109'`. Next bump = `vb-v110`. Deploy = bump + commit +
  **Scott's in-the-moment "deploy"/"ship"** → push to `main` → Pages ~1-2 min → verify
  `curl -s "https://kids.simplyknown.co/sw.js?cb=$(date +%s)" | head -c 24` shows the new version.
- **Worktree:** branch `claude/quirky-faraday-d7deb2`; everything pushed to `main` (HEAD = v109, commit 2ffcac8).
- **`.env`:** gitignored; lives in the MAIN repo root (`../../../.env`). Scripts auto-load it. Don't commit it.

## The full surface to walk (this IS the checklist — nothing skipped)

### Shell / chrome (test first — every kid hits these)
1. **`index.html` "Who's playing?"** — profile chooser (balloon/lantern cards), each kid shows their MASCOT
   emoji (avatar was removed v103 — mascot IS the icon). "Add a child" button. Starfield/time-of-day sky.
2. **`home.html`** — greeting speaks the kid's name (only if a name clip exists), 4 section tiles
   (Games/Learn/Art/Watch), Listen tile (if Yoto), "My Ribbons" + "See all my ribbons", bottom-right kid
   pill (tap = switch child), mascot floats bottom-left + does welcome animation + idle interrupts.
3. **Section hubs** `games/ learning/ art/ videos/ listen/ index.html` — tiles auto-list from
   `ACTIVITY_FEATURES` filtered by section + `isActivityVisible(tier)`; ribbons shelf at bottom.
4. **`achievements.html`** — ribbon gallery (rank, XP, per-activity milestone trophies + repeatable ★).
5. **Back/Home buttons** on every activity (top-left). Exit/door + gear where present.
6. **PWA/offline** — service worker, "Download family for offline use" (Settings → Offline/Travel).

### Games (8) — play each across YOUNG (T2) and OLDER (T8/T10), flip every toggle
1. **Tap & Pop** (`games/tap-pop.html`) — bubbles, pop on tap; "flash"/"shiny" modes; ★ ribbon cadence.
2. **Peek-a-boo** (`games/peek-a-boo.html`) — curtains; toggle **multiChoice** (T5+). Auto-cycle ≤T2.
3. **Magic Touch** (`games/magic-touch.html`) — particle bursts; trail (T3+), rocket fireworks (T5+).
4. **Tap-a-Tune** (`games/tap-a-tune.html`) — piano keys (C D E G A C), tap + glissando drag; real notes?
5. **Surprise Pop** (`games/surprise-pop.html`) — tap egg → surprise reveal.
6. **Shape Match** (`games/shape-match.html`) — tap mode (T1) vs **dragMode** drag-to-box; shapes named right?
7. **Tilt Drive** (`games/tilt-drive.html`, v104-105) — pick 🚗road/🚤river/🚀space; **tilt OR drag/arrows**;
   dodge; crash → "drove N m / best"; **vehicles point UP**, river=waves, space=stars (verify still true);
   ribbons = meters. iOS motion-permission "tap to start". Difficulty scales by tier.
8. **Memory Match** (`games/memory-match.html`, v107) — pairs 2 (T2, giant cards) → 12 (T10, 6 cols);
   flip, match locks, mismatch flips back; board-clear = mastery.

### Learn (10) — THE VOICE/IMAGE ALIGNMENT IS CRITICAL HERE
1. **Hello Colors** (`learning/hello-colors.html`) — "Tap the <color> <thing>!"; **colorQuiz** (T4). Does the
   named thing exist + is the right color? (e.g. "red rose" → a red rose is on screen.) Voice = the prompt.
2. **Animal Sounds** (`learning/animal-sounds.html`) — garden tap = animal says its sound; **quizMode** (T4)
   "which animal makes this sound?". **Confirm each animal's SFX is ITS sound** (`audio/sounds/<id>.mp3`).
3. **Count Along** (`learning/count-along.html`) — tap dots to count; **quizMode** (T4) "how many?".
   Number voice + noun (e.g. "3 ducks"). Skip-counting mention in roadmap — confirm current behavior.
4. **ABCs** (`learning/abcs.html`) — letter pages; **wordHints** "A is for Apple" (T3), **spellMode** (T6).
5. **Days** (`learning/days.html`) — days of week; **quizMode** "what comes after Monday?" (T5). Emoji per day
   sensible? (Tue=truck? Wed=camel "hump day"? — judge if a toddler/parent gets it or if it's confusing.)
6. **Math Mountain** (`learning/math.html`) — +; **subtract**(T5/visual piles), **multiply**(T8),
   **divide**(T9, always divides clean), **missingNumber**(T10, `7 + _ = 12`). Speaks the equation.
7. **Spelling Bee** (`learning/spelling.html`) — spell short words; letter bank; **spellMode** (T6). Picture matches word?
8. **Money** (`learning/money.html`) — identify coins/bills (SVG); **countMode** total (T6); **makeChange** (T9,
   "costs 65¢ pay $1"). $5 bill big "$5" readable? Coin sizes/colors distinguishable to a kid?
9. **Body Parts** (`learning/body-parts.html`) — "tap the <part>" on a kid figure; **allParts** (T4, hair/belly).
   12 diverse kid figures; tap zones are PER-KID configs (AI figures drift). **Verify zones still aligned** —
   tap the nose, does the nose register (not "ear")? This has a long bug history (v97-v100 eye-detection realign).
10. **Clock Time** (`learning/clock.html`, v107) — read analog clock; o'clock (≤T7) → half-past (T8) →
    quarters (T9) → 5-min (T10). Hour hand advances with minutes (real clock). 4 time choices.

### Art (4) — Scott explicitly wants IMPROVEMENT IDEAS here, not just bug-checks
1. **Stamp Art** (`art/stamp-art.html`) — place stamps; **stampPalette** (T2), **themeSwitcher** farm/ocean/space (T4).
2. **Finger Paint** (`art/finger-paint.html`) — draw; **colorPalette** (T2, 8 colors+clear), **eraser** (T4).
3. **Color Splash** (`art/color-splash.html`) — splat color; **colorPicker** (T2), **clearButton** (T3).
4. **Color In** (`art/color-in.html`) — tap-to-fill coloring pages (Smiling Sun etc.); **extraPics** (T2);
   ‹ › page-flip arrows; photo-upload → XDoG line art (v97). **Art-game improvement brainstorm goes here:**
   brush sizes, undo, save/share the picture, more pages, sticker rewards, sound-on-stroke, etc. — propose, don't build yet.

### Watch / Listen
1. **Watch** (`videos/index.html`) — YouTube; per-kid channel allow-list (Settings → YouTube). Won't work offline.
2. **Listen** (`listen/index.html`) — Yoto player; **BLOCKED**: Yoto library needs Yoto app verification
   (family:library:view not granted to unverified apps). Profile+offline connect works. Don't chase the block.

### Parent Settings (`parent/settings.html`) — every panel, every control
1. **PIN gate** (4-digit pad; lockout after attempts). **Change PIN** panel.
2. **Children** — add (name + birthday + color + **mascot REQUIRED** + **voice REQUIRED**), edit, delete.
   **Mascot picker now has 16 animals** (v109): dog tiger giraffe panda orca eagle axolotl tabby owl parrot
   dolphin octopus lion bunny fox penguin. **Pick a few, confirm each animates + speaks on home.**
3. **Activities** — per-kid show/hide each activity. **Features** — every toggle above (age-gated chips).
4. **Voice** — girl / boy / Grown-up Woman / Grown-up Man; tapping a voice plays a sample. All 4 have full clip sets.
5. **Mascot Buddy** — per-kid dropdown (all 16) + test button. **Coloring** — manage Color-In pages.
6. **Yoto / Cloud Sync / Offline-Travel** panels.

### Cross-cutting things to judge
1. **Voices ↔ choices** — the #1 ask. Wrong-clip-for-right-answer is the worst class of error here.
2. **Big-kid tone-down (≥T9)** — captions + SFX but NO spoken prompts (a 9yo finds narration babyish).
   Confirm young kids STILL get voices and only T9/T10 go silent-narration.
3. **Captions** — small toast bottom-center (shrunk in v105). Readable? Not in the way?
4. **Ribbons/celebration** — earns at the right cadence (not spammy, not never)? Toast not blocking content?
5. **16 mascots** — each: transparent (no green halo), correct species idles, talks in all 4 voices, tap sound.
6. **Tiers 1-10** — content scales sensibly; nothing too-hard-for-young or too-baby-for-old.

## How to drive it (tools)
- **Playwright MCP** (`mcp__plugin_playwright_playwright__*`) — navigate, click, drag, evaluate, screenshot.
  Seed a kid via `localStorage.vb_profiles` + `vb_active_id` (see any prior verify eval in transcript), set
  `tierOverrides[activityId]` to force a tier, set `features[activityId][key]=true` to force a toggle on.
- **Screens are device-res (>2000px)** — downscale to ~700px before reading many at once (ffmpeg or
  System.Drawing) or reads blow context. (There's a downscale one-liner in the v106 transcript.)
- **Full e2e** (wiring oracle, NOT visuals): `BASE=http://127.0.0.1:8799 node tests/e2e/run-e2e.mjs`
  → 280 cells, last run 280/280. **Visual sweep**: `tests/e2e/v2/visual-shots.mjs` → ~80 PNGs you READ.
  These SUPPORT the manual review; they do not replace playing it.

## Recently shipped (context; all live)
- v103 avatar removed (mascot = icon) · v104 Tilt Drive + offline download + smaller captions ·
  v105 Tilt Drive polish (up-facing vehicles, themed backdrops) · v106 full review + ribbons-for-tilt-drive ·
  v107 **ages to 10** (T9/T10) + Memory Match + Clock Time + math ÷/missing-number + Money make-change +
  big-kid tone-down · v108 axolotl + tabby mascots · v109 **8 more mascots → 16 total**.

## Key lessons (don't relearn the hard way)
1. **Automated tests assert wiring/no-crash, NOT pixels or voice-correctness.** This whole task exists because
   eyes + ears find what tests can't. Always play + look + listen.
2. **Visual sweeps OVER-FLAG** (~2/3 false positives historically). Verify every flag by playing it before "fixing."
3. **Body Parts tap zones** have drifted repeatedly — re-verify alignment per kid figure if you touch it.
4. **Confirm before spend** — new art/voice assets cost money; Scott approves in the moment.

## Suggested order for the next chat
1. Shell (index → home → hubs → achievements → settings PIN/panels).
2. Games 1→8, each at T2 + T8/T10, every toggle.
3. Learn 1→10 (heaviest voice/image scrutiny).
4. Art 1→4 (+ improvement brainstorm).
5. Watch/Listen + 16-mascot spot-check + cross-cutting judgments.
6. Compile findings → fix safe ones → present the rest to Scott → (his go) batch into vb-v110.
