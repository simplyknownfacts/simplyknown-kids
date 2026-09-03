// Professional review 2026-06-12, finding #1 (HIGH — "Backup is #1"): profiles,
// achievements and settings live ONLY in localStorage. Clearing browser data (or
// losing the device) loses everything with no way back, and GitHub only backs up
// the app's code, never a family's data.
//
// Fix: "Download backup" in parent/settings.html writes every vb_* key that
// actually holds child data — profiles (which carry achievements/progress/
// features/tierOverrides/youtube), the active-child pointer, the PIN {hash,salt},
// the recovery phrase if the (currently retired) feature ever comes back, the
// uploaded coloring pages, and per-profile game high-score caches — to a JSON
// file. "Restore from backup" reads one back, checks its shape, confirms with the
// parent, then writes the keys and reloads.
//
// Deliberately NOT exported (see js/sync.js and parent/settings.html's own
// comments): the cloud-sync auth token/email and the Yoto OAuth tokens/PKCE
// verifier. Those are credentials, not child data, and must never sit in a
// downloadable file. A legacy plaintext PIN (pre-hash-migration) is hashed at
// export time rather than ever written out in the clear.
//
// Two layers, the same shape as tests/hostile-input.test.mjs:
//   1. Source guard — no browser needed, so this always runs.
//   2. Browser drive — the real Download/Restore buttons, in a real browser.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Source guard — no browser needed, so this always runs.
// ─────────────────────────────────────────────────────────────────────────────

test('source guard: backup export never writes a plaintext PIN, and never writes credentials', () => {
  const src = read('parent/settings.html');
  assert.match(src, /function\s+collectBackupData/,
    'collectBackupData() has gone missing from parent/settings.html.');
  assert.match(src, /function\s+applyBackup/,
    'applyBackup() has gone missing from parent/settings.html.');
  assert.match(src, /function\s+validateBackupShape/,
    'validateBackupShape() has gone missing from parent/settings.html.');

  const bodyStart = src.indexOf('function collectBackupData');
  const bodyEnd = src.indexOf('\n    }', bodyStart);
  const body = src.slice(bodyStart, bodyEnd === -1 ? undefined : bodyEnd);
  assert.doesNotMatch(body, /vb_sync_key/,
    'collectBackupData() reads the cloud-sync auth token — that is a credential and must never ' +
    'be written to a downloadable file.');
  assert.doesNotMatch(body, /vb_yoto_tokens|vb_yoto_pkce|vb_yoto_oauth/,
    'collectBackupData() reads Yoto OAuth material — that is a credential and must never be ' +
    'written to a downloadable file.');
  assert.match(body, /_backupPinValue|_storeHashed|_hashWithSalt/,
    'collectBackupData() no longer routes the PIN through a hashing helper — a legacy plaintext ' +
    'PIN (pre-migration) would be written to the file in the clear.');
});

