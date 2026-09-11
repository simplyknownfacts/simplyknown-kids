// Record the accepted Math layout repair and the report-only Clock audit.
// Reports and ledger totals are pinned so this import is safe to repeat.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const coveragePath = path.join(auditDir, 'coverage.json');
const mathReportPath = path.join(root, 'tests/e2e/out/math-visual-play/report.json');
const clockReportPath = path.join(root, 'tests/e2e/out/clock-visual-play/report.json');
const mathEvidence = 'baseline-observations.md#math-layout-repair-48fed5d';
const clockEvidence = 'baseline-observations.md#clock-time-visualplay-audit-48fed5d';

function readPinnedReport(reportPath, expectedSha256) {
  const bytes = readFileSync(reportPath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== expectedSha256) throw new Error(`unexpected report SHA-256 ${sha256}: ${reportPath}`);
  return { report: JSON.parse(bytes), sha256 };
}

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

const oldTotals = JSON.stringify({ dimensions: { PASS: 10061, FAIL: 44, BLK: 2821, NA: 3574 }, verdicts: { PASS: 252, FAIL: 44, BLK: 364 }, execution: { PARTIAL: 380, COMPLETE: 280 } });
const newTotals = JSON.stringify({ dimensions: { PASS: 10161, FAIL: 44, BLK: 2721, NA: 3574 }, verdicts: { PASS: 272, FAIL: 44, BLK: 344 }, execution: { PARTIAL: 360, COMPLETE: 300 } });
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
const before = totals(coverage.rows);
if (![oldTotals, newTotals].includes(JSON.stringify(before))) throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);

const mathRepairIds = ['math:T3:phone','math:T4:phone','math:T5:phone','math:T6:phone','math:T7:phone','math:T8:phone','math:T9:phone','math:T10:phone'];
const { report: mathReport, sha256: mathReportSha256 } = readPinnedReport(mathReportPath, 'f593ab85ccb142de7432a308e9fe0ac544b36ec0b4ee1cda3f9ffa356d423eff');
if (mathReport.auditStart !== 'ddb34d883107b3762347eb9ae6c4b988560e4757'
    || mathReport.mathSha256 !== '115855c91aa99115cb88de4e5587d44fadcf0796f9a6e6eb91e784d06834e912'
    || JSON.stringify(mathReport.counts) !== JSON.stringify({ rows: 20, pass: 100, fail: 0, blk: 20 })
    || mathReport.rows?.length !== 20 || mathReport.probes?.length !== 8 || mathReport.screenshots !== 212
    || mathReport.recordedCorrectAnswers !== 160 || mathReport.rewardOverlaps?.length !== 0
    || mathReport.rows.some(row => row.fatal || Object.values(row.checks).includes('FAIL') || row.pageErrors.length || row.failedLocalRequests.length)
    || mathReport.probes.some(probe => !probe.pass || probe.fatal)) throw new Error('repaired Math report identity or totals changed');

let changed = 0;
for (const id of mathRepairIds) {
  const row = coverage.rows.find(candidate => candidate.id === id);
  const result = mathReport.rows.find(candidate => candidate.id === id);
  if (!row || !result || !result.reward?.inViewport || result.reward.overlaps?.length) throw new Error(`missing repaired Math proof ${id}`);
  if (row.checks.visual_quality === 'FAIL') { row.checks.visual_quality = 'PASS'; changed++; }
  else if (row.checks.visual_quality !== 'PASS') throw new Error(`unexpected Math visual state ${id}=${row.checks.visual_quality}`);
  row.execution = 'COMPLETE';
  row.verdict = 'PASS';
  row.reason = 'All applicable Math behavior, feature modes, repeated play, reward persistence, recovery and inspected visual states are complete after the phone layout repair.';
  if (!row.evidence.includes(mathEvidence)) row.evidence.push(mathEvidence);
}

