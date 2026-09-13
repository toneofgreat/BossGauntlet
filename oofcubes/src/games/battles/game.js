// src/games/battles/game.js — Battles. Spec 26 owns this Place.
//
// A lobby of twelve swords and a coliseum to use them in. Ten swords are a KILL
// THRESHOLD, never a cost (save.kills only grows — until a §11 rebirth trades it all
// away); the Cheese Blade is won in the one-stage Obby of Oof (§10) and the Killstreak
// at the end of the arena's buried questline (§11, scripts/quest.js). Combat is the
// platform's honest peer model (ARCHITECTURE §9): you swing and broadcast a hit; the
// TARGET subtracts its own HP and, when it dies, broadcasts who killed it so that
// client can score — a client only ever moves/harms its own avatar. Training dummies
// are local props so the arena is never empty and the game is playable solo.

import {
  buildWorld, FLOOR_TOP, LOBBY_SPAWN, LOBBY_YAW, ARENA_CENTER, ARENA_RADIUS, VOID_Y,
  OBBY_START,
} from "./scripts/layout.js";
import {
  SWORDS, HP_MAX, ABILITY_CD_S, CHEESE_CD_S, CHEESE_SLOW_S, BASE_WALK, BASE_JUMP,
  swordById, isOwned, ownedSwords, INTRO_PAGES,
} from "./scripts/swords.js";
import { createQuest } from "./scripts/quest.js";
import { createBoards, rankRows } from "./scripts/board.js";

export const meta = {
  slug: "battles",
  name: "Battles",
  icon: "⚔️",
  description: "Lobby, sword, arena. Kills unlock blades up to the one-shot Meteorbrand — and two swords no kill can buy.",
  version: "1.1.0",
};

const SAVE_V = 2;
const SWING_CD = 0.5;
// §5 (amended): melee reach was 7 — far enough to hit things you were nowhere near.
// 4.75 studs, and only inside a forward cone (dot > 0.25 ≈ ±75°), reads as "my sword
// actually touched them".
const MELEE_R = 4.75;
const MELEE_DOT = 0.25;
const DUMMY_HP = 5;
const DUMMY_RESPAWN = 5;
const PUBLISH_EVERY = 0.4;
const SPIN_SPEED = 0.5;   // rad/s — the display swords turn on their pedestals
const BUSH_LIFE = 20;     // §: a thorn bush wilts after 20s
const BUSH_DMG = 10;      // §: 10 damage to anyone near it (once a second)
const BUSH_R = 5.5;
const GRAVITY_DEFAULT = 196.2; // spec 03's tuning table — restored whenever fly ends
const KS_TP_CD = 12;      // §11: killstreak teleport cooldown
const KS_GR_CD = 22;      // §11: killstreak grenade cooldown
const KS_TIERS = Object.freeze([10, 50, 100, 250]); // teleport / grenade / fly / claim
const BOARD_TICK_S = 3;
const GLOBAL_FETCH_S = 60;
const GLOBAL_SUBMIT_S = 30;

let S = null;
let dom = null;

function fresh() {
  return {
    save: null, world: null,
    inArena: false, hp: HP_MAX, equipped: "basic",
    swingCd: 0, abilityCd: 0, runT: 0, pubT: 0, hudT: 0, spinT: 0,
    poison: null,                 // {left, t} — venom on ME
    cheesedT: 0,                  // seconds of cheese-slow left on ME
    cheeseArm: false,             // ⚡ pressed, waiting for the target tap
    cheeses: [],                  // flying cheese shots {from,to,t,target,dummy}
    grenades: [],                 // {x,y,z,dx,dz,vy,t,id}
    ksCd: { tp: 0, gr: 0 },
    flying: false,
    dummies: [],                  // {parts:[ids], x, z, hp, dead, respawnT}
    bushes: [],                   // {parts:[ids], x, z, t, dmgT} — thorn hazards
    vfx: [],                      // {ids:[...], t} transient parts
    meteors: [],                  // {id, x, z, y, dx, dz, t, trailT}
    labels: [], rootId: null,
    hitSeq: 0, deathSeq: 0, aoeSeq: 0, cheeseSeq: 0, idSeq: 0,
    myState: { inArena: false, hp: HP_MAX, kills: 0, sword: "basic", hit: null, death: null, aoe: null, cheese: null, cheesed: false, tk: 0, sw: 1, streak: 0 },
    seenHit: new Set(), seenDeath: new Set(), seenAoe: new Set(), seenCheese: new Set(),
    lastAttacker: null,
    panelOpen: false,
    quest: null, boards: null, boardT: 0,
    gRows: null,                  // {kills:[rows], swords:[rows]} from the server, or null
    gFetchT: -1e9, gSubmitT: -1e9, gSentTk: -1, gSentSw: -1,
    attachT: 0,
    heldSwords: new Map(),        // rig root uuid -> {swordId, group, anchor}
    shells: new Map(),            // rig root uuid -> group (the yellow cheese coat)
    timers: [],                   // {t, fn} — sim-clock delays (no setTimeout in games)
  };
}

// ---- save ----------------------------------------------------------------------------
function freshQuest() { return { c1: false, c2: false, b1: false, b2: false, dec: false, stars: false, rocket: false }; }
function loadSave(ctx) {
  let s = null;
  try { s = ctx.services.saves.load(); } catch { s = null; }
  const d = {
    schemaVersion: SAVE_V, kills: 0, totalKills: 0, equipped: "basic", seenIntro: false,
    cheese: false, ks: false, streak: 0, bestStreak: 0, ksClaimed: false, rebirths: 0,
    quest: freshQuest(),
  };
  if (s && typeof s === "object") {
    if (Number.isFinite(s.kills)) d.kills = Math.max(0, Math.floor(s.kills));
    // v1 -> v2: lifetime kills did not exist; the unlock currency IS the lifetime so far
    d.totalKills = Number.isFinite(s.totalKills) ? Math.max(d.kills, Math.floor(s.totalKills)) : d.kills;
    if (typeof s.equipped === "string" && swordById(s.equipped).id === s.equipped) d.equipped = s.equipped;
    d.seenIntro = !!s.seenIntro;
    d.cheese = !!s.cheese; d.ks = !!s.ks; d.ksClaimed = !!s.ksClaimed;
    if (Number.isFinite(s.streak)) d.streak = Math.max(0, Math.floor(s.streak));
    if (Number.isFinite(s.bestStreak)) d.bestStreak = Math.max(d.streak, Math.floor(s.bestStreak));
    if (Number.isFinite(s.rebirths)) d.rebirths = Math.max(0, Math.floor(s.rebirths));
    if (s.quest && typeof s.quest === "object") for (const k of Object.keys(d.quest)) d.quest[k] = !!s.quest[k];
  }
  if (!isOwned(d.equipped, d)) d.equipped = "basic";
  return d;
}
function saveNow(ctx) {
  try {
    const s = S.save;
    ctx.services.saves.save({
      schemaVersion: SAVE_V, kills: s.kills, totalKills: s.totalKills, equipped: s.equipped,
      seenIntro: s.seenIntro, cheese: s.cheese, ks: s.ks, streak: s.streak,
      bestStreak: s.bestStreak, ksClaimed: s.ksClaimed, rebirths: s.rebirths, quest: { ...s.quest },
    });
  } catch { /* fine */ }
}
function own(id) { return isOwned(id, S.save); }
function later(t, fn) { S.timers.push({ t, fn }); }

// ---- little DOM helpers --------------------------------------------------------------
function btn(label, style) {
  const b = document.createElement("button");
  b.type = "button"; b.textContent = label;
  b.style.cssText = "font:700 15px system-ui,sans-serif;color:#fff;border:none;border-radius:12px;padding:12px 16px;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.35);touch-action:manipulation;user-select:none;" + (style || "");
  return b;
}
function uid(pfx) { return pfx + (S.idSeq++); } // monotonic — never collides
function sfx(ctx, name) { try { ctx.engine.audio.playSfx(name); } catch { /* optional */ } }
function toast(ctx, t, icon, dur) { try { ctx.services.ui.toast(t, { icon, duration: dur || 2600 }); } catch { /* headless */ } }

