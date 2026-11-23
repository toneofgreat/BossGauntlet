// Scream regression: in level 11's lesson (and the test), the scream must work after every kind of release:
// the R key, the on-screen button with the mouse, a touch on the button, a quick tap, a drag off the button.
const http = require("http"), fs = require("fs"), path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));
const ROOT = path.join(__dirname, ".."), SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LV = +((process.argv.find((a) => a.startsWith("--level=")) || "--level=11").split("=")[1]);
const BEAT = (process.argv.find((a) => a.startsWith("--beat=")) || "--beat=lesson").split("=")[1];
(async () => {
  const srv = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html"; const f = path.join(ROOT, p); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); res.end(b); }); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required", "--mute-audio"], defaultViewport: { width: 1280, height: 720 } });
  setTimeout(async () => { console.log("WATCHDOG"); try { await browser.close(); } catch (_) {} srv.close(); process.exit(2); }, 300000).unref();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  let fails = 0;
  const st = () => page.evaluate(() => { const d = window.__platy, s = d.state(); return { step: s.step, lesson: s.lesson, screams: s.screams, sc: s.svc.abilities.scream, en: d.player.enabled, lock: d.player.lock, cine: s.cinema && s.cinema.playing, speaking: d.ui.speaking(), btn: (() => { const b = document.getElementById("btnScream"); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, vis: getComputedStyle(b).display !== "none" && r.width > 0, pe: getComputedStyle(b).pointerEvents }; })() }; });
  const ptr = (type, x, y, kind, id) => page.evaluate((type, x, y, kind, id) => { const el = document.elementFromPoint(x, y) || document.body; const tgt = type === "pointerdown" ? el : (window.__cap || el); if (type === "pointerdown") window.__cap = el; el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: kind, clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1, isPrimary: true })); if (type === "pointerup") { el.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false, pointerId: id, pointerType: kind, clientX: x, clientY: y })); } return el.id || el.className; }, type, x, y, kind, id);
  async function waitReady() { for (let i = 0; i < 100; i++) { const s = await st(); if (s.sc && !s.sc.charging && s.sc.cd <= 0 && s.en && !s.cine && s.lock <= 0) return s; await sleep(150); } return st(); }
  async function trial(label, how, ms) {
    const s0 = await waitReady();
    if (!s0.sc) { console.log("  " + label + ": scream not enabled (step " + s0.step + ")"); return; }
    const n0 = s0.screams, f0 = s0.sc.fired + s0.sc.fizzled, need = s0.sc.min * 1200;
    if (how === "key") { await page.keyboard.down("KeyR"); await sleep(ms); await page.keyboard.up("KeyR"); }
    else if (how === "mouse") { await page.mouse.move(s0.btn.x, s0.btn.y); await page.mouse.down(); await sleep(ms); await page.mouse.up(); }
    else if (how === "mouse-drag-off") { await page.mouse.move(s0.btn.x, s0.btn.y); await page.mouse.down(); await sleep(ms / 2); await page.mouse.move(s0.btn.x - 300, s0.btn.y - 200, { steps: 5 }); await sleep(ms / 2); await page.mouse.up(); }
    else if (how === "touch") { await ptr("pointerdown", s0.btn.x, s0.btn.y, "touch", 7); await sleep(ms); await ptr("pointerup", s0.btn.x, s0.btn.y, "touch", 7); }
    await sleep(200);
    const s1 = await st();
    // every release must end the breath: a scream if it was held past the mark, else a fizzle
    const ended = s1.sc && (s1.sc.fired + s1.sc.fizzled) > f0, fired = s1.screams > n0;
    const ok = !s1.sc || (!s1.sc.charging && ended && (ms < need + 150 || fired));
    if (!ok) fails++;
    console.log("  " + label + " (" + how + " " + ms + " ms): " + (ok ? "ok" : "FAIL") + " screams " + n0 + "->" + s1.screams + " charging " + (s1.sc && s1.sc.charging) + " cd " + (s1.sc && s1.sc.cd.toFixed(2)) + " step " + s1.step + "/" + s1.lesson + " en " + s1.en + " btn " + JSON.stringify(s1.btn));
    await sleep(1600);
  }
  try {
    await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html");
    await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
    await page.evaluate((n) => { window.__platy.resetProgress(); window.__platy.unlockAll(); window.__platy.startLevel(n); }, LV);
    await page.waitForFunction((n) => { const s = window.__platy.state(); return s.mode === "level" && s.levelN === n; }, { timeout: 40000 }, LV);
    await sleep(1500);
    console.log("skipTo " + BEAT + ": " + await page.evaluate((b) => window.__platy.skipTo(b), BEAT));
    await sleep(2500);
    const seq = (process.argv.includes("--short")) ? [["key", 1400], ["touch", 1400], ["mouse", 100]] : [["key", 500], ["key", 80], ["mouse", 600], ["mouse", 60], ["touch", 600], ["touch", 50], ["mouse-drag-off", 700], ["touch", 1400], ["key", 1400], ["mouse", 1400]];
    for (let round = 0; round < 2; round++) for (const [h, ms] of seq) await trial("r" + round, h, ms);
    await page.screenshot({ path: path.join(SHOTS, "scream-end.png") });
    const s = await st(); console.log("end state " + JSON.stringify(s));
  } catch (e) { console.log("ERROR " + (e.stack || e)); fails++; }
  console.log("errors: " + (errors.length ? errors.join("\n") : "none"));
  console.log(fails ? "SCREAM TEST FAILED (" + fails + ")" : "SCREAM TEST PASSED");
  await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
