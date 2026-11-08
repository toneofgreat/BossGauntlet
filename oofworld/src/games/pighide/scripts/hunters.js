// src/games/pighide/scripts/hunters.js — PIG HIDE hunters (spec 27 §2.5, §8, §9.2, §9.3).
//
// Owns: the hunter look (local + remote, per tier and skin), every hunter weapon and
// ability (punch, wooden sword, toy blaster "Glock", bomb, RPG, Pig Detector, flashlight),
// their hit tests, and the hunter-side visuals that ride the wire (live bombs `bm`, the
// last rocket launch `rk`, the last explosion `ex`, the flashlight counter `fl`).
//
// Contract notes, all binding (spec 27):
// - Single writer of S.hunter.* and the only module that pushes to S.outHits (§2.0).
//   round.js drains outHits into ONE publish and owns every net call.
// - Hits are pushed ONLY when S.phase === "seek" && S.role === "hunter" (§4.11). Practice
//   in the lobby runs every weapon, cooldown and effect locally and never pushes a hit.
// - A clone hit carries the OWNER's id with c:1. The clone is a prop, never a target id
//   of its own on the wire (§13).
// - Looks are parented through rigs.setLook. This module never sets a rig root's
//   `.visible`, never touches a rig's own (shared, cached) materials, and gives each look
//   its OWN geometries and materials, because rigs.js disposes a look it replaces (§9.0).
// - Sounds come from the closed registry only (spec 02): oof, whoosh, pop, click, chime,
//   sparkle, warp, boing. There is no gunshot or explosion recipe; weight is pitch.
// - Time is dt. No timers, no animation frames, no storage.

import {
  TUNE, WEAPONS, ABILITIES, HUNTER_CLASSES, PIG_CLASSES, AMAZING_TRIM, ATTACK_LABEL,
  hunterClass, hunterClassIndex, hunterSkin, hunterWalk,
} from "./config.js";

const DEG = Math.PI / 180;
const HUNTER_IDS = new Set(HUNTER_CLASSES.map((c) => c.id));
const PIG_IDS = new Set(PIG_CLASSES.map((c) => c.id));
const ROUND_PHASES = new Set(["hide", "seek", "result"]);
const AMAZING_CONTRAST = "#7a1fd1";   // royal purple trim when the skin is already gold

// Fixed art colours for props that are not skin slots (§8.3 wood, §8.4 orange tip).
const ART = Object.freeze({
  dark: "#1c1f26",
  steel: "#8a8f99",
  orange: "#ff7a1a",
  bombBody: "#17171c",
  bombBand: "#d62828",
  satchel: "#6b4a2f",
  rpgTube: "#3f4a3a",
  lens: "#fffbe0",
  flashBeam: "#fff6c8",
});

// Pose table per weapon: base arm angles (radians, +x swings the hand back) while idle.
const POSES = Object.freeze({
  punch: { rx: -0.35, rz: 0.05, lx: -0.35, lz: -0.05, swingArms: 0.5 },
  sword: { rx: -0.55, rz: 0, lx: 0, lz: 0, swingArms: 0.7 },
  glock: { rx: -1.45, rz: 0.05, lx: -1.15, lz: -0.42, swingArms: 0 },
  bomb: { rx: -0.45, rz: 0, lx: 0, lz: 0, swingArms: 0.7 },
  rpg: { rx: -1.25, rz: 0.25, lx: -1.15, lz: -0.5, swingArms: 0 },
});

