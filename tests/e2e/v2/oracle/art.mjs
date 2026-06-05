// Oracle: art activities. Canvas ones get the rotation-bug check (spec §8.1).
import { shot } from '../lib/harness.mjs';
import { assertLoaded, assertRotationHandled } from '../lib/checks.mjs';

const settle = (p) => p.waitForTimeout(800);
const canvasArt = (id, url, tiers) => ({
  id, url, tiers,
  async check(page, info) {
    const ok = await assertLoaded(page, info.report, info, 'canvas');
    await settle(page);
    await shot(page, `${id}-t${info.tier}-${info.vp}`);
    if (ok && info.vp === 'phone') await assertRotationHandled(page, info.report, info, 'canvas');
  },
});

export default [
  canvasArt('stamp-art', '/art/stamp-art.html', [1, 5]),
  canvasArt('finger-paint', '/art/finger-paint.html', [1, 4]),
  canvasArt('color-splash', '/art/color-splash.html', [1, 3]),
  {
    id: 'color-in', url: '/art/color-in.html', tiers: [2],
    async check(page, info) {
      await assertLoaded(page, info.report, info, 'body');
      await settle(page);
      await shot(page, `color-in-t${info.tier}-${info.vp}`);
    },
  },
];
