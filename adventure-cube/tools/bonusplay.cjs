// bonusplay.cjs - browser smoke test for the BONUS level (CORE owns the base; BONUS.md 12). Takes the browser
// lock (tools/browserlock.cjs), serves the BossGauntlet folder like GitHub Pages, drives window.__cube.bonus,
// saves screenshots to tools/shots/bonus-*.png.
//   node tools/bonusplay.cjs            desktop 1280x720 + phone 390x844
//   node tools/bonusplay.cjs --desktop  desktop only
// Other agents may add checks in their own section (search "SECTION") and keep the existing ones passing.
const http = require("http");
const fs = require("fs");
const path = require("path");
const lock = require("./browserlock.cjs");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const GAME = path.join(__dirname, "..");
const SITE = path.join(GAME, "..");
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };
const DESKTOP_ONLY = process.argv.includes("--desktop");
const B = { LEFT: 1, RIGHT: 2, JUMP: 4, ACTION: 8, USE: 16, UP: 32, DOWN: 64 };

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await lock.acquire("adventure-cube bonusplay");
  const keep = setInterval(() => lock.touch(), 20000);
  const srv = await serve();
  const base = "http://127.0.0.1:" + srv.address().port + "/adventure-cube/";
  let browser, fails = 0;
  const errors = [];
  const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; return c; };
  const info = (m) => console.log("info " + m);
  try {
    const launch = () => puppeteer.launch({
      headless: true,
      args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
      defaultViewport: { width: 1280, height: 720 },
    });
    browser = await launch();
    // INTEGRATE: every section gets a FRESH browser (still one at a time, same lock). Reusing one browser for all the
    // sections made later tabs crawl (about 1 frame per second, GPU-bound) after the earlier sections ran.
    const fresh = async () => { try { await browser.close(); } catch (e) { /* gone */ } browser = await launch(); };
    const page = (await browser.pages())[0] || await browser.newPage();
    const watch = (pg) => {
      pg.on("pageerror", (e) => errors.push("pageerror: " + (e.stack || e.message || e)));
      pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
      pg.on("response", (r) => { if (r.status() >= 400 && !/favicon|relay\.platyfy/.test(r.url())) errors.push("http " + r.status() + ": " + r.url()); });
      pg.on("dialog", (d) => d.accept());
    };
    watch(page);
    const shot = async (pg, name) => { await pg.screenshot({ path: path.join(SHOTS, "bonus-" + name + ".png") }); };
    const bs = (pg) => pg.evaluate(() => window.__cube && window.__cube.bonus && window.__cube.bonus.state());
    const waitFor = async (pg, pred, ms, label) => {
      const t0 = Date.now();
      let nudge = Date.now() + 2500;
      for (;;) {
        const s = await bs(pg).catch(() => null); if (s && pred(s)) return s;
        // headless Chrome sometimes stops producing frames for a freshly emulated tab (rAF ~5/s with a frozen
        // timestamp, so the game cannot step): bringing the tab to the front again restarts its frames
        if (Date.now() > nudge) { nudge = Date.now() + 2500; await pg.bringToFront().catch(() => {}); }
        if (Date.now() - t0 > ms) {
          // INTEGRATE: say WHY (frames not coming vs. the game not stepping) before giving up
          const d = await pg.evaluate(() => new Promise((res) => { let n = 0; const t1 = performance.now(); const f = () => { n++; if (performance.now() - t1 < 1000) requestAnimationFrame(f); else res({ raf1s: n, vis: document.visibilityState, focus: document.hasFocus(), screen: window.__cube.state().screen }); }; requestAnimationFrame(f); setTimeout(() => res({ raf1s: n, stalled: true, vis: document.visibilityState }), 3000); })).catch((e) => ({ err: e.message }));
          throw new Error("timeout: " + label + " " + JSON.stringify(s) + " diag " + JSON.stringify(d));
        }
        await sleep(100);
      }
    };
    const fps = (pg, ms) => pg.evaluate((ms) => new Promise((res) => { let n = 0, worst = 0, last = performance.now(); const t0 = last; const f = (t) => { n++; worst = Math.max(worst, t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else res({ fps: n / ((t - t0) / 1000), worst }); }; requestAnimationFrame(f); }), ms);

    // ---------------------------------------------------------------- the main game still boots
    await page.goto(base, { waitUntil: "load" });
    await sleep(1500);
    const st0 = await page.evaluate(() => window.__cube && window.__cube.state());
    ok(st0 && st0.screen === "title", "main game boots to the title (" + (st0 && st0.screen) + ")");
    ok(!(await page.evaluate(() => !!(window.__cube.bonus))), "bonus code is not loaded until needed");

    // ---------------------------------------------------------------- SECTION core: boot, move, chop
    await page.evaluate(() => localStorage.removeItem("adventurecube.bonus.v1"));
    await page.goto(base + "?bonus=1&debug&new&seed=1234", { waitUntil: "load" });
    let s = await waitFor(page, (s) => s.active && s.frame > 20, 15000, "bonus boot");
    ok(s.seed === 1234, "seeded world 1234");
    ok(s.grounded && !s.dead, "cube standing at spawn");
    await shot(page, "01-spawn");
    const f1 = await fps(page, 3000);
    info(`fps (placeholder renderer) ${f1.fps.toFixed(1)}, worst frame ${f1.worst.toFixed(1)} ms`);
    ok(f1.fps > 45, "runs near 60 fps");
    const x0 = s.x;
    await page.evaluate((b) => window.__cube.bonus.setInput(b), B.RIGHT);
    await sleep(800);
    await page.evaluate(() => window.__cube.bonus.setInput(null));
    s = await bs(page);
    ok(s.x > x0 + 60, `walks right in real time (${(s.x - x0).toFixed(0)} px)`);
    // keyboard: real key presses through app.input
    await page.keyboard.down("KeyA"); await sleep(400); await page.keyboard.up("KeyA");
    const s2 = await bs(page);
    ok(s2.x < s.x - 20, "keyboard A walks left");
    await page.keyboard.down("Space"); await sleep(150);
    const sj = await bs(page); await page.keyboard.up("Space");
    ok(!sj.grounded || sj.vy < 0, "space jumps");
    await sleep(800);
    // chop the starter tree
    const tree = await page.evaluate(() => window.__cube.bonus.nearestTree());
    ok(!!tree, "a tree near spawn: " + (tree && tree.kind + "@" + tree.x));
    await page.evaluate((tx) => window.__cube.bonus.teleport(tx), tree.x + 1);
    await page.evaluate((b) => window.__cube.bonus.setInput(b), B.LEFT); await sleep(60);
    await page.evaluate((b) => window.__cube.bonus.setInput(b), B.ACTION);
    s = await waitFor(page, (s) => (s.inv.wood || 0) > 0, 15000, "chop -> wood");
    await page.evaluate(() => window.__cube.bonus.setInput(null));
    ok(s.inv.wood > 0, `chopped a tree: ${s.inv.wood} wood in the inventory (felled ${s.stats.treesFelled})`);
    await sleep(300);
    await shot(page, "02-chopped");
    // inventory / crafting panel opens with E
    await page.keyboard.press("KeyE"); await sleep(250);
    s = await bs(page);
    ok(s.panel === "craft", "E opens the crafting panel");
    ok(await page.$(".bk-panel") !== null, "crafting panel DOM present");
    await shot(page, "03-craft");
    await page.keyboard.press("Escape"); await sleep(150);
    ok((await bs(page)).panel === null, "Esc closes it");
    // night + house look
    await page.evaluate(() => { window.__cube.bonus.setHouse(5); window.__cube.bonus.teleport(window.__cube.bonus.G.world.houseX + 6); });
    await sleep(400); await shot(page, "04-house5");
    await page.evaluate(() => window.__cube.bonus.setTime("night")); await sleep(300);
    ok((await bs(page)).phase === "night", "night");
    await shot(page, "05-night");
    // save + reload restores
    const before = await bs(page);
    await page.evaluate(() => window.__cube.bonus.save());
    await page.goto(base + "?bonus=1&debug", { waitUntil: "load" });
    s = await waitFor(page, (s) => s.active && s.frame > 0, 15000, "reload");
    ok(s.seed === 1234 && (s.inv.wood || 0) === (before.inv.wood || 0) && s.house === 5, `save restored (wood ${s.inv.wood}, house ${s.house})`);
    // leaving goes back to the menu and the main game still plays
    await page.evaluate(() => window.__cube.show("title")); await sleep(400);
    ok((await page.evaluate(() => window.__cube.state().screen)) === "title", "quit to title");
    await page.evaluate(() => window.__cube.loadLevel("test"));
    let ps = null; for (let i = 0; i < 80; i++) { await sleep(100); ps = await page.evaluate(() => window.__cube.state()); if (ps.screen === "play" && ps.frame > 10) break; }
    ok(ps.screen === "play" && ps.frame > 10, "main-game play still works after the bonus " + JSON.stringify(ps));
    // INTEGRATE: park the first page so a running game in a background tab cannot starve the next pages' frames
    await page.goto("about:blank");

    // ---------------------------------------------------------------- SECTION phone
    await fresh();
    if (!DESKTOP_ONLY) {
      const ph = await browser.newPage();
      watch(ph); await ph.bringToFront();
      await ph.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" });
      await ph.goto(base + "?bonus=1&debug&new&seed=77", { waitUntil: "load" });
      s = await waitFor(ph, (s) => s.active && s.frame > 20, 15000, "phone boot");
      ok(await ph.$(".touch-controls.on") !== null, "phone: move/jump buttons shown");
      const hit = await ph.$('.bk-touch button[data-k="act"]');
      ok(!!hit, "phone: HIT button shown");
      const tr = await ph.evaluate(() => window.__cube.bonus.nearestTree());
      await ph.evaluate((tx) => window.__cube.bonus.teleport(tx), tr.x + 1);
      await ph.evaluate((b) => { window.__cube.bonus.step(3, b); window.__cube.bonus.step(1, 0); }, B.LEFT); // face the tree (synchronous: a 60 ms real-time press can miss every frame)
      if (hit) {
        const bb = await hit.boundingBox();
        const t0 = Date.now(); let wood = 0;
        while (Date.now() - t0 < 12000 && !wood) {
          await ph.touchscreen.touchStart(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(500); await ph.touchscreen.touchEnd();
          wood = ((await bs(ph)).inv.wood) || 0;
        }
        ok(wood > 0, "phone: chopped with the HIT button (" + wood + " wood)");
      }
      await shot(ph, "06-phone");
      const pf = await fps(ph, 2000); info(`phone fps ${pf.fps.toFixed(1)}`);
      await ph.close();
    }
    // ---------------------------------------------------------------- SECTION craft (CRAFT owns this block)
    await fresh();
    {
      let cp = await browser.newPage();
      watch(cp); await cp.bringToFront();
      await cp.goto(base + "?bonus=1&debug&new&seed=2468", { waitUntil: "load" });
      await waitFor(cp, (s) => s.active && s.frame > 20, 15000, "craft boot");
      const box = (pg, sel) => pg.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }, sel);
      ok((await cp.$$(".bk-hot .bk-slot")).length === 9, "craft: 9 hotbar slots");
      const hb = await box(cp, ".bk-hot"), hud = await box(cp, ".bk-hud");
      ok(hb && Math.abs(hb.x + hb.w / 2 - 640) < 2 && hb.y + hb.h > 690, "craft: hotbar bottom-center on desktop");
      ok(hud && hud.x >= 16 && hud.w <= 180, "craft: HUD top-left <= 180 px");
      ok(await cp.$(".bk-hint:not(.off)") !== null, "craft: tutorial hint shown");
      await cp.evaluate(() => { const b = window.__cube.bonus; b.clearInv(); b.give("wood", 20); b.give("raw_venison", 2); b.give("stone", 5); });
      await cp.keyboard.press("KeyE"); await sleep(250);
      ok((await bs(cp)).panel === "craft", "craft: panel open");
      await cp.click('.bk-rec[data-r="workbench"] button[data-c="1"]'); await sleep(120);
      ok((await bs(cp)).inv.workbench === 1, "craft: clicked Craft -> a workbench");
      await cp.keyboard.press("ArrowUp"); await cp.keyboard.press("ArrowUp"); await cp.keyboard.press("Enter"); await sleep(120);
      ok(((await bs(cp)).inv.stick || 0) >= 4, "craft: keyboard Up + Enter crafts sticks");
      await cp.click('.bk-tab[data-tab="campfire"]'); await sleep(120);
      ok(await cp.$('.bk-grp[data-st="campfire"].locked:not([hidden])') !== null, "craft: campfire tab shows the locked station + hint");
      // move an item: click backpack slot -> click hotbar slot
      const from = await cp.evaluate(() => window.__cube.bonus.G.inv.slots.findIndex((s) => s && s.id === "raw_venison"));
      await cp.click(`.bk-craft .bk-slot[data-g="inv"][data-i="${from}"]`); await cp.click('.bk-craft .bk-slot[data-g="inv"][data-i="8"]'); await sleep(120);
      ok(await cp.evaluate(() => { const s = window.__cube.bonus.G.inv.slots[8]; return !!s && s.id === "raw_venison"; }), "craft: click-click moves an item to the hotbar");
      await shot(cp, "craft-panel");
      await cp.keyboard.press("Escape"); await sleep(150);
      // place the workbench with USE, then a campfire, then USE cooks raw meat
      await cp.evaluate(() => { const b = window.__cube.bonus, G = b.G; b.give("campfire", 1); const i = G.inv.slots.findIndex((s) => s && s.id === "campfire"); const t = G.inv.slots[i]; G.inv.slots[i] = G.inv.slots[0]; G.inv.slots[0] = t; b.select(0); });
      await cp.evaluate((B) => { const b = window.__cube.bonus, G = b.G; b.setInput(0); // find a spot where the campfire can go
        for (let x = G.world.spawn.x - 24; x > G.world.spawn.x - 90; x--) { b.teleport(x); b.step(20, 0); b.step(2, B.RIGHT); b.step(4, 0); if (G.target && G.target.place && G.target.kind === "air") break; }
        b.step(1, B.USE); b.step(1, 0); b.setInput(null); }, B);
      ok(await cp.evaluate(() => window.__cube.bonus.G.world.objects.some((o) => o.kind === "campfire")), "craft: placed a campfire with USE");
      await cp.evaluate((B) => { const b = window.__cube.bonus; b.setInput(0); b.G.player.facing = -1; b.select(8); b.step(1, B.USE); b.step(1, 0); b.setInput(null); }, B);
      ok(((await bs(cp)).inv.venison_steak || 0) === 1, "craft: USE with raw meat next to the campfire cooks it");
      // house chest panel
      await cp.evaluate(() => { const b = window.__cube.bonus; b.setHouse(4); b.teleport(b.G.world.houseX + 12); b.openPanel("chest", { house: true }); });
      await sleep(250);
      ok(await cp.$(".bk-chest .bk-slot[data-g=chest]") !== null, "craft: house chest panel");
      await cp.click('.bk-chest button[data-a="store"]'); await sleep(100);
      await cp.evaluate(() => window.__cube.bonus.closePanel());
      if (!DESKTOP_ONLY) {
        // a fresh browser + tab for the phone pass (re-emulating a busy tab could stall its frames)
        await cp.close(); await fresh(); cp = await browser.newPage(); watch(cp); await cp.bringToFront();
        await cp.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" });
        await cp.goto(base + "?bonus=1&debug&new&seed=2468", { waitUntil: "load" });
        await cp.bringToFront();
        await waitFor(cp, (s) => s.active && s.frame > 20, 15000, "craft phone boot");
        const ph = await box(cp, ".bk-hot"), hit = await box(cp, ".bk-tb.hit"), use = await box(cp, '.bk-tb[data-k="use"]'), bag = await box(cp, '.bk-tb[data-k="bag"]');
        ok(ph && ph.w <= 358 && ph.x >= 16 && ph.y >= 50 && ph.y < 70, "craft phone: hotbar at the top fits 358 px (" + (ph && ph.w) + ")");
        ok(hit && Math.round(hit.w) === 72 && Math.abs(390 - (hit.x + hit.w) - 124) < 2, "craft phone: HIT 72 px at right 124");
        ok(use && bag && Math.round(use.w) === 56 && Math.abs(390 - (use.x + use.w) - 16) < 2 && bag.y < use.y, "craft phone: BAG over USE at right 16");
        ok(await cp.evaluate(() => document.documentElement.scrollWidth <= 390), "craft phone: no horizontal scroll");
        await cp.touchscreen.tap(bag.x + bag.w / 2, bag.y + bag.h / 2); await sleep(300);
        ok((await bs(cp)).panel === "craft", "craft phone: BAG opens the crafting panel");
        const pb = await box(cp, ".bk-panel");
        ok(pb && pb.x >= 15 && pb.x + pb.w <= 375, "craft phone: panel fits the screen");
        await shot(cp, "craft-phone");
      }
      await cp.close();
    }
    // ---------------------------------------------------------------- SECTION house
    await fresh();
    {
      const hp = await browser.newPage();
      watch(hp); await hp.bringToFront();
      await hp.goto(base + "?bonus=1&debug&new&seed=4321", { waitUntil: "load" });
      await waitFor(hp, (s) => s.active && s.frame > 20, 15000, "house boot");
      const B2 = (fn, a) => hp.evaluate(fn, a);
      await B2(() => { const b = window.__cube.bonus; b.setTime("day"); b.teleport(b.G.world.houseX + 12); });
      await sleep(300);
      await hp.keyboard.press("KeyH"); await sleep(250);
      ok((await bs(hp)).panel === "house" && (await hp.$(".bh-panel")) !== null, "house: H opens the house panel");
      ok(await hp.$eval(".bh-up", (b) => b.disabled), "house: upgrade disabled with nothing");
      await shot(hp, "house-01-plot");
      await B2(() => { window.__cube.bonus.give("wood", 12); window.__cube.bonus.give("fiber", 6); });
      await sleep(200);
      ok(!(await hp.$eval(".bh-up", (b) => b.disabled)), "house: upgrade enabled once the cost is carried");
      await hp.click(".bh-up"); await sleep(400);
      ok((await bs(hp)).house === 1, "house: clicking Upgrade builds the lean-to");
      await sleep(1700);
      ok((await hp.$('[data-a="see"]')) !== null, "house: build animation finished -> 'See it in the world'");
      await shot(hp, "house-02-built");
      await hp.click('[data-a="see"]'); await sleep(200);
      ok((await bs(hp)).panel === null, "house: See it closes the panel");
      await sleep(1200); await shot(hp, "house-03-world-build");
      // mid game: level 12 -> 13 + repair view
      await B2(() => { const b = window.__cube.bonus; b.setHouse(12); for (const [id, n] of [["plank", 99], ["plank", 1], ["iron_ingot", 30], ["rope", 20], ["iron_hammer", 1], ["stone_pickaxe", 1]]) b.give(id, n); const s = b.G.inv.slots.find((x) => x && x.id === "stone_pickaxe"); s.d = 20; b.teleport(b.G.world.houseX + 12); b.openPanel("house"); });
      await sleep(300); await shot(hp, "house-04-lv12");
      await hp.click(".bh-up"); await sleep(300);
      ok((await bs(hp)).house === 13, "house: workshop wing built");
      await sleep(1700);
      await hp.click('[data-a="repair"]'); await sleep(200);
      ok((await hp.$('.bh-rep [data-a="fix"]')) !== null, "house: repair list shows the worn pickaxe");
      await B2(() => window.__cube.bonus.give("stone", 5)); await sleep(150);
      const pi = await B2(() => window.__cube.bonus.G.inv.slots.findIndex((x) => x && x.id === "stone_pickaxe"));
      await hp.click('.bh-rep [data-a="fix"][data-i="' + pi + '"]'); await sleep(200);
      ok(await B2(() => window.__cube.bonus.G.inv.slots.find((x) => x && x.id === "stone_pickaxe").d === 130), "house: repaired the pickaxe");
      await shot(hp, "house-05-repair");
      // the finale
      await B2(() => { const b = window.__cube.bonus; b.closePanel(); b.setHouse(19); for (const [id, n] of [["crystal", 50], ["gold_ingot", 50], ["steel_ingot", 45], ["glass", 8], ["steel_hammer", 1]]) b.give(id, n); b.openPanel("house"); });
      await sleep(300);
      await hp.click(".bh-up"); await sleep(1200);
      ok((await bs(hp)).house === 20 && (await hp.$(".bh-cele")) !== null, "house: level 20 -> Cube Monarch celebration");
      await shot(hp, "house-06-monarch");
      await hp.click('[data-a="hooray"]'); await sleep(200);
      ok((await hp.$(".bh-cele")) === null, "house: celebration dismissed");
      const hf = await fps(hp, 1500); info(`house panel open: fps ${hf.fps.toFixed(1)}`);
      await hp.close();
      if (!DESKTOP_ONLY) {
        await fresh();
        const pp = await browser.newPage();
        watch(pp); await pp.bringToFront();
        await pp.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" });
        await pp.goto(base + "?bonus=1&debug&new&seed=4321", { waitUntil: "load" });
        await waitFor(pp, (s) => s.active && s.frame > 20, 15000, "phone house boot").catch(async (e) => { info("diag " + await pp.evaluate(() => document.visibilityState + " focus " + document.hasFocus())); throw e; });
        await pp.evaluate(() => { const b = window.__cube.bonus; b.setHouse(9); b.give("stone", 40); b.give("brick", 5); b.teleport(b.G.world.houseX + 12); });
        await sleep(200);
        // USE at the door (real touch button) opens the panel
        const use = await pp.$('.bk-touch2 button[data-k="use"]');
        if (use) { const bb = await use.boundingBox(); await pp.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); }
        await sleep(400);
        ok((await bs(pp)).panel === "house", "phone: USE at the door opens the house panel");
        const fit = await pp.evaluate(() => { const r = document.querySelector(".bh-panel").getBoundingClientRect(); return { l: r.left, r: r.right, sw: document.documentElement.scrollWidth, small: [...document.querySelectorAll(".bh-panel button")].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 30).length }; });
        ok(fit.l >= 15 && fit.r <= 375 && fit.sw <= 390, `phone: house panel fits 390 px (${fit.l.toFixed(0)}..${fit.r.toFixed(0)}, scroll ${fit.sw})`);
        await shot(pp, "house-07-phone");
        await pp.evaluate(() => { document.querySelector(".bh-panel").scrollTop = 9999; }); await sleep(150);
        await shot(pp, "house-08-phone-scrolled");
        await pp.close();
      }
    }
    // ---------------------------------------------------------------- SECTION creatures
    await fresh();
    {
      const cp = await browser.newPage();
      watch(cp); await cp.bringToFront();
      await cp.goto(base + "?bonus=1&debug&new&seed=1234", { waitUntil: "load" });
      await waitFor(cp, (s) => s.active && s.frame > 20, 15000, "creatures boot");
      // day: a herd in the meadow, a boar charge
      const r1 = await cp.evaluate(() => {
        const b = window.__cube.bonus, G = b.G; b.setTime("day"); b.teleport(G.world.spawn.x - 20);
        const x = Math.floor(G.player.x / 32);
        const seen = {}; const off = G.bus.on("*", (t) => { if (t.startsWith("animal:")) seen[t] = (seen[t] || 0) + 1; });
        for (const [k, d] of [["deer", -6], ["rabbit", -3], ["pheasant", -5], ["boar", 4]]) b.spawn(k, x + d);
        b.step(600, 0); off();
        return { seen, n: G.animals.length, kinds: G.animals.map((a) => a.kind + ":" + a.state) };
      });
      ok(r1.seen["animal:spawn"] >= 4 && r1.n >= 1, "creatures: spawned and alive in the page (" + r1.kinds.slice(0, 6).join(" ") + ")");
      ok(r1.seen["animal:windup"] >= 1, "creatures: the boar telegraphs its charge in the page");
      await sleep(400); await shot(cp, "creatures-01-day");
      // night: a wolf pack circling the cube
      const r2 = await cp.evaluate(() => {
        const b = window.__cube.bonus, G = b.G; b.setTime("night"); G.player.hp = G.player.maxHp;
        const x = Math.floor(G.player.x / 32);
        b.spawn("wolf", x + 7); b.spawn("wolf", x + 9); b.spawn("wolf", x - 8);
        b.step(240, 0);
        return { wolves: G.animals.filter((a) => a.kind === "wolf").map((a) => a.state) };
      });
      ok(r2.wolves.length >= 2, "creatures: wolves hunt at night (" + r2.wolves.join(" ") + ")");
      await sleep(500); await shot(cp, "creatures-02-night-pack");
      const cf = await fps(cp, 1500); info(`creatures: night pack fps ${cf.fps.toFixed(1)}`);
      await cp.close();
    }
    // ---------------------------------------------------------------- SECTION render (BONUS_RENDER owns this block)
    await fresh();
    {
      const rp = await browser.newPage();
      watch(rp); await rp.bringToFront();
      await rp.goto(base + "?bonus=1&debug&new&seed=1234", { waitUntil: "load" });
      await waitFor(rp, (s) => s.active && s.frame > 20, 15000, "render boot");
      const ic = await rp.evaluate(async () => {
        const mod = await import("./src/bonus/data/items.js"), r = window.__cube.bonus.ctx.renderer;
        const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); let n = 0, blank = [];
        for (const it of mod.ITEM_LIST) { g.clearRect(0, 0, 64, 64); r.drawIcon(g, it.id, 0, 0, 64); const d = g.getImageData(0, 0, 64, 64).data; let a = 0; for (let k = 3; k < d.length; k += 16) a += d[k] > 0; if (a > 20) n++; else blank.push(it.id); }
        for (let lv = 0; lv <= 20; lv++) { g.clearRect(0, 0, 64, 64); r.drawHouse(g, lv, 0, 0, 64, 64); }
        return { n, total: mod.ITEM_LIST.length, blank };
      });
      ok(ic.n === ic.total, `render: every item icon paints (${ic.n}/${ic.total}${ic.blank.length ? " blank: " + ic.blank.join(",") : ""})`);
      const shots = [["render-day", 0.25, null], ["render-dusk", 0.655, null], ["render-night", "night", null]];
      for (const [name, tm] of shots) { await rp.evaluate((tm) => window.__cube.bonus.setTime(tm), tm); await sleep(700); await shot(rp, name); }
      await rp.evaluate(() => window.__cube.bonus.setTime(0.25));
      const rf = await fps(rp, 2000);
      info(`render: day fps ${rf.fps.toFixed(1)} worst ${rf.worst.toFixed(1)} ms`);
      ok(rf.fps >= 50, "render: day frame rate >= 50 fps (" + rf.fps.toFixed(1) + ")");
      for (const lv of [1, 5, 10, 15, 20]) {
        await rp.evaluate((lv) => { const b = window.__cube.bonus; b.teleport(b.G.world.houseX + 12); b.setHouse(lv); b.G.house.buildT = 9999; }, lv);
        await sleep(500); await shot(rp, "render-house" + String(lv).padStart(2, "0"));
      }
      await rp.close();
    }
    // ---------------------------------------------------------------- SECTION integrate (INTEGRATE owns this block)
    await fresh();
    // unlock flow from a fresh profile, area 3 -> bonus, every tool tier, hunt, cook + eat, sleep, all 20 house
    // levels through the real panel, save/reload, continue from the area card, pause menu (settings, return home,
    // save & quit), day/night music, phone area card + pause, fps.
    {
      let ip = await browser.newPage();
      watch(ip); await ip.bringToFront();
      await ip.evaluateOnNewDocument(() => { window.__PLATYFY_ONLINE_TEST = { prefix: "pfo-bonusplay:", relay: "https://127.0.0.1:9" }; });
      const cube = (pg) => pg.evaluate(() => window.__cube.state());
      const waitScreen = async (pg, name, ms = 8000) => { const t0 = Date.now(); for (;;) { const s = await cube(pg).catch(() => null); if (s && s.screen === name) return s; if (Date.now() - t0 > ms) throw new Error("timeout: screen " + name + " " + JSON.stringify(s)); await sleep(100); } };
      const PROG = "adventurecube.progress.v1", SAVE = "adventurecube.bonus.v1";
      // --- locked on a fresh profile
      await ip.goto(base, { waitUntil: "load" });
      await ip.evaluate((P, S) => { localStorage.removeItem(P); localStorage.removeItem(S); }, PROG, SAVE);
      await ip.goto(base + "?bonus", { waitUntil: "load" });
      await waitScreen(ip, "areas");
      ok(true, "integrate: ?bonus while locked lands on the area select");
      ok(await ip.$(".bonus-card.locked") !== null, "integrate: fresh profile -> bonus card locked");
      const nA = await ip.$$eval(".area", (els) => els.map((e) => e.className.trim()));
      ok(nA.length === 3, "integrate: still exactly three .area cards");
      await ip.click(".bonus-card"); await sleep(300);
      ok((await cube(ip)).screen === "areas", "integrate: clicking the locked bonus card does nothing");
      await sleep(600); await shot(ip, "int-01-areas-locked");
      // --- clear area 3 (areas 1-2 done): the results announce the unlock and offer the bonus
      await ip.evaluate((P) => localStorage.setItem(P, JSON.stringify({ done: { area1: true, area2: true }, best: { area1: 60000, area2: 60000 } })), PROG);
      await ip.evaluate(() => window.__cube.app.areas.play("area3"));
      await waitScreen(ip, "play");
      await sleep(500);
      const goal = await ip.evaluate(() => window.__cube.sim.level.goal);
      await ip.evaluate((g) => { window.__cube.teleport(g.x - 3, g.y); window.__cube.setInput(2); }, goal);
      const t0 = Date.now(); while (!(await cube(ip)).won && Date.now() - t0 < 10000) await sleep(100);
      await ip.evaluate(() => window.__cube.setInput(null));
      await ip.waitForSelector(".results", { timeout: 8000 });
      await sleep(400);
      const unl = await ip.evaluate(() => { const u = document.querySelector(".results .res-unlock"); const n = document.querySelector(".results button[data-a=next]"); return { u: u && u.textContent, n: n && n.textContent }; });
      ok(!!unl.u && /Wildwood Homestead/.test(unl.u), "integrate: area 3 results announce the bonus unlock (" + (unl.u || "none").slice(0, 60) + ")");
      ok(/bonus/i.test(unl.n || ""), "integrate: area 3 results offer '" + unl.n + "'");
      await shot(ip, "int-02-area3-unlock");
      await ip.click(".results button[data-a=next]");
      let s = await waitFor(ip, (s) => s.active && s.frame > 20, 15000, "bonus from the area 3 results");
      ok(s.house === 0 && s.day === 1, "integrate: the results button starts a fresh bonus world (day " + s.day + ")");
      // --- music follows day / night
      await ip.keyboard.press("ShiftLeft"); await sleep(1500);
      const ids = await ip.evaluate(async () => { const m = await import("./src/bonus/audio/index.js"); return { day: m.SONGS.day.id, night: m.SONGS.night.id }; });
      const song0 = await ip.evaluate(() => window.__cube.app.audio.currentSong);
      await ip.evaluate(() => window.__cube.bonus.setTime("night")); await sleep(2500);
      const song1 = await ip.evaluate(() => window.__cube.app.audio.currentSong);
      ok(song0 === ids.day && song1 === ids.night, `integrate: music switches day -> night (${song0} -> ${song1})`);
      await ip.evaluate(() => window.__cube.bonus.setTime("day")); await sleep(300);
      // --- mine with a pickaxe (real held input)
      await ip.evaluate(() => { const b = window.__cube.bonus; b.clearInv(); b.give("wood_pickaxe", 1); b.select(0); b.teleport(b.G.world.spawn.x - 20); });
      await sleep(300);
      const m0 = (await bs(ip)).stats.mined || 0;
      await ip.evaluate((bits) => window.__cube.bonus.setInput(bits), B.ACTION | B.DOWN); await sleep(4000);
      await ip.evaluate(() => window.__cube.bonus.setInput(null));
      s = await bs(ip);
      ok((s.stats.mined || 0) - m0 >= 2 && ((s.inv.dirt || 0) + (s.inv.stone || 0)) >= 1, `integrate: mined ${(s.stats.mined || 0) - m0} tiles digging down (dirt ${s.inv.dirt || 0}, stone ${s.inv.stone || 0})`);
      await shot(ip, "int-03-mined");
      // --- craft every tool tier (all stations at a level-19 house)
      const crafted = await ip.evaluate(async () => {
        const b = window.__cube.bonus, G = b.G, C = await import("./src/bonus/craft/index.js");
        b.clearInv(); b.setHouse(19); b.teleport(G.world.houseX + 12); b.step(10, 0);
        for (const [id, n] of [["wood", 20], ["stick", 60], ["stone", 15], ["flint", 2], ["iron_ore", 40], ["coal", 70], ["rope", 2]]) b.give(id, n);
        const out = {};
        C.craft(G, "iron_ingot", 39); C.craft(G, "steel_ingot", 13);
        for (const tier of ["wood", "stone", "iron", "steel"]) for (const type of ["axe", "pickaxe", "sword", "spear", "hammer"]) {
          const id = tier + "_" + type; out[id] = C.craft(G, id, 1);
        }
        out.bow = C.craft(G, "bow", 1);
        const missing = Object.keys(out).filter((k) => !out[k] || !b.count(k));
        return { n: Object.keys(out).length, missing };
      });
      ok(crafted.missing.length === 0, `integrate: crafted all ${crafted.n} tools, wood -> stone -> iron -> steel + bow${crafted.missing.length ? " (missing " + crafted.missing.join(",") + ")" : ""}`);
      await ip.keyboard.press("KeyE"); await sleep(300); await shot(ip, "int-04-all-tools"); await ip.keyboard.press("Escape"); await sleep(150);
      // --- hunt: a rabbit with the stone sword, then cook + eat it at the home fire
      const hunt = await ip.evaluate((B) => {
        const b = window.__cube.bonus, G = b.G, p = G.player;
        b.setHouse(19); b.teleport(G.world.houseX - 6); b.step(20, 0);
        const si = G.inv.slots.findIndex((x) => x && x.id === "stone_sword"); if (si >= 9) { const t = G.inv.slots[si]; G.inv.slots[si] = G.inv.slots[0]; G.inv.slots[0] = t; G.inv.ver++; b.select(0); } else b.select(si);
        const tx = Math.floor((p.x + 13) / 32) - 2, id = b.spawn("rabbit", tx);
        const h0 = G.stats.hunted;
        for (let i = 0; i < 1500 && G.stats.hunted === h0; i++) {
          const a = G.animals.find((x) => x.id === id); if (!a) break;
          const dx = a.x + a.w / 2 - (p.x + 13), aim = { tx: Math.floor((a.x + a.w / 2) / 32), ty: Math.floor((a.y + a.h / 2) / 32) };
          // keep up with the fleeing rabbit (it outruns a cube): stand next to it, facing it, then swing for real
          if (Math.abs(dx) > 36 && (i % 30) === 0) { b.teleport(aim.tx - (dx > 0 ? 1 : -1), aim.ty); p.facing = dx > 0 ? 1 : -1; }
          b.step(1, (Math.abs(dx) > 40 ? (dx > 0 ? B.RIGHT : B.LEFT) : 0) | B.ACTION, aim);
        }
        b.step(120, 0);
        return { hunted: G.stats.hunted - h0, meat: b.count("raw_small_meat"), hide: b.count("hide") };
      }, B);
      ok(hunt.hunted === 1 && hunt.meat >= 1, `integrate: hunted a rabbit (meat ${hunt.meat}, hide ${hunt.hide})`);
      const cook = await ip.evaluate((B) => {
        const b = window.__cube.bonus, G = b.G, p = G.player;
        b.teleport(G.world.houseX + 6); b.step(10, 0);
        const mi = G.inv.slots.findIndex((x) => x && x.id === "raw_small_meat");
        const t = G.inv.slots[mi]; G.inv.slots[mi] = G.inv.slots[1]; G.inv.slots[1] = t; G.inv.ver++; b.select(1);
        b.step(1, B.USE); b.step(2, 0);   // raw meat at the home campfire -> cooked
        const cooked = b.count("cooked_small_meat");
        const ci = G.inv.slots.findIndex((x) => x && x.id === "cooked_small_meat"); if (ci >= 0 && ci < 9) b.select(ci);
        p.hunger = 40; const e0 = G.stats.eaten || 0;
        b.step(1, B.USE); b.step(2, 0);
        return { cooked, hunger: p.hunger, eaten: (G.stats.eaten || 0) - e0, panel: b.ctx.panel };
      }, B);
      ok(cook.cooked >= 1, "integrate: USE at the home fire cooks the meat");
      ok(cook.eaten === 1 && cook.hunger > 40, `integrate: ate it (hunger 40 -> ${cook.hunger.toFixed(0)}${cook.panel ? ", panel " + cook.panel : ""})`);
      await ip.evaluate(() => window.__cube.bonus.closePanel());
      // --- sleep in the bed through the night
      const slept = await ip.evaluate(async (B) => {
        const b = window.__cube.bonus, G = b.G, H = await import("./src/bonus/house/index.js");
        b.setHouse(5); b.setTime("night"); const d0 = G.time.day;
        G.animals.length = 0;
        const bed = H.spots(G).bed; b.teleport(bed); b.step(10, 0);
        b.step(1, B.USE); b.step(2, 0);
        return { day0: d0, day1: G.time.day, phase: b.state().phase, panel: b.ctx.panel };
      }, B);
      ok(slept.day1 === slept.day0 + 1 && (slept.phase === "dawn" || slept.phase === "day"), `integrate: USE at the bed sleeps to dawn (day ${slept.day0} -> ${slept.day1}, ${slept.phase}${slept.panel ? ", panel " + slept.panel : ""})`);
      await ip.evaluate(() => window.__cube.bonus.closePanel());
      await sleep(600);
      // --- all 20 house levels through the real house panel, paying real costs
      await ip.evaluate(() => { const b = window.__cube.bonus; b.closePanel(); b.setHouse(0); b.clearInv(); b.give("steel_hammer", 1); b.setTime("day"); b.teleport(b.G.world.houseX + 12); b.step(10, 0); });
      const lv20 = [];
      for (let lv = 1; lv <= 20; lv++) {
        await ip.evaluate(async (lv) => {
          const b = window.__cube.bonus, G = b.G, D = await import("./src/bonus/data/house.js");
          b.closePanel();
          for (const [id, n] of Object.entries(D.HOUSE_LEVELS[lv - 1].cost)) b.give(id, n);
          b.teleport(G.world.houseX + 12); b.openPanel("house");
        }, lv);
        await sleep(150);
        const en = await ip.$eval(".bh-up", (x) => !x.disabled).catch(() => false);
        if (en) await ip.click(".bh-up");
        const t1 = Date.now(); let L = 0;
        while (Date.now() - t1 < 3000) { L = (await bs(ip)).house; if (L >= lv) break; await sleep(80); }
        lv20.push(L);
        if (L < lv) { info("integrate: stuck at level " + L + " " + JSON.stringify(await ip.evaluate(async () => { const H = await import("./src/bonus/house/index.js"); const c = H.canUpgrade(window.__cube.bonus.G); return { ok: c.ok, missing: c.missing, hammer: c.hammer, has: c.hasHammer }; }))); break; }
        if (lv === 10 || lv === 15) { await sleep(1700); await shot(ip, "int-05-house-panel-" + lv); }
      }
      ok(lv20[lv20.length - 1] === 20 && lv20.length === 20, "integrate: upgraded 0 -> 20 with the panel's Upgrade button, paying every cost (" + lv20.join(",") + ")");
      await sleep(1300);
      ok(await ip.$(".bh-cele") !== null, "integrate: level 20 celebration shown");
      await shot(ip, "int-06-lv20-celebration");
      const hb = await ip.$('[data-a="hooray"]'); if (hb) await hb.click();
      await ip.evaluate(() => { const b = window.__cube.bonus; b.closePanel(); b.teleport(b.G.world.houseX + 12); b.G.house.buildT = 9999; b.setTime("night"); });
      await sleep(900); await shot(ip, "int-07-citadel-night");
      const nf = await fps(ip, 2500); info(`integrate: citadel at night fps ${nf.fps.toFixed(1)} worst ${nf.worst.toFixed(1)} ms`);
      ok(nf.fps >= 45, "integrate: citadel at night >= 45 fps (" + nf.fps.toFixed(1) + ")");
      // --- save, then a reload resumes it
      const before = await bs(ip);
      await ip.evaluate(() => window.__cube.bonus.save());
      const saved = await ip.evaluate((S) => { const v = JSON.parse(localStorage.getItem(S)); return { kb: Math.round(JSON.stringify(v).length / 1024), house: v.house.level }; }, SAVE);
      info(`integrate: save is ${saved.kb} KB`);
      ok(saved.house === 20 && saved.kb < 200, "integrate: saved (house 20, " + saved.kb + " KB)");
      // --- continue from the area card
      await ip.goto(base, { waitUntil: "load" });
      await waitScreen(ip, "title");
      const sub = await ip.$eval(".title-screen button[data-a=play] small", (e) => e.textContent);
      ok(/Bonus unlocked/i.test(sub), "integrate: title shows '" + sub + "'");
      await ip.click(".title-screen button[data-a=play]");
      await waitScreen(ip, "areas"); await sleep(900);
      const card = await ip.$eval(".bonus-card", (e) => ({ locked: e.classList.contains("locked"), text: e.textContent.replace(/\s+/g, " ") }));
      ok(!card.locked && /20 \/ 20/.test(card.text) && /Continue/.test(card.text), "integrate: area card unlocked, shows the saved world + Continue");
      const pic = await ip.$eval(".bonus-pic canvas", (c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 400) n += d[i] > 0; return n; });
      ok(pic > 100, "integrate: the card preview is painted");
      await shot(ip, "int-08-areas-continue");
      await ip.click('.bonus-card [data-b="continue"]');
      s = await waitFor(ip, (s) => s.active && s.frame > 5, 15000, "continue");
      ok(s.house === before.house && s.seed === before.seed && Math.abs(s.day - before.day) <= 1, `integrate: Continue resumes the world (house ${s.house}, day ${s.day})`);
      // --- pause menu: settings, return home, save & quit
      await ip.keyboard.press("Escape"); await sleep(250);
      ok((await bs(ip)).panel === "pause", "integrate: Esc opens the pause menu");
      await ip.click('.bc-pause [data-a="settings"]');
      await ip.waitForSelector(".settings-panel", { timeout: 4000 });
      ok(true, "integrate: pause -> Settings opens the settings sheet");
      await shot(ip, "int-09-pause-settings");
      await ip.click(".settings-panel button[data-a=close]"); await sleep(200);
      ok((await ip.$(".settings-panel")) === null && (await bs(ip)).panel === "pause", "integrate: closing settings returns to the pause menu");
      await ip.evaluate(() => { const b = window.__cube.bonus; b.G.animals.length = 0; b.teleport(b.G.world.spawn.x - 120); });
      await ip.click('.bc-pause [data-a="home"]'); await sleep(300);
      s = await bs(ip);
      const hx = await ip.evaluate(() => window.__cube.bonus.G.world.houseX);
      ok(s.panel === null && s.tx >= hx && s.tx < hx + 24, `integrate: Return home puts the cube at its door (tx ${s.tx})`);
      await ip.keyboard.press("Escape"); await sleep(200);
      await ip.click('.bc-pause [data-a="quit"]');
      await waitScreen(ip, "areas");
      ok(true, "integrate: Save & quit returns to the area select");
      ok(await ip.evaluate((S) => !!JSON.parse(localStorage.getItem(S)), SAVE), "integrate: the world is still saved after quitting");
      // --- phone: area card fits, Continue by touch, pause button, save & quit
      // phone pass in a fresh browser + tab, carrying this profile's progress + bonus save across
      const keepLS = await ip.evaluate((P, S) => [localStorage.getItem(P), localStorage.getItem(S)], PROG, SAVE);
      await ip.close(); await fresh(); ip = await browser.newPage(); watch(ip); await ip.bringToFront();
      await ip.evaluateOnNewDocument(() => { window.__PLATYFY_ONLINE_TEST = { prefix: "pfo-bonusplay:", relay: "https://127.0.0.1:9" }; });
      await ip.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" });
      await ip.goto(base, { waitUntil: "load" });
      await ip.evaluate((P, S, k) => { localStorage.setItem(P, k[0]); localStorage.setItem(S, k[1]); }, PROG, SAVE, keepLS);
      await ip.goto(base, { waitUntil: "load" }); await ip.bringToFront();
      await waitScreen(ip, "title");
      await ip.evaluate(() => window.__cube.show("areas")); await sleep(900);
      const fitA = await ip.evaluate(() => { const r = document.querySelector(".bonus-card").getBoundingClientRect(); return { l: r.left, r: r.right, sw: document.documentElement.scrollWidth }; });
      ok(fitA.l >= 0 && fitA.r <= 390 && fitA.sw <= 390, `integrate phone: bonus card fits (${fitA.l.toFixed(0)}..${fitA.r.toFixed(0)})`);
      await ip.evaluate(() => document.querySelector(".bonus-card").scrollIntoView()); await sleep(200);
      await shot(ip, "int-10-phone-areas");
      const cb = await (await ip.$('.bonus-card [data-b="continue"]')).boundingBox();
      await ip.touchscreen.tap(cb.x + cb.width / 2, cb.y + cb.height / 2);
      s = await waitFor(ip, (s) => s.active && s.frame > 5, 15000, "phone continue");
      ok(s.house === 20, "integrate phone: Continue by touch");
      await sleep(500); await shot(ip, "int-11-phone-world");
      const pb = await (await ip.$('.bc-btn[data-a="pause"]')).boundingBox();
      await ip.touchscreen.tap(pb.x + pb.width / 2, pb.y + pb.height / 2); await sleep(300);
      ok((await bs(ip)).panel === "pause", "integrate phone: the pause button opens the pause menu");
      const pfit = await ip.evaluate(() => { const r = document.querySelector(".bc-pause").getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, small: [...document.querySelectorAll(".bc-pause button")].filter((x) => x.getBoundingClientRect().height < 40).length }; });
      ok(pfit.l >= 0 && pfit.r <= 390 && pfit.t >= 0 && pfit.b <= 844 && pfit.small === 0, "integrate phone: pause menu fits with 40+ px buttons " + JSON.stringify(pfit));
      await shot(ip, "int-12-phone-pause");
      const qb = await (await ip.$('.bc-pause [data-a="quit"]')).boundingBox();
      await ip.touchscreen.tap(qb.x + qb.width / 2, qb.y + qb.height / 2);
      await waitScreen(ip, "areas");
      ok(true, "integrate phone: Save & quit by touch");
      await ip.close();
    }
    ok(errors.length === 0, "no page errors" + (errors.length ? ":\n  " + errors.slice(0, 8).join("\n  ") : ""));
  } catch (e) {
    console.log("FAIL threw " + (e.stack || e)); fails++;
    if (errors.length) console.log("page errors:\n  " + errors.slice(0, 8).join("\n  "));
  } finally {
    clearInterval(keep);
    if (browser) await browser.close();
    srv.close();
    lock.release();
  }
  console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
  process.exit(fails ? 1 : 0);
})();
