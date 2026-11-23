// Realism survey: screenshot each level a few seconds in (and after skipTo beats if given). node tools/realshots.cjs [levels...]
const http = require("http"), fs = require("fs"), path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));
const ROOT = path.join(__dirname, ".."), SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BEATS = { 11: ["king"], 12: ["boss1", "boss2"], 13: ["wolves", "chase"] };
const want = process.argv.slice(2).map(Number); const LV = want.length ? want : [1,2,3,4,5,6,7,8,9,10,11,12,13];
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = http.createServer((req, res) => { let p = req.url.split("?")[0]; if (p.endsWith("/")) p += "index.html";
    fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream" }); res.end(b); }); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--mute-audio"], defaultViewport: { width: 1280, height: 720 } });
  const t = setTimeout(async () => { try { await browser.close(); } catch (_) {} srv.close(); process.exit(2); }, 540000); t.unref();
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.log("ERR", String(e)));
    await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html");
    await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
    await page.evaluate(() => window.__platy.unlockAll());
    for (const n of LV) {
      await page.evaluate((n) => window.__platy.startLevel(n), n);
      await sleep(9000);
      const r = await page.evaluate(() => { const s = window.__platy.state(); return s.fps + " fps " + JSON.stringify(s.render) + " step=" + s.step; });
      console.log("L" + n, r);
      await page.screenshot({ path: path.join(SHOTS, "r-" + n + "-a.png") });
      for (const b of BEATS[n] || []) {
        await page.evaluate((b) => window.__platy.level().skipTo(b), b); await sleep(6000);
        console.log("L" + n + " " + b, await page.evaluate(() => JSON.stringify(window.__platy.state().render)));
        await page.screenshot({ path: path.join(SHOTS, "r-" + n + "-" + b + ".png") });
      }
      await page.evaluate(() => window.__platy.quit()); await sleep(2500);
    }
  } finally { await browser.close(); srv.close(); }
})();
