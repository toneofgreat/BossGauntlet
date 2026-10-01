/* ===========================================================================
   world.js - the places. Every set is built from primitives and the painted
   textures in tex.js, and every one hands back a list of boxes to bump into.
   ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { mat, tex } from './tex.js';
import { solid, glow } from './avatar.js';
import { rnd, pick, TAU, clamp, lerp, R, FX, AU } from './core.js';

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
  let t, fogCol, fogNear, fogFar, amb, ambI, hi, lo, hemiI, sun, sunCol, sunI, mood;
  if (kind === 'night') {
    t = tex('night', { size: 1024 });
    fogCol = 0x111a33; fogNear = 8; fogFar = 105;
    amb = 0x3d4a80; ambI = 2.0; hi = 0x41508c; lo = 0x10131c; hemiI = 1.1;
    sunCol = 0xaec2f0; sunI = 1.9;                                   // a moon, not a sun
    sun = new THREE.Vector3(-30, 44, -20);
    mood = { exposure: 1.16, vig: 0.66, sat: 0.82, grain: 0.95, contrast: 1.1, bloom: 0.6 };
  } else if (kind === 'storm') {
    t = tex('sky', { size: 1024, dark: 0.5, clouds: 130, stops: [[0, '#23282f'], [0.4, '#444b55'], [0.72, '#6a7079'], [1, '#4e535b']] });
    fogCol = 0x464c55; fogNear = 10; fogFar = 120;
    amb = 0x5a616e; ambI = 1.9; hi = 0x666d7b; lo = 0x1d1f22; hemiI = 1.15;
    sunCol = 0xb8c0cc; sunI = 0.9;
    sun = new THREE.Vector3(10, 40, -30);
    mood = { exposure: 1.0, vig: 0.72, sat: 0.62, grain: 1.05, contrast: 1.14, bloom: 0.45 };
  } else if (kind === 'dawn') {
    t = tex('sky', { size: 1024, dark: 0.35, clouds: 80,
      stops: [[0, '#0c1230'], [0.42, '#4a3a58'], [0.74, '#96603c'], [1, '#c39a6a']] });
    fogCol = 0x7a6250; fogNear = 14; fogFar = 150;
    amb = 0x64566e; ambI = 1.55; hi = 0x6b5a76; lo = 0x1e1915; hemiI = 0.95;
    sunCol = 0xf0b078; sunI = 1.5;
    sun = new THREE.Vector3(-46, 14, -40);
    mood = { exposure: 1.0, vig: 0.6, sat: 0.86, grain: 0.8, contrast: 1.09, bloom: 0.7 };
  } else if (kind === 'cave') {
    t = null;
    fogCol = 0x0b1c16; fogNear = 5; fogFar = 66;
    amb = 0x2e6a50; ambI = 1.95; hi = 0x31765a; lo = 0x0a100c; hemiI = 1.0;
    sunCol = 0x86d4b4; sunI = 0.5;
    sun = new THREE.Vector3(0, 30, 0);
    mood = { exposure: 1.2, vig: 0.7, sat: 0.78, grain: 1.0, contrast: 1.12, bloom: 0.62 };
  } else if (kind === 'indoor') {
    t = null;
    fogCol = 0x15121f; fogNear = 7; fogFar = 76;
    amb = 0x554a70; ambI = 2.0; hi = 0x584a78; lo = 0x1f1b16; hemiI = 1.05;
    sunCol = 0xffd2a0; sunI = 0.4;
    sun = new THREE.Vector3(12, 30, 8);
    mood = { exposure: 1.2, vig: 0.64, sat: 0.86, grain: 0.9, contrast: 1.08, bloom: 0.6 };
  } else { // day, but the kind of day this school gets
    t = tex('sky', { size: 1024, dark: 0.6, clouds: 100,
      stops: [[0, '#1d2c44'], [0.5, '#5a6b78'], [0.82, '#8b9499'], [1, '#a8a79c']] });
    fogCol = 0x7d848a; fogNear = 22; fogFar = 210;
    amb = 0x93a4b8; ambI = 1.75; hi = 0x9eadc0; lo = 0x2d2a24; hemiI = 1.2;
    sunCol = 0xf0ecde; sunI = 2.2;
    sun = new THREE.Vector3(40, 60, 20);
    mood = { exposure: 1.06, vig: 0.52, sat: 0.8, grain: 0.65, contrast: 1.07, bloom: 0.45 };
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
  const a = new THREE.AmbientLight(amb, ambI);
  scene.add(a);
  world.ambient = a;
  const hemi = new THREE.HemisphereLight(hi, lo, hemiI);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(sunCol, sunI);
  dir.position.copy(sun);
  dir.castShadow = true;
  dir.shadow.mapSize.set(R.small ? 1024 : 2048, R.small ? 1024 : 2048);
  dir.shadow.radius = 2.4;
  const d = 48;
  dir.shadow.camera.left = -d; dir.shadow.camera.right = d;
  dir.shadow.camera.top = d; dir.shadow.camera.bottom = -d;
  dir.shadow.camera.far = 200;
  dir.shadow.bias = -0.0006;
  dir.shadow.normalBias = 0.02;
  scene.add(dir);
  scene.add(dir.target);
  world.sun = dir;
  world.sunBase = sunI;
  world.sky = kind;
  FX.mood(mood);
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
export function addTorch(world, x, y, z, col, o) {
  o = o || {};
  const g = new THREE.Group();
  const iron = mat('rust', { size: 128, repeat: [1, 1], seed: 17 + ((x * 7 + z) | 0) % 40 });
  const bracket = meshCyl(0.03, 0.05, 0.3, iron, 0, 0, 0, 8);
  g.add(bracket);
  const bowl = meshCyl(0.1, 0.05, 0.12, iron, 0, 0.2, 0, 10);
  g.add(bowl);
  if (o.dead) {
    // burnt out: a cold black stub, and a hole in the corridor lighting
    const stub = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 7), solid(0x14100e, 1));
    stub.position.y = 0.3;
    g.add(stub);
    g.position.set(x, y, z);
    world.group.add(g);
    return g;
  }
  const hot = col || 0xff9a3c;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.3, 8),
    new THREE.MeshBasicMaterial({ color: hot, fog: false, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.position.y = 0.39;
  g.add(flame);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.17, 7),
    new THREE.MeshBasicMaterial({ color: 0xffe6b0, fog: false }));
  core.position.y = 0.34;
  g.add(core);
  // a soft halo, which the bloom pass then smears into the air
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: dotTexture(), color: hot, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  }));
  halo.scale.setScalar(1.5);
  halo.position.y = 0.4;
  g.add(halo);
  const light = new THREE.PointLight(hot, 26, 34, 2);
  light.position.y = 0.42;
  g.add(light);
  g.position.set(x, y, z);
  world.group.add(g);
  const ph = Math.random() * 10;
  let gutter = 0, next = rnd(4, 14);
  world.update.push((dt, t) => {
    // flame noise, plus every so often it nearly goes out
    let f = 1 + Math.sin(t * 11 + ph) * 0.15 + Math.sin(t * 27 + ph) * 0.09 + Math.sin(t * 43 + ph) * 0.04;
    next -= dt;
    if (next <= 0) { gutter = rnd(0.25, 0.7); next = rnd(5, 18); }
    if (gutter > 0) {
      gutter -= dt;
      f *= 0.2 + Math.abs(Math.sin(t * 30)) * 0.35;
    }
    flame.scale.set(1 + (f - 1) * 0.5, f, 1 + (f - 1) * 0.5);
    core.scale.setScalar(0.8 + f * 0.25);
    light.intensity = 24 * f;
    halo.material.opacity = 0.22 + 0.34 * f;
    halo.scale.setScalar(1.2 + f * 0.45);
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
      color: o.windowCol || 0x131f3c, emissive: o.windowCol || 0x0e1730,
      emissiveIntensity: o.windowGlow === undefined ? 0.22 : o.windowGlow,
      roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.72
    });
    const frame = solid(0x14110e, 0.9);
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

  // torches on the pillars, and one in four of them has gone out
  if (o.torches !== false) {
    let n = 0;
    for (let i = -Math.ceil(D / 16); i <= Math.ceil(D / 16); i++) {
      [-1, 1].forEach((s) => {
        const dead = (n++ % 4) === 3;
        addTorch(world, s * (W / 2 - 0.55), 4.2, i * 8 + 2, o.torchCol, { dead });
      });
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
      const l = new THREE.PointLight(0xffc078, 60, 46, 2);
      l.position.y = 0.4;
      g.add(l);
      const lph = Math.random() * 8;
      world.update.push((dt, t) => {
        l.intensity = 55 + Math.sin(t * 5.3 + lph) * 5 + Math.sin(t * 13.7 + lph) * 3;
      });
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
  // and what the housekeeping never reaches
  if (o.webs !== false) addCobwebs(world, { w: W, d: D, h: H, n: o.webs || 9 });
  addMotes(world, R.small ? 80 : 190, [W * 0.9, H * 0.85, D * 0.9], 0xb6c2d4);
  if (o.drips !== false) addDrips(world, { count: R.small ? 3 : 6, w: W / 2 - 1, d: D / 2 - 1, h: H - 0.4 });
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
  // suits of armour along one side, rusted through, and one of them watching
  const steel = mat('rust', { size: 256, repeat: [1, 2], seed: 71 });
  const heads = [];
  for (let i = -Math.floor(L / 10); i <= Math.floor(L / 10); i++) {
    const x = (i % 2 ? -1 : 1) * 3.2, z = i * 9;
    const fallen = (i + 40) % 7 === 0;
    const g = new THREE.Group();
    g.add(meshCyl(0.28, 0.32, 0.9, steel, 0, 1.1, 0, 12));
    const head = new THREE.Group();
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), steel);
    head.add(helm);
    // a dark slit where a face should be
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.02), solid(0x04040a, 1));
    slit.position.set(0, 0.02, 0.21);
    head.add(slit);
    head.position.set(0, 1.75, 0);
    g.add(head);
    g.add(meshCyl(0.23, 0.25, 0.18, steel, 0, 1.95, 0, 12));
    [-1, 1].forEach((s) => g.add(meshCyl(0.09, 0.08, 0.8, steel, s * 0.33, 1.15, 0, 10)));
    [-1, 1].forEach((s) => g.add(meshCyl(0.11, 0.1, 0.65, steel, s * 0.15, 0.33, 0, 10)));
    g.add(meshCyl(0.02, 0.02, 1.8, steel, 0.45, 0.9, 0, 8));
    const spear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 8), steel);
    spear.position.set(0.45, 1.9, 0);
    g.add(spear);
    g.position.set(x, 0, z);
    g.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
    if (fallen) { g.rotation.z = 1.4; g.position.y = 0.3; }
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    world.group.add(g);
    addBox(world, x, 1, z, 0.9, 2, 0.9);
    if (!fallen) heads.push({ head, g });
  }
  // the helmets turn to follow whoever is walking through
  world.update.push(() => {
    const c = R.camera.position;
    heads.forEach((h) => {
      const wp = h.g.position;
      const d = Math.hypot(wp.x - c.x, wp.z - c.z);
      if (d > 16) return;
      const want = Math.atan2(c.x - wp.x, c.z - wp.z) - h.g.rotation.y;
      h.head.rotation.y += (clamp(want, -1.1, 1.1) - h.head.rotation.y) * 0.04;
    });
  });
  // portraits: sitters who have been dead a long time, and know it
  for (let i = -Math.floor(L / 12); i <= Math.floor(L / 12); i++) {
    [-1, 1].forEach((sd) => {
      const x = sd * 3.92, z = i * 11 + 4;
      const fr = meshBox(0.1, 1.7, 1.3, mat('wood', { size: 128, repeat: [1, 1], dark: [26, 18, 10], light: [58, 40, 18] }), x, 3.2, z);
      world.group.add(fr);
      const cv = document.createElement('canvas'); cv.width = 160; cv.height = 210;
      const cx2 = cv.getContext('2d');
      cx2.fillStyle = '#100d0b'; cx2.fillRect(0, 0, 160, 210);
      // a varnish that has gone brown, over a face that has gone grey
      const gr = cx2.createRadialGradient(80, 78, 4, 80, 78, 96);
      gr.addColorStop(0, 'rgba(126,116,104,.85)');
      gr.addColorStop(0.55, 'rgba(58,52,48,.7)');
      gr.addColorStop(1, 'rgba(14,12,11,.9)');
      cx2.fillStyle = gr; cx2.fillRect(0, 0, 160, 210);
      cx2.fillStyle = 'rgba(150,140,126,.55)';
      cx2.beginPath(); cx2.ellipse(80, 82, 33, 42, 0, 0, 7); cx2.fill();
      // hollow sockets
      cx2.fillStyle = 'rgba(6,6,8,.92)';
      [[66, 74], [94, 74]].forEach(([ex, ey]) => {
        cx2.beginPath(); cx2.ellipse(ex, ey, 9, 11, 0, 0, 7); cx2.fill();
      });
      cx2.fillStyle = 'rgba(8,7,9,.7)';
      cx2.beginPath(); cx2.ellipse(80, 108, 7, 11, 0, 0, 7); cx2.fill();
      cx2.fillStyle = 'rgba(20,16,26,.85)';
      cx2.beginPath(); cx2.ellipse(80, 190, 56, 66, 0, 0, 7); cx2.fill();
      // craquelure
      cx2.strokeStyle = 'rgba(0,0,0,.35)'; cx2.lineWidth = 1;
      for (let k = 0; k < 30; k++) {
        cx2.beginPath();
        const px = Math.random() * 160, py = Math.random() * 210;
        cx2.moveTo(px, py);
        cx2.lineTo(px + (Math.random() - 0.5) * 30, py + (Math.random() - 0.5) * 30);
        cx2.stroke();
      }
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5),
        new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
      pic.position.set(x - sd * 0.06, 3.2, z);
      pic.rotation.y = -sd * Math.PI / 2;
      world.group.add(pic);
      // every third sitter still has something behind the eyes
      if ((i + 12) % 3 === 0) {
        [-1, 1].forEach((e) => {
          const eye = new THREE.Sprite(new THREE.SpriteMaterial({
            map: dotTexture(), color: 0xffe6a0, transparent: true, opacity: 0.0,
            blending: THREE.AdditiveBlending, depthWrite: false
          }));
          eye.scale.setScalar(0.12);
          eye.position.set(x - sd * 0.1, 3.42, z + e * 0.19);
          world.group.add(eye);
          const ph = Math.random() * 9;
          world.update.push((dt, tt) => {
            const c = R.camera.position;
            const d = Math.hypot(x - c.x, z - c.z);
            const seen = d < 11 ? 1 : 0;
            const blink = Math.sin(tt * 0.9 + ph) > 0.4 ? 1 : 0.15;
            eye.material.opacity += (seen * 0.5 * blink - eye.material.opacity) * Math.min(1, dt * 3);
          });
        });
      }
    });
  }
  addCobwebs(world, { w: 8, d: L, h: 7, n: 16 });
  addGroundFog(world, { count: R.small ? 6 : 14, spread: L / 2, y: 0.4, col: 0x9fb0c4 });
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
  // lit windows: most of the school has gone to bed
  const lit = new THREE.MeshBasicMaterial({ color: 0xe8a860, fog: true });
  for (let i = 0; i < 26; i++) {
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
  addGroundFog(world, { count: R.small ? 8 : 20, spread: 90, y: 0.6, col: 0x9fb0c8 });
  if (world.sky === 'night') {
    addBats(world, R.small ? 6 : 14, { at: [0, -20] });
    addEyes(world, { count: 3, near: 26, far: 60, y: 1.2 });
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
  const trunk = mat('wood', { size: 256, repeat: [1, 4], dark: [32, 23, 15], light: [72, 53, 33], roughness: 1 });
  const leaf = solid(0x1e3527, 1);
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
    const col = pick([0x5fe0c0, 0x7fa8ff, 0xc08fff]);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.12, 0.26), 10, 7, 0, TAU, 0, Math.PI / 2),
      glow(col, 2.2));
    cap.position.set(x, rnd(0.1, 0.3), z);
    world.group.add(cap);
    if (i % 4 === 0) {
      const ml = new THREE.PointLight(col, 4, 9, 2);
      ml.position.set(x, 0.5, z);
      world.group.add(ml);
      const mph = Math.random() * 9;
      world.update.push((dt, t) => { ml.intensity = 3.4 + Math.sin(t * 0.9 + mph) * 1.2; });
    }
    const st = meshCyl(0.035, 0.05, 0.22, solid(0xd8d0c0, 0.9), x, 0.11, z, 6);
    world.group.add(st);
  }
  // dead ones, with nothing left but the arms
  for (let i = 0; i < (o.dead === undefined ? 26 : o.dead); i++) {
    const a = Math.random() * TAU, r = (o.inner || 7) + Math.random() * 70;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = rnd(7, 15);
    const g = new THREE.Group();
    g.add(meshCyl(0.14, rnd(0.4, 0.7), h, trunk, 0, h / 2, 0, 7));
    for (let k = 0; k < 5; k++) {
      const br = meshCyl(0.03, 0.08, rnd(2, 4.5), trunk, 0, h * rnd(0.55, 0.95), 0, 5);
      br.rotation.z = rnd(-1.5, 1.5); br.rotation.x = rnd(-1.5, 1.5);
      g.add(br);
    }
    g.position.set(x, 0, z);
    g.rotation.z = rnd(-0.12, 0.12);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    world.group.add(g);
    addBox(world, x, 3, z, 0.9, 6, 0.9);
  }
  // mist, and what is standing in it
  addMist(world, 90, 70);
  addGroundFog(world, { count: R.small ? 10 : 26, spread: 70, y: 0.5, col: 0x9aa8bc });
  addBones(world, 14, 48);
  if (o.eyes !== false) addEyes(world, { count: R.small ? 3 : 6, near: 14, far: 40, y: 1.1 });
  if (o.watcher !== false) addWatcher(world, { near: 24, far: 48, flee: 15 });
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
    color: 0xc4d0e0, size: 3.4, transparent: true, opacity: 0.18,
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

/* ------------------------------------------------- rain, and the sky lit -- */
export function addRain(world, o) {
  o = o || {};
  const n = R.small ? 900 : (o.count || 2600);
  const box = o.box || 46, top = o.top || 26;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 6);            // two ends per drop
  const len = o.len || 0.9;
  for (let i = 0; i < n; i++) {
    const x = rnd(-box, box), y = rnd(0, top), z = rnd(-box, box);
    pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
    pos[i * 6 + 3] = x + 0.06; pos[i * 6 + 4] = y - len * rnd(0.7, 1.5); pos[i * 6 + 5] = z;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.LineBasicMaterial({
    color: o.col || 0xaebccc, transparent: true, opacity: o.opacity === undefined ? 0.34 : o.opacity,
    depthWrite: false, fog: true
  });
  const rain = new THREE.LineSegments(g, m);
  rain.frustumCulled = false;
  world.group.add(rain);
  const arr = g.attributes.position.array;
  const speed = o.speed || 34;
  world.update.push((dt) => {
    const cam = R.camera.position;
    const drop = speed * dt, drift = dt * 4;
    for (let i = 0; i < n; i++) {
      const a = i * 6;
      arr[a + 1] -= drop; arr[a + 4] -= drop;
      arr[a] += drift; arr[a + 3] += drift;
      if (arr[a + 4] < cam.y - 8) {
        const x = cam.x + rnd(-box, box), z = cam.z + rnd(-box, box), y = cam.y + rnd(10, top);
        const l = len * rnd(0.7, 1.5);
        arr[a] = x; arr[a + 1] = y; arr[a + 2] = z;
        arr[a + 3] = x + 0.06; arr[a + 4] = y - l; arr[a + 5] = z;
      }
    }
    g.attributes.position.needsUpdate = true;
  });
  return rain;
}

