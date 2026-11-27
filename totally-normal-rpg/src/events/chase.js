// The chase (DESIGN 8.5 legs 1-2): forest trail at night, then the desert in a night sandstorm.
// The creature follows just below sprint speed; trees / cacti crash across the path (jumpable hurdles).
import { safe, clamp, distXZ } from "./util.js";
import { savePortal, getDoorLight } from "./postking.js";
import { resources } from "./monsters.js";

let propGeo = null;
function propGeos(ev) {
  if (propGeo) return propGeo;
  const T = ev.THREE;
  const trunk = new T.CylinderGeometry(0.22, 0.4, 14, 8); trunk.translate(0, 7, 0);
  const crown = new T.ConeGeometry(2.2, 7, 8); crown.translate(0, 10.5, 0);
  const crown2 = new T.ConeGeometry(1.6, 5, 8); crown2.translate(0, 13.5, 0);
  const cac = new T.CylinderGeometry(0.34, 0.4, 5.2, 10); cac.translate(0, 2.6, 0);
  const arm = new T.CylinderGeometry(0.2, 0.22, 1.8, 8); arm.translate(0, 0.9, 0);
  const getM = (n, c) => { try { const m = ev.engine.materials.get(n); if (m) return m; } catch (e) { /* */ } return new T.MeshStandardMaterial({ color: c, roughness: 0.9 }); };
  propGeo = { trunk, crown, crown2, cac, arm, bark: getM("bark", 0x4a3a2a), leaves: getM("leaves", 0x22351f), cactus: getM("cactus", 0x4c6a3a) };
  return propGeo;
}

/** a tree/cactus that tips across the path, then becomes a low hurdle collider */
class Faller {
  constructor(ev, kind) {
    const T = ev.THREE, g = propGeos(ev);
    this.ev = ev; this.kind = kind;
    this.pivot = new T.Group(); this.pivot.visible = false; ev.scene.add(this.pivot);
    if (kind === "tree") {
      const a = new T.Mesh(g.trunk, g.bark), b = new T.Mesh(g.crown, g.leaves), c = new T.Mesh(g.crown2, g.leaves);
      a.castShadow = b.castShadow = true; this.pivot.add(a, b, c);
    } else {
      const a = new T.Mesh(g.cac, g.cactus); a.castShadow = true; this.pivot.add(a);
      const l = new T.Mesh(g.arm, g.cactus); l.position.set(0.32, 2.2, 0); l.rotation.z = -0.25; this.pivot.add(l);
      const r = new T.Mesh(g.arm, g.cactus); r.position.set(-0.32, 3.0, 0); r.rotation.z = 0.3; this.pivot.add(r);
    }
    this.state = 0; this.t = 0; this.cid = null; this.along = 0; this.sign = 1; this.axis = "x"; this.y = 0;
  }
  place(axis, along, side, y) {
    this.axis = axis; this.along = along; this.sign = side; this.y = y; this.state = 0; this.t = 0;
    const p = this.pivot; p.visible = true; p.rotation.set(0, 0, 0);
    if (axis === "x") p.position.set(along, y, side * 4.6); else p.position.set(side * 4.6, y, along);
    this.removeCollider();
  }
  removeCollider() { if (this.cid !== null) { try { this.ev.engine.physics.remove(this.cid); } catch (e) { /* */ } this.cid = null; } }
  hide() { this.pivot.visible = false; this.removeCollider(); this.state = 0; }
  fall() { if (this.state === 0) { this.state = 1; this.t = 0; this.ev.sfx(this.kind === "tree" ? "tree_fall" : "rock_tumble", this.pivot.position, 1); } }
  update(dt) {
    if (this.state !== 1) return;
    this.t += dt; const k = clamp(this.t / 1.05, 0, 1); const a = k * k * (Math.PI * 0.5);
    if (this.axis === "x") this.pivot.rotation.x = -this.sign * a; else this.pivot.rotation.z = this.sign * a;
    if (k >= 1) {
      this.state = 2; const ev = this.ev;
      ev.shake(0.25, 0.4);
      const p = this.pivot.position;
      ev.fx.burst(this.axis === "x" ? p.x : 0, this.y + 0.4, this.axis === "x" ? 0 : p.z, 26, 4, 0.35, 0.3, 0.25, 1, 0.35, 6, 1);
      // landing on the player hurts a little and knocks them back
      const pl = ev.player();
      const d = this.axis === "x" ? Math.abs(pl.position.x - p.x) : Math.abs(pl.position.z - p.z);
      if (d < 0.9) ev.hurt(12, 1, "tree", this.axis === "x" ? p.x + 3 : 0, this.axis === "x" ? 0 : p.z - 3, 6);
      try {
        const ph = ev.engine.physics;
        const c = this.axis === "x" ? { x: p.x, y: this.y + 0.36, z: 0 } : { x: 0, y: this.y + 0.36, z: p.z };
        const s = this.axis === "x" ? { x: 0.75, y: 0.72, z: 9 } : { x: 9, y: 0.72, z: 0.75 };
        this.cid = ph.addBox({ center: c, size: s, tag: "ev.tmp.chase", walkable: true, surface: this.kind === "tree" ? "wood" : "sand" });
      } catch (e) { this.cid = null; }
    }
  }
}

