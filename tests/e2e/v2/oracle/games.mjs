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
    if (!await assertLoaded(page, info.report, info, '.peek-marker')) return;
    const target = await page.locator('.peek-marker').evaluate(e => Number(e.closest('button').dataset.spot));
    const count = await page.locator('.hiding-spot').count();
    await page.locator('#roundAction').click();
    await page.waitForFunction(() => document.querySelector('#stage').dataset.phase === 'seek');
    info.report.add({ id: `${info.id} animal-hidden`, pass: await page.locator('.peek-marker').count() === 0, severity:'High', detail:'The observed animal hides before the child chooses.' });
    await page.locator('.hiding-spot').nth((target+1)%count).click();
    info.report.add({ id: `${info.id} wrong-retry`, pass: await page.locator('#stage').getAttribute('data-phase') === 'seek', severity:'High', detail:'An empty bush does not complete the round.' });
    await page.locator('#showAgain').click();
    const replay = await page.locator('.peek-marker').evaluate(e => Number(e.closest('button').dataset.spot));
    info.report.add({ id: `${info.id} same-replay`, pass: replay === target, severity:'High', detail:'Replay keeps the observed location.' });
    await page.locator('#roundAction').click();
    await page.waitForFunction(() => document.querySelector('#stage').dataset.phase === 'seek');
    await page.locator('.hiding-spot').nth(target).click();
    info.report.add({ id: `${info.id} remembered-location`, pass: await page.locator('#stage').getAttribute('data-phase') === 'found', severity:'High', detail:'The watched location completes the round.' });
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
