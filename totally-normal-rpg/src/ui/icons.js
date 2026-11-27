// icons.js - procedural canvas icons for items and dialogue portraits. Every image is drawn once and cached as a
// data URL (DOM-only; call from init-time / event code, never at import).
//   itemIcon(id) -> dataURL      portrait(speaker) -> dataURL      SLOT_ICON[slot] -> id used for empty slots

const cache = new Map();

function canvas(n) { const c = document.createElement("canvas"); c.width = c.height = n; return c; }
function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function metal(g, x0, y0, x1, y1, a, b, c) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, a); gr.addColorStop(0.5, b); gr.addColorStop(1, c);
  return gr;
}
// a seeded rng so "random" grime is stable per id
function rng(seed) { let s = 0; for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) | 0; return () => { s = (s * 1103515245 + 12345) | 0; return ((s >>> 8) & 0xffff) / 0xffff; }; }

const SWORD = {
  smelly_sword: { blade: ["#8f9a6a", "#c7cf9e", "#6c7550"], guard: "#5a4a32", fumes: "#9bd35a" },
  cheese_sword: { blade: ["#e0b53a", "#ffe27a", "#c99a28"], guard: "#b07a20", holes: true },
  wooden_sword: { blade: ["#8a5a32", "#b98352", "#6e4526"], guard: "#4e3420", grain: true },
  iron_sword: { blade: ["#8e959c", "#e6ebef", "#7a8188"], guard: "#3f3f46" },
  gold_sword: { blade: ["#c4932a", "#ffe08a", "#a8781c"], guard: "#7a2a2a" },
  bad_smelly_sword: { blade: ["#7a6f5a", "#a89a80", "#5e5444"], guard: "#3a3228", sock: true, fumes: "#9bd35a" },
  bad_cheese_sword: { blade: ["#9aa04a", "#c9c46a", "#707a30"], guard: "#5a5020", holes: true, mold: true },
  bad_wooden_sword: { blade: ["#6e5038", "#8e6c4c", "#54392a"], guard: "#3a2a1e", grain: true, holesSmall: true },
  bad_iron_sword: { blade: ["#7a4a2a", "#a8683a", "#5a3420"], guard: "#3a2a20", rust: true },
  bad_gold_sword: { blade: ["#a89a50", "#d8c878", "#7a6e3a"], guard: "#4a4a4a", flake: true }
};

function drawSword(g, n, d, r) {
  g.save();
  g.translate(n / 2, n / 2); g.rotate(-Math.PI / 4); g.translate(-n / 2, -n / 2);
  const cx = n / 2, top = n * 0.08, bl = n * 0.62, w = n * 0.12;
  // blade
  g.beginPath(); g.moveTo(cx, top); g.lineTo(cx + w / 2, top + w); g.lineTo(cx + w / 2, top + bl); g.lineTo(cx - w / 2, top + bl); g.lineTo(cx - w / 2, top + w); g.closePath();
  g.fillStyle = metal(g, cx - w / 2, 0, cx + w / 2, 0, d.blade[0], d.blade[1], d.blade[2]); g.fill();
  g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = n * 0.02; g.stroke();
  if (d.grain) { g.strokeStyle = "rgba(60,30,10,.5)"; g.lineWidth = 1; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(cx - w / 4 + i * 2, top + w); g.lineTo(cx - w / 4 + i * 2 + (r() - 0.5) * 3, top + bl); g.stroke(); } }
  if (d.holes || d.holesSmall) { g.fillStyle = d.mold ? "rgba(60,90,30,.8)" : "rgba(150,100,20,.75)"; for (let i = 0; i < (d.holesSmall ? 6 : 4); i++) { g.beginPath(); g.arc(cx + (r() - 0.5) * w * 0.6, top + w + r() * (bl - w * 1.2), (d.holesSmall ? 0.9 : 1.6 + r() * 1.6) * n / 64, 0, 7); g.fill(); } }
  if (d.mold) { g.fillStyle = "rgba(120,190,90,.65)"; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(cx + (r() - 0.5) * w, top + w + r() * bl * 0.9, 2 * n / 64, 0, 7); g.fill(); } }
  if (d.rust) { g.fillStyle = "rgba(90,40,10,.7)"; for (let i = 0; i < 8; i++) g.fillRect(cx - w / 2 + r() * w, top + w + r() * bl * 0.9, 2, 2); }
  if (d.flake) { g.fillStyle = "#555"; for (let i = 0; i < 5; i++) g.fillRect(cx - w / 2 + r() * w * 0.8, top + w + r() * bl * 0.9, 3, 2); }
  if (d.sock) { g.fillStyle = "#d8d0c0"; rr(g, cx - w * 0.75, top + bl * 0.15, w * 1.5, bl * 0.4, 3); g.fill(); g.fillStyle = "#b84a3a"; g.fillRect(cx - w * 0.75, top + bl * 0.42, w * 1.5, 3); }
  // guard, grip, pommel
  g.fillStyle = d.guard; rr(g, cx - n * 0.17, top + bl, n * 0.34, n * 0.06, 2); g.fill();
  g.fillStyle = "#3a2a1c"; g.fillRect(cx - n * 0.035, top + bl + n * 0.06, n * 0.07, n * 0.16);
  g.fillStyle = d.guard; g.beginPath(); g.arc(cx, top + bl + n * 0.25, n * 0.05, 0, 7); g.fill();
  g.restore();
  if (d.fumes) { g.strokeStyle = d.fumes; g.globalAlpha = 0.7; g.lineWidth = n * 0.03; for (let i = 0; i < 3; i++) { g.beginPath(); const x = n * (0.62 + i * 0.1), y = n * (0.18 + i * 0.05); g.moveTo(x, y + 8); g.bezierCurveTo(x - 5, y + 3, x + 5, y - 2, x, y - 8); g.stroke(); } g.globalAlpha = 1; }
}