const clockOverlapIds = ['clock:T3:phone','clock:T4:phone','clock:T5:phone','clock:T6:phone','clock:T7:phone','clock:T8:phone','clock:T9:phone','clock:T10:phone'];
const expectedResponsive = [
  'clock-probe:T10:short-phone|1|gameSettingsGear|answer-2',
  'clock-probe:T10:short-phone|2|gameSettingsGear|answer-2',
  'clock-probe:T4:short-phone|1|gameSettingsGear|answer-2',
  'clock-probe:T6:short-phone|3|gameSettingsGear|answer-2',
].sort();
const { report: clockReport, sha256: clockReportSha256 } = readPinnedReport(clockReportPath, 'd4329e7ed2a24dd66a9f3d1f2cf58fb1b72f06383f02c571afe886f9c18cd5cc');
const actualResponsive = clockReport.responsiveOverlaps.map(item => `${item.id}|${item.sample}|${item.nav}|${item.content}`).sort();
if (clockReport.auditStart !== '48fed5da63794cc0bb44cdc7a960f021489d9591'
    || clockReport.clockSha256 !== '5c9dcee9fc9fcc5aab986d785d018d791cf3a3160b99604feaf34d273a1a2616'
    || JSON.stringify(clockReport.counts) !== JSON.stringify({ rows: 20, pass: 100, fail: 0, blk: 20 })
    || clockReport.rows?.length !== 20 || clockReport.probes?.length !== 8 || clockReport.screenshots !== 192
    || clockReport.recordedCorrectAnswers !== 240
    || JSON.stringify(clockReport.rewardOverlaps.map(item => item.id).sort()) !== JSON.stringify(clockOverlapIds.slice().sort())
    || clockReport.rewardOverlaps.some(item => JSON.stringify(item.overlaps) !== JSON.stringify(['title']))
    || JSON.stringify(actualResponsive) !== JSON.stringify(expectedResponsive)) throw new Error('Clock report identity, totals or findings changed');

for (const probe of clockReport.probes) {
  if (!probe.behaviorPass || probe.fatal || probe.rounds.length !== 3
      || probe.rounds.some(round => !round.exactIncrement || !round.wrongRecovered || !round.wrongDidNotProgress)
      || probe.geometrySamples.some(sample => sample.minTarget < 44 || sample.minNavTarget < 44 || !sample.targetsReachable || sample.horizontalOverflow || sample.navClipped)) {
    throw new Error(`incomplete Clock probe ${probe.id}`);
  }
}

const dimensions = ['input','progression','rewards','restart','long_repeated_play','visual_quality'];
for (const result of clockReport.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  const allowedMinutes = result.tier <= 7 ? [0] : result.tier === 8 ? [0,30] : result.tier === 9 ? [0,15,30,45] : [0,5,10,15,20,25,30,35,40,45,50,55];
  if (!row || row.route !== '/learning/clock.html' || result.fatal || !result.settingsPass
      || result.counterBefore !== 119 || result.counterAfter !== 131 || result.repeatAfter !== 1
      || !result.reward?.inViewport || !result.navigationRecovered || !result.reloadRecovered
      || result.rounds.length !== 12
      || JSON.stringify(result.expectedMinutes) !== JSON.stringify(allowedMinutes)
      || JSON.stringify(result.observedMinutes) !== JSON.stringify(allowedMinutes)
      || result.rounds.some(round => !round.exactIncrement || !round.wrongRecovered || !round.wrongDidNotProgress || !round.rightMarked || !round.teaching)
      || result.pageErrors.length || result.failedLocalRequests.length || result.geometrySamples.length < 6
      || result.geometrySamples.some(sample => sample.minTarget < 44 || sample.minNavTarget < 44 || !sample.targetsReachable || sample.horizontalOverflow || sample.navClipped)) {
    throw new Error(`incomplete Clock evidence ${result.id}`);
  }
  for (const dimension of dimensions) {
    const desired = dimension === 'visual_quality' && clockOverlapIds.includes(result.id) ? 'FAIL' : 'PASS';
    if (row.checks[dimension] === 'BLK') { row.checks[dimension] = desired; changed++; }
    else if (row.checks[dimension] !== desired) throw new Error(`cannot complete ${result.id}:${dimension} from ${row.checks[dimension]} to ${desired}`);
  }
  row.execution = 'COMPLETE';
  row.verdict = clockOverlapIds.includes(result.id) ? 'FAIL' : 'PASS';
  row.reason = clockOverlapIds.includes(result.id)
    ? 'Clock behavior, every tier minute mode, repeated play, reward persistence and recovery are complete; the reward notice obscures the title on phone for T3-T10.'
    : 'All applicable Clock behavior, every tier minute mode, repeated play, reward persistence, recovery and inspected visual states are complete.';
  if (!row.evidence.includes(clockEvidence)) row.evidence.push(clockEvidence);
}

if (![0, 108].includes(changed)) throw new Error(`unexpected changed cell count ${changed}`);
const after = totals(coverage.rows);
if (JSON.stringify(after) !== newTotals) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);
writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changed, mathReportSha256, clockReportSha256, ...after }));
