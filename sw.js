const CACHE = 'vb-v107';  /* bumped: Ages now go to 10 — tier ladder extended to 10 (T8 Grade 2 7-8yr, T9 Grade 3 8-9yr, T10 Grade 4+ 9+; was T8 "Grade 2+" 7+). NEW Memory Match game (games/memory-match.html, 2 pairs at T2 → 12 pairs at T10) and NEW Clock Time (learning/clock.html, analog clock reading: o'clock → half-past → quarters → 5-minute by tier). Math Mountain adds division (T9+/toggle) + missing-number problems (T10+/toggle); Money adds Make Change (T9+/toggle: "costs 65¢, pay $1 — change?"). Big kids (age tier ≥9) get captions + sound effects but NO spoken prompts (narration reads babyish to a 9yo); parents can still enable any feature for younger kids via toggles. 3 new voice phrases generated for all 4 voices. Prior v106: Full-app review (3 code reviewers + 208-cell e2e). App code was clean; two findings fixed: Tilt Drive now EARNS RIBBONS like every other game (it was never registered in achievement-defs.js — counter = cumulative meters driven, ★ per 300 m, bronze at 50 m; crash() records the run's distance) and a double-start guard (two simultaneous sibling-finger taps on style cards could start two game loops). E2E suite repaired (was asserting pre-v101 reality): add-child flow now picks the required mascot+voice, games-gating expects all 7 games. Re-run: 208/208 PASS. Prior v105: Tilt Drive polish — vehicles now point UP (emojis shipped sideways: car/boat rotated +90°, rocket -45°) and each style has its OWN backdrop instead of all looking like a road: river = blue water with scrolling waves, space = scrolling starfield, road = lane + dashes. Prior v104: NEW Tilt Drive game (games/tilt-drive.html) — tilt the phone (or drag/arrow-keys) to steer and dodge obstacles, 3 styles (🚗 road / 🚤 river / 🚀 space), difficulty auto-scales by age, classic game-over + per-style best score. Captions shrunk + softened (weight 800→600, ~30→17px, 88→62% opaque) so they're less in-your-face. NEW "Download family for offline use" (Parent Settings → Offline / Travel) caches the family's mascots + sounds into a version-independent vb-offline cache (survives deploys) so the whole app works with no internet — YouTube/Yoto still need it. Prior v103: Removed the separate Avatar picker from Add Child — the animal companion (mascot) is now the child's avatar everywhere (chooser, home pill, settings, sync, game settings); one less setup step. Old per-kid avatar emoji is ignored; a kid with mascot set to None shows 🐾. Prior v102: Mascot no longer covers an activity tile / the ribbons footer on the section menus (Games/Learn/Art/Watch) — its fixed bottom-left float sat on top of the dense phone grid; it still appears on home + inside each activity. Found by a screenshot visual-sweep (agents inspecting every activity x tier x device). Prior v101: Add Child — the add form now collects name, birthday, animal companion (mascot) + voice, with mascot & voice REQUIRED; the per-panel "add a child first" prompts are now working buttons that open the form (were dead text). Prior v100: Body Parts — bigger figure (easier to tap the small face parts) + every part is now asked once before any repeat (random was giving the same part 3× in 5 taps). Prior v99: Body Parts — ALL 12 kids' face zones re-aligned via automated eye-detection (v97/v98 hand-tuning left most kids' faces ~4-6% too HIGH, so taps on certain kids missed). On-screen captions added for every spoken prompt + "Yes!"/"Try again" feedback, so the games work with the VOLUME OFF. Ribbons made less frequent (slow-activity star cadence 50→120) and the award popup is now a small top toast instead of a full-screen takeover. Prior v98: E2E v2 fixes — 4 canvas activities (tap-pop, stamp-art, finger-paint, color-splash) now resize on rotate (they were stuck at load-time width → dead space + missed taps in landscape; magic-touch already handled it). Body Parts afro kid (body-07) face zones re-centred onto his off-centre/turned head via a new per-kid faceCx (limbs stay body-centred). Found by a two-method full E2E (scripted assertions + agent click-through) on the live site. Prior v97: Body Parts — tap zones re-aligned per-kid across all 12 children (fixes wrong-part taps, e.g. the wheelchair boy's nose registering as "ear" — his head is centred, not shifted; faces no longer drift onto hair), stray image slivers cleaned off body-08/09/10, and a bigger figure on phones. Coloring — photo upload now makes a real coloring page via XDoG line art (bold clean outlines + soft stipple shading, white interiors to colour) instead of the adaptive-threshold "photocopy" that speckled real photos. Prior v96: mascot chroma-key clears faint residue (a hazy yellow box around the giraffe — weaker green screen + mp4 compression). Prior v95: coloring-page upload now makes a CLEAN stencil via adaptive threshold (photocopy method) instead of posterize+Sobel, which produced a noisy junky mess on real photos. Prior v94: Shape Match no longer overlaps shapes onto the drop boxes on phones (shapes are now created before targets are placed, so the row's real height is known) + home decluttered (🎧 launcher removed from home since it has a Listen tile; ribbons shelf clears the avatar pill). Prior v93: default voice is now adult female ('woman'/Rachel) when none is selected (new profiles + speak fallback), and the browser-TTS fallback (for phrases with no recorded clip) now prefers a female voice. Prior v92: Yoto is now ONE shared family connection (tokens in vb_yoto_tokens, not per-profile) — connect once, every kid profile sees the family library. Prior v91: 🎧 launcher overlap fix is now CSS-only — body:has(#avatarPill) #yotoLaunch lifts it above the home kid-switcher pill (reactive, no JS timing/SW-cache races). Prior v90: JS retry lift (raced). Prior v88: re-add offline_access to Yoto login (now enabled in the Yoto dashboard). Prior v87: Parent Settings opens fully collapsed on narrow screens (no panel auto-expanded). Prior v86: drop 'offline_access' from the Yoto login request — Yoto gates it behind manual pre-approval, which blocked sign-in ("scopes not pre-approved: offline_access"). Connect now works (token ~1h, no refresh until Yoto approves offline_access). Prior v85: Yoto player UI — launcher 🎧 FAB on hubs/menus (opens Listen) + prev/next chapter controls in the Listen now-playing bar. Prior v84: Yoto connection wired (public client_id set) + per-profile Yoto tokens (each child links their own account; no cross-profile leak). Prior v83: repeatable ★ ribbon cadence is now per-speed (fast tap games every 300, quizzes every 50 — was a flat 25, which spammed a ribbon ~every 2s) + Tap-a-Tune keyboard glissando (slide finger across keys to play in order). Prior v82: ribbons page touch-scroll fix (html height:100% single scroller — v81's height:auto left no scrollport, so touch swipe was dead on real devices). Prior v81: wooden ribbon shelf + native gallery scroll, ribbon rebalance (harder tiers + repeatable ×N), parent-settings contrast fix, peek-a-boo wired + 3 new young-kid games (Magic Touch / Tap-a-Tune / Surprise Pop), ribbon-award now speaks in the child's voice (woman/man clips added) — invalidates v80 */
const ASSETS = [
  './', './index.html', './home.html', './achievements.html',
  './css/style.css', './css/achievements.css',
  './js/atmosphere.js',
  './js/tiers.js', './js/profiles.js', './js/voice-manifest.js', './js/app.js', './js/mascot.js', './js/sync.js',
  './js/achievement-defs.js', './js/achievement-logic.js', './js/ribbon.js', './js/celebrate.js', './js/progress.js', './js/shelf.js',
  './js/yoto.js', './js/yoto-config.js', './js/yoto-player.js',
  './games/index.html', './games/tap-pop.html', './games/peek-a-boo.html',
  './games/magic-touch.html', './games/tap-a-tune.html', './games/surprise-pop.html', './games/shape-match.html',
  './games/tilt-drive.html', './games/memory-match.html',
  './learning/clock.html',
  './learning/index.html', './learning/hello-colors.html',
  './learning/animal-sounds.html', './learning/count-along.html',
  './learning/abcs.html', './learning/days.html', './learning/math.html',
  './learning/spelling.html', './learning/money.html', './learning/body-parts.html',
  './learning/img/bodies/body-01.png', './learning/img/bodies/body-02.png', './learning/img/bodies/body-03.png',
  './learning/img/bodies/body-04.png', './learning/img/bodies/body-05.png', './learning/img/bodies/body-06.png',
  './learning/img/bodies/body-07.png', './learning/img/bodies/body-08.png', './learning/img/bodies/body-09.png',
  './learning/img/bodies/body-10.png', './learning/img/bodies/body-11.png', './learning/img/bodies/body-12.png',
  './art/index.html', './art/color-splash.html',
  './art/finger-paint.html', './art/stamp-art.html', './art/color-in.html',
  './videos/index.html',
  './listen/index.html',
  './yoto-callback.html',
  './parent/settings.html',
  './icon-192.png', './icon-512.png',
  './offline-manifest.json',
  'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,500..700;1,6..72,500..700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Caveat:wght@500;700&display=swap'
];

