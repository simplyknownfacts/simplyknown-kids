/* js/ribbon.js — image-based ribbon renderer (Gemini assets).
   renderRibbon(def, opts) -> HTMLElement.
     def  : achievement definition { id, type, tier, activity, title, ... }
     opts : { size=120, earned=true, base, hat }
   Color comes from the def's tier/type; topper is 1/2/3 floating stars for the
   top three ranks (Champion/Hero/Legend) and a stable-random hat for everything
   else. Motion + locked greyscale live in css/achievements.css. */
(function () {
  'use strict';

  // hats available for the random pool (star is reserved for top ranks)
  var HAT_POOL = ['astronaut','beanie','bow','bunnyears','cap','catears','chef','cowboy',
    'crown','firefighter','flowercrown','graduation','halo','jester','kingcrown','party',
    'pirate','propeller','queencrown','sailor','santa','sombrero','tiara','tiaraheart',
    'tophat','unicorn','viking','witch','wizard'];

  // hat width as a fraction of ribbon width (wide hats need more room)
  var HATW = { sombrero:0.94, pirate:0.86, cowboy:0.82, firefighter:0.78, viking:0.80,
    flowercrown:0.80, santa:0.80, kingcrown:0.72, queencrown:0.70, crown:0.70, jester:0.76,
    tiara:0.74, tiaraheart:0.72, halo:0.68, bunnyears:0.62, catears:0.68, cap:0.66,
    unicorn:0.60, wizard:0.62, witch:0.68, graduation:0.76, propeller:0.64, astronaut:0.66,
    beanie:0.54, bow:0.60, party:0.50, tophat:0.52, chef:0.60, sailor:0.64 };

  function base(opts) {
    if (opts && opts.base != null) return opts.base;
    return (typeof window !== 'undefined' && window.VB_ASSET_BASE) || '';
  }

  function colorName(def) {
    if (def.type === 'milestone') return def.tier;
    if (def.type === 'first')     return 'green';
    if (def.type === 'mastery')   return 'pink';
    if (def.type === 'streak')    return 'orange';
    if (def.type === 'rank')      return 'purple';
    return 'gold';
  }

  function hash(s) {
    s = String(s); var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  // Champion/Hero/Legend -> 1/2/3 stars; other ranks + all else -> 0 (random hat)
  function starCount(def) {
    if (def.type !== 'rank') return 0;
    return { 'rank.champion':1, 'rank.hero':2, 'rank.legend':3 }[def.id] || 0;
  }

  function hatFor(def) { return HAT_POOL[hash(def.id || def.title) % HAT_POOL.length]; }

  function renderRibbon(def, opts) {
    opts = opts || {};
    var size = opts.size || 120;
    var earned = opts.earned !== false;
    var b = base(opts);
    var color = colorName(def);
    var stars = starCount(def);
    var rnd = hash(def.id || def.title || 'x');

    var wrap = document.createElement('div');
    wrap.className = 'vb-ribbon' + (earned ? '' : ' locked');
    wrap.style.width = size + 'px';
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', (earned ? 'Earned ribbon: ' : 'Locked ribbon: ') + (def.title || def.id));

    var fl = document.createElement('div');
    fl.className = 'vb-rib-float';
    fl.style.setProperty('--d', (3.8 + (rnd % 22) / 10).toFixed(2) + 's');
    fl.style.setProperty('--dl', (-((rnd % 30) / 10)).toFixed(2) + 's');

    var body = document.createElement('img');
    body.className = 'vb-rib-body';
    body.src = b + 'assets/ribbons/' + color + '.png';
    body.alt = '';
    fl.appendChild(body);

    if (!opts.noTopper && stars > 0) {
      var sc = document.createElement('div');
      sc.className = 'vb-rib-stars';
      sc.style.setProperty('--d', (3.0 + (rnd % 18) / 10).toFixed(2) + 's');
      for (var k = 0; k < stars; k++) {
        var si = document.createElement('img');
        // Hat/topper PNGs are optional — degrade gracefully if missing (attach
        // onerror BEFORE src so a cached 404 still triggers the hide).
        si.onerror = function () { this.style.display = 'none'; };
        si.alt = '';
        var sw = (stars === 3 && k === 1) ? size * 0.34 : size * 0.26;
        si.style.width = Math.round(sw) + 'px';
        if (stars === 3 && k === 1) si.className = 'mid';
        si.src = b + 'assets/hats/star.png';
        sc.appendChild(si);
      }
      fl.appendChild(sc);
    } else if (!opts.noTopper) {
      var hat = opts.hat || hatFor(def);
      var ha = document.createElement('span');
      ha.className = 'vb-rib-hat';
      var hi = document.createElement('img');
      // Hat PNGs are optional — degrade gracefully (hide) if the asset is missing.
      // Attach onerror BEFORE setting src so a cached 404 still triggers the hide.
      hi.onerror = function () { this.style.display = 'none'; };
      hi.alt = '';
      hi.style.setProperty('--hw', Math.round(size * (HATW[hat] || 0.62)) + 'px');
      hi.style.setProperty('--anim', ['hatSpin','hatBounce','hatWobble','hatPop'][rnd % 4]);
      hi.style.setProperty('--hd', (2.8 + (rnd % 26) / 10).toFixed(2) + 's');
      hi.style.setProperty('--hdl', (-((rnd % 20) / 10)).toFixed(2) + 's');
      hi.src = b + 'assets/hats/' + hat + '.png';
      ha.appendChild(hi);
      fl.appendChild(ha);
    }

    wrap.appendChild(fl);
    return wrap;
  }

  window.renderRibbon = renderRibbon;
  window.vbRibbonColorName = colorName;
})();
