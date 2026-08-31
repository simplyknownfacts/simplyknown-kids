# Trophy Joy — celebration rework spec (not built)

Written 2026-08-31 for the Kids-app-overhaul work order, Phase 2. **Spec only.**
No code in this document has been written to disk — master approves this spec
before anything here gets built.

## Where the problem actually lives

Read before designing around it. There is one celebration path in the whole
app, and it is small:

- `js/progress.js:27-29` — `celebrate(unlocked)` calls `vbCelebrate.show(unlocked)`
  the moment any award unlocks.
- `js/celebrate.js` — the entire mechanism, 49 lines. `show()` queues one or
  more award defs; `next()` pops one, builds a full-screen overlay
  (`.vb-celebrate`, styled in `css/achievements.css:139`), plays a sound, speaks
  a single generic line ("You earned a new ribbon!"), holds it for **1300ms**,
  fades over **300ms**, then immediately calls `next()` again if anything else
  is queued. **~1.6s per award, serially, no gap.**
- The only caller of `.record()` that matters here: **every activity calls it
  on every single success** — `games/tap-pop.html:220` fires on every bubble
  popped, `learning/count-along.html` fires on every correct answer. There is
  no batching upstream. A fast tap game hitting a repeat-star threshold
  mid-frenzy (every 300 taps, `js/achievement-defs.js:65`) freezes the screen
  for 1.6s **while the child is still tapping**.

So "never interrupt" isn't a UX nicety, it's fixing a real, currently-shipping
bug: the overlay steals the screen from an unfinished tap.

## What's already there to build on

- **A real rarity ladder**, not something to invent: first-play (xp 1),
  milestone bronze→diamond (`js/achievement-defs.js:52-58`, xp 1 through 10,
  thresholds 50 to 10,000), a repeatable "star" every 120-300 successes
  (xp 1), mastery per activity (~14 of 21 have one), a streak line, and a
  rank ladder Sprout→Legend (`:79-86`). Diamond and mastery are rare and
  already worth more than a star; the celebration should look like it.
- **An age-shaping precedent already shipped**: `js/app.js:365-374` — tier
  9+ ("Grade 3+") gets captions + sound effects only, no spoken narration,
  because a 9-year-old finds it babyish. Same pattern extends cleanly to
  celebrations; this spec doesn't invent age-shaping, it reuses the rule
  that's already in production.
- **The mascot system** (`js/mascot.js`, 16 species) has idle animations only
  (`UNIVERSAL_IDLES`, `SPECIES_IDLES`) — no celebration-specific clip exists
  yet. Flagged below as new asset work, not assumed free.
- **The shelf widget** (`js/shelf.js`) stays exactly as-is per the work order
  — this spec only touches the interruption, not the always-visible ribbon
  case.

## 1. The never-interrupt rule, concretely

Two activity shapes need two different "pause points," because master is
right that a sensory tier-1 game has no round end.

**Round-based activities** (quizzes, Shape Match's round mode, Memory Match's
board-clear, Spelling, Math, Money, Clock, Days, Animal Sounds quiz mode —
roughly half the catalog): the pause point is the existing round-end moment
each of these already has some signal for (a correct/wrong resolution, a
"round complete" state). An award earned mid-round **banks silently** — no
overlay, a small icon change is enough (see "corner glint" below) — and the
full celebration fires the instant that round resolves, before the next one
starts.

**Continuous/sensory activities** (Bubble Pop, Magic Touch, Surprise Pop,
Tap-a-Tune, Tilt Drive, Peek-a-Boo, and the four art canvases): there is no
round. The pause point is whichever comes first:
1. **Input goes idle** — no tap/drag for ~2.5s (long enough that a genuine
   pause reads as "done for now," short enough that it still feels timely).
2. **The child leaves the activity** — taps Back to the section menu.
3. **Next Home arrival**, as a backstop, so nothing earned is ever lost or
   silently un-celebrated if neither of the above fires in a session.

