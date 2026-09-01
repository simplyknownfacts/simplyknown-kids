// Verify Batch-1 UX fixes against the LOCAL server (localhost:8790 serving the
// worktree). Checks: wooden shelf renders, achievements scrolls, peek-a-boo is
// in the games catalog, phone overlap hint is gone. Screenshots to out/fixes/.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out', 'fixes');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:8790';

// tier-1 profile WITH a few earned ribbons so the shelf shows ribbons on the plank
const d = new Date(); d.setMonth(d.getMonth() - 5); const bday = d.toISOString().slice(0, 10);
const prof = {
  id: 'v', name: 'Vera', birthday: bday, avatar: '\u{1F98A}', color: '#4ECDC4', voice: 'girl', mascot: null,
  tierOverrides: {}, features: {}, youtube: [],
  achievements: { unlocked: { 'tap-pop.first': { at: 1 }, 'shape-match.first': { at: 1 }, 'hello-colors.first': { at: 1 }, 'animal-sounds.first': { at: 1 } }, counters: { 'tap-pop': 3 }, streak: { last: null, current: 0, best: 0 }, xp: 4, rank: 'sprout' },
};
const init = `
  try { localStorage.setItem('vb_profiles', JSON.stringify([${JSON.stringify(prof)}])); localStorage.setItem('vb_active_id','v'); localStorage.setItem('vb_pin','1234'); localStorage.removeItem('vb_pin_lockout'); } catch(e){}
  try { HTMLMediaElement.prototype.play = function(){return Promise.resolve();}; } catch(e){}
  try { if (window.speechSynthesis) speechSynthesis.speak=function(){}; } catch(e){}
`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const out = {};

  // 1) HOME — wooden shelf
  await page.goto(`${BASE}/home.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.vb-shelf', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(500);
  out.shelfRibbons = await page.locator('.vb-shelf .vb-ribbon').count();
  await page.screenshot({ path: join(OUT, 'home-shelf.png'), fullPage: true });

  // 2) ACHIEVEMENTS — scroll
  await page.goto(`${BASE}/achievements.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#groups .gallery-group', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(500);
  out.scroll = await page.evaluate(() => {
    const se = document.scrollingElement || document.documentElement;
    const before = se.scrollTop; window.scrollTo(0, 3000); const after = se.scrollTop;
    return { docScrollHeight: se.scrollHeight, viewport: window.innerHeight, scrolled: after > before, after };
  });
  await page.screenshot({ path: join(OUT, 'achievements.png') });

  // 3) GAMES index — peek-a-boo wired in (expect 3 cards at tier 1)
  await page.goto(`${BASE}/games/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#cardsRow .activity-card', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(300);
  out.gamesCards = await page.locator('#cardsRow .activity-card .label').allTextContents();
  await page.screenshot({ path: join(OUT, 'games-index.png') });

  // 4) INDEX picker (phone) — overlap hint gone
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#settingsGear', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(300);
  out.parentHintGone = (await page.locator('.parent-hint').count()) === 0;
  await page.screenshot({ path: join(OUT, 'index-phone.png') });

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => { console.error('VERIFY FATAL', e); process.exit(1); });
