// src/games/trollobby/game.js — the Troll Obby. Spec 21 owns this Place.
//
// The one rule that makes it what it is: **no checkpoints.** This Place never calls
// player.setCheckpoint, so every death sends you to the spawn plaza and the whole run
// starts again. Spec 21 §2 grants the exemption from spec 07 §5.4 explicitly; every
// other Place in the repo saves your progress and this one must not, or "a death costs
// the whole run" is not true.
//
// What IS saved: deaths, the furthest section reached, whether you have ever finished,
// and how many unopened crates you are holding. Those are stats and inventory, not
// progress — none of them shortens a run.

import { buildCourse, SECTION_NAMES } from "./scripts/layout.js";
import { createPopups } from "./scripts/popups.js";
import { createHazards } from "./scripts/hazards.js";
import { createBoss, BOSS_HITS } from "./scripts/boss.js";

export const meta = {
  slug: "trollobby",
  name: "Troll Obby",
  icon: "😈",
  description: "Long, hard, and cheating. No checkpoints — one death and you start again.",
  version: "1.0.0",
};

const VANISH_AFTER_S = 0.35;   // spec 21 §3 section 2: how long a platform lasts
const VANISH_BACK_S = 3.0;
const POPUP_TRIGGER_R = 7;     // studs from a trigger point before its popup fires
const HUD_EVERY_S = 0.25;
const SAVE_VERSION = 1;

let course = null;
let popups = null;
let hazards = null;
let boss = null;
let subs = [];
let live = new Map();          // layout part id -> engine part id
let vanishing = [];            // { id, touchedAt, goneAt, backAt, state }
let sectionAt = 0;
let bestSection = 0;
let deaths = 0;
let crates = 0;
let everWon = false;
let runT = 0;
let hudAt = 0;
let popupsFired = null;
let fakeFinishArmed = true;
let floorDropAt = -1;
let facing = [1, 0, 0];
let dead = false;

// ---------------------------------------------------------------------------------

function saveNow(ctx) {
  try {
    ctx.services.saves.save({
      schemaVersion: SAVE_VERSION,
      deaths, bestSection, everWon, crates,
    });
  } catch { /* a full quota is not worth losing the run over */ }
}

function loadSave(ctx) {
  let s = null;
  try { s = ctx.services.saves.load(); } catch { s = null; }
  if (!s || typeof s !== "object") return;
  deaths = Number.isFinite(s.deaths) ? Math.max(0, s.deaths | 0) : 0;
  bestSection = Number.isFinite(s.bestSection) ? Math.max(0, s.bestSection | 0) : 0;
  crates = Number.isFinite(s.crates) ? Math.max(0, s.crates | 0) : 0;
  everWon = !!s.everWon;
}

function hud(ctx) {
  const name = SECTION_NAMES[Math.min(sectionAt, SECTION_NAMES.length - 1)];
  ctx.services.ui.setHudStat("trSection", {
    icon: "😈", label: "Section", value: `${sectionAt + 1}/${SECTION_NAMES.length} — ${name}`,
  });
  ctx.services.ui.setHudStat("trDeaths", { icon: "💀", label: "Oofs this run", value: String(deaths) });
  if (boss && boss.isActive()) {
    ctx.services.ui.setHudStat("trBoss", {
      icon: "👹", label: "Boss", value: `${boss.remaining()}/${BOSS_HITS} hits left`,
    });
  } else {
    ctx.services.ui.removeHudStat("trBoss");
  }
  const cd = hazards ? hazards.blockCooldown() : 0;
  ctx.services.ui.setHudStat("trBlock", {
    icon: "🛡️", label: "Block (E)", value: cd > 0 ? `${cd.toFixed(1)}s` : "ready",
  });
  if (crates > 0) {
    ctx.services.ui.setHudStat("trCrates", { icon: "🎁", label: "Crates", value: String(crates) });
  } else {
    ctx.services.ui.removeHudStat("trCrates");
  }
}

// Restart the whole run. This is the Place's signature move, so it is one function and
// everything that has to be undone is undone here.
function restart(ctx, reason) {
  deaths += 1;
  sectionAt = 0;
  runT = 0;
  fakeFinishArmed = true;
  floorDropAt = -1;
  dead = false;
  popupsFired = new Set();
  if (popups) popups.clear();
  if (hazards) hazards.reset();
  if (boss) { boss.reset(); if (course) boss.restoreTiles(course.bossTiles); }
  restoreAll(ctx);
  ctx.player.respawn();
  saveNow(ctx);
  if (reason) {
    ctx.services.ui.toast(`${reason} — back to the start. No checkpoints, remember?`, { icon: "😈" });
  }
}

