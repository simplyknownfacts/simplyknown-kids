// Oracle: games. Method A asserts load + no console errors + the canvas-rotation
// bug (spec §8.1, high-risk) + captures screenshots. Tap-by-tap "did the right
// thing happen" for the animated canvas/gesture games is judged by Method B
// (an agent watching) — a script can't reliably distinguish a real pop from
// idle animation. Tiers chosen to hit each game's distinct modes.
import { shot } from '../lib/harness.mjs';
import { assertLoaded, assertRotationHandled } from '../lib/checks.mjs';

const settle = (page) => page.waitForTimeout(700);
const canvasGame = (id, url, tiers) => ({
  id, url, tiers,
  async check(page, info) {
    const ok = await assertLoaded(page, info.report, info, 'canvas');
    await settle(page);
    await shot(page, `${id}-t${info.tier}-${info.vp}`);
    if (ok && info.vp === 'phone') await assertRotationHandled(page, info.report, info, 'canvas');
  },
});
const domGame = (id, url, tiers, ready = 'body') => ({
  id, url, tiers,
  async check(page, info) {
    await assertLoaded(page, info.report, info, ready);
    await settle(page);
    await shot(page, `${id}-t${info.tier}-${info.vp}`);
  },
});

const hideSeek = {
  id: 'peek-a-boo', url: '/games/peek-a-boo.html', tiers: [1,5],
  async check(page, info) {
    if (!await assertLoaded(page, info.report, info, '#friendIntro')) return;
    const neutral = await page.evaluate(() => document.querySelector('#stage').dataset.phase === 'watch'
      && !document.querySelector('#friendIntro').hidden
      && !document.querySelector('.hiding-spot.clue-glow,.hiding-spot.clue-peek,.hiding-spot.clue-rustle')
      && !document.querySelector('.hiding-spot.has-peek')
      && ![...document.querySelectorAll('.hiding-spot .fallback-animal')].some(element => element.textContent.trim()));
    info.report.add({ id: `${info.id} neutral-intro`, pass: neutral, severity:'High', detail:'The friend is introduced away from every bush without revealing the answer.' });
    const count = await page.locator('.hiding-spot').count();
    await page.waitForFunction(() => document.querySelector('#roundAction').getAttribute('aria-disabled') === 'false');
    await page.locator('#roundAction').click();
    await page.waitForFunction(() => document.querySelector('#stage').dataset.phase === 'seek');
    const automatic = page.locator('.hiding-spot.clue-glow,.hiding-spot.clue-peek,.hiding-spot.clue-rustle').first();
    await automatic.waitFor();
    const target = Number(await automatic.getAttribute('data-spot'));
    info.report.add({ id: `${info.id} fair-initial-clue`, pass: Number.isInteger(target), severity:'High', detail:'Seeking begins with one partial clue instead of a blind guess.' });
    await page.locator('#showAgain').click();
    const peek = page.locator(info.tier <= 2 ? '.hiding-spot.clue-glow' : '.hiding-spot.clue-peek').first();
    await peek.waitFor();
    const hintedTarget = Number(await peek.getAttribute('data-spot'));
    info.report.add({ id: `${info.id} same-hint`, pass: hintedTarget === target && await page.locator('#stage').getAttribute('data-phase') === 'seek', severity:'High', detail:'A little hint keeps the same round and shows a partial peek.' });
    await page.locator('.hiding-spot').nth((target+1)%count).click();
    info.report.add({ id: `${info.id} wrong-retry`, pass: await page.locator('#stage').getAttribute('data-phase') === 'seek', severity:'High', detail:'An empty bush does not complete the round.' });
    await page.locator('.hiding-spot').nth(target).click();
    info.report.add({ id: `${info.id} found-from-clue`, pass: await page.locator('#stage').getAttribute('data-phase') === 'found', severity:'High', detail:'The physically selected clue location finds the friend.' });
    await shot(page, `peek-a-boo-t${info.tier}-${info.vp}`);
  },
};

export default [
  canvasGame('tap-pop', '/games/tap-pop.html', [1, 4]),
  canvasGame('magic-touch', '/games/magic-touch.html', [1, 5]),
  hideSeek,
  domGame('surprise-pop', '/games/surprise-pop.html', [2, 5]),
  domGame('tap-a-tune', '/games/tap-a-tune.html', [1, 3]),
  domGame('shape-match', '/games/shape-match.html', [1, 4]),
];
