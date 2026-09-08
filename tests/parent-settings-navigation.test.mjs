import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PANEL_KEYS = [
  'overview', 'activities', 'features', 'voice', 'theme', 'mascot',
  'coloring', 'youtube', 'children', 'yoto', 'sync', 'offline', 'pin',
];

const FIRST = {
  id: 'settings-first', name: 'First Child', birthday: '2020-03-04', color: '#7CC6FF',
  voice: 'woman', theme: 'storybook', mascot: { id: 'dog' },
  tierOverrides: {}, features: {}, activitiesVisible: {}, youtube: [],
};
const SECOND = {
  id: 'settings-second', name: 'Second Child', birthday: '2021-05-06', color: '#FFD93D',
  voice: 'man', theme: 'arcade', mascot: { id: 'panda' },
  tierOverrides: {}, features: {}, activitiesVisible: {}, youtube: [],
};

let server;
let browser;
let base;

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
    cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(base + '/__health.json')).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.kill();
});

async function openSettings(viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === base ? route.continue() : route.abort();
  });
  await context.addInitScript(({ first, second }) => {
    localStorage.setItem('vb_pin', '1234');
    localStorage.setItem('vb_profiles', JSON.stringify([first, second]));
    // The active kid is deliberately second in storage. Settings must honor the
    // valid active id instead of silently editing the first profile.
    localStorage.setItem('vb_active_id', second.id);
  }, { first: FIRST, second: SECOND });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  await page.goto(base + '/parent/settings.html', { waitUntil: 'load' });
  await page.locator('#pinPad .pin-key').first().waitFor();
  for (const digit of ['1', '2', '3', '4']) {
    await page.locator('#pinPad .pin-key', { hasText: new RegExp(`^${digit}$`) }).click();
  }
  await page.locator('#mainSettings').waitFor({ state: 'visible' });
  return { context, page };
}

async function shownPanels(page) {
  return page.locator('.settings-panel').evaluateAll(panels => panels
    .filter(panel => !panel.hidden && panel.style.display !== 'none' && getComputedStyle(panel).display !== 'none')
    .map(panel => panel.dataset.key));
}

async function assertOnlyPanel(page, key) {
  assert.deepEqual(await shownPanels(page), [key], `only ${key} should be visible`);
  const state = await page.locator('.settings-panel').evaluateAll((panels, activeKey) => panels.map(panel => ({
    key: panel.dataset.key,
    hidden: panel.hidden,
    inlineDisplay: panel.style.display,
  })), key);
  for (const panel of state) {
    if (panel.key === key) {
      assert.equal(panel.hidden, false, `${key} retained the hidden attribute`);
      assert.notEqual(panel.inlineDisplay, 'none', `${key} retained inline display:none`);
    } else {
      assert.equal(panel.hidden, true, `${panel.key} must have the hidden attribute while ${key} is open`);
      assert.equal(panel.inlineDisplay, 'none', `${panel.key} needs inline display:none while ${key} is open`);
    }
  }
}

function assertEveryPanel(actual, where) {
  assert.deepEqual([...actual].sort(), [...PANEL_KEYS].sort(),
    `${where} must expose every panel exactly once, including Theme`);
}

async function goToPanel(page, key, mobile) {
  if (mobile) {
    await page.locator('#settingsSectionPicker').selectOption(key);
  } else {
    await page.locator(`button.navitem[data-key="${key}"]`).click();
  }
  await page.waitForFunction(activeKey => {
    const panel = document.querySelector(`.settings-panel[data-key="${activeKey}"]`);
    return panel && !panel.hidden && panel.style.display !== 'none';
  }, key);
  await assertOnlyPanel(page, key);
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 756, height: 1024 },
  { width: 1180, height: 800 },
]) {
  test(`one visible panel and every settings route works at ${viewport.width}x${viewport.height}`, async () => {
    const { context, page } = await openSettings(viewport);
    try {
      const mobile = viewport.width < 820;
      assert.equal(await page.locator('#settingsChildSelect').inputValue(), SECOND.id,
        'settings should default to the valid active child, even when it is second in storage');
      assert.equal(await page.evaluate(() => localStorage.getItem('vb_active_id')), SECOND.id,
        'opening settings must not change the child-facing active profile');
      assert.equal(await page.locator('body').evaluate(body => body.classList.contains('parent-settings')), true,
        'parent settings needs its own stable palette scope');
      await assertOnlyPanel(page, 'overview');

      if (mobile) {
        assertEveryPanel(
          await page.locator('#settingsSectionPicker option').evaluateAll(options => options.map(o => o.value)),
          'the grouped mobile picker');
      } else {
        assertEveryPanel(
          await page.locator('button.navitem[data-key]').evaluateAll(items => items.map(i => i.dataset.key)),
          'desktop navigation');
      }

      for (const key of PANEL_KEYS) await goToPanel(page, key, mobile);
    } finally {
      await context.close();
    }
  });
}

