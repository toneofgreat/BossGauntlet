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
  OBBY_START, LETTUCE_KEYS,
} from "./scripts/layout.js";
import {
  SWORDS, HP_MAX, ABILITY_CD_S, CHEESE_CD_S, CHEESE_SLOW_S, BASE_WALK, BASE_JUMP,
  TW_STOP_CD_S, TW_STOP_R, TW_STOP_S, TW_FLING, TW_PORTAL_LIFE_S, TW_PORTAL_CD_S,
  swordById, isOwned, ownedSwords, INTRO_PAGES,
} from "./scripts/swords.js";
import { createQuest } from "./scripts/quest.js";
import { createTimewarp } from "./scripts/timewarp.js";
import { createBoards, rankRows } from "./scripts/board.js";
import { createVfx } from "./scripts/vfx.js";

export const meta = {
  slug: "battles",
  name: "Battles",
  icon: "⚔️",
  description: "Lobby, sword, arena. Kills unlock blades up to the one-shot Meteorbrand — and three swords no kill can buy.",
  version: "1.3.0",
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
    frozenT: 0,                   // §13: seconds of TIME STOP left on ME
    fling: null,                  // §13: {x0,y0,z0,dx,dz,t,dur} — I am mid-air, evicted
    portal: { a: null, b: null, aIds: [], bIds: [], life: 0, cd: 0, grace: 0 },
    stopSeq: 0,
    dummies: [],                  // {parts:[ids], x, z, hp, dead, respawnT}
    bushes: [],                   // {parts:[ids], x, z, t, dmgT} — thorn hazards
    vfx: [],                      // {ids:[...], t} transient parts
    meteors: [],                  // {id, x, z, y, dx, dz, t, trailT}
    labels: [], rootId: null,
    hitSeq: 0, deathSeq: 0, aoeSeq: 0, cheeseSeq: 0, idSeq: 0,
    myState: { inArena: false, hp: HP_MAX, kills: 0, sword: "basic", hit: null, death: null, aoe: null, cheese: null, cheesed: false, tk: 0, sw: 1, streak: 0, stop: null },
    seenHit: new Set(), seenDeath: new Set(), seenAoe: new Set(), seenCheese: new Set(), seenStop: new Set(),
    lastAttacker: null,
    panelOpen: false,
    quest: null, tw: null, boards: null, boardT: 0,
    gRows: null,                  // {kills:[rows], swords:[rows]} from the server, or null
    gFetchT: -1e9, gSubmitT: -1e9, gSentTk: -1, gSentSw: -1,
    attachT: 0,
    heldSwords: new Map(),        // rig root uuid -> {swordId, group, anchor}
    shells: new Map(),            // rig root uuid -> group (the yellow cheese coat)
    timers: [],                   // {t, fn} — sim-clock delays (no setTimeout in games)
    fx: null,                     // the juice engine (scripts/vfx.js)
    ambT: 0,                      // ambient-emitter tick (torch embers, pedestal motes)
    dustT: 0, lastPos: null,      // footstep dust
    auraT: 0,                     // equipped-sword aura trail tick
    lastHp: HP_MAX,               // for the HP-bar damage flash
  };
}

