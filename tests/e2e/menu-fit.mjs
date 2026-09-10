// Rendered regression for Scott's compact child-menu requirement.
//
// Current activity sets must fit without scrolling at the representative
// phone/tablet/desktop sizes below. If future activities are added, overflow is
// allowed only through the document's natural page scroll: never clipping or a
// nested scroll box. Watch and Listen share the same arrival banner, so they
// are included in the compact-header and accessibility checks too.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = (process.env.BASE_URL || 'http://localhost:8798').replace(/\/$/, '');
const OUT = path.join(import.meta.dirname, 'out', 'menu-fit');
const VIEWPORTS = {
  phone: { width: 390, height: 844, normal: true },
  tablet: { width: 820, height: 1180, normal: true },
  desktop: { width: 1280, height: 900, normal: true },
  short: { width: 320, height: 568, normal: false },
};
const ACTIVITY_MENUS = [
  { id: 'games', route: '/games/index.html', baselineCount: 8 },
  { id: 'learning', route: '/learning/index.html', baselineCount: 10 },
  { id: 'art', route: '/art/index.html', baselineCount: 4 },
];
const SHARED_INTRO_MENUS = [
  ...ACTIVITY_MENUS,
  { id: 'watch', route: '/videos/index.html' },
  { id: 'listen', route: '/listen/index.html' },
];

mkdirSync(OUT, { recursive: true });
const results = [];
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    for (const menu of SHARED_INTRO_MENUS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        serviceWorkers: 'block',
      });
      await context.addInitScript(() => {
        const profile = {
          // T6 is the densest Learning menu: ABCs is still present and every
          // other current lesson has reached its minimum tier (10 cards).
          id: 'menu-fit-t6', name: 'Menu Fit', birthday: '2021-03-05',
          color: '#4ECDC4', voice: 'woman', mascot: { id: 'dog' },
          tierOverrides: {}, features: {}, activitiesVisible: {}, youtube: [],
        };
        localStorage.setItem('vb_profiles', JSON.stringify([profile]));
        localStorage.setItem('vb_active_id', profile.id);
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto(BASE + menu.route, { waitUntil: 'domcontentloaded' });
      await page.locator('.world-intro').waitFor();
      await page.screenshot({ path: path.join(OUT, `${menu.id}-${viewportName}.png`), fullPage: true });

      const geometry = await page.evaluate(() => {
        const rect = element => {
          const box = element?.getBoundingClientRect();
          return box && { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
        };
        const intro = document.querySelector('.world-intro');
        const copy = document.querySelector('.world-intro-copy');
        const emblem = document.querySelector('.world-emblem');
        const nav = document.querySelector('.nav-chrome');
        const hub = document.querySelector('.hub-screen,.channels-screen,.listen-screen');
        const cards = [...document.querySelectorAll('#cardsRow .activity-card')];
        const cardRects = cards.map(rect);
        const doc = document.scrollingElement;
        return {
          intro: rect(intro), copy: rect(copy), emblem: rect(emblem), nav: rect(nav), hub: rect(hub),
          cardRects, cardCount: cards.length,
          innerWidth, innerHeight, docHeight: doc.scrollHeight,
          horizontalOverflow: doc.scrollWidth - innerWidth,
          hubOverflowY: getComputedStyle(hub).overflowY,
        };
      });

      assert.equal(errors.length, 0, `${menu.id}/${viewportName}: page errors: ${errors.join('; ')}`);
      const introCap = viewport.width <= 340 ? 132 : viewport.width <= 420 ? 112 : 130;
      assert.ok(geometry.intro.height <= introCap,
        `${menu.id}/${viewportName}: intro is ${geometry.intro.height}px tall`);
      assert.ok(geometry.copy.top >= geometry.intro.top && geometry.copy.bottom <= geometry.intro.bottom + 1,
        `${menu.id}/${viewportName}: intro copy is clipped`);
      assert.ok(geometry.emblem.top >= geometry.intro.top && geometry.emblem.bottom <= geometry.intro.bottom + 1,
        `${menu.id}/${viewportName}: emblem is clipped`);
      const navOverlap = geometry.nav && {
        width: Math.max(0, Math.min(geometry.nav.right, geometry.intro.right) - Math.max(geometry.nav.left, geometry.intro.left)),
        height: Math.max(0, Math.min(geometry.nav.bottom, geometry.intro.bottom) - Math.max(geometry.nav.top, geometry.intro.top)),
      };
      assert.ok(!navOverlap || navOverlap.width === 0 || navOverlap.height === 0,
        `${menu.id}/${viewportName}: nav overlaps intro by ${navOverlap.width}x${navOverlap.height}px`);
      assert.ok(geometry.horizontalOverflow <= 1,
        `${menu.id}/${viewportName}: ${geometry.horizontalOverflow}px horizontal overflow`);
      assert.equal(geometry.hubOverflowY, 'visible',
        `${menu.id}/${viewportName}: content must use natural page scrolling, not a nested ${geometry.hubOverflowY} scroller`);

      if (menu.baselineCount) {
        assert.ok(geometry.cardCount >= menu.baselineCount,
          `${menu.id}/${viewportName}: expected at least ${menu.baselineCount} current cards, got ${geometry.cardCount}`);
        assert.ok(geometry.cardRects.every(box => box.width >= 44 && box.height >= 44),
          `${menu.id}/${viewportName}: every activity card must remain at least 44px in both dimensions`);
        assert.ok(geometry.cardRects.every(box => box.left >= -1 && box.right <= geometry.innerWidth + 1),
          `${menu.id}/${viewportName}: an activity card is horizontally clipped`);
        const currentSet = geometry.cardRects.slice(0, menu.baselineCount);
        if (viewport.normal) {
          const lastBottom = Math.max(...currentSet.map(box => box.bottom));
          assert.ok(lastBottom <= geometry.innerHeight,
            `${menu.id}/${viewportName}: current ${menu.baselineCount}-card set ends at ${lastBottom}px below ${geometry.innerHeight}px viewport`);
        }
      }

      if (!viewport.normal) {
        await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
        const scrollY = await page.evaluate(() => window.scrollY);
        assert.ok(geometry.docHeight <= geometry.innerHeight + 1 || scrollY > 0,
          `${menu.id}/${viewportName}: short-screen overflow cannot be reached by natural page scroll`);
      }

      results.push({ menu: menu.id, viewport: viewportName, ...geometry });
      await context.close();
    }
  }
} finally {
  await browser.close();
}

writeFileSync(path.join(OUT, 'geometry.json'), JSON.stringify({ base: BASE, results }, null, 2));
console.log(`PASS menu-fit: ${results.length} rendered menu/viewport combinations`);
