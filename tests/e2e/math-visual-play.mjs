// Math Mountain T1-T10 phone/desktop repeated-play, settings, reward, and visual audit.
// Browser pointer/touch emulation and silent media stubs do not prove physical child touch
// or human-audible voice quality.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(import.meta.dirname, 'out', 'math-visual-play');
const AUDIT_START = 'ddb34d883107b3762347eb9ae6c4b988560e4757';
const VIEWPORTS = {
  desktop: { width: 1280, height: 900, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
};
const PROBES = {
  'short-phone': { width: 320, height: 568, isMobile: true, hasTouch: true },
  tablet: { width: 820, height: 1180, isMobile: true, hasTouch: true },
};
const TIERS = [1,2,3,4,5,6,7,8,9,10];
const SELECTED_TIERS = process.env.TIERS ? process.env.TIERS.split(',').map(Number) : TIERS;
const SELECTED_VIEWPORTS = process.env.VIEWPORTS ? process.env.VIEWPORTS.split(',') : Object.keys(VIEWPORTS);
const RUN_PROBES = process.env.PROBES !== '0';
const PLANS = [
  { op: '+', missing: false },
  { op: '−', missing: false },
  { op: '×', missing: false },
  { op: '÷', missing: false },
  { op: '+', missing: true },
  { op: '−', missing: true },
  { op: '+', missing: false },
  { op: '−', missing: false },
];
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');

async function freePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

async function health(base) {
  const response = await fetch(base + '/__health.json');
  const body = await response.json();
  if (!response.ok || body.app !== 'kids') throw new Error('wrong local app');
}

function birthday(tier) {
  const months = {1:6,2:18,3:30,4:42,5:54,6:66,7:78,8:90,9:102,10:114};
  const date = new Date();
  date.setDate(15);
  date.setMonth(date.getMonth() - months[tier]);
  return date.toISOString().slice(0, 10);
}

function init({ tier, bday, features = false, counter = 119 }) {
  const profile = {
    id: `math-t${tier}`,
    name: 'Math Test',
    birthday: bday,
    color: '#4ECDC4',
    voice: 'girl',
    mascot: { id: 'dog' },
    tierOverrides: { math: tier },
    activitiesVisible: { math: true },
    features: { math: features ? { subtract:true, multiply:true, divide:true, missingNumber:true } : {} },
    achievements: {
      unlocked: {
        'math.first': { at: 1 },
        'math.milestone.bronze': { at: 1 },
        'math.milestone.silver': { at: 1 },
        'math.mastery': { at: 1 },
      },
      counters: { math: counter },
      repeats: {},
      streak: { last: null, current: 0, best: 0 },
      xp: 4,
      rank: 'sprout',
    },
  };
  if (!sessionStorage.__mathSeed) {
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    localStorage.setItem('vb_pin', '1234');
    sessionStorage.__mathSeed = '1';
  }
  let state = (0x6d2b79f5 + tier * 977) >>> 0;
  const seeded = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000);
  window.__mathOps = [0.01];
  window.__mathValues = [0.1, 0.2, 0.3, 0.9];
  Math.random = () => {
    const stack = String(new Error().stack || '');
    if (stack.includes('pickOp') && window.__mathOps.length) return window.__mathOps.shift();
    if (stack.includes('nextRound') && window.__mathValues.length) return window.__mathValues.shift();
    return seeded();
  };
  const realTimeout = window.setTimeout.bind(window);
  window.setTimeout = (fn, delay, ...args) => realTimeout(fn, delay === 2200 ? 80 : delay, ...args);
  window.__silentMediaPlays = 0;
  try { HTMLMediaElement.prototype.play = function () { window.__silentMediaPlays++; return Promise.resolve(); }; } catch {}
  try { navigator.vibrate = () => true; } catch {}
}

async function queuePlan(page, plan) {
  const opRandom = { '+':0.01, '−':0.26, '×':0.51, '÷':0.76 }[plan.op];
  const values = plan.op === '+' || plan.op === '−'
    ? [0.1, 0.55, 0.25, plan.missing ? 0.1 : 0.9]
    : [0.1, 0.35, 0.45];
  await page.evaluate(({ opRandom, values }) => {
    window.__mathOps = [opRandom];
    window.__mathValues = values.slice();
  }, { opRandom, values });
}

