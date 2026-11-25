// bonusrender.cjs - BONUS_RENDER's visual check + benchmark (owner: BONUS_RENDER). Takes the browser lock, boots
// ?bonus=1&debug&new&seed=1234, measures real rAF frame times and saves screenshots to tools/shots/bonus-r-*.png:
// day, dusk, night, cave, river, animals, chopping, house levels 0..20 (every 5th + a contact sheet of all 20), phone.
//   node tools/bonusrender.cjs [--quick] [--houses] [--phone]
const http = require("http");
const fs = require("fs");
const path = require("path");
const lock = require("./browserlock.cjs");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const GAME = path.join(__dirname, "..");
const SITE = path.join(GAME, "..");
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };
const ARG = new Set(process.argv.slice(2));
const B = { LEFT: 1, RIGHT: 2, JUMP: 4, ACTION: 8, USE: 16, UP: 32, DOWN: 64 };
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

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await lock.acquire("adventure-cube bonusrender");
  const keep = setInterval(() => lock.touch(), 20000);
  const srv = await serve();
  const base = "http://127.0.0.1:" + srv.address().port + "/adventure-cube/";
  let browser, fails = 0;
  const errors = [];
  const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; return c; };
  const info = (m) => console.log("info " + m);
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
      defaultViewport: { width: 1280, height: 720 },
    });
    const page = (await browser.pages())[0] || await browser.newPage();
    const watch = (pg) => {
      pg.on("pageerror", (e) => errors.push("pageerror: " + (e.stack || e.message || e)));
      pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
    };
    watch(page);
    const shot = (pg, name) => pg.screenshot({ path: path.join(SHOTS, "bonus-r-" + name + ".png") });
    const ev = (fn, ...a) => page.evaluate(fn, ...a);
    const fps = (pg, ms) => pg.evaluate((ms) => new Promise((res) => { const ts = []; let last = performance.now(); const t0 = last; const f = (t) => { ts.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else { ts.sort((a, b) => a - b); res({ fps: ts.length / ((t - t0) / 1000), p50: ts[ts.length >> 1], p95: ts[Math.floor(ts.length * 0.95)], worst: ts[ts.length - 1] }); } }; requestAnimationFrame(f); }), ms);
    const rstats = () => ev(() => window.__cube.bonus.screen && window.__cube.bonus.ctx.renderer.stats && window.__cube.bonus.ctx.renderer.stats());
    const bench = async (label, ms = 2500) => { const f = await fps(page, ms); const st = await rstats(); info(`${label}: ${f.fps.toFixed(1)} fps, p50 ${f.p50.toFixed(1)} ms, p95 ${f.p95.toFixed(1)} ms, worst ${f.worst.toFixed(1)} ms; render ${st ? JSON.stringify(st.timings, (k, v) => (typeof v === "number" ? +v.toFixed(2) : v)) : "?"} q=${st && st.quality} chunks=${st && st.chunks} parts=${st && st.particles}`); return f; };

    await page.evaluate(() => 0);
    await page.goto(base, { waitUntil: "load" });
    await page.evaluate(() => localStorage.removeItem("adventurecube.bonus.v1"));
    await page.goto(base + "?bonus=1&debug&new&seed=1234", { waitUntil: "load" });
    for (let i = 0; i < 150; i++) { const s = await ev(() => window.__cube && window.__cube.bonus && window.__cube.bonus.state()).catch(() => null); if (s && s.active && s.frame > 20) break; await sleep(100); }
    await ev(() => { window.__cube.bonus.setTime(0.2); });
    await sleep(1500);
    await shot(page, "01-day");
    const f1 = await bench("day spawn");
    ok(f1.fps > 50, "day >= 50 fps");

    // icons: every item draws without errors
    const ic = await ev(() => {
      const r = window.__cube.bonus.ctx.renderer, c = document.createElement("canvas"); c.width = 64 * 12; c.height = 64 * 10; const g = c.getContext("2d");
      g.fillStyle = "#2a2018"; g.fillRect(0, 0, c.width, c.height);
      const ids = Object.keys(window.__cube.bonus.ITEMS || {});
      return ids.length;
    });
    const sheet = await ev(async () => {
      const mod = await import("./src/bonus/data/items.js");
      const r = window.__cube.bonus.ctx.renderer, ids = mod.ITEM_LIST.map((i) => i.id), S = 56, cols = 12;
      const c = document.createElement("canvas"); c.width = S * cols; c.height = S * Math.ceil(ids.length / cols); const g = c.getContext("2d");
      g.fillStyle = "#3a2e22"; g.fillRect(0, 0, c.width, c.height);
      let n = 0; ids.forEach((id, i) => { try { r.drawIcon(g, id, (i % cols) * S + 4, Math.floor(i / cols) * S + 4, S - 8); n++; } catch (e) { console.error("icon " + id + " " + e); } });
      const img = new Image(); img.src = c.toDataURL(); img.id = "__iconsheet"; img.style.cssText = "position:fixed;left:0;top:0;z-index:99999;background:#3a2e22";
      document.body.appendChild(img); await new Promise((r2) => (img.onload = r2));
      return { n, total: ids.length };
    });
    ok(sheet.n === sheet.total, `drawIcon for every item (${sheet.n}/${sheet.total})`);
    await shot(page, "icons");
    await ev(() => document.getElementById("__iconsheet").remove());

    // chop a tree: mid-fall shot
    const tree = await ev(() => window.__cube.bonus.nearestTree());
    await ev((tx) => window.__cube.bonus.teleport(tx), tree.x + 1);
    await ev((b) => window.__cube.bonus.setInput(b), B.LEFT); await sleep(80);
    await ev(() => window.__cube.bonus.give("stone_axe", 1));
    await ev(() => { const g = window.__cube.bonus.G; const i = g.inv.slots.findIndex((s) => s && s.id === "stone_axe"); window.__cube.bonus.select(i); });
    await ev((b) => window.__cube.bonus.setInput(b), B.ACTION);
    for (let i = 0; i < 100; i++) { const s = await ev(() => window.__cube.bonus.state()); if (s.stats.treesFelled > 0) break; if (i === 3) await shot(page, "02-chop"); await sleep(100); }
    await ev(() => window.__cube.bonus.setInput(null));
    await sleep(350); await shot(page, "03-falling");
    await sleep(1200);

    // dusk + night
    await ev(() => window.__cube.bonus.teleport(396));
    await ev(() => window.__cube.bonus.setTime(0.655)); await sleep(700); await shot(page, "04-dusk");
    await ev(() => { window.__cube.bonus.give("torch", 5); const g = window.__cube.bonus.G; const i = g.inv.slots.findIndex((s) => s && s.id === "torch"); window.__cube.bonus.select(i); });
    await ev(() => window.__cube.bonus.setTime("night")); await sleep(900); await shot(page, "05-night");
    await bench("night + held torch");

    // animals parade (day)
    await ev(() => window.__cube.bonus.setTime(0.25));
    await ev(() => { const b = window.__cube.bonus; b.select(8); b.teleport(390); });
    await sleep(200);
    await ev(() => { const b = window.__cube.bonus, kinds = ["rabbit", "pheasant", "deer", "goat", "boar", "wolf", "bear"]; kinds.forEach((k, i) => b.spawn(k, 384 + i * 2.2 | 0)); });
    await sleep(500); await shot(page, "06-animals");
    await sleep(900); await shot(page, "06b-animals");
    await bench("animals");

    // river
    const river = await ev(() => { const w = window.__cube.bonus.G.world; return w.river; });
    if (river && river.x0) {
      await ev((x) => window.__cube.bonus.teleport(x), river.x0 - 2);
      await ev((x) => window.__cube.bonus.spawn("fish", x, window.__cube.bonus.G.world.river.waterTop + 2), river.x0 + 6);
      await sleep(900); await shot(page, "07-river");
    }
    // cave: find an air pocket deep below the surface near spawn
    const cave = await ev(() => {
      const w = window.__cube.bonus.G.world;
      for (let d = 0; d < 300; d++) for (const s of [1, -1]) {
        const x = 400 + s * d; if (x < 2 || x >= w.W - 2) continue;
        for (let y = w.surface[x] + 12; y < w.H - 4; y++) {
          const i = y * w.W + x;
          if (w.tiles[i] === 0 && w.tiles[i + w.W] !== 0 && w.tiles[i + w.W] !== 11 && w.tiles[i - w.W] === 0) return { x, y };
        }
      }
      return null;
    });
    if (cave) {
      await ev((c) => { window.__cube.bonus.teleport(c.x, c.y); window.__cube.bonus.setTime(0.3); }, cave);
      await sleep(900); await shot(page, "08-cave");
      await ev(() => { const g = window.__cube.bonus.G; const i = g.inv.slots.findIndex((s) => s && s.id === "torch"); window.__cube.bonus.select(i); });
      await sleep(400); await shot(page, "08b-cave-torch");
      await bench("cave");
      info("cave at " + JSON.stringify(cave));
    }
    // mining: dig into stone with a pickaxe to show cracks
    await ev(() => { const b = window.__cube.bonus; b.teleport(410); b.give("iron_pickaxe", 1); const g = b.G; b.select(g.inv.slots.findIndex((s) => s && s.id === "iron_pickaxe")); });
    await ev((b) => window.__cube.bonus.setInput(b), B.DOWN | B.ACTION); await sleep(1200);
    await ev(() => window.__cube.bonus.setInput(null)); await shot(page, "09-dig");

    // houses
    if (!ARG.has("--quick")) {
      await ev(() => { const b = window.__cube.bonus; b.teleport(b.G.world.houseX + 12); b.setTime(0.3); });
      for (const lv of [0, 1, 5, 10, 15, 20]) {
        await ev((lv) => { window.__cube.bonus.setHouse(lv); window.__cube.bonus.G.house.buildT = 9999; }, lv);
        await sleep(700); await shot(page, "h" + String(lv).padStart(2, "0"));
      }
      await ev(() => window.__cube.bonus.setTime("night")); await sleep(900); await shot(page, "h20-night");
      await bench("house 20 night");
      await ev(() => { window.__cube.bonus.setHouse(10); window.__cube.bonus.G.house.buildT = 9999; }); await sleep(500); await shot(page, "h10-night");
      // build animation mid-way
      await ev(() => { window.__cube.bonus.setTime(0.3); window.__cube.bonus.setHouse(12); }); await sleep(1100); await shot(page, "h12-building");
      // contact sheet of all 21 previews via drawHouse
      await ev(async () => {
        const r = window.__cube.bonus.ctx.renderer, Wc = 300, Hc = 230, cols = 7;
        const c = document.createElement("canvas"); c.width = Wc * cols; c.height = Hc * 3; const g = c.getContext("2d");
        g.fillStyle = "#cfe6ee"; g.fillRect(0, 0, c.width, c.height);
        for (let lv = 0; lv <= 20; lv++) { const x = (lv % cols) * Wc, y = Math.floor(lv / cols) * Hc; r.drawHouse(g, lv, x + 6, y + 6, Wc - 12, Hc - 24); g.fillStyle = "#123"; g.font = "bold 14px sans-serif"; g.fillText("Lv " + lv, x + 10, y + Hc - 6); }
        const img = new Image(); img.src = c.toDataURL(); img.id = "__hs"; img.style.cssText = "position:fixed;left:0;top:0;z-index:99999;width:1280px";
        document.body.appendChild(img); await new Promise((r2) => (img.onload = r2));
      });
      await shot(page, "houses-all");
      await ev(() => document.getElementById("__hs").remove());
    }
    // hills + pinewood scenery
    for (const [name, x] of [["10-pinewood", 200], ["11-hills", 60], ["12-forest", 540]]) {
      await ev((x) => { window.__cube.bonus.teleport(x); window.__cube.bonus.setTime(0.3); }, x); await sleep(900); await shot(page, name);
    }
    await bench("pinewood/hills");

    if (ARG.has("--phone") || !ARG.has("--quick")) {
      const ph = await browser.newPage(); watch(ph);
      await ph.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" });
      await ph.goto(base + "?bonus=1&debug&new&seed=77", { waitUntil: "load" });
      for (let i = 0; i < 150; i++) { const s = await ph.evaluate(() => window.__cube && window.__cube.bonus && window.__cube.bonus.state()).catch(() => null); if (s && s.active && s.frame > 20) break; await sleep(100); }
      await sleep(1200); await ph.screenshot({ path: path.join(SHOTS, "bonus-r-phone.png") });
      const pf = await fps(ph, 2000); info(`phone: ${pf.fps.toFixed(1)} fps p95 ${pf.p95.toFixed(1)} ms`);
      await ph.close();
    }
    ok(errors.length === 0, "no page errors" + (errors.length ? ":\n  " + errors.slice(0, 10).join("\n  ") : ""));
  } catch (e) {
    console.log("FAIL threw " + (e.stack || e)); fails++;
    if (errors.length) console.log("page errors:\n  " + errors.slice(0, 10).join("\n  "));
  } finally {
    clearInterval(keep);
    if (browser) await browser.close();
    srv.close();
    lock.release();
  }
  console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
  process.exit(fails ? 1 : 0);
})();
