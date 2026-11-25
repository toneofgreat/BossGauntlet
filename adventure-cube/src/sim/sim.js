// sim.js - deterministic fixed-step (60 Hz) platformer simulation. NO DOM, no Math.random, no trig, no time.
// Runs identically in browsers, Web Workers and Node. Full behaviour spec: CONTRACT.md section 3.
//
//   const sim = createSim(level, { events: true });
//   sim.step(inputBits);          // advance one 1/60 s frame. inputBits = IN_LEFT|IN_RIGHT|IN_JUMP
//   sim.state                     // live state object (same identity forever; read-only for callers)
//   const snap = sim.snapshot();  // cheap copy of all mutable state
//   sim.restore(snap);            // rewind (snap stays reusable)
import {
  T, TILE, PW, PH, IN_LEFT, IN_RIGHT, IN_JUMP, isFullSolid, isSlope, slopeH, slopeHighSide, SPIKE_RECT,
  WATER_TOP_INSET, RUN_MAX, GROUND_ACCEL, GROUND_DECEL, GROUND_TURN, AIR_ACCEL, AIR_DECEL, AIR_TURN,
  ICE_ACCEL, ICE_DECEL, ICE_TURN, JUMP_V, G_UP, G_CUT, G_DOWN, MAX_FALL, COYOTE, JUMP_BUFFER, SPRING_V,
  STEP_UP, STICK_DOWN, CORNER, HURT_INSET, DEATH_FRAMES, CRUMBLE_DELAY, CRUMBLE_RESPAWN,
} from "./constants.js";
import { compileLevel } from "./level.js";
import { makePath, pathPos } from "./path.js";

const EPS = 1e-6;

