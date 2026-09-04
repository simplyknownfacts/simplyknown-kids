// Codex 0825-18, MED: tests/e2e/v2/lib/harness.mjs's TIERS constant only
// covered tiers 1-8, while the app has had 10 since js/tiers.js's own
// birthday table grew (harness.mjs's own tierBirthday() already has 10
// months entries -- TIERS just never caught up). Any e2e run built on
// TIERS silently never drove tiers 9-10 at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIERS, tierBirthday } from '../tests/e2e/v2/lib/harness.mjs';

test('the e2e harness drives all 10 tiers, not just 1-8', () => {
  assert.deepEqual(TIERS, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('tierBirthday() returns a real date for every tier in TIERS', () => {
  for (const t of TIERS) {
    const b = tierBirthday(t);
    assert.match(b, /^\d{4}-\d{2}-\d{2}$/, `tier ${t}: tierBirthday() returned "${b}", not a real date`);
  }
});
