// Import the guarded Games resilience report without converting unfinished
// checks into passes. The only accepted product failures are the reproduced
// Bubble Pop T1-T4 instruction cells on both named viewports.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const report = JSON.parse(readFileSync(path.join(root, 'tests/e2e/out/games-resilience/report.json'), 'utf8'));
const coveragePath = path.join(auditDir, 'coverage.json');
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
const evidence = 'baseline-observations.md#games-resilience-d6687a3';
const appBaseline = 'd6687a38b2a466e13de00f9553efeb23e9f84d8f';
const expectedFailures = new Set();
for (const tier of [1, 2, 3, 4]) for (const viewport of ['desktop', 'phone']) expectedFailures.add(`tap-pop:T${tier}:${viewport}:instructions`);

if (report.baseline !== appBaseline) throw new Error(`wrong app baseline ${report.baseline}`);
if (report.rows.length !== 160) throw new Error(`incomplete report: ${report.rows.length}/160 rows`);
if (report.counts.fail !== expectedFailures.size) throw new Error(`unexpected failure count ${report.counts.fail}`);

const observedFailures = new Set();
let pass = 0, fail = 0, na = 0, rowsUpdated = 0;
for (const result of report.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row) throw new Error(`missing coverage row ${result.id}`);
  if (row.kind !== 'activity' || !result.route.startsWith('/games/')) throw new Error(`non-game result ${result.id}`);
  let touched = false;
  for (const [dimension, finding] of Object.entries(result.checks)) {
    if (dimension === 'layout_bounds') continue;
    if (!(dimension in row.checks)) throw new Error(`unknown dimension ${dimension} in ${result.id}`);
    const key = `${result.id}:${dimension}`;
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
      // Supports a corrected rerun of this same evidence batch without leaving
      // an earlier over-broad NA classification behind.
      if (row.evidence.includes(evidence) && row.checks[dimension] === 'NA') row.checks[dimension] = 'BLK';
    } else {
      throw new Error(`invalid status ${finding.status} in ${key}`);
    }
  }
  if (!touched) continue;
  row.execution = 'PARTIAL';
  if (Object.values(row.checks).includes('FAIL')) {
    row.verdict = 'FAIL';
    row.reason = 'P2 child-experience defect: Bubble Pop supplies no visible instruction at T1-T4; remaining dimensions are still incomplete.';
  } else {
    row.verdict = 'BLK';
    row.reason = 'Games negative/recovery checks recorded; remaining dimensions are still incomplete.';
  }
  if (!row.evidence.includes(evidence)) row.evidence.push(evidence);
  rowsUpdated++;
}

for (const key of expectedFailures) if (!observedFailures.has(key)) throw new Error(`expected reproduced failure missing: ${key}`);
writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ rowsUpdated, pass, fail, na }));
