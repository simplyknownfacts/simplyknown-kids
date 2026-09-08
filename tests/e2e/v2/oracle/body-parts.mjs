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
// This oracle verifies quiz behavior with physical pointer input. Anatomical
// correctness uses independent artwork coordinates in body-parts-visible.test.
const tapZone = async (page, name) => {
  const box = await page.locator(`#figure .hit[data-name="${name}"]`).first().boundingBox();
  if (!box) return false;
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  return true;
};

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
      report.add({ id: `${id} wrong-tap-no-advance`, pass: /find the/i.test(hint2) && targetFromHint(hint2.split(/find /i).pop()) === target, severity: 'High', detail: `after="${hint2}"` });
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