function buildDom(ctx) {
  const hpWrap = document.createElement("div");
  hpWrap.style.cssText = "position:fixed;left:50%;top:64px;transform:translateX(-50%);width:280px;max-width:60vw;height:22px;background:#1a1226cc;border:2px solid #000;border-radius:12px;overflow:hidden;z-index:54;display:none;";
  const hpFill = document.createElement("div");
  hpFill.style.cssText = "height:100%;width:100%;background:linear-gradient(90deg,#3ddc84,#8be04a);transition:width .12s;";
  const hpText = document.createElement("div");
  hpText.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 13px system-ui;color:#fff;text-shadow:0 1px 2px #000;";
  hpText.textContent = "100 / 100"; hpWrap.append(hpFill, hpText);

  const atkBtn = btn("⚔️ Swing", "position:fixed;right:16px;bottom:120px;z-index:55;background:linear-gradient(180deg,#c0392b,#7d1f16);font-size:18px;padding:16px 22px;display:none;");
  atkBtn.addEventListener("click", () => swing(ctx));
  const abBtn = btn("⚡", "position:fixed;right:16px;bottom:196px;z-index:55;background:linear-gradient(180deg,#7c3aed,#4c1d95);font-size:20px;width:74px;display:none;");
  abBtn.addEventListener("click", () => useAbility(ctx));
  // §11: the Killstreak's earned row — teleport, grenade, fly, and the 250-streak claim
  const tpBtn = btn("🌀", "position:fixed;right:16px;bottom:196px;z-index:55;background:linear-gradient(180deg,#2f6fd0,#1a3a6e);font-size:20px;width:74px;display:none;");
  tpBtn.addEventListener("click", () => ksTeleport(ctx));
  const grBtn = btn("💣", "position:fixed;right:16px;bottom:272px;z-index:55;background:linear-gradient(180deg,#c0392b,#7d1f16);font-size:20px;width:74px;display:none;");
  grBtn.addEventListener("click", () => ksGrenade(ctx));
  const flyBtn = btn("🕊️", "position:fixed;right:16px;bottom:348px;z-index:55;background:linear-gradient(180deg,#35a3e0,#1a5a7e);font-size:20px;width:74px;display:none;");
  flyBtn.addEventListener("click", () => ksFly(ctx));
  const claimBtn = btn("👑 CLAIM", "position:fixed;right:16px;bottom:424px;z-index:55;background:linear-gradient(180deg,#e0b23a,#8c6a1f);font-size:15px;display:none;");
  claimBtn.addEventListener("click", () => ksClaim(ctx));
  // the cheese-targeting layer: invisible until ⚡ arms it, then one tap picks a victim
  const aimLayer = document.createElement("div");
  aimLayer.style.cssText = "position:fixed;inset:0;z-index:60;display:none;touch-action:manipulation;";
  const aimHint = document.createElement("div");
  aimHint.style.cssText = "position:absolute;left:50%;top:18%;transform:translateX(-50%);font:800 17px system-ui;color:#ffd23a;text-shadow:0 2px 4px #000;background:#1a1226cc;border-radius:12px;padding:10px 16px;pointer-events:none;";
  aimHint.textContent = "🧀 TAP A FIGHTER";
  const aimCancel = btn("✖ never mind", "position:absolute;left:50%;bottom:12%;transform:translateX(-50%);background:#565d70;");
  aimCancel.addEventListener("click", (e) => { e.stopPropagation(); disarmCheese(); });
  aimLayer.append(aimHint, aimCancel);
  aimLayer.addEventListener("pointerdown", (e) => cheeseTap(ctx, e));

  document.body.append(hpWrap, atkBtn, abBtn, tpBtn, grBtn, flyBtn, claimBtn, aimLayer);
  return { hpWrap, hpFill, hpText, atkBtn, abBtn, tpBtn, grBtn, flyBtn, claimBtn, aimLayer };
}

// ---- a reusable paged panel (intro tips, every sword's story, the hermit's book) -----
function pagedPanel(ctx, title, pages, opts = {}) {
  if (S.panelOpen) return;
  S.panelOpen = true;
  const panel = ctx.services.ui.openPanel({ title, onClose: () => { S.panelOpen = false; } });
  const body = panel.bodyEl || panel.el;
  let i = 0;
  const heading = document.createElement("h3"); heading.style.cssText = "margin:2px 0 8px;font:800 19px system-ui;color:#ffe6a0;";
  const text = document.createElement("p"); text.style.cssText = "margin:0 0 14px;font:400 15px/1.5 system-ui;color:#e8e0f0;min-height:120px;";
  const nav = document.createElement("div"); nav.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;";
  const left = btn("◀", "background:#3a2740;width:56px;font-size:20px;");
  const count = document.createElement("span"); count.style.cssText = "font:700 14px system-ui;color:#c9b8e0;";
  const right = btn("▶", "background:#3a2740;width:56px;font-size:20px;");
  nav.append(left, count, right);
  const foot = document.createElement("div"); foot.style.cssText = "display:flex;gap:10px;margin-top:14px;";
  const done = btn(opts.doneLabel || "Close", "background:#565d70;flex:1;");
  done.addEventListener("click", () => { sfx(ctx, "ui_close"); panel.close(); if (opts.onDone) opts.onDone(); });
  foot.append(done);
  if (opts.actionLabel) {
    const act = btn(opts.actionLabel, "background:linear-gradient(180deg,#c0392b,#7d1f16);flex:1.4;");
    act.addEventListener("click", () => { sfx(ctx, "click"); panel.close(); if (opts.onAction) opts.onAction(); });
    foot.append(act);
  }
  function render() {
    const p = pages[i];
    heading.textContent = p.heading || "";
    text.textContent = p.body || "";
    count.textContent = `${i + 1} / ${pages.length}`;
    left.style.opacity = i === 0 ? "0.4" : "1";
    right.style.opacity = i === pages.length - 1 ? "0.4" : "1";
  }
  left.addEventListener("click", () => { if (i > 0) { i--; sfx(ctx, "click"); render(); } });
  right.addEventListener("click", () => { if (i < pages.length - 1) { i++; sfx(ctx, "click"); render(); } });
  body.append(heading, text, nav, foot);
  render();
}

// ---- world labels over the pedestals -------------------------------------------------
function makeLabel(ctx, text, color) {
  const THREE = ctx.engine.THREE;
  const c = document.createElement("canvas"); c.width = 340; c.height = 150;
  const g = c.getContext("2d");
  const entry = { sprite: null, tex: null, mat: null, g, c, text: null, color: null };
  const paint = (txt, col) => {
    g.clearRect(0, 0, 340, 150);
    g.fillStyle = "rgba(20,14,30,0.72)"; roundRect(g, 6, 6, 328, 138, 16); g.fill();
    g.strokeStyle = col; g.lineWidth = 4; roundRect(g, 6, 6, 328, 138, 16); g.stroke();
    g.fillStyle = col; g.textAlign = "center";
    const lines = txt.split("\n");
    g.font = "800 30px system-ui,sans-serif"; g.fillText(lines[0], 170, 44);
    g.font = "600 22px system-ui,sans-serif"; g.fillStyle = "#e8e0f0";
    for (let k = 1; k < lines.length; k++) g.fillText(lines[k], 170, 44 + k * 30);
  };
  paint(text, color);
  const tex = new THREE.CanvasTexture(c); if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat); sprite.scale.set(6.8, 3.0, 1); sprite.renderOrder = 999;
  entry.sprite = sprite; entry.tex = tex; entry.mat = mat; entry.text = text; entry.color = color; entry.paint = paint;
  return entry;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function labelText(sw) {
  if (sw.id === "killstreak" && !own("killstreak")) return "❓ ???\nthe plaque is\nscratched out";
  const cost = sw.cost === null ? (sw.id === "cheese" ? "WIN THE OBBY" : "???") : sw.cost === 0 ? "FREE" : sw.cost + " kills";
  const ab = sw.ability ? " • ⚡ ability" : (sw.passive ? " • buff" : "");
  const dmg = sw.id === "killstreak" ? "1+streak dmg" : `${sw.damage} dmg`;
  return `${sw.emoji} ${sw.name}\n${cost} • ${dmg}${ab}`;
}
function refreshLabels(ctx) {
  for (let i = 0; i < S.labels.length; i++) {
    const sw = SWORDS[i], owned = own(sw.id);
    const col = owned ? "#3ddc84" : sw.id === "killstreak" ? "#ff5a3a" : "#e0b23a";
    let txt = labelText(sw);
    if (owned) txt += "\n✅ owned";
    else if (sw.cost !== null) txt += `\n🔒 you have ${S.save.kills}`;
    const L = S.labels[i];
    if (L.text !== txt || L.color !== col) { L.paint(txt, col); L.tex.needsUpdate = true; L.text = txt; L.color = col; }
  }
}

// ---- dummies -------------------------------------------------------------------------
function buildDummyParts(ctx, x, z) {
  const parts = [];
  const push = (def) => { try { const id = uid("bt_dummy_"); ctx.engine.parts.create({ id, canCollide: false, ...def }); parts.push(id); } catch { /* fine */ } };
  push({ shape: "cylinder", size: [1.8, 0.5, 1.8], position: [x, FLOOR_TOP + 0.25, z], color: "#5a3a1a", material: "wood" });     // base
  push({ shape: "cylinder", size: [0.6, 3.4, 0.6], position: [x, FLOOR_TOP + 1.7, z], color: "#6b4423", material: "wood" });     // post
  push({ shape: "box", size: [3.2, 0.4, 0.4], position: [x, FLOOR_TOP + 3.2, z], color: "#6b4423", material: "wood" });          // cross-arm
  push({ shape: "sphere", size: [1.7, 2.1, 1.5], position: [x, FLOOR_TOP + 3.0, z], color: "#d9c48f", material: "plastic" });    // straw body
  for (let i = 0; i < 4; i++) { const a = i * 1.57; push({ shape: "sphere", size: [0.5, 0.9, 0.5], position: [x + Math.cos(a) * 0.7, FLOOR_TOP + 2.0 + (i % 2) * 0.4, z + Math.sin(a) * 0.7], color: "#c9b48f", material: "plastic" }); } // straw tufts
  push({ shape: "box", size: [1.7, 0.42, 1.6], position: [x, FLOOR_TOP + 3.1, z], color: "#c0392b", material: "neon" });         // target ring
  push({ shape: "box", size: [1.2, 0.3, 1.1], position: [x, FLOOR_TOP + 3.1, z], color: "#f5f5f5", material: "plastic" });       // target centre
  for (const sx of [-1, 1]) push({ shape: "sphere", size: [0.6, 0.6, 0.6], position: [x + sx * 1.5, FLOOR_TOP + 3.2, z], color: "#c9b48f", material: "plastic" }); // hands
  push({ shape: "sphere", size: [1.0, 1.0, 1.0], position: [x, FLOOR_TOP + 4.6, z], color: "#e0cfa0", material: "plastic" });    // head
  for (const sx of [-1, 1]) push({ shape: "sphere", size: [0.16, 0.16, 0.16], position: [x + sx * 0.28, FLOOR_TOP + 4.7, z - 0.42], color: "#12141c", material: "plastic" }); // eyes
  push({ shape: "box", size: [0.4, 0.1, 0.1], position: [x, FLOOR_TOP + 4.35, z - 0.44], color: "#12141c", material: "plastic" }); // mouth
  return parts;
}
function spawnDummy(ctx, x, z, temp) {
  S.dummies.push({ parts: buildDummyParts(ctx, x, z), x, z, hp: DUMMY_HP, dead: false, respawnT: 0, temp: !!temp });
}
function hitDummy(ctx, d, dmg) {
  d.hp -= dmg;
  for (const id of d.parts) { try { ctx.engine.parts.setColor(id, "#ff5a3a"); } catch { /* gone */ } }
  if (d.hp <= 0) {
    for (const id of d.parts) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
    d.dead = true; d.respawnT = d.temp ? 999 : DUMMY_RESPAWN; d.parts = [];
    scoreKill(ctx, "a dummy");
  }
}