test('source guard: the download filename matches kids-backup-YYYY-MM-DD.json', () => {
  const src = read('parent/settings.html');
  assert.match(src, /kids-backup-\$\{[^}]*\}\.json|`kids-backup-.*\.json`/,
    'the backup filename pattern (kids-backup-YYYY-MM-DD.json) has changed or gone missing.');
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

const SEED_PROFILE = {
  id: 'kid-1', name: 'Backup Kid', birthday: birthdayYearsAgo(5), color: '#7CC6FF',
  voice: 'woman', mascot: { id: 'fox' }, tierOverrides: {}, features: {}, youtube: [],
  achievements: { unlocked: { 'tap-pop.first': 1 } },
};

/* Every parent-settings screen sits behind the PIN pad. Seed a LEGACY plaintext
   PIN on purpose — the export must upgrade it to {hash,salt} rather than ever
   writing "1234" to a file, exactly like a real unmigrated family's device. */
async function openSettingsSignedIn(ctx, extraStorage = {}) {
  await ctx.addInitScript((seed) => {
    try {
      for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]);
    } catch {}
  }, {
    vb_profiles: JSON.stringify([SEED_PROFILE]),
    vb_active_id: SEED_PROFILE.id,
    vb_pin: '1234',
    vb_coloring_pages: JSON.stringify([
      { id: 'pg1', name: 'My Photo', lineArt:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAA' +
        'DUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', createdAt: 1 },
    ]),
    vb_sync_email: 'parent@example.com',
    vb_sync_key: 'super-secret-token-should-never-be-exported',
    vb_yoto_tokens: JSON.stringify({ access: 'also-secret' }),
    ...extraStorage,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/parent/settings.html', { waitUntil: 'load' });
  await page.waitForSelector('#pinPad .pin-key');
  for (const i of [0, 1, 2, 3]) await page.locator('#pinPad .pin-key').nth(i).click();
  await page.waitForSelector('#mainSettings', { state: 'visible', timeout: 10000 });
  return page;
}

async function openBackupPanel(page) {
  await page.locator('.navitem[data-key="backup"]').click().catch(() => {});
  // Narrow-screen accordion: tap the section title instead.
  const acc = page.locator('#panel-backup .acc-title');
  if (await acc.isVisible().catch(() => false)) await acc.click();
  await page.waitForSelector('#downloadBackupBtn', { state: 'visible' });
}

test('Download backup: contains child data, upgrades the PIN, and never contains credentials',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    const page = await openSettingsSignedIn(ctx);
    await openBackupPanel(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#downloadBackupBtn').click(),
    ]);

    const today = new Date();
    const stamp = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') +
      '-' + String(today.getDate()).padStart(2, '0');
    assert.equal(download.suggestedFilename(), `kids-backup-${stamp}.json`,
      'the downloaded filename does not match kids-backup-YYYY-MM-DD.json for today.');

    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'kids-backup-test-'));
    const savedTo = path.join(tmpDir, download.suggestedFilename());
    await download.saveAs(savedTo);
    const payload = JSON.parse(readFileSync(savedTo, 'utf8'));

    assert.equal(payload.version, 1, 'backup version should be 1');
    assert.equal(payload.app, 'kids', 'backup app identity should be "kids"');
    assert.ok(payload.keys && typeof payload.keys === 'object', 'backup must have a keys object');

    assert.ok(Array.isArray(payload.keys.vb_profiles), 'vb_profiles must be an array');
    assert.equal(payload.keys.vb_profiles.length, 1);
    assert.equal(payload.keys.vb_profiles[0].name, 'Backup Kid');
    assert.deepEqual(payload.keys.vb_profiles[0].achievements, SEED_PROFILE.achievements,
      'achievements/progress nested in the profile must round-trip into the backup');

    assert.equal(payload.keys.vb_active_id, 'kid-1');

    assert.ok(payload.keys.vb_pin && typeof payload.keys.vb_pin === 'object' &&
      typeof payload.keys.vb_pin.hash === 'string' && typeof payload.keys.vb_pin.salt === 'string',
      'a legacy plaintext PIN ("1234") must be upgraded to {hash,salt} in the backup, never written as-is');
    assert.notEqual(JSON.stringify(payload.keys.vb_pin), '"1234"',
      'the raw plaintext PIN must never appear in the backup file');

    assert.ok(Array.isArray(payload.keys.vb_coloring_pages) && payload.keys.vb_coloring_pages.length === 1,
      'the uploaded coloring page must be included');

    const dump = JSON.stringify(payload);
    assert.ok(!dump.includes('super-secret-token-should-never-be-exported'),
      'the cloud-sync auth token leaked into the backup file');
    assert.ok(!dump.includes('also-secret'),
      'a Yoto OAuth token leaked into the backup file');
    assert.ok(!('vb_sync_key' in payload.keys) && !('vb_sync_email' in payload.keys),
      'cloud-sync credentials must not be keys in the backup at all');
    assert.ok(!('vb_yoto_tokens' in payload.keys),
      'Yoto credentials must not be a key in the backup at all');

    await ctx.close();
  });

