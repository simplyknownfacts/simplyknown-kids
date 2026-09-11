// Record the accepted Clock repair and the report-only Spelling audit.
// Reports and ledger totals are pinned so this import is safe to repeat.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const coveragePath = path.join(auditDir, 'coverage.json');
const evidence = {
  clock: 'baseline-observations.md#clock-layout-repair-a1e215e',
  spelling: 'baseline-observations.md#spelling-remaining-dimensions-a1e215e',
};
const dimensions = ['input','progression','rewards','restart','long_repeated_play','visual_quality'];

function pinned(relativePath, expected) {
  const bytes = readFileSync(path.join(root, relativePath));
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== expected) throw new Error(`unexpected report SHA-256 ${hash}: ${relativePath}`);
  return JSON.parse(bytes);
}
function totals(rows) {
  const result = { dimensions: { PASS: 0, FAIL: 0, BLK: 0, NA: 0 }, verdicts: { PASS: 0, FAIL: 0, BLK: 0 }, execution: {} };
  for (const row of rows) {
    result.verdicts[row.verdict]++;
    result.execution[row.execution] = (result.execution[row.execution] || 0) + 1;
    for (const value of Object.values(row.checks)) result.dimensions[value]++;
  }
  return result;
}

const beforeTotals = { dimensions: { PASS: 10161, FAIL: 44, BLK: 2721, NA: 3574 }, verdicts: { PASS: 272, FAIL: 44, BLK: 344 }, execution: { PARTIAL: 360, COMPLETE: 300 } };
const afterTotals = { dimensions: { PASS: 10248, FAIL: 44, BLK: 2634, NA: 3574 }, verdicts: { PASS: 292, FAIL: 44, BLK: 324 }, execution: { PARTIAL: 340, COMPLETE: 320 } };
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
const before = totals(coverage.rows);
if (![JSON.stringify(beforeTotals), JSON.stringify(afterTotals)].includes(JSON.stringify(before))) throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);

const clock = pinned('tests/e2e/out/clock-visual-play/report.json', 'b9b6fb551212ef52973d2ee876b19bf9c982ace74c10536666609beff881d777');
if (clock.auditStart !== 'a1e215ebedc22b1d16562f51f490e413414f06da'
    || clock.clockSha256 !== 'a6d03cee0aaf8a9648314db05b2acedd612c180627f711c257a9d7bb2ad45687'
    || JSON.stringify(clock.counts) !== JSON.stringify({ rows: 20, pass: 100, fail: 0, blk: 20 })
    || clock.rows.length !== 20 || clock.probes.length !== 8 || clock.screenshots !== 192
    || clock.recordedCorrectAnswers !== 240 || clock.rewardOverlaps.length || clock.responsiveOverlaps.length
    || clock.rows.some(row => row.fatal || row.settingsPass !== true || row.rounds.length !== 12
      || row.counterAfter - row.counterBefore !== 12 || row.repeatAfter !== 1 || !row.reward?.inViewport
      || !row.navigationRecovered || !row.reloadRecovered || row.pageErrors.length || row.failedLocalRequests.length
      || Object.values(row.checks).some(value => !['PASS','BLK'].includes(value)))
    || clock.probes.some(probe => !probe.behaviorPass || probe.fatal)) throw new Error('Clock report identity or acceptance proof changed');

