// Spelling Bee T1-T10 phone/desktop remaining play, reward, restart, soak, and visual audit.
// This extends the accepted 33a26ea responsive regression; it does not relabel that repair as new work.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(import.meta.dirname, 'out', 'spelling-visual-play');
const AUDIT_START = 'a1e215ebedc22b1d16562f51f490e413414f06da';
const SOURCE = readFileSync(path.join(ROOT, 'learning', 'spelling.html'), 'utf8');
const VIEWPORTS = {
  desktop: { width:1280, height:900, isMobile:false, hasTouch:false },
  phone: { width:390, height:844, isMobile:true, hasTouch:true },
};
const PROBES = {
  'short-phone': { width:320, height:568, isMobile:true, hasTouch:true },
  tablet: { width:820, height:1180, isMobile:true, hasTouch:true },
};
const WORDS = {
  CAT:{w:'CAT',e:'🐱'}, DOG:{w:'DOG',e:'🐶'}, EGG:{w:'EGG',e:'🥚'}, BEE:{w:'BEE',e:'🐝'},
  FISH:{w:'FISH',e:'🐟'}, MOON:{w:'MOON',e:'🌙'}, TREE:{w:'TREE',e:'🌳'}, BOOK:{w:'BOOK',e:'📖'},
  APPLE:{w:'APPLE',e:'🍎'}, ROBOT:{w:'ROBOT',e:'🤖'}, GRAPE:{w:'GRAPE',e:'🍇'}, HEART:{w:'HEART',e:'❤️'},
  ORANGE:{w:'ORANGE',e:'🍊'}, FLOWER:{w:'FLOWER',e:'🌸'}, ROCKET:{w:'ROCKET',e:'🚀'}, MONKEY:{w:'MONKEY',e:'🐵'},
  GUITAR:{w:'GUITAR',e:'🎸'}, PENGUIN:{w:'PENGUIN',e:'🐧'}, RAINBOW:{w:'RAINBOW',e:'🌈'}, DOLPHIN:{w:'DOLPHIN',e:'🐬'},
  ELEPHANT:{w:'ELEPHANT',e:'🐘'}, DINOSAUR:{w:'DINOSAUR',e:'🦕'},
};
const TARGETS = tier => tier <= 6
  ? ['CAT','DOG','EGG','BEE','CAT','EGG']
  : tier === 7 ? ['CAT','FISH','BOOK','EGG','MOON','TREE']
  : tier === 8 ? ['FISH','APPLE','TREE','ROBOT','MOON','GRAPE']
  : tier === 9 ? ['APPLE','ORANGE','ROBOT','PENGUIN','HEART','RAINBOW']
  : ['ORANGE','FLOWER','ROCKET','MONKEY','GUITAR','PENGUIN','RAINBOW','DOLPHIN','ELEPHANT','DINOSAUR'];
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');

async function freePort(){const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));return port}
async function health(base){const response=await fetch(base+'/__health.json');const body=await response.json();if(!response.ok||body.app!=='kids')throw new Error('wrong local app')}
function birthday(tier){const months={1:6,2:18,3:30,4:42,5:54,6:66,7:78,8:90,9:102,10:114};const date=new Date();date.setDate(15);date.setMonth(date.getMonth()-months[tier]);return date.toISOString().slice(0,10)}
function patchedSource(){
  const multiple="const target = WORDS[Math.floor(Math.random() * WORDS.length)];";
  const spell="const target = pool[Math.floor(Math.random() * pool.length)];";
  if(!SOURCE.includes(multiple)||!SOURCE.includes(spell))throw new Error('Spelling target hooks changed');
  const deterministic="const target = window.__spellingTargets[window.__spellingTargetIndex++ % window.__spellingTargets.length];";
  return SOURCE.replace(multiple,deterministic).replace(spell,deterministic);
}
const HTML=patchedSource();

