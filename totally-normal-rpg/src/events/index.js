// EVENTS: every scripted sequence after the King, the Hollow and its fights, the choice state, endings, final boss.
// CONTRACT section 10. Entry: init(ctx) -> api.
import { Seq, isAbort } from "./sequencer.js";
import { FX } from "./fx.js";
import { Hollow, ShadowRat, LiquidSword, createGirl, createRibbon, createShadowHuman, tickShared } from "./monsters.js";
import { PHASES, phaseIdx, safe, safeP, clamp } from "./util.js";
import * as PostKing from "./postking.js";
import * as Chase from "./chase.js";
import * as Collapse from "./collapse.js";
import * as Throne from "./throne.js";
import * as HollowDesert from "./hollowDesert.js";
import * as Girl from "./girl.js";
import * as Hollow2 from "./hollow2.js";
import * as Sword from "./sword.js";
import * as Final from "./final.js";
import * as Endings from "./endings.js";
import { IdleWatcher } from "./idle.js";

export const SEQ_IDS = ["postKing", "desert", "forest", "forestHouse", "forestNight", "chase", "collapse", "throne",
  "ngReset", "ngShortcut", "hollowDesert", "girl", "hollow2", "liquidSword", "choice", "final", "rematch",
  "end_monster", "end_world", "end_warrior", "end_idiot", "end_winners", "end_sigma"];

const SEQS = {
  postKing: PostKing.postKing, desert: PostKing.desert, forest: PostKing.forest, forestHouse: PostKing.forestHouse,
  forestNight: PostKing.forestNight, ngReset: PostKing.ngReset, ngShortcut: PostKing.ngShortcut,
  chase: Chase.chase, collapse: Collapse.collapse, throne: Throne.throne,
  hollowDesert: HollowDesert.hollowDesert, girl: Girl.girl, hollow2: Hollow2.hollow2,
  liquidSword: Sword.liquidSword, choice: Sword.choice,
  final: Final.final, rematch: Final.rematch,
  end_monster: Endings.monster, end_world: Endings.world, end_warrior: Endings.warrior,
  end_idiot: Endings.idiot, end_winners: Endings.winners, end_sigma: Endings.sigma,
};

// fallback coordinates (DESIGN 6) when WORLD cannot answer
const DEFAULT_POINTS = {
  spawn: [0, 0, 10], lobbyBack: [0, 0, -12], voidLeap: [-37, 0, -4], graveShovel: [32, 0, -2],
  grave0: [25, 0, -8], grave1: [27, 0, -8], grave2: [29, 0, -8], grave3: [31, 0, -8], grave4: [33, 0, -8], grave5: [35, 0, -8],
  throneDoor: [0, 20, 481], throneSeat: [0, 21, 506], courtyard: [0, 18, 425], kingPortal: [0, 18, 474],
  desertArrive: [0, 0, -1710], desertBackPortal: [0, 0, -1696], desertExitNg: [0, 0, -1850],
  forestArrive: [-1760, 0, 0], forestBackPortal: [-1746, 0, 0], forestHouseDoorOut: [-2156, 0, 0],
  forestHouseDoorFront: [-2153, 0, 0], forestHouseInside: [-2162, 0, 0],
  hollowArrive: [0, 0, -3990], girl: [0, 0, -4080], hollowFar: [0, 0, -4320], hollowArena: [0, 0, -4150],
  homePortal: [0, 0, -3985], finalArrive: [0, 0, 8050], finalBoss: [0, 0, 7930], villageSquare: [0, 0, 240],
};

