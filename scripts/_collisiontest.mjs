import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:8888/games/shape-match.html';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1024, height: 768 } });
await ctx.addInitScript(() => {
  localStorage.setItem('vb_profiles', JSON.stringify([{ id:'t', name:'Noah', birthday:'2022-01-01', avatar:'🐶', color:'#4ECDC4', voice:'girl', mascot:null, tierOverrides:{}, features:{}, youtube:[] }]));
  localStorage.setItem('vb_active_id', 't');
  localStorage.setItem('vb_mascot_pos', JSON.stringify({ x: 6, y: 6 })); // parked TOP-LEFT, on the back button
});
const p = await ctx.newPage();
await p.goto(url, { waitUntil: 'networkidle' });
await p.evaluate(() => { try { window.mascot && window.mascot.show && window.mascot.show(); } catch {} });
await p.waitForTimeout(1400); // let the 150ms + 600ms settle passes run + glide
const res = await p.evaluate(() => {
  const wrap = document.getElementById('mascotWrap');
  if (!wrap) return { err: 'no mascot' };
  const m = wrap.getBoundingClientRect();
  const sel = '.back-btn, .section-btn, .avatar-pill, button, a, [role="button"], [onclick]';
  const hits = [];
  document.querySelectorAll(sel).forEach(el => {
    if (el === wrap || wrap.contains(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width<=0||r.height<=0) return;
    if (m.left < r.right && m.right > r.left && m.top < r.bottom && m.bottom > r.top)
      hits.push((el.className||el.tagName)+'');
  });
  const back = document.querySelector('.back-btn');
  return {
    mascotPos: { left: Math.round(m.left), top: Math.round(m.top) },
    overlapsNow: hits,
    backBtnRect: back ? { left: Math.round(back.getBoundingClientRect().left), top: Math.round(back.getBoundingClientRect().top), w: Math.round(back.getBoundingClientRect().width), h: Math.round(back.getBoundingClientRect().height) } : null,
  };
});
await b.close();
console.log(JSON.stringify(res, null, 2));