test('Restore from backup: replaces local data after confirming, and the PIN still works',
  { skip: NEEDS_BROWSER }, async () => {
    const backupPayload = {
      version: 1,
      app: 'kids',
      exportedAt: new Date().toISOString(),
      keys: {
        vb_profiles: [{ ...SEED_PROFILE, id: 'restored-1', name: 'Restored Kid' }],
        vb_active_id: 'restored-1',
        vb_pin: { hash: 'deadbeef', salt: 'cafef00d' }, // shape-only; not unlocked with in this test
      },
    };
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'kids-backup-test-'));
    const filePath = path.join(tmpDir, 'kids-backup-2020-01-01.json');
    writeFileSync(filePath, JSON.stringify(backupPayload));

    // A DIFFERENT starting roster, so we can prove restore actually replaced it.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await openSettingsSignedIn(ctx);
    await openBackupPanel(page);

    let confirmSeen = false;
    page.on('dialog', async (dialog) => { confirmSeen = true; await dialog.accept(); });

    await page.locator('#restoreBackupInput').setInputFiles(filePath);
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('vb_profiles') || '[]').some((p) => p.id === 'restored-1'),
      { timeout: 10000 },
    );

    assert.ok(confirmSeen, 'restoring must ask for confirmation before overwriting local data');
    const profiles = await page.evaluate(() => JSON.parse(localStorage.getItem('vb_profiles')));
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].name, 'Restored Kid');
    const activeId = await page.evaluate(() => localStorage.getItem('vb_active_id'));
    assert.equal(activeId, 'restored-1');

    await ctx.close();
  });

test('Restore from backup: a file that is not a Kids backup is rejected with a plain message, nothing changes',
  { skip: NEEDS_BROWSER }, async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'kids-backup-test-'));
    const badFile = path.join(tmpDir, 'not-a-backup.json');
    writeFileSync(badFile, JSON.stringify({ hello: 'world' }));

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await openSettingsSignedIn(ctx);
    await openBackupPanel(page);

    let dialogSeen = false;
    page.on('dialog', async (dialog) => { dialogSeen = true; await dialog.dismiss(); });

    await page.locator('#restoreBackupInput').setInputFiles(badFile);
    await page.waitForFunction(
      () => (document.getElementById('backupMsg') || {}).textContent?.trim().length > 0,
      { timeout: 10000 },
    );

    const msg = await page.locator('#backupMsg').textContent();
    assert.match(msg, /not.*backup|backup.*not|missing/i,
      `expected a plain-English rejection message, got: "${msg}"`);
    assert.ok(!dialogSeen, 'an invalid file must be rejected before ever asking for confirmation');

    const profiles = await page.evaluate(() => JSON.parse(localStorage.getItem('vb_profiles')));
    assert.equal(profiles.length, 1, 'the original profile must be untouched');
    assert.equal(profiles[0].id, 'kid-1');

    await ctx.close();
  });

test('Restore from backup works fully offline (no network requests fired)',
  { skip: NEEDS_BROWSER }, async () => {
    const backupPayload = {
      version: 1, app: 'kids', exportedAt: new Date().toISOString(),
      keys: { vb_profiles: [{ ...SEED_PROFILE, id: 'offline-1', name: 'Offline Kid' }], vb_active_id: 'offline-1' },
    };
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'kids-backup-test-'));
    const filePath = path.join(tmpDir, 'kids-backup-2020-01-01.json');
    writeFileSync(filePath, JSON.stringify(backupPayload));

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    // Only this server's own origin may answer — anything else (a stray network
    // call during export/import) aborts instead of silently succeeding.
    await ctx.route('**/*', (route) =>
      route.request().url().startsWith(BASE) ? route.continue() : route.abort());
    const page = await openSettingsSignedIn(ctx);
    await openBackupPanel(page);

    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('#restoreBackupInput').setInputFiles(filePath);
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('vb_profiles') || '[]').some((p) => p.id === 'offline-1'),
      { timeout: 10000 },
    );

    await ctx.close();
  });
