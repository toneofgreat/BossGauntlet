// PIG HIDE — pigs.js (spec 27 §2.4, §7, §9.1, §9.3; task M16-T04, part D).
//
// Owns: every pig look (local avatar, remote rigs, Mad Scientist clones), every pig ability
// (dash, creep, plane, ball, thump, clone, swap, radar), the pig's walk speed, and the pig tag
// policy (§9.0). Writer of S.pig only. Never touches round fields, never publishes, never calls
// net.setPeerHidden (round.js §4.10 is the only caller), never sets a rig root's `.visible`.
//
// Interfaces this file codes against (spec §2): config.js (read through a namespace import so a
// missing optional export can never break module linking), city.js (bounds + clampToCity),
// rigs (passed in: rigFor / setLook / setTagVisible / xray) and fx (passed in: dust / sparkle).
//
// Resource rule. rigs.setLook() disposes a replaced look's geometries AND materials, so a look
// handed to rigs must own every geometry and material it uses. Each model therefore builds its
// own small material set (shared only inside that one model). Clones and the local plane are
// not looks: this file adds them through parts.addCustom and disposes them itself.

import * as C from "./config.js";
import * as CITY from "./city.js";

// ---------------------------------------------------------------------------------------------
// Constants (TUNE first, the spec's own values as a fallback so a missing key never NaNs)
// ---------------------------------------------------------------------------------------------

function tn(key, dflt) {
  const T = C.TUNE;
  const v = T ? T[key] : undefined;
  return typeof v === "number" && Number.isFinite(v) ? v : dflt;
}
function tstr(key, dflt) {
  const T = C.TUNE;
  const v = T ? T[key] : undefined;
  return typeof v === "string" && v ? v : dflt;
}

const K = {
  WALK_DEFAULT: tn("WALK_DEFAULT", 16),
  DASH_WALK: tn("DASH_WALK", 32), DASH_S: tn("DASH_S", 5), DASH_CD_S: tn("DASH_CD_S", 30),
  CREEP_S: tn("CREEP_S", 3), CREEP_MULT: tn("CREEP_MULT", 20), CREEP_WALK: tn("CREEP_WALK", 100),
  PLANE_S: tn("PLANE_S", 5), PLANE_CD_S: tn("PLANE_CD_S", 60), PLANE_ARRIVE_S: tn("PLANE_ARRIVE_S", 1.0),
  PLANE_SPEED: tn("PLANE_SPEED", 60), PLANE_RISE: tn("PLANE_RISE", 24), PLANE_CEIL_Y: tn("PLANE_CEIL_Y", 70),
  BALL_S: tn("BALL_S", 10), BALL_WALK: tn("BALL_WALK", 48),
  THUMP_S: tn("THUMP_S", 2), THUMP_CD_S: tn("THUMP_CD_S", 15), THUMP_SHAKE: tn("THUMP_SHAKE", 0.7),
  THUMP_LOBBY_R: tn("THUMP_LOBBY_R", 30),
  BOAR_WALK: tn("BOAR_WALK", 32), SWAP_CD_S: tn("SWAP_CD_S", 50),
  CLONE_MOVE_DEBOUNCE_S: tn("CLONE_MOVE_DEBOUNCE_S", 1),
  RADAR_S: tn("RADAR_S", 5), RADAR_CD_S: tn("RADAR_CD_S", 45),
  XRAY_YELLOW: tstr("XRAY_YELLOW", "#ffff00"),
  PIG_CENTER_Y: tn("PIG_CENTER_Y", 1.2),
  PIG_ABSENT_S: tn("PIG_ABSENT_S", 15),
};
const PLANE_DEPART_S = 1.0;      // §7.5 step 3: "fades over 1 s"
const PLANE_FAR = 120;           // §7.5 step 1: 120 studs away ...
const PLANE_HIGH = 40;           // ... and 40 studs above
const DASH_TRAIL_S = 0.15;       // §7.2 dust trail cadence
const SWAP_MIN_DIST = 2;         // §7.8 "the clone is >= 2 studs away"
const CREEP_SKIN = 0.9;          // §7.4 raycast clearance
const PLANE_CRUISE_UP = 14;      // §7.5 the plane climbs to this far above where it picked you up
const PLANE_CRUISE_MIN = 10;     // ...and at least this far above the ground under it
const PLANE_LAND_S = 0.6;        // the last 0.6 s of the flight glides down to land
const CREEP_OPACITY = 0.3;       // §7.4 local look opacity
const CLONE_GREEN = "#5bd16a";

const DEG = 180 / Math.PI;

// The ability table (§7, §10.1). config.ABILITIES wins key by key; this is only the fallback.
const AB_DEFAULT = {
  dash:  { id: "dash",  name: "Speed Boost",     icon: "💨", label: "Speed Boost",     slot: "E", cooldownS: K.DASH_CD_S,  durationS: K.DASH_S,  perRound: false },
  creep: { id: "creep", name: "Creep",           icon: "👻", label: "Creep",           slot: "E", cooldownS: 0,            durationS: K.CREEP_S, perRound: true },
  plane: { id: "plane", name: "Call Plane",      icon: "✈️", label: "Call Plane",      slot: "E", cooldownS: K.PLANE_CD_S, durationS: K.PLANE_S, perRound: false },
  ball:  { id: "ball",  name: "Ball Roll",       icon: "⚽", label: "Ball Roll",       slot: "E", cooldownS: 0,            durationS: K.BALL_S,  perRound: true },
  thump: { id: "thump", name: "Thump",           icon: "💥", label: "Thump",           slot: "Q", cooldownS: K.THUMP_CD_S, durationS: K.THUMP_S, perRound: false },
  clone: { id: "clone", name: "Make Clone",      icon: "🧪", label: "Make Clone",      slot: "E", cooldownS: K.CLONE_MOVE_DEBOUNCE_S, durationS: 0, perRound: false },
  swap:  { id: "swap",  name: "Swap With Clone", icon: "🔄", label: "Swap With Clone", slot: "Q", cooldownS: K.SWAP_CD_S,  durationS: 0,         perRound: false },
  radar: { id: "radar", name: "Pig Radar",       icon: "📡", label: "Pig Radar",       slot: "T", cooldownS: K.RADAR_CD_S, durationS: K.RADAR_S, perRound: false },
};
const PIG_ABILITY_IDS = Object.keys(AB_DEFAULT);

function ability(id) {
  const base = AB_DEFAULT[id];
  if (!base) return null;
  const cfg = C.ABILITIES && C.ABILITIES[id];
  if (!cfg || typeof cfg !== "object") return base;
  const out = { ...base };
  for (const k of ["name", "icon", "label", "slot"]) if (typeof cfg[k] === "string" && cfg[k]) out[k] = cfg[k];
  for (const k of ["cooldownS", "durationS"]) if (typeof cfg[k] === "number" && Number.isFinite(cfg[k])) out[k] = cfg[k];
  if (typeof cfg.perRound === "boolean") out.perRound = cfg.perRound;
  return out;
}

const KIT_FALLBACK = {
  normal: [], speedy: ["dash"], strong: [], creeper: ["creep"], flying: ["plane"],
  casoh: ["ball", "thump"], boar: [], scientist: ["clone", "swap"],
};

function pigClassIds() {
  if (Array.isArray(C.PIG_CLASSES) && C.PIG_CLASSES.length) return C.PIG_CLASSES.map((c) => c && c.id);
  return Object.keys(KIT_FALLBACK);
}
function isPigClassId(id) {
  return typeof id === "string" && pigClassIds().includes(id);
}
function kitOf(classId) {
  if (Array.isArray(C.PIG_CLASSES)) {
    const c = C.PIG_CLASSES.find((x) => x && x.id === classId);
    if (c && Array.isArray(c.abilities)) return c.abilities.filter((a) => AB_DEFAULT[a]);
  }
  return KIT_FALLBACK[classId] || [];
}
function baseWalk(classId) {
  try {
    if (typeof C.pigWalk === "function") {
      const w = C.pigWalk(classId);
      if (typeof w === "number" && Number.isFinite(w)) return w;
    }
  } catch { /* fall through */ }
  return classId === "boar" ? K.BOAR_WALK : K.WALK_DEFAULT;
}

// Skins (§10.3). Fallback = the spec table, so a preview never renders grey.
const SKIN_FALLBACK = [
  ["pink",     "#f4a7b9", "#f9c9d4", "#e88aa0", "#e07f97", "#5a3a3a", "#ff6f91", "none"],
  ["mud",      "#b88a6a", "#d2a98a", "#9a6a4a", "#8a5a3a", "#3a2a1a", "#6b4a2f", "spots"],
  ["spotted",  "#f7e6dc", "#ffffff", "#f2b5b5", "#e9a0a0", "#3a2a2a", "#2b2b2b", "spots"],
  ["midnight", "#2f3a5a", "#45507a", "#5a6aa0", "#2a3350", "#111522", "#88c9e8", "sparkle"],
  ["candy",    "#ff9ad5", "#ffd1ec", "#ff6fb8", "#c86bff", "#7a2a5a", "#7ff7ff", "stripes"],
  ["mint",     "#9be8c8", "#d7fff0", "#6ccfa6", "#5ab890", "#3a2a1a", "#4a2f1f", "spots"],
  ["lava",     "#3a1a12", "#5a2a1a", "#ff6a1a", "#ff4a1a", "#1a0a08", "#ffb21a", "sparkle"],
  ["golden",   "#f2c94c", "#ffe58a", "#d4a428", "#c9971f", "#6b5310", "#fff4b0", "sparkle"],
  ["rainbow",  "#ff8fb1", "#ffffff", "#ffd36f", "#7fd3ff", "#3a2a3a", "#b98aff", "rainbow"],
  ["galaxy",   "#2a1a4a", "#3e2a6e", "#8a6aff", "#5a3ab0", "#0e0a1e", "#ffffff", "galaxy"],
].map(([id, body, belly, snout, ear, hoof, accent, pattern]) => ({
  id, colors: { body, belly, snout, ear, hoof, accent }, pattern, glow: pattern === "sparkle" || pattern === "galaxy",
}));
const SLOTS = ["body", "belly", "snout", "ear", "hoof", "accent"];

function skinOf(skinId) {
  const list = Array.isArray(C.PIG_SKINS) && C.PIG_SKINS.length ? C.PIG_SKINS : SKIN_FALLBACK;
  const s = list.find((x) => x && x.id === skinId) || list[0] || SKIN_FALLBACK[0];
  const fb = SKIN_FALLBACK.find((x) => x.id === s.id) || SKIN_FALLBACK[0];
  const colors = {};
  for (const slot of SLOTS) {
    const v = s.colors && s.colors[slot];
    colors[slot] = typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fb.colors[slot];
  }
  return { id: s.id, colors, pattern: typeof s.pattern === "string" ? s.pattern : fb.pattern, glow: !!s.glow };
}

