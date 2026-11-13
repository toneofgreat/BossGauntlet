// src/platform/services/avatar/hair.js — HAIR: procedural 3D hairstyles that a player
// buys once with Oofbux and can wear in any colour (spec 05 §5.12, amended 2026-11-12 and
// 2026-11-13: prices).
//
// Hair is NOT a Catalog item: ownership lives in the avatar state's own `hairOwned` list
// (services/avatar.js buyHair/ownsHair), and each style's `price` is set below. It lives in the avatar state as two
// extra keys on `equipped` — `hair` (a style id below, or null) and `hairColor` (a
// "#rrggbb", or null for the style's own default) — which is why the room sees it with
// no change to the wire format: shell.js already broadcasts `equipped` whole.
//
// Every style is built from three.js primitives in HEAD-LOCAL space: the head box is
// 1.2 x 1 x 1.2 centred on the origin, so its top face is y = +0.5, its sides x = ±0.6,
// and the FACE is the -Z side (§5.1's rig-local frame; the rig's body group carries the
// half-turn). The torso hangs below at y -0.5..-2.5, x ±1, z ±0.5 — anything hanging
// lower than the jaw is kept at z >= 0.55 (behind the back) or above y -0.45 (beside
// the head), so no strand ever passes through the body.
//
// Every mesh goes into one of two groups:
//   crown — volume that sits ON TOP of the head. Hidden under a hat (setTucked), since
//           every Catalog hat sits on the head top and would otherwise vanish into it.
//   flow  — fringe, sides, backs, tails: what still shows below a hat brim.
//
// Ids are stored in players' saves: the list is APPEND-ONLY, a style may be re-shaped
// forever but never renamed or removed.

import * as THREE from "../../../../assets/vendor/three.module.js";

const DEG = Math.PI / 180;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const UP = new THREE.Vector3(0, 1, 0);

const NATURAL = ["#1b1b1b", "#4a2c1a", "#8c5a3c", "#c9873a", "#f1d27a", "#d94436", "#f2f4fa"];
const POP = ["#ff6fb5", "#4b7bff", "#35e0e0", "#7ac74f", "#a64dff"];

// glow: the style lights itself (emissive) and reads well on any background.
export const HAIR_STYLES = Object.freeze([
  { id: "hair_spiky", price: 100, name: "Spiky Anime", color: "#f5c518", presets: ["#f5c518", "#1b1b1b", "#35a3e0", "#d94436", "#f2f4fa", "#ff6fb5"] },
  { id: "hair_long", price: 100, name: "Long Flowing", color: "#4a2c1a", presets: [...NATURAL, "#a64dff"] },
  { id: "hair_afro", price: 150, name: "Big Afro", color: "#2a1a10", presets: ["#2a1a10", "#1b1b1b", "#8c5a3c", "#ff6fb5", "#35a3e0", "#f1d27a"] },
  { id: "hair_mohawk", price: 200, name: "Mohawk", color: "#e0245e", presets: ["#e0245e", "#7ac74f", "#35a3e0", "#1b1b1b", "#f5c518", "#a64dff"] },
  { id: "hair_ponytail", price: 200, name: "Ponytail", color: "#c9873a", presets: [...NATURAL, ...POP.slice(0, 2)] },
  { id: "hair_twintails", price: 250, name: "Twin Tails", color: "#35e0e0", presets: ["#35e0e0", "#ff6fb5", "#a64dff", "#1b1b1b", "#f1d27a", "#d94436"] },
  { id: "hair_buzz", price: 250, name: "Buzz Cut", color: "#2e2018", presets: ["#2e2018", "#1b1b1b", "#c9873a", "#f2f4fa", "#4b7bff", "#7ac74f"] },
  { id: "hair_curly", price: 250, name: "Curly Mop", color: "#6b3a1e", presets: [...NATURAL, "#ff6fb5"] },
  { id: "hair_bun", price: 250, name: "Top Bun", color: "#1b1b1b", presets: ["#1b1b1b", "#4a2c1a", "#f1d27a", "#d94436", "#ff6fb5", "#35a3e0"] },
  { id: "hair_emo", price: 250, name: "Emo Fringe", color: "#14141c", presets: ["#14141c", "#a64dff", "#e0245e", "#35a3e0", "#f2f4fa", "#7ac74f"] },
  { id: "hair_dreads", price: 250, name: "Dreadlocks", color: "#3a2416", presets: ["#3a2416", "#1b1b1b", "#c9873a", "#7ac74f", "#e0245e", "#f1d27a"] },
  { id: "hair_flame", price: 25000, name: "Flame Hair", color: "#ff5a00", glow: true, presets: ["#ff5a00", "#ff2a2a", "#3fa9ff", "#a64dff", "#3ddc84", "#f2f4fa"] },
  { id: "hair_galaxy", price: 25000, name: "Galaxy Hair", color: "#6b3fa0", glow: true, presets: ["#6b3fa0", "#2a67c9", "#e0245e", "#2fbf9b", "#ff8a3d", "#14141c"] },
  { id: "hair_pompadour", price: 500, name: "Pompadour", color: "#1b1b1b", presets: ["#1b1b1b", "#4a2c1a", "#c9873a", "#f2f4fa", "#d94436", "#4b7bff"] },
  { id: "hair_braids", price: 250, name: "Braids", color: "#5a3420", presets: [...NATURAL, "#a64dff"] },
  { id: "hair_rainbow", price: 5000, name: "Rainbow Ombre", color: "#ff3b6b", glow: true, presets: ["#ff3b6b", "#ffb84d", "#4db8ff", "#b84dff", "#3ddc84", "#ffffff"] },
  { id: "hair_sidepart", price: 500, name: "Side Part", color: "#4a2c1a", presets: [...NATURAL, "#4b7bff"] },
  { id: "hair_spacebuns", price: 500, name: "Space Buns", color: "#ff6fb5", presets: ["#ff6fb5", "#a64dff", "#35e0e0", "#1b1b1b", "#f1d27a", "#d94436"] },
  { id: "hair_crystal", price: 25000, name: "Crystal Shards", color: "#7fe3ff", glow: true, presets: ["#7fe3ff", "#c58bff", "#7dffb0", "#ff8ad8", "#ffffff", "#ffd36b"] },
  { id: "hair_wolfcut", price: 1000, name: "Wolf Cut", color: "#7a7f8c", presets: ["#7a7f8c", "#1b1b1b", "#f2f4fa", "#4a2c1a", "#e0245e", "#35a3e0"] },
]);

