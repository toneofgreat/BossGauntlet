// src/games/cats/scripts/zonekit.js - the zone runtime of Find The Cats (spec 28 §6). It owns the
// ONE live zone: it builds it when the player walks through a hub portal and tears every part,
// mesh, texture and handler of it down again on the way out, because only one zone is ever
// alive at a time (perf, and place.json parts are immutable once instanced).
//
// ============================== THE ZONE-MODULE CONTRACT ===================================
// scripts/zones/zK.js (K = 1..7, one per zone, written by that zone's agent) exports:
//
//   export const looks = { [n]: (K) => K.finish(...) , ... }   // EVERY cat of the zone; a look may
//        also be { look: (K) => ..., spin: false } to stop the idle spin. Pure: build with the
//        catkit K it is handed (scripts/catkit.js header), never touch z/ctx/DOM in a look - the
//        Index renders looks for zones that are not loaded.
//   export function build(z) { ... }   // builds the WHOLE zone and places every cat once with
//        z.cat(n, ...). May return { reset() } (unused today). Must not throw; a throw makes the
//        game skip the zone with a console.warn and tear down whatever it half-built.
//
// COORDINATES. Zone-local, exactly like the original: x east, y up, z south, ground top y = 0,
// zone origin = world (600*K, 0, 0). Build inside x,z in [-195, 195], y in [-120, 320]. The kit
// builds the spawn pad at (-185, 0, 0) (top at y 0.2) and the return-to-hub portal at
// (-185, 0, 18) - keep a clear 24 x 24 area around both. Everything else (ground included) is
// the zone's. Falling below world y -150 kills; respawn is the zone spawn.
//
// THE z OBJECT (single player: there is no `player` argument anywhere - it is always you):
//   z.k, z.info (ZONES[k] row: name/first/last/unlock/color), z.origin [x,y,z], z.K (catkit),
//   z.THREE, z.R (roster module), z.ctx (escape hatch; prefer the helpers)
//   z.rng() -> [0,1) deterministic per zone; z.random(a, b); z.randint(a, b)
//   z.cf(x, y, z, ryDeg?) -> WORLD Matrix4 for a zone-local point (the original ctx.cf); compose with
//        K.mul(z.cf(...), K.rot(...), K.cf(...)).   z.pos(x, y, z) -> world [x,y,z]
//   z.toLocal([wx, wy, wz]) -> zone-local [x,y,z]
//
//   PARTS - z.part(def) -> Part handle. def (all optional except a position):
//     shape   engine shape: box|wedge|cylinder|sphere|cone|pyramid|prism|dome|capsule|ring|star|
//             diamond|tube - ENGINE orientation (cylinder axis = Y; wedge's tall face at -Z)
//     size    [x, y, z] studs (each >= 0.05)
//     at      zone-local centre [x, y, z] (+ rot [xDeg, yDeg, zDeg])   OR   cf  world Matrix4
//     color   "#rrggbb"; material engine or original-game name (those are mapped); neon: true
//     transparency 0..1;  collide (default true);  decor: true (= collide false, unclickable)
//     dynamic: true  -> its own engine part (needed if you will move/recolour it a lot)
//     light: { color, intensity, range }  (a lamp; keep <= 12 per zone)
//     behaviors: engine behaviours, e.g. [{ type: "movingPlatform", waypoints: [[wx,wy,wz]...],
//             speed, pauseS }] - WORLD waypoints (use z.pos). A moving platform that must carry
//             the player MUST be this behaviour; tag "Move" moves the part without carrying.
//   z.rpart(props) - the same with the ORIGINAL game's part semantics, for mechanical ports: { Size, CFrame (Matrix4),
//     Color, Material, Transparency, CanCollide, Neon, Decor, Shape: "Block"|"Ball"|"Cylinder",
//     Class: "Part"|"WedgePart"|"CornerWedgePart"|"TrussPart" }. Ball diameter = min(Size);
//     Cylinder axis = the CFrame's X; WedgePart slope rises toward +Z; CornerWedge ~ pyramid;
//     TrussPart becomes a lattice-coloured box - THE ENGINE HAS NO CLIMBING, so a truss climb
//     must become steps, a bounce pad or a ladder of ledges.
//   z.rcyl(len, diameter, cf, props) / z.rwedge(size, cf, props) / z.ball(d, cf, props) shorthands.
//   Part handle: h.pos() world, h.local(), h.size, h.cf (live Matrix4), h.id (engine id or null),
//     h.setColor(hex), h.setTransparency(t), h.setCollide(bool), h.show(bool),
//     h.moveTo(cf | localXYZ), h.remove(). Static parts are drawn INSTANCED (one draw call per
//     shape|material|colour|transparency combination); the first setter call on one quietly
//     promotes it to its own engine part, so mutate few of them.
//
//   TEXT - z.label(part, text, { face: "front"|"back"|"top"|"bottom"|"left"|"right" (front = -Z,
//     the original Front), color, bg, both, pps, stroke, align }) -> { setText(t), setColor(hex) }
//     z.billboard(partOrLocalXYZ, text, { width (8), height (2), offset [x,y,z] (above the part),
//     color, bg, top (always on top), distance (120) }) -> { setText(t) }
//
//   INTERACTION (all fire at most once per edge, guarded; errors are caught and warned):
//     z.touch(part, fn, { cooldown = 0.4 })      avatar starts touching the part
//     z.click(part, fn, { distance = 24, cooldown = 0.15 })  tap/click the part on screen
//     z.prompt(part, text, fn, { distance = 10, hold = 0 }) -> { setText(t), enable(bool) }
//          a "[E] text" button appears while near; E or tapping it fires (hold = seconds to wait)
//     z.input({ title, hint, kind: "digits"|"text", max = 64 }, fn(textUPPERCASE))  text box
//     z.kill(part)            touching it kills (respawn at the zone spawn)
//     z.respawn()             back to the zone spawn now
//     z.notify(text, color?) / z.fail(text)   toasts (fail adds the buzzer)
//     z.sound(name, { pitch, volume })  engine sfx name OR an original sound file name (mapped)
//     z.tone(pitch, { volume })         short musical tone (pitch 0.5..2.5 like the original)
//     z.lockout(seconds, key?) -> bool  starts a lockout (false if one is already running)
//     z.isLocked(key?) -> secondsLeft (0 = not locked)  - stops brute force on guess puzzles
//     z.flag(key, value?) -> value      zone puzzle state, cleared when you leave the zone
//     z.onLeave(fn)  z.heartbeat(fn(dt, t))  z.time() -> sim seconds
//     z.player.pos() -> zone-local feet [x,y,z]; z.player.teleport(localXYZ, yawDeg?)
//     z.tag(handleOrArray, kind, attrs) client animation: "Spin" { axis: "x"|"y"|"z", speed deg/s },
//          "Bob" { amp, period }, "Move" { offset: [x,y,z], period }, "Blink" { period },
//          "Rainbow" { period }. Original attribute casing (Axis, Speed, Amp, Period, Offset) works.
//
//   CATS - z.cat(n, cfOrLocalXYZ, { locked, hidden, scale = 1, center, spin }) -> cat handle
//          (cf = the floor point the cat stands on; its bottom floats 0.6 above; center: true
//          means cf is the cat's centre). Touch it or tap it (<= 32 studs) to collect it.
//          locked: a glass cage holds it until z.unlock(n); hidden: invisible until z.reveal(n).
//     z.unlock(n) z.reveal(n) z.give(n) z.has(n) z.isUnlocked(n) z.isRevealed(n) z.foundCount()
//     z.onFound(fn(n)). Unlock/reveal last for the whole visit to the Place (they survive a
//     re-entry of the zone); flags do not.
//
// BUDGET PER ZONE (perf, phones at 30 fps): <= 1400 parts, of which <= 900 collide; <= 150
// dynamic/promoted/tagged parts; <= 60 distinct static shape|material|colour|transparency combos
// (= draw calls); <= 40 labels + billboards; <= 12 lamps; every cat's look <= 60 prims.
// ===========================================================================================

