// Stop stale callbacks from starting speech after leaving this page.
var _pageAcceptsSpeech = true;
// The direct-URL age guard can navigate before the rest of this file runs.
// Its audio cleanup must already have initialized state.
let _audio = null;
let _speakGen = 0; // bumps every cancel; in-flight chains check before each clip
let _clipResolve = null;
let _activeSpeechKind = null;
let _lastInstructionText = '';
let _vbReplayEl = null;

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

// Direct-URL tier gate. Menus only ever LINK to what a kid's age is allowed
// to see — nothing stopped a bookmark, a shared link, or typing an address
// from opening an activity straight through, regardless of tier. Every
// activity page loads this file, so one small guard here covers all of them
// without touching 21 separate files.
//
// Reuses isActivityVisible() (js/profiles.js) rather than re-deriving the
// tier math, so this can never drift from what the menus themselves decide —
// including the per-profile activitiesVisible override a parent can already
// set to force-show something past its normal age range.
(function _guardDirectActivityAccess() {
  if (typeof ACTIVITY_FEATURES === 'undefined' || typeof getActiveProfile !== 'function'
      || typeof isActivityVisible !== 'function') return;
  const file = (location.pathname.split('/').pop() || '');
  const activity = ACTIVITY_FEATURES.find(a => a.file === file);
  if (!activity) return;                       // not an activity page — nothing to guard
  const profile = getActiveProfile();
  if (!profile) return;                         // no active kid yet; the page's own flow handles that
  if (!isActivityVisible(profile, activity.id)) goHome();
})();

