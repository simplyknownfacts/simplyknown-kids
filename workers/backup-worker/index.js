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

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      backup(env).catch((e) => console.error('nightly backup failed:', e))
    );
  },
  async fetch(request, env) {
    // manual trigger (for a test run): GET /run
    if (new URL(request.url).pathname === '/run') {
      const key = await backup(env);
      return new Response('backup written: ' + key);
    }
    return new Response('simplyknown-kids backup worker — runs nightly to R2');
  },
};
