const CACHE = 'vb-v126';
// v126 NO-ROBOT-VOICE HARDENING + Days level-up. (1) The browser-TTS fallback in
// js/app.js is now a NO-OP: if a phrase has no recorded clip the app stays SILENT
// (caption still shows) instead of ever using the device's robotic voice — closes
// gaps the v124 audit missed (it enumerated the intended phrases, not every actual
// speak() call). (2) Days: fixed the "before" prompt to the RECORDED wording ("What
// was the day before X?") and added a Months-of-the-Year round for T6+ (recorded
// month prompts). Prior v125:
//
// v125 DIFFERENTIATE Peek-a-boo vs Surprise Pop (they were both "tap → reveal a
// thing"). Peek-a-boo is now the FIND-the-hidden-animal game: the youngest tier
// (≤2) now taps a curtain to reveal (was auto-cycling with no tap — a baby should
// still tap), older tiers keep the listen-and-find quiz. Surprise Pop is now
// HATCH/GUESS/COLLECT: tap egg → surprise (babies, unchanged); T3+ fill a 16-item
// collection (persisted per kid); T5+ get a black-silhouette clue + 3 guesses
// before the reveal. No new spoken phrases (only the recorded "Yes!"). Prior v124:
//
// v124 ALL-RECORDED VOICE: every spoken phrase is now a real recorded clip in the
// chosen voice (4 voices fully recorded). Removed the "Browser default" robotic TTS
// option from Parent Settings; legacy profiles on it migrate to a real voice. The
// browser-TTS path remains only as a never-hit safety net (all phrases are recorded
// or composed from recorded atoms). Recorded clips download via "Download family for
// offline use" (they're media, in vb-offline). Prior v123 OFFLINE FIX below.
//
// v123 OFFLINE FIX: app did not work offline even after downloading. Two causes:
//  (1) install precache used addAll() (all-or-nothing) - one failed fetch (e.g. the
//      cross-origin Google-fonts URL) aborted the WHOLE precache -> no offline shell.
//      Now each asset is cached individually (allSettled) so one failure cannot wipe it.
//  (2) js/game-settings.js (every activity) + js/paint.js (Color Splash/Color In) were
//      missing from the precache list -> those pages broke offline. Both added.
// Full version history: git log.
const ASSETS = [
  './', './index.html', './home.html', './achievements.html',
  './css/style.css', './css/achievements.css',
  './js/atmosphere.js',
  './js/tiers.js', './js/profiles.js', './js/voice-manifest.js', './js/app.js', './js/mascot.js', './js/sync.js',
  './js/achievement-defs.js', './js/achievement-logic.js', './js/ribbon.js', './js/celebrate.js', './js/progress.js', './js/shelf.js',
  './js/game-settings.js', './js/paint.js',
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
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Resilient precache: add each asset INDIVIDUALLY. addAll() is all-or-nothing,
    // so one failing fetch (the cross-origin Google-fonts URL, a transient blip,
    // a renamed file) would abort the WHOLE precache and leave the app with no
    // offline cache at all. allSettled keeps every asset that did succeed.
    // cache:'no-store' bypasses the HTTP cache so we precache fresh bytes, not a
    // stale GitHub-Pages copy.
    await Promise.allSettled(
      ASSETS.map(u => c.add(new Request(u, { cache: 'no-store' })))
    );
    await self.skipWaiting();
  })());
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
