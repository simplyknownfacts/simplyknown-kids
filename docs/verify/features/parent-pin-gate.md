# Parent settings and the PIN gate

Why it matters: this is the only thing between a toddler and every setting in the app.

**Set expectations first.** This PIN is a child deterrent, not security. The check and the
lockout both live in the browser's own storage, so anyone with developer tools on the device
can walk straight past it. Say that plainly to parents rather than implying protection the
app cannot give.

## Drive it

1. Serve the app and open `http://localhost:8866/index.html` on a phone-sized window.
2. **Press and hold the faint gear in the bottom-right corner.**
   ⚠️ The hold is about **0.7 seconds**, not the 3 seconds `CLAUDE.md` claims. `index.html`
   calls `holdToActivate` without a duration, so it takes the 700 ms default from
   `js/app.js`. Either the documentation or the call is wrong — the code is what happens.
3. First visit: it asks you to set a PIN. Set `1234`. Confirm it also offers a recovery
   phrase, and set one of at least 12 characters.
4. Reload and re-enter. Expected: the PIN is required again.
5. Enter a wrong PIN **five times**. Expected: locked out for five minutes, with a live
   countdown on screen. Enter it wrong **ten times** total: thirty minutes.
6. With a recovery phrase set, confirm "Forgot PIN?" appears on the gate. Without one, it
   must not appear.
7. Enter the correct PIN. Expected: lockout clears and settings open.

## Pass looks like

1. The gear only opens settings on a hold, never a tap.
2. A wrong PIN never opens settings.
3. The lockout counts down and clears only on a correct PIN or recovery phrase.
4. No error appears in the browser console at any point.

## Known problems, already recorded

1. The separate exit-PIN flow in `home.html` has **no lockout at all**, unlike this one. Two
   PIN flows, two behaviours.
2. Clearing browser data erases the PIN and the recovery phrase with no way back, and the
   app does not warn parents about that anywhere.