function init({tier,bday,targets,counter=119}){
  const profile={id:`spelling-t${tier}`,name:'Spelling Test',birthday:bday,color:'#4ECDC4',voice:'girl',mascot:{id:'dog'},tierOverrides:{spelling:tier},activitiesVisible:{spelling:true},features:{},achievements:{unlocked:{'spelling.first':{at:1},'spelling.milestone.bronze':{at:1},'spelling.milestone.silver':{at:1},'spelling.mastery':{at:1}},counters:{spelling:counter},repeats:{},streak:{last:null,current:0,best:0},xp:4,rank:'sprout'}};
  if(!sessionStorage.__spellingSeed){localStorage.setItem('vb_profiles',JSON.stringify([profile]));localStorage.setItem('vb_active_id',profile.id);localStorage.setItem('vb_pin','1234');sessionStorage.__spellingSeed='1'}
  window.__spellingTargets=targets;window.__spellingTargetIndex=0;
  const realTimeout=window.setTimeout.bind(window);window.setTimeout=(fn,delay,...args)=>realTimeout(fn,delay===1800||delay===2400?250:delay,...args);
  window.__silentMediaPlays=0;try{HTMLMediaElement.prototype.play=function(){window.__silentMediaPlays++;return Promise.resolve()}}catch{}try{navigator.vibrate=()=>true}catch{}
}

async function makeContext(browser,base,viewport,tier){
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},isMobile:viewport.isMobile,hasTouch:viewport.hasTouch,reducedMotion:'no-preference',serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort('blockedbyclient'));
  await context.route('**/learning/spelling.html',route=>route.fulfill({contentType:'text/html',body:HTML}));
  const targets=TARGETS(tier).map(key=>WORDS[key]);
  await context.addInitScript(init,{tier,bday:birthday(tier),targets,counter:119});
  return {context,targets};
}

async function saveShot(page,rowId,label,screenshots){const directory=path.join(OUT,'screenshots');mkdirSync(directory,{recursive:true});const file=path.join(directory,`${rowId.replaceAll(':','-')}-${String(screenshots.length+1).padStart(2,'0')}-${label}.png`);await page.screenshot({path:file});screenshots.push({rowId,label,file})}
async function state(page){return page.evaluate(()=>{const profile=JSON.parse(localStorage.vb_profiles||'[]')[0]||{};return{counter:profile.achievements?.counters?.spelling||0,repeat:profile.achievements?.repeats?.spelling||0,tierOverride:profile.tierOverrides?.spelling,pin:localStorage.getItem('vb_pin')}})}

async function geometry(page){
  const controls=page.locator('.word-card,.letter-tile'),targets=[];
  for(let index=0;index<await controls.count();index++){
    await controls.nth(index).scrollIntoViewIfNeeded();
    targets.push(await controls.nth(index).evaluate(element=>{const box=element.getBoundingClientRect(),center={x:box.left+box.width/2,y:box.top+box.height/2};return{left:box.left,top:box.top,right:box.right,bottom:box.bottom,width:box.width,height:box.height,reachable:document.elementFromPoint(center.x,center.y)?.closest('.word-card,.letter-tile')===element}}));
  }
  await page.locator('#stage').evaluate(element=>{element.scrollTop=0});
  return page.evaluate(targets=>{
    const read=element=>{if(!element||getComputedStyle(element).display==='none'||getComputedStyle(element).visibility==='hidden')return null;const value=element.getBoundingClientRect();return{left:value.left,top:value.top,right:value.right,bottom:value.bottom,width:value.width,height:value.height}};
    const nav=[...document.querySelectorAll('.back-btn,.home-btn,#gameSettingsGear,.settings-gear,.vb-replay-instruction')].map(element=>({name:element.id||[...element.classList].join('.'),box:read(element)})).filter(item=>item.box);
    const content=[{name:'title',box:read(document.querySelector('.title'))},{name:'hint',box:read(document.querySelector('#hint'))},{name:'picture',box:read(document.querySelector('.pic-big'))},...([...document.querySelectorAll('.word-card,.letter-tile')].map((element,index)=>({name:`choice-${index+1}`,box:read(element)})))];
    const overlap=(a,b)=>!!a&&!!b&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
    return{targetCount:targets.length,minTarget:targets.length?Math.min(...targets.map(box=>Math.min(box.width,box.height))):null,targetsReachable:targets.every(box=>box.reachable),horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),minNavTarget:nav.length?Math.min(...nav.map(item=>Math.min(item.box.width,item.box.height))):null,navClipped:nav.filter(item=>item.box.left<-1||item.box.top<-1||item.box.right>innerWidth+1||item.box.bottom>innerHeight+1).length,navContentOverlaps:nav.flatMap(item=>content.filter(contentItem=>overlap(item.box,contentItem.box)).map(contentItem=>({nav:item.name,content:contentItem.name}))),scrollHeight:document.querySelector('#stage')?.scrollHeight||0,clientHeight:document.querySelector('#stage')?.clientHeight||0}
  },targets);
}

