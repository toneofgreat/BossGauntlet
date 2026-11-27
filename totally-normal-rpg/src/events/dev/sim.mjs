// EVENTS headless logic simulation (node, no browser): mocks every other module per CONTRACT and drives the whole
// post-King story to every ending. Run:  node totally-normal-rpg/src/events/dev/sim.mjs
// Exit code 1 on any failed assertion or uncaught error.
import * as THREE from "../../../../platypus/vendor/three.module.js";

const log = [];
const errors = [];
const origWarn = console.warn;
console.warn = (...a) => { errors.push(a.map(String).join(" ")); origWarn("[warn]", ...a); };
function assert(c, msg) { if (!c) { console.error("ASSERT FAILED:", msg); process.exitCode = 1; throw new Error(msg); } else log.push("ok " + msg); }

// ------------------------------------------------------------------ mocks
function createBus() {
  const m = new Map();
  return {
    on(n, f) { if (!m.has(n)) m.set(n, []); m.get(n).push(f); return () => this.off(n, f); },
    off(n, f) { const a = m.get(n); if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } },
    emit(n, p) { const a = m.get(n); if (!a) return; for (const f of a.slice()) { try { f(p); } catch (e) { errors.push("bus " + n + " " + e.stack); } } },
  };
}
function createState() {
  return { v: 1, profile: { name: "Tester", onlineName: "Tester", secrets: {}, endings: {}, runs: 0, playMs: 0, signReads: 0, npcsTalked: {} },
    settings: { reduceFlashing: false, master: 0.8, music: 0.7, sfx: 0.9, sensitivity: 1, invertY: false, pointerLock: true, quality: "auto", showFps: false, hints: true },
    run: { cycle: 0, level: 0, phase: "intro", equip: { sword: "fists" }, owned: {}, kills: {}, villagerNoWood: 0, flags: {}, buried: {}, deaths: 0, startedAt: 0, kingWins: 0 },
    choiceSnapshot: null, player: { hp: 100, maxHp: 100, alive: true, invuln: 0, lastHurt: 0, lives: 0 },
    world: { zone: "lobby", region: "main" }, ui: { screen: "game", modal: false },
    rt: { playing: true, paused: false, timeScale: 1, god: false, fast: 1, cinematic: false, idleLock: false } };
}
const ctx = { THREE, bus: createBus(), state: createState() };
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 5000); camera.position.set(0, 2, 5);
const systems = [];
let idle = 0;
// physics mock: boxes (axis aligned, yaw ignored), ramps, cylinders; groundAt = highest top under yTop
const colliders = new Map(); let nextId = 1;
const physics = {
  addBox(o) { const id = nextId++; colliders.set(id, { kind: "box", ...o, en: true }); return id; },
  addCylinder(o) { const id = nextId++; colliders.set(id, { kind: "cyl", ...o, en: true }); return id; },
  addRamp(o) { const id = nextId++; colliders.set(id, { kind: "ramp", ...o, en: true }); return id; },
  addTrigger(o) { const id = nextId++; colliders.set(id, { kind: "trig", ...o, en: true }); return id; },
  move(id, c) { const k = colliders.get(id); if (k) k.center = { ...c }; },
  setEnabled(id, b) { const k = colliders.get(id); if (k) k.en = b; },
  remove(id) { colliders.delete(id); },
  clearTag(p) { for (const [id, c] of colliders) if ((c.tag || "").startsWith(p)) colliders.delete(id); },
  raycast() { return null; },
  setKillY() {},
  groundAt(x, z, yTop = 1e4) {
    let best = -1e9;
    for (const c of colliders.values()) {
      if (!c.en || c.kind !== "box" || c.walkable === false) continue;
      const top = c.center.y + c.size.y / 2;
      if (Math.abs(x - c.center.x) <= c.size.x / 2 && Math.abs(z - c.center.z) <= c.size.z / 2 && top <= yTop + 0.5 && top > best) best = top;
    }
    const r = terrainH(x, z); if (r > best && r <= yTop + 0.5) best = r;
    return { y: best, surface: "rock", id: 0 };
  },
};
function terrainH(x, z) { if (x > 2500) return -1e9; return 0; }
const player = {
  position: new THREE.Vector3(0, 0, 10), velocity: new THREE.Vector3(), yaw: 0, onGround: true, dodging: false, gravityMul: 1, speedMul: 1, jumpMul: 1,
  object: new THREE.Group(), avatar: { setVisible() {} }, moving: false,
  teleport(p, yaw) { this.position.set(p.x, p.y, p.z); if (yaw !== undefined) this.yaw = yaw; },
  setControl() {}, setLook() {}, knockback() {}, root() {}, play() { return Promise.resolve(); },
  forward(o) { return o.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }, isMoving() { return this.moving; }, isSprinting() { return false; },
  setMorph() {}, attach() {}, setNameTag() {}, lastSafe: new THREE.Vector3(),
};
const ctl = { set() {}, move() { return Promise.resolve(); }, follow() {}, firstPerson() {}, roll() {}, release() {} };
ctx.engine = {
  scene, camera, renderer: { domElement: { height: 720 } }, physics, player,
  addSystem(n, f, p = 50) { systems.push({ n, f, p }); systems.sort((a, b) => a.p - b.p); return () => {}; },
  yieldFrame: () => Promise.resolve(), time: 0,
  materials: { get: () => new THREE.MeshStandardMaterial() },
  terrain: { heightAt: terrainH, regionAt: () => "main", surfaceAt: () => "grass" },
  quality: { level: 2, onChange() {} },
  postfx: { flash() { log.push("flash"); }, set() {}, reset() {} },
  camera3p: { shake() {}, setFov() {}, setDistance() {}, take: () => ctl, owner: null },
  input: { idleSeconds: () => idle, invert() {}, setEnabled() {} },
  setAtmosphere() {}, pushAtmosphere() {}, popAtmosphere() {}, showRegion() {},
};
ctx.scene = scene; ctx.camera = camera;
const portals = {};
for (const id of ["kingPortal", "kingReturn", "lobbyBack", "desertBack", "desertExit", "forestBack", "homePortal"])
  portals[id] = { id, active: false, pos: { x: 0, y: 0, z: 0 }, onEnter: null, setActive(b) { this.active = b; }, setPos(p) { this.pos = { ...p }; } };
