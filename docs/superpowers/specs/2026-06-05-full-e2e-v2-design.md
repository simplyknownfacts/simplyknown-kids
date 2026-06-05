# Full E2E Test v2 — Correctness + Visual, Two Methods — Design

**Date:** 2026-06-05 · **Status:** approved (Scott) · **Spec review:** waived by user

## 1. Goal & why

The existing E2E (`tests/e2e/run-e2e.mjs`) reported "208/208 clean" yet three real bugs shipped through it: Body Parts tapping the nose registered as "ear", the coloring upload produced speckled junk, and 3 figure PNGs had foreign image slivers. **Cause:** it only asserted that clicks did not error — never that the *result* was correct, and never *looked* at the screen.

v2 fixes that gap. It verifies **behavioral correctness** (assert the real outcome of each interaction) **and visual correctness** (screenshot judgment) across **all 8 age tiers**, **all 19 activities**, the shell, all Parent-Settings controls, on **phone + tablet (+ rotation)** — using **two independent methods** so anything one misses, the other catches.

## 2. Scope

**In:** 6 games, 9 learn, 4 art (19 activities); shell (profile picker, home, 3 hubs, achievements/ribbons); Parent Settings (PIN gate + lockout, profile create/edit/delete, activity-visibility toggles, per-feature toggles, voice picker, mascot picker, coloring-page upload, change PIN, responsive accordion); navigation/back/home; achievements & ribbon award cadence; PWA/version verification; viewports phone + tablet; portrait↔landscape rotation.

**Out (this pass — verify UI/empty-state render only, no real login/network):** Yoto connect + library + Listen playback; Cloud Sync sign-in/sync; YouTube real channel add/playback.

## 3. Definitions

### 3.1 Tiers (`js/tiers.js`)
| Tier | Label | Age | Months |
|---|---|---|---|
|1|Sensory|0–12 mo|0–12|
|2|Explore|1–2 yr|12–24|
|3|Match|2–3 yr|24–36|
|4|Pre-K|3–4 yr|36–48|
|5|Pre-K+|4–5 yr|48–60|
|6|Kindergarten|5–6 yr|60–72|
|7|Grade 1|6–7 yr|72–84|
|8|Grade 2+|7+ yr|84+|

Tier computed from `birthday` via `getAgeMonths`→`tierForAge`; per-activity override via `profile.tierOverrides[activityId]`.

### 3.2 Activities + gating
Source of truth = `js/profiles.js` `ACTIVITY_FEATURES`. **The harness reads it at runtime** rather than hardcoding (the mapping agents disagreed on a few minTiers — code wins). Sections + minTier: games (all minTier 1) ×6; learn — hello-colors 1, animal-sounds 1, count-along 2, abcs 2, body-parts 2, days 3, math 4, spelling 4, money 4; art — stamp-art 1, finger-paint 1, color-splash 1, color-in 2.

### 3.3 Viewports
- Phone: 390×844 (portrait), 844×390 (landscape).
- Tablet: 820×1180 (portrait), 1180×820 (landscape).

### 3.4 Correctness oracle
Per-activity expected behavior in **Appendix A** (condensed from a 5-agent code map). "Pass" = the asserted/observed outcome matches the oracle, not merely "no crash."

## 4. Target environment

Test the **live site `kids.simplyknown.co`** after deploying v97. Harness seeds state deterministically via localStorage on that origin: `vb_profiles` (array), `vb_active_id`, `tierOverrides`/`features` per profile to exercise each tier, `vb_pin` for the parent gate. No real accounts.

## 5. Method A — scripted hybrid (coverage backbone)

