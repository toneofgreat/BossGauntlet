// audio.mjs - BONUS_AUDIO's headless tests (BONUS.md 12): songs validate and are long enough, every bus event in
// the BONUS.md 10.3 sfx list routes to a real sound, every animal / station / tile / house level has its sound,
// every sound builds its node graph without errors on a mock AudioContext, and the ambience mix is sane.
// (The audible checks - non-silent, peak < 1.0 - run in a browser: node tools/bonustests/audiocheck.cjs)
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => pathToFileURL(path.join(here, "..", "..", "src", p)).href;

const { validateSong } = await import(src("audio/format.js"));
const DAY = (await import(src("bonus/audio/songs/homestead_day.js"))).default;
const NIGHT = (await import(src("bonus/audio/songs/homestead_night.js"))).default;
const { route, REQUIRED_EVENTS, HANDLERS } = await import(src("bonus/audio/events.js"));
const { SOUNDS, SOUND_NAMES, makeKit } = await import(src("bonus/audio/sfx.js"));
const { env } = await import(src("bonus/audio/ambience.js"));
const { ANIMAL_DEFS } = await import(src("bonus/data/animals.js"));
const { RECIPES } = await import(src("bonus/data/recipes.js"));
const { TILE_DEFS } = await import(src("bonus/data/tiles.js"));
const { setDayF } = await import(src("bonus/core/time.js"));
const { SONG_IDS } = await import(src("audio/songs/index.js"));

// ---- a tiny mock AudioContext: records nodes, checks parameter values are finite ----
function mockContext() {
  const bad = [];
  let nodes = 0;
  const param = (name) => {
    const p = { value: 0, automationRate: "a-rate" };
    const chk = (v, t) => { if (!Number.isFinite(v) || !Number.isFinite(t) || t < 0) bad.push(`${name}(${v}, ${t})`); return p; };
    p.setValueAtTime = chk; p.linearRampToValueAtTime = chk; p.setTargetAtTime = (v, t, c) => { if (!(c > 0)) bad.push(name + " tc"); return chk(v, t); };
    p.exponentialRampToValueAtTime = (v, t) => { if (!(v > 0)) bad.push(`${name} exp ramp to ${v}`); return chk(v, t); };
    p.cancelScheduledValues = () => p;
    return p;
  };
  const node = (extra = {}) => { nodes++; return Object.assign({ connect: (d) => d, disconnect() {} }, extra); };
  const ac = {
    sampleRate: 8000, currentTime: 0, state: "running",
    destination: node(),
    createGain: () => node({ gain: param("gain") }),
    createOscillator: () => node({ type: "sine", frequency: param("frequency"), detune: param("detune"), start(t) { if (!Number.isFinite(t)) bad.push("osc start"); }, stop(t) { if (!Number.isFinite(t)) bad.push("osc stop"); } }),
    createBufferSource: () => node({ buffer: null, loop: false, playbackRate: param("rate"), start(t) { if (!Number.isFinite(t)) bad.push("src start"); }, stop() {} }),
    createBiquadFilter: () => node({ type: "lowpass", frequency: param("frequency"), Q: param("Q") }),
    createStereoPanner: () => node({ pan: param("pan") }),
    createBuffer: (ch, n) => { const d = Array.from({ length: ch }, () => new Float32Array(n)); return { length: n, duration: n / 8000, numberOfChannels: ch, getChannelData: (i) => d[i] }; },
  };
  return { ac, bad, count: () => nodes };
}

