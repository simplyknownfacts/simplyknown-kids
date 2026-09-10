// Visual capture plus repeated-use soak for five already-behavior-tested
// shared routes. This deliberately does not repeat their accepted resilience checks.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.join(import.meta.dirname, 'out', 'shared-visual-soak');
const SHOTS = path.join(ROOT, 'docs', 'verify', 'shots', 'audit-20260910-shared-visual-soak');
const APP_BASELINE = '7c9b14cf4d712513a8f9c69690a780c53ea4f54a';
const VIEWPORTS = {
  desktop: { width:1280, height:900, isMobile:false, hasTouch:false },
  phone: { width:390, height:844, isMobile:true, hasTouch:true },
};
const ROUTES = [
  { id:'index.html', route:'/index.html', ready:'#profilesRow .avatar-btn', shot:'picker' },
  { id:'home.html', route:'/home.html', ready:'#worldScene .house', shot:'home' },
  { id:'achievements.html', route:'/achievements.html', ready:'#groups .gallery-group', shot:'ribbons' },
  { id:'parent/settings.html', route:'/parent/settings.html', ready:'#pinPad .pin-key', visual:'.overview-card', shot:'settings' },
  { id:'listen/index.html', route:'/listen/index.html', ready:'#sleepRow .sleep-btn', shot:'listen' },
];
const TIERS=[1,2,3,4,5,6,7,8,9,10];
const selectedTiers=process.env.TIERS?process.env.TIERS.split(',').map(Number):TIERS;
const selectedViewports=process.env.VIEWPORTS?process.env.VIEWPORTS.split(','):Object.keys(VIEWPORTS);
const selectedRoutes=process.env.SHARED?process.env.SHARED.split(','):ROUTES.map(route=>route.id);
const pass=note=>({status:'PASS',note}); const fail=note=>({status:'FAIL',note});

