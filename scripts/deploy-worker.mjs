// Deploy the sync Worker (workers/sync/ -- family sign-in/sync/backup API, its own D1) --
// dev-first, health-checked, and never touches the live worker if dev fails or doesn't answer.
//
// Extracted from the old promote-kids-worker.bat (Windows batch + a `for /f curl` health check)
// into plain Node so it is: (a) callable as its own step from scripts/promote.mjs -- Scott's ask,
// 2026-09-09, "I don't like two separate bats, consolidate" -- and (b) unit-testable against a
// fake wrangler + a local mock health server, the same seam scripts/promote.mjs already uses
// (Codex 0903-5/0905-2), instead of only provable by a human watching a real batch window.
//
// Still runnable on its own too (`node scripts/deploy-worker.mjs`), for a worker-only emergency
// redeploy that doesn't need the whole site gate.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const WORKER_DIR = 'workers/sync';
export const DEV_WORKER_NAME = 'simplyknown-kids-sync-dev';
export const PROD_WORKER_NAME = 'simplyknown-kids-sync';

// Same override knob promote.mjs already uses for the site's wrangler call (Codex 0903-5) --
// reused here on purpose so ONE opt-in (PROMOTE_ALLOW_OVERRIDES=1, checked by the caller) covers
// faking BOTH doors in a test, and a real run still gets the one real pinned wrangler command.
const WRANGLER_CMD = process.env.PROMOTE_WRANGLER_CMD || 'npx --yes wrangler@4.127.1';
const DEV_HEALTH_URL = process.env.PROMOTE_WORKER_DEV_HEALTH_URL
  || `https://${DEV_WORKER_NAME}.simplyknownfacts.workers.dev/health`;
const PROD_HEALTH_URL = process.env.PROMOTE_WORKER_PROD_HEALTH_URL
  || `https://${PROD_WORKER_NAME}.simplyknownfacts.workers.dev/health`;

function runWrangler(args, cwd) {
  // shell:true so WRANGLER_CMD can be a multi-word string ("npx --yes wrangler@4.127.1", or a
  // test's fake-wrangler invocation) exactly like scripts/promote.mjs's own execSync call does.
  execFileSync(WRANGLER_CMD + ' ' + args.join(' '), { cwd, stdio: 'inherit', shell: true });
}

async function checkHealth(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

// say(): plain stdout, matching scripts/promote.mjs's own convention so both steps of one
// `npm run promote` read as one continuous transcript, not two different tools glued together.
function say(s = '') { process.stdout.write(s + '\n'); }

// Throws a plain Error on any failure -- the caller (promote.mjs, or this file's own __main__
// block below) decides how loud to be and whether it's fatal to the whole run.
export async function deploySyncWorker({ cwd = process.cwd() } = {}) {
  const workerCwd = path.join(cwd, WORKER_DIR);

  // schema.sql is idempotent (CREATE ... IF NOT EXISTS throughout), so applying it before every
  // deploy is safe and means a Worker that expects a new table/index never meets a D1 without it.
  say('  Applying schema.sql to the DEV database...');
  runWrangler(['d1', 'execute', 'sync-dev', '--remote', '--file=schema.sql', '--config', 'wrangler.dev.toml'], workerCwd);
  say('  Deploying the DEV sync worker first (a safe test copy)...');
  runWrangler(['deploy', '--config', 'wrangler.dev.toml'], workerCwd);
  if (!(await checkHealth(DEV_HEALTH_URL))) {
    throw new Error(`the DEV worker did not answer /health after deploying -- the LIVE worker was NOT touched. Checked: ${DEV_HEALTH_URL}`);
  }
  say('  Dev worker OK.');

  say('  Applying schema.sql to the LIVE database...');
  runWrangler(['d1', 'execute', 'sync', '--remote', '--file=schema.sql'], workerCwd);
  say('  Deploying the LIVE sync worker...');
  runWrangler(['deploy'], workerCwd);
  if (!(await checkHealth(PROD_HEALTH_URL))) {
    throw new Error(`the LIVE worker did not answer /health after deploying -- check it by hand right away. Checked: ${PROD_HEALTH_URL}`);
  }
  say('  Live worker OK.');

  return { devHealthUrl: DEV_HEALTH_URL, prodHealthUrl: PROD_HEALTH_URL };
}

// Only run when executed directly (`node scripts/deploy-worker.mjs`) -- importing it (as
// scripts/promote.mjs and the test suite both do) must never trigger a real deploy by itself.
const { pathToFileURL } = await import('node:url');
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await deploySyncWorker({ cwd: path.resolve(import.meta.dirname, '..') });
    say('Done -- both worker deploys finished and both workers responded OK.');
  } catch (e) {
    say('FAILED: ' + e.message);
    process.exit(1);
  }
}
