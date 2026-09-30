/* ===========================================================================
   world.js - the places. Every set is built from primitives and the painted
   textures in tex.js, and every one hands back a list of boxes to bump into.
   ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { mat, tex } from './tex.js';
import { solid, glow } from './avatar.js';
import { rnd, pick, TAU, clamp, lerp } from './core.js';

/* ------------------------------------------------------------ helpers --- */
export function addBox(world, x, y, z, w, h, d) {
  world.colliders.push({
    min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
    max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2)
  });
}
function meshBox(w, h, d, m, x, y, z) {
  const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  me.position.set(x, y, z);
  me.castShadow = true; me.receiveShadow = true;
  return me;
}
function meshCyl(rt, rb, h, m, x, y, z, seg) {
  const me = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 18), m);
  me.position.set(x, y, z);
  me.castShadow = true; me.receiveShadow = true;
  return me;
}

export function newWorld() {
  return {
    group: new THREE.Group(),
    colliders: [],
    spawn: new THREE.Vector3(0, 0, 0),
    spawnYaw: 0,
    groundY: () => 0,
    sky: 'night',
    update: [],
    lights: []
  };
}

/* ------------------------------------------------------------ the sky --- */
export function addSky(world, kind) {
  const scene = world.group;
  let t, fogCol, fogNear, fogFar, amb, sun, sunCol, sunI;
  if (kind === 'night') {
    t = tex('night', { size: 1024 });
    fogCol = 0x0a0c18; fogNear = 18; fogFar = 130;
    amb = 0x3d4a80; sunCol = 0xb8caff; sunI = 0.9;
    sun = new THREE.Vector3(-30, 44, -20);
  } else if (kind === 'storm') {
    t = tex('sky', { size: 1024, stops: [[0, '#14161f'], [0.45, '#2a2d38'], [0.8, '#3c3a3a'], [1, '#22242c']] });
    fogCol = 0x2a2d36; fogNear = 10; fogFar = 95;
    amb = 0x3d4250; sunCol = 0xb9c2d4; sunI = 0.5;
    sun = new THREE.Vector3(10, 40, -30);
  } else if (kind === 'dawn') {
    t = tex('sky', { size: 1024, stops: [[0, '#1a2550'], [0.42, '#8a6d8a'], [0.74, '#e0955c'], [1, '#f6d9a8']] });
    fogCol = 0xc79a72; fogNear = 22; fogFar = 170;
    amb = 0x6a5a6a; sunCol = 0xffc489; sunI = 1.5;
    sun = new THREE.Vector3(-46, 18, -40);
  } else if (kind === 'cave') {
    t = null;
    fogCol = 0x0a2418; fogNear = 8; fogFar = 75;
    amb = 0x2a6a4a; sunCol = 0x8fffd0; sunI = 0.55;
    sun = new THREE.Vector3(0, 30, 0);
  } else if (kind === 'indoor') {
    t = null;
    fogCol = 0x181422; fogNear = 14; fogFar = 95;
    amb = 0x554a68; sunCol = 0xffd9a0; sunI = 0.5;
    sun = new THREE.Vector3(12, 30, 8);
  } else { // day
    t = tex('sky', { size: 1024, stops: [[0, '#274b8c'], [0.5, '#7fa8d4'], [0.82, '#bcd0e0'], [1, '#dfe4d8']] });
    fogCol = 0xbdcbd8; fogNear = 34; fogFar = 240;
    amb = 0x8fa2b8; sunCol = 0xfff0d0; sunI = 2.0;
    sun = new THREE.Vector3(40, 60, 20);
  }
  if (t) {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(420, 32, 20),
      new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false })
    );
    dome.name = 'skydome';
    scene.add(dome);
  }
  world.fog = new THREE.Fog(fogCol, fogNear, fogFar);
  world.bg = new THREE.Color(fogCol);
  const a = new THREE.AmbientLight(amb, kind === 'day' || kind === 'dawn' ? 1.6 : 1.9);
  scene.add(a);
  const hemi = new THREE.HemisphereLight(amb, 0x2a241c, 0.9);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(sunCol, sunI);
  dir.position.copy(sun);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  const d = 48;
  dir.shadow.camera.left = -d; dir.shadow.camera.right = d;
  dir.shadow.camera.top = d; dir.shadow.camera.bottom = -d;
  dir.shadow.camera.far = 200;
  dir.shadow.bias = -0.0009;
  scene.add(dir);
  scene.add(dir.target);
  world.sun = dir;
  world.sky = kind;
  return world;
}

/* ----------------------------------------------------------- the floor -- */
export function addGround(world, kind, size) {
  size = size || 120;
  let m;
  if (kind === 'grass') m = mat('grass', { size: 512, repeat: [size / 6, size / 6], roughness: 1, bumpScale: 0.5 });
  else if (kind === 'dirt') m = mat('dirt', { size: 512, repeat: [size / 6, size / 6], roughness: 1, bumpScale: 0.6 });
  else if (kind === 'wood') m = mat('wood', { size: 512, repeat: [size / 4, size / 4], roughness: 0.75, bumpScale: 0.25 });
  else m = mat('flag', { size: 512, repeat: [size / 5, size / 5], roughness: 0.9, bumpScale: 0.4 });
  const g = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), m);
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  g.name = 'ground';
  world.group.add(g);
  return g;
}

