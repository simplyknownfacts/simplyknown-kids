// Create one no-overwrite, self-hashed archive for the Hide & Seek repair and Magic Touch audit.
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../../..');
const archiveParent = 'C:\\Users\\HomeSeer\\OneDrive\\Documents\\Claude\\Projects\\Kids_App\\audit-evidence-archive';
const archiveName = '2026-09-10-hide-seek-magic-touch-7c71';
const target = path.join(archiveParent, archiveName);
if (path.dirname(target) !== archiveParent || path.basename(target) !== archiveName) throw new Error(`unsafe archive target ${target}`);
if (!existsSync(archiveParent) || !statSync(archiveParent).isDirectory()) throw new Error(`archive parent missing ${archiveParent}`);
if (existsSync(target)) throw new Error(`archive already exists; refusing overwrite: ${target}`);

const sources = [
  'games/peek-a-boo.html',
  'games/magic-touch.html',
  'tests/hide-seek-notice-layout.test.mjs',
  'tests/e2e/hide-seek-visual-play.mjs',
  'tests/e2e/magic-touch-visual-play.mjs',
  'docs/audit/2026-09-10-child-experience/archive-hide-seek-magic-touch.mjs',
  'docs/audit/2026-09-10-child-experience/record-hide-seek-notice-repair.mjs',
  'docs/audit/2026-09-10-child-experience/record-magic-touch-visual-play.mjs',
  'docs/audit/2026-09-10-child-experience/coverage.json',
  'docs/audit/2026-09-10-child-experience/README.md',
  'docs/audit/2026-09-10-child-experience/baseline-observations.md',
];

function filesUnder(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(item));
    else if (entry.isFile()) found.push(item);
  }
  return found;
}

const evidenceDirectories = [
  'docs/verify/shots/hide-seek-notice',
  'tests/e2e/out/hide-seek-visual-play',
  'tests/e2e/out/magic-touch-visual-play',
];
for (const directory of evidenceDirectories) {
  const absolute = path.join(root, directory);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) throw new Error(`evidence directory missing ${directory}`);
  for (const file of filesUnder(absolute)) sources.push(path.relative(root, file).replaceAll('\\', '/'));
}
if (new Set(sources).size !== sources.length) throw new Error('duplicate archive source');
for (const relative of sources) {
  const source = path.join(root, relative);
  if (!existsSync(source) || !statSync(source).isFile()) throw new Error(`source missing ${relative}`);
}

const expectedImages = new Map([
  ['docs/verify/shots/hide-seek-notice', 55],
  ['tests/e2e/out/hide-seek-visual-play', 82],
  ['tests/e2e/out/magic-touch-visual-play', 102],
]);
for (const [directory, expected] of expectedImages) {
  const count = filesUnder(path.join(root, directory)).filter(file => file.endsWith('.png')).length;
  if (count !== expected) throw new Error(`unexpected image count ${directory}=${count}, expected ${expected}`);
}

const hideReportBytes = readFileSync(path.join(root, 'tests/e2e/out/hide-seek-visual-play/report.json'));
const magicReportBytes = readFileSync(path.join(root, 'tests/e2e/out/magic-touch-visual-play/report.json'));
const hideReportHash = createHash('sha256').update(hideReportBytes).digest('hex');
const magicReportHash = createHash('sha256').update(magicReportBytes).digest('hex');
if (hideReportHash !== 'b95cb5d4503331e29a8dfd9691c936c0e86f1c783b41899ea432abff0b1cba17') throw new Error(`Hide report changed ${hideReportHash}`);
if (magicReportHash !== '0efc4747cab50c56737a3598b826ff945dca7540946c94865e8790a4b3d4c079') throw new Error(`Magic report changed ${magicReportHash}`);
const hideReport = JSON.parse(hideReportBytes);
const magicReport = JSON.parse(magicReportBytes);
if (hideReport.counts?.rows !== 20 || hideReport.counts?.fail !== 0 || magicReport.counts?.rows !== 20 || magicReport.counts?.fail !== 10) {
  throw new Error('report row or finding totals changed');
}

