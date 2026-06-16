// Zoom defense — toddlers triggering pinch/wheel-zoom shouldn't break the
// layout. Viewport meta user-scalable=no is ignored on modern iOS, and a
// Chrome PWA on desktop still honors Ctrl+wheel and Ctrl+=. Trap the routes
// kids can stumble into.
(function _blockZoom() {
  // Use CAPTURE phase + passive:false so no descendant handler can swallow
  // these before we cancel them. window-level listeners weren't enough.
  // iOS Safari pinch
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev =>
    window.addEventListener(ev, e => e.preventDefault(), { capture: true, passive: false }));
  // Ctrl+wheel (Chrome/Edge desktop) AND trackpad pinch on Mac (fires wheel + ctrlKey)
  window.addEventListener('wheel', e => {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.stopPropagation(); }
  }, { capture: true, passive: false });
  // Keyboard: Ctrl/Cmd + =/+/-/_/0
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && ['=', '+', '-', '_', '0'].includes(e.key)) {
      e.preventDefault();
    }
  }, { capture: true });
  // Double-tap zoom on Safari.
  let _lastTap = 0;
  window.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - _lastTap < 350) e.preventDefault();
    _lastTap = now;
  }, { capture: true, passive: false });
  // Multi-touch start → block (catches pinch begin)
  window.addEventListener('touchstart', e => {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { capture: true, passive: false });
  window.addEventListener('touchmove', e => {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { capture: true, passive: false });
})();

// Idle detection — pauses all <video> elements after 3 min of no input, so the
// device's screen-off timer can kick in. On Android, an actively-playing video
// keeps the screen awake; pausing releases that lock.
(function _idleSleep() {
  const IDLE_MS = 3 * 60 * 1000;
  let timer = null;
  let asleep = false;
  function wake() {
    if (asleep) {
      asleep = false;
      document.dispatchEvent(new CustomEvent('vb:active'));
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      asleep = true;
      document.querySelectorAll('video').forEach(v => { try { v.pause(); } catch {} });
      document.dispatchEvent(new CustomEvent('vb:idle'));
    }, IDLE_MS);
  }
  ['pointerdown', 'touchstart', 'keydown', 'mousemove'].forEach(ev =>
    document.addEventListener(ev, wake, { passive: true, capture: true }));
  // Pause immediately when the tab is hidden (saves battery if app is backgrounded)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      document.querySelectorAll('video').forEach(v => { try { v.pause(); } catch {} });
    } else {
      wake();
    }
  });
  wake();
})();

// Block pinch-zoom and double-tap-zoom (iOS Safari ignores meta viewport user-scalable=no).
// Parent settings opts out by setting body.dataset.allowZoom = '1'.
(function _lockGestures() {
  const allowZoom = () => document.body && document.body.dataset && document.body.dataset.allowZoom === '1';
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => {
    document.addEventListener(ev, e => { if (!allowZoom()) e.preventDefault(); }, { passive: false });
  });
  let _lastTouchEnd = 0;
  document.addEventListener('touchend', e => {
    if (allowZoom()) return;
    const now = Date.now();
    if (now - _lastTouchEnd <= 350) e.preventDefault();
    _lastTouchEnd = now;
  }, { passive: false });
})();

// Navigation
function goTo(path) { window.location.href = path; }
function goHome()    { goTo(rootPath() + 'home.html'); }
function goProfiles(){ goTo(rootPath() + 'index.html'); }

function rootPath() {
  const p = window.location.pathname;
  return (p.includes('/games/') || p.includes('/learning/') ||
          p.includes('/art/')   || p.includes('/parent/')  ||
          p.includes('/videos/') || p.includes('/listen/'))
    ? '../' : './';
}

// Audio context (lazy init — must be after user gesture on iOS)
let _ctx = null;
function audioCtx() {
  if (!_ctx) {
    try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  return _ctx;
}

function playTone(freq, duration = 0.2, vol = 0.25, type = 'sine') {
  try {
    const ctx = audioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + duration);
  } catch(e) {}
}

function playPop() {
  try {
    const ctx = audioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(700, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.15);
  } catch(e) {}
}

