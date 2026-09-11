// Guarded import for Surprise Pop's remaining locally testable audit dimensions.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const outputDir = path.join(root, 'tests/e2e/out/surprise-pop-visual-play');
const reportPath = path.join(outputDir, 'report.json');
const reportBytes = readFileSync(reportPath);
const reportHash = createHash('sha256').update(reportBytes).digest('hex');
const report = JSON.parse(reportBytes);
const coveragePath = path.join(auditDir, 'coverage.json');
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
const evidence = 'baseline-observations.md#surprise-pop-visualplay-audit-at-e690d35';

if (reportHash !== '67b4be94e902615eaae129f2c15e30a0542a896201c08fe96b4bbb5d2b179e94') {
  throw new Error(`Surprise Pop report hash changed: ${reportHash}`);
}
if (report.auditStart !== 'e690d35c89d0fb6eaa66f090637b42b1e3f5c74d'
  || report.productBaseline !== '45edc17709d5624213bae49ec568615b31acc028'
  || report.surprisePopSha256 !== '7aceca1440f63d222f633985956aa9dba66ca19b10184e78313e6f2bd81c1b4e'
  || report.roundsPerRow !== 6) {
  throw new Error('Surprise Pop report provenance changed');
}
if (JSON.stringify(report.counts) !== JSON.stringify({ rows: 20, pass: 40, fail: 0, na: 40, blk: 20 })
  || report.screenshots !== 112) {
  throw new Error(`unexpected Surprise Pop report totals: ${JSON.stringify(report.counts)}/${report.screenshots}`);
}
const expectedIds = new Set();
for (let tier = 1; tier <= 10; tier++) for (const viewport of ['desktop', 'phone']) {
  expectedIds.add(`surprise-pop:T${tier}:${viewport}`);
}
for (const row of report.rows) {
  if (!expectedIds.delete(row.id)) throw new Error(`unexpected or duplicate row ${row.id}`);
  if (row.activityId !== 'surprise-pop' || row.route !== '/games/surprise-pop.html'
    || row.fatal || row.rounds !== 7 || !row.wrongRecovered || !row.rapidProtected || !row.reloadRecovered
    || !row.reward?.title || row.reward.hint !== 'Saved in your gallery' || !row.reward.inViewport || row.reward.dismissMs > 500
    || row.pageErrors.length || row.failedLocalRequests.length
    || row.screenshotCount !== (row.tier >= 5 ? 6 : 5)) {
    throw new Error(`invalid Surprise Pop play evidence in ${row.id}`);
  }
  if (row.tier >= 3 && (row.collectionBeforeReload.saved < 2
    || row.collectionAfterReload.saved !== row.collectionBeforeReload.saved
    || !row.collectionBeforeReload.text.endsWith('/ 16'))) {
    throw new Error(`invalid collection evidence in ${row.id}`);
  }
  for (const sample of row.geometrySamples) {
    if (sample.minTarget < 44 || sample.clippedTargets.length || sample.clippedContent.length
      || sample.choiceOverlaps || sample.horizontalOverflow > 1) {
      throw new Error(`invalid geometry in ${row.id}`);
    }
  }
}
if (expectedIds.size || report.rows.length !== 20) throw new Error(`missing Surprise Pop rows: ${[...expectedIds].join(', ')}`);

const screenshots = readdirSync(path.join(outputDir, 'screenshots')).filter(name => name.endsWith('.png'));
if (screenshots.length !== 112) throw new Error(`expected 112 screenshots, found ${screenshots.length}`);
for (const name of screenshots) if (statSync(path.join(outputDir, 'screenshots', name)).size < 1000) throw new Error(`empty screenshot ${name}`);
for (const name of ['desktop.png', 'phone.png']) {
  if (statSync(path.join(outputDir, 'contact-sheets', name)).size < 1000) throw new Error(`empty contact sheet ${name}`);
}

let changed = 0;
for (const result of report.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row || row.route !== '/games/surprise-pop.html') throw new Error(`ledger row missing: ${result.id}`);
  const desired = { score: 'NA', rewards: 'PASS', restart: 'NA', long_repeated_play: 'PASS', visual_quality: 'PASS' };
  for (const [key, value] of Object.entries(desired)) {
    if (row.checks[key] === 'BLK') { row.checks[key] = value; changed++; }
    else if (row.checks[key] !== value) throw new Error(`unexpected prior ${result.id}:${key}=${row.checks[key]}`);
  }
  row.execution = 'COMPLETE';
  row.verdict = 'PASS';
  row.reason = 'All applicable Surprise Pop reward, repeated-play, collection, recovery and reviewed visual dimensions are complete.';
  if (!row.evidence.includes(evidence)) row.evidence.push(evidence);
}

const dimensions = { PASS: 0, FAIL: 0, BLK: 0, NA: 0 };
const verdicts = { PASS: 0, FAIL: 0, BLK: 0 };
const execution = {};
for (const row of coverage.rows) {
  verdicts[row.verdict]++;
  execution[row.execution] = (execution[row.execution] || 0) + 1;
  for (const status of Object.values(row.checks)) dimensions[status]++;
}
const expected = {
  dimensions: { PASS: 9497, FAIL: 16, BLK: 3413, NA: 3574 },
  verdicts: { PASS: 160, FAIL: 16, BLK: 484 },
  execution: { COMPLETE: 160, PARTIAL: 500 },
};
if (JSON.stringify(dimensions) !== JSON.stringify(expected.dimensions)
  || JSON.stringify(verdicts) !== JSON.stringify(expected.verdicts)
  || execution.COMPLETE !== expected.execution.COMPLETE || execution.PARTIAL !== expected.execution.PARTIAL
  || Object.keys(execution).length !== 2) {
  throw new Error(`unexpected ledger totals: ${JSON.stringify({ dimensions, verdicts, execution })}`);
}
writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changed, reportHash, screenshots: screenshots.length, ...expected }));
