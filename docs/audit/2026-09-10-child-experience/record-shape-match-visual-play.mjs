// Guarded import for Shape Match's remaining locally testable checks.
// Visual review found a phone-only reward-toast/title overlap at T3-T10.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const reportPath = path.join(root, 'tests/e2e/out/shape-match-visual-play/report.json');
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const coveragePath = path.join(auditDir, 'coverage.json');
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
const outputDir = path.dirname(reportPath);
const shots = path.join(outputDir, 'screenshots');
const sheets = path.join(outputDir, 'contact-sheets');
const evidence = 'baseline-observations.md#shape-match-visual-play-3a16';

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

function requireFile(file) {
  if (statSync(file).size < 1000) throw new Error(`missing or empty evidence ${file}`);
}

const expectedReportCounts = { rows: 20, pass: 56, fail: 0, na: 44, blk: 20 };
if (report.appBaseline !== '3683e2028044ba1812a1c44202725ffbb1858d5b') throw new Error(`wrong app baseline ${report.appBaseline}`);
if (report.auditStart !== '77b84c1284c53617c93d0d6444480b3cd24c707f') throw new Error(`wrong audit start ${report.auditStart}`);
if (report.roundsPerRow !== 9) throw new Error(`wrong round count ${report.roundsPerRow}`);
if (JSON.stringify(report.counts) !== JSON.stringify(expectedReportCounts)) throw new Error(`unexpected report totals ${JSON.stringify(report.counts)}`);
if (report.rows.length !== 20 || new Set(report.rows.map(row => row.id)).size !== 20) throw new Error('incomplete or duplicate report rows');

const expectedIds = new Set();
for (let tier = 1; tier <= 10; tier++) for (const viewport of ['desktop', 'phone']) expectedIds.add(`shape-match:T${tier}:${viewport}`);
for (const result of report.rows) {
  if (!expectedIds.delete(result.id)) throw new Error(`unexpected report row ${result.id}`);
  if (result.activityId !== 'shape-match' || result.route !== '/games/shape-match.html') throw new Error(`wrong activity in ${result.id}`);
  if (result.fatal || result.completedRounds !== 9 || result.midPlayNotices !== 0) throw new Error(`incomplete repeated play in ${result.id}`);
  if (result.shapeTimers !== 0 || Object.values(result.listenerCounts).some(count => count !== 0)) throw new Error(`timer/listener growth in ${result.id}`);
  if (result.pageErrors.length || result.failedLocalRequests.length) throw new Error(`browser/runtime failure in ${result.id}`);
  if (!result.reward?.inViewport || result.reward.playOverlap !== 0 || result.reward.dismissMs > 1000) throw new Error(`bad reward behavior in ${result.id}`);
  const expectedModes = result.tier <= 2 ? ['tap'] : result.tier <= 6 ? ['drag'] : result.tier === 7 ? ['drag', 'sides'] : ['drag', 'odd', 'sides'];
  if (JSON.stringify(result.modesSeen) !== JSON.stringify(expectedModes)) throw new Error(`missing modes in ${result.id}: ${result.modesSeen}`);
  const expectedWrong = result.tier <= 2 ? [] : expectedModes;
  if (JSON.stringify(result.wrongModes) !== JSON.stringify(expectedWrong)) throw new Error(`missing wrong recovery in ${result.id}: ${result.wrongModes}`);
  const checks = result.checks;
  if (checks.score.status !== 'NA' || checks.rewards.status !== 'PASS' || checks.restart.status !== 'NA' || checks.long_repeated_play.status !== 'PASS' || checks.visual_quality.status !== 'BLK') {
    throw new Error(`unexpected checks in ${result.id}`);
  }
  if (checks.wrong_answers.status !== (result.tier <= 2 ? 'NA' : 'PASS')) throw new Error(`wrong recovery status in ${result.id}`);
  for (const sample of result.geometrySamples) {
    if (sample.clipped || sample.horizontalOverflow || sample.targetOverlap || sample.sourceTargetOverlap || sample.chromeOverlap || sample.minimumTarget < 44 || !sample.titleVisible || !sample.hintVisible) {
      throw new Error(`bad geometry sample in ${result.id}`);
    }
  }
  requireFile(path.join(shots, `shape-match-T${result.tier}-${result.viewport}-initial.png`));
  requireFile(path.join(shots, `shape-match-T${result.tier}-${result.viewport}-reward.png`));
  for (const mode of expectedModes) requireFile(path.join(shots, `shape-match-T${result.tier}-${result.viewport}-success-${mode}.png`));
  for (const mode of expectedWrong) requireFile(path.join(shots, `shape-match-T${result.tier}-${result.viewport}-wrong-${mode}.png`));
}
if (expectedIds.size) throw new Error(`missing report rows: ${[...expectedIds].join(', ')}`);
for (const viewport of ['desktop', 'phone']) for (const sheet of ['overview', 'modes']) requireFile(path.join(sheets, `${viewport}-${sheet}.png`));

