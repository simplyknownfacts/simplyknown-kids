/* Clue-based search: introduce the friend away from every bush, then hide
 * out of sight. The legacy id preserves each child's settings and progress. */
(() => {
  const profile = getActiveProfile();
  if (!profile) { goProfiles(); return; }
  const id = 'peek-a-boo', tier = getActivityTier(profile, id);
  const tierCounts = [4,4,6,6,8,8,10,10,12,12];
  const count = Math.max(tierCounts[tier-1] || 4,
    getProfileFeature(profile, id, 'multiChoice') ? 8 : 0);
  const animals = [
    {name:'Rabbit',id:'bunny',emoji:'🐰',fur:'#eee9df',inner:'#f2a9b8'},
    {name:'Cat',id:'tabby',emoji:'🐱',fur:'#d88c4a',inner:'#f7c5a0'},
    {name:'Panda',id:'panda',spokenName:'Bear',emoji:'🐼',fur:'#30363f',inner:'#f5f1e8'},
  ];
  const places = [
    'Lower far-left bush','Lower left bush','Lower right bush','Lower far-right bush',
    'Middle far-left bush','Middle left bush','Middle right bush','Middle far-right bush',
    'Upper far-left bush','Upper left bush','Upper right bush','Upper far-right bush',
  ];
  const peekParts = ['ears','face','paw','tail'];
  const peekPartLabels = {ears:'little ears',face:'part of a face',paw:'a little paw',tail:'a little tail'};
  const stage = document.getElementById('stage'), hint = document.getElementById('hint');
  const action = document.getElementById('roundAction'), again = document.getElementById('showAgain');
  const next = document.getElementById('playAgain'), intro = document.getElementById('friendIntro');
  const cover = document.getElementById('hideCover');
  const companionHost = document.getElementById('seekCompanion');
  const companion = window.mascot?.createActor({host:companionHost,id:animals[0].id});
  const anchors = [];
  let companionId = animals[0].id, mediaUnavailable = false;
  let active = true, generation = 0, timer = null, clueTimer = null, renderer = null, loadTimer = null;
  let rendererFactory = null, loadFailed = false, rendererBroken = false;
  let target = -1, lastTarget = -1, animal = -1, phase = 'watch', clue = 'none', peekPart = 'ears', lastPeekPart = '';
  let readyAt = 0, hintAt = 0, pinnedHint = false, targetBag = [], peekBag = [];
  const tried = new Set(), spots = [];
  renderBackBtn('index.html');
  gameSettings.attach(id);
  if (window.vbProgress) { vbProgress.firstPlay(id); vbProgress.touchStreak(); }

  function refillBag(values, last) {
    const bag = values.slice();
    for (let index=bag.length-1;index>0;index--) {
      const swap=Math.floor(Math.random()*(index+1));
      [bag[index],bag[swap]]=[bag[swap],bag[index]];
    }
    if (bag.length>1 && bag[0]===last) [bag[0],bag[1]]=[bag[1],bag[0]];
    return bag;
  }
  function drawTarget() {
    if (!targetBag.length) targetBag=refillBag(Array.from({length:count},(_,index)=>index),lastTarget);
    lastTarget=targetBag.shift(); return lastTarget;
  }
  function drawPeekPart() {
    if (!peekBag.length) peekBag=refillBag(peekParts,lastPeekPart);
    lastPeekPart=peekBag.shift(); return lastPeekPart;
  }
  function setHint(visible, accessible=visible) {
    hint.textContent=visible;
    hint.setAttribute('aria-label',accessible);
  }

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
    const landscape=bounds.width/bounds.height>=1.05, column=i%4, visualRow=2-Math.floor(i/4);
    const minimumHeight=46/Math.max(1,bounds.height);
    if (count >= 10) {
      const rowHeight=Math.max(landscape?.175:.165,minimumHeight);
      rect={left:.012+column*.247,top:(landscape?.34:.36)+visualRow*rowHeight,width:.223,height:rowHeight};
    } else {
      const rowHeight=Math.max(landscape?.175:.13,minimumHeight);
      rect={left:.012+column*.247,top:landscape?.34+visualRow*rowHeight:.55-(2-visualRow)*rowHeight,width:.223,height:visualRow===2&&!landscape?Math.max(.19,minimumHeight):rowHeight};
    }
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
    const columns=count<=4?2:count<=9?3:4, rows=Math.ceil(count/columns), gap=.018;
    const width=(1-gap*(columns+1))/columns, height=(1-gap*(rows+1))/rows;
    spots.forEach((_,i) => moveSpot(i, {
      left:gap+(i%columns)*(width+gap),
      top:gap+Math.floor(i/columns)*(height+gap),
      width,height,
    }));
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
    const visibleClue = mediaUnavailable && clue === 'peek' ? 'rustle' : clue;
    stage.dataset.phase = phase;
    stage.dataset.clue = visibleClue;
    stage.dataset.peekPart = phase === 'seek' ? peekPart : '';
    intro.hidden = phase !== 'watch';
    cover.hidden = phase !== 'hiding';
    intro.querySelector('.intro-name').textContent = animals[animal].name;
    spots.forEach((spot,i) => {
      const isClue = phase === 'seek' && i === target;
      spot.disabled = !active || phase !== 'seek' || tried.has(i);
      spot.classList.toggle('empty', phase === 'seek' && tried.has(i));
      spot.classList.toggle('clue-peek', isClue && visibleClue === 'peek');
      spot.classList.toggle('clue-rustle', isClue && visibleClue === 'rustle');
      spot.classList.toggle('clue-glow', isClue && visibleClue === 'glow');
      spot.classList.toggle('has-peek', isClue);
      spot.querySelector('.rustle-clue').hidden = !isClue || visibleClue !== 'rustle';
      const piece=spot.querySelector('.peek-piece'), friend=animals[animal];
      piece.dataset.part=peekPart;
      piece.dataset.animal=friend.id;
      piece.textContent=peekPart==='face'?friend.emoji:peekPart==='paw'?'🐾':'';
      piece.style.setProperty('--peek-fur',friend.fur);
      piece.style.setProperty('--peek-inner',friend.inner);
      piece.style.setProperty('--peek-x',(35+((generation*29+i*17)%31))+'%');
      const stageHeight=stage.getBoundingClientRect().height,visualRow=2-Math.floor(i/4);
      const peekShift=count>=10?(visualRow===2?-Math.min(55,stageHeight*.13):visualRow===1?-Math.min(24,stageHeight*.06):0):0;
      piece.style.setProperty('--peek-shift',peekShift+'px');
      // Expose only a clue actually visible now; never leak the future answer.
      spot.setAttribute('aria-label', places[i] + (isClue
        ? ' — '+peekPartLabels[peekPart]+' peeking out'+(visibleClue === 'rustle' ? '; leaves rustling' : '')
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
    const showCompanion = active && !document.hidden && !mediaUnavailable
      && (phase === 'watch' || phase === 'found');
    companionHost.hidden = !showCompanion;
    companionHost.dataset.target = String(showCompanion && phase !== 'watch' ? target : -1);
    companion?.setVisible(showCompanion);
    positionCompanion();
    renderer?.update({count,target,phase,clue:visibleClue});
  }
  function pulseClue() {
    if (phase !== 'seek' || !active) return;
    clue = tier<=2?'glow':tier<=4?'peek':pinnedHint?(tier<=8?'peek':'rustle'):tier<=6?'rustle':'none';
    render();
    if (tier <= 4 || pinnedHint || clue === 'none') return;
    clueLater(() => {
      clue = 'none'; render();
      clueLater(pulseClue, tier <= 4 ? 1700 : 2100);
    }, 900);
  }
  function help() {
    if (!active || phase !== 'seek' || performance.now() < hintAt) return;
    hintAt = performance.now() + 600;
    pinnedHint = true; clearClues();
    if (tier<=2) setHint('✨ '+animals[animal].emoji+' 🔎','Look for the glowing bush.');
    else if (tier<=8 && !mediaUnavailable) setHint('A tiny part is peeking out.','Look for '+peekPartLabels[peekPart]+'.');
    else setHint('Watch for a tiny movement.','Watch for a tiny movement in the leaves.');
    pulseClue();
  }
  function show(focusAction = false) {
    clearTimeout(timer); timer = null; clearClues();
    phase = 'watch'; target = -1; tried.clear(); pinnedHint = false;
    readyAt = performance.now() + 350;
    if (tier<=2) setHint(animals[animal].emoji+' 🙈 🔎',animals[animal].name+' wants to play hide-and-seek.');
    else setHint(animals[animal].name + ' wants to play hide-and-seek!');
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
      if (tier<=2) setHint('↩️ ✨ '+animals[animal].emoji,'Nobody there. Look for the glowing bush.');
      else if (mediaUnavailable || tier>=9) setHint('Nobody there. Watch for a tiny movement.');
      else setHint('Nobody there. Look for '+peekPartLabels[peekPart]+'.');
      playBoop(); speak('Try again!'); render();
      if (keyboard) spots.find(spot => !spot.disabled)?.focus({preventScroll:true});
      return;
    }
    clearClues(); phase = 'found'; readyAt = performance.now()+500;
    if (tier<=2) setHint('🎉 '+animals[animal].emoji,'You found '+animals[animal].name+'!');
    else setHint('You found ' + animals[animal].name + '!');
    render(); if (keyboard) next.focus({preventScroll:true}); later(render,510);
    playSuccess(); speak('Yes! '+(animals[animal].spokenName || animals[animal].name)+'!');
    if (window.vbProgress) vbProgress.record(id);
  }
  for (let i=0;i<count;i++) {
    const spot = document.createElement('button'); spot.type='button'; spot.className='hiding-spot';
    spot.dataset.spot=String(i); spot.setAttribute('aria-label',places[i]);
    spot.style.setProperty('--flower',['#f5a7ce','#ffe071','#95c7ff','#d8a6ff'][i%4]);
    spot.innerHTML='<span class="peek-piece" aria-hidden="true"></span><span class="fallback-bush" aria-hidden="true"></span><span class="rustle-clue" aria-hidden="true" hidden>🍃</span>';
    spot.addEventListener('click',event => { if (event.button === 0) choose(i, event.detail === 0); });
    stage.appendChild(spot); spots.push(spot);
  }
  action.addEventListener('click',event => {
    if (event.button !== 0 || !active || phase !== 'watch' || performance.now()<readyAt) return;
    phase='hiding';
    if (tier<=2) setHint('🙈 …','No peeking. Our friend is finding a spot.');
    else setHint('No peeking… our friend is finding a spot.');
    render();
    later(() => {
      // Choose only behind the opaque cover, independent of the introduction.
      target=drawTarget(); peekPart=drawPeekPart(); phase='seek'; hintAt=0;
      if (tier<=2) setHint('✨ '+animals[animal].emoji+' 🔎','Where is '+animals[animal].name+'? Look for the glowing bush.');
      else if (tier<=4 && !mediaUnavailable) setHint('Where is '+animals[animal].name+'? Look for '+peekPartLabels[peekPart]+'.');
      else if (tier<=6) setHint('Where is '+animals[animal].name+'? Watch for moving leaves.');
      else setHint('Where is '+animals[animal].name+'? Look carefully.');
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
  if (companionHost.querySelector('canvas')) new MutationObserver(() => {
    const unavailable = companionHost.querySelector('canvas').dataset.media === 'unavailable';
    if (unavailable === mediaUnavailable) return;
    mediaUnavailable = unavailable;
    if (phase === 'seek' && unavailable) setHint(tier<=2?'✨ 🔎':'Watch for moving leaves.',tier<=2?'Look for the glowing bush.':'Watch for moving leaves.');
    render();
  }).observe(companionHost.querySelector('canvas'), {attributes:true,attributeFilter:['data-media']});
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
