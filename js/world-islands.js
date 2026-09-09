/* Irregular toy islands and animated activity props for the ocean home.
 *
 * ADDED NOTE (Claude, 2026-09-09 code review): same approach as
 * world-huts.js next door -- everything here is procedurally-built geometry
 * (createIrregularDisc wobbles a stack of discs with a per-island seeded
 * sine wave so each island looks hand-shaped, not a perfect circle), not a
 * downloaded model. createIsland(THREE, kind) is the export other files
 * use; 'companion' is a special kind for the small island the child's
 * mascot stands on, separate from the 5 real activity islands.
 */

const CACHE = new WeakMap();
const ACTIVITY_KINDS = new Set(['games', 'learn', 'art', 'watch', 'listen']);

const PALETTES = {
  games: { grass: 0x72c85b, grassSide: 0x4a9e50, accent: 0xff6f61 },
  learn: { grass: 0x8dcb58, grassSide: 0x5aa34e, accent: 0xffcc4d },
  art: { grass: 0x76c76b, grassSide: 0x4d9e67, accent: 0xb987e8 },
  watch: { grass: 0x69bf72, grassSide: 0x419665, accent: 0x58b8e8 },
  listen: { grass: 0x74c967, grassSide: 0x439b62, accent: 0x8e70db },
  companion: { grass: 0x83cf72, grassSide: 0x52a45e, accent: 0xff8fb1 },
};

