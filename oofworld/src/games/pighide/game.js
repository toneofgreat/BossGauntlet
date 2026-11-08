// src/games/pighide/game.js - PIG HIDE (spec 27). The integrator (M16-T07): it wires the
// modules together in the fixed per-tick order of §2.7 and owns teardown (§15.4).
//
//   config.js   pure data + save helpers          city.js   world data + animated dressing
//   round.js    phases, the wire, scoring          rigs.js   rig pairing, looks, tags, x-ray
//   pigs.js     pig models + every pig ability     hunters.js hunter models + weapons
//   fx.js       local visual effects               hud.js    #pighide-ui
//   shops.js    the five lobby kiosks
//
// Nothing here invents a player (ARCHITECTURE §9): rounds need two or more real people, and
// solo/offline the lobby, the city, the shops and PRACTICE stay fully playable.
//
// House rules: sim time only, no banned timer identifiers. init() never teleports (the
// smoke spawn check). Every subscription goes into ONE bag released in dispose.

import * as C from "./scripts/config.js";
import * as city from "./scripts/city.js";
import { createRigs } from "./scripts/rigs.js";
import { createRound } from "./scripts/round.js";
import { createPigs } from "./scripts/pigs.js";
import { createHunters } from "./scripts/hunters.js";
import { createFx } from "./scripts/fx.js";
import { createHud } from "./scripts/hud.js";
import { createShops } from "./scripts/shops.js";

export const meta = {
  slug: "pighide",
  name: "PIG HIDE",
  icon: "🐷",
  description: "Pigs hide all over the city, one hunter seeks. Survive five minutes or catch every pig, then upgrade your pig or your hunter.",
  version: "1.0.0",
};

const { TUNE } = C;
const SAVE_CHECK_S = 1;
const EMIT_S = 1;
const KIOSK_LEAVE_PAD = 4;

let G = null;

function safe(fn, fallback) {
  try { return fn(); } catch (err) { console.error("[oof] pighide", err); return fallback; }
}

// ---- saves ------------------------------------------------------------------------------

function writeSave(force) {
  if (!G) return;
  let json;
  try { json = JSON.stringify(G.S.save); } catch { return; }
  if (!force && json === G.lastSaveJson) return;
  try {
    G.ctx.services.saves.save(G.S.save);
    G.lastSaveJson = json;
  } catch (err) {
    console.warn("[oof] pighide save failed", err);
    if (!G.saveWarned) {
      G.saveWarned = true;
      try { G.ctx.services.ui.toast("Couldn't save", { icon: "⚠️" }); } catch { /* fine */ }
    }
  }
}

// ---- which kit the HUD shows --------------------------------------------------------------

function hunterSide(S) {
  return S.role === "hunter" || (S.phase === "lobby" && S.role == null && S.practice === "hunter");
}

function currentButtons() {
  const S = G.S;
  return hunterSide(S) ? safe(() => G.hunters.buttons(), []) : safe(() => G.pigs.buttons(), []);
}

function useAbility(id) {
  if (!G || typeof id !== "string") return false;
  if (id === "attack") return !!safe(() => G.hunters.attack(), false);
  const a = C.ability(id);
  if (a && a.side === "hunter") return !!safe(() => G.hunters.use(id), false);
  return !!safe(() => G.pigs.use(id), false);
}

function slotAction(slot) {
  if (!G) return;
  const S = G.S;
  if (S.phase === "lobby" && slot === "E" && G.nearKiosk && !G.shops.isOpen()) {
    G.shops.open(G.nearKiosk.id);
    return;
  }
  const b = G.buttons.find((x) => x && x.key === slot && x.id !== "attack");
  if (b) useAbility(b.id);
}

// ---- debug snapshot (§15.2) ----------------------------------------------------------------

