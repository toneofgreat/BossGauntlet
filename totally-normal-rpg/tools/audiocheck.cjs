// audiocheck.cjs - AUDIO verification in ONE headless browser (holds the shared browserlock).
//   node tools/audiocheck.cjs            every track + sting + sfx + loop, then a live API smoke test
//   node tools/audiocheck.cjs title girl only those tracks (stings/sfx/live still run)
//   --quick                              22050 Hz, shorter renders
//   --wav                                also write tools/shots/audio/<id>.wav for listening
// Each track is rendered with OfflineAudioContext through the real mix graph (with the master limiter) and again
// raw (no limiter). Checks: finite samples, not silent (RMS floor per track), no clipping after the limiter, no long
// dropouts inside music, raw headroom. Exit code 1 on any failure.
const http = require("http");
const fs = require("fs");
const path = require("path");
let lock;
try { lock = require("./browserlock.cjs"); } catch (e) { lock = require("../../adventure-cube/tools/browserlock.cjs"); }
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const SITE = path.resolve(__dirname, "../..");
const args = process.argv.slice(2);
const QUICK = args.includes("--quick");
const WAV = args.includes("--wav");
const only = args.filter((a) => !a.startsWith("--"));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css" };
const AMBIENT = new Set(["desert", "forestQuiet", "house"]);
const SPARSE = new Set(["title", "title_ng", "redTitle", "forestCreep", "king", "king_ng", "girl", "desert", "forestQuiet", "house"]);

