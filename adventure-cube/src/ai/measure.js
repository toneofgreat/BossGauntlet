// measure.js - how hard is the AI's route for a human? (RATER owns). NO DOM, deterministic (seeded RNG).
//
// The winning route is cut into MOVES: from one rest point (a landing on stable ground, or a segment start) to the
// next. Inside a move every input change is an EVENT (start/stop running, press jump, release jump, steer).
//   * window: shift one event (and everything after it in the move, like a human who acted d frames early/late
//     and then carried on with the plan) by d = -D..D frames; the contiguous range of d that still lands safely on
//     the same ground is the event's timing window in frames (1 = frame-perfect).
//   * noisy humans: N seeded trials per move where every event gets an independent timing error ~ N(0, sigma)
//     frames; a trial fails on a death (weight 1) or a setback (lands alive but clearly off the route, 0.35).
// From the per-move failure rates p we get, per checkpoint segment, P(clear) = prod(1 - p) and the expected deaths
// before clearing it; rater.js maps those numbers to 1..10.
import { T, TILE, IN_LEFT, IN_RIGHT, IN_JUMP } from "../sim/index.js";
import { fieldAt } from "./nav.js";
import { SNAP_COST } from "./search.js";

export const WINDOW_D = 10;     // frames scanned each side
export const SIGMA = 2.5;       // timing noise (frames) of a decent player
export const SIGMA_EXPERT = 1.2;
const SETBACK_W = 0.35;
const GROUP_GAP = 2;
const REST_MIN = 6;   // frames on the ground after a landing before it counts as a rest point

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const LATTICE = [0, 0.6180339887, 0.4142135624, 0.7320508076, 0.2360679775, 0.6457513111, 0.3166247904, 0.6055512755, 0.1231056256, 0.3589989436, 0.5677643628, 0.8309518948];
const cpShift = new Float64Array(64);
// inverse standard normal CDF (Acklam's rational approximation, |error| < 1.2e-9)
function invNorm(p) {
  if (p <= 0) return -8; if (p >= 1) return 8;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - lo) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// ctx: { sim, nav, fields: [F per segment], segments: [{target, startFrame, endFrame, cpStart}], inputs, seed,
