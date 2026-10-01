/* ===========================================================================
   foes.js - the things that want you dead, and a couple of friends. All built
   from primitives, all animated by hand.
   ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { solid, glow, buildAvatar } from './avatar.js';
import { mat } from './tex.js';
import { rnd, TAU, clamp, lerp, pick } from './core.js';

function mesh(g, m, x, y, z) {
  const me = new THREE.Mesh(g, m);
  me.position.set(x || 0, y || 0, z || 0);
  me.castShadow = true; me.receiveShadow = true;
  return me;
}

/* ------------------------------------------------ the man with no nose --- */
export function buildDarkLord() {
  const g = new THREE.Group();
  const robe = new THREE.MeshStandardMaterial({ color: 0x0d0d14, roughness: 1, metalness: 0 });
  const skin = solid(0xd8d4cc, 0.6);
  const body = mesh(new THREE.CylinderGeometry(0.34, 0.95, 2.3, 18), robe, 0, 1.15, 0);
  g.add(body);
  const hem = mesh(new THREE.ConeGeometry(1.05, 0.7, 18), robe, 0, 0.35, 0);
  g.add(hem);
  // shoulders and long sleeves
  [-1, 1].forEach((s) => {
    const arm = mesh(new THREE.CylinderGeometry(0.11, 0.2, 1.3, 10), robe, s * 0.42, 1.55, 0);
    arm.rotation.z = s * 0.25;
    g.add(arm);
    const hand = mesh(new THREE.SphereGeometry(0.1, 10, 8), skin, s * 0.62, 0.95, 0.08);
    g.add(hand);
    if (s > 0) hand.name = 'wandhand';
  });
  // head: bald, flat nose, red eyes
  const head = new THREE.Group();
  const skull = mesh(new THREE.SphereGeometry(0.28, 20, 14), skin, 0, 0, 0);
  skull.scale.set(1, 1.18, 1);
  head.add(skull);
  [-1, 1].forEach((s) => {
    const e = mesh(new THREE.SphereGeometry(0.055, 10, 8), glow(0xff2a2a, 2.4), s * 0.1, 0.04, 0.24);
    head.add(e);
  });
  // two slits where a nose should be
  [-1, 1].forEach((s) => {
    const n = mesh(new THREE.BoxGeometry(0.022, 0.07, 0.03), solid(0x6b5a58, 0.8), s * 0.045, -0.05, 0.27);
    head.add(n);
  });
  const mouth = mesh(new THREE.BoxGeometry(0.15, 0.02, 0.03), solid(0x6b3a3a, 0.7), 0, -0.15, 0.26);
  head.add(mouth);
  head.position.set(0, 2.5, 0);
  g.add(head);
  // the hood is pushed back off the face: you are meant to see it
  const hood = mesh(new THREE.SphereGeometry(0.36, 16, 12, 0, TAU, 0, Math.PI * 0.55), robe, 0, 2.62, -0.2);
  hood.rotation.x = -0.75;
  g.add(hood);
  const cowl = mesh(new THREE.CylinderGeometry(0.34, 0.44, 0.3, 16, 1, true), robe, 0, 2.2, -0.04);
  cowl.material.side = THREE.DoubleSide;
  g.add(cowl);
  // a wand of his own
  const wand = mesh(new THREE.CylinderGeometry(0.012, 0.022, 0.5, 8), solid(0xd8d0c0, 0.6), 0.66, 1.2, 0.2);
  wand.rotation.z = -0.5; wand.rotation.x = -0.6;
  g.add(wand);
  const tip = mesh(new THREE.SphereGeometry(0.03, 8, 6), glow(0x66ff88, 2), 0.78, 1.42, 0.32);
  g.add(tip);
  // his own magic, coming up off him: it under-lights the face and makes him
  // visible across a black room without lighting the room
  const own = new THREE.PointLight(0x64ff9a, 7, 11, 2);
  own.position.set(0, 0.7, 0.3);
  g.add(own);
  const halo = new THREE.PointLight(0xff3a3a, 2.6, 5, 2);
  halo.position.set(0, 2.5, 0.25);
  g.add(halo);
  g.userData = { head, tip, own, halo, eyes: head.children.filter((c) => c.material && c.material.emissive) };
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  return g;
}

