/* Location memory: the child sees the answer before hiding it. The legacy
 * activity id deliberately keeps each child's settings and earned progress. */
(() => {
  const profile = getActiveProfile();
  if (!profile) { goProfiles(); return; }
  const id = 'peek-a-boo', tier = getActivityTier(profile, id);
  const count = tier >= 5 || getProfileFeature(profile, id, 'multiChoice') ? 3 : 2;
  const animals = [{ name:'Rabbit', icon:'🐰' }, { name:'Cat', icon:'🐱' }, { name:'Bear', icon:'🐻' }];
  const places = ['Pink flower bush', 'Yellow flower bush', 'Blue flower bush'];
  const stage = document.getElementById('stage'), hint = document.getElementById('hint');
  const action = document.getElementById('roundAction'), again = document.getElementById('showAgain');
  let active = true, generation = 0, timer = null, renderer = null, loadTimer = null;
  let rendererFactory = null, loadFailed = false;
  let target = -1, animal = -1, phase = 'watch', readyAt = 0;
  const tried = new Set(), spots = [];
  renderBackBtn('index.html');
  gameSettings.attach(id);
  if (window.vbProgress) { vbProgress.firstPlay(id); vbProgress.touchStreak(); }

  function later(fn, delay) {
    clearTimeout(timer);
    const round = generation;
    timer = setTimeout(() => { timer = null; if (active && round === generation) fn(); }, delay);
  }
  function moveSpot(i, rect) {
    if (!spots[i]) return;
    for (const key of ['left','top','width','height']) spots[i].style[key] = rect[key] * 100 + '%';
  }
  function fallbackPositions() {
    spots.forEach((_,i) => moveSpot(i, count === 2
      ? {left:i*.5+.035,top:.15,width:.43,height:.74}
      : i === 2 ? {left:.33,top:.01,width:.34,height:.47}
        : {left:i*.54+.035,top:.48,width:.39,height:.49}));
  }
  function render() {
    stage.dataset.phase = phase;
    const visible = phase === 'watch' || phase === 'found';
    spots.forEach((spot,i) => {
      spot.disabled = !active || phase !== 'seek' || tried.has(i);
      spot.classList.toggle('empty', phase === 'seek' && tried.has(i));
      spot.classList.toggle('guide', phase === 'seek' && i === target && (tier <= 2 || tried.size >= 2));
      spot.querySelector('.peek-marker')?.remove();
      const sprite = spot.querySelector('.fallback-animal');
      sprite.textContent = visible && i === target ? animals[animal].icon : '';
      if (visible && i === target) {
        const marker = document.createElement('span'); marker.className = 'peek-marker';
        marker.textContent = animals[animal].name; marker.setAttribute('aria-hidden','true'); spot.appendChild(marker);
      }
    });
    action.hidden = phase === 'seek';
    action.disabled = !active || phase === 'hiding' || performance.now() < readyAt;
    action.textContent = phase === 'found' ? '↻ Play again' : phase === 'hiding' ? '🙈 Hiding…' : '🙈 Hide!';
    again.hidden = phase !== 'seek';
    again.disabled = !active;
    renderer?.update({count,target,phase,animal});
  }
  function show() {
    clearTimeout(timer); timer = null; phase = 'watch'; tried.clear();
    readyAt = performance.now() + 350;
    hint.textContent = animals[animal].name + ' is at the ' + places[target].toLowerCase() + '. Remember this spot.';
    render(); later(render, 360);
    // Reuse recorded animal names. The new memory instructions stay visible;
    // do not pretend an unrecorded sentence has spoken audio.
    speakInstruction(animals[animal].name);
  }
  function nextRound() {
    generation++;
    target = target < 0 ? Math.floor(Math.random()*count) : (target+1+Math.floor(Math.random()*(count-1)))%count;
    animal = (animal+1)%animals.length;
    show();
  }
  function choose(i) {
    if (!active || phase !== 'seek' || tried.has(i)) return;
    if (i !== target) {
      tried.add(i);
      hint.textContent = 'That bush is empty. Try another, or look again.';
      playBoop(); speak('Try again!'); render(); return;
    }
    phase = 'found'; readyAt = performance.now()+500;
    hint.textContent = 'You found ' + animals[animal].name + '!';
    render(); later(render,510);
    playSuccess(); speak('Yes! '+animals[animal].name+'!');
    if (window.vbProgress) vbProgress.record(id);
  }
  for (let i=0;i<count;i++) {
    const spot = document.createElement('button'); spot.type='button'; spot.className='hiding-spot';
    spot.dataset.spot=String(i); spot.setAttribute('aria-label',places[i]);
    spot.style.setProperty('--flower',['#f5a7ce','#ffe071','#95c7ff'][i]);
    spot.innerHTML='<span class="fallback-animal" aria-hidden="true"></span><span class="fallback-bush" aria-hidden="true"></span>';
    spot.addEventListener('click',event => { if (event.button === 0) choose(i); });
    stage.appendChild(spot); spots.push(spot);
  }
  action.addEventListener('click',event => {
    if (event.button !== 0 || !active || performance.now()<readyAt) return;
    if (phase === 'found') { nextRound(); return; }
    if (phase !== 'watch') return;
    phase='hiding'; hint.textContent='Watch…'; render();
    later(() => { phase='seek'; hint.textContent='Where did our friend hide? Tap a bush.';render();spots[0].focus({preventScroll:true}); },450);
  });
  again.addEventListener('click',event=>{if(event.button===0 && active && phase==='seek') show();});
  function useFallback() {
    if (!active) { loadFailed = true; return; }
    clearTimeout(loadTimer); renderer?.dispose(); renderer=null;
    stage.dataset.renderer='fallback'; fallbackPositions(); render();
  }
  function leave() {active=false;generation++;clearTimeout(timer);clearTimeout(loadTimer);timer=null;renderer?.pause();}
  window.addEventListener('pagehide',leave);
  window.addEventListener('beforeunload',leave);
  window.addEventListener('pageshow',event=>{
    if(!event.persisted) return;
    active=true;
    if(loadFailed) useFallback();
    else if(!renderer && stage.dataset.renderer==='loading') {
      if(rendererFactory) startRenderer();
      else loadTimer=setTimeout(useFallback,3500);
    }
    renderer?.resume();show();
  });
  stage.addEventListener('sceneerror',useFallback);
  fallbackPositions(); nextRound();
  loadTimer=setTimeout(useFallback,3500);
  function startRenderer() {
    if(!active || stage.dataset.renderer==='fallback') return;
    try {
      renderer=rendererFactory(stage,{onPlace:moveSpot});
      clearTimeout(loadTimer); stage.dataset.renderer='webgl';render();
    } catch { useFallback(); }
  }
  import('./hide-seek-scene.js').then(({createHideSeekScene})=>{
    rendererFactory=createHideSeekScene; startRenderer();
  }).catch(()=>{loadFailed=true;useFallback();});
})();
