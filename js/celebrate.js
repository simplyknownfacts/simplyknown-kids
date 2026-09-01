/* js/celebrate.js — window.vbCelebrate.{glint, show}
   Trophy Joy rework (2026-08-31 spec, approved by master).

   Two distinct signals, never confused with each other:
     glint(def)   — fired the INSTANT an award unlocks, even mid-play. Non-
                    blocking (pointer-events:none), no sound louder than a
                    soft chime, no speech. Safe to fire constantly.
     show(defs)   — the big celebration. Only ever called by progress.js at
                    an actual pause point (round idle, leaving the activity,
                    or the next page load), never mid-interaction. Captures
                    taps ON PURPOSE — it only appears when play has already
                    paused, so a tap-to-dismiss escape hatch is meaningful
                    rather than something to route around.
   progress.js owns WHEN these fire (the pause-point logic). This file only
   owns WHAT they look like. */
(function () {
  'use strict';

  // ---- corner glint --------------------------------------------------
  var glintEl = null;
  function ensureGlint() {
    if (glintEl) return glintEl;
    glintEl = document.createElement('div');
    glintEl.className = 'vb-glint';
    glintEl.setAttribute('aria-hidden', 'true'); // decorative; the real award is announced at show()
    document.body.appendChild(glintEl);
    return glintEl;
  }
  function glint() {
    var el = ensureGlint();
    el.classList.remove('pulse'); // restart the animation if it's still mid-pulse
    void el.offsetWidth;          // force reflow so the removed class re-applies
    el.classList.add('pulse');
    if (typeof playChime === 'function') { try { playChime(); } catch (e) {} }
  }

  // ---- rarity → visual weight ----------------------------------------
  // Same ladder achievement-defs.js already defines. 'small' covers the
  // repeatable star; everything else scales up from there. A batch's weight
  // is its single HIGHEST member — one diamond among three stars still gets
  // the diamond treatment, because that's the moment worth noticing.
  var TIER_WEIGHT = { small: 0, bronze: 1, silver: 1, gold: 2, sapphire: 3, ruby: 3, diamond: 4, mastery: 4 };
  function weightOf(def) {
    if (def.type === 'repeat') return TIER_WEIGHT.small;
    if (def.type === 'milestone') return TIER_WEIGHT[def.tier] != null ? TIER_WEIGHT[def.tier] : 1;
    if (def.type === 'mastery') return TIER_WEIGHT.mastery;
    return 1; // first-play, streak, rank — a plain "worth noticing" beat
  }
  var WEIGHT_CLASS = ['w-small', 'w-mid', 'w-mid', 'w-big', 'w-big'];

  // A handful of interchangeable phrasings per weight band, so five diamonds
  // in a row don't play frame-identical. Picked at random per celebration,
  // not per award — the WHOLE batch gets one framing.
  var PHRASES = {
    small: ["Nice one!", "Keep going!", "You're doing great!"],
    mid:   ["Great job!", "You earned it!", "Way to go!"],
    big:   ["Amazing!", "You did it!", "Wow, incredible!"],
  };
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function isBigKid() {
    try {
      var p = (typeof getActiveProfile === 'function') ? getActiveProfile() : null;
      return !!(p && typeof tierForAge === 'function' && tierForAge(getAgeMonths(p.birthday)) >= 9);
    } catch (e) { return false; }
  }

  // ---- the big celebration -------------------------------------------
  function show(defs) {
    if (!defs || !defs.length) return;
    // Never stack. The batching in progress.js means real gameplay should
    // only ever produce one call to show() per pause point, but a demo page
    // (or any future caller) firing two in quick succession must not leave a
    // stale overlay sitting behind the new one -- confusing at best, and it
    // was mistaken for "nothing changed" when a stale small-tier overlay was
    // still on screen under a new tier's button.
    document.querySelectorAll('.vb-celebrate').forEach(function (el) { el.remove(); });

    var weight = Math.max.apply(null, defs.map(weightOf));
    var band = weight >= 3 ? 'big' : (weight >= 2 ? 'mid' : 'small');

    var overlay = document.createElement('div');
    overlay.className = 'vb-celebrate vb-celebrate--' + WEIGHT_CLASS[weight]
      + (isBigKid() ? ' vb-celebrate--bigkid' : '');
    overlay.setAttribute('role', 'button');
    overlay.setAttribute('aria-label', 'Dismiss celebration');
    overlay.tabIndex = 0;

    var stack = document.createElement('div');
    stack.className = 'cele-stack';
    var shown = defs.slice(0, 3);
    shown.forEach(function (d) {
      var r = (typeof renderRibbon === 'function')
        ? renderRibbon(d, { size: weight >= 3 ? 96 : 72, count: d.count })
        : document.createElement('div');
      r.classList.add('cele-ribbon');
      stack.appendChild(r);
    });
    overlay.appendChild(stack);

    if (defs.length > 3) {
      var more = document.createElement('div');
      more.className = 'cele-more';
      more.textContent = '+' + (defs.length - 3) + ' more';
      overlay.appendChild(more);
    }

    var title = document.createElement('div');
    title.className = 'cele-title';
    title.textContent = defs.length === 1
      ? (defs[0].title || 'New ribbon!')
      : defs.length + ' ribbons earned!';
    overlay.appendChild(title);

    // Existing mascot art only — no new celebrate clip (parked per master's
    // no-spend-on-animation ruling). A profile's own mascot icon, already a
    // real asset, stood in as the "someone is celebrating with you" visual.
    try {
      var prof = (typeof getActiveProfile === 'function') ? getActiveProfile() : null;
      var label = prof && prof.mascot && window.mascot && mascot.labels[prof.mascot];
      if (label) {
        var icon = document.createElement('div');
        icon.className = 'cele-mascot';
        icon.textContent = label.split(' ')[0]; // the emoji half of "🐶 Dog"
        icon.setAttribute('aria-hidden', 'true');
        overlay.insertBefore(icon, overlay.firstChild);
      }
    } catch (e) {}

    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('in'); });

    if (typeof playSuccess === 'function') { try { playSuccess(); } catch (e) {} }
    // speak() (js/app.js) already handles the big-kid rule itself: it always
    // shows the caption, and only skips the spoken clip for tier 9+. Nothing
    // extra to branch on here.
    if (typeof speak === 'function') { try { speak(pick(PHRASES[band])); } catch (e) {} }

    var dismissed = false;
    function dismiss(instant) {
      if (dismissed) return;
      dismissed = true;
      if (instant) {
        overlay.remove(); // no fade — back in play in one frame, not a transition
      } else {
        overlay.classList.remove('in');
        setTimeout(function () { overlay.remove(); }, 260);
      }
    }
    overlay.addEventListener('click', function () { dismiss(true); });
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dismiss(true); }
    });

    // Auto-dismiss dwell: a base plus a small per-extra-item bump, capped —
    // a burst of 5 shouldn't just keep growing the wait.
    var dwell = (weight >= 3 ? 2200 : (weight >= 2 ? 1700 : 1300))
              + Math.min(defs.length - 1, 4) * 150;
    setTimeout(function () { dismiss(false); }, dwell);
  }

  window.vbCelebrate = { show: show, glint: glint };
})();
