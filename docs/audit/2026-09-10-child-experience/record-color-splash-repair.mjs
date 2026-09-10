// Record only the ten Color Splash visual-quality cells proven by the bounded
// target repair, its browser regression, and independent exact-commit review.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const report = JSON.parse(readFileSync(path.join(root, 'tests/e2e/out/art-resilience/report.json'), 'utf8'));
const coveragePath = path.join(auditDir, 'coverage.json');
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
const paintSource = readFileSync(path.join(root, 'js/paint.js'), 'utf8');
const evidence = 'baseline-observations.md#color-splash-repair-9cffb54';
const transitions = new Set(Array.from({ length: 10 }, (_, index) => `color-splash:T${index + 1}:phone`));

function totals(rows) {
  const dimensions = { PASS: 0, FAIL: 0, BLK: 0, NA: 0 };
  const verdicts = { PASS: 0, FAIL: 0, BLK: 0 };
  for (const row of rows) {
    if (!(row.verdict in verdicts)) throw new Error(`unknown verdict ${row.verdict} in ${row.id}`);
    verdicts[row.verdict]++;
    for (const status of Object.values(row.checks)) {
      if (!(status in dimensions)) throw new Error(`unknown status ${status} in ${row.id}`);
      dimensions[status]++;
    }
  }
  return { dimensions, verdicts };
}

if (report.baseline !== '33a26ea4851dc70d74d6bb8b51f2a577e5251de6') throw new Error(`wrong Art report baseline ${report.baseline}`);
if (JSON.stringify(report.counts) !== JSON.stringify({ rows: 80, pass: 1212, fail: 0, na: 628, blk: 240 })) {
  throw new Error(`unexpected repaired Art totals ${JSON.stringify(report.counts)}`);
}
if (!paintSource.includes('.vb-sw{width:44px;height:44px;')) throw new Error('phone Color Splash pips are not 44px');
if (!paintSource.includes('@media (min-width:768px){.vb-sw{width:52px;height:52px;}')) throw new Error('desktop Color Splash pips are not preserved at 52px');

const repairedRows = report.rows.filter(row => transitions.has(row.id));
if (repairedRows.length !== transitions.size || new Set(repairedRows.map(row => row.id)).size !== transitions.size) {
  throw new Error(`incomplete repaired Color Splash rows ${repairedRows.length}/${transitions.size}`);
}
for (const row of repairedRows) {
  if (row.checks.layout_bounds?.status !== 'PASS') throw new Error(`${row.id}:layout_bounds is not PASS`);
  if (Object.values(row.checks).some(check => check.status === 'FAIL')) throw new Error(`${row.id} still contains a product failure`);
}

const before = totals(coverage.rows);
const oldTotals = JSON.stringify({ dimensions: { PASS: 6857, FAIL: 26, BLK: 7323, NA: 2294 }, verdicts: { PASS: 0, FAIL: 26, BLK: 634 } });
const newTotals = JSON.stringify({ dimensions: { PASS: 6867, FAIL: 16, BLK: 7323, NA: 2294 }, verdicts: { PASS: 0, FAIL: 16, BLK: 644 } });
if (![oldTotals, newTotals].includes(JSON.stringify(before))) throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);

let changed = 0;
for (const id of transitions) {
  const row = coverage.rows.find(candidate => candidate.id === id);
  if (!row) throw new Error(`missing coverage row ${id}`);
  const alreadyRecorded = row.evidence.includes(evidence);
  if (row.checks.visual_quality === 'FAIL') {
    row.checks.visual_quality = 'PASS';
    changed++;
  } else if (row.checks.visual_quality !== 'PASS' || !alreadyRecorded) {
    throw new Error(`unexpected prior state ${id}:visual_quality=${row.checks.visual_quality}`);
  }
  row.execution = 'PARTIAL';
  row.verdict = 'BLK';
  row.reason = 'Color Splash phone targets verified at 44px; remaining dimensions are incomplete.';
  if (!alreadyRecorded) row.evidence.push(evidence);
}

if (![0, 10].includes(changed)) throw new Error(`unexpected transition count ${changed}`);
const after = totals(coverage.rows);
if (JSON.stringify(after) !== newTotals) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);

writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changed, ...after }));