async function saveShot(page, rowId, label, screenshots) {
  const directory = path.join(OUT, 'screenshots');
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${rowId.replaceAll(':', '-')}-${String(screenshots.length + 1).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: file });
  screenshots.push({ rowId, label, file });
}

async function state(page) {
  return page.evaluate(() => {
    const profile = JSON.parse(localStorage.vb_profiles || '[]')[0] || {};
    const feature = profile.features?.math || {};
    return {
      counter: profile.achievements?.counters?.math || 0,
      repeat: profile.achievements?.repeats?.math || 0,
      mastery: !!profile.achievements?.unlocked?.['math.mastery'],
      features: ['subtract','multiply','divide','missingNumber'].every(key => feature[key] === true),
    };
  });
}

async function equation(page) {
  return page.locator('.eq-row').evaluate(row => {
    const children = [...row.children];
    const op = children.find(node => node.classList.contains('op') && node.textContent !== '=')?.textContent || '';
    const equalsIndex = children.findIndex(node => node.textContent === '=');
    const boxIndex = children.findIndex(node => node.classList.contains('answer-box'));
    const values = children.map(node => node.classList.contains('answer-box') ? NaN
      : node.classList.contains('pile') ? node.querySelectorAll('.item').length
        : Number(node.textContent)).filter(Number.isFinite);
    const missing = boxIndex >= 0 && boxIndex < equalsIndex;
    const [a, b] = values;
    const answer = missing ? (op === '−' ? a - b : b - a)
      : op === '−' ? a - b : op === '×' ? a * b : op === '÷' ? a / b : a + b;
    return { op, missing, values, answer, text: row.textContent.trim() };
  });
}

async function geometry(page) {
  await page.waitForTimeout(120);
  const buttons = page.locator('.num-btn');
  const targets = [];
  for (let index = 0; index < await buttons.count(); index++) {
    await buttons.nth(index).scrollIntoViewIfNeeded();
    const box = await buttons.nth(index).boundingBox();
    if (box) targets.push({ left:box.x, top:box.y, right:box.x+box.width, bottom:box.y+box.height, width:box.width, height:box.height });
  }
  await page.locator('#stage').evaluate(element => { element.scrollTop = 0; });
  return page.evaluate(targets => {
    const rect = selector => {
      const element = typeof selector === 'string' ? document.querySelector(selector) : selector;
      if (!element || getComputedStyle(element).display === 'none' || getComputedStyle(element).visibility === 'hidden') return null;
      const value = element.getBoundingClientRect();
      return { left:value.left, top:value.top, right:value.right, bottom:value.bottom, width:value.width, height:value.height };
    };
    const nav = [...document.querySelectorAll('.back-btn,.home-btn,#gameSettingsGear,.settings-gear,.vb-replay-instruction')].map(element => {
      const value = element.getBoundingClientRect();
      return { name:element.id || [...element.classList].join('.'), left:value.left, top:value.top, right:value.right, bottom:value.bottom, width:value.width, height:value.height };
    });
    const title = rect('.title'), hint = rect('#hint'), eq = rect('.eq-row'), row = rect('.num-row');
    const answers = [...document.querySelectorAll('.num-btn')].map((element, index) => ({ name:`answer-${index + 1}`, box:rect(element) }));
    const content = [{ name:'title', box:title }, { name:'hint', box:hint }, { name:'equation', box:eq }, ...answers];
    const overlap = (a,b) => !!a && !!b && Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
    const navContentOverlaps = nav.flatMap(navBox => content.filter(item => overlap(navBox,item.box)).map(item => ({ nav:navBox.name, content:item.name })));
    return {
      targetCount: targets.length,
      minTarget: targets.length ? Math.min(...targets.map(box => Math.min(box.width,box.height))) : null,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth-innerWidth),
      clippedTargets: targets.filter(box => box.left < -1 || box.right > innerWidth+1).length,
      minNavTarget: nav.length ? Math.min(...nav.map(box => Math.min(box.width,box.height))) : null,
      navClipped: nav.filter(box => box.left < -1 || box.top < -1 || box.right > innerWidth+1 || box.bottom > innerHeight+1).length,
      navContentOverlap: navContentOverlaps.length,
      navContentOverlaps,
      equation: eq,
      choices: row,
      answers: answers.map(item => item.box),
      scrollHeight: document.querySelector('#stage')?.scrollHeight || 0,
      clientHeight: document.querySelector('#stage')?.clientHeight || 0,
    };
  }, targets);
}

