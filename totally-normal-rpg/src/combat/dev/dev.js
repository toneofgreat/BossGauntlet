// dev.js - standalone COMBAT harness: a minimal mock of ENGINE/WORLD/UI/AUDIO (CONTRACT shapes) so the combat module
// can be rendered and exercised before the rest of the game exists. Not loaded by the game.
// URL: /totally-normal-rpg/src/combat/dev/?mode=gallery|play|items
import * as THREE from "../../../../platypus/vendor/three.module.js";
import { createFallbackHumanoid } from "../models.js";
import * as Save from "../save.js";
import * as Combat from "../index.js";

const params = new URLSearchParams(location.search);
const MODE = params.get("mode") || "gallery";
const logEl = document.getElementById("log");
const hudEl = document.getElementById("hud");
const logs = [];
function log(s) { logs.push(s); if (logs.length > 10) logs.shift(); logEl.textContent = logs.join("\n"); }
window.__devErrors = [];
window.addEventListener("error", (e) => window.__devErrors.push(String(e.message)));

// ---------------------------------------------------------------- bus + state (CONTRACT 3 / 4)
function createBus() {
  const m = new Map();
  return {
    on(n, f) { if (!m.has(n)) m.set(n, []); m.get(n).push(f); return () => this.off(n, f); },
    once(n, f) { const off = this.on(n, (p) => { off(); f(p); }); return off; },
    off(n, f) { const a = m.get(n); if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } },
    emit(n, p) { const a = m.get(n); if (!a) return; for (const f of a.slice()) { try { f(p); } catch (e) { console.warn("[bus]", n, e); window.__devErrors.push(n + ": " + e.message); } } },
  };
}
function createState() {
  return {
    v: 1,
    profile: { name: "", onlineName: "", secrets: {}, endings: {}, runs: 0, playMs: 0, signReads: 0, npcsTalked: {} },
    settings: { reduceFlashing: false, master: 0.8, music: 0.7, sfx: 0.9, sensitivity: 1, invertY: false, pointerLock: true, quality: "auto", showFps: false, hints: true },
    run: { cycle: 0, level: 0, phase: "intro", equip: { sword: "fists", armor: null, morph: null, crown: null, charm: null }, owned: {}, kills: {},
      villagerNoWood: 0, flags: {}, buried: {}, deaths: 0, startedAt: 0, kingWins: 0 },
    choiceSnapshot: null,
    player: { hp: 100, maxHp: 100, alive: true, invuln: 0, lastHurt: 0, lives: 0 },
    world: { zone: "lobby", region: "main" },
    ui: { screen: "game", modal: false },
    rt: { playing: false, paused: false, timeScale: 1, god: false, fast: 1, cinematic: false, idleLock: false },
  };
}

