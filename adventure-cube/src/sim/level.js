// level.js - the ONE level format (main areas + community levels), validation, packing, compiling. NO DOM.
// Full spec: CONTRACT.md section 4.
import {
  T, TILE_CHARS, charToCode, isFullSolid, isSlope, THEMES, MUSIC_IDS, ENTITY_TYPES,
  HAZARD_KINDS, PULSE_KINDS, MOVER_KINDS, DECO_KINDS,
} from "./constants.js";

export const LEVEL_VERSION = 1;
export const LIMITS = Object.freeze({
  minW: 16, maxW: 1500, minH: 12, maxH: 80, maxEntities: 600, maxCheckpoints: 40,
  // community (builder) levels are smaller so they share quickly and rate in a few seconds
  communityMaxW: 400, communityMaxH: 48, communityMaxEntities: 300, communityMaxCheckpoints: 12,
  maxPathPoints: 8, maxPathOffset: 64, nameLen: 40, authorLen: 24, signLen: 60,
});

const clone = (o) => JSON.parse(JSON.stringify(o));
const num = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);

// A blank, valid level: 3 rows of ground at the bottom, start at the left, goal at the right.
export function emptyLevel(o = {}) {
  const w = o.w || 100, h = o.h || 24;
  const rows = [];
  for (let y = 0; y < h; y++) rows.push((y >= h - 3 ? "#" : ".").repeat(w));
  return {
    v: LEVEL_VERSION, name: o.name || "Untitled", author: o.author || "",
    theme: o.theme || "forest", music: o.music || "area1",
    w, h, tiles: rows,
    start: { x: 3, y: h - 4 }, goal: { x: w - 5, y: h - 4 },
    checkpoints: [], entities: [],
  };
}

// Returns a NEW level with defaults filled in, entity defaults applied, checkpoints sorted by x.
export function normalizeLevel(lv) {
  const L = clone(lv || {});
  L.v = LEVEL_VERSION;
  L.name = typeof L.name === "string" ? L.name : "Untitled";
  L.author = typeof L.author === "string" ? L.author : "";
  L.theme = THEMES.includes(L.theme) ? L.theme : "forest";
  L.music = MUSIC_IDS.includes(L.music) ? L.music : "area1";
  // untrusted input: never expand more than LIMITS.maxH rows (one extra row keeps the level invalid)
  if (!Array.isArray(L.tiles) && Array.isArray(L.rle)) L.tiles = L.rle.slice(0, LIMITS.maxH + 1).map((r) => unRle(typeof r === "string" ? r : ""));
  if (Array.isArray(L.tiles) && L.tiles.length > LIMITS.maxH + 1) L.tiles = L.tiles.slice(0, LIMITS.maxH + 1);
  delete L.rle;
  L.tiles = Array.isArray(L.tiles) ? L.tiles : [];
  L.h = L.tiles.length || L.h || 0;
  L.w = (L.tiles[0] && L.tiles[0].length) || L.w || 0;
  L.checkpoints = (Array.isArray(L.checkpoints) ? L.checkpoints : []).slice().sort((a, b) => a.x - b.x || a.y - b.y);
  L.entities = (Array.isArray(L.entities) ? L.entities : []).map(entityDefaults);
  return L;
}

export function entityDefaults(e) {
  const o = Object.assign({}, e);
  switch (o.t) {
    case "crumble": o.w = num(o.w, 1); break;
    case "spring": o.p = num(o.p, 1); break;
    case "mover": o.w = num(o.w, 3); o.kind = o.kind || "log"; pathDefaults(o); break;
    case "hazard": o.r = num(o.r, 0.45); o.kind = o.kind || "thornball"; pathDefaults(o); break;
    case "pulse": o.w = num(o.w, 1); o.h = num(o.h, 1); o.kind = o.kind || "lightning";
      o.period = num(o.period, 180); o.on = num(o.on, 30); o.offset = num(o.offset, 0); break;
    case "sign": o.text = typeof o.text === "string" ? o.text : ""; break;
    case "deco": o.kind = o.kind || "bush"; o.s = num(o.s, 1); o.layer = o.layer === "front" ? "front" : "back"; break;
  }
  return o;
}
function pathDefaults(o) {
  o.path = Array.isArray(o.path) ? o.path : [];
  o.speed = num(o.speed, 2);
  o.mode = o.mode === "loop" ? "loop" : "ping";
  o.phase = num(o.phase, 0);
}

