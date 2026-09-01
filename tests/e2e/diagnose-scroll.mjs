// Self-contained scroll diagnostic for the ribbons (achievements) page.
// Reproduces Scott's tablet: MOBILE emulation + a REAL touch swipe (via CDP),
// not a programmatic scroll. Tests the page as-shipped, then live-injects the
// parent-settings scroll pattern (height:100% single-scroller) and swipes again
// — so one run proves both the bug and the fix.
// Re-runnable: `node tests/e2e/diagnose-scroll.mjs`
import { chromium } from 'playwright';   // requires the e2e node_modules (run with the suite)
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 8790;
const MIME = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript',
  '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml',
  '.mp3':'audio/mpeg', '.webm':'video/webm', '.woff2':'font/woff2', '.ico':'image/x-icon' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const buf = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(join(ROOT,p))] || 'application/octet-stream' }); res.end(buf);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise(r => server.listen(PORT, r));

const d = new Date(); d.setMonth(d.getMonth() - 30); const bday = d.toISOString().slice(0,10);
const prof = { id:'r', name:'Remy', birthday:bday, avatar:'\u{1F98A}', color:'#4ECDC4', voice:'girl',
  mascot:null, tierOverrides:{}, features:{}, youtube:[],
  achievements:{ unlocked:{'tap-pop.first':{at:1},'tap-pop.milestone.bronze':{at:1}},
    counters:{'tap-pop':80}, repeats:{'tap-pop':3}, streak:{last:null,current:0,best:0}, xp:12, rank:'sprout' } };
const init = `try{localStorage.setItem('vb_profiles',JSON.stringify([${JSON.stringify(prof)}]));localStorage.setItem('vb_active_id','r');}catch(e){}
try{HTMLMediaElement.prototype.play=function(){return Promise.resolve();};}catch(e){}
try{if(window.speechSynthesis)speechSynthesis.speak=function(){};}catch(e){}`;

const browser = await chromium.launch();
// Emulate a tablet: mobile semantics + touch. Short height forces overflow.
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(init);
const page = await ctx.newPage();
const client = await ctx.newCDPSession(page);
await page.goto(`http://localhost:${PORT}/achievements.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('#groups .gallery-group', { timeout: 12000 }).catch(()=>{});
await page.waitForTimeout(400);

async function touchSwipeUp(x = 400, startY = 520, endY = 120, steps = 12) {
  await client.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x, y:startY}] });
  for (let i = 1; i <= steps; i++) {
    const y = startY + (endY - startY) * i / steps;
    await client.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x, y}] });
    await page.waitForTimeout(8);
  }
  await client.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  await page.waitForTimeout(250);
}
const getTop = () => page.evaluate(() => {
  const se = document.scrollingElement;
  return { scrollingElement: se?.tagName, top: se?.scrollTop ?? -1,
    htmlTop: document.documentElement.scrollTop, bodyTop: document.body.scrollTop };
});
const styles = () => page.evaluate(() => {
  const cs = el => { const s = getComputedStyle(el); return { position:s.position, overflowY:s.overflowY, height:s.height }; };
  return { html: cs(document.documentElement), body: cs(document.body) };
});

// ---------- PHASE 1: as shipped ----------
await page.evaluate(() => document.scrollingElement.scrollTop = 0);
const before1 = await getTop();
await touchSwipeUp();
const after1 = await getTop();
const s1 = await styles();
const moved1 = Math.max(after1.top, after1.htmlTop, after1.bodyTop) - Math.max(before1.top, before1.htmlTop, before1.bodyTop);

// ---------- PHASE 2: inject parent-settings pattern (height:100% single scroller) ----------
await page.addStyleTag({ content: `
  html.vb-scroll { position:static !important; overflow-y:auto !important; overflow-x:hidden !important; height:100% !important; min-height:100%; }
  html.vb-scroll body { position:static !important; overflow:visible !important; height:auto !important; min-height:100%; }
` });
await page.evaluate(() => { document.documentElement.scrollTop = 0; document.body.scrollTop = 0; });
await page.waitForTimeout(150);
const before2 = await getTop();
await touchSwipeUp();
const after2 = await getTop();
const s2 = await styles();
const moved2 = Math.max(after2.top, after2.htmlTop, after2.bodyTop) - Math.max(before2.top, before2.htmlTop, before2.bodyTop);

console.log(JSON.stringify({
  phase1_asShipped:  { styles: s1, touchSwipeScrolledPx: Math.round(moved1) },
  phase2_heightFix:  { styles: s2, touchSwipeScrolledPx: Math.round(moved2) },
}, null, 2));
console.log(`\nAS SHIPPED:  touch swipe scrolled ${Math.round(moved1)}px  -> ${moved1 > 20 ? 'scrolls ✅' : 'STUCK ❌'}`);
console.log(`HEIGHT FIX:  touch swipe scrolled ${Math.round(moved2)}px  -> ${moved2 > 20 ? 'scrolls ✅' : 'STUCK ❌'}`);
await browser.close();
server.close();
// Regression guard: fail if the SHIPPED file (phase 1) can't touch-scroll.
process.exit(moved1 > 20 ? 0 : 1);
