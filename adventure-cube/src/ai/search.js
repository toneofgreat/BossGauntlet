// search.js - the AI player's route finder (RATER owns). NO DOM, deterministic (bounded by work units, not time).
//
// searchSegment(env, startSnap, stage, budget) runs a weighted A* (best-first) over macro-actions on the real sim:
//   a node = a sim snapshot; children = hold a direction (right / none / left) for M frames with the jump button
//   off / on (pressed or kept held) / re-pressed; the fine stage adds 1-frame nudges. Duplicate states are merged by
//   a quantized hash (position, velocity, flags, riding mover, nearby crumble states, and time for levels with
//   moving/timed things). Priority = frames used + W * (navigation-field distance in frames) + a small hazard penalty.
// simplifyRoute() then removes needless input changes (keeps the route valid) so the difficulty measurement sees a
// human-like plan instead of AI jitter.
import { T, IN_LEFT as L, IN_RIGHT as R, IN_JUMP as J } from "../sim/index.js";
import { Heap, fieldAt } from "./nav.js";
import { supportMargins, failProb } from "./margin.js";

export const FRAMES_PER_TILE = T / 3.5; // run speed 3.5 px/frame

// work units: 1 per sim step + SNAP_COST per restore/snapshot pair (measured: ~20 steps)
export const SNAP_COST = 20;

// Stages run coarse -> fine until one finds a route. holds = jump-arc hold lengths (frames), offs = frames of running
// before an arc's press (frame-precise takeoffs exactly where they matter, without frame-level dithering elsewhere).
export const STAGES = [
  { name: "coarse", M: 6, qx: 4, qy: 4, qvx: 1, qvy: 0.5, W: 3.0, holds: [20, 10], offs: [0, 3], share: 0.2 },
  { name: "beam", beam: true, M: 5, B: 120, qx: 3, qy: 3, qvx: 2, qvy: 1, share: 0.45 },
  { name: "medium", M: 4, qx: 3, qy: 3, qvx: 2, qvy: 1, W: 5, holds: [20, 12, 6], offs: [0, 1, 2, 3], share: 0.2 },
  { name: "fine", M: 3, qx: 3, qy: 3, qvx: 2, qvy: 1, W: 5, holds: [20, 14, 9, 4], offs: [0, 1, 2], share: 0.15 },
];

const DIRS = [R, 0, L];
// cost per frame spent close to anything deadly (spikes, water, moving hazards, pulses that are on or about to
// fire): a careful player keeps a margin and waits for safe timing; the route should too.
const PROX_PX = 22, PROX_K = 0.7;
function proximityCost(sim, n, env) {
  if (!env.careful) return 0;
  const d = sim.nearestHazard(13 + PROX_PX);
  if (d === Infinity) return 0;
  const m = Math.max(0, d - 13);
  return m >= PROX_PX ? 0 : n * PROX_K * (1 - m / PROX_PX);
}
const AIR_COST = 0.6;
const MAX_OPEN = 150000; // open-list cap (each node holds a sim snapshot): keeps memory well under ~80 MB

// Precomputed byte programs. Each action has bytes for "jump currently not held" [0] and "held" [1].
//   ground: hold a direction M frames with jump off / on (press) / re-press; jump arcs: run k frames, press, hold h.
//   air:    a direction M frames with jump off; while rising with jump held also "keep holding" (variable height);
//           the fine stage also has 1-frame air steering.
function actionsFor(stage, dynamic) {
  const mk = (arr) => Uint8Array.from(arr);
  const rep = (b, n) => new Array(n).fill(b);
  const ground = [], air = [], rise = [];
  for (const d of DIRS) {
    ground.push([mk(rep(d, stage.M)), mk(rep(d, stage.M))]);
    ground.push([mk(rep(d | J, stage.M)), mk([d].concat(rep(d | J, stage.M - 1)))]);
    for (const h of stage.holds) for (const k of stage.offs) {
      const pre = rep(d, k);
      ground.push([mk(pre.concat(rep(d | J, h))), mk((k ? pre : [d]).concat(rep(d | J, h)))]);
    }
    air.push(mk(rep(d, stage.M)));
    rise.push(mk(rep(d | J, stage.M)));
    if (stage.fineAir) { air.push(mk([d])); rise.push(mk([d | J])); }
  }
  // levels with moving / timed things: standing (or riding) still for a while is a cheap single action
  if (dynamic) for (const n of [12, 36]) ground.push([mk(rep(0, n)), mk(rep(0, n))]);
  return { ground, air, rise };
}

