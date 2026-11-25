// builder/common.js - shared helpers for BUILD MODE (editor, publish flow, community browser). BUILDER owns.
// Difficulty badges, time formatting, local drafts, gameplay hash, theme thumbnails and level minimaps.
import { packLevel, unpackLevel, levelHash, normalizeLevel } from "../sim/level.js";

// ---------------------------------------------------------------------------------------------------------------
// css: injected once from ./builder.css (relative to this module, so it works under /adventure-cube/)
let cssDone = false;
export function ensureCss() {
  if (cssDone || typeof document === "undefined") return;
  cssDone = true;
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.href = new URL("./builder.css", import.meta.url).href;
  document.head.appendChild(l);
}

export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// m:ss.cc or s.cc
export function fmtMs(ms) {
  if (!(ms > 0)) return "--";
  const s = ms / 1000, m = Math.floor(s / 60), cs = Math.floor((ms % 1000) / 10);
  return (m ? m + ":" + String(Math.floor(s % 60)).padStart(2, "0") : String(Math.floor(s))) + "." + String(cs).padStart(2, "0");
}
export function timeAgo(t) {
  if (!t) return "";
  const d = (Date.now() - t) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return Math.floor(d / 60) + " min ago";
  if (d < 86400) return Math.floor(d / 3600) + " h ago";
  if (d < 86400 * 30) return Math.floor(d / 86400) + " d ago";
  return new Date(t).toLocaleDateString();
}

// ---------------------------------------------------------------------------------------------------------------
// difficulty 1..10 (1 easy, 5 hard, 10 impossible = the AI could not beat it)
export const DIFF = [
  null,
  { label: "Very easy", bg: "#35c15a", fg: "#062b10" },
  { label: "Easy", bg: "#76cc3f", fg: "#13300a" },
  { label: "Moderate", bg: "#b5d334", fg: "#2a3204" },
  { label: "Tricky", bg: "#f0cd2f", fg: "#3a2e00" },
  { label: "Hard", bg: "#f7a12c", fg: "#3a2000" },
  { label: "Harder", bg: "#f26b2a", fg: "#fff" },
  { label: "Very hard", bg: "#e23b31", fg: "#fff" },
  { label: "Expert", bg: "#c21f5f", fg: "#fff" },
  { label: "Insane", bg: "#8e2cb4", fg: "#fff" },
  { label: "Impossible", bg: "#141418", fg: "#ff5a5a" },
];
export const diffInfo = (d) => DIFF[Math.max(1, Math.min(10, Math.round(d) || 1))];
export function badge(d, opts = {}) {
  if (!(d >= 1)) return `<span class="acb-badge unrated" title="Not rated yet">?</span>`;
  const i = diffInfo(d), n = Math.max(1, Math.min(10, Math.round(d)));
  return `<span class="acb-badge d${n}${opts.big ? " big" : ""}" style="--bg:${i.bg};--fg:${i.fg}" title="AI difficulty ${n}/10: ${i.label}">` +
    `<b>${n}</b>${opts.label === false ? "" : `<span>${i.label}</span>`}</span>`;
}
// a small 1..10 scale bar with the marker on d
export function scaleBar(d) {
  let s = `<div class="acb-scale" aria-hidden="true">`;
  for (let i = 1; i <= 10; i++) s += `<i class="${i === Math.round(d) ? "on" : ""}" style="background:${DIFF[i].bg}"></i>`;
  return s + `</div><div class="acb-scale-lbl"><span>1 easy</span><span>5 hard</span><span>10 impossible</span></div>`;
}

// ---------------------------------------------------------------------------------------------------------------
// gameplay hash: everything the sim sees (tiles, start, goal, checkpoints, gameplay entities). Name, author, theme,
// music, signs and decorations do NOT change it, so renaming / re-theming keeps a test clear and an AI rating valid.
export function playHash(level) {
  const L = normalizeLevel(level);
  L.name = ""; L.author = ""; L.theme = "forest"; L.music = "area1";
  L.entities = L.entities.filter((e) => e.t !== "sign" && e.t !== "deco");
  return levelHash(L);
}