const spelling = pinned('tests/e2e/out/spelling-visual-play/report.json', '9d6f3501e8e940c5bffa94ca8ec1c1311a0169cb28e13063faea761aa414a1c0');
const spellingFailures = Array.from({ length: 8 }, (_, index) => `spelling:T${index + 3}:phone`).sort();
const responsive = spelling.responsiveOverlaps.map(item => `${item.id}|${item.sample}|${item.nav}|${item.content}`).sort();
const expectedResponsive = [
  'spelling-probe:T10:short-phone|1|gameSettingsGear|choice-4',
  'spelling-probe:T10:short-phone|2|gameSettingsGear|choice-4',
  'spelling-probe:T10:short-phone|3|gameSettingsGear|choice-4',
  'spelling-probe:T8:short-phone|1|gameSettingsGear|choice-8',
  'spelling-probe:T8:short-phone|2|gameSettingsGear|choice-4',
  'spelling-probe:T8:short-phone|3|gameSettingsGear|choice-8',
].sort();
if (spelling.auditStart !== clock.auditStart
    || spelling.spellingSha256 !== '904277a7888d85182d79d56b3f28a593ab4bca11e1849690db2b13f47ae7741d'
    || spelling.priorResponsiveRegression !== '33a26ea4851dc70d74d6bb8b51f2a577e5251de6'
    || JSON.stringify(spelling.counts) !== JSON.stringify({ rows: 20, pass: 112, fail: 8 })
    || spelling.rows.length !== 20 || spelling.probes.length !== 8 || spelling.screenshots !== 172
    || spelling.recordedCorrectAnswers !== 128
    || JSON.stringify(spelling.rewardOverlaps.map(item => item.id).sort()) !== JSON.stringify(spellingFailures)
    || spelling.rewardOverlaps.some(item => JSON.stringify(item.overlaps) !== JSON.stringify(['title']))
    || JSON.stringify(responsive) !== JSON.stringify(expectedResponsive)
    || spelling.rows.some(row => row.fatal || !row.settingsPass || row.counterAfter - row.counterBefore !== row.rounds.length
      || row.repeatAfter !== 1 || !row.reward?.inViewport || !row.navigationRecovered || !row.reloadRecovered
      || row.pageErrors.length || row.failedLocalRequests.length
      || dimensions.some(dimension => row.checks[dimension] !== (dimension === 'visual_quality' && spellingFailures.includes(row.id) ? 'FAIL' : 'PASS')))
    || spelling.probes.filter(probe => probe.behaviorPass).length !== 6
    || spelling.probes.some(probe => probe.fatal)) throw new Error('Spelling report identity or findings changed');

let changed = 0;
for (const result of clock.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row || row.route !== '/learning/clock.html') throw new Error(`missing Clock row ${result.id}`);
  if (row.checks.visual_quality === 'FAIL') { row.checks.visual_quality = 'PASS'; changed++; }
  else if (row.checks.visual_quality !== 'PASS') throw new Error(`unexpected Clock visual state ${result.id}`);
  row.verdict = 'PASS';
  row.execution = 'COMPLETE';
  row.reason = 'All applicable Clock behavior, every tier minute mode, repeated play, persistence, recovery and inspected visual states pass after the phone layout repair.';
  if (!row.evidence.includes(evidence.clock)) row.evidence.push(evidence.clock);
}

for (const result of spelling.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row || row.route !== '/learning/spelling.html') throw new Error(`missing Spelling row ${result.id}`);
  for (const dimension of dimensions) {
    const desired = result.checks[dimension];
    const current = row.checks[dimension];
    const allowed = current === desired || (current === 'BLK' && ['PASS','FAIL'].includes(desired))
      || (dimension === 'visual_quality' && current === 'PASS' && desired === 'FAIL');
    if (!allowed) throw new Error(`refusing Spelling transition ${result.id}:${dimension} ${current}->${desired}`);
    if (current !== desired) { row.checks[dimension] = desired; changed++; }
  }
  const failed = spellingFailures.includes(result.id);
  row.verdict = failed ? 'FAIL' : 'PASS';
  row.execution = 'COMPLETE';
  row.reason = failed
    ? 'Spelling behavior, progression, rewards, recovery and repeated play pass; the reward notice obscures the title on phone for T3-T10.'
    : 'All applicable Spelling behavior, progression, rewards, recovery, repeated play and inspected visual states pass.';
  if (!row.evidence.includes(evidence.spelling)) row.evidence.push(evidence.spelling);
}

if (![0, 100].includes(changed)) throw new Error(`unexpected changed cell count ${changed}`);
const after = totals(coverage.rows);
if (JSON.stringify(after) !== JSON.stringify(afterTotals)) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);
writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changed, ...after }));
