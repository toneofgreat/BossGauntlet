// Scratch test for the level 12-13 modules in isolation (volcano, magmor, winddance, woods, farlands, babies, house).
//   node tools/modtest-l12.cjs --mod=volcano          runs that module's scenes, screenshots to tools/shots/m12-<mod>-*.png
//   node tools/modtest-l12.cjs --mod=all
// It starts level 11 (only for the engine), silences the level's update, activates the module's world and
// poses the player / camera through the debug seam. Reports fps, draw calls and triangles for every shot.
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const arg = (k) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=")[1] : null; };
const MOD = arg("mod") || "all";
const ONLY = arg("only");

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

// each case: [name, setup js (async, runs in page with d = __platy, M = window.__m), wait ms]
const CASES = require("./modtest-l12-cases.cjs");

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve();
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
    defaultViewport: { width: 1280, height: 720 },
  });
  const LIMIT = +(arg("limit") || 540) * 1000;
  const wd = setTimeout(async () => { console.log("WATCHDOG"); try { await browser.close(); } catch (_) {} srv.close(); process.exit(2); }, LIMIT);
  const errors = [];
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + (e.stack || e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning" || m.text().startsWith("[m]")) errors.push(m.type() + ": " + m.text()); });
  const out = [];
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
    await page.evaluate(() => { window.__platy.unlockAll(); window.__platy.startLevel(11); });
    await page.waitForFunction(() => { const s = window.__platy.state(); return s.mode === "level" && s.levelN === 11; }, { timeout: 40000 });
    await sleep(2500);
    await page.evaluate(() => {
      const d = window.__platy, L = d.level();
      L.update = () => {};
      d.cinema.fade("clear", 0.01);
      d.ui.showHud(false);
      d.player.enabled = true;
      d.ctx.health.disable();
      const st = document.createElement("style"); st.textContent = "body *{visibility:hidden !important} canvas{visibility:visible !important}"; document.head.appendChild(st);
    });
    const mods = MOD === "all" ? Object.keys(CASES) : MOD.split(",");
    for (const mod of mods) {
      for (const [name, js, wait] of CASES[mod]) {
        if (ONLY && name !== ONLY) continue;
        try {
          await page.evaluate("(async () => { const d = window.__platy, ctx = d.ctx; window.__m = window.__m || {}; const M = window.__m; " + js + " })()");
        } catch (e) { errors.push(mod + "/" + name + ": " + e.message); }
        await sleep(wait || 1500);
        const s = await page.evaluate(() => { const s = window.__platy.state(); return { fps: s.fps, calls: s.render.calls, tris: s.render.triangles, x: s.player.x, z: s.player.z }; });
        const f = path.join(SHOTS, "m12-" + mod + "-" + name + ".png");
        await page.screenshot({ path: f });
        const line = mod + "/" + name + ": fps " + s.fps + " calls " + s.calls + " tris " + s.tris + " -> " + path.basename(f);
        out.push(line); console.log(line);
      }
    }
  } catch (e) {
    console.log("FAIL " + e.stack);
  }
  console.log("errors:\n" + errors.slice(0, 40).join("\n"));
  clearTimeout(wd);
  await browser.close();
  srv.close();
})();
