// One-shot no-overwrite archive for the 22bc Count Along audit.
import { createHash } from 'node:crypto';
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const target = 'C:\\Users\\HomeSeer\\OneDrive\\Documents\\Claude\\Projects\\Kids_App\\audit-evidence-archive\\2026-09-11-count-along-22bc';
const entries = [
  'learning/count-along.html',
  'js/profiles.js',
  'js/achievement-defs.js',
  'js/progress.js',
  'tests/e2e/count-along-visual-play.mjs',
  'tests/e2e/out/count-along-visual-play',
  'docs/audit/2026-09-10-child-experience/README.md',
  'docs/audit/2026-09-10-child-experience/baseline-observations.md',
  'docs/audit/2026-09-10-child-experience/coverage.json',
  'docs/audit/2026-09-10-child-experience/record-count-along-visual-play.mjs',
  'docs/audit/2026-09-10-child-experience/archive-count-along-22bc.mjs',
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
if (!files.length || new Set(files.map(file => file.toLowerCase())).size !== files.length) throw new Error('empty or duplicate archive source list');

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
mkdirSync(target, { recursive: false });
for (const relative of files) {
  const destination = path.join(target, relative);
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(path.join(root, relative), destination, constants.COPYFILE_EXCL);
}
writeFileSync(path.join(target, 'README.md'), `# Kids Count Along audit evidence - 2026-09-11

1. Clean starting commit: 789d20f844966358138121794b0b67bee13aa91a.
2. Archived evidence commit: ${commit}.
3. Count Along: 20/20 T1-T10 phone/desktop rows, 142 main rounds, 116 PASS / 4 FAIL across the six adjudicated dimensions and 102 main renders.
4. Extra geometry: eight T2/T4/T7/T10 short-phone/tablet probes, 24 rounds and 24 renders; five probes pass, with the expected T2 target and T4 setting failures.
5. Findings: T4 how-many setting is dead on phone/desktop/short-phone/tablet; T1-T2 phone tappable digit 1 is below 44px, confirmed at 42px on 390x844 and 39px on 320x568.
6. Ledger: 9,801 PASS / 20 FAIL / 3,105 BLK / 3,574 NA; 216 PASS / 20 FAIL / 424 BLK rows; 220 COMPLETE / 440 PARTIAL.
7. Full suite: 423 tests, 414 pass / nine already-ledgered Bubble Pop guidance failures / 0 skip; intentionally not green.
8. Browser emulation and silent media stubs do not prove physical child touch, human-audible quality or provider behavior.
9. No product fix, production/main, push, merge, deploy/promote, secrets, PII, paid/provider, gate/security or remote-data action.
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
