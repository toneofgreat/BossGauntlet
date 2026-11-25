// songcheck.mjs - validate song data files against src/audio/format.js.
//   node tools/songcheck.mjs            (all 8)      node tools/songcheck.mjs rapids aurora
import { validateSong } from "../src/audio/format.js";
import { SONG_IDS } from "../src/audio/songs/index.js";

const ids = process.argv.slice(2).length ? process.argv.slice(2) : SONG_IDS;
let bad = 0;
for (const id of ids) {
  let song;
  try { song = (await import(`../src/audio/songs/${id}.js`)).default; }
  catch (e) { console.log(`${id}: FAILED TO LOAD: ${e.message}`); bad++; continue; }
  const r = validateSong(song, id);
  const notes = Object.values(song.patterns || {}).reduce((a, p) => a + (p.notes ? p.notes.length : 0), 0);
  console.log(`${id}: ${r.ok ? "OK" : "INVALID"}  "${song.title}"  ${song.bpm} bpm  ${r.seconds.toFixed(1)} s total, loop ${r.loopSeconds.toFixed(1)} s, ` +
    `${Object.keys(song.instruments || {}).length} instruments, ${Object.keys(song.patterns || {}).length} patterns, ${notes} notes`);
  for (const e of r.errors) console.log("   error:", e);
  for (const w of r.warnings) console.log("   warning:", w);
  if (!r.ok) bad++;
}
process.exit(bad ? 1 : 0);