/* ------------------------------------------------------------- torches -- */
export function addTorch(world, x, y, z, col) {
  const g = new THREE.Group();
  const bracket = meshCyl(0.03, 0.05, 0.3, solid(0x2a2a2e, 0.6, 0.5), 0, 0, 0, 8);
  g.add(bracket);
  const bowl = meshCyl(0.1, 0.05, 0.12, solid(0x3a2a1a, 0.7, 0.3), 0, 0.2, 0, 10);
  g.add(bowl);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.28, 8),
    new THREE.MeshBasicMaterial({ color: col || 0xffb347, fog: false }));
  flame.position.y = 0.38;
  g.add(flame);
  const light = new THREE.PointLight(col || 0xffa843, 11, 20, 2);
  light.position.y = 0.42;
  g.add(light);
  g.position.set(x, y, z);
  world.group.add(g);
  const ph = Math.random() * 10;
  world.update.push((dt, t) => {
    const f = 1 + Math.sin(t * 11 + ph) * 0.13 + Math.sin(t * 27 + ph) * 0.06;
    flame.scale.set(1 + (f - 1) * 0.5, f, 1 + (f - 1) * 0.5);
    light.intensity = 9.5 * f;
  });
  return g;
}

/* ------------------------------------------------- a stone hall or room -- */
export function addHall(world, o) {
  o = o || {};
  const W = o.w || 24, D = o.d || 34, H = o.h || 11;
  const wallM = mat('stone', { size: 512, repeat: [W / 5, H / 5], seed: o.seed || 7,
    dark: o.dark, light: o.light, roughness: 0.95, bumpScale: 0.55 });
  const wallM2 = mat('stone', { size: 512, repeat: [D / 5, H / 5], seed: (o.seed || 7) + 3,
    dark: o.dark, light: o.light, roughness: 0.95, bumpScale: 0.55 });
  const ceilM = mat('stone', { size: 512, repeat: [W / 6, D / 6], seed: (o.seed || 7) + 11,
    dark: [34, 32, 38], light: [70, 66, 70], roughness: 1, bumpScale: 0.4 });

  // floor
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
    mat('flag', { size: 512, repeat: [W / 4, D / 4], seed: (o.seed || 7) + 5, bumpScale: 0.45 }));
  fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true;
  world.group.add(fl);

  // walls
  const mk = (w, h, m, x, y, z, ry) => {
    const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    me.position.set(x, y, z); me.rotation.y = ry;
    me.receiveShadow = true;
    world.group.add(me);
    return me;
  };
  mk(W, H, wallM, 0, H / 2, -D / 2, 0);
  mk(W, H, wallM, 0, H / 2, D / 2, Math.PI);
  mk(D, H, wallM2, -W / 2, H / 2, 0, Math.PI / 2);
  mk(D, H, wallM2, W / 2, H / 2, 0, -Math.PI / 2);
  addBox(world, 0, H / 2, -D / 2 - 0.5, W + 4, H, 1);
  addBox(world, 0, H / 2, D / 2 + 0.5, W + 4, H, 1);
  addBox(world, -W / 2 - 0.5, H / 2, 0, 1, H, D + 4);
  addBox(world, W / 2 + 0.5, H / 2, 0, 1, H, D + 4);

  if (o.ceiling !== false) {
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(W, D), ceilM);
    ce.rotation.x = Math.PI / 2; ce.position.y = H;
    world.group.add(ce);
    // ribbed arches
    const rib = solid(0x3a3640, 0.9);
    for (let i = -Math.floor(D / 6); i <= Math.floor(D / 6); i++) {
      const z = i * 6;
      const arch = new THREE.Mesh(new THREE.TorusGeometry(W / 2, 0.22, 6, 20, Math.PI), rib);
      arch.position.set(0, H - 0.6, z);
      arch.rotation.y = Math.PI / 2;
      arch.castShadow = true;
      world.group.add(arch);
    }
  }

  // columns down both sides
  if (o.columns !== false) {
    const colM = mat('stone', { size: 256, repeat: [2, 4], seed: (o.seed || 7) + 21, bumpScale: 0.4 });
    for (let i = -Math.floor(D / 8); i <= Math.floor(D / 8); i++) {
      [-1, 1].forEach((s) => {
        const x = s * (W / 2 - 1.3), z = i * 8;
        const c = meshCyl(0.55, 0.65, H - 0.6, colM, x, (H - 0.6) / 2, z, 14);
        world.group.add(c);
        world.group.add(meshCyl(0.85, 0.7, 0.4, colM, x, H - 0.8, z, 14));
        world.group.add(meshCyl(0.7, 0.85, 0.4, colM, x, 0.2, z, 14));
        addBox(world, x, 2, z, 1.4, 4, 1.4);
      });
    }
  }

  // arched windows with night behind them
  if (o.windows !== false) {
    const glass = new THREE.MeshStandardMaterial({
      color: o.windowCol || 0x2a3f7a, emissive: o.windowCol || 0x24365f,
      emissiveIntensity: o.windowGlow === undefined ? 0.5 : o.windowGlow,
      roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.85
    });
    const frame = solid(0x231f1a, 0.8);
    for (let i = -2; i <= 2; i++) {
      [-1, 1].forEach((s) => {
        const x = s * (W / 2 - 0.12), z = i * (D / 5.4);
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3.6), glass);
        gl.position.set(x, 5.4, z); gl.rotation.y = -s * Math.PI / 2;
        world.group.add(gl);
        const top = new THREE.Mesh(new THREE.CircleGeometry(0.85, 16, 0, Math.PI), glass);
        top.position.set(x, 7.2, z); top.rotation.y = -s * Math.PI / 2;
        world.group.add(top);
        // mullions
        for (let k = -1; k <= 1; k++) {
          const b = meshBox(0.07, 4.2, 0.07, frame, x - s * 0.06, 5.6, z + k * 0.55);
          world.group.add(b);
        }
      });
    }
  }

  // torches on the pillars
  if (o.torches !== false) {
    for (let i = -Math.floor(D / 10); i <= Math.floor(D / 10); i++) {
      [-1, 1].forEach((s) => addTorch(world, s * (W / 2 - 0.55), 4.2, i * 10 + 3, o.torchCol));
    }
  }

  // hanging candle rings
  if (o.chandeliers !== false) {
    for (let i = -1; i <= 1; i++) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 6, 26), solid(0x4a3a20, 0.5, 0.6));
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU;
        const c = meshCyl(0.035, 0.04, 0.3, solid(0xe8e0c8, 0.9), Math.cos(a) * 1.5, 0.18, Math.sin(a) * 1.5, 7);
        g.add(c);
        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xffd98a, fog: false }));
        fl.position.set(Math.cos(a) * 1.5, 0.36, Math.sin(a) * 1.5);
        g.add(fl);
      }
      const l = new THREE.PointLight(0xffd08a, 26, 34, 2);
      l.position.y = 0.4;
      g.add(l);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU;
        const ch = meshCyl(0.012, 0.012, H - 2.2, solid(0x333, 0.6, 0.6), Math.cos(a) * 1.2, (H - 2.2) / 2 + 0.2, Math.sin(a) * 1.2, 5);
        g.add(ch);
      }
      g.position.set(0, H - 3.4, i * (D / 3.2));
      world.group.add(g);
      const ph = i * 2;
      world.update.push((dt, t) => { g.rotation.y = Math.sin(t * 0.25 + ph) * 0.05; g.position.y = H - 3.4 + Math.sin(t * 0.6 + ph) * 0.03; });
    }
  }
  world.roomW = W; world.roomD = D; world.roomH = H;
  return world;
}