async function freePort(){const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function health(base){const r=await fetch(base+'/__health.json');if(!r.ok)throw new Error(`health ${r.status}`);const j=await r.json();if(j.app!=='kids')throw new Error(`wrong app ${j.app}`);}
function birthdayForTier(tier){const months={1:6,2:18,3:30,4:42,5:54,6:66,7:78,8:90,9:102,10:114}[tier];const d=new Date();d.setDate(15);d.setMonth(d.getMonth()-months);return d.toISOString().slice(0,10);}
function seed(){return({tier,birthday})=>{const a={unlocked:{'tap-pop.first':{at:1}},counters:{'tap-pop':1},repeats:{},streak:{},xp:1,rank:'seedling'};const p={id:`soak-t${tier}`,name:`Explorer${tier}`,birthday,color:'#4ECDC4',voice:'girl',mascot:{id:'bunny'},tierOverrides:{},features:{},activitiesVisible:{},youtube:[],achievements:a};if(!localStorage.getItem('vb_profiles'))localStorage.setItem('vb_profiles',JSON.stringify([p]));if(!localStorage.getItem('vb_active_id'))localStorage.setItem('vb_active_id',p.id);if(!localStorage.getItem('vb_pin'))localStorage.setItem('vb_pin','1234');localStorage.removeItem('vb_pin_lockout');try{HTMLMediaElement.prototype.play=()=>Promise.resolve();}catch{}};}
async function visit(page,base,route){await page.goto(base+route.route,{waitUntil:'domcontentloaded',timeout:20000});await page.locator(route.ready).first().waitFor({timeout:12000});}
async function unlock(page){if(await page.locator('#mainSettings').isVisible())return;for(const d of ['1','2','3','4']){const keys=page.locator('#pinPad .pin-key');const labels=(await keys.allTextContents()).map(x=>x.trim());await keys.nth(labels.indexOf(d)).click();}await page.locator('#mainSettings').waitFor({state:'visible'});}
async function geometry(page,route){return page.evaluate(({ready})=>{const nodes=[...document.querySelectorAll(ready)].filter(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';});const first=nodes[0]?.getBoundingClientRect();const firstIntersects=!!first&&first.right>0&&first.bottom>0&&first.left<innerWidth&&first.top<innerHeight;return{overflow:document.documentElement.scrollWidth-innerWidth,visible:nodes.length,firstIntersects,width:innerWidth,height:innerHeight};},{ready:route.visual||route.ready});}

async function soak(page,base,route){
  if(route.id==='index.html'){
    for(let i=0;i<20;i++){await page.locator('#profilesRow .avatar-btn').first().click();await page.waitForURL(/\/home\.html$/);await visit(page,base,route);}
    return await page.locator('#profilesRow .avatar-btn').count()===1?pass('twenty profile-selection cycles preserved one usable synthetic child'):fail('profile soak changed the child count');
  }
  if(route.id==='home.html'){
    for(let i=0;i<20;i++){await page.locator('#ribbonLink').click();await page.waitForURL(/\/achievements\.html$/);await page.locator('.nav-chrome .back-btn').click();await page.waitForURL(/\/home\.html$/);await page.locator('#worldScene .house').first().waitFor();}
    return pass('twenty child-home to ribbon-gallery round trips stayed usable');
  }
  if(route.id==='achievements.html'){
    for(let i=0;i<20;i++){await page.locator('.nav-chrome .home-btn').click();await page.waitForURL(/\/home\.html$/);await visit(page,base,route);}
    const ribbons=await page.locator('[aria-label^="Earned ribbon: First Bubble Pop"]').count();
    return ribbons===1?pass('twenty gallery re-entries preserved exactly one earned ribbon'):fail(`gallery soak rendered ${ribbons} earned ribbons`);
  }
  if(route.id==='parent/settings.html'){
    await unlock(page);
    const keys=['activities','voice','children','sync','overview'];
    for(let i=0;i<100;i++)await page.evaluate(key=>showPanel(key,false),keys[i%keys.length]);
    const active=await page.locator('.settings-panel.active:visible').count();
    return active===1?pass('one hundred settings-panel transitions left exactly one active panel'):fail(`settings soak left ${active} active panels`);
  }
  for(let i=0;i<50;i++){await page.locator('.sleep-btn[data-mins="5"]').click();await page.locator('.sleep-btn[data-mins="0"]').click();}
  const timer=await page.evaluate(()=>({minutes:window.vbSleepTimer?.minutes(),stored:localStorage.getItem('vb_sleep_timer')}));
  return timer.minutes===0&&timer.stored===null?pass('fifty timer set/cancel cycles finished off with no stale timer'):fail(`timer soak state ${JSON.stringify(timer)}`);
}

async function runCell(browser,base,viewportName,viewport,tier,route){
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},isMobile:viewport.isMobile,hasTouch:viewport.hasTouch,reducedMotion:'reduce'});
  context.setDefaultTimeout(9000);await context.route('**/*',req=>new URL(req.request().url()).origin===base?req.continue():req.abort('blockedbyclient'));await context.addInitScript(seed(),{tier,birthday:birthdayForTier(tier)});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const checks={};let phase='launch';
  try{
    await health(base);await visit(page,base,route);if(route.id==='parent/settings.html')await unlock(page);
    const g=await geometry(page,route);checks.layout=g.overflow<=1&&g.visible>0&&g.firstIntersects?pass(`rendered shared route geometry ${JSON.stringify(g)}`):fail(`bad shared route geometry ${JSON.stringify(g)}`);
    const shot=path.join(SHOTS,`${route.shot}-T${tier}-${viewportName}.png`);try{await page.screenshot({path:shot});}catch{await page.waitForTimeout(150);await page.screenshot({path:shot});}
    phase='soak';checks.long_repeated_play=await soak(page,base,route);
    checks.visual_quality={status:'BLK',note:'screenshot captured for separate human/model visual review'};
    if(errors.length)checks.runtime=fail(`${errors.length} page errors: ${errors.slice(0,3).join(' | ')}`);
  }catch(error){checks.runtime=fail(`${phase}: ${String(error.message||error).slice(0,240)}`);}
  finally{await context.close();}
  return{id:`${route.id}:T${tier}:${viewportName}`,routeId:route.id,tier,viewport:viewportName,checks};
}

mkdirSync(OUT,{recursive:true});mkdirSync(SHOTS,{recursive:true});const port=await freePort(),base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,[path.join(ROOT,'scripts','serve.mjs')],{cwd:ROOT,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});for(let i=0;i<100;i++){try{await health(base);break;}catch{if(i===99)throw new Error('server did not start');await new Promise(r=>setTimeout(r,100));}}
const browser=await chromium.launch(),started=Date.now(),queue=[];for(const [viewportName,viewport]of Object.entries(VIEWPORTS))if(selectedViewports.includes(viewportName))for(const tier of selectedTiers)for(const route of ROUTES)if(selectedRoutes.includes(route.id))queue.push({viewportName,viewport,tier,route});const rows=[];
try{async function worker(){while(queue.length){const j=queue.shift(),r=await runCell(browser,base,j.viewportName,j.viewport,j.tier,j.route);rows.push(r);const f=Object.values(r.checks).filter(x=>x.status==='FAIL').length;console.log(`${f?'FAIL':'PASS'} ${r.id}${f?` (${f})`:''}`);}}await Promise.all(Array.from({length:4},worker));}finally{await browser.close();server.kill();}
rows.sort((a,b)=>a.id.localeCompare(b.id));const counts={rows:rows.length,pass:0,fail:0,blk:0};for(const r of rows)for(const x of Object.values(r.checks))counts[x.status.toLowerCase()]++;const report={baseline:APP_BASELINE,generatedAt:new Date().toISOString(),durationSec:Math.round((Date.now()-started)/1000),counts,rows};writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...counts,durationSec:report.durationSec}));if(rows.length!==selectedTiers.length*selectedViewports.length*selectedRoutes.length||counts.fail)process.exitCode=1;