async function enableFeaturesThroughSettings(page) {
  const gear = page.locator('#gameSettingsGear');
  await gear.dispatchEvent('pointerdown', { pointerId:1, pointerType:'mouse', isPrimary:true, button:0, buttons:1 });
  await page.locator('#gameSettingsOverlay').waitFor({ timeout:2000 });
  await gear.dispatchEvent('pointerup', { pointerId:1, pointerType:'mouse', isPrimary:true, button:0, buttons:0 });
  for (const digit of ['1','2','3','4']) await page.locator(`.gs-key[data-k="${digit}"]`).click();
  for (const key of ['subtract','multiply','divide','missingNumber']) {
    const checkbox = page.locator(`input[data-fk="${key}"]`);
    await checkbox.waitFor({ timeout:1500 });
    if (!await checkbox.isChecked()) await checkbox.check();
  }
  await page.locator('#gsClose').click();
  await page.waitForLoadState('load');
  return (await state(page)).features;
}

async function solveRound(page, rapid, nextPlan) {
  const current = await equation(page);
  const choices = page.locator('.num-btn');
  const labels = (await choices.allTextContents()).map(Number);
  const correct = labels.indexOf(current.answer);
  const wrong = labels.findIndex(value => value !== current.answer);
  if (correct < 0 || wrong < 0) throw new Error(`cannot solve ${JSON.stringify({ current, labels })}`);
  const before = (await state(page)).counter;
  await choices.nth(wrong).dispatchEvent('pointerdown');
  const wrongRecovered = await choices.nth(wrong).evaluate(element => element.classList.contains('wrong'));
  const wrongDidNotProgress = (await state(page)).counter === before;
  const oldEquation = await page.locator('.eq-row').elementHandle();
  await queuePlan(page, nextPlan);
  await choices.nth(correct).dispatchEvent('pointerdown');
  if (rapid) {
    await choices.nth(correct).dispatchEvent('pointerdown');
    await choices.nth(wrong).dispatchEvent('pointerdown');
  }
  await page.waitForFunction(value => {
    const profile = JSON.parse(localStorage.vb_profiles || '[]')[0] || {};
    return profile.achievements?.counters?.math === value + 1;
  }, before, { timeout:1500 });
  return { ...current, wrongRecovered, wrongDidNotProgress, exactIncrement:(await state(page)).counter === before+1, oldEquation };
}

async function waitNext(page, oldEquation) {
  await page.waitForFunction(element => !element?.isConnected, oldEquation, { timeout:2000 });
  return equation(page);
}

