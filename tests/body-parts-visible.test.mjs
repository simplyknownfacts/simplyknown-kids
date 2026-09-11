import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import path from 'node:path';
const ROOT=path.resolve(import.meta.dirname,'..');
let browser,server,base;
before(async()=>{
 const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
 const port=probe.address().port;await new Promise(r=>probe.close(r));base='http://localhost:'+port;
 server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:ROOT,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('server startup')),12000);server.stdout.on('data',d=>{if(String(d).includes('localhost:'+port)){clearTimeout(timer);resolve();}});});
 browser=await chromium.launch();
});
after(async()=>{await browser?.close();server?.kill();});
async function fixture(id='10',target='knee',size={width:756,height:1270},blockImage=false) {
 const ctx=await browser.newContext({viewport:size,reducedMotion:'reduce',serviceWorkers:'block'});
 await ctx.route('**/*',r=>new URL(r.request().url()).hostname==='localhost'?r.continue():r.abort());
 await ctx.addInitScript(()=>{
  const p={id:'visible-anatomy',name:'Test child',birthday:'2021-01-01',voice:'girl',features:{},tierOverrides:{'body-parts':8}};
  localStorage.setItem('vb_profiles',JSON.stringify([p]));localStorage.setItem('vb_active_id',p.id);
 });
 const page=await ctx.newPage();
 await page.route('**/learning/body-parts.html',async route=>{
  let html=await readFile(path.join(ROOT,'learning/body-parts.html'),'utf8');
  // Fix the picture and requested word only; input and rendering remain real.
  const initial='let bodyIdx = Math.floor(Math.random() * BODIES.length);';
  assert.ok(html.includes(initial));
  html=html.replace(initial,`let bodyIdx = BODIES.findIndex(b=>b.img.endsWith('body-${id}.png'));`)
    .replace('target = _drawTarget();',`target = '${target}';`);
  await route.fulfill({contentType:'text/html',body:html});
 });
 if(blockImage)await page.route('**/img/bodies/*.png',r=>r.abort());
 await page.goto(base+'/learning/body-parts.html');await page.waitForSelector(blockImage?'.picture-retry':'#figure .hit');
 await page.evaluate(()=>document.fonts?.ready);
 await page.evaluate(()=>{window.completed=[];window.vbProgress={record:id=>completed.push(id),mastery:()=>{}};});
 return {ctx,page};
}
async function tapArt(page,x,y){
 const figure=page.locator('#figure'),face=await figure.evaluate(el=>el.classList.contains('face-mode'));
 const r=await figure.boundingBox();
 const px=face?(x-20)/60*100:x,py=face?y/45*100:y;
 await page.mouse.click(r.x+r.width*px/100,r.y+r.height*py/100);
}
async function tapHitCenter(page,name,index=0){
 const r=await page.locator(`.hit[data-name="${name}"]`).nth(index).boundingBox();
 await page.mouse.click(r.x+r.width/2,r.y+r.height/2);
}
test('visible knee on the reported dress figure is accepted on phone and tall screen',async()=>{
 // Read from the DRAWING: knees below the dress, above the ankles. These
 // coordinates do not come from generated hit buttons or the app's map.
 for(const size of [{width:390,height:844},{width:756,height:1270}]){
  const {ctx,page}=await fixture('10','knee',size);
  await tapArt(page,45.5,80);
  assert.deepEqual(await page.evaluate(()=>completed),['body-parts']);
  assert.equal(await page.locator('.hit.flash').count(),0,'successful taps must not cover the artwork with a marker');
  assert.match(await page.locator('#hint').textContent(),/Yes! You found the knee!/);
  await ctx.close();
 }
});
test('blank space beside the drawing must never answer a question',async()=>{
 const {ctx,page}=await fixture('10','foot');await tapArt(page,2,97);
 assert.deepEqual(await page.evaluate(()=>completed),[],'empty background awarded a body part');
 assert.equal(await page.locator('.hit.flash').count(),0);await ctx.close();
});