// ---- combat: swing, abilities, incoming ----------------------------------------------
function facing(ctx) {
  const a = ctx.player.avatar;
  const yaw = a ? a.rotation.y : 0;
  return [Math.sin(yaw), Math.cos(yaw)];
}
function swingDamage() {
  const sw = swordById(S.equipped);
  return sw.id === "killstreak" ? 1 + S.save.streak : sw.damage;
}
// In reach = inside MELEE_R AND roughly in front (the old check hit things behind you).
function inReach(me, fx, fz, tx, tz) {
  const dx = tx - me[0], dz = tz - me[2];
  const dd = dx * dx + dz * dz;
  if (dd > MELEE_R * MELEE_R) return -1;
  const len = Math.sqrt(dd) || 1;
  if ((dx * fx + dz * fz) / len < MELEE_DOT) return -1;
  return dd;
}
function swing(ctx) {
  if (!S.inArena || S.swingCd > 0) return;
  S.swingCd = SWING_CD;
  const sw = swordById(S.equipped);
  slashVfx(ctx);
  sfx(ctx, "whoosh");
  const me = ctx.player.position();
  const [fx, fz] = facing(ctx);
  let bestD = null, bd = Infinity;
  for (const d of S.dummies) { if (d.dead) continue; const dd = inReach(me, fx, fz, d.x, d.z); if (dd >= 0 && dd < bd) { bd = dd; bestD = d; } }
  let bestP = null, bp = Infinity;
  const roster = rosterSafe(ctx);
  for (const p of roster) { if (!p.pos) continue; const dd = inReach(me, fx, fz, p.pos[0], p.pos[2]); if (dd >= 0 && dd < bp) { bp = dd; bestP = p; } }
  if (bestP && (!bestD || bp <= bd)) {
    S.hitSeq++;
    S.myState.hit = { id: S.hitSeq, target: bestP.id, dmg: swingDamage(), poison: sw.passive && sw.passive.poison ? 1 : 0 };
    publishSoon();
    sfx(ctx, "oof");
  } else if (bestD) {
    hitDummy(ctx, bestD, swingDamage());
  }
}
function slashVfx(ctx) {
  const me = ctx.player.position(); const [fx, fz] = facing(ctx);
  const sw = swordById(S.equipped);
  const ids = [];
  for (let k = 0; k < 3; k++) {
    const t = (k - 1) * 0.5;
    try {
      const id = uid("bt_slash_");
      ctx.engine.parts.create({ id, shape: "box", size: [2.6, 0.14, 0.5], position: [me[0] + fx * 3 + fz * t, me[1] + 3, me[2] + fz * 3 - fx * t], rotation: [0, Math.atan2(fx, fz) * 180 / Math.PI, 30 * (k - 1)], color: sw.colors.edge, material: "neon", canCollide: false });
      ids.push(id);
    } catch { /* fine */ }
  }
  S.vfx.push({ ids, t: 0.16 });
}

function abilityCooldownFor(sw) { return sw.ability === "cheese" ? CHEESE_CD_S : ABILITY_CD_S; }
function useAbility(ctx) {
  if (!S.inArena) return;
  const sw = swordById(S.equipped);
  if (!sw.ability || sw.ability === "streak") { toast(ctx, "This sword has no ability.", "⚡", 1600); return; }
  if (S.abilityCd > 0) { toast(ctx, `Ability recharging — ${Math.ceil(S.abilityCd)}s`, "⚡", 1600); return; }
  const me = ctx.player.position();
  if (sw.ability === "cheese") {
    // §10: arm the splat — the NEXT tap picks the victim; cooldown starts on the throw
    S.cheeseArm = true;
    if (dom) dom.aimLayer.style.display = "block";
    toast(ctx, "Cheese armed. Tap a fighter (or a dummy).", "🧀", 2400);
    return;
  }
  if (sw.ability === "spikes") {
    const R = 12; const ids = [];
    try { const id = uid("bt_dust_"); ctx.engine.parts.create({ id, shape: "cylinder", size: [R * 2, 0.4, R * 2], position: [me[0], me[1] - 1.2, me[2]], color: "#b09a68", material: "plastic", canCollide: false }); ids.push(id); } catch { /* fine */ }
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2, r = 3 + (i % 3) * 3.4, h = 3.2 + (i % 3) * 0.8;
      try { const id = uid("bt_spike_"); ctx.engine.parts.create({ id, shape: "wedge", size: [0.9, h, 0.9], position: [me[0] + Math.cos(a) * r, me[1] + h / 2 - 1.4, me[2] + Math.sin(a) * r], rotation: [0, a * 57, 0], color: i % 2 ? "#3e444f" : "#565d70", material: "metal", canCollide: false }); ids.push(id); } catch { /* fine */ }
      try { const id = uid("bt_spike_"); ctx.engine.parts.create({ id, shape: "wedge", size: [0.4, 1.0, 0.4], position: [me[0] + Math.cos(a) * r, me[1] + h - 1.4, me[2] + Math.sin(a) * r], rotation: [0, a * 57, 0], color: "#c7cdd9", material: "metal", canCollide: false }); ids.push(id); } catch { /* fine */ }
    }
    S.vfx.push({ ids, t: 1.0 });
    S.aoeSeq++; S.myState.aoe = { id: S.aoeSeq, x: me[0], z: me[2], r: R, dmg: 10 }; publishSoon();
    for (const d of S.dummies) { if (!d.dead && (d.x - me[0]) ** 2 + (d.z - me[2]) ** 2 <= R * R) hitDummy(ctx, d, 10); }
    sfx(ctx, "boing"); toast(ctx, "Spikes erupt! 10 damage each.", "🔨", 1800);
  } else if (sw.ability === "meteor") {
    const [fx, fz] = facing(ctx);
    const sx = me[0] + fx * 3, sz = me[2] + fz * 3, sy = me[1] + 12;
    try { const id = uid("bt_meteor_"); ctx.engine.parts.create({ id, shape: "sphere", size: [2.0, 2.0, 2.0], position: [sx, sy, sz], color: "#3a2418", material: "lava", canCollide: false }); S.meteors.push({ id, x: sx, y: sy, z: sz, dx: fx, dz: fz, t: 0, trailT: 0 }); } catch { /* fine */ }
    try { const id = uid("bt_meteor_"); ctx.engine.parts.create({ id, shape: "sphere", size: [2.6, 2.6, 2.6], position: [sx, sy, sz], color: "#ff8c1a", material: "neon", canCollide: false }); S.meteors[S.meteors.length - 1].glow = id; } catch { /* fine */ }
    sfx(ctx, "warp"); toast(ctx, "Meteor away — make it count!", "☄️", 1800);
  } else if (sw.ability === "dummies") {
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; spawnDummy(ctx, me[0] + Math.cos(a) * 5, me[2] + Math.sin(a) * 5, true); }
    sfx(ctx, "sparkle"); toast(ctx, "Training dummies conjured — cut them down!", "🎯", 1800);
  } else if (sw.ability === "bush") {
    spawnBush(ctx, me[0], me[2]);
    sfx(ctx, "sparkle"); toast(ctx, "A thorn bush bursts up — 10 damage to anyone near it!", "🌹", 2000);
  }
  S.abilityCd = abilityCooldownFor(sw);
  refreshAbilityBtn();
}