async function inspectReward(page, rowId, screenshots) {
  await page.locator('.vb-celebrate.in').waitFor({ timeout:5000 });
  await page.waitForTimeout(180);
  const result = await page.locator('.vb-celebrate').evaluate(notice => {
    const r = notice.getBoundingClientRect();
    const candidates = [...document.querySelectorAll('.title,#hint,.eq-row,.num-row,.back-btn,.home-btn,#gameSettingsGear,.settings-gear,.vb-replay-instruction')]
      .filter(element => getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden')
      .map(element => ({ name:element.id || element.className || element.tagName, box:element.getBoundingClientRect() }));
    const overlaps = candidates.filter(({ box:b }) => Math.min(r.right,b.right)>Math.max(r.left,b.left) && Math.min(r.bottom,b.bottom)>Math.max(r.top,b.top)).map(item => item.name);
    return {
      title: notice.querySelector('.cele-title')?.textContent?.trim() || '',
      hint: notice.querySelector('.cele-hint')?.textContent?.trim() || '',
      inViewport: r.left>=-1 && r.top>=-1 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1,
      overlaps,
      rect:{ left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height },
    };
  });
  await saveShot(page,rowId,'reward',screenshots);
  const center={x:result.rect.left+result.rect.width/2,y:result.rect.top+result.rect.height/2};
  await page.mouse.click(center.x,center.y);
  await page.locator('.vb-celebrate').waitFor({state:'detached',timeout:1200});
  return result;
}

async function createContactSheet(browser, items, target, title) {
  const context=await browser.newContext({viewport:{width:1600,height:1000}});
  const page=await context.newPage();
  const cards=items.map(item=>`<figure><img src="data:image/png;base64,${readFileSync(item.file).toString('base64')}"><figcaption>${item.rowId} · ${item.label}</figcaption></figure>`).join('');
  await page.setContent(`<style>body{background:#111827;color:white;font:16px Arial;margin:0;padding:18px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}figure{margin:0;background:#1f2937;padding:6px}img{width:100%;height:250px;object-fit:contain}figcaption{font-size:12px}</style><h1>${title}</h1><div class="grid">${cards}</div>`);
  await page.screenshot({path:target,fullPage:true});
  await context.close();
}

async function runCell(browser,base,viewportName,viewport,tier,allScreenshots) {
  await health(base);
  const rowId=`math:T${tier}:${viewportName}`;
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},isMobile:viewport.isMobile,hasTouch:viewport.hasTouch,reducedMotion:'no-preference',serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort('blockedbyclient'));
  await context.addInitScript(init,{tier,bday:birthday(tier),features:false,counter:119});
  const page=await context.newPage(), screenshots=[], rounds=[], geometrySamples=[], pageErrors=[], failedLocalRequests=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('requestfailed',request=>{if(request.url().startsWith(base)&&request.resourceType()!=='media')failedLocalRequests.push(`${request.url()} ${request.failure()?.errorText||''}`)});
  let counterBefore=null,counterAfter=null,repeatAfter=null,rewardResult=null,settingsPass=false,navigationRecovered=false,reloadRecovered=false,defaultMode=null,fatal=null;
  try {
    await page.goto(base+'/learning/math.html',{waitUntil:'load'});
    defaultMode=await equation(page);
    geometrySamples.push(await geometry(page));
    await saveShot(page,rowId,'default',screenshots);
    settingsPass=await enableFeaturesThroughSettings(page);
    geometrySamples.push(await geometry(page));
    await saveShot(page,rowId,'settings-enabled',screenshots);
    counterBefore=(await state(page)).counter;
    for(let index=0;index<PLANS.length;index++){
      const round=await solveRound(page,index===0,PLANS[(index+1)%PLANS.length]);
      rounds.push({op:round.op,missing:round.missing,values:round.values,answer:round.answer,wrongRecovered:round.wrongRecovered,wrongDidNotProgress:round.wrongDidNotProgress,exactIncrement:round.exactIncrement});
      if(index===0&&tier>=3)rewardResult=await inspectReward(page,rowId,screenshots);
      const next=await waitNext(page,round.oldEquation);
      if(index<PLANS.length-1&&(next.op!==PLANS[index+1].op||next.missing!==PLANS[index+1].missing))throw new Error(`planned mode mismatch ${JSON.stringify({index,next,expected:PLANS[index+1]})}`);
      if([0,3,5,7].includes(index)){geometrySamples.push(await geometry(page));await saveShot(page,rowId,`round-${index+1}-${round.op}${round.missing?'-missing':''}`,screenshots)}
    }
    const completedState=await state(page);
    counterAfter=completedState.counter;
    repeatAfter=completedState.repeat;
    await page.locator('.back-btn').click();
    await page.waitForURL(/\/learning\/(index\.html)?$/);
    if(tier<=2)rewardResult=await inspectReward(page,rowId,screenshots);
    const card=page.locator('[data-activity="math"]');
    await card.click();
    await page.waitForURL(/\/learning\/math\.html$/);
    navigationRecovered=(await state(page)).counter===counterAfter&&!!(await equation(page)).op;
    await saveShot(page,rowId,'navigation-return',screenshots);
    const beforeReload=(await state(page)).counter;
    await page.reload({waitUntil:'load'});
    reloadRecovered=(await state(page)).counter===beforeReload&&(await state(page)).features&&!!(await equation(page)).op;
    geometrySamples.push(await geometry(page));
    await saveShot(page,rowId,'reload',screenshots);
    if(pageErrors.length||failedLocalRequests.length)throw new Error(`browser/runtime failure ${JSON.stringify({pageErrors,failedLocalRequests})}`);
  }catch(error){fatal=`${error.name}: ${error.message}`;try{await saveShot(page,rowId,'failure',screenshots)}catch{}}
  finally{allScreenshots.push(...screenshots.map(item=>({...item,viewport:viewportName,tier})));await context.close()}
  const observed=new Set(rounds.map(round=>round.op+(round.missing?'-missing':'')));
  const modesPass=['+','−','×','÷','+-missing','−-missing'].every(value=>observed.has(value));
  const expectedDefault=tier>=9?['+','−','×','÷']:tier>=8?['+','−','×']:tier>=6?['+','−']:['+'];
  const defaultPass=defaultMode&&!defaultMode.missing&&expectedDefault.includes(defaultMode.op);
  const geometryPass=geometrySamples.length>=7&&geometrySamples.every(sample=>sample.minTarget>=44&&sample.minNavTarget>=44&&sample.horizontalOverflow<=1&&!sample.clippedTargets&&!sample.navClipped&&!sample.navContentOverlap);
  const rewardPass=rewardResult?.title&&rewardResult.hint==='Saved in your gallery'&&rewardResult.inViewport&&repeatAfter===1;
  return {id:rowId,activityId:'math',route:'/learning/math.html',tier,viewport:viewportName,checks:{
    input:!fatal&&defaultPass&&settingsPass&&rounds.length===8&&rounds.every(round=>round.wrongRecovered&&round.wrongDidNotProgress&&round.exactIncrement)?'PASS':'FAIL',
    progression:!fatal&&counterBefore===119&&counterAfter===127?'PASS':'FAIL',
    rewards:!fatal&&rewardPass?'PASS':'FAIL',
    restart:!fatal&&navigationRecovered&&reloadRecovered?'PASS':'FAIL',
    long_repeated_play:!fatal&&modesPass?'PASS':'FAIL',
    visual_quality:!fatal&&geometryPass?'BLK':'FAIL',
  },defaultMode,expectedDefault,settingsPass,counterBefore,counterAfter,repeatAfter,reward:rewardResult,navigationRecovered,reloadRecovered,rounds,geometrySamples,pageErrors,failedLocalRequests,screenshotCount:screenshots.length,fatal};
}

