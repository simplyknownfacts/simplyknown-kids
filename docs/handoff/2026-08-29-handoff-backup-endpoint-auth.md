# Handoff — 2026-08-29 — backup `/run` endpoint locked down

**Session goal:** Scott's GO ("do 4", master chat 2026-08-29) — fix Codex finding #1, the
unauthenticated backup Worker endpoint, before anything else.

**Outcome: shipped and verified live.** Nothing else from the adoption spec was started.

---

## What was wrong

`simplyknown-kids-backup` exposed `GET /run` with no authentication at all. Anyone who knew the
URL could make the Worker dump every table of the D1 `sync` database to R2, on repeat.

**Severity is lower than Codex and the inbox note stated, and this matters for future triage.**
The dump is written into our private R2 bucket and the HTTP response only echoes the object key
(`backup written: kids/backup-<iso>.json`). A caller never receives the data. So the real risk was
abuse — database load, storage growth, cost — not data theft. Still a live internet-facing hole on
a children's app, still worth fixing immediately.

Proved before the fix: anonymous `curl .../run` returned **HTTP 200** and wrote a real backup file.

## What changed

1. [workers/backup-worker/index.js](../../workers/backup-worker/index.js) — `/run` now requires an
   `X-Backup-Secret` header, compared without leaking match length through response time. Fails
   **closed** when the secret is unset. Errors log privately and return a bare `backup failed`.
   The nightly path is untouched: it runs through `scheduled()` and never enters `fetch()`, so the
   header can never break an automatic backup.
2. [tests/backup-auth.test.mjs](../../tests/backup-auth.test.mjs) — 6 tests, no network and no
   Cloudflare account needed, so it is CI-safe. Run: `node --test tests/backup-auth.test.mjs`.
   This also closes adoption-spec item 6a.
3. [workers/backup-worker/wrangler.toml](../../workers/backup-worker/wrangler.toml) — removed a
   stale `crons = ["37 8 * * *"]`. See the landmine below.
4. Secret generated and uploaded to the Worker as `BACKUP_SECRET`. Local copy:
   `secrets/backup_run_secret.txt` (gitignored — the repo is public).

Commits `b1fb4ae` and `f125c21`, pushed to `main`. Deployed from committed source (v141 lesson),
version `d1abcad7-f947-49a8-801f-4574aec060df`.

## Landmine found on the way — read this before touching the backup Worker

The **live** Worker had **no cron**: the nightly D1 → R2 dump moved to the fleet
`backup-orchestrator` (Video Bot repo, cron `22 8`). But the committed `wrangler.toml` still
declared `37 8 * * *`. Any `wrangler deploy` would have silently re-added it and we would have
backed up twice a night, forever, with nobody noticing. Config now matches reality and is
commented so the next person does not "restore" it.

Verified after deploy via the Cloudflare API: `schedules` is still `[]`.

## Proof (live, after deploy)

| Request | Result |
|---|---|
| `/run`, no header | **401** |
| `/run`, wrong secret | **401** |
| `/run`, same-length wrong secret | **401** |
| `/run`, correct secret | **200**, backup written |
| `/` | 200, public info line (harmless) |

## Loose ends

1. **4 junk backup objects in R2** from proving the hole and the fix
   (`kids/backup-2026-08-29-20-05-21`, `-20-31-58`, `-20-31-59`, `-23-38-36`). Harmless real
   backups on the free tier. Left in place — deleting backups is destructive and needs Scott's word.
2. **`CODEX-NOTES.md` is ignored via `.git/info/exclude`, which is local to this machine only.**
   A fresh clone would not ignore it, and this repo is public. Should move into `.gitignore` proper.
3. **5 stale git worktrees** print `failed to delete ... Permission denied` on every git command.
   Noise, not breakage.
4. **The other 20 Codex findings are still untriaged** (back burner per the spec).
5. **New inbox addendum arrived this session (2026-08-29, promote v2 / PART D5)** and it reverses
   adoption-spec item 2: Kids is to migrate to Cloudflare Pages, gain a gated `kids1` dev site, and
   **go private**. ⚠️ Ordering is load-bearing — see the note filed in the inbox. Not started.

---

## Where this leaves the app

Live site untouched: the only pushed changes are Worker source and a test, so GitHub Pages serves
exactly what it served before. No child-facing behaviour changed.
