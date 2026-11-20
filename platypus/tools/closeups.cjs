// Close-up screenshots of each character and effect (visual check only).
const http = require("http"), fs = require("fs"), path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));
const ROOT = path.join(__dirname, ".."), SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = http.createServer((req, res) => { let p = req.url.split("?")[0]; if (p.endsWith("/")) p += "index.html";
    fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream" }); res.end(b); }); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--mute-audio"], defaultViewport: { width: 1280, height: 720 } });
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.stack || e)));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.text()); });
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, "c-" + n + ".png") });
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  try {
    await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html");
    await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
    await page.click("#levelBtn");
    await page.waitForFunction(() => window.__platy.state().step === "greet", { timeout: 20000 });
    await ev(() => { document.getElementById("white").style.display = "none"; });
    await sleep(500);
    // platypus: side, front, 3/4 idle
    await ev(() => window.__platy.look(Math.PI / 2, 0.22, 1.5)); await sleep(700); await shot("platy-side");
    await ev(() => window.__platy.look(Math.PI + 0.5, 0.3, 1.4)); await sleep(700); await shot("platy-front");
    await ev(() => window.__platy.look(0.7, 0.75, 1.5)); await sleep(700); await shot("platy-top");
    // walk (camera fixed to the side)
    await ev(() => window.__platy.skipTo("move"));
    await ev(() => window.__platy.look(Math.PI / 2, 0.2, 1.7));
    await page.keyboard.down("KeyA"); await sleep(700); await shot("platy-walk1"); await sleep(130); await shot("platy-walk2"); await page.keyboard.up("KeyA");
    await sleep(500);
    await page.keyboard.press("Space"); await sleep(120); await shot("platy-jump1"); await sleep(250); await shot("platy-jump2"); await sleep(380); await shot("platy-land");
    await sleep(600);
    await page.keyboard.press("KeyJ"); await sleep(200); await shot("platy-sting"); await sleep(800);
    // wizard close
    await ev(() => { const p = window.__platy, w = p.state().wizard; p.tp(w.x + 0.2, w.z - 2.2, 0); p.look(0.25, 0.1, 1.2); });
    await sleep(1200); await shot("wizard");
    // dummy close
    await ev(() => window.__platy.skipTo("sting")); await sleep(900);
    await ev(() => { const p = window.__platy, d = p.state().dummies[0]; p.tp(d.x - 0.9, d.z - 1.1, 0.6); p.look(0.6, 0.12, 1.4); });
    await sleep(900); await shot("dummy");
    // zap sequence close
    await ev(() => window.__platy.skipTo("zap")); await sleep(2600);
    await ev(() => { const p = window.__platy, w = p.state().water; p.tp(w.x - w.length / 2 + 1.5, w.z, Math.PI / 2); p.look(Math.PI / 2 + 0.9, 0.3, 2.4); });
    await sleep(900); await shot("zap0");
    await page.keyboard.press("KeyK");
    await sleep(380); await shot("zap1"); await sleep(60); await shot("zap2"); await sleep(60); await shot("zap3"); await sleep(120); await shot("zap4");
    await sleep(1500);
    // human close
    await ev(() => window.__platy.skipTo("fight")); await sleep(1500);
    await ev(() => { const p = window.__platy, h = p.state().human; p.tp(h.x - Math.sin(h.yaw) * -2.6, h.z - Math.cos(h.yaw) * -2.6, h.yaw + Math.PI); p.look(h.yaw + Math.PI, 0.02, 2.0); });
    await sleep(500); await shot("human1"); await sleep(900); await shot("human2");
    await page.keyboard.press("KeyJ"); await sleep(500); await shot("human-stung");
    await ev(() => window.__platy.look(0.4, 0.5, 9)); await sleep(1200); await shot("wide");
  } catch (e) { console.log("FAIL " + (e.stack || e)); await shot("fail"); }
  await browser.close(); srv.close();
  console.log("errors", errs.length, errs.slice(0, 10).join("\n"));
})();
