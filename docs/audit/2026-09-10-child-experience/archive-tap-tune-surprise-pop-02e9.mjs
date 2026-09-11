// One-shot no-overwrite archive for the 02e9 Tap-a-Tune repair and Surprise Pop audit.
import { createHash } from 'node:crypto';
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const target = 'C:\\Users\\HomeSeer\\OneDrive\\Documents\\Claude\\Projects\\Kids_App\\audit-evidence-archive\\2026-09-11-tap-tune-surprise-pop-02e9';
const entries = [
  'games/tap-a-tune.html',
  'tests/tap-a-tune-layout.test.mjs',
  'tests/e2e/tap-a-tune-visual-play.mjs',
  'tests/e2e/surprise-pop-visual-play.mjs',
  'tests/e2e/out/tap-a-tune-visual-play-repair-red',
  'tests/e2e/out/tap-a-tune-visual-play-repair-green',
  'tests/e2e/out/tap-a-tune-visual-play-repair-full',
  'tests/e2e/out/surprise-pop-visual-play',
  'docs/audit/2026-09-10-child-experience/README.md',
  'docs/audit/2026-09-10-child-experience/baseline-observations.md',
  'docs/audit/2026-09-10-child-experience/coverage.json',
  'docs/audit/2026-09-10-child-experience/record-tap-a-tune-target-repair.mjs',
  'docs/audit/2026-09-10-child-experience/record-surprise-pop-visual-play.mjs',
  'docs/audit/2026-09-10-child-experience/archive-tap-tune-surprise-pop-02e9.mjs',
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
writeFileSync(path.join(target, 'README.md'), `# Kids Tap-a-Tune repair and Surprise Pop audit evidence - 2026-09-11

1. Clean start: 5116d5e7de76165cc1e96305c000da4b2263c31f.
2. Tap-a-Tune product: 45edc17709d5624213bae49ec568615b31acc028; evidence: e690d35c89d0fb6eaa66f090637b42b1e3f5c74d.
3. Tap-a-Tune independent exact-commit review: PASS, no P1/P2; full repair matrix 40/40 with 200 inspected renders and 44.15625px minimum target.
4. Surprise Pop audit: ea4cfd99a141ed50467171d244089031177437e4; 20/20 rows, 140 reveal cycles and 112 inspected renders; no new finding.
5. Ledger: 9,497 PASS / 16 FAIL / 3,413 BLK / 3,574 NA; 160 COMPLETE / 500 PARTIAL.
6. Full suite: 408 pass / 9 known Bubble Pop fail / 0 skip; intentionally not green.
7. Physical-device touch, human-audible quality and provider integrations remain unclaimed.
8. No product work beyond the Tap-a-Tune target repair; no production/main, push, merge, deploy/promote, secrets, PII, paid/provider, gate/security or remote-data action.
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
