# Kids App — Stage 1 (Cloudflare Pages hosting) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the Kids App from Cloudflare Pages on two environments — public-facing `kids.simplyknown.co` and an Access-gated `kids1.simplyknown.co` dev copy — then gate production and take the repository private, without ever leaving a child's tablet showing a login screen it cannot escape.

**Architecture:** Two Cloudflare Pages projects fed by direct upload from a staged copy of the app files, so `git push` stops being a deploy and the promote gate can later be the only door to production. The dev site talks to its own Worker and its own database, chosen at runtime from the page's hostname, so dev traffic can never touch real family data. Cloudflare Access sits in front of both sites with a one-month session and a two-address allow-list.

**Tech Stack:** Static HTML/CSS/JS PWA (no bundler, no framework), Cloudflare Pages, Cloudflare Workers, Cloudflare D1, Cloudflare Access, wrangler CLI, `node:test`.

## Global Constraints

- **No build step, ever.** Copying and excluding files is allowed. Bundling, minifying, transpiling or otherwise rewriting app code is not. ([[Testing Standard]], spec §4.4)
- **This repository is public until the final task.** Nothing sensitive is committed at any point: no secrets, no tokens, no photograph of a child. Secrets live in `secrets/` and `.env`, both git-ignored.
- **Deploy only from committed source.** Never `wrangler deploy` from a dirty tree — this is the v141 lesson, where running Worker code existed nowhere in git.
- **Allow-list is exactly two addresses:** `satinker2004@yahoo.com` and `simplyknownfacts@gmail.com`. Rule 8.12 forbids `satinker93@gmail.com` appearing anywhere in project infrastructure.
- **Every gated address is verified by fetching it**, never by reading configuration. Rule 8.13, and the 2026-08-14 leak that rule came from.
- **Both addresses of every Pages project get gated** — the custom domain *and* the machine-generated `.pages.dev`.
- Cloudflare credentials: `secrets/cf_api_token.txt` (token `sk-kids`, verified 2026-08-29 to carry Pages, DNS, Access, Workers, D1, R2, Account-read).
- Cloudflare account id: `800641c6f1cf4d042c8ed396c6d901a1`. Zone id for `simplyknown.co`: `c2122c26b90877a0ec8708f67827e203`.

**Shell note:** every command below is written for the Bash tool. Export the token first in each session:

```bash
cd "C:/Users/HomeSeer/OneDrive/Documents/Claude/Projects/Kids_App" && export CLOUDFLARE_API_TOKEN="$(tr -d '\r\n' < secrets/cf_api_token.txt)"
```

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` *(create)* | Scripts only — no dependencies. Gives `npm test` and `npm run deploy:dev1`. |
| `scripts/stage-site.mjs` *(create)* | Copies the publishable app files into `.publish/`. An explicit allow-list, not a filter of exclusions, so a new stray file at the repo root can never leak into a deploy by accident. |
| `tests/stage-site.test.mjs` *(create)* | Proves the staged copy contains the app and excludes tests, docs, Worker source and audit screenshots. |
| `js/sw-cache-policy.js` *(create)* | One function, `vbShouldCache(res)`, deciding whether a fetched response may enter the offline cache. Lives alone because both the service worker and `node:test` must load it. |
| `tests/sw-cache-policy.test.mjs` *(create)* | Proves a login redirect, an error page and an opaque response are all refused. |
| `sw.js` *(modify)* | Import the policy, apply it before `cache.put`, bump the cache version. |
| `js/sync.js:26` *(modify)* | Choose the sync Worker from the page hostname. |
| `workers/sync/wrangler.dev.toml` *(create)* | Same committed Worker source, second name, dev database binding. |

---

### Task 1: Stage only the app files for publishing

Cloudflare Pages would otherwise upload the whole working tree — including `tests/`, `docs/`, `workers/` (Worker source), and roughly thirty audit screenshots such as `bp-review-06.png` and `design-after-home2.png`. None of that belongs on a public children's site.

**Files:**
- Create: `package.json`
- Create: `scripts/stage-site.mjs`
- Create: `tests/stage-site.test.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `.publish/` directory, built by `node scripts/stage-site.mjs`. Tasks 5, 8 and 10 deploy that directory. `npm test` runs every `tests/*.test.*` file.

