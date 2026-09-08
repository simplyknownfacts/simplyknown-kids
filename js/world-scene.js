import * as THREE from './vendor/three-r180/three.module.min.js';
import { createHut } from './world-huts.js';

// The home is a live, lit mesh scene. DOM buttons are keyboard equivalents;
// physical touches are raycast against the buildings, including their signs.
export function createWorldScene(host, { activate, placeCompanion, announce }) {
  const canvas = host.querySelector('canvas');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
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
  const terrain = new THREE.Group(); scene.add(terrain);
  const decor = new THREE.Group(); scene.add(decor);
  const materials = new Map();
  const material = (color, roughness = .8) => {
    const key = color + ':' + roughness;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({color, roughness}));
    return materials.get(key);
  };
  const mesh = (parent, geometry, color, x = 0, y = 0, z = 0) => {
    const item = new THREE.Mesh(geometry, typeof color === 'string' ? material(color) : color);
    item.position.set(x, y, z); item.castShadow = true; item.receiveShadow = true;
    parent.add(item); return item;
  };
  const huts = new Map(), targets = [];
  for (const kind of ['games','learn','art','watch','listen']) {
    const model = createHut(THREE, kind);
    model.group.userData.world = kind;
    scene.add(model.group); huts.set(kind, model); targets.push(model.group);
  }
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let width = 1, height = 1, portrait = true, radiusX = 7, radiusZ = 11;
  let raf = 0, lastFrame = -Infinity, tick = 0, paused = false, lost = false;
  let pointerOwner = null, pointerStart = null, hover = null, elapsed = 0;
  const clouds = [], butterflies = [];
  const plaza = new THREE.Vector3(0, .54, 1.3);
  const water = mesh(scene, new THREE.PlaneGeometry(180, 180, 48, 48), new THREE.MeshPhongMaterial({
    color: '#54c8dc', shininess: 85, specular: '#b4f6ff', transparent: false,
  }), 0, -1.4, 0);
  water.rotation.x = -Math.PI / 2; water.castShadow = false;
  const waterPositions = water.geometry.attributes.position;
  const waterOriginal = waterPositions.array.slice();

  function disposeGroup(group) {
    group.traverse(object => {
      if (object.geometry) object.geometry.dispose();
    });
    group.clear();
  }

  function buildTerrain() {
    disposeGroup(terrain);
    // Broad top, bevelled sand rim and darker exposed sides establish depth.
    const earth = mesh(terrain, new THREE.CylinderGeometry(1, .91, 1.7, 64),
      [material('#b98b60'), material('#ebd392'), material('#916643')], 0, -.58, 0);
    earth.scale.set(radiusX, 1, radiusZ);
    const sand = mesh(terrain, new THREE.CylinderGeometry(1, 1.025, .28, 64), '#eed6a0', 0, .22, 0);
    sand.scale.set(radiusX * .99, 1, radiusZ * .99);
    const grass = mesh(terrain, new THREE.CylinderGeometry(.95, 1, .27, 64),
      [material('#6eae45'), material('#93ca58'), material('#76b044')], 0, .43, 0);
    grass.scale.set(radiusX * .96, 1, radiusZ * .96);

    // Each path meets the front of an actual building and the central plaza.
    for (const model of huts.values()) {
      const start = new THREE.Vector3(0, 0, 1.7).applyAxisAngle(new THREE.Vector3(0,1,0), model.group.rotation.y).add(model.group.position);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(plaza.x, 0, plaza.z),
        new THREE.Vector3(start.x * .4, 0, (start.z + plaza.z) * .5),
        new THREE.Vector3(start.x, 0, start.z),
      ]);
      const road = mesh(terrain, new THREE.TubeGeometry(curve, 18, .39, 8, false), '#f2deae', 0, .58, 0);
      road.scale.y = .12;
      for (let i=1;i<7;i++) {
        const point = curve.getPoint(i/8);
        const step = mesh(terrain, new THREE.CylinderGeometry(.105,.105,.035,6), '#fff1c9', point.x, .633, point.z);
        step.scale.set(1.15,1,.7); step.castShadow = false;
      }
    }
    mesh(terrain, new THREE.CylinderGeometry(1.35,1.48,.16,48), '#f3dfb2', plaza.x,.6,plaza.z);
    const inner = mesh(terrain, new THREE.CylinderGeometry(1.13,1.13,.02,48), '#d9e6a2', plaza.x,.69,plaza.z);
    inner.castShadow = false;
    const ring = mesh(terrain, new THREE.TorusGeometry(1.21,.045,6,48), '#fff2d0', plaza.x,.713,plaza.z);
    ring.rotation.x = Math.PI/2;

    const treeSites = portrait ? [[-4.6,-8.7,.8],[3.2,-11.7,1],[-5.45,.9,.9],[5.2,4.4,.85],[-4.5,10.2,.65],[1,-12.4,.6]] : [[-7.8,-2.5,.85],[7.6,-2.7,.9],[-7.8,3.1,.8],[7.9,3.2,.7],[2.7,-6.4,.7]];
    const trunkGeo = new THREE.CylinderGeometry(.14,.22,1.6,7);
    const leafGeo = new THREE.IcosahedronGeometry(1,2);
    const trunk = new THREE.InstancedMesh(trunkGeo, material('#a16e43'), treeSites.length);
    const leaves = new THREE.InstancedMesh(leafGeo, material('#409f67'), treeSites.length*3);
    trunk.castShadow = leaves.castShadow = true; trunk.receiveShadow = leaves.receiveShadow = true;
    const dummy = new THREE.Object3D();
    treeSites.forEach(([x,z,size],i) => {
      dummy.position.set(x,.6+size*.8,z); dummy.scale.set(size,size,size); dummy.updateMatrix(); trunk.setMatrixAt(i,dummy.matrix);
      [[0,2.25,0,1],[.52,1.85,.12,.7],[-.44,1.8,-.15,.75]].forEach(([dx,y,dz,s],j) => {
        dummy.position.set(x+dx*size,.6+y*size,z+dz*size); dummy.scale.set(.82*s*size,s*size,.8*s*size); dummy.updateMatrix(); leaves.setMatrixAt(i*3+j,dummy.matrix);
        leaves.setColorAt(i*3+j,new THREE.Color(['#49a66b','#73bc65','#3e996b'][(i+j)%3]));
      });
    });
    terrain.add(trunk,leaves);
    // Shore pebbles and little flower beds stay away from selectable facades.
    for (let i=0;i<26;i++) {
      const a=i*2.39996, x=Math.cos(a)*radiusX*.93, z=Math.sin(a)*radiusZ*.93;
      const stone=mesh(terrain,new THREE.IcosahedronGeometry(.22+(i%3)*.08,1),i%2?'#d1c5a6':'#a4b29a',x,.38,z);
      stone.scale.set(1.2,.65,.8); stone.rotation.y=a;
    }
    for (const [x,z] of [[-2.2,plaza.z+1.1],[2.1,plaza.z+1.7],[-2,-6.8],[4.8,-3.5]]) {
      for(let j=0;j<4;j++) {
        const flower=mesh(terrain,new THREE.IcosahedronGeometry(.105,1),j%2?'#ffcf5b':'#fff4cf',x+j*.21,.69,z+(j%2)*.22);
        flower.castShadow=false;
      }
    }
  }

  function buildSky() {
    for(let i=0;i<4;i++) {
      const group=new THREE.Group();
      [[0,0,0,1.15],[-1,0,0,.8],[1,.1,.1,.8],[.2,.7,0,.9]].forEach(([x,y,z,s]) => {
        const cloud=mesh(group,new THREE.SphereGeometry(s,12,8),'#f7fcff',x,y,z);
        cloud.scale.set(1.35,.65,.72); cloud.castShadow=false; cloud.receiveShadow=false;
      });
      group.position.set((i%2?-1:1)*(10+i*1.8),4+i*.75,-14+(i%2)*9); group.userData.baseX=group.position.x;
      decor.add(group);clouds.push(group);
    }
    // A small toy balloon and basket, all real geometry, far behind the huts.
    const balloon=new THREE.Group();
    const colors=['#ffb06e','#ffe8a0','#fff3ce','#82cecd'];
    const balloonGeometry=new THREE.SphereGeometry(1.1,16,12);
    const positions=balloonGeometry.attributes.position, vertexColors=[];
    for(let i=0;i<positions.count;i++) {
      const stripe=Math.floor((Math.atan2(positions.getZ(i),positions.getX(i))+Math.PI)/(Math.PI/4));
      const c=new THREE.Color(colors[stripe%colors.length]);vertexColors.push(c.r,c.g,c.b);
    }
    balloonGeometry.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors,3));
    const balloonMesh=new THREE.Mesh(balloonGeometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8}));
    balloonMesh.scale.y=1.25;balloon.add(balloonMesh);
    mesh(balloon,new THREE.CylinderGeometry(.32,.25,.45,8),'#c98b52',0,-1.9,0);
    for(const x of [-.23,.23]) mesh(balloon,new THREE.CylinderGeometry(.017,.017,.65,4),'#dfc395',x,-1.43,0);
    balloon.position.set(4.5,5,-14);balloon.scale.setScalar(.7);decor.add(balloon);balloon.userData.baseY=5;clouds.push(balloon);
    for(let i=0;i<2;i++) {
      const group=new THREE.Group();
      const wings=[];
      for(const side of [-1,1]) {
        const wing=mesh(group,new THREE.SphereGeometry(.19,8,6),i?'#ffcf68':'#fc92ac',side*.13,0,0);
        wing.scale.set(1,.14,.7);wings.push(wing);
      }
      group.position.set(i?2.1:-1.8,1.8,2+i);decor.add(group);butterflies.push({group,wings});
    }
  }
  buildSky();

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
  function fitCamera() {
    const target=new THREE.Vector3(0,1.1,portrait?.15:0);
    const direction=new THREE.Vector3(0,portrait?1.3:1.45,1.38).normalize();
    const fitPoints=[];
    for(let i=0;i<36;i++) {
      const a=i*Math.PI*2/36;
      fitPoints.push(new THREE.Vector3(Math.cos(a)*radiusX,-.8,Math.sin(a)*radiusZ));
    }
    scene.updateMatrixWorld(true);
    huts.forEach(model=>fitPoints.push(...corners(new THREE.Box3().setFromObject(model.group))));
    let distance=23;
    camera.aspect=width/height;camera.updateProjectionMatrix();
    for(let i=0;i<65;i++) {
      camera.position.copy(target).addScaledVector(direction,distance);camera.lookAt(target);camera.updateMatrixWorld(true);
      const fits=fitPoints.every(p=>{const n=p.clone().project(camera);return Math.abs(n.x)<.94 && n.y<.8 && n.y>-.95;});
      if(fits)break; distance*=1.045;
    }
  }
  function positionControls() {
    scene.updateMatrixWorld(true);
    for(const [kind,model] of huts) {
      const projected=corners(new THREE.Box3().setFromObject(model.group)).map(project);
      const left=Math.min(...projected.map(p=>p.x)), right=Math.max(...projected.map(p=>p.x));
      const top=Math.min(...projected.map(p=>p.y)), bottom=Math.max(...projected.map(p=>p.y));
      const control=host.querySelector('[data-world="'+kind+'"]');
      Object.assign(control.style,{left:left+'px',top:top+'px',width:(right-left)+'px',height:(bottom-top)+'px'});
    }
    const anchor=project(plaza.clone().setY(.77));
    const scalePoint=project(plaza.clone().add(new THREE.Vector3(1.8,0,0)));
    const size=Math.abs(scalePoint.x-anchor.x)*1.75;
    placeCompanion(anchor.x,anchor.y,height<330?Math.max(52,Math.min(64,size)):Math.max(84,Math.min(180,size)));
  }
  function resize() {
    const r=host.getBoundingClientRect();if(!r.width||!r.height)return;
    width=r.width;height=r.height;
    const nextPortrait=width/height<1.1;
    portrait=nextPortrait; radiusX=portrait?7.1:10.2;radiusZ=portrait?14.5:7.4;
    plaza.set(0,.54,portrait?1.35:1.6);
    const layout=portrait ? {learn:[.45,-10,.18],games:[-3.25,-4.9,-.24],art:[3.25,-.6,.22],listen:[-3.25,6.7,-.22],watch:[3.15,9,.24]}
      : {learn:[0,-5.6,.18],games:[-5.8,-2.9,-.24],art:[5.8,-2.9,.22],listen:[-5,4.6,-.22],watch:[5,4.6,.24]};
    for(const [kind,model] of huts) {
      const [x,z,angle]=layout[kind];model.group.position.set(x,.58,z);model.group.rotation.y=angle;
    }
    renderer.setSize(width,height,false);buildTerrain();fitCamera();positionControls();
    renderer.shadowMap.needsUpdate=true;renderOnce();
  }
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
  function renderOnce() {
    if(lost)return;
    renderer.render(scene,camera);tick++;
  }
  function frame(now) {
    if(paused||lost||document.hidden||reduced.matches){raf=0;return;}
    raf=requestAnimationFrame(frame);
    if(now-lastFrame<33)return;
    const dt=Math.min((now-lastFrame)/1000,.08);lastFrame=now;elapsed+=Number.isFinite(dt)?dt:0;
    huts.forEach(model=>model.update(elapsed,false));
    clouds.forEach((cloud,i)=>{
      if(cloud.userData.baseY)cloud.position.y=cloud.userData.baseY+Math.sin(elapsed*.45)*.28;
      else cloud.position.x=cloud.userData.baseX+Math.sin(elapsed*.1+i)*1.1;
    });
    butterflies.forEach(({group,wings},i)=>{
      group.position.y=1.8+Math.sin(elapsed*1.6+i)*.17;
      wings.forEach((wing,j)=>wing.rotation.z=Math.sin(elapsed*9)*(j?1:-1)*.7);
    });
    for(let i=0;i<waterPositions.count;i++) {
      const x=waterOriginal[i*3],y=waterOriginal[i*3+1];
      waterPositions.setZ(i,Math.sin(x*.8+elapsed*.7)*Math.cos(y*.65-elapsed*.45)*.07);
    }
    waterPositions.needsUpdate=true;renderOnce();
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
    if(reduced.matches){pause();huts.forEach(model=>model.update(0,true));renderOnce();}
    else resume();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else resume();});
  resize();host.dataset.state='ready';host.dataset.renderer='webgl';resume();
  return {pause,resume,pick,
    snapshot:()=>({renderer:'webgl',revision:THREE.REVISION,frames:tick,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
      reducedMotion:reduced.matches,portrait,houses:[...huts].map(([kind,model])=>({kind,meshes:model.group.getObjectsByProperty('isMesh',true).length,
        point:project(model.group.localToWorld(new THREE.Vector3(0,1.8,1.7)))})),plaza:project(plaza)}),
  };
}
