// bonustest.mjs - headless (Node) logic tests for the BONUS level (CORE owns the runner; BONUS.md 12).
//   node tools/bonustest.mjs            run every tools/bonustests/*.mjs
//   node tools/bonustest.mjs world      run only files whose name contains "world"
// Each test file: export default async function (t) { t.test("name", () => { t.ok(cond, "msg"); ... }) }
// t = { test(name, fn), ok(c, msg), eq(a, b, msg), near(a, b, eps, msg), game(seed?), run(G, n, bits?, aim?),
//       B (input bits), T, find helpers: tree(G, kind?), standAt(G, tx, ty?) }
// Every module the tests import must be DOM-free. Exit code 1 when anything fails.
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "bonustests");
const filt = process.argv[2] || "";
const src = (p) => pathToFileURL(path.join(here, "..", "src", "bonus", p)).href;

const C = await import(src("core/const.js"));
const { createGame, stepGame } = await import(src("core/game.js"));
const { placePlayer } = await import(src("core/player.js"));
const { surfaceAt } = await import(src("world/index.js"));

let pass = 0, fail = 0, cur = "";
const fails = [];
const t = {
  B: { LEFT: C.B_LEFT, RIGHT: C.B_RIGHT, JUMP: C.B_JUMP, ACTION: C.B_ACTION, USE: C.B_USE, UP: C.B_UP, DOWN: C.B_DOWN },
  T: C.T,
  tests: [],
  test(name, fn) { t.tests.push([name, fn]); },
  ok(c, msg = "") { if (c) pass++; else { fail++; fails.push(cur + ": " + msg); console.log("   FAIL " + msg); } return !!c; },
  eq(a, b, msg = "") { return t.ok(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); },
  near(a, b, eps, msg = "") { return t.ok(Math.abs(a - b) <= eps, `${msg} (got ${a}, want ${b} +-${eps})`); },
  game(seed = 1234) { return createGame({ seed, headless: true }); },
  run(G, n, bits = 0, aim = null) { for (let i = 0; i < n; i++) stepGame(G, bits, aim); return G; },
  tree(G, kind) { const px = G.player.x / C.T; let b = null; for (const tr of G.world.trees) if (tr.stage === 3 && (!kind || tr.kind === kind) && (!b || Math.abs(tr.x - px) < Math.abs(b.x - px))) b = tr; return b; },
  standAt(G, tx, ty) { if (ty == null) ty = surfaceAt(G, tx) - 1; placePlayer(G, tx, ty); t.run(G, 30); return G; },
};

const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".mjs") && f.includes(filt)).sort() : [];
const t0 = Date.now();
for (const f of files) {
  t.tests = [];
  const mod = await import(pathToFileURL(path.join(dir, f)).href);
  await mod.default(t);
  console.log(`# ${f}`);
  for (const [name, fn] of t.tests) {
    cur = f + " / " + name;
    const before = fail, t1 = Date.now();
    try { await fn(); } catch (e) { fail++; fails.push(cur + ": threw " + (e.stack || e)); console.log("   THREW " + (e.stack || e)); }
    console.log(`${fail === before ? "ok  " : "FAIL"} ${name} (${Date.now() - t1} ms)`);
  }
}
console.log(`\n${pass} checks passed, ${fail} failed, ${files.length} files, ${Date.now() - t0} ms`);
if (fails.length) { console.log("Failures:\n  " + fails.join("\n  ")); process.exit(1); }