test('face questions enlarge the artwork and keep distinct phone targets aligned',async()=>{
 for(const size of [{width:390,height:844},{width:320,height:568}]){
  const {ctx,page}=await fixture('10','eye',size);
  const layout=await page.locator('#figure').evaluate(figure=>{
   const box=figure.getBoundingClientRect();
   const read=el=>{const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height,left:r.left,top:r.top,right:r.right,bottom:r.bottom}};
   const eyes=[...figure.querySelectorAll('.hit[data-name="eye"]')].map(read);
   const ears=[...figure.querySelectorAll('.hit[data-name="ear"]')].map(read);
   const rect=el=>{const r=el?.getBoundingClientRect();return r&&{left:r.left,top:r.top,right:r.right,bottom:r.bottom}};
   return{face:figure.classList.contains('face-mode'),box:{left:box.left,top:box.top,right:box.right,bottom:box.bottom,width:box.width,height:box.height},gear:rect(document.querySelector('#gameSettingsGear')),back:rect(document.querySelector('.back-btn')),eyes,ears};
  });
  assert.equal(layout.face,true,`${size.width}x${size.height} kept the whole body for an eye question`);
  assert.ok(layout.box.width>=240,`face close-up is ${layout.box.width}px wide at ${size.width}x${size.height}`);
  assert.ok(Math.abs(layout.eyes[0].x-layout.eyes[1].x)>=60,`eyes remain too close to distinguish at ${size.width}x${size.height}`);
  assert.ok([...layout.eyes,...layout.ears].every(hit=>Math.min(hit.width,hit.height)>=44),`face target fell below 44px at ${size.width}x${size.height}`);
  assert.ok([...layout.eyes,...layout.ears].every(hit=>hit.left>=layout.box.left-1&&hit.top>=layout.box.top-1&&hit.right<=layout.box.right+1&&hit.bottom<=layout.box.bottom+1),'face target escaped the visible crop');
  const clear=control=>!control||layout.box.right<=control.left-8||layout.box.bottom<=control.top-8||layout.box.left>=control.right+8||layout.box.top>=control.bottom+8;
  assert.ok(clear(layout.gear),`settings control covers the face crop at ${size.width}x${size.height}: ${JSON.stringify({figure:layout.box,gear:layout.gear})}`);
  assert.ok(clear(layout.back),`back control covers the face crop at ${size.width}x${size.height}`);
  await page.evaluate(()=>document.querySelector('#figure').addEventListener('pointerdown',event=>{const r=event.currentTarget.getBoundingClientRect();window.__tapPoint={clientX:event.clientX,clientY:event.clientY,px:(event.clientX-r.left)/r.width*100,py:(event.clientY-r.top)/r.height*100};},{capture:true,once:true}));
  await tapArt(page,42,20.5);
  const outcome=await page.evaluate(()=>({completed,hint:document.querySelector('#hint').textContent,tap:window.__tapPoint,hits:[...document.querySelectorAll('.hit')].map(hit=>({name:hit.dataset.name,left:hit.style.left,top:hit.style.top,width:hit.style.width,height:hit.style.height}))}));
  assert.deepEqual(outcome.completed,['body-parts'],`the enlarged visible eye did not own its tap: ${JSON.stringify(outcome)}`);
  await ctx.close();
 }
});

test('successful taps do not draw the old yellow circle over the child',async()=>{
 const {ctx,page}=await fixture('10','knee',{width:390,height:844});
 await tapArt(page,45.5,80);
 await page.waitForTimeout(250);
 assert.equal(await page.locator('.hit.flash').count(),0,'a successful tap still adds the yellow circle marker');
 assert.match(await page.locator('#hint').textContent(),/Yes! You found the knee!/);
 await ctx.close();
});

