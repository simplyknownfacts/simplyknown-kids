// Record only unresolved Hello Colors dimensions proven by the full all-tier
// browser play and inspected-render run.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const coveragePath = path.join(auditDir, 'coverage.json');
const reportPath = path.join(root, 'tests/e2e/out/hello-colors-visual-play/report.json');
const evidence = 'baseline-observations.md#hello-colors-visualplay-audit-at-b036b0e';
const reportBytes = readFileSync(reportPath);
const reportSha256 = createHash('sha256').update(reportBytes).digest('hex');
if (reportSha256 !== '9cd5a50199a3e78507aed80cc7bc6e455b2e7f903a3c92a116392d1e7bbbaa6e') throw new Error(`unexpected Hello Colors report SHA-256 ${reportSha256}`);
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

const oldTotals = JSON.stringify({ dimensions: { PASS: 9637, FAIL: 16, BLK: 3273, NA: 3574 }, verdicts: { PASS: 180, FAIL: 16, BLK: 464 }, execution: { PARTIAL: 480, COMPLETE: 180 } });
const newTotals = JSON.stringify({ dimensions: { PASS: 9721, FAIL: 16, BLK: 3189, NA: 3574 }, verdicts: { PASS: 200, FAIL: 16, BLK: 444 }, execution: { PARTIAL: 460, COMPLETE: 200 } });
const before = totals(coverage.rows);
if (![oldTotals, newTotals].includes(JSON.stringify(before))) throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);
if (report.auditStart !== '12314eff5258a1969f3bb1d0d204d8bc243ab3d5'
    || report.helloColorsSha256 !== 'e89c522d5ce7f3339a6e7c9ed27348a9c5deac0f3430f650c7e24259008ccd90'
    || JSON.stringify(report.counts) !== JSON.stringify({ rows: 20, pass: 120, fail: 0 })
    || report.rows?.length !== 20 || report.screenshots !== 122) throw new Error('Hello Colors report identity or totals changed');

let changed = 0;
for (const result of report.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row || row.route !== '/learning/hello-colors.html' || row.execution !== 'PARTIAL') {
    if (row?.execution !== 'COMPLETE') throw new Error(`invalid Hello Colors row ${result.id}`);
  }
  const expectedModes = result.tier >= 8 ? ['identify','odd','mix'] : result.tier >= 6 ? ['identify','odd'] : result.tier >= 4 ? ['identify'] : ['explore'];
  const modes = new Set(result.rounds.map(round => round.mode));
  if (result.fatal || result.rounds.length !== 7 || expectedModes.some(mode => !modes.has(mode))
      || result.counterAfter !== result.counterBefore + 7 || !result.reward?.inViewport
      || result.geometrySamples.length !== 2 || result.geometrySamples.some(sample => sample.minTarget < 44 || sample.minNavTarget < 44 || sample.horizontalOverflow > 1 || sample.navClipped.length)
      || result.pageErrors.length || result.failedLocalRequests.length || ![6,7].includes(result.screenshotCount)
      || (result.tier === 1 && !result.autoAdvanced) || (result.tier >= 4 && result.rounds.some(round => !round.wrongRecovered))) throw new Error(`incomplete Hello Colors evidence ${result.id}`);
  for (const dimension of ['input','progression','rewards','restart','long_repeated_play','visual_quality']) {
    if (row.checks[dimension] === 'BLK') { row.checks[dimension] = 'PASS'; changed++; }
    else if (row.checks[dimension] !== 'PASS') throw new Error(`cannot complete ${result.id}:${dimension} from ${row.checks[dimension]}`);
  }
  row.execution = 'COMPLETE';
  row.verdict = 'PASS';
  row.reason = 'All applicable Hello Colors behavior, repeated play, reward persistence and inspected visual states are complete.';
  if (!row.evidence.includes(evidence)) row.evidence.push(evidence);
}

if (![0, 84].includes(changed)) throw new Error(`unexpected completed cell count ${changed}`);
const after = totals(coverage.rows);
if (JSON.stringify(after) !== newTotals) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);
writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changed, reportSha256, ...after }));
