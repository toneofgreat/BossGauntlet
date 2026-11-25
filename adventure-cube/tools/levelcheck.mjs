// levelcheck.mjs - validate + inspect a level module, optionally rate it with the AI.
//   node tools/levelcheck.mjs area1                 validate, print stats
//   node tools/levelcheck.mjs area2 --ascii         also print the tile map (with entities/markers overlaid)
//   node tools/levelcheck.mjs area3 --rate          also run src/ai/rater.js rateLevel() and print the result
//   node tools/levelcheck.mjs path/to/level.json    a JSON (plain or packed) file instead of a module id
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { validateLevel, normalizeLevel, packLevel, unpackLevel, T } from "../src/sim/index.js";

const arg = process.argv[2] || "area1";
const flags = new Set(process.argv.slice(3));
let level;
if (arg.endsWith(".json")) level = unpackLevel(fs.readFileSync(arg, "utf8"));
else {
  const file = arg.endsWith(".js") ? path.resolve(arg) : path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../src/levels/" + arg + ".js");
  level = (await import(pathToFileURL(file).href)).default;
}
const v = validateLevel(level);
const L = normalizeLevel(level);
console.log(`"${L.name}"  theme=${L.theme} music=${L.music}  ${L.w}x${L.h} tiles  packed ${packLevel(L).length} bytes`);
console.log(`start ${JSON.stringify(L.start)}  goal ${JSON.stringify(L.goal)}  checkpoints ${L.checkpoints.map((c) => c.x + "," + c.y).join("  ")}`);
const counts = {};
for (const e of L.entities) counts[e.t] = (counts[e.t] || 0) + 1;
console.log("entities", JSON.stringify(counts));
console.log(v.ok ? "VALID" : "INVALID");
for (const e of v.errors) console.log("  error:", e);
for (const w of v.warnings) console.log("  warning:", w);

if (flags.has("--ascii")) {
  const rows = L.tiles.map((r) => r.split(""));
  const put = (x, y, ch) => { if (rows[y] && x >= 0 && x < L.w) rows[y][x] = ch; };
  for (const e of L.entities) {
    const ch = { crumble: "=", spring: "S", mover: "M", hazard: "H", pulse: "P", sign: "i", deco: null }[e.t];
    if (!ch) continue;
    for (let k = 0; k < (e.w || 1); k++) put(Math.floor(e.x) + k, Math.floor(e.y), ch);
  }
  L.checkpoints.forEach((c) => put(c.x, c.y, "C"));
  put(L.start.x, L.start.y, "@"); put(L.goal.x, L.goal.y, "G");
  const CH = 160;
  for (let x0 = 0; x0 < L.w; x0 += CH) {
    console.log(`--- columns ${x0}..${Math.min(L.w, x0 + CH) - 1}`);
    rows.forEach((r, y) => console.log(String(y).padStart(2) + " " + r.slice(x0, x0 + CH).join("")));
  }
}

if (flags.has("--rate")) {
  const { rateLevel } = await import("../src/ai/rater.js");
  const t0 = Date.now();
  const r = await rateLevel(level, { onProgress: () => {} });
  const out = Object.assign({}, r); delete out.inputs;
  console.log("RATING", JSON.stringify(out, null, 1), `(${Date.now() - t0} ms)`);
}
