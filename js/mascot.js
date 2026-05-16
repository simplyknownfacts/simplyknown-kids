// Mascot widget — plays per-profile lip-synced video clips at scripted moments.
//
// Usage:
//   <script src="js/mascot.js"></script>
//   mascot.play('welcome');   // home page first visit of the day
//   mascot.play('games_intro'); // when entering a category
//   mascot.play('cheer_great'); // on activity completion
//
// Profile shape:
//   profile.mascot = { id: 'tiger', voice: 'girl' }   // null = no mascot
//
// Each clip lives at: /mascots/<id>/video/<voice>_<key>.mp4

const MASCOT_AVAILABLE = ['dog', 'tiger', 'giraffe', 'panda', 'orca', 'eagle'];
const MASCOT_LABELS = {
  dog:     '🐶 Dog',
  tiger:   '🐯 Tiger',
  giraffe: '🦒 Giraffe',
  panda:   '🐼 Panda',
  orca:    '🐳 Orca',
  eagle:   '🦅 Eagle',
};

let _mascotEl = null;
let _playLog = JSON.parse(localStorage.getItem('vb_mascot_plays') || '{}');

function _saveLog() { localStorage.setItem('vb_mascot_plays', JSON.stringify(_playLog)); }

function _shouldPlay(profileId, key) {
  // Limit "welcome" to once per day. Category intros to once per session. Cheers always play.
  const today = new Date().toISOString().slice(0, 10);
  const k = `${profileId}/${key}`;
  if (key === 'welcome') {
    const last = _playLog[k];
    return last !== today;
  }
  if (key.endsWith('_intro')) {
    const session = sessionStorage.getItem('vb_mascot_' + k);
    return !session;
  }
  return true; // cheers, goodbye — always
}

function _markPlayed(profileId, key) {
  const today = new Date().toISOString().slice(0, 10);
  const k = `${profileId}/${key}`;
  if (key === 'welcome') { _playLog[k] = today; _saveLog(); }
  else if (key.endsWith('_intro')) { sessionStorage.setItem('vb_mascot_' + k, '1'); }
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
  `;
  const vid = document.createElement('video');
  vid.id = 'mascotVid';
  vid.muted = false; vid.playsInline = true; vid.autoplay = false;
  vid.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
  vid.addEventListener('ended', () => hide());
  wrap.appendChild(vid);
  // Tap mascot to dismiss
  wrap.addEventListener('click', () => hide());
  document.body.appendChild(wrap);
  _mascotEl = wrap;
  return wrap;
}

function hide() {
  if (!_mascotEl) return;
  const vid = _mascotEl.querySelector('video');
  if (vid) { vid.pause(); vid.src = ''; }
  _mascotEl.style.opacity = '0';
  _mascotEl.style.transform = 'scale(0.5)';
  setTimeout(() => { if (_mascotEl) _mascotEl.style.display = 'none'; }, 300);
}

function play(key) {
  const profile = (typeof getActiveProfile === 'function') ? getActiveProfile() : null;
  if (!profile || !profile.mascot || !profile.mascot.id) return;
  if (!_shouldPlay(profile.id, key)) return;
  const voice = profile.mascot.voice || profile.voice || 'girl';
  const src = `${rootPath()}mascots/${profile.mascot.id}/video/${voice}_${key}.mp4`;

  const wrap = _ensureEl();
  const vid = wrap.querySelector('video');
  vid.src = src;
  vid.onerror = () => hide(); // missing clip → silent fail
  wrap.style.display = 'flex';
  // Animate in
  wrap.style.opacity = '0';
  wrap.style.transform = 'scale(0.5)';
  requestAnimationFrame(() => {
    wrap.style.opacity = '1';
    wrap.style.transform = 'scale(1)';
  });
  vid.play().catch(() => {});
  _markPlayed(profile.id, key);
}

window.mascot = { play, hide, available: MASCOT_AVAILABLE, labels: MASCOT_LABELS };
