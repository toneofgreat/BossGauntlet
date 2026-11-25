// player.js - the cube in the bonus level: movement, swimming, fall damage, hurt/faint/respawn (CORE owns; API
// frozen: BONUS.md 2.4). DOM-free. Movement constants are the main game's (src/sim/constants.js) so it feels the same.
import {
  T, PW, PH, B_LEFT, B_RIGHT, B_JUMP, HP_MAX, HUNGER_MAX, HURT_IFRAMES, DEATH_STEPS, FALL_SAFE_TILES,
  SWIM_G, SWIM_MAX_FALL, SWIM_UP, SWIM_UP_MAX, SWIM_RUN,
} from "./const.js";
import {
  RUN_MAX, GROUND_ACCEL, GROUND_DECEL, GROUND_TURN, AIR_ACCEL, AIR_DECEL, AIR_TURN, JUMP_V, G_UP, G_CUT, G_DOWN,
  MAX_FALL, COYOTE, JUMP_BUFFER,
} from "../../sim/constants.js";
import { moveBody, bodyInWater, LANDED, BONKED } from "./physics.js";
import { respawnPoint } from "../house/index.js";

export function createPlayer(tx, groundRow) {
  const p = {
    x: (tx + 0.5) * T - PW / 2, y: groundRow * T - PH, w: PW, h: PH, vx: 0, vy: 0, ox: 0, oy: 0,
    grounded: false, facing: 1, held: false, coyote: 0, buffer: 0, inWater: false, smoothY: 0,
    peakY: 0, airT: 0,
    hp: HP_MAX, maxHp: HP_MAX, hunger: HUNGER_MAX, maxHunger: HUNGER_MAX,
    hurtT: 0, kbT: 0, dead: false, deadT: 0, faints: 0,
    swingT: 0, swingCd: 0, swingLen: 1, swingKind: "hand", // swingT counts down from swingLen during a swing
    lastHurtBy: "",
  };
  p.peakY = p.y; p.ox = p.x; p.oy = p.y;
  return p;
}
const approach = (v, to, d) => (v < to ? Math.min(v + d, to) : Math.max(v - d, to));

// one 60 Hz step of movement (called by stepGame before the action + systems)
export function stepPlayer(G, bits) {
  const p = G.player;
  p.ox = p.x; p.oy = p.y + p.smoothY;
  if (p.smoothY !== 0) p.smoothY = approach(p.smoothY, 0, 4);
  if (p.hurtT > 0) p.hurtT--;
  if (p.swingT > 0) p.swingT--;
  if (p.swingCd > 0) p.swingCd--;
  if (p.dead) {
    p.vx = 0; p.vy = 0;
    if (--p.deadT <= 0) respawnPlayer(G);
    return;
  }
  const dir = p.kbT > 0 ? 0 : (bits & B_RIGHT ? 1 : 0) - (bits & B_LEFT ? 1 : 0);
  if (p.kbT > 0) p.kbT--;
  const jumpHeld = (bits & B_JUMP) !== 0, pressed = jumpHeld && !p.held;
  p.held = jumpHeld;
  const wasWater = p.inWater;
  p.inWater = bodyInWater(G, p);
  if (p.inWater !== wasWater) G.bus.emit(p.inWater ? "player:splash" : "player:unsplash", { x: p.x + p.w / 2, y: p.y + p.h / 2, vy: p.vy });
  if (pressed) p.buffer = JUMP_BUFFER; else if (p.buffer > 0) p.buffer--;
  if (!p.grounded && p.coyote > 0) p.coyote--;

  // horizontal
  const max = p.inWater ? SWIM_RUN : RUN_MAX;
  const acc = p.grounded ? GROUND_ACCEL : AIR_ACCEL, dec = p.grounded ? GROUND_DECEL : AIR_DECEL, turn = p.grounded ? GROUND_TURN : AIR_TURN;
  if (dir !== 0) {
    p.facing = dir;
    if (p.vx * dir < 0) p.vx += dir * turn;
    else if (p.vx * dir < max) { p.vx += dir * acc; if (p.vx * dir > max) p.vx = dir * max; }
    else p.vx = approach(p.vx, dir * max, dec);
  } else if (p.kbT <= 0) p.vx = approach(p.vx, 0, dec);

  // vertical
  if (p.inWater) {
    const nearTop = !bodyInWater(G, { x: p.x, y: p.y - T * 0.6, w: p.w, h: p.h });
    if (pressed && nearTop) { p.vy = JUMP_V * 0.82; p.buffer = 0; G.bus.emit("player:jump", { water: true }); }
    else if (jumpHeld) p.vy = Math.max(p.vy - SWIM_UP, -SWIM_UP_MAX);
    else { p.vy += SWIM_G; if (p.vy > SWIM_MAX_FALL) p.vy = Math.max(SWIM_MAX_FALL, p.vy * 0.9); }
    p.peakY = p.y;
  } else {
    if (p.buffer > 0 && (p.grounded || p.coyote > 0)) {
      p.vy = JUMP_V; p.buffer = 0; p.coyote = 0; p.grounded = false;
      G.bus.emit("player:jump", { x: p.x + p.w / 2, y: p.y + p.h });
    }
    if (p.vy < 0) p.vy += jumpHeld ? G_UP : G_CUT; else p.vy += G_DOWN;
    if (p.vy > MAX_FALL) p.vy = MAX_FALL;
  }
  const impact = p.vy;
  const f = moveBody(G, p, { stepUp: true });
  if (f & BONKED) G.bus.emit("player:bonk", {});
  if (p.grounded) {
    p.coyote = COYOTE;
    if (f & LANDED) {
      const fall = p.y - p.peakY;
      G.bus.emit("player:land", { x: p.x + p.w / 2, y: p.y + p.h, impact, fallTiles: fall / T });
      const extra = fall / T - FALL_SAFE_TILES;
      if (extra > 0 && !p.inWater) hurtPlayer(G, Math.floor(extra * 5) + 1, p.x + p.w / 2, 0, "fall");
    }
    p.peakY = p.y; p.airT = 0;
  } else { p.airT++; if (p.y < p.peakY) p.peakY = p.y; }
  if (p.inWater) p.peakY = p.y;
}

