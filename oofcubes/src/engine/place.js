// src/engine/place.js — the Place loader: parse place.json -> validate -> build parts
// -> lighting/music -> spawn avatar; the platform events emitter; dispose with leak
// reporting; place-level region/killY per-tick checks. Owned by docs/specs/
// 04-place-format-and-game-api.md §5.1 (createEmitter), §5.3 (loadPlace), §5.4
// (regions/killY), §5.5 (disposePlace).
//
// Dependency-injected by design (loadPlace's `deps` bag below) rather than statically
// importing parts.js/physics.js/renderer.js/audio.js: every live engine module this
// file touches arrives as a parameter, so loadPlace/disposePlace stay callable from a
// pure-Node harness (spec 12 §5.4 createStubEnv pattern) with faked deps, and this file
// never needs to import three.module.js itself. The one concrete import is SIM_DT — the
// fixed sim-step size (spec 02 §5.1 loop.js, cited by name, never re-derived) used to
// advance this module's own internal sim-time counter for §5.2 event payloads.
import { SIM_DT } from "./loop.js";

// ===================================================================================
// ===== SECTION: tuning constants (spec 04 §6 — cited by name, never re-derived) ====
// ===================================================================================
const MAX_PARTS = 1500; // MAX_PARTS
const MAX_JSON_BYTES = 262144; // MAX_JSON_BYTES — informational here; tools/validate.js
                                // is the one that reads the file off disk and enforces
                                // this (V4); loadPlace receives an already-fetched body.
const DEFAULT_KILL_Y = -50; // DEFAULT_KILL_Y
const LOAD_BUDGET_MS = 1000; // LOAD_BUDGET_MS
const MUSIC_FADE_MS = 500; // MUSIC_FADE_MS
const MUSIC_STOP_FADE_MS = 200; // MUSIC_STOP_FADE_MS
const BUILD_YIELD_EVERY_PARTS = 200; // BUILD_YIELD_EVERY_PARTS
const MAX_REGIONS = 32; // MAX_REGIONS
const MAX_BEHAVIORS_PER_PART = 3; // MAX_BEHAVIORS_PER_PART

// Avatar capsule geometry, ARCHITECTURE §5 ("Avatar is 5 units tall, capsule radius
// 1"). place.js needs the avatar's FEET position for regions/killY (§5.4), but
// physics.js's exported `getPosition()` returns the capsule CENTER (spec 03 §4.1 does
// not export a feet getter — `feetOf()` is internal to physics.js) — this mirrors that
// same, unexported center-to-feet offset from the one place-level constant the spec
// already pins (ARCHITECTURE §5), rather than re-deriving or importing physics.js
// internals.
const AVATAR_HEIGHT = 5;
const AVATAR_RADIUS = 1;
const FEET_OFFSET = AVATAR_HEIGHT / 2;

// ===================================================================================
// ===== SECTION: createEmitter() — spec 04 §5.1 =====================================
// ===================================================================================

// Reserved event-name prefixes (platform-emitted only, §5.1). Checked unconditionally
// inside emit() — this is the only mechanism the spec gives emit() to enforce it, since
// ctx.events IS this same emitter instance for both platform and game code (§5.7: "the
// §5.1 emitter"), so there is no other place to hang caller-identity on. §5.1 itself
// anticipates this firing on legitimate platform emits too ("smoke.js treats the warn
// as advisory, not fatal").
const RESERVED_EVENT_PREFIXES = [
  "place:", "player:", "economy:", "badge:", "save:", "avatar:", "region:", "touch:",
  "checkpoint:", "collectible:", "button:", "door:", "bounce:", "teleport:", "platform:",
];

function isReservedEventName(name) {
  return RESERVED_EVENT_PREFIXES.some((p) => name.startsWith(p));
}

export function createEmitter() {
  const listeners = new Map(); // name -> fn[]

  function on(name, fn) {
    if (typeof name !== "string" || name.length === 0) {
      throw new TypeError("createEmitter.on: name must be a non-empty string");
    }
    if (typeof fn !== "function") {
      throw new TypeError("createEmitter.on: fn must be a function");
    }
    let arr = listeners.get(name);
    if (!arr) { arr = []; listeners.set(name, arr); }
    arr.push(fn);
    return () => off(name, fn);
  }

  function once(name, fn) {
    if (typeof name !== "string" || name.length === 0) {
      throw new TypeError("createEmitter.once: name must be a non-empty string");
    }
    if (typeof fn !== "function") {
      throw new TypeError("createEmitter.once: fn must be a function");
    }
    const wrapped = (payload) => {
      off(name, wrapped);
      fn(payload);
    };
    return on(name, wrapped);
  }

  function off(name, fn) {
    const arr = listeners.get(name);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx === -1) return;
    arr.splice(idx, 1);
    if (arr.length === 0) listeners.delete(name);
  }

  function emit(name, payload) {
    if (typeof name === "string" && isReservedEventName(name)) {
      console.warn("[oof] game emitted reserved event", name);
    }
    const arr = listeners.get(name);
    if (!arr || arr.length === 0) return;
    const snapshot = arr.slice(); // listeners added during this emit do not run yet
    for (const fn of snapshot) {
      try {
        fn(payload);
      } catch (err) {
        console.error("[oof] listener error", name, err);
      }
    }
  }

  function clear() {
    listeners.clear();
  }

  function count() {
    let total = 0;
    for (const arr of listeners.values()) total += arr.length;
    return total;
  }

  return { on, once, off, emit, clear, count };
}

// ===================================================================================
// ===== SECTION: BEHAVIOR_TYPES — spec 04 §3.2 =======================================
// ===================================================================================

