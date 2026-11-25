// simtest.mjs - headless tests for the deterministic sim + level format.   node tools/simtest.mjs
// Prints measured physics facts (used in CONTRACT.md) and exits 1 on any failure.
import {
  createSim, emptyLevel, validateLevel, normalizeLevel, packLevel, unpackLevel, levelHash,
  T, PW, PH, IN_LEFT as L, IN_RIGHT as R, IN_JUMP as J,
} from "../src/sim/index.js";
import testLevel from "../src/levels/test.js";

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log("FAIL:", msg); } }
const facts = {};

function lvl(rowsFn, w = 60, h = 20, extra = {}) {
  const L0 = emptyLevel({ w, h });
  const rows = L0.tiles.map((r) => r.split(""));
  rowsFn((x, y, ch) => { if (x >= 0 && y >= 0 && x < w && y < h) rows[y][x] = ch; }, rows);
  L0.tiles = rows.map((r) => r.join(""));
  return Object.assign(L0, extra);
}
const hold = (sim, inp, n) => { for (let i = 0; i < n; i++) sim.step(inp); return sim.state; };

// ---------- format ----------
{
  const v = validateLevel(testLevel);
  ok(v.ok, "test level validates: " + v.errors.join("; "));
  if (v.warnings.length) console.log("  test level warnings:", v.warnings.join(" | "));
  const packed = packLevel(testLevel);
  const back = unpackLevel(packed);
  ok(JSON.stringify(back) === JSON.stringify(normalizeLevel(testLevel)), "pack/unpack round trip");
  ok(levelHash(testLevel) === levelHash(back), "levelHash stable");
  facts.testLevelPackedBytes = packed.length;
  const bad = JSON.parse(JSON.stringify(testLevel)); bad.tiles[3] = bad.tiles[3].slice(1);
  ok(!validateLevel(bad).ok, "validate rejects ragged rows");
  const bad2 = Object.assign({}, testLevel, { music: "nope" });
  ok(!validateLevel(bad2).ok, "validate rejects unknown music");
  const bad3 = Object.assign({}, testLevel, { entities: [{ t: "pulse", x: 1, y: 1, period: 10 }] });
  ok(!validateLevel(bad3).ok, "validate rejects bad pulse");
  ok(!validateLevel(emptyLevel({ w: 500 }), { community: true }).ok, "community width limit");
}

// ---------- basic physics ----------
{
  const sim = createSim(emptyLevel({ w: 200, h: 20 }), { events: true });
  hold(sim, 0, 5);
  ok(sim.state.grounded, "grounded on spawn");
  const y0 = sim.state.y;
  ok(Math.abs(y0 + PH - 17 * T) < 1e-9, "stands exactly on ground top");
  let f = 0; while (sim.state.vx < 3.5 && f < 100) { sim.step(R); f++; }
  facts.framesToFullSpeed = f; facts.runSpeedTilesPerSec = +(3.5 * 60 / T).toFixed(2);
  // max jump height (hold)
  let s = createSim(emptyLevel({ w: 200, h: 20 })); hold(s, 0, 3);
  let minY = s.state.y; s.step(J); let n = 0;
  while (!s.state.grounded || n < 2) { s.step(J); minY = Math.min(minY, s.state.y); n++; if (n > 200) break; }
  facts.maxJumpPx = +(y0 - minY).toFixed(1); facts.maxJumpTiles = +((y0 - minY) / T).toFixed(2); facts.fullJumpAirFrames = n + 1;
  // tap jump
  s = createSim(emptyLevel({ w: 200, h: 20 })); hold(s, 0, 3);
  minY = s.state.y; s.step(J); s.step(0);
  for (let i = 0; i < 80; i++) { s.step(0); minY = Math.min(minY, s.state.y); }
  facts.tapJumpPx = +(y0 - minY).toFixed(1);
  ok(facts.maxJumpPx > 2 * T + 10 && facts.maxJumpPx < 3 * T, "full jump clears 2 tiles, not 3: " + facts.maxJumpPx);
  ok(facts.tapJumpPx < facts.maxJumpPx * 0.6, "variable jump height works");
}

