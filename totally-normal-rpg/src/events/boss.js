// Shared boss plumbing for the Hollow fights: HP, phase checkpoints, boss bus events, hittables,
// player-death handling hooks and debug force-win/lose.
import { clamp, wrapAngle } from "./util.js";

export class BossCore {
  /**
   * o: { id, kind, name, maxHp, thresholds:[0.75,0.5,0.25], rec, segments }
   */
  constructor(ev, o) {
    this.ev = ev; this.id = o.id; this.kind = o.kind; this.name = o.name; this.maxHp = o.maxHp; this.hp = o.maxHp;
    this.thresholds = o.thresholds || [0.75, 0.5, 0.25]; this.rec = Math.max(1, o.rec || 1); this.segments = o.segments || 0;
    this.phase = 0; this.done = false; this.won = false; this.started = false; this.dead = false;
    this.hpPayload = { id: this.id, hp: this.hp, maxHp: this.maxHp, phase: 0 };
    this.onPhase = null; this.onDefeat = null; this.removers = [];
    this.fakeHp = -1; this.invuln = 0;
  }
  begin() {
    this.started = true; this.hp = this.maxHp; this.phase = 0;
    const p = { id: this.id, kind: this.kind, name: this.name, maxHp: this.maxHp };
    if (this.segments) p.segments = this.segments;
    this.ev.emit("boss:start", p); this.emitHp();
    if (this.ev.pendingOutcome) { const o = this.ev.pendingOutcome; this.ev.pendingOutcome = null; this.ev.after(0.05, () => this.ev.forceOutcome(o)); }
  }
  phaseStartHp(i) { return i <= 0 ? this.maxHp : Math.round(this.maxHp * this.thresholds[i - 1]); }
  emitHp() {
    const p = this.hpPayload; p.hp = this.fakeHp >= 0 ? this.fakeHp : Math.max(0, this.hp); p.maxHp = this.maxHp; p.phase = this.phase;
    this.ev.emit("boss:hp", p);
  }
  /** apply damage; returns applied */
  damage(dmg) {
    if (this.done || this.dead || !this.started || this.invuln > 0) return 0;
    const before = this.hp; this.hp = Math.max(0, this.hp - dmg);
    // phase changes
    while (this.phase < this.thresholds.length && this.hp <= this.maxHp * this.thresholds[this.phase]) {
      this.phase++;
      if (this.onPhase) { try { this.onPhase(this.phase); } catch (e) { console.warn("[events] phase", e); } }
    }
    this.emitHp();
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      if (this.onDefeat) { try { this.onDefeat(); } catch (e) { console.warn("[events] defeat", e); } }
    }
    return before - this.hp;
  }
  resetToPhase() { this.hp = this.phaseStartHp(this.phase); this.dead = false; this.emitHp(); }
  addHittable(h) {
    const c = this.ev.ctx.combat; if (!c || typeof c.addHittable !== "function") return null;
    try { const rm = c.addHittable(h); if (rm) this.removers.push(rm); return rm; } catch (e) { console.warn("[events] hittable", e); return null; }
  }
  clearHittables() { for (const r of this.removers) { try { r(); } catch (e) { /* gone */ } } this.removers.length = 0; }
  finish(won) {
    if (this.done) return;
    this.done = true; this.won = won; this.clearHittables();
    this.ev.emit("boss:end", { id: this.id, kind: this.kind, won });
  }
}

// ------------------------------------------------------------------------------------------------------------
// geometry helpers on the player (no allocation)
/** is the player inside a horizontal cone from (x,z) with yaw, range and half-angle? */
export function playerInCone(pl, x, z, yaw, range, half) {
  const p = pl.position; const dx = p.x - x, dz = p.z - z; const d = Math.sqrt(dx * dx + dz * dz);
  if (d > range) return false; if (d < 0.6) return true;
  const a = Math.atan2(dx, dz); return Math.abs(wrapAngle(a - yaw)) <= half;
}
export function playerDist(pl, x, z) { const p = pl.position; const dx = p.x - x, dz = p.z - z; return Math.sqrt(dx * dx + dz * dz); }
/** is the player inside a rectangle starting at (x,z) going `len` along yaw with half-width hw */
export function playerInLine(pl, x, z, yaw, len, hw) {
  const p = pl.position; const dx = p.x - x, dz = p.z - z;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const along = dx * fx + dz * fz, side = -dx * fz + dz * fx;
  return along >= -0.5 && along <= len && Math.abs(side) <= hw;
}
export function grounded(pl, floorY) { return pl.position.y - floorY < 0.55; }
export { clamp };
