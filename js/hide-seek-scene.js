import * as THREE from './vendor/three-r180/three.module.min.js';

const PHASES = new Set(['watch', 'hiding', 'seek', 'found']);
const CLUES = new Set(['none', 'peek', 'rustle']);
const FLOWER_COLORS = ['#f28daf', '#f4ca55', '#68aee8'];

function unsupportedWebGL(cause) {
  const error = new Error('unsupportedWebGL');
  error.code = 'unsupportedWebGL';
  if (cause) error.cause = cause;
  return error;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Build the responsive Three.js garden used by Hide and Seek.
 * All input remains in the caller's DOM buttons; this module only renders.
 */
export function createHideSeekScene(host, { onPlace = () => {} } = {}) {
  if (!host || typeof host.querySelector !== 'function') throw new TypeError('createHideSeekScene requires a host element');
  const canvas = host.querySelector('canvas');
  if (!canvas) throw new TypeError('createHideSeekScene host must contain a canvas');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'low-power',
    });
  } catch (error) {
    throw unsupportedWebGL(error);
  }
  if (!renderer.getContext()) {
    renderer.dispose();
    throw unsupportedWebGL();
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#b8e7f4');
  scene.fog = new THREE.Fog('#b8e7f4', 18, 38);

  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 70);
  const hemi = new THREE.HemisphereLight('#f7fdff', '#7e9c64', 1.9);
  const sun = new THREE.DirectionalLight('#fff1cf', 2.55);
  sun.position.set(-7, 13, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(768, 768);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -7, near: 1, far: 28 });
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.045;
  const fill = new THREE.DirectionalLight('#c8dcff', 0.65);
  fill.position.set(8, 7, -8);
  scene.add(hemi, sun, fill);

  const materials = new Set();
  const geometries = new Set();
  const makeMaterial = (color, options = {}) => {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: options.roughness ?? 0.76,
      metalness: options.metalness ?? 0,
      emissive: options.emissive ?? 0x000000,
      emissiveIntensity: options.emissiveIntensity ?? 0,
      side: options.side ?? THREE.FrontSide,
    });
    materials.add(material);
    return material;
  };
  const rememberGeometry = geometry => {
    geometries.add(geometry);
    return geometry;
  };
  const mesh = (parent, geometry, material, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) => {
    geometries.add(geometry);
    materials.add(material);
    const item = new THREE.Mesh(geometry, material);
    item.position.set(...position);
    item.scale.set(...scale);
    item.rotation.set(...rotation);
    item.castShadow = true;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  };

  const grass = makeMaterial('#79bf68', { roughness: 0.9 });
  const grassTop = makeMaterial('#9bd477', { roughness: 0.88 });
  const earth = makeMaterial('#9f774f', { roughness: 0.95 });
  const trunk = makeMaterial('#9b6b42', { roughness: 0.94 });
  const darkLeaf = makeMaterial('#3c9362', { roughness: 0.88 });
  const midLeaf = makeMaterial('#58ad69', { roughness: 0.88 });
  const lightLeaf = makeMaterial('#75c878', { roughness: 0.86 });
  const deepGreen = makeMaterial('#2f7f58', { roughness: 0.9 });
  const cream = makeMaterial('#fff0c5', { roughness: 0.72 });
  const stone = makeMaterial('#e8d7ae', { roughness: 0.96 });

  const island = new THREE.Group();
  scene.add(island);
  mesh(island, rememberGeometry(new THREE.CylinderGeometry(6.7, 6.25, 0.85, 48)), earth, [0, -0.46, 0], [1, 1, 0.83]);
  mesh(island, rememberGeometry(new THREE.CylinderGeometry(6.48, 6.62, 0.26, 48)), grass, [0, 0.04, 0], [1, 1, 0.83]);
  mesh(island, rememberGeometry(new THREE.CylinderGeometry(6.24, 6.34, 0.12, 48)), grassTop, [0, 0.22, 0], [1, 1, 0.83]);

  // A softly raised winding patch makes the garden read as a place, not a flat stage.
  const pathMaterial = makeMaterial('#f0dda9', { roughness: 0.98 });
  const path = mesh(island, rememberGeometry(new THREE.CapsuleGeometry(0.56, 6.1, 6, 16)), pathMaterial,
    [0, 0.31, 1.25], [1, 0.08, 1], [Math.PI / 2, 0, 0]);
  path.castShadow = false;

  const places = [0, 1, 2].map(index => {
    const group = new THREE.Group();
    group.name = `hide-place-${index}`;
    scene.add(group);
    const foliage = [];
    const shapes = index === 0
      ? [[-0.58, 0.78, 0.02, 0.88, 0.88], [0.1, 0.93, -0.02, 1.08, 1], [0.7, 0.72, 0.08, 0.82, 0.8]]
      : index === 1
        ? [[-0.7, 0.74, 0.03, 0.9, 0.78], [0, 0.91, -0.04, 1.15, 0.92], [0.72, 0.76, 0.04, 0.94, 0.8]]
        : [[-0.52, 0.78, 0.03, 0.82, 0.9], [0, 1.12, -0.1, 1.02, 1.18], [0.58, 0.8, 0.02, 0.86, 0.9]];
    const bushGeo = rememberGeometry(new THREE.IcosahedronGeometry(0.82, 2));
    shapes.forEach(([x, y, z, sx, sy], part) => {
      foliage.push(mesh(group, bushGeo, [darkLeaf, midLeaf, lightLeaf][(index + part) % 3], [x, y, z], [sx, sy, 0.9]));
    });
    mesh(group, rememberGeometry(new THREE.CylinderGeometry(0.22, 0.31, 1.12, 8)), trunk, [0, 0.47, -0.28]);
    const rim = mesh(group, rememberGeometry(new THREE.TorusGeometry(1.06, 0.075, 7, 30)), stone, [0, 0.31, 0.08], [1.15, 1, 0.78], [Math.PI / 2, 0, 0]);
    rim.castShadow = false;
    return { group, foliage };
  });

  // Flower colors are stable landmarks for child and accessible button labels:
  // pink at left, yellow at right, blue at the back.
  const stemGeo = rememberGeometry(new THREE.CylinderGeometry(0.025, 0.035, 0.42, 6));
  const petalGeo = rememberGeometry(new THREE.SphereGeometry(0.085, 8, 6));
  const centerGeo = rememberGeometry(new THREE.SphereGeometry(0.065, 8, 6));
  const stemMaterial = makeMaterial('#3e9462', { roughness: 0.92 });
  const centerMaterial = makeMaterial('#fff0a4', { roughness: 0.68 });
  const flowerOffsets = [[-1.05, 0.72], [-0.72, 1.02], [0.7, 1.05], [1.03, 0.67]];
  places.forEach((place, index) => {
    const flowerMaterial = makeMaterial(FLOWER_COLORS[index], { roughness: 0.7 });
    const stems = new THREE.InstancedMesh(stemGeo, stemMaterial, flowerOffsets.length);
    const centers = new THREE.InstancedMesh(centerGeo, centerMaterial, flowerOffsets.length);
    const petals = new THREE.InstancedMesh(petalGeo, flowerMaterial, flowerOffsets.length * 5);
    geometries.add(stemGeo); geometries.add(centerGeo); geometries.add(petalGeo);
    materials.add(stemMaterial); materials.add(centerMaterial); materials.add(flowerMaterial);
    const dummy = new THREE.Object3D();
    flowerOffsets.forEach(([x, z], flowerIndex) => {
      dummy.position.set(x, 0.45, z);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      stems.setMatrixAt(flowerIndex, dummy.matrix);
      dummy.position.set(x, 0.69, z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      centers.setMatrixAt(flowerIndex, dummy.matrix);
      for (let petal = 0; petal < 5; petal += 1) {
        const angle = petal * Math.PI * 2 / 5;
        dummy.position.set(x + Math.cos(angle) * 0.13, 0.69 + Math.sin(angle) * 0.13, z + 0.005);
        dummy.scale.set(1.25, 0.72, 0.72);
        dummy.rotation.set(0, 0, angle);
        dummy.updateMatrix();
        petals.setMatrixAt(flowerIndex * 5 + petal, dummy.matrix);
      }
    });
    for (const item of [stems, centers, petals]) {
      item.castShadow = true;
      item.receiveShadow = true;
      place.group.add(item);
    }
  });

  // Background trees are instanced to keep a soft toy-garden silhouette cheap.
  const treeSites = [[-5.4, -3.7, 1], [5.25, -3.9, 0.92], [-5.7, 1.8, 0.82], [5.7, 1.65, 0.88], [3.75, -5.2, 0.7]];
  const treeTrunkGeo = rememberGeometry(new THREE.CylinderGeometry(0.18, 0.29, 2.1, 8));
  const treeLeafGeo = rememberGeometry(new THREE.IcosahedronGeometry(0.9, 2));
  const trunks = new THREE.InstancedMesh(treeTrunkGeo, trunk, treeSites.length);
  const treeLeaves = new THREE.InstancedMesh(treeLeafGeo, midLeaf, treeSites.length * 3);
  const treeDummy = new THREE.Object3D();
  treeSites.forEach(([x, z, scale], index) => {
    treeDummy.position.set(x, 1.13 * scale, z);
    treeDummy.scale.set(scale, scale, scale);
    treeDummy.updateMatrix();
    trunks.setMatrixAt(index, treeDummy.matrix);
    [[0, 2.45, 0, 1], [-0.55, 2.08, 0.04, 0.72], [0.56, 2.12, -0.08, 0.76]].forEach(([dx, y, dz, leafScale], part) => {
      treeDummy.position.set(x + dx * scale, y * scale, z + dz * scale);
      treeDummy.scale.set(leafScale * scale, leafScale * scale, leafScale * scale);
      treeDummy.updateMatrix();
      treeLeaves.setMatrixAt(index * 3 + part, treeDummy.matrix);
      treeLeaves.setColorAt(index * 3 + part, new THREE.Color([0x58ad69, 0x75c878, 0x3c9362][(index + part) % 3]));
    });
  });
  trunks.castShadow = trunks.receiveShadow = true;
  treeLeaves.castShadow = treeLeaves.receiveShadow = true;
  scene.add(trunks, treeLeaves);

  // Low rounded hills make a soft distant background without new assets.
  const hillMaterial = makeMaterial('#75b981', { roughness: 1 });
  [[-6.8, -7.8, 4.2], [0, -9.2, 5.6], [7.2, -7.8, 4.1]].forEach(([x, z, size]) => {
    const hill = mesh(scene, rememberGeometry(new THREE.SphereGeometry(1, 18, 10)), hillMaterial,
      [x, -0.9, z], [size, size * 0.72, size * 0.62]);
    hill.castShadow = false;
  });

  function buildAnimal(kind) {
    const group = new THREE.Group();
    group.name = ['bunny', 'cat', 'bear'][kind];
    const furColors = ['#f5eee1', '#e9a96d', '#ae7b55'];
    const earColors = ['#efafbe', '#d98562', '#8d5d43'];
    const fur = makeMaterial(furColors[kind], { roughness: 0.86 });
    const ear = makeMaterial(earColors[kind], { roughness: 0.82 });
    const white = makeMaterial('#fffdf5', { roughness: 0.7 });
    const ink = makeMaterial('#173f42', { roughness: 0.72 });
    const blush = makeMaterial('#f39aa5', { roughness: 0.76 });
    const bodyGeo = rememberGeometry(new THREE.SphereGeometry(0.5, 18, 12));
    mesh(group, bodyGeo, fur, [0, 0.72, 0], [0.72, 0.9, 0.62]);
    mesh(group, bodyGeo, fur, [0, 1.48, 0.03], [0.72, 0.67, 0.64]);
    mesh(group, bodyGeo, white, [0, 1.35, 0.54], [0.36, 0.25, 0.18]);
    mesh(group, bodyGeo, fur, [-0.48, 0.77, 0.18], [0.23, 0.56, 0.22], [0, 0, 0.32]);
    mesh(group, bodyGeo, fur, [0.48, 0.77, 0.18], [0.23, 0.56, 0.22], [0, 0, -0.32]);
    mesh(group, bodyGeo, fur, [-0.29, 0.12, 0.18], [0.38, 0.22, 0.48]);
    mesh(group, bodyGeo, fur, [0.29, 0.12, 0.18], [0.38, 0.22, 0.48]);
    mesh(group, bodyGeo, white, [-0.23, 1.62, 0.56], [0.16, 0.2, 0.1]);
    mesh(group, bodyGeo, white, [0.23, 1.62, 0.56], [0.16, 0.2, 0.1]);
    mesh(group, bodyGeo, ink, [-0.23, 1.63, 0.65], [0.075, 0.1, 0.055]);
    mesh(group, bodyGeo, ink, [0.23, 1.63, 0.65], [0.075, 0.1, 0.055]);
    mesh(group, bodyGeo, ink, [0, 1.39, 0.71], [0.12, 0.09, 0.08]);
    mesh(group, bodyGeo, blush, [-0.4, 1.38, 0.61], [0.11, 0.065, 0.045]);
    mesh(group, bodyGeo, blush, [0.4, 1.38, 0.61], [0.11, 0.065, 0.045]);

    if (kind === 0) {
      mesh(group, bodyGeo, fur, [-0.27, 2.17, 0.02], [0.25, 0.78, 0.2], [0, 0, 0.12]);
      mesh(group, bodyGeo, fur, [0.27, 2.17, 0.02], [0.25, 0.78, 0.2], [0, 0, -0.12]);
      mesh(group, bodyGeo, ear, [-0.27, 2.2, 0.18], [0.11, 0.55, 0.09], [0, 0, 0.12]);
      mesh(group, bodyGeo, ear, [0.27, 2.2, 0.18], [0.11, 0.55, 0.09], [0, 0, -0.12]);
    } else if (kind === 1) {
      const earGeo = rememberGeometry(new THREE.ConeGeometry(0.31, 0.55, 3, 2));
      mesh(group, earGeo, fur, [-0.39, 1.99, 0.02], [1, 1, 0.62], [0.05, 0, -0.12]);
      mesh(group, earGeo, fur, [0.39, 1.99, 0.02], [1, 1, 0.62], [0.05, 0, 0.12]);
      const tail = mesh(group, rememberGeometry(new THREE.TorusGeometry(0.43, 0.1, 10, 22, Math.PI * 1.45)), fur,
        [0.52, 0.72, -0.16], [1, 1, 1], [0, Math.PI / 2, -0.4]);
      tail.userData.tail = true;
    } else {
      mesh(group, bodyGeo, fur, [-0.48, 1.86, 0.02], [0.32, 0.32, 0.25]);
      mesh(group, bodyGeo, fur, [0.48, 1.86, 0.02], [0.32, 0.32, 0.25]);
      mesh(group, bodyGeo, ear, [-0.48, 1.87, 0.19], [0.15, 0.15, 0.09]);
      mesh(group, bodyGeo, ear, [0.48, 1.87, 0.19], [0.15, 0.15, 0.09]);
    }
    return group;
  }

  const animalStage = new THREE.Group();
  const animalModels = [0, 1, 2].map(index => {
    const animal = buildAnimal(index);
    animal.visible = index === 0;
    animalStage.add(animal);
    return animal;
  });
  scene.add(animalStage);

  // Clue models contain only the top of each friend. The bush hides their
  // lower edge, so "peek" reads as ears poking out rather than a floating pet.
  function buildPeek(kind) {
    const group = new THREE.Group();
    group.name = ['bunny-ears-clue', 'cat-ears-clue', 'bear-ears-clue'][kind];
    const furColors = ['#f5eee1', '#e9a96d', '#ae7b55'];
    const earColors = ['#efafbe', '#d98562', '#8d5d43'];
    const fur = makeMaterial(furColors[kind], { roughness: 0.86 });
    const ear = makeMaterial(earColors[kind], { roughness: 0.82 });
    const sphere = rememberGeometry(new THREE.SphereGeometry(0.5, 16, 10));
    if (kind === 0) {
      mesh(group, sphere, fur, [-0.25, 0.34, 0], [0.24, 0.76, 0.2], [0, 0, 0.1]);
      mesh(group, sphere, fur, [0.25, 0.34, 0], [0.24, 0.76, 0.2], [0, 0, -0.1]);
      mesh(group, sphere, ear, [-0.25, 0.37, 0.12], [0.1, 0.55, 0.075], [0, 0, 0.1]);
      mesh(group, sphere, ear, [0.25, 0.37, 0.12], [0.1, 0.55, 0.075], [0, 0, -0.1]);
    } else if (kind === 1) {
      mesh(group, sphere, fur, [0, -0.04, 0], [0.58, 0.3, 0.42]);
      const earGeometry = rememberGeometry(new THREE.ConeGeometry(0.3, 0.56, 3, 2));
      mesh(group, earGeometry, fur, [-0.34, 0.28, 0], [1, 1, 0.7], [0.04, 0, -0.1]);
      mesh(group, earGeometry, fur, [0.34, 0.28, 0], [1, 1, 0.7], [0.04, 0, 0.1]);
      mesh(group, earGeometry, ear, [-0.34, 0.27, 0.13], [0.48, 0.56, 0.34], [0.04, 0, -0.1]);
      mesh(group, earGeometry, ear, [0.34, 0.27, 0.13], [0.48, 0.56, 0.34], [0.04, 0, 0.1]);
    } else {
      mesh(group, sphere, fur, [0, -0.07, 0], [0.64, 0.32, 0.46]);
      mesh(group, sphere, fur, [-0.43, 0.17, 0], [0.3, 0.3, 0.22]);
      mesh(group, sphere, fur, [0.43, 0.17, 0], [0.3, 0.3, 0.22]);
      mesh(group, sphere, ear, [-0.43, 0.18, 0.13], [0.14, 0.14, 0.08]);
      mesh(group, sphere, ear, [0.43, 0.18, 0.13], [0.14, 0.14, 0.08]);
    }
    return group;
  }

  const clueStage = new THREE.Group();
  clueStage.name = 'peek-clue-stage';
  const peekModels = [0, 1, 2].map(index => {
    const peek = buildPeek(index);
    peek.visible = false;
    clueStage.add(peek);
    return peek;
  });
  scene.add(clueStage);

  const rustleMarker = new THREE.Group();
  rustleMarker.name = 'reduced-motion-rustle-marker';
  const rustleGold = makeMaterial('#ffd45b', { roughness: 0.64, emissive: 0x4a2b00, emissiveIntensity: 0.18 });
  const rustleRayGeometry = rememberGeometry(new THREE.SphereGeometry(0.12, 9, 7));
  [[-0.58, 0, 0.5], [-0.29, 0.19, 0.22], [0, 0.28, 0], [0.29, 0.19, -0.22], [0.58, 0, -0.5]].forEach(([x, y, angle]) => {
    mesh(rustleMarker, rustleRayGeometry, rustleGold, [x, y, 0], [0.62, 1.65, 0.42], [0, 0, angle]);
  });
  rustleMarker.visible = false;
  scene.add(rustleMarker);

  let state = { count: 2, target: -1, phase: 'watch', animal: 0, clue: 'none' };
  let width = 1;
  let height = 1;
  let portrait = true;
  let disposed = false;
  let lost = false;
  let manualPaused = false;
  let raf = 0;
  let lastFrame = -Infinity;
  let elapsed = 0;
  const goal = new THREE.Vector3();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function placeLayout() {
    const layout = portrait
      ? [[-2.32, 0, 1.7], [2.32, 0, 1.7], [0, 0, -3.05]]
      : [[-3.55, 0, 1.05], [3.55, 0, 1.05], [0, 0, -2.95]];
    places.forEach((place, index) => place.group.position.set(...layout[index]));
  }

  function targetGoal(phase = state.phase) {
    if (phase === 'found' && state.target >= 0 && state.target < state.count) {
      const place = places[state.target].group.position;
      return goal.set(place.x, 0.1, place.z + 1.28);
    }
    return goal.set(0, -2.8, 0);
  }

  function poseScene() {
    targetGoal();
    const validTarget = state.target >= 0 && state.target < state.count;
    const found = state.phase === 'found' && validTarget;
    animalStage.position.copy(goal);
    animalStage.visible = found;
    animalModels.forEach((animal, index) => {
      animal.visible = index === state.animal;
      if (index !== state.animal) return;
      const idle = reducedMotion.matches ? 0 : Math.sin(elapsed * 2.1) * 0.035;
      const bounce = state.phase === 'found' && !reducedMotion.matches ? Math.abs(Math.sin(elapsed * 4.4)) * 0.2 : 0;
      animal.position.y = idle + bounce;
      animal.rotation.z = reducedMotion.matches ? 0 : Math.sin(elapsed * 1.55) * 0.018;
      const tail = animal.children.find(child => child.userData.tail);
      if (tail) tail.rotation.z = -0.4 + (reducedMotion.matches ? 0 : Math.sin(elapsed * 3.1) * 0.22);
    });

    const peeking = state.phase === 'seek' && state.clue === 'peek' && validTarget;
    clueStage.visible = peeking;
    peekModels.forEach((peek, index) => {
      peek.visible = peeking && index === state.animal;
      peek.position.y = reducedMotion.matches ? 0 : Math.sin(elapsed * 1.7) * 0.035;
      peek.rotation.z = reducedMotion.matches ? 0 : Math.sin(elapsed * 1.25) * 0.018;
    });
    if (peeking) {
      const place = places[state.target].group.position;
      const bushTops = [1.69, 1.7, 2.02];
      clueStage.position.set(place.x, bushTops[state.target], place.z - 0.28);
    }

    const staticRustle = state.phase === 'seek' && state.clue === 'rustle' && validTarget && reducedMotion.matches;
    rustleMarker.visible = staticRustle;
    if (staticRustle) {
      const place = places[state.target].group.position;
      const markerHeights = [2.02, 2.02, 2.34];
      rustleMarker.position.set(place.x, markerHeights[state.target], place.z + 0.04);
    }
  }

  const projectPoint = new THREE.Vector3();
  function project(x, y, z) {
    projectPoint.set(x, y, z).project(camera);
    return { x: (projectPoint.x + 1) / 2, y: (1 - projectPoint.y) / 2 };
  }

  function placeControls() {
    scene.updateMatrixWorld(true);
    const rects = places.map((place, index) => {
      if (index >= state.count) return { left: 0, top: 0, width: 0, height: 0 };
      const p = place.group.position;
      const points = [];
      // Only the bush and flowers are answer targets. Keeping the interaction
      // volume below the peeking animal preserves every bush edge on phones.
      for (const x of [-1.38, 1.38]) {
        for (const y of [0.18, 2.2]) {
          for (const z of [-0.95, 1.18]) points.push(project(p.x + x, y, p.z + z));
        }
      }
      const left = clamp(Math.min(...points.map(point => point.x)), 0, 1);
      const right = clamp(Math.max(...points.map(point => point.x)), 0, 1);
      const top = clamp(Math.min(...points.map(point => point.y)), 0, 1);
      const bottom = clamp(Math.max(...points.map(point => point.y)), 0, 1);
      return { left, top, width: right - left, height: bottom - top };
    });

    rects.forEach((rect, index) => onPlace(index, rect));
  }

  function renderOnce() {
    if (disposed || lost) return;
    renderer.render(scene, camera);
  }

  function resize() {
    if (disposed) return;
    const bounds = host.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    width = bounds.width;
    height = bounds.height;
    portrait = width / height < 1.05;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = portrait ? 46 : 36;
    camera.position.set(0, portrait ? 8.8 : 7.2, portrait ? 15.2 : 13.6);
    camera.lookAt(0, 1.05, -0.55);
    camera.updateProjectionMatrix();
    placeLayout();
    targetGoal();
    poseScene();
    scene.updateMatrixWorld(true);
    placeControls();
    renderOnce();
  }

  function shouldAnimate() {
    return !disposed && !lost && !manualPaused && !document.hidden && !reducedMotion.matches;
  }

  function frame(now) {
    raf = 0;
    if (!shouldAnimate()) return;
    raf = requestAnimationFrame(frame);
    if (now - lastFrame < 33) return;
    const delta = Math.min(Math.max((now - lastFrame) / 1000, 0), 0.08);
    lastFrame = now;
    elapsed += Number.isFinite(delta) ? delta : 0;
    poseScene();
    if (!reducedMotion.matches) {
      const rustleTarget = state.phase === 'seek' && state.clue === 'rustle'
        && state.target >= 0 && state.target < state.count ? state.target : -1;
      places.forEach((place, index) => {
        place.foliage.forEach((leaf, part) => {
          const strength = index === rustleTarget ? 0.075 : 0.008;
          const speed = index === rustleTarget ? 6.2 : 0.55;
          leaf.rotation.z = Math.sin(elapsed * speed + index * 1.4 + part) * strength;
        });
      });
    }
    renderOnce();
  }

  function startLoop() {
    if (!shouldAnimate() || raf) return;
    lastFrame = -Infinity;
    raf = requestAnimationFrame(frame);
  }

  function pause() {
    manualPaused = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function resume() {
    if (disposed) return;
    manualPaused = false;
    startLoop();
    if (!raf) renderOnce();
  }

  function update(next = {}) {
    if (disposed) return;
    const nextCount = Number(next.count) === 3 ? 3 : 2;
    const requestedTarget = Number.isInteger(next.target) ? next.target : state.target;
    const nextTarget = requestedTarget >= 0 && requestedTarget < nextCount ? requestedTarget : -1;
    const nextPhase = PHASES.has(next.phase) ? next.phase : state.phase;
    const nextAnimal = clamp(Number.isInteger(next.animal) ? next.animal : state.animal, 0, 2);
    const nextClue = CLUES.has(next.clue) ? next.clue : state.clue;
    state = { count: nextCount, target: nextTarget, phase: nextPhase, animal: nextAnimal, clue: nextClue };
    places.forEach((place, index) => { place.group.visible = index < state.count; });
    // Apply every visibility and clue state before this synchronous render.
    // A late module load therefore cannot flash a previous animal or target.
    poseScene();
    if (state.phase !== 'seek' || state.clue !== 'rustle' || reducedMotion.matches) {
      places.forEach(place => place.foliage.forEach(leaf => { leaf.rotation.z = 0; }));
    }
    placeControls();
    renderOnce();
    startLoop();
  }

  function dispatchSceneError(reason) {
    host.dispatchEvent(new CustomEvent('sceneerror', { bubbles: true, detail: { reason } }));
  }

  function onContextLost(event) {
    event.preventDefault();
    lost = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    dispatchSceneError('contextlost');
  }

  function onContextRestored() {
    if (disposed) return;
    lost = false;
    resize();
    startLoop();
  }

  function onVisibilityChange() {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    } else {
      startLoop();
      if (!raf) renderOnce();
    }
  }

  function onReducedMotionChange() {
    targetGoal();
    if (reducedMotion.matches) {
      animalStage.position.copy(goal);
      places.forEach(place => place.foliage.forEach(leaf => { leaf.rotation.z = 0; }));
    }
    poseScene();
    renderOnce();
    startLoop();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);
  document.addEventListener('visibilitychange', onVisibilityChange);
  reducedMotion.addEventListener('change', onReducedMotionChange);

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    resizeObserver.disconnect();
    canvas.removeEventListener('webglcontextlost', onContextLost, false);
    canvas.removeEventListener('webglcontextrestored', onContextRestored, false);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    reducedMotion.removeEventListener('change', onReducedMotionChange);
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    scene.clear();
    renderer.dispose();
  }

  placeLayout();
  places.forEach((place, index) => { place.group.visible = index < state.count; });
  targetGoal('watch');
  animalStage.position.copy(goal);
  poseScene();
  resize();
  startLoop();

  return { update, pause, resume, dispose };
}
