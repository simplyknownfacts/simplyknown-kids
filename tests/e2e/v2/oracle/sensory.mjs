// Oracle: tier-1/2 auto-play ("sensory") modes — the gap Method B's agent pass
// could not reach (its shared browser backend timed out for the 0-2y band).
// These modes mostly self-advance, so "correct" = the screen PROGRESSES over a
// few seconds (visible text changes and/or audio fires), not a dead screen.
import { drainCalls, shot } from '../lib/harness.mjs';
import { assertLoaded } from '../lib/checks.mjs';

const auto = (id, url, tiers, ready = 'body') => ({
  id, url, tiers,
  async check(page, info) {
    await assertLoaded(page, info.report, info, ready);
    const snap = () => page.evaluate(() => document.body.innerText.slice(0, 240));
    const t1 = await snap();
    await page.waitForTimeout(5200); // auto-play window (colors cycle ~4s, animals spawn, etc.)
    const t2 = await snap();
    const audio = (await drainCalls(page)).length;
    const progressed = t1 !== t2 || audio > 0;
    info.report.add({ id: `${info.id} auto-play-progresses`, pass: progressed, severity: 'High', detail: `textChanged=${t1 !== t2} audioCalls=${audio}` });
    await shot(page, `${id}-t${info.tier}-${info.vp}`);
  },
});

export default [
  auto('hello-colors-auto', '/learning/hello-colors.html', [1]),
  auto('animal-sounds-auto', '/learning/animal-sounds.html', [1]),
  auto('peek-a-boo-auto', '/games/peek-a-boo.html', [1]),
  auto('count-along-auto', '/learning/count-along.html', [2]),
];
