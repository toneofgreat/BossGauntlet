// Level 13 "THE FAR LANDS": full browser playthrough (modelled on playtest-l12.cjs).
//   node tools/playtest-l13.cjs --play1       intro .. enter (the woods, the wolves, home, the grove, the puzzle)
//   node tools/playtest-l13.cjs --play2       babies .. close (the babies, the robot chase, the reveal)
//   node tools/playtest-l13.cjs --play3       build .. cozy (the house, TO BE CONTINUED, the main screen)
//   node tools/playtest-l13.cjs --extras      every skipTo hook: objective, marker, budget, load time; win()
//   node tools/playtest-l13.cjs --from=den / --only=puzzle   start at / play just one beat
//   add --head=src/audio.js to serve a file from git HEAD (when another builder has it mid-edit)
// Real keys (WASD, Space, E, J, L, R, Enter to skip cutscenes); the seam reads state, aims the camera and only teleports
// (logged as a fallback) when a walk gets stuck. Screenshots: tools/shots/l13-NNN-name.png.
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const arg = (k) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=")[1] : null; };
const PLAY1 = process.argv.includes("--play1"), PLAY2 = process.argv.includes("--play2"), PLAY3 = process.argv.includes("--play3");
const FROM = arg("from") || (PLAY2 ? "babies" : PLAY3 ? "build" : null), UNTIL = arg("until") || (PLAY1 ? "enter" : PLAY2 ? "close" : null), ONLY = arg("only"), PLAY = process.argv.includes("--play") || PLAY1 || PLAY2 || PLAY3, EXTRAS = process.argv.includes("--extras");
// --head=src/audio.js serves those files from git HEAD (when another builder's copy is mid-edit)
const HEAD = new Map((arg("head") || "").split(",").filter(Boolean).map((f) => ["/" + f, require("child_process").execSync("git show HEAD:platypus/" + f, { cwd: ROOT, maxBuffer: 64 << 20 })]));
const PRE = "l13-" + (PLAY1 ? "p1-" : PLAY2 ? "p2-" : PLAY3 ? "p3-" : FROM ? FROM + "-" : ONLY ? ONLY + "-" : EXTRAS ? "x-" : "");
const BEATS = ["intro", "woods", "ambush", "den", "sleep", "morning", "grove", "show", "puzzle", "enter", "babies", "robots", "chase", "back", "reveal", "close", "build", "cozy"];
const HOOKS = ["woods", "ambush", "den", "sleep", "morning", "grove", "show", "puzzle", "enter", "babies", "robots", "chase", "chase2", "chase3", "back", "reveal", "close", "build", "build2", "build3", "build4", "build5", "build6", "cozy"];

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      if (HEAD.has(p)) { res.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" }); res.end(HEAD.get(p)); return; }
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

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const f of fs.readdirSync(SHOTS)) if (f.startsWith(PRE)) fs.unlinkSync(path.join(SHOTS, f));
  const srv = await serve();
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
    defaultViewport: { width: 1280, height: 720 },
  });
  const LIMIT = +(arg("limit") || 560) * 1000;
  let page = null;
  setTimeout(async () => { console.log("WATCHDOG: " + LIMIT / 1000 + " s, closing"); try { await page.screenshot({ path: path.join(SHOTS, PRE + "watchdog.png") }); } catch (_) {} try { await browser.close(); } catch (_) {} srv.close(); process.exit(2); }, LIMIT).unref();
  const errors = [];
  const report = { steps: [], errors, fallbacks: [], seamTeleports: [], budget: {}, fails: [] };
  let n = 0;
  page = await browser.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + (e.stack || e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });
  page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url()));

  const T0 = Date.now();
  const log = (m) => { m = "[" + ((Date.now() - T0) / 1000).toFixed(0).padStart(3) + "s] " + m; report.steps.push(m); console.log(m); };
  const fail = (m) => { report.fails.push(m); log("FAIL: " + m); };
  const fallback = (m) => { report.fallbacks.push(m); log("FALLBACK: " + m); };
  const shot = async (name) => { n++; const f = path.join(SHOTS, PRE + String(n).padStart(3, "0") + "-" + name + ".png"); await page.screenshot({ path: f }); return f; };
  let maxCalls = 0, maxTris = 0, maxWhere = "";
  const st = async () => {
    const s = await page.evaluate(() => {
      const d = window.__platy; if (!d) return null;
      const s = d.state();
      s.obj = (document.getElementById("objective") || {}).textContent || "";
      s.dead = !!d.ctx.health.dead;
      s.respawning = !!d.ctx.checkpoint.respawning;
      s.playing = d.cinema.playing;
      s.faded = d.cinema.faded;
      s.grounded = d.player.grounded; s.py = d.player.y; s.swim = d.player.swimming; s.dive = d.player.diving; s.wet = d.player.inWater;
      s.worldName = d.world ? d.world.name : "";
      const L = d.ctx.debug.level13;
      if (L && s.levelN === 13) {
        const f = L.friend; s.pip = { x: f.x, z: f.z, b: f.behaviour };
        s.floor = d.world && d.world.heightAt ? d.world.heightAt(d.player.x, d.player.z) : 0;
      }
      return s;
    });
    if (s && s.render && s.mode === "level") {
      if (s.render.calls > maxCalls) { maxCalls = s.render.calls; maxWhere = s.step; }
      if (s.render.triangles > maxTris) maxTris = s.render.triangles;
      const b = report.budget[s.step] || (report.budget[s.step] = { calls: 0, tris: 0 });
      if (s.render.calls > b.calls) b.calls = s.render.calls;
      if (s.render.triangles > b.tris) b.tris = s.render.triangles;
    }
    return s;
  };
  const waitFor = async (pred, ms, label) => {
    const t0 = Date.now();
    for (;;) {
      const s = await st();
      if (s && pred(s)) return s;
      if (Date.now() - t0 > ms) throw new Error("timeout waiting for " + label + " (step=" + (s && s.step) + " obj=" + (s && s.obj) + ")");
      await sleep(100);
    }
  };
  const keys = new Set();
  const down = async (k) => { if (!keys.has(k)) { keys.add(k); await page.keyboard.down(k); } };
  const up = async (k) => { if (keys.has(k)) { keys.delete(k); await page.keyboard.up(k); } };
  const upAll = async () => { for (const k of Array.from(keys)) await up(k); };
  const press = (k) => page.keyboard.press(k);
  const aimAt = (x, z) => page.evaluate((x, z) => { const d = window.__platy, p = d.player; d.cam.yaw = Math.atan2(x - p.x, z - p.z); d.cam.manualT = 1.5; }, x, z);
  const tp = async (x, z, why) => { report.seamTeleports.push(why || ""); log("  seam tp -> " + x.toFixed(1) + "," + z.toFixed(1) + " (" + why + ")"); await page.evaluate((x, z) => window.__platy.tp(x, z), x, z); await sleep(300); };
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  async function walk(target, o) {
    o = o || {};
    const stop = o.stop === undefined ? 0.5 : o.stop, tEnd = Date.now() + (o.timeout || 15000);
    let lastX = 1e9, lastZ = 1e9, lastT = Date.now(), jumps = 0, res = "timeout", detourT = 0, detourSide = 1;
    for (;;) {
      const s = await st();
      if (!s || (o.until && o.until(s))) { res = "until"; break; }
      if (s.dead || s.respawning) { res = "died"; break; }
      const t = await target(s);
      if (!t) { res = "notarget"; break; }
      const d = Math.hypot(t.x - s.player.x, t.z - s.player.z);
      if (d < stop) { res = "ok"; break; }
      if (Date.now() > tEnd) break;
      if (Date.now() < detourT) {
        const a = Math.atan2(t.x - s.player.x, t.z - s.player.z) + detourSide * 1.35;
        await aimAt(s.player.x + Math.sin(a) * 3, s.player.z + Math.cos(a) * 3);
      } else await aimAt(t.x, t.z);
      await down("KeyW");
      if (o.each) await o.each(s, t, d);
      if (Math.hypot(s.player.x - lastX, s.player.z - lastZ) > 0.25) { lastX = s.player.x; lastZ = s.player.z; lastT = Date.now(); jumps = 0; }
      else if (s.player.enabled && Date.now() - lastT > 900 + jumps * 700) {
        if (jumps >= 7) { res = "stuck"; break; }
        jumps++;
        if (jumps >= 2 && !o.noDetour) { detourSide = jumps % 2 ? 1 : -1; detourT = Date.now() + 1300 + jumps * 250; lastT = Date.now() + 1200; }
        else if (!o.noJump) { await press("Space"); lastT = Date.now(); }
      }
      await sleep(50);
    }
    await up("KeyW");
    return res;
  }
  async function go(p, o, why) {
    const r = await walk(() => p, o);
    if (r === "stuck" || r === "timeout") {
      const s = await st();
      fallback("walk " + r + " to " + (why || JSON.stringify(p)) + " from " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1));
      await shot("stuck-" + (why || "walk").replace(/\W+/g, "_"));
      await tp(p.x, p.z, why);
    }
    return r;
  }
  // hold Enter to skip a playing cutscene
  async function skipCine(label) {
    const s = await st();
    if (!s.playing) return false;
    await down("Enter"); await sleep(1300); await up("Enter");
    await sleep(600);
    log("  skipped cutscene " + (label || ""));
    return true;
  }
  async function waitCine(ms) { await waitFor((s) => !s.playing && s.player.enabled, ms || 30000, "cutscene end"); }
  const fpsOnce = () => page.evaluate(() => new Promise((res) => {
    const gaps = []; let last = performance.now(); const t0 = last;
    function f(t) { gaps.push(t - last); last = t; if (t - t0 < 2500) requestAnimationFrame(f); else { gaps.sort((a, b) => a - b); res({ fps: gaps.length / ((t - t0) / 1000), p95: gaps[(gaps.length * 0.95) | 0] }); } }
    requestAnimationFrame(f);
  }));

  // =========================================================================================== start
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
  await E(() => { window.__platy.unlockAll(); });
  const startL13 = async () => {
    try {
    await E(() => window.__platy.startLevel(13));
    await page.waitForFunction(() => { const s = window.__platy.state(); return s.mode === "level" && s.levelN === 13; }, { timeout: 60000 });
    } catch (e) { console.log("START FAILED; errors: " + errors.join(" | ")); throw e; }
  };

  // ------------------------------------------------------------------------- the beats, played
  const L13 = (fnBody) => E(new Function("const d = window.__platy, L = d.ctx.debug.level13; " + fnBody));
  const lv = () => E(() => window.__platy.level().state());
  async function waitPlay(step, ms) { return waitFor((s) => s.step === step && s.player.enabled && !s.playing, ms || 20000, step + " playable"); }
  async function skipUntil(pred, ms, label) {
    const t0 = Date.now();
    for (;;) { const s = await st(); if (pred(s)) return s; if (s.playing) await skipCine(label); else await sleep(200); if (Date.now() - t0 > (ms || 30000)) throw new Error("timeout: " + label + " (step " + s.step + ")"); }
  }
  // fight the wolves near the player until done(s)
  async function fight(done, ms) {
    const t0 = Date.now(); let deaths = 0;
    while (Date.now() - t0 < (ms || 150000)) {
      const s = await st();
      if (done(s)) return deaths;
      if (s.dead || s.respawning) { deaths++; await waitFor((q) => !q.respawning && q.player.enabled, 10000, "respawn"); continue; }
      if (s.playing || !s.player.enabled) { await sleep(200); continue; }
      const w = await L13("const p = d.player; let b = null, bd = 99, n = 0; for (const w of L.woods.wolves.list) { if (!w.alive) continue; const dd = Math.hypot(w.x - p.x, w.z - p.z), open = w.state === 'recover' || w.state === 'hurt'; if (dd < 6) n++; if (dd - (open ? 6 : 0) < bd) { bd = dd - (open ? 6 : 0); b = w; } } return b ? { x: b.x, z: b.z, d: Math.hypot(b.x - p.x, b.z - p.z), open: b.state === 'recover' || b.state === 'hurt', n, crouch: b.state === 'crouch' || b.state === 'lunge' } : null;");
      if (!w) { await sleep(250); continue; }
      if (Date.now() - (fight.lt || 0) > 8000) { fight.lt = Date.now(); log("    fight: " + JSON.stringify(w) + " " + (await L13("return L.woods.wolves.list.filter(w => w.active).map(w => (w.alpha ? \"A\" : \"w\") + w.state + w.hp).join(\" \");"))); }
      if (w.n >= 2 && !(await E(() => window.__platy.ctx.abilities.scream.cooldownLeft > 0))) { await down("KeyR"); await sleep(900); await up("KeyR"); await sleep(300); continue; }
      if (w.d > 1.7) { await aimAt(w.x, w.z); await down("KeyW"); await sleep(w.open ? 120 : 160); if (!w.open) await up("KeyW"); }
      else { await up("KeyW"); await aimAt(w.x, w.z); await press("KeyJ"); await sleep(250); }
    }
    throw new Error("fight timed out");
  }
  async function walkPts(pts, o) { for (const p of pts) { const r = await walk(() => p, Object.assign({ stop: 1.6, timeout: 25000 }, o || {})); if (r === "until") return r; if (r === "stuck" || r === "timeout") { fallback("walk " + r + " to " + p.x.toFixed(1) + "," + p.z.toFixed(1)); await tp(p.x, p.z, "path"); } } return "ok"; }

  async function playIntro() {
    await waitFor((s) => s.step === "intro" && s.playing, 30000, "recap");
    await sleep(3500); await shot("recap");
    await skipCine("recap");
    await waitPlay("woods");
  }
  async function playWoods() {
    await shot("woods");
    const P = await L13("return L.woods.P.path;");
    const r = await walkPts(P.filter((p) => p.z > 4), { until: (s) => s.step !== "woods" });
    await shot("woods-trail");
    await waitFor((s) => s.step === "ambush", 30000, "ambush");
    void r;
  }
  async function playAmbush() {
    await waitPlay("ambush");
    await sleep(600); await shot("ambush");
    const deaths = await fight((s) => s.kos >= 3 || s.step !== "ambush");
    log("  ambush won (deaths " + deaths + ")");
    await waitFor((s) => s.step === "toDen", 8000, "to the den");
    const P = await L13("return L.woods.P;");
    await walkPts(P.path.filter((p) => p.z > 52).concat([P.den]), { until: (s) => s.step === "den" });
    await waitFor((s) => s.step === "den", 30000, "den");
  }
  async function playDen() {
    await sleep(2500); await shot("den");
    await skipUntil((s) => s.step === "den" && s.player.enabled && !s.playing, 30000, "den cutscene");
    const deaths = await fight((s) => s.step === "vines", 240000);
    log("  den won (deaths " + deaths + ")");
    await shot("den-won");
    const t = await L13("return L.woods.P.pipTree;");
    await go({ x: t.x, z: t.z - 1.2 }, { stop: 0.6 }, "pip tree");
    for (let i = 0; i < 6; i++) { const s = await st(); if (s.step !== "vines") break; await press("KeyL"); await sleep(900); }
    await sleep(1500); await shot("freed");
    await skipUntil((s) => s.step === "sleep" && s.player.enabled, 30000, "freed");
  }
  async function playSleep() {
    await waitPlay("sleep");
    await shot("home-night");
    const b = await L13("return L.jungle.P.bed;");
    await go({ x: b.x, z: b.z }, { stop: 1.2, timeout: 30000 }, "bed");
    await waitFor((s) => s.action === "Sleep", 5000, "Sleep prompt");
    await press("KeyE");
    await sleep(4000); await shot("asleep");
    await skipUntil((s) => s.step === "morning", 30000, "night");
  }
  async function playMorning() {
    for (let k = 0; k < 3; k++) {
      await waitFor((s) => s.step !== "morning" || (s.hideStage === 2 && s.hides === k && s.player.enabled), 20000, "hide " + k);
      const s0 = await st(); if (s0.step !== "morning") break;
      if (k === 0) await shot("hide-and-seek");
      const r = await walk(async () => { const f = await L13("return { x: L.friend.x, z: L.friend.z };"); return f; }, { stop: 1.1, timeout: 30000 });
      if (r !== "ok") { fallback("seek " + r); const f = await L13("return { x: L.friend.x, z: L.friend.z };"); await tp(f.x, f.z - 1, "seek"); }
      await waitFor((s) => s.action === "Found you!", 4000, "Found you");
      await press("KeyE");
      await waitFor((s) => s.hides === k + 1, 4000, "found " + (k + 1));
    }
    await skipUntil((s) => s.step === "grove", 30000, "afternoon");
  }
  async function playGrove() {
    await waitPlay("grove");
    await shot("grove");
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) {
      const s = await st();
      if (s.step !== "grove") break;
      const f = await L13("return { x: L.friend.x, z: L.friend.z };");
      const r = await walk(() => f, { stop: 0.7, timeout: 4000, until: (q) => q.step !== "grove" });
      if (r === "stuck") { fallback("follow stuck"); await tp(f.x, f.z - 1, "follow"); }
      if (s.player.z > 31 && s.player.z < 34) await shot("threads");
    }
    await sleep(2500); await shot("the-rock");
    await skipUntil((s) => s.step === "show" && s.player.enabled, 30000, "rock reveal");
  }
  async function playShow() {
    const P = await L13("return L.grove.P;");
    await walkPts(P.route.slice().reverse().concat([{ x: P.exit.x, z: 0.5 }]), { until: (s) => s.place === "jungle" });
    await waitFor((s) => s.place === "jungle" && s.player.enabled, 10000, "camp");
    const fire = await L13("return L.jungle.P.fire;");
    await go({ x: fire.x - 1.6, z: fire.z - 1.2 }, { stop: 0.8, timeout: 20000 }, "fire");
    await waitFor((s) => s.action === "Call the tribe", 5000, "Call prompt");
    await press("KeyE");
    await sleep(9000); await shot("tribe-at-the-rock");
    await skipUntil((s) => s.step === "puzzle" && s.player.enabled && !s.playing, 40000, "show cutscene");
  }
  async function playPuzzle() {
    await shot("puzzle");
    const P = await L13("return { stones: L.grove.P.stones, c: L.grove.P.centre };");
    const ANSWER = [0, 1, 2, 3];
    for (let i = 0; i < 4; i++) {
      const s = P.stones[i], dx = P.c.x - s.x, dz = P.c.z - s.z, l = Math.hypot(dx, dz);
      await go({ x: s.x + (dx / l) * 1.4, z: s.z + (dz / l) * 1.4 }, { stop: 0.4, timeout: 15000 }, "stone " + i);
      for (let k = 0; k < 5; k++) { const q = await lv(); if (q.faces[i] === ANSWER[i]) break; await press("KeyE"); await sleep(800); }
    }
    await waitFor((s) => s.solved, 4000, "solved");
    await shot("stones-lit");
    await sleep(1200);
    await go({ x: P.c.x, z: P.c.z }, { stop: 0.4, timeout: 10000 }, "centre");
    await down("KeyR"); await sleep(1000); await up("KeyR");
    await sleep(2500); await shot("portal-opens");
    await skipUntil((s) => s.step === "enter" && s.player.enabled && !s.playing, 30000, "portal");
  }
  async function playEnter() {
    const p = await L13("return L.grove.P.portal;");
    await go({ x: p.x, z: p.z }, { stop: 0.6, timeout: 15000, until: (s) => s.playing }, "portal");
    await sleep(2500); await shot("knocked-out");
    await skipUntil((s) => s.step === "babies", 30000, "knocked out");
  }
  async function playBabies() {
    await sleep(3000); await shot("babies");
    await skipUntil((s) => s.step === "babies" && s.player.enabled && !s.playing, 30000, "babies cutscene");
    const baby = (i) => L13("const b = L.babies.list[" + i + "]; return { x: b.x, z: b.z, n: b.need };");
    const CREEK = { x: 28.6, z: 79 };
    // babies toddle about: walk up until the prompt shows (a few tries)
    const reach = async (i, pre) => { for (let t = 0; t < 8; t++) { const q = await st(); if (q.action.startsWith(pre)) return q; if (t > 2) log("    reach " + pre + " try " + t + ": action \"" + q.action + "\" p " + q.player.x.toFixed(1) + "," + q.player.z.toFixed(1) + " baby " + JSON.stringify(await baby(i)) + " held " + q.held); await walk(async () => baby(i), { stop: 0.35, timeout: 8000, until: (z) => z.action.startsWith(pre) }); await sleep(120); } return waitFor((z) => z.action.startsWith(pre), 2000, pre + " prompt"); };
    for (let it = 0; it < 40; it++) {
      const q0 = await st(); if (q0.step !== "babies" || q0.playing) break;
      // the first baby still needing something, and the first thing it needs
      const all = await L13("return L.babies.list.map(b => ({ x: b.x, z: b.z, n: b.need, c: b.carried }));");
      const i = all.findIndex((b) => b.n.hunger < 1 || b.n.clean < 1 || b.n.happy < 1 || b.n.sleepy < 1);
      if (i < 0) break;
      const b = all[i];
      if (b.n.hunger < 1) {
        const g = await L13("const f = L.jungle.P.foodStore; return { x: f.x + 1.2, z: f.z + 1.0 };");
        await go(g, { stop: 0.5, timeout: 20000 }, "basket");
        await waitFor((s) => s.action === "Take a grub", 4000, "grub prompt"); await press("KeyE"); await sleep(400);
        await reach(i, "Feed"); await press("KeyE"); await sleep(600);
      } else if (b.n.clean < 1) {
        await reach(i, "Pick up"); await press("KeyE"); await sleep(400);
        if (it < 4) await shot("carry-baby");
        await go({ x: CREEK.x - 1.4, z: CREEK.z }, { stop: 0.6, timeout: 20000 }, "creek");
        await waitFor((s) => s.action.startsWith("Wash"), 4000, "wash prompt"); await press("KeyE"); await sleep(1500);
      } else if (b.n.happy < 1) {
        await reach(i, "Tickle"); await press("KeyE"); await sleep(500);
      } else {
        await reach(i, "Rock"); await down("KeyE"); await sleep(3400); await up("KeyE"); await sleep(300);
      }
      log("  care " + it + " needs " + JSON.stringify((await lv()).needs));
    }
    await shot("babies-cared");
    await skipUntil((s) => s.step === "robots", 30000, "night falls");
  }
  async function playRobots() {
    await sleep(6000); await shot("robots");
    await skipUntil((s) => s.step === "chase" && s.player.enabled && !s.playing, 30000, "robots");
  }
  async function playChase() {
    let deaths = 0, lastShot = "";
    const t0 = Date.now();
    while (Date.now() - t0 < 240000) {
      const s = await st();
      if (s.step === "back" || s.place === "grove") break;
      if (s.dead || s.respawning) { deaths++; await waitFor((q) => !q.respawning && q.player.enabled, 10000, "respawn"); continue; }
      if (s.playing) { if (s.step === "chase2") { await sleep(2500); await shot("but-where"); } await skipCine("chase"); continue; }
      if (s.step !== lastShot && s.step.startsWith("chase")) { lastShot = s.step; await sleep(400); await shot(s.step); }
      const t = await L13("const r = L.CHASE[d.level().state().seg]; const q = d.level().state(); return r ? r[Math.min(q.routeI, r.length - 1)] : null;");
      if (!t) { await sleep(200); continue; }
      await aimAt(t.x, t.z); await down("KeyW");
      if (s.power === "laser" && s.grounded) await press("Space");
      await sleep(80);
    }
    await up("KeyW");
    log("  chase done (deaths " + deaths + ")");
    await waitFor((s) => s.step === "back" && s.player.enabled, 20000, "back");
  }
  async function playBack() {
    await shot("back");
    const p = await L13("return L.grove.P.portal;");
    await go({ x: p.x, z: p.z - 1.6 }, { stop: 0.6, timeout: 20000, until: (s) => s.action === "Jump in!" }, "portal");
    await waitFor((s) => s.action === "Jump in!", 5000, "Jump in prompt");
    await press("Space");
    await waitFor((s) => s.step === "reveal", 15000, "reveal");
  }
  async function playReveal() {
    await sleep(4000); await shot("reveal");
    await sleep(9000); await shot("3-seconds");
    await skipUntil((s) => s.step === "close" && s.player.enabled && !s.playing, 60000, "reveal");
  }
  async function playClose() {
    const P = await L13("return { stones: L.grove.P.stones, c: L.grove.P.centre, rock: L.grove.P.rock };");
    for (let i = 0; i < 4; i++) {
      const s = P.stones[i], dx = P.c.x - s.x, dz = P.c.z - s.z, l = Math.hypot(dx, dz);
      await go({ x: s.x + (dx / l) * 1.4, z: s.z + (dz / l) * 1.4 }, { stop: 0.4, timeout: 15000 }, "stone " + i);
      await press("KeyE"); await sleep(900);
    }
    await waitFor((s) => s.closeTurned >= 4, 4000, "4 turned");
    await go({ x: P.rock.x + 1.8, z: P.rock.z - 2.2 }, { stop: 0.5, timeout: 15000 }, "rock");
    await waitFor((s) => s.action === "Slap the rock", 4000, "slap prompt");
    await press("KeyL");
    await sleep(2500); await shot("portal-closed");
    await skipUntil((s) => s.step === "build" && s.player.enabled && !s.playing, 30000, "close cutscene");
  }
  async function playBuild() {
    // once the walls stand, go in and out by the door (+z side)
    const H = await L13("return { x: L.house.SITE.x, z: L.house.SITE.z, r: L.house.WALL_R };");
    const inside = (x, z) => Math.hypot(x - H.x, z - H.z) < H.r + 0.2;
    const side = (q) => ({ x: H.x + (q.x < H.x ? -1 : 1) * (H.r + 1.8), z: H.z + H.r + 0.6 });
    const goB = async (p, o, why) => { const s = await st(); if (s.house.stage >= 2 && inside(s.player.x, s.player.z) !== inside(p.x, p.z)) { log("    via the door: " + why); const dIn = { x: H.x, z: H.z + H.r - 1.0 }, dOut = { x: H.x, z: H.z + H.r + 1.6 }; if (inside(s.player.x, s.player.z)) { await go(dIn, { stop: 0.5, timeout: 8000 }, "door in"); await go(dOut, { stop: 0.6, timeout: 8000 }, "door out"); if (p.z < H.z + 1) await go(side(p), { stop: 0.8, timeout: 8000 }, "round the house"); } else { if (s.player.z < H.z + 1) await go(side(s.player), { stop: 0.8, timeout: 8000 }, "round the house"); await go(dOut, { stop: 0.6, timeout: 12000 }, "door out"); await go(dIn, { stop: 0.5, timeout: 8000 }, "door in"); } } return go(p, o, why); };
    await shot("build");
    const t0 = Date.now(); let n = 0;
    while (Date.now() - t0 < 420000) {
      const s = await st();
      if (s.step === "cozy" || (s.house && s.house.done)) break;
      if (s.playing || !s.player.enabled) { await sleep(300); continue; }
      if (!s.carrying) {
        const k = await L13("const h = L.house, ks = h.stageDef().kinds.filter(k => h.open(k).length); return ks.length ? { k: ks[0], p: h.PILES[ks[0]] } : null;");
        if (!k) { await sleep(300); continue; }
        await goB({ x: k.p.x - 1.0, z: k.p.z + 0.4 }, { stop: 0.5, timeout: 20000 }, "pile " + k.k);
        const a = await waitFor((q) => q.action.startsWith("Pick up") || q.house.done, 4000, "pile prompt").catch(() => null);
        if (!a) { fallback("no pile prompt " + k.k); continue; }
        await press("KeyE"); await sleep(250);
      } else {
        const p = await L13("const p = L.house.nearestOpen(d.player.x, d.player.z, '" + s.carrying + "'); return p ? { x: p.x, z: p.z } : null;");
        if (!p) { await sleep(300); continue; }
        await goB(p, { stop: 0.5, timeout: 20000, until: (q) => q.action === "Place" }, "slot");
        const a = await waitFor((q) => q.action === "Place" || !q.carrying, 3000, "place prompt").catch(() => null);
        if (!a) { fallback("no place prompt"); await tp(p.x, p.z, "slot"); continue; }
        if (a.action === "Place") { await press("KeyE"); n++; await sleep(300); await press("KeyE"); await sleep(250); }
        const q = await st();
        if (n % 12 === 3) await shot("build-" + q.house.stage);
      }
    }
    const s = await st();
    log("  house: " + JSON.stringify(s.house) + " perfects " + s.perfects);
    await shot("house-done");
    await skipUntil((q) => q.step === "cozy" && q.player.enabled && !q.playing, 40000, "house done");
  }
  async function playCozy() {
    await shot("cozy");
    const S = await L13("return L.house.SITE;");
    await go({ x: S.x, z: S.z + 3.4 }, { stop: 0.5, timeout: 20000 }, "door");
    await go({ x: S.x, z: S.z + 0.3 }, { stop: 0.4, timeout: 10000 }, "middle bed");
    await waitFor((s) => s.action === "Sleep", 5000, "Sleep prompt");
    await press("KeyE");
    await sleep(8000); await shot("everyone-asleep");
    await sleep(6000); await shot("to-be-continued");
    await waitFor((s) => s.mode === "menu", 60000, "main screen");
    const prog = await E(() => window.__platy.state().progress);
    log("  back on the main screen; progress " + JSON.stringify(prog).slice(0, 200));
  }
  const PLAYERS = { intro: playIntro, woods: playWoods, ambush: playAmbush, den: playDen, sleep: playSleep, morning: playMorning, grove: playGrove, show: playShow, puzzle: playPuzzle, enter: playEnter,
    babies: playBabies, robots: playRobots, chase: playChase, back: playBack, reveal: playReveal, close: playClose, build: playBuild, cozy: playCozy };

  try {
    if (!EXTRAS) {
      await startL13();
      const from = ONLY || FROM || "intro";
      if (from !== "intro") { await sleep(1500); await E((n) => window.__platy.level().skipTo(n), from); }
      const i0 = BEATS.indexOf(from), i1 = ONLY ? i0 : UNTIL ? BEATS.indexOf(UNTIL) : BEATS.length - 1;
      for (let i = i0; i <= i1; i++) {
        const b = BEATS[i];
        log("== " + b);
        try { await PLAYERS[b](); }
        catch (e) { fail(b + ": " + e.message); await shot("fail-" + b); break; }
      }
      const f = await fpsOnce().catch(() => null);
      if (f) log("fps at the end " + f.fps.toFixed(1));
    }
    if (!PLAY && !ONLY && !FROM) {
      // ---------------------------------------------------------------- extras: every hook loads clean
      log("== extras");
      const s0 = await st();
      if (s0.mode !== "level") await startL13();
      await sleep(1500);
      for (const h of HOOKS) {
        const t0 = Date.now();
        await E((n) => window.__platy.level().skipTo(n), h);
        let s;
        try { s = await waitFor((q) => (q.step === h || (false)) && q.player.enabled && !q.playing && q.faded < 0.05, 15000, "hook " + h); }
        catch (e) { // some beats open with a short cutscene: skip it
          await skipCine(h);
          try { s = await waitFor((q) => q.player.enabled && !q.playing, 15000, "hook " + h); } catch (e2) { fail("hook " + h + ": " + e2.message); continue; }
        }
        const ms = Date.now() - t0;
        await sleep(900);
        s = await st();
        const marker = await E(() => { const d = window.__platy; return !!(d.ctx.debug.level13 && document.querySelector("#objective")); });
        log("  " + h.padEnd(10) + " " + String(ms).padStart(5) + " ms  calls " + s.render.calls + " tris " + s.render.triangles + "  obj: " + s.obj.replace(/\s+/g, " ").slice(0, 70));
        if (!s.obj) fail("hook " + h + " has no objective");
        if (s.render.calls >= 150) fail("hook " + h + " draw calls " + s.render.calls);
        if (s.render.triangles >= 250000) fail("hook " + h + " triangles " + s.render.triangles);
        void marker;
        await shot("hook-" + h);
      }
      // win() from the middle
      await E(() => window.__platy.level().skipTo("chase"));
      await sleep(1500);
      await E(() => window.__platy.win());
      await waitFor((s) => s.mode === "menu", 30000, "menu after win()");
      log("  win() from chase -> main screen");
      const f = await fpsOnce();
      log("  menu fps " + f.fps.toFixed(1));
    }
  } catch (e) {
    fail("harness: " + (e.stack || e.message));
    try { await shot("harness-fail"); } catch (_) {}
  }
  await upAll().catch(() => {});
  log("max draw calls " + maxCalls + " (" + maxWhere + "), max tris " + maxTris);
  log("budget per step: " + JSON.stringify(report.budget));
  log("errors: " + errors.length);
  for (const e of errors.slice(0, 30)) console.log("  " + e.slice(0, 400));
  log("fallbacks: " + report.fallbacks.length + ", fails: " + report.fails.length);
  fs.writeFileSync(path.join(SHOTS, PRE + "report.json"), JSON.stringify(report, null, 1));
  await browser.close();
  srv.close();
  process.exit(errors.length || report.fails.length ? 1 : 0);
})();