test('overview quick-task cards route to their named panels', async () => {
  const { context, page } = await openSettings({ width: 390, height: 844 });
  try {
    const cards = page.locator('#panel-overview button[data-key]');
    const keys = await cards.evaluateAll(items => items.map(item => item.dataset.key));
    assert.ok(keys.length >= 3, 'overview should offer at least three useful quick tasks');
    assert.equal(new Set(keys).size, keys.length, 'overview quick tasks should not duplicate a destination');
    for (const key of keys) {
      assert.ok(PANEL_KEYS.includes(key) && key !== 'overview', `overview quick task has unknown target ${key}`);
      await page.locator(`#panel-overview button[data-key="${key}"]`).click();
      await assertOnlyPanel(page, key);
      await page.locator('#settingsSectionPicker').selectOption('overview');
      await assertOnlyPanel(page, 'overview');
    }
  } finally {
    await context.close();
  }
});

test('child selection and autosaves stay scoped to the selected child', async () => {
  const { context, page } = await openSettings({ width: 390, height: 844 });
  try {
    const childSelect = page.locator('#settingsChildSelect');
    assert.equal(await childSelect.inputValue(), SECOND.id);

    // The active child's theme can change, but Parent Settings keeps its own
    // calm palette rather than being re-skinned underneath the parent.
    await goToPanel(page, 'theme', true);
    const beforePalette = await page.locator('body').evaluate(body => {
      const css = getComputedStyle(body);
      return { background: css.background, color: css.color };
    });
    await page.locator('button.vcard[data-theme-id="paper"]').click();
    await page.waitForFunction(() => document.getElementById('settingsSaveStatus')?.textContent.includes('Saved for Second Child'));
    assert.deepEqual(await page.locator('body').evaluate(body => {
      const css = getComputedStyle(body);
      return { background: css.background, color: css.color };
    }), beforePalette, 'changing a child theme must not re-skin Parent Settings');

    await childSelect.selectOption(FIRST.id);
    assert.equal(await page.locator('#settingsSaveStatus').textContent(), '', 'switching children should clear stale save status');
    const secondBefore = await page.evaluate(id => JSON.parse(localStorage.vb_profiles).find(p => p.id === id), SECOND.id);

    await goToPanel(page, 'activities', true);
    const activity = page.locator(`.act-vis[data-pid="${FIRST.id}"][data-aid="tap-pop"]`);
    await activity.uncheck();
    await page.waitForFunction(() => document.getElementById('settingsSaveStatus')?.textContent.includes('Saved for First Child'));
    assert.equal(await page.evaluate(id => JSON.parse(localStorage.vb_profiles).find(p => p.id === id).activitiesVisible['tap-pop'], FIRST.id), false);

    await goToPanel(page, 'voice', true);
    assert.equal(await page.locator('#settingsSaveStatus').textContent(), '', 'panel navigation should clear stale save status');
    const voice = page.locator('button.vcard[data-voice="girl"]');
    await voice.click();
    await page.waitForFunction(() => document.getElementById('settingsSaveStatus')?.textContent.includes('Saved for First Child'));
    assert.equal(await voice.getAttribute('aria-pressed'), 'true');

    await goToPanel(page, 'theme', true);
    const theme = page.locator('button.vcard[data-theme-id="candy"]');
    await theme.click();
    await page.waitForFunction(() => document.getElementById('settingsSaveStatus')?.textContent.includes('Saved for First Child'));
    assert.equal(await theme.getAttribute('aria-pressed'), 'true');

    await goToPanel(page, 'mascot', true);
    await page.locator(`#mascot-${FIRST.id}`).selectOption('tiger');
    await page.waitForFunction(() => document.getElementById('settingsSaveStatus')?.textContent.includes('Saved for First Child'));

    const stored = await page.evaluate(() => JSON.parse(localStorage.vb_profiles));
    const first = stored.find(p => p.id === 'settings-first');
    const second = stored.find(p => p.id === 'settings-second');
    assert.equal(first.activitiesVisible['tap-pop'], false);
    assert.equal(first.voice, 'girl');
    assert.equal(first.theme, 'candy');
    assert.equal(first.mascot.id, 'tiger');
    assert.deepEqual(second, secondBefore, 'editing the selected child changed a different child');
    assert.equal(await page.evaluate(() => localStorage.getItem('vb_active_id')), SECOND.id,
      'switching the settings child must not switch the kid-facing app profile');
  } finally {
    await context.close();
  }
});
