// Record the accepted Days notice repair and only the unresolved Math dimensions
// proven by the bounded browser play and inspected-render run. Safe to repeat.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const coveragePath = path.join(auditDir, 'coverage.json');
const daysReportPath = path.join(root, 'tests/e2e/out/days-visual-play/report.json');
const mathReportPath = path.join(root, 'tests/e2e/out/math-visual-play/report.json');
const daysEvidence = 'baseline-observations.md#days-notice-repair-a23a0ea';
const mathEvidence = 'baseline-observations.md#math-visual-play-a23a0ea';

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

const oldTotals = JSON.stringify({ dimensions: { PASS: 9969, FAIL: 44, BLK: 2913, NA: 3574 }, verdicts: { PASS: 232, FAIL: 44, BLK: 384 }, execution: { PARTIAL: 400, COMPLETE: 260 } });
const newTotals = JSON.stringify({ dimensions: { PASS: 10061, FAIL: 44, BLK: 2821, NA: 3574 }, verdicts: { PASS: 252, FAIL: 44, BLK: 364 }, execution: { PARTIAL: 380, COMPLETE: 280 } });
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
const before = totals(coverage.rows);
if (![oldTotals, newTotals].includes(JSON.stringify(before))) throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);

const daysRepairIds = ['days:T3:phone','days:T4:phone','days:T5:phone','days:T6:phone','days:T7:phone','days:T8:phone','days:T9:phone','days:T10:phone'];
const { report: daysReport, sha256: daysReportSha256 } = readPinnedReport(daysReportPath, '9594de636815092459b89824c0cdeb0c2e840ebf275bd462598e6f1aa8013f10');
if (daysReport.auditStart !== '888bed870999f655f8bd87baf497daffca2af5b4'
    || daysReport.daysSha256 !== '2c4401e01fa11d712fa0feaaab4201c2a7c4ea2a80b2962b25a4eb8cdbb9b47e'
    || JSON.stringify(daysReport.counts) !== JSON.stringify({ rows: 20, pass: 100, fail: 0, blk: 20 })
    || daysReport.rows?.length !== 20 || daysReport.probes?.length !== 8 || daysReport.screenshots !== 180
    || daysReport.recordedCorrectAnswers !== 160 || daysReport.rewardTitleOverlaps?.length !== 0
    || daysReport.rows.some(row => row.fatal || Object.values(row.checks).includes('FAIL') || row.pageErrors.length || row.failedLocalRequests.length)
    || daysReport.probes.some(probe => !probe.pass || !probe.bottomReachable?.pass)) throw new Error('repaired Days report identity or totals changed');

let changed = 0;
for (const id of daysRepairIds) {
  const row = coverage.rows.find(candidate => candidate.id === id);
  const result = daysReport.rows.find(candidate => candidate.id === id);
  if (!row || !result || !result.reward?.inViewport || result.reward?.overlaps?.length) throw new Error(`missing repaired Days proof ${id}`);
  if (row.checks.visual_quality === 'FAIL') { row.checks.visual_quality = 'PASS'; changed++; }
  else if (row.checks.visual_quality !== 'PASS') throw new Error(`unexpected Days visual state ${id}=${row.checks.visual_quality}`);
  row.execution = 'COMPLETE';
  row.verdict = 'PASS';
  row.reason = 'All applicable Days behavior, repeated play, reward persistence, recovery and inspected visual states are complete after the phone notice repair.';
  if (!row.evidence.includes(daysEvidence)) row.evidence.push(daysEvidence);
}

