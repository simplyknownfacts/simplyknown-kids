const CACHE = 'vb-v9';
const ASSETS = [
  './', './index.html', './home.html',
  './css/style.css',
  './js/tiers.js', './js/profiles.js', './js/voice-manifest.js', './js/app.js',
  './games/index.html', './games/tap-pop.html', './games/shape-match.html',
  './learning/index.html', './learning/hello-colors.html',
  './learning/animal-sounds.html', './learning/count-along.html',
  './art/index.html', './art/color-splash.html',
  './art/finger-paint.html', './art/stamp-art.html',
  './videos/index.html',
  './parent/settings.html',
  './icon-192.png', './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
