// rater.js - the AI that plays a level and rates it 1..10 (RATER owns). API frozen: CONTRACT.md section 8.
// NO DOM: runs in Node, module Workers and pages. Deterministic: the same level (and budgetMs) always gives the same
// result, because every search/measure limit is counted in sim work units, never in wall-clock time (time is only a
// last-resort safety cap, see stats.timeCapped).
//
//   1. ROUTE: checkpoint by checkpoint, a weighted A* over macro-actions on the real sim (search.js) guided by a
//      tile navigation field (nav.js): coarse A*, a time-layered beam, then medium and frame-fine A*. Each segment continues from the
//      exact state where the previous one touched its checkpoint, so the concatenated inputs replay from the start.
//      The route is simplified (needless input changes removed); a second "careful" search that pays for thin
//      landing/timing margins and hazard proximity is also tried, and the safer of the two (quick noisy trials) kept.
//   2. MEASURE: the route is cut into moves (rest point to rest point); for every input event the timing window is
//      measured by shifting it, and seeded noisy-human trials give each move a failure rate (measure.js).
//   3. RATE: expected deaths of a decent player (timing noise sigma 2.5 frames) over the whole level, on a log
//      scale to 1..9 (calibrated on tools/rater-fixtures, see tools/rate.mjs --calibrate).
//      10 = the AI found no route within its budget.
import { createSim, normalizeLevel, validateLevel, levelHash, LIMITS, T } from "../sim/index.js";
import { buildNav, fieldTo, fieldAt } from "./nav.js";
import { searchSegment, beamSegment, simplifyRoute, makeTimeInfo, STAGES } from "./search.js";
import { measureRoute } from "./measure.js";

export const RATER_VERSION = 2;
// Work units per budget millisecond. Calibrated so the default 20 s budget is ~20 s of search on a slow laptop
// (Intel UHD 620 class CPU) in the worst case; easy levels finish far sooner.
export const WORK_PER_MS = 900;
const RISK_K = 120; // frames of search cost per expected human failure of a takeoff/landing
// work budget split: finding routes / the careful re-search / simplifying / quick per-segment measuring (to pick
// the safer of the two routes) / the final measurement
const SEARCH_SHARE = 0.56, CAREFUL_SHARE = 0.12, SIMPLIFY_SHARE = 0.06, QUICK_SHARE = 0.08, MEASURE_SHARE = 0.18;

function targetCells(level, target) {
  if (target < 0) { const g = level.goal; return [[g.x, g.y], [g.x, g.y - 1], [g.x, g.y - 2]]; }
  const c = level.checkpoints[target];
  return [[c.x, c.y], [c.x, c.y - 1]];
}

// ---- calibrated mapping (tools/rate.mjs --calibrate) -----------------------------------------------------------
// The rating is a log scale of E = expected deaths of a decent player (timing noise sigma 2.5 frames) before clearing
// the level, summed over checkpoint segments (so long levels and missing checkpoints add up). Each step is ~2.5x more
// deaths:  E < 0.15 -> 1 (nothing can really go wrong), 0.5 -> 2, 1.25 -> 3, 3 -> 4, 8 -> 5, 20 -> 6, 50 -> 7,
// 120 -> 8, >= 300 -> 9. 10 is reserved for "the AI found no route" (impossible).
export const SCALE = { e2: 0.5, step: 2.5, floor: 0.15 };
export function scoreFrom(f) {
  const E = f.expectedDeaths;
  if (!(E > SCALE.floor)) return 1 + Math.max(0, E) / SCALE.floor * 0.49;
  const s = 2 + Math.log(E / SCALE.e2) / Math.log(SCALE.step);
  return Math.max(1, Math.min(9.49, s));
}
export function difficultyFrom(f) { return Math.max(1, Math.min(9, Math.round(scoreFrom(f)))); }

function featuresOf(segs, moves) {
  let E = 0, xSeg = 0, peak = 0, tight = 0;
  for (const s of segs) {
    E += s.expectedDeaths;
    xSeg = Math.max(xSeg, Math.log2(1 / Math.max(1e-7, s.clearChance)));
  }
  for (const m of moves) {
    if (m.p > peak) peak = m.p;
    for (const w of m.windows) if (w <= 3) tight++;
  }
  return { xAll: Math.log2(1 + E), xSeg, xPeak: Math.log2(1 / (1 - peak)), tightCount: tight, expectedDeaths: E };
}

