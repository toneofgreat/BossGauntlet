// Level 7 "THE CIRCUS": full browser playthrough (modelled on playtest-l5.cjs / playtest-l6.cjs).
//   node tools/playtest-l7.cjs               the whole level, then caught / crash / skipTo / re-entry / phone checks
//   node tools/playtest-l7.cjs --from=lot    start the real playthrough at a beat (skipTo)
//   node tools/playtest-l7.cjs --only=tent   play just that beat, then stop
//   node tools/playtest-l7.cjs --play        only the real playthrough
//   node tools/playtest-l7.cjs --until=lot   the real playthrough up to and including that beat
// Beats: intro, cage, wagons, tent, lot, heli, takeoff (the whole flight and the landing).
// On foot the seam only reads state and aims the follow camera; the playing is real keys. In the air an in-page
// pilot holds real keys (W/S/A/D/Space/Shift) through the game's own key handler, following the rings.
// Screenshots: tools/shots/l7-NNN-name.png, plus 2x2 contact sheets tools/shots/l7-sheet-NN.png.
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const arg = (k) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=")[1] : null; };
const FROM = arg("from"), ONLY = arg("only"), UNTIL = arg("until"), PLAY = process.argv.includes("--play");
const ORDER = ["intro", "cage", "wagons", "tent", "lot", "heli", "takeoff"];

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
  for (const f of fs.readdirSync(SHOTS)) if (f.startsWith("l7-")) fs.unlinkSync(path.join(SHOTS, f));
  const srv = await serve();
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
    defaultViewport: { width: 1280, height: 720 },
  });
  const errors = [];
  const report = { url, steps: [], errors, fallbacks: [], shots: [] };
  let n = 0;
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + (e.stack || e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });
  page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url()));

  const T0 = Date.now();
  const log = (m) => { m = "[" + ((Date.now() - T0) / 1000).toFixed(0).padStart(3) + "s] " + m; report.steps.push(m); console.log(m); };
  const fallback = (m) => { report.fallbacks.push(m); log("FALLBACK: " + m); };
  const shot = async (name) => {
    n++;
    const f = path.join(SHOTS, "l7-" + String(n).padStart(3, "0") + "-" + name + ".png");
    await page.screenshot({ path: f });
    report.shots.push(f);
    return f;
  };
  let maxCalls = 0, maxTris = 0, maxWhere = "";
  const st = async () => {
    const s = await page.evaluate(() => {
      const d = window.__platy; if (!d) return null;
      const s = d.state(), L = d.ctx.debug.level7;
      s.actionLabel = d.ui.actionOn ? (document.getElementById("actionTxt") || {}).textContent || "" : "";
      s.acting = !!d.platypus.acting; s.lock = d.player.lock; s.speaking = !!d.ui.speaking();
      s.gy = d.platypus.group.position.y;
      s.respawning = !!d.ctx.checkpoint.respawning;
      s.hint = (document.getElementById("hint") || {}).textContent || "";
      if (L && s.levelN === 7 && s.mode === "level" && d.world) {
        const w = d.world;
        s.world = w.name;
        if (!s.flying) {
          s.floor = w.heightAt(d.player.x, d.player.z);
          s.enemies = L.combat.enemies.filter((e) => e.alive).map((e) => ({ x: e.x, y: e.y, z: e.z, state: e.state, aware: !!e.aware, floor: w.heightAt(e.x, e.z) }));
        } else {
          const c = L.heli.craft;
          s.craft = { x: c.x, y: c.y, z: c.z, yaw: c.yaw, vy: c.vy, crashed: !!c.crashed, grounded: !!c.grounded, rpm: c.rpm };
        }
      }
      return s;
    });
    if (s && s.render) {
      if (s.render.calls > maxCalls) { maxCalls = s.render.calls; maxWhere = s.step + " z" + s.z; }
      if (s.render.triangles > maxTris) { maxTris = s.render.triangles; report.maxTrisWhere = s.step + " z" + s.z + " calls " + s.render.calls; }
    }
    return s;
  };
  const waitFor = async (pred, ms, label) => {
    const t0 = Date.now();
    for (;;) {
      const s = await st();
      if (s && pred(s)) return s;
      if (Date.now() - t0 > ms) throw new Error("timeout waiting for " + label + " (step=" + (s && s.step) + "/" + (s && s.sub) + ")");
      await sleep(100);
    }
  };
  const keys = new Set();
  const down = async (k) => { if (!keys.has(k)) { keys.add(k); await page.keyboard.down(k); } };
  const up = async (k) => { if (keys.has(k)) { keys.delete(k); await page.keyboard.up(k); } };
  const upAll = async () => { for (const k of Array.from(keys)) await up(k); };
  const aimAt = (x, z) => page.evaluate((x, z) => { const d = window.__platy, p = d.player; d.cam.yaw = Math.atan2(x - p.x, z - p.z); d.cam.manualT = 1.5; }, x, z);
  const tp = (x, z, yaw) => page.evaluate((x, z, yaw) => window.__platy.tp(x, z, yaw), x, z, yaw);
  async function walk(target, o) {
    o = o || {};
    const stop = o.stop === undefined ? 0.5 : o.stop, tEnd = Date.now() + (o.timeout || 15000);
    let lastX = 1e9, lastZ = 1e9, lastT = Date.now(), jumps = 0, res = "timeout", detourT = 0, detourSide = 1;
    for (;;) {
      const s = await st();
      if (!s || (o.until && o.until(s))) { res = "until"; break; }
      const t = target(s);
      if (!t) { res = "notarget"; break; }
      const d = Math.hypot(t.x - s.player.x, t.z - s.player.z);
      if (d < stop) { res = "ok"; break; }
      if (Date.now() > tEnd) break;
      if (Date.now() < detourT) {
        const a = Math.atan2(t.x - s.player.x, t.z - s.player.z) + detourSide * 1.35;
        await aimAt(s.player.x + Math.sin(a) * 3, s.player.z + Math.cos(a) * 3);
      } else await aimAt(t.x, t.z);
      await down("KeyW");
      if (o.each) await o.each(s, t, d);
      if (Math.hypot(s.player.x - lastX, s.player.z - lastZ) > 0.25) { lastX = s.player.x; lastZ = s.player.z; lastT = Date.now(); jumps = 0; }
      else if (s.player.enabled && Date.now() - lastT > 900 + jumps * 700) {
        if (jumps >= 7) { res = "stuck"; break; }
        jumps++;
        if (jumps >= 2 && !o.noDetour) { detourSide = jumps % 2 ? 1 : -1; detourT = Date.now() + 1300 + jumps * 250; lastT = Date.now() + 1200; }
        else if (!o.noJump) { await page.keyboard.press("Space"); lastT = Date.now(); }
      }
      await sleep(60);
    }
    await up("KeyW");
    return res;
  }
  const fpsOnce = () => page.evaluate(() => new Promise((res) => {
    const gaps = []; let last = performance.now(); const t0 = last;
    function f(t) { gaps.push(t - last); last = t; if (t - t0 < 5000) requestAnimationFrame(f); else {
      gaps.sort((a, b) => a - b);
      res({ fps: gaps.length / ((t - t0) / 1000), p50: gaps[gaps.length >> 1], p95: gaps[(gaps.length * 0.95) | 0], max: gaps[gaps.length - 1] });
    } }
    requestAnimationFrame(f);
  }));
  const fpsMeasure = async (label) => {
    let best = null; const samples = [];
    for (let i = 0; i < 3; i++) {
      const f = await fpsOnce();
      samples.push(Math.round(f.fps * 10) / 10);
      if (!best || f.fps > best.fps) best = f;
      if (f.fps >= 58) break;
    }
    best.samples = samples;
    const s = await st();
    report["fps_" + label] = best; report["render_" + label] = s.render;
    log("FPS " + label + ": " + best.fps.toFixed(1) + " p50 " + best.p50.toFixed(1) + "ms p95 " + best.p95.toFixed(1) + "ms max " + best.max.toFixed(1) + "ms; draw calls " + s.render.calls + " tris " + s.render.triangles + (samples.length > 1 ? " (samples " + samples.join(", ") + ")" : ""));
    return best;
  };
  // floating / sunk characters
  const ground = (s, label) => {
    if (!s || s.floor === undefined) return;
    const dp = s.gy - s.floor;
    let msg = "  ground " + label + ": player " + dp.toFixed(2) + " (y " + (s.player.y - s.floor).toFixed(2) + " at " + s.player.x.toFixed(2) + "," + s.player.z.toFixed(2) + ")" + (s.player.inWater ? " (water)" : "");
    if (s.wiz && s.wiz.visible) msg += " wizard " + (s.wiz.y - s.wiz.floor).toFixed(2);
    const bad = [];
    for (const e of s.enemies || []) { const d = e.y - e.floor; if (!e.inPool && Math.abs(d) > 0.35) bad.push("soldier " + d.toFixed(2)); }
    for (const a of s.allies || []) { const d = a.y - a.floor; if (a.state !== "newborn" && Math.abs(d) > 0.4) bad.push("ally " + d.toFixed(2)); }
    log(msg + (bad.length ? " BAD " + bad.join(", ") : ""));
    if (!s.player.inWater && !s.acting && s.player.grounded && Math.abs(dp) > 0.3) fallback("player not on the ground at " + label + ": " + dp.toFixed(2));
    if (s.wiz && s.wiz.visible && (s.wiz.y - s.wiz.floor < -0.05 || s.wiz.y - s.wiz.floor > 0.6)) fallback("wizard floating/sunk at " + label + ": " + (s.wiz.y - s.wiz.floor).toFixed(2));
    if (bad.length) fallback("characters off the ground at " + label + ": " + bad.join(", "));
  };
  async function filmWhile(name, cond, every, maxMs, each) {
    const t0 = Date.now(); let i = 0, lastShot = 0, lastStep = "";
    while (Date.now() - t0 < maxMs) {
      const s = await st();
      if (!s || !cond(s)) break;
      if (each) await each(s);
      const sig = s.step + "/" + s.sub;
      if (Date.now() - lastShot >= every || sig !== lastStep) {
        lastShot = Date.now(); lastStep = sig;
        await shot(name + "-" + String(i++).padStart(2, "0") + "-" + s.step + "-" + s.sub);
      }
      await sleep(120);
    }
    return (Date.now() - t0) / 1000;
  }
  // wizard speech: read it, then E (the level's own "go on" key)
  async function talk(name, maxMs) {
    const t0 = Date.now(); let k = 0;
    while (Date.now() - t0 < (maxMs || 20000)) {
      const s = await st();
      if (!s.speaking) { if (Date.now() - t0 > 1500 && !s.talking) break; await sleep(150); continue; }
      await sleep(1500);
      if (k < 3) await shot(name + "-say-" + (++k));
      await page.keyboard.press("KeyE"); await sleep(250); await page.keyboard.press("KeyE");
      await sleep(400);
    }
  }
  const free = (ms) => waitFor((x) => x.lock <= 0 && !x.acting && x.player.enabled && !x.talking, ms || 6000, "free");

  // fight every standing enemy matching `which`; mode: "sting" (J J J), "slap" (L then J), "any"
  async function fightAll(label, done, which, mode, maxMs) {
    const tEnd = Date.now() + (maxMs || 120000);
    let hits = 0, shots = 0;
    while (Date.now() < tEnd) {
      let s = await st();
      if (done(s)) return true;
      if (s.talking || !s.player.enabled) { await upAll(); await sleep(200); continue; }
      const list = s.enemies.filter(which);
      if (!list.length) { await upAll(); await sleep(200); continue; }
      let e = list[0], bd = 1e9;
      for (const x of list) { const d = Math.hypot(x.x - s.player.x, x.z - s.player.z); if (d < bd) { bd = d; e = x; } }
      if (bd > 0.85) { await aimAt(e.x, e.z); await down("KeyW"); await sleep(60); continue; }
      await up("KeyW");
      await aimAt(e.x, e.z);
      if (s.lock > 0 || s.acting) { await sleep(60); continue; }
      const key = mode === "slap" && !e.staggered ? "KeyL" : "KeyJ";
      await page.keyboard.press(key); hits++;
      if (shots < 4 && hits % 2 === 0) { shots++; await sleep(200); await shot(label + "-hit-" + hits); }
      await sleep(180);
    }
    return false;
  }

    // ---------------------------------------------------------------- level 7 helpers
  const LP = () => page.evaluate(() => {
    const L = window.__platy.ctx.debug.level7, P = L.circus.P, o = {};
    for (const k of ["cage", "cageBack", "cageOut", "cp1", "bell", "bellPad", "doorWest", "doorNorth", "cp2", "bottles", "cp3", "calliopeCrank", "gateBar", "gate", "cp4", "heliSpot"]) o[k] = { x: P[k].x, z: P[k].z };
    o.latch = { x: P.latch.x, z: P.latch.z };
    return o;
  });
  let PTS = null;
  const sneakWalk = async (t, o) => { await down("ShiftLeft"); const r = await walk(() => t, o); await up("ShiftLeft"); return r; };
  const caughtSince = (tries0) => async () => { const s = await st(); return s.tries > tries0 || s.respawning; };
  // installs an in-page pilot that holds real keys (synthetic KeyboardEvents through the game's own key handler)
  const pilot = (on) => page.evaluate((on) => {
    const d = window.__platy;
    const ks = window.__apKeys || (window.__apKeys = {});
    const key = (code, v) => { if (!!ks[code] === v) return; ks[code] = v; window.dispatchEvent(new KeyboardEvent(v ? "keydown" : "keyup", { code, bubbles: true })); };
    const all = () => { for (const k of ["KeyW", "KeyS", "KeyA", "KeyD", "Space", "ShiftLeft"]) key(k, false); };
    if (!on) { window.__apOn = false; all(); return; }
    if (window.__apOn) return;
    window.__apOn = true;
    const L = d.ctx.debug.level7, W = L.heli.world, c = L.heli.craft;
    const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
    const tick = () => {
      if (!window.__apOn) return;
      requestAnimationFrame(tick);
      const s = d.state();
      if (!s.flying || !d.player.enabled || c.locked || c.crashed || s.step === "end" || s.step === "done") { all(); return; }
      const G = W.gates, LD = W.landing;
      let tx, ty, tz, final = false;
      let gi = 0; while (gi < G.length && G[gi].z < c.z + 3) gi++;
      if (gi < G.length) { tx = G[gi].x; ty = G[gi].y - 1.3; tz = G[gi].z; }
      else { tx = LD.x; tz = LD.z; ty = 34; final = true; }
      if (c.z > 840) ty = Math.max(ty, 34);
      // steer round tall things on the line
      let best = null;
      for (const o of W.obstacles) {
        if (o.kind === "wire" || o.kind === "bridge") continue;
        if (o.zMin > c.z + 55 || o.zMax < c.z - 2) continue;
        if (o.y + o.h < c.y - 2) continue;
        const f = (o.z - c.z) / Math.max(1, tz - c.z), px = c.x + (tx - c.x) * Math.min(1, Math.max(0, f));
        if (Math.abs(px - o.x) < o.r + 4.5 && (!best || o.z < best.o.z)) best = { o, px };
      }
      let ax = tx, az = tz;
      if (best) { const sd = best.px >= best.o.x ? 1 : -1; ax = best.o.x + sd * (best.o.r + 7); az = best.o.z; }
      // keep clear of the ground / canopy ahead
      let floor = -1e9;
      for (let k = 0; k <= 4; k++) { const fx = c.x + c.vx * k * 0.6, fz = c.z + c.vz * k * 0.6; floor = Math.max(floor, W.floorAt(fx, fz)); }
      const dl = Math.hypot(LD.x - c.x, LD.z - c.z);
      const approach = final && dl < 34;
      ty = Math.max(ty, floor + (approach ? 3 : 6));
      const want = Math.atan2(ax - c.x, az - c.z), err = wrap(want - c.yaw);
      key("KeyA", err > 0.06); key("KeyD", err < -0.06);
      const sp = c.speed;
      if (approach) {
        const vmax = Math.max(1.5, dl * 0.45);
        key("KeyW", sp < vmax - 1 && Math.abs(err) < 0.4); key("KeyS", sp > vmax + 1.5);
        const over = dl < 6;
        key("Space", !over && c.y < ty); key("ShiftLeft", over && sp < 3);
        return;
      }
      const vmax = Math.abs(err) > 0.6 ? 8 : s.coughing ? 15 : 19;
      key("KeyW", c.altitude > 7 && sp < vmax && Math.abs(err) < 0.9);
      key("KeyS", sp > vmax + 4);
      key("Space", c.y < ty + 0.3 || c.vy < -3);
      key("ShiftLeft", c.y > ty + 2.5 && c.vy > -2.5 && !s.coughing);
    };
    requestAnimationFrame(tick);
  }, on);

  // ---------------------------------------------------------------- the beats
  async function beatIntro() {
    await sleep(700); await shot("title");
    const t = await filmWhile("intro", (x) => x.step === "intro", 1600, 40000);
    log("intro ran " + t.toFixed(1) + " s");
  }
  async function beatCage() {
    let s = await waitFor((x) => x.step === "cage" && x.player.enabled && !x.cinema.playing, 15000, "cage playable");
    PTS = await LP();
    await sleep(600); await shot("cage-start"); ground(await st(), "cage start");
    for (let k = 0; k < 40; k++) {
      s = await st();
      if (s.cage === "open") break;
      if (s.cage === "coming" || s.cage === "watch") {
        await shot("cage-guard-" + s.cage);
        await sneakWalk(PTS.cageBack, { stop: 0.35, timeout: 6000, noJump: true });
        await down("ShiftLeft");
        await waitFor((x) => x.cage === "patrol" || x.cage === "open", 20000, "guard to leave");
        await up("ShiftLeft");
        await shot("cage-guard-left");
        continue;
      }
      await walk(() => PTS.latch, { stop: 1.0, timeout: 6000, noJump: true });
      await free();
      await page.keyboard.press("KeyL");
      await sleep(900);
      s = await st();
      log("  latch " + s.latch + "/3, guard " + s.cage);
      if (k < 3) await shot("cage-slap-" + s.latch);
    }
    if ((await st()).cage !== "open") throw new Error("cage door never opened");
    await sleep(400); await shot("cage-open");
    const r = await sneakWalk(PTS.cageOut, { stop: 0.5, timeout: 15000, until: (x) => x.step !== "cage" });
    await waitFor((x) => x.step === "wagons", 8000, "out of the cage (" + r + ")");
  }
  // walk a list of points sneaking; on a catch retry up to `tries` times, then position by seam
  async function sneakRoute(label, pts, doneFn, tries) {
    for (let a = 0; a < (tries || 3); a++) {
      const t0 = (await st()).tries;
      let caught = false;
      for (const p of pts) {
        if (p.act) { await free().catch(() => {}); await p.act(); continue; }
        const r = await sneakWalk(p, { stop: p.stop || 0.7, timeout: p.timeout || 25000, noJump: true, until: (x) => x.tries > t0 || x.respawning || doneFn(x) });
        const s = await st();
        if (doneFn(s)) return a;
        if (s.tries > t0 || s.respawning) { caught = true; break; }
        if (r === "stuck" || r === "timeout") log("  " + label + ": walking " + JSON.stringify(p) + " " + r);
        if (p.shot) { await sleep(200); await shot(label + "-" + p.shot); ground(await st(), label + " " + p.shot); }
      }
      if (doneFn(await st())) return a;
      if (caught) {
        log("  " + label + ": caught, try " + (a + 1));
        await shot(label + "-caught-" + a);
        await waitFor((x) => !x.respawning && x.player.enabled, 10000, "respawn");
        await sleep(600);
        if (a === 0) await shot(label + "-respawned");
      }
    }
    return -1;
  }
  async function beatWagons() {
    await waitFor((x) => x.step === "wagons", 5000, "wagons");
    await sleep(800); await shot("wagons-start"); // (standing on the cage lip here: the body straddles the 0.9 m step, so no ground check)
    const got = await sneakRoute("wagons", [
      { x: -24.5, z: -14.5 }, { x: -20.5, z: -14.8 }, { x: -20.5, z: -6 }, { x: -19.5, z: 3, shot: "west-approach" }, { x: PTS.doorWest.x, z: PTS.doorWest.z, stop: 0.6 }, { x: -12, z: 8 },
    ], (x) => x.step !== "wagons", 3);
    if (got < 0) { fallback("wagons: could not sneak into the tent in 3 tries"); await tp(PTS.doorWest.x + 2, PTS.doorWest.z); await sleep(500); }
    await waitFor((x) => x.step === "tent", 8000, "cp2");
    await filmWhile("tent-flash", (x) => x.cinema.playing, 1000, 6000);
  }
  async function beatTent() {
    await waitFor((x) => x.step === "tent" && !x.cinema.playing && x.player.enabled, 10000, "tent");
    await sleep(500); await shot("tent-start"); ground(await st(), "tent");
    const got = await sneakRoute("tent", [
      { x: PTS.bottles.x - 1.2, z: PTS.bottles.z, stop: 0.8, shot: "bottles" },
      { act: async () => { await page.keyboard.press("KeyE"); await sleep(900); await shot("tent-bottles-knocked"); } },
      { x: -10, z: 18 }, { x: -3, z: 23 }, { x: PTS.doorNorth.x, z: PTS.doorNorth.z, stop: 0.6 }, { x: 0, z: 28 },
    ], (x) => x.step !== "tent", 3);
    if (got < 0) { fallback("tent: could not cross in 3 tries"); await tp(0, 27.5); await sleep(500); }
    await waitFor((x) => x.step === "lot", 8000, "cp3");
    await filmWhile("lot-flash", (x) => x.cinema.playing, 1000, 6000);
  }
  async function beatLot() {
    await waitFor((x) => x.step === "lot" && !x.cinema.playing && x.player.enabled, 10000, "lot");
    await sleep(500); await shot("lot-start"); ground(await st(), "lot");
    await fpsMeasure("lot_guards");
    const got = await sneakRoute("lot", [
      { x: 9, z: 28.5 }, { x: PTS.calliopeCrank.x, z: PTS.calliopeCrank.z, stop: 0.6, shot: "calliope" },
      { act: async () => { await page.keyboard.press("KeyE"); await sleep(2500); await shot("lot-calliope-playing"); } },
      { x: 4, z: 34 }, { x: PTS.gateBar.x, z: PTS.gateBar.z, stop: 0.5 },
      { act: async () => { await page.keyboard.press("KeyL"); await sleep(1200); await shot("lot-gate-open"); } },
      { x: 0, z: 41.5 },
    ], (x) => x.step === "heli", 3);
    if (got < 0) { fallback("lot: could not reach the helipad in 3 tries"); await page.evaluate(() => window.__platy.ctx.debug.level7.circus.gate.open()); await tp(0, 41); await sleep(500); }
    await waitFor((x) => x.step === "heli", 8000, "cp4");
  }
  async function beatHeli() {
    await waitFor((x) => x.step === "heli" && x.player.enabled, 10000, "heli");
    await sleep(300); await shot("heli-pad");
    await walk(() => PTS.heliSpot, { stop: 2.2, timeout: 10000 });
    await sleep(200);
    const s = await st();
    if (!/Climb/.test(s.actionLabel)) fallback("heli: no Climb in prompt (" + s.actionLabel + ")");
    await shot("heli-climb-prompt");
    await page.keyboard.press("KeyE");
    await waitFor((x) => x.cinema.playing, 3000, "boarding cutscene");
    const t = await filmWhile("boarding", (x) => x.cinema.playing || x.step === "heli", 1300, 25000);
    log("boarding ran " + t.toFixed(1) + " s");
  }
  async function beatFlight() {
    await waitFor((x) => x.step === "takeoff" && x.player.enabled, 15000, "takeoff");
    await sleep(500); await shot("takeoff-pad");
    await pilot(true);
    const t0 = Date.now(); let lastShot = 0, i = 0, lastStep = "", fpsDone = {};
    const tEnd = Date.now() + 300000;
    let s;
    while (Date.now() < tEnd) {
      s = await st();
      if (s.step === "end" || s.step === "done" || s.mode !== "level") break;
      if (Date.now() - lastShot > 3500 || s.step !== lastStep) {
        lastShot = Date.now(); lastStep = s.step;
        await shot("flight-" + String(i++).padStart(2, "0") + "-" + s.step + "-z" + Math.round(s.z));
      }
      if (s.step === "fields" && s.z > 280 && !fpsDone.f) { fpsDone.f = 1; await fpsMeasure("fields_searchlights"); }
      if (s.step === "valley" && s.z > 560 && !fpsDone.v) { fpsDone.v = 1; await fpsMeasure("valley_ridge"); }
      if (s.step === "jungle" && s.z > 850 && !fpsDone.j) { fpsDone.j = 1; await fpsMeasure("jungle_canopy"); }
      await sleep(150);
    }
    report.flightTries = s.tries; report.flightGates = s.gates;
    log("flight: " + ((Date.now() - t0) / 1000).toFixed(0) + " s, gates " + s.gates + ", hull " + s.hull + ", tries at last checkpoint " + s.tries + ", end at z " + s.z + " x " + (s.craft ? s.craft.x.toFixed(1) : "?"));
    await filmWhile("ending", (x) => x.step === "end", 700, 15000);
    await pilot(false);
    await waitFor((x) => x.step === "done", 15000, "the level card");
    const vis = await page.waitForFunction(() => document.getElementById("victory").classList.contains("on"), { timeout: 10000 }).then(() => true, () => false);
    if (!vis) fallback("no level complete card");
    await sleep(1200); await shot("complete-card");
    for (let i = 0; i < 12; i++) { try { await page.click("#again"); } catch (_) {} await sleep(600); if ((await page.evaluate(() => window.__platy.state().mode)) !== "level") break; }
  }

  const backToMenu = async (label) => {
    const s = await waitFor((x) => x.mode === "menu", 30000, "main screen " + label);
    if (s.running) throw new Error("the level is still running behind the main screen");
    return s;
  };
  const enterLevel = async (label) => {
    await page.evaluate(() => { window.__platy.startLevel(7); });
    return waitFor((x) => x.mode === "level" && x.levelN === 7 && x.step === "intro", 40000, label);
  };

  let s;
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
    const gpu = await page.evaluate(() => { const gl = window.__platy.renderer.getContext(); const e = gl.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; });
    log("gpu: " + gpu);
    await page.evaluate(() => { window.__platy.resetProgress(); window.__platy.unlock(7); });
    await sleep(500);
    await shot("menu");
    if (await page.evaluate(() => document.getElementById("lvl7").classList.contains("locked"))) throw new Error("level 7 is locked after unlock(7)");

    await page.click("#lvl7");
    s = await waitFor((x) => x.mode === "level" && x.levelN === 7, 40000, "level 7 running");
    const beats = [["intro", beatIntro], ["cage", beatCage], ["wagons", beatWagons], ["tent", beatTent], ["lot", beatLot], ["heli", beatHeli], ["takeoff", beatFlight]];
    const first = ONLY || FROM || "intro";
    if (first !== "intro") { await sleep(1500); const ok = await page.evaluate((b) => window.__platy.skipTo(b), first); if (!ok) throw new Error("skipTo " + first + " failed"); await sleep(800); PTS = await LP(); }
    for (const [name, fn] of beats) {
      if (ORDER.indexOf(name) < ORDER.indexOf(first)) continue;
      if (ONLY && name !== ONLY) break;
      log("== " + name);
      await fn();
      await upAll();
      if (UNTIL === name) break;
    }
    if (UNTIL) { await shot("until-end"); report.ok = true; }
    else if (ONLY && ONLY !== "takeoff") await shot("only-end");
    else {
      s = await backToMenu("after the level card");
      if (!s.progress.beaten[6]) throw new Error("level 7 is not marked beaten: " + JSON.stringify(s.progress));
      await sleep(1800); await shot("menu-level7-beaten");
      const tick = await page.evaluate(() => { const b = document.getElementById("lvl7"), c = document.getElementById("lvl8"); return { cls: b.className, next: c ? c.className : "?" }; });
      log("level complete -> main screen; " + JSON.stringify(tick) + ", progress " + JSON.stringify(s.progress));
      if (!/beaten|done/.test(tick.cls)) fallback("the level 7 circle does not show as beaten (class '" + tick.cls + "')");
      if (s.progress.unlocked < 8) fallback("level 8 was not unlocked: " + s.progress.unlocked);
      report.completed = true;
    }

    if (!ONLY && !FROM && !PLAY && !UNTIL) {
      await enterLevel("win on title");
      await sleep(800);
      if (await page.evaluate(() => window.__platy.skipTo("nonsense"))) fallback("skipTo('nonsense') returned true");
      await page.evaluate(() => window.__platy.win());
      await sleep(1200); await shot("win-on-title");
      for (let i = 0; i < 12; i++) { try { await page.click("#again"); } catch (_) {} await sleep(600); if ((await page.evaluate(() => window.__platy.state().mode)) !== "level") break; }
      await backToMenu("after win() on the title");
      // a caught test: walk straight at the gate guards
      await enterLevel("caught test");
      await page.evaluate(() => window.__platy.skipTo("lot")); await sleep(1500); PTS = await LP();
      let t0 = (await st()).tries;
      for (const p of [{ x: 9, z: 28.5 }, { x: 4, z: 34 }, { x: 0, z: 37 }]) { const r = await walk(() => p, { stop: 0.6, timeout: 15000, until: (x) => x.tries > t0 || x.respawning }); if (r === "until") break; }
      s = await waitFor((x) => x.tries > t0, 10000, "caught by the gate guards").catch(() => null);
      if (!s) fallback("walking into the gate guards did not get caught");
      else { await sleep(400); await shot("caught-respawn"); log("caught -> respawn at " + s.checkpoint + " tries " + s.tries); }
      // a crash in the fields: respawn at fields
      await page.evaluate(() => window.__platy.skipTo("fields")); await sleep(1500);
      t0 = (await st()).tries;
      await down("ShiftLeft"); await down("KeyW");
      s = await waitFor((x) => x.tries > t0, 20000, "crash respawn").catch(() => null);
      await upAll();
      if (!s) fallback("diving into the field did not crash/respawn");
      else { await sleep(900); s = await st(); await shot("crash-respawn"); log("crash -> respawn at " + s.checkpoint + " tries " + s.tries + " z " + s.z + " alt " + s.alt); if (s.checkpoint !== "fields") fallback("crash respawned at " + s.checkpoint); }
      // skipTo chain
      for (const b of ["cage", "wagons", "tent", "lot", "heli", "takeoff", "fields", "valley", "jungle", "landing", "tent", "valley", "intro", "lot"]) {
        const ok = await page.evaluate((x) => window.__platy.skipTo(x), b);
        if (!ok) throw new Error("skipTo " + b + " failed");
        await sleep(2600);
        s = await st();
        await shot("skipTo-" + b + "-" + s.step);
        if (!s.flying && b !== "intro") ground(s, "skipTo " + b);
      }
      log("skipTo chain ok");
      await page.evaluate(() => window.__platy.quit());
      await backToMenu("after quitting");
      s = await enterLevel("re-entry");
      if (s.takedowns !== 0 || s.gates !== 0 || s.timeScale !== 1 || s.flying) throw new Error("re-entry is not clean: " + JSON.stringify({ t: s.takedowns, g: s.gates, ts: s.timeScale, f: s.flying }));
      await page.evaluate(() => window.__platy.win());
      await sleep(800); for (let i = 0; i < 12; i++) { try { await page.click("#again"); } catch (_) {} await sleep(600); if ((await page.evaluate(() => window.__platy.state().mode)) !== "level") break; }
      await backToMenu("after win()");
      log("quit, re-entry, win() ok");
      // the clearing: from the landing skip, can the pilot glide in and land?
      await enterLevel("landing");
      await page.evaluate(() => window.__platy.skipTo("landing")); await sleep(1200);
      await pilot(true);
      let lz = null;
      for (let k = 0; k < 120; k++) { const q = await st(); if (q.step === "end" || q.step === "done") { lz = q; break; } if (k % 12 === 0) await shot("landing-try-z" + Math.round(q.z)); await sleep(250); }
      await sleep(300); await shot("landing-try-end");
      await pilot(false);
      if (lz && lz.craft) log("landing try: ended at x " + lz.craft.x.toFixed(1) + " z " + lz.craft.z.toFixed(1) + " crashed " + lz.craft.crashed + " grounded " + lz.craft.grounded);
      report.landingTry = lz && lz.craft;
      await waitFor((x) => x.step === "done", 15000, "landing card");
      await sleep(1200); for (let i = 0; i < 12; i++) { try { await page.click("#again"); } catch (_) {} await sleep(600); if ((await page.evaluate(() => window.__platy.state().mode)) !== "level") break; }
      await backToMenu("after the landing try");
      // phone portrait + landscape
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true });
      await page.evaluate(() => { document.body.classList.add("touch"); });
      await sleep(600);
      await enterLevel("phone");
      await sleep(5000); await shot("phone-portrait-intro");
      for (const b of ["cage", "tent", "lot", "fields", "jungle"]) {
        await page.evaluate((x) => window.__platy.skipTo(x), b);
        await sleep(3000);
        await shot("phone-portrait-" + b);
      }
      await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, hasTouch: true });
      await sleep(600);
      for (const b of ["wagons", "lot", "valley"]) {
        await page.evaluate((x) => window.__platy.skipTo(x), b);
        await sleep(3000);
        await shot("phone-landscape-" + b);
      }
      await page.evaluate(() => window.__platy.win());
      await sleep(800); for (let i = 0; i < 12; i++) { try { await page.tap("#again"); } catch (_) {} await sleep(600); if ((await page.evaluate(() => window.__platy.state().mode)) !== "level") break; }
      await backToMenu("after the phone run");
      await page.evaluate(() => { document.body.classList.remove("touch"); window.__platy.resetProgress(); });
      log("phone shots ok");
    }
    report.maxCalls = maxCalls; report.maxTris = maxTris;
    log("max draw calls seen " + maxCalls + " (in " + maxWhere + "), max triangles " + maxTris + " (in " + report.maxTrisWhere + ")");
    if (maxCalls > 150) throw new Error("draw call budget exceeded: " + maxCalls);
    if (maxTris > 250000) throw new Error("triangle budget exceeded: " + maxTris);
    for (const k of Object.keys(report)) if (k.startsWith("fps_") && report[k].fps < 55) throw new Error(k + " " + report[k].fps.toFixed(1) + " < 55");
    if (report.fallbacks.length) throw new Error(report.fallbacks.length + " check(s) failed, see FALLBACK lines");
    report.ok = true;
  } catch (e) {
    report.ok = false;
    report.failure = String(e && e.stack || e);
    console.log("FAILED: " + report.failure);
    try { await pilot(false); await upAll(); await shot("failure"); const q = await st(); console.log(JSON.stringify(q).slice(0, 3000)); } catch (_) {}
  }

  try {
    const sp = await browser.newPage();
    await sp.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    const files = report.shots.filter((f) => fs.existsSync(f));
    for (let i = 0, k = 1; i < files.length; i += 4, k++) {
      const cells = files.slice(i, i + 4).map((f) => "<div><img src='data:image/png;base64," + fs.readFileSync(f).toString("base64") + "'><span>" + path.basename(f, ".png") + "</span></div>").join("");
      await sp.setContent("<style>body{margin:0;background:#222;display:grid;grid-template-columns:640px 640px;grid-auto-rows:360px}div{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}img{max-width:640px;max-height:360px}span{position:absolute;left:4px;top:2px;font:bold 13px monospace;color:#ff0;text-shadow:0 0 3px #000,0 0 3px #000}</style>" + cells, { waitUntil: "load" });
      await sp.screenshot({ path: path.join(SHOTS, "l7-sheet-" + String(k).padStart(2, "0") + ".png") });
    }
  } catch (e) { console.log("contact sheets failed: " + e); }

  await browser.close();
  srv.close();
  fs.writeFileSync(path.join(SHOTS, "l7-report.json"), JSON.stringify(report, null, 2));
  console.log("fallbacks: " + report.fallbacks.length);
  for (const f of report.fallbacks) console.log("  " + f);
  console.log("errors: " + errors.length);
  for (const e of errors.slice(0, 30)) console.log("  " + e.slice(0, 600));
  console.log(report.ok ? "PLAYTEST-L7 OK" : "PLAYTEST-L7 FAILED");
  process.exit(report.ok && errors.length === 0 ? 0 : 1);
})();
