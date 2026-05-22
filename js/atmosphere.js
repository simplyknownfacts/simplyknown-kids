/* ============================================================
   atmosphere.js — time-of-day sky + ambient SVG layer.
   ------------------------------------------------------------
   Runs once per page load. Picks morning/afternoon/evening/night
   from the local clock, stamps <html data-tod="..."> for CSS,
   and injects a fixed <div id="vbSky"> with the appropriate
   illustration (sun/moon, stars/fireflies, paper hills, etc).

   No dependencies. Safe to include on every page.
   ============================================================ */
(function () {
  'use strict';

  function pickTOD(now) {
    var h = (now || new Date()).getHours();
    if (h >= 5  && h < 10) return 'morning';
    if (h >= 10 && h < 17) return 'afternoon';
    if (h >= 17 && h < 20) return 'evening';
    return 'night';
  }

  // Seeded RNG so star/firefly positions are stable across renders
  function rng(seed) {
    var s = seed | 0;
    return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }

  function el(tag, attrs, children) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (children) for (var i = 0; i < children.length; i++) n.appendChild(children[i]);
    return n;
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ---------- Layers ----------

  function makeSkyGradient(svg, defs, tod) {
    var grad = el('radialGradient', { id: 'vbSkyGrad', cx: '50%', cy: '0%', r: '120%', fx: '50%', fy: '0%' });
    grad.appendChild(el('stop', { offset: '0%',  'stop-color': cssVar('--bg-2') }));
    grad.appendChild(el('stop', { offset: '45%', 'stop-color': cssVar('--bg-1') }));
    grad.appendChild(el('stop', { offset: '100%','stop-color': cssVar('--bg-0') }));
    defs.appendChild(grad);
    svg.appendChild(el('rect', { x: 0, y: 0, width: '100%', height: '100%', fill: 'url(#vbSkyGrad)' }));
  }

  function makeStars(svg, defs, count) {
    var r = rng(7);
    var g = el('g', { 'pointer-events': 'none' });
    for (var i = 0; i < count; i++) {
      var cx = r() * 100, cy = r() * 60;
      var rad = r() * 1.4 + 0.3;
      var op = (r() * 0.7 + 0.25).toFixed(2);
      var dur = (2 + r() * 3).toFixed(2);
      var delay = (r() * 4).toFixed(2);
      var c = el('circle', {
        cx: cx + '%', cy: cy + '%', r: rad,
        fill: cssVar('--star'),
        opacity: op,
        style: 'animation: vbTwinkle ' + dur + 's ease-in-out ' + delay + 's infinite'
      });
      g.appendChild(c);
    }
    // Sparkle stars (slightly larger 4-point)
    var bigs = [[18,16],[78,11],[60,27],[28,35],[88,32]];
    for (var j = 0; j < bigs.length; j++) {
      var x = bigs[j][0], y = bigs[j][1];
      var p = el('path', {
        d: 'M0 -8 L1.6 -1.6 L8 0 L1.6 1.6 L0 8 L-1.6 1.6 L-8 0 L-1.6 -1.6 Z',
        fill: cssVar('--orb-color'),
        transform: 'translate(0,0)',
        opacity: 0.85
      });
      // Wrap in g for percentage translate
      var wrap = el('g', { transform: '' });
      wrap.setAttribute('style', '');
      wrap.appendChild(p);
      // Convert % to absolute when rendering — use CSS positioning via x/y attrs
      p.setAttribute('transform', 'translate(' + (x * window.innerWidth / 100) + ' ' + (y * window.innerHeight / 100) + ')');
      g.appendChild(p);
    }
    svg.appendChild(g);
  }

  function makeMoon(svg, defs) {
    var x = window.innerWidth * 0.78;
    var y = window.innerHeight * 0.18;
    var r = Math.min(70, window.innerWidth * 0.07);
    var glow = el('radialGradient', { id: 'vbMoonGlow', cx: '50%', cy: '50%', r: '50%' });
    glow.appendChild(el('stop', { offset: '0%',  'stop-color': cssVar('--orb-color'), 'stop-opacity': 0.55 }));
    glow.appendChild(el('stop', { offset: '55%', 'stop-color': cssVar('--orb-color'), 'stop-opacity': 0.12 }));
    glow.appendChild(el('stop', { offset: '100%','stop-color': cssVar('--orb-color'), 'stop-opacity': 0 }));
    defs.appendChild(glow);
    var mask = el('mask', { id: 'vbMoonMask' });
    mask.appendChild(el('rect', { width: '100%', height: '100%', fill: 'black' }));
    mask.appendChild(el('circle', { cx: x, cy: y, r: r, fill: 'white' }));
    mask.appendChild(el('circle', { cx: x + r * 0.42, cy: y - r * 0.12, r: r * 0.92, fill: 'black' }));
    defs.appendChild(mask);
    svg.appendChild(el('circle', { cx: x, cy: y, r: r * 2.6, fill: 'url(#vbMoonGlow)' }));
    var g = el('g', { mask: 'url(#vbMoonMask)' });
    g.appendChild(el('circle', { cx: x, cy: y, r: r, fill: cssVar('--orb-color') }));
    svg.appendChild(g);
  }

  function makeSun(svg, defs, lowOnHorizon) {
    var x = window.innerWidth * (lowOnHorizon ? 0.82 : 0.78);
    var y = window.innerHeight * (lowOnHorizon ? 0.48 : 0.20);
    var r = Math.min(85, window.innerWidth * 0.085);
    var glow = el('radialGradient', { id: 'vbSunGlow', cx: '50%', cy: '50%', r: '50%' });
    glow.appendChild(el('stop', { offset: '0%',  'stop-color': cssVar('--orb-color'), 'stop-opacity': 0.95 }));
    glow.appendChild(el('stop', { offset: '35%', 'stop-color': cssVar('--orb-rim'),   'stop-opacity': 0.55 }));
    glow.appendChild(el('stop', { offset: '70%', 'stop-color': cssVar('--orb-rim'),   'stop-opacity': 0.15 }));
    glow.appendChild(el('stop', { offset: '100%','stop-color': cssVar('--orb-rim'),   'stop-opacity': 0 }));
    defs.appendChild(glow);
    var core = el('radialGradient', { id: 'vbSunCore', cx: '40%', cy: '40%', r: '60%' });
    core.appendChild(el('stop', { offset: '0%',  'stop-color': '#FFFDF0' }));
    core.appendChild(el('stop', { offset: '60%', 'stop-color': cssVar('--orb-color') }));
    core.appendChild(el('stop', { offset: '100%','stop-color': cssVar('--orb-rim') }));
    defs.appendChild(core);
    svg.appendChild(el('circle', { cx: x, cy: y, r: r * 3.5, fill: 'url(#vbSunGlow)' }));
    svg.appendChild(el('circle', { cx: x, cy: y, r: r, fill: 'url(#vbSunCore)' }));
  }

  function makeHills(svg, defs) {
    // Three layers of paper-cut hills sitting at the bottom.
    var W = window.innerWidth, H = window.innerHeight;
    function path(dPercent, fill, yOffset) {
      // dPercent uses percentages of viewport for a responsive curve
      var p = el('path', { d: dPercent.replace(/Y\(([\d.]+)\)/g, function(_, n) { return (H * +n).toFixed(1); }).replace(/X\(([\d.]+)\)/g, function(_, n) { return (W * +n).toFixed(1); }), fill: fill });
      return p;
    }
    // Far hill
    svg.appendChild(path(
      'M X(0) Y(0.74) C X(0.18) Y(0.66) X(0.34) Y(0.72) X(0.50) Y(0.68) S X(0.80) Y(0.62) X(1) Y(0.70) L X(1) Y(1) L X(0) Y(1) Z',
      cssVar('--hill-2')
    ));
    // Mid hill
    svg.appendChild(path(
      'M X(0) Y(0.84) C X(0.22) Y(0.78) X(0.42) Y(0.86) X(0.66) Y(0.82) S X(0.94) Y(0.80) X(1) Y(0.84) L X(1) Y(1) L X(0) Y(1) Z',
      cssVar('--hill-1')
    ));
    // Front hill
    svg.appendChild(path(
      'M X(0) Y(0.92) C X(0.26) Y(0.88) X(0.48) Y(0.95) X(0.72) Y(0.92) S X(1) Y(0.90) X(1) Y(0.93) L X(1) Y(1) L X(0) Y(1) Z',
      cssVar('--hill-0')
    ));
  }

  function makeFireflies(svg, defs) {
    var r = rng(13);
    var grad = el('radialGradient', { id: 'vbFlyGlow', cx: '50%', cy: '50%', r: '50%' });
    grad.appendChild(el('stop', { offset: '0%',  'stop-color': cssVar('--accent'), 'stop-opacity': 1 }));
    grad.appendChild(el('stop', { offset: '50%', 'stop-color': cssVar('--accent'), 'stop-opacity': 0.45 }));
    grad.appendChild(el('stop', { offset: '100%','stop-color': cssVar('--accent'), 'stop-opacity': 0 }));
    defs.appendChild(grad);
    var g = el('g', { 'pointer-events': 'none' });
    var W = window.innerWidth, H = window.innerHeight;
    for (var i = 0; i < 14; i++) {
      var x = r() * W;
      var y = H * 0.35 + r() * H * 0.45;
      var rad = 2 + r() * 1.4;
      var delay = (r() * 5).toFixed(2);
      var dur = (3 + r() * 3).toFixed(2);
      var wrap = el('g', { style: 'animation: vbDrift' + (i % 3) + ' ' + (parseFloat(dur)+4) + 's ease-in-out ' + delay + 's infinite; transform-origin: ' + x + 'px ' + y + 'px;' });
      wrap.appendChild(el('circle', { cx: x, cy: y, r: rad * 4, fill: 'url(#vbFlyGlow)', opacity: 0.6 }));
      wrap.appendChild(el('circle', {
        cx: x, cy: y, r: rad, fill: cssVar('--accent-soft'),
        style: 'animation: vbTwinkle ' + dur + 's ease-in-out ' + delay + 's infinite'
      }));
      g.appendChild(wrap);
    }
    svg.appendChild(g);
  }

  function makeClouds(svg, defs, count) {
    var r = rng(11);
    var blurFilter = el('filter', { id: 'vbCloudBlur' });
    blurFilter.appendChild(el('feGaussianBlur', { stdDeviation: 1.5 }));
    defs.appendChild(blurFilter);
    var W = window.innerWidth, H = window.innerHeight;
    var fill = '#FFFFFF';
    for (var i = 0; i < count; i++) {
      var x = r() * W;
      var y = 60 + r() * (H * 0.4);
      var w = 140 + r() * 160;
      var h = 40 + r() * 18;
      var delay = (r() * 12).toFixed(2);
      var dur = (30 + r() * 30).toFixed(2);
      var op = (0.55 + r() * 0.35).toFixed(2);
      var g = el('g', {
        opacity: op,
        style: 'animation: vbDrift' + (i % 3) + ' ' + dur + 's ease-in-out ' + delay + 's infinite; transform-origin: ' + x + 'px ' + y + 'px;'
      });
      g.appendChild(el('ellipse', { cx: x,             cy: y,            rx: w * 0.5,  ry: h * 0.7,  fill: fill, filter: 'url(#vbCloudBlur)' }));
      g.appendChild(el('ellipse', { cx: x - w * 0.25,  cy: y + h * 0.15, rx: w * 0.32, ry: h * 0.5,  fill: fill, filter: 'url(#vbCloudBlur)' }));
      g.appendChild(el('ellipse', { cx: x + w * 0.25,  cy: y + h * 0.10, rx: w * 0.30, ry: h * 0.55, fill: fill, filter: 'url(#vbCloudBlur)' }));
      g.appendChild(el('ellipse', { cx: x - w * 0.05,  cy: y - h * 0.25, rx: w * 0.28, ry: h * 0.50, fill: fill, filter: 'url(#vbCloudBlur)' }));
      svg.appendChild(g);
    }
  }

  // ---------- Mount ----------

  function mount() {
    // Stamp data-tod on <html> so CSS variables resolve correctly
    var tod = pickTOD();
    document.documentElement.setAttribute('data-tod', tod);

    // Remove any previous sky
    var prev = document.getElementById('vbSky');
    if (prev) prev.remove();

    var sky = document.createElement('div');
    sky.id = 'vbSky';
    sky.setAttribute('aria-hidden', 'true');

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMax slice');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', '0 0 ' + window.innerWidth + ' ' + window.innerHeight);

    var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.appendChild(defs);

    // Base sky gradient
    makeSkyGradient(svg, defs, tod);

    // Stars only in dark themes
    if (tod === 'night') makeStars(svg, defs, 90);
    if (tod === 'evening') makeStars(svg, defs, 35);

    // Sun for day themes, low sun for evening
    if (tod === 'morning')   makeSun(svg, defs, false);
    if (tod === 'afternoon') makeSun(svg, defs, false);
    if (tod === 'evening')   makeSun(svg, defs, true);
    // Moon for night
    if (tod === 'night')     makeMoon(svg, defs);

    // Clouds for light themes
    if (tod === 'morning')   makeClouds(svg, defs, 4);
    if (tod === 'afternoon') makeClouds(svg, defs, 5);

    // Hills — every theme
    makeHills(svg, defs);

    // Fireflies for night + evening
    if (tod === 'night')   makeFireflies(svg, defs);
    if (tod === 'evening') makeFireflies(svg, defs);

    sky.appendChild(svg);
    document.body.appendChild(sky);
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  // Public API — pages don't need this but parent settings / a TOD override
  // panel can call window.vbAtmosphere.refresh(forcedTod) to repaint.
  window.vbAtmosphere = {
    refresh: function (forced) {
      if (forced) document.documentElement.setAttribute('data-tod-override', '1');
      var orig = pickTOD;
      if (forced) pickTOD = function () { return forced; };
      mount();
      pickTOD = orig;
    },
    pickTOD: pickTOD
  };

  // Mount on load
  onReady(mount);

  // Repaint on resize (debounced) so the SVG matches viewport
  var resizeT;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(mount, 250);
  });

  // Repaint when the tab comes back so the sky reflects the new clock time
  // (e.g. user opens the iPad at 8:01pm after using it earlier in the afternoon).
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      var newTod = pickTOD();
      if (newTod !== document.documentElement.getAttribute('data-tod')) mount();
    }
  });
})();