const BY_ID = new Map(HAIR_STYLES.map((s) => [s.id, s]));
// Oofbux price of each style (owner-set 2026-11-13). Hair is bought once and owned forever.
export function hairPrice(id) {
  const st = HAIR_STYLES.find((x) => x.id === id);
  return st ? st.price : null;
}

export const HAIR_IDS = Object.freeze(HAIR_STYLES.map((s) => s.id));

export function getHairStyle(id) {
  return BY_ID.get(id) || null;
}

export function isHairId(id) {
  return typeof id === "string" && BY_ID.has(id);
}

// The colour actually drawn: a well-formed saved hex, else the style's own default.
export function normalizeHairColor(id, hex) {
  if (typeof hex === "string" && HEX_RE.test(hex)) return hex.toLowerCase();
  const style = BY_ID.get(id);
  return style ? style.color : "#4a2c1a";
}

// Every Catalog hat sits on the head top (spec 05 §5.4's HatAnchor), so under any hat the
// crown volume would swallow the hat or poke through it. The halo floats clear of the
// head and is the one exception. An unknown/new hat defaults to "tucked" — the safe side.
const HATS_OVER_HAIR = new Set(["hat_halo"]);
export function hairMode(hatId) {
  if (!hatId) return "full";
  return HATS_OVER_HAIR.has(hatId) ? "full" : "tucked";
}

// ---- colour maths -------------------------------------------------------------------

export function hexToHsl(hex) {
  const n = parseInt(String(hex).slice(1), 16) || 0;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

export function hslToHex(h, s, l) {
  const hh = (((h % 360) + 360) % 360) / 360;
  const ss = Math.max(0, Math.min(1, s)), ll = Math.max(0, Math.min(1, l));
  const f = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const to = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
  return "#" + to(f(hh + 1 / 3)) + to(f(hh)) + to(f(hh - 1 / 3));
}

function shade(hex, dl, ds = 0) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s + ds, l + dl);
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- geometry helpers ---------------------------------------------------------------

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// A box with rounded edges and corners: each vertex of a subdivided box is pulled onto a
// sphere of radius r around the nearest point of the inner (shrunk) box.
function softBox(w, h, d, r = 0.1, seg = 5) {
  const rr = Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  const geo = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const p = geo.attributes.position;
  const hx = w / 2 - rr, hy = h / 2 - rr, hz = d / 2 - rr;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
    v.sub(c);
    const len = v.length();
    if (len > 1e-6) v.multiplyScalar(rr / len);
    v.add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// A tube along a Catmull-Rom curve whose radius tapers linearly from r0 to r1.
function taperTube(points, r0, r1, segs = 22, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((q) => new THREE.Vector3(q[0], q[1], q[2])));
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = geo.attributes.position;
  const P = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, P);
    const r = r0 + (r1 - r0) * (i / segs);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(P).multiplyScalar(r).add(P);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return { geo, curve };
}

