// Home interaction remains available through accessible buttons if 3D fails.
(function () {
  'use strict';
  const profile = getActiveProfile();
  if (!profile) { goProfiles(); return; }
  const routes = {games:'games/index.html',learn:'learning/index.html',art:'art/index.html',watch:'videos/index.html',listen:'listen/index.html',ribbons:'achievements.html','my-room':'my-room.html'};
  const host = document.getElementById('worldScene');
  const status = document.getElementById('worldStatus');
  const companion = document.getElementById('worldCompanion');
  const species = profile.mascot?.id || 'dog';
  const animal = window.mascot?.available.includes(species) ? species : 'dog';
  let scene, statusTimer, reactionTimer, loadingTimer, leaving = false;
  document.getElementById('pillName').textContent = profile.name || 'Your world';
  document.getElementById('pillAvatar').textContent = MASCOT_EMOJI[animal] || '🐾';
  document.getElementById('hiText').textContent = profile.name ? 'Hello, ' + profile.name + '!' : 'Your little world';
  document.getElementById('companionFallback').textContent = MASCOT_EMOJI[animal] || '🐾';
  companion.dataset.animal = animal;
  companion.setAttribute('aria-label','Play your ' + (window.mascot?.labels[animal] || animal) + "'s sound");
  function announce(text) {
    clearTimeout(statusTimer);status.textContent = text;
    statusTimer = setTimeout(() => { status.textContent = ''; }, 4500);
  }
  function availability() {
    for (const button of host.querySelectorAll('[data-world]')) {
      const kind=button.dataset.world;
      const disabled=kind==='watch'&&!navigator.onLine;
      button.setAttribute('aria-disabled',String(disabled));
    }
  }
  function navigate(path) {
    if(leaving)return;
    leaving=true;scene?.pause();
    if(typeof cancelSpeak==='function')cancelSpeak();
    window.mascot?.hide();goTo(path);
  }
  function activate(kind) {
    if(leaving||!Object.hasOwn(routes,kind))return;
    if(kind==='watch'&&!navigator.onLine) {
      announce('This hut needs a connection. Games, Learn and Art are ready.');return;
    }
    if(typeof playPop==='function')playPop();navigate(routes[kind]);
  }
  host.querySelectorAll('[data-world]').forEach(button=>button.addEventListener('click',()=>activate(button.dataset.world)));
  document.getElementById('avatarPill').addEventListener('click',()=>navigate('index.html'));
  document.getElementById('exitBtn').addEventListener('click',()=>{if(!document.getElementById('exitKeys'))exitApp();});
  companion.addEventListener('click',()=>{
    if(leaving)return;
    if(window.mascot?.react?.()) {
      companion.classList.add('is-reacting');clearTimeout(reactionTimer);
      reactionTimer=setTimeout(()=>companion.classList.remove('is-reacting'),700);
    }
  });
  if(window.mascot) {
    mascot.show();
    document.querySelectorAll('#mascotWrap video').forEach(video=>{
      video.addEventListener('loadeddata',()=>companion.classList.add('has-video'));
      if(video.readyState>=2)companion.classList.add('has-video');
      video.addEventListener('error',()=>{
        if(![...document.querySelectorAll('#mascotWrap video')].some(v=>v.readyState>=2))companion.classList.remove('has-video');
      });
    });
  }
  function initializeWorld() {
    clearTimeout(loadingTimer);
    loadingTimer=setTimeout(()=>{
      if(scene||leaving)return;
      host.dataset.state='fallback';
      announce('Your world is taking a moment. You can choose a hut now.');
    },3000);
    import('./world-scene.js').then(({createWorldScene})=>{
      clearTimeout(loadingTimer);
      if(leaving||scene)return;
      clearTimeout(statusTimer);status.textContent='';
      scene=createWorldScene(host,{activate,announce,placeCompanion(x,y,size){
        Object.assign(companion.style,{left:x+'px',top:y+'px',width:size+'px',height:(size*1.05)+'px'});
      }});
      window.vbWorldScene=scene;
    }).catch(error=>{
      clearTimeout(loadingTimer);
      if(leaving)return;
      host.dataset.state='fallback';
      announce('Your world could not open. You can still choose a hut.');
      console.warn('[world] 3D scene unavailable:',error.message);
    });
  }
  initializeWorld();
  function cleanup(){clearTimeout(loadingTimer);clearTimeout(statusTimer);clearTimeout(reactionTimer);scene?.pause();window.mascot?.hide();}
  window.addEventListener('pagehide',cleanup);
  window.addEventListener('pageshow',event=>{if(event.persisted){leaving=false;window.mascot?.show();if(scene)scene.resume();else initializeWorld();}});
  window.addEventListener('online',availability);window.addEventListener('offline',availability);
  availability();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{});
})();