mkdirSync(target);
for (const relative of sources) {
  const source = path.join(root, relative);
  const destination = path.join(target, relative);
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(source, destination, constants.COPYFILE_EXCL);
}

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
const readme = `# Kids Hide & Seek repair and Magic Touch audit evidence - 2026-09-10

1. Exact clean start: \`dd5b25a0a046d60d215542cb2209f1ccaf7f5fa0\`.
2. Hide & Seek product repair: \`2aae9f7e2c1ddb33eb195ba60ca7b7c9a22b47ad\`; phone reward uses the safe header gap, temporarily replaces Again, then restores it after dismissal.
3. Independent detached review of exact \`2aae9f7\`: PASS with no P1/P2; focused 12/12 and full 20/20 rows with report SHA-256 \`ec94083328b52a15341206c8e054ee65adf193f7c218baf95581f18d127d5d70\`.
4. Hide repair evidence commit: \`f3fe28f08992c39869108bb8f6edc1721decba2c\`.
5. Magic Touch audit commit: \`9f01e7eda53a8f0a86e0bf4b67d86dad6f294c29\`.
6. Commit and branch at archive creation: \`${commit}\` on \`${branch}\`.
7. Hide local report: 20/20 rows, 60 PASS / 0 FAIL / 20 NA / 20 inspected visual placeholders, 60 wrong-to-correct rounds, 80 screenshots; SHA-256 \`${hideReportHash}\`.
8. Magic report: 20 rows, 50 PASS / 10 progression FAIL / 40 NA / 20 inspected visual placeholders, 100 screenshots; SHA-256 \`${magicReportHash}\`.
9. Magic P2: every T6-T10 completed connected shape records twice on phone and desktop; all 30 sampled shapes reproduced it.
10. Magic P2: T6-T10 goal-mode toggle is 42px high on phone and desktop against the Kids 44px floor.
11. Final canonical ledger: 9,321 PASS / 36 FAIL / 3,649 BLK / 3,494 NA; 110 PASS / 26 FAIL / 524 BLK rows; 120 COMPLETE / 540 PARTIAL.
12. Full project suite: 388 tests, 379 pass / 9 known Bubble Pop failures / 0 skip; intentionally not green.
13. Synthetic profiles and silent local media stubs only; no physical-device, audible or provider claim.
14. No Magic Touch product code, production/main, push, merge, deploy/promote, credentials, PII, paid call, security gate or remote write.
15. \`SHA256SUMS\` covers every other archive file; paths are relative to this archive root.
`;
const verification = `Hide product commit: 2aae9f7e2c1ddb33eb195ba60ca7b7c9a22b47ad.
Hide focused regression: 12/12 across T3-T10 phone, short phone, tablet and desktop.
Hide repeated play: 20/20 rows, 60 complete wrong-to-correct rounds, 20 post-reward recoveries, 80 screenshots.
Independent Hide review: PASS, no P1/P2 at exact commit; report ec94083328b52a15341206c8e054ee65adf193f7c218baf95581f18d127d5d70.
Hide importer: first run 8 FAIL-to-PASS cells; second run 0 changes.
Magic visual/play: 20 rows, 100 screenshots, 20 rewards, 20 reload recoveries, 30 wrong-to-correct connected shapes.
Magic findings: 10 progression FAIL cells for double records and 10 visual FAIL cells for 42px goal toggle.
Magic importer: first run 120 cells; second run 0 changes; no non-Magic row changed.
Full project suite: 388 tests, 379 pass, 9 known Bubble Pop failures, 0 skip.
Final ledger: 9321 PASS, 36 FAIL, 3649 BLK, 3494 NA; 120 COMPLETE, 540 PARTIAL.
`;
writeFileSync(path.join(target, 'README.md'), readme, { flag: 'wx' });
writeFileSync(path.join(target, 'verification.txt'), verification, { flag: 'wx' });

const payload = filesUnder(target).map(file => path.relative(target, file).replaceAll('\\', '/')).sort();
const hashes = payload.map(relative => {
  const digest = createHash('sha256').update(readFileSync(path.join(target, relative))).digest('hex');
  return `${digest}  ${relative}`;
});
writeFileSync(path.join(target, 'SHA256SUMS'), hashes.join('\n') + '\n', { flag: 'wx' });

const manifest = new Map(hashes.map(line => [line.slice(66), line.slice(0, 64)]));
const actual = filesUnder(target).map(file => path.relative(target, file).replaceAll('\\', '/')).sort();
const extras = actual.filter(relative => relative !== 'SHA256SUMS' && !manifest.has(relative));
const missing = [...manifest.keys()].filter(relative => !actual.includes(relative));
const mismatches = [...manifest].filter(([relative, digest]) => createHash('sha256').update(readFileSync(path.join(target, relative))).digest('hex') !== digest);
if (extras.length || missing.length || mismatches.length || actual.length !== payload.length + 1) {
  throw new Error(`archive verification failed extras=${extras.length} missing=${missing.length} mismatches=${mismatches.length}`);
}
const payloadBytes = [...manifest.keys()].reduce((sum, relative) => sum + statSync(path.join(target, relative)).size, 0);
const totalBytes = actual.reduce((sum, relative) => sum + statSync(path.join(target, relative)).size, 0);
const manifestSha256 = createHash('sha256').update(readFileSync(path.join(target, 'SHA256SUMS'))).digest('hex');
console.log(JSON.stringify({ target, manifestEntries: manifest.size, totalFiles: actual.length, payloadBytes, totalBytes, manifestSha256, extras: 0, missing: 0, mismatches: 0 }));
