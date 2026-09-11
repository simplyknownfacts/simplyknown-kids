// Create one durable, non-overwriting evidence archive and verify every copied byte.
import { createHash } from 'node:crypto';
import { constants, copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const archiveRoot = 'C:\\Users\\HomeSeer\\OneDrive\\Documents\\Claude\\Projects\\Kids_App\\audit-evidence-archive';
const destination = path.join(archiveRoot, '2026-09-11-clock-repair-spelling-audit-005a-authoritative');
const sources = [
  'learning/clock.html',
  'learning/spelling.html',
  'tests/clock-layout.test.mjs',
  'tests/spelling-layout.test.mjs',
  'tests/e2e/clock-visual-play.mjs',
  'tests/e2e/spelling-visual-play.mjs',
  'tests/e2e/out/clock-visual-play',
  'tests/e2e/out/spelling-visual-play',
  'docs/audit/2026-09-10-child-experience/coverage.json',
  'docs/audit/2026-09-10-child-experience/baseline-observations.md',
  'docs/audit/2026-09-10-child-experience/record-clock-repair-spelling-audit.mjs',
  'docs/audit/2026-09-10-child-experience/verification-clock-repair-spelling-005a.txt',
  'docs/audit/2026-09-10-child-experience/archive-clock-repair-spelling-005a.mjs',
];
const files = [];
function collect(relative) {
  const source = path.join(root, relative);
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`refusing link/reparse source: ${relative}`);
  if (stat.isDirectory()) {
    for (const name of readdirSync(source).sort()) collect(path.join(relative, name));
  } else if (stat.isFile()) files.push(relative);
  else throw new Error(`refusing non-file source: ${relative}`);
}
for (const source of sources) collect(source);
if (path.dirname(destination) !== archiveRoot || path.basename(destination) !== '2026-09-11-clock-repair-spelling-audit-005a-authoritative') throw new Error('unsafe archive destination');
mkdirSync(destination, { recursive: false });
const manifest = [];
let payloadBytes = 0;
for (const relative of files) {
  const source = path.join(root, relative);
  const target = path.join(destination, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(source, target, constants.COPYFILE_EXCL);
  const sourceBytes = readFileSync(source);
  const targetBytes = readFileSync(target);
  const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');
  const targetHash = createHash('sha256').update(targetBytes).digest('hex');
  if (sourceHash !== targetHash || sourceBytes.length !== targetBytes.length) throw new Error(`copy mismatch: ${relative}`);
  payloadBytes += targetBytes.length;
  manifest.push(`${targetHash}  ${relative.replaceAll('\\', '/')}`);
}
writeFileSync(path.join(destination, 'SHA256SUMS'), manifest.join('\n') + '\n', { flag: 'wx' });
console.log(JSON.stringify({ destination, payloadFiles: files.length, payloadBytes, manifestSha256: createHash('sha256').update(readFileSync(path.join(destination, 'SHA256SUMS'))).digest('hex') }));
