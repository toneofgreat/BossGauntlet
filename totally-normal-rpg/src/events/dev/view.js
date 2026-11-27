// EVENTS dev viewer: renders EVENTS models / zones / fx with stub modules (no other builders needed).
// Open /totally-normal-rpg/src/events/dev/view.html?s=creature (served from the BossGauntlet root).
import * as THREE from "../../../../platypus/vendor/three.module.js";
import * as Events from "../index.js";

const S = new URLSearchParams(location.search).get("s") || "creature";
const info = document.getElementById("info");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 6000);
addEventListener("resize", () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
const dark = S === "throne" || S === "creature" || S === "crawl";
scene.background = new THREE.Color(dark ? 0x0a0b10 : S === "collapse" ? 0x2a0808 : 0xcfc2a8);
scene.fog = new THREE.FogExp2(scene.background.getHex(), S === "giant" ? 0.004 : S === "collapse" ? 0.006 : 0.03);
const hemi = new THREE.HemisphereLight(dark ? 0x3a4060 : 0xfff1dc, 0x302820, dark ? 0.5 : 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(dark ? 0x8090c0 : 0xfff0d8, dark ? 1.2 : 2.4); sun.position.set(30, 60, 40); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, far: 300 }); scene.add(sun); scene.add(sun.target);
if (S !== "collapse") {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: dark ? 0x22201e : 0xc9b48a, roughness: 0.95 }));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
}

// ---------------- stubs ----------------
const bus = (() => { const m = new Map(); return { on(n, f) { (m.get(n) || m.set(n, []).get(n)).push(f); return () => {}; }, off() {}, emit(n, p) { for (const f of m.get(n) || []) try { f(p); } catch (e) { console.error(e); } } }; })();
const state = { profile: { secrets: {}, endings: {} }, settings: { reduceFlashing: false }, run: { cycle: 1, phase: "intro", flags: {}, buried: {}, level: 220000 },
  player: { lives: 0 }, world: { zone: "lobby" }, ui: { screen: "game", modal: false }, rt: { playing: true, paused: false, cinematic: false, idleLock: false } };
const systems = [];
const colliders = new Map(); let nid = 1;
const physics = {
  addBox(o) { colliders.set(nid, { k: "box", ...o, en: true }); return nid++; }, addRamp(o) { colliders.set(nid, { k: "ramp", ...o, en: true }); return nid++; },
  addCylinder(o) { colliders.set(nid, { k: "cyl", ...o, en: true }); return nid++; }, addTrigger() { return nid++; },
  move(id, c) { const k = colliders.get(id); if (k) k.center = { ...c }; }, setEnabled(id, b) { const k = colliders.get(id); if (k) k.en = b; },
  remove(id) { colliders.delete(id); }, clearTag() {}, raycast() { return null; }, setKillY() {},
  groundAt(x, z) { let b = S === "collapse" ? -1e9 : 0; for (const c of colliders.values()) { if (!c.en || c.k !== "box") continue; const t = c.center.y + c.size.y / 2; if (Math.abs(x - c.center.x) <= c.size.x / 2 && Math.abs(z - c.center.z) <= c.size.z / 2 && t > b) b = t; } return { y: b, surface: "rock", id: 0 }; },
};
const player = { position: new THREE.Vector3(0, 0, 6), velocity: new THREE.Vector3(), yaw: Math.PI, onGround: true, dodging: false, gravityMul: 1,
  object: new THREE.Group(), avatar: { setVisible() {} }, teleport(p, y) { this.position.set(p.x, p.y, p.z); if (y !== undefined) this.yaw = y; },
  setControl() {}, setLook() {}, knockback() {}, root() {}, play() { return Promise.resolve(); }, forward(o) { return o.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }, isMoving() { return false; } };
// a stand-in avatar so scale reads
const av = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.2, 4, 8), new THREE.MeshStandardMaterial({ color: 0x5a6a80 })); av.position.y = 0.9; av.castShadow = true; player.object.add(av); scene.add(player.object);
let camOwner = null; const tween = { on: false };
const ctl = {
  set(p, l) { camera.position.set(p.x, p.y, p.z); camera.lookAt(l.x, l.y, l.z); camOwner = "events"; },
  move(p, l, d) { camOwner = "events"; Object.assign(tween, { on: true, t: 0, d: d || 1, a: camera.position.clone(), b: new THREE.Vector3(p.x, p.y, p.z), l: new THREE.Vector3(l.x, l.y, l.z) }); return new Promise((r) => setTimeout(r, (d || 1) * 1000)); },
  follow() {}, firstPerson() {}, roll() {}, release() { camOwner = null; },
};
const engine = { scene, camera, renderer, physics, player, addSystem(n, f, p = 50) { systems.push({ f, p }); systems.sort((a, b) => a.p - b.p); },
  yieldFrame: () => new Promise((r) => requestAnimationFrame(r)), materials: { get: () => null }, terrain: { heightAt: () => (S === "collapse" ? -1e9 : 0) },
  quality: { level: 2 }, postfx: { flash() {}, set() {}, reset() {} }, camera3p: { shake() {}, setFov() {}, take: () => ctl },
  input: { idleSeconds: () => 0, invert() {} }, setAtmosphere() {}, pushAtmosphere() {}, popAtmosphere() {}, showRegion() {} };