async function verifySettings(page,tier){
  const gear=page.locator('#gameSettingsGear');await gear.dispatchEvent('pointerdown',{pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:1});await page.locator('#gameSettingsOverlay').waitFor({timeout:2000});await gear.dispatchEvent('pointerup',{pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:0});
  for(const digit of ['0','0','0','0'])await page.locator(`.gs-key[data-k="${digit}"]`).click();await page.locator('#gsMsg').filter({hasText:'Wrong PIN'}).waitFor({timeout:1500});const wrongPinStayedLocked=await page.locator('select.gs-tier-sel').count()===0;await page.waitForTimeout(250);
  for(const digit of ['1','2','3','4'])await page.locator(`.gs-key[data-k="${digit}"]`).click();const selector=page.locator('select.gs-tier-sel');await selector.waitFor({timeout:1500});const initial=await selector.inputValue();await selector.selectOption(String(tier===10?9:tier+1));await selector.selectOption(String(tier));const persistedBeforeClose=(await state(page)).tierOverride===tier;await page.locator('#gsClose').click();await page.waitForLoadState('load');const after=await state(page);return wrongPinStayedLocked&&initial===String(tier)&&persistedBeforeClose&&after.tierOverride===tier&&after.pin==='1234';
}

async function solveRound(page,tier,target,rapid){
  const selector=tier>=6?'.letter-tile':'.word-card',controls=page.locator(selector),labels=(await controls.allTextContents()).map(value=>value.trim()),before=(await state(page)).counter;
  const wrong=labels.findIndex(label=>tier>=6?label!==target.w[0]:label!==target.w);if(wrong<0)throw new Error(`no wrong choice for ${target.w}`);
  await controls.nth(wrong).dispatchEvent('pointerdown');const wrongMarked=await controls.nth(wrong).evaluate(element=>element.classList.contains('wrong'));const wrongDidNotProgress=(await state(page)).counter===before;
  const oldPicture=await page.locator('.pic-big').elementHandle();
  if(tier>=6){for(const letter of target.w)await controls.filter({hasText:new RegExp(`^${letter}$`)}).first().dispatchEvent('pointerdown')}
  else await controls.filter({hasText:new RegExp(`^${target.w}$`)}).first().dispatchEvent('pointerdown');
  if(rapid){await controls.first().dispatchEvent('pointerdown');await controls.nth(wrong).dispatchEvent('pointerdown')}
  await page.waitForFunction(value=>{const profile=JSON.parse(localStorage.vb_profiles||'[]')[0]||{};return profile.achievements?.counters?.spelling===value+1},before,{timeout:1500});
  const correctMarked=tier>=6?await page.locator('.spelled-slot.filled').count()===target.w.length:await controls.filter({hasText:new RegExp(`^${target.w}$`)}).first().evaluate(element=>element.classList.contains('matched'));
  const feedback=tier>=6?(await page.locator('.spelled-slot').allTextContents()).join('')===target.w:true;
  return{word:target.w,wrongMarked,wrongDidNotProgress,exactIncrement:(await state(page)).counter===before+1,correctMarked,feedback,oldPicture};
}
async function waitNext(page,oldPicture){await page.waitForFunction(element=>!element?.isConnected,oldPicture,{timeout:2000});await page.locator('.pic-big').waitFor()}