- **Where:** extend `tests/e2e/` — new `run-e2e-v2.mjs` orchestrator + per-area modules. Node + Playwright, headless, own browser, parallel via contexts.
- **Matrix:** tier 1..8 × 19 activities × {phone, tablet}. Plus shell + settings suites (tier-independent or representative tiers).
- **Per cell:** seed profile→tier, set features as needed, navigate to the live activity, perform real interactions, and **assert the resulting DOM/behavior** against Appendix A. Capture a screenshot at each key state to `tests/e2e/screenshots/<tier>/<activity>-<viewport>-<state>.png`. Emit structured JSON + console pass/fail per check.
- **Instrumentation:** inject hooks before app code to capture `speak()` / `playSuccess()` / `playBoop()` / `playChime()` call args (assert *audio intent* without real audio) and to record `console.error`/uncaught exceptions (any → fail).
- **Visual review (me):** after the run I review the screenshot gallery for the criteria a script can't judge — coloring line-art quality, Body-Parts zones sitting on each of the 12 kids, layout/overflow/spacing on phone+tablet, mascot rendering, empty states, ribbon rendering.

## 6. Method B — agent-driven (independent human-like pass)

- **Vehicle:** a Workflow (multi-agent; Scott opted in).
- **Structure:** one agent per tier (8). Browser automation is a single shared instance, so agents run **sequentially** (not literally parallel) — each sees a screenshot, decides the next tap, like a person. (If isolated headless browsers per agent prove easy, parallelize; default sequential.)
- **Each tier-agent:** on the live site, seed its tier's profile, then for that tier's *visible* activities + the relevant settings, click like a parent/kid on phone then tablet, run the negative cases, and **judge correctness against the oracle by looking**. Returns structured findings: `{screen, action, expected, actual, pass, severity, screenshotRef}`.
- **Anti-redundancy:** each tier-agent covers that tier's **distinct** behaviors (the modes that actually differ at that tier) + cross-cutting negatives — not re-clicking states identical to a neighbor tier. Collectively the 8 cover the full matrix. Silent caps are logged.

## 7. Cross-cutting checks (both methods)
1. No active profile → redirect to picker (every screen, incl. direct activity URL).
2. Back/Home buttons hit correct targets (hub vs home).
3. Rapid double-tap doesn't double-navigate/crash.
4. Empty states: hub with all activities disabled; color-in with no uploads; listen not-connected.
5. Persistence: profile/settings/feature/coloring changes survive reload.
6. Rotation portrait↔landscape — especially canvas activities (**HIGH RISK**, §8.1).
7. Console: zero uncaught errors per screen.
8. `prefers-reduced-motion` respected (no animations, layout intact).