// Time component of the state hash: 0 for static levels, frame modulo the common period when all moving/timed
// things repeat with an integer period (bounded state space), else the absolute frame bucket.
export function makeTimeInfo(sim) {
  const C = sim.compiled;
  const periods = [];
  let dynamic = false, irregular = false;
  for (const p of C.pulses) { dynamic = true; periods.push(p.period); }
  const addPath = (P) => {
    if (!P || P.total <= 0 || P.speed <= 0) return;
    dynamic = true;
    const f = P.cycle / P.speed;
    const r = Math.round(f);
    if (Math.abs(f - r) < 1e-6 && r > 0) periods.push(r); else irregular = true;
  };
  for (const m of C.movers) addPath(m.P);
  for (const h of C.hazards) addPath(h.P);
  if (!dynamic) return { dynamic: false, period: 0 };
  if (irregular) return { dynamic: true, period: 0 };
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  let l = 1;
  for (const p of periods) { l = (l / gcd(l, p)) * p; if (l > 3600) return { dynamic: true, period: 0 }; }
  return { dynamic: true, period: l };
}

function stateKey(st, stage, env) {
  let k = Math.round(st.x / stage.qx) + "," + Math.round(st.y / stage.qy) + "," + Math.round(st.vx * stage.qvx) + "," +
    Math.round(st.vy * stage.qvy) + "," + ((st.grounded ? 1 : 0) | (st.held ? 2 : 0) | (st.coyote > 0 ? 4 : 0) | (st.springing ? 8 : 0)) +
    "," + st.ride + "," + st.cp;
  const ti = env.time;
  if (ti.dynamic) {
    const tq = Math.max(4, stage.M);
    k += "," + (ti.period > 0 ? Math.floor((st.frame % ti.period) / tq) : Math.floor(st.frame / tq));
  }
  const cr = env.crumbleX;
  if (cr.length) {
    const px = st.x;
    let s = "";
    for (let i = 0; i < cr.length; i++) {
      const dx = cr[i] - px;
      if (dx < -384 || dx > 384) continue;
      const c = st.crumble[i];
      if (c !== 0) s += i + (c > 0 ? "s" + ((c + 7) >> 3) : "b" + Math.floor(-c / 38));
    }
    k += "|" + s;
  }
  return k;
}

