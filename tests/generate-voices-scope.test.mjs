import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'generate-voices.mjs');
const TEXT = 'Tap the bubbles!';

function plan(...extra) {
  return spawnSync(process.execPath, [SCRIPT, '--dry', '--dry-include-existing', '--text', TEXT, ...extra], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ELEVENLABS_API_KEY: '' },
  });
}

test('scoped voice plan selects only four matching clips without credentials or provider calls', () => {
  const result = plan('--max-requests', '4', '--max-chars', '64');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /To generate: 4 TTS clips \(64 chars,/);
  assert.match(result.stdout, /Dry run — no API calls made\./);
  assert.doesNotMatch(result.stdout, /SFX clips \(\$0\.0[1-9]/);
});

test('scoped voice plan fails closed when request or character scope is too small', () => {
  const requests = plan('--max-requests', '3', '--max-chars', '64');
  assert.notEqual(requests.status, 0);
  assert.match(requests.stderr, /exceed --max-requests 3/);

  const chars = plan('--max-requests', '4', '--max-chars', '63');
  assert.notEqual(chars.status, 0);
  assert.match(chars.stderr, /exceed --max-chars 63/);
});

test('scoped voice plan rejects text outside the manifest', () => {
  const result = spawnSync(process.execPath, [SCRIPT, '--dry', '--text', 'Unexpected paid work', '--max-requests', '4'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ELEVENLABS_API_KEY: '' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not in the voice manifest/);
});