/* the sky goes white, and a few seconds later you hear why */
export function addLightning(world, o) {
  o = o || {};
  let next = rnd(3, 9), flashT = 0, bolts = 0;
  const base = world.sunBase === undefined ? 0.4 : world.sunBase;
  const strike = new THREE.DirectionalLight(0xdfe8ff, 0);
  strike.position.set(rnd(-40, 40), 60, rnd(-40, 40));
  world.group.add(strike);
  world.update.push((dt) => {
    next -= dt;
    if (next <= 0) {
      next = rnd(o.every || 7, (o.every || 7) * 2.6);
      flashT = 0.42; bolts = 2 + (Math.random() * 2 | 0);
      strike.position.set(rnd(-60, 60), 70, rnd(-60, 60));
      FX.lightning(0.42);
      const far = Math.random() < 0.55;
      setTimeout(() => AU.sfx(far ? 'rumble' : 'thunder'), far ? 1800 + Math.random() * 2600 : 300 + Math.random() * 900);
    }
    if (flashT > 0) {
      flashT -= dt;
      // it stutters: two or three strikes inside one flash
      const k = Math.max(0, Math.sin(flashT * 46) ) * (flashT / 0.42);
      strike.intensity = k * 5.5 * bolts * 0.5;
      if (world.sun) world.sun.intensity = base + k * 1.4;
      if (flashT <= 0 && world.sun) world.sun.intensity = base;
    } else strike.intensity = 0;
  });
}