async function inspectReward(page,rowId,screenshots){
  await page.locator('.vb-celebrate.in').waitFor({timeout:5000});await page.waitForTimeout(180);
  const result=await page.locator('.vb-celebrate').evaluate(notice=>{const r=notice.getBoundingClientRect(),candidates=[...document.querySelectorAll('.title,#hint,.pic-big,.word-card,.letter-tile,.back-btn,.home-btn,#gameSettingsGear,.settings-gear,.vb-replay-instruction')].filter(element=>getComputedStyle(element).display!=='none'&&getComputedStyle(element).visibility!=='hidden').map(element=>({name:element.id||element.className||element.tagName,box:element.getBoundingClientRect()}));const overlaps=candidates.filter(({box:b})=>Math.min(r.right,b.right)>Math.max(r.left,b.left)&&Math.min(r.bottom,b.bottom)>Math.max(r.top,b.top)).map(item=>item.name);return{title:notice.querySelector('.cele-title')?.textContent?.trim()||'',hint:notice.querySelector('.cele-hint')?.textContent?.trim()||'',inViewport:r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,overlaps,rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}}});
  await saveShot(page,rowId,'reward',screenshots);await page.mouse.click(result.rect.left+result.rect.width/2,result.rect.top+result.rect.height/2);await page.locator('.vb-celebrate').waitFor({state:'detached',timeout:1200});return result;
}

async function createContactSheet(browser,items,target,title){const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage();const cards=items.map(item=>`<figure><img src="data:image/png;base64,${readFileSync(item.file).toString('base64')}"><figcaption>${item.rowId} · ${item.label}</figcaption></figure>`).join('');await page.setContent(`<style>body{background:#111827;color:white;font:16px Arial;margin:0;padding:18px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}figure{margin:0;background:#1f2937;padding:6px}img{width:100%;height:250px;object-fit:contain}figcaption{font-size:12px}</style><h1>${title}</h1><div class="grid">${cards}</div>`);await page.screenshot({path:target,fullPage:true});await context.close()}

async function runCell(browser,base,viewportName,viewport,tier,allScreenshots){
  await health(base);const rowId=`spelling:T${tier}:${viewportName}`,made=await makeContext(browser,base,viewport,tier),context=made.context,targets=made.targets,page=await context.newPage(),screenshots=[],rounds=[],geometrySamples=[],pageErrors=[],failedLocalRequests=[];page.on('pageerror',error=>pageErrors.push(error.message));page.on('requestfailed',request=>{if(request.url().startsWith(base)&&request.resourceType()!=='media')failedLocalRequests.push(`${request.url()} ${request.failure()?.errorText||''}`)});
  let counterBefore=null,counterAfter=null,repeatAfter=null,reward=null,settingsPass=false,navigationRecovered=false,reloadRecovered=false,fatal=null;
  try{
    await page.goto(base+'/learning/spelling.html',{waitUntil:'load'});geometrySamples.push(await geometry(page));await saveShot(page,rowId,'opening',screenshots);settingsPass=await verifySettings(page,tier);geometrySamples.push(await geometry(page));await saveShot(page,rowId,'settings-return',screenshots);counterBefore=(await state(page)).counter;
    for(let index=0;index<targets.length;index++){const round=await solveRound(page,tier,targets[index],index===0);rounds.push({word:round.word,wrongMarked:round.wrongMarked,wrongDidNotProgress:round.wrongDidNotProgress,exactIncrement:round.exactIncrement,correctMarked:round.correctMarked,feedback:round.feedback});if(index===0&&tier>=3)reward=await inspectReward(page,rowId,screenshots);await waitNext(page,round.oldPicture);if(index===2||index===targets.length-1){geometrySamples.push(await geometry(page));await saveShot(page,rowId,`round-${index+1}-${round.word.toLowerCase()}`,screenshots)}}
    const completed=await state(page);counterAfter=completed.counter;repeatAfter=completed.repeat;await page.locator('.back-btn').click();await page.waitForURL(/\/learning\/(index\.html)?$/);if(tier<=2)reward=await inspectReward(page,rowId,screenshots);await page.locator('[data-activity="spelling"]').click();await page.waitForURL(/\/learning\/spelling\.html$/);navigationRecovered=(await state(page)).counter===counterAfter&&await page.locator('.pic-big').count()===1;await saveShot(page,rowId,'navigation-return',screenshots);const beforeReload=(await state(page)).counter;await page.reload({waitUntil:'load'});reloadRecovered=(await state(page)).counter===beforeReload&&(await state(page)).tierOverride===tier&&await page.locator('.pic-big').count()===1;geometrySamples.push(await geometry(page));await saveShot(page,rowId,'reload',screenshots);if(pageErrors.length||failedLocalRequests.length)throw new Error(`browser/runtime failure ${JSON.stringify({pageErrors,failedLocalRequests})}`);
  }catch(error){fatal=`${error.name}: ${error.message}`;try{await saveShot(page,rowId,'failure',screenshots)}catch{}}finally{allScreenshots.push(...screenshots.map(item=>({...item,viewport:viewportName,tier})));await context.close()}
  const expectedWords=targets.map(item=>item.w),observedWords=rounds.map(item=>item.word),soakPass=JSON.stringify(observedWords)===JSON.stringify(expectedWords),geometryPass=geometrySamples.length>=5&&geometrySamples.every(sample=>sample.minTarget>=44&&sample.targetsReachable&&sample.minNavTarget>=44&&sample.horizontalOverflow<=1&&!sample.navClipped),rewardPass=reward?.title&&reward.hint==='Saved in your gallery'&&reward.inViewport&&repeatAfter===1,rewardClear=reward&&!reward.overlaps.length;
  return{id:rowId,activityId:'spelling',route:'/learning/spelling.html',tier,viewport:viewportName,checks:{input:!fatal&&settingsPass&&rounds.length===targets.length&&rounds.every(round=>round.wrongMarked&&round.wrongDidNotProgress&&round.exactIncrement&&round.correctMarked&&round.feedback)?'PASS':'FAIL',progression:!fatal&&counterBefore===119&&counterAfter===119+targets.length?'PASS':'FAIL',rewards:!fatal&&rewardPass?'PASS':'FAIL',restart:!fatal&&navigationRecovered&&reloadRecovered?'PASS':'FAIL',long_repeated_play:!fatal&&soakPass?'PASS':'FAIL',visual_quality:!fatal&&geometryPass&&rewardClear?'PASS':'FAIL'},priorResponsiveRegression:'33a26ea4851dc70d74d6bb8b51f2a577e5251de6',expectedWords,observedWords,settingsPass,counterBefore,counterAfter,repeatAfter,reward,navigationRecovered,reloadRecovered,rounds,geometrySamples,pageErrors,failedLocalRequests,screenshotCount:screenshots.length,fatal};
}