// ---- the cheese splat (§10): tap-to-target through camera.worldToScreen -------------
function disarmCheese() { S.cheeseArm = false; if (dom) dom.aimLayer.style.display = "none"; }
function cheeseTap(ctx, e) {
  if (!S.cheeseArm) return;
  const px = e.clientX, py = e.clientY;
  const w2s = (pos) => { try { return ctx.engine.camera.worldToScreen(pos); } catch { return null; } };
  let best = null, bd = 70 * 70; // within 70 CSS px of the tap
  for (const p of rosterSafe(ctx)) {
    if (!p.pos || !(p.state && p.state.inArena)) continue;
    const s = w2s([p.pos[0], p.pos[1] + 2.5, p.pos[2]]);
    if (!s) continue;
    const dd = (s[0] - px) ** 2 + (s[1] - py) ** 2;
    if (dd < bd) { bd = dd; best = { kind: "peer", peer: p, pos: [p.pos[0], p.pos[1] + 2.5, p.pos[2]] }; }
  }
  for (const d of S.dummies) {
    if (d.dead) continue;
    const s = w2s([d.x, FLOOR_TOP + 3, d.z]);
    if (!s) continue;
    const dd = (s[0] - px) ** 2 + (s[1] - py) ** 2;
    if (dd < bd) { bd = dd; best = { kind: "dummy", dummy: d, pos: [d.x, FLOOR_TOP + 3, d.z] }; }
  }
  if (!best) { sfx(ctx, "denied"); return; }
  disarmCheese();
  S.abilityCd = CHEESE_CD_S;
  refreshAbilityBtn();
  const me = ctx.player.position();
  S.cheeses.push({ from: [me[0], me[1] + 3, me[2]], to: best.pos, t: 0, dur: 0.35, target: best.kind === "peer" ? best.peer.id : null, dummy: best.kind === "dummy" ? best.dummy : null, ids: [] });
  sfx(ctx, "whoosh");
  toast(ctx, "CHEESE AWAY!", "🧀", 1400);
}
function stepCheeses(ctx, dt) {
  for (let i = S.cheeses.length - 1; i >= 0; i--) {
    const c = S.cheeses[i]; c.t += dt;
    const k = Math.min(1, c.t / c.dur);
    const x = c.from[0] + (c.to[0] - c.from[0]) * k;
    const y = c.from[1] + (c.to[1] - c.from[1]) * k + Math.sin(k * Math.PI) * 3;
    const z = c.from[2] + (c.to[2] - c.from[2]) * k;
    if (!c.ids.length) {
      try { const id = uid("bt_cheese_"); ctx.engine.parts.create({ id, shape: "sphere", size: [1.1, 1.1, 1.1], position: [x, y, z], color: "#ffd23a", material: "neon", canCollide: false }); c.ids.push(id); } catch { /* fine */ }
    } else {
      try { ctx.engine.parts.setPosition(c.ids[0], [x, y, z]); } catch { /* gone */ }
    }
    if (k >= 1) {
      for (const id of c.ids) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
      // the splat: a burst of yellow
      const ex = [];
      for (let s = 0; s < 8; s++) { const a = s * 0.785; try { const id = uid("bt_splat_"); ctx.engine.parts.create({ id, shape: "sphere", size: [0.6, 0.6, 0.6], position: [c.to[0] + Math.cos(a) * 1.2, c.to[1] + (s % 3) * 0.5 - 0.5, c.to[2] + Math.sin(a) * 1.2], color: s % 2 ? "#ffd23a" : "#e8b62a", material: "neon", canCollide: false }); ex.push(id); } catch { /* fine */ } }
      S.vfx.push({ ids: ex, t: 0.7 });
      sfx(ctx, "pop");
      if (c.target) { S.cheeseSeq++; S.myState.cheese = { id: S.cheeseSeq, target: c.target }; publishSoon(); }
      if (c.dummy && !c.dummy.dead) { for (const id of c.dummy.parts) { try { ctx.engine.parts.setColor(id, "#ffd23a"); } catch { /* gone */ } } }
      S.cheeses.splice(i, 1);
    }
  }
}
function applyCheesed(ctx) {
  S.cheesedT = CHEESE_SLOW_S;
  S.myState.cheesed = true;
  applyPassives(ctx);
  publishSoon();
  toast(ctx, "SPLAT! You are cheese now. Slow and yellow for 10 seconds.", "🧀", 3000);
  sfx(ctx, "pop");
}

// ---- killstreak powers (§11) --------------------------------------------------------
function ksTier() { return swordById(S.equipped).id === "killstreak" ? S.save.streak : -1; }
function ksTeleport(ctx) {
  if (!S.inArena || ksTier() < KS_TIERS[0]) return;
  if (S.ksCd.tp > 0) { toast(ctx, `Teleport in ${Math.ceil(S.ksCd.tp)}s`, "🌀", 1400); return; }
  const me = ctx.player.position();
  const [fx, fz] = facing(ctx);
  let nx = me[0] + fx * 24, nz = me[2] + fz * 24;
  const dx = nx - ARENA_CENTER[0], dz = nz - ARENA_CENTER[1];
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist > ARENA_RADIUS - 2) { const k2 = (ARENA_RADIUS - 2) / dist; nx = ARENA_CENTER[0] + dx * k2; nz = ARENA_CENTER[1] + dz * k2; }
  const ids = [];
  for (const [px, py, pz] of [[me[0], me[1] + 2, me[2]], [nx, me[1] + 2, nz]]) {
    for (let s = 0; s < 5; s++) { const a = s * 1.257; try { const id = uid("bt_blink_"); ctx.engine.parts.create({ id, shape: "box", size: [0.3, 4.5, 0.3], position: [px + Math.cos(a) * 1.3, py, pz + Math.sin(a) * 1.3], color: "#ff2a2a", material: "neon", canCollide: false }); ids.push(id); } catch { /* fine */ } }
  }
  S.vfx.push({ ids, t: 0.45 });
  try { ctx.player.teleport([nx, me[1] + 0.5, nz]); } catch { /* fine */ }
  S.ksCd.tp = KS_TP_CD;
  sfx(ctx, "warp");
}
function ksGrenade(ctx) {
  if (!S.inArena || ksTier() < KS_TIERS[1]) return;
  if (S.ksCd.gr > 0) { toast(ctx, `Grenade in ${Math.ceil(S.ksCd.gr)}s`, "💣", 1400); return; }
  const me = ctx.player.position();
  const [fx, fz] = facing(ctx);
  try {
    const id = uid("bt_gren_");
    ctx.engine.parts.create({ id, shape: "sphere", size: [0.9, 0.9, 0.9], position: [me[0] + fx * 2, me[1] + 3, me[2] + fz * 2], color: "#12141c", material: "metal", canCollide: false });
    S.grenades.push({ id, x: me[0] + fx * 2, y: me[1] + 3, z: me[2] + fz * 2, dx: fx, dz: fz, vy: 26, t: 0 });
  } catch { /* fine */ }
  S.ksCd.gr = KS_GR_CD;
  sfx(ctx, "boing");
}
function stepGrenades(ctx, dt) {
  for (let i = S.grenades.length - 1; i >= 0; i--) {
    const g = S.grenades[i]; g.t += dt;
    g.x += g.dx * 30 * dt; g.z += g.dz * 30 * dt;
    g.vy -= 85 * dt; g.y += g.vy * dt;
    try { ctx.engine.parts.setPosition(g.id, [g.x, g.y, g.z]); } catch { /* gone */ }
    if (g.y <= FLOOR_TOP + 0.6 || g.t > 2.4) {
      try { ctx.engine.parts.remove(g.id); } catch { /* gone */ }
      const ex = [];
      for (let k = 0; k < 14; k++) { const a = k * 0.45; try { const id = uid("bt_boom_"); ctx.engine.parts.create({ id, shape: k % 2 ? "sphere" : "wedge", size: [1.2, 1.2, 1.2], position: [g.x + Math.cos(a) * (1 + k % 4), g.y + 0.4 + (k % 3) * 0.7, g.z + Math.sin(a) * (1 + k % 4)], rotation: [0, a * 57, 0], color: ["#ff5a1f", "#ffd23a", "#ff2a2a", "#3e444f"][k % 4], material: "neon", canCollide: false }); ex.push(id); } catch { /* fine */ } }
      S.vfx.push({ ids: ex, t: 0.6 });
      try { ctx.engine.camera.shake(0.4, 0.4); } catch { /* fine */ }
      S.aoeSeq++; S.myState.aoe = { id: S.aoeSeq, x: g.x, z: g.z, r: 9, dmg: 25 }; publishSoon();
      for (const d of S.dummies) { if (!d.dead && (d.x - g.x) ** 2 + (d.z - g.z) ** 2 <= 81) hitDummy(ctx, d, 25); }
      sfx(ctx, "boing");
      S.grenades.splice(i, 1);
    }
  }
}
function ksFly(ctx) {
  if (!S.inArena || ksTier() < KS_TIERS[2]) return;
  S.flying = !S.flying;
  if (S.flying) {
    try { ctx.engine.physics.setGravity(16); } catch { /* fine */ }
    try { ctx.player.setJumpPower(44); } catch { /* fine */ }
    toast(ctx, "FLIGHT. Tap jump to climb; toggle 🕊️ to land.", "🕊️", 2600);
    sfx(ctx, "warp");
  } else {
    endFly(ctx);
    toast(ctx, "Grounded again.", "🕊️", 1500);
  }
  refreshKsButtons();
}
function endFly(ctx) {
  S.flying = false;
  try { ctx.engine.physics.setGravity(GRAVITY_DEFAULT); } catch { /* fine */ }
  applyPassives(ctx);
}
function ksClaim(ctx) {
  if (ksTier() < KS_TIERS[3] || S.save.ksClaimed) return;
  S.save.ksClaimed = true; saveNow(ctx);
  let granted = 0;
  for (const itemId of ["aura_killstreak", "body_killstreak"]) {
    try { const r = ctx.services.avatar.grantItem(itemId, "battles"); if (r && r.ok !== false) granted++; } catch { /* fine */ }
  }
  try { ctx.services.badges.award("killstreak_250"); } catch { /* fine */ }
  sfx(ctx, "win");
  toast(ctx, granted ? "250 STREAK. The Killstreak Aura and Garb are yours — equip them in the Catalog." : "250 STREAK — claimed.", "👑", 6000);
  refreshKsButtons();
}
function refreshKsButtons() {
  if (!dom) return;
  const tier = S.inArena ? ksTier() : -1;
  dom.tpBtn.style.display = tier >= KS_TIERS[0] ? "block" : "none";
  dom.grBtn.style.display = tier >= KS_TIERS[1] ? "block" : "none";
  dom.flyBtn.style.display = tier >= KS_TIERS[2] ? "block" : "none";
  dom.claimBtn.style.display = tier >= KS_TIERS[3] && !S.save.ksClaimed ? "block" : "none";
  if (tier >= KS_TIERS[0]) { dom.tpBtn.textContent = S.ksCd.tp > 0 ? "🌀 " + Math.ceil(S.ksCd.tp) : "🌀"; dom.tpBtn.style.opacity = S.ksCd.tp > 0 ? "0.55" : "1"; }
  if (tier >= KS_TIERS[1]) { dom.grBtn.textContent = S.ksCd.gr > 0 ? "💣 " + Math.ceil(S.ksCd.gr) : "💣"; dom.grBtn.style.opacity = S.ksCd.gr > 0 ? "0.55" : "1"; }
  if (tier >= KS_TIERS[2]) dom.flyBtn.style.opacity = S.flying ? "1" : "0.8";
}

