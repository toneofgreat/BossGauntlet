// WORLD (CONTRACT 6): builds every zone at init (progressively, yielding frames), owns zone tracking, the
// interactable registry, portals, gates, NPC bodies, graves, named props/points/spawns, run-state visuals
// (cycle-1 corruption, the "?" sign, Bram, gates, portals) and the desert wrap / pocket boundaries.

import { createKit } from "./kit.js";
import { createProps } from "./props.js";
import {
  ZONE_DEFS, POINTS, setPoint, buildSpawns, rng, zoneAtPure, GRAVE_NAMES, ROYAL_POSTS, GATES,
} from "./zones.js";
import { buildLobby } from "./lobby.js";
import { buildArea1 } from "./area1.js";
import { buildArea2 } from "./area2.js";
import { buildArea3 } from "./area3.js";
import { buildOffworld } from "./offworld.js";
import { buildNpcs, updateNpcs } from "./npcs.js";
import { buildPortals, makeGate } from "./portals.js";

const POST_KING_C0 = ["postKing", "desert", "forest", "forestHouse", "chase", "collapse", "throne"];
const POST_KING_C1 = ["ngPostKing", "hollowDesert", "girl", "hollow2", "choice", "finalBoss", "ended"];
const AFTER_HOLLOW2 = ["choice", "finalBoss", "ended"];
const DESERT_C = { x: 0, z: -2000 }, DESERT_WRAP = 330, DESERT_LAND = 322;
const fmt = (n) => Math.round(n).toLocaleString("en-US");

