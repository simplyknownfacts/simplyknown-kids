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

  // ---- hero sizing -----------------------------------------------------
  // The ribbon art is real, generated for this app on purpose — nothing
  // about its own design changes here. What changes is how BIG it renders:
  // Scott's actual complaint was presentation size and impact ("just a
  // little star"), not the artwork. Sized off the SMALLER viewport
  // dimension so it can never overflow in either orientation; on a tablet
  // (~820px) the top tier fills most of the screen, exactly as asked.
  var HERO_VW  = [0.30, 0.40, 0.46, 0.56, 0.62];   // fraction of min(width,height), by weight 0-4
  var HERO_MAX = [180,  240,  280,  380,  460];    // px cap so a desktop monitor doesn't go absurd
  function heroSize(weight) {
    var vw = Math.min(window.innerWidth, window.innerHeight);
    return Math.round(Math.min(vw * HERO_VW[weight], HERO_MAX[weight]));
  }

  // ---- confetti ----------------------------------------------------------
  // Real particles, not just a glow — named explicitly in the spec and never
  // actually built until now. Count and spread scale with rarity so a burst
  // is visibly bigger for a diamond than for a star, cheap (CSS keyframes,
  // no image assets, no library).
  var CONFETTI_COLORS = ['#FFD93D', '#FF6B6B', '#4ECDC4', '#C79BF0', '#7FB2FF', '#93DC9E'];
  var CONFETTI_COUNT = [0, 10, 16, 24, 34]; // by weight 0-4 -- none for the quiet "star" tier
  function spawnConfetti(overlay, weight) {
    var n = CONFETTI_COUNT[weight];
    var spread = 90 + weight * 50; // px, how far pieces fly -- bigger for higher rarity
    for (var i = 0; i < n; i++) {
      var p = document.createElement('span');
      p.className = 'confetti-bit';
      // Computed here, not in CSS: a rotate() after a translateX() in one
      // transform doesn't point the translate in that direction (each
      // function transforms the space for the next one), so the angle has
      // to become real dx/dy pixel offsets before it reaches the stylesheet.
      var angle = Math.random() * Math.PI * 2;
      var dist = spread * (0.6 + Math.random() * 0.6);
      p.style.setProperty('--dx', Math.round(Math.cos(angle) * dist) + 'px');
      p.style.setProperty('--dy', Math.round(Math.sin(angle) * dist - dist * 0.35) + 'px'); // biased upward, gravity brings it down via the keyframe
      p.style.setProperty('--dur', (700 + Math.random() * 500 + weight * 80) + 'ms');
      p.style.setProperty('--delay', Math.round(Math.random() * 120) + 'ms');
      p.style.setProperty('--spin', (Math.random() < 0.5 ? '' : '-') + '540deg');
      p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      overlay.appendChild(p);
    }
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
    // A burst of several still gets ONE hero-sized lead ribbon (the highest-
    // weight member) so the moment reads as one big thing, not a lineup of
    // equally-sized cards — the rest sit smaller alongside it.
    var leadIdx = 0, leadWeight = -1;
    shown.forEach(function (d, i) { var w = weightOf(d); if (w > leadWeight) { leadWeight = w; leadIdx = i; } });
    shown.forEach(function (d, i) {
      var isLead = i === leadIdx;
      var r = (typeof renderRibbon === 'function')
        ? renderRibbon(d, { size: isLead ? heroSize(weight) : Math.round(heroSize(weight) * 0.4), count: d.count })
        : document.createElement('div');
      r.classList.add('cele-ribbon');
      if (isLead) r.classList.add('cele-ribbon--lead');
      stack.appendChild(r);
    });
    overlay.appendChild(stack);
    spawnConfetti(overlay, weight);

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

    // No mascot icon here (dropped, 2026-09-01): Scott's own words were
    // "we already have ribbons... generated specifically for this" — the
    // ribbon IS the joy centerpiece. A second icon competing for attention
    // next to a now hero-sized ribbon was never asked for and only dilutes
    // the one thing this fix is about making unmistakable.

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
