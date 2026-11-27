// Post-King unravelling (DESIGN 8.1 - 8.4) and the cycle transitions (ngReset, ngShortcut).
import { safe, clamp, clampToCircle, phaseIdx } from "./util.js";

const DESERT_C = { x: 0, z: -2000 };

// ---------------------------------------------------------------- run-state appliers (also used on CONTINUE)
export function savePortal(ev, id) {
  const p = ev.portal(id); if (!p) return null;
  ev._portalOrig = ev._portalOrig || {};
  if (!ev._portalOrig[id] && p.pos) ev._portalOrig[id] = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
  return p;
}
export function restorePortals(ev) {
  const ids = ["lobbyBack", "desertBack", "desertExit", "forestBack", "homePortal"];
  for (const id of ids) {
    const p = ev.portal(id); if (!p) continue;
    try { p.onEnter = null; } catch (e) { /* */ }
    const o = ev._portalOrig && ev._portalOrig[id];
    if (o) { safe(p, "setPos", o); }
  }
  ev._portalOrig = {};
  if (ev._ngDoor) { try { ev._ngDoor(); } catch (e) { /* */ } ev._ngDoor = null; }
}
export function applySeal(ev) {
  ev.flag("sealBroken", true);
  const lb = ev.portal("lobbyBack"); if (lb) safe(lb, "setActive", true);
  const bram = ev.world && safe(ev.world, "npc", "bram"); if (bram) safe(bram, "setVisible", false);
  // the walk restarts after a resume (D4.10): the exit portal must be found again
  if (ev.phase() === "postKing") {
    ev.flag("desertExitPlaced", false);
    const ex = ev.portal("desertExit"); if (ex) safe(ex, "setActive", false);
  }
}
export function applyNgOpen(ev) {
  ev.flag("ngOpen", true);
  const lb = ev.portal("lobbyBack"); if (lb) safe(lb, "setActive", true);
  const ex = ev.portal("desertExit");
  if (ex) { safe(ex, "setPos", ev.point("desertExitNg")); safe(ex, "setActive", true); try { ex.onEnter = null; } catch (e) { /* */ } }
  if (!ev._ngDoor) {
    const rm = ev.interact({ id: "ev.forestHouseDoorFront", pos: ev.point("forestHouseDoorFront"), radius: 2.6, label: "Open the door",
      priority: 5,
      enabled: () => ev.cycle() >= 1 && ev.phase() === "ngPostKing" && ev.active !== "hollowDesert",
      onUse: () => { ev.trigger("hollowDesert"); } });
    ev._ngDoor = rm; ev.persist.push(() => { if (ev._ngDoor === rm) ev._ngDoor = null; rm(); });
  }
}

function unfadeOnAbort(ev, seq) { seq.defer(() => { if (seq.aborted) safe(ev.ui, "fade", 0, 0.5); }); }

// ---------------------------------------------------------------- postKing
export async function postKing(ev, seq) {
  if (ev.cycle() !== 0) return "ngShortcut";
  ev.setPhase("postKing");
  applySeal(ev);
  ev.onZone(ev.zone());
  ev.target = null;
  ev.ready();
  // the lobby greets you changed: a low tone, the empty chair rocking
  await seq.until(() => ev.zone() === "lobby");
  ev.onZone("lobby");
  safe(ev.audio, "sfx", "rumble", { vol: 0.6 });
  const chair = ev.world && safe(ev.world, "prop", "lobbyRockingChair");
  if (chair) { const p = ev._v || (ev._v = new ev.THREE.Vector3()); chair.getWorldPosition(p); ev.sfx("chair_creak", p, 0.8); }
  await seq.wait(2.5);
  ev.sfx("portal_hum", ev.point("lobbyBack"), 0.7);
  return null;
}