/* -------------------------------------------------- eyes, out in the dark - */
export function addEyes(world, o) {
  o = o || {};
  const n = o.count || 5;
  const pairs = [];
  const col = o.col || 0xffd25a;
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    [-1, 1].forEach((s) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: dotTexture(), color: col, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: true
      }));
      sp.scale.setScalar(o.size || 0.3);
      sp.position.x = s * (o.gap || 0.16);
      g.add(sp);
    });
    world.group.add(g);
    pairs.push({ g, t: rnd(0, 6), blink: rnd(2, 7), on: false });
  }
  const place = (e) => {
    const a = Math.random() * TAU, r = (o.near || 16) + Math.random() * ((o.far || 38) - (o.near || 16));
    const c = R.camera.position;
    e.g.position.set(c.x + Math.cos(a) * r, (o.y === undefined ? 1.4 : o.y) + rnd(-0.3, 0.9), c.z + Math.sin(a) * r);
  };
  pairs.forEach(place);
  world.update.push((dt) => {
    pairs.forEach((e) => {
      e.t -= dt;
      e.g.lookAt(R.camera.position);
      const target = e.on ? (o.bright === undefined ? 0.75 : o.bright) : 0;
      e.g.children.forEach((c) => {
        c.material.opacity += (target - c.material.opacity) * Math.min(1, dt * 4);
      });
      if (e.t <= 0) {
        e.on = !e.on;
        e.t = e.on ? rnd(1.6, 5) : rnd(2, 9);
        if (e.on) place(e);                 // never twice in the same place
      }
      // blink
      if (e.on && Math.random() < dt * 0.5) e.g.children.forEach((c) => { c.material.opacity = 0; });
    });
  });
  return pairs;
}