/* ------------------------------------------------------- the great snake */
export function buildSnake(len) {
  const g = new THREE.Group();
  const segs = [];
  const skin = new THREE.MeshStandardMaterial({
    map: mat('scales', { size: 512, repeat: [3, 3] }).map,
    bumpMap: mat('scales', { size: 512, repeat: [3, 3] }).bumpMap,
    bumpScale: 0.5, roughness: 0.55, metalness: 0.1
  });
  const n = len || 22;
  for (let i = 0; i < n; i++) {
    const r = 0.95 * (1 - Math.pow(i / n, 1.6) * 0.72);
    const s = mesh(new THREE.SphereGeometry(r, 16, 12), skin, 0, 1, -i * 1.05);
    s.scale.z = 1.25;
    g.add(s);
    segs.push(s);
  }
  // head
  const head = new THREE.Group();
  const skull = mesh(new THREE.SphereGeometry(1.15, 20, 14), skin, 0, 0, 0);
  skull.scale.set(1, 0.85, 1.55);
  head.add(skull);
  const jaw = mesh(new THREE.BoxGeometry(1.5, 0.35, 1.7), skin, 0, -0.5, 0.7);
  head.add(jaw);
  const mouth = mesh(new THREE.BoxGeometry(1.4, 0.5, 1.6), solid(0x4a1420, 0.8), 0, -0.25, 0.85);
  head.add(mouth);
  [-1, 1].forEach((s) => {
    const e = mesh(new THREE.SphereGeometry(0.22, 12, 10), glow(0xffd23a, 2.2), s * 0.62, 0.42, 0.75);
    head.add(e);
    const sl = mesh(new THREE.BoxGeometry(0.05, 0.22, 0.04), solid(0x101010, 0.3), s * 0.62, 0.42, 0.95);
    head.add(sl);
    // fangs
    const f = mesh(new THREE.ConeGeometry(0.11, 0.7, 8), solid(0xf0ece0, 0.4), s * 0.42, -0.2, 1.4);
    f.rotation.x = Math.PI;
    head.add(f);
  });
  const tongue = mesh(new THREE.CylinderGeometry(0.04, 0.02, 1.1, 6), solid(0xc02a4a, 0.7), 0, -0.3, 2.0);
  tongue.rotation.x = Math.PI / 2;
  head.add(tongue);
  head.position.set(0, 1.6, 1.4);
  g.add(head);
  const lamp = new THREE.PointLight(0xffd23a, 5, 14, 2);
  lamp.position.set(0, 0.4, 1.2);
  head.add(lamp);
  g.userData = { segs, head, tongue, n, lamp };
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  return g;
}
/* drive the body along behind the head */
export function snakeFollow(sn, dt, t) {
  const u = sn.userData;
  u.trail = u.trail || [];
  u.trail.unshift(u.head.position.clone());
  if (u.trail.length > u.n * 7) u.trail.pop();
  u.segs.forEach((s, i) => {
    const k = Math.min(u.trail.length - 1, Math.floor(i * 6));
    const p = u.trail[k];
    if (p) {
      s.position.lerp(p, 0.4);
      s.position.y = Math.max(0.75, p.y - 0.45 + Math.sin(t * 3 - i * 0.5) * 0.18);
    }
  });
  u.tongue.position.z = 2.0 + Math.sin(t * 7) * 0.35;
}

/* ---------------------------------------------------- the boy in a book -- */
export function buildBookBoy(look) {
  const av = buildAvatar(look || { skin: 6, hair: 0, hairCol: 0, eyes: 4, wear: 4, name: 'HIM' }, { hat: false });
  av.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.62;
      o.material.emissive = new THREE.Color(0x2a4a6b);
      o.material.emissiveIntensity = 0.5;
      o.material.__owned = true;
      o.castShadow = false;
    }
  });
  const l = new THREE.PointLight(0x6fa8d8, 5, 12, 2);
  l.position.y = 1.4;
  av.add(l);
  return av;
}