// Carry the house palette into registered play screens. Custom parent themes
// and activity-specific color lessons retain their own visual treatment.
(function _playWorld() {
  if (typeof ACTIVITY_FEATURES === 'undefined') return;
  const file = location.pathname.split('/').pop();
  const activity = ACTIVITY_FEATURES.find(a => a.file === file);
  if (activity) {
    document.body.dataset.playWorld = activity.section;
    document.body.dataset.playActivity = activity.id;
  }
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
// Parent settings opts out via a checkbox (parent/settings.html's Theme
// panel, Codex 0825-15) that sets localStorage vb_allow_zoom; read here on
// every page load so the opt-out applies wherever the child actually is,
// not just while parent/settings.html happens to be open.
(function _lockGestures() {
  try { if (localStorage.getItem('vb_allow_zoom') === '1') document.body.dataset.allowZoom = '1'; } catch (e) {}
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
function goTo(path) {
  _pageAcceptsSpeech = false;
  // Stop page-owned speech before navigation begins. pagehide is the backstop,
  // but cancelling here also covers slow navigations and history transitions.
  if (typeof cancelSpeak === 'function') cancelSpeak();
  window.location.href = path;
}
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

// Browser-TTS fallback — used when a phrase has no recorded clip (e.g. the
// dynamic quiz prompts in the colour/animal games). Pick a TTS voice that
// MATCHES the kid's selected voice gender, so the fallback doesn't randomly
// flip sex (boy selected → don't suddenly read in a woman's voice). It won't be
// the exact recorded ElevenLabs voice, but it stays the right character.
const _femaleRe = /(female|woman|samantha|karen|moira|tessa|victoria|susan|fiona|serena|allison|\bava\b|joanna|salli|kendra|zira|hazel|google uk english female)/i;
const _maleRe   = /(\bmale\b|\bman\b|daniel|alex|fred|thomas|\btom\b|oliver|arthur|aaron|david|james|reed|rishi|google uk english male)/i;
let _ttsByGender = { female: undefined, male: undefined };   // undefined = not yet resolved
function _ttsGenderFor(sel) { return (sel === 'boy' || sel === 'man') ? 'male' : 'female'; }
function _pickTtsVoice(gender) {
  if (!window.speechSynthesis) return null;
  if (_ttsByGender[gender] !== undefined) return _ttsByGender[gender];
  const vs = window.speechSynthesis.getVoices() || [];
  if (!vs.length) return null; // voices load async — retry on the next call
  const en = vs.filter(v => /^en[-_]?/i.test(v.lang));
  const pool = en.length ? en : vs;
  let pick = pool.find(v => (gender === 'male' ? _maleRe : _femaleRe).test(v.name));
  // Fallback: any voice that isn't clearly the other gender.
  if (!pick) pick = pool.find(v => !(gender === 'male' ? _femaleRe : _maleRe).test(v.name)) || pool[0] || null;
  _ttsByGender[gender] = pick || null;
  return _ttsByGender[gender];
}
if (typeof window !== 'undefined' && window.speechSynthesis) {
  try { window.speechSynthesis.getVoices(); } catch (e) {}
  window.speechSynthesis.onvoiceschanged = () => { _ttsByGender = { female: undefined, male: undefined }; };
}

// NO-OP ON PURPOSE. The app speaks ONLY real recorded clips (see _voiceSpeak).
// Scott's rule is "no computer/robot voice ANYWHERE", so when a phrase has no
// recorded clip we stay SILENT rather than fall back to the device's robotic
// text-to-speech. speak() already showed the on-screen caption before reaching
// here, so a reader still gets the prompt, and every pre-reader (toddler) phrase
// is recorded. The console hint makes any still-uncovered phrase easy to find +
// record later. (Gender-TTS helpers above are now unused but harmless.)
function _browserSpeak(text) {
  try { console.warn('[voice] no recorded clip (stayed silent):', text); } catch (e) {}
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

  // ── Composed phrases (assemble from atom clips — no TTS) ──
  const has = (...ks) => ks.every(k => phrases[k] !== undefined);
  let m;
  const OP = '(plus|minus|times|divided by)';
  // Math: "3 plus 5?"  /  "3 plus 5 equals 8!"  /  "7 plus what equals 12?"
  if ((m = text.match(new RegExp(`^(\\d+) ${OP} (\\d+) equals (\\d+)!?$`)))) {
    if (has(m[1], m[2], m[3], 'equals', m[4])) return [m[1], m[2], m[3], 'equals', m[4]];
  }
  if ((m = text.match(new RegExp(`^(\\d+) ${OP} what equals (\\d+)\\??$`)))) {
    if (has(m[1], m[2], 'what equals', m[3])) return [m[1], m[2], 'what equals', m[3]];
  }
  if ((m = text.match(new RegExp(`^(\\d+) ${OP} (\\d+)\\??$`)))) {
    if (has(m[1], m[2], m[3])) return [m[1], m[2], m[3]];
  }
  // Count skip-count success: "Yes! 8."
  if ((m = text.match(/^Yes! (\d+)\.?$/))) {
    if (has('Yes!', m[1])) return ['Yes!', m[1]];
  }
  // Money totals: "Yes! 65¢."  /  "Yes! $1.30."  /  "Yes! $5."
  if ((m = text.match(/^Yes! (\d+)¢\.?$/))) {
    if (has('Yes!', m[1], 'cents')) return ['Yes!', m[1], 'cents'];
  }
  if ((m = text.match(/^Yes! \$(\d+)\.(\d+)\.?$/))) {
    const c = String(Number(m[2]));
    if (has('Yes!', m[1], 'dollars', c, 'cents')) return ['Yes!', m[1], 'dollars', c, 'cents'];
  }
  if ((m = text.match(/^Yes! \$(\d+)\.?$/))) {
    if (has('Yes!', m[1], 'dollars')) return ['Yes!', m[1], 'dollars'];
  }

  return null;
}

// Single reusable Audio element. Previously each speak() created a new
// Audio() — on rapid taps (count-along game, math drill, etc.) the elements
// stacked up faster than cancel could pause them, producing lag + duplicate
// playback. One element + immediate src reassignment is what mobile browsers
// actually optimize for.

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
    _clipResolve = resolve;
    const finish = () => {
      if (_clipResolve === resolve) _clipResolve = null;
      resolve();
    };
    a.onended = finish;
    a.onerror = finish;
    // play() returns a promise that may reject if cancelSpeak fires mid-load.
    a.play().catch((e) => {
      // Phones block un-gestured audio (NotAllowedError) — flag it so pages can
      // replay the phrase on the first real tap (see home.html greeting retry).
      if (e && e.name === 'NotAllowedError') window._vbAudioBlocked = true;
      finish();
    });
  });
}

function cancelSpeak() {
  _speakGen++;
  _activeSpeechKind = null;
  if (_clipResolve) {
    const finish = _clipResolve;
    _clipResolve = null;
    try { finish(); } catch {}
  }
  if (_audio) {
    try { _audio.pause(); _audio.removeAttribute('src'); _audio.load(); } catch {}
  }
  if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch {} }
}

function _voiceSpeak(text, voice) {
  const clips = _matchClips(text);
  if (!clips) return _browserSpeak(text, 0.85, 1.2, voice);
  const hashes = clips.map(c => VOICE_MANIFEST.phraseHash[c]);
  const gen = _speakGen;
  // Fire-and-forget IIFE — no shared queue, so a new speak() never waits for
  // the previous to clean up. The gen check inside _playClip aborts stale chains.
  return (async () => {
    for (const h of hashes) {
      if (gen !== _speakGen) return;
      await _playClip(voice, h, gen);
    }
  })();
}

