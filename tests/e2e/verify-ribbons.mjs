// Verify the repeatable ×N ribbon renders in the gallery + shelf (local server).
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out', 'fixes');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:8866';

const d = new Date(); d.setMonth(d.getMonth() - 30); const bday = d.toISOString().slice(0, 10); // tier 3
const prof = {
  id: 'r', name: 'Remy', birthday: bday, avatar: '\u{1F98A}', color: '#4ECDC4', voice: 'girl', mascot: null,
  tierOverrides: {}, features: {}, youtube: [],
  achievements: {
    unlocked: { 'tap-pop.first': { at: 1 }, 'tap-pop.milestone.bronze': { at: 1 }, 'tap-pop.milestone.silver': { at: 1 }, 'shape-match.first': { at: 1 } },
    counters: { 'tap-pop': 80 }, repeats: { 'tap-pop': 3 },     // 80 / 25 = 3 stars
    streak: { last: null, current: 0, best: 0 }, xp: 12, rank: 'sprout',
  },
};
const init = `
  try { localStorage.setItem('vb_profiles', JSON.stringify([${JSON.stringify(prof)}])); localStorage.setItem('vb_active_id','r'); } catch(e){}
  try { HTMLMediaElement.prototype.play=function(){return Promise.resolve();}; } catch(e){}
  try { if (window.speechSynthesis) speechSynthesis.speak=function(){}; } catch(e){}
`;
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const out = {};

  await page.goto(`${BASE}/achievements.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#groups .gallery-group', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(500);
  out.countBadges = await page.locator('.vb-rib-count').allTextContents();
  // scroll the Tap & Pop group into view for the screenshot
  await page.evaluate(() => { const g = document.querySelector('.gallery-group'); if (g) g.scrollIntoView(); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'gallery-repeatable.png') });

  await page.goto(`${BASE}/home.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.vb-shelf', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(500);
  out.shelfBadges = await page.locator('.vb-shelf .vb-rib-count').allTextContents();
  await page.screenshot({ path: join(OUT, 'shelf-repeatable.png'), fullPage: true });

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