// Plane liveries (§7.5): 1 red biplane, 2 yellow seaplane, 3 silver jet.
const LIVERY_FALLBACK = {
  1: { kind: "biplane",  body: "#d94f4f", wing: "#f2c94c", trim: "#ffffff", glow: "#f2c94c", prop: "#3a2a1a", glass: "#88c9e8", float: "#d94f4f" },
  2: { kind: "seaplane", body: "#f2c94c", wing: "#ffffff", trim: "#1f3a8a", glow: "#ffffff", prop: "#2b2b2b", glass: "#7fd3ff", float: "#d94f4f" },
  3: { kind: "jet",      body: "#c8ccd4", wing: "#8a8f99", trim: "#d94f4f", glow: "#ffb21a", prop: "#5d626c", glass: "#101418", float: "#5d626c" },
};
function liveryOf(n) {
  const id = n === 2 || n === 3 ? n : 1;
  const out = { ...LIVERY_FALLBACK[id] };
  const list = Array.isArray(C.PLANE_LIVERIES) ? C.PLANE_LIVERIES : [];
  const cfg = list.find((x) => x && x.id === id);
  if (cfg && typeof cfg === "object") {
    const src = cfg.colors && typeof cfg.colors === "object" ? { ...cfg, ...cfg.colors } : cfg;
    for (const k of ["body", "wing", "trim", "glow", "prop", "glass", "float"]) {
      if (typeof src[k] === "string" && /^#[0-9a-fA-F]{6}$/.test(src[k])) out[k] = src[k].toLowerCase();
    }
  }
  return out;
}

function hashStr(str) {
  if (typeof C.hash32 === "function") {
    try { return C.hash32(str) >>> 0; } catch { /* fall through */ }
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function r1(v) { return Math.round(v * 10) / 10; }
function r2(v) { return Math.round(v * 100) / 100; }
function decay(t, dt) {
  if (!(t > 0)) return 0;
  const n = t - dt;
  return n > 1e-6 ? n : 0;
}
function hsplit(p) { return Array.isArray(p) && p.length >= 3 && p.every(Number.isFinite) ? p : null; }

// ---------------------------------------------------------------------------------------------
// Model building (§9.1). Every model faces +Z (a yaw of t aims local +Z along (sin t, cos t)),
// sits with its hooves on y = 0 (the rig root is at the feet) and is ~2.3 tall.
// ---------------------------------------------------------------------------------------------

function makeKit(THREE, opts) {
  const mats = new Map();
  const ghost = !!(opts && opts.ghost);
  function mat(hex, extra) {
    const key = hex + "|" + (extra ? JSON.stringify(extra) : "");
    let m = mats.get(key);
    if (m) return m;
    const params = { color: hex, roughness: 0.62, metalness: 0.04, flatShading: false };
    if (extra) {
      if (extra.emissive) { params.emissive = extra.emissive; params.emissiveIntensity = extra.ei ?? 0.6; }
      if (extra.metal) { params.metalness = extra.metal; params.roughness = extra.rough ?? 0.35; }
      if (extra.rough !== undefined && !extra.metal) params.roughness = extra.rough;
      if (extra.opacity !== undefined) { params.transparent = true; params.opacity = extra.opacity; params.depthWrite = false; }
    }
    const wasClear = params.transparent === true;
    if (ghost) { params.transparent = true; params.opacity = CREEP_OPACITY * (params.opacity ?? 1); params.depthWrite = false; }
    m = new THREE.MeshStandardMaterial(params);
    if (ghost && !wasClear) m.userData.ghostOnly = true;
    mats.set(key, m);
    return m;
  }
  function mesh(geo, material, pos, rot, scl) {
    const m = new THREE.Mesh(geo, material);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scl) { if (typeof scl === "number") m.scale.setScalar(scl); else m.scale.set(scl[0], scl[1], scl[2]); }
    m.frustumCulled = false;
    return m;
  }
  // The vertex-coloured materials every plain (opaque, non-glowing) part is baked into.
  const solid = new Map();
  function solidMat(shiny) {
    const key = shiny ? "shiny" : "matte";
    let m = solid.get(key);
    if (m) return m;
    const params = { color: "#ffffff", vertexColors: true, roughness: shiny ? 0.32 : 0.62, metalness: shiny ? 0.6 : 0.04 };
    if (ghost) { params.transparent = true; params.opacity = CREEP_OPACITY; params.depthWrite = false; }
    m = new THREE.MeshStandardMaterial(params);
    solid.set(key, m);
    return m;
  }
  return { mat, mesh, ghost, solidMat, allMats: () => Array.from(mats.values()) };
}

// ---------------------------------------------------------------------------------------------
// Bake (draw-call budget). A model is ~40-70 primitives; drawn as-is that is one draw call per
// primitive per rig, and the renderer budget is 420 for the whole frame. So after building, the
// static primitives under each MOVING node (root, bob, head, legs, tail, wings, propeller...) are
// merged into one mesh per bin: plain opaque parts share one vertex-coloured material (matte or
// shiny), and only the special materials (glowing, see-through, animated colour) keep their own.
// A pig ends at roughly 10 draw calls. Moving nodes are kept exactly as built, so anim refs hold.
// ---------------------------------------------------------------------------------------------

function isPlainMat(m, keep) {
  if (!m || !m.isMeshStandardMaterial || keep.has(m)) return false;
  if (m.transparent && !m.userData.ghostOnly) return false;
  // A faint glow (a sheen on a skin) bakes into the vertex colour; a real glow keeps its material.
  if (m.emissive && m.emissiveIntensity > SHEEN_MAX_EI && (m.emissive.r + m.emissive.g + m.emissive.b) > 0) return false;
  return true;
}

const SHEEN_MAX_EI = 0.6;

// The colour a plain bin paints for a material: its base plus any faint emissive sheen.
function bakedColor(m) {
  const c = m.color.clone();
  const e = m.emissive;
  const k = m.emissiveIntensity || 0;
  if (e && k > 0) { c.r = Math.min(1, c.r + e.r * k); c.g = Math.min(1, c.g + e.g * k); c.b = Math.min(1, c.b + e.b * k); }
  return c;
}

function mergeInto(THREE, items, withColor) {
  let vCount = 0, iCount = 0;
  const geos = items.map(({ geo, matrix, color }) => {
    const g = geo.clone();
    g.applyMatrix4(matrix);
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
    return { g, color };
  });
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const col = withColor ? new Float32Array(vCount * 3) : null;
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0, io = 0;
  for (const { g, color } of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, n * 3), vo * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array.subarray(0, n * 3), vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, n * 2), vo * 2);
    if (col) {
      for (let i = 0; i < n; i++) {
        col[(vo + i) * 3] = color.r; col[(vo + i) * 3 + 1] = color.g; col[(vo + i) * 3 + 2] = color.b;
      }
    }
    if (g.index) {
      const a = g.index.array;
      for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo;
      io += a.length;
    } else {
      for (let i = 0; i < n; i++) idx[io + i] = vo + i;
      io += n;
    }
    vo += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

function bakeModel(THREE, root, kit, animNodes, keepMats) {
  root.updateMatrixWorld(true);
  const moving = new Set(animNodes.filter(Boolean));
  moving.add(root);
  // A static group that contains a moving node must stay too (it carries that node's transform).
  const holds = new Set();
  for (const n of moving) { let p = n.parent; while (p && p !== root) { holds.add(p); p = p.parent; } }
  const kept = (o) => moving.has(o) || holds.has(o);
  const oldGeos = new Set();
  const usedMats = new Set();
  const liveGeos = new Set();
  for (const n of moving) if (n.isMesh) { usedMats.add(n.material); liveGeos.add(n.geometry); }
  const inv = new THREE.Matrix4();

  const bakeNode = (node) => {
    inv.copy(node.matrixWorld).invert();
    const bins = new Map();
    const strip = [];
    const walk = (parent) => {
      for (const child of parent.children) {
        if (kept(child)) continue;
        if (parent === node) strip.push(child);
        if (child.isMesh) {
          const mat = child.material;
          const plain = isPlainMat(mat, keepMats);
          const key = plain ? (mat.metalness > 0.3 ? "shiny" : "matte") : mat.uuid;
          let bin = bins.get(key);
          if (!bin) { bin = { plain, shiny: key === "shiny", mat, items: [] }; bins.set(key, bin); }
          bin.items.push({ geo: child.geometry, matrix: new THREE.Matrix4().multiplyMatrices(inv, child.matrixWorld), color: plain ? bakedColor(mat) : mat.color });
          oldGeos.add(child.geometry);
        }
        if (child.children.length) walk(child);
      }
    };
    walk(node);
    for (const c of strip) node.remove(c);
    const keptChildren = node.children.slice();
    for (const bin of bins.values()) {
      const geo = mergeInto(THREE, bin.items, bin.plain);
      const mat = bin.plain ? kit.solidMat(bin.shiny) : bin.mat;
      usedMats.add(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      node.add(mesh);
    }
    for (const child of keptChildren) {
      if (child.isMesh && moving.has(child)) continue;   // a moving mesh is kept whole
      bakeNode(child);
    }
  };
  bakeNode(root);
  for (const g of oldGeos) if (!liveGeos.has(g)) g.dispose();
  for (const m of kit.allMats()) if (!usedMats.has(m)) m.dispose();
}

function animNodesOf(root) {
  const out = [];
  const a = root.userData.pigAnim;
  if (a) {
    out.push(a.body, a.head, a.tail, a.spin);
    for (const l of a.legs) out.push(l.pivot);
    for (const fl of a.flutter) out.push(fl.obj);
    for (const w of a.wings) out.push(w.pivot);
    for (const b of a.bubbles) out.push(b.obj);
  }
  root.traverse((o) => {
    const p = o.userData && o.userData.planeAnim;
    if (p) out.push(p.prop, p.jet);
  });
  return out;
}
function keepMatsOf(root) {
  const a = root.userData.pigAnim;
  return new Set(a ? [...a.rainbow, ...a.stars] : []);
}

function darkenHex(THREE, hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return "#" + c.getHexString();
}

function newAnim() {
  return {
    t: Math.random() * 10, phase: Math.random() * 6.28, mode: "pig", sniff: false,
    legs: [], body: null, head: null, tail: null, ears: [], wings: [], flutter: [],
    bubbles: [], spin: null, prop: null, jet: null, rainbow: [], stars: [],
  };
}

// The pig itself, under `parent`. Returns nothing; registers its moving parts in `anim`.
function buildPigBody(THREE, kit, parent, anim, classId, skin, opts) {
  const { mat, mesh } = kit;
  const col = { ...skin.colors };
  if (classId === "boar") for (const s of SLOTS) col[s] = darkenHex(THREE, col[s], 0.8);
  const pattern = skin.pattern;

  const bodyExtra = pattern === "sparkle" ? { emissive: col.accent, ei: 0.4 }
    : pattern === "galaxy" ? { emissive: "#1a0f3a", ei: 0.5 } : null;
  const bodyMat = mat(col.body, bodyExtra);
  if (pattern === "rainbow") anim.rainbow.push(bodyMat);
  const bellyMat = mat(col.belly);
  const snoutMat = mat(col.snout);
  const earMat = mat(col.ear);
  const hoofMat = mat(col.hoof, { rough: 0.4 });
  const accentMat = mat(col.accent, pattern === "sparkle" ? { emissive: col.accent, ei: 0.5 } : null);
  const white = mat("#ffffff", { rough: 0.3 });
  const black = mat("#141418", { rough: 0.25 });

  const sx = classId === "strong" ? 1.25 : 1;
  const legR = classId === "strong" ? 0.27 : 0.22;
  const BODY_Y = 1.3, BODY_Z = -0.15, BODY_R = 0.9;

  // Bob group: everything above the legs bounces with the walk.
  const bob = new THREE.Group();
  bob.name = "PigBob";
  parent.add(bob);
  anim.body = bob;

  // Torso (capsule along Z), belly, and the per-skin pattern.
  const torso = new THREE.Group();
  torso.scale.set(sx, 1, 1);
  bob.add(torso);
  torso.add(mesh(new THREE.CapsuleGeometry(BODY_R, 0.8, 6, 16), bodyMat, [0, BODY_Y, BODY_Z], [Math.PI / 2, 0, 0]));
  torso.add(mesh(new THREE.SphereGeometry(0.85, 16, 10), bellyMat, [0, 0.98, BODY_Z], null, [0.92, 0.5, 1.35]));

  const onBody = (ang, z, inset) => {
    const r = BODY_R - (inset ?? 0.12);
    return [Math.sin(ang) * r, BODY_Y + Math.cos(ang) * r, z];
  };
  if (pattern === "spots") {
    const spots = [[0.3, -0.9, 0.34], [-0.9, -0.2, 0.3], [1.1, 0.35, 0.28], [-0.2, 0.55, 0.26], [2.0, -0.5, 0.3]];
    const g = new THREE.SphereGeometry(1, 12, 8);
    for (const [a, z, s] of spots) torso.add(mesh(g, accentMat, onBody(a, z, 0.2), null, [s, s, s * 0.9]));
  } else if (pattern === "stripes") {
    const g = new THREE.TorusGeometry(BODY_R + 0.015, 0.075, 6, 28);
    for (const z of [-0.75, -0.15, 0.45]) torso.add(mesh(g, accentMat, [0, BODY_Y, z]));
  } else if (pattern === "galaxy") {
    const starMat = mat("#ffffff", { emissive: "#ffffff", ei: 1.4 });
    anim.stars.push(starMat);
    const g = new THREE.SphereGeometry(0.06, 6, 4);
    for (let i = 0; i < 14; i++) {
      const a = (i * 2.399) % (Math.PI * 2);              // golden-angle scatter, deterministic
      const z = -1.1 + ((i * 0.37) % 1) * 2.0;
      if (Math.cos(a) < -0.6) continue;                     // keep the stars off the underside
      torso.add(mesh(g, starMat, onBody(a, z, -0.01)));
    }
    const nebula = mat(col.accent, { emissive: col.snout, ei: 0.8, opacity: 0.55 });
    torso.add(mesh(new THREE.SphereGeometry(0.3, 10, 8), nebula, onBody(0.6, -0.4, 0.05), null, [1.2, 0.5, 1.6]));
  }

  // Legs: pivots at the hips so they swing; dark hooves at the ground.
  const HIP_Y = 0.72;
  const legGeo = new THREE.CylinderGeometry(legR, legR * 0.92, 0.62, 10);
  const hoofGeo = new THREE.CylinderGeometry(legR * 1.08, legR * 1.12, 0.16, 10);
  const legSpots = [[0.5, 0.62, 1], [-0.5, 0.62, -1], [0.5, -0.95, -1], [-0.5, -0.95, 1]];
  for (const [x, z, sign] of legSpots) {
    const pivot = new THREE.Group();
    pivot.position.set(x * sx, HIP_Y, z);
    pivot.add(mesh(legGeo, bodyMat, [0, -0.31, 0]));
    pivot.add(mesh(hoofGeo, hoofMat, [0, -0.64, 0]));
    parent.add(pivot);
    anim.legs.push({ pivot, sign });
  }

  // Head.
  const head = new THREE.Group();
  head.position.set(0, 1.58, 1.2);
  bob.add(head);
  anim.head = head;
  head.add(mesh(new THREE.SphereGeometry(0.75, 18, 14), bodyMat));
  // cheeks
  const cheekMat = mat(col.snout, { opacity: 0.55 });
  head.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), cheekMat, [0.5, -0.2, 0.42], null, [1, 0.7, 0.4]));
  head.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), cheekMat, [-0.5, -0.2, 0.42], null, [1, 0.7, 0.4]));
  // snout + nostrils
  head.add(mesh(new THREE.CylinderGeometry(0.38, 0.4, 0.34, 16), snoutMat, [0, -0.12, 0.78], [Math.PI / 2, 0, 0]));
  const nostrilGeo = new THREE.SphereGeometry(0.075, 8, 6);
  const nostrilMat = mat(darkenHex(THREE, col.snout, 0.45));
  head.add(mesh(nostrilGeo, nostrilMat, [0.13, -0.1, 0.95], null, [1, 1.3, 0.5]));
  head.add(mesh(nostrilGeo, nostrilMat, [-0.13, -0.1, 0.95], null, [1, 1.3, 0.5]));
  // eyes (white + black + a tiny glint)
  const narrow = classId === "creeper" ? 0.45 : 1;
  const eyeGeo = new THREE.SphereGeometry(0.15, 12, 8);
  const pupilGeo = new THREE.SphereGeometry(0.085, 10, 6);
  const glintGeo = new THREE.SphereGeometry(0.03, 6, 4);
  for (const sgn of [1, -1]) {
    head.add(mesh(eyeGeo, white, [0.31 * sgn, 0.2, 0.6], null, [1, narrow, 0.8]));
    head.add(mesh(pupilGeo, black, [0.32 * sgn, 0.2, 0.71], null, [1, narrow, 0.7]));
    head.add(mesh(glintGeo, white, [0.29 * sgn, 0.24, 0.77], null, [1, narrow, 1]));
  }
  // floppy ears
  const earGeo = new THREE.ConeGeometry(0.3, 0.55, 3);
  for (const sgn of [1, -1]) {
    const ep = new THREE.Group();
    ep.position.set(0.42 * sgn, 0.55, 0.05);
    ep.rotation.set(0.75, 0, -0.55 * sgn);
    ep.add(mesh(earGeo, earMat, [0, 0.25, 0], null, [1, 1, 0.45]));
    head.add(ep);
  }

  // Curly tail (a torus arc plus a tip curl).
  const tail = new THREE.Group();
  tail.position.set(0, 1.55, BODY_Z - 1.28);
  tail.add(mesh(new THREE.TorusGeometry(0.18, 0.055, 6, 14, Math.PI * 1.6), bodyMat, [0, 0, -0.16], [0, Math.PI / 2, 0]));
  tail.add(mesh(new THREE.TorusGeometry(0.09, 0.045, 6, 10, Math.PI * 1.4), bodyMat, [0, 0.16, -0.3], [0, Math.PI / 2, 1.2]));
  bob.add(tail);
  anim.tail = tail;

  // ---- per class (§9.1) ----
  if (classId === "speedy") {
    const bolt = mat(col.accent, { emissive: col.accent, ei: 1.1 });
    const g = new THREE.BoxGeometry(0.05, 0.42, 0.13);
    for (const sgn of [1, -1]) {
      const x = (BODY_R + 0.02) * sx * sgn;
      torso.add(mesh(g, bolt, [x / sx, 1.55, -0.25], [0, 0, 0.0], [1, 1, 1]).rotateX(0.55));
      torso.add(mesh(g, bolt, [x / sx, 1.25, -0.05], [0, 0, 0]).rotateX(-0.6));
      torso.add(mesh(g, bolt, [x / sx, 0.98, 0.15], [0, 0, 0]).rotateX(0.55));
    }
    // racing goggles on the forehead
    const strap = mat("#2b2b2b");
    head.add(mesh(new THREE.TorusGeometry(0.76, 0.05, 6, 24), strap, [0, 0.32, 0], [Math.PI / 2 - 0.25, 0, 0]));
    const lens = mat("#88c9e8", { emissive: "#4f8fd9", ei: 0.5, metal: 0.4 });
    const rim = mat(col.accent, { metal: 0.6 });
    for (const sgn of [1, -1]) {
      head.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 14), rim, [0.27 * sgn, 0.46, 0.6], [Math.PI / 2 - 0.5, 0, 0]));
      head.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 14), lens, [0.27 * sgn, 0.47, 0.62], [Math.PI / 2 - 0.5, 0, 0]));
    }
    // a little racing number disc on each flank
    const disc = mat("#ffffff");
    for (const sgn of [1, -1]) torso.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 16), disc, [(BODY_R + 0.01) * sgn, 1.35, -0.85], [0, 0, Math.PI / 2]));
  } else if (classId === "strong") {
    const band = mat(col.accent);
    head.add(mesh(new THREE.TorusGeometry(0.74, 0.09, 8, 24), band, [0, 0.28, 0], [Math.PI / 2 - 0.2, 0, 0]));
    // muscle bumps over the front legs
    for (const sgn of [1, -1]) bob.add(mesh(new THREE.SphereGeometry(0.38, 12, 8), bodyMat, [0.82 * sx * sgn, 1.25, 0.55], null, [0.8, 1, 1]));
    // dumbbell strapped across the back
    const iron = mat("#5d626c", { metal: 0.7, rough: 0.3 });
    bob.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.3, 8), iron, [0, 2.32, -0.35], [0, 0, Math.PI / 2]));
    for (const sgn of [1, -1]) {
      bob.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 14), iron, [1.05 * sgn, 2.32, -0.35], [0, 0, Math.PI / 2]));
      bob.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 14), iron, [0.88 * sgn, 2.32, -0.35], [0, 0, Math.PI / 2]));
    }
  } else if (classId === "creeper") {
    // camo blobs (accent) mixed with leaf greens, plus a dark ninja mask and trailing ties
    const camo = [mat(col.accent), mat("#3f7d36"), mat("#2f5f2a")];
    const g = new THREE.SphereGeometry(1, 10, 8);
    const blobs = [[0.0, -0.6, 0.42, 0], [0.9, 0.2, 0.36, 1], [-1.0, -0.3, 0.38, 2], [0.4, 0.5, 0.3, 1], [-0.5, -1.0, 0.32, 0]];
    for (const [a, z, s, mi] of blobs) torso.add(mesh(g, camo[mi], onBody(a, z, 0.24), null, [s, s * 0.7, s * 1.2]));
    const mask = mat("#1a1a24", { rough: 0.5 });
    head.add(mesh(new THREE.TorusGeometry(0.73, 0.13, 8, 24), mask, [0, 0.2, 0], [Math.PI / 2, 0, 0]));
    const tieGeo = new THREE.BoxGeometry(0.12, 0.05, 0.6);
    for (const sgn of [1, -1]) {
      const tie = new THREE.Group();
      tie.position.set(0.1 * sgn, 0.25, -0.72);
      tie.add(mesh(tieGeo, mask, [0, 0, -0.3]));
      tie.rotation.y = 0.3 * sgn;
      head.add(tie);
      anim.flutter.push({ obj: tie, base: 0.3 * sgn, amp: 0.25, rate: 9 });
    }
  } else if (classId === "flying") {
    const leather = mat("#7a4a2a", { rough: 0.7 });
    head.add(mesh(new THREE.SphereGeometry(0.79, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.48), leather, [0, 0.04, -0.04]));
    for (const sgn of [1, -1]) head.add(mesh(new THREE.BoxGeometry(0.1, 0.42, 0.3), leather, [0.72 * sgn, -0.16, 0.0]));
    const brass = mat("#d4a428", { metal: 0.7 });
    const lens = mat("#88c9e8", { emissive: "#88c9e8", ei: 0.3, metal: 0.3 });
    for (const sgn of [1, -1]) {
      head.add(mesh(new THREE.TorusGeometry(0.16, 0.045, 6, 14), brass, [0.25 * sgn, 0.55, 0.52], [-0.75, 0, 0]));
      head.add(mesh(new THREE.CircleGeometry(0.15, 14), lens, [0.25 * sgn, 0.555, 0.525], [-0.75, 0, 0]));
    }
    // red scarf: neck ring + two trailing tails
    const scarf = mat("#d94f4f");
    bob.add(mesh(new THREE.TorusGeometry(0.6, 0.13, 8, 20), scarf, [0, 1.48, 0.7], [0.25, 0, 0]));
    for (const sgn of [1, -1]) {
      const tailG = new THREE.Group();
      tailG.position.set(0.25 * sgn, 1.9, 0.45);
      tailG.add(mesh(new THREE.BoxGeometry(0.28, 0.05, 1.1), scarf, [0, 0, -0.55]));
      tailG.rotation.set(-0.25, 0.15 * sgn, 0);
      bob.add(tailG);
      anim.flutter.push({ obj: tailG, base: -0.25, amp: 0.22, rate: 11, axis: "x" });
    }
    // little feathered wings
    const feather = mat("#ffffff", { rough: 0.8 });
    for (const sgn of [1, -1]) {
      const wp = new THREE.Group();
      wp.position.set(0.55 * sgn, 2.05, 0.15);
      wp.add(mesh(new THREE.SphereGeometry(0.5, 12, 8), feather, [0.45 * sgn, 0.05, -0.1], null, [1.1, 0.14, 0.6]));
      wp.add(mesh(new THREE.SphereGeometry(0.34, 10, 6), feather, [0.85 * sgn, 0.12, -0.35], null, [0.9, 0.12, 0.5]));
      bob.add(wp);
      anim.wings.push({ pivot: wp, sign: sgn });
    }
  } else if (classId === "casoh") {
    const collar = mat("#2b2b2b", { rough: 0.4 });
    const spike = mat("#c8ccd4", { metal: 0.8, rough: 0.25 });
    const neck = new THREE.Group();
    neck.position.set(0, 1.5, 0.72);
    neck.rotation.x = 0.25;
    bob.add(neck);
    neck.add(mesh(new THREE.TorusGeometry(0.64, 0.11, 8, 22), collar));
    const coneGeo = new THREE.ConeGeometry(0.08, 0.3, 6);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const cone = mesh(coneGeo, spike, [Math.cos(a) * 0.76, Math.sin(a) * 0.76, 0]);
      cone.rotation.z = a - Math.PI / 2;
      neck.add(cone);
    }
    // round armor plates along the spine
    const plate = mat("#5d626c", { metal: 0.7, rough: 0.3 });
    const rivet = mat(col.accent, { metal: 0.5 });
    for (const z of [-0.85, -0.2, 0.45]) {
      bob.add(mesh(new THREE.SphereGeometry(0.52, 14, 8), plate, [0, 2.1, z], null, [1, 0.3, 1]));
      bob.add(mesh(new THREE.SphereGeometry(0.07, 6, 4), rivet, [0, 2.27, z]));
    }
  } else if (classId === "boar") {
    const bristle = mat("#3a2a1a", { rough: 0.9 });
    const coneGeo = new THREE.ConeGeometry(0.09, 0.42, 5);
    for (let i = 0; i < 9; i++) {
      const z = 1.55 - i * 0.36;
      const y = i < 2 ? 2.25 - i * 0.02 : 2.18 - Math.max(0, i - 6) * 0.08;
      const c = mesh(coneGeo, bristle, [0, y, z], [-0.35, 0, 0], [1, 1 + (i % 2) * 0.25, 1]);
      bob.add(c);
    }
    const ivory = mat("#f7efe2", { rough: 0.35 });
    for (const sgn of [1, -1]) {
      const tusk = mesh(new THREE.ConeGeometry(0.07, 0.48, 8), ivory, [0.3 * sgn, -0.28, 0.74]);
      tusk.rotation.set(0.5, 0, -0.45 * sgn);
      head.add(tusk);
    }
    // shaggy cheek fur
    for (const sgn of [1, -1]) head.add(mesh(new THREE.ConeGeometry(0.2, 0.4, 5), bristle, [0.62 * sgn, -0.25, 0.1], [0, 0, 1.9 * sgn]));
  } else if (classId === "scientist") {
    const coat = mat("#ffffff", { rough: 0.85 });
    const coatTrim = mat("#88c9e8");
    // lab coat: a box skirt around the lower body, lapels and a pocket with a pen
    torso.add(mesh(new THREE.BoxGeometry(1.98, 0.95, 2.55), coat, [0, 1.02, BODY_Z - 0.05]));
    torso.add(mesh(new THREE.BoxGeometry(2.0, 0.08, 2.57), coatTrim, [0, 0.58, BODY_Z - 0.05]));
    for (const sgn of [1, -1]) torso.add(mesh(new THREE.BoxGeometry(0.34, 0.75, 0.06), coat, [0.38 * sgn, 1.35, 1.07], [0, 0, 0.3 * sgn]));
    torso.add(mesh(new THREE.BoxGeometry(0.06, 0.32, 0.38), coat, [1.0, 1.25, 0.3]));
    torso.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), mat("#4f8fd9"), [1.04, 1.42, 0.25]));
    // round goggles over the eyes
    const brass = mat("#d4a428", { metal: 0.7 });
    const glass = mat("#88c9e8", { opacity: 0.45, emissive: "#88c9e8", ei: 0.2 });
    for (const sgn of [1, -1]) {
      head.add(mesh(new THREE.TorusGeometry(0.19, 0.05, 6, 16), brass, [0.31 * sgn, 0.2, 0.7]));
      head.add(mesh(new THREE.CircleGeometry(0.18, 16), glass, [0.31 * sgn, 0.2, 0.72]));
    }
    head.add(mesh(new THREE.BoxGeometry(0.16, 0.05, 0.05), brass, [0, 0.2, 0.74]));
    // wild white hair
    const hair = mat("#ffffff", { rough: 0.95 });
    const hairSpots = [[0, 0.7, -0.05, 0.3], [0.32, 0.62, -0.2, 0.25], [-0.32, 0.62, -0.2, 0.25], [0.5, 0.42, -0.35, 0.22], [-0.5, 0.42, -0.35, 0.22], [0, 0.55, -0.45, 0.27], [0.18, 0.78, 0.15, 0.18]];
    for (const [x, y, z, r] of hairSpots) head.add(mesh(new THREE.SphereGeometry(r, 10, 8), hair, [x, y, z]));
    // bubbling green flask on the back
    const flask = new THREE.Group();
    flask.position.set(0, 2.25, -0.55);
    bob.add(flask);
    flask.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8), mat("#7a4a2a"), [0, 0.2, 0]));
    flask.add(mesh(new THREE.SphereGeometry(0.34, 14, 10), mat("#88c9e8", { opacity: 0.4 }), [0, -0.1, 0]));
    flask.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.22, 10), mat("#88c9e8", { opacity: 0.45 }), [0, 0.18, 0]));
    const goo = mat(CLONE_GREEN, { emissive: CLONE_GREEN, ei: 0.9 });
    flask.add(mesh(new THREE.SphereGeometry(0.27, 12, 8), goo, [0, -0.16, 0], null, [1, 0.8, 1]));
    const bubbleGeo = new THREE.SphereGeometry(0.06, 6, 4);
    for (let i = 0; i < 3; i++) {
      const b = mesh(bubbleGeo, goo, [0.08 * (i - 1), 0, 0]);
      flask.add(b);
      anim.bubbles.push({ obj: b, off: i / 3 });
    }
  }

  // Caught: an orange-and-black striped bib (§9.1).
  if (opts && opts.caught) {
    const orange = mat("#ff8a1a");
    const blk = mat("#2b2b2b");
    const g = new THREE.BoxGeometry(0.95, 0.14, 0.06);
    for (let i = 0; i < 5; i++) bob.add(mesh(g, i % 2 ? blk : orange, [0, 1.48 - i * 0.14, 1.07 + i * 0.02], [-0.25, 0, 0]));
    bob.add(mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 20), orange, [0, 1.5, 0.72], [0.25, 0, 0]));
  }
}

