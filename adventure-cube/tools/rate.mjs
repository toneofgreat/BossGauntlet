// rate.mjs - run the AI rater from the command line (RATER owns).
//   node tools/rate.mjs area1                    rate a level module (src/levels/<id>.js), a .js path or a .json file
//   node tools/rate.mjs area2 --budget 60000     budgetMs (default: 20000 for community-size levels like the browser,
//                                                90000 for bigger main-area levels)
//   node tools/rate.mjs test --moves             also list every move: frames, events, timing windows, failure rate
//   node tools/rate.mjs --calibrate              rate tools/rater-fixtures/* (+ areas if present), assert the order
//   node tools/rate.mjs --determinism test       rate twice, assert identical results
//   node tools/rate.mjs area3 --verbose         print every search stage per checkpoint segment
//   node tools/rate.mjs test --json              machine-readable output (no inputs)
import fs from "fs";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { rateLevel } from "../src/ai/rater.js";
import { unpackLevel, createSim } from "../src/sim/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--budget"].includes(args[i - 1])));

async function loadLevel(id) {
  if (id.endsWith(".json")) return unpackLevel(fs.readFileSync(id, "utf8"));
  let file;
  if (id.endsWith(".js") || id.endsWith(".mjs")) file = path.resolve(id);
  else if (fs.existsSync(path.join(HERE, "rater-fixtures", id + ".js"))) file = path.join(HERE, "rater-fixtures", id + ".js");
  else file = path.join(ROOT, "src", "levels", id + ".js");
  return (await import(pathToFileURL(file).href)).default;
}

// Rating used by the calibration and the CLI: expose the moves through a debug hook.
function rate(level, budgetMs, debug = flag("--moves")) {
  let lastMsg = "";
  const r = rateLevel(level, { budgetMs, debug, verbose: flag("--verbose") ? (m) => console.log("  " + m) : null, onProgress: (p, m) => { lastMsg = m; if (process.stderr.isTTY) process.stderr.write(`\r${(p * 100).toFixed(0).padStart(3)}% ${m.padEnd(50)}`); } });
  if (process.stderr.isTTY) process.stderr.write("\r" + " ".repeat(60) + "\r");
  void lastMsg;
  return r;
}

function summary(name, r) {
  const s = r.stats;
  const seg = (s.segments || []).map((x) => x.difficulty).join(" ");
  return `${name.padEnd(14)} ${String(r.difficulty).padStart(2)}  beatable=${r.beatable ? "yes" : "NO "}  ` +
    (r.beatable ? `score ${s.score}  E[deaths] ${s.expectedDeaths}  expert ${s.expertDeaths}  tightest ${s.tightestWindow}f  precise ${s.preciseEvents}  ` +
      `route ${s.seconds}s  segs [${seg}]  ` : `reason: ${s.reason}  progress ${(s.progress * 100 || 0).toFixed(0)}%  `) +
    `${s.ms} ms  work ${(s.work / 1e6).toFixed(1)}M`;
}

