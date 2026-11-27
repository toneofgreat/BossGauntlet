// COMBAT module (CONTRACT 7): stats, levels, gear + visible gear, drops, enemies + AI, bosses, player HP/damage/death,
// NG+ modifiers. ctx.combat. Save lives in ./save.js (ctx.save, initialised earlier by main.js).
import * as Stats from "./stats.js";
import * as Items from "./items.js";
import { rollDrops, SOURCES } from "./drops.js";
import { dropId } from "./ngplus.js";
import { createFx } from "./fx.js";
import { createItemMeshes } from "./itemMeshes.js";
import { createModelFactory } from "./models.js";
import { createPlates } from "./plates.js";
import { createEnemies } from "./enemies.js";
import { createBosses } from "./bosses.js";

const SHOP = [
  { id: "villager_morph", name: "Villager Morph" },
  { id: "iron_armor", name: "Iron Armor" },
  { id: "area3", name: "Castle Pass" },
  { id: "golden_armor", name: "Golden Armor" },
];
const DEATH_HINTS = [
  "Red rings on the ground: jump over them.",
  "Dodge-roll (Q / right click) has invincibility frames.",
  "Higher level = more damage dealt, less taken. Farm a little.",
  "Hold attack for a heavy hit. Big wind-ups mean big hits.",
  "Red circles mean something is about to land there.",
  "You keep all levels and items when you die.",
];