export function createSim(levelIn, opts = {}) {
  const C = compileLevel(levelIn);
  const { level, W, H, grid } = C;
  const WPX = W * T, HPX = H * T;
  const EMIT = opts.events !== false;
  const crumbles = C.crumbles, springs = C.springs, movers = C.movers, hazards = C.hazards, pulses = C.pulses;
  for (const m of movers) m.P = makePath(m.e);
  for (const h of hazards) h.P = makePath(h.e);
  const mOld = new Float64Array(movers.length * 2), mNew = new Float64Array(movers.length * 2);
  const tmp = { x: 0, y: 0 };
  const events = [];

  const s = {
    frame: 0, x: 0, y: 0, vx: 0, vy: 0,
    grounded: false, gnd: 0, ride: -1, gcr: -1,
    coyote: 0, buffer: 0, held: false, springing: false, facing: 1,
    dead: false, deadT: 0, deathCause: "", deaths: 0,
    cp: -1, won: false, winFrame: -1, airT: 0, lastIn: 0,
    crumble: new Int32Array(crumbles.length),
  };

  function ev(type, a) {
    if (EMIT) events.push({ type, x: s.x + PW / 2, y: s.y + PH / 2, a: a === undefined ? 0 : a, frame: s.frame });
  }
  function tileAt(tx, ty) {
    if (tx < 0 || tx >= W) return TILE.ROCK;
    if (ty < 0 || ty >= H) return 0;
    return grid[ty * W + tx];
  }
  function spawnPoint(cp) {
    const p = cp >= 0 && cp < level.checkpoints.length ? level.checkpoints[cp] : level.start;
    return { x: (p.x + 0.5) * T - PW / 2, y: (p.y + 1) * T - PH };
  }
  // any full-solid tile or intact crumble overlapping the open rect (l,t)-(r,b)?
  function solidRectHit(l, t, r, b) {
    const c0 = Math.floor(l / T), c1 = Math.floor((r - EPS) / T), r0 = Math.floor(t / T), r1 = Math.floor((b - EPS) / T);
    for (let ty = r0; ty <= r1; ty++) for (let tx = c0; tx <= c1; tx++) if (isFullSolid(tileAt(tx, ty))) return true;
    for (let i = 0; i < crumbles.length; i++) {
      if (s.crumble[i] < 0) continue;
      const k = crumbles[i];
      if (k.x < r && k.x + k.w > l && k.y < b && k.y + T > t) return true;
    }
    return false;
  }
  function moverPos(i, f, out) {
    return pathPos(movers[i].P, f, out);
  }
  function hazardPos(i, f, out) { // CENTER of the hazard circle
    pathPos(hazards[i].P, f, out); out.x += T / 2; out.y += T / 2; return out;
  }
  function pulsePhase(i, f) { const p = pulses[i]; const q = (f + p.offset) % p.period; return q; }
  function pulseActive(i, f) { return pulsePhase(i, f) < pulses[i].on; }

  // ---------------- horizontal move with collision ----------------
  function moveX(dx) {
    if (dx === 0) return false;
    const top = s.y, bot = s.y + PH;
    const r0 = Math.floor(top / T), r1 = Math.floor((bot - EPS) / T);
    let nx = s.x + dx, hit = false;
    if (dx > 0) {
      const lead0 = s.x + PW, lead1 = nx + PW;
      const cEnd = Math.floor((lead1 - EPS) / T);
      outer: for (let c = Math.floor(lead0 / T); c <= cEnd; c++) {
        const cl = c * T;
        for (let r = r0; r <= r1; r++) {
          const k = tileAt(c, r);
          if (isFullSolid(k)) {
            if (cl < lead0 - EPS) continue; // already overlapping: never yank backwards
            const tt = r * T;
            if (bot - tt <= STEP_UP && !solidRectHit(nx, tt - PH, nx + PW, tt)) continue; // step up onto it
            nx = cl - PW; hit = true; break outer;
          } else if (isSlope(k)) {
            const lx = Math.min(Math.max(lead1, cl), cl + T);
            const sy = (r + 1) * T - slopeH(k, (lx - cl) / T);
            if (bot - sy > STEP_UP && top < (r + 1) * T) {
              nx = slopeHighSide(k) < 0 && cl >= lead0 - EPS ? cl - PW : s.x;
              hit = true; break outer;
            }
          }
        }
      }
      for (let i = 0; i < crumbles.length; i++) {
        if (s.crumble[i] < 0) continue;
        const k = crumbles[i];
        if (!(k.y < bot && k.y + T > top)) continue;
        if (k.x >= lead0 - EPS && k.x < nx + PW) {
          if (bot - k.y <= STEP_UP && !solidRectHit(nx, k.y - PH, nx + PW, k.y)) continue;
          nx = Math.min(nx, k.x - PW); hit = true;
        }
      }
    } else {
      const lead0 = s.x, lead1 = nx;
      const cEnd = Math.floor(lead1 / T);
      outer: for (let c = Math.floor((lead0 - EPS) / T); c >= cEnd; c--) {
        const cl = c * T, cr = cl + T;
        for (let r = r0; r <= r1; r++) {
          const k = tileAt(c, r);
          if (isFullSolid(k)) {
            if (cr > lead0 + EPS) continue;
            const tt = r * T;
            if (bot - tt <= STEP_UP && !solidRectHit(nx, tt - PH, nx + PW, tt)) continue;
            nx = cr; hit = true; break outer;
          } else if (isSlope(k)) {
            const lx = Math.min(Math.max(lead1, cl), cr);
            const sy = (r + 1) * T - slopeH(k, (lx - cl) / T);
            if (bot - sy > STEP_UP && top < (r + 1) * T) {
              nx = slopeHighSide(k) > 0 && cr <= lead0 + EPS ? cr : s.x;
              hit = true; break outer;
            }
          }
        }
      }
      for (let i = 0; i < crumbles.length; i++) {
        if (s.crumble[i] < 0) continue;
        const k = crumbles[i];
        if (!(k.y < bot && k.y + T > top)) continue;
        const kr = k.x + k.w;
        if (kr <= lead0 + EPS && kr > nx) {
          if (bot - k.y <= STEP_UP && !solidRectHit(nx, k.y - PH, nx + PW, k.y)) continue;
          nx = Math.max(nx, kr); hit = true;
        }
      }
    }
    if (nx < 0) { nx = 0; hit = true; }
    if (nx > WPX - PW) { nx = WPX - PW; hit = true; }
    s.x = nx;
    return hit;
  }

  // ---------------- vertical move: ceilings, then ground (solids, slopes, one-ways, crumbles, movers) ----------------
  function moveY(wasGrounded, jumped) {
    const oldTop = s.y, oldBot = s.y + PH;
    let ny = s.y + s.vy;
    if (s.vy < 0) {
      let hitB = -Infinity;
      const l = s.x, r = s.x + PW;
      const c0 = Math.floor(l / T), c1 = Math.floor((r - EPS) / T);
      const rA = Math.floor(ny / T), rB = Math.floor((oldTop + EPS) / T) - 1;
      for (let ty = rA; ty <= rB; ty++) for (let tx = c0; tx <= c1; tx++) {
        if (isFullSolid(tileAt(tx, ty))) { const b = (ty + 1) * T; if (b > hitB) hitB = b; }
      }
      for (let i = 0; i < crumbles.length; i++) {
        if (s.crumble[i] < 0) continue;
        const k = crumbles[i], b = k.y + T;
        if (k.x < r && k.x + k.w > l && b > ny && b <= oldTop + EPS && b > hitB) hitB = b;
      }
      if (hitB > ny) {
        let moved = false;
        const pref = s.vx < 0 ? -1 : 1;
        for (let d = 1; d <= CORNER && !moved; d++) {
          for (let sg = 0; sg < 2; sg++) {
            const dd = (sg === 0 ? pref : -pref) * d;
            if (!solidRectHit(s.x + dd, ny, s.x + dd + PW, ny + PH) && !solidRectHit(s.x + dd, oldTop, s.x + dd + PW, oldBot)) {
              s.x += dd; moved = true; break;
            }
          }
        }
        if (!moved) { ny = hitB; s.vy = 0; ev("bonk"); }
      }
    }
    s.y = ny;
    const l = s.x, r = s.x + PW;
    const c0 = Math.floor(l / T), c1 = Math.floor((r - EPS) / T);
    const newBot = ny + PH;
    const stick = wasGrounded && !jumped && s.vy >= 0 ? STICK_DOWN : 0;
    const lo = oldBot - STEP_UP, hi = newBot + stick;
    let best = Infinity, bk = 0, bm = -1, bc = -1;
    const rA = Math.floor(lo / T), rB = Math.floor(hi / T);
    for (let ty = rA; ty <= rB; ty++) for (let tx = c0; tx <= c1; tx++) {
      const k = tileAt(tx, ty);
      if (k === 0) continue;
      let sy;
      if (isFullSolid(k)) sy = ty * T;
      else if (k === TILE.ONEWAY) { if (s.vy < 0 || oldBot > ty * T + 0.5) continue; sy = ty * T; }
      else if (isSlope(k)) {
        const cl = tx * T, x0 = Math.max(l, cl), x1 = Math.min(r, cl + T);
        sy = (ty + 1) * T - Math.max(slopeH(k, (x0 - cl) / T), slopeH(k, (x1 - cl) / T));
      } else continue;
      if (sy < lo - EPS || sy > hi + EPS) continue;
      if (sy < best) { best = sy; bk = k; bm = -1; bc = -1; }
    }
    for (let i = 0; i < crumbles.length; i++) {
      if (s.crumble[i] < 0) continue;
      const k = crumbles[i];
      if (!(k.x < r && k.x + k.w > l)) continue;
      if (k.y < lo - EPS || k.y > hi + EPS) continue;
      if (k.y < best) { best = k.y; bk = TILE.GROUND; bm = -1; bc = i; }
    }
    if (s.vy >= 0) {
      for (let i = 0; i < movers.length; i++) {
        const mx = mNew[i * 2], my = mNew[i * 2 + 1];
        if (!(mx < r && mx + movers[i].w > l)) continue;
        const tol = Math.abs(my - mOld[i * 2 + 1]) + 0.5;
        if (oldBot > my + tol || my > hi + EPS) continue;
        if (my < best) { best = my; bk = TILE.WOOD; bm = i; bc = -1; }
      }
    }
    if (best <= newBot + EPS && s.vy < 0) { // rising into a slope / step lip: push up, stay airborne
      s.y = best - PH; s.grounded = false; s.ride = -1; s.gcr = -1;
      return;
    }
    if (best <= newBot + EPS || (stick > 0 && best !== Infinity)) {
      const impact = s.vy;
      s.y = best - PH; s.vy = 0; s.springing = false;
      if (!wasGrounded) ev("land", impact);
      s.grounded = true; s.gnd = bk; s.ride = bm; s.gcr = bc; s.coyote = COYOTE;
      if (bc >= 0 && s.crumble[bc] === 0) { s.crumble[bc] = 1; ev("crumble", bc); }
      return;
    }
    s.grounded = false; s.ride = -1; s.gcr = -1;
  }

  function overlapsPlayer(l, t, r, b) {
    return s.x < r && s.x + PW > l && s.y < b && s.y + PH > t;
  }
  function die(cause) {
    if (s.dead || s.won) return;
    s.dead = true; s.deadT = DEATH_FRAMES; s.deaths++; s.deathCause = cause; s.vx = 0; s.vy = 0;
    ev("die", cause);
  }
  function respawn() {
    const p = spawnPoint(s.cp);
    s.x = p.x; s.y = p.y; s.vx = 0; s.vy = 0; s.dead = false; s.deadT = 0;
    s.grounded = false; s.ride = -1; s.gcr = -1; s.coyote = 0; s.buffer = 0; s.springing = false; s.airT = 0;
    s.crumble.fill(0);
    ev("respawn", s.cp);
  }

  function hazardsAndTriggers(f) {
    const hl = s.x + HURT_INSET, ht = s.y + HURT_INSET, hr = s.x + PW - HURT_INSET, hb = s.y + PH - HURT_INSET;
    if (s.y > HPX) { die("pit"); return; }
    const c0 = Math.floor(hl / T), c1 = Math.floor((hr - EPS) / T), r0 = Math.floor(ht / T), r1 = Math.floor((hb - EPS) / T);
    for (let ty = r0; ty <= r1; ty++) for (let tx = c0; tx <= c1; tx++) {
      const k = tileAt(tx, ty);
      if (k < 12 || k > 16) continue;
      const ox = tx * T, oy = ty * T;
      if (k === TILE.WATER) {
        const top = oy + (tileAt(tx, ty - 1) === TILE.WATER ? 0 : WATER_TOP_INSET);
        if (hl < ox + T && hr > ox && ht < oy + T && hb > top) { die("water"); return; }
      } else {
        const q = SPIKE_RECT[k];
        if (hl < ox + q[2] && hr > ox + q[0] && ht < oy + q[3] && hb > oy + q[1]) { die("spike"); return; }
      }
    }
    for (let i = 0; i < hazards.length; i++) {
      hazardPos(i, f, tmp);
      const rad = hazards[i].r;
      const qx = tmp.x < hl ? hl : tmp.x > hr ? hr : tmp.x;
      const qy = tmp.y < ht ? ht : tmp.y > hb ? hb : tmp.y;
      const dx = tmp.x - qx, dy = tmp.y - qy;
      if (dx * dx + dy * dy < rad * rad) { die("hazard"); return; }
    }
    for (let i = 0; i < pulses.length; i++) {
      const p = pulses[i];
      if (pulseActive(i, f) && hl < p.x + p.w && hr > p.x && ht < p.y + p.h && hb > p.y) { die("pulse"); return; }
    }
    const cps = level.checkpoints;
    for (let i = s.cp + 1; i < cps.length; i++) {
      const p = cps[i];
      if (overlapsPlayer(p.x * T + 4, (p.y - 1) * T, p.x * T + T - 4, (p.y + 1) * T)) { s.cp = i; ev("checkpoint", i); }
    }
    const g = level.goal;
    if (overlapsPlayer(g.x * T, (g.y - 2) * T, g.x * T + T, (g.y + 1) * T)) {
      s.won = true; s.winFrame = f; s.vx = 0; ev("win", f);
    }
  }

  function approach(v, target, a) { return v < target ? Math.min(v + a, target) : Math.max(v - a, target); }

  function step(input) {
    if (EMIT) events.length = 0;
    input = input | 0;
    s.lastIn = input;
    if (s.won) return s;
    const f = s.frame, f1 = f + 1;
    // crumble timers
    for (let i = 0; i < crumbles.length; i++) {
      let c = s.crumble[i];
      if (c > 0) { c++; if (c > CRUMBLE_DELAY) { c = -CRUMBLE_RESPAWN; ev("crumble_break", i); } }
      else if (c < 0) {
        c++;
        if (c === 0) { const k = crumbles[i]; if (overlapsPlayer(k.x, k.y, k.x + k.w, k.y + T)) c = -1; else ev("crumble_back", i); }
      }
      s.crumble[i] = c;
    }
    if (s.dead) {
      s.held = (input & IN_JUMP) !== 0;
      if (--s.deadT <= 0) respawn();
      s.frame = f1;
      return s;
    }
    for (let i = 0; i < movers.length; i++) {
      pathPos(movers[i].P, f, tmp); mOld[i * 2] = tmp.x; mOld[i * 2 + 1] = tmp.y;
      pathPos(movers[i].P, f1, tmp); mNew[i * 2] = tmp.x; mNew[i * 2 + 1] = tmp.y;
    }
    if (s.ride >= 0) {
      const i = s.ride;
      moveX(mNew[i * 2] - mOld[i * 2]);
      s.y += mNew[i * 2 + 1] - mOld[i * 2 + 1];
      if (solidRectHit(s.x + 1, s.y + 1, s.x + PW - 1, s.y + PH - 1)) { die("crush"); s.frame = f1; return s; }
    }
    // input -> horizontal velocity
    const dir = (input & IN_RIGHT ? 1 : 0) - (input & IN_LEFT ? 1 : 0);
    const jumpHeld = (input & IN_JUMP) !== 0;
    const pressed = jumpHeld && !s.held;
    s.held = jumpHeld;
    if (pressed) s.buffer = JUMP_BUFFER; else if (s.buffer > 0) s.buffer--;
    if (!s.grounded && s.coyote > 0) s.coyote--;
    const ice = s.grounded && s.gnd === TILE.ICE;
    const acc = s.grounded ? (ice ? ICE_ACCEL : GROUND_ACCEL) : AIR_ACCEL;
    const dec = s.grounded ? (ice ? ICE_DECEL : GROUND_DECEL) : AIR_DECEL;
    const turn = s.grounded ? (ice ? ICE_TURN : GROUND_TURN) : AIR_TURN;
    if (dir !== 0) {
      s.facing = dir;
      if (s.vx * dir < 0) s.vx += dir * turn;
      else if (s.vx * dir < RUN_MAX) { s.vx += dir * acc; if (s.vx * dir > RUN_MAX) s.vx = dir * RUN_MAX; }
      else s.vx = approach(s.vx, dir * RUN_MAX, dec);
    } else s.vx = approach(s.vx, 0, dec);
    // jump
    let jumped = false;
    if (s.buffer > 0 && (s.grounded || s.coyote > 0)) {
      s.vy = JUMP_V; s.buffer = 0; s.coyote = 0; s.grounded = false; s.ride = -1; s.gcr = -1; s.springing = false;
      jumped = true; ev("jump");
    }
    // gravity
    if (s.vy < 0) s.vy += s.springing || jumpHeld ? G_UP : G_CUT;
    else { s.vy += G_DOWN; s.springing = false; }
    if (s.vy > MAX_FALL) s.vy = MAX_FALL;
    const wasGrounded = s.grounded;
    const oldBot = s.y + PH;
    if (moveX(s.vx)) s.vx = 0;
    moveY(wasGrounded, jumped);
    // springs (mushrooms): bounce when coming down onto the cap from above
    if (s.vy >= 0) {
      for (let i = 0; i < springs.length; i++) {
        const k = springs[i], capT = k.y + 14;
        if (oldBot <= capT + 2 && overlapsPlayer(k.x + 3, capT, k.x + T - 3, k.y + T)) {
          s.vy = SPRING_V * k.p; s.grounded = false; s.ride = -1; s.gcr = -1; s.springing = true; s.coyote = 0; s.buffer = 0;
          s.y = capT - PH;
          ev("spring", i);
          break;
        }
      }
    }
    hazardsAndTriggers(f1);
    s.airT = s.grounded ? 0 : s.airT + 1;
    s.frame = f1;
    return s;
  }

  function snapshot() {
    const o = Object.assign({}, s);
    o.crumble = s.crumble.slice();
    return o;
  }
  function restore(snap) {
    const cr = s.crumble;
    Object.assign(s, snap);
    s.crumble = cr;
    cr.set(snap.crumble);
    if (EMIT) events.length = 0;
  }
  // reset(cp = -1): back to frame 0 with 0 deaths, spawned at the start (or at checkpoint index cp, already active)
  function reset(cp = -1) {
    s.frame = 0; s.deaths = 0; s.cp = cp >= 0 && cp < level.checkpoints.length ? cp : -1; s.won = false; s.winFrame = -1; s.held = false; s.facing = 1;
    s.deathCause = ""; s.lastIn = 0;
    respawn();
    if (EMIT) events.length = 0;
  }
  // run(inputs) -> state after feeding every input byte (stops early on win).
  function run(inputs) {
    for (let i = 0; i < inputs.length && !s.won; i++) step(inputs[i]);
    return s;
  }
  // Distance (px) from the player's center to the nearest deadly thing within maxDist, else Infinity.
  // For renderers (worried face). Not used by step().
  function nearestHazard(maxDist = 96) {
    const cx = s.x + PW / 2, cy = s.y + PH / 2;
    let best = Infinity;
    const c0 = Math.floor((cx - maxDist) / T), c1 = Math.floor((cx + maxDist) / T);
    const r0 = Math.floor((cy - maxDist) / T), r1 = Math.floor((cy + maxDist) / T);
    for (let ty = r0; ty <= r1; ty++) for (let tx = c0; tx <= c1; tx++) {
      if (tx < 0 || tx >= W || ty < 0 || ty >= H) continue;
      const k = grid[ty * W + tx];
      if (k < 12 || k > 16) continue;
      const dx = Math.max(tx * T - cx, 0, cx - (tx + 1) * T), dy = Math.max(ty * T - cy, 0, cy - (ty + 1) * T);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) best = d;
    }
    for (let i = 0; i < hazards.length; i++) {
      hazardPos(i, s.frame, tmp);
      const d = Math.sqrt((tmp.x - cx) ** 2 + (tmp.y - cy) ** 2) - hazards[i].r;
      if (d < best) best = Math.max(0, d);
    }
    for (let i = 0; i < pulses.length; i++) {
      const p = pulses[i], q = pulsePhase(i, s.frame);
      if (!(q < p.on || q >= p.period - 45)) continue;
      const dx = Math.max(p.x - cx, 0, cx - (p.x + p.w)), dy = Math.max(p.y - cy, 0, cy - (p.y + p.h));
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) best = d;
    }
    return best <= maxDist ? best : Infinity;
  }

  reset();

  return {
    level, compiled: C, W, H, grid, state: s, events,
    step, snapshot, restore, reset, run,
    tileAt, solidRectHit, spawnPoint, moverPos, hazardPos, pulsePhase, pulseActive, nearestHazard,
    get frame() { return s.frame; },
  };
}
