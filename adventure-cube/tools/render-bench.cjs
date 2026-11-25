// render-bench.cjs - RENDER's visual + performance check. Serves the site like playtest.cjs, then for each theme:
// loads a level, runs the cube along (scripted input), measures REAL rAF gaps and renderer.frame() CPU time, and
// saves screenshots to tools/shots/render-*.png. Also shoots the title (menu mode), the builder (edit mode) and a
// phone-size view. Holds tools/browserlock.cjs (one headless browser on the machine at a time).
//   node tools/render-bench.cjs [--quick] [--phone] [--only=area1,area2]
const http = require("http");
const fs = require("fs");
const path = require("path");
const lock = require("./browserlock.cjs");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const GAME = path.join(__dirname, "..");
const SITE = path.join(GAME, "..");
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const QUICK = process.argv.includes("--quick"), PHONE = process.argv.includes("--phone");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      const file = path.join(SITE, p);
      if (!file.startsWith(SITE)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end("nf"); return; }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
        res.end(buf);
      });
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

// in-page: instrument renderer.frame and collect rAF gaps for ms milliseconds
const MEASURE = `async (ms) => {
  const r = window.__cube.app.renderer;
  if (!r.__wrapped) { const f = r.frame; r.__cpu = []; r.frame = function (v) { const t0 = performance.now(); f.call(this, v); r.__cpu.push(performance.now() - t0); }; r.__wrapped = true; }
  r.__cpu.length = 0;
  const gaps = [];
  await new Promise((res) => { let last = performance.now(); const t0 = last; const tick = (now) => { gaps.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
  gaps.shift();
  const st = (a) => { const s = [...a].sort((x, y) => x - y); const avg = a.reduce((p, q) => p + q, 0) / a.length; return { n: a.length, avg: +avg.toFixed(2), p50: +s[Math.floor(s.length * 0.5)].toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), p99: +s[Math.floor(s.length * 0.99)].toFixed(2), max: +s[s.length - 1].toFixed(2) }; };
  const g = st(gaps), c = st(r.__cpu);
  return { gaps: g, fps: +(1000 / g.avg).toFixed(1), slow: gaps.filter((x) => x > 20).length, cpu: c, stats: r.stats ? r.stats() : null };
}`;

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await lock.acquire("adventure-cube render-bench");
  const srv = await serve();
  const url = "http://127.0.0.1:" + srv.address().port + "/adventure-cube/";
  let browser;
  const errors = [], out = [];
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required", "--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
      defaultViewport: { width: 1280, height: 720 },
    });
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push("pageerror: " + (e.stack || e.message || e)));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
    await page.goto(url, { waitUntil: "networkidle0" });
    const gpu = await page.evaluate(() => { try { const c = document.createElement("canvas").getContext("webgl"); const d = c.getExtension("WEBGL_debug_renderer_info"); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : "unknown"; } catch (e) { return "n/a"; } });
    out.push("GPU: " + gpu);
    await page.waitForFunction(() => window.__cube && window.__cube.state().screen === "title", { timeout: 10000 });
    await sleep(QUICK ? 800 : 1500);
    await page.screenshot({ path: path.join(SHOTS, "render-title.png") });
    const tm = await page.evaluate(`(${MEASURE})(${QUICK ? 1500 : 3000})`);
    out.push(`title(menu, area1 bg): fps ${tm.fps} gap avg ${tm.gaps.avg} p95 ${tm.gaps.p95} max ${tm.gaps.max} slow>20ms ${tm.slow} | frame() cpu avg ${tm.cpu.avg} p95 ${tm.cpu.p95} max ${tm.cpu.max}`);

    const levels = ONLY.length ? ONLY : ["test", "area1", "area2", "area3"];
    for (const id of levels) {
      const t0 = Date.now();
      await page.evaluate((id) => window.__cube.loadLevel(id), id);
      await page.waitForFunction(() => window.__cube.state().screen === "play" && window.__cube.state().frame > 3, { timeout: 8000 });
      const loadMs = Date.now() - t0;
      const info = await page.evaluate(() => { const s = window.__cube.sim; return { w: s.W, h: s.H, theme: s.level.theme, cps: s.level.checkpoints.length }; });
      // drive: hold right, jump periodically (the cube will die sometimes, which is fine for visuals)
      await page.evaluate(() => { window.__benchT = setInterval(() => { const f = window.__cube.state().frame; window.__cube.setInput(2 | ((f % 50) < 14 ? 4 : 0)); }, 16); });
      await sleep(1200);
      const m = await page.evaluate(`(${MEASURE})(${QUICK ? 2500 : 5000})`);
      await page.screenshot({ path: path.join(SHOTS, `render-${id}-run.png`) });
      const tim = await page.evaluate(() => window.__cube.app.renderer.stats().timings); out.push("  timings " + JSON.stringify(tim));
      out.push(`${id} (${info.theme} ${info.w}x${info.h}, load ${loadMs} ms): fps ${m.fps} gap avg ${m.gaps.avg} p50 ${m.gaps.p50} p95 ${m.gaps.p95} p99 ${m.gaps.p99} max ${m.gaps.max} slow>20ms ${m.slow}/${m.gaps.n} | frame() cpu avg ${m.cpu.avg} p95 ${m.cpu.p95} max ${m.cpu.max} | ${JSON.stringify(m.stats)}`);
      await page.evaluate(() => { clearInterval(window.__benchT); window.__cube.setInput(null); });
      // scenic shots at checkpoints (teleport the sim to each checkpoint)
      const n = QUICK ? Math.min(2, info.cps) : Math.min(5, info.cps);
      for (let i = 0; i < n; i++) {
        const k = Math.floor(((i + 1) * info.cps) / (n + 1));
        await page.evaluate((k) => { const s = window.__cube.sim; s.reset(k); window.__cube.setInput(0); }, k);
        await sleep(900);
        await page.screenshot({ path: path.join(SHOTS, `render-${id}-cp${k}.png`) });
      }
    }
    // builder / edit mode
    await page.evaluate(() => window.__cube.show("builder", {}));
    await sleep(900);
    await page.mouse.move(500, 360); await sleep(300);
    await page.screenshot({ path: path.join(SHOTS, "render-builder.png") });
    const bm = await page.evaluate(`(${MEASURE})(1500)`);
    out.push(`builder(edit): fps ${bm.fps} gap avg ${bm.gaps.avg} p95 ${bm.gaps.p95} | frame() cpu avg ${bm.cpu.avg} p95 ${bm.cpu.p95}`);
    // palette thumbs sheet
    await page.evaluate(() => {
      const c = document.createElement("canvas"); c.width = 900; c.height = 260; c.id = "thumbsheet"; c.style.cssText = "position:fixed;left:10px;top:10px;z-index:99;background:#223";
      document.body.appendChild(c); const g = c.getContext("2d"); const r = window.__cube.app.renderer;
      const items = [..."#RWI-/\\abcd^v<>~B"].map((t) => ({ tile: t })).concat(["crumble", "spring", "sign"].map((e) => ({ entity: e })), ["log", "plank", "stone", "leaf"].map((k) => ({ entity: "mover", kind: k })), ["thornball", "boulder", "wasp", "spark"].map((k) => ({ entity: "hazard", kind: k })), ["lightning", "geyser", "steam"].map((k) => ({ entity: "pulse", kind: k })), ["oak", "pine", "birch", "deadtree", "bush", "fern", "flowers", "mushrooms", "stump", "boulder", "grass", "reeds", "lantern", "cairn", "bones", "crystal"].map((k) => ({ entity: "deco", kind: k })), ["start", "goal", "checkpoint"].map((m) => ({ marker: m })));
      ["forest", "highlands", "storm"].forEach((th, row) => items.forEach((it, i) => { const x = 6 + (i % 25) * 35, y = 6 + row * 84 + Math.floor(i / 25) * 38; r.drawThumb(g, it, x, y, 32, th); }));
    });
    await sleep(200);
    const el = await page.$("#thumbsheet"); await el.screenshot({ path: path.join(SHOTS, "render-thumbs.png") });
  } catch (e) {
    errors.push("exception: " + (e.stack || e.message));
  } finally {
    if (browser) await browser.close();
    srv.close();
    lock.release();
  }
  if (PHONE) {
    await lock.acquire("adventure-cube render-bench phone");
    const srv2 = await serve();
    const url2 = "http://127.0.0.1:" + srv2.address().port + "/adventure-cube/";
    let b2;
    try {
      // the phone page must be the browser's FIRST page with a matching window: headless Chrome throttles rAF on
      // secondary pages, which looks like a multi-second stall that is not the game's fault
      b2 = await puppeteer.launch({
        headless: true,
        args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=390,844", "--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
        defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
      });
      const page = (await b2.pages())[0] || (await b2.newPage());
      page.on("pageerror", (e) => errors.push("phone pageerror: " + (e.stack || e.message || e)));
      await page.goto(url2, { waitUntil: "load", timeout: 60000 });
      await page.waitForFunction(() => window.__cube && window.__cube.state().screen === "title", { timeout: 20000 });
      await sleep(1500);
      await page.screenshot({ path: path.join(SHOTS, "render-phone-title.png") });
      await page.evaluate(() => window.__cube.loadLevel("area1"));
      await page.waitForFunction(() => window.__cube.state().screen === "play" && window.__cube.state().frame > 10, { timeout: 20000 });
      await page.evaluate(() => window.__cube.setInput(2)); await sleep(1500);
      const pm = await page.evaluate(`(${MEASURE})(2500)`);
      await page.screenshot({ path: path.join(SHOTS, "render-phone.png") });
      out.push(`phone 390x844@2 area1: fps ${pm.fps} gap avg ${pm.gaps.avg} p95 ${pm.gaps.p95} max ${pm.gaps.max} slow>20ms ${pm.slow}/${pm.gaps.n} | frame() cpu avg ${pm.cpu.avg} p95 ${pm.cpu.p95} | ${JSON.stringify(pm.stats)}`);
    } catch (e) {
      errors.push("phone exception: " + (e.stack || e.message));
    } finally {
      if (b2) await b2.close();
      srv2.close();
      lock.release();
    }
  }
  for (const l of out) console.log(l);
  for (const e of errors) console.log("ERR", e);
  process.exit(errors.length ? 1 : 0);
})();
