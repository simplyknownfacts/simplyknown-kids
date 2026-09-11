// Guarded import for visually reviewed screenshots and repeated rendering of
// the three untouched section hubs. Other accepted resilience is unchanged.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const auditDir=import.meta.dirname, root=path.resolve(auditDir,'../../..');
const report=JSON.parse(readFileSync(path.join(root,'tests/e2e/out/section-hub-visual-soak-20260910-01a08d94/report.json'),'utf8'));
const coveragePath=path.join(auditDir,'coverage.json'), coverage=JSON.parse(readFileSync(coveragePath,'utf8'));
const shots=path.join(root,'docs/verify/shots/audit-20260910-section-hub-visual-soak-01a08d94');
const evidence='baseline-observations.md#section-hub-visual-soak-75f5';
const routes=new Map([['games/index.html','games'],['learning/index.html','learning'],['art/index.html','art']]);

function totals(rows){const dimensions={PASS:0,FAIL:0,BLK:0,NA:0},verdicts={PASS:0,FAIL:0,BLK:0},execution={};for(const row of rows){verdicts[row.verdict]++;execution[row.execution]=(execution[row.execution]||0)+1;for(const status of Object.values(row.checks))dimensions[status]++;}return{dimensions,verdicts,execution};}
if(report.baseline!=='3683e2028044ba1812a1c44202725ffbb1858d5b')throw new Error(`wrong report baseline ${report.baseline}`);
if(JSON.stringify(report.counts)!==JSON.stringify({rows:60,pass:120,fail:0,blk:60}))throw new Error(`unexpected report totals ${JSON.stringify(report.counts)}`);
if(report.rows.length!==60||new Set(report.rows.map(row=>row.id)).size!==60)throw new Error('incomplete or duplicate report rows');
const expected=new Set();for(const route of routes.keys())for(let tier=1;tier<=10;tier++)for(const viewport of ['desktop','phone'])expected.add(`${route}:T${tier}:${viewport}`);
for(const row of report.rows){if(!expected.delete(row.id))throw new Error(`unexpected row ${row.id}`);if(row.checks.layout?.status!=='PASS'||row.checks.long_repeated_play?.status!=='PASS'||row.checks.visual_quality?.status!=='BLK')throw new Error(`unexpected checks in ${row.id}`);const short=routes.get(row.routeId);if(statSync(path.join(shots,`${short}-T${row.tier}-${row.viewport}.png`)).size<1000)throw new Error(`missing screenshot ${row.id}`);}
if(expected.size)throw new Error(`missing rows ${[...expected].join(', ')}`);for(const short of routes.values())for(const viewport of ['desktop','phone'])if(statSync(path.join(shots,`contact-${short}-${viewport}.png`)).size<1000)throw new Error(`missing contact sheet ${short}:${viewport}`);
const oldTotals=JSON.stringify({dimensions:{PASS:8907,FAIL:16,BLK:4203,NA:3374},verdicts:{PASS:40,FAIL:16,BLK:604},execution:{PARTIAL:620,COMPLETE:40}});
const newTotals=JSON.stringify({dimensions:{PASS:9027,FAIL:16,BLK:4083,NA:3374},verdicts:{PASS:40,FAIL:16,BLK:604},execution:{PARTIAL:620,COMPLETE:40}});
const before=totals(coverage.rows);if(![oldTotals,newTotals].includes(JSON.stringify(before)))throw new Error(`unexpected ledger baseline ${JSON.stringify(before)}`);
let changes=0;for(const result of report.rows){const row=coverage.rows.find(candidate=>candidate.id===result.id);if(!row||!routes.has(result.routeId))throw new Error(`invalid ledger row ${result.id}`);for(const dimension of ['long_repeated_play','visual_quality']){const prior=row.checks[dimension];if(prior==='BLK'){row.checks[dimension]='PASS';changes++;}else if(prior!=='PASS')throw new Error(`cannot accept ${result.id}:${dimension} over ${prior}`);}if(!row.evidence.includes(evidence))row.evidence.push(evidence);}
if(![0,120].includes(changes))throw new Error(`unexpected transitions ${changes}`);const after=totals(coverage.rows);if(JSON.stringify(after)!==newTotals)throw new Error(`unexpected final totals ${JSON.stringify(after)}`);
writeFileSync(coveragePath,JSON.stringify(coverage,null,2)+'\n');console.log(JSON.stringify({changes,...after}));
