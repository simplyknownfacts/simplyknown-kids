import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
let server, browser, base;

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

before(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base + '/__health.json')).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
});

after(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
});

function existingProfile() {
  return {
    id: 'existing', name: 'Robin', birthday: '2021-05-04', color: '#4ECDC4', voice: 'girl',
    mascot: { id: 'dog' }, tierOverrides: {}, features: {}, activitiesVisible: {}, youtube: [],
  };
}

async function settingsPage(query = '') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://**', route => route.abort());
  await ctx.addInitScript(profile => {
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    localStorage.removeItem('vb_pin');
    window.__externalFetches = [];
    const nativeFetch = window.fetch;
    window.fetch = (...args) => {
      const url = String(args[0]);
      if (/^https:/i.test(url)) {
        window.__externalFetches.push(url);
        return Promise.reject(new Error('blocked in test'));
      }
      return nativeFetch(...args);
    };
  }, existingProfile());
  const page = await ctx.newPage();
  await page.goto(base + '/parent/settings.html' + query, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { showMain(); showPanel('children'); });
  return { ctx, page };
}

test('add child is three guided steps, preserves choices, and creates once under mashing', async () => {
  const { ctx, page } = await settingsPage();
  const dialogs = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.locator('#addChildButton').click();
  assert.equal(await page.locator('#mainSettings').evaluate(el => el.classList.contains('adding-child')), true);
  assert.equal(await page.locator('#profilesList').isHidden(), true);
  assert.equal(await page.locator('#addChildButton').isHidden(), true);
  assert.equal(await page.locator('.add-step[data-step="1"]').isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'newName');

  await page.fill('#newName', 'Sam');
  await page.fill('#newBirthday', '2020-06-15');
  await page.locator('#addNext1').click();
  assert.equal(await page.locator('.add-step[data-step="2"]').isVisible(), true);
  await page.locator('#addNext2').click();
  assert.match(await page.locator('#addFormStatus').textContent(), /animal buddy/i);
  assert.equal(await page.locator('.add-step[data-step="2"]').isVisible(), true);
  const bunny = page.locator('#newMascotPicker button[data-mascot="bunny"]');
  await bunny.click();
  assert.equal(await bunny.getAttribute('aria-pressed'), 'true');
  await page.locator('#addBack2').click();
  assert.equal(await page.inputValue('#newName'), 'Sam');
  assert.equal(await page.inputValue('#newBirthday'), '2020-06-15');
  await page.locator('#addNext1').click();
  assert.equal(await bunny.getAttribute('aria-pressed'), 'true');
  await page.locator('#addNext2').click();

  const girl = page.locator('#newVoicePicker button[data-voice="girl"]');
  await page.locator('#createChild').click();
  assert.match(dialogs.at(-1), /pick a voice/i);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.vb_profiles).map(p => p.name)), ['Robin']);
  await girl.click();
  assert.equal(await girl.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#offerNameVoice').isChecked(), false);
  await page.locator('#createChild').evaluate(button => {
    for (let i = 0; i < 8; i++) button.click();
  });
  const profiles = await page.evaluate(() => JSON.parse(localStorage.getItem('vb_profiles') || '[]'));
  assert.equal(profiles.filter(profile => profile.name === 'Sam').length, 1);
  const sam = profiles.find(profile => profile.name === 'Sam');
  assert.equal(sam.mascot.id, 'bunny');
  assert.equal(sam.voice, 'girl');
  assert.equal(await page.evaluate(() => window.__externalFetches.length), 0);
  assert.equal(dialogs.filter(message => /pick a voice/i.test(message)).length, 1);
  await ctx.close();
});

test('future birthday stays on step one and Cancel restores the child list', async () => {
  const { ctx, page } = await settingsPage();
  const dialogs = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.locator('#addChildButton').click();
  const max = await page.locator('#newBirthday').getAttribute('max');
  const future = new Date(max + 'T12:00:00');
  future.setDate(future.getDate() + 1);
  await page.fill('#newName', 'Future');
  await page.fill('#newBirthday', future.toISOString().slice(0, 10));
  await page.locator('#addNext1').click();
  await page.waitForTimeout(50);
  assert.equal(await page.locator('.add-step[data-step="1"]').isVisible(), true);
  assert.match(dialogs[0], /future/i);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.vb_profiles).map(p => p.name)), ['Robin']);
  await page.locator('#cancelAddChild').click();
  assert.equal(await page.locator('#mainSettings').evaluate(el => el.classList.contains('adding-child')), false);
  assert.equal(await page.locator('#profilesList').isVisible(), true);
  assert.equal(await page.locator('#addChildButton').isVisible(), true);
  await page.locator('#addChildButton').click();
  assert.equal(await page.inputValue('#newName'), '');
  assert.equal(await page.inputValue('#newBirthday'), '');
  assert.equal(await page.locator('#newMascotPicker [aria-pressed="true"]').count(), 0);
  assert.equal(await page.locator('#newVoicePicker [aria-pressed="true"]').count(), 0);
  await ctx.close();
});

test('action=add opens step one and focuses the name', async () => {
  const { ctx, page } = await settingsPage('?action=add');
  await page.waitForSelector('#addForm', { state: 'visible' });
  await page.waitForFunction(() => document.activeElement?.id === 'newName');
  assert.equal(await page.locator('.add-step[data-step="1"]').isVisible(), true);
  assert.equal(await page.locator('.add-step:visible').count(), 1);
  await ctx.close();
});
