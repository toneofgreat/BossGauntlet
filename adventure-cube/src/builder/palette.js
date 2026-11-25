// builder/palette.js - every brush the editor offers (all tiles, entity types/kinds, markers, decorations),
// entity defaults, entity hit boxes and the inspector field specs. DOM-free (testable in Node). BUILDER owns.
import { HAZARD_KINDS, PULSE_KINDS, MOVER_KINDS, DECO_KINDS } from "../sim/constants.js";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// brush = { id, kind: "tile"|"pair"|"entity"|"marker", name, tip, tile?|pair?|entity?|sub?|marker?, thumb }
export const GROUPS = [
  { id: "terrain", name: "Terrain", items: [
    { id: "t#", kind: "tile", tile: "#", name: "Ground", tip: "Earth with a grassy top" },
    { id: "tR", kind: "tile", tile: "R", name: "Rock", tip: "Stone, boulders, cliff faces" },
    { id: "tW", kind: "tile", tile: "W", name: "Wood", tip: "Fallen logs, stumps, planks" },
    { id: "tI", kind: "tile", tile: "I", name: "Ice", tip: "Solid but slippery" },
    { id: "t-", kind: "tile", tile: "-", name: "Branch", tip: "One-way ledge: jump up through it, land on top" },
    { id: "tB", kind: "tile", tile: "B", name: "Back wall", tip: "Background rock or cave wall (not solid)" },
  ] },
  { id: "slopes", name: "Slopes", items: [
    { id: "t/", kind: "tile", tile: "/", name: "Hill up", tip: "45 degree slope rising to the right (put ground under it)" },
    { id: "t\\", kind: "tile", tile: "\\", name: "Hill down", tip: "45 degree slope rising to the left (put ground under it)" },
    { id: "pab", kind: "pair", pair: "ab", name: "Gentle up", tip: "22.5 degree slope, 2 tiles wide, rising right" },
    { id: "pcd", kind: "pair", pair: "cd", name: "Gentle down", tip: "22.5 degree slope, 2 tiles wide, falling right" },
  ] },
  { id: "hazards", name: "Hazards", items: [
    { id: "t^", kind: "tile", tile: "^", name: "Thorns", tip: "Deadly thorns on a floor" },
    { id: "tv", kind: "tile", tile: "v", name: "Hanging thorns", tip: "Deadly thorns under a ceiling" },
    { id: "t<", kind: "tile", tile: "<", name: "Wall thorns L", tip: "Thorns on the left face of a wall" },
    { id: "t>", kind: "tile", tile: ">", name: "Wall thorns R", tip: "Thorns on the right face of a wall" },
    { id: "t~", kind: "tile", tile: "~", name: "Water", tip: "Streams and ponds (deadly)" },
    ...HAZARD_KINDS.map((k) => ({ id: "h" + k, kind: "entity", entity: "hazard", sub: k, name: { thornball: "Thorn ball", boulder: "Boulder", wasp: "Wasp", spark: "Spark" }[k] || cap(k), tip: "Deadly moving circle. Select it to edit its path" })),
    ...PULSE_KINDS.map((k) => ({ id: "u" + k, kind: "entity", entity: "pulse", sub: k, name: cap(k), tip: "Timed blast: deadly while active, warns before it fires" })),
  ] },
  { id: "objects", name: "Objects", items: [
    { id: "espring", kind: "entity", entity: "spring", name: "Mushroom", tip: "Spring: land on its cap to bounce high" },
    { id: "ecrumble", kind: "entity", entity: "crumble", name: "Crumble", tip: "Breaks a moment after you stand on it, then returns" },
    ...MOVER_KINDS.map((k) => ({ id: "m" + k, kind: "entity", entity: "mover", sub: k, name: cap(k), tip: "Moving platform. Select it to edit its path" })),
    { id: "esign", kind: "entity", entity: "sign", name: "Sign", tip: "A signboard with your text" },
  ] },
  { id: "markers", name: "Flags", items: [
    { id: "kstart", kind: "marker", marker: "start", name: "Start", tip: "Where the cube starts" },
    { id: "kcheckpoint", kind: "marker", marker: "checkpoint", name: "Checkpoint", tip: "Respawn point (tap again to remove). Max 12" },
    { id: "kgoal", kind: "marker", marker: "goal", name: "Goal", tip: "The finish banner" },
  ] },
  { id: "decor", name: "Decor", items: DECO_KINDS.map((k) => ({ id: "d" + k, kind: "entity", entity: "deco", sub: k, name: cap(k), tip: "Decoration (not solid)" })) },
];
for (const g of GROUPS) for (const b of g.items) {
  b.group = g.id;
  b.thumb = b.kind === "tile" ? { tile: b.tile } : b.kind === "pair" ? { pair: b.pair } : b.kind === "marker" ? { marker: b.marker } : { entity: b.entity, kind: b.sub };
}
export const BRUSHES = GROUPS.flatMap((g) => g.items);
export const brushById = (id) => BRUSHES.find((b) => b.id === id) || null;
// the brush that paints a given tile char / entity
export function brushForTile(ch) {
  if (ch === "a" || ch === "b") return brushById("pab");
  if (ch === "c" || ch === "d") return brushById("pcd");
  return brushById("t" + ch);
}
export function brushForEntity(e) {
  if (!e) return null;
  if (e.t === "hazard") return brushById("h" + e.kind);
  if (e.t === "pulse") return brushById("u" + e.kind);
  if (e.t === "mover") return brushById("m" + e.kind);
  if (e.t === "deco") return brushById("d" + e.kind);
  return brushById("e" + e.t);
}

