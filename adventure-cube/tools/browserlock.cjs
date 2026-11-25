// browserlock.cjs - machine-wide "one headless browser at a time" lock for every agent/tool.
//   const lock = require("./browserlock.cjs");
//   await lock.acquire("my-tool");   // waits (polls) until free; a lock older than 4 min is treated as stale
//   try { ...puppeteer... } finally { await browser.close(); lock.release(); }
// Also: `node tools/browserlock.cjs status` prints the holder.
const fs = require("fs");
const path = require("path");
const LOCK = path.join(__dirname, ".browser.lock");
const STALE_MS = 4 * 60 * 1000;
let held = false;

function info() { try { return JSON.parse(fs.readFileSync(LOCK, "utf8")); } catch (e) { return null; } }
async function acquire(who = "tool", maxWaitMs = 15 * 60 * 1000) {
  const t0 = Date.now();
  let said = false;
  for (;;) {
    try {
      const fd = fs.openSync(LOCK, "wx");
      fs.writeSync(fd, JSON.stringify({ who, pid: process.pid, at: Date.now() }));
      fs.closeSync(fd);
      held = true;
      const rel = () => release();
      process.on("exit", rel);
      process.on("SIGINT", () => { rel(); process.exit(130); });
      return true;
    } catch (e) {
      const i = info();
      let st = null; try { st = fs.statSync(LOCK); } catch (e2) { /* vanished */ }
      if (st && Date.now() - st.mtimeMs > STALE_MS) { try { fs.unlinkSync(LOCK); } catch (e3) { /* raced */ } continue; }
      if (!said) { console.log(`[browserlock] waiting for ${i ? i.who + " (pid " + i.pid + ")" : "another browser"}...`); said = true; }
      if (Date.now() - t0 > maxWaitMs) throw new Error("browserlock: timed out waiting");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
// keep the lock fresh during long runs (call every minute or so)
function touch() { if (held) { try { const now = new Date(); fs.utimesSync(LOCK, now, now); } catch (e) { /* ignore */ } } }
function release() { if (held) { held = false; try { fs.unlinkSync(LOCK); } catch (e) { /* ignore */ } } }
module.exports = { acquire, release, touch, LOCK };
if (require.main === module && process.argv[2] === "status") console.log(info() || "free");
