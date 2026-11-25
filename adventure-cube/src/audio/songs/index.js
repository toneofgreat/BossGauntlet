// songs/index.js - the song registry (frozen list; CONTRACT.md section 6). Each id has a file ./<id>.js
// whose default export is a song object in the format of ../format.js.
export const SONGS = [
  { id: "area1", title: "Sunlit Canopy", main: true, mood: "Area 1 - bright, hopeful acoustic-folk morning in a sunny forest; light and bouncy, ~108 bpm" },
  { id: "area2", title: "Golden Ridge", main: true, mood: "Area 2 - adventurous and climbing, misty highland cliffs at golden hour; building momentum, ~124 bpm" },
  { id: "area3", title: "Thunder Peaks", main: true, mood: "Area 3 - intense, driving, dangerous; stormy night summit with rain and lightning, ~150 bpm" },
  { id: "campfire", title: "Campfire Tales", main: false, mood: "warm, cozy, relaxed; plucked strings and soft hand percussion around a fire, ~84 bpm" },
  { id: "rapids", title: "Rapids Run", main: false, mood: "energetic, upbeat, splashy; a fast chase down a river, ~140 bpm" },
  { id: "aurora", title: "Aurora Drift", main: false, mood: "dreamy, floating, shimmering; ambient pads and bells under northern lights, ~90 bpm" },
  { id: "thunderdrum", title: "Thunderdrum", main: false, mood: "heavy, tribal, powerful; big taiko-style drums and low brass-like synths, ~128 bpm" },
  { id: "moonlit", title: "Moonlit Hollow", main: false, mood: "mysterious, gentle nocturne; sparse piano-like bells, owls and fireflies, ~96 bpm" },
];
export const SONG_IDS = SONGS.map((s) => s.id);
export const songInfo = (id) => SONGS.find((s) => s.id === id) || null;

const cache = new Map();
// loadSong(id) -> Promise<song object>  (rejects only for an unknown id or a broken file)
export function loadSong(id) {
  if (!SONG_IDS.includes(id)) return Promise.reject(new Error("unknown song " + id));
  if (!cache.has(id)) cache.set(id, import(`./${id}.js`).then((m) => m.default));
  return cache.get(id);
}