function snapshot() {
  const S = G.S;
  const cd = {};
  const active = {};
  for (const [k, v] of Object.entries(S.pig.cd)) if (v > 0) cd[k] = Math.round(v * 100) / 100;
  for (const [k, v] of Object.entries(S.hunter.cd)) if (v > 0) cd["h:" + k] = Math.round(v * 100) / 100;
  for (const [k, v] of Object.entries(S.pig.act)) if (v > 0) active[k] = Math.round(v * 100) / 100;
  if (S.hunter.detectOn > 0) active.detect = Math.round(S.hunter.detectOn * 100) / 100;
  const sv = S.save;
  let walk = null, jump = null;
  try { walk = G.ctx.player.getWalkSpeed(); jump = G.ctx.player.getJumpPower(); } catch { /* fine */ }
  return {
    phase: S.phase, clock: Math.round(S.clock * 100) / 100, rn: S.rn, selfId: S.selfId,
    conductor: S.conductorId, role: S.role, rank: S.rank, hp: S.hp, hpMax: S.hpMax,
    caught: S.caught, spectating: S.spectating, canStart: S.canStart, startHint: S.startHint,
    participants: S.participants, players: S.participants, fresh: S.fresh.slice(),
    pigsLeft: S.pigsLeft, pigsTotal: S.pigsTotal,
    roster: S.roster ? { hu: S.roster.hu, ps: S.roster.ps.slice() } : null,
    scored: !!(S.result && S.result.scored), reason: S.result ? S.result.reason : null,
    iWon: !!(S.result && S.result.iWon),
    pigWins: sv.pigWins, hunterWins: sv.hunterWins, pigTier: sv.pigTier, hunterTier: sv.hunterTier,
    pigClass: sv.pigClass, hunterClass: sv.hunterClass, pigSkin: sv.pigSkin, hunterSkin: sv.hunterSkin,
    practice: S.practice, radarEquipped: !!sv.radarEquipped,
    pig: { classId: S.pig.classId, skinId: S.pig.skinId, iv: S.pig.iv, bl: S.pig.bl, pl: S.pig.pl, th: S.pig.th, used: { ...S.pig.used } },
    hunter: { classId: S.hunter.classId, skinId: S.hunter.skinId, fl: S.hunter.fl },
    cd, active,
    cloneLive: !!(S.pig.cn && S.pig.cn.a === 1),
    bombsLive: S.hunter.bm.length,
    xrayLive: safe(() => G.rigs.xrayLive(), 0),
    blind: Math.round(S.blind * 100) / 100,
    runtimeParts: safe(() => G.ctx.engine.parts.count(), 0),
    looks: safe(() => G.rigs.lookCount(), 0),
    paired: safe(() => G.rigs.pairedCount(), 0),
    fxLive: safe(() => G.fx.liveCount(), 0),
    walk, jump,
    shopOpen: G.shops.isOpen() ? G.shops.openId() : null,
    nearKiosk: G.nearKiosk ? G.nearKiosk.id : null,
    hitsSent: G.hitsSent, lastOutHits: G.lastOutHits,
    lastBlob: safe(() => JSON.parse(JSON.stringify(G.round.lastBlob() || null)), null),
  };
}

// =====================================================================================
// init
// =====================================================================================

export function init(ctx) {
  let raw = null;
  try { raw = ctx.services.saves.load(); } catch { raw = null; }
  const save = C.migrateSave(raw);
  const S = C.newShared(save);

  G = {
    ctx, S, bag: [], buttons: [], nearKiosk: null, hitsSent: 0, lastOutHits: [],
    saveT: 0, emitT: 0, lastPhase: S.phase, lastSaveJson: null, saveWarned: false,
    city: null, fx: null, rigs: null, pigs: null, hunters: null, round: null, shops: null, hud: null,
  };
  try { G.lastSaveJson = JSON.stringify(save); } catch { /* fine */ }

  G.city = city.createCity(ctx);
  G.fx = createFx(ctx);
  G.rigs = createRigs(ctx, S);
  G.pigs = createPigs(ctx, S, G.rigs, G.fx);
  G.hunters = createHunters(ctx, S, G.rigs, G.fx);

  const hooks = {
    onRoleStart(role, rank) {
      if (!G) return;
      G.shops.close();
      // pigs.onRoleStart also clears any lobby-practice effect, so the hunter gets it too
      G.pigs.onRoleStart(rank);
      G.hunters.onRoleStart(role, rank);
      writeSave(false);
    },
    onSeek() { if (G) { G.pigs.onSeek(); G.hunters.onSeek(); } },
    onCaught(byId) { if (G) G.pigs.onCaught(byId); },
    onCloneHit(byId) { if (G) G.pigs.onCloneHit(byId); },
    onRoundEnd(result) {
      if (!G) return;
      G.pigs.onRoundEnd(result);
      G.hunters.onRoundEnd(result);
      writeSave(false);
    },
    onLobby() {
      if (!G) return;
      G.pigs.onLobby();
      G.hunters.onLobby();
      writeSave(false);
    },
    onThump(peerId) { if (G) G.pigs.onThump(peerId); },
    onFlash() {
      if (!G) return;
      try { ctx.engine.audio.playSfx("warp", { volume: 0.9, pitch: 1.8 }); } catch { /* optional */ }
    },
    onRemoteFx(peerId, kind, data) { if (G) G.hunters.onRemoteFx(peerId, kind, data); },
  };
  G.round = createRound(ctx, S, hooks);

  G.shops = createShops(ctx, S, {
    pig: (cl, sk) => G.pigs.buildPigModel(cl, sk),
    hunter: (cl, sk) => G.hunters.buildHunterModel(cl, sk),
    onChange: () => writeSave(true),
  });

  G.hud = createHud(ctx, S, {
    start: () => (G ? G.round.requestStart() : false),
    attack: () => (G ? !!safe(() => G.hunters.attack(), false) : false),
    use: (id) => useAbility(id),
    toggleSpectate: () => (G ? G.round.toggleSpectate() : false),
    togglePractice: (side) => {
      if (!G) return;
      S.save.practice = side === "hunter" ? "hunter" : "pig";
      writeSave(true);
    },
    openKiosk: (id) => { if (G && S.phase === "lobby") G.shops.open(id); },
  });

  const input = ctx.engine.input;
  if (input && typeof input.onAction === "function") {
    G.bag.push(input.onAction("action1", () => slotAction("E")));
    G.bag.push(input.onAction("action2", () => slotAction("Q")));
  }

  ctx.services.ui.setHudTitle("🐷 PIG HIDE");
}

