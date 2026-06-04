# Harness Selector + Recipe Map

Build reference for `run-e2e.mjs`. Source: 7 code-exploration passes (2026-06-03).

## Universal facts
- **Every page redirects via `goProfiles()` if no active profile.** Seed `vb_profiles` + `vb_active_id` before navigating.
- **Success oracle (all 16):** `window.vbProgress.getState().counters['<id>']` bumps +1 on a correct action. Primary assert.
- **Ribbon-on-load:** opening any activity fires `firstPlay(id)` → `vbProgress.getState().unlocked['<id>.first']` truthy + transient `.vb-celebrate` popup (~2.3s). Idempotent (only fires/pops if not already earned).
- **Tiles are `<div onclick>`** (not anchors) → must click. Most handlers are `pointerdown`; Playwright `.click()` dispatches pointer events (OK). Canvas needs `mouse.move/down/(move)/up`.
- **Set viewport BEFORE navigate** (canvas sizes once at load; no devicePixelRatio scaling).
- **Stub audio/haptics** in init script: `HTMLMediaElement.prototype.play`→resolve, `speechSynthesis.speak`→noop, `navigator.vibrate`→true.
- Use `waitUntil:'domcontentloaded'` (networkidle hangs on canvas pages). Wait on selectors, not fixed sleeps.

## Profile / seed
Shape: `{id,name,birthday,avatar,color,voice:'girl',mascot:null,tierOverrides:{},features:{},youtube:[]}`.
Birthday→tier (mid-band months, day=15): `{1:6,2:18,3:30,4:42,5:54,6:66,7:78,8:120}`. Birthday alone drives both gating and activity difficulty (no overrides needed).

## Flows
- **Add kid (real UI):** `index.html` `#addBtn` → navigates `parent/settings.html?action=add` → pass PIN gate → `#addForm` auto-opens (~100ms) → fill `#newName`, `#newBirthday`(YYYY-MM-DD) → click `button[onclick="saveNewProfile()"]` (text "Save"). Blank → `alert()` (register dialog handler). New `.kid-pill` + `#profilesList .card` appear.
- **Select/switch kid (real UI):** `index.html` → click `.avatar-btn` whose `.name` text matches → sets `vb_active_id` + goes `home.html`. (No per-kid id; select by name text or nth.)
- **PIN gate:** seed `vb_pin='1234'` + remove `vb_pin_lockout`. `#pinGate`/`#mainSettings` both always in DOM → assert **visibility**. Keypad `#pinPad .pin-key` (`<div>`, text=digit, no data-attr; delete=`.key-del`). Click 1,2,3,4 → auto-submits 200ms after 4th → `#mainSettings` visible. NO submit button.
- **Settings layout:** viewport ≥1280 wide → sidebar. Panel nav: `#sideNav .navitem[data-key="<key>"]` → `showPanel(key)`. Keys: activities, features, voice, mascot, coloring, youtube, children, yoto, sync, pin. (Narrow <820: `.acc-title` headers instead; global `showPanel()` works in both.)
- **Feature toggles:** panel `features`. `#featuresTable` checkboxes have **NO data-attrs** → locate by row (activity `.name` in `td:first-child`) + `label.feat-label` by label text → `input[type=checkbox]`. Auto-saves. (See feature→label table below.)
- **Activity show/hide:** panel `activities`. `#activitiesSection input.act-vis[data-pid][data-aid="<id>"]`. Auto-saves.
- **Voice:** panel `voice`. `#voiceSection .vcard[data-voice="<id>"]` (girl/boy/woman/man/browser). Click → selects (class `sel`) + plays sample (stubbed). Assert `sel`.
- **Tier override:** NOT on settings page. In-game gear only: activity page `#gameSettingsGear` → its own PIN keypad `button.gs-key[data-k]` (1,2,3,4) → `select.gs-tier-sel[data-pid]` selectOption value '1'..'8'/'auto'. `#gsClose` triggers `location.reload()`. (Cover once.)
- **Delete kid:** panel `children`. `#profilesList .card` matching name → `button.btn-danger` (text "Delete") → accept `confirm('Delete this profile? This cannot be undone.')`.
- **Ribbon gallery:** home/section shelf `.vb-shelf` (role=button) or `.vb-shelf-btn` → `achievements.html`. Earned cell = `.gallery-cell .vb-ribbon:not(.locked)` / `[aria-label^="Earned ribbon:"]`. Locked = `.vb-ribbon.locked`. No ribbon click-through. Back via `.nav-chrome .back-btn`.

## Feature → label (for #featuresTable text match)
shape-match dragMode="Drag-to-match mode" · hello-colors colorQuiz="Color quiz mode" · animal-sounds quizMode="Sound quiz mode" · count-along quizMode="How-many quiz mode" · abcs wordHints='Show "A is for Apple" word hints', spellMode="Spell short words" · days quizMode="Quiz mode (what comes after Monday?)" · math subtract="Include subtraction", multiply="Include multiplication" · spelling spellMode="Spell from letter bank" · money countMode="Count coin + bill totals" · body-parts allParts="Include extra parts (hair, belly, etc.)" · stamp-art stampPalette="Stamp picker"(DEAD), themeSwitcher="Theme switcher (farm/ocean/space)" · finger-paint colorPalette="Color palette", eraser="Eraser tool" · color-splash colorPicker="Color picker", clearButton="Clear button"(DEAD) · color-in extraPics="Show more coloring pages"(DEAD) · tap-pop (none)

