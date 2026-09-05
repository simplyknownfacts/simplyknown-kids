// Pure logic for scripts/dev-verify.mjs's Codex 0903-2 fix, split out so it
// can be unit tested with a fake fetch -- the real script's full run (npm
// test + a real browser drive) is expensive and needs an actual reachable
// server, which tests/dev-verify.test.mjs's own header already says is
// proven by literally running the script per docs/verify/VERIFYING.md, not
// simulated in a unit test.

export function extractVersion(src) {
  const m = (src || '').match(/APP_VERSION\s*=\s*'([^']+)'/);
  return m ? m[1] : null;
}

// fetchImpl defaults to the real global fetch; a test passes a fake one.
export async function checkLiveVersionMatches(base, localVersion, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(base.replace(/\/$/, '') + '/js/version.js', { cache: 'no-store' });
  } catch (e) {
    return { ok: false, reason: 'fetch failed: ' + e.message };
  }
  if (!res.ok) return { ok: false, reason: 'HTTP ' + res.status };
  const text = await res.text();
  const liveVersion = extractVersion(text);
  if (!liveVersion) return { ok: false, reason: 'no readable APP_VERSION in the response' };
  if (liveVersion !== localVersion) {
    return { ok: false, reason: base + ' is running version ' + liveVersion + ', not ' + localVersion, liveVersion };
  }
  return { ok: true, liveVersion };
}

// Codex 0905-3, HIGH fix: js/version.js's APP_VERSION does not change on every commit -- it is
// '1.0.0' across this app's entire history so far, bumped by hand only for a real release. So
// checkLiveVersionMatches above can be satisfied by ANY commit that happens to share that version
// string, not necessarily the one a given dev-verify pass is actually trying to authorize -- a
// stale dev1 deploy of an older commit can pass forever. Deploy & Release Standard PART D10: "the
// stamp names the commit that was verified." This checks the one thing that actually identifies a
// specific commit: the full git SHA, read back from version.json, a build artifact written fresh
// at STAGE time (scripts/stage-site.mjs for dev, scripts/lib/stage-from-git.mjs for prod, and
// scripts/serve.mjs's own live route for local testing) -- never a hand-maintained string that
// can go stale. fetchImpl defaults to the real global fetch; a test passes a fake one.
export async function checkLiveCommitMatches(base, localCommit, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(base.replace(/\/$/, '') + '/version.json', { cache: 'no-store' });
  } catch (e) {
    return { ok: false, reason: 'fetch failed: ' + e.message };
  }
  if (!res.ok) return { ok: false, reason: 'HTTP ' + res.status + ' fetching version.json' };
  let body;
  try {
    body = JSON.parse(await res.text());
  } catch (e) {
    return { ok: false, reason: 'version.json did not parse as JSON: ' + e.message };
  }
  const liveCommit = body && typeof body.commit === 'string' ? body.commit : null;
  if (!liveCommit) return { ok: false, reason: 'version.json has no readable "commit" field' };
  if (liveCommit !== localCommit) {
    return { ok: false, reason: base + ' is running commit ' + liveCommit + ', not ' + localCommit, liveCommit };
  }
  return { ok: true, liveCommit };
}