// A lumpy sphere — the afro and the bun. Indexed, so the bumps shade smoothly.
function blob(seed, amp = 0.07) {
  const geo = new THREE.SphereGeometry(1, 28, 18);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const a = seed * 1.7;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 9 + a) * Math.sin(v.y * 8 + a * 2) * Math.sin(v.z * 10 + a * 3)
      + 0.5 * Math.sin(v.x * 17 + v.z * 13 + a);
    v.multiplyScalar(1 + amp * n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---- the build kit ------------------------------------------------------------------

function createKit(style, color) {
  const group = new THREE.Group();
  group.name = "OofHair_" + style.id;
  const crown = new THREE.Group();
  crown.name = "OofHairCrown";
  const flow = new THREE.Group();
  flow.name = "OofHairFlow";
  group.add(crown, flow);

  const geos = new Set();
  const mats = new Set();
  const textures = new Set();
  const recolors = [];
  const tickers = [];

  function track(geo) {
    geos.add(geo);
    return geo;
  }

  function lambert(opts) {
    const m = new THREE.MeshLambertMaterial(opts);
    mats.add(m);
    return m;
  }

  // A material whose colour follows the picked colour through `fn(hex) -> hex`.
  function tinted(fn, extra) {
    const m = lambert({ color: fn(color), ...(extra || {}) });
    recolors.push((hex) => m.color.set(fn(hex)));
    return m;
  }

  function mesh(geo, mat, parent, pos, rot, scale) {
    const m = new THREE.Mesh(geo, mat);
    if (!geos.has(geo)) geos.add(geo);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  let unitCone = null;
  // A cone from `base` pointing along `dir`, `len` long and `rad` wide at the root.
  function spike(parent, mat, base, dir, len, rad) {
    if (!unitCone) unitCone = track(new THREE.ConeGeometry(1, 1, 7));
    const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
    const m = new THREE.Mesh(unitCone, mat);
    m.scale.set(rad, len, rad);
    m.quaternion.setFromUnitVectors(UP, d);
    m.position.set(base[0] + (d.x * len) / 2, base[1] + (d.y * len) / 2, base[2] + (d.z * len) / 2);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  let unitSphere = null;
  function ball(parent, mat, pos, r, squash) {
    if (!unitSphere) unitSphere = track(new THREE.SphereGeometry(1, 12, 9));
    const s = squash || [1, 1, 1];
    return mesh(unitSphere, mat, parent, pos, null, [r * s[0], r * s[1], r * s[2]]);
  }

  // A pivot that swings gently on sim time, for anything that hangs.
  function swayer(parent, at, amp = 0.05, hz = 0.7, phase = 0, axis = "x") {
    const g = new THREE.Group();
    g.position.set(at[0], at[1], at[2]);
    parent.add(g);
    tickers.push((t) => {
      // biased so a hanging strand only ever swings AWAY from the back (+Z), never into it
      const a = amp * (0.6 + 0.4 * Math.sin(t * hz * Math.PI * 2 + phase));
      if (axis === "x") g.rotation.x = -a;
      else g.rotation.z = a;
    });
    return g;
  }

  return {
    group, crown, flow, geos, mats, textures, recolors, tickers,
    track, lambert, tinted, mesh, spike, ball, swayer,
  };
}

// Pieces shared by most styles: a scalp cap over the head top, a back panel, two side
// panels and a forehead fringe. `o` overrides any of their heights.
function scalp(k, mat, o = {}) {
  const lift = o.lift || 0;
  return k.mesh(k.track(softBox(1.32, 0.3 + lift, 1.32, 0.13)), mat, k.crown, [0, 0.5 + lift / 2, 0.01]);
}
function backPanel(k, mat, bottom = -0.3, depth = 0.16) {
  const top = 0.5;
  const h = top - bottom;
  return k.mesh(k.track(softBox(1.32, h, depth, 0.07)), mat, k.flow, [0, bottom + h / 2, 0.6 + depth / 2 - 0.04]);
}
function sides(k, mat, bottom = 0.0, front = -0.5) {
  const h = 0.5 - bottom;
  const back = 0.62;
  const d = back - front;
  const geo = k.track(softBox(0.12, h, d, 0.05));
  for (const sx of [-1, 1]) k.mesh(geo, mat, k.flow, [sx * 0.64, bottom + h / 2, front + d / 2]);
}
function fringe(k, mat, depth = 0.22) {
  return k.mesh(k.track(softBox(1.3, depth, 0.14, 0.06)), mat, k.flow, [0, 0.5 - depth / 2 + 0.04, -0.62]);
}

// ---- the styles -----------------------------------------------------------------------

const BUILDERS = {
  hair_spiky(k) {
    const main = k.tinted((h) => h);
    const tip = k.tinted((h) => shade(h, 0.12));
    scalp(k, main, { lift: 0.06 });
    backPanel(k, main, -0.1);
    sides(k, main, 0.05);
    const S = [
      // [base, dir, len, rad, mat]
      [[0, 0.62, 0.05], [0, 1, 0.3], 1.0, 0.24],
      [[-0.32, 0.6, 0.02], [-0.5, 1, 0.15], 0.82, 0.22],
      [[0.32, 0.6, 0.02], [0.5, 1, 0.15], 0.82, 0.22],
      [[-0.52, 0.5, 0.22], [-1, 0.55, 0.35], 0.7, 0.2],
      [[0.52, 0.5, 0.22], [1, 0.55, 0.35], 0.7, 0.2],
      [[0, 0.55, 0.45], [0, 0.6, 1], 0.8, 0.24],
      [[-0.35, 0.45, 0.5], [-0.45, 0.35, 1], 0.68, 0.2],
      [[0.35, 0.45, 0.5], [0.45, 0.35, 1], 0.68, 0.2],
      [[-0.15, 0.62, -0.3], [-0.15, 1, -0.3], 0.62, 0.2],
      [[0.2, 0.62, -0.3], [0.25, 1, -0.25], 0.55, 0.19],
    ];
    S.forEach(([b, d, l, r], i) => k.spike(k.crown, i % 2 ? tip : main, b, d, l, r));
    // the anime bangs: blades hanging down over the forehead
    const bangs = [[-0.42, -0.25, 0.34, 0.13], [-0.12, 0.05, 0.36, 0.15], [0.14, -0.05, 0.34, 0.14], [0.42, 0.2, 0.32, 0.13]];
    for (const [x, lean, len, r] of bangs) k.spike(k.flow, main, [x, 0.56, -0.58], [lean, -1, -0.32], len, r);
    for (const sx of [-1, 1]) k.spike(k.flow, main, [sx * 0.64, 0.25, -0.25], [sx * 0.25, -1, -0.15], 0.55, 0.14);
  },

  hair_long(k) {
    const main = k.tinted((h) => h);
    const dark = k.tinted((h) => shade(h, -0.07));
    scalp(k, main);
    fringe(k, main, 0.2);
    sides(k, main, -0.42, -0.45);
    backPanel(k, dark, -0.35);
    const sway = k.swayer(k.flow, [0, 0.35, 0.66], 0.07, 0.45);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const x = -0.56 + (1.12 * i) / (n - 1);
      const len = 2.05 + 0.18 * Math.sin(i * 2.1);
      const { geo } = taperTube(
        [[x, 0.1, 0.02], [x * 1.05, -0.5, 0.06], [x * 1.08, -1.2, 0.07], [x * 1.04, -len, 0.04]],
        0.13, 0.05, 20, 8
      );
      k.track(geo);
      k.mesh(geo, i % 2 ? main : dark, sway, [0, 0, 0]);
    }
  },

  hair_afro(k) {
    const main = k.tinted((h) => h);
    const dark = k.tinted((h) => shade(h, -0.05));
    backPanel(k, dark, -0.35);
    sides(k, dark, -0.1, -0.35);
    k.mesh(k.track(blob(3, 0.06)), main, k.crown, [0, 0.62, 0.18], null, [1.02, 0.86, 0.95]);
    // a few loose puffs at the hairline so the edge is not a perfect ellipsoid
    const r = rng(77);
    for (let i = 0; i < 9; i++) {
      const a = (-70 + i * 17.5) * DEG;
      k.ball(k.crown, main, [Math.sin(a) * 0.82, 0.25 + r() * 0.2, 0.22 + Math.cos(a) * 0.55], 0.2 + r() * 0.06);
    }
  },

  hair_mohawk(k) {
    const main = k.tinted((h) => h);
    const tip = k.tinted((h) => shade(h, 0.15, 0.1));
    const buzz = k.tinted((h) => shade(h, -0.18, -0.2));
    k.mesh(k.track(softBox(1.26, 0.1, 1.26, 0.04)), buzz, k.crown, [0, 0.53, 0.01]);
    sides(k, buzz, 0.05, -0.45);
    backPanel(k, buzz, -0.2, 0.08);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const z = -0.5 + t * 1.1;
      const len = 0.62 + 0.42 * Math.sin(t * Math.PI * 0.85 + 0.25);
      const fin = k.spike(k.crown, i % 2 ? tip : main, [0, 0.52, z], [0, 1, 0.25 + t * 0.9], len, 0.2);
      fin.scale.x *= 0.38; // flattened into a blade
    }
  },

  hair_ponytail(k) {
    const main = k.tinted((h) => h);
    const dark = k.tinted((h) => shade(h, -0.08));
    const band = k.lambert({ color: "#e0245e" });
    scalp(k, main);
    fringe(k, main, 0.16);
    sides(k, main, 0.0, -0.45);
    backPanel(k, dark, -0.1);
    const torus = k.track(new THREE.TorusGeometry(0.15, 0.06, 8, 18));
    k.mesh(torus, band, k.flow, [0, 0.3, 0.74]);
    const sway = k.swayer(k.flow, [0, 0.3, 0.76], 0.09, 0.55);
    const { geo } = taperTube([[0, 0, 0], [0, 0.18, 0.28], [0, -0.3, 0.38], [0, -1.0, 0.28], [0, -1.6, 0.22]], 0.17, 0.04, 26, 9);
    k.mesh(k.track(geo), main, sway, [0, 0, 0]);
  },

  hair_twintails(k) {
    const main = k.tinted((h) => h);
    const dark = k.tinted((h) => shade(h, -0.08));
    const bob = k.lambert({ color: "#ff6fb5" });
    scalp(k, main);
    fringe(k, main, 0.24);
    sides(k, main, -0.05, -0.5);
    backPanel(k, dark, -0.2);
    for (const sx of [-1, 1]) {
      k.ball(k.flow, bob, [sx * 0.7, 0.36, 0.3], 0.12);
      const sway = k.swayer(k.flow, [sx * 0.72, 0.36, 0.32], 0.08, 0.5, sx > 0 ? 0 : 1.6);
      const { geo } = taperTube(
        [[0, 0, 0], [sx * 0.3, -0.05, 0.2], [sx * 0.35, -0.6, 0.42], [sx * 0.28, -1.4, 0.44], [sx * 0.18, -2.0, 0.4]],
        0.16, 0.04, 26, 9
      );
      k.mesh(k.track(geo), main, sway, [0, 0, 0]);
    }
  },

  hair_buzz(k) {
    const main = k.tinted((h) => shade(h, -0.02));
    const fade = k.tinted((h) => shade(h, -0.1, -0.15));
    k.mesh(k.track(softBox(1.25, 0.1, 1.25, 0.04)), main, k.crown, [0, 0.53, 0.005]);
    k.mesh(k.track(softBox(1.22, 0.06, 0.08, 0.025)), main, k.flow, [0, 0.47, -0.6]);
    sides(k, fade, 0.0, -0.42);
    backPanel(k, fade, -0.25, 0.07);
  },

  hair_curly(k) {
    const main = k.tinted((h) => h);
    const hi = k.tinted((h) => shade(h, 0.08));
    const dark = k.tinted((h) => shade(h, -0.06));
    scalp(k, dark);
    backPanel(k, dark, -0.3);
    sides(k, dark, -0.15, -0.45);
    const r = rng(1234);
    for (let i = 0; i < 54; i++) {
      const theta = r() * Math.PI * 2;
      const phi = Math.acos(1 - r() * 1.15); // upper cap, a little past the equator
      const x = Math.sin(phi) * Math.cos(theta) * 0.72;
      const y = 0.38 + Math.cos(phi) * 0.38;
      const z = 0.06 + Math.sin(phi) * Math.sin(theta) * 0.72;
      if (z < -0.35 && y < 0.5) continue; // keep the face clear
      const parent = y > 0.5 ? k.crown : k.flow;
      k.ball(parent, i % 3 ? main : hi, [x, y, z], 0.15 + r() * 0.07);
    }
  },

  hair_bun(k) {
    const main = k.tinted((h) => h);
    const dark = k.tinted((h) => shade(h, -0.07));
    const wrap = k.lambert({ color: "#d94436" });
    const stick = k.lambert({ color: "#8c5a3c" });
    scalp(k, main);
    sides(k, main, 0.05, -0.48);
    backPanel(k, dark, -0.15);
    k.mesh(k.track(blob(9, 0.035)), main, k.crown, [0, 0.98, 0.12], null, [0.36, 0.3, 0.36]);
    k.mesh(k.track(new THREE.TorusGeometry(0.27, 0.05, 8, 20)), wrap, k.crown, [0, 0.76, 0.12], [90, 0, 0]);
    const stickGeo = k.track(new THREE.CylinderGeometry(0.025, 0.035, 1.05, 6));
    k.mesh(stickGeo, stick, k.crown, [0, 1.0, 0.12], [0, 0, 62]);
    k.mesh(stickGeo, stick, k.crown, [0, 1.02, 0.14], [12, 0, -68]);
  },

  hair_emo(k) {
    const main = k.tinted((h) => h);
    const streak = k.tinted((h) => shade(h, 0.28, 0.2));
    scalp(k, main, { lift: 0.05 });
    backPanel(k, main, -0.42, 0.18);
    sides(k, main, -0.35, -0.5);
    // the swoop: a sheet over one eye, jagged at its lower edge
    const sheet = k.mesh(k.track(softBox(0.82, 0.6, 0.12, 0.05)), main, k.flow, [0.2, 0.28, -0.64], [0, 0, 16]);
    sheet.name = "OofHairSwoop";
    k.mesh(k.track(softBox(0.12, 0.5, 0.13, 0.04)), streak, k.flow, [0.05, 0.3, -0.655], [0, 0, 16]);
    for (const [x, len] of [[-0.06, 0.32], [0.16, 0.42], [0.38, 0.36], [0.56, 0.28]]) {
      k.spike(k.flow, main, [x, 0.06 - x * 0.2, -0.64], [0.15, -1, -0.05], len, 0.11);
    }
    for (const [x, y] of [[-0.35, 0.5], [0, 0.55], [0.35, 0.5], [-0.2, 0.3], [0.2, 0.3]]) {
      k.spike(k.crown, main, [x, y, 0.45], [x * 0.6, 0.15, 1], 0.55, 0.17);
    }
  },

  hair_dreads(k) {
    const main = k.tinted((h) => h);
    const dark = k.tinted((h) => shade(h, -0.06));
    const bead = k.lambert({ color: "#f7c948", emissive: "#3a2800" });
    scalp(k, dark, { lift: 0.04 });
    backPanel(k, dark, -0.2);
    const ring = k.track(new THREE.TorusGeometry(1, 0.35, 6, 12));
    const sway = k.swayer(k.flow, [0, 0.42, 0], 0.035, 0.5);
    const n = 17;
    for (let i = 0; i < n; i++) {
      const a = (-118 + (236 * i) / (n - 1)) * DEG; // 0 = straight back (+Z)
      const s = Math.max(Math.abs(Math.sin(a)), Math.abs(Math.cos(a)));
      const x = (Math.sin(a) / s) * 0.68;
      const z = (Math.cos(a) / s) * 0.68;
      const behind = z > 0.55;
      const len = behind ? 1.55 + 0.25 * Math.sin(i * 1.9) : 0.62;
      const r = 0.075;
      // the sway pivot sits on the crown ring (y 0.42), so each lock hangs from y 0
      const geo = k.track(new THREE.CapsuleGeometry(r, len - 2 * r, 3, 7));
      k.mesh(geo, i % 2 ? main : dark, sway, [x, -len / 2 + 0.04, z]);
      if (i % 4 === 1) k.mesh(ring, bead, sway, [x, -len * 0.55, z], [90, 0, 0], [r * 1.25, r * 1.25, r * 1.25]);
    }
  },

  hair_flame(k) {
    const base = k.tinted((h) => shade(h, -0.08), { emissive: "#000000" });
    const outer = k.tinted((h) => h, { emissive: "#000000" });
    const inner = k.tinted((h) => shade(h, 0.3, 0.2), { emissive: "#000000" });
    const glow = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    k.mats.add(glow);
    const recolorGlow = (hex) => {
      glow.color.set(shade(hex, 0.12, 0.2));
      for (const m of [base, outer, inner]) m.emissive.copy(m.color);
    };
    k.recolors.push(recolorGlow);
    scalp(k, base);
    sides(k, base, 0.0, -0.45);
    backPanel(k, base, -0.2);
    const tongues = [];
    const r = rng(42);
    const spots = [[0, 0.1], [-0.32, -0.15], [0.32, -0.15], [-0.4, 0.3], [0.4, 0.3], [0, 0.45], [-0.18, -0.4], [0.2, -0.38], [-0.5, 0.0], [0.5, 0.0], [0.15, 0.25], [-0.15, 0.22]];
    spots.forEach(([x, z], i) => {
      const len = 0.75 + r() * 0.55;
      const dir = [x * 0.7, 1, z * 0.6 + 0.15];
      const o = k.spike(k.crown, outer, [x, 0.55, z], dir, len, 0.22);
      const c = k.spike(k.crown, inner, [x, 0.55, z], dir, len * 0.6, 0.12);
      const g = k.spike(k.crown, glow, [x, 0.5, z], dir, len * 1.25, 0.32);
      tongues.push({ meshes: [o, c, g], len, hz: 2.2 + r() * 2.4, ph: r() * 6.28 });
    });
    for (const [b, d] of [[[-0.62, 0.25, -0.2], [-0.4, 1, 0]], [[0.62, 0.25, -0.2], [0.4, 1, 0]]]) {
      const o = k.spike(k.flow, outer, b, d, 0.5, 0.14);
      tongues.push({ meshes: [o], len: 0.5, hz: 3, ph: b[0] });
    }
    // embers: a few motes that rise off the top and loop
    const embers = [];
    for (let i = 0; i < 7; i++) {
      embers.push({ m: k.ball(k.crown, inner, [0, 0.6, 0], 0.045), x: (r() - 0.5) * 0.9, z: (r() - 0.5) * 0.8, ph: r(), sp: 0.5 + r() * 0.5 });
    }
    k.tickers.push((t) => {
      for (const tg of tongues) {
        const f = 1 + 0.22 * Math.sin(t * tg.hz * 6.283 + tg.ph) + 0.08 * Math.sin(t * tg.hz * 15 + tg.ph * 2);
        for (const m of tg.meshes) m.scale.y = m.userData.baseY * f;
      }
      for (const e of embers) {
        const u = (t * e.sp + e.ph) % 1;
        e.m.position.set(e.x * (1 - u * 0.5) + Math.sin(t * 3 + e.ph * 9) * 0.06, 0.7 + u * 1.5, e.z);
        const s = 0.05 * (1 - u);
        e.m.scale.set(s, s, s);
      }
      const pulse = 0.75 + 0.25 * Math.sin(t * 5.3);
      outer.emissiveIntensity = 0.55 * pulse;
      inner.emissiveIntensity = 0.9;
      base.emissiveIntensity = 0.3 * pulse;
    });
    for (const tg of tongues) for (const m of tg.meshes) m.userData.baseY = m.scale.y;
  },

  hair_galaxy(k, color) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    k.textures.add(tex);
    const mat = k.lambert({ color: "#ffffff", map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.6 });
    const paint = (hex) => {
      paintGalaxy(canvas, hex);
      tex.needsUpdate = true;
      mat.userData.thumbColor = shade(hex, -0.08, 0.1); // what the 2D thumbnails draw
    };
    paint(color);
    k.recolors.push(paint);
    scalp(k, mat, { lift: 0.05 });
    k.mesh(k.track(softBox(1.38, 0.5, 1.45, 0.22)), mat, k.crown, [0, 0.66, 0.16], [12, 0, 0]);
    fringe(k, mat, 0.18);
    sides(k, mat, -0.4, -0.45);
    backPanel(k, mat, -0.4, 0.2);
    const sway = k.swayer(k.flow, [0, 0.3, 0.7], 0.06, 0.4);
    for (const sx of [-1, 0, 1]) {
      const { geo } = taperTube(
        [[sx * 0.4, 0, 0], [sx * 0.5, -0.6, 0.1], [sx * 0.3, -1.1, 0.05], [sx * 0.45, -1.6, 0.12]],
        0.17, 0.05, 22, 8
      );
      k.mesh(k.track(geo), mat, sway, [0, 0, 0]);
    }
    // a loose shell of stars that orbits the head
    const r = rng(9);
    const pts = new Float32Array(48 * 3);
    for (let i = 0; i < 48; i++) {
      const a = r() * Math.PI * 2;
      const rad = 0.85 + r() * 0.45;
      pts[i * 3] = Math.cos(a) * rad;
      pts[i * 3 + 1] = 0.2 + r() * 1.1;
      pts[i * 3 + 2] = Math.sin(a) * rad;
    }
    const pgeo = k.track(new THREE.BufferGeometry());
    pgeo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    const pmat = new THREE.PointsMaterial({ color: "#ffffff", size: 0.06, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    k.mats.add(pmat);
    const stars = new THREE.Points(pgeo, pmat);
    stars.name = "OofHairStars";
    k.crown.add(stars);
    k.tickers.push((t, dt) => {
      tex.offset.x = (t * 0.025) % 1;
      tex.offset.y = (t * 0.012) % 1;
      mat.emissiveIntensity = 0.5 + 0.18 * Math.sin(t * 2.3);
      stars.rotation.y += dt * 0.5;
      pmat.opacity = 0.65 + 0.3 * Math.sin(t * 4.1);
    });
  },

  hair_pompadour(k) {
    const main = k.tinted((h) => h);
    const hi = k.tinted((h) => shade(h, 0.14));
    const fade = k.tinted((h) => shade(h, -0.1, -0.15));
    k.mesh(k.track(softBox(1.26, 0.12, 1.26, 0.05)), fade, k.crown, [0, 0.53, 0.01]);
    sides(k, fade, 0.0, -0.4);
    backPanel(k, main, -0.15, 0.1);
    k.mesh(k.track(softBox(1.1, 0.5, 1.15, 0.24)), main, k.crown, [0, 0.76, 0.0], [-14, 0, 0]);
    const roll = k.track(new THREE.CylinderGeometry(0.3, 0.3, 1.04, 18));
    k.mesh(roll, main, k.crown, [0, 0.95, -0.46], [0, 0, 90]);
    for (const x of [-0.3, 0, 0.3]) {
      k.mesh(k.track(softBox(0.06, 0.04, 1.0, 0.015)), hi, k.crown, [x, 1.02, 0.02], [-14, 0, 0]);
    }
  },

  hair_braids(k) {
    const main = k.tinted((h) => h);
    const dark = k.tinted((h) => shade(h, -0.08));
    const tie = k.lambert({ color: "#f7c948", emissive: "#2a1d00" });
    scalp(k, main);
    k.mesh(k.track(softBox(0.05, 0.05, 1.3, 0.02)), dark, k.crown, [0, 0.665, 0]); // centre parting
    fringe(k, main, 0.14);
    sides(k, main, 0.0, -0.45);
    backPanel(k, dark, -0.2);
    for (const sx of [-1, 1]) {
      const sway = k.swayer(k.flow, [sx * 0.45, 0.3, 0.66], 0.06, 0.5, sx > 0 ? 0 : 1.3);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(sx * 0.08, -0.45, 0.1),
        new THREE.Vector3(sx * 0.05, -1.1, 0.12), new THREE.Vector3(0, -1.75, 0.08),
      ]);
      const links = 13;
      const P = new THREE.Vector3();
      const T = new THREE.Vector3();
      for (let i = 0; i < links; i++) {
        const u = i / (links - 1);
        curve.getPointAt(u, P);
        curve.getTangentAt(u, T);
        const r = 0.15 - 0.06 * u;
        const m = k.ball(sway, i % 2 ? main : dark, [P.x + (i % 2 ? 0.05 : -0.05), P.y, P.z], r, [1, 1.35, 0.9]);
        m.quaternion.setFromUnitVectors(UP, T.clone().negate().normalize());
        m.rotateZ(i % 2 ? 0.45 : -0.45);
      }
      curve.getPointAt(1, P);
      k.mesh(k.track(new THREE.TorusGeometry(0.07, 0.03, 6, 12)), tie, sway, [P.x, P.y - 0.05, P.z], [90, 0, 0]);
      k.spike(sway, main, [P.x, P.y - 0.08, P.z], [0, -1, 0.05], 0.22, 0.09);
    }
  },

  hair_rainbow(k, color) {
    const mat = k.lambert({ color: "#ffffff", vertexColors: true, emissive: "#202020" });
    scalp(k, mat);
    fringe(k, mat, 0.22);
    sides(k, mat, -0.4, -0.48);
    backPanel(k, mat, -0.35);
    const sway = k.swayer(k.flow, [0, 0.3, 0.68], 0.06, 0.45);
    for (let i = 0; i < 6; i++) {
      const x = -0.52 + i * 0.208;
      const pts = [];
      for (let j = 0; j <= 5; j++) {
        const y = -j * 0.26;
        pts.push([x + Math.sin(j * 1.6 + i) * 0.06, y, 0.04 + Math.sin(j * 1.3 + i * 0.7) * 0.07]);
      }
      const { geo } = taperTube(pts, 0.13, 0.06, 20, 8);
      k.mesh(k.track(geo), mat, sway, [0, 0, 0]);
    }
    // per-vertex height in head space, once — the colours are recomputed from it
    k.group.updateMatrixWorld(true);
    const layers = [];
    const v = new THREE.Vector3();
    k.group.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      const hs = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        hs[i] = clamp((0.75 - v.y) / 2.4, 0, 1); // 0 at the crown, 1 at the tips
      }
      // a geometry can be shared between meshes; each needs its own colour buffer
      if (o.geometry.userData.rainbowShared) {
        o.geometry = o.geometry.clone();
        k.geos.add(o.geometry);
      }
      o.geometry.userData.rainbowShared = true;
      const col = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
      o.geometry.setAttribute("color", col);
      layers.push({ hs, col });
    });
    let hue = hexToHsl(color)[0];
    let light = clamp(hexToHsl(color)[2], 0.45, 0.7);
    const c = new THREE.Color();
    const recolor = (shift) => {
      for (const { hs, col } of layers) {
        for (let i = 0; i < hs.length; i++) {
          c.setHSL((((hue + hs[i] * 300 + shift) % 360) + 360) % 360 / 360, 0.9, light);
          col.setXYZ(i, c.r, c.g, c.b);
        }
        col.needsUpdate = true;
      }
    };
    recolor(0);
    k.recolors.push((hex) => {
      const hsl = hexToHsl(hex);
      hue = hsl[0];
      light = clamp(hsl[2], 0.45, 0.7);
      recolor(0);
    });
    let acc = 0;
    k.tickers.push((t, dt) => {
      acc += dt;
      if (acc < 1 / 12) return; // 12 Hz is plenty for a slow drift, and cheap on a room of 20
      acc = 0;
      recolor(-t * 40);
    });
  },

  hair_sidepart(k) {
    const main = k.tinted((h) => h);
    const hi = k.tinted((h) => shade(h, 0.1));
    const dark = k.tinted((h) => shade(h, -0.08));
    scalp(k, dark);
    k.mesh(k.track(softBox(0.85, 0.24, 1.3, 0.1)), main, k.crown, [0.2, 0.68, 0.0], [0, 0, -6]);
    k.mesh(k.track(softBox(0.45, 0.18, 1.28, 0.08)), dark, k.crown, [-0.42, 0.64, 0.01], [0, 0, 8]);
    k.mesh(k.track(softBox(0.9, 0.22, 0.32, 0.1)), hi, k.crown, [0.15, 0.7, -0.5], [-20, 0, -8]);
    sides(k, dark, 0.02, -0.42);
    backPanel(k, dark, -0.2);
  },

  hair_spacebuns(k) {
    const main = k.tinted((h) => h);
    const dark = k.tinted((h) => shade(h, -0.08));
    const wrap = k.lambert({ color: "#ffffff", emissive: "#333333" });
    scalp(k, main);
    fringe(k, main, 0.26);
    sides(k, main, -0.35, -0.5);
    backPanel(k, dark, -0.35);
    const torus = k.track(new THREE.TorusGeometry(0.22, 0.05, 8, 18));
    for (const sx of [-1, 1]) {
      k.mesh(k.track(blob(sx + 5, 0.04)), main, k.crown, [sx * 0.42, 0.88, 0.1], null, [0.3, 0.28, 0.3]);
      k.mesh(torus, wrap, k.crown, [sx * 0.4, 0.66, 0.1], [90, 0, sx * 20]);
    }
  },

  hair_crystal(k) {
    const glass = k.tinted((h) => h, { transparent: true, opacity: 0.82, emissive: "#000000" });
    const core = k.tinted((h) => shade(h, 0.2), { emissive: "#000000" });
    k.recolors.push((hex) => {
      glass.emissive.set(shade(hex, -0.2));
      core.emissive.set(shade(hex, -0.1));
    });
    scalp(k, core);
    sides(k, core, 0.05, -0.45);
    backPanel(k, core, -0.15);
    const oct = k.track(new THREE.OctahedronGeometry(1, 0));
    const r = rng(31);
    for (let i = 0; i < 13; i++) {
      const a = r() * Math.PI * 2;
      const rad = 0.15 + r() * 0.45;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad + 0.08;
      const dir = new THREE.Vector3(x * 1.2, 1, z * 1.1).normalize();
      const len = 0.45 + r() * 0.5;
      const m = k.mesh(oct, i % 3 ? glass : core, k.crown, [x + dir.x * len * 0.6, 0.55 + dir.y * len * 0.6, z + dir.z * len * 0.6], null, [0.13, len, 0.13]);
      m.quaternion.setFromUnitVectors(UP, dir);
    }
    k.tickers.push((t) => {
      glass.emissiveIntensity = 0.55 + 0.35 * Math.sin(t * 2.6);
      core.emissiveIntensity = 0.7;
    });
  },

  hair_wolfcut(k) {
    const main = k.tinted((h) => h);
    const dark = k.tinted((h) => shade(h, -0.1));
    scalp(k, main, { lift: 0.08 });
    sides(k, main, -0.42, -0.5);
    backPanel(k, dark, -0.45, 0.18);
    // shaggy layered fringe and a feathered mullet at the back
    for (const [x, len] of [[-0.45, 0.34], [-0.22, 0.36], [0, 0.32], [0.22, 0.36], [0.45, 0.32]]) {
      k.spike(k.flow, main, [x, 0.6, -0.56], [x * 0.3, -1, -0.28], len, 0.15);
    }
    for (const [x, y] of [[-0.5, 0.0], [0, -0.05], [0.5, 0.0], [-0.28, -0.25], [0.28, -0.25]]) {
      k.spike(k.flow, dark, [x, y, 0.66], [x * 0.5, -1, 0.35], 0.6, 0.16);
    }
    for (const [x, z] of [[-0.3, -0.1], [0.3, 0.0], [0, 0.3], [-0.45, 0.35], [0.45, 0.35]]) {
      k.spike(k.crown, main, [x, 0.6, z], [x, 0.7, 0.6], 0.42, 0.18);
    }
  },
};

