// Level 9 "THE TRIBE": full browser playthrough (modelled on playtest-l5.cjs / playtest-l8.cjs).
//   node tools/playtest-l9.cjs               the whole level, then skipTo / win / re-entry / phone checks
//   node tools/playtest-l9.cjs --from=rival  start the real playthrough at a beat (skipTo)
//   node tools/playtest-l9.cjs --only=craft  play just that beat, then stop
//   node tools/playtest-l9.cjs --play        only the real playthrough
//   node tools/playtest-l9.cjs --until=food
//   node tools/playtest-l9.cjs --extras      only the checks after the playthrough (the full run is ~11 min:
//                                            --play then --extras keeps each under 10)
// Beats: intro, meet, food, hunt (hunt+ambush), rival, home, gather, craft, night (night+sleep+vision+wake).
// The playing is real keys (WASD, Space, J, K, L, E); the seam reads state, aims the follow camera and
// (only where a walk gets stuck) teleports.
// Screenshots: tools/shots/l9-NNN-name.png, plus 2x2 contact sheets tools/shots/l9-sheet-NN.png.
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const arg = (k) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=")[1] : null; };
const FROM = arg("from"), ONLY = arg("only"), UNTIL = arg("until"), PLAY = process.argv.includes("--play"), EXTRAS = process.argv.includes("--extras");
const ORDER = ["intro", "meet", "food", "hunt", "rival", "home", "gather", "craft", "night"];

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
  for (const f of fs.readdirSync(SHOTS)) if (f.startsWith("l9-")) fs.unlinkSync(path.join(SHOTS, f));
  const srv = await serve();
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
    defaultViewport: { width: 1280, height: 720 },
  });
  const errors = [];
  const report = { url, steps: [], errors, fallbacks: [], shots: [], seamTeleports: [] };
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
    const f = path.join(SHOTS, "l9-" + String(n).padStart(3, "0") + "-" + name + ".png");
    await page.screenshot({ path: f });
    report.shots.push(f);
    return f;
  };
  let maxCalls = 0, maxTris = 0, maxWhere = "";
  const st = async () => {
    const s = await page.evaluate(() => {
      const d = window.__platy; if (!d) return null;
      const s = d.state(), L = d.ctx.debug.level9;
      s.actionLabel = d.ui.actionOn ? (document.getElementById("actionTxt") || {}).textContent || "" : "";
      s.acting = !!d.platypus.acting; s.lock = d.player.lock; s.speaking = !!d.ui.speaking();
      s.gy = d.platypus.group.position.y;
      s.respawning = !!d.ctx.checkpoint.respawning;
      s.hint = (document.getElementById("hint") || {}).textContent || "";
      s.dead = !!d.ctx.health.dead;
      if (L && s.levelN === 9 && s.mode === "level" && d.world && !s.lair) {
        const w = d.world;
        s.floor = w.heightAt(d.player.x, d.player.z);
        const M = L.tribe.members, mm = {};
        for (const k of ["moss", "burra", "tika", "rok", "nib"]) { const m = M[k]; mm[k] = { x: m.x, y: m.y, z: m.z, vis: m.visible !== false, floor: w.heightAt(m.x, m.z) }; }
        s.M = mm;
        s.enemies = L.combat.enemies.filter((e) => e.alive).map((e) => ({ x: e.x, y: e.y, z: e.z, state: e.state, aware: !!e.aware, passive: !!e.passive, big: !!e.big, floor: w.heightAt(e.x, e.z) }));
        s.allies = L.combat.allies.filter((a) => a.alive).map((a) => ({ x: a.x, z: a.z }));
      }
      return s;
    });
    if (s && s.render) {
      if (s.render.calls > maxCalls) { maxCalls = s.render.calls; maxWhere = s.step; }
      if (s.render.triangles > maxTris) { maxTris = s.render.triangles; report.maxTrisWhere = s.step + " at " + (s.player.x | 0) + "," + (s.player.z | 0) + " calls " + s.render.calls; }
      if (s.render.triangles > 250000 && (report.overBudget || []).length < 4) {
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
        else if (!o.noJump) { await press("Space"); lastT = Date.now(); }
      }
      await sleep(60);
    }
    await up("KeyW");
    return res;
  }
  // walk, and if the walk fails, put the player there through the seam (logged)
  async function go(p, o, why) {
    const r = await walk(() => p, o);
    if (r === "stuck" || r === "timeout") {
      const s = await st();
      fallback("walk " + r + " to " + (why || JSON.stringify(p)) + " from " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1));
      await shot("stuck-" + (why || "walk"));
      await tp(p.x, p.z, why);
    }
    return r;
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
  async function filmWhile(name, cond, every, maxMs, each) {
    const t0 = Date.now(); let i = 0, lastShot = 0, lastStep = "";
    while (Date.now() - t0 < maxMs) {
      const s = await st();
      if (!s || !cond(s)) break;
      if (each) await each(s);
      const sig = s.step;
      if (Date.now() - lastShot >= every || sig !== lastStep) {
        lastShot = Date.now(); lastStep = sig;
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
    if (s.M) for (const k in s.M) { const m = s.M[k]; if (m.vis && Math.abs(m.y - m.floor) > 0.4 && m.y > -50) bad.push(k + " " + (m.y - m.floor).toFixed(2)); }
    if (s.enemies) for (const e of s.enemies) if (Math.abs(e.y - e.floor) > 0.4) bad.push("enemy " + (e.y - e.floor).toFixed(2));
    log("  ground " + label + ": player " + dp.toFixed(2) + " at " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1) + (s.player.inWater ? " (water)" : "") + (bad.length ? " OFF " + bad.join(", ") : ""));
    if (!s.player.inWater && !s.acting && s.player.grounded && Math.abs(dp) > 0.3) fallback("player not on the ground at " + label + ": " + dp.toFixed(2));
    if (bad.length) report.offGround = (report.offGround || []).concat([label + ": " + bad.join(", ")]);
  };
  const free = (ms) => waitFor((x) => x.lock <= 0 && x.player.enabled && !x.cinema.playing, ms || 8000, "free");
  let PP = null;
  const getP = () => page.evaluate(() => {
    const L = window.__platy.ctx.debug.level9, P = L.jungle.P, o = {}, c = (p) => ({ x: p.x, z: p.z });
    for (const k of ["campGate", "campEdge", "seat", "fire", "foodStore", "bench", "bed", "hoard", "rival", "rivalGate", "rivalTotem", "rivalBreach", "rivalFire", "leafGrove", "vineWall", "boneYard"]) o[k] = c(P[k]);
    for (const k of ["huntPath", "logBridge", "rivalPath", "ambush", "rivalDrink"]) o[k] = P[k].map(c);
    o.leaf = P.matSpots.leaf.map(c); o.vine = P.matSpots.vine.map(c); o.bone = P.matSpots.bone.map(c);
    o.rivalR = L.jungle.rival.r;
    return o;
  });
  // hit the nearest awake enemy until pred(s) or no one is left in reach
  async function fight(pred, ms, label) {
    const tEnd = Date.now() + ms; let hits = 0, lastShot = 0, i = 0;
    while (Date.now() < tEnd) {
      const s = await st();
      if (pred(s)) break;
      if (s.dead || s.respawning || !s.player.enabled) { await upAll(); await sleep(300); continue; }
      const es = (s.enemies || []).filter((e) => !e.passive || e.aware);
      if (!es.length) { await upAll(); await sleep(200); continue; }
      es.sort((a, b) => D(a, s.player) - D(b, s.player));
      const e = es[0], d = D(e, s.player);
      await aimAt(e.x, e.z);
      if (d > 1.2) { await down("KeyW"); await sleep(80); continue; }
      await up("KeyW");
      await press(hits % 4 === 3 ? "KeyL" : "KeyJ"); hits++;
      if (Date.now() - lastShot > 2200) { lastShot = Date.now(); await shot(label + "-" + (i++)); }
      await sleep(260);
    }
    await upAll();
    return hits;
  }

  // ---------------------------------------------------------------- the beats
  async function beatIntro() {
    await sleep(700); await shot("title");
    const t = await filmWhile("intro", (x) => x.step === "intro", 1500, 40000);
    log("intro ran " + t.toFixed(1) + " s");
  }
  async function beatMeet() {
    let s = await waitFor((x) => x.step === "meet" && x.player.enabled, 15000, "meet playable");
    PP = PP || await getP();
    await sleep(800); await shot("meet-start"); ground(await st(), "meet start");
    await fpsMeasure("camp_dusk");
    const greetOne = async (k, label) => {
      const re = new RegExp(label);
      for (let t = 0; t < 5; t++) {
        await walk((x) => x.M[k], { stop: 1.3, timeout: 20000, until: (x) => re.test(x.actionLabel) });
        await sleep(150);
        s = await st();
        if (!re.test(s.actionLabel)) { log("  no '" + label + "' prompt yet (" + s.actionLabel + ")"); continue; }
        if (t === 0) await shot("meet-prompt-" + k);
        await press("KeyE"); await sleep(250);
        const q = await st();
        if (q.meetBusy > 0) { await sleep(900); await shot("meet-" + k); return true; }
        log("  E at " + k + " did nothing (prompt '" + q.actionLabel + "', lock " + q.lock.toFixed(2) + "), again");
      }
      fallback("could not greet " + k);
      return false;
    };
    // Burra
    await greetOne("burra", "Greet Old Burra");
    await waitFor((x) => x.met >= 1 && x.meetBusy <= 0, 8000, "Burra met");
    // Tika
    await greetOne("tika", "Greet Tika");
    await waitFor((x) => x.met >= 2 && x.meetBusy <= 0, 8000, "Tika met");
    // Rok: the shove, then slap him back
    await greetOne("rok", "Greet Rok");
    await sleep(1400); await shot("meet-rok-shoved");
    s = await st(); log("  after the shove: hint '" + s.hint + "'");
    for (let k = 0; k < 6 && (await st()).met < 3; k++) {
      await walk((x) => x.M.rok, { stop: 1.3, timeout: 6000 });
      await press("KeyL"); await sleep(1300);
    }
    await shot("meet-rok-slapped");
    await waitFor((x) => x.met >= 3, 6000, "Rok met");
    // Nib: hide and seek twice
    await greetOne("nib", "Greet Nib");
    for (let round = 0; round < 2; round++) {
      if (round > 0) await waitFor((x) => !x.nibHidden || x.met >= 4, 4000, "Nib runs off").catch(() => {});
      await waitFor((x) => (x.nibHidden && D(x.M.nib, x.player) > 2.5) || x.met >= 4, 14000, "Nib hidden");
      await sleep(400); await shot("meet-nib-hidden-" + round);
      const before = (await st()).met;
      const r = await walk((x) => x.M.nib, { stop: 1.4, timeout: 25000, until: (x) => /Found/.test(x.actionLabel) || x.met > before });
      if (r === "stuck" || r === "timeout") { const q = await st(); fallback("walk to hidden Nib " + r + " at " + q.player.x.toFixed(1) + "," + q.player.z.toFixed(1)); await tp(q.M.nib.x - 1, q.M.nib.z - 1, "Nib"); await sleep(400); }
      s = await st();
      if (/Found/.test(s.actionLabel)) { await shot("meet-nib-found-prompt-" + round); await press("KeyE"); }
      else if (s.met === before) fallback("no 'Found you!' prompt at Nib, round " + round);
      await sleep(1200); await shot("meet-nib-found-" + round);
    }
    await waitFor((x) => x.met >= 4, 8000, "all four met");
    await filmWhile("meet-done", (x) => x.step === "meet", 1200, 6000);
  }
  async function beatFood() {
    await waitFor((x) => x.step === "food", 10000, "food");
    await sleep(800); await shot("food-start");
    for (let k = 0; k < 3; k++) {
      await waitFor((x) => x.food > k || x.serving === k, 5000, "serving " + k);
      const t0 = Date.now(); let ok = false;
      while (Date.now() - t0 < 30000) {
        const s = await st();
        if (s.food > k) { ok = true; break; }
        if (/Eat/.test(s.actionLabel)) { await shot("food-eat-prompt-" + k); await press("KeyE"); await sleep(600); await shot("food-eating-" + k); await waitFor((x) => x.food > k, 6000, "ate " + k); ok = true; break; }
        // the dish lands near us: walk to whoever brings it, or stand still
        const f = await page.evaluate((i) => { const T = window.__platy.ctx.debug.level9.tribe, o = {}; if (!T.food.active(i)) return null; T.food.pos(i, o); return { x: o.x, z: o.z }; }, k);
        if (f && Math.hypot(f.x - s.player.x, f.z - s.player.z) > 1.2 && Math.hypot(f.x - s.player.x, f.z - s.player.z) < 12) await walk(() => f, { stop: 1.0, timeout: 4000, until: (x) => /Eat/.test(x.actionLabel) });
        else await sleep(300);
      }
      if (!ok) fallback("food " + k + " never became eatable");
      log("  ate " + (k + 1) + " (" + ((Date.now() - t0) / 1000).toFixed(1) + " s)");
    }
    await sleep(400); await shot("food-hearts");
    await filmWhile("food-store", (x) => x.step === "food", 1300, 30000);
  }
  async function beatHunt() {
    await waitFor((x) => x.step === "hunt" && x.player.enabled, 15000, "hunt");
    PP = PP || await getP();
    await sleep(600); await shot("hunt-start"); ground(await st(), "hunt start");
    const pts = PP.huntPath.slice(1).concat([PP.logBridge[0], PP.logBridge[1], PP.rivalPath[0], PP.ambush[0]]);
    let i = 0, fpsDone = false;
    for (const p of pts) {
      if ((await st()).step !== "hunt") break;
      await go(p, { stop: 1.4, timeout: 30000, until: (x) => x.step !== "hunt" }, "hunt point " + i);
      await sleep(150); await shot("hunt-" + (i++));
      const s = await st(); ground(s, "hunt " + i);
      log("  hunt point " + i + ", hunters " + s.hunters + ", cp " + s.checkpoint);
      if (!fpsDone && i === 3) { fpsDone = true; await fpsMeasure("hunt_party_night"); }
    }
    await waitFor((x) => x.step === "ambush", 10000, "the ambush");
    await sleep(600); await shot("ambush-burst");
    let fpsA = false;
    const hits = await fight((x) => x.step !== "ambush", 90000, "ambush");
    void fpsA;
    log("  ambush: " + hits + " presses");
    if ((await st()).step === "ambush") fallback("the ambush did not end");
  }
  async function beatRival() {
    await waitFor((x) => x.step === "rival" && x.player.enabled, 15000, "rival");
    PP = PP || await getP();
    await sleep(800); await shot("rival-start"); ground(await st(), "rival start");
    // the creek way: walk round to the water behind the camp and pulse the drinkers
    // round the west and north of the thorn ring (the east side is the edge of the world) to the creek mouth
    const route = [{ x: 36, z: 14 }, { x: 34.5, z: 24 }, { x: 35, z: 36 }, { x: 38.5, z: 45 }, { x: 46, z: 50.5 }, { x: 54, z: 51 }, { x: 58, z: 50 }];
    for (let i = 0; i < route.length; i++) { await go(route[i], { stop: 1.4, timeout: 25000, until: (x) => x.step !== "rival" }, "round the camp " + i); const q = await st(); log("  route " + i + ": down " + q.down + ", alive " + q.enemies.length + ", aware " + q.enemies.filter((e) => e.aware).length + ", passive " + q.enemies.filter((e) => e.passive).length); }
    await shot("rival-north-bank");
    // the nearest properly wet spot that is not right next to a drinker
    const wet = await page.evaluate(() => {
      const d = window.__platy, J = d.ctx.debug.level9.jungle, p = d.player, E = d.ctx.debug.level9.combat.enemies.filter((e) => e.alive && e.passive);
      let best = null;
      for (let x = 50; x <= 60.5; x += 0.5) for (let z = 36; z <= 52; z += 0.5) {
        const w = J.waterAt(x, z), h = J.heightAt(x, z);
        if (!(w - h > 0.2)) continue;
        if (E.some((e) => Math.hypot(e.x - x, e.z - z) < 1.3)) continue;
        const dd = Math.hypot(x - p.x, z - p.z);
        if (!best || dd < best.d) best = { x, z, d: dd, depth: w - h };
      }
      return best;
    });
    log("  wet spot " + JSON.stringify(wet));
    if (wet) await go(wet, { stop: 0.3, timeout: 15000, until: (x) => x.step !== "rival" || (x.player.inWater && x.player.x > 55) }, "the creek");
    await walk(() => wet, { stop: 0.2, timeout: 1500 });
    let s = await st();
    await sleep(300); await shot("rival-creek"); log("  at the creek " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1) + ": water " + s.player.inWater + ", hint '" + s.hint + "'");
    if (!s.player.inWater) { await walk(() => wet, { stop: 0.05, timeout: 1200 }); s = await st(); log("  stepped in: water " + s.player.inWater + ", hint '" + s.hint + "'"); }
    const drinkInfo = () => page.evaluate(() => { const d = window.__platy, J = d.ctx.debug.level9.jungle, p = d.player; return d.ctx.debug.level9.combat.enemies.filter((e) => e.alive && J.waterAt(e.x, e.z) > -1e6 && Math.hypot(e.x - p.x, e.z - p.z) < 11).map((e) => e.state + (e.passive ? "/p" : "") + "@" + Math.hypot(e.x - p.x, e.z - p.z).toFixed(1)).join(" "); });
    log("  in the creek before the pulse: " + await drinkInfo());
    const before = (await st()).enemies.length;
    await press("KeyK"); await sleep(1500); await shot("rival-pulse");
    s = await st();
    log("  pulse: enemies " + before + " -> " + s.enemies.length + ", down " + s.down + "; in the creek now: " + await drinkInfo());
    if (before - s.enemies.length < 2) fallback("the creek pulse took down only " + (before - s.enemies.length));
    await fpsMeasure("rival_camp");
    // then the bundles and whoever wakes up
    const tEnd = Date.now() + 240000; let lastShot = 0, k = 0;
    while (Date.now() < tEnd) {
      s = await st();
      if (s.step !== "rival") break;
      if (s.dead || s.respawning) { await upAll(); await sleep(500); continue; }
      const awake = (s.enemies || []).filter((e) => e.aware && D(e, s.player) < 9);
      if (Date.now() - lastShot > 3000) { lastShot = Date.now(); await shot("rival-" + (k++) + "-b" + s.bundles + "-" + s.chief); }
      if (s.carrying >= 0) {
        const a = (s.allies || []).slice().sort((p, q) => D(p, s.player) - D(q, s.player))[0];
        if (a) await walk(() => a, { stop: 0.6, timeout: 3000, until: (x) => x.carrying < 0 });
        continue;
      }
      if (awake.length) { await fight((x) => !(x.enemies || []).some((e) => e.aware && D(e, x.player) < 9) || x.step !== "rival", 8000, "rival-fight"); continue; }
      if (s.bundles < 3) {
        const b = await page.evaluate(() => { const T = window.__platy.ctx.debug.level9.tribe, o = {}, p = window.__platy.player; let best = null; for (let i = 4; i <= 6; i++) { if (!T.food.active(i)) continue; T.food.pos(i, o); const d = Math.hypot(o.x - p.x, o.z - p.z); if (!best || d < best.d) best = { x: o.x, z: o.z, d }; } return best; });
        if (!b) { await sleep(300); continue; }
        await walk(() => b, { stop: 1.1, timeout: 8000, until: (x) => /Take/.test(x.actionLabel) || (x.enemies || []).some((e) => e.aware && D(e, x.player) < 5) });
        s = await st();
        if (/Take/.test(s.actionLabel)) { await press("KeyE"); await sleep(500); await shot("rival-take-" + s.bundles); }
        continue;
      }
      // all bundles out, the chief left
      const any = (s.enemies || []).slice().sort((p, q) => D(p, s.player) - D(q, s.player))[0];
      if (any) await fight((x) => x.step !== "rival" || x.chief === "beaten", 10000, "rival-chief");
      else await sleep(300);
    }
    s = await st();
    log("  rival: bundles " + s.bundles + ", chief " + s.chief + ", down " + s.down + ", hp " + s.hp + ", tries " + JSON.stringify(s.svc && s.svc.checkpoint));
    if (s.step === "rival") fallback("the rival camp did not end (bundles " + s.bundles + ", chief " + s.chief + ")");
  }
  async function beatHome() {
    await waitFor((x) => x.step === "home" && x.player.enabled, 15000, "home");
    PP = PP || await getP();
    await sleep(600); await shot("home-start");
    const pts = [PP.rivalPath[1], PP.rivalPath[0], PP.logBridge[1], PP.logBridge[0]].concat(PP.huntPath.slice(0, 5).reverse(), [PP.campEdge, PP.seat]);
    let i = 0;
    for (const p of pts) {
      if ((await st()).step !== "home") break;
      const r = await go(p, { stop: 1.6, timeout: 30000, until: (x) => x.step !== "home" }, "home point " + i);
      if (i % 2 === 0 || i > 8) { await sleep(150); await shot("home-" + i); }
      i++;
      void r;
    }
    await filmWhile("home-arrive", (x) => x.step === "home", 1400, 12000);
  }
  async function beatGather() {
    await waitFor((x) => x.step === "gather" && x.player.enabled, 15000, "gather");
    PP = PP || await getP();
    await sleep(800); await shot("gather-start");
    const mats = () => page.evaluate(() => { const M = window.__platy.ctx.debug.level9.tribe.materials, o = {}, r = []; for (let i = 0; i < M.count; i++) { if (!M.active(i)) continue; M.pos(i, o); r.push({ id: i, kind: M.kind(i), x: o.x, y: o.y, z: o.z, hang: M.hanging(i) }); } return r; });
    // leaves
    await go(PP.leafGrove, { stop: 3, timeout: 40000 }, "the leaf grove");
    await sleep(300); await shot("gather-grove");
    await fpsMeasure("gather_grove");
    for (let k = 0; k < 14 && (await st()).leaf < 4; k++) {
      const s = await st();
      const L = (await mats()).filter((m) => m.kind === "leaf").sort((a, b) => D(a, s.player) - D(b, s.player));
      if (!L.length) break;
      const m = L[0];
      await walk(() => m, { stop: 0.4, timeout: 8000 });
      if (m.hang) { if (k % 2) await press("KeyL"); else await press("Space"); await sleep(1600); await shot("gather-leaf-" + k); }
      const f = (await mats()).find((q) => q.id === m.id);
      if (f && !f.hang) { await walk(() => f, { stop: 0.25, timeout: 4000, noJump: true }); await sleep(300); }
    }
    let s = await st(); log("  leaves " + s.leaf);
    if (s.leaf < 4) fallback("only " + s.leaf + " leaves");
    // vines
    await go({ x: PP.vine[0].x, z: PP.vine[0].z - 1.4 }, { stop: 0.6, timeout: 40000 }, "vine 0");
    s = await waitFor((x) => /Pull/.test(x.actionLabel), 4000, "pull prompt").catch(() => st());
    await shot("gather-vine0-prompt");
    await press("KeyE"); await sleep(500); await shot("gather-vine0-pull");
    await waitFor((x) => x.vine >= 1, 4000, "vine 1 of 2");
    await walk(() => ({ x: PP.vine[1].x, z: PP.vine[1].z - 1.4 }), { stop: 0.5, timeout: 8000 });
    await waitFor((x) => /Pull/.test(x.actionLabel), 4000, "pull prompt 2").catch(() => {});
    await press("KeyE");
    await waitFor((x) => x.needMoss === 1, 4000, "stuck vine");
    await sleep(300); await shot("gather-vine-stuck");
    await walk((x) => x.M.moss, { stop: 1.4, timeout: 8000, until: (x) => /Call Moss/.test(x.actionLabel) || x.needMoss !== 1 });
    if (/Call Moss/.test((await st()).actionLabel)) { await shot("gather-call-moss"); await press("KeyE"); } else fallback("no Call Moss prompt");
    await waitFor((x) => x.needMoss === 3, 12000, "Moss at the vine");
    await walk(() => ({ x: PP.vine[1].x, z: PP.vine[1].z - 1.4 }), { stop: 0.5, timeout: 8000, until: (x) => /together/.test(x.actionLabel) });
    s = await st(); if (!/together/.test(s.actionLabel)) fallback("no 'Pull together' prompt (" + s.actionLabel + ")");
    await press("KeyE"); await sleep(500); await shot("gather-pull-together");
    await waitFor((x) => x.vine >= 2, 4000, "vines done");
    // bones: slap the sand; the second one has the crab on it
    await go(PP.boneYard, { stop: 4, timeout: 50000 }, "the bone yard");
    await sleep(300); await shot("gather-boneyard");
    for (let i = 0; i < 2; i++) {
      const b = PP.bone[i];
      if (i === 1) {
        // flip the crab first
        for (let t = 0; t < 6 && (await st()).crab !== "stun"; t++) {
          await walk(() => ({ x: b.x - 1.0, z: b.z - 1.0 }), { stop: 0.4, timeout: 5000, noJump: true });
          await press("KeyL"); await sleep(900);
        }
        await shot("gather-crab-" + (await st()).crab);
      }
      await walk(() => b, { stop: 0.9, timeout: 8000, noJump: true });
      await press("KeyL"); await sleep(1000);
      const bone = (await mats()).filter((m) => m.kind === "bone").sort((p, q) => D(p, b) - D(q, b))[0];
      if (bone) { await walk(() => bone, { stop: 0.25, timeout: 4000, noJump: true }); await sleep(300); }
      s = await st(); await shot("gather-bone-" + i); log("  bones " + s.bone + " crab " + s.crab + " hp " + s.hp);
    }
    s = await st();
    if (s.bone < 2) fallback("only " + s.bone + " bones");
    await sleep(800); await shot("gather-all");
    await go(PP.bench, { stop: 2.5, timeout: 60000, until: (x) => x.step !== "gather" }, "back to Tika");
    await waitFor((x) => x.step === "craft", 6000, "craft");
  }
  async function beatCraft() {
    await waitFor((x) => x.step === "craft", 10000, "craft");
    PP = PP || await getP();
    await walk(() => PP.bench, { stop: 1.8, timeout: 6000 });
    await sleep(600); await shot("craft-start");
    for (let k = 0; k < 16 && (await st()).craftPhase === 0; k++) {
      const s = await st();
      if (/Place/.test(s.actionLabel)) { await press("KeyE"); await sleep(420); if (k === 3 || k === 7) await shot("craft-place-" + k); }
      else { await walk(() => PP.bench, { stop: 1.6, timeout: 3000 }); await sleep(200); }
    }
    await waitFor((x) => x.craftPhase === 1, 4000, "lacing");
    await sleep(700); await shot("craft-lacing");
    // one miss on purpose, then three good pulls
    await press("KeyE"); await sleep(700); await shot("craft-lace-press");
    for (let k = 0; k < 40 && (await st()).craftPhase === 1; k++) {
      const s = await st();
      if (s.sweep >= s.zone[0] + 0.04 && s.sweep <= s.zone[1] - 0.04) { await press("KeyE"); await sleep(250); await shot("craft-pull-" + s.pulls); await sleep(400); }
      else await sleep(30);
    }
    let s = await waitFor((x) => x.craftPhase === 2, 6000, "wear prompt");
    await sleep(500);
    s = await st(); if (!/Wear/.test(s.actionLabel)) fallback("no 'Wear it' prompt (" + s.actionLabel + ")");
    await shot("craft-wear-prompt");
    await press("KeyE");
    await filmWhile("craft-wear", (x) => x.cinema.playing, 1000, 15000);
    await sleep(400); await shot("craft-armored"); ground(await st(), "after the armor");
    await filmWhile("craft-rok-test", (x) => x.step === "craft", 1500, 16000);
    s = await st(); log("  armor " + s.armor + ", helm " + s.helm);
    if (!s.armor) fallback("no armor after the craft");
  }
  async function beatNight() {
    await waitFor((x) => x.step === "night" && x.player.enabled, 10000, "night");
    PP = PP || await getP();
    await walk(() => ({ x: PP.fire.x - 4.2, z: PP.fire.z - 1 }), { stop: 0.8, timeout: 8000 });
    await sleep(2500); await shot("night-dance-start");
    await fpsMeasure("night_dance");
    // jump on the beat (the test reads the beat phase, the press is real)
    const t0 = Date.now(); let tries = 0;
    while (Date.now() - t0 < 14000 && (await st()).nightPhase === 0) {
      const ph = await page.evaluate(() => window.__platy.music.beatPhase());
      const bpm = (await st()).music.bpm || 96;
      const wait = ((1 - ph) * 60000) / bpm - 30;
      if (wait > 0 && wait < 1500) await sleep(wait);
      await press("Space"); tries++;
      if (tries === 2) await shot("night-jump");
      await sleep(500);
    }
    let s = await st(); log("  beats " + s.beats + " of " + tries + " jumps");
    if (s.beats < 3) fallback("only " + s.beats + " of " + tries + " beat jumps counted");
    await shot("night-beats");
    await walk((x) => x.M.burra, { stop: 1.6, timeout: 12000, until: (x) => /Burra/.test(x.actionLabel) || x.nightPhase > 0 });
    if (/Burra/.test((await st()).actionLabel)) await press("KeyE"); else fallback("no Talk to Old Burra prompt");
    await waitFor((x) => x.nightPhase === 1, 4000, "bedtime");
    await sleep(1500); await shot("night-bedtime");
    await walk(() => PP.bed, { stop: 1.2, timeout: 25000, until: (x) => /Sleep/.test(x.actionLabel) || x.step !== "night" });
    s = await st(); if (!/Sleep/.test(s.actionLabel)) fallback("no Sleep prompt at the bed");
    await shot("night-sleep-prompt");
    await press("KeyE");
    await filmWhile("sleep", (x) => x.step === "sleep", 1500, 30000);
    let fpsDone = false;
    await filmWhile("vision", (x) => x.step === "vision", 1200, 40000, async (s2) => { if (!fpsDone && s2.cinema.faded < 0.3) { fpsDone = true; await fpsMeasure("vision_lair"); } });
    await filmWhile("wake", (x) => x.step === "wake", 1000, 20000);
    await waitFor((x) => x.step === "done", 10000, "the level card");
    const vis = await page.waitForFunction(() => document.getElementById("victory").classList.contains("on"), { timeout: 10000 }).then(() => true, () => false);
    if (!vis) fallback("no level complete card");
    await sleep(1200); await shot("complete-card");
    await clickAgain();
  }

  // the Continue button takes a moment to arm: press it until the level fades out
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
    await page.evaluate(() => { window.__platy.startLevel(9); });
    return waitFor((x) => x.mode === "level" && x.levelN === 9 && x.step === "intro", 40000, label);
  };

  let s;
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
    const gpu = await page.evaluate(() => { const gl = window.__platy.renderer.getContext(); const e = gl.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; });
    log("gpu: " + gpu);
    await page.evaluate(() => { window.__platy.resetProgress(); window.__platy.unlock(9); });
    await sleep(500);
    await shot("menu");
    if (await page.evaluate(() => document.getElementById("lvl9").classList.contains("locked"))) throw new Error("level 9 is locked after unlock(9)");
    if (!EXTRAS) {
    await page.click("#lvl9");
    s = await waitFor((x) => x.mode === "level" && x.levelN === 9, 40000, "level 9 running");
    const beats = [["intro", beatIntro], ["meet", beatMeet], ["food", beatFood], ["hunt", beatHunt], ["rival", beatRival], ["home", beatHome], ["gather", beatGather], ["craft", beatCraft], ["night", beatNight]];
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
    else if (ONLY && ONLY !== "night") await shot("only-end");
    else {
      s = await backToMenu("after the level card");
      if (!s.progress.beaten[8]) throw new Error("level 9 is not marked beaten: " + JSON.stringify(s.progress));
      await sleep(1800); await shot("menu-level9-beaten");
      const tick = await page.evaluate(() => { const b = document.getElementById("lvl9"), c = document.getElementById("lvl10"); return { cls: b.className, next: c ? c.className : "?" }; });
      log("level complete -> main screen; " + JSON.stringify(tick) + ", progress " + JSON.stringify(s.progress));
      if (!/beaten|done/.test(tick.cls)) fallback("the level 9 circle does not show as beaten (class '" + tick.cls + "')");
      if (s.progress.unlocked < 10) fallback("level 10 was not unlocked: " + s.progress.unlocked);
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
      await enterLevel("skip chain");
      for (const b of ["meet", "food", "hunt", "ambush", "rival", "home", "gather", "craft", "night", "sleep", "vision", "wake", "rival", "gather", "intro", "craft"]) {
        const ok = await page.evaluate((x) => window.__platy.skipTo(x), b);
        if (!ok) throw new Error("skipTo " + b + " failed");
        await sleep(2600);
        s = await st();
        await shot("skipTo-" + b + "-" + s.step);
        if (["meet", "food", "hunt", "rival", "gather", "craft", "night"].includes(b)) ground(s, "skipTo " + b);
      }
      log("skipTo chain ok");
      await page.evaluate(() => window.__platy.quit());
      await backToMenu("after quitting");
      s = await enterLevel("re-entry");
      if (s.met !== 0 || s.armor || s.timeScale !== 1 || s.lair || s.bundles) throw new Error("re-entry is not clean: " + JSON.stringify({ met: s.met, armor: s.armor, ts: s.timeScale, lair: s.lair, b: s.bundles }));
      await page.evaluate(() => window.__platy.win());
      await sleep(800); await clickAgain();
      await backToMenu("after win()");
      log("quit, re-entry, win() ok");
      // phone portrait + landscape
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true });
      await page.evaluate(() => { document.body.classList.add("touch"); });
      await sleep(600);
      await enterLevel("phone");
      await sleep(4000); await shot("phone-portrait-intro");
      for (const b of ["meet", "ambush", "rival", "gather", "craft", "vision"]) {
        await page.evaluate((x) => window.__platy.skipTo(x), b);
        await sleep(b === "vision" ? 7000 : 3000);
        await shot("phone-portrait-" + b);
      }
      await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, hasTouch: true });
      await sleep(600);
      for (const b of ["food", "rival", "night"]) {
        await page.evaluate((x) => window.__platy.skipTo(x), b);
        await sleep(3000);
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
      await sp.screenshot({ path: path.join(SHOTS, "l9-sheet-" + String(k).padStart(2, "0") + ".png") });
    }
  } catch (e) { console.log("contact sheets failed: " + e); }

  await browser.close();
  srv.close();
  fs.writeFileSync(path.join(SHOTS, "l9-report.json"), JSON.stringify(report, null, 2));
  console.log("fallbacks: " + report.fallbacks.length);
  for (const f of report.fallbacks) console.log("  " + f);
  console.log("errors: " + errors.length);
  for (const e of errors.slice(0, 30)) console.log("  " + e.slice(0, 600));
  console.log(report.ok ? "PLAYTEST-L9 OK" : "PLAYTEST-L9 FAILED");
  process.exit(report.ok && errors.length === 0 ? 0 : 1);
})();