function restoreAll(ctx) {
  const parts = ctx.engine.parts;
  for (const v of vanishing) {
    v.state = "solid";
    v.touchedAt = -1;
    const id = live.get(v.id);
    if (!id) continue;
    try { parts.setCanCollide(id, true); } catch { /* gone */ }
    try { parts.setTransparency(id, 0); } catch { /* gone */ }
  }
  for (const layoutId of course.dropFloor) {
    const id = live.get(layoutId);
    if (!id) continue;
    try { parts.setCanCollide(id, true); } catch { /* gone */ }
    try { parts.setTransparency(id, 0); } catch { /* gone */ }
  }
  setBridge(ctx, boss && boss.hasWon());
}

// The three stones behind the boss. Solid only once it is beaten — see the note in
// layout.js about why they are real landables rather than parts that do not exist yet.
function setBridge(ctx, on) {
  for (const layoutId of course.finishBridge) {
    const id = live.get(layoutId);
    if (!id) continue;
    try { ctx.engine.parts.setCanCollide(id, !!on); } catch { /* gone */ }
    try { ctx.engine.parts.setTransparency(id, on ? 0 : 0.8); } catch { /* gone */ }
  }
}

function onFinish(ctx) {
  crates += 1;
  const first = !everWon;
  everWon = true;
  saveNow(ctx);
  if (first) ctx.services.badges.award("winner");
  ctx.engine.audio.playSfx("fanfare");
  ctx.services.ui.toast(
    first ? "TROLL OBBY BEATEN. Badge earned, and a crate." : "Beaten again — another crate.",
    { icon: "🏆", duration: 6 });
  openCrate(ctx);
}

function openCrate(ctx) {
  // The crate panel is platform UI (spec 21 §4) — a Place cannot import it, so it is
  // reached through ctx.services.ui, and the Place keeps the count because the crates
  // are what this Place pays out.
  ctx.services.ui.openCrate({
    getCrates: () => crates,
    takeCrate: () => {
      if (crates <= 0) return false;
      crates -= 1;
      saveNow(ctx);
      return true;
    },
  });
}

// ---------------------------------------------------------------------------------

export function init(ctx) {
  subs = [];
  live = new Map();
  course = buildCourse();
  sectionAt = 0;
  runT = 0;
  hudAt = 0;
  dead = false;
  fakeFinishArmed = true;
  floorDropAt = -1;
  popupsFired = new Set();
  loadSave(ctx);

  const parts = ctx.engine.parts;
  for (const def of course.parts) {
    try { live.set(def.id, parts.create(def)); } catch { /* one bad part is not a dead Place */ }
  }

  vanishing = course.vanish.map((id) => ({ id, state: "solid", touchedAt: -1 }));

  popups = createPopups({ sfx: (n) => ctx.engine.audio.playSfx(n) });
  hazards = createHazards({
    parts,
    sfx: (n) => ctx.engine.audio.playSfx(n),
    onHit: (what) => { if (!dead) { dead = true; ctx.player.kill(what); } },
  });
  hazards.setEmitters(course.emitters.map((e) => ({ ...e, id: live.get(e.id) || e.id })));
  hazards.setChasers(course.chasers);

  boss = createBoss({
    parts,
    hazards,
    sfx: (n) => ctx.engine.audio.playSfx(n),
    toast: (t, o) => ctx.services.ui.toast(t, o),
    onHit: (what) => { if (!dead) { dead = true; ctx.player.kill(what); } },
    onWin: () => {
      setBridge(ctx, true);
      ctx.services.ui.toast("The troll is done. The finish is behind it.", { icon: "🏁", duration: 5 });
    },
  });
  boss.setSpec(
    { ...course.boss, parts: course.boss.parts.map((id) => live.get(id) || id), headId: live.get(course.boss.headId) || course.boss.headId },
    course.bossTiles.map((id) => live.get(id) || id));
  setBridge(ctx, false);

  // Block is the action button. In this Place it ALWAYS blocks, whatever gear is in
  // your hand — spec 21 §3.2. A Place whose core verb depends on your inventory would
  // be unplayable for anyone who had not bought the right thing.
  subs.push(ctx.engine.input.onAction("action1", () => { if (hazards) hazards.block(); }));

  subs.push(ctx.events.on("tr:section", () => {
    // The trigger fires on the section you are ENTERING; they are laid down the course
    // in order, so the count is just how many you have passed.
    sectionAt = Math.min(sectionAt + 1, SECTION_NAMES.length - 1);
    if (sectionAt > bestSection) { bestSection = sectionAt; saveNow(ctx); }
    ctx.services.ui.toast(SECTION_NAMES[sectionAt], { icon: "😈" });
  }));

  subs.push(ctx.events.on("tr:fakefinish", () => {
    if (!fakeFinishArmed) return;
    fakeFinishArmed = false;
    popups.show("win");
    ctx.engine.audio.playSfx("fanfare");
    floorDropAt = runT + 1.1; // just long enough to believe it
  }));

  subs.push(ctx.events.on("tr:boss", () => { if (boss) boss.begin(); }));

  subs.push(ctx.events.on("tr:finish", () => {
    if (!boss || !boss.hasWon()) {
      ctx.services.ui.toast("The troll is still in the way.", { icon: "😈" });
      return;
    }
    onFinish(ctx);
  }));

  subs.push(ctx.events.on("player:died", () => {
    // The engine's own death (the kill plane, a kill part) restarts the run too.
    restart(ctx, "Oof");
  }));

  ctx.services.ui.setHudTitle("Troll Obby");
  ctx.services.ui.toast(
    everWon ? "Back for more? Still no checkpoints." : "No checkpoints. Good luck.",
    { icon: "😈", duration: 5 });
  hud(ctx);
}

