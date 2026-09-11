// Visual capture plus repeated rendering for the three untouched section hubs.
// This deliberately does not repeat the accepted activity resilience batches.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.join(import.meta.dirname, 'out', 'section-hub-visual-soak-20260910-01a08d94');
const SHOTS = path.join(ROOT, 'docs', 'verify', 'shots', 'audit-20260910-section-hub-visual-soak-01a08d94');
const APP_BASELINE = '3683e2028044ba1812a1c44202725ffbb1858d5b';
const VIEWPORTS = {
  desktop: { width: 1280, height: 900, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true },
};
const ROUTES = [
  { id: 'games/index.html', route: '/games/index.html', shot: 'games' },
  { id: 'learning/index.html', route: '/learning/index.html', shot: 'learning' },
  { id: 'art/index.html', route: '/art/index.html', shot: 'art' },
];
const TIERS = [1,2,3,4,5,6,7,8,9,10];
const pass = note => ({ status: 'PASS', note });
const fail = note => ({ status: 'FAIL', note });
const blk = note => ({ status: 'BLK', note });

async function freePort() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
async function health(base) {
  const response = await fetch(`${base}/__health.json`); if (!response.ok) throw new Error(`health ${response.status}`);
  const body = await response.json(); if (body.app !== 'kids') throw new Error(`wrong app ${body.app}`);
}
function birthdayForTier(tier) {
  const months = { 1:6, 2:18, 3:30, 4:42, 5:54, 6:66, 7:78, 8:90, 9:102, 10:114 }[tier];
  const date = new Date(); date.setDate(15); date.setMonth(date.getMonth() - months); return date.toISOString().slice(0, 10);
}
function seed() {
  return ({ tier, birthday }) => {
    const profile = { id:`hub-t${tier}`, name:`Explorer${tier}`, birthday, color:'#4ECDC4', voice:'girl', mascot:{id:'bunny'}, tierOverrides:{}, features:{}, activitiesVisible:{}, youtube:[], achievements:{unlocked:{},counters:{},repeats:{},streak:{},xp:0,rank:'seedling'} };
    localStorage.setItem('vb_profiles', JSON.stringify([profile])); localStorage.setItem('vb_active_id', profile.id);
    try { HTMLMediaElement.prototype.play = () => Promise.resolve(); } catch {}
  };
}
async function cardIds(page) {
  await page.locator('.activity-card').first().waitFor({ timeout: 12000 });
  return page.locator('.activity-card').evaluateAll(cards => cards.map(card => card.dataset.activity));
}
async function geometry(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('.activity-card')];
    const visible = cards.filter(card => { const r=card.getBoundingClientRect(),s=getComputedStyle(card); return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'; });
    const first = visible[0]?.getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth-innerWidth, cards: cards.length, visible: visible.length,
      firstIntersects: !!first&&first.right>0&&first.bottom>0&&first.left<innerWidth&&first.top<innerHeight,
      title: document.querySelector('.hub-title')?.textContent?.trim() || '', width:innerWidth, height:innerHeight };
  });
}
async function runCell(browser, base, viewportName, viewport, tier, route) {
  const context = await browser.newContext({ viewport:{width:viewport.width,height:viewport.height}, isMobile:viewport.isMobile, hasTouch:viewport.hasTouch, reducedMotion:'reduce', serviceWorkers:'block' });
  context.setDefaultTimeout(9000);
  await context.route('**/*', request => new URL(request.request().url()).origin === base ? request.continue() : request.abort('blockedbyclient'));
  await context.addInitScript(seed(), { tier, birthday:birthdayForTier(tier) });
  const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message)); const checks = {};
  try {
    await page.goto(base + route.route, { waitUntil:'domcontentloaded', timeout:20000 });
    const initialIds = await cardIds(page); const initialGeometry = await geometry(page);
    checks.layout = initialGeometry.overflow <= 1 && initialGeometry.cards > 0 && initialGeometry.visible === initialGeometry.cards && initialGeometry.firstIntersects && initialGeometry.title
      ? pass(`rendered section hub geometry ${JSON.stringify(initialGeometry)}`) : fail(`bad section hub geometry ${JSON.stringify(initialGeometry)}`);
    await page.screenshot({ path:path.join(SHOTS, `${route.shot}-T${tier}-${viewportName}.png`), fullPage:true });
    let stable = true; let drift = '';
    for (let cycle = 1; cycle <= 20; cycle++) {
      await page.reload({ waitUntil:'domcontentloaded', timeout:20000 });
      const ids = await cardIds(page);
      if (JSON.stringify(ids) !== JSON.stringify(initialIds)) { stable = false; drift = `cycle ${cycle}: ${JSON.stringify(ids)} vs ${JSON.stringify(initialIds)}`; break; }
    }
    checks.long_repeated_play = stable && errors.length === 0
      ? pass(`twenty repeated route renders preserved ordered activities ${JSON.stringify(initialIds)}`)
      : fail(drift || `${errors.length} page errors: ${errors.slice(0,3).join(' | ')}`);
    checks.visual_quality = blk('full-page screenshot captured for separate human/model review');
  } catch (error) { checks.runtime = fail(String(error.message || error).slice(0, 260)); }
  finally { await context.close(); }
  return { id:`${route.id}:T${tier}:${viewportName}`, routeId:route.id, tier, viewport:viewportName, checks };
}
async function contactSheets(browser, base) {
  for (const route of ROUTES) for (const viewport of Object.keys(VIEWPORTS)) {
    const page = await browser.newPage({ viewport:{ width:1224, height:800 } });
    const height = viewport === 'phone' ? 500 : 270;
    const images = TIERS.map(tier => `<figure><img src="${base}/docs/verify/shots/audit-20260910-section-hub-visual-soak-01a08d94/${route.shot}-T${tier}-${viewport}.png"><figcaption>T${tier}</figcaption></figure>`).join('');
    await page.setContent(`<style>body{margin:0;padding:12px;background:#20242b;color:white;font:700 16px system-ui}h1{font-size:20px;margin:0 0 10px}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}figure{margin:0;background:#fff;border-radius:6px;overflow:hidden}img{display:block;width:100%;height:${height}px;object-fit:contain;object-position:top;background:#fff}figcaption{padding:5px;text-align:center;background:#303743}</style><h1>${route.id} — ${viewport} — synthetic T1–T10</h1><div class="grid">${images}</div>`);
    await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
    await page.screenshot({ path:path.join(SHOTS, `contact-${route.shot}-${viewport}.png`), fullPage:true }); await page.close();
  }
}