// On-screen caption of what the app says/does — so prompts and "Yes!/Try again"
// are readable with the VOLUME OFF. Non-blocking (pointer-events:none), one
// shared pill, latest message wins, auto-fades. speak() shows the exact phrase;
// playSuccess()/playBoop() add a generic cue for activities (or tiers) that give
// audio feedback without speaking (e.g. Body Parts wrong tap at tier 4+).
let _vbCapEl, _vbCapTimer;
function _showCaption(text) {
  if (!text) return;
  try {
    if (!_vbCapEl) {
      const st = document.createElement('style');
      st.textContent = '.vb-caption{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translate(-50%,8px);max-width:80vw;padding:6px 14px;border-radius:999px;background:rgba(20,20,40,.62);color:#fff;font:600 clamp(12px,2.4vw,17px)/1.2 system-ui,-apple-system,sans-serif;text-align:center;box-shadow:0 3px 12px rgba(0,0,0,.2);z-index:99999;pointer-events:none;opacity:0;transition:opacity .18s ease,transform .18s ease}.vb-caption.show{opacity:.92;transform:translate(-50%,0)}';
      document.head.appendChild(st);
      _vbCapEl = document.createElement('div');
      _vbCapEl.className = 'vb-caption';
      _vbCapEl.setAttribute('aria-hidden', 'true');
      (document.body || document.documentElement).appendChild(_vbCapEl);
    }
    _vbCapEl.textContent = String(text);
    _vbCapEl.classList.add('show');
    clearTimeout(_vbCapTimer);
    _vbCapTimer = setTimeout(() => { if (_vbCapEl) _vbCapEl.classList.remove('show'); }, 1800);
  } catch (e) {}
}

function playSuccess() {
  _showCaption('Yes! 🎉');
  [523, 659, 784, 1047].forEach((f, i) => {
    setTimeout(() => playTone(f, 0.3, 0.2), i * 120);
  });
}

function playChime() { playTone(880, 0.4, 0.2); }
function playBoop()  { _showCaption('Try again 👆'); playTone(330, 0.1, 0.2, 'square'); }

// When a phrase has no recorded clip we fall back to the browser's speech
// synthesis. Prefer a female English voice so the fallback matches the app's
// adult-female default instead of whatever (often male/robotic) voice the
// device would pick by default.
let _ttsVoice = null, _ttsVoicePicked = false;
function _pickFemaleVoice() {
  if (_ttsVoicePicked) return _ttsVoice;
  if (!window.speechSynthesis) return null;
  const vs = window.speechSynthesis.getVoices() || [];
  if (!vs.length) return null; // voices load async — retry on the next call
  _ttsVoicePicked = true;
  const en = vs.filter(v => /^en[-_]?/i.test(v.lang));
  const pool = en.length ? en : vs;
  const female = /(female|woman|samantha|karen|moira|tessa|victoria|susan|fiona|serena|allison|\bava\b|joanna|salli|kendra|zira|hazel|google uk english female)/i;
  _ttsVoice = pool.find(v => female.test(v.name)) || null;
  return _ttsVoice;
}
if (typeof window !== 'undefined' && window.speechSynthesis) {
  try { window.speechSynthesis.getVoices(); } catch (e) {}
  window.speechSynthesis.onvoiceschanged = () => { _ttsVoicePicked = false; _pickFemaleVoice(); };
}

function _browserSpeak(text, rate = 0.85, pitch = 1.2) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const fv = _pickFemaleVoice();
  if (fv) u.voice = fv;
  u.rate = rate; u.pitch = pitch;
  window.speechSynthesis.speak(u);
}

// Decompose count-along style "5 ducks" or "Yes! 5 ducks!" into clip list.
function _matchClips(text) {
  if (typeof VOICE_MANIFEST === 'undefined') return null;
  const phrases = VOICE_MANIFEST.phraseHash;

  // Exact match first
  if (phrases[text] !== undefined) return [text];

  // Pattern: "N noun" or "N noun!" (count-along)
  const m1 = text.match(/^(\d+)\s+([a-z\s]+?)[!.]?$/i);
  if (m1) {
    const num = m1[1], noun = m1[2].trim().toLowerCase();
    if (phrases[num] && phrases[noun]) return [num, noun];
  }

  // Pattern: "Yes! N noun!" (count-along success)
  const m2 = text.match(/^Yes!\s+(\d+)\s+([a-z\s]+?)!$/i);
  if (m2) {
    const num = m2[1], noun = m2[2].trim().toLowerCase();
    if (phrases['Yes!'] && phrases[num] && phrases[noun]) return ['Yes!', num, noun];
  }

  // Pattern: "How many ducks?"
  const m3 = text.match(/^How many\s+([a-z\s]+?)\??$/i);
  if (m3) {
    const noun = m3[1].trim().toLowerCase();
    if (phrases['How many'] && phrases[noun]) return ['How many', noun];
  }

  return null;
}

