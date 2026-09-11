// Verifies Parent Settings navigation: narrow screens show one panel and change
// it through the section picker; wide screens show one default panel and change
// it through the desktop navigation. Bypasses the PIN gate with showMain().
import { chromium } from 'playwright';   // requires the e2e node_modules (run with the suite)
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 8871;
const MIME = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg','.webm':'video/webm','.woff2':'font/woff2','.ico':'image/x-icon' };
const server = createServer(async (req,res)=>{ try{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const b=await readFile(join(ROOT,p)); res.writeHead(200,{'Content-Type':MIME[extname(join(ROOT,p))]||'application/octet-stream'}); res.end(b);}catch{res.writeHead(404);res.end('404');}});
await new Promise(r=>server.listen(PORT,r));

const d=new Date(); d.setMonth(d.getMonth()-30); const bday=d.toISOString().slice(0,10);
const prof={id:'A',name:'Aldo',birthday:bday,avatar:'\u{1F98A}',color:'#4ECDC4',voice:'girl',mascot:null,tierOverrides:{},features:{},youtube:[],achievements:{unlocked:{},counters:{},repeats:{},streak:{last:null,current:0,best:0},xp:0,rank:'sprout'}};
const seed=`try{localStorage.setItem('vb_profiles',JSON.stringify([${JSON.stringify(prof)}]));localStorage.setItem('vb_active_id','A');}catch(e){}
try{HTMLMediaElement.prototype.play=function(){return Promise.resolve();};}catch(e){}`;
const URL_ = `http://localhost:${PORT}/parent/settings.html`;
const browser=await chromium.launch();
const results={};

// --- narrow: one visible panel; picker changes that one panel ---
const ctxN=await browser.newContext({viewport:{width:390,height:740},hasTouch:true});
await ctxN.addInitScript(seed);
const pN=await ctxN.newPage();
await pN.goto(URL_,{waitUntil:'networkidle'});
await pN.waitForFunction(()=>typeof showMain==='function',{timeout:8000});
await pN.evaluate(()=>showMain());
await pN.waitForTimeout(300);
results.active_onLoad_narrow = await pN.locator('.settings-panel.active').count();
results.pickerVisible_narrow = await pN.locator('#settingsSectionPicker').isVisible().catch(()=>false);
await pN.locator('#settingsSectionPicker').selectOption('theme');
await pN.waitForTimeout(200);
results.themeActive_narrow = await pN.locator('.settings-panel.active[data-key="theme"]').count();
results.active_afterPick_narrow = await pN.locator('.settings-panel.active').count();
await pN.close(); await ctxN.close();

// --- wide: one default panel; desktop nav changes that one panel ---
const ctxW=await browser.newContext({viewport:{width:1100,height:800}});
await ctxW.addInitScript(seed);
const pW=await ctxW.newPage();
await pW.goto(URL_,{waitUntil:'networkidle'});
await pW.waitForFunction(()=>typeof showMain==='function',{timeout:8000});
await pW.evaluate(()=>showMain());
await pW.waitForTimeout(300);
results.active_onLoad_wide = await pW.locator('.settings-panel.active').count();
results.navVisible_wide = await pW.locator('#sideNav .navitem[data-key="offline"]').isVisible().catch(()=>false);
await pW.locator('#sideNav .navitem[data-key="offline"]').click();
await pW.waitForTimeout(200);
results.offlineActive_wide = await pW.locator('.settings-panel.active[data-key="offline"]').count();
results.active_afterNav_wide = await pW.locator('.settings-panel.active').count();
await pW.close(); await ctxW.close();

console.log(JSON.stringify(results,null,2));
const pass = results.active_onLoad_narrow===1 && results.pickerVisible_narrow &&
  results.themeActive_narrow===1 && results.active_afterPick_narrow===1 &&
  results.active_onLoad_wide===1 && results.navVisible_wide &&
  results.offlineActive_wide===1 && results.active_afterNav_wide===1;
console.log(`\nNARROW one panel + picker: ${results.active_onLoad_narrow===1 && results.themeActive_narrow===1 && results.active_afterPick_narrow===1} | WIDE one panel + nav: ${results.active_onLoad_wide===1 && results.offlineActive_wide===1 && results.active_afterNav_wide===1}`);
console.log(`VERDICT: ${pass?'PASS ✅':'FAIL ❌'}`);
await browser.close(); server.close();
process.exit(pass?0:1);
