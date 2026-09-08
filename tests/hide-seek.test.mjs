import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
let server, browser, base;
before(async () => {
  const port = await new Promise(resolve => { const s=createServer(); s.listen(0,'127.0.0.1',()=>{const p=s.address().port; s.close(()=>resolve(p));}); });
  base=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:'ignore'});
  for(let i=0;i<60;i++){try{if((await fetch(base+'/__health.json')).ok)break;}catch{} await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch();
});
after(async()=>{await browser?.close();server?.kill();});
async function open(tier=5,{features={},viewport={width:390,height:844},fallback=false}={}){
  const ctx=await browser.newContext({viewport,serviceWorkers:'block',reducedMotion:'reduce'});
  await ctx.route('**/*',r=> new URL(r.request().url()).origin===base?r.continue():r.abort());
  if(fallback) await ctx.route('**/hide-seek-scene.js',r=>r.abort());
  await ctx.addInitScript(({tier,features})=>{
    localStorage.setItem('vb_profiles',JSON.stringify([{id:'seek-test',name:'Test Explorer',birthday:'2022-01-01',voice:'girl',mascot:{id:'bunny'},tierOverrides:{'peek-a-boo':tier,'surprise-pop':tier},features:{'peek-a-boo':features},activitiesVisible:{},youtube:[]}]));
    localStorage.setItem('vb_active_id','seek-test');
    HTMLMediaElement.prototype.play=()=>Promise.resolve();
    Math.random=()=>0.25;
  },{tier,features});
  const page=await ctx.newPage();page.setDefaultTimeout(5000);
  await page.goto(base+'/games/peek-a-boo.html');
  await page.locator('#roundAction').waitFor();
  await page.evaluate(()=>{window.awards=[];window.vbProgress={record:id=>awards.push(id)};});
  return {ctx,page};
}
const phase=(page,value)=>page.waitForFunction(value=>document.querySelector('#stage').dataset.phase===value,value);
async function shownSpot(page){return page.locator('.peek-marker').evaluate(e=>Number(e.closest('button').dataset.spot));}
async function hide(page){await page.locator('#roundAction').click();await phase(page,'seek');}

test('Hide and Seek shows a location first, hides the same animal, and never awards a wrong place',async()=>{
  const {ctx,page}=await open();try{
    const target=await shownSpot(page), spots=page.locator('.hiding-spot');
    assert.equal(await spots.count(),3);
    await spots.nth(target).dispatchEvent('click');
    assert.deepEqual(await page.evaluate(()=>awards),[],'watching is not an answer');
    await hide(page);
    assert.equal(await page.locator('.peek-marker').count(),0,'hidden location is leaked by the marker');
    const wrong=(target+1)%3; await spots.nth(wrong).click();
    assert.match(await page.locator('#hint').textContent(),/empty|another/i);
    assert.deepEqual(await page.evaluate(()=>awards),[]);
    await page.locator('#showAgain').click();await phase(page,'watch');
    assert.equal(await shownSpot(page),target,'replay rerolled the hiding place');
    await hide(page);
    const r=await spots.nth(target).boundingBox();
    for(let i=0;i<12;i++)await page.mouse.click(r.x+r.width/2,r.y+r.height*.7);
    await phase(page,'found');
    assert.deepEqual(await page.evaluate(()=>awards),['peek-a-boo']);
    await page.waitForTimeout(1000);await phase(page,'found');
    await page.locator('#roundAction').click();await phase(page,'watch');
    assert.notEqual(await shownSpot(page),target,'next round should use a different place');
    assert.deepEqual(await page.evaluate(()=>awards),['peek-a-boo']);
  }finally{await ctx.close();}
});

test('Hide and Seek adapts spot count and supports keyboard play without mouse guessing',async t=>{
  for(const [tier,features,count] of [[1,{},2],[4,{},2],[5,{},3],[1,{multiChoice:true},3]])await t.test('tier '+tier+' '+JSON.stringify(features),async()=>{
    const {ctx,page}=await open(tier,{features});try{
      assert.equal(await page.locator('.hiding-spot').count(),count);
      const target=await shownSpot(page);
      await page.waitForFunction(()=>!document.querySelector('#roundAction').disabled);await page.locator('#roundAction').focus();await page.keyboard.press('Enter');await phase(page,'seek');
      await page.locator('.hiding-spot').nth(target).focus();await page.keyboard.press('Space');await phase(page,'found');
      assert.deepEqual(await page.evaluate(()=>awards),['peek-a-boo']);
    }finally{await ctx.close();}
  });
});

test('Leaving during hide cancels pending state; restored page offers one coherent round',async()=>{
  const {ctx,page}=await open();try{
    await page.locator('#roundAction').click();
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
    const before=await page.locator('#stage').getAttribute('data-phase');
    await page.waitForTimeout(700);
    assert.equal(await page.locator('#stage').getAttribute('data-phase'),before);
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
    await phase(page,'watch');
    const target=await shownSpot(page);await hide(page);await page.locator('.hiding-spot').nth(target).click();
    assert.deepEqual(await page.evaluate(()=>awards),['peek-a-boo']);
  }finally{await ctx.close();}
});

test('The game still teaches and accepts the shown location when the 3D renderer cannot load',async()=>{
  const {ctx,page}=await open(3,{fallback:true});try{
    await page.waitForFunction(()=>document.querySelector('#stage').dataset.renderer==='fallback');
    const target=await shownSpot(page);await hide(page);await page.locator('.hiding-spot').nth(target).click();await phase(page,'found');
    assert.deepEqual(await page.evaluate(()=>awards),['peek-a-boo']);
  }finally{await ctx.close();}
});

test('Hiding spots and controls fit phone, tall comment viewport, and landscape',async t=>{
  for(const viewport of [{width:320,height:568},{width:756,height:1270},{width:844,height:390}])await t.test(JSON.stringify(viewport),async()=>{
    const {ctx,page}=await open(5,{viewport});try{
      await page.waitForFunction(()=>['webgl','fallback'].includes(document.querySelector('#stage').dataset.renderer));
      for(const button of await page.locator('.hiding-spot,#roundAction').all()){
        const r=await button.boundingBox();assert.ok(r&&r.width>=44&&r.height>=44,'target smaller than44px');
        assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=viewport.width+1&&r.y+r.height<=viewport.height+1,'target outside viewport');
      }
      const target=await shownSpot(page);await hide(page);await page.locator('.hiding-spot').nth(target).click();await phase(page,'found');
    }finally{await ctx.close();}
  });
});

// Uses the child-visible peek marker, then physical taps. The screenshot review
// separately checks that these markers sit on the actual rendered bushes.
test('All three watched locations remain tappable in the live 3D scene',async()=>{
  const {ctx,page}=await open();try{
    await page.waitForFunction(()=>document.querySelector('#stage').dataset.renderer==='webgl');
    const seen=new Set();
    for(let round=0;round<3;round++){
      const target=await shownSpot(page);seen.add(target);
      await hide(page);
      const r=await page.locator('.hiding-spot').nth(target).boundingBox();
      await page.mouse.click(r.x+r.width/2,r.y+r.height*.7);await phase(page,'found');
      assert.equal(await page.evaluate(()=>awards.length),round+1);
      if(round<2) await page.locator('#roundAction').click();
    }
    assert.equal(seen.size,3);
    // The visible canvas has been allocated and WebGL is actually available.
    assert.equal(await page.locator('canvas').evaluate(c=>!!c.getContext('webgl2')&&c.width>0&&c.height>0),true);
  }finally{await ctx.close();}
});
