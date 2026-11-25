// online.js - Adventure Cube's shared levels, best times and player names. API: ONLINE-API.md.
// Built on ../../platyfy-online.js (the site-wide store: private records on the OofWorld relay, no sign-up).
// It is loaded lazily, so the game still boots when that file is missing (a local server rooted at adventure-cube/,
// a test page): every call then resolves { ok: false, reason: "offline" }.
// Every function resolves, never rejects or throws. Failures: { ok: false, reason } with reason one of
//   "offline" | "network" | "invalid" | "big" | "rude" | "taken" | "noname" | "notyours" | "missing".
import { validateLevel, packLevel, unpackLevel, levelHash, LIMITS as LV } from "./sim/level.js";
import { THEMES, MUSIC_IDS } from "./sim/constants.js";
import * as CFG from "./online-config.js";
// the site-wide rude-word filter, loaded lazily like the store (missing -> nothing is filtered, the game still boots)
let rudeFn = null;
const namesP = import(new URL("../../platypus/src/names.js", import.meta.url).href).then((m) => { rudeFn = m && m.isRude; }).catch(() => {});
const isRude = (t) => (rudeFn ? rudeFn(t) : false);

export const COLL = "aclv";                       // the community level collection
export const MAIN_LEVELS = ["area1", "area2", "area3"];
const ID_RE = /^[a-z0-9]{8}$/;
const MS_MIN = 500, MS_MAX = 3 * 3600 * 1000;
const OFF = Object.freeze({ ok: false, offline: true, reason: "offline" });
// plausibility floors: a posted time must be at least FLOOR x the AI rater's winning route (frames at 60 Hz).
// Main areas: tools/routes/areaN.json; community levels: meta.frames stored at publish time.
const AREA_FRAMES = { area1: 3398, area2: 4589, area3: 4787 };
const FLOOR = 0.5, STEP = 1000 / 60;
const MAX_PACKED = 30000;                         // = platyfy-online LIMITS.ITEM_BYTES
const PUBLISH_GAP_MS = 60000;                     // one NEW level per device per minute (updates are free)
const floors = new Map();                          // community id -> AI frames
const runStart = new Map();                        // levelId -> wall clock ms when the run (re)started

let modP = null;
function store() {
  if (!modP) {
    const src = typeof CFG.CUBE_API === "string" ? CFG.CUBE_API : "";
    modP = !src ? Promise.resolve(null) : import(new URL(src, import.meta.url).href)
      .then((m) => (m && typeof m.getTop === "function" ? m : null))
      .catch(() => null);
  }
  return modP;
}
async function call(fn, ...args) {
  try {
    const m = await store();
    if (!m) return OFF;
    const r = await m[fn](...args);
    return r && typeof r === "object" ? r : { ok: false, reason: "network" };
  } catch (e) { return { ok: false, reason: "network" }; }
}
const boardOf = (levelId) => (MAIN_LEVELS.includes(levelId) ? "ac-" + levelId : ID_RE.test(levelId || "") ? COLL + ":" + levelId : "");
// a rating is an integer 1..10 (1 easy, 5 hard, 10 impossible); anything else -> 0 (= not rated)
const clampDiff = (d) => (typeof d === "number" && Number.isFinite(d) && d >= 1 && d <= 10 ? Math.round(d) : 0);

// ---- names (shared with every platyfy game that uses platyfy-online.js; filtered by platypus/src/names.js)
export async function getName() { const m = await store().catch(() => null); try { return m ? m.getName() : ""; } catch (e) { return ""; } }
export async function isClaimed() { const m = await store().catch(() => null); try { return m ? m.isClaimed() : false; } catch (e) { return false; } }
export function setName(name) { return call("setName", name); }
export function claimName(name) { return call("claimName", name); }
export function ping() { return call("ping"); }

