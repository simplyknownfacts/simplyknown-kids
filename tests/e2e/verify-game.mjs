// Verify a single game against the local server: load, tap a few times, confirm
// the ribbon counter increments, screenshot. Usage:
//   node verify-game.mjs games/magic-touch.html magic-touch 1
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out', 'fixes');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:8790';
const [, , file, id, tierArg] = process.argv;
const tier = Number(tierArg || 1);

const months = { 1: 6, 2: 18, 3: 30, 4: 42, 5: 54, 6: 66, 7: 78, 8: 120 }[tier];
const d = new Date(); d.setDate(15); d.setMonth(d.getMonth() - months);
const prof = { id: 'g', name: 'Gio', birthday: d.toISOString().slice(0, 10), avatar: '\u{1F98A}', color: '#4ECDC4', voice: 'girl', mascot: null, tierOverrides: {}, features: {}, youtube: [] };
const init = `
  try { localStorage.setItem('vb_profiles', JSON.stringify([${JSON.stringify(prof)}])); localStorage.setItem('vb_active_id','g'); } catch(e){}
  try { HTMLMediaElement.prototype.play=function(){return Promise.resolve();}; } catch(e){}
  try { if (window.speechSynthesis) speechSynthesis.speak=function(){}; } catch(e){}
`;
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e && e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(`${BASE}/${file}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const redirected = /index\.html$|\/$/.test(page.url().replace(BASE, '')) && !/games|learning|art/.test(page.url());
  const before = await page.evaluate(i => (window.vbProgress && vbProgress.getState().counters[i]) || 0, id).catch(() => 0);

  // tap around the center a handful of times (with small drags for trail modes)
  const W = 414, H = 896;
  for (let i = 0; i < 8; i++) {
    const x = W * (0.3 + 0.4 * Math.random()), y = H * (0.35 + 0.3 * Math.random());
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + 30, y + 20, { steps: 3 }); await page.mouse.up();
    await page.waitForTimeout(140);
  }
  await page.waitForTimeout(300);
  const after = await page.evaluate(i => (window.vbProgress && vbProgress.getState().counters[i]) || 0, id).catch(() => 0);
  await page.screenshot({ path: join(OUT, `game-${id}.png`) });

  console.log(JSON.stringify({ id, tier, url: page.url().replace(BASE, ''), redirected, counterBefore: before, counterAfter: after, pageErrors: errs.slice(0, 6) }, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
