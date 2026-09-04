/* js/shelf.js — window.vbShelf.mount(container, opts) renders a framed floating
   "trophy shelf" of the child's earned ribbons (rotating selection), tappable to
   open the full gallery.
   opts: { section:'all'|'games'|'learn'|'art', max=8, title='My Ribbons', base } */
(function () {
  'use strict';

  function earnedDefs(state, section) {
    if (!state || !window.vbDefs) return [];
    var out = [];
    for (var id in state.unlocked) {
      if (!state.unlocked.hasOwnProperty(id)) continue;
      var def = vbDefs.byId(id);
      if (!def) continue;
      if (section && section !== 'all' && def.section !== section) continue;
      out.push(def);
    }
    // repeatable ribbons live in state.repeats (not state.unlocked)
    if (state.repeats) {
      for (var act in state.repeats) {
        if (!state.repeats.hasOwnProperty(act) || !(state.repeats[act] > 0)) continue;
        var rdef = vbDefs.byId(act + '.repeat');
        if (!rdef) continue;
        if (section && section !== 'all' && rdef.section !== section) continue;
        out.push(rdef);
      }
    }
    return out;
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function mount(container, opts) {
    opts = opts || {};
    var base = (opts.base != null) ? opts.base : (window.VB_ASSET_BASE || '');
    var section = opts.section || 'all';
    var max = opts.max || 4;
    var state = (window.vbProgress && window.vbProgress.getState()) || null;
    var defs = earnedDefs(state, section);

    var shelf = document.createElement('div');
    shelf.className = 'vb-shelf';
    shelf.setAttribute('role', 'button');
    shelf.setAttribute('aria-label', 'Open my ribbons');
    // Codex 0825-15: role="button" on its own is not keyboard-operable -- a
    // div needs an explicit tabindex to be Tab-reachable at all, and even
    // then a real <button>'s native Enter/Space activation never fires on
    // its own for a div (same pattern already fixed in listen/index.html's
    // card tiles).
    shelf.tabIndex = 0;
    shelf.onclick = function () {
      if (typeof playChime === 'function') { try { playChime(); } catch (e) {} }
      if (typeof goTo === 'function') goTo(base + 'achievements.html');
      else location.href = base + 'achievements.html';
    };
    shelf.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); shelf.onclick(); }
    });

    if (opts.title !== false) {
      var t = document.createElement('div'); t.className = 'vb-shelf-title';
      t.textContent = opts.title || 'My Ribbons';
      shelf.appendChild(t);
    }

    function addButton() {
      var btn = document.createElement('button');
      btn.className = 'vb-shelf-btn';
      btn.textContent = '⭐ See all my ribbons!';
      btn.onclick = function (ev) { ev.stopPropagation(); shelf.onclick(); };
      shelf.appendChild(btn);
    }

    if (!defs.length) {
      var e = document.createElement('div'); e.className = 'vb-shelf-empty';
      e.textContent = '🎀 Play to earn ribbons!';
      shelf.appendChild(e);
      addButton();
      container.appendChild(shelf);
      return shelf;
    }

    var pick = shuffle(defs.slice()).slice(0, max);
    var row = document.createElement('div'); row.className = 'vb-shelf-row';
    pick.forEach(function (def) {
      var cnt = (def.type === 'repeat' && state.repeats) ? (state.repeats[def.activity] || 0) : 0;
      row.appendChild(renderRibbon(def, { size: 60, earned: true, base: base, noTopper: true, count: cnt }));
    });
    shelf.appendChild(row);
    addButton();
    container.appendChild(shelf);
    return shelf;
  }

  window.vbShelf = { mount: mount };
})();