/* --------------------------------------------------- cobwebs in the corners */
export function addCobwebs(world, o) {
  o = o || {};
  const W = o.w || 20, D = o.d || 30, H = o.h || 10;
  const n = o.n || 8;
  const t = tex('cobweb', { size: 256, seed: 5 });
  for (let i = 0; i < n; i++) {
    const m = new THREE.MeshBasicMaterial({
      map: t, transparent: true, opacity: rnd(0.16, 0.34), depthWrite: false,
      side: THREE.DoubleSide, fog: true
    });
    m.__owned = true;
    const sz = rnd(0.9, 2.2);
    const web = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), m);
    const sx = Math.random() < 0.5 ? -1 : 1, sz2 = Math.random() < 0.5 ? -1 : 1;
    if (o.anywhere) {
      web.position.set(rnd(-W / 2, W / 2), rnd(H * 0.4, H - 0.4), rnd(-D / 2, D / 2));
    } else {
      // tucked into a top corner, at a wall
      const wall = Math.random() < 0.5;
      web.position.set(wall ? sx * (W / 2 - 0.1) : rnd(-W / 2 + 1, W / 2 - 1),
        H - rnd(0.3, 1.6),
        wall ? rnd(-D / 2 + 1, D / 2 - 1) : sz2 * (D / 2 - 0.1));
      web.rotation.y = wall ? sx * Math.PI / 2 : 0;
    }
    web.rotation.z = rnd(0, TAU);
    world.group.add(web);
  }
}