class Events {
  constructor(ctx) {
    this.ctx = ctx; this.THREE = ctx.THREE; this.bus = ctx.bus; this.state = ctx.state;
    this.seq = null; this.active = null; this._token = null; this._runP = Promise.resolve();
    this.fight = null; this.pendingOutcome = null;
    this.atmoTags = new Set(); this.musicTags = new Set();
    this.timers = []; this.persist = []; // persistent interactables (removed on run reset)
    this.rollTarget = 0; this.rollCur = 0; this.rollApplied = 0; this.rollRate = 3;
    this.chairRock = false; this.chairT = 0;
    this.target = null; // live objective target for STORY (contract addition)
    this._dir = { x: 0, y: 0, z: 1 };
    this._hurtOpts = { rec: 1, source: "hollow", dir: this._dir, knock: 0 };
    this.models = {}; this.modelList = []; this.readyResolvers = [];
    this.createHumanoid = null;
  }
  // ---------------- accessors ----------------
  get scene() { return this.ctx.scene || (this.ctx.engine && this.ctx.engine.scene); }
  get camera() { return this.ctx.camera || (this.ctx.engine && this.ctx.engine.camera); }
  get renderer() { return this.ctx.renderer || (this.ctx.engine && this.ctx.engine.renderer); }
  get engine() { return this.ctx.engine; }
  get world() { return this.ctx.world; }
  get combat() { return this.ctx.combat; }
  get story() { return this.ctx.story; }
  get ui() { return this.ctx.ui; }
  get audio() { return this.ctx.audio; }
  player() { return this.ctx.engine && this.ctx.engine.player; }
  quality() { const q = this.ctx.engine && this.ctx.engine.quality; return q ? q.level : 2; }
  reduceFlashing() { return !!(this.state.settings && this.state.settings.reduceFlashing); }
  emit(name, p) { try { this.bus.emit(name, p); } catch (e) { console.warn("[events] emit", name, e); } }
  phase() { return this.state.run.phase; }
  cycle() { return this.state.run.cycle | 0; }
  flag(k, v) { const f = this.state.run.flags || (this.state.run.flags = {}); if (v === undefined) return f["events." + k]; f["events." + k] = v; return v; }
  setPhase(p) {
    if (this.state.run.phase === p) return;
    if (this.story && typeof this.story.setPhase === "function") safe(this.story, "setPhase", p);
    else this.state.run.phase = p;
  }
  point(name, out) {
    let p = null;
    try { if (this.world && typeof this.world.point === "function") p = this.world.point(name); } catch (e) { p = null; }
    const o = out || { x: 0, y: 0, z: 0 };
    if (p && typeof p.x === "number") { o.x = p.x; o.y = p.y; o.z = p.z; return o; }
    const d = DEFAULT_POINTS[name] || [0, 0, 0]; o.x = d[0]; o.y = d[1]; o.z = d[2]; return o;
  }
  groundY(x, z, yTop = 1e4) {
    const e = this.engine;
    try { if (e && e.physics) { const g = e.physics.groundAt(x, z, yTop); if (g && g.y > -1e8) return g.y; } } catch (err) { /* */ }
    try { if (e && e.terrain) { const h = e.terrain.heightAt(x, z); if (h > -1e8) return h; } } catch (err) { /* */ }
    return 0;
  }
  sfx(id, pos, vol = 1) { const a = this.audio; if (!a) return null; return safe(a, "sfx", id, pos ? { pos: { x: pos.x, y: pos.y, z: pos.z }, vol } : { vol }); }
  toast(text, kind = "info", dur = 3) { safe(this.ui, "toast", text, { kind, dur }); }
  hurt(raw, rec, source, fromX, fromZ, knock = 0) {
    const pl = this.player(); const c = this.combat; if (!pl || !c) return 0;
    const dx = pl.position.x - fromX, dz = pl.position.z - fromZ; const d = Math.sqrt(dx * dx + dz * dz) || 1;
    this._dir.x = dx / d; this._dir.y = 0.2; this._dir.z = dz / d;
    const o = this._hurtOpts; o.rec = rec; o.source = source; o.knock = knock;
    if (this.hurtScale > 0 && this.hurtScale !== 1) raw *= this.hurtScale; // fight-local mercy (hollow2)
    try { return c.damagePlayer(raw, o) || 0; } catch (e) { console.warn("[events] damagePlayer", e); return 0; }
  }
  heal() { safe(this.combat, "healPlayer", 1e9); }
  teleport(p, yaw) { const pl = this.player(); if (pl) safe(pl, "teleport", { x: p.x, y: p.y, z: p.z }, yaw); }
  async goto(zone, pos, yaw, fade = true) {
    const w = this.world;
    if (w && typeof w.goto === "function") {
      try { await w.goto(zone, { pos: pos ? { x: pos.x, y: pos.y, z: pos.z } : undefined, yaw, fade }); return; }
      catch (e) { console.warn("[events] goto", zone, e); }
    }
    if (pos) this.teleport(pos, yaw);
  }
  zone() { return (this.state.world && this.state.world.zone) || (this.world && this.world.current) || ""; }
  portal(id) { try { return this.world ? this.world.portal(id) : null; } catch (e) { return null; } }
  after(sec, fn) { const t = { left: sec, fn }; this.timers.push(t); return () => { t.fn = null; }; }

