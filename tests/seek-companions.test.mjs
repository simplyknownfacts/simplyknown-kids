import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const FRIENDS = [
  { name:'Rabbit', id:'bunny' },
  { name:'Cat', id:'tabby' },
  { name:'Panda', id:'panda' },
];
let server, browser, base;

before(async () => {
  const port = await new Promise(resolve => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const value = probe.address().port;
      probe.close(() => resolve(value));
    });
  });
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd:root, env:{...process.env,PORT:String(port)}, stdio:'ignore',
  });
  let ready = false;
  for (let i=0; i<60; i++) {
    try { if ((await fetch(base + '/__health.json')).ok) { ready=true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('companion test server did not start');
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.kill();
});

async function open({ reduced=false, blockVideo=false, blockPoster=false }={}) {
  const ctx = await browser.newContext({
    viewport:{width:390,height:844}, serviceWorkers:'block', reducedMotion:reduced?'reduce':'no-preference',
  });
  await ctx.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (blockVideo && /\/idle\/idle_base\.mp4(?:\?|$)/.test(url.pathname)) return route.abort('failed');
    if (blockPoster && /\/master\.png(?:\?|$)/.test(url.pathname)) return route.abort('failed');
    return route.continue();
  });
  await ctx.addInitScript(() => {
    const profile = {
      id:'companion-test', name:'Companion Tester', birthday:'2020-01-01', voice:'girl', mascot:{id:'bunny'},
      tierOverrides:{'peek-a-boo':6}, features:{}, activitiesVisible:{}, youtube:[],
      achievements:{unlocked:{'peek-a-boo.first':{at:1}},counters:{},repeats:{},streak:{last:null,current:0,best:0},xp:0,rank:'sprout'},
    };
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
    Math.random = () => 0.25;
    window.__mediaCalls = { play:0, pause:0 };
    const nativePlay = HTMLMediaElement.prototype.play;
    const nativePause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.play = function() {
      window.__mediaCalls.play++;
      return nativePlay.call(this);
    };
    HTMLMediaElement.prototype.pause = function() {
      window.__mediaCalls.pause++;
      return nativePause.call(this);
    };
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  const errors=[];
  const requests=[];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.goto(base + '/games/peek-a-boo.html', { waitUntil:'domcontentloaded' });
  await page.locator('#seekCompanion').waitFor({ state:'attached' });
  await page.evaluate(() => { window.seekAwards=[]; window.vbProgress={record:id=>seekAwards.push(id)}; });
  return { ctx, page, errors, requests };
}

const phase = (page, value) => page.waitForFunction(expected => document.querySelector('#stage').dataset.phase === expected, value);

async function canvasStats(page) {
  return page.locator('.companion-actor-canvas').evaluate(canvas => {
    if (!canvas.width || !canvas.height) return { width:canvas.width,height:canvas.height,opaque:0,transparent:0,hash:0 };
    const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let opaque=0,transparent=0,hash=2166136261;
    for (let i=0; i<data.length; i+=4) {
      if (data[i+3] > 200) opaque++;
      if (data[i+3] < 10) transparent++;
      hash ^= data[i]; hash=Math.imul(hash,16777619);
      hash ^= data[i+1]; hash=Math.imul(hash,16777619);
      hash ^= data[i+2]; hash=Math.imul(hash,16777619);
      hash ^= data[i+3]; hash=Math.imul(hash,16777619);
    }
    return {width:canvas.width,height:canvas.height,opaque,transparent,hash:hash>>>0};
  });
}

async function waitForArt(page) {
  await page.waitForFunction(() => {
    const canvas=document.querySelector('.companion-actor-canvas');
    if (!canvas?.width || !canvas.height) return false;
    try {
      const alpha=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      for(let i=3;i<alpha.length;i+=4) if(alpha[i]>200)return true;
    } catch {}
    return false;
  });
  const stats=await canvasStats(page), pixels=stats.width*stats.height;
  assert.ok(stats.opaque > pixels*.01, `companion art is empty: ${JSON.stringify(stats)}`);
  assert.ok(stats.transparent > pixels*.1, `companion canvas is not transparent: ${JSON.stringify(stats)}`);
  return stats;
}

async function startSeek(page) {
  await page.waitForFunction(() => document.querySelector('#roundAction').getAttribute('aria-disabled') === 'false');
  await page.locator('#roundAction').click();
  await phase(page,'hiding');
  await phase(page,'seek');
}

async function hintedTarget(page) {
  await page.locator('#showAgain').click();
  const clue=page.locator('.hiding-spot.clue-peek').first();
  await clue.waitFor();
  return Number(await clue.getAttribute('data-spot'));
}

async function findFriend(page) {
  await startSeek(page);
  const target=await hintedTarget(page);
  await page.locator('.hiding-spot').nth(target).click();
  await phase(page,'found');
}

async function nextRound(page) {
  await page.waitForFunction(() => document.querySelector('#playAgain').getAttribute('aria-disabled') === 'false');
  await page.locator('#playAgain').click();
  await phase(page,'watch');
}

test('one animated companion actor reuses decoded Bunny, Tabby, and Panda idle art through rounds', async () => {
  const {ctx,page,errors}=await open();
  try {
    for (let index=0; index<FRIENDS.length; index++) {
      const friend=FRIENDS[index];
      await page.waitForFunction(name => document.querySelector('#roundAction').textContent.includes(name), friend.name);
      await page.waitForFunction(id => {
        const video=document.querySelector('#seekCompanion video');
        const canvas=document.querySelector('.companion-actor-canvas');
        return canvas?.dataset.id===id && canvas.dataset.media==='video' && video?.readyState>=2
          && (video.currentSrc||video.src).includes(`/mascots/${id}/green/idle/idle_base.mp4`);
      }, friend.id);
      assert.equal(await page.locator('#seekCompanion').count(),1);
      assert.equal(await page.locator('#seekCompanion video').count(),1,'round added another media decoder');
      assert.equal(await page.locator('.companion-actor-canvas').count(),1,'round added another companion canvas');
      const media=await page.locator('#seekCompanion video').evaluate(video => ({
        src:video.currentSrc||video.src,muted:video.muted,loop:video.loop,controls:video.controls,playsInline:video.playsInline,
        hidden:video.hidden,opacity:getComputedStyle(video).opacity,pointerEvents:getComputedStyle(video).pointerEvents,
      }));
      assert.match(media.src,new RegExp(`/mascots/${friend.id}/green/idle/idle_base\\.mp4(?:\\?|$)`));
      assert.deepEqual({muted:media.muted,loop:media.loop,controls:media.controls,playsInline:media.playsInline,hidden:media.hidden,opacity:media.opacity,pointerEvents:media.pointerEvents},
        {muted:true,loop:true,controls:false,playsInline:true,hidden:true,opacity:'0',pointerEvents:'none'},'raw video can expose autoplay UI');
      const first=await waitForArt(page);
      await page.waitForFunction(previous => {
        const canvas=document.querySelector('.companion-actor-canvas'),data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
        let hash=2166136261;for(let i=0;i<data.length;i++){hash^=data[i];hash=Math.imul(hash,16777619);}return (hash>>>0)!==previous;
      }, first.hash);
      await findFriend(page);
      assert.deepEqual(await page.evaluate(() => seekAwards), Array(index+1).fill('peek-a-boo'));
      if (index<FRIENDS.length-1) await nextRound(page);
    }
    assert.equal(await page.locator('#seekCompanion').count(),1);
    assert.equal(await page.locator('#seekCompanion video').count(),1);
    assert.equal(await page.locator('.companion-actor-canvas').count(),1);
    assert.deepEqual(errors,[]);
  } finally {await ctx.close();}
});

test('hiding and page lifecycle conceal and pause the single companion without leaking the previous friend', async () => {
  const {ctx,page,errors}=await open();
  try {
    await waitForArt(page);
    await page.waitForFunction(() => document.querySelector('#roundAction').getAttribute('aria-disabled')==='false');
    await page.locator('#roundAction').click();
    await phase(page,'hiding');
    const hidden=await page.evaluate(() => {
      const host=document.querySelector('#seekCompanion'),canvas=host.querySelector('.companion-actor-canvas'),r=canvas.getBoundingClientRect();
      const top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return {hostVisible:!!(host.offsetWidth||host.offsetHeight||host.getClientRects().length),covered:top?.id==='hideCover'||!!top?.closest('#hideCover'),paused:host.querySelector('video').paused};
    });
    assert.equal(hidden.hostVisible,false,'companion remains visible during hiding');
    assert.equal(hidden.paused,true,'hidden companion video keeps decoding');
    assert.equal(hidden.covered||!hidden.hostVisible,true);
    await phase(page,'seek');
    assert.equal(await page.locator('#seekCompanion').isVisible(),false,'rustle clue leaks the full companion');
    const target=await hintedTarget(page);
    assert.equal(await page.locator('#seekCompanion').isVisible(),false,'requested clue exposes the full companion');
    const peekState=await page.locator('.hiding-spot').nth(target).evaluate(spot=>{const piece=spot.querySelector('.peek-piece');return{visible:getComputedStyle(piece).display!=='none',part:piece.dataset.part,stagePart:document.querySelector('#stage').dataset.peekPart}});
    assert.equal(peekState.visible,true,'requested partial-animal clue is invisible');
    assert.ok(['ears','face','paw','tail'].includes(peekState.part),'requested clue has no supported animal part');
    assert.equal(peekState.part,peekState.stagePart,'partial-animal clue is attached to the wrong round');
    const before=await page.locator('#seekCompanion video').evaluate(video=>video.currentTime);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
    await page.waitForTimeout(350);
    const stopped=await page.locator('#seekCompanion video').evaluate(video=>({paused:video.paused,time:video.currentTime}));
    assert.equal(stopped.paused,true);
    assert.ok(Math.abs(stopped.time-before)<.08,`hidden media advanced ${before} -> ${stopped.time}`);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
    await page.waitForFunction(() => document.querySelector('.hiding-spot.clue-peek'));
    assert.equal(await page.locator('#seekCompanion video').count(),1);
    assert.equal(await page.locator('.companion-actor-canvas').count(),1);
    assert.deepEqual(errors,[]);
  } finally {await ctx.close();}
});

test('reduced motion uses transparent static companion art without advancing video', async () => {
  const {ctx,page,errors,requests}=await open({reduced:true});
  try {
    await page.waitForFunction(()=>document.querySelector('.companion-actor-canvas')?.dataset.media==='poster');
    const first=await waitForArt(page);
    const before=await page.locator('#seekCompanion video').evaluate(video=>({paused:video.paused,time:video.currentTime}));
    await page.waitForTimeout(400);
    const afterState=await page.locator('#seekCompanion video').evaluate(video=>({paused:video.paused,time:video.currentTime}));
    const afterPixels=await canvasStats(page);
    assert.equal(before.paused,true);
    assert.equal(afterState.paused,true);
    assert.ok(Math.abs(afterState.time-before.time)<.02);
    assert.equal(afterPixels.hash,first.hash,'reduced-motion poster animates');
    assert.ok(requests.some(url=>/\/mascots\/bunny\/(?:green\/)?master\.png(?:\?|$)/.test(url)),'static companion did not request existing mascot poster art');
    await findFriend(page);
    assert.equal(await page.locator('#stage').getAttribute('data-phase'),'found');
    assert.deepEqual(errors,[]);
  } finally {await ctx.close();}
});

test('video and poster failures keep Hide and Seek winnable from actual art or the bush clue', async t => {
  await t.test('failed idle video falls back to transparent mascot poster art',async()=>{
    const {ctx,page,errors,requests}=await open({blockVideo:true});
    try{
      await page.waitForFunction(()=>document.querySelector('.companion-actor-canvas')?.dataset.media==='poster');
      await waitForArt(page);
      assert.ok(requests.some(url=>/\/mascots\/bunny\/(?:green\/)?master\.png(?:\?|$)/.test(url)));
      await findFriend(page);
      assert.deepEqual(await page.evaluate(()=>seekAwards),['peek-a-boo']);
      assert.deepEqual(errors,[]);
    }finally{await ctx.close();}
  });
  await t.test('failed video and poster still allow the fair rustling-bush answer',async()=>{
    const {ctx,page,errors}=await open({blockVideo:true,blockPoster:true});
    try{
      await page.waitForFunction(()=>document.querySelector('.companion-actor-canvas')?.dataset.media==='unavailable');
      await startSeek(page);
      const clue=page.locator('.hiding-spot.clue-rustle').first();
      await clue.waitFor();
      const target=Number(await clue.getAttribute('data-spot'));
      await page.locator('.hiding-spot').nth(target).click();
      await phase(page,'found');
      assert.deepEqual(await page.evaluate(()=>seekAwards),['peek-a-boo']);
      assert.equal(await page.locator('#seekCompanion video').count(),1);
      assert.equal(await page.locator('.companion-actor-canvas').count(),1);
      assert.deepEqual(errors,[]);
    }finally{await ctx.close();}
  });
});
