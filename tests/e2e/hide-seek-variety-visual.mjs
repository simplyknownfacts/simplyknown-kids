import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT=path.resolve(import.meta.dirname,'../..');
const OUT=path.join(import.meta.dirname,'out','hide-seek-variety');
const CASES=[
  {tier:1,name:'phone',width:390,height:844},
  {tier:3,name:'phone',width:390,height:844},
  {tier:6,name:'phone',width:390,height:844},
  {tier:10,name:'phone',width:390,height:844},
  {tier:10,name:'short-phone',width:320,height:568},
  {tier:10,name:'desktop',width:1280,height:900},
];

async function freePort(){const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port}
function seed({tier}){const profile={id:`seek-visual-t${tier}`,name:'Seek Visual',birthday:'2020-01-01',color:'#4ECDC4',voice:'girl',mascot:{id:'bunny'},tierOverrides:{'peek-a-boo':tier},features:{},activitiesVisible:{'peek-a-boo':true},youtube:[]};localStorage.setItem('vb_profiles',JSON.stringify([profile]));localStorage.setItem('vb_active_id',profile.id);localStorage.setItem('vb_pin','1234');HTMLMediaElement.prototype.play=()=>Promise.resolve()}

if(path.dirname(OUT)!==path.join(ROOT,'tests','e2e','out')||path.basename(OUT)!=='hide-seek-variety')throw new Error(`unsafe output path ${OUT}`);
rmSync(OUT,{recursive:true,force:true});mkdirSync(OUT,{recursive:true});
const port=await freePort(),base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,[path.join(ROOT,'scripts','serve.mjs')],{cwd:ROOT,env:{...process.env,PORT:String(port)},stdio:'ignore'});
for(let attempt=0;attempt<50;attempt++){try{if((await fetch(base+'/__health.json')).ok)break}catch{}if(attempt===49)throw new Error('server unavailable');await new Promise(resolve=>setTimeout(resolve,100))}
const browser=await chromium.launch(),rows=[];
try{
  for(const item of CASES){
    const context=await browser.newContext({viewport:{width:item.width,height:item.height},isMobile:item.width<500,hasTouch:item.width<500,serviceWorkers:'block'});
    await context.addInitScript(seed,{tier:item.tier});
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+'/games/peek-a-boo.html',{waitUntil:'load'});
    await page.waitForFunction(()=>document.querySelector('#stage')?.dataset.renderer!=='loading');
    await page.waitForFunction(()=>document.querySelector('#roundAction')?.getAttribute('aria-disabled')==='false');
    await page.locator('#roundAction').click();
    await page.waitForFunction(()=>document.querySelector('#stage')?.dataset.phase==='seek');
    await page.waitForTimeout(250);
    const geometry=await page.evaluate(()=>{
      const stage=document.querySelector('#stage').getBoundingClientRect(),spots=[...document.querySelectorAll('.hiding-spot')].map((spot,index)=>{const box=spot.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2;return{index,left:box.left,top:box.top,right:box.right,bottom:box.bottom,width:box.width,height:box.height,reachable:document.elementFromPoint(x,y)?.closest('.hiding-spot')===spot,clue:[...spot.classList].filter(name=>name.startsWith('clue-'))}}),peekSpot=document.querySelector('.hiding-spot.has-peek'),peekBox=peekSpot?.querySelector('.peek-piece')?.getBoundingClientRect(),peekOwned=!!peekBox&&document.elementFromPoint(peekBox.left+peekBox.width/2,peekBox.top+peekBox.height/2)?.closest('.hiding-spot')===peekSpot;return{renderer:document.querySelector('#stage').dataset.renderer,phase:document.querySelector('#stage').dataset.phase,peekPart:document.querySelector('#stage').dataset.peekPart,hint:document.querySelector('#hint').textContent,stage:{left:stage.left,top:stage.top,right:stage.right,bottom:stage.bottom},spots,minTarget:Math.min(...spots.map(spot=>Math.min(spot.width,spot.height))),allInside:spots.every(spot=>spot.left>=stage.left-1&&spot.top>=stage.top-1&&spot.right<=stage.right+1&&spot.bottom<=stage.bottom+1),allReachable:spots.every(spot=>spot.reachable),peekOwned} });
    const file=path.join(OUT,`T${item.tier}-${item.name}-${item.width}x${item.height}.png`),files=[file];await page.screenshot({path:file});
    if(item.tier===1&&item.name==='phone')for(let round=2;round<=4;round++){
      const target=Number(await page.locator('.clue-glow').getAttribute('data-spot'));await page.locator('.hiding-spot').nth(target).click();
      await page.waitForFunction(()=>document.querySelector('#stage')?.dataset.phase==='found');await page.waitForTimeout(520);await page.locator('#playAgain').click();
      await page.waitForFunction(()=>document.querySelector('#stage')?.dataset.phase==='watch');await page.waitForTimeout(370);await page.locator('#roundAction').click();
      await page.waitForFunction(()=>document.querySelector('#stage')?.dataset.phase==='seek');await page.waitForTimeout(180);
      const part=await page.locator('#stage').getAttribute('data-peek-part'),extra=path.join(OUT,`T1-phone-round-${round}-${part}.png`);await page.screenshot({path:extra});files.push(extra);
    }
    rows.push({...item,file,files,errors,geometry,pass:errors.length===0&&geometry.renderer==='webgl'&&geometry.phase==='seek'&&geometry.spots.length===(item.tier<=2?4:item.tier<=4?6:item.tier<=6?8:item.tier<=8?10:12)&&geometry.minTarget>=44&&geometry.allInside&&geometry.allReachable&&geometry.peekOwned});
    await context.close();
  }
}finally{await browser.close();server.kill()}
const report={generatedAt:new Date().toISOString(),rows};writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({rows:rows.length,pass:rows.filter(row=>row.pass).length,fail:rows.filter(row=>!row.pass).map(row=>({tier:row.tier,name:row.name,errors:row.errors,minTarget:row.geometry.minTarget,inside:row.geometry.allInside,reachable:row.geometry.allReachable,peekOwned:row.geometry.peekOwned,renderer:row.geometry.renderer}))},null,2));
if(rows.some(row=>!row.pass))process.exitCode=1;
