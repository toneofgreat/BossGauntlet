// jumpscare.js - procedural canvas jumpscare faces (CONTRACT 12 ui.jumpscare). Sound is the caller's job
// (audio.sfx("jumpscare")). Reduce flashing ON: no strobe frames, no shake, a quick soft push-in instead.
// Reduce flashing OFF: a single 2-frame inverted strobe at the hit (never more than one flash per scare, so < 3 Hz).
// Faces are painted once per kind: shaded shapes, then a per-pixel pass adds skin mottling/pores, subsurface tint,
// lens chromatic offset and grain; each frame adds moving film grain on top of the harsh vignette.
import { el, reduceFlashing } from "./dom.js";

const N = 512;

// tiny lattice value noise (pure, deterministic)
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s) { return vnoise(x, y, s) * 0.5 + vnoise(x * 2.1, y * 2.1, s + 1) * 0.27 + vnoise(x * 4.3, y * 4.3, s + 2) * 0.15 + vnoise(x * 9, y * 9, s + 3) * 0.08; }

// soft elliptical shadow (cavity), drawn with a scaled radial gradient
function cavity(g, x, y, rx, ry, a, alpha, rot) {
  g.save(); g.translate(x, y); g.rotate(rot || 0); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(${a},${alpha})`); gr.addColorStop(0.55, `rgba(${a},${alpha * 0.55})`); gr.addColorStop(1, `rgba(${a},0)`);
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, 7); g.fill(); g.restore();
}

function mask(g, cx, cy, rx, ry, crack) {
  // harsh key light from top-left, fall-off to a cold shadow side
  const gr = g.createRadialGradient(cx - rx * 0.35, cy - ry * 0.4, rx * 0.05, cx, cy, Math.max(rx, ry) * 1.05);
  gr.addColorStop(0, "#efe6d8"); gr.addColorStop(0.45, "#cbbfae"); gr.addColorStop(0.8, "#7d7468"); gr.addColorStop(1, "#2a2622");
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.save(); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.clip();
  // shadow side + cheek hollows + temples + under-lip
  cavity(g, cx + rx * 0.75, cy + ry * 0.1, rx * 0.8, ry * 1.0, "10,8,8", 0.55);
  for (const s of [-1, 1]) {
    cavity(g, cx + s * rx * 0.52, cy + ry * 0.3, rx * 0.3, ry * 0.22, "30,18,16", 0.45, s * 0.4);
    cavity(g, cx + s * rx * 0.85, cy - ry * 0.35, rx * 0.28, ry * 0.3, "20,14,12", 0.4);
  }
  cavity(g, cx, cy + ry * 0.55, rx * 0.35, ry * 0.12, "40,20,18", 0.35);
  // faint veins
  g.strokeStyle = "rgba(70,40,60,.22)"; g.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) {
    let x = cx + (hash(i, 1, 9) - 0.5) * rx * 1.6, y = cy + (hash(i, 2, 9) - 0.5) * ry * 1.6;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (hash(i, k, 10) - 0.5) * 26; y += (hash(i, k, 11) - 0.5) * 26; g.lineTo(x, y); }
    g.stroke();
  }
  g.restore();
  if (crack) {
    g.lineCap = "round";
    for (const [w, col] of [[6, "rgba(0,0,0,.55)"], [2.5, "rgba(15,5,5,.95)"]]) {
      g.strokeStyle = col; g.lineWidth = w; g.beginPath();
      let x = cx + rx * 0.1, y = cy - ry;
      g.moveTo(x, y);
      for (let i = 0; i < 9; i++) { x += (hash(i, 3, 12) - 0.45) * rx * 0.25; y += ry * 0.15; g.lineTo(x, y); }
      g.stroke();
    }
  }
}
// deep sunken eye sockets with a tiny wet glint (glow: a red ember deep inside)
function pinholes(g, cx, cy, sep, r, glow) {
  for (const s of [-1, 1]) {
    const x = cx + s * sep;
    cavity(g, x, cy, r * 9, r * 7, "0,0,0", 0.85, s * 0.15);
    cavity(g, x, cy + r * 0.5, r * 5, r * 4, "0,0,0", 1);
    g.fillStyle = "#000"; g.beginPath(); g.ellipse(x, cy, r * 2.6, r * 2.1, 0, 0, 7); g.fill();
    if (glow) { const gl = g.createRadialGradient(x, cy, 0, x, cy, r * 3); gl.addColorStop(0, "rgba(255,40,30,.95)"); gl.addColorStop(0.3, "rgba(160,10,10,.6)"); gl.addColorStop(1, "rgba(60,0,0,0)"); g.fillStyle = gl; g.beginPath(); g.arc(x, cy, r * 3, 0, 7); g.fill(); }
    // wet specular: one hard point + a smeared secondary
    g.fillStyle = "rgba(255,255,255,.92)"; g.beginPath(); g.arc(x - r * 0.9, cy - r * 0.8, Math.max(1.4, r * 0.35), 0, 7); g.fill();
    g.fillStyle = "rgba(255,255,255,.28)"; g.beginPath(); g.ellipse(x + r * 0.8, cy + r * 0.9, r * 0.9, r * 0.3, 0.4, 0, 7); g.fill();
    // lower lid wet rim
    g.strokeStyle = "rgba(190,120,110,.35)"; g.lineWidth = 1.5; g.beginPath(); g.ellipse(x, cy + r * 0.4, r * 2.8, r * 2.2, 0, 0.3, Math.PI - 0.3); g.stroke();
  }
}
function ink(g, n, seed) {
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 26; i++) {
    const x = r() * n, w = 6 + r() * 22, h = 40 + r() * 180;
    const gr = g.createLinearGradient(0, 0, 0, h + 10); gr.addColorStop(0, "#050505"); gr.addColorStop(0.85, "#0b0606"); gr.addColorStop(1, "rgba(40,10,10,.9)");
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w, 0); g.quadraticCurveTo(x + w * 0.7, h, x + w / 2, h + 10); g.quadraticCurveTo(x + w * 0.3, h, x, 0); g.fill();
    g.fillStyle = "rgba(255,255,255,.18)"; g.beginPath(); g.arc(x + w * 0.42, h + 4, 1.6, 0, 7); g.fill();
  }
}
function mouth(g, x0, y0, x1, y1, depth) {
  const gr = g.createLinearGradient(0, y0, 0, y0 + depth);
  gr.addColorStop(0, "#000"); gr.addColorStop(1, "#1c0606");
  g.fillStyle = gr; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, y0 + depth, x1, y1); g.quadraticCurveTo((x0 + x1) / 2, y0 + depth * 0.35, x0, y0); g.fill();
  g.strokeStyle = "rgba(255,230,220,.18)"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x0 + 6, y0 + 2); g.quadraticCurveTo((x0 + x1) / 2, y0 + depth * 0.38, x1 - 6, y1 + 2); g.stroke();
}

// per-pixel finishing pass (once per kind): skin mottling + pores on lit pixels, warm subsurface in mid-tones,
// chromatic offset growing toward the edges, static grain
function finish(g, seed) {
  const img = g.getImageData(0, 0, N, N), d = img.data, src = new Uint8ClampedArray(d);
  const c = N / 2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    const dx = (x - c) / c, dy = (y - c) / c, rr = dx * dx + dy * dy;
    const off = Math.round(rr * 5);
    const xr = Math.min(N - 1, Math.max(0, x + (dx > 0 ? off : -off))), xb = Math.min(N - 1, Math.max(0, x - (dx > 0 ? off : -off)));
    let r = src[(y * N + xr) * 4], gg = src[i + 1], b = src[(y * N + xb) * 4 + 2];
    const lum = (r + gg + b) / 765;
    if (lum > 0.12) {
      const m = fbm(x / 38, y / 38, seed), pore = vnoise(x / 2.2, y / 2.2, seed + 7);
      const k = 0.78 + m * 0.36 - (pore > 0.82 ? 0.12 : 0);
      const sss = Math.max(0, 1 - Math.abs(lum - 0.45) * 2.4) * 0.22;
      r = r * k * (1 + sss * 0.6); gg = gg * k * (1 - sss * 0.15); b = b * k * (1 - sss * 0.25 + (1 - m) * 0.06);
    }
    const gn = (hash(x, y, seed + 31) - 0.5) * 22;
    d[i] = r + gn; d[i + 1] = gg + gn; d[i + 2] = b + gn; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

function drawKind(kind) {
  const c = document.createElement("canvas"); c.width = c.height = N;
  const g = c.getContext("2d", { willReadFrequently: true });
  const cx = N / 2, cy = N / 2;
  // dim out-of-focus backdrop instead of flat black
  g.fillStyle = "#000"; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 5; i++) cavity(g, hash(i, 1, 40) * N, hash(i, 2, 40) * N, 90 + hash(i, 3, 40) * 120, 120, kind === "girl" ? "38,30,34" : "26,24,30", 0.5);
  if (kind === "girl") {
    // pale child's face that has become the mask: matted dark hair, red ribbon, sunken eyes, a too-wide smile
    g.fillStyle = "#120c08"; g.beginPath(); g.ellipse(cx, cy - 20, 230, 260, 0, 0, 7); g.fill();
    mask(g, cx, cy + 10, 160, 205, false);
    g.lineCap = "round";
    for (let i = 0; i < 70; i++) {
      const x = cx - 175 + hash(i, 0, 50) * 350, len = 60 + hash(i, 1, 50) * 140;
      g.strokeStyle = hash(i, 2, 50) > 0.7 ? "rgba(60,40,26,.9)" : "rgba(14,9,6,.95)"; g.lineWidth = 3 + hash(i, 3, 50) * 9;
      g.beginPath(); g.moveTo(x, cy - 230);
      g.bezierCurveTo(x + (hash(i, 4, 50) - 0.5) * 40, cy - 160, x + (hash(i, 5, 50) - 0.5) * 60, cy - 120, x + (hash(i, 6, 50) - 0.5) * 50, cy - 230 + len * (Math.abs(x - cx) > 110 ? 2.2 : 1));
      g.stroke();
    }
    const rb = g.createLinearGradient(cx + 100, cy - 210, cx + 220, cy - 140); rb.addColorStop(0, "#7a0d14"); rb.addColorStop(0.5, "#c8202a"); rb.addColorStop(1, "#5a080e");
    g.fillStyle = rb; g.beginPath(); g.ellipse(cx + 130, cy - 190, 44, 22, 0.5, 0, 7); g.ellipse(cx + 190, cy - 160, 40, 20, 0.9, 0, 7); g.fill();
    pinholes(g, cx, cy - 10, 58, 5, true);
    mouth(g, cx - 95, cy + 100, cx + 95, cy + 100, 95);
  } else if (kind === "giant") {
    // the end of the world: a mask bigger than the screen, cracked, glowing red cores
    mask(g, cx, cy + 40, 300, 340, true);
    pinholes(g, cx, cy - 10, 110, 9, true);
    for (const [x, y] of [[cx - 200, cy + 210], [cx + 210, cy + 190]]) {
      const gl = g.createRadialGradient(x, y, 0, x, y, 60); gl.addColorStop(0, "rgba(255,60,40,.95)"); gl.addColorStop(0.4, "rgba(192,20,28,.7)"); gl.addColorStop(1, "rgba(80,0,0,0)");
      g.fillStyle = gl; g.beginPath(); g.arc(x, y, 60, 0, 7); g.fill();
    }
    mouth(g, cx - 125, cy + 160, cx + 125, cy + 160, 70);
    ink(g, N, 7);
  } else if (kind === "hollow") {
    mask(g, cx, cy + 10, 190, 240, true);
    pinholes(g, cx, cy - 30, 70, 6, true);
    cavity(g, cx, cy + 160, 70, 80, "0,0,0", 0.9);
    g.fillStyle = "#000"; g.beginPath(); g.moveTo(cx - 60, cy + 110); g.lineTo(cx + 60, cy + 110); g.lineTo(cx + 12, cy + 220); g.lineTo(cx - 12, cy + 220); g.closePath(); g.fill();
    ink(g, N, 3);
  } else {
    // creature (first form): tall inky silhouette, shallow face-mask, sunken eyes, too-long fingers at the edges
    const bd = g.createRadialGradient(cx - 60, cy - 80, 20, cx, cy + 30, 320); bd.addColorStop(0, "#1a1716"); bd.addColorStop(1, "#040404");
    g.fillStyle = bd; g.beginPath(); g.ellipse(cx, cy + 30, 210, 300, 0, 0, 7); g.fill();
    mask(g, cx, cy - 10, 135, 175, false);
    pinholes(g, cx, cy - 30, 48, 4, false);
    mouth(g, cx - 40, cy + 95, cx + 40, cy + 95, 22);
    g.lineCap = "round";
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      for (const [w, col] of [[14 - i * 2, "#050505"], [3, "rgba(200,190,180,.12)"]]) {
        g.strokeStyle = col; g.lineWidth = w;
        g.beginPath(); g.moveTo(cx + s * 260, N); g.quadraticCurveTo(cx + s * (300 - i * 10), cy + 40 - i * 50, cx + s * (210 - i * 22), cy - 120 - i * 40); g.stroke();
      }
    }
  }
  finish(g, kind.length * 13 + 5);
  // vignette
  const v = g.createRadialGradient(cx, cy, N * 0.22, cx, cy, N * 0.72);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(0.7, "rgba(0,0,0,.6)"); v.addColorStop(1, "rgba(0,0,0,.95)");
  g.fillStyle = v; g.fillRect(0, 0, N, N);
  return c;
}

// moving film grain tile (made once)
let grainTile = null;
function grain() {
  if (grainTile) return grainTile;
  const c = document.createElement("canvas"); c.width = c.height = 192;
  const g = c.getContext("2d"), img = g.createImageData(192, 192), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = hash(i, 5, 77) * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 46; }
  g.putImageData(img, 0, 0);
  return (grainTile = c);
}

export function createJumpscare(ctx, root) {
  const node = el("div.tn-jump", { attrs: { "aria-hidden": "true" } });
  const cv = el("canvas");
  node.appendChild(cv); root.appendChild(node);
  const g = cv.getContext("2d");
  const faces = {};
  let active = null;

  function face(kind) {
    const k = faces[kind] ? kind : (kind === "girl" || kind === "hollow" || kind === "giant" ? kind : "creature");
    if (!faces[k]) faces[k] = drawKind(k);
    return faces[k];
  }

  // pre-bake the faces in idle time (the pixel pass costs tens of ms; never pay it at the moment of the scare)
  const kinds = ["creature", "girl", "hollow", "giant"];
  const idle = (fn) => (typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 600));
  const bake = () => { const k = kinds.shift(); if (!k) return; try { face(k); } catch (e) { console.warn("[ui]", e); } idle(bake); };
  setTimeout(() => idle(bake), 6000);

  function play(kind, opts) {
    const dur = Math.max(0.3, (opts && opts.dur) || 0.9);
    const img = face(kind);
    const reduce = reduceFlashing(ctx);
    if (active) active.done();
    return new Promise((resolve) => {
      const W = window.innerWidth, H = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      node.style.display = "block";
      const t0 = performance.now();
      let frame = 0, raf = 0, over = false;
      const job = {
        done() { if (over) return; over = true; cancelAnimationFrame(raf); node.style.display = "none"; active = null; resolve(); }
      };
      active = job;
      const base = Math.max(H / N * 1.15, W / N * 0.72);
      function draw(now) {
        if (over) return;
        const t = (now - t0) / 1000, k = t / dur;
        if (k >= 1) { job.done(); return; }
        frame++;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        let scale, alpha, sx = 0, sy = 0;
        if (reduce) {
          scale = base * (0.9 + 0.18 * Math.min(1, k / 0.35));
          alpha = Math.min(1, t / 0.12) * (k > 0.75 ? (1 - k) / 0.25 : 1);
        } else {
          scale = base * (1.0 + 0.22 * Math.min(1, k / 0.12));
          alpha = k > 0.8 ? (1 - k) / 0.2 : 1;
          const sh = (1 - k) * 22;
          sx = (Math.random() - 0.5) * sh; sy = (Math.random() - 0.5) * sh;
        }
        g.globalAlpha = 1; g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
        g.globalAlpha = alpha;
        const s = N * scale;
        g.drawImage(img, W / 2 - s / 2 + sx, H / 2 - s / 2 + sy, s, s);
        // moving film grain over everything (offset changes every frame; no allocation)
        g.globalAlpha = alpha * 0.9;
        const gt = grain(), ox = (frame * 73) % 192, oy = (frame * 41) % 192;
        for (let yy = -oy; yy < H; yy += 192) for (let xx = -ox; xx < W; xx += 192) g.drawImage(gt, xx, yy);
        // the single strobe: frames 2-3 inverted (OFF only)
        if (!reduce && (frame === 2 || frame === 3)) {
          g.globalAlpha = 1; g.globalCompositeOperation = "difference"; g.fillStyle = "#fff"; g.fillRect(0, 0, W, H); g.globalCompositeOperation = "source-over";
        }
        g.globalAlpha = 1;
        raf = requestAnimationFrame(draw);
      }
      raf = requestAnimationFrame(draw);
      setTimeout(() => job.done(), dur * 1000 + 400);   // safety if rAF is throttled
    });
  }

  return { play, get active() { return !!active; } };
}
