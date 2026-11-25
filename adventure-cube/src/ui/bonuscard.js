// ui/bonuscard.js - the BONUS level ("Wildwood Homestead") card on the area-select screen + its painted preview.
// INTEGRATE owns. The card is NOT an `.area` (tests and CSS count the three areas); it spans the whole grid row.
// The preview lazily imports the bonus house art (src/bonus/render/house.js) so the main boot never loads it.
import { esc } from "../builder/common.js";

export const BONUS_NAME = "Wildwood Homestead";
export const BONUS_SAVE_KEY = "adventurecube.bonus.v1";   // = src/bonus/core/const.js SAVE_KEY (read-only peek here)
const BONUS_SAVE_VERSION = 1;                              // = src/bonus/core/const.js SAVE_VERSION
const HOUSE_NAMES = ["Empty plot", "Lean-to", "Hide tent", "Camp", "Log hut", "Log cabin", "Cabin with chimney", "Cabin and garden",
  "Stone foundation", "Stone cottage", "Glass-window cottage", "Upper floor frame", "Two-storey house", "Workshop wing", "Watchtower",
  "Manor", "Courtyard walls", "Great hall", "Castle keep", "Castle towers", "Crystal citadel"];

export const bonusUnlocked = (prog) => !!(prog && (prog.done.area3 || prog.unlockAll));
// a short summary of the saved world (or null): { day, house, houseName, at }
export function bonusSummary(app) {
  const s = app.storage.get(BONUS_SAVE_KEY, null);
  if (!s || typeof s !== "object" || !s.seed && s.seed !== 0) return null;
  if ((s.v | 0) > BONUS_SAVE_VERSION) return null; // a newer version's world: the game will not load it, so do not offer Continue
  const lv = Math.max(0, Math.min(20, (s.house && s.house.level) | 0));
  return { day: Math.max(1, (s.time && s.time.day) | 0), house: lv, houseName: HOUSE_NAMES[lv], at: s.at || 0 };
}

export function bonusCardHtml(app, prog) {
  const open = bonusUnlocked(prog), sum = open ? bonusSummary(app) : null;
  const status = !open ? `<span class="lock">&#128274; Clear Area 3 to unlock</span>`
    : sum ? `<span>Day <b>${sum.day}</b></span><span>House <b>${sum.house} / 20</b> ${esc(sum.houseName)}</span>`
      : `<span class="good">Unlocked! A new world is waiting.</span>`;
  const btns = !open ? "" : sum
    ? `<button data-b="continue" class="primary">Continue</button><button data-b="new">New world</button>`
    : `<button data-b="start" class="primary">Start</button>`;
  return `<div class="bonus-card ${open ? "" : "locked"}" data-bonus="1" role="button" tabindex="0" ${open ? "" : `aria-disabled="true"`}>
    <span class="bonus-pic"><canvas width="640" height="300" aria-hidden="true"></canvas></span>
    <span class="bonus-body"><span class="area-num">Bonus level${prog.done.area3 ? ` <em class="ok">Unlocked</em>` : ""}</span>
      <b class="area-title">${BONUS_NAME}</b>
      <span class="bonus-tag">Chop trees, mine stone and ore, craft tools from wood to steel, hunt for food and survive the night.
        Build a house and level it up 20 times, from a lean-to to a crystal citadel.</span>
      <span class="area-times">${status}</span>
      <span class="bonus-btns">${btns}</span></span></div>`;
}