// ---- community levels
// every piece of level text other players will read (name, author, signs): rude -> true
function isRudeSafe(t) { try { return isRude(t); } catch (e) { return false; } }
function levelRude(L) {
  try {
    if (L.name && isRude(L.name)) return true;
    if (L.author && isRude(L.author)) return true;
    for (const e of L.entities || []) if (e && e.t === "sign" && ((e.text && isRude(e.text)) || (typeof e.touch === "string" && e.touch && isRude(e.touch)))) return true;
  } catch (e) { /* filter unavailable: let it through */ }
  return false;
}
// the store is writable by anyone: blank rude text on the way down too
function scrubLevel(L) {
  try {
    if (L.name && isRude(L.name)) L.name = "Untitled";
    if (L.author && isRude(L.author)) L.author = "";
    for (const e of L.entities || []) if (e && e.t === "sign") { if (e.text && isRude(e.text)) e.text = "..."; if (typeof e.touch === "string" && e.touch && isRude(e.touch)) e.touch = "..."; }
  } catch (e) { /* ignore */ }
  return L;
}
// -> { ok, levels:[{ id, name, author, difficulty, music, theme, w, h, hash, t, u, mine }], stale? }  newest first
export async function listLevels() {
  await namesP;
  const r = await call("listItems", COLL);
  const items = Array.isArray(r.items) ? r.items : [];
  const levels = items.map((it) => ({
    id: it.id, name: typeof it.name === "string" ? it.name : "Untitled", author: typeof it.author === "string" ? it.author : "",
    difficulty: clampDiff(it.difficulty) || 5, music: MUSIC_IDS.includes(it.music) ? it.music : "area1",
    theme: THEMES.includes(it.theme) ? it.theme : "forest", w: it.w | 0, h: it.h | 0, hash: typeof it.hash === "string" ? it.hash : "",
    t: it.t || 0, u: it.u || 0, mine: !!it.mine,
  }));
  for (const it of items) if (it && ID_RE.test(it.id || "") && it.frames > 0) floors.set(it.id, it.frames | 0);
  for (const lv of levels) { if (lv.name && isRudeSafe(lv.name)) lv.name = "Untitled"; if (lv.author && isRudeSafe(lv.author)) lv.author = ""; }
  return r.ok ? { ok: true, levels } : { ok: false, reason: r.reason || "network", offline: !!r.offline, stale: !!r.stale, levels };
}
// -> { ok, id, level (normalized, ready for compileLevel), meta:{...as listLevels}, mine }
export async function getLevel(id) {
  if (!ID_RE.test(id || "")) return { ok: false, reason: "invalid" };
  await namesP;
  const r = await call("getItem", COLL, id);
  if (!r.ok) return { ok: false, reason: r.reason || "network", offline: !!r.offline };
  try {
    // bound the work before expanding anything (a hostile record must not freeze every viewer)
    const raw = r.item.data;
    if (typeof raw === "string" ? raw.length > MAX_PACKED : JSON.stringify(raw || null).length > MAX_PACKED) return { ok: false, reason: "big" };
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== "object" || (Array.isArray(obj.rle) && obj.rle.length > LV.communityMaxH) || (Array.isArray(obj.tiles) && obj.tiles.length > LV.communityMaxH)) return { ok: false, reason: "invalid" };
    const level = scrubLevel(unpackLevel(obj));
    const v = validateLevel(level, { community: true });
    if (!v.ok) return { ok: false, reason: "invalid", errors: v.errors.slice(0, 5) };
    const m = r.item.meta || {};
    if (m.frames > 0) floors.set(id, m.frames | 0);
    return { ok: true, id, level, mine: !!r.item.mine, stale: !!r.stale,
      meta: { id, name: level.name, author: level.author, difficulty: clampDiff(m.difficulty) || 5, music: level.music, theme: level.theme, w: level.w, h: level.h, hash: m.hash || "", frames: m.frames | 0 } };
  } catch (e) { return { ok: false, reason: "invalid" }; }
}
// publishLevel(level, { name, author, difficulty (1..10, from the AI rater), music, theme, id? })
//   id = one of YOUR published levels: updates it in place (same id, its best times kept). -> { ok, id, updated }
export async function publishLevel(level, meta = {}) {
  try {
    await namesP;
    const diff = clampDiff(meta.difficulty);
    if (!diff) return { ok: false, reason: "invalid", errors: ["difficulty must be 1..10"] };
    const lv = Object.assign({}, level || {});
    if (typeof meta.name === "string" && meta.name.trim()) lv.name = meta.name.trim().slice(0, LV.nameLen);
    if (typeof meta.author === "string") lv.author = meta.author.trim().slice(0, LV.authorLen);
    if (MUSIC_IDS.includes(meta.music)) lv.music = meta.music;
    if (THEMES.includes(meta.theme)) lv.theme = meta.theme;
    const v = validateLevel(lv, { community: true });
    if (!v.ok) return { ok: false, reason: "invalid", errors: v.errors.slice(0, 5) };
    const packed = packLevel(lv);
    const L = unpackLevel(packed);
    if (levelRude(L)) return { ok: false, reason: "rude" };
    const isUpdate = ID_RE.test(meta.id || "");
    const last = lsNum("adventurecube.lastPublish");
    if (!isUpdate && last && Date.now() - last < PUBLISH_GAP_MS && Date.now() >= last) return { ok: false, reason: "slow", wait: Math.ceil((PUBLISH_GAP_MS - (Date.now() - last)) / 1000) };
    const m = { name: L.name, author: L.author, difficulty: diff, music: L.music, theme: L.theme, w: L.w, h: L.h, hash: levelHash(L) };
    if (typeof meta.frames === "number" && meta.frames > 0 && meta.frames < 1e7) m.frames = Math.round(meta.frames);
    const r = await call("putItem", COLL, packed, m, isUpdate ? { id: meta.id } : {});
    if (r.ok) { if (!isUpdate) lsSet("adventurecube.lastPublish", Date.now()); if (m.frames) floors.set(r.id, m.frames); }
    return r.ok ? { ok: true, id: r.id, updated: !!r.updated } : { ok: false, reason: r.reason || "network", offline: !!r.offline };
  } catch (e) { return { ok: false, reason: "invalid" }; }
}
function lsNum(k) { try { return +(localStorage.getItem(k) || 0) || 0; } catch (e) { return 0; } }
function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* ignore */ } }
export function deleteLevel(id) { return ID_RE.test(id || "") ? call("deleteItem", COLL, id) : Promise.resolve({ ok: false, reason: "invalid" }); }

