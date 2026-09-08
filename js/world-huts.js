/* Volumetric toy-town activity huts for the Three.js Wonderwood scene. */

const CACHE = new WeakMap();

const PALETTES = {
  games: {
    wall: 0xff8a76, wallSide: 0xe45d58, roof: 0xb93e4b, trim: 0xffd36a,
    accent: 0x39a79c, dark: 0x184d4a, glow: 0xfff0a8, glass: 0x79d4dd, sign: 0x9c3542,
  },
  learn: {
    wall: 0xffd96f, wallSide: 0xe4aa3d, roof: 0x58a8c7, trim: 0xfff0b3,
    accent: 0x8b6bd1, dark: 0x184d4a, glow: 0xfff6c8, glass: 0x83cce8, sign: 0x28788f,
  },
  art: {
    wall: 0xc9a8ef, wallSide: 0x9a73cb, roof: 0x7752ad, trim: 0xffd5e8,
    accent: 0xf078a9, dark: 0x184d4a, glow: 0xfff0b8, glass: 0x8fd9dd, sign: 0x68459d,
  },
  watch: {
    wall: 0x78bee8, wallSide: 0x4e82bd, roof: 0x334b94, trim: 0xffd56c,
    accent: 0xef6c6c, dark: 0x173e68, glow: 0xfff2a6, glass: 0x92d7f2, sign: 0x263d7d,
  },
  listen: {
    wall: 0x84d2ae, wallSide: 0x4f9b78, roof: 0x4f9f65, trim: 0xf1cf71,
    accent: 0xa67bd8, dark: 0x184d4a, glow: 0xfff0ad, glass: 0xa3e3d5, sign: 0x367b61,
  },
};

const LABELS = { games: 'GAMES', learn: 'LEARN', art: 'ART', watch: 'WATCH', listen: 'LISTEN' };

function shared(THREE) {
  if (CACHE.has(THREE)) return CACHE.get(THREE);
  const value = {
    unitBox: new THREE.BoxGeometry(1, 1, 1, 2, 2, 2),
    unitCylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 20, 1),
    unitSphere: new THREE.SphereGeometry(0.5, 20, 12),
    unitCone: new THREE.ConeGeometry(0.5, 1, 4, 2),
    unitPlane: new THREE.PlaneGeometry(1, 1, 2, 2),
  };
  CACHE.set(THREE, value);
  return value;
}

