/* Clue-based search: introduce the friend away from every bush, then hide
 * out of sight. The legacy id preserves each child's settings and progress. */
(() => {
  const profile = getActiveProfile();
  if (!profile) { goProfiles(); return; }
  const id = 'peek-a-boo', tier = getActivityTier(profile, id);
  const count = tier >= 5 || getProfileFeature(profile, id, 'multiChoice') ? 3 : 2;
  const animals = [{name:'Rabbit',id:'bunny'}, {name:'Cat',id:'tabby'}, {name:'Panda',id:'panda',spokenName:'Bear'}];
  const places = ['Pink flower bush', 'Yellow flower bush', 'Blue flower bush'];
  const stage = document.getElementById('stage'), hint = document.getElementById('hint');
  const action = document.getElementById('roundAction'), again = document.getElementById('showAgain');
  const next = document.getElementById('playAgain'), intro = document.getElementById('friendIntro');
  const cover = document.getElementById('hideCover');
  const companionHost = document.getElementById('seekCompanion');
  const companion = window.mascot?.createActor({host:companionHost,id:animals[0].id});
  const anchors = [];
  let companionId = animals[0].id;
  let active = true, generation = 0, timer = null, clueTimer = null, renderer = null, loadTimer = null;
  let rendererFactory = null, loadFailed = false, rendererBroken = false;
  let target = -1, animal = -1, phase = 'watch', clue = 'none', readyAt = 0, hintAt = 0, pinnedHint = false;
  const tried = new Set(), spots = [];
  renderBackBtn('index.html');
  gameSettings.attach(id);
  if (window.vbProgress) { vbProgress.firstPlay(id); vbProgress.touchStreak(); }

  function later(fn, delay) {
    clearTimeout(timer);
    const round = generation;
    timer = setTimeout(() => { timer = null; if (active && round === generation) fn(); }, delay);
  }
  function clearClues() { clearTimeout(clueTimer); clueTimer = null; clue = 'none'; }
  function clueLater(fn, delay) {
    clearTimeout(clueTimer);
    const round = generation;
    clueTimer = setTimeout(() => {
      clueTimer = null;
      if (active && phase === 'seek' && round === generation && !document.hidden) fn();
    }, delay);
  }
  function moveSpot(i, rect, anchor) {
    if (!spots[i]) return;
    const bounds = stage.getBoundingClientRect();
    // A distant bush can project smaller than a finger on short landscape
    // screens. Expand its input area around the same center, inside the stage.
    const width = Math.min(1, Math.max(rect.width, 46 / Math.max(1,bounds.width)));
    const height = Math.min(1, Math.max(rect.height, 46 / Math.max(1,bounds.height)));
    const box = {
      width, height,
      left: Math.max(0, Math.min(1-width, rect.left-(width-rect.width)/2)),
      top: Math.max(0, Math.min(1-height, rect.top-(height-rect.height)/2)),
    };
    for (const key of ['left','top','width','height']) spots[i].style[key] = box[key] * 100 + '%';
    anchors[i] = anchor || {
      peek:{x:rect.left+rect.width*.5,y:rect.top+rect.height*.35},
      found:{x:rect.left+rect.width*.5,y:rect.top+rect.height*.82}, width:rect.width*.8,
    };
    positionCompanion();
  }
  function fallbackPositions() {
    spots.forEach((_,i) => moveSpot(i, count === 2
      ? {left:i*.5+.035,top:.15,width:.43,height:.74}
      : i === 2 ? {left:.33,top:.01,width:.34,height:.47}
        : {left:i*.54+.035,top:.48,width:.39,height:.49}));
  }
  function positionCompanion() {
    if (phase === 'watch') {
      if (companionHost.parentNode !== intro) intro.prepend(companionHost);
      companionHost.removeAttribute('style');
      companionHost.dataset.pose = 'intro';
      return;
    }
    if (companionHost.parentNode !== stage) stage.appendChild(companionHost);
    const anchor = anchors[target];
    if (!anchor) return;
    const bounds = stage.getBoundingClientRect();
    const size = Math.min(bounds.width * anchor.width, bounds.height * .75);
    const peek = phase === 'seek';
    const point = peek ? anchor.peek : anchor.found;
    const x = Math.max(0, Math.min(bounds.width-size, point.x*bounds.width-size/2));
    const y = point.y*bounds.height-size*(peek ? .36 : .94);
    companionHost.dataset.pose = peek ? 'peek' : 'found';
    Object.assign(companionHost.style,{left:x+'px',top:y+'px',width:size+'px',height:size+'px'});
  }
  function render() {
    stage.dataset.phase = phase;
    stage.dataset.clue = clue;
    intro.hidden = phase !== 'watch';
    cover.hidden = phase !== 'hiding';
    intro.querySelector('.intro-name').textContent = animals[animal].name;
    spots.forEach((spot,i) => {
      const isClue = phase === 'seek' && i === target;
      spot.disabled = !active || phase !== 'seek' || tried.has(i);
      spot.classList.toggle('empty', phase === 'seek' && tried.has(i));
      spot.classList.toggle('clue-peek', isClue && clue === 'peek');
      spot.classList.toggle('clue-rustle', isClue && clue === 'rustle');
      spot.querySelector('.rustle-clue').hidden = !isClue || clue !== 'rustle';
      // Expose only a clue actually visible now; never leak the future answer.
      spot.setAttribute('aria-label', places[i] + (isClue && clue !== 'none'
        ? clue === 'peek' ? ' — little ears peeking out' : ' — leaves rustling'
        : tried.has(i) ? ' — empty' : ''));
    });
    action.style.visibility = phase === 'watch' || phase === 'hiding' ? 'visible' : 'hidden';
    action.disabled = !active || phase !== 'watch';
    action.setAttribute('aria-disabled', String(phase !== 'watch' || performance.now() < readyAt));
    action.textContent = phase === 'hiding' ? '🙈 No peeking…' : '🔎 Find ' + animals[animal].name;
    next.style.visibility = phase === 'found' ? 'visible' : 'hidden';
    next.disabled = !active || phase !== 'found';
    next.setAttribute('aria-disabled', String(performance.now() < readyAt));
    again.hidden = phase !== 'seek';
    again.disabled = !active;
    if (companionId !== animals[animal].id) {
      companionId = animals[animal].id; companion?.setId(companionId);
    }
    companion?.setVisible(active && !document.hidden && (phase === 'watch' || phase === 'found' || (phase === 'seek' && clue === 'peek')));
    positionCompanion();
    renderer?.update({count,target,phase,clue});
  }
  function pulseClue() {
    if (phase !== 'seek' || !active) return;
    clue = tier <= 4 || pinnedHint ? 'peek' : 'rustle';
    render();
    if (tier <= 2 || pinnedHint) return;
    clueLater(() => {
      clue = 'none'; render();
      clueLater(pulseClue, tier <= 4 ? 1700 : 2100);
    }, 900);
  }
  function help() {
    if (!active || phase !== 'seek' || performance.now() < hintAt) return;
    hintAt = performance.now() + 600;
    pinnedHint = true; clearClues();
    hint.textContent = 'Look for little ears at the ' + places[target].toLowerCase() + '.';
    pulseClue();
  }
  function show(focusAction = false) {
    clearTimeout(timer); timer = null; clearClues();
    phase = 'watch'; target = -1; tried.clear(); pinnedHint = false;
    readyAt = performance.now() + 350;
    hint.textContent = animals[animal].name + ' wants to play hide-and-seek!';
    render(); if (focusAction) action.focus({preventScroll:true}); later(render, 360);
    // Panda uses the existing recorded species name, Bear; the visual label
    // stays specific. Do not request a missing paid voice clip.
    speakInstruction(animals[animal].spokenName || animals[animal].name);
  }
  function nextRound(focusAction = false) {
    generation++; animal = (animal+1)%animals.length; show(focusAction);
  }
  function choose(i, keyboard = false) {
    if (!active || phase !== 'seek' || tried.has(i)) return;
    if (i !== target) {
      tried.add(i);
      hintAt = 0; help();
      hint.textContent = 'Nobody there. Look for little ears at the ' + places[target].toLowerCase() + '.';
      playBoop(); speak('Try again!'); render();
      if (keyboard) spots.find(spot => !spot.disabled)?.focus({preventScroll:true});
      return;
    }
    clearClues(); phase = 'found'; readyAt = performance.now()+500;
    hint.textContent = 'You found ' + animals[animal].name + '!';
    render(); if (keyboard) next.focus({preventScroll:true}); later(render,510);
    playSuccess(); speak('Yes! '+(animals[animal].spokenName || animals[animal].name)+'!');
    if (window.vbProgress) vbProgress.record(id);
  }
  for (let i=0;i<count;i++) {
    const spot = document.createElement('button'); spot.type='button'; spot.className='hiding-spot';
    spot.dataset.spot=String(i); spot.setAttribute('aria-label',places[i]);
    spot.style.setProperty('--flower',['#f5a7ce','#ffe071','#95c7ff'][i]);
    spot.innerHTML='<span class="fallback-bush" aria-hidden="true"></span><span class="rustle-clue" aria-hidden="true" hidden>🍃</span>';
    spot.addEventListener('click',event => { if (event.button === 0) choose(i, event.detail === 0); });
    stage.appendChild(spot); spots.push(spot);
  }
  action.addEventListener('click',event => {
    if (event.button !== 0 || !active || phase !== 'watch' || performance.now()<readyAt) return;
    phase='hiding'; hint.textContent='No peeking… our friend is finding a spot.'; render();
    later(() => {
      // Choose only behind the opaque cover, independent of the introduction.
      target=Math.floor(Math.random()*count); phase='seek'; hintAt=0;
      hint.textContent=tier<=4 ? 'Where is '+animals[animal].name+'? Look for little ears.'
        : 'Where is '+animals[animal].name+'? Look for rustling leaves.';
      pulseClue(); spots[0].focus({preventScroll:true});
    },700);
  });
  next.addEventListener('click',event=>{
    if(event.button===0 && active && phase==='found' && performance.now()>=readyAt) nextRound(event.detail === 0);
  });
  again.addEventListener('click',event=>{if(event.button===0) help();});
  function useFallback() {
    if (!active) { loadFailed = true; return; }
    clearTimeout(loadTimer); renderer?.dispose(); renderer=null;
    stage.dataset.renderer='fallback'; fallbackPositions(); render();
  }
  function leave() {
    active=false; generation++; clearTimeout(timer); clearTimeout(loadTimer);
    timer=null; clearClues(); renderer?.pause(); companion?.pause(); render();
  }
  window.addEventListener('pagehide',leave);
  window.addEventListener('beforeunload',leave);
  window.addEventListener('pageshow',event=>{
    if(!event.persisted) return;
    active=true;
    if(loadFailed) useFallback();
    else if(!renderer && !rendererBroken) {
      if(rendererFactory) startRenderer();
      else loadTimer=setTimeout(useFallback,3500);
    }
    renderer?.resume(); companion?.resume();
    if(phase==='seek') pulseClue();
    else if(phase==='found') {readyAt=0;render();}
    else show();
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) {clearTimeout(clueTimer);clueTimer=null;companion?.pause();}
    else if(active) {companion?.resume(); if(phase==='seek') pulseClue(); else render();}
  });
  new ResizeObserver(() => {if(!renderer) fallbackPositions(); else positionCompanion();}).observe(stage);
  stage.addEventListener('sceneerror',()=>{rendererBroken=true;useFallback();});
  fallbackPositions(); nextRound();
  loadTimer=setTimeout(useFallback,3500);
  function startRenderer() {
    if(!active || rendererBroken || renderer) return;
    try {
      renderer=rendererFactory(stage,{onPlace:moveSpot});
      clearTimeout(loadTimer); stage.dataset.renderer='webgl'; render();
    } catch {rendererBroken=true;useFallback();}
  }
  import('./hide-seek-scene.js').then(({createHideSeekScene})=>{
    rendererFactory=createHideSeekScene; startRenderer();
  }).catch(()=>{loadFailed=true;useFallback();});
})();