export function rateLevel(levelIn, opts = {}) {
  const t0 = Date.now();
  const v = validateLevel(levelIn);
  if (!v.ok) return { difficulty: 10, beatable: false, stats: { rater: RATER_VERSION, error: "invalid level: " + v.errors.slice(0, 3).join("; ") }, inputs: null };
  const level = normalizeLevel(levelIn);
  // default budget: 20 s for community-size levels (the browser worker); main-area-size levels get 90 s (Node tools)
  const L = LIMITS;
  const community = level.w <= L.communityMaxW && level.h <= L.communityMaxH && level.entities.length <= L.communityMaxEntities &&
    level.checkpoints.length <= L.communityMaxCheckpoints;
  const budgetMs = opts.budgetMs || (community ? 20000 : 90000);
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : () => {};
  // sim steps get slower with many moving/timed entities: scale the work budget by a deterministic cost estimate
  // so a 20 s budget stays ~20 s on the target laptop even for entity-heavy levels
  let nDyn = 0;
  for (const e of level.entities) nDyn += e.t === "hazard" || e.t === "pulse" ? 1 : e.t === "mover" ? 1.5 : e.t === "crumble" ? 0.5 : 0;
  const stepCost = 1 + nDyn / 90;
  const WORK = budgetMs * WORK_PER_MS / stepCost;
  const hardCapMs = opts.hardCapMs || budgetMs * 2.5; // wall-clock safety only (see stats.timeCapped)
  let lastProg = 0, lastP = 0;
  const prog = (p, msg, force) => {
    const now = Date.now();
    if (force || now - lastProg >= 150) {
      lastProg = now;
      lastP = Math.max(lastP, Math.max(0, Math.min(1, p))); // never goes backwards
      try { onProgress(lastP, msg); } catch (e) { /* a failing callback must not break the rating */ }
    }
  };
  prog(0, "AI is looking at the level", true);

  const sim = createSim(level, { events: false });
  const nav = buildNav(sim);
  const time = makeTimeInfo(sim);
  const crumbleX = sim.compiled.crumbles.map((k) => k.x);
  const seed = parseInt(levelHash(level), 16) >>> 0;
  const cps = level.checkpoints;
  const nSeg = cps.length + 1;
  const fieldCache = new Map();
  const fieldFor = (target) => { if (!fieldCache.has(target)) fieldCache.set(target, fieldTo(nav, targetCells(level, target))); return fieldCache.get(target); };

  let searchLeft = WORK * SEARCH_SHARE, simplifyLeft = WORK * SIMPLIFY_SHARE;
  let carefulLeft = WORK * CAREFUL_SHARE, quickLeft = WORK * QUICK_SHARE;
  let carefulWins = 0, carefulTried = 0;
  let nodes = 0, workUsed = 0, timeCapped = false;
  const st = sim.state;
  sim.reset();
  let snap = sim.snapshot();
  const parts = [];
  const segments = [];
  let frame = 0;
  let failed = null, stuckAt = null;

  while (true) {
    const cpNow = st.cp;
    const first = cpNow + 1 < cps.length ? cpNow + 1 : -1;
    // candidate targets: the next checkpoint, then later ones (checkpoints may be skipped), then the goal
    const cands = [];
    if (first >= 0) for (let k = first; k < cps.length && cands.length < 3; k++) cands.push(k);
    cands.push(-1);
    const segsLeft = (first >= 0 ? cps.length - first : 0) + 1;
    let got = null;
    stuckAt = null;
    for (let ci = 0; ci < cands.length && !got; ci++) {
      const target = cands[ci];
      const F = fieldFor(target);
      const env = {
        sim, nav, F, time, crumbleX, maxFrames: 60 * 150, riskK: 0, riskSigma: 2.5, careful: false,
        success: target < 0 ? (s) => s.won : (s) => s.won || s.cp >= target,
      };
      // the next checkpoint may borrow up to 4x its fair share of what is left; skipping ahead (later checkpoints, the
      // goal) is a long shot and gets a small coarse-only budget
      const share = ci === 0 ? Math.min(searchLeft, (searchLeft / segsLeft) * 4) : Math.min(searchLeft, (searchLeft / segsLeft) * 0.5);
      const segIdx = segments.length;
      const startH = fieldAt(nav, F, st.x, st.y);
      for (const stage of (opts.stages || (ci === 0 ? STAGES : STAGES.slice(0, 1)))) {
        if (Date.now() - t0 > hardCapMs) { timeCapped = true; break; }
        const b = ci === 0 ? share * stage.share : share;
        const r = (stage.beam ? beamSegment : searchSegment)(env, snap, stage, b, (w, bestH) => {
          const frac = startH > 0 ? Math.max(0, Math.min(1, 1 - bestH / startH)) : 0;
          prog((segIdx + frac) / nSeg * 0.75, `AI is playing: checkpoint ${segIdx + 1}/${nSeg}`);
          if (Date.now() - t0 > hardCapMs) { timeCapped = true; }
        });
        nodes += r.expanded; workUsed += r.work; searchLeft -= r.work;
        if (opts.verbose) opts.verbose(`seg ${segIdx} target ${target} ${stage.name}: ${r.ok ? "ok" : r.exhausted ? "exhausted" : "budget"} nodes ${r.expanded} work ${Math.round(r.work)} / ${Math.round(b)} best (${(r.bestX / T).toFixed(1)}, ${(r.bestY / T).toFixed(1)}) h ${r.bestH.toFixed(1)}`);
        if (r.ok) { got = { bytes: r.bytes, target, stage, env, work: r.work }; break; }
        if (ci === 0 && (!stuckAt || r.bestH < stuckAt.h)) stuckAt = { h: r.bestH, tx: Math.round(r.bestX / T * 10) / 10, ty: Math.round(r.bestY / T * 10) / 10, stage: stage.name };
        if (r.exhausted && stage.name === "fine") break;
        if (timeCapped) break;
      }
      if (timeCapped) break;
    }
    if (!got) { failed = { segment: segments.length, from: cpNow }; break; }
    // simplify; then a CAREFUL re-search of the same segment (cost for little timing/landing margin and for being
    // close to anything deadly) and keep whichever route a quick noisy-human measurement says is safer
    const prevByte = parts.length ? parts[parts.length - 1][parts[parts.length - 1].length - 1] : 0;
    const finalize = (bytesIn, env) => {
      const simp = simplifyRoute(env, snap, bytesIn, Math.min(simplifyLeft, Math.max(20000, (simplifyLeft / segsLeft) * 2)),
        () => prog((segments.length + 0.9) / nSeg * 0.75, `AI is tidying its route: checkpoint ${segments.length + 1}/${nSeg}`));
      simplifyLeft -= simp.work; workUsed += simp.work;
      return { bytes: simp.bytes, changes: simp.changes, E: null };
    };
    const quickE = (c, env) => {
      if (quickLeft <= 0) return Infinity;
      const q = measureRoute({
        sim, nav, inputs: c.bytes, startSnap: snap, prevByte, seed, budget: 1, quick: true,
        tick: () => prog((segments.length + 0.97) / nSeg * 0.75, `AI is comparing two routes: checkpoint ${segments.length + 1}/${nSeg}`),
        segments: [{ target: got.target, startFrame: 0, endFrame: c.bytes.length, cpStart: cpNow }], fields: [env.F],
      });
      quickLeft -= q.work; workUsed += q.work;
      return q.segments[0].expectedDeaths;
    };
    let chosen = finalize(got.bytes, got.env), chosenStage = got.stage.name;
    if (opts.careful !== false && carefulLeft > 0 && quickLeft > 0) {
      const envC = Object.assign({}, got.env, { careful: true, riskK: RISK_K });
      const bC = Math.min(carefulLeft, Math.max(got.work * 1.5, 100000));
      const rc = (got.stage.beam ? beamSegment : searchSegment)(envC, snap, got.stage, bC,
        () => prog((segments.length + 0.95) / nSeg * 0.75, `AI is looking for a safer way: checkpoint ${segments.length + 1}/${nSeg}`));
      carefulLeft -= rc.work; workUsed += rc.work; nodes += rc.expanded; carefulTried++;
      if (rc.ok) {
        const alt = finalize(rc.bytes, envC);
        const eFast = quickE(chosen, got.env);
        const eAlt = eFast > 0 ? quickE(alt, envC) : Infinity;
        if (opts.verbose) opts.verbose(`seg ${segments.length} careful: E fast ${eFast.toFixed(2)} vs careful ${eAlt.toFixed(2)}`);
        if (eAlt < eFast - 1e-9) { chosen = alt; chosenStage += "+careful"; carefulWins++; }
      }
    }
    const simp = chosen;
    const bytes = simp.bytes;
    sim.restore(snap);
    for (let i = 0; i < bytes.length; i++) sim.step(bytes[i]);
    segments.push({ target: got.target, startFrame: frame, endFrame: frame + bytes.length, cpStart: cpNow, stage: chosenStage, simplified: simp.changes });
    frame += bytes.length;
    parts.push(bytes);
    snap = sim.snapshot();
    if (st.won) break;
    if (!(got.env.success(st))) { failed = { segment: segments.length, from: cpNow, error: "route drift" }; break; }
  }

  const baseStats = () => ({
    rater: RATER_VERSION, nodes, work: Math.round(workUsed), ms: Date.now() - t0, budgetMs, timeCapped, stepCost: round(stepCost, 2),
    checkpoints: cps.length, segmentsSolved: segments.length,
  });
  if (failed) {
    const F = fieldFor(-1);
    const h0 = fieldAt(nav, F, sim.spawnPoint(-1).x, sim.spawnPoint(-1).y);
    sim.restore(snap);
    const h1 = fieldAt(nav, F, st.x, st.y);
    const stats = Object.assign(baseStats(), {
      stuckAfterCheckpoint: failed.from, furthest: stuckAt ? { tx: stuckAt.tx, ty: stuckAt.ty } : null, progress: h0 > 0 ? Math.max(0, Math.min(1, 1 - h1 / h0)) : 0,
      reason: failed.error || (timeCapped ? "time cap" : "no route found within budget"),
    });
    prog(1, "The AI could not beat it", true);
    return { difficulty: 10, beatable: false, stats, inputs: null };
  }

  let total = 0; for (const p of parts) total += p.length;
  const inputs = new Uint8Array(total);
  { let o = 0; for (const p of parts) { inputs.set(p, o); o += p.length; } }
  // replay check on a fresh sim (the contract: createSim(level).run(inputs) wins)
  const check = createSim(level, { events: false });
  check.run(inputs);
  if (!check.state.won || check.state.deaths > 0) {
    return { difficulty: 10, beatable: false, stats: Object.assign(baseStats(), { reason: "replay mismatch" }), inputs: null };
  }

  prog(0.76, "Measuring how precise every jump has to be", true);
  const M = measureRoute({
    sim, nav, inputs, seed, budget: WORK * MEASURE_SHARE, sigma: opts.sigma,
    tick: (f) => prog(0.76 + 0.23 * f, "Measuring how precise every jump has to be"),
    segments, fields: segments.map((s) => fieldFor(s.target)),
  });
  workUsed += M.work;
  const f = featuresOf(M.segments, M.moves);
  const score = scoreFrom(f);
  const difficulty = difficultyFrom(f);
  let tightest = null, precise = 0, events = 0;
  for (const m of M.moves) { events += m.ev.length; for (const w of m.windows) { if (tightest === null || w < tightest) tightest = w; if (w <= 5) precise++; } }
  const segStats = M.segments.map((s, i) => {
    const ms = M.moves.filter((m) => m.seg === i);
    const fs = featuresOf([s], ms);
    return {
      from: s.from, to: s.to, difficulty: difficultyFrom(fs), frames: s.frames, moves: s.moves,
      expectedDeaths: round(s.expectedDeaths, 2), clearChance: round(s.clearChance, 4), tightestWindow: s.tightestWindow,
      preciseEvents: s.preciseEvents, hardestMove: round(s.hardestMove, 3), stage: segments[i].stage,
    };
  });
  const stats = Object.assign(baseStats(), {
    frames: inputs.length, seconds: round(inputs.length / 60, 1), score: round(score, 2),
    expectedDeaths: round(f.expectedDeaths, 2),
    expertDeaths: round(M.segments.reduce((a, s) => a + s.expertDeaths, 0), 2),
    hardestSegment: segStats.reduce((a, s, i) => (s.expectedDeaths > segStats[a].expectedDeaths ? i : a), 0),
    tightestWindow: tightest, preciseEvents: precise, frameTightEvents: f.tightCount, events, moves: M.moves.length,
    trialsPerMove: M.trials, nearHazardFrames: M.nearFrames, carefulWins, carefulTried,
    features: { xAll: round(f.xAll, 3), xSeg: round(f.xSeg, 3), xPeak: round(f.xPeak, 3) },
    segments: segStats,
  });
  if (opts.debug) {
    stats.debugMoves = M.moves.map((m) => ({
      seg: m.seg, f: m.a + "-" + m.b, tx: round(M.X[m.a] / T, 1), ty: round(M.Y[m.a] / T, 1), ev: m.ev.map((t) => t - m.a + ":" + inputs[t]).join(" "),
      win: m.windows.join(","), p: round(m.p, 3), death: round(m.deathRate, 3), pe: round(m.pExpert, 3), stand: m.standCheck, broken: m.broken, alt: m.alt || undefined, w0: m.w0, p0: m.p0 !== undefined ? round(m.p0, 3) : undefined,
    }));
  }
  stats.ms = Date.now() - t0;
  prog(1, "Rated " + difficulty + "/10", true);
  return { difficulty, beatable: true, stats, inputs };
}

function round(v, d) { const k = Math.pow(10, d); return Math.round(v * k) / k; }