## 8. Known high-risk areas (prioritize)
1. **Canvas rotation (likely CRITICAL).** `stamp-art`, `finger-paint`, `color-splash`, `tap-pop`, `magic-touch` set `canvas.width/height` at load with **no `resize` listener** → on rotation new input lands off-screen / content distorts. Expect failures here; fix candidates.
2. **Body-Parts zones on all 12 kids** (today's v97 fix) — verify it holds on live; check the wheelchair (body-09) + afro kid (body-07) specifically.
3. **Coloring XDoG quality** (today's v97 fix) on varied photos — bold outlines, white interiors, no junk.
4. **shape-match** drag-target grid on small viewports; targets go stale if rotated mid-round.
5. **Settings persistence + PIN lockout** (5 wrong→5 min, 10→30 min).
6. **`extraPics`** feature defined but may not gate color-in's built-in scenes — possible dead feature/bug.
7. Listen tile visibility not reactive to Yoto connect (needs refresh) — minor; integrations out of scope.

## 9. Bug handling
- **Severity:** Critical = crash / data loss / activity unusable / wrong-answer-marked-right. High = clearly wrong behavior, still usable. Medium = minor visual/UX. Low = polish.
- **Critical → fix on the spot**, re-test that spot, continue (Scott's choice).
- **High/Medium/Low → log** to the results doc (repro + screenshot + severity); fix in the after-pass per Scott's approval.

## 10. Deploy procedure (Step 0 — prod; confirm before push)
- Repo `simplyknownfacts/valiant-breeze`; GitHub Pages from `main` root; `CNAME` = kids.simplyknown.co.
- v97 is committed on `claude/blissful-dirac-159d53` with `sw.js` = `vb-v97`.
- Steps: merge branch → `main`, `git push origin main`. **Confirm with Scott the moment before pushing** (rule: no prod push without in-the-moment OK). Never force-push.
- Verify live: load kids.simplyknown.co, hard-refresh, confirm `sw.js` serves `vb-v97` (Cache Storage shows `vb-v97`, old `vb-v96` gone).

## 11. Deliverables
1. `tests/e2e/run-e2e-v2.mjs` + modules (re-runnable regression harness).
2. Method B workflow script.
3. `docs/audit/2026-06-05-e2e-v2-results.md` — matrix of screen × tier × viewport pass/fail + screenshot refs + severity-ranked bug list + which criticals were fixed live.
4. Screenshot gallery under `tests/e2e/screenshots/`.
5. Criticals fixed live; approved highs fixed in after-pass → version bump (v98) → redeploy.

## 12. Execution order
0. Deploy v97 (confirm) → verify live.
1. Build Method A harness (oracle checks + assertions + screenshots + instrumentation).
2. Run Method A across the matrix → report + gallery.
3. Visual review of gallery; fix criticals live.
4. Build + run Method B workflow (agent per tier).
5. Consolidate A+B → dedupe → severity-rank.
6. Fix remaining criticals / approved highs → re-verify → bump v98 → redeploy.
7. Write results doc.

---

## Appendix A — per-activity oracle (condensed pass/fail)

> "Correct tap" pattern (most learn/quiz activities): target element gains a success class (`.matched`/`.flash`/green bg) + success sound + correct spoken phrase + auto-advance; wrong tap gains `.wrong` shake + boop + **no** advance. "No-profile → redirect" applies to every activity.

### Games
- **games hub:** only tier-visible cards render; empty msg if none; card→correct file; back→home.
- **tap-pop** (canvas): bubbles spawn + float; tap pops with particles+sound+score (+1, shiny +3); tier scales size/speed/count; tier≤2 empty-tap colorBurst, tier≥3 silent. Rotation (§8.1). No double-pop on a popping bubble.
- **peek-a-boo:** tier1–2 auto-cycle solo reveal; tier3–4 single-curtain reveal; tier≥5 or multiChoice → 2–3 curtains, correct→reveal+advance, wrong→red+boop+stay.
- **magic-touch** (canvas): tap = particle burst+sound; tier3+ drag trail; tier5+ rockets from bottom 40%. reduced-motion → minimal. Rotation (§8.1).
- **tap-a-tune:** 6 pads play notes; tier3+ song button (guided: follow `.next` glow, wrong→shake+boop, complete→success); tier5+ note labels; free-play glissando on drag.
- **surprise-pop:** tap egg → reveal w/ confetti+sound; tier3+ shows name; tier5+ shows "starts with X"; egg cycles 🥚🎁🫧; `busy` blocks taps during 1.7s; no immediate repeat.
- **shape-match:** tier1 (dragMode off) tap-to-name; else drag shape→matching box: correct→`.matched`+success+removed, wrong→snaps back+boop; shape count grows by tier (2→6); all matched→next round. Drag hit-test via target rect (stale on rotation §8.4).

### Learn
- **hello-colors:** tier1 auto-cycle (quiz label empty); tap-all mode reveals each thing's name + advances when all 4 found; quiz (tier4+/colorQuiz) — "tap the BLUE thing" / strict "tap the BLUE BLUEBERRY" with same-color-decoy specific hint.
- **animal-sounds:** garden (tier≤4) tap animal→grows+sound+name; quiz (tier5+/quizMode) play sound → choose (2 choices t5, 3 t6, 4 t7+); 🔊 replay.
- **count-along:** t1–2 tap dots+big-number-skip; t3–4 tap dots w/ order badges; t5–6 quiz "how many?" or continue-count; t7+ skip-count "what comes next" by 2/5/10. Correct pluralization ("1 duck" vs "3 ducks").
- **abcs:** letter + starts-with tiles (speak on tap); wordHints (t3+) shows words; spell mode (t6+) — tap letters in order, wrong→shake, complete→success; Next/Back wrap A↔Z.
- **body-parts** (today's fix): prompt names a part; tapping the matching zone → `.flash` + "Yes! that's the {part}" + advance; tapping a different zone → `.wrong` + (tier≤3) speaks the actually-tapped part, **no** advance; rotate figure every 5 correct; over ~60 taps all 12 figures appear; tier≤3 = 6 parts, tier4+ = 10 parts; **verify zones sit on the feature for every kid incl. wheelchair (09) + afro (07); nose ≠ ear.**
- **days:** t1–4 tap-to-hear, today highlighted; t5–6 after/before quiz; t7+ ordinal/relative quiz. Today = `new Date().getDay()` (timezone).
- **math:** operators by gate — `+` always, `−` tier6/subtract, `×` tier8/multiply; piles shown except `×`; correct fills box+speaks "a op b equals c"; range scales by tier; no negative results.
- **spelling:** multiple-choice (≤t5) tap matching word; spell mode (t6+/spellMode) tap letters in order; t7+ adds 4-letter words.
- **money:** identify (tap named coin/bill, distinct SVGs) or count mode (t6+/countMode) "how much?" pick total; pool by tier (coins only ≤t4, +bills higher); money labels formatted (`$1`, `5¢`).

### Art
- **art hub:** tier-visible cards; color-in only tier2+; empty msg.
- **stamp-art** (canvas): tap places stamp+chime; tier≤2 auto-stamp until first tap; stamp palette always; themeSwitcher (t5+/feature) changes bg+stamps. Rotation (§8.1).
- **finger-paint** (canvas): drag draws stroke; colorPalette (t3+) else auto-HSL; eraser (t5+) wide bg stroke; Clear fills bg. Rotation (§8.1).
- **color-splash** (canvas): tap = radial burst+particles+pop; tier≤2 auto-splash until tap; colorPicker+Clear (t3+). Rotation (§8.1).
- **color-in:** SVG scenes — tap region fills active color (white default), Clear resets; photo pages (uploaded) — paint canvas under XDoG line-art (`multiply`); page-flip arrows wrap; color pips (11). **Verify uploaded photo renders as clean outlines + white fillable interior.** `extraPics` (§8.6).

### Shell
- **profile picker:** time-of-day greeting; tap profile→home; +Add→settings?action=add; gear→settings; seeds 2 demo profiles if none.
- **home:** greeting+name; section cards (Games/Learn/Art/Watch; Listen hidden unless Yoto connected); avatar pill→picker; exit→PIN modal; ribbon shelf→achievements; mascot welcome.
- **hubs (games/learn/art):** tier-filtered cards; empty msg; back→home (history.back), home→home; section ribbon shelf.
- **achievements:** rank banner (XP/next), grouped ribbon grid (earned glow+motion+hat vs locked greyscale), repeat ×N badge, vertical scroll.

### Parent Settings
- **PIN gate:** first-time set (twice, must match); enter to unlock; 5 wrong→5min lockout w/ countdown, 10→30min; recovery email line.
- **profiles:** add (name+birthday required, future birthday rejected, avatar+color), edit, delete (re-point if active); persists to `vb_profiles`.
- **activity visibility:** toggle per activity → hides/shows on hub; persists; per-child independent.
- **feature toggles:** per `ACTIVITY_FEATURES`; checked if tier≥minTier or explicitly enabled; persists per child; parent override is sole gatekeeper (no tier re-check in activities — by design).
- **voice picker:** girl/boy/woman/man/browser; selecting plays a sample + sets `.sel`; default woman; persists.
- **mascot picker:** dropdown (dog/tiger/giraffe/panda/orca/eagle/none) saves immediately; Preview plays welcome; "pick a mascot first" if none.
- **coloring upload:** ＋Upload (image only) → resize ≤800px → XDoG → thumbnail; max 10 ("Max 10 pages"); remove w/ confirm; persists to `vb_coloring_pages`. Non-image rejected.
- **change PIN; responsive:** ≥820px two-pane, <820px accordion (chevron rotates; html is sole scroller).

---

## Appendix B — references
- Coverage maps: 5 Explore agents (games / learn / art / shell+tiers / settings+deploy+PWA), 2026-06-05.
- Prior: `docs/superpowers/specs/2026-06-03-full-e2e-test-design.md` (v1, crash-only) — superseded by this.
- v97 commit `d525f11` (Body-Parts zones + XDoG coloring).
