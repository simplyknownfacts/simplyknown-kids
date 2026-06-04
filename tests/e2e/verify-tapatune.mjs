// Verifies (1) Tap-a-Tune keyboard glissando: a real touch-drag across the keys
// plays multiple notes in order without lifting; a tap still plays one; and
// (2) the per-speed repeatable-ribbon cadence (fast=300, slow=50).
// Self-contained: starts its own static server + uses CDP touch input.
// Run with the e2e suite (needs playwright in tests/e2e/node_modules).
import { chromium } from 'playwright';   // requires the e2e node_modules (run with the suite)
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 8867;
const MIME = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json',
  '.png':'image/png', '.svg':'image/svg+xml', '.mp3':'audio/mpeg', '.webm':'video/webm', '.woff2':'font/woff2', '.ico':'image/x-icon' };
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
  achievements:{ unlocked:{}, counters:{}, repeats:{}, streak:{last:null,current:0,best:0}, xp:0, rank:'sprout' } };
const init = `try{localStorage.setItem('vb_profiles',JSON.stringify([${JSON.stringify(prof)}]));localStorage.setItem('vb_active_id','r');}catch(e){}
try{HTMLMediaElement.prototype.play=function(){return Promise.resolve();};}catch(e){}
try{if(window.speechSynthesis)speechSynthesis.speak=function(){};}catch(e){}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(init);
const page = await ctx.newPage();
const client = await ctx.newCDPSession(page);
await page.goto(`http://localhost:${PORT}/games/tap-a-tune.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('#pads .pad', { timeout: 12000 });
await page.waitForTimeout(300);

const counter = () => page.evaluate(() => (window.vbProgress?.getState()?.counters?.['tap-a-tune']) || 0);
// pad geometry (center y, and center x of first & last pad)
const geo = await page.evaluate(() => {
  const ps = [...document.querySelectorAll('.pad')];
  const r0 = ps[0].getBoundingClientRect(), rN = ps[ps.length-1].getBoundingClientRect();
  return { n: ps.length, y: Math.round(r0.top + r0.height/2),
    x0: Math.round(r0.left + r0.width/2), xN: Math.round(rN.left + rN.width/2) };
});

async function touchDrag(x0, xN, y, steps = 16) {
  await client.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:x0, y}] });
  for (let i = 1; i <= steps; i++) {
    const x = Math.round(x0 + (xN - x0) * i / steps);
    await client.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x, y}] });
    await page.waitForTimeout(12);
  }
  await client.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  await page.waitForTimeout(150);
}
async function touchTap(x, y) {
  await client.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x, y}] });
  await page.waitForTimeout(30);
  await client.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  await page.waitForTimeout(120);
}

const c0 = await counter();
await touchDrag(geo.x0, geo.xN, geo.y);          // slide across all keys
const cDrag = await counter();
await touchTap(geo.x0, geo.y);                    // single tap
const cTap = await counter();

const cadence = await page.evaluate(() => ({
  tapATune: window.vbDefs.byId('tap-a-tune.repeat').every,
  math:     window.vbDefs.byId('math.repeat').every,
  shapeMatch: window.vbDefs.byId('shape-match.repeat').every,
}));

const notesFromDrag = cDrag - c0;
const notesFromTap = cTap - cDrag;
const out = {
  pads: geo.n,
  glissando_notesFromDrag: notesFromDrag,   // expect >= 4 (slid across the row)
  tap_notesFromTap: notesFromTap,           // expect 1
  cadence,                                   // expect tapATune/shapeMatch fast vs math
};
console.log(JSON.stringify(out, null, 2));
const pass =
  notesFromDrag >= 4 &&
  notesFromTap === 1 &&
  cadence.tapATune === 300 &&
  cadence.math === 50 &&
  cadence.shapeMatch === 50;
console.log(`\nGLISSANDO: drag played ${notesFromDrag} notes, tap played ${notesFromTap}  -> ${notesFromDrag>=4 && notesFromTap===1 ? 'OK ✅' : 'FAIL ❌'}`);
console.log(`CADENCE:   tap-a-tune=${cadence.tapATune} math=${cadence.math} shape-match=${cadence.shapeMatch}  -> ${cadence.tapATune===300&&cadence.math===50 ? 'OK ✅' : 'FAIL ❌'}`);
console.log(`VERDICT: ${pass ? 'PASS ✅' : 'FAIL ❌'}`);
await browser.close();
server.close();
process.exit(pass ? 0 : 1);
