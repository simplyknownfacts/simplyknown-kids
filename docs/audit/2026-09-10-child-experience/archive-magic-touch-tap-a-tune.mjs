import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'../../..');
const target='C:\\Users\\HomeSeer\\OneDrive\\Documents\\Claude\\Projects\\Kids_App\\audit-evidence-archive\\2026-09-11-magic-touch-tap-a-tune-5859';
if(existsSync(target))throw new Error(`refusing to overwrite ${target}`);
const sources=[
  'games/magic-touch.html',
  'games/tap-a-tune.html',
  'tests/magic-touch-repair.test.mjs',
  'tests/e2e/magic-touch-visual-play.mjs',
  'tests/e2e/tap-a-tune-visual-play.mjs',
  'tests/e2e/out/magic-touch-visual-play',
  'tests/e2e/out/tap-a-tune-visual-play',
  'tests/e2e/out/tap-a-tune-visual-play-responsive',
  'docs/verify/shots/magic-touch-repair/green',
  'docs/audit/2026-09-10-child-experience/README.md',
  'docs/audit/2026-09-10-child-experience/baseline-observations.md',
  'docs/audit/2026-09-10-child-experience/coverage.json',
  'docs/audit/2026-09-10-child-experience/record-magic-touch-repair.mjs',
  'docs/audit/2026-09-10-child-experience/record-tap-a-tune-visual-play.mjs',
  'docs/audit/2026-09-10-child-experience/archive-magic-touch-tap-a-tune.mjs',
];
function rejectLinks(p){const s=lstatSync(p);if(s.isSymbolicLink())throw new Error(`refusing link ${p}`);if(s.isDirectory())for(const n of readdirSync(p))rejectLinks(path.join(p,n));}
mkdirSync(target,{recursive:false});
for(const rel of sources){const src=path.join(root,rel);if(!existsSync(src))throw new Error(`missing ${rel}`);rejectLinks(src);const dst=path.join(target,rel);mkdirSync(path.dirname(dst),{recursive:true});cpSync(src,dst,{recursive:true,errorOnExist:true,force:false});}
writeFileSync(path.join(target,'README.md'),`# Kids Magic Touch repair and Tap-a-Tune audit evidence - 2026-09-11\n\n1. Clean start: a7c9ac06feba7a7a3d193583e4fd4669bfa8892f.\n2. Magic Touch product: e16d1f950c6ec8955087ebf5b44f5b912029b8a4.\n3. Magic Touch evidence: 289191dddf8ecef2ec1a3a091bbcbef461687fc5.\n4. Tap-a-Tune audit: 25d91aa35e9053df1c88d2faf23be412b0d532e8.\n5. Magic Touch exact-commit review: PASS, no P1/P2.\n6. Tap-a-Tune finding: P2, four 320x568 piano pads are 43.328px wide; no product repair authorized.\n7. Main Tap-a-Tune run: 20 rows, 100 renders, 60 PASS / 0 FAIL / 40 NA / 20 visual placeholders later inspected.\n8. Full project suite after Magic repair: 393 pass / 9 known Bubble Pop fail / 0 skip.\n9. No physical-device, human-audible, provider, production, push, merge, deploy or promote claim.\n`);
writeFileSync(path.join(target,'verification.txt'),'Archive created without overwrite from the owned Kids checkout. Independent manifest verification is required before relying on counts or hashes.\n');
function files(dir){const out=[];for(const n of readdirSync(dir)){const p=path.join(dir,n),s=lstatSync(p);if(s.isSymbolicLink())throw new Error(`link in archive ${p}`);if(s.isDirectory())out.push(...files(p));else out.push(p)}return out;}
const payload=files(target).sort((a,b)=>a.localeCompare(b));
const lines=payload.map(f=>`${createHash('sha256').update(readFileSync(f)).digest('hex')}  ${path.relative(target,f).replaceAll('\\','/')}`);
writeFileSync(path.join(target,'SHA256SUMS'),lines.join('\n')+'\n');
console.log(JSON.stringify({target,payloads:payload.length,payloadBytes:payload.reduce((n,f)=>n+lstatSync(f).size,0),manifestSha256:createHash('sha256').update(readFileSync(path.join(target,'SHA256SUMS'))).digest('hex')}));
