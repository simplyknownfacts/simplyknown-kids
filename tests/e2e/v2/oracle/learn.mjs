// Oracle: learn activities (body-parts is its own module with deep correctness).
// Method A: load + no console errors + key element + screenshot, at tiers that
// hit each activity's distinct modes. Interaction correctness -> Method B.
import { shot } from '../lib/harness.mjs';
import { assertLoaded } from '../lib/checks.mjs';

const settle = (p) => p.waitForTimeout(800);
const smoke = (id, url, tiers, ready = 'body', features) => ({
  id, url, tiers, features,
  async check(page, info) {
    await assertLoaded(page, info.report, info, ready);
    await settle(page);
    await shot(page, `${id}-t${info.tier}-${info.vp}`);
  },
});

export default [
  smoke('hello-colors', '/learning/hello-colors.html', [1, 4]),
  smoke('animal-sounds', '/learning/animal-sounds.html', [1, 5], 'body', (t) => (t >= 5 ? { 'animal-sounds': { quizMode: true } } : {})),
  smoke('count-along', '/learning/count-along.html', [2, 5, 7]),
  smoke('abcs', '/learning/abcs.html', [2, 6], 'body', (t) => (t >= 6 ? { abcs: { spellMode: true } } : {})),
  smoke('days', '/learning/days.html', [3, 5, 7]),
  smoke('math', '/learning/math.html', [4, 6, 8], 'body', (t) => ({ math: { subtract: t >= 6, multiply: t >= 8 } })),
  smoke('spelling', '/learning/spelling.html', [4, 6], 'body', (t) => (t >= 6 ? { spelling: { spellMode: true } } : {})),
  smoke('money', '/learning/money.html', [4, 6], 'body', (t) => (t >= 6 ? { money: { countMode: true } } : {})),
];
