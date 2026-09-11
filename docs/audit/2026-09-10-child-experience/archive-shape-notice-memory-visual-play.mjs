// Create one no-overwrite, self-hashed archive for the Shape notice repair and Memory Match audit.
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../../..');
const archiveParent = 'C:\\Users\\HomeSeer\\OneDrive\\Documents\\Claude\\Projects\\Kids_App\\audit-evidence-archive';
const archiveName = '2026-09-10-shape-notice-memory-visual-play-01a08de0';
const target = path.join(archiveParent, archiveName);
if (path.dirname(target) !== archiveParent || path.basename(target) !== archiveName) throw new Error(`unsafe archive target ${target}`);
if (!existsSync(archiveParent) || !statSync(archiveParent).isDirectory()) throw new Error(`archive parent missing ${archiveParent}`);
if (existsSync(target)) throw new Error(`archive already exists; refusing overwrite: ${target}`);

const sources = [
  'games/shape-match.html',
  'games/memory-match.html',
  'tests/shape-match-notice-layout.test.mjs',
  'tests/e2e/shape-match-visual-play.mjs',
  'tests/e2e/memory-match-visual-play.mjs',
  'docs/audit/2026-09-10-child-experience/archive-shape-notice-memory-visual-play.mjs',
  'docs/audit/2026-09-10-child-experience/record-shape-match-notice-repair.mjs',
  'docs/audit/2026-09-10-child-experience/record-memory-match-visual-play.mjs',
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

for (const directory of [
  'docs/verify/shots/shape-match-notice',
  'tests/e2e/out/shape-match-visual-play',
  'tests/e2e/out/memory-match-visual-play',
]) {
  const absolute = path.join(root, directory);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) throw new Error(`evidence directory missing ${directory}`);
  for (const file of filesUnder(absolute)) sources.push(path.relative(root, file).replaceAll('\\', '/'));
}
if (new Set(sources).size !== sources.length) throw new Error('duplicate archive source');
for (const relative of sources) {
  const source = path.join(root, relative);
  if (!existsSync(source) || !statSync(source).isFile()) throw new Error(`source missing ${relative}`);
}

const noticeImages = filesUnder(path.join(root, 'docs/verify/shots/shape-match-notice')).length;
const shapeImages = filesUnder(path.join(root, 'tests/e2e/out/shape-match-visual-play')).filter(file => file.endsWith('.png')).length;
const memoryImages = filesUnder(path.join(root, 'tests/e2e/out/memory-match-visual-play')).filter(file => file.endsWith('.png')).length;
if (noticeImages !== 29 || shapeImages !== 108 || memoryImages !== 82) {
  throw new Error(`unexpected image counts ${noticeImages}/${shapeImages}/${memoryImages}`);
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
const shapeReport = JSON.parse(readFileSync(path.join(root, 'tests/e2e/out/shape-match-visual-play/report.json'), 'utf8'));
const memoryReport = JSON.parse(readFileSync(path.join(root, 'tests/e2e/out/memory-match-visual-play/report.json'), 'utf8'));
if (shapeReport.counts?.rows !== 20 || memoryReport.counts?.rows !== 20) throw new Error('report row count changed');

const readme = `# Kids Shape notice repair and Memory Match audit evidence - 2026-09-10

1. Exact clean start: \`cd3b9d79b1868d05752afe0d2446cfc09e7100e0\`.
2. Accepted product fix: \`d92e248a45507a0be8c7fe7dd9274924f17c07cf\`; only Shape Match phone notice position changed.
3. Shape repair evidence commit: \`80f026ff45fe04591e35abe06a9e7a0929e27e99\`.
4. Memory Match runner commit: \`d404038\`; audit evidence commit at archive time: \`${commit}\`.
5. Branch: \`${branch}\`.
6. Shape Match repair: permanent notice regression 19/19; repeated-play runner 20/20 rows and 180 boards; independent exact-commit review found no P1/P2 issue.
7. Shape Match report: ${shapeReport.counts.pass} PASS / ${shapeReport.counts.fail} FAIL / ${shapeReport.counts.na} NA / ${shapeReport.counts.blk} visual placeholders; SHA-256 \`3cc1077e6f58925a792e8fcdd97448d704341fc3ac384f14446d8b6c44efb814\`.
8. Memory Match report: ${memoryReport.counts.pass} PASS / ${memoryReport.counts.fail} FAIL / ${memoryReport.counts.na} NA / ${memoryReport.counts.blk} visual placeholders; 20/20 rows, 60 full boards and 386 pair records; SHA-256 \`6b3c61164e5e033b3be5b1db50df2d89b4d3e13ab3608499019f6f86eb4f3b1e\`.
9. Memory Match P2 findings: phone T3-T10 reward/title overlap; desktop T1-T2/T5-T9 begin with cards below the viewport. No Memory Match product fix was authorized or made.
10. Visual evidence: ${noticeImages} Shape notice regression images, ${shapeImages} Shape runner images and ${memoryImages} Memory runner images.
11. Final canonical ledger: 9,167 PASS / 31 FAIL / 3,868 BLK / 3,434 NA; 65 PASS / 31 FAIL / 564 BLK rows; 80 COMPLETE / 580 PARTIAL.
12. Full project suite: 353 tests, 344 pass / 9 known Bubble Pop failures / 0 skip; not green.
13. Synthetic profiles and silent local media stubs only; no physical-device, audible or provider claim.
14. No production/main, push, merge, deploy/promote, credentials, PII, paid call, security gate or remote write.
15. \`SHA256SUMS\` covers every other archive file; paths are relative to this archive root.
`;
const verification = `Shape Match fixed regression: 19/19.\nShape Match repeated play: 20/20 rows, 180 complete boards.\nIndependent Shape review: PASS, no P1/P2.\nMemory Match repeated play: 20/20 rows, 60 complete boards, 386 pair records.\nMemory Match findings: 8 phone reward/title overlaps and 7 desktop initially offscreen-board rows.\nMemory guarded importer first run: 69 BLK->PASS, 15 BLK->FAIL, 20 BLK->NA.\nMemory guarded importer second run: 0 changes.\nFull project suite: 353 tests, 344 pass, 9 known Bubble Pop failures, 0 skip.\nFinal ledger: 9167 PASS, 31 FAIL, 3868 BLK, 3434 NA; 80 COMPLETE, 580 PARTIAL.\n`;
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