export default async function (t) {
  t.test("bonus songs validate, loop >= 90 s, and do not collide with the main registry", () => {
    for (const s of [DAY, NIGHT]) {
      const r = validateSong(s, s.id);
      t.ok(r.ok, `${s.id} validates: ${r.errors.join("; ")}`);
      t.ok(r.loopSeconds >= 90, `${s.id} loop ${r.loopSeconds.toFixed(1)} s >= 90`);
      t.ok(!SONG_IDS.includes(s.id), `${s.id} is not a main-game registry id`);
      t.ok(s.arrangement.length >= 6 && Object.keys(s.sections).length >= 5, `${s.id} has a real structure`);
      // polyphony estimate: notes sounding at once (dur in steps, ignoring release) stays modest
      const spb = s.stepsPerBar || 16;
      let worst = 0;
      for (const sec of Object.values(s.sections)) {
        const len = sec.bars * spb, cnt = new Array(len).fill(0);
        for (const tr of sec.tracks) {
          const p = s.patterns[typeof tr === "string" ? tr : tr.p], plen = p.bars * spb;
          for (let off = 0; off < len; off += plen) for (const n of p.notes) {
            const k = Array.isArray(n[1]) ? n[1].length : 1;
            for (let st = Math.floor(n[0] + off); st < Math.min(len, n[0] + off + n[2]); st++) cnt[st] += k;
          }
        }
        worst = Math.max(worst, ...cnt);
      }
      t.ok(worst <= 24, `${s.id} at most ${worst} notes at once (<= 24)`);
    }
  });

  t.test("every BONUS.md 10.3 event routes to a real sound", () => {
    const G = t.game(1234), a = { kind: "wolf", x: G.player.x + 64, y: G.player.y, w: 30, h: 22 };
    const tree = G.world.trees[0];
    const sample = {
      "tree:hit": { tree, work: 1, hp: 4, max: 8 }, "tree:fall": { tree, dir: 1, wood: 4, kind: tree.kind },
      "tile:hit": { tx: 400, ty: 60, tile: 3, work: 1, hp: 6 }, "tile:break": { tx: 400, ty: 60, tile: 5 },
      "tile:tooHard": { tx: 400, ty: 60, tile: 5, need: 2 }, "swing": { type: "axe", tier: 1, dir: 1, x: 0, y: 0 },
      "animal:hit": { a, dmg: 4, hp: 10 }, "animal:sound": { a, sound: "howl" }, "animal:windup": { a }, "animal:die": { a, x: a.x, y: a.y, kind: "wolf" },
      "animal:attack": { a }, "player:hurt": { dmg: 8, cause: "wolf", hp: 50 }, "player:die": { cause: "wolf" }, "player:respawn": {},
      "pickup": { id: "wood", n: 2 }, "craft": { recipe: "plank", id: "plank", n: 2, station: "workbench" }, "place": { id: "torch", tx: 400, ty: 40 },
      "player:eat": { id: "berries", raw: false, hunger: 6 }, "tool:break": { id: "wood_axe" }, "player:jump": { x: 0, y: 0 },
      "player:land": { impact: 8, fallTiles: 3 }, "player:splash": { vy: 7 }, "player:unsplash": {}, "house:upgrade": { level: 4, name: "Log hut" },
      "sleep": { start: true }, "garden:ripe": { beds: 2 }, "shoot": { x: 0, y: 0 },
    };
    for (const ev of REQUIRED_EVENTS) {
      const r = route(ev, sample[ev], G, {});
      t.ok(r && r.length && r.every((x) => SOUNDS[x.s]), `${ev} -> ${r ? r.map((x) => x.s).join("+") : "nothing"}`);
    }
    for (const ev of Object.keys(HANDLERS)) t.ok(typeof HANDLERS[ev] === "function", "handler " + ev);
    t.ok(route("sleep", { start: false }, G, {})[0].s === "rooster", "sleep end -> rooster");
    t.ok(route("house:upgrade", { level: 3, debug: true }, G, {}) === null, "debug house jumps stay quiet");
    t.ok(route("unknown:event", {}, G, {}) === null, "unknown events are ignored");
  });

  t.test("animals, stations, tiles, house levels all have sounds", () => {
    const G = t.game(1234);
    for (const [kind, d] of Object.entries(ANIMAL_DEFS)) {
      const a = { kind, x: G.player.x, y: G.player.y, w: 20, h: 20 };
      const r = route("animal:sound", { a, sound: d.sound }, G, {});
      t.ok(r && SOUNDS[r[0].s], `${kind} call "${d.sound}" -> ${r && r[0].s}`);
      for (const ev of ["animal:hit", "animal:windup", "animal:attack", "animal:die"]) { const q = route(ev, { a, hp: 3, dmg: 2 }, G, {}); t.ok(q && q.every((x) => SOUNDS[x.s]), `${kind} ${ev}`); }
    }
    t.eq(route("animal:sound", { a: { kind: "bear" }, sound: "growl" }, G, {})[0].s, "growl", "bear growl");
    t.eq(route("animal:windup", { a: { kind: "bear" } }, G, {})[0].s, "roar", "bear rears up with a roar");
    t.eq(route("animal:sound", { a: { kind: "goat" }, sound: "bleat" }, G, {})[0].s, "bleat_goat", "goat bleat differs from deer");
    const stations = new Set(RECIPES.map((r) => r.station));
    for (const st of stations) { const r = route("craft", { station: st }, G, {}); t.ok(r && r[0].s !== "craft_hand" || st === "hand", `station ${st} -> ${r[0].s}`); }
    TILE_DEFS.forEach((d, code) => { if (d.hp > 0) { const r = route("tile:hit", { tx: 1, ty: 1, tile: code }, G, {}); t.ok(r && SOUNDS[r[0].s], `tile ${d.id} -> ${r[0].s}`); } });
    t.eq(route("tile:hit", { tx: 1, ty: 1, tile: 1 }, G, {})[0].s, "dig", "dirt digs");
    t.ok(route("tile:hit", { tx: 1, ty: 1, tile: 6 }, G, {})[0].o.ore === 3, "gold ore rings brighter");
    for (let lv = 1; lv <= 20; lv++) { const r = route("house:upgrade", { level: lv }, G, {}); t.ok(r && SOUNDS[r[0].s], "house level " + lv); }
    t.eq(route("house:upgrade", { level: 10 }, G, {})[0].s, "upgrade_big", "level 10 is a big fanfare");
    t.eq(route("house:upgrade", { level: 20 }, G, {})[0].s, "house_complete", "level 20 = house complete");
    const m = {};
    const p1 = route("pickup", { id: "wood", n: 1 }, G, m)[0].o.pitch, p2 = route("pickup", { id: "wood", n: 1 }, G, m)[0].o.pitch;
    t.ok(p2 > p1, "pickup streak climbs in pitch");
  });

  t.test("every sound builds a finite node graph (mock context)", () => {
    const M = mockContext(), K = makeKit(M.ac, M.ac.createGain());
    const opts = [{}, { kind: "ancient", k: 0.9 }, { mat: "sand" }, { mat: "gravel" }, { mat: "clay" }, { ore: 4 }, { kind: "blade", tier: 4 }, { kind: "bow" }, { kind: "heavy" }, { pack: true }, { dmg: 18 }, { impact: 12 }, { raw: true }, { rare: true, pitch: 1.5 }, { big: true }];
    let total = 0;
    for (const name of SOUND_NAMES) {
      const S = SOUNDS[name];
      t.ok(S.len > 0 && S.gap >= 0 && S.pri >= 0 && S.pri <= 2, name + " has len/gap/pri");
      for (const o of opts) { const before = M.count(); S.play(K, M.ac.createGain(), 0.5, o); total = Math.max(total, M.count() - before); }
    }
    t.ok(M.bad.length === 0, "all automation values finite and positive where needed: " + M.bad.slice(0, 5).join(", "));
    t.ok(total < 400, `largest sound uses ${total} nodes (< 400)`);
    t.ok(SOUND_NAMES.length >= 40, SOUND_NAMES.length + " sounds");
  });

  t.test("ambience mix follows day/night, caves, the river and fires", () => {
    const G = t.game(1234), w = G.world;
    setDayF(G, 0.3);
    t.standAt(G, w.spawn.x);
    let m = env(G);
    t.ok(m.day > 0.9 && m.cave === 0, "spawn at noon: daylight, surface");
    for (const k of Object.keys(m)) if (typeof m[k] === "number") t.ok(Number.isFinite(m[k]) && m[k] >= 0 && m[k] <= 1, "mix " + k + " in 0..1");
    setDayF(G, 0.85);
    t.ok(env(G).night > 0.9, "midnight is night");
    const rx = Math.floor((w.river.x0 + w.river.x1) / 2) + 0;
    t.standAt(G, w.river.x0 - 3);
    t.ok(env(G).river > 0.8, "standing at the river bank: river loud (" + env(G).river.toFixed(2) + ")");
    t.standAt(G, w.spawn.x);
    t.ok(env(G).river < 0.3, "spawn is far from the river");
    // underground: move the body deep below the surface (no need to stand: env only reads the position)
    G.player.y = (w.surface[w.spawn.x] + 25) * t.T;
    t.ok(env(G).cave > 0.9, "25 rows down is a cave");
    t.ok(rx > 0, "river exists");
  });
}
