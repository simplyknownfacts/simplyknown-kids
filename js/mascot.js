// Mascot widget — plays per-profile lip-synced video clips at scripted moments
// and stays on the page playing random idle loops between clips.
//
// Usage:
//   <script src="js/mascot.js"></script>
//   mascot.play('welcome');     // plays clip then transitions to idle loop
//   mascot.show();              // just shows mascot in idle loop (no speaking)
//
// Profile shape:
//   profile.mascot = { id: 'tiger' }   // null = no mascot
//
// Clip paths:
//   /mascots/<id>/video/<voice>_<key>.mp4   (speaking)
//   /mascots/<id>/idle/<key>.mp4            (silent loop)

const MASCOT_AVAILABLE = ['dog', 'tiger', 'giraffe', 'panda', 'orca', 'eagle'];
const MASCOT_LABELS = {
  dog: '🐶 Dog', tiger: '🐯 Tiger', giraffe: '🦒 Giraffe',
  panda: '🐼 Panda', orca: '🐳 Orca', eagle: '🦅 Eagle',
};
const IDLE_KEYS = ['idle_wave', 'idle_bubbles', 'idle_book', 'idle_popcorn'];

let _mascotEl = null;
let _state = 'hidden'; // 'hidden' | 'speaking' | 'idle'

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
  // Bob keyframes (one-time css inject)
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
  // Tap mascot to replay welcome (doesn't hide)
  wrap.addEventListener('click', () => {
    const p = (typeof getActiveProfile === 'function') ? getActiveProfile() : null;
    if (p && p.mascot && p.mascot.id) play('welcome');
  });
  document.body.appendChild(wrap);
  _mascotEl = wrap;
  return wrap;
}

function _activeProfile() {
  return (typeof getActiveProfile === 'function') ? getActiveProfile() : null;
}

function _pickIdle() {
  return IDLE_KEYS[Math.floor(Math.random() * IDLE_KEYS.length)];
}

function _loadIdleLoop() {
  const p = _activeProfile();
  if (!p || !p.mascot || !p.mascot.id) return;
  const wrap = _ensureEl();
  const vid = wrap.querySelector('video');
  const idleKey = _pickIdle();
  const src = `${rootPath()}mascots/${p.mascot.id}/idle/${idleKey}.mp4`;
  vid.muted = true;
  vid.loop = true;
  vid.src = src;
  vid.onended = null;
  vid.onerror = () => {
    // Fallback: show static master image if idle clip missing
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
  _state = 'idle';
  // Show with fade-in if hidden
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
}

function _shouldPlay(profileId, key) {
  // Welcome plays every time. Category intros once per session. Cheers always.
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
  if (!_shouldPlay(profile.id, key)) {
    _loadIdleLoop();
    return;
  }
  const voice = profile.mascot.voice || profile.voice || 'girl';
  const src = `${rootPath()}mascots/${profile.mascot.id}/video/${voice}_${key}.mp4`;

  const wrap = _ensureEl();
  const vid = wrap.querySelector('video');
  vid.muted = false;
  vid.loop = false;
  vid.src = src;
  vid.onerror = () => _loadIdleLoop(); // missing clip → fallback
  vid.onended = () => _loadIdleLoop();
  vid.style.display = '';
  const still = wrap.querySelector('img.mascot-still');
  if (still) still.remove();

  _state = 'speaking';
  wrap.style.display = 'flex';
  // Animate in
  wrap.style.opacity = '0';
  wrap.style.transform = 'scale(0.5)';
  requestAnimationFrame(() => {
    wrap.style.opacity = '1';
    wrap.style.transform = 'scale(1)';
  });
  vid.play().catch(() => {});
}

function show() {
  // Idle-only display, no speech
  _loadIdleLoop();
}

function hide() {
  if (!_mascotEl) return;
  const vid = _mascotEl.querySelector('video');
  if (vid) { vid.pause(); vid.src = ''; }
  _mascotEl.style.opacity = '0';
  _mascotEl.style.transform = 'scale(0.5)';
  setTimeout(() => { if (_mascotEl) _mascotEl.style.display = 'none'; }, 300);
  _state = 'hidden';
}

window.mascot = { play, show, hide, available: MASCOT_AVAILABLE, labels: MASCOT_LABELS };