/* -------------------------------------------------------- water, dripping - */
export function addDrips(world, o) {
  o = o || {};
  const n = o.count || 10;
  const drops = [];
  const m = new THREE.MeshStandardMaterial({ color: 0x9fb4c4, roughness: 0.1, metalness: 0.3,
    transparent: true, opacity: 0.7 });
  m.__owned = true;
  for (let i = 0; i < n; i++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.035, 7, 5), m);
    d.scale.y = 1.8;
    world.group.add(d);
    drops.push({ m: d, x: rnd(-(o.w || 12), o.w || 12), z: rnd(-(o.d || 20), o.d || 20),
      y: o.h || 8, v: 0, wait: rnd(0, 6) });
  }
  world.update.push((dt) => {
    drops.forEach((d) => {
      if (d.wait > 0) {
        d.wait -= dt;
        d.m.visible = false;
        if (d.wait <= 0) { d.v = 0; d.m.position.set(d.x, d.y, d.z); }
        return;
      }
      d.m.visible = true;
      d.v += 18 * dt;
      d.m.position.y -= d.v * dt;
      if (d.m.position.y <= (o.floor === undefined ? 0.02 : o.floor)) {
        d.wait = rnd(2.5, 11);
        d.x = rnd(-(o.w || 12), o.w || 12); d.z = rnd(-(o.d || 20), o.d || 20);
        if (Math.random() < 0.5) AU.sfx('drip');
      }
    });
  });
}