/* --------------------------------------------------------------- a wolf -- */
export function buildWolf(o) {
  o = o || {};
  const g = new THREE.Group();
  const fur = solid(o.col || 0x5a5248, 0.98);
  const body = mesh(new THREE.SphereGeometry(0.55, 16, 12), fur, 0, 0.78, 0);
  body.scale.set(0.82, 0.78, 1.55);
  g.add(body);
  const chest = mesh(new THREE.SphereGeometry(0.44, 14, 10), fur, 0, 0.82, 0.55);
  g.add(chest);
  const neck = mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.5, 10), fur, 0, 1.0, 0.8);
  neck.rotation.x = 0.7;
  g.add(neck);
  const head = new THREE.Group();
  const skull = mesh(new THREE.SphereGeometry(0.3, 14, 10), fur, 0, 0, 0);
  skull.scale.set(0.9, 0.85, 1.1);
  head.add(skull);
  const snout = mesh(new THREE.ConeGeometry(0.17, 0.55, 10), fur, 0, -0.06, 0.4);
  snout.rotation.x = Math.PI / 2;
  head.add(snout);
  head.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), solid(0x14100e, 0.4), 0, -0.02, 0.66));
  [-1, 1].forEach((s) => {
    const ear = mesh(new THREE.ConeGeometry(0.12, 0.3, 6), fur, s * 0.17, 0.28, -0.03);
    ear.rotation.x = -0.2; ear.rotation.z = s * 0.2;
    head.add(ear);
    const eye = mesh(new THREE.SphereGeometry(0.052, 8, 7), glow(o.eyes || 0xd8b83a, 1.6), s * 0.15, 0.06, 0.24);
    head.add(eye);
  });
  head.position.set(0, 1.24, 1.05);
  g.add(head);
  const legs = [];
  [[-0.28, 0.5], [0.28, 0.5], [-0.28, -0.5], [0.28, -0.5]].forEach(([x, z]) => {
    const L = new THREE.Group();
    const up = mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.72, 8), fur, 0, -0.36, 0);
    L.add(up);
    L.add(mesh(new THREE.SphereGeometry(0.11, 8, 6), fur, 0, -0.7, 0.05));
    L.position.set(x, 0.74, z);
    g.add(L);
    legs.push(L);
  });
  const tail = new THREE.Group();
  for (let i = 0; i < 4; i++) tail.add(mesh(new THREE.SphereGeometry(0.15 - i * 0.025, 10, 8), fur, 0, 0, -i * 0.2));
  tail.position.set(0, 0.86, -0.85);
  g.add(tail);
  g.userData = { head, legs, tail };
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}
export function wolfWalk(w, t, speed) {
  const u = w.userData;
  u.legs.forEach((L, i) => { L.rotation.x = Math.sin(t * 8 + (i % 2) * Math.PI + (i > 1 ? 0.6 : 0)) * 0.6 * speed; });
  u.tail.rotation.y = Math.sin(t * 5) * 0.4;
  u.head.rotation.x = Math.sin(t * 2) * 0.06;
}

