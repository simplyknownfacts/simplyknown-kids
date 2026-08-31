// The defects the 2026-08-30 triage marked do-soon, and the two escaping gaps it
// left open. See docs/audit/2026-08-30-codex-triage.md.
//
//   Finding 7  — sign-in stuck on "Working…" for ever when the network is down.
//   Finding 13 — a birthday in the future silently makes a child a newborn.
//   Finding 14 — the "Stamp picker" switch did nothing; top-tier Memory Match
//                cards were about 42px wide on a small phone.
//   Finding 2  — a profile id went into an HTML attribute unescaped, and a
//                channel id went into a URL unencoded.
//
// Two layers, the same shape as tests/hostile-input.test.mjs:
//
//   1. Source guards — read the repaired code and fail if the old shape comes
//      back. No dependencies, always run.
//   2. Browser drive — open the real screens in a real browser, with the network
//      genuinely taken away, and watch what a parent would see.
//
// The browser half needs a browser, installed locally and never committed:
//   npm i playwright --no-save && npx playwright install chromium-headless-shell
// Without it those tests report as SKIPPED and the source guards still hold the
// line. See docs/verify/VERIFYING.md.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

/* Today in the local timezone, written the way a date input writes it. The app
   builds this from the local parts on purpose — toISOString() gives the UTC day,
   which is a day out for much of the world every evening — so the test has to
   agree with it, or it would pass in London and fail in Auckland. */
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/* The body of one top-level function, so a guard can say "inside _request" rather
   than "somewhere in the file". */
