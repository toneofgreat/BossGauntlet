// ambience.js - BONUS_AUDIO: the living soundscape of the Wildwood (WebAudio; no DOM).
//   const amb = createAmbience(ac, out, K)    // out = a GainNode the layers mix into; K = makeKit(ac, reverbIn)
//   amb.update(dt, mix)                      // every frame; mix = env(G) (below) or a test override
//   amb.stop(fade)                           // fade out + release every node
// Layers (continuous loops whose gains follow the player's surroundings): wind, leaf rustle, river, crickets
// (one pre-rendered stereo loop), cave hum, campfire crackle. Events (scheduled from update() with real time, so
// nothing keeps running after stop): birds (5 species), woodpecker, dove, owls, frogs, cave drips, fire pops.
import { T } from "../core/const.js";
import { sun, phase } from "../core/time.js";
import { BIOMES } from "../data/tiles.js";

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

// What the player hears from where they stand. Pure (no audio), exported for tests.
export function env(G) {
  const p = G.player, w = G.world;
  const px = p.x + p.w / 2, py = p.y + p.h / 2, tx = Math.max(0, Math.min(w.W - 1, Math.floor(px / T)));
  const depth = py / T - w.surface[tx];
  const cave = clamp((depth - 3) / 9);
  const day = clamp((sun(G) - 0.1) / 0.9);
  const ph = phase(G);
  const biome = BIOMES[w.biome[tx]] || "meadow";
  let river = 0;
  if (w.river) {
    const rx = px / T, d = rx < w.river.x0 ? w.river.x0 - rx : rx > w.river.x1 ? rx - w.river.x1 : 0;
    river = clamp(1 - (d - 2) / 32) * (1 - 0.6 * cave);
  }
  let fire = 0;
  for (const L of w.lights || []) {
    if (L.kind !== "campfire" && L.kind !== "furnace") continue;
    const d = Math.hypot(L.x - px, L.y - py) / T;
    fire = Math.max(fire, clamp(1 - (d - 1.5) / 10) * (L.kind === "furnace" ? 0.5 : 1));
  }
  if (G.house && G.house.level >= 3 && w.houseX != null) { // the home hearth
    const d = Math.abs((w.houseX + 12) * T - px) / T;
    fire = Math.max(fire, clamp(1 - (d - 3) / 12) * 0.7 * (1 - cave));
  }
  const trees = biome === "forest" || biome === "pinewood" ? 1 : biome === "meadow" || biome === "river" ? 0.45 : 0.25;
  const high = clamp((46 - w.surface[tx]) / 25); // hill tops are windier
  return { day, night: 1 - day, dawn: ph === "dawn" ? 1 : 0, cave, river, fire, trees, high, biome, underwater: !!p.inWater };
}

// ---------------------------------------------------------------------------------- pre-rendered cricket loop
function cricketBuffer(ac) {
  const sr = ac.sampleRate, L = Math.floor(sr * 4), b = ac.createBuffer(2, L, sr);
  const chans = [b.getChannelData(0), b.getChannelData(1)];
  let s = 99;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const crickets = 5;
  for (let c = 0; c < crickets; c++) {
    const hz = 4100 + r() * 900, panL = 0.25 + r() * 0.75, panR = 1.25 - panL, amp = 0.05 + r() * 0.05;
    const period = 0.45 + r() * 0.5, pulses = 3 + Math.floor(r() * 3), rate = 26 + r() * 10;
    for (let t0 = r() * period; t0 < 4; t0 += period * (0.9 + r() * 0.2)) {
      for (let k = 0; k < pulses; k++) {
        const st = Math.floor((t0 + k / rate) * sr), n = Math.floor(sr * 0.014);
        for (let i = 0; i < n; i++) {
          const e = Math.sin(Math.PI * i / n), v = Math.sin(2 * Math.PI * hz * i / sr) * e * e * amp;
          const j = (st + i) % L;
          chans[0][j] += v * panL; chans[1][j] += v * panR;
        }
      }
    }
  }
  return b;
}

