const CACHE = 'vb-v79';  /* bumped: restored achievements/ribbons system (recovered from deleted branch) — engine + shelf + gallery wired into all activities — invalidates v78 */
const ASSETS = [
  './', './index.html', './home.html', './achievements.html',
  './css/style.css', './css/achievements.css',
  './js/atmosphere.js',
  './js/tiers.js', './js/profiles.js', './js/voice-manifest.js', './js/app.js', './js/mascot.js', './js/sync.js',
  './js/achievement-defs.js', './js/achievement-logic.js', './js/ribbon.js', './js/celebrate.js', './js/progress.js', './js/shelf.js',
  './js/yoto.js', './js/yoto-config.js', './js/yoto-player.js',
  './games/index.html', './games/tap-pop.html', './games/shape-match.html',
  './learning/index.html', './learning/hello-colors.html',
  './learning/animal-sounds.html', './learning/count-along.html',
  './learning/abcs.html', './learning/days.html', './learning/math.html',
  './learning/spelling.html', './learning/money.html', './learning/body-parts.html',
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
