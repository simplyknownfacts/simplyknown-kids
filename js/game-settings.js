// In-game settings widget — gear icon + PIN gate + modal with only THIS game's features.
//
// Usage in an activity page:
//   <script src="../js/game-settings.js"></script>
//   gameSettings.attach('tap-pop'); // activity id from ACTIVITY_FEATURES
//
// Tap gear (top-right) → PIN entry → toggle feature checkboxes for active profile.
// No-op if the activity has no features defined.

(function () {
  const PIN_KEY = 'vb_pin';

  async function _sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function _findActivity(activityId) {
    if (typeof ACTIVITY_FEATURES === 'undefined') return null;
    return ACTIVITY_FEATURES.find(a => a.id === activityId);
  }

  function attach(activityId, opts) {
    const activity = _findActivity(activityId);
    if (!activity || !activity.features || !activity.features.length) return;

    // If a container is provided, drop the gear inside it as a relative-position
    // child — pages with their own toolbar (finger-paint, stamp-art, color-splash)
    // do this so the toolbar layout positions the gear automatically and there's
    // no overlap with palette/Clear in either orientation.
    const containerSel = opts && opts.container;
    const container = containerSel
      ? (typeof containerSel === 'string' ? document.querySelector(containerSel) : containerSel)
      : null;

    const gear = document.createElement('button');
    gear.id = 'gameSettingsGear';
    gear.title = 'Game settings';
    gear.textContent = '⚙️';
    if (container) {
      gear.style.cssText = `
        width: 48px; height: 48px; border-radius: 50%;
        background: rgba(0,0,0,0.5); color: white;
        border: 2px solid rgba(255,255,255,0.4);
        font-size: 22px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        opacity: 0.7;
        order: 999;
      `;
      container.appendChild(gear);
    } else {
      gear.style.cssText = `
        position: fixed;
        bottom: calc(14px + env(safe-area-inset-bottom));
        right: calc(14px + env(safe-area-inset-right));
        width: 48px; height: 48px; border-radius: 50%;
        background: rgba(0,0,0,0.5); color: white;
        border: 2px solid rgba(255,255,255,0.4);
        font-size: 22px; cursor: pointer; z-index: 9000;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        opacity: 0.7;
      `;
      document.body.appendChild(gear);
    }
    gear.addEventListener('pointerdown', () => _openOverlay(activity));
  }

  function _openOverlay(activity) {
    // Build overlay
    const overlay = document.createElement('div');
    overlay.id = 'gameSettingsOverlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.7);
      z-index: 9998; display: flex; align-items: center; justify-content: center;
      padding: 20px; font-family: var(--font, system-ui);
    `;
    overlay.innerHTML = `
      <div style="background: #1a1a2e; border-radius: 18px; padding: 24px; max-width: 480px; width: 100%; max-height: 90vh; overflow-y: auto; color: white;">
        <div id="gsContent"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    // Close on tap-OUTSIDE the inner card. Use pointerdown so the *same* tap
    // that opened the overlay (also a pointerdown on the gear) can't immediately
    // close it — the user has to lift their finger and tap again. Without this,
    // the gear's pointerdown opens the overlay and then the pointerup/click on
    // the now-covering overlay closes it instantly.
    let _overlayReady = false;
    setTimeout(() => { _overlayReady = true; }, 400);
    overlay.addEventListener('pointerdown', (e) => {
      if (_overlayReady && e.target === overlay) overlay.remove();
    });

    // Show PIN gate first if PIN is set, else go straight to settings
    if (localStorage.getItem(PIN_KEY)) {
      _renderPinGate(overlay.querySelector('#gsContent'), () => _renderFeatures(overlay.querySelector('#gsContent'), activity, overlay));
    } else {
      _renderFeatures(overlay.querySelector('#gsContent'), activity, overlay);
    }
  }

  function _renderPinGate(host, onSuccess) {
    let entry = '';
    function dots() {
      return Array.from({length: 4}, (_, i) =>
        `<div style="width:14px;height:14px;border-radius:50%;background:${i < entry.length ? '#4ECDC4' : 'rgba(255,255,255,0.2)'};"></div>`
      ).join('');
    }
    function keypad() {
      const keys = [1,2,3,4,5,6,7,8,9,'',0,'⌫'];
      return keys.map(k => {
        if (k === '') return '<div></div>';
        return `<button class="gs-key" data-k="${k}" style="aspect-ratio:1;border-radius:50%;font-size:22px;font-weight:900;color:white;background:rgba(255,255,255,0.1);border:2px solid rgba(255,255,255,0.2);cursor:pointer;">${k}</button>`;
      }).join('');
    }
    function render() {
      host.innerHTML = `
        <h2 style="margin:0 0 8px;">⚙️ Game Settings</h2>
        <div style="color:rgba(255,255,255,0.6);font-size:14px;margin-bottom:14px;">Enter 4-digit PIN</div>
        <div id="gsDots" style="display:flex;gap:10px;justify-content:center;margin:10px 0 14px;">${dots()}</div>
        <div id="gsMsg" style="color:#FF6B6B;font-size:13px;text-align:center;min-height:18px;margin-bottom:8px;"></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;max-width:240px;margin:0 auto;">${keypad()}</div>
        <button id="gsClose" style="margin-top:14px;width:100%;padding:12px;border-radius:12px;background:rgba(255,255,255,0.1);color:white;border:2px solid rgba(255,255,255,0.2);font-weight:800;cursor:pointer;">Cancel</button>
      `;
      host.querySelectorAll('.gs-key').forEach(b => {
        b.onclick = async () => {
          const k = b.dataset.k;
          if (k === '⌫') entry = entry.slice(0, -1);
          else if (entry.length < 4) entry += k;
          host.querySelector('#gsDots').innerHTML = dots();
          if (entry.length === 4) {
            const ok = await _checkPin(entry);
            if (ok) onSuccess();
            else {
              host.querySelector('#gsMsg').textContent = 'Wrong PIN';
              entry = '';
              setTimeout(() => host.querySelector('#gsDots').innerHTML = dots(), 200);
            }
          }
        };
      });
      host.querySelector('#gsClose').onclick = () => document.getElementById('gameSettingsOverlay')?.remove();
    }
    render();
  }

  async function _checkPin(entry) {
    const stored = localStorage.getItem(PIN_KEY);
    if (!stored) return true;
    try {
      const obj = JSON.parse(stored);
      if (obj.hash && obj.salt) {
        const hash = await _sha256Hex(obj.salt + ':' + entry);
        return hash === obj.hash;
      }
    } catch {}
    // Legacy plain-text PIN
    return stored === entry;
  }

  function _renderFeatures(host, activity, overlay) {
    const profiles = (typeof getProfiles === 'function') ? getProfiles() : [];
    if (!profiles.length) {
      host.innerHTML = `<h2>⚙️ ${activity.name}</h2><div style="color:rgba(255,255,255,0.6);margin:14px 0;">No child profiles yet.</div>
        <button id="gsClose" style="width:100%;padding:12px;border-radius:12px;background:#4ECDC4;color:#1a1a2e;border:none;font-weight:800;cursor:pointer;">Close</button>`;
      host.querySelector('#gsClose').onclick = () => overlay.remove();
      return;
    }
    let html = `<h2 style="margin:0 0 6px;">⚙️ ${activity.name} Settings</h2>
      <div style="color:rgba(255,255,255,0.55);font-size:13px;margin-bottom:14px;">Toggle features per child. Changes save instantly.</div>`;
    profiles.forEach(p => {
      html += `<div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:14px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="font-size:22px;">${p.avatar || '🐾'}</span>
          <span style="font-weight:800;">${p.name}</span>
        </div>`;
      activity.features.forEach(f => {
        const on = !!(p.features && p.features[activity.id] && p.features[activity.id][f.key]);
        html += `<label style="display:flex;align-items:center;gap:10px;padding:6px 0;cursor:pointer;">
          <input type="checkbox" data-pid="${p.id}" data-fk="${f.key}" ${on ? 'checked' : ''}
                 style="width:20px;height:20px;accent-color:#4ECDC4;cursor:pointer;">
          <span style="font-size:14px;color:rgba(255,255,255,0.85);">${f.label}</span>
        </label>`;
      });
      html += `</div>`;
    });
    html += `<button id="gsClose" style="width:100%;padding:14px;border-radius:12px;background:#4ECDC4;color:#1a1a2e;border:none;font-weight:800;font-size:16px;cursor:pointer;margin-top:8px;">Done</button>`;
    host.innerHTML = html;
    host.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (typeof setProfileFeature === 'function') {
          setProfileFeature(cb.dataset.pid, activity.id, cb.dataset.fk, cb.checked);
        }
      });
    });
    host.querySelector('#gsClose').onclick = () => {
      overlay.remove();
      // Force reload so the activity picks up the new settings
      location.reload();
    };
  }

  window.gameSettings = { attach };
})();