// The galaxy canvas: a dark nebula in the picked hue, swirled with lighter clouds, with
// white stars that the emissive map makes glow.
function paintGalaxy(canvas, hex) {
  const g = canvas.getContext("2d");
  if (!g) return;
  const [h] = hexToHsl(hex);
  const W = canvas.width;
  g.fillStyle = hslToHex(h, 0.65, 0.1);
  g.fillRect(0, 0, W, W);
  const r = rng(Math.round(h) + 7);
  for (let i = 0; i < 18; i++) {
    const x = r() * W, y = r() * W, rad = 14 + r() * 34;
    const hue = h + (r() - 0.5) * 80;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, hslToHex(hue, 0.85, 0.5 + r() * 0.15) + "aa");
    grad.addColorStop(1, hslToHex(hue, 0.85, 0.3) + "00");
    g.fillStyle = grad;
    // drawn at three wraps so the texture tiles without a seam
    for (const ox of [-W, 0, W]) for (const oy of [-W, 0, W]) g.fillRect(x - rad + ox, y - rad + oy, rad * 2, rad * 2);
  }
  for (let i = 0; i < 70; i++) {
    const x = r() * W, y = r() * W, s = r() < 0.12 ? 2 : 1;
    g.fillStyle = r() < 0.2 ? "#ffe9a8" : "#ffffff";
    g.fillRect(x, y, s, s);
  }
}