// max gap on flat ground at full speed, jumping at the last moment (with coyote)
function crossGap(gap, hdiff = 0) {
  // ground left to col 19, gap cols 20..19+gap, landing ground after, landing surface raised by hdiff tiles
  const lv = lvl((set) => {
    for (let x = 20; x < 20 + gap; x++) for (let y = 17; y < 20; y++) set(x, y, ".");
    for (let x = 20 + gap; x < 60; x++) for (let y = 17 - hdiff; y < 17; y++) set(x, y, "#");
  });
  let best = false;
  for (let wait = 0; wait <= 14 && !best; wait++) {
    const s = createSim(lv);
    // run up from the start
    let fr = 0;
    while (s.state.x + PW < 20 * T - 1 && fr < 400) { s.step(R); fr++; }
    // keep running "wait" more frames, then jump and hold
    for (let i = 0; i < wait; i++) s.step(R);
    for (let i = 0; i < 120 && !s.state.dead; i++) s.step(R | J);
    if (!s.state.dead && s.state.x > (20 + gap) * T) best = true;
  }
  return best;
}
{
  let g = 1; while (crossGap(g + 1) && g < 12) g++;
  facts.maxGapTilesFlat = g;
  let g1 = 1; while (crossGap(g1 + 1, 1) && g1 < 12) g1++;
  facts.maxGapTilesUp1 = g1;
  let g2 = 0; while (crossGap(g2 + 1, 2) && g2 < 12) g2++;
  facts.maxGapTilesUp2 = g2;
  ok(g >= 4 && g <= 6, "flat gap max in 4..6: " + g);
}

// ---------- slopes ----------
{
  // 45 ramp up 5, plateau, ramp down 5; gentle ramp up 3 and down 3.
  const lv = lvl((set) => {
    const up = (x, y, n) => { for (let i = 0; i < n; i++) { set(x + i, y - i, "/"); for (let yy = y - i + 1; yy < 17; yy++) set(x + i, yy, "#"); } };
    const dn = (x, y, n) => { for (let i = 0; i < n; i++) { set(x + i, y + i, "\\"); for (let yy = y + i + 1; yy < 17; yy++) set(x + i, yy, "#"); } };
    up(10, 16, 5); for (let x = 15; x < 20; x++) for (let y = 12; y < 17; y++) set(x, y, "#"); dn(20, 12, 5);
    for (let i = 0; i < 3; i++) { set(30 + 2 * i, 16 - i, "a"); set(31 + 2 * i, 16 - i, "b"); for (let yy = 17 - i; yy < 17; yy++) { set(30 + 2 * i, yy, "#"); set(31 + 2 * i, yy, "#"); } }
    for (let x = 36; x < 38; x++) for (let y = 14; y < 17; y++) set(x, y, "#");
    for (let i = 0; i < 3; i++) { set(38 + 2 * i, 14 + i, "c"); set(39 + 2 * i, 14 + i, "d"); for (let yy = 15 + i; yy < 17; yy++) { set(38 + 2 * i, yy, "#"); set(39 + 2 * i, yy, "#"); } }
  }, 60);
  const s = createSim(lv);
  let air = 0, maxY = 0, frames = 0, stuck = 0, lastX = s.state.x;
  while (s.state.x < 50 * T && frames < 1200) {
    s.step(R); frames++;
    if (frames > 20 && !s.state.grounded) air++;
    if (s.state.x - lastX < 0.5 && frames > 20) stuck++;
    lastX = s.state.x;
  }
  facts.slopeWalkFrames = frames; facts.slopeWalkAirFrames = air;
  ok(s.state.x >= 50 * T, "walks over 45 and 22.5 deg hills without getting stuck (stuck frames " + stuck + ")");
  ok(air <= 2, "stays glued to slopes walking (air frames " + air + ")");
  ok(!s.state.dead, "alive after slopes");
  // walk back left the same way
  let fr2 = 0; while (s.state.x > 3 * T && fr2 < 1200) { s.step(L); fr2++; }
  ok(s.state.x <= 3 * T, "walks back left over the hills");
  // standing still on a 45 slope: no sliding
  const s2 = createSim(lv); while (s2.state.x < 12 * T) s2.step(R);
  hold(s2, 0, 30); const xs = s2.state.x, ys = s2.state.y; hold(s2, 0, 60);
  ok(Math.abs(s2.state.x - xs) < 1e-9 && Math.abs(s2.state.y - ys) < 1e-9 && s2.state.grounded, "rests still on a slope");
  // wall from the high side of '/' blocks (floating slope)
  const lv3 = lvl((set) => { set(20, 16, "/"); }, 60);
  const s3 = createSim(Object.assign(lv3, { start: { x: 25, y: 16 } }));
  hold(s3, L, 120);
  ok(Math.abs(s3.state.x - 21 * T) < 1e-6, "high face of '/' acts as a wall from the right (x=" + s3.state.x + ")");
}