const mathOverlapIds = ['math:T3:phone','math:T4:phone','math:T5:phone','math:T6:phone','math:T7:phone','math:T8:phone','math:T9:phone','math:T10:phone'];
const failedProbeIds = ['math-probe:T6:short-phone','math-probe:T8:short-phone','math-probe:T10:short-phone'];
const { report: mathReport, sha256: mathReportSha256 } = readPinnedReport(mathReportPath, '5a190c03a48c92b1c66705a388620c2d17f5bf24e315c325a5d3ba3ed38a23db');
if (mathReport.auditStart !== 'a23a0ea4ef49c2ddb79e62fbfb382fd98b1efde7'
    || mathReport.mathSha256 !== '2401654f8a321619172e06e4029c56ff406a723fd03a89d6d5540c58da7e1a2d'
    || JSON.stringify(mathReport.counts) !== JSON.stringify({ rows: 20, pass: 100, fail: 0, blk: 20 })
    || mathReport.rows?.length !== 20 || mathReport.probes?.length !== 8 || mathReport.screenshots !== 212
    || mathReport.recordedCorrectAnswers !== 160
    || JSON.stringify(mathReport.rewardOverlaps.map(item => item.id).sort()) !== JSON.stringify(mathOverlapIds.slice().sort())) throw new Error('Math report identity or totals changed');

const actualFailedProbes = mathReport.probes.filter(probe => !probe.pass).map(probe => probe.id).sort();
if (JSON.stringify(actualFailedProbes) !== JSON.stringify(failedProbeIds.slice().sort())) throw new Error(`unexpected Math probe failures ${JSON.stringify(actualFailedProbes)}`);
for (const probe of mathReport.probes) {
  if (probe.fatal || probe.rounds.length !== 3 || probe.rounds.some(round => !round.exactIncrement || !round.wrongRecovered || !round.wrongDidNotProgress)) throw new Error(`incomplete Math probe ${probe.id}`);
  if (failedProbeIds.includes(probe.id)) {
    const pairs = new Set(probe.geometrySamples.flatMap(sample => sample.navContentOverlaps || []).map(item => `${item.nav}->${item.content}`));
    if (JSON.stringify(probe.reward?.overlaps) !== JSON.stringify(['title']) || !pairs.has('gameSettingsGear->choices')) throw new Error(`unexpected Math short-phone finding ${probe.id}`);
  } else if (!probe.pass) throw new Error(`unexpected failed Math probe ${probe.id}`);
}

const dimensions = ['input','progression','rewards','restart','long_repeated_play','visual_quality'];
for (const result of mathReport.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row || row.route !== '/learning/math.html' || result.fatal || !result.settingsPass
      || result.counterBefore !== 119 || result.counterAfter !== 127 || result.repeatAfter !== 1
      || !result.reward?.inViewport || !result.navigationRecovered || !result.reloadRecovered
      || result.rounds.length !== 8 || result.rounds.some(round => !round.exactIncrement || !round.wrongRecovered || !round.wrongDidNotProgress)
      || result.pageErrors.length || result.failedLocalRequests.length || result.geometrySamples.length < 7) throw new Error(`incomplete Math evidence ${result.id}`);
  const modes = new Set(result.rounds.map(round => `${round.op}:${round.missing}`));
  for (const mode of ['+:false','−:false','×:false','÷:false','+:true','−:true']) if (!modes.has(mode)) throw new Error(`missing Math mode ${result.id}:${mode}`);
  for (const dimension of dimensions) {
    const desired = dimension === 'visual_quality' && mathOverlapIds.includes(result.id) ? 'FAIL' : 'PASS';
    if (row.checks[dimension] === 'BLK') { row.checks[dimension] = desired; changed++; }
    else if (row.checks[dimension] !== desired) throw new Error(`cannot complete ${result.id}:${dimension} from ${row.checks[dimension]} to ${desired}`);
  }
  row.execution = 'COMPLETE';
  row.verdict = mathOverlapIds.includes(result.id) ? 'FAIL' : 'PASS';
  row.reason = mathOverlapIds.includes(result.id)
    ? 'Math behavior, all feature modes, repeated play, reward persistence and recovery are complete; the reward notice obscures the activity title on phone for T3-T10.'
    : 'All applicable Math behavior, all feature modes, repeated play, reward persistence, recovery and inspected visual states are complete.';
  if (!row.evidence.includes(mathEvidence)) row.evidence.push(mathEvidence);
}

if (![0, 100].includes(changed)) throw new Error(`unexpected changed cell count ${changed}`);
const after = totals(coverage.rows);
if (JSON.stringify(after) !== newTotals) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);
writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changed, daysReportSha256, mathReportSha256, ...after }));