/* --------------------------------------------- the one that stands up ---- */
export function buildManWolf() {
  const g = new THREE.Group();
  const fur = solid(0x3a352e, 1);
  const body = mesh(new THREE.CylinderGeometry(0.42, 0.62, 1.5, 14), fur, 0, 1.55, 0);
  body.rotation.x = 0.16;
  g.add(body);
  const hips = mesh(new THREE.SphereGeometry(0.5, 12, 10), fur, 0, 0.95, -0.12);
  g.add(hips);
  const legs = [];
  [-1, 1].forEach((s) => {
    const L = new THREE.Group();
    L.add(mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.85, 9), fur, 0, -0.42, 0));
    const shin = mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.8, 9), fur, 0, -1.0, 0.18);
    shin.rotation.x = -0.4;
    L.add(shin);
    L.add(mesh(new THREE.BoxGeometry(0.26, 0.14, 0.52), fur, 0, -1.4, 0.4));
    L.position.set(s * 0.26, 0.95, 0);
    g.add(L); legs.push(L);
  });
  const arms = [];
  [-1, 1].forEach((s) => {
    const A = new THREE.Group();
    A.add(mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.85, 9), fur, 0, -0.42, 0));
    A.add(mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.8, 9), fur, 0, -1.15, 0.05));
    const paw = mesh(new THREE.SphereGeometry(0.17, 10, 8), fur, 0, -1.55, 0.05);
    A.add(paw);
    for (let i = 0; i < 3; i++) {
      const c = mesh(new THREE.ConeGeometry(0.035, 0.24, 6), solid(0xe0dcd0, 0.4), (i - 1) * 0.09, -1.72, 0.12);
      c.rotation.x = 0.4;
      A.add(c);
    }
    A.position.set(s * 0.52, 2.2, 0);
    A.rotation.z = s * 0.28;
    g.add(A); arms.push(A);
  });
  const head = new THREE.Group();
  const skull = mesh(new THREE.SphereGeometry(0.34, 14, 11), fur, 0, 0, 0);
  skull.scale.set(0.95, 0.9, 1.05);
  head.add(skull);
  const snout = mesh(new THREE.ConeGeometry(0.2, 0.62, 10), fur, 0, -0.08, 0.45);
  snout.rotation.x = Math.PI / 2;
  head.add(snout);
  const jaw = mesh(new THREE.BoxGeometry(0.28, 0.1, 0.5), solid(0x2a1010, 0.8), 0, -0.2, 0.5);
  head.add(jaw);
  for (let i = 0; i < 6; i++) {
    const f = mesh(new THREE.ConeGeometry(0.035, 0.16, 6), solid(0xf0ece0, 0.35), (i - 2.5) * 0.07, -0.13, 0.62);
    f.rotation.x = Math.PI;
    head.add(f);
  }
  [-1, 1].forEach((s) => {
    const ear = mesh(new THREE.ConeGeometry(0.13, 0.36, 6), fur, s * 0.2, 0.32, -0.04);
    ear.rotation.z = s * 0.25;
    head.add(ear);
    head.add(mesh(new THREE.SphereGeometry(0.055, 8, 7), glow(0xffe07a, 2.0), s * 0.15, 0.07, 0.27));
  });
  head.position.set(0, 2.5, 0.1);
  g.add(head);
  const eyeglow = new THREE.PointLight(0xffe07a, 3.4, 9, 2);
  eyeglow.position.set(0, 0, 0.3);
  head.add(eyeglow);
  g.userData = { head, legs, arms, jaw, eyeglow };
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  return g;
}

/* ------------------------------------------------------ the cold one ---- */
export function buildWraith() {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({
    color: 0x07070c, roughness: 1, transparent: true, opacity: 0.94, side: THREE.DoubleSide
  });
  const hood = mesh(new THREE.SphereGeometry(0.62, 16, 12, 0, TAU, 0, Math.PI * 0.62), cloth, 0, 2.7, 0);
  hood.rotation.x = -0.18;
  g.add(hood);
  const face = mesh(new THREE.SphereGeometry(0.4, 14, 10), solid(0x050508, 1), 0, 2.62, 0.16);
  g.add(face);
  const body = mesh(new THREE.ConeGeometry(1.15, 3.0, 18, 1, true), cloth, 0, 1.5, 0);
  g.add(body);
  // ragged strips at the bottom
  const rags = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    const r = mesh(new THREE.PlaneGeometry(0.32, rnd(0.8, 2.0)), cloth, Math.cos(a) * 1.05, rnd(0.2, 0.9), Math.sin(a) * 1.05);
    r.rotation.y = -a;
    g.add(r); rags.push(r);
  }
  // hands
  const hands = [];
  [-1, 1].forEach((s) => {
    const h = mesh(new THREE.SphereGeometry(0.14, 10, 8), solid(0x5a5a60, 0.9), s * 0.85, 1.9, 0.4);
    h.scale.set(1, 0.7, 1.3);
    g.add(h); hands.push(h);
    for (let i = 0; i < 3; i++) {
      const f = mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.3, 5), solid(0x5a5a60, 0.9), s * 0.85 + (i - 1) * 0.07, 1.78, 0.56);
      f.rotation.x = 0.7;
      g.add(f);
    }
  });
  const chill = new THREE.PointLight(0x2a3a66, 6, 16, 2);
  chill.position.y = 2.2;
  g.add(chill);
  g.userData = { hood, rags, hands, chill, face };
  return g;
}