const oldTotals = JSON.stringify({ dimensions: { PASS: 9027, FAIL: 16, BLK: 4083, NA: 3374 }, verdicts: { PASS: 40, FAIL: 16, BLK: 604 }, execution: { PARTIAL: 620, COMPLETE: 40 } });
const newTotals = JSON.stringify({ dimensions: { PASS: 9090, FAIL: 24, BLK: 3972, NA: 3414 }, verdicts: { PASS: 52, FAIL: 24, BLK: 584 }, execution: { PARTIAL: 600, COMPLETE: 60 } });
const before = totals(coverage.rows);
if (![oldTotals, newTotals].includes(JSON.stringify(before))) throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);

const changes = { 'BLK->PASS': 0, 'BLK->FAIL': 0, 'BLK->NA': 0 };
for (const result of report.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row || row.kind !== 'activity' || row.route !== '/games/shape-match.html') throw new Error(`invalid ledger row ${result.id}`);
  const reviewed = {
    score: result.checks.score,
    rewards: result.checks.rewards,
    restart: result.checks.restart,
    wrong_answers: result.checks.wrong_answers,
    long_repeated_play: result.checks.long_repeated_play,
    visual_quality: result.viewport === 'phone' && result.tier >= 3
      ? { status: 'FAIL', note: 'Earned-ribbon notice covers the activity title on phone.' }
      : { status: 'PASS', note: 'Reviewed opening, wrong, completed and reward frames are coherent and unobscured.' },
  };
  for (const [dimension, finding] of Object.entries(reviewed)) {
    const prior = row.checks[dimension];
    if (prior === finding.status) continue;
    if (prior !== 'BLK' || !['PASS', 'FAIL', 'NA'].includes(finding.status)) throw new Error(`cannot apply ${finding.status} over ${prior} in ${result.id}:${dimension}`);
    row.checks[dimension] = finding.status;
    changes[`BLK->${finding.status}`]++;
  }
  row.execution = 'COMPLETE';
  if (result.viewport === 'phone' && result.tier >= 3) {
    row.verdict = 'FAIL';
    row.reason = 'P2 child-experience visual defect: the earned-ribbon notice covers the Shape Match title on phone; all behavior and other visual states completed.';
  } else {
    row.verdict = 'PASS';
    row.reason = 'All applicable Shape Match behavior, negative recovery, repeated play, reward persistence and reviewed visual states complete.';
  }
  if (!row.evidence.includes(evidence)) row.evidence.push(evidence);
}

const expectedChanges = JSON.stringify({ 'BLK->PASS': 63, 'BLK->FAIL': 8, 'BLK->NA': 40 });
const noChanges = JSON.stringify({ 'BLK->PASS': 0, 'BLK->FAIL': 0, 'BLK->NA': 0 });
if (![expectedChanges, noChanges].includes(JSON.stringify(changes))) throw new Error(`unexpected ledger transitions ${JSON.stringify(changes)}`);
const after = totals(coverage.rows);
if (JSON.stringify(after) !== newTotals) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);

writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changes, ...after }));
