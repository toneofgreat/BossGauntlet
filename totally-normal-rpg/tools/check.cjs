// check.cjs - syntax-checks every .js under totally-normal-rpg and runs the pure-module asserts (CONTRACT 14).
//   node totally-normal-rpg/tools/check.cjs
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const DIR = path.resolve(__dirname, "..");
let fail = 0, files = 0;
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".") || e.name === "shots") continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|mjs|cjs)$/.test(e.name)) {
      files++;
      try { execFileSync(process.execPath, ["--check", p], { stdio: "pipe" }); }
      catch (err) { fail++; console.log("SYNTAX " + path.relative(DIR, p) + "\n" + String(err.stderr || err.message).split("\n").slice(0, 6).join("\n")); }
    }
  }
}
walk(DIR);
console.log("node --check: " + files + " files, " + fail + " failed");

function ok(cond, name) { if (!cond) { fail++; console.log("FAIL " + name); } else console.log("ok   " + name); }

(async () => {
  try {
    const names = await import(pathToFileURL(path.join(DIR, "src/ui/names.js")).href);
    const fn = names.validateName || names.validate || names.checkName || names.isAllowed || names.default;
    if (typeof fn !== "function") { fail++; console.log("FAIL names.js exports no validate function (" + Object.keys(names).join(",") + ")"); }
    else {
      const good = (n) => { const r = fn(n); return r === true || (r && (r.ok === true || r.valid === true)); };
      ok(good("idiot"), "name 'idiot' ok");
      ok(good("IDIOT"), "name 'IDIOT' ok");
      ok(good("MyGranniesAMotherFucker"), "name 'MyGranniesAMotherFucker' ok");
      ok(!good("mygranniesamotherfucker2"), "name 'mygranniesamotherfucker2' rejected");
      ok(!good("fuck"), "name 'fuck' rejected");
      ok(!good("idiotfuck"), "name 'idiotfuck' rejected");
      ok(good("abcdefghijklmnopqrstuvwx"), "24 chars ok");
      ok(!good("abcdefghijklmnopqrstuvwxy"), "25 chars rejected");
    }
  } catch (e) { fail++; console.log("FAIL import names.js: " + e.message); }
  try {
    const stats = await import(pathToFileURL(path.join(DIR, "src/combat/stats.js")).href);
    if (typeof stats.simulatePacing === "function") {
      const r = stats.simulatePacing();
      const rows = Array.isArray(r) ? r : (r && (r.rows || r.milestones)) || [];
      let worst = 0;
      for (const row of rows) { const k = row.kills != null ? row.kills : row.killCount; if (k > worst) worst = k; ok(k <= 40, "milestone " + (row.id || row.name || "?") + " in " + k + " kills"); }
      if (!rows.length) console.log("note simulatePacing returned no rows");
    } else console.log("note stats.js has no simulatePacing()");
  } catch (e) { fail++; console.log("FAIL import stats.js: " + e.message); }
  console.log(fail ? "CHECK FAILED (" + fail + ")" : "CHECK OK");
  process.exit(fail ? 1 : 0);
})();