// Single reusable Audio element. Previously each speak() created a new
// Audio() — on rapid taps (count-along game, math drill, etc.) the elements
// stacked up faster than cancel could pause them, producing lag + duplicate
// playback. One element + immediate src reassignment is what mobile browsers
// actually optimize for.
let _audio = null;
let _speakGen = 0; // bumps every cancel; in-flight chains check before each clip

function _ensureAudio() {
  if (!_audio) {
    _audio = new Audio();
    _audio.preload = 'auto';
  }
  return _audio;
}

function _playClip(voice, hash, gen) {
  return new Promise(resolve => {
    if (gen !== _speakGen) return resolve();
    const a = _ensureAudio();
    // Hard stop any in-flight playback before assigning the new src — without
    // pause-first the previous clip can briefly bleed into the new one on
    // mobile Chrome.
    try { a.pause(); } catch {}
    a.onended = a.onerror = null;  // clear stale handlers
    a.src = `${rootPath()}audio/${voice}/${hash}.mp3`;
    a.onended = () => { if (gen === _speakGen) resolve(); };
    a.onerror = () => resolve();
    // play() returns a promise that may reject if cancelSpeak fires mid-load.
    a.play().catch(() => resolve());
  });
}

function cancelSpeak() {
  _speakGen++;
  if (_audio) {
    try { _audio.pause(); _audio.removeAttribute('src'); _audio.load(); } catch {}
  }
  if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch {} }
}

function _voiceSpeak(text, voice) {
  const clips = _matchClips(text);
  if (!clips) return _browserSpeak(text);
  const hashes = clips.map(c => VOICE_MANIFEST.phraseHash[c]);
  const gen = _speakGen;
  // Fire-and-forget IIFE — no shared queue, so a new speak() never waits for
  // the previous to clean up. The gen check inside _playClip aborts stale chains.
  (async () => {
    for (const h of hashes) {
      if (gen !== _speakGen) return;
      await _playClip(voice, h, gen);
    }
  })();
}

function _getActiveVoice() {
  const p = (typeof getActiveProfile === 'function') ? getActiveProfile() : null;
  return (p && p.voice) || 'woman'; // default to adult female (Rachel) when none selected, not robotic browser TTS
}

function speak(text, rate = 0.85, pitch = 1.2) {
  // Always cancel any in-flight speech before queuing the next phrase. Without
  // this, a kid spam-tapping in a game stacks up clips that play long after
  // they're done. The internal clip-sequencing for multi-clip phrases (e.g.
  // "3 ducks" = ["3","ducks"]) is unaffected because that's a single speak()
  // call that builds one chain.
  cancelSpeak();
  _showCaption(text);
  // Big kids (Grade 3+, age tier ≥9) read: captions + SFX only, no spoken
  // prompts — a 9-year-old finds the narration babyish. Age-based on purpose
  // (not per-activity override) so one kid gets one consistent experience.
  try {
    const p = (typeof getActiveProfile === 'function') ? getActiveProfile() : null;
    if (p && typeof tierForAge === 'function' && tierForAge(getAgeMonths(p.birthday)) >= 9) return;
  } catch (e) {}
  const v = _getActiveVoice();
  if (v === 'browser') return _browserSpeak(text, rate, pitch);
  return _voiceSpeak(text, v);
}

