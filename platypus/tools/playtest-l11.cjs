// Level 11 "THE PLATYPUS KING": full browser playthrough (modelled on playtest-l5.cjs / playtest-l9.cjs).
//   node tools/playtest-l11.cjs               the whole level, then the extra checks
//   node tools/playtest-l11.cjs --from=door   start the real playthrough at a beat (skipTo)
//   node tools/playtest-l11.cjs --only=yard   play just that beat, then stop
//   node tools/playtest-l11.cjs --until=apron
//   node tools/playtest-l11.cjs --play        only the playthrough
//   node tools/playtest-l11.cjs --extras      only the checks after the playthrough
// Beats: intro (title, 3 DAYS, the void), wake, battle (three waves), march, king (three phases), after (fall, bottle, paper,
//   farewell, trail, shot), echo (lessons, the test, the end talk, TO BE CONTINUED).
// The playing is real keys (WASD, Shift, L, E, F); the seam reads state, aims the follow camera and
// (only where a walk gets stuck, logged) teleports.
// Screenshots: tools/shots/l11-NNN-name.png, plus 2x2 contact sheets tools/shots/l11-sheet-NN.png.
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const arg = (k) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=")[1] : null; };
const FROM = arg("from"), ONLY = arg("only"), UNTIL = arg("until"), PLAY = process.argv.includes("--play"), EXTRAS = process.argv.includes("--extras");
const PRE = "l11-" + (FROM ? FROM + "-" : UNTIL ? "to-" + UNTIL + "-" : ONLY ? ONLY + "-" : EXTRAS ? "x-" : "");
const ORDER = ["intro", "wake", "battle", "march", "king", "after", "echo"];
const SKIP = { intro: "intro", wake: "wake", battle: "battle", march: "march", king: "king", after: "fall", echo: "echo" };

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
  for (const f of fs.readdirSync(SHOTS)) if (f.startsWith(PRE)) fs.unlinkSync(path.join(SHOTS, f));
  const srv = await serve();
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
    defaultViewport: { width: 1280, height: 720 },
  });
  // a watchdog under the 10-minute tool limit: never leave a browser behind
  const LIMIT = +(arg("limit") || 720) * 1000;
  setTimeout(async () => { console.log("WATCHDOG: " + LIMIT / 1000 + " s, closing"); try { await page.screenshot({ path: path.join(SHOTS, PRE + "watchdog.png") }); } catch (_) {} try { await browser.close(); } catch (_) {} srv.close(); process.exit(2); }, LIMIT).unref();
  const errors = [];
  const report = { url, steps: [], errors, fallbacks: [], shots: [], seamTeleports: [], deaths: {} };
  let n = 0;
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + (e.stack || e.message || e)));
  page.on("console", (m) => { if (((m.location && m.location()) || {}).url && m.location().url.includes("/api/platypus/")) return; if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });
  page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url()));

  const T0 = Date.now();
  const log = (m) => { m = "[" + ((Date.now() - T0) / 1000).toFixed(0).padStart(3) + "s] " + m; report.steps.push(m); console.log(m); };
  const fallback = (m) => { report.fallbacks.push(m); log("FALLBACK: " + m); };
  const shot = async (name) => {
    n++;
    const f = path.join(SHOTS, PRE + String(n).padStart(3, "0") + "-" + name + ".png");
    await page.screenshot({ path: f });
    report.shots.push(f);
    return f;
  };
  let maxCalls = 0, maxTris = 0, maxWhere = "";
  const st = async () => {
    const s = await page.evaluate(() => {
      const d = window.__platy; if (!d) return null;
      const s = d.state(), L = d.ctx.debug.level11;
      s.actionLabel = d.ui.actionOn ? (document.getElementById("actionTxt") || {}).textContent || "" : "";
      s.lock = d.player.lock;
      s.gy = d.platypus.group.position.y;
      s.respawning = !!d.ctx.checkpoint.respawning;
      s.hint = (document.getElementById("hint") || {}).textContent || "";
      s.dead = !!d.ctx.health.dead;
      s.hpNow = d.ctx.health.hp;
      if (L && s.levelN === 11 && s.mode === "level" && d.world) {
        const w = d.world;
        s.world = w.name;
        s.floor = w.heightAt(d.player.x, d.player.z);
        const C = L.combat;
        s.enemies = C.enemies.filter((e) => e.alive).map((e) => ({ x: e.x, y: e.y, z: e.z, state: e.state, kind: e.kind, hp: e.hp, passive: !!e.passive, flee: !!e.fleeing11, floor: w.heightAt(e.x, e.z) }));
        s.bodies = C.bodies.filter((b) => b.alive && b.targetable).map((b) => ({ x: b.x, z: b.z }));
        s.allies = C.allies.filter((a) => a.alive).map((a) => ({ x: a.x, y: a.y, z: a.z, state: a.state, floor: w.heightAt(a.x, a.z) }));
        const P = L.potions, k = P.nearest ? P.nearest(d.player.x, d.player.z, 60) : -1;
        s.pickup = k >= 0 ? P.pos(k) : null;
        const B = L.boss;
        if (B && B.group.visible) s.boss = { x: B.x, z: B.z, vul: B.vulnerable, state: B.state, attack: B.attack, hp: Math.round(B.hp), phase: B.phase, dead: B.dead, dying: B.dying };
        s.speaking = d.ui.speaking();
        s.obj = (document.getElementById("objective") || {}).textContent || "";
      }
      return s;
    });
    if (s && s.render) {
      if (s.render.calls > maxCalls) { maxCalls = s.render.calls; maxWhere = s.step; }
      if (s.render.triangles > maxTris) { maxTris = s.render.triangles; report.maxTrisWhere = s.step + " at " + (s.player.x | 0) + "," + (s.player.z | 0) + " calls " + s.render.calls; }
      if (s.render.triangles > 250000 && !(report.overBudget || []).some((q) => q.startsWith(s.step + " ")) ) {
        const top = await page.evaluate(() => { const d = window.__platy, by = {}; d.scene.traverseVisible((o) => { if (!o.isMesh || !o.geometry) return; const g = o.geometry; let t = (g.index ? g.index.count : g.attributes.position.count) / 3; if (o.isInstancedMesh) t *= o.count; let k = o.name || "?"; if (o.parent) k = (o.parent.name || "?") + "/" + k; if (o.castShadow) k += "[S]"; by[k] = (by[k] || 0) + t; }); return Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k + ":" + Math.round(v)).join(" "); });
        (report.overBudget = report.overBudget || []).push(s.step + " " + s.render.triangles + " calls " + s.render.calls + ": " + top);
        log("OVER BUDGET " + s.step + " " + s.render.triangles + " calls " + s.render.calls + ": " + top);
      }
    }
    return s;
  };
  const waitFor = async (pred, ms, label) => {
    const t0 = Date.now();
    for (;;) {
      const s = await st();
      if (s && pred(s)) return s;
      if (Date.now() - t0 > ms) throw new Error("timeout waiting for " + label + " (step=" + (s && s.step) + ")");
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
  const D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  async function walk(target, o) {
    o = o || {};
    const stop = o.stop === undefined ? 0.5 : o.stop, tEnd = Date.now() + (o.timeout || 15000);
    let lastX = 1e9, lastZ = 1e9, lastT = Date.now(), jumps = 0, res = "timeout", detourT = 0, detourSide = 1;
    if (o.sneak) await down("ShiftLeft");
    for (;;) {
      const s = await st();
      if (!s || (o.until && o.until(s))) { res = "until"; break; }
      if (s.dead || s.respawning) { res = "died"; break; }
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
      else if (s.player.enabled && Date.now() - lastT > 900 + jumps * 700 + (o.sneak ? 600 : 0)) {
        if (jumps >= 7) { res = "stuck"; break; }
        jumps++;
        if (jumps >= 2 && !o.noDetour) { detourSide = jumps % 2 ? 1 : -1; detourT = Date.now() + 1300 + jumps * 250; lastT = Date.now() + 1200; }
        else if (!o.noJump) { await press("Space"); lastT = Date.now(); }
      }
      await sleep(60);
    }
    await up("KeyW");
    if (o.sneak && !o.keepSneak) await up("ShiftLeft");
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
  const fpsOnce = () => page.evaluate(() => new Promise((res) => {
    const gaps = []; let last = performance.now(); const t0 = last;
    function f(t) { gaps.push(t - last); last = t; if (t - t0 < 4000) requestAnimationFrame(f); else {
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
    log("FPS " + label + ": " + best.fps.toFixed(1) + " p50 " + best.p50.toFixed(1) + "ms p95 " + best.p95.toFixed(1) + "ms; draw calls " + s.render.calls + " tris " + s.render.triangles + (samples.length > 1 ? " (samples " + samples.join(", ") + ")" : ""));
    return best;
  };
  async function filmWhile(name, cond, every, maxMs, each) {
    const t0 = Date.now(); let i = 0, lastShot = 0, lastStep = "";
    while (Date.now() - t0 < maxMs) {
      const s = await st();
      if (!s || !cond(s)) break;
      if (each) await each(s);
      if (Date.now() - lastShot >= every || s.step !== lastStep) {
        lastShot = Date.now(); lastStep = s.step;
        await shot(name + "-" + String(i++).padStart(2, "0") + "-" + s.step);
      }
      await sleep(120);
    }
    return (Date.now() - t0) / 1000;
  }
  const ground = (s, label) => {
    if (!s || s.floor === undefined) return;
    const dp = s.gy - s.floor;
    const bad = [];
    if (s.enemies) for (const e of s.enemies) if (Math.abs(e.y - e.floor) > 0.45 && !(e.z > 80 && e.y > 2.5)) bad.push("enemy " + (e.y - e.floor).toFixed(2) + "@" + e.x.toFixed(0) + "," + e.z.toFixed(0));
    if (s.allies) for (const a of s.allies) if (a.y !== undefined && Math.abs(a.y - a.floor) > 0.45 && a.state !== "hurt") bad.push("ally " + (a.y - a.floor).toFixed(2));
    log("  ground " + label + ": player " + dp.toFixed(2) + " at " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1) + (bad.length ? " OFF " + bad.join(", ") : ""));
    if (s.player.grounded && Math.abs(dp) > 0.3) fallback("player not on the ground at " + label + ": " + dp.toFixed(2));
    if (bad.length) report.offGround = (report.offGround || []).concat([label + ": " + bad.join(", ")]);
  };
  const J = () => page.evaluate(() => { const P = window.__platy.ctx.debug.level11.jungle.P; const o = {}; for (const k of ["campEdge", "barricade", "arenaIn", "arenaBack", "farTrail", "arena"]) o[k] = { x: P[k].x, z: P[k].z, r: P[k].r }; return o; });
  const DP = () => page.evaluate(() => { const P = window.__platy.ctx.debug.level11.dream.P; return { rise: { x: P.rise.x, z: P.rise.z }, spawn: { x: P.spawn.x, z: P.spawn.z } }; });
  const note = async (beat) => { const s = await st(); report.deaths[beat] = s.tries; log("  " + beat + ": tries " + s.tries + ", hp " + s.hp + ", army " + s.army + ", potions " + s.potions + (s.boss ? ", king hp " + s.boss.hp : "")); };
  // talk: press E while a speech bubble is up (a player reading at a normal pace)
  let lastE = 0;
  const talkOn = async (s) => { if (s && s.speaking && Date.now() - lastE > 2200) { lastE = Date.now(); await press("KeyE"); } };
  // wait out a cutscene/talk, filming it
  const watch = (name, cond, maxMs, every) => filmWhile(name, cond, every || 1800, maxMs, talkOn);
  const faceYaw = (x, z) => page.evaluate((x, z) => { const p = window.__platy.player; p.yaw = Math.atan2(x - p.x, z - p.z); }, x, z);

  // fighting with the army: knock out the nearest soldier (J sting, L slap), turn bodies with a potion (Q),
  // grab Tika's flasks when low
  let fightShotT = 0, fightN = 0, thrown = 0, hitsPressed = 0;
  async function brawl(pred, ms, label, o) {
    o = o || {};
    const tEnd = Date.now() + ms;
    while (Date.now() < tEnd) {
      const s = await st();
      if (pred(s)) break;
      await talkOn(s);
      if (s.respawning || !s.player.enabled || s.cinema.playing) { await upAll(); await sleep(250); continue; }
      if (Date.now() - fightShotT > 4000) { fightShotT = Date.now(); await shot(label + "-" + String(fightN++).padStart(2, "0")); log("    " + label + ": hp " + s.hp + " left " + s.alive + " army " + s.army + " potions " + s.potions + " bodies " + (s.bodies || []).length + " step " + s.step + " tries " + s.tries + (s.boss ? " king " + s.boss.hp + "/" + s.boss.state : "")); }
      if (o.each) await o.each(s);
      const es = (s.enemies || []).filter((e) => !e.flee && !e.passive);
      es.sort((a, b) => D(a, s.player) - D(b, s.player));
      const near = es.filter((e) => D(e, s.player) < 2.6).length;
      const body = (s.bodies || []).map((b) => ({ b, d: D(b, s.player) })).filter((q) => q.d > 1.2 && q.d < 7.5).sort((a, b) => a.d - b.d)[0];
      if (s.potions > 0 && body && near <= 1) {
        await upAll(); await aimAt(body.b.x, body.b.z); await faceYaw(body.b.x, body.b.z);
        await down("KeyQ"); await sleep(380); await faceYaw(body.b.x, body.b.z); await up("KeyQ"); thrown++;
        await sleep(450); continue;
      }
      if (s.potions < 2 && s.pickup && near === 0 && D(s.pickup, s.player) < 14 && (!es.length || D(es[0], s.player) > 5)) {
        await walk(() => s.pickup, { stop: 0.4, timeout: 3500, noDetour: true });
        continue;
      }
      if (!es.length) { await upAll(); if (o.idle) await o.idle(s); else await sleep(200); continue; }
      const e = es[0], d = D(e, s.player);
      await aimAt(e.x, e.z);
      if (d > 3.5 && d < 16 && s.ammo > 0 && e.state !== "down") { await up("KeyW"); await faceYaw(e.x, e.z); await down("KeyF"); await sleep(400); await up("KeyF"); continue; }
      if (d > 1.5) { await down("KeyW"); await sleep(140); continue; }
      await up("KeyW"); await faceYaw(e.x, e.z);
      await press(hitsPressed++ % 3 === 2 ? "KeyL" : "KeyJ"); await sleep(330);
    }
    await upAll();
  }

  async function beatIntro() {
    await watch("title", (s) => s.step === "intro", 15000, 1500);
    await shot("void-start");
    let s = await st();
    if (s.step !== "void") throw new Error("no void after the cards: " + s.step);
    // walk toward the light (straight ahead); it pulls away
    await down("KeyW");
    await filmWhile("void", (x) => x.step === "void", 2500, 40000, async (x) => {
      await page.evaluate(() => { const d = window.__platy; d.cam.yaw = 0; d.cam.manualT = 1; });
      if (x.voidStage >= 2) await down("ShiftLeft");
    });
    await upAll();
    await watch("void-end", (x) => x.step === "void" || (x.step === "wake" && x.cinema.faded), 8000, 800);
    s = await st();
    if (s.step !== "wake") throw new Error("void did not end in the wake: " + s.step);
  }
  async function beatWake() {
    await watch("wake", (s) => s.step === "wake" && (s.cinema.playing || !s.player.enabled), 45000, 2200);
    await sleep(600);
    let s = await st(); await shot("muster");
    ground(s, "muster");
    log("  muster: potions " + s.potions + ", obj '" + s.obj + "'");
    if (s.potions !== 3) fallback("Burra's three potions: have " + s.potions);
    await fpsMeasure("camp_storm");
    const P = await J();
    await go(P.campEdge, { stop: 1.5, timeout: 30000, until: (x) => x.step !== "wake" || x.cinema.playing }, "camp edge");
    await watch("run", (x) => x.cinema.playing || x.step === "wake", 20000, 1600);
    s = await st();
    if (s.step !== "battle") throw new Error("no battle after the gate: " + s.step);
  }
  async function beatBattle() {
    await sleep(1500);
    let s = await st(); await shot("riverbank"); ground(s, "riverbank");
    const P = await J();
    let w3 = false;
    await brawl((x) => x.step === "march" || /^king/.test(x.step), 330000, "battle", {
      idle: async (x) => { if (Math.hypot(x.player.x - P.barricade.x, x.player.z - P.barricade.z) > 6) await walk(() => P.barricade, { stop: 3, timeout: 3000 }); else await sleep(250); },
      each: async (x) => { if (!w3 && x.step === "wave3" && x.alive >= 8) { w3 = true; await upAll(); await fpsMeasure("wave3"); ground(await st(), "wave 3"); } },
    });
    s = await st();
    log("  battle over: army " + s.army + ", potions thrown " + thrown + ", tries " + s.tries);
    if (s.step !== "march") throw new Error("battle did not end in the march: " + s.step);
    await note("battle");
  }
  async function beatMarch() {
    await sleep(1200);
    let s = await st(); await shot("march"); ground(s, "march");
    if (s.army < 5) fallback("a small army for the march: " + s.army);
    const P = await J();
    await go(P.arenaIn, { stop: 2, timeout: 40000, until: (x) => x.step !== "march" }, "the stone circle");
    await watch("kingintro", (x) => x.cinema.playing || x.step === "march", 25000, 1500);
  }
  async function beatKing() {
    const P = await J(), A = P.arena;
    let s = await st(); await shot("king-start"); ground(s, "king start");
    await fpsMeasure("king_phase1");
    let jumpT = 0, strafe = 1, measuredP = 0;
    const tEnd = Date.now() + +(arg("kingms") || 330000);
    while (Date.now() < tEnd) {
      s = await st();
      if (!/^king/.test(s.step) || (s.boss && (s.boss.dying || s.boss.dead))) break;
      await talkOn(s);
      if (s.respawning || !s.player.enabled || s.cinema.playing || !s.boss) { await upAll(); await sleep(250); continue; }
      const b = s.boss, db = D(b, s.player);
      if (Date.now() - fightShotT > 3500) { fightShotT = Date.now(); await shot("king-" + String(fightN++).padStart(2, "0")); log("    king: phase " + b.phase + " hp " + b.hp + " state " + b.state + "/" + b.attack + " vul " + b.vul + " me hp " + s.hp + " army " + s.army + " guards " + (s.enemies || []).length + " tries " + s.tries); }
      if (b.phase !== measuredP && b.phase >= 1 && b.state !== "phaseStagger") { measuredP = b.phase; await upAll(); await fpsMeasure("king_phase" + (b.phase + 1)); continue; }
      const guards = (s.enemies || []).filter((e) => !e.flee && !e.passive).sort((a, c) => D(a, s.player) - D(c, s.player));
      if (b.vul || b.state === "final" || /Finish/.test(s.obj)) {
        await aimAt(b.x, b.z);
        if (db > 2.1) { await down("KeyW"); await sleep(120); continue; }
        await up("KeyW"); await faceYaw(b.x, b.z); await press("KeyJ"); await sleep(300); continue;
      }
      if (guards.length && D(guards[0], s.player) < 6) {
        await brawl((x) => !(x.enemies || []).filter((e) => !e.flee && !e.passive && D(e, x.player) < 7).length || (x.boss && x.boss.vul) || !/^king/.test(x.step), 5000, "guards");
        continue;
      }
      const body = (s.bodies || []).find((q) => D(q, s.player) < 7 && D(q, s.player) > 1.2);
      if (body && s.potions > 0) { await upAll(); await faceYaw(body.x, body.z); await down("KeyQ"); await sleep(350); await up("KeyQ"); thrown++; await sleep(400); continue; }
      // keep moving round him at ~6 m; jump the shockwaves
      const a = Math.atan2(s.player.x - b.x, s.player.z - b.z) + strafe * 0.5;
      const rr = Math.min(6.2, A.r - 2);
      let tx = b.x + Math.sin(a) * rr, tz = b.z + Math.cos(a) * rr;
      if (Math.hypot(tx - A.x, tz - A.z) > A.r - 1.5) { strafe = -strafe; tx = A.x; tz = A.z; }
      await aimAt(tx, tz); await down("KeyW");
      if (/pound|slam|sweep|ring/.test(b.attack || "") && Date.now() - jumpT > 900) { jumpT = Date.now(); await press("Space"); }
      await sleep(110);
    }
    await upAll();
    s = await st();
    log("  king fight over: step " + s.step + ", tries " + s.tries + ", army " + s.army);
    if (!(s.boss && (s.boss.dying || s.boss.dead)) && s.step !== "fall") throw new Error("the King was not beaten in time (step " + s.step + ", hp " + (s.boss && s.boss.hp) + ", phase " + (s.boss && s.boss.phase) + ")");
    await note("king");
  }
  async function beatAfter() {
    await watch("fall", (x) => x.step === "fall" || /^king/.test(x.step) || (x.cinema.playing && x.step !== "drop"), 40000, 1500);
    await sleep(500);
    let s = await st(); await shot("drop"); ground(s, "drop");
    if (s.step !== "drop") throw new Error("no drop after the fall: " + s.step);
    const L = await page.evaluate(() => { const L = window.__platy.ctx.debug.level11; return { b: { x: L.potions.living.x, z: L.potions.living.z }, p: { x: L.boss.paper.x, z: L.boss.paper.z } }; });
    await go(L.b, { stop: 1.1, timeout: 15000, until: (x) => x.actionLabel === "Look" }, "the bottle");
    await sleep(300);
    s = await st(); await shot("bottle-prompt");
    if (s.actionLabel !== "Look") fallback("no Look prompt at the bottle: '" + s.actionLabel + "'");
    await press("KeyE");
    await watch("bottle", (x) => x.step === "drop" || (x.cinema.playing && x.step === "paper"), 25000, 1300);
    s = await st(); if (s.step !== "paper") throw new Error("no paper after the bottle: " + s.step);
    const pp = await page.evaluate(() => { const B = window.__platy.ctx.debug.level11.boss; return { x: B.paper.x, z: B.paper.z }; });
    await go(pp, { stop: 1.1, timeout: 15000, until: (x) => x.actionLabel === "Look" }, "the paper");
    await sleep(300);
    s = await st(); await shot("paper-prompt");
    if (s.actionLabel !== "Look") fallback("no Look prompt at the paper: '" + s.actionLabel + "'");
    await press("KeyE");
    await watch("paper", (x) => x.step === "paper" || x.step === "farewell" || (x.cinema.playing && x.step !== "shot"), 70000, 1300);
    await sleep(600);
    s = await st(); await shot("trail"); ground(s, "trail");
    if (s.step !== "trail") throw new Error("no trail after the farewell: " + s.step);
    const P = await J();
    await go(P.arenaBack, { stop: 2.5, timeout: 30000, until: (x) => x.trailStage >= 1 }, "out of the circle");
    await sleep(1800); await shot("far-glow"); await fpsMeasure("trail_view");
    await go(P.farTrail, { stop: 1.2, timeout: 25000, until: (x) => x.step !== "trail" }, "the far trail");
    await watch("shot", (x) => x.step === "shot" || x.step === "trail", 30000, 700);
  }
  async function beatEcho() {
    await watch("echo", (x) => x.step === "echo" || x.step === "shot", 60000, 1800);
    let s = await st(); ground(s, "echo");
    if (s.step !== "lesson") throw new Error("no lesson after the echo: " + s.step);
    await fpsMeasure("echo");
    const R = await DP();
    const scream = async (ms, label) => { await upAll(); const t0 = Date.now(); await down("KeyR"); await sleep(ms * 0.45); if (ms >= 900) await shot("charge-" + label); const left = ms - (Date.now() - t0); if (left > 0) await sleep(left); else log("    (the charge shot overran: held " + (Date.now() - t0) + " ms)"); await up("KeyR"); await sleep(1500); await shot("after-" + label); await sleep(1200); };
    const t0 = Date.now();
    let tries = { a: 0, b: 0, c: 0 };
    while (Date.now() - t0 < 150000) {
      s = await st();
      if (s.step !== "lesson") break;
      await talkOn(s);
      if (s.speaking || !s.player.enabled || s.cinema.playing) { await sleep(300); continue; }
      const l = s.lesson; if (!(l in tries)) { await sleep(300); continue; }
      if (++tries[l] > 4) throw new Error("lesson " + l + " not passed after 4 screams");
      log("  lesson " + l + ": pillars " + s.pillars + ", screams " + s.screams);
      if (l === "a") await scream(450, "a");
      else if (l === "b") await scream(950, "b");
      else { await go(R.rise, { stop: 0.8, timeout: 15000 }, "the rise"); await scream(1500, "c"); }
    }
    s = await st();
    if (s.step !== "test") throw new Error("lessons did not lead to the test: " + s.step + "/" + s.lesson);
    await sleep(800); await shot("test-start"); await fpsMeasure("test");
    const t1 = Date.now();
    while (Date.now() - t1 < 90000) {
      s = await st();
      if (s.step !== "test") break;
      await talkOn(s);
      const close = (s.enemies || []).filter((e) => D(e, s.player) < 7).length;
      if (s.player.enabled && !s.speaking && (close >= 5 || (Date.now() - t1 > 10000 && close >= 1))) await scream(1500, "test");
      else await sleep(250);
    }
    s = await st(); log("  test over: step " + s.step + ", screams " + s.screams);
    if (s.step === "test") throw new Error("the test was not passed");
    await watch("end", (x) => x.mode === "level", 90000, 2000);
  }

  async function clickAgain(tap) {
    for (let i = 0; i < 12; i++) {
      try { if (tap) await page.tap("#again"); else await page.click("#again"); } catch (_) {}
      await sleep(700);
      const q = await st();
      if (!q || q.mode !== "level") return;
    }
  }
  const backToMenu = async (label) => {
    const s = await waitFor((x) => x.mode === "menu", 30000, "main screen " + label);
    if (s.running) throw new Error("the level is still running behind the main screen");
    return s;
  };
  const enterLevel = async (label) => {
    await page.evaluate(() => { window.__platy.startLevel(11); });
    return waitFor((x) => x.mode === "level" && x.levelN === 11 && x.step === "intro", 40000, label);
  };

  let s;
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
    const gpu = await page.evaluate(() => { const gl = window.__platy.renderer.getContext(); const e = gl.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; });
    log("gpu: " + gpu);
    await page.evaluate(() => { window.__platy.resetProgress(); window.__platy.unlock(11); });
    await sleep(500);
    await shot("menu");
    if (await page.evaluate(() => document.getElementById("lvl11").classList.contains("locked"))) throw new Error("level 11 is locked after unlock(11)");
    if (!EXTRAS) {
      await page.click("#lvl11");
      s = await waitFor((x) => x.mode === "level" && x.levelN === 11, 40000, "level 11 running");
      const beats = [["intro", beatIntro], ["wake", beatWake], ["battle", beatBattle], ["march", beatMarch], ["king", beatKing], ["after", beatAfter], ["echo", beatEcho]];
      const first = ONLY || FROM || "intro";
      if (first !== "intro") { await sleep(1500); const ok = await page.evaluate((b) => window.__platy.skipTo(b), SKIP[first]); if (!ok) throw new Error("skipTo " + first + " failed"); await sleep(1200); }
      for (const [name, fn] of beats) {
        if (ORDER.indexOf(name) < ORDER.indexOf(first)) continue;
        if (ONLY && name !== ONLY) break;
        log("== " + name);
        await fn();
        await upAll();
        if (UNTIL === name) break;
      }
      if (UNTIL) { await shot("until-end"); }
      else if (ONLY && ONLY !== "echo") await shot("only-end");
      else {
        s = await backToMenu("after the level card");
        if (!s.progress.beaten[10]) throw new Error("level 11 is not marked beaten: " + JSON.stringify(s.progress));
        await sleep(1800); await shot("menu-level11-beaten");
        const tick = await page.evaluate(() => { const b = document.getElementById("lvl11"); return { cls: b.className }; });
        log("level complete -> main screen; " + JSON.stringify(tick) + ", progress " + JSON.stringify(s.progress));
        if (!/beaten|done/.test(tick.cls)) fallback("the level 11 circle does not show as beaten (class '" + tick.cls + "')");
        report.completed = true;
      }
    }

    if (!ONLY && !FROM && !PLAY && !UNTIL) {
      await enterLevel("win on title");
      await sleep(800);
      if (await page.evaluate(() => window.__platy.skipTo("nonsense"))) fallback("skipTo('nonsense') returned true");
      await page.evaluate(() => window.__platy.win());
      await sleep(1200); await shot("win-on-title");
      await clickAgain();
      await backToMenu("after win() on the title");
      // a death in wave 2: back at the wave's checkpoint
      await enterLevel("death check");
      await page.evaluate(() => window.__platy.skipTo("wave2")); await sleep(2500);
      await page.evaluate(() => window.__platy.ctx.health.damage(1000));
      await sleep(400); await shot("death");
      s = await waitFor((x) => !x.respawning && x.player.enabled && x.step === "wave2", 15000, "respawn after a death");
      await sleep(600); await shot("respawned"); ground(await st(), "respawn wave2");
      log("  death -> respawn at " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1) + ", tries " + s.tries + ", army " + s.army);
      // a death against the King: back at the phase checkpoint with his hp kept
      await page.evaluate(() => window.__platy.skipTo("king2")); await sleep(3000);
      const hp0 = (await st()).boss.hp;
      await page.evaluate(() => window.__platy.ctx.health.damage(1000));
      s = await waitFor((x) => !x.respawning && x.player.enabled && x.step === "king2", 15000, "respawn in the King fight");
      await sleep(800); await shot("king-respawned");
      log("  king death -> phase " + s.boss.phase + " hp " + s.boss.hp + " (was " + hp0 + "), tries " + s.tries);
      if (s.boss.phase !== 1) fallback("King respawn not in phase 2: " + s.boss.phase);
      for (const b of ["void", "wake", "battle", "wave2", "wave3", "march", "king", "king2", "king3", "fall", "drop", "paper", "farewell", "trail", "shot", "echo", "lesson", "test", "end", "intro", "king3", "test"]) {
        const ok = await page.evaluate((x) => window.__platy.skipTo(x), b);
        if (!ok) throw new Error("skipTo " + b + " failed");
        await sleep(b === "shot" ? 1500 : 2600);
        s = await st();
        await shot("skipTo-" + b + "-" + s.step);
        if (["battle", "wave3", "march", "king3", "drop", "trail", "lesson"].includes(b)) ground(s, "skipTo " + b);
      }
      log("skipTo chain ok");
      await page.evaluate(() => window.__platy.quit());
      await backToMenu("after quitting");
      s = await enterLevel("re-entry");
      if (s.timeScale !== 1 || s.army || s.potions || s.screams) throw new Error("re-entry is not clean: " + JSON.stringify({ ts: s.timeScale, army: s.army, potions: s.potions, screams: s.screams }));
      await page.evaluate(() => window.__platy.win());
      await sleep(800); await clickAgain();
      await backToMenu("after win()");
      log("quit, re-entry, win() ok");
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true });
      await page.evaluate(() => { document.body.classList.add("touch"); });
      await sleep(600);
      await enterLevel("phone");
      await sleep(4000); await shot("phone-portrait-intro");
      for (const b of ["wave2", "king", "drop", "lesson"]) {
        await page.evaluate((x) => window.__platy.skipTo(x), b);
        await sleep(3500);
        await shot("phone-portrait-" + b);
      }
      await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, hasTouch: true });
      await sleep(600);
      for (const b of ["wave3", "king3", "test"]) {
        await page.evaluate((x) => window.__platy.skipTo(x), b);
        await sleep(3500);
        await shot("phone-landscape-" + b);
      }
      await page.evaluate(() => window.__platy.win());
      await sleep(800); await clickAgain(true);
      await backToMenu("after the phone run");
      await page.evaluate(() => { document.body.classList.remove("touch"); window.__platy.resetProgress(); });
      log("phone shots ok");
    }
    report.maxCalls = maxCalls; report.maxTris = maxTris;
    log("max draw calls seen " + maxCalls + " (in " + maxWhere + "), max triangles " + maxTris + " (in " + report.maxTrisWhere + ")");
    log("seam teleports: " + report.seamTeleports.length + (report.seamTeleports.length ? " " + JSON.stringify(report.seamTeleports) : ""));
    log("deaths by beat: " + JSON.stringify(report.deaths));
    if (report.offGround) log("off the ground: " + JSON.stringify(report.offGround));
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
      await sp.screenshot({ path: path.join(SHOTS, PRE + "sheet-" + String(k).padStart(2, "0") + ".png") });
    }
  } catch (e) { console.log("contact sheets failed: " + e); }

  await browser.close();
  srv.close();
  fs.writeFileSync(path.join(SHOTS, PRE + "report.json"), JSON.stringify(report, null, 2));
  console.log("fallbacks: " + report.fallbacks.length);
  for (const f of report.fallbacks) console.log("  " + f);
  console.log("errors: " + errors.length);
  for (const e of errors.slice(0, 30)) console.log("  " + e.slice(0, 600));
  console.log(report.ok ? "PLAYTEST-L11 OK" : "PLAYTEST-L11 FAILED");
  process.exit(report.ok && errors.length === 0 ? 0 : 1);
})();
