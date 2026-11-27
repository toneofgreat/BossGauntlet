// Cycle 1: the forest-house door opens onto "a desert again" (DESIGN 9.1-9.2 setup): the crying girl on the dune.
import { safe } from "./util.js";

/** keeps the girl animated while she is visible (registered as the frame updater) */
export class GirlActor {
  constructor(ev) {
    this.ev = ev; this.g = ev.model("girl"); this.t = 0; this.sobT = 3; this.core = null; this.crying = true; this.headTurn = 0; this.headTilt = 0;
  }
  place() {
    const ev = this.ev, g = this.g, p = ev.point("girl");
    g.root.position.set(p.x, ev.groundY(p.x, p.z, p.y + 20), p.z); g.root.rotation.set(0, 0, 0); g.root.visible = true; g.root.scale.set(1, 1, 1);
    g.mask.visible = false; for (const e of g.eyes) e.visible = false;
    if (g.h) { safe(g.h, "setVisible", true); safe(g.h, "play", "sitCry", { loop: true }); }
    this.crying = true; this.headTurn = 0; this.headTilt = 0;
  }
  update(dt) {
    const ev = this.ev, g = this.g; if (!g.root.visible) return;
    this.t += dt;
    if (g.h) {
      try { g.h.update(dt, 0, false); } catch (e) { /* */ }
      // the action pose owns the bones while crying; afterwards the head bone is turned on top of it
      if (!this.crying && g.headBone) { g.headBone.rotation.x = 0.1; g.headBone.rotation.y = this.headTurn; g.headBone.rotation.z = this.headTilt; }
    } else if (g.head) {
      if (this.crying) {
        // face hidden in her knees, small shaking sobs
        g.head.rotation.x = 0.85 + Math.sin(this.t * 7) * 0.03 * (0.5 + 0.5 * Math.sin(this.t * 0.9));
        g.head.rotation.y = 0; g.head.rotation.z = 0;
      } else { g.head.rotation.x = 0.1; g.head.rotation.y = this.headTurn; g.head.rotation.z = this.headTilt; }
    }
    if (this.crying) { this.sobT -= dt; if (this.sobT <= 0) { this.sobT = 6 + Math.random() * 5; ev.sfx("sob", g.root.position, 0.5); } }
  }
  dispose() {}
}

export function startSong(ev) {
  if (ev.girlSong) return ev.girlSong;
  const g = ev.model("girl"); const p = g.root.position;
  ev.girlSong = safe(ev.audio, "song", "girl", { pos: { x: p.x, y: p.y + 0.6, z: p.z } }) || null;
  return ev.girlSong;
}
export function stopSong(ev, fade = 0.2) { if (ev.girlSong) { safe(ev.girlSong, "stop", fade); ev.girlSong = null; } }

export async function hollowDesert(ev, seq) {
  ev.setPhase("hollowDesert");
  seq.defer(() => { if (seq.aborted) { safe(ev.ui, "fade", 0, 0.5); stopSong(ev, 0.5); const g = ev.models.girl; if (g) g.root.visible = false; } });
  ev.cine(seq, true);
  ev.sfx("door_open", ev.player().position, 1);
  await seq.fade(1, 0.7, "#fff4dc");
  await seq.p(ev.goto("hollowDesert", ev.point("hollowArrive"), Math.PI, false));
  const actor = new GirlActor(ev); actor.place();
  ev.fight = actor; seq.defer(() => { if (ev.fight === actor) ev.fight = null; });
  startSong(ev);
  ev.setDeath(() => { const a = ev.point("hollowArrive"); ev.teleport(a, Math.PI); ev.heal(); ev.emit("player:respawn", { zone: "hollowDesert" }); return true; });
  seq.defer(() => ev.setDeath(null));
  await seq.wait(0.4);
  await seq.fade(0, 2.2, "#fff4dc");
  ev.cine(seq, false);
  const gp = ev.point("girl");
  ev.target = new ev.THREE.Vector3(gp.x, gp.y + 1, gp.z); seq.defer(() => { ev.target = null; });
  ev.ready();
  let used = false;
  const rm = ev.interact({ id: "ev.girl", pos: actor.g.root.position, radius: 3.0, label: "Say hi", priority: 6,
    enabled: () => !used, onUse: () => { used = true; } });
  seq.defer(rm);
  await seq.until(() => used);
  return { id: "girl", opts: { actor } };
}