async function runProbe(browser,base,viewportName,viewport,tier,allScreenshots){
  const rowId=`spelling-probe:T${tier}:${viewportName}`,made=await makeContext(browser,base,viewport,tier),context=made.context,targets=made.targets.slice(0,3),page=await context.newPage(),screenshots=[],rounds=[],geometrySamples=[];let reward=null,fatal=null;
  try{await page.goto(base+'/learning/spelling.html',{waitUntil:'load'});for(let index=0;index<targets.length;index++){geometrySamples.push(await geometry(page));await saveShot(page,rowId,`round-${index+1}`,screenshots);const round=await solveRound(page,tier,targets[index],index===0);rounds.push({word:round.word,exactIncrement:round.exactIncrement,wrongMarked:round.wrongMarked,wrongDidNotProgress:round.wrongDidNotProgress});if(index===0)reward=await inspectReward(page,rowId,screenshots);await waitNext(page,round.oldPicture)}}catch(error){fatal=`${error.name}: ${error.message}`;try{await saveShot(page,rowId,'failure',screenshots)}catch{}}finally{allScreenshots.push(...screenshots.map(item=>({...item,viewport:viewportName,tier})));await context.close()}
  const behaviorPass=!fatal&&geometrySamples.length===3&&geometrySamples.every(sample=>sample.minTarget>=44&&sample.targetsReachable&&sample.minNavTarget>=44&&sample.horizontalOverflow<=1&&!sample.navClipped)&&rounds.length===3&&rounds.every(round=>round.exactIncrement&&round.wrongMarked&&round.wrongDidNotProgress)&&reward?.inViewport;
  return{id:rowId,tier,viewport:viewportName,behaviorPass,reward,rounds,geometrySamples,screenshotCount:screenshots.length,fatal};
}

