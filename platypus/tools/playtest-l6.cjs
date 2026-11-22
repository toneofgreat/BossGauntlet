// Level 6 "ANOTHER DREAM": full browser playthrough (modelled on playtest-l5.cjs).
//   node tools/playtest-l6.cjs               the whole level with real keys, then skipTo / fps / re-entry / phone checks
//   node tools/playtest-l6.cjs --from=brew   start the real playthrough at a beat (skipTo)
//   node tools/playtest-l6.cjs --only=pool   play just that beat, then stop
//   node tools/playtest-l6.cjs --play        only the real playthrough
// Beats: intro, find, fight, pool, brew, potion, ending.
// Screenshots: tools/shots/l6-NNN-name.png, plus 2x2 contact sheets tools/shots/l6-sheet-NN.png.
// The seam aims the follow camera at the next target and reads state; the playing is real input.
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const arg = (k) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=")[1] : null; };
const FROM = arg("from"), ONLY = arg("only"), PLAY = process.argv.includes("--play");
const ORDER = ["intro", "find", "fight", "pool", "brew", "potion", "ending"];

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
  for (const f of fs.readdirSync(SHOTS)) if (f.startsWith("l6-")) fs.unlinkSync(path.join(SHOTS, f));
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
    const f = path.join(SHOTS, "l6-" + String(n).padStart(3, "0") + "-" + name + ".png");
    await page.screenshot({ path: f });
    report.shots.push(f);
    return f;
  };
  let maxCalls = 0, maxTris = 0, maxWhere = "";
  const st = async () => {
    const s = await page.evaluate(() => {
      const d = window.__platy; if (!d) return null;
      const s = d.state(), L = d.level6;
      s.actionLabel = d.ui.actionOn ? (document.getElementById("actionTxt") || {}).textContent || "" : "";
      s.acting = !!d.platypus.acting; s.lock = d.player.lock; s.speaking = !!d.ui.speaking();
      s.gy = d.platypus.group.position.y;
      if (L && s.levelN === 6 && s.mode === "level" && d.world) {
        const w = d.world, P = L.dream.P;
        s.floor = d.ctx.floorAt ? d.ctx.floorAt(d.player.x, d.player.z) : w.heightAt(d.player.x, d.player.z);
        s.P = { wizard: P.wizard, pool: P.pool, poolEdge: P.poolEdge, cauldron: P.cauldron, ingredients: P.ingredients, fallen: P.fallen };
        const wg = L.wizard.group.position;
        s.wiz = { x: wg.x, y: wg.y, z: wg.z, floor: w.heightAt(wg.x, wg.z), visible: L.wizard.group.visible };
        s.enemies = L.combat.enemies.filter((e) => e.alive).map((e) => ({ x: e.x, y: e.y, z: e.z, tag: e.tag, staggered: !!e.staggered, state: e.state, floor: w.heightAt(e.x, e.z), inPool: L.dream.inPool(e.x, e.z) }));
        s.bodyList = L.combat.bodies.filter((b) => b.alive !== false).map((b) => ({ x: b.x, y: b.y, z: b.z, t: b.targetable !== false }));
        s.allies = L.combat.allies.map((a) => ({ x: a.x, y: a.y, z: a.z, state: a.state, floor: w.heightAt(a.x, a.z) }));
        s.heldList = L.potions.ingredients.held.slice();
        s.recipe = L.potions.cauldron.recipe ? L.potions.cauldron.recipe.slice() : [];
        s.transforming = L.potions.transforming;
        s.beatPhase = d.music.beatPhase ? d.music.beatPhase() : -1;
        s.aiming = !!d.ctx.abilities.potion.aiming;
      }
      return s;
    });
    if (s && s.render) {
      if (s.render.calls > maxCalls) { maxCalls = s.render.calls; maxWhere = s.step + "/" + s.sub; }
      if (s.render.triangles > maxTris) { maxTris = s.render.triangles; report.maxTrisWhere = s.step + "/" + s.sub + " calls " + s.render.calls; }
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
    let msg = "  ground " + label + ": player " + dp.toFixed(2) + (s.player.inWater ? " (water)" : "");
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

  // ---------------------------------------------------------------- the beats
  async function beatIntro() {
    await sleep(700); await shot("title");
    await waitFor((x) => x.step === "intro" && x.cinema.playing, 20000, "intro cutscene");
    const t = await filmWhile("intro", (x) => x.step === "intro", 1500, 30000);
    log("intro ran " + t.toFixed(1) + " s");
  }
  async function beatFind() {
    await waitFor((x) => x.step === "find" && x.player.enabled && !x.cinema.playing, 15000, "find playable");
    await sleep(700); await shot("find-start"); ground(await st(), "find start");
    const r = await walk((x) => x.wiz, { stop: 2.0, timeout: 40000, until: (x) => x.step !== "find" });
    if (r !== "until" && r !== "ok") fallback("find: could not walk to the wizard (" + r + ")");
    await waitFor((x) => x.step !== "find", 6000, "fight to begin");
  }
  async function beatFight() {
    await waitFor((x) => x.step === "fight", 15000, "fight");
    await talk("fight", 25000);
    await waitFor((x) => x.sub === "a" && x.player.enabled, 15000, "lesson 1a");
    await sleep(500); await shot("fight-soldiers"); ground(await st(), "fight start");
    await fpsMeasure("fight_six_soldiers");
    // one sting from too far: the miss hint
    await page.keyboard.press("KeyJ"); await sleep(600);
    let ok = await fightAll("fight-a", (x) => x.sub !== "a", () => true, "sting", 90000);
    if (!ok) throw new Error("lesson 1a did not finish: " + (await st()).finished);
    await sleep(300); await shot("fight-slap-lesson");
    ok = await fightAll("fight-b", (x) => x.step !== "fight" || x.sub === "end", () => true, "slap", 120000);
    if (!ok) throw new Error("lesson 1b did not finish: " + (await st()).finished);
    await upAll();
    await sleep(500); await shot("fight-done");
    log("fight: finished " + (await st()).finished + "/6");
  }
  async function beatPool() {
    await waitFor((x) => x.step === "pool", 15000, "pool");
    await talk("pool", 20000);
    let s = await waitFor((x) => x.sub === "pulse" && x.player.enabled, 15000, "pool pulse");
    await sleep(400); await shot("pool-objective");
    // a pulse on dry land: hint
    await page.keyboard.press("KeyK"); await sleep(700); await shot("pool-dry-pulse");
    for (let k = 0; k < 6; k++) {
      s = await st();
      if (s.sub !== "pulse") break;
      const pe = s.enemies.filter((e) => e.tag === "pool");
      if (!pe.length) break;
      const cx = pe.reduce((a, e) => a + e.x, 0) / pe.length, cz = pe.reduce((a, e) => a + e.z, 0) / pe.length;
      await walk(() => ({ x: cx, z: cz }), { stop: 1.4, timeout: 15000, until: (x) => x.player.inWater && Math.hypot(cx - x.player.x, cz - x.player.z) < 2.2 });
      await sleep(300); await shot("pool-wading-" + k); ground(await st(), "pool");
      await free();
      await page.keyboard.press("KeyK");
      await sleep(350); await shot("pool-pulse-" + k);
      await sleep(1500);
      s = await st();
      log("  pulse " + (k + 1) + ": pool soldiers left " + s.enemies.filter((e) => e.tag === "pool").length + " sub " + s.sub);
      if (k === 0 && s.enemies.filter((e) => e.tag === "pool").length) fallback("pool: the first pulse from the water did not take all three down");
    }
    await waitFor((x) => x.sub !== "pulse", 8000, "bank to wake");
    await sleep(800); await shot("pool-bank");
    const ok = await fightAll("pool-rest", (x) => x.step !== "pool" || x.sub === "end", () => true, "any", 90000);
    if (!ok) throw new Error("pool: the bank soldiers did not go down");
    await sleep(500); await shot("pool-done");
    log("pool: fallen " + (await st()).fallen);
  }
  async function beatBrew() {
    await waitFor((x) => x.step === "brew", 15000, "brew");
    await talk("brew", 20000);
    let s = await waitFor((x) => x.sub === "gather" && x.player.enabled, 15000, "gather");
    await sleep(500); await shot("brew-ingredients");
    let wrongDone = false;
    const tEnd = Date.now() + 180000;
    const shotOnce = {};
    while (Date.now() < tEnd) {
      s = await st();
      if (s.sub !== "gather") break;
      if (s.ings.length) {
        const kind = ["glowcap", "moonpetal", "dewdrop"].find((k) => s.ings.includes(k));
        const p = s.P.ingredients[kind];
        const stop = kind === "moonpetal" ? 1.0 : 0.45;
        const r = await walk(() => p, { stop, timeout: 30000, until: (x) => !x.ings.includes(kind) });
        if (r === "until") { if (!shotOnce[kind]) { shotOnce[kind] = 1; await sleep(250); await shot("brew-got-" + kind); } continue; }
        if (r !== "ok") { fallback("brew: could not walk to the " + kind + " (" + r + ")"); await tp(p.x, p.z); await sleep(300); }
        if (!shotOnce[kind + "a"]) { shotOnce[kind + "a"] = 1; await sleep(300); await shot("brew-at-" + kind); }
        if (kind === "moonpetal") { await upAll(); await sleep(600); await shot("brew-moonpetal-still"); await sleep(900); }
        else if (kind === "dewdrop") { await page.keyboard.press("Space"); await sleep(700); }
        else await sleep(300);
        s = await st();
        if (s.ings.includes(kind)) { log("  " + kind + " not taken yet, retrying"); await sleep(300); }
        continue;
      }
      // all held: to the cauldron
      const c = s.P.cauldron;
      const r = await walk(() => c, { stop: 1.4, timeout: 30000 });
      if (r !== "ok") { fallback("brew: could not walk to the cauldron (" + r + ")"); await tp(c.x - 1.2, c.z); }
      await sleep(400);
      s = await st();
      if (!/Add/.test(s.actionLabel)) fallback("brew: no Add prompt at the cauldron (" + s.actionLabel + ")");
      if (!wrongDone && s.filled === 0 && s.heldList.length === 3) {
        wrongDone = true;
        await shot("brew-add-prompt");
        const wrong = s.heldList.indexOf(s.recipe[1]);
        await page.keyboard.press("Digit" + (wrong + 1));
        await sleep(600); await shot("brew-wrong-order");
        continue;
      }
      for (let i = 0; i < 3; i++) {
        s = await st();
        if (s.sub !== "gather" || !s.heldList.length) break;
        const idx = s.heldList.indexOf(s.recipe[s.filled]);
        if (idx < 0) break;
        await free();
        await page.keyboard.press(idx === 0 ? "KeyE" : "Digit" + (idx + 1));
        await sleep(500);
        if (i === 0) await shot("brew-added-first");
      }
    }
    s = await waitFor((x) => x.sub === "stir", 5000, "stir");
    await sleep(400); await shot("brew-stir");
    // one stir off the beat, then on the beat
    await page.evaluate(() => new Promise((r) => { const d = window.__platy.music; const t = () => { const p = d.beatPhase(); if (p > 0.4 && p < 0.6) r(); else requestAnimationFrame(t); }; t(); }));
    await page.keyboard.press("KeyE");
    await sleep(300);
    const offOk = (await st()).stirs;
    if (offOk > 0) fallback("brew: an off-beat stir counted");
    for (let k = 0; k < 14; k++) {
      s = await st();
      if (s.sub !== "stir") break;
      await page.evaluate(() => new Promise((r) => { const d = window.__platy.music; const t = () => { const p = d.beatPhase(); if (p > 0.95 || p < 0.03) r(); else requestAnimationFrame(t); }; t(); }));
      await page.keyboard.press("KeyE");
      await sleep(250);
      if (k < 2) await shot("brew-stir-" + (k + 1));
      await sleep(150);
    }
    s = await waitFor((x) => x.sub === "take", 5000, "take potions");
    await sleep(1200); await shot("brew-take-prompt");
    if (!/Take/.test(s.actionLabel) && !/Take/.test((await st()).actionLabel)) fallback("brew: no Take potions prompt");
    await page.keyboard.press("KeyE");
    await waitFor((x) => x.step === "potion", 5000, "potion lesson");
  }
  async function throwAt(b) {
    await walk(() => b, { stop: 4.0, timeout: 15000 });
    await aimAt(b.x, b.z);
    await sleep(150);
    // walk one step at it so the heading points there (key aiming uses the heading)
    await down("KeyW"); await sleep(120); await up("KeyW");
    await free();
    await down("KeyQ"); await sleep(500);
    await up("KeyQ");
  }
  async function beatPotion() {
    await waitFor((x) => x.step === "potion", 15000, "potion");
    await talk("potion", 20000);
    let s = await waitFor((x) => x.sub === "throw" && x.player.enabled, 15000, "throw");
    await sleep(500); await shot("potion-field"); ground(await st(), "potion field");
    let throws = 0, waked = s.woken, missDone = false;
    const tEnd = Date.now() + 200000;
    while (Date.now() < tEnd) {
      s = await st();
      if (s.step !== "potion" || s.sub !== "throw") break;
      if (s.wakeShot || s.talking || !s.player.enabled) {
        if (s.wakeShot && !report.wakeShotSeen) { report.wakeShotSeen = true; await filmWhile("wake-shot", (x) => x.wakeShot, 1500, 15000); }
        await sleep(200); continue;
      }
      if (s.transforming > 0) { await sleep(200); continue; }
      if (s.woken !== waked) { waked = s.woken; await sleep(300); await shot("potion-woken-" + waked); }
      if (s.potions <= 0) {
        const c = s.P.cauldron;
        await walk(() => c, { stop: 1.6, timeout: 30000 });
        await sleep(300); await shot("potion-refill");
        await page.keyboard.press("KeyE"); await sleep(500);
        s = await st();
        if (s.potions <= 0) { log("  refill not ready, waiting"); await sleep(1500); }
        continue;
      }
      const tb = s.bodyList.filter((b) => b.t);
      if (!tb.length) { await sleep(300); continue; }
      if (!missDone && throws === 0) {
        // a throw at nothing first: the miss hint
        missDone = true;
        const c = s.P.cauldron; await aimAt(c.x + 6, c.z + 6); await down("KeyW"); await sleep(150); await up("KeyW");
        await free(); await down("KeyQ"); await sleep(400); await up("KeyQ"); throws++;
        await sleep(1500); await shot("potion-miss");
        continue;
      }
      // pick the body with a neighbour (two with one) first
      let best = tb[0], bn = -1;
      for (const b of tb) { const k = tb.filter((o) => Math.hypot(o.x - b.x, o.z - b.z) < 1.5).length; if (k > bn) { bn = k; best = b; } }
      await throwAt(best); throws++;
      await sleep(400); if (throws < 4) await shot("potion-throw-" + throws);
      await sleep(1500);
    }
    s = await st();
    log("potion: woken " + s.woken + "/5 army " + s.army + " in " + throws + " throws");
    if (s.step === "potion") throw new Error("potion lesson did not finish: woken " + s.woken);
  }
  async function beatEnding() {
    await waitFor((x) => x.step === "ending", 15000, "ending");
    await talk("ending", 20000);
    await waitFor((x) => x.sub === "free" && x.player.enabled, 15000, "free play");
    await sleep(500); await shot("ending-free"); ground(await st(), "ending");
    await fpsMeasure("ending_five_followers");
    await page.keyboard.press("Space"); await sleep(500); await shot("ending-jump-copied");
    const t = await filmWhile("ending", (x) => x.mode === "level" && (x.step === "ending" || x.step === "done"), 1500, 45000);
    log("ending ran " + t.toFixed(1) + " s");
    await waitFor((x) => x.step === "done", 20000, "the level card");
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
    await page.evaluate(() => { window.__platy.startLevel(6); });
    return waitFor((x) => x.mode === "level" && x.levelN === 6 && x.step === "intro", 40000, label);
  };

  let s;
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
    const gpu = await page.evaluate(() => { const gl = window.__platy.renderer.getContext(); const e = gl.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; });
    log("gpu: " + gpu);
    await page.evaluate(() => { window.__platy.resetProgress(); window.__platy.unlock(6); });
    await sleep(500);
    await shot("menu");
    if (await page.evaluate(() => document.getElementById("lvl6").classList.contains("locked"))) throw new Error("level 6 is locked after unlock(6)");

    await page.click("#lvl6");
    s = await waitFor((x) => x.mode === "level" && x.levelN === 6, 40000, "level 6 running");
    const beats = [["intro", beatIntro], ["find", beatFind], ["fight", beatFight], ["pool", beatPool], ["brew", beatBrew], ["potion", beatPotion], ["ending", beatEnding]];
    const first = ONLY || FROM || "intro";
    if (first !== "intro") { await sleep(1500); const ok = await page.evaluate((b) => window.__platy.skipTo(b), first); if (!ok) throw new Error("skipTo " + first + " failed"); }
    for (const [name, fn] of beats) {
      if (ORDER.indexOf(name) < ORDER.indexOf(first)) continue;
      if (ONLY && name !== ONLY) break;
      log("== " + name);
      await fn();
      await upAll();
    }
    if (ONLY && ONLY !== "ending") await shot("only-end");
    else {
      s = await backToMenu("after the level card");
      if (!s.progress.beaten[5]) throw new Error("level 6 is not marked beaten: " + JSON.stringify(s.progress));
      await sleep(1800); await shot("menu-level6-beaten");
      const tick = await page.evaluate(() => { const b = document.getElementById("lvl6"), c = document.getElementById("lvl7"); return { cls: b.className, next: c ? c.className : "?" }; });
      log("level complete -> main screen; " + JSON.stringify(tick) + ", progress " + JSON.stringify(s.progress));
      if (!/beaten|done/.test(tick.cls)) fallback("the level 6 circle does not show as beaten (class '" + tick.cls + "')");
      if (s.progress.unlocked < 7) fallback("level 7 was not unlocked: " + s.progress.unlocked);
      report.completed = true;
    }

    if (!ONLY && !FROM && !PLAY) {
      // win() on the title card, unknown skip
      await enterLevel("win on title");
      await sleep(800);
      const bad = await page.evaluate(() => window.__platy.skipTo("nonsense"));
      if (bad) fallback("skipTo('nonsense') returned true");
      await page.evaluate(() => window.__platy.win());
      await sleep(1200); await shot("win-on-title");
      await page.click("#again");
      await backToMenu("after win() on the title");
      // skipTo chain
      await enterLevel("skip chain");
      for (const b of ["find", "fight", "pool", "brew", "potion", "ending", "brew", "fight", "intro", "potion"]) {
        const ok = await page.evaluate((x) => window.__platy.skipTo(x), b);
        if (!ok) throw new Error("skipTo " + b + " failed");
        await sleep(3200);
        s = await st();
        await shot("skipTo-" + b + "-" + s.sub);
        if (b !== "intro") ground(s, "skipTo " + b);
      }
      log("skipTo chain ok");
      // fps in the pool pulse and the potion field
      await page.evaluate(() => window.__platy.skipTo("pool"));
      await sleep(5000);
      await fpsMeasure("pool_twelve");
      await page.evaluate(() => window.__platy.skipTo("potion"));
      await sleep(4000);
      await fpsMeasure("potion_field");
      // quit mid-lesson, re-enter clean
      await page.evaluate(() => window.__platy.quit());
      await backToMenu("after quitting mid-potion");
      s = await enterLevel("re-entry");
      if (s.woken !== 0 || s.finished !== 0 || s.army !== 0 || s.timeScale !== 1) throw new Error("re-entry is not clean: " + JSON.stringify({ w: s.woken, f: s.finished, a: s.army, ts: s.timeScale }));
      await page.evaluate(() => window.__platy.skipTo("fight"));
      await sleep(3000); await shot("reentry-fight");
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
      for (const [b, wait] of [["find", 2500], ["fight", 6000], ["pool", 5000], ["brew", 6000], ["potion", 5000], ["ending", 5000]]) {
        await page.evaluate((x) => window.__platy.skipTo(x), b);
        await sleep(wait);
        await shot("phone-portrait-" + b);
      }
      await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, hasTouch: true });
      await sleep(600);
      for (const [b, wait] of [["fight", 6000], ["brew", 6000], ["potion", 5000]]) {
        await page.evaluate((x) => window.__platy.skipTo(x), b);
        await sleep(wait);
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
    try { await upAll(); await shot("failure"); const q = await st(); delete q.P; console.log(JSON.stringify(q).slice(0, 3000)); } catch (_) {}
  }

  try {
    const sp = await browser.newPage();
    await sp.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    const files = report.shots.filter((f) => fs.existsSync(f));
    for (let i = 0, k = 1; i < files.length; i += 4, k++) {
      const cells = files.slice(i, i + 4).map((f) => "<div><img src='data:image/png;base64," + fs.readFileSync(f).toString("base64") + "'><span>" + path.basename(f, ".png") + "</span></div>").join("");
      await sp.setContent("<style>body{margin:0;background:#222;display:grid;grid-template-columns:640px 640px;grid-auto-rows:360px}div{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}img{max-width:640px;max-height:360px}span{position:absolute;left:4px;top:2px;font:bold 13px monospace;color:#ff0;text-shadow:0 0 3px #000,0 0 3px #000}</style>" + cells, { waitUntil: "load" });
      await sp.screenshot({ path: path.join(SHOTS, "l6-sheet-" + String(k).padStart(2, "0") + ".png") });
    }
  } catch (e) { console.log("contact sheets failed: " + e); }

  await browser.close();
  srv.close();
  fs.writeFileSync(path.join(SHOTS, "l6-report.json"), JSON.stringify(report, null, 2));
  console.log("fallbacks: " + report.fallbacks.length);
  for (const f of report.fallbacks) console.log("  " + f);
  console.log("errors: " + errors.length);
  for (const e of errors.slice(0, 30)) console.log("  " + e.slice(0, 600));
  console.log(report.ok ? "PLAYTEST-L6 OK" : "PLAYTEST-L6 FAILED");
  process.exit(report.ok && errors.length === 0 ? 0 : 1);
})();
