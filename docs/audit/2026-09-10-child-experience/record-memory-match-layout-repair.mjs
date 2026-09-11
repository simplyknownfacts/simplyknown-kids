// Guarded import for the independently reviewed Memory Match layout repair.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '..', '..', '..');
const coveragePath = path.join(auditDir, 'coverage.json');
const reportPath = path.join(root, 'tests', 'e2e', 'out', 'memory-match-visual-play', 'report.json');
const evidence = 'baseline-observations.md#memory-match-layout-repair-3cb61a6';
const reportBytes = readFileSync(reportPath);
const reportSha256 = createHash('sha256').update(reportBytes).digest('hex');
const expectedReportSha256 = '620b2491fa731f7bfaea0f7b3ba079f84aebe3ae07e2fa7e0b75dbee9be886ed';
if (reportSha256 !== expectedReportSha256) throw new Error(`unexpected report SHA-256 ${reportSha256}`);

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

const oldTotals = JSON.stringify({ dimensions: { PASS: 9167, FAIL: 31, BLK: 3868, NA: 3434 }, verdicts: { PASS: 65, FAIL: 31, BLK: 564 }, execution: { PARTIAL: 580, COMPLETE: 80 } });
const newTotals = JSON.stringify({ dimensions: { PASS: 9182, FAIL: 16, BLK: 3868, NA: 3434 }, verdicts: { PASS: 80, FAIL: 16, BLK: 564 }, execution: { PARTIAL: 580, COMPLETE: 80 } });
const before = totals(coverage.rows);
if (![oldTotals, newTotals].includes(JSON.stringify(before))) throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);

if (report.appBaseline !== 'd92e248a45507a0be8c7fe7dd9274924f17c07cf'
    || report.auditStart !== '80f026ff45fe04591e35abe06a9e7a0929e27e99'
    || report.rows?.length !== 20
    || report.counts?.rows !== 20
    || report.counts?.pass !== 100
    || report.counts?.fail !== 0
    || report.counts?.na !== 20
    || report.counts?.blk !== 20
    || report.rows.reduce((sum, row) => sum + row.screenshotCount, 0) !== 80) {
  throw new Error('Memory Match repair report identity or totals changed');
}

const repairedDesktopTiers = new Set([1, 2, 5, 6, 7, 8, 9]);
let changed = 0;
for (const result of report.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row || row.route !== '/games/memory-match.html') throw new Error(`invalid Memory Match ledger row ${result.id}`);
  if (result.fatal || result.completedRounds !== 3 || result.wrongRecoveries !== 3 || result.freshBoards !== 3
      || !result.postRewardPlayable || result.midPlayNotices !== 0 || result.pageErrors.length || result.failedLocalRequests.length
      || result.screenshotCount !== 4 || result.reward?.inViewport !== true || result.reward?.dismissMs >= 1000
      || result.titleOverlap !== false || result.geometrySamples.some(sample => sample.verticalOffscreen !== 0
        || sample.horizontalClip !== 0 || sample.horizontalOverflow !== 0 || sample.chromeOverlap !== 0
        || sample.minTarget < 44 || !sample.titleVisible || !sample.hintVisible)) {
    throw new Error(`incomplete repaired Memory Match evidence ${result.id}`);
  }
  const wasAffected = (result.viewport === 'phone' && result.tier >= 3)
    || (result.viewport === 'desktop' && repairedDesktopTiers.has(result.tier));
  const prior = row.checks.visual_quality;
  if (wasAffected && prior === 'FAIL') {
    row.checks.visual_quality = 'PASS';
    changed++;
  } else if (prior !== 'PASS') {
    throw new Error(`unexpected visual status ${prior} in ${result.id}`);
  }
  row.execution = 'COMPLETE';
  row.verdict = 'PASS';
  row.reason = 'All applicable Memory Match behavior, recovery, repeated full-board play, reward persistence and visual states are complete after the independently reviewed layout repair.';
  if (!row.evidence.includes(evidence)) row.evidence.push(evidence);
}

if (![0, 15].includes(changed)) throw new Error(`unexpected changed cell count ${changed}`);
const after = totals(coverage.rows);
if (JSON.stringify(after) !== newTotals) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);

writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changed, reportSha256, ...after }));
