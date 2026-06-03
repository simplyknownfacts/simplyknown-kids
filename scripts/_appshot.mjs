import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:8888';
const out = process.argv[3] || 'mascots/dog/green/proof-inapp.png';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1024, height: 768 } });
await ctx.addInitScript(() => {
  localStorage.setItem('vb_profiles', JSON.stringify([{ id:'t', name:'Test', birthday:'2022-01-01', avatar:'🐶', color:'#4ECDC4', voice:'girl', mascot:null, tierOverrides:{}, features:{}, youtube:[] }]));
  localStorage.setItem('vb_active_id', 't');
});
const p = await ctx.newPage();
await p.goto(base + '/home.html', { waitUntil: 'networkidle' });
// give the mascot time to show + its canvas keyer to paint a few frames
await p.waitForTimeout(5000);
// nudge: ensure mascot is shown if the page didn't auto-show it
await p.evaluate(() => { try { window.mascot && window.mascot.show && window.mascot.show(); } catch {} });
await p.waitForTimeout(3500);
const stats = await p.evaluate(() => {
  const wrap = document.getElementById('mascotWrap');
  if (!wrap) return { err: 'no mascotWrap' };
  const cv = wrap.querySelector('canvas');
  if (!cv) return { err: 'no canvas (not chroma mode?)', display: wrap.style.display };
  const ctx = cv.getContext('2d');
  const d = ctx.getImageData(0,0,cv.width,cv.height).data;
  let transp=0, opaque=0, green=0; const tot=d.length/4;
  for (let i=0;i<d.length;i+=4){const a=d[i+3];if(a===0)transp++;else{opaque++;if(a>180&&d[i+1]-Math.max(d[i],d[i+2])>18)green++;}}
  return { canvas:[cv.width,cv.height], pctTransp:Math.round(100*transp/tot), opaque, greenResidual:green, wrapDisplay:wrap.style.display, mask: getComputedStyle(wrap).maskImage };
});
await p.screenshot({ path: out });
await b.close();
console.log('saved ' + out + ' | ' + JSON.stringify(stats));
