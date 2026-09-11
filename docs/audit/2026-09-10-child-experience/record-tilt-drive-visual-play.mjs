// Guarded import for Tilt Drive's remaining locally testable audit dimensions.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const outputDir = path.join(root, 'tests/e2e/out/tilt-drive-visual-play');
const reportPath = path.join(outputDir, 'report.json');
const reportBytes = readFileSync(reportPath);
const reportHash = createHash('sha256').update(reportBytes).digest('hex');
const report = JSON.parse(reportBytes);
const coveragePath = path.join(auditDir, 'coverage.json');
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
const evidence = 'baseline-observations.md#tilt-drive-visualplay-audit-at-0c6d9e5';

if (reportHash !== '46e74eaedb874239721d98ab9e146a7285803db6c7513168178f8c9780008d6f') {
  throw new Error(`Tilt Drive report hash changed: ${reportHash}`);
}
if (report.auditStart !== '0c6d9e5cec3f0f49bea623dce561c9b727bbffa9'
  || report.tiltDriveSha256 !== '551481255a75745658453ea5b380ba3f48eb3946998ad6b0357d3a032332ae65'
  || report.evidenceBoundary !== 'Browser-emulated DeviceOrientation events and pointer input; no physical-device sensor or child touch claim.') {
  throw new Error('Tilt Drive report provenance changed');
}
if (JSON.stringify(report.counts) !== JSON.stringify({ rows: 20, pass: 100, fail: 40, blk: 20 })
  || report.screenshots !== 140) {
  throw new Error(`unexpected Tilt Drive report totals: ${JSON.stringify(report.counts)}/${report.screenshots}`);
}

const expectedIds = new Set();
for (let tier = 1; tier <= 10; tier++) for (const viewport of ['desktop', 'phone']) {
  expectedIds.add(`tilt-drive:T${tier}:${viewport}`);
}
for (const row of report.rows) {
  if (!expectedIds.delete(row.id)) throw new Error(`unexpected or duplicate row ${row.id}`);
  const meters = row.scoreResults.reduce((sum, result) => sum + result.meters, 0);
  if (row.activityId !== 'tilt-drive' || row.route !== '/games/tilt-drive.html'
    || row.fatal || row.completedRounds !== 4 || row.screenshotCount !== 7
    || row.unavailableCaption !== 'Tilt to steer! 🚗'
    || row.deniedCaption !== 'Drag left & right to steer! 👆'
    || row.grantedCaption !== 'Tilt to steer! 🚗'
    || !row.unavailableFallback || !row.deniedFallback || !row.validSensor
    || !row.invalidSensorPoisoned || row.invalidSensorFallbackRecovered || !row.reloadRecovered
    || row.reward?.title !== 'Tilt Drive Star' || row.reward.hint !== 'Saved in your gallery'
    || !row.reward.inViewport || row.reward.dismissMs > 500
    || row.scoreResults.length !== 4 || row.scoreResults.some(result => result.meters <= 0 || !/You drove \d+ m/.test(result.text))
    || row.counterAfter - row.counterBefore !== meters
    || row.pageErrors.length || row.failedLocalRequests.length) {
    throw new Error(`invalid Tilt Drive play evidence in ${row.id}`);
  }
  for (const sample of row.geometrySamples) {
    if (sample.minTarget < 44 || sample.clipped.length || sample.horizontalOverflow > 1) {
      throw new Error(`invalid geometry in ${row.id}`);
    }
  }
}
if (expectedIds.size || report.rows.length !== 20) throw new Error(`missing Tilt Drive rows: ${[...expectedIds].join(', ')}`);

const screenshots = readdirSync(path.join(outputDir, 'screenshots')).filter(name => name.endsWith('.png'));
if (screenshots.length !== 140) throw new Error(`expected 140 screenshots, found ${screenshots.length}`);
for (const name of screenshots) if (statSync(path.join(outputDir, 'screenshots', name)).size < 1000) throw new Error(`empty screenshot ${name}`);
for (const name of ['desktop.png', 'phone.png']) {
  if (statSync(path.join(outputDir, 'contact-sheets', name)).size < 1000) throw new Error(`empty contact sheet ${name}`);
}

let changed = 0;
for (const result of report.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row || row.route !== '/games/tilt-drive.html') throw new Error(`ledger row missing: ${result.id}`);
  const desired = {
    instructions: 'FAIL', input: 'FAIL', progression: 'PASS', score: 'PASS', rewards: 'PASS',
    restart: 'PASS', long_repeated_play: 'PASS', visual_quality: 'PASS',
  };
  for (const [key, value] of Object.entries(desired)) {
    if ((key === 'instructions' && row.checks[key] === 'PASS') || (key !== 'instructions' && row.checks[key] === 'BLK')) {
      row.checks[key] = value;
      changed++;
    } else if (row.checks[key] !== value) {
      throw new Error(`unexpected prior ${result.id}:${key}=${row.checks[key]}`);
    }
  }
  row.execution = 'COMPLETE';
  row.verdict = 'FAIL';
  row.reason = 'Tilt Drive play is complete; unavailable motion sensors get a false tilt instruction and invalid gamma can poison steering until reload.';
  if (!row.evidence.includes(evidence)) row.evidence.push(evidence);
}

const dimensions = { PASS: 0, FAIL: 0, BLK: 0, NA: 0 };
const verdicts = { PASS: 0, FAIL: 0, BLK: 0 };
const execution = {};
for (const row of coverage.rows) {
  verdicts[row.verdict]++;
  execution[row.execution] = (execution[row.execution] || 0) + 1;
  for (const status of Object.values(row.checks)) dimensions[status]++;
}
const expected = {
  dimensions: { PASS: 9597, FAIL: 56, BLK: 3273, NA: 3574 },
  verdicts: { PASS: 160, FAIL: 36, BLK: 464 },
  execution: { COMPLETE: 180, PARTIAL: 480 },
};
if (JSON.stringify(dimensions) !== JSON.stringify(expected.dimensions)
  || JSON.stringify(verdicts) !== JSON.stringify(expected.verdicts)
  || execution.COMPLETE !== expected.execution.COMPLETE || execution.PARTIAL !== expected.execution.PARTIAL
  || Object.keys(execution).length !== 2) {
  throw new Error(`unexpected ledger totals: ${JSON.stringify({ dimensions, verdicts, execution })}`);
}
writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changed, reportHash, screenshots: screenshots.length, ...expected }));