function drawStaff(g, n, bad) {
  g.save(); g.translate(n / 2, n / 2); g.rotate(-Math.PI / 4); g.translate(-n / 2, -n / 2);
  const cx = n / 2;
  if (bad) {
    g.strokeStyle = "#6a4a2a"; g.lineWidth = n * 0.06; g.lineCap = "round";
    g.beginPath(); g.moveTo(cx, n * 0.92); g.lineTo(cx + 2, n * 0.55); g.lineTo(cx - 4, n * 0.38); g.lineTo(cx + 3, n * 0.14); g.stroke();
    g.lineWidth = n * 0.03; g.beginPath(); g.moveTo(cx - 3, n * 0.4); g.lineTo(cx - n * 0.14, n * 0.3); g.stroke();
    g.fillStyle = "#6a8a3a"; g.beginPath(); g.ellipse(cx - n * 0.15, n * 0.27, 4, 2.5, -0.6, 0, 7); g.fill();
  } else {
    g.fillStyle = metal(g, cx - 3, 0, cx + 3, 0, "#2a2238", "#6b5a8a", "#2a2238"); g.fillRect(cx - n * 0.035, n * 0.24, n * 0.07, n * 0.7);
    g.fillStyle = "#c9a640"; g.fillRect(cx - n * 0.06, n * 0.24, n * 0.12, n * 0.05);
    const gr = g.createRadialGradient(cx, n * 0.15, 1, cx, n * 0.15, n * 0.16);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.35, "#a8d8ff"); gr.addColorStop(1, "rgba(80,150,255,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(cx, n * 0.15, n * 0.16, 0, 7); g.fill();
  }
  g.restore();
}

function drawClaws(g, n) {
  g.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const x = n * (0.3 + i * 0.18);
    g.strokeStyle = "#f2efe6"; g.lineWidth = n * 0.07;
    g.beginPath(); g.moveTo(x - n * 0.06, n * 0.82); g.quadraticCurveTo(x + n * 0.06, n * 0.45, x - n * 0.02, n * 0.14); g.stroke();
    g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = n * 0.02;
    g.beginPath(); g.moveTo(x - n * 0.03, n * 0.8); g.quadraticCurveTo(x + n * 0.08, n * 0.45, x, n * 0.16); g.stroke();
  }
}

function drawFist(g, n) {
  g.fillStyle = "#d9a87c"; rr(g, n * 0.22, n * 0.3, n * 0.56, n * 0.44, n * 0.12); g.fill();
  g.strokeStyle = "rgba(80,40,20,.55)"; g.lineWidth = n * 0.025;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(n * (0.22 + i * 0.14), n * 0.31); g.lineTo(n * (0.22 + i * 0.14), n * 0.5); g.stroke(); }
  g.fillStyle = "#c9966a"; rr(g, n * 0.18, n * 0.52, n * 0.3, n * 0.16, n * 0.07); g.fill();
  g.fillStyle = "#6b7d5a"; g.fillRect(n * 0.3, n * 0.74, n * 0.4, n * 0.14);
}

