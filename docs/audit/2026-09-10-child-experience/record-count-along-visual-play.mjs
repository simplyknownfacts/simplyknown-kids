// Record only unresolved Count Along dimensions proven by the full all-tier
// browser play and inspected-render run.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const coveragePath = path.join(auditDir, 'coverage.json');
const reportPath = path.join(root, 'tests/e2e/out/count-along-visual-play/report.json');
const evidence = 'baseline-observations.md#count-along-visualplay-audit-at-789d20f';
const reportBytes = readFileSync(reportPath);
const reportSha256 = createHash('sha256').update(reportBytes).digest('hex');
if (reportSha256 !== '6133cdc3ecfdb3f211c911ccc5c55f78bfd76edb0bcde991016ff1c7b911620f') throw new Error(`unexpected Count Along report SHA-256 ${reportSha256}`);
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

const oldTotals = JSON.stringify({ dimensions: { PASS: 9721, FAIL: 16, BLK: 3189, NA: 3574 }, verdicts: { PASS: 200, FAIL: 16, BLK: 444 }, execution: { PARTIAL: 460, COMPLETE: 200 } });
const newTotals = JSON.stringify({ dimensions: { PASS: 9801, FAIL: 20, BLK: 3105, NA: 3574 }, verdicts: { PASS: 216, FAIL: 20, BLK: 424 }, execution: { PARTIAL: 440, COMPLETE: 220 } });
const before = totals(coverage.rows);
if (![oldTotals, newTotals].includes(JSON.stringify(before))) throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);
if (report.auditStart !== '789d20f844966358138121794b0b67bee13aa91a'
    || report.countAlongSha256 !== 'f2740c8fe71974bd56008fdedeaa0b15cd68d91695bc1ec6f4ff6e2443bc9958'
    || JSON.stringify(report.counts) !== JSON.stringify({ rows: 20, pass: 116, fail: 4 })
    || report.rows?.length !== 20 || report.probes?.length !== 8 || report.screenshots !== 126) throw new Error('Count Along report identity or totals changed');

const expectedFailedRows = new Set(['count-along:T1:phone:visual_quality', 'count-along:T2:phone:visual_quality', 'count-along:T4:desktop:input', 'count-along:T4:phone:input']);
const actualFailedRows = new Set();
let changed = 0;
for (const result of report.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row || row.route !== '/learning/count-along.html' || !['PARTIAL','COMPLETE'].includes(row.execution)) throw new Error(`invalid Count Along row ${result.id}`);
  if (result.fatal || result.rounds.length !== result.targetRounds || result.counterAfter !== result.expectedCounter
      || !result.timerCleared || !result.reloadRecovered || !result.reward?.inViewport
      || result.pageErrors.length || result.failedLocalRequests.length || result.geometrySamples.length < 3) throw new Error(`incomplete Count Along evidence ${result.id}`);
  for (const dimension of ['input','progression','rewards','restart','long_repeated_play','visual_quality']) {
    const desired = result.checks[dimension];
    if (desired === 'FAIL') actualFailedRows.add(`${result.id}:${dimension}`);
    if (row.checks[dimension] === 'BLK') { row.checks[dimension] = desired; changed++; }
    else if (result.tier === 4 && dimension === 'input' && row.checks[dimension] === 'PASS' && desired === 'FAIL') { row.checks[dimension] = 'FAIL'; changed++; }
    else if (row.checks[dimension] !== desired) throw new Error(`cannot complete ${result.id}:${dimension} from ${row.checks[dimension]} to ${desired}`);
  }
  row.execution = 'COMPLETE';
  row.verdict = Object.values(result.checks).includes('FAIL') ? 'FAIL' : 'PASS';
  if (result.tier === 4) row.reason = 'Count Along play is complete; the enabled T4 how-many setting remains unreachable because tap-count runs first.';
  else if (result.viewport === 'phone' && result.tier <= 2) row.reason = 'Count Along play is complete; the tappable narrow digit 1 is below the 44px phone target floor.';
  else row.reason = 'All applicable Count Along behavior, repeated play, reward persistence and inspected visual states are complete.';
  if (!row.evidence.includes(evidence)) row.evidence.push(evidence);
}
if (JSON.stringify([...actualFailedRows].sort()) !== JSON.stringify([...expectedFailedRows].sort())) throw new Error(`unexpected Count Along failures ${JSON.stringify([...actualFailedRows].sort())}`);
if (![0, 86].includes(changed)) throw new Error(`unexpected completed cell count ${changed}`);
const after = totals(coverage.rows);
if (JSON.stringify(after) !== newTotals) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);
writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changed, reportSha256, ...after }));