function createIrregularDisc(THREE, radii, levels, seed, topScale = 1) {
  const segments = 40;
  const positions = [];
  const indices = [];
  const ringCount = levels.length;
  const waves = Array.from({ length: segments }, (_, index) => {
    const angle = index * Math.PI * 2 / segments;
    return 1 + Math.sin(angle * 3 + seed) * 0.035 + Math.sin(angle * 7 - seed * 0.7) * 0.018;
  });
  levels.forEach(([height, scale], ringIndex) => {
    for (let index = 0; index < segments; index += 1) {
      const angle = index * Math.PI * 2 / segments;
      const wobble = waves[index] * (ringIndex === ringCount - 1 ? topScale : 1);
      positions.push(Math.cos(angle) * radii[0] * scale * wobble, height,
        Math.sin(angle) * radii[1] * scale * wobble);
    }
  });
  const topCenter = positions.length / 3;
  positions.push(0, levels[ringCount - 1][0], 0);
  for (let index = 0; index < segments; index += 1) {
    indices.push(topCenter, (ringCount - 1) * segments + (index + 1) % segments,
      (ringCount - 1) * segments + index);
  }
  const topIndexCount = indices.length;
  for (let ring = 0; ring < ringCount - 1; ring += 1) {
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      const lower = ring * segments + index;
      const lowerNext = ring * segments + next;
      const upper = (ring + 1) * segments + index;
      const upperNext = (ring + 1) * segments + next;
      indices.push(lower, upper, upperNext, lower, upperNext, lowerNext);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.clearGroups();
  geometry.addGroup(0, topIndexCount, 1);
  geometry.addGroup(topIndexCount, indices.length - topIndexCount, 0);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createAnnulus(THREE, radii, innerScale, outerScale, seed) {
  const segments = 48;
  const positions = [];
  const indices = [];
  for (let ring = 0; ring < 2; ring += 1) {
    const scale = ring ? outerScale : innerScale;
    for (let index = 0; index < segments; index += 1) {
      const angle = index * Math.PI * 2 / segments;
      const wobble = 1 + Math.sin(angle * 3 + seed) * 0.03 + Math.sin(angle * 7 - seed) * 0.014;
      positions.push(Math.cos(angle) * radii[0] * scale * wobble, 0,
        Math.sin(angle) * radii[1] * scale * wobble);
    }
  }
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    indices.push(index, segments + next, segments + index, index, next, segments + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function shared(THREE) {
  if (CACHE.has(THREE)) return CACHE.get(THREE);
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1, 2, 2, 2),
    sphere: new THREE.SphereGeometry(0.5, 18, 12),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1),
    cone: new THREE.ConeGeometry(0.5, 1, 12, 2),
    torus: new THREE.TorusGeometry(0.5, 0.08, 8, 24),
    regularLand: createIrregularDisc(THREE, [3.22, 2.92], [[-0.58, 0.84], [0.16, 1.01], [0.38, 0.98]], 1.37),
    regularGrass: createIrregularDisc(THREE, [3.22, 2.92], [[0.38, 0.91], [0.5, 0.89], [0.56, 0.87]], 1.37),
    regularShallows: createAnnulus(THREE, [3.22, 2.92], 0.96, 1.065, 1.37),
    regularFoam: createAnnulus(THREE, [3.22, 2.92], 1.003, 1.031, 1.37),
    companionLand: createIrregularDisc(THREE, [1.72, 1.68], [[-0.58, 0.82], [0.16, 1.02], [0.38, 0.98]], 2.61),
    companionGrass: createIrregularDisc(THREE, [1.72, 1.68], [[0.38, 0.91], [0.5, 0.89], [0.56, 0.87]], 2.61),
    companionShallows: createAnnulus(THREE, [1.72, 1.68], 0.96, 1.065, 2.61),
    companionFoam: createAnnulus(THREE, [1.72, 1.68], 1.003, 1.031, 2.61),
  };
  const materials = new Map();
  const material = (color, options = {}) => {
    const key = `${color}:${options.roughness ?? 0.78}:${options.metalness ?? 0}:${options.transparent ? 1 : 0}:${options.opacity ?? 1}:${options.emissive ?? 0}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, ...options }));
    return materials.get(key);
  };
  const value = { geometries, material };
  CACHE.set(THREE, value);
  return value;
}

function addMesh(THREE, parent, geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(...position);
  item.scale.set(...scale);
  item.rotation.set(...rotation);
  item.castShadow = true;
  item.receiveShadow = true;
  parent.add(item);
  return item;
}

function addBlock(THREE, parent, sharedAssets, position, scale, color, rotation = [0, 0, 0]) {
  return addMesh(THREE, parent, sharedAssets.geometries.box, sharedAssets.material(color, { roughness: 0.68 }),
    position, scale, rotation);
}

function buildUmbrella(THREE, parent, assets) {
  const group = new THREE.Group();
  group.name = 'games-beach-umbrella';
  group.position.set(-2.55, 0.56, -1.73);
  parent.add(group);
  addMesh(THREE, group, assets.geometries.cylinder, assets.material(0xf5e5b7, { roughness: 0.72 }),
    [0, 0.62, 0], [0.075, 1.24, 0.075], [0, 0, -0.12]);
  addMesh(THREE, group, assets.geometries.sphere, assets.material(0xff6f61, { roughness: 0.65 }),
    [-0.07, 1.3, 0], [1.08, 0.34, 1.08]);
  const trim = addMesh(THREE, group, assets.geometries.torus, assets.material(0xffe078, { roughness: 0.64 }),
    [-0.07, 1.25, 0], [1.06, 1.06, 1.06], [Math.PI / 2, 0, 0]);
  trim.castShadow = false;
}

function buildGames(THREE, island, assets, animators) {
  buildUmbrella(THREE, island, assets);
  const ball = new THREE.Group();
  ball.name = 'games-bouncing-beach-ball';
  ball.position.set(2.42, 1.03, -0.28);
  island.add(ball);
  addMesh(THREE, ball, assets.geometries.sphere, assets.material(0xfff4b0, { roughness: 0.54 }), [0, 0, 0], [.9, .9, .9]);
  const bandColors = [0xff665f, 0x43b8d5, 0x67c96a];
  [[0, 0, 0], [Math.PI / 2, 0, 0], [0, Math.PI / 2, 0]].forEach((rotation, index) => {
    addMesh(THREE, ball, assets.geometries.torus, assets.material(bandColors[index], { roughness: 0.57 }),
      [0, 0, 0], [.82, .82, .82], rotation);
  });
  const blocks = new THREE.Group();
  blocks.name = 'games-toy-blocks';
  blocks.position.set(-2.48, 0.56, 1.18);
  island.add(blocks);
  addBlock(THREE, blocks, assets, [-0.42, .3, 0], [.57, .57, .57], 0x5abbd8, [0, .18, 0]);
  addBlock(THREE, blocks, assets, [.28, .24, .05], [.46, .46, .46], 0xffcc4d, [0, -.15, .08]);
  addBlock(THREE, blocks, assets, [-.06, .78, -.03], [.48, .48, .48], 0xef6f9b, [.05, 0, -.12]);
  animators.push({
    reset() { ball.position.y = 1.03; ball.rotation.set(0, 0, 0); },
    animate(t) { ball.position.y = 1.03 + Math.abs(Math.sin(t * 2.6)) * .31; ball.rotation.set(t * .7, t * 1.05, t * .3); },
  });
}

function addLetter(THREE, parent, assets, letter, x, color) {
  const group = new THREE.Group();
  group.position.set(x, .02, .285);
  parent.add(group);
  const mat = assets.material(color, { roughness: 0.55 });
  const bar = (position, scale, rotation = 0) => addMesh(THREE, group, assets.geometries.box, mat,
    position, scale, [0, 0, rotation]);
  if (letter === 'A') {
    bar([-.11, 0, 0], [.09, .44, .055], -.25);
    bar([.11, 0, 0], [.09, .44, .055], .25);
    bar([0, -.02, .01], [.29, .075, .06]);
  } else if (letter === 'B') {
    bar([-.13, 0, 0], [.08, .44, .055]);
    bar([.03, .11, 0], [.27, .18, .055]);
    bar([.03, -.14, 0], [.27, .18, .055]);
  } else {
    bar([-.13, 0, 0], [.08, .38, .055]);
    bar([.01, .17, 0], [.3, .075, .055]);
    bar([.01, -.17, 0], [.3, .075, .055]);
  }
}

function buildLearn(THREE, island, assets, animators) {
  const blocks = new THREE.Group();
  blocks.name = 'learn-abc-blocks';
  blocks.position.set(-2.44, 0.82, 1.02);
  island.add(blocks);
  const colors = [0xe95f72, 0x4aaed0, 0xf2b83f];
  ['A', 'B', 'C'].forEach((letter, index) => {
    const block = new THREE.Group();
    block.position.set(0, index * .45, index % 2 ? -.08 : .04);
    block.rotation.y = index % 2 ? -.12 : .1;
    blocks.add(block);
    addBlock(THREE, block, assets, [0, 0, 0], [.56, .46, .56], colors[index]);
    addLetter(THREE, block, assets, letter, 0, 0xfff4c7);
  });
  const books = new THREE.Group();
  books.name = 'learn-book-stack';
  books.position.set(2.48, .61, 1.08);
  island.add(books);
  [[0, 0, 0, 0x9a76d8], [.03, .2, -.03, 0x4eb6cb], [-.02, .4, .03, 0xf0718d]].forEach(([x, y, z, color], index) => {
    addBlock(THREE, books, assets, [x, y, z], [1.05 - index * .08, .13, .7], color, [0, index % 2 ? -.08 : .07, 0]);
    addBlock(THREE, books, assets, [x + .03, y + .08, z + .02], [.9 - index * .07, .055, .59], 0xfff5ce,
      [0, index % 2 ? -.08 : .07, 0]);
  });
  animators.push({
    reset() { blocks.rotation.z = 0; books.rotation.y = 0; },
    animate(t) { blocks.rotation.z = Math.sin(t * 1.4) * .025; books.rotation.y = Math.sin(t * .8) * .035; },
  });
}

function buildArt(THREE, island, assets, animators) {
  const easel = new THREE.Group();
  easel.name = 'art-giant-easel';
  easel.position.set(2.48, 0.56, 1.12);
  easel.rotation.y = -.12;
  island.add(easel);
  const wood = assets.material(0x9a623f, { roughness: .85 });
  addMesh(THREE, easel, assets.geometries.cylinder, wood, [-.31, .66, -.08], [.065, 1.32, .065], [0, 0, -.17]);
  addMesh(THREE, easel, assets.geometries.cylinder, wood, [.31, .66, -.08], [.065, 1.32, .065], [0, 0, .17]);
  addMesh(THREE, easel, assets.geometries.cylinder, wood, [0, .59, -.24], [.055, 1.25, .055], [.18, 0, 0]);
  addBlock(THREE, easel, assets, [0, .9, .04], [.85, .74, .09], 0xfff2ce);
  addBlock(THREE, easel, assets, [0, .49, .08], [1.02, .09, .15], 0xb8784f);
  [[-.2, 1.02, 0xe95e79, .18], [.17, .93, 0x4bb7d3, .21], [.02, .72, 0xf5c84a, .16]].forEach(([x, y, color, size]) => {
    addMesh(THREE, easel, assets.geometries.sphere, assets.material(color, { roughness: .62 }),
      [x, y, .105], [size, size * .72, .035]);
  });
  const supplies = new THREE.Group();
  supplies.name = 'art-paint-pots';
  supplies.position.set(-2.47, .56, 1.02);
  island.add(supplies);
  [-.27, .27].forEach((x, index) => {
    addMesh(THREE, supplies, assets.geometries.cylinder, assets.material(index ? 0x53b9d2 : 0xf06e91, { roughness: .65 }),
      [x, .25, 0], [.34, .5, .34]);
  });
  const brush = new THREE.Group();
  brush.position.set(0, .28, .02);
  supplies.add(brush);
  addMesh(THREE, brush, assets.geometries.cylinder, wood, [0, .47, 0], [.045, .88, .045], [0, 0, -.34]);
  addMesh(THREE, brush, assets.geometries.cone, assets.material(0xffcb46, { roughness: .65 }), [.17, .88, 0], [.13, .28, .13], [0, 0, -.34]);
  animators.push({
    reset() { brush.rotation.z = 0; easel.rotation.z = 0; },
    animate(t) { brush.rotation.z = Math.sin(t * 2) * .11; easel.rotation.z = Math.sin(t * .9) * .012; },
  });
}

function buildWatch(THREE, island, assets, animators) {
  const stand = new THREE.Group();
  stand.name = 'watch-popcorn-ticket-stand';
  stand.position.set(2.47, .56, 1.02);
  island.add(stand);
  addBlock(THREE, stand, assets, [0, .42, 0], [.92, .82, .66], 0xe85e65);
  for (const x of [-.3, 0, .3]) addBlock(THREE, stand, assets, [x, .45, .342], [.13, .73, .035], 0xfff1c2);
  addBlock(THREE, stand, assets, [0, .9, 0], [1.12, .15, .78], 0x3b75aa);
  addBlock(THREE, stand, assets, [0, 1.18, -.08], [.9, .42, .14], 0xffd454);
  const kernels = new THREE.Group();
  kernels.name = 'watch-bobbing-popcorn';
  stand.add(kernels);
  const kernelMaterial = assets.material(0xfff3b2, { roughness: .8 });
  [[-.3, 1.01, .12], [-.08, 1.08, .16], [.16, 1.02, .13], [.32, 1.1, .1], [0, 1.2, .12]].forEach(([x, y, z]) => {
    addMesh(THREE, kernels, assets.geometries.sphere, kernelMaterial, [x, y, z], [.23, .18, .2]);
  });
  const ticket = new THREE.Group();
  ticket.name = 'watch-movie-ticket';
  ticket.position.set(-2.58, .8, 1.12);
  ticket.rotation.y = .12;
  island.add(ticket);
  addBlock(THREE, ticket, assets, [0, 0, 0], [1.22, .58, .11], 0x4aaad0);
  addBlock(THREE, ticket, assets, [0, 0, .065], [.82, .14, .04], 0xffe36e);
  const play = addMesh(THREE, ticket, assets.geometries.cone, assets.material(0xfff6cf, { roughness: .58 }),
    [0, .02, .13], [.22, .08, .22], [Math.PI / 2, 0, 0]);
  play.rotation.z = -Math.PI / 2;
  animators.push({
    reset() { kernels.position.y = 0; ticket.rotation.z = 0; },
    animate(t) { kernels.position.y = Math.abs(Math.sin(t * 3.1)) * .08; ticket.rotation.z = Math.sin(t * 1.2) * .025; },
  });
}

function buildMusicNote(THREE, parent, assets, position, color, scale = 1) {
  const note = new THREE.Group();
  note.position.set(...position);
  note.scale.setScalar(scale);
  parent.add(note);
  const material = assets.material(color, { roughness: .6 });
  addMesh(THREE, note, assets.geometries.sphere, material, [0, 0, 0], [.25, .18, .12]);
  addMesh(THREE, note, assets.geometries.cylinder, material, [.17, .42, 0], [.045, .74, .045]);
  addBlock(THREE, note, assets, [.34, .76, 0], [.38, .08, .08], color, [0, 0, -.2]);
  return note;
}

function buildListen(THREE, island, assets, animators) {
  const speakers = [];
  [-2.48, 2.48].forEach((x, index) => {
    const speaker = new THREE.Group();
    speaker.name = index ? 'listen-right-speaker' : 'listen-left-speaker';
    speaker.position.set(x, .56, .96);
    speaker.rotation.y = index ? -.07 : .07;
    island.add(speaker);
    addBlock(THREE, speaker, assets, [0, .53, 0], [.72, 1.06, .55], 0x3b466e);
    for (const [y, size, color] of [[.33, .26, 0xa980e0], [.72, .19, 0x58c8bd]]) {
      addMesh(THREE, speaker, assets.geometries.cylinder, assets.material(color, { roughness: .52 }),
        [0, y, .3], [size, .07, size], [Math.PI / 2, 0, 0]);
      addMesh(THREE, speaker, assets.geometries.sphere, assets.material(0xffd45d, { roughness: .5 }),
        [0, y, .35], [size * .36, size * .36, .055]);
    }
    speakers.push(speaker);
  });
  const notes = new THREE.Group();
  notes.name = 'listen-floating-music-notes';
  notes.position.set(0, .72, -2.08);
  island.add(notes);
  const noteA = buildMusicNote(THREE, notes, assets, [-.42, .08, 0], 0xf279a4, .9);
  const noteB = buildMusicNote(THREE, notes, assets, [.42, .35, -.04], 0xffcc4d, .72);
  animators.push({
    reset() { speakers.forEach(item => item.scale.setScalar(1)); noteA.position.y = .08; noteB.position.y = .35; notes.rotation.z = 0; },
    animate(t) {
      speakers.forEach((item, index) => item.scale.setScalar(1 + Math.max(0, Math.sin(t * 4.2 + index * Math.PI)) * .035));
      noteA.position.y = .08 + Math.sin(t * 1.8) * .09;
      noteB.position.y = .35 + Math.sin(t * 1.8 + 1.4) * .09;
      notes.rotation.z = Math.sin(t * 1.15) * .035;
    },
  });
}

function buildCompanion(THREE, island, assets, animators, accent) {
  const welcome = new THREE.Group();
  welcome.name = 'companion-welcome-ring';
  island.add(welcome);
  const ring = addMesh(THREE, welcome, assets.geometries.torus, assets.material(accent, { roughness: .62 }),
    [0, .595, 0], [1.9, 1.9, 1.9], [Math.PI / 2, 0, 0]);
  ring.castShadow = false;
  const pebbleMaterial = assets.material(0xffedb2, { roughness: .88 });
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI * 2 / 8;
    addMesh(THREE, welcome, assets.geometries.sphere, pebbleMaterial,
      [Math.cos(angle) * 1.42, .61, Math.sin(angle) * 1.32], [.24, .1, .19]);
  }
  animators.push({
    reset() { welcome.rotation.y = 0; ring.scale.set(1.9, 1.9, 1.9); },
    animate(t) { welcome.rotation.y = Math.sin(t * .45) * .025; const pulse = 1.9 + Math.sin(t * 1.5) * .045; ring.scale.setScalar(pulse); },
  });
}

export function createIsland(THREE, requestedKind) {
  const kind = ACTIVITY_KINDS.has(requestedKind) ? requestedKind : 'companion';
  const assets = shared(THREE);
  const palette = PALETTES[kind];
  const companion = kind === 'companion';
  const group = new THREE.Group();
  group.name = `${kind}-island`;
  if (!companion) group.userData.world = kind;
  group.userData.kind = kind;

  const sandSide = assets.material(0xc79562, { roughness: .96 });
  const sandTop = assets.material(0xf4d99b, { roughness: .93 });
  const grassSide = assets.material(palette.grassSide, { roughness: .94 });
  const grassTop = assets.material(palette.grass, { roughness: .9 });
  const shallowsMaterial = assets.material(0x86e2df, { roughness: .3, transparent: true, opacity: .52 });
  const foamMaterial = assets.material(0xf4ffff, { roughness: .38, transparent: true, opacity: .86, emissive: 0x16383a });
  const prefix = companion ? 'companion' : 'regular';
  const land = addMesh(THREE, group, assets.geometries[`${prefix}Land`], [sandSide, sandTop], [0, 0, 0]);
  const grass = addMesh(THREE, group, assets.geometries[`${prefix}Grass`], [grassSide, grassTop], [0, 0, 0]);
  const shallows = addMesh(THREE, group, assets.geometries[`${prefix}Shallows`], shallowsMaterial, [0, -.675, 0]);
  const foam = addMesh(THREE, group, assets.geometries[`${prefix}Foam`], foamMaterial, [0, -.642, 0]);
  land.name = `${kind}-sand-shore`;
  grass.name = `${kind}-grass-top`;
  shallows.name = `${kind}-shallow-water-shimmer`;
  foam.name = `${kind}-foam-ring`;
  shallows.castShadow = foam.castShadow = false;
  shallows.receiveShadow = foam.receiveShadow = false;
  shallows.renderOrder = 1;
  foam.renderOrder = 2;

  const animators = [];
  if (kind === 'games') buildGames(THREE, group, assets, animators);
  else if (kind === 'learn') buildLearn(THREE, group, assets, animators);
  else if (kind === 'art') buildArt(THREE, group, assets, animators);
  else if (kind === 'watch') buildWatch(THREE, group, assets, animators);
  else if (kind === 'listen') buildListen(THREE, group, assets, animators);
  else buildCompanion(THREE, group, assets, animators, palette.accent);

  function reset() {
    shallows.rotation.y = 0;
    shallows.scale.set(1, 1, 1);
    foam.rotation.y = 0;
    foam.scale.set(1, 1, 1);
    foam.position.y = -.642;
    animators.forEach(animator => animator.reset());
  }

  function update(timeSeconds, reducedMotion = false) {
    const time = Number.isFinite(timeSeconds) ? timeSeconds : 0;
    if (reducedMotion) {
      reset();
      return;
    }
    shallows.rotation.y = Math.sin(time * .24) * .035;
    const shallowPulse = 1 + Math.sin(time * .85) * .007;
    shallows.scale.set(shallowPulse, 1, shallowPulse);
    foam.rotation.y = -Math.sin(time * .31) * .025;
    const foamPulse = 1 + Math.sin(time * 1.1) * .006;
    foam.scale.set(foamPulse, 1, foamPulse);
    foam.position.y = -.642 + Math.sin(time * 1.35) * .012;
    animators.forEach(animator => animator.animate(time));
  }

  reset();
  return {
    group,
    update,
    bounds: companion
      ? { radiusX: 1.9, radiusZ: 1.9, top: .56 }
      : { radiusX: 3.5, radiusZ: 3.18, landRadiusX: 3.3, landRadiusZ: 3, top: .56,
        hutClearance: { minX: -1.9, maxX: 1.9, minZ: -1.5, maxZ: 2.15 } },
  };
}
