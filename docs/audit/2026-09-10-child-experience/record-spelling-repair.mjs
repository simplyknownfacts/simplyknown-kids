// Record only the seven Spelling dimensions proven by the bounded repair run.
// This is deliberately narrower than the Learning resilience importer.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const report = JSON.parse(readFileSync(path.join(root, 'tests/e2e/out/learning-resilience/report.json'), 'utf8'));
const coveragePath = path.join(auditDir, 'coverage.json');
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
const appBaseline = 'd6687a38b2a466e13de00f9553efeb23e9f84d8f';
const evidence = 'baseline-observations.md#spelling-repair-33a26ea';
const transitions = new Map([
  ['spelling:T6:phone', ['visual_quality']],
  ['spelling:T7:phone', ['visual_quality']],
  ['spelling:T8:phone', ['visual_quality']],
  ['spelling:T9:phone', ['visual_quality']],
  ['spelling:T10:phone', ['visual_quality', 'wrong_answers', 'input']],
]);

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

if (report.baseline !== appBaseline) throw new Error(`wrong app baseline ${report.baseline}`);
if (report.rows.length !== transitions.size) throw new Error(`wrong focused report size ${report.rows.length}/${transitions.size}`);
if (new Set(report.rows.map(row => row.id)).size !== transitions.size) throw new Error('duplicate focused Spelling row');
if (report.counts.fail !== 0) throw new Error(`focused Spelling report has ${report.counts.fail} failures`);

const expectedIds = new Set(transitions.keys());
for (const result of report.rows) {
  if (!expectedIds.delete(result.id)) throw new Error(`unexpected focused row ${result.id}`);
  for (const dimension of ['layout_bounds', 'wrong_answers', 'reload_mid_round']) {
    if (result.checks[dimension]?.status !== 'PASS') {
      throw new Error(`${result.id}:${dimension} is not PASS`);
    }
  }
}
if (expectedIds.size) throw new Error(`missing focused rows: ${[...expectedIds].join(', ')}`);

const before = totals(coverage.rows);
const oldTotals = JSON.stringify({ dimensions: { PASS: 5878, FAIL: 23, BLK: 8933, NA: 1666 }, verdicts: { PASS: 0, FAIL: 21, BLK: 639 } });
const newTotals = JSON.stringify({ dimensions: { PASS: 5885, FAIL: 16, BLK: 8933, NA: 1666 }, verdicts: { PASS: 0, FAIL: 16, BLK: 644 } });
if (![oldTotals, newTotals].includes(JSON.stringify(before))) {
  throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);
}

let changed = 0;
for (const [id, dimensions] of transitions) {
  const row = coverage.rows.find(candidate => candidate.id === id);
  if (!row) throw new Error(`missing coverage row ${id}`);
  const alreadyRecorded = row.evidence.includes(evidence);
  for (const dimension of dimensions) {
    const current = row.checks[dimension];
    if (current === 'FAIL') {
      row.checks[dimension] = 'PASS';
      changed++;
    } else if (current !== 'PASS' || !alreadyRecorded) {
      throw new Error(`unexpected prior state ${id}:${dimension}=${current}`);
    }
  }
  row.execution = 'PARTIAL';
  row.verdict = 'BLK';
  row.reason = 'Spelling repair verified; remaining dimensions are incomplete.';
  if (!alreadyRecorded) row.evidence.push(evidence);
}

if (![0, 7].includes(changed)) throw new Error(`unexpected transition count ${changed}`);
const after = totals(coverage.rows);
if (JSON.stringify(after) !== newTotals) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);

writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changed, ...after }));
