// Guarded import for the reviewed Hide & Seek phone reward-notice repair.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '..', '..', '..');
const coveragePath = path.join(auditDir, 'coverage.json');
const reportPath = path.join(root, 'tests', 'e2e', 'out', 'hide-seek-visual-play', 'report.json');
const evidence = 'baseline-observations.md#hide--seek-phone-notice-repair-at-2aae9f7';
const productCommit = '2aae9f7e2c1ddb33eb195ba60ca7b7c9a22b47ad';
const reportBytes = readFileSync(reportPath);
const reportSha256 = createHash('sha256').update(reportBytes).digest('hex');
const expectedReportSha256 = 'b95cb5d4503331e29a8dfd9691c936c0e86f1c783b41899ea432abff0b1cba17';
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

const oldTotals = JSON.stringify({ dimensions: { PASS: 9253, FAIL: 24, BLK: 3769, NA: 3454 }, verdicts: { PASS: 92, FAIL: 24, BLK: 544 }, execution: { PARTIAL: 560, COMPLETE: 100 } });
const newTotals = JSON.stringify({ dimensions: { PASS: 9261, FAIL: 16, BLK: 3769, NA: 3454 }, verdicts: { PASS: 100, FAIL: 16, BLK: 544 }, execution: { PARTIAL: 560, COMPLETE: 100 } });
const before = totals(coverage.rows);
if (![oldTotals, newTotals].includes(JSON.stringify(before))) throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);

if (report.rows?.length !== 20 || report.counts?.rows !== 20 || report.counts?.pass !== 60
    || report.counts?.fail !== 0 || report.counts?.na !== 20 || report.counts?.blk !== 20
    || report.rows.reduce((sum, row) => sum + row.screenshotCount, 0) !== 80) {
  throw new Error('Hide & Seek repair report identity or totals changed');
}

let changed = 0;
for (const result of report.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row || row.route !== '/games/peek-a-boo.html') throw new Error(`invalid Hide & Seek ledger row ${result.id}`);
  if (result.fatal || result.completedRounds !== 3 || result.wrongRecoveries !== 3 || result.freshRounds !== 3
      || !result.postRewardPlayable || result.midPlayNotices !== 0 || result.pageErrors.length || result.failedLocalRequests.length
      || result.screenshotCount !== 4 || result.reward?.inViewport !== true || result.reward?.overlaps?.length
      || result.reward?.hint !== 'Saved in your gallery'
      || result.geometrySamples.some(sample => sample.minTarget < 44 || sample.horizontalOverflow > 1
        || sample.clippedSpots || sample.viewportClips || sample.chromeOverlap || !sample.titleVisible || !sample.hintVisible)) {
    throw new Error(`incomplete Hide & Seek repair evidence ${result.id}`);
  }
}

for (let tier = 3; tier <= 10; tier++) {
  const row = coverage.rows.find(candidate => candidate.id === `peek-a-boo:T${tier}:phone`);
  if (!row) throw new Error(`missing Hide & Seek phone row T${tier}`);
  if (row.checks.visual_quality === 'PASS') continue;
  if (row.checks.visual_quality !== 'FAIL' || row.verdict !== 'FAIL' || row.execution !== 'COMPLETE') {
    throw new Error(`cannot repair unexpected Hide & Seek row state ${row.id}`);
  }
  row.checks.visual_quality = 'PASS';
  row.verdict = 'PASS';
  row.reason = `Reviewed ${productCommit}: all Hide & Seek behavior and visual states pass; the phone reward temporarily replaces and then restores Again while staying clear of heading, navigation and play.`;
  if (!row.evidence.includes(evidence)) row.evidence.push(evidence);
  changed++;
}

if (![0, 8].includes(changed)) throw new Error(`unexpected repaired cell count ${changed}`);
const after = totals(coverage.rows);
if (JSON.stringify(after) !== newTotals) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);

writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changed, productCommit, reportSha256, ...after }));