const PAGE = `<!doctype html><meta charset=utf-8><title>audiocheck</title><body>audiocheck
<script type="module">
import { renderOffline } from "./src/audio/music.js";
import { TRACKS, TRACK_IDS, STING_IDS } from "./src/audio/tracks.js";
import { SFX_IDS, LOOPS } from "./src/audio/sfx.js";
import * as Audio from "./src/audio/index.js";
window.A = { renderOffline, TRACKS, TRACK_IDS, STING_IDS, SFX_IDS, LOOP_IDS: Object.keys(LOOPS), Audio };
window.loopSeconds = (id) => { const d = TRACKS[id]; const spb = d.spb || 4, n = (d.stepsPerBar || 16) * (d.bars || 1); return n * 60 / (d.bpm * (d.ng ? 0.92 : 1)) / spb + (d.intro ? 3 : 0); };
window.analyze = (buf, skip = 0) => {
  const sr = buf.sampleRate, L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
  let peak = 0, nan = 0, sum = 0, clip = 0;
  const win = Math.floor(sr * 0.5), wins = []; let acc = 0, cnt = 0;
  for (let i = 0; i < n; i++) {
    const a = L[i], b = R[i];
    if (!(a === a) || !(b === b) || !isFinite(a) || !isFinite(b)) { nan++; continue; }
    const m = Math.max(Math.abs(a), Math.abs(b));
    if (m > peak) peak = m;
    if (m >= 0.999) clip++;
    const e = (a * a + b * b) / 2; sum += e; acc += e; cnt++;
    if (cnt === win) { wins.push(Math.sqrt(acc / win)); acc = 0; cnt = 0; }
  }
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -999);
  let minW = 1e9; const s0 = Math.ceil(skip / 0.5);
  for (let k = s0; k < wins.length - 1; k++) if (wins[k] < minW) minW = wins[k];
  return { peak: +peak.toFixed(4), peakDb: +db(peak).toFixed(1), rmsDb: +db(Math.sqrt(sum / Math.max(1, n))).toFixed(1), minWinDb: +db(minW === 1e9 ? 0 : minW).toFixed(1), nan, clip, secs: +(n / sr).toFixed(1) };
};
window.toWav = (buf) => {
  const n = buf.length, sr = buf.sampleRate, L = buf.getChannelData(0), R = buf.getChannelData(1);
  const out = new DataView(new ArrayBuffer(44 + n * 4)); const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); out.setUint32(4, 36 + n * 4, true); w(8, "WAVE"); w(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, "data"); out.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) { out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  let s = ""; const u8 = new Uint8Array(out.buffer); for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s);
};
window.ready = true;
</script>`;

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p === "/totally-normal-rpg/__audiocheck.html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end(PAGE); return; }
      if (p.endsWith("favicon.ico")) { res.writeHead(204); res.end(); return; }
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
  await lock.acquire("tnrpg audiocheck");
  let srv, browser, fails = 0, warns = 0;
  const errors = [];
  const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };
  const warn = (m) => { console.log("warn " + m); warns++; };
  try {
    srv = await serve();
    const url = "http://127.0.0.1:" + srv.address().port + "/totally-normal-rpg/__audiocheck.html";
    browser = await puppeteer.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push("pageerror: " + (e.stack || e.message || e)));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });
    await page.goto(url);
    await page.waitForFunction("window.ready === true", { timeout: 20000 });
    const ids = await page.evaluate(() => ({ tracks: A.TRACK_IDS, stings: A.STING_IDS, sfx: A.SFX_IDS, loops: A.LOOP_IDS }));
    const SR = QUICK ? 22050 : 44100;
    const wavDir = path.join(__dirname, "shots", "audio");
    if (WAV) fs.mkdirSync(wavDir, { recursive: true });
    const tracks = only.length ? ids.tracks.filter((t) => only.includes(t)) : ids.tracks;

    console.log(`\n== tracks (${tracks.length}) @ ${SR} Hz`);
    console.log("id".padEnd(14) + "secs  peakDb rawPeak  rmsDb  minWinDb  render-ms (= DSP cost vs realtime)");
    for (const id of tracks) {
      lock.touch();
      const res = await page.evaluate(async (id, SR, QUICK, WAV) => {
        const loop = loopSeconds(id);
        const secs = Math.min(QUICK ? 20 : 42, loop + 2);
        const t0 = performance.now();
        const buf = await A.renderOffline({ kind: "track", id, seconds: secs, sampleRate: SR, intensity: id === "chase" ? 3 : 0 });
        const ms = performance.now() - t0;
        const a = analyze(buf, 2);
        const raw = analyze(await A.renderOffline({ kind: "track", id, seconds: Math.min(secs, 16), sampleRate: SR, raw: true, intensity: id === "chase" ? 3 : 0 }), 2);
        return { a, raw, ms: Math.round(ms), loop: +loop.toFixed(1), wav: WAV ? toWav(buf) : null };
      }, id, SR, QUICK, WAV);
      const { a, raw } = res;
      console.log(id.padEnd(14) + String(a.secs).padEnd(6) + String(a.peakDb).padEnd(7) + String(raw.peak).padEnd(9) + String(a.rmsDb).padEnd(7) + String(a.minWinDb).padEnd(10) + res.ms + " (" + Math.round(res.ms / 10 / a.secs) + "%)   (loop " + res.loop + " s)");
      if (res.wav) fs.writeFileSync(path.join(wavDir, id + ".wav"), Buffer.from(res.wav, "base64"));
      const floor = AMBIENT.has(id) ? -52 : -36;
      ok(a.nan === 0 && raw.nan === 0, `${id}: finite samples`);
      ok(a.rmsDb > floor, `${id}: audible (rms ${a.rmsDb} dB > ${floor})`);
      ok(a.clip === 0 && a.peak < 0.999, `${id}: no clipping after limiter (peak ${a.peak})`);
      ok(raw.peak < 1.6, `${id}: raw headroom (raw peak ${raw.peak} < 1.6)`);
      if (raw.peak >= 1.0) warn(`${id}: raw mix peaks ${raw.peak} (limiter engaged)`);
      if (!AMBIENT.has(id)) ok(a.minWinDb > (SPARSE.has(id) ? -70 : -50), `${id}: no dropouts (quietest 0.5 s window ${a.minWinDb} dB)`);
    }

    if (!only.length || only.includes("title")) {
      console.log("\n== title heartbeat pattern (slow / twice as fast / slow / twice as fast)");
      const hb = await page.evaluate(async (SR) => {
        const buf = await A.renderOffline({ kind: "track", id: "title", seconds: 18.5, sampleRate: SR, raw: true });
        const x = buf.getChannelData(0), sr = buf.sampleRate, a = 1 - Math.exp(-2 * Math.PI * 120 / sr);
        const env = new Float32Array(x.length); let y = 0, e = 0;
        for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); e = Math.max(Math.abs(y), e * 0.9995); env[i] = e; }
        const beat = 60 / 54, t0 = 0.02, res = [];
        const at = (t) => { const i = Math.floor(t * sr); let m = 0; for (let k = i; k < i + sr * 0.12; k++) m = Math.max(m, env[k] || 0); return m; };
        const before = (t) => env[Math.max(0, Math.floor((t - 0.02) * sr))] || 1e-6;
        for (let bar = 0; bar < 4; bar++) for (let b = 0; b < 4; b++) {
          const t = t0 + (bar * 4 + b) * beat;
          res.push({ bar, b, expect: bar % 2 === 1 || b % 2 === 0, ratio: +(at(t) / before(t)).toFixed(2) });
        }
        return res;
      }, SR);
      const line = hb.map((r) => (r.expect ? "X" : ".") + (r.ratio > 2.1 ? "+" : "-")).join(" ");
      console.log("   expected(X)/heard(+): " + line + "   ratios " + hb.map((r) => r.ratio).join(","));
      ok(hb.every((r) => (r.expect ? r.ratio > 2.2 : r.ratio < 2.0)), "title heartbeat: bar A = beats 1+3, bar B = all four beats");
    }

    console.log(`\n== stings (${ids.stings.length})`);
    for (const id of ids.stings) {
      const r = await page.evaluate(async (id, SR) => { const b = await A.renderOffline({ kind: "sting", id, seconds: 8, sampleRate: SR }); const rb = await A.renderOffline({ kind: "sting", id, seconds: 8, sampleRate: SR, raw: true }); return { a: analyze(b), raw: analyze(rb) }; }, id, SR);
      ok(r.a.nan === 0 && r.a.peak > 0.02 && r.a.clip === 0 && r.raw.peak < 1.6, `sting ${id}: peak ${r.a.peakDb} dB raw ${r.raw.peak} rms ${r.a.rmsDb}`);
    }
    lock.touch();

    console.log(`\n== sfx (${ids.sfx.length})`);
    const sres = await page.evaluate(async (SR) => {
      const out = [];
      for (const id of A.SFX_IDS) {
        const b = await A.renderOffline({ kind: "sfx", id, seconds: id === "tinnitus" ? 6 : 4, sampleRate: SR });
        const rb = await A.renderOffline({ kind: "sfx", id, seconds: id === "tinnitus" ? 6 : 4, sampleRate: SR, raw: true });
        out.push([id, analyze(b), analyze(rb)]);
      }
      return out;
    }, SR);
    let bad = 0;
    for (const [id, a, raw] of sres) {
      const good = a.nan === 0 && a.peak > 0.005 && a.clip === 0 && raw.peak < 1.8;
      if (!good) { bad++; ok(false, `sfx ${id}: peak ${a.peak} raw ${raw.peak} nan ${a.nan} clip ${a.clip}`); }
    }
    ok(bad === 0, `all ${sres.length} sfx audible, finite, unclipped (loudest raw: ${sres.slice().sort((x, y) => y[2].peak - x[2].peak).slice(0, 3).map((x) => x[0] + " " + x[2].peak).join(", ")})`);

    console.log(`\n== loops (${ids.loops.length})`);
    const lres = await page.evaluate(async (SR) => { const out = []; for (const id of A.LOOP_IDS) { const b = await A.renderOffline({ kind: "loop", id, seconds: 8, sampleRate: SR }); out.push([id, analyze(b, 1)]); } return out; }, SR);
    for (const [id, a] of lres) ok(a.nan === 0 && a.peak > 0.003 && a.clip === 0, `loop ${id}: peak ${a.peakDb} dB rms ${a.rmsDb}`);
    lock.touch();

    console.log("\n== live API smoke test (real AudioContext)");
    const live = await page.evaluate(async () => {
      const handlers = {}, lyrics = [];
      const bus = {
        on(n, f) { (handlers[n] = handlers[n] || []).push(f); return () => {}; }, once(n, f) { return this.on(n, f); }, off() {},
        emit(n, p) { if (n === "audio:lyric") lyrics.push(p.text); (handlers[n] || []).forEach((f) => { try { f(p); } catch (e) { console.error(e); } }); },
      };
      const state = {
        settings: { reduceFlashing: false, master: 0.8, music: 0.7, sfx: 0.9 }, run: { cycle: 0, equip: { charm: "toms_bell" } },
        player: { hp: 100, maxHp: 100, alive: true }, world: { zone: "lobby" }, rt: { playing: false }, ui: {}, profile: {},
      };
      const audio = await A.Audio.init({ bus, state, engine: null, camera: null });
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const log = [];
      const missing = ["unlock", "music", "zoneMusic", "pushMusic", "popMusic", "stinger", "sfx", "loop", "song", "voice", "setVolumes", "duck", "muffle", "heartbeat"].filter((k) => typeof audio[k] !== "function");
      const earlyLoop = audio.loop("river", { pos: { x: 5, y: 0, z: 60 }, vol: 0.5 }); // before unlock: must start later
      audio.music("title");
      audio.unlock();
      await wait(300);
      log.push(["running", audio.unlocked, audio.stats()]);
      await wait(1500);
      log.push(["title", audio.current]);
      state.rt.playing = true;
      audio.zoneMusic("area1", { delay: 1 });
      await wait(400);
      log.push(["titleFading", audio.current]);
      await wait(1300);
      log.push(["area1", audio.current]);
      bus.emit("zone:enter", { id: "village", prev: "lobby" });
      audio.pushMusic("boss", "boss"); await wait(600); log.push(["boss", audio.current]);
      audio.popMusic("boss"); await wait(300); log.push(["popped", audio.current]);
      const h = [];
      for (const id of ["hit_punch", "whoosh_sword", "rat_squeak", "jumpscare", "ui_click", "door_open"]) h.push(!!audio.sfx(id, { pos: { x: 3, y: 1, z: 2 } }));
      for (let i = 0; i < 40; i++) audio.sfx("step_grass", { vol: 0.3 });
      log.push(["voicesCapped", audio.stats().voices <= 24, audio.stats().voices]);
      bus.emit("player:step", { surface: "wood", run: true });
      bus.emit("secret:found", { id: "kittens", name: "x", count: 1, total: 26 });
      const st = audio.stinger("levelUp");
      audio.voice("we will meet again.", { kind: "hollow" });
      audio.heartbeat(0.7);
      audio.muffle(true, 0.2); await wait(300); audio.muffle(false, 0.2);
      audio.setVolumes({ master: 0.5, music: 0.3, sfx: 0.6 });
      state.run.cycle = 1; audio.zoneMusic("area1"); await wait(400); log.push(["ng", audio.current]);
      const song = audio.song("girl", { pos: { x: 0, y: 0, z: -10 } });
      await wait(1500);
      song.setPos({ x: 1, y: 0, z: -9 });
      song.stop(0.5);
      earlyLoop.stop(0.2);
      audio.heartbeat(0);
      audio.music(null); await wait(300); log.push(["silence", audio.current]);
      bus.emit("run:reset", { cycle: 1 });
      return { missing, log, h, lyrics, st, stats: audio.stats(), tracks: audio.tracks.length, sfxIds: audio.sfxIds.length, now: audio.now };
    });
    const L = Object.fromEntries(live.log.map((x) => [x[0], x.slice(1)]));
    ok(live.missing.length === 0, "API functions present " + (live.missing.join(",") || ""));
    ok(L.running && L.running[0] === true, "context running after unlock " + JSON.stringify(L.running && L.running[1]));
    ok(L.title && L.title[0] === "title", "music('title') plays: " + (L.title && L.title[0]));
    ok(L.titleFading && L.titleFading[0] === null, "zoneMusic delay fades the title out first: " + (L.titleFading && L.titleFading[0]));
    ok(L.area1 && L.area1[0] === "area1", "zoneMusic(area1, delay 1) starts after the delay: " + (L.area1 && L.area1[0]));
    ok(L.boss && L.boss[0] === "boss" && L.popped && L.popped[0] === "area1", "push/pop overrides: " + (L.boss && L.boss[0]) + " -> " + (L.popped && L.popped[0]));
    ok(L.voicesCapped && L.voicesCapped[0], "voice cap <= 24 (" + (L.voicesCapped && L.voicesCapped[1]) + ")");
    ok(live.h.every(Boolean), "3D sfx return handles");
    ok(L.ng && L.ng[0] === "area1_ng", "cycle 1 zoneMusic uses the _ng variant: " + (L.ng && L.ng[0]));
    ok(live.lyrics.includes("i love you, you love me..."), "girl song emits the lyric cue (" + JSON.stringify(live.lyrics) + ")");
    ok(L.silence && L.silence[0] === null, "music(null) = silence");
    ok(live.tracks >= 23 && live.sfxIds >= 95, `catalog: ${live.tracks} tracks, ${live.sfxIds} sfx`);
    const errs = errors.filter((e) => !/DevTools|favicon/.test(e));
    ok(errs.length === 0, "no page errors/warnings" + (errs.length ? ":\n   " + errs.slice(0, 12).join("\n   ") : ""));
  } catch (e) {
    console.log("FAIL harness: " + (e.stack || e));
    fails++;
  } finally {
    if (browser) await browser.close();
    if (srv) srv.close();
    lock.release();
  }
  console.log(`\n${fails ? "FAILED" : "PASSED"}: ${fails} failure(s), ${warns} warning(s)`);
  process.exit(fails ? 1 : 0);
})();
