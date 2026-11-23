// Full playthrough test for the platypus game.
//   node tools/playtest.cjs            (from anywhere)      --quick  : do not fight for real (debug win)
//                                                           --chain  : skip level 1, only test menu + levels 2..5
// Serves the game folder on a free port, plays main screen -> level 1 -> victory -> main screen (level 2
// unlocked) with real key presses (plus the window.__platy debug seam for positioning), then walks the
// unlock chain 2 -> 3 -> 4 -> 5 (6..11: see playtest-engine2.cjs), saves screenshots to tools/shots/ and measures fps.
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const QUICK = process.argv.includes("--quick");
const CHAIN_ONLY = process.argv.includes("--chain");

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
  const srv = await serve();
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
    defaultViewport: { width: 1280, height: 720 },
  });
  const errors = [];
  const report = { url, steps: [], errors };
  let n = 0;
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + (e.stack || e.message || e)));
  page.on("console", (m) => { if (((m.location && m.location()) || {}).url && m.location().url.includes("/api/platypus/")) return; if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });
  page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url()));

  const st = () => page.evaluate(() => window.__platy && window.__platy.state());
  const shot = async (name) => { n++; const f = path.join(SHOTS, String(n).padStart(2, "0") + "-" + name + ".png"); await page.screenshot({ path: f }); return f; };
  const waitFor = async (pred, ms, label) => {
    const t0 = Date.now();
    for (;;) {
      const s = await st();
      if (s && pred(s)) return s;
      if (Date.now() - t0 > ms) throw new Error("timeout waiting for " + label + " (step=" + (s && s.step) + ")");
      await sleep(100);
    }
  };
  const log = (m) => { report.steps.push(m); console.log(m); };

  let s;
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
    const gpu = await page.evaluate(() => { const gl = window.__platy.renderer.getContext(); const e = gl.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; });
    log("gpu: " + gpu);
    await page.evaluate(() => window.__platy.resetProgress());
    await sleep(400);
    await shot("start");
    {
      const m = await page.evaluate(() => Array.from(document.querySelectorAll(".lvl")).map((b) => ({ n: b.dataset.n, locked: b.classList.contains("locked"), bg: getComputedStyle(b).backgroundImage.slice(0, 80) })));
      log("menu: " + m.map((b) => b.n + (b.locked ? " locked" : " open")).join(", "));
      if (m.length !== 13 || m[0].locked || !m.slice(1).every((b) => b.locked)) throw new Error("fresh menu must show 13 circles with only level 1 open");
      // a locked circle only shakes
      await page.click("#lvl3");
      await sleep(250); await shot("menu-locked-shake");
      const s0 = await st();
      if (s0.mode !== "menu") throw new Error("a locked level started");
    }
    if (CHAIN_ONLY) await page.evaluate(() => window.__platy.unlock(2));
    else {

    // 1. LEVEL 1 circle -> black -> TUTORIAL -> white -> world
    await page.click("#levelBtn");
    await sleep(700); await shot("black");
    await sleep(1300); await shot("tutorial");
    await sleep(2100); await shot("white");
    await waitFor((s) => s.running, 8000, "world running");
    await sleep(1500); await shot("reveal");
    await waitFor((s) => s.step === "greet", 8000, "greet");
    await sleep(1800); await shot("greet");
    log("intro ok");

    // 2. wizard talks; hurry him along with Enter
    for (let i = 0; i < 12; i++) {
      const s = await st();
      if (s.step === "move") break;
      await page.keyboard.press("Enter");
      await sleep(350);
    }
    await waitFor((s) => s.step === "move", 15000, "move step");
    await sleep(600);

    // 3. move (real keys)
    await page.keyboard.down("KeyW");
    await sleep(900); await shot("walk");
    await page.keyboard.down("KeyD");
    await sleep(900); await shot("walk-turn");
    await page.keyboard.up("KeyD");
    await sleep(1600);
    await page.keyboard.up("KeyW");
    await waitFor((s) => s.step === "jump", 8000, "jump step");
    log("move ok");

    // 4. jump twice
    await sleep(500);
    for (let i = 0; i < 4; i++) {
      const s = await st();
      if (s.step !== "jump") break;
      await page.keyboard.press("Space");
      await sleep(260);
      if (i === 0) await shot("jump");
      await sleep(900);
    }
    await waitFor((s) => s.step === "sting", 8000, "sting step");
    log("jump ok");

    // 5. ankle sting on the dummy
    await sleep(1400);
    s = await st();
    const d0 = s.dummies[0];
    await shot("sting-dummy-appears");
    {
      const dx = s.player.x - d0.x, dz = s.player.z - d0.z, l = Math.hypot(dx, dz) || 1;
      await page.evaluate((x, z, yaw) => window.__platy.tp(x, z, yaw), d0.x + (dx / l) * 1.0, d0.z + (dz / l) * 1.0, Math.atan2(-dx, -dz));
    }
    await sleep(900); await shot("sting-ready");
    for (let i = 0; i < 5; i++) {
      s = await st();
      if (s.step !== "sting") break;
      await page.keyboard.press("KeyJ");
      await sleep(250);
      if (i === 0) await shot("sting-hit");
      await sleep(550);
    }
    await shot("sting-done");
    await waitFor((x) => x.step === "zap", 8000, "zap step");
    log("sting ok");

    // 6. electro pulse through the water, one dummy per attack
    s = await waitFor((x) => x.water && x.water.rise >= 1, 8000, "water risen");
    await shot("water");
    // first try from dry land: must be refused with a hint
    await page.keyboard.press("KeyK");
    await sleep(500);
    s = await st();
    if (s.dummies.filter((d) => d.on && d.alive).length !== 3) throw new Error("pulse worked from dry land");
    await shot("zap-refused");
    const w = s.water;
    await page.evaluate((x, z) => { window.__platy.tp(x, z, Math.PI / 2); window.__platy.look(Math.PI / 2 - 0.5, 0.5, 4.6); }, w.x - w.length / 2 + 1.2, w.z);
    await sleep(900);
    s = await st();
    log("in water: " + s.player.inWater + " y=" + s.player.y.toFixed(2));
    await shot("zap-in-water");
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("KeyK");
      await sleep(430); if (i === 0) await shot("zap-charge");
      await sleep(260); if (i === 0) await shot("zap-pulse");
      await sleep(300); if (i === 0) await shot("zap-shock");
      await sleep(900);
      s = await st();
      const alive = s.dummies.filter((d) => d.on && d.alive).length;
      log("after pulse " + (i + 1) + ": dummies standing = " + alive);
      if (alive !== 2 - i) throw new Error("pulse " + (i + 1) + " did not hit exactly one dummy");
    }
    await shot("zap-done");
    await waitFor((x) => x.step === "fight", 8000, "fight step");
    log("zap ok");

    // 7. the human
    await sleep(1200); await shot("fight-start");
    await page.evaluate(() => { window.__platy.cam.manualT = 0; });
    // fps over 5 s of fighting
    const fpsP = page.evaluate(() => new Promise((res) => {
      const gaps = []; let last = performance.now(); const t0 = last;
      function f(t) { gaps.push(t - last); last = t; if (t - t0 < 5000) requestAnimationFrame(f); else {
        gaps.sort((a, b) => a - b);
        res({ fps: gaps.length / ((t - t0) / 1000), p50: gaps[gaps.length >> 1], p95: gaps[(gaps.length * 0.95) | 0], p99: gaps[(gaps.length * 0.99) | 0], max: gaps[gaps.length - 1] });
      } }
      requestAnimationFrame(f);
    }));
    await page.keyboard.down("KeyA");
    await sleep(1600); await page.keyboard.up("KeyA");
    await page.keyboard.down("KeyW");
    await sleep(1500); await page.keyboard.up("KeyW");
    const fps = await fpsP;
    report.fps = fps;
    s = await st();
    report.render = s.render;
    log("fps " + fps.fps.toFixed(1) + " p50 " + fps.p50.toFixed(1) + "ms p95 " + fps.p95.toFixed(1) + "ms max " + fps.max.toFixed(1) + "ms; draw calls " + s.render.calls + " tris " + s.render.triangles);

    // fight for real: wait in the water, zap when he is near it, sting when he is close
    await page.evaluate((x, z) => window.__platy.tp(x, z, 0), w.x, w.z);
    let shots = 0, legit = false;
    const tEnd = Date.now() + (QUICK ? 5000 : 75000);
    while (Date.now() < tEnd) {
      s = await st();
      if (s.step === "victory") { legit = true; break; }
      if (s.human && s.human.alive) {
        const dist = Math.hypot(s.human.x - s.player.x, s.human.z - s.player.z);
        if (s.human.state === "windup" && shots < 1) { await shot("fight-windup"); shots++; }
        if (s.zapCd <= 0 && s.player.inWater) { await page.keyboard.press("KeyK"); await sleep(300); if (shots === 1) { await shot("fight-zap"); shots++; } }
        else if (dist < 1.45 && s.stingCd <= 0) { await page.keyboard.press("KeyJ"); await sleep(260); if (shots === 2) { await shot("fight-sting"); shots++; } }
        if (!s.player.inWater && s.player.enabled) await page.evaluate((x, z) => window.__platy.tp(x, z, 0), w.x, w.z);
      }
      await sleep(120);
    }
    s = await st();
    log("fight: legit win = " + legit + ", hearts left = " + s.hearts + ", human hp = " + s.humanHp);
    report.legitWin = legit;
    if (!legit) { await page.evaluate(() => window.__platy.win()); }
    await sleep(1200); await shot("human-down");
    await page.waitForFunction(() => document.getElementById("victory").classList.contains("on"), { timeout: 10000 });
    await sleep(1400); await shot("victory");
    log("victory ok");

    // 8. Continue returns to the main screen, where level 2 unlocks
    const label = await page.evaluate(() => document.getElementById("again").textContent);
    if (label !== "Continue") throw new Error("victory button should say Continue, says " + label);
    await page.click("#again");
    await waitFor((x) => x.mode === "menu", 6000, "back on the main screen");
    await sleep(700); await shot("menu-before-unlock");
    await sleep(700); await shot("menu-unlocking");
    await sleep(2200); await shot("menu-level2-unlocked");
    s = await st();
    if (s.progress.unlocked !== 2 || !s.progress.beaten[0]) throw new Error("level 2 did not unlock: " + JSON.stringify(s.progress));
    if (s.running) throw new Error("the level is still running behind the main screen");
    log("continue -> main screen, level 2 unlocked ok");
    }

    // 9. the unlock chain 2 -> 3 -> 4 -> 5 (placeholder or real levels: driven through the debug seam)
    for (let n = 2; n <= 5; n++) {
      const locked = await page.evaluate((k) => document.getElementById("lvl" + k).classList.contains("locked"), n);
      if (locked) throw new Error("level " + n + " is still locked on the main screen");
      await sleep(400);
      await page.click("#lvl" + n);
      await sleep(1900); await shot("L" + n + "-title");
      let s2 = await waitFor((x) => x.mode === "level" && x.levelN === n, 20000, "level " + n + " running");
      if (n === 2 || n === 5) {
        // the wake-up blink (only in the placeholder / when the level starts with it)
        for (let i = 0; i < 9; i++) { await sleep(750); s2 = await st(); if (s2.cinema.eye < 1 || i < 2) await shot("L" + n + "-eye-" + i); }
      }
      await sleep(1500);
      // hold Enter to skip whatever cutscene is running
      for (let i = 0; i < 6; i++) {
        s2 = await st();
        if (!s2.cinema.playing) break;
        await page.keyboard.down("Enter"); await sleep(1300); await page.keyboard.up("Enter"); await sleep(900);
      }
      await sleep(1500);
      s2 = await st();
      await shot("L" + n + "-play");
      log("level " + n + ": step=" + s2.step + " calls=" + s2.render.calls + " tris=" + s2.render.triangles + " fps=" + s2.fps.toFixed(0));
      if (s2.step === "play") {
        await page.keyboard.down("KeyW"); await sleep(700); await page.keyboard.up("KeyW");
        await page.keyboard.press("KeyE");
      } else await page.evaluate(() => window.__platy.win());
      await sleep(1600); await shot("L" + n + "-complete");
      // a Continue card, or (level 5) the end card that returns by itself
      for (let i = 0; i < 150; i++) {
        s2 = await st();
        if (s2.mode === "menu") break;
        const card = await page.evaluate(() => document.getElementById("victory").classList.contains("on"));
        if (card) { await page.click("#again"); await sleep(400); }
        await sleep(200);
      }
      s2 = await waitFor((x) => x.mode === "menu", 5000, "main screen after level " + n);
      const want = n + 1; // (off platyfy.com beating level 5 opens level 6: placeholders until levels 6-11 land)
      if (s2.progress.unlocked !== want || !s2.progress.beaten[n - 1]) throw new Error("after level " + n + ": " + JSON.stringify(s2.progress));
      await sleep(1700); await shot("menu-after-L" + n);
      await sleep(1500);
      log("level " + n + " -> main screen ok (unlocked " + s2.progress.unlocked + ")");
    }
    await shot("menu-all-beaten");

    // 10. progress survives a reload
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
    s = await st();
    if (s.progress.unlocked !== 6) throw new Error("progress was not saved: " + JSON.stringify(s.progress));
    log("progress persisted ok");

    // 11. touch layout (level 1 replayed from the main screen through the debug seam)
    await page.evaluate(() => { document.body.classList.add("touch"); });
    await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
    await sleep(500); await shot("menu-phone-landscape");
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await sleep(500); await shot("menu-phone-portrait");
    await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
    await page.evaluate(() => window.__platy.startLevel(1));
    await waitFor((x) => x.mode === "level" && x.step === "greet", 20000, "level 1 replay");
    await page.evaluate(() => window.__platy.skipTo("fight"));
    await sleep(1500); await shot("touch-layout");
    await page.evaluate(() => window.__platy.resetProgress());
    report.ok = true;
  } catch (e) {
    report.ok = false;
    report.failure = String(e && e.stack || e);
    console.log("FAILED: " + report.failure);
    try { await shot("failure"); console.log(JSON.stringify(await st())); } catch (_) {}
  }
  await browser.close();
  srv.close();
  fs.writeFileSync(path.join(SHOTS, "report.json"), JSON.stringify(report, null, 2));
  console.log("errors: " + errors.length);
  for (const e of errors.slice(0, 30)) console.log("  " + e.slice(0, 600));
  console.log(report.ok ? "PLAYTEST OK" : "PLAYTEST FAILED");
  process.exit(report.ok && errors.length === 0 ? 0 : 1);
})();
