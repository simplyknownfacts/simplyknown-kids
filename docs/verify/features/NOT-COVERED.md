# What this recipe does NOT prove

Written 2026-08-30. Being explicit about the gaps is the point: a verification recipe
that quietly omits things reads as full coverage when it is not.

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
5. **The Watch section.** Depends on YouTube embeds and a live feed proxy; it fails without
   a network and would make the recipe flaky for reasons that are not the app's fault.
6. **The remaining activities.** Ten screens are driven, covering one activity per section.
   The other eighteen activities are not opened. This is a deliberate trade: the shared
   code (tiers, profiles, achievements, the paint engine) is what breaks, and it is covered.
   If an activity develops a habit of breaking, add it to `SCREENS` in
   `tests/verify-drive.mjs`.
7. **Real devices.** Everything runs in a desktop browser emulating a phone. It has never
   been driven on an actual iPad, which is the primary device.
8. **Accessibility.** No keyboard or screen-reader pass. The audit of 2026-08-25 found the
   main child navigation is not reachable by keyboard at all, so this would fail today if
   it were written.

## What that leaves you able to say honestly

A green run means: **every main screen loads, draws, and reports no browser errors, on a
phone-sized screen, online, for a three-year-old and an eight-year-old profile.**

It does not mean the app works offline, syncs, speaks, or is usable without a touchscreen.