// ---- thorn bushes (Thornheart's ⚡) --------------------------------------------------
function spawnBush(ctx, x, z) {
  const parts = [];
  const push = (def) => { try { const id = uid("bt_bush_"); ctx.engine.parts.create({ id, canCollide: false, ...def }); parts.push(id); } catch { /* fine */ } };
  push({ shape: "cylinder", size: [2.4, 0.6, 2.4], position: [x, FLOOR_TOP + 0.3, z], color: "#3a2414", material: "wood" }); // mound
  const foliage = [[0, 1.5, 0, 2.4], [1.0, 1.2, 0.5, 1.7], [-0.9, 1.3, -0.6, 1.8], [0.4, 2.2, -0.8, 1.5], [-0.5, 2.1, 0.7, 1.4], [0, 2.8, 0, 1.2]];
  for (let k = 0; k < foliage.length; k++) { const [ox, oy, oz, s] = foliage[k]; push({ shape: "sphere", size: [s, s * 0.85, s], position: [x + ox, FLOOR_TOP + oy, z + oz], color: k % 2 ? "#3ddc84" : "#2f8f4a", material: "plastic" }); }
  for (let i = 0; i < 8; i++) { const a = i * 0.8; push({ shape: "wedge", size: [0.24, 0.7, 0.24], position: [x + Math.cos(a) * 1.4, FLOOR_TOP + 1.1 + (i % 3) * 0.6, z + Math.sin(a) * 1.4], rotation: [0, a * 57, 90], color: "#1f6b34", material: "plastic" }); } // thorns
  for (let i = 0; i < 5; i++) { const a = i * 1.3 + 0.4; push({ shape: "sphere", size: [0.3, 0.3, 0.3], position: [x + Math.cos(a) * 1.1, FLOOR_TOP + 1.6 + (i % 2) * 0.5, z + Math.sin(a) * 1.1], color: "#e0245e", material: "neon" }); } // barbs
  S.bushes.push({ parts, x, z, t: 0, dmgT: 0.6 });
}
function stepBushes(ctx, dt) {
  for (let i = S.bushes.length - 1; i >= 0; i--) {
    const b = S.bushes[i]; b.t += dt;
    if (b.t >= BUSH_LIFE) { for (const id of b.parts) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } } S.bushes.splice(i, 1); continue; }
    b.dmgT -= dt;
    if (b.dmgT <= 0) {
      b.dmgT = 1;
      for (const d of S.dummies) { if (!d.dead && (d.x - b.x) ** 2 + (d.z - b.z) ** 2 <= BUSH_R * BUSH_R) hitDummy(ctx, d, BUSH_DMG); }
      for (const p of rosterSafe(ctx)) { if (!p.pos) continue; if ((p.pos[0] - b.x) ** 2 + (p.pos[2] - b.z) ** 2 <= BUSH_R * BUSH_R) { S.aoeSeq++; S.myState.aoe = { id: S.aoeSeq, x: b.x, z: b.z, r: BUSH_R, dmg: BUSH_DMG }; publishSoon(); break; } }
    }
  }
}

// Slowly turn every display sword on its pedestal (lobby only — the arena is far away).
function rotateSwords(ctx) {
  const ang = S.runT * SPIN_SPEED, ca = Math.cos(ang), sa = Math.sin(ang), deg = (ang * 180 / Math.PI) % 360;
  for (const pad of S.world.swordPads) {
    const cx = pad.center[0], cy = pad.center[1], cz = pad.center[2];
    for (const p of pad.spin) {
      try { ctx.engine.parts.setPosition(p.id, [cx + p.dx * ca - p.dz * sa, cy + p.dy, cz + p.dx * sa + p.dz * ca]); } catch { /* gone */ }
      try { ctx.engine.parts.setRotation(p.id, [p.rot[0], p.rot[1] + deg, p.rot[2]]); } catch { /* gone */ }
    }
  }
}
function stepMeteors(ctx, dt) {
  for (let i = S.meteors.length - 1; i >= 0; i--) {
    const m = S.meteors[i]; m.t += dt;
    m.x += m.dx * 70 * dt; m.z += m.dz * 70 * dt; m.y = Math.max(FLOOR_TOP + 1, m.y - 22 * dt);
    try { ctx.engine.parts.setPosition(m.id, [m.x, m.y, m.z]); } catch { /* gone */ }
    if (m.glow) { try { ctx.engine.parts.setPosition(m.glow, [m.x, m.y, m.z]); } catch { /* gone */ } }
    m.trailT -= dt;
    if (m.trailT <= 0) {
      m.trailT = 0.04;
      try { const id = uid("bt_ember_"); ctx.engine.parts.create({ id, shape: "sphere", size: [0.9, 0.9, 0.9], position: [m.x, m.y + 0.4, m.z], color: ["#ff8c1a", "#ffd23a", "#ff5a1f"][S.idSeq % 3], material: "neon", canCollide: false }); S.vfx.push({ ids: [id], t: 0.35 }); } catch { /* fine */ }
    }
    let hit = false;
    for (const p of rosterSafe(ctx)) { if (!p.pos) continue; if ((p.pos[0] - m.x) ** 2 + (p.pos[2] - m.z) ** 2 <= 9) { S.hitSeq++; S.myState.hit = { id: S.hitSeq, target: p.id, dmg: 9999, poison: 0 }; publishSoon(); hit = true; break; } }
    for (const d of S.dummies) { if (!d.dead && (d.x - m.x) ** 2 + (d.z - m.z) ** 2 <= 9) { hitDummy(ctx, d, 9999); hit = true; } }
    if (hit || m.t > 2.4 || m.y <= FLOOR_TOP + 1.1) {
      const ex = [];
      for (let k = 0; k < 12; k++) { const a = k * 0.52; try { const id = uid("bt_boom_"); ctx.engine.parts.create({ id, shape: k % 2 ? "sphere" : "wedge", size: [1.1, 1.1, 1.1], position: [m.x + Math.cos(a) * (1 + k % 3), m.y + (k % 3) * 0.6, m.z + Math.sin(a) * (1 + k % 3)], rotation: [0, a * 57, 0], color: ["#ff5a1f", "#ffd23a", "#3a2418", "#ff8c1a"][k % 4], material: k % 3 ? "neon" : "lava", canCollide: false }); ex.push(id); } catch { /* fine */ } }
      S.vfx.push({ ids: ex, t: 0.6 });
      if (hit) { toast(ctx, "METEOR HIT — obliterated!", "☄️", 2200); sfx(ctx, "win"); } else { sfx(ctx, "boing"); }
      try { ctx.engine.parts.remove(m.id); } catch { /* gone */ }
      if (m.glow) { try { ctx.engine.parts.remove(m.glow); } catch { /* gone */ } }
      S.meteors.splice(i, 1);
    }
  }
}

function rosterSafe(ctx) { const n = ctx.services.net; try { return (n && n.roster && n.roster()) || []; } catch { return []; } }
function publishSoon() { if (S) S.pubT = Math.min(S.pubT, 0); }

function takeDamage(ctx, dmg, poison, attackerId) {
  if (!S.inArena) return;
  S.lastAttacker = attackerId || S.lastAttacker;
  S.hp -= dmg;
  if (poison) S.poison = { left: 3, t: 1.0 };
  if (S.hp <= 0) die(ctx);
  else { publishSoon(); refreshHp(); }
}
function die(ctx) {
  S.deathSeq++;
  S.myState.death = { id: S.deathSeq, killer: S.lastAttacker || null };
  S.hp = HP_MAX; S.poison = null; S.lastAttacker = null;
  if (S.save.streak > 0 && swordById(S.equipped).id === "killstreak") {
    toast(ctx, `The Killstreak forgets. ${S.save.streak}-streak, gone — back to 1 damage.`, "🩸", 3600);
  }
  S.save.streak = 0; saveNow(ctx);
  toast(ctx, "You were defeated! Back to the lobby — pick your next blade.", "💀", 2800); sfx(ctx, "oof");
  toLobby(ctx);
}
function scoreKill(ctx, whom) {
  S.save.kills += 1;
  S.save.totalKills += 1;
  if (S.inArena && swordById(S.equipped).id === "killstreak") {
    S.save.streak += 1;
    if (S.save.streak > S.save.bestStreak) S.save.bestStreak = S.save.streak;
    if (KS_TIERS.includes(S.save.streak)) {
      const names = { 10: "TELEPORT 🌀", 50: "GRENADE 💣", 100: "FLIGHT 🕊️", 250: "THE CROWN 👑 — claim your aura and garb" };
      toast(ctx, `${S.save.streak} STREAK. The blade learns: ${names[S.save.streak]}.`, "🩸", 4600);
      sfx(ctx, "badge");
      refreshKsButtons();
    }
  }
  S.myState.kills = S.save.kills; publishSoon();
  saveNow(ctx); refreshLabels(ctx); refreshHud(ctx); checkUnlocks(ctx, whom);
}
function checkUnlocks(ctx, whom) {
  for (const sw of SWORDS) {
    if (sw.cost !== null && sw.cost > 0 && S.save.kills === sw.cost) {
      toast(ctx, `UNLOCKED: ${sw.emoji} ${sw.name}! Grab it in the lobby.`, "🗝️", 4000);
      sfx(ctx, "badge");
      try { ctx.services.badges.award("sword_" + sw.id); } catch { /* fine */ }
    }
  }
  try { ctx.services.badges.award("firstblood"); } catch { /* fine */ }
}