/* ------------------------------------------------------ a classroom kit -- */
export function addDesks(world, o) {
  o = o || {};
  const rows = o.rows || 3, cols = o.cols || 4;
  const woodM = mat('wood', { size: 256, repeat: [2, 1], roughness: 0.6, bumpScale: 0.2 });
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * 2.6;
      const z = (o.z0 || 2) + r * 3.1;
      const top = meshBox(2.1, 0.09, 0.85, woodM, x, 0.78, z);
      world.group.add(top);
      [-0.9, 0.9].forEach((dx) => [-0.32, 0.32].forEach((dz) => {
        world.group.add(meshBox(0.09, 0.78, 0.09, solid(0x2a1d12, 0.8), x + dx, 0.39, z + dz));
      }));
      addBox(world, x, 0.5, z, 2.1, 1, 0.9);
      // a bench behind it
      const b = meshBox(2.0, 0.08, 0.34, woodM, x, 0.46, z + 0.95);
      world.group.add(b);
      addBox(world, x, 0.3, z + 0.95, 2, 0.6, 0.4);
    }
  }
}
export function addBlackboard(world, z, text) {
  const board = meshBox(7.4, 3.1, 0.14, solid(0x14201a, 0.95), 0, 3.1, z);
  world.group.add(board);
  const frame = meshBox(7.8, 3.5, 0.1, mat('wood', { size: 256, repeat: [4, 2] }), 0, 3.1, z - 0.06);
  world.group.add(frame);
  if (text) {
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 430;
    const x = cv.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,0)'; x.fillRect(0, 0, 1024, 430);
    x.strokeStyle = 'rgba(236,232,220,.9)'; x.fillStyle = 'rgba(236,232,220,.92)';
    x.font = '70px Georgia, serif'; x.textAlign = 'center';
    const lines = String(text).split('\n');
    lines.forEach((l, i) => x.fillText(l, 512, 130 + i * 92));
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    const chalk = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.94),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, fog: true }));
    chalk.position.set(0, 3.1, z + 0.08);
    world.group.add(chalk);
  }
  addBox(world, 0, 2, z - 0.2, 8, 4, 0.6);
}

/* ----------------------------------------------------- the great castle -- */
export function buildCastleHall(world, o) {
  o = o || {};
  addSky(world, 'indoor');
  addHall(world, Object.assign({ w: 26, d: 40, h: 13 }, o));
  // four long tables under the candles
  const woodM = mat('wood', { size: 512, repeat: [8, 1], roughness: 0.55, bumpScale: 0.2 });
  for (let i = -1; i <= 1; i += 2) {
    const x = i * 5.4;
    const t = meshBox(2.4, 0.12, 24, woodM, x, 0.86, 2);
    world.group.add(t);
    addBox(world, x, 0.6, 2, 2.4, 1.2, 24);
    for (let z = -9; z <= 13; z += 2.2) {
      [-1.6, 1.6].forEach((dx) => {
        const b = meshBox(0.7, 0.09, 1.6, woodM, x + dx, 0.5, z);
        world.group.add(b);
      });
    }
    // plates and goblets
    for (let z = -9; z <= 13; z += 2.2) {
      const p = meshCyl(0.18, 0.16, 0.03, solid(0xd8d2c4, 0.4, 0.2), x - 0.5, 0.94, z, 14);
      world.group.add(p);
      const gob = meshCyl(0.07, 0.05, 0.16, solid(0xb08d57, 0.35, 0.8), x + 0.5, 1.0, z, 10);
      world.group.add(gob);
    }
  }
  // the staff table on a dais
  const dais = meshBox(20, 0.5, 3.4, mat('flag', { size: 256, repeat: [6, 1] }), 0, 0.25, -16);
  world.group.add(dais);
  addBox(world, 0, 0.25, -16, 20, 0.5, 3.4);
  const head = meshBox(16, 0.14, 1.5, woodM, 0, 1.3, -16.6);
  world.group.add(head);
  addBox(world, 0, 0.9, -16.6, 16, 1.8, 1.6);
  world.spawn.set(0, 0, 14);
  world.spawnYaw = Math.PI;
  return world;
}