function functionBody(src, header) {
  const start = src.indexOf(header);
  assert.notEqual(start, -1, `${header} has been renamed or removed`);
  const end = src.indexOf('\n}', start);
  return src.slice(start, end === -1 ? undefined : end);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Source guards — no browser needed, so these always run.
// ─────────────────────────────────────────────────────────────────────────────

test('finding 7: the sync request cannot throw, and cannot hang for ever', () => {
  const body = functionBody(read('js/sync.js'), 'async function _request');
  const tryAt = body.indexOf('try {');
  const fetchAt = body.indexOf('await fetch(');
  assert.notEqual(fetchAt, -1, '_request no longer calls fetch — this guard needs rewriting');
  assert.ok(tryAt !== -1 && tryAt < fetchAt,
    'js/sync.js calls fetch outside a try again. A dead network makes fetch REJECT, and every ' +
    'caller reads a result object, so the exception escapes all the way to the screen and ' +
    'leaves the parent stuck on "Working…" with no way out but closing the app.');
  assert.match(body, /new AbortController\(\)/,
    'js/sync.js has lost its abort timer. On weak wifi a request opens and then never answers; ' +
    'without a deadline the screen it is attached to never moves again.');
  assert.match(body, /REQUEST_TIMEOUT_MS/,
    '_request no longer uses the shared timeout constant.');
});

test('finding 7: the words js/sync.js uses for a dead network are words parent settings understands', () => {
  const body = functionBody(read('js/sync.js'), 'async function _request');
  const settings = read('parent/settings.html');

  const messages = [...body.matchAll(/'([^']*network[^']*)'/g)].map((m) => m[1]);
  assert.ok(messages.length >= 2,
    'expected _request to report both a dead network and a timeout using the word "network"; ' +
    'found ' + messages.length + ' such message(s)');

  assert.match(settings, /raw\.includes\('network'\)/,
    'parent/settings.html no longer recognises "network", so js/sync.js\'s wording would fall ' +
    'through to the vague "Something went wrong signing in".');

  /* The friendly mapper is a chain of if/else, and the network branch is LAST.
     A message worded "invalid network response" would be caught by an earlier
     branch and shown to the parent as "That email or password didn't match" —
     sending them off to reset a password when the real problem is the wifi.
     These are every word that gets tested before the network branch. */
  const earlierBranches = [
    'invite', 'sign-up is closed', 'too many', 'resting',
    'invalid', 'password', 'credential', '401', 'exists', 'already',
  ];
  for (const message of messages) {
    for (const word of earlierBranches) {
      assert.ok(!message.toLowerCase().includes(word),
        `"${message}" contains "${word}", so parent settings would explain a network problem as ` +
        'something else entirely. Reword it.');
    }
  }
});

test('finding 13: a birthday cannot be typed in the future, in the picker or in the save', () => {
  const src = read('parent/settings.html');
  assert.match(src, /bday\.max = _todayISO\(\)/,
    'the birthday picker no longer carries a maximum, so it will offer future dates again.');
  assert.match(src, /if \(birthday > _todayISO\(\)\)/,
    'saveNewProfile no longer refuses a future birthday. The picker attribute alone is not ' +
    'enough — it can be typed over. js/tiers.js reads a future date as nought months old, so ' +
    'one mistyped year turns a nine-year-old into a baby and hides nearly every activity.');
});

test('finding 14: the Stamp picker switch is read, not hardcoded', () => {
  const src = read('art/stamp-art.html');
  assert.ok(!/const showPalette = true/.test(src),
    'art/stamp-art.html has gone back to forcing the stamp picker on, which makes the ' +
    '"Stamp picker" switch in Parent Settings do nothing at all.');
  assert.match(src, /getProfileFeature\(profile, 'stamp-art', 'stampPalette'\)/,
    'art/stamp-art.html should read the stampPalette switch the same way every other activity ' +
    "reads its own switches: on by itself at the registry's age, or early if a grown-up ticks it.");
});

test('finding 14: Memory Match caps its columns to what the screen can afford', () => {
  const src = read('games/memory-match.html');
  assert.match(src, /gridTemplateColumns = `repeat\(\$\{fitCols\(\)\}, 1fr\)`/,
    'games/memory-match.html lays the board out with a fixed column count again. At the top ' +
    'tier that is 6 columns, which is about 42px a card on a 320px phone — too small for a ' +
    "child's finger.");
  assert.match(src, /const MIN_CARD_PX = 48/,
    'the minimum card width has gone. 48px is the size that reliably works for a small hand.');
});

test('finding 2: a profile id and a channel id are escaped on their way out', () => {
  const gameSettings = read('js/game-settings.js');
  assert.ok(!/data-pid="\$\{p\.id\}"/.test(gameSettings),
    'js/game-settings.js puts a profile id straight into an HTML attribute again. Ids are ' +
    'generated by the app but they round-trip through cloud sync, so a poisoned record could ' +
    'hand back one carrying a quote and break out of the attribute.');

  const videos = read('videos/index.html');
  assert.ok(!/\?channel=\$\{\s*ch\.channelId/.test(videos),
    'videos/index.html puts a channel id straight into a URL again. It is typed by a grown-up ' +
    'and round-trips through cloud sync, so an & or a # in it would rewrite the rest of the ' +
    'address. Wrap it in encodeURIComponent.');
  assert.match(videos, /encodeURIComponent\(/,
    'videos/index.html no longer encodes anything on its way into the feed URL.');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Browser drive — the real screens, in a real browser.
// ─────────────────────────────────────────────────────────────────────────────

let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* handled below */ }

const NEEDS_BROWSER = chromium ? false :
  'playwright is not installed. Install it and these checks run: ' +
  'npm i playwright --no-save && npx playwright install chromium-headless-shell';

let server = null, browser = null, BASE = '';

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

/* Reuse scripts/serve.mjs rather than a second copy of a static server. A file://
   page cannot be tested: localStorage, fetch and the service worker all need a
   real http:// origin. */
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
  if (!chromium) return;
  const port = await freePort();
  BASE = 'http://localhost:' + port;
  server = await startServer(port);
  browser = await chromium.launch();
});

after(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
});

function birthdayYearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function birthdayMonthsAgo(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

const SYNC_HOST = 'simplyknown-kids-sync';

/* Seed browser storage before any page script runs, and decide what the page is
   allowed to reach.

   `sync` says what happens to a call to the real sync Worker:
     'dead'    — refused outright, which is what an aeroplane or a dead router
                 looks like to fetch.
     'silent'  — accepted and then never answered, which is what weak wifi looks
                 like. This is the one a request with no deadline waits on for ever.

   Everything else off our own server is blocked either way: no web fonts, no
   YouTube, and above all no real calls to the live sync Worker. */
async function openApp({ storage = {}, sync = 'dead' } = {}) {
  const seed = {
    vb_profiles: JSON.stringify([
      { id: 'kid-a', name: 'Robin', birthday: birthdayYearsAgo(4), color: '#7CC6FF',
        voice: 'woman', mascot: { id: 'fox' }, tierOverrides: {}, features: {}, youtube: [] },
    ]),
    vb_active_id: 'kid-a',
    vb_pin: '1234',
    ...storage,
  };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE)) return route.continue();
    // Deliberately leave the route unanswered: the request hangs, exactly as it
    // does on a connection that opens and then stalls.
    if (sync === 'silent' && url.includes(SYNC_HOST)) return;
    return route.abort();
  });
  await ctx.addInitScript((s) => {
    try { for (const k of Object.keys(s)) localStorage.setItem(k, s[k]); } catch {}
  }, seed);
  return ctx;
}

