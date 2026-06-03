// Mascot widget — base idle loop + random action interrupts.
//
// Flow:
//   - On show: play base idle on loop (subtle breathing/sitting)
//   - Every 5-15s random: interrupt with a random action gesture, then return to base
//   - speak: play speaking clip, then return to base
//   - Tap mascot: nothing (disabled per user request)

const MASCOT_AVAILABLE = ['dog', 'tiger', 'giraffe', 'panda', 'orca', 'eagle'];
const MASCOT_LABELS = {
  dog: '🐶 Dog', tiger: '🐯 Tiger', giraffe: '🦒 Giraffe',
  panda: '🐼 Panda', orca: '🐳 Orca', eagle: '🦅 Eagle',
};

const UNIVERSAL_IDLES = ['idle_wave', 'idle_bubbles', 'idle_book', 'idle_popcorn'];
const SPECIES_IDLES = {
  dog:     ['idle_tail', 'idle_scratch', 'idle_sniff', 'idle_pant'],
  tiger:   ['idle_yawn', 'idle_stretch', 'idle_lick', 'idle_prowl'],
  giraffe: ['idle_bend', 'idle_leaves', 'idle_eyelash', 'idle_sway'],
  panda:   ['idle_bamboo', 'idle_roll', 'idle_hug', 'idle_somer'],
  orca:    ['idle_flip', 'idle_breach', 'idle_splash', 'idle_swim'],
  eagle:   ['idle_flap', 'idle_preen', 'idle_alert', 'idle_call'],
};
// Animal sound file per mascot — played as overlay when kid taps the mascot
const MASCOT_SOUND_FILE = {
  dog: 'dog.mp3', tiger: 'tiger.mp3', giraffe: 'giraffe.mp3',
  panda: 'panda.mp3', orca: 'whale.mp3', eagle: 'eagle.mp3',
};
function _actionKeys(mascotId) {
  return [...UNIVERSAL_IDLES, ...(SPECIES_IDLES[mascotId] || [])];
}

// Mascots whose assets are shot on a green screen: their videos live under
// mascots/<id>/green/ and are keyed (green removed) per-frame onto a canvas so
// the character floats with a genuinely transparent background — no circle mask.
const CHROMA_MASCOTS = new Set(['dog']);
function _isChroma(mascotId) { return CHROMA_MASCOTS.has(mascotId); }
// Green-screen keyer (tuned in mascot-green-video.html): remove green, despill.
const _CK_THR = 40, _CK_SMOOTH = 40;
function _chromaKey(ctx, w, h) {
  const id = ctx.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], m = Math.max(r, b), gn = g - m;
    if (gn > _CK_THR) { d[i + 3] = 0; }
    else if (gn > _CK_THR - _CK_SMOOTH) {
      const t = (gn - (_CK_THR - _CK_SMOOTH)) / _CK_SMOOTH;
      d[i + 3] = Math.round(d[i + 3] * (1 - t));
      if (d[i + 3] > 0) d[i + 1] = m;
    } else if (gn > 0) { d[i + 1] = m; }
  }
  ctx.putImageData(id, 0, 0);
}

let _mascotEl = null;
let _actionTimer = null;
let _lastAction = null;
let _state = 'hidden';
let _frontIdx = 0;
let _lastSfxAt = 0;
const SFX_COOLDOWN_MS = 15000;

function _activeProfile() {
  return (typeof getActiveProfile === 'function') ? getActiveProfile() : null;
}

// Default companion when a profile hasn't been assigned a mascot yet (mascot: null).
// Parents can override per-kid in Parent Settings → Mascot Buddy.
const DEFAULT_MASCOT_ID = 'dog';

function _mascotIdFor(profile) {
  return (profile && profile.mascot && profile.mascot.id) || DEFAULT_MASCOT_ID;
}

