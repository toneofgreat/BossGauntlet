// backdrop.js - everything behind (and the thin foliage in front of) the play layer, in SCREEN space.
// Layers are painted once per theme and screen scale into horizontally tiling canvases ("U" units: the screen is
// 720 U tall), far layers at reduced resolution (distance = softness for free). Per frame each layer is 1-2
// drawImage calls with parallax offsets; rays/fog only animate transforms and alpha.
import { makeCanvas, rng, hash, fbm1, css, shade, mix, mixRGB, rgb, softDot, supportsFilter, clamp } from "./util.js";
import { paintFoliage, paintCloud } from "./art.js";

const LW = 2048;     // layer width in U (tiles horizontally)
const REF_H = 720;   // U per screen height

function layerCanvas(wU, hU, res) {
  const c = makeCanvas(wU * res, hU * res), g = c.getContext("2d");
  g.scale(res, res);
  return { c, g, wU, hU, res };
}

// draw f at x and x +- LW so features wrap seamlessly
function wrap(f, x, pad) { f(x); if (x < pad) f(x + LW); if (x > LW - pad) f(x - LW); }

function canopy(g, x, y, h, cols, L, r) {
  g.fillStyle = cols[0]; g.fillRect(x - h * 0.03, y - h * 0.5, h * 0.06, h * 0.5);
  const n = 6 + Math.floor(r() * 4), w = h * 0.42;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const bx = x + Math.cos(a) * d * w, by = y - h * 0.68 + Math.sin(a) * d * w * 0.6, br = h * (0.16 + r() * 0.14);
    const gr = g.createRadialGradient(bx + L.x * br * 0.5, by + L.y * br * 0.5, br * 0.1, bx, by, br);
    gr.addColorStop(0, cols[1]); gr.addColorStop(1, cols[0]);
    g.fillStyle = gr; g.beginPath(); g.arc(bx, by, br, 0, 6.3); g.fill();
  }
}
function leafyTree(g, x, y, h, dark, lit, L, r, trunkCol) {
  const pal = [shade(dark, 0.75), dark, mix(dark, lit, 0.45), lit, shade(lit, 1.18)];
  const tw = h * 0.035;
  const tg = g.createLinearGradient(x - tw, 0, x + tw, 0);
  tg.addColorStop(0, L.x < 0 ? shade(trunkCol, 1.6) : trunkCol); tg.addColorStop(1, L.x < 0 ? trunkCol : shade(trunkCol, 1.6));
  g.fillStyle = tg; g.beginPath(); g.moveTo(x - tw * 1.4, y); g.lineTo(x - tw * 0.6, y - h * 0.62); g.lineTo(x + tw * 0.6, y - h * 0.62); g.lineTo(x + tw * 1.4, y); g.closePath(); g.fill();
  paintFoliage(g, x, y - h * 0.7, h * 0.36, h * 0.27, pal, L, r, { clusters: 8, leaf: Math.max(2.5, h * 0.016), per: 18 });
}
function pineSil(g, x, y, h, w, dark, lit, L, r, snow) {
  g.fillStyle = dark; g.fillRect(x - w * 0.03, y - h * 0.25, w * 0.06, h * 0.25);
  const tiers = 8, side2 = mix(dark, lit, 0.32);
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1), ty = y - h * 0.1 - t * h * 0.84, tw = w * (1 - t * 0.85) * 0.5 + 2, th = h * 0.17 * (1 - t * 0.35);
    for (const side of [-1, 1]) {
      const tipX = x + side * tw, tipY = ty + th * 0.3 + r() * th * 0.2;
      g.beginPath(); g.moveTo(x, ty - th);
      g.quadraticCurveTo(x + side * tw * 0.45, ty - th * 0.5, tipX, tipY);
      const n = 7;
      for (let k = 1; k <= n; k++) { const u = 1 - k / n; g.lineTo(x + side * tw * u, tipY * u + (ty + 1) * (1 - u) + (k % 2 ? th * 0.25 : -th * 0.04)); }
      g.closePath();
      const litSide = side * L.x > 0;
      g.fillStyle = litSide ? side2 : dark; g.fill();
      if (litSide) { g.strokeStyle = lit; g.globalAlpha = 0.55; g.lineWidth = Math.max(0.8, w * 0.012); g.beginPath(); g.moveTo(x, ty - th); g.quadraticCurveTo(x + side * tw * 0.45, ty - th * 0.5, tipX, tipY); g.stroke(); g.globalAlpha = 1; }
      if (snow) { g.fillStyle = snow; g.beginPath(); g.moveTo(x, ty - th); g.quadraticCurveTo(x + side * tw * 0.45, ty - th * 0.5, tipX, tipY); g.quadraticCurveTo(x + side * tw * 0.4, ty - th * 0.35, x, ty - th * 0.7); g.closePath(); g.fill(); }
    }
  }
  g.fillStyle = dark; g.beginPath(); g.moveTo(x, y - h * 1.02); g.lineTo(x + 1.2, y - h * 0.9); g.lineTo(x - 1.2, y - h * 0.9); g.fill();
}
function deadSil(g, x, y, h, col, r, bend) {
  g.strokeStyle = col; g.lineCap = "round";
  const br = (bx, by, ang, len, w, d) => {
    const ex = bx + Math.cos(ang) * len + bend * len * 0.04, ey = by + Math.sin(ang) * len;
    g.lineWidth = w; g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke();
    if (d > 0) { br(ex, ey, ang - 0.4 - r() * 0.5, len * 0.62, w * 0.6, d - 1); br(ex, ey, ang + 0.3 + r() * 0.5, len * 0.6, w * 0.6, d - 1); }
  };
  br(x, y, -Math.PI / 2 + (r() - 0.5) * 0.2, h * 0.42, h * 0.05, 4);
}

