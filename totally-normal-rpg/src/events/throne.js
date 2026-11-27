// The throne boss: Hollow I (DESIGN 8.6). 4 phases, phase checkpoints, fake victory, the scurry, -> ngReset.
import { safe, clamp, yawTo, dampAngle, wrapAngle } from "./util.js";
import { BossCore, playerInCone, playerDist, grounded } from "./boss.js";

const CEIL = 11;           // ceiling height above the floor
const HALL = { x0: -11.5, x1: 11.5, z0: 482, z1: 509 };

// tiny DOM overlay for the frozen "VICTO-" (owned by EVENTS; UI's banner cannot freeze mid-word)
let vicEl = null;
function victoryEl() {
  if (typeof document === "undefined") return null;
  if (vicEl) return vicEl;
  vicEl = document.createElement("div");
  vicEl.setAttribute("aria-hidden", "true");
  vicEl.style.cssText = "position:fixed;left:0;right:0;top:34%;text-align:center;pointer-events:none;z-index:60;" +
    "font-family:'Cormorant Garamond',Georgia,serif;font-weight:300;letter-spacing:0.3em;color:#f0e6c8;" +
    "font-size:clamp(28px,9vw,64px);text-shadow:0 0 18px rgba(255,220,150,0.45);opacity:0;transition:opacity .3s;padding:0 16px;box-sizing:border-box;";
  document.body.appendChild(vicEl);
  return vicEl;
}
function setVictory(text, on) { const el = victoryEl(); if (!el) return; el.textContent = text; el.style.opacity = on ? "1" : "0"; }

