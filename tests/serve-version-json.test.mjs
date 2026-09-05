// Codex 0905-3, HIGH. scripts/dev-verify.mjs's own header documents proving it against a plain
// local server when kids1 is unreachable (Cloudflare Access has no service token configured
// there yet — see that file's "KNOWN TRAP"):
//
//   node scripts/serve.mjs                                  (one terminal)
//   BASE=http://localhost:8790 npm run verify:dev            (another)
//
// scripts/serve.mjs serves the raw repo (no build step), so it has no version.json on disk —
// that file is only ever written at STAGE time, inside .publish/ (scripts/stage-site.mjs,
// scripts/lib/stage-from-git.mjs — see tests/stage-site.test.mjs and
// tests/stage-from-git.test.mjs). Without this fix, the documented local-testing workflow above
// would 404 on dev-verify's new [4/4] commit check the moment it shipped — a real regression in a
// path Codex's own finding never had to consider. Fixed by having serve.mjs answer /version.json
// itself, computed live from this repo's real HEAD, exactly matching what a build artifact would
// have said if one existed on disk here.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

let server = null, BASE = '';

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], {
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const giveUp = setTimeout(
      () => reject(new Error('scripts/serve.mjs did not come up within 15s')), 15000);
    child.stdout.on('data', (d) => {
      if (String(d).includes('localhost:' + port)) { clearTimeout(giveUp); resolve(child); }
    });
    child.once('error', (e) => { clearTimeout(giveUp); reject(e); });
    child.once('exit', (c) => { clearTimeout(giveUp); reject(new Error('the server exited early, code ' + c)); });
  });
}

before(async () => {
  const port = await freePort();
  BASE = 'http://localhost:' + port;
  server = await startServer(port);
});

after(() => { if (server) server.kill(); });

test('scripts/serve.mjs serves /version.json naming this repo\'s real HEAD, live, no build step needed', async () => {
  const res = await fetch(BASE + '/version.json', { cache: 'no-store' });
  assert.equal(res.status, 200);
  const body = await res.json();
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(body.commit, headSha,
    'version.json served by the local dev server must name the real repo HEAD: ' + JSON.stringify(body));
});