function _getActiveVoice() {
  const p = (typeof getActiveProfile === 'function') ? getActiveProfile() : null;
  let v = (p && p.voice) || 'woman'; // default to adult female (Rachel) when none selected
  if (v === 'browser') v = 'woman';  // legacy profiles on the removed "Browser default" robot voice → migrate to a real one
  return v;
}

function _speechEnabledForProfile() {
  // Big kids (Grade 3+, age tier >=9) read: captions + SFX only, no spoken
  // prompts. Keep this decision shared by feedback and instructions.
  try {
    const p = (typeof getActiveProfile === 'function') ? getActiveProfile() : null;
    return !(p && typeof tierForAge === 'function' && tierForAge(getAgeMonths(p.birthday)) >= 9);
  } catch (e) { return true; }
}

function _startSpeech(text, kind) {
  cancelSpeak();
  _activeSpeechKind = kind;
  const gen = _speakGen;
  const playback = _voiceSpeak(text, _getActiveVoice());
  Promise.resolve(playback).finally(() => {
    if (gen === _speakGen && _activeSpeechKind === kind) _activeSpeechKind = null;
  });
  return playback;
}

function _ensureInstructionReplay() {
  if (_vbReplayEl && _vbReplayEl.isConnected) return _vbReplayEl;
  if (!document.getElementById('vb-replay-instruction-style')) {
    const style = document.createElement('style');
    style.id = 'vb-replay-instruction-style';
    style.textContent =
      '.vb-replay-instruction{position:fixed;top:calc(14px + env(safe-area-inset-top));right:14px;z-index:1090;' +
      'min-width:72px;min-height:48px;padding:8px 12px;border:2px solid rgba(255,255,255,.7);border-radius:999px;' +
      'background:rgba(20,20,40,.78);color:#fff;font:800 14px/1.1 system-ui,-apple-system,sans-serif;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.24);cursor:pointer;touch-action:manipulation}' +
      '.vb-replay-instruction:active{transform:scale(.96)}' +
      '@media(prefers-reduced-motion:reduce){.vb-replay-instruction{transition:none}}';
    document.head.appendChild(style);
  }
  _vbReplayEl = document.createElement('button');
  _vbReplayEl.type = 'button';
  _vbReplayEl.className = 'vb-replay-instruction';
  _vbReplayEl.textContent = '\ud83d\udd0a Again';
  _vbReplayEl.setAttribute('aria-label', 'Hear the instruction again');
  _vbReplayEl.addEventListener('click', replayInstruction);
  (document.body || document.documentElement).appendChild(_vbReplayEl);
  return _vbReplayEl;
}

// Optional feedback: the latest tap wins, but it never cuts off an essential
// instruction and never waits in a queue to play after the moment has passed.
function speak(text, rate = 0.85, pitch = 1.2) {
  if (!_pageAcceptsSpeech) return false;
  _showCaption(text);
  if (!_speechEnabledForProfile()) return;
  if (_activeSpeechKind === 'instruction') return false;
  return _startSpeech(text, 'feedback');
}

// Essential activity guidance gets one protected playback and a persistent,
// explicit replay control. A newer instruction replaces an obsolete one.
function speakInstruction(text) {
  if (!_pageAcceptsSpeech) return false;
  _lastInstructionText = String(text || '');
  if (!_lastInstructionText) return;
  _ensureInstructionReplay();
  _showCaption(_lastInstructionText);
  if (!_speechEnabledForProfile()) return;
  return _startSpeech(_lastInstructionText, 'instruction');
}

function replayInstruction() {
  if (_activeSpeechKind === 'instruction') return false;
  if (_lastInstructionText) return speakInstruction(_lastInstructionText);
}

