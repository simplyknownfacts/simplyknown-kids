# Profile switching and age tiers

Why it matters: the child's birthday decides which of the ten tiers they are in, and the tier
decides what they are allowed to see. Get this wrong and a two-year-old is shown spelling
tests, or a seven-year-old is shown a baby screen.

## Drive it

1. Open `http://localhost:8866/index.html`. The picker lists every child.
2. Add two children through parent settings: one aged **3**, one aged **8**.
3. Choose the three-year-old. Note which activities appear in Games, Learning and Art.
4. Go back and choose the eight-year-old. Expected: **more** activities, including ones the
   three-year-old could not see (Spelling Bee, Money and Clock Time are gated to older tiers).
5. Confirm the switch actually persisted: `vb_active_id` in browser storage matches the child
   you picked, and reloading keeps that child active.

## Pass looks like

1. Every child in the list is reachable and opens their own home screen.
2. The older child sees strictly more activities than the younger one.
3. The choice survives a reload.

## Traps

1. **The code has ten tiers; some documentation still says eight.** `js/tiers.js` is correct.
   If a document disagrees, the document is stale.
2. **A future birthday is currently accepted** and is treated as a newborn, which puts a child
   in the lowest tier. Recorded in the audit of 2026-08-25 as something to fix.
3. Tier is computed from the birthday **in months**, so a check done on a birthday boundary can
   move a child between tiers mid-test. Use ages well away from a boundary.