// ---------------------------------------------------------------------------------------------------------------
// local drafts: app.storage key "adventurecube.drafts.v1" = { cur: id|null, list: [draft] }
// draft = { id, name, t (last edit ms), data (packLevel string), publishedId, cleared (playHash|null), clearMs,
//           rating: { hash, difficulty, beatable, frames } | null }
export const DRAFTS_KEY = "adventurecube.drafts.v1";
const MAX_DRAFTS = 40;
export function loadDrafts(storage) {
  const d = storage.get(DRAFTS_KEY, null);
  const list = d && Array.isArray(d.list) ? d.list.filter((x) => x && typeof x.id === "string" && typeof x.data === "string") : [];
  return { cur: d && typeof d.cur === "string" ? d.cur : null, list };
}
export function saveDrafts(storage, drafts) {
  drafts.list.sort((a, b) => (b.t || 0) - (a.t || 0));
  if (drafts.list.length > MAX_DRAFTS) drafts.list.length = MAX_DRAFTS;
  storage.set(DRAFTS_KEY, drafts);
}
export const newDraftId = () => "d" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
export function draftLevel(d) { try { return unpackLevel(d.data); } catch (e) { return null; } }
export function packDraft(level) { return packLevel(level); }

// ---------------------------------------------------------------------------------------------------------------
// theme thumbnails: a baked little painted landscape per theme (cached canvases; cards drawImage them)
const THEME_LOOK = {
  forest: { sky: ["#8fc8ee", "#d9eef0"], sun: [0.78, 0.2, "rgba(255,250,220,0.95)", "rgba(255,240,190,0)"], hills: ["#a9c7b3", "#6f9e72", "#3f6e43", "#24452a"], ground: "#4a7d33", soil: "#5a3d24", trees: "round" },
  highlands: { sky: ["#f0a65c", "#fbe0a6"], sun: [0.28, 0.62, "rgba(255,236,170,1)", "rgba(255,170,80,0)"], hills: ["#d9a982", "#9d7766", "#5c4e4e", "#2f2a2e"], ground: "#7a8a3a", soil: "#5b4632", trees: "pine", mist: "rgba(255,226,190,0.55)" },
  storm: { sky: ["#1b1f3a", "#3c4766"], sun: [0.75, 0.18, "rgba(200,210,255,0.55)", "rgba(120,130,200,0)"], hills: ["#3f4766", "#2c3250", "#1d2138", "#111326"], ground: "#5d6a80", soil: "#22232e", trees: "dead", rain: true },
};
export const themeLook = (t) => THEME_LOOK[t] || THEME_LOOK.forest;
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function ridge(c, w, h, base, amp, color, r, rough) {
  c.fillStyle = color; c.beginPath(); c.moveTo(0, h);
  let y = base, v = 0;
  for (let x = 0; x <= w; x += 4) { v += (r() - 0.5) * rough; v *= 0.92; y = base + Math.sin(x * 0.012 + base) * amp * 0.5 + v * amp; c.lineTo(x, y); }
  c.lineTo(w, h); c.closePath(); c.fill();
}
function tree(c, kind, x, y, s, color) {
  c.fillStyle = color;
  if (kind === "pine") {
    for (let k = 0; k < 3; k++) { const yy = y - s * (0.35 + k * 0.42), ww = s * (0.55 - k * 0.13); c.beginPath(); c.moveTo(x - ww, yy + s * 0.32); c.lineTo(x, yy - s * 0.42); c.lineTo(x + ww, yy + s * 0.32); c.fill(); }
    c.fillRect(x - s * 0.05, y - s * 0.3, s * 0.1, s * 0.3);
  } else if (kind === "dead") {
    c.strokeStyle = color; c.lineWidth = Math.max(1, s * 0.08); c.lineCap = "round";
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + s * 0.08, y - s * 1.3);
    c.moveTo(x + s * 0.04, y - s * 0.7); c.lineTo(x + s * 0.4, y - s * 1.0);
    c.moveTo(x + s * 0.06, y - s * 0.95); c.lineTo(x - s * 0.3, y - s * 1.25); c.stroke();
  } else {
    c.fillRect(x - s * 0.06, y - s * 0.55, s * 0.12, s * 0.55);
    for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(x + (k - 1.5) * s * 0.18, y - s * (0.85 + (k % 2) * 0.18), s * 0.34, 0, 7); c.fill(); }
  }
}
const themeCache = new Map();
export function themeCanvas(theme, w = 320, h = 180) {
  const key = theme + w + "x" + h;
  if (themeCache.has(key)) return themeCache.get(key);
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const c = cv.getContext("2d"), L = themeLook(theme), r = rng(theme.length * 7919 + 13);
  let g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, L.sky[0]); g.addColorStop(1, L.sky[1]);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const [sx, sy, s0, s1] = L.sun;
  g = c.createRadialGradient(sx * w, sy * h, 0, sx * w, sy * h, h * 0.75); g.addColorStop(0, s0); g.addColorStop(1, s1);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  if (theme !== "storm") { c.fillStyle = s0; c.beginPath(); c.arc(sx * w, sy * h, h * 0.06, 0, 7); c.fill(); }
  else { c.fillStyle = "rgba(230,235,255,0.85)"; c.beginPath(); c.arc(sx * w, sy * h, h * 0.055, 0, 7); c.fill(); }
  // god rays for the forest
  if (theme === "forest") {
    c.save(); c.globalAlpha = 0.18; c.fillStyle = "#fff8d8";
    for (let i = 0; i < 4; i++) { const x0 = w * (0.45 + i * 0.12); c.beginPath(); c.moveTo(x0, 0); c.lineTo(x0 + 16, 0); c.lineTo(x0 - 50 + i * 6, h); c.lineTo(x0 - 80 + i * 6, h); c.fill(); }
    c.restore();
  }
  const bases = [0.5, 0.6, 0.7, 0.8], amps = [h * 0.16, h * 0.12, h * 0.09, h * 0.06];
  for (let i = 0; i < 4; i++) {
    ridge(c, w, h, h * bases[i], amps[i], L.hills[i], r, theme === "forest" ? 0.6 : 1.4);
    if (L.mist && i < 3) { g = c.createLinearGradient(0, h * (bases[i] - 0.02), 0, h * (bases[i] + 0.12)); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, L.mist); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(0, h * (bases[i] - 0.02), w, h * 0.14); }
    if (i >= 2) for (let x = r() * 20; x < w; x += 10 + r() * 26) tree(c, L.trees, x, h * bases[i] + amps[i] * 0.3 + r() * 4, h * (i === 2 ? 0.12 : 0.2) * (0.7 + r() * 0.5), L.hills[i]);
  }
  c.fillStyle = L.ground; c.fillRect(0, h * 0.88, w, h * 0.03);
  c.fillStyle = L.soil; c.fillRect(0, h * 0.91, w, h * 0.09);
  if (L.rain) { c.strokeStyle = "rgba(180,200,255,0.35)"; c.lineWidth = 1; c.beginPath(); for (let i = 0; i < 90; i++) { const x = r() * w, y = r() * h; c.moveTo(x, y); c.lineTo(x - 4, y + 10); } c.stroke();
    c.strokeStyle = "rgba(230,235,255,0.8)"; c.lineWidth = 1.5; c.beginPath(); let lx = w * 0.3, ly = 0; c.moveTo(lx, ly); while (ly < h * 0.5) { lx += (r() - 0.5) * 16; ly += 8 + r() * 8; c.lineTo(lx, ly); } c.stroke(); }
  themeCache.set(key, cv);
  return cv;
}
// draw the theme picture "cover"-fitted into ctx rect
export function drawTheme(ctx, theme, x, y, w, h) {
  const cv = themeCanvas(theme);
  const s = Math.max(w / cv.width, h / cv.height), sw = w / s, sh = h / s;
  ctx.drawImage(cv, (cv.width - sw) / 2, (cv.height - sh) / 2, sw, sh, x, y, w, h);
}