// ---------- walls, ceilings, hazards, triggers ----------
{
  const lv = lvl((set) => { for (let y = 14; y < 17; y++) set(15, y, "#"); });
  const s = createSim(lv); hold(s, R, 120);
  ok(Math.abs(s.state.x + PW - 15 * T) < 1e-6, "3-tile wall blocks");
  const lv2 = lvl((set) => { set(15, 16, "^"); });
  const s2 = createSim(lv2, { events: true }); let died = false;
  for (let i = 0; i < 200; i++) { s2.step(R); if (s2.events.some((e) => e.type === "die")) died = true; }
  ok(died && s2.state.deaths === 1, "spikes kill");
  const lv3 = lvl((set) => { for (let x = 15; x < 18; x++) for (let y = 17; y < 20; y++) set(x, y, "~"); });
  const s3 = createSim(lv3); hold(s3, R, 200);
  ok(s3.state.deaths >= 1, "water kills");
  const lv4 = lvl((set) => { for (let x = 15; x < 18; x++) for (let y = 17; y < 20; y++) set(x, y, "."); });
  const s4 = createSim(lv4); hold(s4, R, 200);
  ok(s4.state.deaths >= 1 && s4.state.deathCause === "pit", "pits kill");
  // checkpoint + respawn
  const lv5 = lvl((set) => { set(30, 16, "^"); }, 60, 20, { checkpoints: [{ x: 20, y: 16 }] });
  const s5 = createSim(lv5); let fr = 0; while (s5.state.deaths === 0 && fr < 600) { s5.step(R); fr++; }
  ok(s5.state.cp === 0, "checkpoint activated");
  hold(s5, 0, 45);
  const sp = s5.spawnPoint(0);
  ok(!s5.state.dead && Math.abs(s5.state.x - sp.x) < 1e-6, "respawned at checkpoint");
  // ceiling
  const lv6 = lvl((set) => { for (let x = 0; x < 30; x++) set(x, 14, "R"); });
  const s6 = createSim(lv6); hold(s6, 0, 3); hold(s6, J, 30);
  ok(s6.state.y >= 15 * T - 1e-6, "ceiling stops jump");
  // one-way
  const lv7 = lvl((set) => { for (let x = 0; x < 10; x++) set(x, 15, "-"); });
  const s7 = createSim(lv7); hold(s7, 0, 3); hold(s7, J, 22); hold(s7, 0, 60);
  ok(s7.state.grounded && Math.abs(s7.state.y + PH - 15 * T) < 1e-6, "jump up through one-way and land on it");
  // spring
  const lv8 = lvl(() => {}, 60, 30, { start: { x: 10, y: 20 }, entities: [{ t: "spring", x: 10, y: 26 }] });
  const s8 = createSim(lv8, { events: true }); let top = 1e9, sprung = false;
  for (let i = 0; i < 200; i++) { s8.step(0); top = Math.min(top, s8.state.y); if (s8.events.some((e) => e.type === "spring")) sprung = true; }
  facts.springHeightTiles = +((26 * T + 14 - PH - top) / T).toFixed(2);
  ok(sprung && facts.springHeightTiles > 5, "spring launches (" + facts.springHeightTiles + " tiles)");
  // crumble
  const lv9 = lvl((set) => { for (let x = 10; x < 14; x++) for (let y = 17; y < 20; y++) set(x, y, "."); }, 60, 20, { start: { x: 11, y: 16 }, entities: [{ t: "crumble", x: 10, y: 17, w: 4 }] });
  const s9 = createSim(lv9, { events: true }); let broke = false;
  for (let i = 0; i < 120; i++) { s9.step(0); if (s9.events.some((e) => e.type === "crumble_break")) broke = true; }
  ok(broke && s9.state.deaths >= 1, "crumble breaks under you");
  // mover carries
  const lv10 = lvl((set) => { for (let x = 10; x < 30; x++) for (let y = 17; y < 20; y++) set(x, y, "."); }, 60, 20, { start: { x: 10, y: 16 }, entities: [{ t: "mover", x: 10, y: 17, w: 3, path: [[15, 0]], speed: 2 }] });
  const s10 = createSim(lv10); hold(s10, 0, 300);
  ok(!s10.state.dead && s10.state.x > 18 * T && s10.state.grounded, "mover carries the player (x=" + (s10.state.x / T).toFixed(1) + ")");
  // moving hazard
  const lv11 = lvl(() => {}, 60, 20, { entities: [{ t: "hazard", x: 12, y: 16, r: 0.45, path: [] }] });
  const s11 = createSim(lv11); hold(s11, R, 150);
  ok(s11.state.deaths >= 1 && s11.state.deathCause === "hazard", "moving hazard kills");
  // pulse
  const lv12 = lvl(() => {}, 60, 20, { entities: [{ t: "pulse", x: 8, y: 14, w: 1, h: 3, period: 60, on: 59 }] });
  const s12 = createSim(lv12); hold(s12, R, 150);
  ok(s12.state.deaths >= 1 && s12.state.deathCause === "pulse", "pulse kills when active");
  // goal
  const s13 = createSim(emptyLevel({ w: 40, h: 20 })); let w = 0; while (!s13.state.won && w < 600) { s13.step(R); w++; }
  ok(s13.state.won && s13.state.winFrame > 0, "goal reached: winFrame " + s13.state.winFrame);
  // ice is slippery
  const lv14 = lvl((set) => { for (let x = 0; x < 60; x++) set(x, 17, "I"); });
  const s14 = createSim(lv14); hold(s14, R, 60); const x0 = s14.state.x; hold(s14, 0, 60);
  const iceSlide = s14.state.x - x0;
  const s15 = createSim(emptyLevel({ w: 60, h: 20 })); hold(s15, R, 60); const x1 = s15.state.x; hold(s15, 0, 60);
  facts.iceStopPx = +iceSlide.toFixed(1); facts.groundStopPx = +(s15.state.x - x1).toFixed(1);
  ok(iceSlide > 4 * (s15.state.x - x1), "ice slides much further");
  // coyote + buffer
  const lv16 = lvl((set) => { for (let x = 20; x < 30; x++) for (let y = 17; y < 20; y++) set(x, y, "."); });
  const s16 = createSim(lv16); while (s16.state.grounded) s16.step(R);
  hold(s16, R, 3); s16.step(R | J);
  ok(s16.state.vy < 0, "coyote jump works 3 frames after leaving the edge");
  const s17 = createSim(emptyLevel({ w: 60, h: 20 })); hold(s17, 0, 3); hold(s17, J, 2); hold(s17, 0, 30);
  while (s17.state.y + PH < 17 * T - 12) s17.step(0);
  s17.step(J); let jumpedAgain = false; for (let i = 0; i < 8; i++) { s17.step(J); if (s17.state.vy < -5) jumpedAgain = true; }
  ok(jumpedAgain, "jump buffer: press just before landing jumps on landing");
}