// ---------------------------------------------------------------- desert (~1 min of walking)
export async function desert(ev, seq) {
  if (ev.cycle() !== 0) return null;
  ev.setPhase("desert");
  if (ev.zone() !== "desert") await seq.p(ev.goto("desert", ev.point("desertArrive"), Math.PI, true));
  const arrive = ev.point("desertArrive");
  ev.setDeath(() => { respawnAt(ev, arrive, Math.PI); return true; }); seq.defer(() => ev.setDeath(null));
  ev.ready();
  const ex = savePortal(ev, "desertExit");
  if (!ev.flag("desertExitPlaced")) {
    await seq.walkSeconds(60, () => ev.zone() === "desert");
    const pl = ev.player(); const T = ev.THREE;
    const f = new T.Vector3(); if (pl && pl.forward) pl.forward(f); else f.set(0, 0, -1);
    f.y = 0; if (f.lengthSq() < 0.01) f.set(0, 0, -1); f.normalize();
    const pos = { x: pl.position.x + f.x * 70, y: 0, z: pl.position.z + f.z * 70 };
    clampToCircle(pos, DESERT_C.x, DESERT_C.z, 300);
    pos.y = ev.groundY(pos.x, pos.z);
    if (ex) { safe(ex, "setPos", pos); safe(ex, "setActive", true); try { ex.onEnter = null; } catch (e) { /* */ } }
    ev.flag("desertExitPlaced", true);
    ev.flag("desertExitPos", pos.x + "," + pos.z);
    ev.sfx("portal_hum", pos, 0.9);
    ev.target = new T.Vector3(pos.x, pos.y + 1.5, pos.z);
  }
  await seq.until(() => ev.zone() === "forest");
  return null;
}

function respawnAt(ev, p, yaw) {
  safe(ev.ui, "fade", 1, 0.3);
  ev.after(0.35, () => { ev.teleport(p, yaw); ev.heal(); ev.emit("player:respawn", { zone: ev.zone() }); safe(ev.ui, "fade", 0, 0.6); });
}

// ---------------------------------------------------------------- forest (60 s quiet, creepy music, 60 s -> house)
export async function forest(ev, seq) {
  if (ev.cycle() !== 0) return null;
  ev.setPhase("forest");
  ev.target = null;
  if (ev.zone() !== "forest") await seq.p(ev.goto("forest", ev.point("forestArrive"), -Math.PI / 2, true));
  const arrive = ev.point("forestArrive");
  ev.setDeath(() => { respawnAt(ev, arrive, -Math.PI / 2); return true; }); seq.defer(() => ev.setDeath(null));
  unfadeOnAbort(ev, seq);
  ev.ready();
  const inForest = () => ev.zone() === "forest";
  await seq.waitWhile(60, inForest);
  ev.pushMusic("ev", "forestCreep", 3);
  seq.defer(() => ev.popMusic("ev", 1));
  ev.sfx("crow", ev.player().position, 0.5);
  await seq.waitWhile(60, inForest);
  ev.cine(seq, true);
  await seq.fade(1, 2, "#000");
  await seq.p(ev.goto("forestHouse", ev.point("forestHouseInside"), Math.PI / 2, false));
  return "forestHouse";
}

// ---------------------------------------------------------------- forest house: you wake inside
export async function forestHouse(ev, seq) {
  ev.setPhase("forestHouse");
  ev.popMusic("ev", 1);
  unfadeOnAbort(ev, seq);
  ev.cine(seq, true);
  if (ev.zone() !== "forestHouse") {
    await seq.fade(1, 0.4, "#000");
    await seq.p(ev.goto("forestHouse", ev.point("forestHouseInside"), Math.PI / 2, false));
  }
  const ctl = ev.takeCam(seq);
  if (ctl) safe(ctl, "firstPerson", true);
  safe(ev.audio, "sfx", "rain", { vol: 0.5 });
  await seq.wait(1.2);
  await seq.fade(0, 2.5, "#000");
  ev.sfx("chair_creak", ev.player().position, 0.6);
  await seq.wait(1.5);
  if (ctl) { safe(ctl, "firstPerson", false); safe(ctl, "release", 1.0); }
  ev.cine(seq, false);
  ev.target = (function () { const p = ev.point("forestHouseDoorOut"); return new ev.THREE.Vector3(p.x, p.y + 1.2, p.z); })();
  ev.ready();
  let used = false;
  const rm = ev.interact({ id: "ev.houseDoor", pos: ev.point("forestHouseDoorOut"), radius: 2.4, label: "Go outside", priority: 5,
    enabled: () => !used, onUse: () => { used = true; } });
  seq.defer(rm);
  await seq.until(() => used);
  return "forestNight";
}