// The 12 standard behavior type strings, table order (§3.2). Mirrors parts.js's
// (unexported) KNOWN_BEHAVIOR_TYPES set — spec 03 §5.7 owns the handlers, this spec
// owns the schema, both lists must stay in lockstep.
export const BEHAVIOR_TYPES = Object.freeze([
  "kill", "checkpoint", "bounce", "speed", "conveyor", "spinner",
  "movingPlatform", "button", "door", "collectible", "teleport", "touchEvent",
]);
const BEHAVIOR_TYPE_SET = new Set(BEHAVIOR_TYPES);

// ===================================================================================
// ===== SECTION: applyPartDefaults(def, index) — spec 04 §3.1, §5.3 step 5 ==========
// ===================================================================================

const PART_DEFAULTS = Object.freeze({
  shape: "box",
  size: Object.freeze([4, 1, 2]),
  rotation: Object.freeze([0, 0, 0]),
  color: "#a3a2a5",
  material: "plastic",
  transparency: 0,
  anchored: true,
  canCollide: true,
});

function deepFreeze(value) {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value);
  }
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    return Object.freeze(value);
  }
  return value;
}

// §3.2's per-behavior "default" column is applied by the handlers at call time (spec
// 03 §5.7 owns that; parts.js's own runtime defaulting, normalizeRuntimePart, does not
// pre-populate behavior params either). The one named exception is conveyor.direction:
// §3.2 explicitly calls it out as "normalized by loader" — this is that step.
function normalizeBehaviorDefaults(b) {
  if (b.type === "conveyor" && Array.isArray(b.direction) && b.direction.length === 3) {
    const [x, y, z] = b.direction;
    const len = Math.hypot(x, y, z);
    b.direction = len > 0 ? [x / len, y / len, z / len] : [1, 0, 0];
  }
  return b;
}

export function applyPartDefaults(def, index) {
  const src = def || {};
  const behaviors = Array.isArray(src.behaviors)
    ? src.behaviors.map((b) => normalizeBehaviorDefaults({ ...b }))
    : [];
  const full = {
    id: src.id != null ? String(src.id) : "_p" + index,
    shape: src.shape || PART_DEFAULTS.shape,
    size: Array.isArray(src.size) ? src.size.slice() : PART_DEFAULTS.size.slice(),
    // `position` is required (§3.1, no default) — applyPartDefaults runs after
    // validatePlaceData already rejected a missing one, so it is trusted here.
    position: Array.isArray(src.position) ? src.position.slice() : [0, 0, 0],
    rotation: Array.isArray(src.rotation) ? src.rotation.slice() : PART_DEFAULTS.rotation.slice(),
    color: src.color || PART_DEFAULTS.color,
    material: src.material || PART_DEFAULTS.material,
    transparency: src.transparency != null ? src.transparency : PART_DEFAULTS.transparency,
    anchored: src.anchored != null ? src.anchored : PART_DEFAULTS.anchored,
    canCollide: src.canCollide != null ? src.canCollide : PART_DEFAULTS.canCollide,
    behaviors,
  };
  return deepFreeze(full);
}

// ===================================================================================
// ===== SECTION: validatePlaceData(json) — spec 04 §3.4 schema + cross-field rules ==
// ===================================================================================
// This mirrors tools/validate.js's 04:V1 rule (v04ValidatePlaceDoc) so the two stay in
// lockstep per §9's P4-2 row ("validate.js and place.js each carry the shared rule
// table; keep them in lockstep, place.js is authoritative at runtime") — this copy
// omits the slug/folder cross-check (validatePlaceData(json) takes no folder context,
// §7 criterion 1's signature is single-argument; that check is tools/validate.js-only,
// a build-time concern). Every entry gets `code`, `path`, `message` (§7 criterion 3).
// The spec does not define a code taxonomy for schema/cross-field defects (only the
// loader-level E_FETCH/E_JSON/E_INIT/E_BUILD codes are named, §5.3/§5.6) — "E_SCHEMA"
// is used uniformly here as the filled-in decision; see specGaps in the task report.
const SCHEMA_ERROR_CODE = "E_SCHEMA";

const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const HEX_RE = /^#[0-9a-f]{6}$/;
const SLUG_RE = /^[a-z][a-z0-9-]{1,23}$/;
const SHAPES = new Set(["box", "wedge", "cylinder", "sphere"]);
const MATERIALS = new Set(["plastic", "neon", "metal", "grass", "lava", "ice", "glass", "wood"]);

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function pushErr(errors, path, message) {
  errors.push({ code: SCHEMA_ERROR_CODE, path, message });
}

function checkRequired(errors, path, obj, keys) {
  for (const k of keys) {
    if (!(k in obj)) pushErr(errors, path, `missing required field "${k}"`);
  }
}

function checkAdditional(errors, path, obj, allowed) {
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k)) pushErr(errors, `${path}.${k}`, `unknown property "${k}"`);
  }
}

function checkNumber(errors, path, value, min, max, { integer = false, exclusiveMin = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    pushErr(errors, path, `expected a number, got ${JSON.stringify(value)}`);
    return;
  }
  if (integer && !Number.isInteger(value)) {
    pushErr(errors, path, `expected an integer, got ${value}`);
    return;
  }
  const lowOk = exclusiveMin ? value > min : value >= min;
  if (!lowOk || value > max) {
    pushErr(errors, path, `expected a number in [${min}, ${max}]${exclusiveMin ? " (exclusive min)" : ""}, got ${value}`);
  }
}

function codePointLen(value) {
  return Array.from(value).length;
}

