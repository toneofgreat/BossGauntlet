/* ===========================================================================
   avatar.js - the wizard you build in the mirror, and everyone else in the
   school, from the same box of parts. One goofy option per category, because
   that is what was asked for.
   ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { mat } from './tex.js';
import { clamp, lerp, TAU } from './core.js';

export const OPTIONS = {
  skin: {
    label: 'Skin',
    kind: 'swatch',
    items: [
      { name: 'Porcelain', col: 0xf2d6c0 },
      { name: 'Sand', col: 0xe8c39c },
      { name: 'Honey', col: 0xd2a173 },
      { name: 'Chestnut', col: 0xa9713f },
      { name: 'Umber', col: 0x7a4a29 },
      { name: 'Deep', col: 0x4d2e1c },
      { name: 'Ghost blue', col: 0xbfd6ef },
      { name: 'MINT, by accident', col: 0x8fe0a8, silly: true }
    ]
  },
  hair: {
    label: 'Hair',
    kind: 'chip',
    items: [
      { name: 'Mop' }, { name: 'Curls' }, { name: 'Long' }, { name: 'Braids' },
      { name: 'Buzz' }, { name: 'Bald' }, { name: 'Bun' },
      { name: 'A nest, with bird', silly: true }
    ]
  },
  hairCol: {
    label: 'Hair colour',
    kind: 'swatch',
    items: [
      { name: 'Ink', col: 0x18120e }, { name: 'Coffee', col: 0x4a2f1c },
      { name: 'Chestnut', col: 0x7b4a24 }, { name: 'Straw', col: 0xd6b25e },
      { name: 'Ginger', col: 0xc25a1c }, { name: 'Silver', col: 0xcfd3d8 },
      { name: 'Plum', col: 0x6b2450 },
      { name: 'ALL OF THEM', col: 0xff3fa4, silly: true }
    ]
  },
  eyes: {
    label: 'Eyes',
    kind: 'swatch',
    items: [
      { name: 'Brown', col: 0x5a3a1e }, { name: 'Hazel', col: 0x9a7c34 },
      { name: 'Green', col: 0x2f7d46 }, { name: 'Blue', col: 0x3f6fbe },
      { name: 'Grey', col: 0x8d9196 }, { name: 'Amber', col: 0xb87415 },
      { name: 'One of each', col: 0x3f6fbe, odd: 0x2f7d46, silly: true }
    ]
  },
  wear: {
    label: 'What you wear',
    kind: 'chip',
    items: [
      { name: 'Red robe', robe: 0x7a1220, trim: 0xd4af37 },
      { name: 'Green robe', robe: 0x0f3d24, trim: 0xb9c0c6 },
      { name: 'Blue robe', robe: 0x16305e, trim: 0xb08d57 },
      { name: 'Yellow robe', robe: 0x6e5a12, trim: 0x2a2a2a },
      { name: 'Black robe', robe: 0x161620, trim: 0x6b6b7a },
      { name: 'Grey robe', robe: 0x4a4a52, trim: 0xdedede },
      { name: 'Chicken suit', robe: 0xf3e7a8, trim: 0xe0562a, silly: true }
    ]
  }
};

const MAT = {};
function solid(col, rough, metal) {
  const k = 'S' + col + '_' + rough + '_' + metal;
  if (!MAT[k]) MAT[k] = new THREE.MeshStandardMaterial({
    color: col, roughness: rough === undefined ? 0.85 : rough, metalness: metal || 0
  });
  return MAT[k];
}
function glow(col, i) {
  const k = 'G' + col + '_' + i;
  if (!MAT[k]) MAT[k] = new THREE.MeshStandardMaterial({
    color: col, emissive: col, emissiveIntensity: i === undefined ? 1 : i, roughness: 0.4
  });
  return MAT[k];
}
export { solid, glow };

const GEO = {};
function geo(key, make) { if (!GEO[key]) GEO[key] = make(); return GEO[key]; }
const sph = (r, w, h) => geo('s' + r + w + h, () => new THREE.SphereGeometry(r, w || 20, h || 14));
const box = (x, y, z) => geo('b' + x + y + z, () => new THREE.BoxGeometry(x, y, z));
const cyl = (a, b, h, s) => geo('c' + a + b + h + s, () => new THREE.CylinderGeometry(a, b, h, s || 16));
const cone = (r, h, s) => geo('n' + r + h + s, () => new THREE.ConeGeometry(r, h, s || 16));
const tor = (r, t) => geo('t' + r + t, () => new THREE.TorusGeometry(r, t, 8, 18));

function part(g, m, x, y, z) {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x || 0, y || 0, z || 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/* ------------------------------------------------------------ the hair --- */
function buildHair(type, col, skinCol) {
  const g = new THREE.Group();
  const m = solid(col, 0.95);
  switch (type) {
    case 0: { // mop
      const cap = part(sph(0.235), m, 0, 0.03, 0);
      cap.scale.set(1, 0.82, 1.02);
      g.add(cap);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU;
        const t = part(sph(0.075), m, Math.cos(a) * 0.2, 0.02 + Math.sin(i * 2.1) * 0.03, Math.sin(a) * 0.2);
        t.scale.set(1, 0.7, 1); g.add(t);
      }
      break;
    }
    case 1: { // curls
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * TAU * 3.1, r = 0.19 + (i % 3) * 0.02;
        const y = 0.12 - (i / 26) * 0.2;
        const c = part(sph(0.062), m, Math.cos(a) * r, y, Math.sin(a) * r);
        g.add(c);
      }
      g.add(part(sph(0.2), m, 0, 0.06, 0));
      break;
    }
    case 2: { // long
      const cap = part(sph(0.235), m, 0, 0.03, 0); cap.scale.set(1, 0.85, 1); g.add(cap);
      const back = part(cyl(0.2, 0.17, 0.62, 14), m, 0, -0.26, -0.06);
      back.scale.set(1, 1, 0.66); g.add(back);
      const tip = part(sph(0.17), m, 0, -0.55, -0.06); tip.scale.set(1, 0.6, 0.66); g.add(tip);
      break;
    }
    case 3: { // braids
      const cap = part(sph(0.235), m, 0, 0.03, 0); cap.scale.set(1, 0.8, 1); g.add(cap);
      [-1, 1].forEach((s) => {
        for (let i = 0; i < 5; i++) {
          const b = part(sph(0.062), m, s * 0.19, -0.1 - i * 0.1, -0.02 + (i % 2) * 0.03);
          b.scale.set(1, 0.9, 1); g.add(b);
        }
        g.add(part(tor(0.05, 0.016), solid(0x8d3b53, 0.7), s * 0.19, -0.58, 0));
      });
      break;
    }
    case 4: { // buzz
      const cap = part(sph(0.222), m, 0, 0.015, 0); cap.scale.set(1, 0.72, 1); g.add(cap);
      break;
    }
    case 5: return g; // bald
    case 6: { // bun
      const cap = part(sph(0.235), m, 0, 0.03, 0); cap.scale.set(1, 0.82, 1); g.add(cap);
      const bun = part(sph(0.14), m, 0, 0.14, -0.2); g.add(bun);
      g.add(part(cyl(0.012, 0.012, 0.34, 6), solid(0x3b2a18, 0.8), 0.02, 0.2, -0.2));
      break;
    }
    case 7: { // a nest, with bird
      const twig = solid(0x6b4a24, 1);
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * TAU * 2.6, r = 0.2 + (i % 4) * 0.015;
        const t = part(cyl(0.011, 0.011, 0.17, 5), twig, Math.cos(a) * r, 0.05 + (i % 5) * 0.012, Math.sin(a) * r);
        t.rotation.set(Math.PI / 2.2, a, (i % 7) * 0.4); g.add(t);
      }
      const body = part(sph(0.085), solid(0xe8e2d0, 0.9), 0, 0.17, 0.02); body.scale.set(1.2, 1, 1.4); g.add(body);
      const head = part(sph(0.055), solid(0xe8e2d0, 0.9), 0, 0.25, 0.09); g.add(head);
      g.add(part(cone(0.024, 0.07, 8), solid(0xe8a13a, 0.7), 0, 0.25, 0.155).rotateX(Math.PI / 2));
      [-1, 1].forEach((s) => g.add(part(sph(0.014), solid(0x101010, 0.4), s * 0.026, 0.268, 0.135)));
      const egg = part(sph(0.035), solid(0xbfe0d0, 0.6), 0.1, 0.12, -0.06); egg.scale.set(1, 1.25, 1); g.add(egg);
      break;
    }
  }
  if (type === 7) return g;
  // rainbow hair: recolour the pieces
  return g;
}

