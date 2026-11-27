// Final boss: Hollow III, the end of the world (DESIGN 9.5). 60 m tall, 12 segments, only glowing cores take damage
// (x3). 3 lives (rematch: 1). Every trick in the book. Outcomes -> story.reachEnding(idiot | winners | sigma).
import { safe, clamp, yawTo } from "./util.js";
import { BossCore, playerDist, grounded } from "./boss.js";

const SEG = 12, SEG_HP = 500;
const PILLARS = [[-25, -10], [25, -10], [-13, 30], [15, 40]]; // offsets from the disc centre

let pillarMeshes = null;
function pillars(ev, c, fy, on) {
  const T = ev.THREE;
  if (!pillarMeshes) {
    let mat; try { mat = ev.engine.materials.get("rock"); } catch (e) { mat = null; }
    if (!mat) mat = new T.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.95 });
    const g = new T.CylinderGeometry(1.6, 2.3, 7.5, 9); g.translate(0, 3.75, 0);
    pillarMeshes = PILLARS.map(() => { const m = new T.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; m.visible = false; ev.scene.add(m); return m; });
    pillarMeshes.ids = [];
  }
  const ph = ev.engine && ev.engine.physics;
  for (const id of pillarMeshes.ids) { try { ph.remove(id); } catch (e) { /* */ } }
  pillarMeshes.ids.length = 0;
  for (let i = 0; i < PILLARS.length; i++) {
    const m = pillarMeshes[i]; m.visible = on;
    m.position.set(c.x + PILLARS[i][0], fy, c.z + PILLARS[i][1]); m.rotation.y = i * 1.3;
    if (on && ph) { try { pillarMeshes.ids.push(ph.addCylinder({ base: { x: m.position.x, y: fy, z: m.position.z }, radius: 2.0, height: 7.5, tag: "ev.tmp.final.pillar", surface: "rock" })); } catch (e) { /* */ } }
  }
}

