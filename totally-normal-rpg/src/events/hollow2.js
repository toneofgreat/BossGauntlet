// Hollow II, the prepared monster (DESIGN 9.2 end + 9.3): armoured with the King's plate, Fydor's halberd and
// Myles's shield. 4 phases, phase checkpoints, respawn at the arena edge. Then -> liquidSword.
import { safe, clamp, yawTo, dampAngle, wrapAngle } from "./util.js";
import { BossCore, playerInCone, playerDist, playerInLine, grounded } from "./boss.js";
import { ensureRibbon } from "./girl.js";

const RING_N = 36, RING_R = 60;

// ------------------------------------------------------------------ the ring of dark glass
let ring = null;
function getRing(ev) {
  if (ring) return ring;
  const T = ev.THREE;
  let mat; try { mat = ev.engine.materials.get("glassBlack"); } catch (e) { mat = null; }
  if (!mat) mat = new T.MeshStandardMaterial({ color: 0x050508, roughness: 0.05, metalness: 0.6 });
  const w = 2 * RING_R * Math.sin(Math.PI / RING_N) + 0.4;
  const mesh = new T.InstancedMesh(new T.BoxGeometry(w, 9, 0.6), mat, RING_N); mesh.visible = false; mesh.castShadow = false;
  ev.scene.add(mesh);
  ring = { mesh, ids: [], k: 0, target: 0, cx: 0, cz: 0, y: 0, m: new T.Matrix4(), q: new T.Quaternion(), v: new T.Vector3(), s: new T.Vector3(1, 1, 1), up: new T.Vector3(0, 1, 0) };
  return ring;
}
function ringPlace(ev, cx, y, cz) { const r = getRing(ev); r.cx = cx; r.cz = cz; r.y = y; }
function ringWrite(r) {
  for (let i = 0; i < RING_N; i++) {
    const a = (i / RING_N) * Math.PI * 2;
    r.q.setFromAxisAngle(r.up, a);
    r.m.compose(r.v.set(r.cx + Math.sin(a) * RING_R, r.y - 9.5 + r.k * 9, r.cz + Math.cos(a) * RING_R), r.q, r.s);
    r.mesh.setMatrixAt(i, r.m);
  }
  r.mesh.instanceMatrix.needsUpdate = true;
}
export function ringRaise(ev, up) {
  const r = getRing(ev); r.target = up ? 1 : 0; r.mesh.visible = true;
  const ph = ev.engine && ev.engine.physics;
  if (up && ph && !r.ids.length) {
    for (let i = 0; i < RING_N; i++) {
      const a = (i / RING_N) * Math.PI * 2;
      try { r.ids.push(ph.addBox({ center: { x: r.cx + Math.sin(a) * RING_R, y: r.y + 4, z: r.cz + Math.cos(a) * RING_R },
        size: { x: 2 * RING_R * Math.sin(Math.PI / RING_N) + 0.6, y: 8, z: 1 }, yaw: a, tag: "ev.tmp.ring", walkable: false })); } catch (e) { /* */ }
    }
  }
  if (!up && ph) { for (const id of r.ids) { try { ph.remove(id); } catch (e) { /* */ } } r.ids.length = 0; }
}
export function ringUpdate(ev, dt) {
  const r = ring; if (!r || !r.mesh.visible) return;
  if (Math.abs(r.k - r.target) > 0.001) { r.k += clamp(r.target - r.k, -dt * 0.45, dt * 0.45); ringWrite(r); }
  else if (r.target === 0 && r.k <= 0.001) r.mesh.visible = false;
}
export function ringHide(ev) { if (ring) { ringRaise(ev, false); ring.k = 0; ring.target = 0; ring.mesh.visible = false; } }