// ---------------------------------------------------------------------------------------------------------------
// level minimap (tiles as pixels over the theme picture). level = plain/normalized level.
const MINI = {
  forest: { "#": "#4f3622", top: "#5fae3c", R: "#8a8f8c", W: "#8a5a2e", I: "#bfe7ff", "-": "#7a4f2a", B: "rgba(40,30,24,0.45)", "~": "#3d8fd6", sp: "#e9e2cf", slope: "#57a038" },
  highlands: { "#": "#5b4430", top: "#9fae47", R: "#9d8f86", W: "#8a5a2e", I: "#cdeeff", "-": "#7a4f2a", B: "rgba(50,36,30,0.45)", "~": "#4aa2d8", sp: "#f2e7cd", slope: "#a0a84a" },
  storm: { "#": "#2b2c38", top: "#dfe6f2", R: "#5a6276", W: "#5d4632", I: "#a9d8ff", "-": "#5d4632", B: "rgba(10,10,20,0.5)", "~": "#2d5a9a", sp: "#c6d6ee", slope: "#cfd8e6" },
};
export function drawMinimap(ctx, level, x, y, w, h, opts = {}) {
  const L = level, th = L.theme || "forest", P = MINI[th] || MINI.forest;
  drawTheme(ctx, th, x, y, w, h);
  const W = L.w, H = L.h; if (!W || !H || !L.tiles) return;
  const s = Math.min(w / W, h / H), ox = x + (w - W * s) / 2, oy = y + (h - H * s);
  const solid = (ch) => ch === "#" || ch === "R" || ch === "W" || ch === "I";
  for (let ty = 0; ty < H; ty++) {
    const row = L.tiles[ty], up = ty > 0 ? L.tiles[ty - 1] : "";
    let tx = 0;
    while (tx < W) {
      const ch = row[tx];
      if (ch === ".") { tx++; continue; }
      let col;
      if (ch === "#") col = solid(up[tx] || ".") ? P["#"] : P.top;
      else if (ch === "/" || ch === "\\" || (ch >= "a" && ch <= "d")) col = P.slope;
      else if (ch === "^" || ch === "v" || ch === "<" || ch === ">") col = P.sp;
      else col = P[ch] || "#888";
      let n = 1;
      if (ch !== "#") while (tx + n < W && row[tx + n] === ch) n++;
      else while (tx + n < W && row[tx + n] === "#" && solid(up[tx + n] || ".") === solid(up[tx] || ".")) n++;
      ctx.fillStyle = col;
      ctx.fillRect(ox + tx * s, oy + ty * s, n * s + 0.4, s + 0.4);
      tx += n;
    }
  }
  if (opts.markers !== false) {
    const dot = (p, col, r) => { if (!p) return; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ox + (p.x + 0.5) * s, oy + (p.y + 0.5) * s, Math.max(r, s * 0.8), 0, 7); ctx.fill(); };
    for (const e of L.entities || []) {
      if (e.t === "spring") dot(e, "#e0453a", 1.2);
      else if (e.t === "hazard") dot(e, "#c33", 1.2);
      else if (e.t === "mover") { ctx.fillStyle = "#c48a4e"; ctx.fillRect(ox + e.x * s, oy + e.y * s, (e.w || 3) * s, Math.max(1, s * 0.5)); }
      else if (e.t === "crumble") { ctx.fillStyle = "#b0875a"; ctx.fillRect(ox + e.x * s, oy + e.y * s, (e.w || 1) * s, Math.max(1, s)); }
    }
    for (const c of L.checkpoints || []) dot(c, "#3ddc6a", 1.3);
    dot(L.start, "#f39c34", 1.8);
    dot(L.goal, "#ffd23f", 1.8);
  }
}
// a canvas element (CSS size w x h) with the minimap or theme picture, HiDPI aware
export function makeThumbCanvas(w, h, draw) {
  const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  const cv = document.createElement("canvas");
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  cv.style.width = w + "px"; cv.style.height = h + "px"; cv.style.aspectRatio = w + " / " + h;
  const c = cv.getContext("2d"); c.scale(dpr, dpr); draw(c, w, h);
  return cv;
}

