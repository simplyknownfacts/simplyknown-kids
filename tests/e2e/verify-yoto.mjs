// Verifies the Yoto connection wiring + per-profile isolation:
//  1. client_id is configured on a normal page (home.html).
//  2. yoto-callback.html also has the client_id (it loads yoto-config.js now),
//     so the OAuth token exchange won't post an empty client_id.
//  3. SHARED family connection: one token, so every kid profile sees the same
//     family Yoto connection (one family account = one library).
// Self-contained: own static server. Run with the e2e suite.
import { chromium } from 'playwright';   // requires the e2e node_modules (run with the suite)   // requires the e2e node_modules (run with the suite)
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 8868;
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

const EXPECT_ID = 'FKjZtNSdQ44uhEL9yBDnRYN2tKW1e4dQ';
const d = new Date(); d.setMonth(d.getMonth() - 30); const bday = d.toISOString().slice(0,10);
const base = { birthday:bday, avatar:'\u{1F98A}', color:'#4ECDC4', voice:'girl', mascot:null, tierOverrides:{}, features:{}, youtube:[],
  achievements:{ unlocked:{}, counters:{}, repeats:{}, streak:{last:null,current:0,best:0}, xp:0, rank:'sprout' } };
const profs = [ Object.assign({ id:'A', name:'Aldo' }, base), Object.assign({ id:'B', name:'Bea' }, base) ];
const init = `try{localStorage.setItem('vb_profiles',JSON.stringify(${JSON.stringify(profs)}));localStorage.setItem('vb_active_id','A');}catch(e){}
try{HTMLMediaElement.prototype.play=function(){return Promise.resolve();};}catch(e){}
try{if(window.speechSynthesis)speechSynthesis.speak=function(){};}catch(e){}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
await ctx.addInitScript(init);
const page = await ctx.newPage();

// --- normal page: configured + SHARED family connection ---
await page.goto(`http://localhost:${PORT}/home.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.yoto, { timeout: 10000 });
const main = await page.evaluate((EXPECT_ID) => {
  const out = {};
  out.configured = window.yoto.isConfigured();
  // shared family connection: one token, every profile sees it
  localStorage.setItem('vb_active_id', 'A');
  localStorage.setItem('vb_yoto_tokens', JSON.stringify({ access_token:'tokShared', refresh_token:'r', expires_at: Date.now()+3600000, scope:'' }));
  out.connectedA = window.yoto.isConnected();
  // switch to profile B — ALSO connected (one shared family connection)
  localStorage.setItem('vb_active_id', 'B');
  out.connectedB = window.yoto.isConnected();
  // disconnect wipes the shared token for everyone
  window.yoto.disconnect();
  out.connectedAfterDisconnect = window.yoto.isConnected();
  out.sharedKeyAfter = localStorage.getItem('vb_yoto_tokens');   // should be null after disconnect
  return out;
}, EXPECT_ID);

// --- callback page: client_id must be present (config script wired) ---
await page.goto(`http://localhost:${PORT}/yoto-callback.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.yoto, { timeout: 10000 });
const cb = await page.evaluate(() => ({
  clientId: (window.YOTO_CONFIG || {}).clientId || '',
  configured: window.yoto.isConfigured(),
}));

const result = { main, cb, expectId: EXPECT_ID };
console.log(JSON.stringify(result, null, 2));
const pass =
  main.configured === true &&
  main.connectedA === true &&
  main.connectedB === true &&           // shared: every profile sees the family connection
  main.connectedAfterDisconnect === false &&
  main.sharedKeyAfter === null &&
  cb.clientId === EXPECT_ID &&
  cb.configured === true;
console.log(`\nCONFIGURED (home):      ${main.configured}`);
console.log(`SHARED CONNECTION:      A=${main.connectedA} B=${main.connectedB} (both true) → disconnect=${main.connectedAfterDisconnect}`);
console.log(`CALLBACK has clientId:  ${cb.clientId === EXPECT_ID}`);
console.log(`VERDICT: ${pass ? 'PASS ✅' : 'FAIL ❌'}`);
await browser.close();
server.close();
process.exit(pass ? 0 : 1);
