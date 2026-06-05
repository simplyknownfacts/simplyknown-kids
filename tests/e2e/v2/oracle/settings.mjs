// Oracle: Parent Settings. Method A confirms the PIN gate guards entry (security
// surface) + the page loads without errors + screenshot. Deep option-clicking
// (profile CRUD, toggles, voice, mascot, coloring upload) -> Method B.
import { shot } from '../lib/harness.mjs';
import { assertLoaded } from '../lib/checks.mjs';

export default [
  {
    id: 'settings-pin-gate', url: '/parent/settings.html', tiers: [4],
    async check(page, info) {
      await assertLoaded(page, info.report, info, 'body');
      await page.waitForTimeout(800);
      const txt = (await page.evaluate(() => document.body.innerText)) || '';
      info.report.add({ id: `${info.id} pin-gate-present`, pass: /PIN/i.test(txt), severity: 'Critical', detail: txt.slice(0, 60).replace(/\n/g, ' ') });
      await shot(page, `settings-gate-${info.vp}`);
    },
  },
];