/* Every parent-settings screen sits behind the PIN pad. A legacy plain-text PIN is
   still accepted, so seed one and tap it in the way a parent would, then open the
   panel under test so the assertions run against something actually on screen. */
async function unlockParentSettings(page, panel) {
  await page.goto(BASE + '/parent/settings.html', { waitUntil: 'load' });
  await page.waitForSelector('#pinPad .pin-key');
  for (const i of [0, 1, 2, 3]) await page.locator('#pinPad .pin-key').nth(i).click();  // 1-2-3-4
  await page.waitForSelector('#mainSettings', { state: 'visible', timeout: 10000 });
  // At phone width the panels are an accordion, opened by tapping their heading.
  await page.locator(`#panel-${panel} .acc-title`).click();
}

/* Fill in the sign-in form and press the button. */
async function attemptSignIn(page) {
  await page.locator('#panel-sync button:has-text("Sign in")').first().click();
  await page.waitForSelector('#syncForm', { state: 'visible' });
  await page.fill('#syncEmail', 'parent@example.com');
  await page.fill('#syncPassword', 'a-real-password');
  await page.locator('#syncSubmit').click();
}

/* What a parent must end up looking at: a sentence they can act on, and a button
   they can press again. Never the word "Working…". */
async function assertRecovered(page, how) {
  await page.waitForFunction(
    () => (document.getElementById('syncMsg')?.textContent || '').includes('reach the sync server'),
    null,
    { timeout: 25000, polling: 200 },
  ).catch(async () => {
    const stuck = await page.textContent('#syncMsg').catch(() => '(gone)');
    assert.fail(`${how}: the sign-in screen never recovered. It still reads "${stuck}". ` +
      'A parent has no way out of this but closing the app.');
  });

  const seen = await page.textContent('#syncMsg');
  assert.ok(!seen.includes('Working'), `${how}: the screen is still on "${seen}"`);

  const button = await page.$eval('#syncSubmit', (b) => ({ disabled: b.disabled, label: b.textContent }));
  assert.equal(button.disabled, false, `${how}: the sign-in button is still disabled — the parent cannot try again`);
  assert.equal(button.label, 'Sign in', `${how}: the sign-in button still reads "${button.label}"`);
}

test('finding 7: signing in with no network at all recovers with a readable message',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await openApp({ sync: 'dead' });
    const page = await ctx.newPage();
    await unlockParentSettings(page, 'sync');
    await attemptSignIn(page);
    await assertRecovered(page, 'network refused');
    await ctx.close();
  });

test('finding 7: signing in when the sync server never answers recovers once the deadline passes',
  { skip: NEEDS_BROWSER }, async () => {
    // Slow on purpose: the request is left hanging and the app's own 15-second
    // deadline has to expire. That wait IS the thing being proved — before the
    // fix this screen waited for ever.
    const ctx = await openApp({ sync: 'silent' });
    const page = await ctx.newPage();
    await unlockParentSettings(page, 'sync');
    await attemptSignIn(page);
    await assertRecovered(page, 'server never answered');
    await ctx.close();
  });

test('finding 13: the birthday picker will not offer a future date',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await openApp();
    const page = await ctx.newPage();
    await unlockParentSettings(page, 'children');
    await page.locator('#panel-children button:has-text("Add Child")').click();
    await page.waitForSelector('#addForm', { state: 'visible' });

    assert.equal(await page.$eval('#newBirthday', (el) => el.max), todayISO(),
      "the birthday field's maximum should be today, in the parent's own timezone");

    await ctx.close();
  });

