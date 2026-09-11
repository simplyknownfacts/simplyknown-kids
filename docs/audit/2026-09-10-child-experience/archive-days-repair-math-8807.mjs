// One-shot no-overwrite archive for the 8807 Days repair and Math audit.
import { createHash } from 'node:crypto';
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const target = 'C:\\Users\\HomeSeer\\OneDrive\\Documents\\Claude\\Projects\\Kids_App\\audit-evidence-archive\\2026-09-11-days-repair-math-audit-8807';
const entries = [
  'learning/days.html',
  'learning/math.html',
  'js/celebrate.js',
  'js/profiles.js',
  'js/progress.js',
  'js/achievement-defs.js',
  'tests/days-notice-layout.test.mjs',
  'docs/verify/shots/days-notice/green-8807-auto',
  'tests/e2e/days-visual-play.mjs',
  'tests/e2e/out/days-visual-play',
  'tests/e2e/math-visual-play.mjs',
  'tests/e2e/out/math-visual-play',
  'docs/audit/2026-09-10-child-experience/README.md',
  'docs/audit/2026-09-10-child-experience/matrix.md',
  'docs/audit/2026-09-10-child-experience/baseline-observations.md',
  'docs/audit/2026-09-10-child-experience/coverage.json',
  'docs/audit/2026-09-10-child-experience/record-days-repair-math-visual-play.mjs',
  'docs/audit/2026-09-10-child-experience/archive-days-repair-math-8807.mjs',
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
writeFileSync(path.join(target, 'README.md'), `# Kids Days repair and Math visual/play audit evidence - 2026-09-11

1. Authorized clean starting commit: 9140ce8e04b0999fabeb6b285f7bd35cbda4b90e; accepted Days repair: a23a0ea4ef49c2ddb79e62fbfb382fd98b1efde7; archived checkout commit at capture: ${commit}.
2. Days: red proof reproduced eight T3-T10 phone reward/title failures; final focused proof passed 13/13, and full play passed 20/20 rows plus 8/8 probes, 160 correct answers and 180 inspected renders with zero reward overlap.
3. Independent Days review first found the automatic-fade replay collision, then accepted exact a23a0ea with no remaining P1/P2 after the transition fix.
4. Math: 20/20 T1-T10 phone/desktop rows, 160 correct answers, all six operation/missing-number modes, exact progress, wrong recovery, settings persistence, rewards, navigation, reload and repeated play passed.
5. Math finding: the reward notice covers the title on T3-T10 phone. Responsive finding: the settings gear covers an answer choice in tested T6/T8/T10 320x568 probes. No Math product repair was made.
6. Math evidence contains 212 inspected renders; 5/8 responsive probes pass, with only the documented three short-phone visual probes failing.
7. Ledger: 10,061 PASS / 44 FAIL / 2,821 BLK / 3,574 NA; 252 PASS / 44 FAIL / 364 BLK rows; 280 COMPLETE / 380 PARTIAL.
8. Full suite: 462 tests, 453 pass / nine already-ledgered Bubble Pop guidance failures / zero skipped; intentionally not green.
9. Browser emulation and silent media handling do not prove physical child touch, human-audible quality or provider behavior.
10. No Math repair, production/main, push, merge, deploy/promote, secrets, PII, paid/provider, gate/security, remote-data, task archival or worktree deletion action.
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
