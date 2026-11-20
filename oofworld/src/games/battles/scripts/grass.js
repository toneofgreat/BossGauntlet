// src/games/battles/scripts/grass.js — Battles. Spec 26 §14: everything the grass does.
//
// Rebirths 3-5 hand out avatar-shop items (the platform Catalog owns them; game.js
// grants them). THIS module is what those items DO while they are worn inside Battles:
//
//   🐾 Grass God (pet)    — grass tufts sprout where you walk and wilt after 30 s, and
//                           🌿 GRASS AWAKEN: three seconds floating up while a mech
//                           climbs out of the ground, then thirty seconds AS the mech.
//   🪽 Grass Wings (back) — ten seconds of free flight, once every two minutes.
//   🔨 Grass Hammer (gear) — SLAM: you are thrown into the sky, you steer the fall, and
//                           whoever you land on turns to grass until they die. Grass
//                           people infect whoever they touch. Ten infections through
//                           YOUR hammer earn the mythical Grass Crown.
//
// Everything honours the Place's peer model (ARCHITECTURE §9): a client only ever
// changes ITSELF. A slam is published like an aoe and each victim infects itself; an
// infected client publishes `grass: <the hammer owner's id>` and anyone who walks into
// them infects themselves with that same owner — which is how the owner can count a
// whole chain by reading nothing but the roster. Training dummies are local props, so
// they can be slammed, infected and counted with nobody else in the room.
//
// Performance: the tufts are ONE InstancedMesh ring buffer (TUFT_MAX instances, one draw
// call, matrices touched only when a tuft sprouts or wilts); the roster is read at
// ~7 Hz, not per frame; nothing in update() allocates beyond the engine's own
// position() tuple.

import { FLOOR_TOP } from "./layout.js";

export const PET_ID = "pet_grassgod";
export const WINGS_ID = "back_grasswings";
export const HAMMER_ID = "gear_grasshammer";
export const CROWN_ID = "hat_grasscrown";

export const TUFT_LIFE_S = 30;     // the ask: grass where you walked, gone after 30 s
export const TUFT_MAX = 240;       // hard cap, shared by me and every pet-owner in the room
const TUFT_STEP = 3;               // studs walked per tuft (16 studs/s -> ~160 live at once)
const TUFT_GROW_S = 0.35;
const TUFT_WILT_S = 1.2;

export const AWAKEN_FLOAT_S = 3;   // the ask: float into the sky for 3 seconds
const AWAKEN_RISE = 14;            // studs — to the rising mech's chest
export const MECH_S = 30;          // seconds as the mech
export const AWAKEN_CD_S = 180;    // the ask: once every 3 minutes
export const MECH_SCALE = 3;       // the ask: 3x size
export const MECH_DMG = 3;         // swing damage multiplier while the mech
export const MECH_REACH = 2.2;     // melee reach multiplier (arms three times as long)
const MECH_SPEED = 1.15;

export const FLY_S = 10;           // the ask: fly for 10 seconds
export const FLY_CD_S = 120;       // once every 2 minutes
const FLY_UP = 22, FLY_SINK = -3;  // studs/s while JUMP is held / released
const FLY_SPEED = 1.5;

export const SLAM_CD_S = 20;
const SLAM_RISE = 26, SLAM_RISE_S = 0.5;
export const SLAM_R = 6.5;         // "land on somebody" — a hammer-head and a half of grace
const SLAM_DMG = 15;
const TOUCH_R = 3.4;               // two fighters shoulder to shoulder
const DUMMY_SPREAD_R = 8;
export const CROWN_NEED = 10;      // the ask: 10 or more infected -> the crown

const GRAVITY_DEFAULT = 196.2;
const NET_TICK = 0.14;
const GREENS = ["#3ddc84", "#8be04a", "#2f8f4a", "#b6f26a"];

// ---- rig dressing (game.js hangs these on the platform's rigs at its 2 Hz reconcile) --