// mountain profile height (0..1) at u in [0,LW)
function ridge(u, s, sharp) {
  const p = 16;
  const v = fbm1((u / LW) * p, p, s, 6, 0.52);
  const r1 = 1 - Math.abs(2 * fbm1((u / LW) * p * 0.5, p * 0.5, s + 5, 4) - 1);
  return v * (1 - sharp) + Math.pow(r1, 2.2) * sharp;
}

function bakeMountains(A, res, s) {
  const M = A.mount, L = A.light;
  const top = 110, hU = REF_H - top;
  const ly = layerCanvas(LW, hU, res), g = ly.g;
  g.translate(0, -top);
  const hazeC = A.haze;
  const ranges = [
    { base: 470, amp: 300, col: mix(M.far, hazeC, 0.35), sharp: 0.55, seed: s + 1, haze: 0.55 },
    { base: 520, amp: 220, col: M.near, sharp: 0.45, seed: s + 2, haze: 0.4 },
  ];
  if (A.id === "forest") { ranges[0].amp = 200; ranges[0].base = 470; ranges[1].amp = 140; ranges[1].base = 505; ranges[0].sharp = 0.35; ranges[1].sharp = 0.25; }
  if (A.id === "storm") { ranges[0].sharp = 0.75; ranges[1].sharp = 0.7; ranges[0].amp = 330; }
  for (const R of ranges) {
    const ys = new Float32Array(LW / 2 + 1);
    for (let i = 0; i <= LW / 2; i++) ys[i] = R.base - R.amp * ridge(i * 2, R.seed, R.sharp);
    const path = new Path2D(); path.moveTo(0, REF_H + 10);
    for (let i = 0; i <= LW / 2; i++) path.lineTo(i * 2, ys[i]);
    path.lineTo(LW, REF_H + 10); path.closePath();
    const gr = g.createLinearGradient(0, R.base - R.amp, 0, R.base + 40);
    gr.addColorStop(0, R.col); gr.addColorStop(1, mix(R.col, hazeC, R.haze));
    g.fillStyle = gr; g.fill(path);
    g.save(); g.clip(path);
    // relief: faces toward the light brighten, faces away darken. Slopes are smoothed over ~40 U, painted into a
    // scratch canvas and composited with a blur so there are no column stripes or hard lower edges.
    {
      const M2 = LW / 2, kk = new Float32Array(M2 + 1);
      for (let i = 0; i <= M2; i++) {
        let acc = 0, n = 0;
        for (let j = -24; j <= 24; j++) { const a0 = (i + j - 1 + M2) % M2, a1 = (i + j + 1 + M2) % M2; acc += ys[a1] - ys[a0]; n++; }
        kk[i] = clamp(((acc / n) / 4) * L.x * 1.4 - L.y * 0.08, -1, 1);
      }
      const rc = makeCanvas(LW * res * 0.5, hU * res * 0.5), rg = rc.getContext("2d");
      rg.scale(res * 0.5, res * 0.5); rg.translate(0, -top);
      // facets: one polygon per run of same-sign slope, filled with a gradient fading downwards
      const lightC = rgb(M.light);
      let i0 = 0;
      const flush = (i1) => {
        let sum = 0; for (let i = i0; i < i1; i++) sum += kk[i];
        const k = sum / Math.max(1, i1 - i0);
        if (Math.abs(k) < 0.05 || i1 - i0 < 3) return;
        let ymin = 1e9; for (let i = i0; i < i1; i++) ymin = Math.min(ymin, ys[i]);
        const depth = 90 + (R.base - ymin) * 0.6;
        const gr = rg.createLinearGradient(0, ymin, 0, ymin + depth);
        const al = k > 0 ? Math.min(0.5, k * 0.7) : Math.min(0.42, -k * 0.55), C = k > 0 ? lightC : [12, 10, 34];
        gr.addColorStop(0, css(C, al)); gr.addColorStop(0.55, css(C, al * 0.45)); gr.addColorStop(1, css(C, 0));
        rg.fillStyle = gr; rg.beginPath(); rg.moveTo(i0 * 2, ys[i0] - 3);
        for (let i = i0; i <= i1; i++) rg.lineTo(i * 2, ys[i] - 3);
        rg.lineTo(i1 * 2, ymin + depth); rg.lineTo(i0 * 2, ymin + depth); rg.closePath(); rg.fill();
      };
      for (let i = 1; i <= M2; i++) if (i === M2 || Math.sign(kk[i]) !== Math.sign(kk[i0])) { flush(i); i0 = i; }
      g.save();
      if (supportsFilter()) g.filter = "blur(" + Math.max(2, 9 * res) + "px)";
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(rc, 0, 0, g.canvas.width, g.canvas.height);
      g.restore();
    }
    // snow caps
    if (M.snow) {
      const snowLine = R.base - R.amp * 0.62;
      g.fillStyle = M.snow;
      g.beginPath(); g.moveTo(0, snowLine);
      for (let i = 0; i <= LW / 2; i++) {
        const sl = snowLine + (fbm1((i * 2 / LW) * 40, 40, R.seed + 9, 3) - 0.5) * 50;
        g.lineTo(i * 2, Math.min(sl, Math.max(ys[i], sl)));
      }
      for (let i = LW / 2; i >= 0; i--) g.lineTo(i * 2, ys[i] - 2);
      g.closePath(); g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1;
    }
    // valley haze
    const hg = g.createLinearGradient(0, R.base - R.amp * 0.3, 0, R.base + 60);
    hg.addColorStop(0, css(hazeC, 0)); hg.addColorStop(1, css(hazeC, 0.65));
    g.fillStyle = hg; g.fillRect(0, R.base - R.amp, LW, R.amp + 300);
    g.restore();
  }
  return { ...ly, top, factor: 0.04, yf: 0.03, bottom: mix(M.near, hazeC, 0.4) };
}

