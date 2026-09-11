import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(import.meta.dirname,'..');
const active={id:'room-kid',name:'Room Kid',birthday:'2021-01-01',color:'#4ECDC4',voice:'girl',theme:'paper',mascot:{id:'bunny',voice:'girl'},features:{},activitiesVisible:{}};
const sibling={id:'other-kid',name:'Other Kid',birthday:'2018-01-01',color:'#FF6B6B',voice:'man',theme:'cloud',mascot:{id:'owl',voice:'man'},features:{},activitiesVisible:{}};
let browser,server,base;
before(async()=>{
 const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
 const port=probe.address().port;await new Promise(r=>probe.close(r));base='http://127.0.0.1:'+port;
 server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:ROOT,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('server startup')),12000);server.stdout.on('data',d=>{if(String(d).includes('localhost:'+port)){clearTimeout(timer);resolve();}});});
 browser=await chromium.launch();
});
after(async()=>{await browser?.close();if(server){const ended=once(server,'exit');server.kill();await ended;}});

async function room(viewport){
 const ctx=await browser.newContext({viewport,serviceWorkers:'block',reducedMotion:'reduce'});
 await ctx.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await ctx.addInitScript(({active,sibling})=>{localStorage.vb_profiles=JSON.stringify([active,sibling]);localStorage.vb_active_id=active.id;},{active,sibling});
 const page=await ctx.newPage();await page.goto(base+'/my-room.html');await page.waitForSelector('[data-theme-id]');return{ctx,page};
}

test('My Room offers only child-safe theme and buddy choices and saves only the active child',async()=>{
 const {ctx,page}=await room({width:390,height:844});
 assert.equal(await page.locator('[data-theme-id]').count(),5);
 assert.equal(await page.locator('[data-mascot-id]').count(),16);
 assert.equal(await page.locator('[data-theme-id="paper"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('[data-mascot-id="bunny"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('text=/level|birthday|activity|account|pin|voice/i').count(),0,'parent-only choices leaked into My Room');
 await page.locator('[data-theme-id="candy"]').click();
 assert.equal(await page.locator('html').getAttribute('data-vbtheme'),'candy');
 await page.locator('[data-mascot-id="fox"]').click();
 const stored=await page.evaluate(()=>JSON.parse(localStorage.vb_profiles));
 assert.equal(stored.find(p=>p.id==='room-kid').theme,'candy');
 assert.deepEqual(stored.find(p=>p.id==='room-kid').mascot,{id:'fox',voice:'girl'});
 assert.deepEqual(stored.find(p=>p.id==='other-kid'),sibling,'another child was modified');
 assert.match(await page.locator('#roomStatus').textContent(),/Fox is your buddy/);
 await ctx.close();
});

test('My Room remains finger-sized, horizontally contained and navigable on compact screens',async()=>{
 for(const viewport of [{width:320,height:568},{width:568,height:320}]){
  const {ctx,page}=await room(viewport);
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,
   buttons:[...document.querySelectorAll('[data-theme-id],[data-mascot-id],.back-btn')].map(b=>{const r=b.getBoundingClientRect();return{label:b.getAttribute('aria-label')||b.textContent.trim(),width:r.width,height:r.height,left:r.left,right:r.right}})}));
  assert.equal(layout.overflow,false,`${viewport.width}x${viewport.height} has horizontal overflow`);
  assert.ok(layout.buttons.every(b=>b.width>=44&&b.height>=44&&b.left>=0&&b.right<=viewport.width),JSON.stringify(layout.buttons));
  await page.locator('.back-btn').click();await page.waitForURL('**/home.html');
  await ctx.close();
 }
});

test('My Room is part of the resilient offline shell',async()=>{
 const sw=await readFile(path.join(ROOT,'sw.js'),'utf8');
 assert.match(sw,/\.\/my-room\.html/);
});