async function runProbe(browser,base,viewportName,viewport,tier,allScreenshots){
  const rowId=`math-probe:T${tier}:${viewportName}`;
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},isMobile:viewport.isMobile,hasTouch:viewport.hasTouch,serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort('blockedbyclient'));
  await context.addInitScript(init,{tier,bday:birthday(tier),features:true,counter:119});
  const page=await context.newPage(),screenshots=[],rounds=[],geometrySamples=[];let rewardResult=null,fatal=null;
  try{
    await page.goto(base+'/learning/math.html',{waitUntil:'load'});
    for(let index=0;index<3;index++){
      geometrySamples.push(await geometry(page));await saveShot(page,rowId,`round-${index+1}`,screenshots);
      const next=[PLANS[3],PLANS[4],PLANS[0]][index];
      const round=await solveRound(page,index===0,next);rounds.push({op:round.op,missing:round.missing,exactIncrement:round.exactIncrement,wrongRecovered:round.wrongRecovered,wrongDidNotProgress:round.wrongDidNotProgress});
      if(index===0)rewardResult=await inspectReward(page,rowId,screenshots);
      if(index<2)await waitNext(page,round.oldEquation);
    }
  }catch(error){fatal=`${error.name}: ${error.message}`;try{await saveShot(page,rowId,'failure',screenshots)}catch{}}
  finally{allScreenshots.push(...screenshots.map(item=>({...item,viewport:viewportName,tier})));await context.close()}
  const geometryPass=geometrySamples.length===3&&geometrySamples.every(sample=>sample.minTarget>=44&&sample.minNavTarget>=44&&sample.horizontalOverflow<=1&&!sample.clippedTargets&&!sample.navClipped&&!sample.navContentOverlap);
  return{id:rowId,tier,viewport:viewportName,pass:!fatal&&geometryPass&&rounds.length===3&&rounds.every(round=>round.exactIncrement&&round.wrongRecovered&&round.wrongDidNotProgress)&&rewardResult?.inViewport,reward:rewardResult,rounds,geometrySamples,screenshotCount:screenshots.length,fatal};
}

