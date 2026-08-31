# What this recipe does NOT prove

Written 2026-08-30, rewritten 2026-08-31 when the Drive step grew from 10 hand-picked
screens to 53 covering every activity and all ten tiers. Being explicit about the gaps
is the point: a verification recipe that quietly omits things reads as full coverage
when it is not.

## Not covered, and why

1. **Offline mode.** The app's headline promise is that it works with no internet, and
   nothing here tests that. The automated drive always has a network. Proving it needs a
   run that installs the service worker, goes offline, and then navigates — including the
   case where a download reported "complete". This is the biggest single gap, because
   `parent/settings.html` decides a download finished by **counting** cached files rather
   than checking each required one is present, so it can report success while a needed
   asset is missing.
2. **Cloud sync.** Not driven at all. The recipe deliberately stays signed out. Two
   reasons: signing in would write to the live family database, and the feature is known
   broken for more than one device (see trap 2 in VERIFYING.md). Worth writing up only
   after the per-device sign-in fix lands.
3. **Voice playback.** The drive confirms an activity loads and draws, not that the right
   clip plays. Audio assertions in a headless browser are unreliable; a person listening is
   still the honest test. `features/activity-with-voice.md` covers that by hand.
4. **The Yoto integration.** Blocked upstream on Yoto verifying the app, so there is
   nothing to verify.
5. **Watch and Listen only ever show their empty state.** Both are opened by the drive
   (as of 2026-08-31), but the ten seeded test profiles have no YouTube channels and no
   playlists configured, so each page renders its "nothing added yet" card and stops —
   the drive never clicks into a channel, so it never exercises the `/yt-feed` proxy call
   or loads an actual YouTube iframe. A person adding a channel in Parent Settings and
   pressing play is still the honest test of Watch actually playing something.
6. **Every activity is driven once, at one tier, at one width — not the full matrix.**
   As of 2026-08-31 the drive opens all 21 activity pages (every one in
   `js/profiles.js`'s `ACTIVITY_FEATURES` except `peek-a-boo.html`, which has had no menu
   link since commit `5e37113`), which is a big jump from the original 10-screen pass —
   but each one is opened exactly once, which leaves real gaps:
   - **Only the youngest eligible tier is tried.** Each activity is opened signed in as
     the tier matching its own `minTier` — the earliest age it's allowed to appear for.
     A bug that only shows up for an *older* kid on the same activity (say, tier 8 vs.
     tier 2) would not be caught.
   - **The upper tier boundary (`maxTier`) is never tested.** `abcs`, for example, is
     meant to disappear from a kid's home once they pass tier 6. Nothing here opens it
     as a tier-7+ kid to confirm it's actually hidden, or confirms a too-young kid can't
     reach it directly by URL.
   - **No feature toggle is ever switched on.** Every activity in `ACTIVITY_FEATURES`
     that has a `features` list (quiz modes, drag-to-match, spell-from-letter-bank,
     subtract/multiply/divide, and more) is driven only in its default, everything-off
     state. The toggles themselves are exercised only in the smoke-test checklist in the
     project's `CLAUDE.md`, by hand.
   - **No individual activity is opened at tablet or PC width.** The responsive pass
     (item 4 below) only re-opens the shell screens at those sizes — an activity's own
     canvas or game board could still overflow or clip on a wider screen without this
     drive noticing.
7. **Tier gating is proven from the "allowed" side only.** Because every activity is
   opened using a tier that *is* allowed to see it, this drive cannot catch a gating bug
   that let an activity through to a kid who is **too young** for it — it only proves
   eligible tiers can open their pages without error, never that ineligible ones are
   correctly blocked or hidden.
8. **Real devices.** The drive now emulates three sizes (phone, tablet, PC) instead of
   one, but everything still runs in a desktop browser emulating those sizes. It has
   never been driven on an actual phone, iPad, or laptop, and touch/mouse input
   differences aren't exercised at all — every "click" here is a synthetic one.
9. **Accessibility.** No keyboard or screen-reader pass. The audit of 2026-08-25 found the
   main child navigation is not reachable by keyboard at all, so this would fail today if
   it were written.

## What that leaves you able to say honestly

A green run means: **every one of the app's 21 activities, plus Watch and Listen, loads,
draws, and reports no browser errors at phone size — each signed in as the youngest kid
allowed to see it; the child home screen does the same for a test kid at every one of the
ten tiers; and the profile picker, section menus, achievements shelf, and parent PIN
gate all hold together at phone, tablet, and PC width.**

It does not mean the app works offline, syncs, speaks, plays an actual video or song,
correctly *hides* an activity from a kid who's too young or too old for it, holds up at
every tier an activity is visible to (only the youngest is tried), survives a wide
screen on an individual activity's own layout, or is usable without a touchscreen.
