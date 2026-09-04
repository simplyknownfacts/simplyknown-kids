// Cloudflare Access answers an expired session with a redirect to a login page.
// If the service worker caches that, the app opens to a login screen forever --
// including offline, where it cannot possibly log in. Nothing but a clean,
// same-origin 200 may enter the offline cache.
import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const { vbShouldCache } = createRequire(import.meta.url)('../js/sw-cache-policy.js');

const res = (o) => ({ ok: true, status: 200, redirected: false, type: 'basic', ...o });

test('a clean same-origin page is cacheable', () => {
  assert.strictEqual(vbShouldCache(res()), true);
});

test('a response we were redirected to is refused', () => {
  assert.strictEqual(vbShouldCache(res({ redirected: true })), false);
});

test('an error page is refused', () => {
  assert.strictEqual(vbShouldCache(res({ ok: false, status: 404 })), false);
  assert.strictEqual(vbShouldCache(res({ ok: false, status: 302 })), false);
});

test('a cross-origin or opaque response is refused', () => {
  assert.strictEqual(vbShouldCache(res({ type: 'opaqueredirect' })), false);
  assert.strictEqual(vbShouldCache(res({ type: 'cors' })), false);
});

test('nothing at all is refused rather than throwing', () => {
  assert.strictEqual(vbShouldCache(null), false);
  assert.strictEqual(vbShouldCache(undefined), false);
});

// Codex 0903-6, LOW: js/version.js was missing from sw.js's ASSETS precache
// list. Offline on a first visit, parent/settings.html's version footer had
// nothing to read and showed "v?" instead of the real number.
test('js/version.js is in the service worker precache list', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'sw.js'), 'utf8');
  const m = src.match(/const ASSETS = \[([\s\S]*?)\];/);
  assert.ok(m, 'sw.js: could not find the ASSETS array to check');
  assert.match(m[1], /['"]\.\/js\/version\.js['"]/,
    "js/version.js must be in sw.js's ASSETS list, or the version footer shows \"v?\" offline on a first visit");
});