export class ThroneFight {
  constructor(ev, seq, cr, floorY, rec) {
    this.ev = ev; this.seq = seq; this.cr = cr; this.floorY = floorY;
    this.core = new BossCore(ev, { id: "hollow1", kind: "hollow1", name: "the hollow", maxHp: 5000, rec });
    this.core.onPhase = (p) => this.onPhase(p);
    this.atk = null; this.atkT = 0; this.cd = 2; this.stage = 0; this.side = 1; this.speedMul = 1;
    this.ratT = 0; this.stepT = 3; this.tileT = 5; this.tiles = []; this.stopped = false; this.respawning = false;
    this.tx = 0; this.tz = 0; this.ceilY = floorY + CEIL - cr.H; this.decal = null; this.blinkT = 0;
    const self = this;
    this.core.addHittable({ id: "hollow1", kind: "hollow1", pos: cr.position, radius: 1.3, height: cr.H, rec, team: "enemy",
      isAlive: () => !self.core.dead && !self.stopped && self.cr.ceiling < 0.5 && self.cr.root.visible,
      onHit: (h) => { self.core.damage(h.dmg); cr.flashHit(); ev.sfx("hit_flesh", cr.position, 0.8); } });
  }
  begin() { this.core.begin(); }
  skip() { if (this.atk) this.atkT += 10; }
  forceWin() { this.core.damage(this.core.hp + 1); }
  forceLose() { const c = this.ev.combat; if (c && c.killPlayer) safe(c, "killPlayer", "debug"); else this.onDeath(); }
  onPhase(p) {
    const ev = this.ev;
    this.atk = null; this.cr.stop(); this.cr.ceiling = 0; this.cr.position.y = this.floorY;
    this.cr.play("scream", 1.3); ev.sfx("hollow_shriek", this.cr.position, 0.8); ev.shake(0.4, 0.8); this.cd = 1.6;
    this.core.invuln = 1.2;
    this.applyPhase(p, true);
  }
  applyPhase(p, announce) {
    const ev = this.ev;
    if (p >= 1) { ev.rollTarget = 0.21; ev.rollRate = 1.2; }
    if (p === 1 && announce) this.spawnRats(6);
    if (p >= 2) { if (!ev.atmoTags.has("ev.throne3")) ev.pushAtmo("ev.throne3", "throneDark", 1.5); ev.rollTarget = -0.16; }
    else ev.popAtmo("ev.throne3", 1);
    if (p >= 3) { this.speedMul = 1.4; ev.rollTarget = 0.1; } else this.speedMul = 1;
  }
  spawnRats(n) {
    const ev = this.ev; let pts = null;
    try { pts = ev.world && ev.world.spawns ? ev.world.spawns("shadowRat") : null; } catch (e) { pts = null; }
    for (let i = 0; i < n; i++) {
      let x, z;
      if (pts && pts.length) { const s = pts[i % pts.length]; x = s.pos.x; z = s.pos.z; }
      else { const a = (i / n) * Math.PI * 2; x = Math.sin(a) * 7; z = 496 + Math.cos(a) * 8; }
      ev.spawnRat(x, this.floorY, z, this.core.rec, 9);
    }
  }
  onDeath() {
    if (this.respawning) return true; this.respawning = true;
    const ev = this.ev;
    (async () => {
      try {
        safe(ev.ui, "fade", 1, 0.5, "#000");
        await new Promise((r) => setTimeout(r, 600));
        const d = ev.point("throneDoor");
        ev.teleport({ x: d.x, y: d.y, z: d.z + 3 }, 0); ev.heal(); ev.emit("player:respawn", { zone: "throne" });
        ev.fx.clearAll(); ev.killMinions(); this.atk = null; this.cr.stop(); this.cr.ceiling = 0;
        this.cr.position.set(0, this.floorY, 500); this.cd = 2.5;
        this.core.resetToPhase(); this.applyPhase(this.core.phase, false);
        if (this.core.phase === 1) this.spawnRats(4);
        await new Promise((r) => setTimeout(r, 300));
        safe(ev.ui, "fade", 0, 0.7, "#000");
      } finally { this.respawning = false; }
    })();
    return true;
  }
  choose() {
    const p = this.core.phase, r = Math.random(), pl = this.ev.player();
    const d = playerDist(pl, this.cr.position.x, this.cr.position.z);
    if (p >= 3 && r < 0.25) return "throw";
    if (p >= 2 && r < 0.45) return Math.random() < 0.5 ? "scream" : "blink";
    if (p >= 1 && r < 0.6) return "ceiling";
    if (d > 7) return Math.random() < 0.6 ? "puddles" : "approach";
    return Math.random() < 0.7 ? "swipe" : "puddles";
  }
  startAtk(a) {
    this.atk = a; this.atkT = 0; this.stage = 0;
    const ev = this.ev, cr = this.cr, pl = ev.player(), fy = this.floorY;
    const wind = this.core.phase >= 3 ? 0.55 : 0.75;
    if (a === "swipe") {
      this.side = Math.random() < 0.5 ? 1 : -1; this.wind = wind;
      cr.play(this.side > 0 ? "swipeL" : "swipeR", wind / 0.6);
      this.decal = ev.fx.decal("cone", cr.position.x, fy, cr.position.z, 6.5, wind, { yaw: cr.yaw, half: 0.95 });
      ev.sfx("hollow_breath", cr.position, 0.7);
    } else if (a === "puddles") {
      cr.play("raise", 0.8);
      const rec = this.core.rec;
      for (let i = 0; i < 3; i++) {
        const ox = i === 0 ? 0 : (Math.random() - 0.5) * 7, oz = i === 0 ? 0 : (Math.random() - 0.5) * 7;
        const x = clamp(pl.position.x + ox, HALL.x0, HALL.x1), z = clamp(pl.position.z + oz, HALL.z0, HALL.z1);
        ev.fx.decal("ink", x, fy, z, 1.6, 1.1, { hold: 1.4, onDone: () => {
          if (playerDist(ev.player(), x, z) < 1.5 && grounded(ev.player(), fy)) { safe(ev.player(), "root", 1); ev.hurt(10, rec, "ink", x, z, 0); ev.sfx("melt", { x, y: fy, z }, 0.7); }
        } });
      }
    } else if (a === "ceiling") {
      cr.mode = "crawl"; ev.sfx("hollow_step", cr.position, 1);
    } else if (a === "scream") {
      cr.yaw = yawTo(cr.position.x, cr.position.z, pl.position.x, pl.position.z);
      this.decal = ev.fx.decal("cone", cr.position.x, fy, cr.position.z, 13, 0.85, { yaw: cr.yaw, half: 0.55 });
      cr.play("raise", 0.85);
    } else if (a === "blink") {
      cr.setVisible(false); ev.fx.burst(cr.position.x, fy + 3, cr.position.z, 30, 3, 0.03, 0.02, 0.04, 0.8, 0.5, -1, 1);
    } else if (a === "throw") {
      cr.play("throw", 1.0);
    } else if (a === "approach") { /* walk for a bit */ }
  }
  runAtk(dt) {
    const ev = this.ev, cr = this.cr, pl = ev.player(), pp = pl.position, fy = this.floorY, rec = this.core.rec;
    this.atkT += dt; const t = this.atkT;
    switch (this.atk) {
      case "swipe":
        if (this.stage === 0 && t >= this.wind) {
          this.stage = 1; ev.sfx("whoosh_sword", cr.position, 1);
          if (playerInCone(pl, cr.position.x, cr.position.z, cr.yaw, 6.5, 0.95) && !pl.dodging) ev.hurt(this.core.phase >= 3 ? 30 : 25, rec, "hollow", cr.position.x, cr.position.z, 7);
        }
        if (t > this.wind + 0.5) this.atk = null;
        break;
      case "puddles": if (t > 1.2) this.atk = null; break;
      case "approach": this.chase(dt, 1.4); if (t > 1.5) this.atk = null; break;
      case "ceiling": {
        if (this.stage === 0) { // leap up
          const k = clamp(t / 0.5, 0, 1); cr.ceiling = k; cr.position.y = fy + (this.ceilY - fy) * k;
          if (k >= 1) { this.stage = 1; this.atkT = 0; ev.sfx("hollow_step", cr.position, 1); }
        } else if (this.stage === 1) { // crawl along the ceiling above you
          cr.mode = "ceiling";
          const dx = pp.x - cr.position.x, dz = pp.z - cr.position.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
          const sp = 9 * this.speedMul; if (d > 0.3) { cr.position.x += dx / d * Math.min(d, sp * dt); cr.position.z += dz / d * Math.min(d, sp * dt); }
          cr.yaw = Math.atan2(dx, dz);
          if (t > 1.5) { this.stage = 2; this.atkT = 0; this.tx = pp.x; this.tz = pp.z; ev.fx.decal("circle", this.tx, fy, this.tz, 3.5, 1.0); ev.sfx("hollow_breath", cr.position, 1); }
        } else if (this.stage === 2) { // hang there, then drop
          cr.position.x += (this.tx - cr.position.x) * Math.min(1, dt * 6); cr.position.z += (this.tz - cr.position.z) * Math.min(1, dt * 6);
          if (t > 1.0) { this.stage = 3; this.atkT = 0; }
        } else {
          const k = clamp(t / 0.28, 0, 1); cr.ceiling = 1 - k; cr.position.y = this.ceilY + (fy - this.ceilY) * k * k;
          if (k >= 1) {
            cr.mode = "idle"; cr.ceiling = 0; cr.position.y = fy; ev.shake(0.6, 0.5); ev.sfx("land_hard", cr.position, 1);
            if (playerDist(pl, this.tx, this.tz) < 3.5 && !pl.dodging) ev.hurt(35, rec, "hollow", this.tx, this.tz, 9);
            ev.fx.ring(this.tx, fy, this.tz, { speed: 11, maxR: 14, dmg: 15, rec, band: 0.8 });
            ev.fx.burst(this.tx, fy + 0.3, this.tz, 30, 6, 0.2, 0.18, 0.2, 1, 0.4, 9, 1);
            this.atk = null; this.cd = 1.4;
          }
        }
        break;
      }
      case "scream":
        if (this.stage === 0 && t >= 0.85) {
          this.stage = 1; cr.play("scream", 1.2); ev.sfx("hollow_shriek", cr.position, 1); ev.shake(0.5, 0.6);
          ev.postfx({ aberration: 0.9 }); ev.after(0.6, () => ev.postfx({ aberration: 0.3 }));
          if (playerInCone(pl, cr.position.x, cr.position.z, cr.yaw, 13, 0.55) && !pl.dodging) {
            ev.hurt(18, rec, "scream", cr.position.x, cr.position.z, 0);
            const dx = pp.x - cr.position.x, dz = pp.z - cr.position.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
            safe(pl, "knockback", { x: dx / d * 14, y: 4, z: dz / d * 14 });
          }
        }
        if (t > 1.9) this.atk = null;
        break;
      case "blink":
        if (this.stage === 0 && t > 0.6) {
          this.stage = 1;
          const fx = Math.sin(pl.yaw), fz = Math.cos(pl.yaw);
          cr.position.set(clamp(pp.x - fx * 3, HALL.x0, HALL.x1), fy, clamp(pp.z - fz * 3, HALL.z0, HALL.z1));
          cr.yaw = yawTo(cr.position.x, cr.position.z, pp.x, pp.z);
          ev.sfx("king_whisper", cr.position, 1);
        }
        if (this.stage === 1 && t > 0.95) { cr.setVisible(true); this.startAtk("swipe"); }
        break;
      case "throw":
        if (this.stage === 0 && t > 0.55) {
          this.stage = 1;
          const hx = cr.position.x, hy = fy + cr.H * 0.9, hz = cr.position.z, T = 1.1, g = 16;
          const tx = pp.x + pl.velocity.x * 0.5, tz = pp.z + pl.velocity.z * 0.5;
          ev.fx.shoot("rock", hx, hy, hz, (tx - hx) / T, ((fy - hy) + 0.5 * g * T * T) / T, (tz - hz) / T,
            { g, life: 3, radius: 0.9, dmg: 30, rec, floorY: fy, aoe: 2.3, scale: 1.4, source: "throne" });
          ev.fx.decal("circle", tx, fy, tz, 2.3, T);
          ev.sfx("whoosh_punch", cr.position, 1);
        }
        if (t > 1.1) this.atk = null;
        break;
      default: this.atk = null;
    }
  }
  chase(dt, mul) {
    const cr = this.cr, pp = this.ev.player().position;
    const dx = pp.x - cr.position.x, dz = pp.z - cr.position.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    const sp = (d > 3.4 ? 2.9 : 0) * this.speedMul * mul;
    cr.position.x += dx / d * sp * dt; cr.position.z += dz / d * sp * dt; cr.speed = sp; cr.mode = "walk";
    cr.yaw = dampAngle(cr.yaw, Math.atan2(dx, dz), 5, dt);
    return d;
  }
  update(dt) {
    const ev = this.ev, cr = this.cr, pl = ev.player(); if (!pl) return;
    if (this.core.invuln > 0) this.core.invuln -= dt;
    ev.updateMinions(dt, this.floorY);
    if (this.stopped || this.core.dead || !this.core.started || this.respawning) return;
    if (this.atk) this.runAtk(dt);
    else {
      const d = this.chase(dt, 1);
      this.cd -= dt;
      if (this.cd <= 0) { this.cd = (this.core.phase >= 3 ? 1.0 : 1.5) + Math.random() * 0.8; this.startAtk(d < 7 || this.core.phase >= 1 ? this.choose() : "puddles"); }
    }
    const p = this.core.phase;
    // P2+: keep a few shadow rats around
    if (p >= 1) { this.ratT -= dt; if (this.ratT <= 0) { this.ratT = 22; if (ev.minionCount() < 3) this.spawnRats(3); } }
    // P3: footsteps from the wrong direction
    if (p >= 2) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = 2.5 + Math.random() * 2.5; const pp = pl.position;
        const dx = pp.x - cr.position.x, dz = pp.z - cr.position.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
        ev.sfx("hollow_step", { x: pp.x + dx / d * 7, y: pp.y, z: pp.z + dz / d * 7 }, 1);
      }
    }
    // P4: the floor breaks into tiles
    if (p >= 3) {
      this.tileT -= dt;
      if (this.tileT <= 0) {
        this.tileT = 7;
        const fy = this.floorY, rec = this.core.rec;
        for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 5; iz++) {
          if (Math.random() > 0.5) continue;
          const x = -9 + ix * 6, z = 484 + iz * 5.6;
          ev.fx.decal("rect", x, fy, z - 2.8, 2.9, 1.8, { yaw: 0, length: 5.6, hold: 0.2, onDone: () => {
            const pp = ev.player().position;
            ev.fx.burst(x, fy + 0.2, z, 14, 4, 0.22, 0.2, 0.2, 0.9, 0.35, 9, 1);
            if (Math.abs(pp.x - x) < 3 && Math.abs(pp.z - z) < 2.8 && grounded(ev.player(), fy)) ev.hurt(30, rec, "floor", x, z, 4);
          } });
        }
        ev.sfx("ground_crack", pl.position, 0.9);
      }
    }
  }
  dispose() { this.stopped = true; if (this.core.started && !this.core.done) this.core.finish(false); this.core.clearHittables(); this.ev.killMinions(); this.ev.fx.clearAll(); }
}