/* ------------------------------------------------------------ a corridor */
export function buildCorridor(world, o) {
  o = o || {};
  addSky(world, 'indoor');
  const L = o.length || 60;
  addHall(world, { w: 8, d: L, h: 7, columns: false, chandeliers: false, windows: true, seed: 31, torchCol: o.torchCol });
  // suits of armour along one side
  const steel = solid(0x6b7076, 0.35, 0.85);
  for (let i = -Math.floor(L / 10); i <= Math.floor(L / 10); i++) {
    const x = (i % 2 ? -1 : 1) * 3.2, z = i * 9;
    const g = new THREE.Group();
    g.add(meshCyl(0.28, 0.32, 0.9, steel, 0, 1.1, 0, 12));
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), steel);
    helm.position.set(0, 1.75, 0);
    g.add(helm);
    g.add(meshCyl(0.23, 0.25, 0.18, steel, 0, 1.95, 0, 12));
    [-1, 1].forEach((s) => g.add(meshCyl(0.09, 0.08, 0.8, steel, s * 0.33, 1.15, 0, 10)));
    [-1, 1].forEach((s) => g.add(meshCyl(0.11, 0.1, 0.65, steel, s * 0.15, 0.33, 0, 10)));
    g.add(meshCyl(0.02, 0.02, 1.8, steel, 0.45, 0.9, 0, 8));
    const spear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 8), steel);
    spear.position.set(0.45, 1.9, 0);
    g.add(spear);
    g.position.set(x, 0, z);
    g.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    world.group.add(g);
    addBox(world, x, 1, z, 0.9, 2, 0.9);
  }
  // portraits that watch you go past
  for (let i = -Math.floor(L / 12); i <= Math.floor(L / 12); i++) {
    [-1, 1].forEach((s) => {
      const x = s * 3.92, z = i * 11 + 4;
      const fr = meshBox(0.1, 1.7, 1.3, solid(0x6b4a20, 0.5, 0.35), x, 3.2, z);
      world.group.add(fr);
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 168;
      const cx2 = cv.getContext('2d');
      cx2.fillStyle = '#2a2018'; cx2.fillRect(0, 0, 128, 168);
      cx2.fillStyle = 'rgba(200,170,120,.5)';
      cx2.beginPath(); cx2.arc(64, 70, 30, 0, 7); cx2.fill();
      cx2.fillStyle = 'rgba(60,40,70,.7)';
      cx2.beginPath(); cx2.ellipse(64, 150, 44, 54, 0, 0, 7); cx2.fill();
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
      pic.position.set(x - s * 0.06, 3.2, z);
      pic.rotation.y = -s * Math.PI / 2;
      world.group.add(pic);
    });
  }
  world.spawn.set(0, 0, L / 2 - 4);
  world.spawnYaw = Math.PI;
  return world;
}

/* --------------------------------------------------------- the grounds -- */
export function buildGrounds(world, o) {
  o = o || {};
  addSky(world, o.sky || 'night');
  addGround(world, 'grass', 260);
  // the castle itself, off in the distance
  const stoneM = mat('stone', { size: 512, repeat: [6, 8], seed: 3, bumpScale: 0.5 });
  const castle = new THREE.Group();
  const keep = meshBox(34, 26, 22, stoneM, 0, 13, 0);
  castle.add(keep);
  [[-20, 0], [20, 0], [-14, -14], [14, -14]].forEach(([x, z], i) => {
    const t = meshCyl(4.2, 5, 34 + i * 4, stoneM, x, (34 + i * 4) / 2, z, 16);
    castle.add(t);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 9, 16), solid(0x2a3040, 0.85));
    roof.position.set(x, 34 + i * 4 + 4.5, z);
    castle.add(roof);
  });
  // lit windows
  const lit = new THREE.MeshBasicMaterial({ color: 0xffca72, fog: true });
  for (let i = 0; i < 70; i++) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.4), lit);
    w.position.set(rnd(-16, 16), rnd(4, 24), 11.05);
    castle.add(w);
  }
  castle.position.set(o.castleAt ? o.castleAt[0] : -60, 0, o.castleAt ? o.castleAt[1] : -88);
  castle.rotation.y = 0.5;
  castle.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  world.group.add(castle);
  // a scatter of trees around the edge
  addTrees(world, o.trees === undefined ? 40 : o.trees, 118, 62);
  // the lake
  if (o.lake !== false) {
    const water = new THREE.Mesh(new THREE.CircleGeometry(48, 40), new THREE.MeshStandardMaterial({
      color: 0x0d2438, roughness: 0.12, metalness: 0.6, transparent: true, opacity: 0.94
    }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(78, 0.05, -40);
    world.group.add(water);
    world.update.push((dt, t) => { water.position.y = 0.05 + Math.sin(t * 0.7) * 0.02; });
  }
  world.spawn.set(0, 0, 12);
  return world;
}

export function addTrees(world, n, radius, inner) {
  const trunk = mat('wood', { size: 256, repeat: [1, 3], dark: [34, 24, 14], light: [72, 54, 32], roughness: 1 });
  const leafCols = [0x1d3a1c, 0x24491f, 0x2f5528, 0x16301a];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const r = inner + Math.random() * (radius - inner);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = rnd(6, 13);
    const g = new THREE.Group();
    g.add(meshCyl(0.26, 0.55, h, trunk, 0, h / 2, 0, 9));
    const lc = solid(pick(leafCols), 1);
    const blobs = 3 + (Math.random() * 3 | 0);
    for (let k = 0; k < blobs; k++) {
      const s = rnd(1.5, 3.2);
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), lc);
      b.position.set(rnd(-1.4, 1.4), h * 0.72 + rnd(-0.6, 2.4), rnd(-1.4, 1.4));
      b.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3));
      b.castShadow = true;
      g.add(b);
    }
    g.position.set(x, 0, z);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    world.group.add(g);
    addBox(world, x, 3, z, 1.1, 6, 1.1);
  }
}