/* ------------------------------------------- the rat, and what it becomes */
export function buildRat() {
  const g = new THREE.Group();
  const fur = solid(0x7a6a58, 1);
  const body = mesh(new THREE.SphereGeometry(0.2, 12, 9), fur, 0, 0.18, 0);
  body.scale.set(0.85, 0.8, 1.5);
  g.add(body);
  const head = mesh(new THREE.ConeGeometry(0.13, 0.32, 9), fur, 0, 0.2, 0.32);
  head.rotation.x = Math.PI / 2;
  g.add(head);
  [-1, 1].forEach((s) => {
    g.add(mesh(new THREE.CircleGeometry(0.09, 10), fur, s * 0.1, 0.32, 0.12));
    g.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), solid(0x120c08, 0.3), s * 0.06, 0.24, 0.38));
  });
  const tail = mesh(new THREE.CylinderGeometry(0.02, 0.008, 0.7, 6), solid(0xc8a898, 0.9), 0, 0.16, -0.5);
  tail.rotation.x = Math.PI / 2 - 0.2;
  g.add(tail);
  g.userData = { tail, head };
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

/* ------------------------------------------------------- a bludger ------ */
export function buildBludger(r) {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.35, metalness: 0.9 });
  const b = mesh(new THREE.IcosahedronGeometry(r || 0.42, 2), iron, 0, 0, 0);
  g.add(b);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const rivet = mesh(new THREE.SphereGeometry((r || 0.42) * 0.12, 8, 6), solid(0x3a3a42, 0.3, 0.9),
      Math.cos(a) * (r || 0.42) * 0.92, Math.sin(a * 2) * (r || 0.42) * 0.5, Math.sin(a) * (r || 0.42) * 0.92);
    g.add(rivet);
  }
  const band = mesh(new THREE.TorusGeometry((r || 0.42) * 1.01, (r || 0.42) * 0.06, 8, 22), solid(0x4a4a52, 0.3, 0.9), 0, 0, 0);
  g.add(band);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

/* ---------------------------------------------------------- the snitch -- */
export function buildSnitch() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({
    color: 0xd9ac2e, emissive: 0x6b4a08, emissiveIntensity: 0.8, roughness: 0.18, metalness: 1
  });
  const b = mesh(new THREE.SphereGeometry(0.16, 18, 14), gold, 0, 0, 0);
  g.add(b);
  for (let i = 0; i < 3; i++) {
    const ring = mesh(new THREE.TorusGeometry(0.163, 0.012, 6, 24), solid(0xf0d68a, 0.25, 1), 0, 0, 0);
    ring.rotation.set(i * 1.1, i * 0.7, 0);
    g.add(ring);
  }
  const wings = [];
  [-1, 1].forEach((s) => {
    const w = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const f = mesh(new THREE.PlaneGeometry(0.34, 0.09), new THREE.MeshStandardMaterial({
        color: 0xf6efd8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.4
      }), s * 0.2, 0.02 + i * 0.03, 0);
      f.rotation.z = s * (0.2 + i * 0.12);
      w.add(f);
    }
    w.position.set(s * 0.12, 0.04, 0);
    g.add(w); wings.push(w);
  });
  const l = new THREE.PointLight(0xffd070, 2.5, 7, 2);
  g.add(l);
  g.userData = { wings };
  return g;
}
export function flapWings(obj, t) {
  const w = obj.userData.wings;
  if (!w) return;
  w[0].rotation.y = Math.sin(t * 34) * 0.9;
  w[1].rotation.y = -Math.sin(t * 34) * 0.9;
}

/* ----------------------------------------------------------- the aunt --- */
export function buildAunt() {
  const av = buildAvatar({ skin: 1, hair: 6, hairCol: 5, eyes: 4, wear: 5, name: 'AUNT' }, { hat: false });
  av.scale.set(1.25, 1.0, 1.25);
  return av;
}

/* ------------------------------------------------------ a teacher, or two */
export function buildTeacher(seed) {
  const looks = [
    { skin: 0, hair: 5, hairCol: 5, eyes: 4, wear: 4 },   // tall, black robe
    { skin: 2, hair: 2, hairCol: 5, eyes: 3, wear: 2 },   // long silver hair
    { skin: 4, hair: 1, hairCol: 0, eyes: 0, wear: 1 },
    { skin: 1, hair: 6, hairCol: 1, eyes: 2, wear: 3 }
  ];
  const av = buildAvatar(looks[(seed || 0) % looks.length], {});
  av.scale.setScalar(1.06);
  return av;
}
