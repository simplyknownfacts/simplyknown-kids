// Guarded import for the Memory Match full-board visual and repeated-play audit.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '..', '..', '..');
const coveragePath = path.join(auditDir, 'coverage.json');
const reportPath = path.join(root, 'tests', 'e2e', 'out', 'memory-match-visual-play', 'report.json');
const evidence = 'baseline-observations.md#memory-match-visual-play-d404038';
const reportBytes = readFileSync(reportPath);
const reportSha256 = createHash('sha256').update(reportBytes).digest('hex');
const expectedReportSha256 = '6b3c61164e5e033b3be5b1db50df2d89b4d3e13ab3608499019f6f86eb4f3b1e';
if (reportSha256 !== expectedReportSha256) throw new Error(`unexpected report SHA-256 ${reportSha256}`);

const report = JSON.parse(reportBytes);
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));

function totals(rows) {
  const dimensions = { PASS: 0, FAIL: 0, BLK: 0, NA: 0 };
  const verdicts = { PASS: 0, FAIL: 0, BLK: 0 };
  const execution = {};
  for (const row of rows) {
    if (!(row.verdict in verdicts)) throw new Error(`unknown verdict ${row.verdict} in ${row.id}`);
    verdicts[row.verdict]++;
    execution[row.execution] = (execution[row.execution] || 0) + 1;
    for (const status of Object.values(row.checks)) {
      if (!(status in dimensions)) throw new Error(`unknown status ${status} in ${row.id}`);
      dimensions[status]++;
    }
  }
  return { dimensions, verdicts, execution };
}

const oldTotals = JSON.stringify({
  dimensions: { PASS: 9098, FAIL: 16, BLK: 3972, NA: 3414 },
  verdicts: { PASS: 60, FAIL: 16, BLK: 584 },
  execution: { PARTIAL: 600, COMPLETE: 60 },
});
const newTotals = JSON.stringify({
  dimensions: { PASS: 9167, FAIL: 31, BLK: 3868, NA: 3434 },
  verdicts: { PASS: 65, FAIL: 31, BLK: 564 },
  execution: { PARTIAL: 580, COMPLETE: 80 },
});
const before = totals(coverage.rows);
if (![oldTotals, newTotals].includes(JSON.stringify(before))) {
  throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);
}

if (report.appBaseline !== 'd92e248a45507a0be8c7fe7dd9274924f17c07cf'
    || report.auditStart !== '80f026ff45fe04591e35abe06a9e7a0929e27e99'
    || report.rows?.length !== 20
    || report.counts?.rows !== 20
    || report.counts?.pass !== 100
    || report.counts?.fail !== 0
    || report.counts?.na !== 20
    || report.counts?.blk !== 20
    || report.rows.reduce((sum, row) => sum + row.screenshotCount, 0) !== 80) {
  throw new Error('Memory Match report identity or totals changed');
}

const dimensions = ['input', 'progression', 'score', 'rewards', 'restart', 'long_repeated_play', 'visual_quality'];
const desktopOffscreenTiers = new Set([1, 2, 5, 6, 7, 8, 9]);
let changed = 0;
for (const result of report.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row || row.route !== '/games/memory-match.html') {
    throw new Error(`invalid Memory Match ledger row ${result.id}`);
  }
  if (result.fatal || result.completedRounds !== 3 || result.wrongRecoveries !== 3 || result.freshBoards !== 3
      || !result.postRewardPlayable || result.midPlayNotices !== 0 || result.pageErrors.length || result.failedLocalRequests.length
      || result.screenshotCount !== 4 || result.reward?.inViewport !== true || result.reward?.dismissMs >= 1000) {
    throw new Error(`incomplete Memory Match evidence ${result.id}`);
  }

  const visualFail = (result.viewport === 'phone' && result.tier >= 3)
    || (result.viewport === 'desktop' && desktopOffscreenTiers.has(result.tier));
  const desiredVerdict = visualFail ? 'FAIL' : 'PASS';
  if (!['BLK', desiredVerdict].includes(row.verdict)) throw new Error(`unexpected verdict ${row.verdict} in ${result.id}`);
  if ((result.titleOverlap === true) !== (result.viewport === 'phone' && result.tier >= 3)) {
    throw new Error(`unexpected title-overlap result ${result.id}`);
  }
  const offscreenCards = result.geometrySamples.map(sample => sample.verticalOffscreen);
  if (visualFail && result.viewport === 'desktop' && !offscreenCards.every(count => count > 0)) {
    throw new Error(`expected offscreen desktop cards in ${result.id}`);
  }
  if (!visualFail && offscreenCards.some(count => count > 0)) {
    throw new Error(`unexpected offscreen cards in ${result.id}`);
  }

  const desired = {
    input: 'PASS',
    progression: 'PASS',
    score: 'NA',
    rewards: 'PASS',
    restart: 'PASS',
    long_repeated_play: 'PASS',
    visual_quality: visualFail ? 'FAIL' : 'PASS',
  };
  for (const dimension of dimensions) {
    if (row.checks[dimension] === 'BLK') {
      row.checks[dimension] = desired[dimension];
      changed++;
    } else if (row.checks[dimension] !== desired[dimension]) {
      throw new Error(`cannot import ${result.id}:${dimension} from ${row.checks[dimension]}`);
    }
  }
  row.execution = 'COMPLETE';
  row.verdict = desiredVerdict;
  row.reason = visualFail
    ? 'Memory Match behavior is complete, but visual review found either an earned-ribbon notice covering the phone title or desktop cards initially below the viewport.'
    : 'All applicable Memory Match behavior, recovery, repeated full-board play, reward persistence and visual states are complete.';
  if (!row.evidence.includes(evidence)) row.evidence.push(evidence);
}

if (![0, 104].includes(changed)) throw new Error(`unexpected changed cell count ${changed}`);
const after = totals(coverage.rows);
if (JSON.stringify(after) !== newTotals) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);

writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changed, reportSha256, ...after }));
