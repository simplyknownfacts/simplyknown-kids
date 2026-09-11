// One-shot no-overwrite archive for the b44d Math repair and Clock audit.
import { createHash } from 'node:crypto';
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const target = 'C:\\Users\\HomeSeer\\OneDrive\\Documents\\Claude\\Projects\\Kids_App\\audit-evidence-archive\\2026-09-11-math-repair-clock-audit-b44d';
const entries = [
  'learning/math.html',
  'learning/clock.html',
  'js/celebrate.js',
  'js/profiles.js',
  'js/progress.js',
  'js/achievement-defs.js',
  'tests/math-layout.test.mjs',
  'tests/e2e/math-visual-play.mjs',
  'tests/e2e/out/math-visual-play',
  'tests/e2e/clock-visual-play.mjs',
  'tests/e2e/out/clock-visual-play',
  'docs/audit/2026-09-10-child-experience/README.md',
  'docs/audit/2026-09-10-child-experience/matrix.md',
  'docs/audit/2026-09-10-child-experience/baseline-observations.md',
  'docs/audit/2026-09-10-child-experience/coverage.json',
  'docs/audit/2026-09-10-child-experience/record-math-repair-clock-visual-play.mjs',
  'docs/audit/2026-09-10-child-experience/archive-math-repair-clock-b44d.mjs',
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
writeFileSync(path.join(target, 'README.md'), `# Kids Math repair and Clock visual/play audit evidence - 2026-09-11

1. Authorized clean starting commit: ddb34d883107b3762347eb9ae6c4b988560e4757; accepted Math repair: 48fed5da63794cc0bb44cdc7a960f021489d9591; archived checkout commit at capture: ${commit}.
2. Math: red proof reproduced 13 phone failures; focused final proof passed 18/18, and full play passed 20/20 rows plus 8/8 probes, 160 correct answers and 212 inspected renders with zero reward or responsive overlap.
3. Independent Math review accepted exact 48fed5d with no P1/P2 after independently repeating the focused, full and automatic-fade proof.
4. Clock: 20/20 T1-T10 phone/desktop rows, 240 correct answers, every minute mode, negative/rapid/exact-once input, PIN settings, persistence, rewards, navigation, reload and repeated play passed.
5. Clock report-only findings: the reward notice covers the title on T3-T10 phone; the settings gear covers one answer in sampled T4/T6/T10 320x568 states. No Clock product repair was made.
6. Clock evidence contains 192 inspected renders and 8/8 behaviorally passing responsive probes.
7. Ledger: 10,161 PASS / 44 FAIL / 2,721 BLK / 3,574 NA; 272 PASS / 44 FAIL / 344 BLK rows; 300 COMPLETE / 360 PARTIAL.
8. Browser emulation does not prove physical child touch or human-audible quality.
9. No production/main, push, merge, deploy/promote, secrets, PII, paid/provider, gate/security, remote-data, task archival or worktree deletion action.
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