portals.desertBack.pos = { x: 0, y: 0, z: -1696 }; portals.forestBack.pos = { x: -1746, y: 0, z: 0 };
const interactables = new Map();
const zones = { lobby: { region: "main" }, graves: { region: "main" }, voidEdge: { region: "main" }, castle: { region: "main" }, throne: { region: "main" },
  kingDark: { region: "none" }, desert: { region: "desert" }, forest: { region: "forest" }, forestHouse: { region: "forest" },
  hollowDesert: { region: "hollowDesert" }, finalArena: { region: "none" } };
ctx.world = {
  zones, current: "lobby",
  point() { return null; }, waypoint() { return null; }, spawns() { return []; },
  async goto(z, o) { const prev = ctx.state.world.zone; ctx.state.world.zone = z; this.current = z; if (o && o.pos) player.teleport(o.pos, o.yaw); ctx.bus.emit("zone:exit", { id: prev }); ctx.bus.emit("zone:enter", { id: z, prev }); },
  registerZone(z) { zones[z.id] = z; },
  addInteractable(o) { interactables.set(o.id, o); return () => interactables.delete(o.id); },
  setInteractLabel() {}, portal: (id) => portals[id], gate: () => ({ open() {}, close() {} }),
  npc: () => ({ setVisible() {}, lookAt() {}, play() {} }), prop: () => new THREE.Object3D(), graves: [], resetRun() {},
};
let deathHandler = null; const hittables = new Map(); const owned = {};
ctx.combat = {
  level: () => 220000, addHittable(h) { hittables.set(h.id, h); return () => hittables.delete(h.id); },
  damagePlayer(raw) { ctx.state.player.hp -= raw; if (ctx.state.player.hp <= 0) { ctx.state.player.hp = 100; if (deathHandler) deathHandler({ source: "hollow" }); } return raw; },
  healPlayer() { ctx.state.player.hp = 100; }, killPlayer(src) { if (deathHandler) deathHandler({ source: src }); }, setInvuln() {},
  setDeathHandler(f) { deathHandler = f; }, give(id) { owned[id] = true; return true; }, has: (id) => !!owned[id], remove(id) { delete owned[id]; },
};
const endingsSeen = [];
ctx.story = {
  setPhase(p) { const prev = ctx.state.run.phase; ctx.state.run.phase = p; ctx.bus.emit("story:phase", { phase: p, prev }); },
  say() { return Promise.resolve(); }, secret(id) { ctx.state.profile.secrets[id] = Date.now(); return true; },
  async reachEnding(id) { ctx.state.rt.cinematic = true; ctx.state.profile.endings[id] = (ctx.state.profile.endings[id] || 0) + 1; this.setPhase("ended"); await ctx.events.playEnding(id); endingsSeen.push(id); ctx.state.rt.cinematic = false; },
  startCycle(n) { ctx.state.run = { ...createState().run, cycle: n, phase: n ? "ng" : "intro" }; ctx.bus.emit("run:reset", { cycle: n }); ctx.bus.emit("game:start", { newGame: true, cycle: n }); },
  remember() { ctx.state.run = JSON.parse(JSON.stringify(ctx.state.choiceSnapshot)); this.setPhase("choice"); ctx.events.enterChoice(); },
};
ctx.save = { snapshotChoice() { ctx.state.choiceSnapshot = JSON.parse(JSON.stringify(ctx.state.run)); }, write() {} };
const P = () => Promise.resolve(0);
ctx.ui = { fade: P, letterbox() {}, toast(t) { log.push("toast " + t); }, banner() {}, subtitle() {}, confirm: P, jumpscare: (k) => { log.push("jumpscare " + k); return P(); },
  showRedTitle: P, lives(n) { log.push("lives " + n); }, glitch() {}, fakeScreen: (k) => { log.push("fake " + k); return P(); }, prompt() {}, bossBar: { hide() {} } };