// ---------- determinism, snapshot/restore ----------
{
  let seed = 12345; const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  const inputs = new Uint8Array(3000);
  for (let i = 0; i < inputs.length; i++) inputs[i] = rnd() < 0.8 ? R | (rnd() < 0.3 ? J : 0) : (rnd() < 0.5 ? L : J);
  const a = createSim(testLevel, { events: false }); a.run(inputs);
  const b = createSim(testLevel, { events: false }); b.run(inputs);
  ok(JSON.stringify(a.snapshot()) === JSON.stringify(b.snapshot()), "deterministic replay");
  const c = createSim(testLevel, { events: false });
  for (let i = 0; i < 1500; i++) c.step(inputs[i]);
  const snap = c.snapshot();
  for (let i = 1500; i < 2200; i++) c.step(L | J);
  c.restore(snap);
  for (let i = 1500; i < 3000 && !c.state.won; i++) c.step(inputs[i]);
  ok(JSON.stringify(c.snapshot()) === JSON.stringify(a.snapshot()), "snapshot/restore branches exactly");
  // speed
  const sp = createSim(testLevel, { events: false }); const t0 = performance.now(); let n = 0;
  while (performance.now() - t0 < 300) { for (let i = 0; i < 1000; i++) { sp.step(inputs[n % 3000]); n++; } if (sp.state.won) sp.reset(); }
  facts.stepsPerSecond = Math.round(n / ((performance.now() - t0) / 1000));
  const ss = createSim(testLevel, { events: false }); const t1 = performance.now(); let m = 0;
  while (performance.now() - t1 < 200) { for (let i = 0; i < 1000; i++) ss.restore(ss.snapshot()); m += 1000; }
  facts.snapshotRestorePerSecond = Math.round(m / ((performance.now() - t1) / 1000));
}