// validateLevel(level, { community }) -> { ok, errors: string[], warnings: string[] }
// Pass the raw level (it is normalized internally). community:true applies builder limits.
export function validateLevel(lv, opts = {}) {
  const errors = [], warnings = [];
  const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
  if (!lv || typeof lv !== "object") return { ok: false, errors: ["level is not an object"], warnings };
  if (lv.v !== undefined && lv.v !== LEVEL_VERSION) err("unsupported version " + lv.v);
  if (lv.theme !== undefined && !THEMES.includes(lv.theme)) err("unknown theme " + lv.theme);
  if (lv.music !== undefined && !MUSIC_IDS.includes(lv.music)) err("unknown music " + lv.music);
  const L = normalizeLevel(lv);
  const C = !!opts.community;
  const maxW = C ? LIMITS.communityMaxW : LIMITS.maxW, maxH = C ? LIMITS.communityMaxH : LIMITS.maxH;
  if (typeof L.name !== "string" || L.name.length > LIMITS.nameLen) err("name too long");
  if (L.author.length > LIMITS.authorLen) err("author too long");
  if (!(L.w >= LIMITS.minW && L.w <= maxW)) err(`width ${L.w} out of range ${LIMITS.minW}..${maxW}`);
  if (!(L.h >= LIMITS.minH && L.h <= maxH)) err(`height ${L.h} out of range ${LIMITS.minH}..${maxH}`);
  if (lv.w !== undefined && lv.w !== L.w) err(`w=${lv.w} but rows are ${L.w} wide`);
  if (lv.h !== undefined && lv.h !== L.h) err(`h=${lv.h} but there are ${L.h} rows`);
  if (errors.length) return { ok: false, errors, warnings };
  for (let y = 0; y < L.tiles.length; y++) {
    const row = L.tiles[y];
    if (typeof row !== "string") { err(`row ${y} is not a string`); continue; }
    if (row.length !== L.w || row.length > maxW) { err(`row ${y} has length ${row.length}, expected ${L.w}`); continue; }
    for (let x = 0; x < row.length; x++) if (TILE_CHARS.indexOf(row[x]) < 0) { err(`bad tile '${row[x]}' at ${x},${y}`); break; }
  }
  if (errors.length) return { ok: false, errors, warnings };

  const at = (x, y) => (x >= 0 && y >= 0 && x < L.w && y < L.h ? charToCode(L.tiles[y][x]) : 0);
  const inB = (p) => p && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < L.w && p.y < L.h;
  const spot = (p, what) => {
    if (!inB(p)) { err(`${what} missing or out of bounds (integer tile x,y required)`); return; }
    const c = at(p.x, p.y);
    if (isFullSolid(c) || c >= 12) err(`${what} at ${p.x},${p.y} is inside a solid/hazard tile`);
    if (p.y > 0 && isFullSolid(at(p.x, p.y - 1)) && what !== "goal") warn(`${what} at ${p.x},${p.y} has a solid tile right above (player is ~1 tile tall, ok)`);
    let g = false;
    for (let y = p.y + 1; y < Math.min(L.h, p.y + 12); y++) { const k = at(p.x, y); if (isFullSolid(k) || isSlope(k) || k === 5) { g = true; break; } }
    if (!g) warn(`${what} at ${p.x},${p.y} has no ground below within 11 tiles`);
  };
  spot(L.start, "start");
  spot(L.goal, "goal");
  const maxCp = C ? LIMITS.communityMaxCheckpoints : LIMITS.maxCheckpoints;
  if (L.checkpoints.length > maxCp) err(`too many checkpoints (${L.checkpoints.length} > ${maxCp})`);
  L.checkpoints.forEach((p, i) => spot(p, "checkpoint " + i));
  const maxE = C ? LIMITS.communityMaxEntities : LIMITS.maxEntities;
  if (L.entities.length > maxE) err(`too many entities (${L.entities.length} > ${maxE})`);
  const range = (v, a, b) => typeof v === "number" && isFinite(v) && v >= a && v <= b;
  L.entities.forEach((e, i) => {
    const tag = `entity ${i} (${e.t})`;
    if (!ENTITY_TYPES.includes(e.t)) { err(`${tag}: unknown type`); return; }
    if (!range(e.x, 0, L.w) || !range(e.y, 0, L.h)) err(`${tag}: x,y out of bounds`);
    const intXY = () => { if (!Number.isInteger(e.x) || !Number.isInteger(e.y)) err(`${tag}: x,y must be integers`); };
    const path = () => {
      if (!Array.isArray(e.path) || e.path.length > LIMITS.maxPathPoints) err(`${tag}: path must be an array of <= ${LIMITS.maxPathPoints} points`);
      else e.path.forEach((p) => {
        if (!Array.isArray(p) || p.length !== 2 || !range(p[0], -LIMITS.maxPathOffset, LIMITS.maxPathOffset) || !range(p[1], -LIMITS.maxPathOffset, LIMITS.maxPathOffset)) err(`${tag}: bad path point ${JSON.stringify(p)}`);
      });
      if (!range(e.speed, 0, 12)) err(`${tag}: speed must be 0..12 tiles/s`);
      if (!range(e.phase, 0, 1)) err(`${tag}: phase must be 0..1`);
    };
    switch (e.t) {
      case "crumble": intXY(); if (!Number.isInteger(e.w) || !range(e.w, 1, 8)) err(`${tag}: w must be integer 1..8`);
        else for (let k = 0; k < e.w; k++) if (isFullSolid(at(e.x + k, e.y))) warn(`${tag}: overlaps a solid tile`);
        break;
      case "spring": intXY(); if (!range(e.p, 0.6, 1.6)) err(`${tag}: p must be 0.6..1.6`); break;
      case "mover": if (!Number.isInteger(e.w) || !range(e.w, 1, 8)) err(`${tag}: w must be integer 1..8`);
        if (!MOVER_KINDS.includes(e.kind)) err(`${tag}: unknown kind ${e.kind}`); path(); break;
      case "hazard": if (!range(e.r, 0.2, 2)) err(`${tag}: r must be 0.2..2 tiles`);
        if (!HAZARD_KINDS.includes(e.kind)) err(`${tag}: unknown kind ${e.kind}`); path(); break;
      case "pulse": intXY();
        if (!Number.isInteger(e.w) || !Number.isInteger(e.h) || !range(e.w, 1, 16) || !range(e.h, 1, 16)) err(`${tag}: w,h must be integers 1..16`);
        if (!PULSE_KINDS.includes(e.kind)) err(`${tag}: unknown kind ${e.kind}`);
        if (!Number.isInteger(e.period) || !range(e.period, 30, 900)) err(`${tag}: period must be integer 30..900 frames`);
        if (!Number.isInteger(e.on) || !range(e.on, 1, e.period - 1)) err(`${tag}: on must be integer 1..period-1`);
        if (!Number.isInteger(e.offset) || !range(e.offset, 0, e.period - 1)) err(`${tag}: offset must be integer 0..period-1`);
        break;
      case "sign": if (typeof e.text !== "string" || e.text.length > LIMITS.signLen) err(`${tag}: text must be <= ${LIMITS.signLen} chars`);
        if (e.touch !== undefined && (typeof e.touch !== "string" || e.touch.length > LIMITS.signLen)) err(`${tag}: touch text must be <= ${LIMITS.signLen} chars`); break;
      case "deco": if (!DECO_KINDS.includes(e.kind)) err(`${tag}: unknown deco kind ${e.kind}`);
        if (!range(e.s, 0.5, 2)) err(`${tag}: s must be 0.5..2`); break;
    }
  });
  return { ok: errors.length === 0, errors, warnings };
}