// Casoh ball form (§7.6): a 3-diameter sphere in skin colours with a snout band and a face.
function buildBallBody(THREE, kit, parent, anim, skin) {
  const { mat, mesh } = kit;
  const col = skin.colors;
  const spin = new THREE.Group();
  spin.position.set(0, 1.5, 0);
  parent.add(spin);
  anim.spin = spin;
  anim.mode = "ball";
  const bodyMat = mat(col.body, skin.pattern === "sparkle" ? { emissive: col.accent, ei: 0.4 } : null);
  if (skin.pattern === "rainbow") anim.rainbow.push(bodyMat);
  spin.add(mesh(new THREE.SphereGeometry(1.5, 22, 16), bodyMat));
  spin.add(mesh(new THREE.TorusGeometry(1.51, 0.13, 8, 32), mat(col.snout), null, [0, Math.PI / 2, 0]));
  spin.add(mesh(new THREE.TorusGeometry(1.51, 0.07, 6, 32), mat(col.accent)));
  spin.add(mesh(new THREE.CylinderGeometry(0.45, 0.48, 0.25, 16), mat(col.snout), [0, 0.1, 1.5], [Math.PI / 2, 0, 0]));
  const dark = mat(darkenHex(THREE, col.snout, 0.45));
  for (const sgn of [1, -1]) {
    spin.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), dark, [0.15 * sgn, 0.12, 1.63]));
    spin.add(mesh(new THREE.SphereGeometry(0.17, 10, 8), mat("#ffffff"), [0.48 * sgn, 0.62, 1.3]));
    spin.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), mat("#141418"), [0.5 * sgn, 0.63, 1.45]));
    const ear = mesh(new THREE.ConeGeometry(0.34, 0.6, 3), mat(col.ear), [0.7 * sgn, 1.35, 0.2], [0.4, 0, -0.5 * sgn], [1, 1, 0.5]);
    spin.add(ear);
  }
  if (skin.pattern === "spots") {
    for (const [x, y, z] of [[1.2, 0.6, -0.6], [-1.1, -0.4, -0.8], [0.2, -1.3, 0.4], [-0.5, 1.1, -0.9]]) {
      spin.add(mesh(new THREE.SphereGeometry(0.32, 10, 8), mat(col.accent), [x, y, z]));
    }
  }
  // speed lines ring at the ground, does not spin
  parent.add(mesh(new THREE.RingGeometry(1.2, 1.6, 24), mat(col.accent, { opacity: 0.35 }), [0, 0.05, 0], [-Math.PI / 2, 0, 0]));
}

