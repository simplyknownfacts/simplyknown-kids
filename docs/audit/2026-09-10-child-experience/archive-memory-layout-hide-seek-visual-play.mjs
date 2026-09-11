// Create one no-overwrite, self-hashed archive for the Memory repair and Hide & Seek audit.
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../../..');
const archiveParent = 'C:\\Users\\HomeSeer\\OneDrive\\Documents\\Claude\\Projects\\Kids_App\\audit-evidence-archive';
const archiveName = '2026-09-10-memory-layout-hide-seek-visual-play-0051';
const target = path.join(archiveParent, archiveName);
if (path.dirname(target) !== archiveParent || path.basename(target) !== archiveName) throw new Error(`unsafe archive target ${target}`);
if (!existsSync(archiveParent) || !statSync(archiveParent).isDirectory()) throw new Error(`archive parent missing ${archiveParent}`);
if (existsSync(target)) throw new Error(`archive already exists; refusing overwrite: ${target}`);

const sources = [
  'games/memory-match.html',
  'games/peek-a-boo.html',
  'js/hide-seek.js',
  'tests/memory-match-layout.test.mjs',
  'tests/e2e/memory-match-visual-play.mjs',
  'tests/e2e/hide-seek-visual-play.mjs',
  'docs/audit/2026-09-10-child-experience/archive-memory-layout-hide-seek-visual-play.mjs',
  'docs/audit/2026-09-10-child-experience/record-memory-match-layout-repair.mjs',
  'docs/audit/2026-09-10-child-experience/record-hide-seek-visual-play.mjs',
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
  'docs/verify/shots/memory-match-layout',
  'tests/e2e/out/memory-match-layout-red',
  'tests/e2e/out/memory-match-visual-play',
  'tests/e2e/out/hide-seek-visual-play',
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
  ['docs/verify/shots/memory-match-layout', 63],
  ['tests/e2e/out/memory-match-layout-red', 82],
  ['tests/e2e/out/memory-match-visual-play', 82],
  ['tests/e2e/out/hide-seek-visual-play', 82],
]);
for (const [directory, expected] of expectedImages) {
  const count = filesUnder(path.join(root, directory)).filter(file => file.endsWith('.png')).length;
  if (count !== expected) throw new Error(`unexpected image count ${directory}=${count}, expected ${expected}`);
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
const memoryReport = JSON.parse(readFileSync(path.join(root, 'tests/e2e/out/memory-match-visual-play/report.json'), 'utf8'));
const hideReport = JSON.parse(readFileSync(path.join(root, 'tests/e2e/out/hide-seek-visual-play/report.json'), 'utf8'));
if (memoryReport.counts?.rows !== 20 || hideReport.counts?.rows !== 20) throw new Error('report row count changed');

const readme = `# Kids Memory Match repair and Hide & Seek audit evidence - 2026-09-10

1. Exact clean start: \`1757f83834b0c0cee23433f3dda3e90118220176\`.
2. Accepted product fix: \`3cb61a63b28beff0d9796fac49fd4ca85f6ece75\`; only Memory Match responsive layout changed, with its permanent regression test.
3. Memory repair evidence commit: \`c1fa8b37eda1ed788254806e7c4d15d84b7b80d4\`.
4. Hide & Seek audit commit at archive time: \`${commit}\`.
5. Branch: \`${branch}\`.
6. Memory Match red reproduced all 15 affected cells; green layout test passed 23/23; repeated play passed 20/20 rows, 60 full boards and 386 pair records.
7. Independent detached review of exact product commit \`3cb61a6\` passed with no P1/P2 finding; reviewer layout was 23/23 and repeated play was 20/20.
8. Memory report: ${memoryReport.counts.pass} PASS / ${memoryReport.counts.fail} FAIL / ${memoryReport.counts.na} NA / ${memoryReport.counts.blk} visual placeholders; SHA-256 \`620b2491fa731f7bfaea0f7b3ba079f84aebe3ae07e2fa7e0b75dbee9be886ed\`.
9. Hide & Seek report: ${hideReport.counts.pass} PASS / ${hideReport.counts.fail} FAIL / ${hideReport.counts.na} NA / ${hideReport.counts.blk} visual placeholders; 20/20 rows, 60 wrong-to-correct rounds plus post-reward recovery and 80 screenshots; SHA-256 \`c7852a7fc2675255dd8461ba8a578b43da83c10cbeb8ff4895dd99b1df2f5453\`.
10. Hide & Seek P2 finding: phone T3-T10 reward notices cover the title and instruction; desktop and T1-T2 phone are clear. No Hide & Seek product source was changed.
11. Final canonical ledger: 9,253 PASS / 24 FAIL / 3,769 BLK / 3,454 NA; 92 PASS / 24 FAIL / 544 BLK rows; 100 COMPLETE / 560 PARTIAL.
12. Full project suite after the Memory repair: 376 tests, 367 pass / 9 known Bubble Pop failures / 0 skip; not green.
13. Synthetic profiles and silent local media stubs only; no physical-device, audible or provider claim.
14. No production/main, push, merge, deploy/promote, credentials, PII, paid call, security gate or remote write.
15. \`SHA256SUMS\` covers every other archive file; paths are relative to this archive root.
`;
const verification = `Memory Match product commit: 3cb61a63b28beff0d9796fac49fd4ca85f6ece75.
Memory layout regression: red reproduced 15 affected cells; green 23/23.
Memory repeated play: 20/20 rows, 60 complete boards, 386 pair records.
Independent Memory review: PASS, no P1/P2 at exact commit.
Memory repair importer: first run 15 FAIL->PASS; second run 0 changes.
Hide & Seek visual/play: 20/20 rows, 60 complete wrong-to-correct rounds, 20 post-reward recoveries, 80 screenshots.
Hide & Seek finding: 8 phone T3-T10 reward/title-and-instruction overlaps.
Hide importer first run: 71 BLK->PASS, 8 BLK->FAIL, 20 BLK->NA; second run 0 changes.
Full project suite: 376 tests, 367 pass, 9 known Bubble Pop failures, 0 skip.
Final ledger: 9253 PASS, 24 FAIL, 3769 BLK, 3454 NA; 100 COMPLETE, 560 PARTIAL.
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
