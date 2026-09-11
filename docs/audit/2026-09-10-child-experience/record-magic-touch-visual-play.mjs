// Guarded import for the inspected Magic Touch visual and repeated-play audit.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '..', '..', '..');
const coveragePath = path.join(auditDir, 'coverage.json');
const reportPath = path.join(root, 'tests', 'e2e', 'out', 'magic-touch-visual-play', 'report.json');
const evidence = 'baseline-observations.md#magic-touch-visualplay-audit-at-f3fe28f';
const reportBytes = readFileSync(reportPath);
const reportSha256 = createHash('sha256').update(reportBytes).digest('hex');
const expectedReportSha256 = '0efc4747cab50c56737a3598b826ff945dca7540946c94865e8790a4b3d4c079';
if (reportSha256 !== expectedReportSha256) throw new Error(`unexpected report SHA-256 ${reportSha256}`);

const report = JSON.parse(reportBytes);
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
const selected = ['progression', 'score', 'rewards', 'restart', 'long_repeated_play', 'visual_quality'];

function totals(rows) {
  const dimensions = { PASS: 0, FAIL: 0, BLK: 0, NA: 0 };
  const verdicts = { PASS: 0, FAIL: 0, BLK: 0 };
  const execution = {};
  for (const row of rows) {
    verdicts[row.verdict]++;
    execution[row.execution] = (execution[row.execution] || 0) + 1;
    for (const status of Object.values(row.checks)) dimensions[status]++;
  }
  return { dimensions, verdicts, execution };
}

const oldTotals = JSON.stringify({ dimensions: { PASS: 9261, FAIL: 16, BLK: 3769, NA: 3454 }, verdicts: { PASS: 100, FAIL: 16, BLK: 544 }, execution: { PARTIAL: 560, COMPLETE: 100 } });
const newTotals = JSON.stringify({ dimensions: { PASS: 9321, FAIL: 36, BLK: 3649, NA: 3494 }, verdicts: { PASS: 110, FAIL: 26, BLK: 524 }, execution: { PARTIAL: 540, COMPLETE: 120 } });
const before = totals(coverage.rows);
if (![oldTotals, newTotals].includes(JSON.stringify(before))) throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);

if (report.auditStart !== 'f3fe28f08992c39869108bb8f6edc1721decba2c'
    || report.magicTouchSha256 !== 'ed665c21f5b33c1ebb2ff020dbfb89a77091b4e6b53500a9a0f1ba238709d86c'
    || report.rows?.length !== 20 || report.counts?.rows !== 20 || report.counts?.pass !== 50
    || report.counts?.fail !== 10 || report.counts?.na !== 40 || report.counts?.blk !== 20
    || report.rows.reduce((sum, row) => sum + row.screenshotCount, 0) !== 100) {
  throw new Error('Magic Touch report identity or totals changed');
}

for (const result of report.rows) {
  const schoolAge = result.tier >= 6;
  if (result.fatal || result.route !== '/games/magic-touch.html' || result.screenshotCount !== 5
      || !result.recoveredAfterReload || result.freeRecords < 6 || result.pageErrors.length || result.failedLocalRequests.length
      || result.reward?.inViewport !== true || result.reward?.overlaps?.length
      || result.reward?.hint !== 'Saved in your gallery' || result.finalProgress?.repeat !== 1
      || result.deferredReward !== (result.tier <= 2)
      || (schoolAge && (result.dotRounds.length !== 3 || !result.doubleDotProgress
        || result.dotRounds.some(round => round.records !== 2 || !round.wrongRecovered)
        || result.initialGeometry?.minControlTarget !== 42))
      || (!schoolAge && (result.dotRounds.length || result.doubleDotProgress || result.initialGeometry?.minControlTarget < 44))) {
    throw new Error(`incomplete Magic Touch evidence ${result.id}`);
  }
}

let changedCells = 0;
for (const result of report.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row || row.route !== '/games/magic-touch.html') throw new Error(`invalid Magic Touch ledger row ${result.id}`);
  const visualStatus = result.tier >= 6 ? 'FAIL' : 'PASS';
  for (const dimension of selected) {
    const status = dimension === 'visual_quality' ? visualStatus : result.checks[dimension]?.status;
    if (!status || status === 'BLK') throw new Error(`unreviewed ${result.id} ${dimension}`);
    if (row.checks[dimension] === status) continue;
    if (row.checks[dimension] !== 'BLK') throw new Error(`refusing to overwrite accepted ${result.id} ${dimension}`);
    row.checks[dimension] = status;
    changedCells++;
  }
  row.execution = 'COMPLETE';
  row.verdict = Object.values(row.checks).includes('FAIL') ? 'FAIL' : Object.values(row.checks).includes('BLK') ? 'BLK' : 'PASS';
  row.reason = result.tier >= 6
    ? 'P2 Magic Touch defects: each connected shape records progress twice, and the goal-mode toggle is 42px high against the Kids 44px floor; all other selected visual/play dimensions passed.'
    : 'Magic Touch free play, reward, repeated interaction, visual states and reload recovery passed; no score or explicit restart mechanic applies.';
  if (!row.evidence.includes(evidence)) row.evidence.push(evidence);
}

if (![0, 120].includes(changedCells)) throw new Error(`unexpected changed cell count ${changedCells}`);
const after = totals(coverage.rows);
if (JSON.stringify(after) !== newTotals) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);

writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changedCells, reportSha256, ...after }));