/* --------------------------------------------- mist lying on the ground --- */
export function addGroundFog(world, o) {
  o = o || {};
  const n = o.count || (R.small ? 10 : 22);
  const t = dotTexture();
  const layers = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.MeshBasicMaterial({
      map: t, transparent: true, opacity: rnd(0.05, 0.13), depthWrite: false,
      color: o.col || 0xb8c6d6, blending: THREE.AdditiveBlending, fog: true
    });
    m.__owned = true;
    const sz = rnd(10, 26);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), m);
    pl.rotation.x = -Math.PI / 2;
    pl.position.set(rnd(-(o.spread || 60), o.spread || 60), (o.y === undefined ? 0.55 : o.y) + rnd(-0.2, 0.5),
      rnd(-(o.spread || 60), o.spread || 60));
    world.group.add(pl);
    layers.push({ pl, ph: rnd(0, 9), sp: rnd(0.02, 0.08) });
  }
  world.update.push((dt, tt) => {
    layers.forEach((L) => {
      L.pl.rotation.z = tt * L.sp + L.ph;
      L.pl.position.y += Math.sin(tt * 0.3 + L.ph) * dt * 0.05;
    });
  });
}

/* ------------------------------------------------- somebody, watching you - */
export function addWatcher(world, o) {
  o = o || {};
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0x05050a, roughness: 1, transparent: true, opacity: 0 });
  cloth.__owned = true;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.6, 2.2, 10), cloth);
  body.position.y = 1.1;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 9), cloth);
  head.position.y = 2.35;
  g.add(head);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.42), new THREE.MeshBasicMaterial({
    color: 0xc8c4bc, transparent: true, opacity: 0, depthWrite: false, fog: true
  }));
  face.material.__owned = true;
  face.position.set(0, 2.35, 0.2);
  g.add(face);
  world.group.add(g);
  let vis = 0, state = 'gone', wait = rnd(6, 16);
  const place = () => {
    const a = Math.random() * TAU, r = rnd(o.near || 22, o.far || 46);
    const c = R.camera.position;
    g.position.set(c.x + Math.cos(a) * r, o.y || 0, c.z + Math.sin(a) * r);
  };
  place();
  world.update.push((dt) => {
    const c = R.camera.position;
    const dist = Math.hypot(g.position.x - c.x, g.position.z - c.z);
    g.rotation.y = Math.atan2(c.x - g.position.x, c.z - g.position.z);
    if (state === 'gone') {
      wait -= dt;
      if (wait <= 0) { place(); state = 'there'; wait = rnd(5, 13); }
    } else {
      wait -= dt;
      // it does not let you get close, and it does not stay long
      if (wait <= 0 || dist < (o.flee || 14)) { state = 'gone'; wait = rnd(8, 22); if (dist < 20 && Math.random() < 0.5) AU.sfx('whisper'); }
    }
    const target = state === 'there' ? 0.92 : 0;
    vis += (target - vis) * Math.min(1, dt * (state === 'there' ? 1.5 : 6));
    cloth.opacity = vis;
    face.material.opacity = vis * 0.5;
    body.visible = head.visible = face.visible = vis > 0.01;
  });
  return g;
}

/* ----------------------------------------------------------------- bones -- */
export function addBones(world, n, spread, y) {
  const bone = solid(0xa8a294, 0.75);
  for (let i = 0; i < (n || 12); i++) {
    const x = rnd(-spread, spread), z = rnd(-spread, spread);
    const what = Math.random();
    if (what < 0.3) {
      // a skull, looking up at you
      const sk = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), bone);
      sk.scale.set(1, 0.95, 1.15);
      sk.position.set(x, (y || 0) + 0.14, z);
      sk.rotation.set(rnd(0, 0.5), rnd(0, TAU), rnd(-0.3, 0.3));
      world.group.add(sk);
      [-1, 1].forEach((s) => {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 6), solid(0x07070a, 1));
        e.position.set(x + s * 0.06, (y || 0) + 0.16, z + 0.13);
        world.group.add(e);
      });
      const j = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.1), bone);
      j.position.set(x, (y || 0) + 0.04, z + 0.06);
      world.group.add(j);
    } else {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, rnd(0.3, 0.8), 6), bone);
      r.position.set(x, (y || 0) + 0.04, z);
      r.rotation.set(Math.PI / 2 + rnd(-0.2, 0.2), rnd(0, TAU), rnd(-0.4, 0.4));
      world.group.add(r);
    }
  }
}

/* ----------------------------------------- a shaft of light through a gap - */
export function addShaft(world, x, y, z, o) {
  o = o || {};
  const m = new THREE.MeshBasicMaterial({
    color: o.col || 0xbfd0ff, transparent: true, opacity: o.opacity === undefined ? 0.07 : o.opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
  });
  m.__owned = true;
  const c = new THREE.Mesh(new THREE.CylinderGeometry(o.r0 === undefined ? 0.12 : o.r0,
    o.r1 === undefined ? 1.1 : o.r1, o.len || 6, 10, 1, true), m);
  c.position.set(x, y, z);
  c.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  world.group.add(c);
  world.update.push((dt, t) => { m.opacity = (o.opacity === undefined ? 0.07 : o.opacity) * (0.8 + Math.sin(t * 0.7) * 0.2); });
  return c;
}