  // ---- overrides with automatic cleanup ----
  pushAtmo(tag, preset, dur = 2) { this.atmoTags.add(tag); safe(this.engine, "pushAtmosphere", tag, preset, { dur }); }
  popAtmo(tag, dur = 2) { if (!this.atmoTags.has(tag)) return; this.atmoTags.delete(tag); safe(this.engine, "popAtmosphere", tag, { dur }); }
  pushMusic(tag, track, fade = 1.5) { this.musicTags.add(tag); safe(this.audio, "pushMusic", tag, track, { fade }); }
  popMusic(tag, fade = 2) { if (!this.musicTags.has(tag)) return; this.musicTags.delete(tag); safe(this.audio, "popMusic", tag, { fade }); }
  postfx(o) { const pf = this.engine && this.engine.postfx; if (pf) safe(pf, "set", o); }
  postfxReset() { const pf = this.engine && this.engine.postfx; if (pf) safe(pf, "reset"); }
  shake(a, d) { const c = this.engine && this.engine.camera3p; if (c) safe(c, "shake", this.reduceFlashing() ? a * 0.5 : a, d); }
  setDeath(fn) {
    const c = this.combat; if (!c || typeof c.setDeathHandler !== "function") { this._deathFn = fn; return; }
    this._deathFn = fn;
    try {
      c.setDeathHandler(fn ? (info) => { try { return fn(info || {}) !== false; } catch (e) { console.warn("[events] death", e); return true; } } : null);
    } catch (e) { console.warn("[events] setDeathHandler", e); }
  }
  cine(seq, on) {
    const st = this.state.rt, pl = this.player();
    st.cinematic = on;
    if (pl) { safe(pl, "setControl", !on); safe(pl, "setLook", !on); }
    safe(this.ui, "letterbox", on, 0.6);
    if (on && seq && !seq._cineDefer) {
      seq._cineDefer = true;
      seq.defer(() => { this.state.rt.cinematic = false; const p = this.player(); if (p) { safe(p, "setControl", true); safe(p, "setLook", true); } safe(this.ui, "letterbox", false, 0.6); });
    }
  }
  takeCam(seq) {
    const c = this.engine && this.engine.camera3p; if (!c || typeof c.take !== "function") return null;
    let ctl = null; try { ctl = c.take("events"); } catch (e) { return null; }
    if (seq && ctl) seq.defer(() => { try { ctl.firstPerson && ctl.firstPerson(false); ctl.roll && ctl.roll(0, 0.01); ctl.release(0.6); } catch (e) { /* */ } });
    return ctl;
  }
  interact(o) {
    const w = this.world; if (!w || typeof w.addInteractable !== "function") return () => {};
    try { return w.addInteractable(o) || (() => {}); } catch (e) { console.warn("[events] interactable", e); return () => {}; }
  }
  jumpscare(kind) {
    safe(this.audio, "sfx", "jumpscare", { vol: 1 });
    safe(this.audio, "sfx", "hollow_shriek", { vol: 0.9 });
    this.shake(this.reduceFlashing() ? 0.15 : 0.6, 0.6);
    if (this.reduceFlashing()) { const c = this.engine && this.engine.camera3p; if (c) { safe(c, "setFov", 52, 0.3); this.after(0.7, () => safe(c, "setFov", 70, 0.8)); } }
    return safeP(this.ui, "jumpscare", kind, { dur: 0.9 });
  }
  flashbang() {
    const rf = this.reduceFlashing();
    const pf = this.engine && this.engine.postfx; if (pf) safe(pf, "flash", { color: "#ffffff", peak: 1, dur: 1.5 });
    safe(this.audio, "sfx", "tinnitus", { vol: rf ? 0.45 : 0.9 });
    safe(this.audio, "muffle", true, 0.1);
    this.after(3, () => safe(this.audio, "muffle", false, 1.2));
  }
  /** soft 'ready' signal for debug triggers */
  ready() { const r = this.readyResolvers; this.readyResolvers = []; for (const f of r) f(true); }

