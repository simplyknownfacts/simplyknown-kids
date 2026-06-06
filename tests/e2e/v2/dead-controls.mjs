// Dead-control sweep: the test the v2 E2E should have been. For each screen (in
// the states the old harness skipped — incl. NO profile / empty panels), it
// enumerates every interactive element, clicks each on a FRESH load, and flags
// any that produce NO observable effect (no URL change, no DOM change, no
// localStorage change, no dialog, no overlay, no change to the element itself).
// That is exactly the class the old test was blind to (dead buttons throw no error).
import { chromium } from 'playwright';

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:8791').replace(/\/$/, '');
const KID = (over = {}) => ({ id: 'k1', name: 'Kid', birthday: '2020-01-01', avatar: '🦊', color: '#4ECDC4', voice: 'woman', mascot: { id: 'dog' }, tierOverrides: {}, features: {}, activitiesVisible: {}, youtube: [], ...over });

// Each scenario: how to seed localStorage, the URL, and whether to force-open
// Parent Settings (which is normally PIN-gated) so its controls are reachable.
const SCENARIOS = [
  { name: 'picker — NO profiles', url: '/index.html', seed: () => {} },
  { name: 'picker — with profile', url: '/index.html', seed: () => { localStorage.setItem('vb_profiles', JSON.stringify([{ id: 'k1', name: 'Kid', birthday: '2020-01-01', color: '#4ECDC4', mascot: { id: 'dog' } }])); localStorage.setItem('vb_active_id', 'k1'); } },
  { name: 'home', url: '/home.html', seedKid: true },
  { name: 'games hub', url: '/games/index.html', seedKid: true },
  { name: 'learn hub', url: '/learning/index.html', seedKid: true },
  { name: 'art hub', url: '/art/index.html', seedKid: true },
  { name: 'achievements', url: '/achievements.html', seedKid: true },
  { name: 'settings — NO child', url: '/parent/settings.html', settings: true, seed: () => {} },
  { name: 'settings — with child', url: '/parent/settings.html', settings: true, seedKid: true },
];

const SEL = 'button, a[href], [onclick], [role="button"], select, input[type="checkbox"], input[type="file"], .btn, .card, .navitem, .kid-pill, .acc-title, .vcard, .voice-card, .add-btn, .avatar-pill, .pip, .swatch';

async function setup(page, sc) {
  await page.addInitScript(([s, kid]) => {
    try { localStorage.clear(); if (s === 'kid') { localStorage.setItem('vb_profiles', JSON.stringify([kid])); localStorage.setItem('vb_active_id', kid.id); } } catch (e) {}
  }, [sc.seedKid ? 'kid' : 'custom', KID()]);
  if (sc.seed && !sc.seedKid) { /* custom seed runs in-page below */ }
  await page.goto(BASE + sc.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  if (sc.seed && !sc.seedKid) { await page.evaluate(`(${sc.seed.toString()})()`).catch(() => {}); await page.goto(BASE + sc.url, { waitUntil: 'domcontentloaded' }).catch(() => {}); }
  if (sc.settings) {
    // Unlock for real (showMain = the post-PIN path that builds EVERY panel), so
    // the sweep actually covers settings; then expand all accordion panels.
    await page.evaluate(() => {
      try { if (window.showMain) window.showMain(); } catch (e) {}
      document.querySelectorAll('.settings-panel').forEach(s => s.classList.add('acc-open'));
    }).catch(() => {});
  }
  await page.waitForTimeout(550); // let async section builds settle (kills false "changed")
  // Self-test: a button with NO handler MUST be flagged dead. If it isn't, the
  // detector/enumeration is hollow — better to fail loud than to false-clean.
  await page.evaluate(() => { if (!document.getElementById('__deadnoop')) document.body.insertAdjacentHTML('beforeend', '<button id="__deadnoop" class="btn">__DEAD_NOOP__</button>'); }).catch(() => {});
  await page.waitForTimeout(150);
}

// Structural snapshot — robust to ambient animation (atmosphere.js churns the
// DOM, so raw innerHTML length is useless). Counts interactive controls, transient
// overlays, and the add-form's visibility — none of which ambient animation moves.
const snapshot = (page) => page.evaluate((sel) => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const f = document.getElementById('addForm');
  return {
    url: location.href,
    ls: JSON.stringify(localStorage).length,
    controls: Array.from(document.querySelectorAll(sel)).filter(vis).length,
    overlays: document.querySelectorAll('.vb-celebrate,.vb-caption,dialog[open]').length,
    addForm: f ? getComputedStyle(f).display : 'na',
  };
}, SEL);

