// Import the guarded Art resilience report without converting unfinished
// judgement or soak checks into passes. The only accepted product failure is
// the 42px Color Splash phone palette at T1-T10.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const report = JSON.parse(readFileSync(path.join(root, 'tests/e2e/out/art-resilience/report.json'), 'utf8'));
const coveragePath = path.join(auditDir, 'coverage.json');
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
const evidence = 'baseline-observations.md#art-resilience-2b500ff';
const appBaseline = '33a26ea4851dc70d74d6bb8b51f2a577e5251de6';
const activities = new Set(['stamp-art', 'finger-paint', 'color-splash', 'color-in']);
const expectedFailures = new Set();
for (let tier = 1; tier <= 10; tier++) {
  expectedFailures.add(`color-splash:T${tier}:phone:layout_bounds`);
  expectedFailures.add(`color-splash:T${tier}:phone:visual_quality`);
}

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
if (report.rows.length !== 80) throw new Error(`incomplete Art report: ${report.rows.length}/80 rows`);
if (new Set(report.rows.map(row => row.id)).size !== 80) throw new Error('duplicate Art result row');
if (JSON.stringify(report.counts) !== JSON.stringify({ rows: 80, pass: 1202, fail: 20, na: 628, blk: 230 })) {
  throw new Error(`unexpected report totals ${JSON.stringify(report.counts)}`);
}

const before = totals(coverage.rows);
const oldTotals = JSON.stringify({ dimensions: { PASS: 5885, FAIL: 16, BLK: 8933, NA: 1666 }, verdicts: { PASS: 0, FAIL: 16, BLK: 644 } });
const newTotals = JSON.stringify({ dimensions: { PASS: 6857, FAIL: 26, BLK: 7323, NA: 2294 }, verdicts: { PASS: 0, FAIL: 26, BLK: 634 } });
if (![oldTotals, newTotals].includes(JSON.stringify(before))) {
  throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);
}

const observedFailures = new Set();
const changes = { 'BLK->PASS': 0, 'BLK->FAIL': 0, 'BLK->NA': 0 };
for (const result of report.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row) throw new Error(`missing coverage row ${result.id}`);
  if (row.kind !== 'activity' || !result.route.startsWith('/art/') || !activities.has(result.activityId)) {
    throw new Error(`non-Art result ${result.id}`);
  }
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
    const prior = row.checks[dimension];
    if (finding.status === 'FAIL') {
      if (!expectedFailures.has(key)) throw new Error(`unexpected product failure ${key}: ${finding.note}`);
      observedFailures.add(key);
      row.checks[dimension] = 'FAIL';
    } else if (finding.status === 'PASS') {
      if (prior !== 'FAIL') row.checks[dimension] = 'PASS';
    } else if (finding.status === 'NA') {
      if (prior === 'BLK') row.checks[dimension] = 'NA';
    } else if (finding.status !== 'BLK') {
      throw new Error(`invalid status ${finding.status} in ${key}`);
    }
    const next = row.checks[dimension];
    const transition = `${prior}->${next}`;
    if (transition in changes) changes[transition]++;
  }
  row.execution = 'PARTIAL';
  if (Object.values(row.checks).includes('FAIL')) {
    row.verdict = 'FAIL';
    row.reason = 'P2 child-experience defect: Color Splash phone color pips are 42x42px, below the Kids 44px child-target floor; remaining dimensions are incomplete.';
  } else {
    row.verdict = 'BLK';
    row.reason = 'Art negative/recovery checks recorded; remaining dimensions are still incomplete.';
  }
  if (!row.evidence.includes(evidence)) row.evidence.push(evidence);
}

for (const key of expectedFailures) if (!observedFailures.has(key)) throw new Error(`expected reproduced failure missing: ${key}`);
const expectedChanges = JSON.stringify({ 'BLK->PASS': 972, 'BLK->FAIL': 10, 'BLK->NA': 628 });
const noChanges = JSON.stringify({ 'BLK->PASS': 0, 'BLK->FAIL': 0, 'BLK->NA': 0 });
if (![expectedChanges, noChanges].includes(JSON.stringify(changes))) throw new Error(`unexpected ledger transitions ${JSON.stringify(changes)}`);
const after = totals(coverage.rows);
if (JSON.stringify(after) !== newTotals) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);

writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changes, ...after, reportFailures: observedFailures.size }));
