// Verifies Parent Settings accordion default: on narrow screens the panels start
// FULLY COLLAPSED (no panel auto-opened), tapping a title opens one, and on wide
// screens the default panel still shows. Bypasses the PIN gate by calling the
// page's showMain() directly. Self-contained server. Run with the suite.
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

// --- narrow: starts collapsed; tap opens one ---
const ctxN=await browser.newContext({viewport:{width:390,height:740},hasTouch:true});
await ctxN.addInitScript(seed);
const pN=await ctxN.newPage();
await pN.goto(URL_,{waitUntil:'networkidle'});
await pN.waitForFunction(()=>typeof showMain==='function',{timeout:8000});
await pN.evaluate(()=>showMain());
await pN.waitForTimeout(300);
results.accOpen_onLoad_narrow = await pN.locator('.settings-panel.acc-open').count();   // expect 0
await pN.locator('.acc-title').first().click();
await pN.waitForTimeout(200);
results.accOpen_afterTap_narrow = await pN.locator('.settings-panel.acc-open').count();  // expect 1
await pN.close(); await ctxN.close();

// --- wide: default panel still shown ---
const ctxW=await browser.newContext({viewport:{width:1100,height:800}});
await ctxW.addInitScript(seed);
const pW=await ctxW.newPage();
await pW.goto(URL_,{waitUntil:'networkidle'});
await pW.waitForFunction(()=>typeof showMain==='function',{timeout:8000});
await pW.evaluate(()=>showMain());
await pW.waitForTimeout(300);
results.activePanel_wide = await pW.locator('.settings-panel.active[data-key="activities"]').count(); // expect 1
await pW.close(); await ctxW.close();

console.log(JSON.stringify(results,null,2));
const pass = results.accOpen_onLoad_narrow===0 && results.accOpen_afterTap_narrow===1 && results.activePanel_wide===1;
console.log(`\nNARROW starts collapsed: ${results.accOpen_onLoad_narrow===0} | tap opens one: ${results.accOpen_afterTap_narrow===1} | WIDE shows default: ${results.activePanel_wide===1}`);
console.log(`VERDICT: ${pass?'PASS ✅':'FAIL ❌'}`);
await browser.close(); server.close();
process.exit(pass?0:1);