// ---- compact sharing format: rows run-length encoded ("40.3#" = 40 '.', then 3 '#'). Tile chars contain no digits.
export function rle(row) {
  let out = "", i = 0;
  while (i < row.length) {
    let j = i; while (j < row.length && row[j] === row[i]) j++;
    const n = j - i; out += (n > 1 ? n : "") + row[i]; i = j;
  }
  return out;
}
// Bounded: a run count longer than 4 digits or a row longer than LIMITS.maxW stops the expansion and returns a row
// that is one tile too long, so validateLevel rejects it (untrusted community data can not blow up memory).
export function unRle(s) {
  const cap = LIMITS.maxW + 1;
  let out = "", n = "";
  for (const ch of String(s)) {
    if (ch >= "0" && ch <= "9") { n += ch; if (n.length > 4) return out + ".".repeat(Math.max(0, cap - out.length)); continue; }
    const k = n ? parseInt(n, 10) : 1; n = "";
    if (out.length + k > cap) return out + ch.repeat(cap - out.length);
    out += ch.repeat(k);
  }
  return out;
}
// packLevel(level) -> string (JSON with rows RLE'd in field `rle` instead of `tiles`).
export function packLevel(lv) {
  const L = normalizeLevel(lv);
  const o = Object.assign({}, L, { rle: L.tiles.map(rle) });
  delete o.tiles;
  return JSON.stringify(o);
}
// unpackLevel(string | object) -> normalized level (accepts packed or plain).
export function unpackLevel(s) {
  const o = typeof s === "string" ? JSON.parse(s) : s;
  return normalizeLevel(o);
}
// Stable 32-bit FNV-1a hash (hex) of the packed level: same level content -> same hash.
export function levelHash(lv) {
  const s = packLevel(lv);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ("0000000" + h.toString(16)).slice(-8);
}

// compileLevel(level) -> immutable runtime data used by the sim, renderer, rater.
export function compileLevel(lv) {
  const level = normalizeLevel(lv);
  const W = level.w, H = level.h;
  const grid = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) { const r = level.tiles[y]; for (let x = 0; x < W; x++) grid[y * W + x] = charToCode(r[x]); }
  const crumbles = [], springs = [], movers = [], hazards = [], pulses = [];
  level.entities.forEach((e, i) => {
    if (e.t === "crumble") crumbles.push({ ei: i, x: e.x * T, y: e.y * T, w: e.w * T });
    else if (e.t === "spring") springs.push({ ei: i, x: e.x * T, y: e.y * T, p: e.p });
    else if (e.t === "mover") movers.push({ ei: i, e, w: e.w * T });
    else if (e.t === "hazard") hazards.push({ ei: i, e, r: e.r * T });
    else if (e.t === "pulse") pulses.push({ ei: i, x: e.x * T, y: e.y * T, w: e.w * T, h: e.h * T, period: e.period, on: e.on, offset: e.offset, kind: e.kind });
  });
  return { level, W, H, grid, crumbles, springs, movers, hazards, pulses };
}
