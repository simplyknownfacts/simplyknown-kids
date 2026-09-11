import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
let server,browser,base;
before(async()=>{
 const port=await new Promise(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 base='http://127.0.0.1:'+port;
 server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:'ignore'});
 for(let i=0;i<60;i++){try{if((await fetch(base+'/__health.json')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();
});
after(async()=>{await browser?.close();server?.kill();});
async function open(reducedMotion='no-preference'){
 const ctx=await browser.newContext({viewport:{width:756,height:1270},serviceWorkers:'block',reducedMotion});
 await ctx.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await ctx.addInitScript(()=>{localStorage.setItem('vb_profiles',JSON.stringify([{id:'hold-test',name:'Test Explorer',birthday:'2022-01-01',mascot:{id:'bunny'},features:{},youtube:[]} ]));localStorage.setItem('vb_active_id','hold-test');});
 const page=await ctx.newPage();page.setDefaultTimeout(5000);await page.goto(base+'/index.html');
 const gear=page.locator('#settingsGear');await gear.waitFor();
 return {ctx,page,gear};
}
const progress=gear=>gear.evaluate(e=>Number(e.style.getPropertyValue('--vb-hold-progress')||0));

test('a steady edge hold survives press styling and opens settings after three seconds',async()=>{
 const {ctx,page,gear}=await open();try{
  const b=await gear.boundingBox();await page.mouse.move(b.x+b.width-1,b.y+b.height/2);await page.mouse.down();
  await page.waitForTimeout(100);await page.mouse.move(b.x+b.width-2,b.y+b.height/2);
  await page.waitForTimeout(1000);assert.ok(page.url().endsWith('/index.html'));
  await page.waitForURL('**/parent/settings.html',{timeout:3000});await page.mouse.up();
 }finally{await ctx.close();}
});

test('real touch release resets, and a fresh three-second touch opens the parent PIN page',async()=>{
 const {ctx,page,gear}=await open();try{
  const cdp=await ctx.newCDPSession(page),b=await gear.boundingBox();
  const point={x:b.x+b.width/2,y:b.y+b.height/2,id:1,radiusX:5,radiusY:5};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  await page.waitForTimeout(800);assert.ok(await progress(gear)>.15);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await progress(gear),0);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  await page.waitForURL('**/parent/settings.html',{timeout:4200});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(await page.locator('body').textContent(),'settings page did not load');
 }finally{await ctx.close();}
});

test('fill tracks elapsed time even with reduced motion and resets after an early release',async()=>{
 const {ctx,page,gear}=await open('reduce');try{
  const b=await gear.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
  await page.waitForTimeout(1100);const first=await progress(gear);assert.ok(first>.25&&first<.6,`progress=${first}`);
  const painted=await gear.locator('.vb-hold-fill').boundingBox();assert.ok(painted.width>b.width*.25&&painted.width<b.width*.6,'fill must visibly grow');
  await page.waitForTimeout(600);assert.ok(await progress(gear)>first+.1);
  await page.mouse.up();assert.equal(await progress(gear),0);
  await page.waitForTimeout(1600);assert.ok(page.url().endsWith('/index.html'),'released hold activated later');
  assert.match(await gear.textContent(),/Hold 3 seconds/);
 }finally{await ctx.close();}
});

test('rapid taps and cancelled ownership cannot accumulate into a settings activation',async()=>{
 const {ctx,page,gear}=await open();try{
  await page.evaluate(()=>{window.holdCalls=0;const b=document.createElement('button');b.id='holdProbe';b.textContent='Hold';document.body.append(b);holdToActivate(b,()=>holdCalls++,{ms:140});});
  const probe=page.locator('#holdProbe');
  for(let i=0;i<20;i++)await gear.click();
  for(const end of ['pointercancel','lostpointercapture']){
   await probe.dispatchEvent('pointerdown',{pointerId:7,isPrimary:true,button:0});
   await probe.dispatchEvent(end,{pointerId:7});await page.waitForTimeout(200);
  }
  for(const event of ['pagehide','blur']){
   await probe.dispatchEvent('pointerdown',{pointerId:7,isPrimary:true,button:0});
   await page.evaluate(event=>window.dispatchEvent(new Event(event)),event);await page.waitForTimeout(200);
  }
  await probe.dispatchEvent('pointerdown',{pointerId:9,isPrimary:false,button:0});await page.waitForTimeout(200);
  await probe.dispatchEvent('pointerdown',{pointerId:10,isPrimary:true,button:2});await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>holdCalls),0);
  await probe.dispatchEvent('pointerdown',{pointerId:11,isPrimary:true,button:0});
  await probe.dispatchEvent('pointerup',{pointerId:12});await page.waitForTimeout(190);
  assert.equal(await page.evaluate(()=>holdCalls),1,'other finger cancelled owner or hold failed');
  await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>holdCalls),1,'one hold fired repeatedly');
  assert.ok(page.url().endsWith('/index.html'));
 }finally{await ctx.close();}
});

test('moving outside cancels and keyboard uses the same full hold with repeat protection',async()=>{
 const {ctx,page,gear}=await open();try{
  const b=await gear.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
  await page.waitForTimeout(500);await page.mouse.move(b.x-40,b.y-40);await page.waitForTimeout(100);assert.equal(await progress(gear),0);await page.mouse.up();
  await gear.focus();await page.keyboard.down('Space');await page.waitForTimeout(600);await page.keyboard.up('Space');
  assert.ok(page.url().endsWith('/index.html'),'keyboard tap bypassed hold');
  await page.keyboard.down('Enter');await page.waitForTimeout(1200);await page.keyboard.down('Enter');
  assert.ok(await progress(gear)>.3,'key repeat restarted timer');
  await page.waitForURL('**/parent/settings.html',{timeout:3000});await page.keyboard.up('Enter');
 }finally{await ctx.close();}
});
