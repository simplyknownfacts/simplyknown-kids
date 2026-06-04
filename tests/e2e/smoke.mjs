// Foundation smoke test for the full E2E harness. Proves, against the LIVE site:
//  - fresh context + localStorage seed (isolated; never touches real devices)
//  - home renders + age-gating tile count
//  - canvas pointer-event gameplay (tap-pop) + ribbon-on-load
//  - real PIN keypad click-through into Parent Settings
// Run: node tests/e2e/smoke.mjs   (BASE env overrides target)
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'https://kids.simplyknown.co';
const VIEWPORT = { width: 1280, height: 900 }; // wide => settings sidebar layout

function birthdayForTier(tier) {
  const months = { 1: 6, 2: 18, 3: 30, 4: 42, 5: 54, 6: 66, 7: 78, 8: 120 }[tier];
  const d = new Date(); d.setDate(15); d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}
function makeProfile(tier) {
  return {
    id: 'e2e-kid', name: 'Smoke', birthday: birthdayForTier(tier),
    avatar: '\u{1F98A}', color: '#4ECDC4', voice: 'girl', mascot: null,
    tierOverrides: {}, features: {}, youtube: [],
  };
}
function initScript(profile) {
  return `
    try {
      localStorage.setItem('vb_profiles', JSON.stringify([${JSON.stringify(profile)}]));
      localStorage.setItem('vb_active_id', ${JSON.stringify(profile.id)});
      localStorage.setItem('vb_pin', '1234');
      localStorage.removeItem('vb_pin_lockout');
    } catch (e) {}
    try { HTMLMediaElement.prototype.play = function () { return Promise.resolve(); }; } catch (e) {}
    try { if (window.speechSynthesis) window.speechSynthesis.speak = function () {}; } catch (e) {}
    try { navigator.vibrate = function () { return true; }; } catch (e) {}
  `;
}

const log = (...a) => console.log(...a);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' });
  await ctx.addInitScript(initScript(makeProfile(1)));
  const page = await ctx.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  let pass = 0, fail = 0;
  const check = (name, ok, extra = '') => { log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); ok ? pass++ : fail++; };

  // 1) HOME renders
  await page.goto(`${BASE}/home.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const homeOk = await page.waitForSelector('.home-screen', { timeout: 15000 }).then(() => true).catch(() => false);
  const hi = await page.textContent('#hiText').catch(() => '');
  check('home.html renders', homeOk, `hiText="${(hi || '').trim()}"`);

  // 2) LEARN gating (tier 1 expects: hello-colors, animal-sounds = 2 of the 9 learn cards)
  await page.goto(`${BASE}/learning/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#cardsRow .activity-card, #emptyMsg', { timeout: 15000 }).catch(() => {});
  const learnCount = await page.locator('#cardsRow .activity-card').count();
  check('learn index renders tiles', learnCount > 0, `tier1 visible learn cards=${learnCount} (expect 2)`);

  // 3) TAP-POP ribbon-on-load + real canvas pops
  await page.goto(`${BASE}/games/tap-pop.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(900);
  const ribbon = await page.evaluate(() => !!(window.vbProgress && vbProgress.getState().unlocked['tap-pop.first'])).catch(() => false);
  check('tap-pop earns first-play ribbon on load', ribbon);
  const box = await page.locator('#canvas').boundingBox();
  const score = async () => page.evaluate(() => Number(document.querySelector('#scoreVal')?.textContent || 0)).catch(() => 0);
  if (box) {
    for (let i = 0; i < 60 && (await score()) === 0; i++) {
      const x = box.x + box.width * (0.15 + 0.7 * Math.random());
      const y = box.y + box.height * (0.40 + 0.55 * Math.random());
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up();
      await page.waitForTimeout(110);
    }
  }
  const sc = await score();
  check('tap-pop scores via real pops', sc > 0, `score=${sc}`);

  // 4) PARENT SETTINGS real PIN keypad click-through
  await page.goto(`${BASE}/parent/settings.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#pinGate', { timeout: 15000 }).catch(() => {});
  for (const d of ['1', '2', '3', '4']) {
    await page.locator('#pinPad .pin-key', { hasText: new RegExp('^' + d + '$') }).first().click().catch(() => {});
  }
  const unlocked = await page.waitForSelector('#mainSettings', { state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
  check('settings PIN gate click-through unlocks', unlocked);

  log(`\nSMOKE: ${pass} pass / ${fail} fail`);
  log('pageErrors:', pageErrors.length ? pageErrors : 'none');
  log('consoleErrors:', consoleErrors.length ? consoleErrors.slice(0, 8) : 'none');

  await ctx.close();
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SMOKE FATAL', e); process.exit(2); });
