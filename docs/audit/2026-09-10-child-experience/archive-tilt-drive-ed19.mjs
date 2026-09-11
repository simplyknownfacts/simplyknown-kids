// One-shot no-overwrite archive for the ed19 Tilt Drive audit.
import { createHash } from 'node:crypto';
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const target = 'C:\\Users\\HomeSeer\\OneDrive\\Documents\\Claude\\Projects\\Kids_App\\audit-evidence-archive\\2026-09-11-tilt-drive-ed19';
const entries = [
  'games/tilt-drive.html',
  'tests/e2e/tilt-drive-visual-play.mjs',
  'tests/e2e/out/tilt-drive-visual-play',
  'docs/audit/2026-09-10-child-experience/README.md',
  'docs/audit/2026-09-10-child-experience/baseline-observations.md',
  'docs/audit/2026-09-10-child-experience/coverage.json',
  'docs/audit/2026-09-10-child-experience/record-tilt-drive-visual-play.mjs',
  'docs/audit/2026-09-10-child-experience/archive-tilt-drive-ed19.mjs',
];

if (existsSync(target)) throw new Error(`refusing to overwrite archive: ${target}`);
const files = [];
function collect(relative) {
  const source = path.join(root, relative);
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`refusing reparse source: ${relative}`);
  if (stat.isDirectory()) {
    for (const name of readdirSync(source).sort()) collect(path.join(relative, name));
  } else if (stat.isFile()) files.push(relative);
  else throw new Error(`unsupported source type: ${relative}`);
}
for (const entry of entries) collect(entry);
if (!files.length || new Set(files.map(file => file.toLowerCase())).size !== files.length) {
  throw new Error('empty or duplicate archive source list');
}

mkdirSync(target, { recursive: false });
for (const relative of files) {
  const destination = path.join(target, relative);
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(path.join(root, relative), destination, constants.COPYFILE_EXCL);
}
writeFileSync(path.join(target, 'README.md'), `# Kids Tilt Drive audit evidence - 2026-09-11

1. Clean start: 0c6d9e5cec3f0f49bea623dce561c9b727bbffa9.
2. Audit evidence commit: d8a83cd60e0fd17b60e85b7e17389756df61eccd.
3. Focused run: 20/20 rows, 80 scored crashes, 100 PASS / 40 FAIL / 20 visual placeholders, 140 inspected renders.
4. Findings: P2 false tilt instruction when motion is unavailable; P2 invalid gamma poisons steering until reload. No product repair authorized or made.
5. Ledger: 9,597 PASS / 56 FAIL / 3,273 BLK / 3,574 NA; 180 COMPLETE / 480 PARTIAL.
6. Full suite: 408 pass / 9 known Bubble Pop fail / 0 skip; intentionally not green.
7. Browser-emulated orientation and pointer input do not prove a physical-device sensor, iOS permission UI or a child's real touch.
8. No production/main, push, merge, deploy/promote, secrets, PII, paid/provider, gate/security or remote-data action.
`);
writeFileSync(path.join(target, 'verification.txt'), 'Archive created without overwrite from the owned Kids checkout. Independent manifest verification is required before relying on counts or hashes.\n');

const archived = [];
function collectArchived(directory, relative = '') {
  for (const name of readdirSync(directory).sort()) {
    if (relative === '' && name === 'SHA256SUMS') continue;
    const childRelative = path.join(relative, name);
    const full = path.join(directory, name);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) throw new Error(`archive contains reparse point: ${childRelative}`);
    if (stat.isDirectory()) collectArchived(full, childRelative);
    else if (stat.isFile()) archived.push(childRelative);
  }
}
collectArchived(target);
const lines = archived.sort((a, b) => a.localeCompare(b)).map(relative => {
  const hash = createHash('sha256').update(readFileSync(path.join(target, relative))).digest('hex');
  return `${hash}  ${relative.replaceAll('\\', '/')}`;
});
writeFileSync(path.join(target, 'SHA256SUMS'), lines.join('\n') + '\n');
console.log(JSON.stringify({ target, payloads: archived.length, totalFiles: archived.length + 1 }));
