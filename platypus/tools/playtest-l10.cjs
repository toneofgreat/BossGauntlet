// Level 10 "THE BASE": full browser playthrough (modelled on playtest-l5.cjs / playtest-l9.cjs).
//   node tools/playtest-l10.cjs               the whole level, then the extra checks
//   node tools/playtest-l10.cjs --from=door   start the real playthrough at a beat (skipTo)
//   node tools/playtest-l10.cjs --only=yard   play just that beat, then stop
//   node tools/playtest-l10.cjs --until=apron
//   node tools/playtest-l10.cjs --play        only the playthrough
//   node tools/playtest-l10.cjs --extras      only the checks after the playthrough
// Beats: intro, fence, yard, apron, door, armoury, fightout, fuel, gate, home (home + the fire + the card).
// The playing is real keys (WASD, Shift, L, E, F); the seam reads state, aims the follow camera and
// (only where a walk gets stuck, logged) teleports.
// Screenshots: tools/shots/l10-NNN-name.png, plus 2x2 contact sheets tools/shots/l10-sheet-NN.png.
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const arg = (k) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=")[1] : null; };
const FROM = arg("from"), ONLY = arg("only"), UNTIL = arg("until"), PLAY = process.argv.includes("--play"), EXTRAS = process.argv.includes("--extras");
const ORDER = ["intro", "fence", "yard", "apron", "door", "armoury", "fightout", "fuel", "gate", "home"];

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
  for (const f of fs.readdirSync(SHOTS)) if (f.startsWith("l10-")) fs.unlinkSync(path.join(SHOTS, f));
  const srv = await serve();
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
    defaultViewport: { width: 1280, height: 720 },
  });
  // a watchdog under the 10-minute tool limit: never leave a browser behind
  const LIMIT = +(arg("limit") || 720) * 1000;
  setTimeout(async () => { console.log("WATCHDOG: " + LIMIT / 1000 + " s, closing"); try { await page.screenshot({ path: path.join(SHOTS, "l10-watchdog.png") }); } catch (_) {} try { await browser.close(); } catch (_) {} srv.close(); process.exit(2); }, LIMIT).unref();
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
    const f = path.join(SHOTS, "l10-" + String(n).padStart(3, "0") + "-" + name + ".png");
    await page.screenshot({ path: f });
    report.shots.push(f);
    return f;
  };
  let maxCalls = 0, maxTris = 0, maxWhere = "";
  const st = async () => {
    const s = await page.evaluate(() => {
      const d = window.__platy; if (!d) return null;
      const s = d.state(), L = d.ctx.debug.level10;
      s.actionLabel = d.ui.actionOn ? (document.getElementById("actionTxt") || {}).textContent || "" : "";
      s.lock = d.player.lock;
      s.gy = d.platypus.group.position.y;
      s.respawning = !!d.ctx.checkpoint.respawning;
      s.hint = (document.getElementById("hint") || {}).textContent || "";
      s.dead = !!d.ctx.health.dead;
      s.hpNow = d.ctx.health.hp;
      if (L && s.levelN === 10 && s.mode === "level" && d.world) {
        const w = d.world;
        s.world = w.name;
        s.floor = w.heightAt(d.player.x, d.player.z);
        const C = L.combat;
        s.enemies = C.enemies.filter((e) => e.alive).map((e) => ({ x: e.x, y: e.y, z: e.z, state: e.state, aware: !!e.aware, kind: e.kind, hp: e.hp, floor: w.heightAt(e.x, e.z), los: w.sight ? w.sight(d.player.x, d.player.z, e.x, e.z) : true }));
        s.allies = C.allies.filter((a) => a.alive).map((a) => ({ x: a.x, y: a.y, z: a.z, hero: !!a.hero, state: a.state, floor: w.heightAt(a.x, a.z) }));
        if (w.name === "base") {
          const B = L.base;
          s.lights = B.lights.map((q) => ({ x: q.x, z: q.z, r: q.r, on: q.on, blinded: !!q.blinded }));
          s.lever = B.lever.pulled; s.doorHits = B.doors.armoury.hits; s.doorOpen = B.doors.armoury.opened;
          s.fuelX = B.fuel.exploded; s.mainGate = !!(B.gates.main.blown || B.gates.main.opened);
        }
      }
      return s;
    });
    if (s && s.render) {
      if (s.render.calls > maxCalls) { maxCalls = s.render.calls; maxWhere = s.step; }
      if (s.render.triangles > maxTris) { maxTris = s.render.triangles; report.maxTrisWhere = s.step + " at " + (s.player.x | 0) + "," + (s.player.z | 0) + " calls " + s.render.calls; }
      if (s.render.triangles > 250000 && (report.overBudget || []).length < 4) {
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
  const noteDeaths = async (beat) => { const s = await st(); report.deaths[beat] = s.deaths; log("  " + beat + ": deaths so far " + s.deaths + ", tries " + s.tries + ", hp " + s.hp + ", squad " + s.squad + ", lost " + s.lost); };

  // a stealth leg: wait until neither searchlight will sweep over the straight walk from here to "to" (the test reads
  // the sweep phase, like a player watching the disc), then walk it sneaking. Returns the walk result.
  async function leg(to, o) {
    o = o || {};
    const t0 = Date.now();
    for (;;) {
      if (o.nowait) break;
      const ok = await page.evaluate((tx, tz, spd, guards) => {
        const d = window.__platy, B = d.ctx.debug.level10.base, p = d.player;
        const SW = [(t) => [-14 + 9 * Math.cos(t * 6.2832), 18 + 10.5 * Math.sin(t * 6.2832)], (t) => [14 + 14 * Math.cos(t * 6.2832), 24 + 9 * Math.sin(t * 2 * 6.2832)]];
        const len = Math.hypot(tx - p.x, tz - p.z), T = len / spd + 1.2;
        for (let i = 0; i < 2; i++) {
          const L = B.lights[i];
          if (!L.on || L.blinded || L.target) continue;
          for (let t = 0; t <= T; t += 0.1) {
            const k = Math.min(1, t / (T - 1.2 || 1)), x = p.x + (tx - p.x) * k, z = p.z + (tz - p.z) * k;
            const q = SW[i](L.phase + (t * (B.alarm ? 1.25 : 1)) / L.period);
            if (Math.hypot(q[0] - x, q[1] - z) < L.r + 1.3) return false;
          }
        }
        // and no guard who has not seen us within 7 m of the way
        const E = guards ? d.ctx.debug.level10.combat.enemies : [];
        for (const e of E) {
          if (!e.alive || e.aware) continue;
          for (let k = 0; k <= 1; k += 0.1) { const x = p.x + (tx - p.x) * k, z = p.z + (tz - p.z) * k; if (Math.hypot(e.x - x, e.z - z) < 7) return false; }
        }
        return true;
      }, to.x, to.z, o.speed || 1.45, o.guards !== false);
      if (ok) break;
      const s = await st();
      if (s.dead || s.respawning) return "died";
      if (Date.now() - t0 > (o.wait || 20000)) { log("  leg: gave up waiting for the light"); break; }
      await sleep(120);
    }
    return walk(() => to, Object.assign({ stop: 0.8, timeout: 20000, sneak: true }, o));
  }
  // stand still (sneaking) until pred, a death counts as "died"
  async function waitUntil(pred, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const s = await st(); if (s.dead || s.respawning) return "died"; if (pred(s)) return "ok"; await sleep(100); }
    return "timeout";
  }
  // the blaster: face the nearest enemy and fire; finish stunned ones with the tail
  async function shootout(pred, ms, label, o) {
    o = o || {};
    const tEnd = Date.now() + ms; let shots = 0, lastShot = 0, i = 0;
    while (Date.now() < tEnd) {
      const s = await st();
      if (pred(s)) break;
      if (s.dead || s.respawning || !s.player.enabled) { await upAll(); await sleep(300); continue; }
      const es = (s.enemies || []).filter((e) => D(e, s.player) < (o.reach || 18));
      if (!es.length) { await upAll(); if (o.idle) { await o.idle(s); } else await sleep(200); continue; }
      es.sort((a, b) => D(a, s.player) - D(b, s.player));
      const e = es[0], d = D(e, s.player);
      await up("KeyW");
      await aimAt(e.x, e.z);
      if ((e.state === "stunned" && d < 6) || s.ammo === 0) {
        if (d > 1.2) { await down("KeyW"); await sleep(120); await up("KeyW"); continue; }
        await press("KeyL"); await sleep(500);
      } else {
        await page.evaluate(() => window.__platy.player.yaw = window.__platy.cam.yaw);
        await down("KeyF"); await sleep(330); await up("KeyF"); shots++;
      }
      if (Date.now() - lastShot > 2500) { lastShot = Date.now(); await shot(label + "-" + (i++)); log("    " + label + ": at " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1) + " hp " + s.hp + " ammo " + s.ammo + " alive " + s.alive + " near " + es.length + " target " + e.kind + "/" + e.state + "@" + d.toFixed(1) + " hp " + e.hp + " kills " + s.kills); }
    }
    await upAll();
    return shots;
  }

  // walk a route; whenever a soldier we can see is within "reach", stop and fight him (bolts, then the tail on
  // a stunned one). Returns "ok" | "died" | "until".
  async function advance(points, o) {
    o = o || {};
    const reach = o.reach || 12;
    const threat = (x) => (x.enemies || []).filter((e) => (e.los && D(e, x.player) < reach) || D(e, x.player) < 2.5);
    for (let i = 0; i < points.length; i++) {
      for (let k = 0; k < 40; k++) {
        const r = await walk(() => points[i], { stop: o.stop || 1.2, timeout: 20000, until: (x) => (o.until && o.until(x)) || threat(x).length > 0 });
        if (r === "died") return "died";
        const s = await st();
        if (o.until && o.until(s)) return "until";
        if (r === "until") {
          const t0 = Date.now();
          while (Date.now() - t0 < 12000) {
            const q = await st();
            if (q.dead || q.respawning) return "died";
            if (o.until && o.until(q)) return "until";
            const es = threat(q).sort((a, b) => D(a, q.player) - D(b, q.player));
            if (!es.length) break;
            const e = es[0], d = D(e, q.player);
            await aimAt(e.x, e.z);
            if ((e.state === "stunned" && d < 5) || q.ammo === 0) {
              if (d > 1.1) { await down("KeyW"); await sleep(150); await up("KeyW"); continue; }
              await press("KeyL"); await sleep(550);
            } else { await page.evaluate(() => { window.__platy.player.yaw = window.__platy.cam.yaw; }); await down("KeyF"); await sleep(360); await up("KeyF"); }
            if (Date.now() - (o._shotT || 0) > 2500) { o._shotT = Date.now(); await shot((o.label || "fight") + "-" + (o._n = (o._n || 0) + 1)); log("    " + (o.label || "fight") + ": at " + q.player.x.toFixed(1) + "," + q.player.z.toFixed(1) + " hp " + q.hp + " ammo " + q.ammo + " alive " + q.alive + " target " + e.kind + "/" + e.state + "@" + d.toFixed(1) + " hp " + e.hp + " kills " + q.kills); }
          }
          await upAll();
          continue;
        }
        if (r === "stuck" || r === "timeout") { fallback((o.label || "route") + " walk " + r + " to point " + i + " from " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1)); await shot("stuck-" + (o.label || "route") + "-" + i); await tp(points[i].x, points[i].z, (o.label || "route") + " " + i); }
        break;
      }
    }
    return "ok";
  }

  // ---------------------------------------------------------------- the beats
  async function beatIntro() {
    await sleep(600); await shot("title");
    const t = await filmWhile("intro", (x) => x.step === "intro", 1500, 50000);
    log("intro ran " + t.toFixed(1) + " s");
  }
  async function beatFence() {
    let s = await waitFor((x) => x.step === "fence" && x.player.enabled && !x.cinema.playing, 20000, "fence playable");
    await sleep(1200); await shot("fence-start"); ground(s, "fence start");
    await fpsMeasure("fence_overlook");
    const d0 = s.deaths;
    for (let attempt = 0; attempt < 6; attempt++) {
      s = await st();
      if (s.step !== "fence") break;
      // along the outside of the fence to the hole, sneaking, then through when the west searchlight is away
      let r = await walk(() => ({ x: -10, z: 3.5 }), { stop: 1, timeout: 25000, sneak: true, until: (x) => x.step !== "fence" });
      if (r !== "died") r = await walk(() => ({ x: -14, z: 5.6 }), { stop: 0.6, timeout: 12000, sneak: true, until: (x) => x.step !== "fence" });
      if (r !== "died") { await shot("fence-at-hole-" + attempt); r = await leg({ x: -14, z: 12.5 }, { stop: 0.7 }); }
      s = await st();
      if (s.step !== "fence") break;
      if (r === "died" || s.respawning) await waitFor((x) => !x.respawning && x.player.enabled, 10000, "respawn");
      else { log("  fence walk " + r + " at " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1)); await go({ x: -14, z: 11 }, { stop: 0.6, timeout: 6000 }, "through the hole"); }
    }
    s = await st();
    log("  fence: alarm " + s.alarm + ", seen " + s.seen + ", deaths " + (s.deaths - d0));
    if (s.step === "fence") fallback("never got through the fence hole");
    await sleep(500); await shot("fence-through");
    await noteDeaths("fence");
  }
  async function beatYard() {
    let s = await waitFor((x) => x.step === "yard" && x.player.enabled, 10000, "yard");
    await sleep(300); await shot("yard-start"); ground(s, "yard start");
    for (let attempt = 0; attempt < 8 && (await st()).step === "yard"; attempt++) {
      s = await st();
      if (!s.lever) {
        // along the west side behind the crates, then east past the inner fence to the trucks
        const path = [{ x: -8.6, z: 15.8 }, { x: -3, z: 15.8 }, { x: 5.2, z: 22.2 }, { x: 12, z: 25 }, { x: 18.2, z: 30.2 }];
        let died = false;
        for (let i = 0; i < path.length; i++) {
          const r = i === 0 ? await walk(() => path[0], { stop: 0.8, timeout: 20000, sneak: true }) : await leg(path[i]);
          if (r === "died") { died = true; break; }
          if (r === "stuck" || r === "timeout") { fallback("yard walk " + r + " to " + JSON.stringify(path[i])); await tp(path[i].x, path[i].z, "yard path " + i); }
          if (i === 2) await shot("yard-crates-" + attempt);
          const q = await st(); if (q.alarm) { log("  yard: alarm on at leg " + i + " at " + q.player.x.toFixed(1) + "," + q.player.z.toFixed(1) + ": " + q.enemies.filter((e) => e.aware).map((e) => e.kind + "@" + e.x.toFixed(0) + "," + e.z.toFixed(0) + "/" + e.state).join(" ")); if (!report.yardAlarmShot) { report.yardAlarmShot = 1; await shot("yard-alarm"); } }
        }
        if (died) { await waitFor((x) => !x.respawning && x.player.enabled, 10000, "respawn"); continue; }
        // honk a truck: the officer goes to look
        await aimAt(21, 28); await sleep(200);
        await press("KeyL"); await sleep(900);
        s = await st(); await shot("yard-honk"); log("  honk: hint '" + s.hint + "', officer " + JSON.stringify(s.enemies.filter((e) => e.kind === "officer").map((e) => [e.x.toFixed(1), e.z.toFixed(1), e.state])));
        // hide by the trucks, then to the guardhouse door and the lever
        await waitUntil(() => false, 2500);
        const p2 = [{ x: 14, z: 33 }, { x: 7.0, z: 37.0 }, { x: 7.2, z: 40 }, { x: 10.2, z: 40.6 }];
        for (let i = 0; i < p2.length; i++) {
          const r = await leg(p2[i], { stop: 0.6, guards: false });
          if (r === "died") { died = true; break; }
          if (r === "stuck" || r === "timeout") { fallback("guardhouse walk " + r + " to " + JSON.stringify(p2[i])); await tp(p2[i].x, p2[i].z, "guardhouse " + i); }
        }
        if (died) { await waitFor((x) => !x.respawning && x.player.enabled, 10000, "respawn"); continue; }
        s = await st(); await shot("yard-lever-prompt"); log("  at the lever: action '" + s.actionLabel + "'");
        await aimAt(11, 41.2); await sleep(150);
        for (let k = 0; k < 4 && !(await st()).lever; k++) { await press("KeyL"); await sleep(900); }
        s = await st(); await shot("yard-lever"); log("  lever " + s.lever + ", alarm " + s.alarm);
        await fpsMeasure("yard");
        if (!s.lever) { fallback("the lever did not move"); continue; }
      }
      // through the inner gate NOW
      const r = await walk(() => ({ x: 0, z: 47 }), { stop: 0.8, timeout: 20000, until: (x) => x.step !== "yard" });
      if (r === "died") { await waitFor((x) => !x.respawning && x.player.enabled, 10000, "respawn"); continue; }
    }
    s = await st();
    if (s.step === "yard") fallback("the yard did not end");
    await shot("yard-gate");
    await noteDeaths("yard");
  }
  async function beatApron() {
    let s = await waitFor((x) => x.step === "apron" && x.player.enabled, 10000, "apron");
    await sleep(600); await shot("apron-start"); ground(s, "apron start");
    const rings = [{ x: -12, z: 52 }, { x: -17.5, z: 60 }, { x: -20.5, z: 68 }, { x: -22, z: 77.6 }];
    let fpsDone = false;
    for (let attempt = 0; attempt < 10 && (await st()).step === "apron"; attempt++) {
      let died = false;
      await walk(() => ({ x: 0, z: 49.5 }), { stop: 0.7, timeout: 8000 });
      await sleep(1500); if (attempt === 0) await shot("apron-ambush");
      for (let i = 0; i < rings.length; i++) {
        const r = await walk(() => rings[i], { stop: 0.8, timeout: 15000, until: (x) => x.step !== "apron" });
        if (r === "died") { died = true; break; }
        if ((await st()).step !== "apron") break;
        if (r === "stuck" || r === "timeout") { fallback("apron walk " + r + " to ring " + i); await tp(rings[i].x, rings[i].z, "apron " + i); }
        await shot("apron-" + attempt + "-" + i);
        if (!fpsDone) { fpsDone = true; await fpsMeasure("apron_ambush"); }
        if (i < rings.length - 1) { await down("ShiftLeft"); const w = await waitUntil((x) => x.hpNow > 60, 6000); await up("ShiftLeft"); if (w === "died") { died = true; break; } }
      }
      if (died) { await waitFor((x) => !x.respawning && x.player.enabled, 10000, "respawn"); log("  apron: died, attempt " + attempt); }
    }
    s = await st();
    if (s.step !== "door") fallback("never reached the armoury wall (step " + s.step + ")");
    await sleep(800); await shot("apron-wall");
    log("  wall: squad " + s.squad + ", lost " + s.lost);
    await noteDeaths("apron");
  }
  async function beatDoor() {
    let s = await waitFor((x) => x.step === "door", 10000, "door");
    await sleep(4800); await shot("door-start"); ground(s, "door start");
    const hinge = await page.evaluate(() => { const h = window.__platy.ctx.debug.level10.base.doors.armoury.hinge; return { x: h.x, z: h.z }; });
    for (let k = 0; k < 10 && !(await st()).doorOpen; k++) {
      await walk(() => ({ x: hinge.x + 0.9, z: hinge.z - 0.2 }), { stop: 0.4, timeout: 6000, noJump: true });
      await aimAt(hinge.x, hinge.z); await sleep(150);
      await press("KeyL"); await sleep(1000);
      s = await st(); await shot("door-slap-" + s.doorHits);
      if (s.dead || s.respawning) await waitFor((x) => !x.respawning && x.player.enabled, 10000, "respawn");
    }
    if (!(await st()).doorOpen) fallback("the door did not open");
    await walk(() => ({ x: -27, z: 80 }), { stop: 0.6, timeout: 8000, until: (x) => x.step !== "door" });
    await noteDeaths("door");
  }
  async function beatArmoury() {
    await waitFor((x) => x.step === "armoury", 10000, "armoury");
    await filmWhile("armoury-racks", (x) => x.cinema.playing, 1200, 10000);
    let s = await st(); await shot("armoury-in"); ground(s, "armoury");
    const R = await page.evaluate(() => { const b = window.__platy.ctx.debug.level10.base; const o = {}; for (const k of ["suit", "glasses", "blaster"]) o[k] = { x: b.racks[k].x, z: b.racks[k].z }; o.ammo = b.ammo.map((a) => ({ x: a.x, z: a.z })); o.targets = b.targets.map((t) => ({ x: t.x, z: t.z })); return o; });
    for (const k of ["suit", "glasses", "blaster"]) {
      const p = { x: R[k].x + (k === "blaster" ? 0 : 1.0), z: R[k].z - (k === "blaster" ? 1.0 : 0) };
      await walk(() => p, { stop: 0.5, timeout: 10000, until: (x) => /Take/.test(x.actionLabel) && new RegExp(k).test(x.actionLabel) });
      s = await st();
      if (!new RegExp(k).test(s.actionLabel)) fallback("no Take prompt at the " + k + " (" + s.actionLabel + ")");
      await shot("armoury-prompt-" + k);
      await press("KeyE"); await sleep(1300); await shot("armoury-took-" + k);
    }
    s = await st(); log("  gear " + JSON.stringify(s.gear) + ", ammo " + s.ammo);
    if (s.gear.length < 3) fallback("not all the gear: " + JSON.stringify(s.gear));
    // the firing range
    await walk(() => ({ x: -30.8, z: 79.5 }), { stop: 0.6, timeout: 8000 });
    for (let k = 0; k < 2; k++) {
      await aimAt(R.targets[k].x, R.targets[k].z); await page.evaluate(() => window.__platy.player.yaw = window.__platy.cam.yaw); await sleep(250);
      await press("KeyF"); await sleep(600); await shot("armoury-range-" + k);
    }
    s = await st(); log("  range: hint '" + s.hint + "', ammo " + s.ammo);
    // one ammo crate
    await walk(() => R.ammo[2], { stop: 1.2, timeout: 8000, until: (x) => /ammo/i.test(x.actionLabel) });
    if (/ammo/i.test((await st()).actionLabel)) { await press("KeyE"); await sleep(500); await shot("armoury-ammo"); } else fallback("no Take ammo prompt");
    s = await st(); log("  ammo after the crate " + s.ammo);
    await waitFor((x) => x.step === "fightout", 8000, "fightout armed");
    await sleep(800); await shot("armoury-armed");
  }
  async function beatFightout() {
    await waitFor((x) => x.step === "fightout" && x.player.enabled, 15000, "fightout");
    let s = await st(); await shot("fightout-start");
    let fpsDone = false;
    for (let attempt = 0; attempt < 6 && (await st()).step === "fightout"; attempt++) {
      const r = await advance([{ x: -22, z: 80 }, { x: -19, z: 72 }, { x: -18.5, z: 63 }, { x: -14, z: 57 }, { x: -8, z: 54 }, { x: 0, z: 50 }], { label: "fightout", until: (x) => x.step !== "fightout",
        each: null });
      if (!fpsDone) { fpsDone = true; await fpsMeasure("fightout_apron"); }
      if (r === "died" || (await st()).respawning) { log("  fightout: died, attempt " + attempt); await waitFor((x) => !x.respawning && x.player.enabled, 10000, "respawn"); }
    }
    s = await st(); log("  fightout: step " + s.step + ", kills " + s.kills + ", ammo " + s.ammo + ", squad " + s.squad);
    if (s.step === "fightout") fallback("wave A did not end");
    await noteDeaths("fightout");
  }
  async function beatFuel() {
    await waitFor((x) => x.step === "fuel", 10000, "fuel");
    let s = await st(); await shot("fuel-start");
    // up to the drums, shoot them
    for (let attempt = 0; attempt < 8 && !(await st()).fuelX; attempt++) {
      await walk(() => ({ x: 18, z: 57 }), { stop: 1, timeout: 12000, until: (x) => x.fuelX });
      await shot("fuel-approach-" + attempt);
      for (let k = 0; k < 12 && !(await st()).fuelX; k++) {
        await aimAt(34, 60); await page.evaluate(() => window.__platy.player.yaw = window.__platy.cam.yaw);
        await down("KeyF"); await sleep(400); await up("KeyF");
        s = await st(); if (s.dead || s.respawning) break;
      }
      if ((await st()).respawning) await waitFor((x) => !x.respawning && x.player.enabled, 10000, "respawn");
    }
    s = await st(); await sleep(300); await shot("fuel-blown"); log("  fuel exploded " + s.fuelX + ", alive " + s.alive);
    if (!s.fuelX) fallback("the fuel dump never blew");
    await fpsMeasure("fuel_blast");
    // the main way: back through the inner gate to the yard
    for (let attempt = 0; attempt < 8 && (await st()).step === "fuel"; attempt++) {
      await shootout((x) => x.step !== "fuel" || x.dead || x.respawning, 40000, "fuel-fight", { reach: 12, idle: async () => { await walk(() => ({ x: 0, z: 42 }), { stop: 1, timeout: 4000, until: (x) => x.step !== "fuel" || (x.enemies || []).some((e) => D(e, x.player) < 10) }); } });
      if ((await st()).respawning) await waitFor((x) => !x.respawning && x.player.enabled, 10000, "respawn");
    }
    await noteDeaths("fuel");
  }
  async function beatGate() {
    await waitFor((x) => x.step === "gate", 10000, "gate");
    let s = await st(); await sleep(500); await shot("gate-start"); ground(s, "gate start");
    await fpsMeasure("gate_yard");
    // shoot the west tower lamp on the way
    for (let attempt = 0; attempt < 10 && (await st()).step === "gate"; attempt++) {
      const path = [{ x: -6, z: 34 }, { x: -6, z: 24 }, { x: -2, z: 16 }, { x: 0, z: 10 }, { x: 0, z: 1 }];
      let died = false;
      for (let i = 0; i < path.length; i++) {
        const r = await walk(() => path[i], { stop: 1.2, timeout: 15000, until: (x) => x.step !== "gate" || (x.enemies || []).some((e) => e.aware && D(e, x.player) < 9 && e.state !== "stunned") });
        s = await st();
        if (s.step !== "gate") break;
        if (r === "died") { died = true; break; }
        if (r === "until") { await shootout((x) => x.step !== "gate" || x.dead || x.respawning || !(x.enemies || []).some((e) => D(e, x.player) < 9), 15000, "gate-fight", { reach: 10 }); i--; continue; }
        if (r === "stuck" || r === "timeout") { fallback("gate walk " + r + " to " + JSON.stringify(path[i])); await tp(path[i].x, path[i].z, "gate " + i); }
        await shot("gate-" + attempt + "-" + i);
        if (i === 1 && s.mainGate) await shot("gate-blown");
      }
      if (died || (await st()).respawning) await waitFor((x) => !x.respawning && x.player.enabled, 10000, "respawn");
    }
    s = await st();
    log("  gate: step " + s.step + ", gate blown " + s.gateBlown + ", squad " + s.squad + ", lost " + s.lost);
    if (!s.gateBlown) fallback("the main gate was never blown");
    await noteDeaths("gate");
  }
  async function beatHome() {
    await waitFor((x) => x.step === "home" && x.player.enabled && x.world === "jungle", 20000, "home");
    let s = await st(); await sleep(1500); await shot("home-start"); ground(s, "home start");
    await fpsMeasure("walk_home");
    await go({ x: 40, z: -27 }, { stop: 2.5, timeout: 40000, until: (x) => x.step !== "home" }, "home 1");
    await shot("home-mid");
    await go({ x: 22, z: -24 }, { stop: 2.5, timeout: 40000, until: (x) => x.step !== "home" }, "home 2");
    let fpsDone = false;
    await filmWhile("fire", (x) => x.step === "end", 1800, 90000, async (q) => { if (!fpsDone && q.cinema.faded < 0.2 && q.cinema.playing) { fpsDone = true; await fpsMeasure("camp_fire"); } });
    await waitFor((x) => x.step === "done", 10000, "the level card");
    const vis = await page.waitForFunction(() => document.getElementById("victory").classList.contains("on"), { timeout: 10000 }).then(() => true, () => false);
    if (!vis) fallback("no level complete card");
    await sleep(1200); await shot("complete-card");
    await clickAgain();
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
    await page.evaluate(() => { window.__platy.startLevel(10); });
    return waitFor((x) => x.mode === "level" && x.levelN === 10 && x.step === "intro", 40000, label);
  };

  let s;
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
    const gpu = await page.evaluate(() => { const gl = window.__platy.renderer.getContext(); const e = gl.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; });
    log("gpu: " + gpu);
    await page.evaluate(() => { window.__platy.resetProgress(); window.__platy.unlock(10); });
    await sleep(500);
    await shot("menu");
    if (await page.evaluate(() => document.getElementById("lvl10").classList.contains("locked"))) throw new Error("level 10 is locked after unlock(10)");
    if (!EXTRAS) {
      await page.click("#lvl10");
      s = await waitFor((x) => x.mode === "level" && x.levelN === 10, 40000, "level 10 running");
      const beats = [["intro", beatIntro], ["fence", beatFence], ["yard", beatYard], ["apron", beatApron], ["door", beatDoor], ["armoury", beatArmoury], ["fightout", beatFightout], ["fuel", beatFuel], ["gate", beatGate], ["home", beatHome]];
      const first = ONLY || FROM || "intro";
      if (first !== "intro") { await sleep(1500); const ok = await page.evaluate((b) => window.__platy.skipTo(b), first); if (!ok) throw new Error("skipTo " + first + " failed"); await sleep(1200); }
      for (const [name, fn] of beats) {
        if (ORDER.indexOf(name) < ORDER.indexOf(first)) continue;
        if (ONLY && name !== ONLY) break;
        log("== " + name);
        await fn();
        await upAll();
        if (UNTIL === name) break;
      }
      if (UNTIL) { await shot("until-end"); }
      else if (ONLY && ONLY !== "home") await shot("only-end");
      else {
        s = await backToMenu("after the level card");
        if (!s.progress.beaten[9]) throw new Error("level 10 is not marked beaten: " + JSON.stringify(s.progress));
        await sleep(1800); await shot("menu-level10-beaten");
        const tick = await page.evaluate(() => { const b = document.getElementById("lvl10"), c = document.getElementById("lvl11"); return { cls: b.className, next: c ? c.className : "?" }; });
        log("level complete -> main screen; " + JSON.stringify(tick) + ", progress " + JSON.stringify(s.progress));
        if (!/beaten|done/.test(tick.cls)) fallback("the level 10 circle does not show as beaten (class '" + tick.cls + "')");
        if (s.progress.unlocked < 11) fallback("level 11 was not unlocked: " + s.progress.unlocked);
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
      // a death: the fast restart puts you back at the checkpoint
      await enterLevel("death check");
      await page.evaluate(() => window.__platy.skipTo("apron")); await sleep(1500);
      await walk(() => ({ x: 0, z: 52 }), { stop: 0.5, timeout: 6000 });
      await page.evaluate(() => window.__platy.ctx.health.damage(1000));
      await sleep(400); await shot("death");
      s = await waitFor((x) => !x.respawning && x.player.enabled && x.step === "apron", 15000, "respawn after a death");
      await sleep(600); await shot("respawned");
      log("  death -> respawn at " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1) + ", tries " + s.tries + ", squad " + s.squad + ", ambushed " + s.ambushed);
      if (Math.hypot(s.player.x, s.player.z - 46.5) > 2) fallback("respawn not at cp2: " + s.player.x + "," + s.player.z);
      // the east gap route
      await page.evaluate(() => window.__platy.skipTo("fuel")); await sleep(1500);
      await page.evaluate(() => window.__platy.ctx.debug.level10.base.fuel.explode());
      await sleep(800);
      await go({ x: 38, z: 58 }, { stop: 1, timeout: 25000, until: (x) => x.east }, "east gap");
      await go({ x: 43.2, z: 58 }, { stop: 1, timeout: 15000, until: (x) => x.east }, "east out");
      await sleep(800); await shot("east-gap-run");
      await go({ x: 43.2, z: 40 }, { stop: 1.2, timeout: 15000 }, "east, down the outside");
      s = await st(); await shot("east-gap-" + s.step); log("  east: " + s.east + ", stage " + s.stage);
      if (!s.east) fallback("the east gap route did not trigger");
      for (const b of ["fence", "yard", "apron", "door", "armoury", "fightout", "fuel", "gate", "home", "end", "intro", "gate", "door"]) {
        const ok = await page.evaluate((x) => window.__platy.skipTo(x), b);
        if (!ok) throw new Error("skipTo " + b + " failed");
        await sleep(2600);
        s = await st();
        await shot("skipTo-" + b + "-" + s.step);
        if (["fence", "yard", "apron", "door", "fightout", "gate"].includes(b)) ground(s, "skipTo " + b);
      }
      log("skipTo chain ok");
      await page.evaluate(() => window.__platy.quit());
      await backToMenu("after quitting");
      s = await enterLevel("re-entry");
      if (s.gear.length > 1 || s.timeScale !== 1 || s.lost || s.ammo || s.alarm) throw new Error("re-entry is not clean: " + JSON.stringify({ gear: s.gear, ts: s.timeScale, lost: s.lost, ammo: s.ammo, alarm: s.alarm }));
      await page.evaluate(() => window.__platy.win());
      await sleep(800); await clickAgain();
      await backToMenu("after win()");
      log("quit, re-entry, win() ok");
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true });
      await page.evaluate(() => { document.body.classList.add("touch"); });
      await sleep(600);
      await enterLevel("phone");
      await sleep(4000); await shot("phone-portrait-intro");
      for (const b of ["fence", "apron", "armoury", "fightout", "gate"]) {
        await page.evaluate((x) => window.__platy.skipTo(x), b);
        await sleep(3500);
        await shot("phone-portrait-" + b);
      }
      await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, hasTouch: true });
      await sleep(600);
      for (const b of ["yard", "door", "fuel"]) {
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
      await sp.screenshot({ path: path.join(SHOTS, "l10-sheet-" + String(k).padStart(2, "0") + ".png") });
    }
  } catch (e) { console.log("contact sheets failed: " + e); }

  await browser.close();
  srv.close();
  fs.writeFileSync(path.join(SHOTS, "l10-report" + (PLAY ? "-play" : "") + ".json"), JSON.stringify(report, null, 2));
  console.log("fallbacks: " + report.fallbacks.length);
  for (const f of report.fallbacks) console.log("  " + f);
  console.log("errors: " + errors.length);
  for (const e of errors.slice(0, 30)) console.log("  " + e.slice(0, 600));
  console.log(report.ok ? "PLAYTEST-L10 OK" : "PLAYTEST-L10 FAILED");
  process.exit(report.ok && errors.length === 0 ? 0 : 1);
})();