/* ------------------------------------------------------------ the woods -- */
export function buildForest(world, o) {
  o = o || {};
  addSky(world, o.sky || 'night');
  addGround(world, 'dirt', 200);
  world.fog.near = 6; world.fog.far = 58;
  const trunk = mat('wood', { size: 256, repeat: [1, 4], dark: [26, 18, 12], light: [58, 42, 26], roughness: 1 });
  const leaf = solid(0x14251a, 1);
  const n = o.trees || 150;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, r = (o.inner || 7) + Math.random() * 78;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = rnd(9, 20);
    const g = new THREE.Group();
    g.add(meshCyl(0.2, rnd(0.5, 0.9), h, trunk, 0, h / 2, 0, 8));
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(1.8, 3.4), 0), leaf);
      b.position.set(rnd(-1, 1), h * 0.8 + k * 1.5, rnd(-1, 1));
      g.add(b);
    }
    // a bare branch or two
    for (let k = 0; k < 2; k++) {
      const br = meshCyl(0.04, 0.09, rnd(1.5, 3), trunk, 0, h * rnd(0.4, 0.7), 0, 6);
      br.rotation.z = rnd(-1.2, 1.2); br.rotation.x = rnd(-1.2, 1.2);
      g.add(br);
    }
    g.position.set(x, 0, z);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    world.group.add(g);
    addBox(world, x, 3, z, 1.0, 6, 1.0);
  }
  // mushrooms that glow, so the floor is not pitch black
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * TAU, r = (o.inner || 6) + Math.random() * 60;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.12, 0.26), 10, 7, 0, TAU, 0, Math.PI / 2),
      glow(pick([0x5fe0c0, 0x7fa8ff, 0xc08fff]), 1.6));
    cap.position.set(x, rnd(0.1, 0.3), z);
    world.group.add(cap);
    const st = meshCyl(0.035, 0.05, 0.22, solid(0xd8d0c0, 0.9), x, 0.11, z, 6);
    world.group.add(st);
  }
  // mist
  addMist(world, 60, 70);
  world.spawn.set(0, 0, 0);
  return world;
}

let DOT = null;
function dotTexture() {
  if (DOT) return DOT;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  DOT = new THREE.CanvasTexture(c);
  return DOT;
}

export function addMist(world, count, radius) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU, r = Math.random() * radius;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = rnd(0.3, 3.5);
    pos[i * 3 + 2] = Math.sin(a) * r;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    color: 0xbcc8d8, size: 3.2, transparent: true, opacity: 0.13,
    depthWrite: false, sizeAttenuation: true, map: dotTexture(),
    blending: THREE.AdditiveBlending, fog: true
  });
  const p = new THREE.Points(g, m);
  world.group.add(p);
  world.update.push((dt, t) => { p.rotation.y = t * 0.012; });
  return p;
}

/* ---------------------------------------------------- floating dust motes */
export function addMotes(world, count, box, col) {
  const g = new THREE.BufferGeometry();
  const n = count || 220;
  const pos = new Float32Array(n * 3);
  const b = box || [30, 10, 30];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = rnd(-b[0] / 2, b[0] / 2);
    pos[i * 3 + 1] = rnd(0.4, b[1]);
    pos[i * 3 + 2] = rnd(-b[2] / 2, b[2] / 2);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({
    color: col || 0xffd9a0, size: 0.09, transparent: true, opacity: 0.55, depthWrite: false,
    map: dotTexture(), blending: THREE.AdditiveBlending
  }));
  world.group.add(p);
  const arr = g.attributes.position.array;
  world.update.push((dt, t) => {
    for (let i = 0; i < n; i++) {
      arr[i * 3 + 1] += dt * (0.1 + (i % 7) * 0.02);
      arr[i * 3] += Math.sin(t * 0.4 + i) * dt * 0.05;
      if (arr[i * 3 + 1] > b[1]) arr[i * 3 + 1] = 0.3;
    }
    g.attributes.position.needsUpdate = true;
  });
  return p;
}

/* ------------------------------------------------------------ the pitch -- */
export function buildPitch(world, o) {
  o = o || {};
  addSky(world, o.sky || 'day');
  addGround(world, 'grass', 300);
  const hoopM = solid(0xc9a227, 0.35, 0.85);
  const poleM = solid(0x6b5a3a, 0.7);
  world.hoops = [];
  [[0, -62, 1], [0, 62, -1]].forEach(([x0, z0, dir], side) => {
    [-8, 0, 8].forEach((dx, i) => {
      const h = 14 + (i === 1 ? 4 : 0);
      const pole = meshCyl(0.22, 0.3, h, poleM, x0 + dx, h / 2, z0, 12);
      world.group.add(pole);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.19, 10, 30), hoopM);
      ring.position.set(x0 + dx, h + 2, z0);
      ring.castShadow = true;
      world.group.add(ring);
      world.hoops.push({ pos: ring.position.clone(), side, mesh: ring });
    });
  });
  // stands
  const standM = mat('wood', { size: 256, repeat: [12, 2], roughness: 0.8 });
  const bannerCols = [0x7a1220, 0x0f3d24, 0x16305e, 0x6e5a12];
  for (let s = 0; s < 2; s++) {
    const x = s ? 44 : -44;
    for (let tier = 0; tier < 5; tier++) {
      const b = meshBox(4, 1.2, 108, standM, x + (s ? tier * 2.2 : -tier * 2.2), 2 + tier * 1.8, 0);
      world.group.add(b);
    }
    addBox(world, x + (s ? 5 : -5), 6, 0, 14, 12, 110);
    for (let i = -4; i <= 4; i++) {
      const g = new THREE.Group();
      const pole = meshCyl(0.12, 0.12, 16, poleM, 0, 8, 0, 8);
      g.add(pole);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(3, 6),
        new THREE.MeshStandardMaterial({ color: bannerCols[(i + 4) % 4], roughness: 0.95, side: THREE.DoubleSide }));
      cloth.position.set(1.6, 12, 0);
      g.add(cloth);
      g.position.set(x + (s ? 12 : -12), 0, i * 12);
      g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      world.group.add(g);
      const ph = i;
      world.update.push((dt, t) => { cloth.rotation.y = Math.sin(t * 1.4 + ph) * 0.22; });
    }
  }
  // a crowd of dots in the stands
  const crowdGeo = new THREE.BufferGeometry();
  const N = 1400, cp = new Float32Array(N * 3), cc = new Float32Array(N * 3);
  const cols = [[0.48, 0.07, 0.12], [0.06, 0.24, 0.14], [0.09, 0.19, 0.37], [0.43, 0.35, 0.07]];
  for (let i = 0; i < N; i++) {
    const s = i % 2 ? 1 : -1;
    cp[i * 3] = s * rnd(44, 54);
    cp[i * 3 + 1] = rnd(3, 11);
    cp[i * 3 + 2] = rnd(-52, 52);
    const c = cols[i % 4];
    cc[i * 3] = c[0]; cc[i * 3 + 1] = c[1]; cc[i * 3 + 2] = c[2];
  }
  crowdGeo.setAttribute('position', new THREE.BufferAttribute(cp, 3));
  crowdGeo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  const crowd = new THREE.Points(crowdGeo, new THREE.PointsMaterial({ size: 0.7, vertexColors: true }));
  world.group.add(crowd);
  const base = cp.slice();
  world.update.push((dt, t) => {
    const a = crowdGeo.attributes.position.array;
    for (let i = 0; i < N; i += 3) a[i * 3 + 1] = base[i * 3 + 1] + Math.abs(Math.sin(t * 2 + i)) * 0.25;
    crowdGeo.attributes.position.needsUpdate = true;
  });
  world.spawn.set(0, 0, 0);
  return world;
}

