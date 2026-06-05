// Oracle: shell / navigation. High-value correctness = no-profile redirect.
// The rest is load + no-error + screenshot (visual review + Method B cover nav clicks).
import { shot } from '../lib/harness.mjs';
import { assertLoaded } from '../lib/checks.mjs';

const settle = (page) => page.waitForTimeout(700);

export default [
  {
    id: 'picker', url: '/index.html', tiers: [1],
    async check(page, info) { await assertLoaded(page, info.report, info, 'body'); await settle(page); await shot(page, `picker-${info.vp}`); },
  },
  {
    // No active profile must redirect to the picker (index.html), not render a broken home.
    id: 'home-no-profile', url: '/home.html', tiers: [1], noSeed: true,
    async check(page, info) {
      await settle(page);
      const url = page.url();
      const redirected = /\/index\.html$|\/$/.test(url) || !/home\.html/.test(url);
      info.report.add({ id: `${info.id} redirects-to-picker`, pass: redirected, severity: 'Critical', detail: `landed ${url}` });
      await shot(page, `home-no-profile-${info.vp}`);
    },
  },
  {
    id: 'home', url: '/home.html', tiers: [1, 8],
    async check(page, info) {
      await settle(page);
      const onHome = /home\.html/.test(page.url());
      info.report.add({ id: `${info.id} stays-on-home-with-profile`, pass: onHome, severity: 'Critical', detail: page.url() });
      await shot(page, `home-t${info.tier}-${info.vp}`);
    },
  },
  { id: 'games-hub', url: '/games/index.html', tiers: [1, 8], async check(p, i) { await assertLoaded(p, i.report, i, 'body'); await settle(p); await shot(p, `hub-games-t${i.tier}-${i.vp}`); } },
  { id: 'learn-hub', url: '/learning/index.html', tiers: [1, 8], async check(p, i) { await assertLoaded(p, i.report, i, 'body'); await settle(p); await shot(p, `hub-learn-t${i.tier}-${i.vp}`); } },
  { id: 'art-hub', url: '/art/index.html', tiers: [1, 8], async check(p, i) { await assertLoaded(p, i.report, i, 'body'); await settle(p); await shot(p, `hub-art-t${i.tier}-${i.vp}`); } },
  { id: 'achievements', url: '/achievements.html', tiers: [4], async check(p, i) { await assertLoaded(p, i.report, i, 'body'); await settle(p); await shot(p, `achievements-${i.vp}`); } },
];