test('finding 13: a future birthday typed past the picker is refused, and no child is created',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await openApp();
    const page = await ctx.newPage();
    const alerts = [];
    page.on('dialog', (d) => { alerts.push(d.message()); d.dismiss().catch(() => {}); });

    await unlockParentSettings(page, 'children');
    await page.locator('#panel-children button:has-text("Add Child")').click();
    await page.waitForSelector('#addForm', { state: 'visible' });

    await page.fill('#newName', 'Sam');
    // Setting the value directly is the point: the `max` attribute marks the
    // field invalid but does not stop a value being put there, which is why the
    // save path has to check as well.
    await page.fill('#newBirthday', '2031-04-09');
    await page.locator('#addForm button:has-text("Save")').click();
    await page.waitForTimeout(300);

    assert.equal(alerts.length, 1, 'expected exactly one message; got: ' + JSON.stringify(alerts));
    assert.match(alerts[0], /future/i,
      'the message should say plainly that the birthday is in the future; got: ' + alerts[0]);

    const names = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('vb_profiles') || '[]').map((p) => p.name));
    assert.deepEqual(names, ['Robin'],
      'a child with a future birthday was created anyway — js/tiers.js would file them as a newborn');

    // Control: today is not the future, so the same Save gets past the birthday
    // check and stops at the next thing it needs. Without this the test would
    // still pass if the guard refused every date there is.
    await page.fill('#newBirthday', todayISO());
    await page.locator('#addForm button:has-text("Save")').click();
    await page.waitForTimeout(300);

    assert.equal(alerts.length, 2, 'expected a second message; got: ' + JSON.stringify(alerts));
    assert.match(alerts[1], /animal companion/i,
      "today's date should have been accepted and the save moved on to the next question; got: " + alerts[1]);

    await ctx.close();
  });

test('finding 14: the Stamp picker switch actually turns the picker on and off',
  { skip: NEEDS_BROWSER }, async () => {
    /* Six months old is tier 1, below the age js/profiles.js advertises for the
       picker (tier 2, "1-2 yr"), so it starts hidden and the switch is the only
       way to get it. That is what makes the switch observable at all. */
    const baby = [{
      id: 'kid-a', name: 'Robin', birthday: birthdayMonthsAgo(6), color: '#7CC6FF',
      voice: 'woman', mascot: { id: 'fox' }, tierOverrides: {}, features: {}, youtube: [],
    }];

    const off = await openApp({ storage: { vb_profiles: JSON.stringify(baby) } });
    const offPage = await off.newPage();
    await offPage.goto(BASE + '/art/stamp-art.html', { waitUntil: 'load' });
    await offPage.waitForSelector('#canvas');
    await offPage.waitForTimeout(300);
    assert.equal(await offPage.$$eval('.stamp-chip', (e) => e.length), 0,
      'the stamp picker is showing even though it is switched off and the child is too young ' +
      'for it — the switch in Parent Settings does nothing');
    // The grown-up door must not disappear with the toolbar it normally sits in.
    assert.ok(await offPage.$('#gameSettingsGear'),
      'with the picker off there is no toolbar, so the settings gear has to float on its own — ' +
      'otherwise it is hidden inside a bar nobody can see');
    await off.close();

    const withSwitch = JSON.parse(JSON.stringify(baby));
    withSwitch[0].features = { 'stamp-art': { stampPalette: true } };
    const on = await openApp({ storage: { vb_profiles: JSON.stringify(withSwitch) } });
    const onPage = await on.newPage();
    await onPage.goto(BASE + '/art/stamp-art.html', { waitUntil: 'load' });
    await onPage.waitForSelector('.stamp-chip');
    assert.ok(await onPage.$$eval('.stamp-chip', (e) => e.length) > 0,
      'turning the Stamp picker switch on should show the stamps');
    await on.close();
  });

test('finding 14: Memory Match cards stay big enough for a finger on a small phone',
  { skip: NEEDS_BROWSER }, async () => {
    /* Ten years old is the top tier: 12 pairs, and the board asks for 6 columns.
       320px is the narrowest phone still in use. */
    const ctx = await openApp({
      storage: {
        vb_profiles: JSON.stringify([{
          id: 'kid-a', name: 'Robin', birthday: birthdayYearsAgo(10), color: '#7CC6FF',
          voice: 'woman', mascot: { id: 'fox' }, tierOverrides: {}, features: {}, youtube: [],
        }]),
      },
    });
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(BASE + '/games/memory-match.html', { waitUntil: 'load' });
    await page.waitForSelector('.mm-card');

    const cards = await page.$$eval('.mm-card', (els) => els.length);
    assert.equal(cards, 24, 'the difficulty must not change: 12 pairs is still 24 cards');

    const widest = await page.$$eval('.mm-card', (els) =>
      Math.min(...els.map((e) => e.getBoundingClientRect().width)));
    assert.ok(widest >= 48,
      `the narrowest card is ${widest.toFixed(1)}px wide on a 320px phone. Under about 48px a ` +
      "child's finger cannot reliably hit it.");

    await ctx.close();
  });