function bakeHills(A, res, s) {
  const top = 300, hU = REF_H - top;
  const ly = layerCanvas(LW, hU, res), g = ly.g, r = rng(s + 30), L = A.light;
  g.translate(0, -top);
  const base = 560, col = A.hills;
  const ys = new Float32Array(LW / 4 + 1);
  for (let i = 0; i <= LW / 4; i++) ys[i] = base - 90 * fbm1((i * 4 / LW) * 6, 6, s + 31, 5);
  const path = new Path2D(); path.moveTo(0, REF_H + 10);
  for (let i = 0; i <= LW / 4; i++) path.lineTo(i * 4, ys[i]);
  path.lineTo(LW, REF_H + 10); path.closePath();
  const gr = g.createLinearGradient(0, base - 100, 0, REF_H);
  gr.addColorStop(0, col); gr.addColorStop(1, mix(col, A.haze, 0.5));
  g.fillStyle = gr; g.fill(path);
  // tree fuzz along the ridge
  const dark = shade(col, 0.82), lit = mix(col, A.mount.light, 0.35);
  for (let x = 0; x < LW; x += 5 + r() * 7) {
    const i = Math.floor(x / 4), y = ys[i] + 4, h = 18 + r() * 26;
    wrap((xx) => {
      if (A.id === "forest") canopy(g, xx, y + 3, h, [dark, lit], L, r);
      else if (A.id === "highlands") pineSil(g, xx, y + 2, h * 1.2, h * 0.5, dark, lit, L, r);
      else if (r() < 0.25) deadSil(g, xx, y + 2, h * 1.3, dark, r, 6);
    }, x, 40);
  }
  const hg = g.createLinearGradient(0, base - 60, 0, REF_H);
  hg.addColorStop(0, css(A.haze, 0.05)); hg.addColorStop(1, css(A.haze, 0.55));
  g.globalCompositeOperation = "source-atop"; g.fillStyle = hg; g.fillRect(0, base - 160, LW, 500); g.globalCompositeOperation = "source-over";
  return { ...ly, top, factor: 0.1, yf: 0.07, bottom: mix(col, A.haze, 0.5) };
}