// a new entity for brush b at cell (x, y), with friendly defaults
export function makeEntity(b, x, y) {
  const k = b.sub;
  switch (b.entity) {
    case "crumble": return { t: "crumble", x, y, w: 2 };
    case "spring": return { t: "spring", x, y, p: 1 };
    case "mover": return { t: "mover", x, y, w: 3, kind: k, path: [[5, 0]], speed: 2, mode: "ping", phase: 0 };
    case "hazard": {
      const P = { thornball: [[], 0, 0.45], boulder: [[[7, 0]], 3, 0.8], wasp: [[[0, -3]], 2, 0.45], spark: [[[3, 0], [3, -3], [0, -3]], 3, 0.35] }[k] || [[], 0, 0.45];
      return { t: "hazard", x, y, r: P[2], kind: k, path: P[0], speed: P[1] || 2, mode: k === "spark" ? "loop" : "ping", phase: 0 };
    }
    case "pulse": return { t: "pulse", x, y, w: 1, h: k === "lightning" ? 6 : 3, kind: k, period: 180, on: k === "lightning" ? 30 : 60, offset: 0 };
    case "sign": return { t: "sign", x, y, text: "Hello, adventurer!" };
    case "deco": return { t: "deco", x, y, kind: k, s: 1, layer: "back" };
  }
  return null;
}

// hit box in TILE units [x0, y0, x1, y1] (for picking / selecting / erasing)
export function entityBox(e) {
  switch (e.t) {
    case "crumble": return [e.x, e.y, e.x + (e.w || 1), e.y + 1];
    case "mover": return [e.x, e.y - 0.3, e.x + (e.w || 3), e.y + 0.6];
    case "hazard": { const r = Math.max(0.45, e.r || 0.45); return [e.x + 0.5 - r, e.y + 0.5 - r, e.x + 0.5 + r, e.y + 0.5 + r]; }
    case "pulse": return [e.x, e.y, e.x + (e.w || 1), e.y + (e.h || 1)];
    case "deco": { const s = e.s || 1; return [e.x + 0.5 - 0.6 * s, e.y + 1 - 1.4 * s, e.x + 0.5 + 0.6 * s, e.y + 1]; }
    default: return [e.x, e.y, e.x + 1, e.y + 1];
  }
}
// topmost entity under the tile-unit point (fx, fy); decorations lose to gameplay entities
export function hitEntity(entities, fx, fy) {
  let best = -1, bestDeco = -1;
  for (let i = entities.length - 1; i >= 0; i--) {
    const b = entityBox(entities[i]);
    if (fx >= b[0] && fx < b[2] && fy >= b[1] && fy < b[3]) {
      if (entities[i].t === "deco") { if (bestDeco < 0) bestDeco = i; }
      else { best = i; break; }
    }
  }
  return best >= 0 ? best : bestDeco;
}

// inspector fields: [key, label, type, a, b, step]; type int|num|sel|text; "path" = the path editor
export const FIELDS = {
  crumble: [["w", "Width (tiles)", "int", 1, 8, 1]],
  spring: [["p", "Bounce power", "num", 0.6, 1.6, 0.05]],
  mover: [["kind", "Look", "sel", MOVER_KINDS], ["w", "Width (tiles)", "int", 1, 8, 1], ["speed", "Speed (tiles/s)", "num", 0, 12, 0.25],
    ["mode", "Path", "sel", ["ping", "loop"]], ["phase", "Start phase", "num", 0, 1, 0.05], "path"],
  hazard: [["kind", "Kind", "sel", HAZARD_KINDS], ["r", "Radius (tiles)", "num", 0.2, 2, 0.05], ["speed", "Speed (tiles/s)", "num", 0, 12, 0.25],
    ["mode", "Path", "sel", ["ping", "loop"]], ["phase", "Start phase", "num", 0, 1, 0.05], "path"],
  pulse: [["kind", "Kind", "sel", PULSE_KINDS], ["w", "Width (tiles)", "int", 1, 16, 1], ["h", "Height (tiles)", "int", 1, 16, 1],
    ["period", "Cycle (frames)", "int", 30, 900, 5], ["on", "Active (frames)", "int", 1, 899, 1], ["offset", "Offset (frames)", "int", 0, 899, 1]],
  sign: [["text", "Text", "text", 60]],
  deco: [["kind", "Kind", "sel", DECO_KINDS], ["s", "Scale", "num", 0.5, 2, 0.05], ["layer", "Layer", "sel", ["back", "front"]]],
};
export const ENTITY_NAMES = { crumble: "Crumble block", spring: "Mushroom spring", mover: "Moving platform", hazard: "Moving hazard", pulse: "Timed blast", sign: "Sign", deco: "Decoration" };
// keep a field value legal (after the user edits it)
export function clampField(e, key, v) {
  const spec = (FIELDS[e.t] || []).find((f) => Array.isArray(f) && f[0] === key);
  if (!spec) return v;
  const [, , type, a, b] = spec;
  if (type === "int" || type === "num") {
    let n = Number(v); if (!Number.isFinite(n)) n = a;
    if (type === "int") n = Math.round(n);
    let hi = b;
    if (e.t === "pulse" && (key === "on" || key === "offset")) hi = Math.min(b, (e.period || 180) - 1);
    n = Math.max(a, Math.min(hi, n));
    return type === "num" ? Math.round(n * 1000) / 1000 : n;
  }
  if (type === "sel") return a.includes(v) ? v : a[0];
  if (type === "text") return String(v).slice(0, a);
  return v;
}
export function fixPulse(e) {
  if (e.t !== "pulse") return;
  e.on = Math.max(1, Math.min(e.period - 1, e.on));
  e.offset = Math.max(0, Math.min(e.period - 1, e.offset));
}
