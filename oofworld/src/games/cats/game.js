// src/games/cats/game.js - Find The Cats (spec 28). A port of the owner's finished "find the" game:
// 100 cats in 17 difficulty tiers hidden across 7 zones behind a hub plaza of portals.
//
// Shape of the Place:
//   place.json         the Cat Plaza (static, instanced): floor, fountain, 7 portals, chart wall
//   scripts/hub.js     the plaza's runtime half: the statue and every piece of text
//   scripts/zonekit.js the ONE live zone - built when you walk through a portal, torn down when
//                      you leave (the zone files under scripts/zones/ are written against it)
//   scripts/ui.js      HUD buttons, Index, Difficulty Chart, zone menu, found cinematic, text box
//   scripts/thumbs.js  the software painter behind every cat picture (no second WebGL context)
//   scripts/roster.js  tiers / zones / layout;  scripts/cats.js  names, kinds, lore, hints
//
// Zones are imported DYNAMICALLY and defensively: a zone file that is missing or throws while
// importing is skipped with console.warn, its portal still works (you land on a bare spawn pad
// next to the way home) and its cats show the fallback look in the Index.
//
// Collection is local and honest (ARCHITECTURE §8/§9): your found set is a 100-char bitstring in
// ctx.services.saves; nothing is sent anywhere and no other player is invented or counted.

import { CATS } from "./scripts/cats.js";
import * as R from "./scripts/roster.js";
import { createCatKit } from "./scripts/catkit.js";
import { createZoneKit } from "./scripts/zonekit.js";
import { createThumbs } from "./scripts/thumbs.js";
import { createUi } from "./scripts/ui.js";
import { createHub } from "./scripts/hub.js";

export const meta = {
  slug: "cats",
  name: "Find The Cats",
  icon: "🐱",
  description: "100 cats hide across 7 zones, from Easy to You Have To Be AI To Do This. Find them all and fill your Index.",
  version: "1.0.0",
};

// One loader per zone, written out so every specifier is a literal sibling path (rule 04:V2).
const ZONE_LOADERS = [
  null,
  () => import("./scripts/zones/z1.js"),
  () => import("./scripts/zones/z2.js"),
  () => import("./scripts/zones/z3.js"),
  () => import("./scripts/zones/z4.js"),
  () => import("./scripts/zones/z5.js"),
  () => import("./scripts/zones/z6.js"),
  () => import("./scripts/zones/z7.js"),
];

const SAVE_VERSION = 1;
const TAP_SLOP_PX = 12;
const TAP_MAX_MS = 450;

let G = null;

function blankFound() {
  return "0".repeat(R.TOTAL);
}

function readSave(ctx) {
  let raw = null;
  try { raw = ctx.services.saves.load(); } catch { raw = null; }
  let found = raw && typeof raw.found === "string" ? raw.found.replace(/[^01]/g, "0") : "";
  found = (found + blankFound()).slice(0, R.TOTAL);
  return { v: SAVE_VERSION, found };
}

function writeSave() {
  if (!G) return;
  try {
    G.ctx.services.saves.save({ v: SAVE_VERSION, found: G.found.join("") });
  } catch (err) {
    console.warn("[cats] save failed", err);
  }
}

const has = (n) => !!(G && G.found[n - 1] === "1");
const count = () => (G ? G.count : 0);
const zoneUnlocked = (k) => k >= 1 && k < R.ZONES.length && count() >= R.ZONES[k].unlock;

function recount() {
  G.count = G.found.reduce((a, c) => a + (c === "1" ? 1 : 0), 0);
}

// ---- looks --------------------------------------------------------------------------------------
function lookEntry(n) {
  return G ? G.looks.get(n) || null : null;
}
function getLook(n) {
  const e = lookEntry(n);
  if (!e) return G.K.fallback(n);
  try {
    const g = e.fn(G.K);
    if (g && g.isObject3D && g.userData && g.userData.cat) return g;
    throw new Error("look did not return K.finish(...)");
  } catch (err) {
    console.warn(`[cats] look of cat ${n} failed; using the fallback cat`, err);
    return G.K.fallback(n);
  }
}