  // ---------------- models (lazy) ----------------
  model(name) {
    if (this.models[name]) return this.models[name];
    const T = this.THREE, E = this.engine; let m = null;
    switch (name) {
      case "creature": m = new Hollow(T, E, { height: 2.9, eyes: "white" }); break;
      case "armored": m = new Hollow(T, E, { height: 7.5, eyes: "red", armored: true }); break;
      case "giant": m = new Hollow(T, E, { height: 60, eyes: "red", giant: true }); break;
      case "clone0": case "clone1": m = new Hollow(T, E, { height: 5.5, eyes: "red", shadows: false }); break;
      case "sword": m = new LiquidSword(T); break;
      case "girl": m = createGirl(T, E, this.createHumanoid); break;
      case "ribbon": m = createRibbon(T, E, this.model("girl").ribbonMat); break;
    }
    if (m) { this.scene.add(m.root || m); if (typeof m.update === "function") this.modelList.push(m); }
    this.models[name] = m; return m;
  }
  rats() {
    if (!this._rats) { this._rats = []; for (let i = 0; i < 8; i++) { const r = new ShadowRat(this.THREE, this.engine); r.id = "shadowRat" + i; this.scene.add(r.root); this._rats.push(r); } }
    return this._rats;
  }
  shadows() {
    if (!this._shadows) {
      this._shadows = [];
      for (let i = 0; i < 4; i++) { const s = createShadowHuman(this.THREE, this.engine, this.createHumanoid, i < 2 ? "villager" : "royal"); s.id = "shadowMan" + i; this.scene.add(s.root); s.alive = false; s.pos = s.root.position; s.cd = 0; s.hp = 0; this._shadows.push(s); }
    }
    return this._shadows;
  }
  hideMonsters() {
    for (const k in this.models) { const m = this.models[k]; if (m && m.root) m.root.visible = false; if (m && m.mode !== undefined) { m.mode = "idle"; m.act = null; m.speed = 0; m.ceiling = 0; m.melt = 0; m.setHeight && m.setHeight(m.opts.height || m.H); } }
    this.killMinions();
  }
  // ---------------- minions (shadow rats / shadow humans) ----------------
  spawnRat(x, y, z, rec, dmg = 10) {
    const rats = this.rats(); let r = null; for (const c of rats) if (!c.alive) { r = c; break; }
    if (!r) return null;
    r.alive = true; r.hp = 70; r.rec = rec; r.dmg = dmg; r.cd = 1; r.root.visible = true; r.pos.set(x, y, z);
    const self = this;
    try {
      r.removeHit = this.combat && this.combat.addHittable ? this.combat.addHittable({ id: r.id, kind: "shadowRat", pos: r.pos,
        radius: 0.45, height: 0.5, rec, team: "enemy", isAlive: () => r.alive,
        onHit(h) { r.hp -= h.dmg; self.sfx("rat_squeak", r.pos, 0.6); if (r.hp <= 0) self.killRat(r); } }) : null;
    } catch (e) { r.removeHit = null; }
    this.fx && this.fx.burst(x, y + 0.2, z, 12, 3, 0.05, 0.04, 0.06, 0.8, 0.3, 2, 1);
    return r;
  }
  killRat(r) {
    if (!r.alive) return; r.alive = false; r.root.visible = false;
    if (r.removeHit) { try { r.removeHit(); } catch (e) { /* */ } r.removeHit = null; }
    this.fx && this.fx.burst(r.pos.x, r.pos.y + 0.2, r.pos.z, 14, 3, 0.05, 0.04, 0.06, 0.9, 0.3, -1, 1);
    this.sfx("rat_death", r.pos, 0.7);
  }
  spawnShadow(x, y, z, rec, dmg = 22) {
    const list = this.shadows(); let s = null; for (const c of list) if (!c.alive) { s = c; break; }
    if (!s) return null;
    s.alive = true; s.hp = 160; s.rec = rec; s.dmg = dmg; s.cd = 1.2; s.root.visible = true; s.pos.set(x, y, z);
    const self = this;
    try {
      s.removeHit = this.combat && this.combat.addHittable ? this.combat.addHittable({ id: s.id, kind: "shadowRat", pos: s.pos,
        radius: 0.5, height: 1.9, rec, team: "enemy", isAlive: () => s.alive,
        onHit(h) { s.hp -= h.dmg; self.sfx("grunt", s.pos, 0.5); if (s.hp <= 0) self.killShadow(s); } }) : null;
    } catch (e) { s.removeHit = null; }
    this.fx && this.fx.burst(x, y + 1, z, 18, 3, 0.05, 0.04, 0.06, 1, 0.4, 1, 1);
    return s;
  }
  killShadow(s) {
    if (!s.alive) return; s.alive = false; s.root.visible = false;
    if (s.removeHit) { try { s.removeHit(); } catch (e) { /* */ } s.removeHit = null; }
    this.fx && this.fx.burst(s.pos.x, s.pos.y + 1, s.pos.z, 24, 3, 0.05, 0.04, 0.06, 1.1, 0.4, -1.5, 1);
  }
  killMinions() { if (this._rats) for (const r of this._rats) this.killRat(r); if (this._shadows) for (const s of this._shadows) this.killShadow(s); }
  minionCount() { let n = 0; if (this._rats) for (const r of this._rats) if (r.alive) n++; if (this._shadows) for (const s of this._shadows) if (s.alive) n++; return n; }
  updateMinions(dt, floorY) {
    const pl = this.player(); if (!pl) return; const pp = pl.position;
    if (this._rats) for (const r of this._rats) {
      if (!r.alive) continue;
      const dx = pp.x - r.pos.x, dz = pp.z - r.pos.z; const d = Math.sqrt(dx * dx + dz * dz) || 1;
      const sp = d > 1.1 ? 6.5 : 0; r.pos.x += dx / d * sp * dt; r.pos.z += dz / d * sp * dt;
      r.pos.y = floorY !== undefined ? floorY : this.groundY(r.pos.x, r.pos.z, r.pos.y + 2);
      r.root.rotation.y = Math.atan2(dx, dz); r.update(dt, sp);
      r.cd -= dt; if (d < 1.3 && r.cd <= 0) { r.cd = 1.1; this.hurt(r.dmg, r.rec, "shadowRat", r.pos.x, r.pos.z, 1); this.sfx("rat_bite", r.pos, 0.7); }
    }
    if (this._shadows) for (const s of this._shadows) {
      if (!s.alive) continue;
      const dx = pp.x - s.pos.x, dz = pp.z - s.pos.z; const d = Math.sqrt(dx * dx + dz * dz) || 1;
      const sp = d > 1.8 ? 4.6 : 0; s.pos.x += dx / d * sp * dt; s.pos.z += dz / d * sp * dt;
      s.pos.y = floorY !== undefined ? floorY : this.groundY(s.pos.x, s.pos.z, s.pos.y + 2);
      s.root.rotation.y = Math.atan2(dx, dz);
      if (s.h) { try { s.h.update(dt, sp, false); } catch (e) { /* */ } }
      s.cd -= dt;
      if (d < 2.3 && s.cd <= 0) { s.cd = 1.6; if (s.h) safe(s.h, "play", "slash"); this.hurt(s.dmg, s.rec, "shadow", s.pos.x, s.pos.z, 3); this.sfx("whoosh_sword", s.pos, 0.6); }
    }
  }