function bakeTrees(A, res, s, near) {
  const top = near ? (A.id === "forest" ? -220 : 120) : 230, hU = REF_H - top;
  const ly = layerCanvas(LW, hU, res), g = ly.g, r = rng(s + (near ? 50 : 40)), L = A.light;
  g.translate(0, -top);
  const base = near ? 640 : 600;
  const col = near ? A.midTrees : A.farTrees, lit = near ? A.midTreesLit : A.farTreesLit;
  const ground = shade(col, 0.85);
  // ground mass
  g.fillStyle = ground; g.beginPath(); g.moveTo(0, REF_H + 10);
  for (let x = 0; x <= LW; x += 8) g.lineTo(x, base - 6 * fbm1((x / LW) * 12, 12, s + 41, 3) - 4);
  g.lineTo(LW, REF_H + 10); g.closePath(); g.fill();
  const step = near ? (A.id === "forest" ? 150 : 70) : 34;
  for (let x = 0; x < LW; x += step * (0.6 + r() * 0.8)) {
    const h = (near ? 260 : 150) * (0.75 + r() * 0.5), y = base + r() * 10;
    wrap((xx) => {
      if (A.id === "forest") {
        if (near) leafyTree(g, xx, y, 520 + r() * 160, col, lit, L, r, "#3a3024");
        else canopy(g, xx, y, h, [col, lit], L, r);
      } else if (A.id === "highlands") pineSil(g, xx, y, h, h * 0.38, col, lit, L, r);
      else { if (r() < 0.55) deadSil(g, xx, y, h * 0.9, col, r, 10); else pineSil(g, xx, y, h * 0.9, h * 0.3, col, lit, L, r, near ? null : "rgba(110,125,160,0.6)"); }
    }, x, near && A.id === "forest" ? 440 : 260);   // >= half the widest crown, or the tile edge cuts it (seam)
  }
  if (near && A.id === "forest") { // bushes along the bottom
    for (let x = 0; x < LW; x += 40 + r() * 50) wrap((xx) => paintFoliage(g, xx, base + 6, 34 + r() * 20, 18 + r() * 8, [shade(col, 0.7), col, mix(col, lit, 0.5), lit, shade(lit, 1.15)], L, r, { clusters: 5, leaf: 3.5, per: 14 }), x, 80);
  }
  // atmospheric perspective + low mist
  const hz = g.createLinearGradient(0, base - 200, 0, REF_H);
  hz.addColorStop(0, css(A.haze, near ? 0.14 : 0.2)); hz.addColorStop(0.7, css(A.haze, near ? 0.24 : 0.38)); hz.addColorStop(1, css(A.haze, near ? 0.34 : 0.5));
  g.globalCompositeOperation = "source-atop"; g.fillStyle = hz; g.fillRect(0, top - 20, LW, REF_H); g.globalCompositeOperation = "source-over";
  return { ...ly, top, factor: near ? 0.42 : 0.24, yf: near ? 0.3 : 0.16, bottom: mix(ground, A.haze, near ? 0.3 : 0.5), maxShift: top < 0 ? -top - 20 : 400 };
}

function bakeNear(A, res, s) {
  const top = -300, hU = REF_H - top;
  const ly = layerCanvas(LW, hU, res), g = ly.g, r = rng(s + 60), L = A.light;
  g.translate(0, -top);
  if (supportsFilter()) g.filter = "blur(1.2px)";
  const col = A.nearTrunk, leaf = A.nearLeaf;
  for (let x = 120; x < LW; x += 380 + r() * 420) {
    wrap((xx) => {
      if (A.id === "forest") {
        const w = 40 + r() * 34;
        const gr = g.createLinearGradient(xx - w / 2, 0, xx + w / 2, 0);
        gr.addColorStop(0, L.x < 0 ? shade(col, 2.0) : col); gr.addColorStop(0.35, shade(col, 1.5)); gr.addColorStop(1, shade(col, 0.7));
        g.fillStyle = gr; g.beginPath(); g.moveTo(xx - w / 2, top - 10); g.lineTo(xx + w / 2, top - 10); g.lineTo(xx + w / 2 + 12, REF_H + 10); g.lineTo(xx - w / 2 - 12, REF_H + 10); g.closePath(); g.fill();
        g.strokeStyle = "rgba(0,0,0,0.3)"; g.lineWidth = 2;
        for (let i = 0; i < 9; i++) { const sx = xx - w / 2 + r() * w; g.beginPath(); g.moveTo(sx, top); g.bezierCurveTo(sx + 4, 200, sx - 4, 420, sx + (sx - xx) * 0.2, REF_H); g.stroke(); }
        { // a mossy root flare instead of a flat rectangle (it read as a pale box above water)
          const ry0 = REF_H - 40 - r() * 40, rw = w * 0.9 + 18;
          const rg = g.createRadialGradient(xx, ry0 + 30, 4, xx, ry0 + 30, rw);
          rg.addColorStop(0, shade(col, 0.8)); rg.addColorStop(0.7, css(rgb(shade(col, 0.6)), 0.6)); rg.addColorStop(1, css(rgb(shade(col, 0.6)), 0));
          g.fillStyle = rg; g.beginPath(); g.ellipse(xx, ry0 + 30, rw, 70, 0, 0, 6.3); g.fill();
        }
        paintFoliage(g, xx, -60, 150, 110, [shade(leaf, 0.7), leaf, shade(leaf, 1.35), shade(leaf, 1.7), shade(leaf, 2.1)], L, r, { clusters: 9, leaf: 7, per: 20 });
      } else if (A.id === "highlands") {
        pineSil(g, xx, REF_H + 40, 760, 300, col, shade(col, 1.9), L, r);
      } else if (r() < 0.6) {
        deadSil(g, xx, REF_H + 30, 380 + r() * 120, col, r, 24);
      }
    }, x, 400);
  }
  g.filter = "none";
  return { ...ly, top, factor: 0.68, yf: 0.5, bottom: null, sparse: true, maxShift: 280 };
}

