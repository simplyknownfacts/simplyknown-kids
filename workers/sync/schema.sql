-- SimplyKnown Kids sync worker -- D1 database `sync`.
--
-- Codex 0825-17, MED: workers/sync/src/index.js's own header comment listed
-- only 2 tables (accounts, data) while 7 exist in the real live database --
-- 5 more get created lazily, on first use, by each handler that needs them
-- (search index.js for "CREATE TABLE IF NOT EXISTS" to see exactly where).
-- This file is the honest, complete picture in one place; index.js's header
-- now points here instead of carrying its own copy that can drift again.
--
-- Not a migration RUNNER -- this project has none (see index.js's own header
-- for why: a Worker with no build step and no CI has nowhere to run one from
-- automatically). This file is checked in so the schema is reviewable and
-- diffable in git, and is applied by hand:
--   npx wrangler d1 execute sync --file=workers/sync/schema.sql
-- CREATE TABLE IF NOT EXISTS makes every statement here safe to re-run.

-- Accounts: one row per family. sync_key rotates on every sign-in (single
-- active session per account -- Codex 0825-3, ACCEPTED RISK, tracked
-- separately). Created directly (not lazily) by the earliest deploy; no
-- CREATE TABLE for this one appears in index.js itself.
CREATE TABLE IF NOT EXISTS accounts (
  email_hash TEXT PRIMARY KEY,
  pw_hash    TEXT,
  pw_salt    TEXT,
  sync_key   TEXT,
  created_at INTEGER
);

-- The actual synced payload: one row per account, replaced wholesale on
-- every /push (INSERT OR REPLACE). profiles is the client's own JSON,
-- opaque to this table.
CREATE TABLE IF NOT EXISTS data (
  email_hash TEXT PRIMARY KEY,
  profiles   TEXT,
  updated_at INTEGER
);

-- Everything below is a throttle/log table, each keyed by a HASH of the
-- caller's identity (IP and/or email), never the identity itself -- this is
-- a children's app and holds as little about anyone as it can get away
-- with. All are created lazily by their own handler; declared here for the
-- honest whole-picture view index.js's header used to promise and didn't
-- keep.

-- /signup: bulk account-creation throttle (per-IP + global daily caps).
-- Only a SUCCESSFUL signup is recorded, so a typo'd email never burns a
-- family's daily allowance.
CREATE TABLE IF NOT EXISTS signup_log (
  id         TEXT PRIMARY KEY,
  ip_hash    TEXT,
  created_at INTEGER
);

-- /signup: invite-word guess throttle (Codex 0903-1-era HIGH, fixed
-- 2026-09-01). Separate from signup_log on purpose -- only WRONG guesses
-- are logged here, and it must never share signup_log's success-only
-- counter.
CREATE TABLE IF NOT EXISTS invite_fail_log (
  id         TEXT PRIMARY KEY,
  ip_hash    TEXT,
  created_at INTEGER
);

-- /signin: failed-attempt throttle, keyed on (email, caller) as of the
-- 2026-09-01 fix -- a stranger sending wrong passwords from their own
-- address can no longer lock the real family out (see index.js's own
-- comment above siEnsureTable for the full reasoning). The "_v2" name
-- marks the rename: the original email-only table is dead, left alone
-- rather than risk an ALTER on a live production table with no migration
-- runner to guard it.
CREATE TABLE IF NOT EXISTS signin_fail_log_v2 (
  id         TEXT PRIMARY KEY,
  email_hash TEXT,
  ip_hash    TEXT,
  created_at INTEGER
);

-- /voice-name: the generated ElevenLabs clips themselves (the actual mp3
-- bytes), keyed by a hash of (name, voice, phrase index) so re-adding an
-- already-generated name is free/idempotent.
CREATE TABLE IF NOT EXISTS name_clips (
  clip_key   TEXT PRIMARY KEY,
  name_norm  TEXT,
  voice      TEXT,
  i          INTEGER,
  mp3        BLOB,
  acct_hash  TEXT,
  created_at INTEGER
);

-- /voice-clip: per-IP daily fetch throttle for the (unauthenticated, by
-- design -- see index.js's own comment on handleVoiceClip) clip-serving
-- endpoint. Bounds free guessing of which first names exist.
CREATE TABLE IF NOT EXISTS voiceclip_log (
  id         TEXT PRIMARY KEY,
  ip_hash    TEXT,
  created_at INTEGER
);