function checkStringLen(errors, path, value, minLen, maxLen) {
  if (typeof value !== "string" || codePointLen(value) < minLen || codePointLen(value) > maxLen) {
    pushErr(errors, path, `expected a string of length ${minLen}-${maxLen}, got ${JSON.stringify(value)}`);
  }
}

function checkPattern(errors, path, value, re, label) {
  if (typeof value !== "string" || !re.test(value)) {
    pushErr(errors, path, `expected a string matching ${label}, got ${JSON.stringify(value)}`);
  }
}

function checkEnum(errors, path, value, allowedSet) {
  if (!allowedSet.has(value)) {
    pushErr(errors, path, `expected one of [${[...allowedSet].join(", ")}], got ${JSON.stringify(value)}`);
  }
}

function checkVec3(errors, path, value) {
  if (!Array.isArray(value) || value.length !== 3) {
    pushErr(errors, path, "expected a [x,y,z] array of 3 numbers");
    return;
  }
  for (let i = 0; i < 3; i++) checkNumber(errors, `${path}[${i}]`, value[i], -10000, 10000);
}

function checkArrayOfNumbers(errors, path, value, min, max, len) {
  if (!Array.isArray(value) || value.length !== len) {
    pushErr(errors, path, `expected an array of ${len} numbers`);
    return;
  }
  for (let i = 0; i < len; i++) checkNumber(errors, `${path}[${i}]`, value[i], min, max);
}

function checkBoolean(errors, path, value) {
  if (typeof value !== "boolean") pushErr(errors, path, `expected a boolean, got ${JSON.stringify(value)}`);
}

// Behavior schemas, §3.2 table / §3.4 $defs.behavior oneOf — one entry per type.
const BEHAVIOR_SCHEMAS = {
  kill: { required: [], props: {} },
  checkpoint: {
    required: ["order"],
    props: { order: (e, p, v) => checkNumber(e, p, v, 0, Infinity, { integer: true }) },
  },
  bounce: {
    required: [],
    props: { power: (e, p, v) => checkNumber(e, p, v, 1, 200) },
  },
  speed: {
    required: [],
    props: {
      walkSpeed: (e, p, v) => checkNumber(e, p, v, 1, 100),
      duration: (e, p, v) => checkNumber(e, p, v, 0.1, 120),
    },
  },
  conveyor: {
    required: [],
    props: {
      direction: (e, p, v) => checkVec3(e, p, v),
      speed: (e, p, v) => checkNumber(e, p, v, 0.1, 64),
    },
  },
  spinner: {
    required: [],
    props: {
      axis: (e, p, v) => checkEnum(e, p, v, new Set(["x", "y", "z"])),
      speed: (e, p, v) => checkNumber(e, p, v, -720, 720),
    },
  },
  movingPlatform: {
    required: ["waypoints"],
    props: {
      waypoints: (e, p, v) => {
        if (!Array.isArray(v) || v.length < 2 || v.length > 16) {
          pushErr(e, p, "expected 2-16 [x,y,z] waypoints");
          return;
        }
        v.forEach((wp, i) => checkVec3(e, `${p}[${i}]`, wp));
      },
      speed: (e, p, v) => checkNumber(e, p, v, 0.1, 64),
      pauseS: (e, p, v) => checkNumber(e, p, v, 0, 30),
      mode: (e, p, v) => checkEnum(e, p, v, new Set(["pingpong", "cycle"])),
    },
  },
  button: {
    required: ["channel"],
    props: {
      channel: (e, p, v) => checkPattern(e, p, v, ID_RE, "id charset"),
      once: (e, p, v) => checkBoolean(e, p, v),
      cooldownS: (e, p, v) => checkNumber(e, p, v, 0, 600),
    },
  },
  door: {
    required: ["channel"],
    props: {
      channel: (e, p, v) => checkPattern(e, p, v, ID_RE, "id charset"),
      mode: (e, p, v) => checkEnum(e, p, v, new Set(["open", "toggle"])),
      openS: (e, p, v) => checkNumber(e, p, v, 0.1, 600),
    },
  },
  collectible: {
    required: [],
    props: {
      kind: (e, p, v) => checkEnum(e, p, v, new Set(["oofbux", "event"])),
      value: (e, p, v) => checkNumber(e, p, v, 1, 10000, { integer: true }),
      respawnS: (e, p, v) => checkNumber(e, p, v, 0, 3600),
      event: (e, p, v) => checkPattern(e, p, v, ID_RE, "id charset"),
    },
  },
  teleport: {
    required: ["target"],
    props: {
      target: (e, p, v) => checkPattern(e, p, v, ID_RE, "id charset"),
      cooldownS: (e, p, v) => checkNumber(e, p, v, 0, 600),
    },
  },
  touchEvent: {
    required: ["event"],
    props: {
      event: (e, p, v) => checkPattern(e, p, v, ID_RE, "id charset"),
      once: (e, p, v) => checkBoolean(e, p, v),
      cooldownS: (e, p, v) => checkNumber(e, p, v, 0, 600),
    },
  },
};

function validateBehavior(errors, path, b) {
  const schema = BEHAVIOR_SCHEMAS[b.type];
  if (!schema) {
    pushErr(errors, `${path}.type`, `unknown behavior type "${b.type}"`);
    return;
  }
  const allowed = new Set(["type", ...Object.keys(schema.props)]);
  for (const k of Object.keys(b)) {
    if (!allowed.has(k)) pushErr(errors, `${path}.${k}`, `unknown param "${k}" for behavior type "${b.type}"`);
  }
  for (const req of schema.required) {
    if (!(req in b)) pushErr(errors, path, `behavior "${b.type}" missing required param "${req}"`);
  }
  for (const [k, validator] of Object.entries(schema.props)) {
    if (k in b) validator(errors, `${path}.${k}`, b[k]);
  }
}