// ---- the public build ---------------------------------------------------------------

// buildHair(styleId, colorHex) -> { id, color, group, setColor, setTucked, update, dispose }
// or null for an unknown id. The caller parents `group` to the head mesh.
export function buildHair(styleId, colorHex) {
  const style = BY_ID.get(styleId);
  const builder = style && BUILDERS[styleId];
  if (!builder) return null;
  const color = normalizeHairColor(styleId, colorHex);
  const k = createKit(style, color);
  builder(k, color);
  for (const fn of k.recolors) fn(color);
  let t = 0;
  const hair = {
    id: styleId,
    color,
    group: k.group,
    tucked: false,
    setColor(hex) {
      const c = normalizeHairColor(styleId, hex);
      if (c === hair.color) return;
      hair.color = c;
      for (const fn of k.recolors) fn(c);
    },
    setTucked(on) {
      hair.tucked = Boolean(on);
      k.crown.visible = !hair.tucked;
    },
    update(dt) {
      const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
      t += step;
      for (const fn of k.tickers) fn(t, step);
    },
    dispose() {
      if (k.group.parent) k.group.parent.remove(k.group);
      for (const g of k.geos) g.dispose();
      for (const m of k.mats) m.dispose();
      for (const tx of k.textures) tx.dispose();
    },
  };
  // a first tick so animated styles are posed before their first frame
  hair.update(0.001);
  return hair;
}