const handle = { stop() {}, setVol() {}, setPos() {} };
ctx.audio = new Proxy({}, { get: (t, k) => () => handle });

// ------------------------------------------------------------------ driver
globalThis.window = globalThis;
const Events = await import("../index.js");
ctx.events = await Events.init(ctx);
const bossEvents = [];
ctx.bus.on("boss:start", (p) => bossEvents.push("start " + p.id));
ctx.bus.on("boss:end", (p) => bossEvents.push("end " + p.id + " " + p.won));
const D = globalThis.__tnrpg || {};
const tick = () => new Promise((r) => setImmediate(r));
async function frames(n, dt = 1 / 30) {
  for (let i = 0; i < n; i++) { for (const s of systems) { try { s.f(dt, 0); } catch (e) { errors.push("system " + s.n + " " + e.stack); } } await tick(); }
}
async function until(pred, max = 6000, label = "") { for (let i = 0; i < max; i++) { if (pred()) return true; await frames(1); } const sq = ctx.events && globalThis.__tnrpg.events.seq; throw new Error("timeout waiting for " + label + " active=" + (ctx.events && ctx.events.active) + " timers=" + (sq ? JSON.stringify(sq.timers.map(t=>({k:t.kind,l:t.left}))) + " pending=" + sq.pending.size : "none") + " phase=" + ctx.state.run.phase); }
const phase = () => ctx.state.run.phase;
const evx = ctx.events;

