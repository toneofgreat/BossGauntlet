// Level 12 "THE VOLCANO": full browser playthrough (modelled on playtest-l11.cjs).
//   node tools/playtest-l12.cjs               the whole level (real keys), then the extra checks
//   node tools/playtest-l12.cjs --play        only the playthrough (about 9-10 min: on a 10-minute budget run it in two parts)
//   node tools/playtest-l12.cjs --play1       intro .. boss3 (the volcano and MAGMOR)
//   node tools/playtest-l12.cjs --play2       potion .. missing (the potion, the wind duet, the camp, the night)
//   node tools/playtest-l12.cjs --extras      only the checks (every skipTo beat: objective, marker, budget, load time; win())
//   node tools/playtest-l12.cjs --from=boss1  start the real playthrough at a beat (skipTo)
//   node tools/playtest-l12.cjs --only=noon   play just that beat
// The playing is real keys (WASD, Space, E, J, Q, R, 1-4, Enter to skip cutscenes); the seam reads state, aims the
// follow camera and (only where a walk gets stuck, logged) teleports.
// Screenshots: tools/shots/l12-NNN-name.png.
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const arg = (k) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=")[1] : null; };
const PLAY1 = process.argv.includes("--play1"), PLAY2 = process.argv.includes("--play2");
const FROM = arg("from") || (PLAY2 ? "potion" : null), UNTIL = arg("until") || (PLAY1 ? "boss3" : null), ONLY = arg("only"), PLAY = process.argv.includes("--play") || PLAY1 || PLAY2, EXTRAS = process.argv.includes("--extras");
// --head=src/audio.js serves those files from git HEAD (when another builder's copy is mid-edit)
const HEAD = new Map((arg("head") || "").split(",").filter(Boolean).map((f) => ["/" + f, require("child_process").execSync("git show HEAD:platypus/" + f, { cwd: ROOT, maxBuffer: 64 << 20 })]));
const PRE = "l12-" + (PLAY1 ? "p1-" : PLAY2 ? "p2-" : FROM ? FROM + "-" : ONLY ? ONLY + "-" : EXTRAS ? "x-" : "");
const BEATS = ["intro", "travel", "spell", "dream", "wake", "boss1", "boss2", "boss3", "potion", "winddance", "dinner", "morning", "noon", "night", "bed", "missing"];
const HOOKS = BEATS.slice(1);

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      if (HEAD.has(p)) { res.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" }); res.end(HEAD.get(p)); return; }
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
  for (const f of fs.readdirSync(SHOTS)) if (f.startsWith(PRE)) fs.unlinkSync(path.join(SHOTS, f));
  const srv = await serve();
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
    defaultViewport: { width: 1280, height: 720 },
  });
  const LIMIT = +(arg("limit") || 560) * 1000;
  let page = null;
  setTimeout(async () => { console.log("WATCHDOG: " + LIMIT / 1000 + " s, closing"); try { await page.screenshot({ path: path.join(SHOTS, PRE + "watchdog.png") }); } catch (_) {} try { await browser.close(); } catch (_) {} srv.close(); process.exit(2); }, LIMIT).unref();
  const errors = [];
  const report = { steps: [], errors, fallbacks: [], seamTeleports: [], budget: {}, fails: [] };
  let n = 0;
  page = await browser.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + (e.stack || e.message || e)));
  page.on("console", (m) => { if (((m.location && m.location()) || {}).url && m.location().url.includes("/api/platypus/")) return; if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });
  page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url()));

  const T0 = Date.now();
  const log = (m) => { m = "[" + ((Date.now() - T0) / 1000).toFixed(0).padStart(3) + "s] " + m; report.steps.push(m); console.log(m); };
  const fail = (m) => { report.fails.push(m); log("FAIL: " + m); };
  const fallback = (m) => { report.fallbacks.push(m); log("FALLBACK: " + m); };
  const shot = async (name) => { n++; const f = path.join(SHOTS, PRE + String(n).padStart(3, "0") + "-" + name + ".png"); await page.screenshot({ path: f }); return f; };
  let maxCalls = 0, maxTris = 0, maxWhere = "";
  const st = async () => {
    const s = await page.evaluate(() => {
      const d = window.__platy; if (!d) return null;
      const s = d.state();
      s.obj = (document.getElementById("objective") || {}).textContent || "";
      s.dead = !!d.ctx.health.dead;
      s.respawning = !!d.ctx.checkpoint.respawning;
      s.playing = d.cinema.playing;
      s.faded = d.cinema.faded;
      s.grounded = d.player.grounded; s.py = d.player.y; s.swim = d.player.swimming; s.dive = d.player.diving; s.wet = d.player.inWater;
      s.worldName = d.world ? d.world.name : "";
      const L = d.ctx.debug.level12;
      if (L && s.levelN === 12) {
        const f = L.friend; s.pip = { x: f.x, z: f.z, b: f.behaviour };
        s.floor = d.world && d.world.heightAt ? d.world.heightAt(d.player.x, d.player.z) : 0;
      }
      return s;
    });
    if (s && s.render && s.mode === "level") {
      if (s.render.calls > maxCalls) { maxCalls = s.render.calls; maxWhere = s.step; }
      if (s.render.triangles > maxTris) maxTris = s.render.triangles;
      const b = report.budget[s.step] || (report.budget[s.step] = { calls: 0, tris: 0 });
      if (s.render.calls > b.calls) b.calls = s.render.calls;
      if (s.render.triangles > b.tris) b.tris = s.render.triangles;
    }
    return s;
  };
  const waitFor = async (pred, ms, label) => {
    const t0 = Date.now();
    for (;;) {
      const s = await st();
      if (s && pred(s)) return s;
      if (Date.now() - t0 > ms) throw new Error("timeout waiting for " + label + " (step=" + (s && s.step) + " obj=" + (s && s.obj) + ")");
      await sleep(100);
    }
  };
  const keys = new Set();
  const down = async (k) => { if (!keys.has(k)) { keys.add(k); await page.keyboard.down(k); } };
  const up = async (k) => { if (keys.has(k)) { keys.delete(k); await page.keyboard.up(k); } };
  const upAll = async () => { for (const k of Array.from(keys)) await up(k); };
  const press = (k) => page.keyboard.press(k);
  const aimAt = (x, z) => page.evaluate((x, z) => { const d = window.__platy, p = d.player; d.cam.yaw = Math.atan2(x - p.x, z - p.z); d.cam.manualT = 1.5; }, x, z);
  const tp = async (x, z, why) => { report.seamTeleports.push(why || ""); log("  seam tp -> " + x.toFixed(1) + "," + z.toFixed(1) + " (" + why + ")"); await page.evaluate((x, z) => window.__platy.tp(x, z), x, z); await sleep(300); };
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  async function walk(target, o) {
    o = o || {};
    const stop = o.stop === undefined ? 0.5 : o.stop, tEnd = Date.now() + (o.timeout || 15000);
    let lastX = 1e9, lastZ = 1e9, lastT = Date.now(), jumps = 0, res = "timeout", detourT = 0, detourSide = 1;
    for (;;) {
      const s = await st();
      if (!s || (o.until && o.until(s))) { res = "until"; break; }
      if (s.dead || s.respawning) { res = "died"; break; }
      const t = await target(s);
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
        else if (!o.noJump) { await press("Space"); lastT = Date.now(); }
      }
      await sleep(50);
    }
    await up("KeyW");
    return res;
  }
  async function go(p, o, why) {
    const r = await walk(() => p, o);
    if (r === "stuck" || r === "timeout") {
      const s = await st();
      fallback("walk " + r + " to " + (why || JSON.stringify(p)) + " from " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1));
      await shot("stuck-" + (why || "walk").replace(/\W+/g, "_"));
      await tp(p.x, p.z, why);
    }
    return r;
  }
  // hold Enter to skip a playing cutscene
  async function skipCine(label) {
    const s = await st();
    if (!s.playing) return false;
    await down("Enter"); await sleep(1300); await up("Enter");
    await sleep(600);
    log("  skipped cutscene " + (label || ""));
    return true;
  }
  async function waitCine(ms) { await waitFor((s) => !s.playing && s.player.enabled, ms || 30000, "cutscene end"); }
  const fpsOnce = () => page.evaluate(() => new Promise((res) => {
    const gaps = []; let last = performance.now(); const t0 = last;
    function f(t) { gaps.push(t - last); last = t; if (t - t0 < 2500) requestAnimationFrame(f); else { gaps.sort((a, b) => a - b); res({ fps: gaps.length / ((t - t0) / 1000), p95: gaps[(gaps.length * 0.95) | 0] }); } }
    requestAnimationFrame(f);
  }));

  // =========================================================================================== start
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
  await E(() => { window.__platy.unlockAll(); });
  const startL12 = async () => {
    try {
    await E(() => window.__platy.startLevel(12));
    await page.waitForFunction(() => { const s = window.__platy.state(); return s.mode === "level" && s.levelN === 12; }, { timeout: 60000 });
    } catch (e) { console.log("START FAILED; errors: " + errors.join(" | ")); throw e; }
  };

  // ------------------------------------------------------------------------- the beats, played
  const L12 = (fnBody) => E(new Function("const d = window.__platy, L = d.ctx.debug.level12; " + fnBody));
  async function playIntro() {
    await waitFor((s) => s.step === "intro" && s.playing, 20000, "flight cutscene");
    await sleep(3500);
    await shot("flight");
    await skipCine("flight");
    await waitFor((s) => s.step === "travel" && s.player.enabled, 20000, "travel");
  }
  async function playTravel() {
    await shot("slope");
    const P = await L12("const P = L.volcano.P; return { path: P.path, shrine: P.shrine, ch: P.channels, vents: L.volcano.vents.map(v => ({ x: v.x, z: v.z })) };");
    const pts = P.path.filter((p) => p.z > 2).concat([P.shrine]);
    let deaths = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      for (let tries = 0; tries < 4; tries++) {
        const r = await walk(() => p, {
          stop: 1.2, timeout: 20000, noDetour: true,
          until: (s) => s.step !== "travel",
          each: async (s) => {
            // jump each lava channel just before it
            for (const c of P.ch) {
              const px = (z) => 7 * Math.sin(z * 0.045), ax = px(c.z) + 8.6, az = c.z + 1.6, bx = px(c.z) - 6.6, bz = c.z - 1.6;
              const sd = (x, z) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz; let t = ((x - ax) * dx + (z - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(ax + dx * t - x, az + dz * t - z); };
              const y = s.player.yaw, d0 = sd(s.player.x, s.player.z), d1 = sd(s.player.x + Math.sin(y) * 0.5, s.player.z + Math.cos(y) * 0.5);
              if (s.grounded && d0 < 1.45 && d0 > 0.75 && d1 < d0) await press("Space");
            }
            // wait for a puffing vent
            for (const v of P.vents) { const dz = v.z - s.player.z; if (dz > 0.5 && dz < 2.6 && Math.abs(v.x - s.player.x) < 2.4) { const puffing = await L12("return L.volcano.vents.some(v => v.puffing && Math.hypot(v.x - d.player.x, v.z - d.player.z) < 4.5);"); if (puffing) { await up("KeyW"); await sleep(700); } } }
          },
        });
        if (r === "died") { deaths++; const q = await st(); log("  died on the slope (" + deaths + ") at " + q.player.x.toFixed(1) + "," + q.player.z.toFixed(1) + " y " + q.py.toFixed(2)); if (deaths === 1) await shot("slope-death"); await waitFor((s) => !s.respawning && s.player.enabled, 8000, "respawn"); continue; }
        if (r === "until") break;
        if (r === "stuck" || r === "timeout") { fallback("slope walk " + r + " to " + i); await tp(p.x, p.z, "slope " + i); }
        break;
      }
      const s = await st();
      if (s.step !== "travel") break;
      if (i === 2) await shot("slope-mid");
    }
    report.slopeDeaths = deaths;
    await waitFor((s) => s.step === "spell", 8000, "spell");
  }
  async function playSpell() {
    await shot("shrine");
    // listen: record the order the runes light during the demo
    const order = [];
    const t0 = Date.now();
    await waitFor((s) => s.demoOn, 10000, "the song");
    let prev = -1;
    while (Date.now() - t0 < 14000) {
      const r = await L12("const q = d.level().state(); return { lit: q.demoLit, demo: q.demoOn };");
      if (r.lit >= 0 && r.lit !== prev) order.push(r.lit);
      prev = r.lit;
      if (!r.demo && order.length >= 5) break;
      await sleep(40);
    }
    log("  heard the song: " + order.join(" "));
    if (order.length !== 5) fail("the song order was not readable: " + order.join(","));
    const runes = await L12("return L.volcano.runes.map(r => ({ x: r.x, z: r.z }));");
    const bedP = await L12("return L.volcano.P.bed;");
    for (const i of order) {
      const r = runes[i];
      const tx = r.x + (bedP.x - r.x) * 0.25, tz = r.z + (bedP.z - r.z) * 0.25;
      await go({ x: tx, z: tz }, { stop: 0.5, timeout: 9000 }, "rune " + i);
      await waitFor((s) => s.action === "Touch", 3000, "Touch prompt");
      await press("KeyE");
      await sleep(700);
    }
    await waitFor((s) => s.spellDone, 3000, "spell done");
    await shot("runes-lit");
    await sleep(1400);
    await go({ x: bedP.x, z: bedP.z - 0.6 }, { stop: 0.6, timeout: 8000 }, "bed");
    await waitFor((s) => s.action === "Sleep", 4000, "Sleep prompt");
    await press("KeyE");
    await waitFor((s) => s.step === "dream" && s.player.enabled && !s.playing, 25000, "dream");
  }
  async function playDream() {
    await sleep(800);
    await shot("dream");
    const W = [{ x: -3, z: -2 }, { x: 2.5, z: 4 }, { x: 0, z: 9 }];
    for (const w of W) await go(w, { stop: 1.5, timeout: 12000 }, "dream way");
    await go({ x: 0, z: 9.2 }, { stop: 0.6, timeout: 6000 }, "to Pip");
    await waitFor((s) => s.action === "Wake up Pip!", 4000, "wake prompt");
    await shot("dream-pip");
    for (let i = 0; i < 3; i++) { await press("KeyE"); await sleep(1300); }
    await waitFor((s) => s.wakes >= 3, 3000, "3 wakes");
    await sleep(3500);
    await shot("pip-wakes");
    await waitFor((s) => s.step === "wake", 25000, "wake");
  }
  async function playWake() {
    await skipCine("wake");
    await waitFor((s) => s.step === "wake" && s.player.enabled && !s.playing, 15000, "climb");
    const c = await L12("return L.volcano.P.crater;");
    let hits = 0;
    await shot("climb");
    for (let k = 0; k < 4; k++) {
      const r = await walk(() => c, { stop: 3.5, timeout: 25000, until: (s) => s.step !== "wake" });
      if (r === "died") { hits++; await waitFor((s) => !s.respawning && s.player.enabled, 8000, "respawn"); continue; }
      if (r === "stuck" || r === "timeout") { fallback("crater walk " + r); await tp(c.x, c.z - 3, "crater"); }
      break;
    }
    await waitFor((s) => s.step === "rim", 8000, "rim");
    await waitFor((s) => s.playing, 8000, "rim cutscene");
    await sleep(3000); await shot("rim-cage");
    await sleep(9500); await shot("magmor-rises");
    await waitFor((s) => s.step === "boss1" && s.player.enabled, 30000, "boss1");
  }
  // ---- MAGMOR ----
  async function bossInfo() {
    return L12(`const M = L.magmor, V = L.volcano, a = L.atk;
      return { phase: M.phase, attack: M.attack, atk: { name: a.name, x: a.x, z: a.z, age: d.ctx.time.now - a.at, t: a.t },
        crystals: M.crystals.map(c => ({ i: c.i, x: c.x, z: c.z, glow: c.glowing, broken: c.broken })),
        vents: M.vents.map(v => ({ i: v.i, x: v.x, y: v.y, z: v.z, open: v.open, plugged: v.plugged })),
        flowers: M.flowers.filter(f => f.on).map(f => ({ x: f.x, z: f.z })), core: M.core.open,
        drafts: V.updrafts.map(u => ({ i: u.i, x: u.x, z: u.z, on: u.on, isl: u.island })),
        islands: V.islands.map(o => ({ x: o.x, z: o.z, r: o.r, up: o.above })), bridges: V.bridges.map(q => ({ a: q.a, b: q.b, ok: q.intact, mx: (q.ax + q.bx) / 2, mz: (q.az + q.bz) / 2 })), lavaY: V.lavaY, defeated: M.defeated, hp: M.hp, ride: L.ride ? L.ride.stage : "" };`);
  }
  // step out of a telegraphed circle: to the far side of our island from its centre (or onto the nearest island)
  async function dodge(b, s) {
    const a = b.atk;
    if (!(a.age < a.t + 0.2)) return false;
    const P = s.player;
    if (a.name === "sweep") { if (a.age > a.t - 0.1 && a.age < a.t + 1.2) { await press("Space"); await sleep(640); } return true; }
    if (a.name === "wave" || a.name === "ringslam") {
      // the ring rolls out from the boss at 9 m/s from 7 m: jump as it reaches us
      const d = Math.hypot(P.x - 0, P.z - 8), hitAt = a.t + (d - 7) / 9;
      if (a.age > hitAt - 0.35 && a.age < hitAt + 0.2) { await press("Space"); await sleep(500); }
      return a.age < hitAt + 0.3;
    }
    if (a.name === "slam" || a.name === "double" || a.name === "grab") {
      const d0 = Math.hypot(P.x - a.x, P.z - a.z);
      if (d0 > 5.6 && a.name !== "grab") return false;
      // out along a bridge from the island we stand on (never straight over the lava)
      let isl = 0, id = 1e9;
      b.islands.forEach((o, i) => { const dd = Math.hypot(P.x - o.x, P.z - o.z) - o.r; if (dd < id) { id = dd; isl = i; } });
      let route = null, far = -1;
      for (const q of b.bridges) {
        if (!q.ok || (q.a !== isl && q.b !== isl)) continue;
        const other = b.islands[q.a === isl ? q.b : q.a];
        if (!other.up) continue;
        const dd = Math.hypot(q.mx - a.x, q.mz - a.z) + Math.hypot(other.x - a.x, other.z - a.z) * 0.5;
        if (dd > far) { far = dd; route = [{ x: q.mx, z: q.mz }, { x: other.x, z: other.z }]; }
      }
      const need = a.name === "grab" ? 6.6 : 5.8;
      if (route) for (const w of route) { const r = await walk(() => w, { stop: 0.6, timeout: 2200, noJump: true, noDetour: true, until: (q) => Math.hypot(q.player.x - a.x, q.player.z - a.z) > need }); if (r === "until") break; }
      return true;
    }
    return false;
  }
  async function playBoss1() {
    await shot("boss1");
    const t0 = Date.now();
    let deaths = 0;
    while (Date.now() - t0 < 150000) {
      const s = await st();
      if (s.step !== "boss1") break;
      if (s.dead || s.respawning) { deaths++; await waitFor((q) => !q.respawning && q.player.enabled, 8000, "respawn"); continue; }
      if (!s.bossOn) { await sleep(200); continue; }
      const b = await bossInfo();
      if (Date.now() - (playBoss1.lt || 0) > 4000) { playBoss1.lt = Date.now(); log("    b1 atk " + b.atk.name + " age " + b.atk.age.toFixed(1) + " act " + b.attack + " p " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1) + " hp " + s.hp + " cr " + b.crystals.map((c) => (c.broken ? "X" : c.glow ? "G" : "-") + c.x.toFixed(0) + "," + c.z.toFixed(0)).join(" ")); }
      if (await dodge(b, s)) continue;
      const c = b.crystals.find((q) => q.glow && !q.broken);
      if (c) {
        const fist = b.atk.name === "slam" ? { x: b.atk.x, z: b.atk.z } : c;
        if (Math.hypot(fist.x - s.player.x, fist.z - s.player.z) > 3.2) await walk(() => fist, { stop: 2.8, timeout: 2600, noDetour: true, noJump: true });
        await aimAt(c.x, c.z);
        await press("KeyJ"); await sleep(480);
        continue;
      }
      // stand on the side whose fist still has crystals (x < 0 brings the right fist down)
      const rLeft = b.crystals.some((q) => q.i >= 2 && !q.broken);
      const o = { x: b.islands[0].x + (rLeft ? -1.8 : 1.8), z: b.islands[0].z + 1.2 };
      if (Math.hypot(s.player.x - o.x, s.player.z - o.z) > 2.2) await walk(() => o, { stop: 1.5, timeout: 1200, noDetour: true });
      await sleep(120);
    }
    report.boss1Deaths = deaths;
    log("  hurt by: " + JSON.stringify((await st()).hurtBy));
    await waitFor((s) => s.step === "boss2", 20000, "boss2");
    log("  phase 1 done (" + deaths + " deaths)");
  }
  async function playBoss2() {
    await shot("boss2");
    const t0 = Date.now();
    let deaths = 0, throws = 0;
    while (Date.now() - t0 < 160000) {
      const s = await st();
      if (s.step !== "boss2") break;
      if (s.dead || s.respawning) { deaths++; await waitFor((q) => !q.respawning && q.player.enabled, 8000, "respawn"); continue; }
      if (!s.bossOn) { await sleep(200); continue; }
      const b = await bossInfo();
      if (await dodge(b, s)) continue;
      if (Date.now() - (playBoss2.lt || 0) > 4000) { playBoss2.lt = Date.now(); log("    b2 atk " + b.atk.name + " p " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1) + " hp " + s.hp + " pot " + s.potions + " vents " + b.vents.map((v) => (v.plugged ? "P" : v.open ? "O" : "-") + v.x.toFixed(0) + "," + v.y.toFixed(0) + "," + v.z.toFixed(0)).join(" ") + " fl " + b.flowers.length); }
      const v = b.vents.find((q) => q.open && !q.plugged);
      if (s.potions === 0 && b.flowers.length) {
        let f = b.flowers[0], fd = 1e9;
        for (const q of b.flowers) { const dd = Math.hypot(q.x - s.player.x, q.z - s.player.z); if (dd < fd) { fd = dd; f = q; } }
        await walk(() => f, { stop: 0.7, timeout: 2500 });
        continue;
      }
      if (v && s.potions > 0) {
        // face the boss, then hold Q (the aim snaps to the open vent in front) and let go
        await aimAt(v.x, v.z); await down("KeyW"); await sleep(120); await up("KeyW");
        await down("KeyQ"); await sleep(450); await up("KeyQ");
        throws++;
        await sleep(1400);
        continue;
      }
      await sleep(150);
    }
    report.boss2 = { deaths, throws };
    await waitFor((s) => s.step === "boss3", 20000, "boss3");
    log("  phase 2 done (" + deaths + " deaths, " + throws + " throws)");
  }
  async function playBoss3() {
    await shot("boss3");
    const t0 = Date.now();
    let deaths = 0, rides = 0;
    while (Date.now() - t0 < 170000) {
      const s = await st();
      if (s.step !== "boss3" || s.defeated) break;
      if (s.dead || s.respawning) { deaths++; if (deaths < 9) log("    b3 died at " + s.player.x.toFixed(1) + "," + s.py.toFixed(1) + "," + s.player.z.toFixed(1) + " hp " + s.hp + " dead " + s.dead + " hurt " + JSON.stringify(s.hurtBy) + " riding " + s.riding); await waitFor((q) => !q.respawning && q.player.enabled, 8000, "respawn"); continue; }
      if (!s.bossOn) { await sleep(200); continue; }
      const b = await bossInfo();
      if (Date.now() - (playBoss3.lt || 0) > 3000) { playBoss3.lt = Date.now(); log("    b3 atk " + b.atk.name + " p " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1) + " y " + s.py.toFixed(1) + " hp " + s.hp + " ride " + b.ride + " core " + b.core + " bhp " + b.hp.toFixed(2) + " drafts " + b.drafts.map((u) => (u.on ? "O" : "-") + u.x.toFixed(0) + "," + u.z.toFixed(0)).join(" ") + " lava " + b.lavaY.toFixed(1)); }
      if (b.ride) {
        if (b.core && b.ride !== "down") { await down("KeyR"); await sleep(900); await up("KeyR"); await sleep(700); if (rides === 1) await shot("scream-core"); }
        else await sleep(150);
        continue;
      }
      if (await dodge(b, s)) continue;
      let u = null, ud = 1e9;
      // the ring has no bridges: only the column on our own island is reachable on foot
      for (const q of b.drafts) { const dd = Math.hypot(q.x - s.player.x, q.z - s.player.z); if (dd < ud) { ud = dd; u = q; } }
      if (!u || ud > 4.5 || !u.on) { if (u && ud < 4.5 && ud > 1.2) await walk(() => u, { stop: 0.8, timeout: 1500, noJump: true, noDetour: true }); else await sleep(200); continue; }
      const r = await walk(() => u, { stop: 0.8, timeout: 5000 });
      if (r === "stuck" || r === "timeout") { fallback("updraft walk " + r); await tp(u.x, u.z, "updraft " + u.i); }
      const q = await st();
      if (q.grounded && Math.hypot(u.x - q.player.x, u.z - q.player.z) < 2.0) { await press("Space"); rides++; await sleep(600); }
    }
    report.boss3 = { deaths, rides };
    log("  phase 3: " + rides + " rides, " + deaths + " deaths");
    await waitFor((s) => s.defeated, 5000, "defeated");
    await sleep(5000); await shot("magmor-cools");
    await waitFor((s) => s.step === "potion", 25000, "potion");
  }
  async function playPotion() {
    await skipCine("bridge");
    await waitFor((s) => s.step === "potion" && s.player.enabled && !s.playing, 20000, "potion walk");
    await shot("bridge");
    await go({ x: 0, z: -20 }, { stop: 1.0, timeout: 15000, noDetour: true }, "bridge half");
    await go({ x: 0, z: -1.9 }, { stop: 0.6, timeout: 12000, noDetour: true }, "cage");
    { const s0 = await st(); log("  at cage: player " + s0.player.x.toFixed(2) + "," + s0.player.z.toFixed(2) + " y " + s0.player.y.toFixed(2) + " action " + s0.action); }
    await waitFor((s) => s.action === "Give", 4000, "Give prompt");
    await press("KeyE");
    await sleep(6000); await shot("pip-drinks");
    await sleep(5000); await shot("pip-golden");
    await waitFor((s) => s.step === "winddance", 40000, "winddance");
  }
  async function playWind() {
    await waitFor((s) => s.dance, 10000, "dance");
    let pressed = 0, shotDone = false;
    for (;;) {
      const r = await L12(`const D = L.dance; if (!D) return null; if (D.done) return { done: true };
        let best = null; for (const n of D.notes) { if (n.call || n.judged) continue; if (!best || n.t < best.t) best = n; }
        return { done: false, now: D.t, next: best ? { t: best.t, lane: best.lane } : null };`);
      if (!r || r.done) break;
      if (!r.next) { await sleep(100); continue; }
      const wait = r.next.t - r.now;
      if (wait > 0.5) { await sleep(Math.min(400, (wait - 0.45) * 1000)); continue; }
      if (wait > 0.02) await sleep(wait * 1000 - 12);
      await press("Digit" + (r.next.lane + 1));
      pressed++;
      if (!shotDone && pressed === 9) { shotDone = true; await shot("wind-dance"); }
      await sleep(30);
    }
    const s = await st();
    log("  dance: " + s.dance.hits + " / " + s.dance.total + " (pressed " + pressed + ")");
    report.dance = s.dance;
    if (s.dance.hits < s.dance.total * 0.7) fail("dance hits too low: " + s.dance.hits + "/" + s.dance.total);
    await waitFor((s) => s.step === "dinner", 20000, "dinner");
  }
  async function playDinner() {
    await skipCine("camp");
    await waitFor((s) => s.step === "dinner" && s.player.enabled && !s.playing, 15000, "dinner walk");
    await shot("dinner");
    for (let k = 0; k < 3; k++) {
      const fp = await L12("const T = L.tribe.food; const o = {x:0,y:0,z:0}; for (let i = 0; i < 3; i++) if (T.active(i)) { const s = d.level().state(); T.pos(i, o); const p = d.player; if (Math.hypot(o.x - 20, o.z - 73) > 0 && !(L.__given || []).includes(i)) return { i, x: o.x, z: o.z }; } return null;");
      const food = await L12("const T = L.tribe.food, o = { x: 0, y: 0, z: 0 }; const q = d.level().state(); for (let i = 0; i < 3; i++) { if (!T.active(i)) continue; T.pos(i, o); const pip = L.friend; if (Math.hypot(o.x - pip.x, o.z - pip.z) > 2) return { x: o.x, z: o.z }; } return null;");
      await go({ x: food.x, z: food.z }, { stop: 0.6, timeout: 15000 }, "food");
      await waitFor((s) => s.action === "Pick up", 4000, "pick up prompt");
      await press("KeyE"); await sleep(400);
      const pip = (await st()).pip;
      await go({ x: pip.x, z: pip.z }, { stop: 1.6, timeout: 15000 }, "to Pip");
      await waitFor((s) => s.action === "Give", 4000, "give prompt");
      await press("KeyE"); await sleep(500);
      void fp;
    }
    await waitFor((s) => s.foodDone >= 3 && s.action === "Sit", 4000, "Sit prompt");
    await press("KeyE");
    await sleep(4000); await shot("eating");
    await waitFor((s) => s.step === "morning", 40000, "morning");
  }
  async function playMorning() {
    await waitFor((s) => s.step === "morning" && s.player.enabled, 10000, "tag start");
    await sleep(1800);
    await shot("tag");
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      const s = await st();
      if (s.tagStage >= 1) break;
      await walk(async () => (await st()).pip, { stop: 0.4, timeout: 2500, until: (q) => q.tags !== s.tags || q.tagStage > 0, noDetour: true });
    }
    log("  tagged Pip 3 times in " + ((Date.now() - t0) / 1000).toFixed(0) + " s");
    // run from Pip for 20 s: circle the camp, away from her
    const t1 = Date.now();
    while (Date.now() - t1 < 30000) {
      const s = await st();
      if (s.step !== "morning" || s.tagStage >= 2) break;
      const dx = s.player.x - s.pip.x, dz = s.player.z - s.pip.z, l = Math.hypot(dx, dz) || 1;
      const c = { x: 19, z: 75 };
      const ax = s.player.x + (dx / l) * 3 + (c.x - s.player.x) * 0.15 - (dz / l) * 2, az = s.player.z + (dz / l) * 3 + (c.z - s.player.z) * 0.15 + (dx / l) * 2;
      await aimAt(ax, az); await down("KeyW"); await sleep(250);
    }
    await up("KeyW");
    await waitFor((s) => s.step === "noon", 25000, "noon");
  }
  async function playNoon() {
    await waitFor((s) => s.step === "noon" && s.player.enabled, 10000, "pebbles");
    await sleep(1200);
    await shot("pebbles");
    const t0 = Date.now();
    while (Date.now() - t0 < 100000) {
      const s = await st();
      if (s.step !== "noon" || s.pebbles >= 6) break;
      const p = await L12("const p = L.pebbles.filter(q => q.on).sort((a, b) => Math.hypot(a.x - d.player.x, a.z - d.player.z) - Math.hypot(b.x - d.player.x, b.z - d.player.z))[0]; return p ? { x: p.x, z: p.z } : null;");
      if (!p) break;
      const r = await walk(() => p, { stop: 0.6, timeout: 9000, until: (q) => q.pebbles !== s.pebbles });
      if (r === "ok") { await down("Space"); await sleep(900); await up("Space"); await sleep(300); }
      if (r === "stuck" || r === "timeout") { fallback("pebble walk " + r); await tp(p.x, p.z, "pebble"); await down("Space"); await sleep(800); await up("Space"); }
      if (s.pebbles === 2) await shot("diving");
    }
    await waitFor((s) => s.step === "night", 25000, "night");
  }
  async function playNight() {
    await waitFor((s) => s.step === "night" && s.player.enabled, 10000, "fireflies");
    await sleep(1400);
    await shot("fireflies");
    const t0 = Date.now();
    while (Date.now() - t0 < 110000) {
      const s = await st();
      if (s.step !== "night" || s.flies >= 10) break;
      const f = await L12("const f = L.fly.filter(q => q.on).sort((a, b) => Math.hypot(a.x - d.player.x, a.z - d.player.z) - Math.hypot(b.x - d.player.x, b.z - d.player.z))[0]; return f ? { x: f.x, z: f.z } : null;");
      if (!f) break;
      const r = await walk(async () => { const q = await L12("const f = L.fly.filter(q => q.on).sort((a, b) => Math.hypot(a.x - d.player.x, a.z - d.player.z) - Math.hypot(b.x - d.player.x, b.z - d.player.z))[0]; return f ? { x: f.x, z: f.z } : null;"); return q; }, { stop: 0.35, timeout: 8000, until: (q) => q.flies !== s.flies });
      if (r === "ok") { await press("Space"); await sleep(650); }
      if (r === "stuck" || r === "timeout") fallback("firefly walk " + r);
      if (s.flies === 5) await shot("lantern");
    }
    await waitFor((s) => s.step === "bed", 15000, "bed");
  }
  async function playBed() {
    await waitFor((s) => s.step === "bed" && s.player.enabled && !s.playing, 10000, "go to bed");
    const b = await L12("return L.jungle.P.bed;");
    await go({ x: b.x, z: b.z }, { stop: 1.2, timeout: 20000 }, "bed");
    await waitFor((s) => s.action === "Sleep", 5000, "Sleep prompt");
    await press("KeyE");
    await sleep(5000); await shot("asleep");
    await waitFor((s) => s.step === "missing", 30000, "missing");
  }
  async function playMissing() {
    await waitFor((s) => s.step === "missing" && s.player.enabled && !s.playing, 20000, "missing walk");
    await shot("missing");
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) {
      const s = await st();
      if (s.step !== "missing" || s.missStage >= 2) break;
      await walk(() => ({ x: 20, z: 93 }), { stop: 1, timeout: 2000, until: (q) => q.missStage >= 2 });
    }
    await sleep(1500);
    await shot("end-card");
    await waitFor((s) => s.mode === "menu", 30000, "main screen");
    const prog = await E(() => window.__platy.state().progress);
    log("  back on the main screen; progress " + JSON.stringify(prog).slice(0, 160));
  }
  const PLAYERS = { intro: playIntro, travel: playTravel, spell: playSpell, dream: playDream, wake: playWake, boss1: playBoss1, boss2: playBoss2, boss3: playBoss3, potion: playPotion, winddance: playWind, dinner: playDinner, morning: playMorning, noon: playNoon, night: playNight, bed: playBed, missing: playMissing };

  try {
    if (!EXTRAS) {
      await startL12();
      const from = ONLY || FROM || "intro";
      if (from !== "intro") { await sleep(1500); await E((n) => window.__platy.level().skipTo(n), from); }
      const i0 = BEATS.indexOf(from), i1 = ONLY ? i0 : UNTIL ? BEATS.indexOf(UNTIL) : BEATS.length - 1;
      for (let i = i0; i <= i1; i++) {
        const b = BEATS[i];
        log("== " + b);
        try { await PLAYERS[b](); }
        catch (e) { fail(b + ": " + e.message); await shot("fail-" + b); break; }
      }
      const f = await fpsOnce().catch(() => null);
      if (f) log("fps at the end " + f.fps.toFixed(1));
    }
    if (!PLAY && !ONLY && !FROM) {
      // ---------------------------------------------------------------- extras: every hook loads clean
      log("== extras");
      const s0 = await st();
      if (s0.mode !== "level") await startL12();
      await sleep(1500);
      for (const h of HOOKS) {
        const t0 = Date.now();
        await E((n) => window.__platy.level().skipTo(n), h);
        let s;
        try { s = await waitFor((q) => (q.step === h || (h === "boss1" && q.step === "boss1")) && q.player.enabled && !q.playing && q.faded < 0.05, 15000, "hook " + h); }
        catch (e) { // some beats open with a short cutscene: skip it
          await skipCine(h);
          try { s = await waitFor((q) => q.player.enabled && !q.playing, 15000, "hook " + h); } catch (e2) { fail("hook " + h + ": " + e2.message); continue; }
        }
        const ms = Date.now() - t0;
        await sleep(900);
        s = await st();
        const marker = await E(() => { const d = window.__platy; return !!(d.ctx.debug.level12 && document.querySelector("#objective")); });
        log("  " + h.padEnd(10) + " " + String(ms).padStart(5) + " ms  calls " + s.render.calls + " tris " + s.render.triangles + "  obj: " + s.obj.replace(/\s+/g, " ").slice(0, 70));
        if (!s.obj) fail("hook " + h + " has no objective");
        if (s.render.calls >= 150) fail("hook " + h + " draw calls " + s.render.calls);
        if (s.render.triangles >= 250000) fail("hook " + h + " triangles " + s.render.triangles);
        void marker;
        await shot("hook-" + h);
      }
      // win() from the middle
      await E(() => window.__platy.level().skipTo("boss2"));
      await sleep(1500);
      await E(() => window.__platy.win());
      await waitFor((s) => s.mode === "menu", 30000, "menu after win()");
      log("  win() from boss2 -> main screen");
      const f = await fpsOnce();
      log("  menu fps " + f.fps.toFixed(1));
    }
  } catch (e) {
    fail("harness: " + (e.stack || e.message));
    try { await shot("harness-fail"); } catch (_) {}
  }
  await upAll().catch(() => {});
  log("max draw calls " + maxCalls + " (" + maxWhere + "), max tris " + maxTris);
  log("budget per step: " + JSON.stringify(report.budget));
  log("errors: " + errors.length);
  for (const e of errors.slice(0, 30)) console.log("  " + e.slice(0, 400));
  log("fallbacks: " + report.fallbacks.length + ", fails: " + report.fails.length);
  fs.writeFileSync(path.join(SHOTS, PRE + "report.json"), JSON.stringify(report, null, 1));
  await browser.close();
  srv.close();
  process.exit(errors.length || report.fails.length ? 1 : 0);
})();
