// Offline audio check: renders every sound effect and every music state through an OfflineAudioContext
// (the real master chain: compressor -> limiter -> soft clip) and reports peak / RMS / loudest-50ms / silence.
//   node tools/audiocheck.cjs            all sfx + all music states
//   node tools/audiocheck.cjs --sfx      only sound effects
//   node tools/audiocheck.cjs --music    only music
// Flags: CLIP (peak > 0.99), SILENT (peak < 0.003), HOT (loudest 50 ms RMS > -6 dBFS), QUIET (loudest 50 ms < -38 dBFS).
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));
const ROOT = path.join(__dirname, "..");
const MIME = { ".html": "text/html", ".js": "text/javascript" };
const ONLY_SFX = process.argv.includes("--sfx"), ONLY_MUSIC = process.argv.includes("--music");

// [name, args, seconds]
const SFX = [
  ["cushionStep", [0.6]], ["cushionLand", [0.8]], ["jump", []], ["sting", []], ["stingHit", []], ["playerHurt", []],
  ["zapFire", []], ["zapHit", []], ["humanHit", []], ["wizardBlip", []], ["uiClick", []], ["introBoom", [], 3], ["objective", []], ["victory", [], 3],
  ["titleCard", []], ["levelUnlock", []], ["coin", []], ["payout", [6]], ["questDone", []], ["checkpoint", []], ["denied", []],
  ...["sand", "rock", "grass", "wood", "water", "dirt", "leaves", "mud", "metal", "canvas", "concrete", "cushion", "basalt", "ash", "lava"].map((s) => ["step", [s, 0.7], 0.6, "step:" + s]),
  ["splash", [0.5]], ["diveIn", []], ["ballBounce", []], ["doorOpen", []], ["friendChirp", ["happy"]], ["eat", []], ["yawn", [], 2],
  ["trickWhoosh", [0]], ["trickLand", [true]], ["comboUp", [3]], ["glassShatter", []], ["heartDrop", [], 3], ["chainCreak", []], ["timerTick", []],
  ["tailSlap", []], ["tailSlapHit", []], ["pickup", []], ["drop", []], ["throwWhoosh", []], ["cushionHit", []],
  ["gunshot", [0, 0]], ["bulletWhiz", []], ["ricochet", []], ["bulletHit", []], ["punch", []], ["bodyFall", []], ["explosion", [0], 3],
  ["crash", [0.7], 3], ["metalScrape", []], ["gust", [0.7]], ["leverPull", []], ["gateOpen", [true], 3], ["armorClank", []],
  ["thunder", [0.3], 4], ["birdsFlush", [12]], ["mysteryCall", [0.5]], ["vines", []], ["logCreak", []], ["tribeCheer", [0.8], 3], ["warCry", [], 2],
  ["craft", ["weave"]], ["eatFruit", []], ["materialPickup", ["leaf"]], ["ingredient", [0, true]], ["stir", [true]], ["brewDone", [], 3], ["brewFail", [], 2],
  ["potionPickup", []], ["potionThrow", []], ["potionSmash", []], ["transform", [2.6], 4], ["livingPotion", [], 2],
  ["scream", [1, true], 3], ["screamFizzle", []], ["dissolve", []], ["farVoice", [5, 0.5], 3], ["pillarShatter", [0], 2],
  ["bossRoar", [1], 3], ["bossStep", []], ["bossWindup", ["sweep"]], ["bossSwipe", []], ["bossSlam", [], 2], ["bossHitWall", [], 2], ["bossHurt", [true]], ["bossPhase", [], 3], ["kingFall", [], 4],
  ["lavaBubble", [0, 2]], ["eruption", [0, 10, 1], 4], ["steamVent", [0, 2]], ["rockCrack", []], ["magmorRoar", [1], 4], ["magmorStep", [], 2],
  ["spellChime", [2], 2], ["dreamWake", [], 3], ["windWhoosh", [0]], ["eatCrunch", []], ["firefly", []], ["owl", [], 2],
  ["wolfHowl", [0, 10, 1], 4], ["wolfGrowl", [], 2], ["wolfBark", []], ["wolfYelp", []], ["stoneTurn", []], ["portalOpen", [], 4], ["portalKnock", [], 3],
  ["babyChirp", [0]], ["babyCry", [0], 2], ["robotServo", []], ["robotLaser", []], ["robotBeep", [0]], ["rocketBurst", [], 2],
  ["hammer", ["wood"]], ["hammer", ["stone"], 1.5, "hammer:stone"], ["sawWood", [], 2], ["placeLog", []], ["placeStone", []], ["thatchRustle", []], ["snore", ["pip"], 3, "snore:pip"], ["clockTick", []],
  // beds (first seconds)
  ["lavaAmbience", [0.8], 4], ["forestNight", [0.8], 4], ["cricketNight", [0.8], 4], ["portalHum", [0.8], 4], ["flightRush", [0.8], 4], ["morningBirds", [0.8], 4],
  ["pawRun", [0.8], 3], ["campFire", [0.8], 4], ["jungleAmbience", [true, "day"], 4], ["rain", [0.7], 4], ["river", [0.7], 4], ["wind", [0.7], 4], ["dreamAmbience", [true], 4],
];

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p === "/" || p === "/blank.html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<!doctype html><title>a</title>"); return; }
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