async function main() {
  // King killed (cycle 0) -> postKing
  ctx.bus.emit("enemy:killed", { kind: "king" });
  await frames(3);
  assert(phase() === "postKing", "postKing phase after king kill");
  assert(portals.lobbyBack.active, "lobbyBack portal active");
  await ctx.world.goto("lobby", { pos: { x: 0, y: 0, z: 10 } }); await frames(100);
  // desert: walk 60 s
  await ctx.world.goto("desert", { pos: { x: 0, y: 0, z: -1700 }, yaw: Math.PI }); await frames(2);
  assert(evx.active === "desert" && phase() === "desert", "desert sequence active");
  player.moving = true; await frames(30 * 61); player.moving = false;
  assert(portals.desertExit.active, "desert exit portal placed after 60 s walking");
  const ep = portals.desertExit.pos; assert(Math.hypot(ep.x, ep.z + 2000) <= 300.01, "exit portal clamped within 300 m");
  await ctx.world.goto("forest", { pos: { x: -1752, y: 0, z: 0 } }); await frames(2);
  assert(evx.active === "forest" && phase() === "forest", "forest sequence");
  await frames(30 * 121);
  await until(() => evx.active === "forestHouse", 300, "forestHouse");
  await until(() => interactables.has("ev.houseDoor"), 600, "door interactable");
  interactables.get("ev.houseDoor").onUse();
  await until(() => evx.active === "chase", 900, "chase after jumpscare");
  assert(log.includes("jumpscare creature"), "creature jumpscare fired");
  // leg 1: get caught once, then reach the portal
  await frames(60);
  assert(portals.forestBack.onEnter, "forestBack override installed");
  portals.forestBack.onEnter(); await frames(30);
  assert(ctx.state.world.zone === "desert", "chase leg 2 in desert");
  portals.desertBack.onEnter(); await until(() => evx.active === "collapse", 300, "collapse");
  await frames(20);
  assert(ctx.state.world.zone === "collapse" || zones.collapse, "collapse zone registered");
  // run the collapse course by teleporting along it (checkpoints + fall respawn)
  for (const z of [30, 120, 210, 300, 395, 485]) { player.teleport({ x: 3000, y: physics.groundAt(3000, z).y, z }); await frames(10); }
  D.collapseCheckpoint(2); await frames(5);
  assert(Math.abs(player.position.z - 200) < 1, "collapse checkpoint respawn");
  ctx.combat.killPlayer("fall"); await frames(5);
  player.teleport({ x: 3000, y: 18.1, z: 600 }); player.onGround = true; await frames(5);
  await until(() => evx.active === "throne", 300, "throne");
  await until(() => D.events.fight && D.events.fight.core && D.events.fight.core.started, 900, "throne fight start");
  assert(bossEvents.includes("start hollow1"), "hollow1 boss:start");
  // fight a while (AI runs, damage player, death handler)
  await frames(30 * 20);
  const f1 = D.events.fight; const h1 = [...hittables.values()].find((h) => h.id === "hollow1");
  h1.onHit({ dmg: 1300, heavy: false, crit: false }); await frames(30);
  assert(f1.core.phase === 1, "throne phase 2 at 74%");
  ctx.combat.killPlayer("test"); await new Promise((r) => setTimeout(r, 1100)); await frames(10);
  assert(f1.core.hp === 3750, "phase checkpoint after death: " + f1.core.hp);
  h1.onHit({ dmg: 1300 }); await frames(30 * 5); h1.onHit({ dmg: 1300 }); await frames(30 * 8);
  assert(f1.core.phase === 3, "throne phase 4");
  D.winBoss(); await until(() => ctx.state.run.cycle === 1, 3000, "cycle 1 after throne");
  assert(ctx.state.profile.secrets.ngplus, "ngplus secret");
  assert(bossEvents.includes("end hollow1 true"), "hollow1 boss:end");
  await frames(10);
  // cycle 1 King
  ctx.state.run.phase = "ng"; ctx.bus.emit("enemy:killed", { kind: "king" }); await frames(5);
  assert(phase() === "ngPostKing" && portals.desertExit.active, "ngShortcut");
  assert(interactables.has("ev.forestHouseDoorFront"), "front door interactable");
  interactables.get("ev.forestHouseDoorFront").onUse();
  await until(() => interactables.has("ev.girl"), 600, "girl");
  assert(phase() === "hollowDesert", "hollowDesert phase");
  interactables.get("ev.girl").onUse();
  await until(() => evx.active === "hollow2", 900, "hollow2");
  assert(log.includes("jumpscare girl"), "girl jumpscare");
  assert(interactables.has("ev.ribbon"), "ribbon dropped");
  interactables.get("ev.ribbon").onUse(); assert(owned.girls_ribbon && ctx.state.profile.secrets.girlRibbon, "ribbon picked + secret");
  player.teleport({ x: 0, y: 0, z: -4150 }); await until(() => D.events.fight && D.events.fight.core && D.events.fight.core.started, 900, "hollow2 start");
  await frames(30 * 20);
  D.winBoss(); await until(() => phase() === "choice", 1500, "choice");
  assert(ctx.state.choiceSnapshot && ctx.state.choiceSnapshot.phase === "choice", "choice snapshot");
  await frames(10);
  assert(interactables.has("ev.blackSword") && ctx.state.rt.idleLock, "sword interactable + idle armed");
  // MONSTER
  await interactables.get("ev.blackSword").onUse(); await until(() => endingsSeen.includes("monster"), 1500, "monster ending");
  // remember -> WORLD (STORY's void interactable calls reachEnding)
  ctx.story.remember(); await until(() => interactables.has("ev.blackSword"), 300, "choice again");
  ctx.story.reachEnding("world"); await until(() => endingsSeen.includes("world"), 1500, "world ending");
  ctx.story.remember(); await until(() => interactables.has("ev.blackSword"), 300, "choice again 2");
  ctx.story.reachEnding("warrior"); await until(() => endingsSeen.includes("warrior"), 1500, "warrior ending");
  // idle 10 minutes -> final; lose -> idiot
  ctx.story.remember(); await until(() => interactables.has("ev.blackSword"), 300, "choice again 3");
  idle = 0; await frames(5); idle = 599; await frames(3);
  assert(evx.active === "choice", "not yet at 599 s");
  idle = 601; await until(() => evx.active === "final", 60, "final from idle");
  await until(() => D.events.fight && D.events.fight.core && D.events.fight.core.started, 1500, "final start");
  assert(ctx.state.player.lives === 3, "3 lives");
  await frames(30 * 40);
  D.loseBoss(); await until(() => endingsSeen.includes("idiot"), 1500, "idiot ending");
  // remember -> idle -> win -> winners -> rematch win -> sigma
  ctx.story.remember(); await until(() => interactables.has("ev.blackSword"), 300, "choice again 4");
  D.idle(); await until(() => D.events.fight && D.events.fight.core && D.events.fight.core.id === "hollow3" && D.events.fight.core.started, 1500, "final 2");
  const f3 = D.events.fight;
  for (const h of hittables.values()) if (h.id.startsWith("hollow3")) h.onHit({ dmg: 100 }); // not glowing: should be ignored by COMBAT via isAlive
  await frames(30 * 30);
  D.winBoss(); await until(() => endingsSeen.includes("winners"), 1500, "winners ending");
  evx.startFinal({ rematch: true }); await until(() => D.events.fight && D.events.fight.core && D.events.fight.core.id === "hollow3" && D.events.fight.core.started, 1500, "rematch");
  assert(ctx.state.player.lives === 1, "rematch 1 life");
  D.winBoss(); await until(() => endingsSeen.includes("sigma"), 1500, "sigma ending");
  // rematch death -> winners
  evx.startFinal({ rematch: true }); await until(() => D.events.fight && D.events.fight.core && D.events.fight.core.started, 1500, "rematch 2");
  ctx.combat.killPlayer("x"); await until(() => endingsSeen.filter((e) => e === "winners").length === 2, 1500, "rematch death -> winners");
  // reduce flashing path + reset
  ctx.state.settings.reduceFlashing = true; evx.trigger("rematch"); await frames(30 * 10);
  ctx.bus.emit("run:reset", { cycle: 0 }); await frames(5);
  assert(!evx.active && !ctx.state.rt.idleLock && ctx.state.player.lives === 0, "run reset clears state");
  console.log("endings:", endingsSeen.join(", "));
  console.log("boss events:", bossEvents.join(" | "));
}
try { await main(); } catch (e) { console.error("FAIL", e.stack || e); process.exitCode = 1; }
const real = errors.filter((e) => !/aborted/.test(e));
if (real.length) { console.error("errors/warnings:", real.slice(0, 20)); process.exitCode = 1; }
console.log(log.filter((l) => l.startsWith("ok")).length, "assertions passed;", real.length, "warnings");
process.exit(process.exitCode || 0);