/* ------------------------------------------------- the chamber below it -- */
export function buildChamber(world) {
  addSky(world, 'cave');
  const stoneM = mat('stone', { size: 512, repeat: [6, 4], seed: 55, dark: [22, 34, 28], light: [56, 78, 62], bumpScale: 0.7 });
  // long flooded hall
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(26, 90), mat('flag', { size: 512, repeat: [6, 20], seed: 61, dark: [20, 30, 26], light: [52, 70, 58] }));
  fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true;
  world.group.add(fl);
  [[-13, Math.PI / 2], [13, -Math.PI / 2]].forEach(([x, ry]) => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(90, 16), stoneM);
    w.position.set(x, 8, 0); w.rotation.y = ry; w.receiveShadow = true;
    world.group.add(w);
  });
  addBox(world, -14, 8, 0, 2, 16, 92);
  addBox(world, 14, 8, 0, 2, 16, 92);
  addBox(world, 0, 8, -46, 28, 16, 2);
  addBox(world, 0, 8, 46, 28, 16, 2);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(26, 16), stoneM);
  back.position.set(0, 8, -45); world.group.add(back);
  const ce = new THREE.Mesh(new THREE.PlaneGeometry(26, 90), stoneM);
  ce.rotation.x = Math.PI / 2; ce.position.y = 16;
  world.group.add(ce);

  // snake-headed pillars
  for (let i = -4; i <= 4; i++) {
    [-1, 1].forEach((s) => {
      const x = s * 8.5, z = i * 9;
      const c = meshCyl(0.8, 1.0, 14, stoneM, x, 7, z, 14);
      world.group.add(c);
      addBox(world, x, 4, z, 2, 8, 2);
      // a carved head near the top
      const hd = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 10), stoneM);
      hd.scale.set(1, 0.8, 1.5);
      hd.position.set(x, 13.4, z + s * 0.4);
      world.group.add(hd);
      [-1, 1].forEach((e) => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), glow(0x7dff9f, 2.2));
        eye.position.set(x + e * 0.35, 13.6, z + s * 1.5);
        world.group.add(eye);
      });
      const l = new THREE.PointLight(0x5fffa8, 9, 26, 2);
      l.position.set(x, 12.5, z);
      world.group.add(l);
    });
  }
  // shallow water down the middle
  const water = new THREE.Mesh(new THREE.PlaneGeometry(9, 88), new THREE.MeshStandardMaterial({
    color: 0x0b2a24, roughness: 0.08, metalness: 0.8, transparent: true, opacity: 0.85
  }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.04;
  world.group.add(water);
  world.update.push((dt, t) => { water.position.y = 0.04 + Math.sin(t * 1.2) * 0.012; });

  // a vast stone face at the far end, mouth open
  const face = new THREE.Group();
  const f = new THREE.Mesh(new THREE.SphereGeometry(6.2, 22, 16), stoneM);
  f.scale.set(1, 1.25, 0.55);
  face.add(f);
  const beard = new THREE.Mesh(new THREE.ConeGeometry(3.4, 7, 14), stoneM);
  beard.position.set(0, -6.4, 1.4); beard.rotation.x = 0.2;
  face.add(beard);
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(1.9, 20), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  mouth.position.set(0, -1.6, 3.42);
  face.add(mouth);
  [-1, 1].forEach((s) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 10), solid(0x18251f, 0.9));
    e.position.set(s * 2.4, 2.1, 3.1); e.scale.z = 0.4;
    face.add(e);
  });
  face.position.set(0, 9, -43.5);
  face.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  world.group.add(face);
  world.chamberMouth = new THREE.Vector3(0, 7.4, -40);
  addMist(world, 40, 26);
  world.spawn.set(0, 0, 38);
  world.spawnYaw = Math.PI;
  return world;
}

