// The little girl (DESIGN 9.2): she stops singing, turns her head too far, jumpscare, dissolves into sand; her
// ribbon stays on the sand.
import { safe, clamp } from "./util.js";
import { GirlActor, stopSong } from "./hollowDesert.js";

/** the dropped ribbon (persists through hollow2 and the choice state until picked up or buried) */
export function ensureRibbon(ev) {
  if (!ev.flag("ribbonDropped")) return;
  const owned = (() => { try { return ev.combat && ev.combat.has && ev.combat.has("girls_ribbon"); } catch (e) { return false; } })();
  const buried = ev.state.run.buried && ev.state.run.buried.grave5;
  const rib = ev.model("ribbon");
  if (owned || buried || ev.flag("ribbonTaken")) { rib.visible = false; return; }
  const p = ev.point("girl"); rib.position.set(p.x + 0.3, ev.groundY(p.x, p.z, p.y + 20) + 0.01, p.z + 0.2); rib.visible = true;
  if (ev._ribbonRm) return;
  const rm = ev.interact({ id: "ev.ribbon", pos: rib.position, radius: 2.2, label: "Pick up the ribbon", priority: 4,
    enabled: () => rib.visible,
    onUse: () => {
      rib.visible = false; ev.flag("ribbonTaken", true);
      safe(ev.combat, "give", "girls_ribbon", { equip: false });
      safe(ev.story, "secret", "girlRibbon");
      if (ev._ribbonRm) { const f = ev._ribbonRm; ev._ribbonRm = null; f(); }
    } });
  ev._ribbonRm = rm;
  ev.persist.push(() => { if (ev._ribbonRm) { ev._ribbonRm(); ev._ribbonRm = null; } const r = ev.models.ribbon; if (r) r.visible = false; });
}

export async function girl(ev, seq, opts) {
  ev.setPhase("girl");
  seq.defer(() => { if (seq.aborted) safe(ev.ui, "fade", 0, 0.5); });
  let actor = opts && opts.actor;
  if (!actor || !actor.g.root.visible) {
    if (ev.zone() !== "hollowDesert") { await seq.fade(1, 0.3, "#fff4dc"); }
    const gp = ev.point("girl");
    await seq.p(ev.goto("hollowDesert", { x: gp.x, y: gp.y, z: gp.z + 3 }, Math.PI, false));
    actor = new GirlActor(ev); actor.place();
    safe(ev.ui, "fade", 0, 0.6, "#fff4dc");
  }
  ev.fight = actor; seq.defer(() => { if (ev.fight === actor) ev.fight = null; });
  const g = actor.g;
  seq.defer(() => { g.root.visible = false; });
  ev.cine(seq, true);
  stopSong(ev, 0.15);
  ev.ready();
  const head = g.head; const hp = new ev.THREE.Vector3();
  if (head) head.getWorldPosition(hp); else hp.copy(g.root.position).y += 0.6;
  const pl = ev.player(); const pp = pl.position;
  const ctl = ev.takeCam(seq);
  // stand 2 m from her, look down at her
  const dx = pp.x - g.root.position.x, dz = pp.z - g.root.position.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
  const cx = g.root.position.x + dx / d * 2.1, cz = g.root.position.z + dz / d * 2.1;
  if (ctl) { safe(ctl, "firstPerson", true); seq.p(safe(ctl, "move", { x: cx, y: pp.y + 1.6, z: cz }, { x: hp.x, y: hp.y, z: hp.z }, 1.2)); }
  g.root.rotation.y = Math.atan2(dx, dz);
  // silence
  safe(ev.audio, "duck", 0.9, 1.5);
  await seq.wait(1.5);
  // her head turns... and keeps turning
  actor.crying = false; actor.headTurn = 0;
  ev.sfx("creak", g.root.position, 0.8);
  const t0 = seq.t;
  await seq.waitWhile(1.6, () => {
    const k = clamp((seq.t - t0) / 1.6, 0, 1);
    actor.headTurn = (k < 0.5 ? k * k * 2 : 0.5 + (k - 0.5)) * 2.9; actor.headTilt = k * 0.5;
    return true;
  });
  g.mask.visible = true; for (const e of g.eyes) e.visible = true;
  ev.sfx("hollow_breath", g.root.position, 1);
  await seq.wait(0.25);
  await seq.p(ev.jumpscare("girl"));
  // she becomes sand and blows away
  const gpos = g.root.position;
  for (let i = 0; i < 4; i++) ev.fx.burst(gpos.x, gpos.y + 0.2 + i * 0.25, gpos.z, 40, 2.2, 0.82, 0.72, 0.55, 2.4, 0.12, -0.4, 0.6);
  ev.sfx("sand_hiss", gpos, 1);
  g.root.visible = false;
  ev.flag("ribbonDropped", true);
  ensureRibbon(ev);
  await seq.wait(1.5);
  if (ctl) { safe(ctl, "firstPerson", false); safe(ctl, "release", 1.0); }
  ev.cine(seq, false);
  return "hollow2";
}
