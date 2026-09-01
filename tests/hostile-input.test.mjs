// Hostile input must be shown, never obeyed.
//
// The audit of 2026-08-25 (CODEX-NOTES.md, finding 2) found values that a person
// types — or that arrive from the sync server — being pasted into pages as HTML
// instead of as text. A name, a channel label or an account email containing
// markup would then run as code on the app's own origin, which is where the cloud
// sync key and the Yoto tokens are stored. This file exists so that hole cannot
// quietly come back.
//
// Two layers, on purpose:
//
//   1. Source guard — reads the four repaired places and fails if the dangerous
//      interpolation reappears. No dependencies, always runs.
//   2. Browser drive — seeds a hostile value into real browser storage, opens the
//      real screen in a real browser, and proves the payload came out as visible
//      text: nothing executed, and no element was created from it.
//
// The browser half needs a browser, installed locally and never committed:
//   npm i playwright --no-save && npx playwright install chromium-headless-shell
// Without it those tests report as SKIPPED and the source guard still holds the
// line. See docs/verify/VERIFYING.md.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

/* ── The payload ───────────────────────────────────────────────────────────────
   Three shapes in one string, because they fail differently:
     - <img onerror>  fires asynchronously once the bogus src 404s
     - <svg onload>   fires as soon as the parser builds it
     - <script>       does NOT run from innerHTML, but the element still gets
                      created — so counting elements catches it when firing does not
   Every piece carries the same class, so "did anything get built from this?" is a
   single querySelectorAll. */
const MARK = 'vbxss';
const PAYLOAD =
  `<img class="${MARK}" src="x" onerror="window.__xssFired=1">` +
  `<svg class="${MARK}" onload="window.__xssFired=1"></svg>` +
  `<script class="${MARK}">window.__xssFired=1</script>`;

/* Breaking out of an attribute is its own trick, so the picture address gets a
   payload shaped for that. */
const IMG_PAYLOAD = `x"><img class="${MARK}" src="x" onerror="window.__xssFired=1">`;

/* A 1x1 transparent PNG — a legitimate coloring page, which must still display. */
const GOOD_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAA' +
  'DUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/* An ordinary name that is not an attack: an accent, an apostrophe and a stroked
   letter. Escaping bugs mangle these, so the fix has to leave them alone. */
const REAL_NAME = "Zoë O'Brien-Łukasz";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Source guard — no browser needed, so this always runs.
// ─────────────────────────────────────────────────────────────────────────────