  // ---------------- sequence runner ----------------
  async trigger(id, opts) {
    if (!SEQS[id]) { console.warn("[events] unknown sequence", id); return; }
    await this.stop();
    const token = {}; this._token = token;
    const p = this._run(id, opts || {}, token);
    this._runP = p.catch(() => {});
    return p;
  }
  async _run(id, opts, token) {
    let cur = id, o = opts;
    while (cur && this._token === token) {
      const fn = SEQS[cur]; if (!fn) { console.warn("[events] unknown next", cur); break; }
      const seq = new Seq(this, cur); this.seq = seq; this.active = cur;
      this.emit("seq:start", { id: cur });
      let next = null;
      try { next = await fn(this, seq, o || {}); }
      catch (e) { if (!isAbort(e)) console.warn("[events] sequence", cur, e); next = null; }
      finally {
        seq.runDefers();
        if (this.seq === seq) { this.seq = null; this.active = null; }
        this.emit("seq:end", { id: cur });
        this.ready();
      }
      if (seq.aborted || this._token !== token) break;
      if (next && typeof next === "object") { cur = next.id; o = next.opts || {}; } else { cur = next || null; o = {}; }
    }
  }
  stop() {
    this._token = null;
    if (this.seq) this.seq.abort();
    return this._runP;
  }
  skipTimers() { if (this.seq) this.seq.skip(); if (this.fight && this.fight.skip) safe(this.fight, "skip"); }
  forceOutcome(o) {
    const f = this.fight;
    if (f && f.core && f.core.started && !f.core.done) { if (o === "win") safe(f, "forceWin"); else safe(f, "forceLose"); return true; }
    if (o === "win" && (this.active === "chase" || this.active === "collapse" || this.active === "forestNight")) { this.trigger("throne"); return true; }
    this.pendingOutcome = o; return true;
  }
  debugTrigger(id) {
    return new Promise((resolve) => {
      let done = false; const fin = (v) => { if (!done) { done = true; resolve(v); } };
      this.readyResolvers.push(fin);
      setTimeout(() => fin(true), 3500);
      this.trigger(id).catch(() => {}).then(() => fin(true));
    });
  }