function registerZone(k, mod) {
  const looks = mod && mod.looks;
  if (!looks || typeof looks !== "object") return;
  const z = R.ZONES[k];
  for (const key of Object.keys(looks)) {
    const n = Number(key);
    if (!Number.isInteger(n) || n < z.first || n > z.last) {
      console.warn(`[cats] zone ${k} exports a look for cat ${key}, which is not one of its cats`);
      continue;
    }
    const v = looks[key];
    if (typeof v === "function") G.looks.set(n, { fn: v, spin: true });
    else if (v && typeof v.look === "function") G.looks.set(n, { fn: v.look, spin: v.spin !== false });
    G.thumbs.invalidate(n);
  }
}

function loadZones() {
  const mine = G;
  for (let k = 1; k < ZONE_LOADERS.length; k++) {
    mine.zoneState[k] = "loading";
    let p;
    try { p = ZONE_LOADERS[k](); } catch (err) { p = Promise.reject(err); }
    Promise.resolve(p).then((mod) => {
      if (G !== mine) return;
      mine.mods[k] = mod;
      mine.zoneState[k] = "ready";
      try { registerZone(k, mod); } catch (err) { console.warn(`[cats] zone ${k} looks could not be registered`, err); }
    }, (err) => {
      if (G !== mine) return;
      mine.zoneState[k] = "failed";
      console.warn(`[cats] zone ${k} could not be loaded and is skipped:`, err && err.message ? err.message : err);
    });
  }
}

// ---- collection ---------------------------------------------------------------------------------
function award(n, how) {
  if (!G || !Number.isInteger(n) || n < 1 || n > R.TOTAL || has(n)) return false;
  const before = [];
  for (let k = 1; k < R.ZONES.length; k++) before[k] = zoneUnlocked(k);
  G.found[n - 1] = "1";
  recount();
  writeSave();
  const t = R.tierOf(n);
  const reward = R.REWARD[t] || 0;
  if (reward > 0) {
    try { G.ctx.services.economy.award(reward, "cats:find"); } catch (err) { console.warn("[cats] Oofbux award failed", err); }
  }
  for (const b of R.BADGES) {
    if (G.count >= b.at) { try { G.ctx.services.badges.award(b.id); } catch { /* optional */ } }
  }
  G.lastFound = { n, how, t: G.ctx.time };
  G.ui.found(n, reward);
  G.ui.refresh();
  G.hub.refresh();
  G.kit.notifyFound(n);
  for (let k = 1; k < R.ZONES.length; k++) {
    if (!before[k] && zoneUnlocked(k)) {
      try { G.ctx.services.ui.toast(`New zone unlocked: ${R.ZONES[k].name}!`, { icon: "🔓", duration: 4000 }); } catch { /* fine */ }
    }
  }
  return true;
}

// ---- travel -------------------------------------------------------------------------------------
function enterZone(k) {
  if (!G) return false;
  const ctx = G.ctx;
  if (!zoneUnlocked(k)) {
    try { ctx.services.ui.toast(`You need ${R.ZONES[k].unlock} cats to enter ${R.ZONES[k].name} (you have ${count()})`, { icon: "🔒", variant: "error" }); } catch { /* fine */ }
    try { ctx.engine.audio.playSfx("denied"); } catch { /* fine */ }
    return false;
  }
  if (G.zoneState[k] === "loading") {
    G.pendingZone = k;
    try { ctx.services.ui.toast(`Loading ${R.ZONES[k].name}...`, { icon: "⏳" }); } catch { /* fine */ }
    return true;
  }
  G.pendingZone = 0;
  const mod = G.zoneState[k] === "ready" ? G.mods[k] : null;
  const report = G.kit.enter(k, mod);
  G.reports[k] = report;
  const origin = R.zoneOrigin(k);
  const sp = R.ZONE_SPAWN;
  const feet = [origin[0] + sp[0], origin[1] + sp[1], origin[2] + sp[2]];
  ctx.player.setCheckpoint(feet);
  ctx.player.teleport(feet, 90);
  try { ctx.engine.renderer.applyLighting(R.ZONES[k].lighting); } catch { /* fine */ }
  try { ctx.engine.audio.playMusic(R.ZONES[k].music); } catch { /* fine */ }
  try { ctx.engine.audio.playSfx("warp"); } catch { /* fine */ }
  G.ui.setZone(k);
  G.ui.prompt(null);
  const msg = report.ok ? R.ZONES[k].name : `${R.ZONES[k].name} is still under construction`;
  try { ctx.services.ui.toast(msg, { icon: report.ok ? "🐾" : "🚧", duration: 3000 }); } catch { /* fine */ }
  return true;
}