class ChaseLeg {
  /** o: { axis:"x"|"z", start:{x,y,z}, yaw, dirSign, obstacles:[along offsets], kind, behind, storm } */
  constructor(ev, seq, o) {
    this.ev = ev; this.seq = seq; this.o = o; this.cr = ev.model("creature"); this.resetting = false; this.t = 0;
    this.fallers = []; this.stepT = 0; this.crawlT = 4; this.crawl = 0; this.caught = 0;
    const n = o.obstacles.length;
    ev._fallers = ev._fallers || {};
    const pool = ev._fallers[o.kind] || (ev._fallers[o.kind] = []);
    while (pool.length < n) pool.push(new Faller(ev, o.kind));
    for (let i = 0; i < n; i++) this.fallers.push(pool[i]);
    this.core = null;
    this.reset(false);
  }
  along(p) { return this.o.axis === "x" ? (p.x - this.o.start.x) * this.o.dirSign : (p.z - this.o.start.z) * this.o.dirSign; }
  reset(teleport) {
    const o = this.o, ev = this.ev;
    if (teleport) { ev.teleport(o.start, o.yaw); ev.heal(); }
    for (let i = 0; i < this.fallers.length; i++) {
      const a = o.obstacles[i]; const side = i % 2 ? 1 : -1;
      const w = o.axis === "x" ? o.start.x + a * o.dirSign : o.start.z + a * o.dirSign;
      const y = o.axis === "x" ? ev.groundY(w, side * 4.6) : ev.groundY(side * 4.6, w);
      this.fallers[i].place(o.axis, w, side, y);
    }
    const cr = this.cr; cr.setHeight(2.9); cr.ceiling = 0; cr.setVisible(true); cr.mode = "run"; cr.speed = 6;
    if (o.axis === "x") cr.position.set(o.start.x - o.behind * o.dirSign, 0, o.start.z + 1.5);
    else cr.position.set(o.start.x + 1.5, 0, o.start.z - o.behind * o.dirSign);
    cr.position.y = ev.groundY(cr.position.x, cr.position.z, 100);
  }
  async catchPlayer() {
    if (this.resetting) return; this.resetting = true; const ev = this.ev;
    try {
      ev.sfx("hollow_shriek", this.cr.position, 0.9);
      ev.shake(0.4, 0.4);
      safe(ev.ui, "fade", 1, 0.25, "#000");
      await new Promise((r) => setTimeout(r, 350));
      if (this.seq.aborted) return;
      this.reset(true);
      await new Promise((r) => setTimeout(r, 250));
      safe(ev.ui, "fade", 0, 0.35, "#000");
    } finally { this.resetting = false; }
  }
  update(dt) {
    if (this.resetting) return;
    const ev = this.ev, pl = ev.player(), cr = this.cr, o = this.o; if (!pl) return;
    this.t += dt;
    const pp = pl.position; const prog = this.along(pp);
    for (let i = 0; i < this.fallers.length; i++) {
      const f = this.fallers[i]; if (f.state === 0 && prog > o.obstacles[i] - 21) f.fall(); f.update(dt);
    }
    // creature pursuit (rubber-banded so it is always right there)
    const dx = pp.x - cr.position.x, dz = pp.z - cr.position.z; const d = Math.sqrt(dx * dx + dz * dz) || 1;
    this.crawlT -= dt;
    if (this.crawlT <= 0) { this.crawl = this.crawl > 0 ? 0 : 1; this.crawlT = this.crawl ? 1.6 + Math.random() : 3.5 + Math.random() * 2.5; }
    let sp = this.crawl ? 8.1 : 7.3; if (d > 24) sp = 10.5; if (d < 5) sp = 7.6;
    if (this.t < 1.0) sp = 2; // a beat before it runs
    cr.mode = this.crawl && this.t > 1 ? "crawl" : "run"; cr.speed = sp;
    cr.position.x += dx / d * sp * dt; cr.position.z += dz / d * sp * dt;
    cr.position.y = ev.groundY(cr.position.x, cr.position.z, cr.position.y + 3);
    cr.yaw = Math.atan2(dx, dz);
    this.stepT -= dt; if (this.stepT <= 0) { this.stepT = cr.mode === "crawl" ? 0.17 : 0.3; ev.sfx("hollow_step", cr.position, 0.8); }
    safe(ev.audio, "heartbeat", clamp(1 - d / 30, 0.25, 1));
    if (d < 1.9 && this.t > 1.2) this.catchPlayer();
    // sandstorm
    if (o.storm) {
      const n = ev.quality() <= 0 ? 2 : 6;
      for (let k = 0; k < n; k++) {
        ev.fx.emit(pp.x + (Math.random() - 0.5) * 30, pp.y + Math.random() * 6, pp.z + (Math.random() - 0.5) * 30,
          -9 - Math.random() * 6, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 3, 1.4, 0.06 + Math.random() * 0.08,
          0.55, 0.42, 0.3, 0.55, 0);
      }
    }
  }
  dispose() { for (const f of this.fallers) f.hide(); }
}