// The MECH: armour bolted to the rig's own joints, so it walks and swings with the
// avatar inside it, and the whole rig scaled MECH_SCALE. The joints are found by the
// names rig.js gives them; a rig without them (a placeholder) just gets the big scale.
export function buildMechSuit(THREE, root) {
  const mats = {
    armor: new THREE.MeshLambertMaterial({ color: "#2f8f4a" }),
    dark: new THREE.MeshLambertMaterial({ color: "#173d22" }),
    bark: new THREE.MeshLambertMaterial({ color: "#5a3a1a" }),
    glow: new THREE.MeshBasicMaterial({ color: "#b6f26a" }),
  };
  const geos = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cone: new THREE.ConeGeometry(0.5, 1, 6),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  };
  const meshes = [];
  const find = (n) => { try { return root.getObjectByName(n) || null; } catch { return null; } };
  const body = find("OofRigBody");
  const put = (parent, geo, mat, sx, sy, sz, x, y, z, rz) => {
    if (!parent) return;
    const m = new THREE.Mesh(geos[geo], mats[mat]);
    m.name = "bt-mech";
    m.scale.set(sx, sy, sz); m.position.set(x, y, z);
    if (rz) m.rotation.z = rz;
    parent.add(m); meshes.push(m);
  };
  // torso (body space: centre [0,3,0], the chest is the -Z side)
  put(body, "box", "armor", 2.5, 2.3, 1.5, 0, 3, 0);
  put(body, "box", "dark", 2.7, 0.5, 1.7, 0, 2.05, 0);            // waist ring
  put(body, "box", "glow", 1.0, 0.8, 0.2, 0, 3.3, -0.78);          // the reactor: a lit lawn
  for (const sx of [-1, 1]) put(body, "box", "dark", 0.16, 1.0, 0.26, sx * 0.3, 3.3, -0.8); // grille
  put(body, "box", "bark", 1.3, 1.7, 0.8, 0, 3.1, 1.1);            // root-bound backpack
  for (const sx of [-1, 1]) {
    put(body, "cyl", "dark", 0.5, 1.3, 0.5, sx * 0.4, 2.7, 1.65);   // thrusters
    put(body, "cyl", "glow", 0.36, 0.2, 0.36, sx * 0.4, 2.0, 1.65);
  }
  for (const n of ["leftArm", "rightArm"]) {
    const j = find("OofJoint_" + n);
    put(j, "box", "dark", 1.7, 1.0, 1.7, 0, 0.05, 0);              // pauldron
    put(j, "cone", "glow", 0.4, 0.9, 0.4, 0, 0.95, 0);             // a blade of grass on it
    put(j, "box", "armor", 1.3, 1.5, 1.3, 0, -1.15, 0);
    put(j, "box", "dark", 1.5, 0.7, 1.5, 0, -2.0, 0);              // fist
  }
  for (const n of ["leftLeg", "rightLeg"]) {
    const j = find("OofJoint_" + n);
    put(j, "box", "armor", 1.3, 1.6, 1.35, 0, -0.95, 0);
    put(j, "box", "glow", 0.5, 0.3, 0.1, 0, -0.7, -0.7);           // knee light
    put(j, "box", "dark", 1.4, 0.55, 1.9, 0, -1.75, -0.2);         // foot
  }
  const h = find("OofJoint_head");
  put(h, "box", "armor", 1.6, 1.3, 1.6, 0, 0.55, 0);               // helmet (hides the face)
  put(h, "box", "glow", 1.2, 0.3, 0.12, 0, 0.62, -0.82);           // visor
  for (const sx of [-1, 1]) put(h, "cone", "glow", 0.3, 1.1, 0.3, sx * 0.62, 1.6, 0, -sx * 0.32); // horns
  for (let k = 0; k < 5; k++) put(h, "cone", "armor", 0.22, 0.5 + (k % 2) * 0.25, 0.22, -0.4 + k * 0.2, 1.4, 0.2 - (k % 2) * 0.4); // turf
  return { meshes, mats, geos, root };
}
export function disposeMechSuit(suit) {
  for (const m of suit.meshes) { if (m.parent) m.parent.remove(m); }
  for (const k of Object.keys(suit.geos)) { try { suit.geos[k].dispose(); } catch { /* fine */ } }
  for (const k of Object.keys(suit.mats)) { try { suit.mats[k].dispose(); } catch { /* fine */ } }
}

// A bare skeleton with the rig's joint NAMES and pivots, so the same suit builder can
// dress a statue: the mech that climbs out of the ground before you become it.
function buildMechStatue(THREE) {
  const root = new THREE.Group(); root.name = "bt-mechstatue";
  const body = new THREE.Group(); body.name = "OofRigBody"; body.rotation.y = Math.PI; root.add(body);
  const pivots = { leftLeg: [-0.5, 2, 0], rightLeg: [0.5, 2, 0], leftArm: [-1.5, 4, 0], rightArm: [1.5, 4, 0], head: [0, 4, 0] };
  for (const k of Object.keys(pivots)) { const j = new THREE.Group(); j.name = "OofJoint_" + k; j.position.set(pivots[k][0], pivots[k][1], pivots[k][2]); body.add(j); }
  const suit = buildMechSuit(THREE, root);
  root.scale.setScalar(MECH_SCALE);
  return { root, suit };
}

// The infected look: a coat of turf from head to boot, with blades standing off it.
// Hangs off the rig ROOT (feet), like the cheese coat.
export function buildGrassShell(THREE) {
  const g = new THREE.Group();
  g.name = "bt-grassshell";
  const coat = new THREE.MeshBasicMaterial({ color: "#3ddc84", transparent: true, opacity: 0.82 });
  const blade = new THREE.MeshBasicMaterial({ color: "#8be04a" });
  const add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); g.add(mesh); return mesh; };
  add(new THREE.BoxGeometry(4.2, 2.3, 1.3), coat, 0, 3, 0);        // torso + arms
  add(new THREE.BoxGeometry(1.5, 1.3, 1.5), coat, 0, 4.6, 0);      // head
  for (const sx of [-0.55, 0.55]) add(new THREE.BoxGeometry(1.15, 2.1, 1.25), coat, sx, 1.05, 0); // legs
  const cone = new THREE.ConeGeometry(0.14, 0.7, 5);
  for (let k = 0; k < 14; k++) {
    const onHead = k < 7;
    const a = k * 0.9;
    add(cone, blade, onHead ? Math.cos(a) * 0.5 : (k % 2 ? 1 : -1) * (1.2 + (k % 3) * 0.3), onHead ? 5.5 + (k % 2) * 0.12 : 4.4, onHead ? Math.sin(a) * 0.5 : (k % 3 - 1) * 0.35);
  }
  return g;
}

// ---- the module -----------------------------------------------------------------------