// ---------- a tiny beam-search solver proves the test level is beatable ----------
export function beamSolve(level, { beam = 400, maxMacros = 400, macro = 8 } = {}) {
  const A = [
    { n: "R", f: (i) => R }, { n: "RJ", f: (i) => (i === 0 ? R : R | J) }, { n: "RH", f: () => R | J },
    { n: "N", f: () => 0 }, { n: "NH", f: () => J }, { n: "L", f: () => L }, { n: "LJ", f: (i) => (i === 0 ? L : L | J) }, { n: "LH", f: () => L | J },
  ];
  const sim = createSim(level, { events: false });
  const goalX = (level.goal.x + 0.5) * T;
  let layer = [{ snap: sim.snapshot(), inputs: [] }];
  for (let d = 0; d < maxMacros; d++) {
    const next = new Map();
    for (const node of layer) {
      for (const a of A) {
        sim.restore(node.snap);
        const deaths = sim.state.deaths;
        const ins = [];
        for (let i = 0; i < macro; i++) { const b = a.f(i); ins.push(b); sim.step(b); if (sim.state.won) break; }
        if (sim.state.deaths > deaths) continue;
        const inputs = node.inputs.concat(ins);
        if (sim.state.won) return { won: true, inputs, frames: sim.state.winFrame };
        const st = sim.state;
        const key = `${Math.round(st.x / 6)},${Math.round(st.y / 6)},${st.grounded ? 1 : 0},${Math.round(st.vy / 3)},${Math.round(st.vx)},${st.cp}`;
        const score = st.x - Math.abs(goalX - st.x) * 0 + st.cp * 2000 - st.y * 0.1;
        const prev = next.get(key);
        if (!prev || prev.score < score) next.set(key, { snap: sim.snapshot(), inputs, score });
      }
    }
    layer = [...next.values()].sort((p, q) => q.score - p.score).slice(0, beam);
    if (!layer.length) return { won: false };
  }
  return { won: false };
}
{
  const t0 = performance.now();
  const res = beamSolve(testLevel);
  facts.testLevelSolveMs = Math.round(performance.now() - t0);
  ok(res.won, "beam solver beats the test level");
  if (res.won) {
    facts.testLevelSolveFrames = res.frames;
    const s = createSim(testLevel, { events: false });
    s.run(Uint8Array.from(res.inputs));
    ok(s.state.won && s.state.deaths === 0, "solution replays deterministically on a fresh sim");
  }
}

console.log("FACTS", JSON.stringify(facts, null, 1));
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
