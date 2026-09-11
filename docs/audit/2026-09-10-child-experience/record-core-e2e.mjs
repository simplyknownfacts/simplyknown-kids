// Import the bounded real-click E2E results into coverage.json without turning
// unexercised checks into passes. Reports stay ignored; the observation note is
// the durable evidence summary.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const coveragePath = path.join(auditDir, 'coverage.json');
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
const activityByName = new Map(coverage.activities.map(activity => [activity.name, activity]));
const evidence = 'baseline-observations.md#core-e2e-df25aec';
const progressExclusions = new Set(['stamp-art', 'finger-paint', 'color-splash', 'color-in', 'magic-touch', 'tap-a-tune', 'tilt-drive']);
const replacementReports = ['focus-desktop-t8-t10', 'focus2-desktop-t10', 'focus2-phone-t9'];
const replacements = new Map();
for (const name of replacementReports) {
  const report = JSON.parse(readFileSync(path.join(root, 'tests', 'e2e', 'out', name, 'report.json'), 'utf8'));
  for (const result of report.results) for (const cell of result.cells) {
    if (cell.status === 'PASS') replacements.set(`${report.viewport}:${result.tier}:${cell.kind}:${cell.label}`, cell);
  }
}
let updatedRows = 0;
let passedChecks = 0;
let skippedWarnings = 0;

function rowFor(id, tier, viewport) {
  const row = coverage.rows.find(candidate => candidate.id === `${id}:T${tier}:${viewport}`);
  if (!row) throw new Error(`Missing coverage row ${id}:T${tier}:${viewport}`);
  return row;
}

function mark(row, key) {
  if (row.checks[key] !== 'PASS') {
    row.checks[key] = 'PASS';
    passedChecks++;
  }
  row.execution = 'PARTIAL';
  row.verdict = 'BLK';
  row.reason = 'Core real-click pass recorded; remaining dimensions are untested.';
  if (!row.evidence.includes(evidence)) row.evidence.push(evidence);
  updatedRows++;
}

for (const viewport of ['desktop', 'phone']) {
  const reportPath = path.join(root, 'tests', 'e2e', 'out', viewport, 'report.json');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  if (report.viewport !== viewport || report.results.length !== 10) {
    throw new Error(`${viewport} report is incomplete or mislabeled`);
  }
  if (report.counts.fail !== 0) throw new Error(`${viewport} report has ${report.counts.fail} failures`);

  for (const tierResult of report.results) {
    const tier = tierResult.tier;
    const cells = tierResult.cells;

    for (const original of cells.filter(item => item.kind === 'play' || item.kind === 'gated-load')) {
      const cell = original.status === 'PASS' ? original : replacements.get(`${viewport}:${tier}:${original.kind}:${original.label}`) || original;
      const activity = activityByName.get(cell.label);
      if (!activity) throw new Error(`Unknown activity label ${cell.label}`);
      if (cell.status !== 'PASS') {
        skippedWarnings++;
        continue;
      }
      const row = rowFor(activity.id, tier, viewport);
      mark(row, 'launch');
      if (cell.kind === 'play' && !/auto mode|game canvas running/i.test(cell.signal || '')) {
        mark(row, 'input');
        if (!progressExclusions.has(activity.id) && !/no-record-by-design/i.test(cell.note || '')) {
          mark(row, 'progression');
        }
        if (activity.id === 'tap-pop') mark(row, 'score');
        if (activity.id === 'peek-a-boo') mark(row, 'wrong_answers');
      }
    }

    const shared = [
      ['index.html', ['add child via UI', 'delete child via UI'], ['launch', 'input', 'progression']],
      ['games/index.html', ['games gating'], ['launch']],
      ['learning/index.html', ['learn gating'], ['launch']],
      ['art/index.html', ['art gating'], ['launch']],
      ['parent/settings.html', ['settings PIN unlock', 'feature toggles', 'voice pick', 'activity hide/show'], ['launch', 'input', 'progression']],
      ['achievements.html', ['ribbon gallery'], ['launch']],
    ];
    for (const [id, labels, checks] of shared) {
      if (!labels.every(label => cells.some(cell => cell.label === label && cell.status === 'PASS'))) continue;
      const row = rowFor(id, tier, viewport);
      for (const check of checks) mark(row, check);
    }
  }
}

writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ updatedRows, passedChecks, skippedWarnings }));