// ------------------------------------------------------------------ the fight
class Hollow2Fight {
  constructor(ev, seq, h, center, floorY, rec) {
    this.ev = ev; this.seq = seq; this.h = h; this.c = center; this.floorY = floorY;
    this.core = new BossCore(ev, { id: "hollow2", kind: "hollow2", name: "the hollow, prepared", maxHp: 7000, rec });
    this.core.onPhase = (p) => this.onPhase(p);
    this.deaths = 0; ev.hurtScale = 1;
    this.atk = null; this.atkT = 0; this.stage = 0; this.cd = 2.2; this.respawning = false; this.stopped = false;
    this.dashX = 0; this.dashZ = 0; this.fissure = null; this.counter = false; this.cloneT = 0; this.shieldT = 0; this.speedMul = 1;
    this.clones = [ev.model("clone0"), ev.model("clone1")]; this.cloneAlive = [false, false]; this.cloneCd = [0, 0]; this.cloneRm = [null, null];
    const self = this;
    this.core.addHittable({ id: "hollow2", kind: "hollow2", pos: h.position, radius: 1.6, height: h.H, rec, team: "enemy",
      isAlive: () => !self.core.dead && !self.stopped && h.root.visible,
      onHit: (hit) => self.onHit(hit) });
  }
  begin() { this.core.begin(); }
  skip() { if (this.atk) this.atkT += 10; }
  forceWin() { this.core.damage(this.core.hp + 1); }
  forceLose() { const c = this.ev.combat; if (c && c.killPlayer) safe(c, "killPlayer", "debug"); else this.onDeath(); }
  onHit(hit) {
    const ev = this.ev, h = this.h, pp = ev.player().position;
    if (this.h.shieldUp > 0.5) {
      const a = Math.atan2(pp.x - h.position.x, pp.z - h.position.z);
      if (Math.abs(wrapAngle(a - h.yaw)) < 1.2) {           // parried by Myles's shield
        ev.sfx("block", h.position, 1); ev.sfx("shield_bash", h.position, 0.5);
        if (!this.atk || this.atk === "shield") { this.counter = true; }
        return;
      }
    }
    this.core.damage(hit.dmg); h.flashHit(); ev.sfx("hit_metal", h.position, 0.7);
  }
  onPhase(p) {
    const ev = this.ev; this.atk = null; this.h.stop(); this.h.shieldUp = 0;
    this.h.play("scream", 1.3); ev.sfx("hollow_shriek", this.h.position, 0.9); ev.shake(0.4, 0.8); this.cd = 1.8; this.core.invuln = 1.3;
    this.applyPhase(p);
  }
  applyPhase(p) { this.speedMul = p >= 3 ? 1.25 : 1; if (p < 2) this.popClones(); }
  popClones() {
    for (let i = 0; i < 2; i++) if (this.cloneAlive[i]) this.popClone(i, true);
  }
  popClone(i, quiet) {
    this.cloneAlive[i] = false; const c = this.clones[i]; c.setVisible(false);
    if (this.cloneRm[i]) { try { this.cloneRm[i](); } catch (e) { /* */ } this.cloneRm[i] = null; }
    if (!quiet) { this.ev.fx.burst(c.position.x, this.floorY + 2.5, c.position.z, 40, 4, 0.04, 0.02, 0.05, 1, 0.5, -1, 1); this.ev.sfx("glitch", c.position, 0.7); }
  }
  spawnClones() {
    const ev = this.ev, pp = ev.player().position;
    for (let i = 0; i < 2; i++) {
      if (this.cloneAlive[i]) continue;
      const a = Math.random() * Math.PI * 2; const c = this.clones[i];
      c.position.set(pp.x + Math.sin(a) * 13, this.floorY, pp.z + Math.cos(a) * 13); c.setHeight(5.5); c.mode = "walk"; c.speed = 1;
      c.setVisible(true); this.cloneAlive[i] = true; this.cloneCd[i] = 1.5 + i;
      const idx = i, self = this;
      this.cloneRm[i] = ev.combat && ev.combat.addHittable ? ev.combat.addHittable({ id: "hollow2clone" + i, kind: "hollow2", pos: c.position, radius: 1.2, height: 5.5,
        rec: this.core.rec, team: "enemy", isAlive: () => self.cloneAlive[idx], onHit: () => self.popClone(idx, false) }) : null;
      ev.fx.burst(c.position.x, this.floorY + 2.5, c.position.z, 30, 3, 0.04, 0.02, 0.05, 0.8, 0.5, 1, 1);
    }
  }
  onDeath() {
    if (this.respawning) return true; this.respawning = true; const ev = this.ev;
    // mercy: each death softens its hits a little (down to 55%), and low-HP players get told where armor is
    this.deaths++; ev.hurtScale = Math.max(0.55, 1 - 0.09 * this.deaths);
    try {
      const mhp = (ev.state && ev.state.player && ev.state.player.maxHp) || 100;
      if (mhp < 300 && (this.deaths === 2 || this.deaths % 6 === 0)) setTimeout(() => ev.toast("Tip: claim armor at the Village Exchange - more HP helps here.", "info", 5), 1400);
    } catch (e) { /* ignore */ }
    (async () => {
      try {
        safe(ev.ui, "fade", 1, 0.5, "#000");
        await new Promise((r) => setTimeout(r, 600));
        ev.teleport({ x: this.c.x, y: this.floorY, z: this.c.z + RING_R - 6 }, Math.PI); ev.heal(); ev.emit("player:respawn", { zone: "hollowDesert" });
        ev.fx.clearAll(); this.popClones(); this.atk = null; this.h.stop(); this.h.shieldUp = 0; this.fissure = null;
        this.h.position.set(this.c.x, this.floorY, this.c.z - 12); this.cd = 2.5;
        this.core.resetToPhase(); this.applyPhase(this.core.phase);
        await new Promise((r) => setTimeout(r, 300));
        safe(ev.ui, "fade", 0, 0.7, "#000");
      } finally { this.respawning = false; }
    })();
    return true;
  }
  choose(d) {
    const p = this.core.phase, r = Math.random();
    if (p >= 3 && r < 0.4) return Math.random() < 0.5 ? "sandwave" : "pull";
    if (p >= 2 && r < 0.45) return Math.random() < 0.55 ? "bolts" : "clones";
    if (p >= 1 && r < 0.5) return Math.random() < 0.5 ? "shield" : "bash";
    if (d > 9) return Math.random() < 0.6 ? "fissure" : "slam";
    return Math.random() < 0.5 ? "swipe" : "slam";
  }
  startAtk(a) {
    const ev = this.ev, h = this.h, pl = ev.player(), pp = pl.position, fy = this.floorY;
    this.atk = a; this.atkT = 0; this.stage = 0;
    h.yaw = yawTo(h.position.x, h.position.z, pp.x, pp.z);
    switch (a) {
      case "slam": h.play("slam", 1.35); ev.fx.decal("circle", h.position.x + Math.sin(h.yaw) * 4, fy, h.position.z + Math.cos(h.yaw) * 4, 3.8, 0.9); ev.sfx("halberd", h.position, 0.8); break;
      case "swipe": h.play("swipeR", 1.1); ev.fx.decal("cone", h.position.x, fy, h.position.z, 7.5, 0.66, { yaw: h.yaw, half: 1.0 }); break;
      case "counter": h.play("swipeR", 0.6); ev.fx.decal("cone", h.position.x, fy, h.position.z, 6, 0.36, { yaw: h.yaw, half: 1.1 }); break;
      case "fissure": h.play("slam", 1.2); this.fissure = { d: 0, yaw: h.yaw, x: h.position.x, z: h.position.z, next: 2, hit: false };
        ev.fx.decal("rect", h.position.x, fy, h.position.z, 1.3, 0.9, { yaw: h.yaw, length: 34, hold: 1.6 }); break;
      case "shield": h.play("shield", 3.6); h.shieldUp = 1; this.shieldT = 3.5; ev.sfx("shield_bash", h.position, 0.6); break;
      case "bash": h.play("bash", 1.5); h.shieldUp = 1; this.dashX = Math.sin(h.yaw); this.dashZ = Math.cos(h.yaw);
        ev.fx.decal("rect", h.position.x, fy, h.position.z, 1.4, 0.8, { yaw: h.yaw, length: 15 }); break;
      case "bolts": h.play("raise", 0.8); ev.sfx("staff_charge", h.position, 1); break;
      case "clones": h.play("raise", 0.9); ev.sfx("teleport", h.position, 1); break;
      case "sandwave": h.play("slam", 1.3); ev.fx.decal("circle", h.position.x, fy, h.position.z, 6, 0.9); break;
      case "pull": h.play("raise", 2.4); ev.sfx("hollow_breath", h.position, 1); break;
    }
  }
  runAtk(dt) {
    const ev = this.ev, h = this.h, pl = ev.player(), pp = pl.position, fy = this.floorY, rec = this.core.rec;
    this.atkT += dt; const t = this.atkT;
    switch (this.atk) {
      case "slam":
        if (this.stage === 0 && t > 0.9) {
          this.stage = 1; const x = h.position.x + Math.sin(h.yaw) * 4, z = h.position.z + Math.cos(h.yaw) * 4;
          ev.shake(0.6, 0.5); ev.sfx("land_hard", h.position, 1); ev.fx.burst(x, fy + 0.3, z, 30, 6, 0.75, 0.62, 0.45, 1, 0.35, 8, 1);
          if (playerDist(pl, x, z) < 3.8 && !pl.dodging) ev.hurt(40, rec, "halberd", x, z, 8);
          ev.fx.ring(x, fy, z, { speed: 15, maxR: 36, dmg: 30, rec, band: 0.9, height: 0.9 });
        }
        if (t > 1.5) this.atk = null; break;
      case "swipe": case "counter": {
        const w = this.atk === "swipe" ? 0.66 : 0.36;
        if (this.stage === 0 && t > w) {
          this.stage = 1; ev.sfx("whoosh_sword", h.position, 1);
          if (playerInCone(pl, h.position.x, h.position.z, h.yaw, this.atk === "swipe" ? 7.5 : 6, 1.05) && !pl.dodging) ev.hurt(this.atk === "swipe" ? 32 : 25, rec, "halberd", h.position.x, h.position.z, 6);
        }
        if (t > w + 0.5) this.atk = null; break;
      }
      case "fissure": {
        const f = this.fissure;
        if (t > 0.9 && f) {
          f.d += 17 * dt;
          while (f.next <= f.d && f.next <= 34) {
            const x = f.x + Math.sin(f.yaw) * f.next, z = f.z + Math.cos(f.yaw) * f.next;
            ev.fx.burst(x, fy + 0.1, z, 6, 4, 0.55, 0.45, 0.33, 0.7, 0.3, 9, 1);
            if (!f.hit && playerDist(pl, x, z) < 1.4 && grounded(pl, fy) && !pl.dodging) { f.hit = true; ev.hurt(28, rec, "fissure", x, z, 5); }
            f.next += 2;
          }
          if (f.next % 6 < 2) ev.sfx("fissure", pp, 0.3);
          if (f.d > 34) { this.fissure = null; this.atk = null; }
        }
        break;
      }
      case "shield":
        this.shieldT -= dt;
        h.yaw = dampAngle(h.yaw, yawTo(h.position.x, h.position.z, pp.x, pp.z), 4, dt);
        if (this.counter) { this.counter = false; h.shieldUp = 0; this.startAtk("counter"); break; }
        if (this.shieldT <= 0) { h.shieldUp = 0; h.stop(); this.atk = null; ev.sfx("hit_metal", h.position, 0.4); }
        break;
      case "bash":
        if (t > 0.8 && t < 1.45) {
          const sp = 22; h.position.x += this.dashX * sp * dt; h.position.z += this.dashZ * sp * dt; this.clampToArena(h.position);
          if (this.stage === 0 && playerDist(pl, h.position.x, h.position.z) < 2.6 && !pl.dodging) {
            this.stage = 1; ev.hurt(32, rec, "shield", h.position.x, h.position.z, 0); ev.sfx("shield_bash", h.position, 1);
            safe(pl, "knockback", { x: this.dashX * 12, y: 4, z: this.dashZ * 12 });
          }
        }
        if (t > 1.6) { h.shieldUp = 0; h.stop(); this.atk = null; }
        break;
      case "bolts":
        if (this.stage < 2 && t > 0.8 + this.stage * 0.6) {
          const hx = h.position.x, hy = fy + h.H * 0.85, hz = h.position.z; const base = yawTo(hx, hz, pp.x, pp.z);
          const dist = Math.max(4, playerDist(pl, hx, hz)), vy = ((pp.y + 1) - hy) / (dist / 19);
          for (let k = -2; k <= 2; k++) { const a = base + k * 0.17; ev.fx.shoot("blue", hx, hy, hz, Math.sin(a) * 19, vy, Math.cos(a) * 19, { life: 3, radius: 0.35, dmg: 25, rec, source: "staff", scale: 1.2 }); }
          ev.sfx("staff_bolt", h.position, 1); this.stage++;
        }
        if (t > 2.2) this.atk = null; break;
      case "clones": if (this.stage === 0 && t > 0.9) { this.stage = 1; this.spawnClones(); this.cloneT = 15; } if (t > 1.3) this.atk = null; break;
      case "sandwave":
        if (this.stage === 0 && t > 0.9) {
          this.stage = 1; ev.shake(0.7, 0.8); ev.sfx("rumble", h.position, 1);
          ev.fx.ring(h.position.x, fy, h.position.z, { speed: 13, maxR: 50, dmg: 35, rec, band: 1.0, height: 1.6, color: 0xd8a860 });
          ev.fx.burst(h.position.x, fy + 0.5, h.position.z, 60, 9, 0.78, 0.64, 0.44, 1.4, 0.4, 6, 1);
        }
        if (t > 1.6) this.atk = null; break;
      case "pull":
        if (t < 2.2) {
          const dx = h.position.x - pp.x, dz = h.position.z - pp.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
          if (d > 3) safe(pl, "knockback", { x: dx / d * 26 * dt, y: 0, z: dz / d * 26 * dt });
          if (Math.random() < dt * 30) ev.fx.emit(pp.x, pp.y + 0.3, pp.z, dx / d * 6, 0.5, dz / d * 6, 0.8, 0.1, 0.7, 0.6, 0.45, 0.7, 0);
          if (this.stage === 0 && t > 1.2) { this.stage = 1; ev.fx.decal("circle", h.position.x, fy, h.position.z, 5.5, 1.0); h.play("slam", 1.5); }
        }
        if (this.stage === 1 && t > 2.2) {
          this.stage = 2; ev.shake(0.8, 0.6); ev.sfx("land_hard", h.position, 1);
          if (playerDist(pl, h.position.x, h.position.z) < 5.5 && !pl.dodging) ev.hurt(40, rec, "hollow", h.position.x, h.position.z, 10);
          ev.fx.ring(h.position.x, fy, h.position.z, { speed: 14, maxR: 30, dmg: 25, rec });
        }
        if (t > 2.8) this.atk = null; break;
      default: this.atk = null;
    }
  }
  clampToArena(p) { const dx = p.x - this.c.x, dz = p.z - this.c.z, d = Math.sqrt(dx * dx + dz * dz); if (d > RING_R - 4) { p.x = this.c.x + dx / d * (RING_R - 4); p.z = this.c.z + dz / d * (RING_R - 4); } }
  update(dt) {
    const ev = this.ev, h = this.h, pl = ev.player(); if (!pl) return;
    if (this.core.invuln > 0) this.core.invuln -= dt;
    if (this.stopped || this.core.dead || !this.core.started || this.respawning) return;
    const pp = pl.position;
    if (this.atk) this.runAtk(dt);
    else {
      const dx = pp.x - h.position.x, dz = pp.z - h.position.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
      const sp = d > 4.5 ? 3.4 * this.speedMul : 0;
      h.position.x += dx / d * sp * dt; h.position.z += dz / d * sp * dt; this.clampToArena(h.position);
      h.mode = "walk"; h.speed = sp; h.yaw = dampAngle(h.yaw, Math.atan2(dx, dz), 4, dt);
      this.stepT = (this.stepT || 0) - dt * sp; if (this.stepT <= 0) { this.stepT = 3.2; ev.sfx("hollow_step", h.position, 0.9); }
      this.cd -= dt;
      if (this.cd <= 0) { this.cd = (this.core.phase >= 3 ? 0.9 : 1.3) + Math.random() * 0.7; this.startAtk(this.choose(d)); }
    }
    h.position.y = this.floorY;
    // clones: walk around you, fire single bolts
    if (this.cloneAlive[0] || this.cloneAlive[1]) {
      this.cloneT -= dt; if (this.cloneT <= 0) this.popClones();
      for (let i = 0; i < 2; i++) {
        if (!this.cloneAlive[i]) continue; const c = this.clones[i];
        const dx = pp.x - c.position.x, dz = pp.z - c.position.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
        c.yaw = Math.atan2(dx, dz); c.position.x += (-dz / d) * 2.2 * dt * (i ? 1 : -1); c.position.z += (dx / d) * 2.2 * dt * (i ? 1 : -1);
        c.position.y = this.floorY;
        this.cloneCd[i] -= dt;
        if (this.cloneCd[i] <= 0) {
          this.cloneCd[i] = 2.6; const hy = this.floorY + 4.6;
          ev.fx.shoot("blue", c.position.x, hy, c.position.z, dx / d * 17, ((pp.y + 1) - hy) / (d / 17), dz / d * 17, { life: 3, radius: 0.35, dmg: 20, rec: this.core.rec, source: "clone" });
          c.play("throw", 0.6); ev.sfx("staff_bolt", c.position, 0.6);
        }
      }
    }
  }
  dispose() { this.ev.hurtScale = 1; this.stopped = true; if (this.core.started && !this.core.done) this.core.finish(false); this.core.clearHittables(); this.popClones(); this.ev.fx.clearAll(); this.h.shieldUp = 0; }
}

