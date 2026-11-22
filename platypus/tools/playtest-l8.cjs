// Level 8 "THE SCREAM": full browser playthrough (modelled on playtest-l5.cjs / playtest-l7.cjs).
//   node tools/playtest-l8.cjs               the whole level, then skipTo / win / re-entry / phone checks
//   node tools/playtest-l8.cjs --from=trail  start the real playthrough at a beat (skipTo)
//   node tools/playtest-l8.cjs --only=meet   play just that beat, then stop
//   node tools/playtest-l8.cjs --play        only the real playthrough
//   node tools/playtest-l8.cjs --until=scream
// Beats: intro, memory1, memory2, memory3, wake (wake+taken+carried+scream), glade (glade+trail), meet, follow (follow+reveal+end).
// The playing is real keys (WASD, 1-4, J, E); the seam reads state and aims the follow camera.
// Screenshots: tools/shots/l8-NNN-name.png, plus 2x2 contact sheets tools/shots/l8-sheet-NN.png.
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const arg = (k) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=")[1] : null; };
const FROM = arg("from"), ONLY = arg("only"), UNTIL = arg("until"), PLAY = process.argv.includes("--play");
const ORDER = ["intro", "memory1", "memory2", "memory3", "wake", "glade", "meet", "follow"];

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
  for (const f of fs.readdirSync(SHOTS)) if (f.startsWith("l8-")) fs.unlinkSync(path.join(SHOTS, f));
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
    const f = path.join(SHOTS, "l8-" + String(n).padStart(3, "0") + "-" + name + ".png");
    await page.screenshot({ path: f });
    report.shots.push(f);
    return f;
  };
  let maxCalls = 0, maxTris = 0, maxWhere = "";
  const st = async () => {
    const s = await page.evaluate(() => {
      const d = window.__platy; if (!d) return null;
      const s = d.state(), L = d.ctx.debug.level8;
      s.actionLabel = d.ui.actionOn ? (document.getElementById("actionTxt") || {}).textContent || "" : "";
      s.acting = !!d.platypus.acting; s.lock = d.player.lock; s.speaking = !!d.ui.speaking();
      s.gy = d.platypus.group.position.y;
      s.respawning = !!d.ctx.checkpoint.respawning;
      s.hint = (document.getElementById("hint") || {}).textContent || "";
      s.z = Math.round(d.player.z * 10) / 10;
      if (L && s.levelN === 8 && s.mode === "level" && d.world) {
        const w = d.world;
        s.world = w.name;
        s.floor = w.heightAt(d.player.x, d.player.z);
        if (s.jungle) {
          const m = L.tribe.members.moss;
          s.mossP = { x: m.x, y: m.y, z: m.z, visible: m.visible !== false, floor: w.heightAt(m.x, m.z) };
          s.enemies = L.combat.enemies.filter((e) => e.alive).map((e) => ({ x: e.x, y: e.y, z: e.z, state: e.state, floor: w.heightAt(e.x, e.z) }));
        } else {
          const f = L.friend;
          s.pip = { x: f.x, y: f.y, z: f.z, floor: w.heightAt(f.x, f.z) };
        }
      }
      return s;
    });
    if (s && s.render) {
      if (s.render.calls > maxCalls) { maxCalls = s.render.calls; maxWhere = s.step + " z" + s.z; }
      if (s.render.triangles > maxTris) { maxTris = s.render.triangles; report.maxTrisWhere = s.step + " z" + s.z + " calls " + s.render.calls; }
      if (s.render.triangles > 250000 && (report.overBudget || []).length < 3) {
        const top = await page.evaluate(() => { const d = window.__platy, by = {}; d.scene.traverseVisible((o) => { if (!o.isMesh || !o.geometry) return; const g = o.geometry; let t = (g.index ? g.index.count : g.attributes.position.count) / 3; if (o.isInstancedMesh) t *= o.count; let k = o.name || "?"; if (o.parent) k = (o.parent.name || "?") + "/" + k; if (o.castShadow) k += "[S]"; by[k] = (by[k] || 0) + t; }); return Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k + ":" + Math.round(v)).join(" "); });
        (report.overBudget = report.overBudget || []).push(s.step + " " + s.render.triangles + " calls " + s.render.calls + ": " + top);
        log("OVER BUDGET " + s.step + " " + s.render.triangles + " calls " + s.render.calls + " cam " + JSON.stringify(s.cam) + ": " + top);
      }
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
  const ground = (s, label) => {
    if (!s || s.floor === undefined) return;
    const dp = s.gy - s.floor;
    const bad = [];
    if (s.mossP && s.mossP.visible && Math.abs(s.mossP.y - s.mossP.floor) > 0.35) bad.push("moss " + (s.mossP.y - s.mossP.floor).toFixed(2));
    log("  ground " + label + ": player " + dp.toFixed(2) + " at " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1) + (s.player.inWater ? " (water)" : "") + (bad.length ? " BAD " + bad.join(", ") : ""));
    if (!s.player.inWater && !s.acting && s.player.grounded && Math.abs(dp) > 0.3) fallback("player not on the ground at " + label + ": " + dp.toFixed(2));
    if (bad.length) fallback("characters off the ground at " + label + ": " + bad.join(", "));
  };
  const free = (ms) => waitFor((x) => x.lock <= 0 && x.player.enabled && !x.cinema.playing, ms || 8000, "free");

  // ---------------------------------------------------------------- the beats
  async function beatIntro() {
    await sleep(700); await shot("title");
    const t = await filmWhile("intro", (x) => x.step === "intro", 1500, 40000);
    log("intro ran " + t.toFixed(1) + " s");
  }
  async function beatMemory1() {
    await waitFor((x) => x.step === "memory1" && x.player.enabled, 15000, "memory1 playable");
    await sleep(1200); await shot("m1-start"); ground(await st(), "memory1 start");
    const t0 = Date.now();
    let fpsDone = false;
    for (let k = 0; k < 12; k++) {
      const s = await st();
      if (s.step !== "memory1") break;
      const i = s.rings;
      const r = await page.evaluate((i) => { const p = window.__platy.ctx.debug.level8.ringPos[i]; return p ? { x: p.x, z: p.z } : null; }, i);
      if (!r) break;
      const res = await walk(() => r, { stop: 0.6, timeout: 15000, until: (x) => x.rings > i || x.step !== "memory1" });
      const q = await st();
      log("  ring " + (i + 1) + ": " + res + " rings " + q.rings + (q.player.swimming ? " (swimming)" : ""));
      if (q.step === "memory1") { await sleep(150); await shot("m1-ring-" + q.rings); }
      if (!fpsDone && q.rings >= 2 && q.step === "memory1") { fpsDone = true; await fpsMeasure("memory1_pool"); }
    }
    log("memory1 took " + ((Date.now() - t0) / 1000).toFixed(1) + " s");
    if ((Date.now() - t0) > 60000) fallback("memory 1 took over 60 s of play");
    await filmWhile("m1-out", (x) => x.step === "memory1", 400, 6000);
  }
  async function beatMemory2() {
    await waitFor((x) => x.step === "memory2", 10000, "memory2");
    await sleep(1500); await shot("m2-start");
    const want = [0, 2, 3];
    let wrongDone = false, shots = 0;
    const tEnd = Date.now() + 70000;
    while (Date.now() < tEnd) {
      const s = await st();
      if (s.step !== "memory2" || s.m2 === "nuzzle" || s.m2 === "freeze") break;
      if (s.m2 === "show" && shots < 6) { shots++; await sleep(900); await shot("m2-pip-shows-r" + s.round); continue; }
      if (s.m2 === "copy") {
        await sleep(400);
        if (shots < 9) { shots++; await shot("m2-your-turn-r" + s.round); log("  hint: " + s.hint); }
        let k = want[s.round];
        if (!wrongDone) { wrongDone = true; k = 1; }
        await page.keyboard.press("Digit" + (k + 1));
        await sleep(500); await shot("m2-press-" + (k + 1) + "-r" + s.round);
        await waitFor((x) => x.m2 !== "doing" && x.m2 !== "copy", 8000, "trick scored");
        const q = await st();
        log("  pressed " + (k + 1) + " in round " + s.round + " -> round " + q.round + " (" + q.m2 + ") hint '" + q.hint + "'");
        await sleep(300); await shot("m2-scored-r" + q.round);
        continue;
      }
      await sleep(150);
    }
    const s = await st();
    if (s.round < 3) fallback("memory 2: only " + s.round + " rounds copied");
    await filmWhile("m2-nuzzle", (x) => x.step === "memory2", 700, 15000);
  }
  async function beatMemory3() {
    await waitFor((x) => x.step === "memory3" && x.player.enabled, 10000, "memory3");
    await sleep(800); await shot("m3-start"); ground(await st(), "memory3");
    let i = 0, last = 0;
    await walk((s) => s.pip, { stop: 0.4, timeout: 30000, noJump: true, until: (x) => x.m3 >= 3 || x.step !== "memory3",
      each: async (s) => { if (Date.now() - last > 1800) { last = Date.now(); await shot("m3-" + (i++) + "-phase" + s.m3); } } });
    await filmWhile("m3-end", (x) => x.step === "memory3", 900, 12000);
  }
  async function beatTaken() {
    await waitFor((x) => x.step === "wake", 10000, "wake");
    await filmWhile("wake", (x) => x.step === "wake" && x.cinema.playing, 1400, 20000);
    await waitFor((x) => x.player.enabled || x.step !== "wake", 8000, "wake playable");
    await sleep(500); await shot("wake-get-up"); ground(await st(), "wake");
    await walk((s) => ({ x: s.player.x, z: s.player.z + 5 }), { stop: 0.3, timeout: 9000, noJump: true, until: (x) => x.step !== "wake" });
    await waitFor((x) => x.step === "taken", 5000, "taken");
    await filmWhile("taken-ring", (x) => x.step === "taken" && x.player.enabled, 900, 9000);
    await shot("taken-net");
    let k = 0;
    while ((await st()).step === "taken") {
      await page.keyboard.press("KeyJ"); await sleep(110);
      if (++k % 12 === 0) await shot("taken-struggle-" + k);
      if (k > 200) throw new Error("taken never ended");
    }
    log("  taken: " + k + " presses");
    await waitFor((x) => x.step === "carried" || x.step === "scream", 3000, "carried");
    k = 0; let lastShot = 0, i = 0;
    while ((await st()).step === "carried") {
      await page.keyboard.press("KeyJ"); await sleep(160); k++;
      if (Date.now() - lastShot > 1800) { lastShot = Date.now(); const s = await st(); await shot("carried-" + (i++) + "-bar" + Math.round(s.struggle * 100)); }
      if (k > 400) throw new Error("carried never ended");
    }
    let fpsDone = false;
    const t = await filmWhile("scream", (x) => x.step === "scream", 600, 30000, async (s) => { if (!fpsDone && s.screamed) { fpsDone = true; await sleep(1500); await fpsMeasure("scream"); } });
    log("scream ran " + t.toFixed(1) + " s");
  }
  let J = null;
  const JP = () => page.evaluate(() => {
    const P = window.__platy.ctx.debug.level8.jungle.P, o = {};
    for (const k of ["logIn", "logOut", "ford", "stones", "curtain", "meet", "campGate", "screamSpot"]) o[k] = { x: P[k].x, z: P[k].z };
    o.trail = P.trail.map((p) => ({ x: p.x, z: p.z }));
    return o;
  });
  async function beatGlade() {
    await waitFor((x) => x.step === "glade" && x.player.enabled, 15000, "glade playable");
    J = await JP();
    await sleep(600); await shot("glade-start"); ground(await st(), "glade");
    await fpsMeasure("glade_bodies");
    await walk(() => ({ x: 5.5, z: -17 }), { stop: 0.8, timeout: 30000, until: (x) => x.step !== "glade" });
    await waitFor((x) => x.step === "trail", 30000, "the call");
    await sleep(500); await shot("trail-call");
    // the trail, by ear (the test knows where the points are)
    const T = J.trail;
    const steps = [
      { ...T[0], stop: 1.5, until: 1 },
      { x: 2, z: -9 }, { ...T[1], stop: 2, until: 2, shot: "river-edge" },
      { x: -10, z: -3.5, shot: "ford-near" }, { x: -10, z: 0, shot: "ford-mid" }, { x: -10, z: 3.5 }, { ...T[2], stop: 2, until: 3, shot: "wet-prints" },
      { x: -16, z: 12 }, { ...T[3], stop: 2.5, until: 4, shot: "fig" },
      { ...J.logIn, stop: 0.6, shot: "log-in" }, { ...J.logOut, stop: 0.8, until: 5, shot: "log-out" },
      { x: (J.logOut.x + T[5].x) / 2, z: (J.logOut.z + T[5].z) / 2 }, { ...T[5], stop: 1.5, until: 6, shot: "curtain" },
    ];
    let fpsRiver = false;
    for (const p of steps) {
      const s0 = await st();
      if (s0.step !== "trail") break;
      if (s0.cinema.playing) await filmWhile("trail-cine", (x) => x.cinema.playing, 1200, 12000);
      await free(15000).catch(() => {});
      const r = await walk(() => p, { stop: p.stop || 0.8, timeout: 30000, until: (x) => x.step !== "trail" || (p.until && x.trail >= p.until) });
      const s = await st();
      if (r === "stuck" || r === "timeout") { fallback("trail: " + r + " walking to " + JSON.stringify(p) + " at " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1)); await shot("trail-" + r); }
      if (p.until && s.step === "trail" && s.trail < p.until) { await sleep(1000); if ((await st()).trail < p.until) fallback("trail point " + (p.until - 1) + " not reached (trail " + s.trail + ")"); }
      if (p.shot) { await sleep(250); await shot("trail-" + p.shot + "-t" + s.trail); ground(await st(), "trail " + p.shot); }
      if (!fpsRiver && p.shot === "ford-mid") { fpsRiver = true; await fpsMeasure("river_ford"); }
      log("  trail -> " + JSON.stringify({ x: p.x, z: p.z }) + " " + r + ", trail " + s.trail + ", moss " + s.moss);
    }
    await waitFor((x) => x.step !== "trail", 20000, "trail done");
  }
  async function beatMeet() {
    await waitFor((x) => x.step === "meet" && x.meet === "curtain", 10000, "meet");
    J = J || await JP();
    await walk(() => ({ x: J.curtain.x, z: J.curtain.z - 1.3 }), { stop: 0.5, timeout: 15000, until: (x) => x.meet !== "curtain" });
    await sleep(300);
    let s = await st();
    await shot("meet-curtain-prompt");
    if (!/Push/.test(s.actionLabel) && s.meet === "curtain") fallback("no 'Push through' prompt at the curtain (" + s.actionLabel + ")");
    if (s.meet === "curtain") await page.keyboard.press("KeyE");
    await waitFor((x) => x.meet === "cine" || x.meet === "greet", 4000, "meet cutscene");
    await filmWhile("meet", (x) => x.meet === "cine", 1300, 30000);
    s = await waitFor((x) => x.meet === "greet", 5000, "greet prompt");
    await sleep(500); await shot("meet-greet-prompt");
    if (!/Greet/.test(s.actionLabel)) fallback("no Greet prompt (" + s.actionLabel + ")");
    await page.keyboard.press("KeyE");
    await sleep(700); await shot("meet-bow");
    await filmWhile("meet-after", (x) => x.step === "meet", 1100, 10000);
  }
  async function beatFollow() {
    await waitFor((x) => x.step === "follow" && x.player.enabled, 10000, "follow");
    J = J || await JP();
    await sleep(400); await shot("follow-start"); ground(await st(), "follow");
    let last = Date.now(), i = 0;
    const r = await walk((s) => s.mossP && Math.hypot(s.mossP.x - s.player.x, s.mossP.z - s.player.z) > 1.0 ? s.mossP : { x: J.campGate.x, z: J.campGate.z },
      { stop: 0.2, timeout: 60000, until: (x) => x.step !== "follow", each: async () => { if (Date.now() - last > 2000) { last = Date.now(); await shot("follow-" + (i++)); } } });
    log("  follow: " + r);
    if ((await st()).step === "follow") fallback("follow did not reach the camp");
    let fpsDone = false;
    await filmWhile("reveal", (x) => x.step === "reveal", 1300, 40000, async (s) => { if (!fpsDone && s.camp) { fpsDone = true; await sleep(3000); await fpsMeasure("reveal_camp"); } });
    await filmWhile("end", (x) => x.step === "end", 700, 6000);
    await waitFor((x) => x.step === "done", 10000, "the level card");
    const vis = await page.waitForFunction(() => document.getElementById("victory").classList.contains("on"), { timeout: 10000 }).then(() => true, () => false);
    if (!vis) fallback("no level complete card");
    await sleep(1200); await shot("complete-card");
    await page.click("#again");
  }

  const backToMenu = async (label) => {
    const s = await waitFor((x) => x.mode === "menu", 30000, "main screen " + label);
    if (s.running) throw new Error("the level is still running behind the main screen");
    return s;
  };
  const enterLevel = async (label) => {
    await page.evaluate(() => { window.__platy.startLevel(8); });
    return waitFor((x) => x.mode === "level" && x.levelN === 8 && x.step === "intro", 40000, label);
  };

  let s;
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
    const gpu = await page.evaluate(() => { const gl = window.__platy.renderer.getContext(); const e = gl.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; });
    log("gpu: " + gpu);
    await page.evaluate(() => { window.__platy.resetProgress(); window.__platy.unlock(8); });
    await sleep(500);
    await shot("menu");
    if (await page.evaluate(() => document.getElementById("lvl8").classList.contains("locked"))) throw new Error("level 8 is locked after unlock(8)");
    await page.click("#lvl8");
    s = await waitFor((x) => x.mode === "level" && x.levelN === 8, 40000, "level 8 running");
    const beats = [["intro", beatIntro], ["memory1", beatMemory1], ["memory2", beatMemory2], ["memory3", beatMemory3], ["wake", beatTaken], ["glade", beatGlade], ["meet", beatMeet], ["follow", beatFollow]];
    const first = ONLY || FROM || "intro";
    if (first !== "intro") { await sleep(1500); const ok = await page.evaluate((b) => window.__platy.skipTo(b), first); if (!ok) throw new Error("skipTo " + first + " failed"); await sleep(800); }
    for (const [name, fn] of beats) {
      if (ORDER.indexOf(name) < ORDER.indexOf(first)) continue;
      if (ONLY && name !== ONLY) break;
      log("== " + name);
      await fn();
      await upAll();
      if (UNTIL === name) break;
    }
    if (UNTIL) { await shot("until-end"); report.ok = true; }
    else if (ONLY && ONLY !== "follow") await shot("only-end");
    else {
      s = await backToMenu("after the level card");
      if (!s.progress.beaten[7]) throw new Error("level 8 is not marked beaten: " + JSON.stringify(s.progress));
      await sleep(1800); await shot("menu-level8-beaten");
      const tick = await page.evaluate(() => { const b = document.getElementById("lvl8"), c = document.getElementById("lvl9"); return { cls: b.className, next: c ? c.className : "?" }; });
      log("level complete -> main screen; " + JSON.stringify(tick) + ", progress " + JSON.stringify(s.progress));
      if (!/beaten|done/.test(tick.cls)) fallback("the level 8 circle does not show as beaten (class '" + tick.cls + "')");
      if (s.progress.unlocked < 9) fallback("level 9 was not unlocked: " + s.progress.unlocked);
      report.completed = true;
    }

    if (!ONLY && !FROM && !PLAY && !UNTIL) {
      await enterLevel("win on title");
      await sleep(800);
      if (await page.evaluate(() => window.__platy.skipTo("nonsense"))) fallback("skipTo('nonsense') returned true");
      await page.evaluate(() => window.__platy.win());
      await sleep(1200); await shot("win-on-title");
      await page.click("#again");
      await backToMenu("after win() on the title");
      await enterLevel("skip chain");
      for (const b of ["memory1", "memory2", "memory3", "wake", "taken", "carried", "scream", "glade", "trail", "meet", "follow", "reveal", "memory2", "trail", "intro", "glade"]) {
        const ok = await page.evaluate((x) => window.__platy.skipTo(x), b);
        if (!ok) throw new Error("skipTo " + b + " failed");
        await sleep(2600);
        s = await st();
        await shot("skipTo-" + b + "-" + s.step);
        if (["memory3", "glade", "trail", "meet", "follow"].includes(b)) ground(s, "skipTo " + b);
      }
      log("skipTo chain ok");
      await page.evaluate(() => window.__platy.quit());
      await backToMenu("after quitting");
      s = await enterLevel("re-entry");
      if (s.screamed || s.timeScale !== 1 || s.jungle || s.camp) throw new Error("re-entry is not clean: " + JSON.stringify({ sc: s.screamed, ts: s.timeScale, j: s.jungle, c: s.camp }));
      await page.evaluate(() => window.__platy.win());
      await sleep(800); await page.click("#again");
      await backToMenu("after win()");
      log("quit, re-entry, win() ok");
      // phone portrait + landscape
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true });
      await page.evaluate(() => { document.body.classList.add("touch"); });
      await sleep(600);
      await enterLevel("phone");
      await sleep(4000); await shot("phone-portrait-intro");
      for (const b of ["memory1", "memory2", "taken", "trail", "meet", "reveal"]) {
        await page.evaluate((x) => window.__platy.skipTo(x), b);
        await sleep(b === "memory2" ? 6000 : 3000);
        await shot("phone-portrait-" + b);
      }
      await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, hasTouch: true });
      await sleep(600);
      for (const b of ["memory2", "carried", "trail"]) {
        await page.evaluate((x) => window.__platy.skipTo(x), b);
        await sleep(b === "memory2" ? 6000 : 3000);
        await shot("phone-landscape-" + b);
      }
      await page.evaluate(() => window.__platy.win());
      await sleep(800); await page.tap("#again");
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
    try { await upAll(); await shot("failure"); const q = await st(); console.log(JSON.stringify(q).slice(0, 3000)); } catch (_) {}
  }
  try {
    const sp = await browser.newPage();
    await sp.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    const files = report.shots.filter((f) => fs.existsSync(f));
    for (let i = 0, k = 1; i < files.length; i += 4, k++) {
      const cells = files.slice(i, i + 4).map((f) => "<div><img src='data:image/png;base64," + fs.readFileSync(f).toString("base64") + "'><span>" + path.basename(f, ".png") + "</span></div>").join("");
      await sp.setContent("<style>body{margin:0;background:#222;display:grid;grid-template-columns:640px 640px;grid-auto-rows:360px}div{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}img{max-width:640px;max-height:360px}span{position:absolute;left:4px;top:2px;font:bold 13px monospace;color:#ff0;text-shadow:0 0 3px #000,0 0 3px #000}</style>" + cells, { waitUntil: "load" });
      await sp.screenshot({ path: path.join(SHOTS, "l8-sheet-" + String(k).padStart(2, "0") + ".png") });
    }
  } catch (e) { console.log("contact sheets failed: " + e); }

  await browser.close();
  srv.close();
  fs.writeFileSync(path.join(SHOTS, "l8-report.json"), JSON.stringify(report, null, 2));
  console.log("fallbacks: " + report.fallbacks.length);
  for (const f of report.fallbacks) console.log("  " + f);
  console.log("errors: " + errors.length);
  for (const e of errors.slice(0, 30)) console.log("  " + e.slice(0, 600));
  console.log(report.ok ? "PLAYTEST-L8 OK" : "PLAYTEST-L8 FAILED");
  process.exit(report.ok && errors.length === 0 ? 0 : 1);
})();