if(path.dirname(OUT)!==path.join(ROOT,'tests','e2e','out')||path.basename(OUT)!=='spelling-visual-play')throw new Error(`refusing unsafe output cleanup: ${OUT}`);rmSync(OUT,{recursive:true,force:true});mkdirSync(path.join(OUT,'contact-sheets'),{recursive:true});
const port=await freePort(),base=`http://127.0.0.1:${port}`,server=spawn(process.execPath,[path.join(ROOT,'scripts/serve.mjs')],{cwd:ROOT,env:{...process.env,PORT:String(port)},stdio:'ignore'});for(let attempt=0;attempt<100;attempt++){try{await health(base);break}catch{if(attempt===99)throw new Error('local server did not start');await new Promise(resolve=>setTimeout(resolve,100))}}
const browser=await chromium.launch(),jobs=[],rows=[],probes=[],screenshots=[];for(const [viewportName,viewport] of Object.entries(VIEWPORTS))for(let tier=1;tier<=10;tier++)jobs.push({kind:'row',viewportName,viewport,tier});for(const [viewportName,viewport] of Object.entries(PROBES))for(const tier of [4,6,8,10])jobs.push({kind:'probe',viewportName,viewport,tier});
try{async function worker(){while(jobs.length){const job=jobs.shift();if(job.kind==='row'){const row=await runCell(browser,base,job.viewportName,job.viewport,job.tier,screenshots);rows.push(row);console.log(`${row.fatal?'ERROR':'DONE'} ${row.id} rounds=${row.rounds.length}${row.fatal?' '+row.fatal:''}`)}else{const probe=await runProbe(browser,base,job.viewportName,job.viewport,job.tier,screenshots);probes.push(probe);console.log(`${probe.behaviorPass?'DONE':'ERROR'} ${probe.id}${probe.fatal?' '+probe.fatal:''}`)}}}await Promise.all([worker(),worker(),worker(),worker()]);for(const viewportName of [...Object.keys(VIEWPORTS),...Object.keys(PROBES)])await createContactSheet(browser,screenshots.filter(item=>item.viewport===viewportName),path.join(OUT,'contact-sheets',`${viewportName}.png`),`Spelling Bee ${viewportName}`)}finally{await browser.close();server.kill()}
rows.sort((a,b)=>a.id.localeCompare(b.id));probes.sort((a,b)=>a.id.localeCompare(b.id));const counts={rows:rows.length,pass:0,fail:0};for(const row of rows)for(const status of Object.values(row.checks))counts[status.toLowerCase()]++;const report={auditStart:AUDIT_START,spellingSha256:sha256(path.join(ROOT,'learning/spelling.html')),priorResponsiveRegression:'33a26ea4851dc70d74d6bb8b51f2a577e5251de6',generatedAt:new Date().toISOString(),evidenceBoundary:'Browser pointer/touch emulation and silent local media handling; no physical child-touch or human-audible voice-quality claim.',counts,screenshots:screenshots.length,recordedCorrectAnswers:rows.reduce((sum,row)=>sum+Math.max(0,(row.counterAfter||0)-(row.counterBefore||0)),0),rewardOverlaps:rows.filter(row=>row.reward?.overlaps?.length).map(row=>({id:row.id,overlaps:row.reward.overlaps})),responsiveOverlaps:probes.flatMap(probe=>probe.geometrySamples.flatMap((sample,index)=>sample.navContentOverlaps.map(item=>({id:probe.id,sample:index+1,...item})))),rows,probes};writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({rows:rows.length,...counts,probes:probes.length,probeBehaviorPass:probes.filter(item=>item.behaviorPass).length,screenshots:screenshots.length,recordedCorrectAnswers:report.recordedCorrectAnswers,rewardOverlaps:report.rewardOverlaps.length,responsiveOverlaps:report.responsiveOverlaps.length}));if(rows.length!==20||rows.some(row=>row.fatal||Object.values(row.checks).includes('FAIL')||row.pageErrors.length||row.failedLocalRequests.length)||probes.length!==8||probes.some(probe=>!probe.behaviorPass))process.exitCode=1;
