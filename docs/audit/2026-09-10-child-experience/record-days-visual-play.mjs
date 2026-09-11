// Record only unresolved Days dimensions proven by the bounded browser play and
// inspected-render run. Safe to repeat: the second run changes zero cells.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const coveragePath = path.join(auditDir, 'coverage.json');
const reportPath = path.join(root, 'tests/e2e/out/days-visual-play/report.json');
const evidence = 'baseline-observations.md#days-visual-play-888bed8';
const reportBytes = readFileSync(reportPath);
const reportSha256 = createHash('sha256').update(reportBytes).digest('hex');
if (reportSha256 !== '3522c325f1550a4df558a646947b8aaf585304d515011565c87e147707dfe379') throw new Error(`unexpected Days report SHA-256 ${reportSha256}`);
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

const oldTotals = JSON.stringify({ dimensions: { PASS: 9885, FAIL: 36, BLK: 3005, NA: 3574 }, verdicts: { PASS: 220, FAIL: 36, BLK: 404 }, execution: { PARTIAL: 420, COMPLETE: 240 } });
const newTotals = JSON.stringify({ dimensions: { PASS: 9969, FAIL: 44, BLK: 2913, NA: 3574 }, verdicts: { PASS: 232, FAIL: 44, BLK: 384 }, execution: { PARTIAL: 400, COMPLETE: 260 } });
const before = totals(coverage.rows);
if (![oldTotals, newTotals].includes(JSON.stringify(before))) throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);

const overlapIds = ['days:T3:phone','days:T4:phone','days:T5:phone','days:T6:phone','days:T7:phone','days:T8:phone','days:T9:phone','days:T10:phone'];
if (report.auditStart !== '888bed870999f655f8bd87baf497daffca2af5b4'
    || report.daysSha256 !== 'b32b81e0fd2028009015a885362d53407c838e7cc1359137c1a057437f9e603b'
    || JSON.stringify(report.counts) !== JSON.stringify({ rows: 20, pass: 100, fail: 0, blk: 20 })
    || report.rows?.length !== 20 || report.probes?.length !== 8 || report.screenshots !== 180
    || report.recordedCorrectAnswers !== 160
    || JSON.stringify(report.rewardTitleOverlaps.map(item => item.id).sort()) !== JSON.stringify(overlapIds.slice().sort())
    || report.probes.some(probe => !probe.pass || !probe.bottomReachable?.pass)) throw new Error('Days report identity or totals changed');

let changed = 0;
for (const result of report.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row || row.route !== '/learning/days.html' || result.fatal
      || result.counterAfter !== result.expectedCounter || result.counterAfter !== result.counterBefore + 8
      || result.repeatAfter !== 1 || !result.reward?.inViewport
      || !result.explorationPass || !result.settingsPass || !result.reloadRecovered || !result.navigationRecovered
      || result.rounds.length !== 8 || result.rounds.some(round => !round.wrongRecovered || !round.exactIncrement)
      || result.pageErrors.length || result.failedLocalRequests.length || result.geometrySamples.length < 5) throw new Error(`incomplete Days evidence ${result.id}`);
  const expectedModes = result.tier >= 6 ? ['month','day-after','day-before'] : ['day-after','day-before'];
  const modes = new Set(result.rounds.map(round => round.type));
  if (expectedModes.some(value => !modes.has(value)) || result.rounds.slice(0, 7).some(round => !round.plannedNext)) throw new Error(`incomplete Days modes ${result.id}`);
  for (const dimension of ['input','progression','rewards','restart','long_repeated_play','visual_quality']) {
    const desired = dimension === 'visual_quality' && overlapIds.includes(result.id) ? 'FAIL' : 'PASS';
    if (row.checks[dimension] === 'BLK') { row.checks[dimension] = desired; changed++; }
    else if (row.checks[dimension] !== desired) throw new Error(`cannot complete ${result.id}:${dimension} from ${row.checks[dimension]} to ${desired}`);
  }
  row.execution = 'COMPLETE';
  row.verdict = overlapIds.includes(result.id) ? 'FAIL' : 'PASS';
  row.reason = overlapIds.includes(result.id)
    ? 'Days behavior, repeated play, reward persistence and recovery are complete; the reward notice obscures the activity title on phone for T3-T10.'
    : 'All applicable Days behavior, repeated play, reward persistence, recovery and inspected visual states are complete.';
  if (!row.evidence.includes(evidence)) row.evidence.push(evidence);
}

if (![0, 92].includes(changed)) throw new Error(`unexpected completed cell count ${changed}`);
const after = totals(coverage.rows);
if (JSON.stringify(after) !== newTotals) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);
writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changed, reportSha256, ...after }));