// Additional points selected from the artwork, independent of the app's zones.
// Hand/foot targets include both sides across the cast and the seated pose.
const ART_POINTS={
 '01':{eye:[46.5,22.5],hand:[73,64.5],knee:[44.5,79.5]},
 '02':{eye:[44,22.5],hand:[31,64],knee:[57,80]},
 '04':{eye:[56,21.5],hand:[28,63.5],knee:[57.5,79.5]},
 '05':{eye:[43,21.5],hand:[70,64.5],knee:[42.5,79.5]},
 '06':{eye:[56,20.5],hand:[31.5,58.5],knee:[58,73.5]},
 '07':{eye:[43.5,30],hand:[65,67.5],knee:[47.5,79.5]},
 '08':{eye:[56,23],hand:[33,66.5],knee:[56.5,79.5]},
 '09':{eye:[43,24],hand:[75,54],knee:[68,69],foot:[76,81]},
 '10':{eye:[42,20.5],hand:[33,65],foot:[58.5,94.5]},
 '11':{eye:[57,22],hand:[32,66],knee:[56,79.5]},
 '12':{eye:[42.5,20.5],hand:[68,66],knee:[56,80]},
};
test('overlapping face zones keep wrong feature centers wrong on every picture',{timeout:90000},async t=>{
 for(const id of Object.keys(ART_POINTS)) await t.test('picture '+id,async()=>{
  for(const [target,wrong] of [['nose','mouth'],['mouth','nose']]){
   const {ctx,page}=await fixture(id,target,{width:320,height:568});
   await tapHitCenter(page,wrong);
   assert.deepEqual(await page.evaluate(()=>completed),[],`${id}: ${wrong} center was accepted as ${target}`);
   assert.match(await page.locator('#hint').textContent(),new RegExp(wrong),`${id}: wrong ${wrong} tap was not identified`);
   await page.waitForTimeout(170);
   await tapHitCenter(page,target);
   assert.deepEqual(await page.evaluate(()=>completed),['body-parts'],`${id}: ${target} center was not accepted`);
   await ctx.close();
  }
  if(id==='02'){
   const {ctx,page}=await fixture(id,'hair',{width:320,height:568});
   await tapHitCenter(page,'ear');
   assert.deepEqual(await page.evaluate(()=>completed),[],`${id}: ear center was accepted as hair`);
   await ctx.close();
  }
 });
});
test('real pointer taps recognize visible features across every usable picture',{timeout:90000},async t=>{
 for(const [id,parts] of Object.entries(ART_POINTS)) await t.test('picture '+id,async()=>{
  for(const [part,point] of Object.entries(parts)) {
   const {ctx,page}=await fixture(id,part,{width:390,height:844});
   await tapArt(page,...point);
   assert.deepEqual(await page.evaluate(()=>completed),['body-parts'],id+' '+part);
   await ctx.close();
  }
 });
});
test('wrong taps teach, keyboard answers work, and right-clicks do not answer',async()=>{
 const {ctx,page}=await fixture('10','knee',{width:390,height:844});
 await tapArt(page,50,24);
 assert.match(await page.locator('#hint').textContent(),/nose/i);
 assert.deepEqual(await page.evaluate(()=>completed),[]);
 const r=await page.locator('#figure').boundingBox();await page.mouse.click(r.x+r.width*.45,r.y+r.height*.79,{button:'right'});
 assert.deepEqual(await page.evaluate(()=>completed),[]);
 await page.locator('.hit[data-name="knee"]').first().focus();await page.keyboard.press('Enter');
 assert.deepEqual(await page.evaluate(()=>completed),['body-parts']);await ctx.close();
});
test('missing artwork offers retry and never starts an invisible quiz',async()=>{
 const {ctx,page}=await fixture('10','knee',{width:390,height:844},true);
 assert.equal(await page.locator('.hit').count(),0);assert.doesNotMatch(await page.locator('#hint').textContent(),/^Tap the/);
 await page.unroute('**/img/bodies/*.png');await page.locator('.picture-retry').click();
 await page.waitForSelector('.hit');await tapArt(page,45,79);
 assert.deepEqual(await page.evaluate(()=>completed),['body-parts']);await ctx.close();
});
test('covered features and the damaged torso picture are not quiz targets',async()=>{
 const {ctx,page}=await fixture('12','knee');
 const parts=await page.locator('.hit').evaluateAll(es=>es.map(e=>e.dataset.name));
 assert.ok(!parts.includes('hair')&&!parts.includes('ear'));
 assert.equal(await page.evaluate(()=>BodyPartsData.figures.some(f=>f.id==='03')),false);
 await ctx.close();
});