// ---- 2D projection (thumbnails) ------------------------------------------------------
//
// A tiny painter's-algorithm rasteriser: the real 3D hair, projected orthographically
// and drawn as shaded triangles on a 2D canvas. The Avatar Editor's tiles and the
// friends-list thumbnails (avatar-thumb.js) both use it, so a thumbnail never needs a
// WebGL context of its own (§5.10.1's reason for drawing tiles in 2D).

const TRI_CACHE = new Map();
const TRI_CACHE_MAX = 80;
const LIGHT = new THREE.Vector3(-0.45, 0.75, -0.5).normalize();

function triangles(styleId, colorHex, yaw, pitch, tucked) {
  const color = normalizeHairColor(styleId, colorHex);
  const key = `${styleId}|${color}|${yaw.toFixed(2)}|${pitch.toFixed(2)}|${tucked ? 1 : 0}`;
  if (TRI_CACHE.has(key)) return TRI_CACHE.get(key);
  const hair = buildHair(styleId, color);
  if (!hair) return [];
  hair.setTucked(tucked);
  const view = new THREE.Matrix4().makeRotationX(pitch).multiply(new THREE.Matrix4().makeRotationY(yaw));
  hair.group.updateMatrixWorld(true);
  const out = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const col = new THREE.Color();
  const vis = (o) => {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  };
  hair.group.traverse((o) => {
    if (!o.isMesh || !vis(o)) return;
    const mat = o.material;
    if (mat.blending === THREE.AdditiveBlending) return; // glow shells read as mud in 2D
    const pos = o.geometry.attributes.position;
    const vc = mat.vertexColors ? o.geometry.attributes.color : null;
    const idx = o.geometry.index;
    const m = new THREE.Matrix4().multiplyMatrices(view, o.matrixWorld);
    const count = idx ? idx.count : pos.count;
    const emissive = mat.emissive ? mat.emissive.clone().multiplyScalar(mat.emissiveIntensity || 0) : null;
    for (let i = 0; i < count; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(m);
      b.fromBufferAttribute(pos, ib).applyMatrix4(m);
      c.fromBufferAttribute(pos, ic).applyMatrix4(m);
      e1.subVectors(b, a);
      e2.subVectors(c, a);
      n.crossVectors(e1, e2);
      if (n.lengthSq() < 1e-12) continue;
      n.normalize();
      if (n.z > 0.02) continue; // faces away from a viewer looking along +Z
      if (vc) {
        col.setRGB(
          (vc.getX(ia) + vc.getX(ib) + vc.getX(ic)) / 3,
          (vc.getY(ia) + vc.getY(ib) + vc.getY(ic)) / 3,
          (vc.getZ(ia) + vc.getZ(ib) + vc.getZ(ic)) / 3
        );
      } else if (mat.map && mat.userData.thumbColor) {
        col.set(mat.userData.thumbColor);
      } else {
        col.copy(mat.color);
      }
      const glow = mat.map ? null : emissive;
      const lit = 0.5 + 0.6 * Math.max(0, n.x * LIGHT.x + n.y * LIGHT.y + n.z * LIGHT.z);
      const r = col.r * lit + (glow ? glow.r * 0.6 : 0);
      const g = col.g * lit + (glow ? glow.g * 0.6 : 0);
      const bl = col.b * lit + (glow ? glow.b * 0.6 : 0);
      const fill = "#" + new THREE.Color(Math.min(1, r), Math.min(1, g), Math.min(1, bl)).getHexString(THREE.SRGBColorSpace);
      out.push({
        z: (a.z + b.z + c.z) / 3,
        p: [a.x, a.y, b.x, b.y, c.x, c.y],
        fill,
        alpha: mat.transparent ? mat.opacity : 1,
      });
    }
  });
  hair.dispose();
  out.sort((p, q) => q.z - p.z); // far first
  if (TRI_CACHE.size >= TRI_CACHE_MAX) TRI_CACHE.delete(TRI_CACHE.keys().next().value);
  TRI_CACHE.set(key, out);
  return out;
}

