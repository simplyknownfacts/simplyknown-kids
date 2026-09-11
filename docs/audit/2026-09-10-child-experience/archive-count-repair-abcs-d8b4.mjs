// One-shot no-overwrite archive for the d8b4 Count Along repair and ABCs audit.
import { createHash } from 'node:crypto';
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const target = 'C:\\Users\\HomeSeer\\OneDrive\\Documents\\Claude\\Projects\\Kids_App\\audit-evidence-archive\\2026-09-11-count-repair-abcs-d8b4';
const entries = [
  'learning/count-along.html',
  'learning/abcs.html',
  'js/profiles.js',
  'js/achievement-defs.js',
  'js/progress.js',
  'tests/count-along-mode-target.test.mjs',
  'tests/e2e/count-along-visual-play.mjs',
  'tests/e2e/out/count-along-visual-play',
  'tests/e2e/abcs-visual-play.mjs',
  'tests/e2e/out/abcs-visual-play',
  'docs/audit/2026-09-10-child-experience/README.md',
  'docs/audit/2026-09-10-child-experience/baseline-observations.md',
  'docs/audit/2026-09-10-child-experience/coverage.json',
  'docs/audit/2026-09-10-child-experience/record-count-repair-abcs-visual-play.mjs',
  'docs/audit/2026-09-10-child-experience/archive-count-repair-abcs-d8b4.mjs',
];

if (existsSync(target)) throw new Error(`refusing to overwrite archive: ${target}`);
const files = [];
function collect(relative) {
  const source = path.join(root, relative);
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`refusing reparse source: ${relative}`);
  if (stat.isDirectory()) for (const name of readdirSync(source).sort()) collect(path.join(relative, name));
  else if (stat.isFile()) files.push(relative);
  else throw new Error(`unsupported source type: ${relative}`);
}
for (const entry of entries) collect(entry);
if (!files.length || new Set(files.map(file => file.toLowerCase())).size !== files.length) throw new Error('empty or duplicate archive source list');

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
mkdirSync(target, { recursive: false });
for (const relative of files) {
  const destination = path.join(target, relative);
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(path.join(root, relative), destination, constants.COPYFILE_EXCL);
}
writeFileSync(path.join(target, 'README.md'), `# Kids Count Along repair and ABCs audit evidence - 2026-09-11

1. Authorized clean starting commit: dc703cd06247c0e0b1c99308fc1aa72cf899ffe0.
2. Count Along repair commit: d2467b97ee7db79863d76211eed8d360e35a01c7; archived checkout commit at capture: ${commit}.
3. Count Along: red proof reproduced four failures; green proof passed 26/26 focused checks, 20/20 T1-T10 phone/desktop rows, 120/120 checks, 142 main rounds, eight probes, 24 probe rounds and 126 inspected renders.
4. Independent Count Along review: no P1/P2 at exact d2467b9; focused 26/26, full 120/120, all 126 renders inspected.
5. ABCs: 20/20 T1-T10 phone/desktop rows, 20 full alphabet cycles, 640 recorded letter actions, 100 PASS / 20 reward FAIL, eight responsive probes and 167 inspected renders.
6. Finding: ABCs still advertises Word Builder mastery and tells the child to spell a short word, but spelling was removed and the activity has no mastery award path.
7. Ledger: 9,885 PASS / 36 FAIL / 3,005 BLK / 3,574 NA; 220 PASS / 36 FAIL / 404 BLK rows; 240 COMPLETE / 420 PARTIAL.
8. Full suite: 449 tests, 440 pass / nine already-ledgered Bubble Pop guidance failures / zero skipped; intentionally not green.
9. Browser emulation and silent media handling do not prove physical child touch, human-audible quality or provider behavior.
10. No ABCs product repair, production/main, push, merge, deploy/promote, secrets, PII, paid/provider, gate/security or remote-data action.
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
