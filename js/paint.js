// js/paint.js — shared freeform paint engine for Color Splash + Color In.
// MS-Paint-lite: a brush canvas whose toolset GROWS with the kid's tier.
//   tier ≤3 : a few big colours, one fat brush (toddler finger-paint feel)
//   tier 4+ : eraser
//   tier 5+ : 3 brush sizes
//   tier 6+ : brush types (marker / crayon / spray) + Undo
//   all     : Clear
// Background is a DOM layer behind the paint canvas: plain paper for a blank
// canvas, or a coloring-page (inline SVG / line-art image) for Color In. Clear
// wipes only the paint layer, so a coloring page stays put to colour again.
//
// Usage:  vbPaint.mount({ tier, pages, onStroke })
//   pages: [{ name, svg?, src? }]  — svg = inline SVG markup, src = image URL,
//          neither = a blank page. Omit `pages` entirely for a plain canvas.
//
// Security (audit 2026-06-10, finding 2): `svg` and `src` are treated as
// UNTRUSTED even though today's only callers (color-in.html's built-in scenes,
// and the family's own uploaded photos) are not attacker-controlled — this is a
// shared, reusable engine, and `vb_coloring_pages` is browser storage a future
// caller, a compromised sync payload, or plain tampering could put anything
// into. `<svg onload="...">` fires even when inserted via innerHTML (unlike
// <script>), so handing a page's svg string straight to the background layer's
// innerHTML, unsanitized, was a real hole. See sanitizeSvgMarkup() and
// setPage() below.
(function () {
  'use strict';

  const PALETTE = ['#FF4444','#FFD93D','#4ECDC4','#45B7D1','#a86cdb','#FF9F43',
                   '#FF69B4','#7bed9f','#8B5A2B','#2b2b33','#ffffff','#9AA0A6'];
  // small / medium / large — SCALED to the screen, not fixed px. Fixed [10,26,54]
  // made the large brush ~14% of a phone's width ("the pen takes up the whole
  // page") while feeling thin on a desktop. ~[2.2%, 5%, 9.5%] of the short side,
  // clamped so desktop doesn't get comical and phones keep a fine-detail brush.
  function SIZES_now() {
    const m = Math.min(window.innerWidth, window.innerHeight);
    return [
      Math.max(5,  Math.round(m * 0.022)),
      Math.min(34, Math.max(14, Math.round(m * 0.05))),
      Math.min(64, Math.max(28, Math.round(m * 0.095))),
    ];
  }
  const SIZES = SIZES_now();

  // ---- background sanitizing (allow-list, not a block-list) ----
  // Only shape/structure elements survive; anything that can run script or fetch
  // an outside resource (<script>, <foreignObject>, <image>, <use> [href pulls in
  // a whole other document]) is dropped, along with every attribute not on the
  // allow-list below — which by construction excludes every on* handler and
  // every href/xlink:href. Nodes are copied one-by-one into a FRESH element tree
  // rather than the string being re-parsed as HTML, so there is no second chance
  // for a browser quirk to reinterpret something we didn't intend to allow.
  const SVG_TAG_ALLOW = new Set([
    'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line', 'defs', 'title',
  ]);
  const SVG_ATTR_ALLOW = new Set([
    'class', 'id', 'viewbox', 'xmlns', 'width', 'height', 'preserveaspectratio',
    'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'd',
    'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'transform',
  ]);
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function _sanitizeSvgNode(srcNode) {
    const tag = srcNode.tagName ? srcNode.tagName.toLowerCase() : '';
    if (!SVG_TAG_ALLOW.has(tag)) return null;
    const clean = document.createElementNS(SVG_NS, tag);
    Array.prototype.forEach.call(srcNode.attributes || [], (attr) => {
      const name = attr.name.toLowerCase();
      if (!SVG_ATTR_ALLOW.has(name)) return;   // covers every on*, href, xlink:href — not on the list
      clean.setAttribute(attr.name, attr.value);
    });
    Array.prototype.forEach.call(srcNode.childNodes || [], (child) => {
      if (child.nodeType !== 1) return;        // text/comment nodes carry nothing this app needs
      const cleanChild = _sanitizeSvgNode(child);
      if (cleanChild) clean.appendChild(cleanChild);
    });
    return clean;
  }
  // Returns a sanitized <svg> element ready to appendChild, or null if the
  // string isn't parseable SVG at all.
  function sanitizeSvgMarkup(rawSvg) {
    try {
      const doc = new DOMParser().parseFromString(String(rawSvg || ''), 'image/svg+xml');
      if (doc.querySelector('parsererror')) return null;
      const root = doc.documentElement;
      if (!root || root.tagName.toLowerCase() !== 'svg') return null;
      return _sanitizeSvgNode(root);
    } catch (e) { return null; }
  }
  // A stored picture address is only ever one of two legitimate things: a data:
  // image this app itself produced (uploaded photo → XDoG line art), or an
  // https: address. Mirrors parent/settings.html's safeImageSrc() allow-list —
  // same rule, kept separately because this file has no shared module to import
  // it from (plain <script> tags, no bundler).
  function _safeBgImgSrc(url) {
    const u = String(url == null ? '' : url);
    if (/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(u)) return u;
    if (/^https:\/\/[^\s"'<>]+$/.test(u)) return u;
    return null;
  }

  function injectStyle() {
    if (document.getElementById('vbPaintStyle')) return;
    const s = document.createElement('style'); s.id = 'vbPaintStyle';
    s.textContent =
      '#vbPaintWrap{position:fixed;inset:0;touch-action:none;}' +
      '#vbBgLayer{position:absolute;inset:0;background:#fff;overflow:hidden;display:flex;align-items:center;justify-content:center;}' +
      '#vbBgLayer svg,#vbBgLayer img{width:100%;height:100%;max-height:100%;object-fit:contain;display:block;}' +
      '#vbPaintCanvas{position:absolute;inset:0;width:100%;height:100%;}' +
      '#vbPaintDock{position:fixed;left:0;right:0;bottom:0;z-index:10;display:flex;flex-wrap:wrap;' +
      'align-items:center;justify-content:center;gap:8px;padding:8px 8px calc(8px + env(safe-area-inset-bottom));' +
      'background:rgba(0,0,0,0.42);backdrop-filter:blur(8px);}' +
      '.vb-sw{width:42px;height:42px;border-radius:50%;border:3px solid rgba(255,255,255,0.4);flex-shrink:0;cursor:pointer;}' +
      '.vb-sw.active{border-color:#fff;box-shadow:0 0 0 3px #4ECDC4;}' +
      '.vb-tool{min-width:46px;height:46px;border-radius:14px;background:rgba(255,255,255,0.14);' +
      'border:2px solid rgba(255,255,255,0.3);color:#fff;font-size:20px;font-weight:800;cursor:pointer;' +
      'display:flex;align-items:center;justify-content:center;gap:4px;padding:0 10px;flex-shrink:0;}' +
      '.vb-tool.active{background:rgba(78,205,196,0.4);border-color:#fff;}' +
      '@media (min-width:768px){.vb-sw{width:52px;height:52px;}.vb-tool{height:54px;min-width:54px;font-size:24px;}}';
    document.head.appendChild(s);
  }

  function mount(opts) {
    opts = opts || {};
    const tier = opts.tier || 1;
    const onStroke = opts.onStroke || function () {};
    const pages = (opts.pages && opts.pages.length) ? opts.pages : null;

    const eraserOn  = tier >= 4;
    const sizesOn   = tier >= 5;
    const brushesOn = tier >= 6;
    const undoOn    = tier >= 6;
    const paletteN  = tier <= 3 ? 6 : tier <= 6 ? 9 : 12;

    injectStyle();

    const wrap = document.createElement('div'); wrap.id = 'vbPaintWrap';
    const bgLayer = document.createElement('div'); bgLayer.id = 'vbBgLayer';
    const cv = document.createElement('canvas'); cv.id = 'vbPaintCanvas';
    wrap.appendChild(bgLayer); wrap.appendChild(cv);
    document.body.appendChild(wrap);
    const dock = document.createElement('div'); dock.id = 'vbPaintDock';
    document.body.appendChild(dock);

    const ctx = cv.getContext('2d');

    // ---- state ----
    let color = PALETTE[0];
    let size = SIZES[1];   // everyone starts MEDIUM (fat 'large' overwhelmed phone coloring pages)
    let brush = 'round';
    let erasing = false;
    let pageIdx = 0;
    const undo = [];

    // ---- background page (DOM) ----
    // Never re-inserts a stored string as HTML: svg is parsed + rebuilt through
    // the allow-list sanitizer above, and an image address is set as an element
    // PROPERTY (not interpolated into markup) after the same https:/data: check
    // parent/settings.html applies to the same stored value.
    function setPage() {
      bgLayer.innerHTML = '';
      if (!pages) return;
      const p = pages[pageIdx % pages.length];
      if (p.svg) {
        const safe = sanitizeSvgMarkup(p.svg);
        if (safe) bgLayer.appendChild(safe);
      } else if (p.src) {
        const img = document.createElement('img');
        img.alt = p.name || '';
        const safeSrc = _safeBgImgSrc(p.src);
        if (safeSrc) img.src = safeSrc;
        bgLayer.appendChild(img);
      }
      // else: blank page — bgLayer already cleared above
    }
    setPage();

    // ---- paint canvas sizing (preserve strokes on resize) ----
    function sizeCanvas() { cv.width = window.innerWidth; cv.height = window.innerHeight; }
    sizeCanvas();
    window.addEventListener('resize', () => {
      const tmp = document.createElement('canvas'); tmp.width = cv.width; tmp.height = cv.height;
      tmp.getContext('2d').drawImage(cv, 0, 0);
      sizeCanvas();
      ctx.drawImage(tmp, 0, 0);
    });

    // ---- drawing ----
    function pushUndo() {
      if (!undoOn) return;
      try { undo.push(ctx.getImageData(0, 0, cv.width, cv.height)); } catch (e) {}
      if (undo.length > 6) undo.shift();
    }
    function applyStroke(x, y, lastX, lastY) {
      if (erasing) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1;
        line(x, y, lastX, lastY, size * 1.6);
        ctx.globalCompositeOperation = 'source-over';
        return;
      }
      ctx.globalCompositeOperation = 'source-over';
      if (brush === 'spray') { spray(x, y); return; }
      if (brush === 'crayon') { crayon(x, y, lastX, lastY); return; }
      ctx.globalAlpha = brush === 'marker' ? 0.4 : 1;
      ctx.strokeStyle = color;
      line(x, y, lastX, lastY, brush === 'marker' ? size * 1.3 : size);
      ctx.globalAlpha = 1;
    }
    function line(x, y, lx, ly, w) {
      ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(x, y); ctx.stroke();
    }
    function spray(x, y) {
      ctx.fillStyle = color; ctx.globalAlpha = 0.9;
      const r = size, n = Math.max(8, size);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * r;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    function crayon(x, y, lx, ly) {
      ctx.strokeStyle = color; ctx.globalAlpha = 0.55; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const j = () => (Math.random() - 0.5) * size * 0.4;
        ctx.lineWidth = size * (0.5 + Math.random() * 0.4);
        ctx.beginPath(); ctx.moveTo(lx + j(), ly + j()); ctx.lineTo(x + j(), y + j()); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    let drawing = false, lastX = 0, lastY = 0;
    cv.addEventListener('pointerdown', (e) => {
      drawing = true; pushUndo();
      lastX = e.clientX; lastY = e.clientY;
      try { cv.setPointerCapture(e.pointerId); } catch {}
      applyStroke(e.clientX, e.clientY, e.clientX, e.clientY);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      applyStroke(e.clientX, e.clientY, lastX, lastY);
      lastX = e.clientX; lastY = e.clientY;
    });
    function endStroke() { if (drawing) { drawing = false; onStroke(); } }
    cv.addEventListener('pointerup', endStroke);
    cv.addEventListener('pointercancel', endStroke);

    // ---- toolbar ----
    function rebuildDock() {
      const gear = dock.querySelector('#gameSettingsGear');  // preserve settings gear
      dock.innerHTML = '';
      PALETTE.slice(0, paletteN).forEach(c => {
        const sw = document.createElement('div');
        sw.className = 'vb-sw' + (c === color && !erasing ? ' active' : '');
        sw.style.background = c;
        sw.addEventListener('pointerdown', (e) => { e.stopPropagation(); color = c; erasing = false; rebuildDock(); });
        dock.appendChild(sw);
      });
      if (sizesOn) SIZES.forEach((s, i) => {
        const b = document.createElement('div');
        b.className = 'vb-tool' + (s === size && !erasing ? ' active' : '');
        b.innerHTML = `<span style="display:inline-block;width:${6 + i * 7}px;height:${6 + i * 7}px;border-radius:50%;background:#fff;"></span>`;
        b.addEventListener('pointerdown', (e) => { e.stopPropagation(); size = s; rebuildDock(); });
        dock.appendChild(b);
      });
      if (brushesOn) [['round','🖌️'],['marker','🖊️'],['crayon','✏️'],['spray','💨']].forEach(([id, icon]) => {
        const b = document.createElement('div');
        b.className = 'vb-tool' + (brush === id && !erasing ? ' active' : '');
        b.textContent = icon; b.title = id;
        b.addEventListener('pointerdown', (e) => { e.stopPropagation(); brush = id; erasing = false; rebuildDock(); });
        dock.appendChild(b);
      });
      if (eraserOn) {
        const er = document.createElement('div');
        er.className = 'vb-tool' + (erasing ? ' active' : ''); er.textContent = '🧽'; er.title = 'Eraser';
        er.addEventListener('pointerdown', (e) => { e.stopPropagation(); erasing = !erasing; rebuildDock(); });
        dock.appendChild(er);
      }
      if (undoOn) {
        const u = document.createElement('div');
        u.className = 'vb-tool'; u.textContent = '↩️'; u.title = 'Undo';
        u.addEventListener('pointerdown', (e) => { e.stopPropagation(); const img = undo.pop(); if (img) ctx.putImageData(img, 0, 0); });
        dock.appendChild(u);
      }
      if (pages && pages.length > 1) {
        const pg = document.createElement('div');
        pg.className = 'vb-tool'; pg.textContent = '🖼️'; pg.title = 'Change picture';
        pg.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          pageIdx = (pageIdx + 1) % pages.length;
          setPage(); ctx.clearRect(0, 0, cv.width, cv.height); undo.length = 0;
        });
        dock.appendChild(pg);
      }
      const clr = document.createElement('div');
      clr.className = 'vb-tool'; clr.textContent = '✨'; clr.title = 'Clear'; clr.style.order = 999;
      clr.addEventListener('pointerdown', (e) => { e.stopPropagation(); pushUndo(); ctx.clearRect(0, 0, cv.width, cv.height); });
      dock.appendChild(clr);
      if (gear) { gear.style.order = 1000; dock.appendChild(gear); }
    }
    rebuildDock();

    return { dock, canvas: cv };
  }

  window.vbPaint = { mount };
})();