const portal = () => ({ setActive() {}, setPos() {}, onEnter: null, pos: { x: 0, y: 0, z: 0 } });
const world = { zones: {}, point: () => null, spawns: () => [], async goto(z, o) { state.world.zone = z; if (o && o.pos) player.teleport(o.pos, o.yaw); },
  registerZone() {}, addInteractable() { return () => {}; }, portal, npc: () => ({ setVisible() {} }), prop: () => null, graves: [] };
const P = () => Promise.resolve(0);
const ui = { fade: P, letterbox() {}, toast() {}, banner() {}, subtitle() {}, confirm: P, jumpscare: P, showRedTitle: P, lives() {}, glitch() {}, fakeScreen: P };
const h = { stop() {}, setVol() {} }; const audio = new Proxy({}, { get: () => () => h });
const combat = { level: () => 220000, addHittable() { return () => {}; }, damagePlayer() { return 0; }, healPlayer() {}, setDeathHandler() {}, killPlayer() {}, give() {}, has: () => false, setInvuln() {} };
const story = { setPhase(p) { state.run.phase = p; }, say(s, t) { info.textContent = t; return P(); }, secret() {}, reachEnding: P, startCycle() {} };
const ctx = { THREE, bus, state, engine, scene, camera, renderer, world, combat, story, ui, audio, save: { snapshotChoice() {} } };
const api = await Events.init(ctx);
ctx.events = api;
const ev = window.__tnrpg.events;

