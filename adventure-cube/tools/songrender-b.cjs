// songrender-b.cjs - MUSIC_B's offline render check. Serves the site like playtest.cjs, then in ONE headless browser
// swaps window.AudioContext for an OfflineAudioContext, drives the real src/audio/engine.js (createAudio ->
// unlock -> playSong) and renders each song's intro + one full loop + 2 s tail. It steps the offline clock with
// suspend()/resume() so the engine's setTimeout look-ahead scheduler keeps up. Reports peak, RMS, the longest
// silent gap and the per-second loudness range. Fails if a song is silent, has a dead gap > 3 s, or peaks >= 1.0.
//   node tools/songrender-b.cjs                 (campfire rapids aurora thunderdrum moonlit)
//   node tools/songrender-b.cjs rapids --wav DIR   also writes DIR/<id>.wav (16-bit stereo) for listening
//   node tools/songrender-b.cjs rapids --solo      also renders each instrument alone (peak / rms per instrument)
// Holds tools/browserlock.cjs (one headless browser on the machine at a time).
const http = require("http");
const fs = require("fs");
const path = require("path");
const lock = require("./browserlock.cjs");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const GAME = path.join(__dirname, "..");
const SITE = path.join(GAME, "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json" };
const argv = process.argv.slice(2);
const wavI = argv.indexOf("--wav");
const WAV = wavI >= 0 ? argv[wavI + 1] : null;
const ids = argv.filter((a, i) => !a.startsWith("--") && !(wavI >= 0 && i === wavI + 1));
const IDS = ids.length ? ids : ["campfire", "rapids", "aurora", "thunderdrum", "moonlit"];
const SOLO = argv.includes("--solo");   // also print each instrument's own peak/rms (mix balance)

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p === "/blank.html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<!doctype html><title>render</title>"); return; }
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

function wav(file, L, R, sr) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}

