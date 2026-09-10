// Record only the twenty Watch navigation-during-animation cells proven by
// the retained red/green matrix and the independently reviewed product fix.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const evidenceDir = path.join(root, 'tests/e2e/out/watch-lifecycle-20260910-01a08d94');
const red = JSON.parse(readFileSync(path.join(evidenceDir, 'red-navigation-matrix.json'), 'utf8'));
const green = JSON.parse(readFileSync(path.join(evidenceDir, 'green-navigation-matrix.json'), 'utf8'));
const coveragePath = path.join(auditDir, 'coverage.json');
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
const watchSource = readFileSync(path.join(root, 'videos/index.html'), 'utf8');
const evidence = 'baseline-observations.md#watch-lifecycle-repair-3683e20';
const expected = new Set();
for (let tier = 1; tier <= 10; tier++) {
  for (const viewport of ['desktop', 'phone']) expected.add(`videos/index.html:T${tier}:${viewport}`);
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

if (red.rows.length !== 20 || green.rows.length !== 20) throw new Error('red/green Watch matrix must contain exactly 20 rows each');
if (new Set(red.rows.map(row => row.id)).size !== 20 || new Set(green.rows.map(row => row.id)).size !== 20) throw new Error('duplicate Watch matrix row');
if (red.counts.fail !== 20 || green.counts.fail !== 0) throw new Error(`unexpected red/green failures ${red.counts.fail}/${green.counts.fail}`);
const greenById = new Map(green.rows.map(row => [row.id, row]));
for (const redRow of red.rows) {
  if (!expected.delete(redRow.id)) throw new Error(`unexpected Watch row ${redRow.id}`);
  const greenRow = greenById.get(redRow.id);
  if (!greenRow) throw new Error(`missing green Watch row ${redRow.id}`);
  const redCheck = redRow.checks.navigation_during_animation;
  const greenCheck = greenRow.checks.navigation_during_animation;
  if (redCheck?.status !== 'FAIL' || !/created":1.*destroyed":0.*active":false/.test(redCheck.note)) {
    throw new Error(`${redRow.id}: retained red row does not prove the orphaned-player failure`);
  }
  if (greenCheck?.status !== 'PASS') throw new Error(`${redRow.id}: repaired navigation check is not PASS`);
  if (Object.values(greenRow.checks).some(check => check.status === 'FAIL')) throw new Error(`${redRow.id}: repaired row still has a failure`);
}
if (expected.size) throw new Error(`missing Watch rows: ${[...expected].join(', ')}`);
for (const required of [
  'const generation = ++_openGeneration;',
  "if (generation !== _openGeneration || !wrap.classList.contains('active')) return;",
  'function closePlayer() {',
  '_openGeneration++;',
]) {
  if (!watchSource.includes(required)) throw new Error(`Watch source lacks lifecycle guard: ${required}`);
}
if (watchSource.split("if (generation !== _openGeneration || !wrap.classList.contains('active')) return;").length - 1 !== 2) {
  throw new Error('Watch must check the opening generation after both asynchronous phases');
}

const oldTotals = JSON.stringify({ dimensions: { PASS: 8887, FAIL: 36, BLK: 4203, NA: 3374 }, verdicts: { PASS: 40, FAIL: 36, BLK: 584 }, execution: { PARTIAL: 620, COMPLETE: 40 } });
const newTotals = JSON.stringify({ dimensions: { PASS: 8907, FAIL: 16, BLK: 4203, NA: 3374 }, verdicts: { PASS: 40, FAIL: 16, BLK: 604 }, execution: { PARTIAL: 620, COMPLETE: 40 } });
const before = totals(coverage.rows);
if (![oldTotals, newTotals].includes(JSON.stringify(before))) throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);

let changed = 0;
for (const result of green.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row || row.route !== '/videos/index.html') throw new Error(`invalid Watch ledger row ${result.id}`);
  const alreadyRecorded = row.evidence.includes(evidence);
  if (row.checks.navigation_during_animation === 'FAIL') {
    row.checks.navigation_during_animation = 'PASS';
    changed++;
  } else if (row.checks.navigation_during_animation !== 'PASS' || !alreadyRecorded) {
    throw new Error(`unexpected prior state ${result.id}:navigation_during_animation=${row.checks.navigation_during_animation}`);
  }
  row.execution = 'PARTIAL';
  row.verdict = 'BLK';
  row.reason = 'Watch pending-feed Back lifecycle repair is verified with synthetic player stubs. Real remote stream endurance, visible player output and audible interruption remain blocked because synthetic media cannot prove audiovisual quality.';
  if (!alreadyRecorded) row.evidence.push(evidence);
}

if (![0, 20].includes(changed)) throw new Error(`unexpected transition count ${changed}`);
const after = totals(coverage.rows);
if (JSON.stringify(after) !== newTotals) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);

writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changed, ...after }));
