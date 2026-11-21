// Level 2 "THE CHAOS REALM": full browser playthrough.
//   node tools/playtest-l2.cjs                 the whole level with real keys / mouse, then replay checks
//   node tools/playtest-l2.cjs --from=feed     start the real playthrough at a beat (skipTo)
//   node tools/playtest-l2.cjs --only=show     play just that beat, then stop (no completion checks)
// Screenshots: tools/shots/l2-NN-name.png, plus 2x2 contact sheets tools/shots/l2-sheet-NN.png.
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const arg = (k) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=")[1] : null; };
const FROM = arg("from"), ONLY = arg("only");
const ORDER = ["title", "wake", "cutscene", "race", "hide", "dive", "ball", "friends", "feed", "school", "show", "poster", "done"];

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
  for (const f of fs.readdirSync(SHOTS)) if (f.startsWith("l2-")) fs.unlinkSync(path.join(SHOTS, f));
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
    const f = path.join(SHOTS, "l2-" + String(n).padStart(2, "0") + "-" + name + ".png");
    await page.screenshot({ path: f });
    report.shots.push(f);
    return f;
  };
  // everything the test needs to know, in one round trip
  const st = () => page.evaluate(() => {
    const d = window.__platy; if (!d) return null;
    const s = d.state(), L = d.level2;
    s.hud = { action: !!d.ui.actionOn, tricks: !!d.ui.tricksOn };
    s.acting = !!d.platypus.acting; s.lock = d.player.lock; s.walking = !!d.player.walking;
    if (L && s.levelN === 2 && s.mode === "level") {
      const f = L.friend, b = L.props.ball, w = d.world;
      s.friend = { x: f.x, y: f.y, z: f.z, busy: !!f.busy, swimming: !!f.swimming, floor: w ? Math.max(w.heightAt(f.x, f.z), w.waterAt(f.x, f.z) - 0.1) : 0 };
      s.ball = { x: b.x, y: b.y, z: b.z, vx: b.vx, vz: b.vz, active: !!b.active, tilt: b.tilt };
      s.floor = d.ctx.floorAt(d.player.x, d.player.z);
      s.lying = L.props.coins.lying;
    }
    return s;
  });
  const waitFor = async (pred, ms, label) => {
    const t0 = Date.now();
    for (;;) {
      const s = await st();
      if (s && pred(s)) return s;
      if (Date.now() - t0 > ms) throw new Error("timeout waiting for " + label + " (step=" + (s && s.step) + " phase=" + (s && s.phase) + ")");
      await sleep(100);
    }
  };
  const keys = new Set();
  const down = async (k) => { if (!keys.has(k)) { keys.add(k); await page.keyboard.down(k); } };
  const up = async (k) => { if (keys.has(k)) { keys.delete(k); await page.keyboard.up(k); } };
  const upAll = async () => { for (const k of Array.from(keys)) await up(k); };
  const aimAt = (x, z) => page.evaluate((x, z) => { const d = window.__platy, p = d.player; d.cam.yaw = Math.atan2(x - p.x, z - p.z); d.cam.manualT = 1.5; }, x, z);
  const tp = (x, z, yaw) => page.evaluate((x, z, yaw) => window.__platy.tp(x, z, yaw), x, z, yaw);
  // walk with the real W key (camera aimed at the target), jumping when stuck. target(s) -> {x, z} | null
  async function walk(target, o) {
    o = o || {};
    const stop = o.stop === undefined ? 0.5 : o.stop, tEnd = Date.now() + (o.timeout || 15000);
    let lastX = 1e9, lastZ = 1e9, lastT = Date.now(), jumps = 0, res = "timeout";
    for (;;) {
      const s = await st();
      if (!s || (o.until && o.until(s))) { res = "until"; break; }
      const t = target(s);
      if (!t) { res = "notarget"; break; }
      const d = Math.hypot(t.x - s.player.x, t.z - s.player.z);
      if (d < stop) { res = "ok"; break; }
      if (Date.now() > tEnd) break;
      await aimAt(t.x, t.z);
      await down("KeyW");
      if (o.each) await o.each(s, t, d);
      if (Math.hypot(s.player.x - lastX, s.player.z - lastZ) > 0.25) { lastX = s.player.x; lastZ = s.player.z; lastT = Date.now(); jumps = 0; }
      else if (s.player.enabled && Date.now() - lastT > 900 + jumps * 700) {
        if (jumps >= 4) { res = "stuck"; break; }
        jumps++;
        if (!o.noJump) { await page.keyboard.press("Space"); }
      }
      await sleep(70);
    }
    await up("KeyW");
    return res;
  }
  const fpsMeasure = () => page.evaluate(() => new Promise((res) => {
    const gaps = []; let last = performance.now(); const t0 = last;
    function f(t) { gaps.push(t - last); last = t; if (t - t0 < 5000) requestAnimationFrame(f); else {
      gaps.sort((a, b) => a - b);
      res({ fps: gaps.length / ((t - t0) / 1000), p50: gaps[gaps.length >> 1], p95: gaps[(gaps.length * 0.95) | 0], p99: gaps[(gaps.length * 0.99) | 0], max: gaps[gaps.length - 1] });
    } }
    requestAnimationFrame(f);
  }));
  const fpsLine = (label, f, s) => { report["fps_" + label] = f; report["render_" + label] = s.render; log("FPS " + label + ": " + f.fps.toFixed(1) + " p50 " + f.p50.toFixed(1) + "ms p95 " + f.p95.toFixed(1) + "ms max " + f.max.toFixed(1) + "ms; draw calls " + s.render.calls + " tris " + s.render.triangles); };
  const ground = (s, label) => {
    if (!s || !s.friend) return;
    const dp = s.player.y - s.floor, df = s.friend.y - s.friend.floor;
    log("  ground check " + label + ": player y-floor=" + dp.toFixed(2) + (s.player.swimming ? " (swimming)" : "") + " friend y-floor=" + df.toFixed(2) + (s.friend.swimming ? " (swimming)" : ""));
  };
  let maxCalls = 0, maxTris = 0;
  const noteRender = (s) => { if (s && s.render) { maxCalls = Math.max(maxCalls, s.render.calls); maxTris = Math.max(maxTris, s.render.triangles); } };
  const reached = (beat) => ORDER.indexOf(beat);

  // ---------------------------------------------------------------- the beats
  async function beatIntro() {
    await sleep(900); await shot("title");
    await waitFor((s) => s.step === "wake" && s.cinema.playing, 15000, "wake");
    let last = -1;
    for (let i = 0; i < 40; i++) {
      await sleep(430);
      const s = await st();
      if (s.step !== "wake") break;
      const e = s.cinema.eye, k = Math.floor(i / 3);
      if (k !== last) { last = k; await shot("wake-eye-" + e.toFixed(2)); }
    }
    log("wake ok");
    let s = await waitFor((x) => x.step === "cutscene", 20000, "cutscene");
    const t0 = Date.now(); let i = 0;
    while (Date.now() - t0 < 70000) {
      s = await st(); noteRender(s);
      if (s.step !== "cutscene") break;
      await shot("cutscene-" + String(i++).padStart(2, "0") + "-" + ((Date.now() - t0) / 1000).toFixed(0) + "s");
      await sleep(2300);
    }
    log("cutscene ran " + ((Date.now() - t0) / 1000).toFixed(1) + " s");
    await waitFor((x) => x.step === "race", 10000, "race after cutscene");
  }

  async function beatRace() {
    let s = await waitFor((x) => x.step === "race" && x.player.enabled && !x.cinema.playing, 10000, "race playable");
    await sleep(1200); await shot("race-start"); ground(await st(), "race start");
    await waitFor((x) => x.phase === "lead" || x.step !== "race", 12000, "friend leads");
    let shots = 0, lastIdx = -1;
    const tEnd = Date.now() + 150000;
    while (Date.now() < tEnd) {
      s = await st(); noteRender(s);
      if (s.step !== "race" || s.race >= s.raceLen) break;
      if (!s.mark) { await sleep(150); continue; }
      const idx = s.race;
      const r = await walk((x) => x.mark, { stop: 0.7, timeout: 20000, until: (x) => x.step !== "race" || x.race !== idx || x.race >= x.raceLen,
        each: async (x) => { if (x.race !== lastIdx && shots < 12) { lastIdx = x.race; await sleep(700); shots++; await shot("race-cp" + x.race); } } });
      if (r === "stuck" || r === "timeout") {
        s = await st();
        if (s.step === "race" && s.race === idx && s.mark) { fallback("race: could not walk to checkpoint " + idx + " (" + r + ") from " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1) + " to " + s.mark.x.toFixed(1) + "," + s.mark.z.toFixed(1)); await tp(s.mark.x, s.mark.z); await sleep(600); }
      } else if (r === "ok") await sleep(500); // standing on it: wait for the friend to get there too
    }
    await upAll();
    s = await st();
    await sleep(900); await shot("race-finish"); ground(await st(), "race finish (lookout)");
    log("race: checkpoints " + s.race + "/" + s.raceLen);
    await waitFor((x) => x.step === "hide", 12000, "hide after race");
  }

  async function beatHide() {
    for (let round = 0; round < 3; round++) {
      let s = await waitFor((x) => x.step !== "hide" || x.phase === "count", 12000, "hide count " + round);
      if (s.step !== "hide") break;
      await sleep(1500); await shot("hide-eyes-closing-r" + (round + 1));
      await sleep(1700); if (round === 0) await shot("hide-dark-r1");
      s = await waitFor((x) => x.step !== "hide" || x.phase === "seek", 16000, "seek " + round);
      await sleep(500); await shot("hide-seek-r" + (round + 1));
      const tSeek = Date.now();
      for (let tries = 0; tries < 4; tries++) {
        const r = await walk((x) => x.friend, { stop: 0.6, timeout: 25000, until: (x) => x.step !== "hide" || x.phase !== "seek" || x.hud.action });
        s = await st();
        if (s.step !== "hide" || s.phase !== "seek" || s.hud.action) break;
        fallback("hide round " + (round + 1) + ": could not walk to the friend (" + r + ") friend at " + s.friend.x.toFixed(1) + "," + s.friend.z.toFixed(1) + " player " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1));
        await tp(s.friend.x + 0.9, s.friend.z + 0.5); await sleep(500);
      }
      s = await st();
      if (s.step === "hide" && s.phase === "seek") {
        ground(s, "hide found r" + (round + 1));
        await shot("hide-found-prompt-r" + (round + 1));
        await page.keyboard.press("KeyE");
        await sleep(700); await shot("hide-found-r" + (round + 1));
      }
      log("hide round " + (round + 1) + " found in " + ((Date.now() - tSeek) / 1000).toFixed(1) + " s");
      await waitFor((x) => x.step !== "hide" || x.found > round, 10000, "round counted");
    }
    await waitFor((x) => x.step === "dive", 12000, "dive after hide");
  }

  const fishInfo = () => page.evaluate(() => {
    const d = window.__platy, F = d.level2.zoo.fish, p = d.player, o = { x: 0, y: 0, z: 0 };
    const i = F.nearest(p.x, p.y, p.z, 60);
    if (i < 0) return null;
    F.pos(i, o); return o;
  });
  async function beatDive() {
    let s = await waitFor((x) => x.step === "dive" && x.player.enabled, 10000, "dive playable");
    await sleep(800); await shot("dive-start");
    let r = await walk((x) => x.mark, { stop: 0.4, timeout: 20000, until: (x) => x.player.swimming || x.step !== "dive" });
    s = await st();
    if (!s.player.swimming) { fallback("dive: could not walk into the pool (" + r + ")"); await tp(-5, 3); await sleep(600); }
    await sleep(900); await shot("dive-afloat"); ground(await st(), "afloat");
    let shots = 0, got = 0;
    const tEnd = Date.now() + 150000; let tFish = Date.now();
    while (Date.now() < tEnd) {
      s = await st(); noteRender(s);
      if (s.step !== "dive" || s.fish >= 5) break;
      if (s.fish !== got) { got = s.fish; tFish = Date.now(); await shot("dive-caught-" + got); }
      const f = await fishInfo();
      if (!f) { await sleep(200); continue; }
      const d = Math.hypot(f.x - s.player.x, f.z - s.player.z);
      await aimAt(f.x, f.z);
      await down("KeyW");
      // hold Space to go down to the fish, let go to come up
      if (d < 3.5 && s.player.y > f.y - 0.12) await down("Space"); else await up("Space");
      if (s.player.diving && shots < 2 && s.player.y < -0.7) { shots++; await shot("dive-underwater-" + shots); }
      if (Date.now() - tFish > 40000) { fallback("dive: no catch in 40 s by swimming; teleporting above a fish"); await tp(f.x, f.z); tFish = Date.now(); }
      await sleep(60);
    }
    await upAll();
    s = await st();
    log("dive: fish " + s.fish + "/5");
    await sleep(600); await shot("dive-done");
    await waitFor((x) => x.step === "ball", 12000, "ball after dive");
  }

  async function beatBall() {
    let s = await waitFor((x) => x.step === "ball" && x.player.enabled, 10000, "ball playable");
    await sleep(1000); await shot("ball-start");
    let shots = 0, got = 0;
    const tEnd = Date.now() + 170000;
    while (Date.now() < tEnd) {
      s = await st(); noteRender(s);
      if (s.step !== "ball" || s.passes >= 6) break;
      if (s.passes !== got) { got = s.passes; if (shots < 3) { shots++; await shot("ball-pass-" + got); } }
      const b = s.ball, f = s.friend, p = s.player;
      if (!b.active) { await sleep(200); continue; }
      // stand behind the ball (seen from the friend), then walk through it toward the friend
      let ux = b.x - f.x, uz = b.z - f.z; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
      const behind = { x: b.x + ux * 0.75, z: b.z + uz * 0.75 };
      const side = (p.x - b.x) * ux + (p.z - b.z) * uz;       // > 0: on the far side from the friend
      const lat = Math.abs((p.x - b.x) * -uz + (p.z - b.z) * ux);
      const t = side > 0.25 && lat < 0.35 ? { x: b.x - ux * 0.5, z: b.z - uz * 0.5 } : behind;
      if (Math.hypot(b.vx, b.vz) > 1.2) { await up("KeyW"); await sleep(120); continue; }
      await aimAt(t.x, t.z);
      await down("KeyW");
      await sleep(70);
    }
    await upAll();
    s = await st();
    log("ball: passes " + s.passes + "/6");
    await shot("ball-done"); ground(s, "ball done");
    await waitFor((x) => x.step === "friends", 12000, "friends after ball");
  }

  async function beatFriends() {
    await waitFor((x) => x.step === "friends", 10000, "friends");
    const t0 = Date.now(); let i = 0;
    while (Date.now() - t0 < 40000) {
      const s = await st(); noteRender(s);
      if (s.step !== "friends") break;
      await sleep(1900);
      await shot("friends-" + (i++));
    }
    const s = await waitFor((x) => x.step === "feed", 12000, "feed after friends");
    if (s.friendName !== "Pip") throw new Error("the friend has no name after becoming friends");
    log("friends ok: " + s.friendName + ", friendship " + s.friendship);
  }

  async function beatFeed() {
    await waitFor((x) => x.step === "feed", 10000, "feed");
    await sleep(1200); await shot("feed-start");
    await waitFor((x) => x.phase === "cine" || x.phase === "eat" || x.step !== "feed", 10000, "keeper cutscene");
    const t0 = Date.now(); let i = 0;
    while (Date.now() - t0 < 40000) {
      const s = await st(); noteRender(s);
      if (s.phase !== "cine" || s.step !== "feed") break;
      await sleep(1700);
      await shot("feed-keeper-" + (i++));
    }
    let s = await waitFor((x) => x.step === "feed" && x.phase === "eat" && x.player.enabled && !x.cinema.playing, 10000, "eat phase");
    await sleep(600);
    let r = await walk((x) => x.mark, { stop: 0.5, timeout: 25000, until: (x) => x.hud.action || x.step !== "feed" });
    s = await st();
    if (!s.hud.action) { fallback("feed: could not walk to the bowl (" + r + ")"); await tp(9.1, -1.0, 2.0); await sleep(600); }
    await sleep(500); await shot("feed-at-bowl"); ground(await st(), "at bowl");
    for (let k = 0; k < 8; k++) {
      s = await st();
      if (s.step !== "feed" || s.eats >= 3) break;
      if (s.hud.action) { await page.keyboard.press("KeyE"); await sleep(650); if (k < 2) await shot("feed-eating-" + (s.eats + 1)); }
      await sleep(500);
    }
    s = await st();
    log("feed: eats " + s.eats + "/3");
    await waitFor((x) => x.step === "school", 15000, "school after feed");
  }

  async function beatSchool() {
    let s = await waitFor((x) => x.step === "school" && x.player.enabled, 10000, "school");
    await sleep(600); await shot("school-start");
    let r = await walk((x) => x.mark, { stop: 1.2, timeout: 30000, until: (x) => x.phase !== "walk" || x.step !== "school" });
    s = await st();
    if (s.phase === "walk") {
      if (r !== "ok") { fallback("school: could not walk to the show rock (" + r + ")"); await tp(2.4, 6.4, 0); }
      await waitFor((x) => x.phase !== "walk", 15000, "lesson 0");
    }
    await page.evaluate(() => { const d = window.__platy; d.cam.yaw = 0.5; d.cam.manualT = 1e9; });
    for (let i = 0; i < 3; i++) {
      await waitFor((x) => x.step !== "school" || (x.lesson === i && x.phase === "demo") || x.lesson > i, 12000, "demo " + i);
      await sleep(600); await shot("school-demo-" + (i + 1));
      await waitFor((x) => x.step !== "school" || (x.lesson === i && x.phase === "try") || x.lesson > i, 12000, "try " + i);
      await sleep(400); await shot("school-your-turn-" + (i + 1));
      await page.keyboard.press("Digit" + (i + 1));
      await sleep(450); await shot("school-trick-" + (i + 1) + "-a");
      await sleep(350); await shot("school-trick-" + (i + 1) + "-b");
      s = await st(); noteRender(s);
    }
    // the ball balance
    s = await waitFor((x) => x.step !== "school" || x.lesson === 3, 15000, "ball lesson");
    await sleep(500); await shot("school-ball-lesson");
    for (let attempt = 0; attempt < 5; attempt++) {
      s = await st();
      if (s.step !== "school" || s.phase !== "try") break;
      r = await walk((x) => (x.ball.active ? x.ball : null), { stop: 1.1, timeout: 15000, noJump: true, until: (x) => x.step !== "school" });
      if (r !== "ok" && r !== "until") { s = await st(); fallback("school: could not walk to the ball (" + r + ")"); await tp(s.ball.x - 0.9, s.ball.z - 0.3); }
      await sleep(350);
      await page.keyboard.press("Digit4");
      await sleep(500);
      s = await st();
      if (!s.balancing) { log("  ball slot did not start (attempt " + attempt + ") tricks=" + s.hud.tricks); continue; }
      await shot("school-balance-start");
      const t0 = Date.now(); let sh = false, maxTilt = 0;
      while (Date.now() - t0 < 6000) {
        s = await st();
        if (!s.balancing) break;
        maxTilt = Math.max(maxTilt, Math.abs(s.ball.tilt));
        if (s.ball.tilt > 0.12) { await up("KeyD"); await down("KeyA"); }
        else if (s.ball.tilt < -0.12) { await up("KeyA"); await down("KeyD"); }
        else { await up("KeyA"); await up("KeyD"); }
        if (!sh && Date.now() - t0 > 2000) { sh = true; await shot("school-balance-mid"); }
        await sleep(50);
      }
      await upAll();
      log("  balance attempt " + (attempt + 1) + ": held " + ((Date.now() - t0) / 1000).toFixed(1) + " s, max |tilt| " + maxTilt.toFixed(2));
      await sleep(500); await shot("school-balance-end");
      await sleep(1200);
    }
    await page.evaluate(() => { window.__platy.cam.manualT = 0; });
    s = await waitFor((x) => x.step === "show", 15000, "show after school");
    log("school ok; coins so far " + s.coins);
  }

  async function beatShow() {
    let s = await waitFor((x) => x.step === "show" && x.player.enabled, 10000, "show");
    await sleep(500); await shot("show-start");
    if (s.player.z < 4.5) { await tp(2.4, 6.2, 0); await sleep(400); }
    let k = 0, shots = 0, fpsP = null, fps = null, tricks = 0, maxWatch = 0, maxCombo = 0;
    const tEnd = Date.now() + 240000;
    while (Date.now() < tEnd) {
      s = await st(); noteRender(s);
      if (s.step !== "show" || s.coins >= 30) break;
      maxWatch = Math.max(maxWatch, s.watchers); maxCombo = Math.max(maxCombo, s.combo);
      // three different tricks in a row (combo), then pick the money up
      for (let j = 0; j < 3; j++) {
        s = await waitFor((x) => x.step !== "show" || (!x.acting && x.lock <= 0 && x.player.grounded), 8000, "trick slot free");
        if (s.step !== "show") break;
        if (s.player.z < 4 || s.player.swimming) { await walk(() => ({ x: 2.4, z: 6.4 }), { stop: 0.6, timeout: 9000 }); }
        await page.keyboard.press("Digit" + ((k++ % 3) + 1)); tricks++;
        await sleep(520);
        if (shots < 9) { shots++; await shot("show-trick-" + tricks); }
        if (tricks === 6 && !fpsP) fpsP = fpsMeasure().then((f) => { fps = f; });
      }
      await sleep(900);
      s = await st(); maxWatch = Math.max(maxWatch, s.watchers); maxCombo = Math.max(maxCombo, s.combo);
      if (shots < 12) { shots++; await shot("show-coins-flying"); }
      // collect: walk to the marked coin (the level rings the oldest one), a few times
      const tC = Date.now();
      while (Date.now() - tC < 9000) {
        s = await st();
        if (s.step !== "show" || s.lying <= 0) break;
        if (!s.mark) { await sleep(200); continue; }
        const r = await walk((x) => (x.lying > 0 ? x.mark : null), { stop: 0.25, timeout: 4000, noJump: true, until: (x) => x.step !== "show" });
        if (r === "stuck" || r === "timeout") break;
      }
      await upAll();
    }
    if (fpsP) { await fpsP; s = await st(); fpsLine("show", fps, s); }
    s = await st();
    log("show: coins " + s.coins + "/30 after " + tricks + " tricks; max watchers " + maxWatch + ", max combo " + maxCombo);
    await shot("show-goal");
    await waitFor((x) => x.step === "poster", 15000, "poster after show");
  }

  async function riddlePoint() {
    return page.evaluate(() => {
      const d = window.__platy, o = { x: 0, y: 0, visible: false };
      d.ctx.project(d.level2.zoo.riddle.object, o, 0);
      const h = d.ctx.pick.at(o.x, o.y);
      return { x: o.x, y: o.y, visible: o.visible, pick: !!h };
    });
  }
  async function beatPoster(click) {
    await waitFor((x) => x.step === "poster", 10000, "poster");
    const t0 = Date.now(); let i = 0;
    while (Date.now() - t0 < 40000) {
      const s = await st(); noteRender(s);
      if (s.phase === "ready" || s.step !== "poster") break;
      await shot("poster-" + String(i++).padStart(2, "0") + "-" + ((Date.now() - t0) / 1000).toFixed(0) + "s");
      await sleep(1800);
    }
    await waitFor((x) => x.step === "poster" && x.phase === "ready", 10000, "poster ready");
    await sleep(1200); await shot("poster-ready-hint");
    await waitFor((x) => x.hud.action, 6000, "Continue prompt");
    await sleep(300); await shot("poster-ready-continue");
    const p = await riddlePoint();
    log("riddle poster on screen at " + p.x.toFixed(0) + "," + p.y.toFixed(0) + " visible=" + p.visible + " pickable=" + p.pick);
    if (!click) return p;
    if (!p.pick) throw new Error("the riddle poster is not clickable where it is drawn");
    await page.mouse.move(p.x, p.y);
    await sleep(250);
    const cursor = await page.evaluate(() => getComputedStyle(document.querySelector("canvas")).cursor);
    log("cursor over the riddle: " + cursor);
    await shot("poster-hover");
    await page.mouse.click(p.x, p.y);
    await waitFor((x) => x.riddleFallen, 3000, "riddle falls");
    for (let k = 0; k < 5; k++) { await sleep(620); await shot("riddle-fall-" + k); }
    await sleep(1500); await shot("riddle-answer-pushin");
    await sleep(1800); await shot("riddle-answer");
    return p;
  }
  async function backToMenu(label) {
    const s = await waitFor((x) => x.mode === "menu", 15000, "main screen " + label);
    if (s.running) throw new Error("the level is still running behind the main screen");
    return s;
  }

  let s;
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
    const gpu = await page.evaluate(() => { const gl = window.__platy.renderer.getContext(); const e = gl.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; });
    log("gpu: " + gpu);
    await page.evaluate(() => { window.__platy.resetProgress(); window.__platy.unlock(2); });
    await sleep(500);
    await shot("menu");
    if (await page.evaluate(() => document.getElementById("lvl2").classList.contains("locked"))) throw new Error("level 2 is locked after unlock(2)");
    await page.click("#lvl2");
    s = await waitFor((x) => x.mode === "level" && x.levelN === 2, 30000, "level 2 running");

    const beats = [["title", beatIntro], ["race", beatRace], ["hide", beatHide], ["dive", beatDive], ["ball", beatBall], ["friends", beatFriends],
      ["feed", beatFeed], ["school", beatSchool], ["show", beatShow], ["poster", () => beatPoster(true)]];
    const first = ONLY || FROM || "title";
    if (first !== "title") { await sleep(1500); const ok = await page.evaluate((b) => window.__platy.skipTo(b), first); if (!ok) throw new Error("skipTo " + first + " failed"); }
    for (const [name, fn] of beats) {
      if (reached(name) < reached(first)) continue;
      if (ONLY && name !== ONLY) break;
      log("== " + name);
      await fn();
    }
    if (ONLY && ONLY !== "poster") { await shot("only-end"); }
    else {
      s = await backToMenu("after the riddle ending");
      if (s.progress.unlocked !== 3 || !s.progress.beaten[1]) throw new Error("level 3 did not unlock: " + JSON.stringify(s.progress));
      await sleep(900); await shot("menu-unlocking-3");
      await sleep(2300); await shot("menu-level3-unlocked");
      log("level complete -> main screen, level 3 unlocked");
      report.completed = true;
    }

    if (!ONLY) {
      // ---- replay: hold-to-skip in the wake-up, skipTo every beat, the Continue ending
      await page.click("#lvl2");
      await waitFor((x) => x.mode === "level" && x.levelN === 2 && x.step === "wake" && x.cinema.playing, 30000, "replay wake");
      await sleep(2500);
      await page.keyboard.down("Enter"); await sleep(1400); await page.keyboard.up("Enter");
      s = await waitFor((x) => x.step === "race" && x.player.enabled && x.cinema.faded < 0.05, 8000, "race after hold-to-skip");
      await sleep(800); await shot("replay-skipped-to-race"); ground(await st(), "after skip");
      for (const b of ["hide", "dive", "ball", "friends", "feed", "school", "show", "cutscene", "race"]) {
        await page.evaluate((x) => window.__platy.skipTo(x), b);
        await sleep(1300);
        s = await st(); noteRender(s);
        if (s.step !== b) log("  skipTo " + b + " -> step " + s.step);
      }
      await shot("replay-after-skips");
      // fps in the widest shot of the level (the crane over the whole habitat), no screenshots meanwhile
      await page.evaluate(() => window.__platy.skipTo("cutscene"));
      await sleep(14000);
      { const f = await fpsMeasure(); s = await st(); noteRender(s); fpsLine("wide", f, s); await shot("replay-wide-shot"); }
      await page.evaluate(() => window.__platy.skipTo("poster"));
      await beatPoster(false);
      await page.keyboard.press("KeyE");
      s = await backToMenu("after Continue");
      if (!s.progress.beaten[1] || s.progress.unlocked !== 3) throw new Error("progress wrong after replay: " + JSON.stringify(s.progress));
      log("replay: hold-to-skip, skipTo chain and Continue ending ok");

      // ---- phone portrait: is the riddle poster comfortably tappable?
      await page.evaluate(() => { document.body.classList.add("touch"); });
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true });
      await sleep(600);
      await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
      await page.evaluate(() => { document.body.classList.add("touch"); });
      await page.evaluate(() => { window.__platy.startLevel(2); });
      await waitFor((x) => x.mode === "level" && x.levelN === 2 && x.step === "wake", 30000, "phone level");
      await sleep(1200);
      await page.evaluate(() => window.__platy.skipTo("show"));
      await sleep(1500); await shot("phone-portrait-show");
      await page.evaluate(() => window.__platy.skipTo("poster"));
      const p = await beatPoster(false);
      const size = await page.evaluate(() => {
        const d = window.__platy, o = { x: 0, y: 0, visible: false }, ob = d.level2.zoo.riddle.object, T = d.ctx.THREE;
        const box = new T.Box3().setFromObject(ob); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) { d.ctx.project(new T.Vector3(x, y, box.min.z), o, 0); x0 = Math.min(x0, o.x); x1 = Math.max(x1, o.x); y0 = Math.min(y0, o.y); y1 = Math.max(y1, o.y); }
        return { w: x1 - x0, h: y1 - y0 };
      });
      log("phone portrait: riddle poster is " + size.w.toFixed(0) + " x " + size.h.toFixed(0) + " css px, pickable=" + p.pick);
      report.phoneRiddle = size;
      if (!p.pick) throw new Error("riddle poster not tappable on a phone");
      await page.touchscreen.tap(p.x, p.y);
      await waitFor((x) => x.riddleFallen, 3000, "riddle falls on tap");
      await sleep(5200); await shot("phone-portrait-answer");
      await backToMenu("after the phone ending");
      await page.evaluate(() => { document.body.classList.remove("touch"); window.__platy.resetProgress(); });
    }
    report.maxCalls = maxCalls; report.maxTris = maxTris;
    log("max draw calls seen " + maxCalls + ", max triangles " + maxTris);
    if (maxCalls > 150) throw new Error("draw call budget exceeded: " + maxCalls);
    if (maxTris > 250000) throw new Error("triangle budget exceeded: " + maxTris);
    for (const k of ["show", "wide"]) if (report["fps_" + k] && report["fps_" + k].fps < 55) throw new Error(k + " fps " + report["fps_" + k].fps.toFixed(1) + " < 55");
    report.ok = true;
  } catch (e) {
    report.ok = false;
    report.failure = String(e && e.stack || e);
    console.log("FAILED: " + report.failure);
    try { await upAll(); await shot("failure"); const z = await st(); console.log(JSON.stringify(z)); } catch (_) {}
  }

  // contact sheets (2 x 2) so the shots are quick to review
  try {
    const sp = await browser.newPage();
    await sp.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    const files = report.shots.filter((f) => fs.existsSync(f));
    for (let i = 0, k = 1; i < files.length; i += 4, k++) {
      const cells = files.slice(i, i + 4).map((f) => "<div><img src='data:image/png;base64," + fs.readFileSync(f).toString("base64") + "'><span>" + path.basename(f, ".png") + "</span></div>").join("");
      await sp.setContent("<style>body{margin:0;background:#222;display:grid;grid-template-columns:640px 640px;grid-auto-rows:360px}div{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}img{max-width:640px;max-height:360px}span{position:absolute;left:4px;top:2px;font:bold 13px monospace;color:#ff0;text-shadow:0 0 3px #000,0 0 3px #000}</style>" + cells, { waitUntil: "load" });
      await sp.screenshot({ path: path.join(SHOTS, "l2-sheet-" + String(k).padStart(2, "0") + ".png") });
    }
  } catch (e) { console.log("contact sheets failed: " + e); }

  await browser.close();
  srv.close();
  fs.writeFileSync(path.join(SHOTS, "l2-report.json"), JSON.stringify(report, null, 2));
  console.log("fallbacks: " + report.fallbacks.length);
  console.log("errors: " + errors.length);
  for (const e of errors.slice(0, 30)) console.log("  " + e.slice(0, 600));
  console.log(report.ok ? "PLAYTEST-L2 OK" : "PLAYTEST-L2 FAILED");
  process.exit(report.ok && errors.length === 0 ? 0 : 1);
})();