// ---- HUD / buttons -------------------------------------------------------------------
function refreshHp() {
  if (!dom) return;
  const pct = Math.max(0, Math.min(1, S.hp / HP_MAX));
  dom.hpFill.style.width = (pct * 100) + "%";
  dom.hpFill.style.background = pct > 0.5 ? "linear-gradient(90deg,#3ddc84,#8be04a)" : pct > 0.25 ? "linear-gradient(90deg,#e0b23a,#ffd23a)" : "linear-gradient(90deg,#c0392b,#ff5a3a)";
  dom.hpText.textContent = `${Math.max(0, Math.ceil(S.hp))} / ${HP_MAX}`;
}
function refreshAbilityBtn() {
  if (!dom) return;
  const sw = swordById(S.equipped);
  const show = S.inArena && !!sw.ability && sw.ability !== "streak";
  dom.abBtn.style.display = show ? "block" : "none";
  refreshKsButtons();
  if (!show) return;
  if (S.abilityCd > 0) { dom.abBtn.textContent = (sw.ability === "cheese" ? "🧀 " : "⚡ ") + Math.ceil(S.abilityCd); dom.abBtn.style.opacity = "0.55"; }
  else { dom.abBtn.textContent = sw.ability === "cheese" ? "🧀" : "⚡"; dom.abBtn.style.opacity = "1"; }
}
function refreshHud(ctx) {
  const sw = swordById(S.equipped);
  ctx.services.ui.setHudStat("bt-kills", { icon: "💀", label: "Kills", value: String(S.save.kills) });
  ctx.services.ui.setHudStat("bt-sword", { icon: sw.emoji, label: S.inArena ? "Wielding" : "Last sword", value: sw.name });
  if (sw.id === "killstreak") ctx.services.ui.setHudStat("bt-streak", { icon: "🩸", label: "Streak", value: `${S.save.streak} (${1 + S.save.streak} dmg)` });
  else { try { ctx.services.ui.removeHudStat("bt-streak"); } catch { /* fine */ } }
  try { ctx.events.emit("bt:state", debugState()); } catch { /* no place */ }
}
function showCombatUi(on) {
  if (!dom) return;
  dom.hpWrap.style.display = on ? "block" : "none";
  dom.atkBtn.style.display = on ? "block" : "none";
  if (!on) disarmCheese();
  refreshAbilityBtn();
}

// ---- lobby / arena travel ------------------------------------------------------------
function applyPassives(ctx) {
  const sw = swordById(S.equipped);
  const p = sw.passive || {};
  const slow = S.cheesedT > 0 ? 0.45 : 1; // §10: splatted fighters wade through fondue
  try { ctx.player.setWalkSpeed(BASE_WALK * (p.speed || 1) * slow); } catch { /* fine */ }
  try { ctx.player.setJumpPower(S.flying ? 44 : BASE_JUMP + (p.jump || 0)); } catch { /* fine */ }
}
function clearPassives(ctx) {
  try { ctx.player.setWalkSpeed(BASE_WALK); } catch { /* fine */ }
  try { ctx.player.setJumpPower(BASE_JUMP); } catch { /* fine */ }
}
function enterArena(ctx, swordId) {
  if (!own(swordId)) { toast(ctx, "You haven't earned that sword yet.", "🔒"); return; }
  S.equipped = swordId; S.save.equipped = swordId; saveNow(ctx);
  S.inArena = true; S.hp = HP_MAX; S.poison = null; S.swingCd = 0; S.abilityCd = 0;
  S.ksCd.tp = 0; S.ksCd.gr = 0;
  const sp = S.world.arenaSpawns[Math.floor(S.runT * 3) % S.world.arenaSpawns.length];
  try { ctx.player.teleport([sp[0], sp[1], sp[2]], 0); } catch { /* fine */ }
  // NOTE: the checkpoint deliberately stays at the LOBBY (set in toLobby / at spawn), so a
  // fall or death in the arena returns you to the lobby, never to a spot in the arena.
  applyPassives(ctx);
  S.myState.inArena = true; S.myState.sword = swordId; S.myState.hp = HP_MAX; publishSoon();
  showCombatUi(true); refreshHp(); refreshHud(ctx);
  try { ctx.engine.audio.playMusic("clash"); } catch { /* fine */ }
  toast(ctx, `Fighting with the ${swordById(swordId).name}. Tap ⚔️ to swing!`, swordById(swordId).emoji, 3200);
}
function toLobby(ctx) {
  S.inArena = false;
  endFly(ctx);
  clearPassives(ctx);
  try { ctx.player.teleport([LOBBY_SPAWN[0], LOBBY_SPAWN[1], LOBBY_SPAWN[2]], LOBBY_YAW); } catch { /* fine */ }
  try { ctx.player.setCheckpoint([LOBBY_SPAWN[0], LOBBY_SPAWN[1], LOBBY_SPAWN[2]]); } catch { /* fine */ }
  S.myState.inArena = false; publishSoon();
  showCombatUi(false); refreshHud(ctx);
  try { ctx.engine.audio.playMusic("chill"); } catch { /* fine */ }
}
function openSwordPanel(ctx, i) {
  const sw = SWORDS[i];
  const owned = own(sw.id);
  if (owned) {
    const pages = sw.lore.map((body, k) => ({ heading: k === 0 ? `${sw.emoji} ${sw.name}` : sw.name, body }));
    const dmgLine = sw.id === "killstreak" ? `1 damage, +1 for every kill of your streak (now ${S.save.streak} — ${1 + S.save.streak} damage a hit)` : `${sw.damage} damage a hit`;
    pages.push({ heading: "Ready", body: `${dmgLine}${sw.ability && sw.ability !== "streak" ? ", plus a ⚡ ability" : sw.passive ? ", plus a passive buff" : sw.id === "killstreak" ? ". Its powers wake at 10, 50, 100 and 250 streak." : ""}. Step into the arena and put it to work.` });
    pagedPanel(ctx, `${sw.emoji} ${sw.name}`, pages, { doneLabel: "Close", actionLabel: "⚔️ Enter Arena", onAction: () => enterArena(ctx, sw.id) });
  } else if (sw.id === "cheese") {
    pagedPanel(ctx, `${sw.emoji} ${sw.name}`, [{ heading: `${sw.emoji} ${sw.name}`, body: `${sw.blurb}\n\n🔒 No number of kills will unlock this one. The Obby of Oof's cheese arch stands at the WEST end of this hall. One stage. No mercy. Fall once and you're back here.` }], { doneLabel: "Close" });
    sfx(ctx, "denied");
  } else if (sw.id === "killstreak") {
    pagedPanel(ctx, "❓ The scratched pedestal", [{ heading: "❓ ???", body: "The plaque is scratched out. The pedestal is warm. Whatever stood here was BURIED somewhere, and nothing in this lobby says where — though the Meteorbrand's last page is said to whisper about it." }], { doneLabel: "Close" });
    sfx(ctx, "denied");
  } else {
    pagedPanel(ctx, `${sw.emoji} ${sw.name}`, [{ heading: `${sw.emoji} ${sw.name}`, body: `${sw.blurb}\n\n🔒 Unlocks at ${sw.cost} kills. You have ${S.save.kills}. Its story stays sealed until you earn it.` }], { doneLabel: "Close" });
    sfx(ctx, "denied");
  }
}