// paint the preview: a golden-hour homestead (sky, hills, pines, the house, a campfire and the cube)
export async function paintBonusPreview(cv, level) {
  const g = cv.getContext("2d"), W = cv.width, H = cv.height, gy = Math.round(H * 0.8);
  let n = 1;
  const rnd = () => { n = (n * 16807) % 2147483647; return n / 2147483647; };
  const sky = g.createLinearGradient(0, 0, 0, gy);
  sky.addColorStop(0, "#2b4f7e"); sky.addColorStop(0.45, "#c98a6a"); sky.addColorStop(0.8, "#f7c27a"); sky.addColorStop(1, "#ffe3a3");
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const sun = g.createRadialGradient(W * 0.78, gy - 40, 4, W * 0.78, gy - 40, 140);
  sun.addColorStop(0, "rgba(255,246,210,1)"); sun.addColorStop(0.12, "rgba(255,230,160,0.9)"); sun.addColorStop(1, "rgba(255,200,120,0)");
  g.fillStyle = sun; g.fillRect(0, 0, W, H);
  // cloud wisps
  g.fillStyle = "rgba(255,236,215,0.35)";
  for (let i = 0; i < 6; i++) { const x = rnd() * W, y = 30 + rnd() * 80; g.beginPath(); g.ellipse(x, y, 60 + rnd() * 50, 6 + rnd() * 5, 0, 0, Math.PI * 2); g.fill(); }
  // hill layers (far -> near)
  const hills = [["#8a7a8c", 0.52, 26, 0.011], ["#5f6f63", 0.62, 22, 0.017], ["#3e5a3a", 0.71, 16, 0.024]];
  for (const [col, base, amp, fr] of hills) {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, H * base - Math.sin(x * fr + base * 9) * amp - Math.sin(x * fr * 2.3 + 1) * amp * 0.4);
    g.lineTo(W, H); g.fill();
  }
  // pine tree line
  const pine = (x, y, h, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + h * 0.28, y); g.lineTo(x - h * 0.28, y); g.fill(); g.fillRect(x - 2, y - 2, 4, 6); };
  for (let x = -10; x < W + 20; x += 14 + rnd() * 12) pine(x, H * 0.74 + rnd() * 6, 34 + rnd() * 30, "#2c4630");
  // meadow ground
  const gr = g.createLinearGradient(0, gy - 10, 0, H);
  gr.addColorStop(0, "#7aa64a"); gr.addColorStop(0.25, "#5c8a36"); gr.addColorStop(0.3, "#6b4a2e"); gr.addColorStop(1, "#3d2a1a");
  g.fillStyle = gr; g.fillRect(0, gy - 4, W, H - gy + 4);
  g.strokeStyle = "rgba(160,200,90,0.8)"; g.lineWidth = 1.5;
  for (let x = 0; x < W; x += 3) { const h = 3 + rnd() * 6; g.beginPath(); g.moveTo(x, gy - 2); g.lineTo(x + rnd() * 3 - 1.5, gy - 2 - h); g.stroke(); }
  // the house (real bonus art), lazily
  try {
    const mod = await import("../bonus/render/house.js");
    const e = mod.createHouse().get(level), b = e.bbox;
    const k = Math.min((H * 0.62) / b.h, (W * 0.5) / b.w), dw = b.w * k, dh = b.h * k;
    g.drawImage(e.c, b.x, b.y, b.w, b.h, W * 0.36 - dw / 2, gy + 2 - dh, dw, dh);
  } catch (err) { /* the preview still shows the scene */ }
  // oak on the left
  g.fillStyle = "#5a3c22"; g.fillRect(W * 0.06, gy - 70, 10, 72);
  for (const [dx, dy, r, c] of [[0, -92, 40, "#3f6b2c"], [-22, -76, 28, "#4c7f33"], [24, -78, 30, "#4a7a31"], [4, -110, 26, "#5b8f3b"]]) { g.fillStyle = c; g.beginPath(); g.arc(W * 0.06 + 5 + dx, gy + dy, r, 0, Math.PI * 2); g.fill(); }
  // campfire with glow
  const fx = W * 0.66, glow = g.createRadialGradient(fx, gy - 6, 2, fx, gy - 6, 60);
  glow.addColorStop(0, "rgba(255,190,90,0.75)"); glow.addColorStop(1, "rgba(255,150,60,0)");
  g.fillStyle = glow; g.fillRect(fx - 60, gy - 66, 120, 120);
  g.fillStyle = "#6b4527"; g.fillRect(fx - 12, gy - 4, 24, 4);
  g.fillStyle = "#ff9b2e"; g.beginPath(); g.moveTo(fx - 8, gy - 3); g.quadraticCurveTo(fx, gy - 26, fx + 8, gy - 3); g.fill();
  g.fillStyle = "#ffe08a"; g.beginPath(); g.moveTo(fx - 4, gy - 3); g.quadraticCurveTo(fx, gy - 15, fx + 4, gy - 3); g.fill();
  // the cube with an axe
  const cx = W * 0.76, cs = 30, cy = gy - cs;
  g.fillStyle = "rgba(0,0,0,0.25)"; g.beginPath(); g.ellipse(cx + cs / 2, gy, cs * 0.6, 4, 0, 0, Math.PI * 2); g.fill();
  const cg = g.createLinearGradient(cx, cy, cx + cs, cy + cs); cg.addColorStop(0, "#f6a456"); cg.addColorStop(1, "#c4621f");
  g.fillStyle = cg; g.beginPath(); g.roundRect ? g.roundRect(cx, cy, cs, cs, 6) : g.rect(cx, cy, cs, cs); g.fill();
  g.fillStyle = "#2a1600"; g.fillRect(cx + 8, cy + 9, 4, 7); g.fillRect(cx + 18, cy + 9, 4, 7);
  g.strokeStyle = "#2a1600"; g.lineWidth = 2; g.beginPath(); g.arc(cx + 15, cy + 18, 5, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  g.strokeStyle = "#7a5532"; g.lineWidth = 3; g.beginPath(); g.moveTo(cx + cs + 2, cy + 22); g.lineTo(cx + cs + 14, cy + 2); g.stroke();
  g.fillStyle = "#b9c0c8"; g.beginPath(); g.moveTo(cx + cs + 10, cy + 2); g.lineTo(cx + cs + 22, cy - 2); g.lineTo(cx + cs + 18, cy + 10); g.fill();
  // a rabbit in the grass
  g.fillStyle = "#9a7a5c"; g.beginPath(); g.ellipse(W * 0.9, gy - 6, 9, 6, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(W * 0.9 + 7, gy - 11, 4, 4, 0, 0, Math.PI * 2); g.fill();
  g.fillRect(W * 0.9 + 6, gy - 22, 2, 9); g.fillRect(W * 0.9 + 9, gy - 21, 2, 8);
  // warm grade + vignette
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(20,10,0,0.35)");
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}
