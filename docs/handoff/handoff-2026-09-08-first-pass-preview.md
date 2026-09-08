# Kids first-pass revamp — 2026-09-08 (codex)

## Authority and boundaries
Scott explicitly authorized a complete first-pass revamp and subagents, asking to see the result before production. Work is isolated on `kids/child-experience` in `.worktrees/kids-child-experience`, from `30d28e7`. Original `main` serves GitHub Pages and is untouched. No production/development push or deploy, promote command, fake verification stamp, new scheduled review, or master takeover.

## Current implementation
An illustrated responsive island replaces the flat fox panorama. Five genuine button houses align their visible art and hit areas. The selected child's actual animal roams separately from the background; reduced motion stops decorative movement. Section hubs, profile picker, ribbons gallery and play chrome share the new world design. Default learning rooms use warm paper and clear dark labels. Existing custom themes remain selected by the parent.

Content inventory covers all 22 registered activities plus Watch and Listen. Targeted learning corrections add useful wrong-answer feedback, remove animal-answer spoilers, and improve once-only round progression. Peek-a-boo is restored behind existing age/parent gates. Art drawing and advanced modes require explicit evidence; inventory does not claim blanket completion.

Essential instructions are protected from ordinary feedback and replay-button mashing. Corner ribbon notices batch, have bounded dwell, do not speak or steal focus, and share a 30-second cooldown across navigation. Independent subagent review found additional repeat-input holes in Body Parts, Peek-a-boo and Tap-a-Tune; repairs are in progress in the isolated resilience checkout. Root removed unowned delayed essential prompts and prevents speech from restarting after pagehide.

## Evidence so far — not final release verification
Full combined test run before follow-up resilience repairs: 191 passed, zero failed/skipped. Home geometry, real selected animal asset loading, reduced motion, instruction audio ownership and repeated answers have focused browser coverage. Local screenshots are in ignored `docs/verify/shots/`. Full final checks and independent Claude review are pending; update below before stopping.

## Local preview and remaining work
Server session 61838 runs `scripts/serve.mjs` on loopback port 8795 from this worktree. `http://localhost:8795/preview.html` creates one synthetic Explorer/bunny only if local storage has no profiles; otherwise existing profiles are preserved. Preview data is local only; this helper is excluded from the publish allow-list. App version is 1.1.0; cache vb-v147. Current promote scripts remain unchanged.

Finish: integrate remaining resilience commit, run full test suite and verify-drive, inspect art and phone screenshots, review fixed commit with Claude, verify staged assets and unchanged promotion gate, open preview and report exact limits. User reviews local first pass; actual device feel, hearing all voice clips, external Watch/Yoto playback and production cutover are not established by desktop tests.
