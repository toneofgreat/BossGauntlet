// Choice-state idle watcher (DESIGN 9.4 #4): 10 minutes of no input at all while phase "choice" -> final boss.
// Last minute: a faint clock tick fades in. Last 30 s: the screen slowly greys out. Any input resets everything.
import { clamp, safe } from "./util.js";

export const IDLE_LIMIT = 600;

export class IdleWatcher {
  constructor(ev) {
    this.ev = ev; this.armed = false; this.offset = 0; this.lastIdle = 0; this.tick = null; this.grey = 0; this.fired = false;
  }
  arm() { this.armed = true; this.fired = false; this.offset = 0; this.ev.state.rt.idleLock = true; }
  disarm() { this.armed = false; this.ev.state.rt.idleLock = false; this._clearFx(); }
  reset() { this.disarm(); this.offset = 0; this.fired = false; }
  /** debug: pretend the player has been idle for 600 s */
  pretend() { if (!this.armed && this.ev.phase() === "choice") this.arm(); this.offset = IDLE_LIMIT + 1; }
  activity() { if (this.offset > 0 && this.offset < IDLE_LIMIT) this.offset = 0; }
  idleSeconds() {
    const inp = this.ev.engine && this.ev.engine.input;
    let s = 0; try { s = inp && typeof inp.idleSeconds === "function" ? inp.idleSeconds() : 0; } catch (e) { s = 0; }
    if (s + 0.25 < this.lastIdle && this.offset < IDLE_LIMIT) this.offset = 0; // input happened
    this.lastIdle = s;
    return s + this.offset;
  }
  _clearFx() {
    if (this.tick) { try { this.tick.stop(0.5); } catch (e) { /* */ } this.tick = null; }
    if (this.grey > 0) { this.grey = 0; this.ev.postfx({ saturation: 1, vignette: 0.25 }); }
  }
  update() {
    if (!this.armed || this.fired) return;
    const ev = this.ev, st = ev.state;
    if (ev.phase() !== "choice") { this.disarm(); return; }
    if (st.ui && (st.ui.modal || (st.ui.screen && st.ui.screen !== "game")) || st.rt.paused || st.rt.cinematic) { this.lastIdle = 0; return; }
    const idle = this.idleSeconds();
    const left = IDLE_LIMIT - idle;
    // clock tick over the last minute
    if (left < 60) {
      if (!this.tick) this.tick = safe(ev.audio, "loop", "clock_tick", { vol: 0 }) || null;
      if (this.tick) safe(this.tick, "setVol", clamp(1 - left / 60, 0, 1) * 0.5);
    } else if (this.tick) { this._clearFx(); }
    // grey out over the last 30 s (luminance change is slow: no flashing concerns)
    const g = left < 30 ? clamp(1 - left / 30, 0, 1) : 0;
    if (Math.abs(g - this.grey) > 0.01) {
      this.grey = g; ev.postfx({ saturation: 1 - g, vignette: 0.25 + g * 0.5 });
    }
    if (idle >= IDLE_LIMIT) {
      this.fired = true; this.offset = 0;
      this._clearFx();
      ev.trigger("final", { fromIdle: true });
    }
  }
}