// Render the nav chrome: a Back + Home pair, top-left. Both are big rounded
// tactile targets with an icon + tiny label (see parent/_chrome-mockup.html).
// Home only appears here, so it's never shown on home.html (which doesn't call
// renderBackBtn). Back keeps its existing behavior: dest ? goTo(dest) : back.
function renderBackBtn(dest) {
  const wrap = document.createElement('div');
  wrap.className = 'nav-chrome';

  const BACK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 19l-7-7 7-7"/></svg>';
  const HOME_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3.2 2.6 11.3a1 1 0 0 0 .66 1.75H4.2V20a1 1 0 0 0 1 1h3.6v-5.2a1 1 0 0 1 1-1h2.4a1 1 0 0 1 1 1V21h3.6a1 1 0 0 0 1-1v-6.95h.94a1 1 0 0 0 .66-1.75z"/></svg>';

  const back = document.createElement('button');
  back.className = 'back-btn nav-btn';
  back.innerHTML = BACK_SVG;
  back.setAttribute('aria-label', 'Go back');
  back.addEventListener('click', () => dest ? goTo(dest) : history.back());

  const home = document.createElement('button');
  home.className = 'home-btn nav-btn';
  home.innerHTML = HOME_SVG;
  home.setAttribute('aria-label', 'Go home');
  home.addEventListener('click', () => goHome());

  wrap.appendChild(back);
  wrap.appendChild(home);
  document.body.appendChild(wrap);
  // Lets CSS reserve top space so a page title clears the Back/Home chrome.
  document.body.classList.add('vb-chrome');
}

// ── Hold-to-activate ────────────────────────────────────────────────────────
// Guards parent-only doors (Parent Settings, in-game settings gear) so a
// toddler can't tap straight in. Fires onActivate only after a deliberate
// ~0.7s press; releasing early cancels. A fill ring animates during the hold so
// a parent sees it working. (Game Back/Home stay instant — only settings hold.)
let _holdStyleInjected = false;
function _injectHoldStyle() {
  if (_holdStyleInjected) return;
  _holdStyleInjected = true;
  const s = document.createElement('style');
  s.textContent =
    '@keyframes vbHoldFill{from{box-shadow:0 0 0 0 rgba(78,205,196,0);}' +
    'to{box-shadow:0 0 0 6px rgba(78,205,196,0.85);}}' +
    '.vb-holding{animation:vbHoldFill var(--vb-hold,700ms) linear forwards;}';
  document.head.appendChild(s);
}
function holdToActivate(el, onActivate, opts) {
  const ms = (opts && opts.ms) || 700;
  _injectHoldStyle();
  el.style.setProperty('--vb-hold', ms + 'ms');
  // iOS long-press otherwise pops the native Share/Copy/Download callout instead
  // of registering the hold — suppress it so the press just opens settings.
  el.style.webkitTouchCallout = 'none';
  el.style.userSelect = 'none';
  el.style.webkitUserSelect = 'none';
  el.style.touchAction = 'manipulation';
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  let timer = null, active = false;
  const start = (e) => {
    if (active) return;
    active = true;
    if (e && e.cancelable) e.preventDefault();
    el.classList.add('vb-holding');
    timer = setTimeout(() => { stop(); onActivate(); }, ms);
  };
  const stop = () => {
    active = false;
    if (timer) { clearTimeout(timer); timer = null; }
    el.classList.remove('vb-holding');
  };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointerleave', stop);
  el.addEventListener('pointercancel', stop);
  return stop;
}

// ── Tactile + haptic feedback (shared, reduced-motion safe) ─────────────────
// haptic(ms): short vibration on supported devices. navigator.vibrate is a
// no-op/undefined on iOS Safari and desktop, so feature-check + try/catch.
// Haptics are intentional, not motion, so they fire regardless of
// prefers-reduced-motion (only the visual press-scale is gated).
function haptic(ms = 12) {
  try {
    if (navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  } catch (e) {}
}

(function _tactileLayer() {
  const reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Selector for the interactive elements that should feel tappable.
  const SEL = 'button, .back-btn, .home-btn, .nav-btn, .activity-card, ' +
              '.section-btn, .tile, [role="button"]';
  document.addEventListener('pointerdown', (e) => {
    const el = e.target && e.target.closest && e.target.closest(SEL);
    if (!el) return;
    // Visual press-scale — suppressed under reduced-motion.
    if (!reduce) {
      el.classList.add('vb-press');
      const clear = () => el.classList.remove('vb-press');
      el.addEventListener('pointerup', clear, { once: true });
      el.addEventListener('pointercancel', clear, { once: true });
      el.addEventListener('pointerleave', clear, { once: true });
    }
    // Quick haptic tick on every tap (gentle).
    haptic(12);
  }, { capture: true, passive: true });
})();

// Splash a color burst at a point (x, y) on a canvas ctx
function colorBurst(ctx, x, y, color, radius = 60) {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'transparent');
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
}
