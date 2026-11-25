// audiocheck.cjs - BONUS_AUDIO's browser verification (ONE headless browser, holds tools/browserlock.cjs).
// Not picked up by tools/bonustest.mjs (that runs *.mjs only). Run:  node tools/bonustests/audiocheck.cjs [--quick]
//  1. songs: renders homestead_day + homestead_night offline through the real engine (whole arrangement + 6 s past the
//     loop point): peak after the limiter and raw, RMS, quietest second, 100 ms dropouts, loop seam, voice stats.
//  2. sfx: renders every sound in sfx.js with representative options through the same chain the game uses (kit +
//     reverb -> sfx gain -> bus at FULL volume -> compressor), each in its own OfflineAudioContext: peak + RMS.
//  3. ambience: 14 s offline renders of six scenes (forest day, meadow dawn, night by the river, cave, campfire, hills).
//  4. live: boots ?bonus=1&debug, checks the day song plays, setTime("night") crossfades to the night song, events make
//     sound (stats), every sound plays live without errors, leaving the bonus stops its music.
const http = require("http");
const fs = require("fs");
const path = require("path");
const lock = require("../browserlock.cjs");
const puppeteer = require(path.join(__dirname, "..", "..", "..", "node_modules", "puppeteer"));

const GAME = path.join(__dirname, "..", "..");
const SITE = path.join(GAME, "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const QUICK = process.argv.includes("--quick");

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p === "/adventure-cube/__audiotest.html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<!doctype html><meta charset=utf-8><title>bonus audio test</title><body>bonus audio test</body>"); return; }
      if (p.endsWith("favicon.ico")) { res.writeHead(204); res.end(); return; }
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
  await lock.acquire("adventure-cube bonus audiocheck");
  const keep = setInterval(() => lock.touch && lock.touch(), 20000);
  const srv = await serve();
  const base = "http://127.0.0.1:" + srv.address().port + "/adventure-cube/";
  let browser, fails = 0;
  const errors = [];
  const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; return c; };
  try {
    browser = await puppeteer.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push("pageerror: " + (e.stack || e.message || e)));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
    await page.goto(base + "__audiotest.html");
    await page.evaluate(() => {
      window.analyze = (buf, loopAt) => {
        const sr = buf.sampleRate, n = buf.length, ch = [];
        for (let c = 0; c < buf.numberOfChannels; c++) ch.push(buf.getChannelData(c));
        let peak = 0, nan = 0, sum = 0, clip = 0, acc = 0;
        const wins = [];
        for (let i = 0; i < n; i++) {
          let m = 0, e = 0;
          for (const d of ch) { const a = d[i]; if (!(a === a)) { nan++; continue; } m = Math.max(m, Math.abs(a)); e += a * a; }
          e /= ch.length;
          if (m > peak) peak = m;
          if (m >= 0.999) clip++;
          sum += e; acc += e;
          if ((i + 1) % sr === 0) { wins.push(Math.sqrt(acc / sr)); acc = 0; }
        }
        const db = (x) => (x > 0 ? 20 * Math.log10(x) : -999);
        let minW = Infinity, minAt = 0;
        wins.forEach((w, i) => { if (i >= 1 && w < minW) { minW = w; minAt = i; } });
        let gaps = 0, run = 0; const g = Math.floor(sr * 0.1);
        for (let i = sr; i < n; i++) { let m = 0; for (const d of ch) m = Math.max(m, Math.abs(d[i])); if (m < 0.0005) { if (++run === g) gaps++; } else run = 0; }
        let seam = null;
        if (loopAt) {
          const at = Math.floor(loopAt * sr), rms = (a, b) => { let s = 0; for (let i = a; i < b; i++) for (const d of ch) s += d[i] * d[i] / ch.length; return Math.sqrt(s / (b - a)); };
          seam = { before: db(rms(at - sr, at)), after: db(rms(at, at + sr)), edge: db(rms(at - Math.floor(sr * 0.05), at + Math.floor(sr * 0.05))) };
        }
        return { seconds: n / sr, peak, peakDb: db(peak), rmsDb: db(Math.sqrt(sum / n)), minWinDb: db(minW === Infinity ? 0 : minW), minAt, gaps, clip, nan, seam };
      };
    });

    // ---------------------------------------------------------------- 1. songs
    for (const file of ["homestead_day", "homestead_night"]) {
      const r = await page.evaluate(async (file, QUICK) => {
        const E = await import("./src/audio/engine.js"), F = await import("./src/audio/format.js");
        const song = (await import("./src/bonus/audio/songs/" + file + ".js")).default;
        const v = F.validateSong(song, song.id);
        const seconds = v.seconds + 6, sr = QUICK ? 22050 : 44100, t0 = performance.now();
        const A = await E.renderOffline(song, { seconds, sampleRate: sr });
        const ms = performance.now() - t0;
        const a = window.analyze(A.buffer, v.seconds);
        let raw = null;
        if (!QUICK) { const B = await E.renderOffline(song, { seconds, sampleRate: 22050, raw: true }); raw = window.analyze(B.buffer, 0); }
        return { id: song.id, title: song.title, total: v.seconds, loop: v.loopSeconds, ms, a, raw, st: A.stats };
      }, file, QUICK);
      const a = r.a, st = r.st;
      console.log(`\n${r.id} "${r.title}": ${r.total.toFixed(1)} s (loop ${r.loop.toFixed(1)} s), rendered in ${(r.ms / 1000).toFixed(1)} s`);
      console.log(`  limited: peak ${a.peak.toFixed(3)} (${a.peakDb.toFixed(1)} dBFS)  rms ${a.rmsDb.toFixed(1)} dB  quietest 1s ${a.minWinDb.toFixed(1)} dB @${a.minAt}s  gaps ${a.gaps}  clipped ${a.clip}  NaN ${a.nan}`);
      if (r.raw) console.log(`  raw mix: peak ${r.raw.peak.toFixed(3)} (${r.raw.peakDb.toFixed(1)} dBFS)  rms ${r.raw.rmsDb.toFixed(1)} dB`);
      console.log(`  loop seam: before ${a.seam.before.toFixed(1)} dB  after ${a.seam.after.toFixed(1)} dB  +-50ms ${a.seam.edge.toFixed(1)} dB`);
      console.log(`  engine: ${st.notes} notes, max voices ${st.maxVoices}, dropped ${st.dropped}`);
      ok(a.nan === 0, `${r.id}: no NaN`);
      ok(a.rmsDb > -40, `${r.id}: non-silent (rms ${a.rmsDb.toFixed(1)} dB)`);
      ok(a.peak < 1.0 && a.clip === 0, `${r.id}: peak < 1.0 (${a.peak.toFixed(3)})`);
      if (r.raw) ok(r.raw.peak < 1.0, `${r.id}: raw (pre-limiter) peak < 1.0 (${r.raw.peak.toFixed(3)})`);
      ok(a.gaps === 0, `${r.id}: no 100 ms dropouts`);
      ok(a.seam.after > a.seam.before - 12 && a.seam.edge > -45, `${r.id}: seamless loop`);
      ok(st.dropped === 0, `${r.id}: no voices dropped`);
      ok(r.loop >= 90, `${r.id}: loop >= 90 s`);
    }

    // ---------------------------------------------------------------- 2. sfx
    const sx = await page.evaluate(async () => {
      const X = await import("./src/bonus/audio/sfx.js"), D = await import("./src/audio/dsp.js");
      const OPTS = {
        chop: [{ kind: "oak" }, { kind: "ancient", k: 0.9 }], dig: [{ mat: "dirt" }, { mat: "sand" }, { mat: "clay" }, { mat: "gravel" }],
        pick: [{ ore: 0 }, { ore: 2 }, { ore: 4 }], crumble_stone: [{ ore: 0 }, { ore: 4 }], swing: [{ kind: "hand" }, { kind: "blade", tier: 4 }, { kind: "heavy" }, { kind: "bow" }],
        howl: [{ pack: true }], hurt: [{ dmg: 18 }], land: [{ impact: 12 }], pickup: [{ rare: true, pitch: 1.6 }], eat: [{ raw: false }, { raw: true }], ram: [{ big: true }],
      };
      const sr = 44100, out = [];
      for (const name of X.SOUND_NAMES) {
        const S = X.SOUNDS[name];
        for (const o of OPTS[name] || [{}]) {
          const sec = S.len + 1.8, oc = new OfflineAudioContext(2, Math.ceil(sec * sr), sr);
          // the game's chain at FULL volume: sounds -> sfxG 1.2 -> bus 1.0 -> compressor -> out (+ reverb send 0.6)
          const bus = oc.createGain(), comp = oc.createDynamicsCompressor();
          comp.threshold.value = -8; comp.knee.value = 6; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.15;
          bus.connect(comp); comp.connect(oc.destination);
          const sfxG = oc.createGain(); sfxG.gain.value = 1.2; sfxG.connect(bus);
          const cv = oc.createConvolver(), ir = D.impulse(sr, 1.6, { damp: 0.55, seed: 23 }), b = oc.createBuffer(2, ir[0].length, sr);
          b.getChannelData(0).set(ir[0]); b.getChannelData(1).set(ir[1]); cv.buffer = b;
          const rev = oc.createGain(); rev.gain.value = 0.6; rev.connect(cv); cv.connect(bus);
          const K = X.makeKit(oc, rev), g = oc.createGain(); g.connect(sfxG);
          S.play(K, g, 0.02, o);
          const buf = await oc.startRendering();
          const a = window.analyze(buf, 0);
          out.push({ name: name + (Object.keys(o).length ? "(" + Object.entries(o).map(([k, v]) => k + "=" + v).join(",") + ")" : ""), peak: a.peak, rms: a.rmsDb, nan: a.nan });
        }
      }
      return out;
    });
    console.log("\nsfx (full volume, after the bonus compressor): peak / rms dB");
    for (let i = 0; i < sx.length; i += 4) console.log("  " + sx.slice(i, i + 4).map((s) => `${s.name} ${s.peak.toFixed(2)}/${s.rms.toFixed(0)}`).join("   "));
    const loudest = sx.reduce((a, b) => (b.peak > a.peak ? b : a)), quietest = sx.reduce((a, b) => (b.peak < a.peak ? b : a));
    console.log(`  ${sx.length} renders; loudest ${loudest.name} ${loudest.peak.toFixed(3)}, quietest ${quietest.name} ${quietest.peak.toFixed(3)}`);
    ok(sx.every((s) => s.nan === 0), "sfx: no NaN");
    ok(sx.every((s) => s.peak > 0.01), "sfx: every sound audible (peak > 0.01): " + sx.filter((s) => s.peak <= 0.01).map((s) => s.name).join(", "));
    ok(sx.every((s) => s.peak < 1.0), "sfx: every sound peak < 1.0: " + sx.filter((s) => s.peak >= 1).map((s) => s.name).join(", "));

    // ---------------------------------------------------------------- 3. ambience
    const am = await page.evaluate(async () => {
      const X = await import("./src/bonus/audio/sfx.js"), A = await import("./src/bonus/audio/ambience.js");
      const base = { day: 0, night: 0, dawn: 0, cave: 0, river: 0, fire: 0, trees: 0.45, high: 0, biome: "meadow", underwater: false };
      const scenes = {
        forest_day: { day: 1, trees: 1, biome: "forest" },
        meadow_dawn: { day: 0.6, night: 0.4, dawn: 1 },
        river_night: { night: 1, river: 1, trees: 0.45, biome: "river" },
        cave: { cave: 1, night: 0.5, day: 0.5 },
        campfire_night: { night: 1, fire: 1 },
        hills_day: { day: 1, high: 1, trees: 0.25, biome: "hills" },
      };
      const sr = 22050, sec = 14, out = {};
      for (const [name, sc] of Object.entries(scenes)) {
        const m = Object.assign({}, base, sc);
        const oc = new OfflineAudioContext(2, sr * sec, sr), bus = oc.createGain(); bus.gain.value = 0.72; bus.connect(oc.destination);
        const ambG = oc.createGain(); ambG.gain.value = 0.8; ambG.connect(bus);
        const rev = oc.createGain(); rev.gain.value = 0; rev.connect(bus);
        const K = X.makeKit(oc, rev), amb = A.createAmbience(oc, ambG, K);
        for (let t = 0.1; t < sec - 0.2; t += 0.1) oc.suspend(t).then(() => { amb.update(0.1, m); oc.resume(); });
        amb.update(0.1, m);
        const buf = await oc.startRendering();
        out[name] = window.analyze(buf, 0);
      }
      return out;
    });
    console.log("\nambience (14 s, default volume):");
    for (const [n, a] of Object.entries(am)) {
      console.log(`  ${n.padEnd(15)} peak ${a.peak.toFixed(3)}  rms ${a.rmsDb.toFixed(1)} dB  quietest 1s ${a.minWinDb.toFixed(1)} dB`);
      ok(a.nan === 0 && a.rmsDb > -60 && a.peak < 1.0, `ambience ${n}: audible bed, peak < 1.0`);
    }

    // ---------------------------------------------------------------- 4. live in the game
    await page.goto(base + "?bonus=1&debug&new&seed=1234", { waitUntil: "load" });
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) { const s = await page.evaluate(() => window.__cube && window.__cube.bonus && window.__cube.bonus.state()).catch(() => null); if (s && s.active && s.frame > 20) break; await sleep(150); }
    await page.mouse.click(5, 5); // a user gesture (unlocks audio)
    await page.evaluate(() => { const B = window.__cube.bonus; B.closePanel && B.closePanel(); window.__cube.app && window.__cube.app.audio && window.__cube.app.audio.unlock(); });
    await sleep(2500);
    const live = await page.evaluate(async () => {
      const B = window.__cube.bonus, A = B.ctx.audio, app = B.ctx.app, s = {};
      s.ctx = app.audio.context && app.audio.context.state;
      s.song1 = app.audio.currentSong;
      B.setTime("night");
      await new Promise((r) => setTimeout(r, 1500));
      s.song2 = app.audio.currentSong;
      B.setTime("day");
      await new Promise((r) => setTimeout(r, 1500));
      s.song3 = app.audio.currentSong;
      // drive a few real events: chop the nearest tree for 3 s
      const tr = B.nearestTree();
      if (tr) { B.teleport(tr.x - 1); B.setInput(8, { tx: tr.x, ty: tr.y - 1 }); await new Promise((r) => setTimeout(r, 3000)); B.setInput(null); }
      s.afterChop = A.stats();
      // every sound once, live
      let okN = 0;
      const names = A.SOUND_NAMES;
      for (const n of names) { A.play(n, {}); okN++; await new Promise((r) => setTimeout(r, 15)); }
      s.played = okN; s.names = names.length;
      await new Promise((r) => setTimeout(r, 2500));
      s.final = A.stats();
      return s;
    });
    console.log(`\nlive: context ${live.ctx}, songs ${live.song1} -> (night) ${live.song2} -> (day) ${live.song3}`);
    console.log(`  after chopping: ${JSON.stringify(live.afterChop)}`);
    console.log(`  final: ${JSON.stringify(live.final)}`);
    ok(live.ctx === "running", "live: audio context running");
    ok(live.song1 === "homestead_day", "live: the day song plays at the start of a new world");
    ok(live.song2 === "homestead_night", "live: night crossfades to the night song");
    ok(live.song3 === "homestead_day", "live: day returns to the day song");
    ok(live.afterChop.played > 3, "live: chopping makes sounds (" + live.afterChop.played + ")");
    ok(live.final.baked > 0, "live: frequent sounds were baked into buffers (" + live.final.baked + ")");
    ok(live.played === live.names, "live: every sound played without throwing");
    // leaving the bonus stops its music
    const left = await page.evaluate(async () => {
      const app = window.__cube.app;
      window.__cube.show("title");
      await new Promise((r) => setTimeout(r, 500));
      return app.audio.currentSong;
    });
    ok(left !== "homestead_day" && left !== "homestead_night", "live: leaving the bonus stops its song (now " + left + ")");
  } catch (e) {
    console.log("FAIL exception: " + (e.stack || e));
    fails++;
  } finally {
    clearInterval(keep);
    if (browser) await browser.close();
    lock.release();
    srv.close();
  }
  if (errors.length) { console.log("\npage errors:"); errors.forEach((e) => console.log("  " + e)); fails += errors.length; }
  console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
  process.exit(fails ? 1 : 0);
})();