function goHub(fromK) {
  if (!G) return;
  const ctx = G.ctx;
  G.pendingZone = 0;
  const k = fromK || G.kit.current();
  G.kit.leave();
  ctx.player.setCheckpoint(R.HUB_SPAWN.slice());
  if (k) {
    const d = R.portalDir(k);
    ctx.player.teleport([d[0] * R.PORTAL_BACK, 0.6, d[2] * R.PORTAL_BACK], R.yawToward(-d[0], -d[2]));
  } else {
    ctx.player.teleport(R.HUB_SPAWN.slice(), R.HUB_SPAWN_YAW);
  }
  try { ctx.engine.renderer.applyLighting(R.HUB_LIGHTING); } catch { /* fine */ }
  try { ctx.engine.audio.playMusic("plaza"); } catch { /* fine */ }
  G.ui.setZone(0);
  G.ui.prompt(null);
}

function go(k) {
  if (!G) return;
  if (!k) { if (G.kit.current()) goHub(G.kit.current()); else G.ctx.player.teleport(R.HUB_SPAWN.slice(), R.HUB_SPAWN_YAW); return; }
  enterZone(k);
}

function respawn() {
  if (!G) return;
  const k = G.kit.current();
  if (!k) { G.ctx.player.teleport(R.HUB_SPAWN.slice(), R.HUB_SPAWN_YAW); return; }
  const o = R.zoneOrigin(k);
  G.ctx.player.teleport([o[0] + R.ZONE_SPAWN[0], R.ZONE_SPAWN[1], o[2] + R.ZONE_SPAWN[2]], 90);
}

// ---- input --------------------------------------------------------------------------------------
function onPointerDown(ev) {
  // The engine's touch-zone div (joystick area) lies over the lower-left of the canvas even
  // on desktop; a short tap there is still a tap on the world, so it counts too.
  const t = ev.target;
  if (!G || !t || (t.tagName !== "CANVAS" && t.id !== "oof-touch-zone")) { if (G) G.down = null; return; }
  G.down = { x: ev.clientX, y: ev.clientY, t: ev.timeStamp, id: ev.pointerId };
}
function onPointerUp(ev) {
  if (!G || !G.down || G.down.id !== ev.pointerId) return;
  const d = G.down;
  G.down = null;
  if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > TAP_SLOP_PX || ev.timeStamp - d.t > TAP_MAX_MS) return;
  if (G.ui.isOpen()) return;
  if (G.kit.current()) G.kit.tap(ev.clientX, ev.clientY);
  else G.hub.tap(ev.clientX, ev.clientY);
}