// The head box's own triangles, so a 3/4-view tile can occlude hair behind the head.
function headTriangles(view, headHex, face) {
  const geo = new THREE.BoxGeometry(1.2, 1, 1.2);
  const pos = geo.attributes.position;
  const idx = geo.index;
  const out = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const base = new THREE.Color(headHex);
  for (let i = 0; i < idx.count; i += 3) {
    a.fromBufferAttribute(pos, idx.getX(i)).applyMatrix4(view);
    b.fromBufferAttribute(pos, idx.getX(i + 1)).applyMatrix4(view);
    c.fromBufferAttribute(pos, idx.getX(i + 2)).applyMatrix4(view);
    n.crossVectors(new THREE.Vector3().subVectors(b, a), new THREE.Vector3().subVectors(c, a)).normalize();
    if (n.z > 0.02) continue;
    const lit = 0.55 + 0.5 * Math.max(0, n.x * LIGHT.x + n.y * LIGHT.y + n.z * LIGHT.z);
    const col = base.clone().multiplyScalar(Math.min(1.15, lit));
    out.push({ z: (a.z + b.z + c.z) / 3, p: [a.x, a.y, b.x, b.y, c.x, c.y], fill: "#" + col.getHexString(), alpha: 1, head: true });
  }
  geo.dispose();
  if (face) {
    // two eyes and a smile, as flat quads a hair's breadth in front of the face, so a
    // fringe in front of them still sorts over them
    const quad = (x0, y0, x1, y1, fill) => {
      const q = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => new THREE.Vector3(x, y, -0.605).applyMatrix4(view));
      for (const [i, j, k] of [[0, 1, 2], [0, 2, 3]]) {
        out.push({ z: (q[i].z + q[j].z + q[k].z) / 3 - 0.002, p: [q[i].x, q[i].y, q[j].x, q[j].y, q[k].x, q[k].y], fill, alpha: 1 });
      }
    };
    quad(-0.3, 0.06, -0.15, 0.2, "#1b1b1b");
    quad(0.15, 0.06, 0.3, 0.2, "#1b1b1b");
    quad(-0.22, -0.2, 0.22, -0.13, "#1b1b1b");
  }
  return out;
}

