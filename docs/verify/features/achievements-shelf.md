# Achievements and the ribbon shelf

Why it matters: this is the app's only reward loop. If ribbons stop being awarded, or are
awarded far too easily, the app either feels dead or feels meaningless.

## Drive it

1. Open the active child's home, then **Achievements**.
2. Note the current ribbons. On a fresh profile the shelf should be empty but must still
   render — an empty shelf is a normal state, not an error.
3. Play **Games → Bubble Pop** and pop bubbles steadily for about a minute.
4. Return to Achievements. Expected: a first-play ribbon for that activity, and progress toward
   the first milestone.
5. Scroll the shelf on a phone-sized window. Expected: it scrolls smoothly and nothing is cut off.
6. Reload the page. Expected: ribbons persist.

## Pass looks like

1. Each activity awards exactly one first-play ribbon, then milestone ribbons at
   50 / 250 / 1000 / 2500 / 5000 / 10000.
2. Ribbons survive a reload.
3. The shelf scrolls on a phone without the page itself scrolling sideways.
4. The star ribbon is not handed out every few seconds — over-earning was fixed in v83 by
   giving fast activities their own slower counting rate.

## Traps

1. **Achievement counters live in browser storage**, so a run on a device that already has
   progress will pass without awarding anything new. Use a fresh profile.
2. The rules are covered by `tests/achievement-defs.test.js` and
   `tests/achievement-logic.test.js`, which run inside `npm test`. If those pass but the shelf
   looks wrong, the problem is display, not rules.
3. The shelf is marked up as a button but has no keyboard or focus behaviour, so it cannot be
   reached without a touchscreen or mouse. Recorded in the audit of 2026-08-25.