(async () => {
  await lock.acquire("songrender-b");
  const touch = setInterval(() => lock.touch(), 30000);
  const srv = await serve();
  const base = "http://127.0.0.1:" + srv.address().port;
  let browser, fails = 0;
  try {
    browser = await puppeteer.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
    for (const id of IDS) {
      const page = await browser.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(String(e.message || e)));
      page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
      page.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push("http " + r.status() + " " + r.url()); });
      await page.goto(base + "/blank.html");
      const t0 = Date.now();
      const res = await page.evaluate(async (id, wantWav) => {
        const { validateSong } = await import("/adventure-cube/src/audio/format.js");
        const song = (await import(`/adventure-cube/src/audio/songs/${id}.js`)).default;
        const v = validateSong(song, id);
        const SR = 32000;
        const loopStart = v.seconds - v.loopSeconds;
        const SEC = Math.ceil(v.seconds + 2);
        const eng = await import("/adventure-cube/src/audio/engine.js");
        let buf, stats = null, audio = null;
        if (eng.renderOffline) {
          // MUSIC_A's offline renderer; raw = the un-limited mix (before the engine's limiter/soft-clip)
          const r = await eng.renderOffline(id, { seconds: SEC, sampleRate: SR, raw: true });
          buf = r.buffer; stats = r.stats; audio = r.audio;
        } else {
          // fallback for an engine without renderOffline: fake AudioContext + stepped offline clock
          const off = new OfflineAudioContext(2, SR * SEC, SR);
          const Fake = function () { return off; };
          window.AudioContext = Fake; window.webkitAudioContext = Fake;
          audio = eng.createAudio();
          audio.unlock();
          await audio.playSong(id, { fadeIn: 0.05, restart: true }); await new Promise((r) => setTimeout(r, 300));
          for (let t = 0.1; t < SEC - 0.05; t += 0.1) off.suspend(Math.round(t * SR / 128) * 128 / SR).then(() => setTimeout(() => off.resume(), 12));
          buf = await off.startRendering();
        }
        const L = buf.getChannelData(0), R = buf.getChannelData(1);
        let peak = 0, sum = 0;
        const win = SR, secs = [];
        for (let i = 0; i < L.length; i++) {
          const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a;
          sum += L[i] * L[i] + R[i] * R[i];
        }
        for (let s = 0; s + win <= L.length; s += win) {
          let q = 0; for (let i = s; i < s + win; i++) q += L[i] * L[i] + R[i] * R[i];
          secs.push(Math.sqrt(q / (2 * win)));
        }
        // longest silent run (in 50 ms windows, rms < 1e-4) before the tail
        let run = 0, longest = 0; const w2 = SR / 20, endS = Math.floor(v.seconds * SR);
        for (let s = Math.floor(0.3 * SR); s + w2 <= endS; s += w2) {
          let q = 0; for (let i = s; i < s + w2; i++) q += L[i] * L[i];
          if (Math.sqrt(q / w2) < 1e-4) { run += 0.05; longest = Math.max(longest, run); } else run = 0;
        }
        const vol = audio && audio.getVolume ? audio.getVolume() : { master: 1, music: 1 };
        const out = { stats, seconds: v.seconds, loopStart, peak, rms: Math.sqrt(sum / (2 * L.length)), secs, longest, vol, sr: SR };
        if (wantWav) {
          // downsample-free transfer as base64 16-bit to keep the payload small
          const n = L.length, i16 = new Int16Array(n * 2);
          for (let i = 0; i < n; i++) { i16[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; i16[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
          let bin = ""; const u8 = new Uint8Array(i16.buffer);
          for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
          out.pcm = btoa(bin);
        }
        return out;
      }, id, !!WAV);
      if (SOLO) {
        const rows = await page.evaluate(async (id) => {
          const eng = await import("/adventure-cube/src/audio/engine.js");
          const song = (await import(`/adventure-cube/src/audio/songs/${id}.js`)).default;
          const out = [];
          for (const name of Object.keys(song.instruments)) {
            const s2 = JSON.parse(JSON.stringify(song));
            for (const k of Object.keys(s2.instruments)) if (k !== name) s2.instruments[k].gain = 0;
            const r = await eng.renderOffline(s2, { seconds: 60, sampleRate: 16000, raw: true });
            const L = r.buffer.getChannelData(0), R = r.buffer.getChannelData(1);
            let pk = 0, q = 0; for (let i = 0; i < L.length; i++) { pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); q += L[i] * L[i] + R[i] * R[i]; }
            out.push([name, pk, Math.sqrt(q / (2 * L.length))]);
          }
          return out;
        }, id);
        for (const [n, pk, rm] of rows) console.log(`       ${n.padEnd(11)} peak ${pk.toFixed(3)}  rms ${rm.toFixed(4)}`);
      }
      const wall = ((Date.now() - t0) / 1000).toFixed(1);
      const nonZero = res.secs.filter((x) => x > 1e-3).length;
      const loud = res.secs.slice(1, Math.floor(res.seconds)).filter((x) => x > 1e-4);
      const minS = Math.min(...loud), maxS = Math.max(...loud);
      const full = res.peak / Math.max(0.01, (res.vol.master ?? 1) * (res.vol.music ?? 1));
      const ok = res.peak > 0.01 && res.peak < 1 && res.longest <= 3 && nonZero > res.seconds * 0.8 && !errs.length;
      if (!ok) fails++;
      console.log(`${ok ? "ok  " : "FAIL"} ${id.padEnd(12)} peak ${res.peak.toFixed(3)} (at master/music=1: ${full.toFixed(3)})  rms ${res.rms.toFixed(4)}  ` +
        `per-second rms ${minS.toFixed(4)}..${maxS.toFixed(4)}  longest gap ${res.longest.toFixed(2)} s  ${res.seconds.toFixed(1)} s rendered in ${wall} s`);
      console.log("     loudness/s: " + res.secs.map((x) => (x < 1e-4 ? "." : x < 0.02 ? "1" : x < 0.04 ? "2" : x < 0.07 ? "3" : x < 0.1 ? "4" : x < 0.15 ? "5" : "6")).join(""));
      if (res.stats) console.log("     engine stats: " + JSON.stringify(res.stats));
      for (const e of errs) console.log("     page error: " + e);
      if (WAV && res.pcm) {
        fs.mkdirSync(WAV, { recursive: true });
        const b = Buffer.from(res.pcm, "base64"), i16 = new Int16Array(b.buffer, b.byteOffset, b.length / 2);
        const L = new Float32Array(i16.length / 2), R = new Float32Array(i16.length / 2);
        for (let i = 0; i < L.length; i++) { L[i] = i16[2 * i] / 32767; R[i] = i16[2 * i + 1] / 32767; }
        wav(path.join(WAV, id + ".wav"), L, R, res.sr);
      }
      await page.close();
    }
  } catch (e) {
    console.error("render failed:", e); fails++;
  } finally {
    clearInterval(touch);
    if (browser) await browser.close();
    srv.close();
    lock.release();
  }
  process.exit(fails ? 1 : 0);
})();
