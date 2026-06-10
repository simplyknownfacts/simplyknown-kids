// Generate the screenshot set for the VISUAL sweep — every activity at a young
// (tier 2) and older (tier 6) layout, phone + a tablet pass, plus the shell.
// node generates them deterministically; agents then inspect the PNGs.
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { launch, newContext, seedProfile, BASE } from './lib/harness.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'visual');
mkdirSync(OUT, { recursive: true });

const FEATS = { math: { subtract: true, multiply: true }, spelling: { spellMode: true }, days: { quizMode: true }, 'count-along': { quizMode: true }, 'animal-sounds': { quizMode: true }, 'hello-colors': { colorQuiz: true }, money: { countMode: true }, abcs: { spellMode: true, wordHints: true }, 'body-parts': { allParts: true }, 'shape-match': { dragMode: true }, 'peek-a-boo': { multiChoice: true }, 'stamp-art': { themeSwitcher: true }, 'finger-paint': { eraser: true }, 'color-splash': { clearButton: true } };

const ACTS = [
  'games/tap-pop', 'games/peek-a-boo', 'games/magic-touch', 'games/tap-a-tune', 'games/surprise-pop', 'games/shape-match',
  'games/tilt-drive', 'games/memory-match',
  'learning/hello-colors', 'learning/animal-sounds', 'learning/count-along', 'learning/abcs', 'learning/body-parts',
  'learning/days', 'learning/math', 'learning/spelling', 'learning/money', 'learning/clock',
  'art/stamp-art', 'art/finger-paint', 'art/color-splash', 'art/color-in',
];
const SHELL = ['index', 'home', 'games/index', 'learning/index', 'art/index', 'achievements'];

const shot = async (page, name) => { try { await page.screenshot({ path: join(OUT, name + '.png') }); console.log('  ' + name); } catch (e) { console.log('  FAIL ' + name + ' ' + e.message); } };

const run = async () => {
  const browser = await launch();
  console.log('VISUAL SHOTS ->', OUT);

  // Activities: tier 2 (young) + tier 6 (older/quiz) on phone; tier 6 on tablet.
  for (const a of ACTS) {
    for (const [tier, vp] of [[2, 'phone'], [6, 'phone'], [6, 'tablet']]) {
      const ctx = await newContext(browser, vp);
      await seedProfile(ctx, { tier, features: FEATS });
      const page = await ctx.newPage(); page.setDefaultTimeout(12000);
      await page.goto(BASE + '/' + a + '.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(1500); // let it render + first prompt/animation settle
      await shot(page, a.replace(/\//g, '_') + `-t${tier}-${vp}`);
      await ctx.close();
    }
  }

  // Shell (phone + tablet), with a profile.
  for (const s of SHELL) {
    for (const vp of ['phone', 'tablet']) {
      const ctx = await newContext(browser, vp);
      await seedProfile(ctx, { tier: 6, features: FEATS });
      const page = await ctx.newPage(); page.setDefaultTimeout(12000);
      await page.goto(BASE + '/' + s + '.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(1200);
      await shot(page, 'shell_' + s.replace(/\//g, '_') + `-${vp}`);
      await ctx.close();
    }
  }

  // Picker with NO profile (empty state) + Parent Settings (unlocked).
  for (const vp of ['phone', 'tablet']) {
    let ctx = await newContext(browser, vp); let page = await ctx.newPage();
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1200); await shot(page, `shell_picker-no-profile-${vp}`); await ctx.close();

    ctx = await newContext(browser, vp); await seedProfile(ctx, { tier: 6, features: FEATS });
    page = await ctx.newPage();
    await page.goto(BASE + '/parent/settings.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(600);
    await page.evaluate(() => { try { if (window.showMain) window.showMain(); } catch (e) {} document.querySelectorAll('.settings-panel').forEach(s => s.classList.add('acc-open')); }).catch(() => {});
    await page.waitForTimeout(600); await shot(page, `shell_settings-${vp}`, true);
    await page.evaluate(() => { try { showAddForm(); } catch (e) {} }).catch(() => {});
    await page.waitForTimeout(400); await shot(page, `shell_settings-addchild-${vp}`); await ctx.close();
  }

  await browser.close();
  console.log('done');
};
run();