if(path.dirname(OUT)!==path.join(ROOT,'tests','e2e','out')||path.basename(OUT)!=='math-visual-play')throw new Error(`refusing unsafe output cleanup: ${OUT}`);
rmSync(OUT,{recursive:true,force:true});mkdirSync(path.join(OUT,'contact-sheets'),{recursive:true});
const port=await freePort(),base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,[path.join(ROOT,'scripts/serve.mjs')],{cwd:ROOT,env:{...process.env,PORT:String(port)},stdio:'ignore'});
for(let attempt=0;attempt<100;attempt++){try{await health(base);break}catch{if(attempt===99)throw new Error('local server did not start');await new Promise(resolve=>setTimeout(resolve,100))}}
const browser=await chromium.launch(),jobs=[],rows=[],probes=[],screenshots=[];
for(const viewportName of SELECTED_VIEWPORTS)for(const tier of SELECTED_TIERS)jobs.push({kind:'row',viewportName,viewport:VIEWPORTS[viewportName],tier});
if(RUN_PROBES)for(const [viewportName,viewport] of Object.entries(PROBES))for(const tier of [4,6,8,10])jobs.push({kind:'probe',viewportName,viewport,tier});
try{
  async function worker(){while(jobs.length){const job=jobs.shift();if(job.kind==='row'){const row=await runCell(browser,base,job.viewportName,job.viewport,job.tier,screenshots);rows.push(row);console.log(`${row.fatal?'ERROR':'DONE'} ${row.id} rounds=${row.rounds.length}${row.fatal?' '+row.fatal:''}`)}else{const probe=await runProbe(browser,base,job.viewportName,job.viewport,job.tier,screenshots);probes.push(probe);console.log(`${probe.pass?'DONE':'ERROR'} ${probe.id}${probe.fatal?' '+probe.fatal:''}`)}}}
  await Promise.all([worker(),worker(),worker(),worker()]);
  for(const viewportName of [...Object.keys(VIEWPORTS),...Object.keys(PROBES)])await createContactSheet(browser,screenshots.filter(item=>item.viewport===viewportName),path.join(OUT,'contact-sheets',`${viewportName}.png`),`Math Mountain ${viewportName}`);
}finally{await browser.close();server.kill()}
rows.sort((a,b)=>a.id.localeCompare(b.id));probes.sort((a,b)=>a.id.localeCompare(b.id));
const counts={rows:rows.length,pass:0,fail:0,blk:0};for(const row of rows)for(const status of Object.values(row.checks))counts[status.toLowerCase()]++;
const report={auditStart:AUDIT_START,mathSha256:sha256(path.join(ROOT,'learning/math.html')),generatedAt:new Date().toISOString(),evidenceBoundary:'Browser-driven pointer/touch emulation and silent local media stubs with inspected renders; no physical child-touch or human-audible voice-quality claim.',counts,screenshots:screenshots.length,recordedCorrectAnswers:rows.reduce((sum,row)=>sum+Math.max(0,(row.counterAfter||0)-(row.counterBefore||0)),0),rewardOverlaps:rows.filter(row=>row.reward?.overlaps?.length).map(row=>({id:row.id,overlaps:row.reward.overlaps})),rows,probes};
writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({rows:rows.length,...counts,probes:probes.length,probePass:probes.filter(item=>item.pass).length,screenshots:screenshots.length,recordedCorrectAnswers:report.recordedCorrectAnswers,rewardOverlaps:report.rewardOverlaps.length}));
if(rows.length!==20||rows.some(row=>row.fatal||Object.values(row.checks).includes('FAIL')||row.pageErrors.length||row.failedLocalRequests.length)||probes.length!==8||probes.some(probe=>!probe.pass))process.exitCode=1;