test('source guard: the Watch screen does not paste a channel label into markup', () => {
  const src = read('videos/index.html');
  assert.ok(
    !/\$\{\s*ch\.(label|emoji)/.test(src),
    'videos/index.html interpolates a channel label or emoji into an HTML string again. ' +
    'Channel details are typed by a parent and round-trip through cloud sync — build the ' +
    'node and set textContent instead.',
  );
});

test('source guard: the in-game settings overlay does not paste a name into markup', () => {
  const src = read('js/game-settings.js');
  assert.ok(
    !/\$\{\s*p\.name\s*\}/.test(src),
    'js/game-settings.js interpolates p.name into an HTML string again. This file has no ' +
    'escaping helper — leave the slot empty and set textContent after insertion.',
  );
  assert.ok(
    src.includes('gs-pname'),
    'the .gs-pname slot the child name is written into has gone missing from js/game-settings.js.',
  );
});

test('source guard: parent settings does not paste the sync email into markup', () => {
  const src = read('parent/settings.html');
  assert.ok(
    !/\$\{\s*s\.email\s*\}/.test(src),
    'parent/settings.html interpolates s.email into an HTML string again. The email comes back ' +
    'from the sync server — set it with textContent, and set the input with .value.',
  );
  assert.ok(
    src.includes('sync-email'),
    'the .sync-email slot the account email is written into has gone missing from parent/settings.html.',
  );
});

test('source guard: parent settings does not paste a picture address into markup', () => {
  const src = read('parent/settings.html');
  assert.ok(
    !/<img[^>]*src\s*=\s*["']\$\{/.test(src),
    'parent/settings.html builds an <img src> out of a stored value again. Set .src as a ' +
    'property through safeImageSrc() so only a data: image or an https: address gets through.',
  );
  assert.ok(
    src.includes('function safeImageSrc'),
    'safeImageSrc() — the https:/data: allow-list for stored picture addresses — has gone missing.',
  );
});

test('source guard: the Yoto mini-player does not paste a cover address into markup', () => {
  const src = read('js/yoto-player.js');
  assert.ok(
    !/innerHTML\s*=\s*`<img[^`]*\$\{state\.cover\}/.test(src),
    'js/yoto-player.js builds the mini-player cover with state.cover interpolated into an HTML ' +
    'string again. This mini-player loads on every page, not just Listen, and the family\'s Yoto ' +
    'tokens live in storage — build the <img> with createElement/.src, https: only, like listen/index.html\'s safeImageUrl().',
  );
  assert.ok(
    /protocol\s*===\s*['"]https:['"]/.test(src),
    'the https-only check on the mini-player cover address has gone missing from js/yoto-player.js.',
  );
});

test('source guard: Listen publishes the validated cover address, not the raw one', () => {
  const src = read('listen/index.html');
  assert.ok(
    !/cover:\s*coverUrl\s*\|\|\s*null/.test(src),
    'listen/index.html publishes the raw, unvalidated coverUrl to window.yotoPlayer again. The ' +
    'shared mini-player on every other page trusts whatever this publishes — send the already-' +
    'validated address (safeImageUrl(coverUrl)) instead.',
  );
  assert.ok(
    /cover:\s*safeImageUrl\(coverUrl\)/.test(src),
    'the validated cover: safeImageUrl(coverUrl) publish call has gone missing from listen/index.html.',
  );
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

/* Child one is named with the payload; child two carries the accented name that
   has to survive the fix untouched. */
function profiles() {
  return [
    { id: 'xss-a', name: PAYLOAD, birthday: birthdayYearsAgo(4), color: '#7CC6FF',
      voice: 'woman', mascot: null, tierOverrides: {}, features: {},
      youtube: [{ emoji: PAYLOAD, label: PAYLOAD, channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa' }] },
    { id: 'xss-b', name: REAL_NAME, birthday: birthdayYearsAgo(8), color: '#FFB347',
      voice: 'man', mascot: null, tierOverrides: {}, features: {}, youtube: [] },
  ];
}

/* Seed browser storage before any page script runs, and cut the page off from
   everything except our own server — no web fonts, no YouTube, and above all no
   calls to the live sync Worker with a made-up key. */
async function openApp(extraStorage = {}) {
  const storage = {
    vb_profiles: JSON.stringify(profiles()),
    vb_active_id: 'xss-a',
    ...extraStorage,
  };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/*', (route) =>
    route.request().url().startsWith(BASE) ? route.continue() : route.abort());
  await ctx.addInitScript((seed) => {
    window.__xssFired = 0;
    try {
      for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]);
    } catch {}
  }, storage);
  return ctx;
}

/* The whole point of the test, in one place: nothing ran, and nothing was built. */
async function assertInert(page, where) {
  await page.waitForTimeout(700);          // let a bogus image finish failing
  const probe = await page.evaluate((mark) => ({
    fired: window.__xssFired || 0,
    planted: document.querySelectorAll('.' + mark).length,
    plantedTags: [...document.querySelectorAll('.' + mark)].map((e) => e.tagName).join(','),
  }), MARK);
  assert.equal(probe.fired, 0,
    `${where}: the hostile value EXECUTED. Anything running here can read the cloud sync key.`);
  assert.equal(probe.planted, 0,
    `${where}: the hostile value became ${probe.planted} real element(s) [${probe.plantedTags}]. ` +
    'It must be inserted as text, never as HTML.');
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

test('Watch: a hostile channel label and emoji are shown as text, not run as code',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await openApp();
    const page = await ctx.newPage();
    await page.goto(BASE + '/videos/index.html', { waitUntil: 'load' });
    await page.waitForSelector('.channel-tile');

    await assertInert(page, 'Watch screen');

    assert.equal(await page.textContent('.ct-label'), PAYLOAD,
      'the channel label should be visible, character for character, as plain text');
    assert.equal(await page.textContent('.ct-screen'), PAYLOAD,
      'the channel emoji should be visible, character for character, as plain text');

    await ctx.close();
  });

test('Parent settings: a hostile sync email and picture address stay inert',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await openApp({
      vb_pin: '1234',
      vb_sync_email: PAYLOAD,
      vb_sync_key: 'not-a-real-key',
      vb_coloring_pages: JSON.stringify([
        { id: 'good', name: 'A real page', lineArt: GOOD_PNG, createdAt: 1 },
        { id: 'bad', name: 'A doctored page', lineArt: IMG_PAYLOAD, createdAt: 2 },
      ]),
    });
    const page = await ctx.newPage();
    await unlockParentSettings(page, 'sync');
    // #syncNowBtn is in the card whether or not the fix is in place, so a
    // regression fails on the assertions below, not on a timeout.
    await page.waitForSelector('#syncNowBtn', { state: 'visible' });

    await assertInert(page, 'Parent settings (signed in)');

    assert.equal(await page.textContent('.sync-email'), PAYLOAD,
      'the account email should be visible, character for character, as plain text');

    const srcs = await page.$$eval('#coloringList img', (els) => els.map((e) => e.getAttribute('src')));
    assert.equal(srcs.length, 2, 'both coloring pages should still be listed');
    assert.equal(srcs[0], GOOD_PNG, 'a genuine coloring page must still display');
    assert.ok(srcs[1].startsWith('data:image/gif;base64,'),
      'a doctored picture address must be replaced by the blank pixel, not handed to the browser; got: ' + srcs[1]);

    await ctx.close();
  });

test('Parent settings: a hostile sync email cannot escape the sign-in field',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await openApp({
      vb_pin: '1234',
      vb_sync_email: PAYLOAD,
      vb_sync_key: 'not-a-real-key',
      vb_sync_expired: '1',          // the "session expired" card, which pre-fills the email
    });
    const page = await ctx.newPage();
    await unlockParentSettings(page, 'sync');
    // The field is present in both versions, and hidden until the parent taps
    // "Sign in again" — so wait for it to exist, not to be on screen.
    await page.waitForSelector('#syncEmail', { state: 'attached' });

    await assertInert(page, 'Parent settings (session expired)');

    // The sign-in form only unfolds when the parent taps "Sign in again", so read
    // the pre-filled value straight off the field rather than driving that step.
    assert.equal(await page.$eval('#syncEmail', (el) => el.value), PAYLOAD,
      'the email should be pre-filled as a value, character for character');
    assert.equal(await page.textContent('.sync-email'), PAYLOAD,
      'the account email should be visible, character for character, as plain text');

    await ctx.close();
  });

test('In-game settings: a hostile child name is shown as text, and a real name is untouched',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await openApp({ vb_pin: '1234' });
    const page = await ctx.newPage();
    await page.goto(BASE + '/games/shape-match.html', { waitUntil: 'load' });

    // The gear opens on a hold, not a tap, so a child cannot wander in.
    const gear = page.locator('#gameSettingsGear');
    await gear.waitFor();
    await gear.hover();
    await page.mouse.down();
    await page.waitForTimeout(1000);
    await page.mouse.up();

    await page.waitForSelector('#gameSettingsOverlay .gs-key');
    for (const k of ['1', '2', '3', '4']) await page.locator(`.gs-key[data-k="${k}"]`).click();
    // Anchor on the tier dropdown, which exists whether or not the fix is in
    // place, so a regression fails on the assertion below rather than on a
    // timeout waiting for a slot the broken version never creates.
    await page.waitForSelector('#gameSettingsOverlay select.gs-tier-sel');

    await assertInert(page, 'In-game settings overlay');

    const names = await page.$$eval('.gs-pname', (els) => els.map((e) => e.textContent));
    assert.deepEqual(names, [PAYLOAD, REAL_NAME],
      'both names should read back exactly as stored — the hostile one as harmless text, ' +
      'and the accented one with its apostrophe and accents intact');

    await ctx.close();
  });

test('Yoto mini-player: a hostile cover address stays inert, a real https one still shows',
  { skip: NEEDS_BROWSER }, async () => {
    // Two children on purpose: xss-a's mini-player state carries the payload;
    // the app just needs ANY active profile to get past the picker, so which
    // one is active doesn't matter here — only the sessionStorage payload does.
    const ctx = await openApp();
    const page = await ctx.newPage();
    // vb_yoto_now_playing is sessionStorage (js/yoto-player.js's KEY), not
    // localStorage — seed it before the mini-player's own script runs.
    await ctx.addInitScript((mark) => {
      try {
        // A real, same-origin audio file — a fake/blocked src fires the
        // element's 'error' handler almost instantly, which calls
        // yotoPlayer.clear() and wipes this very state before the test can
        // look at it.
        sessionStorage.setItem('vb_yoto_now_playing', JSON.stringify({
          src: location.origin + '/audio/girl/00679940.mp3',
          position: 0,
          playing: false,
          title: 'Test tape',
          cover: `x"><img class="${mark}" src="x" onerror="window.__xssFired=1">`,
        }));
      } catch {}
    }, MARK);
    await page.goto(BASE + '/home.html', { waitUntil: 'load' });
    await page.waitForSelector('#yotoMini');

    await assertInert(page, 'Yoto mini-player (hostile cover)');

    // The cover slot must fall back to empty (no image built from a bad
    // address) rather than silently keep trying to render it.
    const coverImgCount = await page.$$eval('#ymCover img', (els) => els.length);
    assert.equal(coverImgCount, 0,
      'a malformed cover address should never produce an <img>, hostile or not');

    await ctx.close();
  });

test('Yoto mini-player: a real https cover address renders as an image',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await openApp();
    const page = await ctx.newPage();
    const GOOD_COVER = 'https://api.yotoplay.com/cover-test.png';
    await ctx.addInitScript((cover) => {
      try {
        sessionStorage.setItem('vb_yoto_now_playing', JSON.stringify({
          src: location.origin + '/audio/girl/00679940.mp3',
          position: 0,
          playing: false,
          title: 'Test tape',
          cover,
        }));
      } catch {}
    }, GOOD_COVER);
    await page.goto(BASE + '/home.html', { waitUntil: 'load' });
    await page.waitForSelector('#yotoMini');

    const src = await page.$eval('#ymCover img', (el) => el.getAttribute('src'));
    assert.equal(src, GOOD_COVER, 'a legitimate https cover address must still display');

    await ctx.close();
  });