// ---- the sword in your hand (§5 amended: you SEE what you carry) ---------------------
// A little THREE model of the equipped blade rides the rig's GearAnchor — mine while I'm
// in the arena, and every arena peer's too (their rigs are found by matching scene
// "OofRig" roots to roster positions; the platform owns the rigs, we only hang a prop).
function buildMiniSword(THREE, sw) {
  const g = new THREE.Group();
  g.name = "bt-heldsword";
  const mat = (c, glow) => glow ? new THREE.MeshBasicMaterial({ color: c }) : new THREE.MeshLambertMaterial({ color: c });
  const add = (geo, m, x, y, z, rz) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); if (rz) mesh.rotation.z = rz; g.add(mesh); };
  add(new THREE.BoxGeometry(0.34, 2.6, 0.14), mat(sw.colors.blade), 0, 1.75, 0);
  add(new THREE.BoxGeometry(0.14, 2.4, 0.18), mat(sw.colors.edge, true), 0, 1.8, 0);
  add(new THREE.BoxGeometry(1.1, 0.22, 0.3), mat(sw.colors.guard), 0, 0.42, 0);
  add(new THREE.CylinderGeometry(0.11, 0.13, 0.8, 8), mat(sw.colors.hilt), 0, 0, 0);
  add(new THREE.SphereGeometry(0.16, 8, 6), mat(sw.colors.gem, true), 0, -0.44, 0);
  if (sw.id === "killstreak") add(new THREE.BoxGeometry(0.08, 2.2, 0.2), mat("#ff2a2a", true), 0, 1.8, 0.02);
  if (sw.id === "cheese") for (let k = 0; k < 3; k++) add(new THREE.SphereGeometry(0.09, 6, 4), mat("#c9971f"), 0.06 - (k % 2) * 0.12, 1.1 + k * 0.6, 0.09);
  return g;
}
function disposeGroup(g) {
  g.traverse((o) => { if (o.isMesh) { try { o.geometry.dispose(); o.material.dispose(); } catch { /* fine */ } } });
  if (g.parent) g.parent.remove(g);
}
// A head-to-boot coat of cheese for splatted fighters — hangs off the rig ROOT (feet).
function buildCheeseShell(THREE) {
  const g = new THREE.Group();
  g.name = "bt-cheeseshell";
  const m = new THREE.MeshBasicMaterial({ color: "#ffd23a", transparent: true, opacity: 0.72 });
  const add = (geo, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); g.add(mesh); };
  add(new THREE.BoxGeometry(2.6, 2.3, 1.7), 0, 3, 0);       // torso + arms
  add(new THREE.BoxGeometry(1.7, 1.5, 1.7), 0, 4.7, 0);     // head
  for (const sx of [-0.55, 0.55]) add(new THREE.BoxGeometry(1.15, 2.2, 1.5), sx, 1.05, 0); // legs
  for (let k = 0; k < 4; k++) add(new THREE.SphereGeometry(0.28, 6, 4), -0.9 + k * 0.6, 1.7 - (k % 2) * 0.7, 0.85); // drips
  return g;
}
function findAnchor(root) {
  let anchor = null;
  try { anchor = root.getObjectByName("GearAnchor"); } catch { anchor = null; }
  return anchor || root;
}
function refreshAttachments(ctx) {
  const THREE = ctx.engine.THREE;
  const wanted = new Map(); // uuid -> {root, swordId|null, cheesed}
  const myRoot = ctx.player.avatar;
  if (myRoot) wanted.set(myRoot.uuid, { root: myRoot, swordId: S.inArena ? S.equipped : null, cheesed: S.cheesedT > 0 });
  // pair scene rigs with roster peers by proximity (both stand at the same feet point)
  const peers = rosterSafe(ctx).filter((p) => p.pos && p.state);
  if (peers.length) {
    try {
      ctx.engine.scene.traverse((o) => {
        if (o.name !== "OofRig" || o === myRoot || wanted.has(o.uuid)) return;
        let best = null, bd = 16;
        for (const p of peers) { const dd = (o.position.x - p.pos[0]) ** 2 + (o.position.z - p.pos[2]) ** 2; if (dd < bd) { bd = dd; best = p; } }
        if (best) wanted.set(o.uuid, { root: o, swordId: best.state.inArena ? (best.state.sword || "basic") : null, cheesed: !!best.state.cheesed });
      });
    } catch { /* scene unavailable: solo attachments still work */ }
  }
  // reconcile held swords
  for (const [uuidKey, held] of S.heldSwords) {
    const want = wanted.get(uuidKey);
    if (!want || want.swordId !== held.swordId) { disposeGroup(held.group); S.heldSwords.delete(uuidKey); }
  }
  for (const [uuidKey, want] of wanted) {
    if (want.swordId && !S.heldSwords.has(uuidKey)) {
      const sw = swordById(want.swordId);
      const group = buildMiniSword(THREE, sw);
      findAnchor(want.root).add(group);
      S.heldSwords.set(uuidKey, { swordId: want.swordId, group });
    }
  }
  // reconcile cheese shells
  for (const [uuidKey, shell] of S.shells) {
    const want = wanted.get(uuidKey);
    if (!want || !want.cheesed) { disposeGroup(shell); S.shells.delete(uuidKey); }
  }
  for (const [uuidKey, want] of wanted) {
    if (want.cheesed && !S.shells.has(uuidKey)) {
      const shell = buildCheeseShell(THREE);
      want.root.add(shell);
      S.shells.set(uuidKey, shell);
    }
  }
}
function clearAttachments() {
  for (const [, held] of S.heldSwords) disposeGroup(held.group);
  for (const [, shell] of S.shells) disposeGroup(shell);
  S.heldSwords.clear(); S.shells.clear();
}

// ---- the two lobby leaderboards (§12) ------------------------------------------------
function accountName(ctx) {
  const a = ctx.services && ctx.services.account;
  try { return a && typeof a.username === "function" ? a.username() : null; } catch { return null; }
}
function tickGlobalBoard(ctx) {
  const games = ctx.services && ctx.services.games;
  if (!games || typeof games.battlesTop !== "function") return;
  try { if (!games.available()) return; } catch { return; }
  const me = accountName(ctx);
  const t = S.runT;
  const swordsOwned = ownedSwords(S.save).length;
  if (me && (S.save.totalKills > S.gSentTk || swordsOwned > S.gSentSw) && t - S.gSubmitT >= GLOBAL_SUBMIT_S) {
    S.gSubmitT = t;
    const tk = S.save.totalKills, sw = swordsOwned;
    games.battlesScore(tk, sw).then(() => { S.gSentTk = tk; S.gSentSw = sw; }).catch(() => { /* retry later */ });
  }
  if (t - S.gFetchT >= GLOBAL_FETCH_S) {
    S.gFetchT = t;
    games.battlesTop().then((out) => {
      if (!out || !Array.isArray(out.kills)) return;
      const mk = (list, youSide) => {
        const rows = list
          .map((r, i) => ({ name: r.name, value: r.value || 0, rank: i + 1, isPlayer: Boolean(me && r.name === me) }))
          .filter((r) => r.value > 0);
        // past the cut, the player still appears on the last row wearing their true rank
        if (out.you && out.you[youSide] && out.you[youSide].rank > rows.length && rows.length >= 10) {
          rows[rows.length - 1] = { name: "You", value: out.you[youSide].value, rank: out.you[youSide].rank, isPlayer: true };
        }
        return rows;
      };
      const kills = mk(out.kills, "kills"), swords = mk(out.swords, "swords");
      S.gRows = kills.length || swords.length ? { kills, swords } : null;
      S.boardT = 0; // repaint on the next tick
    }).catch(() => { /* keep whatever we had */ });
  }
}
function paintBoards(ctx) {
  if (!S.boards) return;
  tickGlobalBoard(ctx);
  const swordsOwned = ownedSwords(S.save).length;
  let killRows, swordRows;
  if (S.gRows) {
    killRows = S.gRows.kills;
    swordRows = S.gRows.swords;
  } else {
    const peers = rosterSafe(ctx);
    const k = [], w = [];
    for (const p of peers) {
      if (!p.state) continue;
      k.push({ name: p.name || "fighter", value: Number(p.state.tk) || Number(p.state.kills) || 0, isPlayer: false });
      w.push({ name: p.name || "fighter", value: Number(p.state.sw) || 0, isPlayer: false });
    }
    k.push({ name: "You", value: S.save.totalKills, isPlayer: true });
    w.push({ name: "You", value: swordsOwned, isPlayer: true });
    killRows = rankRows(k); swordRows = rankRows(w);
  }
  const tag = S.gRows ? "ALL-TIME " : "";
  S.boards.paint(0, tag + "TOP KILLERS", "#ff5a3a", killRows);
  S.boards.paint(1, tag + "MOST SWORDS", "#e0b23a", swordRows);
}

// ---- the Obby of Oof (§10) -----------------------------------------------------------
function enterObby(ctx) {
  if (S.inArena) toLobby(ctx); // no fighting mid-obby; also re-pins the lobby checkpoint
  // checkpoint stays at the LOBBY on purpose: any fall = start over from the hall
  try { ctx.player.teleport([OBBY_START[0], OBBY_START[1], OBBY_START[2]], 180); } catch { /* fine */ }
  sfx(ctx, "warp");
  toast(ctx, S.save.cheese
    ? "The Obby of Oof — again, for glory. One stage. Fall and you're home."
    : "The OBBY OF OOF. One stage. Fall ONCE and you're back in the lobby. Win, and the Cheese Blade is yours.", "🧀", 5000);
}
function winObby(ctx) {
  if (!S.save.cheese) {
    S.save.cheese = true; saveNow(ctx);
    sfx(ctx, "win");
    try { ctx.services.badges.award("sword_cheese"); } catch { /* fine */ }
    toast(ctx, "YOU BEAT THE OBBY OF OOF. The Cheese Blade is yours, forever.", "🧀", 6000);
    refreshLabels(ctx);
  } else {
    toast(ctx, "The obby again bows to you. The cheese remembers.", "🧀", 3000);
    sfx(ctx, "fanfare");
  }
  later(1.6, () => { try { ctx.player.teleport([LOBBY_SPAWN[0], LOBBY_SPAWN[1], LOBBY_SPAWN[2]], LOBBY_YAW); } catch { /* fine */ } });
}

// ---- lifecycle -----------------------------------------------------------------------
export function init(ctx) {
  S = fresh();
  S.save = loadSave(ctx);
  S.equipped = S.save.equipped;
  S.world = buildWorld();
  for (const def of S.world.parts) { try { ctx.engine.parts.create(def); } catch { /* one bad part is not a dead Place */ } }

  // pedestal labels
  const THREE = ctx.engine.THREE;
  const root = new THREE.Group(); root.name = "bt-labels";
  S.rootId = ctx.engine.parts.addCustom(root);
  for (let i = 0; i < S.world.swordPads.length; i++) {
    const L = makeLabel(ctx, labelText(SWORDS[i]), "#e0b23a");
    const [lx, ly, lz] = S.world.swordPads[i].labelPos; L.sprite.position.set(lx, ly, lz);
    root.add(L.sprite); S.labels.push(L);
  }
  // the obby gate's own label
  const gate = makeLabel(ctx, "🧀 OBBY OF OOF\none stage\nno mercy", "#ffd23a");
  gate.sprite.position.set(S.world.obbyGate[0], S.world.obbyGate[1], S.world.obbyGate[2]);
  root.add(gate.sprite); S.gateLabel = gate;
  refreshLabels(ctx);

  // baseline training dummies
  for (const [dx, dz] of S.world.dummySpots) spawnDummy(ctx, dx, dz, false);

  // the two lobby leaderboards
  try { S.boards = createBoards(ctx, S.world.boardSpots); paintBoards(ctx); } catch { S.boards = null; }

  // §11: the questline
  S.quest = createQuest({
    ctx,
    getSave: () => S.save,
    saveNow: () => { saveNow(ctx); refreshHud(ctx); }, // the HUD re-emit keeps bt:state fresh for the test seam
    toast: (t, icon, dur) => toast(ctx, t, icon, dur),
    sfx: (n) => sfx(ctx, n),
    pagedPanel: (title, pages, opts) => pagedPanel(ctx, title, pages, opts),
    isPanelOpen: () => S.panelOpen,
    setPanelOpen: (v) => { S.panelOpen = v; },
    onUnlockKillstreak: () => {
      try { ctx.services.badges.award("sword_killstreak"); } catch { /* fine */ }
      refreshLabels(ctx); refreshHud(ctx);
    },
    onRebirth: () => {
      if (!own(S.equipped)) { S.equipped = "basic"; S.save.equipped = "basic"; }
      S.myState.kills = S.save.kills;
      refreshLabels(ctx); refreshHud(ctx); publishSoon();
    },
  });
  S.quest.refreshWorld();

  dom = buildDom(ctx);
  const subs = [];
  for (let i = 0; i < S.world.swordPads.length; i++) subs.push(ctx.events.on("touch:" + S.world.swordPads[i].padId, ((idx) => () => openSwordPanel(ctx, idx))(i)));
  subs.push(ctx.events.on("touch:bt_leave", () => toLobby(ctx)));
  subs.push(ctx.events.on("touch:bt_obby_enter", () => enterObby(ctx)));
  subs.push(ctx.events.on("touch:bt_obby_win", () => winObby(ctx)));
  for (const ev of ["bt_cube", "bt_book1", "bt_book2", "bt_tree", "bt_scope", "bt_rebirth", "bt_rocket", "bt_crater"]) {
    subs.push(ctx.events.on("touch:" + ev, ((e2) => () => { try { S.quest.onTouch(e2); } catch { /* fine */ } })(ev)));
  }
  S.subs = subs;

  try { ctx.player.setCheckpoint([LOBBY_SPAWN[0], LOBBY_SPAWN[1], LOBBY_SPAWN[2]]); } catch { /* fine */ }
  refreshHud(ctx);
  if (!S.save.seenIntro) {
    pagedPanel(ctx, "⚔️ Battles", INTRO_PAGES.map((p) => ({ heading: p.title, body: p.body })), { doneLabel: "Skip", onDone: () => { S.save.seenIntro = true; saveNow(ctx); } });
  } else {
    toast(ctx, "Pick a sword from the rack to enter the arena.", "⚔️", 3200);
  }
}

