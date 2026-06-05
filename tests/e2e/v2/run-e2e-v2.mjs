// E2E v2 orchestrator. Data-driven: each oracle entry declares its url, tiers,
// optional per-tier features, and a check() that performs interactions and
// asserts the real OUTCOME. Runs entry x tier x viewport on the live site.
//
// Usage:
//   node tests/e2e/v2/run-e2e-v2.mjs                          all entries, their tiers, phone
//   node tests/e2e/v2/run-e2e-v2.mjs --only=body-parts --tiers=2,8 --viewports=phone,tablet
//   BASE_URL=http://localhost:8791 node tests/e2e/v2/run-e2e-v2.mjs
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { launch, newContext, seedProfile, instrument, getErrs, shot, makeReport, BASE, TIERS } from './lib/harness.mjs';
import bodyParts from './oracle/body-parts.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ALL = [bodyParts]; // append more oracle entries here as they're built

const args = process.argv.slice(2);
const argVal = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d; };
const only = argVal('only', null);
const wantTiers = argVal('tiers', null) ? argVal('tiers').split(',').map(Number) : null;
const wantVps = argVal('viewports', 'phone').split(',');

const report = makeReport();
console.log(`E2E v2 against ${BASE}`);
const browser = await launch();
try {
  for (const entry of ALL) {
    if (only && entry.id !== only) continue;
    const tiers = (entry.tiers || TIERS).filter((t) => !wantTiers || wantTiers.includes(t));
    for (const tier of tiers) {
      for (const vp of wantVps) {
        const ctx = await newContext(browser, vp);
        const feats = entry.features ? entry.features(tier) : {};
        await seedProfile(ctx, { tier, features: feats });
        const page = await ctx.newPage();
        page.setDefaultTimeout(15000);
        const info = { report, tier, vp, page, BASE, id: `${entry.id}/t${tier}/${vp}` };
        try {
          await page.goto(BASE + entry.url, { waitUntil: 'domcontentloaded' });
          await instrument(page);
          await entry.check(page, info);
          const e = await getErrs(page);
          report.add({ id: `${info.id} no-console-errors`, pass: e.length === 0, severity: 'High', detail: e.slice(0, 2).join('; ') });
        } catch (err) {
          report.add({ id: `${info.id} threw`, pass: false, severity: 'Critical', detail: String(err).slice(0, 180) });
          try { await shot(page, `${entry.id}-t${tier}-${vp}-ERROR`); } catch { /* ignore */ }
        }
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
}

const sum = report.summary();
writeFileSync(join(HERE, 'report.json'), JSON.stringify({ base: BASE, summary: { total: sum.total, passed: sum.passed, failed: sum.failed }, rows: report.rows() }, null, 2));
console.log('\n=== SUMMARY ===', sum.passed + '/' + sum.total + ' passed, ' + sum.failed + ' failed');
process.exit(sum.failed > 0 ? 1 : 0);
