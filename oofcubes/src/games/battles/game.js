// src/games/battles/game.js — Battles. Spec 26 owns this Place.
//
// A lobby of nine swords and a coliseum to use them in. Kills are a THRESHOLD, never a
// cost: reach a sword's number and it is yours for free, forever (save.kills only grows).
// Combat is the platform's honest peer model (ARCHITECTURE §9): you swing and broadcast a
// hit; the TARGET subtracts its own HP and, when it dies, broadcasts who killed it so that
// client can score — a client only ever moves/harms its own avatar. Training dummies are
// local props so the arena is never empty and the game is playable solo.

import { buildWorld, FLOOR_TOP, LOBBY_SPAWN, LOBBY_YAW, ARENA_CENTER, ARENA_RADIUS, VOID_Y } from "./scripts/layout.js";
import { SWORDS, HP_MAX, ABILITY_CD_S, BASE_WALK, BASE_JUMP, swordById, isOwned, INTRO_PAGES } from "./scripts/swords.js";

export const meta = {
  slug: "battles",
  name: "Battles",
  icon: "⚔️",
  description: "Lobby, sword, arena. Every kill unlocks a deadlier blade — up to the one-shot Meteorbrand.",
  version: "1.0.0",
};

const SAVE_V = 1;
const SWING_CD = 0.5;
const MELEE_R = 7;
const DUMMY_HP = 5;
const DUMMY_RESPAWN = 5;
const PUBLISH_EVERY = 0.4;
const SPIN_SPEED = 0.5;   // rad/s — the display swords turn on their pedestals
const BUSH_LIFE = 20;     // §: a thorn bush wilts after 20s
const BUSH_DMG = 10;      // §: 10 damage to anyone near it (once a second)
const BUSH_R = 5.5;

let S = null;
let dom = null;

function fresh() {
  return {
    save: null, world: null,
    inArena: false, hp: HP_MAX, equipped: "basic",
    swingCd: 0, abilityCd: 0, runT: 0, pubT: 0, hudT: 0, spinT: 0,
    poison: null,                 // {left, t} — venom on ME
    dummies: [],                  // {parts:[ids], x, z, hp, dead, respawnT}
    bushes: [],                   // {parts:[ids], x, z, t, dmgT} — thorn hazards
    vfx: [],                      // {ids:[...], t} transient parts
    meteors: [],                  // {id, x, z, y, dx, dz, t, trailT}
    labels: [], rootId: null,
    hitSeq: 0, deathSeq: 0, aoeSeq: 0, idSeq: 0,
    myState: { inArena: false, hp: HP_MAX, kills: 0, sword: "basic", hit: null, death: null, aoe: null },
    seenHit: new Set(), seenDeath: new Set(), seenAoe: new Set(),
    lastAttacker: null,
    panelOpen: false,
  };
}

// ---- save ----------------------------------------------------------------------------
function loadSave(ctx) {
  let s = null;
  try { s = ctx.services.saves.load(); } catch { s = null; }
  const d = { schemaVersion: SAVE_V, kills: 0, equipped: "basic", seenIntro: false };
  if (s && typeof s === "object") {
    if (Number.isFinite(s.kills)) d.kills = Math.max(0, Math.floor(s.kills));
    if (typeof s.equipped === "string" && swordById(s.equipped).id === s.equipped) d.equipped = s.equipped;
    d.seenIntro = !!s.seenIntro;
  }
  if (!isOwned(d.equipped, d.kills)) d.equipped = "basic";
  return d;
}
function saveNow(ctx) { try { ctx.services.saves.save({ schemaVersion: SAVE_V, kills: S.save.kills, equipped: S.save.equipped, seenIntro: S.save.seenIntro }); } catch { /* fine */ } }

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

  document.body.append(hpWrap, atkBtn, abBtn);
  return { hpWrap, hpFill, hpText, atkBtn, abBtn };
}

// ---- a reusable paged panel (intro tips, and every sword's story) --------------------
// pages: [{heading, body}]. Optional action button (e.g. "Enter Arena").
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
  const cost = sw.cost === 0 ? "FREE" : sw.cost + " kills";
  const ab = sw.ability ? " • ⚡ ability" : (sw.passive ? " • buff" : "");
  return `${sw.emoji} ${sw.name}\n${cost} • ${sw.damage} dmg${ab}`;
}
function refreshLabels(ctx) {
  for (let i = 0; i < S.labels.length; i++) {
    const sw = SWORDS[i], owned = isOwned(sw.id, S.save.kills);
    const col = owned ? "#3ddc84" : "#e0b23a";
    const txt = labelText(sw) + (owned ? "\n✅ owned" : `\n🔒 you have ${S.save.kills}`);
    const L = S.labels[i];
    if (L.text !== txt || L.color !== col) { L.paint(txt, col); L.tex.needsUpdate = true; L.text = txt; L.color = col; }
  }
}