/* ------------------------------------------------- the shack on the hill */
export function buildShack(world) {
  addSky(world, 'indoor');
  const woodM = mat('wood', { size: 512, repeat: [4, 3], dark: [38, 26, 16], light: [92, 68, 40], roughness: 1, bumpScale: 0.4 });
  const W = 13, D = 15, H = 5.4;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat('wood', { size: 512, repeat: [5, 6], roughness: 1 }));
  fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true;
  world.group.add(fl);
  const wall = (w, h, x, y, z, ry) => {
    const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), woodM);
    me.position.set(x, y, z); me.rotation.y = ry; me.receiveShadow = true;
    world.group.add(me);
  };
  wall(W, H, 0, H / 2, -D / 2, 0); wall(W, H, 0, H / 2, D / 2, Math.PI);
  wall(D, H, -W / 2, H / 2, 0, Math.PI / 2); wall(D, H, W / 2, H / 2, 0, -Math.PI / 2);
  addBox(world, 0, H / 2, -D / 2 - 0.4, W, H, 1);
  addBox(world, 0, H / 2, D / 2 + 0.4, W, H, 1);
  addBox(world, -W / 2 - 0.4, H / 2, 0, 1, H, D);
  addBox(world, W / 2 + 0.4, H / 2, 0, 1, H, D);
  const ce = new THREE.Mesh(new THREE.PlaneGeometry(W, D), woodM);
  ce.rotation.x = Math.PI / 2; ce.position.y = H;
  world.group.add(ce);
  // boarded window with moonlight coming through the gaps
  for (let i = 0; i < 6; i++) {
    const b = meshBox(3.4, 0.28, 0.1, woodM, -W / 2 + 0.12, 2.2 + i * 0.36, 2);
    b.rotation.y = Math.PI / 2; b.rotation.z = rnd(-0.1, 0.1);
    world.group.add(b);
  }
  const moon = new THREE.SpotLight(0xbfd0ff, 26, 26, 0.6, 0.6, 1.6);
  moon.position.set(-9, 5, 2);
  moon.target.position.set(2, 0, 0);
  world.group.add(moon); world.group.add(moon.target);
  world.moonSpot = moon;
  // a wrecked four-poster bed
  const bed = new THREE.Group();
  bed.add(meshBox(3.1, 0.5, 4.4, woodM, 0, 0.55, 0));
  bed.add(meshBox(2.9, 0.34, 4.2, solid(0x5a4a44, 1), 0, 0.92, 0));
  [[-1.4, -2.1], [1.4, -2.1], [-1.4, 2.1], [1.4, 2.1]].forEach(([x, z], i) => {
    const p = meshCyl(0.1, 0.13, 3.4 - (i % 2) * 0.6, woodM, x, 1.7, z, 8);
    p.rotation.z = (i === 2 ? 0.28 : 0);
    bed.add(p);
  });
  bed.position.set(3.4, 0, -3);
  bed.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  world.group.add(bed);
  addBox(world, 3.4, 0.6, -3, 3.2, 1.2, 4.5);
  // broken chairs and a lot of dust
  for (let i = 0; i < 5; i++) {
    const c = meshBox(0.7, 0.1, 0.7, woodM, rnd(-5, 5), 0.08, rnd(-6, 6));
    c.rotation.set(rnd(0, 1), rnd(0, 3), rnd(0, 1));
    world.group.add(c);
  }
  addMotes(world, 300, [13, 5, 15], 0xc8d4ff);
  world.spawn.set(-3.5, 0, 5.5);
  world.spawnYaw = -0.6;
  return world;
}

/* ---------------------------------------------------- the aunt's house --- */
export function buildHouse(world) {
  addSky(world, 'indoor');
  const paperM = mat('cloth', { size: 256, rgb: [176, 150, 116], repeat: [4, 2], roughness: 1 });
  const carpet = mat('cloth', { size: 256, rgb: [96, 54, 48], repeat: [6, 6], roughness: 1 });
  const W = 14, D = 12, H = 4.2;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), carpet);
  fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true;
  world.group.add(fl);
  [[0, -D / 2, 0], [0, D / 2, Math.PI]].forEach(([x, z, ry]) => {
    const me = new THREE.Mesh(new THREE.PlaneGeometry(W, H), paperM);
    me.position.set(x, H / 2, z); me.rotation.y = ry; me.receiveShadow = true;
    world.group.add(me);
  });
  [[-W / 2, Math.PI / 2], [W / 2, -Math.PI / 2]].forEach(([x, ry]) => {
    const me = new THREE.Mesh(new THREE.PlaneGeometry(D, H), paperM);
    me.position.set(x, H / 2, 0); me.rotation.y = ry; me.receiveShadow = true;
    world.group.add(me);
  });
  addBox(world, 0, H / 2, -D / 2 - 0.4, W, H, 1);
  addBox(world, 0, H / 2, D / 2 + 0.4, W, H, 1);
  addBox(world, -W / 2 - 0.4, H / 2, 0, 1, H, D);
  addBox(world, W / 2 + 0.4, H / 2, 0, 1, H, D);
  const ce = new THREE.Mesh(new THREE.PlaneGeometry(W, D), solid(0xe8e2d4, 1));
  ce.rotation.x = Math.PI / 2; ce.position.y = H;
  world.group.add(ce);
  // dining table, laid for a dinner that will not finish
  const woodM = mat('wood', { size: 256, repeat: [3, 1], dark: [50, 28, 14], light: [110, 70, 36], roughness: 0.45 });
  const table = meshBox(4.6, 0.12, 2.2, woodM, 0, 0.82, 0);
  world.group.add(table);
  [[-2, -0.8], [2, -0.8], [-2, 0.8], [2, 0.8]].forEach(([x, z]) => {
    world.group.add(meshBox(0.13, 0.82, 0.13, woodM, x, 0.41, z));
  });
  addBox(world, 0, 0.5, 0, 4.6, 1, 2.2);
  for (let i = -1; i <= 1; i++) {
    world.group.add(meshCyl(0.22, 0.2, 0.04, solid(0xf0ece0, 0.3), i * 1.4, 0.9, -0.4, 16));
    world.group.add(meshCyl(0.07, 0.05, 0.16, solid(0xd8e4ec, 0.1, 0.1), i * 1.4 + 0.35, 0.96, -0.1, 10));
  }
  // chairs
  for (let i = -1; i <= 1; i += 2) {
    const c = new THREE.Group();
    c.add(meshBox(0.5, 0.08, 0.5, woodM, 0, 0.46, 0));
    c.add(meshBox(0.5, 0.7, 0.07, woodM, 0, 0.8, -i * 0.22));
    c.position.set(i * 1.6, 0, i * 1.5);
    c.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    world.group.add(c);
    addBox(world, i * 1.6, 0.5, i * 1.5, 0.6, 1, 0.6);
  }
  // sideboard, pictures, a ceiling light
  const sb = meshBox(3.4, 1.1, 0.6, woodM, -4, 0.55, -5.4);
  world.group.add(sb);
  addBox(world, -4, 0.55, -5.4, 3.4, 1.1, 0.7);
  const lamp = new THREE.PointLight(0xffd9a8, 14, 16, 2);
  lamp.position.set(0, 3.6, 0);
  world.group.add(lamp);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.5, 16, 1, true), solid(0xe8d8b8, 0.9));
  shade.position.set(0, 3.8, 0);
  world.group.add(shade);
  // the window she will leave through
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), new THREE.MeshStandardMaterial({
    color: 0x1a2438, emissive: 0x16203a, emissiveIntensity: 0.5, roughness: 0.2, transparent: true, opacity: 0.8
  }));
  glass.position.set(0, 2.3, -D / 2 + 0.06);
  world.group.add(glass);
  world.windowAt = new THREE.Vector3(0, 2.3, -D / 2);
  world.spawn.set(0, 0, 4);
  world.spawnYaw = Math.PI;
  return world;
}