if (flag("--calibrate")) {
  // expected bands; the order must hold strictly between groups
  const fixtures = [
    ["trivial", 1, 1], ["easy", 2, 3], ["medium", 4, 6], ["hard", 5, 8], ["brutal", 8, 9], ["impossible", 10, 10], ["wall", 10, 10],
  ];
  const results = [];
  let ok = true;
  for (const [id, lo, hi] of fixtures) {
    const lv = await loadLevel(id);
    const r = rate(lv, 20000);
    results.push([id, r]);
    const pass = r.difficulty >= lo && r.difficulty <= hi;
    if (!pass) ok = false;
    console.log((pass ? "PASS " : "FAIL ") + summary(id, r) + `   (want ${lo}..${hi})`);
    if (r.beatable) {
      const sim = createSim(lv, { events: false }); sim.run(r.inputs);
      if (!sim.state.won || sim.state.deaths) { ok = false; console.log("FAIL replay of the AI's inputs does not win"); }
    }
  }
  for (let i = 1; i < results.length - 1; i++) { // (the last two are both impossible)
    const a = results[i - 1][1], b = results[i][1];
    const sa = a.beatable ? a.stats.score : 10, sb = b.beatable ? b.stats.score : 10;
    // near-ties are allowed between neighbours: since the measurement takes the easiest human approach to each
    // takeoff (measure.js replan), the medium and hard fixtures measure about the same (both 5)
    if (!(sb > sa - 0.35)) { ok = false; console.log(`FAIL order: ${results[i][0]} (${sb}) should be harder than ${results[i - 1][0]} (${sa})`); }
    else if (!(sb > sa)) console.log(`WARN order: ${results[i][0]} (${sb}) only ties ${results[i - 1][0]} (${sa})`);
  }
  // spacing stability: N identical 3-wide floor thorn patches; the same patches at a different spacing must rate
  // within 1 of each other, and more patches must never rate easier
  {
    const { spacingLevel } = await import(pathToFileURL(path.join(HERE, "rater-fixtures", "spacing", "make.js")).href);
    const groups = [[1, [10, 14]], [3, [10, 16]], [4, [11, 13, 16]], [10, [10, 20]]];
    let prevMax = 0;
    for (const [n, gaps] of groups) {
      const ds = gaps.map((gap) => rate(spacingLevel(n, gap), 20000).difficulty);
      const lo = Math.min(...ds), hi = Math.max(...ds);
      const pass = hi - lo <= 1 && hi >= prevMax - 1 && lo >= 1 && hi <= 9;
      if (!pass) ok = false;
      console.log((pass ? "PASS " : "FAIL ") + `spacing: ${n} thorn patch${n > 1 ? "es" : ""} at gaps ${gaps.join("/")} -> ${ds.join("/")}`);
      prevMax = Math.max(prevMax, hi);
    }
  }
  for (const id of ["area1", "area2", "area3"]) {
    const f = path.join(ROOT, "src", "levels", id + ".js");
    if (!fs.existsSync(f)) continue;
    try {
      const lv = await loadLevel(id);
      const r = rate(lv, undefined); // default budget for main-area-size levels (90 s)
      console.log("INFO " + summary(id, r));
    } catch (e) { console.log("INFO " + id + " failed to load/rate: " + e.message); }
  }
  console.log(ok ? "CALIBRATION OK" : "CALIBRATION FAILED");
  process.exit(ok ? 0 : 1);
}

if (flag("--determinism")) {
  const id = positional[0] || "test";
  const lv = await loadLevel(id);
  const budget = (opt("--budget", 0) ? +opt("--budget", 0) : undefined);
  const a = rate(lv, budget), b = rate(lv, budget);
  const strip = (r) => { const o = JSON.parse(JSON.stringify(r.stats)); delete o.ms; return JSON.stringify([r.difficulty, o, r.inputs ? Array.from(r.inputs) : null]); };
  const same = strip(a) === strip(b);
  console.log(summary(id, a));
  console.log(same ? "DETERMINISTIC: identical results" : "NOT DETERMINISTIC");
  process.exit(same ? 0 : 1);
}

const id = positional[0] || "test";
const lv = await loadLevel(id);
const budget = (opt("--budget", 0) ? +opt("--budget", 0) : undefined);
const r = rate(lv, budget);
if (flag("--json")) { const o = Object.assign({}, r); delete o.inputs; console.log(JSON.stringify(o, null, 1)); process.exit(0); }
console.log(summary(id, r));
if (r.beatable) {
  for (const s of r.stats.segments) {
    console.log(`  cp ${String(s.from).padStart(2)} -> ${String(s.to).padStart(2)}: ${s.difficulty}  ${(s.frames / 60).toFixed(1)}s  moves ${s.moves}  E[deaths] ${s.expectedDeaths}  clear ${(s.clearChance * 100).toFixed(1)}%  tightest ${s.tightestWindow}f  hardest move ${(s.hardestMove * 100).toFixed(0)}%  (${s.stage})`);
  }
  if (flag("--moves") && r.stats.debugMoves) {
    for (const m of r.stats.debugMoves) console.log("   ", JSON.stringify(m));
  }
}