export function update(dt, ctx) {
  if (!S) return;
  S.runT += dt;
  if (S.swingCd > 0) S.swingCd = Math.max(0, S.swingCd - dt);
  if (S.abilityCd > 0) { S.abilityCd = Math.max(0, S.abilityCd - dt); refreshAbilityBtn(); }
  if (S.ksCd.tp > 0 || S.ksCd.gr > 0) { S.ksCd.tp = Math.max(0, S.ksCd.tp - dt); S.ksCd.gr = Math.max(0, S.ksCd.gr - dt); refreshKsButtons(); }
  if (S.cheesedT > 0) {
    S.cheesedT = Math.max(0, S.cheesedT - dt);
    if (S.cheesedT === 0) { S.myState.cheesed = false; applyPassives(ctx); publishSoon(); toast(ctx, "The cheese lets go of you.", "🧀", 1800); }
  }
  for (let i = S.timers.length - 1; i >= 0; i--) { const t = S.timers[i]; t.t -= dt; if (t.t <= 0) { S.timers.splice(i, 1); try { t.fn(); } catch { /* fine */ } } }

  // transient VFX cleanup
  for (let i = S.vfx.length - 1; i >= 0; i--) { const v = S.vfx[i]; v.t -= dt; if (v.t <= 0) { for (const id of v.ids) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } } S.vfx.splice(i, 1); } }

  stepCheeses(ctx, dt);
  try { S.quest.update(dt); } catch { /* fine */ }

  if (S.inArena) {
    stepMeteors(ctx, dt);
    stepBushes(ctx, dt);
    stepGrenades(ctx, dt);
    // poison on me
    if (S.poison) { S.poison.t -= dt; if (S.poison.t <= 0) { S.poison.t = 1.0; S.poison.left -= 1; takeDamage(ctx, 3, 0, S.lastAttacker); if (S.poison && S.poison.left <= 0) S.poison = null; } }
    // fell into the void → respawn (before the engine's killY)
    const me = ctx.player.position();
    if (me[1] < VOID_Y) die(ctx);
    // dummy respawns
    for (const d of S.dummies) { if (d.dead && !d.temp) { d.respawnT -= dt; if (d.respawnT <= 0) { d.dead = false; d.hp = DUMMY_HP; spawnDummyReuse(ctx, d); } } }
  } else {
    // the display swords turn while you browse the lobby — throttled (the angle tracks
    // runT, so a skipped frame just jumps to the right place; ~12 updates/sec is smooth)
    S.spinT -= dt;
    if (S.spinT <= 0) { S.spinT = 0.08; rotateSwords(ctx); }
  }

  // held swords + cheese shells, mine and the room's (cheap reconcile at 2 Hz)
  S.attachT -= dt;
  if (S.attachT <= 0) { S.attachT = 0.5; try { refreshAttachments(ctx); } catch { /* fine */ } }

  // the leaderboards
  S.boardT -= dt;
  if (S.boardT <= 0) { S.boardT = BOARD_TICK_S; try { paintBoards(ctx); } catch { /* fine */ } }

  // incoming combat over the presence channel
  const myId = (() => { try { const s = ctx.services.net.self(); return s ? s.id : null; } catch { return null; } })();
  if (myId) {
    for (const p of rosterSafe(ctx)) {
      const st = p.state; if (!st) continue;
      if (st.hit && st.hit.target === myId) { const key = p.id + ":h" + st.hit.id; if (!S.seenHit.has(key)) { S.seenHit.add(key); takeDamage(ctx, st.hit.dmg, st.hit.poison, p.id); } }
      if (st.aoe) { const key = p.id + ":a" + st.aoe.id; if (!S.seenAoe.has(key)) { S.seenAoe.add(key); const me = ctx.player.position(); if (S.inArena && (me[0] - st.aoe.x) ** 2 + (me[2] - st.aoe.z) ** 2 <= st.aoe.r * st.aoe.r) takeDamage(ctx, st.aoe.dmg, 0, p.id); } }
      if (st.cheese && st.cheese.target === myId) { const key = p.id + ":c" + st.cheese.id; if (!S.seenCheese.has(key)) { S.seenCheese.add(key); if (S.inArena) applyCheesed(ctx); } }
      if (st.death && st.death.killer === myId) { const key = p.id + ":d" + st.death.id; if (!S.seenDeath.has(key)) { S.seenDeath.add(key); scoreKill(ctx, p.name || "a fighter"); } }
    }
  }

  // publish our state (throttled; publishSoon() forces the next tick)
  S.pubT -= dt;
  if (S.pubT <= 0) {
    S.pubT = PUBLISH_EVERY;
    S.myState.hp = Math.max(0, Math.ceil(S.hp)); S.myState.kills = S.save.kills; S.myState.sword = S.equipped; S.myState.inArena = S.inArena;
    S.myState.cheesed = S.cheesedT > 0;
    S.myState.tk = S.save.totalKills; S.myState.sw = ownedSwords(S.save).length; S.myState.streak = S.save.streak;
    try { const n = ctx.services.net; if (n && n.publish) n.publish({ ...S.myState }); } catch { /* solo */ }
  }

  S.hudT -= dt; if (S.hudT <= 0) { S.hudT = 0.2; if (S.inArena) refreshHp(); }
}

function spawnDummyReuse(ctx, d) { d.parts = buildDummyParts(ctx, d.x, d.z); }

export function dispose(ctx) {
  if (S) {
    endFly(ctx);
    clearPassives(ctx);
    clearAttachments();
    if (S.quest) { try { S.quest.dispose(); } catch { /* fine */ } }
    if (S.boards) { try { S.boards.dispose(); } catch { /* fine */ } }
    for (const v of S.vfx) for (const id of v.ids) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
    for (const m of S.meteors) { try { ctx.engine.parts.remove(m.id); } catch { /* gone */ } if (m.glow) { try { ctx.engine.parts.remove(m.glow); } catch { /* gone */ } } }
    for (const g of S.grenades) { try { ctx.engine.parts.remove(g.id); } catch { /* gone */ } }
    for (const c of S.cheeses) for (const id of c.ids) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
    for (const d of S.dummies) for (const id of d.parts) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
    for (const b of S.bushes) for (const id of b.parts) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
    if (S.labels) for (const L of S.labels) { try { L.mat.dispose(); L.tex.dispose(); } catch { /* fine */ } }
    if (S.gateLabel) { try { S.gateLabel.mat.dispose(); S.gateLabel.tex.dispose(); } catch { /* fine */ } }
    if (S.rootId != null) { try { ctx.engine.parts.remove(S.rootId); } catch { /* gone */ } }
    if (S.subs) for (const u of S.subs) { try { u(); } catch { /* fine */ } }
    try { ctx.engine.audio.playMusic("chill"); } catch { /* fine */ }
  }
  if (dom) { for (const k of ["hpWrap", "atkBtn", "abBtn", "tpBtn", "grBtn", "flyBtn", "claimBtn", "aimLayer"]) { try { dom[k].remove(); } catch { /* fine */ } } dom = null; }
  try { ctx.services.ui.removeHudStat("bt-kills"); ctx.services.ui.removeHudStat("bt-sword"); ctx.services.ui.removeHudStat("bt-streak"); } catch { /* fine */ }
  S = null;
}

// Test seam (spec 26 §8).
export function debugState() {
  if (!S) return null;
  return {
    kills: S.save.kills, totalKills: S.save.totalKills, equipped: S.equipped, inArena: S.inArena,
    hp: Math.ceil(S.hp), dummies: S.dummies.filter((d) => !d.dead).length,
    cheese: S.save.cheese, ks: S.save.ks, streak: S.save.streak, rebirths: S.save.rebirths,
    cheesedT: Math.ceil(S.cheesedT), quest: { ...S.save.quest }, panelOpen: S.panelOpen,
  };
}
