// shot.cjs - screenshots + runtime checks of the COMBAT dev harness (one headless browser, machine-wide lock).
//   node totally-normal-rpg/src/combat/dev/shot.cjs [outDir]
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "../../../..");                 // BossGauntlet
const lock = require(path.join(ROOT, "adventure-cube/tools/browserlock.cjs"));
const puppeteer = require(path.join(ROOT, "node_modules/puppeteer"));
const OUT = path.resolve(process.argv[2] || path.join(__dirname, "shots"));
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".png": "image/png" };

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const u = decodeURIComponent(req.url.split("?")[0]);
      let f = path.join(ROOT, u);
      if (!f.startsWith(ROOT)) { rsp.writeHead(403); rsp.end(); return; }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
      fs.readFile(f, (err, data) => {
        if (err) { rsp.writeHead(404); rsp.end("nf"); return; }
        rsp.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
        rsp.end(data);
      });
    });
    srv.listen(0, "127.0.0.1", () => res({ url: "http://127.0.0.1:" + srv.address().port, close: () => srv.close() }));
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const s = await serve();
  await lock.acquire("tnrpg-combat-dev");
  let browser;
  const errors = [];
  let fail = 0;
  try {
    browser = await puppeteer.launch({ headless: "new", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    const base = s.url + "/totally-normal-rpg/src/combat/dev/";
    const shots = [
      ["gallery-all", "?mode=gallery&view=all"],
      ["gallery-humans", "?mode=gallery&view=humans"],
      ["gallery-rats", "?mode=gallery&view=rats"],
      ["gallery-beasts", "?mode=gallery&view=beasts"],
      ["gallery-ng", "?mode=gallery&view=humans&cycle=1"],
      ["item-iron", "?mode=items&item=iron_sword"],
      ["item-staff", "?mode=items&item=kings_staff&crown=kings_crown"],
      ["item-golden", "?mode=items&item=golden_armor&crown=bad_kings_crown"],
    ];
    for (const [name, q] of shots) {
      await page.goto(base + q, { waitUntil: "load" });
      await page.waitForFunction("window.__devReady === true", { timeout: 30000 });
      await new Promise((r) => setTimeout(r, 1500));
      await page.screenshot({ path: path.join(OUT, name + ".png") });
      const de = await page.evaluate(() => window.__devErrors.slice());
      if (de.length) { errors.push(name + " devErrors: " + de.join(" | ")); }
      lock.touch();
    }
    // play mode: exercise fights through the debug hooks
    await page.goto(base + "?mode=play", { waitUntil: "load" });
    await page.waitForFunction("window.__devReady === true", { timeout: 30000 });
    const r = await page.evaluate(async () => {
      const T = window.__tnrpg, st = () => T.ctx.state;
      const out = {};
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      await wait(500);
      let hurts = 0, deaths = 0, respawns = 0, hits = 0, bossStarts = [], bossEnds = [];
      T.ctx.bus.on("player:hurt", () => hurts++);
      T.ctx.bus.on("player:died", () => deaths++);
      T.ctx.bus.on("player:respawn", () => respawns++);
      T.ctx.bus.on("enemy:hit", () => hits++);
      T.ctx.bus.on("boss:start", (p) => bossStarts.push(p.id));
      T.ctx.bus.on("boss:end", (p) => bossEnds.push(p.id + ":" + p.won));
      out.rats = T.ctx.combat.enemies.filter((e) => e.active && e.kind === "rat").length;
      // stand among the rats with fists: they must aggro and bite
      window.__dev.player.teleport({ x: 0, y: 0, z: 21 }, 0);
      await wait(6000);
      out.ratDbg = T.ctx.combat.enemies.filter((e) => e.active && e.kind === "rat").map((e) => [e.state, e.aggro, Math.round(e.distP * 10) / 10, e.atk ? e.atk.id : "", Math.round(e.pos.x), Math.round(e.pos.z)]);
      out.pl = [st().player.hp, st().player.alive, st().rt.playing, st().player.invuln];
      out.ratBites = hurts;
      out.ratAggro = T.ctx.combat.enemies.filter((e) => e.active && e.kind === "rat" && e.aggro).length;
      for (let i = 0; i < 8; i++) { T.ctx.bus.emit("input:attack", { phase: "down", held: 0 }); await wait(30); T.ctx.bus.emit("input:attack", { phase: "up", held: 0.03 }); await wait(450); }
      out.punchHits = hits;
      T.godMode(true);
      T.kill("rat"); await wait(100);
      out.afterRat = { level: st().run.level, smelly: !!st().run.owned.smelly_sword, sword: st().run.equip.sword };
      // live rat king fight
      window.__dev.player.teleport({ x: 0, y: 0, z: 44 }, 0);
      out.rkStart = T.ctx.combat.startFight("ratKing");
      await wait(6000);
      out.rkFight = T.ctx.combat.activeFight();
      out.rkState = T.ctx.combat.enemies.filter((e) => e.kind === "ratKing")[0].state;
      T.defeat("ratKing"); await wait(100);
      out.afterRK = { level: st().run.level, cheese: !!st().run.owned.cheese_sword, sword: st().run.equip.sword };
      T.setLevel(600); T.defeat("guards"); await wait(100);
      out.afterGuards = { level: st().run.level, iron: !!st().run.owned.iron_sword };
      T.kill("royalGuard"); await wait(100);
      out.afterRoyal = { level: st().run.level, gold: !!st().run.owned.gold_sword };
      T.setLevel(100000);
      // live King fight (staff light, bolts) then win
      window.__dev.player.teleport({ x: 0, y: 0, z: 40 }, 0);
      st().world.zone = "kingDark";
      T.ctx.bus.emit("zone:enter", { id: "kingDark", prev: "castle" });
      await wait(6000);
      out.kingFight = T.ctx.combat.activeFight();
      T.defeat("king"); await wait(100);
      out.afterKing = { level: st().run.level, staff: !!st().run.owned.kings_staff, kingWins: st().run.kingWins, hitless: !!st().run.flags["combat.kingHitless"] };
      // staff bolt
      for (let i = 0; i < 2; i++) { T.ctx.bus.emit("input:attack", { phase: "down", held: 0 }); await wait(700); T.ctx.bus.emit("input:attack", { phase: "up", held: 0.7 }); await wait(900); }
      out.shop = T.ctx.combat.shop();
      out.inv = T.ctx.combat.inventory().map((i) => i.id + (i.equipped ? "*" : ""));
      // cat fight (needs the kittens secret)
      st().profile.secrets.kittens = Date.now();
      T.ctx.combat.startFight("cat");
      await wait(5000);
      out.catFight = T.ctx.combat.activeFight();
      T.defeat("cat");
      out.cat = { claws: !!st().run.owned.cat_claws, bell: !!st().run.owned.toms_bell, charm: st().run.equip.charm };
      // rookie
      window.__dev.player.teleport({ x: -18, y: 0, z: 10 }, 0);
      T.ctx.combat.startFight("rookie");
      await wait(4000);
      out.rookieFight = T.ctx.combat.activeFight();
      T.defeat("rookie");
      out.badge = !!st().run.owned.rookie_badge;
      // death + default respawn
      T.godMode(false);
      T.ctx.combat.killPlayer("test");
      for (let i = 0; i < 60 && !respawns; i++) await wait(250);
      out.fps = await new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); });
      out.death = { deaths, respawns, alive: st().player.alive, hp: st().player.hp, pos: window.__dev.player.position.z };
      out.hurts = hurts; out.hits = hits; out.bossStarts = bossStarts; out.bossEnds = bossEnds;
      // cycle 1 king fight with clones
      window.__dev.setCycle(1);
      await wait(200);
      out.ngRats = T.ctx.combat.enemies.filter((e) => e.active && e.kind === "rat").length;
      T.setLevel(200000);
      out.ngSword = st().run.equip.sword;
      T.defeat("king");
      out.ngKing = { staff: !!st().run.owned.bad_kings_staff, eq: st().run.equip.sword };
      out.errors = window.__devErrors.slice();
      return out;
    });
    console.log(JSON.stringify(r, null, 1));
    await page.screenshot({ path: path.join(OUT, "play-end.png") });
    const checks = [
      ["smelly on first rat", r.afterRat.smelly],
      ["cheese on rat king", r.afterRK.cheese],
      ["iron on guards", r.afterGuards.iron],
      ["gold on royal", r.afterRoyal.gold],
      ["staff on king", r.afterKing.staff && r.afterKing.kingWins === 1],
      ["bad staff in cycle 1", r.ngKing.staff],
      ["rats aggro + bite", r.ratBites > 0 && r.ratAggro > 0],
      ["punches land", r.punchHits > 0],
      ["rat king fight runs", r.rkStart && r.rkFight === "ratKing"],
      ["king fight on kingDark", r.kingFight === "king"],
      ["cat drops", r.cat.claws && r.cat.bell],
      ["rookie badge", r.badge],
      ["death -> respawn", r.death.deaths === 1 && r.death.respawns === 1 && r.death.alive && r.death.hp > 0],
      ["repopulated after reset", r.ngRats === 12],
      ["no dev errors", !r.errors.length],
    ];
    for (const [n, ok] of checks) { console.log((ok ? "PASS " : "FAIL ") + n); if (!ok) fail++; }
  } catch (e) { console.error(e); fail++; }
  finally {
    if (browser) await browser.close();
    lock.release();
    s.close();
  }
  if (errors.length) { console.log("console errors/warnings:"); for (const e of errors.slice(0, 40)) console.log("  " + e); }
  process.exit(fail ? 1 : 0);
})();
