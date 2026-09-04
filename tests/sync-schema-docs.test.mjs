// Codex 0825-17, MED. workers/sync/src/index.js's own header comment listed
// only 2 of the 7 real tables in the live D1 database (5 more get created
// lazily by their own handler) and had drifted stale. workers/sync/schema.sql
// is now the single, complete, checked-in picture. This proves the two stay
// in sync: every table index.js actually creates (or uses without creating,
// for the two that predate the lazy-create pattern) appears in schema.sql,
// and the old inline table list is gone from index.js's header.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const indexSrc = readFileSync(join(ROOT, 'workers', 'sync', 'src', 'index.js'), 'utf8');
const schemaSrc = readFileSync(join(ROOT, 'workers', 'sync', 'schema.sql'), 'utf8');

// Every table index.js's own CREATE TABLE IF NOT EXISTS calls create,
// lazily, plus the two (accounts, data) it uses but never creates itself.
const EXPECTED_TABLES = [
  'accounts', 'data', 'signup_log', 'invite_fail_log',
  'signin_fail_log_v2', 'name_clips', 'voiceclip_log',
];

test('every table index.js lazily creates also appears in schema.sql', () => {
  const created = [...indexSrc.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
  assert.deepEqual(created.sort(), EXPECTED_TABLES.filter((t) => t !== 'accounts' && t !== 'data').sort(),
    'index.js\'s own lazy CREATE TABLE statements changed -- update EXPECTED_TABLES and schema.sql together');
  for (const table of EXPECTED_TABLES) {
    assert.match(schemaSrc, new RegExp('CREATE TABLE IF NOT EXISTS ' + table + '\\b'),
      table + ' is used by index.js but missing from workers/sync/schema.sql');
  }
});

test('index.js no longer carries its own inline table list -- points at schema.sql instead', () => {
  assert.doesNotMatch(indexSrc, /accounts\(email_hash, pw_hash, pw_salt, sync_key, created_at\)/,
    'the stale inline schema comment is back in index.js -- this is exactly what drifted before');
  assert.match(indexSrc, /schema\.sql/i, 'index.js\'s header should point at workers/sync/schema.sql');
});