import { createCatKit } from "./catkit.js";
import * as R from "./roster.js";

const ENGINE_SHAPES = new Set(["box", "wedge", "cylinder", "sphere", "cone", "pyramid", "prism", "dome", "capsule", "ring", "star", "diamond", "tube"]);
const ENGINE_MATERIALS = new Set(["plastic", "neon", "metal", "grass", "lava", "ice", "glass", "wood", "brick", "marble", "sand", "concrete", "gold", "cobble", "snow", "galaxy"]);
const LEGACY_MATERIALS = Object.freeze({
  smoothplastic: "plastic", plastic: "plastic", fabric: "plastic", cardboard: "wood", carpet: "plastic",
  diamondplate: "metal", corrodedmetal: "metal", foil: "metal", metal: "metal",
  leafygrass: "grass", grass: "grass", ground: "sand", mud: "sand",
  forcefield: "glass", glass: "glass", woodplanks: "wood", wood: "wood",
  slate: "concrete", granite: "concrete", basalt: "concrete", pavement: "concrete", asphalt: "concrete",
  limestone: "concrete", rock: "concrete", salt: "sand", sandstone: "sand",
  cobblestone: "cobble", glacier: "ice", crackedlava: "lava",
});
const SOUND_MAP = Object.freeze({
  "volume_slider.ogg": "click", "action_jump_land.mp3": "land", "action_jump.mp3": "jump",
  "impact_explosion_03.mp3": "boing", "impact_water.mp3": "pop", "action_get_up.mp3": "whoosh",
  "action_falling.ogg": "whoosh", "action_swim.mp3": "whoosh", "action_footsteps_plastic.mp3": "click",
  "oof.ogg": "oof", "ouch.ogg": "oof",
});

const TOUCH_SKIN = 0.25;
const CAPSULE_R = 1;
const CAT_CLICK_DIST = 32;
const KILL_GRACE_S = 1.6;
const TAP_MIN_PX = 22;
const RAINBOW_STEPS = 24;
const COLOR_FX_S = 0.1;

let partSeq = 0; // never rewound: a runtime id is never reused (spec 25 §3.4)

