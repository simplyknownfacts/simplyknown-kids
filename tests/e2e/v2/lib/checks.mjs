// Shared interaction + assertion helpers for oracle entries.
import { drainCalls } from './harness.mjs';

export async function assertLoaded(page, report, info, readySel, sev = 'Critical') {
  let ok = true, detail = '';
  try { await page.waitForSelector(readySel, { timeout: 12000, state: 'attached' }); }
  catch { ok = false; detail = `missing ${readySel}`; }
  report.add({ id: `${info.id} loads`, pass: ok, severity: sev, detail });
  return ok;
}

// Fire a full pointer/mouse tap at an element's centre (works for overlapped/invisible zones).
export const tapSel = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    const E = t.startsWith('pointer') ? PointerEvent : MouseEvent;
    el.dispatchEvent(new E(t, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  }
  return true;
}, sel);

// Real mouse tap at element centre (better for canvas coordinate mapping).
export async function tapAt(page, sel) {
  const el = await page.$(sel);
  if (!el) return false;
  const b = await el.boundingBox();
  if (!b) return false;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  return true;
}

// Signature of a canvas' pixels (to assert "something drew").
export const canvasSig = (page, sel = 'canvas') => page.evaluate((s) => {
  const c = document.querySelector(s);
  if (!c || !c.getContext) return null;
  try { return c.toDataURL().length; } catch { return -1; }
}, sel);

// Assert a tap caused the canvas to change.
export async function assertCanvasDrew(page, report, info, sel = 'canvas') {
  const before = await canvasSig(page, sel);
  await tapAt(page, sel);
  await page.waitForTimeout(250);
  const after = await canvasSig(page, sel);
  report.add({ id: `${info.id} canvas-responds-to-tap`, pass: before != null && after != null && after !== before, severity: 'High', detail: `sig ${before} -> ${after}` });
}

// Detect the "canvas doesn't resize on rotation" bug (spec §8.1). These canvases
// are sized to window.innerWidth at load, so after rotating to landscape a
// correctly-handled canvas FILLS the new (wider) window. If it stays narrow, it
// has no resize handler -> dead space + taps on the new area miss.
export async function assertRotationHandled(page, report, info, sel = 'canvas') {
  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.height, height: vp.width }); // rotate to landscape
  await page.waitForTimeout(500);
  const m = await page.evaluate((q) => {
    const c = document.querySelector(q);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { backing: c.width, client: Math.round(r.width), win: window.innerWidth };
  }, sel);
  await page.setViewportSize(vp);
  await page.waitForTimeout(200);
  if (!m) { report.add({ id: `${info.id} canvas-present-for-rotate`, pass: false, severity: 'Medium', detail: 'no canvas' }); return; }
  const fills = m.client >= m.win - 24; // canvas should track the window width after rotation
  report.add({ id: `${info.id} canvas-adapts-to-rotation`, pass: fills, severity: 'High', detail: `landscape: canvas client=${m.client}px backing=${m.backing} window=${m.win}px${fills ? '' : ' — canvas did NOT fill (no resize handler)'}` });
}

// Drain speak() calls and return the joined phrases.
export async function spoke(page) {
  const c = await drainCalls(page);
  return c.filter((x) => x.fn === 'speak').map((x) => x.args.join(' ')).join(' | ');
}