// ---------------------------------------------------------------- mock engine
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb8cc);
scene.fog = new THREE.Fog(0x9fb8cc, 60, 220);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 600);
addEventListener("resize", () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
scene.add(new THREE.HemisphereLight(0xdfeeff, 0x4a4030, 1.1));
const sun = new THREE.DirectionalLight(0xfff0dd, 2.4);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera; sc.left = sc.bottom = -25; sc.right = sc.top = 25; sc.near = 1; sc.far = 120;
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ color: 0x5f7a45, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const systems = [];
let time = 0, realTime = 0;
const timers = [];
const groundHit = { y: 0, surface: "grass", id: 0 };
const triggers = [];
const keys = new Set();
const input = { move: { x: 0, y: 0 }, look: { dx: 0, dy: 0 } };

const matCache = new Map();
const MATCOL = { iron: [0x9aa0a8, 0.9, 0.35], gold: [0xd8aa48, 1, 0.25], woodPlank: [0x8a6440, 0, 0.85], woodDark: [0x4a3322, 0, 0.9], leather: [0x5a3a24, 0, 0.8],
  cheese: [0xf0c048, 0, 0.6], rust: [0x8a4422, 0.4, 0.9], cardboard: [0x9a7a4e, 0, 1], paper: [0xeee6d0, 0, 0.95], bark: [0x5a4a38, 0, 1], clothWhite: [0xe8e4da, 0, 0.9],
  clothBlue: [0x2a3a6a, 0, 0.9], obsidian: [0x0b0a10, 0.3, 0.15] };

const avatar = createFallbackHumanoid(THREE, null, { height: 1.8, shirt: "#6b7d5a", pants: "#4a3c2c", hair: "#3a2a1a" });
const playerObj = new THREE.Group();
playerObj.add(avatar.root);
scene.add(playerObj);
const slots = { hand: null, body: null, head: null, back: null };
let yaw = 0, camYaw = 0, camPitch = 0.35, vy = 0, onGround = true, control = true, dodgeT = 0, rootT = 0;
const vel = new THREE.Vector3();
const lastSafe = new THREE.Vector3();
const player = {
  object: playerObj, position: playerObj.position, velocity: vel,
  get yaw() { return yaw; }, set yaw(v) { yaw = v; },
  get onGround() { return onGround; },
  teleport(p, y) { playerObj.position.set(p.x, p.y, p.z); vel.set(0, 0, 0); if (y !== undefined) { yaw = y; camYaw = y; } },
  setControl(b) { control = b; }, setLook() {},
  speedMul: 1, jumpMul: 1, gravityMul: 1,
  knockback(v) { vel.x += v.x; vel.z += v.z; vy += v.y || 0; onGround = false; },
  root(s) { rootT = Math.max(rootT, s); },
  forward(out) { return out.set(Math.sin(yaw), 0, Math.cos(yaw)); },
  isMoving() { return Math.hypot(vel.x, vel.z) > 0.5; }, isSprinting() { return keys.has("ShiftLeft"); },
  get dodging() { return dodgeT > 0.2; }, lastSafe, avatar,
  setMorph(m) { log("morph " + m); },
  attach(slot, obj) {
    const parent = slot === "hand" ? avatar.hand : slot === "head" ? avatar.head : avatar.root;
    if (slots[slot] && slots[slot].parent) slots[slot].parent.remove(slots[slot]);
    slots[slot] = obj;
    if (obj) { parent.add(obj); if (slot === "body") obj.position.set(0, 1.28, 0); if (slot === "head") obj.position.set(0, 0.06, 0); }
  },
  setArmorLook(l) { log("armorLook " + (l ? l.color : "none")); },
  play(a, o) { return avatar.play(a, o); },
  setNameTag() {},
};

const engine = {
  renderer, scene, camera,
  addSystem(name, fn, pr = 50) { systems.push({ name, fn, pr }); systems.sort((a, b) => a.pr - b.pr); return () => { const i = systems.findIndex((s) => s.fn === fn); if (i >= 0) systems.splice(i, 1); }; },
  get time() { return time; }, get realTime() { return realTime; },
  yieldFrame: () => new Promise((r) => requestAnimationFrame(() => r())),
  start() {}, every() { return () => {}; },
  after(sec, fn) { timers.push({ at: time + sec, fn }); return () => {}; },
  physics: {
    addBox() { return 1; }, addCylinder() { return 2; }, addRamp() { return 3; }, move() {}, setEnabled() {}, remove() {}, clearTag() {},
    addTrigger(o) { triggers.push({ o, inside: false }); return triggers.length; },
    raycast() { return null; },
    groundAt(x, z) { groundHit.y = 0; return groundHit; },
    setKillY() {},
  },
  player,
  input: { move: input.move, look: input.look, down: () => false, pressed: () => false, idleSeconds: () => 0, mode: "keys", setEnabled() {}, invert() {} },
  materials: {
    get(name) { let m = matCache.get(name); if (!m) { const c = MATCOL[name] || [0x888888, 0, 0.8]; m = new THREE.MeshStandardMaterial({ color: c[0], metalness: c[1], roughness: c[2] }); matCache.set(name, m); } return m; },
    texture() { return null; },
  },
  quality: { level: 2, onChange() { return () => {}; } },
  postfx: { flash() {}, set() {}, reset() {} },
  camera3p: { shake(a) { shakeA = Math.max(shakeA, a); }, setFov() {}, setDistance() {}, take() { return { set() {}, move: async () => {}, follow() {}, firstPerson() {}, roll() {}, release() {} }; }, owner: null, lockTarget() {} },
  terrain: { heightAt: () => 0, regionAt: () => "main", surfaceAt: () => "grass" },
  setAtmosphere(p) { log("atmo " + p); }, pushAtmosphere(t, p) { log("push atmo " + p); }, popAtmosphere() {},
};
let shakeA = 0;

const ctx = { THREE, bus: createBus(), state: createState(), scene, camera, renderer, engine, save: null, audio: null, ui: null, world: null, combat: null, story: null, events: null };
window.__tnrpg = { ctx };

// mock UI / AUDIO / WORLD
const floaters = [];
ctx.ui = {
  damageNumber(pos, text, kind) { floaters.push({ x: pos.x, y: pos.y, z: pos.z, text, kind, t: 0 }); },
  subtitle(t) { log("SUB " + t); }, toast(t) { log("TOAST " + t); }, banner(t) { log("BANNER " + t); },
  dialogue: async (o) => { log("DLG " + o.speaker + ": " + o.lines.join(" / ")); return 0; },
  deathScreen: async () => { log("YOU DIED"); await new Promise((r) => setTimeout(r, 600)); },
  fade: async () => {}, prompt() {},
};
ctx.audio = { sfx(id) { if (window.__sfxLog) window.__sfxLog.push(id); return null; }, stinger(id) { log("sting " + id); }, pushMusic(t, id) { log("music+ " + id); }, popMusic() { log("music-"); } };
const interactables = [];
const ZONES = {
  lobby: { id: "lobby", bounds: { x0: -40, z0: -40, x1: 40, z1: 40, y0: -5, y1: 30 } },
  kingDark: { id: "kingDark", bounds: { x0: -15, z0: 10, x1: 15, z1: 40, y0: -5, y1: 20 } },
  barn: { id: "barn", bounds: { x0: -8, z0: 13, x1: 8, z1: 37, y0: -5, y1: 20 } },
  guardPost: { id: "guardPost", bounds: { x0: -15, z0: 20, x1: 15, z1: 40, y0: -5, y1: 20 } },
};
ctx.world = {
  zones: ZONES,
  point(n) {
    const P = { spawn: { x: 0, y: 0, z: 10 }, villageSquare: { x: 0, y: 0, z: 40 }, ratKingGate: { x: 0, y: 0, z: 132 }, barnDoor: { x: -72, y: 0, z: 236 } };
    return P[n] || null;
  },
  spawns(kind) {
    if (MODE === "play") {
      if (kind === "rat") return [{ pos: { x: -6, y: 0, z: 20 }, yaw: 0, radius: 6 }, { pos: { x: 6, y: 0, z: 22 }, yaw: 0, radius: 6 }];
      if (kind === "villager") return [{ pos: { x: -12, y: 0, z: 34 }, yaw: 0 }];
      if (kind === "royalGuard") return [{ pos: { x: 14, y: 0, z: 38 }, yaw: Math.PI }, { pos: { x: 17, y: 0, z: 38 }, yaw: Math.PI }];
      if (kind === "ratKing") return [{ pos: { x: 0, y: 0, z: 50 }, yaw: Math.PI }];
      if (kind === "rookie") return [{ pos: { x: -20, y: 0, z: 10 }, yaw: 0 }];
      if (kind === "fydor") return [{ pos: { x: -3, y: 0, z: 30 }, yaw: Math.PI }];
      if (kind === "myles") return [{ pos: { x: 3, y: 0, z: 30 }, yaw: Math.PI }];
      if (kind === "king") return [{ pos: { x: 0, y: 0, z: 25 }, yaw: Math.PI }];
      if (kind === "cat") return [{ pos: { x: 0, y: 0, z: 25 }, yaw: Math.PI }];
    }
    return [];
  },
  zoneAt: () => "lobby",
  addInteractable(o) { interactables.push(o); return () => {}; },
  npc: () => ({ setVisible() {} }),
  gate: () => ({ open() {}, close() {}, isOpen: false }),
  portal: () => ({ setActive() {}, setPos() {} }),
  goto: async (z, o) => { player.teleport(o && o.pos ? o.pos : { x: 0, y: 0, z: 10 }, 0); },
};

// ---------------------------------------------------------------- input
addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code === "KeyF") ctx.bus.emit("input:attack", { phase: "down", held: 0 });
  if (e.code === "Space" && onGround && control) { vy = 7.2; onGround = false; ctx.bus.emit("player:jump", {}); }
  if (e.code === "KeyQ" && dodgeT <= -0.45) { dodgeT = 0.45; ctx.bus.emit("player:dodge", {}); }
});
addEventListener("keyup", (e) => { keys.delete(e.code); if (e.code === "KeyF") ctx.bus.emit("input:attack", { phase: "up", held: heldT }); });
let heldT = 0, mouseDown = false, dragX = 0, dragY = 0, downAt = 0;
renderer.domElement.addEventListener("pointerdown", (e) => { mouseDown = true; dragX = e.clientX; dragY = e.clientY; downAt = performance.now(); ctx.bus.emit("input:attack", { phase: "down", held: 0 }); heldT = 0; });
addEventListener("pointerup", () => { if (mouseDown) ctx.bus.emit("input:attack", { phase: "up", held: (performance.now() - downAt) / 1000 }); mouseDown = false; });
addEventListener("pointermove", (e) => { if (!mouseDown) return; camYaw -= (e.clientX - dragX) * 0.005; camPitch = Math.max(-0.2, Math.min(1.2, camPitch + (e.clientY - dragY) * 0.004)); dragX = e.clientX; dragY = e.clientY; });