// ---- best times: levelId = "area1" | "area2" | "area3" | a community level id
// submitTime(levelId, ms, name?) -> { ok, rank (0 = not in the top 50), best, improved, queued? }
//   name: optional; when given (and not yet this device's) it is claimed first (may answer "taken" / "rude").
// startRun(levelId): the play screen calls it whenever a run (re)starts; submitTime then also needs that much wall
// clock time to have passed (generous: 1/5 of ms, the debug fast-forward runs up to 4x).
export function startRun(levelId) { if (boardOf(levelId)) runStart.set(levelId, Date.now()); }
// the fastest believable time for a level, ms
export async function minTimeMs(levelId) {
  let f = AREA_FRAMES[levelId] || floors.get(levelId) || 0;
  if (!f && ID_RE.test(levelId || "")) {
    const r = await call("getItem", COLL, levelId);
    f = (r.ok && r.item && r.item.meta && r.item.meta.frames) | 0;
    if (f > 0) floors.set(levelId, f);
  }
  return Math.max(MS_MIN, Math.floor(f * STEP * FLOOR));
}
export async function submitTime(levelId, ms, name) {
  const b = boardOf(levelId);
  if (!b || typeof ms !== "number" || !Number.isFinite(ms) || ms < MS_MIN || ms > MS_MAX) return { ok: false, reason: "invalid" };
  const t0 = runStart.get(levelId);
  if (!t0 || Date.now() - t0 < ms * 0.2) return { ok: false, reason: "implausible" };
  if (ms < (await minTimeMs(levelId))) return { ok: false, reason: "implausible" };
  return call("submitScore", b, Math.round(ms), { lowerIsBetter: true, min: MS_MIN, max: MS_MAX, name: name || undefined });
}
// getTop(levelId, n = 10) -> { ok, rows:[{ rank, name, ms, me }], me:{ rank, ms } | null, stale? }
export async function getTop(levelId, n = 10) {
  const b = boardOf(levelId);
  if (!b) return { ok: false, reason: "invalid", rows: [] };
  const r = await call("getTop", b, n, { lowerIsBetter: true });
  const rows = (Array.isArray(r.rows) ? r.rows : []).map((x) => ({ rank: x.rank | 0, name: String(x.name || ""), ms: x.value | 0, me: !!x.me }));
  const me = r.me ? { rank: r.me.rank | 0, ms: r.me.value | 0 } : null;
  return r.ok ? { ok: true, rows, me } : { ok: false, reason: r.reason || "network", offline: !!r.offline, stale: !!r.stale, rows, me };
}
