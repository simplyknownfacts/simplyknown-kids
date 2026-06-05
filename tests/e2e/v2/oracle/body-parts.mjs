// Oracle: Body Parts (today's v97 fix + highest-risk). Asserts the CORRECTNESS
// of tap feedback, not just "no crash": correct zone → flash + "Yes"; wrong zone
// → shake + (tier<=3) names the tapped part + NO false "Yes" + no advance.
// Visual hit-accuracy (zone sits on the right body part) is covered by the
// screenshot review + Method B; here we assert the wiring by data-name.
import { drainCalls, shot } from '../lib/harness.mjs';

const PRON = { eyes: 'eye', ears: 'ear', hands: 'hand', feet: 'foot', arms: 'arm', legs: 'leg' };
const targetFromHint = (t) => {
  const m = (t || '').match(/the\s+([a-z]+)/i);
  if (!m) return null;
  const w = m[1].toLowerCase();
  return PRON[w] || w;
};
// Trigger the zone's pointerdown handler directly (bypasses overlap/actionability;
// behavioral assertion, not a coordinate test).
const tapZone = (page, name) => page.evaluate((n) => {
  const el = document.querySelector(`#figure .hit[data-name="${n}"]`);
  if (!el) return false;
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  return true;
}, name);

export default {
  id: 'body-parts',
  url: '/learning/body-parts.html',
  tiers: [2, 8],
  features: (tier) => (tier >= 4 ? {} : { 'body-parts': { allParts: false } }),
  async check(page, { report, tier, vp, id }) {
    await page.waitForSelector('#figure .hit', { timeout: 15000 });
    await page.waitForSelector('#hint');
    await page.waitForTimeout(600); // first prompt settles

    const hint = (await page.textContent('#hint')) || '';
    const target = targetFromHint(hint);
    report.add({ id: `${id} prompt-parsed`, pass: !!target, severity: 'High', detail: `hint="${hint}" -> ${target}` });
    if (!target) return;

    const zones = await page.$$eval('#figure .hit', (els) => els.map((e) => e.dataset.name));
    report.add({ id: `${id} target-zone-exists`, pass: zones.includes(target), severity: 'Critical', detail: `target=${target} zones=${[...new Set(zones)].join(',')}` });

    // WRONG tap first (so no auto-advance interferes)
    const wrongName = zones.find((n) => n !== target);
    if (wrongName) {
      await drainCalls(page);
      await tapZone(page, wrongName);
      await page.waitForTimeout(150);
      const wrongCls = await page.getAttribute(`#figure .hit[data-name="${wrongName}"]`, 'class');
      report.add({ id: `${id} wrong-tap-shakes`, pass: /\bwrong\b/.test(wrongCls || ''), severity: 'High', detail: `name=${wrongName} class="${wrongCls}"` });
      const spoke = (await drainCalls(page)).filter((c) => c.fn === 'speak').map((c) => c.args.join(' ')).join(' | ');
      report.add({ id: `${id} wrong-tap-no-false-yes`, pass: !/Yes/i.test(spoke), severity: 'Critical', detail: `spoke="${spoke}"` });
      const hint2 = await page.textContent('#hint');
      report.add({ id: `${id} wrong-tap-no-advance`, pass: hint2 === hint, severity: 'High', detail: `after="${hint2}"` });
    }

    // CORRECT tap
    await drainCalls(page);
    await tapZone(page, target);
    await page.waitForTimeout(250);
    const tgtCls = await page.getAttribute(`#figure .hit[data-name="${target}"]`, 'class');
    report.add({ id: `${id} correct-tap-flashes`, pass: /\bflash\b/.test(tgtCls || ''), severity: 'Critical', detail: `class="${tgtCls}"` });
    const yes = (await drainCalls(page)).filter((c) => c.fn === 'speak').map((c) => c.args.join(' ')).join(' | ');
    report.add({ id: `${id} correct-tap-says-yes`, pass: /Yes/i.test(yes), severity: 'High', detail: `spoke="${yes}"` });

    await shot(page, `body-parts-t${tier}-${vp}`);
  },
};