function _mascotVoiceFor(profile) {
  const v = (profile && profile.mascot && profile.mascot.voice)
         || (profile && profile.voice)
         || 'girl';
  // woman/man talking clips only exist for fully-built (green/chroma) mascots.
  // For any other mascot, fall back to girl so the picker can safely offer all
  // four voices without a missing-clip break.
  if ((v === 'woman' || v === 'man') && !_isChroma(_mascotIdFor(profile))) return 'girl';
  return v;
}

function _ensureEl() {
  if (_mascotEl) return _mascotEl;
  const wrap = document.createElement('div');
  wrap.id = 'mascotWrap';
  // No dark bubble / no white border / no hard shadow — mascot appears to
  // "just be there". The cream baked-in video background is feathered out
  // with an ELLIPTICAL mask so it hugs the character silhouette (tall +
  // narrow, biased upward toward the head/body) instead of reading as a flat
  // cream disc. A tighter inner stop + softer feather + a contact shadow
  // makes it float rather than sit in a circle.
  wrap.style.cssText = `
    position: fixed; bottom: 16px; left: 16px;
    width: 180px; height: 180px;
    display: none;
    z-index: 9999;
    overflow: visible;
    pointer-events: auto;
    touch-action: none;
    -webkit-mask: radial-gradient(ellipse 46% 60% at 50% 42%, black 52%, transparent 86%);
            mask: radial-gradient(ellipse 46% 60% at 50% 42%, black 52%, transparent 86%);
    transition: transform 0.3s, opacity 0.3s;
    animation: mascotBob 4s ease-in-out infinite;
    filter: drop-shadow(0 6px 10px rgba(0,0,0,0.22)) drop-shadow(0 2px 3px rgba(0,0,0,0.12));
  `;
  if (!document.getElementById('mascotBobKf')) {
    const style = document.createElement('style');
    style.id = 'mascotBobKf';
    style.textContent = `
      @keyframes mascotBob {
        0%, 100% { transform: translateY(0) scale(1); }
        50% { transform: translateY(-6px) scale(1.02); }
      }
      /* Smaller mascot on phone-sized viewports so it doesn't eat half the
         screen. The bottom-LEFT default position only applies while the kid
         hasn't dragged it — once pinned ([data-pinned]) the inline left/top win
         so a hand-placed mascot doesn't snap back to the corner on resize. */
      @media (max-width: 600px) {
        #mascotWrap { width: 120px !important; height: 120px !important; }
        #mascotWrap:not([data-pinned]) {
          bottom: 12px !important; left: 12px !important; }
      }
      /* Phone landscape — even smaller, content is squeezed vertically */
      @media (max-height: 500px) and (orientation: landscape) {
        #mascotWrap { width: 110px !important; height: 110px !important; }
        #mascotWrap:not([data-pinned]) {
          bottom: 8px !important; left: 8px !important; }
      }
    `;
    document.head.appendChild(style);
  }
  // Two stacked <video>s for crossfade — eliminates flash on src change.
  // For chroma-key mascots these are hidden (kept offscreen as the frame source)
  // and two matching <canvas>es render the green-removed frames instead.
  for (let i = 0; i < 2; i++) {
    const vid = document.createElement('video');
    vid.className = 'mascot-vid';
    vid.dataset.idx = i;
    vid.muted = true; vid.playsInline = true; vid.autoplay = false;
    vid.preload = 'auto';
    vid.style.cssText = `
      position: absolute; inset: 0;
      width: 100%; height: 100%; object-fit: cover;
      opacity: ${i === 0 ? 1 : 0};
      transition: opacity 0.4s ease;
      background: transparent;
    `;
    wrap.appendChild(vid);
  }
  for (let i = 0; i < 2; i++) {
    const cv = document.createElement('canvas');
    cv.className = 'mascot-canvas';
    cv.dataset.idx = i;
    cv.width = 260; cv.height = 260; // square render buffer; CSS contains it
    cv.style.cssText = `
      position: absolute; inset: 0;
      width: 100%; height: 100%; object-fit: contain;
      opacity: ${i === 0 ? 1 : 0};
      transition: opacity 0.4s ease;
      display: none;
      background: transparent;
    `;
    wrap.appendChild(cv);
  }
  // Tap vs. drag: pointerdown starts tracking movement. A release with little
  // movement is a TAP (sound + action via _onMascotTap); crossing the drag
  // threshold turns it into a reposition (no tap fires). See _attachDrag.
  // pointerdown beats click on toddler taps (no 300ms delay, no shrink-target miss).
  _attachDrag(wrap);
  document.body.appendChild(wrap);
  _mascotEl = wrap;
  _frontIdx = 0;
  _restorePosition(wrap);
  return wrap;
}

