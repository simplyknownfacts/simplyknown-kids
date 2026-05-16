// Zoom defense — toddlers triggering pinch/wheel-zoom shouldn't break the
// layout. Viewport meta user-scalable=no is ignored on modern iOS, and a
// Chrome PWA on desktop still honors Ctrl+wheel and Ctrl+=. Trap the routes
// kids can stumble into.
(function _blockZoom() {
  // iOS Safari pinch
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev =>
    document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
  // Desktop Chrome / Edge: Ctrl + wheel
  window.addEventListener('wheel', e => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  }, { passive: false });
  // Desktop keyboard: Ctrl+=, Ctrl+-, Ctrl+0
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && ['=', '+', '-', '_', '0'].includes(e.key)) {
      e.preventDefault();
    }
  });
  // Double-tap zoom on Safari (kid taps too fast).
  let _lastTap = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - _lastTap < 350) e.preventDefault();
    _lastTap = now;
  }, { passive: false });
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

function playSuccess() {
  [523, 659, 784, 1047].forEach((f, i) => {
    setTimeout(() => playTone(f, 0.3, 0.2), i * 120);
  });
}

function playChime() { playTone(880, 0.4, 0.2); }
function playBoop()  { playTone(330, 0.1, 0.2, 'square'); }

function _browserSpeak(text, rate = 0.85, pitch = 1.2) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
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

let _audioQueue = Promise.resolve();
let _currentAudio = null;
let _speakGen = 0; // increments on cancel; in-flight chain checks this to bail
function _playClip(voice, hash, gen) {
  return new Promise(resolve => {
    if (gen !== _speakGen) return resolve();
    const audio = new Audio(`${rootPath()}audio/${voice}/${hash}.mp3`);
    _currentAudio = audio;
    audio.onended = audio.onerror = () => {
      if (_currentAudio === audio) _currentAudio = null;
      resolve();
    };
    audio.play().catch(() => resolve());
  });
}

function cancelSpeak() {
  _speakGen++;
  if (_currentAudio) {
    try { _currentAudio.pause(); _currentAudio.src = ''; } catch {}
    _currentAudio = null;
  }
  if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch {} }
  _audioQueue = Promise.resolve();
}

function _voiceSpeak(text, voice) {
  const clips = _matchClips(text);
  if (!clips) return _browserSpeak(text);
  const hashes = clips.map(c => VOICE_MANIFEST.phraseHash[c]);
  const gen = _speakGen;
  _audioQueue = _audioQueue.then(async () => {
    for (const h of hashes) {
      if (gen !== _speakGen) return;
      await _playClip(voice, h, gen);
    }
  });
}

function _getActiveVoice() {
  const p = (typeof getActiveProfile === 'function') ? getActiveProfile() : null;
  return (p && p.voice) || 'girl'; // default to ElevenLabs Sarah, not robotic browser TTS
}

function speak(text, rate = 0.85, pitch = 1.2) {
  const v = _getActiveVoice();
  if (v === 'browser') return _browserSpeak(text, rate, pitch);
  return _voiceSpeak(text, v);
}

// Render a standard back button
function renderBackBtn(dest) {
  const btn = document.createElement('button');
  btn.className = 'back-btn'; btn.textContent = '←';
  btn.setAttribute('aria-label', 'Go back');
  btn.addEventListener('click', () => dest ? goTo(dest) : history.back());
  document.body.appendChild(btn);
}

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