// ---------------------------------------------------------------- loop
let last = performance.now();
const tmpV = new THREE.Vector3();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  time += dt; realTime += dt;
  if (keys.has("KeyF")) heldT += dt;
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= time) { const t = timers.splice(i, 1)[0]; try { t.fn(); } catch (e) { console.warn(e); } }
  // player controller
  let mx = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0), mz = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
  if (!control || rootT > 0) { mx = mz = 0; }
  rootT -= dt; dodgeT -= dt;
  const sp = (keys.has("ShiftLeft") ? 8 : 5) * player.speedMul * (dodgeT > 0 ? 2.6 : 1);
  if (mx || mz) {
    const a = Math.atan2(mx, mz);
    const wy = camYaw + Math.PI + a;
    const want = -Math.sin(wy) * -1;
    yaw = Math.atan2(Math.sin(camYaw + a), Math.cos(camYaw + a));
    vel.x += (Math.sin(yaw) * sp - vel.x) * Math.min(1, dt * 12); vel.z += (Math.cos(yaw) * sp - vel.z) * Math.min(1, dt * 12);
    void want;
  } else { vel.x *= Math.max(0, 1 - dt * 10); vel.z *= Math.max(0, 1 - dt * 10); }
  vy -= 20 * dt;
  playerObj.position.x += vel.x * dt; playerObj.position.z += vel.z * dt; playerObj.position.y += vy * dt;
  if (playerObj.position.y <= 0) { if (!onGround) ctx.bus.emit("player:land", { fall: -vy }); playerObj.position.y = 0; vy = 0; onGround = true; lastSafe.copy(playerObj.position); }
  playerObj.rotation.y = yaw;
  avatar.update(dt, Math.hypot(vel.x, vel.z), !onGround);
  // triggers
  for (const t of triggers) {
    const c = t.o.center, s = t.o.size || { x: 2, y: 2, z: 2 }, p = playerObj.position;
    const inside = Math.abs(p.x - c.x) < s.x / 2 && Math.abs(p.z - c.z) < s.z / 2;
    if (inside && !t.inside && t.o.onEnter) t.o.onEnter();
    t.inside = inside;
  }
  for (const s of systems) { try { s.fn(dt, time); } catch (e) { console.warn(s.name, e); window.__devErrors.push(s.name + ": " + e.message); } }
  // camera
  const p = playerObj.position;
  const dist = MODE === "gallery" ? 0 : 6;
  if (MODE !== "gallery") {
    camera.position.set(p.x - Math.sin(camYaw) * dist * Math.cos(camPitch), p.y + 1.6 + Math.sin(camPitch) * dist, p.z - Math.cos(camYaw) * dist * Math.cos(camPitch));
    camera.lookAt(p.x, p.y + 1.3, p.z);
  }
  if (shakeA > 0) { camera.position.x += (Math.random() - 0.5) * shakeA * 0.3; camera.position.y += (Math.random() - 0.5) * shakeA * 0.3; shakeA *= 0.85; }
  sun.position.set(p.x + 20, 40, p.z + 10); sun.target.position.copy(p);
  renderer.render(scene, camera);
  // floaters (damage numbers) drawn to the HUD
  let html = `HP ${Math.round(ctx.state.player.hp)}/${ctx.state.player.maxHp}  LV ${ctx.state.run.level.toLocaleString()}  x${ctx.combat ? ctx.combat.mult() : 1}  ${ctx.state.run.equip.sword}<br>`;
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]; f.t += dt;
    if (f.t > 1.2) { floaters.splice(i, 1); continue; }
    tmpV.set(f.x, f.y + f.t * 0.8, f.z).project(camera);
    if (tmpV.z < 1) html += `<div style="position:fixed;left:${(tmpV.x * 0.5 + 0.5) * innerWidth}px;top:${(-tmpV.y * 0.5 + 0.5) * innerHeight}px;color:${f.kind === "levels" ? "#ffd84a" : f.kind === "crit" ? "#ffe066" : "#fff"};font-weight:700;text-shadow:0 1px 3px #000">${f.text}</div>`;
  }
  hudEl.innerHTML = html;
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot
try { localStorage.removeItem("tnrpg.save.v1"); } catch (e) { /* ignore */ }
ctx.save = await Save.init(ctx);
if (params.get("cycle") === "1") ctx.state.run.cycle = 1;
ctx.combat = await Combat.init(ctx);
ctx.state.rt.playing = true;
ctx.bus.emit("game:start", { newGame: true, cycle: ctx.state.run.cycle });
window.__dev = { ctx, player, log, setCycle(c) { ctx.save.newGame(c); ctx.bus.emit("run:reset", { cycle: c }); ctx.bus.emit("game:start", { newGame: true, cycle: c }); } };