class FinalFight {
  constructor(ev, seq, g, c, fy, rec, rematch) {
    this.ev = ev; this.seq = seq; this.g = g; this.c = c; this.fy = fy; this.rematch = rematch;
    this.core = new BossCore(ev, { id: "hollow3", kind: "hollow3", name: "the hollow", maxHp: SEG * SEG_HP, rec, segments: SEG, thresholds: [0.75, 0.5, 1 / 3] });
    this.core.onPhase = () => { this.trickT = Math.min(this.trickT, 2); ev.sfx("hollow_shriek", null, 0.8); ev.shake(0.6, 1.2); };
    this.atk = null; this.atkT = 0; this.stage = 0; this.cd = 3; this.trickT = 9; this.trick = null; this.trickLeft = 0;
    this.deaths = 0; this.lives = rematch ? 1 : 3; this.outcome = null; this.respawning = false; this.stopped = false;
    this.beamP = new ev.THREE.Vector3(); this.eye = new ev.THREE.Vector3(); this.tmp = new ev.THREE.Vector3(); this.beamTick = 0;
    this.ramps = []; this.minionT = 14; this.sweepA = 0;
    this.shoulder = new ev.THREE.Vector3(g.position.x, fy + 14, g.position.z + 15);
    // hittable cores (cylinder anchors kept at a reachable height)
    const self = this;
    this.anchors = g.cores.map((cr) => ({ cr, pos: new ev.THREE.Vector3() }));
    for (const a of this.anchors) {
      if (a.cr.name === "kneeL") continue;
      const isFace = a.cr.name === "face";
      this.core.addHittable({ id: "hollow3_" + a.cr.name, kind: "hollow3", pos: a.pos, radius: isFace ? 3.2 : 2.6, height: isFace ? 7 : 5, rec, team: "enemy",
        isAlive: () => !self.core.dead && !self.stopped && a.cr.glow > 0.3,
        onHit: (h) => { self.core.damage(h.dmg * 3); g.flashHit(); ev.sfx("hit_flesh", a.cr.pos, 1); ev.fx.burst(a.cr.pos.x, a.cr.pos.y, a.cr.pos.z, 12, 5, 1, 0.15, 0.1, 0.5, 0.3, 6, 1); } });
    }
    this.core.onDefeat = () => { if (!this.outcome) this.outcome = "win"; };
  }
  begin() {
    const st = this.ev.state; if (st.player) st.player.lives = this.lives; safe(this.ev.ui, "lives", this.lives);
    this.core.begin();
  }
  skip() { if (this.atk) this.atkT += 10; }
  forceWin() { this.core.damage(this.core.hp + 1); if (!this.outcome) this.outcome = "win"; }
  forceLose() { if (this.outcome) return; this.deaths++; this.lives = 0; const st = this.ev.state; if (st.player) st.player.lives = 0; safe(this.ev.ui, "lives", 0); this.outcome = "lose"; }
  onDeath() {
    if (this.outcome || this.respawning) return true;
    const ev = this.ev; this.deaths++; this.lives--;
    if (ev.state.player) ev.state.player.lives = Math.max(0, this.lives); safe(ev.ui, "lives", Math.max(0, this.lives));
    if (this.lives <= 0) { this.outcome = "lose"; return true; }
    this.respawning = true;
    (async () => {
      try {
        this.endTrick(); this.atk = null; this.g.clearIK(); this.removeRamps(); ev.fx.clearAll(); ev.killMinions();
        safe(ev.ui, "fade", 1, 0.6, "#000");
        await new Promise((r) => setTimeout(r, 2000));
        ev.teleport({ x: this.c.x, y: this.fy, z: this.c.z + 62 }, Math.PI); ev.heal(); ev.emit("player:respawn", { zone: "finalArena" });
        safe(ev.ui, "fade", 0, 0.8, "#000"); this.cd = 2.5;
      } finally { this.respawning = false; }
    })();
    return true;
  }
  // ---------- tricks ----------
  startTrick() {
    const ev = this.ev, pl = ev.player();
    const list = ["jumpscare", "flashbang", "invert", "roll", "fakeWin", "connection", "gravity", "tilt", "sun", "refill"];
    let k = list[(Math.random() * list.length) | 0];
    if (k === this.lastTrick) k = list[(list.indexOf(k) + 3) % list.length];
    this.lastTrick = k; this.trick = k;
    switch (k) {
      case "jumpscare": this.trickLeft = 1.2; ev.jumpscare("giant"); safe(pl, "setControl", false); break;
      case "flashbang": this.trickLeft = 1.2; this.stage2 = 0; safe(ev.audio, "duck", 1, 1); break; // 1 s of silence first
      case "invert": this.trickLeft = 4; safe(ev.engine.input, "invert", 4); ev.toast("it reaches into your head", "warn", 3); safe(ev.ui, "glitch", 0.4, 0.3); break;
      case "roll": this.trickLeft = 3; ev.rollRate = 2.5; ev.rollTarget = Math.PI; break;
      case "fakeWin": this.trickLeft = 3; safe(ev.ui, "fakeScreen", "youWin", 2.6); break;
      case "connection": this.trickLeft = 2.2; safe(ev.ui, "fakeScreen", "connectionLost", 2); break;
      case "gravity": this.trickLeft = 1.2; pl.gravityMul = -0.22; safe(pl, "knockback", { x: 0, y: 3, z: 0 }); ev.sfx("glitch", pl.position, 0.8); break;
      case "tilt": this.trickLeft = 4; ev.rollRate = 1.5; ev.rollTarget = 0.18; ev.sfx("rumble", pl.position, 0.8); break;
      case "sun": this.trickLeft = 6; ev.pushAtmo("ev.final.dark", "throneDark", 1.5); ev.sfx("hollow_breath", null, 1); break;
      case "refill": this.trickLeft = 2.6; this.core.fakeHp = this.core.hp; ev.sfx("glitch", null, 0.6); break;
    }
  }
  updateTrick(dt) {
    const ev = this.ev, pl = ev.player(); this.trickLeft -= dt;
    if (this.trick === "flashbang" && this.stage2 === 0 && this.trickLeft < 0.2) { this.stage2 = 1; ev.flashbang(); }
    if (this.trick === "tilt") safe(pl, "knockback", { x: 7 * dt, y: 0, z: 0 });
    if (this.trick === "refill") { const f = this.core; f.fakeHp = Math.min(f.maxHp, f.fakeHp + f.maxHp * dt * 0.8); f.emitHp(); }
    if (this.trickLeft <= 0) this.endTrick();
  }
  endTrick() {
    const ev = this.ev, pl = ev.player(); const k = this.trick; this.trick = null;
    if (!k) return;
    if (k === "jumpscare") safe(pl, "setControl", true);
    if (k === "roll" || k === "tilt") { ev.rollTarget = 0; ev.rollRate = 3; }
    if (k === "gravity") pl.gravityMul = 1;
    if (k === "sun") ev.popAtmo("ev.final.dark", 1.5);
    if (k === "refill") { this.core.fakeHp = -1; this.core.emitHp(); }
  }
  // ---------- attacks ----------
  removeRamps() { const ph = this.ev.engine && this.ev.engine.physics; for (const id of this.ramps) { try { ph.remove(id); } catch (e) { /* */ } } this.ramps.length = 0; }
  choose() {
    const hp = this.core.hp, r = Math.random();
    if (hp <= SEG_HP * 4 && r < 0.4) return "reach";
    if (r < 0.3) return "stomp";
    if (r < 0.48) return "sweep";
    if (r < 0.64) return "beam";
    if (r < 0.8) return "shards";
    if (r < 0.9 && this.ev.minionCount() < 4) return "minions";
    return "stomp";
  }
  reachablePoint(x, z, out) {
    // clamp a disc point so the giant's arm (from the shoulder) can actually reach it
    const s = this.shoulder; const dx = x - s.x, dz = z - s.z; const d = Math.sqrt(dx * dx + dz * dz) || 1; const maxD = 30;
    if (d > maxD) { x = s.x + dx / d * maxD; z = s.z + dz / d * maxD; }
    const cdx = x - this.c.x, cdz = z - this.c.z, cd = Math.sqrt(cdx * cdx + cdz * cdz); if (cd > 64) { x = this.c.x + cdx / cd * 64; z = this.c.z + cdz / cd * 64; }
    out.set(x, this.fy, z); return out;
  }
  startAtk(a) {
    const ev = this.ev, g = this.g, pl = ev.player(), pp = pl.position, fy = this.fy;
    this.atk = a; this.atkT = 0; this.stage = 0;
    switch (a) {
      case "stomp": g.play("stomp", 1.6); ev.sfx("rumble", g.position, 1); ev.fx.decal("circle", g.position.x + 4, fy, this.c.z - 66, 8, 0.8); break;
      case "sweep": g.play("sweep", 3.2); this.sweepA = -1.1;
        ev.fx.decal("cone", this.shoulder.x, fy, this.shoulder.z, 34, 1.2, { yaw: 0, half: 1.15 }); ev.sfx("hollow_breath", null, 1); break;
      case "beam": this.beamP.set(pp.x + 8, fy, pp.z + 8); ev.sfx("staff_charge", null, 1); break;
      case "shards": {
        const rec = this.core.rec;
        for (let i = 0; i < 9; i++) {
          const x = i === 0 ? pp.x : pp.x + (Math.random() - 0.5) * 24, z = i === 0 ? pp.z : pp.z + (Math.random() - 0.5) * 24;
          ev.fx.decal("circle", x, fy, z, 1.9, 1.25);
          ev.fx.shoot("shard", x, fy + 31, z, 0, -25, 0, { g: 0, life: 3, radius: 0.5, dmg: 45, rec, floorY: fy, aoe: 1.9, scale: 1.6, source: "shard" });
        }
        g.play("raise", 1.2); ev.sfx("hollow_shriek", null, 0.5); break;
      }
      case "minions": {
        g.play("scream", 1.2);
        for (let i = 0; i < 3; i++) { const a2 = Math.random() * 6.28; ev.spawnRat(this.c.x + Math.sin(a2) * 25, fy, this.c.z + Math.cos(a2) * 25, this.core.rec, 14); }
        for (let i = 0; i < 2; i++) { const a2 = Math.random() * 6.28; ev.spawnShadow(this.c.x + Math.sin(a2) * 30, fy, this.c.z + Math.cos(a2) * 30, this.core.rec, 26); }
        break;
      }
      case "reach": g.play("reach", 1.8); this.reachablePoint(this.c.x + 2, this.c.z - 22, this.tmp); g.setIK(-1, this.tmp.x, fy + 0.05 * g.H, this.tmp.z);
        ev.fx.decal("rect", this.tmp.x, fy, this.tmp.z, 2.5, 1.8, { yaw: Math.PI, length: 18 }); ev.sfx("rumble", null, 1); break;
    }
  }
  runAtk(dt) {
    const ev = this.ev, g = this.g, pl = ev.player(), pp = pl.position, fy = this.fy, rec = this.core.rec;
    this.atkT += dt; const t = this.atkT;
    switch (this.atk) {
      case "stomp":
        if (this.stage === 0 && t > 0.85) {
          this.stage = 1; ev.shake(0.9, 0.9); ev.sfx("land_hard", pp, 1); ev.sfx("collapse", pp, 0.7);
          ev.fx.ring(g.position.x + 4, fy, this.c.z - 66, { speed: 17, maxR: 140, dmg: 45, rec, band: 1.1, height: 1.0 });
        }
        if (this.stage === 1 && t > 1.5) {
          // the palm comes down near you; its core glows for 4 s
          this.stage = 2; this.reachablePoint(pp.x + (Math.random() - 0.5) * 6, pp.z - 4, this.tmp);
          const side = this.tmp.x > g.position.x ? -1 : 1;
          g.play("palm", 1.0); g.setIK(side, this.tmp.x, fy + 0.04 * g.H, this.tmp.z); this.palmSide = side;
          ev.fx.decal("circle", this.tmp.x, fy, this.tmp.z, 6, 0.9); this.palmX = this.tmp.x; this.palmZ = this.tmp.z;
        }
        if (this.stage === 2 && t > 2.45) {
          this.stage = 3; ev.shake(0.7, 0.5); ev.sfx("land_hard", pp, 1);
          if (playerDist(pl, this.palmX, this.palmZ) < 6 && !pl.dodging) ev.hurt(55, rec, "palm", this.palmX, this.palmZ, 10);
          ev.fx.ring(this.palmX, fy, this.palmZ, { speed: 12, maxR: 22, dmg: 30, rec });
          for (const c of g.cores) if (c.name === (this.palmSide > 0 ? "handL" : "handR")) c.glow = 1;
          ev.sfx("heartbeat", null, 0.8);
        }
        if (this.stage === 3 && t > 6.45) { for (const c of g.cores) c.glow = 0; g.clearIK(); g.stop(); this.atk = null; }
        break;
      case "sweep": {
        if (t < 1.2) { this.reachablePoint(this.shoulder.x + Math.sin(-1.1) * 30, this.shoulder.z + Math.cos(-1.1) * 30, this.tmp); g.setIK(-1, this.tmp.x, fy + 0.05 * g.H, this.tmp.z); break; }
        const k = clamp((t - 1.2) / 1.6, 0, 1); this.sweepA = -1.1 + 2.2 * k;
        const hx = this.shoulder.x + Math.sin(this.sweepA) * 30, hz = this.shoulder.z + Math.cos(this.sweepA) * 30;
        g.setIK(-1, hx, fy + 0.03 * g.H, hz);
        if (this.stage === 0) { ev.sfx("whoosh_sword", pp, 1); this.stage = 1; }
        g.jointWorld(10, this.tmp); // right wrist
        if (this.stage === 1 && this.tmp.y < fy + 5 && Math.abs(this.tmp.x - pp.x) < 4.5 && Math.abs(this.tmp.z - pp.z) < 4.5 && pp.y - fy < 1.1 && !pl.dodging) {
          this.stage = 2; ev.hurt(50, rec, "hand", this.tmp.x, this.tmp.z - 6, 12);
        }
        if (Math.random() < 0.5) ev.fx.emit(this.tmp.x, fy + 0.3, this.tmp.z, 0, 2, 0, 0.6, 0.4, 0.1, 0.1, 0.1, 0.8, 4);
        if (k >= 1) { g.clearIK(); g.stop(); this.atk = null; }
        break;
      }
      case "beam": {
        g.headWorld(this.eye); this.eye.z += 0.05 * g.H;
        if (t > 0.8) {
          // the beam point chases you; pillars block it
          const dx = pp.x - this.beamP.x, dz = pp.z - this.beamP.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
          const sp = Math.min(d, 9.5 * dt); this.beamP.x += dx / d * sp; this.beamP.z += dz / d * sp; this.beamP.y = fy + 0.2;
          let ex = this.beamP.x, ey = this.beamP.y, ez = this.beamP.z, blocked = false;
          const ph = ev.engine && ev.engine.physics;
          if (ph) {
            const tx = pp.x - this.eye.x, ty = pp.y + 1 - this.eye.y, tz = pp.z - this.eye.z, tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
            this.tmp.set(tx / tl, ty / tl, tz / tl);
            try { const hit = ph.raycast(this.eye, this.tmp, tl, "ev.tmp.final"); if (hit && hit.dist < tl - 0.5) blocked = true; } catch (e) { /* */ }
          }
          ev.fx.setBeam(true, this.eye.x, this.eye.y, this.eye.z, ex, ey, ez, 0.5 + Math.sin(t * 40) * 0.1);
          if (Math.random() < 0.6) ev.fx.emit(ex, ey, ez, (Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 4, 0.4, 0.25, 1, 0.2, 0.1, 0.9, 6);
          this.beamTick -= dt;
          if (this.beamTick <= 0 && d < 1.8 && !blocked) { this.beamTick = 0.3; ev.hurt(14, rec, "beam", ex, ez, 2); }
        }
        if (t > 6) { ev.fx.setBeam(false); this.atk = null; }
        break;
      }
      case "shards": if (t > 1.6) this.atk = null; break;
      case "minions": if (t > 1.3) this.atk = null; break;
      case "reach":
        if (this.stage === 0 && t > 1.9) {
          // the forearm lies across the disc: a ramp up its arm to the face core
          this.stage = 1; ev.shake(0.7, 0.6); ev.sfx("land_hard", pp, 1);
          const ph = ev.engine && ev.engine.physics; const T = ev.THREE;
          const w = g.jointWorld(10, new T.Vector3()), el = g.jointWorld(9, new T.Vector3()), face = g.cores.find((c) => c.name === "face");
          const fp = face ? face.pos.clone() : g.headWorld(new T.Vector3());
          const top = new T.Vector3(fp.x, Math.max(fy + 1, fp.y - 3.2), fp.z + 3.5);
          w.y = fy + 0.05;
          if (ph) {
            const seg = (a, b) => { const h = Math.hypot(b.x - a.x, b.z - a.z), v = b.y - a.y; return h > 0.5 && Math.abs(v / h) < 0.95; };
            try {
              if (seg(w, el) && seg(el, top) && el.y > fy) { this.ramps.push(ph.addRamp({ from: w, to: el, width: 3.2, surface: "rock", tag: "ev.tmp.final" })); this.ramps.push(ph.addRamp({ from: el, to: top, width: 3.2, surface: "rock", tag: "ev.tmp.final" })); }
              else this.ramps.push(ph.addRamp({ from: w, to: top, width: 3.4, surface: "rock", tag: "ev.tmp.final" }));
              this.ramps.push(ph.addBox({ center: { x: top.x, y: top.y - 0.25, z: top.z }, size: { x: 5, y: 0.5, z: 4 }, tag: "ev.tmp.final", walkable: true, surface: "rock" }));
            } catch (e) { console.warn("[events] ramp", e); }
          }
          if (face) face.glow = 1;
          ev.toast("Climb its arm!", "warn", 2.5);
        }
        if (this.stage === 1 && t > 12) { for (const c of g.cores) c.glow = 0; this.removeRamps(); g.clearIK(); g.stop(); this.atk = null; }
        break;
      default: this.atk = null;
    }
  }
  update(dt) {
    const ev = this.ev, g = this.g, pl = ev.player(); if (!pl) return;
    ev.updateMinions(dt, this.fy);
    if (this.stopped || this.outcome || !this.core.started) return;
    // anchors for the core hittables (kept near the player's reach)
    for (const a of this.anchors) { a.pos.set(a.cr.pos.x, Math.min(a.cr.pos.y - 2.5, Math.max(this.fy, a.cr.pos.y - 3)), a.cr.pos.z); }
    g.yaw = yawTo(g.position.x, g.position.z, pl.position.x, pl.position.z) * 0.35;
    if (this.respawning) return;
    if (this.trick) this.updateTrick(dt);
    else { this.trickT -= dt; if (this.trickT <= 0) { this.trickT = 11 + Math.random() * 8 - this.core.phase * 1.5; this.startTrick(); } }
    if (this.atk) this.runAtk(dt);
    else { this.cd -= dt; if (this.cd <= 0) { this.cd = 1.4 + Math.random() * 1.2 - this.core.phase * 0.2; this.startAtk(this.choose()); } }
  }
  dispose() {
    if (this.core.started && !this.core.done) this.core.finish(false);
    this.stopped = true; this.endTrick(); this.core.clearHittables(); this.removeRamps(); this.g.clearIK();
    for (const c of this.g.cores) c.glow = 0;
    const ev = this.ev; ev.fx.clearAll(); ev.killMinions(); ev.rollTarget = 0; const pl = ev.player(); if (pl) { pl.gravityMul = 1; safe(pl, "setControl", true); }
  }
}

async function run(ev, seq, rematch) {
  ev.setPhase("finalBoss");
  ev.idle.disarm();
  let keepGiant = false;
  seq.defer(() => { if (seq.aborted) safe(ev.ui, "fade", 0, 0.5); if (!keepGiant) { const g = ev.models.giant; if (g) g.setVisible(false); } });
  seq.defer(() => { if (ev.state.player) ev.state.player.lives = 0; safe(ev.ui, "lives", 0); pillars(ev, ev.point("finalArrive"), 0, false); });
  seq.defer(() => ev.postfxReset());
  const c = ev.point("finalArrive"); const ctr = { x: c.x, y: c.y, z: c.z - 50 };
  ev.cine(seq, true);
  await seq.fade(1, rematch ? 0.6 : 1.5, "#fff");
  ev.postfxReset();
  await seq.p(ev.goto("finalArena", c, Math.PI, false));
  const fy = ev.groundY(c.x, c.z, c.y + 40); ctr.y = fy;
  pillars(ev, ctr, fy, true);
  const g = ev.model("giant"); g.setHeight(60); g.stop(); g.clearIK(); g.mode = "idle"; g.speed = 0;
  const gp = ev.point("finalBoss"); g.position.set(gp.x, fy - 82, gp.z); g.yaw = 0; g.setVisible(true);
  for (const cr of g.cores) cr.glow = 0;
  ev.pushMusic("ev.final", "final", 0.5); seq.defer(() => ev.popMusic("ev.final", 1));
  const ctl = ev.takeCam(seq);
  if (ctl) safe(ctl, "set", { x: c.x + 3, y: fy + 2.2, z: c.z + 6 }, { x: gp.x, y: fy + 20, z: gp.z });
  await seq.wait(0.3);
  await seq.fade(0, 1.6, "#fff");
  // it rises out of the white void below the disc
  ev.sfx("rumble", c, 1); ev.shake(0.5, 4);
  const t0 = seq.t;
  await seq.waitWhile(4, () => {
    const k = clamp((seq.t - t0) / 4, 0, 1); g.position.y = fy - 82 + 60 * (1 - (1 - k) * (1 - k));
    if (ctl && Math.random() < 0.1) safe(ctl, "set", { x: c.x + 3, y: fy + 2.2, z: c.z + 6 }, { x: gp.x, y: g.position.y + 50, z: gp.z });
    return true;
  });
  g.position.y = fy - 22;
  g.play("scream", 2); ev.sfx("hollow_shriek", null, 1); ev.shake(0.9, 1.5);
  if (ctl) seq.p(safe(ctl, "move", { x: c.x + 2, y: fy + 3, z: c.z + 9 }, { x: gp.x, y: fy + 30, z: gp.z }, 2));
  await seq.wait(2);
  if (ctl) safe(ctl, "release", 0.8);
  ev.cine(seq, false);
  let rec = 1; try { rec = Math.max(1, Math.round(ev.combat.level() * 2)); } catch (e) { rec = 1; }
  const fight = new FinalFight(ev, seq, g, ctr, fy, rec, rematch);
  fight.shoulder.set(g.position.x, fy + 14, g.position.z + 15);
  ev.fight = fight; seq.defer(() => { if (ev.fight === fight) ev.fight = null; fight.dispose(); });
  ev.setDeath(() => fight.onDeath()); seq.defer(() => ev.setDeath(null));
  // falling off the disc costs a life too (handled by the same death handler via source "fall")
  fight.begin();
  ev.ready();
  await seq.until(() => !!fight.outcome);
  const won = fight.outcome === "win";
  fight.core.finish(won);
  fight.stopped = true; fight.dispose();
  ev.emit("enemy:killed", { id: "hollow3", kind: "hollow3", boss: true, levels: 0, first: !rematch, pos: { x: g.position.x, y: g.position.y, z: g.position.z } });
  let ending;
  if (!rematch) ending = won ? "winners" : "idiot";
  else ending = won && fight.deaths === 0 ? "sigma" : "winners";
  keepGiant = true;
  ev._finalEnding = ending;
  const st = ev.story;
  if (st && typeof st.reachEnding === "function") safe(st, "reachEnding", ending);
  else ev.trigger("end_" + ending);
  return null;
}

export function final(ev, seq) { return run(ev, seq, false); }
export function rematch(ev, seq) { return run(ev, seq, true); }