// Planes (§7.5). Built so the seat (the fuselage top) is at y = 0, the nose toward +Z.
function buildPlaneModel(THREE, kit, livery) {
  const { mat, mesh } = kit;
  const L = liveryOf(livery);
  const g = new THREE.Group();
  g.name = "PigPlane";
  const anim = { prop: null, jet: null };
  const body = mat(L.body, { metal: 0.25, rough: 0.45 });
  const wing = mat(L.wing, { rough: 0.5 });
  const trim = mat(L.trim, { metal: 0.3 });
  const dark = mat("#2b2b2b", { rough: 0.4 });
  const blade = mat(L.prop, { rough: 0.5 });
  const glass = mat(L.glass, { metal: 0.3, rough: 0.15, opacity: 0.6 });
  const floatMat = mat(L.float, { rough: 0.45 });

  const addProp = (z) => {
    const hub = new THREE.Group();
    hub.position.set(0, -0.55, z);
    hub.add(mesh(new THREE.ConeGeometry(0.28, 0.5, 10), trim, [0, 0, 0.18], [Math.PI / 2, 0, 0]));
    hub.add(mesh(new THREE.BoxGeometry(0.22, 2.7, 0.07), blade));
    hub.add(mesh(new THREE.BoxGeometry(2.7, 0.22, 0.07), blade));
    g.add(hub);
    anim.prop = hub;
  };

  if (L.kind === "biplane") {
    g.add(mesh(new THREE.BoxGeometry(1.3, 1.0, 6.0), body, [0, -0.55, 0.9]));
    g.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.7, 14), trim, [0, -0.55, 4.1], [Math.PI / 2, 0, 0]));
    g.add(mesh(new THREE.BoxGeometry(9, 0.14, 1.5), wing, [0, -1.0, 3.0]));
    g.add(mesh(new THREE.BoxGeometry(9, 0.14, 1.5), wing, [0, 1.25, 3.0]));
    for (const x of [-3.2, -1.4, 1.4, 3.2]) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.25, 6), trim, [x, 0.12, 3.0]));
    g.add(mesh(new THREE.BoxGeometry(0.12, 1.3, 1.0), body, [0, 0.25, -1.75]));
    g.add(mesh(new THREE.BoxGeometry(3.2, 0.1, 0.8), wing, [0, -0.35, -1.75]));
    for (const sgn of [1, -1]) g.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.2, 12), dark, [0.75 * sgn, -1.55, 2.8], [0, 0, Math.PI / 2]));
    g.add(mesh(new THREE.BoxGeometry(1.32, 0.12, 0.5), trim, [0, -0.05, 2.3]));
    g.add(mesh(new THREE.BoxGeometry(1.1, 0.5, 0.06), glass, [0, 0.2, 2.45], [-0.35, 0, 0]));
    addProp(4.5);
  } else if (L.kind === "seaplane") {
    g.add(mesh(new THREE.BoxGeometry(1.3, 1.1, 6.0), body, [0, -0.6, 0.9]));
    g.add(mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.6, 14), trim, [0, -0.6, 4.1], [Math.PI / 2, 0, 0]));
    g.add(mesh(new THREE.BoxGeometry(10, 0.14, 1.6), wing, [0, 3.0, 1.6]));
    for (const sgn of [1, -1]) {
      g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.8, 6), trim, [0.8 * sgn, 1.0, 1.9], [0, 0, 0.35 * sgn]));
      g.add(mesh(new THREE.CapsuleGeometry(0.32, 4.2, 4, 10), floatMat, [1.5 * sgn, -2.2, 1.0], [Math.PI / 2, 0, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 6), trim, [1.1 * sgn, -1.5, 1.0], [0, 0, -0.5 * sgn]));
    }
    g.add(mesh(new THREE.BoxGeometry(0.12, 1.4, 1.0), body, [0, 0.25, -1.75]));
    g.add(mesh(new THREE.BoxGeometry(3.4, 0.1, 0.8), wing, [0, -0.3, -1.75]));
    g.add(mesh(new THREE.BoxGeometry(1.1, 0.55, 0.06), glass, [0, 0.22, 2.45], [-0.35, 0, 0]));
    addProp(4.45);
  } else {
    // silver jet
    g.add(mesh(new THREE.CapsuleGeometry(0.75, 4.6, 6, 14), body, [0, -0.8, 0.6], [Math.PI / 2, 0, 0]));
    g.add(mesh(new THREE.ConeGeometry(0.75, 1.4, 14), body, [0, -0.8, 3.9], [Math.PI / 2, 0, 0]));
    for (const sgn of [1, -1]) {
      const w = mesh(new THREE.BoxGeometry(3.8, 0.12, 1.7), wing, [2.0 * sgn, -0.95, 0.1]);
      w.rotation.y = -0.45 * sgn;
      g.add(w);
      const fin = mesh(new THREE.BoxGeometry(0.1, 1.2, 0.9), wing, [0.45 * sgn, 0.0, -2.2]);
      fin.rotation.z = -0.35 * sgn;
      g.add(fin);
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.08, 4.4), trim, [0.74 * sgn, -0.75, 0.6]));
    }
    g.add(mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.4, 14), blade, [0, -0.8, -2.25], [Math.PI / 2, 0, 0]));
    g.add(mesh(new THREE.SphereGeometry(0.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass, [0, -0.15, 2.4], null, [0.9, 0.7, 1.6]));
    const glow = mat(L.glow, { emissive: L.glow, ei: 2.0, opacity: 0.8 });
    const jet = mesh(new THREE.ConeGeometry(0.55, 1.6, 14), glow, [0, -0.8, -3.2], [-Math.PI / 2, 0, 0]);
    g.add(jet);
    anim.jet = jet;
  }
  g.userData.planeAnim = anim;
  return g;
}