function rainbowise(group) {
  const cols = [0xff3b30, 0xff9500, 0xffcc00, 0x34c759, 0x00a2ff, 0x5856d6, 0xaf52de];
  let i = 0;
  group.traverse((o) => { if (o.isMesh) { o.material = solid(cols[i++ % cols.length], 0.9); } });
}

/* ---------------------------------------------------------- the wizard --- */
export function buildAvatar(look, opt) {
  opt = opt || {};
  const S = OPTIONS.skin.items[clamp(look.skin | 0, 0, OPTIONS.skin.items.length - 1)];
  const H = clamp(look.hair | 0, 0, OPTIONS.hair.items.length - 1);
  const HC = OPTIONS.hairCol.items[clamp(look.hairCol | 0, 0, OPTIONS.hairCol.items.length - 1)];
  const E = OPTIONS.eyes.items[clamp(look.eyes | 0, 0, OPTIONS.eyes.items.length - 1)];
  const W = OPTIONS.wear.items[clamp(look.wear | 0, 0, OPTIONS.wear.items.length - 1)];
  const chicken = !!W.silly;

  const skin = solid(S.col, 0.72);
  const robeMat = new THREE.MeshStandardMaterial({
    map: mat('cloth', { rgb: hexRgb(W.robe), size: 256, repeat: [2, 3] }).map,
    bumpMap: mat('cloth', { rgb: hexRgb(W.robe), size: 256, repeat: [2, 3] }).bumpMap,
    bumpScale: 0.12, roughness: 0.96, metalness: 0
  });
  const trim = solid(W.trim, 0.55, 0.25);

  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);

  /* legs and boots, which show under the hem */
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.11, 0.60, 0); legR.position.set(0.11, 0.60, 0);
  [legL, legR].forEach((L) => {
    L.add(part(cyl(0.078, 0.062, 0.40, 12), solid(0x23232a, 0.92), 0, -0.20, 0));
    const boot = part(box(0.14, 0.12, 0.26), solid(0x241a12, 0.72), 0, -0.44, 0.035);
    L.add(boot);
    const sole = part(box(0.15, 0.035, 0.27), solid(0x14100c, 0.9), 0, -0.50, 0.035);
    L.add(sole);
    body.add(L);
  });

  /* the robe: one tapered piece from the hem to the collar, not a traffic cone */
  const robe = part(cyl(0.205, 0.345, 0.94, 22), robeMat, 0, 0.79, 0);
  body.add(robe);
  const hem = part(cyl(0.345, 0.365, 0.07, 22), trim, 0, 0.35, 0);
  body.add(hem);
  // a seam of trim down the front
  body.add(part(box(0.055, 0.86, 0.02), trim, 0, 0.80, 0.215));
  // the chest, a little broader than the waist
  const chest = part(cyl(0.225, 0.2, 0.3, 18), robeMat, 0, 1.13, 0);
  chest.scale.z = 0.86;
  body.add(chest);

  /* shoulders, so the arms are attached to something */
  [-1, 1].forEach((s) => body.add(part(sph(0.105), robeMat, s * 0.235, 1.175, 0)));

  /* neck and collar */
  body.add(part(cyl(0.068, 0.075, 0.13, 12), skin, 0, 1.285, 0));
  const collar = part(cyl(0.17, 0.235, 0.09, 18), trim, 0, 1.245, 0);
  body.add(collar);

  if (chicken) {
    const feather = solid(0xf7edb6, 0.95);
    [-1, 1].forEach((s) => {
      const wing = part(sph(0.19), feather, s * 0.28, 0.95, 0);
      wing.scale.set(0.42, 1.0, 0.75); body.add(wing);
    });
    for (let i = 0; i < 5; i++) {
      const t = part(cone(0.055, 0.32, 8), feather, (i - 2) * 0.065, 0.72, -0.3);
      t.rotation.x = -1.1 + (i - 2) * 0.06; body.add(t);
    }
  }

  /* arms */
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.248, 1.15, 0); armR.position.set(0.248, 1.15, 0);
  [[armL, -1], [armR, 1]].forEach(([A, s]) => {
    A.add(part(cyl(0.058, 0.05, 0.44, 12), robeMat, 0, -0.22, 0));
    const cuff = part(cyl(0.055, 0.062, 0.06, 12), trim, 0, -0.43, 0);
    A.add(cuff);
    const hand = part(sph(0.058), skin, 0, -0.475, 0.01);
    hand.name = 'hand';
    A.add(hand);
    A.rotation.z = s * 0.07;
    body.add(A);
  });

  /* head */
  const head = new THREE.Group();
  head.position.set(0, 1.455, 0);
  const skull = part(sph(0.2), skin, 0, 0, 0);
  skull.scale.set(1, 1.1, 0.96);
  head.add(skull);
  head.add(part(cone(0.035, 0.08, 8), skin, 0, -0.01, 0.185).rotateX(Math.PI / 2));   // nose
  [-1, 1].forEach((s) => {
    const ear = part(sph(0.045), skin, s * 0.195, 0.01, 0);
    ear.scale.set(0.5, 1, 0.8); head.add(ear);
  });
  // eyes
  [-1, 1].forEach((s, i) => {
    const white = part(sph(0.04), solid(0xf6f4ef, 0.3), s * 0.072, 0.03, 0.166);
    white.scale.set(1.05, 0.8, 0.55);
    head.add(white);
    const c = (E.odd && i === 1) ? E.odd : E.col;
    const iris = part(sph(0.021), solid(c, 0.25), s * 0.074, 0.03, 0.188);
    iris.scale.set(1, 1, 0.5);
    head.add(iris);
    head.add(part(sph(0.0095), solid(0x0a0a0a, 0.15), s * 0.075, 0.03, 0.197));
    // a lid, which is what stops it looking like a doll
    const lid = part(sph(0.042), skin, s * 0.072, 0.055, 0.162);
    lid.scale.set(1.05, 0.5, 0.55);
    head.add(lid);
  });
  // brows and mouth
  [-1, 1].forEach((s) => {
    const b = part(box(0.062, 0.013, 0.018), solid(HC.col, 0.9), s * 0.075, 0.088, 0.183);
    b.rotation.z = s * 0.1; head.add(b);
  });
  const mouth = part(box(0.06, 0.011, 0.016), solid(0x8a4a48, 0.6), 0, -0.08, 0.183);
  head.add(mouth);
  // a chin and cheeks, so the head is a head and not a ball
  const chin = part(sph(0.1), skin, 0, -0.115, 0.06);
  chin.scale.set(1.0, 0.7, 1.0);
  head.add(chin);

  const hair = buildHair(H, HC.col, S.col);
  if (HC.silly && H !== 7) rainbowise(hair);
  hair.position.y = 0.09;
  head.add(hair);

  if (chicken) {
    const comb = solid(0xd4372a, 0.8);
    for (let i = 0; i < 3; i++) head.add(part(sph(0.05), comb, 0, 0.23 - Math.abs(i - 1) * 0.02, -0.02 + (i - 1) * 0.07));
    const beak = part(cone(0.05, 0.11, 8), solid(0xe8a13a, 0.7), 0, -0.02, 0.21);
    beak.rotation.x = Math.PI / 2; head.add(beak);
  }

  body.add(head);

  /* the pointed hat, unless you are dressed as poultry */
  let hat = null;
  if (!chicken && opt.hat !== false) {
    hat = new THREE.Group();
    const brim = part(cyl(0.34, 0.34, 0.022, 22), robeMat, 0, 0, 0);
    hat.add(brim);
    const cone1 = part(cone(0.2, 0.52, 18), robeMat, 0, 0.26, 0);
    cone1.rotation.z = 0.1;
    hat.add(cone1);
    const band = part(cyl(0.205, 0.205, 0.05, 20), trim, 0, 0.03, 0);
    hat.add(band);
    hat.position.set(0, 0.275, -0.015);
    hat.rotation.z = -0.05;
    hat.rotation.x = -0.04;
    head.add(hat);
  }

  /* the scarf, so there is something that moves */
  const scarf = new THREE.Group();
  const sc = solid(W.trim, 0.97);
  const loop = part(tor(0.15, 0.036), sc, 0, 0, 0);
  loop.rotation.x = Math.PI / 2;
  loop.scale.set(1, 1.15, 1);
  scarf.add(loop);
  for (let i = 0; i < 5; i++) {
    const t = part(box(0.11, 0.1, 0.028), sc, 0.1, -0.09 - i * 0.095, 0.135 - i * 0.004);
    t.rotation.z = 0.05 * i;
    scarf.add(t);
  }
  scarf.position.set(0, 1.245, 0);
  body.add(scarf);

  root.userData = {
    parts: { body, head, hair, hat, armL, armR, legL, legR, scarf, torso: chest, robe, hem, mouth },
    handL: armL.children.find((c) => c.name === 'hand'),
    handR: armR.children.find((c) => c.name === 'hand'),
    look, chicken
  };
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}

