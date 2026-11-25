// audiocheck.cjs - MUSIC_A verification in ONE headless browser (holds tools/browserlock.cjs).
//   node tools/audiocheck.cjs                 all 8 songs + drift + realtime + sfx
//   node tools/audiocheck.cjs area1 area3     only those songs (drift/realtime/sfx still run)
//   --quick                                   render songs at 22050 Hz and skip the un-limited (raw) pass
// For every song: renders the whole arrangement once + 6 s past the loop point with OfflineAudioContext and reports
// peak (after the master limiter, and raw without it), RMS, quietest 1 s window, silence gaps, the loop seam,
// NaNs and engine voice stats. Drift: a 150 bpm click track rendered for 120 s, onsets compared to n * beat.
// Realtime: plays area3 on a real AudioContext for ~10 s, crossfades to area1, checks the scheduler never
// scheduled late and never skipped. SFX: renders every SFX name and checks it is audible and finite.
const http = require("http");
const fs = require("fs");
const path = require("path");
const lock = require("./browserlock.cjs");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const GAME = path.join(__dirname, "..");
const SITE = path.join(GAME, "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json" };
const args = process.argv.slice(2);
const QUICK = args.includes("--quick");
const ALL = ["area1", "area2", "area3", "campfire", "rapids", "aurora", "thunderdrum", "moonlit"];
const ids = args.filter((a) => !a.startsWith("--"));
const SONGS = ids.length ? ids : ALL;

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p === "/adventure-cube/__audiotest.html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<!doctype html><meta charset=utf-8><title>audio test</title><body>audio test</body>"); return; }
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

