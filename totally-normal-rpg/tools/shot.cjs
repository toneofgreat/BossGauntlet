// shot.cjs - ENGINE look-dev screenshots of the real game (one browser, inside the shared lock).
//   node totally-normal-rpg/tools/shot.cjs [scenario.cjs] [--w 1280 --h 720] [--q 2]
// The scenario module exports async (page, shot, ev) => {}; without one a default lobby/river/castle tour is shot.
// Shots go to tools/shots/eng-<name>.png. Prints console errors and __tnrpg.errors.
const path = require("path");
const lock = require("./browserlock.cjs");
const puppeteer = require("../../node_modules/puppeteer");
const { start } = require("./serve.cjs");

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const scenarioPath = args[0] && !args[0].startsWith("--") ? path.resolve(args[0]) : null;
const W = +opt("w", 1280), H = +opt("h", 720), Q = opt("q", "2");
const OUT = path.join(__dirname, "shots");

(async () => {
  const srv = await start();
  await lock.acquire("tnrpg-engine-shot");
  let browser;
  const logs = [];
  let T0 = Date.now();
  try {
    browser = await puppeteer.launch({ headless: "new", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required", "--window-size=" + W + "," + H] });
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    page.on("console", (m) => { const t = m.type(); if (t === "error" || t === "warning" || t === "warn") logs.push(((Date.now() - T0) / 1000).toFixed(1) + "s " + t + ": " + m.text()); });
    page.on("pageerror", (e) => logs.push("pageerror: " + e.message));
    await page.evaluateOnNewDocument(() => { window.__PLATYFY_ONLINE_TEST = { prefix: "pfo-test-tnrpg:", relay: "https://127.0.0.1:9" }; });
    const t0 = Date.now(); T0 = t0;
    await page.goto(srv.url + "/totally-normal-rpg/", { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => window.__tnrpg && window.__tnrpg.ready, { timeout: 150000, polling: 250 });
    console.log("ready in " + ((Date.now() - t0) / 1000).toFixed(1) + " s");
    lock.touch();
    const ev = (fn, ...a) => page.evaluate(fn, ...a);
    await ev((q) => { const g = window.__tnrpg; if (g.quality) g.quality(q === "auto" ? "auto" : +q); }, Q);
    const shot = async (name, waitMs = 1500) => {
      await new Promise((r) => setTimeout(r, waitMs));
      const f = path.join(OUT, "eng-" + name + ".png");
      await page.screenshot({ path: f });
      const fs = await ev(() => { const g = window.__tnrpg, e = g.ctx.engine; const p = e.player.position, c = e.camera.position;
        const r = (v) => Math.round(v * 10) / 10;
        return Object.assign(g.frameStats ? g.frameStats() : {}, { p: [r(p.x), r(p.y), r(p.z)], yaw: r(e.player.yaw), cam: [r(c.x), r(c.y), r(c.z)], cy: r(e.camera3p.yaw), q: e.quality.level, zone: g.ctx.state.world.zone }); });
      console.log("shot " + name + " " + JSON.stringify(fs));
      lock.touch();
    };
    if (scenarioPath) await require(scenarioPath)(page, shot, ev);
    else {
      await shot("title", 2500);
      await ev(() => window.__tnrpg.play ? window.__tnrpg.play("Tester") : null);
      await shot("lobby", 3000);
    }
    const errs = await ev(() => (window.__tnrpg.errors || []).slice(0, 40));
    if (errs.length) console.log("__tnrpg.errors:\n  " + errs.join("\n  "));
  } catch (e) {
    console.log("ERROR " + (e && e.stack || e));
  } finally {
    if (browser) await browser.close();
    lock.release();
    await srv.close();
  }
  const seen = new Set(); const uniq = logs.filter((l) => { const k = l.replace(/^[d.]+s /, ""); if (seen.has(k)) return false; seen.add(k); return true; });
  if (uniq.length) console.log("console (" + uniq.length + "):\n  " + uniq.slice(0, 40).join("\n  "));
})();
