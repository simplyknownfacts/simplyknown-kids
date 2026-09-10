// Import only the still-unproven ledger dimensions exercised by the bounded
// five-route shared child-flow resilience report.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const report = JSON.parse(readFileSync(path.join(root, 'tests/e2e/out/shared-resilience/report.json'), 'utf8'));
const coveragePath = path.join(auditDir, 'coverage.json');
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
const evidence = 'baseline-observations.md#shared-resilience-955b701';
const routes = new Set(['index.html', 'home.html', 'achievements.html', 'parent/settings.html', 'listen/index.html']);
const skipped = new Set(['layout_bounds', 'visual_quality']);

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

if (report.baseline !== 'd2f23c823a70c76c5bea58233fb75f70c915c19c') throw new Error(`wrong shared report baseline ${report.baseline}`);
if (JSON.stringify(report.counts) !== JSON.stringify({ rows: 100, pass: 1160, fail: 0, na: 440, blk: 100 })) {
  throw new Error(`unexpected shared report totals ${JSON.stringify(report.counts)}`);
}
if (report.rows.length !== 100 || new Set(report.rows.map(row => row.id)).size !== 100) throw new Error('incomplete or duplicate shared report rows');

const expectedIds = new Set();
for (const route of routes) for (let tier = 1; tier <= 10; tier++) for (const viewport of ['desktop', 'phone']) {
  expectedIds.add(`${route}:T${tier}:${viewport}`);
}
for (const result of report.rows) {
  if (!expectedIds.delete(result.id)) throw new Error(`unexpected shared result ${result.id}`);
  if (result.checks.layout_bounds?.status !== 'PASS') throw new Error(`${result.id}:layout_bounds is not PASS`);
  if (result.checks.visual_quality?.status !== 'BLK') throw new Error(`${result.id}:visual_quality must remain BLK`);
  if (Object.values(result.checks).some(check => check.status === 'FAIL')) throw new Error(`${result.id} contains a failure`);
}
if (expectedIds.size) throw new Error(`missing shared rows: ${[...expectedIds].join(', ')}`);

const before = totals(coverage.rows);
const oldTotals = JSON.stringify({ dimensions: { PASS: 6867, FAIL: 16, BLK: 7323, NA: 2294 }, verdicts: { PASS: 0, FAIL: 16, BLK: 644 } });
const newTotals = JSON.stringify({ dimensions: { PASS: 7887, FAIL: 16, BLK: 5863, NA: 2734 }, verdicts: { PASS: 0, FAIL: 16, BLK: 644 } });
if (![oldTotals, newTotals].includes(JSON.stringify(before))) throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);

const changes = { 'BLK->PASS': 0, 'BLK->NA': 0 };
for (const result of report.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row || row.kind !== 'shared' || !routes.has(result.routeId)) throw new Error(`invalid shared coverage row ${result.id}`);
  const alreadyRecorded = row.evidence.includes(evidence);
  for (const [dimension, finding] of Object.entries(result.checks)) {
    if (skipped.has(dimension)) continue;
    if (!(dimension in row.checks)) throw new Error(`unknown dimension ${result.id}:${dimension}`);
    const prior = row.checks[dimension];
    if (finding.status === 'PASS') {
      if (prior === 'BLK') { row.checks[dimension] = 'PASS'; changes['BLK->PASS']++; }
      else if (prior !== 'PASS') throw new Error(`cannot apply PASS over ${prior} in ${result.id}:${dimension}`);
    } else if (finding.status === 'NA') {
      if (prior === 'BLK') { row.checks[dimension] = 'NA'; changes['BLK->NA']++; }
      else if (prior !== 'NA') throw new Error(`cannot apply NA over ${prior} in ${result.id}:${dimension}`);
    } else if (finding.status !== 'BLK') {
      throw new Error(`invalid result ${finding.status} in ${result.id}:${dimension}`);
    }
  }
  row.execution = 'PARTIAL';
  row.verdict = 'BLK';
  row.reason = 'Shared child-flow negative/recovery checks recorded; remaining dimensions are incomplete.';
  if (!alreadyRecorded) row.evidence.push(evidence);
}

const expectedChanges = JSON.stringify({ 'BLK->PASS': 1020, 'BLK->NA': 440 });
const noChanges = JSON.stringify({ 'BLK->PASS': 0, 'BLK->NA': 0 });
if (![expectedChanges, noChanges].includes(JSON.stringify(changes))) throw new Error(`unexpected ledger transitions ${JSON.stringify(changes)}`);
const after = totals(coverage.rows);
if (JSON.stringify(after) !== newTotals) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);

writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changes, ...after }));