function _onMascotTap() {
  // Only accept taps while the mascot is idle (base loop). Mid-action and
  // mid-speech taps are ignored so animations always play to completion.
  if (_state !== 'base') return;
  const p = _activeProfile();
  if (!p) return;
  const mascotId = _mascotIdFor(p);
  // Play the species signature sound — but only if we haven't played it
  // recently. Toddlers tap-tap-tap, and a bark every half second is noise.
  const now = Date.now();
  if (now - _lastSfxAt >= SFX_COOLDOWN_MS) {
    const sfxFile = MASCOT_SOUND_FILE[mascotId];
    if (sfxFile) {
      try {
        const a = new Audio(`${rootPath()}audio/sounds/${sfxFile}`);
        a.volume = 0.7;
        a.play().catch(() => {});
        _lastSfxAt = now;
      } catch {}
    }
  }
  // Cycle to a new random action (different from the last one) — every tap.
  clearTimeout(_actionTimer);
  _state = 'base'; // pretend base so _playAction will run
  _playAction();
}

// ---------------------------------------------------------------------------
// Drag to reposition (mouse + touch via pointer events) + collision-aware drop.
//
// The widget normally sits bottom-left via `bottom`/`left` and floats with a
// transform-based `mascotBob` keyframe. Dragging needs absolute left/top and a
// stable transform, so the first drag "pins" the element: we read its current
// rect, switch to left/top positioning, and drop the bob animation. A tap that
// never crosses the threshold leaves all of that untouched.
// ---------------------------------------------------------------------------
const _DRAG_THRESHOLD = 8;        // px of movement before a press becomes a drag
const _POS_KEY = 'vb_mascot_pos'; // persisted {x,y} (top-left, px) across reloads
let _drag = null;                 // active drag state, or null

function _pinToLeftTop(wrap) {
  // Convert whatever the current layout is (bottom/left + bob transform) into
  // explicit left/top so dragging is absolute and predictable. Idempotent.
  if (wrap.dataset.pinned === '1') return;
  const r = wrap.getBoundingClientRect();
  wrap.style.animation = 'none';     // stop bob (transform) so left/top wins
  wrap.style.transform = 'none';
  wrap.style.bottom = 'auto';
  wrap.style.right = 'auto';
  wrap.style.left = `${r.left}px`;
  wrap.style.top = `${r.top}px`;
  wrap.dataset.pinned = '1';
}

function _clampToViewport(x, y, w, h) {
  const m = 4; // keep a hair off the very edge
  const maxX = Math.max(m, window.innerWidth - w - m);
  const maxY = Math.max(m, window.innerHeight - h - m);
  return { x: Math.min(Math.max(m, x), maxX), y: Math.min(Math.max(m, y), maxY) };
}

