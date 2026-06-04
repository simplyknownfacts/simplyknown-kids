// Verifies the Yoto player UI:
//  - Launcher FAB shows on home + section hubs ONLY when the active profile has
//    a Yoto token; hidden when no token; hidden inside an activity page; and it
//    links to the Listen page.
//  - Listen now-playing: grid renders, a chapter plays, and ⏮/⏭ move the chapter
//    with prev disabled at the first chapter and next disabled at the last.
// Self-contained: own static server, stubbed window.yoto + audio. Run w/ the suite.
import { chromium } from 'playwright';   // requires the e2e node_modules (run with the suite)
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 8869;
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

// Stub yoto.js: served in place of the real module so the Listen page renders a
// mocked multi-chapter library without a real Yoto login.
const YOTO_STUB = `window.yoto = {
  isConfigured: () => true,
  isConnected: () => true,
  listContent: async () => ({ ok:true, cards: [
    { cardId:'c1', metadata:{ title:'Twinkle Tunes' } },
    { cardId:'c2', title:'Story Time' },
  ]}),
  getCard: async (id) => ({ ok:true, card: { metadata:{ title: id==='c1'?'Twinkle Tunes':'Story Time' },
    content:{ chapters: [
      { title:'Chapter 1', tracks:[{ trackUrl:'https://example.com/a.mp3' }] },
      { title:'Chapter 2', tracks:[{ trackUrl:'https://example.com/b.mp3' }] },
      { title:'Chapter 3', tracks:[{ trackUrl:'https://example.com/c.mp3' }] },
    ]}}}),
  getStreamUrl: async (t) => (t && t.trackUrl) || 'https://example.com/x.mp3',
  connect: ()=>{}, completeAuth: async()=>true, disconnect: ()=>{},
};`;

const d = new Date(); d.setMonth(d.getMonth() - 30); const bday = d.toISOString().slice(0,10);
const prof = { id:'A', name:'Aldo', birthday:bday, avatar:'\u{1F98A}', color:'#4ECDC4', voice:'girl', mascot:null,
  tierOverrides:{}, features:{}, youtube:[], achievements:{ unlocked:{}, counters:{}, repeats:{}, streak:{last:null,current:0,best:0}, xp:0, rank:'sprout' } };
const seed = `try{localStorage.setItem('vb_profiles',JSON.stringify([${JSON.stringify(prof)}]));localStorage.setItem('vb_active_id','A');}catch(e){}
try{HTMLMediaElement.prototype.play=function(){return Promise.resolve();};}catch(e){}
try{if(window.speechSynthesis)speechSynthesis.speak=function(){};}catch(e){}`;
const tokenScript = `try{localStorage.setItem('vb_yoto_tokens_A', JSON.stringify({access_token:'t',refresh_token:'r',expires_at:Date.now()+3600000,scope:''}));}catch(e){}`;

const browser = await chromium.launch();
async function makeCtx(withToken) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 740 }, isMobile: true, hasTouch: true });
  await ctx.route('**/js/yoto.js', r => r.fulfill({ contentType: 'text/javascript', body: YOTO_STUB }));
  await ctx.addInitScript(seed);
  if (withToken) await ctx.addInitScript(tokenScript);
  return ctx;
}
const results = {};
const has = async (page, sel) => (await page.locator(sel).count()) > 0;

// ---- Connected context: launcher visibility across page types + Listen player ----
const ctxC = await makeCtx(true);

// A) home hub → launcher present
let page = await ctxC.newPage();
await page.goto(`http://localhost:${PORT}/home.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
results.launcher_home = await has(page, '#yotoLaunch');
// launcher links to the Listen page
await page.locator('#yotoLaunch').dispatchEvent('pointerdown');   // pulse animation makes .click() "unstable"
await page.waitForURL('**/listen/index.html', { timeout: 8000 }).catch(()=>{});
results.launcher_navigates_to_listen = page.url().includes('/listen/index.html');
await page.close();

// B) section hub (games/index.html — does NOT load yoto.js) → launcher present
page = await ctxC.newPage();
await page.goto(`http://localhost:${PORT}/games/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
results.launcher_section_hub = await has(page, '#yotoLaunch');
await page.close();

// D) activity page (not a hub) → launcher absent
page = await ctxC.newPage();
await page.goto(`http://localhost:${PORT}/games/tap-pop.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
results.launcher_absent_in_activity = !(await has(page, '#yotoLaunch'));
await page.close();

// E) Listen page: grid + play + prev/next bounds
page = await ctxC.newPage();
await page.goto(`http://localhost:${PORT}/listen/index.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('.card-tile', { timeout: 8000 });
results.grid_tiles = await page.locator('.card-tile').count();
await page.locator('.card-tile').first().click();          // open card → chapter picker (3 chapters)
await page.waitForSelector('.chapters-overlay .chap-row', { timeout: 8000 });
await page.locator('.chap-row').first().click();           // play chapter 1 (idx 0)
await page.waitForSelector('#player.active', { timeout: 8000 });
const dis = (sel) => page.locator(sel).evaluate(el => el.disabled);
results.player_active = await has(page, '#player.active');
results.prev_disabled_at_start = await dis('#prevChap');   // true
results.next_enabled_at_start = !(await dis('#nextChap')); // true
await page.locator('#nextChap').click();                   // → idx 1
await page.waitForTimeout(150);
results.prev_enabled_mid = !(await dis('#prevChap'));      // true
await page.locator('#nextChap').click();                   // → idx 2 (last)
await page.waitForTimeout(150);
results.next_disabled_at_end = await dis('#nextChap');     // true
await page.close();
await ctxC.close();

// ---- Disconnected context: no token → launcher hidden on a hub ----
const ctxD = await makeCtx(false);
page = await ctxD.newPage();
await page.goto(`http://localhost:${PORT}/games/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
results.launcher_hidden_when_no_token = !(await has(page, '#yotoLaunch'));
await page.close();
await ctxD.close();

console.log(JSON.stringify(results, null, 2));
const pass =
  results.launcher_home === true &&
  results.launcher_navigates_to_listen === true &&
  results.launcher_section_hub === true &&
  results.launcher_absent_in_activity === true &&
  results.launcher_hidden_when_no_token === true &&
  results.grid_tiles === 2 &&
  results.player_active === true &&
  results.prev_disabled_at_start === true &&
  results.next_enabled_at_start === true &&
  results.prev_enabled_mid === true &&
  results.next_disabled_at_end === true;
console.log(`\nVERDICT: ${pass ? 'PASS ✅' : 'FAIL ❌'}`);
await browser.close();
server.close();
process.exit(pass ? 0 : 1);
