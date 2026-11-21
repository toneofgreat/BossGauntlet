// Level 3 "ANOTHER DAY": full browser playthrough.
//   node tools/playtest-l3.cjs                 the whole level with real keys, then replay / phone checks
//   node tools/playtest-l3.cjs --from=synchro  start the real playthrough at a beat (skipTo)
//   node tools/playtest-l3.cjs --only=show     play just that beat, then stop (no completion checks)
// Screenshots: tools/shots/l3-NN-name.png, plus 2x2 contact sheets tools/shots/l3-sheet-NN.png.
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const arg = (k) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=")[1] : null; };
const FROM = arg("from"), ONLY = arg("only");
const ORDER = ["wake", "forage", "tag", "bubbles", "synchro", "hoop", "show", "dinner", "poster", "done"];
const GOAL = 50;

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
  for (const f of fs.readdirSync(SHOTS)) if (f.startsWith("l3-")) fs.unlinkSync(path.join(SHOTS, f));
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
    const f = path.join(SHOTS, "l3-" + String(n).padStart(2, "0") + "-" + name + ".png");
    await page.screenshot({ path: f });
    report.shots.push(f);
    return f;
  };
  const st = () => page.evaluate(() => {
    const d = window.__platy; if (!d) return null;
    const s = d.state(), L = d.level3;
    s.hud = { action: !!d.ui.actionOn, tricks: !!d.ui.tricksOn };
    s.acting = !!d.platypus.acting; s.lock = d.player.lock; s.walking = !!d.player.walking;
    if (L && s.levelN === 3 && s.mode === "level") {
      const f = L.friend, w = d.world, v = { x: 0, y: 0, z: 0 };
      s.friend = { x: f.x, y: f.y, z: f.z, busy: !!f.busy, swimming: !!f.swimming, floor: w ? Math.max(w.heightAt(f.x, f.z), w.waterAt(f.x, f.z) - 0.1) : 0 };
      s.floor = d.ctx.floorAt(d.player.x, d.player.z);
      s.snacks = [];
      for (let i = 0; i < 6; i++) if (L.props.snacks.active(i)) { L.props.snacks.pos(i, v); s.snacks.push({ i, x: v.x, z: v.z, buried: L.props.snacks.buried(i), h: w.heightAt(v.x, v.z), w: w.waterAt(v.x, v.z) }); }
      s.ringPoses = L.RINGS.map((r) => ({ x: r.x, y: r.y, z: r.z }));
      s.hoop = { x: L.zoo.hoop.x, y: L.zoo.hoop.y, z: L.zoo.hoop.z, r: L.zoo.hoop.r };
      s.P = { showRock: L.zoo.P.showRock, bowl: L.zoo.P.bowl, poolDeep: L.zoo.P.poolDeep };
      s.realWatchers = L.crowd.watchers(d.player.x);
      s.keeper = { x: L.keeper.x, z: L.keeper.z, visible: !!L.keeper.visible };
      s.actionLabel = (document.querySelector("#action, .action") || {}).textContent || "";
    }
    return s;
  });
  const waitFor = async (pred, ms, label) => {
    const t0 = Date.now();
    for (;;) {
      const s = await st();
      if (s && pred(s)) return s;
      if (Date.now() - t0 > ms) throw new Error("timeout waiting for " + label + " (step=" + (s && s.step) + " live=" + (s && s.live) + ")");
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
      if (Date.now() < detourT) { // blocked by a rock: go round it, like a player would
        const a = Math.atan2(t.x - s.player.x, t.z - s.player.z) + detourSide * 1.35;
        await aimAt(s.player.x + Math.sin(a) * 3, s.player.z + Math.cos(a) * 3);
      } else await aimAt(t.x, t.z);
      await down("KeyW");
      if (o.each) await o.each(s, t, d);
      if (Math.hypot(s.player.x - lastX, s.player.z - lastZ) > 0.25) { lastX = s.player.x; lastZ = s.player.z; lastT = Date.now(); jumps = 0; }
      else if (s.player.enabled && Date.now() - lastT > 900 + jumps * 700) {
        if (jumps >= 7) { res = "stuck"; break; }
        jumps++;
        if (jumps >= 2) { detourSide = jumps % 2 ? 1 : -1; detourT = Date.now() + 1300 + jumps * 250; lastT = Date.now() + 1200; }
        else if (!o.noJump) { await page.keyboard.press("Space"); }
      }
      await sleep(70);
    }
    await up("KeyW");
    return res;
  }
  const fpsOnce = () => page.evaluate(() => new Promise((res) => {
    const gaps = []; let last = performance.now(); const t0 = last;
    function f(t) { gaps.push(t - last); last = t; if (t - t0 < 5000) requestAnimationFrame(f); else {
      gaps.sort((a, b) => a - b);
      res({ fps: gaps.length / ((t - t0) / 1000), p50: gaps[gaps.length >> 1], p95: gaps[(gaps.length * 0.95) | 0], p99: gaps[(gaps.length * 0.99) | 0], max: gaps[gaps.length - 1] });
    } }
    requestAnimationFrame(f);
  }));
  const fpsMeasure = async () => {
    let best = null; const samples = [];
    for (let i = 0; i < 3; i++) {
      const f = await fpsOnce();
      samples.push(Math.round(f.fps * 10) / 10);
      if (!best || f.fps > best.fps) best = f;
      if (f.fps >= 58) break;
    }
    best.samples = samples;
    return best;
  };
  const fpsLine = (label, f, s) => { report["fps_" + label] = f; report["render_" + label] = s.render; log("FPS " + label + ": " + f.fps.toFixed(1) + " p50 " + f.p50.toFixed(1) + "ms p95 " + f.p95.toFixed(1) + "ms max " + f.max.toFixed(1) + "ms; draw calls " + s.render.calls + " tris " + s.render.triangles + (f.samples && f.samples.length > 1 ? " (samples " + f.samples.join(", ") + ")" : "")); };
  const ground = (s, label) => {
    if (!s || !s.friend) return;
    const dp = s.player.y - s.floor, df = s.friend.y - s.friend.floor;
    log("  ground check " + label + ": player y-floor=" + dp.toFixed(2) + (s.player.swimming ? " (swimming)" : "") + " friend y-floor=" + df.toFixed(2) + (s.friend.swimming ? " (swimming)" : ""));
    if (!s.player.swimming && !s.acting && s.player.grounded && Math.abs(dp) > 0.3) fallback("player not on the ground at " + label + ": " + dp.toFixed(2));
  };
  let maxCalls = 0, maxTris = 0;
  const noteRender = (s) => { if (s && s.render) { maxCalls = Math.max(maxCalls, s.render.calls); maxTris = Math.max(maxTris, s.render.triangles); } };
  const reached = (beat) => ORDER.indexOf(beat);
  // shoot a cutscene every `every` ms while cond(s) holds
  async function filmWhile(name, cond, every, maxMs) {
    const t0 = Date.now(); let i = 0;
    while (Date.now() - t0 < maxMs) {
      const s = await st(); noteRender(s);
      if (!cond(s)) break;
      await shot(name + "-" + String(i++).padStart(2, "0") + "-" + ((Date.now() - t0) / 1000).toFixed(0) + "s");
      await sleep(every);
    }
    return (Date.now() - t0) / 1000;
  }

  // ---------------------------------------------------------------- the beats
  async function beatWake() {
    await sleep(900); await shot("title");
    await waitFor((s) => s.step === "wake" && s.cinema.playing, 15000, "wake cutscene");
    const t = await filmWhile("wake", (s) => s.step === "wake", 1500, 40000);
    log("wake cutscene ran " + t.toFixed(1) + " s");
    await waitFor((x) => x.step === "forage", 10000, "forage after wake");
  }

  async function beatForage() {
    let s = await waitFor((x) => x.step === "forage", 10000, "forage");
    if (s.cinema.playing) {
      const t = await filmWhile("keeper-breakfast", (x) => x.step === "forage" && x.cinema.playing, 1500, 30000);
      log("keeper breakfast cutscene ran " + t.toFixed(1) + " s");
    }
    s = await waitFor((x) => x.step === "forage" && x.live && x.player.enabled && !x.cinema.playing && x.cinema.faded < 0.05, 12000, "forage playable");
    await sleep(1200); await shot("forage-start"); ground(await st(), "forage start");
    if (s.snacks.length !== 6) throw new Error("expected 6 buried yabbies, got " + s.snacks.length);
    log("  yabby spots (ground / water): " + s.snacks.map((k) => k.x.toFixed(1) + "," + k.z.toFixed(1) + " " + k.h.toFixed(2) + "/" + (k.w != null && k.w > -99 ? k.w.toFixed(2) : "-")).join("; "));
    // the electro-sense from far away
    await page.keyboard.press("KeyE"); await sleep(280); await shot("forage-sense-far"); await sleep(900);
    let shots = 0;
    const tEnd = Date.now() + 200000;
    while (Date.now() < tEnd) {
      s = await st(); noteRender(s);
      if (s.step !== "forage" || s.quests.forage) break;
      if (!s.snacks.length) { await sleep(200); continue; }
      // nearest left
      let best = s.snacks[0], bd = 1e9;
      for (const k of s.snacks) { const d = Math.hypot(k.x - s.player.x, k.z - s.player.z); if (d < bd) { bd = d; best = k; } }
      const id = best.i;
      // half way: sense again (warm hint + ring)
      if (shots === 0 && bd > 4) {
        await walk(() => best, { stop: 2.6, timeout: 20000 });
        await sleep(300); await page.keyboard.press("KeyE"); await sleep(300); await shot("forage-sense-warm"); await sleep(800);
      }
      const r = await walk((x) => x.snacks.find((k) => k.i === id) || null, { stop: 0.55, timeout: 30000, until: (x) => x.step !== "forage" });
      s = await st();
      if (r === "stuck" || r === "timeout") { fallback("forage: could not walk to yabby " + id + " (" + r + ") at " + best.x.toFixed(1) + "," + best.z.toFixed(1) + " from " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1)); await tp(best.x + 0.3, best.z + 0.3); }
      await sleep(350);
      if (shots < 2) await shot("forage-dig-prompt-" + id);
      await page.keyboard.press("KeyE"); await sleep(380);
      if (shots < 2) await shot("forage-dug-" + id);
      await sleep(600);
      if (shots < 2) await shot("forage-eat-prompt-" + id);
      await page.keyboard.press("KeyE"); await sleep(420);
      if (shots < 2) { await shot("forage-eating-" + id); ground(await st(), "forage eat " + id); }
      shots++;
      await waitFor((x) => x.step !== "forage" || !x.snacks.find((k) => k.i === id) || x.lock <= 0, 5000, "eat done");
      await sleep(500);
    }
    s = await st();
    log("forage: yabbies " + s.yabbies + "/6 (Pip found " + s.pipFound + ")");
    await shot("forage-done");
    await waitFor((x) => x.step === "tag", 12000, "tag after forage");
  }

  async function beatTag() {
    let s = await waitFor((x) => x.step === "tag" && x.live && x.player.enabled, 10000, "tag playable");
    await sleep(900); await shot("tag-banner");
    // round A: run from Pip. Run to whichever waypoint is farthest from the friend.
    const WPS = [{ x: 6, z: 3 }, { x: 0, z: -2 }, { x: 7, z: -2 }, { x: 1, z: 6 }, { x: 4, z: 0 }];
    let shots = 0;
    const tFlee = Date.now();
    while (Date.now() - tFlee < 40000) {
      s = await st(); noteRender(s);
      if (s.step !== "tag" || s.tagPhase !== "flee") break;
      let best = WPS[0], bd = -1;
      for (const w of WPS) { const d = Math.hypot(w.x - s.friend.x, w.z - s.friend.z) - 0.4 * Math.hypot(w.x - s.player.x, w.z - s.player.z); if (d > bd) { bd = d; best = w; } }
      await aimAt(best.x, best.z); await down("KeyW");
      if (shots < 2 && Date.now() - tFlee > 4000 + shots * 7000) { shots++; await shot("tag-flee-" + shots); ground(s, "tag flee"); }
      await sleep(120);
    }
    await upAll();
    s = await waitFor((x) => x.step !== "tag" || x.tagPhase === "catch", 30000, "you're it");
    await sleep(700); await shot("tag-youre-it");
    const tEnd = Date.now() + 170000; let got = 0, tRound = Date.now();
    while (Date.now() < tEnd) {
      s = await st(); noteRender(s);
      if (s.step !== "tag" || s.tags >= 3) break;
      if (s.tags !== got) { got = s.tags; log("  tag " + got + " after " + ((Date.now() - tRound) / 1000).toFixed(1) + " s"); await up("KeyW"); await sleep(350); await shot("tag-" + got); tRound = Date.now(); await sleep(1500); continue; }
      await aimAt(s.friend.x, s.friend.z); await down("KeyW");
      if (Date.now() - tRound > 12000 && Date.now() - tRound < 12300) await shot("tag-chasing-" + (got + 1));
      await sleep(70);
    }
    await upAll();
    s = await st();
    log("tag: " + s.tags + "/3" + (s.tired ? " (Pip got tired)" : ""));
    await sleep(500); await shot("tag-done"); ground(await st(), "tag done");
    await waitFor((x) => x.step === "bubbles", 12000, "bubbles after tag");
  }

  async function beatBubbles() {
    let s = await waitFor((x) => x.step === "bubbles" && x.live && x.player.enabled, 10000, "bubbles playable");
    await sleep(1000); await shot("bubbles-banner");
    let got = 0, shots = 0, under = 0, tRing = Date.now(), leaps = 0;
    const tEnd = Date.now() + 240000;
    while (Date.now() < tEnd) {
      s = await st(); noteRender(s);
      if (s.step !== "bubbles" || s.shell || s.rings >= 8) break;
      if (s.rings !== got) { got = s.rings; tRing = Date.now(); if (shots < 4) { shots++; await shot("bubbles-ring-" + got); } }
      const i = s.ringNext;
      if (i < 0) { // Pip has not laid one yet: swim toward the pool
        await aimAt(-4, 3); if (Math.hypot(s.player.x + 4, s.player.z - 3) > 2) await down("KeyW"); else await up("KeyW");
        await up("Space"); await sleep(120); continue;
      }
      const r = s.ringPoses[i];
      const d = Math.hypot(r.x - s.player.x, r.z - s.player.z);
      await aimAt(r.x, r.z);
      await down("KeyW");
      if (s.player.swimming && d < 3.0 && s.player.y + 0.15 > r.y + 0.12) await down("Space"); else await up("Space");
      if (s.player.diving && under < 3 && s.player.y < -0.6 && d < 2.2) { under++; await shot("bubbles-underwater-" + under); }
      if (s.acting && leaps < 1) { leaps++; await shot("bubbles-water-leap"); }
      if (Date.now() - tRing > 45000) { fallback("bubbles: ring " + i + " not reached in 45 s by swimming (player " + s.player.x.toFixed(1) + "," + s.player.y.toFixed(1) + "," + s.player.z.toFixed(1) + " ring " + r.x.toFixed(1) + "," + r.y.toFixed(1) + "," + r.z.toFixed(1) + ")"); await tp(r.x, r.z); tRing = Date.now(); }
      await sleep(60);
    }
    await upAll();
    s = await st();
    log("bubbles: rings " + s.rings + "/8");
    await sleep(1500); await shot("bubbles-shell-objective");
    // the shiny shell at the bottom
    const tS = Date.now(); let sh = false;
    while (Date.now() - tS < 70000) {
      s = await st(); noteRender(s);
      if (s.step !== "bubbles" || s.quests.bubbles) break;
      const p = s.P.poolDeep, d = Math.hypot(p.x - s.player.x, p.z - s.player.z);
      await aimAt(p.x, p.z);
      if (d > 0.35) await down("KeyW"); else await up("KeyW");
      if (d < 2.2) await down("Space"); else await up("Space");
      if (!sh && s.player.diving && s.player.y < -1.0) { sh = true; await shot("bubbles-shell-dive"); }
      if (Date.now() - tS > 40000 && !s.quests.bubbles) { fallback("bubbles: shell not grabbed in 40 s"); break; }
      await sleep(60);
    }
    await upAll();
    await sleep(500); await shot("bubbles-shell-got");
    s = await waitFor((x) => x.step !== "bubbles" || x.quests.bubbles, 60000, "shell");
    log("bubbles done, coins " + s.coins);
    await waitFor((x) => x.step === "synchro", 12000, "synchro after bubbles");
  }

  async function beatSynchro() {
    let s = await waitFor((x) => x.step === "synchro" && x.live && x.player.enabled, 10000, "synchro playable");
    await sleep(1000); await shot("synchro-banner");
    let r = await walk((x) => x.P.showRock, { stop: 0.9, timeout: 40000, until: (x) => x.synchroPhase !== "go" || x.step !== "synchro" });
    s = await st();
    if (s.synchroPhase === "go") {
      if (r !== "ok") { fallback("synchro: could not walk to the show rock (" + r + ") from " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1)); await tp(s.P.showRock.x, s.P.showRock.z, 0); }
      await waitFor((x) => x.synchroPhase !== "go", 30000, "round 1 starts");
    }
    await shot("synchro-at-rock"); ground(await st(), "show rock");
    let wrongDone = false;
    for (let round = 0; round < 3; round++) {
      for (let attempt = 0; attempt < 3; attempt++) {
        s = await waitFor((x) => x.step !== "synchro" || x.synchroRound > round || (x.synchroRound === round && x.synchroPhase === "demo"), 20000, "demo r" + round);
        if (s.step !== "synchro" || s.synchroRound > round) break;
        await sleep(1500); await shot("synchro-r" + (round + 1) + "-demo-a"); noteRender(await st());
        await sleep(1300); if (attempt === 0) await shot("synchro-r" + (round + 1) + "-demo-b");
        s = await waitFor((x) => x.step !== "synchro" || x.synchroPhase === "turn", 30000, "turn r" + round);
        if (s.step !== "synchro") break;
        await sleep(500); await shot("synchro-r" + (round + 1) + "-your-turn");
        const seq = s.seq;
        log("  round " + (round + 1) + " sequence " + seq.map((x) => x + 1).join(" "));
        let failed = false;
        for (let k = 0; k < seq.length; k++) {
          s = await waitFor((x) => x.step !== "synchro" || x.synchroPhase !== "turn" || (!x.acting && x.lock <= 0 && x.player.grounded), 8000, "slot free");
          if (s.step !== "synchro" || s.synchroPhase !== "turn") break;
          if (round === 1 && k === 1 && !wrongDone) { // a child's mistake: the wrong key
            wrongDone = true; failed = true;
            await page.keyboard.press("Digit" + (((seq[k] + 1) % 4) + 1));
            await sleep(450); await shot("synchro-oops");
            break;
          }
          await page.keyboard.press("Digit" + (seq[k] + 1));
          await sleep(480);
          if (round === 0 || (round === 2 && k < 2)) await shot("synchro-r" + (round + 1) + "-trick-" + (seq[k] + 1));
        }
        if (!failed) break;
      }
      s = await waitFor((x) => x.step !== "synchro" || x.synchroRound > round, 15000, "round " + round + " paid");
      await sleep(700); await shot("synchro-r" + (round + 1) + "-paid");
      // pick the coins up while Pip gets ready
      const tC = Date.now();
      while (Date.now() - tC < 2200) { s = await st(); if (s.lying <= 0 || s.step !== "synchro") break; await sleep(200); }
    }
    s = await waitFor((x) => x.step === "hoop", 15000, "hoop after synchro");
    log("synchro ok; coins so far " + s.coins);
  }

  async function beatHoop() {
    let s = await waitFor((x) => x.step === "hoop" && x.live && x.player.enabled, 10000, "hoop playable");
    await sleep(900); await shot("hoop-banner");
    const h = s.hoop;
    let ok = false;
    for (let attempt = 0; attempt < 6 && !ok; attempt++) {
      const dir = attempt % 2 === 0 ? -1 : 1;                 // run-up side along x (the ring faces +-x)
      const startPt = { x: h.x + dir * 2.6, z: h.z };
      const r = await walk(() => startPt, { stop: 0.3, timeout: 15000, until: (x) => x.step !== "hoop" });
      s = await st(); if (s.step !== "hoop") { ok = true; break; }
      if (r !== "ok") { fallback("hoop: could not reach the run-up (" + r + ")"); await tp(startPt.x, startPt.z); }
      await sleep(300);
      if (attempt === 0) { await page.evaluate((x, z) => { const d = window.__platy, p = d.player; d.cam.yaw = Math.atan2(x - p.x, z - p.z); d.cam.manualT = 6; }, h.x, h.z); await sleep(700); await shot("hoop-run-up"); }
      const far = { x: h.x - dir * 2.6, z: h.z };
      let jumped = false, sh = false;
      const t0 = Date.now();
      while (Date.now() - t0 < 5000) {
        s = await st();
        if (s.step !== "hoop" || s.hoops > 0) { ok = true; break; }
        const dx = Math.abs(s.player.x - h.x);
        await aimAt(far.x, far.z); await down("KeyW");
        if (!jumped && dx < 1.05) { jumped = true; await page.keyboard.press("Space"); }
        if (jumped && !sh && dx < 0.45) { sh = true; await shot("hoop-jump-" + (attempt + 1)); }
        if (Math.hypot(s.player.x - far.x, s.player.z - far.z) < 0.4) break;
        await sleep(30);
      }
      await upAll();
      s = await st(); if (s.step !== "hoop" || s.hoops > 0) ok = true;
      log("  hoop attempt " + (attempt + 1) + ": " + (ok ? "through" : "missed"));
    }
    await sleep(500); await shot("hoop-done");
    s = await waitFor((x) => x.step === "show", 130000, "show after hoop");
    if (!ok) fallback("hoop: never jumped through, the level's timer moved on");
  }

  async function beatShow() {
    let s = await waitFor((x) => x.step === "show" && x.live && x.player.enabled, 10000, "show");
    await sleep(800); await shot("show-banner");
    let k = 0, shots = 0, fpsP = null, fps = null, tricks = 0, maxWatch = 0, maxCombo = 0, maxReal = 0;
    const order = [0, 1, 2, 3];
    const tEnd = Date.now() + 320000, tStart = Date.now();
    while (Date.now() < tEnd) {
      s = await st(); noteRender(s);
      if (s.step !== "show" || s.quests.show) break;
      maxWatch = Math.max(maxWatch, s.watchers); maxCombo = Math.max(maxCombo, s.combo); maxReal = Math.max(maxReal, s.realWatchers);
      if (s.coins >= GOAL) { await sleep(300); continue; }
      for (let j = 0; j < 4; j++) {
        s = await waitFor((x) => x.step !== "show" || (!x.acting && x.lock <= 0 && x.player.grounded), 8000, "trick slot free");
        if (s.step !== "show" || s.quests.show) break;
        if (s.player.z < 5 || s.player.swimming || Math.abs(s.player.x - 3) > 3.5) { await walk((x) => x.P.showRock, { stop: 0.8, timeout: 12000, until: (x) => x.step !== "show" }); }
        await page.keyboard.press("Digit" + (order[k++ % 4] + 1)); tricks++;
        await sleep(520);
        if (shots < 10) { shots++; await shot("show-trick-" + tricks); }
        if (tricks === 9 && !fpsP) fpsP = fpsMeasure().then((f) => { fps = f; });
      }
      await sleep(900);
      s = await st(); maxWatch = Math.max(maxWatch, s.watchers); maxCombo = Math.max(maxCombo, s.combo); maxReal = Math.max(maxReal, s.realWatchers);
      if (shots < 14) { shots++; await shot("show-coins-flying"); }
      const tC = Date.now();
      while (Date.now() - tC < 6000) {
        s = await st();
        if (s.step !== "show" || s.lying <= 0 || s.quests.show) break;
        await sleep(250);
      }
      await upAll();
    }
    if (fpsP) { await fpsP; s = await st(); fpsLine("show", fps, s); }
    s = await st();
    log("show: coins " + s.coins + "/" + GOAL + " after " + tricks + " tricks in " + ((Date.now() - tStart) / 1000).toFixed(0) + " s; max watchers " + maxWatch + " (at the glass: " + maxReal + "), max combo " + maxCombo);
    report.show = { coins: s.coins, tricks, maxWatch, maxReal, maxCombo };
    await shot("show-goal"); ground(s, "show end");
    await waitFor((x) => x.step === "dinner", 20000, "dinner after show");
  }

  async function beatDinner() {
    let s = await waitFor((x) => x.step === "dinner", 10000, "dinner");
    await sleep(500);
    const t = await filmWhile("keeper-dinner", (x) => x.step === "dinner" && (x.cinema.playing || !x.live), 1500, 30000);
    log("keeper dinner cutscene ran " + t.toFixed(1) + " s");
    s = await waitFor((x) => x.step === "dinner" && x.live && x.player.enabled && !x.cinema.playing && x.cinema.faded < 0.05, 12000, "dinner playable");
    await sleep(900); await shot("dinner-start");
    let r = await walk((x) => x.P.bowl, { stop: 0.9, timeout: 40000, until: (x) => x.hud.action || x.step !== "dinner" });
    s = await st();
    if (!s.hud.action) { fallback("dinner: could not walk to the bowl (" + r + ") from " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1)); await tp(s.P.bowl.x - 0.8, s.P.bowl.z + 0.5, 2.0); await sleep(600); }
    await sleep(1500); await shot("dinner-at-bowl"); ground(await st(), "at bowl");
    for (let k = 0; k < 10; k++) {
      s = await st();
      if (s.step !== "dinner" || s.bites >= 3) break;
      if (s.hud.action) { await page.keyboard.press("KeyE"); await sleep(600); if (k < 3) await shot("dinner-eating-" + (k + 1)); }
      await sleep(500);
    }
    s = await st();
    log("dinner: bites " + s.bites + "/3");
    await sleep(2200); await shot("dinner-yawn");
    await waitFor((x) => x.step === "poster" || x.step === "done", 15000, "poster after dinner");
  }

  async function beatPoster() {
    await waitFor((x) => x.step === "poster" || x.step === "done" || x.mode === "menu", 10000, "poster");
    const t = await filmWhile("poster", (x) => x.step === "poster" && x.mode === "level", 1500, 45000);
    log("poster ending ran " + t.toFixed(1) + " s");
  }
  async function backToMenu(label) {
    const s = await waitFor((x) => x.mode === "menu", 20000, "main screen " + label);
    if (s.running) throw new Error("the level is still running behind the main screen");
    return s;
  }

  let s;
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
    const gpu = await page.evaluate(() => { const gl = window.__platy.renderer.getContext(); const e = gl.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; });
    log("gpu: " + gpu);
    await page.evaluate(() => { window.__platy.resetProgress(); window.__platy.unlock(3); });
    await sleep(500);
    await shot("menu");
    if (await page.evaluate(() => document.getElementById("lvl3").classList.contains("locked"))) throw new Error("level 3 is locked after unlock(3)");
    await page.click("#lvl3");
    s = await waitFor((x) => x.mode === "level" && x.levelN === 3, 30000, "level 3 running");

    const beats = [["wake", beatWake], ["forage", beatForage], ["tag", beatTag], ["bubbles", beatBubbles], ["synchro", beatSynchro], ["hoop", beatHoop],
      ["show", beatShow], ["dinner", beatDinner], ["poster", beatPoster]];
    const first = ONLY || FROM || "wake";
    if (first !== "wake") { await sleep(1500); const ok = await page.evaluate((b) => window.__platy.skipTo(b), first); if (!ok) throw new Error("skipTo " + first + " failed"); }
    for (const [name, fn] of beats) {
      if (reached(name) < reached(first)) continue;
      if (ONLY && name !== ONLY) break;
      log("== " + name);
      await fn();
    }
    if (ONLY && ONLY !== "poster") { await shot("only-end"); }
    else {
      s = await backToMenu("after the poster");
      if (s.progress.unlocked !== 4 || !s.progress.beaten[2]) throw new Error("level 4 did not unlock: " + JSON.stringify(s.progress));
      await sleep(900); await shot("menu-unlocking-4");
      await sleep(2300); await shot("menu-level4-unlocked");
      log("level complete -> main screen, level 4 unlocked");
      report.completed = true;
    }

    if (!ONLY && !FROM) {
      // ---- replay: hold-to-skip both opening cutscenes, skipTo every beat, hold-to-skip the ending
      await page.click("#lvl3");
      await waitFor((x) => x.mode === "level" && x.levelN === 3 && x.step === "wake" && x.cinema.playing, 30000, "replay wake");
      await sleep(2500);
      await page.keyboard.down("Enter"); await sleep(1400); await page.keyboard.up("Enter");
      await waitFor((x) => x.step === "forage", 8000, "forage after hold-to-skip");
      await sleep(1800);
      s = await st();
      if (s.cinema.playing) { await page.keyboard.down("Enter"); await sleep(1400); await page.keyboard.up("Enter"); }
      s = await waitFor((x) => x.step === "forage" && x.live && x.player.enabled && x.cinema.faded < 0.05, 10000, "forage playable after skips");
      if (s.snacks.length !== 6) throw new Error("after skipping the keeper there are " + s.snacks.length + " yabbies");
      await sleep(800); await shot("replay-skipped-to-forage"); ground(await st(), "after skip");
      for (const b of ["tag", "bubbles", "synchro", "hoop", "show", "dinner", "wake", "forage", "show"]) {
        const ok = await page.evaluate((x) => window.__platy.skipTo(x), b);
        await sleep(1400);
        s = await st(); noteRender(s);
        if (!ok || s.step !== b) throw new Error("skipTo " + b + " -> step " + s.step);
        await shot("replay-skipTo-" + b); ground(s, "skipTo " + b);
      }
      // fps in the widest view: evening, strolling crowd, camera pulled back over the whole habitat
      await page.evaluate(() => { const d = window.__platy; d.tp(-2, -3, 0.6); d.look(0.6, 0.5, 6.5); });
      await sleep(2500);
      { const f = await fpsMeasure(); s = await st(); noteRender(s); fpsLine("wide", f, s); await shot("replay-wide-view"); }
      await page.evaluate(() => { window.__platy.cam.manualT = 0; });
      await page.evaluate(() => window.__platy.skipTo("poster"));
      await sleep(3000);
      await page.keyboard.down("Enter"); await sleep(1400); await page.keyboard.up("Enter");
      s = await backToMenu("after skipping the poster ending");
      if (!s.progress.beaten[2] || s.progress.unlocked !== 4) throw new Error("progress wrong after replay: " + JSON.stringify(s.progress));
      log("replay: hold-to-skip (wake, keeper, poster) and skipTo chain ok");

      // ---- phone portrait: HUD and the poster ending
      await page.evaluate(() => { document.body.classList.add("touch"); });
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true });
      await sleep(600);
      await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
      await page.evaluate(() => { document.body.classList.add("touch"); });
      await page.evaluate(() => { window.__platy.startLevel(3); });
      await waitFor((x) => x.mode === "level" && x.levelN === 3 && x.step === "wake", 30000, "phone level");
      await sleep(1500);
      for (const b of ["forage", "synchro", "show"]) {
        await page.evaluate((x) => window.__platy.skipTo(x), b);
        await sleep(b === "synchro" ? 1500 : 2200);
        if (b === "synchro") { await page.evaluate(() => { const d = window.__platy, r = d.level3.zoo.P.showRock; d.tp(r.x, r.z, 0); }); await sleep(7000); }
        await shot("phone-portrait-" + b);
      }
      await page.evaluate(() => window.__platy.skipTo("poster"));
      await sleep(4500); await shot("phone-portrait-poster-walk");
      await sleep(7500); await shot("phone-portrait-poster-close");
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
    try { await upAll(); await shot("failure"); const z = await st(); if (z) { delete z.ringPoses; } console.log(JSON.stringify(z)); } catch (_) {}
  }

  // contact sheets (2 x 2) so the shots are quick to review
  try {
    const sp = await browser.newPage();
    await sp.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    const files = report.shots.filter((f) => fs.existsSync(f));
    for (let i = 0, k = 1; i < files.length; i += 4, k++) {
      const cells = files.slice(i, i + 4).map((f) => "<div><img src='data:image/png;base64," + fs.readFileSync(f).toString("base64") + "'><span>" + path.basename(f, ".png") + "</span></div>").join("");
      await sp.setContent("<style>body{margin:0;background:#222;display:grid;grid-template-columns:640px 640px;grid-auto-rows:360px}div{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}img{max-width:640px;max-height:360px}span{position:absolute;left:4px;top:2px;font:bold 13px monospace;color:#ff0;text-shadow:0 0 3px #000,0 0 3px #000}</style>" + cells, { waitUntil: "load" });
      await sp.screenshot({ path: path.join(SHOTS, "l3-sheet-" + String(k).padStart(2, "0") + ".png") });
    }
  } catch (e) { console.log("contact sheets failed: " + e); }

  await browser.close();
  srv.close();
  fs.writeFileSync(path.join(SHOTS, "l3-report.json"), JSON.stringify(report, null, 2));
  console.log("fallbacks: " + report.fallbacks.length);
  for (const f of report.fallbacks) console.log("  " + f);
  console.log("errors: " + errors.length);
  for (const e of errors.slice(0, 30)) console.log("  " + e.slice(0, 600));
  console.log(report.ok ? "PLAYTEST-L3 OK" : "PLAYTEST-L3 FAILED");
  process.exit(report.ok && errors.length === 0 ? 0 : 1);
})();