// the beds were ~20 dB under the songs (masked whenever music played): lift the whole ambience ~+10 dB
const AMB_LEVEL = 3.2;
export function createAmbience(ac, out, K) {
  const t0 = ac.currentTime, nodes = [], srcs = [];
  const master = ac.createGain(); master.gain.setValueAtTime(0, t0); master.gain.linearRampToValueAtTime(AMB_LEVEL, t0 + 2.5); master.connect(out);
  nodes.push(master);
  // a looping filtered-noise layer with its own gain (driven by update)
  const layer = (color, type, f, q, lfoRate = 0, lfoDepth = 0) => {
    const n = ac.createBufferSource(); n.buffer = K.noise(color); n.loop = true;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ac.createGain(); g.gain.value = 0;
    const m = ac.createGain(); m.gain.value = 1;
    n.connect(fl); fl.connect(m); m.connect(g); g.connect(master); n.start(t0, Math.random() * 2);
    srcs.push(n); nodes.push(fl, g, m);
    if (lfoRate) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = lfoRate; lg.gain.value = lfoDepth; l.connect(lg); lg.connect(m.gain); l.start(t0); srcs.push(l); nodes.push(lg); }
    return { fl, g };
  };
  const wind = layer("pink", "bandpass", 480, 0.6);
  const leaves = layer("white", "bandpass", 4300, 0.5, 0.17, 0.5);
  const river = layer("pink", "lowpass", 1300, 0.5);
  const riverHi = layer("white", "bandpass", 2600, 0.7, 0.31, 0.35);
  const hum = layer("brown", "lowpass", 160, 0.7);
  const crackle = layer("pink", "lowpass", 700, 0.5, 0.9, 0.6);
  // cave drone: a soft low sine pair
  const droneG = ac.createGain(); droneG.gain.value = 0; droneG.connect(master); nodes.push(droneG);
  for (const f of [55, 82.6]) { const o = ac.createOscillator(); o.frequency.value = f; const g = ac.createGain(); g.gain.value = f < 60 ? 1 : 0.4; o.connect(g); g.connect(droneG); o.start(t0); srcs.push(o); nodes.push(g); }
  // crickets
  const cr = ac.createBufferSource(); cr.buffer = cricketBuffer(ac); cr.loop = true;
  const crG = ac.createGain(); crG.gain.value = 0; cr.connect(crG); crG.connect(master); cr.start(t0); srcs.push(cr); nodes.push(crG);
  K.send(crG, 0.25);

  const set = (param, v, tc = 0.6) => param.setTargetAtTime(v, ac.currentTime, tc);
  let gust = 0, gustT = 0;
  const timers = { bird: 1.5, wood: 12, dove: 6, owl: 6, frog: 2, drip: 1, pop: 0.3 };
  const ev = ac.createGain(); ev.gain.value = 1; ev.connect(master); nodes.push(ev);
  const spot = (pan, rev) => { const g = ac.createGain(); g.connect(K.pan(ev, pan)); if (rev) K.send(g, rev); return g; };
  const rp = () => (Math.random() * 2 - 1) * 0.85;

  // ---- event voices ----
  function bird(at, m) {
    const d = spot(rp(), 0.35), kind = Math.floor(Math.random() * 4), base = 2500 + Math.random() * 1700, g = 0.022 + Math.random() * 0.016;
    if (kind === 0) { const n = 6 + Math.floor(Math.random() * 6); for (let i = 0; i < n; i++) K.tone(d, at + i * 0.065, { f0: base * (1.25 - i * 0.03), f1: base * (1.05 - i * 0.03), sweep: 0.03, dur: 0.045, gain: g * 0.8 }); } // warbler trill
    else if (kind === 1) { const n = 3 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) { const f = base * (0.8 + Math.random() * 0.5); K.tone(d, at + i * 0.2, { f0: f, f1: f * (Math.random() < 0.5 ? 1.25 : 0.8), sweep: 0.08, dur: 0.14, gain: g }); } } // robin phrase
    else if (kind === 2) { K.tone(d, at, { f0: 3900, f1: 3850, dur: 0.28, gain: g, attack: 0.03 }); K.tone(d, at + 0.36, { f0: 3300, f1: 3250, dur: 0.3, gain: g * 0.9, attack: 0.03 }); } // "fee-bee"
    else { K.tone(d, at, { f0: base * 1.2, f1: base * 0.85, dur: 0.4, gain: g, vib: 350, vibRate: 26 }); } // finch buzz
  }
  function woodpecker(at) { const d = spot(rp(), 0.3); const n = 10 + Math.floor(Math.random() * 6); for (let i = 0; i < n; i++) K.burst(d, at + i * 0.055, { type: "bandpass", f: 1400, q: 5, dur: 0.02, gain: 0.05 * (1 - i / n * 0.5) }); }
  function dove(at) { const d = spot(rp(), 0.35); [[0, 0.3, 0.6], [0.4, 0.5, 1], [1.0, 0.3, 0.8], [1.4, 0.3, 0.7]].forEach(([o, du, k]) => K.voice(d, at + o, { wave: "sine", pts: [[0, 440], [du * 0.4, 500], [du, 430]], dur: du, gain: 0.04 * k, attack: 0.05, release: 0.12 })); }
  function owl(at) { const d = spot(rp(), 0.6); [[0, 0.22], [0.4, 0.16], [0.62, 0.5]].forEach(([o, du]) => K.voice(d, at + o, { wave: "sine", pts: [[0, 360], [du * 0.3, 390], [du, 330]], dur: du, gain: 0.05, formants: [], attack: 0.06, release: du * 0.5, breath: 0.004 })); }
  function frog(at) { const d = spot(rp(), 0.2); const n = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) K.voice(d, at + i * 0.22, { pts: [[0, 140], [0.12, 120]], dur: 0.14, gain: 0.07, formants: [[450, 4, 1], [1100, 5, 0.4]], am: 40, amDepth: 1, attack: 0.01, release: 0.05 }); }
  function drip(at) { const d = spot(rp() * 0.6, 0.8), f = 1100 + Math.random() * 1500; K.tone(d, at, { f0: f, f1: f * 1.6, sweep: 0.03, dur: 0.12, gain: 0.05 }); }
  function pop(at) { const d = spot(rp() * 0.3, 0.05); K.burst(d, at, { type: "bandpass", f: 2000 + Math.random() * 4000, q: 2, dur: 0.012 + Math.random() * 0.02, gain: 0.05 + Math.random() * 0.06 }); }

  let stopped = false;
  function tick(name, dt, mean, fn) { // Poisson-ish: next event in mean * (0.5 .. 1.5) seconds
    if ((timers[name] -= dt) > 0) return;
    timers[name] = mean * (0.5 + Math.random());
    if (fn) fn(ac.currentTime + 0.05);
  }
  return {
    update(dt, m) {
      if (stopped || !m) return;
      dt = Math.min(0.25, Math.max(0, dt));
      const surf = 1 - m.cave, uw = m.underwater ? 0.35 : 1;
      // wind gusts wander
      if ((gustT -= dt) <= 0) { gustT = 1.5 + Math.random() * 3; gust = Math.random(); set(wind.fl.frequency, 300 + gust * 500 + m.high * 300, 1.2); }
      set(wind.g.gain, uw * surf * (0.026 + 0.04 * gust) * (0.7 + 0.8 * m.high), 1.2);
      set(leaves.g.gain, uw * surf * m.trees * (0.009 + 0.012 * gust) * (0.5 + 0.5 * m.day));
      set(river.g.gain, uw * m.river * 0.09);
      set(riverHi.g.gain, uw * m.river * 0.025);
      set(hum.g.gain, m.cave * 0.07);
      set(droneG.gain, m.cave * 0.018);
      set(crG.gain, uw * surf * m.night * 0.55 * (0.4 + 0.6 * (1 - m.high)), 1.5);
      set(crackle.g.gain, m.fire * 0.035);
      const bio = m.trees, d = m.day * surf * uw;
      tick("bird", dt, 2.6 / Math.max(0.05, d * (0.4 + 0.6 * bio)), d > 0.15 ? bird : null);
      tick("wood", dt, 22, d > 0.5 && m.trees >= 1 ? woodpecker : null);
      tick("dove", dt, m.dawn ? 9 : 26, d > 0.2 && m.biome !== "hills" ? dove : null);
      tick("owl", dt, 15, m.night > 0.7 && surf > 0.5 && m.trees > 0.4 ? owl : null);
      tick("frog", dt, 3.5, m.night > 0.5 && m.river > 0.4 ? frog : null);
      tick("drip", dt, 1.8, m.cave > 0.4 ? drip : null);
      tick("pop", dt, 0.35 / Math.max(0.05, m.fire), m.fire > 0.1 ? pop : null);
    },
    stop(fade = 1.2) {
      if (stopped) return; stopped = true;
      const t = ac.currentTime;
      master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + fade);
      // disconnect BEFORE stopping the looped sources (stopping a wrapped looping source can emit garbage in Chrome)
      const free = () => {
        try { master.disconnect(); } catch (e) { /* gone */ }
        for (const n of nodes) { try { n.disconnect(); } catch (e) { /* gone */ } }
        for (const s of srcs) { try { s.disconnect(); s.stop(); } catch (e) { /* already stopped */ } }
      };
      if (typeof setTimeout !== "undefined" && typeof ac.startRendering !== "function") setTimeout(free, (fade + 0.2) * 1000);
    },
    get stopped() { return stopped; },
  };
}