function validateBehaviors(errors, path, behaviors) {
  if (!Array.isArray(behaviors)) {
    pushErr(errors, path, "expected an array");
    return;
  }
  if (behaviors.length > MAX_BEHAVIORS_PER_PART) {
    pushErr(errors, path, `at most ${MAX_BEHAVIORS_PER_PART} behaviors per part, got ${behaviors.length}`);
  }
  const seenTypes = new Set();
  behaviors.forEach((b, i) => {
    const bp = `${path}[${i}]`;
    if (!isPlainObject(b)) { pushErr(errors, bp, "expected an object"); return; }
    if (typeof b.type !== "string") { pushErr(errors, bp, 'missing required field "type"'); return; }
    if (seenTypes.has(b.type)) {
      pushErr(errors, bp, `duplicate behavior type "${b.type}" on the same part (spec 04 §3.1: at most one of each type)`);
    }
    seenTypes.add(b.type);
    validateBehavior(errors, bp, b);
  });
}

const PART_ALLOWED = new Set([
  "id", "shape", "size", "position", "rotation", "color", "material",
  "transparency", "anchored", "canCollide", "behaviors",
]);

function validatePart(errors, path, part) {
  if (!isPlainObject(part)) { pushErr(errors, path, "expected an object"); return; }
  checkRequired(errors, path, part, ["position"]);
  checkAdditional(errors, path, part, PART_ALLOWED);
  if ("id" in part) checkPattern(errors, `${path}.id`, part.id, ID_RE, "^[A-Za-z0-9_-]{1,32}$");
  if ("shape" in part) checkEnum(errors, `${path}.shape`, part.shape, SHAPES);
  if ("size" in part) checkArrayOfNumbers(errors, `${path}.size`, part.size, 0.05, 2048, 3);
  if ("position" in part) checkVec3(errors, `${path}.position`, part.position);
  if ("rotation" in part) checkArrayOfNumbers(errors, `${path}.rotation`, part.rotation, -360, 360, 3);
  if ("color" in part) checkPattern(errors, `${path}.color`, part.color, HEX_RE, "^#[0-9a-f]{6}$");
  if ("material" in part) checkEnum(errors, `${path}.material`, part.material, MATERIALS);
  if ("transparency" in part) checkNumber(errors, `${path}.transparency`, part.transparency, 0, 1);
  if ("anchored" in part) checkBoolean(errors, `${path}.anchored`, part.anchored);
  if ("canCollide" in part) checkBoolean(errors, `${path}.canCollide`, part.canCollide);
  if ("behaviors" in part) validateBehaviors(errors, `${path}.behaviors`, part.behaviors);
}

function validateRegions(errors, regions) {
  if (!Array.isArray(regions)) { pushErr(errors, "regions", "expected an array"); return; }
  if (regions.length > MAX_REGIONS) pushErr(errors, "regions", `at most ${MAX_REGIONS} regions, got ${regions.length}`);
  regions.forEach((r, i) => {
    const p = `regions[${i}]`;
    if (!isPlainObject(r)) { pushErr(errors, p, "expected an object"); return; }
    checkRequired(errors, p, r, ["id", "min", "max"]);
    checkAdditional(errors, p, r, new Set(["id", "min", "max", "event"]));
    if ("id" in r) checkPattern(errors, `${p}.id`, r.id, ID_RE, "id charset");
    if ("min" in r) checkVec3(errors, `${p}.min`, r.min);
    if ("max" in r) checkVec3(errors, `${p}.max`, r.max);
    if ("event" in r) checkPattern(errors, `${p}.event`, r.event, ID_RE, "id charset");
    if (Array.isArray(r.min) && Array.isArray(r.max) && r.min.length === 3 && r.max.length === 3) {
      for (let k = 0; k < 3; k++) {
        if (typeof r.min[k] === "number" && typeof r.max[k] === "number" && !(r.min[k] < r.max[k])) {
          pushErr(errors, p, `min[${k}] (${r.min[k]}) must be < max[${k}] (${r.max[k]})`);
        }
      }
    }
  });
}

function validateLighting(errors, lighting) {
  if (!isPlainObject(lighting)) { pushErr(errors, "lighting", "expected an object"); return; }
  const allowed = new Set([
    "skyTop", "skyBottom", "ambient", "ambientIntensity",
    "sunColor", "sunIntensity", "sunDirection", "fog",
  ]);
  checkAdditional(errors, "lighting", lighting, allowed);
  if ("skyTop" in lighting) checkPattern(errors, "lighting.skyTop", lighting.skyTop, HEX_RE, "hex color");
  if ("skyBottom" in lighting) checkPattern(errors, "lighting.skyBottom", lighting.skyBottom, HEX_RE, "hex color");
  if ("ambient" in lighting) checkPattern(errors, "lighting.ambient", lighting.ambient, HEX_RE, "hex color");
  if ("ambientIntensity" in lighting) checkNumber(errors, "lighting.ambientIntensity", lighting.ambientIntensity, 0, 2);
  if ("sunColor" in lighting) checkPattern(errors, "lighting.sunColor", lighting.sunColor, HEX_RE, "hex color");
  if ("sunIntensity" in lighting) checkNumber(errors, "lighting.sunIntensity", lighting.sunIntensity, 0, 3);
  if ("sunDirection" in lighting) checkVec3(errors, "lighting.sunDirection", lighting.sunDirection);
  if ("fog" in lighting && lighting.fog !== null) {
    const fog = lighting.fog;
    if (!isPlainObject(fog)) {
      pushErr(errors, "lighting.fog", "expected an object or null");
    } else {
      checkRequired(errors, "lighting.fog", fog, ["color", "near", "far"]);
      checkAdditional(errors, "lighting.fog", fog, new Set(["color", "near", "far"]));
      if ("color" in fog) checkPattern(errors, "lighting.fog.color", fog.color, HEX_RE, "hex color");
      if ("near" in fog) checkNumber(errors, "lighting.fog.near", fog.near, 0, Infinity, { exclusiveMin: true });
      if ("far" in fog) checkNumber(errors, "lighting.fog.far", fog.far, 0, Infinity, { exclusiveMin: true });
      if (typeof fog.near === "number" && typeof fog.far === "number" && !(fog.far > fog.near)) {
        pushErr(errors, "lighting.fog", `far (${fog.far}) must be > near (${fog.near})`);
      }
    }
  }
}

