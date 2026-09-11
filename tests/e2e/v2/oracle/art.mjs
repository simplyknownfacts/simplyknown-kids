// Oracle: art activities. Canvas ones get the rotation-bug check (spec §8.1).
import { shot } from '../lib/harness.mjs';
import { assertLoaded, assertRotationHandled } from '../lib/checks.mjs';

const settle = (p) => p.waitForTimeout(800);
const canvasArt = (id, url, tiers) => ({
  id, url, tiers,
  async check(page, info) {
    const ok = await assertLoaded(page, info.report, info, 'canvas');
    await settle(page);
    await shot(page, `${id}-t${info.tier}-${info.vp}`);
    if (ok && info.vp === 'phone') await assertRotationHandled(page, info.report, info, 'canvas');
  },
});

// These studios fit a sheet inside the available space. Requiring a sheet to
// fill the entire landscape width would stretch the picture and reward a bug.
const pixels = (page, selector, points) => page.locator(selector).evaluate((c, points) =>
  points.map(([x,y]) => Array.from(c.getContext('2d').getImageData(
    Math.floor(c.width*x), Math.floor(c.height*y), 1, 1).data)), points);
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
async function rotateStudio(page, info, selector, points, painted) {
  const vp=page.viewportSize();
  await page.setViewportSize({width:vp.height,height:vp.width}); await settle(page);
  const b=await page.locator(selector).boundingBox();
  const fits=b && b.width>80 && b.height>80 && b.x>=0 && b.y>=0 && b.x+b.width<=vp.height+1 && b.y+b.height<=vp.width+1;
  const kept=same(await pixels(page,selector,points),painted);
  info.report.add({id:`${info.id} rotated-sheet-fits-and-keeps-art`,pass:!!fits&&kept,severity:'High',detail:`fits=${!!fits}, artwork preserved=${kept}`});
  await page.setViewportSize(vp); await settle(page);
}

export default [
  canvasArt('stamp-art', '/art/stamp-art.html', [1, 5]),
  {
    id:'finger-paint',url:'/art/finger-paint.html',tiers:[1,4],
    async check(page,info){
      if(!await assertLoaded(page,info.report,info,'#canvas'))return;
      await settle(page);
      const points=[[.5,.5],[.1,.1]], before=await pixels(page,'#canvas',points);
      const b=await page.locator('#canvas').boundingBox();
      await page.mouse.move(b.x+b.width*.4,b.y+b.height*.5);await page.mouse.down();
      await page.mouse.move(b.x+b.width*.6,b.y+b.height*.5,{steps:12});await page.mouse.up();
      const after=await pixels(page,'#canvas',points);
      info.report.add({id:`${info.id} draws-only-along-stroke`,pass:!same(before[0],after[0])&&same(before[1],after[1]),severity:'High'});
      if(info.vp==='phone')await rotateStudio(page,info,'#canvas',points,after);
      await shot(page,`finger-paint-t${info.tier}-${info.vp}`);
    },
  },
  canvasArt('color-splash', '/art/color-splash.html', [1, 3]),
  {
    id: 'color-in', url: '/art/color-in.html', tiers: [1, 2],
    async check(page, info) {
      if(!await assertLoaded(page,info.report,info,'#colorFillCanvas[data-ready="1"]'))return;
      await settle(page);
      // Known Sun drawing coordinates: two distant face points, a separate ray
      // and the dark pupil. A brush dot cannot satisfy a whole-region fill.
      const points=[[.5,.375],[.575,.375],[.5,.1125],[.42,.47]];
      const before=await pixels(page,'#colorFillCanvas',points);
      const b=await page.locator('#colorFillCanvas').boundingBox();
      await page.mouse.click(b.x+b.width*.5,b.y+b.height*.375);
      const after=await pixels(page,'#colorFillCanvas',points);
      const filled=!same(before[0],after[0])&&!same(before[1],after[1])&&same(after[0],after[1]);
      info.report.add({id:`${info.id} fills-one-enclosed-region`,pass:filled&&same(before[2],after[2])&&same(before[3],after[3]),severity:'High'});
      if(info.vp==='phone')await rotateStudio(page,info,'#colorFillCanvas',points,after);
      await shot(page, `color-in-t${info.tier}-${info.vp}`);
    },
  },
];