export function createHunters(ctx, S, rigs, fx) {
  const THREE = ctx.engine.THREE;
  const parts = ctx.engine.parts;
  const physics = ctx.engine.physics;

  // ---- tuning (every number is a config constant, §6.3) ---------------------------------
  const EYE_Y = num(TUNE.EYE_Y, 4.5);
  const CENTER_Y = num(TUNE.PIG_CENTER_Y, 1.2);
  const RPG_SHOULDER = num(TUNE.RPG_SHOULDER, 0.6);
  const FLASH_CONE_S = num(TUNE.FLASH_CONE_S, 0.5);
  const XRAY_RED = TUNE.XRAY_RED || "#ff1a1a";

  // ---- module state ---------------------------------------------------------------------
  const looks = new Map();        // id -> LookRec  (id is a peer id, or SELF_KEY)
  const SELF_KEY = "\u0000self";
  const bombs = [];               // local live bombs { i, p, f, partId, obj, lastWhole }
  const rockets = [];             // local live rockets { p, d, travelled, handle }
  const remoteBombs = new Map();  // "<peer>:<i>" -> { partId, obj, seen }
  const remoteRockets = new Map();// peerId -> { p0, d, age, handle }
  const beams = [];               // flashlight cones { obj, root, t }
  const peerSeen = new Map();     // peerId -> { fl, hitS, bmN } baselines (§4.6 seq rule)
  const unsubs = [];
  let bombSeq = 0;
  let rkSeq = 0;
  let exSeq = 0;
  let animT = 0;
  let bake = null;   // the hunter bake in progress (buildHunterModel only)
  let practiceWalkSet = false;   // hunter practice wrote the class walk
  let disposed = false;

  ensureCd();

  // Left mouse click on the game canvas, the HUD's ATTACK button and keyboard F are all
  // hud.js's (§10: the one input owner); each lands in attack() exactly once.

  // =====================================================================================
  // Who may act, and with what
  // =====================================================================================

  function practiceHunter() { return S.phase === "lobby" && S.practice === "hunter"; }
  function liveHunter() { return S.role === "hunter" && S.phase === "seek"; }
  function canAct() { return !disposed && (liveHunter() || practiceHunter()); }
  function mayHit() { return S.phase === "seek" && S.role === "hunter"; }

  function myClass() { return hunterClass(S.hunter.classId); }
  function myWeaponId() { return myClass().weapon || "punch"; }

  function ensureCd() {
    const cd = S.hunter.cd || (S.hunter.cd = {});
    for (const id of Object.keys(WEAPONS)) if (!Number.isFinite(cd[id])) cd[id] = 0;
    for (const id of ["detect", "flashlight"]) if (!Number.isFinite(cd[id])) cd[id] = 0;
  }

  function stats(wid) {
    const w = WEAPONS[wid] || WEAPONS.punch;
    return {
      id: w.id,
      kind: w.kind,
      icon: w.icon,
      damage: num(w.damage, 20),
      range: num(w.range, 4.5),
      cd: num(w.cooldownS, 0.6),
      arc: num(w.arcDeg, num(TUNE.MELEE_ARC_DEG, 120)) * DEG,
      cone: num(w.coneDeg, num(TUNE.AIM_CONE_DEG, 14)) * DEG,
      radius: num(w.radius, 0),
      fuse: num(w.fuseS, num(TUNE.BOMB_FUSE_S, 5)),
      speed: num(w.speed, num(TUNE.RPG_SPEED, 90)),
      prox: num(w.prox, num(TUNE.RPG_PROX, 2.5)),
      maxLive: num(w.maxLive, num(TUNE.BOMB_MAX_LIVE, 2)),
    };
  }

  function abilityCd(id) {
    const a = ABILITIES[id];
    return a ? num(a.cooldownS, 0) : 0;
  }

  // =====================================================================================
  // Geometry helpers on the local avatar
  // =====================================================================================

  function myPos() {
    const p = ctx.player.position();
    return [p[0], p[1], p[2]];
  }
  function myYaw() {
    const a = ctx.player.avatar;
    return a && a.rotation ? a.rotation.y : 0;
  }
  function fwdOf(yaw) { return [Math.sin(yaw), 0, Math.cos(yaw)]; }
  // The model faces +Z; its own right hand is world (-cos yaw, 0, sin yaw).
  function rightOf(yaw) { return [-Math.cos(yaw), 0, Math.sin(yaw)]; }

  function eyePos() {
    const p = myPos();
    return [p[0], p[1] + EYE_Y, p[2]];
  }
  function muzzlePos() {
    const p = myPos();
    const yaw = myYaw();
    const f = fwdOf(yaw);
    const r = rightOf(yaw);
    return [p[0] + f[0] * 3.1 + r[0] * 1.2, p[1] + 3.95, p[2] + f[2] * 3.1 + r[2] * 1.2];
  }

  // Line of sight (§8.1): no part between, or the first part is within 1 stud of the end.
  function los(from, to) {
    const d = sub(to, from);
    const dist = len(d);
    if (dist < 0.05) return true;
    let hit = null;
    try { hit = physics.raycast(from, d, dist); } catch { hit = null; }
    return !hit || hit.distance >= dist - 1;
  }

  // =====================================================================================
  // Targets (§8): roster pigs not caught, plus their live clones. In practice: lobby peers
  // practicing pig. `hidden` (Creeper iv:1) excludes a target from aim, never from blasts.
  // =====================================================================================

  function peerRoot(id) {
    try { return rigs && typeof rigs.rigFor === "function" ? rigs.rigFor(id) : null; } catch { return null; }
  }

  function peerFeet(v) {
    const root = peerRoot(v.id);
    if (root && root.position) return [root.position.x, root.position.y, root.position.z];
    return Array.isArray(v.pos) ? [v.pos[0], v.pos[1], v.pos[2]] : null;
  }

  function clonePoint(ownerId, st) {
    let p = null;
    try { if (rigs && typeof rigs.clonePos === "function") p = rigs.clonePos(ownerId); } catch { p = null; }
    if (!Array.isArray(p) && st && st.cn && Array.isArray(st.cn.p)) p = st.cn.p;
    return Array.isArray(p) && p.every(Number.isFinite) ? p : null;
  }

  function targets() {
    const out = [];
    if (!S.peers) return out;
    const addPeer = (id, v) => {
      if (!v || !v.st || id === S.selfId) return;
      const feet = peerFeet(v);
      if (feet) {
        out.push({ key: id, to: id, c: 0, hidden: v.st.iv === 1,
          p: [feet[0], feet[1] + CENTER_Y, feet[2]] });
      }
      const cn = v.st.cn;
      if (cn && cn.a === 1) {
        const cp = clonePoint(id, v.st);
        if (cp) out.push({ key: "clone:" + id, to: id, c: 1, hidden: false, p: [cp[0], cp[1] + CENTER_Y, cp[2]] });
      }
    };
    if (S.role === "hunter" && S.roster && ROUND_PHASES.has(S.phase)) {
      for (const id of S.roster.ps || []) {
        const v = S.peers.get(id);
        if (!v || !v.fresh || !v.st) continue;
        if (v.st.cg === 1) continue;
        if (Number.isFinite(v.st.rn) && v.st.rn !== S.rn) continue;
        addPeer(id, v);
      }
    } else if (practiceHunter()) {
      for (const [id, v] of S.peers) {
        if (!v || !v.st) continue;
        if (v.st.ph !== "lobby" || v.st.rl) continue;
        if (!PIG_IDS.has(v.st.cl)) continue;
        addPeer(id, v);
      }
    }
    return out;
  }

  // Melee (§8.1): nearest target within range whose bearing is within ±arc/2 of facing.
  function meleePick(range, arc) {
    const me = myPos();
    const c = [me[0], me[1] + CENTER_Y, me[2]];
    const f = fwdOf(myYaw());
    let best = null;
    let bestD = Infinity;
    for (const t of targets()) {
      if (t.hidden) continue;
      const d = dist(c, t.p);
      if (d > range) continue;
      const dx = t.p[0] - me[0];
      const dz = t.p[2] - me[2];
      const h = Math.hypot(dx, dz);
      if (h > 0.5) {
        const ang = Math.acos(clamp((dx * f[0] + dz * f[2]) / h, -1, 1));
        if (ang > arc / 2) continue;
      }
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  // Hitscan and rocket auto-aim (§8.1): smallest bearing within ±cone/2, within range,
  // with line of sight from the eye. Null = fire straight along the facing yaw.
  function aimPick(range, cone) {
    const me = myPos();
    const eye = eyePos();
    const f = fwdOf(myYaw());
    let best = null;
    let bestA = Infinity;
    for (const t of targets()) {
      if (t.hidden) continue;
      const dx = t.p[0] - me[0];
      const dz = t.p[2] - me[2];
      const h = Math.hypot(dx, dz);
      if (h < 0.05) continue;
      const ang = Math.acos(clamp((dx * f[0] + dz * f[2]) / h, -1, 1));
      if (ang > cone / 2) continue;
      if (dist(eye, t.p) > range) continue;
      if (!los(eye, t.p)) continue;
      if (ang < bestA) { bestA = ang; best = t; }
    }
    return best;
  }

  function pushHit(t, dmg, w) {
    if (!mayHit() || !t) return;
    const d = Math.round(clamp(dmg, 1, 200));
    S.outHits.push(t.c === 1 ? { to: t.to, d, w, c: 1 } : { to: t.to, d, w, c: 0 });
  }

  // Every target within `radius` of p (3D, no line of sight: "explodes a big area").
  function blast(p, radius, dmg, w) {
    const hitAny = [];
    for (const t of targets()) {
      if (dist(p, t.p) <= radius) {
        hitAny.push(t);
        pushHit(t, dmg, w);
      }
    }
    return hitAny;
  }

  // =====================================================================================
  // attack() — the primary (ATTACK button, F, left click)
  // =====================================================================================

  function attack() {
    if (!canAct()) return false;
    ensureCd();
    const wid = myWeaponId();
    const w = stats(wid);
    if (S.hunter.cd[wid] > 0) return false;
    let ok = false;
    if (w.kind === "melee") ok = doMelee(w);
    else if (w.kind === "hitscan") ok = doHitscan(w);
    else if (w.kind === "bomb") ok = doBomb(w);
    else if (w.kind === "rocket") ok = doRocket(w);
    if (ok) {
      S.hunter.cd[wid] = w.cd;
      animateAttack(SELF_KEY, w.kind === "melee" ? wid : w.kind);
    }
    return ok;
  }

  function doMelee(w) {
    const me = myPos();
    const yaw = myYaw();
    const f = fwdOf(yaw);
    const sk = hunterSkin(S.hunter.skinId);
    const color = w.id === "sword" ? "#e8c88a" : (sk.colors.glow || "#ffffff");
    fxc("swoosh", [me[0] + f[0] * 1.8, me[1] + 2.8, me[2] + f[2] * 1.8], yaw, color);
    const t = meleePick(w.range, w.arc);
    if (t) {
      pushHit(t, w.damage, w.id);
      fxc("sparkle", t.p, color);
      sfx("oof", { volume: 0.9, pitch: w.id === "sword" ? 0.85 : 1.1 });
    } else {
      sfx("whoosh", { volume: 0.7, pitch: w.id === "sword" ? 0.8 : 1.2 });
    }
    return true;
  }

  function doHitscan(w) {
    const eye = eyePos();
    const from = muzzlePos();
    const t = aimPick(w.range, w.cone);
    const sk = hunterSkin(S.hunter.skinId);
    let end;
    if (t) {
      end = t.p;
      pushHit(t, w.damage, w.id);
      fxc("sparkle", t.p, ART.orange);
    } else {
      const f = fwdOf(myYaw());
      let hit = null;
      try { hit = physics.raycast(eye, f, w.range); } catch { hit = null; }
      end = hit && Array.isArray(hit.point) ? hit.point : add(eye, scale(f, w.range));
      if (hit) fxc("dust", hit.point);
    }
    fxc("tracer", from, end, sk.colors.glow || ART.orange);
    sfx("pop", { volume: 0.8, pitch: num(TUNE.GLOCK_PITCH, 1.6) });
    return true;
  }

  function doBomb(w) {
    if (bombs.length >= w.maxLive) {
      sfx("denied", { volume: 0.5 });
      return false;
    }
    const p = myPos();
    const bp = [round1(p[0]), round1(p[1]), round1(p[2])];
    const obj = buildBombObject();
    obj.position.set(bp[0], bp[1], bp[2]);
    let partId = null;
    try { partId = parts.addCustom(obj); } catch { partId = null; }
    bombSeq += 1;
    bombs.push({ i: bombSeq, p: bp, f: w.fuse, partId, obj, lastWhole: Math.ceil(w.fuse) });
    publishBombs();
    sfx("click", { volume: 0.8, pitch: 0.7 });
    fxc("dust", bp);
    return true;
  }

  function doRocket(w) {
    const yaw = myYaw();
    const eye = eyePos();
    const r = rightOf(yaw);
    const from = [eye[0] + r[0] * RPG_SHOULDER, eye[1], eye[2] + r[2] * RPG_SHOULDER];
    const t = aimPick(w.range, w.cone);
    let d = t ? norm(sub(t.p, from)) : fwdOf(yaw);
    if (!d) d = fwdOf(yaw);
    const handle = fxc("rocket", from, d, w.speed, w.range);
    rockets.push({ p: from.slice(), d, travelled: 0, handle, w });
    rkSeq += 1;
    S.hunter.rk = { s: rkSeq, p: from.map(round1), d: d.map(round2) };
    sfx("whoosh", { volume: 1, pitch: 0.55 });
    fxc("dust", from);
    return true;
  }

  // =====================================================================================
  // use(abilityId) — detect (E) and flashlight (Q)
  // =====================================================================================

  function use(abilityId) {
    if (abilityId === "attack" || abilityId === "primary") return attack();
    if (!canAct()) return false;
    const kit = myClass().abilities || [];
    if (!kit.includes(abilityId)) return false;
    ensureCd();
    if (S.hunter.cd[abilityId] > 0) return false;
    if (abilityId === "detect") return doDetect();
    if (abilityId === "flashlight") return doFlash();
    return false;
  }

  function doDetect() {
    const ids = [];
    for (const t of targets()) ids.push(t.c === 1 ? "clone:" + t.to : t.to);
    const secs = num(TUNE.DETECT_S, 1);
    try { if (rigs && typeof rigs.xray === "function") rigs.xray(XRAY_RED, secs, ids); } catch { /* visual only */ }
    S.hunter.detectOn = secs;
    S.hunter.cd.detect = abilityCd("detect") || num(TUNE.DETECT_CD_S, 50);
    sfx("chime", { volume: 1, pitch: num(TUNE.DETECT_PITCH, 0.7) });
    const me = myPos();
    fxc("sparkle", [me[0], me[1] + 5.6, me[2]], XRAY_RED);
    const rec = looks.get(SELF_KEY);
    if (rec) rec.pingT = 1;
    return true;
  }

  function doFlash() {
    S.hunter.fl = (S.hunter.fl | 0) + 1;
    S.hunter.cd.flashlight = abilityCd("flashlight") || num(TUNE.FLASH_CD_S, 70);
    addBeam(ctx.player.avatar);
    sfx("warp", { volume: 0.8, pitch: 1.5 });
    sfx("sparkle", { volume: 0.7, pitch: 1.3 });
    return true;
  }

  // =====================================================================================
  // buttons() — what the HUD shows for the hunter kit (§10.1)
  // =====================================================================================

  function buttons() {
    ensureCd();
    const cls = myClass();
    const wid = cls.weapon || "punch";
    const w = stats(wid);
    const act = canAct();
    const out = [];
    let attackEnabled = act && S.hunter.cd[wid] <= 0;
    if (w.kind === "bomb" && bombs.length >= w.maxLive) attackEnabled = false;
    out.push({
      id: "attack", label: ATTACK_LABEL || "Attack", icon: w.icon || "👊", key: "F",
      cdLeft: Math.max(0, S.hunter.cd[wid] || 0), cdTotal: w.cd,
      active: w.kind === "bomb" && bombs.length > 0, enabled: attackEnabled,
    });
    for (const id of cls.abilities || []) {
      const a = ABILITIES[id];
      if (!a) continue;
      const cdLeft = Math.max(0, S.hunter.cd[id] || 0);
      out.push({
        id, label: a.label || a.name, icon: a.icon, key: a.slot || "E",
        cdLeft, cdTotal: num(a.cooldownS, 0),
        active: id === "detect" ? S.hunter.detectOn > 0 : beams.some((b) => b.self && b.t > 0),
        enabled: act && cdLeft <= 0,
      });
    }
    return out;
  }

  // =====================================================================================
  // update(dt)
  // =====================================================================================

  function update(dt) {
    if (disposed) return;
    if (!Number.isFinite(dt) || dt <= 0) dt = 0;
    animT += dt;
    ensureCd();

    // In the lobby the equipped kit follows the save (shops equips there). From the hide
    // edge on it is frozen for the round (onRoleStart).
    if (S.phase === "lobby" && S.save) {
      if (HUNTER_IDS.has(S.save.hunterClass)) S.hunter.classId = S.save.hunterClass;
      if (typeof S.save.hunterSkin === "string") S.hunter.skinId = S.save.hunterSkin;
    }

    // Hunter practice in the lobby walks at the class's speed (the Speed Glock's 2x), the
    // way pig practice gets the Wild Boar's. In a round round.js sets it at the seek edge.
    if (practiceHunter()) {
      const w = hunterWalk(S.hunter.classId);
      let cur = null;
      try { cur = ctx.player.getWalkSpeed(); } catch { cur = null; }
      if (Number.isFinite(w) && cur !== w) { try { ctx.player.setWalkSpeed(w); } catch { /* clamped */ } }
      practiceWalkSet = true;
    } else if (practiceWalkSet) {
      // Practice over. A rostered side sets its own walk; a bystander goes back to normal.
      practiceWalkSet = false;
      if (S.role == null && !S.spectating) { try { ctx.player.setWalkSpeed(TUNE.WALK_DEFAULT); } catch { /* clamped */ } }
    }

    for (const k of Object.keys(S.hunter.cd)) {
      if (S.hunter.cd[k] > 0) S.hunter.cd[k] = Math.max(0, S.hunter.cd[k] - dt);
    }
    if (S.hunter.detectOn > 0) S.hunter.detectOn = Math.max(0, S.hunter.detectOn - dt);

    tickBombs(dt);
    tickRockets(dt);
    tickRemote(dt);
    tickBeams(dt);
    tickLooks(dt);
  }

  // ---- bombs ----------------------------------------------------------------------------

  function publishBombs() {
    S.hunter.bm = bombs.map((b) => ({ i: b.i, p: b.p.slice(), f: Math.max(0, Math.ceil(b.f)) }));
  }

  function tickBombs(dt) {
    let changed = false;
    for (let k = bombs.length - 1; k >= 0; k--) {
      const b = bombs[k];
      b.f -= dt;
      animateBomb(b.obj, b.f);
      const whole = Math.max(0, Math.ceil(b.f));
      if (whole !== b.lastWhole) {
        b.lastWhole = whole;
        changed = true;
        if (whole > 0) sfx("click", { volume: 0.45, pitch: 1 + (5 - whole) * 0.2 });
      }
      if (b.f <= 0) {
        bombs.splice(k, 1);
        removeCustom(b.partId, b.obj);
        detonate([b.p[0], b.p[1] + 0.6, b.p[2]], stats("bomb"), "bomb");
        changed = true;
      }
    }
    if (changed) publishBombs();
  }

  function detonate(p, w, wid) {
    const r = w.radius || num(TUNE.BOMB_RADIUS, 18);
    fxc("explosion", p, r);
    sfx("pop", { volume: 1.5, pitch: wid === "bomb" ? num(TUNE.BOMB_PITCH, 0.4) : 0.5 });
    sfx("boing", { volume: 0.6, pitch: 0.5 });
    exSeq += 1;
    S.hunter.ex = { s: exSeq, p: p.map(round1), r };
    const caught = blast([p[0], p[1], p[2]], r, w.damage, wid);
    for (const t of caught) fxc("sparkle", t.p, XRAY_RED);
    // A big blast rattles the hunter's own view a little (local only).
    try { ctx.engine.camera.shake(wid === "bomb" ? 0.45 : 0.3, 0.45); } catch { /* fine */ }
  }

  // ---- rockets (only the shooter simulates the hit, §8.7) --------------------------------

  function tickRockets(dt) {
    for (let k = rockets.length - 1; k >= 0; k--) {
      const r = rockets[k];
      const w = r.w;
      const step = w.speed * dt;
      let boomAt = null;
      if (step > 0) {
        let hit = null;
        try { hit = physics.raycast(r.p, r.d, step); } catch { hit = null; }
        if (hit && Number.isFinite(hit.distance) && hit.distance <= step) {
          boomAt = Array.isArray(hit.point) ? hit.point.slice() : add(r.p, scale(r.d, hit.distance));
        } else {
          r.p = add(r.p, scale(r.d, step));
          r.travelled += step;
          for (const t of targets()) {
            if (dist(r.p, t.p) <= w.prox) { boomAt = r.p.slice(); break; }
          }
          if (!boomAt && (r.travelled >= w.range || r.p[1] < -10)) boomAt = r.p.slice();
        }
      }
      if (boomAt) {
        rockets.splice(k, 1);
        stopHandle(r.handle);
        detonate(boomAt, w, "rpg");
      }
    }
  }

  // ---- remote visuals: bombs from bm, beams from fl, attack flourishes from hits --------

  function tickRemote(dt) {
    const seen = new Set();
    if (S.peers) {
      for (const [id, v] of S.peers) {
        if (!v || id === S.selfId) continue;
        const st = v.st;
        // Baselines on first sight: a late joiner never replays an old beam or swing.
        let base = peerSeen.get(id);
        if (!base) {
          base = { fl: st ? st.fl | 0 : 0, hitS: maxHitS(st), bmN: st && Array.isArray(st.bm) ? st.bm.length : 0 };
          peerSeen.set(id, base);
        }
        if (!st) continue;
        // Flashlight beam on that hunter's rig.
        const fl = st.fl | 0;
        if (fl > base.fl) {
          base.fl = fl;
          const root = peerRoot(id);
          if (root) addBeam(root);
        } else if (fl < base.fl) base.fl = fl;
        // Hits: draw the swing / pellet the pigs never saw computed.
        const hs = maxHitS(st);
        if (hs > base.hitS) {
          for (const h of st.hits || []) {
            if (!h || !(h.s > base.hitS)) continue;
            remoteFlourish(id, v, h);
          }
          base.hitS = hs;
        }
        // Live bombs.
        const list = Array.isArray(st.bm) ? st.bm : [];
        if (list.length > base.bmN) animateAttack(id, "bomb");
        base.bmN = list.length;
        for (const b of list) {
          if (!b || !Array.isArray(b.p) || !b.p.every(Number.isFinite)) continue;
          const key = id + ":" + b.i;
          seen.add(key);
          let rb = remoteBombs.get(key);
          if (!rb) {
            const obj = buildBombObject();
            obj.position.set(b.p[0], b.p[1], b.p[2]);
            let partId = null;
            try { partId = parts.addCustom(obj); } catch { partId = null; }
            rb = { partId, obj, f: num(b.f, 5) };
            remoteBombs.set(key, rb);
          }
          // The wire carries whole seconds; run a local fraction between them.
          const wf = num(b.f, rb.f);
          rb.f = Math.abs(wf - rb.f) > 1 ? wf : Math.max(0, rb.f - dt);
          animateBomb(rb.obj, rb.f);
        }
      }
      for (const id of [...peerSeen.keys()]) if (!S.peers.has(id)) peerSeen.delete(id);
    }
    for (const [key, rb] of remoteBombs) {
      if (seen.has(key)) continue;
      removeCustom(rb.partId, rb.obj);
      remoteBombs.delete(key);
    }
    for (const [id, rr] of remoteRockets) {
      rr.age += dt;
      if (rr.age * rr.speed > rr.range + 20) {
        stopHandle(rr.handle);
        remoteRockets.delete(id);
      }
    }
  }

  function maxHitS(st) {
    let m = 0;
    if (st && Array.isArray(st.hits)) for (const h of st.hits) if (h && Number.isFinite(h.s) && h.s > m) m = h.s;
    return m;
  }

  function remoteFlourish(id, v, h) {
    const root = peerRoot(id);
    const feet = root ? [root.position.x, root.position.y, root.position.z] : (Array.isArray(v.pos) ? v.pos : null);
    if (!feet) return;
    const yaw = root ? root.rotation.y : num(v.yaw, 0);
    const f = fwdOf(yaw);
    const r = rightOf(yaw);
    let to = null;
    if (h.to === S.selfId) {
      const me = myPos();
      to = [me[0], me[1] + CENTER_Y, me[2]];
    } else {
      const tv = S.peers.get(h.to);
      const tf = tv ? peerFeet(tv) : null;
      if (tf) to = [tf[0], tf[1] + CENTER_Y, tf[2]];
    }
    const glow = remoteGlow(v);
    if (h.w === "glock") {
      animateAttack(id, "hitscan");
      const from = [feet[0] + f[0] * 3.1 + r[0] * 1.2, feet[1] + 3.95, feet[2] + f[2] * 3.1 + r[2] * 1.2];
      if (to) fxc("tracer", from, to, glow);
      sfx("pop", { volume: 0.5, pitch: num(TUNE.GLOCK_PITCH, 1.6) });
    } else if (h.w === "punch" || h.w === "sword") {
      animateAttack(id, h.w);
      fxc("swoosh", [feet[0] + f[0] * 1.8, feet[1] + 2.8, feet[2] + f[2] * 1.8], yaw, h.w === "sword" ? "#e8c88a" : glow);
    }
  }

  function remoteGlow(v) {
    const sk = hunterSkin(v && v.st ? v.st.sk : null);
    return sk.colors.glow || "#ffffff";
  }

  // ---- flashlight beams ------------------------------------------------------------------

  function addBeam(root) {
    if (!root) return;
    const geo = new THREE.ConeGeometry(5, 16, 24, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: ART.flashBeam, transparent: true, opacity: 0.5, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const cone = new THREE.Mesh(geo, mat);
    cone.rotation.x = -Math.PI / 2;      // tip (+Y) toward the helmet (-Z), wide end forward
    cone.position.set(0, 0, 8);
    cone.frustumCulled = false;
    const holder = new THREE.Group();
    holder.name = "PHFlashBeam";
    holder.position.set(0.6, 5.05, 0.5);
    holder.add(cone);
    root.add(holder);
    beams.push({ obj: holder, root, t: FLASH_CONE_S, mat, self: root === ctx.player.avatar });
  }

  function tickBeams(dt) {
    for (let k = beams.length - 1; k >= 0; k--) {
      const b = beams[k];
      b.t -= dt;
      const a = clamp(b.t / FLASH_CONE_S, 0, 1);
      b.mat.opacity = 0.55 * a;
      b.obj.scale.set(1 + (1 - a) * 0.4, 1 + (1 - a) * 0.4, 1);
      if (b.t <= 0) {
        if (b.obj.parent) b.obj.parent.remove(b.obj);
        disposeObject(b.obj);
        beams.splice(k, 1);
      }
    }
  }

  // =====================================================================================
  // Looks (§9.2, §9.3): who wears the hunter model, and its animation
  // =====================================================================================

  function wantedLooks() {
    const want = new Map(); // key -> { id (rig id), classId, skinId }
    const selfHunter = (S.role === "hunter" && ROUND_PHASES.has(S.phase)) || practiceHunter();
    if (selfHunter) want.set(SELF_KEY, { id: S.selfId, classId: S.hunter.classId, skinId: S.hunter.skinId });
    if (S.peers) {
      for (const [id, v] of S.peers) {
        if (!v || !v.st || id === S.selfId) continue;
        const st = v.st;
        const isHunter = (st.rl === "hunter" && ROUND_PHASES.has(st.ph))
          || (st.ph === "lobby" && !st.rl && HUNTER_IDS.has(st.cl));
        if (isHunter) want.set(id, { id, classId: HUNTER_IDS.has(st.cl) ? st.cl : "basic", skinId: st.sk });
      }
    }
    return want;
  }

  function rootFor(key, rigId) {
    if (key === SELF_KEY) return peerRoot(rigId) || ctx.player.avatar;
    return peerRoot(rigId);
  }

  function tickLooks(dt) {
    const want = wantedLooks();
    // Release looks no longer wanted.
    for (const [key, rec] of looks) {
      if (want.has(key)) continue;
      releaseLook(key, rec);
      looks.delete(key);
    }
    for (const [key, w] of want) {
      const root = rootFor(key, w.id);
      const lookKey = w.classId + "|" + hunterSkin(w.skinId).id;
      let rec = looks.get(key);
      if (rec) {
        rec.retry = Math.max(0, rec.retry - dt);
        const attached = rec.look && rec.look.parent && rec.look.parent === root;
        if (attached && rec.lookKey === lookKey) {
          animateLook(rec, root, dt, key === SELF_KEY);
          continue;
        }
        if (!attached) {
          // Displaced: the rig was rebuilt (bye / revive) or the look was replaced. Back off
          // briefly so two claimants can never rebuild a model every tick.
          if (!rec.displaced) { rec.displaced = true; rec.retry = 0.3; continue; }
          if (rec.retry > 0) continue;
        }
        if (attached) releaseLook(key, rec);
        else disposeObject(rec.look);
        looks.delete(key);
        rec = null;
      }
      if (!root) continue;   // rig not paired yet; next tick
      const look = buildHunterModel(w.classId, w.skinId);
      try {
        if (rigs && typeof rigs.setLook === "function") rigs.setLook(w.id, look);
        else root.add(look);
      } catch { disposeObject(look); continue; }
      if (look.parent !== root) {
        // rigs refused or parented elsewhere; never leak it
        if (look.parent) look.parent.remove(look);
        disposeObject(look);
        looks.set(key, { look: null, lookKey, rigId: w.id, retry: 1, phase: 0, atk: 0, atkKind: null, last: null, pingT: 0 });
        continue;
      }
      looks.set(key, { look, lookKey, rigId: w.id, retry: 1, phase: 0, atk: 0, atkKind: null, last: null, pingT: 0 });
    }
  }

  function releaseLook(key, rec) {
    if (!rec || !rec.look) return;
    const look = rec.look;
    const root = rootFor(key, rec.rigId);
    if (look.parent && look.parent === root && rigs && typeof rigs.setLook === "function") {
      try { rigs.setLook(rec.rigId, null); } catch { /* fall through to the manual path */ }
    }
    if (look.parent) look.parent.remove(look);
    disposeObject(look);
    rec.look = null;
  }

  function animateAttack(key, kind) {
    const rec = looks.get(key);
    if (!rec) return;
    rec.atk = 1;
    rec.atkKind = kind;
  }

  function animateLook(rec, root, dt, isSelf) {
    const u = rec.look.userData.ph;
    if (!u) return;
    // Speed: own velocity, or the remote rig's position delta.
    let speed = 0;
    if (isSelf) {
      const v = ctx.player.velocity();
      speed = Array.isArray(v) ? Math.hypot(v[0], v[2]) : 0;
    } else if (root) {
      const p = root.position;
      if (rec.last && dt > 0) speed = Math.hypot(p.x - rec.last[0], p.z - rec.last[2]) / dt;
      rec.last = [p.x, p.y, p.z];
      if (speed > 120) speed = 0;   // a teleport, not a stride
    }
    rec.smooth = (rec.smooth || 0) + (speed - (rec.smooth || 0)) * Math.min(1, dt * 10);
    const sp = rec.smooth;
    rec.phase += dt * (3 + sp * 0.45);
    const stride = Math.min(1, sp / 16);
    const swing = Math.sin(rec.phase) * (num(TUNE.LEG_SWING_DEG, 30) * DEG) * 1.2 * stride;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.hips.position.y = Math.abs(Math.cos(rec.phase)) * 0.08 * stride;

    const pose = POSES[u.pose] || POSES.punch;
    let rx = pose.rx - swing * pose.swingArms;
    let lx = pose.lx + swing * pose.swingArms;
    let rz = pose.rz;
    if (rec.atk > 0) {
      rec.atk = Math.max(0, rec.atk - dt / 0.28);
      const k = 1 - rec.atk;              // 0 -> 1 over the swing
      const pulse = Math.sin(k * Math.PI);
      switch (rec.atkKind) {
        case "punch": rx = pose.rx - 1.35 * pulse; break;
        case "sword": rx = -2.5 + k * 2.9; rz = 0.35 * pulse; break;
        case "hitscan": rx = pose.rx - 0.35 * pulse; break;
        case "bomb": rx = -1.6 * (1 - k) + pose.rx * k; break;
        case "rocket": if (u.rpg) u.rpg.position.z = u.rpgZ - 0.35 * pulse; break;
        default: break;
      }
    } else if (u.rpg) u.rpg.position.z = u.rpgZ;
    u.armR.rotation.x = rx;
    u.armR.rotation.z = rz;
    u.armL.rotation.x = lx;
    u.armL.rotation.z = pose.lz;

    // Cape flows back with speed and sways.
    u.cape.rotation.x = 0.12 + Math.min(0.9, sp * 0.03) + Math.sin(animT * 3.1 + rec.phase * 0.2) * 0.06;
    u.cape.rotation.z = Math.sin(animT * 1.7) * 0.04;

    // Antenna tip blinks; the visor breathes; the dish spins; the aura turns.
    if (u.tipMat) u.tipMat.emissiveIntensity = 0.6 + 1.6 * (0.5 + 0.5 * Math.sin(animT * 5));
    if (u.visorMat) u.visorMat.emissiveIntensity = u.visorBase * (0.85 + 0.15 * Math.sin(animT * 2.2));
    if (u.dish) u.dish.rotation.y += dt * (rec.pingT > 0 ? 12 : 1.6);
    if (u.dishMat) {
      rec.pingT = Math.max(0, rec.pingT - dt);
      u.dishMat.emissiveIntensity = rec.pingT > 0 ? 3 * (0.5 + 0.5 * Math.sin(animT * 50)) : 0.8 + 0.4 * Math.sin(animT * 3);
    }
    if (u.aura) {
      u.aura.rotation.z += dt * 0.9;
      const s = 1 + 0.06 * Math.sin(animT * 2.4);
      u.aura.scale.set(s, s, 1);
      if (u.auraMat) u.auraMat.opacity = 0.35 + 0.15 * Math.sin(animT * 2.4);
    }
    if (u.halo) u.halo.rotation.z += dt * 0.6;
    if (u.orbit) {
      u.orbit.rotation.y += dt * 1.4;
      for (let i = 0; i < u.orbit.children.length; i++) {
        const o = u.orbit.children[i];
        o.position.y = Math.sin(animT * 2 + i * 2.1) * 0.35;
        o.rotation.y += dt * 3;
      }
    }
    if (u.fuseTip) {
      const f = 0.7 + 0.5 * Math.abs(Math.sin(animT * 17));
      u.fuseTip.scale.set(f, f, f);
    }
  }

  // =====================================================================================
  // The hunter model (§9.2) — "cool looking"
  // =====================================================================================

  function buildHunterModel(classId, skinId) {
    const cls = hunterClass(classId);
    const tier = Math.max(0, hunterClassIndex(cls.id));
    const amazing = cls.id === "amazing";
    const skin = hunterSkin(skinId);
    const c = skin.colors;
    // The Amazing Hunter's gold trim would vanish on an all-gold skin: use royal purple.
    const gold = AMAZING_TRIM || "#f2c94c";
    const goldClash = amazing && (colorDist(c.armor, gold) < 0.25 || colorDist(c.suit, gold) < 0.25);
    const trimColor = amazing ? (goldClash ? AMAZING_CONTRAST : gold) : c.trim;
    const visorGlow = num(skin.glow, num(TUNE.VISOR_GLOW, 1.2)) * (amazing ? 1.6 : 1);
    bake = { bins: new Map(), special: new Set(), seen: new Set(), pivots: new Set() };

    const M = {
      suit: std(c.suit, { rough: 0.8, metal: 0.05 }),
      armor: std(c.armor, { rough: 0.38, metal: 0.3 }),
      trim: std(trimColor, { rough: 0.35, metal: 0.35, emissive: trimColor, ei: amazing ? 0.35 : 0.12 }),
      visor: std(c.visor, { rough: 0.12, metal: 0.4, emissive: c.glow, ei: visorGlow }),
      cape: std(c.cape, { rough: 0.9, metal: 0, side: THREE.DoubleSide }),
      glow: std(c.glow, { rough: 0.4, metal: 0, emissive: c.glow, ei: 1.6 }),
      tip: std(c.glow, { rough: 0.4, metal: 0, emissive: c.glow, ei: 1.5 }),
      dark: std(ART.dark, { rough: 0.7, metal: 0.15 }),
      steel: std(ART.steel, { rough: 0.3, metal: 0.5 }),
    };
    // These animate on their own (visor pulse, antenna tip), so they keep their material.
    bake.special.add(M.visor);
    bake.special.add(M.tip);

    const look = new THREE.Group();
    look.name = "PHHunterLook";
    const hips = new THREE.Group();
    hips.name = "PHHips";
    look.add(hips);

    // ---- legs (pivots at the hips) ----
    const legL = limbPivot(hips, 0.5, 2.0, 0);
    const legR = limbPivot(hips, -0.5, 2.0, 0);
    for (const [leg, side] of [[legL, 1], [legR, -1]]) {
      box(leg, [0.82, 1.05, 0.82], M.suit, [0, -0.52, 0]);
      box(leg, [0.62, 0.42, 0.2], M.armor, [0, -1.0, 0.44]);
      box(leg, [0.88, 0.76, 0.88], M.armor, [0, -1.4, 0]);
      box(leg, [0.06, 0.5, 0.05], M.glow, [side * 0.22, -1.4, 0.46]);
      box(leg, [0.94, 0.44, 1.24], M.dark, [0, -1.8, 0.14]);
      box(leg, [0.96, 0.08, 1.26], M.trim, [0, -1.98, 0.14]);
      if (cls.id === "glock-speed") {
        // Speed fins on the boots (§9.2), glowing.
        box(leg, [0.06, 0.42, 0.7], M.glow, [side * 0.5, -1.66, -0.32], [0.5, 0, 0]);
        box(leg, [0.06, 0.3, 0.5], M.trim, [side * 0.5, -1.5, -0.55], [0.7, 0, 0]);
      }
      merge(leg);
    }

    // ---- torso (static) ----
    const torso = new THREE.Group();
    torso.name = "PHTorso";
    hips.add(torso);
    bake.pivots.add(torso);
    box(torso, [1.8, 0.85, 0.95], M.suit, [0, 2.55, 0]);
    box(torso, [2.05, 1.3, 1.08], M.suit, [0, 3.45, 0]);
    box(torso, [1.72, 1.02, 0.24], M.armor, [0, 3.5, 0.6]);
    box(torso, [1.2, 0.42, 0.2], M.armor, [0, 2.86, 0.55]);
    box(torso, [0.08, 0.9, 0.05], M.trim, [0.64, 3.5, 0.73]);
    box(torso, [0.08, 0.9, 0.05], M.trim, [-0.64, 3.5, 0.73]);
    cyl(torso, 0.22, 0.22, 0.08, M.glow, [0, 3.55, 0.73], [Math.PI / 2, 0, 0], 20);
    torus(torso, 0.3, 0.05, M.trim, [0, 3.55, 0.74], [0, 0, 0]);
    // belt, buckle, pouches
    box(torso, [2.0, 0.32, 1.12], M.dark, [0, 2.15, 0]);
    box(torso, [0.42, 0.26, 0.1], M.trim, [0, 2.15, 0.6]);
    box(torso, [0.38, 0.38, 0.3], M.armor, [0.62, 2.05, 0.64]);
    box(torso, [0.38, 0.38, 0.3], M.armor, [-0.62, 2.05, 0.64]);
    box(torso, [0.3, 0.42, 0.5], M.armor, [-1.02, 2.1, 0.05]);
    // collar
    cyl(torso, 0.58, 0.68, 0.3, M.armor, [0, 4.17, 0], [0, 0, 0], 16);
    // shoulder pads with trim edge and glow studs
    for (const side of [1, -1]) {
      box(torso, [0.98, 0.44, 1.18], M.armor, [side * 1.3, 4.1, 0], [0, 0, side * -0.26]);
      box(torso, [1.0, 0.08, 1.2], M.trim, [side * 1.33, 3.88, 0], [0, 0, side * -0.26]);
      sph(torso, 0.08, M.glow, [side * 1.32, 4.3, 0.5], 8);
    }
    // Tier pips on the left pad: one per rung reached (1..8).
    for (let i = 0; i <= Math.min(7, tier); i++) {
      box(torso, [0.1, 0.06, 0.1], M.glow, [1.34, 4.36, -0.42 + i * 0.12], [0, 0, -0.26]);
    }
    // backpack with glowing vents
    box(torso, [1.32, 1.3, 0.56], M.armor, [0, 3.35, -0.8]);
    box(torso, [1.36, 0.1, 0.6], M.trim, [0, 3.98, -0.8]);
    for (let i = 0; i < 3; i++) box(torso, [0.9, 0.07, 0.05], M.glow, [0, 3.0 + i * 0.22, -1.09]);
    if (cls.weapon === "bomb") {
      // Bomb satchel on the left hip with two bombs peeking out (§9.2).
      const sat = std(ART.satchel, { rough: 0.9, metal: 0 });
      const blk = std(ART.bombBody, { rough: 0.5, metal: 0.2 });
      box(torso, [0.55, 0.6, 0.62], sat, [1.12, 2.15, 0.1]);
      box(torso, [0.58, 0.16, 0.64], M.trim, [1.12, 2.42, 0.1]);
      sph(torso, 0.2, blk, [1.12, 2.6, 0.22], 10);
      sph(torso, 0.18, blk, [1.12, 2.58, -0.12], 10);
    }

    // ---- head (static) ----
    box(torso, [0.3, 0.3, 0.3], M.dark, [0, 4.4, 0]);
    sph(torso, 0.7, M.armor, [0, 4.88, 0], 20, [1, 1.05, 1.05]);
    // Visor: a wraparound band on the front of the helmet.
    const visorGeo = new THREE.SphereGeometry(0.735, 28, 10, Math.PI / 2 - 1.05, 2.1, 1.2, 0.55);
    addMesh(torso, visorGeo, M.visor, [0, 4.9, 0], null, [1, 1.05, 1.05]);
    box(torso, [0.14, 0.24, 1.1], M.trim, [0, 5.56, -0.05]);
    box(torso, [0.82, 0.28, 0.3], M.armor, [0, 4.5, 0.56]);
    for (let i = 0; i < 3; i++) box(torso, [0.5, 0.03, 0.04], M.dark, [0, 4.44 + i * 0.07, 0.72]);
    for (const side of [1, -1]) {
      cyl(torso, 0.25, 0.25, 0.2, M.armor, [side * 0.72, 4.88, 0], [0, 0, Math.PI / 2], 16);
      cyl(torso, 0.12, 0.12, 0.22, M.glow, [side * 0.74, 4.88, 0], [0, 0, Math.PI / 2], 12);
    }
    // Pig-tracker antenna on the right side of the helmet (§9.2).
    cyl(torso, 0.035, 0.035, 0.95, M.dark, [-0.56, 5.55, -0.22], [0, 0, 0.12], 6);
    const tipMesh = sph(torso, 0.1, M.tip, [-0.62, 6.04, -0.22], 10);
    tipMesh.userData.keep = true;
    if (amazing) {
      // Helmet flashlight, gold crest wings.
      cyl(torso, 0.15, 0.17, 0.44, M.dark, [0.6, 5.05, 0.32], [Math.PI / 2, 0, 0], 14);
      const lens = std(ART.lens, { rough: 0.1, metal: 0, emissive: ART.lens, ei: 2 });
      cyl(torso, 0.13, 0.13, 0.04, lens, [0.6, 5.05, 0.55], [Math.PI / 2, 0, 0], 14);
      for (const side of [1, -1]) {
        box(torso, [0.06, 0.55, 0.8], M.trim, [side * 0.86, 5.2, -0.15], [0.45, 0, side * -0.35]);
        box(torso, [0.05, 0.35, 0.55], M.glow, [side * 0.9, 5.42, -0.38], [0.6, 0, side * -0.35]);
      }
    }

    // ---- RPG tube on the right shoulder (rpg, detector, amazing) ----
    let rpg = null;
    let rpgZ = 0;
    if (cls.weapon === "rpg") {
      const tubeMat = std(amazing ? "#2a2a33" : ART.rpgTube, { rough: 0.55, metal: 0.25 });
      const warhead = std(amazing ? (AMAZING_TRIM || "#f2c94c") : ART.bombBand, { rough: 0.4, metal: 0.3 });
      rpg = new THREE.Group();
      rpg.name = "PHRpg";
      bake.pivots.add(rpg);
      rpgZ = 0.25;
      rpg.position.set(-1.0, 4.55, rpgZ);
      torso.add(rpg);
      cyl(rpg, 0.28, 0.28, 2.8, tubeMat, [0, 0, 0.2], [Math.PI / 2, 0, 0], 16);
      cyl(rpg, 0.42, 0.3, 0.32, tubeMat, [0, 0, -1.25], [Math.PI / 2, 0, 0], 16);
      cone(rpg, 0.34, 0.85, warhead, [0, 0, 2.0], [Math.PI / 2, 0, 0], 16);
      cyl(rpg, 0.31, 0.31, 0.1, M.glow, [0, 0, 1.45], [Math.PI / 2, 0, 0], 16);
      cyl(rpg, 0.31, 0.31, 0.1, M.trim, [0, 0, -0.6], [Math.PI / 2, 0, 0], 16);
      box(rpg, [0.16, 0.24, 0.44], M.dark, [0, 0.36, 0.6]);
      sph(rpg, 0.05, M.glow, [0, 0.5, 0.72], 6);
      box(rpg, [0.18, 0.5, 0.22], M.dark, [0, -0.42, 0.55]);
      merge(rpg);
    }

    // ---- detector dish on the backpack (detector, amazing) ----
    let dish = null;
    let dishMat = null;
    if (cls.abilities.includes("detect")) {
      dish = new THREE.Group();
      dish.name = "PHDish";
      bake.pivots.add(dish);
      dish.position.set(0, 4.1, -0.95);
      torso.add(dish);
      cyl(dish, 0.05, 0.05, 0.6, M.dark, [0, 0.3, 0], null, 6);
      const bowl = new THREE.SphereGeometry(0.62, 20, 8, 0, Math.PI * 2, 0, 1.0);
      const bowlMat = std(c.armor, { rough: 0.3, metal: 0.4, side: THREE.DoubleSide });
      addMesh(dish, bowl, bowlMat, [0, 1.1, -0.2], [-2.4, 0, 0], [1, 0.55, 1]);
      dishMat = std(XRAY_RED, { rough: 0.4, metal: 0, emissive: XRAY_RED, ei: 1.0 });
      bake.special.add(dishMat);
      sph(dish, 0.13, dishMat, [0, 0.95, 0.05], 10);
      cyl(dish, 0.025, 0.025, 0.5, M.dark, [0, 0.9, -0.05], [-0.8, 0, 0], 5);
    }

    merge(torso);

    // ---- arms (pivots at the shoulders) ----
    const armL = limbPivot(hips, 1.28, 3.85, 0);
    const armR = limbPivot(hips, -1.28, 3.85, 0);
    for (const [arm, side] of [[armL, 1], [armR, -1]]) {
      box(arm, [0.66, 1.0, 0.66], M.suit, [0, -0.55, 0]);
      box(arm, [0.78, 0.88, 0.78], M.armor, [0, -1.45, 0]);
      box(arm, [0.05, 0.56, 0.05], M.glow, [side * -0.02, -1.45, 0.41]);
      box(arm, [0.8, 0.1, 0.8], M.trim, [0, -1.02, 0]);
      box(arm, [0.7, 0.44, 0.7], M.dark, [0, -2.07, 0]);
      if (cls.weapon === "punch") {
        // Knuckle guards with glowing studs (§9.2 "fists with knuckle guards").
        box(arm, [0.76, 0.24, 0.22], M.trim, [0, -2.12, 0.38]);
        for (let i = -1; i <= 1; i++) sph(arm, 0.075, M.glow, [i * 0.22, -2.12, 0.5], 8);
      }
    }
    const hand = new THREE.Group();
    hand.name = "PHHand";
    hand.position.set(0, -2.15, 0);
    armR.add(hand);
    let fuseTip = null;
    if (cls.weapon === "sword") buildSword(hand);
    else if (cls.weapon === "glock") buildBlaster(hand, M, c);
    else if (cls.weapon === "bomb") fuseTip = buildHandBomb(hand, M);
    merge(hand);
    merge(armL);
    merge(armR);

    // ---- cape (pivot at the upper back) ----
    const cape = limbPivot(hips, 0, 4.05, -1.1);
    const capeLen = 2.0 + tier * 0.12;
    box(cape, [1.6 + tier * 0.04, capeLen, 0.07], M.cape, [0, -capeLen / 2, -0.05]);
    box(cape, [1.62 + tier * 0.04, 0.12, 0.09], M.trim, [0, -capeLen + 0.04, -0.05]);
    if (amazing) {
      const starGeo = starGeometry(0.42, 0.18, 0.05);
      addMesh(cape, starGeo, M.glow, [0, -capeLen * 0.42, -0.11], [0, Math.PI, 0]);
    }
    merge(cape);

    // ---- The Amazing Hunter: aura ring, halo, orbiting shards ----
    let aura = null;
    let auraMat = null;
    let halo = null;
    let orbit = null;
    if (amazing) {
      auraMat = new THREE.MeshBasicMaterial({
        color: AMAZING_TRIM || "#f2c94c", transparent: true, opacity: 0.45, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      aura = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.3, 48, 1), auraMat);
      aura.rotation.x = -Math.PI / 2;
      aura.position.y = 0.08;
      aura.frustumCulled = false;
      look.add(aura);
      const inner = new THREE.Mesh(new THREE.RingGeometry(2.45, 2.55, 48, 1), auraMat);
      inner.position.z = 0.001;
      inner.frustumCulled = false;
      aura.add(inner);
      halo = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 8, 32), M.trim);
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 6.25;
      look.add(halo);
      orbit = new THREE.Group();
      orbit.position.y = 3.4;
      look.add(orbit);
      for (let i = 0; i < 3; i++) {
        const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), M.glow);
        const a = (i / 3) * Math.PI * 2;
        shard.position.set(Math.cos(a) * 2.0, 0, Math.sin(a) * 2.0);
        orbit.add(shard);
      }
      bake.pivots.add(orbit);
      merge(orbit);
    }
    endBake(look);

    look.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });

    look.userData.ph = {
      classId: cls.id, skinId: skin.id, pose: cls.weapon || "punch",
      hips, legL, legR, armL, armR, cape, rpg, rpgZ, dish, dishMat, aura, auraMat, halo, orbit,
      fuseTip, tipMat: M.tip, visorMat: M.visor, visorBase: visorGlow,
    };
    // Rest pose so a look that is never animated (a preview) still stands right.
    const pose = POSES[cls.weapon] || POSES.punch;
    armR.rotation.set(pose.rx, 0, pose.rz);
    armL.rotation.set(pose.lx, 0, pose.lz);
    cape.rotation.x = 0.12;
    return look;
  }

  // Wooden sword (§8.3): blade #b98a52, hilt #7a4a2a, along hand-local +Z.
  function buildSword(hand) {
    const col = (WEAPONS.sword && WEAPONS.sword.colors) || { blade: "#b98a52", hilt: "#7a4a2a" };
    const blade = std(col.blade, { rough: 0.85, metal: 0 });
    const hilt = std(col.hilt, { rough: 0.85, metal: 0 });
    const g = new THREE.Group();
    g.position.set(0, -0.05, 0.05);
    hand.add(g);
    box(g, [0.14, 0.36, 2.5], blade, [0, 0, 1.55]);
    box(g, [0.1, 0.26, 0.42], blade, [0, 0, 2.95], [Math.PI / 4, 0, 0], [1, 0.72, 0.72]);
    box(g, [0.04, 0.06, 2.3], hilt, [0.08, 0, 1.5]);
    box(g, [0.95, 0.16, 0.22], hilt, [0, 0, 0.28]);
    cyl(g, 0.1, 0.1, 0.6, hilt, [0, 0, -0.05], [Math.PI / 2, 0, 0], 8);
    sph(g, 0.14, hilt, [0, 0, -0.4], 8);
    merge(g);
  }

  // Toy blaster "Glock" (§8.4): chunky, skin-coloured, orange tip. Built barrel +Z, then
  // turned so the barrel runs along the arm (-Y) and points forward when the arm is raised.
  function buildBlaster(hand, M, c) {
    const g = new THREE.Group();
    g.rotation.x = Math.PI / 2;
    g.position.set(0, -0.1, 0);
    hand.add(g);
    const body = std(c.trim, { rough: 0.45, metal: 0.1 });
    const tip = std(ART.orange, { rough: 0.5, metal: 0, emissive: ART.orange, ei: 0.6 });
    box(g, [0.36, 0.46, 1.0], body, [0, 0.18, 0.35]);
    box(g, [0.3, 0.12, 0.9], M.armor, [0, 0.46, 0.35]);
    cyl(g, 0.12, 0.12, 0.5, M.dark, [0, 0.22, 1.0], [Math.PI / 2, 0, 0], 12);
    cyl(g, 0.15, 0.15, 0.16, tip, [0, 0.22, 1.3], [Math.PI / 2, 0, 0], 12);
    box(g, [0.28, 0.55, 0.32], M.dark, [0, -0.2, 0.0], [-0.25, 0, 0]);
    box(g, [0.05, 0.08, 0.6], M.glow, [0.19, 0.22, 0.4]);
    box(g, [0.05, 0.08, 0.6], M.glow, [-0.19, 0.22, 0.4]);
    sph(g, 0.06, M.glow, [0, 0.56, 0.75], 6);
    merge(g);
  }

  // The bomb in hand (§9.2): black sphere, red band, a sparking fuse.
  function buildHandBomb(hand, M) {
    const blk = std(ART.bombBody, { rough: 0.45, metal: 0.25 });
    const band = std(ART.bombBand, { rough: 0.5, metal: 0.1 });
    sph(hand, 0.4, blk, [0, -0.32, 0.12], 14);
    torus(hand, 0.4, 0.06, band, [0, -0.32, 0.12], [Math.PI / 2, 0, 0]);
    cyl(hand, 0.06, 0.08, 0.3, M.dark, [0, -0.78, 0.12], null, 6);
    const spark = std("#ffd36f", { rough: 0.3, metal: 0, emissive: "#ffb21a", ei: 2.5 });
    const tip = sph(hand, 0.09, spark, [0, -0.96, 0.12], 8);
    tip.userData.keep = true;
    return tip;
  }

  // A planted bomb: fx.bombModel() when present, else an equivalent local build.
  function buildBombObject() {
    let obj = null;
    try { if (fx && typeof fx.bombModel === "function") obj = fx.bombModel(); } catch { obj = null; }
    if (obj && obj.isObject3D) {
      obj.userData.phOwnBomb = false;
      return obj;
    }
    const g = new THREE.Group();
    g.name = "PHBomb";
    const blk = std(ART.bombBody, { rough: 0.45, metal: 0.25 });
    const band = std(ART.bombBand, { rough: 0.5, metal: 0.1, emissive: ART.bombBand, ei: 0.3 });
    const body = new THREE.Group();
    body.name = "PHBombBody";
    g.add(body);
    sph(body, 0.6, blk, [0, 0.6, 0], 16);
    torus(body, 0.6, 0.08, band, [0, 0.6, 0], [Math.PI / 2, 0, 0]);
    cyl(body, 0.08, 0.1, 0.4, std(ART.dark, { rough: 0.7, metal: 0 }), [0, 1.35, 0], null, 6);
    const spark = std("#ffd36f", { rough: 0.3, metal: 0, emissive: "#ffb21a", ei: 2.5 });
    const tip = sph(body, 0.12, spark, [0, 1.6, 0], 8);
    tip.name = "PHFuse";
    g.userData.phOwnBomb = true;
    g.userData.fuse = tip;
    g.userData.body = body;
    g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    return g;
  }

  // The fuse ticks faster and the bomb swells as the fuse runs out.
  function animateBomb(obj, f) {
    if (!obj || !obj.userData.phOwnBomb) return;
    const left = Math.max(0, f);
    const rate = 6 + (5 - Math.min(5, left)) * 5;
    const s = 1 + 0.12 * Math.max(0, Math.sin(animT * rate)) * (left < 2 ? 1.6 : 1);
    if (obj.userData.body) obj.userData.body.scale.set(s, s, s);
    if (obj.userData.fuse) {
      const k = 0.6 + 0.6 * Math.abs(Math.sin(animT * 23));
      obj.userData.fuse.scale.set(k, k, k);
    }
  }

  // =====================================================================================
  // Mesh-building helpers (each look owns its own geometries and materials)
  // =====================================================================================

  function std(color, o) {
    const m = new THREE.MeshStandardMaterial({
      color, roughness: o && o.rough != null ? o.rough : 0.6, metalness: o && o.metal != null ? o.metal : 0.1,
    });
    if (o && o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.ei != null ? o.ei : 1; }
    if (o && o.side) m.side = o.side;
    return m;
  }

  function addMesh(parent, geo, mat, pos, rot, scl) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scl) m.scale.set(scl[0], scl[1], scl[2]);
    parent.add(m);
    return m;
  }
  function box(parent, s, mat, pos, rot, scl) {
    return addMesh(parent, new THREE.BoxGeometry(s[0], s[1], s[2]), mat, pos, rot, scl);
  }
  function cyl(parent, rt, rb, h, mat, pos, rot, seg) {
    return addMesh(parent, new THREE.CylinderGeometry(rt, rb, h, seg || 12), mat, pos, rot);
  }
  function cone(parent, r, h, mat, pos, rot, seg) {
    return addMesh(parent, new THREE.ConeGeometry(r, h, seg || 12), mat, pos, rot);
  }
  function sph(parent, r, mat, pos, seg, scl) {
    const s = seg || 12;
    return addMesh(parent, new THREE.SphereGeometry(r, s, Math.max(6, Math.round(s * 0.7))), mat, pos, null, scl);
  }
  function torus(parent, r, tube, mat, pos, rot) {
    return addMesh(parent, new THREE.TorusGeometry(r, tube, 8, 28), mat, pos, rot);
  }
  function limbPivot(parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    if (bake) bake.pivots.add(g);
    return g;
  }

  function colorDist(a, b) {
    try {
      const x = new THREE.Color(a);
      const y = new THREE.Color(b);
      return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b);
    } catch {
      return 1;
    }
  }

  // ---- the hunter bake (draw-call budget, spec 27 §9.2) -----------------------------------
  // While a hunter model is being built, merge() folds every static primitive under each
  // animated pivot (legs, arms with the hand and weapon, torso with the head, cape, RPG,
  // dish, orbit) into at most one vertex-coloured mesh per bin (lit, glow, and their
  // double-sided variants), so a whole hunter is 14-24 draw calls rather than 29-46. Only the
  // materials that animate on their own stay separate.
  function binKey(m) {
    if (!bake || !m || !m.isMeshStandardMaterial || m.transparent || m.map || bake.special.has(m)) return null;
    const side = m.side === THREE.DoubleSide ? "d" : "f";
    const e = m.emissive;
    const glow = m.emissiveIntensity >= 1 && e && e.r + e.g + e.b > 0.05;
    return (glow ? "glow" : "lit") + side;
  }

  function binMat(key) {
    let m = bake.bins.get(key);
    if (m) return m;
    const side = key.endsWith("d") ? THREE.DoubleSide : THREE.FrontSide;
    if (key.startsWith("glow")) m = new THREE.MeshBasicMaterial({ vertexColors: true, side });
    else m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.22, side });
    m.userData.phBin = true;
    bake.bins.set(key, m);
    return m;
  }

  function bakeMerge(group) {
    if (!bake.pivots.has(group)) return;   // static sub-groups are folded into their pivot
    // Matrices relative to the pivot: walk down from it, skipping nested pivots.
    const items = new Map();   // key -> [{ geo, color }]
    const visit = (node, rel) => {
      for (const child of [...node.children]) {
        if (bake.pivots.has(child)) continue;
        child.updateMatrix();
        const m = new THREE.Matrix4().multiplyMatrices(rel, child.matrix);
        if (child.isMesh) {
          if (child.userData.keep || child.children.length) continue;
          const key = binKey(child.material);
          if (!key) continue;
          bake.seen.add(child.material);
          const g = child.geometry.clone();
          g.applyMatrix4(m);
          let list = items.get(key);
          if (!list) { list = []; items.set(key, list); }
          list.push({ geo: g, color: child.material.color.clone() });
          node.remove(child);
          child.geometry.dispose();
        } else if (child.isGroup || child.type === "Object3D") {
          visit(child, m);
        }
      }
    };
    visit(group, new THREE.Matrix4());
    for (const [key, list] of items) {
      const geos = list.map((x) => x.geo);
      const geo = geos.length === 1 ? geos[0] : concatGeometries(geos);
      const n = geo.attributes.position.count;
      const col = new Float32Array(n * 3);
      let o = 0;
      for (const x of list) {
        const c = x.geo.attributes.position.count;
        for (let i = 0; i < c; i++) {
          col[(o + i) * 3] = x.color.r; col[(o + i) * 3 + 1] = x.color.g; col[(o + i) * 3 + 2] = x.color.b;
        }
        o += c;
      }
      if (geos.length > 1) for (const g of geos) g.dispose();
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const mesh = new THREE.Mesh(geo, binMat(key));
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }

  // Close a bake: dispose the source materials no mesh uses any more.
  function endBake(look) {
    if (!bake) return;
    const used = new Set();
    look.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) used.add(m);
    });
    for (const m of bake.seen) if (!used.has(m)) m.dispose();
    bake = null;
  }

  function starGeometry(outer, inner, depth) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  }

  // Merge a group's leaf meshes by material into one mesh per material, so a whole hunter
  // costs a few dozen draw calls instead of a hundred. Meshes flagged userData.keep (they
  // animate on their own) and meshes with children stay as they are.
  function merge(group) {
    if (bake) { bakeMerge(group); return; }
    const buckets = new Map();
    for (const child of [...group.children]) {
      if (!child.isMesh || child.userData.keep || child.children.length) continue;
      child.updateMatrix();
      const g = child.geometry.clone();
      g.applyMatrix4(child.matrix);
      let b = buckets.get(child.material);
      if (!b) { b = []; buckets.set(child.material, b); }
      b.push(g);
      group.remove(child);
      child.geometry.dispose();
    }
    for (const [mat, list] of buckets) {
      const geo = list.length === 1 ? list[0] : concatGeometries(list);
      if (list.length > 1) for (const g of list) g.dispose();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }

  function concatGeometries(list) {
    let vCount = 0;
    let iCount = 0;
    for (const g of list) {
      vCount += g.attributes.position.count;
      iCount += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(vCount * 3);
    const nor = new Float32Array(vCount * 3);
    const uv = new Float32Array(vCount * 2);
    const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
    let vo = 0;
    let io = 0;
    for (const g of list) {
      if (!g.attributes.normal) g.computeVertexNormals();
      const p = g.attributes.position;
      const n = g.attributes.normal;
      const t = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        pos[(vo + i) * 3] = p.getX(i); pos[(vo + i) * 3 + 1] = p.getY(i); pos[(vo + i) * 3 + 2] = p.getZ(i);
        nor[(vo + i) * 3] = n.getX(i); nor[(vo + i) * 3 + 1] = n.getY(i); nor[(vo + i) * 3 + 2] = n.getZ(i);
        if (t) { uv[(vo + i) * 2] = t.getX(i); uv[(vo + i) * 2 + 1] = t.getY(i); }
      }
      if (g.index) {
        const ix = g.index;
        for (let i = 0; i < ix.count; i++) idx[io + i] = ix.getX(i) + vo;
        io += ix.count;
      } else {
        for (let i = 0; i < p.count; i++) idx[io + i] = vo + i;
        io += p.count;
      }
      vo += p.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }

  function disposeObject(obj) {
    if (!obj) return;
    const mats = new Set();
    obj.traverse((o) => {
      if (o.geometry && typeof o.geometry.dispose === "function") o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => mats.add(m));
        else mats.add(o.material);
      }
    });
    for (const m of mats) {
      if (m.map && typeof m.map.dispose === "function") m.map.dispose();
      if (typeof m.dispose === "function") m.dispose();
    }
  }

  function removeCustom(partId, obj) {
    if (partId != null) {
      try { parts.remove(partId); } catch { /* already gone */ }
    }
    if (obj && obj.parent) obj.parent.remove(obj);
    disposeObject(obj);
  }

  // =====================================================================================
  // fx / audio wrappers: visuals are optional and must never halt update
  // =====================================================================================

  function fxc(name, ...args) {
    if (!fx || typeof fx[name] !== "function") return null;
    try { return fx[name](...args); } catch { return null; }
  }

  function stopHandle(h) {
    if (!h) return;
    for (const m of ["stop", "end", "remove", "dispose"]) {
      if (typeof h[m] === "function") {
        try { h[m](); } catch { /* fine */ }
        return;
      }
    }
  }

  function sfx(name, opts) {
    try { ctx.engine.audio.playSfx(name, opts); } catch { /* audio is optional, always */ }
  }

  // =====================================================================================
  // Round hooks (§2.5)
  // =====================================================================================

  function clearCombat() {
    while (bombs.length) {
      const b = bombs.pop();
      removeCustom(b.partId, b.obj);
      fxc("dust", b.p);
    }
    publishBombs();
    while (rockets.length) stopHandle(rockets.pop().handle);
    S.hunter.detectOn = 0;
  }

  function resetCooldowns() {
    ensureCd();
    for (const k of Object.keys(S.hunter.cd)) S.hunter.cd[k] = 0;
  }

  function onRoleStart() {
    clearCombat();
    resetCooldowns();
    if (S.save) {
      if (HUNTER_IDS.has(S.save.hunterClass)) S.hunter.classId = S.save.hunterClass;
      if (typeof S.save.hunterSkin === "string") S.hunter.skinId = S.save.hunterSkin;
    }
  }

  function onSeek() {
    resetCooldowns();
    if (S.role === "hunter") {
      const cls = myClass();
      S.toastQ.push({ text: `GO! ${cls.name}: ${WEAPONS[cls.weapon] ? WEAPONS[cls.weapon].name : "Punch"} ready`, icon: cls.icon });
    }
  }

  function onRoundEnd() { clearCombat(); }
  function onLobby() { clearCombat(); resetCooldowns(); }

  // A peer's rocket launch or explosion (§4.6 seq events, fired once per increase).
  function onRemoteFx(peerId, kind, data) {
    if (disposed || !data || peerId === S.selfId) return;
    if (kind === "rk") {
      if (!Array.isArray(data.p) || !Array.isArray(data.d)) return;
      const d = norm(data.d);
      if (!d) return;
      const prev = remoteRockets.get(peerId);
      if (prev) stopHandle(prev.handle);
      const speed = num(TUNE.RPG_SPEED, 90);
      const range = num(TUNE.RPG_RANGE, 140);
      const handle = fxc("rocket", data.p.slice(), d, speed, range);
      remoteRockets.set(peerId, { p0: data.p.slice(), d, age: 0, speed, range, handle });
      animateAttack(peerId, "rocket");
      sfx("whoosh", { volume: 0.6, pitch: 0.55 });
    } else if (kind === "ex") {
      if (!Array.isArray(data.p)) return;
      const r = clamp(num(data.r, 10), 1, 40);
      const rr = remoteRockets.get(peerId);
      if (rr) {
        const at = add(rr.p0, scale(rr.d, Math.min(rr.range, rr.age * rr.speed)));
        if (dist(at, data.p) < 25 || rr.age * rr.speed >= rr.range - 5) {
          stopHandle(rr.handle);
          remoteRockets.delete(peerId);
        }
      }
      fxc("explosion", data.p.slice(), r);
      const me = myPos();
      const far = dist(me, data.p);
      const vol = clamp(1.4 - far / 120, 0.15, 1.4);
      sfx("pop", { volume: vol, pitch: r >= 15 ? num(TUNE.BOMB_PITCH, 0.4) : 0.5 });
      if (far < r * 2.5) {
        try { ctx.engine.camera.shake(clamp(0.5 - far / (r * 6), 0.1, 0.5), 0.4); } catch { /* fine */ }
      }
    }
  }

  // =====================================================================================
  // dispose
  // =====================================================================================

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const u of unsubs.splice(0)) { try { u(); } catch { /* fine */ } }
    for (const b of bombs.splice(0)) removeCustom(b.partId, b.obj);
    for (const r of rockets.splice(0)) stopHandle(r.handle);
    for (const [, rb] of remoteBombs) removeCustom(rb.partId, rb.obj);
    remoteBombs.clear();
    for (const [, rr] of remoteRockets) stopHandle(rr.handle);
    remoteRockets.clear();
    for (const b of beams.splice(0)) {
      if (b.obj.parent) b.obj.parent.remove(b.obj);
      disposeObject(b.obj);
    }
    for (const [key, rec] of looks) releaseLook(key, rec);
    looks.clear();
    peerSeen.clear();
    if (S && S.hunter) {
      S.hunter.bm = [];
      S.hunter.detectOn = 0;
    }
  }

  return {
    update,
    attack,
    use,
    buttons,
    onRoleStart,
    onSeek,
    onRoundEnd,
    onLobby,
    onRemoteFx,
    buildHunterModel,
    dispose,
  };
}

// ---- small pure helpers ----------------------------------------------------------------

function num(v, d) { return typeof v === "number" && Number.isFinite(v) ? v : d; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function len(a) { return Math.hypot(a[0], a[1], a[2]); }
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function norm(a) {
  const l = len(a);
  return l > 1e-6 ? [a[0] / l, a[1] / l, a[2] / l] : null;
}
function round1(v) { return Math.round(v * 10) / 10; }
function round2(v) { return Math.round(v * 100) / 100; }