- [ ] **Step 1: Write the failing test**

Create `tests/stage-site.test.mjs`:

```js
// Publishing the wrong files to a public children's site is a leak, not a bug.
// This pins exactly what reaches Cloudflare Pages.
import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.publish');

function stage() {
  execFileSync(process.execPath, ['scripts/stage-site.mjs'], { cwd: ROOT, stdio: 'pipe' });
}
const has = (p) => fs.existsSync(path.join(OUT, p));

test('the app itself is published', () => {
  stage();
  for (const f of ['index.html', 'home.html', 'sw.js', 'manifest.json', 'icon-192.png',
                   'js/sync.js', 'css/style.css', 'games/tap-pop.html',
                   'learning/count-along.html', 'art/stamp-art.html', 'parent/settings.html']) {
    assert.ok(has(f), `expected ${f} to be published`);
  }
});

test('nothing internal is published', () => {
  stage();
  for (const f of ['tests', 'docs', 'workers', 'scripts', 'secrets', '.env', '.git',
                   'CODEX-NOTES.md', 'TECH-STACK.md', 'CNAME',
                   'bp-review-06.png', 'design-after-home2.png', 'v136-candy-home.png',
                   'voice-test.html', 'voice-test', 'mascot-preview.html']) {
    assert.ok(!has(f), `${f} must NOT be published`);
  }
});

test('no published page links to something we excluded', () => {
  stage();
  const pages = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) pages.push(p);
    }
  })(OUT);
  const broken = [];
  for (const p of pages) {
    const html = fs.readFileSync(p, 'utf8');
    for (const m of html.matchAll(/(?:src|href)="(?!https?:|data:|mailto:|#)([^"?#]+)/g)) {
      const target = m[1].startsWith('/')
        ? path.join(OUT, m[1])
        : path.resolve(path.dirname(p), m[1]);
      if (!fs.existsSync(target)) broken.push(path.relative(OUT, p) + ' -> ' + m[1]);
    }
  }
  assert.deepStrictEqual(broken, [], 'published pages reference missing files');
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --test tests/stage-site.test.mjs
```

Expected: FAIL — `Cannot find module .../scripts/stage-site.mjs`.

- [ ] **Step 3: Write the staging script**

Create `scripts/stage-site.mjs`:

```js
// Build .publish/ — the exact set of files that goes to Cloudflare Pages.
//
// This is an ALLOW-list on purpose. The repo root also holds audit screenshots,
// Worker source, tests and scratch pages; an exclude-list would silently start
// publishing the next stray file someone drops here. Copying only. No bundling,
// no minifying, no rewriting — the zero-build simplicity is the point.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.publish');

const PUBLISH = [
  // pages
  'index.html', 'home.html', 'about.html', 'privacy.html', 'achievements.html',
  'yoto-callback.html',
  // PWA plumbing
  'manifest.json', 'offline-manifest.json', 'sw.js', 'icon-192.png', 'icon-512.png',
  // app directories
  'css', 'js', 'assets', 'audio', 'mascots',
  'art', 'games', 'learning', 'listen', 'parent', 'videos',
];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let files = 0;
for (const entry of PUBLISH) {
  const from = path.join(ROOT, entry);
  if (!fs.existsSync(from)) throw new Error('stage-site: missing ' + entry);
  fs.cpSync(from, path.join(OUT, entry), { recursive: true });
}
(function count(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) count(path.join(d, e.name));
    else files++;
  }
})(OUT);

console.log('staged ' + files + ' files into .publish/');
if (files > 20000) throw new Error('over the Cloudflare Pages 20,000-file limit: ' + files);
```

- [ ] **Step 4: Add the scripts file**

Create `package.json`:

```json
{
  "name": "simplyknown-kids",
  "private": true,
  "description": "SimplyKnown Kids — static offline-first PWA. Scripts only: this project has no dependencies and no build step.",
  "scripts": {
    "test": "node --test tests/",
    "stage": "node scripts/stage-site.mjs",
    "deploy:dev1": "npm run stage && wrangler pages deploy .publish --project-name=simplyknown-kids1 --branch=main --commit-dirty=true"
  }
}
```

- [ ] **Step 5: Keep the staged copy out of git**