// "Download family for offline use" (Parent Settings) writes here. The name has
// NO version suffix, so a deploy (which bumps CACHE) does NOT wipe the family's
// downloaded media — activate() below explicitly keeps this cache.
const OFFLINE = 'vb-offline';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => {
      // cache: 'no-store' bypasses the HTTP cache. Without this, the SW
      // precaches whatever the BROWSER had (often a 10-min stale GitHub Pages
      // copy), and every release keeps users on old JS until that expires.
      const reqs = ASSETS.map(u => new Request(u, { cache: 'no-store' }));
      return c.addAll(reqs);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE && k !== OFFLINE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isHTML = e.request.mode === 'navigate' ||
                 e.request.destination === 'document' ||
                 url.pathname.endsWith('.html') ||
                 url.pathname.endsWith('/');
  // JS/CSS are network-first too: code changes ship on every deploy, so a stale
  // cached copy is the #1 cause of "I don't see my update". Bytes are small.
  const isCode = url.pathname.endsWith('.js') || url.pathname.endsWith('.css');
  if (isHTML || isCode) {
    // Network-first — bypass the HTTP cache (GitHub Pages sets max-age=600) so a
    // deploy lands on the next online load with NO manual cache-clear. Falls back
    // to the cached copy only when offline / the network fails.
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(e.request))
    );
  } else {
    // Cache-first for heavy, immutable assets (audio/video/images/icons/fonts).
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
