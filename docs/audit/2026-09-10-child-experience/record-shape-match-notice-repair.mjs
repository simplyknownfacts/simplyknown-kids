// Guarded import for the independently reviewed Shape Match notice repair.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const auditDir = import.meta.dirname;
const coveragePath = path.join(auditDir, 'coverage.json');
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
const evidence = 'baseline-observations.md#shape-match-notice-repair-d92e248';

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

const oldTotals = JSON.stringify({
  dimensions: { PASS: 9090, FAIL: 24, BLK: 3972, NA: 3414 },
  verdicts: { PASS: 52, FAIL: 24, BLK: 584 },
  execution: { PARTIAL: 600, COMPLETE: 60 },
});
const newTotals = JSON.stringify({
  dimensions: { PASS: 9098, FAIL: 16, BLK: 3972, NA: 3414 },
  verdicts: { PASS: 60, FAIL: 16, BLK: 584 },
  execution: { PARTIAL: 600, COMPLETE: 60 },
});
const before = totals(coverage.rows);
if (![oldTotals, newTotals].includes(JSON.stringify(before))) {
  throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);
}

let changed = 0;
for (let tier = 3; tier <= 10; tier++) {
  const id = `shape-match:T${tier}:phone`;
  const row = coverage.rows.find(candidate => candidate.id === id);
  if (!row || row.route !== '/games/shape-match.html' || row.execution !== 'COMPLETE') {
    throw new Error(`invalid repaired row ${id}`);
  }
  if (row.checks.visual_quality === 'FAIL') {
    row.checks.visual_quality = 'PASS';
    changed++;
  } else if (row.checks.visual_quality !== 'PASS') {
    throw new Error(`cannot repair ${id}:visual_quality from ${row.checks.visual_quality}`);
  }
  row.verdict = 'PASS';
  row.reason = 'All applicable Shape Match behavior, negative recovery, repeated play, reward persistence and reviewed visual states complete; phone reward notice is clear of the title and play.';
  if (!row.evidence.includes(evidence)) row.evidence.push(evidence);
}

if (![0, 8].includes(changed)) throw new Error(`unexpected repaired cell count ${changed}`);
const after = totals(coverage.rows);
if (JSON.stringify(after) !== newTotals) throw new Error(`unexpected final totals ${JSON.stringify(after)}`);

writeFileSync(coveragePath, JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ changed, ...after }));
