// Codex 0825-10, MED: no Content-Security-Policy existed anywhere (no
// _headers file, no <meta> tag). This checks the real, checked-in policy
// covers every external host this app actually talks to -- a regression
// guard against a future integration (a new API, a new CDN) landing
// without the CSP being updated to allow it, which would silently break
// in production the moment Cloudflare Pages starts reading this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const HEADERS_PATH = join(ROOT, '_headers');

test('_headers exists and has a real Content-Security-Policy line for all paths', () => {
  assert.ok(existsSync(HEADERS_PATH), '_headers is missing from the repo root');
  const src = readFileSync(HEADERS_PATH, 'utf8');
  assert.match(src, /^\/\*\s*$/m, '_headers must apply to all paths (a bare "/*" rule)');
  assert.match(src, /Content-Security-Policy:/);
});

test('the CSP covers every external host this app actually talks to', () => {
  const csp = readFileSync(HEADERS_PATH, 'utf8');
  // Every real external host found in the shipped source (js/*.js and the
  // published *.html pages), gathered the same way -- if a new integration
  // adds one and nobody updates the CSP, this fails instead of silently
  // shipping a policy that blocks it.
  const REQUIRED_HOSTS = [
    'fonts.googleapis.com', 'fonts.gstatic.com',
    'simplyknown-kids-sync.simplyknownfacts.workers.dev',
    'simplyknown-kids-sync-dev.simplyknownfacts.workers.dev',
    'api.yotoplay.com', 'login.yotoplay.com',
    'www.youtube.com', 'www.youtube-nocookie.com',
  ];
  for (const host of REQUIRED_HOSTS) {
    assert.ok(csp.includes(host), `${host} is used by the app but missing from the CSP in _headers`);
  }
});

test('the CSP blocks object/embed injection and framing by another site', () => {
  const csp = readFileSync(HEADERS_PATH, 'utf8');
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'self'/);
});

test('_headers is in the publish allow-list', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'stage-site.mjs'), 'utf8');
  assert.match(src, /'_headers'/, '_headers must be in scripts/stage-site.mjs\'s PUBLISH list or it never ships');
});
