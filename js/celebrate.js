/* js/celebrate.js — compact, non-interrupting award notices.

   Progress and the gallery remain the source of truth. Automatic notices are
   deliberately small, batch nearby unlocks, never speak, never focus
   themselves, and observe a cooldown between separate appearances. */
(function () {
  'use strict';

  var glintEl = null;
  var noticeEl = null;
  var visibleDefs = [];
  var queuedDefs = [];
  var hideTimer = null;
  var cooldownTimer = null;
  var lastShownAt = 0;
  var NOTICE_MS = 2600;
  var COOLDOWN_MS = 5000;

  function ensureGlint() {
    if (glintEl && glintEl.isConnected) return glintEl;
    glintEl = document.createElement('div');
    glintEl.className = 'vb-glint';
    glintEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(glintEl);
    return glintEl;
  }

  function glint() {
    var el = ensureGlint();
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
    // Visual only. Award audio must never compete with an instruction.
  }

  function mergeDefs(current, incoming) {
    var merged = current.slice();
    (incoming || []).forEach(function (def) {
      var key = def && (def.id || [def.title, def.type, def.tier].join('|'));
      var at = merged.findIndex(function (item) {
        return (item && (item.id || [item.title, item.type, item.tier].join('|'))) === key;
      });
      if (at === -1) merged.push(def);
      else if ((def.count || 0) >= (merged[at].count || 0)) merged[at] = def;
    });
    return merged;
  }

  function bestDef(defs) {
    var weight = { repeat: 0, first: 1, milestone: 2, streak: 2, rank: 3, mastery: 4 };
    return defs.reduce(function (best, def) {
      return !best || (weight[def.type] || 1) > (weight[best.type] || 1) ? def : best;
    }, null);
  }

  function renderNotice() {
    if (!noticeEl) {
      noticeEl = document.createElement('div');
      noticeEl.className = 'vb-celebrate';
      noticeEl.tabIndex = -1;
      noticeEl.setAttribute('aria-hidden', 'true');
      noticeEl.addEventListener('click', function () { dismiss(true); });
      document.body.appendChild(noticeEl);
    }

    noticeEl.replaceChildren();
    var lead = bestDef(visibleDefs);
    var ribbon = (lead && typeof renderRibbon === 'function')
      ? renderRibbon(lead, { size: 68, count: lead.count })
      : document.createElement('div');
    ribbon.classList.add('cele-ribbon');
    noticeEl.appendChild(ribbon);

    var copy = document.createElement('div');
    copy.className = 'cele-copy';
    var title = document.createElement('div');
    title.className = 'cele-title';
    title.textContent = visibleDefs.length === 1
      ? (lead.title || 'New ribbon!')
      : visibleDefs.length + ' ribbons earned!';
    copy.appendChild(title);
    var hint = document.createElement('div');
    hint.className = 'cele-hint';
    hint.textContent = 'Saved in your gallery';
    copy.appendChild(hint);
    noticeEl.appendChild(copy);

    requestAnimationFrame(function () {
      if (noticeEl) noticeEl.classList.add('in');
    });
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { dismiss(false); }, NOTICE_MS);
  }

  function begin(defs) {
    visibleDefs = mergeDefs([], defs);
    if (!visibleDefs.length) return;
    lastShownAt = Date.now();
    renderNotice();
  }

  function armCooldown() {
    if (!queuedDefs.length || cooldownTimer) return;
    var wait = Math.max(0, COOLDOWN_MS - (Date.now() - lastShownAt));
    cooldownTimer = setTimeout(function () {
      cooldownTimer = null;
      if (noticeEl || !queuedDefs.length) return;
      var batch = queuedDefs;
      queuedDefs = [];
      begin(batch);
    }, wait);
  }

  function dismiss(instant) {
    if (!noticeEl) return;
    var old = noticeEl;
    noticeEl = null;
    visibleDefs = [];
    clearTimeout(hideTimer);
    hideTimer = null;
    if (instant) old.remove();
    else {
      old.classList.remove('in');
      setTimeout(function () { old.remove(); }, 180);
    }
    armCooldown();
  }

  function show(defs) {
    if (!defs || !defs.length) return;
    if (noticeEl) {
      visibleDefs = mergeDefs(visibleDefs, defs);
      renderNotice();
      return;
    }
    if (lastShownAt && Date.now() - lastShownAt < COOLDOWN_MS) {
      queuedDefs = mergeDefs(queuedDefs, defs);
      armCooldown();
      return;
    }
    begin(defs);
  }

  function clear() {
    clearTimeout(hideTimer);
    clearTimeout(cooldownTimer);
    hideTimer = cooldownTimer = null;
    queuedDefs = visibleDefs = [];
    if (noticeEl) noticeEl.remove();
    if (glintEl) glintEl.remove();
    noticeEl = glintEl = null;
  }

  window.addEventListener('pagehide', clear);
  window.vbCelebrate = { show: show, glint: glint, clear: clear };
})();
