// Record only the twenty Magic Touch cells proven by the bounded repair,
// full browser play/render run, and independent exact-commit review.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const coveragePath = path.join(auditDir, 'coverage.json');
const reportPath = path.join(root, 'tests/e2e/out/magic-touch-visual-play/report.json');
const evidence = 'baseline-observations.md#magic-touch-repair-e16d1f9';
const reportBytes = readFileSync(reportPath);
const reportSha256 = createHash('sha256').update(reportBytes).digest('hex');
if (reportSha256 !== '008ed0e2c3649978f222d5669084197e1f67b5b7c445a64ec3dc1bd745aab317') {
  throw new Error(`unexpected report SHA-256 ${reportSha256}`);
}

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

const oldTotals = JSON.stringify({ dimensions: { PASS: 9321, FAIL: 36, BLK: 3649, NA: 3494 }, verdicts: { PASS: 110, FAIL: 26, BLK: 524 }, execution: { PARTIAL: 540, COMPLETE: 120 } });
const newTotals = JSON.stringify({ dimensions: { PASS: 9341, FAIL: 16, BLK: 3649, NA: 3494 }, verdicts: { PASS: 120, FAIL: 16, BLK: 524 }, execution: { PARTIAL: 540, COMPLETE: 120 } });
const before = totals(coverage.rows);
if (![oldTotals, newTotals].includes(JSON.stringify(before))) throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);

if (report.repairStart !== 'a7c9ac06feba7a7a3d193583e4fd4669bfa8892f'
    || report.magicTouchSha256 !== '02b885bb6b2e60d9daa3dc96b2eef9e226062f915a38be26d973c28acc79609d'
    || JSON.stringify(report.counts) !== JSON.stringify({ rows: 20, pass: 60, fail: 0, na: 40, blk: 20 })
    || report.rows?.length !== 20
    || report.rows.reduce((sum, row) => sum + row.screenshotCount, 0) !== 100) {
  throw new Error('Magic Touch repair report identity or totals changed');
}

let changed = 0;
for (const result of report.rows.filter(row => row.tier >= 6)) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row || row.route !== '/games/magic-touch.html' || row.execution !== 'COMPLETE') throw new Error(`invalid repaired row ${result.id}`);
  if (result.fatal || result.singleDotProgress !== true || result.dotRounds.length !== 3
      || result.dotRounds.some(round => round.records !== 1 || !round.wrongRecovered)
      || result.initialGeometry.minControlTarget < 44 || result.initialGeometry.horizontalOverflow > 1
      || !result.recoveredAfterReload || result.reward?.inViewport !== true || result.reward?.overlaps?.length
      || result.pageErrors.length || result.failedLocalRequests.length || result.screenshotCount !== 5) {
    throw new Error(`incomplete repaired evidence ${result.id}`);
  }
  for (const dimension of ['progression', 'visual_quality']) {
    if (row.checks[dimension] === 'FAIL') {
      row.checks[dimension] = 'PASS';
      changed++;
    } else if (row.checks[dimension] !== 'PASS') {
      throw new Error(`cannot repair ${result.id}:${dimension} from ${row.checks[dimension]}`);
    }
  }
  row.verdict = 'PASS';
  row.reason = 'All applicable Magic Touch behavior, repeated play, reward persistence and reviewed visual states complete after the independently reviewed single-progress and 44px-target repair.';
  if (!row.evidence.includes(evidence)) row.evidence.push(evidence);
}

if (![0, 20].includes(changed)) throw new Error(`unexpected repaired cell count ${changed}`);
const after = totals(coverage.rows);
if (JSON.stringify(after) !== newTotals) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);

writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changed, reportSha256, ...after }));
