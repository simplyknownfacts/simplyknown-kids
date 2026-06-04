// Persistent Yoto mini-player.
//
// Audio truly can't persist across full-page navigations in a multi-page app,
// so we do the next best thing: sessionStorage tracks {src, position, title,
// cover, playing}, and every page that loads this script re-hydrates the audio
// element + mini-player overlay, seeks to the saved position, and resumes.
// There's a ~1-2s gap on navigation while the audio element rebuilds.
//
// The Listen page writes the state. Every other page just reads + renders.

(function() {
  const KEY = 'vb_yoto_now_playing';

  function loadState() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); }
    catch { return null; }
  }
  function saveState(s) {
    if (!s) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify(s));
  }

  // Exposed so the Listen page (which owns playback) can publish + clear state.
  window.yotoPlayer = {
    publish(state) { saveState(state); },
    clear() { saveState(null); _hideMini(); },
    getState: loadState,
  };

  // ───── Shared helpers ──────────────────────────────────────────────
  function _activeId() {
    try { return localStorage.getItem('vb_active_id') || '_none'; } catch (e) { return '_none'; }
  }
  // Connected = this profile has its OWN Yoto tokens (same per-profile key as
  // js/yoto.js). Read straight from localStorage so hub pages don't need to load
  // yoto.js just to decide whether to show the launcher.
  function _yotoConnected() {
    try { return !!localStorage.getItem('vb_yoto_tokens_' + _activeId()); } catch (e) { return false; }
  }
  function _listenUrl() {
    const base = (typeof rootPath === 'function') ? rootPath()
      : (/\/(games|learning|art|videos|parent)\//.test(location.pathname) ? '../' : './');
    return base + 'listen/index.html';
  }
  function _openListen() {
    if (typeof goTo === 'function') goTo(_listenUrl()); else location.href = _listenUrl();
  }

  // ───── Launcher FAB — home + section hubs only (not activities/listen) ─
  function _onHub() {
    const p = location.pathname;
    return /\/home\.html$/.test(p) || /\/(games|learning|art|videos)\/index\.html$/.test(p);
  }
  function _renderLauncher() {
    if (document.getElementById('yotoLaunch')) return;
    if (!document.getElementById('yotoLaunchStyles')) {
      const s = document.createElement('style');
      s.id = 'yotoLaunchStyles';
      s.textContent = `
        #yotoLaunch {
          position: fixed; z-index: 9000;
          bottom: calc(96px + env(safe-area-inset-bottom));   /* clear the bottom profile-switcher chip / ribbons shelf on hubs */
          right: calc(16px + env(safe-area-inset-right));
          width: 62px; height: 62px; border-radius: 50%; border: none;
          display: flex; align-items: center; justify-content: center;
          font-size: 30px; line-height: 1; cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          background: linear-gradient(180deg, color-mix(in srgb, var(--c-listen, #FF9F6B) 82%, #fff), var(--c-listen, #FF9F6B));
          box-shadow: 0 8px 22px rgba(0,0,0,0.34), inset 0 2px 0 rgba(255,255,255,0.55), inset 0 -4px 8px rgba(120,60,10,0.30);
          animation: yotoLaunchPulse 2.6s ease-in-out infinite;
        }
        #yotoLaunch:active { transform: scale(0.92); animation: none; }
        @keyframes yotoLaunchPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.07); } }
        @media (prefers-reduced-motion: reduce) { #yotoLaunch { animation: none; } }
      `;
      document.head.appendChild(s);
    }
    const b = document.createElement('button');
    b.id = 'yotoLaunch';
    b.type = 'button';
    b.setAttribute('aria-label', 'Open Yoto cards');
    b.textContent = '🎧';
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); _openListen(); });
    document.body.appendChild(b);
  }
  function _initLauncher() {
    if (_onHub() && _yotoConnected()) _renderLauncher();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _initLauncher);
  else _initLauncher();

  // ───── Mini-player overlay (everywhere except the Listen page) ─────
  // On Listen page the full player UI is in charge — no mini.
  if (location.pathname.includes('/listen/')) return;

  let _miniEl = null, _audio = null, _saveTimer = null;

  function _hideMini() {
    if (_audio) { try { _audio.pause(); _audio.src = ''; } catch {} _audio = null; }
    if (_miniEl) { _miniEl.remove(); _miniEl = null; }
    clearInterval(_saveTimer); _saveTimer = null;
  }

  function _renderMini(state) {
    if (_miniEl) return; // already there
    const el = document.createElement('div');
    el.id = 'yotoMini';
    el.style.cssText = `
      position: fixed;
      top: calc(8px + env(safe-area-inset-top));
      right: calc(8px + env(safe-area-inset-right));
      display: flex; align-items: center; gap: 8px;
      background: rgba(10,10,30,0.92); backdrop-filter: blur(8px);
      color: white; border-radius: 999px; padding: 6px 10px 6px 6px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.5);
      z-index: 9500; max-width: 260px;
      border: 2px solid rgba(78,205,196,0.4);
      font-family: inherit;
    `;
    el.innerHTML = `
      <div id="ymCover" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.1);overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🎧</div>
      <div id="ymTitle" style="font-size:12px;font-weight:800;max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
      <button id="ymPP" aria-label="Play/Pause" style="width:32px;height:32px;border-radius:50%;border:none;background:#4ECDC4;color:#1a1a2e;font-size:14px;font-weight:900;cursor:pointer;flex-shrink:0;">▶</button>
      <button id="ymX" aria-label="Stop" style="width:32px;height:32px;border-radius:50%;border:none;background:rgba(255,255,255,0.15);color:white;font-size:14px;cursor:pointer;flex-shrink:0;">✕</button>
    `;
    document.body.appendChild(el);
    _miniEl = el;

    const cover = el.querySelector('#ymCover');
    if (state.cover) cover.innerHTML = `<img src="${state.cover}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
    const titleEl = el.querySelector('#ymTitle');
    titleEl.textContent = state.title || 'Yoto';
    // Tap the cover or title to open the full Listen player (switch cards / skip).
    [cover, titleEl].forEach((t) => {
      t.style.cursor = 'pointer';
      t.addEventListener('pointerdown', _openListen);
    });

    el.querySelector('#ymPP').addEventListener('pointerdown', () => {
      if (!_audio) return;
      if (_audio.paused) { _audio.play().catch(()=>{}); }
      else { _audio.pause(); }
    });
    el.querySelector('#ymX').addEventListener('pointerdown', () => {
      window.yotoPlayer.clear();
    });
  }

  function _startAudio(state) {
    _audio = new Audio();
    _audio.preload = 'auto';
    _audio.src = state.src;
    _audio.currentTime = state.position || 0;
    _audio.addEventListener('play',  () => _miniEl && (_miniEl.querySelector('#ymPP').textContent = '⏸'));
    _audio.addEventListener('pause', () => _miniEl && (_miniEl.querySelector('#ymPP').textContent = '▶'));
    _audio.addEventListener('ended', () => window.yotoPlayer.clear());
    _audio.addEventListener('error', () => window.yotoPlayer.clear());
    if (state.playing !== false) _audio.play().catch(() => {
      // Autoplay blocked — leave it paused, kid taps the play button.
      if (_miniEl) _miniEl.querySelector('#ymPP').textContent = '▶';
    });
    clearInterval(_saveTimer);
    _saveTimer = setInterval(() => {
      if (!_audio) return;
      const cur = loadState();
      if (!cur) return;
      cur.position = _audio.currentTime;
      cur.playing = !_audio.paused;
      saveState(cur);
    }, 1000);
  }

  function _init() {
    const state = loadState();
    if (!state || !state.src) return;
    _renderMini(state);
    _startAudio(state);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();