/* ---------------------------------------------------------------- bats ---- */
export function addBats(world, n, o) {
  o = o || {};
  const m = solid(0x0b0a10, 1);
  const bats = [];
  for (let i = 0; i < (n || 12); i++) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), m);
    b.scale.set(0.7, 0.7, 1.3);
    g.add(b);
    const wings = [];
    [-1, 1].forEach((s) => {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.22), m);
      w.position.x = s * 0.24;
      g.add(w); wings.push(w);
    });
    world.group.add(g);
    bats.push({ g, wings, a: rnd(0, TAU), r: rnd(8, 30), y: rnd(6, 16), sp: rnd(0.3, 0.8), ph: rnd(0, 9) });
  }
  world.update.push((dt, t) => {
    bats.forEach((b) => {
      b.a += dt * b.sp;
      const cx = o.at ? o.at[0] : 0, cz = o.at ? o.at[1] : 0;
      b.g.position.set(cx + Math.cos(b.a) * b.r, b.y + Math.sin(t * 1.4 + b.ph) * 0.8, cz + Math.sin(b.a) * b.r);
      b.g.rotation.y = -b.a + Math.PI / 2;
      const f = Math.sin(t * 16 + b.ph);
      b.wings[0].rotation.z = f * 0.9;
      b.wings[1].rotation.z = -f * 0.9;
    });
  });
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
  const crowd = new THREE.Points(crowdGeo, new THREE.PointsMaterial({ size: 0.7, vertexColors: true, map: dotTexture(), transparent: true, opacity: 0.85, depthWrite: false }));
  world.group.add(crowd);
  const base = cp.slice();
  world.update.push((dt, t) => {
    const a = crowdGeo.attributes.position.array;
    for (let i = 0; i < N; i += 3) a[i * 3 + 1] = base[i * 3 + 1] + Math.abs(Math.sin(t * 2 + i)) * 0.25;
    crowdGeo.attributes.position.needsUpdate = true;
  });
  // weather
  if ((o.sky || 'day') === 'storm') {
    addRain(world, { count: R.small ? 900 : 3000, box: 52, top: 40, speed: 40 });
    addLightning(world, { every: 6 });
  }
  addGroundFog(world, { count: R.small ? 5 : 12, spread: 60, y: 0.7, col: 0xa8b4c0 });
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
      const l = new THREE.PointLight(0x4fd890, 12, 30, 2);
      l.position.set(x, 12.5, z);
      world.group.add(l);
      const lph = (i + s) * 1.7;
      world.update.push((dt, t) => { l.intensity = 11 + Math.sin(t * 0.8 + lph) * 2.4; });
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
  addMist(world, 70, 26);
  addGroundFog(world, { count: 12, spread: 24, y: 0.6, col: 0x7fb0a0 });
  addBones(world, 30, 10);
  addDrips(world, { count: 14, w: 11, d: 40, h: 15 });
  addCobwebs(world, { w: 24, d: 80, h: 15, n: 14 });
  addEyes(world, { count: 4, near: 12, far: 34, y: 1.6, col: 0xffe06a });
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
  // moonlight coming through the boards, one shaft per gap
  for (let i = 0; i < 4; i++) {
    addShaft(world, -W / 2 + 2.4 + i * 0.2, 3.1 - i * 0.25, 1.6 + i * 0.5,
      { rz: Math.PI / 2 - 0.5, len: 5.5, r0: 0.1, r1: 0.55, opacity: 0.1, col: 0xbfd0ff });
  }
  addCobwebs(world, { w: W, d: D, h: H, n: 12 });
  addDrips(world, { count: 3, w: 5, d: 6, h: H - 0.3 });
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
  const lamp = new THREE.PointLight(0xffc088, 13, 18, 2);
  lamp.position.set(0, 3.6, 0);
  world.group.add(lamp);
  // the bulb is on its way out
  world.update.push((dt, t) => {
    lamp.intensity = 12.4 + Math.sin(t * 6.1) * 0.7 + (Math.sin(t * 31.3) > 0.94 ? -5 : 0);
  });
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

/* ---------------------------------------------- the gate, behind the menus */
/* Everything the title screen stands in front of: a broken gate in the rain,
   the school a long way behind it, and something in the archway that is gone
   again by the time you look twice. */