//        budget (work units), sigma }
export function measureRoute(ctx) {
  const { sim, nav, inputs, segments } = ctx;
  const inputsAll = inputs;
  const st = sim.state;
  const n = inputs.length;
  // ---- replay once, record per-frame state --------------------------------------------------------------
  const X = new Float32Array(n + 1), Y = new Float32Array(n + 1), G = new Uint8Array(n + 1);
  const STABLE = new Uint8Array(n + 1), NEAR = new Float32Array(n + 1);
  const begin = () => { if (ctx.startSnap) sim.restore(ctx.startSnap); else sim.reset(); };
  const prev0 = ctx.prevByte || 0;
  begin();
  const rec = (t) => {
    X[t] = st.x; Y[t] = st.y; G[t] = st.grounded ? 1 : 0;
    STABLE[t] = st.grounded && st.gcr < 0 && !(st.gnd === TILE.ICE && Math.abs(st.vx) > 1) ? 1 : 0;
    NEAR[t] = sim.nearestHazard(64);
  };
  rec(0);
  for (let t = 0; t < n; t++) { sim.step(inputs[t]); rec(t + 1); }
  // ---- boundaries and moves -----------------------------------------------------------------------------
  const moves = [];
  const restsAt = (t) => { for (let q = t; q <= Math.min(n, t + REST_MIN); q++) if (!G[q]) return false; return true; };
  segments.forEach((seg, si) => {
    const bounds = [seg.startFrame];
    for (let t = seg.startFrame + 1; t < seg.endFrame; t++) {
      // a rest point is a landing the route actually rests on: if it takes off again within REST_MIN frames
      // (a buffered re-jump, a hop-hop chain) the two jumps are ONE human action and are measured together, so the
      // precision the second jump needs from the first landing is charged (moves restore exact snapshots)
      if (STABLE[t] && !G[t - 1] && t - bounds[bounds.length - 1] >= 4 && restsAt(t)) bounds.push(t);
    }
    if (seg.endFrame - bounds[bounds.length - 1] < 4 && bounds.length > 1) bounds.pop();
    bounds.push(seg.endFrame);
    for (let i = 0; i + 1 < bounds.length; i++) {
      const a = bounds[i], b = bounds[i + 1];
      const ev = [];
      for (let t = a; t < b; t++) {
        const prev = t > 0 ? inputs[t - 1] : prev0;
        if (inputs[t] !== prev) ev.push(t);
      }
      moves.push({ seg: si, a, b, end: i + 2 === bounds.length, ev, standCheck: true, broken: false, windows: [], p: 0, pExpert: 0, deathRate: 0 });
    }
  });
  // snapshots at move starts (one more replay)
  const snapAt = new Map();
  const need = new Set(moves.map((m) => m.a));
  begin();
  if (need.has(0)) snapAt.set(0, sim.snapshot());
  for (let t = 0; t < n; t++) { sim.step(inputs[t]); if (need.has(t + 1)) snapAt.set(t + 1, sim.snapshot()); }

  let work = 0;
  const shifted = new Int32Array(64);
  // ---- one perturbed attempt of a move: returns 0 ok, SETBACK_W setback, 1 death -------------------------
  function trial(m, shifts) {
    const seg = segments[m.seg], F = ctx.fields[m.seg];
    const inputs = m.inp || inputsAll, n = inputs.length;
    sim.restore(snapAt.get(m.a));
    work += SNAP_COST;
    const d0 = st.deaths, cp0 = seg.cpStart;
    const ev = m.ev, k = ev.length;
    let lastT = m.a;
    for (let i = 0; i < k; i++) {
      let t = ev[i] + shifts[m.grp[i]];
      if (t < m.a) t = m.a;
      if (i > 0 && t < shifted[i - 1]) t = shifted[i - 1];
      shifted[i] = t; lastT = t;
    }
    const dl = k ? shifted[k - 1] - ev[k - 1] : 0;
    const endF = m.b + Math.max(0, dl);
    let p = 0, cur = m.a > 0 ? inputs[m.a - 1] : prev0;
    void cp0; void lastT;
    const success = () => st.won || (seg.target >= 0 && st.cp >= seg.target);
    let t = m.a;
    const switchF = m.b + Math.max(0, dl);
    // inside the move: the shifted events; after it: the rest of the original plan, shifted like the last event
    const byteAt = (tt) => {
      if (tt < switchF) {
        while (p < k && shifted[p] <= tt) { cur = inputs[ev[p]]; p++; }
        return cur;
      }
      const j = tt - dl;
      return j >= 0 && j < n ? inputs[j] : 0;
    };
    for (; t < endF; t++) {
      sim.step(byteAt(t)); work++;
      if (st.deaths > d0 || st.dead) return 1;
      if (m.end && success()) return 0;
    }
    // settle: keep following the (shifted) plan until grounded
    let s = 0;
    while (!st.grounded && s < 90) {
      sim.step(byteAt(t)); t++; s++; work++;
      if (st.deaths > d0 || st.dead) return 1;
      if (m.end && success()) return 0;
    }
    if (!st.grounded) return SETBACK_W;
    // stand still a moment (or, where the AI itself could not stand still, keep following the plan): must not
    // slide/fall into something deadly right after landing
    for (let i = 0; i < 8; i++) {
      sim.step(m.standCheck ? 0 : byteAt(t)); t++; work++;
      if (st.deaths > d0 || st.dead) return 1;
      if (m.end && success()) return 0;
    }
    if (m.end && success()) return 0;
    const fp = fieldAt(nav, F, st.x, st.y), fo = fieldAt(nav, F, m.fx !== undefined ? m.fx : X[m.b], m.fy !== undefined ? m.fy : Y[m.b]);
    return fp - fo > 1.5 ? SETBACK_W : 0;
  }

  // ---- budget: scale trial counts deterministically from the route size --------------------------------
  let est = 0;
  for (const m of moves) est += (m.b - m.a + 60 + SNAP_COST) * (m.ev.length * 4 + 40);
  const scale = Math.max(0.25, Math.min(1, ctx.budget / Math.max(1, est)));
  const NT = ctx.quick ? 16 : Math.max(12, Math.round(40 * scale)), NE = ctx.quick ? 0 : Math.max(8, Math.round(20 * scale));
  const sh = new Int32Array(64), base = new Int32Array(64);

  function evalMove(m, mi) {
    if (m.ev.length > 60) m.ev = m.ev.slice(0, 60); // pathological input noise: cap
    // events closer than GROUP_GAP frames form one human action (a re-press = release+press, a 1-frame tap):
    // they are shifted together
    m.grp = new Int32Array(m.ev.length);
    let ng = 0;
    for (let i = 0; i < m.ev.length; i++) { if (i > 0 && m.ev[i] - m.ev[i - 1] > GROUP_GAP) ng++; m.grp[i] = ng; }
    const k = m.ev.length ? ng + 1 : 0;
    m.ng = k;
    // the unperturbed move must succeed (it is the AI's own route); if standing still after it is deadly, judge
    // the landing by continuing the plan instead
    m.standCheck = true;
    sh.fill(0);
    if (trial(m, sh) > 0) { m.standCheck = false; if (trial(m, sh) > 0) { m.broken = true; m.windows.push(2 * WINDOW_D + 1); return; } }
    // windows, group by group; a human aims for the MIDDLE of each window, so after measuring group j the plan is
    // re-centred (group j and everything after it shifted to the window centre) before measuring group j+1
    let allFull = true;
    base.fill(0);
    for (let j = 0; j < k; j++) {
      let lo = 0, hi = 0;
      for (let d = 1; d <= WINDOW_D; d++) {
        for (let i = 0; i < k; i++) sh[i] = base[i] + (i >= j ? d : 0); // group shifts
        if (trial(m, sh) > 0) break; hi = d;
      }
      for (let d = 1; d <= WINDOW_D; d++) {
        for (let i = 0; i < k; i++) sh[i] = base[i] - (i >= j ? d : 0);
        if (trial(m, sh) > 0) break; lo = d;
      }
      const w = 1 + lo + hi;
      m.windows.push(w);
      if (w < 2 * WINDOW_D + 1) allFull = false;
      const c = Math.round((hi - lo) / 2);
      if (c !== 0) for (let i = j; i < k; i++) base[i] += c;
    }
    if (k === 0 || allFull) { m.p = 0; m.pExpert = 0; return; }
    const rng = mulberry32((ctx.seed ^ Math.imul(mi + 1, 0x9e3779b1)) >>> 0);
    // timing errors from a randomly shifted low-discrepancy lattice through the normal quantile (instead of plain
    // random draws): the same window always gives nearly the same failure rate, so identical obstacles rate alike
    const run = (sigma, N) => {
      let f = 0, deaths = 0;
      for (let i = 0; i < k; i++) cpShift[i] = rng();
      for (let tr = 0; tr < N; tr++) {
        for (let i = 0; i < k; i++) {
          const v = cpShift[i] + (i === 0 ? (tr + 0.5) / N : (tr + 0.5) * LATTICE[i % LATTICE.length]);
          let e = Math.round(invNorm(v - Math.floor(v)) * sigma);
          const c = Math.ceil(3 * sigma);
          sh[i] = base[i] + (e < -c ? -c : e > c ? c : e);
        }
        const r = trial(m, sh);
        f += r; if (r >= 1) deaths++;
      }
      return { p: Math.min(f / N, 1 - 0.5 / N), d: deaths / N };
    };
    const a = run(ctx.sigma || SIGMA, NT);
    m.p = a.p; m.deathRate = a.d;
    m.pExpert = NE ? run(SIGMA_EXPERT, NE).p : 0;
  }

  // ---- the easiest way a human could take the same takeoff ------------------------------------------------
  // The search keeps whatever route it found first; on a flat runway that is often a full-speed chain of jumps
  // with a 3-frame takeoff window, while a person would stop (or back up) on the runway and take the obstacle on
  // its own. From a rest point, try "stop s frames, back up b frames, run j frames, (stand still w frames,)
  // press jump, hold h" plans (running jumps, and walk-to-the-edge standing jumps) that land at least as far along as the AI did; the longest run of working j values (= the real jump
  // window for that approach) picks the plan, which is then measured exactly like a route move. The move keeps
  // whichever of the two is easier, so the rating follows the obstacle, not the spacing the search happened on.
  const REPLAN_MAX_MOVES = 40, REPLAN_J = 50, REPLAN_HOLDS = [40, 12];
  // [stop, back, wait]: running approaches (wait 0) and walk-up-stop-jump approaches (wait 16)
  const REPLAN_KINDS = [[0, 0, 0], [14, 0, 0], [28, 0, 0], [14, 12, 0], [14, 24, 0], [28, 24, 0], [0, 0, 16], [14, 0, 16]];
  const planBuf = new Uint8Array(480);
  let replans = 0;
  function planLen(s, b, j, w, h, dir) {
    // fills planBuf; returns the length of the run phase budget (the plan stops at the landing)
    let i = 0;
    const opp = dir === IN_RIGHT ? IN_LEFT : IN_RIGHT;
    for (let q = 0; q < s; q++) planBuf[i++] = 0;
    for (let q = 0; q < b; q++) planBuf[i++] = opp;
    for (let q = 0; q < j; q++) planBuf[i++] = dir;
    for (let q = 0; q < w; q++) planBuf[i++] = 0;
    for (let q = 0; q < h; q++) planBuf[i++] = dir | IN_JUMP;
    while (i < planBuf.length) planBuf[i++] = dir;
    return s + b + j + w;
  }
  // simulate planBuf from the move start until the cube has jumped and landed; -> landing frame offset or -1
  function tryPlan(m, F, fo, jumpAt) {
    sim.restore(snapAt.get(m.a)); work += SNAP_COST;
    const d0 = st.deaths;
    let air = false;
    for (let i = 0; i < planBuf.length; i++) {
      sim.step(planBuf[i]); work++;
      if (st.dead || st.deaths > d0 || st.won) return -1;
      if (!st.grounded) air = true;
      else if (air && i > jumpAt) {
        if (st.gcr >= 0 || (st.gnd === TILE.ICE && Math.abs(st.vx) > 1)) return -1;
        return fieldAt(nav, F, st.x, st.y) <= fo + 0.5 ? i + 1 : -1;
      }
    }
    return -1;
  }
  // run without jumping: frames of running (after the stop/back-up) until the cube dies or is blocked; -1 = never
  function blockedAt(m, s, b, dir) {
    planLen(s, b, planBuf.length, 0, 0, dir);
    sim.restore(snapAt.get(m.a)); work += SNAP_COST;
    const d0 = st.deaths, sgn = dir === IN_RIGHT ? 1 : -1;
    let lastX = st.x, still = 0;
    for (let i = 0; i < planBuf.length; i++) {
      sim.step(planBuf[i]); work++;
      if (st.dead || st.deaths > d0) return i - s - b;
      if (i >= s + b + 12) { if ((st.x - lastX) * sgn < 0.5) { if (++still >= 4) return i - s - b - 4; } else still = 0; }
      lastX = st.x;
    }
    return -1;
  }
  function replan(m, mi) {
    if (m.end || m.broken || !(STABLE[m.a] || m.a === segments[m.seg].startFrame) || replans >= REPLAN_MAX_MOVES || work > ctx.budget * 1.6) return;
    const dx = X[m.b] - X[m.a];
    if (Math.abs(dx) < T) return;
    replans++;
    const dir = dx > 0 ? IN_RIGHT : IN_LEFT, F = ctx.fields[m.seg], fo = fieldAt(nav, F, X[m.b], Y[m.b]);
    let best = null;
    for (const [s, b, w] of REPLAN_KINDS) {
      const fd = blockedAt(m, s, b, dir);
      if (fd < 0) continue;
      for (const h of REPLAN_HOLDS) {
      let runStart = -1, bestRun = 0, bestJ = -1;
      // the takeoff has to happen in the ~REPLAN_J frames before the obstacle stops a plain run
      for (let j = Math.max(0, fd - REPLAN_J); j <= fd + 2; j++) {
        const jumpAt = planLen(s, b, j, w, h, dir);
        const ok = tryPlan(m, F, fo, jumpAt) > 0;
        if (ok) { if (runStart < 0) runStart = j; if (j - runStart + 1 > bestRun) { bestRun = j - runStart + 1; bestJ = runStart + (j - runStart) / 2; } }
        else runStart = -1;
      }
      // a longer window wins; equal windows prefer the quicker approach
      if (bestRun > 0 && (!best || bestRun > best.run || (bestRun === best.run && s + b + w < best.s + best.b + best.w))) best = { run: bestRun, j: Math.round(bestJ), s, b, w, h };
      }
    }
    if (!best) return;
    const jumpAt = planLen(best.s, best.b, best.j, best.w, best.h, dir);
    const L = tryPlan(m, F, fo, jumpAt);
    if (L <= 0) return;
    const fx = st.x, fy = st.y;
    // the alternative move: same start, the plan, then the rest of the original route
    const inp = new Uint8Array(m.a + L + (inputsAll.length - m.b));
    inp.set(inputsAll.subarray(0, m.a)); inp.set(planBuf.subarray(0, L), m.a); inp.set(inputsAll.subarray(m.b), m.a + L);
    const ev = [];
    for (let t = m.a; t < m.a + L; t++) if (inp[t] !== (t > 0 ? inp[t - 1] : prev0)) ev.push(t);
    const mm = { seg: m.seg, a: m.a, b: m.a + L, end: false, ev, inp, fx, fy, standCheck: true, broken: false, windows: [], p: 0, pExpert: 0, deathRate: 0 };
    evalMove(mm, mi + 7919);
    if (!mm.broken && mm.p < m.p - 1e-9) {
      m.p0 = m.p; m.w0 = m.windows.join(","); m.windows = mm.windows; m.p = mm.p; m.pExpert = mm.pExpert; m.deathRate = mm.deathRate; m.standCheck = mm.standCheck;
      m.alt = { stop: best.s, back: best.b, wait: best.w, hold: best.h, window: best.run };
    }
  }

  for (let mi = 0; mi < moves.length; mi++) {
    const m = moves[mi];
    if (ctx.tick) ctx.tick(mi / moves.length);
    evalMove(m, mi);
    if (!ctx.quick && m.p > 0.04) {
      let wmin = Infinity; for (const w of m.windows) if (w < wmin) wmin = w;
      if (wmin <= 7) replan(m, mi);
    }
  }
  // ---- aggregate --------------------------------------------------------------------------------------
  const segOut = segments.map((seg, si) => {
    const ms = moves.filter((m) => m.seg === si);
    let logP = 0, logPe = 0, tight = Infinity, peak = 0, precise = 0, chain = 0, run = 0;
    for (const m of ms) {
      logP += Math.log(1 - m.p);
      logPe += Math.log(1 - m.pExpert);
      if (m.p > peak) peak = m.p;
      for (const w of m.windows) { if (w < tight) tight = w; if (w <= 5) precise++; }
      if (m.p > 0.15) { run++; if (run > chain) chain = run; } else run = 0;
    }
    const P = Math.exp(logP), Pe = Math.exp(logPe);
    return {
      from: seg.cpStart, to: seg.target, frames: seg.endFrame - seg.startFrame, moves: ms.length,
      clearChance: P, expertClearChance: Pe,
      expectedDeaths: Math.min(1e7, 1 / Math.max(P, 1e-7) - 1),
      expertDeaths: Math.min(1e7, 1 / Math.max(Pe, 1e-7) - 1),
      hardestMove: peak, tightestWindow: tight === Infinity ? null : tight, preciseEvents: precise, hardChain: chain,
    };
  });
  let nearFrames = 0;
  for (let t = 0; t <= n; t++) if (NEAR[t] < 12) nearFrames++;
  return { moves, segments: segOut, work, trials: NT, nearFrames, X, Y };
}
