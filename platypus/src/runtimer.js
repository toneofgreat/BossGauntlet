// runtimer.js - the speedrun clock (LEVELS3.md A2). Pure: no DOM. The engine ticks it once a frame with the
// real (unscaled) frame time; it counts unpaused wall time from start() to stop(), clamped to 0.25 s per frame so
// a stall never adds a jump. Checkpoint restarts do not reset it; leaving the level discards the run.

export function formatMs(ms) {
  ms = Math.max(0, Math.round(ms || 0));
  const cs = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000) % 60, m = Math.floor(ms / 60000);
  return m + ":" + (s < 10 ? "0" : "") + s + "." + (cs < 10 ? "0" : "") + cs;
}

export function createRunTimer() {
  let level = 0, running = false, paused = 0, elapsed = 0, stopped = false, assisted = false, hard = false;
  const t = {
    // a run of `level` begins (the clock starts at 0). o: { hard }
    start(n, o) {
      level = n | 0; elapsed = 0; running = true; stopped = false; paused = 0;
      assisted = false; hard = !!(o && o.hard);
    },
    // restart the clock at 0 without forgetting that the run is assisted (title card finished)
    restart() { if (running) elapsed = 0; },
    // the run is over (won): returns the final ms; later calls return the same value
    stop() { if (running) { running = false; stopped = true; } return Math.round(elapsed); },
    // the level was left: forget the run
    discard() { running = false; stopped = false; level = 0; elapsed = 0; paused = 0; },
    // pause sources nest (pause menu, hidden tab, lost focus)
    pause() { paused++; },
    resume() { if (paused > 0) paused--; },
    resumeAll() { paused = 0; },
    markAssisted() { if (running || stopped) assisted = true; },
    // per frame, raw seconds
    tick(raw) {
      if (!running || paused > 0 || !(raw > 0)) return;
      elapsed += Math.min(raw, 0.25) * 1000;
    },
    get ms() { return Math.round(elapsed); },
    get level() { return level; },
    get running() { return running; },
    get stopped() { return stopped; },
    get paused() { return paused > 0; },
    get assisted() { return assisted; },
    get hard() { return hard; },
  };
  return t;
}