// ---------------- scenes ----------------
let orbit = { on: true, r: 6, y: 1.8, ly: 1.5, sp: 0.15, cx: 0, cz: 0 };
const T0 = performance.now();
let sceneUpdate = () => {};
if (S === "creature" || S === "crawl") {
  const c = ev.model("creature"); c.setVisible(true); c.position.set(0, 0, 0); c.mode = S === "crawl" ? "crawl" : "walk"; c.speed = 1.2;
  orbit = { on: true, r: 5.2, y: 2.0, ly: 2.0, sp: 0.12, cx: 0, cz: 0 };
  const lamp = new THREE.PointLight(0xffa860, 8, 12, 2); lamp.position.set(2.5, 2, 3); scene.add(lamp);
  player.object.visible = false;
  sceneUpdate = (t) => { c.yaw = Math.sin(t * 0.2) * 0.4; if (S === "creature" && Math.floor(t / 6) % 2 === 1) { c.mode = "idle"; c.speed = 0; } else if (S === "creature") { c.mode = "walk"; c.speed = 1.2; } };
} else if (S === "armored") {
  const a = ev.model("armored"); a.setVisible(true); a.position.set(0, 0, 0); a.mode = "idle"; player.teleport({ x: 0, y: 0, z: 9 });
  orbit = { on: true, r: 14, y: 4, ly: 4.5, sp: 0.1, cx: 0, cz: 0 };
  sceneUpdate = (t) => { a.shieldUp = Math.floor(t / 4) % 2 ? 1 : 0; if (Math.floor(t / 4) % 3 === 2 && !a.act) a.play("slam", 1.4); };
} else if (S === "giant") {
  const g = ev.model("giant"); g.setVisible(true); g.position.set(0, -22, -60); g.mode = "idle"; player.teleport({ x: 0, y: 0, z: 0 });
  orbit.on = false; camera.position.set(6, 2.2, 14); camera.lookAt(0, 20, -60);
  sceneUpdate = (t) => {
    const ph = Math.floor(t / 5) % 3;
    if (ph === 0) { g.clearIK(); if (!g.act) g.play("stomp", 1.6); for (const c of g.cores) c.glow = 0; }
    if (ph === 1) { if (g.act !== "palm") g.play("palm", 1.0); g.setIK(-1, 6, 2.4, -32); for (const c of g.cores) c.glow = c.name === "handR" ? 1 : 0; }
    if (ph === 2) { if (g.act !== "reach") g.play("reach", 1.8); g.setIK(-1, 2, 3, -30); for (const c of g.cores) c.glow = c.name === "face" ? 1 : 0; }
  };
} else if (S === "sword") {
  const s = ev.model("sword"); s.root.visible = true; s.root.position.set(0, 0, 0);
  orbit = { on: true, r: 3.4, y: 1.4, ly: 0.9, sp: 0.2, cx: 0, cz: 0 }; player.object.visible = false;
  sceneUpdate = (t) => { const k = (t % 10) / 10; s.setStage(Math.min(1, k * 3) * (1 - Math.max(0, k - 0.4)), Math.max(0, Math.min(1, (k - 0.35) * 3))); s.u.uSolid.value = Math.max(0, Math.min(1, (k - 0.7) * 4)); };
} else if (S === "girl") {
  const G = ev.model("girl"); G.root.visible = true; orbit = { on: true, r: 2.6, y: 1.2, ly: 0.5, sp: 0.15, cx: 0, cz: 0 }; player.object.visible = false;
  const actor = new (await import("../hollowDesert.js")).GirlActor(ev); actor.place(); G.root.position.set(0, 0, 0);
  sceneUpdate = (t) => { const turn = (t % 8) > 4; G.mask.visible = turn; for (const e of G.eyes) e.visible = turn; actor.crying = !turn; actor.headTurn = turn ? 2.4 : 0; actor.headTilt = turn ? 0.3 : 0; actor.update(1 / 60); };
} else if (S === "collapse") {
  ev.trigger("collapse");
  orbit.on = false;
  sceneUpdate = (t) => { const z = Math.min(600, 4 + t * 18); const y = physics.groundAt(3000, z).y; player.teleport({ x: 3000, y: Math.max(y, -5), z }); camera.position.set(3000 + 14, Math.max(y, 0) + 9, z - 22); camera.lookAt(3000, Math.max(y, 0) + 2, z + 10); };
} else if (S === "throne") {
  state.world.zone = "throne";
  const room = new THREE.Mesh(new THREE.BoxGeometry(24, 11, 30), new THREE.MeshStandardMaterial({ color: 0x3a3640, side: THREE.BackSide, roughness: 0.9 })); room.position.set(0, 25.5, 495); room.receiveShadow = true; scene.add(room);
  ev.trigger("throne"); orbit.on = false;
  sceneUpdate = () => { if (!camOwner) { const f = ev.fight; const c = ev.models.creature; camera.position.set(player.position.x + 6, 26, player.position.z - 8); if (c) camera.lookAt(c.position.x, 23, c.position.z); } };
} else if (S === "fx") {
  orbit = { on: true, r: 16, y: 9, ly: 0, sp: 0.1, cx: 0, cz: 0 };
  setInterval(() => { ev.fx.decal("circle", (Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10, 2.5, 1.2); ev.fx.decal("cone", 0, 0, 0, 7, 1.0, { yaw: Math.random() * 6, half: 0.8 }); ev.fx.ring(0, 0, 0, { speed: 8, maxR: 14 }); ev.fx.burst(0, 1, 0, 40, 5, 1, 0.3, 0.2, 1, 0.3, 6, 1); ev.fx.decal("ink", 4, 0, 3, 1.6, 1); ev.fx.decal("rect", -6, 0, -4, 1.2, 1, { yaw: 0.6, length: 10 }); }, 1600);
}
let last = performance.now(), frames = 0, fpsT = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = (now - T0) / 1000;
  try { sceneUpdate(t); } catch (e) { console.error(e); }
  for (const s of systems) s.f(dt, t);
  if (tween.on) { tween.t += dt; const k = Math.min(1, tween.t / tween.d); camera.position.lerpVectors(tween.a, tween.b, k * k * (3 - 2 * k)); camera.lookAt(tween.l); if (k >= 1) tween.on = false; }
  if (orbit.on) { const a = t * orbit.sp + 0.6; camera.position.set(orbit.cx + Math.sin(a) * orbit.r, orbit.y, orbit.cz + Math.cos(a) * orbit.r); camera.lookAt(orbit.cx, orbit.ly, orbit.cz); }
  player.object.position.copy(player.position);
  sun.position.set(camera.position.x + 30, camera.position.y + 60, camera.position.z + 40); sun.target.position.copy(camera.position);
  renderer.render(scene, camera);
  frames++; fpsT += dt; if (fpsT > 1) { window.__fps = frames / fpsT; frames = 0; fpsT = 0; window.__calls = renderer.info.render.calls; }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.__viewReady = true;