function hexRgb(h) { return [(h >> 16) & 255, (h >> 8) & 255, h & 255]; }

/* ------------------------------------------------------------- the wand -- */
export function buildWand(kind) {
  const g = new THREE.Group();
  const woods = [0x3b2414, 0x5a3a1c, 0x7a5a2c, 0x241a12, 0x6b4a34];
  const w = woods[(kind || 0) % woods.length];
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.018, 0.42, 10), solid(w, 0.7));
  shaft.position.y = 0.21;
  g.add(shaft);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.02, 0.1, 10), solid(0x2a1a10, 0.85));
  grip.position.y = 0.05;
  g.add(grip);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.004, 6, 14), solid(0xb08d57, 0.4, 0.6));
    ring.position.y = 0.02 + i * 0.035; ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), glow(0xffe9a8, 0.6));
  tip.position.y = 0.43;
  tip.name = 'tip';
  g.add(tip);
  const light = new THREE.PointLight(0xffdf9a, 0, 6, 2);
  light.position.y = 0.44;
  light.name = 'wandlight';
  g.add(light);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { tip, light };
  return g;
}

/* -------------------------------------------------------------- posing --- */
export function poseWalk(av, t, speed) {
  const p = av.userData.parts;
  robeDown(p);
  const s = clamp(speed, 0, 1);
  const sw = Math.sin(t * 9) * 0.55 * s;
  p.legL.rotation.x = sw;
  p.legR.rotation.x = -sw;
  p.armL.rotation.x = -sw * 0.75;
  p.armR.rotation.x = sw * 0.75;
  p.body.position.y = Math.abs(Math.sin(t * 9)) * 0.035 * s;
  p.body.rotation.z = Math.sin(t * 9) * 0.02 * s;
  p.scarf.rotation.x = -s * 0.5 - Math.sin(t * 7) * 0.12;
  if (p.hair) p.hair.rotation.x = Math.sin(t * 6) * 0.03 * s;
}
function robeDown(p) {
  if (p.robe.scale.y !== 1) { p.robe.scale.y = 1; p.robe.position.y = 0.79; p.hem.visible = true; }
}
export function poseIdle(av, t) {
  const p = av.userData.parts;
  robeDown(p);
  p.legL.rotation.x = p.legR.rotation.x = 0;
  p.armL.rotation.x = Math.sin(t * 1.3) * 0.05;
  p.armR.rotation.x = Math.sin(t * 1.3 + 1) * 0.05;
  p.body.position.y = Math.sin(t * 1.6) * 0.012;
  p.head.rotation.y = Math.sin(t * 0.5) * 0.14;
  p.scarf.rotation.x = Math.sin(t * 1.1) * 0.08;
}
/* right arm up, wand forward */
export function poseCast(av, k) {
  const p = av.userData.parts;
  p.armR.rotation.x = lerp(p.armR.rotation.x, -1.75 * k, 0.4);
  p.armR.rotation.z = lerp(p.armR.rotation.z, -0.25 * k, 0.4);
  p.body.rotation.x = lerp(p.body.rotation.x, -0.06 * k, 0.3);
}
export function poseFly(av, lean, turn) {
  const p = av.userData.parts;
  p.robe.scale.y = 0.58;
  p.robe.position.y = 0.97;
  p.hem.visible = false;
  // knees back along the shaft, chest down over the handle, arms out in front
  p.legL.rotation.x = -1.42; p.legR.rotation.x = -1.35;
  p.armL.rotation.x = -1.15; p.armR.rotation.x = -1.05;
  p.armL.rotation.z = 0.16; p.armR.rotation.z = -0.16;
  p.body.rotation.x = lerp(p.body.rotation.x, 0.82 + lean * 0.3, 0.2);
  p.body.rotation.z = lerp(p.body.rotation.z, -turn * 0.45, 0.15);
  p.head.rotation.x = lerp(p.head.rotation.x, -0.5 - lean * 0.3, 0.15);
  p.scarf.rotation.x = -1.5 - Math.sin(av.__t = (av.__t || 0) + 0.06) * 0.2;
}

/* --------------------------------------------------------- other people -- */
const NAMES = ['RUFUS', 'MINA', 'ODELL', 'BRAM', 'PIP', 'TALLY', 'GUS', 'WREN', 'CORDELIA', 'NED'];
export function randomLook(seedFn) {
  const r = seedFn || Math.random;
  const p = (n) => Math.floor(r() * n);
  return {
    skin: p(OPTIONS.skin.items.length - 1),
    hair: p(OPTIONS.hair.items.length - 1),
    hairCol: p(OPTIONS.hairCol.items.length - 1),
    eyes: p(OPTIONS.eyes.items.length - 1),
    wear: p(OPTIONS.wear.items.length - 1),
    name: NAMES[p(NAMES.length)]
  };
}