// env: { sim, nav, F, time, crumbleX, success(st), maxFrames }
// returns { ok, bytes, work, expanded, exhausted, bestH }
export function searchSegment(env, startSnap, stage, budget, tick) {
  const { sim, nav, F } = env;
  const st = sim.state;
  const A = actionsFor(stage, env.time.dynamic);
  const heap = new Heap();
  const seen = new Map();
  const par = [-1], byt = [null], gs = [0], snaps = [startSnap], lau = [startSnap.springing ? 1 : 0];
  sim.restore(startSnap);
  const f0 = st.frame;
  seen.set(stateKey(st, stage, env), 1);
  heap.push(0, 0);
  let work = 0, expanded = 0, bestH = fieldAt(nav, F, st.x, st.y), bestX = st.x, bestY = st.y;
  const buf = new Uint8Array(256); // longer than any action program
  const WF = stage.W * FRAMES_PER_TILE;
  while (heap.size) {
    if (work > budget || heap.size > MAX_OPEN) return { ok: false, work, expanded, exhausted: false, bestH, bestX, bestY };
    const ni = heap.pop();
    const snap = snaps[ni]; snaps[ni] = null;
    expanded++;
    if ((expanded & 511) === 0 && tick) tick(work, bestH);
    if (env.debug) env.debug(snap, gs[ni], heap.size);
    const held = snap.held, g0 = gs[ni];
    const canJump = snap.grounded || snap.coyote > 0;
    let list;
    if (canJump) list = A.ground; else list = held && snap.vy < 0 ? A.air.concat(A.rise) : A.air;
    for (let ai = 0; ai < list.length; ai++) {
      const prog = canJump ? list[ai][held ? 1 : 0] : list[ai];
      sim.restore(snap);
      work += SNAP_COST;
      const deaths0 = st.deaths;
      let n = 0, won = false, died = false;
      for (let i = 0; i < prog.length; i++) {
        const b = prog[i];
        buf[n++] = b;
        sim.step(b);
        if (st.dead || st.deaths > deaths0) { died = true; break; }
        if (env.success(st)) { won = true; break; }
      }
      work += n;
      if (died) continue;
      if (won) {
        const parts = [buf.slice(0, n)];
        for (let p = ni; p > 0; p = par[p]) parts.push(byt[p]);
        let len = 0; for (const q of parts) len += q.length;
        const out = new Uint8Array(len);
        let o = 0;
        for (let i = parts.length - 1; i >= 0; i--) { out.set(parts[i], o); o += parts[i].length; }
        return { ok: true, bytes: out, work, expanded, exhausted: false, bestH: 0 };
      }
      if (st.frame - f0 > env.maxFrames) continue;
      const key = stateKey(st, stage, env) + (!st.grounded && (st.springing || lau[ni] === 1) ? "L" : "");
      if (seen.has(key)) continue;
      seen.set(key, 1);
      // "launched": airborne since a spring bounce (spring-only cells count as progress only then)
      const launched = !st.grounded && (st.springing || lau[ni] === 1);
      const h = fieldAt(nav, F, st.x, st.y, launched);
      if (h < bestH) { bestH = h; bestX = st.x; bestY = st.y; }
      const cx = Math.floor((st.x + 13) / T), cy = Math.floor((st.y + 13) / T);
      const dang = cx >= 0 && cx < nav.W && cy >= 0 && cy < nav.H ? nav.danger[cy * nav.W + cx] : 0;
      // airborne frames cost a little extra: with equal progress, running beats hopping (stops the search from
      // enumerating every jump pattern over open ground)
      let g = g0 + n + proximityCost(sim, n, env) + (st.grounded ? 0 : n * AIR_COST);
      void dang;
      // risk-aware cost: takeoffs and landings with little room for timing error cost extra, so the route looks
      // like what a careful human would do (run-ups, landing in the middle of platforms, no dithering at thorns)
      if (env.riskK > 0) {
        let risk = 0;
        const avx = Math.abs(snap.vx);
        if ((snap.grounded || snap.coyote > 0) && !st.grounded && st.vy < 0 && avx > 0.5) {
          const mg = supportMargins(sim, snap.x, snap.y);
          risk += failProb((mg.l + mg.r + 6 * avx) / avx, env.riskSigma);
          work += 12;
        }
        if (!snap.grounded && st.grounded && snap.airT >= 3 && st.ride < 0) {
          const mg = supportMargins(sim, st.x, st.y);
          risk += failProb((mg.l + mg.r) / 3.5, env.riskSigma);
          work += 12;
        }
        g += risk * env.riskK;
      }
      par.push(ni); byt.push(buf.slice(0, n)); gs.push(g); snaps.push(sim.snapshot()); lau.push(launched ? 1 : 0);
      heap.push(g + WF * h, par.length - 1);
    }
  }
  return { ok: false, work, expanded, exhausted: true, bestH, bestX, bestY };
}

