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
    display: none; align-items: center; justify-content: center;
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
  const vid = document.createElement('video');
  vid.id = 'mascotVid';
  vid.muted = false; vid.playsInline = true; vid.autoplay = false;
  vid.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
  wrap.appendChild(vid);
  // Tap mascot: no-op per user request
  document.body.appendChild(wrap);
  _mascotEl = wrap;
  return wrap;
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
  const vid = wrap.querySelector('video');
  vid.muted = true;
  vid.loop = true; // base genuinely loops
  vid.src = _src(p.mascot.id, null, 'BASE');
  vid.onended = null;
  vid.onerror = () => {
    // Fallback: static master image if base clip missing
    vid.style.display = 'none';
    if (!wrap.querySelector('img.mascot-still')) {
      const img = document.createElement('img');
      img.className = 'mascot-still';
      img.src = `${rootPath()}mascots/${p.mascot.id}/master.png`;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      wrap.appendChild(img);
    }
  };
  vid.style.display = '';
  const still = wrap.querySelector('img.mascot-still');
  if (still) still.remove();
  _state = 'base';
  if (wrap.style.display === 'none') {
    wrap.style.display = 'flex';
    wrap.style.opacity = '0';
    wrap.style.transform = 'scale(0.5)';
    requestAnimationFrame(() => {
      wrap.style.opacity = '1';
      wrap.style.transform = 'scale(1)';
    });
  }
  vid.play().catch(() => {});
  _scheduleNextAction();
}

function _playAction() {
  const p = _activeProfile();
  if (!p || !p.mascot || !p.mascot.id) return;
  if (_state !== 'base') { _scheduleNextAction(); return; } // skip if speaking
  const wrap = _ensureEl();
  const vid = wrap.querySelector('video');
  const keys = _actionKeys(p.mascot.id);
  let pool = _lastAction ? keys.filter(k => k !== _lastAction) : keys;
  if (!pool.length) pool = keys;
  const key = pool[Math.floor(Math.random() * pool.length)];
  _lastAction = key;
  vid.muted = true;
  vid.loop = false;
  vid.src = _src(p.mascot.id, null, key);
  vid.onended = () => _playBase(); // when action finishes, return to base
  vid.onerror = () => _playBase();
  _state = 'action';
  vid.play().catch(() => _playBase());
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
  const vid = wrap.querySelector('video');
  clearTimeout(_actionTimer);
  vid.muted = false;
  vid.loop = false;
  vid.src = _src(profile.mascot.id, voice, key);
  vid.onerror = () => _playBase();
  vid.onended = () => _playBase();
  const still = wrap.querySelector('img.mascot-still');
  if (still) still.remove();
  vid.style.display = '';
  _state = 'speaking';
  wrap.style.display = 'flex';
  wrap.style.opacity = '0';
  wrap.style.transform = 'scale(0.5)';
  requestAnimationFrame(() => {
    wrap.style.opacity = '1';
    wrap.style.transform = 'scale(1)';
  });
  vid.play().catch(() => {});
}

function show() {
  // Just show + start base loop, no speech
  _playBase();
}

function hide() {
  if (!_mascotEl) return;
  clearTimeout(_actionTimer);
  const vid = _mascotEl.querySelector('video');
  if (vid) { vid.pause(); vid.src = ''; }
  _mascotEl.style.opacity = '0';
  _mascotEl.style.transform = 'scale(0.5)';
  setTimeout(() => { if (_mascotEl) _mascotEl.style.display = 'none'; }, 300);
  _state = 'hidden';
}

window.mascot = { play, show, hide, available: MASCOT_AVAILABLE, labels: MASCOT_LABELS };
