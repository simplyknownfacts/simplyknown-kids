// One-shot no-overwrite archive for the 60a1 Tilt Drive repair and Hello Colors audit.
import { createHash } from 'node:crypto';
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const target = 'C:\\Users\\HomeSeer\\OneDrive\\Documents\\Claude\\Projects\\Kids_App\\audit-evidence-archive\\2026-09-11-tilt-drive-repair-hello-colors-60a1';
const entries = [
  'games/tilt-drive.html',
  'learning/hello-colors.html',
  'tests/tilt-drive-input.test.mjs',
  'tests/e2e/tilt-drive-visual-play.mjs',
  'tests/e2e/hello-colors-visual-play.mjs',
  'tests/e2e/out/tilt-drive-visual-play',
  'tests/e2e/out/hello-colors-visual-play',
  'docs/audit/2026-09-10-child-experience/README.md',
  'docs/audit/2026-09-10-child-experience/baseline-observations.md',
  'docs/audit/2026-09-10-child-experience/coverage.json',
  'docs/audit/2026-09-10-child-experience/record-tilt-drive-repair.mjs',
  'docs/audit/2026-09-10-child-experience/record-hello-colors-visual-play.mjs',
  'docs/audit/2026-09-10-child-experience/archive-tilt-repair-hello-colors-60a1.mjs',
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

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
mkdirSync(target, { recursive: false });
for (const relative of files) {
  const destination = path.join(target, relative);
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(path.join(root, relative), destination, constants.COPYFILE_EXCL);
}
writeFileSync(path.join(target, 'README.md'), `# Kids Tilt Drive repair and Hello Colors evidence - 2026-09-11

1. Clean starting commit: 17649521216a65adb01d727b622f88dc358f71ab.
2. Tilt Drive product commits: 12314eff5258a1969f3bb1d0d204d8bc243ab3d5 and b036b0e9ea91e81793f94ff4acf1d6d7058d6727.
3. Archived evidence commit: ${commit}.
4. Tilt Drive: 20/20 final phone/desktop rows, 140 PASS / 0 FAIL, 100 crashes, 140 renders; independent exact-commit re-review found no P1/P2.
5. Hello Colors: 20/20 phone/desktop rows, 120 PASS / 0 FAIL, 140 recorded rounds, 122 inspected renders; no product finding.
6. Ledger: 9,721 PASS / 16 FAIL / 3,189 BLK / 3,574 NA; 200 COMPLETE / 460 PARTIAL.
7. Full suite: 414 pass / 9 already-ledgered Bubble Pop guidance failures / 0 skip; intentionally not green.
8. Browser emulation does not prove physical sensors, iOS permission UI, child touch or human-audible quality.
9. No production/main, push, merge, deploy/promote, secrets, PII, paid/provider, gate/security or remote-data action.
`, { flag: 'wx' });
writeFileSync(path.join(target, 'verification.txt'), 'Archive created without overwrite from the owned Kids checkout. Independent manifest verification is required before relying on counts or hashes.\n', { flag: 'wx' });

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
writeFileSync(path.join(target, 'SHA256SUMS'), lines.join('\n') + '\n', { flag: 'wx' });
console.log(JSON.stringify({ target, payloads: archived.length, totalFiles: archived.length + 1 }));
