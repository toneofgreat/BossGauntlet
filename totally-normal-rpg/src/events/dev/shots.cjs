// Screenshots of the EVENTS dev viewer scenes (one headless browser, inside the machine-wide lock).
//   node totally-normal-rpg/src/events/dev/shots.cjs [scene ...]
// Writes PNGs to totally-normal-rpg/src/events/dev/shots/. Exit 1 on page errors.
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "../../../..");
const lock = require(path.join(ROOT, "totally-normal-rpg/tools/browserlock.cjs"));
const puppeteer = require(path.join(ROOT, "node_modules/puppeteer"));
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".png": "image/png" };
const scenes = process.argv.slice(2).length ? process.argv.slice(2) : ["creature", "crawl", "armored", "giant", "sword", "girl", "collapse", "throne", "fx"];
const OUT = path.join(__dirname, "shots"); fs.mkdirSync(OUT, { recursive: true });

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split("?")[0]); const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
      fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); r.end(d); });
    });
    srv.listen(0, "127.0.0.1", () => res({ url: "http://127.0.0.1:" + srv.address().port, close: () => srv.close() }));
  });
}
(async () => {
  const s = await serve(); let browser; let bad = 0;
  await lock.acquire("tnrpg-events-shots");
  try {
    browser = await puppeteer.launch({ headless: "new", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
    const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
    page.on("pageerror", (e) => { bad++; console.log("PAGEERROR", e.message); });
    page.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (!/404|Failed to load resource|humanoid/.test(t)) { bad++; console.log("CONSOLE", t); } } });
    for (const sc of scenes) {
      await page.goto(`${s.url}/totally-normal-rpg/src/events/dev/view.html?s=${sc}`, { waitUntil: "load" });
      await page.waitForFunction("window.__viewReady === true", { timeout: 30000 });
      const wait = { collapse: 9000, throne: 11000, giant: 7000, sword: 6500, girl: 5000 }[sc] || 3500;
      await new Promise((r) => setTimeout(r, wait));
      await page.screenshot({ path: path.join(OUT, sc + ".png") });
      const st = await page.evaluate(() => ({ fps: window.__fps, calls: window.__calls }));
      console.log(sc, JSON.stringify(st)); lock.touch();
    }
  } finally { if (browser) await browser.close(); lock.release(); s.close(); }
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); lock.release(); process.exit(1); });
