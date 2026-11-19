#!/usr/bin/env node
// Builds timetravel/history.json from local git history (first-parent main).
// Run from anywhere:  node timetravel/build-history.mjs
// Run it before every push so the time machine knows about the latest updates.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const TZ = "America/New_York";
const OUT = join(HERE, "history.json");

function git(args) {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

let ref = "main";
try { git(["rev-parse", "--verify", "--quiet", "main"]); } catch { ref = "HEAD"; }

// %x1f = unit separator, %x1e = record separator; %aI = strict ISO author date.
const raw = git(["log", "--first-parent", ref, "--format=%H%x1f%aI%x1f%s%x1e"]);

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const dayOf = (iso) => dayFmt.format(new Date(iso)); // en-CA => YYYY-MM-DD

const commits = raw
  .split("\x1e")
  .map((r) => r.replace(/^\s+/, ""))
  .filter(Boolean)
  .map((r) => {
    const [sha, t, msg = ""] = r.split("\x1f");
    return { sha, t, msg: msg.trim(), day: dayOf(t) };
  })
  .filter((c) => /^[0-9a-f]{40}$/.test(c.sha))
  .reverse(); // oldest first

// Keep chronological order robust even if author dates are slightly out of order.
commits.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));

if (!commits.length) throw new Error("no commits found");

const out = {
  generated: new Date().toISOString(),
  tz: TZ,
  born: commits[0].day,
  commits,
};
writeFileSync(OUT, JSON.stringify(out) + "\n");
console.log(`history.json: ${commits.length} commits, ${commits[0].day} .. ${commits[commits.length - 1].day} (${ref})`);
