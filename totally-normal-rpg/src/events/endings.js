// Ending cinematics (DESIGN 9.4 / 9.6). STORY awaits these (events.playEnding) and then shows the ending card.
// Every cinematic restores the player avatar, camera and post-fx in its defers, and leaves the screen covered
// (fade layer) so the card appears without a flash of the world behind it.
import { safe, clamp } from "./util.js";
import { swordPos } from "./sword.js";

function avatarVisible(ev, on) {
  const pl = ev.player(); if (!pl) return;
  if (pl.avatar && typeof pl.avatar.setVisible === "function") safe(pl.avatar, "setVisible", on);
  else if (pl.object) pl.object.visible = on;
}
function common(ev, seq) {
  ev.idle.disarm();
  ev.cine(seq, true);
  seq.defer(() => { avatarVisible(ev, true); ev.postfxReset(); ev.rollTarget = 0; });
  // runs last: uncover instantly so the ending card (shown right after this resolves) is never hidden by the fade layer
  seq.defer(() => { safe(ev.ui, "fade", 0, 0); });
}
async function toSword(ev, seq, color) {
  const p = swordPos(ev);
  const s = ev.model("sword"); s.root.position.set(p.x, p.y, p.z); s.root.rotation.set(0, 0.4, 0); s.root.visible = true;
  s.u.uSolid.value = 1; s.u.uRust.value = 0; s.u.uDissolve.value = 0; s.setStage(0.35, 1);
  if (ev.zone() !== "hollowDesert") {
    await seq.fade(1, 0.6, color || "#000");
    await seq.p(ev.goto("hollowDesert", { x: p.x, y: p.y, z: p.z + 4 }, Math.PI, false));
  }
  return { p, s };
}
/** covers the screen and finishes */
async function cover(ev, seq, color, dur) { await seq.fade(1, dur || 1.5, color || "#000"); }

// ------------------------------------------------------------------------------------------- MONSTER
export async function monster(ev, seq) {
  common(ev, seq);
  const T = ev.THREE;
  const { p, s } = await toSword(ev, seq);
  const ctl = ev.takeCam(seq);
  const pl = ev.player();
  ev.teleport({ x: p.x, y: p.y, z: p.z + 1.2 }, Math.PI);
  await seq.fade(0, 0.6, "#000");
  if (ctl) safe(ctl, "set", { x: p.x + 0.9, y: p.y + 1.7, z: p.z + 1.6 }, { x: p.x, y: p.y + 1.3, z: p.z });
  safe(pl, "play", "take");
  // your hand closes on it; ink runs up your arm
  await seq.wait(0.9);
  ev.sfx("melt", p, 1); ev.sfx("hollow_breath", p, 0.8);
  ev.postfx({ vignette: 0.85, saturation: 0.55, tint: [0.75, 0.6, 0.7], aberration: 0.4 });
  for (let i = 0; i < 30; i++) ev.fx.emit(p.x + (Math.random() - 0.5) * 0.4, p.y + 1.2 + Math.random() * 0.5, p.z + 0.8, (Math.random() - 0.5) * 0.4, 0.8 + Math.random(), 0.3, 1.2, 0.08, 0.02, 0.02, 0.03, 0.95, -0.5);
  await seq.wait(1.6);
  // the camera pulls out: you ARE the Hollow
  s.root.visible = false;
  avatarVisible(ev, false);
  const cr = ev.model("creature"); cr.setHeight(2.9); cr.ceiling = 0; cr.melt = 0; cr.stop();
  cr.position.set(pl.position.x, pl.position.y, pl.position.z); cr.yaw = Math.PI; cr.mode = "idle"; cr.setVisible(true);
  seq.defer(() => cr.setVisible(false));
  cr.play("twitch", 1.0);
  if (ctl) await seq.p(safe(ctl, "move", { x: p.x + 4, y: p.y + 3.2, z: p.z + 7 }, { x: cr.position.x, y: p.y + 2, z: cr.position.z }, 2.2));
  safe(ev.audio, "stinger", "end_monster");
  // you walk
  cr.mode = "walk"; cr.speed = 1.6;
  let t0 = seq.t;
  await seq.waitWhile(3, () => { const dt = 1 / 60; cr.position.z -= 1.6 * dt; cr.position.y = ev.groundY(cr.position.x, cr.position.z, cr.position.y + 3); if (ctl) safe(ctl, "set", { x: cr.position.x + 4, y: cr.position.y + 3.2, z: cr.position.z + 7 }, { x: cr.position.x, y: cr.position.y + 2, z: cr.position.z }); return true; });
  // ...into the valley: the colours drain, the houses turn to ash, the castle falls silent
  await seq.fade(1, 0.8, "#000");
  const lobby = ev.point("spawn");
  await seq.p(ev.goto("lobby", lobby, 0, false));
  cr.position.set(lobby.x, ev.groundY(lobby.x, lobby.z + 2, 50), lobby.z + 2); cr.yaw = 0;
  safe(ev.audio, "music", null, { fade: 1 });
  if (ctl) safe(ctl, "set", { x: lobby.x - 3, y: lobby.y + 2.4, z: lobby.z - 4 }, { x: lobby.x, y: lobby.y + 2, z: lobby.z + 12 });
  await seq.fade(0, 1.0, "#000");
  t0 = seq.t;
  await seq.waitWhile(6, () => {
    const k = clamp((seq.t - t0) / 6, 0, 1), dt = 1 / 60;
    cr.position.z += 1.6 * dt; cr.position.y = ev.groundY(cr.position.x, cr.position.z, cr.position.y + 3);
    if (ctl) safe(ctl, "set", { x: cr.position.x - 3 + k * 2, y: cr.position.y + 2.4 + k * 4, z: cr.position.z - 5 - k * 3 }, { x: cr.position.x, y: cr.position.y + 2, z: cr.position.z + 10 });
    ev.postfx({ saturation: 1 - k, vignette: 0.4 + k * 0.5, grain: 0.2 + k * 0.4 });
    if (Math.random() < 0.8) ev.fx.emit(lobby.x + (Math.random() - 0.5) * 50, lobby.y + Math.random() * 6, lobby.z - 6 + (Math.random() - 0.5) * 30, 0.5, 1 + Math.random(), 0.3, 3, 0.15, 0.55, 0.55, 0.55, 0.7, -0.3);
    return true;
  });
  // the screen eats itself into black
  safe(ev.ui, "glitch", 2.2, 0.9);
  await cover(ev, seq, "#000", 2.2);
  return null;
}