// ---------------------------------------------------------------------------------------------------------------
// small DOM helpers
export function el(html, cls) { const d = document.createElement("div"); if (cls) d.className = cls; d.innerHTML = html; return d; }
export function toast(root, msg, kind = "") {
  if (!root) return;
  let box = root.querySelector(".acb-toasts");
  if (!box) { box = document.createElement("div"); box.className = "acb-toasts"; root.appendChild(box); }
  const t = document.createElement("div"); t.className = "acb-toast " + kind; t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.classList.add("out"), 2600);
  setTimeout(() => t.remove(), 3100);
}
export const THEME_NAMES = { forest: "Sunlit Forest", highlands: "Golden Highlands", storm: "Storm Peaks" };
export const REASONS = {
  offline: "The community server is offline right now.", network: "Could not reach the community server.",
  invalid: "The level did not pass validation.", big: "The level is too big to share (over 30 KB packed).",
  rude: "That name or text is not allowed.", taken: "That name is already taken.", noname: "Pick a player name first.",
  notyours: "That level belongs to someone else.", missing: "That level no longer exists.",
  slow: "You just published a level - wait a minute before publishing another.",
  implausible: "That time is faster than the level allows, so it was not posted.",
};
export const reasonText = (r) => REASONS[r && r.reason] || REASONS[r] || "Something went wrong" + (r && r.reason ? " (" + r.reason + ")" : "");