export async function chase(ev, seq) {
  ev.setPhase("chase");
  const T = ev.THREE;
  ev.pushMusic("ev.chase", "chase", 0.5); seq.defer(() => ev.popMusic("ev.chase", 1.5));
  seq.defer(() => { safe(ev.audio, "heartbeat", 0); const cr = ev.models.creature; if (cr) cr.setVisible(false); });
  seq.defer(() => ev.popAtmo("ev.night", 1));
  seq.defer(() => { if (seq.aborted) safe(ev.ui, "fade", 0, 0.5); });
  const door = ev.point("forestHouseDoorOut");
  if (ev.zone() !== "forestHouse" && ev.zone() !== "forest") {
    await seq.p(ev.goto("forestHouse", { x: door.x + 5, y: door.y, z: door.z }, Math.PI / 2, false));
  }
  if (!ev.atmoTags.has("ev.night")) ev.pushAtmo("ev.night", "forestNight", 0.5);
  // ---------------- leg 1: forest trail, running east ----------------
  const pl = ev.player();
  const start1 = { x: pl.position.x, y: pl.position.y, z: 0 };
  if (Math.abs(pl.position.z) > 3) { start1.z = 0; start1.x = door.x + 5; }
  start1.y = ev.groundY(start1.x, start1.z, start1.y + 3);
  const fb = savePortal(ev, "forestBack");
  let entered1 = false;
  const fbPos = { x: Math.min(start1.x + 120, -1746), y: 0, z: 0 }; fbPos.y = ev.groundY(fbPos.x, 0);
  if (fb) { safe(fb, "setPos", fbPos); safe(fb, "setActive", true); fb.onEnter = () => { entered1 = true; }; }
  seq.defer(() => { if (fb) fb.onEnter = null; });
  ev.target = new T.Vector3(fbPos.x, fbPos.y + 1.5, fbPos.z); seq.defer(() => { ev.target = null; });
  seq.defer(() => { getDoorLight(ev).intensity = 0; });
  let leg = new ChaseLeg(ev, seq, { axis: "x", dirSign: 1, start: start1, yaw: Math.PI / 2, obstacles: [26, 50, 74, 96],
    kind: "tree", behind: 12, storm: false });
  ev.fight = leg; seq.defer(() => { if (ev.fight && ev.fight.dispose) safe(ev.fight, "dispose"); ev.fight = null; });
  // keep the creature 12 m off: it was placed by forestNight; let the leg take over from there
  ev.setDeath(() => { leg.catchPlayer(); return true; }); seq.defer(() => ev.setDeath(null));
  ev.ready();
  await seq.until(() => entered1 || !fb);
  // ---------------- leg 2: the desert at night, sandstorm, the way home is 100 m ahead ----------------
  if (leg) { leg.dispose(); }
  getDoorLight(ev).intensity = 0;
  await seq.fade(1, 0.2, "#000");
  ev.popAtmo("ev.night", 0.1);
  const db = savePortal(ev, "desertBack");
  const dbDefault = (ev._portalOrig && ev._portalOrig.desertBack) || ev.point("desertBackPortal");
  const start2 = { x: dbDefault.x, y: 0, z: dbDefault.z - 100 }; start2.y = ev.groundY(start2.x, start2.z);
  await seq.p(ev.goto("desert", start2, 0, false));
  ev.pushAtmo("ev.storm", "desertNight", 0.1); seq.defer(() => ev.popAtmo("ev.storm", 1));
  ev.postfx({ grain: 0.35, vignette: 0.55 }); seq.defer(() => ev.postfxReset());
  let entered2 = false;
  if (db) { safe(db, "setPos", dbDefault); safe(db, "setActive", true); db.onEnter = () => { entered2 = true; }; }
  seq.defer(() => { if (db) db.onEnter = null; });
  ev.target = new T.Vector3(dbDefault.x, dbDefault.y + 1.5, dbDefault.z);
  leg = new ChaseLeg(ev, seq, { axis: "z", dirSign: 1, start: start2, yaw: 0, obstacles: [22, 44, 63, 82], kind: "cactus",
    behind: 14, storm: true });
  ev.fight = leg;
  const wind = safe(ev.audio, "loop", "wind", { vol: 0.9 }); seq.defer(() => { if (wind) safe(wind, "stop", 1); });
  await seq.wait(0.25);
  await seq.fade(0, 0.5, "#000");
  await seq.until(() => entered2 || !db);
  leg.dispose();
  ev.fight = null;
  await seq.fade(1, 0.25, "#000");
  return "collapse";
}
export { distXZ, resources };
