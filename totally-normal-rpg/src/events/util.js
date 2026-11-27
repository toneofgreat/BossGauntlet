// EVENTS shared helpers (pure; safe to import from node).

export const PHASES = ["intro", "area1", "area2", "area3", "postKing", "desert", "forest", "forestHouse", "chase",
  "collapse", "throne", "ng", "ngPostKing", "hollowDesert", "girl", "hollow2", "choice", "finalBoss", "ended"];

export function phaseIdx(p) { const i = PHASES.indexOf(p); return i < 0 ? -1 : i; }

export const TAU = Math.PI * 2;
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
export function easeOut(t) { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t) * (1 - t); }
export function easeIn(t) { t = clamp(t, 0, 1); return t * t * t; }
/** frame-rate independent exponential approach */
export function damp(cur, target, rate, dt) { return target + (cur - target) * Math.exp(-rate * dt); }
export function wrapAngle(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
export function dampAngle(cur, target, rate, dt) { return cur + wrapAngle(target - cur) * (1 - Math.exp(-rate * dt)); }
/** yaw that faces from (ax,az) toward (bx,bz); yaw 0 faces +Z, forward = (sin yaw, 0, cos yaw) */
export function yawTo(ax, az, bx, bz) { return Math.atan2(bx - ax, bz - az); }
export function distXZ(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
export function dist3(a, b) { const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }

// deterministic hash noise (no allocation)
export function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x) {
  const i = Math.floor(x), f = x - i; const u = f * f * (3 - 2 * f);
  return lerp(hash1(i), hash1(i + 1), u) * 2 - 1;
}

/** small seeded RNG (mulberry32) */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** call obj[method](...args) safely; returns undefined when missing or throwing */
export function safe(obj, method, ...args) {
  try {
    if (obj && typeof obj[method] === "function") return obj[method](...args);
  } catch (e) { console.warn("[events]", method, e); }
  return undefined;
}
/** same as safe() but always returns a Promise */
export function safeP(obj, method, ...args) {
  const r = safe(obj, method, ...args);
  return r && typeof r.then === "function" ? r.catch((e) => { console.warn("[events]", method, e); }) : Promise.resolve(r);
}

/** clamp a point (x,z) to within maxR of (cx,cz) - mutates & returns o */
export function clampToCircle(o, cx, cz, maxR) {
  const dx = o.x - cx, dz = o.z - cz; const d = Math.sqrt(dx * dx + dz * dz);
  if (d > maxR) { o.x = cx + dx / d * maxR; o.z = cz + dz / d * maxR; }
  return o;
}