function disposeObject(obj) {
  if (!obj) return;
  if (obj.parent) obj.parent.remove(obj);
  const geos = new Set();
  const mats = new Set();
  obj.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
  });
  geos.forEach((g) => { try { g.dispose(); } catch { /* already gone */ } });
  mats.forEach((m) => { try { m.dispose(); } catch { /* already gone */ } });
}

// Animate a pig look / clone. `speed` is horizontal studs per second.
function animatePig(group, speed, dt, THREE) {
  const a = group && group.userData ? group.userData.pigAnim : null;
  if (!a) return;
  a.t += dt;
  if (a.mode === "ball") {
    if (a.spin) a.spin.rotation.x += (speed / 1.5) * dt;
  } else {
    const moving = clamp(speed / 16, 0, 1.4);
    a.phase += dt * (3 + speed * 0.5);
    const sw = Math.sin(a.phase) * 0.52 * Math.min(1, moving);    // ±30°
    for (const leg of a.legs) leg.pivot.rotation.x = sw * leg.sign;
    if (a.body) a.body.position.y = Math.abs(Math.sin(a.phase)) * 0.09 * Math.min(1, moving) + Math.sin(a.t * 2.2) * 0.015;
    if (a.tail) { a.tail.rotation.z = Math.sin(a.t * (6 + speed * 0.4)) * 0.45; a.tail.rotation.x = Math.sin(a.t * 3) * 0.15; }
    if (a.head) {
      const sniff = a.sniff ? Math.sin(a.t * 3.2) * 0.16 + Math.max(0, Math.sin(a.t * 9)) * 0.05 : Math.sin(a.t * 1.7) * 0.05;
      a.head.rotation.x = sniff + (moving > 0.2 ? Math.sin(a.phase * 2) * 0.04 : 0);
      a.head.rotation.y = a.sniff ? Math.sin(a.t * 0.9) * 0.25 : 0;
    }
    for (const ear of a.ears) ear.pivot.rotation.x = ear.base + Math.sin(a.t * 5 + ear.sign) * 0.08 + Math.min(1, moving) * 0.2;
    for (const w of a.wings) w.pivot.rotation.z = w.sign * (0.25 + Math.sin(a.t * (8 + speed * 0.5)) * 0.45);
    for (const f of a.flutter) {
      const v = f.base + Math.sin(a.t * f.rate) * f.amp * (0.5 + Math.min(1, moving));
      if (f.axis === "x") f.obj.rotation.x = v; else f.obj.rotation.y = v;
    }
    for (const b of a.bubbles) {
      const u = (a.t * 0.8 + b.off) % 1;
      b.obj.position.y = -0.2 + u * 0.75;
      b.obj.scale.setScalar(0.6 + u * 0.8);
    }
  }
  if (a.rainbow.length && THREE) {
    const hue = (a.t * 0.2) % 1;
    for (const m of a.rainbow) m.color.setHSL(hue, 0.8, 0.72);
  }
  for (const m of a.stars) m.emissiveIntensity = 1.0 + Math.sin(a.t * 4) * 0.6;
  const p = group.userData.planeAnim;
  if (p) {
    if (p.prop) p.prop.rotation.z += dt * 38;
    if (p.jet) p.jet.scale.set(1, 0.85 + Math.sin(a.t * 40) * 0.15, 1);
  }
}

function animatePlane(group, dt) {
  const p = group && group.userData ? group.userData.planeAnim : null;
  if (!p) return;
  if (p.prop) p.prop.rotation.z += dt * 38;
  if (p.jet) { p.t = (p.t || 0) + dt; p.jet.scale.set(1, 0.85 + Math.sin(p.t * 40) * 0.15, 1); }
}

// ---------------------------------------------------------------------------------------------
// createPigs
// ---------------------------------------------------------------------------------------------

