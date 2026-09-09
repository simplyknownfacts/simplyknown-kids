// scripts/deploy-worker.mjs -- extracted from the old promote-kids-worker.bat (Scott, 2026-09-09:
// "consolidate the two bats"). Proves the real dev-first/health-checked/never-touch-prod-if-dev-
// fails behavior against a fake wrangler + a local mock health server -- never a real deploy.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function fakeWorktree() {
  const cwd = mkdtempSync(path.join(tmpdir(), 'kids-deploy-worker-'));
  dirs.push(cwd);
  mkdirSync(path.join(cwd, 'workers', 'sync'), { recursive: true });
  writeFileSync(path.join(cwd, 'workers', 'sync', 'wrangler.toml'), 'name = "x"\n');
  writeFileSync(path.join(cwd, 'workers', 'sync', 'wrangler.dev.toml'), 'name = "x-dev"\n');
  return cwd;
}

function fakeWrangler(exitCode = 0) {
  const dir = mkdtempSync(path.join(tmpdir(), 'kids-deploy-worker-support-'));
  dirs.push(dir);
  const callsFile = path.join(dir, 'calls.jsonl');
  const scriptPath = path.join(dir, 'fake-wrangler.mjs');
  writeFileSync(scriptPath,
    `import { appendFileSync } from 'node:fs';\n` +
    `appendFileSync(${JSON.stringify(callsFile)}, JSON.stringify({argv:process.argv.slice(2),cwd:process.cwd()}) + '\\n');\n` +
    (exitCode ? `process.exit(${exitCode});\n` : `console.log('fake wrangler ok');\n`));
  return { callsFile, cmd: `${JSON.stringify(process.execPath)} ${JSON.stringify(scriptPath)}` };
}

test('deploySyncWorker: deploys dev then prod, health-checks both, in that order', async () => {
  const cwd = fakeWorktree();
  const { callsFile, cmd } = fakeWrangler();
  let devHealthHits = 0, prodHealthHits = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/dev-health') { devHealthHits++; res.writeHead(200); res.end('ok'); return; }
    if (req.url === '/prod-health') { prodHealthHits++; res.writeHead(200); res.end('ok'); return; }
    res.writeHead(404); res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  process.env.PROMOTE_WRANGLER_CMD = cmd;
  process.env.PROMOTE_WORKER_DEV_HEALTH_URL = origin + '/dev-health';
  process.env.PROMOTE_WORKER_PROD_HEALTH_URL = origin + '/prod-health';
  try {
    const { deploySyncWorker } = await import('../scripts/deploy-worker.mjs?t=' + Date.now());
    await deploySyncWorker({ cwd });

    assert.equal(devHealthHits, 1, 'dev health must be checked exactly once');
    assert.equal(prodHealthHits, 1, 'prod health must be checked exactly once');

    const calls = readFileSync(callsFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(calls.length, 2, 'expected exactly 2 wrangler invocations: ' + JSON.stringify(calls));
    assert.ok(calls[0].argv.includes('--config') && calls[0].argv.some((a) => a.includes('wrangler.dev.toml')),
      'first call must be the DEV deploy: ' + JSON.stringify(calls[0]));
    assert.ok(!calls[1].argv.includes('--config'), 'second call must be the plain PROD deploy: ' + JSON.stringify(calls[1]));
    assert.ok(calls.every((c) => c.cwd.endsWith(path.join('workers', 'sync'))),
      'both calls must run from workers/sync, not the repo root: ' + JSON.stringify(calls));
  } finally {
    server.close();
    delete process.env.PROMOTE_WRANGLER_CMD;
    delete process.env.PROMOTE_WORKER_DEV_HEALTH_URL;
    delete process.env.PROMOTE_WORKER_PROD_HEALTH_URL;
  }
});

test('deploySyncWorker: never deploys prod if the dev health check fails', async () => {
  const cwd = fakeWorktree();
  const { callsFile, cmd } = fakeWrangler();
  const server = http.createServer((req, res) => { res.writeHead(500); res.end('down'); }); // every health check fails
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  process.env.PROMOTE_WRANGLER_CMD = cmd;
  process.env.PROMOTE_WORKER_DEV_HEALTH_URL = origin + '/dev-health';
  process.env.PROMOTE_WORKER_PROD_HEALTH_URL = origin + '/prod-health';
  try {
    const { deploySyncWorker } = await import('../scripts/deploy-worker.mjs?t=' + Date.now());
    await assert.rejects(() => deploySyncWorker({ cwd }), /DEV worker did not answer \/health/);

    const calls = readFileSync(callsFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(calls.length, 1, 'the PROD deploy must never run when the dev health check fails: ' + JSON.stringify(calls));
    assert.ok(calls[0].argv.some((a) => a.includes('wrangler.dev.toml')), 'the one call made must be the dev deploy');
  } finally {
    server.close();
    delete process.env.PROMOTE_WRANGLER_CMD;
    delete process.env.PROMOTE_WORKER_DEV_HEALTH_URL;
    delete process.env.PROMOTE_WORKER_PROD_HEALTH_URL;
  }
});

test('deploySyncWorker: rejects with a clear message if the prod health check fails after a real prod deploy', async () => {
  const cwd = fakeWorktree();
  const { cmd } = fakeWrangler();
  const server = http.createServer((req, res) => {
    if (req.url === '/dev-health') { res.writeHead(200); res.end('ok'); return; }
    res.writeHead(500); res.end('down'); // prod health fails
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  process.env.PROMOTE_WRANGLER_CMD = cmd;
  process.env.PROMOTE_WORKER_DEV_HEALTH_URL = origin + '/dev-health';
  process.env.PROMOTE_WORKER_PROD_HEALTH_URL = origin + '/prod-health';
  try {
    const { deploySyncWorker } = await import('../scripts/deploy-worker.mjs?t=' + Date.now());
    await assert.rejects(() => deploySyncWorker({ cwd }), /LIVE worker did not answer \/health/);
  } finally {
    server.close();
    delete process.env.PROMOTE_WRANGLER_CMD;
    delete process.env.PROMOTE_WORKER_DEV_HEALTH_URL;
    delete process.env.PROMOTE_WORKER_PROD_HEALTH_URL;
  }
});