function bakeClouds(A, res, s) {
  const Cc = A.clouds, top = 0, hU = A.id === "storm" ? 360 : 300;
  const ly = layerCanvas(LW, hU, res), g = ly.g, r = rng(s + 70);
  const n = A.id === "storm" ? 70 : 16;
  for (let i = 0; i < n; i++) {
    const cx = r() * LW, cy = (A.id === "storm" ? 20 : 40) + r() * (hU * 0.55), w = 120 + r() * 240;
    const cs = r() * 1e9;
    wrap((xx) => { const rr = rng(cs); paintCloud(g, xx, cy + w * 0.1, w, Cc.color, Cc.shade, Cc.alpha, rr, A.id === "storm"); }, cx, 300);
  }
  if (A.id === "storm") { const gr = g.createLinearGradient(0, 0, 0, hU); gr.addColorStop(0, "rgba(4,6,12,0.85)"); gr.addColorStop(1, "rgba(4,6,12,0)"); g.fillStyle = gr; g.fillRect(0, 0, LW, hU); }
  return { ...ly, top, factor: 0.015, yf: 0.01, bottom: null, drift: Cc.speed, sparse: true };
}

function bakeFog(A, res, s, color) {
  const hU = 240;
  const ly = layerCanvas(LW, hU, res), g = ly.g, r = rng(s + 80);
  for (let i = 0; i < 90; i++) {
    const cx = r() * LW, cy = hU * (0.3 + r() * 0.45), rr = 50 + r() * 110;
    wrap((xx) => {
      const gr = g.createRadialGradient(xx, cy, 0, xx, cy, rr);
      gr.addColorStop(0, css(color, 0.4)); gr.addColorStop(1, css(color, 0));
      g.fillStyle = gr; g.fillRect(xx - rr, cy - rr, rr * 2, rr * 2);
    }, cx, 200);
  }
  // feather the blobs to nothing at the top/bottom edges (blobs bigger than the band used to leave straight lines)
  const fm = g.createLinearGradient(0, 0, 0, hU);
  fm.addColorStop(0, "rgba(0,0,0,0)"); fm.addColorStop(0.3, "rgba(0,0,0,1)"); fm.addColorStop(0.75, "rgba(0,0,0,1)"); fm.addColorStop(1, "rgba(0,0,0,0)");
  g.globalCompositeOperation = "destination-in"; g.fillStyle = fm; g.fillRect(0, 0, LW, hU); g.globalCompositeOperation = "source-over";
  const gr = g.createLinearGradient(0, 0, 0, hU);
  gr.addColorStop(0, css(color, 0)); gr.addColorStop(0.55, css(color, 0.35)); gr.addColorStop(1, css(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, LW, hU);
  return ly;
}

function bakeRays(A, res) {
  const RA = A.rays; if (!RA) return null;
  const wU = 1500, hU = REF_H;
  const ly = layerCanvas(wU, hU, res), g = ly.g, r = rng(91);
  const sx = RA.low ? wU * 0.82 : wU * 0.12, sy = RA.low ? hU * 0.52 : -60;
  for (let i = 0; i < 20; i++) {
    const ang = RA.low ? Math.PI + (r() - 0.5) * 0.5 + 0.1 : Math.PI / 2 - RA.angle + (i / 19 - 0.5) * 0.9 + (r() - 0.5) * 0.08;
    const len = RA.low ? 1300 : 800 + r() * 400, wid = 6 + r() * 26;
    const ex = sx + Math.cos(ang) * len, ey = sy + Math.sin(ang) * len;
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const gr = g.createLinearGradient(sx, sy, ex, ey);
    const a = (0.05 + r() * 0.1) * RA.alpha * 2;
    gr.addColorStop(0, css(RA.color, a)); gr.addColorStop(0.5, css(RA.color, a * 0.5)); gr.addColorStop(1, css(RA.color, 0));
    g.fillStyle = gr; g.beginPath();
    g.moveTo(sx + nx * wid * 0.15, sy + ny * wid * 0.15); g.lineTo(ex + nx * wid, ey + ny * wid); g.lineTo(ex - nx * wid, ey - ny * wid); g.lineTo(sx - nx * wid * 0.15, sy - ny * wid * 0.15); g.closePath(); g.fill();
  }
  return { ...ly, sx, sy };
}

function bakeFront(A, res, s) {
  const hU = 240;
  const ly = layerCanvas(LW, hU, res), g = ly.g, r = rng(s + 100), L = A.light;
  if (supportsFilter()) g.filter = "blur(2.2px)";
  const dark = A.id === "storm" ? "#04060a" : A.id === "highlands" ? "#120d0a" : "#0b1608";
  const lit = A.id === "storm" ? "#121826" : A.id === "highlands" ? "#3a2618" : "#1f3a14";
  for (let x = 200; x < LW; x += 520 + r() * 600) {
    wrap((xx) => {
      if (A.id === "forest") {
        for (let i = 0; i < 9; i++) {
          const ang = -Math.PI / 2 + (i - 4) * 0.28 + (r() - 0.5) * 0.2, len = 120 + r() * 100;
          const ex = xx + Math.cos(ang) * len, ey = hU + Math.sin(ang) * len;
          g.strokeStyle = i % 2 ? dark : lit; g.lineWidth = 4;
          g.beginPath(); g.moveTo(xx, hU + 10); g.quadraticCurveTo(xx + Math.cos(ang) * len * 0.4, hU + Math.sin(ang) * len * 0.8, ex, ey + 30); g.stroke();
          for (let k = 1; k < 14; k++) {
            const t = k / 14, px = xx + (ex - xx) * t, py = hU + 10 + (ey + 30 - hU - 10) * t - Math.sin(t * Math.PI) * len * 0.25;
            const l = (1 - t) * 26 + 6;
            g.fillStyle = k % 2 ? dark : lit;
            g.beginPath(); g.ellipse(px - l * 0.5, py - l * 0.2, l * 0.55, 4, -0.6, 0, 6.3); g.ellipse(px + l * 0.5, py - l * 0.2, l * 0.55, 4, 0.6, 0, 6.3); g.fill();
          }
        }
      } else if (A.id === "highlands") {
        for (let i = 0; i < 40; i++) { const bx = xx + (r() - 0.5) * 120, h = 60 + r() * 120; g.strokeStyle = r() < 0.5 ? dark : lit; g.lineWidth = 3; g.beginPath(); g.moveTo(bx, hU + 5); g.quadraticCurveTo(bx + 10, hU - h * 0.5, bx + (r() - 0.3) * 40, hU - h); g.stroke(); }
      } else {
        g.fillStyle = dark; g.beginPath(); g.ellipse(xx, hU + 30, 140 + r() * 60, 90 + r() * 30, 0, 0, 6.3); g.fill();
        for (let i = 0; i < 26; i++) { const bx = xx + (r() - 0.5) * 220, h = 40 + r() * 70; g.strokeStyle = lit; g.lineWidth = 2.5; g.beginPath(); g.moveTo(bx, hU - 30); g.quadraticCurveTo(bx + 14, hU - 30 - h * 0.5, bx + 30, hU - 30 - h); g.stroke(); }
      }
    }, x, 300);
  }
  g.filter = "none";
  return { ...ly, factor: 1.35 };
}

function bakeBolts(res) {
  const out = [];
  for (let v = 0; v < 3; v++) {
    const wU = 260, hU = 520, ly = layerCanvas(wU, hU, res), g = ly.g, r = rng(300 + v);
    const pts = [[wU / 2, 0]];
    let x = wU / 2, y = 0;
    while (y < hU) { y += 18 + r() * 30; x += (r() - 0.5) * 60; pts.push([x, y]); }
    const strokeBolt = (P, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineJoin = "round"; g.beginPath(); g.moveTo(P[0][0], P[0][1]); for (const p of P) g.lineTo(p[0], p[1]); g.stroke(); };
    const branches = [];
    for (let i = 2; i < pts.length - 2; i++) if (r() < 0.35) {
      const B = [pts[i]]; let bx = pts[i][0], by = pts[i][1];
      for (let k = 0; k < 4; k++) { by += 14 + r() * 20; bx += (r() < 0.5 ? -1 : 1) * (10 + r() * 22); B.push([bx, by]); }
      branches.push(B);
    }
    for (const [w, a] of [[26, 0.06], [14, 0.12], [7, 0.3]]) { strokeBolt(pts, w, `rgba(170,190,255,${a})`); for (const B of branches) strokeBolt(B, w * 0.6, `rgba(170,190,255,${a})`); }
    strokeBolt(pts, 2.6, "rgba(245,248,255,1)"); for (const B of branches) strokeBolt(B, 1.3, "rgba(235,240,255,0.9)");
    out.push(ly);
  }
  return out;
}

// --------------------------------------------------------------------------------------------------------------
export function createBackdrop() {
  let A = null, key = "", L = null, k = 1, cssW = 960, cssH = 540;
  let sky = null, sunGlow = null, grade = null, gradeKey = "";
  // weather state
  let flash = 0, flashT = 6 + Math.random() * 6, bolt = null, boltX = 0, flicker = 0;
  const birds = [];
  let onFlash = null;
  const bakedCache = new Map(); // the two most recent theme bakes (title forest + the level being played)
  function resetBirds() {
    birds.length = 0;
    for (let i = 0; i < (A.ambient.birds || 0); i++) birds.push({ x: Math.random() * 1600, y: 120 + Math.random() * 140, v: 14 + Math.random() * 10, n: 5 + Math.floor(Math.random() * 5), ph: Math.random() * 6 });
  }

  function bake(art, scale) {
    // scale = device px per U; quantize so resizes do not constantly re-bake
    const q = Math.max(0.5, Math.round(scale * 4) / 4);
    const kk = art.id + ":" + q;
    if (kk === key) return;
    key = kk; A = art;
    gradeKey = "";
    const hit = bakedCache.get(kk);
    if (hit) { bakedCache.delete(kk); bakedCache.set(kk, hit); ({ L, sky, sunGlow } = hit); bake.ms = 0; resetBirds(); return; }
    const s = 1234;
    const t0 = performance.now();
    L = {
      clouds: bakeClouds(A, q * 0.5, s),
      mountains: bakeMountains(A, q * 0.5, s),
      hills: bakeHills(A, q * 0.6, s),
      far: bakeTrees(A, q * 0.7, s, false),
      mid: bakeTrees(A, q * 0.85, s, true),
      near: bakeNear(A, q * 0.6, s),
      fogs: A.fog.map((f, i) => ({ ...f, ly: bakeFog(A, q * 0.35, s + i * 7, f.color) })),
      rays: bakeRays(A, q * 0.4),
      front: bakeFront(A, q * 0.55, s),
      bolts: A.lightning ? bakeBolts(q * 0.5) : null,
    };
    sky = makeCanvas(1, 256); const sg = sky.getContext("2d"); const gr = sg.createLinearGradient(0, 0, 0, 256);
    for (const [o, c] of A.sky) gr.addColorStop(o, c);
    sg.fillStyle = gr; sg.fillRect(0, 0, 1, 256);
    sunGlow = softDot(256, A.sun.glow, 0, A.sun.glowA);
    bakedCache.set(kk, { L, sky, sunGlow });
    while (bakedCache.size > 2) bakedCache.delete(bakedCache.keys().next().value);
    resetBirds();
    bake.ms = performance.now() - t0;
  }

  function bakeGrade() {
    const gk = A.id + cssW + "x" + cssH;
    if (gk === gradeKey) return;
    gradeKey = gk;
    const w = Math.ceil(cssW / 3), h = Math.ceil(cssH / 3);
    grade = makeCanvas(w, h); const g = grade.getContext("2d");
    const G = A.grade;
    const lg = g.createLinearGradient(0, 0, 0, h);
    lg.addColorStop(0, G.top); lg.addColorStop(0.45, "rgba(0,0,0,0)"); lg.addColorStop(1, G.bottom);
    g.fillStyle = lg; g.fillRect(0, 0, w, h);
    const r = Math.hypot(w, h) / 2;
    const rg = g.createRadialGradient(w / 2, h * 0.45, r * 0.35, w / 2, h / 2, r * 1.05);
    rg.addColorStop(0, css(G.vigColor, 0)); rg.addColorStop(0.6, css(G.vigColor, G.vignette * 0.35)); rg.addColorStop(1, css(G.vigColor, G.vignette));
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
  }

  // draw a tiled layer
  function drawLayer(ctx, ly, ox, oy, alpha = 1) {
    if (ly.maxShift !== undefined && ly.top !== undefined) oy = Math.min(oy, (ly.top + ly.maxShift) * k);
    const w = ly.wU * k, h = ly.hU * k;
    let x = -(((ox % w) + w) % w);
    ctx.globalAlpha = alpha;
    // whole-pixel tile positions, 1 px overlap: no hairline seams between tiles
    for (; x < cssW; x += w) ctx.drawImage(ly.c, Math.floor(x), oy, Math.ceil(w) + 1, h);
    ctx.globalAlpha = 1;
    if (ly.bottom && oy + h < cssH) { ctx.fillStyle = ly.bottom; ctx.fillRect(0, oy + h - 1, cssW, cssH - oy - h + 1); }
  }

  // camX/camY world px of the view center, zoom css/world, rise = world px the camera is above its lowest position
  function drawBack(ctx, view, quality, rise) {
    const cam = view.camera, t = view.time, z = cam.zoom, cx = cam.x * z;
    const ry = Math.max(0, rise * z);
    ctx.drawImage(sky, 0, 0, cssW, cssH);
    // sun / moon
    const S = A.sun, sx = S.x * cssW - cx * 0.006, sy = S.y * cssH + ry * 0.02;
    const gs = S.big * k;
    ctx.drawImage(sunGlow, sx - gs / 2, sy - gs / 2, gs, gs);
    ctx.fillStyle = S.core; ctx.beginPath(); ctx.arc(sx, sy, S.r * k * 0.5, 0, 6.283); ctx.fill();
    if (S.moon) { ctx.fillStyle = "rgba(120,130,170,0.35)"; ctx.beginPath(); ctx.arc(sx - S.r * k * 0.12, sy - S.r * k * 0.08, S.r * k * 0.14, 0, 6.283); ctx.arc(sx + S.r * k * 0.16, sy + S.r * k * 0.12, S.r * k * 0.09, 0, 6.283); ctx.fill(); }
    // clouds
    const Lc = L.clouds;
    drawLayer(ctx, Lc, cx * Lc.factor + t * Lc.drift * k, Lc.top * k + ry * Lc.yf);
    // birds
    if (birds.length) {
      ctx.strokeStyle = "rgba(40,25,30,0.7)"; ctx.lineWidth = 1.3; ctx.beginPath();
      for (const b of birds) {
        const bx = ((b.x + t * b.v - cx * 0.03) % 2200 + 2200) % 2200 - 200;
        for (let i = 0; i < b.n; i++) {
          const px = (bx + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 16) * k, py = (b.y + Math.ceil(i / 2) * 9 + Math.sin(t * 0.7 + i) * 3) * k + ry * 0.02;
          const f = Math.sin(t * 9 + i * 1.3 + b.ph) * 3.5 * k;
          ctx.moveTo(px - 5 * k, py - f); ctx.quadraticCurveTo(px - 2 * k, py - 1, px, py + 1); ctx.quadraticCurveTo(px + 2 * k, py - 1, px + 5 * k, py - f);
        }
      }
      ctx.stroke();
    }
    // lightning behind the mountains
    if (A.lightning) {
      flashT -= view.dt;
      if (flashT <= 0) {
        flashT = 5 + Math.random() * 9; flash = 1; flicker = 0;
        bolt = L.bolts[Math.floor(Math.random() * L.bolts.length)]; boltX = cssW * (0.15 + Math.random() * 0.7);
        if (onFlash) try { onFlash(0.55 + Math.random() * 0.45); } catch (e) { /* caller */ }
      }
      if (flash > 0) {
        flicker += view.dt;
        const a = flash * (flicker < 0.08 || (flicker > 0.16 && flicker < 0.26) ? 1 : 0.45);
        ctx.fillStyle = `rgba(150,165,220,${a * 0.45})`; ctx.fillRect(0, 0, cssW, cssH);
        if (bolt && flicker < 0.32) { ctx.globalAlpha = Math.min(1, a * 1.3); ctx.drawImage(bolt.c, boltX - bolt.wU * k / 2, 20 * k, bolt.wU * k, bolt.hU * k); ctx.globalAlpha = 1; }
        flash = Math.max(0, flash - view.dt * 1.6);
      }
    }
    const Lm = L.mountains;
    drawLayer(ctx, Lm, cx * Lm.factor, Lm.top * k + ry * Lm.yf);
    for (const f of L.fogs) if (f.after === 0) drawFog(ctx, f, cx, ry, t);
    const Lh = L.hills;
    drawLayer(ctx, Lh, cx * Lh.factor, Lh.top * k + ry * Lh.yf);
    for (const f of L.fogs) if (f.after === 1) drawFog(ctx, f, cx, ry, t);
    const Lf = L.far;
    drawLayer(ctx, Lf, cx * Lf.factor, Lf.top * k + ry * Lf.yf);
    if (L.rays && quality !== "low") {
      const R = L.rays, sway = 0.75 + 0.25 * Math.sin(t * 0.35);
      const rx = (A.rays.low ? sx - R.sx * k : sx - R.sx * k) + Math.sin(t * 0.13) * 20 * k;
      ctx.globalAlpha = sway; ctx.drawImage(R.c, rx, (A.rays.low ? sy - R.sy * k : 0) + ry * 0.05, R.wU * k, R.hU * k); ctx.globalAlpha = 1;
    }
    const Ld = L.mid;
    drawLayer(ctx, Ld, cx * Ld.factor, Ld.top * k + ry * Ld.yf);
    for (const f of L.fogs) if (f.after === 2) drawFog(ctx, f, cx, ry, t);
    if (quality !== "low") { const Ln = L.near; drawLayer(ctx, Ln, cx * Ln.factor, Ln.top * k + ry * Ln.yf); }
    for (const f of L.fogs) if (f.after === 3 && quality !== "low") drawFog(ctx, f, cx, ry, t);
  }

  function drawFog(ctx, f, cx, ry, t) {
    drawLayer(ctx, f.ly, cx * (0.12 + f.y * 0.3) + t * f.speed * k, f.y * REF_H * k - f.ly.hU * k * 0.5 + ry * (0.05 + f.y * 0.25), Math.min(1, f.alpha * 2));
  }

  function drawFront(ctx, view) {
    const F = L.front; if (!F) return;
    drawLayer(ctx, F, view.camera.x * view.camera.zoom * F.factor, cssH - F.hU * k * 0.9, 0.92);
  }

  function drawGrade(ctx) {
    bakeGrade();
    ctx.drawImage(grade, 0, 0, cssW, cssH);
    if (flash > 0) { ctx.fillStyle = `rgba(200,212,255,${flash * 0.16})`; ctx.fillRect(0, 0, cssW, cssH); }
  }

  return {
    setArt(art, dpr) { A = art; bake(art, k * dpr); },
    resize(w, h, dpr) { cssW = w; cssH = h; k = h / REF_H; if (A) bake(A, k * dpr); gradeKey = ""; },
    drawBack, drawFront, drawGrade,
    set onFlash(f) { onFlash = f; },
    get flash() { return flash; },
    get bakeMs() { return bake.ms || 0; },
    get k() { return k; },
  };
}
