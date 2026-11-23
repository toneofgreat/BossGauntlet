// Level 4 "THE SHOW": full browser playthrough.
//   node tools/playtest-l4.cjs               the whole level with real keys, then replay / no-input / phone checks
//   node tools/playtest-l4.cjs --from=act2   start the real playthrough at a beat (skipTo)
//   node tools/playtest-l4.cjs --only=home   play just that beat, then stop (no completion checks)
//   node tools/playtest-l4.cjs --phone       only the phone-size HUD shots (portrait and landscape)
// Screenshots: tools/shots/l4-NN-name.png, plus 2x2 contact sheets tools/shots/l4-sheet-NN.png.
// The rhythm bot reads the next due note through the debug seam (__platy.level4.pending()) and presses the
// REAL number key when it is due; a few deliberate mistakes (late, unpressed, wrong key, Space) are mixed in.
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const arg = (k) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=")[1] : null; };
const FROM = arg("from"), ONLY = arg("only"), VERBOSE = process.argv.includes("--verbose"), PHONE = process.argv.includes("--phone");
const ORDER = ["backstage", "entrance", "act1", "act2", "act3", "finale", "bows", "home", "done"];

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
  for (const f of fs.readdirSync(SHOTS)) if (f.startsWith("l4-")) fs.unlinkSync(path.join(SHOTS, f));
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
  page.on("console", (m) => { if (((m.location && m.location()) || {}).url && m.location().url.includes("/api/platypus/")) return; if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });
  page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url()));

  const T0 = Date.now();
  const log = (m) => { m = "[" + ((Date.now() - T0) / 1000).toFixed(0).padStart(3) + "s] " + m; report.steps.push(m); console.log(m); };
  const fallback = (m) => { report.fallbacks.push(m); log("FALLBACK: " + m); };
  let shotMs = 0, shotMax = 0, shotN = 0;
  const shotNow = async (name) => {
    n++;
    const f = path.join(SHOTS, "l4-" + String(n).padStart(2, "0") + "-" + name + ".png");
    const t = Date.now();
    await page.screenshot({ path: f });
    const d = Date.now() - t; shotMs += d; shotN++; if (d > shotMax) shotMax = d;
    report.shots.push(f);
    return f;
  };
  // A screenshot stalls the page for a moment. While the rhythm bot plays, shots are queued and the bot takes
  // them in a gap between notes, so a screenshot never eats a key press.
  const shotQ = [];
  const shot = (name) => {
    if (!bot.on) return shotNow(name);
    return new Promise((res) => shotQ.push({ name, res, t: Date.now() }));
  };
  const st = () => page.evaluate(() => {
    const d = window.__platy; if (!d) return null;
    const s = d.state(), L = d.level4;
    s.acting = !!d.platypus.acting; s.lock = d.player.lock;
    if (L && s.levelN === 4 && s.mode === "level" && d.world) {
      const w = d.world, f = L.friend;
      const fl = (x, z) => Math.max(w.heightAt(x, z), (w.waterAt ? w.waterAt(x, z) : -1e9) - 0.1);
      s.floor = fl(d.player.x, d.player.z);
      s.gy = d.platypus.group.position.y;
      s.ffloor = fl(f.x, f.z);
      s.fgy = f.group.position.y;
      s.keeper = { x: L.keeper.x, z: L.keeper.z, visible: !!L.keeper.visible };
      const o = { x: 0, y: 0, visible: false };
      d.ctx.project(d.platypus.group, o, 0.15); s.scrP = { x: o.x, y: o.y, visible: o.visible };
      d.ctx.project(f.group, o, 0.15); s.scrF = { x: o.x, y: o.y, visible: o.visible };
      s.vw = innerWidth; s.vh = innerHeight;
    }
    return s;
  });
  const waitFor = async (pred, ms, label) => {
    const t0 = Date.now();
    for (;;) {
      const s = await st();
      if (s && pred(s)) return s;
      if (Date.now() - t0 > ms) throw new Error("timeout waiting for " + label + " (step=" + (s && s.step) + ")");
      await sleep(100);
    }
  };
  const fpsOnce = () => page.evaluate(() => new Promise((res) => {
    const gaps = []; let last = performance.now(); const t0 = last;
    function f(t) { gaps.push(t - last); last = t; if (t - t0 < 5000) requestAnimationFrame(f); else {
      gaps.sort((a, b) => a - b);
      res({ fps: gaps.length / ((t - t0) / 1000), p50: gaps[gaps.length >> 1], p95: gaps[(gaps.length * 0.95) | 0], p99: gaps[(gaps.length * 0.99) | 0], max: gaps[gaps.length - 1] });
    } }
    requestAnimationFrame(f);
  }));
  const fpsMeasure = async (tries) => {
    let best = null; const samples = [];
    for (let i = 0; i < (tries || 3); i++) {
      const f = await fpsOnce();
      samples.push(Math.round(f.fps * 10) / 10);
      if (!best || f.fps > best.fps) best = f;
      if (f.fps >= 58) break;
    }
    best.samples = samples;
    return best;
  };
  const fpsLine = (label, f, s) => { report["fps_" + label] = f; report["render_" + label] = s.render; log("FPS " + label + ": " + f.fps.toFixed(1) + " p50 " + f.p50.toFixed(1) + "ms p95 " + f.p95.toFixed(1) + "ms max " + f.max.toFixed(1) + "ms; draw calls " + s.render.calls + " tris " + s.render.triangles + (f.samples && f.samples.length > 1 ? " (samples " + f.samples.join(", ") + ")" : "")); };
  let maxCalls = 0, maxTris = 0;
  const noteRender = (s) => { if (s && s.render) { maxCalls = Math.max(maxCalls, s.render.calls); maxTris = Math.max(maxTris, s.render.triangles); } };
  const ground = (s, label, strict) => {
    if (!s || s.floor === undefined) return;
    const dp = s.gy - s.floor, df = s.fgy - s.ffloor;
    log("  ground check " + label + ": player y-floor=" + dp.toFixed(2) + (s.player.swimming ? " (swimming)" : "") + " friend y-floor=" + df.toFixed(2) + (s.acting ? " (mid-trick)" : ""));
    if (strict && !s.acting && !s.leaping && !s.ringLeap && Math.abs(dp) > 0.3) fallback("player not on the ground at " + label + ": " + dp.toFixed(2));
    if (strict && Math.abs(df) > 0.45) fallback("friend not on the ground at " + label + ": " + df.toFixed(2));
  };
  // both performers must be inside the picture (with a margin) in the fixed-camera beats
  const framed = (s, label) => {
    if (!s || !s.scrP) return;
    const m = 0.04 * s.vw, bad = [];
    for (const [who, p] of [["player", s.scrP], ["Pip", s.scrF]]) if (!p.visible || p.x < m || p.x > s.vw - m || p.y < 0.1 * s.vh || p.y > 0.92 * s.vh) bad.push(who + " at " + p.x.toFixed(0) + "," + p.y.toFixed(0));
    log("  framing " + label + ": player " + s.scrP.x.toFixed(0) + "," + s.scrP.y.toFixed(0) + " Pip " + s.scrF.x.toFixed(0) + "," + s.scrF.y.toFixed(0) + " of " + s.vw + "x" + s.vh);
    if (bad.length) fallback("out of frame at " + label + ": " + bad.join("; "));
  };
  const reached = (beat) => ORDER.indexOf(beat);
  // shoot every `every` ms while cond(s) holds
  async function filmWhile(name, cond, every, maxMs, each) {
    const t0 = Date.now(); let i = 0, lastShot = 0;
    while (Date.now() - t0 < maxMs) {
      const s = await st(); noteRender(s);
      if (!s || !cond(s)) break;
      if (each) await each(s);
      if (Date.now() - lastShot >= every) {
        lastShot = Date.now(); await shot(name + "-" + String(i++).padStart(2, "0") + "-" + ((Date.now() - t0) / 1000).toFixed(0) + "s");
      }
      await sleep(120);
    }
    return (Date.now() - t0) / 1000;
  }

  // ------------------------------------------------------------------ the rhythm bot (real key presses)
  // plan: { "act:i": "skip" | "late" | "wrong" | "space" }
  const bot = { on: false, plan: {}, done: new Map(), presses: 0, p: null };
  async function botLoop() {
    while (bot.on) {
      let nx = null;
      try { nx = await page.evaluate(() => { const L = window.__platy && window.__platy.level4; return L ? L.pending() : null; }); } catch (_) { break; }
      if (shotQ.length) {
        const q = shotQ[0], gap = Date.now() - q.t > 3500 ? 0.85 : 1.3; // a screenshot can stall the page for up to ~1 s
        const free = !nx || nx.d > gap || nx.d < -0.3;
        if (free) { shotQ.shift(); q.res(await shotNow(q.name)); continue; }
      }
      if (nx) {
        const key = nx.act + ":" + nx.i, what = bot.plan[key] || "hit";
        const at = what === "late" ? -0.17 : 0.012;
        if (!(Date.now() - (bot.done.get(key) || 0) < 1500) && nx.d <= at && nx.d > -0.28) {
          bot.done.set(key, Date.now());
          if (what === "skip") { /* a child looks away */ }
          else if (what === "space") { await page.keyboard.press("Space"); bot.presses++; }
          else if (what === "wrong") { await page.keyboard.press("Digit" + (((nx.lane + 1) % 4) + 1)); bot.presses++; }
          else { await page.keyboard.press("Digit" + (nx.lane + 1)); bot.presses++; }
          if (VERBOSE) { const z = await page.evaluate(() => { const q = window.__platy.state(); return q.hits + "h/" + q.perfects + "p/" + q.misses + "m"; }); console.log("    bot " + key + " lane " + (nx.lane + 1) + " " + what + " d=" + nx.d.toFixed(3) + " -> " + z); }
        }
      }
      await sleep(8);
    }
  }
  const botStart = (plan) => { bot.plan = plan || {}; if (!bot.on) { bot.on = true; bot.p = botLoop(); } };
  const botStop = async () => { bot.on = false; if (bot.p) await bot.p; bot.p = null; while (shotQ.length) { const q = shotQ.shift(); q.res(await shotNow(q.name)); } };

  // ---------------------------------------------------------------- the beats
  async function beatBackstage() {
    await sleep(900); await shot("title");
    let s = await waitFor((x) => x.step === "backstage" && x.player.enabled && x.cinema.faded < 0.1, 20000, "backstage playable");
    await sleep(600); await shot("backstage-start"); ground(await st(), "backstage", true);
    await sleep(3200); await shot("backstage-pip-beckons");
    await sleep(2400); await shot("backstage-pip-ahead");
    await page.keyboard.down("KeyW");
    let i = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) {
      s = await st(); noteRender(s);
      if (s.step !== "backstage") break;
      if (i < 3 && s.player.z > -11.3 + i * 1.5) { i++; await shot("backstage-walk-" + i); }
      await sleep(80);
    }
    await page.keyboard.up("KeyW");
    if (s.step === "backstage") throw new Error("walking forward for 25 s did not reach the tunnel mouth (player " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1) + ")");
    log("backstage: walked the tunnel in " + ((Date.now() - t0) / 1000).toFixed(1) + " s");
  }
  async function beatEntrance() {
    await waitFor((x) => x.step === "entrance", 10000, "entrance");
    const t = await filmWhile("entrance", (x) => x.step === "entrance", 1300, 40000);
    log("entrance cutscene ran " + t.toFixed(1) + " s");
  }
  async function beatAct(k, plan, every) {
    let s = await waitFor((x) => x.step === "act" + k, 15000, "act " + k);
    const before = { hits: s.hits, perfects: s.perfects, misses: s.misses };
    botStart(plan);
    let ring = 0, grounded = 0, fpsP = null, fps = null, sw = false;
    const t = await filmWhile("act" + k, (x) => x.step === "act" + k, every || 2600, 90000, async (x) => {
      if (x.ringLeap && ring < 3) { ring++; await sleep(330); await shot("act" + k + "-ring-leap-" + ring); }
      if (k === 2 && !sw && x.actBeat > 31.5) { sw = true; await shot("act2-swap-sides"); }
      if (x.act === k && !x.acting && !x.ringLeap && grounded < 2 && x.actBeat > (grounded ? 30 : -2)) { grounded++; ground(x, "act " + k + " beat " + x.actBeat.toFixed(0), k !== 2); framed(x, "act " + k + " beat " + x.actBeat.toFixed(0)); }
      if (!fpsP && x.act === k && x.actBeat > (k === 2 ? 8 : 20)) fpsP = fpsMeasure(2).then((f) => { fps = f; });
    });
    if (fpsP) { await fpsP; s = await st(); fpsLine("act" + k, fps, s); }
    s = await st();
    log("act " + k + " ran " + t.toFixed(1) + " s: hits +" + (s.hits - before.hits) + " (perfect +" + (s.perfects - before.perfects) + "), misses +" + (s.misses - before.misses) + "; score " + s.score + ", combo best " + s.bestCombo + ", excitement " + s.excitement.toFixed(2) + ", coins " + s.coins + ", clock " + s.clock);
    report["act" + k] = { hits: s.hits - before.hits, perfects: s.perfects - before.perfects, misses: s.misses - before.misses };
  }
  async function beatFinale() {
    let s = await waitFor((x) => x.step === "finale", 15000, "finale");
    botStart({});
    let leapShots = 0, rollShots = 0;
    const t = await filmWhile("finale", (x) => x.step === "finale", 1500, 60000, async (x) => {
      if (x.rolling && rollShots < 1) { rollShots++; ground(x, "tower top", true); await sleep(2100); framed(await st(), "finale count"); }
      if (x.leaping && leapShots < 7) { leapShots++; await shot("finale-leap-" + leapShots); await sleep(260); }
    });
    s = await st();
    log("finale ran " + t.toFixed(1) + " s; bonus " + s.bonus + " (30 = perfect)");
    report.bonus = s.bonus;
  }
  async function beatBows() {
    let s = await waitFor((x) => x.step === "bows", 15000, "bows");
    let fpsP = null, fps = null, g = false;
    const t = await filmWhile("bows", (x) => x.step === "bows", 1300, 40000, async (x) => {
      if (!fpsP && x.bowPhase >= 1) fpsP = fpsMeasure(1).then((f) => { fps = f; });
      if (!g && x.bowPhase >= 3) { g = true; ground(x, "bows", true); framed(x, "bows"); report.stars = x.stars; report.coins = x.coins; report.score = x.score; log("  result: " + x.stars + " stars, score " + x.score + "/" + x.maxScore + ", coins " + x.coins + ", hits " + x.hits + " perfect " + x.perfects + " misses " + x.misses + " of " + x.notes); }
    });
    if (fpsP) { await fpsP; s = await st(); fpsLine("bows", fps, s); }
    log("bows ran " + t.toFixed(1) + " s");
  }
  async function beatHome() {
    await waitFor((x) => x.step === "home" || x.mode === "menu", 15000, "home");
    let fpsP = null, fps = null, fs2 = null, g1 = false, g2 = false;
    const t = await filmWhile("home", (x) => x.step === "home" && x.mode === "level", 1300, 70000, async (x) => {
      if (!fpsP && x.world === "zoo" && x.cinema.faded < 0.05) fpsP = fpsMeasure(1).then(async (f) => { fps = f; fs2 = await st(); });
      if (!g1 && x.homeDown && x.world === "zoo") { g1 = true; await sleep(900); ground(await st(), "home, set down at the nest", true); }
      if (!g2 && x.pipUp) { g2 = true; await sleep(600); ground(await st(), "home, Pip on the lookout", true); }
    });
    if (fpsP) { await fpsP; if (fs2 && fs2.render) fpsLine("home", fps, fs2); }
    log("home cutscene ran " + t.toFixed(1) + " s");
  }
  async function backToMenu(label) {
    const s = await waitFor((x) => x.mode === "menu", 25000, "main screen " + label);
    if (s.running) throw new Error("the level is still running behind the main screen");
    return s;
  }
  const holdEnter = async () => { await page.keyboard.down("Enter"); await sleep(1400); await page.keyboard.up("Enter"); };

  let s;
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
    const gpu = await page.evaluate(() => { const gl = window.__platy.renderer.getContext(); const e = gl.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; });
    log("gpu: " + gpu);
    await page.evaluate(() => { window.__platy.resetProgress(); window.__platy.unlock(4); });
    await sleep(500);
    await shot("menu");
    if (await page.evaluate(() => document.getElementById("lvl4").classList.contains("locked"))) throw new Error("level 4 is locked after unlock(4)");
    await page.click("#lvl4");
    s = await waitFor((x) => x.mode === "level" && x.levelN === 4, 40000, "level 4 running");

    // a child's mistakes: act 1 has two unpressed notes, a late one, a wrong key and one on Space
    const PLAN1 = { "1:3": "skip", "1:4": "skip", "1:7": "late", "1:9": "wrong", "1:10": "space" };
    const PLAN2 = { "2:5": "late", "2:17": "skip" };
    const PLAN3 = { "3:9": "wrong", "3:14": "late" };
    const beats = [["backstage", beatBackstage], ["entrance", beatEntrance], ["act1", () => beatAct(1, PLAN1)], ["act2", () => beatAct(2, PLAN2)],
      ["act3", () => beatAct(3, PLAN3)], ["finale", beatFinale], ["bows", beatBows], ["home", beatHome]];
    const first = ONLY || FROM || "backstage";
    if (PHONE) { await sleep(1500); await page.evaluate(() => window.__platy.quit()); await backToMenu("phone-only run"); }
    else {
    if (first !== "backstage") { await sleep(1500); const ok = await page.evaluate((b) => window.__platy.skipTo(b), first); if (!ok) throw new Error("skipTo " + first + " failed"); }
    for (const [name, fn] of beats) {
      if (reached(name) < reached(first)) continue;
      if (ONLY && name !== ONLY) break;
      log("== " + name);
      await fn();
    }
    await botStop();
    if (ONLY && ONLY !== "home") { await shot("only-end"); }
    else {
      s = await backToMenu("after the home cutscene");
      if (s.progress.unlocked !== 5 || !s.progress.beaten[3]) throw new Error("level 5 did not unlock: " + JSON.stringify(s.progress));
      await sleep(900); await shot("menu-unlocking-5");
      await sleep(2300); await shot("menu-level5-unlocked");
      log("level complete -> main screen, level 5 unlocked");
      report.completed = true;
    }
    }

    if (!ONLY && !FROM && !PHONE) {
      // ---- replay: hold-to-skip the entrance, play act 1 with NO input (all misses), skipTo chain, skip the home scene
      await page.click("#lvl4");
      await waitFor((x) => x.mode === "level" && x.levelN === 4 && x.step === "backstage" && x.player.enabled, 40000, "replay backstage");
      await page.evaluate(() => window.__platy.skipTo("entrance"));
      await waitFor((x) => x.step === "entrance" && x.cinema.playing, 8000, "replay entrance");
      await sleep(2500); await holdEnter();
      s = await waitFor((x) => x.step === "act1" && x.act === 1 && x.cinema.faded < 0.05, 12000, "act 1 after hold-to-skip");
      await sleep(700); await shot("replay-skipped-to-act1"); ground(await st(), "after skipping the entrance", true);
      // nobody presses anything: misses, the Space tip, the show goes on
      await sleep(9000); await shot("replay-no-input-misses");
      s = await st();
      if (s.misses < 2) throw new Error("no-input: expected misses by now, got " + s.misses);
      log("replay no-input: " + s.misses + " misses, excitement " + s.excitement.toFixed(2) + ", still " + s.step);
      for (const b of ["act2", "act3", "finale", "bows", "backstage", "act2", "finale"]) {
        const ok = await page.evaluate((x) => window.__platy.skipTo(x), b);
        await sleep(1700);
        s = await st(); noteRender(s);
        if (!ok || s.step !== b) throw new Error("skipTo " + b + " -> step " + s.step);
        await shot("replay-skipTo-" + b); ground(s, "skipTo " + b, b !== "act2");
      }
      // finale with nobody pressing: the leap must still happen and the level go on to the bows
      s = await waitFor((x) => x.step === "bows", 25000, "the leap without input");
      if (s.bonus !== 5) throw new Error("no-input finale should pay 5, paid " + s.bonus);
      log("replay: finale without input leapt by itself (bonus 5)");
      await page.evaluate(() => window.__platy.skipTo("home"));
      await waitFor((x) => x.step === "home" && x.world === "zoo" && x.cinema.faded < 0.3, 12000, "replay home");
      await sleep(1500); await holdEnter();
      s = await backToMenu("after skipping the home cutscene");
      if (!s.progress.beaten[3] || s.progress.unlocked !== 5) throw new Error("progress wrong after replay: " + JSON.stringify(s.progress));
      log("replay: hold-to-skip (entrance, home), no-input, skipTo chain ok");

      // ---- quit mid-show with the levels button state, then re-enter (state must be clean)
      await page.evaluate(() => window.__platy.startLevel(4));
      await waitFor((x) => x.mode === "level" && x.levelN === 4 && x.step === "backstage" && x.player.enabled, 40000, "third visit");
      await page.evaluate(() => window.__platy.skipTo("act2"));
      await sleep(5000);
      await page.evaluate(() => window.__platy.quit());
      await backToMenu("after quitting mid-act");
      await page.evaluate(() => window.__platy.startLevel(4));
      s = await waitFor((x) => x.mode === "level" && x.levelN === 4 && x.step === "backstage" && x.player.enabled && x.cinema.faded < 0.1, 40000, "fourth visit");
      if (s.score !== 0 || s.coins !== 0 || s.world !== "stage") throw new Error("re-entry is not clean: " + JSON.stringify({ score: s.score, coins: s.coins, world: s.world }));
      await sleep(500); await shot("reentry-backstage");
      await page.evaluate(() => window.__platy.quit());
      await backToMenu("after the re-entry check");
      log("quit mid-act and re-entry ok");
    }
    if ((!ONLY && !FROM) || PHONE) {

      // ---- phone portrait: the rhythm HUD in each act, the finale count and the results
      await page.evaluate(() => { document.body.classList.add("touch"); });
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true });
      await sleep(600);
      await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
      await page.evaluate(() => { document.body.classList.add("touch"); });
      await page.evaluate(() => { window.__platy.startLevel(4); });
      await waitFor((x) => x.mode === "level" && x.levelN === 4 && x.step === "backstage" && x.player.enabled, 40000, "phone level");
      await sleep(1500); await shot("phone-portrait-backstage");
      botStart({});
      for (const b of ["act1", "act2", "act3", "finale"]) {
        await page.evaluate((x) => window.__platy.skipTo(x), b);
        await sleep(b === "finale" ? 3200 : 7500);
        await shot("phone-portrait-" + b); framed(await st(), "phone portrait " + b);
      }
      await botStop();
      await page.evaluate(() => window.__platy.skipTo("bows"));
      await sleep(6500); await shot("phone-portrait-bows-result"); framed(await st(), "phone portrait bows");
      await page.evaluate(() => window.__platy.skipTo("home"));
      await sleep(9000); await shot("phone-portrait-home");
      // phone landscape
      await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, hasTouch: true });
      await sleep(600);
      await page.evaluate(() => window.__platy.skipTo("act1"));
      botStart({});
      await sleep(7500); await shot("phone-landscape-act1");
      await page.evaluate(() => window.__platy.skipTo("act2"));
      await sleep(7500); await shot("phone-landscape-act2");
      await page.evaluate(() => window.__platy.skipTo("finale"));
      await sleep(3200); await shot("phone-landscape-finale");
      await botStop();
      await page.evaluate(() => window.__platy.win());
      await backToMenu("after the phone run");
      await page.evaluate(() => { document.body.classList.remove("touch"); window.__platy.resetProgress(); });
      log("phone shots ok");
    }
    report.maxCalls = maxCalls; report.maxTris = maxTris;
    log("screenshots: " + shotN + ", avg " + (shotMs / Math.max(1, shotN)).toFixed(0) + " ms, max " + shotMax + " ms");
    log("max draw calls seen " + maxCalls + ", max triangles " + maxTris);
    if (maxCalls > 150) throw new Error("draw call budget exceeded: " + maxCalls);
    if (maxTris > 250000) throw new Error("triangle budget exceeded: " + maxTris);
    for (const k of ["act1", "act2", "act3", "bows", "home"]) if (report["fps_" + k] && report["fps_" + k].fps < 55) throw new Error(k + " fps " + report["fps_" + k].fps.toFixed(1) + " < 55");
    if (report.fallbacks.length) throw new Error(report.fallbacks.length + " check(s) failed, see FALLBACK lines");
    report.ok = true;
  } catch (e) {
    report.ok = false;
    report.failure = String(e && e.stack || e);
    console.log("FAILED: " + report.failure);
    try { await botStop(); await shot("failure"); console.log(JSON.stringify(await st())); } catch (_) {}
  }
  bot.on = false;

  // contact sheets (2 x 2) so the shots are quick to review
  try {
    const sp = await browser.newPage();
    await sp.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    const files = report.shots.filter((f) => fs.existsSync(f));
    for (let i = 0, k = 1; i < files.length; i += 4, k++) {
      const cells = files.slice(i, i + 4).map((f) => "<div><img src='data:image/png;base64," + fs.readFileSync(f).toString("base64") + "'><span>" + path.basename(f, ".png") + "</span></div>").join("");
      await sp.setContent("<style>body{margin:0;background:#222;display:grid;grid-template-columns:640px 640px;grid-auto-rows:360px}div{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}img{max-width:640px;max-height:360px}span{position:absolute;left:4px;top:2px;font:bold 13px monospace;color:#ff0;text-shadow:0 0 3px #000,0 0 3px #000}</style>" + cells, { waitUntil: "load" });
      await sp.screenshot({ path: path.join(SHOTS, "l4-sheet-" + String(k).padStart(2, "0") + ".png") });
    }
  } catch (e) { console.log("contact sheets failed: " + e); }

  await browser.close();
  srv.close();
  fs.writeFileSync(path.join(SHOTS, "l4-report.json"), JSON.stringify(report, null, 2));
  console.log("fallbacks: " + report.fallbacks.length);
  for (const f of report.fallbacks) console.log("  " + f);
  console.log("errors: " + errors.length);
  for (const e of errors.slice(0, 30)) console.log("  " + e.slice(0, 600));
  console.log(report.ok ? "PLAYTEST-L4 OK" : "PLAYTEST-L4 FAILED");
  process.exit(report.ok && errors.length === 0 ? 0 : 1);
})();
