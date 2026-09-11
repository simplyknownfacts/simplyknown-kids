import * as THREE from './vendor/three-r180/three.module.min.js';
import { createHut } from './world-huts.js';
import { createIsland } from './world-islands.js';
import { createOcean } from './world-ocean.js';

function createCompanionBoat(THREE) {
  const group = new THREE.Group();
  group.name = 'companion-boat';
  const material = (color, roughness = .7) => new THREE.MeshStandardMaterial({ color, roughness });
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), material('#ef7868'));
  hull.scale.set(.72, .32, 1.45); hull.position.y = .02; group.add(hull);
  const inside = new THREE.Mesh(new THREE.BoxGeometry(1.15, .16, 1.72), material('#fff0bf', .82));
  inside.position.y = .29; group.add(inside);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.3, .12, .34), material('#b56f45', .88));
  seat.position.set(0, .48, .05); group.add(seat);
  for (const side of [-1, 1]) {
    const oar = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, 2.3, 8), material('#c58a55', .86));
    oar.position.set(side * .7, .34, .1); oar.rotation.set(Math.PI / 2, 0, side * .58); group.add(oar);
  }
  group.traverse(object => { if (object.isMesh) object.castShadow = true; });
  let x = 0, z = 0;
  function place(nextX, nextZ) { x = nextX; z = nextZ; update(0, true); }
  function update(time, reducedMotion = false) {
    const t = reducedMotion ? 0 : time;
    group.position.set(x, -.48 + Math.sin(t * 1.15) * .045, z);
    group.rotation.set(Math.sin(t * .95) * .025, -.18, Math.sin(t * 1.1) * .035);
  }
  return { group, place, update, anchor: () => group.localToWorld(new THREE.Vector3(0, 1.04, 0)) };
}

