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
function _actionKeys(mascotId) {
  return [...UNIVERSAL_IDLES, ...(SPECIES_IDLES[mascotId] || [])];
}

let _mascotEl = null;
let _actionTimer = null;
let _lastAction = null;
let _state = 'hidden';
let _frontIdx = 0;

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
      transition: opacity 0.25s ease;
    `;
    wrap.appendChild(vid);
  }
  document.body.appendChild(wrap);
  _mascotEl = wrap;
  _frontIdx = 0;
  return wrap;
}

function _videos() {
  return _mascotEl ? _mascotEl.querySelectorAll('video.mascot-vid') : [];
}
function _front() { const v = _videos(); return v ? v[_frontIdx] : null; }
function _back()  { const v = _videos(); return v ? v[1 - _frontIdx] : null; }

// Load src into the BACK video, then crossfade swap when first frame is ready.
// opts: { muted, loop, onended }
function _crossfadeTo(src, opts) {
  const wrap = _ensureEl();
  const back = _back();
  const front = _front();
  if (!back || !front) return;
  back.muted = !!opts.muted;
  back.loop = !!opts.loop;
  back.onended = null;
  // Wait for first frame
  const onReady = () => {
    back.removeEventListener('loadeddata', onReady);
    // Wire onended AFTER swap so it doesn't fire on the old front
    back.onended = opts.onended || null;
    back.play().catch(() => {});
    // Crossfade
    back.style.opacity = '1';
    front.style.opacity = '0';
    setTimeout(() => {
      try { front.pause(); } catch {}
      front.removeAttribute('src');
      front.load();
    }, 260);
    _frontIdx = 1 - _frontIdx;
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

function play(key) {
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
  _crossfadeTo(_src(profile.mascot.id, voice, key), {
    muted: false, loop: false, onended: () => _playBase(),
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
