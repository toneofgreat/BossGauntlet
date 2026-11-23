// Art-direction pass for levels 2-5: menu, wake blink, zoo light presets, Pip + player, show arena,
// level-5 night, lava lair. Real-time frames (several per animation) + contact sheets.
//   node tools/artpass.cjs [menu] [wake] [zoo] [pip] [show] [night] [lair] [fps]   (no args = all)
// Output: tools/shots/ap-S-<name>.png contact sheets.
const http = require("http"), fs = require("fs"), path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));
const ROOT = path.join(__dirname, ".."), SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const want = process.argv.slice(2);
const on = (n) => want.length === 0 || want.includes(n);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
    fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-store" }); res.end(b); }); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required", "--mute-audio"], defaultViewport: { width: 1280, height: 720 } });
  const errs = [];
  const page = await browser.newPage();
  page.on("pageerror", (e) => errs.push("pageerror: " + (e.stack || e)));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.type() + ": " + m.text()); });
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  let k = 0;
  const shot = async (n) => { const f = path.join(SHOTS, "ap-" + String(++k).padStart(3, "0") + "-" + n + ".png"); await page.screenshot({ path: f }); return f; };
  async function sheet(name, files, cols) {
    const w = 640, h = 360, p2 = await browser.newPage();
    await p2.setViewport({ width: cols * w, height: Math.ceil(files.length / cols) * h });
    await p2.setContent("<body style='margin:0;background:#222;display:grid;grid-template-columns:repeat(" + cols + "," + w + "px)'>" +
      files.map((f) => "<img style='width:" + w + "px;height:" + h + "px;display:block;outline:1px solid #555' src='data:image/png;base64," + fs.readFileSync(f).toString("base64") + "'>").join("") + "</body>");
    await p2.screenshot({ path: path.join(SHOTS, "ap-S-" + name + ".png") }); await p2.close();
    for (const f of files) fs.unlinkSync(f);
    console.log("sheet " + name);
  }
  const st = () => ev(() => window.__platy.state());
  async function waitFor(pred, ms) { const t = Date.now(); while (Date.now() - t < ms) { const s = await st(); if (pred(s)) return s; await sleep(150); } throw new Error("timeout " + pred); }
  async function level(n, skip) {
    await ev((n) => window.__platy.startLevel(n), n);
    await waitFor((s) => s.mode === "level" && s.levelN === n, 40000);
    await sleep(1200);
    if (skip) { const ok = await ev((s) => window.__platy.skipTo(s), skip); if (!ok) throw new Error("skipTo " + skip); }
  }
  async function quit() { await ev(() => window.__platy.quit()); await waitFor((s) => s.mode === "menu", 20000); await sleep(600); }
  // hold the engine camera by overriding after every frame (render again with a fixed camera)
  async function camAt(pos, look, fov) {
    await ev((p, l, f) => {
      const P = window.__platy;
      P.__camHold = { p, l, f };
      if (!P.__camHooked) {
        P.__camHooked = true;
        const r = P.renderer, orig = r.render.bind(r);
        r.render = (sc, c) => { const h = P.__camHold; if (h && c === P.camera) { c.position.set(h.p.x, h.p.y, h.p.z); if (h.f) { c.fov = h.f; c.updateProjectionMatrix(); } c.lookAt(h.l.x, h.l.y, h.l.z); } return orig(sc, c); };
      }
    }, pos, look, fov || 0);
    await sleep(250);
  }
  const camFree = () => ev(() => { const P = window.__platy; P.__camHold = null; P.camera.fov = 50; P.camera.updateProjectionMatrix(); });
  const hideHud = (on) => ev((on) => { let s = document.getElementById("__aphud"); if (!s) { s = document.createElement("style"); s.id = "__aphud"; document.head.appendChild(s); } s.textContent = on ? "#hud,#cap,#obj,#toast{opacity:0!important}" : ""; }, on);
  const fps = async (label, ms) => { const r = await ev((ms) => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(n * 1000 / (performance.now() - t0)); }; requestAnimationFrame(f); }), ms || 3000);
    const info = await ev(() => { const i = window.__platy.renderer.info.render; return { calls: i.calls, tris: i.triangles }; });
    console.log("FPS " + label + ": " + r.toFixed(1) + " calls " + info.calls + " tris " + info.tris); };

  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
    if (on("menu")) {
      const f = [];
      await ev(() => { window.__platy.resetProgress(); window.__platy.unlock(5); }); await sleep(600); f.push(await shot("menu5"));
      await ev(() => window.__platy.unlockAll()); await sleep(600); f.push(await shot("menuAll"));
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true }); await sleep(600);
      const ph = path.join(SHOTS, "ap-S-menu-phone.png"); await page.screenshot({ path: ph });
      await page.setViewport({ width: 1280, height: 720 }); await sleep(600);
      await sheet("menu", f, 1);
    }
    await ev(() => window.__platy.unlockAll());
    if (on("wake")) {
      await ev(() => window.__platy.startLevel(2));
      await waitFor((s) => s.mode === "level" && s.levelN === 2, 40000);
      const f = []; const t0 = Date.now();
      for (const t of (process.env.WT ? process.env.WT.split(",").map(Number) : [2500, 4000, 5000, 6000, 7000, 8000, 9000, 10500, 12000, 14000, 16000, 18000])) { const d = t - (Date.now() - t0); if (d > 0) await sleep(d); f.push(await shot("wake" + t)); }
      if (process.env.WT) { for (const x of f) fs.copyFileSync(x, x.replace("ap-", "apk-")); } await sheet("wake", f, 3);
      await quit();
    }
    if (on("zoo") || on("pip")) {
      await level(2, "race"); await sleep(2500); await hideHud(true);
      const views = [[{ x: -11, y: 6.5, z: 9 }, { x: 0, y: 0.5, z: -1 }], [{ x: -1, y: 1.6, z: 6.5 }, { x: -5.5, y: 0, z: 2 }], [{ x: 6.6, y: 1.1, z: -5.4 }, { x: 8, y: 0.3, z: -8 }], [{ x: 0, y: 1.5, z: 4 }, { x: 0, y: 1.2, z: 10 }], [{ x: 9, y: 1.6, z: 13.5 }, { x: -2, y: 0.4, z: 2 }]];
      if (on("zoo")) {
        for (const tod of ["morning", "noon", "evening", "night", "alarm"]) {
          await ev((t) => window.__platy.world.setTime(t, 0), tod); await sleep(500);
          const f = [];
          for (const [p, l] of views) { await camAt(p, l, 50); f.push(await shot(tod)); }
          await sheet("zoo-" + tod, f, 3);
        }
        await ev(() => window.__platy.world.setTime("noon", 0));
        await camAt({ x: -11, y: 6.5, z: 9 }, { x: 0, y: 0.5, z: -1 }, 50); await camFree(); await fps("L2 zoo noon follow", 3000);
      }
      if (on("pip")) {
        await camFree();
        await ev(() => window.__platy.skipTo("friends")); await sleep(1500);
        const f = [];
        for (let i = 0; i < 6; i++) {
          await ev((i) => { const P = window.__platy, p = P.player, fr = P.level2.friend.group.position;
            const mx = (p.x + fr.x) / 2, mz = (p.z + fr.z) / 2, a = i * 1.05, r = 1.4 + Math.hypot(p.x - fr.x, p.z - fr.z) * 0.6;
            P.__camHold = { p: { x: mx + Math.sin(a) * r, y: p.y + 0.5, z: mz + Math.cos(a) * r }, l: { x: mx, y: p.y + 0.15, z: mz }, f: 40 }; }, i);
          await sleep(700); f.push(await shot("pip" + i));
        }
        await camFree(); await hideHud(false);
        for (let i = 0; i < 3; i++) { await sleep(1200); f.push(await shot("pipfollow" + i)); }
        await sheet("pip", f, 3);
      }
      await hideHud(false); await camFree(); await quit();
    }
    if (on("show")) {
      await level(4, "act1"); const f = [];
      for (let i = 0; i < 6; i++) { await sleep(1800); f.push(await shot("act1-" + i)); }
      await fps("L4 show act1", 3000);
      await ev(() => window.__platy.skipTo("finale")); for (let i = 0; i < 3; i++) { await sleep(1800); f.push(await shot("finale" + i)); }
      await sheet("show", f, 3); await quit();
    }
    if (on("night")) {
      await level(5, "alarm"); const f = [];
      const t0 = Date.now();
      for (let i = 0; i < 18; i++) { await sleep(1500); f.push(await shot("night" + i)); const s = await st(); if (s.step === "wizard" || s.step === "reveal") break; }
      await fps("L5 night", 2500);
      await sheet("night", f, 3); await quit();
    }
    if (on("lair")) {
      await level(5, "reveal"); const f = [];
      for (let i = 0; i < 9; i++) { await sleep(1400); f.push(await shot("reveal" + i)); }
      await ev(() => window.__platy.skipTo("slap")); for (let i = 0; i < 3; i++) { await sleep(1800); f.push(await shot("slap" + i)); }
      await fps("L5 lair", 3000);
      await sheet("lair", f, 3); await quit();
    }
  } catch (e) { errs.push("SCRIPT: " + (e.stack || e)); }
  console.log("errors: " + errs.length); for (const e of errs.slice(0, 20)) console.log("  " + e);
  await browser.close(); srv.close();
})();