// damage the player. fromX = px x of the source (knockback pushes away from it), kb = px/step.
// -> true when the damage landed (false while invulnerable / fainted)
export function hurtPlayer(G, dmg, fromX, kb = 0, cause = "") {
  const p = G.player;
  if (p.dead || p.hurtT > 0 || dmg <= 0) return false;
  p.hp = Math.max(0, p.hp - dmg);
  p.hurtT = HURT_IFRAMES; p.lastHurtBy = cause;
  if (kb > 0) { const s = p.x + p.w / 2 >= fromX ? 1 : -1; p.vx = s * kb; p.vy = Math.min(p.vy, -kb * 0.6); p.kbT = 10; p.grounded = false; }
  G.bus.emit("player:hurt", { dmg, cause, hp: p.hp, x: p.x + p.w / 2, y: p.y + p.h / 2 });
  if (p.hp <= 0) faint(G, cause);
  return true;
}
export function healPlayer(G, n) {
  const p = G.player;
  if (p.dead || n <= 0) return 0;
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + n);
  return p.hp - before;
}
// hp 0 = faint (family friendly: no gore, you wake up at home and keep your things)
export function faint(G, cause = "") {
  const p = G.player;
  if (p.dead) return;
  p.dead = true; p.deadT = DEATH_STEPS; p.faints++; p.swingT = 0;
  G.bus.emit("player:die", { cause, x: p.x + p.w / 2, y: p.y + p.h / 2 });
}
export function respawnPlayer(G) {
  const p = G.player, sp = respawnPoint(G);
  p.x = sp.x; p.y = sp.y; p.ox = p.x; p.oy = p.y; p.vx = 0; p.vy = 0; p.smoothY = 0; p.peakY = p.y;
  p.dead = false; p.hurtT = HURT_IFRAMES * 2;
  p.hp = Math.max(p.hp, Math.round(p.maxHp * 0.6));
  p.hunger = Math.max(p.hunger, Math.min(p.maxHunger, 40));
  G.bus.emit("player:respawn", { x: p.x + p.w / 2, y: p.y + p.h / 2 });
}
// put the player's feet on the top of row ty+1... i.e. standing in cell (tx, ty)
export function placePlayer(G, tx, ty) {
  const p = G.player;
  p.x = (tx + 0.5) * T - p.w / 2; p.y = (ty + 1) * T - p.h; p.vx = 0; p.vy = 0; p.ox = p.x; p.oy = p.y; p.smoothY = 0; p.peakY = p.y;
  p.grounded = false;
}
export const playerCenter = (G) => ({ x: G.player.x + G.player.w / 2, y: G.player.y + G.player.h / 2 });