export async function hollow2(ev, seq) {
  ev.setPhase("hollow2");
  seq.defer(() => { if (seq.aborted) { safe(ev.ui, "fade", 0, 0.5); ringHide(ev); const h = ev.models.armored; if (h) h.setVisible(false); } });
  const T = ev.THREE;
  const c = ev.point("hollowArena"); const fy = ev.groundY(c.x, c.z, c.y + 30); c.y = fy;
  if (ev.zone() !== "hollowDesert") {
    await seq.fade(1, 0.4, "#000");
    await seq.p(ev.goto("hollowDesert", { x: c.x, y: fy, z: c.z + 40 }, Math.PI, false));
    safe(ev.ui, "fade", 0, 0.8, "#000");
  }
  ensureRibbon(ev);
  const h = ev.model("armored"); h.setHeight(7.5); h.mode = "walk"; h.speed = 1.6; h.stop(); h.shieldUp = 0; h.melt = 0; h.ceiling = 0;
  const far = ev.point("hollowFar"); h.position.set(far.x, ev.groundY(far.x, far.z, far.y + 30), far.z); h.yaw = 0; h.setVisible(true);
  ev.sfx("rumble", h.position, 0.8);
  ev.target = h.position; seq.defer(() => { ev.target = null; });
  ev.setDeath(() => { ev.teleport({ x: c.x, y: fy, z: c.z + RING_R - 6 }, Math.PI); ev.heal(); ev.emit("player:respawn", { zone: "hollowDesert" }); return true; });
  seq.defer(() => ev.setDeath(null));
  ev.ready();
  // it walks toward the arena; the fight begins once you are inside the circle (or it comes to get you)
  const pl = ev.player(); const inRing = () => playerDist(pl, c.x, c.z) < RING_R - 6;
  const t0 = seq.t; let stepT = 0;
  const walk = (dt) => {
    const dx = c.x - h.position.x, dz = c.z - h.position.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d > 14) { h.position.x += dx / d * 6 * dt; h.position.z += dz / d * 6 * dt; h.speed = 2.4; h.mode = "walk"; }
    else { h.speed = 0; h.mode = "idle"; h.yaw = yawTo(h.position.x, h.position.z, pl.position.x, pl.position.z); }
    h.position.y = ev.groundY(h.position.x, h.position.z, h.position.y + 5);
    stepT -= dt; if (stepT <= 0 && h.speed > 0) { stepT = 0.9; ev.sfx("hollow_step", h.position, 1); }
  };
  const walker = { update: (dt) => { walk(dt); }, core: null };
  ev.fight = walker; seq.defer(() => { if (ev.fight === walker) ev.fight = null; });
  const inside = await seq.untilOr(() => inRing() && seq.t - t0 > 2, 45);
  if (!inside) { // it reaches for you: you are pulled into the circle
    safe(ev.ui, "glitch", 0.5, 0.5); ev.teleport({ x: c.x, y: fy, z: c.z + RING_R - 10 }, Math.PI);
  }
  // close the circle
  ringPlace(ev, c.x, fy, c.z); ringRaise(ev, true); seq.defer(() => ringRaise(ev, false));
  ev.sfx("rumble", c, 1); ev.shake(0.4, 2.5);
  if (playerDist(pl, h.position.x, h.position.z) > 40) h.position.set(c.x, fy, c.z - 14);
  ev.pushMusic("ev.h2", "hollow2", 1); seq.defer(() => ev.popMusic("ev.h2", 2));
  let rec = 1; try { rec = Math.max(1, Math.round(ev.combat.level() * 1.25)); } catch (e) { rec = 1; }
  const fight = new Hollow2Fight(ev, seq, h, c, fy, rec);
  ev.fight = fight; seq.defer(() => { if (ev.fight === fight) ev.fight = null; fight.dispose(); });
  ev.setDeath(() => fight.onDeath());
  h.play("scream", 1.4); ev.sfx("hollow_shriek", h.position, 1);
  fight.begin();
  await seq.until(() => fight.core.dead);
  fight.core.finish(true);
  fight.stopped = true; fight.dispose();
  ev.emit("enemy:killed", { id: "hollow2", kind: "hollow2", boss: true, levels: 0, first: true, pos: { x: h.position.x, y: h.position.y, z: h.position.z } });
  ev.flag("swordX", h.position.x); ev.flag("swordZ", h.position.z);
  return "liquidSword";
}
export { RING_R, clamp, playerInLine };