  // ---------------- hooks ----------------
  onKingKilled() {
    const run = this.state.run, ph = phaseIdx(run.phase);
    if (this.cycle() === 0) {
      if (!this.flag("sealBroken") && ph < phaseIdx("postKing")) this.trigger("postKing");
    } else if (!this.flag("ngOpen") && ph < phaseIdx("ngPostKing")) this.trigger("ngShortcut");
  }
  onZone(id) {
    const ph = this.phase(), c = this.cycle();
    // the darkened sky over the main valley after the seal broke (cycle 0)
    const region = this.zoneRegion(id);
    if (c === 0 && this.flag("sealBroken") && region === "main" && phaseIdx(ph) >= phaseIdx("postKing") && phaseIdx(ph) <= phaseIdx("desert")) {
      if (!this.atmoTags.has("ev.seal")) this.pushAtmo("ev.seal", "golden", 4);
    } else this.popAtmo("ev.seal", 1);
    this.chairRock = c === 0 && this.flag("sealBroken") && id === "lobby" && phaseIdx(ph) <= phaseIdx("collapse");
    if (c === 0 && id === "desert" && (ph === "postKing" || ph === "desert") && this.active !== "desert" && !this.isChaseActive()) this.trigger("desert");
    if (c === 0 && id === "forest" && (ph === "postKing" || ph === "desert" || ph === "forest") && this.active !== "forest" && !this.isChaseActive()) this.trigger("forest");
  }
  isChaseActive() { return this.active === "chase" || this.active === "forestNight" || this.active === "collapse"; }
  zoneRegion(id) { try { const z = this.world && this.world.zones && this.world.zones[id]; return z ? z.region : ""; } catch (e) { return ""; } }
  applyRunState() {
    const run = this.state.run, c = this.cycle(), ph = phaseIdx(run.phase);
    if (c === 0 && ph >= phaseIdx("postKing") && ph <= phaseIdx("throne")) PostKing.applySeal(this);
    if (c >= 1 && ph >= phaseIdx("ngPostKing") && ph <= phaseIdx("girl")) PostKing.applyNgOpen(this);
  }
  onGameStart(p) {
    this.applyRunState();
    const ph = this.phase();
    if (p && !p.newGame) {
      if (ph === "throne") this.trigger("throne", { resume: true });
      else if (ph === "choice") this.enterChoice();
    }
    this.onZone(this.zone());
  }
  enterChoice() { this.trigger("choice", { enter: true }); }
  startFinal(opts) { return this.trigger(opts && opts.rematch ? "rematch" : "final", opts || {}); }
  playEnding(id) {
    const key = "end_" + id;
    if (!SEQS[key]) return Promise.resolve();
    return this.trigger(key);
  }
  resetRun() {
    this.stop();
    if (this.fight) { safe(this.fight, "dispose"); this.fight = null; }
    this.pendingOutcome = null;
    this.hideMonsters(); if (this.fx) this.fx.clearAll();
    for (const rm of this.persist) { try { rm(); } catch (e) { /* */ } } this.persist.length = 0;
    PostKing.restorePortals(this);
    for (const t of Array.from(this.atmoTags)) this.popAtmo(t, 0.5);
    for (const t of Array.from(this.musicTags)) this.popMusic(t, 0.5);
    this.postfxReset(); this.setDeath(null);
    if (this.state.player) this.state.player.lives = 0; safe(this.ui, "lives", 0);
    this.state.rt.idleLock = false; this.state.rt.cinematic = false;
    this.rollTarget = 0; this.chairRock = false; this.target = null;
    const pl = this.player(); if (pl) { pl.gravityMul = 1; pl.speedMul = 1; pl.jumpMul = 1; safe(pl, "setControl", true); safe(pl, "setLook", true); }
    try { this.engine && this.engine.physics && this.engine.physics.clearTag("ev.tmp"); } catch (e) { /* */ }
    Collapse.deactivate(this);
    Hollow2.ringHide(this);
    Sword.hideSword(this);
    if (this.idle) this.idle.reset();
    this.timers.length = 0;
  }

