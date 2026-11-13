// src/platform/ui/game-thumb.js — the procedural thumbnail on every front-page game card
// (spec 06 §5.7, the front page). ARCHITECTURE §2: no image assets, so a thumbnail is a
// small 2D canvas painted from the game's key — the same key always paints the same
// picture, so a card is recognisable from one visit to the next.
//
// The scene is a little isometric-ish "place": a sky gradient in the game's colour, a
// ground band, a few seeded cubes standing on it, and the game's icon big in front.

// FNV-1a over the key — a stable 32-bit seed. Not security, just "same key, same art".
function hashKey(key) {
  let h = 0x811c9dc5;
  const s = String(key || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// mulberry32 — a tiny seeded generator so the cube layout is deterministic per key.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

const hsl = (h, s, l) => `hsl(${Math.round(((h % 360) + 360) % 360)},${Math.round(s)}%,${Math.round(l)}%)`;

// gameThumb({ key, icon, color, width, height }) -> HTMLCanvasElement
// `color` is optional (#rrggbb); without it the hue comes from the key.
export function gameThumb(opts = {}) {
  const width = opts.width || 128;
  const height = opts.height || 96;
  const canvas = document.createElement("canvas");
  const dpr = Math.min(2, (typeof devicePixelRatio === "number" && devicePixelRatio) || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  canvas.setAttribute("aria-hidden", "true");
  const g = canvas.getContext("2d");
  if (!g) return canvas;
  g.scale(dpr, dpr);

  const seed = hashKey(opts.key);
  const rand = seeded(seed);
  const base = hexToHsl(opts.color);
  const hue = base ? base.h : seed % 360;

  // sky
  const sky = g.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, hsl(hue + 20, 70, 62));
  sky.addColorStop(1, hsl(hue - 10, 65, 34));
  g.fillStyle = sky;
  g.fillRect(0, 0, width, height);

  // a soft sun / glow
  const sx = width * (0.2 + rand() * 0.6);
  const glow = g.createRadialGradient(sx, height * 0.18, 2, sx, height * 0.18, width * 0.45);
  glow.addColorStop(0, "rgba(255,255,255,0.55)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, width, height);

  // ground band
  const groundY = height * 0.68;
  g.fillStyle = hsl(hue + 140, 38, 30);
  g.fillRect(0, groundY, width, height - groundY);
  g.fillStyle = "rgba(255,255,255,0.08)";
  for (let x = -height; x < width; x += 12) {
    g.beginPath();
    g.moveTo(x, height);
    g.lineTo(x + (height - groundY), groundY);
    g.lineTo(x + (height - groundY) + 4, groundY);
    g.lineTo(x + 4, height);
    g.closePath();
    g.fill();
  }

  // seeded cubes: a front face plus a lighter top and darker side, standing on the ground
  const cubes = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < cubes; i++) {
    const s = 8 + rand() * 18;
    const x = rand() * (width - s);
    const lift = rand() < 0.3 ? rand() * 20 : 0;
    const y = groundY - s - lift + rand() * 6;
    const ch = hue + (rand() < 0.5 ? 180 : 40) + rand() * 40;
    const depth = s * 0.35;
    g.fillStyle = hsl(ch, 70, 58);
    g.fillRect(x, y, s, s);
    g.fillStyle = hsl(ch, 70, 72);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + depth, y - depth);
    g.lineTo(x + s + depth, y - depth);
    g.lineTo(x + s, y);
    g.closePath();
    g.fill();
    g.fillStyle = hsl(ch, 70, 40);
    g.beginPath();
    g.moveTo(x + s, y);
    g.lineTo(x + s + depth, y - depth);
    g.lineTo(x + s + depth, y + s - depth);
    g.lineTo(x + s, y + s);
    g.closePath();
    g.fill();
  }

  // the icon, big, with a shadow so it reads on any palette
  if (opts.icon) {
    const size = Math.round(Math.min(width, height) * 0.46);
    g.font = `${size}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",system-ui,sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = "rgba(0,0,0,0.45)";
    g.shadowBlur = 8;
    g.shadowOffsetY = 2;
    g.fillText(String(opts.icon), width / 2, height * 0.5);
    g.shadowColor = "transparent";
  }

  // vignette
  const vig = g.createLinearGradient(0, height * 0.6, 0, height);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.35)");
  g.fillStyle = vig;
  g.fillRect(0, 0, width, height);
  return canvas;
}