Append to `.gitignore`:

```
# staged copy uploaded to Cloudflare Pages — regenerable, never committed
.publish/
```

- [ ] **Step 6: Run the tests and watch them pass**

```bash
node --test tests/stage-site.test.mjs
```

Expected: PASS, 3 tests. If the third test reports broken links, fix them by adding the genuinely-needed file to `PUBLISH` — never by weakening the test.

- [ ] **Step 7: Confirm the existing tests still run under the new runner**

```bash
npm test
```

Expected: the achievement tests and the backup-auth tests all pass alongside the new ones.

- [ ] **Step 8: Commit**

```bash
git add package.json scripts/stage-site.mjs tests/stage-site.test.mjs .gitignore && git commit -m "build: stage only the app files for Cloudflare Pages"
```

---

### Task 2: Stop the service worker caching a login page as if it were the app

**This is the failure that would brick a child's tablet.** [sw.js:214-218](../../../sw.js) caches every response it receives with no check at all:

```js
fetch(e.request, { cache: 'no-store' }).then(res => {
  const copy = res.clone();
  caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
  return res;
})
```

Once Access is in front of the site, an expired session answers with a redirect to a Cloudflare login page. The service worker stores that page under `index.html`, and from then on the app opens to a login screen — or nothing — even offline, even after the session is fixed. This task must land **before** any Access application exists.

**Files:**
- Create: `js/sw-cache-policy.js`
- Create: `tests/sw-cache-policy.test.mjs`
- Modify: `sw.js:1` (cache version), `sw.js` (importScripts + the guard + ASSETS list)

**Interfaces:**
- Consumes: nothing.
- Produces: `vbShouldCache(res)` → `boolean`, available on `self` inside the service worker and as a CommonJS export for tests.

- [ ] **Step 1: Write the failing test**

Create `tests/sw-cache-policy.test.mjs`:

```js
// Cloudflare Access answers an expired session with a redirect to a login page.
// If the service worker caches that, the app opens to a login screen forever --
// including offline, where it cannot possibly log in. Nothing but a clean,
// same-origin 200 may enter the offline cache.
import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
const { vbShouldCache } = createRequire(import.meta.url)('../js/sw-cache-policy.js');

const res = (o) => ({ ok: true, status: 200, redirected: false, type: 'basic', ...o });

test('a clean same-origin page is cacheable', () => {
  assert.strictEqual(vbShouldCache(res()), true);
});

test('a response we were redirected to is refused', () => {
  assert.strictEqual(vbShouldCache(res({ redirected: true })), false);
});

test('an error page is refused', () => {
  assert.strictEqual(vbShouldCache(res({ ok: false, status: 404 })), false);
  assert.strictEqual(vbShouldCache(res({ ok: false, status: 302 })), false);
});

test('a cross-origin or opaque response is refused', () => {
  assert.strictEqual(vbShouldCache(res({ type: 'opaqueredirect' })), false);
  assert.strictEqual(vbShouldCache(res({ type: 'cors' })), false);
});

test('nothing at all is refused rather than throwing', () => {
  assert.strictEqual(vbShouldCache(null), false);
  assert.strictEqual(vbShouldCache(undefined), false);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --test tests/sw-cache-policy.test.mjs
```

Expected: FAIL — cannot find `../js/sw-cache-policy.js`.

- [ ] **Step 3: Write the policy**

Create `js/sw-cache-policy.js`:

```js
// Loaded two ways on purpose: importScripts() inside sw.js, and require() from
// node:test. Matches how js/achievement-defs.js is already shared with tests.
(function (root) {
  // Only a clean, same-origin 200 may be stored for offline use.
  //   redirected  -> Cloudflare Access bounced us to a login page
  //   !ok         -> an error or challenge page
  //   type!=basic -> cross-origin or opaque; we cannot see inside it
  function vbShouldCache(res) {
    return !!res && res.ok === true && res.redirected !== true && res.type === 'basic';
  }
  root.vbShouldCache = vbShouldCache;
})(typeof self !== 'undefined' ? self : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { vbShouldCache: (typeof self !== 'undefined' ? self : globalThis).vbShouldCache };
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
node --test tests/sw-cache-policy.test.mjs
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Load the policy in the service worker**

At the very top of `sw.js`, above `const CACHE = 'vb-v141';`, insert:

```js
importScripts('./js/sw-cache-policy.js');
```

- [ ] **Step 6: Apply the guard where the caching happens**

In `sw.js`, replace the network-first body:

```js
      fetch(e.request, { cache: 'no-store' }).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(e.request))
