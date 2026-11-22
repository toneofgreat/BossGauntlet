// Engine test for the eleven-level framework and the services of LEVELS2.md Part A.
//   node tools/playtest-engine2.cjs            everything
//   node tools/playtest-engine2.cjs --nochain  skip the 5 -> 6 -> ... -> 11 unlock chain (services + menu only)
// Menu (11 circles, colours, 1280x720 / 390x844 / 844x390), old-save loading, the unlock chain through the
// placeholder levels 6-11, then inside level 6: health, checkpoint restart, vehicle possession, potion / scream /
// fire ability slots with real keys, gear, army, every new HUD piece, the day card. Shots: tools/shots/e2-*.png
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const NOCHAIN = process.argv.includes("--nochain");

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end("nf"); return; }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
        res.end(buf);
      });
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const f of fs.readdirSync(SHOTS)) if (f.startsWith("e2-")) fs.unlinkSync(path.join(SHOTS, f));
  const srv = await serve();
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
    defaultViewport: { width: 1280, height: 720 },
  });
  const errors = [];
  let n = 0, ok = false;
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + (e.stack || e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });
  page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url()));
  const st = () => page.evaluate(() => window.__platy && window.__platy.state());
  const shot = async (name) => { n++; const f = path.join(SHOTS, "e2-" + String(n).padStart(2, "0") + "-" + name + ".png"); await page.screenshot({ path: f }); return f; };
  const log = (m) => console.log(m);
  const must = (c, m) => { if (!c) throw new Error(m); };
  const waitFor = async (pred, ms, label) => {
    const t0 = Date.now();
    for (;;) {
      const s = await st();
      if (s && pred(s)) return s;
      if (Date.now() - t0 > ms) throw new Error("timeout waiting for " + label + " (step=" + (s && s.step) + ", mode=" + (s && s.mode) + ")");
      await sleep(100);
    }
  };
  const ready = () => page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
  const save = async (o) => { await page.evaluate((v) => localStorage.setItem("platypus.progress.v1", JSON.stringify(v)), o); await page.reload({ waitUntil: "load" }); await ready(); };

  try {
    await page.goto(url, { waitUntil: "load" });
    await ready();

    // ---- 1. the main screen ----
    await page.evaluate(() => window.__platy.resetProgress());
    await sleep(500); await shot("menu-fresh-1280");
    let m = await page.evaluate(() => Array.from(document.querySelectorAll(".lvl")).map((b) => { const r = b.getBoundingClientRect(); return { n: +b.dataset.n, cls: b.className, locked: b.classList.contains("locked"), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; }));
    must(m.length === 11, "11 circles expected, got " + m.length);
    must(!m[0].locked && m.slice(1).every((b) => b.locked), "fresh menu: only level 1 open");
    const want = ["", "blue", "blue", "blue", "white", "green", "green", "green", "red", "red", "gold"];
    for (let i = 1; i < 11; i++) must(m[i].cls.split(" ").includes(want[i]), "circle " + (i + 1) + " should be " + want[i] + ": " + m[i].cls);
    must(m.every((b) => b.w === b.h && b.w <= 96), "circles must be small and round: " + JSON.stringify(m.map((b) => b.w + "x" + b.h)));
    must(new Set(m.map((b) => b.y)).size === 1, "1280x720: one row expected: " + JSON.stringify(m.map((b) => b.y)));
    must(m[0].x > 20 && m[10].x + m[10].w < 1260, "row must fit the screen");
    log("menu 1280x720: one row of 11, " + m[0].w + "px circles, x " + m[0].x + ".." + (m[10].x + m[10].w));
    await page.evaluate(() => window.__platy.unlockAll());
    await sleep(500); await shot("menu-all-open-1280");
    for (const [w, h, name] of [[390, 844, "phone-portrait"], [844, 390, "phone-landscape"], [1024, 768, "tablet"]]) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      await sleep(400); await shot("menu-" + name);
      m = await page.evaluate(() => Array.from(document.querySelectorAll(".lvl")).map((b) => { const r = b.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), b: Math.round(r.bottom) }; }));
      const rows = {};
      for (const b of m) rows[b.y] = (rows[b.y] || 0) + 1;
      must(m.every((b) => b.x >= 4 && b.x + b.w <= w - 4 && b.y > 30 && b.b < h - 30), name + ": circles off screen " + JSON.stringify(m));
      log("menu " + w + "x" + h + ": rows " + Object.values(rows).join(" + ") + ", " + m[0].w + "px");
    }
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

    // ---- 2. saves from the 5-level version ----
    await save({ unlocked: 3, beaten: [true, true, false, false, false] });
    let s = await st();
    must(s.progress.unlocked === 3 && s.progress.beaten.length === 11 && s.progress.beaten[1] && !s.progress.beaten[2], "old save (3) loaded wrong: " + JSON.stringify(s.progress));
    await save({ unlocked: 5, beaten: [true, true, true, true, true] });
    s = await st();
    must(s.progress.unlocked === 6, "an old save with level 5 beaten must open level 6 locally: " + JSON.stringify(s.progress));
    await sleep(300); await shot("menu-old-save-all5");
    log("old saves load ok (5 beaten -> level 6 open off platyfy.com)");
    const live = await page.evaluate(async () => { const src = await (await fetch("./src/progress.js")).text(); return /const LIVE_RELEASED = 5;/.test(src) && /LEVEL_COUNT = 11;/.test(src); });
    must(live, "progress.js must keep LIVE_RELEASED = 5 and LEVEL_COUNT = 11");

    // ---- 3. the unlock chain 5 -> 6 -> ... -> 11 ----
    if (!NOCHAIN) {
      await save({ unlocked: 5, beaten: [true, true, true, true, false] });
      for (let k = 5; k <= 11; k++) {
        must(!(await page.evaluate((i) => document.querySelector('.lvl[data-n="' + i + '"]').classList.contains("locked"), k)), "level " + k + " is locked");
        await sleep(300);
        await page.click('.lvl[data-n="' + k + '"]');
        let s2 = await waitFor((x) => x.mode === "level" && x.levelN === k, 30000, "level " + k + " running");
        await sleep(2500);
        for (let i = 0; i < 8; i++) {
          s2 = await st();
          if (!s2.cinema.playing) break;
          await page.keyboard.down("Enter"); await sleep(1300); await page.keyboard.up("Enter"); await sleep(900);
        }
        await sleep(1500);
        s2 = await st();
        if (k === 7 || k === 11) await shot("L" + k + "-placeholder");
        if (s2.step === "play") await page.keyboard.press("KeyE"); else await page.evaluate(() => window.__platy.win());
        for (let i = 0; i < 200; i++) {
          s2 = await st();
          if (s2.mode === "menu") break;
          if (await page.evaluate(() => document.getElementById("victory").classList.contains("on"))) { await page.click("#again"); await sleep(400); }
          await sleep(200);
        }
        s2 = await waitFor((x) => x.mode === "menu", 5000, "main screen after level " + k);
        must(s2.progress.unlocked === Math.min(11, k + 1) && s2.progress.beaten[k - 1], "after level " + k + ": " + JSON.stringify(s2.progress));
        if (k === 5 || k === 10) { await sleep(1500); await shot("menu-unlocking-" + (k + 1)); await sleep(1500); } else await sleep(2800);
        log("level " + k + " -> main screen, unlocked " + s2.progress.unlocked);
      }
      await shot("menu-all-beaten");
      await page.reload({ waitUntil: "load" }); await ready();
      s = await st();
      must(s.progress.unlocked === 11 && s.progress.beaten.every(Boolean), "progress not saved: " + JSON.stringify(s.progress));
      log("chain 5 -> 11 ok, saved");
    } else await save({ unlocked: 11, beaten: [true, true, true, true, true, true, true, true, true, true, false] });

    // ---- 4. services, inside placeholder level 6 ----
    await page.evaluate(() => window.__platy.startLevel(6));
    await waitFor((x) => x.mode === "level" && x.levelN === 6, 30000, "level 6");
    await sleep(5200);
    await waitFor((x) => x.step === "play" && x.player.enabled && x.cinema.faded < 0.05, 15000, "level 6 playable");
    // health + checkpoint
    await page.evaluate(() => {
      const d = window.__platy, c = d.ctx;
      window.T = { restored: 0, hurt: 0, thrown: null, scream: [], shots: [], fizz: 0, vin: null };
      c.health.enable({ max: 100, label: "Health" });
      c.health.onHurt = () => { window.T.hurt++; };
      c.checkpoint.set("a", { x: 3, z: 2, yaw: 1, label: "The gate", restore() { window.T.restored++; } });
    });
    await sleep(500); await shot("checkpoint-toast");
    s = await st();
    must(s.svc.health.hp === 100 && s.svc.checkpoint.id === "a", "health / checkpoint did not start: " + JSON.stringify(s.svc));
    let r = await page.evaluate(() => { const c = window.__platy.ctx; const a = c.health.damage(30, { x: c.player.x + 2, z: c.player.z, kind: "bullet" }); const b = c.health.damage(30, {}); return [a, b, c.health.hp, c.player.invuln > 0]; });
    must(r[0] === true && r[1] === false && r[2] === 70 && r[3], "damage / mercy time wrong: " + JSON.stringify(r));
    await sleep(120); await shot("hurt");
    await sleep(1100);
    r = await page.evaluate(() => { const c = window.__platy.ctx; c.gear.wear("body", "leaf", { armor: 0.5 }); c.health.damage(20, {}); const hp = c.health.hp; c.gear.remove("body"); return hp; });
    must(r === 60, "gear armor should halve the hit: hp " + r);
    await page.keyboard.down("KeyW"); await sleep(900); await page.keyboard.up("KeyW");
    const t0 = Date.now();
    await page.evaluate(() => window.__platy.ctx.health.kill({ kind: "bullet" }));
    s = await st();
    must(s.svc.health.dead && s.svc.checkpoint.respawning && !s.player.enabled, "kill did not start the restart: " + JSON.stringify(s.svc));
    s = await waitFor((x) => !x.svc.checkpoint.respawning && x.player.enabled, 4000, "respawn");
    const took = (Date.now() - t0) / 1000;
    const T1 = await page.evaluate(() => window.T);
    must(Math.abs(s.player.x - 3) < 0.05 && Math.abs(s.player.z - 2) < 0.05 && s.svc.health.hp === 100 && T1.restored === 1 && s.svc.checkpoint.deaths === 1 && s.svc.checkpoint.tries === 1, "respawn wrong: " + JSON.stringify([s.player, s.svc, T1]));
    must(took < 1.6, "the restart must be fast, took " + took.toFixed(2) + " s");
    log("health, armor, kill -> checkpoint restart in " + took.toFixed(2) + " s ok");
    await sleep(700);

    // potion: real key, aim arc, snap to a target
    await page.evaluate(() => {
      const d = window.__platy, c = d.ctx, p = c.player;
      p.teleport(0, 0, 0); d.look(0, 0.5, 6);
      window.T.targets = [{ x: 0.8, y: 0, z: 5, r: 0.5 }, { x: -6, y: 0, z: -3, r: 0.5, alive: false }];
      c.abilities.targets = window.T.targets;
      c.abilities.buttons({ slap: true });
      c.abilities.potion.enable({ count: 2, max: 5 });
      c.abilities.potion.onThrow = (from, to, t, apex, target) => { window.T.thrown = { from: { ...from }, to: { ...to }, t, apex, hit: target === window.T.targets[0] }; };
      c.abilities.scream.enable({ chargeTime: 1.0, cooldown: 3 });
      c.abilities.scream.onRelease = (pw) => window.T.scream.push(pw);
      c.abilities.scream.onFizzle = () => window.T.fizz++;
      c.abilities.shoot.enable({ ammo: 5, rate: 5 });
      c.abilities.shoot.onFire = (o, dx, dz, t, dist) => window.T.shots.push({ dx, dz, hit: t === window.T.targets[0], dist });
      c.army.show("Army"); for (let i = 0; i < 7; i++) c.army.add({ x: i, y: 0, z: 0, alive: true });
    });
    await sleep(700);
    await page.keyboard.down("KeyQ"); await sleep(450);
    s = await st();
    must(s.svc.abilities.potion.aiming, "Q did not start aiming");
    await shot("potion-aim-keys");
    await page.mouse.move(900, 300); await sleep(300); await shot("potion-aim-mouse");
    await page.mouse.move(640, 380); await sleep(100);
    const aimNow = await page.evaluate(() => { const o = {}; const t = window.__platy.ctx.abilities.potion.aimPoint(o); return { o, snapped: !!t }; });
    await page.keyboard.up("KeyQ"); await sleep(700);
    let T = await page.evaluate(() => window.T);
    must(T.thrown && T.thrown.t > 0.4 && T.thrown.apex > 0.5, "potion onThrow did not fire: " + JSON.stringify(T.thrown));
    s = await st();
    must(s.svc.abilities.potion.count === 1, "potion count should be 1");
    log("potion: aimed (mouse point " + JSON.stringify(aimNow) + "), thrown to " + JSON.stringify(T.thrown.to) + " hit=" + T.thrown.hit);
    // a quick tap with the mouse parked: auto-target
    await sleep(900);
    await page.evaluate(() => { window.T.thrown = null; });
    await page.keyboard.down("KeyQ"); await sleep(80); await page.keyboard.up("KeyQ"); await sleep(600);
    T = await page.evaluate(() => window.T);
    must(T.thrown && T.thrown.hit && Math.abs(T.thrown.to.x - 0.8) < 0.01 && Math.abs(T.thrown.to.z - 5) < 0.01, "a tap must auto-target the living target: " + JSON.stringify(T.thrown));
    await page.keyboard.down("KeyQ"); await sleep(150); await page.keyboard.up("KeyQ"); await sleep(300);
    log("potion tap auto-target ok; empty press handled");
    // scream: fizzle, then a charged one
    await page.keyboard.down("KeyR"); await sleep(90); await page.keyboard.up("KeyR"); await sleep(200);
    await page.keyboard.down("KeyR"); await sleep(650); await shot("scream-charging"); await sleep(600); await page.keyboard.up("KeyR"); await sleep(200);
    T = await page.evaluate(() => window.T);
    s = await st();
    must(T.fizz === 1 && T.scream.length === 1 && T.scream[0] > 0.9 && s.svc.abilities.scream.cd > 1.5, "scream wrong: " + JSON.stringify([T.fizz, T.scream, s.svc.abilities.scream]));
    await page.evaluate(() => window.__platy.ctx.abilities.scream.force(1));
    T = await page.evaluate(() => window.T);
    must(T.scream.length === 2, "scream.force did not fire");
    log("scream: fizzle, charged release " + T.scream[0].toFixed(2) + ", cooldown, force ok");
    // fire: F held = automatic with aim assist; then the mouse
    await sleep(4200); // the mouse has been still for 4 s: F now aims along the heading with the wide assist
    await page.evaluate(() => { window.__platy.player.yaw = 0.25; });
    await page.keyboard.down("KeyF"); await sleep(500); await shot("hud-combat"); await page.keyboard.up("KeyF"); await sleep(200);
    T = await page.evaluate(() => window.T);
    must(T.shots.length >= 2 && T.shots.length <= 4 && T.shots.every((x) => x.hit), "F fire / assist wrong: " + JSON.stringify(T.shots));
    const before = T.shots.length;
    await page.mouse.move(200, 500); await sleep(100);
    await page.mouse.down(); await sleep(120); await page.mouse.up(); await sleep(200);
    T = await page.evaluate(() => window.T);
    must(T.shots.length === before + 1 && !T.shots[before].hit && T.shots[before].dx > 0.2, "mouse fire should go toward the cursor (screen left = world +x here): " + JSON.stringify(T.shots[before]));
    s = await st();
    log("fire: " + before + " assisted shots with F, 1 free shot with the mouse, ammo left " + s.svc.abilities.shoot.ammo);
    r = await page.evaluate(() => { const c = window.__platy.ctx; c.army.lose(c.army.list[0]); const o = {}; c.army.slot(3, o); return [c.army.count, c.army.lost, o]; });
    must(r[0] === 6 && r[1] === 1 && isFinite(r[2].x), "army registry wrong " + JSON.stringify(r));

    // HUD pieces all at once
    await page.evaluate(() => {
      const d = window.__platy, u = d.ui, c = d.ctx;
      u.setObjective("Reach the helicopter", "sneak past the guards");
      u.boss.show("The Platypus King", 3); u.boss.set(0.58); u.boss.phase(1);
      u.setSeen(0.6, "suspicious");
      u.flight.show(true); u.flight.set(17, 23, 2.5, 0.3, "PULL UP");
      u.setPing(1.1, 0.9);
      u.setCharge(0.7, "SCREAM", 0.25);
      c.gear.wear("eyes", "glasses", { visor: true });
      u.mark(0, 500, 300, "foe"); u.mark(1, 760, 340, "ally"); u.mark(2, 640, 220, "goal");
      u.checkpoint("Armoury");
    });
    await sleep(600); await shot("hud-everything-1280");
    await page.evaluate(() => document.body.classList.add("touch"));
    await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 }); await sleep(500); await shot("hud-everything-phone-landscape");
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 }); await sleep(500); await shot("hud-everything-phone-portrait");
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await page.evaluate(() => { document.body.classList.remove("touch"); const u = window.__platy.ui; u.boss.hide(); u.setSeen(null); u.setPing(null); u.setCharge(null); window.__platy.ctx.gear.clear(); });

    // vehicle possession
    await page.evaluate(() => {
      const d = window.__platy, c = d.ctx, THREE = c.THREE;
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 3), new THREE.MeshStandardMaterial({ color: 0xcc4433 }));
      d.world.group.add(box);
      const v = window.T.v = { x: 0, y: 1.5, z: 0, yaw: 0, camDist: 9, camHeight: 1, camPitch: 0.3, camLag: 3, n: 0,
        control(dt, i) { this.n++; this.yaw -= i.x * 1.5 * dt; this.x += Math.sin(this.yaw) * i.y * 8 * dt; this.z += Math.cos(this.yaw) * i.y * 8 * dt; this.y = Math.max(0.5, this.y + ((i.up ? 4 : 0) - (i.down ? 4 : 0)) * dt); box.position.set(this.x, this.y, this.z); box.rotation.y = this.yaw; window.T.vin = { ...i }; } };
      c.vehicle.enter(v);
    });
    await page.keyboard.down("KeyW"); await page.keyboard.down("Space"); await sleep(1000);
    const vin = await page.evaluate(() => window.T.vin);
    await page.keyboard.up("Space"); await page.keyboard.down("KeyD"); await sleep(700); await shot("vehicle");
    await page.keyboard.up("KeyD"); await page.keyboard.down("ShiftLeft"); await sleep(400);
    const vin2 = await page.evaluate(() => window.T.vin);
    await page.keyboard.up("ShiftLeft"); await page.keyboard.up("KeyW"); await sleep(200);
    s = await st();
    r = await page.evaluate(() => { const v = window.T.v; return { x: v.x, y: v.y, z: v.z, yaw: v.yaw, hidden: window.__platy.player.hidden, scripted: window.__platy.player.scripted, cx: window.__platy.cam.tx, cz: window.__platy.cam.tz }; });
    must(vin.y === 1 && vin.up === true && vin2.down === true && r.z > 5 && r.y > 3 && Math.abs(r.yaw) > 0.5 && r.hidden && r.scripted, "vehicle control wrong: " + JSON.stringify([vin, vin2, r]));
    must(Math.hypot(r.cx - r.x, r.cz - r.z) < 1.5 && Math.abs(s.player.x - r.x) < 0.01, "the camera / player.x must follow the vehicle: " + JSON.stringify([r, s.player]));
    await page.evaluate(() => window.__platy.ctx.vehicle.exit(1, 1, 0));
    await sleep(300);
    s = await st();
    must(!s.svc.vehicle && Math.abs(s.player.x - 1) < 0.01 && !(await page.evaluate(() => window.__platy.player.scripted || window.__platy.player.hidden)), "vehicle exit wrong");
    log("vehicle: W/Space/D/Shift drive it, camera follows, exit restores the platypus ok");

    // the day card + music clock
    r = await page.evaluate(() => { const mu = window.__platy.ctx.music; mu.play("combat", { intensity: 0.7 }); return [mu.state, mu.bpm, typeof mu.beat(), typeof mu.stinger, typeof window.__platy.audio.musicBus]; });
    must(r[0] === "combat" && r[1] > 0 && r[2] === "number" && r[3] === "function" && r[4] === "function", "music stub API wrong: " + JSON.stringify(r));
    await page.evaluate(() => { window.T.day = false; window.__platy.cinema.dayCard("5 DAYS", { hold: 1.6 }, () => { window.T.day = true; }); });
    await sleep(2300); await shot("day-card");
    await page.waitForFunction(() => window.T.day === true, { timeout: 6000 });
    await page.evaluate(() => window.__platy.cinema.fade("clear", 0.3));
    await sleep(500);
    s = await st();
    log("level 6 placeholder + services: calls=" + s.render.calls + " tris=" + s.render.triangles + " fps=" + s.fps.toFixed(0));
    // leaving turns everything off
    await page.evaluate(() => window.__platy.quit());
    s = await waitFor((x) => x.mode === "menu", 6000, "menu after quit");
    must(!s.svc.health && !s.svc.abilities.potion && !s.svc.abilities.shoot && s.svc.army.count === 0 && s.svc.checkpoint.id === null, "services must be off after leaving: " + JSON.stringify(s.svc));
    const hudLeft = await page.evaluate(() => ["health", "potions", "ammo", "army", "boss", "seen", "flight", "visor"].filter((id) => document.getElementById(id).classList.contains("on")).concat(Array.from(document.querySelectorAll(".abil2.show")).map((b) => b.id)));
    must(hudLeft.length === 0, "HUD pieces left on: " + hudLeft);
    // level 1 still starts clean after all that
    await page.evaluate(() => window.__platy.startLevel(1));
    await waitFor((x) => x.mode === "level" && x.step === "greet", 25000, "level 1 after the services test");
    await page.evaluate(() => window.__platy.skipTo("fight"));
    await sleep(1200); await shot("level1-after");
    const l1 = await page.evaluate(() => ({ extra: Array.from(document.querySelectorAll(".abil2.show")).length, sting: getComputedStyle(document.getElementById("btnSting")).display }));
    must(l1.extra === 0 && l1.sting !== "none", "level 1 HUD changed: " + JSON.stringify(l1));
    await page.evaluate(() => window.__platy.quit());
    await waitFor((x) => x.mode === "menu", 6000, "menu");
    await page.evaluate(() => window.__platy.resetProgress());
    ok = true;
  } catch (e) {
    console.log("FAILED: " + (e && e.stack || e));
    try { await shot("failure"); console.log(JSON.stringify(await st())); } catch (_) {}
  }
  await browser.close();
  srv.close();
  console.log("errors: " + errors.length);
  for (const e of errors.slice(0, 30)) console.log("  " + e.slice(0, 600));
  console.log(ok && !errors.length ? "ENGINE2 OK" : "ENGINE2 FAILED");
  process.exit(ok && errors.length === 0 ? 0 : 1);
})();
