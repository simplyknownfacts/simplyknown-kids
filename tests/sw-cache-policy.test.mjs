// Cloudflare Access answers an expired session with a redirect to a login page.
// If the service worker caches that, the app opens to a login screen forever --
// including offline, where it cannot possibly log in. Nothing but a clean,
// same-origin 200 may enter the offline cache.
import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
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