function roundedShape(THREE, width, height, radius) {
  const s = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + width - r, y);
  s.quadraticCurveTo(x + width, y, x + width, y + r);
  s.lineTo(x + width, y + height - r);
  s.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  s.lineTo(x + r, y + height);
  s.quadraticCurveTo(x, y + height, x, y + height - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function roundedGeometry(THREE, width, height, depth, radius = 0.16) {
  const geometry = new THREE.ExtrudeGeometry(roundedShape(THREE, width, height, radius), {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: Math.min(0.07, radius * 0.45),
    bevelThickness: Math.min(0.07, depth * 0.22),
    curveSegments: 5,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function gableGeometry(THREE, width, height, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(0, height);
  shape.lineTo(width / 2, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.08,
    bevelThickness: 0.08,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function starGeometry(THREE, outer = 0.36, inner = 0.17, depth = 0.12) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.035,
    bevelThickness: 0.035,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function materialFactory(THREE) {
  const cache = new Map();
  return function material(color, options = {}) {
    const key = [color, options.roughness ?? 0.7, options.metalness ?? 0.02,
      options.emissive ?? 0, options.emissiveIntensity ?? 0, options.side ?? 'front'].join('|');
    if (cache.has(key)) return cache.get(key);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: options.roughness ?? 0.7,
      metalness: options.metalness ?? 0.02,
      emissive: options.emissive ?? 0x000000,
      emissiveIntensity: options.emissiveIntensity ?? 0,
      side: options.side === 'double' ? THREE.DoubleSide : THREE.FrontSide,
    });
    cache.set(key, mat);
    return mat;
  };
}

function canvasTexture(THREE, draw, width = 1024, height = 256) {
  let canvas;
  if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(width, height);
  else if (typeof document !== 'undefined') canvas = document.createElement('canvas');
  else throw new Error('createHut requires a browser canvas for its building sign');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function labelTexture(THREE, label, palette) {
  return canvasTexture(THREE, (ctx, width, height) => {
    ctx.fillStyle = '#fff8dc';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 24;
    ctx.strokeRect(12, 12, width - 24, height - 24);
    ctx.fillStyle = `#${palette.dark.toString(16).padStart(6, '0')}`;
    ctx.font = '900 208px "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(24,77,74,0.16)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 10;
    ctx.fillText(label, width / 2, height / 2 + 5, width - 80);
  });
}

function checkerTexture(THREE) {
  return canvasTexture(THREE, (ctx, width, height) => {
    const cols = 6;
    const rows = 4;
    const cw = width / cols;
    const ch = height / rows;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        ctx.fillStyle = (x + y) % 2 ? '#fff8dc' : '#184d4a';
        ctx.fillRect(x * cw, y * ch, cw + 1, ch + 1);
      }
    }
  }, 384, 256);
}

function setTransform(object, position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  object.position.set(...position);
  object.rotation.set(...rotation);
  object.scale.set(...scale);
  return object;
}

function addMesh(THREE, parent, geometry, material, position, rotation, scale) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  setTransform(mesh, position, rotation, scale);
  parent.add(mesh);
  return mesh;
}

function addBox(THREE, parent, sharedGeo, material, size, position, rotation = [0, 0, 0]) {
  return addMesh(THREE, parent, sharedGeo.unitBox, material, position, rotation, size);
}

function addCylinder(THREE, parent, sharedGeo, material, radius, height, position, rotation = [0, 0, 0]) {
  return addMesh(THREE, parent, sharedGeo.unitCylinder, material, position, rotation, [radius * 2, height, radius * 2]);
}

function addSphere(THREE, parent, sharedGeo, material, size, position, scale = [1, 1, 1]) {
  return addMesh(THREE, parent, sharedGeo.unitSphere, material, position, [0, 0, 0], [size * scale[0] * 2, size * scale[1] * 2, size * scale[2] * 2]);
}

function addFrontDisc(THREE, parent, sharedGeo, material, radius, depth, position) {
  return addCylinder(THREE, parent, sharedGeo, material, radius, depth, position, [Math.PI / 2, 0, 0]);
}

function addInstancedSpheres(THREE, parent, geometry, material, positions, diameter) {
  const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
  const dummy = new THREE.Object3D();
  positions.forEach((position, index) => {
    dummy.position.set(...position);
    dummy.scale.setScalar(diameter);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addRounded(THREE, parent, material, size, position, radius = 0.16, rotation = [0, 0, 0]) {
  return addMesh(THREE, parent, roundedGeometry(THREE, size[0], size[1], size[2], radius), material, position, rotation);
}

function addWindow(THREE, parent, geo, mats, position, rotation = [0, 0, 0], scale = [1, 1]) {
  const frame = addRounded(THREE, parent, mats.trim, [0.78 * scale[0], 0.78 * scale[1], 0.13], position, 0.13, rotation);
  const panePosition = [...position];
  const normal = new THREE.Vector3(0, 0, 0.09).applyEuler(new THREE.Euler(...rotation));
  panePosition[0] += normal.x;
  panePosition[1] += normal.y;
  panePosition[2] += normal.z;
  addRounded(THREE, parent, mats.window, [0.58 * scale[0], 0.58 * scale[1], 0.035], panePosition, 0.1, rotation);
  const barPosition = [...position];
  const barNormal = new THREE.Vector3(0, 0, 0.145).applyEuler(new THREE.Euler(...rotation));
  barPosition[0] += barNormal.x;
  barPosition[1] += barNormal.y;
  barPosition[2] += barNormal.z;
  addRounded(THREE, parent, mats.windowBar, [0.055, 0.56 * scale[1], 0.028], barPosition, 0.018, rotation);
  addRounded(THREE, parent, mats.windowBar, [0.56 * scale[0], 0.055, 0.028], barPosition, 0.018, rotation);
  return frame;
}

function addFacade(THREE, group, geo, mats) {
  addRounded(THREE, group, mats.wall, [3.24, 2.48, 2.55], [0, 1.48, 0], 0.24);
  addBox(THREE, group, geo, mats.wallSide, [0.18, 2.2, 2.25], [1.61, 1.48, -0.02]);
  addRounded(THREE, group, mats.doorTrim, [1.08, 1.72, 0.18], [0, 1.02, 1.34], 0.28);
  addRounded(THREE, group, mats.door, [0.78, 1.5, 0.2], [0, 0.96, 1.45], 0.25);
  addSphere(THREE, group, geo, mats.trim, 0.055, [0.25, 0.98, 1.58]);
  addWindow(THREE, group, geo, mats, [-1.02, 1.65, 1.34]);
  addWindow(THREE, group, geo, mats, [1.02, 1.65, 1.34]);
  addWindow(THREE, group, geo, mats, [1.67, 1.72, 0.15], [0, Math.PI / 2, 0], [0.9, 1]);
  addBox(THREE, group, geo, mats.step, [1.28, 0.18, 0.55], [0, 0.23, 1.58]);
  addBox(THREE, group, geo, mats.step, [1.62, 0.16, 0.45], [0, 0.08, 1.88]);
}

function addSignFace(THREE, sign, palette, label, width, height, z = 0.17) {
  const faceMaterial = new THREE.MeshStandardMaterial({
    map: labelTexture(THREE, label, palette),
    color: 0xffffff,
    roughness: 0.68,
    metalness: 0,
    emissive: palette.glow,
    emissiveIntensity: 0.1,
  });
  addMesh(THREE, sign, new THREE.PlaneGeometry(width, height), faceMaterial, [0, 0, z]);
}

function addRoofSign(THREE, group, geo, mats, palette, kind, animated) {
  const mounts = {
    games:  { y: 4.03, z: 1.2,  tilt: -0.17, width: 3.48, height: 1.06, post: 1.02 },
    learn:  { y: 3.54, z: 1.5,  tilt: -0.11, width: 2.5, height: 0.72, post: 0.62 },
    art:    { y: 3.48, z: 1.58, tilt: -0.08, width: 1.72, height: 0.92, post: 1.24 },
    watch:  { y: 3.58, z: 1.54, tilt: -0.12, width: 3.5, height: 0.98, post: 0.68 },
    listen: { y: 2.93, z: 1.58, tilt: -0.09, width: 2.3, height: 0.7, post: 0.46 },
  };
  const config = mounts[kind];
  const sign = new THREE.Group();
  sign.name = `${kind}-roof-sign`;
  sign.position.set(0, config.y, config.z);
  sign.rotation.x = config.tilt;

  const postX = kind === 'art' ? 0.58 : Math.min(1.1, config.width * 0.34);
  addBox(THREE, sign, geo, mats.signBracket, [0.14, config.post, 0.16], [-postX, -config.post * 0.58, -0.06]);
  addBox(THREE, sign, geo, mats.signBracket, [0.14, config.post, 0.16], [postX, -config.post * 0.58, -0.06]);
  addRounded(THREE, sign, mats.sign, [config.width, config.height, 0.24], [0, 0, 0], kind === 'art' ? 0.08 : 0.18);

  if (kind === 'watch') {
    // A raised crown and one instanced string of bulbs make the marquee read at phone size.
    addRounded(THREE, sign, mats.sign, [2.36, 0.32, 0.22], [0, 0.52, -0.01], 0.14);
    const bulbMaterial = new THREE.MeshStandardMaterial({
      color: palette.glow,
      emissive: palette.glow,
      emissiveIntensity: 1.1,
      roughness: 0.35,
    });
    const bulbs = [];
    for (let x = -1.5; x <= 1.501; x += 0.375) {
      bulbs.push([x, -0.39, 0.2], [x, 0.39, 0.2]);
    }
    [-0.39, 0, 0.39].forEach(y => bulbs.push([-1.62, y, 0.2], [1.62, y, 0.2]));
    addInstancedSpheres(THREE, sign, geo.unitSphere, bulbMaterial, bulbs, 0.16);
    animated.marquee = bulbMaterial;
  }

  if (kind === 'learn') {
    // Open-book pages crown the school sign without competing with the word.
    addRounded(THREE, sign, mats.trim, [0.9, 0.34, 0.12], [-0.43, 0.48, -0.01], 0.08, [0, 0, 0.13]);
    addRounded(THREE, sign, mats.trim, [0.9, 0.34, 0.12], [0.43, 0.48, -0.01], 0.08, [0, 0, -0.13]);
    addBox(THREE, sign, geo, mats.dark, [0.055, 0.34, 0.1], [0, 0.46, 0.08]);
  }

  if (kind === 'art') {
    // The ART board is the canvas on a real easel.
    addBox(THREE, sign, geo, mats.step, [1.96, 0.12, 0.18], [0, -0.58, 0]);
    addBox(THREE, sign, geo, mats.step, [0.13, 1.36, 0.15], [0, -0.76, -0.05], [0, 0, -0.13]);
  }

  addSignFace(THREE, sign, palette, LABELS[kind], config.width - 0.24, config.height - 0.2);
  group.add(sign);
}

function addGableRoof(THREE, group, material, width = 3.66, height = 1.22, depth = 3.02, y = 2.72) {
  return addMesh(THREE, group, gableGeometry(THREE, width, height, depth), material, [0, y, 0]);
}

function buildGames(THREE, group, geo, mats, animated) {
  addGableRoof(THREE, group, mats.roof, 3.56, 1.25, 2.82, 2.68);
  addBox(THREE, group, geo, mats.trim, [3.54, 0.12, 0.14], [0, 2.69, 1.43]);
  addMesh(THREE, group, starGeometry(THREE, 0.28, 0.13, 0.1), mats.accent, [0, 3.37, 1.57]);
  const flagTexture = checkerTexture(THREE);
  const flagMaterial = new THREE.MeshStandardMaterial({ map: flagTexture, roughness: 0.72, metalness: 0, side: THREE.DoubleSide });
  [-0.95, 0.95].forEach((x, index) => {
    const flag = new THREE.Group();
    flag.position.set(x, 3.75, 0.2 - index * 0.18);
    addCylinder(THREE, flag, geo, mats.dark, 0.035, 1.22, [0, 0, 0]);
    addMesh(THREE, flag, geo.unitPlane, flagMaterial, [0.34, 0.34, 0.02], [0, 0, 0], [0.62, 0.42, 1]);
    group.add(flag);
    animated.flags.push({ object: flag, phase: index * 1.8 });
  });
  addSphere(THREE, group, geo, mats.accent, 0.18, [-1.48, 0.34, 1.44]);
  addSphere(THREE, group, geo, mats.trim, 0.13, [1.47, 0.31, 1.5]);
}

function buildLearn(THREE, group, geo, mats, animated) {
  addGableRoof(THREE, group, mats.roof, 3.56, 1.18, 2.82, 2.7);
  addBox(THREE, group, geo, mats.trim, [3.54, 0.14, 0.16], [0, 2.71, 1.43]);

  // Bell tower and roof cap turn the generic hut into a friendly schoolhouse.
  addRounded(THREE, group, mats.wallSide, [0.82, 0.82, 0.72], [0, 3.72, -0.15], 0.12);
  addRounded(THREE, group, mats.dark, [0.5, 0.48, 0.08], [0, 3.72, 0.23], 0.16);
  const bell = new THREE.Group();
  bell.position.set(0, 3.76, 0.3);
  addCylinder(THREE, bell, geo, mats.trim, 0.18, 0.26, [0, 0, 0], [0, 0, Math.PI]);
  addSphere(THREE, bell, geo, mats.trim, 0.055, [0, -0.17, 0]);
  group.add(bell);
  animated.bell = bell;
  addMesh(THREE, group, geo.unitCone, mats.roof, [0, 4.35, -0.15], [0, Math.PI / 4, 0], [1.18, 0.76, 1.18]);

  // Oversized books and a globe are recognizable discovery objects from the front.
  [
    { y: 0.38, width: 0.9, material: mats.accent, turn: 0.08 },
    { y: 0.55, width: 0.78, material: mats.roof, turn: -0.06 },
    { y: 0.72, width: 0.86, material: mats.trim, turn: 0.04 },
  ].forEach(book => {
    addRounded(THREE, group, book.material, [book.width, 0.16, 0.42], [-1.27, book.y, 1.54], 0.045, [0, book.turn, 0]);
    addBox(THREE, group, geo, mats.dark, [0.06, 0.11, 0.44], [-1.27 - book.width * 0.34, book.y, 1.56], [0, book.turn, 0]);
  });
  const globe = new THREE.Group();
  globe.position.set(1.25, 1.34, 1.57);
  addSphere(THREE, globe, geo, mats.window, 0.31, [0, 0, 0]);
  const globeRing = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.035, 8, 24), mats.dark);
  globeRing.rotation.y = 0.35;
  globe.add(globeRing);
  addBox(THREE, globe, geo, mats.step, [0.1, 0.35, 0.1], [0, -0.4, 0]);
  addCylinder(THREE, globe, geo, mats.step, 0.24, 0.08, [0, -0.59, 0]);
  group.add(globe);
  animated.globe = globe;
}

function buildArt(THREE, group, geo, mats, animated) {
  addGableRoof(THREE, group, mats.roof, 3.56, 1.18, 2.82, 2.7);
  addBox(THREE, group, geo, mats.trim, [3.54, 0.14, 0.16], [0, 2.71, 1.43]);

  // Giant roof palette, paint wells and thumb ring create the studio silhouette.
  const palette = addSphere(THREE, group, geo, mats.signBracket, 0.58, [-1.12, 3.55, 1.42], [1.08, 0.78, 0.16]);
  palette.rotation.z = -0.18;
  addSphere(THREE, group, geo, mats.accent, 0.13, [-1.52, 3.68, 1.58]);
  addSphere(THREE, group, geo, mats.trim, 0.12, [-1.19, 3.82, 1.58]);
  addSphere(THREE, group, geo, mats.wallSide, 0.12, [-0.88, 3.61, 1.58]);
  const thumbRing = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.045, 8, 20), mats.dark);
  thumbRing.position.set(-1.46, 3.39, 1.59);
  group.add(thumbRing);
  palette.userData.decorative = true;

  const brush = new THREE.Group();
  brush.position.set(1.08, 3.72, 1.48);
  brush.rotation.z = -0.48;
  addCylinder(THREE, brush, geo, mats.step, 0.09, 1.62, [0, 0, 0]);
  addCylinder(THREE, brush, geo, mats.trim, 0.15, 0.25, [0, -0.72, 0]);
  addMesh(THREE, brush, geo.unitCone, mats.accent, [0, -1, 0], [0, 0, Math.PI], [0.42, 0.6, 0.42]);
  group.add(brush);
  animated.brush = { object: brush, baseRotation: brush.rotation.z };

  // A paint pot at the front keeps the identity readable when the roof is cropped.
  addCylinder(THREE, group, geo, mats.accent, 0.29, 0.5, [1.35, 0.45, 1.48]);
  addCylinder(THREE, group, geo, mats.dark, 0.31, 0.08, [1.35, 0.72, 1.48]);
  addCylinder(THREE, group, geo, mats.trim, 0.045, 0.9, [1.25, 1.08, 1.49], [0, 0, -0.22]);

  const dropColors = [mats.accent, mats.trim, mats.wallSide];
  [-0.52, 0, 0.52].forEach((x, index) => {
    const drop = addSphere(THREE, group, geo, dropColors[index], 0.1, [x, 2.86 - index * 0.04, 1.63], [0.8, 1.45, 0.55]);
    animated.drops.push({ object: drop, baseY: drop.position.y, baseScaleY: drop.scale.y, phase: index * 1.7 });
  });
}

function buildWatch(THREE, group, geo, mats, animated) {
  addRounded(THREE, group, mats.roof, [3.54, 0.52, 2.82], [0, 2.92, 0], 0.16);
  addRounded(THREE, group, mats.trim, [3.38, 0.22, 2.82], [0, 3.18, 0], 0.08);
  addBox(THREE, group, geo, mats.roof, [3.54, 0.18, 0.52], [0, 2.92, 1.43]);

  // Deep red velvet entry, with layered curtains and gold tiebacks.
  addRounded(THREE, group, mats.dark, [1.2, 1.76, 0.18], [0, 1.04, 1.57], 0.22);
  addRounded(THREE, group, mats.accent, [1.22, 0.36, 0.2], [0, 1.78, 1.68], 0.15);
  [-0.46, 0.46].forEach((x, index) => {
    addRounded(THREE, group, mats.accent, [0.4, 1.42, 0.18], [x, 1.08, 1.68], 0.15, [0, 0, index ? -0.09 : 0.09]);
    addSphere(THREE, group, geo, mats.trim, 0.075, [x * 0.92, 1.12, 1.8], [1.35, 0.7, 0.7]);
  });

  // Film reel and popcorn become physical poster-like emblems beside the entrance.
  const reel = new THREE.Group();
  reel.position.set(-1.16, 1.55, 1.58);
  addFrontDisc(THREE, reel, geo, mats.trim, 0.42, 0.12, [0, 0, 0]);
  [[0, 0.22], [0.19, -0.11], [-0.19, -0.11]].forEach(([x, y]) => {
    addSphere(THREE, reel, geo, mats.dark, 0.09, [x, y, 0.09], [1, 1, 0.35]);
  });
  addFrontDisc(THREE, reel, geo, mats.dark, 0.075, 0.14, [0, 0, 0.12]);
  group.add(reel);
  animated.reels.push({ object: reel, phase: 0 });

  addRounded(THREE, group, mats.trim, [0.78, 0.84, 0.16], [1.16, 1.35, 1.58], 0.12);
  [
    [1.16, 1.42, mats.accent], [1.02, 1.42, mats.wall], [1.3, 1.42, mats.accent],
  ].forEach(([x, y, material]) => addBox(THREE, group, geo, material, [0.16, 0.66, 0.04], [x, y, 1.69]));
  const kernels = [[0.95, 1.82], [1.12, 1.9], [1.28, 1.83], [1.4, 1.91], [1.21, 2]];
  addInstancedSpheres(THREE, group, geo.unitSphere, mats.window, kernels.map(([x, y]) => [x, y, 1.7]), 0.23);
}

function buildListen(THREE, group, geo, mats, animated) {
  addRounded(THREE, group, mats.roof, [3.54, 0.42, 2.82], [0, 2.84, 0], 0.17);
  addRounded(THREE, group, mats.trim, [3.38, 0.17, 2.82], [0, 3.06, 0], 0.08);

  // The giant headphone arch replaces the unrelated tree canopy.
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.14, 12, 34, Math.PI), mats.trim);
  band.castShadow = true;
  band.receiveShadow = true;
  band.position.set(0, 3.56, 0.25);
  group.add(band);
  [-1.22, 1.22].forEach(x => {
    addRounded(THREE, group, mats.trim, [0.38, 0.78, 0.42], [x, 3.54, 0.28], 0.14);
    addRounded(THREE, group, mats.accent, [0.2, 0.52, 0.46], [x, 3.5, 0.52], 0.09);
  });

  // Front speaker stacks have layered cones that gently pulse with the music.
  [-1.18, 1.18].forEach((x, index) => {
    addRounded(THREE, group, mats.dark, [0.82, 1.32, 0.22], [x, 1.46, 1.57], 0.14);
    [1.16, 1.72].forEach((y, coneIndex) => {
      addFrontDisc(THREE, group, geo, mats.trim, coneIndex ? 0.24 : 0.29, 0.1, [x, y, 1.72]);
      const cone = addFrontDisc(THREE, group, geo, mats.accent, coneIndex ? 0.15 : 0.19, 0.13, [x, y, 1.79]);
      animated.cones.push({ object: cone, baseZ: cone.position.z, phase: index * 1.7 + coneIndex * 0.8 });
    });
  });

  // Floating notes keep the pavilion lively without covering the name.
  [[-1.05, 4.58, -0.15, -0.12], [1.08, 4.3, 0.2, 0.12]].forEach((item, index) => {
    const note = new THREE.Group();
    note.position.set(item[0], item[1], item[2]);
    addSphere(THREE, note, geo, mats.accent, 0.14, [0, 0, 0], [1.25, 0.9, 0.75]);
    addBox(THREE, note, geo, mats.accent, [0.09, 0.6, 0.09], [0.13, 0.28, 0]);
    addBox(THREE, note, geo, mats.accent, [0.28, 0.1, 0.09], [0.25, 0.55, 0], [0, 0, -0.28]);
    group.add(note);
    animated.notes.push({ object: note, baseY: item[1], baseRotation: item[3], phase: index * 2.2 });
  });
}

