// Record only the four repaired Count Along cells and the unresolved ABCs
// dimensions proven by the bounded browser play and inspected-render runs.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const coveragePath = path.join(auditDir, 'coverage.json');
const countReportPath = path.join(root, 'tests/e2e/out/count-along-visual-play/report.json');
const abcsReportPath = path.join(root, 'tests/e2e/out/abcs-visual-play/report.json');
const countEvidence = 'baseline-observations.md#count-along-repair-d2467b9';
const abcsEvidence = 'baseline-observations.md#abcs-visual-play-d2467b9';

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

const oldTotals = JSON.stringify({ dimensions: { PASS: 9801, FAIL: 20, BLK: 3105, NA: 3574 }, verdicts: { PASS: 216, FAIL: 20, BLK: 424 }, execution: { PARTIAL: 440, COMPLETE: 220 } });
const newTotals = JSON.stringify({ dimensions: { PASS: 9885, FAIL: 36, BLK: 3005, NA: 3574 }, verdicts: { PASS: 220, FAIL: 36, BLK: 404 }, execution: { PARTIAL: 420, COMPLETE: 240 } });
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
const before = totals(coverage.rows);
if (![oldTotals, newTotals].includes(JSON.stringify(before))) throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);

const { report: countReport, sha256: countReportSha256 } = readPinnedReport(countReportPath, 'd92e67a772a425c62dc0660d6739945c299839cfe37fa0400709e330d432b925');
if (countReport.auditStart !== '789d20f844966358138121794b0b67bee13aa91a'
    || countReport.countAlongSha256 !== 'fb28df44250ea5cd07e64f7a93a134803a3706cedb38044489a79859feca8360'
    || JSON.stringify(countReport.counts) !== JSON.stringify({ rows: 20, pass: 120, fail: 0 })
    || countReport.rows?.length !== 20 || countReport.probes?.length !== 8 || countReport.screenshots !== 126) throw new Error('repaired Count Along report identity or totals changed');

const countRepairs = new Map([
  ['count-along:T1:phone', 'visual_quality'],
  ['count-along:T2:phone', 'visual_quality'],
  ['count-along:T4:desktop', 'input'],
  ['count-along:T4:phone', 'input'],
]);
let changed = 0;
for (const [id, dimension] of countRepairs) {
  const row = coverage.rows.find(candidate => candidate.id === id);
  const result = countReport.rows.find(candidate => candidate.id === id);
  if (!row || !result || result.checks[dimension] !== 'PASS' || result.fatal) throw new Error(`missing repaired Count Along proof ${id}:${dimension}`);
  if (row.checks[dimension] === 'FAIL') { row.checks[dimension] = 'PASS'; changed++; }
  else if (row.checks[dimension] !== 'PASS') throw new Error(`unexpected Count Along state ${id}:${dimension}=${row.checks[dimension]}`);
  row.execution = 'COMPLETE';
  row.verdict = 'PASS';
  row.reason = 'All applicable Count Along behavior, repeated play, reward persistence and inspected visual states are complete after the T4 mode and phone target repairs.';
  if (!row.evidence.includes(countEvidence)) row.evidence.push(countEvidence);
}

const { report: abcsReport, sha256: abcsReportSha256 } = readPinnedReport(abcsReportPath, 'cb54a3dd15b6148246bb5a0f51a39cdd1572476fdc4eb2a4b57df91647f91c69');
if (abcsReport.auditStart !== 'd2467b97ee7db79863d76211eed8d360e35a01c7'
    || abcsReport.abcsSha256 !== 'e4859c051b66206ad42250b539ba8f667e4947cb3f16a412d8128134249d2ba9'
    || JSON.stringify(abcsReport.counts) !== JSON.stringify({ rows: 20, pass: 100, fail: 20 })
    || abcsReport.rows?.length !== 20 || abcsReport.probes?.length !== 8 || abcsReport.screenshots !== 167
    || abcsReport.fullAlphabetCycles !== 20 || abcsReport.recordedLetterActions !== 640
    || abcsReport.mastery?.sourceCalls !== 0 || abcsReport.mastery?.unlockedAfterEveryFullCycle !== 0) throw new Error('ABCs report identity or totals changed');

const dimensions = ['input', 'progression', 'rewards', 'restart', 'long_repeated_play', 'visual_quality'];
for (const result of abcsReport.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row || row.route !== '/learning/abcs.html' || result.fatal
      || result.counterAfter !== result.expectedCounter || !result.fullCycle || !result.rapidExact
      || !result.previousExact || !result.reloadRecovered || !result.reward?.inViewport
      || result.pageErrors.length || result.failedLocalRequests.length || result.geometrySamples.length < 3) throw new Error(`incomplete ABCs evidence ${result.id}`);
  for (const dimension of dimensions) {
    const desired = result.checks[dimension];
    if (row.checks[dimension] === 'BLK') { row.checks[dimension] = desired; changed++; }
    else if (row.checks[dimension] !== desired) throw new Error(`cannot complete ${result.id}:${dimension} from ${row.checks[dimension]} to ${desired}`);
  }
  row.execution = 'COMPLETE';
  row.verdict = 'FAIL';
  row.reason = 'All applicable ABCs letter play, repeated play, recovery and inspected visual checks are complete; the advertised Word Builder mastery remains impossible after spelling removal.';
  if (!row.evidence.includes(abcsEvidence)) row.evidence.push(abcsEvidence);
}

if (![0, 104].includes(changed)) throw new Error(`unexpected completed cell count ${changed}`);
const after = totals(coverage.rows);
if (JSON.stringify(after) !== newTotals) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);
writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changed, countReportSha256, abcsReportSha256, ...after }));