// ------------------------------------------------------------------------------------------- WORLD (the void)
export async function world(ev, seq) {
  common(ev, seq);
  const pl = ev.player();
  const ctl = ev.takeCam(seq);
  const pp = pl.position;
  const vl = ev.point("voidLeap");
  const start = ev.zone() === "voidEdge" || ev.zone() === "lobby" ? { x: pp.x, y: pp.y, z: pp.z } : vl;
  if (start === vl) { await seq.fade(1, 0.5, "#fff"); await seq.p(ev.goto("lobby", vl, -Math.PI / 2, false)); await seq.fade(0, 0.8, "#fff"); }
  // the camera holds on the horizon as you step forward
  if (ctl) safe(ctl, "set", { x: start.x + 3.5, y: start.y + 2.1, z: start.z + 1.2 }, { x: start.x - 60, y: start.y - 6, z: start.z });
  safe(pl, "play", "walk", { loop: true });
  await seq.wait(0.7);
  // immediately a soft fade to white; nothing is shown
  ev.sfx("wind", null, 0.4);
  await seq.fade(1, 1.6, "#ffffff");
  avatarVisible(ev, false);
  safe(pl, "play", "idle");
  safe(ev.audio, "stinger", "end_world");
  safe(ev.audio, "music", null, { fade: 2 });
  // the world behind lets go: white motes drifting up out of everything
  ev.pushAtmo("ev.end", "desertFog", 0.1); seq.defer(() => ev.popAtmo("ev.end", 0.5));
  ev.postfx({ saturation: 0.2, contrast: 0.7, vignette: 0.1 });
  if (ctl) safe(ctl, "set", { x: start.x - 14, y: start.y + 9, z: start.z + 4 }, { x: 0, y: 3, z: 0 });
  await seq.wait(0.5);
  await seq.fade(0, 1.8, "#ffffff");
  let t0 = seq.t;
  await seq.waitWhile(5, () => {
    const k = clamp((seq.t - t0) / 5, 0, 1);
    for (let i = 0; i < 4; i++) ev.fx.emit((Math.random() - 0.5) * 70, Math.random() * 8, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 0.4, 1.2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.4, 4, 0.12 + Math.random() * 0.15, 1, 1, 1, 0.85, -0.2);
    ev.postfx({ saturation: 0.2 - k * 0.2, contrast: 0.7 - k * 0.3 });
    if (ctl) safe(ctl, "set", { x: start.x - 14 - k * 6, y: start.y + 9 + k * 8, z: start.z + 4 }, { x: 0, y: 3 + k * 4, z: 0 });
    return true;
  });
  // far away, in the desert, the black sword crumbles to dust
  await seq.fade(1, 1.2, "#ffffff");
  const { p, s } = await toSword(ev, seq, "#ffffff");
  if (ctl) safe(ctl, "set", { x: p.x + 3, y: p.y + 1.6, z: p.z + 3.5 }, { x: p.x, y: p.y + 1, z: p.z });
  await seq.fade(0, 1.4, "#ffffff");
  seq.say("", "You made sure nobody would ever hold it.", { dur: 5 });
  t0 = seq.t;
  await seq.waitWhile(3.5, () => {
    const k = clamp((seq.t - t0) / 3.5, 0, 1); s.u.uDissolve.value = k * 1.02;
    if (Math.random() < 0.7) ev.fx.emit(p.x + (Math.random() - 0.5) * 0.3, p.y + Math.random() * 1.9, p.z, (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.6, -0.4, 2.5, 0.06, 0.75, 0.72, 0.7, 0.8, -0.1);
    return true;
  });
  s.root.visible = false; s.u.uDissolve.value = 0;
  await seq.wait(1.2);
  await cover(ev, seq, "#ffffff", 2.2);
  return null;
}

// ------------------------------------------------------------------------------------------- WARRIOR
let flowers = null;
function getFlowers(ev) {
  if (flowers) return flowers;
  const T = ev.THREE, N = 160;
  const stemG = new T.CylinderGeometry(0.012, 0.016, 1, 4); stemG.translate(0, 0.5, 0);
  const bloomG = new T.IcosahedronGeometry(0.06, 0);
  const stems = new T.InstancedMesh(stemG, new T.MeshStandardMaterial({ color: 0x3f6a2c, roughness: 0.8 }), N);
  const blooms = new T.InstancedMesh(bloomG, new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), N);
  const col = new T.Color(); const pal = [0xf2e8d8, 0xd9a3c8, 0xf0d060, 0xb7c8f0, 0xe07a6a];
  for (let i = 0; i < N; i++) { col.setHex(pal[i % pal.length]); blooms.setColorAt(i, col); }
  stems.visible = blooms.visible = false; ev.scene.add(stems, blooms);
  flowers = { stems, blooms, N, data: new Float32Array(N * 4), m: new T.Matrix4(), q: new T.Quaternion(), v: new T.Vector3(), s: new T.Vector3() };
  return flowers;
}
function graveList(ev) {
  const out = [];
  try { const g = ev.world && ev.world.graves; if (g && g.length) { for (const x of g) out.push({ x: x.pos.x, y: x.pos.y, z: x.pos.z }); return out; } } catch (e) { /* */ }
  for (let i = 0; i < 6; i++) out.push(ev.point("grave" + i));
  return out;
}
export async function warrior(ev, seq) {
  common(ev, seq);
  const pl = ev.player(); const graves = graveList(ev);
  const gc = { x: 0, y: 0, z: 0 }; for (const g of graves) { gc.x += g.x / graves.length; gc.y += g.y / graves.length; gc.z += g.z / graves.length; }
  if (ev.zone() !== "graves" && ev.zone() !== "lobby") { await seq.fade(1, 0.6); await seq.p(ev.goto("graves", { x: gc.x, y: gc.y, z: gc.z + 3 }, Math.PI, false)); await seq.fade(0, 0.8); }
  const ctl = ev.takeCam(seq);
  if (ctl) seq.p(safe(ctl, "move", { x: gc.x + 7, y: gc.y + 3.5, z: gc.z + 8 }, { x: gc.x, y: gc.y + 0.6, z: gc.z }, 2.5));
  safe(pl, "play", "kneel");
  const wind = safe(ev.audio, "loop", "wind", { vol: 0.2 }); seq.defer(() => { if (wind) safe(wind, "stop", 1); });
  safe(ev.audio, "stinger", "end_warrior");
  await seq.wait(1.5);
  // flowers grow over the graves in a time-lapse; the sun comes up
  const F = getFlowers(ev); F.stems.visible = F.blooms.visible = true;
  seq.defer(() => { F.stems.visible = F.blooms.visible = false; });
  for (let i = 0; i < F.N; i++) {
    const g = graves[i % graves.length]; const d = F.data;
    d[i * 4] = g.x + (Math.random() - 0.5) * 1.6; d[i * 4 + 1] = g.z + (Math.random() - 0.5) * 2.2;
    d[i * 4 + 2] = 0.25 + Math.random() * 0.4; d[i * 4 + 3] = Math.random() * 0.6;
  }
  ev.pushAtmo("ev.end", "golden", 3); seq.defer(() => ev.popAtmo("ev.end", 1));
  let t0 = seq.t;
  await seq.waitWhile(5, () => {
    const k = clamp((seq.t - t0) / 5, 0, 1); const d = F.data;
    if (wind) safe(wind, "setVol", 0.2 + k * 0.6);
    for (let i = 0; i < F.N; i++) {
      const gk = clamp((k - d[i * 4 + 3] * 0.6) / 0.4, 0, 1); const h = d[i * 4 + 2] * gk;
      const y = ev.groundY(d[i * 4], d[i * 4 + 1], 50);
      F.m.compose(F.v.set(d[i * 4], y, d[i * 4 + 1]), F.q.identity(), F.s.set(1, Math.max(0.001, h), 1)); F.stems.setMatrixAt(i, F.m);
      F.m.compose(F.v.set(d[i * 4], y + h, d[i * 4 + 1]), F.q, F.s.setScalar(Math.max(0.001, gk))); F.blooms.setMatrixAt(i, F.m);
    }
    F.stems.instanceMatrix.needsUpdate = true; F.blooms.instanceMatrix.needsUpdate = true;
    if (k > 0.5 && !seq._day) { seq._day = true; ev.pushAtmo("ev.end2", "day", 2.5); seq.defer(() => ev.popAtmo("ev.end2", 1)); }
    return true;
  });
  await seq.wait(1);
  // the black sword, alone in the far desert, rusts and is buried by the sand
  await seq.fade(1, 1.2, "#000");
  const { p, s } = await toSword(ev, seq);
  if (ctl) safe(ctl, "set", { x: p.x + 3.2, y: p.y + 1.5, z: p.z + 3.2 }, { x: p.x, y: p.y + 0.9, z: p.z });
  await seq.fade(0, 1.2, "#000");
  t0 = seq.t;
  await seq.waitWhile(4.5, () => {
    const k = clamp((seq.t - t0) / 4.5, 0, 1);
    s.u.uRust.value = clamp(k * 1.6, 0, 1); s.root.position.y = p.y - clamp((k - 0.4) / 0.6, 0, 1) * 2.3;
    if (k > 0.4 && Math.random() < 0.8) ev.fx.emit(p.x + (Math.random() - 0.5) * 2, p.y + 0.2, p.z + (Math.random() - 0.5) * 2, -1.5, 0.6, 0, 1.2, 0.08, 0.82, 0.7, 0.52, 0.8, 0.5);
    return true;
  });
  s.root.visible = false; s.u.uRust.value = 0;
  await cover(ev, seq, "#000", 1.8);
  return null;
}