export function buildTitleSet(world) {
  addSky(world, 'night');
  world.fog.near = 4; world.fog.far = 74;
  addGround(world, 'flag', 120);

  const stoneM = mat('stone', { size: 512, repeat: [2, 4], seed: 9, bumpScale: 0.65, damp: 1 });
  const pillar = (x) => {
    world.group.add(meshBox(2.2, 9, 2.2, stoneM, x, 4.5, 0));
    world.group.add(meshBox(2.9, 0.5, 2.9, stoneM, x, 9.1, 0));
    const cap = meshBox(1.5, 1.4, 1.5, stoneM, x, 10, 0);
    cap.rotation.z = x > 0 ? 0.1 : -0.07;
    world.group.add(cap);
    // a winged something on top, worn past knowing what it was
    const beast = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 0), stoneM);
    beast.position.set(x, 11.2, 0);
    beast.rotation.set(0.3, x > 0 ? -0.6 : 0.6, 0.2);
    world.group.add(beast);
  };
  pillar(-4.4); pillar(4.4);
  // the arch, broken out of the middle
  [[0, 0], [1, Math.PI - Math.PI * 0.42]].forEach(([, rz]) => {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.52, 8, 20, Math.PI * 0.42), stoneM);
    arc.position.set(0, 9, 0);
    arc.rotation.z = rz;
    arc.castShadow = true;
    world.group.add(arc);
  });
  // iron railings either side, most of them still standing
  const iron = mat('rust', { size: 128, repeat: [1, 2], seed: 23 });
  for (let i = 0; i < 26; i++) {
    const side = i < 13 ? -1 : 1;
    const x = side * (6.2 + (i % 13) * 1.5);
    if (Math.random() < 0.18) continue;
    const bar = meshCyl(0.05, 0.05, rnd(2.6, 3.4), iron, x, 1.6, 0, 6);
    bar.rotation.z = rnd(-0.06, 0.06);
    world.group.add(bar);
  }
  [-1, 1].forEach((sd) => {
    world.group.add(meshBox(20, 0.12, 0.12, iron, sd * 15.4, 3.1, 0));
    world.group.add(meshBox(20, 0.12, 0.12, iron, sd * 15.4, 0.4, 0));
  });
  // two torches, in the wind, and a moon picking out the arch
  addTorch(world, -3.3, 4.6, 1.05, 0xff8a34);
  addTorch(world, 3.3, 4.6, 1.05, 0xff8a34);
  const key = new THREE.SpotLight(0xa8c0f0, 260, 70, 0.62, 0.9, 1.0);
  key.position.set(-15, 24, 20);
  key.target.position.set(0, 4.5, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(R.small ? 512 : 1024, R.small ? 512 : 1024);
  world.group.add(key, key.target);
  if (world.sun) { world.sun.intensity = 2.1; world.sun.position.set(-34, 30, 34); }

  // the school, a long way off and mostly asleep
  const far = new THREE.Group();
  const dark = solid(0x0a0b12, 1);
  far.add(meshBox(40, 30, 24, dark, 0, 15, 0));
  [[-24, 0, 40], [24, 0, 44], [-15, -16, 52], [16, -16, 48]].forEach(([x, z, h]) => {
    far.add(meshCyl(4.6, 5.6, h, dark, x, h / 2, z, 12));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(6.2, 12, 12), dark);
    roof.position.set(x, h + 6, z);
    far.add(roof);
  });
  const lit = new THREE.MeshBasicMaterial({ color: 0xe0a05a, fog: true });
  for (let i = 0; i < 18; i++) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.6), lit);
    w.position.set(rnd(-18, 18), rnd(6, 26), 12.1);
    far.add(w);
  }
  far.position.set(-6, 0, -72);
  far.rotation.y = 0.28;
  world.group.add(far);

  // dead trees leaning in from both sides
  const trunk = mat('wood', { size: 256, repeat: [1, 4], dark: [20, 15, 10], light: [44, 34, 22], roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * rnd(9, 26), z = rnd(-26, 16);
    const h = rnd(9, 17);
    const g = new THREE.Group();
    g.add(meshCyl(0.16, rnd(0.5, 0.8), h, trunk, 0, h / 2, 0, 7));
    for (let k = 0; k < 6; k++) {
      const br = meshCyl(0.03, 0.09, rnd(2, 5), trunk, 0, h * rnd(0.5, 0.95), 0, 5);
      br.rotation.z = rnd(-1.5, 1.5); br.rotation.x = rnd(-1.5, 1.5);
      g.add(br);
    }
    g.position.set(x, 0, z);
    g.rotation.z = -side * rnd(0.05, 0.16);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    world.group.add(g);
  }
  // headstones, because of course
  const grave = solid(0x23242a, 0.95);
  for (let i = 0; i < 16; i++) {
    const x = rnd(-30, 30), z = rnd(-34, -8);
    if (Math.abs(x) < 7) continue;
    const st = meshBox(rnd(0.7, 1.1), rnd(1.1, 1.8), 0.22, grave, x, 0.8, z);
    st.rotation.set(rnd(-0.1, 0.1), rnd(-0.6, 0.6), rnd(-0.14, 0.14));
    world.group.add(st);
  }

  addRain(world, { count: R.small ? 800 : 2600, box: 40, top: 30, speed: 30, opacity: 0.3 });
  addLightning(world, { every: 8 });
  addMist(world, 70, 46);
  addGroundFog(world, { count: R.small ? 8 : 20, spread: 40, y: 0.5, col: 0x9fb0c8 });
  addBats(world, R.small ? 5 : 11, { at: [0, -30] });
  addEyes(world, { count: 4, near: 12, far: 34, y: 1.2 });
  addWatcher(world, { near: 16, far: 30, flee: 9 });
  addDrips(world, { count: 5, w: 6, d: 3, h: 9 });
  world.spawn.set(0, 0, 14);
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