if (MODE === "gallery" || MODE === "items") {
  const C = ctx.combat;
  // despawn the population, line up one of every kind
  for (const e of C.enemies) if (e.active) e.despawn();
  const kinds = MODE === "gallery" ? ["rat", "goldenRat", "villager", "fydor", "myles", "royalGuard", "shadowGuard", "rookie", "king", "ratKing", "cat"] : [];
  const xs = { rat: -9, goldenRat: -8, villager: -6.5, fydor: -4.5, myles: -2.5, royalGuard: -0.5, shadowGuard: 1.5, rookie: 3.5, king: 5.5, ratKing: 10, cat: 16 };
  for (const k of kinds) {
    const e = C.spawn(k, { x: xs[k], y: 0, z: k === "ratKing" || k === "cat" ? 4 : 0 }, { yaw: Math.PI * 0.85, aggro: false });
    e.peaceful = true; e.aggro = false; e.state = "idle";
  }
  player.teleport({ x: 0, y: 0, z: 30 }, 0);
  playerObj.visible = MODE === "items";
  const view = params.get("view") || "all";
  if (view === "all") { camera.position.set(3, 4.2, -14); camera.lookAt(3, 1, 1.5); }
  else if (view === "humans") { camera.position.set(-1.5, 1.9, -6.2); camera.lookAt(-1.5, 1.1, 0); }
  else if (view === "rats") { camera.position.set(-8.4, 0.9, -1.8); camera.lookAt(-8.4, 0.25, 0); }
  else if (view === "beasts") { camera.position.set(13, 3, -6); camera.lookAt(13, 1.2, 4); }
  if (MODE === "items") {
    player.teleport({ x: 0, y: 0, z: 0 }, Math.PI);
    camera.position.set(0, 1.5, -3.2); camera.lookAt(0, 1.1, 0);
    const id = params.get("item") || "iron_sword";
    if (id.endsWith("armor")) { ctx.combat.give(id); } else ctx.combat.give(id);
    const extra = params.get("crown"); if (extra) ctx.combat.give(extra);
  }
} else {
  player.teleport({ x: 0, y: 0, z: 10 }, 0);
}
requestAnimationFrame(frame);
window.__devReady = true;
