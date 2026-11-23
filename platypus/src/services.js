// services.js - generic gameplay services for levels 6-11 (ENGINE file; the contract is LEVELS2.md Part A).
//   ctx.health      player health / damage, death and the fast restart
//   ctx.checkpoint  checkpoints: "caught / shot / crashed -> back to the last checkpoint" in under a second
//   ctx.vehicle     possession: a level object (the helicopter) takes over the controls and the follow camera
//   ctx.abilities   ability slots a level can enable: potion throw (aim arc), scream (charge + cooldown),
//                   ranged fire (aim assist for mouse, keys and touch)
//   ctx.gear        what the platypus is wearing (armor, suit, glasses) + its modifiers
//   ctx.army        followers registry + formation slots + the HUD counter
// Everything is OFF until a level turns it on, and everything is turned off again when a level is left, so
// levels 1-5 never see any of it. No per-frame allocations.

const TAU = Math.PI * 2;
const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// e: { THREE, scene, camera, ctx, player, platypus, cam, ui, cinema, audio, music, time, io, held, setTimeScale, floorAt, after }
// io: { mouseX, mouseY, mouseT (time.real of the last mouse move), dragOn, dragX, dragY (finger drag from the potion button, px) }
export function createServices(e) {
  const { THREE, scene, camera, player, platypus, cam, ui, cinema, audio, music, time, io, held } = e;

  // =====================================================================================================
  // gear
  // =====================================================================================================
  const SLOTS = ["body", "head", "eyes", "back", "weapon"];
  const gear = {
    worn: { body: null, head: null, eyes: null, back: null, weapon: null },
    mods: { body: null, head: null, eyes: null, back: null, weapon: null },
    armor: 0, // 0..0.8: the fraction of every hit that the worn gear absorbs (health.damage applies it)
    speed: 1, // product of the worn pieces' speed multipliers (levels apply it to player.maxSpeed themselves)
    onChange: null, // (slot, id | null)
    // slot: "body" | "head" | "eyes" | "back" | "weapon". mods: { armor: 0..0.8, speed: multiplier, visor: bool }
    wear(slot, id, mods) {
      if (!(slot in gear.worn)) return false;
      gear.worn[slot] = id || null;
      gear.mods[slot] = id ? (mods || null) : null;
      if (platypus.setGear) platypus.setGear(slot, id || null);
      recalcGear();
      if (gear.onChange) gear.onChange(slot, id || null);
      return true;
    },
    remove(slot) { return gear.wear(slot, null); },
    has(id) { for (let i = 0; i < SLOTS.length; i++) if (gear.worn[SLOTS[i]] === id) return true; return false; },
    clear() {
      for (let i = 0; i < SLOTS.length; i++) {
        const s = SLOTS[i];
        if (gear.worn[s] !== null) { gear.worn[s] = null; gear.mods[s] = null; if (platypus.setGear) platypus.setGear(s, null); }
      }
      recalcGear();
    },
  };
  function recalcGear() {
    let a = 0, sp = 1, visor = false;
    for (let i = 0; i < SLOTS.length; i++) {
      const m = gear.mods[SLOTS[i]];
      if (!m) continue;
      if (m.armor) a += m.armor;
      if (m.speed) sp *= m.speed;
      if (m.visor) visor = true;
    }
    gear.armor = clamp(a, 0, 0.8);
    gear.speed = sp;
    ui.setVisor(visor);
  }

  // =====================================================================================================
  // army (followers registry)
  // =====================================================================================================
  const army = {
    list: [], // the units, in joining order (read it, do not mutate it)
    count: 0, // living units
    lost: 0, // units removed with lose() since the last clear()
    onChange: null, // (count, delta)
    label: null, // HUD label, or null = the counter is hidden
    // unit: any object with x, y, z (and optionally `alive`). Returns the unit.
    add(unit) {
      if (army.list.indexOf(unit) >= 0) return unit;
      army.list.push(unit);
      armyChanged(1);
      return unit;
    },
    remove(unit) {
      const i = army.list.indexOf(unit);
      if (i < 0) return false;
      army.list.splice(i, 1);
      armyChanged(-1);
      return true;
    },
    // a unit fell: removed, counted in `lost`, the HUD counter shakes red
    lose(unit) { if (army.remove(unit)) army.lost++; },
    clear() { army.list.length = 0; army.lost = 0; army.count = 0; if (army.label !== null) ui.setArmy(0, army.label); },
    // HUD counter on (label, default "Army") / off (false)
    show(label) {
      army.label = label === false || label === null ? null : (label === undefined || label === true ? "Army" : label);
      ui.setArmy(army.label === null ? null : army.count, army.label);
    },
    // formation spot i (0-based) behind the player: rows of five fanned out behind the heading. out: { x, z }
    slot(i, out, spacing) {
      const sp = spacing || 0.9;
      const row = (i / 5) | 0, col = i % 5;
      const side = (col === 0 ? 0 : col % 2 ? (col + 1) / 2 : -col / 2) * sp * (1 + row * 0.12);
      const back = (1.3 + row * sp) + Math.abs(side) * 0.25;
      const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
      out.x = player.x - s * back + c * side;
      out.z = player.z - c * back - s * side;
      return out;
    },
  };
  function armyChanged(d) {
    army.count = army.list.length;
    if (army.label !== null) ui.setArmy(army.count, army.label);
    if (army.onChange) army.onChange(army.count, d);
  }

  // =====================================================================================================
  // health + checkpoints
  // =====================================================================================================
  const hOpt = { max: 5, hearts: false, label: "Health", regen: 0, regenDelay: 4, invuln: 0.9, respawn: true };
  let sinceHurt = 0, pingT = 0;
  const health = {
    on: false, hp: 0, max: 5, dead: false,
    shield: false, // true = damage is ignored (scripted moments)
    onHurt: null, // (amount, src)
    onDeath: null, // (src) -> return true to handle the death yourself (no automatic restart)
    // o: { max: 5, hearts: false (true = the heart row, one heart per point; false = the bar), label: "Health",
    //      regen: 0 (points per second), regenDelay: 4 (seconds after the last hit), invuln: 0.9 (seconds of mercy after a hit),
    //      respawn: true (death -> ctx.checkpoint.respawn()) }
    enable(o) {
      o = o || {};
      hOpt.max = o.max || 5; hOpt.hearts = !!o.hearts; hOpt.label = o.label || "Health";
      hOpt.regen = o.regen || 0; hOpt.regenDelay = o.regenDelay === undefined ? 4 : o.regenDelay;
      hOpt.invuln = o.invuln === undefined ? 0.9 : o.invuln; hOpt.respawn = o.respawn !== false;
      health.on = true; health.dead = false; health.shield = false;
      health.max = hOpt.max; health.hp = hOpt.max;
      player.flicker = true;
      paintHealth();
    },
    disable() {
      if (!health.on) return;
      health.on = false; health.dead = false;
      player.flicker = false;
      ui.setHealth(null); ui.setHearts(null);
    },
    // src (optional): { x, z (where it came from: knock-back and the red direction ping), kind: "melee" | "bullet" | "blast" | "fall" | "crash",
    //                   knock: m/s (default 3, bullets 1.2), pierce: bool (gear armor does not apply), quiet: bool (no sound / flinch) }
    // Returns true if the hit landed (false: health off, dead, shielded, in a cutscene, or still in the mercy time).
    damage(amount, src) {
      if (!health.on || health.dead || health.shield || cinema.playing || player.invuln > 0 || checkpoint.respawning || !(amount > 0)) return false;
      if (!(src && src.pierce)) amount *= 1 - gear.armor;
      health.hp = Math.max(0, health.hp - amount);
      sinceHurt = 0;
      player.invuln = hOpt.invuln;
      if (src && src.x !== undefined) {
        const dx = player.x - src.x, dz = player.z - src.z, d = Math.hypot(dx, dz) || 1;
        const k = src.knock !== undefined ? src.knock : src.kind === "bullet" ? 1.2 : 3;
        player.kx += (dx / d) * k; player.kz += (dz / d) * k;
        // which way it came from, relative to the camera's forward (0 = ahead, + = right)
        ui.setPing(wrap(Math.atan2(-dx, -dz) - cam.yaw) * -1, 1, "danger");
        pingT = 0.7;
      }
      if (!(src && src.quiet)) {
        platypus.hurt();
        audio.playerHurt();
        cinema.shake(0.012 + 0.01 * Math.min(1, amount / hOpt.max * 3), 0.2);
      }
      paintHealth();
      if (health.onHurt) health.onHurt(amount, src || null);
      if (health.hp <= 0) die(src || null);
      return true;
    },
    heal(n) { if (!health.on || health.dead) return; health.hp = Math.min(health.max, health.hp + n); paintHealth(); },
    set(hp) { if (!health.on) return; health.hp = clamp(hp, 0, health.max); paintHealth(); },
    // straight to the death + restart, whatever the mercy time says (caught by a guard, fell into the lava, crashed)
    kill(src) {
      if (!health.on || health.dead || checkpoint.respawning || cinema.playing) return false;
      health.hp = 0; paintHealth(); die(src || null);
      return true;
    },
  };
  function paintHealth() {
    if (hOpt.hearts) ui.setHearts(Math.ceil(health.hp - 1e-6), health.max);
    else ui.setHealth(health.hp / health.max, hOpt.label);
  }
  function die(src) {
    health.dead = true;
    player.enabled = false;
    player.stop();
    if (platypus.collapse) platypus.collapse();
    if (health.onDeath && health.onDeath(src) === true) return;
    if (hOpt.respawn) checkpoint.respawn();
  }

  const cp = { x: 0, z: 0, yaw: 0, hasPos: false, restore: null, label: "" };
  let rsT = -1, rsStage = 0, rsOpt = null; // the restart sequence (real time)
  const checkpoint = {
    id: null, // the active checkpoint's id
    deaths: 0, // restarts since the level was entered
    tries: 0, // restarts since THIS checkpoint was set (levels ease off after a few: see LEVELS2.md A2)
    respawning: false,
    onRespawn: null, // (id) after restore(), with the screen still black
    // Activates a checkpoint. o: { x, z, yaw (where the player restarts; omit all three if restore() places things itself),
    //   label: "Checkpoint" (toast text), silent: false, restore(id) (put the world back: enemies, doors, the vehicle...) }
    // Setting the id that is already active only refreshes the position / restore function (no toast).
    set(id, o) {
      o = o || {};
      const fresh = id !== checkpoint.id;
      checkpoint.id = id;
      cp.hasPos = o.x !== undefined;
      if (cp.hasPos) { cp.x = o.x; cp.z = o.z; cp.yaw = o.yaw || 0; }
      cp.restore = o.restore || null;
      cp.label = o.label || "Checkpoint";
      if (fresh) {
        checkpoint.tries = 0;
        if (!o.silent) { ui.checkpoint(cp.label); if (music.stinger) music.stinger("checkpoint"); (audio.checkpoint || audio.objective).call(audio); }
      }
    },
    // The fast restart. o: { slow: 0.4 (seconds of slow motion before the cut; 0 = cut at once), fade: 0.22, text: null (toast after) }
    // black -> restore(id) -> teleport -> full health -> 1.5 s of mercy -> clear. About 0.9 s in all.
    respawn(o) {
      if (checkpoint.respawning) return;
      checkpoint.respawning = true;
      checkpoint.deaths++; checkpoint.tries++;
      rsOpt = o || null;
      const slow = o && o.slow !== undefined ? o.slow : 0.4;
      player.enabled = false;
      abilities.cancel();
      if (music.stinger) music.stinger("defeat");
      if (slow > 0) e.setTimeScale(0.3, 0.08);
      rsStage = 1; rsT = slow;
    },
    clear() { checkpoint.id = null; checkpoint.deaths = checkpoint.tries = 0; checkpoint.respawning = false; cp.restore = null; cp.hasPos = false; rsStage = 0; },
  };
  function stepRespawn(raw) {
    if (rsStage === 1) {
      rsT -= raw;
      if (rsT > 0) return;
      rsStage = 2;
      // stage 2 runs on its own clock: a fade callback could be dropped by any other fade call
      rsT = (rsOpt && rsOpt.fade) || 0.22;
      cinema.fade("black", rsT);
    } else if (rsStage === 2) {
      rsT -= raw;
      if (rsT > 0) return;
      cinema.fade("black", 0); // whatever else touched the fade, the cut is hidden
      rsStage = 3; rsT = 0.12;
    } else if (rsStage === 3) {
      rsT -= raw;
      if (rsT > 0) return;
      rsStage = 0;
      e.setTimeScale(1, 0);
      player.kx = player.kz = 0;
      if (platypus.revive) platypus.revive();
      if (health.on) { health.dead = false; health.hp = health.max; paintHealth(); }
      let keep;
      if (cp.restore) keep = cp.restore(checkpoint.id);
      if (cp.hasPos && !vehicle.active) player.teleport(cp.x, cp.z, cp.yaw);
      player.invuln = 1.5;
      if (checkpoint.onRespawn) checkpoint.onRespawn(checkpoint.id);
      checkpoint.respawning = false;
      // restore() may return false: it keeps the controls off and reveals the screen itself (it starts a cutscene)
      if (keep !== false) { player.enabled = true; ui.checkpoint((rsOpt && rsOpt.text) || "Try again", 1.4); cinema.fade("clear", 0.3); }
    }
  }

  // =====================================================================================================
  // vehicle (possession)
  // =====================================================================================================
  const vin = { x: 0, y: 0, up: false, down: false, fire: false, alt: false };
  const vSave = { minDist: 0, maxDist: 0, wantDist: 0, pitch: 0, hidden: false, scripted: false };
  const vq = new THREE.Quaternion(), vp = new THREE.Vector3(), vs = new THREE.Vector3();
  let vSeat = null;
  const vehicle = {
    active: null,
    input: vin, // what the vehicle's control() last received (read-only for levels / HUD)
    // v: { x, y, z, yaw  (the engine reads them every frame: camera focus, sun, world focus, player.x/y/z),
    //      control(dt, input)  (called every frame with scaled dt; input = { x, y (-1..1 right / forward), up, down, fire, alt (bools) };
    //                           all zero / false while a cutscene plays, the restart runs, or v.locked is true),
    //      camDist: 9, camHeight: 1.2, camPitch: 0.3, camLag: 2.5 (how fast the camera swings behind the heading; 0 = free orbit only) }
    // o: { seat: Object3D | null (the player model rides it; null = model hidden), dist / pitch override }
    enter(v, o) {
      if (vehicle.active) vehicle.exit();
      vehicle.active = v;
      vSeat = (o && o.seat) || null;
      vSave.minDist = cam.minDist; vSave.maxDist = cam.maxDist; vSave.wantDist = cam.wantDist; vSave.pitch = cam.pitch;
      vSave.hidden = player.hidden; vSave.scripted = player.scripted;
      player.scripted = true;
      player.hidden = !vSeat;
      player.stop();
      const d = (o && o.dist) || v.camDist || 9;
      cam.minDist = d * 0.55; cam.maxDist = d * 1.8; cam.wantDist = d;
      cam.pitch = (o && o.pitch) || v.camPitch || 0.3;
      cam.yaw = v.yaw; cam.manualT = 0;
      cam.tx = v.x; cam.ty = v.y + (v.camHeight === undefined ? 1.2 : v.camHeight); cam.tz = v.z;
      refreshAbil();
    },
    // leaves the vehicle; the player is put at (x, z) facing yaw (default: where the vehicle is)
    exit(x, z, yaw) {
      const v = vehicle.active;
      if (!v) return;
      vehicle.active = null; vSeat = null;
      cam.minDist = vSave.minDist; cam.maxDist = vSave.maxDist; cam.wantDist = vSave.wantDist; cam.pitch = vSave.pitch;
      player.scripted = vSave.scripted; player.hidden = vSave.hidden;
      player.speed = 0; player.grounded = true; player.vy = 0;
      player.teleport(x === undefined ? v.x : x, z === undefined ? v.z : z, yaw === undefined ? v.yaw : yaw);
      refreshAbil();
    },
  };
  function stepVehicle(dt) {
    const v = vehicle.active;
    const free = !cinema.playing && !checkpoint.respawning && !v.locked;
    vin.x = free ? e.ctx.input.x : 0; vin.y = free ? e.ctx.input.y : 0;
    vin.up = free && !!held.jump; vin.down = free && !!held.down;
    vin.fire = free && (!!held.fire || !!held.primary); vin.alt = free && !!held.secondary;
    if (v.control) v.control(dt, vin);
    player.x = v.x; player.y = v.y; player.z = v.z; player.yaw = v.yaw;
    if (vSeat) {
      vSeat.updateWorldMatrix(true, false);
      vSeat.matrixWorld.decompose(vp, vq, vs);
      platypus.group.position.copy(vp);
      platypus.group.quaternion.copy(vq);
    }
  }
  // called by the engine's camera: where the follow rig looks, and the auto-swing behind the heading
  function cameraFocus(out, dt, manual) {
    const v = vehicle.active;
    if (!v) return false;
    out.x = v.x; out.y = v.y + (v.camHeight === undefined ? 1.2 : v.camHeight); out.z = v.z;
    const lag = v.camLag === undefined ? 2.5 : v.camLag;
    if (!manual && lag > 0) cam.yaw += Math.sin(wrap(v.yaw - cam.yaw)) * lag * dt;
    return true;
  }

  // =====================================================================================================
  // abilities
  // =====================================================================================================
  let lastAbil = {};
  const scr = new THREE.Vector3(), aimP = { x: 0, y: 0, z: 0, ok: false };
  const from = { x: 0, y: 0, z: 0 }, to = { x: 0, y: 0, z: 0 }, org = { x: 0, y: 0, z: 0 }, wv = new THREE.Vector3();
  // the cursor's point on the horizontal plane y = planeY. out: { x, y, z, ok }. ok = false on touch / when the ray misses.
  function mouseGround(out, planeY) {
    out.ok = false;
    if (ui.touch) return out;
    scr.set((io.mouseX / window.innerWidth) * 2 - 1, -(io.mouseY / window.innerHeight) * 2 + 1, 0.5).unproject(camera);
    const dx = scr.x - camera.position.x, dy = scr.y - camera.position.y, dz = scr.z - camera.position.z;
    if (dy > -1e-4) return out;
    const t = (planeY - camera.position.y) / dy;
    if (!(t > 0) || t * Math.hypot(dx, dy, dz) > 80) return out;
    out.x = camera.position.x + dx * t; out.y = planeY; out.z = camera.position.z + dz * t; out.ok = true;
    return out;
  }
  function targetOk(t) { return t && t.alive !== false && t.targetable !== false; }
  // the best target for an aim that starts at the player and points along (dx, dz): smallest angle inside `cone`
  // (radians) and `range`; ties go to the nearer one. Returns the target object or null.
  function coneTarget(list, dx, dz, cone, range) {
    if (!list) return null;
    let best = null, bs = 1e9;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (!targetOk(t)) continue;
      const tx = t.x - player.x, tz = t.z - player.z, d = Math.hypot(tx, tz);
      if (d > range || d < 0.05) continue;
      const a = Math.abs(wrap(Math.atan2(tx, tz) - Math.atan2(dx, dz)));
      if (a > cone + (t.r || 0.4) / d) continue;
      const s = a * 6 + d / range;
      if (s < bs) { bs = s; best = t; }
    }
    return best;
  }
  function nearTarget(list, x, z, radius) {
    if (!list) return null;
    let best = null, bd = radius * radius;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (!targetOk(t)) continue;
      const d = (t.x - x) * (t.x - x) + (t.z - z) * (t.z - z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  // ---- aim arc: a dotted parabola + a landing ring (2 draw calls, only visible while aiming) ----
  const ARC_N = 14;
  const arcMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
  const arcDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 4), arcMat, ARC_N);
  arcDots.frustumCulled = false; arcDots.visible = false; arcDots.renderOrder = 5;
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const arcRing = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 32).rotateX(-Math.PI / 2), ringMat);
  arcRing.visible = false; arcRing.renderOrder = 5;
  scene.add(arcDots, arcRing);
  const m4 = new THREE.Matrix4();
  const C_FREE = new THREE.Color(0xffffff), C_LOCK = new THREE.Color(0x6dffa8);
  // height of the throw's parabola at k = 0..1 along the flight (the potion module uses the same formula)
  function arcY(y0, y1, apex, k) { return y0 + (y1 - y0) * k + apex * 4 * k * (1 - k); }
  function paintArc(locked, radius) {
    const c = locked ? C_LOCK : C_FREE;
    arcMat.color.copy(c); ringMat.color.copy(c);
    const apex = potion.apex;
    for (let i = 0; i < ARC_N; i++) {
      const k = (i + 1 + ((time.real * 1.6) % 1)) / (ARC_N + 1);
      m4.makeTranslation(from.x + (to.x - from.x) * k, arcY(from.y, to.y, apex, k), from.z + (to.z - from.z) * k);
      arcDots.setMatrixAt(i, m4);
    }
    arcDots.instanceMatrix.needsUpdate = true;
    arcRing.position.set(to.x, to.y + 0.06, to.z);
    arcRing.scale.setScalar(radius * (1 + 0.06 * Math.sin(time.real * 7)));
    arcDots.visible = arcRing.visible = true;
  }
  function hideArc() { arcDots.visible = arcRing.visible = false; }

  // ---- potion ----
  const pOpt = { cooldown: 0.8, rMin: 2, rMax: 11, tMin: 0.55, tMax: 0.95, assist: 1.6, splash: 1.1, targets: null };
  let pMouse0 = 0, pTarget = null, pPendingT = -1, pPendingTarget = null, pFlight = 0;
  const pFrom = { x: 0, y: 0, z: 0 }, pTo = { x: 0, y: 0, z: 0 };
  const potion = {
    on: false, count: 0, max: 5, aiming: false, cooldownLeft: 0, apex: 1.5,
    onThrow: null, // (from {x,y,z}, to {x,y,z}, flightSeconds, apex, target | null) at the release moment: launch the flask here
    onEmpty: null, // () the button was pressed with no potions left
    // o: { count: 3, max: 5, cooldown: 0.8, range: [2, 11], flight: [0.55, 0.95] (seconds at min / max range), assist: 1.6 (metres
    //      the landing point snaps to a target), splash: 1.1 (radius of the landing ring), targets: array | null (default: abilities.targets) }
    enable(o) {
      o = o || {};
      potion.on = true;
      potion.max = o.max || 5; potion.count = o.count === undefined ? 3 : o.count;
      pOpt.cooldown = o.cooldown === undefined ? 0.8 : o.cooldown;
      pOpt.rMin = o.range ? o.range[0] : 2; pOpt.rMax = o.range ? o.range[1] : 11;
      pOpt.tMin = o.flight ? o.flight[0] : 0.55; pOpt.tMax = o.flight ? o.flight[1] : 0.95;
      pOpt.assist = o.assist === undefined ? 1.6 : o.assist; pOpt.splash = o.splash || 1.1;
      pOpt.targets = o.targets || null;
      potion.aiming = false; potion.cooldownLeft = 0; pPendingT = -1;
      refreshAbil(); ui.setAmmo("potion", potion.count, potion.max);
    },
    disable() { potion.on = false; potion.aiming = false; pPendingT = -1; hideArc(); ui.setAmmo("potion", null); ui.setArmed("potion", false); refreshAbil(); },
    add(n) { potion.count = clamp(potion.count + (n === undefined ? 1 : n), 0, potion.max); if (potion.on) ui.setAmmo("potion", potion.count, potion.max); return potion.count; },
    // where the flask would land right now. out: { x, y, z }; returns the snapped target or null.
    aimPoint(out) { return solvePotion(out); },
  };
  function solvePotion(out) {
    const list = pOpt.targets || abilities.targets;
    let tx, tz, snap = null;
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    const mouse = !ui.touch && io.mouseT > pMouse0 && mouseGround(aimP, player.y).ok;
    if (mouse) {
      tx = aimP.x; tz = aimP.z;
      snap = nearTarget(list, tx, tz, pOpt.assist);
    } else {
      // keys / touch: the best target in front of the camera (touch) or the heading (keys); a finger drag nudges the point
      const ax = ui.touch ? Math.sin(cam.yaw) : fx, az = ui.touch ? Math.cos(cam.yaw) : fz;
      snap = coneTarget(list, ax, az, 1.25, pOpt.rMax);
      if (snap) { tx = snap.x; tz = snap.z; } else { tx = player.x + fx * 5.5; tz = player.z + fz * 5.5; }
      if (io.dragOn && (io.dragX || io.dragY)) {
        const cx = Math.cos(cam.yaw), sx = Math.sin(cam.yaw), k = 0.05;
        tx += (-io.dragX * cx - io.dragY * sx) * k; tz += (io.dragX * sx - io.dragY * cx) * k;
        snap = nearTarget(list, tx, tz, pOpt.assist);
      }
    }
    if (snap) { tx = snap.x; tz = snap.z; }
    let dx = tx - player.x, dz = tz - player.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) { dx = fx; dz = fz; d = 1; }
    const dd = clamp(d, pOpt.rMin, pOpt.rMax);
    if (dd !== d) { snap = snap && d <= pOpt.rMax + 0.5 && d >= 0.3 ? snap : null; if (!snap) { tx = player.x + (dx / d) * dd; tz = player.z + (dz / d) * dd; } }
    out.x = tx; out.z = tz; out.y = snap && snap.y !== undefined ? snap.y : e.floorAt(tx, tz);
    const k = (clamp(Math.hypot(tx - player.x, tz - player.z), pOpt.rMin, pOpt.rMax) - pOpt.rMin) / Math.max(0.01, pOpt.rMax - pOpt.rMin);
    pFlight = pOpt.tMin + (pOpt.tMax - pOpt.tMin) * k;
    potion.apex = 0.9 + 1.5 * k;
    return snap;
  }
  function handPos(out) {
    const a = platypus.holdAnchor || platypus.billTip;
    a.getWorldPosition(wv);
    out.x = wv.x; out.y = wv.y + 0.1; out.z = wv.z;
  }
  function potionPress() {
    if (!potion.on || potion.aiming || pPendingT >= 0) return potion.on;
    if (potion.count <= 0) { if (potion.onEmpty) potion.onEmpty(); else ui.hint("No potions left!", 1.4); return true; }
    if (potion.cooldownLeft > 0 || !player.enabled || player.lock > 0 || vehicle.active) return true;
    potion.aiming = true;
    pMouse0 = time.real; // the mouse only takes over the aim once it has moved after the press
    if (io.mouseDown) pMouse0 = -1;
    io.dragX = io.dragY = 0;
    ui.setArmed("potion", true);
    return true;
  }
  function potionRelease() {
    if (!potion.aiming) return;
    potion.aiming = false;
    hideArc();
    ui.setArmed("potion", false);
    if (!player.enabled || health.dead) return;
    pPendingTarget = solvePotion(pTo);
    potion.count--; potion.cooldownLeft = pOpt.cooldown;
    ui.setAmmo("potion", potion.count, potion.max);
    const yaw = Math.atan2(pTo.x - player.x, pTo.z - player.z);
    if (!player.moving) { player.face = yaw; player.lock = Math.max(player.lock, 0.3); }
    const anim = platypus.potionThrow || platypus.throwAnim;
    if (anim) anim.call(platypus);
    pPendingT = platypus.potionReleaseTime || platypus.throwReleaseTime || 0.2;
  }

  // ---- scream ----
  const sOpt = { chargeTime: 1.2, minCharge: 0.25, cooldown: 6, label: "SCREAM" };
  const scream = {
    on: false, charging: false, charge: 0, cooldownLeft: 0,
    onStart: null, // () charging began (inhale animation / sound)
    onCharge: null, // (frac 0..1) every frame while charging
    onRelease: null, // (power 0..1) THE SCREAM: play platypus.scream, audio.scream, fx.screamWave, combat.blast here
    onFizzle: null, // () let go too early (below minCharge): a squeak
    onCancel: null, // () a breath was dropped without a scream (a cutscene, the player locked, disable()): undo the inhale pose / sound
    fired: 0, fizzled: 0, // counters (debug seam)
    // o: { chargeTime: 1.2 (seconds to full), minCharge: 0.25, cooldown: 6 (seconds at full power; scales 50..100 % with power), label: "SCREAM" }
    enable(o) {
      o = o || {};
      // a breath held across a re-enable (a lesson moving on while the key is down) is kept: dropping it here
      // left the bar and the armed button frozen, and the release then did nothing
      const keep = scream.on && scream.charging;
      scream.on = true; scream.cooldownLeft = 0;
      if (!keep) { scream.charging = false; scream.charge = 0; ui.setCharge(null); ui.setArmed("scream", false); }
      sOpt.chargeTime = o.chargeTime || 1.2; sOpt.minCharge = o.minCharge === undefined ? 0.25 : o.minCharge;
      sOpt.cooldown = o.cooldown === undefined ? 6 : o.cooldown; sOpt.label = o.label || "SCREAM";
      refreshAbil(); ui.setCooldown("scream", 0);
    },
    disable() { screamDrop(); scream.on = false; refreshAbil(); },
    // fire it now at this power without input (the uncontrolled scream of level 8). Works even while disabled.
    force(power) { scream.charging = false; ui.setCharge(null); if (scream.onRelease) scream.onRelease(power === undefined ? 1 : power); },
  };
  // drop a breath in progress without a scream, and tell the level (else its inhale pose and drone stay on)
  function screamDrop() {
    if (!scream.charging) return;
    scream.charging = false; scream.charge = 0;
    ui.setCharge(null); ui.setArmed("scream", false);
    if (scream.onCancel) scream.onCancel();
  }
  function screamPress() {
    if (!scream.on) return false;
    if (scream.charging || !player.enabled || vehicle.active) return true;
    if (scream.cooldownLeft > 0) { ui.hint("Catch your breath...", 1.0); return true; }
    scream.charging = true; scream.charge = 0;
    ui.setArmed("scream", true);
    if (scream.onStart) scream.onStart();
    return true;
  }
  function screamRelease() {
    if (!scream.charging) return;
    scream.charging = false;
    ui.setCharge(null); ui.setArmed("scream", false);
    if (scream.charge >= sOpt.minCharge && player.enabled && !health.dead) {
      scream.cooldownLeft = sOpt.cooldown * (0.5 + 0.5 * scream.charge);
      scream.fired++;
      if (scream.onRelease) scream.onRelease(scream.charge);
    } else { scream.fizzled++; if (scream.onFizzle) scream.onFizzle(); }
    scream.charge = 0;
  }

  // ---- shoot ----
  const fOpt = { rate: 4, range: 22, assist: null, auto: true, muzzle: null, targets: null };
  let fireT = 0, fireMouse = false;
  const shoot = {
    on: false, ammo: Infinity, firing: false,
    onFire: null, // (origin {x,y,z}, dirX, dirZ, target | null, dist) one shot: tracer, sound, damage are the level's / combat's job
    onEmpty: null, // () trigger pulled with no ammo (at most twice a second)
    // o: { ammo: Infinity, rate: 4 (shots per second while held), range: 22, auto: true (false = one shot per press),
    //      assist: null (cone half-angle in radians; null = 0.16 with the mouse, 0.55 with keys / touch),
    //      muzzle: Object3D | null (where shots start; default: in front of the bill), targets: array | null (default: abilities.targets) }
    enable(o) {
      o = o || {};
      shoot.on = true; shoot.firing = false; fireT = 0;
      shoot.ammo = o.ammo === undefined ? Infinity : o.ammo;
      fOpt.rate = o.rate || 4; fOpt.range = o.range || 22; fOpt.assist = o.assist === undefined ? null : o.assist;
      fOpt.auto = o.auto !== false; fOpt.muzzle = o.muzzle || null; fOpt.targets = o.targets || null;
      refreshAbil(); ui.setAmmo("ammo", shoot.ammo);
    },
    disable() { shoot.on = false; shoot.firing = false; ui.setAmmo("ammo", null); ui.setArmed("fire", false); if (platypus.setAim) platypus.setAim(null); refreshAbil(); },
    add(n) { shoot.ammo += n; if (shoot.on) ui.setAmmo("ammo", shoot.ammo); return shoot.ammo; },
  };
  function firePress(mouse) {
    if (!shoot.on) return false;
    if (!player.enabled || vehicle.active || potion.aiming) return true;
    shoot.firing = true; fireMouse = !!mouse;
    ui.setArmed("fire", true);
    if (fireT <= 0) fireOnce();
    return true;
  }
  function fireRelease() {
    if (!shoot.firing) return;
    shoot.firing = false;
    ui.setArmed("fire", false);
  }
  function fireOnce() {
    if (shoot.ammo <= 0) { fireT = 0.5; if (shoot.onEmpty) shoot.onEmpty(); return; }
    fireT = 1 / fOpt.rate;
    const list = fOpt.targets || abilities.targets;
    let dx = Math.sin(player.yaw), dz = Math.cos(player.yaw), cone = 0.55;
    const mouse = !ui.touch && (fireMouse || time.real - io.mouseT < 4) && mouseGround(aimP, player.y + 0.2).ok;
    if (mouse) {
      const mx = aimP.x - player.x, mz = aimP.z - player.z, md = Math.hypot(mx, mz);
      if (md > 0.3) { dx = mx / md; dz = mz / md; cone = 0.16; }
    } else if (ui.touch && !player.moving) { dx = Math.sin(cam.yaw); dz = Math.cos(cam.yaw); }
    if (fOpt.assist !== null) cone = fOpt.assist;
    let t = coneTarget(list, dx, dz, cone, fOpt.range);
    // keys / touch: nothing in the cone -> whoever is closest within 60 % of the range, in any direction
    if (!t && !mouse) t = nearTarget(list, player.x, player.z, fOpt.range * 0.6);
    let dist = fOpt.range;
    if (t) { const tx = t.x - player.x, tz = t.z - player.z; dist = Math.hypot(tx, tz) || 1; dx = tx / dist; dz = tz / dist; }
    const yaw = Math.atan2(dx, dz);
    if (!player.moving) player.yaw = yaw;
    if (platypus.setAim) platypus.setAim(wrap(yaw - player.yaw));
    if (fOpt.muzzle) { fOpt.muzzle.getWorldPosition(wv); org.x = wv.x; org.y = wv.y; org.z = wv.z; }
    else { org.x = player.x + dx * 0.45; org.y = player.y + 0.26; org.z = player.z + dz * 0.45; }
    if (shoot.ammo !== Infinity) { shoot.ammo--; ui.setAmmo("ammo", shoot.ammo); }
    if (shoot.onFire) shoot.onFire(org, dx, dz, t, dist);
    if (!fOpt.auto) { shoot.firing = false; ui.setArmed("fire", false); }
  }

  const abilities = {
    potion, scream, shoot,
    targets: null, // default target list for the potion and the gun: objects with x, y, z (optional r, alive, targetable)
    arcY, mouseGround, coneTarget, nearTarget,
    // tell the service which of the OLD round buttons the level also wants (it re-applies them with its own):
    // buttons({ sting, zap, slap, hold, jump }) - use this instead of ui.setAbilities in levels that use ctx.abilities
    buttons(a) { lastAbil = a || {}; refreshAbil(); },
    cancel() {
      if (potion.aiming) { potion.aiming = false; hideArc(); ui.setArmed("potion", false); }
      screamDrop();
      fireRelease();
    },
  };
  function refreshAbil() {
    ui.setAbilities(Object.assign({}, lastAbil, { potion: potion.on, scream: scream.on, fire: shoot.on, down: vehicle.active ? true : (lastAbil.down || false) }));
  }

  // input from the engine: true = the service used the press (the level does not get it)
  function press(name) {
    if (name === "potion") return potionPress();
    if (name === "scream") return screamPress();
    if (name === "fire") return firePress(false);
    if (name === "primary" && shoot.on && !potion.aiming) return firePress(true);
    if (name === "primary" && potion.aiming) { potionRelease(); return true; } // click = throw now
    return false;
  }
  function release(name) {
    if (name === "potion") potionRelease();
    else if (name === "scream") screamRelease();
    else if (name === "fire" || name === "primary") fireRelease();
  }

  // =====================================================================================================
  // per frame / reset
  // =====================================================================================================
  function update(dt, raw) {
    if (rsStage) stepRespawn(raw);
    if (vehicle.active) stepVehicle(dt);
    if (pingT > 0) { pingT -= raw; if (pingT <= 0) ui.setPing(null); }
    if (health.on && !health.dead) {
      sinceHurt += dt;
      if (hOpt.regen > 0 && sinceHurt > hOpt.regenDelay && health.hp < health.max) { health.hp = Math.min(health.max, health.hp + hOpt.regen * dt); paintHealth(); }
    }
    if (potion.on) {
      if (potion.cooldownLeft > 0) { potion.cooldownLeft = Math.max(0, potion.cooldownLeft - dt); ui.setCooldown("potion", pOpt.cooldown > 0 ? potion.cooldownLeft / pOpt.cooldown : 0); }
      if (potion.aiming) {
        if (!player.enabled || cinema.playing) { potion.aiming = false; hideArc(); ui.setArmed("potion", false); }
        else { pTarget = solvePotion(to); handPos(from); paintArc(!!pTarget, pOpt.splash); }
      }
      if (pPendingT >= 0) {
        pPendingT -= dt;
        if (pPendingT < 0) { handPos(pFrom); if (potion.onThrow) potion.onThrow(pFrom, pTo, pFlight, potion.apex, pPendingTarget); pPendingTarget = null; }
      }
    }
    if (scream.on) {
      if (scream.cooldownLeft > 0) { scream.cooldownLeft = Math.max(0, scream.cooldownLeft - dt); ui.setCooldown("scream", scream.cooldownLeft / Math.max(0.01, sOpt.cooldown)); }
      if (scream.charging) {
        if (!player.enabled || cinema.playing) screamDrop();
        else {
          scream.charge = Math.min(1, scream.charge + dt / sOpt.chargeTime);
          ui.setCharge(scream.charge, sOpt.label, sOpt.minCharge);
          if (scream.onCharge) scream.onCharge(scream.charge);
        }
      }
    }
    if (shoot.on) {
      if (fireT > 0) fireT -= dt;
      if (shoot.firing) {
        if (!player.enabled || cinema.playing) fireRelease();
        else if (fireT <= 0) fireOnce();
      }
    }
  }
  // everything off: the engine calls this when a level is entered and when it is left
  function reset() {
    abilities.cancel();
    potion.on = scream.on = shoot.on = false;
    potion.onThrow = potion.onEmpty = null; scream.onStart = scream.onCharge = scream.onRelease = scream.onFizzle = scream.onCancel = null; scream.charging = false; scream.charge = 0; shoot.onFire = shoot.onEmpty = null;
    potion.cooldownLeft = scream.cooldownLeft = 0; pPendingT = -1; fireT = 0;
    abilities.targets = null; lastAbil = {};
    hideArc();
    if (vehicle.active) { vehicle.active = null; vSeat = null; }
    health.on = false; health.dead = false; health.shield = false; health.onHurt = health.onDeath = null;
    checkpoint.clear(); checkpoint.onRespawn = null;
    gear.clear(); gear.onChange = null;
    army.list.length = 0; army.count = 0; army.lost = 0; army.onChange = null; army.label = null;
    if (platypus.setAim) platypus.setAim(null);
    pingT = 0;
  }
  function state() {
    return {
      health: health.on ? { hp: health.hp, max: health.max, dead: health.dead } : null,
      checkpoint: { id: checkpoint.id, deaths: checkpoint.deaths, tries: checkpoint.tries, respawning: checkpoint.respawning },
      vehicle: vehicle.active ? { x: vehicle.active.x, y: vehicle.active.y, z: vehicle.active.z, yaw: vehicle.active.yaw } : null,
      abilities: { potion: potion.on ? { count: potion.count, aiming: potion.aiming, cd: potion.cooldownLeft } : null,
        scream: scream.on ? { charging: scream.charging, charge: scream.charge, cd: scream.cooldownLeft, min: sOpt.minCharge, fired: scream.fired, fizzled: scream.fizzled } : null,
        shoot: shoot.on ? { ammo: shoot.ammo === Infinity ? -1 : shoot.ammo, firing: shoot.firing } : null },
      gear: { body: gear.worn.body, head: gear.worn.head, eyes: gear.worn.eyes, back: gear.worn.back, weapon: gear.worn.weapon, armor: gear.armor },
      army: { count: army.count, lost: army.lost },
    };
  }

  return { health, checkpoint, vehicle, abilities, gear, army, update, reset, press, release, cameraFocus, state };
}
