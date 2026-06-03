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
    shelf.onclick = function () {
      if (typeof playChime === 'function') { try { playChime(); } catch (e) {} }
      if (typeof goTo === 'function') goTo(base + 'achievements.html');
      else location.href = base + 'achievements.html';
    };

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
      row.appendChild(renderRibbon(def, { size: 60, earned: true, base: base, noTopper: true }));
    });
    shelf.appendChild(row);
    addButton();
    container.appendChild(shelf);
    return shelf;
  }

  window.vbShelf = { mount: mount };
})();
