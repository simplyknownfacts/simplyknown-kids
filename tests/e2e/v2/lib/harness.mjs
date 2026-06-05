// E2E v2 harness foundation: seed a profile per tier, capture audio INTENT +
// console errors, take screenshots, collect a pass/fail report. The gap v1 had
// was asserting "no crash" instead of correctness — these helpers let each
// oracle entry assert the real OUTCOME of an interaction.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export const __dir = dirname(fileURLToPath(import.meta.url));
export const SHOTS = join(__dir, '..', 'screenshots');
export const BASE = (process.env.BASE_URL || 'https://kids.simplyknown.co').replace(/\/$/, '');
export const TIERS = [1, 2, 3, 4, 5, 6, 7, 8];
export const VIEWPORTS = {
  phone: { width: 390, height: 844 }, phoneLand: { width: 844, height: 390 },
  tablet: { width: 820, height: 1180 }, tabletLand: { width: 1180, height: 820 },
};

// Birthday that lands a profile in the middle of each tier's month range.
export const tierBirthday = (tier) => {
  const months = [6, 18, 30, 42, 54, 66, 78, 120][tier - 1];
  const d = new Date(2026, 5, 5); d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
};

export async function launch() {
  return chromium.launch({ args: ['--no-sandbox'] });
}

// Fresh mobile-ish context. serviceWorkers:'block' so we always test the freshly
// deployed assets, never a stale SW cache (separate suite covers offline/PWA).
export async function newContext(browser, viewport = 'phone') {
  return browser.newContext({
    viewport: VIEWPORTS[viewport], deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, serviceWorkers: 'block',
  });
}

// Seed BEFORE app code runs: the active profile (→ tier), optional features /
// visibility / coloring pages / PIN, plus an error capture hook.
export async function seedProfile(context, { tier, features = {}, activitiesVisible = {}, coloringPages = null, pin = null }) {
  const profile = {
    id: 't' + tier, name: 'T' + tier, birthday: tierBirthday(tier), avatar: '🦊',
    color: '#4ECDC4', voice: 'woman', mascot: null, tierOverrides: {}, features, activitiesVisible, youtube: [],
  };
  await context.addInitScript((data) => {
    try {
      localStorage.setItem('vb_profiles', JSON.stringify([data.p]));
      localStorage.setItem('vb_active_id', data.p.id);
      if (data.pages) localStorage.setItem('vb_coloring_pages', JSON.stringify(data.pages));
      if (data.pin) localStorage.setItem('vb_pin', data.pin);
    } catch (e) { /* storage may be unavailable pre-navigation */ }
    window.__errs = [];
    addEventListener('error', (e) => window.__errs.push(String(e.message || e)));
    addEventListener('unhandledrejection', (e) => window.__errs.push('promise:' + String(e.reason)));
  }, { p: profile, pages: coloringPages, pin });
}

// Wrap the global audio/feedback fns AFTER the app defined them, so we can assert
// what the app TRIED to say/play on an interaction without real audio.
export async function instrument(page) {
  await page.evaluate(() => {
    window.__calls = [];
    for (const fn of ['speak', 'playSuccess', 'playBoop', 'playChime', 'playPop', 'haptic']) {
      const orig = window[fn];
      window[fn] = function (...a) {
        window.__calls.push({ fn, args: a.map((x) => (typeof x === 'string' ? x : typeof x)) });
        try { return orig && orig.apply(this, a); } catch (e) { /* no audio device in CI */ }
      };
    }
  });
}
export const drainCalls = (page) => page.evaluate(() => { const c = window.__calls || []; window.__calls = []; return c; });
export const getErrs = (page) => page.evaluate(() => window.__errs || []);

export function makeReport() {
  const rows = [];
  return {
    add(r) {
      const row = { pass: true, severity: '-', ...r };
      rows.push(row);
      console.log((row.pass ? 'PASS ' : 'FAIL ' + (row.severity !== '-' ? `[${row.severity}] ` : '')) + row.id + (row.detail ? ' — ' + row.detail : ''));
      return row.pass;
    },
    rows: () => rows,
    summary() { const f = rows.filter((r) => !r.pass); return { total: rows.length, passed: rows.length - f.length, failed: f.length, fails: f }; },
  };
}

export async function shot(page, name) {
  mkdirSync(SHOTS, { recursive: true });
  const file = join(SHOTS, name.replace(/[^a-z0-9._-]/gi, '_') + '.png');
  await page.screenshot({ path: file });
  return file;
}
