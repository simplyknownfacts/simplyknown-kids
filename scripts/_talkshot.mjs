import { chromium } from 'playwright';
const base = 'http://localhost:8866';
const imgPath = process.argv[2] || '/mascots/dog/green/video/talk_frame.png';
const out = process.argv[3] || 'mascots/dog/green/proof-talk.png';

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 700, height: 360 } });
await p.goto(base + '/', { waitUntil: 'domcontentloaded' }); // same-origin so canvas isn't tainted
const stats = await p.evaluate(async (imgPath) => {
  document.body.style.cssText = 'margin:0;background:#0e1020';
  document.body.innerHTML = '<div style="display:flex;gap:20px;padding:20px">'
    + '<div style="width:300px;height:300px;border-radius:16px;background:linear-gradient(135deg,#ff6b6b,#ffd93d);display:flex;align-items:center;justify-content:center"><canvas id="a" width="280" height="280" style="width:280px;height:280px"></canvas></div>'
    + '<div style="width:300px;height:300px;border-radius:16px;background:conic-gradient(#ccc 90deg,#fff 0 180deg,#ccc 0 270deg,#fff 0) 0 0/40px 40px;display:flex;align-items:center;justify-content:center"><canvas id="b" width="280" height="280" style="width:280px;height:280px"></canvas></div></div>';
  const im = new Image(); im.src = imgPath; await im.decode();
  const THR = 40, SM = 40; let stats = null;
  for (const id of ['a','b']) {
    const c = document.getElementById(id), ctx = c.getContext('2d',{willReadFrequently:true});
    ctx.clearRect(0,0,c.width,c.height); ctx.drawImage(im,0,0,c.width,c.height);
    const d = ctx.getImageData(0,0,c.width,c.height), px = d.data;
    let t=0,res=0,op=0;
    for (let i=0;i<px.length;i+=4){const r=px[i],g=px[i+1],bb=px[i+2],m=Math.max(r,bb),gn=g-m;
      if(gn>THR){px[i+3]=0;t++;}else{op++;if(px[i+3]>180&&gn>18)res++;if(gn>0)px[i+1]=m;}}
    ctx.putImageData(d,0,0);
    stats={transparent:t,opaque:op,greenResidual:res,total:px.length/4,pctTransp:Math.round(100*t/(px.length/4))};
  }
  return stats;
}, imgPath);
await p.waitForTimeout(300);
await p.screenshot({ path: out });
await b.close();
console.log('saved ' + out + ' | ' + JSON.stringify(stats));
