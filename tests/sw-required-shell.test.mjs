// Codex 0902-4 (the other half — see tests/verify-drive.mjs's hub-image-fallback
// for the home.html onerror half). sw.js's install handler used to precache
// EVERY asset via Promise.allSettled -- resilient (one failing fetch can't wipe
// the whole offline cache, the v123 fix), but that also meant a genuinely
// critical file (the hub background image, the shell HTML/CSS/JS) could fail
// silently and the service worker would still activate as if everything were
// fine. REQUIRED_SHELL + Promise.all fixes that: a required file failing now
// rejects install() itself, so the browser keeps whatever service worker (old
// or none) it already had rather than activating a broken new one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(import.meta.dirname, '..', 'sw.js'), 'utf8');

function arrayLiteral(name) {
  const m = src.match(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];'));
  assert.ok(m, `sw.js: could not find "const ${name} = [...]"`);
  return [...m[1].matchAll(/'(\.\/[^']+)'/g)].map((x) => x[1]);
}

test('REQUIRED_SHELL exists, is non-empty, and covers the hub screen', () => {
  const required = arrayLiteral('REQUIRED_SHELL');
  assert.ok(required.length > 0, 'REQUIRED_SHELL must not be empty');
  for (const must of ['./index.html', './home.html', './redesign-hub-bg.jpg']) {
    assert.ok(required.includes(must), `REQUIRED_SHELL is missing ${must} -- the hub cannot render offline without it`);
  }
});

test('every REQUIRED_SHELL entry is also in ASSETS (no orphaned required file)', () => {
  const required = arrayLiteral('REQUIRED_SHELL');
  const assets = arrayLiteral('ASSETS');
  const missing = required.filter((u) => !assets.includes(u));
  assert.deepEqual(missing, [], 'REQUIRED_SHELL entries not found in ASSETS: ' + missing.join(', '));
});

test('install() precaches REQUIRED_SHELL with Promise.all (fail-fast), not allSettled', () => {
  const m = src.match(/self\.addEventListener\('install',[\s\S]*?\}\)\(\)\);\r?\n\}\);/);
  assert.ok(m, 'sw.js: could not find the install event listener');
  const body = m[0];
  assert.match(body, /Promise\.all\(\s*REQUIRED_SHELL\.map/,
    'REQUIRED_SHELL must be precached with Promise.all so a failure rejects install() itself, not silently swallowed by allSettled');
});
