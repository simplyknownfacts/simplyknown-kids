/* Home composition and companion travel. This page never writes a child profile. */
(function () {
  'use strict';
  const profile = getActiveProfile();
  if (!profile) { goProfiles(); return; }
  const routes = { games: 'games/index.html', learn: 'learning/index.html', art: 'art/index.html', watch: 'videos/index.html', listen: 'listen/index.html' };
  const labels = { games: 'Games', learn: 'Learn', art: 'Art', watch: 'Watch', listen: 'Listening Hut' };
  const status = document.getElementById('worldStatus');
  const companion = document.getElementById('worldCompanion');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const species = (profile.mascot && profile.mascot.id) || 'dog';
  const animal = (window.mascot && mascot.available.includes(species)) ? species : 'dog';
  let statusTimer, travelTimer, navigationTimer, leaving = false, greetingUntil = 0;
  const idlePoints = { portrait: [[30,49],[37,52],[30,54]], wide: [[50,54],[46,58],[54,56]], landscape: [[48,85],[53,85],[44,85]] };
  let step = 0;
  function mode() { return innerHeight <= 500 && innerWidth > innerHeight ? 'landscape' : innerWidth <= 600 ? 'portrait' : 'wide'; }
  document.getElementById('pillName').textContent = profile.name || 'Your world';
  document.getElementById('pillAvatar').textContent = MASCOT_EMOJI[animal] || '🐾';
  document.getElementById('hiText').textContent = profile.name ? 'Hello, ' + profile.name + '!' : 'A little world of wonder.';
  document.getElementById('companionFallback').textContent = MASCOT_EMOJI[animal] || '🐾';
  companion.dataset.animal = animal;
  document.getElementById('avatarPill').addEventListener('click', () => navigate('index.html'));
  document.getElementById('exitBtn').addEventListener('click', () => {
    if (!document.getElementById('exitKeys')) exitApp();
  });
  document.getElementById('ribbonLink').addEventListener('click', () => navigate('achievements.html'));

  function announce(text) {
    clearTimeout(statusTimer);
    status.textContent = text;
    statusTimer = setTimeout(() => { status.textContent = ''; }, 4500);
  }
  function connected() { return !!(window.yoto && yoto.isConfigured() && yoto.isConnected()); }
  function availability() {
    document.querySelectorAll('[data-world]').forEach(button => {
      const world = button.dataset.world;
      const onlineRequired = world === 'watch' || world === 'listen';
      const disabled = (onlineRequired && !navigator.onLine) || (world === 'listen' && !connected());
      button.setAttribute('aria-disabled', String(disabled));
      const caption = button.querySelector('.house-caption');
      if (!caption.dataset.original) caption.dataset.original = caption.textContent;
      caption.textContent = onlineRequired && !navigator.onLine ? 'Needs a connection' : world === 'listen' && !connected() ? 'A grown-up can connect this' : caption.dataset.original;
    });
  }
  function navigate(path, button) {
    if (leaving) return;
    leaving = true;
    clearTimeout(travelTimer);
    if (button) button.classList.add('is-entering');
    if (typeof cancelSpeak === 'function') cancelSpeak();
    if (window.mascot) mascot.hide();
    navigationTimer = setTimeout(() => goTo(path), motion.matches ? 0 : 160);
  }
  document.querySelectorAll('[data-world]').forEach(button => {
    const world = button.dataset.world;
    button.querySelector('.house-art').innerHTML = worldHouse(world);
    button.addEventListener('click', () => {
      if (leaving) return;
      if ((world === 'watch' || world === 'listen') && !navigator.onLine) {
        announce('This house needs a connection. Games, Learn and Art are ready to explore.'); return;
      }
      if (world === 'listen' && !connected()) {
        announce('A grown-up can connect your Listening Hut in Parent Settings.'); return;
      }
      if (typeof playPop === 'function') playPop();
      navigate(routes[world], button);
    });
  });
  function drawPath() {
    const paths = {
      portrait: 'M250 370 Q280 560 690 920 M710 280 Q430 420 300 550 Q160 660 240 840 M760 610 Q490 560 300 550',
      wide: 'M210 440 Q350 620 500 570 Q650 620 790 440 M500 350L500 570 M270 880Q350 680 500 570 Q650 680 730 880',
      landscape: 'M120 610Q250 950 520 800 Q750 950 900 610 M320 610L410 820 M520 630L520 800 M720 610L650 820',
    };
    const d = paths[mode()];
    ['pathShadow','worldPath','pathDash'].forEach(id => document.getElementById(id).setAttribute('d', d));
    positionBuddy(true);
  }
  function positionBuddy(reset) {
    if (reset) step = 0;
    const points = idlePoints[mode()], point = points[step % points.length];
    companion.style.left = point[0] + '%';
    companion.style.top = point[1] + '%';
  }
  function roam() {
    clearTimeout(travelTimer);
    if (motion.matches || leaving || document.hidden) return;
    travelTimer = setTimeout(() => { step++; positionBuddy(false); roam(); }, 5800);
  }
  if (window.mascot) {
    mascot.show();
    const wrap = document.getElementById('mascotWrap');
    if (wrap) {
      wrap.querySelectorAll('video').forEach(video => {
        video.addEventListener('loadeddata', () => companion.classList.add('has-video'));
        video.addEventListener('error', () => {
          if (![...wrap.querySelectorAll('video')].some(v => v.readyState >= 2)) companion.classList.remove('has-video');
        });
      });
    }
  }
  document.getElementById('helloCompanion').addEventListener('click', () => {
    if (leaving || Date.now() < greetingUntil) return;
    greetingUntil = Date.now() + 4500;
    document.getElementById('companionBubble').textContent = 'Hello, friend!';
    if (window.mascot) mascot.play('welcome', { muted: false });
  });
  function cleanup() {
    clearTimeout(statusTimer); clearTimeout(travelTimer); clearTimeout(navigationTimer);
    if (window.mascot) mascot.hide();
  }
  window.addEventListener('pagehide', cleanup);
  window.addEventListener('pageshow', e => { if (e.persisted) { leaving = false; document.querySelectorAll('.is-entering').forEach(el => el.classList.remove('is-entering')); if (window.mascot) mascot.show(); roam(); } });
  window.addEventListener('resize', drawPath);
  window.addEventListener('online', availability);
  window.addEventListener('offline', availability);
  motion.addEventListener('change', () => { drawPath(); roam(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(travelTimer); else roam(); });
  availability(); drawPath(); roam();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
})();