// =====================================================================================
// update (§2.7 order)
// =====================================================================================

export function update(dt, ctx) {
  if (!G) return;
  const S = G.S;
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;

  // hits the hunter queued since the last tick ride this tick's publish (smoke reads these)
  if (S.outHits.length) {
    G.hitsSent += S.outHits.length;
    G.lastOutHits = S.outHits.map((x) => ({ ...x }));
  }
  safe(() => G.round.update(step));
  safe(() => G.rigs.update(step));
  safe(() => G.pigs.update(step));
  safe(() => G.hunters.update(step));
  safe(() => G.fx.update(step));
  safe(() => G.city.update(step, S));

  // kiosks: only in the lobby; walking away closes the panel
  let near = null;
  if (S.phase === "lobby") {
    const p = safe(() => ctx.player.position(), null);
    near = p ? G.shops.nearest(p) : null;
    if (G.shops.isOpen() && p) {
      const k = city.KIOSKS.find((x) => x.id === G.shops.openId());
      if (k && Math.hypot(p[0] - k.pos[0], p[2] - k.pos[2]) > k.radius + KIOSK_LEAVE_PAD) G.shops.close();
    }
  } else if (G.shops.isOpen()) {
    G.shops.close();
  }
  G.nearKiosk = near;

  // Whether the avatar stands in the lobby itself (the HUD shows its full card only there).
  let inLobby = true;
  const lp = safe(() => ctx.player.position(), null);
  const L = city.LOBBY;
  if (lp && L && L.center && L.half) {
    inLobby = Math.abs(lp[0] - L.center[0]) <= L.half[0] && Math.abs(lp[2] - L.center[2]) <= L.half[1];
  }

  G.buttons = currentButtons() || [];
  safe(() => G.hud.update(step, { buttons: G.buttons, nearKiosk: near, shopOpen: G.shops.isOpen(), inLobby }));
  safe(() => G.round.publish());

  // persist anything round.js / shops changed (wins, unlocks, equips) at most once a second
  G.saveT -= step;
  if (G.saveT <= 0) {
    G.saveT = SAVE_CHECK_S;
    writeSave(false);
  }

  G.emitT -= step;
  if (G.emitT <= 0 || S.phase !== G.lastPhase) {
    G.emitT = EMIT_S;
    G.lastPhase = S.phase;
    const snap = safe(() => snapshot(), null);
    if (snap) safe(() => ctx.events.emit("ph:state", snap));
  }
}

// =====================================================================================
// dispose (§15.4)
// =====================================================================================

export function dispose(ctx) {
  if (!G) return;
  const g = G;
  for (const off of g.bag.splice(0)) { try { if (typeof off === "function") off(); } catch { /* fine */ } }
  safe(() => g.hud.dispose());
  safe(() => g.shops.dispose());
  safe(() => g.round.dispose());
  safe(() => g.hunters.dispose());
  safe(() => g.pigs.dispose());
  safe(() => g.rigs.dispose());
  safe(() => g.fx.dispose());
  safe(() => g.city.dispose());
  const c = ctx || g.ctx;
  try {
    const net = c.services.net;
    if (net && typeof net.clearPeerHidden === "function") net.clearPeerHidden();
  } catch { /* fine */ }
  safe(() => c.player.setWalkSpeed(TUNE.WALK_DEFAULT));
  safe(() => c.player.setJumpPower(TUNE.JUMP_DEFAULT));
  safe(() => c.engine.physics.setGravity(TUNE.GRAVITY_DEFAULT));
  safe(() => c.engine.camera.reset());
  writeSave(true);
  G = null;
}

// =====================================================================================
// Test seams (§15.2): clocks only
// =====================================================================================

export function debugState() {
  if (!G) return null;
  return safe(() => snapshot(), null);
}

export function debugAdvance(seconds) {
  if (!G) return;
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return;
  const S = G.S;
  G.round.debugAdvance(n);
  for (const bag of [S.pig.cd, S.pig.act, S.hunter.cd]) {
    for (const k of Object.keys(bag)) if (bag[k] > 0) bag[k] = Math.max(0, bag[k] - n);
  }
  S.pig.radarOn = Math.max(0, S.pig.radarOn - n);
  S.hunter.detectOn = Math.max(0, S.hunter.detectOn - n);
}

export function debugSkipTo(phase) {
  if (!G) return;
  G.round.debugSkipTo(phase);
}