## Gating — expected visible cards per section per tier
| tier | games | learn | art |
|---|---|---|---|
| 1 | 2 | 2 | 3 |
| 2 | 2 | 5 | 4 |
| 3 | 2 | 6 | 4 |
| 4 | 2 | 9 | 4 |
| 5-8 | 2 | 9 | 4 |
Hidden tiles are NOT rendered (absent from DOM), so `#cardsRow .activity-card` count = truth.

## Activity play recipes (nav to file; assert counter bump unless noted)
Nav: open via section-index tile click (validates tile+chrome) when visible at tier; else direct goto.

**GAMES**
- `tap-pop` (canvas `#canvas`): pointerdown sweep lower 60% until `#scoreVal`>0 (also bumps counter). Easiest t1-2 (big/slow). No flags. No win state.
- `shape-match`: t1 = TAP mode (1 `#shapesRow svg.shape`, pointerdown → `#hint` becomes shape name). t≥2 OR dragMode = DRAG: for each `svg.shape[data-shape=X]` drag (mouse down/move steps/up) onto `.target[data-shape=X]` (same value; targets are position:fixed on body) → `.target.matched`. Match by data-shape, never position.
- `peek-a-boo` (click events): t≤2 = AUTO (no click; assert `.animal-solo` renders). t3-4 = single `.curtain` click → `.curtain.open`. t≥5 multi: t≥7 name in `#hint` (click `.curtain-wrap` whose `.animal-name` matches); t5-6 audio-only (click curtains until `.curtain.open`; wrong just boops).

**LEARN** (counter bump = success)
- `abcs`: default (t≤6) = click `.nav-row .pager-btn:not(.secondary)` (Next) → records. spell (t≥7/flag) = read `.spelled-slot[data-target]`, click matching `.letter-grid .letter-tile` per slot.
- `animal-sounds`: garden (t≤4) = click any `#garden .animal-float` → records. quiz (t≥5/flag) = click `.choice-btn` until one bg=`rgba(168,230,207,0.4)` (or counter bump); answer not in DOM.
- `body-parts`: parse `#hint` for part → singular map (eyes→eye,feet→foot,hands→hand,ears→ear,arms→arm,legs→leg; nose/mouth/hair/belly as-is) → click `#figure .hit[data-name=<singular>]` → `.hit.flash`. Rotates body every 5 (re-renders zones). allParts(t≥4/flag) adds arm/leg/hair/belly.
- `count-along`: t≤4 tap all `.dot` (pointerdown) → final records. t5-6 quiz(flag): correct = count `.dot.counted` → click matching `.num-btn`. t5-6 no-flag = tap-count. t≥7 skip-count: parse sequence, click `.num-btn` = next term.
- `days`: t≤4 NO success path (tap-to-hear only; assert renders+tiles). t5-6 quiz(flag): parse `#hint` after/before → click matching `.day-tile`. t≥7 ordinal/relative.
- `hello-colors`: t1 AUTO (no path; assert renders). t2-3 tap-all `.thing-card` → records when all tapped. t≥4 colorQuiz(flag): click `.thing-card` until counter bump / `#bg` color change.
- `math`: compute from `.eq-row` (count `.pile .item` or span nums + `.op`) → click `.num-row .num-btn`=answer → `.answer-box.filled`. subtract t≥6/flag, multiply t≥8/flag.
- `money`: identify (t≤5) parse `#hint` name → map to id → click `.coin-svg[data-id]/.bill-svg[data-id]` → `.matched`. count (t≥6/flag): sum pile data-id cents (penny1 nickel5 dime10 quarter25 dollar100 five500 ten1000) → click `.num-btn` matching formatted label.
- `spelling`: MC (t≤5) emoji→word: click `.word-card` (map known or click until `.matched`). spell (t≥6/flag) like abcs spell via `.spelled-slot[data-target]` + `.letter-tile`.

**ART** (canvas pixel-sample OR DOM)
- `color-in`: SVG page (default) click a `.region` in visible page (`#pageA`/`#pageB`, the non-display:none one) → assert `getComputedStyle(region).fill` ≠ white. Easiest/most deterministic art.
- `color-splash` (canvas `#canvas`, bg `#1a1a2e`): single pointerdown → sample pixel at click ≠ [26,26,46]. t≤2 auto-splashes on timer.
- `finger-paint` (canvas, bg `#1a1a2e`): MUST move — down→move→up; sample stroke midpoint ≠ bg. palette t≥3/flag, eraser t≥5/flag.
- `stamp-art` (canvas, bg `#1a1a2e` default): pointerdown → scan ~60px box around click for non-bg pixel (emoji sparse). palette always on. themeSwitcher t≥5/flag (changes bg color).

## Status rules
- FAIL: pageerror, redirect to index/profiles (seed/active bug), nav fail, blank body, interaction throws.
- WARN: rendered+interacted but no expected success signal (possible broken path).
- PASS: rendered + success signal, OR no-success-path-by-design mode (days t≤4, hello-colors t1, peek-a-boo t≤2, abcs default) that rendered+interacted cleanly (note it).
- Asset 404s (mascots/audio/voices/videos/hats, media ext) = noise, never WARN/FAIL.