```

with:

```js
      fetch(e.request, { cache: 'no-store' }).then(res => {
        // Never cache a login redirect or an error page. Behind Cloudflare Access
        // an expired session answers with one, and a cached login page would make
        // the app unopenable offline. See js/sw-cache-policy.js.
        if (self.vbShouldCache(res)) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(e.request))
```

- [ ] **Step 7: Add the new file to the precache list and bump the version**

In `sw.js`, change `const CACHE = 'vb-v141';` to `const CACHE = 'vb-v142';`, and add `'./js/sw-cache-policy.js'` to the `ASSETS` array next to the other `js/` entries. A new js file that is not in `ASSETS` breaks offline mode — that is the v123 lesson.

- [ ] **Step 8: Check the service worker still parses**

```bash
node --check sw.js && npm test
```

Expected: no output from `node --check`, and every test passes.

- [ ] **Step 9: Commit**

```bash
git add js/sw-cache-policy.js tests/sw-cache-policy.test.mjs sw.js && git commit -m "sw: never cache a login redirect or error page"
```

---

### Task 3: Give dev its own Worker and its own database

Rule 8.10: dev must not write to real family data. The dev Worker is the same committed source under a second name, with a dev database and **no ElevenLabs key**, so a dev environment can never spend money generating voice clips.

**Files:**
- Create: `workers/sync/wrangler.dev.toml`

**Interfaces:**
- Consumes: nothing.
- Produces: `https://simplyknown-kids-sync-dev.simplyknownfacts.workers.dev` — same endpoints as production (`/signup /signin /push /pull /signout`), backed by D1 database `sync-dev`. Task 4 points the dev site at this URL.

- [ ] **Step 1: Create the dev database and record its id**

```bash
npx wrangler d1 create sync-dev
```

Expected: prints a `database_id`. Copy it — the next step needs it.

- [ ] **Step 2: Write the dev Worker config**

Create `workers/sync/wrangler.dev.toml`, substituting the id printed above for `<DEV_DATABASE_ID>`:

```toml
# The DEV twin of the family-sync Worker. Same committed source as production,
# second name, its own database. Rule 8.10: dev never touches real family data.
#
# Deliberately has NO ElevenLabs secret. The same Worker hosts the paid
# voice-generation endpoints, and a dev environment must not be able to spend
# money -- without the key those endpoints fail and nothing else is affected.
name = "simplyknown-kids-sync-dev"
main = "src/index.js"
compatibility_date = "2026-07-01"

[[d1_databases]]
binding = "DB"
database_name = "sync-dev"
database_id = "<DEV_DATABASE_ID>"
```

- [ ] **Step 3: Create the tables the Worker expects**

The `accounts` and `data` schemas exist only as a comment at `workers/sync/src/index.js:11`, so they must be created by hand:

```bash
npx wrangler d1 execute sync-dev --remote --command "CREATE TABLE IF NOT EXISTS accounts (email_hash TEXT PRIMARY KEY, pw_hash TEXT, pw_salt TEXT, sync_key TEXT, created_at INTEGER); CREATE TABLE IF NOT EXISTS data (email_hash TEXT PRIMARY KEY, profiles TEXT, updated_at INTEGER);"
```

Expected: reports the statements executed.

- [ ] **Step 4: Commit before deploying**

```bash
git add workers/sync/wrangler.dev.toml && git commit -m "sync-worker: dev twin config, own database, no voice key"
```

- [ ] **Step 5: Deploy the dev Worker from committed source**

```bash
cd workers/sync && npx wrangler deploy --config wrangler.dev.toml
```

Expected: `Deployed simplyknown-kids-sync-dev`.

- [ ] **Step 6: Prove it is alive and separate**

```bash
curl -s -o /dev/null -w "dev signin reachable: HTTP %{http_code}\n" -X POST -H "Content-Type: application/json" -d '{"email":"nobody@example.com","password":"x"}' https://simplyknown-kids-sync-dev.simplyknownfacts.workers.dev/signin
```

Expected: `HTTP 404` — the Worker answered, and no such account exists in the dev database. Anything other than 404 means the wrong database is bound; stop and re-check.

---

### Task 4: Point the dev site at the dev Worker

**Files:**
- Modify: `js/sync.js:26`

**Interfaces:**
- Consumes: the dev Worker URL from Task 3.
- Produces: every page that loads `sync.js` automatically talks to the right backend. No other file changes, and no build step.

- [ ] **Step 1: Replace the hard-coded base URL**

In `js/sync.js`, replace line 26:

```js
const SYNC_BASE = 'https://simplyknown-kids-sync.simplyknownfacts.workers.dev';
```

with:

```js
// Which backend this copy of the app talks to is decided by the page's own
// hostname -- kids1.simplyknown.co and simplyknown-kids1.pages.dev are the dev
// site and get the dev Worker and dev database. Rule 8.10: dev must never write
// real family data. A runtime check, so there is still no build step.
const SYNC_BASE = /^(kids1\.|simplyknown-kids1\.)/.test(location.hostname)
  ? 'https://simplyknown-kids-sync-dev.simplyknownfacts.workers.dev'
  : 'https://simplyknown-kids-sync.simplyknownfacts.workers.dev';
```

- [ ] **Step 2: Check it parses**

```bash
node --check js/sync.js
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add js/sync.js && git commit -m "sync: pick the backend from the hostname so dev cannot touch prod data"
```

---

### Task 5: Publish the dev site and prove the two environments are isolated

**Files:** none — this task is deployment and verification.

**Interfaces:**
- Consumes: `.publish/` (Task 1), the dev Worker (Task 3), the hostname switch (Task 4).
- Produces: a live `simplyknown-kids1.pages.dev`.

- [ ] **Step 1: Create the dev Pages project**

```bash
npx wrangler pages project create simplyknown-kids1 --production-branch=main
```

Expected: confirms the project and prints `simplyknown-kids1.pages.dev`.

- [ ] **Step 2: Deploy**

```bash
npm run deploy:dev1
```

Expected: `staged NNNN files into .publish/` followed by an upload summary and a deployment URL.

- [ ] **Step 3: Prove the site loads**

```bash
curl -s -o /dev/null -w "dev site: HTTP %{http_code}\n" https://simplyknown-kids1.pages.dev/
curl -s https://simplyknown-kids1.pages.dev/js/sync.js | grep -c "simplyknown-kids-sync-dev"
```

Expected: `HTTP 200`, and the grep prints `1` — the deployed copy really does carry the dev switch.

- [ ] **Step 4: Record the production account count before touching anything**

```bash
npx wrangler d1 execute sync --remote --command "SELECT COUNT(*) AS n FROM accounts"
```

Expected: `2`. Write this number down.

- [ ] **Step 5: Create an account through the dev site's backend**

```bash
curl -s -X POST -H "Content-Type: application/json" -d '{"email":"isolation-check@example.com","password":"correct-horse-battery"}' https://simplyknown-kids-sync-dev.simplyknownfacts.workers.dev/signup
```

Expected: a JSON body containing `syncKey`.

- [ ] **Step 6: Prove production was not touched**

```bash
echo "--- dev (expect 1) ---";  npx wrangler d1 execute sync-dev --remote --command "SELECT COUNT(*) AS n FROM accounts"
echo "--- prod (expect 2) ---"; npx wrangler d1 execute sync     --remote --command "SELECT COUNT(*) AS n FROM accounts"
```

Expected: dev `1`, production still `2`. **If production moved, stop — the isolation is broken and nothing else in this plan may proceed.**

---

### Task 6: Gate the dev site, and prove the offline app survives the gate

The must-prove of the whole migration (spec §7). It happens on the dev site, where a mistake costs nothing.

**Files:** none — configuration and verification.

**Interfaces:**
- Consumes: the live dev site (Task 5) and the cache guard (Task 2).
- Produces: an Access application id, reused as the template for production in Task 10.

- [ ] **Step 1: Make sure the email one-time-PIN login method exists**

```bash
curl -s -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  --data '{"name":"One-time PIN","type":"onetimepin","config":{}}' \
  "https://api.cloudflare.com/client/v4/accounts/800641c6f1cf4d042c8ed396c6d901a1/access/identity_providers"
```

Expected: `"success":true`. If it reports the provider already exists, that is equally fine — carry on.

- [ ] **Step 2: Create the Access application over both dev addresses**

Cloudflare's longest session is one month, expressed as `730h`. Run once per address:

```bash
for D in kids1.simplyknown.co simplyknown-kids1.pages.dev; do
  curl -s -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
    --data "{\"name\":\"Kids dev ($D)\",\"domain\":\"$D\",\"type\":\"self_hosted\",\"session_duration\":\"730h\"}" \
    "https://api.cloudflare.com/client/v4/accounts/800641c6f1cf4d042c8ed396c6d901a1/access/apps"
  echo
done
```

Expected: two `"success":true` bodies. Record each `id`. **If Cloudflare rejects `730h`, do not silently fall back to 24h** — report the accepted maximum to Scott, because a one-month session is an explicit requirement.

- [ ] **Step 3: Attach the two-address allow-list to each application**

For each application id from the previous step:

```bash
curl -s -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  --data '{"name":"Family","decision":"allow","include":[{"email":{"email":"satinker2004@yahoo.com"}},{"email":{"email":"simplyknownfacts@gmail.com"}}]}' \
  "https://api.cloudflare.com/client/v4/accounts/800641c6f1cf4d042c8ed396c6d901a1/access/apps/<APP_ID>/policies"
```

Expected: `"success":true`.

- [ ] **Step 4: Prove the gate by fetching, not by reading config**

```bash
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" https://simplyknown-kids1.pages.dev/
```

Expected: a 302 whose target contains `cloudflareaccess.com`. A 200 means the app is still wide open — stop and fix before going near production.

- [ ] **Step 5: Prove the service worker refuses to cache the login page**

This is the check the whole task exists for. In a browser, open `https://simplyknown-kids1.pages.dev/` and sign in with `simplyknownfacts@gmail.com`. Then in DevTools → Console:

```js
await navigator.serviceWorker.ready;
const c = await caches.open('vb-v142');
const hit = await c.match('/index.html') || await c.match('/');
console.log(hit ? (await hit.clone().text()).slice(0, 300) : 'nothing cached yet');
```

Expected: either nothing cached yet, or the app's own HTML. **If the text mentions Cloudflare Access or a sign-in form, the guard is not working — stop, fix `js/sw-cache-policy.js`, redeploy, and repeat.**

- [ ] **Step 6: Prove it survives going offline**

Still in DevTools: Network tab → set Offline → reload the page.

Expected: the app renders from cache. It cannot sync while offline, and that is fine. A login screen or a blank page here is a **stop**.

- [ ] **Step 7: Write down what happened**

Append the observed results of Steps 4–6 to `docs/handoff/2026-08-29-handoff-backup-endpoint-auth.md` under a new "Stage 1 gate proof" heading, then commit. Evidence that only exists in a terminal scrollback is not evidence.

---

### Task 7: Publish production to Cloudflare, still ungated, GitHub Pages untouched

**Files:**
- Modify: `package.json` (add `deploy:prod-preview`)

**Interfaces:**
- Consumes: `.publish/`.
- Produces: a live `simplyknown-kids.pages.dev` serving the real app.

- [ ] **Step 1: Create the production Pages project**

```bash
npx wrangler pages project create simplyknown-kids --production-branch=main
```

Expected: prints `simplyknown-kids.pages.dev`.

- [ ] **Step 2: Add the deploy script**

In `package.json`, add to `"scripts"`:

```json
    "deploy:prod-preview": "npm run stage && wrangler pages deploy .publish --project-name=simplyknown-kids --branch=main --commit-dirty=true"
```

This is a temporary hand-run entry point for Stage 1 only. Stage 3 replaces it with `promote-kids.bat`, which is then the single door to production.

- [ ] **Step 3: Commit, then deploy**

```bash
git add package.json && git commit -m "build: temporary prod deploy script for the Stage 1 cutover"
npm run deploy:prod-preview
```

- [ ] **Step 4: Prove it serves the real app and is still open**

```bash
curl -s -o /dev/null -w "prod pages.dev: HTTP %{http_code}\n" https://simplyknown-kids.pages.dev/
curl -s https://simplyknown-kids.pages.dev/js/sync.js | grep -c "simplyknown-kids-sync\.simplyknownfacts"
curl -s -o /dev/null -w "github pages still alive: HTTP %{http_code}\n" https://kids.simplyknown.co/
```

Expected: `HTTP 200`; the grep prints `1`, proving the production copy talks to the **production** Worker; and the live site still answers 200 from GitHub Pages.

---

### Task 8: Move the two custom domains onto Cloudflare Pages

Dev first. Production second, and only once dev is known good.

**Files:** none.

**Interfaces:**
- Consumes: both Pages projects.
- Produces: `kids1.simplyknown.co` and `kids.simplyknown.co` served by Cloudflare.

- [ ] **Step 1: Attach the dev domain**

```bash
curl -s -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  --data '{"name":"kids1.simplyknown.co"}' \
  "https://api.cloudflare.com/client/v4/accounts/800641c6f1cf4d042c8ed396c6d901a1/pages/projects/simplyknown-kids1/domains"
```

Expected: `"success":true`.

- [ ] **Step 2: Create its DNS record**

```bash
curl -s -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"kids1","content":"simplyknown-kids1.pages.dev","proxied":true}' \
  "https://api.cloudflare.com/client/v4/zones/c2122c26b90877a0ec8708f67827e203/dns_records"
```

Expected: `"success":true`.

- [ ] **Step 3: Prove the dev domain is live and gated**

```bash
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" https://kids1.simplyknown.co/
```

Expected: a 302 to `cloudflareaccess.com`. If it returns 200, the Access application from Task 6 did not cover this address — fix that before continuing.

- [ ] **Step 4: Record the current production DNS record so it can be put back**

```bash
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/c2122c26b90877a0ec8708f67827e203/dns_records?name=kids.simplyknown.co"
```

Expected: the existing record pointing at `simplyknownfacts.github.io`. **Save the whole JSON body into `docs/handoff/` and commit it** — this is the rollback.

- [ ] **Step 5: Attach the production domain to the Pages project**

```bash
curl -s -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  --data '{"name":"kids.simplyknown.co"}' \
  "https://api.cloudflare.com/client/v4/accounts/800641c6f1cf4d042c8ed396c6d901a1/pages/projects/simplyknown-kids/domains"
```

- [ ] **Step 6: Repoint the production DNS record**

Using the record id from Step 4:

```bash
curl -s -X PATCH -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"kids","content":"simplyknown-kids.pages.dev","proxied":true}' \
  "https://api.cloudflare.com/client/v4/zones/c2122c26b90877a0ec8708f67827e203/dns_records/<RECORD_ID>"
```

- [ ] **Step 7: Prove the live site now comes from Cloudflare and still works**

```bash
curl -s -o /dev/null -w "live site: HTTP %{http_code}\n" https://kids.simplyknown.co/
curl -sI https://kids.simplyknown.co/ | grep -i "^server:"
curl -s https://kids.simplyknown.co/js/sync.js | grep -c "simplyknown-kids-sync\.simplyknownfacts"
```

Expected: `HTTP 200`; a `server: cloudflare` header; grep prints `1`.

- [ ] **Step 8: Check it on a real device**

Open `kids.simplyknown.co` on the phone or tablet that already has the app installed. Enter a child profile, open one activity, confirm the voice plays. GitHub Pages is still live behind this, so if anything is wrong, put the DNS record from Step 4 back and the site returns within minutes.

---

### Task 9: Soak

**Files:** none.

- [ ] **Step 1: Leave it alone**

Give it at least a day of normal use with GitHub Pages still standing by. The point is to catch anything the checks above cannot see — a slow asset, a broken activity, an installed copy that will not update.

- [ ] **Step 2: Confirm before proceeding**

Ask Scott directly whether the site has behaved. Task 10 is the one-way door: it ends GitHub Pages permanently. Do not start it without his word.

---

### Task 10: Gate production and take the repository private

Both halves in one task on purpose. Gating the site while an ungated copy is still served from GitHub Pages would leave the same app reachable without a login — exactly the failure found on 2026-08-14.

**Files:**
- Modify: `CLAUDE.md` (deploy story; note this file is git-ignored and stays local)
- Delete: `CNAME`

**Interfaces:**
- Consumes: the Access application template from Task 6.
- Produces: the finished Stage 1 state.

- [ ] **Step 1: Gate both production addresses**

```bash
for D in kids.simplyknown.co simplyknown-kids.pages.dev; do
  curl -s -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
    --data "{\"name\":\"Kids prod ($D)\",\"domain\":\"$D\",\"type\":\"self_hosted\",\"session_duration\":\"730h\"}" \
    "https://api.cloudflare.com/client/v4/accounts/800641c6f1cf4d042c8ed396c6d901a1/access/apps"
  echo
done
```

Then attach the same two-address policy to each new application id, exactly as in Task 6 Step 3.

- [ ] **Step 2: Prove both are gated**

```bash
for U in https://kids.simplyknown.co/ https://simplyknown-kids.pages.dev/; do
  printf '%-45s' "$U"; curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" "$U"
done
```

Expected: both 302 to `cloudflareaccess.com`.

- [ ] **Step 3: Remove the GitHub Pages domain claim**

```bash
git rm CNAME && git commit -m "chore: drop CNAME, GitHub Pages no longer serves this app"
git push origin main
```

- [ ] **Step 4: Take the repository private**

```bash
gh repo edit simplyknownfacts/simplyknown-kids --visibility private --accept-visibility-change-consequences
```

- [ ] **Step 5: Prove the old public addresses are gone**

```bash
curl -s -o /dev/null -w "github.io project page: HTTP %{http_code}\n" https://simplyknownfacts.github.io/simplyknown-kids/
gh api repos/simplyknownfacts/simplyknown-kids --jq '.private'
```

Expected: `404` for the GitHub-hosted copy, and `true` for the repository.

- [ ] **Step 6: Confirm the live site is unharmed**

```bash
curl -s -o /dev/null -w "live site: HTTP %{http_code} -> %{redirect_url}\n" https://kids.simplyknown.co/
```

Expected: still a 302 to Cloudflare Access — proof the site is up and gated, not down.

- [ ] **Step 7: Update the project's own documentation**

Replace the "Hosting + deploy facts" section of `CLAUDE.md` with the truth: two Cloudflare Pages projects, deploys by direct upload from a staged copy, the two Workers deployed by hand from committed source, both sites behind Cloudflare Access with a one-month session and a two-address allow-list, and a pointer to `docs/superpowers/specs/2026-08-29-cloudflare-migration-design.md` for why gating production reverses rule 8.13's Kids exception. Delete the claim that pushing to `main` deploys anything.

- [ ] **Step 8: Confirm the tree is clean and pushed**

```bash
git status --short && git log --oneline -1 && git status -sb | head -1
```

Expected: no output from `--short`, and no ahead/behind marker.

---

## What this plan does NOT cover

Each of these gets its own plan, written when its stage starts. They are listed so nobody mistakes Stage 1 for the finished job:

- **Stage 1b — real multi-device sign-in.** Spec §6. Signing in on a second device still signs the first one out; Scott's "sign in on any device" requirement is not met until that lands.
- **Stage 2 — the tests and the verification recipe.** Spec §8. The smoke run, `tests/hostile-input.test.mjs`, and `docs/verify/VERIFYING.md`.
- **Stage 3 — the promote gate.** Spec §9, and per master's 2026-08-31 ruling: `promote-kids.bat` follows [[Deploy & Release Standard]] PART D exactly like the rest of the fleet, not a Kids-specific shape. `npm run deploy:prod-preview` (Task 7) is the status quo only until Stage 3 lands and is **not** a gate — it must not be mistaken for one. The `DEV-VERIFIED.json` refusal and the desktop shortcut are part of PART D, not optional extras.
- **Parked, needs a real device: whether `/voice-clip` can safely require session auth.** Closed 2026-08-31 to a hashed-IP rate limit instead of full auth, because it's fetched from a child's own home screen possibly signed-out/offline and a stricter fix couldn't be verified without a real device. Master's ruling: check this at the tablet-in-hand step of this migration (Task 8/9) — same session, same device, one extra check.
