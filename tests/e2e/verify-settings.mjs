// Screenshot Parent Settings (unlocked) to find the black-text-on-blue contrast bug.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out', 'fixes');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:8790';

const d = new Date(); d.setMonth(d.getMonth() - 30); const bday = d.toISOString().slice(0, 10);
const prof = { id: 's', name: 'Sam', birthday: bday, avatar: '\u{1F98A}', color: '#4ECDC4', voice: 'girl', mascot: null, tierOverrides: {}, features: {}, youtube: [] };
const init = `
  try { localStorage.setItem('vb_profiles', JSON.stringify([${JSON.stringify(prof)}])); localStorage.setItem('vb_active_id','s'); localStorage.setItem('vb_pin','1234'); localStorage.removeItem('vb_pin_lockout'); } catch(e){}
  try { HTMLMediaElement.prototype.play=function(){return Promise.resolve();}; } catch(e){}
  try { if (window.speechSynthesis) speechSynthesis.speak=function(){}; } catch(e){}
`;

async function shoot(page, w, h, label, panel) {
  await page.setViewportSize({ width: w, height: h });
  if (panel) await page.evaluate((k) => { if (typeof showPanel === 'function') showPanel(k); }, panel).catch(() => {});
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(OUT, `settings-${label}.png`), fullPage: true });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(init);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/parent/settings.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#pinPad', { timeout: 12000 }).catch(() => {});
  for (const dig of ['1', '2', '3', '4']) await page.locator('#pinPad .pin-key', { hasText: new RegExp('^' + dig + '$') }).first().click().catch(() => {});
  await page.waitForSelector('#mainSettings', { state: 'visible', timeout: 10000 }).catch(() => {});
  // force the afternoon (light-blue) theme — the time-of-day palette that made
  // settings text black-on-blue — to prove the night-palette pin holds.
  await page.evaluate(() => document.documentElement.setAttribute('data-tod', 'afternoon'));
  await page.waitForTimeout(400);

  // phone (accordion) main view, then key panels at phone width
  await shoot(page, 390, 844, 'phone-main', null);
  for (const k of ['activities', 'features', 'voice', 'children', 'pin']) await shoot(page, 390, 844, 'phone-' + k, k);
  // a wide sidebar capture too
  await shoot(page, 1280, 900, 'wide-activities', 'activities');

  console.log('settings screenshots written to out/fixes/settings-*.png');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
