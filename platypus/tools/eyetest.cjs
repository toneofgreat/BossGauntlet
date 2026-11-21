// Eye-blink look test: node tools/eyetest.cjs  -> tools/shots/eye-*.png
const http = require("http"), fs = require("fs"), path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));
const ROOT = path.join(__dirname, ".."), SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
      fs.readFile(path.join(ROOT, p), (err, buf) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-store" }); res.end(buf); });
    });
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,720", "--mute-audio"], defaultViewport: { width: 1280, height: 720 } });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log("console: " + m.text()); });
  try {
    await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html", { waitUntil: "load" });
    await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
    await page.evaluate(() => { window.__platy.unlockAll(); return window.__platy.startLevel(3); });
    await sleep(6500);
    const which = process.argv[2] || "day";
    for (const o of [0, 0.12, 0.3, 0.5, 0.7, 0.85, 1]) {
      await page.evaluate((o, which) => { const c = window.__platy.cinema; c.eye.shut(which); c.tint(which === "day" ? null : which, 0.8); c.eye.set(o, (1 - o) * 10, which === "day" ? 1 + (1 - o) : 0.5 + o * 0.5); }, o, which);
      await sleep(350);
      await page.screenshot({ path: path.join(SHOTS, "eye-" + which + "-" + String(Math.round(o * 100)).padStart(3, "0") + ".png") });
      console.log(o, await page.evaluate(() => [document.querySelector(".cine-eye .up").style.transform, getComputedStyle(document.querySelector(".cine-eye .up")).transformOrigin, document.querySelector(".cine-eye .up").getBoundingClientRect().toJSON()].map((x) => JSON.stringify(x)).join(" ")));
    }
  } catch (e) { console.log("FAILED " + e.stack); }
  await browser.close(); srv.close();
})();