/* ------------------------------------------------- generic prop helpers -- */
export function addCauldron(world, x, z, col) {
  const g = new THREE.Group();
  const iron = solid(0x24242a, 0.55, 0.5);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 12, 0, TAU, 0, Math.PI * 0.62), iron);
  body.position.y = 0.44; body.rotation.x = Math.PI;
  g.add(body);
  g.add(meshCyl(0.44, 0.44, 0.06, iron, 0, 0.44, 0, 18));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    g.add(meshCyl(0.035, 0.035, 0.22, iron, Math.cos(a) * 0.3, 0.11, Math.sin(a) * 0.3, 6));
  }
  const brew = new THREE.Mesh(new THREE.CircleGeometry(0.38, 20), new THREE.MeshStandardMaterial({
    color: col || 0x3fbf8f, emissive: col || 0x2f9f6f, emissiveIntensity: 0.9, roughness: 0.3
  }));
  brew.rotation.x = -Math.PI / 2; brew.position.y = 0.42;
  g.add(brew);
  const l = new THREE.PointLight(col || 0x3fbf8f, 2.2, 5, 2);
  l.position.y = 0.7;
  g.add(l);
  g.position.set(x, 0, z);
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  world.group.add(g);
  const ph = Math.random() * 9;
  world.update.push((dt, t) => {
    brew.position.y = 0.42 + Math.sin(t * 2 + ph) * 0.012;
    l.intensity = 2 + Math.sin(t * 3 + ph) * 0.6;
  });
  g.userData.brew = brew;
  g.userData.light = l;
  return g;
}

export function addBookshelf(world, x, z, ry, w) {
  const g = new THREE.Group();
  const woodM = mat('wood', { size: 256, repeat: [2, 3], roughness: 0.75 });
  w = w || 3;
  g.add(meshBox(w, 4.4, 0.4, woodM, 0, 2.2, -0.2));
  for (let s = 0; s < 5; s++) {
    g.add(meshBox(w, 0.08, 0.6, woodM, 0, 0.5 + s * 0.85, 0));
    const n = Math.floor(w * 6);
    for (let i = 0; i < n; i++) {
      const bw = rnd(0.07, 0.14), bh = rnd(0.35, 0.62);
      const b = meshBox(bw, bh, rnd(0.3, 0.46),
        solid(pick([0x6b2020, 0x1d4a2a, 0x203a6b, 0x5a4020, 0x3a2050, 0x6b5020]), 0.9),
        -w / 2 + 0.15 + i * (w - 0.3) / n, 0.54 + s * 0.85 + bh / 2, 0);
      b.rotation.z = Math.random() < 0.1 ? 0.2 : 0;
      g.add(b);
    }
  }
  g.position.set(x, 0, z); g.rotation.y = ry || 0;
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  world.group.add(g);
  const c = new THREE.Vector3(x, 0, z);
  addBox(world, c.x, 2.2, c.z, Math.abs(Math.cos(ry || 0)) * w + 0.6, 4.4, Math.abs(Math.sin(ry || 0)) * w + 0.6);
  return g;
}

export function addPlants(world, n, spread) {
  for (let i = 0; i < (n || 10); i++) {
    const x = rnd(-spread, spread), z = rnd(-spread, spread);
    const pot = meshCyl(0.28, 0.2, 0.36, solid(0x8a5a3a, 0.95), x, 0.18, z, 12);
    world.group.add(pot);
    const g = new THREE.Group();
    const leaves = 4 + (Math.random() * 4 | 0);
    for (let k = 0; k < leaves; k++) {
      const a = (k / leaves) * TAU;
      const l = new THREE.Mesh(new THREE.ConeGeometry(0.1, rnd(0.5, 1.0), 6), solid(pick([0x2a6b2a, 0x3a8a3a, 0x1d5520]), 1));
      l.position.set(Math.cos(a) * 0.12, 0.6, Math.sin(a) * 0.12);
      l.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
      g.add(l);
    }
    g.position.set(x, 0.2, z);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    world.group.add(g);
    const ph = Math.random() * 9;
    world.update.push((dt, t) => { g.rotation.z = Math.sin(t * 1.3 + ph) * 0.05; });
  }
}
