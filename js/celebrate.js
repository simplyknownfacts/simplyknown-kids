/* js/celebrate.js — window.vbCelebrate.show(def[]). Queues, never blocks.
   Depends on ribbon.js (renderRibbon) and app.js (speak, playSuccess) when present. */
(function () {
  'use strict';
  var queue = [], busy = false;

  function show(defs) {
    if (!defs) return;
    if (!Array.isArray(defs)) defs = [defs];
    defs.forEach(function (d) { queue.push(d); });
    if (!busy) next();
  }

  function next() {
    if (!queue.length) { busy = false; return; }
    busy = true;
    var def = queue.shift();

    var overlay = document.createElement('div');
    overlay.className = 'vb-celebrate';

    var ribbon = (typeof renderRibbon === 'function')
      ? renderRibbon(def, { size: 150 })
      : document.createElement('div');
    ribbon.classList.add('cele-ribbon');
    overlay.appendChild(ribbon);

    var title = document.createElement('div');
    title.className = 'cele-title';
    title.textContent = def.title || 'New ribbon!';
    overlay.appendChild(title);

    document.body.appendChild(overlay);
    if (typeof playSuccess === 'function') { try { playSuccess(); } catch (e) {} }
    if (typeof speak === 'function') { try { speak('You earned ' + (def.title || 'a ribbon') + '!'); } catch (e) {} }

    var dwell = 2000;
    setTimeout(function () {
      overlay.style.transition = 'opacity 300ms ease';
      overlay.style.opacity = '0';
      setTimeout(function () { overlay.remove(); next(); }, 320);
    }, dwell);
  }

  window.vbCelebrate = { show: show };
})();