export function update(dt, ctx) {
  if (!course) return;
  runT += dt;
  const pos = ctx.player.position();

  // Facing, for the shield cone. Read off the avatar's yaw when there is one, and fall
  // back to the movement direction so a headless run still has a direction.
  const av = ctx.player.avatar;
  if (av && av.rotation) {
    facing = [Math.sin(av.rotation.y), 0, Math.cos(av.rotation.y)];
  } else {
    const v = ctx.player.velocity();
    const l = Math.hypot(v[0], v[2]);
    if (l > 0.5) facing = [v[0] / l, 0, v[2] / l];
  }

  hazards.update(dt, pos, facing);
  boss.update(dt, pos);

  // Vanishing platforms: contact starts the clock, and it does not stop when you leave.
  const contacts = ctx.engine.physics.getContacts();
  const touched = new Set(contacts);
  const parts = ctx.engine.parts;
  for (const v of vanishing) {
    const id = live.get(v.id);
    if (!id) continue;
    if (v.state === "solid" && touched.has(id)) {
      v.state = "going";
      v.touchedAt = runT;
    } else if (v.state === "going" && runT - v.touchedAt >= VANISH_AFTER_S) {
      v.state = "gone";
      try { parts.setCanCollide(id, false); } catch { /* gone */ }
      try { parts.setTransparency(id, 0.75); } catch { /* gone */ }
      ctx.engine.audio.playSfx("pop");
    } else if (v.state === "gone" && runT - v.touchedAt >= VANISH_AFTER_S + VANISH_BACK_S) {
      v.state = "solid";
      try { parts.setCanCollide(id, true); } catch { /* gone */ }
      try { parts.setTransparency(id, 0); } catch { /* gone */ }
    }
  }

  // Popups fire on proximity, once each per run.
  for (let i = 0; i < course.popupTriggers.length; i++) {
    if (popupsFired.has(i)) continue;
    const t = course.popupTriggers[i];
    if (Math.hypot(pos[0] - t.x, pos[2] - t.z) <= POPUP_TRIGGER_R) {
      popupsFired.add(i);
      popups.show(t.kind);
    }
  }
  popups.tick(dt);

  // The fake finish's floor, one beat after the YOU WIN.
  if (floorDropAt > 0 && runT >= floorDropAt) {
    floorDropAt = -1;
    for (const layoutId of course.dropFloor) {
      const id = live.get(layoutId);
      if (!id) continue;
      try { parts.setCanCollide(id, false); } catch { /* gone */ }
      try { parts.setTransparency(id, 0.7); } catch { /* gone */ }
    }
    ctx.engine.audio.playSfx("denied");
    popups.show("error");
  }

  if (runT - hudAt >= HUD_EVERY_S) { hudAt = runT; hud(ctx); }
}

export function dispose(ctx) {
  for (const off of subs) { try { off(); } catch { /* already gone */ } }
  subs = [];
  if (popups) popups.dispose();
  if (hazards) hazards.dispose();
  if (boss) boss.dispose();
  if (ctx && ctx.services && ctx.services.ui) {
    for (const k of ["trSection", "trDeaths", "trBoss", "trBlock", "trCrates"]) {
      ctx.services.ui.removeHudStat(k);
    }
  }
  popups = null;
  hazards = null;
  boss = null;
  course = null;
  live = new Map();
  vanishing = [];
}
