// game.js - LEVEL 1: tutorial script and combat rules. No DOM, no input: src/levels/level1.js feeds it.

const TAU = Math.PI * 2;
function wrap(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

const STEPS = ["greet", "move", "jump", "sting", "zap", "fight", "victory"];

export function createGame(c) {
  const { THREE, cushions, platypus, wizard, fx, audio, ui, player, dummies: dummyActors, human: humanActor, colliders, onComplete } = c;
  const S = cushions.SPACING;
  const WATER_Y = cushions.seamY + 0.15;
  const WATER_W = 1.7;
  const MAX_HEARTS = 5;
  const HUMAN_HP = 100;
  const vA = new THREE.Vector3(), vB = new THREE.Vector3();

  let step = "boot";
  let prog = 0;
  let clock = 0;
  let gen = 0;
  let lastX = 0, lastZ = 0;
  let stingCd = 0, zapCd = 0;
  let pendingSting = -1, pendingZap = -1, zapTarget = null;
  let ringT = 0;
  let hearts = MAX_HEARTS;
  let jumpsDone = 0;
  let hintCd = 0;
  let leashCd = 0;
  const LEASH = 13;

  // ---- actors ----
  const D = dummyActors.map((actor) => ({ kind: "dummy", actor, x: 0, z: 0, y: 0, hp: 0, on: false, alive: false, wet: false, pop: 1 }));
  const H = { kind: "human", actor: humanActor, x: 0, z: 0, y: 0, yaw: 0, hp: HUMAN_HP, on: false, alive: false, state: "idle", t: 0, slow: 0,
    speed: 0, stepT: 0, swung: false, sx: 0, sz: 0, pop: 1 };
  const W = { x: 0, z: 3.4, on: false };
  for (const d of D) d.actor.group.visible = false;
  H.actor.group.visible = false;
  wizard.group.visible = false;

  // arena (water) layout
  const arena = { ready: false, cx: 0, cz: 0, len: 0, sign: 1, ci: 0, cj: 0, water: null, rise: 1 };

  // collider slots: 0 wizard, 1..4 dummies, 5 human
  const colW = { x: 0, z: 0, r: 0.5, on: false };
  const colD = D.map(() => ({ x: 0, z: 0, r: 0.42, on: false }));
  const colH = { x: 0, z: 0, r: 0.4, on: false };
  colliders.push(colW, ...colD, colH);

  // ---- scheduler ----
  const timers = [];
  function after(t, fn) { timers.push({ t, fn, gen }); }

  // ---- dialogue ----
  const queue = [];
  let talkThen = null;
  function blip() { audio.wizardBlip(0.82 + Math.random() * 0.42); }
  function typed() { wizard.setTalking(false); }
  function nextLine() {
    if (!queue.length) {
      wizard.setTalking(false);
      const f = talkThen;
      talkThen = null;
      if (f) f();
      return;
    }
    const l = queue.shift();
    const text = typeof l === "string" ? l : l.t;
    if (l.g) wizard.gesture(l.g);
    wizard.setTalking(true);
    ui.say(text, { onBlip: blip, onTyped: typed, onDone: nextLine });
  }
  function talk(lines, then) {
    queue.length = 0;
    for (const l of lines) queue.push(l);
    talkThen = then || null;
    nextLine();
  }
  function shush() {
    queue.length = 0;
    talkThen = null;
    ui.clearSpeech();
    wizard.setTalking(false);
  }

  // ---- helpers ----
  function groundY(x, z) { return cushions.heightAt(x, z); }

  function placeWizard(x, z, force) {
    const dx = x - W.x, dz = z - W.z;
    if (W.on && !force && dx * dx + dz * dz < 2.25) return;
    W.x = x; W.z = z; W.on = true;
    const g = wizard.group;
    g.position.set(x, groundY(x, z), z);
    g.visible = true;
    wizard.lookAt(player.x, player.z);
    wizard.appear();
    audio.wizardAppear();
    vA.set(x, g.position.y + 1.0, z);
    fx.hitBurst(vA, 0xb49cff);
    cushions.press(x, z, 1.4);
  }

  function spawnDummy(d, x, z, hp, wet) {
    d.x = x; d.z = z; d.hp = hp; d.on = true; d.alive = true; d.wet = wet; d.pop = 0;
    d.y = groundY(x, z);
    d.actor.reset();
    const g = d.actor.group;
    g.position.set(x, d.y, z);
    g.rotation.y = Math.atan2(player.x - x, player.z - z);
    g.scale.setScalar(0.001);
    g.visible = true;
    vA.set(x, d.y + 0.7, z);
    fx.hitBurst(vA, 0xffe2a8);
    cushions.press(x, z, 1.2);
  }
  function hideDummy(d, puff) {
    if (d.on && puff) { vA.set(d.x, d.y + 0.4, d.z); fx.hitBurst(vA, 0xffffff); }
    d.on = false; d.alive = false;
    d.actor.group.visible = false;
  }

  function inWaterRect(x, z, mx, mz) {
    if (!arena.ready || arena.rise < 0.9) return false;
    return Math.abs(x - arena.cx) <= arena.len * 0.5 + mx && Math.abs(z - arena.cz) <= mz;
  }
  // true when a small animal at this point is actually wading
  function wading(x, z) {
    return inWaterRect(x, z, 0.1, WATER_W * 0.5) && cushions.heightAt(x, z) < WATER_Y + 0.1;
  }
  function waterLevelAt(x, z) {
    return inWaterRect(x, z, 0, WATER_W * 0.5) ? WATER_Y : -Infinity;
  }

  function setupArena() {
    if (arena.water) { arena.water.dispose(); arena.water = null; }
    const ci = Math.round(player.x / S), cj = Math.round(player.z / S);
    const sign = Math.cos(player.yaw) >= 0 ? 1 : -1;
    arena.ci = ci; arena.cj = cj; arena.sign = sign;
    arena.cx = (ci + 0.5) * S;
    arena.cz = (cj + sign * 1.5) * S;
    arena.len = 4 * S + 0.9;
    arena.water = fx.createWater(arena.cx, arena.cz, arena.len, WATER_W, 0, { surfaceY: cushions.floorY + 0.02 });
    arena.rise = 0;
    arena.ready = true;
  }

  function hurtPlayer(fromX, fromZ) {
    if (player.invuln > 0 || step !== "fight") return;
    hearts--;
    player.invuln = 1.4;
    let dx = player.x - fromX, dz = player.z - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    player.kx = (dx / l) * 5; player.kz = (dz / l) * 5;
    platypus.hurt();
    audio.playerHurt();
    vA.set(player.x, player.y + 0.25, player.z);
    fx.hitBurst(vA, 0xff5a78);
    ui.setHearts(hearts, MAX_HEARTS);
    if (hearts <= 0) {
      const g = gen;
      player.enabled = false;
      ui.whiteFlash(0.25, () => { if (g === gen && step === "fight" && H.alive) beginFight(true); });
    }
  }

  // ---- steps ----
  function objective(text, keysDesk, keysTouch) { ui.setObjective(text, ui.touch ? keysTouch : keysDesk); }

  function complete(next) {
    step = "between";
    audio.objective();
    ui.objectiveDone();
    after(1.15, () => startStep(next));
  }

  function startStep(name) {
    step = name;
    prog = 0;
    lastX = player.x; lastZ = player.z;
    ringT = 0;
    const fxw = Math.sin(player.yaw), fzw = Math.cos(player.yaw);
    switch (name) {
      case "greet": {
        ui.setObjective(null);
        ui.setHumanHp(null);
        hearts = MAX_HEARTS;
        ui.setHearts(hearts, MAX_HEARTS);
        placeWizard(player.x + fxw * 3.3, player.z + fzw * 3.3, true);
        wizard.gesture("wave");
        talk([
          "Ah, there you are, little platypus! I am Wizard Wobble.",
          "Welcome to the Cushion Fields. Soft as clouds, and they go on forever.",
          "I shall teach you to defend yourself. First, let us stretch those webbed feet!",
        ], () => { if (step === "greet") startStep("move"); });
        break;
      }
      case "move":
        ensureWizardNear();
        objective("Waddle around the cushions", "WASD or arrow keys", "left stick");
        talk([{ t: "Go on, have a waddle! Feel how the cushions squish under your feet.", g: "point" }]);
        break;
      case "jump":
        ensureWizardNear();
        jumpsDone = 0;
        objective("Jump 2 times", "Space", "jump button");
        talk([{ t: "Splendid waddling! Now JUMP. The cushions are wonderfully bouncy.", g: "cheer" }]);
        break;
      case "sting": {
        ensureWizardNear();
        let ci = Math.round((player.x + fxw * 3.6) / S), cj = Math.round((player.z + fzw * 3.6) / S);
        const wi = Math.round(W.x / S), wj = Math.round(W.z / S);
        if ((ci === wi && cj === wj) || Math.hypot(ci * S - player.x, cj * S - player.z) < 1.6) ci += 1;
        if (ci === wi && cj === wj) cj += 1;
        for (const d of D) hideDummy(d, false);
        spawnDummy(D[0], ci * S, cj * S, 3, false);
        objective("Ankle Sting the dummy  0 / 3", "J or left click", "green button");
        talk([
          "Now, a secret! Platypuses carry venom spurs on their back ankles.",
          { t: "Waddle up to that training dummy and give it an ANKLE STING. Three good ones!", g: "point" },
        ]);
        break;
      }
      case "zap": {
        for (const d of D) hideDummy(d, true);
        setupArena();
        const a = arena;
        placeWizard(a.ci * S, a.cz + a.sign * 0.5 * S + a.sign * 0.25, false);
        spawnDummy(D[1], (a.ci - 0.5) * S, a.cz, 1, true);
        spawnDummy(D[2], (a.ci + 0.5) * S, a.cz, 1, true);
        spawnDummy(D[3], (a.ci + 1.5) * S, a.cz, 1, true);
        objective("Zap the dummies through the water  0 / 3", "K or right click", "blue button");
        talk([
          { t: "Marvellous! Now for real magic. Behold: WATER!", g: "cast" },
          "Your bill can feel electricity, and send it too. But only through water.",
          { t: "Stand in the stream and fire an ELECTRO PULSE. Each pulse zaps one dummy.", g: "point" },
        ]);
        break;
      }
      case "fight":
        beginFight(false);
        break;
      case "victory": {
        ui.setObjective(null);
        ui.setHumanHp(0);
        player.invuln = 99;
        // the winning hit may land in the moment after the last heart was lost
        player.enabled = true;
        if (hearts < 1) { hearts = 1; ui.setHearts(hearts, MAX_HEARTS); }
        wizard.gesture("cheer");
        platypus.celebrate();
        after(0.7, () => audio.victory());
        after(0.9, () => talk([{ t: "You did it! The Collector is napping on the cushions. Magnificent!", g: "cheer" }]));
        after(2.6, () => { ui.setHumanHp(null); ui.showVictory(() => { if (onComplete) onComplete(); else restart(); }); });
        break;
      }
    }
  }

  function ensureWizardNear() {
    const d = Math.hypot(W.x - player.x, W.z - player.z);
    if (!W.on || d > 9) {
      const a = player.yaw + 0.6;
      placeWizard(player.x + Math.sin(a) * 3.2, player.z + Math.cos(a) * 3.2, true);
    }
  }

  function beginFight(retry) {
    step = "fight";
    // nothing left over from the tutorial or the previous attempt may land on the fresh Collector
    pendingSting = pendingZap = -1;
    zapTarget = null;
    stingCd = zapCd = 0;
    if (retry) { gen++; timers.length = 0; fx.clear(false); }
    if (!arena.ready) { setupArena(); arena.rise = 1; arena.water.setLevel(WATER_Y); }
    for (const d of D) hideDummy(d, !retry);
    const a = arena;
    placeWizard((a.ci - 2) * S, a.cz + a.sign * 0.5 * S + a.sign * 0.4, false);
    hearts = MAX_HEARTS;
    ui.setHearts(hearts, MAX_HEARTS);
    player.invuln = 1.5;
    player.enabled = true;
    if (retry) {
      player.teleport(a.cx - S, a.cz - a.sign * 1.6, a.sign > 0 ? 0 : Math.PI);
    }
    H.hp = HUMAN_HP;
    H.x = (a.ci + 1) * S; H.z = a.cz + a.sign * 8.2;
    H.y = groundY(H.x, H.z);
    H.yaw = Math.atan2(player.x - H.x, player.z - H.z);
    H.on = true; H.alive = true; H.state = "enter"; H.t = 1.9; H.slow = 0; H.speed = 0; H.pop = 0;
    H.actor.reset();
    H.actor.group.visible = true;
    H.actor.group.scale.setScalar(0.001);
    H.actor.group.position.set(H.x, H.y, H.z);
    H.actor.group.rotation.y = H.yaw;
    H.actor.taunt();
    vA.set(H.x, H.y + 1, H.z);
    fx.hitBurst(vA, 0xffc9a0);
    ui.setHumanHp(1);
    objective("Beat the Collector!", "sting his ankles, zap him near the water", "sting and zap");
    if (retry) {
      talk(["Oof! Shake it off, little one. Keep moving and dodge that net!"]);
    } else {
      // he waits (taunting) until the wizard has explained how to dodge; capped so he can never get stuck,
      // and any hit on him wakes him up
      H.t = 16;
      talk([
        { t: "Uh oh. A Collector with a net! He wants to take you away.", g: "point" },
        "When he lifts the net, scoot away or jump!",
        "Sting his ankles to slow him down. When he steps near the water, ZAP him! You can do this!",
      ], () => { if (step === "fight" && H.state === "enter" && H.t > 0.6) H.t = 0.6; });
    }
  }

  function cleanup() {
    gen++;
    timers.length = 0;
    shush();
    fx.clear(false);
    pendingSting = pendingZap = -1;
    zapTarget = null;
    for (const d of D) hideDummy(d, false);
    H.on = false; H.alive = false;
    H.actor.group.visible = false;
    ui.setHumanHp(null);
    ui.hideVictory();
    player.enabled = true;
    player.invuln = 0;
    player.lock = 0;
  }

  function restart() {
    cleanup();
    if (arena.water) { arena.water.dispose(); arena.water = null; }
    arena.ready = false;
    W.on = false;
    wizard.group.visible = false;
    ui.whiteFlash(0.2, () => {
      player.teleport(0, 0, 0);
      startStep("greet");
    });
  }

  // back to the untouched state (used when the level is entered or left)
  function reset() {
    cleanup();
    if (arena.water) { arena.water.dispose(); arena.water = null; }
    arena.ready = false;
    W.on = false;
    wizard.group.visible = false;
    colW.on = false; colH.on = false;
    for (const col of colD) col.on = false;
    hearts = MAX_HEARTS;
    stingCd = zapCd = hintCd = leashCd = 0;
    step = "boot";
    player.enabled = false;
  }

  function skipTo(name) {
    if (STEPS.indexOf(name) < 0) return false;
    cleanup();
    if (name === "victory") { win(); return true; }
    if (name !== "fight" && name !== "zap") {
      if (arena.water) { arena.water.dispose(); arena.water = null; }
      arena.ready = false;
    }
    startStep(name);
    return true;
  }

  function win() {
    if (step === "victory") return;
    if (step !== "fight") { cleanup(); startStep("fight"); }
    H.hp = 0;
    checkHuman();
  }

  function checkHuman() {
    if (H.alive && H.hp <= 0) {
      H.hp = 0;
      H.alive = false;
      H.state = "dead";
      H.speed = 0;
      H.actor.defeat();
      after(0.85, () => { audio.cushionLand(1); cushions.press(H.x - Math.sin(H.yaw) * 0.8, H.z - Math.cos(H.yaw) * 0.8, 3); fx.cushionPuff(H.x - Math.sin(H.yaw) * 0.8, H.y + 0.1, H.z - Math.cos(H.yaw) * 0.8, 2.5); });
      startStep("victory");
    }
    ui.setHumanHp(H.hp / HUMAN_HP);
  }

  // ---- attacks ----
  function trySting() {
    if (!player.enabled || stingCd > 0 || player.lock > 0) return false;
    stingCd = 0.6;
    platypus.sting();
    audio.sting();
    pendingSting = platypus.stingHitTime;
    return true;
  }

  function nearestTarget(range, wetOnly) {
    let best = null, bd = 1e9;
    for (const d of D) {
      if (!d.on || !d.alive) continue;
      if (wetOnly && !d.wet) continue;
      const dist = Math.hypot(d.x - player.x, d.z - player.z);
      if (dist < bd && dist < range) { bd = dist; best = d; }
    }
    if (H.on && H.alive) {
      const dist = Math.hypot(H.x - player.x, H.z - player.z);
      const ok = !wetOnly || inWaterRect(H.x, H.z, 0.8, 1.7);
      if (ok && dist < bd && dist < range) { bd = dist; best = H; }
    }
    return best;
  }

  function resolveSting() {
    const t = nearestTarget(1.4, false);
    if (!t) return;
    let dx = t.x - player.x, dz = t.z - player.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    audio.stingHit();
    if (t.kind === "dummy") {
      vA.set(t.x - dx * 0.25, t.y + 0.45, t.z - dz * 0.25);
      fx.stingBurst(vA);
      t.actor.hit(dx, dz, 1.25);
      audio.dummyHit();
      if (step === "sting" && t === D[0]) {
        t.hp--;
        prog = 3 - t.hp;
        objective("Ankle Sting the dummy  " + prog + " / 3", "J or left click", "green button");
        if (t.hp <= 0) {
          t.alive = false;
          t.actor.defeat();
          complete("zap");
        }
      }
    } else {
      vA.set(t.x - dx * 0.2, t.y + 0.22, t.z - dz * 0.2);
      fx.stingBurst(vA);
      audio.humanHit();
      t.hp -= 12;
      t.slow = 3;
      t.state = "stun"; t.t = 1.15; t.speed = 0;
      t.actor.stung();
      checkHuman();
    }
  }

  function tryZap() {
    if (!player.enabled || zapCd > 0 || player.lock > 0) return false;
    const wet = player.grounded && wading(player.x, player.z);
    const t = wet ? nearestTarget(40, true) : null;
    if (!t) {
      zapCd = 0.45;
      audio.uiClick();
      let dry = false;
      if (!arena.ready) ui.hint("Electro Pulse needs water. There is none here yet!");
      else if (arena.rise < 0.9) ui.hint("Wait for the water to fill up!");
      else if (wet) ui.hint(H.on && H.alive ? "Lure him closer to the water!" : "Nothing else is in the water.");
      else if (wading(player.x, player.z)) ui.hint("Land in the water first!");
      else { dry = true; ui.hint("Stand in the water first, then fire the pulse."); }
      if (hintCd <= 0 && !ui.speaking() && dry && step !== "between") {
        hintCd = 9;
        talk(["Electricity only travels through water. Dip your feet in the stream first!"]);
      }
      return false;
    }
    zapCd = 1.2;
    zapTarget = t;
    player.lock = 0.8;
    player.face = Math.atan2(t.x - player.x, t.z - player.z);
    platypus.zap();
    audio.zapCharge(platypus.zapFireTime);
    pendingZap = platypus.zapFireTime;
    return true;
  }

  function resolveZap() {
    const t = zapTarget;
    zapTarget = null;
    if (!t || !t.on || !t.alive) return;
    platypus.billTip.getWorldPosition(vA);
    vB.set(t.x, t.y + (t.kind === "dummy" ? 0.6 : 0.5), t.z);
    audio.zapFire();
    fx.rippleAt(player.x, player.z, 1.6);
    if (t.kind === "dummy") t.alive = false; // claimed: the next pulse picks another dummy
    const g = gen;
    fx.electroPulse(vA, vB, () => {
      if (g !== gen) return;
      audio.zapHit();
      vA.set(t.x, t.y + 0.7, t.z);
      fx.hitBurst(vA, 0x7fd0ff);
      fx.rippleAt(t.x, t.z, 2.2);
      if (t.kind === "dummy") {
        t.actor.shock();
        after(0.7, () => {
          t.actor.defeat();
          audio.dummyHit();
          if (step === "zap") {
            prog++;
            objective("Zap the dummies through the water  " + prog + " / 3", "K or right click", "blue button");
            if (prog >= 3) complete("fight");
          }
        });
      } else if (t.alive) {
        audio.humanHit();
        t.hp -= 25;
        t.state = "stun"; t.t = 0.95; t.speed = 0;
        t.actor.shocked();
        checkHuman();
      }
    });
  }

  function onJump() { /* counted on landing */ }
  function onLand() {
    if (step === "jump") {
      jumpsDone++;
      ui.setObjective("Jump 2 times  " + Math.min(2, jumpsDone) + " / 2", ui.touch ? "jump button" : "Space");
      if (jumpsDone >= 2) complete("sting");
    }
  }

  const hs = { speed: 0, time: 0 };
  function hState(sp) { hs.speed = sp; hs.time = clock; return hs; }

  // ---- human brain ----
  function updateHuman(dt) {
    const g = H.actor.group;
    if (H.pop < 1) { H.pop = Math.min(1, H.pop + dt * 2.6); const k = 1 - Math.pow(1 - H.pop, 3); g.scale.setScalar(k); }
    const dx = player.x - H.x, dz = player.z - H.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    if (H.slow > 0) H.slow -= dt;
    let target = 0;
    switch (H.state) {
      case "enter":
        H.t -= dt;
        H.yaw += clamp(wrap(want - H.yaw), -3 * dt, 3 * dt);
        if (H.t <= 0) H.state = "chase";
        break;
      case "chase": {
        const diff = wrap(want - H.yaw);
        H.yaw += clamp(diff, -5 * dt, 5 * dt);
        if (dist > 1.22) target = (H.slow > 0 ? 0.95 : 2.05) * (Math.abs(diff) > 1 ? 0.4 : 1);
        if (dist < 1.42 && Math.abs(diff) < 0.4 && player.enabled) {
          H.state = "windup";
          H.t = H.actor.windup();
          H.swung = false;
          H.speed = 0;
        }
        break;
      }
      case "windup":
        H.t -= dt;
        if (H.t > 0.42) H.yaw += clamp(wrap(want - H.yaw), -2.2 * dt, 2.2 * dt);
        if (!H.swung && H.t <= 0.14) { H.swung = true; audio.humanSwing(); }
        if (H.t <= 0) {
          const reach = H.actor.netReach || 1.15;
          const sx = H.x + Math.sin(H.yaw) * reach, sz = H.z + Math.cos(H.yaw) * reach;
          const sy = groundY(sx, sz);
          cushions.press(sx, sz, 2.2);
          fx.cushionPuff(sx, sy + 0.05, sz, 1.6);
          audio.cushionLand(0.55);
          if (Math.hypot(player.x - sx, player.z - sz) < 0.62 && player.y - sy < 0.5) hurtPlayer(H.x, H.z);
          H.state = "recover";
          H.t = 1.05;
        }
        break;
      case "recover":
      case "stun":
        H.t -= dt;
        if (H.t <= 0) H.state = "chase";
        break;
    }
    H.speed += clamp(target - H.speed, -9 * dt, 5 * dt);
    if (H.speed > 0.01) {
      H.x += Math.sin(H.yaw) * H.speed * dt;
      H.z += Math.cos(H.yaw) * H.speed * dt;
      // do not walk through the wizard
      const wx = H.x - W.x, wz = H.z - W.z, wd = Math.hypot(wx, wz);
      if (W.on && wd < 0.85 && wd > 1e-4) { H.x = W.x + (wx / wd) * 0.85; H.z = W.z + (wz / wd) * 0.85; }
      H.stepT -= dt * H.speed;
      if (H.stepT <= 0) {
        H.stepT = 0.72;
        cushions.press(H.x, H.z, 0.9);
        if (wading(H.x, H.z)) fx.rippleAt(H.x, H.z, 1.2);
      }
    }
    const gy = groundY(H.x, H.z);
    H.y += (gy - H.y) * Math.min(1, dt * 12);
    g.position.set(H.x, H.y, H.z);
    g.rotation.y = H.yaw;
    H.actor.update(dt, hState(H.speed));
  }

  // ---- per-frame ----
  function update(dt, time) {
    clock = time;
    for (let i = 0; i < timers.length; i++) {
      const e = timers[i];
      e.t -= dt;
      if (e.t <= 0) {
        timers.splice(i, 1);
        i--;
        if (e.gen === gen) e.fn();
      }
    }
    if (stingCd > 0) stingCd -= dt;
    if (zapCd > 0) zapCd -= dt;
    if (hintCd > 0) hintCd -= dt;

    if (pendingSting >= 0) { pendingSting -= dt; if (pendingSting < 0) resolveSting(); }
    if (pendingZap >= 0) { pendingZap -= dt; if (pendingZap < 0) resolveZap(); }

    // water rising into the valley
    if (arena.ready && arena.rise < 1) {
      arena.rise = Math.min(1, arena.rise + dt / 1.7);
      const k = arena.rise * arena.rise * (3 - 2 * arena.rise);
      arena.water.setLevel(cushions.floorY + 0.02 + (WATER_Y - cushions.floorY - 0.02) * k);
    }

    // step progress
    if (step === "move") {
      const d = Math.hypot(player.x - lastX, player.z - lastZ);
      lastX = player.x; lastZ = player.z;
      if (d < 1) prog += d;
      if (prog >= 7) complete("jump");
    }

    // leash: the field is endless and looks the same everywhere, so never let the lesson get lost in the fog
    if (leashCd > 0) leashCd -= dt;
    let ax = 0, az = 0, leashed = false;
    if (step === "sting" && D[0].on) { ax = D[0].x; az = D[0].z; leashed = true; }
    else if ((step === "zap" || step === "fight") && arena.ready) { ax = arena.cx; az = arena.cz; leashed = true; }
    if (leashed) {
      const lx = player.x - ax, lz = player.z - az;
      const l2 = lx * lx + lz * lz;
      if (l2 > LEASH * LEASH) {
        const k = LEASH / Math.sqrt(l2);
        player.x = ax + lx * k; player.z = az + lz * k;
        if (leashCd <= 0) { leashCd = 4; ui.hint("Wizard Wobble calls you back!"); }
      }
    }

    // wizard
    if (W.on) {
      wizard.lookAt(player.x, player.z);
      wizard.group.position.y = groundY(W.x, W.z);
    }
    colW.on = W.on; colW.x = W.x; colW.z = W.z;

    // dummies
    for (let i = 0; i < D.length; i++) {
      const d = D[i], col = colD[i];
      col.on = d.on && (d.alive || d.actor.alive);
      col.x = d.x; col.z = d.z;
      if (!d.on) continue;
      if (d.pop < 1) { d.pop = Math.min(1, d.pop + dt * 3); const k = 1 - Math.pow(1 - d.pop, 3); d.actor.group.scale.setScalar(k * (1 + 0.25 * Math.sin(d.pop * Math.PI))); }
      d.actor.update(dt, time);
    }

    // human
    colH.on = H.on && H.alive;
    if (H.on) {
      if (H.alive) updateHuman(dt);
      else H.actor.update(dt, hState(0));
      colH.x = H.x; colH.z = H.z;
    }

    // target markers
    ringT -= dt;
    if (ringT <= 0) {
      ringT = 0.85;
      if (step === "sting" && D[0].alive) fx.ring(D[0].x, D[0].z, 0x44c878, D[0].y + 0.06);
      else if (step === "zap") {
        for (const d of D) if (d.on && d.alive && d.wet) fx.ring(d.x, d.z, 0x3aa0ff);
      }
    }

    // HUD
    ui.setCooldown("sting", Math.max(0, stingCd) / 0.6);
    ui.setCooldown("zap", Math.max(0, zapCd) / 1.2);
    const wet = arena.ready && wading(player.x, player.z);
    ui.setZapUsable(wet, wet && zapCd <= 0 && !!nearestTarget(40, true));
    player.inWater = wet;
  }

  function state() {
    return {
      step, prog, hearts, jumpsDone,
      humanHp: H.on ? H.hp : null,
      human: H.on ? { x: H.x, z: H.z, yaw: H.yaw, state: H.state, alive: H.alive, slow: H.slow } : null,
      dummies: D.map((d) => ({ x: d.x, z: d.z, on: d.on, alive: d.alive, wet: d.wet, hp: d.hp })),
      wizard: { x: W.x, z: W.z, on: W.on },
      water: arena.ready ? { x: arena.cx, z: arena.cz, length: arena.len, width: WATER_W, sign: arena.sign, level: arena.water.surfaceY, rise: arena.rise } : null,
      speaking: ui.speaking(),
      stingCd, zapCd,
    };
  }

  return {
    update, start() { startStep("greet"); }, trySting, tryZap, onJump, onLand, skipTo, win, restart, reset, state,
    waterLevelAt, wading, STEPS,
    get step() { return step; },
  };
}