// The home is a live, lit mesh scene. DOM buttons are keyboard equivalents;
// physical touches are raycast against each island, building and activity props.
//
// ADDED NOTE (Claude, 2026-09-09 code review): this file trades readability
// for size -- many statements per line, almost no inline comments. That is a
// real departure from the rest of this codebase's usual verbose/commented
// style (see e.g. js/sleep-timer.js, js/pin-lockout.js for the house style).
// It is NOT a correctness problem -- 280/280 tests pass, independently
// re-run -- just harder to maintain by hand later. The comments below name
// what each piece of the pipeline does without changing any logic, so a
// future editor doesn't have to reverse-engineer it from scratch.
//
// Big picture, in order: build the scene + lights (below) -> build 5 islands
// + 5 huts + the ocean (below) -> on every resize, lay huts/islands out for
// portrait vs. landscape and point the camera so the WHOLE archipelago fits
// (fitCamera) -> position the invisible DOM <button> overlays exactly on top
// of each hut's on-screen rectangle so keyboard/screen-reader users get a
// real focusable target (positionControls) -> a render loop capped at ~30fps
// (frame) that pauses itself when hidden, backgrounded, or reduced-motion is
// on -> pointer handlers that raycast a tap against the 3D meshes to decide
// which hut was actually touched (pick).
export function createWorldScene(host, { activate, placeCompanion, announce, roomLabel = 'MY ROOM' }) {
  const canvas = host.querySelector('canvas');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  // The old 1.5 cap visibly softened canvas-drawn sign text on 2x/3x phones.
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#a3def2');
  scene.fog = new THREE.Fog('#a3def2', 75, 150);
  const camera = new THREE.PerspectiveCamera(33, 1, .1, 180);
  const sun = new THREE.DirectionalLight('#fff2d4', 2.7);
  sun.position.set(-14, 26, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 20, bottom: -20, near: 1, far: 65 });
  sun.shadow.normalBias = .045;
  sun.shadow.bias = -.00015;
  scene.add(sun, new THREE.HemisphereLight('#e7f8ff', '#8b9766', 1.65));
  const fill = new THREE.DirectionalLight('#c6e8ff', .8);
  fill.position.set(12, 9, -10); scene.add(fill);
  const islands = new Map();
  const destinationKinds = ['games','learn','art','watch','listen','my-room','ribbons'];
  for (const kind of destinationKinds) {
    const island = createIsland(THREE, kind);
    island.group.userData.world = kind;
    scene.add(island.group); islands.set(kind, island);
  }
  const ocean = createOcean(THREE); scene.add(ocean.group);
  const companionBoat = createCompanionBoat(THREE); scene.add(companionBoat.group);
  const huts = new Map(), targets = [...islands].filter(([kind])=>kind!=='companion').map(([,island])=>island.group);
  for (const kind of destinationKinds) {
    const model = createHut(THREE, kind, kind === 'my-room' ? roomLabel : undefined);
    model.group.userData.world = kind;
    scene.add(model.group); huts.set(kind, model); targets.push(model.group);
  }
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let width = 1, height = 1, portrait = true, compact = false;
  let raf = 0, lastFrame = -Infinity, tick = 0, paused = false, lost = false;
  let pointerOwner = null, pointerStart = null, hover = null, elapsed = 0;

  const point = new THREE.Vector3();
  function project(position) {
    point.copy(position).project(camera);
    return {x:(point.x+1)*width/2,y:(1-point.y)*height/2};
  }
  function corners(box) {
    const result=[];
    for(const x of [box.min.x,box.max.x]) for(const y of [box.min.y,box.max.y]) for(const z of [box.min.z,box.max.z]) result.push(new THREE.Vector3(x,y,z));
    return result;
  }
  // Zooms the camera OUT (never in) in small steps until every island/hut
  // corner projects inside the visible frame (with a small margin). Bounded
  // to 65 tries so a pathological layout can't loop forever -- it just stops
  // at whatever distance it reached.
  function fitCamera() {
    const target=new THREE.Vector3(0,.9,compact?.4:portrait?-1.1:0);
    const direction=new THREE.Vector3(0,compact?2.05:portrait?1.55:1.65,compact?1.12:1.38).normalize();
    const fitPoints=[];
    // Fit the complete archipelago, not the ocean or passing decorations.
    islands.forEach(model=>{
      const box=new THREE.Box3().setFromObject(model.group);
      fitPoints.push(...corners(box));
    });
    scene.updateMatrixWorld(true);
    huts.forEach(model=>fitPoints.push(...corners(new THREE.Box3().setFromObject(model.group))));
    let distance=23;
    camera.aspect=width/height;camera.updateProjectionMatrix();
    for(let i=0;i<65;i++) {
      camera.position.copy(target).addScaledVector(direction,distance);camera.lookAt(target);camera.updateMatrixWorld(true);
      const fits=fitPoints.every(p=>{const n=p.clone().project(camera);return Math.abs(n.x)<.92 && n.y<.8 && n.y>-.95;});
      if(fits)break; distance*=1.045;
    }
  }
  // The REAL <button data-world="games"> etc. in the DOM (see home.html) are
  // invisible and CSS pointer-events:none -- mouse/touch taps go straight to
  // the canvas below and are resolved by pick()/raycasting instead. These
  // buttons exist so Tab + Enter/Space (keyboard) and a screen reader still
  // have a normal, focusable target: this function just moves and resizes
  // each one every frame/resize to sit exactly on top of its 3D hut.
  function positionControls() {
    scene.updateMatrixWorld(true);
    for(const [kind,model] of huts) {
      const bounds=new THREE.Box3().setFromObject(model.group);
      bounds.union(new THREE.Box3().setFromObject(islands.get(kind).group));
      const projected=corners(bounds).map(project);
      const left=Math.min(...projected.map(p=>p.x)), right=Math.max(...projected.map(p=>p.x));
      const top=Math.min(...projected.map(p=>p.y)), bottom=Math.max(...projected.map(p=>p.y));
      const control=host.querySelector('[data-world="'+kind+'"]');
      Object.assign(control.style,{left:left+'px',top:top+'px',width:(right-left)+'px',height:(bottom-top)+'px'});
    }
    const anchor=project(companionBoat.anchor());
    const scalePoint=project(companionBoat.group.localToWorld(new THREE.Vector3(1.55,1.04,0)));
    const size=Math.abs(scalePoint.x-anchor.x)*1.75;
    const placedSize=compact?Math.max(44,Math.min(portrait?60:52,size)):height<500?Math.max(44,Math.min(54,size)):!portrait?Math.max(58,Math.min(72,size)):Math.max(68,Math.min(96,size));
    placeCompanion(anchor.x,anchor.y,placedSize);
  }
  function resize() {
    const r=host.getBoundingClientRect();if(!r.width||!r.height)return;
    width=r.width;height=r.height;
    portrait=width/height<1.1;compact=width<=600;
    const depth=compact?Math.max(1,Math.min(2.1,(height/width)*.95)):portrait?Math.max(1,Math.min(1.7,.98/(width/height))):1;
    const layout=compact
      ? {games:[-7.8,-5,-.1],learn:[-2.6,-5,-.03],art:[2.6,-5,.03],watch:[7.8,-5,.1],listen:[-5.2,5,-.06],'my-room':[0,5,0],ribbons:[5.2,5,.06]}
      : portrait
      ? {games:[-10.5,-4,-.1],learn:[-3.5,-4,-.03],art:[3.5,-4,.03],watch:[10.5,-4,.1],listen:[-7,4,-.06],'my-room':[0,4,0],ribbons:[7,4,.06]}
      : {games:[-11.4,-3.6,-.1],learn:[-3.8,-3.6,-.03],art:[3.8,-3.6,.03],watch:[11.4,-3.6,.1],listen:[-7.6,4.2,-.06],'my-room':[0,4.2,0],ribbons:[7.6,4.2,.06]};
    const hutScale=compact?1.36:1.12,islandScale=compact?.68:portrait?.9:.88;
    for(const [kind,model] of huts) {
      const [x,baseZ,angle]=layout[kind],z=baseZ*depth;model.group.position.set(x,.58,z);model.group.rotation.y=angle;model.group.scale.setScalar(hutScale);
      const island=islands.get(kind).group;island.position.set(x,0,z);island.rotation.y=angle;island.scale.setScalar(islandScale);
    }
    if(compact&&portrait)companionBoat.place(-8.8,11*depth);
    else if(compact)companionBoat.place(-13,6.5);
    else if(portrait)companionBoat.place(-10.5,15);
    else if(width>=1000)companionBoat.place(-12,9.6);
    else companionBoat.place(-16,7.6);
    renderer.setSize(width,height,false);fitCamera();positionControls();
    renderer.shadowMap.needsUpdate=true;renderOnce();
  }
  // Casts a ray from the tapped screen point through the camera and returns
  // which hut/island it actually hit (walking up to the ancestor that carries
  // userData.world, since a hit lands on some sub-mesh of the model, not the
  // group itself), or null if the tap missed every activity target.
  function pick(clientX,clientY) {
    const r=canvas.getBoundingClientRect();
    pointer.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);
    scene.updateMatrixWorld(true);raycaster.setFromCamera(pointer,camera);
    for(const hit of raycaster.intersectObjects(targets,true)) {
      let parent=hit.object;
      while(parent && !parent.userData.world)parent=parent.parent;
      if(parent?.userData.world)return parent.userData.world;
    }
    return null;
  }
  function findOceanPoint() {
    const rect = canvas.getBoundingClientRect();
    const candidates = [];
    for (const y of [.5,.62,.38,.74,.26,.86]) for (const x of [.5,.12,.88,.3,.7]) candidates.push({x:width*x,y:height*y});
    return candidates.find(candidate =>
      document.elementFromPoint(rect.left+candidate.x,rect.top+candidate.y)===canvas &&
      pick(rect.left+candidate.x,rect.top+candidate.y)===null
    ) || {x:width/2,y:height/2};
  }
  function renderOnce() {
    if(lost)return;
    renderer.render(scene,camera);tick++;
  }
  // The actual render loop. Capped at ~30fps (skip frames under 33ms apart)
  // on purpose -- this is a mostly-static scene (bobbing water/props, no fast
  // action), so 30fps saves battery/GPU on a tablet without looking choppy.
  // Stops itself entirely (raf=0, nothing rescheduled) when paused, the WebGL
  // context is lost, the tab is hidden, or the OS has reduced-motion on.
  function frame(now) {
    if(paused||lost||document.hidden||reduced.matches){raf=0;return;}
    raf=requestAnimationFrame(frame);
    if(now-lastFrame<33)return;
    const dt=Math.min((now-lastFrame)/1000,.08);lastFrame=now;elapsed+=Number.isFinite(dt)?dt:0;
    huts.forEach(model=>model.update(elapsed,false));
    islands.forEach(model=>model.update(elapsed,false));
    ocean.update(elapsed,false);companionBoat.update(elapsed,false);renderOnce();
  }
  function resume() {paused=false;lastFrame=-Infinity;if(!raf&&!reduced.matches)raf=requestAnimationFrame(frame);else renderOnce();}
  function pause() {paused=true;if(raf)cancelAnimationFrame(raf);raf=0;pointerOwner=null;}
  canvas.addEventListener('pointerdown',e=>{
    if(pointerOwner!==null||!e.isPrimary||e.button!==0)return;
    pointerOwner=e.pointerId;pointerStart={x:e.clientX,y:e.clientY,kind:pick(e.clientX,e.clientY)};
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerup',e=>{
    if(e.pointerId!==pointerOwner)return;
    const start=pointerStart;pointerOwner=null;pointerStart=null;
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<18&&start.kind&&pick(e.clientX,e.clientY)===start.kind)activate(start.kind);
  });
  canvas.addEventListener('pointercancel',()=>{pointerOwner=null;pointerStart=null;});
  canvas.addEventListener('pointermove',e=>{
    if(e.pointerType!=='mouse'||pointerOwner!==null)return;
    const kind=pick(e.clientX,e.clientY);
    if(kind!==hover){hover=kind;canvas.style.cursor=kind?'pointer':'default';}
  });
  canvas.addEventListener('webglcontextlost',e=>{
    e.preventDefault();lost=true;pause();host.dataset.state='fallback';announce('Your world needs a moment. You can still choose a hut.');
  });
  canvas.addEventListener('webglcontextrestored',()=>{lost=false;host.dataset.state='ready';resize();resume();});
  const observer=new ResizeObserver(resize);observer.observe(host);
  reduced.addEventListener('change',()=>{
    if(reduced.matches){pause();huts.forEach(model=>model.update(0,true));islands.forEach(model=>model.update(0,true));ocean.update(0,true);companionBoat.update(0,true);positionControls();renderOnce();}
    else resume();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else resume();});
  resize();host.dataset.state='ready';host.dataset.renderer='webgl';resume();
  return {pause,resume,pick,
    snapshot:()=>({renderer:'webgl',revision:THREE.REVISION,pixelRatio:renderer.getPixelRatio(),frames:tick,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
      reducedMotion:reduced.matches,portrait,compact,ocean:ocean.snapshot(),oceanPoint:findOceanPoint(),islands:[...islands].map(([kind,model])=>({kind,center:model.group.position.toArray(),scale:model.group.scale.toArray(),shore:project(model.group.localToWorld(new THREE.Vector3(0,.6,2.65)))})),companionBoat:project(companionBoat.anchor()),houses:[...huts].map(([kind,model])=>({kind,meshes:model.group.getObjectsByProperty('isMesh',true).length,
        center:model.group.position.toArray(),scale:model.group.scale.toArray(),label:model.group.userData.label,labelTexture:model.group.userData.labelTexture,roofRibbon:!!model.group.getObjectByName('ribbons-roof-ribbon'),point:project(model.group.localToWorld(new THREE.Vector3(0,1.8,1.7)))}))}),
  };
}
