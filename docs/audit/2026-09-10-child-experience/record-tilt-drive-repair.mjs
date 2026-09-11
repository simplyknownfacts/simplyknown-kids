// Record only the forty Tilt Drive FAIL cells proven repaired by the full
// browser run and independent exact-commit review.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const coveragePath = path.join(auditDir, 'coverage.json');
const reportPath = path.join(root, 'tests/e2e/out/tilt-drive-visual-play/report.json');
const evidence = 'baseline-observations.md#tilt-drive-repair-at-b036b0e';
const reportBytes = readFileSync(reportPath);
const reportSha256 = createHash('sha256').update(reportBytes).digest('hex');
if (reportSha256 !== '2e6c47fe89be99560b527e0a991b4b110ba30fd72ca0e05561b8ec93bdf61d00') throw new Error(`unexpected Tilt Drive report SHA-256 ${reportSha256}`);
const report = JSON.parse(reportBytes);
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));

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

const oldTotals = JSON.stringify({ dimensions: { PASS: 9597, FAIL: 56, BLK: 3273, NA: 3574 }, verdicts: { PASS: 160, FAIL: 36, BLK: 464 }, execution: { PARTIAL: 480, COMPLETE: 180 } });
const newTotals = JSON.stringify({ dimensions: { PASS: 9637, FAIL: 16, BLK: 3273, NA: 3574 }, verdicts: { PASS: 180, FAIL: 16, BLK: 464 }, execution: { PARTIAL: 480, COMPLETE: 180 } });
const downstreamTotals = JSON.stringify({ dimensions: { PASS: 9721, FAIL: 16, BLK: 3189, NA: 3574 }, verdicts: { PASS: 200, FAIL: 16, BLK: 444 }, execution: { PARTIAL: 460, COMPLETE: 200 } });
const before = totals(coverage.rows);
if (![oldTotals, newTotals, downstreamTotals].includes(JSON.stringify(before))) throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);

if (report.auditStart !== '0c6d9e5cec3f0f49bea623dce561c9b727bbffa9'
    || report.tiltDriveSha256 !== '9450e59ec539b1c364ff95429ac7b7c69f0f0a98f6f30a7c2f06a127e75d7d3b'
    || JSON.stringify(report.counts) !== JSON.stringify({ rows: 20, pass: 140, fail: 0, blk: 20 })
    || report.rows?.length !== 20 || report.screenshots !== 140) throw new Error('Tilt Drive repair report identity or totals changed');

let changed = 0;
for (const result of report.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row || row.route !== '/games/tilt-drive.html' || row.execution !== 'COMPLETE') throw new Error(`invalid repaired row ${result.id}`);
  if (result.fatal || result.completedRounds !== 5 || result.unavailableCaption !== 'Drag left & right to steer! 👆'
      || result.deniedCaption !== 'Drag left & right to steer! 👆' || result.rejectedCaption !== 'Drag left & right to steer! 👆'
      || result.grantedCaption !== 'Tilt to steer! 🚗' || !result.unavailableFallback || !result.deniedFallback
      || !result.rejectedFallback || !result.validSensor || !result.invalidFirstIgnored || result.invalidSensorPoisoned
      || !result.invalidSensorFallbackRecovered || !result.reloadRecovered || !result.reward?.inViewport
      || result.counterAfter !== result.counterBefore + result.scoreResults.reduce((sum, score) => sum + score.meters, 0)
      || result.geometrySamples.some(sample => sample.minTarget < 44 || sample.clipped.length || sample.horizontalOverflow > 1)
      || result.pageErrors.length || result.failedLocalRequests.length || result.screenshotCount !== 7) throw new Error(`incomplete repaired evidence ${result.id}`);
  for (const dimension of ['instructions', 'input']) {
    if (row.checks[dimension] === 'FAIL') { row.checks[dimension] = 'PASS'; changed++; }
    else if (row.checks[dimension] !== 'PASS') throw new Error(`cannot repair ${result.id}:${dimension} from ${row.checks[dimension]}`);
  }
  row.verdict = 'PASS';
  row.reason = 'All applicable Tilt Drive behavior, repeated play, score, reward and reviewed visual states complete after the independently reviewed sensor fallback repair.';
  if (!row.evidence.includes(evidence)) row.evidence.push(evidence);
}

if (![0, 40].includes(changed)) throw new Error(`unexpected repaired cell count ${changed}`);
const after = totals(coverage.rows);
const expectedAfter = JSON.stringify(before) === downstreamTotals ? downstreamTotals : newTotals;
if (JSON.stringify(after) !== expectedAfter) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);
writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changed, reportSha256, ...after }));
