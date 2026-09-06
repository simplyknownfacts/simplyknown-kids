// A test file that pauses at top level (`await import('playwright')` is the usual
// one) must do so BEFORE it registers its first test() -- never between tests.
//
// Why (2026-09-06, tests/sleep-timer-mini-player.test.mjs hung on every run):
// node:test fires a file's global after() hooks as soon as every test registered
// SO FAR has finished (lib/internal/test_runner/test.js, finalize():
// `root.waitingOn > root.subtests.length` -> root.run()). With one test above a
// top-level await and the rest below it, that moment can arrive while the file
// is still paused on the await. The hooks are one-shot (runOnce), so after() ran
// once with nothing yet to tear down and never again: the scripts/serve.mjs
// child and the browser it had started stayed alive, the test process never
// exited, and `node --test` waited on it for ever -- a robot or CI run silently
// stuck, not failed. tests/audit-2026-08-30.test.mjs and tests/hostile-input.
// test.mjs had the same shape and passed only by timing (their six source guards
// happen to finish in the same tick the import resolves).
//
// Rule: put the top-level await above the first test(). This guard reads every
// tracked tests/*.test.* file and fails naming any offender, so the shape cannot
// come back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// A statement at column 0 that awaits: `await x`, `const y = await x`,
// `try { ({ chromium } = await import('playwright')); } catch {}`. Comment lines
// and one-line function bodies are not top-level awaits.
const isTopLevelAwait = (line) =>
  /^[^\s/]/.test(line) && /\bawait\b/.test(line) && !/\bfunction\b|=>/.test(line);
// A statement at column 0 that registers a test or a suite.
const isTestRegistration = (line) => /^(?:test|it|describe|suite)\s*\(/.test(line);

test('no test file registers a test() before its top-level await', () => {
  const files = execFileSync('git', ['ls-files', '--', 'tests/*.test.*'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  assert.ok(files.length > 0, 'git ls-files found no tests/*.test.* -- this guard would be checking nothing');
  const offenders = [];
  for (const rel of files) {
    const lines = readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
    const firstAwait = lines.findIndex(isTopLevelAwait);
    if (firstAwait === -1) continue;
    const firstTest = lines.findIndex(isTestRegistration);
    if (firstTest !== -1 && firstTest < firstAwait) {
      offenders.push(`${rel}: test() at line ${firstTest + 1} comes before the top-level await at line ${firstAwait + 1}`);
    }
  }
  assert.deepEqual(offenders, [],
    'these files register a test before a top-level await, so node:test can fire their ' +
    'after() hooks while the file is still paused and never again (servers and browsers ' +
    'are left running, the runner hangs). Move the await above the first test():\n  ' +
    offenders.join('\n  '));
});