  // ---------------- per-frame ----------------
  update(dt) {
    const rt = this.state.rt;
    // camera roll easing (applied after the camera system, undone before it next frame)
    this.rollCur += (this.rollTarget - this.rollCur) * Math.min(1, dt * this.rollRate);
    if (!rt.playing) return;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i]; t.left -= dt;
      if (t.left <= 0) { this.timers[i] = this.timers[this.timers.length - 1]; this.timers.pop(); if (t.fn) { try { t.fn(); } catch (e) { console.warn("[events] timer", e); } } }
    }
    if (this.seq) this.seq.tick(dt);
    if (this.fight) { try { this.fight.update(dt); } catch (e) { console.warn("[events] fight", e); } }
    let hit = 0;
    const ml = this.modelList;
    for (let i = 0; i < ml.length; i++) { const m = ml[i]; if (m.root.visible) { m.update(dt); if (m.hit > hit) hit = m.hit; } }
    tickShared(dt, hit);
    if (this.fx) this.fx.update(dt);
    Collapse.update(this, dt);
    Hollow2.ringUpdate(this, dt);
    if (this.idle) this.idle.update(dt);
    if (this.chairRock) {
      this.chairT += dt;
      const ch = this.world && safe(this.world, "prop", "lobbyRockingChair");
      if (ch) ch.rotation.x = Math.sin(this.chairT * 1.9) * 0.16;
    }
  }
  applyRoll() {
    const cam = this.camera; if (!cam) return;
    if (Math.abs(this.rollCur) > 0.0005) { cam.rotateZ(this.rollCur); this.rollApplied = this.rollCur; }
  }
  undoRoll() {
    const cam = this.camera; if (!cam) return;
    if (this.rollApplied) { cam.rotateZ(-this.rollApplied); this.rollApplied = 0; }
  }

  // ---------------- init ----------------
  async init() {
    const ctx = this.ctx, bus = this.bus;
    try { const mod = await import("../engine/humanoid.js"); this.createHumanoid = mod.createHumanoid || null; } catch (e) { this.createHumanoid = null; }
    if (this.scene) this.fx = new FX(this);
    this.idle = new IdleWatcher(this);
    bus.on("enemy:killed", (p) => { if (p && p.kind === "king") this.onKingKilled(); });
    bus.on("zone:enter", (p) => { if (p) this.onZone(p.id, p.prev); });
    bus.on("run:reset", () => this.resetRun());
    bus.on("game:start", (p) => this.onGameStart(p));
    bus.on("input:activity", () => { if (this.idle) this.idle.activity(); });
    const e = this.engine;
    if (e && typeof e.addSystem === "function") {
      e.addSystem("events", (dt) => { try { this.update(dt); } catch (err) { console.warn("[events]", err); } }, 10);
      e.addSystem("events-roll-undo", () => { try { this.undoRoll(); } catch (err) { /* */ } }, 1);
      e.addSystem("events-roll", () => { try { this.applyRoll(); } catch (err) { /* */ } }, 65);
    }
    const self = this;
    this.api = {
      trigger: (id, o) => self.trigger(id, o),
      get active() { return self.active; },
      stop: () => { self.stop(); },
      playEnding: (id) => self.playEnding(id),
      enterChoice: () => self.enterChoice(),
      startFinal: (o) => self.startFinal(o),
      skipTimers: () => self.skipTimers(),
      resetRun: () => self.resetRun(),
      get target() { return self.target; },     // contract addition: live objective target (Vector3|null)
      get fight() { return self.fight ? self.fight.core && self.fight.core.id : null; },
      sequences: SEQ_IDS.slice(),
    };
    if (typeof window !== "undefined") {
      const D = window.__tnrpg || (window.__tnrpg = {});
      const wrap = (f) => (...a) => { try { return f(...a); } catch (err) { console.warn("[events] debug", err); return false; } };
      D.trigger = wrap((id) => self.debugTrigger(id));
      D.skipTimers = wrap(() => { self.skipTimers(); return true; });
      D.winBoss = wrap(() => self.forceOutcome("win"));
      D.loseBoss = wrap(() => self.forceOutcome("lose"));
      D.idle = wrap(() => { self.idle.pretend(); return true; });
      D.collapseCheckpoint = wrap((n) => Collapse.debugCheckpoint(self, n | 0));
      D.events = self;
    }
    return this.api;
  }
}

export async function init(ctx) {
  const ev = new Events(ctx);
  return ev.init();
}
export { PHASES };
