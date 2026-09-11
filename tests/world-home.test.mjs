import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const child = { id: 'world-test', name: '<Explorer>', birthday: '2021-01-01', color: '#78b99b', voice: 'girl', mascot: { id: 'bunny', voice: 'girl' }, features: {}, activitiesVisible: {} };
test('home exposes seven real destinations and no duplicate Ribbons footer control',()=>{
  const html=readFileSync(path.join(ROOT,'home.html'),'utf8');
  const kinds=[...html.matchAll(/data-world="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(kinds,['games','learn','art','watch','listen','my-room','ribbons']);
  assert.doesNotMatch(html,/id="ribbonLink"/);
});
async function freePort() {
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve)); return port;
}
// Seven viewport runs and the media/navigation cases share this outer budget.
// Keep the individual operation deadlines below; software rendering can take
// more than two minutes in total even while every behavior check passes.
test('3D world fits, uses building geometry for taps and keeps its buddy in a side boat', { timeout: 180000 }, async t => {
  const port = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.mjs')], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: ['ignore','pipe','pipe'] });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('local world server did not start')), 12000);
      server.stdout.on('data', d => { if (String(d).includes('localhost:' + port)) { clearTimeout(timer); resolve(); } });
      server.once('error', e => { clearTimeout(timer); reject(e); });
      server.once('exit', () => { clearTimeout(timer); reject(new Error('local server exited')); });
    });
    browser = await chromium.launch();
    const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await context.addInitScript(p => { localStorage.setItem('vb_profiles', JSON.stringify([p])); localStorage.setItem('vb_active_id', p.id); }, child);
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    async function open() {
      await page.goto(`http://127.0.0.1:${port}/home.html`);
      await page.waitForSelector('#worldScene[data-state="ready"]');
      await page.waitForFunction(() => !!window.vbWorldScene);
    }
    async function hutPoint(kind) {
      return page.evaluate(kind => {
        const p=vbWorldScene.snapshot().houses.find(h=>h.kind===kind).point;
        const r=document.getElementById('worldCanvas').getBoundingClientRect();
        return {x:r.x+p.x,y:r.y+p.y};
      },kind);
    }
    for (const [width,height] of [[390,844],[320,568],[768,1024],[756,1270],[1440,900],[844,390],[568,320]]) {
      await t.test(`${width}×${height}: all seven real buildings fit and receive their own physical taps`, async () => {
        await page.setViewportSize({width,height}); await open();
        const result=await page.evaluate(()=>{
          const canvas=document.getElementById('worldCanvas'),r=canvas.getBoundingClientRect();
          const s=vbWorldScene.snapshot();
          return {overflow:document.documentElement.scrollWidth>innerWidth || document.documentElement.scrollHeight>innerHeight,
            gl:!!canvas.getContext('webgl2'),triangles:s.triangles,pixelRatio:s.pixelRatio,
            islands:s.islands,companionBoat:s.companionBoat,companionBoatBounds:s.companionBoatBounds,
            houses:s.houses.map(h=>{
              const b=document.querySelector('[data-world="'+h.kind+'"]').getBoundingClientRect();
              return {kind:h.kind,point:h.point,pick:vbWorldScene.pick(r.x+h.point.x,r.y+h.point.y),
                center:h.center,scale:h.scale,label:h.label,labelTexture:h.labelTexture,roofRibbon:h.roofRibbon,
                box:{x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height}};
            }),companion:(()=>{const b=document.getElementById('worldCompanion').getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};})()};
        });
        assert.equal(result.overflow,false);assert.equal(result.gl,true);assert.ok(result.triangles>1000,'no volumetric geometry rendered');
        assert.equal(result.houses.length,7);
        for(const h of result.houses){
          assert.ok(h.box.x>=0 && h.box.y>=0 && h.box.right<=width && h.box.bottom<=height,JSON.stringify(h));
          assert.ok(h.box.width>=44 && h.box.height>=44,JSON.stringify(h));
          assert.equal(h.pick,h.kind,JSON.stringify(h));
          assert.ok(h.labelTexture.width>=1536 && h.labelTexture.height>=384,`${h.kind} label texture is too small`);
        }
        assert.equal(result.islands.some(island=>island.kind==='companion'),false,'the central mascot island still exists');
        assert.ok(result.companionBoat,'the child companion has no side boat');
        assert.ok(result.companionBoatBounds.every(point=>point.x>=0&&point.x<=width&&point.y>=0&&point.y<=height),`3D companion boat is clipped: ${JSON.stringify(result.companionBoatBounds)}`);
        assert.ok(result.companion.x>=0&&result.companion.y>=0&&result.companion.right<=width&&result.companion.bottom<=height,'companion boat is clipped');
        assert.equal(result.houses.find(h=>h.kind==='ribbons').roofRibbon,true,'Ribbons needs a large roof ribbon');
        for(const house of result.houses){
          const a=result.companion,b=house.box;
          assert.equal(a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y,false,`companion boat overlaps ${house.kind}: ${JSON.stringify({companion:a,house:b,boat:result.companionBoat})}`);
        }
        if(width<=600)for(let i=0;i<result.houses.length;i++)for(let j=i+1;j<result.houses.length;j++){
          const a=result.houses[i],b=result.houses[j],distance=Math.hypot(a.point.x-b.point.x,a.point.y-b.point.y);
          assert.ok(distance>=44,`${a.kind} and ${b.kind} do not have distinct 44px touch centers (${distance.toFixed(1)}px)`);
        }
        const rows=Map.groupBy(result.houses,house=>house.center[2].toFixed(2));
        assert.deepEqual([...rows.values()].map(row=>row.length).sort((a,b)=>b-a),[4,3],'huts are not arranged in two consistent rows');
        const bottom=[...rows.values()].sort((a,b)=>b[0].center[2]-a[0].center[2])[0].map(h=>h.kind).sort();
        assert.deepEqual(bottom,['listen','my-room','ribbons']);
        if(width<=600)assert.ok(result.houses.every(h=>h.scale[0]>=1.3),'phone huts were not substantially enlarged');
        // Physical browser pointer events, not DOM .click(): each facade must
        // select its own building. Stub only the eventual page transition.
        await page.evaluate(()=>{window.testNav=[];window.goTo=p=>window.testNav.push(p);});
        for(const kind of ['games','learn','art','watch','listen','ribbons','my-room']){
          const p=await hutPoint(kind);await page.mouse.click(p.x,p.y);
          const expected={games:'games/index.html',learn:'learning/index.html',art:'art/index.html',watch:'videos/index.html',listen:'listen/index.html',ribbons:'achievements.html','my-room':'my-room.html'}[kind];
          assert.deepEqual(await page.evaluate(()=>window.testNav),[expected]);
          await open();await page.evaluate(()=>{window.testNav=[];window.goTo=p=>window.testNav.push(p);});
        }
      });
    }
    await t.test('safe profile text, selected companion, local Listen, and 30 rapid physical taps',async()=>{
      await page.setViewportSize({width:390,height:844});await open();
      assert.equal(await page.locator('#hiText').textContent(),'Hello, <Explorer>!');
      assert.equal(await page.locator('#worldCompanion').getAttribute('data-animal'),'bunny');
      assert.equal(await page.locator('[data-world="my-room"] span').textContent(),'<Explorer>’s Room');
      assert.equal(await page.locator('[data-world="my-room"]').getAttribute('aria-label'),'<Explorer>’s Room — choose your look and animal buddy');
      assert.equal(await page.evaluate(()=>vbWorldScene.snapshot().houses.find(h=>h.kind==='my-room').label),'<Explorer>’s Room');
      assert.deepEqual(await page.evaluate(()=>[vbRoomLabelFor(''),vbRoomLabelFor('Ava T'),vbRoomLabelFor('Alexandria-Superlong')]),['My Room','Ava’s Room','Alexandria…’s Room']);
      await page.waitForFunction(()=>[...document.querySelectorAll('#mascotWrap video')].some(v=>v.readyState>=2 && v.currentSrc.includes('/bunny/')));
      await page.evaluate(()=>{window.testNav=[];window.goTo=p=>window.testNav.push(p);});
      const listen=await hutPoint('listen');await page.mouse.click(listen.x,listen.y);
      assert.deepEqual(await page.evaluate(()=>window.testNav),['listen/index.html']);
      await open();
      await page.evaluate(()=>{window.testNav=[];window.goTo=p=>window.testNav.push(p);});
      const games=await hutPoint('games');for(let i=0;i<30;i++)await page.mouse.click(games.x,games.y);
      assert.deepEqual(await page.evaluate(()=>window.testNav),['games/index.html']);
      assert.equal(await page.locator('#helloCompanion').count(),0);
      assert.deepEqual(await page.locator('.house span').allTextContents(),['Games','Learn','Art','Watch','Listen','<Explorer>’s Room','Ribbons']);
      assert.equal(await page.locator('#ribbonLink').count(),0,'Ribbons still has a duplicate footer button');
    });
    await t.test('keyboard equivalent selects a hut; dragging between huts does not navigate',async()=>{
      await open();await page.evaluate(()=>{window.testNav=[];window.goTo=p=>window.testNav.push(p);});
      const a=await hutPoint('games'),b=await hutPoint('art');
      await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y);await page.mouse.up();
      assert.deepEqual(await page.evaluate(()=>window.testNav),[]);
      await page.locator('[data-world="learn"]').focus();await page.keyboard.press('Enter');
      assert.deepEqual(await page.evaluate(()=>window.testNav),['learning/index.html']);
    });
    await t.test('buddy stays with its gently bobbing side boat; sound mashing starts one clip',async()=>{
      await page.emulateMedia({reducedMotion:'no-preference'});await open();
      await page.waitForFunction(()=>[...document.querySelectorAll('#mascotWrap video')].some(v=>v.readyState>=2));
      const before=await page.locator('#worldCompanion').boundingBox();
      const frames=await page.evaluate(()=>vbWorldScene.snapshot().frames);
      await page.waitForTimeout(6100);
      const after=await page.locator('#worldCompanion').boundingBox();
      assert.ok(Math.hypot(after.x-before.x,after.y-before.y)<2,'animal drifted away from its boat');
      assert.ok(await page.evaluate(()=>vbWorldScene.snapshot().frames)>frames,'3D world did not animate');
      await page.evaluate(()=>{
        window.testSounds=[];
        window.Audio=class {constructor(src){this.src=src;testSounds.push(this);}play(){return Promise.resolve();}pause(){}};
      });
      const buddy=await page.locator('#worldCompanion').boundingBox();
      for(let i=0;i<20;i++)await page.mouse.click(buddy.x+buddy.width/2,buddy.y+buddy.height*.6);
      assert.deepEqual(await page.evaluate(()=>testSounds.map(a=>a.src)),['./audio/sounds/rabbit.mp3']);
      await page.evaluate(()=>testSounds[0].onended());await page.locator('#worldCompanion').click();
      assert.equal(await page.evaluate(()=>testSounds.length),2,'finished sound did not release input');
    });
    await t.test('reduced motion stops decorative renderer and companion without hiding them',async()=>{
      await page.emulateMedia({reducedMotion:'reduce'});await open();
      await page.waitForFunction(()=>[...document.querySelectorAll('#mascotWrap video')].some(v=>v.readyState>=2));
      await page.waitForTimeout(250);
      const before=await page.locator('#worldCompanion').boundingBox(),frames=await page.evaluate(()=>vbWorldScene.snapshot().frames);
      await page.waitForTimeout(650);
      assert.deepEqual(await page.locator('#worldCompanion').boundingBox(),before);
      assert.equal(await page.evaluate(()=>vbWorldScene.snapshot().frames),frames);
      assert.equal(await page.locator('#mascotWrap video').evaluateAll(vs=>vs.every(v=>v.paused)),true);
      assert.equal(await page.locator('#worldCanvas').isVisible(),true);
    });
    await t.test('high-DPR phones render the scene and sign textures sharply',async()=>{
      const sharpContext=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce',deviceScaleFactor:3});
      try{
        await sharpContext.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
        await sharpContext.addInitScript(p=>{localStorage.setItem('vb_profiles',JSON.stringify([p]));localStorage.setItem('vb_active_id',p.id);},child);
        const sharpPage=await sharpContext.newPage();await sharpPage.setViewportSize({width:390,height:844});
        await sharpPage.goto(`http://127.0.0.1:${port}/home.html`);await sharpPage.waitForFunction(()=>!!window.vbWorldScene);
        const sharp=await sharpPage.evaluate(()=>{const r=document.getElementById('worldCanvas').getBoundingClientRect(),s=vbWorldScene.snapshot();return{pixelRatio:s.pixelRatio,cssWidth:r.width,drawWidth:document.getElementById('worldCanvas').width};});
        assert.equal(sharp.pixelRatio,2);assert.equal(sharp.drawWidth,sharp.cssWidth*2);
      }finally{await sharpContext.close();}
    });
    await t.test('a stalled 3D import exposes working huts, then upgrades when loading resumes',async()=>{
      let release;
      const gate=new Promise(resolve=>{release=resolve;});
      await page.route('**/js/world-scene.js',async route=>{await gate;await route.continue();});
      try {
        await page.goto(`http://127.0.0.1:${port}/home.html`,{waitUntil:'domcontentloaded'});
        await page.waitForSelector('#worldScene[data-state="fallback"]',{timeout:6000});
        await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));
        const watch=await page.locator('[data-world="watch"]').boundingBox();
        await page.mouse.click(watch.x+watch.width/2,watch.y+watch.height/2);
        assert.match(await page.locator('#worldStatus').textContent(),/needs a connection/);
        await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true}));
        release();await page.waitForSelector('#worldScene[data-state="ready"]');
        assert.equal(await page.locator('#worldCanvas').isVisible(),true);
        assert.equal(await page.locator('#worldStatus').textContent(),'');
      } finally {release();await page.unroute('**/js/world-scene.js');}
    });
    await t.test('lost graphics context retains navigable named hut fallback',async()=>{
      await open();
      await page.evaluate(()=>document.getElementById('worldCanvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
      await page.waitForSelector('#worldScene[data-state="fallback"]');
      await page.locator('[data-world="games"]').click();await page.waitForURL('**/games/index.html');
    });
    assert.deepEqual(errors,[]);await context.close();
  } finally {
    if(browser)await browser.close();
    const ended=once(server,'exit');server.kill();await ended;
  }
});