const ARMOR = {
  smelly_armor: ["#6e6a48", "#9a9468", "#545036"], cheese_armor: ["#d8aa32", "#ffe07a", "#b88a20"],
  iron_armor: ["#7d848c", "#d8dee4", "#646a72"], golden_armor: ["#c09028", "#ffe490", "#9a7018"],
  bad_smelly_armor: ["#a08a60", "#c8b088", "#7a6848"], bad_cheese_armor: ["#e6e0c8", "#fffbe8", "#c8c0a0"],
  bad_iron_armor: ["#7a4a2a", "#a86a3a", "#5a3420"], bad_golden_armor: ["#9a9a8a", "#d8d0a0", "#6a6a60"]
};
function drawArmor(g, n, id, r) {
  const c = ARMOR[id] || ARMOR.iron_armor;
  g.beginPath();
  g.moveTo(n * 0.3, n * 0.16); g.lineTo(n * 0.42, n * 0.22); g.lineTo(n * 0.58, n * 0.22); g.lineTo(n * 0.7, n * 0.16);
  g.lineTo(n * 0.9, n * 0.3); g.lineTo(n * 0.8, n * 0.46); g.lineTo(n * 0.74, n * 0.42); g.lineTo(n * 0.72, n * 0.86);
  g.lineTo(n * 0.28, n * 0.86); g.lineTo(n * 0.26, n * 0.42); g.lineTo(n * 0.2, n * 0.46); g.lineTo(n * 0.1, n * 0.3); g.closePath();
  g.fillStyle = metal(g, n * 0.1, 0, n * 0.9, 0, c[2], c[1], c[0]); g.fill();
  g.strokeStyle = "rgba(0,0,0,.5)"; g.lineWidth = n * 0.025; g.stroke();
  g.strokeStyle = "rgba(0,0,0,.25)"; g.beginPath(); g.moveTo(n * 0.5, n * 0.24); g.lineTo(n * 0.5, n * 0.84); g.stroke();
  g.beginPath(); g.moveTo(n * 0.3, n * 0.56); g.lineTo(n * 0.7, n * 0.56); g.stroke();
  if (id === "cheese_armor" || id === "bad_cheese_armor") { g.fillStyle = id === "bad_cheese_armor" ? "rgba(140,150,110,.6)" : "rgba(160,110,20,.7)"; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(n * (0.32 + r() * 0.36), n * (0.3 + r() * 0.5), n * (0.025 + r() * 0.03), 0, 7); g.fill(); } }
  if (id === "bad_smelly_armor") { g.strokeStyle = "rgba(90,70,40,.6)"; g.lineWidth = 1; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(n * 0.3, n * (0.3 + i * 0.1)); g.lineTo(n * 0.7, n * (0.32 + i * 0.1)); g.stroke(); } }
  if (id === "bad_iron_armor") { g.strokeStyle = "#3a2a20"; g.lineWidth = n * 0.04; g.beginPath(); g.arc(n * 0.5, n * 0.18, n * 0.14, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
  if (id === "smelly_armor" || id === "bad_smelly_armor") { g.strokeStyle = "#9bd35a"; g.globalAlpha = 0.6; g.lineWidth = n * 0.025; g.beginPath(); g.moveTo(n * 0.84, n * 0.62); g.bezierCurveTo(n * 0.78, n * 0.55, n * 0.9, n * 0.5, n * 0.84, n * 0.42); g.stroke(); g.globalAlpha = 1; }
}

function drawFace(g, n, o) {
  // background
  const bg = g.createLinearGradient(0, 0, 0, n);
  bg.addColorStop(0, o.bg || "#3a4a3a"); bg.addColorStop(1, o.bg2 || "#1a201a");
  g.fillStyle = bg; g.fillRect(0, 0, n, n);
  const cx = n / 2, cy = n * 0.5;
  const hw = n * (o.wide || 0.22), hh = n * (o.tall || 0.27);
  // shoulders
  g.fillStyle = o.shirt || "#6b7d5a"; g.beginPath(); g.ellipse(cx, n * 1.02, n * 0.42, n * 0.3, 0, 0, 7); g.fill();
  if (o.scarf) { g.fillStyle = o.scarf; g.beginPath(); g.ellipse(cx, n * 0.8, n * 0.2, n * 0.07, 0, 0, 7); g.fill(); }
  // neck + head
  g.fillStyle = o.skin || "#e0b090"; g.fillRect(cx - n * 0.07, cy + hh * 0.6, n * 0.14, n * 0.16);
  g.beginPath(); g.ellipse(cx, cy, hw, hh, 0, 0, 7); g.fill();
  const shade = g.createLinearGradient(cx - hw, 0, cx + hw, 0);
  shade.addColorStop(0, "rgba(0,0,0,.18)"); shade.addColorStop(0.5, "rgba(0,0,0,0)"); shade.addColorStop(1, "rgba(0,0,0,.22)");
  g.fillStyle = shade; g.beginPath(); g.ellipse(cx, cy, hw, hh, 0, 0, 7); g.fill();
  // hair
  if (o.hair) {
    g.fillStyle = o.hair; g.beginPath(); g.ellipse(cx, cy - hh * 0.55, hw * 1.05, hh * 0.55, 0, Math.PI, 0); g.fill();
    if (o.long) { g.fillRect(cx - hw * 1.05, cy - hh * 0.55, hw * 0.3, hh * 1.3); g.fillRect(cx + hw * 0.75, cy - hh * 0.55, hw * 0.3, hh * 1.3); }
    if (o.bun) { g.beginPath(); g.arc(cx, cy - hh * 1.05, hw * 0.4, 0, 7); g.fill(); }
  }
  // eyes
  const ey = cy - hh * 0.08, ex = hw * 0.42;
  g.fillStyle = o.eyes || "#1a1a1a";
  g.beginPath(); g.arc(cx - ex, ey, n * 0.022, 0, 7); g.arc(cx + ex, ey, n * 0.022, 0, 7); g.fill();
  g.strokeStyle = "rgba(60,30,20,.5)"; g.lineWidth = n * 0.018;
  g.beginPath(); g.moveTo(cx - ex - 4, ey - 6 - (o.brow || 0)); g.lineTo(cx - ex + 4, ey - 6); g.moveTo(cx + ex - 4, ey - 6); g.lineTo(cx + ex + 4, ey - 6 - (o.brow || 0)); g.stroke();
  // nose + mouth
  g.strokeStyle = "rgba(90,50,30,.45)"; g.beginPath(); g.moveTo(cx, ey + 3); g.lineTo(cx - 2, ey + hh * 0.38); g.lineTo(cx + 2, ey + hh * 0.4); g.stroke();
  g.strokeStyle = "rgba(90,30,30,.7)"; g.beginPath();
  if (o.nervous) { g.moveTo(cx - 6, cy + hh * 0.55); for (let i = 0; i < 5; i++) g.lineTo(cx - 6 + i * 3, cy + hh * (0.52 + (i % 2) * 0.06)); }
  else g.arc(cx, cy + hh * 0.42, n * 0.06, 0.2 * Math.PI, 0.8 * Math.PI);
  g.stroke();
  if (o.beard) { g.fillStyle = o.beard; g.beginPath(); g.moveTo(cx - hw * 0.95, cy + hh * 0.05); g.quadraticCurveTo(cx, cy + hh * 1.7, cx + hw * 0.95, cy + hh * 0.05); g.quadraticCurveTo(cx, cy + hh * 0.75, cx - hw * 0.95, cy + hh * 0.05); g.fill(); }
  if (o.mustache) { g.fillStyle = o.mustache; g.beginPath(); g.ellipse(cx, cy + hh * 0.3, hw * 0.45, hh * 0.08, 0, 0, 7); g.fill(); }
  // hats
  if (o.hat === "straw") { g.fillStyle = "#d8b860"; g.beginPath(); g.ellipse(cx, cy - hh * 0.65, hw * 1.7, hh * 0.18, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(cx, cy - hh * 0.85, hw * 0.85, hh * 0.35, 0, Math.PI, 0); g.fill(); g.fillStyle = "#8a3a2a"; g.fillRect(cx - hw * 0.85, cy - hh * 0.9, hw * 1.7, 3); }
  if (o.hat === "helmet") { g.fillStyle = metal(g, cx - hw, 0, cx + hw, 0, "#5a5f66", "#c8ced4", "#5a5f66"); g.beginPath(); g.ellipse(cx, cy - hh * 0.35, hw * 1.12, hh * 0.85, 0, Math.PI, 0); g.fill(); g.fillRect(cx - hw * 1.12, cy - hh * 0.4, hw * 2.24, n * 0.04); }
  if (o.hat === "feather") { g.fillStyle = "#2a3a6a"; g.beginPath(); g.ellipse(cx, cy - hh * 0.75, hw * 1.1, hh * 0.3, -0.1, Math.PI, 0); g.fill(); g.strokeStyle = "#e8c66a"; g.lineWidth = 3; g.beginPath(); g.moveTo(cx + hw * 0.5, cy - hh * 0.9); g.quadraticCurveTo(cx + hw * 1.4, cy - hh * 1.5, cx + hw * 1.6, cy - hh * 1.1); g.stroke(); }
  if (o.hat === "cape") { g.fillStyle = "#a8282a"; g.beginPath(); g.ellipse(cx, cy - hh * 0.6, hw * 1.15, hh * 0.6, 0, Math.PI, 0); g.fill(); }
  if (o.hat === "cap") { g.fillStyle = "#4a6a8a"; g.beginPath(); g.ellipse(cx, cy - hh * 0.6, hw * 1.05, hh * 0.5, 0, Math.PI, 0); g.fill(); g.fillRect(cx, cy - hh * 0.65, hw * 1.3, n * 0.035); }
  if (o.redEyes) { g.fillStyle = "#ff2a2a"; g.shadowColor = "#ff0000"; g.shadowBlur = 6; g.beginPath(); g.arc(cx - ex, ey, n * 0.022, 0, 7); g.arc(cx + ex, ey, n * 0.022, 0, 7); g.fill(); g.shadowBlur = 0; }
}

function drawSign(g, n) {
  g.fillStyle = "#2c3a2a"; g.fillRect(0, 0, n, n);
  g.fillStyle = "#5a3e24"; g.fillRect(n * 0.46, n * 0.5, n * 0.08, n * 0.5);
  g.fillStyle = metal(g, 0, n * 0.2, 0, n * 0.55, "#a87a4a", "#8a5e36", "#6e4828"); rr(g, n * 0.1, n * 0.2, n * 0.8, n * 0.36, 4); g.fill();
  g.fillStyle = "#2a1a0e"; g.font = "bold " + Math.round(n * 0.1) + "px Georgia,serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("TOTALLY", n / 2, n * 0.32); g.fillText("NORMAL", n / 2, n * 0.45);
}

function drawHollow(g, n) {
  g.fillStyle = "#000"; g.fillRect(0, 0, n, n);
  g.fillStyle = "#e8e4dc"; g.beginPath(); g.ellipse(n / 2, n * 0.48, n * 0.2, n * 0.28, 0, 0, 7); g.fill();
  g.fillStyle = "#000"; g.beginPath(); g.arc(n * 0.43, n * 0.44, n * 0.012, 0, 7); g.arc(n * 0.57, n * 0.44, n * 0.012, 0, 7); g.fill();
}

const PORTRAITS = {
  bram: { skin: "#d8a888", hair: "#bdb6ad", beard: "#d6d0c6", shirt: "#7a5a3a", brow: 2, tall: 0.28 },
  nessa: { skin: "#c89070", hair: "#5a3a22", long: true, shirt: "#4a6a8a", bg: "#3a4a5a" },
  tobin: { skin: "#f0c0a0", hair: "#c87a3a", shirt: "#8a4a3a", wide: 0.19, tall: 0.22, bg: "#4a5a3a" },
  ilsa: { skin: "#e8b8a0", hair: "#e0e0e0", bun: true, shirt: "#6a4a6a", bg: "#4a3a3a" },
  pell: { skin: "#d8a080", hair: "#3a2a1a", hat: "feather", shirt: "#8a2a4a", mustache: "#3a2a1a", bg: "#4a2a3a" },
  odo: { skin: "#c88a68", hair: null, mustache: "#5a4030", shirt: "#3a5a4a", wide: 0.25, bg: "#4a4030" },
  wren: { skin: "#f0c8a8", hair: "#e8c870", long: true, shirt: "#e8e0c8", scarf: "#a82a2a", bg: "#5a4a2a" },
  fydor: { skin: "#c89878", hair: "#8a8a8a", beard: "#9a9a9a", hat: "helmet", shirt: "#4a4a52", wide: 0.26, tall: 0.29, brow: 3, bg: "#2a2a30" },
  myles: { skin: "#d8a888", hair: "#4a3020", shirt: "#4a4a52", scarf: "#3a6a8a", wide: 0.2, bg: "#2a3040" },
  rookie: { skin: "#f0c8a8", hair: "#e8c060", hat: "cape", shirt: "#a8282a", nervous: true, brow: -2, bg: "#3a2a4a" },
  girl: { skin: "#f0d0c0", hair: "#4a3020", long: true, shirt: "#f4f0f0", wide: 0.19, tall: 0.22, bg: "#c8b088", bg2: "#8a6a48" }
};
// display names (STORY SPEAKERS) -> portrait key
const NAME_KEY = { "old bram": "bram", "bram": "bram", "nessa": "nessa", "tobin": "tobin", "grandma ilsa": "ilsa", "ilsa": "ilsa",
  "pell": "pell", "odo": "odo", "wren": "wren", "fydor": "fydor", "myles": "myles", "rookie": "rookie", "the sign": "sign", "sign": "sign",
  "hollow": "hollow", "the hollow": "hollow", "girl": "girl", "elsie": "girl", "the little girl": "girl", "villager": "villager", "king": "king", "the king": "king" };

export function speakerKey(name) { return NAME_KEY[String(name || "").trim().toLowerCase()] || null; }

export function portrait(speaker, opts) {
  const key = speakerKey(speaker) || "unknown";
  const red = !!(opts && opts.redEyes);
  const ck = "p:" + key + (red ? ":r" : "");
  if (cache.has(ck)) return cache.get(ck);
  const n = 96, c = canvas(n), g = c.getContext("2d");
  if (key === "sign") drawSign(g, n);
  else if (key === "hollow") drawHollow(g, n);
  else if (key === "king") drawFace(g, n, { skin: "#d8b098", hair: "#2a2a2a", beard: "#2a2a2a", shirt: "#4a2a6a", hat: "helmet", redEyes: red, bg: "#1a1028" });
  else if (key === "villager") drawFace(g, n, { skin: "#d8a888", hair: "#6a4a2a", hat: "straw", shirt: "#7a6a4a", redEyes: red });
  else if (PORTRAITS[key]) drawFace(g, n, Object.assign({}, PORTRAITS[key], { redEyes: red }));
  else {
    // unknown speaker: a soft silhouette with the initial
    g.fillStyle = "#2a2a30"; g.fillRect(0, 0, n, n);
    g.fillStyle = "#4a4a54"; g.beginPath(); g.arc(n / 2, n * 0.42, n * 0.18, 0, 7); g.fill(); g.beginPath(); g.ellipse(n / 2, n * 1.0, n * 0.36, n * 0.3, 0, 0, 7); g.fill();
    const ch = String(speaker || "?").trim().charAt(0).toUpperCase() || "?";
    g.fillStyle = "#cfcfcf"; g.font = "300 " + Math.round(n * 0.22) + "px Georgia,serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(ch, n / 2, n * 0.43);
  }
  const url = c.toDataURL();
  cache.set(ck, url);
  return url;
}

export const SLOT_ICON = { sword: "fists", armor: "_armor", morph: "_morph", crown: "_crown", charm: "_charm" };

export function itemIcon(id) {
  id = String(id || "");
  if (cache.has(id)) return cache.get(id);
  const n = 64, c = canvas(n), g = c.getContext("2d");
  const bad = id.indexOf("bad_") === 0, base = bad ? id.slice(4) : id;
  const r = rng(id);
  // soft backdrop glow
  const gl = g.createRadialGradient(n / 2, n / 2, 2, n / 2, n / 2, n * 0.5);
  gl.addColorStop(0, bad ? "rgba(140,170,80,.22)" : "rgba(255,240,200,.16)"); gl.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gl; g.fillRect(0, 0, n, n);
  if (SWORD[id]) drawSword(g, n, SWORD[id], r);
  else if (base === "kings_staff") drawStaff(g, n, bad);
  else if (base === "cat_claws") drawClaws(g, n);
  else if (base === "fists") drawFist(g, n);
  else if (ARMOR[id]) drawArmor(g, n, id, r);
  else if (base === "villager_morph") {
    if (bad) { // scarecrow: sack face
      g.fillStyle = "#c8a868"; g.beginPath(); g.ellipse(n / 2, n * 0.5, n * 0.24, n * 0.27, 0, 0, 7); g.fill();
      g.strokeStyle = "#3a2a1a"; g.lineWidth = 2; g.beginPath(); g.moveTo(n * 0.36, n * 0.62); for (let i = 0; i < 7; i++) g.lineTo(n * (0.36 + i * 0.047), n * (0.62 + (i % 2) * 0.04)); g.stroke();
      g.fillStyle = "#1a1a1a"; g.fillRect(n * 0.37, n * 0.42, 6, 6); g.fillRect(n * 0.55, n * 0.42, 6, 6);
      g.fillStyle = "#b89a50"; g.beginPath(); g.ellipse(n / 2, n * 0.28, n * 0.38, n * 0.07, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(n / 2, n * 0.22, n * 0.18, n * 0.12, 0, Math.PI, 0); g.fill();
    } else drawFace(g, n, { skin: "#d8a888", hair: "#6a4a2a", hat: "straw", shirt: "#7a6a4a", bg: "rgba(0,0,0,0)", bg2: "rgba(0,0,0,0)" });
  } else if (base === "kings_crown") {
    g.beginPath(); g.moveTo(n * 0.16, n * 0.7); g.lineTo(n * 0.16, n * 0.34); g.lineTo(n * 0.33, n * 0.52); g.lineTo(n * 0.5, n * 0.26); g.lineTo(n * 0.67, n * 0.52); g.lineTo(n * 0.84, n * 0.34); g.lineTo(n * 0.84, n * 0.7); g.closePath();
    g.fillStyle = bad ? "#f2eee4" : metal(g, 0, n * 0.3, 0, n * 0.7, "#ffe88a", "#d8a830", "#a87818"); g.fill();
    g.strokeStyle = bad ? "#8a8a8a" : "#7a5a10"; g.lineWidth = 2; g.stroke();
    if (bad) { g.strokeStyle = "rgba(0,0,0,.25)"; g.beginPath(); g.moveTo(n * 0.3, n * 0.45); g.lineTo(n * 0.36, n * 0.68); g.stroke(); }
    else { g.fillStyle = "#c0141c"; g.beginPath(); g.arc(n * 0.5, n * 0.58, 4, 0, 7); g.fill(); g.fillStyle = "#3a6ac0"; g.beginPath(); g.arc(n * 0.3, n * 0.62, 3, 0, 7); g.arc(n * 0.7, n * 0.62, 3, 0, 7); g.fill(); }
  } else if (base === "rookie_badge") {
    g.fillStyle = "#a8282a"; g.beginPath(); g.moveTo(n * 0.38, n * 0.6); g.lineTo(n * 0.3, n * 0.92); g.lineTo(n * 0.42, n * 0.85); g.lineTo(n * 0.5, n * 0.95); g.lineTo(n * 0.5, n * 0.6); g.fill();
    g.beginPath(); g.moveTo(n * 0.62, n * 0.6); g.lineTo(n * 0.7, n * 0.92); g.lineTo(n * 0.58, n * 0.85); g.lineTo(n * 0.5, n * 0.95); g.fill();
    g.fillStyle = metal(g, 0, n * 0.15, 0, n * 0.7, "#ffe88a", "#d8a830", "#a87818"); g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? n * 0.13 : n * 0.28; g.lineTo(n / 2 + Math.cos(a) * rad, n * 0.42 + Math.sin(a) * rad); }
    g.closePath(); g.fill(); g.strokeStyle = "#7a5a10"; g.lineWidth = 1.5; g.stroke();
  } else if (base === "toms_bell") {
    g.fillStyle = metal(g, n * 0.25, 0, n * 0.75, 0, "#a87818", "#ffe88a", "#a87818");
    g.beginPath(); g.arc(n / 2, n * 0.5, n * 0.24, 0, 7); g.fill(); g.strokeStyle = "#6a4a10"; g.lineWidth = 2; g.stroke();
    g.beginPath(); g.moveTo(n * 0.28, n * 0.5); g.lineTo(n * 0.72, n * 0.5); g.stroke();
    g.fillStyle = "#3a2a10"; g.beginPath(); g.arc(n / 2, n * 0.62, 3, 0, 7); g.fill(); g.fillRect(n * 0.49, n * 0.62, 2, n * 0.1);
    g.fillStyle = "#c0141c"; g.fillRect(n * 0.3, n * 0.2, n * 0.4, n * 0.07);
  } else if (base === "girls_ribbon") {
    g.fillStyle = "#c8202a";
    g.beginPath(); g.moveTo(n / 2, n * 0.45); g.quadraticCurveTo(n * 0.15, n * 0.15, n * 0.14, n * 0.5); g.quadraticCurveTo(n * 0.2, n * 0.7, n / 2, n * 0.45); g.fill();
    g.beginPath(); g.moveTo(n / 2, n * 0.45); g.quadraticCurveTo(n * 0.85, n * 0.15, n * 0.86, n * 0.5); g.quadraticCurveTo(n * 0.8, n * 0.7, n / 2, n * 0.45); g.fill();
    g.beginPath(); g.moveTo(n * 0.47, n * 0.48); g.lineTo(n * 0.34, n * 0.88); g.lineTo(n * 0.42, n * 0.86); g.lineTo(n * 0.5, n * 0.52); g.lineTo(n * 0.6, n * 0.88); g.lineTo(n * 0.68, n * 0.86); g.lineTo(n * 0.53, n * 0.48); g.fill();
    g.fillStyle = "#e8424a"; g.beginPath(); g.arc(n / 2, n * 0.46, n * 0.06, 0, 7); g.fill();
  } else if (base === "fydors_locket") {
    g.strokeStyle = "#c8a040"; g.lineWidth = 1.5; g.beginPath(); g.arc(n / 2, n * 0.3, n * 0.2, Math.PI, 0); g.stroke();
    g.fillStyle = metal(g, n * 0.3, 0, n * 0.7, 0, "#a87818", "#ffe08a", "#a87818");
    g.beginPath(); g.moveTo(n / 2, n * 0.82); g.bezierCurveTo(n * 0.1, n * 0.55, n * 0.25, n * 0.25, n / 2, n * 0.42); g.bezierCurveTo(n * 0.75, n * 0.25, n * 0.9, n * 0.55, n / 2, n * 0.82); g.fill();
    g.strokeStyle = "#6a4a10"; g.stroke();
  } else if (base === "mylesletter") {
    g.fillStyle = "#e8dcc0"; rr(g, n * 0.14, n * 0.28, n * 0.72, n * 0.46, 3); g.fill();
    g.strokeStyle = "#8a7a5a"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(n * 0.14, n * 0.3); g.lineTo(n / 2, n * 0.54); g.lineTo(n * 0.86, n * 0.3); g.stroke();
    g.fillStyle = "#a8282a"; g.beginPath(); g.arc(n / 2, n * 0.54, n * 0.06, 0, 7); g.fill();
  } else if (base === "shovel") {
    g.save(); g.translate(n / 2, n / 2); g.rotate(Math.PI / 5); g.translate(-n / 2, -n / 2);
    g.fillStyle = "#7a5432"; g.fillRect(n * 0.47, n * 0.1, n * 0.06, n * 0.5);
    g.fillStyle = "#3a2a1a"; g.fillRect(n * 0.4, n * 0.08, n * 0.2, n * 0.05);
    g.fillStyle = metal(g, n * 0.32, 0, n * 0.68, 0, "#6a7078", "#c8ced4", "#6a7078");
    g.beginPath(); g.moveTo(n * 0.33, n * 0.6); g.lineTo(n * 0.67, n * 0.6); g.lineTo(n * 0.64, n * 0.82); g.quadraticCurveTo(n / 2, n * 0.96, n * 0.36, n * 0.82); g.closePath(); g.fill();
    g.restore();
  } else {
    // empty slot placeholders and unknown ids: a faint outline glyph
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 2; g.setLineDash([4, 4]);
    rr(g, n * 0.22, n * 0.22, n * 0.56, n * 0.56, 8); g.stroke(); g.setLineDash([]);
    const ch = { _armor: "A", _morph: "M", _crown: "C", _charm: "*" }[id] || "?";
    g.fillStyle = "rgba(255,255,255,.4)"; g.font = "600 18px system-ui"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(ch, n / 2, n / 2 + 1);
  }
  if (bad && base !== "villager_morph") {
    // flies / stains for the horrible variants
    g.fillStyle = "rgba(20,20,20,.85)";
    for (let i = 0; i < 3; i++) { const x = n * (0.15 + r() * 0.7), y = n * (0.1 + r() * 0.3); g.fillRect(x, y, 2, 2); g.fillStyle = "rgba(200,220,255,.5)"; g.fillRect(x - 2, y - 1, 2, 1); g.fillRect(x + 2, y - 1, 2, 1); g.fillStyle = "rgba(20,20,20,.85)"; }
  }
  const url = c.toDataURL();
  cache.set(id, url);
  return url;
}

/** a readable name from an id when the COMBAT catalog has none */
export function prettyId(id) {
  return String(id || "").replace(/^bad_/, "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
