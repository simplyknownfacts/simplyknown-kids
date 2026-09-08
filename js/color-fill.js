// Color In: bounded tap-to-fill coloring for built-in SVG and uploaded line art.
(function () {
  'use strict';

  const COLORS = ['#FF5A67', '#FF9F43', '#FFD93D', '#46C76B', '#3988FF', '#845EF7'];
  const COLOR_NAMES = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];
  const MAX_SIDE = 700;
  const MAX_SOURCE_LENGTH = 12 * 1024 * 1024;
  const OUTLINE_LUMA = 190;

  function safeName(value, fallback) {
    return typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : fallback;
  }

  function safeUpload(src) {
    return typeof src === 'string' && src.length <= MAX_SOURCE_LENGTH &&
      /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(src);
  }

  function svgSource(svg) {
    const viewBox = svg.match(/viewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
    const width = viewBox ? Math.max(1, Math.round(Number(viewBox[1]))) : 400;
    const height = viewBox ? Math.max(1, Math.round(Number(viewBox[2]))) : 400;
    const rules = `<style>
      .region{fill:#fff;stroke:#1a1a2e;stroke-width:4;stroke-linejoin:round;stroke-linecap:round}
      .detail{fill:none;stroke:#1a1a2e;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
      .dot{fill:#1a1a2e}
    </style>`;
    return URL.createObjectURL(new Blob([
      svg.replace(/<svg([^>]*)>/i, `<svg$1 width="${width}" height="${height}">${rules}`),
    ], { type: 'image/svg+xml' }));
  }

  function parseColor(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }

  function mount(options) {
    const rawPages = Array.isArray(options && options.pages) ? options.pages : [];
    const pages = rawPages.slice(0, 16).flatMap((page, index) => {
      if (page && typeof page.svg === 'string' && page.svg.includes('<svg')) {
        return [{ name: safeName(page.name, `Picture ${index + 1}`), svg: page.svg, state: null }];
      }
      if (page && safeUpload(page.src)) {
        return [{ name: safeName(page.name, `My Picture ${index + 1}`), src: page.src, state: null }];
      }
      return [];
    });
    if (!pages.length) return;

    document.body.insertAdjacentHTML('beforeend', `
      <main class="stage" aria-label="Color In studio">
        <div class="scene-title" aria-live="polite"></div>
        <section class="book">
          <div class="page">
            <canvas id="colorFillCanvas" aria-label="Picture to color"></canvas>
            <div class="fill-message" data-fill-message aria-live="polite"></div>
            <div class="fill-error" data-fill-error hidden>We couldn't open this picture. Try another page.</div>
          </div>
        </section>
        <button id="prevPage" class="page-nav prev" type="button" aria-label="Previous picture">‹</button>
        <button id="nextPage" class="page-nav next" type="button" aria-label="Next picture">›</button>
        <div id="toolbar" aria-label="Color tools">
          <div id="colorPalette" role="group" aria-label="Choose a color"></div>
          <button id="undoFill" class="tool-btn" type="button" aria-label="Undo last fill">↶ Undo</button>
          <div id="colorFillDock"></div>
        </div>
      </main>`);

    const canvas = document.getElementById('colorFillCanvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const title = document.querySelector('.scene-title');
    const message = document.querySelector('[data-fill-message]');
    const error = document.querySelector('[data-fill-error]');
    const palette = document.getElementById('colorPalette');
    let current = 0;
    let selected = COLORS[0];
    let loadGeneration = 0;
    let activePointer = null;
    let disposed = false;

    COLORS.forEach((color, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pip';
      button.dataset.color = color;
      button.style.background = color;
      button.setAttribute('aria-label', COLOR_NAMES[index]);
      button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
      if (index === 0) button.classList.add('active');
      button.addEventListener('click', () => {
        selected = color;
        palette.querySelectorAll('.pip').forEach(pip => {
          const on = pip === button;
          pip.classList.toggle('active', on);
          pip.setAttribute('aria-pressed', String(on));
        });
      });
      palette.appendChild(button);
    });

    function status(text) {
      message.textContent = text;
    }

    function makeState(imageData) {
      const total = imageData.width * imageData.height;
      const boundary = new Uint8Array(total);
      const data = imageData.data;
      for (let i = 0; i < total; i++) {
        const at = i * 4;
        const luma = data[at] * 0.299 + data[at + 1] * 0.587 + data[at + 2] * 0.114;
        boundary[i] = data[at + 3] > 20 && luma <= OUTLINE_LUMA ? 1 : 0;
      }
      return {
        width: imageData.width,
        height: imageData.height,
        base: new Uint8ClampedArray(data),
        boundary,
        labels: new Int32Array(total),
        queue: new Int32Array(total),
        colors: new Map(),
        history: [],
        nextLabel: 1,
      };
    }

    function draw(state) {
      const pixels = new Uint8ClampedArray(state.base);
      for (let i = 0; i < state.labels.length; i++) {
        const rgb = state.colors.get(state.labels[i]);
        if (!rgb || state.boundary[i]) continue;
        const at = i * 4;
        pixels[at] = rgb[0]; pixels[at + 1] = rgb[1]; pixels[at + 2] = rgb[2]; pixels[at + 3] = 255;
      }
      ctx.putImageData(new ImageData(pixels, state.width, state.height), 0, 0);
    }

    function showState(page) {
      canvas.width = page.state.width;
      canvas.height = page.state.height;
      canvas.style.aspectRatio = `${page.state.width} / ${page.state.height}`;
      draw(page.state);
      canvas.dataset.ready = '1';
      error.hidden = true;
      status('Tap a space to fill it!');
    }

    function loadPage() {
      const generation = ++loadGeneration;
      const page = pages[current];
      activePointer = null;
      title.textContent = page.name;
      canvas.removeAttribute('data-ready');
      error.hidden = true;
      status('Opening your picture…');
      if (page.state) { showState(page); return; }

      const image = new Image();
      let objectUrl = null;
      image.onload = () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        if (disposed || generation !== loadGeneration) return;
        const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.width = width;
        canvas.height = height;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        try {
          ctx.drawImage(image, 0, 0, width, height);
          page.state = makeState(ctx.getImageData(0, 0, width, height));
          showState(page);
        } catch {
          failPage(generation);
        }
      };
      image.onerror = () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        failPage(generation);
      };
      if (page.svg) {
        objectUrl = svgSource(page.svg);
        image.src = objectUrl;
      } else {
        image.src = page.src;
      }
    }

    function failPage(generation) {
      if (disposed || generation !== loadGeneration) return;
      canvas.removeAttribute('data-ready');
      error.hidden = false;
      status('');
    }

    function componentAt(state, x, y) {
      const start = y * state.width + x;
      if (state.boundary[start] || state.labels[start] === -1) return 0;
      if (state.labels[start] > 0) return state.labels[start];
      const label = state.nextLabel++;
      const queue = state.queue;
      let head = 0, tail = 0, touchesEdge = false;
      queue[tail++] = start;
      state.labels[start] = label;
      while (head < tail) {
        const index = queue[head++];
        const px = index % state.width;
        const py = (index / state.width) | 0;
        if (px === 0 || py === 0 || px === state.width - 1 || py === state.height - 1) touchesEdge = true;
        if (px > 0) visit(index - 1);
        if (px + 1 < state.width) visit(index + 1);
        if (py > 0) visit(index - state.width);
        if (py + 1 < state.height) visit(index + state.width);
      }
      if (touchesEdge) {
        for (let i = 0; i < tail; i++) state.labels[queue[i]] = -1;
        return 0;
      }
      return label;

      function visit(index) {
        if (state.boundary[index] || state.labels[index] !== 0) return;
        state.labels[index] = label;
        queue[tail++] = index;
      }
    }

    function fillAt(clientX, clientY) {
      const page = pages[current];
      if (!page.state || canvas.dataset.ready !== '1') return;
      const rect = canvas.getBoundingClientRect();
      if (clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) return;
      const x = Math.min(page.state.width - 1, Math.max(0, Math.floor((clientX - rect.left) / rect.width * page.state.width)));
      const y = Math.min(page.state.height - 1, Math.max(0, Math.floor((clientY - rect.top) / rect.height * page.state.height)));
      const label = componentAt(page.state, x, y);
      if (!label) { status('Try a space inside the lines.'); return; }
      const before = page.state.colors.get(label);
      const after = parseColor(selected);
      if (before && before[0] === after[0] && before[1] === after[1] && before[2] === after[2]) return;
      page.state.history.push({ label, before: before ? before.slice() : null });
      if (page.state.history.length > 80) page.state.history.shift();
      page.state.colors.set(label, after);
      draw(page.state);
      status('Beautiful! Pick another space.');
      if (options && typeof options.onFill === 'function') options.onFill();
    }

    canvas.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || activePointer || canvas.dataset.ready !== '1') return;
      activePointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      try { canvas.setPointerCapture(event.pointerId); } catch {}
      event.preventDefault();
    });
    canvas.addEventListener('pointerup', event => {
      if (!activePointer || event.pointerId !== activePointer.id) return;
      const start = activePointer;
      activePointer = null;
      try { canvas.releasePointerCapture(event.pointerId); } catch {}
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 18) fillAt(event.clientX, event.clientY);
    });
    function releasePointer(event) {
      if (activePointer && event.pointerId === activePointer.id) activePointer = null;
    }
    canvas.addEventListener('pointercancel', releasePointer);
    canvas.addEventListener('lostpointercapture', releasePointer);

    document.getElementById('undoFill').addEventListener('click', () => {
      const state = pages[current].state;
      if (!state || !state.history.length) { status('Nothing to undo yet.'); return; }
      const change = state.history.pop();
      if (change.before) state.colors.set(change.label, change.before);
      else state.colors.delete(change.label);
      draw(state);
      status('Undone!');
    });

    function move(delta) {
      current = (current + delta + pages.length) % pages.length;
      loadPage();
    }
    document.getElementById('prevPage').addEventListener('click', () => move(-1));
    document.getElementById('nextPage').addEventListener('click', () => move(1));
    window.addEventListener('pagehide', () => {
      disposed = true;
      loadGeneration++;
      activePointer = null;
    });
    window.addEventListener('pageshow', event => {
      if (!event.persisted) return;
      disposed = false;
      activePointer = null;
      if (!pages[current].state) loadPage();
    });

    loadPage();
  }

  window.vbColorFill = { mount };
})();