function _attachDrag(wrap) {
  wrap.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return; // left / touch / pen only
    const r = wrap.getBoundingClientRect();
    _drag = {
      id: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      offX: e.clientX - r.left, offY: e.clientY - r.top, // grab point inside el
      w: r.width, h: r.height,
      moved: false,
    };
    try { wrap.setPointerCapture(e.pointerId); } catch {}
  });

  wrap.addEventListener('pointermove', (e) => {
    if (!_drag || e.pointerId !== _drag.id) return;
    const dx = e.clientX - _drag.startX;
    const dy = e.clientY - _drag.startY;
    if (!_drag.moved && Math.hypot(dx, dy) < _DRAG_THRESHOLD) return;
    if (!_drag.moved) {
      _drag.moved = true;
      _pinToLeftTop(wrap);
      wrap.style.transition = 'none';          // 1:1 with the finger while dragging
      wrap.style.cursor = 'grabbing';
    }
    const p = _clampToViewport(e.clientX - _drag.offX, e.clientY - _drag.offY, _drag.w, _drag.h);
    wrap.style.left = `${p.x}px`;
    wrap.style.top = `${p.y}px`;
    e.preventDefault();
  });

  const end = (e) => {
    if (!_drag || e.pointerId !== _drag.id) return;
    const wasDrag = _drag.moved;
    try { wrap.releasePointerCapture(e.pointerId); } catch {}
    _drag = null;
    wrap.style.cursor = '';
    if (!wasDrag) { _onMascotTap(); return; }   // a tap, not a drag
    _settleDrop(wrap);                          // nudge off any tile, then persist
  };
  wrap.addEventListener('pointerup', end);
  wrap.addEventListener('pointercancel', end);
}

