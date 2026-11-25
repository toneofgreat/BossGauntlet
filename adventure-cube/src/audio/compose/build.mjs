// build.mjs - regenerate the MUSIC_A area songs from the composers in this folder (Node only).
//   node src/audio/compose/build.mjs            -> writes src/audio/songs/area1.js area2.js area3.js and validates them
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateSong } from "../format.js";
import { writeSong, polyphony } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const songsDir = path.join(here, "..", "songs");
let bad = 0;
for (const id of ["area1", "area2", "area3"]) {
  const song = (await import(pathToFileURL(path.join(here, id + ".mjs")).href)).default;
  const r = validateSong(song, id);
  const poly = polyphony(song);
  const notes = Object.values(song.patterns).reduce((a, p) => a + p.notes.length, 0);
  console.log(`${id}: ${r.ok ? "OK" : "INVALID"} "${song.title}" ${song.bpm} bpm, ${r.seconds.toFixed(1)} s, loop ${r.loopSeconds.toFixed(1)} s, ` +
    `${Object.keys(song.patterns).length} patterns, ${notes} notes, est. polyphony max ${poly.max} avg ${poly.avg.toFixed(1)}`);
  r.errors.forEach((e) => console.log("  error:", e)); r.warnings.forEach((w) => console.log("  warning:", w));
  if (!r.ok) { bad++; continue; }
  writeSong(path.join(songsDir, id + ".js"), song, `${song.title} - Adventure Cube ${id} theme (original composition, MUSIC_A).`);
}
process.exit(bad ? 1 : 0);