// A page's audio and clip chain must not survive deliberate navigation.
if (typeof window !== 'undefined') {
  const leaveSpeechPage = () => { _pageAcceptsSpeech = false; cancelSpeak(); };
  window.addEventListener('pagehide', leaveSpeechPage);
  window.addEventListener('beforeunload', leaveSpeechPage);
  window.addEventListener('pageshow', () => { _pageAcceptsSpeech = true; });
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
// configured hold (3s on the parent picker; 0.7s for in-game gears). Releasing
// early cancels. A fill follows elapsed time, including with reduced motion.
// Game Back/Home stay instant; Enter/Space can hold the focused settings button.
let _holdStyleInjected = false;
function _injectHoldStyle() {
  if (_holdStyleInjected) return;
  _holdStyleInjected = true;
  const s = document.createElement('style');
  s.textContent =
    '.vb-hold-control{isolation:isolate;overflow:hidden;}' +
    '.vb-hold-control,.vb-hold-control:hover,.vb-hold-control:active,.vb-hold-control.vb-press{transform:none!important;}' +
    '.vb-hold-fill{position:absolute;inset:0;z-index:-1;border-radius:inherit;pointer-events:none;' +
    'background:rgba(78,205,196,.62);transform-origin:left center;transform:scaleX(var(--vb-hold-progress,0));' +
    'transition:none!important;animation:none!important;}';
  document.head.appendChild(s);
}
function holdToActivate(el, onActivate, opts) {
  const ms = (opts && opts.ms) || 700;
  _injectHoldStyle();
  el.classList.add('vb-hold-control');
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  const fill = document.createElement('span');
  fill.className = 'vb-hold-fill';
  fill.setAttribute('aria-hidden', 'true');
  el.prepend(fill);
  const hint = el.querySelector('[data-hold-label]');
  const idleHint = hint && hint.textContent;
  // iOS long-press otherwise pops the native Share/Copy/Download callout instead
  // of registering the hold — suppress it so the press just opens settings.
  el.style.webkitTouchCallout = 'none';
  el.style.userSelect = 'none';
  el.style.webkitUserSelect = 'none';
  el.style.touchAction = 'none';
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  let timer = null, frame = null, owner = null, started = 0, lastSecond = -1;
  const showProgress = value => {
    el.style.setProperty('--vb-hold-progress', String(value));
    if (hint) {
      const second = Math.ceil((1 - value) * ms / 1000);
      if (second !== lastSecond) {
        hint.textContent = value >= 1 ? 'Opening…' : `Keep holding… ${second}`;
        lastSecond = second;
      }
    }
  };
  const stop = () => {
    const previous = owner;
    owner = null;
    clearTimeout(timer); timer = null;
    cancelAnimationFrame(frame); frame = null;
    el.classList.remove('vb-holding');
    el.style.setProperty('--vb-hold-progress', '0');
    if (hint) hint.textContent = idleHint;
    lastSecond = -1;
    if (previous && previous.kind === 'pointer') {
      try { if (el.hasPointerCapture(previous.id)) el.releasePointerCapture(previous.id); } catch (_) {}
    }
  };
  const update = () => {
    if (!owner) return;
    showProgress(Math.min(.999, (performance.now() - started) / ms));
    frame = requestAnimationFrame(update);
  };
  const start = next => {
    if (owner || el.disabled) return;
    owner = next;
    started = performance.now();
    el.classList.add('vb-holding');
    showProgress(0);
    frame = requestAnimationFrame(update);
    timer = setTimeout(() => {
      if (!owner || document.hidden || !el.isConnected) { stop(); return; }
      // Keep ownership until release: repeated keydown/pointerdown cannot fire
      // twice from a single continuous hold, including non-navigation callbacks.
      owner.fired = true;
      cancelAnimationFrame(frame); frame = null; timer = null;
      showProgress(1);
      onActivate();
    }, ms);
  };
  el.addEventListener('pointerdown', e => {
    if (owner || e.isPrimary === false || e.button !== 0) return;
    e.preventDefault();
    el.focus({preventScroll:true});
    start({kind:'pointer',id:e.pointerId,bounds:el.getBoundingClientRect()});
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
  });
  const endPointer = e => { if (owner && owner.kind === 'pointer' && owner.id === e.pointerId) stop(); };
  for (const name of ['pointerup','pointercancel','lostpointercapture']) el.addEventListener(name,endPointer);
  el.addEventListener('pointermove', e => {
    if (!owner || owner.kind !== 'pointer' || owner.id !== e.pointerId) return;
    const b = owner.bounds;
    if ((e.pointerType === 'mouse' && e.buttons === 0) || e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) stop();
  });
  el.addEventListener('pointerleave', e => {
    if (!el.hasPointerCapture(e.pointerId)) endPointer(e);
  });
  const holdKey = e => e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar';
  el.addEventListener('keydown', e => {
    if (!holdKey(e)) return;
    e.preventDefault();
    if (!e.repeat) start({kind:'key',key:e.key});
  });
  el.addEventListener('keyup', e => {
    if (!holdKey(e)) return;
    e.preventDefault();
    if (owner && owner.kind === 'key' && owner.key === e.key) stop();
  });
  el.addEventListener('click', e => e.preventDefault());
  el.addEventListener('blur', stop);
  window.addEventListener('blur', stop);
  window.addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  stop();
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
