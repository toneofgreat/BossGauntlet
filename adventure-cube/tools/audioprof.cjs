// audioprof.cjs - MUSIC_A CPU profile: offline-render one section of a song with each instrument muted in turn.
//   node tools/audioprof.cjs area3 B3      -> render speed (x realtime) full, per-instrument cost, reverb cost
const http = require("http"), fs = require("fs"), path = require("path");
const lock = require("./browserlock.cjs");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));
const SITE = path.join(__dirname, "..", "..");
const [id = "area3", sec = "B3"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
(async () => {
  await lock.acquire("adventure-cube audioprof");
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/adventure-cube/__a.html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<!doctype html><title>p</title>"); return; }
    fs.readFile(path.join(SITE, p), (err, buf) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(buf); });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ["--mute-audio"], protocolTimeout: 0 });
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:" + srv.address().port + "/adventure-cube/__a.html");
    const out = await page.evaluate(async (id, sec, ALL) => {
      const E = await import("./src/audio/engine.js"), S = await import("./src/audio/songs/index.js");
      const base = await S.loadSong(id);
      const secs = base.sections[sec].bars * 16 * 60 / base.bpm / 4;
      const run = async (mod) => {
        const s = JSON.parse(JSON.stringify(base)); s.arrangement = [sec]; s.loop = 0; mod && mod(s);
        await E.renderOffline(s, { seconds: 2, sampleRate: 44100 }); // warm caches/JIT
        let best = Infinity; for (let i = 0; i < 3; i++) { const t0 = performance.now(); await E.renderOffline(s, { seconds: secs, sampleRate: 44100 }); best = Math.min(best, performance.now() - t0); } return best;
      };
      const full = await run();
      const res = { secs, full, inst: {} };
      if (ALL) for (const k of Object.keys(base.instruments)) res.inst[k] = full - (await run((s) => { s.instruments[k].gain = 0; }));
      res.noReverb = full - (await run((s) => { s.master.reverb.seconds = 0.3; }));
      return res;
    }, id, sec, process.argv.includes("--all"));
    console.log(`${id}/${sec}: ${out.secs.toFixed(1)} s rendered in ${(out.full / 1000).toFixed(2)} s = ${(out.secs * 1000 / out.full).toFixed(1)}x realtime`);
    for (const [k, v] of Object.entries(out.inst).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(10)} ${(v / out.full * 100).toFixed(0)}%`);
    console.log(`  reverb 3s->0.3s saves ${(out.noReverb / out.full * 100).toFixed(0)}%`);
  } finally { if (browser) await browser.close(); lock.release(); srv.close(); }
})();