// ---------------------------------------------------------------- outside into the dark -> jumpscare
let doorLight = null;
export function getDoorLight(ev) {
  if (!doorLight) {
    doorLight = new ev.THREE.PointLight(0xffa860, 0, 14, 2); doorLight.castShadow = false;
    ev.scene.add(doorLight);
  }
  return doorLight;
}
export async function forestNight(ev, seq) {
  ev.setPhase("forestHouse");
  unfadeOnAbort(ev, seq);
  const T = ev.THREE;
  if (ev.zone() !== "forestHouse") {
    await seq.fade(1, 0.3, "#000");
    await seq.p(ev.goto("forestHouse", ev.point("forestHouseInside"), Math.PI / 2, false));
  }
  ev.cine(seq, true);
  await seq.fade(1, 0.25, "#000");
  ev.sfx("door_open", ev.point("forestHouseDoorOut"), 1);
  ev.pushAtmo("ev.night", "forestNight", 0.2);
  const door = ev.point("forestHouseDoorOut");
  const out = { x: door.x + 2.6, y: 0, z: door.z }; out.y = ev.groundY(out.x, out.z, door.y + 3);
  ev.teleport(out, Math.PI / 2);
  const L = getDoorLight(ev);
  seq.defer(() => { if (seq.aborted) L.intensity = 0; });
  L.position.set(door.x + 0.4, door.y + 1.9, door.z); L.intensity = 6;
  const cr = ev.model("creature"); cr.setVisible(false);
  await seq.wait(0.4);
  ev.cine(seq, false);
  await seq.fade(0, 1.2, "#000");
  ev.target = null;
  ev.ready();
  // 6 m out from the door or 8 s outside
  const pl = ev.player();
  await seq.untilOr(() => { const dx = pl.position.x - door.x, dz = pl.position.z - door.z; return dx * dx + dz * dz >= 36; }, 8);
  // ---- JUMPSCARE: it is right in front of the camera ----
  const cam = ev.camera; const f = new T.Vector3(); cam.getWorldDirection(f); f.y = 0; f.normalize();
  const cp = cam.position;
  cr.setHeight(2.9); cr.mode = "idle"; cr.speed = 0; cr.ceiling = 0;
  cr.position.set(cp.x + f.x * 1.25, 0, cp.z + f.z * 1.25);
  cr.position.y = cp.y - 2.9 * 0.93; // its mask at eye height
  cr.yaw = Math.atan2(-f.x, -f.z);
  cr.setVisible(true); cr.play("scream", 0.9);
  await seq.p(ev.jumpscare("creature"));
  // then it stands 12 m away, off to the side of the clearing, and starts walking
  const side = Math.random() < 0.5 ? 1 : -1;
  const px = pl.position.x, pz = pl.position.z;
  cr.position.set(px - 7.5, 0, pz + side * 9.4); cr.position.y = ev.groundY(cr.position.x, cr.position.z, 50);
  cr.yaw = Math.atan2(px - cr.position.x, pz - cr.position.z);
  cr.stop(); cr.mode = "walk"; cr.speed = 1.2; cr.play("twitch", 0.7);
  ev.sfx("hollow_breath", cr.position, 1);
  await seq.wait(0.9);
  return "chase";
}

// ---------------------------------------------------------------- NG reset (after the throne)
export async function ngReset(ev, seq) {
  ev.cine(seq, true);
  safe(ev.story, "secret", "ngplus");
  ev.ready();
  await seq.p(safe(ev.ui, "showRedTitle", 4));
  ev.cine(seq, false);
  ev.setDeath(null);
  // startCycle emits run:reset (which stops this sequence) and game:start
  setTimeout(() => { const st = ev.story; if (st && st.startCycle) safe(st, "startCycle", 1); else { ev.state.run.cycle = 1; ev.emit("run:reset", { cycle: 1 }); } safe(ev.ui, "fade", 0, 2, "#000"); }, 0);
  return null;
}

// ---------------------------------------------------------------- cycle 1 King beaten: the short way
export async function ngShortcut(ev, seq) {
  if (phaseIdx(ev.phase()) < phaseIdx("ngPostKing")) ev.setPhase("ngPostKing");
  applyNgOpen(ev);
  ev.ready();
  return null;
}
export { clamp };