export async function init(ctx) {
  const THREE = ctx.THREE, engine = ctx.engine || {}, bus = ctx.bus, state = ctx.state;
  const warn = (e) => console.warn("[world]", e);
  const yieldFrame = () => (engine.yieldFrame ? engine.yieldFrame() : Promise.resolve());
  const K = createKit(ctx);
  const P = createProps(K);
  const worldRoot = new THREE.Group();
  worldRoot.name = "world";
  (ctx.scene || engine.scene).add(worldRoot);
  const terrain = engine.terrain;
  const h = (x, z) => {
    if (!terrain || !terrain.heightAt) return 0;
    const y = terrain.heightAt(x, z);
    return y > -1e8 ? y : 0;
  };
  const rawH = (x, z) => (terrain && terrain.heightAt ? terrain.heightAt(x, z) : -1e9);

  // ------------------------------------------------------------------ zones
  const defs = [];
  const zones = {};
  for (const d of ZONE_DEFS) {
    const root = new THREE.Group();
    root.name = "zone:" + d.id;
    worldRoot.add(root);
    const zone = { id: d.id, name: d.name, region: d.region, atmo: d.atmo, music: d.music,
      bounds: Object.assign({}, d.bounds), spawn: { pos: Object.assign({}, d.spawn.pos), yaw: d.spawn.yaw }, root, view: d.view || 400 };
    zones[d.id] = zone;
    defs.push(zone);
  }
  // per-zone build kits + point systems
  const kits = {}, fxs = {};
  const fxList = [];
  function zoneKit(id) {
    let e = kits[id];
    if (!e) {
      const zone = zones[id];
      const fx = {
        flames: K.points("flame"), torchFlames: K.points("flame"), smoke: K.points("smoke", { color: "#cfcac2", color2: "#a8a49c" }),
        mist: K.points("mist", { color: "#eef2f4", color2: "#dfe6ea" }), motes: K.points("mote", { color: "#ffe2a8", color2: "#ffd080" }),
      };
      fxs[id] = fx;
      fxList.push({ id, fx });
      e = kits[id] = { z: K.zone(id, zone.root), fx, root: zone.root };
    }
    return e;
  }

  // ------------------------------------------------------------------ shared registries
  const props = {};
  const anims = [];            // { zone, fn, maxDist }
  const watchers = [];
  const punches = [];          // { mesh, pred }
  const lightAnchors = [];     // { zone, x, y, z, color, intensity, distance, flicker }
  const sounds = [];           // { id, pos, radius, handle }
  const gateVis = {};
  let signObj = null, graveList = [], forestDoorRef = null;
  const phys = engine.physics;
  const colEnabled = (id, v) => { if (id != null && id >= 0 && phys && phys.setEnabled) { try { phys.setEnabled(id, !!v); } catch (e) { warn(e); } } };

  const W = {
    K, P, THREE, ctx, engine, h, rng, zones, worldRoot, yieldFrame, GRAVE_NAMES, ROYAL_POSTS,
    zone: zoneKit,
    subKit(id, group) { return K.zone(id, group); },
    prop(id, obj) { props[id] = obj; },
    point(name, x, y, z) { setPoint(name, x, y, z); },
    light(zone, l, o) { lightAnchors.push({ zone, x: l.position.x, y: l.position.y, z: l.position.z, color: l.color.clone(), intensity: (o && o.base) || l.intensity, distance: l.distance || 12, flicker: !!(o && o.flicker) }); },
    colEnabled,
    watch(fn) { watchers.push(fn); },
    punch(mesh, pred) { mesh.visible = false; punches.push({ mesh, pred }); },
    addToLayer(group, mesh) { group.add(mesh); },
    signObject(g) { signObj = g; },
    graves(list) { graveList = list; },
    anim(zone, fn, maxDist) { anims.push({ zone, fn, maxDist: maxDist || 120 }); },
    sound(id, pos, radius) { sounds.push({ id, pos, radius: radius || 60, handle: null }); },
    gateVisual(id, vis) { gateVis[id] = vis; },
    forestDoor(door, pos) { forestDoorRef = { door, pos }; },
  };

  // ------------------------------------------------------------------ build everything (progressive)
  const steps = [
    () => buildLobby(W), () => buildArea1(W), () => buildArea2(W), () => buildArea3(W), () => buildOffworld(W),
  ];
  const mark = (p) => { try { if (globalThis.__phase !== undefined) { globalThis.__phase = "world:" + p; (globalThis.__marks = globalThis.__marks || []).push(p + "@" + Math.round(performance.now())); } } catch (e) { /* */ } };
  for (let si = 0; si < steps.length; si++) {
    const s = steps[si];
    mark("build" + si);
    try { await s(); } catch (e) { console.warn("[world] build step failed", e); }
    await yieldFrame();
  }
  // collapse static multi-mesh props into one mesh per material (draw calls)
  for (const v of Object.values(gateVis)) { for (const hg of v.leaves || []) K.bake(hg); if (v.lift) K.bake(v.lift); }
  for (const id of ["throne", "shovel", "ratKingGate"]) if (props[id]) K.bake(props[id]);
  if (props.trapdoor) for (const hg of props.trapdoor.children) K.bake(hg);
  // kittens on the lobby roof and the house-1 chimney
  for (const k of ["kitten0", "kitten2"]) {
    const p = POINTS[k];
    const m = P.kitten(k === "kitten0" ? "#3a3634" : "#c08a50");
    m.position.set(p.x, p.y, p.z);
    m.rotation.y = k === "kitten0" ? 0.6 : -0.4;
    (k === "kitten0" ? zones.lobby : zones.village).root.add(m);
    props[k] = m;
  }
  W.sound("river", { x: 0, y: 0, z: 60 }, 70);
  W.anim("lobby", kittenAnim, 80); W.anim("ratField", kittenAnim, 80); W.anim("village", kittenAnim, 80);
  function kittenAnim(dt, t) {
    for (let i = 0; i < 3; i++) {
      const k = props["kitten" + i];
      if (!k || !k.visible) continue;
      const u = k.userData;
      if (u.tail) u.tail.rotation.z = Math.sin(t * 1.3 + i) * 0.5;
      if (u.head) u.head.rotation.y = Math.sin(t * 0.37 + i * 2) * 0.6;
    }
  }
  mark("fx");
  // build the per-zone point systems
  for (const { id, fx } of fxList) {
    const root = zones[id] ? zones[id].root : worldRoot;
    for (const k of Object.keys(fx)) { try { fx[k].build(root); } catch (e) { warn(e); } }
  }
  // NPCs + portals + gates
  mark("npcs");
  let npcs = {};
  try { npcs = await buildNpcs(W); } catch (e) { console.warn("[world] npcs", e); }
  const npcList = Object.values(npcs);
  if (signObj) {
    npcs.sign = { id: "sign", root: signObj, pos: signObj.position, human: null, lookAt() {}, setVisible(v) { signObj.visible = !!v; }, play() { return Promise.resolve(); } };
  }
  // distance-cull loose props (animals, doors, buckets, NPC bodies...) through an identity wrapper so prop
  // visibility owned by STORY/EVENTS is never overwritten
  {
    const box = new THREE.Box3(), c = new THREE.Vector3(), sz = new THREE.Vector3();
    for (const zone of defs) {
      const root = zone.root;
      for (const ch of root.children.slice()) {
        if (ch.isPoints || ch.isLight || (ch.name && ch.name.startsWith(zone.id + ":")) || ch.material === K.punchMat) continue;
        box.setFromObject(ch, true);
        if (box.isEmpty()) continue;
        box.getSize(sz); box.getCenter(c);
        if (Math.max(sz.x, sz.y, sz.z) > 8) continue;
        if (!(ch.name && ch.name.startsWith("npc:")) && !Object.keys(ch.userData).length) {
          let ok = true;
          ch.traverse((o) => { if (o !== ch && ((!o.isMesh && !o.isGroup && o.type !== "Object3D") || Object.keys(o.userData).some((k) => k !== "keep"))) ok = false; });
          if (ok) K.bake(ch);
        }
        const wrap = new THREE.Group(); wrap.name = "lod";
        root.add(wrap); wrap.add(ch);
        const npc = ch.name && ch.name.startsWith("npc:");
        K.lodGroups.push({ group: wrap, anchor: { x: c.x, y: c.y, z: c.z }, dist: npc ? 110 : 70, radius: sz.length() / 2, live: npc ? ch : null });
      }
    }
  }
  // far mode: beyond ~130 m a zone keeps only its 'main' silhouettes (other layers move to an unrendered
  // THREE layer, which leaves the visible flags owned by cycle/LOD logic alone)
  for (const zone of defs) {
    zone._far = []; zone._cast = [];
    zone._near = true; zone._shadow = true;
    zone.root.traverse((o) => { if (o.isMesh && o.castShadow && !o.isSkinnedMesh) zone._cast.push(o); });
    for (const ch of zone.root.children) {
      if (ch.name === zone.id + ":main") continue;
      if (!ch.name || !ch.name.startsWith(zone.id + ":")) continue;
      ch.traverse((o) => { if (o.isMesh || o.isPoints) zone._far.push(o); });
    }
  }
  const { portals, list: portalList } = buildPortals(W);
  const gates = {};
  for (const id of Object.keys(GATES)) if (gateVis[id]) gates[id] = makeGate(W, id, gateVis[id]);
  for (const g of Object.values(gates)) g.close();
  const spawnTable = buildSpawns();

  // one shared PointLight (constant light count: no shader recompiles when zones change)
  const sharedLight = new THREE.PointLight("#ffb060", 0, 12, 2);
  sharedLight.castShadow = false;
  worldRoot.add(sharedLight);
  let lightAnchor = null;

  // ------------------------------------------------------------------ interactables
  const inter = [];
  let focus = null, focusLabel = null;
  function addInteractable(o) {
    const e = { id: o.id, pos: o.pos, radius: o.radius || 2.5, label: o.label || "Interact", enabled: o.enabled || null,
      onUse: o.onUse || null, priority: o.priority || 0 };
    inter.push(e);
    return () => { const i = inter.indexOf(e); if (i >= 0) inter.splice(i, 1); if (focus === e) setFocus(null); };
  }
  function setFocus(e) {
    const label = e ? e.label : null;
    if (e === focus && label === focusLabel) return;
    focus = e; focusLabel = label;
    bus.emit("interact:focus", e ? { id: e.id, label: e.label } : { id: null });
  }
  const _fwd = new THREE.Vector3();
  function updateFocus() {
    const pl = engine.player;
    if (!pl || !state.rt.playing || state.ui.modal || state.rt.cinematic || state.rt.paused) { setFocus(null); return; }
    const pp = pl.position;
    if (pl.forward) pl.forward(_fwd); else _fwd.set(Math.sin(pl.yaw || 0), 0, Math.cos(pl.yaw || 0));
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < inter.length; i++) {
      const e = inter[i], p = e.pos;
      if (!p) continue;
      const dx = p.x - pp.x, dy = (p.y || 0) - pp.y, dz = p.z - pp.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > e.radius * e.radius || dy > 3.2 || dy < -2.6) continue;
      const d = Math.sqrt(d2);
      if (d > 1.0 && (dx * _fwd.x + dz * _fwd.z) / d < 0.2) continue;
      let ok = true;
      if (e.enabled) { try { ok = !!e.enabled(); } catch (err) { ok = false; } }
      if (!ok) continue;
      const score = e.priority * 1000 - d;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    setFocus(best);
  }
  bus.on("input:interact", () => {
    try {
      updateFocus();
      const e = focus;
      if (!e) return;
      if (e.onUse) e.onUse();
      bus.emit("interact:use", { id: e.id });
    } catch (err) { warn(err); }
  });
  // fallback for the basement hatch (STORY may register its own with a higher priority)
  {
    const trap = props.trapdoor, rug = props.lobbyRug;
    const hatchPos = { x: 2, y: 0.35, z: -2.2 };
    addInteractable({ id: "world.trapdoor", pos: hatchPos, radius: 2.2, priority: -5, label: "Lift the rug",
      enabled: () => !!(trap && trap.userData.isOpen && !trap.userData.isOpen()),
      onUse: () => {
        if (rug && rug.position.x === rug.userData.home.x) { rug.position.x += 2.1; rug.rotation.y = 0.15; setInteractLabel("world.trapdoor", "Open the trapdoor"); sfx("creak", hatchPos); return; }
        trap.userData.setOpen(true); sfx("door_open", hatchPos);
      } });
  }
  function setInteractLabel(id, label) {
    for (const e of inter) if (e.id === id) e.label = label;
    if (focus && focus.id === id) { focusLabel = null; setFocus(focus); }
  }
  // the forest-house door opens when an interactable placed at it is used (EVENTS' "Open the door"/door out)
  bus.on("interact:use", (p) => {
    try {
      if (!forestDoorRef || !p || !p.id) return;
      const e = inter.find((x) => x.id === p.id);
      if (!e || !e.pos) return;
      const d = forestDoorRef.pos;
      if (Math.hypot(e.pos.x - d.x, e.pos.z - d.z) < 3.2) { forestDoorRef.door.userData.setOpen(true); sfx("door_open", { x: d.x, y: d.y + 1, z: d.z }); }
    } catch (err) { warn(err); }
  });
  function sfx(id, pos) { const au = ctx.audio; if (au && au.sfx) { try { au.sfx(id, pos ? { pos } : undefined); } catch (e) { /* */ } } }
  function toast(text, kind) { const ui = ctx.ui; if (ui && ui.toast) { try { ui.toast(text, { kind: kind || "warn" }); } catch (e) { /* */ } } }

  // ------------------------------------------------------------------ zone tracking
  let current = null;
  let curRegion = "main";
  function zoneAt(x, y, z) { return zoneAtPure(defs, x, y, z); }
  function setZone(id, o) {
    o = o || {};
    const zone = zones[id];
    if (!zone) return;
    const prev = current;
    if (prev === id && !o.force) return;
    current = id;
    state.world.zone = id;
    state.world.region = zone.region;
    if (prev && prev !== id) bus.emit("zone:exit", { id: prev });
    bus.emit("zone:enter", { id, prev: o.prevNull ? null : prev });
    if (engine.setAtmosphere) { try { engine.setAtmosphere(zone.atmo, { dur: o.instant ? 0.05 : 2 }); } catch (e) { warn(e); } }
    if (zone.region !== curRegion || o.force) {
      curRegion = zone.region;
      if (engine.showRegion) { try { engine.showRegion(zone.region); } catch (e) { warn(e); } }
    }
    const au = ctx.audio;
    if (au && au.zoneMusic && zone.music) { try { au.zoneMusic(zone.music, { delay: o.delay || 0 }); } catch (e) { warn(e); } }
    updateVisibility(true);
  }
  function distToBounds(b, x, z) {
    const dx = x < b.x0 ? b.x0 - x : x > b.x1 ? x - b.x1 : 0;
    const dz = z < b.z0 ? b.z0 - z : z > b.z1 ? z - b.z1 : 0;
    return Math.sqrt(dx * dx + dz * dz);
  }
  let qMul = 1;
  function updateVisibility() {
    const cam = ctx.camera || engine.camera;
    const cx = cam ? cam.position.x : 0, cz = cam ? cam.position.z : 0;
    for (const zone of defs) {
      if (!zone.root) continue;
      let v = zone.region === curRegion && (zone.region !== "none" || zone.id === current);
      let dist = 0;
      if (v && zone.region === "main") { dist = distToBounds(zone.bounds, cx, cz); v = dist < zone.view * qMul; }
      const near = dist < 130 * qMul;
      if (zone._far && near !== zone._near) { zone._near = near; for (const o of zone._far) o.layers.set(near ? 0 : 31); }
      const sh = dist < 55 * qMul;
      if (zone._cast && sh !== zone._shadow) { zone._shadow = sh; for (const o of zone._cast) o.castShadow = sh; }
      if (zone.root.visible !== v) zone.root.visible = v;
    }
    for (const lg of K.lodGroups) {
      if (lg.live) { lg.anchor.x = lg.live.position.x; lg.anchor.z = lg.live.position.z; }
      const a = lg.anchor;
      if (!a) continue;
      const dx = a.x - cx, dz = a.z - cz;
      const r = lg.dist * qMul + (lg.radius || 0);
      const v = dx * dx + dz * dz < r * r;
      if (lg.group.visible !== v) lg.group.visible = v;
    }
    for (const p of portalList) {
      if (!p._active && p._scale <= 0) continue;
      const zid = zoneAt(p.pos.x, p.pos.y, p.pos.z);
      const zr = zid ? zones[zid].region : "none";
      const pdx = p.pos.x - cx, pdz = p.pos.z - cz;
      p.root.visible = (zr === curRegion && (zr !== "none" || zid === current)) && (p._active || p._scale > 0) && pdx * pdx + pdz * pdz < 160 * 160;
    }
  }
  function applyQuality(level) {
    qMul = [0.5, 0.75, 1, 1.25][level] || 1;
    for (const { fx } of fxList) {
      if (fx.motes.object) fx.motes.object.visible = level >= 1;
      if (fx.mist.object) fx.mist.object.visible = level >= 1;
    }
  }
  if (engine.quality) {
    applyQuality(engine.quality.level | 0);
    if (engine.quality.onChange) engine.quality.onChange((l) => applyQuality(l | 0));
  }

  // ------------------------------------------------------------------ goto / points / spawns
  function resolvePos(pos) {
    const out = { x: pos.x, y: pos.y || 0, z: pos.z };
    const th = rawH(pos.x, pos.z);
    // snap up to terrain unless the point is clearly underground (basement / caves: a pocket under the heightfield)
    if (th > -1e8 && (out.y === 0 || (th > out.y && th - out.y < 1.5))) out.y = th;
    return out;
  }
  function teleport(pos, yaw) {
    const pl = engine.player;
    if (!pl) return;
    const p = resolvePos(pos);
    p.y += 0.05;
    try { if (pl.teleport) pl.teleport(p, yaw); else pl.position.set(p.x, p.y, p.z); } catch (e) { warn(e); }
  }
  let portalCooldown = 0;
  async function goto(zoneId, o) {
    o = o || {};
    const zone = zones[zoneId];
    if (!zone) { warn("goto: unknown zone " + zoneId); return; }
    const fade = o.fade !== false;
    const ui = ctx.ui;
    portalCooldown = 1.5;
    if (fade && ui && ui.fade) { try { await ui.fade(1, 0.45); } catch (e) { /* */ } }
    const pos = o.pos || zone.spawn.pos, yaw = o.yaw != null ? o.yaw : zone.spawn.yaw;
    // show the destination region first so the ground exists when we land
    curRegion = zone.region;
    if (engine.showRegion) { try { engine.showRegion(zone.region); } catch (e) { warn(e); } }
    teleport(pos, yaw);
    setZone(zoneId, { force: true, instant: fade });
    if (fade && ui && ui.fade) { try { await ui.fade(0, 0.6); } catch (e) { /* */ } }
  }
  function point(name) {
    const p = POINTS[name];
    if (!p) return null;
    return { x: p.x, y: p.t ? h(p.x, p.z) : p.y, z: p.z };
  }
  function spawns(kind) {
    const l = spawnTable[kind];
    if (!l) return [];
    return l.map((s) => ({ pos: Object.assign({}, s.pos), yaw: s.yaw, radius: s.radius }));
  }

  // ------------------------------------------------------------------ run state
  function applyCycle(cycle) {
    const c1 = cycle >= 1;
    for (const cg of K.cycleGroups) cg.group.visible = c1 ? cg.cycle === 1 : cg.cycle === 0;
    P.setCycleEyes(cycle);
    for (const n of npcList) { try { if (n.human && n.human.setEyes) n.human.setEyes(c1 ? "red" : "normal"); } catch (e) { /* */ } }
    if (signObj && signObj.userData.setCycle) signObj.userData.setCycle(cycle);
  }
  function resetProps() {
    const chair = props.lobbyRockingChair; if (chair) chair.rotation.x = 0;
    const rug = props.lobbyRug; if (rug && rug.userData.home) { rug.position.copy(rug.userData.home); rug.rotation.y = 0; }
    setInteractLabel("world.trapdoor", "Lift the rug");
    const trap = props.trapdoor; if (trap && trap.userData.setOpen) trap.userData.setOpen(false);
    const b = props.wellBucket; if (b) { b.position.y = b.userData.restY; b.visible = true; }
    for (const k of ["kitten0", "kitten1", "kitten2", "shovel", "letter", "cactusFlower", "totem", "voidFence"]) if (props[k]) props[k].visible = true;
    if (props.throneDoor) props.throneDoor.userData.setClosed(false);
    if (props.throneCrack) props.throneCrack.visible = false;
    if (props.throneTorches) { props.throneTorches.userData.setColor("#ffb060"); props.throneTorches.userData.setVisible(true); }
    if (props.ratKingGate) props.ratKingGate.userData.setClosed(false);
    if (props.barnLamp) props.barnLamp.userData.setLit(true);
    if (props.forestHouseDoor) props.forestHouseDoor.userData.setOpen(false);
    if (props.glassRing) props.glassRing.userData.setRaised(0, 0);
    if (props.throne) { props.throne.visible = true; props.throne.rotation.set(0, 0, 0); }
    for (const g of graveList) g.setBuried(false);
  }
  function resetRun() {
    for (const g of Object.values(gates)) g.close();
    for (const p of portalList) p._reset();
    if (npcs.bram) npcs.bram.setVisible(true);
    for (const n of npcList) n.lookAt(null);
    resetProps();
    applyCycle(state.run.cycle | 0);
  }
  function applyRunState() {
    const run = state.run, cycle = run.cycle | 0, phase = run.phase;
    applyCycle(cycle);
    const combat = ctx.combat;
    for (const id of Object.keys(gates)) {
      let ok = false;
      try { ok = !!(combat && combat.canEnter && combat.canEnter(id).ok); } catch (e) { ok = false; }
      if (ok) gates[id].open(false); else gates[id].close();
    }
    const postKing = cycle === 0 ? POST_KING_C0.includes(phase) : POST_KING_C1.includes(phase);
    if (postKing) portals.lobbyBack.setActive(true);
    if (cycle >= 1 && POST_KING_C1.includes(phase)) { portals.desertExit.setPos(point("desertExitNg")); portals.desertExit.setActive(true); }
    if (AFTER_HOLLOW2.includes(phase)) portals.homePortal.setActive(true);
    if (npcs.bram) npcs.bram.setVisible(!(cycle === 0 && POST_KING_C0.includes(phase)));
    const buried = run.buried || {};
    for (const g of graveList) g.setBuried(!!buried[g.id]);
  }
  bus.on("run:reset", () => { try { resetRun(); } catch (e) { warn(e); } });
  bus.on("game:start", () => {
    try {
      applyRunState();
      const pl = engine.player;
      const pp = pl ? pl.position : { x: 0, y: 0, z: 10 };
      const id = zoneAt(pp.x, pp.y, pp.z) || "lobby";
      current = null;
      setZone(id, { force: true, prevNull: true, delay: 4, instant: true });
    } catch (e) { warn(e); }
  });
  bus.on("unlock", (p) => {
    try {
      const g = p && gates[p.id];
      if (g && !g.isOpen) { g.open(true); bus.emit("gate:open", { id: p.id }); }
    } catch (e) { warn(e); }
  });
  // the Rat King's arena gate closes behind you for the fight
  let rkTimer = null;
  bus.on("boss:start", (p) => { try { if (p && p.kind === "ratKing" && props.ratKingGate) { if (rkTimer) rkTimer(); rkTimer = null; props.ratKingGate.userData.setClosed(true); } } catch (e) { warn(e); } });
  bus.on("boss:end", (p) => {
    try {
      if (!p || p.kind !== "ratKing" || !props.ratKingGate) return;
      const open = () => { rkTimer = null; props.ratKingGate.userData.setClosed(false); };
      if (engine.after) rkTimer = engine.after(p.won ? 10 : 1, open); else setTimeout(open, p.won ? 10000 : 1000);
    } catch (e) { warn(e); }
  });
  bus.on("player:respawn", () => { try { if (props.ratKingGate && !(ctx.combat && ctx.combat.fightActive && ctx.combat.fightActive())) props.ratKingGate.userData.setClosed(false); } catch (e) { warn(e); } });
  bus.on("zone:enter", (p) => {
    try {
      if (p && p.id === "forestHouse" && forestDoorRef && engine.player && engine.player.position.x < -2155.3) { forestDoorRef.door.userData.setOpen(false); const d = forestDoorRef.door.position; sfx("door_close", { x: d.x, y: d.y + 1, z: d.z }); }
    } catch (e) { warn(e); }
  });

  // ------------------------------------------------------------------ portals + gates (entry checks)
  const gateCooldown = {};
  function checkPortals(dt) {
    portalCooldown = Math.max(0, portalCooldown - dt);
    const pl = engine.player;
    if (!pl || !state.rt.playing || state.rt.paused || portalCooldown > 0 || state.ui.modal) return;
    const pp = pl.position;
    for (let i = 0; i < portalList.length; i++) {
      const p = portalList[i];
      if (!p._active || p._scale < 0.6) continue;
      const dx = pp.x - p.pos.x, dz = pp.z - p.pos.z, dy = pp.y - p.pos.y;
      if (dx * dx + dz * dz > 1.3 * 1.3 || dy < -1.5 || dy > 2.8) continue;
      enterPortal(p);
      return;
    }
  }
  function enterPortal(p) {
    portalCooldown = 2;
    const d = p.def;
    if (p.id === "kingPortal") {
      let res = { ok: true, need: 0, have: 0 };
      try { if (ctx.combat && ctx.combat.canEnter) res = ctx.combat.canEnter("kingPortal") || res; } catch (e) { warn(e); }
      if (!res.ok) {
        bus.emit("portal:denied", { id: p.id, need: res.need, have: res.have });
        toast(`Requires ${fmt(res.need)} levels (you have ${fmt(res.have)})`);
        const pl = engine.player;
        if (pl && pl.knockback) { try { pl.knockback({ x: 0, y: 2, z: -5 }); } catch (e) { /* */ } }
        return;
      }
    }
    bus.emit("portal:enter", { id: p.id, to: d.to });
    sfx("portal_enter", { x: p.pos.x, y: p.pos.y + 1.6, z: p.pos.z });
    if (typeof p.onEnter === "function") { try { p.onEnter(); } catch (e) { warn(e); } return; }
    const a = point(d.arrive) || zones[d.to].spawn.pos;
    goto(d.to, { pos: a, yaw: d.arriveYaw });
  }
  function checkGates() {
    const pl = engine.player;
    if (!pl || !state.rt.playing) return;
    const pp = pl.position;
    for (const id of Object.keys(gates)) {
      const g = gates[id];
      if (g.isOpen) continue;
      const gp = g.vis.pos;
      const dx = pp.x - gp.x, dz = pp.z - gp.z;
      if (Math.abs(dx) > 4 || dz > 0 || dz < -4.5) continue;
      let res = { ok: false, need: 0, have: 0 };
      try { if (ctx.combat && ctx.combat.canEnter) res = ctx.combat.canEnter(id) || res; } catch (e) { warn(e); }
      if (res.ok) { g.open(true); bus.emit("gate:open", { id }); continue; }
      const now = engine.realTime || performance.now() / 1000;
      if (gateCooldown[id] && now - gateCooldown[id] < 3.5) continue;
      gateCooldown[id] = now;
      bus.emit("portal:denied", { id, need: res.need, have: res.have });
      toast(`Requires ${fmt(res.need)} levels (you have ${fmt(res.have)})`);
    }
  }

  // ------------------------------------------------------------------ desert wrap
  const _vel = new THREE.Vector3();
  function desertWrap() {
    const pl = engine.player;
    if (!pl || curRegion !== "desert") return;
    const pp = pl.position;
    const dx = pp.x - DESERT_C.x, dz = pp.z - DESERT_C.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < DESERT_WRAP * DESERT_WRAP) return;
    const v = pl.velocity;
    if (v && dx * v.x + dz * v.z < 0) return;          // already heading back in
    const d = Math.sqrt(d2), k = DESERT_LAND / d;
    const nx = DESERT_C.x - dx * k, nz = DESERT_C.z - dz * k;
    if (v) _vel.copy(v);
    const yaw = pl.yaw;
    teleport({ x: nx, y: 0, z: nz }, yaw);
    if (v) v.copy(_vel);
  }

  // ------------------------------------------------------------------ per-frame system
  const _cam = { x: 0, y: 0, z: 0 };
  let acc4 = 0, acc10 = 0, lightPhase = 0;
  function tick4() {
    const pl = engine.player;
    if (pl && state.rt.playing) {
      const pp = pl.position;
      const id = zoneAt(pp.x, pp.y, pp.z);
      if (id && id !== current) setZone(id);
      checkGates();
    }
    updateVisibility();
    for (let i = 0; i < watchers.length; i++) { try { watchers[i](); } catch (e) { warn(e); } }
    // shared light: nearest visible anchor within 35 m
    let best = null, bd = 35 * 35;
    for (const a of lightAnchors) {
      const z = zones[a.zone];
      if (z && !z.root.visible) continue;
      const dx = a.x - _cam.x, dy = a.y - _cam.y, dz = a.z - _cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bd) { bd = d2; best = a; }
    }
    if (best !== lightAnchor) {
      lightAnchor = best;
      if (best) { sharedLight.position.set(best.x, best.y, best.z); sharedLight.color.copy(best.color); sharedLight.distance = best.distance; }
    }
    // ambient loops
    const au = ctx.audio;
    if (au && au.loop) {
      for (const s of sounds) {
        const dx = s.pos.x - _cam.x, dz = s.pos.z - _cam.z, d2 = dx * dx + dz * dz;
        const zid = zoneAt(s.pos.x, s.pos.y, s.pos.z);
        const inRegion = !zid || zones[zid].region === curRegion;
        if (!s.handle && inRegion && state.rt.playing && d2 < s.radius * s.radius) { try { s.handle = au.loop(s.id, { pos: s.pos, vol: 0.8 }); } catch (e) { s.handle = null; } }
        else if (s.handle && (!inRegion || d2 > (s.radius + 15) * (s.radius + 15))) { try { s.handle.stop(0.8); } catch (e) { /* */ } s.handle = null; }
      }
    }
  }
  function update(dt, t) {
    try {
      const cam = ctx.camera || engine.camera;
      if (cam) { _cam.x = cam.position.x; _cam.y = cam.position.y; _cam.z = cam.position.z; }
      const r = ctx.renderer || engine.renderer;
      K.tick(t, r && r.domElement ? r.domElement.height : 720, cam ? cam.fov : 60);
      acc4 += dt; acc10 += dt;
      if (acc4 >= 0.25) { acc4 = 0; tick4(); }
      if (acc10 >= 0.1) { acc10 = 0; updateFocus(); }
      checkPortals(dt);
      desertWrap();
      for (let i = 0; i < portalList.length; i++) {
        const p = portalList[i];
        const dx = p.pos.x - _cam.x, dz = p.pos.z - _cam.z;
        p._tick(dt, dx * dx + dz * dz);
      }
      for (const id in gates) gates[id]._tick(dt);
      for (let i = 0; i < anims.length; i++) {
        const a = anims[i], z = zones[a.zone];
        if (z && !z.root.visible) continue;
        if (z) {
          const dist = distToBounds(z.bounds, _cam.x, _cam.z);
          if (dist > a.maxDist) continue;
        }
        a.fn(dt, t);
      }
      for (let i = 0; i < punches.length; i++) {
        const pu = punches[i];
        const v = !!(pu.mesh.parent && pu.mesh.parent.visible) && pu.pred(_cam);
        if (pu.mesh.visible !== v) pu.mesh.visible = v;
      }
      if (lightAnchor) {
        lightPhase += dt;
        const f = lightAnchor.flicker ? 0.86 + 0.08 * Math.sin(lightPhase * 13.7) + 0.06 * Math.sin(lightPhase * 31.3 + 1.7) : 1;
        sharedLight.intensity = lightAnchor.intensity * f;
      } else sharedLight.intensity = 0;
      const pl = engine.player;
      updateNpcs(npcs, npcList, dt, pl ? pl.position : null, _cam);
    } catch (e) { warn(e); }
  }
  if (engine.addSystem) engine.addSystem("world", update, 50);

  mark("prewarm");
  // ------------------------------------------------------------------ initial state + pre-warm
  resetRun();
  current = "lobby"; state.world.zone = "lobby"; state.world.region = "main";
  updateVisibility();
  try {
    const r = ctx.renderer || engine.renderer, cam = ctx.camera || engine.camera;
    if (r && r.compile && cam && ctx.scene) {
      const vis = defs.map((z) => z.root.visible);
      const lods = K.lodGroups.map((l) => l.group.visible);
      for (const z of defs) z.root.visible = true;
      for (const l of K.lodGroups) l.group.visible = true;
      for (const cg of K.cycleGroups) cg.group.visible = true;
      r.compile(ctx.scene, cam);
      defs.forEach((z, i) => { z.root.visible = vis[i]; });
      K.lodGroups.forEach((l, i) => { l.group.visible = lods[i]; });
      applyCycle(state.run.cycle | 0);
    }
  } catch (e) { warn(e); }

  mark("done");
  // ------------------------------------------------------------------ API
  const api = {
    zones, root: worldRoot,
    get current() { return current; },
    zoneAt,
    registerZone(zone) {
      if (!zone || !zone.id) return;
      const z = Object.assign({ view: 1000 }, zone);
      if (!z.bounds) return;
      zones[z.id] = z;
      const i = defs.findIndex((d) => d.id === z.id);
      if (i >= 0) defs[i] = z; else defs.push(z);
    },
    goto,
    point, waypoint: point, spawns,
    addInteractable, setInteractLabel,
    portal(id) { return portals[id] || null; },
    gate(id) { return gates[id] || null; },
    npc(id) { return npcs[id] || null; },
    get graves() { return graveList; },
    prop(id) { return props[id] || null; },
    resetRun,
    heightAt: h,
    pillars: W.finalPillars || [],
  };
  try {
    const dbg = (window.__tnrpg = window.__tnrpg || {});
    dbg.teleport = async (name) => {
      try {
        if (zones[name]) { await goto(name, { fade: false }); return true; }
        const p = point(name);
        if (!p) return false;
        const zid = zoneAt(p.x, p.y + 0.5, p.z) || current || "lobby";
        await goto(zid, { pos: p, yaw: engine.player ? engine.player.yaw : 0, fade: false });
        return true;
      } catch (e) { warn(e); return false; }
    };
  } catch (e) { /* node */ }
  return api;
}