// "Keep" = visible AND a genuine LEAF control we can actually drive with a click.
// Excludes the classes that always "do nothing" to a synthetic click but aren't
// bugs: <select> (can't operate), file inputs/labels (open the OS picker),
// mailto/tel links (external), and container elements that wrap other controls.
const VISFN = (el) => {
  const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
  if (!(r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none')) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'select') return false;
  if (tag === 'input' && el.type === 'file') return false;
  if (tag === 'label' && el.querySelector('input[type="file"]')) return false;
  const href = el.getAttribute('href') || '';
  if (href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0) return false;
  if (el.querySelector('button,a[href],select,input,[onclick],[role="button"]')) return false;
  return true;
};
async function listControls(page) {
  return page.$$eval(`${SEL}`, (els, visSrc) => {
    const vis = new Function('el', 'return (' + visSrc + ')(el)');
    return els.filter(vis).map((el, i) => ({ i, tag: el.tagName.toLowerCase(), txt: (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 40), onclick: !!el.getAttribute('onclick'), href: el.getAttribute('href') || '' }));
  }, VISFN.toString());
}

const run = async () => {
  const browser = await chromium.launch();
  const flagged = [];
  let total = 0;
  for (const sc of SCENARIOS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept().catch(() => {}));
    await setup(page, sc);
    const controls = await listControls(page);
    console.log('  ' + sc.name + ': ' + controls.length + ' visible controls');
    for (const c of controls) {
      total++;
      let dialog = false; const onD = () => { dialog = true; };
      await setup(page, sc); // fresh load per control (no cross-contamination)
      page.once('dialog', onD);
      const before = await snapshot(page);
      const click = await page.evaluate(({ sel, idx, visSrc }) => {
        const vis = new Function('el', 'return (' + visSrc + ')(el)');
        const el = Array.from(document.querySelectorAll(sel)).filter(vis)[idx];
        if (!el) return { ok: false };
        if (el.tagName === 'INPUT' && el.type === 'file') return { ok: true, file: true };
        const beforeOuter = el.outerHTML;
        try { el.click(); } catch (e) {}
        const el2 = Array.from(document.querySelectorAll(sel)).filter(vis)[idx];
        return { ok: true, file: false, selfChanged: !el2 || el2.outerHTML !== beforeOuter };
      }, { sel: SEL, idx: c.i, visSrc: VISFN.toString() }).catch(() => ({ ok: false }));
      await page.waitForTimeout(350);
      const after = await snapshot(page).catch(() => before);
      const changed = (click && click.file) || dialog
        || before.url !== after.url || before.ls !== after.ls
        || before.controls !== after.controls || before.overlays !== after.overlays || before.addForm !== after.addForm
        || (click && click.selfChanged);
      if (click && click.ok && !click.file && !changed) flagged.push({ scenario: sc.name, tag: c.tag, txt: c.txt, onclick: c.onclick, href: c.href });
    }
    await ctx.close();
  }
  await browser.close();
  const selfTest = flagged.filter(f => f.txt.includes('__DEAD_NOOP__'));
  const real = flagged.filter(f => !f.txt.includes('__DEAD_NOOP__'));
  console.log(`\n=== DEAD-CONTROL SWEEP — ${BASE} ===\nclicked ${total} controls across ${SCENARIOS.length} screens`);
  console.log(`detector self-test (injected dead button flagged on ${selfTest.length}/${SCENARIOS.length} screens): ${selfTest.length === SCENARIOS.length ? 'PASS — detector works' : 'FAIL — detector is HOLLOW'}`);
  console.log(`\nREAL dead controls: ${real.length}`);
  for (const f of real) console.log(`  [${f.scenario}] <${f.tag}> "${f.txt}"${f.onclick ? ' onclick' : ''}${f.href ? ' href=' + f.href : ''}`);
  if (!real.length) console.log('  (none flagged)');
};
run();