export async function init(ctx) {
  let godSticky = false;   // debug __tnrpg.godMode (kept across run:reset)
  const THREE = ctx.THREE;
  const engine = ctx.engine;
  const bus = ctx.bus;
  const state = ctx.state;
  const scene = ctx.scene || engine.scene;
  const run = () => state.run;
  const warn = (e) => console.warn("[combat]", e);

  let createHumanoidFn = null;
  try {
    const m = await import("../engine/humanoid.js");
    createHumanoidFn = m.createHumanoid || null;
  } catch (e) { console.warn("[combat] engine humanoid unavailable, using fallback humanoid", e); }

  // ------------------------------------------------------------------ core (shared with sub-modules)
  let frameNo = 0;
  const C = {
    THREE, engine, bus, state, scene,
    cycle: () => (state.run.cycle | 0),
    level: () => state.run.level || 0,
    frame: () => frameNo,
    world: () => ctx.world,
    audio: () => ctx.audio,
    uiApi: () => ctx.ui,
    rt: () => state.rt,
    playing: () => !!(state.rt.playing && !state.rt.paused),
    playerAlive: () => !!(state.player.alive && state.rt.playing && !state.rt.cinematic),
    save: () => { try { ctx.save && ctx.save.write(); } catch (e) { /* ignore */ } },
    villageCentre: { x: 0, y: 0, z: 240 },
  };
  C.sfx = (id, pos, opts) => {
    const a = ctx.audio;
    if (!a || !a.sfx || !id) return null;
    try {
      const o = opts || {};
      return a.sfx(id, { pos: pos || undefined, vol: o.vol != null ? o.vol : 1, rate: o.rate || 1, detune: o.detune || 0 });
    } catch (e) { return null; }
  };
  C.ui = (fn, a, b, c) => {
    const u = ctx.ui;
    if (!u || typeof u[fn] !== "function") return null;
    try { return u[fn](a, b, c); } catch (e) { warn(e); return null; }
  };
  C.groundY = (x, z, yTop) => {
    try {
      const g = engine.physics && engine.physics.groundAt(x, z, yTop);
      if (g && g.y > -1e8) return g.y;
    } catch (e) { /* ignore */ }
    try { const h = engine.terrain && engine.terrain.heightAt(x, z); if (h > -1e8) return h; } catch (e) { /* ignore */ }
    return yTop - 1.2;
  };
  C.shake = (amp, dur, pos) => {
    try {
      let a = amp;
      if (pos) { const p = engine.player.position; const dx = p.x - pos.x, dz = p.z - pos.z; a *= Math.max(0, 1 - Math.sqrt(dx * dx + dz * dz) / 26); }
      if (a > 0.01 && engine.camera3p) engine.camera3p.shake(a, dur);
    } catch (e) { /* ignore */ }
  };
  C.bark = (e, text) => {
    if (!e || !text) return;
    const name = Stats.KINDS[e.kind] ? Stats.KINDS[e.kind].name : e.kind;
    const dx = engine.player.position.x - e.pos.x, dz = engine.player.position.z - e.pos.z;
    if (dx * dx + dz * dz > 45 * 45) return;
    C.ui("subtitle", name + ": " + text, 2.8);
  };
  C.hasMorph = () => { const m = state.run.equip.morph; return m === "villager_morph" || m === "bad_villager_morph"; };
  C.rafterHeight = () => 5.6;

  const items = createItemMeshes(ctx);
  C.models = createModelFactory(ctx, items, createHumanoidFn);
  C.plates = createPlates(ctx);
  C.fx = createFx(ctx, {
    hurtPlayer: (raw, o) => damagePlayer(raw, o),
    hitTargets: (p, x, y, z, r) => boltHit(p, x, y, z, r),
    burn: () => { bleed.t = Math.max(bleed.t, 1.5); bleed.dps = 4; },
  });
  C.hurtPlayer = (raw, o) => damagePlayer(raw, o);
  C.enemies = createEnemies(C);
  const en = C.enemies;
  C.bosses = createBosses(C);
  const bosses = C.bosses;
  C.clampArena = bosses.clampArena;
  C.canSummon = bosses.canSummon;
  C.summon = bosses.summon;
  C.onEntityHit = (e) => bosses.onEntityHit(e);
  C.teleportEntity = (e, x, z) => {
    e.pos.x = x; e.pos.z = z;
    if (e.fight) bosses.clampArena(e);
    e.groundY = C.groundY(e.pos.x, e.pos.z, e.pos.y + 3);
    e.pos.y = e.groundY;
    e.vel.set(0, 0, 0);
  };
  C.dot = (e, amt) => {
    if (!e.alive) return;
    const dmg = amt * Stats.outMul(C.level(), e.rec);
    e.hp -= dmg;
    if (e.plate) C.plates.setHp(e.plate, e.hp / e.maxHp);
    bosses.onEntityHit(e);
    if (e.hp <= 0) en.kill(e, null);
  };
  C.goldenRoll = (e, pt) => {
    if (Math.random() >= 1 / 40) return false;
    for (const o of en.list) if (o.kind === "goldenRat" && o.alive && o.active) return false;
    en.spawn("goldenRat", pt, { yaw: Math.random() * 6.28 });
    return true;
  };
  C.setGuardIdleVisible = (v) => {
    try {
      const w = ctx.world;
      if (!w || !w.npc) return;
      const f = w.npc("fydorIdle"), m = w.npc("mylesIdle");
      if (f) f.setVisible(v); if (m) m.setVisible(v);
    } catch (e) { /* ignore */ }
  };
  C.slowPlayer = (mul, dur) => { slow.t = Math.max(slow.t, dur); slow.mul = mul; applySpeed(); };
  C.bleedPlayer = (dps, dur, rec, source) => { bleed.t = Math.max(bleed.t, dur); bleed.dps = dps; bleed.rec = rec || 1; bleed.source = source || "bleed"; };

  // ------------------------------------------------------------------ player status
  const slow = { t: 0, mul: 1, on: false };
  const bleed = { t: 0, dps: 0, rec: 1, tick: 0, source: "bleed" };
  let deathHandler = null;
  let respawning = false, falling = false;
  let externalBosses = 0;
  const extBossIds = new Set();
  let kingHit = false;
  const hurtPayload = { amount: 0, hp: 0, maxHp: 0, source: "" };

  function applySpeed() {
    const on = slow.t > 0;
    if (on === slow.on) return;
    slow.on = on;
    try { engine.player.speedMul = on ? 1 - slow.mul : 1; } catch (e) { /* ignore */ }
  }

  function recomputeHp(full) {
    const sp = state.player;
    const old = sp.maxHp || 100;
    sp.maxHp = Items.maxHpFor(state.run.equip);
    if (full) sp.hp = sp.maxHp;
    else if (sp.maxHp > old) sp.hp = Math.min(sp.maxHp, sp.hp + (sp.maxHp - old));
    else sp.hp = Math.min(sp.hp, sp.maxHp);
  }

  function damagePlayer(raw, o = {}) {
    const sp = state.player;
    if (!sp.alive || !state.rt.playing || respawning) return 0;
    if (state.rt.god) return 0;
    if (!o.dot) {
      if (sp.invuln > 0) return 0;
      try { if (engine.player.dodging) return 0; } catch (e) { /* ignore */ }
    }
    const inc = Stats.inMul(C.level(), o.rec || 1);
    const dr = Items.drFor(state.run.equip);
    let amt = Stats.damageTaken(raw, inc, dr);
    amt = o.dot ? Math.max(0.2, Math.round(amt * 10) / 10) : Math.max(1, Math.round(amt));
    sp.hp = Math.max(0, sp.hp - amt);
    sp.lastHurt = engine.time || 0;
    if (!o.dot) sp.invuln = Stats.PLAYER_IFRAMES;
    if (o.dir && o.knock) {
      try { engine.player.knockback({ x: o.dir.x * o.knock, y: Math.min(4, o.knock * 0.35), z: o.dir.z * o.knock }); } catch (e) { /* ignore */ }
    }
    hurtPayload.amount = amt; hurtPayload.hp = sp.hp; hurtPayload.maxHp = sp.maxHp; hurtPayload.source = o.source || "";
    bus.emit("player:hurt", hurtPayload);
    if (!o.dot) {
      C.sfx("hurt", null, { vol: 0.9, rate: 0.95 + Math.random() * 0.1 });
      C.shake(Math.min(0.5, 0.12 + amt / sp.maxHp), 0.25);
      if (state.run.equip.armor === "bad_iron_armor") C.fx.burst("rust", engine.player.position.x, engine.player.position.y + 1.2, engine.player.position.z, 8, 0.2);
    }
    bosses.onPlayerHurt();
    kingHit = true;
    if (sp.hp <= 0) die(o.source || "enemy");
    return amt;
  }

  function healPlayer(n) {
    const sp = state.player;
    if (!sp.alive) return;
    sp.hp = Math.min(sp.maxHp, sp.hp + Math.max(0, n));
  }

  function revive(fullHp = true) {
    const sp = state.player;
    sp.alive = true;
    if (fullHp) sp.hp = sp.maxHp;
    sp.invuln = 1.5;
    slow.t = 0; bleed.t = 0; applySpeed();
    try { engine.player.setControl(true); } catch (e) { /* ignore */ }
    try { engine.player.play("idle"); } catch (e) { /* ignore */ }
  }

  function die(source) {
    const sp = state.player;
    if (!sp.alive) return;
    sp.alive = false; sp.hp = 0;
    state.run.deaths = (state.run.deaths || 0) + 1;
    atk.charging = false; atk.swing = false;
    slow.t = 0; bleed.t = 0; applySpeed();
    try { engine.player.setControl(false); } catch (e) { /* ignore */ }
    try { engine.player.play("die"); } catch (e) { /* ignore */ }
    C.sfx("player_death", null, { vol: 1 });
    C.fx.clearHostile();
    const zone = state.world.zone;
    bus.emit("player:died", { source, zone });
    bosses.onPlayerDied();
    let handled = false;
    if (deathHandler) {
      try { handled = deathHandler({ source }) === true; } catch (e) { warn(e); handled = false; }
    }
    if (handled) { revive(true); return; }
    respawn();
  }

  function wait(sec) {
    return new Promise((res) => {
      try { if (engine.after) { engine.after(sec, res); return; } } catch (e) { /* fall through */ }
      setTimeout(res, sec * 1000);
    });
  }

  async function respawn() {
    if (respawning) return;
    respawning = true;
    try {
      state.player.alive = false;
      try { ctx.audio && ctx.audio.stinger && ctx.audio.stinger("death"); } catch (e) { /* ignore */ }
      await wait(1.2);
      const hint = DEATH_HINTS[(Math.random() * DEATH_HINTS.length) | 0];
      const ds = C.ui("deathScreen", { title: "YOU DIED", hint });
      if (ds && ds.then) await ds; else await wait(2.5);
      const w = ctx.world;
      let spawn = { x: 0, y: 0, z: 10 };
      try { const p = w && w.point("spawn"); if (p) spawn = p; } catch (e) { /* ignore */ }
      if (w && w.goto) { try { await w.goto("lobby", { pos: spawn, yaw: 0 }); } catch (e) { engine.player.teleport(spawn, 0); } }
      else { try { engine.player.teleport(spawn, 0); } catch (e) { /* ignore */ } }
      recomputeHp(true);
      revive(true);
      bus.emit("player:respawn", { zone: "lobby" });
    } catch (e) { warn(e); revive(true); }
    finally { respawning = false; }
  }

  async function onFell(p) {
    if (falling || !state.rt.playing) return;
    if (deathHandler) {
      let handled = false;
      try { handled = deathHandler({ source: "fall" }) === true; } catch (e) { warn(e); }
      if (handled) { if (!state.player.alive) revive(true); return; }
    }
    falling = true;
    try {
      const f = C.ui("fade", 1, 0.4, "#000");
      if (f && f.then) await f; else await wait(0.4);
      const ls = engine.player.lastSafe;
      let to = ls ? { x: ls.x, y: ls.y + 0.2, z: ls.z } : null;
      if (!to) { try { to = ctx.world.point("spawn"); } catch (e) { to = { x: 0, y: 0, z: 10 }; } }
      engine.player.teleport(to);
      const sp = state.player;
      if (sp.alive) sp.hp = Math.max(1, sp.hp - sp.maxHp * 0.1);
      sp.invuln = 1;
      const f2 = C.ui("fade", 0, 0.4, "#000");
      if (f2 && f2.then) await f2;
    } catch (e) { warn(e); }
    finally { falling = false; }
  }

  // ------------------------------------------------------------------ gear (equip, visuals, multipliers)
  const handCache = new Map(), bodyCache = new Map(), charmCache = new Map(), crownCache = new Map();
  const bodyGroup = new THREE.Group(); bodyGroup.name = "combat.body";
  let crownObj = null, crownWind = { t: 0, next: 60 };
  let handObj = null;

  function cached(map, id, fn) { if (!id) return null; let o = map.get(id); if (!o) { o = fn(id); map.set(id, o); } return o; }

  function applyGear() {
    const eq = state.run.equip;
    const pl = engine.player;
    if (!pl) return;
    try {
      handObj = eq.sword && eq.sword !== "fists" ? cached(handCache, eq.sword, (id) => items.handItem(id)) : null;
      pl.attach && pl.attach("hand", handObj);
    } catch (e) { warn(e); }
    try {
      while (bodyGroup.children.length) bodyGroup.remove(bodyGroup.children[0]);
      const a = eq.armor && cached(bodyCache, eq.armor, (id) => items.armorBody(id));
      if (a) bodyGroup.add(a);
      const c = eq.charm && cached(charmCache, eq.charm, (id) => items.charmMesh(id));
      if (c) bodyGroup.add(c);
      pl.attach && pl.attach("body", bodyGroup.children.length ? bodyGroup : null);
    } catch (e) { warn(e); }
    try {
      const ad = eq.armor ? Items.item(eq.armor) : null;
      pl.setArmorLook && pl.setArmorLook(ad && ad.look ? ad.look : null);
    } catch (e) { warn(e); }
    try {
      const md = eq.morph ? Items.item(eq.morph) : null;
      pl.setMorph && pl.setMorph(md && md.morph ? md.morph : "human");
    } catch (e) { warn(e); }
    try {
      crownObj = eq.crown ? cached(crownCache, eq.crown, (id) => {
        const g = items.crown(id === "kings_crown" ? "kings_crown" : "paper");
        if (g.userData.glow) {
          const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: C.fx.glowTex, color: 0xffd36a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
          s.scale.set(0.42, 0.26, 0.42); s.position.y = 0.08; s.material.opacity = 0.35; g.add(s);
          if (C.fx.fadeNearCam) s.onBeforeRender = C.fx.fadeNearCam;
        }
        const holder = new THREE.Group(); holder.add(g); holder.userData.inner = g;
        return holder;
      }) : null;
      if (crownObj) { crownObj.userData.inner.position.set(0, 0, 0); crownObj.userData.inner.rotation.set(0, 0, 0); }
      pl.attach && pl.attach("head", crownObj);
    } catch (e) { warn(e); }
    setWeaponGlowAuto();
  }

  function give(itemId, opts = {}) {
    const d = Items.item(itemId);
    if (!d) { console.warn("[combat] unknown item", itemId); return false; }
    const r = state.run;
    const first = !r.owned[itemId];
    r.owned[itemId] = true;
    const doEquip = opts.equip !== false && d.slot !== "key" && Items.isUpgrade(itemId, r.equip);
    bus.emit("item:get", { id: itemId, first });
    if (!opts.silent) { try { ctx.audio && ctx.audio.stinger && ctx.audio.stinger("itemGet"); } catch (e) { /* ignore */ } }
    if (doEquip) {
      equip(itemId, true);
      if (!opts.silent) C.ui("toast", "Equipped " + d.name, { kind: "good", dur: 2.5 });
    }
    C.save();
    return first;
  }

  function has(itemId) { return !!state.run.owned[itemId] || itemId === "fists"; }

  function equip(itemId, quiet) {
    const d = Items.item(itemId);
    if (!d || d.slot === "key") return false;
    if (!has(itemId)) return false;
    state.run.equip[d.slot] = itemId;
    recomputeHp(false);
    applyGear();
    bus.emit("item:equip", { slot: d.slot, id: itemId });
    if (!quiet) C.sfx("item_equip", null, { vol: 0.8 });
    C.save();
    return true;
  }

  function unequip(slot) {
    if (!(slot in state.run.equip)) return false;
    state.run.equip[slot] = slot === "sword" ? "fists" : null;
    recomputeHp(false);
    applyGear();
    bus.emit("item:equip", { slot, id: state.run.equip[slot] });
    C.save();
    return true;
  }

  function remove(itemId) {
    const r = state.run;
    if (!r.owned[itemId]) return false;
    delete r.owned[itemId];
    const d = Items.item(itemId);
    if (d && d.slot !== "key" && r.equip[d.slot] === itemId) {
      const best = Items.bestOwned(r.owned, d.slot);
      r.equip[d.slot] = best ? best.id : (d.slot === "sword" ? "fists" : null);
      recomputeHp(false);
      applyGear();
      bus.emit("item:equip", { slot: d.slot, id: r.equip[d.slot] });
    }
    C.save();
    return true;
  }

  function inventory() {
    const r = state.run;
    const out = [];
    const ids = ["fists"];
    for (const id in r.owned) if (r.owned[id] && id !== "fists") ids.push(id);
    const order = { sword: 0, armor: 1, morph: 2, crown: 3, charm: 4, key: 5 };
    ids.sort((a, b) => {
      const A = Items.item(a), B = Items.item(b);
      if (!A || !B) return 0;
      return (order[A.slot] - order[B.slot]) || (A.mult - B.mult);
    });
    for (const id of ids) {
      const d = Items.item(id);
      if (!d) continue;
      out.push({ id, name: d.name, slot: d.slot, owned: true, equipped: d.slot !== "key" && r.equip[d.slot] === id, mult: d.mult, desc: d.desc,
        dmg: d.dmg || 0, hp: d.hp || 0, dr: d.dr || 0, bad: d.bad });
    }
    return out;
  }

  // ------------------------------------------------------------------ levels, thresholds, shop
  function mult() { return Items.computeMult(state.run.equip); }

  function addLevels(base, source, opts = {}) {
    const gained = Stats.levelsFor(base, mult(), !!opts.flat);
    if (!(gained > 0)) return 0;
    state.run.level = (state.run.level || 0) + gained;
    bus.emit("level:gain", { amount: gained, total: state.run.level, source: source || "" });
    checkThresholds(false);
    refreshPlates();
    return gained;
  }

  function setLevel(n) {
    state.run.level = Math.max(0, Math.round(Number(n) || 0));
    bus.emit("level:set", { total: state.run.level });
    checkThresholds(false);
    refreshPlates();
    C.save();
  }

  function refreshPlates() {
    const lvl = C.level();
    for (const e of en.list) {
      if (!e.active || !e.plate) continue;
      if (e.kind === "rookie") continue;
      C.plates.refresh(e.plate, lvl);
    }
  }

  function checkThresholds(silent) {
    const r = state.run;
    const cyc = C.cycle();
    for (const t of Stats.THRESHOLDS) {
      const key = "combat.th." + t.id;
      if (r.flags[key]) continue;
      const need = Stats.need(t.id, cyc);
      if (r.level < need) continue;
      r.flags[key] = true;
      bus.emit("milestone", { id: t.id, threshold: need });
      if (t.type === "auto") {
        give(dropId(t.id, cyc), { silent: !!silent });
      } else {
        if (t.id === "area3") r.flags["combat.claimed.area3"] = true;   // Castle Pass auto-claimed
        bus.emit("unlock", { id: t.id });
        if (!silent) { try { ctx.audio && ctx.audio.stinger && ctx.audio.stinger("unlock"); } catch (e) { /* ignore */ } }
      }
    }
  }

  function need(id) { return Stats.need(id, C.cycle()); }

  function canEnter(id) {
    const n = need(id), have = C.level();
    return { ok: have >= n, need: n, have };
  }

  function shopState(id) {
    const r = state.run;
    if (id === "area3") return r.level >= need("area3") ? "claimed" : "locked";
    if (r.flags["combat.claimed." + id] || Items.ownsAny(r.owned, id)) return "claimed";
    return r.level >= need(id) ? "claimable" : "locked";
  }
  function shop() {
    const out = [];
    for (const s of SHOP) {
      const id = s.id;
      const d = Items.item(dropId(id, C.cycle()));
      out.push({ id, name: id === "area3" ? s.name : (d ? d.name : s.name), need: need(id), state: shopState(id) });
    }
    return out;
  }
  function claim(id) {
    const s = SHOP.find((x) => x.id === id);
    if (!s) return { ok: false, reason: "unknown" };
    const st = shopState(id);
    if (st === "claimed") return { ok: false, reason: "claimed" };
    if (st === "locked") return { ok: false, reason: "locked", need: need(id), have: C.level() };
    if (id === "area3") return { ok: false, reason: "auto" };
    state.run.flags["combat.claimed." + id] = true;
    give(dropId(id, C.cycle()), { equip: true });
    return { ok: true };
  }

  // ------------------------------------------------------------------ kills, rewards, drops
  C.onKilled = (e, info) => {
    try {
      const r = state.run;
      const k = e.kind;
      const K = Stats.KINDS[k] || { levels: 0 };
      const reward = !e.noReward && !e.clone;
      const prev = r.kills[k] || 0;
      let gained = 0;
      if (reward) {
        // rats the Rat King summons give their flat base (1), not MULT x 1, so Area 1 keeps the DESIGN 4.4 pace
        gained = addLevels(K.levels, k, { flat: !!K.flat || !!e.summoned });
        r.kills[k] = prev + 1;
      }
      bus.emit("enemy:killed", { id: e.id, kind: k, boss: !!e.boss, levels: gained, first: reward && prev === 0,
        pos: { x: e.pos.x, y: e.pos.y, z: e.pos.z } });
      if (gained > 0) {
        C.ui("damageNumber", { x: e.pos.x, y: e.pos.y + e.def.height + 0.8, z: e.pos.z }, "+" + Stats.fmtLevels(gained) + " LV", "levels");
        C.fx.burst("level", e.pos.x, e.pos.y + e.def.height * 0.6, e.pos.z, 18, 0.4);
      }
      if (reward) {
        const drops = rollDrops(k, r);
        for (const base of drops) give(dropId(base, C.cycle()), { equip: true });
      }
      if (k === "goldenRat") {
        for (const o of en.list) if (o.waitGolden) { o.waitGolden = false; o.respawnT = 4; }
      }
      bosses.onKilled(e);
    } catch (er) { warn(er); }
  };

  // ------------------------------------------------------------------ player attacks
  const atk = { charging: false, chargeT: 0, chargeSnd: null, swing: false, swingT: 0, hitAt: 0.12, heavy: false, kind: "punch",
    cd: 0, resolved: true, queued: -1, queuedT: 0, flip: false };
  const hittables = [];
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vDir = new THREE.Vector3(), vPoint = new THREE.Vector3();
  const hitInfo = { dmg: 0, heavy: false, crit: false, dir: vDir, point: vPoint, stink: false, bolt: false, crumbs: false, extraFx: null };
  const hitPayload = { id: "", kind: "", dmg: 0, crit: false, heavy: false };
  const extHit = { dmg: 0, heavy: false, crit: false, dir: vDir, point: vPoint };

  function weapon() { return Items.item(state.run.equip.sword) || Items.item("fists"); }

  function canAct() {
    const rt = state.rt;
    return rt.playing && !rt.paused && !rt.cinematic && !state.ui.modal && state.player.alive && !respawning;
  }

  // trail arc for swings
  const trailMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const trailGeo = new THREE.RingGeometry(0.75, 1.0, 24, 1, -1.2, 2.4); trailGeo.rotateX(-Math.PI / 2);
  const trail = new THREE.Mesh(trailGeo, trailMat); trail.visible = false; trail.renderOrder = 6; scene.add(trail);
  let trailT = 0;

  function handPos(out) {
    try {
      const h = engine.player.avatar && engine.player.avatar.hand;
      if (h) { h.getWorldPosition(out); return out; }
    } catch (e) { /* ignore */ }
    const p = engine.player.position, y = engine.player.yaw || 0;
    return out.set(p.x + Math.sin(y) * 0.4 - Math.cos(y) * 0.25, p.y + 1.15, p.z + Math.cos(y) * 0.4 + Math.sin(y) * 0.25);
  }

  function onAttackInput(ev) {
    try {
      if (ev.phase === "down") {
        if (!canAct()) return;
        atk.charging = true; atk.chargeT = 0; atk.chargeSnd = null;
      } else if (ev.phase === "up") {
        if (!atk.charging) return;
        const heavy = (ev.held || 0) >= Stats.HEAVY_HOLD || atk.chargeT >= Stats.HEAVY_HOLD;
        release(heavy);
      }
    } catch (e) { warn(e); }
  }

  function release(heavy) {
    atk.charging = false;
    if (atk.chargeSnd && atk.chargeSnd.stop) { try { atk.chargeSnd.stop(0.1); } catch (e) { /* ignore */ } }
    atk.chargeSnd = null;
    if (!canAct()) return;
    if (atk.cd > 0) { if (atk.cd < 0.3) { atk.queued = heavy ? 1 : 0; atk.queuedT = 0.35; } return; }
    fire(heavy);
  }

  function fire(heavy) {
    const w = weapon();
    const isStaff = w.base === "kings_staff";
    atk.heavy = heavy;
    atk.kind = w.kind === "punch" ? "punch" : isStaff && heavy ? "bolt" : heavy ? "heavy" : "slash";
    atk.cd = w.cd * (heavy ? 1.7 : 1);
    atk.swing = true; atk.swingT = 0; atk.hitAt = heavy ? 0.2 : 0.12; atk.resolved = false;
    atk.flip = !atk.flip;
    // aim assist: turn toward the nearest enemy in front
    const pl = engine.player;
    const p = pl.position;
    let best = null, bestD = (w.bolt && heavy ? 25 : w.reach + 2.5);
    const fy = pl.yaw || 0, fx0 = Math.sin(fy), fz0 = Math.cos(fy);
    for (const e of en.list) {
      if (!e.alive || !e.active || e.burrowed || e.rafter) continue;
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z;
      const d = Math.sqrt(dx * dx + dz * dz) - e.def.radius;
      if (d > bestD || Math.abs(e.pos.y - p.y) > 3) continue;
      const dot = (dx * fx0 + dz * fz0) / (d + e.def.radius || 1);
      if (dot < 0.35) continue;
      best = e; bestD = d;
    }
    // pre-hit reactions (villager raises the pitchfork / Myles reads heavies)
    for (const e of en.list) {
      if (!e.alive || !e.active) continue;
      const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > w.reach + 3) continue;
      const front = (dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw)) / (d || 1) > 0.3;
      en.ai.onPlayerAttack(e, heavy, d, front);
    }
    if (best) { try { pl.yaw = Math.atan2(best.pos.x - p.x, best.pos.z - p.z); } catch (e) { /* ignore */ } }
    const anim = atk.kind === "punch" ? "punch" : atk.kind === "bolt" || atk.kind === "heavy" ? "heavy" : "slash";
    try { pl.play(anim, { speed: heavy ? 1.1 : Math.max(0.8, 0.45 / Math.max(0.2, w.cd)) }); } catch (e) { /* ignore */ }
    bus.emit("player:attack", { kind: atk.kind, weapon: w.id });
    C.sfx(w.kind === "punch" ? "whoosh_punch" : "whoosh_sword", null, { vol: heavy ? 1 : 0.8, rate: heavy ? 0.8 : (w.kind === "claw" ? 1.4 : 1.05 - Math.min(0.3, w.dmg / 200)) });
    if (heavy) C.sfx("heavy_release", null, { vol: 0.8 });
    // swing trail
    if (atk.kind !== "punch" && atk.kind !== "bolt") {
      trail.visible = true; trailT = 0.16;
      trail.scale.setScalar(w.reach * 0.95);
      trail.position.set(p.x, p.y + (heavy ? 1.0 : 1.15), p.z);
      trail.rotation.set(atk.flip ? 0.25 : -0.25, pl.yaw || 0, 0);
      trailMat.color.setHex(w.bad ? 0xc8d890 : w.base === "gold_sword" || w.base === "kings_staff" ? 0xffe6a0 : 0xffffff);
    }
  }

  function resolveSwing() {
    atk.resolved = true;
    const w = weapon();
    const pl = engine.player;
    const p = pl.position;
    const lvl = C.level();
    if (atk.kind === "bolt") { fireBolt(w); return; }
    const reach = w.reach * (atk.heavy ? 1.1 : 1);
    const arc = (w.arc || 100) * (atk.heavy ? 1.2 : 1);
    const cosA = Math.cos(arc * Math.PI / 360);
    const fy = pl.yaw || 0, fx0 = Math.sin(fy), fz0 = Math.cos(fy);
    let hits = 0;
    for (const e of en.list) {
      if (!e.alive || !e.active || e.burrowed) continue;
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z;
      const cd = Math.sqrt(dx * dx + dz * dz);
      const d = cd - e.def.radius;
      if (d > reach) continue;
      const ey = e.pos.y + e.airY;
      if (ey > p.y + 1.9 + 0.4 || ey + e.def.height < p.y - 0.4) continue;
      const dot = cd > 0.01 ? (dx * fx0 + dz * fz0) / cd : 1;
      if (cd > e.def.radius + 0.6 && dot < cosA) continue;
      if (e.peaceful && e.fight) { if (!bosses.start(e.fight)) continue; }
      const crit = Math.random() < Stats.CRIT_CHANCE;
      vDir.set(dx, 0, dz); if (cd > 0.001) vDir.multiplyScalar(1 / cd); else vDir.set(fx0, 0, fz0);
      vPoint.set(e.pos.x - vDir.x * e.def.radius * 0.8, ey + Math.min(e.def.height * 0.6, 1.3), e.pos.z - vDir.z * e.def.radius * 0.8);
      hitInfo.dmg = Stats.playerDamage(w.dmg, atk.heavy, crit, Stats.outMul(lvl, e.rec));
      hitInfo.heavy = atk.heavy; hitInfo.crit = crit; hitInfo.stink = !!w.stink; hitInfo.bolt = false; hitInfo.crumbs = !!w.crumbs;
      hitInfo.extraFx = flavorFx(w);
      const res = en.hitEntity(e, hitInfo);
      if (res === "hit") {
        hits++;
        hitPayload.id = e.id; hitPayload.kind = e.kind; hitPayload.dmg = hitInfo.dmg; hitPayload.crit = crit; hitPayload.heavy = atk.heavy;
        bus.emit("enemy:hit", hitPayload);
      }
    }
    for (let i = 0; i < hittables.length; i++) {
      const h = hittables[i];
      try {
        if (!h.isAlive || !h.isAlive()) continue;
        const dx = h.pos.x - p.x, dz = h.pos.z - p.z;
        const cd = Math.sqrt(dx * dx + dz * dz);
        const d = cd - (h.radius || 0.5);
        if (d > reach) continue;
        const hy = h.pos.y, hh = h.height || 2;
        if (hy > p.y + 2.3 || hy + hh < p.y - 0.4) continue;
        const dot = cd > 0.01 ? (dx * fx0 + dz * fz0) / cd : 1;
        if (cd > (h.radius || 0.5) + 0.6 && dot < cosA) continue;
        const crit = Math.random() < Stats.CRIT_CHANCE;
        vDir.set(dx, 0, dz); if (cd > 0.001) vDir.multiplyScalar(1 / cd);
        vPoint.set(h.pos.x - vDir.x * (h.radius || 0.5), Math.max(hy, p.y) + Math.min(hh * 0.5, 1.3), h.pos.z - vDir.z * (h.radius || 0.5));
        extHit.dmg = Stats.playerDamage(w.dmg, atk.heavy, crit, Stats.outMul(lvl, h.rec || 1));
        extHit.heavy = atk.heavy; extHit.crit = crit;
        h.onHit(extHit);
        hits++;
        hitPayload.id = h.id; hitPayload.kind = h.kind; hitPayload.dmg = extHit.dmg; hitPayload.crit = crit; hitPayload.heavy = atk.heavy;
        bus.emit("enemy:hit", hitPayload);
        C.ui("damageNumber", vPoint, String(Math.max(1, Math.round(extHit.dmg))), crit ? "crit" : "hit");
      } catch (e) { warn(e); }
    }
    if (hits) {
      C.sfx(w.kind === "punch" ? "hit_punch" : w.base === "wooden_sword" ? "hit_wood" : "hit_flesh", null, { vol: 0.9 });
      C.shake(atk.heavy ? 0.22 : 0.08, atk.heavy ? 0.2 : 0.1);
    }
  }

  function flavorFx(w) {
    if (!w.bad) return w.stink ? "fumes" : null;
    switch (w.downside) {
      case "flies": return "flies"; case "mold": return "mold"; case "termites": return "dust"; case "rust": return "rust";
      case "flaking": return "gold"; case "hairball": return "hair"; case "crooked": return "mold"; default: return null;
    }
  }

  function fireBolt(w) {
    const pl = engine.player;
    const p = pl.position;
    handPos(vA);
    const b = w.bolt || { dmg: 40, range: 25, speed: 34 };
    // aim at the nearest target in a 25 deg cone, else straight ahead
    const fy = pl.yaw || 0;
    let ax = Math.sin(fy), ay = 0, az = Math.cos(fy);
    let best = null, bestD = b.range;
    for (const e of en.list) {
      if (!e.alive || !e.active || e.burrowed) continue;
      const dx = e.pos.x - vA.x, dy = e.pos.y + e.airY + e.def.height * 0.55 - vA.y, dz = e.pos.z - vA.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > bestD) continue;
      if ((dx * ax + dz * az) / (Math.sqrt(dx * dx + dz * dz) || 1) < 0.9) continue;
      best = e; bestD = d;
    }
    for (let i = 0; i < hittables.length; i++) {
      const h = hittables[i];
      try {
        if (!h.isAlive || !h.isAlive()) continue;
        const dx = h.pos.x - vA.x, dy = h.pos.y + (h.height || 2) * 0.5 - vA.y, dz = h.pos.z - vA.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > bestD || (dx * ax + dz * az) / (Math.sqrt(dx * dx + dz * dz) || 1) < 0.9) continue;
        best = h; bestD = d;
      } catch (e) { /* ignore */ }
    }
    if (best) {
      const by = best.def ? best.pos.y + best.airY + best.def.height * 0.55 : best.pos.y + (best.height || 2) * 0.5;
      vB.set(best.pos.x - vA.x, by - vA.y, best.pos.z - vA.z).normalize();
      ax = vB.x; ay = vB.y; az = vB.z;
    }
    if (w.bad) { ax += (Math.random() - 0.5) * 0.12; az += (Math.random() - 0.5) * 0.12; ay += 0.04; }
    const crit = Math.random() < Stats.CRIT_CHANCE;
    C.fx.projectile({ type: w.bad ? "badBolt" : "playerBolt", x: vA.x, y: vA.y, z: vA.z, vx: ax * b.speed, vy: ay * b.speed, vz: az * b.speed,
      gravity: 0, life: b.range / b.speed, dmg: b.dmg, team: "player", source: "player", crit, radius: 0.35 });
    C.sfx("staff_bolt", null, { vol: 0.9, rate: w.bad ? 0.8 : 1.1 });
    bus.emit("player:attack", { kind: "bolt", weapon: w.id });
  }

  // projectile -> targets (player bolts)
  function boltHit(proj, x, y, z, r) {
    const lvl = C.level();
    for (const e of en.list) {
      if (!e.alive || !e.active || e.burrowed) continue;
      const dx = e.pos.x - x, dz = e.pos.z - z;
      const rr = r + e.def.radius;
      if (dx * dx + dz * dz > rr * rr) continue;
      const ey = e.pos.y + e.airY;
      if (y < ey - 0.3 || y > ey + e.def.height + 0.3) continue;
      if (e.peaceful && e.fight) { if (!bosses.start(e.fight)) continue; }
      const L = Math.sqrt(proj.vx * proj.vx + proj.vz * proj.vz) || 1;
      vDir.set(proj.vx / L, 0, proj.vz / L);
      vPoint.set(x, y, z);
      hitInfo.dmg = proj.dmg * (proj.crit ? Stats.CRIT_MUL : 1) * Stats.outMul(lvl, e.rec);
      hitInfo.heavy = true; hitInfo.crit = proj.crit; hitInfo.stink = false; hitInfo.bolt = true; hitInfo.crumbs = false; hitInfo.extraFx = "bolt";
      const res = en.hitEntity(e, hitInfo);
      if (res === "hit") {
        hitPayload.id = e.id; hitPayload.kind = e.kind; hitPayload.dmg = hitInfo.dmg; hitPayload.crit = proj.crit; hitPayload.heavy = true;
        bus.emit("enemy:hit", hitPayload);
      }
      C.sfx("hit_flesh", e.pos, { vol: 0.7, rate: 1.2 });
      return true;
    }
    for (let i = 0; i < hittables.length; i++) {
      const h = hittables[i];
      try {
        if (!h.isAlive || !h.isAlive()) continue;
        const dx = h.pos.x - x, dz = h.pos.z - z;
        const rr = r + (h.radius || 0.5);
        if (dx * dx + dz * dz > rr * rr) continue;
        if (y < h.pos.y - 0.3 || y > h.pos.y + (h.height || 2) + 0.3) continue;
        const L = Math.sqrt(proj.vx * proj.vx + proj.vz * proj.vz) || 1;
        vDir.set(proj.vx / L, 0, proj.vz / L); vPoint.set(x, y, z);
        extHit.dmg = proj.dmg * (proj.crit ? Stats.CRIT_MUL : 1) * Stats.outMul(lvl, h.rec || 1);
        extHit.heavy = true; extHit.crit = proj.crit;
        h.onHit(extHit);
        hitPayload.id = h.id; hitPayload.kind = h.kind; hitPayload.dmg = extHit.dmg; hitPayload.crit = proj.crit; hitPayload.heavy = true;
        bus.emit("enemy:hit", hitPayload);
        C.ui("damageNumber", vPoint, String(Math.max(1, Math.round(extHit.dmg))), proj.crit ? "crit" : "hit");
        return true;
      } catch (e) { warn(e); }
    }
    return false;
  }

  function addHittable(h) {
    hittables.push(h);
    return () => { const i = hittables.indexOf(h); if (i >= 0) hittables.splice(i, 1); };
  }

  // ------------------------------------------------------------------ weapon glow (dark zones)
  let glowLight = null, glowOverride = null;
  function setWeaponGlow(on) {
    glowOverride = on === null || on === undefined ? null : !!on;
    setWeaponGlowAuto();
  }
  function setWeaponGlowAuto() {
    const zone = state.world.zone;
    const f = bosses.fight;
    const want = glowOverride !== null ? glowOverride : (zone === "kingDark" || !!(f && (f.lampDown || (f.id === "king" && (f.lightsOut || f.phase >= 3)))));
    if (want && !glowLight) {
      glowLight = new THREE.PointLight(0xffd8a8, 1.6, 9, 1.5);
      glowLight.castShadow = false;
    }
    if (!glowLight) return;
    const parent = handObj || (engine.player && engine.player.object);
    if (want && parent && glowLight.parent !== parent) { parent.add(glowLight); glowLight.position.set(0, handObj ? 0 : 1.2, handObj ? 0.5 : 0.4); }
    glowLight.visible = want;
  }
  // bosses call these when a fight goes dark / ends; the auto rule reads the fight state
  C.setWeaponGlow = () => setWeaponGlowAuto();
  C.setWeaponGlowAuto = () => setWeaponGlowAuto();

  // ------------------------------------------------------------------ population & run state
  let rookieRemove = null, bellRemove = null, ratTrigger = null;
  const rookieTalkPos = new THREE.Vector3(-88, 1, 60);
  const bellPos = new THREE.Vector3(-72, 0, 236);

  function spawnsOf(kind, fallback) {
    try {
      const s = ctx.world && ctx.world.spawns(kind);
      if (s && s.length) return s;
    } catch (e) { /* ignore */ }
    return fallback();
  }

  function populate() {
    en.despawnAll();
    bosses.resetAll();
    const w = ctx.world;
    try { const vs = w && w.point("villageSquare"); if (vs) { C.villageCentre.x = vs.x; C.villageCentre.y = vs.y; C.villageCentre.z = vs.z; } } catch (e) { /* ignore */ }
    // rats: 12 alive across the field points
    const ratPts = spawnsOf("rat", () => {
      const a = [];
      for (let i = 0; i < 12; i++) a.push({ pos: { x: -28 + (i % 4) * 18 + (i % 3) * 2, y: 0, z: 84 + Math.floor(i / 4) * 14 }, yaw: 0, radius: 5 });
      return a;
    });
    for (let i = 0; i < 12; i++) {
      const sp = ratPts[i % ratPts.length];
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (sp.radius || 4);
      vA.set(sp.pos.x + Math.cos(a) * r, sp.pos.y, sp.pos.z + Math.sin(a) * r);
      en.spawn("rat", vA, { yaw: Math.random() * 6.28, spawnPoints: ratPts, zone: "ratField", leash: 38 });
    }
    // villagers: one per house
    const vil = spawnsOf("villager", () => {
      const a = [];
      for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4; a.push({ pos: { x: Math.sin(an) * 31, y: 0, z: 240 + Math.cos(an) * 31 }, yaw: an + Math.PI, radius: 0 }); }
      return a;
    });
    for (let i = 0; i < vil.length && i < 8; i++) en.spawn("villager", vil[i].pos, { yaw: vil[i].yaw || 0, variant: i, zone: "village" });
    // royal guards at their posts, paired (0-1, 2-3, 4-5)
    const rg = spawnsOf("royalGuard", () => [[-15, 420], [-5, 420], [5, 420], [15, 420], [-8, 432], [8, 432]].map((p) => ({ pos: { x: p[0], y: 18, z: p[1] }, yaw: Math.PI, radius: 0 })));
    const guards = [];
    for (let i = 0; i < rg.length && i < 6; i++) guards.push(en.spawn("royalGuard", rg[i].pos, { yaw: rg[i].yaw || Math.PI, zone: "castle" }));
    for (let i = 0; i + 1 < guards.length; i += 2) { guards[i].partner = guards[i + 1]; guards[i + 1].partner = guards[i]; }
    bosses.populate();
    registerInteractables();
    // gates already earned (CONTINUE): open without animation
    for (const id of ["area2", "area3"]) {
      try { if (C.level() >= need(id) && w && w.gate) { const g = w.gate(id); if (g && !g.isOpen) g.open(false); } } catch (e) { /* ignore */ }
    }
  }

  function registerInteractables() {
    const w = ctx.world;
    if (!w || !w.addInteractable) return;
    try {
      if (!rookieRemove) {
        rookieRemove = w.addInteractable({ id: "combat.rookie", pos: rookieTalkPos, radius: 3, label: "Talk to Rookie", priority: 1,
          enabled: () => { const r = bosses.rookie; return !!(r && r.alive && r.peaceful && !bosses.active && !state.ui.modal); },
          onUse: () => { bosses.talkRookie().catch(warn); } });
      }
      if (!bellRemove) {
        try { const bp = w.point("barnDoor"); if (bp) bellPos.set(bp.x, bp.y, bp.z); } catch (e) { /* ignore */ }
        bellRemove = w.addInteractable({ id: "combat.barnBell", pos: bellPos, radius: 2.6, label: "Ring the bell",
          enabled: () => !!(state.run.flags["combat.catBeaten"] && !bosses.active && state.profile.secrets && state.profile.secrets.kittens),
          onUse: () => bosses.ringBell() });
      }
    } catch (e) { warn(e); }
    try {
      if (ratTrigger == null && engine.physics && engine.physics.addTrigger) {
        let gp = { x: 0, y: 0, z: 132 };
        try { const q = w.point("ratKingGate"); if (q) gp = q; } catch (e) { /* ignore */ }
        ratTrigger = engine.physics.addTrigger({ center: { x: gp.x, y: gp.y, z: gp.z + 3.2 }, size: { x: 6, y: 5, z: 2.4 }, tag: "combat.ratKingEnter",
          onEnter: () => {
            // only when walking INTO the ring
            const v = engine.player.velocity;
            if (v && v.z < -0.2) return;
            if (bosses.ratKing && bosses.ratKing.alive && bosses.ratKing.peaceful) bosses.start("ratKing");
          } });
      }
    } catch (e) { warn(e); ratTrigger = -1; }
  }

  function resetRun(cycle) {
    try {
      bosses.resetAll();
      en.despawnAll();
      C.fx.clear();
      slow.t = 0; bleed.t = 0; applySpeed();
      atk.charging = false; atk.swing = false; atk.cd = 0;
      glowOverride = null;
      const sp = state.player;
      sp.invuln = 0; sp.alive = true; sp.lastHurt = 0;
      recomputeHp(true);
      applyGear();
      state.rt.god = godSticky;   // the debug god mode survives run resets ("remember the choice", new cycle)
    } catch (e) { warn(e); }
  }

  function validateEquip() {
    const r = state.run;
    for (const s of Items.SLOTS) {
      const id = r.equip[s];
      if (!id) continue;
      if (id === "fists" && s === "sword") continue;
      if (!Items.item(id) || !r.owned[id]) r.equip[s] = s === "sword" ? "fists" : null;
    }
    if (!r.equip.sword) r.equip.sword = "fists";
  }

  // ------------------------------------------------------------------ bus wiring
  bus.on("input:attack", onAttackInput);
  bus.on("player:fell", (p) => { onFell(p).catch(warn); });
  bus.on("game:start", () => {
    try {
      validateEquip();
      recomputeHp(true);
      state.player.alive = true; state.player.invuln = 1;
      applyGear();
      checkThresholds(true);
      populate();
    } catch (e) { warn(e); }
  });
  bus.on("run:reset", (p) => resetRun(p && p.cycle));
  bus.on("zone:enter", (p) => {
    try {
      const id = p && p.id;
      if (id === "kingDark") {
        wait(0.9).then(() => { if (state.world.zone === "kingDark" && !bosses.active) bosses.start("king"); if (bosses.active === "king") bosses.onFightStartedKing(); }).catch(warn);
      } else if (id === "barn") {
        if (state.profile.secrets && state.profile.secrets.kittens && !state.run.flags["combat.catBeaten"] && !bosses.active) bosses.start("cat");
      }
      setWeaponGlowAuto();
    } catch (e) { warn(e); }
  });
  bus.on("zone:exit", (p) => {
    try { if (p && p.id === "kingDark" && bosses.active === "king") bosses.end(false); } catch (e) { warn(e); }
  });
  // EVENTS-reported boss fights also count for fightActive()
  bus.on("boss:start", (p) => { if (p && p.id && p.id !== bosses.active) { extBossIds.add(p.id); externalBosses = extBossIds.size; } });
  bus.on("boss:end", (p) => { if (p && extBossIds.has(p.id)) { extBossIds.delete(p.id); externalBosses = extBossIds.size; } });
  let stepN = 0;
  bus.on("player:step", () => {
    const eq = state.run.equip;
    stepN++;
    if (eq.armor === "bad_golden_armor") C.sfx("hit_metal", null, { vol: 0.35, rate: 1.6 + Math.random() * 0.2 });
    if (eq.charm === "toms_bell" && (stepN & 1)) C.sfx("bell", null, { vol: 0.22, rate: 1.9 });
  });

  // ------------------------------------------------------------------ per-frame
  let flavorT = 0;
  function tick(dt, t) {
    frameNo++;
    const rt = state.rt;
    if (!rt.playing) return;
    const sp = state.player;
    // player timers
    if (sp.invuln > 0) sp.invuln = Math.max(0, sp.invuln - dt);
    if (atk.cd > 0) atk.cd -= dt;
    if (atk.queuedT > 0) { atk.queuedT -= dt; if (atk.cd <= 0 && atk.queued >= 0 && canAct()) { const h = atk.queued === 1; atk.queued = -1; fire(h); } }
    else atk.queued = -1;
    if (atk.charging) {
      atk.chargeT += dt;
      if (!canAct()) atk.charging = false;
      else {
        if (atk.chargeT >= Stats.HEAVY_HOLD && !atk.chargeSnd) {
          atk.chargeSnd = C.sfx("heavy_charge", null, { vol: 0.6 }) || true;
        }
        if (atk.chargeT >= 0.25 && Math.random() < 0.5) { handPos(vA); C.fx.burst(atk.chargeT >= Stats.HEAVY_HOLD ? "gold" : "spark", vA.x, vA.y, vA.z, 1, 0.08); }
        if (atk.chargeT > 3) release(true);
      }
    }
    if (atk.swing) {
      atk.swingT += dt;
      if (!atk.resolved && atk.swingT >= atk.hitAt) { try { resolveSwing(); } catch (e) { warn(e); } }
      if (atk.swingT > 0.6) atk.swing = false;
    }
    if (trailT > 0) {
      trailT -= dt;
      trailMat.opacity = Math.max(0, trailT / 0.16) * 0.35;
      trail.rotation.y += dt * (atk.flip ? 9 : -9);
      if (trailT <= 0) trail.visible = false;
    }
    // statuses
    if (slow.t > 0) { slow.t -= dt; if (slow.t <= 0) applySpeed(); }
    if (bleed.t > 0 && sp.alive) {
      bleed.t -= dt; bleed.tick -= dt;
      if (bleed.tick <= 0) { bleed.tick = 0.5; damagePlayer(bleed.dps * 0.5, { rec: bleed.rec, source: bleed.source, dot: true }); }
    }
    // regen: 6 HP/s after 5 s without damage
    if (sp.alive && sp.hp < sp.maxHp && (engine.time || 0) - (sp.lastHurt || 0) > Stats.REGEN_DELAY) {
      sp.hp = Math.min(sp.maxHp, sp.hp + Stats.REGEN_RATE * dt);
    }
    if (rt.paused) return;
    en.update(dt, t);
    bosses.update(dt, t);
    C.fx.update(dt);
    // keep the Rookie talk point on him
    const rk = bosses.rookie;
    if (rk && rk.active) rookieTalkPos.copy(rk.pos);
    gearFlavor(dt, t);
  }

  function gearFlavor(dt, t) {
    const eq = state.run.equip;
    flavorT -= dt;
    if (flavorT <= 0) {
      flavorT = 0.25;
      const pl = engine.player;
      const moving = pl.isMoving ? pl.isMoving() : false;
      if (eq.sword === "bad_smelly_sword") { handPos(vA); C.fx.burst("flies", vA.x, vA.y + 0.3, vA.z, 1, 0.25); }
      else if (eq.sword === "smelly_sword" && Math.random() < 0.4) { handPos(vA); C.fx.burst("fumes", vA.x, vA.y + 0.25, vA.z, 1, 0.1); }
      if (eq.morph === "bad_villager_morph" && moving && Math.random() < 0.5) C.fx.burst("straw", pl.position.x, pl.position.y + 1, pl.position.z, 1, 0.3);
      if (eq.armor === "bad_cheese_armor" && Math.random() < 0.35) C.fx.burst("milk", pl.position.x, pl.position.y + 0.9, pl.position.z, 1, 0.2);
      if (eq.armor === "bad_smelly_armor" && moving && Math.random() < 0.25) C.fx.burst("cardboard", pl.position.x, pl.position.y + 0.8, pl.position.z, 1, 0.2);
      if (eq.crown === "kings_crown" && Math.random() < 0.3) C.fx.burst("gold", pl.position.x, pl.position.y + 2.0, pl.position.z, 1, 0.15);
    }
    // the Paper Crown blows off once a minute and floats back
    if (eq.crown === "bad_kings_crown" && crownObj && crownObj.userData.inner) {
      const inner = crownObj.userData.inner;
      crownWind.next -= dt;
      if (crownWind.next <= 0 && crownWind.t <= 0) { crownWind.t = 5; crownWind.next = 60; C.sfx("wind", null, { vol: 0.4 }); }
      if (crownWind.t > 0) {
        crownWind.t -= dt;
        const k = 1 - crownWind.t / 5;
        const up = Math.sin(k * Math.PI);
        inner.position.set(Math.sin(k * Math.PI * 2) * 0.8 * up, up * 1.3, -up * 0.9);
        inner.rotation.set(up * 1.2, k * 9, up * 0.6);
        if (crownWind.t <= 0) { inner.position.set(0, 0, 0); inner.rotation.set(0, 0, 0); }
      }
    }
    // weapon glow follows the hand item
    if (glowLight && glowLight.visible) glowLight.intensity = 1.5 + Math.sin(t * 7) * 0.08;
  }

  engine.addSystem("combat", (dt, t) => { try { tick(dt, t); } catch (e) { warn(e); } }, 30);

  // pre-warm materials/shaders once (hidden): avoids hitches on the first spawn
  try { recomputeHp(true); applyGear(); } catch (e) { warn(e); }

  // ------------------------------------------------------------------ public API
  const api = {
    level: () => C.level(),
    mult,
    addLevels,
    setLevel,
    rec: (kind) => Stats.recFor(kind, C.cycle(), C.level()),
    out: (rec) => Stats.outMul(C.level(), rec),
    inc: (rec) => Stats.inMul(C.level(), rec),
    damagePlayer,
    healPlayer,
    killPlayer: (source) => die(source || "script"),
    setInvuln: (sec) => { state.player.invuln = Math.max(state.player.invuln || 0, sec || 0); },
    addHittable,
    spawn: (kind, pos, opts = {}) => {
      const o = Object.assign({}, opts);
      if (o.zone == null) { try { o.zone = ctx.world && ctx.world.zoneAt ? ctx.world.zoneAt(pos.x, pos.y, pos.z) : null; } catch (e) { o.zone = null; } }
      const e = en.spawn(kind, pos, o);
      if (opts.aggro !== false && (o.noReward || o.summoned)) en.aggro(e);
      return e;
    },
    get enemies() { return en.list; },
    killAll: (filter) => {
      let n = 0;
      if (filter === "boss") { const id = bosses.active; if (id) { bosses.defeat(id); n++; } return n; }
      const list = en.list.slice();
      for (const e of list) {
        if (!e.alive || !e.active) continue;
        if (typeof filter === "string" && filter !== "all" && e.kind !== filter) continue;
        if (typeof filter === "function" && !filter(e)) continue;
        if (e.fight && (e.peaceful || bosses.active === e.fight)) { bosses.defeat(e.fight); n++; continue; }
        en.kill(e, null); n++;
      }
      return n;
    },
    give,
    has,
    remove,
    startFight: (id) => {
      if (id === "king") return false;
      return bosses.start(id);
    },
    equip: (id) => equip(id, false),
    unequip,
    inventory,
    get items() { return Items.CATALOG; },
    shop,
    claim,
    need,
    canEnter,
    setDeathHandler: (fn) => { deathHandler = typeof fn === "function" ? fn : null; },
    respawn: () => respawn(),
    fightActive: () => !!bosses.active || externalBosses > 0,
    resetRun,
    setGod: (b) => { state.rt.god = !!b; },
    weapon,
    // additions (contract changes): optional helpers
    setWeaponGlow,
    sourceOf: (id) => SOURCES[Items.baseOf(id)] || "",
    defeat: (id) => bosses.defeat(id),
    activeFight: () => bosses.active,
    fx: C.fx,
  };

  // debug hooks (CONTRACT 13)
  if (typeof window !== "undefined") {
    const d = window.__tnrpg || (window.__tnrpg = {});
    d.setLevel = (n) => { try { setLevel(n); return state.run.level; } catch (e) { warn(e); return null; } };
    d.give = (id) => { try { return give(id, { equip: true }); } catch (e) { warn(e); return false; } };
    d.godMode = (b = true) => { godSticky = state.rt.god = !!b; return state.rt.god; };
    d.kill = (kind = "all") => { try { return api.killAll(kind); } catch (e) { warn(e); return 0; } };
    d.defeat = (id) => { try { return bosses.defeat(id); } catch (e) { warn(e); return false; } };
    d.combat = api;
  }

  return api;
}
