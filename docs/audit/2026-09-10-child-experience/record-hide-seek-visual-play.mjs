// Guarded import for Hide & Seek's remaining visual and repeated-play checks.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '..', '..', '..');
const coveragePath = path.join(auditDir, 'coverage.json');
const reportPath = path.join(root, 'tests', 'e2e', 'out', 'hide-seek-visual-play', 'report.json');
const evidence = 'baseline-observations.md#hide--seek-visualplay-audit-at-3cb61a6';
const reportBytes = readFileSync(reportPath);
const reportSha256 = createHash('sha256').update(reportBytes).digest('hex');
const expectedReportSha256 = 'c7852a7fc2675255dd8461ba8a578b43da83c10cbeb8ff4895dd99b1df2f5453';
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

const oldTotals = JSON.stringify({ dimensions: { PASS: 9182, FAIL: 16, BLK: 3868, NA: 3434 }, verdicts: { PASS: 80, FAIL: 16, BLK: 564 }, execution: { PARTIAL: 580, COMPLETE: 80 } });
const newTotals = JSON.stringify({ dimensions: { PASS: 9253, FAIL: 24, BLK: 3769, NA: 3454 }, verdicts: { PASS: 92, FAIL: 24, BLK: 544 }, execution: { PARTIAL: 560, COMPLETE: 100 } });
const before = totals(coverage.rows);
if (![oldTotals, newTotals].includes(JSON.stringify(before))) throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);

if (report.appBaseline !== '3cb61a63b28beff0d9796fac49fd4ca85f6ece75'
    || report.auditStart !== 'c1fa8b37eda1ed788254806e7c4d15d84b7b80d4'
    || report.roundsPerRow !== 3
    || report.rows?.length !== 20
    || report.counts?.rows !== 20
    || report.counts?.pass !== 60
    || report.counts?.fail !== 0
    || report.counts?.na !== 20
    || report.counts?.blk !== 20
    || report.rows.reduce((sum, row) => sum + row.screenshotCount, 0) !== 80) {
  throw new Error('Hide & Seek report identity or totals changed');
}

const changes = { 'BLK->PASS': 0, 'BLK->FAIL': 0, 'BLK->NA': 0 };
for (const result of report.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row || row.route !== '/games/peek-a-boo.html') throw new Error(`invalid Hide & Seek ledger row ${result.id}`);
  const phoneOverlap = result.viewport === 'phone' && result.tier >= 3;
  const expectedOverlaps = phoneOverlap ? ['H1', 'hint'] : [];
  if (result.fatal || result.completedRounds !== 3 || result.wrongRecoveries !== 3 || result.freshRounds !== 3
      || !result.postRewardPlayable || result.midPlayNotices !== 0 || result.pageErrors.length || result.failedLocalRequests.length
      || result.screenshotCount !== 4 || result.expectedSpots !== (result.tier >= 5 ? 3 : 2)
      || JSON.stringify(result.animalSequence) !== JSON.stringify(['Rabbit', 'Cat', 'Panda'])
      || result.reward?.inViewport !== true || result.reward?.hint !== 'Saved in your gallery'
      || JSON.stringify(result.reward?.overlaps) !== JSON.stringify(expectedOverlaps)
      || result.geometrySamples.some(sample => sample.spotCount !== result.expectedSpots || sample.minTarget < 44
        || sample.horizontalOverflow > 1 || sample.clippedSpots || sample.viewportClips || sample.chromeOverlap
        || !sample.titleVisible || !sample.hintVisible)) {
    throw new Error(`incomplete Hide & Seek evidence ${result.id}`);
  }
  const desired = {
    score: 'NA',
    rewards: 'PASS',
    restart: 'PASS',
    long_repeated_play: 'PASS',
    visual_quality: phoneOverlap ? 'FAIL' : 'PASS',
  };
  for (const [dimension, status] of Object.entries(desired)) {
    const prior = row.checks[dimension];
    if (prior === status) continue;
    if (prior !== 'BLK') throw new Error(`cannot import ${result.id}:${dimension} from ${prior} to ${status}`);
    row.checks[dimension] = status;
    changes[`BLK->${status}`]++;
  }
  row.execution = 'COMPLETE';
  row.verdict = phoneOverlap ? 'FAIL' : 'PASS';
  row.reason = phoneOverlap
    ? 'P2 child-experience visual defect: the earned-ribbon notice covers the Hide & Seek title and instruction on phone; all behavior and other visual states completed.'
    : 'All applicable Hide & Seek behavior, wrong-answer recovery, repeated play, reward persistence and reviewed visual states complete.';
  if (!row.evidence.includes(evidence)) row.evidence.push(evidence);
}

const expectedChanges = JSON.stringify({ 'BLK->PASS': 71, 'BLK->FAIL': 8, 'BLK->NA': 20 });
const noChanges = JSON.stringify({ 'BLK->PASS': 0, 'BLK->FAIL': 0, 'BLK->NA': 0 });
if (![expectedChanges, noChanges].includes(JSON.stringify(changes))) throw new Error(`unexpected ledger transitions ${JSON.stringify(changes)}`);
const after = totals(coverage.rows);
if (JSON.stringify(after) !== newTotals) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);

writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changes, reportSha256, ...after }));