mkdirSync(OUT, { recursive:true }); mkdirSync(SHOTS, { recursive:true });
const port = await freePort(); const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], { cwd:ROOT, env:{...process.env,PORT:String(port)}, stdio:['ignore','pipe','pipe'] });
for (let attempt=0; attempt<100; attempt++) { try { await health(base); break; } catch { if (attempt===99) throw new Error('server did not start'); await new Promise(resolve=>setTimeout(resolve,100)); } }
const browser = await chromium.launch(); const started = Date.now(); const queue = [];
for (const [viewportName,viewport] of Object.entries(VIEWPORTS)) for (const tier of TIERS) for (const route of ROUTES) queue.push({viewportName,viewport,tier,route});
const rows = [];
try {
  async function worker() { while (queue.length) { const job=queue.shift(); const row=await runCell(browser,base,job.viewportName,job.viewport,job.tier,job.route); rows.push(row); const failures=Object.values(row.checks).filter(result=>result.status==='FAIL').length; console.log(`${failures?'FAIL':'PASS'} ${row.id}${failures?` (${failures})`:''}`); } }
  await Promise.all(Array.from({length:4}, worker)); await contactSheets(browser, base);
} finally { await browser.close(); server.kill(); }
rows.sort((a,b)=>a.id.localeCompare(b.id)); const counts={rows:rows.length,pass:0,fail:0,blk:0};
for (const row of rows) for (const result of Object.values(row.checks)) counts[result.status.toLowerCase()]++;
const report={baseline:APP_BASELINE,generatedAt:new Date().toISOString(),durationSec:Math.round((Date.now()-started)/1000),counts,rows};
writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2)+'\n'); console.log(JSON.stringify({...counts,durationSec:report.durationSec}));
if (rows.length!==60||counts.fail) process.exitCode=1;
