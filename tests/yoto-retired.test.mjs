// Scott, 2026-09-10: no API access will be granted. No ordinary child or
// parent surface may expose or resume the retired integration, including
// previously saved player state and direct callback URLs. Network-free guards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = rel => readFileSync(path.join(ROOT, rel), 'utf8');
const pages = execFileSync('git', ['ls-files', '--', '*.html'], {cwd: ROOT, encoding:'utf8'})
  .split(/\r?\n/).filter(Boolean).filter(rel => !/^(docs|tests|\.claude|\.worktrees)\//.test(rel));

test('ordinary pages expose no retired library copy, links, controls, or scripts', () => {
  const exposed = pages.filter(rel => /yoto/i.test(read(rel).replace(/<!--[\s\S]*?-->/g, '')));
  assert.deepEqual(exposed, [], 'retired integration is still discoverable in: ' + exposed.join(', '));
});

test('old callback URL is inert and has a safe local destination', () => {
  const callback = read('yoto-callback.html');
  assert.doesNotMatch(callback, /completeAuth|yoto\.js|yoto-config|URLSearchParams|fetch\s*\(/i);
  assert.match(callback, /(?:home|index)\.html/);
});

test('offline shell does not preload the retired integration', () => {
  const shell = read('sw.js').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(shell, /['"][^'"]*yoto[^'"]*['"]/i);
  assert.doesNotMatch(read('offline-manifest.json'), /yoto/i);
});

test('local Listening Hut stays independent of account or connection checks', () => {
  const home = read('js/world-home.js');
  assert.doesNotMatch(home, /yoto|function connected\(|kind\s*===\s*['"]listen['"]\s*&&/i);
  const listen = read('listen/index.html');
  assert.match(listen, /href="\.\.\/games\/tap-a-tune\.html"/);
  assert.match(listen, /js\/sleep-timer\.js/);
  assert.match(listen, /isActivityVisible\(profile,\s*'tap-a-tune'\)/);
});
