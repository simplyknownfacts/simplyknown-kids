// Import the guarded Learning resilience report without converting unfinished
// checks into passes. Only the two already-reproduced P2 families are accepted.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const report = JSON.parse(readFileSync(path.join(root, 'tests/e2e/out/learning-resilience/report.json'), 'utf8'));
const coveragePath = path.join(auditDir, 'coverage.json');
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
const evidence = 'baseline-observations.md#learning-resilience-f782603';
const appBaseline = 'd6687a38b2a466e13de00f9553efeb23e9f84d8f';
const expectedFailures = new Set();

for (const tier of [1, 2, 3, 4]) for (const viewport of ['desktop', 'phone']) {
  expectedFailures.add(`animal-sounds:T${tier}:${viewport}:instructions`);
}
for (const tier of [6, 7, 8, 9, 10]) {
  expectedFailures.add(`spelling:T${tier}:phone:layout_bounds`);
  expectedFailures.add(`spelling:T${tier}:phone:visual_quality`);
}
expectedFailures.add('spelling:T10:phone:wrong_answers');
expectedFailures.add('spelling:T10:phone:input');

if (report.baseline !== appBaseline) throw new Error(`wrong app baseline ${report.baseline}`);
if (report.rows.length !== 200) throw new Error(`incomplete report: ${report.rows.length}/200 rows`);
if (new Set(report.rows.map(row => row.id)).size !== 200) throw new Error('duplicate Learning result row');
if (report.counts.fail !== expectedFailures.size) throw new Error(`unexpected failure count ${report.counts.fail}`);

const observedFailures = new Set();
let pass = 0, fail = 0, na = 0, rowsUpdated = 0;
for (const result of report.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row) throw new Error(`missing coverage row ${result.id}`);
  if (row.kind !== 'activity' || !result.route.startsWith('/learning/')) throw new Error(`non-Learning result ${result.id}`);
  let touched = false;
  for (const [dimension, finding] of Object.entries(result.checks)) {
    const key = `${result.id}:${dimension}`;
    if (dimension === 'layout_bounds') {
      if (finding.status === 'FAIL') {
        if (!expectedFailures.has(key)) throw new Error(`unexpected layout failure ${key}: ${finding.note}`);
        observedFailures.add(key);
      } else if (finding.status !== 'PASS') throw new Error(`invalid layout status ${finding.status} in ${key}`);
      continue;
    }
    if (!(dimension in row.checks)) throw new Error(`unknown dimension ${dimension} in ${result.id}`);
    if (finding.status === 'FAIL') {
      if (!expectedFailures.has(key)) throw new Error(`unexpected product failure ${key}: ${finding.note}`);
      observedFailures.add(key); row.checks[dimension] = 'FAIL'; fail++; touched = true;
    } else if (finding.status === 'PASS') {
      if (row.checks[dimension] !== 'FAIL') row.checks[dimension] = 'PASS';
      pass++; touched = true;
    } else if (finding.status === 'NA') {
      if (row.checks[dimension] === 'BLK') row.checks[dimension] = 'NA';
      na++; touched = true;
    } else if (finding.status === 'BLK') {
      if (row.evidence.includes(evidence) && row.checks[dimension] === 'NA') row.checks[dimension] = 'BLK';
    } else {
      throw new Error(`invalid status ${finding.status} in ${key}`);
    }
  }
  if (!touched) continue;
  row.execution = 'PARTIAL';
  if (Object.values(row.checks).includes('FAIL')) {
    row.verdict = 'FAIL';
    row.reason = result.activityId === 'animal-sounds'
      ? 'P2 child-experience defect: Animal Sounds T1-T4 supplies no visible/spoken/replayable play guidance; remaining dimensions are incomplete.'
      : 'P2 child-experience defect: Spelling T6-T10 phone letter banks clip choices; T10 can hide a required letter; remaining dimensions are incomplete.';
  } else {
    row.verdict = 'BLK';
    row.reason = 'Learning negative/recovery checks recorded; remaining dimensions are still incomplete.';
  }
  if (!row.evidence.includes(evidence)) row.evidence.push(evidence);
  rowsUpdated++;
}

for (const key of expectedFailures) if (!observedFailures.has(key)) throw new Error(`expected reproduced failure missing: ${key}`);
writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ rowsUpdated, pass, fail, na, reportFailures: observedFailures.size }));