// Replays bytes from snap; after the bytes run out keeps the last byte for up to `extra` frames.
// Returns the number of frames needed to reach success (<= bytes.length + extra) or -1 (death / no success).
export function verify(env, snap, bytes, from, extra, workRef) {
  const { sim } = env;
  const st = sim.state;
  sim.restore(snap);
  const d0 = st.deaths;
  const last = bytes.length ? bytes[bytes.length - 1] : 0;
  const end = bytes.length + extra;
  for (let i = from; i < end; i++) {
    sim.step(i < bytes.length ? bytes[i] : last);
    workRef.w++;
    if (st.dead || st.deaths > d0) return -1;
    if (env.success(st)) return i + 1;
  }
  return -1;
}

// Greedy input simplification: for each input change, try to drop it (extend the previous input) or to make the
// next input start earlier; keep the change only if the segment still succeeds with 0 deaths.
export function simplifyRoute(env, startSnap, bytesIn, budget, tick) {
  const { sim } = env;
  let bytes = bytesIn.slice();
  const wr = { w: 0 };
  let changes = 0;
  // local "complexity" around [c, e): number of input changes, then frames with a direction held
  const cost = (arr, c, e) => {
    let k = 0, d = 0;
    const lo = Math.max(1, c - 1), hi = Math.min(arr.length - 1, e + 1);
    for (let i = lo; i <= hi; i++) if (arr[i] !== arr[i - 1]) k++;
    for (let i = c; i < e; i++) if (arr[i] & 3) d++;
    return k * 100000 + d;
  };
  for (let pass = 0; pass < 3 && wr.w < budget; pass++) {
    const before = changes;
    sim.restore(startSnap);
    let cur = sim.snapshot(), cIdx = 0;
    const advanceTo = (idx) => {
      sim.restore(cur);
      for (let i = cIdx; i < idx; i++) { sim.step(bytes[i]); wr.w++; }
      cur = sim.snapshot(); cIdx = idx; wr.w += SNAP_COST;
    };
    let t = 1;
    while (t < bytes.length && wr.w < budget) {
      let c = t;
      while (c < bytes.length && bytes[c] === bytes[c - 1]) c++;
      if (c >= bytes.length) break;
      let e = c + 1;
      while (e < bytes.length && bytes[e] === bytes[c]) e++;
      advanceTo(c);
      if (tick && (c & 63) === 0) tick();
      const p = bytes[c - 1], q = bytes[c], nx = e < bytes.length ? bytes[e] : -1;
      // candidates, simplest first: keep doing the previous input / start the next input early / stand still
      // (keep the jump button) / keep the previous direction / keep the previous jump button
      const cands = [p];
      if (nx >= 0) cands.push(nx);
      cands.push(q & J, (p & 3) | (q & J), (q & 3) | (p & J));
      const base = cost(bytes, c, e);
      let done = false;
      for (const v of cands) {
        if (v === q) continue;
        const X = bytes.slice(); X.fill(v, c, e);
        if (cost(X, c, e) >= base) continue;
        const n = verify(env, cur, X, c, 30, wr);
        if (n > 0) { bytes = fit(X, n); changes++; done = true; break; }
      }
      if (!done) t = c + 1;
    }
    if (changes === before) break;
  }
  return { bytes, work: wr.w, changes };
}

function fit(arr, n) {
  if (n <= arr.length) return arr.slice(0, n);
  const o = new Uint8Array(n); o.set(arr); o.fill(arr[arr.length - 1], arr.length); return o;
}

