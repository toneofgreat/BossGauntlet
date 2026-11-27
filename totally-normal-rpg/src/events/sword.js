// The liquid sword (DESIGN 9.3 end) and the `choice` state (9.4): the black sword in the sand, the idle watcher armed.
import { safe, clamp } from "./util.js";
import { ensureRibbon } from "./girl.js";
import { ringRaise } from "./hollow2.js";

export function swordPos(ev, out) {
  const c = ev.point("hollowArena");
  let x = ev.flag("swordX"), z = ev.flag("swordZ");
  if (typeof x !== "number" || typeof z !== "number") { x = c.x; z = c.z; }
  const dx = x - c.x, dz = z - c.z, d = Math.sqrt(dx * dx + dz * dz);
  if (d > 40) { x = c.x + dx / d * 40; z = c.z + dz / d * 40; }
  const o = out || { x: 0, y: 0, z: 0 }; o.x = x; o.z = z; o.y = ev.groundY(x, z, c.y + 30); return o;
}
export function hideSword(ev) { const s = ev.models.sword; if (s) s.root.visible = false; }
function showSolidSword(ev) {
  const s = ev.model("sword"); const p = swordPos(ev);
  s.root.position.set(p.x, p.y, p.z); s.root.rotation.set(0, 0.4, 0); s.root.visible = true;
  s.u.uSolid.value = 1; s.u.uRust.value = 0; s.u.uDissolve.value = 0; s.setStage(0.35, 1);
  return s;
}

export async function liquidSword(ev, seq) {
  ev.setPhase("hollow2");
  seq.defer(() => { if (seq.aborted) safe(ev.ui, "fade", 0, 0.5); });
  const h = ev.model("armored"); const s = ev.model("sword");
  const p = swordPos(ev);
  ev.cine(seq, true);
  const ctl = ev.takeCam(seq);
  const pl = ev.player(); const pp = pl.position;
  const dx = pp.x - p.x, dz = pp.z - p.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
  const camP = { x: p.x + dx / d * 13, y: p.y + 5, z: p.z + dz / d * 13 };
  if (ctl) seq.p(safe(ctl, "move", camP, { x: p.x, y: p.y + 3, z: p.z }, 1.5));
  // it sinks to its knees
  h.setVisible(true); h.stop(); h.mode = "kneel"; h.position.set(p.x, p.y, p.z); h.shieldUp = 0;
  ev.sfx("armor_clank", h.position, 1); ev.shake(0.4, 0.6);
  await seq.wait(1.8);
  // ...and melts into black liquid
  ev.sfx("melt", h.position, 1);
  s.root.position.set(p.x, p.y, p.z); s.root.rotation.set(0, 0.4, 0); s.root.visible = true;
  s.u.uSolid.value = 0; s.u.uRust.value = 0; s.u.uDissolve.value = 0; s.setStage(0.01, 0);
  if (ctl) seq.p(safe(ctl, "move", { x: p.x + dx / d * 6, y: p.y + 2.6, z: p.z + dz / d * 6 }, { x: p.x, y: p.y + 0.8, z: p.z }, 3));
  let t0 = seq.t;
  await seq.waitWhile(3.2, () => {
    const k = clamp((seq.t - t0) / 3.2, 0, 1);
    h.melt = k; s.setStage(k, 0);
    if (Math.random() < 0.5) ev.fx.emit(p.x + (Math.random() - 0.5) * 3 * k, p.y + 0.2, p.z + (Math.random() - 0.5) * 3 * k, 0, 0.6, 0, 0.6, 0.12, 0.02, 0.02, 0.03, 0.9, 0);
    return true;
  });
  h.setVisible(false); h.melt = 0;
  await seq.wait(0.8);
  // the pool rises and pulls itself into the shape of a sword, point-down in the sand
  ev.sfx("melt", p, 0.8);
  t0 = seq.t;
  await seq.waitWhile(2.6, () => {
    const k = clamp((seq.t - t0) / 2.6, 0, 1); const e = k * k * (3 - 2 * k);
    s.setStage(1 - e * 0.65, e);
    return true;
  });
  await seq.wait(0.3);
  // it turns solid: glossy black blade, faint red edge
  ev.sfx("solidify", p, 1);
  t0 = seq.t;
  await seq.waitWhile(1.3, () => { s.u.uSolid.value = clamp((seq.t - t0) / 1.3, 0, 1); return true; });
  s.u.uSolid.value = 1;
  ringRaise(ev, false);
  const hp = ev.portal("homePortal"); if (hp) safe(hp, "setActive", true);
  await seq.wait(1.2);
  if (ctl) safe(ctl, "release", 1);
  ev.cine(seq, false);
  ev.setPhase("choice");
  safe(ev.save || ev.ctx.save, "snapshotChoice");
  return { id: "choice", opts: { enter: false, fresh: true } };
}

export async function choice(ev, seq, opts) {
  if (ev.phase() !== "choice") ev.setPhase("choice");
  seq.defer(() => { if (seq.aborted && seq._faded) safe(ev.ui, "fade", 0, 0.5); });
  const p = swordPos(ev);
  if (opts && opts.enter) {
    seq._faded = true;
    if (ev.zone() !== "hollowDesert") await seq.fade(1, 0.6, "#000");
    else safe(ev.ui, "fade", 1, 0.3, "#000");
    if (ev.state.player) ev.state.player.lives = 0; safe(ev.ui, "lives", 0);
    ev.postfxReset();
    await seq.p(ev.goto("hollowDesert", { x: p.x, y: p.y, z: p.z + 4 }, Math.PI, false));
  }
  ev.hideMonsters();
  const s = showSolidSword(ev);
  const hp = ev.portal("homePortal"); if (hp) safe(hp, "setActive", true);
  ensureRibbon(ev);
  ev.target = null;
  let taking = false;
  const rm = ev.interact({ id: "ev.blackSword", pos: s.root.position, radius: 2.6, label: "Take the sword", priority: 8,
    enabled: () => !taking && ev.phase() === "choice",
    onUse: async () => {
      taking = true;
      let r = 1; try { r = await (ev.ui && ev.ui.confirm ? ev.ui.confirm("Are you sure?", ["Take it", "Leave it"]) : Promise.resolve(0)); } catch (e) { r = 1; }
      if (r === 0 && ev.phase() === "choice") { const st = ev.story; if (st && st.reachEnding) safe(st, "reachEnding", "monster"); else ev.trigger("end_monster"); }
      else taking = false;
    } });
  seq.defer(rm);
  ev.idle.arm(); seq.defer(() => ev.idle.disarm());
  if (opts && opts.enter) { await seq.wait(0.3); await seq.fade(0, 1.2, "#000"); seq._faded = false; }
  // the "What now?" toast is STORY's (it shows it whenever the choice phase is entered)
  ev.ready();
  // the sword pulses; the choice stays open until an ending (or the idle) takes over
  await seq.until(() => ev.phase() !== "choice");
  return null;
}
