// Sequencer: one Seq per running sequence. All waits run on game time (ticked by the EVENTS system), can be
// skipped (skipTimers) and are rejected with ABORT when the sequence is stopped, so `finally` blocks always run.
import { safe } from "./util.js";

export const ABORT = { aborted: true, toString() { return "[events] sequence aborted"; } };
export function isAbort(e) { return e === ABORT; }

let nextSeqId = 1;
// fire-and-forget seq.p()/seq.say() calls must not raise "unhandled rejection" when the sequence aborts;
// awaiting callers still see the ABORT rejection.
function handled(pr) { pr.catch(() => {}); return pr; }

export class Seq {
  constructor(ev, id) {
    this.ev = ev; this.ctx = ev.ctx; this.id = id; this.uid = nextSeqId++;
    this.aborted = false; this.timers = []; this.defers = []; this.pending = new Set();
    this.t = 0;
  }
  // ---- core ----
  _add(tm) {
    if (this.aborted) return handled(Promise.reject(ABORT));
    return handled(new Promise((resolve, reject) => {
      tm.resolve = resolve; tm.reject = reject; this.timers.push(tm);
    }));
  }
  /** game-time wait (skippable) */
  wait(sec) { return this._add({ kind: "wait", left: Math.max(0, sec), skippable: true }); }
  /** counts only while the player is moving (and pred() if given) */
  walkSeconds(sec, pred) { return this._add({ kind: "walk", left: sec, pred: pred || null, skippable: true }); }
  /** counts only while pred() is true (skippable) */
  waitWhile(sec, pred) { return this._add({ kind: "cond", left: sec, pred, skippable: true }); }
  /** resolves when pred() is true (checked every frame; not skippable) */
  until(pred) { return this._add({ kind: "until", pred, skippable: false }); }
  /** until(pred) or the timeout elapses (the timeout part is skippable). Resolves true if pred won. */
  untilOr(pred, timeout) { return this._add({ kind: "untilOr", pred, left: timeout, skippable: true }).then((v) => v === true); }
  /** race any external promise against abort */
  p(promise) {
    if (this.aborted) return handled(Promise.reject(ABORT));
    return handled(new Promise((resolve, reject) => {
      const entry = { reject };
      this.pending.add(entry);
      Promise.resolve(promise).then(
        (v) => { this.pending.delete(entry); if (!this.aborted) resolve(v); },
        (e) => { this.pending.delete(entry); if (!this.aborted) { console.warn("[events]", e); resolve(undefined); } });
    }));
  }
  check() { if (this.aborted) throw ABORT; }
  defer(fn) { this.defers.push(fn); return fn; }

  tick(dt) {
    this.t += dt;
    const tm = this.timers; if (!tm.length) return;
    const player = this.ctx.engine && this.ctx.engine.player;
    for (let i = tm.length - 1; i >= 0; i--) {
      const w = tm[i]; let done = false, val;
      try {
        switch (w.kind) {
          case "wait": w.left -= dt; done = w.left <= 0; break;
          case "walk": if (player && player.isMoving() && (!w.pred || w.pred())) w.left -= dt; done = w.left <= 0; break;
          case "cond": if (w.pred()) w.left -= dt; done = w.left <= 0; break;
          case "until": done = !!w.pred(); val = true; break;
          case "untilOr": if (w.pred()) { done = true; val = true; } else { w.left -= dt; done = w.left <= 0; val = false; } break;
        }
      } catch (e) { console.warn("[events] timer", e); done = true; }
      if (done) { tm[i] = tm[tm.length - 1]; tm.pop(); w.resolve(val); }
    }
  }
  skip() {
    const tm = this.timers;
    for (let i = tm.length - 1; i >= 0; i--) {
      const w = tm[i];
      if (w.skippable) { tm[i] = tm[tm.length - 1]; tm.pop(); w.resolve(w.kind === "untilOr" ? false : undefined); }
    }
  }
  abort() {
    if (this.aborted) return;
    this.aborted = true;
    const tm = this.timers; this.timers = [];
    for (const w of tm) w.reject(ABORT);
    for (const e of this.pending) e.reject(ABORT);
    this.pending.clear();
  }
  runDefers() {
    const d = this.defers; this.defers = [];
    for (let i = d.length - 1; i >= 0; i--) { try { d[i](); } catch (e) { console.warn("[events] cleanup", e); } }
  }
  // ---- conveniences ----
  fade(to, dur = 0.8, color = "#000") { return this.p(safe(this.ctx.ui, "fade", to, dur, color)); }
  /** non-blocking subtitle line; returns a promise you may await */
  say(speaker, text, opts) {
    const st = this.ctx.story;
    let r;
    if (st && typeof st.say === "function") r = safe(st, "say", speaker, text, opts || { dur: 3 });
    else r = safe(this.ctx.ui, "subtitle", text, (opts && opts.dur) || 3);
    return this.p(r);
  }
}