// ------------------------------------------------------------------------------------------- final boss outcomes
async function giantOutcome(ev, seq, kind) {
  common(ev, seq);
  const g = ev.model("giant"); g.setVisible(true); g.clearIK(); g.stop();
  seq.defer(() => { g.setVisible(false); g.root.rotation.set(0, 0, 0); g.setHeight(60); });
  const pl = ev.player(); const pp = pl.position;
  const ctl = ev.takeCam(seq);
  const head = g.headWorld(new ev.THREE.Vector3());
  if (ctl) safe(ctl, "set", { x: pp.x + 3, y: pp.y + 2, z: pp.z + 5 }, { x: head.x, y: head.y, z: head.z });
  if (kind === "idiot") {
    g.play("laugh", 4); ev.sfx("king_laugh", head, 1); safe(ev.audio, "stinger", "end_idiot");
    safe(ev.audio, "voice", "...idiot.", { kind: "hollow" }); seq.say("the hollow", "...idiot.", { dur: 3 });
    await seq.wait(3.5);
    await cover(ev, seq, "#000", 1.6);
    return null;
  }
  // winners / sigma: it topples back into the white void, coming apart into ink
  safe(ev.audio, "stinger", kind === "sigma" ? "end_sigma" : "end_winners");
  g.play("scream", 2.2); ev.sfx("hollow_shriek", head, 1); ev.shake(0.7, 2.5);
  const y0 = g.position.y; const t0 = seq.t;
  await seq.waitWhile(4.5, () => {
    const k = clamp((seq.t - t0) / 4.5, 0, 1);
    g.root.rotation.x = -k * k * 0.9; g.position.y = y0 - k * k * 50;
    if (Math.random() < 0.9) { g.headWorld(head); ev.fx.burst(head.x + (Math.random() - 0.5) * 20, head.y - Math.random() * 30, head.z, 4, 6, 0.03, 0.02, 0.04, 2, 1.2, -2, 1); }
    if (kind === "sigma") { ev.rollRate = 1.2; ev.rollTarget = Math.sin(k * Math.PI) * 0.35; }
    if (ctl) safe(ctl, "set", { x: pp.x + 3, y: pp.y + 2 + k * 2, z: pp.z + 5 + k * 4 }, { x: head.x, y: head.y, z: head.z });
    return true;
  });
  ev.rollTarget = 0;
  if (kind === "sigma") { ev.shake(1, 0.8); ev.sfx("rumble", pp, 1); }
  await cover(ev, seq, "#ffffff", 1.6);
  return null;
}
export function idiot(ev, seq) { return giantOutcome(ev, seq, "idiot"); }
export function winners(ev, seq) { return giantOutcome(ev, seq, "winners"); }
export function sigma(ev, seq) { return giantOutcome(ev, seq, "sigma"); }
