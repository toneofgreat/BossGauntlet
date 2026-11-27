// loop.js - the frame loop, system registry, game-time timers (CONTRACT 5.1).
//   systems run in priority order every simulated sub-step (sub-step <= 0.05 s, up to 8 per frame when rt.fast > 1);
//   systems with priority >= 100 (postfx/render) run once per frame after the sub-steps.
//   paused (rt.paused): only systems with priority >= 80 (ui, render) run, with real dt.

export function createLoop(ctx) {
  const systems = [];         // { name, fn, priority, dead }
  let sorted = true;
  const timers = [];          // { at, every, fn, dead }
  let running = false;
  let rafId = 0;
  let lastNow = 0;
  const yieldQueue = [];

  const loop = {
    time: 0,          // game seconds
    realTime: 0,      // real seconds since start
    frame: 0,
    substep: 0,       // index of the current sub-step within the frame (input uses it for pressed())
    lastDt: 0,
    realDt: 0,
    frameMs: 16.7,    // smoothed real frame time
    onFrameStart: null,  // fn(realDt) before systems (input latch)
    onFrameEnd: null,
    errors: 0
  };

  function addSystem(name, fn, priority = 50) {
    const rec = { name, fn, priority, dead: false };
    systems.push(rec);
    sorted = false;
    return () => { rec.dead = true; };
  }

  function sortSystems() {
    let w = 0;
    for (let i = 0; i < systems.length; i++) if (!systems[i].dead) systems[w++] = systems[i];
    systems.length = w;
    systems.sort((a, b) => a.priority - b.priority);
    sorted = true;
  }

  function every(sec, fn) {
    const rec = { at: loop.time + Math.max(0.001, sec), every: Math.max(0.001, sec), fn, dead: false };
    timers.push(rec);
    return () => { rec.dead = true; };
  }
  function after(sec, fn) {
    const rec = { at: loop.time + Math.max(0, sec), every: 0, fn, dead: false };
    timers.push(rec);
    return () => { rec.dead = true; };
  }

  function runTimers() {
    let removed = false;
    const n = timers.length;
    for (let i = 0; i < n; i++) {
      const t = timers[i];
      if (t.dead) { removed = true; continue; }
      if (loop.time >= t.at) {
        try { t.fn(); } catch (e) { warn("timer", e); }
        if (t.every > 0 && !t.dead) {
          t.at += t.every;
          if (t.at < loop.time) t.at = loop.time + t.every;
        } else { t.dead = true; removed = true; }
      }
    }
    if (removed) {
      let w = 0;
      for (let i = 0; i < timers.length; i++) if (!timers[i].dead) timers[w++] = timers[i];
      timers.length = w;
    }
  }

  function warn(name, e) {
    loop.errors++;
    if (loop.errors < 60) console.warn("[engine:" + name + "]", e);
    try {
      const g = window.__tnrpg;
      if (g && g.errors && g.errors.length < 200) g.errors.push("system " + name + ": " + (e && e.message ? e.message : String(e)));
    } catch (e2) { /* ignore */ }
  }

  function runSystems(dt, minP, maxP) {
    for (let i = 0; i < systems.length; i++) {
      const s = systems[i];
      if (s.dead || s.priority < minP || s.priority >= maxP) continue;
      try { s.fn(dt, loop.time); } catch (e) { warn(s.name, e); }
    }
  }

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    const realDt = Math.min(0.25, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    step(realDt);
  }

  function step(realDt) {
    if (!sorted) sortSystems();
    loop.realDt = realDt;
    loop.realTime += realDt;
    loop.frame++;
    loop.frameMs += (realDt * 1000 - loop.frameMs) * 0.08;
    // resolve yieldFrame() promises
    if (yieldQueue.length) {
      const q = yieldQueue.splice(0, yieldQueue.length);
      for (let i = 0; i < q.length; i++) q[i]();
    }
    if (loop.onFrameStart) { try { loop.onFrameStart(realDt); } catch (e) { warn("frameStart", e); } }
    const rt = ctx.state.rt;
    if (rt.paused) {
      loop.substep = 0;
      loop.lastDt = 0;
      runSystems(realDt, 80, 100);
    } else {
      const scale = Math.max(0, (rt.timeScale == null ? 1 : rt.timeScale)) * Math.max(1, Math.min(120, rt.fast || 1));
      let total = Math.min(realDt, 0.1) * scale;
      // never more than 8 sub-steps of at most 0.05 s
      let n = Math.max(1, Math.ceil(total / 0.05 - 1e-6));
      if (n > 8) { n = 8; }
      const dt = Math.min(0.05, total / n);
      for (let i = 0; i < n; i++) {
        loop.substep = i;
        loop.lastDt = dt;
        loop.time += dt;
        runTimers();
        runSystems(dt, -1e9, 100);
      }
    }
    loop.substep = 0;
    runSystems(loop.lastDt || realDt, 100, 1e9);
    if (loop.onFrameEnd) { try { loop.onFrameEnd(realDt); } catch (e) { warn("frameEnd", e); } }
  }

  function start() {
    if (running) return;
    running = true;
    lastNow = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stop() { running = false; cancelAnimationFrame(rafId); }

  function yieldFrame() {
    return new Promise((resolve) => {
      if (running) { yieldQueue.push(resolve); return; }
      // loop not started yet (init phase): next animation frame, or a timeout when the tab is hidden
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(); } };
      try { requestAnimationFrame(fin); } catch (e) { /* ignore */ }
      setTimeout(fin, 50);
    });
  }

  loop.addSystem = addSystem;
  loop.every = every;
  loop.after = after;
  loop.start = start;
  loop.stop = stop;
  loop.step = step;
  loop.yieldFrame = yieldFrame;
  loop.isRunning = () => running;
  return loop;
}
