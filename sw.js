const CACHE = 'vb-v97';  /* bumped: Body Parts — tap zones re-aligned per-kid across all 12 children (fixes wrong-part taps, e.g. the wheelchair boy's nose registering as "ear" — his head is centred, not shifted; faces no longer drift onto hair), stray image slivers cleaned off body-08/09/10, and a bigger figure on phones. Coloring — photo upload now makes a real coloring page via XDoG line art (bold clean outlines + soft stipple shading, white interiors to colour) instead of the adaptive-threshold "photocopy" that speckled real photos. Prior v96: mascot chroma-key clears faint residue (a hazy yellow box around the giraffe — weaker green screen + mp4 compression). Prior v95: coloring-page upload now makes a CLEAN stencil via adaptive threshold (photocopy method) instead of posterize+Sobel, which produced a noisy junky mess on real photos. Prior v94: Shape Match no longer overlaps shapes onto the drop boxes on phones (shapes are now created before targets are placed, so the row's real height is known) + home decluttered (🎧 launcher removed from home since it has a Listen tile; ribbons shelf clears the avatar pill). Prior v93: default voice is now adult female ('woman'/Rachel) when none is selected (new profiles + speak fallback), and the browser-TTS fallback (for phrases with no recorded clip) now prefers a female voice. Prior v92: Yoto is now ONE shared family connection (tokens in vb_yoto_tokens, not per-profile) — connect once, every kid profile sees the family library. Prior v91: 🎧 launcher overlap fix is now CSS-only — body:has(#avatarPill) #yotoLaunch lifts it above the home kid-switcher pill (reactive, no JS timing/SW-cache races). Prior v90: JS retry lift (raced). Prior v88: re-add offline_access to Yoto login (now enabled in the Yoto dashboard). Prior v87: Parent Settings opens fully collapsed on narrow screens (no panel auto-expanded). Prior v86: drop 'offline_access' from the Yoto login request — Yoto gates it behind manual pre-approval, which blocked sign-in ("scopes not pre-approved: offline_access"). Connect now works (token ~1h, no refresh until Yoto approves offline_access). Prior v85: Yoto player UI — launcher 🎧 FAB on hubs/menus (opens Listen) + prev/next chapter controls in the Listen now-playing bar. Prior v84: Yoto connection wired (public client_id set) + per-profile Yoto tokens (each child links their own account; no cross-profile leak). Prior v83: repeatable ★ ribbon cadence is now per-speed (fast tap games every 300, quizzes every 50 — was a flat 25, which spammed a ribbon ~every 2s) + Tap-a-Tune keyboard glissando (slide finger across keys to play in order). Prior v82: ribbons page touch-scroll fix (html height:100% single scroller — v81's height:auto left no scrollport, so touch swipe was dead on real devices). Prior v81: wooden ribbon shelf + native gallery scroll, ribbon rebalance (harder tiers + repeatable ×N), parent-settings contrast fix, peek-a-boo wired + 3 new young-kid games (Magic Touch / Tap-a-Tune / Surprise Pop), ribbon-award now speaks in the child's voice (woman/man clips added) — invalidates v80 */
const ASSETS = [
  './', './index.html', './home.html', './achievements.html',
  './css/style.css', './css/achievements.css',
  './js/atmosphere.js',
  './js/tiers.js', './js/profiles.js', './js/voice-manifest.js', './js/app.js', './js/mascot.js', './js/sync.js',
  './js/achievement-defs.js', './js/achievement-logic.js', './js/ribbon.js', './js/celebrate.js', './js/progress.js', './js/shelf.js',
  './js/yoto.js', './js/yoto-config.js', './js/yoto-player.js',
  './games/index.html', './games/tap-pop.html', './games/peek-a-boo.html',
  './games/magic-touch.html', './games/tap-a-tune.html', './games/surprise-pop.html', './games/shape-match.html',
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
  'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,500..700;1,6..72,500..700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Caveat:wght@500;700&display=swap'
];

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
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
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
