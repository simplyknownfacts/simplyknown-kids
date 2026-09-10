// Guarded import for the previously NOT_RUN Watch, About, and Privacy rows.
// Real remote audiovisual quality remains blocked; local player lifecycle
// stubs are never accepted as proof that streamed sound or video is good.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const root = path.resolve(auditDir, '../../..');
const report = JSON.parse(readFileSync(path.join(root, 'tests/e2e/out/video-info-resilience/report.json'), 'utf8'));
const coveragePath = path.join(auditDir, 'coverage.json');
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
const shots = path.join(root, 'docs/verify/shots/audit-20260910-video-info');
const evidence = 'baseline-observations.md#video-info-resilience-61eb';
const routes = new Set(['videos/index.html', 'about.html', 'privacy.html']);
const viewports = ['desktop', 'phone'];

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

if (report.baseline !== '7c9b14cf4d712513a8f9c69690a780c53ea4f54a') throw new Error(`wrong report baseline ${report.baseline}`);
if (JSON.stringify(report.counts) !== JSON.stringify({ rows: 60, pass: 840, fail: 20, na: 640, blk: 60 })) {
  throw new Error(`unexpected report totals ${JSON.stringify(report.counts)}`);
}
if (report.rows.length !== 60 || new Set(report.rows.map(row => row.id)).size !== 60) throw new Error('incomplete or duplicate report rows');

const expectedIds = new Set();
for (const route of routes) for (let tier = 1; tier <= 10; tier++) for (const viewport of viewports) expectedIds.add(`${route}:T${tier}:${viewport}`);
for (const result of report.rows) {
  if (!expectedIds.delete(result.id)) throw new Error(`unexpected report row ${result.id}`);
  if (result.checks.layout_bounds?.status !== 'PASS') throw new Error(`${result.id}: layout check is not PASS`);
  if (result.checks.visual_quality?.status !== 'BLK') throw new Error(`${result.id}: pre-review visual status must be BLK`);
  const failures = Object.entries(result.checks).filter(([, finding]) => finding.status === 'FAIL');
  if (result.routeId === 'videos/index.html') {
    if (failures.length !== 1 || failures[0][0] !== 'navigation_during_animation') throw new Error(`${result.id}: unexpected Watch failures ${JSON.stringify(failures)}`);
  } else if (failures.length) throw new Error(`${result.id}: unexpected informational-page failure ${JSON.stringify(failures)}`);
  const shortRoute = result.routeId === 'videos/index.html' ? 'videos' : result.routeId.replace('.html', '');
  if (statSync(path.join(shots, `${shortRoute}-T${result.tier}-${result.viewport}.png`)).size < 1000) throw new Error(`${result.id}: missing or empty screenshot`);
}
if (expectedIds.size) throw new Error(`missing report rows: ${[...expectedIds].join(', ')}`);
for (const route of ['videos', 'about', 'privacy']) for (const viewport of viewports) {
  if (statSync(path.join(shots, `contact-${route}-${viewport}.png`)).size < 1000) throw new Error(`missing contact sheet ${route}:${viewport}`);
}

const before = totals(coverage.rows);
const oldTotals = JSON.stringify({ dimensions: { PASS: 7887, FAIL: 16, BLK: 5863, NA: 2734 }, verdicts: { PASS: 0, FAIL: 16, BLK: 644 }, execution: { PARTIAL: 600, NOT_RUN: 60 } });
const newTotals = JSON.stringify({ dimensions: { PASS: 8687, FAIL: 36, BLK: 4403, NA: 3374 }, verdicts: { PASS: 40, FAIL: 36, BLK: 584 }, execution: { PARTIAL: 620, COMPLETE: 40 } });
const laterTotals = JSON.stringify({ dimensions: { PASS: 8887, FAIL: 36, BLK: 4203, NA: 3374 }, verdicts: { PASS: 40, FAIL: 36, BLK: 584 }, execution: { PARTIAL: 620, COMPLETE: 40 } });
if (![oldTotals, newTotals, laterTotals].includes(JSON.stringify(before))) throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);

const changes = { 'BLK->PASS': 0, 'BLK->FAIL': 0, 'BLK->NA': 0 };
for (const result of report.rows) {
  const row = coverage.rows.find(candidate => candidate.id === result.id);
  if (!row || row.kind !== 'shared' || !routes.has(result.routeId)) throw new Error(`invalid coverage row ${result.id}`);
  const alreadyRecorded = row.evidence.includes(evidence);
  for (const [dimension, reported] of Object.entries(result.checks)) {
    if (dimension === 'layout_bounds') continue;
    if (!(dimension in row.checks)) throw new Error(`unknown dimension ${result.id}:${dimension}`);
    if (result.routeId === 'videos/index.html' && (dimension === 'interrupted_audio' || dimension === 'long_repeated_play')) continue;
    const finding = dimension === 'visual_quality'
      ? { status: 'PASS', note: 'All ten age-tier screenshots in this viewport were visually inspected in the route contact sheet.' }
      : reported;
    const prior = row.checks[dimension];
    if (finding.status === prior) continue;
    if (prior !== 'BLK' || !['PASS', 'FAIL', 'NA'].includes(finding.status)) throw new Error(`cannot apply ${finding.status} over ${prior} in ${result.id}:${dimension}`);
    row.checks[dimension] = finding.status;
    changes[`BLK->${finding.status}`]++;
  }
  if (result.routeId === 'videos/index.html') {
    row.execution = 'PARTIAL'; row.verdict = 'FAIL';
    row.reason = 'Watch has a confirmed pending-feed close lifecycle failure. Real remote stream endurance and audible interruption remain blocked because synthetic media cannot prove audiovisual quality.';
  } else {
    row.execution = 'COMPLETE'; row.verdict = 'PASS';
    row.reason = 'Local informational-page behavior, navigation, reload, resize, installed-app offline recovery and visual review complete; game/media dimensions are explicitly not applicable.';
  }
  if (!alreadyRecorded) row.evidence.push(evidence);
}

const expectedChanges = JSON.stringify({ 'BLK->PASS': 800, 'BLK->FAIL': 20, 'BLK->NA': 640 });
const noChanges = JSON.stringify({ 'BLK->PASS': 0, 'BLK->FAIL': 0, 'BLK->NA': 0 });
if (![expectedChanges, noChanges].includes(JSON.stringify(changes))) throw new Error(`unexpected ledger transitions ${JSON.stringify(changes)}`);
const after = totals(coverage.rows);
const expectedAfter = JSON.stringify(before) === laterTotals ? laterTotals : newTotals;
if (JSON.stringify(after) !== expectedAfter) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);

writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changes, ...after }));