(async () => {
  const srv = await serve();
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--mute-audio"], protocolTimeout: 120000 });
  const kill = setTimeout(async () => { console.log("WATCHDOG"); try { await browser.close(); } catch (_) {} srv.close(); process.exit(2); }, 540000);
  kill.unref();
  let bad = 0;
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.log("PAGEERROR " + e.message));
    await page.goto("http://127.0.0.1:" + srv.address().port + "/blank.html");
    await page.evaluate(() => {
      window.__mk = (seconds) => {
        const SR = 44100;
        const off = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
        // the module asks for a live context: hand it this offline one, reporting "running"
        Object.defineProperty(off, "state", { get: () => "running" });
        off.__resume = off.resume.bind(off); off.resume = () => Promise.resolve();
        window.AudioContext = function () { return off; };
        return off;
      };
      window.__stats = (buf) => {
        const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, w = 2205;
        let peak = 0, sum = 0, win = 0, best = 0, ws = 0;
        for (let i = 0; i < n; i++) {
          const v = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (v > peak) peak = v;
          const s = (L[i] * L[i] + R[i] * R[i]) / 2; sum += s; ws += s;
          if (i >= w) { const j = i - w; ws -= (L[j] * L[j] + R[j] * R[j]) / 2; }
          if (i % 64 === 0 && ws > best) best = ws;
          if (!isFinite(L[i])) win = 1;
        }
        const db = (x) => (x > 0 ? 10 * Math.log10(x) : -120);
        return { peak: +peak.toFixed(3), rms: +db(sum / n).toFixed(1), loud: +db(best / w).toFixed(1), nan: win };
      };
    });
    const flag = (s) => { const f = []; if (s.nan) f.push("NAN"); if (s.peak > 0.99) f.push("CLIP"); if (s.peak < 0.003) f.push("SILENT"); if (s.loud > -6) f.push("HOT"); if (s.loud < -38 && s.peak >= 0.003) f.push("QUIET"); return f; };
    if (!ONLY_MUSIC) {
      console.log("== sound effects (peak, total RMS dB, loudest 50ms dB)");
      for (const [name, args, secs, label] of SFX) {
        const r = await page.evaluate(async (name, args, secs) => {
          const { createAudio } = await import("/src/audio.js?" + Math.random());
          const off = window.__mk(secs || 1.5);
          const a = createAudio(); a.resume();
          if (typeof a[name] !== "function") return { missing: true };
          try { a[name](...args); } catch (e) { return { err: String(e) }; }
          const buf = await off.startRendering();
          return window.__stats(buf);
        }, name, args, secs || 1.5);
        const id = label || name;
        if (r.missing || r.err) { console.log("  " + id.padEnd(22) + (r.err || "MISSING")); bad++; continue; }
        const f = flag(r); if (f.length) bad++;
        console.log("  " + id.padEnd(22) + String(r.peak).padStart(6) + String(r.rms).padStart(8) + String(r.loud).padStart(8) + "  " + f.join(" "));
      }
    }
    if (!ONLY_SFX) {
      console.log("listing states"); const states = await page.evaluate(async () => Object.keys((await import("/src/music.js")).MUSIC_STATES).filter((k) => k !== "none")); console.log(states.join(" "));
      console.log("== music (12 s each, 0.8 intensity)");
      for (const st of states) {
        const r = await page.evaluate(async (st) => {
          const { createAudio } = await import("/src/audio.js?" + Math.random());
          const { createMusic } = await import("/src/music.js?" + Math.random());
          const SECS = 8, off = window.__mk(SECS);
          const a = createAudio(); a.resume();
          const m = createMusic(a);
          m.play(st, { at: "now", intensity: 0.8 });
          const dt = 4096 / 44100; let k = 1;
          const hop = () => { if ((k + 1) * dt >= SECS) return; off.suspend(k * dt).then(() => { k++; try { m.update(dt); } catch (e) { window.__merr = String(e); } hop(); off.__resume(); }); };
          m.update(dt); hop();
          const buf = await off.startRendering();
          return Object.assign(window.__stats(buf), { err: window.__merr || null });
        }, st).catch((e) => ({ peak: 0, rms: 0, loud: 0, err: String(e).slice(0, 80) }));
        const f = flag(r); if (r.err) f.push("ERR " + r.err); if (f.length) bad++;
        console.log("  " + st.padEnd(22) + String(r.peak).padStart(6) + String(r.rms).padStart(8) + String(r.loud).padStart(8) + "  " + f.join(" "));
      }
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(bad ? "FLAGGED: " + bad : "AUDIO CHECK OK");
  process.exit(0);
})();