**At the exact moment an award triggers mid-play**, in both shapes: a small
**corner glint** — the shelf/ribbon icon that's already always visible
(`js/shelf.js`) pulses or briefly glows for ~400ms, no overlay, no sound
louder than a soft chime, does not block input. This is the "silent bank"
master asked to choose between — chosen because a genuinely *silent* bank
gives a toddler no feedback at all that anything happened, which reads as
the app ignoring them; a glint is the minimum acknowledgment that doesn't
interrupt.

## 2. Burst collapse

Today: N awards queued = N full overlays back to back, ~1.6s × N. A milestone
and its accompanying repeat-star landing on the same tap is common and
currently means two overlays in a row for one action.

**Rework:** everything banked since the last celebration fires as **one**
event, structured as a stack the child can see all at once rather than a
slideshow — up to 3 ribbons shown side by side with the biggest/rarest one
centered and largest; beyond 3, the extras collapse into a "+N more" chip on
the stack rather than growing the layout further. One mascot beat, one sound
cue, one dwell period sized to the group (base dwell + a small increment per
extra item, capped) rather than the sum of N individual dwells — a burst of
5 small stars should still feel like *one* moment, not 5.

## 3. The joy moment

**Mascot involvement:** the big celebration is the first real use of the
mascot beyond idle animation and the home greeting. **This needs a new clip
per mascot** (a "celebrate" pose/animation) — 16 species, so this is real
asset work, not a CSS change. Sized as its own line item below, separate
from voice.

**Confetti/sound, scaled by rarity:** map directly onto the existing tiers
rather than inventing a new scale — a repeat-star gets a light, quick sparkle
and a short chime; bronze/silver/gold get a proper confetti burst matching
`VB_RANKS`' colour progression (`js/achievement-defs.js:79-86`); sapphire/
ruby/diamond and mastery get the largest burst, the mascot's celebrate clip,
and a distinct "big" sound cue reserved for those tiers only, so a diamond
*sounds* different from a bronze before a child even reads the ribbon.

**Naming the actual award:** today's spoken line is one generic sentence
regardless of what was earned. The rework speaks the real title
("Sapphire Bubble Pop!") where a recording exists, falling back to caption-
only (matching the app's existing "no clip, no robot voice, caption instead"
rule — never synthesize on the fly) where it doesn't. This is the piece that
needs new voice clips — see the ElevenLabs option below; without it, this
section ships with captions carrying the specific title and the existing
generic spoken line unchanged, so the fix isn't blocked on spend.

**Staying exciting the 50th time:** two things do this without new content.
First, the rarity scaling above means a run of stars *should* feel routine —
that's correct, not a bug to fix, because a diamond staying special depends
on stars staying quiet. Second, a small pool (3-4) of interchangeable
confetti animation variants and mascot celebrate-clip framings, picked at
random per celebration within a tier, so consecutive same-tier celebrations
don't play frame-for-identical.

## 4. ElevenLabs v3 — priced option, not load-bearing

Per Scott's inbox note (2026-08-31): v3 adds audio tags (`[excited]`,
`[whispers]`) for emotional delivery over the same pre-generated-MP3 pipeline
this app already uses — **not** a move to realtime TTS, which stays off the
table for the reasons already settled (offline, COPPA, cost).

**Proposed scope, sized to be affordable rather than exhaustive:** do not
voice all ~140 individual award titles (21 activities × up to 9 defs each).
Instead, record a small set of **reusable `[excited]` praise templates** —
roughly 12-15 phrases across the rarity bands ("Wow, {activity}!" for stars,
up to a distinct "You did it — {activity} Diamond!!" set for the top tier) —
in the app's existing 4 voices, the same way `js/voice-manifest.js` composes
existing phrases from parts. `{activity}` slots in from each activity's
existing name.

