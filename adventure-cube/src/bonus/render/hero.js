// render/hero.js - the cube in the bonus level (BONUS_RENDER): Area 1's painted cube (src/render/cube.js) with mood,
// squash/stretch, swimming bob, the selected tool held and swung (tier materials come from the item icons), a swing
// trail, a held torch / lantern, and the Cube Monarch crown.
import { PW, PH } from "../core/const.js";
import { createCubePaint, drawCube, drawDizzy } from "../../render/cube.js";
import { artFor } from "../../render/themes.js";
import { ITEMS } from "../data/items.js";
import { lg, ell, TAU } from "./kit.js";

const HALF = PH / 2;
export function createHero(iconCanvas) {
  const paint = createCubePaint(artFor("forest"));
  const P = { sx: 1, sy: 1, rot: 0, look: { x: 0, y: 0 }, blink: 0, mood: "idle", alpha: 1, t: 0, fear: 0 };
  let sq = 0, sqV = 0, blinkT = 2, rot = 0, lastSel = null, popT = 0;
  const an = {
    jump() { sqV += 9; },
    land(impact) { sqV -= Math.min(16, 3 + Math.abs(impact) * 1.1); },
    pop() { popT = 0.25; },
  };
  // where the tool sits: grip point in the cube's local frame (facing right)
  function drawTool(ctx, id, p, t) {
    const it = ITEMS[id]; if (!it) return null;
    const type = it.tool ? it.tool.type : it.id === "torch" || it.id === "lantern" ? it.id : null;
    if (!type) return null;
    const swinging = p.swingT > 0 && p.swingKind !== "hand", u = swinging ? 1 - p.swingT / Math.max(1, p.swingLen) : 0;
    ctx.save();
    if (type === "bow") {
      ctx.translate(13, 2);
      const pull = swinging ? Math.sin(u * Math.PI) : 0;
      ctx.strokeStyle = "#6a4426"; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(-6, 0, 13, -1.2, 1.2); ctx.stroke();
      ctx.strokeStyle = "#efe6cc"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-6 + Math.cos(-1.2) * 13, Math.sin(-1.2) * 13); ctx.lineTo(-pull * 8 - 2, 0); ctx.lineTo(-6 + Math.cos(1.2) * 13, Math.sin(1.2) * 13); ctx.stroke();
      if (pull > 0.1) { ctx.strokeStyle = "#c8b48a"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-pull * 8 - 2, 0); ctx.lineTo(14, 0); ctx.stroke(); }
      ctx.restore(); return null;
    }
    const ic = iconCanvas(id);
    let ang, gx = 11, gy = 3;
    if (type === "torch" || type === "lantern") { ang = -0.1 + Math.sin(t * 2) * 0.04; gx = 13; gy = 2; }
    else if (swinging) {
      if (type === "spear") { ang = -0.75 + 0.05; gx = 6 + Math.sin(u * Math.PI) * 14; gy = 2; }
      else {
        // raise back then a fast arc forward/down, then settle
        const e = u < 0.18 ? -(u / 0.18) * 0.5 : u < 0.62 ? -0.5 + ((u - 0.18) / 0.44) ** 1.6 * 3.0 : 2.5 - (u - 0.62) / 0.38 * 1.6;
        ang = -1.35 + e;
      }
    } else ang = -0.55 + Math.sin(t * 2.2) * 0.03;
    ctx.translate(gx, gy); ctx.rotate(ang + 0.785); // icons point up-right (45 deg)
    const s = 24;
    // grip near the handle end (icon space ~ (0.3, 0.8))
    ctx.drawImage(ic, -s * 0.3, -s * 0.8, s, s);
    ctx.restore();
    // swing trail
    if (swinging && type !== "spear" && u > 0.2 && u < 0.7) {
      const a0 = -1.35 + -0.5 + ((Math.max(0.18, u - 0.12) - 0.18) / 0.44) ** 1.6 * 3.0, a1 = ang;
      ctx.strokeStyle = `rgba(255,255,255,${(0.45 * Math.sin(((u - 0.2) / 0.5) * Math.PI)).toFixed(3)})`; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(11, 3, 21, Math.min(a0, a1) - 0.785 + 0.6, Math.max(a0, a1) - 0.785 + 0.6); ctx.stroke();
    }
    if (type === "torch") { const tip = rotPt(gx, gy, ang + 0.785, s * 0.5, -s * 0.55); return tip; }
    if (type === "lantern") { const tip = rotPt(gx, gy, ang + 0.785, s * 0.2, -s * 0.3); return tip; }
    return null;
  }
  const rotPt = (gx, gy, a, x, y) => [gx + x * Math.cos(a) - y * Math.sin(a), gy + x * Math.sin(a) + y * Math.cos(a)];

  // draw at world center (cx, cy). Returns the world point of a held flame (for glow + light) or null.
  function draw(ctx, G, cx, cy, view, sel, crown) {
    const p = G.player, dt = Math.min(0.05, view.dt || 0.016), t = view.time;
    // squash spring
    sqV += (-sq * 160 - sqV * 14) * dt; sq += sqV * dt;
    if (sq > 0.35) sq = 0.35; if (sq < -0.35) sq = -0.35;
    blinkT -= dt; if (blinkT < 0) { blinkT = 2.5 + Math.random() * 3; }
    P.blink = blinkT < 0.12 ? 1 : 0;
    P.t = t;
    P.mood = p.dead ? "dead" : p.hurtT > 24 ? "worried" : !p.grounded && !p.inWater ? (p.vy > 5 ? "fall" : "jump") : Math.abs(p.vx) > 1.2 ? "run" : popT > 0 ? "happy" : "idle";
    if (popT > 0) popT -= dt;
    P.look.x += ((p.facing * 0.85) - P.look.x) * Math.min(1, dt * 10);
    P.look.y += (((p.vy > 3 ? 0.6 : p.vy < -3 ? -0.5 : 0)) - P.look.y) * Math.min(1, dt * 8);
    P.alpha = p.hurtT > 0 && ((G.frame >> 2) & 1) ? 0.55 : 1;
    P.fear = p.hp < p.maxHp * 0.25 ? 1 : 0;
    const want = p.dead ? Math.PI / 2 * p.facing : !p.grounded && !p.inWater ? p.vx * 0.012 : 0;
    rot += (want - rot) * Math.min(1, dt * 12);
    const bob = p.inWater ? Math.sin(t * 3.2) * 2 : 0;
    const sx = 1 - sq * 0.5, sy = 1 + sq;
    ctx.save();
    ctx.translate(cx, cy + HALF + bob);
    ctx.rotate(rot);
    ctx.scale(sx, sy);
    ctx.translate(0, -HALF);
    if (p.facing < 0) { ctx.save(); ctx.scale(-1, 1); }
    const behind = sel && ITEMS[sel] && ITEMS[sel].tool && p.swingT > 0 && (1 - p.swingT / p.swingLen) < 0.2;
    let flame = null;
    if (behind) flame = drawTool(ctx, sel, p, t);
    if (p.facing < 0) ctx.restore();
    drawCube(ctx, paint, P);
    if (crown) drawCrown(ctx, t);
    if (p.dead) drawDizzy(ctx, t);
    if (!p.dead && sel && !behind) {
      if (p.facing < 0) ctx.scale(-1, 1);
      flame = drawTool(ctx, sel, p, t);
      if (flame && p.facing < 0) flame[0] = -flame[0];
    }
    // bare-hand punch puff
    if (!p.dead && p.swingT > 0 && p.swingKind === "hand") {
      const u = 1 - p.swingT / Math.max(1, p.swingLen), d = Math.sin(u * Math.PI);
      ctx.fillStyle = `rgba(255,236,200,${(0.6 * d).toFixed(3)})`; ctx.beginPath(); ctx.arc(p.facing * (16 + d * 6), 3, 3 + d * 3, 0, TAU); ctx.fill();
    }
    ctx.restore();
    if (flame) {
      const c = Math.cos(rot), s = Math.sin(rot), px = flame[0] * sx, py = (flame[1] - HALF) * sy;
      return [cx + px * c - py * s, cy + HALF + bob + px * s + py * c];
    }
    return null;
  }
  function drawCrown(ctx, t) {
    ctx.save(); ctx.translate(0, -HALF - 1);
    ctx.fillStyle = lg(ctx, -9, -10, 9, 0, [[0, "#fff2a0"], [0.5, "#e8b938"], [1, "#a07818"]]);
    ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-10, -8); ctx.lineTo(-5, -4); ctx.lineTo(0, -11); ctx.lineTo(5, -4); ctx.lineTo(10, -8); ctx.lineTo(9, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#7a5a10"; ctx.lineWidth = 0.8; ctx.stroke();
    ell(ctx, 0, -3, 1.8, 1.8, "#8fe3ff"); ell(ctx, -5.5, -2, 1.3, 1.3, "#ff5a6a"); ell(ctx, 5.5, -2, 1.3, 1.3, "#5aff9a");
    const g = (Math.sin(t * 3) + 1) / 2;
    ctx.fillStyle = `rgba(255,255,255,${(0.5 * g).toFixed(3)})`; ctx.beginPath(); ctx.arc(-0.6, -3.6, 0.7, 0, TAU); ctx.fill();
    ctx.restore();
  }
  return { draw, an, get squash() { return sq; } };
}
export { PW, PH };