export function createGrass(deps) {
  const { ctx, getSave, saveNow, toast, sfx, shake, flash, later, uid } = deps;
  const THREE = ctx.engine.THREE;

  const G = {
    load: { pet: false, wings: false, hammer: false },
    force: null,                 // debug: { pet, wings, hammer } overrides the avatar read
    loadT: 0, clock: 0, netT: 0, spreadT: 0, sweepT: 0, uiT: 0, fxT: 0,
    // tufts
    mesh: null, meshId: null, tmp: null,
    born: new Float32Array(TUFT_MAX), px: new Float32Array(TUFT_MAX), py: new Float32Array(TUFT_MAX),
    pz: new Float32Array(TUFT_MAX), ry: new Float32Array(TUFT_MAX), sc: new Float32Array(TUFT_MAX),
    shown: new Float32Array(TUFT_MAX), alive: new Uint8Array(TUFT_MAX), head: 0, live: 0,
    lastX: 0, lastZ: 0, hasLast: false, grounded: true,
    peerLast: new Map(),         // peer id -> [x, z] of their last tuft
    // powers
    awk: null,                   // { t, x, y, z, statue, statueId }
    awkSeq: 0, mechT: 0, awkCd: 0,
    flyT: 0, flyCd: 0, flyWarned: false,
    slam: null,                  // { phase: "up" | "fall", t, x, y, z }
    slamCd: 0, slamSeq: 0,
    // infection
    inf: null,                   // { owner, name } — I am a grass person, of this owner's chain
    mine: new Set(),             // peer ids currently grass through MY hammer (counted once each)
    seenSlam: new Set(), seenAwk: new Set(),
    known: new Set(),            // peer ids already met — a NEW peer's old events are history, not news
    out: { grass: null, mech: 0, gp: 0, gslam: null, awk: 0 }, // what fillState publishes
    dom: null,
  };

  const fx = () => deps.fx();
  const save = () => getSave();
  const inArena = () => deps.inArena();
  const busy = () => !!(G.awk || G.slam);
  const pos = () => ctx.player.position();
  const tp = (x, y, z) => { try { ctx.player.teleport([x, y, z]); } catch { /* fine */ } };
  const setGravity = (g) => { try { ctx.engine.physics.setGravity(g); } catch { /* fine */ } };
  const restGravity = () => setGravity(deps.ksFlying() ? 16 : GRAVITY_DEFAULT);
  const mmss = (s) => { const n = Math.ceil(s); return n >= 60 ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}` : String(n); };

  // ---- DOM: three power buttons (a second column, left of the sword's own) + the shout --
  function mkBtn(label, bottom, bg, fn) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label;
    b.style.cssText = "position:fixed;right:100px;bottom:" + bottom + "px;z-index:55;min-width:74px;font:700 20px system-ui,sans-serif;color:#fff;border:none;border-radius:12px;padding:12px 10px;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.35);touch-action:manipulation;user-select:none;display:none;background:" + bg + ";";
    b.addEventListener("click", fn);
    document.body.append(b);
    return { el: b, text: label, shown: false, dim: false };
  }
  function buildDom() {
    const banner = document.createElement("div");
    banner.style.cssText = "position:fixed;left:50%;top:20%;transform:translateX(-50%) scale(0.6);z-index:59;pointer-events:none;opacity:0;white-space:nowrap;font:900 clamp(34px,9vw,84px) system-ui,sans-serif;letter-spacing:.06em;color:#eaff8a;text-shadow:0 0 18px #3ddc84,0 0 44px #2f8f4a,0 4px 0 #173d22;transition:opacity .35s ease-out,transform .5s cubic-bezier(.2,1.6,.4,1);";
    banner.textContent = "GRASS AWAKEN";
    document.body.append(banner);
    G.dom = {
      banner,
      awk: mkBtn("🌿", 196, "linear-gradient(180deg,#3ddc84,#1f6b34)", awaken),
      fly: mkBtn("🪽", 272, "linear-gradient(180deg,#8be04a,#2f8f4a)", fly),
      slam: mkBtn("🔨", 348, "linear-gradient(180deg,#6b4423,#2f8f4a)", slamPress),
    };
  }
  // writes the DOM only when something actually changed (this runs at 5 Hz)
  function paintBtn(b, show, text, dim) {
    if (b.shown !== show) { b.shown = show; b.el.style.display = show ? "block" : "none"; }
    if (!show) return;
    if (b.text !== text) { b.text = text; b.el.textContent = text; }
    if (b.dim !== dim) { b.dim = dim; b.el.style.opacity = dim ? "0.55" : "1"; }
  }
  function refreshButtons() {
    if (!G.dom) return;
    const on = inArena();
    paintBtn(G.dom.awk, on && G.load.pet, G.mechT > 0 ? "🤖 " + Math.ceil(G.mechT) : G.awkCd > 0 ? "🌿 " + mmss(G.awkCd) : "🌿", G.mechT <= 0 && G.awkCd > 0);
    paintBtn(G.dom.fly, on && G.load.wings, G.flyT > 0 ? "🪽 " + Math.ceil(G.flyT) : G.flyCd > 0 ? "🪽 " + mmss(G.flyCd) : "🪽", G.flyT <= 0 && G.flyCd > 0);
    paintBtn(G.dom.slam, on && G.load.hammer, G.slamCd > 0 ? "🔨 " + Math.ceil(G.slamCd) : "🔨", G.slamCd > 0);
  }
  function showBanner() {
    if (!G.dom) return;
    const b = G.dom.banner;
    b.style.opacity = "1"; b.style.transform = "translateX(-50%) scale(1)";
    later(AWAKEN_FLOAT_S + 0.6, () => { if (G.dom) { G.dom.banner.style.opacity = "0"; G.dom.banner.style.transform = "translateX(-50%) scale(0.6)"; } });
  }

  // ---- what am I wearing? (the avatar service clones its state: ask once a second) -----
  function readLoadout() {
    if (G.force) { G.load.pet = !!G.force.pet; G.load.wings = !!G.force.wings; G.load.hammer = !!G.force.hammer; return; }
    let eq = null;
    try { const st = ctx.services.avatar.getState(); eq = st && st.equipped; } catch { eq = null; }
    G.load.pet = !!eq && eq.pet === PET_ID;
    G.load.wings = !!eq && eq.back === WINGS_ID;
    G.load.hammer = !!eq && eq.gear === HAMMER_ID;
  }

  // ---- tufts: one InstancedMesh, a ring buffer ----------------------------------------
  // Six blades fanned round a point, each a single triangle (drawn double-sided), dark
  // at the root and bright at the tip. Built lazily: a player with no pet in a room with
  // no pet never pays for it.
  function ensureTufts() {
    if (G.mesh) return true;
    try {
      const pts = [], cols = [];
      const root = new THREE.Color("#2f8f4a"), tip = new THREE.Color("#b6f26a");
      for (let b = 0; b < 6; b++) {
        const a = b * 1.047 + 0.3, r = 0.16 + (b % 2) * 0.12, h = 0.75 + (b % 3) * 0.28;
        const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
        const wx = -Math.sin(a) * 0.1, wz = Math.cos(a) * 0.1;
        pts.push(cx - wx, 0, cz - wz, cx + wx, 0, cz + wz, cx * 2.3, h, cz * 2.3);
        cols.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(geo, mat, TUFT_MAX);
      mesh.name = "bt-grasstufts";
      mesh.frustumCulled = false; // the instances roam the whole Place; the bounds are one tuft
      G.tmp = new THREE.Object3D();
      G.tmp.scale.setScalar(0); G.tmp.updateMatrix();
      for (let i = 0; i < TUFT_MAX; i++) mesh.setMatrixAt(i, G.tmp.matrix);
      mesh.instanceMatrix.needsUpdate = true;
      G.meshId = ctx.engine.parts.addCustom(mesh);
      G.mesh = mesh;
      return true;
    } catch { G.mesh = null; return false; /* headless: no grass, no harm */ }
  }
  function writeTuft(i, s) {
    const t = G.tmp;
    t.position.set(G.px[i], G.py[i], G.pz[i]);
    t.rotation.set(0, G.ry[i], 0);
    t.scale.setScalar(s);
    t.updateMatrix();
    G.mesh.setMatrixAt(i, t.matrix);
    G.shown[i] = s;
  }
  function placeTuft(x, y, z, big) {
    if (!ensureTufts()) return;
    const i = G.head;
    G.head = (G.head + 1) % TUFT_MAX; // past the cap the OLDEST tuft is the one replaced
    if (!G.alive[i]) G.live++;
    G.alive[i] = 1; G.born[i] = G.clock;
    G.px[i] = x; G.py[i] = y; G.pz[i] = z;
    G.ry[i] = Math.random() * 6.283;
    G.sc[i] = (0.85 + Math.random() * 0.5) * (big || 1);
    writeTuft(i, 0.01);
    G.mesh.instanceMatrix.needsUpdate = true;
  }
  // sprout / wilt. Only tufts in their first or last second touch the matrix buffer.
  function sweepTufts() {
    if (!G.mesh || !G.live) return;
    let dirty = false;
    for (let i = 0; i < TUFT_MAX; i++) {
      if (!G.alive[i]) continue;
      const age = G.clock - G.born[i];
      let s = G.sc[i];
      if (age >= TUFT_LIFE_S) { G.alive[i] = 0; G.live--; s = 0; }
      else if (age > TUFT_LIFE_S - TUFT_WILT_S) s *= (TUFT_LIFE_S - age) / TUFT_WILT_S;
      else if (age < TUFT_GROW_S) s *= Math.max(0.05, age / TUFT_GROW_S);
      if (s !== G.shown[i]) { writeTuft(i, s); dirty = true; }
    }
    if (dirty) G.mesh.instanceMatrix.needsUpdate = true;
  }
  function stepTrail(me) {
    if (!G.load.pet) { G.hasLast = false; return; }
    if (!G.hasLast) { G.lastX = me[0]; G.lastZ = me[2]; G.hasLast = true; return; }
    const dx = me[0] - G.lastX, dz = me[2] - G.lastZ;
    const dd = dx * dx + dz * dz;
    if (dd < TUFT_STEP * TUFT_STEP) return;
    G.lastX = me[0]; G.lastZ = me[2];
    // only feet on the ground leave grass — and a teleport is not a walk
    if (!G.grounded || dd > 400 || G.awk || G.slam) return;
    const big = G.mechT > 0 ? 2.2 : 1;
    placeTuft(me[0] + (Math.random() - 0.5) * 0.9, me[1] + 0.03, me[2] + (Math.random() - 0.5) * 0.9, big);
  }

  // ---- 🌿 GRASS AWAKEN ----------------------------------------------------------------
  function awaken() {
    if (!inArena() || deps.frozen() || !G.load.pet || busy()) return;
    if (G.mechT > 0) { toast("You already ARE the mech. Stomp something.", "🤖", 1600); return; }
    if (G.awkCd > 0) { toast(`The Grass God is resting — ${mmss(G.awkCd)}`, "🌿", 1800); return; }
    const me = pos();
    endFly(true); deps.endKsFly();
    let statue = null, statueId = null;
    try {
      statue = buildMechStatue(THREE);
      statue.root.position.set(me[0], me[1] - 5 * MECH_SCALE, me[2]);
      statue.root.rotation.y = ctx.player.avatar ? ctx.player.avatar.rotation.y : 0;
      statueId = ctx.engine.parts.addCustom(statue.root);
    } catch { statue = null; }
    G.awk = { t: 0, x: me[0], y: me[1], z: me[2], statue, statueId };
    G.awkCd = AWAKEN_CD_S;
    G.awkSeq++; G.out.awk = G.awkSeq;
    deps.publishSoon();
    showBanner();
    const f = fx();
    if (f) {
      f.text([me[0], me[1] + 8, me[2]], "GRASS AWAKEN", { color: "#b6f26a", scale: 1.8, life: AWAKEN_FLOAT_S });
      for (let w = 0; w < 3; w++) later(w * 0.25, () => { const f2 = fx(); if (f2) f2.ring([me[0], me[1] + 0.25, me[2]], { color: GREENS[w], r1: 9 + w * 5, life: 0.8 }); });
    }
    flash("#3ddc84", 0.22, 600);
    shake(0.35, AWAKEN_FLOAT_S);
    sfx("warp");
    refreshButtons();
  }
  function dropStatue() {
    const a = G.awk;
    if (!a || !a.statue) return;
    try { disposeMechSuit(a.statue.suit); } catch { /* fine */ }
    try { ctx.engine.parts.remove(a.statueId); } catch { /* gone */ }
    a.statue = null;
  }
  function stepAwaken(dt) {
    const a = G.awk;
    a.t += dt;
    const k = Math.min(1, a.t / AWAKEN_FLOAT_S);
    const e = 1 - (1 - k) * (1 - k);
    tp(a.x, a.y + AWAKEN_RISE * e, a.z);
    // the mech shoulders its way up through the sand under you, shuddering as it comes
    if (a.statue) a.statue.root.position.set(a.x + Math.sin(a.t * 40) * 0.12 * (1 - k), a.y - 5 * MECH_SCALE * (1 - k), a.z);
    G.fxT -= dt;
    const f = fx();
    if (f && G.fxT <= 0) {
      G.fxT = 0.08;
      const ang = Math.random() * 6.283, r = 2 + Math.random() * 5;
      f.spawn([a.x + Math.cos(ang) * r, a.y + 0.3, a.z + Math.sin(ang) * r], { shape: Math.random() < 0.5 ? "box" : "shard", color: Math.random() < 0.5 ? "#6b4423" : GREENS[(Math.random() * 4) | 0], size: 0.35 + Math.random() * 0.4, vel: [Math.cos(ang) * 4, 9 + Math.random() * 8, Math.sin(ang) * 4], grav: 26, life: 0.9 });
      f.spawn([a.x + (Math.random() - 0.5) * 2, a.y + AWAKEN_RISE * e + 1, a.z + (Math.random() - 0.5) * 2], { shape: "sphere", color: "#eaff8a", size: 0.2, vel: [0, 3, 0], grav: -2, life: 0.7 });
    }
    if (k < 1) return;
    // ...and then you are not above it any more. You ARE it.
    dropStatue();
    G.awk = null;
    tp(a.x, a.y + 0.3, a.z);
    G.mechT = MECH_S;
    deps.applyPassives(); deps.refreshRigs(); deps.publishSoon();
    try { ctx.engine.camera.setDistance(26); } catch { /* fine */ }
    if (f) {
      f.ring([a.x, a.y + 0.3, a.z], { color: "#b6f26a", r1: 20, life: 0.8 });
      f.burst([a.x, a.y + 6, a.z], { count: 26, colors: GREENS.concat(["#6b4423", "#ffffff"]), shapes: ["shard", "box", "sphere"], speed: 14, up: 10, size: 0.5, life: 1.0, grav: 22 });
    }
    flash("#b6f26a", 0.35, 700);
    shake(0.8, 0.6);
    sfx("win");
    toast(`GRASS MECH. ${MECH_S} seconds: three times the size, triple damage, a reach to match — and you take half.`, "🤖", 4200);
  }
  function endMech(quiet) { if (G.mechT > 0) shedMech(quiet); }
  function shedMech(quiet) {
    G.mechT = 0;
    deps.applyPassives(); deps.refreshRigs(); deps.publishSoon();
    try { ctx.engine.camera.reset(); } catch { /* fine */ }
    if (quiet) return;
    const me = pos(), f = fx();
    if (f) f.burst([me[0], me[1] + 6, me[2]], { count: 20, colors: GREENS, shapes: ["box", "shard"], speed: 9, up: 6, size: 0.4, life: 1.1, grav: 8, drag: 2, spin: 6 });
    sfx("pop");
    toast("The mech crumbles back into lawn clippings.", "🌿", 2600);
  }

  // ---- 🪽 wings -----------------------------------------------------------------------
  // The engine gives a Place gravity, not velocity — so flight is a little controller ON
  // gravity: every step it is set to whatever pushes vertical speed toward "climb" (JUMP
  // held) or "glide" (released). Walking keeps steering, so you go wherever you look.
  function fly() {
    if (!inArena() || deps.frozen() || !G.load.wings || busy()) return;
    if (G.flyT > 0) { endFly(false); return; } // a second tap folds the wings early
    if (G.flyCd > 0) { toast(`Your wings are catching their breath — ${mmss(G.flyCd)}`, "🪽", 1800); return; }
    deps.endKsFly();
    G.flyT = FLY_S; G.flyCd = FLY_CD_S; G.flyWarned = false;
    deps.applyPassives();
    const me = pos(), f = fx();
    if (f) {
      f.ring([me[0], me[1] + 0.2, me[2]], { color: "#b6f26a", r1: 8, life: 0.5 });
      f.burst([me[0], me[1] + 2.5, me[2]], { count: 14, colors: GREENS, shapes: ["box"], speed: 6, up: 4, size: 0.3, life: 1.0, grav: 3, drag: 2.5, spin: 7 });
    }
    sfx("warp");
    toast(`WINGS OUT — ${FLY_S} seconds. Hold JUMP to climb, let go to glide, steer anywhere.`, "🪽", 3200);
    refreshButtons();
  }
  function stepFly(dt, me) {
    G.flyT -= dt;
    let vy = 0, up = false;
    try { vy = ctx.player.velocity()[1] || 0; } catch { vy = 0; }
    try { up = !!ctx.engine.input.isJumpHeld(); } catch { up = false; }
    const g = (vy - (up ? FLY_UP : FLY_SINK)) * 14;
    setGravity(g > 420 ? 420 : g < -420 ? -420 : g);
    G.fxT -= dt;
    const f = fx();
    if (f && G.fxT <= 0) {
      G.fxT = 0.09;
      f.spawn([me[0] + (Math.random() - 0.5) * 3, me[1] + 2.5, me[2] + (Math.random() - 0.5) * 3], { shape: "box", color: GREENS[(Math.random() * 4) | 0], size: 0.24, vel: [(Math.random() - 0.5) * 2, -1.5, (Math.random() - 0.5) * 2], grav: 3, spin: 8, life: 0.9, drag: 1 });
    }
    if (!G.flyWarned && G.flyT <= 3) { G.flyWarned = true; toast("Three seconds of wing left — find some ground!", "🪽", 2200); }
    if (G.flyT <= 0) landFly(false);
  }
  function endFly(quiet) { if (G.flyT > 0) landFly(quiet); }
  function landFly(quiet) {
    G.flyT = 0;
    restGravity();
    deps.applyPassives();
    if (!quiet) toast("Wings folded. Two minutes till they open again.", "🪽", 2000);
  }

  // ---- 🔨 the hammer: slam, infect, count ----------------------------------------------
  function slamPress() {
    if (!inArena() || deps.frozen() || !G.load.hammer || busy()) return;
    if (G.slamCd > 0) { toast(`The hammer is still ringing — ${Math.ceil(G.slamCd)}s`, "🔨", 1500); return; }
    endFly(true); deps.endKsFly();
    const me = pos();
    G.slam = { phase: "up", t: 0, x: me[0], y: me[1], z: me[2] };
    G.slamCd = SLAM_CD_S;
    const f = fx();
    if (f) {
      f.ring([me[0], me[1] + 0.2, me[2]], { color: "#8be04a", r1: 7, life: 0.4 });
      f.burst([me[0], me[1] + 1, me[2]], { count: 10, colors: ["#6b4423", "#3ddc84", "#b09a68"], speed: 7, up: 9, size: 0.32, life: 0.6, grav: 24 });
    }
    shake(0.3, 0.3);
    sfx("boing");
    refreshButtons();
  }
  function stepSlam(dt, me) {
    const s = G.slam;
    s.t += dt;
    const f = fx();
    if (s.phase === "up") {
      // the hammer THROWS you: a scripted rise, then the sky lets go and the fall is yours
      const k = Math.min(1, s.t / SLAM_RISE_S), e = 1 - (1 - k) * (1 - k);
      tp(s.x, s.y + SLAM_RISE * e, s.z);
      if (f) f.spawn([s.x, s.y + SLAM_RISE * e, s.z], { shape: "box", color: "#b6f26a", size: 0.5, vel: [0, -20, 0], grav: 0, life: 0.3, stretch: 6, opacity: 0.7 });
      if (k >= 1) { s.phase = "fall"; s.t = 0; setGravity(GRAVITY_DEFAULT * 2.4); toast("STEER! Land ON somebody.", "🔨", 1800); }
      return;
    }
    if (f && Math.floor(s.t * 24) !== Math.floor((s.t - dt) * 24)) f.spawn([me[0], me[1] + 3, me[2]], { shape: "box", color: "#eaff8a", size: 0.5, vel: [0, 22, 0], grav: 0, life: 0.3, stretch: 7, opacity: 0.6 });
    if ((s.t > 0.15 && G.grounded) || s.t > 6) impact(me);
  }
  function impact(me) {
    G.slam = null;
    restGravity();
    G.slamSeq++;
    G.out.gslam = { id: G.slamSeq, x: me[0], y: me[1], z: me[2], r: SLAM_R };
    deps.publishSoon();
    const f = fx();
    if (f) {
      f.ring([me[0], me[1] + 0.2, me[2]], { color: "#3ddc84", r1: SLAM_R + 6, life: 0.6 });
      f.ring([me[0], me[1] + 0.3, me[2]], { color: "#b6f26a", r1: SLAM_R, life: 0.45 });
      f.ring([me[0], me[1] + 0.12, me[2]], { color: "#2f8f4a", r1: SLAM_R, life: 3.0, fill: true, opacity: 0.55 });
      f.burst([me[0], me[1] + 1, me[2]], { count: 22, colors: GREENS.concat(["#6b4423"]), shapes: ["shard", "box"], speed: 13, up: 12, size: 0.42, life: 0.9, grav: 28 });
    }
    // a lawn erupts where the hammer lands (the same pooled tufts the pet walks out)
    for (let k = 0; k < 14; k++) { const a = k * 0.449, r = 1.5 + (k % 4) * 1.4; placeTuft(me[0] + Math.cos(a) * r, me[1] + 0.03, me[2] + Math.sin(a) * r, 1.6); }
    shake(0.75, 0.5);
    flash("#3ddc84", 0.22, 450);
    sfx("boing");
    let hit = 0;
    for (const d of deps.dummies()) { if (!d.dead && (d.x - me[0]) ** 2 + (d.z - me[2]) ** 2 <= SLAM_R * SLAM_R && infectDummy(d)) hit++; }
    for (const p of deps.roster()) { if (p.pos && p.state && p.state.inArena && (p.pos[0] - me[0]) ** 2 + (p.pos[2] - me[2]) ** 2 <= SLAM_R * SLAM_R) { hit++; if (f) f.text([p.pos[0], p.pos[1] + 6, p.pos[2]], "GRASS!", { color: "#b6f26a", scale: 1.2, life: 1.0 }); } }
    if (!hit) toast("You landed on nobody. The lawn is unimpressed.", "🔨", 2000);
  }
  // A dummy turns: recoloured, and it sprouts (the tufts are extra parts in d.parts, so
  // they go when the dummy does). Returns true only on a NEW infection.
  function infectDummy(d) {
    if (d.dead || d.grass) return false;
    d.grass = true;
    for (let k = 0; k < d.parts.length; k++) { try { ctx.engine.parts.setColor(d.parts[k], GREENS[k % 3]); } catch { /* gone */ } }
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9;
      try { const id = uid("bt_dummy_"); ctx.engine.parts.create({ id, shape: "wedge", size: [0.26, 0.8 + (k % 3) * 0.25, 0.26], position: [d.x + Math.cos(a) * (k < 4 ? 0.4 : 1.2), FLOOR_TOP + (k < 4 ? 5.3 : 3.7), d.z + Math.sin(a) * (k < 4 ? 0.4 : 0.5)], rotation: [0, k * 51, 0], color: k % 2 ? "#8be04a" : "#b6f26a", material: "plastic", canCollide: false }); d.parts.push(id); } catch { /* fine */ }
    }
    const f = fx();
    if (f) {
      f.burst([d.x, FLOOR_TOP + 3.4, d.z], { count: 12, colors: GREENS, shapes: ["box", "shard"], speed: 6, up: 7, size: 0.32, life: 0.8, grav: 16 });
      f.text([d.x, FLOOR_TOP + 6.6, d.z], "GRASS!", { color: "#b6f26a", scale: 1.1, life: 1.0 });
    }
    counted("A dummy");
    return true;
  }
  // One more fighter turned through MY hammer (a slam victim, or anyone down the chain).
  function counted(who) {
    const s = save();
    s.gInf = (s.gInf || 0) + 1;
    const need = !s.crown;
    if (need && s.gInf >= CROWN_NEED) {
      s.crown = true;
      saveNow();
      deps.onCrown();
      return;
    }
    saveNow();
    if (need) toast(`${who} is grass now — ${s.gInf} / ${CROWN_NEED} infected through your hammer.`, "🌿", 2200);
  }
  // I turn. Until I die I am a grass person of `owner`'s chain, and I pass it on by touch.
  function infect(owner, name) {
    if (G.inf || !owner) return;
    G.inf = { owner, name: name || "someone" };
    const me = pos(), f = fx();
    if (f) {
      f.burst([me[0], me[1] + 3, me[2]], { count: 16, colors: GREENS, shapes: ["box", "shard"], speed: 7, up: 8, size: 0.34, life: 0.9, grav: 14 });
      f.text([me[0], me[1] + 6.4, me[2]], "GRASS!", { color: "#b6f26a", scale: 1.3, life: 1.1 });
    }
    flash("#3ddc84", 0.35, 700);
    shake(0.35, 0.35);
    sfx("pop");
    toast(`You are GRASS now — ${G.inf.name}'s hammer started it. It lasts until you die, and everyone you touch turns too.`, "🌿", 5200);
    deps.refreshRigs(); deps.publishSoon();
  }

  // ---- the roster pass (~7 Hz): slams aimed at me, grass people brushing past, my chain --
  function netTick(me) {
    const myId = deps.myId();
    const roster = deps.roster();
    const arena = inArena();
    let nameOf = null;
    for (const p of roster) {
      const st = p.state; if (!st) continue;
      // presence state is sticky: the slam/awaken a peer did before I met them is still
      // on their row. First sight only marks it seen.
      const isNew = !G.known.has(p.id);
      if (isNew) G.known.add(p.id);
      // a peer's GRASS AWAKEN is shouted over their head for everyone
      if (st.awk) { const key = p.id + ":k" + st.awk; if (!G.seenAwk.has(key)) { G.seenAwk.add(key); const f = fx(); if (f && p.pos && st.inArena && !isNew) { f.text([p.pos[0], p.pos[1] + 9, p.pos[2]], "GRASS AWAKEN", { color: "#b6f26a", scale: 1.6, life: AWAKEN_FLOAT_S }); f.ring([p.pos[0], p.pos[1] + 0.3, p.pos[2]], { color: "#3ddc84", r1: 12, life: 0.8 }); } } }
      // their pet lays grass under THEM on my screen too (gp 1 = pet out, feet down)
      if (st.gp === 1 && p.pos) {
        const last = G.peerLast.get(p.id);
        if (!last) G.peerLast.set(p.id, [p.pos[0], p.pos[2]]);
        else {
          const dd = (p.pos[0] - last[0]) ** 2 + (p.pos[2] - last[1]) ** 2;
          if (dd >= TUFT_STEP * TUFT_STEP) { last[0] = p.pos[0]; last[1] = p.pos[2]; if (dd < 400) placeTuft(p.pos[0], p.pos[1] + 0.03, p.pos[2], st.mech ? 2.2 : 1); }
        }
      }
      if (!myId) continue;
      // a hammer came down: was I under it?
      if (st.gslam) {
        const key = p.id + ":g" + st.gslam.id;
        if (!G.seenSlam.has(key)) {
          G.seenSlam.add(key);
          const r = Math.min(12, Number(st.gslam.r) || SLAM_R);
          if (arena && !isNew && (me[0] - st.gslam.x) ** 2 + (me[2] - st.gslam.z) ** 2 <= r * r && Math.abs(me[1] - (Number(st.gslam.y) || me[1])) < 10) {
            deps.takeDamage(SLAM_DMG, p.id);
            if (inArena()) infect(p.id, p.name);
          }
        }
      }
      const theirs = st.inArena && typeof st.grass === "string" ? st.grass : null;
      // the infection: walk into a grass person and you are one (my own chain cannot turn me)
      if (arena && !G.inf && theirs && theirs !== myId && p.pos && (me[0] - p.pos[0]) ** 2 + (me[2] - p.pos[2]) ** 2 <= TOUCH_R * TOUCH_R && Math.abs(me[1] - p.pos[1]) < 5) {
        if (!nameOf) { nameOf = new Map(); for (const q of roster) nameOf.set(q.id, q.name); }
        infect(theirs, nameOf.get(theirs) || p.name);
      }
      // my chain, counted off the roster: each fighter once per time they turn
      if (theirs === myId) {
        if (!G.mine.has(p.id)) { G.mine.add(p.id); counted(p.name || "A fighter"); }
        // ...and my grass people infect my straw ones
        if (p.pos) for (const d of deps.dummies()) { if (!d.dead && !d.grass && (d.x - p.pos[0]) ** 2 + (d.z - p.pos[2]) ** 2 <= TOUCH_R * TOUCH_R) infectDummy(d); }
      } else if (G.mine.has(p.id)) G.mine.delete(p.id);
    }
  }
  // straw spreads to straw (solo, this is the whole infection): once a second
  function spreadDummies() {
    const ds = deps.dummies();
    for (const a of ds) {
      if (a.dead || !a.grass) continue;
      for (const b of ds) { if (!b.dead && !b.grass && (a.x - b.x) ** 2 + (a.z - b.z) ** 2 <= DUMMY_SPREAD_R * DUMMY_SPREAD_R) infectDummy(b); }
    }
  }

  // ---- lifecycle ----------------------------------------------------------------------
  function update(dt) {
    G.clock += dt;
    if (G.awkCd > 0) G.awkCd = Math.max(0, G.awkCd - dt);
    if (G.flyCd > 0) G.flyCd = Math.max(0, G.flyCd - dt);
    if (G.slamCd > 0) G.slamCd = Math.max(0, G.slamCd - dt);
    G.loadT -= dt;
    if (G.loadT <= 0) { G.loadT = 1; readLoadout(); }
    const me = pos();
    try { G.grounded = !!ctx.engine.physics.isGrounded(); } catch { G.grounded = true; }

    if (G.awk) stepAwaken(dt);
    if (G.slam) stepSlam(dt, me);
    if (G.flyT > 0) stepFly(dt, me);
    if (G.mechT > 0) { G.mechT -= dt; if (G.mechT <= 0) shedMech(false); }
    // taking the item off mid-power ends the power (the shop is one tap away)
    if (G.mechT > 0 && !G.load.pet) endMech(false);
    if (G.flyT > 0 && !G.load.wings) endFly(false);

    stepTrail(me);
    G.sweepT -= dt;
    if (G.sweepT <= 0) { G.sweepT = 0.1; sweepTufts(); }

    G.netT -= dt;
    if (G.netT <= 0) { G.netT = NET_TICK; try { netTick(me); } catch { /* a bad roster row is not a dead Place */ } }
    G.spreadT -= dt;
    if (G.spreadT <= 0) { G.spreadT = 1; if (inArena()) spreadDummies(); }
    G.uiT -= dt;
    if (G.uiT <= 0) { G.uiT = 0.2; refreshButtons(); }
  }
  // death, the leave pad, a dispose: every power stops and the infection ends with you
  function onLeaveArena() {
    if (G.awk) { dropStatue(); G.awk = null; }
    if (G.slam) { G.slam = null; }
    if (G.flyT > 0) G.flyT = 0;
    setGravity(GRAVITY_DEFAULT);
    if (G.mechT > 0) endMech(true);
    if (G.inf) { G.inf = null; deps.refreshRigs(); }
    if (G.dom) { G.dom.banner.style.opacity = "0"; }
    refreshButtons();
  }
  // game.js calls this as it publishes: the grass half of my presence state
  function fillState(st) {
    st.grass = G.inf ? G.inf.owner : null;
    st.mech = G.mechT > 0 ? 1 : 0;
    st.gp = G.load.pet ? (G.grounded && !G.awk && !G.slam ? 1 : 2) : 0;
    st.gslam = G.out.gslam;
    st.awk = G.out.awk;
  }
  function dispose() {
    onLeaveArena();
    if (G.mesh) {
      try { ctx.engine.parts.remove(G.meshId); } catch { /* gone */ }
      try { G.mesh.geometry.dispose(); G.mesh.material.dispose(); if (G.mesh.dispose) G.mesh.dispose(); } catch { /* fine */ }
      G.mesh = null;
    }
    if (G.dom) { for (const k of ["banner"]) { try { G.dom[k].remove(); } catch { /* fine */ } } for (const k of ["awk", "fly", "slam"]) { try { G.dom[k].el.remove(); } catch { /* fine */ } } G.dom = null; }
  }

  try { buildDom(); } catch { G.dom = null; /* headless */ }
  readLoadout();

  return {
    update, dispose, onLeaveArena, fillState, refreshButtons,
    mechOn: () => G.mechT > 0,
    infected: () => !!G.inf,
    flying: () => G.flyT > 0,
    busy,
    dmgMult: () => (G.mechT > 0 ? MECH_DMG : 1),
    reachMult: () => (G.mechT > 0 ? MECH_REACH : 1),
    speedMult: () => (G.mechT > 0 ? MECH_SPEED : 1) * (G.flyT > 0 ? FLY_SPEED : 1),
    armor: () => (G.mechT > 0 ? 0.5 : 1),
    // ---- test seams (game.js debugGrass / debugState) ----
    debug: () => ({ pet: G.load.pet, wings: G.load.wings, hammer: G.load.hammer, mechT: Math.ceil(G.mechT), awaking: !!G.awk, awkCd: Math.ceil(G.awkCd), flyT: Math.ceil(G.flyT), flyCd: Math.ceil(G.flyCd), slamming: !!G.slam, slamCd: Math.ceil(G.slamCd), infectedBy: G.inf ? G.inf.owner : null, tufts: G.live }),
    debugForce: (f) => { G.force = f || null; readLoadout(); refreshButtons(); },
    debugCooldowns: () => { G.awkCd = 0; G.flyCd = 0; G.slamCd = 0; refreshButtons(); },
    debugInfect: () => infect("debug", "a test hammer"),
    press: { awaken, fly, slam: slamPress },
  };
}