(async () => {
  await lock.acquire("adventure-cube audiocheck");
  const srv = await serve();
  const base = "http://127.0.0.1:" + srv.address().port + "/adventure-cube/";
  let browser, fails = 0;
  const errors = [];
  const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };
  try {
    browser = await puppeteer.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push("pageerror: " + (e.stack || e.message || e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
    await page.goto(base + "__audiotest.html");
    await page.evaluate(() => {
      window.analyze = (buf, loopAt) => {
        const sr = buf.sampleRate, L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
        let peak = 0, nan = 0, sum = 0, clip = 0, dc = 0;
        const win = sr, wins = [];
        let acc = 0;
        for (let i = 0; i < n; i++) {
          const a = L[i], b = R[i];
          if (!(a === a) || !(b === b)) { nan++; continue; }
          const m = Math.max(Math.abs(a), Math.abs(b));
          if (m > peak) peak = m;
          if (m >= 0.999) clip++;
          const e = (a * a + b * b) / 2; sum += e; acc += e; dc += a + b;
          if ((i + 1) % win === 0) { wins.push(Math.sqrt(acc / win)); acc = 0; }
        }
        const db = (x) => (x > 0 ? 20 * Math.log10(x) : -999);
        // quietest 1 s window after the first second; 100 ms gaps of near-silence anywhere after 1 s
        let minW = Infinity, minAt = 0;
        wins.forEach((w, i) => { if (i >= 1 && w < minW) { minW = w; minAt = i; } });
        let gaps = 0, run = 0; const g = Math.floor(sr * 0.1);
        for (let i = sr; i < n; i++) { const m = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (m < 0.0005) { if (++run === g) gaps++; } else run = 0; }
        // seam: RMS 1 s before vs 1 s after the loop point
        let seam = null;
        if (loopAt) {
          const at = Math.floor(loopAt * sr), rms = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += (L[i] * L[i] + R[i] * R[i]) / 2; return Math.sqrt(s / (b - a)); };
          seam = { before: db(rms(at - sr, at)), after: db(rms(at, at + sr)), edge: db(rms(at - Math.floor(sr * 0.05), at + Math.floor(sr * 0.05))) };
        }
        return { seconds: n / sr, peak, peakDb: db(peak), rmsDb: db(Math.sqrt(sum / n)), minWinDb: db(minW), minAt, gaps, clip, nan, dc: dc / (2 * n), seam };
      };
    });

    // ---------- songs ----------
    for (const id of SONGS) {
      const r = await page.evaluate(async (id, QUICK) => {
        const E = await import("./src/audio/engine.js"), F = await import("./src/audio/format.js"), S = await import("./src/audio/songs/index.js");
        const song = await S.loadSong(id);
        const v = F.validateSong(song, id);
        const total = v.seconds, loopAt = total; // the first wrap happens at the end of the full arrangement
        const seconds = total + 6;
        const sr = QUICK ? 22050 : 44100;
        const t0 = performance.now();
        const A = await E.renderOffline(song, { seconds, sampleRate: sr });
        const ms = performance.now() - t0;
        const a = window.analyze(A.buffer, loopAt);
        let raw = null;
        if (!QUICK) { const B = await E.renderOffline(song, { seconds, sampleRate: 22050, raw: true }); raw = window.analyze(B.buffer, 0); }
        return { id, title: song.title, total, loopSeconds: v.loopSeconds, ms, a, raw, stats: A.stats };
      }, id, QUICK);
      const a = r.a, st = r.stats;
      console.log(`\n${r.id} "${r.title}": ${r.total.toFixed(1)} s (+6 s past the loop), rendered in ${(r.ms / 1000).toFixed(1)} s`);
      console.log(`  limited: peak ${a.peak.toFixed(3)} (${a.peakDb.toFixed(1)} dBFS)  rms ${a.rmsDb.toFixed(1)} dB  quietest 1s ${a.minWinDb.toFixed(1)} dB @${a.minAt}s  gaps ${a.gaps}  clipped ${a.clip}  NaN ${a.nan}  dc ${a.dc.toExponential(1)}`);
      if (r.raw) console.log(`  raw mix: peak ${r.raw.peak.toFixed(3)} (${r.raw.peakDb.toFixed(1)} dBFS)  rms ${r.raw.rmsDb.toFixed(1)} dB`);
      console.log(`  loop seam @${r.total.toFixed(1)} s: before ${a.seam.before.toFixed(1)} dB  after ${a.seam.after.toFixed(1)} dB  +-50ms ${a.seam.edge.toFixed(1)} dB`);
      console.log(`  engine: ${st.notes} notes, max voices ${st.maxVoices}, dropped ${st.dropped}, steps ${st.steps}, late ${st.late}`);
      ok(a.nan === 0, `${id}: no NaN`);
      ok(a.rmsDb > -40, `${id}: non-silent (rms ${a.rmsDb.toFixed(1)} dB)`);
      ok(a.peak < 1.0 && a.clip === 0, `${id}: no clipping (peak ${a.peak.toFixed(3)})`);
      if (r.raw) ok(r.raw.peak < 1.0, `${id}: raw mix (pre-limiter) peak < 1.0 (${r.raw.peak.toFixed(3)})`);
      ok(a.gaps === 0, `${id}: no 100 ms dropouts`);
      ok(a.seam.after > a.seam.before - 12 && a.seam.edge > -45, `${id}: seamless loop`);
      ok(st.dropped === 0, `${id}: no voices dropped by the cap`);
      ok(r.loopSeconds >= 60, `${id}: loop >= 60 s (${r.loopSeconds.toFixed(1)})`);
    }

    // ---------- drift: click track, 120 s ----------
    const drift = await page.evaluate(async () => {
      const E = await import("./src/audio/engine.js");
      const song = { id: "click", title: "click", mood: "test", bpm: 150, stepsPerBar: 16,
        master: { gain: 0.9, reverb: { seconds: 0.5, mix: 0 }, delay: { steps: 3, feedback: 0 } },
        instruments: { k: { type: "drum", kind: "woodblock", gain: 0.8 } },
        patterns: { p: { inst: "k", bars: 1, notes: [[0, "C4", 1, 1], [4, "C4", 1, 1], [8, "C4", 1, 1], [12, "C4", 1, 1]] } },
        sections: { a: { bars: 4, tracks: ["p"] }, b: { bars: 3, tracks: ["p"] } }, arrangement: ["a", "b"], loop: 0 };
      const sr = 44100, sec = 120;
      const { buffer } = await E.renderOffline(song, { seconds: sec, sampleRate: sr, raw: true });
      const d = buffer.getChannelData(0), beat = 60 / 150, on = [];
      let last = -1e9;
      for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.02 && i - last > sr * 0.2) { on.push(i); last = i; }
      const t0 = on[0];
      let maxErr = 0, worst = 0;
      on.forEach((s, n) => { const e = Math.abs(s - t0 - Math.round(n * beat * sr)); if (e > maxErr) { maxErr = e; worst = n; } });
      return { onsets: on.length, expected: Math.floor((sec - 0.06) / beat), maxErr, worst, firstAt: t0 / sr };
    });
    console.log(`\ndrift: ${drift.onsets} clicks over 120 s (expected ~${drift.expected}), first at ${drift.firstAt.toFixed(4)} s, max deviation ${drift.maxErr} samples (click #${drift.worst})`);
    ok(Math.abs(drift.onsets - drift.expected) <= 1 && drift.maxErr <= 2, "scheduler: no drift over 120 s (<= 2 samples)");

    // ---------- realtime scheduler + crossfade + ambience ----------
    const rt = await page.evaluate(async () => {
      const E = await import("./src/audio/engine.js");
      const a = E.createAudio();
      a.unlock();
      const ctx = a.context;
      for (let i = 0; i < 40 && ctx.state !== "running"; i++) await new Promise((r) => setTimeout(r, 50));
      if (ctx.state !== "running") return { state: ctx.state };
      const tStart = ctx.currentTime;
      await a.playSong("area3");
      a.ambience("storm");
      a.sfx("thunder");
      const longTasks = [];
      let lastT = performance.now(), worstGap = 0;
      const iv = setInterval(() => { const n = performance.now(); worstGap = Math.max(worstGap, n - lastT); lastT = n; }, 10);
      await new Promise((r) => setTimeout(r, 7000));
      const s1 = a.stats();
      await a.playSong("area1", { fadeIn: 1, fadeOut: 1 });
      a.ambience("forest");
      a.duck(0.5, 0.6);
      a.setMuted(true); await new Promise((r) => setTimeout(r, 300)); a.setMuted(false);
      await new Promise((r) => setTimeout(r, 3500));
      clearInterval(iv);
      const s2 = a.stats();
      const res = { state: ctx.state, elapsed: ctx.currentTime - tStart, current: a.currentSong, s1, s2, worstGap, baseLatency: ctx.baseLatency };
      a.stopSong({ fadeOut: 0.2 }); a.ambience(null);
      await new Promise((r) => setTimeout(r, 400));
      await ctx.close();
      return res;
    });
    if (rt.state !== "running" && !rt.s2) { ok(false, "realtime: AudioContext did not start (" + rt.state + ")"); }
    else {
      console.log(`\nrealtime: ${rt.elapsed.toFixed(2)} s of audio clock, area3 -> area1 crossfade, current=${rt.current}`);
      console.log(`  area3 phase: ${rt.s1.steps} steps scheduled, min lead ${(rt.s1.minLead * 1000).toFixed(1)} ms, late ${rt.s1.late}, skipped ${rt.s1.skipped}, max voices ${rt.s1.maxVoices}`);
      console.log(`  total: ${rt.s2.steps} steps, notes ${rt.s2.notes}, late ${rt.s2.late}, skipped ${rt.s2.skipped}, dropped ${rt.s2.dropped}; worst main-thread timer gap ${rt.worstGap.toFixed(0)} ms`);
      ok(rt.s2.late === 0 && rt.s2.skipped === 0, "realtime: scheduler never late, never skipped");
      ok(rt.current === "area1", "realtime: crossfade switched to area1");
    }

    // ---------- sfx ----------
    const sx = await page.evaluate(async () => {
      const E = await import("./src/audio/engine.js");
      const names = E.SFX_NAMES, sr = 44100, gap = 0.6, sec = names.length * gap + 4.5;
      const off = new OfflineAudioContext(2, Math.ceil(sec * sr), sr);
      const a = E.createAudio({ context: off });
      a.unlock();
      names.forEach((n, i) => a.sfx(n, { at: i * gap, impact: 8 }));
      const buf = await off.startRendering();
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      return names.map((n, i) => {
        const s0 = Math.floor(i * gap * sr), s1 = Math.floor((i * gap + (n === "thunder" || n === "win" ? gap : gap)) * sr);
        let pk = 0, nan = 0;
        for (let j = s0; j < s1; j++) { const m = Math.max(Math.abs(L[j]), Math.abs(R[j])); if (m !== m) nan++; else if (m > pk) pk = m; }
        return { n, pk, nan };
      });
    });
    console.log("\nsfx peaks: " + sx.map((s) => `${s.n} ${s.pk.toFixed(2)}`).join(", "));
    ok(sx.every((s) => s.pk > 0.01 && s.nan === 0 && s.pk < 1), "sfx: all " + sx.length + " audible, finite, unclipped");
  } catch (e) {
    console.log("FAIL exception: " + (e.stack || e));
    fails++;
  } finally {
    if (browser) await browser.close();
    lock.release();
    srv.close();
  }
  if (errors.length) { console.log("\npage errors:"); errors.forEach((e) => console.log("  " + e)); fails += errors.length; }
  console.log(fails ? `\n${fails} FAILED` : "\nALL OK");
  process.exit(fails ? 1 : 0);
})();
