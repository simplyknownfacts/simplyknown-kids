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
 await page.evaluate(()=>{window.completed=[];window.vbProgress={record:id=>completed.push(id),mastery:()=>{}};});
 return {ctx,page};
}
async function tapArt(page,x,y){
 const r=await page.locator('#figure').boundingBox();await page.mouse.click(r.x+r.width*x/100,r.y+r.height*y/100);
}
test('visible knee on the reported dress figure is accepted on phone and tall screen',async()=>{
 // Read from the DRAWING: knees below the dress, above the ankles. These
 // coordinates do not come from generated hit buttons or the app's map.
 for(const size of [{width:390,height:844},{width:756,height:1270}]){
  const {ctx,page}=await fixture('10','knee',size);
  await tapArt(page,45.5,80);
  assert.deepEqual(await page.evaluate(()=>completed),['body-parts']);
  assert.equal(await page.locator('.hit.flash').getAttribute('data-name'),'knee');
  await ctx.close();
 }
});
test('blank space beside the drawing must never answer a question',async()=>{
 const {ctx,page}=await fixture('10','foot');await tapArt(page,2,97);
 assert.deepEqual(await page.evaluate(()=>completed),[],'empty background awarded a body part');
 assert.equal(await page.locator('.hit.flash').count(),0);await ctx.close();
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
