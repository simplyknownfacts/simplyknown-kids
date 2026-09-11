// Guarded import for the independently reviewed Tap-a-Tune 320x568 target repair.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const reportPath = path.join(root, 'tests/e2e/out/tap-a-tune-visual-play-repair-full/report.json');
const reportBytes = readFileSync(reportPath);
const reportHash = createHash('sha256').update(reportBytes).digest('hex');
const report = JSON.parse(reportBytes);
const coveragePath = path.join(auditDir, 'coverage.json');
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
const evidence = 'baseline-observations.md#tap-a-tune-target-repair-at-45edc17';

if (reportHash !== '55c81f709634ac7a51afface41ff9363b36326af2451ab20118fcfc1c34dced3') {
  throw new Error(`Tap-a-Tune repair report hash changed: ${reportHash}`);
}
if (report.tapATuneSha256 !== '7be6813183867f1016fb654655aa56823cd0e5157635168a74b8617ff25411f1') {
  throw new Error(`wrong Tap-a-Tune source hash: ${report.tapATuneSha256}`);
}
if (JSON.stringify(report.counts) !== JSON.stringify({ rows: 40, pass: 120, fail: 0, na: 80, blk: 40 })) {
  throw new Error(`unexpected report counts: ${JSON.stringify(report.counts)}`);
}
if (report.rows.length !== 40 || new Set(report.rows.map(row => row.id)).size !== 40) {
  throw new Error('incomplete or duplicate Tap-a-Tune repair rows');
}
for (const row of report.rows) {
  if (row.fatal || !row.recovered || row.free !== 8 || row.geometry.pads !== 6
    || row.geometry.minTarget < 44 || row.geometry.clipped || row.geometry.overflow > 1
    || row.errors.length || row.failed.length || row.screenshotCount !== 5) {
    throw new Error(`invalid repair evidence in ${row.id}`);
  }
  if (row.tier >= 3 && (row.songs.length !== 1 || !row.songs[0].wrongRecovered)) {
    throw new Error(`guided-song evidence missing in ${row.id}`);
  }
  if (row.tier >= 7 && !row.memory?.busyProtected) {
    throw new Error(`memory evidence missing in ${row.id}`);
  }
}

const target = coverage.rows.find(row => row.id === 'tap-a-tune:T10:phone');
if (!target || target.route !== '/games/tap-a-tune.html') throw new Error('Tap-a-Tune target ledger row missing');
let changed = 0;
if (target.checks.visual_quality === 'FAIL') {
  target.checks.visual_quality = 'PASS';
  target.verdict = 'PASS';
  target.reason = 'All applicable Tap-a-Tune play, mode, reward and reviewed visual dimensions are complete, including the repaired 320x568 target floor.';
  changed++;
} else if (target.checks.visual_quality !== 'PASS' || target.verdict !== 'PASS') {
  throw new Error(`unexpected prior Tap-a-Tune target state: ${target.checks.visual_quality}/${target.verdict}`);
}
if (!target.evidence.includes(evidence)) target.evidence.push(evidence);

const dimensions = { PASS: 0, FAIL: 0, BLK: 0, NA: 0 };
const verdicts = { PASS: 0, FAIL: 0, BLK: 0 };
const execution = {};
for (const row of coverage.rows) {
  verdicts[row.verdict]++;
  execution[row.execution] = (execution[row.execution] || 0) + 1;
  for (const status of Object.values(row.checks)) dimensions[status]++;
}
const expected = {
  dimensions: { PASS: 9437, FAIL: 16, BLK: 3513, NA: 3534 },
  verdicts: { PASS: 140, FAIL: 16, BLK: 504 },
  execution: { COMPLETE: 140, PARTIAL: 520 },
};
if (JSON.stringify(dimensions) !== JSON.stringify(expected.dimensions)
  || JSON.stringify(verdicts) !== JSON.stringify(expected.verdicts)
  || execution.COMPLETE !== expected.execution.COMPLETE
  || execution.PARTIAL !== expected.execution.PARTIAL
  || Object.keys(execution).length !== 2) {
  throw new Error(`unexpected ledger totals: ${JSON.stringify({ dimensions, verdicts, execution })}`);
}
writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changed, reportHash, ...expected }));
