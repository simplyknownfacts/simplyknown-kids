// Deploy the static site to the DEV Cloudflare Pages project.
//
// D8 finding (Deploy & Release Standard, Scott's ruling 2026-09-01): this used
// to be a single npm-script string -- `wrangler pages deploy .publish
// --project-name=simplyknown-kids1 ...` -- with the target project typed once
// as a bare CLI flag and nothing checking it. That is the exact shape that
// let Land's own dev deploy nearly bind to its PRODUCTION database (Deploy &
// Release Standard PART B §11): an unverified, inferred target instead of a
// hard-coded one checked in code before anything runs.
//
// This repo has no wrangler.toml for the static site (Kids' Pages project
// carries no D1/KV binding -- that risk shape doesn't apply here), so the
// meaningful fix is narrower: the DEV and PROD project names are named ONCE,
// here, as constants -- never re-typed elsewhere -- and assertSafeDevTarget()
// refuses outright if they were ever edited into matching each other, before
// any network call is made.
//
// --commit-dirty=true is KEPT here, deliberately: DEV is meant for fast,
// uncommitted iteration (unlike deploy:prod-preview, which requires a clean
// tree via scripts/require-clean-tree.mjs). Documented here so nobody "fixes"
// it back out by mistake.
export const DEV_PROJECT = 'simplyknown-kids1';
export const PROD_PROJECT = 'simplyknown-kids';

export function assertSafeDevTarget(devProject, prodProject) {
  if (!devProject || typeof devProject !== 'string') {
    throw new Error('dev deploy refused: no dev project name configured.');
  }
  if (devProject === prodProject) {
    throw new Error(
      'dev deploy refused: the dev and prod project names are identical ("' + devProject + '") -- ' +
      'this would ship a "dev" deploy straight to production. Fix DEV_PROJECT/PROD_PROJECT in ' +
      'scripts/deploy-dev1.mjs before deploying anything.'
    );
  }
  return true;
}

// Only run the deploy when this file is executed directly (`node
// scripts/deploy-dev1.mjs`) -- importing it (as the test suite does, to reach
// assertSafeDevTarget) must never trigger a real wrangler/network call.
// pathToFileURL, not manual string-building: on Windows a raw `file://` +
// backslash-path comparison never matches import.meta.url's real form
// (`file:///C:/...`), which would silently turn this into a no-op script.
const { pathToFileURL } = await import('node:url');
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertSafeDevTarget(DEV_PROJECT, PROD_PROJECT);
  const { execFileSync } = await import('node:child_process');
  execFileSync('npx', [
    '--yes', 'wrangler@4.127.1', 'pages', 'deploy', '.publish',
    '--project-name=' + DEV_PROJECT, '--branch=main', '--commit-dirty=true',
  ], { stdio: 'inherit' });
}
