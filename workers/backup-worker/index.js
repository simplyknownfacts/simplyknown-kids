// Nightly backup: dump every D1 table to Cloudflare R2 as one timestamped JSON file.
// Free (R2 free tier to 10 GB). Uses bindings only — no API token/secret needed.
// Kids app: backs up the CLOUD family-sync D1 ('sync' — profiles/settings/progress).
// (Copied verbatim from the fleet reference impl, Car App/backup-worker; Cars'
//  retentionReport + backupPhotos dropped — Kids has neither.)
async function backup(env) {
  const tables = (await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"
  ).all()).results.map((r) => r.name);
  const dump = { at: new Date().toISOString(), tables: {} };
  for (const t of tables) {
    dump.tables[t] = (await env.DB.prepare(`SELECT * FROM "${t}"`).all()).results;
  }
  const key = `kids/backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  await env.BACKUPS.put(key, JSON.stringify(dump), { httpMetadata: { contentType: 'application/json' } });
  return key;
}

// Compare without leaking, through response time, how much of the secret matched.
function secretMatches(given, expected) {
  if (!expected || !given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      backup(env).catch((e) => console.error('nightly backup failed:', e))
    );
  },
  async fetch(request, env) {
    // manual trigger (for a test run): GET /run with the X-Backup-Secret header.
    // The nightly run goes through scheduled() above and never touches fetch(),
    // so requiring this header cannot break the automatic backup. Codex finding
    // #1 (2026-08-25): without it, anyone who knew this URL could make us dump
    // the whole database to R2 on repeat. Pinned by tests/backup-auth.test.mjs.
    if (new URL(request.url).pathname === '/run') {
      if (!secretMatches(request.headers.get('x-backup-secret'), env.BACKUP_SECRET)) {
        return new Response('unauthorized', { status: 401 });
      }
      try {
        const key = await backup(env);
        return new Response('backup written: ' + key);
      } catch (e) {
        // Log the detail privately; the caller gets nothing to probe with.
        console.error('manual backup failed:', e);
        return new Response('backup failed', { status: 500 });
      }
    }
    return new Response('simplyknown-kids backup worker — runs nightly to R2');
  },
};
