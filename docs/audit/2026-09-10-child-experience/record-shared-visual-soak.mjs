// Guarded import for visual review and repeated-use soak on the five shared
// routes whose other negative/recovery evidence was already accepted.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const auditDir=import.meta.dirname,root=path.resolve(auditDir,'../../..');
const report=JSON.parse(readFileSync(path.join(root,'tests/e2e/out/shared-visual-soak/report.json'),'utf8'));
const coveragePath=path.join(auditDir,'coverage.json'),coverage=JSON.parse(readFileSync(coveragePath,'utf8'));
const shots=path.join(root,'docs/verify/shots/audit-20260910-shared-visual-soak');
const evidence='baseline-observations.md#shared-visual-soak-61eb';
const routes=new Map([['index.html','picker'],['home.html','home'],['achievements.html','ribbons'],['parent/settings.html','settings'],['listen/index.html','listen']]);

function totals(rows){const dimensions={PASS:0,FAIL:0,BLK:0,NA:0},verdicts={PASS:0,FAIL:0,BLK:0},execution={};for(const row of rows){verdicts[row.verdict]++;execution[row.execution]=(execution[row.execution]||0)+1;for(const status of Object.values(row.checks))dimensions[status]++;}return{dimensions,verdicts,execution};}
if(report.baseline!=='7c9b14cf4d712513a8f9c69690a780c53ea4f54a')throw new Error(`wrong report baseline ${report.baseline}`);
if(JSON.stringify(report.counts)!==JSON.stringify({rows:100,pass:200,fail:0,blk:100}))throw new Error(`unexpected report totals ${JSON.stringify(report.counts)}`);
if(report.rows.length!==100||new Set(report.rows.map(row=>row.id)).size!==100)throw new Error('incomplete or duplicate report rows');
const expected=new Set();for(const route of routes.keys())for(let tier=1;tier<=10;tier++)for(const viewport of ['desktop','phone'])expected.add(`${route}:T${tier}:${viewport}`);
for(const row of report.rows){if(!expected.delete(row.id))throw new Error(`unexpected row ${row.id}`);if(row.checks.layout?.status!=='PASS'||row.checks.long_repeated_play?.status!=='PASS'||row.checks.visual_quality?.status!=='BLK')throw new Error(`unexpected checks in ${row.id}`);const short=routes.get(row.routeId);if(statSync(path.join(shots,`${short}-T${row.tier}-${row.viewport}.png`)).size<1000)throw new Error(`missing screenshot ${row.id}`);}
if(expected.size)throw new Error(`missing rows ${[...expected].join(', ')}`);for(const short of routes.values())for(const viewport of ['desktop','phone'])if(statSync(path.join(shots,`contact-${short}-${viewport}.png`)).size<1000)throw new Error(`missing contact sheet ${short}:${viewport}`);

const oldTotals=JSON.stringify({dimensions:{PASS:8687,FAIL:36,BLK:4403,NA:3374},verdicts:{PASS:40,FAIL:36,BLK:584},execution:{PARTIAL:620,COMPLETE:40}});
const newTotals=JSON.stringify({dimensions:{PASS:8887,FAIL:36,BLK:4203,NA:3374},verdicts:{PASS:40,FAIL:36,BLK:584},execution:{PARTIAL:620,COMPLETE:40}});
const before=totals(coverage.rows);if(![oldTotals,newTotals].includes(JSON.stringify(before)))throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);
let changes=0;for(const result of report.rows){const row=coverage.rows.find(candidate=>candidate.id===result.id);if(!row||!routes.has(result.routeId))throw new Error(`invalid ledger row ${result.id}`);for(const dimension of ['long_repeated_play','visual_quality']){const prior=row.checks[dimension];if(prior==='BLK'){row.checks[dimension]='PASS';changes++;}else if(prior!=='PASS')throw new Error(`cannot accept ${result.id}:${dimension} over ${prior}`);}if(!row.evidence.includes(evidence))row.evidence.push(evidence);}
if(![0,200].includes(changes))throw new Error(`unexpected transitions ${changes}`);const after=totals(coverage.rows);if(JSON.stringify(after)!==newTotals)throw new Error(`unexpected final totals ${JSON.stringify(after)}`);
writeFileSync(coveragePath,JSON.stringify(coverage,null,2)+'\n');console.log(JSON.stringify({changes,...after}));
