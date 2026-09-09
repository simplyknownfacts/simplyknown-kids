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

// A host merely appearing somewhere in the policy is not enough -- it has to be
// in the directive the browser actually consults. 2026-09-09: www.youtube.com was
// in frame-src only, so the iframe API <script> was blocked and Watch showed no
// videos on the Cloudflare Pages dev site; Color In's blob: pictures were blocked
// the same way. tests/csp-live.test.mjs proves it in a browser; this is the
// cheap text-level guard.
test('the hosts sit in the directives that actually need them', () => {
  const csp = readFileSync(HEADERS_PATH, 'utf8').match(/Content-Security-Policy:\s*(.+)/)[1];
  const directive = (name) => csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + ' ')) || '';
  assert.match(directive('script-src'), /https:\/\/www\.youtube\.com/, 'the YouTube iframe API is a <script> from www.youtube.com');
  assert.match(directive('img-src'), / blob:/, 'Color In and the photo upload draw blob: images');
  assert.match(directive('frame-src'), /www\.youtube-nocookie\.com/, 'the player iframe is served from youtube-nocookie.com');
  assert.match(directive('connect-src'), /simplyknown-kids-sync\.simplyknownfacts\.workers\.dev/, 'sync + the feed proxy are fetch() calls to the Worker');
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