export async function throne(ev, seq, opts) {
  ev.setPhase("throne");
  seq.defer(() => { if (seq.aborted) { safe(ev.ui, "fade", 0, 0.5); setVictory("", false); } });
  const T = ev.THREE;
  const door = ev.point("throneDoor"); const fy = door.y;
  const inside = { x: door.x, y: fy, z: door.z + 3 };
  ev.cine(seq, true);
  await seq.fade(1, 0.3, "#000");
  if (ev.zone() !== "throne") await seq.p(ev.goto("throne", inside, 0, false));
  else ev.teleport(inside, 0);
  ev.pushAtmo("ev.throne", "throne", 0.3); seq.defer(() => { ev.popAtmo("ev.throne", 1.5); ev.popAtmo("ev.throne3", 1.5); });
  ev.pushMusic("ev.throne", "throne", 1.0); seq.defer(() => ev.popMusic("ev.throne", 1.5));
  seq.defer(() => { ev.rollTarget = 0; ev.rollRate = 3; });
  // the door is sealed behind you
  let sealId = null;
  try { sealId = ev.engine.physics.addBox({ center: { x: door.x, y: fy + 2, z: door.z - 0.2 }, size: { x: 6, y: 4.5, z: 0.8 }, tag: "ev.tmp.throne", walkable: false }); } catch (e) { sealId = null; }
  seq.defer(() => { if (sealId !== null) { try { ev.engine.physics.remove(sealId); } catch (e) { /* */ } } });
  const crack = ev.world && safe(ev.world, "prop", "throneCrack"); if (crack) { crack.visible = true; }
  // ---- intro: it rises out of the throne's shadow ----
  const seat = ev.point("throneSeat");
  const cr = ev.model("creature"); cr.setHeight(6); cr.ceiling = 0; cr.melt = 0; cr.mode = "idle"; cr.stop();
  cr.position.set(seat.x, fy - 6.5, seat.z - 3.5); cr.yaw = Math.PI; cr.setVisible(true);
  seq.defer(() => { cr.setVisible(false); cr.setHeight(2.9); cr.ceiling = 0; cr.root.scale.set(1, 1, 1); });
  const ctl = ev.takeCam(seq);
  if (ctl) safe(ctl, "set", { x: inside.x + 2.5, y: fy + 3.2, z: inside.z + 1 }, { x: seat.x, y: fy + 2.5, z: seat.z - 3 });
  await seq.fade(0, 1.2, "#000");
  ev.sfx("torch_whoosh", seat, 0.9);
  const puddle = ev.fx.decal("ink", seat.x, fy, seat.z - 3.5, 0.3, 3.5, { hold: 3 });
  if (ctl) seq.p(safe(ctl, "move", { x: inside.x + 1.5, y: fy + 2.4, z: inside.z + 7 }, { x: seat.x, y: fy + 3.5, z: seat.z - 3.5 }, 4));
  ev.sfx("rumble", seat, 1); ev.shake(0.3, 3);
  const t0 = seq.t;
  await seq.waitWhile(3.2, () => {
    const k = clamp((seq.t - t0) / 3.2, 0, 1);
    cr.position.y = fy - 6.5 + 6.5 * (1 - (1 - k) * (1 - k));
    if (puddle && puddle.mesh) puddle.mesh.scale.setScalar(0.3 + k * 3.2);
    return true;
  });
  cr.position.y = fy; cr.play("scream", 1.5);
  ev.sfx("hollow_shriek", cr.position, 1); ev.shake(0.7, 1.0);
  await seq.wait(1.5);
  if (ctl) safe(ctl, "release", 0.8);
  ev.cine(seq, false);
  // ---- fight ----
  let rec = 1; try { rec = Math.max(1, ev.combat.level()); } catch (e) { rec = Math.max(1, ev.state.run.level || 1); }
  const fight = new ThroneFight(ev, seq, cr, fy, rec);
  ev.fight = fight; seq.defer(() => { if (ev.fight === fight) ev.fight = null; fight.dispose(); });
  ev.setDeath(() => fight.onDeath()); seq.defer(() => ev.setDeath(null));
  fight.begin();
  ev.ready();
  await seq.until(() => fight.core.dead);
  // ---- fake victory ----
  fight.stopped = true; ev.fx.clearAll(); ev.killMinions(); ev.setDeath(null);
  safe(ev.combat, "setInvuln", 30);
  ev.cine(seq, true); ev.rollTarget = 0; ev.popAtmo("ev.throne3", 0.5);
  cr.stop(); cr.mode = "kneel"; cr.ceiling = 0; cr.position.y = fy;
  ev.popMusic("ev.throne", 0.4);   // AUDIO plays its "throneResolve" fake-victory sting on boss:end hollow1
  fight.core.finish(true);
  const ctl2 = ev.takeCam(seq);
  if (ctl2) { const pp = ev.player().position; safe(ctl2, "move", { x: pp.x + 1.2, y: pp.y + 2.2, z: pp.z - 1.5 }, { x: cr.position.x, y: fy + 2, z: cr.position.z }, 1.5); }
  const word = "VICTORY"; let typed = "";
  for (let i = 0; i < 5; i++) { typed += word[i]; setVictory(typed, true); ev.sfx("type", null, 0.6); await seq.wait(0.14); }
  setVictory(typed + "-", true); ev.sfx("glitch", null, 0.9); safe(ev.audio, "duck", 1, 6);
  safe(ev.ui, "glitch", 0.6, 0.4);
  await seq.wait(1.3);
  // it twitches...
  cr.mode = "idle"; cr.play("twitch", 1.6); ev.sfx("hollow_breath", cr.position, 1);
  await seq.wait(1.6);
  // ...and scurries away on all fours across the ceiling, out through a crack
  setVictory(typed + "-", false);
  cr.mode = "crawl"; ev.sfx("hollow_step", cr.position, 1);
  const sx = cr.position.x, sz = cr.position.z, ex = 7.5, ez = 508.5, ceilY = fy + CEIL - cr.H;
  const t1 = seq.t;
  await seq.waitWhile(2.2, () => {
    const k = clamp((seq.t - t1) / 2.2, 0, 1);
    const up = clamp(k / 0.25, 0, 1);
    cr.ceiling = up; cr.mode = up >= 1 ? "ceiling" : "crawl";
    cr.position.y = fy + (ceilY - fy) * up;
    cr.position.x = sx + (ex - sx) * k; cr.position.z = sz + (ez - sz) * k;
    cr.yaw = Math.atan2(ex - sx, ez - sz);
    if (k > 0.85) { const s = 1 - (k - 0.85) / 0.15; cr.root.scale.set(s, s, s); }
    return true;
  });
  cr.setVisible(false); cr.root.scale.set(1, 1, 1);
  ev.fx.burst(ex, fy + CEIL - 0.5, ez, 30, 3, 0.03, 0.02, 0.04, 1.2, 0.4, 3, 1);
  ev.sfx("ground_crack", { x: ex, y: fy + CEIL, z: ez }, 0.9);
  await seq.wait(0.8);
  seq.say("the hollow", "we will meet again.", { dur: 4.5 });
  safe(ev.audio, "voice", "we will meet again.", { kind: "hollow" });
  await seq.wait(4.2);
  await seq.fade(1, 2, "#000");
  safe(ev.audio, "music", null, { fade: 0.5 });
  safe(ev.audio, "stinger", "ngReveal");
  await seq.wait(3);
  safe(ev.combat, "setInvuln", 0);
  return "ngReset";
}
export { wrapAngle };
