// gen-wordlists.cjs - writes the banned / allowed word lists from src/names.js into supabase/schema.sql
// (between "-- BEGIN WORDS" and "-- END WORDS"), folded exactly as names.js folds them, so the server's
// filter and the game's can never drift.   node tools/gen-wordlists.cjs
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

(async () => {
  const names = await import(pathToFileURL(path.join(__dirname, "..", "src", "names.js")).href);
  const { banned, allowed, bannedStems, allowedWords } = names.wordLists();
  const q = (w) => "('" + w.replace(/'/g, "''") + "')";
  const rows = (list) => {
    const out = [];
    let line = "  ";
    for (let i = 0; i < list.length; i++) {
      const s = q(list[i]) + (i < list.length - 1 ? ", " : "");
      if (line.length + s.length > 118) { out.push(line.trimEnd()); line = "  "; }
      line += s;
    }
    out.push(line.trimEnd());
    return out.join("\n");
  };
  const sql = [
    "-- BEGIN WORDS",
    "-- " + bannedStems + " banned stems -> " + banned.length + " folded entries; " + allowedWords + " allowed words -> " + allowed.length + " folded entries",
    "insert into public.allowed_words (word) values",
    rows(allowed),
    "on conflict do nothing;",
    "insert into public.banned_words (word) values",
    rows(banned),
    "on conflict do nothing;",
    "-- END WORDS",
  ].join("\n");
  const file = path.join(__dirname, "..", "supabase", "schema.sql");
  const src = fs.readFileSync(file, "utf8");
  if (!/-- BEGIN WORDS[\s\S]*?-- END WORDS/.test(src)) { console.error("markers not found in schema.sql"); process.exit(1); }
  fs.writeFileSync(file, src.replace(/-- BEGIN WORDS[\s\S]*?-- END WORDS/, () => sql));
  console.log("schema.sql: " + banned.length + " banned, " + allowed.length + " allowed");
})();