// ---- lifecycle -----------------------------------------------------------------------------------
export function init(ctx) {
  const save = readSave(ctx);
  const K = createCatKit(ctx.engine.THREE);
  G = {
    ctx, K, found: save.found.split(""), count: 0, looks: new Map(), mods: [], zoneState: [],
    reports: [], pendingZone: 0, down: null, offs: [], lastFound: null,
    kit: null, hub: null, ui: null, thumbs: null,
  };
  recount();
  G.thumbs = createThumbs(ctx.engine.THREE, K, (n) => getLook(n));
  G.ui = createUi(ctx, {
    CATS, R, thumbs: G.thumbs, has, count, zoneUnlocked,
    currentZone: () => (G ? G.kit.current() : 0),
    go, respawn,
    interact: () => (G ? G.kit.interact() : false),
  });
  G.kit = createZoneKit(ctx, {
    K, has, award, foundCount: count, getLook,
    lookSpins: (n) => { const e = lookEntry(n); return e ? e.spin : true; },
    onLeaveZone: (k) => goHub(k),
    ui: { prompt: (v) => G && G.ui.prompt(v), input: (opts) => G.ui.input(opts) },
  });
  G.hub = createHub(ctx, K, { has, count, zoneUnlocked });

  for (let k = 1; k < R.ZONES.length; k++) {
    G.offs.push(ctx.events.on(`touch:portal${k}`, () => { if (G && !G.kit.current()) enterZone(k); }));
  }
  const input = ctx.engine.input;
  if (input && typeof input.onAction === "function") {
    G.offs.push(input.onAction("action1", () => { if (G) G.kit.interact(); }));
  }
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);

  ctx.services.ui.setHudTitle("🐱 Find The Cats");
  G.ui.refresh();
  loadZones();
}

export function update(dt, ctx) {
  if (!G) return;
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  if (G.pendingZone && G.zoneState[G.pendingZone] !== "loading") enterZone(G.pendingZone);
  try { G.kit.update(step); } catch (err) { console.warn("[cats] zone update", err); }
  try { G.hub.update(step); } catch (err) { console.warn("[cats] hub update", err); }
  try { G.ui.update(step); } catch (err) { console.warn("[cats] ui update", err); }
}

export function dispose(ctx) {
  if (!G) return;
  window.removeEventListener("pointerdown", onPointerDown);
  window.removeEventListener("pointerup", onPointerUp);
  for (const off of G.offs) { try { if (typeof off === "function") off(); } catch { /* fine */ } }
  writeSave();
  try { G.kit.dispose(); } catch (err) { console.warn("[cats] dispose kit", err); }
  try { G.hub.dispose(); } catch (err) { console.warn("[cats] dispose hub", err); }
  try { G.ui.dispose(); } catch (err) { console.warn("[cats] dispose ui", err); }
  try { G.thumbs.dispose(); } catch (err) { console.warn("[cats] dispose thumbs", err); }
  try { G.K.dispose(); } catch (err) { console.warn("[cats] dispose catkit", err); }
  try { ctx.services.ui.removeHudStat("cats"); } catch { /* fine */ }
  G = null;
}

// ---- test seam (spec 28 §10): the smoke scenario imports this module and drives these -------------
export const debug = Object.freeze({
  state() {
    if (!G) return null;
    return {
      count: G.count, found: G.found.join(""), zone: G.kit.current(), zoneState: G.zoneState.slice(1),
      looks: G.looks.size, reports: G.reports.map((r) => (r ? { ok: r.ok, err: r.err, missing: r.missing.slice(), placed: r.placed, parts: r.parts } : null)),
      kit: G.kit.stats(), open: G.ui.isOpen(), popups: G.ui.pendingPopups(), lastFound: G.lastFound,
      parts: G.ctx.engine.parts.count(),
    };
  },
  enter: (k) => enterZone(k),
  hub: () => goHub(),
  award: (n) => award(n, "debug"),
  catInfo: (n) => (G ? G.kit.catInfo(n) : null),
  open: (which, n) => {
    if (!G) return;
    if (which === "index") G.ui.openIndex();
    else if (which === "chart") G.ui.openChart();
    else if (which === "zones") G.ui.openZones();
    else if (which === "detail") G.ui.openDetail(n);
    else G.ui.closeAll();
  },
  z: () => (G ? G.kit.z() : null),
  thumbsOk: () => (G ? G.thumbs.ok() : false),
});
