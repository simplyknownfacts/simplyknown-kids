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

function _ensureEl() {
  if (_mascotEl) return _mascotEl;
  const wrap = document.createElement('div');
  wrap.id = 'mascotWrap';
  wrap.style.cssText = `
    position: fixed; bottom: 16px; right: 16px;
    width: 180px; height: 180px; border-radius: 50%;
    background: rgba(0,0,0,0.4); overflow: hidden;
    display: none;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    z-index: 9999;
    border: 4px solid rgba(255,255,255,0.6);
    transition: transform 0.3s, opacity 0.3s;
    animation: mascotBob 4s ease-in-out infinite;
  `;
  if (!document.getElementById('mascotBobKf')) {
    const style = document.createElement('style');
    style.id = 'mascotBobKf';
    style.textContent = `
      @keyframes mascotBob {
        0%, 100% { transform: translateY(0) scale(1); }
        50% { transform: translateY(-6px) scale(1.02); }
      }
    `;
    document.head.appendChild(style);
  }
  // Two stacked <video>s for crossfade — eliminates flash on src change.
  // The wrap background sits BEHIND both videos, so during the fade overlap
  // the dark border won't bleed through (matches the mascot bg color).
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
      background: rgba(0,0,0,0.4);
    `;
    wrap.appendChild(vid);
  }
  // Tap mascot: cycle to a new random action + play the species sound effect.
  // pointerdown beats click on toddler taps (no 300ms delay, no shrink-target miss).
  wrap.addEventListener('pointerdown', _onMascotTap);
  document.body.appendChild(wrap);
  _mascotEl = wrap;
  _frontIdx = 0;
  return wrap;
}

function _onMascotTap() {
  // Only accept taps while the mascot is idle (base loop). Mid-action and
  // mid-speech taps are ignored so animations always play to completion.
  if (_state !== 'base') return;
  const p = _activeProfile();
  if (!p || !p.mascot || !p.mascot.id) return;
  // Play the species signature sound — but only if we haven't played it
  // recently. Toddlers tap-tap-tap, and a bark every half second is noise.
  const now = Date.now();
  if (now - _lastSfxAt >= SFX_COOLDOWN_MS) {
    const sfxFile = MASCOT_SOUND_FILE[p.mascot.id];
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

function _videos() {
  return _mascotEl ? _mascotEl.querySelectorAll('video.mascot-vid') : [];
}
function _front() { const v = _videos(); return v ? v[_frontIdx] : null; }
function _back()  { const v = _videos(); return v ? v[1 - _frontIdx] : null; }

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
    back.style.opacity = '1';
    front.style.opacity = '0';
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
  if (key === 'BASE') return `${rootPath()}mascots/${mascotId}/idle/idle_base.mp4`;
  if (key.startsWith('idle_')) return `${rootPath()}mascots/${mascotId}/idle/${key}.mp4`;
  return `${rootPath()}mascots/${mascotId}/video/${voice}_${key}.mp4`;
}

function _scheduleNextAction() {
  clearTimeout(_actionTimer);
  // Random 5-15 seconds before next action gesture interrupts the base
  const delay = 5000 + Math.random() * 10000;
  _actionTimer = setTimeout(_playAction, delay);
}

function _playBase() {
  const p = _activeProfile();
  if (!p || !p.mascot || !p.mascot.id) return;
  const wrap = _ensureEl();
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
  _crossfadeTo(_src(p.mascot.id, null, 'BASE'), { muted: true, loop: true, onended: null });
  _scheduleNextAction();
}

function _playAction() {
  const p = _activeProfile();
  if (!p || !p.mascot || !p.mascot.id) return;
  if (_state !== 'base') { _scheduleNextAction(); return; }
  const keys = _actionKeys(p.mascot.id);
  let pool = _lastAction ? keys.filter(k => k !== _lastAction) : keys;
  if (!pool.length) pool = keys;
  const key = pool[Math.floor(Math.random() * pool.length)];
  _lastAction = key;
  _state = 'action';
  _crossfadeTo(_src(p.mascot.id, null, key), { muted: true, loop: false, onended: () => _playBase() });
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
  if (!profile || !profile.mascot || !profile.mascot.id) return;
  if (!_shouldSpeak(profile.id, key)) {
    if (_state === 'hidden') _playBase();
    return;
  }
  const voice = profile.mascot.voice || profile.voice || 'girl';
  const wrap = _ensureEl();
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
  _crossfadeTo(_src(profile.mascot.id, voice, key), {
    muted: !!(opts && opts.muted), loop: false, onended: () => _playBase(),
  });
}

function show() {
  // Just show + start base loop, no speech
  _playBase();
}

function hide() {
  if (!_mascotEl) return;
  clearTimeout(_actionTimer);
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
});
document.addEventListener('vb:active', () => {
  if (_state === 'base' || _state === 'action') {
    _videos().forEach(v => { try { v.play().catch(() => {}); } catch {} });
    if (_state === 'base') _scheduleNextAction();
  }
});

window.mascot = { play, show, hide, available: MASCOT_AVAILABLE, labels: MASCOT_LABELS };