// Collision-aware drop: if the dropped box overlaps any interactive element,
// search outward on an expanding ring for the nearest spot that overlaps
// nothing (and stays on-screen), then glide there.
function _interactiveRects(wrap) {
  const sel = '.back-btn, .section-btn, .avatar-pill, button, a, [role="button"], [onclick]';
  const out = [];
  document.querySelectorAll(sel).forEach((el) => {
    if (el === wrap || wrap.contains(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    out.push(r);
  });
  return out;
}

function _overlapsAny(x, y, w, h, rects) {
  for (const r of rects) {
    if (x < r.right && x + w > r.left && y < r.bottom && y + h > r.top) return true;
  }
  return false;
}

function _settleDrop(wrap) {
  const r = wrap.getBoundingClientRect();
  const w = r.width, h = r.height;
  const rects = _interactiveRects(wrap);
  let best = { x: r.left, y: r.top };

  if (_overlapsAny(r.left, r.top, w, h, rects)) {
    // Spiral outward in rings until we find a clear, on-screen position.
    const step = 24;
    const maxRing = Math.ceil(Math.max(window.innerWidth, window.innerHeight) / step);
    let found = null;
    for (let ring = 1; ring <= maxRing && !found; ring++) {
      const d = ring * step;
      // 8 directions per ring (N, NE, E, … NW), nearest-first by construction.
      const cands = [
        [0, -d], [d, -d], [d, 0], [d, d], [0, d], [-d, d], [-d, 0], [-d, -d],
      ];
      for (const [ox, oy] of cands) {
        const p = _clampToViewport(r.left + ox, r.top + oy, w, h);
        if (!_overlapsAny(p.x, p.y, w, h, rects)) { found = p; break; }
      }
    }
    if (found) best = found;
  }

  // Glide gently to the resolved spot (matches the app's smooth transitions).
  wrap.style.transition = 'left 0.3s ease, top 0.3s ease';
  wrap.style.left = `${best.x}px`;
  wrap.style.top = `${best.y}px`;
  _savePosition(best.x, best.y);
}

// On a NEW screen the layout changes (e.g. a back button appears top-left), so a
// mascot parked there can end up covering a control. After the mascot shows, if
// its current spot overlaps any interactive element, nudge it off — but leave it
// alone when it's not covering anything (don't needlessly move a fine mascot).
function _settleIfCovering() {
  const wrap = _mascotEl;
  if (!wrap || _drag || wrap.style.display === 'none') return;
  const r = wrap.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return;
  if (!_overlapsAny(r.left, r.top, r.width, r.height, _interactiveRects(wrap))) return;
  _settleDrop(wrap); // covering a control → glide to the nearest open spot + persist
}

// Run the check shortly after a show — twice, since page controls (back button,
// tiles) and fonts can finish laying out a beat after the mascot appears.
function _scheduleSettle() {
  setTimeout(_settleIfCovering, 150);
  setTimeout(_settleIfCovering, 600);
}

function _savePosition(x, y) {
  try { localStorage.setItem(_POS_KEY, JSON.stringify({ x, y })); } catch {}
}

function _restorePosition(wrap) {
  let pos = null;
  try { pos = JSON.parse(localStorage.getItem(_POS_KEY) || 'null'); } catch {}
  if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return;
  // Element is display:none here, so size from the media query can't be read
  // reliably — clamp against the documented sizes (180 / 120 / 110).
  const w = window.matchMedia('(max-width: 600px)').matches ? 120 : 180;
  const p = _clampToViewport(pos.x, pos.y, w, w);
  _pinToLeftTop(wrap);                 // safe: reads bottom/left default first
  wrap.style.left = `${p.x}px`;
  wrap.style.top = `${p.y}px`;
}

// Keep the mascot on-screen after a viewport resize / orientation change.
window.addEventListener('resize', () => {
  if (!_mascotEl || _mascotEl.dataset.pinned !== '1' || _drag) return;
  const r = _mascotEl.getBoundingClientRect();
  const p = _clampToViewport(r.left, r.top, r.width, r.height);
  _mascotEl.style.transition = 'left 0.3s ease, top 0.3s ease';
  _mascotEl.style.left = `${p.x}px`;
  _mascotEl.style.top = `${p.y}px`;
  _savePosition(p.x, p.y);
});

function _videos() {
  return _mascotEl ? _mascotEl.querySelectorAll('video.mascot-vid') : [];
}
function _canvases() {
  return _mascotEl ? _mascotEl.querySelectorAll('canvas.mascot-canvas') : [];
}
function _front() { const v = _videos(); return v ? v[_frontIdx] : null; }
function _back()  { const v = _videos(); return v ? v[1 - _frontIdx] : null; }

// ---------------------------------------------------------------------------
// Chroma-key render path.
//
// When the active mascot is green-screen (CHROMA_MASCOTS), the wrap is switched
// into "chroma mode": the radial circle mask is dropped (background is truly
// transparent now), the <video>s are hidden but keep playing as the frame
// source, and a single RAF loop draws each video into its paired <canvas> with
// the green removed. Crossfade then animates canvas opacity instead of video
// opacity, so idle/action/speaking swaps still feel soft.
// ---------------------------------------------------------------------------
let _chromaActive = false;   // is the wrap currently in chroma mode?
let _chromaRaf = null;       // running render-loop handle

function _setChromaMode(on) {
  const wrap = _mascotEl;
  if (!wrap) return;
  // Re-arm the render loop if it was stopped (e.g. after hide()) even when the
  // mode flag is unchanged.
  if (_chromaActive === on) {
    if (on && !_chromaRaf) _chromaRaf = requestAnimationFrame(_chromaFrame);
    return;
  }
  _chromaActive = on;
  const vids = _videos(), cvs = _canvases();
  if (on) {
    // Drop the circular silhouette mask — the keyer gives real transparency.
    wrap.style.webkitMask = 'none';
    wrap.style.mask = 'none';
    vids.forEach(v => { v.style.opacity = '0'; v.style.visibility = 'hidden'; });
    cvs.forEach((c, i) => { c.style.display = 'block'; c.style.opacity = i === _frontIdx ? '1' : '0'; });
    if (!_chromaRaf) _chromaRaf = requestAnimationFrame(_chromaFrame);
  } else {
    if (_chromaRaf) { cancelAnimationFrame(_chromaRaf); _chromaRaf = null; }
    cvs.forEach((c, i) => { c.style.display = 'none'; c.style.opacity = i === _frontIdx ? '1' : '0'; });
    vids.forEach((v, i) => { v.style.visibility = ''; v.style.opacity = i === _frontIdx ? '1' : '0'; });
    // Restore the original elliptical mask used by cream mascots.
    wrap.style.webkitMask = 'radial-gradient(ellipse 46% 60% at 50% 42%, black 52%, transparent 86%)';
    wrap.style.mask = 'radial-gradient(ellipse 46% 60% at 50% 42%, black 52%, transparent 86%)';
  }
}

function _chromaFrame() {
  _chromaRaf = _chromaActive ? requestAnimationFrame(_chromaFrame) : null;
  if (!_chromaActive) return;
  const vids = _videos(), cvs = _canvases();
  for (let i = 0; i < cvs.length; i++) {
    const v = vids[i], c = cvs[i];
    if (!v || !c) continue;
    // Only the visible (front) canvas + a fading-in back canvas need updating,
    // but keying both is cheap at this size and keeps the crossfade in-motion.
    if (c.style.opacity === '0' && v !== _back()) continue;
    if (v.readyState < 2 || v.videoWidth === 0) continue;
    const ctx = c._ctx || (c._ctx = c.getContext('2d', { willReadFrequently: true }));
    const w = c.width, h = c.height;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(v, 0, 0, w, h);
    _chromaKey(ctx, w, h);
  }
}

// Load src into the BACK video, start it playing UNDER the front, then
// crossfade. Two anti-flicker tricks:
//   1) Wait until the back is actually playing (first frames decoded) before
//      starting the opacity swap — so what fades in is in-motion, not a
//      static first frame.
//   2) Don't clear the front's src after fade-out; just pause it. Tearing
//      down the <video> source caused a brief black frame during reassignment
//      on the next swap. The src naturally gets replaced when this element
//      becomes "back" again next round.
function _crossfadeTo(src, opts) {
  const wrap = _ensureEl();
  const back = _back();
  const front = _front();
  if (!back || !front) return;
  back.muted = !!opts.muted;
  back.loop = !!opts.loop;
  back.onended = null;

  const startCrossfade = () => {
    back.onended = opts.onended || null;
    if (_chromaActive) {
      // Fade the canvases (the visible layer); videos stay hidden but playing.
      const cvs = _canvases();
      const backCv = cvs[1 - _frontIdx], frontCv = cvs[_frontIdx];
      if (backCv) backCv.style.opacity = '1';
      if (frontCv) frontCv.style.opacity = '0';
    } else {
      back.style.opacity = '1';
      front.style.opacity = '0';
    }
    setTimeout(() => {
      try { front.pause(); } catch {}
    }, 450);
    _frontIdx = 1 - _frontIdx;
  };

  const onPlaying = () => {
    back.removeEventListener('playing', onPlaying);
    // One animation frame so a frame has actually painted before fading in.
    requestAnimationFrame(() => requestAnimationFrame(startCrossfade));
  };
  const onReady = () => {
    back.removeEventListener('loadeddata', onReady);
    back.addEventListener('playing', onPlaying, { once: true });
    back.play().catch(() => {
      // Autoplay blocked or play() rejected — fall back to immediate crossfade
      // (otherwise the swap would never happen).
      startCrossfade();
    });
  };
  back.addEventListener('loadeddata', onReady, { once: true });
  back.src = src;
  back.load();
}

function _src(mascotId, voice, key) {
  // Chroma mascots load their green-screen assets from a parallel green/ tree;
  // everything keeps the same idle/<key> + video/<voice>_<key> layout.
  const base = `${rootPath()}mascots/${mascotId}${_isChroma(mascotId) ? '/green' : ''}`;
  if (key === 'BASE') return `${base}/idle/idle_base.mp4`;
  if (key.startsWith('idle_')) return `${base}/idle/${key}.mp4`;
  return `${base}/video/${voice}_${key}.mp4`;
}

function _scheduleNextAction() {
  clearTimeout(_actionTimer);
  // Random 5-15 seconds before next action gesture interrupts the base
  const delay = 5000 + Math.random() * 10000;
  _actionTimer = setTimeout(_playAction, delay);
}

function _playBase() {
  const p = _activeProfile();
  if (!p) return;
  const mascotId = _mascotIdFor(p);
  const wrap = _ensureEl();
  _setChromaMode(_isChroma(mascotId));
  _state = 'base';
  if (wrap.style.display === 'none') {
    wrap.style.display = 'block';
    wrap.style.opacity = '0';
    wrap.style.transform = 'scale(0.5)';
    requestAnimationFrame(() => {
      wrap.style.opacity = '1';
      wrap.style.transform = 'scale(1)';
    });
  }
  _crossfadeTo(_src(mascotId, null, 'BASE'), { muted: true, loop: true, onended: null });
  _scheduleNextAction();
  _scheduleSettle();   // nudge off any control it's covering on this screen
}

function _playAction() {
  const p = _activeProfile();
  if (!p) return;
  if (_state !== 'base') { _scheduleNextAction(); return; }
  const mascotId = _mascotIdFor(p);
  const keys = _actionKeys(mascotId);
  let pool = _lastAction ? keys.filter(k => k !== _lastAction) : keys;
  if (!pool.length) pool = keys;
  const key = pool[Math.floor(Math.random() * pool.length)];
  _lastAction = key;
  _state = 'action';
  _crossfadeTo(_src(mascotId, null, key), { muted: true, loop: false, onended: () => _playBase() });
}

function _shouldSpeak(profileId, key) {
  if (key === 'welcome') return true;
  if (key.endsWith('_intro')) {
    const k = `vb_mascot_${profileId}/${key}`;
    if (sessionStorage.getItem(k)) return false;
    sessionStorage.setItem(k, '1');
  }
  return true;
}

function play(key, opts) {
  const profile = _activeProfile();
  if (!profile) return;
  if (!_shouldSpeak(profile.id, key)) {
    if (_state === 'hidden') _playBase();
    return;
  }
  const mascotId = _mascotIdFor(profile);
  const voice = _mascotVoiceFor(profile);
  const wrap = _ensureEl();
  _setChromaMode(_isChroma(mascotId));
  clearTimeout(_actionTimer);
  _state = 'speaking';
  wrap.style.display = 'block';
  wrap.style.opacity = '0';
  wrap.style.transform = 'scale(0.5)';
  requestAnimationFrame(() => {
    wrap.style.opacity = '1';
    wrap.style.transform = 'scale(1)';
  });
  // Pass {muted:true} to use the mascot animation only — the page is
  // responsible for playing the matching audio (e.g. a per-kid greeting
  // pre-generated in voice-manifest).
  _crossfadeTo(_src(mascotId, voice, key), {
    muted: !!(opts && opts.muted), loop: false, onended: () => _playBase(),
  });
  _scheduleSettle();   // nudge off any control it's covering on this screen
}

function show() {
  // Just show + start base loop, no speech
  _playBase();
}

function hide() {
  if (!_mascotEl) return;
  clearTimeout(_actionTimer);
  if (_chromaRaf) { cancelAnimationFrame(_chromaRaf); _chromaRaf = null; }
  _videos().forEach(v => { try { v.pause(); } catch {} v.removeAttribute('src'); v.load(); });
  _mascotEl.style.opacity = '0';
  _mascotEl.style.transform = 'scale(0.5)';
  setTimeout(() => { if (_mascotEl) _mascotEl.style.display = 'none'; }, 300);
  _state = 'hidden';
}

// Respect global idle/active events from app.js — stop scheduling actions when idle,
// resume base loop when the user comes back.
document.addEventListener('vb:idle', () => {
  clearTimeout(_actionTimer);
  _videos().forEach(v => { try { v.pause(); } catch {} });
  // Paused frames don't change — stop the keyer loop to save battery.
  if (_chromaRaf) { cancelAnimationFrame(_chromaRaf); _chromaRaf = null; }
});
document.addEventListener('vb:active', () => {
  if (_state === 'base' || _state === 'action') {
    _videos().forEach(v => { try { v.play().catch(() => {}); } catch {} });
    if (_chromaActive && !_chromaRaf) _chromaRaf = requestAnimationFrame(_chromaFrame);
    if (_state === 'base') _scheduleNextAction();
  }
});

window.mascot = { play, show, hide, available: MASCOT_AVAILABLE, labels: MASCOT_LABELS };