function validateMeta(errors, meta) {
  if (!isPlainObject(meta)) { pushErr(errors, "meta", "expected an object"); return; }
  checkRequired(errors, "meta", meta, ["slug", "name", "icon", "description"]);
  checkAdditional(errors, "meta", meta, new Set(["slug", "name", "icon", "description"]));
  if ("slug" in meta) checkPattern(errors, "meta.slug", meta.slug, SLUG_RE, "^[a-z][a-z0-9-]{1,23}$");
  if ("name" in meta) checkStringLen(errors, "meta.name", meta.name, 1, 40);
  if ("icon" in meta) checkStringLen(errors, "meta.icon", meta.icon, 1, 4);
  if ("description" in meta) checkStringLen(errors, "meta.description", meta.description, 1, 140);
}

// Point-in-part test for the "spawn not inside a canCollide part" cross-field rule
// (§3.3 spawn row). `position` is the part's CENTER. Rotated parts and wedges are
// skipped — OBB/analytic collider math is physics.js's job, not this static check's.
function pointInsidePart(point, position, size, shape) {
  const [px, py, pz] = point;
  const [cx, cy, cz] = position;
  if (shape === "sphere") {
    const r = size[0] / 2;
    const dx = px - cx, dy = py - cy, dz = pz - cz;
    return dx * dx + dy * dy + dz * dz <= r * r;
  }
  if (shape === "cylinder") {
    const r = size[0] / 2, halfH = size[1] / 2;
    const dx = px - cx, dz = pz - cz;
    return dx * dx + dz * dz <= r * r && Math.abs(py - cy) <= halfH;
  }
  const [sx, sy, sz] = size;
  return Math.abs(px - cx) <= sx / 2 && Math.abs(py - cy) <= sy / 2 && Math.abs(pz - cz) <= sz / 2;
}

const TOP_ALLOWED = new Set(["meta", "spawn", "spawnYaw", "killY", "parts", "regions", "lighting", "music"]);