/**
 * Build one selectable activity hut.
 * @param {object} THREE The caller's local Three.js module namespace.
 * @param {'games'|'learn'|'art'|'watch'|'listen'} kind Activity world id.
 * @returns {{group: object, update: (timeSeconds:number, reducedMotion?:boolean)=>void}}
 */
export function createHut(THREE, kind) {
  if (!THREE || typeof THREE.Group !== 'function') throw new TypeError('createHut requires the Three.js module namespace');
  if (!Object.hasOwn(PALETTES, kind)) throw new RangeError(`Unknown hut kind: ${kind}`);

  const palette = PALETTES[kind];
  const geo = shared(THREE);
  const material = materialFactory(THREE);
  const mats = {
    wall: material(palette.wall),
    wallSide: material(palette.wallSide),
    roof: material(palette.roof, { roughness: 0.62 }),
    trim: material(palette.trim, { roughness: 0.56 }),
    accent: material(palette.accent, { roughness: 0.58 }),
    dark: material(palette.dark, { roughness: 0.64 }),
    sign: material(palette.sign, { roughness: 0.58 }),
    signBracket: material(palette.trim, { roughness: 0.5 }),
    doorTrim: material(palette.trim, { roughness: 0.68 }),
    door: material(palette.dark, { roughness: 0.74 }),
    step: material(0xc78953, { roughness: 0.86 }),
    window: material(palette.glass, { roughness: 0.24, metalness: 0.08, emissive: palette.glass, emissiveIntensity: 0.24 }),
    windowBar: material(palette.dark, { roughness: 0.6 }),
  };

  const group = new THREE.Group();
  group.name = `wonderwood-hut-${kind}`;
  group.userData.kind = kind;
  group.userData.selectable = true;

  addRounded(THREE, group, material(0xf2db9e, { roughness: 0.9 }), [3.56, 0.24, 2.82], [0, 0.12, 0], 0.18);
  addFacade(THREE, group, geo, mats);

  const animated = {
    flags: [], drops: [], leaves: [], reels: [], cones: [], notes: [],
    telescope: null, star: null, bell: null, globe: null, brush: null, marquee: null,
  };
  if (kind === 'games') buildGames(THREE, group, geo, mats, animated);
  if (kind === 'learn') buildLearn(THREE, group, geo, mats, animated);
  if (kind === 'art') buildArt(THREE, group, geo, mats, animated);
  if (kind === 'watch') buildWatch(THREE, group, geo, mats, animated);
  if (kind === 'listen') buildListen(THREE, group, geo, mats, animated);
  addRoofSign(THREE, group, geo, mats, palette, kind, animated);

  let meshCount = 0;
  group.traverse(object => {
    if (!object.isMesh) return;
    meshCount += 1;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  group.userData.visibleDrawCalls = meshCount;
  if (meshCount > 85) throw new Error(`${kind} hut exceeds the 85 draw-call target (${meshCount})`);

  function update(timeSeconds, reducedMotion = false) {
    const t = Number.isFinite(timeSeconds) ? timeSeconds : 0;
    animated.flags.forEach(item => {
      item.object.rotation.z = reducedMotion ? 0 : Math.sin(t * 2.2 + item.phase) * 0.09;
      item.object.rotation.y = reducedMotion ? 0 : Math.sin(t * 1.35 + item.phase) * 0.07;
    });
    if (animated.telescope) {
      animated.telescope.rotation.y = reducedMotion ? -0.35 : -0.35 + Math.sin(t * 0.42) * 0.42;
      animated.telescope.rotation.z = reducedMotion ? 0 : Math.sin(t * 0.65) * 0.025;
    }
    animated.drops.forEach(item => {
      const pulse = reducedMotion ? 0 : Math.sin(t * 1.9 + item.phase) * 0.045;
      item.object.position.y = item.baseY + pulse;
      item.object.scale.y = reducedMotion ? item.baseScaleY : item.baseScaleY * (1 + Math.sin(t * 1.9 + item.phase) * 0.08);
    });
    if (animated.star) {
      animated.star.rotation.y = reducedMotion ? 0.2 : t * 0.65;
      const pulse = reducedMotion ? 1 : 1 + Math.sin(t * 2.1) * 0.06;
      animated.star.scale.setScalar(pulse);
    }
    animated.leaves.forEach(item => {
      item.object.position.y = item.baseY + (reducedMotion ? 0 : Math.sin(t * 0.85 + item.phase) * 0.055);
      item.object.rotation.z = reducedMotion ? 0 : Math.sin(t * 0.6 + item.phase) * 0.025;
    });
    animated.reels.forEach(item => {
      item.object.rotation.z = reducedMotion ? 0 : t * 0.48 + item.phase;
    });
    animated.cones.forEach(item => {
      item.object.position.z = item.baseZ + (reducedMotion ? 0 : Math.sin(t * 3.1 + item.phase) * 0.035);
    });
    animated.notes.forEach(item => {
      item.object.position.y = item.baseY + (reducedMotion ? 0 : Math.sin(t * 1.25 + item.phase) * 0.08);
      item.object.rotation.z = reducedMotion ? item.baseRotation : item.baseRotation + Math.sin(t * 0.9 + item.phase) * 0.08;
    });
    if (animated.marquee) {
      animated.marquee.emissiveIntensity = reducedMotion ? 0.85 : 0.88 + Math.sin(t * 2.4) * 0.22;
    }
    if (animated.bell) {
      animated.bell.rotation.z = reducedMotion ? 0 : Math.sin(t * 1.15) * 0.11;
    }
    if (animated.globe) {
      animated.globe.rotation.y = reducedMotion ? 0 : t * 0.22;
    }
    if (animated.brush) {
      animated.brush.object.rotation.z = reducedMotion
        ? animated.brush.baseRotation
        : animated.brush.baseRotation + Math.sin(t * 0.8) * 0.035;
    }
  }

  update(0, true);
  return { group, update };
}