// ---- dummies -------------------------------------------------------------------------
// A stitched straw training dummy — a cross-post frame, a lashed straw body with a target
// ring, arms and a stuffed head with a painted face. Shared by spawn and respawn.
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
function swing(ctx) {
  if (!S.inArena || S.swingCd > 0) return;
  S.swingCd = SWING_CD;
  const sw = swordById(S.equipped);
  slashVfx(ctx);
  sfx(ctx, "whoosh");
  const me = ctx.player.position();
  // nearest dummy in range
  let bestD = null, bd = MELEE_R * MELEE_R;
  for (const d of S.dummies) { if (d.dead) continue; const dd = (d.x - me[0]) ** 2 + (d.z - me[2]) ** 2; if (dd < bd) { bd = dd; bestD = d; } }
  // nearest player in range
  let bestP = null, bp = MELEE_R * MELEE_R;
  const roster = rosterSafe(ctx);
  for (const p of roster) { if (!p.pos) continue; const dd = (p.pos[0] - me[0]) ** 2 + (p.pos[2] - me[2]) ** 2; if (dd < bp) { bp = dd; bestP = p; } }
  // hit whichever is closer
  if (bestP && (!bestD || bp <= bd)) {
    S.hitSeq++;
    S.myState.hit = { id: S.hitSeq, target: bestP.id, dmg: sw.damage, poison: sw.passive && sw.passive.poison ? 1 : 0 };
    publishSoon();
    sfx(ctx, "oof");
  } else if (bestD) {
    hitDummy(ctx, bestD, sw.damage);
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
function useAbility(ctx) {
  if (!S.inArena) return;
  const sw = swordById(S.equipped);
  if (!sw.ability) { toast(ctx, "This sword has no ability.", "⚡", 1600); return; }
  if (S.abilityCd > 0) { toast(ctx, `Ability recharging — ${Math.ceil(S.abilityCd)}s`, "⚡", 1600); return; }
  const me = ctx.player.position();
  if (sw.ability === "spikes") {
    const R = 12; const ids = [];
    // a rolling dust ring, then jagged iron spikes tearing up out of the sand
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
  S.abilityCd = ABILITY_CD_S;
  refreshAbilityBtn();
}

// ---- thorn bushes (Thornheart's ⚡): a living hazard that bites once a second --------
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
    // a fiery tail: drop a fading ember every few frames
    m.trailT -= dt;
    if (m.trailT <= 0) {
      m.trailT = 0.04;
      try { const id = uid("bt_ember_"); ctx.engine.parts.create({ id, shape: "sphere", size: [0.9, 0.9, 0.9], position: [m.x, m.y + 0.4, m.z], color: ["#ff8c1a", "#ffd23a", "#ff5a1f"][S.idSeq % 3], material: "neon", canCollide: false }); S.vfx.push({ ids: [id], t: 0.35 }); } catch { /* fine */ }
    }
    let hit = false;
    for (const p of rosterSafe(ctx)) { if (!p.pos) continue; if ((p.pos[0] - m.x) ** 2 + (p.pos[2] - m.z) ** 2 <= 9) { S.hitSeq++; S.myState.hit = { id: S.hitSeq, target: p.id, dmg: 9999, poison: 0 }; publishSoon(); hit = true; break; } }
    for (const d of S.dummies) { if (!d.dead && (d.x - m.x) ** 2 + (d.z - m.z) ** 2 <= 9) { hitDummy(ctx, d, 9999); hit = true; } }
    if (hit || m.t > 2.4 || m.y <= FLOOR_TOP + 1.1) {
      // a burst of debris + fire on impact
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
  // Death sends you back to the LOBBY (spec 26: pick a new sword and go again). Broadcast
  // the death first so the killer's client scores, then hand off to toLobby — which flips
  // inArena off (stopping the void check), clears the combat UI, and resets the checkpoint.
  S.deathSeq++;
  S.myState.death = { id: S.deathSeq, killer: S.lastAttacker || null };
  S.hp = HP_MAX; S.poison = null; S.lastAttacker = null;
  toast(ctx, "You were defeated! Back to the lobby — pick your next blade.", "💀", 2800); sfx(ctx, "oof");
  toLobby(ctx);
}
function scoreKill(ctx, whom) {
  S.save.kills += 1;
  S.myState.kills = S.save.kills; publishSoon();
  saveNow(ctx); refreshLabels(ctx); refreshHud(ctx); checkUnlocks(ctx, whom);
}
function checkUnlocks(ctx, whom) {
  for (const sw of SWORDS) {
    if (sw.cost > 0 && S.save.kills === sw.cost) {
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
  const show = S.inArena && !!sw.ability;
  dom.abBtn.style.display = show ? "block" : "none";
  if (!show) return;
  if (S.abilityCd > 0) { dom.abBtn.textContent = "⚡ " + Math.ceil(S.abilityCd); dom.abBtn.style.opacity = "0.55"; }
  else { dom.abBtn.textContent = "⚡"; dom.abBtn.style.opacity = "1"; }
}
function refreshHud(ctx) {
  const sw = swordById(S.equipped);
  ctx.services.ui.setHudStat("bt-kills", { icon: "💀", label: "Kills", value: String(S.save.kills) });
  ctx.services.ui.setHudStat("bt-sword", { icon: sw.emoji, label: S.inArena ? "Wielding" : "Last sword", value: sw.name });
  try { ctx.events.emit("bt:state", debugState()); } catch { /* no place */ }
}
function showCombatUi(on) {
  if (!dom) return;
  dom.hpWrap.style.display = on ? "block" : "none";
  dom.atkBtn.style.display = on ? "block" : "none";
  refreshAbilityBtn();
}

// ---- lobby / arena travel ------------------------------------------------------------
function applyPassives(ctx) {
  const sw = swordById(S.equipped);
  const p = sw.passive || {};
  try { ctx.player.setWalkSpeed(BASE_WALK * (p.speed || 1)); } catch { /* fine */ }
  try { ctx.player.setJumpPower(BASE_JUMP + (p.jump || 0)); } catch { /* fine */ }
}
function clearPassives(ctx) {
  try { ctx.player.setWalkSpeed(BASE_WALK); } catch { /* fine */ }
  try { ctx.player.setJumpPower(BASE_JUMP); } catch { /* fine */ }
}
function enterArena(ctx, swordId) {
  if (!isOwned(swordId, S.save.kills)) { toast(ctx, "You haven't earned that sword yet.", "🔒"); return; }
  S.equipped = swordId; S.save.equipped = swordId; saveNow(ctx);
  S.inArena = true; S.hp = HP_MAX; S.poison = null; S.swingCd = 0; S.abilityCd = 0;
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
  S.inArena = false; clearPassives(ctx);
  try { ctx.player.teleport([LOBBY_SPAWN[0], LOBBY_SPAWN[1], LOBBY_SPAWN[2]], LOBBY_YAW); } catch { /* fine */ }
  try { ctx.player.setCheckpoint([LOBBY_SPAWN[0], LOBBY_SPAWN[1], LOBBY_SPAWN[2]]); } catch { /* fine */ }
  S.myState.inArena = false; publishSoon();
  showCombatUi(false); refreshHud(ctx);
  try { ctx.engine.audio.playMusic("chill"); } catch { /* fine */ }
}
function openSwordPanel(ctx, i) {
  const sw = SWORDS[i];
  const owned = isOwned(sw.id, S.save.kills);
  if (owned) {
    const pages = sw.lore.map((body, k) => ({ heading: k === 0 ? `${sw.emoji} ${sw.name}` : sw.name, body }));
    pages.push({ heading: "Ready", body: `${sw.damage} damage a hit${sw.ability ? ", plus a ⚡ ability" : sw.passive ? ", plus a passive buff" : ""}. Step into the arena and put it to work.` });
    pagedPanel(ctx, `${sw.emoji} ${sw.name}`, pages, { doneLabel: "Close", actionLabel: "⚔️ Enter Arena", onAction: () => enterArena(ctx, sw.id) });
  } else {
    pagedPanel(ctx, `${sw.emoji} ${sw.name}`, [{ heading: `${sw.emoji} ${sw.name}`, body: `${sw.blurb}\n\n🔒 Unlocks at ${sw.cost} kills. You have ${S.save.kills}. Its story stays sealed until you earn it.` }], { doneLabel: "Close" });
    sfx(ctx, "denied");
  }
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
  refreshLabels(ctx);

  // baseline training dummies
  for (const [dx, dz] of S.world.dummySpots) spawnDummy(ctx, dx, dz, false);

  dom = buildDom(ctx);
  const subs = [];
  for (let i = 0; i < S.world.swordPads.length; i++) subs.push(ctx.events.on("touch:" + S.world.swordPads[i].padId, ((idx) => () => openSwordPanel(ctx, idx))(i)));
  subs.push(ctx.events.on("touch:bt_leave", () => toLobby(ctx)));
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

  // transient VFX cleanup
  for (let i = S.vfx.length - 1; i >= 0; i--) { const v = S.vfx[i]; v.t -= dt; if (v.t <= 0) { for (const id of v.ids) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } } S.vfx.splice(i, 1); } }

  if (S.inArena) {
    stepMeteors(ctx, dt);
    stepBushes(ctx, dt);
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

  // incoming combat over the presence channel
  const myId = (() => { try { const s = ctx.services.net.self(); return s ? s.id : null; } catch { return null; } })();
  if (myId) {
    for (const p of rosterSafe(ctx)) {
      const st = p.state; if (!st) continue;
      if (st.hit && st.hit.target === myId) { const key = p.id + ":h" + st.hit.id; if (!S.seenHit.has(key)) { S.seenHit.add(key); takeDamage(ctx, st.hit.dmg, st.hit.poison, p.id); } }
      if (st.aoe) { const key = p.id + ":a" + st.aoe.id; if (!S.seenAoe.has(key)) { S.seenAoe.add(key); const me = ctx.player.position(); if (S.inArena && (me[0] - st.aoe.x) ** 2 + (me[2] - st.aoe.z) ** 2 <= st.aoe.r * st.aoe.r) takeDamage(ctx, st.aoe.dmg, 0, p.id); } }
      if (st.death && st.death.killer === myId) { const key = p.id + ":d" + st.death.id; if (!S.seenDeath.has(key)) { S.seenDeath.add(key); scoreKill(ctx, p.name || "a fighter"); } }
    }
  }

  // publish our state (throttled; publishSoon() forces the next tick)
  S.pubT -= dt;
  if (S.pubT <= 0) {
    S.pubT = PUBLISH_EVERY;
    S.myState.hp = Math.max(0, Math.ceil(S.hp)); S.myState.kills = S.save.kills; S.myState.sword = S.equipped; S.myState.inArena = S.inArena;
    try { const n = ctx.services.net; if (n && n.publish) n.publish({ ...S.myState }); } catch { /* solo */ }
  }

  S.hudT -= dt; if (S.hudT <= 0) { S.hudT = 0.2; if (S.inArena) refreshHp(); }
}

function spawnDummyReuse(ctx, d) { d.parts = buildDummyParts(ctx, d.x, d.z); }

export function dispose(ctx) {
  if (S) {
    clearPassives(ctx);
    for (const v of S.vfx) for (const id of v.ids) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
    for (const m of S.meteors) { try { ctx.engine.parts.remove(m.id); } catch { /* gone */ } if (m.glow) { try { ctx.engine.parts.remove(m.glow); } catch { /* gone */ } } }
    for (const d of S.dummies) for (const id of d.parts) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
    for (const b of S.bushes) for (const id of b.parts) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
    if (S.labels) for (const L of S.labels) { try { L.mat.dispose(); L.tex.dispose(); } catch { /* fine */ } }
    if (S.rootId != null) { try { ctx.engine.parts.remove(S.rootId); } catch { /* gone */ } }
    if (S.subs) for (const u of S.subs) { try { u(); } catch { /* fine */ } }
    try { ctx.engine.audio.playMusic("chill"); } catch { /* fine */ }
  }
  if (dom) { for (const k of ["hpWrap", "atkBtn", "abBtn"]) { try { dom[k].remove(); } catch { /* fine */ } } dom = null; }
  try { ctx.services.ui.removeHudStat("bt-kills"); ctx.services.ui.removeHudStat("bt-sword"); } catch { /* fine */ }
  S = null;
}

// Test seam (spec 26 §8).
export function debugState() {
  if (!S) return null;
  return { kills: S.save.kills, equipped: S.equipped, inArena: S.inArena, hp: Math.ceil(S.hp), dummies: S.dummies.filter((d) => !d.dead).length };
}
