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

export default [
  canvasGame('tap-pop', '/games/tap-pop.html', [1, 4]),
  canvasGame('magic-touch', '/games/magic-touch.html', [1, 5]),
  domGame('peek-a-boo', '/games/peek-a-boo.html', [1, 5]),
  domGame('surprise-pop', '/games/surprise-pop.html', [2, 5]),
  domGame('tap-a-tune', '/games/tap-a-tune.html', [1, 3]),
  domGame('shape-match', '/games/shape-match.html', [1, 4]),
];