// Time-layered beam search (the fallback stage): every layer advances all candidates by exactly M frames and keeps
// the best `B` distinct states by field distance. Unlike A* it never re-explores a plateau for every time step, so
// it copes with waiting for lifts / pulses. Same return shape as searchSegment.
export function beamSegment(env, startSnap, stage, budget, tick) {
  const { sim, nav, F } = env;
  const st = sim.state;
  const M = stage.M, B = stage.B;
  const progs = [];
  for (const d of DIRS) {
    progs.push({ g: 1, a: 1, b: new Uint8Array(M).fill(d) });                      // off
    progs.push({ g: 1, a: 0, r: 1, b: new Uint8Array(M).fill(d | J) });            // press / keep holding
    const re = new Uint8Array(M).fill(d | J); re[0] = d;
    progs.push({ g: 1, a: 0, held: 1, b: re });                                     // re-press
  }
  const par = [-1], byt = [null];
  let layer = [{ snap: startSnap, id: 0, lau: startSnap.springing ? 1 : 0 }];
  const seenStatic = env.time.dynamic ? null : new Set();
  let work = 0, expanded = 0, bestH = Infinity, bestX = startSnap.x, bestY = startSnap.y;
  const f0 = startSnap.frame;
  while (layer.length) {
    if (work > budget) return { ok: false, work, expanded, exhausted: false, bestH, bestX, bestY };
    const next = new Map();
    for (const node of layer) {
      const snap = node.snap;
      expanded++;
      if ((expanded & 255) === 0 && tick) tick(work, bestH);
      const canJump = snap.grounded || snap.coyote > 0;
      const rising = !canJump && snap.held && snap.vy < 0;
      for (const p of progs) {
        if (!canJump && p.a === 0 && !(rising && p.r === 1)) continue;
        if (p.held && !snap.held) continue;
        sim.restore(snap); work += SNAP_COST;
        const d0 = st.deaths;
        let n = 0, died = false, won = false;
        for (; n < M; n++) {
          sim.step(p.b[n]);
          if (st.dead || st.deaths > d0) { died = true; break; }
          if (env.success(st)) { won = true; n++; break; }
        }
        work += n;
        if (died) continue;
        if (won) {
          const parts = [p.b.slice(0, n)];
          for (let q = node.id; q > 0; q = par[q]) parts.push(byt[q]);
          let len = 0; for (const q of parts) len += q.length;
          const out = new Uint8Array(len); let o = 0;
          for (let i = parts.length - 1; i >= 0; i--) { out.set(parts[i], o); o += parts[i].length; }
          return { ok: true, bytes: out, work, expanded, exhausted: false, bestH: 0 };
        }
        if (st.frame - f0 > env.maxFrames) continue;
        const launched = !st.grounded && (st.springing || node.lau === 1);
        const key = stateKey(st, stage, env === null ? null : { time: { dynamic: false }, crumbleX: env.crumbleX }) + (launched ? "L" : "");
        if (seenStatic && seenStatic.has(key)) continue;
        const h = fieldAt(nav, F, st.x, st.y, launched);
        const cx = Math.floor((st.x + 13) / T), cy = Math.floor((st.y + 13) / T);
        const dang = cx >= 0 && cx < nav.W && cy >= 0 && cy < nav.H ? nav.danger[cy * nav.W + cx] : 0;
        const score = h * FRAMES_PER_TILE + proximityCost(sim, M, env) * 4;
        void dang;
        const prev = next.get(key);
        if (prev && prev.score <= score) continue;
        if (h < bestH) { bestH = h; bestX = st.x; bestY = st.y; }
        next.set(key, { score, parent: node.id, bytes: p.b, snap: sim.snapshot(), lau: launched ? 1 : 0 });
      }
    }
    if (env.debugLayer) env.debugLayer(next, layer.length);
    // keep the beam diverse: half of it is reserved for states standing on something (incl. riding a mover), so
    // safe waiting / riding states are not crowded out by optimistic jumps that are about to fall into a pit
    const all = [...next.entries()].sort((a, b) => a[1].score - b[1].score || (a[0] < b[0] ? -1 : 1));
    let arr = all;
    if (all.length > B) {
      const pick = new Set();
      let ng = 0;
      for (const e of all) { if (ng >= B / 2) break; if (e[1].snap.grounded) { pick.add(e); ng++; } }
      for (const e of all) { if (pick.size >= B) break; pick.add(e); }
      arr = all.filter((e) => pick.has(e));
    }
    layer = arr.map(([key, c]) => {
      if (seenStatic) seenStatic.add(key);
      par.push(c.parent); byt.push(c.bytes);
      return { snap: c.snap, id: par.length - 1, lau: c.lau };
    });
  }
  return { ok: false, work, expanded, exhausted: true, bestH, bestX, bestY };
}
