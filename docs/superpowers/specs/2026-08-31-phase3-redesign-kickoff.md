# Phase 3 redesign — kickoff prep (not started)

Written 2026-08-31, while Scott feels the Trophy Joy demo. **Preparation only —
no canvas artboards built, no design decisions made.** Per the work order's
own flow: sample canvas → master inspects → Scott taste-approves → only then
implement. This document gets the ground ready so building the sample can
start the moment master gives the word, not so it starts now.

## What's actually being redesigned, in scope terms

Two things, both already named in the work order, checked against the real
code rather than assumed:

1. **PC/desktop layout — no longer an open decision.** `CLAUDE.md`'s own
   action-item list (#2) has carried "decide whether to support desktop" as
   unresolved for months. Master's ruling folds this into Phase 3: Scott's own
   words, "need working for phone and PC too," settle it. Nothing to design
   around an open question any more — the target is fixed.
2. **Default-theme legibility.** The flagged issue is real, not inherited
   assumption: `css/style.css:206-208` sets `.title` (the storybook default
   theme's main heading style) to italic, and the same `font-style: italic`
   pattern repeats at three more places in the stylesheet for card/tile
   titles. Ornate italic display type at the sizes used here (`clamp(34px,
   6.5vw, 56px)` for the biggest heading) is the exact thing flagged as hard
   to read for a very young audience.

## What's explicitly NOT in scope for Phase 3

Per master's recon note carried in the work order: **the 4-theme system
(Storybook default, plus 3 alternates) is shipped and stays.** This is layout
and legibility polish on top of the existing themes, not a theme rebuild —
worth stating plainly so nobody reads "redesign" as "start over."

## Real target widths — already established, not new

The verification drive (`tests/verify-drive.mjs`) already tests three
viewports for exactly this reason: **390px (phone), 820px (tablet), 1440px
(PC)**. Phase 3's mockups should design against these same three, not invent
new breakpoints — it keeps the eventual build provable by the same suite that
already exists, and the connection between "how PC support was decided" and
"what PC width the tests check" stays traceable to one source.

## Tooling

The `design` skill (Claude Design canvas) is the mechanism the work order
names for the sample. This project also has a `simplyknown-design` skill
already set up for SimplyKnown's brand assets and UI kit components — load
that alongside `design` when the sample build starts, so the mockup uses the
project's real palette/type/asset conventions from the first draft rather
than a generic placeholder look that has to be re-aligned later.

## What the first sample should cover

Matching the work order's own scope for the sample, not expanding it: **home
+ one section hub + one activity**, at the three widths above. Small enough
to judge quickly, broad enough to prove the legibility fix and the PC layout
both work across a real navigation path (home → hub → activity), not just in
isolation.

## What "done" looks like for this kickoff

Nothing here is a decision — it's the brief the next actual design session
reads before opening the canvas. The moment master or Scott says go on Phase
3, the next step is invoking `superpowers:brainstorming` (per this project's
own convention for any creative/design work) with this document as the
starting context, not skipping straight to artboards.
