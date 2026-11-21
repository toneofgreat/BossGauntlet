// Level 5 "THE HAPPIEST DAY": full browser playthrough.
//   node tools/playtest-l5.cjs                the whole level with real keys / mouse, then replay, fps and phone checks
//   node tools/playtest-l5.cjs --from=slap    start the real playthrough at a beat (skipTo)
//   node tools/playtest-l5.cjs --only=night   play just that beat, then stop (no completion checks)
//   node tools/playtest-l5.cjs --play         only the real playthrough (about 7 minutes)
//   node tools/playtest-l5.cjs --extras       only the replay / skipTo / fps / re-entry / phone part (about 5 minutes)
// Beats: intro, day, bedtime, night (alarm..still), hope (wizard, reveal), slap, hold, end.
// Screenshots: tools/shots/l5-NN-name.png, plus 2x2 contact sheets tools/shots/l5-sheet-NN.png.
// The seam is used to aim the follow camera at the next target and to read state; the playing is real input.
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const arg = (k) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=")[1] : null; };
const FROM = arg("from"), ONLY = arg("only"), EXTRAS = process.argv.includes("--extras"), PLAY = process.argv.includes("--play");
const ORDER = ["intro", "day", "bedtime", "night", "hope", "slap", "hold", "end"];
const SKIP = { intro: "intro", day: "day", bedtime: "bedtime", night: "alarm", hope: "wizard", slap: "slap", hold: "hold", end: "end" };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
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
  for (const f of fs.readdirSync(SHOTS)) if (f.startsWith("l5-")) fs.unlinkSync(path.join(SHOTS, f));
  const srv = await serve();
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
    defaultViewport: { width: 1280, height: 720 },
  });
  const errors = [];
  const report = { url, steps: [], errors, fallbacks: [], shots: [] };
  let n = 0;
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + (e.stack || e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });
  page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url()));

  const T0 = Date.now();
  const log = (m) => { m = "[" + ((Date.now() - T0) / 1000).toFixed(0).padStart(3) + "s] " + m; report.steps.push(m); console.log(m); };
  const fallback = (m) => { report.fallbacks.push(m); log("FALLBACK: " + m); };
  const shot = async (name) => {
    n++;
    const f = path.join(SHOTS, "l5-" + String(n).padStart(3, "0") + "-" + name + ".png");
    await page.screenshot({ path: f });
    report.shots.push(f);
    return f;
  };
  let maxCalls = 0, maxTris = 0, maxWhere = "";
  const st = async () => {
    const s = await page.evaluate(() => {
      const d = window.__platy; if (!d) return null;
      const s = d.state(), L = d.level5;
      s.hud = { action: !!d.ui.actionOn, tricks: !!d.ui.tricksOn };
      s.actionLabel = d.ui.actionOn ? (document.getElementById("actionTxt") || {}).textContent || "" : "";
      s.acting = !!d.platypus.acting; s.lock = d.player.lock; s.walking = !!d.player.walking; s.speaking = !!d.ui.speaking();
      s.gy = d.platypus.group.position.y;
      if (L && s.levelN === 5 && s.mode === "level" && d.world) {
        const w = d.world, f = L.friend, v = { x: 0, y: 0, z: 0 };
        const fl = (x, z) => Math.max(w.heightAt(x, z), (w.waterAt ? w.waterAt(x, z) : -1e9) - 0.1);
        s.world = w.name;
        s.floor = d.ctx.floorAt(d.player.x, d.player.z);
        s.friend = { x: f.x, y: f.y, z: f.z, gy: f.group.position.y, busy: !!f.busy, swimming: !!f.swimming, floor: fl(f.x, f.z), beh: f.behaviour };
        s.joy = Object.assign({}, L.joy);
        if (!s.lair) {
          const B = L.props.ball;
          s.ball = { x: B.x, y: B.y, z: B.z, active: !!B.active };
          s.shinies = [];
          for (let i = 0; i < 5; i++) if (L.props.shinies.active(i)) { L.props.shinies.pos(i, v); s.shinies.push({ i, x: v.x, y: v.y, z: v.z }); }
          s.bowl = { x: L.props.bowl.x, z: L.props.bowl.z, left: L.props.bowl.left };
          const P = L.zoo.P;
          s.P = { nest: P.nest, fallTop: P.fallTop, fallSteps: P.fallSteps, showRock: P.showRock, sunRock: P.sunRock, sandbank: P.sandbank };
          s.hoop = { x: L.zoo.hoop.x, y: L.zoo.hoop.y, z: L.zoo.hoop.z };
          s.watchers = L.crowd.watchers(d.player.x);
          const k = L.crowd.staff[0], h = L.crowd.staff[1];
          s.keeper = { x: k.x, z: k.z, visible: !!k.visible }; s.handler = { x: h.x, z: h.z, visible: !!h.visible };
        } else {
          const P = L.lair.P, c = L.props.cushion;
          s.LP = { spawn: P.spawn, dummy: P.dummy, cushion: P.cushion, dropRing: P.dropRing, wizard: P.wizard };
          s.cush = { x: c.x, y: c.y, z: c.z, state: c.state, active: !!c.active };
        }
      }
      return s;
    });
    if (s && s.render) {
      if (s.render.calls > maxCalls) { maxCalls = s.render.calls; maxWhere = s.step; }
      if (s.render.triangles > maxTris) maxTris = s.render.triangles;
    }
    return s;
  };
  const waitFor = async (pred, ms, label) => {
    const t0 = Date.now();
    for (;;) {
      const s = await st();
      if (s && pred(s)) return s;
      if (Date.now() - t0 > ms) throw new Error("timeout waiting for " + label + " (step=" + (s && s.step) + ")");
      await sleep(100);
    }
  };
  const keys = new Set();
  const down = async (k) => { if (!keys.has(k)) { keys.add(k); await page.keyboard.down(k); } };
  const up = async (k) => { if (keys.has(k)) { keys.delete(k); await page.keyboard.up(k); } };
  const upAll = async () => { for (const k of Array.from(keys)) await up(k); };
  const aimAt = (x, z) => page.evaluate((x, z) => { const d = window.__platy, p = d.player; d.cam.yaw = Math.atan2(x - p.x, z - p.z); d.cam.manualT = 1.5; }, x, z);
  const tp = (x, z, yaw) => page.evaluate((x, z, yaw) => window.__platy.tp(x, z, yaw), x, z, yaw);
  async function walk(target, o) {
    o = o || {};
    const stop = o.stop === undefined ? 0.5 : o.stop, tEnd = Date.now() + (o.timeout || 15000);
    let lastX = 1e9, lastZ = 1e9, lastT = Date.now(), jumps = 0, res = "timeout", detourT = 0, detourSide = 1;
    for (;;) {
      const s = await st();
      if (!s || (o.until && o.until(s))) { res = "until"; break; }
      const t = target(s);
      if (!t) { res = "notarget"; break; }
      const d = Math.hypot(t.x - s.player.x, t.z - s.player.z);
      if (d < stop) { res = "ok"; break; }
      if (Date.now() > tEnd) break;
      if (Date.now() < detourT) { // blocked by a rock: go round it, like a player would
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
        else if (!o.noJump) { await page.keyboard.press("Space"); lastT = Date.now(); }
      }
      await sleep(70);
    }
    await up("KeyW");
    return res;
  }
  const fpsOnce = () => page.evaluate(() => new Promise((res) => {
    const gaps = []; let last = performance.now(); const t0 = last;
    function f(t) { gaps.push(t - last); last = t; if (t - t0 < 5000) requestAnimationFrame(f); else {
      gaps.sort((a, b) => a - b);
      res({ fps: gaps.length / ((t - t0) / 1000), p50: gaps[gaps.length >> 1], p95: gaps[(gaps.length * 0.95) | 0], p99: gaps[(gaps.length * 0.99) | 0], max: gaps[gaps.length - 1] });
    } }
    requestAnimationFrame(f);
  }));
  // one 5 s window; `again` re-stages the moment for a retry when the first reading is slow
  const fpsMeasure = async (label, again) => {
    let best = null; const samples = [];
    for (let i = 0; i < 3; i++) {
      if (i && again) await again();
      const f = await fpsOnce();
      samples.push(Math.round(f.fps * 10) / 10);
      if (!best || f.fps > best.fps) best = f;
      if (f.fps >= 58) break;
    }
    best.samples = samples;
    const s = await st();
    report["fps_" + label] = best; report["render_" + label] = s.render;
    log("FPS " + label + ": " + best.fps.toFixed(1) + " p50 " + best.p50.toFixed(1) + "ms p95 " + best.p95.toFixed(1) + "ms max " + best.max.toFixed(1) + "ms; draw calls " + s.render.calls + " tris " + s.render.triangles + (samples.length > 1 ? " (samples " + samples.join(", ") + ")" : ""));
    return best;
  };
  const ground = (s, label, strict) => {
    if (!s || s.floor === undefined) return;
    const dp = s.gy - s.floor, df = s.friend.gy - s.friend.floor;
    log("  ground check " + label + ": player y-floor=" + dp.toFixed(2) + (s.player.swimming ? " (swimming)" : "") + (s.acting ? " (mid-trick)" : "") + (s.lair ? "" : " Pip y-floor=" + df.toFixed(2) + (s.friend.swimming ? " (swimming)" : "") + (s.friend.busy ? " (busy)" : "")));
    if (strict !== false && !s.player.swimming && !s.acting && s.player.grounded && Math.abs(dp) > 0.3) fallback("player not on the ground at " + label + ": " + dp.toFixed(2));
    if (strict !== false && !s.lair && !s.friend.swimming && !s.friend.busy && Math.abs(df) > 0.45) fallback("Pip not on the ground at " + label + ": " + df.toFixed(2));
  };
  const reached = (beat) => ORDER.indexOf(beat);
  async function filmWhile(name, cond, every, maxMs, each) {
    const t0 = Date.now(); let i = 0, lastShot = 0, lastStep = "";
    while (Date.now() - t0 < maxMs) {
      const s = await st();
      if (!s || !cond(s)) break;
      if (each) await each(s);
      if (Date.now() - lastShot >= every || s.step !== lastStep) {
        lastShot = Date.now(); lastStep = s.step;
        await shot(name + "-" + String(i++).padStart(2, "0") + "-" + s.step + "-" + ((Date.now() - t0) / 1000).toFixed(0) + "s");
      }
      await sleep(120);
    }
    return (Date.now() - t0) / 1000;
  }
  const holdEnter = async () => { await page.keyboard.down("Enter"); await sleep(1400); await page.keyboard.up("Enter"); };
  const pressWhenFree = async (key, ms) => { await waitFor((x) => x.lock <= 0 && !x.acting, ms || 6000, "free for " + key); await page.keyboard.press(key); };
  // wizard speech: read it, then Enter
  async function talk(name, maxMs) {
    const t0 = Date.now(); let k = 0;
    while (Date.now() - t0 < (maxMs || 20000)) {
      const s = await st();
      if (!s.speaking) { if (Date.now() - t0 > 1200) break; await sleep(150); continue; }
      await sleep(1900);
      if (k < 3) await shot(name + "-say-" + (++k));
      await page.keyboard.press("Enter"); await sleep(250); await page.keyboard.press("Enter");
      await sleep(450);
    }
  }

  // ---------------------------------------------------------------- the beats
  async function beatIntro() {
    await sleep(900); await shot("title");
    await waitFor((x) => x.step === "intro" && x.cinema.playing, 20000, "intro cutscene");
    const t = await filmWhile("intro", (x) => x.step === "intro", 1500, 30000);
    log("intro ran " + t.toFixed(1) + " s");
  }

  async function joyGoal() {
    let s = await st(), goals = s.joy.goals, shots = 0;
    const tEnd = Date.now() + 150000; let tGoal = Date.now(), wasFetch = false, tFetch = 0;
    while (Date.now() < tEnd) {
      s = await st();
      if (s.step !== "day" || s.joys[1]) break;
      if (s.joy.goals !== goals) { goals = s.joy.goals; log("  goal " + goals + " after " + ((Date.now() - tGoal) / 1000).toFixed(1) + " s"); await up("KeyW"); await sleep(300); await shot("goal-" + goals); tGoal = Date.now(); }
      if (s.pip === "fetch") { if (!wasFetch) tFetch = Date.now(); wasFetch = true; await up("KeyW"); if (shots < 1 && Date.now() - tGoal > 1500) { shots++; await shot("goal-pip-fetches"); } await sleep(150); continue; }
      if (wasFetch) { wasFetch = false; log("  Pip fetched the ball in " + ((Date.now() - tFetch) / 1000).toFixed(1) + " s -> ball " + s.ball.x.toFixed(1) + "," + s.ball.z.toFixed(1) + " player " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1)); await sleep(500); await shot("goal-ball-passed-back"); tGoal = Date.now(); }
      const B = s.ball, H = s.hoop;
      // push from the far side of the ball, along the hoop's axis (x)
      const side = B.x < H.x ? 1 : -1;
      const tx = H.x + side * 1.2, tz = H.z;
      let ux = tx - B.x, uz = tz - B.z; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
      const px = s.player.x - B.x, pz = s.player.z - B.z;
      const along = px * ux + pz * uz, lat = Math.abs(px * uz - pz * ux);
      if (along < -0.25 && lat < 0.28) await aimAt(B.x + ux * 2, B.z + uz * 2);
      else if (along > -0.2) { // in front of the ball: go round it
        const sx = -uz, sz = ux, sg = (px * sx + pz * sz) >= 0 ? 1 : -1;
        await aimAt(B.x - ux * 0.9 + sx * sg * 0.9, B.z - uz * 0.9 + sz * sg * 0.9);
      } else await aimAt(B.x - ux * 0.75, B.z - uz * 0.75);
      await down("KeyW");
      if (Date.now() - tGoal > 60000) { fallback("goal: no goal in 60 s (ball " + B.x.toFixed(1) + "," + B.z.toFixed(1) + " player " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1) + ")"); break; }
      await sleep(60);
    }
    await upAll();
    s = await st();
    log("goal: " + s.joy.goals + "/3, joy " + s.joys[1]);
  }
  async function joySun() {
    let r = await walk((x) => x.P.sunRock, { stop: 0.7, timeout: 40000 });
    let s = await st();
    if (r !== "ok") { fallback("sun: could not walk to the sun rock (" + r + ") from " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1)); await tp(s.P.sunRock.x, s.P.sunRock.z); }
    await sleep(500); await shot("sun-prompt"); ground(await st(), "sun rock");
    if (!/Rest/.test((await st()).actionLabel)) fallback("sun: no Rest prompt on the rock");
    await down("KeyE");
    await sleep(1600); await shot("sun-resting-a");
    await sleep(900); await up("KeyE"); await sleep(700); await shot("sun-let-go"); // let go: the count stays for a moment
    await down("KeyE");
    await sleep(2400); await shot("sun-resting-b"); ground(await st(), "resting", false);
    s = await waitFor((x) => x.joys[4] || x.step !== "day", 9000, "sunbathe joy");
    await up("KeyE");
    await sleep(600); await shot("sun-done");
    log("sunbathe: joy " + s.joys[4]);
  }
  async function joySlide() {
    for (let k = 0; k < 2; k++) {
      let s = await st();
      if (s.step !== "day" || s.joys[0]) break;
      let r = await walk((x) => x.P.fallSteps, { stop: 0.8, timeout: 45000 });
      if (k === 0) { await sleep(300); await shot("slide-at-steps"); }
      r = await walk((x) => x.P.fallTop, { stop: 0.5, timeout: 25000, noDetour: true, until: (x) => /Slide/.test(x.actionLabel),
        each: async (x) => { if (x.player.grounded && x.player.y < x.P.fallTop.y - 0.5 && Math.random() < 0.3) await page.keyboard.press("Space"); } });
      s = await st();
      if (!/Slide/.test(s.actionLabel)) {
        fallback("slide " + (k + 1) + ": could not climb to the top of the fall (" + r + ") at " + s.player.x.toFixed(1) + "," + s.player.y.toFixed(1) + "," + s.player.z.toFixed(1) + " top y " + s.P.fallTop.y.toFixed(2));
        await tp(s.P.fallTop.x, s.P.fallTop.z); await sleep(500);
      }
      await sleep(400); await shot("slide-prompt-" + (k + 1)); ground(await st(), "fall top");
      const before = (await st()).joy.slides;
      await page.keyboard.press("KeyE");
      await sleep(500); await shot("slide-" + (k + 1) + "-a");
      await sleep(700); await shot("slide-" + (k + 1) + "-b");
      await sleep(600); await shot("slide-" + (k + 1) + "-c");
      s = await waitFor((x) => x.joy.slides > before || x.joys[0] || x.step !== "day", 8000, "slide end");
      await sleep(500); await shot("slide-" + (k + 1) + "-splashdown"); ground(await st(), "after slide " + (k + 1), false);
    }
    const s = await st();
    log("slide: " + s.joy.slides + "/2, joy " + s.joys[0]);
  }
  async function joyTreasure() {
    let s = await st(), got = s.joy.shinies, shots = 0, under = 0, tOne = Date.now();
    const tEnd = Date.now() + 200000;
    while (Date.now() < tEnd) {
      s = await st();
      if (s.step !== "day" || s.joys[2] || !s.shinies.length) break;
      if (s.joy.shinies !== got) { got = s.joy.shinies; tOne = Date.now(); await up("Space"); if (shots < 3) { shots++; await sleep(250); await shot("treasure-got-" + got); } }
      let best = s.shinies[0], bd = 1e9;
      for (const k of s.shinies) { const d = Math.hypot(k.x - s.player.x, k.z - s.player.z); if (d < bd) { bd = d; best = k; } }
      await aimAt(best.x, best.z);
      if (bd > 0.3) await down("KeyW"); else await up("KeyW");
      if (s.player.swimming && bd < 1.6) await down("Space"); else await up("Space");
      if (s.player.diving && under < 2 && s.player.y < -0.5) { under++; await shot("treasure-diving-" + under); }
      if (s.pip === "treasure" && shots < 3 && under === 1 && bd > 2.5 && s.player.swimming) { under++; await shot("treasure-pip-bubbles"); }
      if (Date.now() - tOne > 40000) { fallback("treasure: shiny " + best.i + " at " + best.x.toFixed(1) + "," + best.y.toFixed(1) + "," + best.z.toFixed(1) + " not reached in 40 s (player " + s.player.x.toFixed(1) + "," + s.player.y.toFixed(1) + "," + s.player.z.toFixed(1) + ")"); await up("Space"); await tp(best.x, best.z); tOne = Date.now(); }
      await sleep(60);
    }
    await upAll();
    s = await st();
    log("treasure: " + s.joy.shinies + "/5, joy " + s.joys[2] + ", coins " + s.coins);
  }
  async function joyPicnic() {
    let s = await st();
    if (s.picnic === 0) s = await waitFor((x) => x.picnic !== 0 || x.step !== "day", 15000, "picnic to start");
    if (s.picnic === 1) {
      await sleep(1500); await shot("picnic-keeper-coming");
      const t = await filmWhile("picnic-keeper", (x) => x.step === "day" && x.picnic === 1, 3500, 60000);
      log("  keeper brought the bowl in " + t.toFixed(1) + " s");
    }
    s = await st();
    if (s.step !== "day" || s.picnic !== 2) { log("picnic: not available (picnic=" + s.picnic + ", step " + s.step + ")"); return; }
    await shot("picnic-bowl-down");
    const r = await walk((x) => x.bowl, { stop: 1.0, timeout: 45000 });
    s = await st();
    if (r !== "ok") { fallback("picnic: could not walk to the bowl (" + r + ") from " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1)); await tp(s.bowl.x + 0.8, s.bowl.z + 0.3); }
    await sleep(500); await shot("picnic-eat-prompt"); ground(await st(), "picnic");
    for (let i = 0; i < 6; i++) {
      s = await st();
      if (s.step !== "day" || s.joys[5]) break;
      await pressWhenFree("KeyE"); await sleep(450);
      if (i < 2) await shot("picnic-eating-" + (i + 1));
      await sleep(900);
    }
    s = await st();
    await sleep(400); await shot("picnic-done");
    log("picnic: bites " + s.joy.bites + "/4, joy " + s.joys[5]);
  }
  async function joyAct() {
    let r = await walk((x) => x.P.showRock, { stop: 0.8, timeout: 45000 });
    let s = await st();
    if (r !== "ok") { fallback("act: could not walk to the show rock (" + r + ") from " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1)); await tp(s.P.showRock.x, s.P.showRock.z, 0); }
    await aimAt(s.player.x, s.player.z + 5); // look at the glass
    await sleep(2600); await shot("act-crowd-gathers"); ground(await st(), "show rock");
    const seq = ["Digit1", "Digit2", "Digit4", "Digit3"]; let i = 0, shots = 0, fpsDone = false;
    const tEnd = Date.now() + 120000;
    while (Date.now() < tEnd) {
      s = await st();
      if (s.step !== "day" || s.joys[3]) break;
      if (s.lock <= 0 && !s.acting) {
        await page.keyboard.press(seq[i % seq.length]); i++;
        if (shots < 5) { shots++; await sleep(420); await shot("act-trick-" + shots); }
        if (!fpsDone && i >= 4) { // the heaviest daytime moment: crowd at the glass, coins flying, both doing tricks
          fpsDone = true;
          let stopFps = false;
          const spam = (async () => { let j = 0; while (!stopFps) { try { const q = await st(); if (q.step === "day" && q.lock <= 0 && !q.acting) await page.keyboard.press(seq[(j++) % 3]); } catch (_) {} await sleep(150); } })();
          await fpsMeasure("day_show"); stopFps = true; await spam;
          s = await st(); log("  show: coins " + s.coins + ", watchers " + s.watchers); await shot("act-after-fps");
        }
      }
      await sleep(120);
    }
    s = await st();
    await sleep(700); await shot("act-done");
    log("double act: coins " + s.coins + ", joy " + s.joys[3] + ", tricks pressed " + i + ", watchers " + s.watchers);
  }
  async function beatDay() {
    let s = await waitFor((x) => x.step === "day" && x.player.enabled && !x.cinema.playing && x.cinema.faded < 0.05, 15000, "day playable");
    await sleep(900); await shot("day-start"); ground(await st(), "day start");
    await sleep(1800); await shot("day-rings");
    const tDay = Date.now();
    // idle: Pip leads the way after 12 s
    s = await waitFor((x) => x.pip === "lead" || x.step !== "day", 20000, "Pip leading after idling");
    await sleep(1500); await shot("day-pip-leads");
    for (const [name, fn] of [["goal", joyGoal], ["sun", joySun], ["slide", joySlide], ["treasure", joyTreasure], ["picnic", joyPicnic], ["act", joyAct], ["picnic", joyPicnic]]) {
      s = await st();
      if (s.step !== "day") break;
      const idx = { slide: 0, goal: 1, treasure: 2, act: 3, sun: 4, picnic: 5 }[name];
      if (s.joys[idx]) continue;
      log("-- joy: " + name + " (day " + s.dayT + " s, joys " + s.joys.filter(Boolean).length + ")");
      await fn();
    }
    s = await st();
    report.joys = s.joys; report.dayCoins = s.coins;
    log("day: joys " + s.joys.map((b) => (b ? 1 : 0)).join("") + " in " + ((Date.now() - tDay) / 1000).toFixed(0) + " s, coins " + s.coins + ", step " + s.step);
    if (s.joys.filter(Boolean).length < 4) fallback("fewer than 4 joys were completed by play");
    if (s.step === "day") { await sleep(1500); await shot("day-all-done"); }
  }
  async function beatBedtime() {
    let s = await waitFor((x) => x.step === "bedtime", 60000, "bedtime");
    await sleep(1200); await shot("bedtime-banner");
    await sleep(6000); await shot("bedtime-dusk");
    const r = await walk((x) => x.P.nest, { stop: 1.3, timeout: 60000 });
    s = await st();
    if (r !== "ok") { fallback("bedtime: could not walk to the nest (" + r + ") from " + s.player.x.toFixed(1) + "," + s.player.z.toFixed(1)); await tp(s.P.nest.x - 0.8, s.P.nest.z + 0.8); }
    await sleep(900); await shot("bedtime-sleep-prompt"); ground(await st(), "nest");
    s = await st();
    if (!/Sleep/.test(s.actionLabel)) fallback("bedtime: no Sleep prompt at the nest");
    await page.keyboard.press("KeyE");
    const t = await filmWhile("sleep", (x) => x.step === "bedtime", 1900, 50000);
    log("falling asleep ran " + t.toFixed(1) + " s");
  }
  async function beatNight() {
    await waitFor((x) => ["alarm", "taken", "leap", "still"].includes(x.step), 15000, "the alarm");
    let tried = false, g = 0;
    const t = await filmWhile("night", (x) => ["alarm", "taken", "leap", "still"].includes(x.step), 2100, 150000, async (x) => {
      if (!tried && x.step === "taken") { // first time: it must NOT be skippable
        tried = true;
        if (!x.progress.beaten[4]) { await holdEnter(); const y = await st(); if (!["taken", "leap"].includes(y.step)) fallback("the night cutscene was skipped before the level was ever beaten"); else log("  hold-Enter did not skip the night (correct, not beaten yet)"); }
      }
      if (x.step === "still" && g < 1) { g++; log("  still: Pip y-floor=" + (x.friend.gy - x.friend.floor).toFixed(2) + " at " + x.friend.x.toFixed(1) + "," + x.friend.z.toFixed(1) + " beh " + x.friend.beh); }
    });
    log("night cutscene ran " + t.toFixed(1) + " s");
  }
  async function beatHope() {
    await waitFor((x) => x.step === "wizard" || x.step === "reveal", 15000, "the wizard");
    const t = await filmWhile("hope", (x) => x.step === "wizard" || x.step === "reveal", 1900, 80000);
    log("wizard + reveal ran " + t.toFixed(1) + " s");
  }
  async function beatSlap() {
    let s = await waitFor((x) => x.step === "slap" && x.player.enabled && !x.cinema.playing, 20000, "slap playable");
    await sleep(500); await shot("slap-start"); ground(await st(), "ledge spawn");
    await talk("slap", 15000);
    await sleep(400); await shot("slap-objective");
    // a slap from too far away: the hint
    s = await st();
    const far = Math.hypot(s.LP.dummy.x - s.player.x, s.LP.dummy.z - s.player.z);
    if (far > 1.6) { await page.keyboard.press("KeyL"); await sleep(600); await shot("slap-too-far"); await sleep(700); }
    const r = await walk((x) => x.LP.dummy, { stop: 1.0, timeout: 20000, noJump: true });
    if (r !== "ok") fallback("slap: could not walk to the dummy (" + r + ")");
    await sleep(300); ground(await st(), "at the dummy");
    for (let i = 0; i < 6; i++) {
      s = await st();
      if (s.slaps >= 3 || s.step !== "slap") break;
      await waitFor((x) => x.lock <= 0, 4000, "slap ready");
      if (i === 1) { await page.mouse.click(640, 250); } else await page.keyboard.press("KeyL"); // one by left click
      await sleep(300); await shot("slap-hit-" + (i + 1));
      await sleep(850);
    }
    s = await st();
    log("slap: " + s.slaps + "/3 (walked from " + far.toFixed(1) + " m)");
    if (s.slaps < 3) fallback("slap: only " + s.slaps + " of 3 slaps landed");
    await sleep(500); await shot("slap-dummy-down");
  }
  async function beatHold() {
    let s = await waitFor((x) => x.step === "hold" && x.holdSub === "pick" && x.player.enabled && !x.cinema.playing, 20000, "hold playable");
    await talk("hold", 15000);
    await sleep(300); await shot("hold-objective");
    let r = await walk((x) => x.cush, { stop: 0.9, timeout: 20000, noJump: true });
    if (r !== "ok") fallback("hold: could not walk to the cushion (" + r + ")");
    await sleep(400); await shot("hold-pickup-prompt");
    s = await st(); if (!/Pick/.test(s.actionLabel)) fallback("hold: no Pick up prompt next to the cushion");
    await page.keyboard.press("KeyH");
    s = await waitFor((x) => x.cushion === "held", 3000, "cushion held");
    await sleep(500); await shot("hold-holding");
    await talk("hold-carry", 8000);
    // drop it in the wrong place
    s = await st();
    if (Math.hypot(s.LP.dropRing.x - s.player.x, s.LP.dropRing.z - s.player.z) > 2.2) {
      await pressWhenFree("KeyH"); await sleep(700); await shot("hold-dropped-wrong-place");
      s = await st(); if (s.holdSub !== "carry") fallback("hold: a drop away from the ring moved on to " + s.holdSub);
      await sleep(600);
      r = await walk((x) => x.cush, { stop: 0.9, timeout: 10000, noJump: true });
      await page.mouse.click(640, 250, { button: "right" }); // right click picks up too
      s = await waitFor((x) => x.cushion === "held", 3000, "cushion held again (right click)").catch(() => null);
      if (!s) { fallback("hold: right click did not pick the cushion up"); await page.keyboard.press("KeyH"); await sleep(400); }
    }
    r = await walk((x) => x.LP.dropRing, { stop: 0.5, timeout: 25000, noJump: true });
    if (r !== "ok") fallback("hold: could not carry the cushion to the ring (" + r + ")");
    await sleep(300); await shot("hold-in-ring"); ground(await st(), "carrying in the ring");
    await pressWhenFree("KeyH");
    s = await waitFor((x) => x.holdSub === "throw", 3000, "drop in the ring accepted");
    await sleep(800); await shot("hold-dropped-in-ring");
    await talk("hold-throw", 8000);
    // pick it up again, walk AWAY from the dummy, and throw from far (a miss if it can miss), then from close
    for (let attempt = 0; attempt < 5; attempt++) {
      s = await st();
      if (s.step !== "hold" || s.holdSub !== "throw") break;
      await waitFor((x) => x.cush.state === "ground" || x.holdSub !== "throw", 6000, "cushion at rest");
      r = await walk((x) => x.cush, { stop: 0.9, timeout: 15000, noJump: true, until: (x) => x.holdSub !== "throw" });
      await pressWhenFree("KeyH");
      s = await waitFor((x) => x.cushion === "held" || x.holdSub !== "throw", 3000, "cushion held for the throw");
      if (s.holdSub !== "throw") break;
      if (attempt === 0) {
        const D = s.LP.dummy, a = Math.atan2(s.player.x - D.x, s.player.z - D.z);
        const fx = Math.max(-5.5, Math.min(5.5, D.x + Math.sin(a) * 7)), fz = Math.max(-3.8, Math.min(3.8, D.z + Math.cos(a) * 7));
        await walk(() => ({ x: fx, z: fz }), { stop: 0.6, timeout: 7000, noJump: true });
        await sleep(300); await shot("hold-throw-objective");
      } else {
        await walk((x) => x.LP.dummy, { stop: 2.6, timeout: 10000, noJump: true });
      }
      s = await st();
      const d = Math.hypot(s.LP.dummy.x - s.player.x, s.LP.dummy.z - s.player.z);
      await waitFor((x) => x.lock <= 0, 3000, "ready to throw");
      await page.mouse.click(640, 250);
      await sleep(330); await shot("hold-throw-" + (attempt + 1));
      await sleep(1500);
      s = await st();
      log("  throw " + (attempt + 1) + " from " + d.toFixed(1) + " m -> " + (s.holdSub === "throw" ? "miss" : "HIT"));
      if (s.holdSub === "throw") { await shot("hold-missed-" + (attempt + 1)); await talk("hold-miss", 6000); }
    }
    s = await st();
    if (s.step === "hold" && s.holdSub === "throw") fallback("hold: five throws did not hit the dummy");
    await shot("hold-bullseye");
  }
  async function beatEnd() {
    await waitFor((x) => x.step === "end" || x.step === "done", 10000, "the last words");
    await sleep(600); await shot("end-start");
    await talk("end", 20000);
    const t = await filmWhile("end", (x) => x.mode === "level" && (x.step === "end" || x.step === "done"), 1500, 30000);
    log("ending ran " + t.toFixed(1) + " s after the last line");
  }
  async function backToMenu(label) {
    const s = await waitFor((x) => x.mode === "menu", 30000, "main screen " + label);
    if (s.running) throw new Error("the level is still running behind the main screen");
    return s;
  }
  const enterLevel = async (label) => {
    await page.evaluate(() => { window.__platy.startLevel(5); });
    return waitFor((x) => x.mode === "level" && x.levelN === 5 && x.step === "intro", 40000, label);
  };

  let s;
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
    const gpu = await page.evaluate(() => { const gl = window.__platy.renderer.getContext(); const e = gl.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; });
    log("gpu: " + gpu);
    await page.evaluate(() => { window.__platy.resetProgress(); window.__platy.unlock(5); });
    await sleep(500);
    await shot("menu");
    if (await page.evaluate(() => document.getElementById("lvl5").classList.contains("locked"))) throw new Error("level 5 is locked after unlock(5)");

    if (!EXTRAS) {
      await page.click("#lvl5");
      s = await waitFor((x) => x.mode === "level" && x.levelN === 5, 40000, "level 5 running");
      const beats = [["intro", beatIntro], ["day", beatDay], ["bedtime", beatBedtime], ["night", beatNight], ["hope", beatHope], ["slap", beatSlap], ["hold", beatHold], ["end", beatEnd]];
      const first = ONLY || FROM || "intro";
      if (first !== "intro") { await sleep(1500); const ok = await page.evaluate((b) => window.__platy.skipTo(b), SKIP[first]); if (!ok) throw new Error("skipTo " + first + " failed"); }
      for (const [name, fn] of beats) {
        if (reached(name) < reached(first)) continue;
        if (ONLY && name !== ONLY) break;
        log("== " + name);
        await fn();
        await upAll();
      }
      if (ONLY && ONLY !== "end") { await shot("only-end"); }
      else {
        s = await backToMenu("after TO BE CONTINUED");
        if (!s.progress.beaten[4]) throw new Error("level 5 is not marked beaten: " + JSON.stringify(s.progress));
        await sleep(1500); await shot("menu-level5-beaten");
        const tick = await page.evaluate(() => { const b = document.getElementById("lvl5"); return { cls: b.className, disabled: b.disabled }; });
        log("level complete -> main screen; level 5 button: " + JSON.stringify(tick) + ", progress " + JSON.stringify(s.progress));
        if (!/beaten|done/.test(tick.cls)) fallback("the level 5 circle does not show as beaten (class '" + tick.cls + "')");
        report.completed = true;
      }
    }

    if ((!ONLY && !FROM && !PLAY) || EXTRAS) {
      await page.evaluate(() => { const p = window.__platy.progress; if (!p.isBeaten(5)) p.beat(5); });
      // ---- replay (level beaten): hold-to-skip every cutscene
      await page.click("#lvl5");
      await waitFor((x) => x.mode === "level" && x.levelN === 5 && x.step === "intro" && x.cinema.playing, 40000, "replay intro");
      await sleep(1500); await holdEnter();
      s = await waitFor((x) => x.step === "day" && x.player.enabled && x.cinema.faded < 0.05, 12000, "day after skipping the intro");
      await sleep(600); await shot("replay-skipped-intro"); ground(await st(), "after skipping the intro");
      await page.evaluate(() => window.__platy.skipTo("bedtime"));
      s = await waitFor((x) => x.step === "bedtime" && x.player.enabled, 8000, "skipTo bedtime");
      await sleep(1500); await shot("replay-skipTo-bedtime"); ground(await st(), "skipTo bedtime");
      await tp(s.P.nest.x - 0.9, s.P.nest.z + 0.9); await sleep(400);
      await page.keyboard.press("KeyE");
      await waitFor((x) => x.cinema.playing, 5000, "sleep cutscene");
      await sleep(2500); await holdEnter();
      s = await waitFor((x) => x.step === "alarm" || x.step === "taken", 12000, "alarm after skipping the sleep");
      await sleep(5000); await holdEnter(); // beaten once: the night may be skipped
      s = await waitFor((x) => x.step === "wizard", 12000, "wizard after skipping the night");
      await sleep(4000); await shot("replay-skipped-night-wizard");
      await holdEnter();
      s = await waitFor((x) => x.step === "slap", 15000, "slap after skipping the wizard");
      await sleep(600); await holdEnter();
      s = await waitFor((x) => x.step === "slap" && x.player.enabled && !x.cinema.playing, 15000, "slap playable after skips");
      await sleep(1500); await shot("replay-skipped-to-slap"); ground(await st(), "after all skips");
      log("replay: hold-to-skip (intro, sleep, night, hope, training intro) ok");

      // ---- skipTo chain, one shot each
      for (const b of ["day", "taken", "leap", "still", "reveal", "hold", "end", "slap", "alarm", "wizard", "bedtime", "hold", "day"]) {
        const ok = await page.evaluate((x) => window.__platy.skipTo(x), b);
        await sleep(2600);
        s = await st();
        if (!ok) throw new Error("skipTo " + b + " failed");
        await shot("skipTo-" + b);
        if (b === "day" || b === "bedtime" || b === "hold" || b === "slap") ground(s, "skipTo " + b);
      }
      log("skipTo chain ok");

      // ---- fps in the heavy cutscene moments (no screenshots while measuring)
      const stage = async (b, pred, extra) => { await page.evaluate((x) => window.__platy.skipTo(x), b); await waitFor(pred, 30000, "fps stage " + b); if (extra) await sleep(extra); };
      await stage("alarm", (x) => x.step === "alarm" && x.cinema.faded < 0.5, 500);
      await fpsMeasure("night_alarm", () => stage("alarm", (x) => x.step === "alarm" && x.cinema.faded < 0.5, 500));
      await stage("taken", (x) => x.step === "taken" && x.cinema.faded < 0.3, 2500);
      await fpsMeasure("night_taken", () => stage("taken", (x) => x.step === "taken" && x.cinema.faded < 0.3, 2500));
      await stage("leap", (x) => x.step === "leap" && x.cinema.faded < 0.3, 300);
      await fpsMeasure("night_leap_glass", () => stage("leap", (x) => x.step === "leap" && x.cinema.faded < 0.3, 300));
      await stage("reveal", (x) => x.step === "reveal" && x.cinema.faded < 0.5, 300);
      await fpsMeasure("lair_reveal", () => stage("reveal", (x) => x.step === "reveal" && x.cinema.faded < 0.5, 300));
      await stage("hold", (x) => x.step === "hold" && x.player.enabled && !x.cinema.playing, 500);
      await down("KeyW"); await down("KeyD");
      await fpsMeasure("lair_training");
      await upAll();

      // ---- quit mid-night and re-enter: must be clean
      await page.evaluate(() => window.__platy.skipTo("leap"));
      await sleep(4000);
      await page.evaluate(() => window.__platy.quit());
      await backToMenu("after quitting mid-leap");
      await sleep(600); await shot("menu-after-quit");
      s = await enterLevel("re-entry");
      await page.evaluate(() => window.__platy.skipTo("day"));
      s = await waitFor((x) => x.step === "day" && x.player.enabled && x.cinema.faded < 0.05, 12000, "day after re-entry");
      await sleep(800); await shot("reentry-day"); ground(await st(), "re-entry");
      if (s.coins !== 0 || s.timeScale !== 1 || s.joys.some(Boolean)) throw new Error("re-entry is not clean: " + JSON.stringify({ coins: s.coins, ts: s.timeScale, joys: s.joys }));
      const leftovers = await page.evaluate(() => { const c = document.getElementById("cine"); return c ? Array.from(c.children).filter((e) => getComputedStyle(e).opacity > 0.05 && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 2).map((e) => e.id || e.className) : []; });
      log("re-entry: visible cinema overlays " + JSON.stringify(leftovers));
      // win() from the middle of the night
      await page.evaluate(() => window.__platy.skipTo("taken"));
      await sleep(3000);
      await page.evaluate(() => window.__platy.win());
      await sleep(1500); await shot("win-card");
      await backToMenu("after win()");
      log("quit mid-leap, re-entry, win() ok");

      // ---- phone portrait
      await page.evaluate(() => { document.body.classList.add("touch"); });
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true });
      await sleep(600);
      await page.evaluate(() => { document.body.classList.add("touch"); });
      await enterLevel("phone level");
      for (const [b, wait] of [["day", 3200], ["bedtime", 3000], ["alarm", 9000], ["taken", 13000], ["leap", 7000], ["still", 5000], ["wizard", 8000], ["reveal", 9000], ["slap", 4500], ["hold", 4500], ["end", 3500]]) {
        await page.evaluate((x) => window.__platy.skipTo(x), b);
        await sleep(wait);
        if (b === "day") { s = await st(); await tp(s.P.showRock.x, s.P.showRock.z, 0); await sleep(2500); await page.keyboard.press("Digit2"); await sleep(600); }
        await shot("phone-portrait-" + b);
      }
      // phone landscape
      await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, hasTouch: true });
      await sleep(600);
      for (const [b, wait] of [["day", 3200], ["leap", 7000], ["reveal", 9000], ["hold", 4500]]) {
        await page.evaluate((x) => window.__platy.skipTo(x), b);
        await sleep(wait);
        await shot("phone-landscape-" + b);
      }
      await page.evaluate(() => window.__platy.win());
      await backToMenu("after the phone run");
      await page.evaluate(() => { document.body.classList.remove("touch"); window.__platy.resetProgress(); });
      log("phone shots ok");
    }
    report.maxCalls = maxCalls; report.maxTris = maxTris;
    log("max draw calls seen " + maxCalls + " (in " + maxWhere + "), max triangles " + maxTris);
    if (maxCalls > 150) throw new Error("draw call budget exceeded: " + maxCalls);
    if (maxTris > 250000) throw new Error("triangle budget exceeded: " + maxTris);
    for (const k of Object.keys(report)) if (k.startsWith("fps_") && report[k].fps < 55) throw new Error(k + " " + report[k].fps.toFixed(1) + " < 55");
    if (report.fallbacks.length) throw new Error(report.fallbacks.length + " check(s) failed, see FALLBACK lines");
    report.ok = true;
  } catch (e) {
    report.ok = false;
    report.failure = String(e && e.stack || e);
    console.log("FAILED: " + report.failure);
    try { await upAll(); await shot("failure"); console.log(JSON.stringify(await st())); } catch (_) {}
  }

  // contact sheets (2 x 2) so the shots are quick to review
  try {
    const sp = await browser.newPage();
    await sp.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    const files = report.shots.filter((f) => fs.existsSync(f));
    for (let i = 0, k = 1; i < files.length; i += 4, k++) {
      const cells = files.slice(i, i + 4).map((f) => "<div><img src='data:image/png;base64," + fs.readFileSync(f).toString("base64") + "'><span>" + path.basename(f, ".png") + "</span></div>").join("");
      await sp.setContent("<style>body{margin:0;background:#222;display:grid;grid-template-columns:640px 640px;grid-auto-rows:360px}div{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}img{max-width:640px;max-height:360px}span{position:absolute;left:4px;top:2px;font:bold 13px monospace;color:#ff0;text-shadow:0 0 3px #000,0 0 3px #000}</style>" + cells, { waitUntil: "load" });
      await sp.screenshot({ path: path.join(SHOTS, "l5-sheet-" + String(k).padStart(2, "0") + ".png") });
    }
  } catch (e) { console.log("contact sheets failed: " + e); }

  await browser.close();
  srv.close();
  fs.writeFileSync(path.join(SHOTS, "l5-report.json"), JSON.stringify(report, null, 2));
  console.log("fallbacks: " + report.fallbacks.length);
  for (const f of report.fallbacks) console.log("  " + f);
  console.log("errors: " + errors.length);
  for (const e of errors.slice(0, 30)) console.log("  " + e.slice(0, 600));
  console.log(report.ok ? "PLAYTEST-L5 OK" : "PLAYTEST-L5 FAILED");
  process.exit(report.ok && errors.length === 0 ? 0 : 1);
})();