// paintHair(g, styleId, colorHex, opts) — draws the hair onto a 2D context.
// opts: { cx, cy, scale (px per stud, or [sx, sy]), yaw, pitch (radians; 0,0 = face-on,
//         negative pitch looks down from above), tucked, layer: "all" | "back" | "front",
//         head: "#hex" (draw the head box too), face: bool (eyes + smile on that head) }
// styleId may be null with a head, which draws the bald head alone.
// "back"/"front" split at the head's centre plane, so a caller can draw the body between
// them. Returns false when there is nothing to draw.
export function paintHair(g, styleId, colorHex, opts = {}) {
  if (!g || (!isHairId(styleId) && !opts.head)) return false;
  const yaw = opts.yaw || 0;
  const pitch = opts.pitch || 0;
  let tris = isHairId(styleId) ? triangles(styleId, colorHex, yaw, pitch, Boolean(opts.tucked)) : [];
  if (opts.layer === "back") tris = tris.filter((t) => t.z > 0);
  else if (opts.layer === "front") tris = tris.filter((t) => t.z <= 0);
  if (opts.head) {
    const view = new THREE.Matrix4().makeRotationX(pitch).multiply(new THREE.Matrix4().makeRotationY(yaw));
    tris = tris.concat(headTriangles(view, opts.head, Boolean(opts.face))).sort((p, q) => q.z - p.z);
  }
  const sx = Array.isArray(opts.scale) ? opts.scale[0] : opts.scale || 20;
  const sy = Array.isArray(opts.scale) ? opts.scale[1] : opts.scale || 20;
  const cx = opts.cx || 0;
  const cy = opts.cy || 0;
  // Viewed from the face side: head-local -X is screen right when the face looks at us.
  const X = (x) => cx - x * sx;
  const Y = (y) => cy - y * sy;
  g.save();
  g.lineJoin = "round";
  for (const t of tris) {
    g.globalAlpha = t.alpha;
    g.fillStyle = t.fill;
    g.strokeStyle = t.fill;
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(X(t.p[0]), Y(t.p[1]));
    g.lineTo(X(t.p[2]), Y(t.p[3]));
    g.lineTo(X(t.p[4]), Y(t.p[5]));
    g.closePath();
    g.fill();
    g.stroke(); // hides the hairline seams between neighbouring triangles
  }
  g.restore();
  return tris.length > 0;
}
