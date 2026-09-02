// The version number Scott types at the promote prompt must be the SAME number
// that ships. Two independent places name it today -- js/version.js (what the
// app shows on screen, in the parent-settings footer) and package.json (what
// scripts/promote.mjs reads at HEAD) -- and this test fails if they ever
// disagree, or if APP_VERSION is ever hard-coded a second time anywhere else
// in the shipped app. A silent mismatch here would mean the number Scott
// confirms is not provably the number in the code that goes out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

function readAppVersion() {
  const src = readFileSync(path.join(ROOT, 'js', 'version.js'), 'utf8');
  const m = src.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  assert.ok(m, 'js/version.js must export a plain string constant named APP_VERSION');
  return m[1];
}

test('js/version.js exports a semver APP_VERSION (MAJOR.MINOR.PATCH, no leading v)', () => {
  const version = readAppVersion();
  assert.match(version, /^\d+\.\d+\.\d+$/, `APP_VERSION "${version}" must be plain semver`);
});

test('package.json "version" matches js/version.js APP_VERSION exactly', () => {
  const version = readAppVersion();
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.version, version,
    `package.json says "${pkg.version}" but js/version.js says "${version}" -- ` +
    'the promote gate reads package.json and js/version.js separately and refuses ' +
    'if they ever disagree; keep them in lockstep by hand.');
});

test('js/version.js is the ONLY place APP_VERSION is hard-coded in the shipped app', () => {
  // A second hard-coded copy (e.g. pasted into parent/settings.html instead of
  // imported) could drift from the real constant and silently show Scott a
  // stale number. Scan every tracked, shippable source file except the
  // constant's own definition.
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  const CHECK_EXT = new Set(['.js', '.html', '.mjs']);
  const EXCLUDE_PREFIXES = ['tests/', 'docs/', '.worktrees/', 'workers/', 'scripts/'];
  const offenders = [];
  for (const rel of tracked) {
    if (rel === 'js/version.js') continue;
    if (EXCLUDE_PREFIXES.some((p) => rel.startsWith(p))) continue;
    if (!CHECK_EXT.has(path.extname(rel))) continue;
    let text;
    try { text = readFileSync(path.join(ROOT, rel), 'utf8'); } catch { continue; }
    if (/APP_VERSION\s*=\s*['"]/.test(text)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [],
    'APP_VERSION must only be assigned in js/version.js -- found a second hard-coded ' +
    'copy in: ' + offenders.join(', '));
});

test('parent/settings.html shows the version (imports js/version.js and renders APP_VERSION)', () => {
  const html = readFileSync(path.join(ROOT, 'parent', 'settings.html'), 'utf8');
  assert.match(html, /js\/version\.js/, 'parent/settings.html must load js/version.js');
  assert.match(html, /APP_VERSION/, 'parent/settings.html must render APP_VERSION somewhere visible');
});
