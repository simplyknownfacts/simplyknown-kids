(function () {
  'use strict';

  const MAX_UNDO = 8;
  const BRUSHES = new Set(['brush', 'marker', 'sprinkle']);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mount(options) {
    const canvas = options && options.canvas;
    if (!canvas) throw new TypeError('Free Paint needs a canvas');
    const stage = canvas.parentElement;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas is unavailable');

    const onStroke = typeof options.onStroke === 'function' ? options.onStroke : function () {};
    const undoStack = [];
    let color = '#ff5f6d';
    let brush = 'brush';
    let sizeKey = 'medium';
    let erasing = false;
    let activePointer = null;
    let previous = null;
    let strokeChanged = false;
    let destroyed = false;
    let cssWidth = 1;
    let cssHeight = 1;
    let pixelRatio = 1;

    function brushSize() {
      const shortSide = Math.min(cssWidth, cssHeight);
      const scale = sizeKey === 'small' ? 0.017 : sizeKey === 'large' ? 0.065 : 0.034;
      const limits = sizeKey === 'small' ? [5, 13] : sizeKey === 'large' ? [24, 58] : [12, 30];
      return clamp(Math.round(shortSide * scale), limits[0], limits[1]);
    }

    function copyCanvas(source) {
      const copy = document.createElement('canvas');
      copy.width = source.width;
      copy.height = source.height;
      copy.getContext('2d').drawImage(source, 0, 0);
      return copy;
    }

    function remember() {
      undoStack.push(copyCanvas(canvas));
      if (undoStack.length > MAX_UNDO) undoStack.shift();
      updateButtons();
    }

    function drawSnapshot(snapshot) {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, canvas.width, canvas.height);
      context.restore();
    }

    function resize() {
      if (destroyed) return;
      const bounds = stage.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(bounds.width));
      const nextHeight = Math.max(1, Math.round(bounds.height));
      const nextRatio = Math.min(window.devicePixelRatio || 1, 2);
      if (nextWidth === cssWidth && nextHeight === cssHeight && nextRatio === pixelRatio && canvas.width > 1) return;
      const saved = canvas.width > 1 && canvas.height > 1 ? copyCanvas(canvas) : null;
      cssWidth = nextWidth;
      cssHeight = nextHeight;
      pixelRatio = nextRatio;
      canvas.width = Math.max(1, Math.round(cssWidth * pixelRatio));
      canvas.height = Math.max(1, Math.round(cssHeight * pixelRatio));
      if (saved) drawSnapshot(saved);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.lineCap = 'round';
      context.lineJoin = 'round';
    }

    function canvasHasInk() {
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 3; index < data.length; index += 4) {
        if (data[index]) return true;
      }
      return false;
    }

    function regionHasInk(from, to, radius) {
      const left = clamp(Math.floor((Math.min(from.x, to.x) - radius) * pixelRatio), 0, canvas.width - 1);
      const top = clamp(Math.floor((Math.min(from.y, to.y) - radius) * pixelRatio), 0, canvas.height - 1);
      const right = clamp(Math.ceil((Math.max(from.x, to.x) + radius) * pixelRatio), left + 1, canvas.width);
      const bottom = clamp(Math.ceil((Math.max(from.y, to.y) + radius) * pixelRatio), top + 1, canvas.height);
      const data = context.getImageData(left, top, right - left, bottom - top).data;
      for (let index = 3; index < data.length; index += 4) {
        if (data[index]) return true;
      }
      return false;
    }

    function pointFromEvent(event) {
      const bounds = canvas.getBoundingClientRect();
      return {
        x: clamp(event.clientX - bounds.left, 0, bounds.width),
        y: clamp(event.clientY - bounds.top, 0, bounds.height),
      };
    }

    function line(from, to, width) {
      if (Math.hypot(to.x - from.x, to.y - from.y) < 0.1) {
        context.beginPath();
        context.arc(from.x, from.y, width / 2, 0, Math.PI * 2);
        context.fillStyle = context.strokeStyle;
        context.fill();
        return;
      }
      context.lineWidth = width;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    }

    function paint(from, to) {
      const size = brushSize();
      if (erasing) {
        const changed = regionHasInk(from, to, size * 0.95);
        context.save();
        context.globalCompositeOperation = 'destination-out';
        context.strokeStyle = '#000';
        line(from, to, size * 1.8);
        context.restore();
        return changed;
      }

      context.save();
      context.globalCompositeOperation = 'source-over';
      context.strokeStyle = color;
      context.fillStyle = color;
      if (brush === 'marker') {
        context.globalAlpha = 0.42;
        line(from, to, size * 1.45);
      } else if (brush === 'sprinkle') {
        const distance = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
        const steps = Math.max(5, Math.ceil(distance / Math.max(2, size * 0.24)));
        for (let index = 0; index < steps; index += 1) {
          const progress = steps === 1 ? 0 : index / (steps - 1);
          const centerX = from.x + (to.x - from.x) * progress;
          const centerY = from.y + (to.y - from.y) * progress;
          const angle = (index * 2.399963 + centerX * 0.031 + centerY * 0.017) % (Math.PI * 2);
          const radius = size * (0.16 + ((index * 37) % 10) / 13);
          const dot = Math.max(1.4, size * (0.055 + (index % 3) * 0.018));
          context.beginPath();
          context.arc(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, dot, 0, Math.PI * 2);
          context.fill();
        }
      } else {
        line(from, to, size);
      }
      context.restore();
      return true;
    }

    function finishStroke(event) {
      if (activePointer === null || (event && Number.isInteger(event.pointerId) && event.pointerId !== activePointer)) return;
      const changed = strokeChanged;
      const pointer = activePointer;
      activePointer = null;
      previous = null;
      strokeChanged = false;
      try {
        if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
      } catch (_) {}
      if (!changed) {
        undoStack.pop();
        updateButtons();
        return;
      }
      onStroke();
    }

    function onPointerDown(event) {
      if (destroyed || activePointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      activePointer = event.pointerId;
      previous = pointFromEvent(event);
      strokeChanged = false;
      remember();
      try { canvas.setPointerCapture(activePointer); } catch (_) {}
      strokeChanged = paint(previous, previous) || strokeChanged;
    }

    function onPointerMove(event) {
      if (event.pointerId !== activePointer || !previous) return;
      if (event.pointerType === 'mouse' && event.buttons === 0) {
        finishStroke(event);
        return;
      }
      event.preventDefault();
      const next = pointFromEvent(event);
      strokeChanged = paint(previous, next) || strokeChanged;
      previous = next;
    }

    function selectColor(nextColor) {
      color = nextColor;
      erasing = false;
      updateButtons();
    }

    function selectBrush(nextBrush) {
      if (!BRUSHES.has(nextBrush)) return;
      brush = nextBrush;
      erasing = false;
      updateButtons();
    }

    function selectSize(nextSize) {
      if (!['small', 'medium', 'large'].includes(nextSize)) return;
      sizeKey = nextSize;
      updateButtons();
    }

    function undo() {
      finishStroke();
      const snapshot = undoStack.pop();
      if (!snapshot) return false;
      drawSnapshot(snapshot);
      updateButtons();
      return true;
    }

    function clear() {
      finishStroke();
      if (!canvasHasInk()) return false;
      remember();
      context.clearRect(0, 0, cssWidth, cssHeight);
      updateButtons();
      return true;
    }

    const colorButtons = Array.from(document.querySelectorAll('[data-color]'));
    const brushButtons = Array.from(document.querySelectorAll('[data-brush]'));
    const sizeButtons = Array.from(document.querySelectorAll('[data-size]'));
    const eraserButton = document.querySelector('#eraserButton');
    const undoButton = document.querySelector('#undoButton');
    const clearButton = document.querySelector('#clearButton');

    function updateButtons() {
      colorButtons.forEach(button => {
        const active = !erasing && button.dataset.color.toLowerCase() === color.toLowerCase();
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      brushButtons.forEach(button => {
        const active = !erasing && button.dataset.brush === brush;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      sizeButtons.forEach(button => {
        const active = button.dataset.size === sizeKey;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      if (eraserButton) {
        eraserButton.classList.toggle('active', erasing);
        eraserButton.setAttribute('aria-pressed', String(erasing));
      }
      if (undoButton) undoButton.disabled = undoStack.length === 0;
    }

    const controlListeners = [];
    function listen(element, event, handler) {
      if (!element) return;
      element.addEventListener(event, handler);
      controlListeners.push([element, event, handler]);
    }
    colorButtons.forEach(button => listen(button, 'click', () => selectColor(button.dataset.color)));
    brushButtons.forEach(button => listen(button, 'click', () => selectBrush(button.dataset.brush)));
    sizeButtons.forEach(button => listen(button, 'click', () => selectSize(button.dataset.size)));
    listen(eraserButton, 'click', () => { erasing = !erasing; updateButtons(); });
    listen(undoButton, 'click', undo);
    listen(clearButton, 'click', clear);

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', finishStroke);
    canvas.addEventListener('pointercancel', finishStroke);
    canvas.addEventListener('lostpointercapture', finishStroke);
    window.addEventListener('pagehide', finishStroke);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    resize();
    updateButtons();

    function destroy() {
      if (destroyed) return;
      finishStroke();
      destroyed = true;
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', finishStroke);
      canvas.removeEventListener('pointercancel', finishStroke);
      canvas.removeEventListener('lostpointercapture', finishStroke);
      window.removeEventListener('pagehide', finishStroke);
      controlListeners.forEach(([element, event, handler]) => element.removeEventListener(event, handler));
    }

    return {
      canvas,
      clear,
      undo,
      destroy,
      getState: () => ({ color, brush, size: sizeKey, erasing, undoDepth: undoStack.length }),
    };
  }

  window.FreePaint = { mount };
})();
