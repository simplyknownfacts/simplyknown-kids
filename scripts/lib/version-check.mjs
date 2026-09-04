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