export function createPigs(ctx, S, rigs, fx) {
  const THREE = ctx.engine.THREE;
  const player = ctx.player;
  const audio = ctx.engine.audio;

  // ---- S.pig normalisation (pigs.js is S.pig's single writer) ----
  if (!S.pig || typeof S.pig !== "object") S.pig = {};
  const P = S.pig;
  const ensure = () => {
    if (typeof P.classId !== "string") P.classId = "normal";
    if (typeof P.skinId !== "string") P.skinId = "pink";
    for (const k of ["iv", "bl", "pl", "th", "radarOn"]) if (typeof P[k] !== "number") P[k] = 0;
    if (P.cn === undefined) P.cn = null;
    for (const k of ["cd", "act", "used"]) if (!P[k] || typeof P[k] !== "object") P[k] = {};
    for (const id of PIG_ABILITY_IDS) {
      if (typeof P.cd[id] !== "number") P.cd[id] = 0;
      if (typeof P.act[id] !== "number") P.act[id] = 0;
    }
  };
  ensure();
  if (!Array.isArray(S.toastQ)) S.toastQ = [];

  // ---- module state ----
  const looks = new Map();       // rigs id -> { key, look, retryAt, lastPos }
  const clones = new Map();      // owner key -> { partId, group, key, owner }
  const tagsHidden = new Set();  // remote ids whose tags we hid
  let plane = null;              // { partId, group, stage, from, ctrl, t, livery, pos, yaw }
  const leftovers = [];          // departing planes (only one in practice, but never leak)
  let planeUses = 0;
  let lastPractice = S.practice;
  let wroteWalk = null;          // last walk value this module wrote
  let hadControl = false;
  let dashTrail = 0;
  let disposed = false;
  const prevAct = {};

  const toast = (text, icon, variant) => { S.toastQ.push({ text, icon, variant }); };
  const safe = (fn) => { try { return fn(); } catch { return undefined; } };
  // One wrapper for every sound: audio is optional and a thrown sound must never halt update.
  const sfx = (name, opts) => { try { audio.playSfx(name, opts); } catch { /* audio is optional */ } };
  const fxCall = (name, ...args) => {
    if (fx && typeof fx[name] === "function") safe(() => fx[name](...args));
  };
  const feet = () => {
    const p = safe(() => player.position());
    return hsplit(p) ? [p[0], p[1], p[2]] : [0, 0, 0];
  };
  const yawNow = () => (player.avatar && player.avatar.rotation ? player.avatar.rotation.y : 0);
  const inRoundPhase = () => S.phase === "hide" || S.phase === "seek";

  function save() { return S.save && typeof S.save === "object" ? S.save : {}; }
  function radarEquipped() {
    const s = save();
    return !!(s.radarEquipped && s.radarClaimed);
  }

  // Pig context (§7): a pig in a live round, or the lobby with pig practice.
  function inRoundAsPig() { return S.role === "pig" && !S.caught && inRoundPhase(); }
  function inPractice() { return S.phase === "lobby" && S.role == null && S.practice === "pig"; }
  function pigControl() { return inRoundAsPig() || inPractice(); }

  function kit() {
    const k = kitOf(P.classId).slice();
    if (radarEquipped() && !k.includes("radar")) k.push("radar");
    return k;
  }

  function flyBox() {
    if (S.phase === "lobby") {
      const B = CITY.PLACE_BOUNDS || { minX: -170, maxX: 170, minZ: -258, maxZ: 170 };
      return { minX: B.minX, maxX: B.maxX, minZ: B.minZ, maxZ: B.maxZ, minY: 1, maxY: K.PLANE_CEIL_Y };
    }
    const B = CITY.BOUNDS || { minX: -160, maxX: 160, minZ: -160, maxZ: 160 };
    return { minX: B.minX, maxX: B.maxX, minZ: B.minZ, maxZ: B.maxZ, minY: 1, maxY: K.PLANE_CEIL_Y };
  }
  function clampGround(p) {
    if (S.phase !== "lobby" && typeof CITY.clampToCity === "function") {
      const c = safe(() => CITY.clampToCity(p));
      if (hsplit(c)) return c;
    }
    const b = flyBox();
    return [clamp(p[0], b.minX, b.maxX), p[1], clamp(p[2], b.minZ, b.maxZ)];
  }

  // Why an ability is refused right now; "" = usable.
  function refusal(id) {
    const ab = ability(id);
    if (!ab) return "Unknown";
    if (!kit().includes(id)) return "Not in your kit";
    if (S.role === "pig" && S.caught) return "Caught";
    if (!pigControl()) return S.phase === "lobby" ? "Switch practice to Pig" : "Not now";
    if (ab.perRound && P.used[id]) return S.phase === "lobby" ? "Used — toggle practice to reset" : "Used this round";
    if (P.cd[id] > 0) return "Cooling down";
    if (id === "plane" && (P.act.plane > 0 || plane)) return "Already flying";
    if (id === "ball" && P.act.ball > 0) return "Already rolling";
    if (id === "creep" && P.act.creep > 0) return "Already creeping";
    if (id === "swap") {
      if (!P.cn) return "Make a clone first";
      if (P.cn.a !== 1) return "Clone caught";
      if (P.act.plane > 0) return "Not while flying";
      const f = feet();
      if (Math.hypot(P.cn.p[0] - f[0], P.cn.p[1] - f[1], P.cn.p[2] - f[2]) < SWAP_MIN_DIST) return "Too close to your clone";
    }
    return "";
  }

  // ---- ability starts ----
  function startDash() {
    P.act.dash = K.DASH_S;
    P.cd.dash = ability("dash").cooldownS;
    dashTrail = 0;
    sfx("whoosh", { volume: 0.8, pitch: 1.2 });
    fxCall("dust", feet());
  }
  function startCreep() {
    P.act.creep = K.CREEP_S;
    P.used.creep = true;
    P.iv = 1;
    sfx("warp", { volume: 0.8, pitch: 1.3 });
    fxCall("sparkle", feet(), "#3f7d36");
  }
  function endCreep() {
    P.iv = 0;
    sfx("warp", { volume: 0.7, pitch: 0.8 });
    fxCall("sparkle", feet(), "#3f7d36");
  }
  function startBall() {
    P.act.ball = K.BALL_S;
    P.used.ball = true;
    P.bl = 1;
    sfx("boing", { volume: 0.9 });
    fxCall("dust", feet());
  }
  function endBall() {
    P.bl = 0;
    fxCall("dust", feet());
  }
  function startThump() {
    P.cd.thump = ability("thump").cooldownS;
    P.act.thump = K.THUMP_S;
    P.th = (P.th | 0) + 1;
    sfx("pop", { volume: 1, pitch: 0.5 });
    const f = feet();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      fxCall("dust", [f[0] + Math.sin(a) * 3, f[1], f[2] + Math.cos(a) * 3]);
    }
  }
  function startPlane() {
    planeUses += 1;
    let livery = 1 + (hashStr(String(S.selfId) + String(S.rn) + String(planeUses)) % 3);
    if (typeof C.planeLivery === "function") {
      const l = safe(() => C.planeLivery(S.selfId, S.rn, planeUses));
      if (l === 1 || l === 2 || l === 3) livery = l;
    }
    P.act.plane = K.PLANE_ARRIVE_S + K.PLANE_S;
    P.cd.plane = ability("plane").cooldownS;
    // pl goes on the wire only once the plane has swooped in (tickPlane's "fly" stage), so
    // everyone else sees it arrive with the pig rather than pop into being under it.
    P.pl = 0;
    if (plane) retirePlane(true);
    const f = feet();
    const yaw = yawNow();
    const back = yaw + Math.PI;
    const from = [f[0] + Math.sin(back) * PLANE_FAR, f[1] + PLANE_HIGH, f[2] + Math.cos(back) * PLANE_FAR];
    // the curve's control point swings out to the side so the plane banks in from nowhere
    const side = yaw + Math.PI / 2;
    const ctrl = [f[0] + Math.sin(back) * 40 + Math.sin(side) * 45, f[1] + 18, f[2] + Math.cos(back) * 40 + Math.cos(side) * 45];
    const pk = makeKit(THREE);
    const group = buildPlaneModel(THREE, pk, livery);
    bakeModel(THREE, group, pk, animNodesOf(group), new Set());
    group.position.set(from[0], from[1], from[2]);
    const partId = safe(() => ctx.engine.parts.addCustom(group));
    if (partId == null) { disposeObject(group); return; }
    plane = { partId, group, stage: "arrive", from, ctrl, livery, pos: from.slice(), yaw: yaw, fade: PLANE_DEPART_S, baseY: f[1] };
    sfx("whoosh", { volume: 1, pitch: 0.6 });
  }
  function startClone() {
    const f = feet();
    const created = !P.cn || P.cn.a !== 1;
    P.cn = { p: [r1(f[0]), r1(f[1]), r1(f[2])], y: r2(yawNow()), a: 1 };
    P.cd.clone = K.CLONE_MOVE_DEBOUNCE_S;
    // "every 50 seconds you can swap": the first swap after making a clone waits too.
    if (created) P.cd.swap = Math.max(P.cd.swap || 0, ability("swap").cooldownS);
    sfx("pop", { volume: 0.9, pitch: created ? 1.0 : 1.3 });
    fxCall("sparkle", f, CLONE_GREEN);
    if (created) toast("Clone made! Press again to move it.", "🧪");
  }
  function startSwap() {
    const cn = P.cn;
    const old = feet();
    const oldYaw = yawNow();
    const to = cn.p.slice();
    safe(() => player.teleport(to, cn.y * DEG));
    P.cn = { p: [r1(old[0]), r1(old[1]), r1(old[2])], y: r2(oldYaw), a: 1 };
    P.cd.swap = ability("swap").cooldownS;
    sfx("warp", { volume: 0.9 });
    fxCall("sparkle", old, CLONE_GREEN);
    fxCall("sparkle", to, CLONE_GREEN);
  }
  function radarTargets() {
    const out = ["self"];
    const selfKey = String(S.selfId);
    if (S.phase === "lobby") {
      for (const v of peerList()) {
        const st = v.st;
        if (st && st.ph === "lobby" && st.rl == null && isPigClassId(st.cl)) out.push(v.id);
      }
    } else {
      const ps = S.roster && Array.isArray(S.roster.ps) ? S.roster.ps : [];
      for (const id of ps) {
        if (id === selfKey) continue;
        const v = S.peers && S.peers.get ? S.peers.get(id) : null;
        if (!v) continue;
        if (v.st && v.st.cg === 1) continue;
        out.push(id);
      }
    }
    if (P.cn && P.cn.a === 1) out.push("clone:" + selfKey);
    for (const v of peerList()) {
      if (v.fresh && v.st && v.st.cn && v.st.cn.a === 1) out.push("clone:" + v.id);
    }
    return out;
  }
  function startRadar() {
    P.cd.radar = ability("radar").cooldownS;
    P.act.radar = K.RADAR_S;
    P.radarOn = K.RADAR_S;
    if (rigs && typeof rigs.xray === "function") safe(() => rigs.xray(K.XRAY_YELLOW, K.RADAR_S, radarTargets()));
    sfx("sparkle", { volume: 0.9, pitch: 1.1 });
    fxCall("sparkle", feet(), K.XRAY_YELLOW);
  }

  const STARTERS = {
    dash: startDash, creep: startCreep, plane: startPlane, ball: startBall,
    thump: startThump, clone: startClone, swap: startSwap, radar: startRadar,
  };

  function use(id) {
    if (disposed || !STARTERS[id]) return false;
    if (refusal(id)) return false;
    STARTERS[id]();
    prevAct[id] = P.act[id] > 0;
    return true;
  }

  // ---- plane lifecycle ----
  function retirePlane(immediate) {
    if (!plane) return;
    const pl = plane;
    plane = null;
    if (immediate) { removeCustom(pl); return; }
    pl.stage = "depart";
    pl.fade = PLANE_DEPART_S;
    leftovers.push(pl);
  }
  function removeCustom(rec) {
    if (rec.partId != null) safe(() => ctx.engine.parts.remove(rec.partId));
    disposeObject(rec.group);
  }
  function setPlaneOpacity(group, o) {
    group.traverse((m) => {
      if (!m.material) return;
      for (const mt of Array.isArray(m.material) ? m.material : [m.material]) {
        if (mt.userData.baseOpacity === undefined) mt.userData.baseOpacity = mt.transparent ? mt.opacity : 1;
        mt.transparent = true;
        mt.depthWrite = o > 0.95;
        mt.opacity = mt.userData.baseOpacity * o;
      }
    });
  }
  function tickPlane(dt) {
    if (plane) {
      const g = plane.group;
      if (P.act.plane > K.PLANE_S) {
        // arrival: a quadratic curve from far behind and above, down to just under the feet
        const u = clamp(1 - (P.act.plane - K.PLANE_S) / Math.max(0.01, K.PLANE_ARRIVE_S), 0, 1);
        const e = 1 - (1 - u) * (1 - u);
        const f = feet();
        const to = [f[0], f[1] - 0.05, f[2]];
        const q = (i) => (1 - e) * (1 - e) * plane.from[i] + 2 * (1 - e) * e * plane.ctrl[i] + e * e * to[i];
        const nx = q(0), ny = q(1), nz = q(2);
        const dx = nx - g.position.x, dz = nz - g.position.z;
        if (dx * dx + dz * dz > 1e-6) g.rotation.y = Math.atan2(dx, dz);
        g.rotation.z = Math.sin(u * Math.PI) * 0.5;
        g.position.set(nx, ny, nz);
        plane.stage = "arrive";
      } else if (P.act.plane > 0) {
        // flight: teleport along the facing yaw. The plane climbs to a cruise height on its
        // own, Jump climbs higher, letting go eases back down to cruise, and the last
        // PLANE_LAND_S glides down to the ground so the pig lands instead of dropping.
        if (plane.stage !== "fly") { plane.stage = "fly"; P.pl = plane.livery; }
        const f = feet();
        const yaw = yawNow();
        let mv = { x: 0, z: 0 };
        mv = safe(() => ctx.engine.input.getMoveVector()) || mv;
        const push = Math.min(1, Math.hypot(mv.x || 0, mv.z || 0));
        const jump = !!safe(() => ctx.engine.input.isJumpHeld());
        const b = flyBox();
        const left = P.act.plane;
        const ground = groundBelow(f);
        const cruise = clamp(Math.max(plane.baseY + PLANE_CRUISE_UP, ground + PLANE_CRUISE_MIN), b.minY, b.maxY);
        let vy = 0;
        let rise = 0;
        if (left <= PLANE_LAND_S) {
          // glide in: cover the remaining height in the time left
          vy = -Math.min(K.PLANE_RISE * 3, Math.max(0, f[1] - ground) / Math.max(dt, left));
        } else if (jump) {
          vy = K.PLANE_RISE;
          rise = 1;
        } else if (f[1] < cruise - 0.5) {
          vy = K.PLANE_RISE;
          rise = 1;
        } else if (f[1] > cruise + 0.5) {
          vy = -K.PLANE_RISE * 0.6;
        }
        const ny = Math.max(ground, f[1] + vy * dt);
        const next = [
          clamp(f[0] + Math.sin(yaw) * push * K.PLANE_SPEED * dt, b.minX, b.maxX),
          clamp(ny, b.minY, b.maxY),
          clamp(f[2] + Math.cos(yaw) * push * K.PLANE_SPEED * dt, b.minZ, b.maxZ),
        ];
        safe(() => player.teleport(next));
        g.position.set(next[0], next[1] - 0.05, next[2]);
        g.rotation.y = yaw;
        g.rotation.z += (clamp(-mv.x * 0.4, -0.4, 0.4) - g.rotation.z) * Math.min(1, dt * 6);
        g.rotation.x = rise ? -0.15 : 0;
        plane.yaw = yaw;
      } else {
        retirePlane(false);
      }
      if (plane) animatePlane(plane.group, dt);
    }
    for (let i = leftovers.length - 1; i >= 0; i--) {
      const pl = leftovers[i];
      pl.fade -= dt;
      const g = pl.group;
      const yaw = g.rotation.y;
      g.position.x += Math.sin(yaw) * K.PLANE_SPEED * 1.2 * dt;
      g.position.z += Math.cos(yaw) * K.PLANE_SPEED * 1.2 * dt;
      g.position.y += 12 * dt;
      g.rotation.x = -0.25;
      animatePlane(g, dt);
      setPlaneOpacity(g, clamp(pl.fade / PLANE_DEPART_S, 0, 1));
      if (pl.fade <= 0) { removeCustom(pl); leftovers.splice(i, 1); }
    }
  }

  // The ground height under a point (a downward raycast), or the fly box floor.
  function groundBelow(f) {
    const floor = flyBox().minY;
    const hit = ctx.engine.physics && typeof ctx.engine.physics.raycast === "function"
      ? safe(() => ctx.engine.physics.raycast([f[0], f[1] + 0.5, f[2]], [0, -1, 0], 300))
      : null;
    const y = hit && Array.isArray(hit.point) ? hit.point[1]
      : hit && hit.point && Number.isFinite(hit.point.y) ? hit.point.y : floor;
    return Number.isFinite(y) ? Math.max(floor, y) : floor;
  }

  // ---- creep supplement (§7.4): reach 20x while walkSpeed is clamped at 100 ----
  function tickCreep(dt) {
    if (!(P.act.creep > 0)) return;
    const v = safe(() => player.velocity()) || [0, 0, 0];
    let vx = v[0] || 0, vz = v[2] || 0;
    let sp = Math.hypot(vx, vz);
    if (sp <= 1) {
      // standing still after a teleport: fall back to the stick along the facing yaw
      const mv = safe(() => ctx.engine.input.getMoveVector()) || { x: 0, z: 0 };
      if (Math.hypot(mv.x || 0, mv.z || 0) < 0.1) return;
      const yaw = yawNow();
      vx = Math.sin(yaw); vz = Math.cos(yaw); sp = 1;
      const extra = (K.CREEP_MULT * K.WALK_DEFAULT - K.CREEP_WALK) * dt;
      return creepStep(vx, vz, extra);
    }
    const target = K.CREEP_MULT * K.WALK_DEFAULT;          // 320 studs/s
    const extra = Math.max(0, (target - sp) * dt);
    creepStep(vx / sp, vz / sp, extra);
  }
  function creepStep(dx, dz, extra) {
    if (!(extra > 0)) return;
    // teleport() zeroes velocity: off the ground (or jumping) the plain walk carries the
    // pig, so jumps and falls stay real.
    const grounded = safe(() => ctx.engine.physics.isGrounded());
    if (grounded === false || safe(() => ctx.engine.input.isJumpHeld())) return;
    const f = feet();
    const hit = ctx.engine.physics && typeof ctx.engine.physics.raycast === "function"
      ? safe(() => ctx.engine.physics.raycast([f[0], f[1] + K.PIG_CENTER_Y, f[2]], [dx, 0, dz], extra + CREEP_SKIN))
      : null;
    const step = hit ? Math.max(0, hit.distance - CREEP_SKIN) : extra;
    if (step <= 0.001) return;
    safe(() => player.teleport(clampGround([f[0] + dx * step, f[1], f[2] + dz * step])));
  }

  // ---- timers ----
  function tickTimers(dt) {
    for (const id of PIG_ABILITY_IDS) {
      P.cd[id] = decay(P.cd[id], dt);
      P.act[id] = decay(P.act[id], dt);
    }
    P.radarOn = decay(P.radarOn, dt);
    // edge detection: effects that just ended (also catches debugAdvance jumps)
    const on = (id) => P.act[id] > 0;
    if (prevAct.creep && !on("creep")) endCreep();
    if (prevAct.ball && !on("ball")) endBall();
    if (!on("plane") && P.pl) P.pl = 0;
    if (!on("creep") && P.iv) P.iv = 0;
    if (!on("ball") && P.bl) P.bl = 0;
    for (const id of PIG_ABILITY_IDS) prevAct[id] = on(id);
  }

  function stopAll(quiet) {
    for (const id of PIG_ABILITY_IDS) { P.act[id] = 0; prevAct[id] = false; }
    if (P.iv && !quiet) sfx("warp", { volume: 0.5, pitch: 0.8 });
    P.iv = 0; P.bl = 0; P.pl = 0;
    P.radarOn = 0;
    if (plane) retirePlane(!!quiet);
  }
  function clearRound() {
    P.used = {};
    for (const id of PIG_ABILITY_IDS) P.cd[id] = 0;
    planeUses = 0;
  }
  function clearClone(puff) {
    if (P.cn && puff) fxCall("dust", P.cn.p);
    P.cn = null;
  }

  // ---- walk speed (§7: pigs.js is the only writer of the pig's walk) ----
  function tickWalk() {
    const ctl = pigControl();
    if (ctl) {
      let w = baseWalk(P.classId);
      if (P.act.dash > 0) w = Math.max(w, K.DASH_WALK);
      if (P.act.ball > 0) w = Math.max(w, K.BALL_WALK);
      if (P.act.creep > 0) w = Math.max(w, K.CREEP_WALK);
      const cur = safe(() => player.getWalkSpeed());
      if (cur !== w) safe(() => player.setWalkSpeed(w));
      wroteWalk = w;
    } else if (hadControl && S.role !== "hunter" && !S.spectating && wroteWalk !== null && wroteWalk !== K.WALK_DEFAULT) {
      safe(() => player.setWalkSpeed(K.WALK_DEFAULT));
      wroteWalk = K.WALK_DEFAULT;
    }
    hadControl = ctl;
  }

  // ---- peers ----
  function peerList() {
    if (!S.peers || typeof S.peers.values !== "function") return [];
    return Array.from(S.peers.values()).filter((v) => v && typeof v.id === "string");
  }

  function remoteIsPig(st) {
    if (!st) return false;
    if (st.rl === "pig") return st.ph === "hide" || st.ph === "seek" || st.ph === "result";
    return st.rl == null && st.ph === "lobby" && isPigClassId(st.cl);
  }

  // ---- looks (§9.3) ----
  function selfLookSpec() {
    let pig = false;
    if (S.role === "pig" && (inRoundPhase() || S.phase === "result")) pig = true;
    else if (inPractice()) pig = true;
    if (!pig) return null;
    return { cl: P.classId, sk: P.skinId, caught: S.role === "pig" && !!S.caught, ball: P.bl === 1, plane: 0, ghost: P.iv === 1 };
  }
  function remoteLookSpec(st) {
    if (!remoteIsPig(st)) return null;
    const cl = isPigClassId(st.cl) ? st.cl : "normal";
    return { cl, sk: typeof st.sk === "string" ? st.sk : "pink", caught: st.cg === 1, ball: st.bl === 1, plane: st.pl > 0 ? st.pl | 0 : 0, ghost: st.sp === 1 };
  }
  const specKey = (s) => s ? [s.cl, s.sk, s.caught ? 1 : 0, s.ball ? 1 : 0, s.plane, s.ghost ? 1 : 0].join("|") : "";

  function build(spec) {
    const k = makeKit(THREE, { ghost: spec.ghost });
    const root = new THREE.Group();
    root.name = "PigLook";
    const anim = newAnim();
    const skin = skinOf(spec.sk);
    if (spec.ball) buildBallBody(THREE, k, root, anim, skin);
    else buildPigBody(THREE, k, root, anim, spec.cl, skin, { caught: spec.caught });
    root.userData.pigAnim = anim;
    if (spec.plane) {
      const pg = buildPlaneModel(THREE, k, spec.plane);
      root.add(pg);
      root.userData.planeAnim = pg.userData.planeAnim;
    }
    bakeModel(THREE, root, k, animNodesOf(root), keepMatsOf(root));
    root.traverse((o) => { o.frustumCulled = false; });
    return root;
  }

  function applyLook(id, spec, now) {
    const entry = looks.get(id);
    const root = rigs && typeof rigs.rigFor === "function" ? safe(() => rigs.rigFor(id)) : null;
    const valid = !!(entry && entry.look && root && entry.look.parent === root);
    if (!spec) {
      if (valid) safe(() => rigs.setLook(id, null));
      looks.delete(id);
      return;
    }
    if (!root) { looks.delete(id); return; }
    const key = specKey(spec);
    if (valid && entry.key === key) return;
    if (entry && !valid && entry.retryAt && now < entry.retryAt && entry.key === key) return;
    const look = build(spec);
    safe(() => rigs.setLook(id, look));
    if (look.parent !== root) {
      disposeObject(look);
      looks.set(id, { key, look: null, retryAt: now + 1, lastPos: null });
      return;
    }
    looks.set(id, { key, look, retryAt: 0, lastPos: null });
  }

  function tickLooks(dt, now) {
    applyLook("local", selfLookSpec(), now);
    const seen = new Set(["local"]);
    for (const v of peerList()) {
      seen.add(v.id);
      applyLook(v.id, remoteLookSpec(v.st), now);
    }
    for (const id of Array.from(looks.keys())) {
      if (!seen.has(id)) looks.delete(id);    // the rig left; rigs.js disposes its look
    }
    // animate
    for (const [id, e] of looks) {
      if (!e.look) continue;
      let speed = 0;
      if (id === "local") {
        const v = safe(() => player.velocity()) || [0, 0, 0];
        speed = Math.hypot(v[0] || 0, v[2] || 0);
        if (P.act.creep > 0) speed = Math.max(speed, 40);
      } else {
        const root = e.look.parent;
        if (root) {
          const p = root.position;
          if (e.lastPos && dt > 0) speed = Math.min(80, Math.hypot(p.x - e.lastPos[0], p.z - e.lastPos[2]) / dt);
          e.lastPos = [p.x, p.y, p.z];
          e.speedS = (e.speedS || 0) + (speed - (e.speedS || 0)) * Math.min(1, dt * 8);
          speed = e.speedS;
        }
      }
      animatePig(e.look, speed, dt, THREE);
    }
  }

  // ---- tag policy (§9.0): uncaught pigs' tags are hidden during hide + seek ----
  function tickTags() {
    if (!rigs || typeof rigs.setTagVisible !== "function") return;
    const live = inRoundPhase();
    const want = new Set();
    if (live) {
      for (const v of peerList()) {
        const st = v.st;
        if (st && st.rl === "pig" && (st.ph === "hide" || st.ph === "seek") && st.cg !== 1) want.add(v.id);
      }
    }
    for (const id of want) { safe(() => rigs.setTagVisible(id, false)); tagsHidden.add(id); }
    for (const id of Array.from(tagsHidden)) {
      if (want.has(id)) continue;
      safe(() => rigs.setTagVisible(id, true));
      tagsHidden.delete(id);
    }
  }

  // ---- clones (§7.8): props, never rigs, never tagged, never listed ----
  function cloneSpecFor() {
    const out = new Map();
    if (P.cn && P.cn.a === 1 && hsplit(P.cn.p)) out.set("self", { owner: "self", p: P.cn.p, y: P.cn.y, cl: P.classId, sk: P.skinId });
    for (const v of peerList()) {
      const st = v.st;
      if (!st || !st.cn || st.cn.a !== 1 || !hsplit(st.cn.p)) continue;
      out.set("peer:" + v.id, { owner: v.id, fresh: !!v.fresh, p: st.cn.p, y: Number.isFinite(st.cn.y) ? st.cn.y : 0, cl: isPigClassId(st.cl) ? st.cl : "scientist", sk: typeof st.sk === "string" ? st.sk : "pink" });
    }
    return out;
  }
  function tickClones(dt) {
    const want = cloneSpecFor();
    for (const [k, rec] of Array.from(clones)) {
      const w = want.get(k);
      if (!w || rec.key !== w.cl + "|" + w.sk) {
        if (!w) fxCall("dust", [rec.group.position.x, rec.group.position.y, rec.group.position.z]);
        removeCustom(rec);
        clones.delete(k);
      }
    }
    for (const [k, w] of want) {
      let rec = clones.get(k);
      if (!rec) {
        const group = build({ cl: w.cl, sk: w.sk, caught: false, ball: false, plane: 0, ghost: false });
        group.name = "PigClone";
        group.userData.pigAnim.sniff = true;
        const partId = safe(() => ctx.engine.parts.addCustom(group));
        if (partId == null) { disposeObject(group); continue; }
        rec = { partId, group, key: w.cl + "|" + w.sk, owner: w.owner, staleT: 0 };
        clones.set(k, rec);
      }
      // A peer that briefly goes quiet keeps its clone (no re-bake); one quiet for longer
      // than PIG_ABSENT_S has its decoy hidden until it is heard from again.
      rec.staleT = w.fresh === false ? (rec.staleT || 0) + dt : 0;
      rec.group.visible = rec.staleT <= K.PIG_ABSENT_S;
      rec.group.position.set(w.p[0], w.p[1], w.p[2]);
      rec.group.rotation.y = w.y;
      animatePig(rec.group, 0, dt, THREE);
    }
  }

  // ---- dash trail ----
  function tickDash(dt) {
    if (!(P.act.dash > 0)) return;
    dashTrail -= dt;
    if (dashTrail > 0) return;
    dashTrail = DASH_TRAIL_S;
    const f = feet();
    const yaw = yawNow();
    fxCall("dust", [f[0] - Math.sin(yaw) * 1.6, f[1] + 0.2, f[2] - Math.cos(yaw) * 1.6]);
  }

  // ---- the tick ----
  function update(dt) {
    if (disposed) return;
    ensure();
    const now = Number.isFinite(S.now) ? S.now : 0;

    // Lobby: the equipped class/skin follow the save (shops equip there). During a round they
    // are frozen at the hide edge (onRoleStart).
    if (S.phase === "lobby" || S.role == null) {
      const s = save();
      if (typeof s.pigClass === "string" && isPigClassId(s.pigClass)) P.classId = s.pigClass;
      if (typeof s.pigSkin === "string") P.skinId = s.pigSkin;
    }

    // Practice toggled: per-round latches clear (§7) and any running pig effect stops.
    if (S.practice !== lastPractice) {
      lastPractice = S.practice;
      if (S.phase === "lobby") {
        P.used = {};
        if (S.practice !== "pig") { stopAll(false); clearClone(true); }
      }
    }
    // A clone belongs to the Mad Scientist kit: switching class in the lobby clears it.
    if (P.cn && !kit().includes("clone")) clearClone(true);

    tickTimers(dt);

    // An effect running outside its context (sat out, phase changed under us) stops.
    if (!pigControl()) {
      let any = false;
      for (const id of PIG_ABILITY_IDS) if (P.act[id] > 0 && id !== "radar") any = true;
      if (any || P.iv || P.bl || P.pl) stopAll(false);
    }

    tickCreep(dt);
    tickPlane(dt);
    tickDash(dt);
    tickWalk();
    tickLooks(dt, now);
    tickClones(dt);
    tickTags();
  }

  // ---- HUD buttons (§10.1) ----
  function buttons() {
    if (disposed) return [];
    const show = (S.role === "pig" && inRoundPhase()) || inPractice();
    if (!show) return [];
    const out = [];
    for (const id of kit()) {
      const ab = ability(id);
      if (!ab) continue;
      const why = refusal(id);
      const label = ab.label;   // the aria-label: stable for smoke and assistive tech
      let text = label;
      if (id === "clone" && P.cn && P.cn.a === 1) {
        const mv = C.ABILITIES && C.ABILITIES.clone && typeof C.ABILITIES.clone.labelMove === "string" ? C.ABILITIES.clone.labelMove : "Move Clone";
        text = mv;   // only the visible caption changes
      }
      const total = ab.perRound ? 0 : ab.cooldownS;
      out.push({
        id, label, text, icon: ab.icon, key: ab.slot || "E",
        cdLeft: Math.ceil((P.cd[id] || 0) * 10) / 10, cdTotal: total,
        active: P.act[id] > 0, actLeft: Math.ceil((P.act[id] || 0) * 10) / 10,
        enabled: why === "", reason: why,
      });
    }
    return out;
  }

  // ---- round hooks (forwarded by game.js) ----
  function onRoleStart() {
    stopAll(true);
    clearRound();
    clearClone(false);
    const s = save();
    if (typeof s.pigClass === "string" && isPigClassId(s.pigClass)) P.classId = s.pigClass;
    if (typeof s.pigSkin === "string") P.skinId = s.pigSkin;
  }
  function onSeek() {
    if (S.role === "pig" && !S.caught) toast("The hunter is coming! Stay hidden.", "🐷");
  }
  function onCaught() {
    stopAll(false);
    clearClone(true);
  }
  function onCloneHit() {
    if (!P.cn) return;
    P.cn = { p: P.cn.p.slice(), y: P.cn.y, a: 0 };
    // A new clone can be made once this wait is over (swap stays blocked until then).
    P.cd.clone = Math.max(P.cd.clone || 0, K.SWAP_CD_S);
    fxCall("dust", P.cn.p);
    fxCall("sparkle", P.cn.p, "#d94f4f");
    sfx("pop", { volume: 1, pitch: 0.8 });
    toast("Your clone was caught! It fooled the hunter.", "🧪", "warn");
    if (S.phase === "seek" && S.role === "pig") safe(() => ctx.services.badges.award("decoy-duty"));
  }
  function resetForLobby() {
    stopAll(false);
    clearClone(false);
    clearRound();
    if (S.role !== "hunter") { safe(() => player.setWalkSpeed(K.WALK_DEFAULT)); wroteWalk = K.WALK_DEFAULT; }
  }
  function onRoundEnd() {
    const wasPig = S.role === "pig";
    stopAll(false);
    clearClone(false);
    if (wasPig) { safe(() => player.setWalkSpeed(K.WALK_DEFAULT)); wroteWalk = K.WALK_DEFAULT; }
  }
  function onLobby() { resetForLobby(); }

  // Optional helper for game.js's hooks.onThump (§4.6/§7.6): shakes this screen. In the lobby
  // only thumps within THUMP_LOBBY_R shake (§4.11); in a round every thump shakes everyone.
  function onThump(peerId) {
    if (disposed) return;
    if (S.phase === "lobby") {
      const me = feet();
      let src = me;
      if (peerId && peerId !== S.selfId && peerId !== "local") {
        const v = S.peers && S.peers.get ? S.peers.get(peerId) : null;
        if (!v || !hsplit(v.pos)) return;
        src = v.pos;
      }
      if (Math.hypot(src[0] - me[0], src[2] - me[2]) > K.THUMP_LOBBY_R) return;
    }
    safe(() => ctx.engine.camera.shake(K.THUMP_SHAKE, K.THUMP_S));
  }

  function buildPigModel(classId, skinId, opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    return build({
      cl: isPigClassId(classId) ? classId : "normal", sk: typeof skinId === "string" ? skinId : "pink",
      caught: !!o.caught, ball: !!o.ball, plane: o.plane | 0, ghost: !!o.ghost,
    });
  }

  function debugInfo() {
    return {
      looks: Array.from(looks.entries()).filter(([, e]) => e.look).map(([id, e]) => id + ":" + e.key),
      clones: clones.size,
      plane: plane ? plane.stage : (leftovers.length ? "depart" : null),
      walk: wroteWalk,
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const id of PIG_ABILITY_IDS) P.act[id] = 0;
    P.iv = 0; P.bl = 0; P.pl = 0; P.radarOn = 0; P.cn = null;
    if (plane) { removeCustom(plane); plane = null; }
    while (leftovers.length) removeCustom(leftovers.pop());
    for (const rec of clones.values()) removeCustom(rec);
    clones.clear();
    for (const [id, e] of looks) {
      if (!e.look) continue;
      const root = rigs && typeof rigs.rigFor === "function" ? safe(() => rigs.rigFor(id)) : null;
      if (root && e.look.parent === root) safe(() => rigs.setLook(id, null));
      if (e.look.parent) disposeObject(e.look);   // rigs refused to take it back: never leak
    }
    looks.clear();
    if (rigs && typeof rigs.setTagVisible === "function") for (const id of tagsHidden) safe(() => rigs.setTagVisible(id, true));
    tagsHidden.clear();
    if (wroteWalk !== null && wroteWalk !== K.WALK_DEFAULT) safe(() => player.setWalkSpeed(K.WALK_DEFAULT));
    wroteWalk = null;
  }

  return {
    update, use, buttons,
    onRoleStart, onSeek, onCaught, onCloneHit, onRoundEnd, onLobby, onThump,
    buildPigModel, refusal, debugInfo, dispose,
  };
}