function hsvHex(h, s, v) {
  const f = (n) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const c = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
  return "#" + c(f(5)) + c(f(3)) + c(f(1));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// createZoneKit(ctx, deps) -> kit
//   deps = { K?, has(n), award(n, how) -> bool, foundCount(), ui: { prompt(view|null), input(opts) ->
//            Promise<string|null> }, onLeaveZone(k) (the return portal), getLook(n) -> Group }
export function createZoneKit(ctx, deps) {
  const THREE = ctx.engine.THREE;
  const K = deps.K || createCatKit(THREE);
  const parts = ctx.engine.parts;
  const session = { unlocked: new Set(), revealed: new Set(), locks: new Map() };
  let Z = null; // the live zone, or null in the hub
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();

  const warn = (where, err) => console.warn(`[cats] zone ${Z ? Z.k : "?"} ${where}:`, err && err.message ? err.message : err);
  const guard = (where, fn, ...args) => {
    try { return fn(...args); } catch (err) { warn(where, err); return undefined; }
  };

  // ---- defs ---------------------------------------------------------------------------------
  function hexOf(c, fallback = "#a3a2a5") {
    if (typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
    if (c && c.isColor) return "#" + c.getHexString();
    return fallback;
  }
  function materialOf(m, neon) {
    if (neon) return "neon";
    if (m == null) return "plastic";
    const s = String(m).toLowerCase().replace(/^enum\.material\./, "");
    if (ENGINE_MATERIALS.has(s)) return s;
    return LEGACY_MATERIALS[s] || "plastic";
  }
  function arr3(v, d) {
    if (!v) return d.slice();
    if (v.isVector3) return [v.x, v.y, v.z];
    return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0];
  }
  function worldMatrix(def) {
    if (def.cf && def.cf.isMatrix4) return def.cf.clone();
    const a = arr3(def.at, [0, 0, 0]);
    const r = arr3(def.rot, [0, 0, 0]);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r[0] * Math.PI / 180, r[1] * Math.PI / 180, r[2] * Math.PI / 180, "XYZ"));
    m.setPosition(Z.origin[0] + a[0], Z.origin[1] + a[1], Z.origin[2] + a[2]);
    return m;
  }
  function decompose(m) {
    const e = new THREE.Euler().setFromRotationMatrix(m, "XYZ");
    const d = (x) => Math.round((x * 180 / Math.PI) * 1e4) / 1e4;
    return { position: [m.elements[12], m.elements[13], m.elements[14]], rotation: [d(e.x), d(e.y), d(e.z)] };
  }

  function makeRec(def) {
    if (!Z) throw new Error("z.part called with no live zone");
    const shape = ENGINE_SHAPES.has(def.shape) ? def.shape : "box";
    const size = arr3(def.size, [4, 1, 2]).map((s) => Math.min(2048, Math.max(0.05, Math.abs(s))));
    const behaviors = Array.isArray(def.behaviors) ? def.behaviors.map((b) => ({ ...b })) : [];
    const rec = {
      shape, size, m: worldMatrix(def), inv: null,
      color: hexOf(def.color),
      material: materialOf(def.material, def.neon),
      transparency: Math.max(0, Math.min(1, Number(def.transparency) || 0)),
      collide: def.decor ? false : (def.collide !== undefined ? def.collide !== false : def.canCollide !== false),
      decor: !!def.decor,
      light: def.light || null,
      behaviors,
      dynamic: !!def.dynamic || behaviors.length > 0 || !!def.light,
      built: false, id: null, colId: null, batch: null, bi: -1,
      hidden: false, removed: false, labels: [], fx: null,
    };
    rec.base = { color: rec.color, transparency: rec.transparency };
    Z.recs.push(rec);
    if (Z.finalized) buildDynamic(rec);
    return rec;
  }

  function engineDef(rec, invisible) {
    const { position, rotation } = decompose(rec.m);
    const d = {
      shape: rec.shape, size: rec.size.slice(), position, rotation,
      color: rec.color, material: rec.material,
      transparency: invisible ? 1 : (rec.hidden ? 1 : rec.transparency),
      canCollide: rec.collide,
    };
    if (!invisible && rec.light) d.light = { ...rec.light };
    if (!invisible && rec.behaviors.length) d.behaviors = rec.behaviors;
    return d;
  }

  function buildDynamic(rec) {
    rec.dynamic = true;
    rec.built = true;
    rec.id = guard("part", () => parts.create(engineDef(rec, false))) || null;
    if (rec.id) Z.ids.push(rec.id);
  }

  function promote(rec) {
    if (!Z || rec.removed) return;
    if (!Z.finalized) { rec.dynamic = true; return; }
    if (rec.id) return;
    if (rec.batch) {
      rec.batch.mesh.setMatrixAt(rec.bi, new THREE.Matrix4().makeScale(0, 0, 0));
      rec.batch.mesh.instanceMatrix.needsUpdate = true;
      rec.batch.mesh.boundingSphere = null;
      rec.batch = null;
    }
    if (rec.colId) { guard("collider", () => parts.remove(rec.colId)); rec.colId = null; }
    buildDynamic(rec);
  }

  // A probe part lends us the engine's own cached unit geometry and material for a key, so an
  // instanced batch looks exactly like a place.json part. The probe is removed at once; the
  // geometry and material are the engine's shared caches and are NEVER disposed here.
  function probe(shape, material, color, transparency) {
    const id = parts.create({ shape, size: [1, 1, 1], position: [0, -9000, 0], material, color, transparency, canCollide: false });
    const got = parts.get(id);
    const out = got && got.mesh ? { geometry: got.mesh.geometry, material: got.mesh.material } : null;
    parts.remove(id);
    return out;
  }

  function finalize() {
    const groups = new Map();
    for (const rec of Z.recs) {
      if (rec.built || rec.removed) continue;
      if (rec.dynamic) { buildDynamic(rec); continue; }
      rec.built = true;
      if (rec.transparency < 1 && !rec.hidden) {
        const t = Math.round(rec.transparency * 20) / 20;
        const key = `${rec.shape}|${rec.material}|${rec.color}|${t}`;
        let g = groups.get(key);
        if (!g) { g = { shape: rec.shape, material: rec.material, color: rec.color, t, recs: [] }; groups.set(key, g); }
        g.recs.push(rec);
      }
      if (rec.collide) {
        rec.colId = guard("collider", () => parts.create(engineDef(rec, true))) || null;
        if (rec.colId) Z.ids.push(rec.colId);
      }
    }
    const scaleM = new THREE.Matrix4();
    for (const g of groups.values()) {
      const pr = probe(g.shape, g.material, g.color, g.t);
      if (!pr) continue;
      const mesh = new THREE.InstancedMesh(pr.geometry, pr.material, g.recs.length);
      g.recs.forEach((rec, i) => {
        scaleM.makeScale(rec.size[0], rec.size[1], rec.size[2]);
        mesh.setMatrixAt(i, rec.m.clone().multiply(scaleM));
        rec.batch = { mesh };
        rec.bi = i;
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      const id = parts.addCustom(mesh);
      Z.batches.push({ mesh, id });
    }
    Z.finalized = true;
  }

  // ---- part handles -------------------------------------------------------------------------
  function setRecMatrix(rec, m) {
    rec.m.copy(m);
    rec.inv = null;
    for (const l of rec.labels) l.sync();
    if (!rec.built) return;
    promote(rec);
    if (rec.id) {
      const { position, rotation } = decompose(rec.m);
      guard("move", () => { parts.setPosition(rec.id, position); parts.setRotation(rec.id, rotation); });
    }
  }
  function applyLook(rec) {
    if (!rec.built || rec.removed) return;
    promote(rec);
    if (!rec.id) return;
    guard("look", () => {
      parts.setColor(rec.id, rec.color);
      parts.setTransparency(rec.id, rec.hidden ? 1 : rec.transparency);
    });
  }

  function handleOf(rec) {
    if (rec.handle) return rec.handle;
    const h = {
      get id() { return rec.id; },
      get cf() { return rec.m; },
      get size() { return rec.size.slice(); },
      rec,
      pos: () => [rec.m.elements[12], rec.m.elements[13], rec.m.elements[14]],
      local: () => [rec.m.elements[12] - Z.origin[0], rec.m.elements[13] - Z.origin[1], rec.m.elements[14] - Z.origin[2]],
      setColor(hex) { rec.color = hexOf(hex, rec.color); rec.base.color = rec.color; applyLook(rec); return h; },
      setTransparency(t) { rec.transparency = Math.max(0, Math.min(1, Number(t) || 0)); rec.base.transparency = rec.transparency; applyLook(rec); return h; },
      setCollide(b) {
        rec.collide = !!b;
        if (!rec.built) return h;
        promote(rec);
        if (rec.id) guard("collide", () => parts.setCanCollide(rec.id, !!b));
        return h;
      },
      show(b) {
        rec.hidden = !b;
        for (const l of rec.labels) l.setVisible(!!b);
        applyLook(rec);
        return h;
      },
      moveTo(at) {
        const m = at && at.isMatrix4 ? at : (() => {
          const a = arr3(at, [0, 0, 0]);
          const mm = rec.m.clone();
          mm.setPosition(Z.origin[0] + a[0], Z.origin[1] + a[1], Z.origin[2] + a[2]);
          return mm;
        })();
        setRecMatrix(rec, m);
        return h;
      },
      remove() {
        if (rec.removed) return;
        rec.removed = true;
        if (rec.batch) {
          rec.batch.mesh.setMatrixAt(rec.bi, new THREE.Matrix4().makeScale(0, 0, 0));
          rec.batch.mesh.instanceMatrix.needsUpdate = true;
          rec.batch = null;
        }
        if (rec.id) guard("remove", () => parts.remove(rec.id));
        if (rec.colId) guard("remove", () => parts.remove(rec.colId));
        rec.id = rec.colId = null;
        for (const l of rec.labels) l.setVisible(false);
        if (Z) {
          Z.touches = Z.touches.filter((t) => t.rec !== rec);
          Z.clicks = Z.clicks.filter((t) => t.rec !== rec);
          Z.prompts = Z.prompts.filter((t) => t.rec !== rec);
          Z.tags = Z.tags.filter((t) => t.rec !== rec);
        }
      },
    };
    rec.handle = h;
    return h;
  }
  const recOf = (h) => (h && h.rec ? h.rec : null);

  // ---- overlap / geometry ---------------------------------------------------------------------
  function invOf(rec) {
    if (!rec.inv) rec.inv = rec.m.clone().invert();
    return rec.inv;
  }
  // capsule (feet .. feet+5, radius 1) vs the part's oriented box, with a skin
  function touchesAvatar(rec, feet, skin = TOUCH_SKIN) {
    const cx = rec.m.elements[12], cy = rec.m.elements[13], cz = rec.m.elements[14];
    const reach = Math.hypot(rec.size[0], rec.size[1], rec.size[2]) / 2 + 4;
    if (Math.abs(cx - feet[0]) > reach || Math.abs(cz - feet[2]) > reach || Math.abs(cy - feet[1] - 2.5) > reach + 2.5) return false;
    const inv = invOf(rec);
    const hx = rec.size[0] / 2, hy = rec.size[1] / 2, hz = rec.size[2] / 2;
    const r = CAPSULE_R + skin;
    for (const dy of [1, 2.5, 4]) {
      tmpV.set(feet[0], feet[1] + dy, feet[2]).applyMatrix4(inv);
      const qx = Math.max(-hx, Math.min(hx, tmpV.x)) - tmpV.x;
      const qy = Math.max(-hy, Math.min(hy, tmpV.y)) - tmpV.y;
      const qz = Math.max(-hz, Math.min(hz, tmpV.z)) - tmpV.z;
      if (qx * qx + qy * qy + qz * qz <= r * r) return true;
    }
    return false;
  }
  function distToRec(rec, p) {
    tmpV.set(p[0], p[1], p[2]).applyMatrix4(invOf(rec));
    const qx = Math.max(-rec.size[0] / 2, Math.min(rec.size[0] / 2, tmpV.x)) - tmpV.x;
    const qy = Math.max(-rec.size[1] / 2, Math.min(rec.size[1] / 2, tmpV.y)) - tmpV.y;
    const qz = Math.max(-rec.size[2] / 2, Math.min(rec.size[2] / 2, tmpV.z)) - tmpV.z;
    return Math.hypot(qx, qy, qz);
  }
  function screenCircle(center, radius) {
    const cam = ctx.engine.camera;
    const c = cam.worldToScreen(center);
    if (!c) return null;
    let r = TAP_MIN_PX;
    for (const off of [[radius, 0, 0], [0, radius, 0], [0, 0, radius]]) {
      const q = cam.worldToScreen([center[0] + off[0], center[1] + off[1], center[2] + off[2]]);
      if (q) r = Math.max(r, Math.hypot(q[0] - c[0], q[1] - c[1]));
    }
    return { x: c[0], y: c[1], r };
  }

  // ---- text -------------------------------------------------------------------------------------
  const FACES = {
    front: { n: [0, 0, -1], wi: 0, hi: 1, rot: [0, Math.PI, 0] },
    back: { n: [0, 0, 1], wi: 0, hi: 1, rot: [0, 0, 0] },
    right: { n: [1, 0, 0], wi: 2, hi: 1, rot: [0, Math.PI / 2, 0] },
    left: { n: [-1, 0, 0], wi: 2, hi: 1, rot: [0, -Math.PI / 2, 0] },
    top: { n: [0, 1, 0], wi: 0, hi: 2, rot: [-Math.PI / 2, 0, 0] },
    bottom: { n: [0, -1, 0], wi: 0, hi: 2, rot: [Math.PI / 2, 0, 0] },
  };
  function canvasTex(wStud, hStud, pps) {
    const scale = Math.min(pps, 512 / Math.max(wStud, hStud, 0.1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(32, Math.round(wStud * scale));
    canvas.height = Math.max(16, Math.round(hStud * scale));
    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return { canvas, tex };
  }

  function label(part, text, opts = {}) {
    const rec = recOf(part);
    if (!rec || !Z) return { setText() {}, setColor() {} };
    const faceNames = [String(opts.face || "front").toLowerCase()];
    if (opts.both) faceNames.push(faceNames[0] === "back" ? "front" : "back");
    const holder = new THREE.Group();
    holder.matrixAutoUpdate = false;
    const state = { text: String(text == null ? "" : text), color: hexOf(opts.color, "#ffffff"), bg: opts.bg ? hexOf(opts.bg) : null };
    const planes = [];
    for (const fname of faceNames) {
      const f = FACES[fname] || FACES.front;
      const w = rec.size[f.wi], h = rec.size[f.hi];
      const { canvas, tex } = canvasTex(w, h, opts.pps || 24);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      const geo = new THREE.PlaneGeometry(w, h);
      const mesh = new THREE.Mesh(geo, mat);
      const off = 0.03;
      mesh.position.set(f.n[0] * (rec.size[0] / 2 + off), f.n[1] * (rec.size[1] / 2 + off), f.n[2] * (rec.size[2] / 2 + off));
      mesh.rotation.set(f.rot[0], f.rot[1], f.rot[2]);
      holder.add(mesh);
      planes.push({ canvas, tex, mat, geo });
      Z.disposables.push(tex, mat, geo);
    }
    const draw = () => {
      for (const p of planes) {
        K.drawFitText(p.canvas, state.text, state.color, state.bg, { stroke: opts.stroke ? "#000000" : null, align: opts.align });
        p.tex.needsUpdate = true;
      }
    };
    draw();
    const L = {
      sync() { holder.matrix.copy(rec.m); holder.matrixWorldNeedsUpdate = true; },
      setVisible(b) { holder.visible = !!b; },
    };
    L.sync();
    rec.labels.push(L);
    Z.customs.push(parts.addCustom(holder));
    return {
      setText(t) { const s = String(t == null ? "" : t); if (s !== state.text) { state.text = s; draw(); } },
      setColor(hex) { state.color = hexOf(hex, state.color); draw(); },
    };
  }

  function billboard(target, text, opts = {}) {
    if (!Z) return { setText() {} };
    const rec = recOf(target);
    const w = opts.width || 8, h = opts.height || 2;
    const { canvas, tex } = canvasTex(w, h, 32);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: !opts.top });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(w, h, 1);
    if (opts.top) sprite.renderOrder = 10;
    Z.disposables.push(tex, mat);
    const state = { text: String(text == null ? "" : text) };
    const draw = () => {
      K.drawFitText(canvas, state.text, hexOf(opts.color, "#ffffff"), opts.bg ? hexOf(opts.bg) : null, { stroke: "#000000" });
      tex.needsUpdate = true;
    };
    draw();
    const place = () => {
      let p;
      if (rec) {
        const off = opts.offset ? arr3(opts.offset, [0, 0, 0]) : [0, rec.size[1] / 2 + 1.5, 0];
        p = [rec.m.elements[12] + off[0], rec.m.elements[13] + off[1], rec.m.elements[14] + off[2]];
      } else {
        const a = arr3(target, [0, 0, 0]);
        const off = arr3(opts.offset, [0, 0, 0]);
        p = [Z.origin[0] + a[0] + off[0], Z.origin[1] + a[1] + off[1], Z.origin[2] + a[2] + off[2]];
      }
      sprite.position.set(p[0], p[1], p[2]);
    };
    place();
    if (rec) rec.labels.push({ sync: place, setVisible: (b) => { sprite.visible = !!b; } });
    Z.customs.push(parts.addCustom(sprite));
    Z.billboards.push({ sprite, dist: opts.distance || 120 });
    return { setText(t) { const s = String(t == null ? "" : t); if (s !== state.text) { state.text = s; draw(); } } };
  }

  // ---- cats -------------------------------------------------------------------------------------
  function placeCat(n, at, opts = {}) {
    if (!Z) throw new Error("z.cat called with no live zone");
    const info = Z.info;
    if (!Number.isInteger(n) || n < info.first || n > info.last) {
      throw new Error(`z.cat: ${n} is not a cat of zone ${Z.k} (${info.first}..${info.last})`);
    }
    if (Z.cats.has(n)) throw new Error(`z.cat: cat ${n} placed twice`);
    let group = null;
    try { group = deps.getLook(n); } catch (err) { warn(`look ${n}`, err); }
    if (!group) group = K.fallback(n);
    const scale = opts.scale || 1;
    group.scale.setScalar(scale);
    const size = group.userData.size.clone().multiplyScalar(scale);
    const m = at && at.isMatrix4 ? at.clone() : (() => {
      const a = arr3(at, [0, 0, 0]);
      return new THREE.Matrix4().makeTranslation(Z.origin[0] + a[0], Z.origin[1] + a[1], Z.origin[2] + a[2]);
    })();
    const center = new THREE.Vector3().setFromMatrixPosition(m);
    if (!opts.center) center.y += size.y / 2 + 0.6;
    const baseQ = new THREE.Quaternion().setFromRotationMatrix(m);
    group.position.copy(center);
    group.quaternion.copy(baseQ);
    const t = R.tierOf(n);
    const tier = R.TIERS[t];
    const cat = {
      n, t, tier, group, center, size, baseQ, spinA: 0,
      spin: opts.spin !== false && deps.lookSpins(n) !== false,
      locked: !!opts.locked, hidden: !!opts.hidden, cage: [], glow: null, check: null,
      phase: (n * 1.7) % (Math.PI * 2), fxT: 0, hue: (n * 0.13) % 1,
    };
    cat.customId = parts.addCustom(group);
    Z.customs.push(cat.customId);
    Z.catGroups.push(group);
    const d = Math.max(size.x, size.z) + 1.2;
    cat.glow = guard("glow", () => parts.create({
      shape: "cylinder", size: [d, 0.15, d], position: [center.x, center.y - size.y / 2 - 0.45, center.z],
      material: "neon", color: tier.color, transparency: 0.35, canCollide: false,
      light: { color: tier.color === "#000000" || tier.color === "#121216" ? "#8080ff" : tier.color, intensity: 1.4, range: 10 + Math.min(t, 12) },
    })) || null;
    if (cat.glow) Z.ids.push(cat.glow);
    if (cat.locked && !session.unlocked.has(n)) buildCage(cat);
    Z.cats.set(n, cat);
    refreshCat(cat);
    return {
      n,
      pos: () => [center.x, center.y, center.z],
      local: () => [center.x - Z.origin[0], center.y - Z.origin[1], center.z - Z.origin[2]],
      size: [size.x, size.y, size.z],
    };
  }

  function buildCage(cat) {
    const s = cat.size, c = cat.center;
    const col = cat.tier.color === "#ffffff" || cat.tier.color === "#fafafa" ? "#cfe8ff" : cat.tier.color;
    // The cage is axis-aligned but the cat is not: a yawed cat pokes out of a box sized from
    // its unrotated look, and a spinning one sweeps a circle. So size the footprint from the
    // rotated extents, or from the full diagonal when the cat spins.
    let fx = s.x, fz = s.z, fy = s.y;
    if (cat.spin) {
      fx = fz = Math.hypot(s.x, s.z);
    } else {
      const e = cat.baseQ ? new THREE.Matrix4().makeRotationFromQuaternion(cat.baseQ).elements : null;
      if (e) {
        fx = Math.abs(e[0]) * s.x + Math.abs(e[4]) * s.y + Math.abs(e[8]) * s.z;
        fy = Math.abs(e[1]) * s.x + Math.abs(e[5]) * s.y + Math.abs(e[9]) * s.z;
        fz = Math.abs(e[2]) * s.x + Math.abs(e[6]) * s.y + Math.abs(e[10]) * s.z;
      }
    }
    const box = [fx + 1.6, Math.max(s.y, fy) + 1.4, fz + 1.6];
    const mk = (def) => {
      const id = guard("cage", () => parts.create(def));
      if (id) { cat.cage.push(id); Z.ids.push(id); }
    };
    mk({ shape: "box", size: box, position: [c.x, c.y, c.z], material: "glass", color: "#bfe6ff", transparency: 0.55, canCollide: true });
    mk({ shape: "box", size: [box[0] + 0.4, 0.4, box[2] + 0.4], position: [c.x, c.y + box[1] / 2, c.z], material: "neon", color: col, canCollide: false });
    mk({ shape: "box", size: [box[0] + 0.4, 0.4, box[2] + 0.4], position: [c.x, c.y - box[1] / 2, c.z], material: "neon", color: col, canCollide: false });
  }
  function removeCage(cat) {
    for (const id of cat.cage) guard("cage", () => parts.remove(id));
    cat.cage = [];
  }

  function catVisible(cat) {
    return !cat.hidden || session.revealed.has(cat.n);
  }
  function catCollectable(cat) {
    return catVisible(cat) && (!cat.locked || session.unlocked.has(cat.n)) && !deps.has(cat.n);
  }
  function refreshCat(cat) {
    const vis = catVisible(cat);
    cat.group.visible = vis;
    if (cat.glow) guard("glow", () => parts.setTransparency(cat.glow, vis ? 0.35 : 1));
    const found = deps.has(cat.n);
    K.setGhost(cat.group, found);
    if (found && !cat.check && vis && Z) {
      cat.check = billboard([cat.center.x - Z.origin[0], cat.center.y - Z.origin[1], cat.center.z - Z.origin[2]], "✓ FOUND", {
        offset: [0, cat.size.y / 2 + 1.4, 0], width: 5, height: 1.25, color: "#7dff8a", distance: 80,
      });
    }
  }

  function collect(cat, how) {
    if (!catCollectable(cat)) return false;
    const ok = !!deps.award(cat.n, how);
    if (ok) refreshCat(cat);
    return ok;
  }

  // ---- zone lifecycle -----------------------------------------------------------------------------
  function newZone(k) {
    const info = R.ZONES[k];
    return {
      k, info, origin: R.zoneOrigin(k), recs: [], ids: [], customs: [], batches: [], disposables: [],
      catGroups: [], cats: new Map(), touches: [], clicks: [], prompts: [], kills: [], tags: [],
      heartbeats: [], leave: [], flags: new Map(), billboards: [], foundFns: [],
      finalized: false, rng: mulberry32(1000 + k), killGrace: 0, prompt: null, promptHold: null,
      fxT: 0, report: { ok: false, err: null, missing: [], placed: 0, parts: 0 },
    };
  }

  function makeZ(zone) {
    const z = {
      k: zone.k, info: zone.info, origin: zone.origin.slice(), K, THREE, R, ctx,
      rng: () => zone.rng(),
      random: (a = 0, b = 1) => a + (b - a) * zone.rng(),
      randint: (a, b) => a + Math.floor(zone.rng() * (b - a + 1)),
      cf: (x, y, zz, ry) => {
        const m = new THREE.Matrix4();
        if (ry) m.makeRotationY(ry * Math.PI / 180);
        m.setPosition(zone.origin[0] + x, zone.origin[1] + y, zone.origin[2] + zz);
        return m;
      },
      pos: (x, y, zz) => [zone.origin[0] + x, zone.origin[1] + y, zone.origin[2] + zz],
      toLocal: (p) => { const a = arr3(p, [0, 0, 0]); return [a[0] - zone.origin[0], a[1] - zone.origin[1], a[2] - zone.origin[2]]; },
      part: (def = {}) => handleOf(makeRec(def)),
      rpart: (props = {}) => handleOf(makeRec(fromLegacy(props))),
      rcyl: (len, diameter, cf, props = {}) => handleOf(makeRec(fromLegacy({ ...props, Shape: "Cylinder", Size: [len, diameter, diameter], CFrame: cf }))),
      rwedge: (size, cf, props = {}) => handleOf(makeRec(fromLegacy({ ...props, Class: "WedgePart", Size: size, CFrame: cf }))),
      ball: (d, cf, props = {}) => handleOf(makeRec(fromLegacy({ ...props, Shape: "Ball", Size: [d, d, d], CFrame: cf }))),
      label, billboard,
      touch: (part, fn, opts = {}) => {
        const rec = recOf(part);
        if (rec) zone.touches.push({ rec, fn, cooldown: opts.cooldown != null ? opts.cooldown : 0.4, inside: false, last: -1e9 });
      },
      click: (part, fn, opts = {}) => {
        const rec = recOf(part);
        if (rec) zone.clicks.push({ rec, fn, distance: opts.distance || 24, cooldown: opts.cooldown != null ? opts.cooldown : 0.15, last: -1e9 });
      },
      prompt: (part, text, fn, opts = {}) => {
        const rec = recOf(part);
        const p = { rec, text: String(text), fn, distance: opts.distance || 10, hold: opts.hold || 0, enabled: true, last: -1e9 };
        if (rec) zone.prompts.push(p);
        return { setText: (t) => { p.text = String(t); }, enable: (b) => { p.enabled = !!b; } };
      },
      input: (opts, fn) => {
        Promise.resolve(deps.ui.input(opts || {})).then((text) => {
          if (text == null || Z !== zone) return;
          let s = String(text).trim().toUpperCase().slice(0, (opts && opts.max) || 64);
          if (opts && opts.kind === "digits") s = s.replace(/[^0-9]/g, "");
          guard("input", fn, s);
        }, (err) => warn("input", err));
      },
      kill: (part) => { const rec = recOf(part); if (rec) zone.kills.push(rec); },
      respawn: () => teleportLocal(R.ZONE_SPAWN, 90),
      notify: (text) => guard("toast", () => ctx.services.ui.toast(String(text), { duration: 3000 })),
      fail: (text) => {
        guard("toast", () => ctx.services.ui.toast(String(text), { duration: 3000, icon: "❌", variant: "error" }));
        sfx("denied", {});
      },
      sound: (name, opts = {}) => sfx(SOUND_MAP[name] || name, opts),
      tone: (pitch, opts = {}) => sfx("chime", { pitch: Math.max(0.25, Math.min(4, pitch || 1)), volume: opts.volume != null ? opts.volume : 0.6 }),
      lockout: (seconds, key = "_") => {
        const lk = zone.k + ":" + key;
        const until = session.locks.get(lk) || 0;
        if (until > ctx.time) return false;
        session.locks.set(lk, ctx.time + (seconds || 10));
        return true;
      },
      isLocked: (key = "_") => {
        const until = session.locks.get(zone.k + ":" + key) || 0;
        return until > ctx.time ? Math.ceil(until - ctx.time - 1e-3) : 0;
      },
      flag: (key, ...v) => {
        if (v.length) zone.flags.set(key, v[0]);
        return zone.flags.get(key);
      },
      onLeave: (fn) => { zone.leave.push(fn); },
      heartbeat: (fn) => { zone.heartbeats.push({ fn, errors: 0 }); },
      time: () => ctx.time,
      player: {
        pos: () => { const p = ctx.player.position(); return [p[0] - zone.origin[0], p[1] - zone.origin[1], p[2] - zone.origin[2]]; },
        teleport: (localXYZ, yaw) => teleportLocal(localXYZ, yaw),
      },
      tag: (target, kind, attrs = {}) => {
        const list = Array.isArray(target) ? target : [target];
        const a = {};
        for (const [k2, v] of Object.entries(attrs)) a[k2.charAt(0).toLowerCase() + k2.slice(1)] = v;
        let pivot = null;
        if (Array.isArray(target) && target.length && recOf(target[0])) {
          pivot = a.pivot ? new THREE.Vector3(...z.pos(...arr3(a.pivot, [0, 0, 0]))) : new THREE.Vector3().setFromMatrixPosition(recOf(target[0]).m);
        }
        for (const h of list) {
          const rec = recOf(h);
          if (!rec) continue;
          promote(rec);
          zone.tags.push({ rec, kind, a, origin: rec.m.clone(), pivot, t0: ctx.time, fxT: 0, last: null });
        }
        return target;
      },
      cat: (n, at, opts) => placeCat(n, at, opts),
      unlock: (n) => {
        session.unlocked.add(n);
        const cat = zone.cats.get(n);
        if (cat) { removeCage(cat); refreshCat(cat); }
      },
      reveal: (n) => {
        session.revealed.add(n);
        const cat = zone.cats.get(n);
        if (cat) refreshCat(cat);
      },
      give: (n) => {
        const ok = !!deps.award(n, "give");
        const cat = zone.cats.get(n);
        if (cat) refreshCat(cat);
        return ok;
      },
      has: (n) => deps.has(n),
      isUnlocked: (n) => session.unlocked.has(n),
      isRevealed: (n) => session.revealed.has(n),
      foundCount: () => deps.foundCount(),
      onFound: (fn) => { zone.foundFns.push(fn); },
    };
    return z;
  }

  function fromLegacy(p) {
    const size = arr3(p.Size || p.size, [4, 1, 2]);
    let cf = p.CFrame && p.CFrame.isMatrix4 ? p.CFrame.clone() : null;
    const def = {
      color: p.Color || p.color, material: p.Material || p.material, neon: !!(p.Neon || p.neon),
      transparency: p.Transparency != null ? p.Transparency : p.transparency,
      collide: p.Decor ? false : (p.CanCollide !== undefined ? p.CanCollide !== false : p.collide !== false),
      decor: !!(p.Decor || p.decor), dynamic: !!(p.dynamic || p.Dynamic), light: p.light || null, behaviors: p.behaviors,
    };
    if (!cf) {
      const pos = arr3(p.Position || p.at, [0, 0, 0]);
      cf = new THREE.Matrix4().makeTranslation(Z.origin[0] + pos[0], Z.origin[1] + pos[1], Z.origin[2] + pos[2]);
    }
    const cls = p.Class || "Part";
    const shp = String(p.Shape || "Block").replace(/^Enum\.PartType\./, "");
    if (cls === "WedgePart") {
      def.shape = "wedge";
      def.size = size;
      def.cf = cf.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
    } else if (cls === "CornerWedgePart") {
      def.shape = "pyramid";
      def.size = size;
      def.cf = cf;
    } else if (shp === "Ball") {
      const d = Math.min(size[0], size[1], size[2]);
      def.shape = "sphere";
      def.size = [d, d, d];
      def.cf = cf;
    } else if (shp === "Cylinder") {
      const d = Math.min(size[1], size[2]);
      def.shape = "cylinder";
      def.size = [d, size[0], d];
      def.cf = cf.multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
    } else {
      def.shape = "box";
      def.size = size;
      def.cf = cf;
      if (cls === "TrussPart" && !p.Color && !p.color) def.color = "#8a8f99";
    }
    return def;
  }

  function sfx(name, opts) {
    guard("sfx", () => ctx.engine.audio.playSfx(name, opts || {}));
  }

  function teleportLocal(localXYZ, yaw) {
    if (!Z) return;
    const a = arr3(localXYZ, [0, 0, 0]);
    ctx.player.teleport([Z.origin[0] + a[0], Z.origin[1] + a[1], Z.origin[2] + a[2]], yaw);
  }

  // The kit's own pieces of every zone: the spawn pad and the way home.
  function buildBase(z) {
    const info = z.info;
    const sp = R.ZONE_SPAWN;
    z.part({ shape: "box", size: [12, 1, 12], at: [sp[0], -0.3, sp[2]], color: "#f0f0f0" });
    z.part({ shape: "cylinder", size: [13, 0.2, 13], at: [sp[0], 0.25, sp[2]], color: info.color === "#191923" ? "#5a5aff" : info.color, material: "neon", decor: true });
    const rp = R.ZONE_RETURN;
    const frame = "#3c3246";
    // the portal faces +X (towards the zone)
    z.part({ size: [1.5, 11, 1.5], at: [rp[0], 5.5, rp[2] - 4.5], color: frame });
    z.part({ size: [1.5, 11, 1.5], at: [rp[0], 5.5, rp[2] + 4.5], color: frame });
    const top = z.part({ size: [1.5, 1.5, 10.5], at: [rp[0], 11.75, rp[2]], color: frame });
    const door = z.part({ size: [0.6, 10, 7.5], at: [rp[0], 5, rp[2]], color: "#78c8ff", material: "neon", transparency: 0.25, collide: false });
    z.label(top, "BACK TO HUB", { face: "right", color: "#ffffff" });
    z.touch(door, () => { if (deps.onLeaveZone) deps.onLeaveZone(z.k); }, { cooldown: 1.5 });
    const sign = z.part({ size: [0.6, 3, 14], at: [sp[0] + 8, 10, sp[2]], color: info.color === "#191923" ? "#2a2a3a" : info.color, decor: true });
    z.label(sign, info.name, { face: "left", color: "#ffffff", stroke: true });
    z.label(sign, info.name, { face: "right", color: "#ffffff", stroke: true });
  }

  // enter(k, mod) builds the base + the zone module synchronously, then returns the report.
  function enter(k, mod) {
    if (Z) leave();
    Z = newZone(k);
    let zone = Z;
    let z = makeZ(zone);
    zone.z = z;
    buildBase(z);
    let err = null;
    if (mod && typeof mod.build === "function") {
      try {
        mod.build(z);
      } catch (e) {
        err = String(e && e.message ? e.message : e);
        console.warn(`[cats] zone ${k} failed to build and was skipped:`, e);
      }
    } else {
      err = "zone module missing";
    }
    if (err) {
      // Drop everything the zone made; a fresh zone with only the kit's base (spawn pad and the
      // way home) takes its place, so a broken zone can never strand you.
      leave();
      Z = newZone(k);
      zone = Z;
      z = makeZ(zone);
      zone.z = z;
      buildBase(z);
      zone.report.err = err;
    } else {
      zone.report.ok = true;
    }
    finalize();
    const missing = [];
    for (let n = zone.info.first; n <= zone.info.last; n++) if (!zone.cats.has(n)) missing.push(n);
    zone.report.missing = missing;
    zone.report.placed = zone.cats.size;
    zone.report.parts = zone.recs.length;
    if (missing.length && zone.report.ok) console.warn(`[cats] zone ${k} did not place cats: ${missing.join(", ")}`);
    return zone.report;
  }

  function leave() {
    if (!Z) return;
    const zone = Z;
    for (const fn of zone.leave) guard("onLeave", fn);
    for (const id of zone.ids) guard("remove", () => parts.remove(id));
    for (const id of zone.customs) guard("remove", () => parts.remove(id));
    for (const b of zone.batches) {
      guard("remove", () => parts.remove(b.id));
      try { b.mesh.dispose(); } catch { /* already gone */ }
    }
    for (const g of zone.catGroups) K.disposeGroup(g);
    for (const d of zone.disposables) { try { d.dispose(); } catch { /* fine */ } }
    if (zone.prompt) deps.ui.prompt(null);
    Z = null;
  }

  // ---- per tick -----------------------------------------------------------------------------------
  function update(dt) {
    if (!Z) return;
    const zone = Z;
    const feet = ctx.player.position();
    const t = ctx.time;
    zone.killGrace = Math.max(0, zone.killGrace - dt);

    for (const tc of zone.touches) {
      if (tc.rec.removed || tc.rec.hidden) { tc.inside = false; continue; }
      const now = touchesAvatar(tc.rec, feet);
      if (now && !tc.inside && t - tc.last >= tc.cooldown) {
        tc.last = t;
        guard("touch", tc.fn);
        if (Z !== zone) return;
      }
      tc.inside = now;
    }
    if (zone.killGrace <= 0) {
      for (const rec of zone.kills) {
        if (rec.removed || rec.hidden) continue;
        if (touchesAvatar(rec, feet, 0.1)) {
          zone.killGrace = KILL_GRACE_S;
          guard("kill", () => ctx.player.kill("cats:kill"));
          break;
        }
      }
    }

    // nearest live prompt
    let best = null, bestD = Infinity;
    const center = [feet[0], feet[1] + 2.5, feet[2]];
    for (const p of zone.prompts) {
      if (!p.enabled || p.rec.removed || p.rec.hidden) continue;
      const d = distToRec(p.rec, center);
      if (d <= p.distance && d < bestD) { best = p; bestD = d; }
    }
    if (zone.promptHold && zone.promptHold.p !== best) zone.promptHold = null;
    if (zone.promptHold) {
      zone.promptHold.t += dt;
      if (zone.promptHold.t >= best.hold) {
        zone.promptHold = null;
        best.last = t;
        guard("prompt", best.fn);
        if (Z !== zone) return;
      }
    }
    const view = best ? { text: best.text, progress: zone.promptHold ? zone.promptHold.t / Math.max(0.01, best.hold) : 0 } : null;
    const key = view ? view.text + "|" + Math.round(view.progress * 20) : "";
    if (key !== (zone.prompt || "")) {
      zone.prompt = key || null;
      deps.ui.prompt(view);
    }
    zone.activePrompt = best;

    for (const hb of zone.heartbeats) {
      if (hb.errors >= 5) continue;
      try { hb.fn(dt, t); } catch (err) {
        hb.errors++;
        warn("heartbeat", err);
        if (hb.errors >= 5) console.warn(`[cats] zone ${zone.k} heartbeat disabled after 5 errors`);
      }
      if (Z !== zone) return;
    }

    for (const tg of zone.tags) tickTag(tg, dt, t);

    for (const cat of zone.cats.values()) {
      const vis = catVisible(cat);
      const found = deps.has(cat.n);
      if (vis) {
        cat.group.position.set(cat.center.x, cat.center.y + Math.sin(t * 2 + cat.phase) * 0.35, cat.center.z);
        if (cat.spin && !found) {
          cat.spinA += dt * 0.9;
          cat.group.quaternion.setFromAxisAngle(tmpV2.set(0, 1, 0), cat.spinA).multiply(cat.baseQ);
        }
      }
      tickCatGlow(cat, dt, vis);
      if (catCollectable(cat)) {
        const hx = cat.size.x / 2 + 0.5 + CAPSULE_R, hy = cat.size.y / 2 + 0.5 + 2.5, hz = cat.size.z / 2 + 0.5 + CAPSULE_R;
        if (Math.abs(feet[0] - cat.center.x) <= hx && Math.abs(feet[1] + 2.5 - cat.center.y) <= hy && Math.abs(feet[2] - cat.center.z) <= hz) {
          collect(cat, "touch");
          if (Z !== zone) return;
        }
      }
    }

    // billboards fade out past their max distance
    for (const b of zone.billboards) {
      const p = b.sprite.position;
      const far = Math.hypot(p.x - feet[0], p.y - feet[1], p.z - feet[2]) > b.dist;
      if (b.sprite.userData.far !== far) { b.sprite.userData.far = far; b.sprite.material.opacity = far ? 0 : 1; }
    }
  }

  function tickCatGlow(cat, dt, vis) {
    if (!cat.glow || !vis) return;
    const eff = cat.tier.effect;
    if (!eff) return;
    cat.fxT += dt;
    if (cat.fxT < COLOR_FX_S) return;
    cat.fxT = 0;
    const t = ctx.time;
    if (eff === "rainbow") {
      const h = Math.floor(((t / 2) % 1) * RAINBOW_STEPS) / RAINBOW_STEPS;
      guard("glow", () => parts.setColor(cat.glow, hsvHex(h, 1, 1)));
    } else if (eff === "flicker" || eff === "glitch") {
      const period = eff === "glitch" ? 0.25 : 0.8;
      const on = (t % period) < period * 0.5;
      guard("glow", () => parts.setTransparency(cat.glow, on ? 0.35 : 0.9));
    } else if (eff === "glow") {
      const a = Math.round((0.2 + 0.3 * (0.5 + 0.5 * Math.sin(t * 3))) * 20) / 20;
      guard("glow", () => parts.setTransparency(cat.glow, a));
    } else if (eff === "void") {
      const a = Math.round((0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.3))) * 20) / 20;
      guard("glow", () => parts.setTransparency(cat.glow, a));
    }
  }

  function tickTag(tg, dt, t) {
    const rec = tg.rec;
    if (rec.removed) return;
    const a = tg.a;
    const el = t - tg.t0;
    if (tg.kind === "Spin") {
      const speed = (a.speed != null ? a.speed : 90) * Math.PI / 180;
      const axis = String(a.axis || "y").toLowerCase();
      const r = new THREE.Matrix4();
      if (axis === "x") r.makeRotationX(speed * el);
      else if (axis === "z") r.makeRotationZ(speed * el);
      else r.makeRotationY(speed * el);
      let m;
      if (tg.pivot) {
        const p = tg.pivot;
        m = new THREE.Matrix4().makeTranslation(p.x, p.y, p.z).multiply(r).multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z)).multiply(tg.origin);
      } else m = tg.origin.clone().multiply(r);
      setRecMatrix(rec, m);
    } else if (tg.kind === "Bob") {
      const amp = a.amp != null ? a.amp : 1, period = a.period || 2;
      const m = tg.origin.clone();
      m.elements[13] += Math.sin((el / period) * Math.PI * 2) * amp;
      setRecMatrix(rec, m);
    } else if (tg.kind === "Move") {
      const off = arr3(a.offset, [0, 0, 8]);
      const period = a.period || 4;
      const f = 0.5 - 0.5 * Math.cos((el / period) * Math.PI * 2);
      const m = tg.origin.clone();
      m.elements[12] += off[0] * f; m.elements[13] += off[1] * f; m.elements[14] += off[2] * f;
      setRecMatrix(rec, m);
    } else if (tg.kind === "Blink") {
      const period = a.period || 1;
      const on = (el % period) < period / 2;
      if (tg.last !== on) {
        tg.last = on;
        rec.hidden = !on;
        for (const l of rec.labels) l.setVisible(on);
        applyLook(rec);
      }
    } else if (tg.kind === "Rainbow") {
      tg.fxT += dt;
      if (tg.fxT < COLOR_FX_S) return;
      tg.fxT = 0;
      const period = a.period || 3;
      const h = Math.floor(((el / period) % 1) * RAINBOW_STEPS) / RAINBOW_STEPS;
      rec.color = hsvHex(h, 0.85, 1);
      applyLook(rec);
    }
  }

  // A tap on the canvas at CSS pixel (x, y). Cats first, then the zone's click handlers.
  function tap(x, y) {
    if (!Z) return false;
    const zone = Z;
    const feet = ctx.player.position();
    const t = ctx.time;
    let best = null, bestScore = Infinity;
    for (const cat of zone.cats.values()) {
      if (!catVisible(cat)) continue;
      const c = [cat.center.x, cat.center.y, cat.center.z];
      if (Math.hypot(c[0] - feet[0], c[1] - feet[1] - 2.5, c[2] - feet[2]) > CAT_CLICK_DIST) continue;
      const sc = screenCircle(c, Math.max(cat.size.x, cat.size.y, cat.size.z) / 2);
      if (!sc) continue;
      const d = Math.hypot(sc.x - x, sc.y - y);
      if (d <= sc.r && d / sc.r < bestScore) { bestScore = d / sc.r; best = { cat }; }
    }
    for (const ck of zone.clicks) {
      if (ck.rec.removed || ck.rec.hidden || ck.rec.decor) continue;
      const c = [ck.rec.m.elements[12], ck.rec.m.elements[13], ck.rec.m.elements[14]];
      if (distToRec(ck.rec, [feet[0], feet[1] + 2.5, feet[2]]) > ck.distance) continue;
      const sc = screenCircle(c, Math.hypot(ck.rec.size[0], ck.rec.size[1], ck.rec.size[2]) / 2 * 0.8);
      if (!sc) continue;
      const d = Math.hypot(sc.x - x, sc.y - y);
      if (d <= sc.r && d / sc.r < bestScore) { bestScore = d / sc.r; best = { ck }; }
    }
    if (!best) return false;
    if (best.cat) return collect(best.cat, "click") || true;
    if (t - best.ck.last < best.ck.cooldown) return true;
    best.ck.last = t;
    guard("click", best.ck.fn);
    return true;
  }

  // E / the prompt button.
  function interact() {
    if (!Z || !Z.activePrompt) return false;
    const p = Z.activePrompt;
    if (p.hold > 0) { if (!Z.promptHold) Z.promptHold = { p, t: 0 }; return true; }
    if (ctx.time - p.last < 0.2) return true;
    p.last = ctx.time;
    guard("prompt", p.fn);
    return true;
  }

  function notifyFound(n) {
    if (!Z) return;
    const cat = Z.cats.get(n);
    if (cat) refreshCat(cat);
    for (const fn of Z.foundFns) guard("onFound", fn, n);
  }

  function stats() {
    if (!Z) return null;
    let statics = 0, dyn = 0, colliders = 0;
    for (const r of Z.recs) {
      if (r.removed) continue;
      if (r.id) dyn++; else statics++;
      if (r.collide) colliders++;
    }
    return {
      k: Z.k, report: { ...Z.report }, statics, dynamic: dyn, colliders, batches: Z.batches.length,
      labels: Z.customs.length, cats: [...Z.cats.keys()], prompt: Z.activePrompt ? Z.activePrompt.text : null,
    };
  }

  return {
    K, enter, leave, update, tap, interact, notifyFound, stats,
    current: () => (Z ? Z.k : 0),
    catInfo: (n) => {
      const c = Z && Z.cats.get(n);
      return c ? { pos: [c.center.x, c.center.y, c.center.z], locked: c.locked && !session.unlocked.has(n), hidden: c.hidden && !session.revealed.has(n), collectable: catCollectable(c) } : null;
    },
    z: () => (Z ? Z.z : null),
    dispose() {
      leave();
      session.unlocked.clear();
      session.revealed.clear();
      session.locks.clear();
    },
  };
}
