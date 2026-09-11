// One-shot no-overwrite archive for the cbcb Days visual/play audit.
import { createHash } from 'node:crypto';
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const target = 'C:\\Users\\HomeSeer\\OneDrive\\Documents\\Claude\\Projects\\Kids_App\\audit-evidence-archive\\2026-09-11-days-audit-cbcb';
const entries = [
  'learning/days.html',
  'js/profiles.js',
  'tests/e2e/days-visual-play.mjs',
  'tests/e2e/out/days-visual-play',
  'docs/audit/2026-09-10-child-experience/README.md',
  'docs/audit/2026-09-10-child-experience/matrix.md',
  'docs/audit/2026-09-10-child-experience/baseline-observations.md',
  'docs/audit/2026-09-10-child-experience/coverage.json',
  'docs/audit/2026-09-10-child-experience/record-days-visual-play.mjs',
  'docs/audit/2026-09-10-child-experience/archive-days-audit-cbcb.mjs',
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
writeFileSync(path.join(target, 'README.md'), `# Kids Days visual/play audit evidence - 2026-09-11

1. Authorized clean starting commit: 888bed870999f655f8bd87baf497daffca2af5b4; archived checkout commit at capture: ${commit}.
2. Days: 20/20 T1-T10 phone/desktop rows, 160 recorded correct answers, eight responsive probes, 24 probe rounds and 180 inspected renders.
3. Every row exercised wrong-to-correct recovery, rapid correct/wrong input, exact-once progress, settings where required, reload, hub navigation, return, persistence and one repeat reward.
4. Finding: report-only P2 on T3-T10 phone; the reward notice overlaps the centered Days title by about 151x45px. Desktop and deferred T1-T2 phone rewards do not overlap.
5. Ledger: 9,969 PASS / 44 FAIL / 2,913 BLK / 3,574 NA; 232 PASS / 44 FAIL / 384 BLK rows; 260 COMPLETE / 400 PARTIAL.
6. Full suite: 449 tests, 440 pass / nine already-ledgered Bubble Pop guidance failures / zero skipped; intentionally not green.
7. Browser emulation and silent media handling do not prove physical child touch, human-audible quality or provider behavior.
8. No product repair, production/main, push, merge, deploy/promote, secrets, PII, paid/provider, gate/security, remote-data, task archival or worktree deletion action.
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
