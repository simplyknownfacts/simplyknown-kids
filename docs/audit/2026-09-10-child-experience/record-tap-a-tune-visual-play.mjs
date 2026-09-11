import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const dir=import.meta.dirname, root=path.resolve(dir,'../../..'), coveragePath=path.join(dir,'coverage.json');
const mainBytes=readFileSync(path.join(root,'tests/e2e/out/tap-a-tune-visual-play/report.json'));
const responsiveBytes=readFileSync(path.join(root,'tests/e2e/out/tap-a-tune-visual-play-responsive/report.json'));
const hash=b=>createHash('sha256').update(b).digest('hex');
if(hash(mainBytes)!=='c0ad367673135738e9d6faa545f4a91cefb5751c23ef5155b5d0c6169da7a5bb'||hash(responsiveBytes)!=='99361c7c587c2730e9953cbbc9c5a6760a39fbd45993c9ebcc176bd60c450c6c')throw new Error('Tap-a-Tune report hash changed');
const report=JSON.parse(mainBytes), responsive=JSON.parse(responsiveBytes), coverage=JSON.parse(readFileSync(coveragePath,'utf8'));
function totals(rows){const dimensions={PASS:0,FAIL:0,BLK:0,NA:0},verdicts={PASS:0,FAIL:0,BLK:0},execution={};for(const r of rows){verdicts[r.verdict]++;execution[r.execution]=(execution[r.execution]||0)+1;for(const s of Object.values(r.checks))dimensions[s]++;}return{dimensions,verdicts,execution}}
const oldTotals=JSON.stringify({dimensions:{PASS:9341,FAIL:16,BLK:3649,NA:3494},verdicts:{PASS:120,FAIL:16,BLK:524},execution:{PARTIAL:540,COMPLETE:120}});
const newTotals=JSON.stringify({dimensions:{PASS:9436,FAIL:17,BLK:3513,NA:3534},verdicts:{PASS:139,FAIL:17,BLK:504},execution:{PARTIAL:520,COMPLETE:140}});
if(![oldTotals,newTotals].includes(JSON.stringify(totals(coverage.rows))))throw new Error('unexpected ledger baseline');
if(report.auditStart!=='289191dddf8ecef2ec1a3a091bbcbef461687fc5'||report.tapATuneSha256!=='4fdc818be542b84b9ad451569b5e8bc250bda1cbb0101fa50dd60fbeff8ed716'||JSON.stringify(report.counts)!==JSON.stringify({rows:20,pass:60,fail:0,na:40,blk:20})||report.rows.reduce((n,r)=>n+r.screenshotCount,0)!==100)throw new Error('main report identity changed');
const short=responsive.rows.find(r=>r.id==='tap-a-tune:T10:short-phone'), tablet=responsive.rows.find(r=>r.id==='tap-a-tune:T10:tablet');
if(short?.geometry?.minTarget!==43.328125||short.geometry.clipped!==0||short.geometry.overflow!==0||!short.fatal?.includes('bad geometry')||tablet?.fatal)throw new Error('responsive evidence changed');
let changed=0; const evidence='baseline-observations.md#tap-a-tune-visualplay-audit-at-289191d';
for(const result of report.rows){const row=coverage.rows.find(r=>r.id===result.id);if(!row||row.route!=='/games/tap-a-tune.html'||result.fatal||result.free!==8||!result.recovered||result.geometry.minTarget<44||result.geometry.clipped||result.errors.length||result.failed.length)throw new Error(`bad row ${result.id}`);if(result.tier>=3&&(!result.songs.length||!result.songs[0].wrongRecovered))throw new Error(`missing song ${result.id}`);if(result.tier>=7&&!result.memory?.busyProtected)throw new Error(`missing memory ${result.id}`);
  const desired={progression:'PASS',score:'NA',rewards:'PASS',restart:'NA',long_repeated_play:'PASS',visual_quality:result.id==='tap-a-tune:T10:phone'?'FAIL':'PASS'};if(result.tier>=3)desired.wrong_answers='PASS';for(const [k,v]of Object.entries(desired)){if(row.checks[k]==='BLK'){row.checks[k]=v;changed++}else if(row.checks[k]!==v)throw new Error(`bad prior ${result.id}:${k}`)}row.execution='COMPLETE';row.verdict=result.id==='tap-a-tune:T10:phone'?'FAIL':'PASS';row.reason=row.verdict==='FAIL'?'Tap-a-Tune play is complete; the 320x568 piano pads remain below the 44px child-target floor.':'All applicable Tap-a-Tune play, mode, reward and reviewed visual dimensions are complete.';if(!row.evidence.includes(evidence))row.evidence.push(evidence)}
if(![0,136].includes(changed))throw new Error(`unexpected changes ${changed}`);const after=totals(coverage.rows);if(JSON.stringify(after)!==newTotals)throw new Error(`unexpected totals ${JSON.stringify(after)}`);writeFileSync(coveragePath,JSON.stringify(coverage,null,2)+'\n');console.log(JSON.stringify({changed,...after}));
