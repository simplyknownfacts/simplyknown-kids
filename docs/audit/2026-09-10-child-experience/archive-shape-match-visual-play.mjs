// Create one no-overwrite, self-hashed archive for the Shape Match audit batch.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../../..');
const archiveParent = 'C:\\Users\\HomeSeer\\OneDrive\\Documents\\Claude\\Projects\\Kids_App\\audit-evidence-archive';
const archiveName = '2026-09-10-shape-match-visual-play-01a08db0';
const target = path.join(archiveParent, archiveName);
if (path.dirname(target) !== archiveParent || path.basename(target) !== archiveName) throw new Error(`unsafe archive target ${target}`);
if (!existsSync(archiveParent) || !statSync(archiveParent).isDirectory()) throw new Error(`archive parent missing ${archiveParent}`);
if (existsSync(target)) throw new Error(`archive already exists; refusing overwrite: ${target}`);

const sources = [
  'games/shape-match.html',
  'tests/e2e/shape-match-visual-play.mjs',
  'docs/audit/2026-09-10-child-experience/archive-shape-match-visual-play.mjs',
  'docs/audit/2026-09-10-child-experience/record-shape-match-visual-play.mjs',
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

const outputRoot = path.join(root, 'tests/e2e/out/shape-match-visual-play');
if (!existsSync(path.join(outputRoot, 'report.json'))) throw new Error('final report missing');
for (const file of filesUnder(outputRoot)) sources.push(path.relative(root, file).replaceAll('\\', '/'));
if (new Set(sources).size !== sources.length) throw new Error('duplicate archive source');

mkdirSync(target);
for (const relative of sources) {
  const source = path.join(root, relative);
  if (!existsSync(source) || !statSync(source).isFile()) throw new Error(`source missing ${relative}`);
  const destination = path.join(target, relative);
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
const report = JSON.parse(readFileSync(path.join(outputRoot, 'report.json'), 'utf8'));
const screenshotCount = filesUnder(path.join(outputRoot, 'screenshots')).length;
const sheetCount = filesUnder(path.join(outputRoot, 'contact-sheets')).length;
if (screenshotCount !== 104 || sheetCount !== 4) throw new Error(`unexpected image counts ${screenshotCount}/${sheetCount}`);

const readme = `# Kids Shape Match visual/play evidence — 2026-09-10

1. Accepted product baseline: \`3683e2028044ba1812a1c44202725ffbb1858d5b\`.
2. Clean audit start: \`77b84c1284c53617c93d0d6444480b3cd24c707f\`.
3. Audit evidence commit: \`${commit}\`.
4. Branch: \`${branch}\`.
5. Scope: Shape Match T1-T10 on desktop 1280x900 and touch-phone 390x844, nine complete rounds plus post-reward recovery per row.
6. Focused runner: 20/20 rows passed; ${report.counts.pass} PASS / ${report.counts.fail} FAIL / ${report.counts.na} NA / ${report.counts.blk} pre-review visual BLK across its six focused dimensions.
7. Visual evidence: ${screenshotCount} unique screenshots and ${sheetCount} contact sheets were inspected.
8. Confirmed P2: the earned-ribbon notice covers the activity title on phone T3-T10; no product fix was authorized or made.
9. Guarded import: 63 BLK to PASS, 8 BLK to FAIL, 40 BLK to NA; second run changed zero.
10. Final canonical ledger: 9,090 PASS / 24 FAIL / 3,972 BLK / 3,414 NA; 52 PASS / 24 FAIL / 584 BLK rows; 60 COMPLETE / 600 PARTIAL.
11. Full project suite: 334 tests, 325 pass / 9 known Bubble Pop failures / 0 skip; not green.
12. Synthetic profiles and silent local speech stubs only; no real child/family state or audible/provider claim.
13. No Bubble Pop or Animal Sounds clip generation, production/main, push, merge, deploy/promote, credentials, PII, paid call, security gate or remote write.
14. \`SHA256SUMS\` covers every other archive file; paths are relative to this archive root.
`;
const verification = `Focused Shape Match runner: 20 rows, 56 PASS, 0 FAIL, 44 NA, 20 visual placeholders pending inspection.\nRepeated play: 9 full rounds plus post-reward recovery per row; all available tier modes exercised.\nVisual review: 104 unique screenshots and 4 contact sheets inspected.\nConfirmed finding: phone T3-T10 reward notice covers the Shape Match title.\nGuarded importer first run: 63 BLK->PASS, 8 BLK->FAIL, 40 BLK->NA.\nGuarded importer second run: 0 changes.\nFull project suite: 334 tests, 325 pass, 9 known Bubble Pop failures, 0 skip.\nFinal ledger: 9090 PASS, 24 FAIL, 3972 BLK, 3414 NA; 60 COMPLETE, 600 PARTIAL.\n`;
writeFileSync(path.join(target, 'README.md'), readme);
writeFileSync(path.join(target, 'verification.txt'), verification);

const payload = filesUnder(target).map(file => path.relative(target, file).replaceAll('\\', '/')).sort();
const hashes = payload.map(relative => {
  const digest = createHash('sha256').update(readFileSync(path.join(target, relative))).digest('hex');
  return `${digest}  ${relative}`;
});
writeFileSync(path.join(target, 'SHA256SUMS'), hashes.join('\n') + '\n');

const manifest = new Map(hashes.map(line => [line.slice(66), line.slice(0, 64)]));
const actual = filesUnder(target).map(file => path.relative(target, file).replaceAll('\\', '/')).sort();
const extras = actual.filter(relative => relative !== 'SHA256SUMS' && !manifest.has(relative));
const missing = [...manifest.keys()].filter(relative => !actual.includes(relative));
const mismatches = [...manifest].filter(([relative, digest]) => createHash('sha256').update(readFileSync(path.join(target, relative))).digest('hex') !== digest);
if (extras.length || missing.length || mismatches.length || actual.length !== payload.length + 1) throw new Error(`archive verification failed extras=${extras.length} missing=${missing.length} mismatches=${mismatches.length}`);
const bytes = actual.reduce((sum, relative) => sum + statSync(path.join(target, relative)).size, 0);
console.log(JSON.stringify({ target, manifestEntries: manifest.size, totalFiles: actual.length, totalBytes: bytes, extras: 0, missing: 0, mismatches: 0 }));