// ---- save ----------------------------------------------------------------------------
function freshQuest() { return { c1: false, c2: false, b1: false, b2: false, dec: false, stars: false, rocket: false }; }
function freshLettuces() { const o = {}; for (const k of LETTUCE_KEYS) o[k] = false; return o; }
function loadSave(ctx) {
  let s = null;
  try { s = ctx.services.saves.load(); } catch { s = null; }
  const d = {
    schemaVersion: SAVE_V, kills: 0, totalKills: 0, equipped: "basic", seenIntro: false,
    cheese: false, ks: false, streak: 0, bestStreak: 0, ksClaimed: false, rebirths: 0,
    quest: freshQuest(),
    tw: false, twTower: false, twl: freshLettuces(),
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
    d.tw = !!s.tw; d.twTower = !!s.twTower;
    if (s.twl && typeof s.twl === "object") for (const k of LETTUCE_KEYS) d.twl[k] = !!s.twl[k];
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
      tw: s.tw, twTower: s.twTower, twl: { ...s.twl },
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
function shake(ctx, i, d) { try { ctx.engine.camera.shake(i, d); } catch { /* fine */ } }
// A full-screen colour pop that fades right back out — hit reds, kill golds, splat yellows.
function screenFlash(color, alpha, durMs) {
  if (!dom) return;
  const o = dom.flashO;
  o.style.transition = "none";
  o.style.background = color;
  o.style.opacity = String(alpha);
  void o.offsetWidth; // commit the opaque frame so the fade below actually transitions
  o.style.transition = `opacity ${durMs || 300}ms ease-out`;
  o.style.opacity = "0";
}

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
  // §13: the Time Warp's portal gun (shares the grenade slot — the two never coexist)
  const pgBtn = btn("🌌", "position:fixed;right:16px;bottom:272px;z-index:55;background:linear-gradient(180deg,#2f6fd0,#12275e);font-size:20px;min-width:74px;display:none;");
  pgBtn.addEventListener("click", () => portalPress(ctx));
  // §13: the TIME STOP tint — shown while *I* am the one standing in stopped time
  const frzO = document.createElement("div");
  frzO.style.cssText = "position:fixed;inset:0;z-index:58;background:radial-gradient(circle,rgba(126,200,255,0.10),rgba(30,60,110,0.42));display:none;pointer-events:none;";
  const frzT = document.createElement("div");
  frzT.style.cssText = "position:absolute;left:50%;top:26%;transform:translateX(-50%);font:800 26px system-ui;color:#dff4ff;text-shadow:0 2px 8px #123;";
  frzT.textContent = "⌛ TIME HAS STOPPED";
  frzO.append(frzT);
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

  // the one-shot colour pop (hits, kills, splats) and the low-HP heartbeat vignette
  const flashO = document.createElement("div");
  flashO.style.cssText = "position:fixed;inset:0;z-index:57;opacity:0;pointer-events:none;";
  const vignO = document.createElement("div");
  vignO.style.cssText = "position:fixed;inset:0;z-index:56;opacity:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 46%,rgba(200,20,20,0.55) 100%);transition:opacity .25s;";

  document.body.append(hpWrap, atkBtn, abBtn, tpBtn, grBtn, flyBtn, claimBtn, pgBtn, frzO, aimLayer, flashO, vignO);
  return { hpWrap, hpFill, hpText, atkBtn, abBtn, tpBtn, grBtn, flyBtn, claimBtn, pgBtn, frzO, aimLayer, flashO, vignO };
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
  if (sw.id === "timewarp" && !own("timewarp")) return "⌛ ???\nthe pedestal ticks\nthe tower decides";
  const cost = sw.cost === null ? (sw.id === "cheese" ? "WIN THE OBBY" : sw.id === "timewarp" ? "TEN LETTUCES" : "???") : sw.cost === 0 ? "FREE" : sw.cost + " kills";
  const ab = sw.ability ? " • ⚡ ability" : (sw.passive ? " • buff" : "");
  const dmg = sw.id === "killstreak" ? "1+streak dmg" : `${sw.damage} dmg`;
  return `${sw.emoji} ${sw.name}\n${cost} • ${dmg}${ab}`;
}
function refreshLabels(ctx) {
  for (let i = 0; i < S.labels.length; i++) {
    const sw = SWORDS[i], owned = own(sw.id);
    const col = owned ? "#3ddc84" : sw.id === "killstreak" ? "#ff5a3a" : sw.id === "timewarp" ? "#7ec8ff" : "#e0b23a";
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
  // conjured dummies (the Trainer's Cleaver's ⚡) arrive in a puff of magic
  if (temp && S.fx) {
    S.fx.ring([x, FLOOR_TOP + 0.3, z], { color: "#ffd23a", r1: 4, life: 0.4 });
    S.fx.burst([x, FLOOR_TOP + 3, z], { count: 8, colors: ["#ffd23a", "#e8d6b0", "#ffffff"], speed: 4, up: 4, size: 0.26, life: 0.6, grav: 8 });
  }
}
function hitDummy(ctx, d, dmg) {
  d.hp -= dmg;
  for (const id of d.parts) { try { ctx.engine.parts.setColor(id, "#ff5a3a"); } catch { /* gone */ } }
  const at = [d.x, FLOOR_TOP + 3.4, d.z];
  if (S.fx) {
    // straw flies off with every whack, and the number tells you what the blade did
    S.fx.burst(at, { count: 7, colors: ["#d9c48f", "#c9b48f", "#e0cfa0"], speed: 7, up: 6, size: 0.34, life: 0.55, grav: 26 });
    S.fx.text([d.x, FLOOR_TOP + 5.6, d.z], "-" + dmg, { color: "#ffd23a", scale: 0.9, life: 0.8 });
  }
  if (d.hp <= 0) {
    for (const id of d.parts) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
    d.dead = true; d.respawnT = d.temp ? 999 : DUMMY_RESPAWN; d.parts = [];
    if (S.fx) {
      // the whole dummy lets go: a haystack of straw, splintered planks, the target ring
      S.fx.burst(at, { count: 16, colors: ["#d9c48f", "#c9b48f", "#e0cfa0", "#6b4423"], shapes: ["sphere", "shard", "box"], speed: 11, up: 9, size: 0.42, life: 0.85, grav: 30 });
      S.fx.burst([d.x, FLOOR_TOP + 3.1, d.z], { count: 5, colors: ["#c0392b", "#f5f5f5"], shapes: ["box"], speed: 9, up: 8, size: 0.5, life: 0.8, grav: 32 });
      S.fx.ring([d.x, FLOOR_TOP + 0.35, d.z], { color: "#d9c48f", r1: 6, life: 0.45 });
    }
    shake(ctx, 0.18, 0.22);
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
  if (!S.inArena || S.swingCd > 0 || S.frozenT > 0) return;
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
    const dmg = swingDamage();
    const hit = { id: S.hitSeq, target: bestP.id, dmg, poison: sw.passive && sw.passive.poison ? 1 : 0 };
    // §13: a Time Warp hit also EVICTS its victim — fifty studs, from me outward
    if (sw.id === "timewarp") {
      const dx = bestP.pos[0] - me[0], dz = bestP.pos[2] - me[2];
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      hit.fl = { dx: dx / len, dz: dz / len };
    }
    S.myState.hit = hit;
    publishSoon();
    // the CONNECT: sparks off the victim, the damage in the air, a kick in the camera
    if (S.fx) {
      const at = [bestP.pos[0], bestP.pos[1] + 3, bestP.pos[2]];
      S.fx.burst(at, { count: 10, colors: [sw.colors.edge, "#ffffff", "#ff5a3a"], shapes: ["shard", "sphere"], speed: 10, up: 5, size: 0.3, life: 0.4, grav: 20 });
      S.fx.text([at[0], at[1] + 2.2, at[2]], "-" + dmg, { color: "#ff5a3a", scale: 1.05, life: 0.9 });
      if (hit.poison) S.fx.burst(at, { count: 6, colors: ["#8be04a", "#3a7d2c"], speed: 5, up: 7, size: 0.28, life: 0.7, grav: 8 });
      if (sw.id === "timewarp") S.fx.burst(at, { count: 8, colors: ["#7ec8ff", "#dff4ff"], speed: 14, up: 4, size: 0.35, life: 0.45, stretch: 5, grav: 0 });
    }
    shake(ctx, 0.14, 0.18);
    sfx(ctx, "oof");
  } else if (bestD) {
    if (sw.id === "timewarp") flingTrailVfx(ctx, bestD.x, bestD.z, fx, fz);
    hitDummy(ctx, bestD, swingDamage());
  }
}
// The straw goes FLYING: a fading dotted arc along the fling direction (dummies cannot
// move, but the eye should still be told what this sword does).
function flingTrailVfx(ctx, x, z, fx, fz) {
  const ids = [];
  for (let k = 1; k <= 7; k++) {
    const d = k * 6.5, h = 3 + Math.sin((k / 7) * Math.PI) * 7;
    try { const id = uid("bt_flingdot_"); ctx.engine.parts.create({ id, shape: "sphere", size: [0.7, 0.7, 0.7], position: [x + fx * d, FLOOR_TOP + h, z + fz * d], color: k % 2 ? "#d9c48f" : "#7ec8ff", material: "neon", canCollide: false }); ids.push(id); } catch { /* fine */ }
  }
  S.vfx.push({ ids, t: 0.7 });
}
function slashVfx(ctx) {
  const me = ctx.player.position(); const [fx, fz] = facing(ctx);
  const sw = swordById(S.equipped);
  const yawDeg = Math.atan2(fx, fz) * 180 / Math.PI;
  const ids = [];
  // a five-blade crescent, edge colour fading to blade colour toward the rim
  for (let k = 0; k < 5; k++) {
    const t = (k - 2) * 0.55;
    const rim = Math.abs(k - 2) === 2;
    try {
      const id = uid("bt_slash_");
      ctx.engine.parts.create({ id, shape: "box", size: [rim ? 1.8 : 2.8, 0.14, 0.5], position: [me[0] + fx * (3 - Math.abs(t) * 0.5) + fz * t, me[1] + 3 - Math.abs(t) * 0.3, me[2] + fz * (3 - Math.abs(t) * 0.5) - fx * t], rotation: [0, yawDeg, 26 * (k - 2)], color: rim ? sw.colors.blade : sw.colors.edge, material: "neon", canCollide: false });
      ids.push(id);
    } catch { /* fine */ }
  }
  S.vfx.push({ ids, t: 0.16 });
  // sparks ride the arc, in the blade's own colours
  if (S.fx) {
    S.fx.burst([me[0] + fx * 3.4, me[1] + 3, me[2] + fz * 3.4], { count: 6, colors: [sw.colors.edge, sw.colors.gem], speed: 6, up: 3, size: 0.2, life: 0.35, grav: 10 });
  }
}

function abilityCooldownFor(sw) { return sw.ability === "cheese" ? CHEESE_CD_S : sw.ability === "timestop" ? TW_STOP_CD_S : ABILITY_CD_S; }
function useAbility(ctx) {
  if (!S.inArena || S.frozenT > 0) return;
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
    // the ground ITSELF objects: dust shockwaves, flying rock chips, a proper thud
    if (S.fx) {
      S.fx.ring([me[0], me[1] - 1, me[2]], { color: "#b09a68", r1: R + 2, life: 0.6 });
      S.fx.ring([me[0], me[1] - 0.9, me[2]], { color: "#c7cdd9", r1: R - 2, life: 0.45 });
      S.fx.burst([me[0], me[1], me[2]], { count: 18, colors: ["#565d70", "#3e444f", "#b09a68", "#c7cdd9"], shapes: ["shard", "box"], speed: 12, up: 10, size: 0.4, life: 0.8, grav: 34 });
    }
    shake(ctx, 0.45, 0.4);
    S.aoeSeq++; S.myState.aoe = { id: S.aoeSeq, x: me[0], z: me[2], r: R, dmg: 10 }; publishSoon();
    for (const d of S.dummies) { if (!d.dead && (d.x - me[0]) ** 2 + (d.z - me[2]) ** 2 <= R * R) hitDummy(ctx, d, 10); }
    sfx(ctx, "boing"); toast(ctx, "Spikes erupt! 10 damage each.", "🔨", 1800);
  } else if (sw.ability === "meteor") {
    const [fx, fz] = facing(ctx);
    const sx = me[0] + fx * 3, sz = me[2] + fz * 3, sy = me[1] + 12;
    try { const id = uid("bt_meteor_"); ctx.engine.parts.create({ id, shape: "sphere", size: [2.0, 2.0, 2.0], position: [sx, sy, sz], color: "#3a2418", material: "lava", canCollide: false }); S.meteors.push({ id, x: sx, y: sy, z: sz, dx: fx, dz: fz, t: 0, trailT: 0 }); } catch { /* fine */ }
    try { const id = uid("bt_meteor_"); ctx.engine.parts.create({ id, shape: "sphere", size: [2.6, 2.6, 2.6], position: [sx, sy, sz], color: "#ff8c1a", material: "neon", canCollide: false }); S.meteors[S.meteors.length - 1].glow = id; } catch { /* fine */ }
    // the summoning has a kick of its own: a launch flash and a plume of embers
    if (S.fx) {
      S.fx.burst([sx, sy, sz], { count: 12, colors: ["#ff8c1a", "#ffd23a", "#ff5a1f"], speed: 8, up: 2, size: 0.35, life: 0.5, grav: 4 });
      S.fx.ring([me[0], me[1] + 0.2, me[2]], { color: "#ff8c1a", r1: 6, life: 0.4 });
    }
    shake(ctx, 0.25, 0.3);
    sfx(ctx, "warp"); toast(ctx, "Meteor away — make it count!", "☄️", 1800);
  } else if (sw.ability === "dummies") {
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; spawnDummy(ctx, me[0] + Math.cos(a) * 5, me[2] + Math.sin(a) * 5, true); }
    sfx(ctx, "sparkle"); toast(ctx, "Training dummies conjured — cut them down!", "🎯", 1800);
  } else if (sw.ability === "bush") {
    spawnBush(ctx, me[0], me[2]);
    sfx(ctx, "sparkle"); toast(ctx, "A thorn bush bursts up — 10 damage to anyone near it!", "🌹", 2000);
  } else if (sw.ability === "timestop") {
    // §13: TIME STOP — everyone but ME, within TW_STOP_R, stands still for TW_STOP_S.
    // The stop travels the presence channel like an aoe; each victim freezes ITSELF.
    S.stopSeq++;
    S.myState.stop = { id: S.stopSeq, x: me[0], z: me[2] };
    publishSoon();
    const ids = [];
    for (let ring2 = 0; ring2 < 3; ring2++) {
      const r = 5 + ring2 * 6;
      try { const id = uid("bt_stopring_"); ctx.engine.parts.create({ id, shape: "cylinder", size: [r * 2, 0.25, r * 2], position: [me[0], me[1] + 0.2 + ring2 * 0.15, me[2]], color: ring2 % 2 ? "#7ec8ff" : "#dff4ff", material: "neon", canCollide: false }); ids.push(id); } catch { /* fine */ }
    }
    for (let k = 0; k < 12; k++) {
      const a = k * 0.5236;
      try { const id = uid("bt_stoptick_"); ctx.engine.parts.create({ id, shape: "box", size: [0.5, 5.5, 0.5], position: [me[0] + Math.cos(a) * 14, me[1] + 2.8, me[2] + Math.sin(a) * 14], rotation: [0, -a * 57.29578, 0], color: k % 3 === 0 ? "#e0b23a" : "#7ec8ff", material: "neon", canCollide: false }); ids.push(id); } catch { /* fine */ }
    }
    S.vfx.push({ ids, t: TW_STOP_S });
    // time SHATTERS outward: three staggered shockwaves and a field of hanging frost
    if (S.fx) {
      for (let w = 0; w < 3; w++) later(w * 0.15, () => { if (S && S.fx) S.fx.ring([me[0], me[1] + 0.25 + w * 0.2, me[2]], { color: w % 2 ? "#dff4ff" : "#7ec8ff", r1: TW_STOP_R + w * 3, life: 0.7 }); });
      for (let s = 0; s < 24; s++) {
        const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * (TW_STOP_R - 4);
        S.fx.spawn([me[0] + Math.cos(a) * r, me[1] + 1 + Math.random() * 6, me[2] + Math.sin(a) * r], { shape: "shard", color: s % 3 ? "#7ec8ff" : "#dff4ff", size: 0.22, vel: [0, 0.3, 0], grav: 0, spin: 1.2, life: TW_STOP_S, opacity: 0.8 });
      }
    }
    screenFlash("#7ec8ff", 0.2, 500);
    try { ctx.engine.camera.shake(0.3, 0.35); } catch { /* fine */ }
    sfx(ctx, "warp");
    toast(ctx, "⌛ TIME STOP. For three seconds, the arena belongs to you.", "⌛", 2600);
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
      try { const id = uid("bt_cheese_"); ctx.engine.parts.create({ id, shape: "wedge", size: [0.8, 0.8, 1.2], position: [x, y, z], color: "#e8b62a", material: "plastic", canCollide: false }); c.ids.push(id); } catch { /* fine */ }
    } else {
      try { ctx.engine.parts.setPosition(c.ids[0], [x, y, z]); } catch { /* gone */ }
      // the wedge tumbles around the glow ball, dripping as it goes
      if (c.ids[1]) { try { ctx.engine.parts.setPosition(c.ids[1], [x, y + 0.1, z]); ctx.engine.parts.setRotation(c.ids[1], [c.t * 900, c.t * 620, 0]); } catch { /* gone */ } }
      if (S.fx && Math.floor(c.t * 20) !== Math.floor((c.t - dt) * 20)) S.fx.spawn([x, y - 0.4, z], { shape: "sphere", color: "#ffd23a", size: 0.28, vel: [0, -1, 0], grav: 20, life: 0.5 });
    }
    if (k >= 1) {
      for (const id of c.ids) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
      // the splat: a burst of yellow
      const ex = [];
      for (let s = 0; s < 8; s++) { const a = s * 0.785; try { const id = uid("bt_splat_"); ctx.engine.parts.create({ id, shape: "sphere", size: [0.6, 0.6, 0.6], position: [c.to[0] + Math.cos(a) * 1.2, c.to[1] + (s % 3) * 0.5 - 0.5, c.to[2] + Math.sin(a) * 1.2], color: s % 2 ? "#ffd23a" : "#e8b62a", material: "neon", canCollide: false }); ex.push(id); } catch { /* fine */ } }
      S.vfx.push({ ids: ex, t: 0.7 });
      // fondue everywhere: a shockwave, flying gobs, and a puddle that outstays its welcome
      if (S.fx) {
        S.fx.ring([c.to[0], c.to[1] - 2.2, c.to[2]], { color: "#ffd23a", r1: 5, life: 0.5 });
        S.fx.ring([c.to[0], c.to[1] - 2.3, c.to[2]], { color: "#e8b62a", r1: 3.2, life: 2.2, fill: true, opacity: 0.65 });
        S.fx.burst([c.to[0], c.to[1], c.to[2]], { count: 12, colors: ["#ffd23a", "#e8b62a", "#fff3b0"], speed: 7, up: 8, size: 0.34, life: 0.8, grav: 26 });
        S.fx.text([c.to[0], c.to[1] + 2.4, c.to[2]], "SPLAT!", { color: "#ffd23a", scale: 1.1, life: 1.0 });
      }
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
  screenFlash("#ffd23a", 0.3, 500);
  shake(ctx, 0.3, 0.3);
  if (S.fx) {
    const me = ctx.player.position();
    S.fx.burst([me[0], me[1] + 3, me[2]], { count: 10, colors: ["#ffd23a", "#e8b62a"], speed: 5, up: 6, size: 0.35, life: 0.8, grav: 18 });
  }
  toast(ctx, "SPLAT! You are cheese now. Slow and yellow for 10 seconds.", "🧀", 3000);
  sfx(ctx, "pop");
}

// ---- killstreak powers (§11) --------------------------------------------------------
function ksTier() { return swordById(S.equipped).id === "killstreak" ? S.save.streak : -1; }
function ksTeleport(ctx) {
  if (!S.inArena || S.frozenT > 0 || ksTier() < KS_TIERS[0]) return;
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
  // red lightning between the two spots: bursts at both ends, streaks along the path
  if (S.fx) {
    S.fx.burst([me[0], me[1] + 2.5, me[2]], { count: 8, colors: ["#ff2a2a", "#ff5a3a"], shapes: ["shard"], speed: 6, up: 4, size: 0.3, life: 0.4, grav: 8 });
    S.fx.burst([nx, me[1] + 2.5, nz], { count: 10, colors: ["#ff2a2a", "#ffffff"], shapes: ["shard", "sphere"], speed: 7, up: 5, size: 0.3, life: 0.5, grav: 8 });
    S.fx.ring([nx, me[1] + 0.3, nz], { color: "#ff2a2a", r1: 6, life: 0.45 });
    const ddx = nx - me[0], ddz = nz - me[2];
    for (let s = 1; s < 6; s++) S.fx.spawn([me[0] + ddx * (s / 6), me[1] + 2.5, me[2] + ddz * (s / 6)], { shape: "box", color: "#ff5a3a", size: 0.6, vel: [ddx * 0.35, 0, ddz * 0.35], grav: 0, life: 0.3, stretch: 6 });
  }
  try { ctx.player.teleport([nx, me[1] + 0.5, nz]); } catch { /* fine */ }
  shake(ctx, 0.2, 0.2);
  S.ksCd.tp = KS_TP_CD;
  sfx(ctx, "warp");
}
function ksGrenade(ctx) {
  if (!S.inArena || S.frozenT > 0 || ksTier() < KS_TIERS[1]) return;
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
    try { ctx.engine.parts.setRotation(g.id, [g.t * 720, 0, g.t * 400]); } catch { /* gone */ }
    // the fuse blinks faster the longer it flies, and it leaves a thread of smoke
    g.blinkT = (g.blinkT || 0) - dt;
    if (g.blinkT <= 0) {
      g.blinkT = Math.max(0.06, 0.25 - g.t * 0.08);
      g.lit = !g.lit;
      try { ctx.engine.parts.setColor(g.id, g.lit ? "#ff2a2a" : "#12141c"); } catch { /* gone */ }
      if (S.fx) S.fx.spawn([g.x, g.y + 0.5, g.z], { shape: "sphere", color: "#565d70", size: 0.4, vel: [0, 2, 0], grav: -1, life: 0.6, opacity: 0.5 });
    }
    if (g.y <= FLOOR_TOP + 0.6 || g.t > 2.4) {
      try { ctx.engine.parts.remove(g.id); } catch { /* gone */ }
      const ex = [];
      for (let k = 0; k < 14; k++) { const a = k * 0.45; try { const id = uid("bt_boom_"); ctx.engine.parts.create({ id, shape: k % 2 ? "sphere" : "wedge", size: [1.2, 1.2, 1.2], position: [g.x + Math.cos(a) * (1 + k % 4), g.y + 0.4 + (k % 3) * 0.7, g.z + Math.sin(a) * (1 + k % 4)], rotation: [0, a * 57, 0], color: ["#ff5a1f", "#ffd23a", "#ff2a2a", "#3e444f"][k % 4], material: "neon", canCollide: false }); ex.push(id); } catch { /* fine */ } }
      S.vfx.push({ ids: ex, t: 0.6 });
      // the BOOM proper: double shockwave, shrapnel, and a column of climbing smoke
      if (S.fx) {
        S.fx.ring([g.x, g.y + 0.2, g.z], { color: "#ff5a1f", r1: 11, life: 0.5 });
        S.fx.ring([g.x, g.y + 0.35, g.z], { color: "#ffd23a", r1: 7, life: 0.4 });
        S.fx.burst([g.x, g.y + 0.8, g.z], { count: 16, colors: ["#ff5a1f", "#ffd23a", "#3e444f", "#12141c"], shapes: ["shard", "box"], speed: 12, up: 10, size: 0.36, life: 0.8, grav: 30 });
        for (let s = 0; s < 6; s++) S.fx.spawn([g.x, g.y + 1, g.z], { shape: "sphere", color: s % 2 ? "#3e444f" : "#565d70", size: 1.2 + s * 0.15, vel: [(Math.random() - 0.5) * 3, 5 + s * 1.5, (Math.random() - 0.5) * 3], grav: -3, life: 1.3, opacity: 0.55 });
      }
      shake(ctx, 0.55, 0.45);
      screenFlash("#ff8c1a", 0.16, 400);
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
    // takeoff: a downdraft ring and a puff of feathers
    if (S.fx) {
      const me = ctx.player.position();
      S.fx.ring([me[0], me[1] + 0.2, me[2]], { color: "#dff4ff", r1: 7, life: 0.5 });
      S.fx.burst([me[0], me[1] + 2, me[2]], { count: 10, colors: ["#ffffff", "#dff4ff", "#35a3e0"], speed: 5, up: 3, size: 0.3, life: 0.9, grav: 3, drag: 2.5 });
    }
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

// ---- §13: stopped time, the fifty-stud fling, and the portal gun ---------------------
function applyFrozen(ctx) {
  S.frozenT = TW_STOP_S;
  try { ctx.player.setWalkSpeed(0); } catch { /* fine */ }
  try { ctx.player.setJumpPower(0); } catch { /* fine */ }
  if (dom) dom.frzO.style.display = "block";
  // ice crawls up the statue that used to be you
  if (S.fx) {
    const me = ctx.player.position();
    for (let s = 0; s < 10; s++) S.fx.spawn([me[0] + (Math.random() - 0.5) * 2.5, me[1] + Math.random() * 5, me[2] + (Math.random() - 0.5) * 2.5], { shape: "shard", color: s % 2 ? "#7ec8ff" : "#dff4ff", size: 0.3, vel: [0, 0.2, 0], grav: 0, spin: 0.6, life: TW_STOP_S, opacity: 0.85 });
  }
  screenFlash("#7ec8ff", 0.25, 500);
  sfx(ctx, "denied");
  toast(ctx, "⌛ Someone stopped time. You are a statue for three seconds.", "🧊", 2600);
}
function clearFrozen(ctx) {
  if (S.frozenT <= 0 && dom && dom.frzO.style.display === "none") return;
  S.frozenT = 0;
  if (dom) dom.frzO.style.display = "none";
  // the ice lets go all at once — a shatter of pale blue
  if (S.fx) {
    const me = ctx.player.position();
    S.fx.burst([me[0], me[1] + 2.5, me[2]], { count: 12, colors: ["#7ec8ff", "#dff4ff", "#ffffff"], shapes: ["shard"], speed: 8, up: 6, size: 0.3, life: 0.6, grav: 24 });
    S.fx.ring([me[0], me[1] + 0.3, me[2]], { color: "#dff4ff", r1: 5, life: 0.4 });
  }
  applyPassives(ctx);
}
function startFling(ctx, fl) {
  const me = ctx.player.position();
  S.fling = { x0: me[0], y0: me[1], z0: me[2], dx: fl.dx || 0, dz: fl.dz || 0, t: 0, dur: 0.7 };
  try { ctx.engine.camera.shake(0.5, 0.5); } catch { /* fine */ }
  sfx(ctx, "boing");
  toast(ctx, "⌛ EVICTED — the Time Warp throws you fifty studs!", "💨", 2200);
}
function stepFling(ctx, dt) {
  if (!S.fling) return;
  const f = S.fling;
  f.t += dt;
  const k = Math.min(1, f.t / f.dur);
  const x = f.x0 + f.dx * TW_FLING * k;
  const z = f.z0 + f.dz * TW_FLING * k;
  const y = f.y0 + Math.sin(k * Math.PI) * 9;
  try { ctx.player.teleport([x, y, z]); } catch { /* fine */ }
  // wind screams past — pale streaks peel off the flight path
  if (S.fx && Math.floor(f.t * 30) !== Math.floor((f.t - dt) * 30)) {
    S.fx.spawn([x + (Math.random() - 0.5) * 2, y + 1 + Math.random() * 2, z + (Math.random() - 0.5) * 2], { shape: "box", color: "#dff4ff", size: 0.5, vel: [-f.dx * 18, 0, -f.dz * 18], grav: 0, life: 0.35, stretch: 7, opacity: 0.7 });
  }
  if (k >= 1) {
    S.fling = null; // wherever you are now, gravity owns the rest
    if (S.fx) S.fx.ring([x, y - 1.5, z], { color: "#7ec8ff", r1: 5, life: 0.4 });
  }
}
function portalPress(ctx) {
  if (!S.inArena || S.frozenT > 0) return;
  const P2 = S.portal;
  if (P2.a && P2.b) { toast(ctx, "A pair is already open. Use them!", "🌌", 1600); return; }
  if (!P2.a && P2.cd > 0) { toast(ctx, `The gun recharges — ${Math.ceil(P2.cd)}s`, "🌌", 1600); return; }
  const me = ctx.player.position();
  const [fx, fz] = facing(ctx);
  const pos = [me[0] + fx * 3, me[1], me[2] + fz * 3];
  // keep every portal inside the arena so it never dangles over the void
  const dx = pos[0] - ARENA_CENTER[0], dz = pos[2] - ARENA_CENTER[1];
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist > ARENA_RADIUS - 3) { const k2 = (ARENA_RADIUS - 3) / dist; pos[0] = ARENA_CENTER[0] + dx * k2; pos[2] = ARENA_CENTER[1] + dz * k2; }
  if (!P2.a) {
    P2.a = pos; P2.aIds = buildPortal(ctx, pos, "#35a3e0");
    sfx(ctx, "warp");
    toast(ctx, "Portal ONE cut. Walk somewhere else and cut the second.", "🌌", 2600);
  } else {
    P2.b = pos; P2.bIds = buildPortal(ctx, pos, "#ff8c1a");
    P2.life = TW_PORTAL_LIFE_S; P2.cd = TW_PORTAL_CD_S; P2.grace = 1.2;
    sfx(ctx, "warp");
    toast(ctx, "Portal TWO cut. Step in either — 30 seconds, then they close.", "🌌", 2600);
  }
  refreshAbilityBtn();
}
function buildPortal(ctx, pos, col) {
  const ids = [];
  const push = (def) => { try { const id = uid("bt_portal_"); ctx.engine.parts.create({ id, canCollide: false, ...def }); ids.push(id); } catch { /* fine */ } };
  push({ shape: "cylinder", size: [4.4, 0.25, 4.4], position: [pos[0], pos[1] + 0.15, pos[2]], color: col, material: "neon" });
  push({ shape: "cylinder", size: [3.2, 0.3, 3.2], position: [pos[0], pos[1] + 0.22, pos[2]], color: "#0a0716", material: "plastic" });
  for (let k = 0; k < 6; k++) { const a = k * 1.047; push({ size: [0.28, 4.5, 0.28], position: [pos[0] + Math.cos(a) * 1.7, pos[1] + 2.3, pos[2] + Math.sin(a) * 1.7], rotation: [0, -a * 57.29578, 0], color: col, material: "neon" }); }
  push({ shape: "cylinder", size: [3.4, 0.22, 3.4], position: [pos[0], pos[1] + 4.7, pos[2]], color: col, material: "neon" });
  return ids;
}
function clearPortals(ctx, quiet) {
  const P2 = S.portal;
  for (const id of P2.aIds.concat(P2.bIds)) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
  const had = P2.a && P2.b;
  P2.a = null; P2.b = null; P2.aIds = []; P2.bIds = []; P2.life = 0; P2.grace = 0;
  if (had && !quiet) toast(ctx, "The portals sigh shut.", "🌌", 1800);
}
function stepPortals(ctx, dt) {
  const P2 = S.portal;
  if (P2.cd > 0) { P2.cd = Math.max(0, P2.cd - dt); refreshAbilityBtn(); }
  if (!P2.a || !P2.b) return;
  P2.life -= dt;
  if (P2.life <= 0) { clearPortals(ctx, false); return; }
  // both mouths churn: motes spiral up out of each, blue from one, orange from the other
  P2.swirlT = (P2.swirlT || 0) - dt;
  if (P2.swirlT <= 0 && S.fx) {
    P2.swirlT = 0.12;
    for (const [p, col] of [[P2.a, "#35a3e0"], [P2.b, "#ff8c1a"]]) {
      const a = (S.runT * 4) % (Math.PI * 2);
      S.fx.spawn([p[0] + Math.cos(a) * 1.6, p[1] + 0.4, p[2] + Math.sin(a) * 1.6], { shape: "sphere", color: col, size: 0.24, vel: [-Math.sin(a) * 3, 3.2, Math.cos(a) * 3], grav: -1, life: 0.9 });
    }
  }
  if (P2.grace > 0) { P2.grace -= dt; return; }
  const me = ctx.player.position();
  const near = (p) => (me[0] - p[0]) ** 2 + (me[2] - p[2]) ** 2 <= 2.3 * 2.3 && Math.abs(me[1] - p[1]) < 4.5;
  const to = near(P2.a) ? P2.b : near(P2.b) ? P2.a : null;
  if (to) {
    const from = near(P2.a) ? P2.a : P2.b;
    if (S.fx) {
      S.fx.burst([from[0], from[1] + 2.5, from[2]], { count: 8, colors: ["#35a3e0", "#dff4ff"], speed: 6, up: 4, size: 0.3, life: 0.5, grav: 6 });
      S.fx.burst([to[0], to[1] + 2.5, to[2]], { count: 10, colors: ["#ff8c1a", "#ffd23a", "#dff4ff"], speed: 7, up: 5, size: 0.3, life: 0.6, grav: 6 });
      S.fx.ring([to[0], to[1] + 0.3, to[2]], { color: "#ff8c1a", r1: 5, life: 0.45 });
    }
    screenFlash("#35a3e0", 0.16, 350);
    try { ctx.player.teleport([to[0], to[1] + 0.4, to[2]]); } catch { /* fine */ }
    P2.grace = 1.2;
    sfx(ctx, "warp");
  }
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
  // it BURSTS out of the ground: soil, leaves and a scatter of rose petals
  if (S.fx) {
    S.fx.ring([x, FLOOR_TOP + 0.25, z], { color: "#3a2414", r1: 5, life: 0.5 });
    S.fx.burst([x, FLOOR_TOP + 1.5, z], { count: 14, colors: ["#3ddc84", "#2f8f4a", "#3a2414", "#e0245e"], shapes: ["shard", "sphere"], speed: 7, up: 9, size: 0.3, life: 0.8, grav: 20 });
  }
  S.bushes.push({ parts, x, z, t: 0, dmgT: 0.6, petalT: 0 });
}
function stepBushes(ctx, dt) {
  for (let i = S.bushes.length - 1; i >= 0; i--) {
    const b = S.bushes[i]; b.t += dt;
    if (b.t >= BUSH_LIFE) {
      for (const id of b.parts) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
      // it wilts in a sigh of dead leaves
      if (S.fx) S.fx.burst([b.x, FLOOR_TOP + 1.5, b.z], { count: 10, colors: ["#6b4423", "#3a2414", "#2f8f4a"], speed: 3, up: 2, size: 0.28, life: 1.0, grav: 6, drag: 2 });
      S.bushes.splice(i, 1); continue;
    }
    // rose petals drift off it the whole time it lives
    b.petalT = (b.petalT || 0) - dt;
    if (b.petalT <= 0 && S.fx) {
      b.petalT = 0.45;
      const a = Math.random() * Math.PI * 2;
      S.fx.spawn([b.x + Math.cos(a) * 1.4, FLOOR_TOP + 2.6, b.z + Math.sin(a) * 1.4], { shape: "box", color: Math.random() < 0.5 ? "#e0245e" : "#3ddc84", size: 0.22, vel: [Math.cos(a) * 1.5, 0.8, Math.sin(a) * 1.5], grav: 2.5, spin: 5, life: 1.4, drag: 1 });
    }
    b.dmgT -= dt;
    if (b.dmgT <= 0) {
      b.dmgT = 1;
      // the thorns flex — a ring of red sparks marks the bite radius
      if (S.fx) S.fx.ring([b.x, FLOOR_TOP + 0.3, b.z], { color: "#e0245e", r1: BUSH_R, life: 0.4, opacity: 0.5 });
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
    try { ctx.engine.parts.setRotation(m.id, [m.t * 540, m.t * 360, 0]); } catch { /* gone */ }
    if (m.glow) { try { ctx.engine.parts.setPosition(m.glow, [m.x, m.y, m.z]); } catch { /* gone */ } }
    m.trailT -= dt;
    if (m.trailT <= 0) {
      m.trailT = 0.04;
      try { const id = uid("bt_ember_"); ctx.engine.parts.create({ id, shape: "sphere", size: [0.9, 0.9, 0.9], position: [m.x, m.y + 0.4, m.z], color: ["#ff8c1a", "#ffd23a", "#ff5a1f"][S.idSeq % 3], material: "neon", canCollide: false }); S.vfx.push({ ids: [id], t: 0.35 }); } catch { /* fine */ }
      // smoke boils off behind the fireball and ember flecks spit sideways
      if (S.fx) {
        S.fx.spawn([m.x - m.dx * 2, m.y + 1.2, m.z - m.dz * 2], { shape: "sphere", color: S.idSeq % 2 ? "#3e444f" : "#2a2f3a", size: 1.1, vel: [(Math.random() - 0.5) * 2, 3.5, (Math.random() - 0.5) * 2], grav: -2, life: 0.8, opacity: 0.55 });
        S.fx.spawn([m.x, m.y, m.z], { shape: "shard", color: "#ffd23a", size: 0.25, vel: [(Math.random() - 0.5) * 10, 2, (Math.random() - 0.5) * 10], grav: 22, life: 0.45 });
      }
    }
    let hit = false;
    for (const p of rosterSafe(ctx)) { if (!p.pos) continue; if ((p.pos[0] - m.x) ** 2 + (p.pos[2] - m.z) ** 2 <= 9) { S.hitSeq++; S.myState.hit = { id: S.hitSeq, target: p.id, dmg: 9999, poison: 0 }; publishSoon(); hit = true; break; } }
    for (const d of S.dummies) { if (!d.dead && (d.x - m.x) ** 2 + (d.z - m.z) ** 2 <= 9) { hitDummy(ctx, d, 9999); hit = true; } }
    if (hit || m.t > 2.4 || m.y <= FLOOR_TOP + 1.1) {
      const ex = [];
      for (let k = 0; k < 12; k++) { const a = k * 0.52; try { const id = uid("bt_boom_"); ctx.engine.parts.create({ id, shape: k % 2 ? "sphere" : "wedge", size: [1.1, 1.1, 1.1], position: [m.x + Math.cos(a) * (1 + k % 3), m.y + (k % 3) * 0.6, m.z + Math.sin(a) * (1 + k % 3)], rotation: [0, a * 57, 0], color: ["#ff5a1f", "#ffd23a", "#3a2418", "#ff8c1a"][k % 4], material: k % 3 ? "neon" : "lava", canCollide: false }); ex.push(id); } catch { /* fine */ } }
      S.vfx.push({ ids: ex, t: 0.6 });
      // impact: three stacked shockwaves, a scorch that lingers, and a fountain of fire
      if (S.fx) {
        S.fx.ring([m.x, m.y + 0.15, m.z], { color: "#ff5a1f", r1: 14, life: 0.6 });
        S.fx.ring([m.x, m.y + 0.3, m.z], { color: "#ffd23a", r1: 10, life: 0.45 });
        S.fx.ring([m.x, m.y + 0.1, m.z], { color: "#2a1408", r1: 5.5, life: 3.2, fill: true, opacity: 0.7 });
        S.fx.burst([m.x, m.y + 1, m.z], { count: 20, colors: ["#ff5a1f", "#ffd23a", "#ff8c1a", "#3a2418"], shapes: ["sphere", "shard"], speed: 11, up: 14, size: 0.45, life: 0.9, grav: 26 });
        for (let s = 0; s < 5; s++) S.fx.spawn([m.x, m.y + 1.5, m.z], { shape: "sphere", color: "#3e444f", size: 1.4, vel: [(Math.random() - 0.5) * 4, 6 + s, (Math.random() - 0.5) * 4], grav: -3, life: 1.2, opacity: 0.5 });
      }
      shake(ctx, hit ? 0.8 : 0.55, 0.5);
      if (hit) { screenFlash("#ff8c1a", 0.28, 600); toast(ctx, "METEOR HIT — obliterated!", "☄️", 2200); sfx(ctx, "win"); } else { sfx(ctx, "boing"); }
      try { ctx.engine.parts.remove(m.id); } catch { /* gone */ }
      if (m.glow) { try { ctx.engine.parts.remove(m.glow); } catch { /* gone */ } }
      S.meteors.splice(i, 1);
    }
  }
}

// ---- the ambient layer: the world never sits still -----------------------------------
// Torches spit embers, pedestals breathe motes in their blade's colour, the arena air
// carries battle-dust, running kicks up dirt, and the showpiece swords trail their own
// weather. All of it render-side, all of it distance-culled around the player.
function stepAmbient(ctx, dt) {
  if (!S.fx) return;
  const me = ctx.player.position();
  S.ambT -= dt;
  if (S.ambT <= 0) {
    S.ambT = 0.14;
    const torches = (S.world && S.world.torches) || [];
    let lit = 0;
    for (const t of torches) {
      if ((t.x - me[0]) ** 2 + (t.z - me[2]) ** 2 > 45 * 45) continue;
      if (Math.random() < 0.4) continue;
      S.fx.spawn([t.x + (Math.random() - 0.5) * 0.5, t.y, t.z + (Math.random() - 0.5) * 0.5], { shape: "sphere", color: Math.random() < 0.3 ? "#ffe45c" : t.color, size: 0.15 + Math.random() * 0.12, vel: [(Math.random() - 0.5) * 0.8, 2.2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.8], grav: -0.5, life: 0.9, drag: 0.5 });
      if (++lit >= 6) break;
    }
    if (!S.inArena) {
      for (const pad of S.world.swordPads) {
        if ((pad.center[0] - me[0]) ** 2 + (pad.center[2] - me[2]) ** 2 > 40 * 40 || Math.random() < 0.55) continue;
        const sw = swordById(pad.id);
        const a = Math.random() * Math.PI * 2, r = 1.4 + Math.random() * 1.6;
        S.fx.spawn([pad.center[0] + Math.cos(a) * r, pad.center[1] - 1.2, pad.center[2] + Math.sin(a) * r], { shape: "sphere", color: sw.colors.gem, size: 0.14, vel: [0, 1.6 + Math.random(), 0], grav: -0.6, life: 1.4, opacity: 0.9 });
      }
    } else if (Math.random() < 0.5) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * ARENA_RADIUS * 0.8;
      S.fx.spawn([ARENA_CENTER[0] + Math.cos(a) * r, FLOOR_TOP + 0.6 + Math.random() * 5, ARENA_CENTER[1] + Math.sin(a) * r], { shape: "sphere", color: Math.random() < 0.5 ? "#ff8c1a" : "#e0b23a", size: 0.13, vel: [(Math.random() - 0.5) * 1.2, 0.7, (Math.random() - 0.5) * 1.2], grav: -0.3, life: 2.0, opacity: 0.7 });
    }
  }
  // footstep dust — only when actually moving flat-out along the ground
  S.dustT -= dt;
  if (S.dustT <= 0) {
    S.dustT = 0.16;
    if (S.lastPos) {
      const dx = me[0] - S.lastPos[0], dz = me[2] - S.lastPos[2], dy = Math.abs(me[1] - S.lastPos[1]);
      if (Math.hypot(dx, dz) / 0.16 > 8 && dy < 0.5) {
        S.fx.spawn([me[0] - dx * 2, me[1] + 0.25, me[2] - dz * 2], { shape: "sphere", color: "#b09a68", size: 0.32, vel: [-dx * 1.5, 1.2, -dz * 1.5], grav: 2, life: 0.5, opacity: 0.5 });
      }
    }
    S.lastPos = [me[0], me[1], me[2]];
  }
  // the showpiece blades carry their own weather
  S.auraT -= dt;
  if (S.auraT <= 0) {
    S.auraT = 0.22;
    const sw = swordById(S.equipped);
    if (S.inArena && sw.id === "killstreak" && S.save.streak >= 10) {
      S.fx.spawn([me[0] + (Math.random() - 0.5) * 1.6, me[1] + 1 + Math.random() * 3, me[2] + (Math.random() - 0.5) * 1.6], { shape: "shard", color: Math.random() < 0.5 ? "#ff2a2a" : "#ff5a3a", size: 0.2, vel: [0, 1.8, 0], grav: -1, life: 0.8 });
    } else if (S.inArena && sw.id === "timewarp") {
      S.fx.spawn([me[0] + (Math.random() - 0.5) * 1.6, me[1] + 1.5 + Math.random() * 2.5, me[2] + (Math.random() - 0.5) * 1.6], { shape: "box", color: Math.random() < 0.5 ? "#7ec8ff" : "#e0b23a", size: 0.16, vel: [0, 1, 0], grav: -0.8, spin: 3, life: 1.0, opacity: 0.85 });
    }
    if (S.cheesedT > 0) {
      S.fx.spawn([me[0] + (Math.random() - 0.5) * 1.5, me[1] + 2.5, me[2] + (Math.random() - 0.5) * 1.5], { shape: "sphere", color: "#ffd23a", size: 0.25, vel: [0, -1, 0], grav: 14, life: 0.6 });
    }
    if (S.flying) {
      S.fx.spawn([me[0], me[1] + 0.5, me[2]], { shape: "box", color: "#dff4ff", size: 0.35, vel: [(Math.random() - 0.5) * 2, -2, (Math.random() - 0.5) * 2], grav: 0, life: 0.4, stretch: 5, opacity: 0.6 });
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
  // being hit HURTS: red pop, camera kick, a spray of red off my own avatar
  screenFlash("#c0392b", Math.min(0.1 + dmg * 0.012, 0.4), 320);
  shake(ctx, Math.min(0.15 + dmg * 0.015, 0.55), 0.28);
  if (S.fx) {
    const me = ctx.player.position();
    S.fx.burst([me[0], me[1] + 3, me[2]], { count: 8, colors: ["#ff5a3a", "#c0392b", "#ffffff"], shapes: ["shard", "sphere"], speed: 8, up: 5, size: 0.28, life: 0.45, grav: 22 });
    if (poison) S.fx.burst([me[0], me[1] + 3.5, me[2]], { count: 6, colors: ["#8be04a", "#3a7d2c"], speed: 4, up: 6, size: 0.26, life: 0.8, grav: 6 });
  }
  if (S.hp <= 0) die(ctx);
  else { publishSoon(); refreshHp(); }
}
function die(ctx) {
  S.deathSeq++;
  S.myState.death = { id: S.deathSeq, killer: S.lastAttacker || null };
  // go out with a bang: my whole cube bursts into pieces where I stood
  if (S.fx) {
    const me = ctx.player.position();
    S.fx.burst([me[0], me[1] + 2.5, me[2]], { count: 22, colors: ["#ff5a3a", "#c0392b", "#3e444f", "#ffffff"], shapes: ["box", "shard", "sphere"], speed: 13, up: 11, size: 0.5, life: 0.9, grav: 30 });
    S.fx.ring([me[0], me[1] + 0.3, me[2]], { color: "#ff5a3a", r1: 10, life: 0.5 });
    S.fx.text([me[0], me[1] + 5, me[2]], "OOF", { color: "#ff5a3a", scale: 1.5, life: 1.2 });
  }
  screenFlash("#7d1f16", 0.5, 700);
  shake(ctx, 0.7, 0.5);
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
  // every kill is a little party: gold confetti off me and the count in the air
  if (S.fx) {
    const me = ctx.player.position();
    S.fx.burst([me[0], me[1] + 4, me[2]], { count: 12, colors: ["#ffd23a", "#fff3b0", "#e0b23a", "#ffffff"], shapes: ["box", "sphere"], speed: 7, up: 9, size: 0.3, life: 1.0, grav: 14, spin: 8 });
    S.fx.text([me[0], me[1] + 6.4, me[2]], "+1 KILL", { color: "#ffd23a", scale: 1.1, life: 1.1 });
  }
  screenFlash("#e0b23a", 0.14, 380);
  if (S.inArena && swordById(S.equipped).id === "killstreak") {
    S.save.streak += 1;
    if (S.save.streak > S.save.bestStreak) S.save.bestStreak = S.save.streak;
    if (KS_TIERS.includes(S.save.streak)) {
      const names = { 10: "TELEPORT 🌀", 50: "GRENADE 💣", 100: "FLIGHT 🕊️", 250: "THE CROWN 👑 — claim your aura and garb" };
      toast(ctx, `${S.save.streak} STREAK. The blade learns: ${names[S.save.streak]}.`, "🩸", 4600);
      sfx(ctx, "badge");
      // a tier waking up gets the full treatment — red shockwaves and a firework fan
      if (S.fx) {
        const me = ctx.player.position();
        S.fx.ring([me[0], me[1] + 0.3, me[2]], { color: "#ff2a2a", r1: 16, life: 0.8 });
        for (let w = 0; w < 3; w++) later(w * 0.25, () => { if (!S || !S.fx) return; const p = ctx.player.position(); S.fx.burst([p[0], p[1] + 5 + w * 2, p[2]], { count: 12, colors: ["#ff2a2a", "#ff5a3a", "#ffd23a"], speed: 9, up: 6, size: 0.32, life: 0.9, grav: 12 }); });
      }
      screenFlash("#ff2a2a", 0.22, 600);
      shake(ctx, 0.4, 0.4);
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
      // fireworks over the newly-lit pedestal, in the new blade's own colours
      const pad = S.world && S.world.swordPads.find((p) => p.id === sw.id);
      if (pad && S.fx) {
        for (let w = 0; w < 4; w++) {
          later(w * 0.3, () => {
            if (!S || !S.fx) return;
            S.fx.burst([pad.center[0], pad.center[1] + 3 + w, pad.center[2]], { count: 14, colors: [sw.colors.edge, sw.colors.gem, sw.colors.blade, "#ffffff"], shapes: ["sphere", "shard"], speed: 8, up: 8, size: 0.3, life: 1.0, grav: 10 });
            S.fx.ring([pad.center[0], pad.center[1] - 1.5, pad.center[2]], { color: sw.colors.gem, r1: 8 + w * 2, life: 0.7 });
          });
        }
      }
      screenFlash("#ffd23a", 0.2, 700);
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
  // the bar itself flinches when the number drops
  if (S.hp < S.lastHp) {
    dom.hpWrap.style.boxShadow = "0 0 14px 3px rgba(255,60,40,0.85)";
    dom.hpWrap.style.transform = "translateX(-50%) scale(1.06)";
    later(0.15, () => { if (dom) { dom.hpWrap.style.boxShadow = "none"; dom.hpWrap.style.transform = "translateX(-50%)"; } });
  }
  S.lastHp = S.hp;
  // below a quarter, the edges of the world close in (pulse driven from update())
  dom.vignO.style.opacity = S.inArena && pct <= 0.25 ? String(0.5 + 0.3 * Math.sin(S.runT * 6)) : "0";
}
function refreshAbilityBtn() {
  if (!dom) return;
  const sw = swordById(S.equipped);
  const show = S.inArena && !!sw.ability && sw.ability !== "streak";
  dom.abBtn.style.display = show ? "block" : "none";
  refreshKsButtons();
  // §13: the portal gun rides along with the Time Warp
  const pg = S.inArena && sw.id === "timewarp";
  dom.pgBtn.style.display = pg ? "block" : "none";
  if (pg) {
    const P2 = S.portal;
    dom.pgBtn.textContent = P2.a && P2.b ? "🌌 " + Math.ceil(P2.life) : P2.a ? "🌌 2nd?" : P2.cd > 0 ? "🌌 " + Math.ceil(P2.cd) : "🌌";
    dom.pgBtn.style.opacity = !P2.a && P2.cd > 0 ? "0.55" : "1";
  }
  if (!show) return;
  if (S.abilityCd > 0) { dom.abBtn.textContent = (sw.ability === "cheese" ? "🧀 " : sw.ability === "timestop" ? "⌛ " : "⚡ ") + Math.ceil(S.abilityCd); dom.abBtn.style.opacity = "0.55"; }
  else { dom.abBtn.textContent = sw.ability === "cheese" ? "🧀" : sw.ability === "timestop" ? "⌛" : "⚡"; dom.abBtn.style.opacity = "1"; }
}
function refreshHud(ctx) {
  const sw = swordById(S.equipped);
  ctx.services.ui.setHudStat("bt-kills", { icon: "💀", label: "Kills", value: String(S.save.kills) });
  ctx.services.ui.setHudStat("bt-sword", { icon: sw.emoji, label: S.inArena ? "Wielding" : "Last sword", value: sw.name });
  if (sw.id === "killstreak") ctx.services.ui.setHudStat("bt-streak", { icon: "🩸", label: "Streak", value: `${S.save.streak} (${1 + S.save.streak} dmg)` });
  else { try { ctx.services.ui.removeHudStat("bt-streak"); } catch { /* fine */ } }
  // §13: the lettuce count rides the HUD from the first tower win to the tenth find
  if (S.save.twTower && !S.save.tw && S.tw) ctx.services.ui.setHudStat("bt-lett", { icon: "🥬", label: "Lettuces", value: `${S.tw.count()} / 10` });
  else { try { ctx.services.ui.removeHudStat("bt-lett"); } catch { /* fine */ } }
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
  if (S.frozenT > 0) return; // §13: stopped time outranks every buff — stay a statue
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
  clearFrozen(ctx); S.fling = null; clearPortals(ctx, true); S.portal.cd = 0;
  if (S.tw) S.tw.leaveRealmState();
  const sp = S.world.arenaSpawns[Math.floor(S.runT * 3) % S.world.arenaSpawns.length];
  try { ctx.player.teleport([sp[0], sp[1], sp[2]], 0); } catch { /* fine */ }
  // NOTE: the checkpoint deliberately stays at the LOBBY (set in toLobby / at spawn), so a
  // fall or death in the arena returns you to the lobby, never to a spot in the arena.
  applyPassives(ctx);
  S.myState.inArena = true; S.myState.sword = swordId; S.myState.hp = HP_MAX; publishSoon();
  showCombatUi(true); refreshHp(); refreshHud(ctx);
  // arrive like you mean it: a ring in your blade's colour and a leap of sparks
  const swIn = swordById(swordId);
  if (S.fx) {
    S.fx.ring([sp[0], sp[1] + 0.2, sp[2]], { color: swIn.colors.edge, r1: 8, life: 0.6 });
    S.fx.burst([sp[0], sp[1] + 2, sp[2]], { count: 12, colors: [swIn.colors.edge, swIn.colors.gem, "#ffffff"], speed: 6, up: 8, size: 0.3, life: 0.7, grav: 14 });
  }
  shake(ctx, 0.2, 0.25);
  try { ctx.engine.audio.playMusic("clash"); } catch { /* fine */ }
  toast(ctx, `Fighting with the ${swordById(swordId).name}. Tap ⚔️ to swing!`, swordById(swordId).emoji, 3200);
}
function toLobby(ctx) {
  S.inArena = false;
  endFly(ctx);
  S.frozenT = 0; if (dom) dom.frzO.style.display = "none";
  S.fling = null;
  clearPortals(ctx, true);
  if (S.tw) S.tw.leaveRealmState();
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
  } else if (sw.id === "timewarp") {
    pagedPanel(ctx, "⌛ The ticking pedestal", [{ heading: "⌛ ???", body: "The pedestal ticks like something impatient. A clock is inlaid around its base and the sword above it blurs when you look straight at it — it is here and NOT here.\n\nThe CLOCK ARCH beside it leads to a tower of lava and tiny footholds, and past the tower, they say, a realm where ten lettuces hide. Bring all ten home and time will hold still for you." }], { doneLabel: "Close" });
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
  if (sw.id === "timewarp") { // a little dial rides the blade, hands and all
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 6, 18), mat("#7ec8ff", true));
    ring.position.set(0, 1.8, 0); g.add(ring);
    add(new THREE.BoxGeometry(0.07, 0.85, 0.07), mat("#e0b23a", true), 0, 2.15, 0.04);
    add(new THREE.BoxGeometry(0.07, 0.55, 0.07), mat("#ffd23a", true), 0.18, 1.95, 0.04, -0.9);
  }
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
  if (S.fx) {
    S.fx.ring([OBBY_START[0], OBBY_START[1] + 0.2, OBBY_START[2]], { color: "#ffd23a", r1: 6, life: 0.5 });
    S.fx.burst([OBBY_START[0], OBBY_START[1] + 2, OBBY_START[2]], { count: 10, colors: ["#ffd23a", "#e8b62a", "#ffffff"], speed: 5, up: 6, size: 0.28, life: 0.7, grav: 10 });
  }
  screenFlash("#ffd23a", 0.15, 400);
  sfx(ctx, "warp");
  toast(ctx, S.save.cheese
    ? "The Obby of Oof — again, for glory. One stage. Fall and you're home."
    : "The OBBY OF OOF. One stage. Fall ONCE and you're back in the lobby. Win, and the Cheese Blade is yours.", "🧀", 5000);
}
function winObby(ctx) {
  // cheese fireworks either way — winning the Obby of Oof should LOOK won
  if (S.fx) {
    const me = ctx.player.position();
    for (let w = 0; w < 4; w++) later(w * 0.25, () => { if (!S || !S.fx) return; const p = ctx.player.position(); S.fx.burst([p[0], p[1] + 4 + w * 1.5, p[2]], { count: 12, colors: ["#ffd23a", "#fff3b0", "#e8b62a", "#ffffff"], speed: 8, up: 7, size: 0.32, life: 1.0, grav: 12 }); });
    S.fx.ring([me[0], me[1] + 0.2, me[2]], { color: "#ffd23a", r1: 9, life: 0.7 });
  }
  screenFlash("#ffd23a", 0.25, 700);
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
  try { S.fx = createVfx(ctx); } catch { S.fx = null; /* headless: the game plays fine without sparkle */ }

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
  // §13: the clock arch's label
  const twGate = makeLabel(ctx, "⌛ THE CLOCK ARCH\nthe tower, the realm\nthe ten lettuces", "#7ec8ff");
  twGate.sprite.position.set(S.world.twGate[0], S.world.twGate[1], S.world.twGate[2]);
  root.add(twGate.sprite); S.twGateLabel = twGate;
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

  // §13: the Time Warp questline
  S.tw = createTimewarp({
    ctx,
    getSave: () => S.save,
    saveNow: () => { saveNow(ctx); refreshHud(ctx); },
    toast: (t, icon, dur) => toast(ctx, t, icon, dur),
    sfx: (n) => sfx(ctx, n),
    isPanelOpen: () => S.panelOpen,
    setPanelOpen: (v) => { S.panelOpen = v; },
    leaveArena: () => { if (S.inArena) toLobby(ctx); },
    getWorld: () => S.world,
    onUnlockTimewarp: () => {
      try { ctx.services.badges.award("sword_timewarp"); } catch { /* fine */ }
      refreshLabels(ctx); refreshHud(ctx);
    },
  });
  S.tw.refreshWorld();

  dom = buildDom(ctx);
  const subs = [];
  for (let i = 0; i < S.world.swordPads.length; i++) subs.push(ctx.events.on("touch:" + S.world.swordPads[i].padId, ((idx) => () => openSwordPanel(ctx, idx))(i)));
  subs.push(ctx.events.on("touch:bt_leave", () => toLobby(ctx)));
  subs.push(ctx.events.on("touch:bt_obby_enter", () => enterObby(ctx)));
  subs.push(ctx.events.on("touch:bt_obby_win", () => winObby(ctx)));
  for (const ev of ["bt_cube", "bt_book1", "bt_book2", "bt_tree", "bt_scope", "bt_rebirth", "bt_rocket", "bt_crater"]) {
    subs.push(ctx.events.on("touch:" + ev, ((e2) => () => { try { S.quest.onTouch(e2); } catch { /* fine */ } })(ev)));
  }
  // §13: the Time Warp's world — the arch, the summit, the realm's pads and lettuces
  const twEvents = ["bt_tw_enter", "bt_tw_top", "bt_tw_leave", "bt_tw_keypad", ...LETTUCE_KEYS.map((k) => "bt_lett_" + k)];
  for (const ev of twEvents) {
    subs.push(ctx.events.on("touch:" + ev, ((e2) => () => { try { S.tw.onTouch(e2); } catch { /* fine */ } })(ev)));
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
  if (S.fx) { try { S.fx.step(dt); } catch { /* fine */ } }
  try { stepAmbient(ctx, dt); } catch { /* fine */ }

  stepCheeses(ctx, dt);
  try { S.quest.update(dt); } catch { /* fine */ }
  try { S.tw.update(dt); } catch { /* fine */ }

  // §13: stopped time thaws; the fling arcs; the portals hum
  if (S.frozenT > 0) {
    S.frozenT = Math.max(0, S.frozenT - dt);
    if (S.frozenT === 0) { clearFrozen(ctx); toast(ctx, "Time lets go of you.", "⌛", 1600); }
  }
  stepFling(ctx, dt);
  stepPortals(ctx, dt);

  if (S.inArena) {
    stepMeteors(ctx, dt);
    stepBushes(ctx, dt);
    stepGrenades(ctx, dt);
    // poison on me — each tick drips green off the wound
    if (S.poison) { S.poison.t -= dt; if (S.poison.t <= 0) { S.poison.t = 1.0; S.poison.left -= 1; if (S.fx) { const pp = ctx.player.position(); S.fx.burst([pp[0], pp[1] + 3.2, pp[2]], { count: 5, colors: ["#8be04a", "#3a7d2c", "#c8ff6b"], speed: 3, up: 4, size: 0.24, life: 0.7, grav: 12 }); } takeDamage(ctx, 3, 0, S.lastAttacker); if (S.poison && S.poison.left <= 0) S.poison = null; } }
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
      if (st.hit && st.hit.target === myId) { const key = p.id + ":h" + st.hit.id; if (!S.seenHit.has(key)) { S.seenHit.add(key); takeDamage(ctx, st.hit.dmg, st.hit.poison, p.id); if (st.hit.fl && S.inArena) startFling(ctx, st.hit.fl); } }
      if (st.stop) { const key = p.id + ":s" + st.stop.id; if (!S.seenStop.has(key)) { S.seenStop.add(key); const me = ctx.player.position(); if (S.inArena && (me[0] - st.stop.x) ** 2 + (me[2] - st.stop.z) ** 2 <= TW_STOP_R * TW_STOP_R) applyFrozen(ctx); } }
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

function spawnDummyReuse(ctx, d) {
  d.parts = buildDummyParts(ctx, d.x, d.z);
  // it pops back with a puff of straw and a ring, so respawns read as arrivals
  if (S.fx) {
    S.fx.ring([d.x, FLOOR_TOP + 0.3, d.z], { color: "#d9c48f", r1: 4.5, life: 0.45 });
    S.fx.burst([d.x, FLOOR_TOP + 2.5, d.z], { count: 8, colors: ["#d9c48f", "#e0cfa0", "#ffffff"], speed: 4, up: 4, size: 0.26, life: 0.6, grav: 10 });
  }
}

export function dispose(ctx) {
  if (S) {
    endFly(ctx);
    clearPassives(ctx);
    clearAttachments();
    if (S.quest) { try { S.quest.dispose(); } catch { /* fine */ } }
    if (S.tw) { try { S.tw.dispose(); } catch { /* fine */ } }
    try { clearPortals(ctx, true); } catch { /* fine */ }
    if (S.boards) { try { S.boards.dispose(); } catch { /* fine */ } }
    for (const v of S.vfx) for (const id of v.ids) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
    for (const m of S.meteors) { try { ctx.engine.parts.remove(m.id); } catch { /* gone */ } if (m.glow) { try { ctx.engine.parts.remove(m.glow); } catch { /* gone */ } } }
    for (const g of S.grenades) { try { ctx.engine.parts.remove(g.id); } catch { /* gone */ } }
    for (const c of S.cheeses) for (const id of c.ids) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
    for (const d of S.dummies) for (const id of d.parts) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
    for (const b of S.bushes) for (const id of b.parts) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
    if (S.labels) for (const L of S.labels) { try { L.mat.dispose(); L.tex.dispose(); } catch { /* fine */ } }
    if (S.gateLabel) { try { S.gateLabel.mat.dispose(); S.gateLabel.tex.dispose(); } catch { /* fine */ } }
    if (S.twGateLabel) { try { S.twGateLabel.mat.dispose(); S.twGateLabel.tex.dispose(); } catch { /* fine */ } }
    if (S.fx) { try { S.fx.dispose(); } catch { /* fine */ } }
    if (S.rootId != null) { try { ctx.engine.parts.remove(S.rootId); } catch { /* gone */ } }
    if (S.subs) for (const u of S.subs) { try { u(); } catch { /* fine */ } }
    try { ctx.engine.audio.playMusic("chill"); } catch { /* fine */ }
  }
  if (dom) { for (const k of ["hpWrap", "atkBtn", "abBtn", "tpBtn", "grBtn", "flyBtn", "claimBtn", "pgBtn", "frzO", "aimLayer", "flashO", "vignO"]) { try { dom[k].remove(); } catch { /* fine */ } } dom = null; }
  try { ctx.services.ui.removeHudStat("bt-kills"); ctx.services.ui.removeHudStat("bt-sword"); ctx.services.ui.removeHudStat("bt-streak"); ctx.services.ui.removeHudStat("bt-lett"); } catch { /* fine */ }
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
    tw: S.save.tw, twTower: S.save.twTower, lettuces: S.tw ? S.tw.count() : 0,
    frozenT: Math.ceil(S.frozenT), portals: !!(S.portal.a && S.portal.b), portalCd: Math.ceil(S.portal.cd),
  };
}
