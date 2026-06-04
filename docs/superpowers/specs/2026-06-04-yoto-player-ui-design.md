# Yoto Player UI — Design (2026-06-04)

Status: approved by Scott to build autonomously ("implement without me reviewing, I'll test live"). Review gate waived; this spec is the record of decisions.

## Goal

From any hub/menu, a connected child can open their Yoto library, tap a card to
play, and use a now-playing bar with previous/next chapter + play/pause. Built on
the EXISTING Listen page (`listen/index.html`) and mini-player (`js/yoto-player.js`).
No duplicate system.

## What already exists (reuse)

- `listen/index.html` — Spotify-style card grid (covers + titles), tap-to-play,
  chapter picker, now-playing bar with play/pause. Reached from the home hub's
  "Listen" tile, shown only when Yoto is connected.
- `js/yoto-player.js` — persistent corner mini-player on every page (top-right)
  while audio plays; play/pause + stop; rehydrates audio across page nav via
  sessionStorage `vb_yoto_now_playing`.
- `js/yoto.js` — `listContent` / `getCard` / `getStreamUrl`; per-profile tokens
  `vb_yoto_tokens_<activeId>` (v84).

## Decisions

1. **Launcher FAB** — bottom-right round button (🎧, `--c-listen` accent),
   injected by `js/yoto-player.js` (already on all pages). Shown ONLY on hub/menu
   pages: `home.html` + `{games,learning,art,videos}/index.html`. NOT on the Listen
   page itself, NOT on the profiles screen, NOT inside an activity (Scott: "hubs &
   menus only"). Gated on the active profile being connected, read DIRECTLY from
   `localStorage['vb_yoto_tokens_<vb_active_id>']` so hub pages don't need to load
   `yoto.js`. Tap → `rootPath() + 'listen/index.html'`.
2. **Listen now-playing** — add ⏮ previous / ⏯ play-pause / ⏭ next. prev/next =
   previous/next CHAPTER on the card (Scott's choice); disabled at the ends.
   "Switch cards" = tap another tile in the grid above (already works).
3. **Global mini** (all pages, while playing) — keep play/pause + stop; make the
   cover/title tap open the Listen page (full controls / switch). No chapter list
   persisted across pages (YAGNI: avoids loading `yoto.js` into ~25 activity files
   and dodges stream-URL expiry juggling). Skip/switch from anywhere = one tap to
   the full player.
4. **Design** — extend the existing kid system: rounded surfaces, `--c-listen`
   accent, emoji glyphs, big touch targets (≥56px primary), `:active` scale, a
   gentle idle pulse on the launcher, `prefers-reduced-motion` alternatives,
   contrast-checked (white-on-dark mini; dark ink on the orange accent).

## Out of scope (YAGNI)

- Prev/next on the global mini (taps through to Listen instead).
- A separate card "switcher" overlay.
- Persisting the chapter list across page navigations.

## Edge cases

- Not connected (per profile): launcher hidden on hubs; Listen shows its existing
  "connect in Parent Settings" empty state.
- Single-chapter card: prev/next disabled; play/pause only.
- End of card: next disabled on the last chapter; existing auto-advance + clear.
- Autoplay blocked after nav: mini stays paused, kid taps play (existing).

## Testing

`tests/e2e/verify-yoto-player.mjs` (Playwright, own server, stubbed `window.yoto`
+ stubbed audio):
- Hub page with a per-profile token present → launcher FAB visible and links to
  the Listen page; with NO token → hidden.
- Listen page with mocked multi-chapter card → grid renders; play → now-playing
  shows; ⏭/⏮ change the chapter index; prev disabled at idx 0, next at last.

## Files

- `js/yoto-player.js` — launcher FAB + mini cover/title → open Listen.
- `listen/index.html` — prev/next controls + chapter index in publish state.
- `tests/e2e/verify-yoto-player.mjs` — new.
- `sw.js` — cache bump.