export function validatePlaceData(json) {
  const errors = [];
  if (!isPlainObject(json)) {
    pushErr(errors, "", "place.json root must be an object");
    return { ok: false, errors };
  }
  checkRequired(errors, "", json, ["meta", "spawn", "parts"]);
  checkAdditional(errors, "", json, TOP_ALLOWED);

  if ("meta" in json) validateMeta(errors, json.meta);
  if ("spawn" in json) checkVec3(errors, "spawn", json.spawn);
  if ("spawnYaw" in json) checkNumber(errors, "spawnYaw", json.spawnYaw, -360, 360);
  if ("killY" in json) checkNumber(errors, "killY", json.killY, -Infinity, Infinity);

  const idCounts = new Map();
  const checkpointOrders = new Map();
  const buttonChannels = new Set();
  const doorChannels = [];
  const teleportTargets = [];

  if ("parts" in json) {
    if (!Array.isArray(json.parts) || json.parts.length < 1 || json.parts.length > MAX_PARTS) {
      pushErr(errors, "parts", `expected an array of 1-${MAX_PARTS} parts, got ${Array.isArray(json.parts) ? json.parts.length : typeof json.parts}`);
    }
    if (Array.isArray(json.parts)) {
      json.parts.forEach((part, i) => {
        const p = `parts[${i}]`;
        validatePart(errors, p, part);
        if (!isPlainObject(part)) return;

        if (typeof part.id === "string") idCounts.set(part.id, (idCounts.get(part.id) || 0) + 1);

        if (Array.isArray(part.behaviors)) {
          part.behaviors.forEach((b, bi) => {
            if (!isPlainObject(b) || typeof b.type !== "string") return;
            const bp = `${p}.behaviors[${bi}]`;
            if (b.type === "checkpoint" && typeof b.order === "number") {
              if (checkpointOrders.has(b.order)) {
                pushErr(errors, bp, `duplicate checkpoint order ${b.order} (first at ${checkpointOrders.get(b.order)})`);
              } else {
                checkpointOrders.set(b.order, bp);
              }
            }
            if (b.type === "button" && typeof b.channel === "string") buttonChannels.add(b.channel);
            if (b.type === "door" && typeof b.channel === "string") doorChannels.push({ channel: b.channel, path: bp });
            if (b.type === "teleport" && typeof b.target === "string") teleportTargets.push({ target: b.target, path: bp });
            if (b.type === "collectible") {
              const kind = "kind" in b ? b.kind : "oofbux";
              const hasEvent = "event" in b;
              if (kind === "event" && !hasEvent) pushErr(errors, bp, 'collectible kind:"event" requires an "event" field');
              if (kind !== "event" && hasEvent) pushErr(errors, bp, 'collectible "event" field is only allowed when kind:"event"');
            }
          });
        }

        if (part.shape === "cylinder" && Array.isArray(part.size) && part.size.length === 3) {
          const [sx, , sz] = part.size;
          if (typeof sx === "number" && typeof sz === "number" && sx !== sz) {
            pushErr(errors, `${p}.size`, `cylinder requires size[0] === size[2] (x diameter === z diameter), got ${sx} vs ${sz}`);
          }
        }
        if (part.shape === "sphere" && Array.isArray(part.size) && part.size.length === 3) {
          const [sx, sy, sz] = part.size;
          if (typeof sx === "number" && typeof sy === "number" && typeof sz === "number" && !(sx === sy && sy === sz)) {
            pushErr(errors, `${p}.size`, `sphere requires size[0] === size[1] === size[2], got [${sx}, ${sy}, ${sz}]`);
          }
        }
      });
    }
  }

  for (const [id, count] of idCounts) {
    if (count > 1) pushErr(errors, "parts", `duplicate part id "${id}" (${count} occurrences; spec 04 §3.1: unique within the file)`);
  }
  const partIds = new Set(idCounts.keys());
  for (const { channel, path } of doorChannels) {
    if (!buttonChannels.has(channel)) pushErr(errors, path, `door channel "${channel}" has no matching button`);
  }
  for (const { target, path } of teleportTargets) {
    if (!partIds.has(target)) pushErr(errors, path, `teleport target "${target}" does not match any part id`);
  }

  if ("regions" in json) validateRegions(errors, json.regions);
  if ("lighting" in json) validateLighting(errors, json.lighting);
  if ("music" in json && typeof json.music !== "string") pushErr(errors, "music", "expected a string");

  if (Array.isArray(json.spawn) && json.spawn.length === 3 && json.spawn.every((n) => typeof n === "number") && Array.isArray(json.parts)) {
    for (const part of json.parts) {
      if (!isPlainObject(part) || !Array.isArray(part.position)) continue;
      if (part.canCollide === false) continue;
      if (part.shape === "wedge") continue;
      const rot = Array.isArray(part.rotation) ? part.rotation : [0, 0, 0];
      if (rot.some((r) => r !== 0)) continue;
      const size = Array.isArray(part.size) ? part.size : [4, 1, 2];
      if (pointInsidePart(json.spawn, part.position, size, part.shape || "box")) {
        pushErr(errors, "spawn", `spawn point is inside canCollide part "${part.id || "(unnamed)"}"`);
        break;
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

// ===================================================================================
// ===== SECTION: lighting merge — spec 04 §3.3 defaults ==============================
// ===================================================================================
// renderer.js's own applyLighting(cfg) resolves missing fields against ITS OWN engine-
// look defaults (spec 02 §5.2 LIGHTING_DEFAULTS), which differ from this spec's §3.3
// Place-level defaults (e.g. skyTop #4aa8ff vs #87ceeb) — §5.3 step 6 explicitly says
// applyLighting is handed "the fully-merged lighting object", so THIS merge (against
// §3.3's table, not renderer.js's) has to happen here, in the loader, first.
const LIGHTING_04_DEFAULTS = Object.freeze({
  skyTop: "#87ceeb",
  skyBottom: "#e6f2ff",
  ambient: "#9db2c9",
  ambientIntensity: 0.6,
  sunColor: "#fff4e0",
  sunIntensity: 1.0,
  sunDirection: Object.freeze([-0.5, -1, -0.3]),
  fog: null,
});

function mergeLighting(userLighting) {
  const u = userLighting || {};
  return {
    skyTop: u.skyTop !== undefined ? u.skyTop : LIGHTING_04_DEFAULTS.skyTop,
    skyBottom: u.skyBottom !== undefined ? u.skyBottom : LIGHTING_04_DEFAULTS.skyBottom,
    ambient: u.ambient !== undefined ? u.ambient : LIGHTING_04_DEFAULTS.ambient,
    ambientIntensity: u.ambientIntensity !== undefined ? u.ambientIntensity : LIGHTING_04_DEFAULTS.ambientIntensity,
    sunColor: u.sunColor !== undefined ? u.sunColor : LIGHTING_04_DEFAULTS.sunColor,
    sunIntensity: u.sunIntensity !== undefined ? u.sunIntensity : LIGHTING_04_DEFAULTS.sunIntensity,
    sunDirection: (u.sunDirection !== undefined ? u.sunDirection : LIGHTING_04_DEFAULTS.sunDirection).slice(),
    fog: u.fog !== undefined ? u.fog : LIGHTING_04_DEFAULTS.fog,
  };
}

// ===================================================================================
// ===== SECTION: region/killY per-tick checks — spec 04 §5.4 =========================
// ===================================================================================
// place.js owns only the place-LEVEL per-step checks (§5.4 point 6-7); part-touch
// behavior dispatch lives in parts.js (spec 03 §5.7, "reduced scope" per this task's
// TASKS.md row). Driven by physics.js's existing setContactHandler(fn) hook — the only
// "call me once per completed physics.step(dt) tick" hook already exported by the
// engine at M1 (spec 11's handle.step(dt) is an M5-only addition, §2, not available
// here); its (entered/stayed/exited) payload is unused, only the tick itself matters.
// SPEC GAP: §5.3/§5.4 do not name how place-level checks get driven before spec 11's
// handle.step(dt) lands (M1, pre-shell) — see the task report.
function aabbOverlaps(aMin, aMax, bMin, bMax) {
  return aMin[0] <= bMax[0] && aMax[0] >= bMin[0]
    && aMin[1] <= bMax[1] && aMax[1] >= bMin[1]
    && aMin[2] <= bMax[2] && aMax[2] >= bMin[2];
}

function makePerTickHandler(handle, deps) {
  return function onPhysicsTick() {
    handle.simTime += SIM_DT;
    const center = deps.physics.getPosition();
    const feet = [center[0], center[1] - FEET_OFFSET, center[2]];

    // Regions (§5.4 point 6): avatar AABB is feet position, 2(x) x 5(y) x 2(z).
    const aMin = [feet[0] - AVATAR_RADIUS, feet[1], feet[2] - AVATAR_RADIUS];
    const aMax = [feet[0] + AVATAR_RADIUS, feet[1] + AVATAR_HEIGHT, feet[2] + AVATAR_RADIUS];
    for (const region of handle.regionTracker) {
      const overlapping = aabbOverlaps(aMin, aMax, region.min, region.max);
      if (overlapping && !region.inside) {
        region.inside = true;
        deps.events.emit("region:enter", { regionId: region.id });
        if (region.event) {
          // §5.2 gives touch:<event> one payload shape, {partId, position, time},
          // shared by touchEvent/collectible/region sources; a region has no partId
          // of its own, so its id fills that slot — see specGaps in the task report.
          deps.events.emit("touch:" + region.event, { partId: region.id, position: feet, time: handle.simTime });
        }
      } else if (!overlapping && region.inside) {
        region.inside = false;
        deps.events.emit("region:exit", { regionId: region.id });
      }
    }

    // killY (§5.4 point 7): the engine's character controller has no void plane of its
    // own (task guidance) — this is its sole owner. `killedThisLife` guards
    // re-entrancy directly (independent of physics.js's own dying/grace-timer guard)
    // so a life spent below the void for several ticks in a row (e.g. across the
    // respawn delay) calls kill() exactly once.
    if (feet[1] < handle.data.killY) {
      if (!handle.killedThisLife) {
        handle.killedThisLife = true;
        deps.physics.kill("void");
      }
    } else {
      handle.killedThisLife = false;
    }
  };
}

// ===================================================================================
// ===== SECTION: loadPlace(slug, deps) — spec 04 §5.3 ================================
// ===================================================================================

function fmtDelta(n) {
  return (n >= 0 ? "+" : "") + n;
}

function captureBaseline(deps) {
  return {
    sceneChildren: deps.scene ? deps.scene.children.length : 0,
    geometries: deps.rendererApi && deps.rendererApi.three ? deps.rendererApi.three.info.memory.geometries : 0,
    colliders: deps.physics && typeof deps.physics.getDebugState === "function"
      ? deps.physics.getDebugState().colliderCount
      : 0,
  };
}

export async function loadPlace(slug, deps) {
  const t0 = performance.now();
  const baseline = captureBaseline(deps);

  let res;
  try {
    // §5.3 step 2: fetch relative to site root. This literal template is what §5.3
    // gives loadPlace(slug, deps) — a single-argument-derived URL, no path override —
    // which does not special-case the hub's actual location (src/platform/hub/,
    // per §5.6's PLACES registry); see specGaps in the task report.
    res = await fetch("src/games/" + slug + "/place.json");
  } catch (err) {
    return { ok: false, errors: [{ code: "E_FETCH", path: "", message: String(err && err.message || err) }] };
  }
  if (!res || !res.ok) {
    return { ok: false, errors: [{ code: "E_FETCH", path: "", message: `fetch failed: ${res ? res.status : "no response"}` }] };
  }

  let text;
  try {
    text = await res.text();
  } catch (err) {
    return { ok: false, errors: [{ code: "E_FETCH", path: "", message: String(err && err.message || err) }] };
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return { ok: false, errors: [{ code: "E_JSON", path: "", message: String(err && err.message || err) }] };
  }

  const validated = validatePlaceData(json);
  if (!validated.ok) {
    return { ok: false, errors: validated.errors };
  }

  // Steps 5-13 never throw out of loadPlace (§5.3: "the loader never throws") — any
  // unexpected error from a dependency is caught and reported like every other
  // failure mode above.
  try {
    // step 5: defaults.
    const parts = json.parts.map((def, i) => applyPartDefaults(def, i));
    const data = {
      meta: json.meta,
      spawn: json.spawn.slice(),
      spawnYaw: json.spawnYaw !== undefined ? json.spawnYaw : 0,
      killY: json.killY !== undefined ? json.killY : DEFAULT_KILL_Y,
      parts,
      regions: Array.isArray(json.regions) ? json.regions : [],
      lighting: mergeLighting(json.lighting),
      music: json.music,
    };

    // step 6: lighting.
    if (deps.rendererApi && typeof deps.rendererApi.applyLighting === "function") {
      deps.rendererApi.applyLighting(data.lighting);
    }

    // step 7: build parts. A single partsApi.load(allDefs) call — NOT `MAX_PARTS /
    // BUILD_YIELD_EVERY_PARTS` repeated calls: parts.js's load() clears the whole
    // world on every call (spec 03, already built), so calling it once per 200-part
    // chunk would delete the previous chunk rather than append to it, and per-part
    // addPart() calls never join an instanced batch (spec 03 §5.3), defeating the
    // instancing this same step relies on for perf. See specGaps in the task report.
    if (deps.partsApi && typeof deps.partsApi.load === "function") {
      deps.partsApi.load(data.parts);
    }
    const partRecords = new Map();
    for (let i = 0; i < data.parts.length; i += BUILD_YIELD_EVERY_PARTS) {
      const chunk = data.parts.slice(i, i + BUILD_YIELD_EVERY_PARTS);
      for (const part of chunk) {
        const record = deps.partsApi && typeof deps.partsApi.getPart === "function"
          ? deps.partsApi.getPart(part.id)
          : null;
        partRecords.set(part.id, { id: part.id, def: part, record });
      }
      if (i + BUILD_YIELD_EVERY_PARTS < data.parts.length) await Promise.resolve();
    }

    // step 9: regions.
    const regionTracker = data.regions.map((r) => ({
      id: r.id, min: r.min.slice(), max: r.max.slice(), event: r.event || null, inside: false,
    }));

    // step 10: music.
    if (data.music && deps.audio && typeof deps.audio.playMusic === "function") {
      deps.audio.playMusic(data.music, { fadeMs: MUSIC_FADE_MS });
    }

    // step 11: spawn.
    if (deps.physics && typeof deps.physics.spawnAt === "function") {
      deps.physics.spawnAt(data.spawn, data.spawnYaw);
    }

    // step 12: load budget.
    const loadMs = performance.now() - t0;
    if (loadMs > LOAD_BUDGET_MS) {
      console.warn("[oof] load budget exceeded", slug, loadMs);
    }

    const handle = {
      slug,
      data,
      partRecords,
      behaviorRuntimes: [], // unused: behavior execution lives in parts.js (§5.4 note)
      regionTracker,
      baseline,
      loadMs,
      // Additional bookkeeping beyond §5.3's illustrative handle shape — needed by
      // disposePlace and the per-tick handler, opaque to callers other than them.
      simTime: 0,
      killedThisLife: false,
      _deps: deps,
      _disposed: false,
    };

    if (deps.physics && typeof deps.physics.setContactHandler === "function") {
      deps.physics.setContactHandler(makePerTickHandler(handle, deps));
    }

    // step 13.
    if (deps.events) {
      deps.events.emit("place:loaded", { slug, partCount: data.parts.length, loadMs });
    }

    return { ok: true, handle };
  } catch (err) {
    return { ok: false, errors: [{ code: "E_BUILD", path: "", message: String(err && err.message || err) }] };
  }
}

// ===================================================================================
// ===== SECTION: disposePlace(handle) — spec 04 §5.5 =================================
// ===================================================================================

export function disposePlace(handle) {
  if (!handle || handle._disposed) return { leaks: [] };
  handle._disposed = true;
  const deps = handle._deps || {};
  const leaks = [];

  // step 1: stop music.
  try {
    if (deps.audio && typeof deps.audio.stopMusic === "function") {
      deps.audio.stopMusic({ fadeMs: MUSIC_STOP_FADE_MS });
    }
  } catch (err) {
    console.error("[oof] dispose: stopMusic failed", handle.slug, err);
  }

  // step 2: parts (meshes/geometries/materials/colliders).
  try {
    if (deps.partsApi && typeof deps.partsApi.clear === "function") deps.partsApi.clear();
  } catch (err) {
    console.error("[oof] dispose: partsApi.clear failed", handle.slug, err);
  }

  // step 3: drop behaviorRuntimes/regionTracker; release the per-tick hook this
  // module registered in loadPlace, so no stale closure over a disposed handle keeps
  // firing into events.clear()'d-below emitter on a later, unrelated physics.step.
  try {
    if (deps.physics && typeof deps.physics.setContactHandler === "function") {
      deps.physics.setContactHandler(null);
    }
  } catch (err) {
    console.error("[oof] dispose: releasing contact handler failed", handle.slug, err);
  }
  handle.behaviorRuntimes.length = 0;
  handle.regionTracker.length = 0;

  // step 4: events, after reading count().
  try {
    if (deps.events) {
      const count = deps.events.count();
      if (count > 0) leaks.push("listeners:" + count);
      deps.events.clear();
    }
  } catch (err) {
    console.error("[oof] dispose: events.clear failed", handle.slug, err);
  }

  // step 5: reset avatar modifiers (walk speed 16, jump power 50, checkpoint
  // cleared) — physics.clear() is the only exported way to reach an unset checkpoint
  // (setCheckpoint always sets a position; only clear() resets it), and also resets
  // the transient per-life state (grounded, contacts, gravity) a stale Place would
  // otherwise leave behind for whatever loads next.
  try {
    if (deps.physics && typeof deps.physics.clear === "function") deps.physics.clear();
  } catch (err) {
    console.error("[oof] dispose: physics.clear failed", handle.slug, err);
  }

  // step 6: verify against baseline.
  try {
    const sceneChildren = deps.scene ? deps.scene.children.length : handle.baseline.sceneChildren;
    if (sceneChildren !== handle.baseline.sceneChildren) {
      leaks.push("sceneChildren:" + fmtDelta(sceneChildren - handle.baseline.sceneChildren));
    }
    const geometries = deps.rendererApi && deps.rendererApi.three
      ? deps.rendererApi.three.info.memory.geometries
      : handle.baseline.geometries;
    if (geometries !== handle.baseline.geometries) {
      leaks.push("geometries:" + fmtDelta(geometries - handle.baseline.geometries));
    }
    const colliders = deps.physics && typeof deps.physics.getDebugState === "function"
      ? deps.physics.getDebugState().colliderCount
      : handle.baseline.colliders;
    if (colliders !== handle.baseline.colliders) {
      leaks.push("colliders:" + fmtDelta(colliders - handle.baseline.colliders));
    }
  } catch (err) {
    console.error("[oof] dispose: baseline verification failed", handle.slug, err);
    leaks.push("verify:error");
  }

  // step 7.
  return { leaks };
}