**Cost — checked against ElevenLabs' own published rates (2026-08-31), not
guessed.** v3 uses 1 character = 1 credit, same as v2, at roughly
$0.10-$0.20 per 1,000 characters depending on plan tier (elevenlabs.io/pricing;
cross-checked against a third-party 2026 pricing breakdown — both agree on the
per-character basis and the $0.10/1k figure at API rates).

The 9 template phrases already coded in `js/celebrate.js` total 110
characters. Adding roughly 6 more named-award variants (e.g. "Sapphire Bubble
Pop!", longer because they include the activity name) brings a realistic
15-phrase set to about 260 characters. **× 4 voices = ~1,040 characters total
→ roughly $0.10–$0.21 for the entire batch.** This replaces the earlier
"~50-60 clips, likely under $5" estimate, which was a conservative guess
before checking real rates — the actual cost is about 25x smaller than that
guess. Whatever ElevenLabs subscription already generates this app's
name-voice clips likely has more than enough headroom in its monthly
character allowance to absorb this without even touching pay-as-you-go
pricing; Scott/master would need to check the account's current usage to
confirm that, since this chat doesn't have visibility into billing.

**What ships without it:** the tier-scaled confetti/mascot/dwell rework, the
never-interrupt fix, and burst collapse are all independent of this. Without
new voice clips, the celebration speaks the existing generic line (or stays
silent+captioned per the no-robot-voice rule) while still looking and timing
correctly. The v3 clips are additive polish, not a dependency.

## 5. Age-shaped joy

Reuses the tier-9 boundary already in production (`js/app.js:374`) rather
than inventing a new one.

- **Tiers 1-2 (littles):** biggest, most obvious version — full mascot
  animation, longest dwell within the cap, brightest confetti, spoken line
  when available. Short attention spans mean "unmistakable" beats "tasteful."
- **Tiers 3-8:** the default version described above.
- **Tiers 9-10 (Grade 3+):** captions + sound effects only, matching the
  existing no-spoken-narration rule exactly — no new age band invented, this
  is the same line `js/app.js:374` already draws, applied to celebrations
  too. Confetti and mascot stay (visual, not narration), but scaled down —
  a 9-year-old still likes seeing a diamond confetti burst; they don't want
  to be talked to like a toddler about it.

## 6. Test plan

**Proving "never interrupts," automatically:** extend `tests/verify-drive.mjs`
with a new pass that drives a fast-tap activity (Bubble Pop) with rapid
synthetic taps crossing a repeat-star threshold mid-sequence, and asserts
`.vb-celebrate` (or its replacement) is **absent from the DOM** for the
entire duration of the tap sequence — only appearing after input goes idle
per the rule in §1. This is a real assertion, not a visual check, and it's
exactly the kind of thing this app's Testing Standard already asks for:
a test that fails if the interruption regresses.

**Proving burst collapse:** seed a profile positioned to cross 2-3 thresholds
in one action (a milestone and a repeat-star on the same tap is already
achievable by seeding `counters` close to both boundaries) and assert exactly
one celebration element renders, containing all banked awards.

**Demo page for Scott to feel it, not read about it:** a small standalone
page (not part of the child-facing app, listed nowhere in navigation) that
triggers each rarity tier and the age bands on demand — a row of buttons:
"Star," "Bronze," ... "Diamond," "Mastery," "Burst of 3," "Tier-1 view,"
"Tier-9 view." This is what actually answers "does it feel exciting" — a
test suite can prove it doesn't interrupt, only a person watching it can
judge whether it's fun.

## What this spec does NOT cover

1. No code changes anywhere in this document — spec only.
2. Does not touch the shelf widget, which stays as-is per the work order.
3. Does not commit to the ElevenLabs spend — priced, not approved.
4. Does not design the new mascot celebrate-clip art itself (16 species) —
   flagged as real asset work whose cost isn't estimated here; that's a
   separate ask once this spec's shape is approved.

## Done when

Master approves this spec (or sends back changes) before any of it is built.
Nothing here ships without that gate, per the work order.
