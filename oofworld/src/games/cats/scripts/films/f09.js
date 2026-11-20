// films/f09.js - Chapter 9 "Security Footage" (FILMS.md f09). Teal monitor lab + green CCTV.
// The lab watched everything: on the tapes Biscuit walks IN FRONT, small cats follow him, and he
// hides a kitten in the hay and walks away. Pure function of t; all art in a 960 x 540 space.
import * as K from "../filmkit.js";

const D = 70;
const TEAL = "#5affc8", STEEL = "#4a5560", AMBER = "#ffb000", DARK = "#0c1216";
const MONO = '"Consolas", "Lucida Console", "Courier New", monospace';
const KEY_LIGHT = { color: "#bfffe8" };

// ---- small local helpers ------------------------------------------------------------------------
const pad2 = (n) => String(Math.floor(n)).padStart(2, "0");
function clock(sec) {
  sec = Math.max(0, sec);
  return pad2(sec / 3600) + ":" + pad2((sec / 60) % 60) + ":" + pad2(sec % 60);
}
function poly(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}
// texQuad: a textured world-space quad (origin o, edge vectors ea and eb, metres) drawn through any
// projection proj(x,y,z)->[sx,sy,...]. It is cut into n strips along eb and each strip gets its own
// affine pattern transform, so the texture foreshortens with depth like a real surface.
// tile = metres per texture tile along [ea, eb]. shade(k0,k1) -> optional rgba to darken each strip.
function texQuad(g, proj, name, texO, o, ea, eb, n, tile, shade, pw = 1, swap = false) {
  // name: a kit texture name, or a canvas of our own (a baked texture)
  const tex = typeof name === "string" ? K.texture(name, texO) : name;
  const pat = typeof name === "string" ? K.texPattern(g, name, texO) : g.createPattern(name, "repeat");
  if (!pat || !pat.setTransform || typeof DOMMatrix === "undefined") return;
  const la = Math.hypot(ea[0], ea[1], ea[2]), lb = Math.hypot(eb[0], eb[1], eb[2]);
  // texture px across the quad (swap: the texture x axis runs along eb instead of ea)
  const pu = (la / tile[0]) * (swap ? tex.height : tex.width), pv = (lb / tile[1]) * (swap ? tex.width : tex.height);
  const at = (u, v) => proj(o[0] + ea[0] * u + eb[0] * v, o[1] + ea[1] * u + eb[1] * v, o[2] + ea[2] * u + eb[2] * v);
  g.save();
  g.fillStyle = pat;
  for (let k = 0; k < n; k++) {
    const v0 = Math.pow(k / n, pw), v1 = Math.pow((k + 1) / n, pw);
    const a = at(0, v0), b = at(1, v0), c = at(1, v1), d = at(0, v1);
    const ma = (b[0] - a[0]) / pu, mb = (b[1] - a[1]) / pu;
    const dv = pv * (v1 - v0);
    const mc = (d[0] - a[0]) / dv, md = (d[1] - a[1]) / dv;
    const vo = pv * v0;
    pat.setTransform(new DOMMatrix(swap ? [mc, md, ma, mb, a[0] - mc * vo, a[1] - md * vo] : [ma, mb, mc, md, a[0] - mc * vo, a[1] - md * vo]));
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath();
    g.fillStyle = pat;
    g.fill();
    if (shade) {
      const s = shade(v0, v1);
      if (s) { g.fillStyle = s; g.fill(); }
    }
  }
  g.restore();
}
// a cached static-noise tile (n x n logical px) used for TV snow
function snowTile(i) {
  return K.sprite("f09snow" + i, 96, 54, (s) => {
    const c = s.canvas;
    const img = s.createImageData(c.width, c.height);
    const R = K.rng("f09snow" + i);
    for (let p = 0; p < c.width * c.height; p++) {
      const v = 30 + Math.pow(R(), 1.6) * 200;
      img.data[p * 4] = v * 0.9; img.data[p * 4 + 1] = v; img.data[p * 4 + 2] = v * 0.95; img.data[p * 4 + 3] = 255;
    }
    s.putImageData(img, 0, 0);
  });
}
function scanPattern(g, dark = 0.55, period = 3) {
  // quantised so a continuously changing period does not mint a new cached sprite every frame
  period = Math.max(2, Math.round(period * 2) / 2);
  const spr = K.sprite("f09scan" + period + ":" + dark, 4, period, (s) => {
    s.fillStyle = `rgba(0,0,0,${dark})`;
    s.fillRect(0, 0, 4, period * 0.45);
  });
  return g.createPattern(spr, "repeat");
}
function scanlines(g, x, y, w, h, alpha, period = 3) {
  const pat = scanPattern(g, 0.6, period);
  if (!pat) return;
  g.save();
  g.globalAlpha *= alpha;
  g.fillStyle = pat;
  g.fillRect(x, y, w, h);
  g.restore();
}
function snow(g, x, y, w, h, t, alpha = 1, seed = 0) {
  const f = Math.floor(t * 24) + seed * 7;
  const tile = snowTile(((f % 3) + 3) % 3);
  g.save();
  g.globalAlpha *= alpha;
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  const ox = K.hash(f, 3) * 96, oy = K.hash(f, 4) * 54;
  const tw = Math.max(96, w * 0.9), th = tw * 54 / 96;
  for (let yy = y - oy * th / 54; yy < y + h; yy += th) {
    for (let xx = x - ox * tw / 96; xx < x + w; xx += tw) g.drawImage(tile, xx, yy, tw, th);
  }
  g.restore();
}
function hudText(g, text, x, y, size, align = "left", color = "#e9f5ec", alpha = 1) {
  g.save();
  g.globalAlpha *= alpha;
  g.font = `600 ${size}px ${MONO}`;
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  g.fillStyle = "rgba(0,0,0,0.6)";
  g.fillText(text, x + 1.5, y + 1.5);
  g.fillStyle = color;
  g.shadowColor = color;
  g.shadowBlur = size * 0.5;
  g.fillText(text, x, y);
  g.restore();
}

// ---- relief: a tiny cached 2.5D renderer for organic close-ups -----------------------------------
// Builds a height field from soft primitives (tapered capsules and ellipsoids, smooth-unioned),
// adds per-material micro relief (directional fur along each limb, skin pores, cloth weave, folds,
// knuckle creases), takes normals from the height gradient and lights them physically: wrapped
// diffuse + subsurface for skin, Blinn specular, fresnel rim, cavity ambient occlusion, colour-
// temperature lights (directional or point with falloff). Linear-light maths, sRGB out. Built ONCE
// per key (every pixel loop lives here, never per frame) and returned as a canvas.
// fast value noise (a 256 x 256 random lattice, smooth-step interpolated) for the bake loops
const NT = (() => { const a = new Float32Array(65536), R = K.rng("f09nt"); for (let i = 0; i < 65536; i++) a[i] = R() * 2 - 1; return a; })();
function vn(x, y) {
  const xf = Math.floor(x), yf = Math.floor(y), fx = x - xf, fy = y - yf;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const x0 = xf & 255, y0 = (yf & 255) << 8, x1 = (xf + 1) & 255, y1 = ((yf + 1) & 255) << 8;
  const a = NT[x0 | y0], b = NT[x1 | y0], c = NT[x0 | y1], d = NT[x1 | y1];
  return a + (b - a) * u + (c - a + (d - c - b + a) * u) * v;
}
const RELIEF = new Map();
const lin = (c) => K.parseColor(c).slice(0, 3).map((v) => Math.pow(v / 255, 2.2));
// The bake is a resumable job (a generator that yields every few rows), so the warm-up scheduler
// can spread a 1-2 s bake over many frames at a few ms each; a draw that needs it before it is
// finished simply runs the rest synchronously.
const RJOBS = new Map();
const reliefRes = (S) => Math.min(K.pixelScale(), 1.25) * (S.res || 1);
function* reliefGen(ck, w, h, S, rs) {
  const cw = Math.max(2, Math.round(w * rs)), ch = Math.max(2, Math.round(h * rs)), N = cw * ch;
  const B = {
    rs, cw, ch, N,
    Hh: new Float32Array(N), SD: new Float32Array(N).fill(-99), TU: new Float32Array(N), TV: new Float32Array(N), TL: new Float32Array(N),
    MI: new Int16Array(N).fill(-1), PI: new Int16Array(N).fill(-1),
  };
  const prims = S.prims.map(normPrim);
  for (let pi = 0; pi < prims.length; pi++) yield* rasterPrim(B, prims[pi], pi);
  const mats = S.mats.map(normMat);
  const Hm = new Float32Array(N), FN = new Float32Array(N);
  microRelief(B, mats, Hm, FN);
  yield;
  const Hb = cavityBlur(B, Hm, Math.max(1, Math.round((S.aoR || 10) * rs)), S.floor || 0);
  yield;
  const c = K.makeCanvas(cw, ch);
  const cg = c.getContext("2d");
  const img = cg.createImageData(cw, ch);
  yield* shadeRelief(B, S, prims, mats, Hm, FN, Hb, img.data);
  cg.putImageData(img, 0, 0);
  c.lw = w; c.lh = h;
  RELIEF.set(ck, c);
}
function reliefJob(key, w, h, S) {
  const rs = reliefRes(S);
  const ck = key + "@" + rs.toFixed(3);
  if (RELIEF.has(ck)) return null;
  let j = RJOBS.get(ck);
  if (!j) { j = reliefGen(ck, w, h, S, rs); RJOBS.set(ck, j); }
  return { ck, j };
}
function reliefBake(key, w, h, S) {
  const rs = reliefRes(S);
  const hit = RELIEF.get(key + "@" + rs.toFixed(3));
  if (hit) return hit;
  const J = reliefJob(key, w, h, S);
  while (!J.j.next().done);
  RJOBS.delete(J.ck);
  return RELIEF.get(J.ck);
}
// advance a bake until the deadline; true once it is finished
function reliefStep(key, w, h, S, deadline) {
  const J = reliefJob(key, w, h, S);
  if (!J) return true;
  while (performance.now() < deadline) if (J.j.next().done) { RJOBS.delete(J.ck); return true; }
  return false;
}
// every primitive / material gets the same object shape (all fields numeric), so the hot loops
// stay monomorphic and optimised
function normPrim(P) {
  const cap = P.k === "cap";
  const cr = P.creases || [];
  return {
    cap, ax: cap ? P.a[0] : 0, ay: cap ? P.a[1] : 0, bx: cap ? P.b[0] : 0, by: cap ? P.b[1] : 0, ra: P.ra || 0, rb: P.rb || 0,
    cx: cap ? 0 : P.c[0], cy: cap ? 0 : P.c[1], rx: P.rx || 1, ry: P.ry || 1, cr: Math.cos(P.rot || 0), sr: Math.sin(P.rot || 0),
    rz: P.rz == null ? Math.min(P.rx || 1, P.ry || 1) : P.rz, z: P.z || 0, za: P.za || 0, zb: P.zb || 0, sq: P.sq == null ? 1 : P.sq,
    blend: P.blend == null ? 6 : P.blend, over: P.over || 0, fringe: P.fringe || 0, folds: P.folds || 0,
    ribP: P.rib ? P.rib.p : 1, ribD: P.rib ? P.rib.d : 0, ribS: P.rib ? P.rib.slant || 0 : 0,
    nc: cr.length, ct: Float64Array.from(cr.map((c) => c.t)), cwd: Float64Array.from(cr.map((c) => c.w)), cd: Float64Array.from(cr.map((c) => c.d)),
    mat: P.mat | 0,
  };
}
function normMat(M) {
  const z3 = [0, 0, 0];
  return {
    a: lin(M.color), tip: M.tip ? lin(M.tip) : z3, hasTip: M.tip ? 1 : 0, tipFrom: M.tipFrom == null ? 0.6 : M.tipFrom, tipK: M.tipK == null ? 1 : M.tipK,
    alt: M.alt ? lin(M.alt) : z3, hasAlt: M.alt ? 1 : 0, altF: M.altF || 0.03, altK: M.altK == null ? 1 : M.altK, altBias: M.altBias || 0,
    sss: M.sss ? lin(M.sss) : z3, sssK: M.sss ? (M.sssK == null ? 0.4 : M.sssK) : 0,
    fur: M.fur || 0, furL: M.furL || 0.06, furW: M.furW || 0.55, furV: M.furV == null ? 0.5 : M.furV,
    pore: M.pore || 0, weave: M.weave || 0, mott: M.mott || 0, wrap: M.wrap || 0, spec: M.spec || 0, shin: M.shin || 30,
    aoK: M.aoK == null ? 1 : M.aoK, rimK: M.rimK == null ? 1 : M.rimK,
    bars: M.bars || 0, barsF: M.barsF || 0.05,
  };
}
function* rasterPrim(B, P, pi) {
  const { rs, cw, ch, Hh, SD, TU, TV, TL, MI, PI } = B;
  const fr = P.fringe + 3;
  let x0, y0, x1, y1;
  if (P.cap) {
    const rm = Math.max(P.ra, P.rb) + fr;
    x0 = Math.min(P.ax, P.bx) - rm; x1 = Math.max(P.ax, P.bx) + rm; y0 = Math.min(P.ay, P.by) - rm; y1 = Math.max(P.ay, P.by) + rm;
  } else {
    const rm = Math.max(P.rx, P.ry) + fr;
    x0 = P.cx - rm; x1 = P.cx + rm; y0 = P.cy - rm; y1 = P.cy + rm;
  }
  const X0 = Math.max(0, Math.floor(x0 * rs)), X1 = Math.min(cw - 1, Math.ceil(x1 * rs));
  const Y0 = Math.max(0, Math.floor(y0 * rs)), Y1 = Math.min(ch - 1, Math.ceil(y1 * rs));
  const abx = P.bx - P.ax, aby = P.by - P.ay, L2 = abx * abx + aby * aby || 1, Lc = Math.sqrt(L2);
  const mx = (P.ax + P.bx) / 2, my = (P.ay + P.by) / 2, ps = pi * 7.31;
  for (let y = Y0; y <= Y1; y++) {
    if (((y - Y0) & 15) === 15) yield;
    const Y = (y + 0.5) / rs;
    for (let x = X0; x <= X1; x++) {
      const X = (x + 0.5) / rs;
      let sd, hz, tu, tv, tl;
      if (P.cap) {
        let tt = ((X - P.ax) * abx + (Y - P.ay) * aby) / L2;
        tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
        const r = P.ra + (P.rb - P.ra) * tt;
        const qx = X - (P.ax + abx * tt), qy = Y - (P.ay + aby * tt);
        const d = Math.sqrt(qx * qx + qy * qy);
        sd = r - d;
        const q = 1 - (d / r) * (d / r);
        hz = P.z + P.za * (1 - tt) + P.zb * tt + (q > 0 ? r * P.sq * Math.sqrt(q) : 0);
        tu = tt * Lc; tv = ((X - P.ax) * -aby + (Y - P.ay) * abx) / Lc; tl = tt;
      } else {
        const dx = X - P.cx, dy = Y - P.cy;
        const lx = dx * P.cr + dy * P.sr, ly = -dx * P.sr + dy * P.cr;
        const q = (lx / P.rx) * (lx / P.rx) + (ly / P.ry) * (ly / P.ry);
        sd = (1 - Math.sqrt(q)) * Math.min(P.rx, P.ry);
        hz = P.z + (q < 1 ? P.rz * P.sq * Math.sqrt(1 - q) : 0);
        tu = lx; tv = ly; tl = 0.5 + lx / (2 * P.rx);
      }
      if (P.fringe > 0 && sd > -P.fringe - 2 && sd < P.fringe + 1) {
        // a fur edge: the silhouette breaks into strands (noise fast across the strand direction)
        const ang = P.cap ? Math.atan2(Y - my, X - mx) : Math.atan2(tv, tu);
        sd += (vn(ang * 30 + tu * 0.04 + 77 + ps, tl * 3) * 0.7 + vn(ang * 90 + 79 + ps, tu * 0.1) * 0.5) * P.fringe;
      }
      if (sd < -2) continue;
      for (let k = 0; k < P.nc; k++) { const e = (tu - P.ct[k]) / P.cwd[k]; if (e > -3 && e < 3) hz -= P.cd[k] * Math.exp(-e * e) * (0.75 + 0.25 * vn(tv * 0.3 + 36.5, P.ct[k])); }
      if (P.ribD > 0) hz += P.ribD * Math.sin(tu * 6.2832 / P.ribP + tv * P.ribS);
      if (P.folds > 0) hz += P.folds * (vn(tu * 0.018 + 31 + ps, tv * 0.05) + 0.5 * vn(tu * 0.04 + 33 + ps, tv * 0.11));
      const i = y * cw + x;
      const old = SD[i];
      if (old <= 0) {
        // first real coverage, or a nearer anti-aliasing edge: this primitive owns the pixel
        if (sd > old) { Hh[i] = hz; MI[i] = P.mat; PI[i] = pi; TU[i] = tu; TV[i] = tv; TL[i] = tl; SD[i] = sd; }
      } else if (sd > 0) {
        // both inside: smooth union of heights; the higher surface owns the material
        const a = Hh[i], b = hz + P.over;
        const hk = Math.max(P.blend - Math.abs(a - b), 0) / P.blend;
        if (b > a) { MI[i] = P.mat; PI[i] = pi; TU[i] = tu; TV[i] = tv; TL[i] = tl; }
        Hh[i] = Math.max(a, hz) + hk * hk * P.blend * 0.25;
        if (sd > old) SD[i] = sd;
      }
    }
  }
}
function microRelief(B, mats, Hm, FN) {
  // micro relief per material (fur along the primitive's own axis, pores, weave)
  const { rs, cw, N, Hh, TU, TV, MI, PI } = B;
  for (let i = 0; i < N; i++) {
    const mi = MI[i];
    if (mi < 0) continue;
    const M = mats[mi];
    const X = (i % cw) / rs, Y = ((i / cw) | 0) / rs;
    let b = 0, f = 0;
    if (M.fur > 0) {
      f = vn(TU[i] * M.furL + 11 + PI[i] * 7.31, TV[i] * M.furW) * 0.65 + vn(TU[i] * 0.15 + 95, TV[i] * 1.3) * 0.35;
      b += f * M.fur;
    }
    if (M.pore > 0) b += vn(X * 0.5 + 124, Y * 0.5) * M.pore + vn(X * 0.12 + 139, Y * 0.12) * M.pore * 2;
    if (M.weave > 0) b += Math.sin(X * 1.9) * Math.sin(Y * 1.9) * M.weave + vn(X * 0.6 + 168, Y * 0.6) * M.weave;
    FN[i] = f;
    Hm[i] = Hh[i] + b;
  }
}
function cavityBlur(B, Hm, R, floor) {
  // cavity occlusion source: the height field box-blurred (outside the object = the floor height)
  const { cw, ch, N, MI } = B;
  const src = new Float32Array(N), tmp = new Float32Array(N), Hb = new Float32Array(N);
  for (let i = 0; i < N; i++) src[i] = MI[i] < 0 ? floor : Hm[i];
  const n = 2 * R + 1;
  for (let y = 0; y < ch; y++) {
    const r0 = y * cw;
    let acc = 0;
    for (let x = -R; x <= R; x++) acc += src[r0 + (x < 0 ? 0 : x > cw - 1 ? cw - 1 : x)];
    for (let x = 0; x < cw; x++) {
      tmp[r0 + x] = acc / n;
      acc += src[r0 + Math.min(cw - 1, x + R + 1)] - src[r0 + Math.max(0, x - R)];
    }
  }
  for (let x = 0; x < cw; x++) {
    let acc = 0;
    for (let y = -R; y <= R; y++) acc += tmp[(y < 0 ? 0 : y > ch - 1 ? ch - 1 : y) * cw + x];
    for (let y = 0; y < ch; y++) {
      Hb[y * cw + x] = acc / n;
      acc += tmp[Math.min(ch - 1, y + R + 1) * cw + x] - tmp[Math.max(0, y - R) * cw + x];
    }
  }
  return Hb;
}
function* shadeRelief(B, S, prims, mats, Hm, FN, Hb, D) {
  const { rs, cw, ch, SD, TL, TU, TV, MI, PI } = B;
  const LT = (S.lights || []).map((L) => {
    const d = L.dir ? (() => { const l = Math.sqrt(L.dir[0] ** 2 + L.dir[1] ** 2 + L.dir[2] ** 2); return [L.dir[0] / l, L.dir[1] / l, L.dir[2] / l]; })() : [0, 0, 1];
    return { c: lin(L.color), isDir: L.dir ? 1 : 0, dx: d[0], dy: d[1], dz: d[2], px: L.pos ? L.pos[0] : 0, py: L.pos ? L.pos[1] : 0, pz: L.pos ? L.pos[2] : 0, range: L.range || 1, k: L.k == null ? 1 : L.k };
  });
  const nL = LT.length;
  const amb = lin(S.ambient || "#202020"), ambG = lin(S.ground || S.ambient || "#101010");
  const rimOn = S.rim ? 1 : 0;
  const rimC = S.rim ? lin(S.rim.color) : [0, 0, 0], rimK = S.rim ? S.rim.k || 1 : 0, rimX = S.rim ? S.rim.dir[0] : 0, rimY = S.rim ? S.rim.dir[1] : 0, rimP = S.rim ? S.rim.p || 2.5 : 1;
  const rel = S.relief || 1, aoK = S.ao == null ? 0.08 : S.ao;
  const tm = (v) => (v <= 0 ? 0 : Math.pow(v / (1 + v * 0.18), 0.4545) * 278);
  const soft = prims.map((P, i) => (P.fringe > 0 ? 1 : 0));
  for (let y = 0; y < ch; y++) {
    if ((y & 7) === 7) yield;
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      const mi = MI[i];
      if (mi < 0) continue;
      const M = mats[mi];
      const X = (x + 0.5) / rs, Y = (y + 0.5) / rs, h0 = Hm[i];
      const hL = x > 0 && MI[i - 1] >= 0 ? Hm[i - 1] : h0, hR = x < cw - 1 && MI[i + 1] >= 0 ? Hm[i + 1] : h0;
      const hU = y > 0 && MI[i - cw] >= 0 ? Hm[i - cw] : h0, hD = y < ch - 1 && MI[i + cw] >= 0 ? Hm[i + cw] : h0;
      let nx = -(hR - hL) * rs * 0.5 * rel, ny = -(hD - hU) * rs * 0.5 * rel;
      const nl = Math.sqrt(nx * nx + ny * ny + 1);
      nx /= nl; ny /= nl;
      const nz = 1 / nl;
      // albedo: base, toward the tip colour along the primitive, a macro alternate tone, fur value, mottling
      let ar = M.a[0], ag = M.a[1], ab = M.a[2];
      if (M.hasTip) { let k = (TL[i] - M.tipFrom) / (1 - M.tipFrom); k = (k < 0 ? 0 : k > 1 ? 1 : k) * M.tipK; ar += (M.tip[0] - ar) * k; ag += (M.tip[1] - ag) * k; ab += (M.tip[2] - ab) * k; }
      if (M.hasAlt) { let k = vn(X * M.altF + 300, Y * M.altF) * 1.4 + M.altBias; k = (k < 0 ? 0 : k > 1 ? 1 : k) * M.altK; ar += (M.alt[0] - ar) * k; ag += (M.alt[1] - ag) * k; ab += (M.alt[2] - ab) * k; }
      if (M.bars > 0) {
        // tabby bars: dark bands across the limb (wavy, broken), in the primitive's own frame
        const w = Math.sin(TU[i] * M.barsF + vn(TU[i] * 0.02 + 200, TV[i] * 0.03) * 2.2 + TV[i] * 0.012);
        const k = (w > 0.25 ? (w - 0.25) / 0.75 : 0) * M.bars * (0.6 + 0.4 * vn(TU[i] * 0.05 + 230, TV[i] * 0.08));
        ar *= 1 - k; ag *= 1 - k; ab *= 1 - k;
      }
      if (M.fur > 0) { const v = 1 + FN[i] * M.furV; ar *= v; ag *= v; ab *= v; }
      if (M.mott > 0) { const v = 1 + vn(X * 0.09 + 314, Y * 0.09) * M.mott; ar *= v; ag *= v; ab *= v; }
      let ao = (Hb[i] - h0) * aoK * M.aoK;
      ao = ao < 0 ? 0 : ao > 1 ? 1 : ao;
      const occ = 1 - ao * 0.85;
      // hemispherical ambient: sky colour from above (-y), ground bounce from below
      const hk = 0.5 - ny * 0.5;
      let r = (amb[0] * hk + ambG[0] * (1 - hk)) * ar * occ, gg = (amb[1] * hk + ambG[1] * (1 - hk)) * ag * occ, bb = (amb[2] * hk + ambG[2] * (1 - hk)) * ab * occ;
      for (let li = 0; li < nL; li++) {
        const L = LT[li];
        let lx = L.dx, ly = L.dy, lz = L.dz, att = L.k;
        if (!L.isDir) {
          lx = L.px - X; ly = L.py - Y; lz = L.pz - h0;
          const dl = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
          lx /= dl; ly /= dl; lz /= dl;
          const q = dl / L.range;
          att /= 1 + q * q;
        }
        const ndl = nx * lx + ny * ly + nz * lz;
        let dif = (ndl + M.wrap) / (1 + M.wrap);
        dif = (dif < 0 ? 0 : dif) * occ;
        r += L.c[0] * att * dif * ar; gg += L.c[1] * att * dif * ag; bb += L.c[2] * att * dif * ab;
        if (M.sssK > 0) {
          // light bleeding red through thin skin at the terminator (and through the fingertips)
          let s = 1 - Math.abs(ndl + 0.15) * 2.2;
          s = (s < 0 ? 0 : s) * M.sssK * (1 + M.hasTip * TL[i]) * att;
          r += L.c[0] * M.sss[0] * s; gg += L.c[1] * M.sss[1] * s; bb += L.c[2] * M.sss[2] * s;
        }
        if (M.spec > 0) {
          let hx = lx, hy = ly, hz = lz + 1;
          const hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
          const nh = (nx * hx + ny * hy + nz * hz) / hl;
          if (nh > 0) { const sp = Math.pow(nh, M.shin) * M.spec * att * (1 - ao); r += L.c[0] * sp; gg += L.c[1] * sp; bb += L.c[2] * sp; }
        }
      }
      if (rimOn) {
        const fd = nx * rimX + ny * rimY;
        if (fd > 0) { const f = Math.pow(1 - nz, rimP) * fd * rimK * M.rimK; r += rimC[0] * f; gg += rimC[1] * f; bb += rimC[2] * f; }
      }
      const sd = SD[i];
      let cov = soft[PI[i]] || M.fur > 0 ? sd * rs * 0.45 + 0.4 : sd * rs + 0.5;
      cov = cov < 0 ? 0 : cov > 1 ? 1 : cov;
      const o = i * 4;
      D[o] = tm(r); D[o + 1] = tm(gg); D[o + 2] = tm(bb); D[o + 3] = cov * 255;
    }
  }
}
// the same silhouette as a soft dark shadow (blurred once at build time)
function reliefShadow(key, src, blur) {
  const ck = key + ":sh" + blur;
  const hit = RELIEF.get(ck);
  if (hit) return hit;
  const pad = Math.ceil(blur * 2.5);
  const s = src.width / src.lw;
  const c = K.makeCanvas(src.width + pad * 2 * s, src.height + pad * 2 * s);
  const g = c.getContext("2d");
  if (K.hasFilter()) { g.filter = `blur(${K.qblur(blur * s)}px)`; g.drawImage(src, pad * s, pad * s); g.filter = "none"; }
  else { for (let k = 0; k < 9; k++) { g.globalAlpha = 0.14; g.drawImage(src, pad * s + ((k % 3) - 1) * blur * s * 0.6, pad * s + (((k / 3) | 0) - 1) * blur * s * 0.6); } }
  g.globalCompositeOperation = "source-in"; g.globalAlpha = 1; g.fillStyle = "#000"; g.fillRect(0, 0, c.width, c.height);
  c.lw = src.lw + pad * 2; c.lh = src.lh + pad * 2; c.pad = pad;
  RELIEF.set(ck, c);
  return c;
}

// ---- a single monitor (used by the wall, the lab and the close-ups) -----------------------------
// kind: 0 snow, 1 meadow, 2 town, 3 manor, 4 volcano, 5 void, 6 corridor, 7 data
function screen(g, x, y, w, h, kind, t, i, o = {}) {
  if (o.glassOnly) {
    // the CRT glass: a broad soft reflection of the room across the top-left of each tube
    const rg = g.createLinearGradient(x, y, x + w * 0.7, y + h);
    rg.addColorStop(0, "rgba(200,240,230,0.07)"); rg.addColorStop(0.45, "rgba(200,240,230,0.015)"); rg.addColorStop(1, "rgba(200,240,230,0)");
    g.fillStyle = rg; g.fillRect(x, y, w, h);
    scanlines(g, x, y, w, h, 0.35, Math.max(2, h / 30));
    if (o.label && h > 30) hudText(g, "CAM " + pad2(i + 1), x + 4, y + h - 5, Math.max(7, h * 0.11), "left", "#c8ffe0", 0.8);
    return;
  }
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = "#061012";
  g.fillRect(x, y, w, h);
  const jit = o.rewind ? K.noise(t * 30 + i, 9) * w * 0.03 : 0;
  g.translate(jit, 0);
  if (kind === 0) {
    snow(g, x - jit, y, w, h, t, 0.75, i);
  } else if (kind === 1) {
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, "#0d2a35"); gr.addColorStop(1, "#2c5a52");
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = "#e9f5e0"; g.beginPath(); g.arc(x + w * 0.78, y + h * 0.25, h * 0.08, 0, K.TAU); g.fill();
    g.fillStyle = "#14352a";
    g.beginPath(); g.ellipse(x + w * 0.3, y + h * 1.05, w * 0.6, h * 0.45, 0, 0, K.TAU); g.fill();
    g.fillStyle = "#0d261d";
    g.beginPath(); g.ellipse(x + w * 0.85, y + h * 1.1, w * 0.5, h * 0.4, 0, 0, K.TAU); g.fill();
    g.fillStyle = "#3a2018"; g.fillRect(x + w * 0.55, y + h * 0.5, w * 0.16, h * 0.22);
  } else if (kind === 2) {
    g.fillStyle = "#0e1630"; g.fillRect(x, y, w, h);
    const R = K.rng("town" + i);
    for (let b = 0; b < 6; b++) {
      const bx = x + b * w / 6, bh = h * (0.35 + R() * 0.45);
      g.fillStyle = b % 2 ? "#18223e" : "#141c34";
      g.fillRect(bx, y + h - bh, w / 6 + 1, bh);
      for (let k = 0; k < 4; k++) {
        if (R() < 0.5) continue;
        g.fillStyle = R() < 0.3 ? "#ff7ac8" : "#ffd27a";
        g.fillRect(bx + w * 0.03 + R() * w * 0.08, y + h - bh + h * 0.08 + k * h * 0.1, w * 0.025, h * 0.04);
      }
    }
  } else if (kind === 3) {
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, "#1c1030"); gr.addColorStop(1, "#3a2450");
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = "#0c0814";
    poly(g, [[x + w * 0.2, y + h], [x + w * 0.2, y + h * 0.45], [x + w * 0.35, y + h * 0.25], [x + w * 0.5, y + h * 0.42], [x + w * 0.62, y + h * 0.18], [x + w * 0.74, y + h * 0.42], [x + w * 0.8, y + h]]);
    g.fill();
    g.fillStyle = "#ffcf7a"; g.fillRect(x + w * 0.58, y + h * 0.5, w * 0.06, h * 0.08);
  } else if (kind === 4) {
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, "#1a0a08"); gr.addColorStop(1, "#5a1e0c");
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = "#120806";
    poly(g, [[x, y + h], [x + w * 0.4, y + h * 0.3], [x + w * 0.52, y + h * 0.3], [x + w, y + h]]);
    g.fill();
    K.glow(g, x + w * 0.46, y + h * 0.3, h * 0.35, "#ff6a2a", 0.8);
  } else if (kind === 5) {
    g.fillStyle = "#040408"; g.fillRect(x, y, w, h);
    g.strokeStyle = "rgba(60,60,110,0.6)"; g.lineWidth = 0.6;
    g.beginPath();
    for (let k = -4; k <= 4; k++) { g.moveTo(x + w / 2 + k * w * 0.04, y + h * 0.45); g.lineTo(x + w / 2 + k * w * 0.3, y + h); }
    for (let k = 0; k < 4; k++) { const yy = y + h * (0.5 + Math.pow(k / 4, 1.8) * 0.5); g.moveTo(x, yy); g.lineTo(x + w, yy); }
    g.stroke();
  } else if (kind === 6) {
    g.fillStyle = "#24302c"; g.fillRect(x, y, w, h);
    g.fillStyle = "#3a4a44"; poly(g, [[x, y + h], [x + w * 0.4, y + h * 0.5], [x + w * 0.6, y + h * 0.5], [x + w, y + h]]); g.fill();
    g.fillStyle = "#11191a"; g.fillRect(x + w * 0.4, y + h * 0.2, w * 0.2, h * 0.3);
    g.fillStyle = "#c8ffe0"; g.fillRect(x + w * 0.3, y + h * 0.06, w * 0.4, h * 0.03);
  } else if (kind === 8) {
    // a corridor camera (the same tape the film shows later), each at its own crop
    const cx = (i * 37) % 60, cy = (i * 23) % 30;
    g.drawImage(corridorSprite(), cx, cy, 384 - 60, 216 - 30, x, y, w, h);
  } else if (kind === 9) {
    // the meadow IR camera
    g.drawImage(barnSprite(), 20, 20, 960 * IRS - 40, 540 * IRS - 40, x, y, w, h);
    g.save(); g.globalCompositeOperation = "color"; g.fillStyle = "rgba(120,255,170,0.8)"; g.fillRect(x, y, w, h); g.restore();
  } else {
    g.fillStyle = "#04140f"; g.fillRect(x, y, w, h);
    const R = K.rng("data" + i);
    const scroll = (t * 14) % (h * 0.14);
    g.fillStyle = TEAL;
    for (let k = 0; k < 9; k++) {
      const yy = y + h * 0.1 + k * h * 0.14 - scroll;
      g.globalAlpha = 0.55;
      g.fillRect(x + w * 0.08, yy, w * (0.2 + R() * 0.6), h * 0.045);
    }
    g.globalAlpha = 1;
  }
  // every camera has its own white balance (sodium-lit yards warm, LED corridors cool)
  const wb = K.hash(i, 77);
  if (kind !== 0 && kind !== 7) {
    g.globalCompositeOperation = "multiply";
    g.fillStyle = wb < 0.35 ? "#ffd8b0" : wb < 0.7 ? "#c8dcff" : "#e8fff0";
    g.fillRect(x, y, w, h);
    g.globalCompositeOperation = "source-over";
  }
  g.restore();
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  // flicker + rolling band + scanlines + glass falloff
  if (o.rewind) {
    const by = y + (((-t * 1.8 + i * 0.37) % 1 + 1) % 1) * h;
    g.fillStyle = "rgba(230,255,240,0.35)";
    g.fillRect(x, by, w, h * 0.08);
    g.fillStyle = "rgba(240,255,245,0.9)";
    const s = h * 0.13, ax = x + w * 0.1, ay = y + h * 0.12;
    poly(g, [[ax + s, ay], [ax + s, ay + s], [ax + s * 0.4, ay + s / 2]]); g.fill();
    poly(g, [[ax + s * 1.6, ay], [ax + s * 1.6, ay + s], [ax + s, ay + s / 2]]); g.fill();
  } else {
    const by = y + (((t * 0.12 + i * 0.29) % 1 + 1) % 1) * h * 1.3 - h * 0.15;
    g.fillStyle = "rgba(200,255,230,0.06)";
    g.fillRect(x, by, w, h * 0.12);
  }
  scanlines(g, x, y, w, h, 0.5, Math.max(2, h / 22));
  const vg = g.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.2, x + w / 2, y + h / 2, Math.hypot(w, h) * 0.6);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
  g.fillStyle = vg; g.fillRect(x, y, w, h);
  g.globalCompositeOperation = "lighter";
  g.fillStyle = "rgba(90,255,200,0.05)";
  g.fillRect(x, y, w, h);
  g.restore();
  if (o.label && h > 30) hudText(g, "CAM " + pad2(i + 1), x + 4, y + h - 5, Math.max(7, h * 0.11), "left", "#c8ffe0", 0.8);
}
const WALL_KINDS = [8, 1, 7, 2, 9, 6, 4, 3, 8, 5, 1, 0, 7, 8, 6, 9, 4, 8, 3, 7, 1, 6, 5, 8, 2, 0, 7, 4];
// the wall, cached: 4 snow/scroll states cycled at 8 fps (a live 28-screen wall costs ~10 ms)
function wallSprite(t, w, h, label) {
  const f = ((Math.floor(t * 8) % 4) + 4) % 4;
  return K.sprite("f09wall:" + w + "x" + h + ":" + f + (label ? "L" : ""), w, h, (s) => {
    // the feeds are low-resolution security video: paint them at 1/3 size and scale up (soft,
    // no vector edges), wash out the colour, then put the crisp on-screen labels and glass on top
    const k = 3, tmp = K.makeCanvas(Math.ceil(w / k), Math.ceil(h / k)), tg = tmp.getContext("2d");
    tg.scale(1 / k, 1 / k);
    monitorWall(tg, 0, 0, w, h, 30 + f * 0.37, {});
    s.imageSmoothingEnabled = true;
    s.drawImage(tmp, 0, 0, w, h);
    s.save();
    s.globalCompositeOperation = "saturation"; s.globalAlpha = 0.45; s.fillStyle = "#808080"; s.fillRect(0, 0, w, h);
    s.restore();
    monitorWall(s, 0, 0, w, h, 30 + f * 0.37, { label, glassOnly: true });
  });
}
function monitorWall(g, x, y, w, h, t, o = {}) {
  const cols = 7, rows = 4;
  if (!o.glassOnly) { g.fillStyle = "#0a0f12"; g.fillRect(x - w * 0.02, y - h * 0.03, w * 1.04, h * 1.06); }
  const gx = w * 0.012, gy = h * 0.02;
  const cw = (w - gx * (cols - 1)) / cols, ch = (h - gy * (rows - 1)) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const sx = x + c * (cw + gx), sy = y + r * (ch + gy);
      const off = o.flick && K.hash(Math.floor(t * 6) + i * 13, 5) < 0.04;
      if (!o.glassOnly) { g.fillStyle = "#020405"; g.fillRect(sx - gx * 0.5, sy - gy * 0.5, cw + gx, ch + gy); }
      screen(g, sx, sy, cw, ch, off ? 0 : WALL_KINDS[i], t, i, { rewind: o.rewind, label: o.label, glassOnly: o.glassOnly });
    }
  }
}

// ---- SHOT 1 [0-10] slow dolly through the lab ---------------------------------------------------
const FLASKS = [[3.15, 4.2, TEAL], [3.55, 5.4, AMBER], [3.0, 6.9, "#7aff6a"], [3.4, 8.3, TEAL], [3.1, 10.0, AMBER], [3.5, 11.6, TEAL], [3.2, 13.1, "#7aff6a"]];
// kraft corrugated board: brown fibre mottling, the flutes showing through the liner as faint
// parallel ridges, a few scuffs and grime toward the bottom edge
function kraftTex2(seed) {
  return K.texBake("f09kraft2:" + seed, 128, 128, (u, v, out, x, y) => {
    const fl = Math.sin(x * K.TAU / 4) * 0.035;
    const fib = vn(x * 0.9 + seed * 50, y * 0.15) * 0.06 + vn(x * 0.08 + seed * 30, y * 0.08) * 0.1;
    const scuff = Math.max(0, vn(x * 0.05 + 300 + seed * 9, y * 0.05) - 0.45) * 0.5;
    const k = 1 + fl + fib - scuff - Math.pow(v, 6) * 0.25;
    out[0] = 170 * k; out[1] = 126 * k; out[2] = 78 * k; out[3] = 255;
  });
}
function flask(g, sx, sy, s, color, t, i) {
  const h = 0.62 * s, w = 0.36 * s;
  // the lit liquid throws a coloured caustic pool onto the worktop and a faint glow into the haze
  K.lightPool(g, sx, sy, w * 1.6, color, { intensity: 0.45, flat: 0.28 });
  K.shadowBlob(g, sx + w * 0.15, sy, w * 0.5, w * 0.08, { alpha: 0.4 });
  K.glow(g, sx, sy - h * 0.3, h * 0.8, color, 0.12);
  const body = new Path2D();
  body.moveTo(sx - w * 0.12, sy - h);
  body.lineTo(sx - w * 0.12, sy - h * 0.62);
  body.quadraticCurveTo(sx - w * 0.55, sy - h * 0.25, sx - w * 0.5, sy - h * 0.04);
  body.quadraticCurveTo(sx, sy + h * 0.02, sx + w * 0.5, sy - h * 0.04);
  body.quadraticCurveTo(sx + w * 0.55, sy - h * 0.25, sx + w * 0.12, sy - h * 0.62);
  body.lineTo(sx + w * 0.12, sy - h);
  body.closePath();
  g.fillStyle = "rgba(160,200,200,0.12)";
  g.fill(body);
  g.save();
  g.clip(body);
  const lv = sy - h * 0.42;
  const lg = g.createLinearGradient(0, lv, 0, sy);
  lg.addColorStop(0, K.rgba(K.shade(color, 0.4), 0.95));
  lg.addColorStop(1, K.rgba(K.shade(color, -0.35), 0.95));
  g.fillStyle = lg;
  g.fillRect(sx - w, lv, w * 2, h);
  // the round flask is a lens: the liquid is brighter through its middle and darker at the walls,
  // and the room behind shows through upside down (a dark band low, a light band high)
  const rf = g.createLinearGradient(sx - w * 0.55, 0, sx + w * 0.55, 0);
  rf.addColorStop(0, "rgba(0,0,0,0.5)"); rf.addColorStop(0.3, "rgba(0,0,0,0)"); rf.addColorStop(0.55, "rgba(255,255,255,0.12)"); rf.addColorStop(0.8, "rgba(0,0,0,0.05)"); rf.addColorStop(1, "rgba(0,0,0,0.55)");
  g.fillStyle = rf; g.fillRect(sx - w, lv, w * 2, h);
  g.fillStyle = "rgba(0,8,8,0.25)"; g.fillRect(sx - w, sy - h * 0.16, w * 2, h * 0.05);
  g.fillStyle = "rgba(255,255,255,0.75)";
  for (let b = 0; b < 6; b++) {
    const ph = (t * (0.5 + K.hash(b, i) * 0.6) + K.hash(b + 3, i)) % 1;
    const bx = sx + (K.hash(b + 7, i) - 0.5) * w * 0.6 + Math.sin(ph * 9 + b) * w * 0.04;
    const by = K.lerp(sy - h * 0.05, lv, ph);
    g.beginPath(); g.arc(bx, by, Math.max(0.4, s * 0.012 * (0.5 + K.hash(b, 2))), 0, K.TAU); g.fill();
  }
  g.restore();
  g.strokeStyle = "rgba(220,255,245,0.45)";
  g.lineWidth = Math.max(0.5, s * 0.008);
  g.stroke(body);
  g.strokeStyle = "rgba(255,255,255,0.5)";
  g.beginPath(); g.moveTo(sx - w * 0.3, sy - h * 0.3); g.lineTo(sx - w * 0.38, sy - h * 0.1); g.stroke();
  // meniscus: the liquid surface seen slightly from above (an ellipse), climbing the glass at its
  // edges (a bright rim), lighter than the body below
  const mw = w * 0.4, mh = Math.max(0.8, w * 0.07);
  g.fillStyle = K.rgba(K.mix(color, "#ffffff", 0.35), 0.55);
  g.beginPath(); g.ellipse(sx, lv, mw, mh, 0, 0, K.TAU); g.fill();
  g.strokeStyle = K.rgba(K.mix(color, "#ffffff", 0.75), 0.75); g.lineWidth = Math.max(0.6, s * 0.006);
  g.beginPath(); g.ellipse(sx, lv, mw, mh, 0, 0, Math.PI); g.stroke();
  // caustic: the flask focuses its own glow into a small hot spot on the worktop in front of it
  g.save(); g.globalCompositeOperation = "lighter"; g.translate(sx - w * 0.1, sy + w * 0.12); g.scale(1, 0.32);
  K.glow(g, 0, 0, w * 0.32, K.mix(color, "#ffffff", 0.4), 0.5);
  g.restore();
}
function shotLab(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, -0.5, 11));
  const cam = { x: K.lerp(-0.35, 0.05, p), y: K.lerp(-0.05, -0.2, p), z: K.lerp(0, 4.4, p) };
  const F = 430, CX = 480, CY = 280;
  const P = (x, y, z) => { const d = Math.max(0.06, z - cam.z); const s = F / d; return [CX + (x - cam.x) * s, CY + (y - cam.y) * s, s, d]; };
  const zn = cam.z + 0.3, ZF = 17, FY = 1.6, CYL = -2.6;
  g.fillStyle = "#070b0d";
  g.fillRect(0, 0, W, H);
  const q = (a) => a.map((v) => P(v[0], v[1], v[2]));
  // light reaching depth z: the ceiling strips (every 3 m) + the monitor wall at the far end
  const lightAt = (z) => {
    let L = 0.12 + 0.75 * Math.exp(-(ZF - z) / 3.2);
    for (let zs = 2.5; zs < ZF; zs += 3) L += 0.42 / (1 + ((z - zs - 0.3) / 1.5) ** 2);
    return L;
  };
  const dark = (col, k) => (v0, v1) => { const z = zn + ((v0 + v1) / 2) * (ZF - zn); return K.rgba(col, K.clamp(k * (1 - lightAt(z)), 0, 0.92)); };
  // ceiling (dark painted steel), side walls (brushed steel panels), floor (polished concrete)
  texQuad(g, P, "metal", { color: "#3c464b", seed: 4 }, [-4, CYL, zn], [8, 0, 0], [0, 0, ZF - zn], 14, [2, 1.5], dark("#05090b", 1.05), 1.8);
  texQuad(g, P, "plaster", { color: "#6a7a80", grime: "#2a3436", stain: 0.5, seed: 2 }, [-4, CYL, zn], [0, FY - CYL, 0], [0, 0, ZF - zn], 16, [2.1, 3], dark("#060b0d", 1.25), 1.8, true);
  texQuad(g, P, "plaster", { color: "#64747a", grime: "#2a3436", stain: 0.5, seed: 3 }, [4, CYL, zn], [0, FY - CYL, 0], [0, 0, ZF - zn], 16, [2.1, 3], dark("#060b0d", 1.25), 1.8, true);
  texQuad(g, P, "plaster", { color: "#56625f", grime: "#1e2624", stain: 0.6, seed: 6 }, [-4, FY, zn], [8, 0, 0], [0, 0, ZF - zn], 18, [2.4, 2.4], dark("#04090a", 1.0), 1.8);
  // the floor slabs: saw-cut joints every 2 m (thin, dark, converging)
  g.strokeStyle = "rgba(4,8,9,0.45)"; g.lineWidth = 1;
  g.beginPath();
  for (let z = Math.ceil(zn / 2) * 2; z <= ZF; z += 2) { const a = P(-4, FY, z), b = P(4, FY, z); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
  for (let x = -2; x <= 2; x += 2) { const a = P(x, FY, zn), b = P(x, FY, ZF); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
  g.stroke();
  // the walls are lit from above: a vertical falloff from the ceiling strips down to the floor
  for (const sx of [-4, 4]) {
    const top = P(sx, CYL, zn + 2), bot = P(sx, FY, zn + 2);
    const wg = g.createLinearGradient(0, top[1], 0, bot[1]);
    wg.addColorStop(0, "rgba(4,8,9,0.45)"); wg.addColorStop(0.25, "rgba(4,8,9,0)"); wg.addColorStop(0.7, "rgba(4,8,9,0.1)"); wg.addColorStop(1, "rgba(4,8,9,0.55)");
    g.fillStyle = wg;
    poly(g, q([[sx, CYL, zn], [sx, CYL, ZF], [sx, FY, ZF], [sx, FY, zn]])); g.fill();
  }
  // floor: brighter down the middle under the light strips, falling off toward the walls
  {
    const a = P(-4, FY, zn + 1.5), b = P(4, FY, zn + 1.5);
    const fg = g.createLinearGradient(a[0], 0, b[0], 0);
    fg.addColorStop(0, "rgba(3,7,8,0.6)"); fg.addColorStop(0.32, "rgba(3,7,8,0.05)"); fg.addColorStop(0.68, "rgba(3,7,8,0.05)"); fg.addColorStop(1, "rgba(3,7,8,0.6)");
    g.fillStyle = fg;
    poly(g, q([[-4, FY, zn], [4, FY, zn], [4, FY, ZF], [-4, FY, ZF]])); g.fill();
  }
  // wall ribs (structural frames): a dark recess + a lit leading edge, and the amber warning lights
  for (let z = 2; z < ZF; z += 1.5) {
    if (z < zn + 0.05) continue;
    const fade = K.clamp(1 - (z - cam.z) / 20);
    for (const sx of [-4, 4]) {
      const sd = sx < 0 ? 1 : -1;
      poly(g, q([[sx, CYL, z], [sx + sd * 0.12, CYL, z], [sx + sd * 0.12, FY, z], [sx, FY, z]]));
      g.fillStyle = K.rgba("#2a3438", 0.9 * fade + 0.1); g.fill();
      poly(g, q([[sx + sd * 0.12, CYL, z], [sx + sd * 0.12, CYL, z + 0.05], [sx + sd * 0.12, FY, z + 0.05], [sx + sd * 0.12, FY, z]]));
      g.fillStyle = K.rgba("#9ab4b4", K.clamp(0.22 * fade * lightAt(z))); g.fill();
      if (Math.round(z / 1.5) % 3 === 0) {
        const l = P(sx * 0.97, -1.4, z + 0.2);
        const pulse = 0.55 + 0.45 * Math.sin(t * 3 + z);
        K.lightPool(g, l[0], l[1], l[2] * 0.6, AMBER, { intensity: 0.35 * pulse, flat: 1.4 });
        g.fillStyle = K.mix(AMBER, "#fff6d8", 0.5 * pulse);
        g.fillRect(l[0] - l[2] * 0.03, l[1] - l[2] * 0.02, l[2] * 0.06, l[2] * 0.04);
      }
    }
  }
  // ambient occlusion where the walls meet the floor and the ceiling
  for (const sx of [-4, 4]) {
    const a = P(sx, FY, zn + 0.01), b = P(sx, FY, ZF), c = P(sx, CYL, zn + 0.01), d = P(sx, CYL, ZF);
    K.aoEdge(g, a[0], a[1], b[0], b[1], { width: 26, alpha: 0.55, side: 0 });
    K.aoEdge(g, c[0], c[1], d[0], d[1], { width: 22, alpha: 0.5, side: 0 });
  }
  // far wall + the monitor wall
  const fw0 = P(-4, CYL, ZF), fw1 = P(4, FY, ZF);
  g.fillStyle = "#0d1619";
  g.fillRect(fw0[0], fw0[1], fw1[0] - fw0[0], fw1[1] - fw0[1]);
  const m0 = P(-3.4, -2.15, ZF), m1 = P(3.4, 0.95, ZF);
  const mw = m1[0] - m0[0], mh = m1[1] - m0[1];
  const MS = wallSprite(t, 280, 128, false);
  g.drawImage(MS, m0[0], m0[1], mw, mh);
  // the screens light the far end of the room (scattered in the haze)
  K.lightPool(g, (m0[0] + m1[0]) / 2, (m0[1] + m1[1]) / 2, mw * 1.2, TEAL, { intensity: 0.28, flat: 0.75 });
  {
    // the wall's mirror image in the wet, polished floor: flipped about the floor line, smeared and
    // faded with distance (drawn twice, offset, as a cheap vertical blur), plus a soft bloom pool
    const fy = P(0, FY, ZF)[1];
    g.save();
    g.globalCompositeOperation = "lighter";
    g.translate(0, fy * 2);
    g.scale(1, -1);
    for (const [dy, a] of [[0, 0.26], [6, 0.14], [14, 0.08]]) {
      g.globalAlpha = a;
      g.drawImage(MS, m0[0], m0[1] - dy, mw, mh * 1.25);
    }
    g.restore();
    g.save(); g.translate((m0[0] + m1[0]) / 2, fy + mh * 0.35); g.scale(1, 0.35);
    K.glow(g, 0, 0, mw * 0.9, TEAL, 0.35);
    g.restore();
  }
  // wet floor reflection of the monitor wall
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let c = 0; c < 7; c++) {
    const xw = -3.4 + (c + 0.5) * (6.8 / 7);
    const a = P(xw, FY, ZF), b = P(xw, FY, zn + 1.2);
    const gr = g.createLinearGradient(0, a[1], 0, b[1]);
    const col = WALL_KINDS[c + 21] === 4 ? "#ff8a4a" : TEAL;
    gr.addColorStop(0, K.rgba(col, 0.1)); gr.addColorStop(0.5, K.rgba(col, 0.04)); gr.addColorStop(1, K.rgba(col, 0));
    g.fillStyle = gr;
    const w0 = a[2] * 0.6, w1 = b[2] * 0.35;
    poly(g, [[a[0] - w0, a[1]], [a[0] + w0, a[1]], [b[0] + w1, b[1]], [b[0] - w1, b[1]]]);
    g.fill();
  }
  g.restore();
  // haze over the far half (atmospheric perspective)
  const hz = g.createRadialGradient((m0[0] + m1[0]) / 2, (m0[1] + m1[1]) / 2, 10, (m0[0] + m1[0]) / 2, (m0[1] + m1[1]) / 2, 520);
  hz.addColorStop(0, "rgba(40,90,85,0.28)"); hz.addColorStop(1, "rgba(10,25,28,0.0)");
  g.fillStyle = hz; g.fillRect(0, 0, W, H);
  // ceiling pipes
  for (const [px, py, r] of [[-3.2, -2.3, 0.14], [-2.75, -2.38, 0.09], [2.9, -2.32, 0.16], [1.2, -2.48, 0.06]]) {
    const a0 = P(px, py - r, zn), a1 = P(px, py + r, zn), b0 = P(px, py - r, ZF), b1 = P(px, py + r, ZF);
    poly(g, [a0, b0, b1, a1]);
    const gr = g.createLinearGradient(a0[0], a0[1], a1[0], a1[1]);
    gr.addColorStop(0, "#3a474e"); gr.addColorStop(0.4, "#1c2428"); gr.addColorStop(1, "#0b1012");
    g.fillStyle = gr; g.fill();
  }
  // ceiling light strips + pools of light on the floor
  for (let z = 2.5; z < ZF; z += 3) {
    if (z < zn + 0.2) continue;
    const a = P(-1, CYL + 0.05, z), b = P(1, CYL + 0.05, z);
    const f = P(0, FY, z);
    g.save();
    g.translate(f[0], f[1]);
    g.scale(1, 0.22);
    K.glow(g, 0, 0, f[2] * 1.7, "#9fffe0", 0.25);
    g.restore();
    // the fixture: a recessed steel housing (dark, a lit inner lip) round a frosted diffuser panel
    // 2 m x 0.5 m; the diffuser is brightest in its middle (the tubes behind it)
    const h0 = q([[-1.08, CYL, z - 0.3], [1.08, CYL, z - 0.3], [1.08, CYL, z + 0.3], [-1.08, CYL, z + 0.3]]);
    poly(g, h0); g.fillStyle = "#0c1214"; g.fill();
    const d0 = q([[-1, CYL + 0.02, z - 0.24], [1, CYL + 0.02, z - 0.24], [1, CYL + 0.02, z + 0.24], [-1, CYL + 0.02, z + 0.24]]);
    poly(g, d0);
    const dg = g.createLinearGradient(0, d0[0][1], 0, d0[3][1]);
    dg.addColorStop(0, "#9ad8c8"); dg.addColorStop(0.5, "#f4fffa"); dg.addColorStop(1, "#a8e4d4");
    g.fillStyle = dg; g.fill();
    // the near lip of the housing catches the light from the diffuser
    poly(g, [h0[3], h0[2], d0[2], d0[3]]); g.fillStyle = "rgba(170,220,210,0.35)"; g.fill();
    K.glow(g, (a[0] + b[0]) / 2, a[1], a[2] * 0.9, "#bfffe8", 0.3);
    // its long specular reflection in the polished, slightly damp floor (toward the camera)
    if (f[1] < H + 40) K.reflectStreak(g, f[0], f[1], Math.min(260, f[2] * 0.9), "#bfffe8", 0.22, { t: 0, width: f[2] * 0.5 });
  }
  // objects, far to near: right bench with flasks, left conveyor with crates, vents, the cable
  const near = [];
  const benchZ0 = Math.max(2.2, zn), benchZ1 = 14;
  if (benchZ1 > zn) {
    const top = q([[2.4, 0.3, benchZ0], [4, 0.3, benchZ0], [4, 0.3, benchZ1], [2.4, 0.3, benchZ1]]);
    const bz = (v0, v1) => benchZ0 + ((v0 + v1) / 2) * (benchZ1 - benchZ0);
    // stainless worktop (reflects the strips) over a cabinet front of painted steel doors
    texQuad(g, P, "plaster", { color: "#3a4446", grime: "#121819", stain: 0.3, seed: 8 }, [2.4, 0.3, benchZ0], [1.6, 0, 0], [0, 0, benchZ1 - benchZ0], 10, [1.2, 2.4], (a, b) => K.rgba("#05090a", K.clamp(0.95 - lightAt(bz(a, b)), 0.1, 0.85)), 1.6, true);
    texQuad(g, P, "plaster", { color: "#3a4848", grime: "#161e1e", stain: 0.4, seed: 9 }, [2.4, 0.3, benchZ0], [0, FY - 0.3, 0], [0, 0, benchZ1 - benchZ0], 10, [1.3, 2], (a, b) => K.rgba("#05090a", K.clamp(1.05 - lightAt(bz(a, b)), 0.2, 0.9)), 1.6, true);
    // cabinet door seams + recessed toe kick
    g.fillStyle = "rgba(3,6,7,0.7)";
    for (let z = Math.ceil(benchZ0 / 0.9) * 0.9; z < benchZ1; z += 0.9) { poly(g, q([[2.4, 0.38, z], [2.4, 0.38, z + 0.025], [2.4, FY - 0.14, z + 0.025], [2.4, FY - 0.14, z]])); g.fill(); }
    poly(g, q([[2.4, FY - 0.12, benchZ0], [2.4, FY - 0.12, benchZ1], [2.4, FY, benchZ1], [2.4, FY, benchZ0]])); g.fillStyle = "#030506"; g.fill();
    // the worktop edge catches the strip lights: a thin bright nosing
    poly(g, q([[2.4, 0.3, benchZ0], [2.4, 0.3, benchZ1], [2.4, 0.34, benchZ1], [2.4, 0.34, benchZ0]])); g.fillStyle = "rgba(190,230,222,0.4)"; g.fill();
    { const a = P(2.4, FY, benchZ0), b = P(2.4, FY, benchZ1); K.aoEdge(g, a[0], a[1], b[0], b[1], { width: 18, alpha: 0.6, side: 0 }); }
  }
  const convZ0 = Math.max(1.5, zn), convZ1 = 15;
  {
    const cz = (v0, v1) => convZ0 + ((v0 + v1) / 2) * (convZ1 - convZ0);
    // black rubber belt (scrolls with t) on a steel frame
    texQuad(g, P, "asphalt", { color: "#2a2d2e", seed: 12 }, [-4, 0.5, convZ0 - ((t * 0.9) % 1.2)], [1.4, 0, 0], [0, 0, convZ1 - convZ0], 10, [0.9, 1.2], (a, b) => K.rgba("#020304", K.clamp(0.9 - lightAt(cz(a, b)), 0.15, 0.85)), 1.6);
    texQuad(g, P, "plaster", { color: "#454e52", grime: "#161e1e", stain: 0.5, seed: 13 }, [-2.6, 0.5, convZ0], [0, FY - 0.5, 0], [0, 0, convZ1 - convZ0], 10, [1.1, 2], (a, b) => K.rgba("#040708", K.clamp(1.0 - lightAt(cz(a, b)), 0.25, 0.9)), 1.6, true);
    const face = q([[-2.6, 0.5, convZ0], [-2.6, 0.5, convZ1], [-2.6, FY, convZ1], [-2.6, FY, convZ0]]);
    // a painted amber safety edge along the frame lip
    poly(g, q([[-2.6, 0.5, convZ0], [-2.6, 0.5, convZ1], [-2.6, 0.56, convZ1], [-2.6, 0.56, convZ0]])); g.fillStyle = "rgba(170,120,10,0.55)"; g.fill();
    { const a = P(-2.6, FY, convZ0), b = P(-2.6, FY, convZ1); K.aoEdge(g, a[0], a[1], b[0], b[1], { width: 18, alpha: 0.6, side: 0 }); }
    void face;
    g.strokeStyle = "rgba(120,150,150,0.4)"; g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < 40; i++) {
      const z = convZ0 + ((i * 0.4 - t * 0.9) % 14 + 14) % 14;
      if (z > convZ1 || z < zn) continue;
      const a = P(-3.95, 0.5, z), b = P(-2.65, 0.5, z);
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    }
    g.stroke();
    for (let z = Math.ceil(convZ0 * 2) / 2; z < convZ1; z += 0.5) {
      if (z < zn + 0.1) continue;
      const r = P(-2.6, 0.58, z);
      const rr = Math.max(1, r[2] * 0.07);
      if (r[0] < -20 || r[0] > W + 20) continue;
      g.fillStyle = K.mix("#4a5559", "#0c1216", K.clamp((z - cam.z) / 16) * 0.7);
      g.beginPath(); g.ellipse(r[0], r[1], rr * 0.55, rr, 0, 0, K.TAU); g.fill();
      if (rr > 2) {
        const a = t * 6 + z * 3;
        g.strokeStyle = "rgba(200,230,225,0.45)"; g.lineWidth = Math.max(0.6, rr * 0.18);
        g.beginPath(); g.moveTo(r[0] - Math.cos(a) * rr * 0.5, r[1] - Math.sin(a) * rr * 0.9); g.lineTo(r[0] + Math.cos(a) * rr * 0.5, r[1] + Math.sin(a) * rr * 0.9); g.stroke();
      }
    }
  }
  const objs = [];
  for (let i = 0; i < 6; i++) {
    const z = 2 + ((i * 2.3 - t * 0.9) % 13.8 + 13.8) % 13.8;
    objs.push({ z, kind: "crate", i });
  }
  FLASKS.forEach((f, i) => objs.push({ z: f[1], kind: "flask", i }));
  objs.push({ z: 9, kind: "vent", x: -1.3 }, { z: 5.6, kind: "vent", x: 1.7 }, { z: 12.5, kind: "vent", x: 0.4 }, { z: 7, kind: "cable" });
  objs.sort((a, b) => b.z - a.z);
  const drawObj = (gg, o) => {
    if (o.z < zn + 0.05) return;
    if (o.kind === "crate") {
      const z = o.z, s = 0.55, x0 = -3.6, x1 = -3.6 + s * 1.3, y0 = 0.5 - s, y1 = 0.5;
      const hz = K.clamp((z - cam.z) / 16) * 0.65;          // atmospheric falloff toward the far wall
      const CB = { color: "#a07a4c", grime: "#5a4026", stain: 0.5, seed: 11 + (o.i % 3) };
      const F = [P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)];
      const T = [P(x0, y0, z), P(x1, y0, z), P(x1, y0, z + s), P(x0, y0, z + s)];
      const S = [P(x1, y0, z), P(x1, y0, z + s), P(x1, y1, z + s), P(x1, y1, z)];
      // contact shadow on the belt, offset away from the strip light above-right
      const cs = P((x0 + x1) / 2 + 0.06, y1, z + s * 0.55);
      K.shadowBlob(gg, cs[0], cs[1], cs[2] * 0.5, cs[2] * 0.09, { alpha: 0.75 * (1 - hz) });
      // corrugated board on every face: right side in shadow, top lit by the strips, front mid
      const L = Math.min(1, 0.45 + 0.6 * Math.exp(-Math.min(...[2.5, 5.5, 8.5, 11.5, 14.5].map((zs) => Math.abs(z - zs))) / 1.4));
      texQuad(gg, P, kraftTex2(o.i % 3), CB, [x1, y0, z], [0, y1 - y0, 0], [0, 0, s], 1, [0.6, 0.6], () => K.rgba("#140a04", 0.62 - 0.2 * L));
      texQuad(gg, P, kraftTex2(o.i % 3), CB, [x0, y0, z], [x1 - x0, 0, 0], [0, 0, s], 1, [0.6, 0.6], () => K.rgba("#140a04", 0.3 - 0.3 * L));
      texQuad(gg, P, kraftTex2(o.i % 3), CB, [x0, y0, z], [x1 - x0, 0, 0], [0, y1 - y0, 0], 1, [0.6, 0.6], () => K.rgba("#140a04", 0.45 - 0.25 * L));
      // the front face darkens toward the belt (occlusion), the top's far edge catches the light
      const fg2 = gg.createLinearGradient(0, F[0][1], 0, F[3][1]);
      fg2.addColorStop(0, "rgba(20,10,4,0)"); fg2.addColorStop(1, "rgba(20,10,4,0.45)");
      poly(gg, F); gg.fillStyle = fg2; gg.fill();
      // edge darkening: cardboard edges are crushed and grubby (soft dark bands along each face edge)
      gg.save(); gg.lineJoin = "round";
      gg.strokeStyle = K.rgba("#140a04", 0.35); gg.lineWidth = Math.max(1, F[1][0] - F[0][0]) * 0.06;
      poly(gg, F); gg.stroke(); poly(gg, T); gg.stroke();
      gg.restore();
      // packing tape: along the top seam and down the front, slightly glossy
      const mid = (p, q, u) => [K.lerp(p[0], q[0], u), K.lerp(p[1], q[1], u)];
      gg.fillStyle = K.rgba("#c8b07a", 0.55);
      poly(gg, [mid(T[0], T[1], 0.44), mid(T[0], T[1], 0.56), mid(T[3], T[2], 0.56), mid(T[3], T[2], 0.44)]); gg.fill();
      poly(gg, [mid(F[0], F[1], 0.44), mid(F[0], F[1], 0.56), mid(F[3], F[2], 0.56), mid(F[3], F[2], 0.44)]); gg.fill();
      gg.fillStyle = K.rgba("#f0f8f4", 0.12 * L);
      poly(gg, [mid(T[0], T[1], 0.46), mid(T[0], T[1], 0.5), mid(T[3], T[2], 0.5), mid(T[3], T[2], 0.46)]); gg.fill();
      // shipping label, off-white paper, a little grey in this light
      const L0 = mid(F[0], F[2], 0.18), L1 = mid(F[0], F[2], 0.34);
      gg.fillStyle = K.rgba("#b8bcb4", 0.75);
      gg.fillRect(L0[0], L0[1] + (F[3][1] - F[0][1]) * 0.25, (L1[0] - L0[0]) * 0.9, (F[3][1] - F[0][1]) * 0.2);
      // haze toward the far end
      if (hz > 0.02) {
        gg.fillStyle = K.rgba("#0e1b1c", hz);
        gg.beginPath(); gg.moveTo(F[0][0], F[0][1]); gg.lineTo(T[3][0], T[3][1]); gg.lineTo(T[2][0], T[2][1]); gg.lineTo(S[2][0], S[2][1]); gg.lineTo(F[2][0], F[2][1]); gg.lineTo(F[3][0], F[3][1]); gg.closePath(); gg.fill();
      }
    } else if (o.kind === "flask") {
      const f = FLASKS[o.i];
      const pp = P(f[0], 0.3, f[1]);
      flask(gg, pp[0], pp[1], pp[2], f[2], t, o.i);
    } else if (o.kind === "vent") {
      const v = P(o.x, FY, o.z);
      gg.save(); gg.translate(v[0], v[1]); gg.scale(1, 0.25);
      gg.fillStyle = "rgba(5,9,10,0.55)"; gg.fillRect(-v[2] * 0.3, -v[2] * 0.3, v[2] * 0.6, v[2] * 0.6);
      gg.fillStyle = "rgba(120,170,165,0.25)";
      for (let k = -2; k <= 2; k++) gg.fillRect(-v[2] * 0.3, k * v[2] * 0.11 - v[2] * 0.01, v[2] * 0.6, v[2] * 0.03);
      gg.restore();
      const spr = K.glowSprite("#b9d3d0");
      gg.save();
      for (let i = 0; i < 16; i++) {
        const age = ((t * 0.38 + i / 16 + o.x) % 1 + 1) % 1;
        const wp = P(o.x + K.noise(t * 0.6 + i * 3, 4) * 0.45 * age + age * 0.25, FY - age * 3.6, o.z);
        const r = wp[2] * (0.18 + age * 0.85);
        gg.globalAlpha = Math.sin(Math.pow(age, 0.6) * Math.PI) * 0.55;
        gg.drawImage(spr, wp[0] - r, wp[1] - r, r * 2, r * 2);
      }
      // the plume catches the ceiling light: a brighter core near the grate
      const vb = P(o.x, FY - 0.4, o.z);
      K.glow(gg, vb[0], vb[1], vb[2] * 0.5, "#dff6f2", 0.25);
      gg.restore();
    } else if (o.kind === "cable") {
      // a loose power cable hanging out of the ceiling cable tray: it drops in a catenary loop
      // (sagging under its own weight) and the cut, frayed end sparks
      const a = P(1.9, CYL + 0.05, o.z + 0.2), b = P(1.35, -0.85, o.z - 0.2);
      const pts = [];
      for (let k = 0; k <= 14; k++) {
        const u = k / 14;
        const wx = K.lerp(1.9, 1.35, u), wz = K.lerp(o.z + 0.2, o.z - 0.2, u);
        // catenary-like hang: a cosh sag below the straight chord, deepest near the end
        const wy = K.lerp(CYL + 0.05, -0.85, Math.pow(u, 0.62)) + 0.35 * Math.sin(u * Math.PI) * (1 - u * 0.4);
        pts.push(P(wx, wy, wz));
      }
      const lw = Math.max(1.5, a[2] * 0.045);
      gg.lineCap = "round"; gg.lineJoin = "round";
      gg.strokeStyle = "#060808"; gg.lineWidth = lw;
      gg.beginPath(); pts.forEach((v, k) => (k ? gg.lineTo(v[0], v[1]) : gg.moveTo(v[0], v[1]))); gg.stroke();
      // a thin specular down the rubber jacket from the strip lights
      gg.strokeStyle = "rgba(170,220,210,0.35)"; gg.lineWidth = Math.max(0.6, lw * 0.22);
      gg.beginPath(); pts.forEach((v, k) => (k ? gg.lineTo(v[0] - lw * 0.25, v[1] - lw * 0.1) : gg.moveTo(v[0] - lw * 0.25, v[1]))); gg.stroke();
      // the tray it falls from: a steel channel along the ceiling by the wall
      const t0 = P(1.75, CYL + 0.02, zn + 0.1), t1 = P(2.05, CYL + 0.02, zn + 0.1), t2 = P(2.05, CYL + 0.02, ZF), t3 = P(1.75, CYL + 0.02, ZF);
      poly(gg, [t0, t1, t2, t3]); gg.fillStyle = "rgba(40,52,56,0.9)"; gg.fill();
      const e0 = P(1.75, CYL + 0.1, zn + 0.1), e1 = P(1.75, CYL + 0.1, ZF);
      poly(gg, [t0, t3, e1, e0]); gg.fillStyle = "rgba(150,190,185,0.3)"; gg.fill();
      // copper strands at the frayed end
      gg.strokeStyle = "#b8743a"; gg.lineWidth = Math.max(0.6, lw * 0.18);
      gg.beginPath();
      for (let k = 0; k < 5; k++) { const an = Math.PI / 2 + (k - 2) * 0.35; gg.moveTo(b[0], b[1]); gg.lineTo(b[0] + Math.cos(an) * lw * 1.6, b[1] + Math.sin(an) * lw * 1.6); }
      gg.stroke();
      // sparks: bursts every 1.7 s, ballistic, pure in t
      // always smouldering: a flickering hot point at the frayed end
      K.glow(gg, b[0], b[1], b[2] * 0.35, "#ffd27a", 0.35 + 0.35 * K.hash(Math.floor(t * 14), 6));
      for (let k = 0; k < 2; k++) {
        const tb = (Math.floor(t / 1.1) - k) * 1.1 + K.hash(Math.floor(t / 1.1) - k, 2) * 0.3;
        const age = t - tb;
        if (age < 0 || age > 1) continue;
        const fl = Math.exp(-age * 9);
        K.glow(gg, b[0], b[1], b[2] * 1.6, "#ffd27a", 0.7 * fl);
        const fp = P(1.35, FY, o.z - 0.2);
        gg.save(); gg.translate(fp[0], fp[1]); gg.scale(1, 0.2); K.glow(gg, 0, 0, fp[2] * 1.3, "#ffb000", 0.5 * fl); gg.restore();
        gg.lineCap = "round";
        for (let i = 0; i < 16; i++) {
          const seed = Math.floor(tb * 10) + i * 1.7;
          const vx = (K.hash(seed, 1) - 0.5) * 2.4, vy = -0.4 - K.hash(seed, 2) * 1.6;
          const life = 0.45 + K.hash(seed, 3) * 0.5;
          if (age > life) continue;
          const pos = (aa) => P(1.35 + vx * aa, -0.85 + vy * aa + 4.9 * aa * aa, o.z - 0.2);
          const p1 = pos(age), p0 = pos(Math.max(0, age - 0.035));
          gg.strokeStyle = K.rgba(K.mix("#fff6d0", AMBER, age / life), 1 - age / life);
          gg.lineWidth = Math.max(0.8, p1[2] * 0.012);
          gg.beginPath(); gg.moveTo(p0[0], p0[1]); gg.lineTo(p1[0], p1[1]); gg.stroke();
        }
      }
    }
  };
  for (const o of objs) {
    if (o.z - cam.z < 2.1) near.push(o);
    else drawObj(g, o);
  }
  if (near.length) {
    const L = K.blurLayer(W, H, "f09near", 5, (lg) => { for (const o of near) drawObj(lg, o); });
    K.dof(g, L.canvas, 5);
  }
  K.dust(g, W, H, t, { seed: 91, count: 46, color: "#bfffe8", size: 1.4, alpha: 0.45 });
}

// ---- SHOT 2 [10-17.2] over your shoulder at the monitor wall ------------------------------------
function kidSilhouette(g, W, H, x, y, h, t, light, o = {}) {
  const L = K.layer(W, H, "f09kid");
  K.drawPerson(L.g, x, y, h, Object.assign({ view: "back", t, light, shadow: false, bell: true }, o));
  L.g.globalCompositeOperation = "source-atop";
  const gr = L.g.createLinearGradient(0, y - h, 0, y);
  gr.addColorStop(0, `rgba(4,12,14,${o.dark0 == null ? 0.7 : o.dark0})`);
  gr.addColorStop(1, `rgba(2,6,8,${o.dark1 == null ? 0.9 : o.dark1})`);
  L.g.fillStyle = gr;
  L.g.fillRect(0, 0, W, H);
  // the yellow hoodie keeps a little of its own warmth under the cold key (it must still read yellow
  // after the green grade): a soft warm lift across the shoulders
  const wl = L.g.createRadialGradient(x, y - h * 0.68, h * 0.04, x, y - h * 0.62, h * 0.42);
  wl.addColorStop(0, `rgba(232,185,35,${o.warm == null ? 0.3 : o.warm})`);
  wl.addColorStop(1, "rgba(232,185,35,0)");
  L.g.fillStyle = wl;
  L.g.fillRect(0, 0, W, H);
  L.g.globalCompositeOperation = "source-over";
  g.drawImage(L.canvas, 0, 0, W, H);
  // rim: the silhouette minus itself shifted away from the light, tinted with the light colour,
  // then drawn BLURRED so it is a soft wrap of light, not an outline
  if (light) {
    const R = K.layer(W, H, "f09kidrim");
    K.drawPerson(R.g, x, y, h, Object.assign({ view: "back", t, light, shadow: false, bell: true }, o));
    const dx = x - light.x, dy = (y - h * 0.6) - light.y, dl = Math.hypot(dx, dy) || 1;
    const k = Math.min(6, h * 0.0045);
    R.g.setTransform(1, 0, 0, 1, 0, 0);
    R.g.globalCompositeOperation = "destination-out";
    R.g.drawImage(R.canvas, (dx / dl) * k * K.pixelScale(), (dy / dl) * k * K.pixelScale());
    R.g.globalCompositeOperation = "source-atop";
    R.g.fillStyle = light.color;
    R.g.fillRect(0, 0, R.canvas.width, R.canvas.height);
    g.save();
    g.globalCompositeOperation = "lighter";
    K.dof(g, R.canvas, Math.max(1.6, k * 0.9), 0.7 * (o.rimA || 1));
    g.globalAlpha = 0.25 * (o.rimA || 1);
    g.drawImage(R.canvas, 0, 0, W, H);
    g.restore();
  }
}
// you, from behind, as a real backlit figure: the kit person, then cotton-fleece texture and a
// top-to-bottom falloff painted INTO the silhouette (source-atop), so the hoodie reads as cloth
function kidBack(g, W, H, x, y, h, t, light, o = {}, darkK = 0.5) {
  // work only in the figure's bounding box (layer sizes snapped to 32 px so they are not
  // reallocated every frame as the figure moves): the full-frame version cost ~10 ms
  const bx0 = Math.max(-8, Math.floor(x - h * 0.62)), by0 = Math.max(-8, Math.floor(y - h * 1.22));
  const bx1 = Math.min(W + 8, Math.ceil(x + h * 0.62)), by1 = Math.min(H + 8, Math.ceil(y + h * 0.06));
  if (bx1 <= bx0 || by1 <= by0) return;
  const bw = Math.ceil((bx1 - bx0) / 32) * 32, bh = Math.ceil((by1 - by0) / 32) * 32;
  const L = K.layer(bw, bh, "f09kidB");
  const c = L.g;
  c.translate(-bx0, -by0);
  K.drawPerson(c, x, y, h, Object.assign({ view: "back", t, hood: true, bell: true, shadow: false, breathe: true, light, ambient: "#071012", fill: "#04080a" }, o));
  c.save();
  c.globalCompositeOperation = "source-atop";
  K.texRect(c, "fabric", x - h * 0.45, y - h * 1.15, h * 0.9, h * 1.15, { scale: h * 0.1, alpha: 0.3, tex: { color: "#4a4228", seed: 7 } });
  const gr = c.createLinearGradient(0, y - h, 0, y);
  gr.addColorStop(0, K.rgba("#02070a", darkK * 0.6)); gr.addColorStop(0.5, K.rgba("#02070a", darkK)); gr.addColorStop(1, K.rgba("#010304", Math.min(0.95, darkK * 1.5)));
  c.fillStyle = gr; c.fillRect(x - h, y - h * 1.3, h * 2, h * 1.4);
  if (o.spill) {
    // the light source in front spills onto the tops of the shoulders and the side of the head
    const sp = c.createRadialGradient(light.x, light.y + h * 0.25, h * 0.05, light.x, light.y + h * 0.3, h * 0.75);
    sp.addColorStop(0, K.rgba(o.spill, 0.32)); sp.addColorStop(0.6, K.rgba(o.spill, 0.08)); sp.addColorStop(1, K.rgba(o.spill, 0));
    c.globalCompositeOperation = "source-atop";
    c.fillStyle = sp; c.fillRect(x - h, y - h * 1.3, h * 2, h * 1.4);
  }
  c.restore();
  g.drawImage(L.canvas, bx0, by0, bw, bh);
  if (o.rim === 0) return;
  // rim light: the silhouette minus itself shifted away from the light = a thin edge facing the
  // light; tinted with the light colour and added back softened, so it wraps like real back light
  const R = K.layer(bw, bh, "f09kidR");
  const px = K.pixelScale();
  const dx = x - light.x, dy = (y - h * 0.6) - light.y, dl = Math.hypot(dx, dy) || 1;
  const k = o.rimK || Math.min(7, h * 0.006);
  R.g.setTransform(1, 0, 0, 1, 0, 0);
  R.g.drawImage(L.canvas, 0, 0);
  R.g.globalCompositeOperation = "destination-out";
  R.g.drawImage(L.canvas, (dx / dl) * k * px, (dy / dl) * k * px);
  R.g.globalCompositeOperation = "source-atop";
  R.g.fillStyle = light.color;
  R.g.fillRect(0, 0, R.canvas.width, R.canvas.height);
  R.g.globalCompositeOperation = "source-over";
  g.save();
  g.globalCompositeOperation = "lighter";
  // a cheap soft blur: the edge stamped at a few offsets (a blur filter here costs ~20 ms)
  const rA = o.rimA == null ? 0.5 : o.rimA, r = Math.max(1.5, k * 0.5);
  for (const [ox, oy, a] of [[0, 0, 0.35], [r, 0, 0.18], [-r, 0, 0.18], [0, r, 0.18], [0, -r, 0.18], [r * 2, r * 2, 0.08], [-r * 2, -r * 2, 0.08]]) {
    g.globalAlpha = a * rA;
    g.drawImage(R.canvas, bx0 + ox, by0 + oy, bw, bh);
  }
  g.restore();
}
function shotWall(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 10, 17.4));
  K.withCamera(g, W, H, { x: 480 + p * 18, y: 270, zoom: 1.02 + p * 0.05, shakeT: t, shakeAmt: 1.1 }, () => {
    g.fillStyle = "#060b0d"; g.fillRect(-40, -40, W + 80, H + 80);
    // the wall's steel frame behind the screens, lit only by the screens themselves
    K.texRect(g, "plaster", -40, 20, W + 80, 420, { scale: 300, tex: { color: "#2a3436", grime: "#0e1416", stain: 0.6, seed: 21 } });
    g.fillStyle = "rgba(3,7,8,0.55)"; g.fillRect(-40, 20, W + 80, 420);
    // the screens (one cached frame of the 28 feeds, cycled at 8 fps), slightly soft: the focus is on you
    K.focus(g, W, H, 1.6, (f) => f.drawImage(wallSprite(t, 880, 380, true), 40, 40, 880, 380), "f09wallF");
    // screen light scattering in the room air
    K.lightPool(g, 480, 230, 640, TEAL, { intensity: 0.18, flat: 0.62 });
    // desk: black epoxy worktop, its front edge catching the screens, a soft occlusion line at the wall
    K.texRect(g, "plaster", -40, 430, W + 80, 140, { scale: 260, tex: { color: "#262e30", grime: "#0a0e10", stain: 0.4, seed: 22 } });
    const dg = g.createLinearGradient(0, 430, 0, 560);
    dg.addColorStop(0, "rgba(4,8,9,0.1)"); dg.addColorStop(0.1, "rgba(4,8,9,0.55)"); dg.addColorStop(1, "rgba(2,4,5,0.95)");
    g.fillStyle = dg; g.fillRect(-40, 430, W + 80, 140);
    K.aoEdge(g, -40, 430, W + 40, 430, { width: 16, alpha: 0.5, side: 1 });
    g.fillStyle = "rgba(150,240,215,0.28)"; g.fillRect(-40, 430, W + 80, 1.2);
    // reflections of the screens in the glossy worktop: soft vertical smears
    g.save(); g.globalCompositeOperation = "lighter";
    for (let c = 0; c < 7; c++) K.reflectStreak(g, 103 + c * 126, 436, 60, TEAL, 0.1, { t, width: 50 });
    g.restore();
    for (let i = 0; i < 14; i++) {
      const bx = 520 + i * 26, on = K.hash(i, 8) > 0.4;
      const bl = on ? 0.6 + 0.4 * Math.sin(t * (1 + K.hash(i, 3) * 3) + i) : 0.1;
      const col = i % 5 === 0 ? AMBER : TEAL;
      g.fillStyle = "#0a0f10"; g.fillRect(bx - 1, 451, 14, 7);
      g.fillStyle = K.mix("#1a2a28", K.mix(col, "#ffffff", 0.35), bl);
      g.fillRect(bx, 452, 12, 5);
      K.lightPool(g, bx + 6, 458, 16, col, { intensity: bl * 0.45, flat: 0.35 });
    }
    // the big rewind button (we will see it close at 17.2): amber cap in a steel bezel
    K.shadowBlob(g, 832, 474, 28, 6, { alpha: 0.6 });
    g.fillStyle = "#3a4246"; g.beginPath(); g.ellipse(830, 471, 27, 9.5, 0, 0, K.TAU); g.fill();
    const bcg = g.createRadialGradient(824, 464, 2, 830, 467, 24);
    bcg.addColorStop(0, "#ffd890"); bcg.addColorStop(0.5, "#d08a10"); bcg.addColorStop(1, "#6a3a00");
    g.fillStyle = bcg; g.beginPath(); g.ellipse(830, 467, 22, 7, 0, 0, K.TAU); g.fill();
    K.lightPool(g, 830, 470, 50, AMBER, { intensity: 0.3, flat: 0.35 });
    // you, over the shoulder: a dark back against the screens, rim-lit by them
    kidBack(g, W, H, 250, 1010, 820, t, { x: 560, y: 160, color: "#8affd8", strength: 1.7, z: -0.75 }, { hood: false, rimA: 0.32, rimK: 2.4, spill: "#5affc8" }, 0.55);
  });
  K.dust(g, W, H, t, { seed: 92, count: 30, color: "#bfffe8", size: 1.3, alpha: 0.35, area: [300, 40, 640, 400] });
}

// ---- a domed, translucent, backlit push-button in a bevelled brushed-steel bezel ------------------
// Seen from above at ~30 deg (ellipses with a 0.5 aspect). Cached per radius / colour / lit state;
// shots crossfade the off and on sprites and offset the cap by the press depth.
function domeButtonSprite(r, cap, lit, symbol) {
  const w = r * 2.7, h = r * 1.75;
  return K.sprite("f09dome:" + r + ":" + cap + ":" + lit + ":" + (symbol || ""), w, h, (g) => {
    const cx = w / 2, cy = h * 0.47;
    const conic = (y, rx, ry, cols, a0 = 0) => {
      if (!g.createConicGradient) return K.mix(cols[0], cols[1], 0.5);
      // the brushed-steel anisotropy: highlights at two opposite angles round the ring
      const cg = g.createConicGradient(a0, cx, y);
      cols.forEach((c, i) => cg.addColorStop(i / (cols.length - 1), c));
      return cg;
    };
    // drop shadow of the whole fitting on the panel
    g.save(); g.translate(cx + r * 0.05, cy + r * 0.2); g.scale(1, 0.5);
    const sg = g.createRadialGradient(0, 0, r * 0.9, 0, 0, r * 1.45);
    sg.addColorStop(0, "rgba(0,0,0,0.6)"); sg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = sg; g.beginPath(); g.arc(0, 0, r * 1.45, 0, K.TAU); g.fill(); g.restore();
    // bezel: the outer bevel wall (dark below), the flat ring (brushed, conic highlights), the inner chamfer
    g.fillStyle = "#0b0e10"; g.beginPath(); g.ellipse(cx, cy + r * 0.1, r * 1.2, r * 0.62, 0, 0, K.TAU); g.fill();
    g.save(); g.translate(0, 0); g.scale(1, 1);
    g.fillStyle = conic(cy + r * 0.04, r, r, ["#5a6468", "#c4ccce", "#4a5458", "#262e32", "#6a7478", "#d4dcdc", "#4a5458", "#262e32", "#5a6468"], -0.6);
    g.beginPath(); g.ellipse(cx, cy + r * 0.04, r * 1.17, r * 0.585, 0, 0, K.TAU); g.fill();
    g.restore();
    // a fine machining texture over the ring
    const ring = new Path2D(); ring.ellipse(cx, cy + r * 0.04, r * 1.17, r * 0.585, 0, 0, K.TAU);
    K.texFill(g, "metal", ring, { scale: r * 1.4, alpha: 0.35, mode: "overlay", rot: 0.3, tex: { color: "#9aa2a6", seed: 34 } });
    // the inner chamfer catches the light on its far side and goes dark on the near side
    const ch = g.createLinearGradient(0, cy - r * 0.5, 0, cy + r * 0.5);
    ch.addColorStop(0, "#9aa6aa"); ch.addColorStop(0.45, "#3a4448"); ch.addColorStop(1, "#14191c");
    g.fillStyle = ch; g.beginPath(); g.ellipse(cx, cy + r * 0.02, r * 1.02, r * 0.515, 0, 0, K.TAU); g.fill();
    // the gap round the cap
    g.fillStyle = "#050607"; g.beginPath(); g.ellipse(cx, cy + r * 0.03, r * 0.97, r * 0.49, 0, 0, K.TAU); g.fill();
    // the cap: translucent moulded plastic, domed. Side band first, then the dome top.
    const capC = K.parseColor(cap);
    const deep = K.mix(cap, "#000000", lit ? 0.35 : 0.72), mid = K.mix(cap, "#000000", lit ? 0.05 : 0.5);
    const core = lit ? K.mix(cap, "#fff8e8", 0.75) : K.mix(cap, "#000000", 0.3);
    g.fillStyle = deep; g.beginPath(); g.ellipse(cx, cy + r * 0.02, r * 0.94, r * 0.47, 0, 0, K.TAU); g.fill();
    const dome = new Path2D(); dome.ellipse(cx, cy - r * 0.07, r * 0.93, r * 0.45, 0, 0, K.TAU);
    g.save(); g.clip(dome);
    // subsurface: light from the lamp under the cap, brightest where the plastic is thinnest (centre)
    const sub = g.createRadialGradient(cx, cy - r * 0.02, r * 0.05, cx, cy - r * 0.06, r * 0.98);
    sub.addColorStop(0, core); sub.addColorStop(0.45, mid); sub.addColorStop(1, deep);
    g.fillStyle = sub; g.save(); g.translate(0, 0); g.fill(dome); g.restore();
    // moulded symbol: the thicker plastic reads darker, softly (two stamps = a cheap blur)
    if (symbol === "rewind") {
      for (const [o, a] of [[0, 0.32], [1.5, 0.18]]) {
        g.fillStyle = K.rgba(K.mix(cap, "#000000", 0.7), a);
        const s = r * 0.34, ay = cy - r * 0.06;
        poly(g, [[cx - r * 0.02 + o, ay - s * 0.45], [cx - r * 0.02 + o, ay + s * 0.45], [cx - r * 0.02 - s + o, ay]]); g.fill();
        poly(g, [[cx + r * 0.33 + o, ay - s * 0.45], [cx + r * 0.33 + o, ay + s * 0.45], [cx + r * 0.33 - s + o, ay]]); g.fill();
      }
    }
    // curvature: the near lower edge turns away and darkens; the far edge picks up a fresnel lip
    const cv = g.createLinearGradient(0, cy - r * 0.52, 0, cy + r * 0.4);
    cv.addColorStop(0, "rgba(220,255,245,0.28)"); cv.addColorStop(0.18, "rgba(220,255,245,0.0)"); cv.addColorStop(0.75, "rgba(0,0,0,0)"); cv.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = cv; g.fill(dome);
    if (lit) {
      g.globalCompositeOperation = "lighter";
      const gl = g.createRadialGradient(cx, cy - r * 0.04, 0, cx, cy - r * 0.04, r * 0.6);
      gl.addColorStop(0, K.rgba(K.mix(cap, "#ffffff", 0.6), 0.55)); gl.addColorStop(1, K.rgba(cap, 0));
      g.fillStyle = gl; g.fill(dome);
      g.globalCompositeOperation = "source-over";
    }
    g.restore();
    // specular: the monitor wall reflected in the dome as a soft bright rounded rectangle (upper
    // left), and a tight sun-like glint on its corner
    g.save(); g.translate(cx - r * 0.38, cy - r * 0.3); g.rotate(-0.12); g.scale(1, 0.42);
    const sp = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.4);
    sp.addColorStop(0, "rgba(235,255,248,0.6)"); sp.addColorStop(0.5, "rgba(210,255,240,0.22)"); sp.addColorStop(1, "rgba(210,255,240,0)");
    g.fillStyle = sp; g.fillRect(-r * 0.4, -r * 0.4, r * 0.8, r * 0.8);
    g.restore();
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.beginPath(); g.ellipse(cx - r * 0.5, cy - r * 0.34, r * 0.05, r * 0.022, -0.2, 0, K.TAU); g.fill();
    // the bezel lip: a thin bright line on its far rim, dark on the near rim
    g.lineWidth = Math.max(1, r * 0.012);
    g.strokeStyle = "rgba(225,240,236,0.55)";
    g.beginPath(); g.ellipse(cx, cy + r * 0.04, r * 1.165, r * 0.582, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
    void capC;
  });
}
function domeButton(g, x, y, r, cap, lit, press, symbol) {
  const w = r * 2.7, h = r * 1.75;
  const off = domeButtonSprite(r, cap, 0, symbol), on = domeButtonSprite(r, cap, 1, symbol);
  // the cap travels down by `press` px; the bezel stays put (redrawn under, cheap: one sprite)
  const dz = press;
  g.drawImage(off, x - w / 2, y - h * 0.47, w, h);
  if (dz > 0.05) {
    // the cap only: clip to the gap ellipse and redraw the sprite lower
    g.save(); g.beginPath(); g.ellipse(x, y + r * 0.03, r * 0.97, r * 0.49, 0, 0, K.TAU); g.clip();
    g.fillStyle = "#050607"; g.fillRect(x - r, y - r * 0.6, r * 2, r * 1.2);
    g.drawImage(off, x - w / 2, y - h * 0.47 + dz, w, h);
    if (lit > 0) { g.globalAlpha = lit; g.drawImage(on, x - w / 2, y - h * 0.47 + dz, w, h); }
    g.restore();
  } else if (lit > 0) { g.save(); g.globalAlpha = lit; g.drawImage(on, x - w / 2, y - h * 0.47, w, h); g.restore(); }
}

// ---- your hand (POV insert): a relief-rendered right hand, index finger extended -------------------
// Proportions from a real 9-10 year old hand: the index finger is ~43% of the hand length, three
// phalanges 0.47 / 0.29 / 0.24 of it, with knuckle bumps, creases at the joints, a natural nail and
// warmer, redder fingertips (blood close to the skin). Built at the pressed pose in screen space.
const HAND_O = [470, 230], HAND_WH = [520, 380];
const HAND_T = [552, 296];                  // the index fingertip pad (contact point)
function handSprite(lit) { return reliefBake(...handSpec(lit)); }
function handSpec(lit) {
  const d = [-0.844, -0.536], L = [d[1], -d[0]];       // along the hand toward the tip; thumb side
  const Wr = [HAND_T[0] - d[0] * 345, HAND_T[1] - d[1] * 345];
  const p = (a, b) => [Wr[0] + d[0] * a + L[0] * (b - 47) - HAND_O[0], Wr[1] + d[1] * a + L[1] * (b - 47) - HAND_O[1]];
  const rot = Math.atan2(d[1], d[0]);
  const prims = [
    // sleeve + rib-knit cuff of the yellow hoodie (off frame bottom right)
    { k: "cap", a: p(-40, 4), b: p(-240, 0), ra: 66, rb: 80, z: 6, sq: 0.55, mat: 2, folds: 7 },
    { k: "cap", a: p(-6, 3), b: p(-46, 4), ra: 64, rb: 66, z: 10, sq: 0.6, mat: 3, rib: { p: 5.5, d: 1.1, slant: 0 }, over: 4 },
    // wrist and the back of the hand (metacarpals): a low wide dome, tendons faintly raised
    { k: "cap", a: p(-20, 2), b: p(40, 4), ra: 50, rb: 56, z: 4, sq: 0.55, mat: 0 },
    { k: "ell", c: p(110, 2), rx: 108, ry: 74, rot, rz: 30, z: 4, mat: 0, blend: 14 },
    { k: "cap", a: p(50, 34), b: p(186, 44), ra: 7, rb: 6, z: 22, sq: 0.35, mat: 0, blend: 10 },
    { k: "cap", a: p(50, 6), b: p(186, 12), ra: 7, rb: 6, z: 24, sq: 0.35, mat: 0, blend: 10 },
    { k: "cap", a: p(50, -22), b: p(178, -20), ra: 6, rb: 5, z: 22, sq: 0.35, mat: 0, blend: 10 },
    // thenar pad + thumb tucked along the side, its nail just visible
    { k: "ell", c: p(70, 60), rx: 62, ry: 32, rot, rz: 22, z: 4, mat: 0, blend: 12 },
    { k: "cap", a: p(96, 70), b: p(160, 68), ra: 21, rb: 17, z: 0, mat: 0, creases: [{ t: 58, w: 1.4, d: 1.1 }] },
    { k: "cap", a: p(160, 68), b: p(190, 64), ra: 17, rb: 14, z: -2, zb: -6, mat: 4 },
    { k: "ell", c: p(181, 65), rx: 10, ry: 8, rot: rot + 0.05, rz: 3, z: 9, mat: 1, over: 4, blend: 2 },
    // curled middle, ring and little fingers: proximal phalanges rolling under, knuckles forward
    { k: "cap", a: p(188, 14), b: p(226, 12), ra: 20, rb: 18, z: 12, zb: -16, mat: 0, creases: [{ t: 28, w: 1.4, d: 1.1 }] },
    { k: "cap", a: p(181, -18), b: p(216, -20), ra: 19, rb: 17, z: 11, zb: -16, mat: 0, creases: [{ t: 25, w: 1.4, d: 1.1 }] },
    { k: "cap", a: p(168, -46), b: p(198, -49), ra: 16, rb: 14, z: 9, zb: -14, mat: 0, creases: [{ t: 21, w: 1.4, d: 1.1 }] },
    // MCP knuckles: the bony ridge across the back of the hand
    { k: "ell", c: p(188, 44), rx: 20, ry: 19, rot, rz: 6, z: 20, mat: 0, blend: 16 },
    { k: "ell", c: p(186, 12), rx: 20, ry: 19, rot, rz: 6, z: 20, mat: 0, blend: 16 },
    { k: "ell", c: p(180, -20), rx: 19, ry: 18, rot, rz: 5, z: 18, mat: 0, blend: 16 },
    { k: "ell", c: p(168, -47), rx: 15, ry: 15, rot, rz: 5, z: 15, mat: 0, blend: 16 },
    // the index finger, extended, angling down to the button: three phalanges, creases at the joints
    { k: "cap", a: p(192, 44), b: p(264, 46), ra: 20.5, rb: 18.5, z: 17, mat: 0, creases: [{ t: 66, w: 1.3, d: 1.3 }, { t: 61, w: 1.1, d: 0.8 }] },
    { k: "cap", a: p(264, 46), b: p(308, 47), ra: 18, rb: 16.5, z: 12, mat: 0, creases: [{ t: 40, w: 1.1, d: 1 }, { t: 36, w: 1, d: 0.6 }] },
    { k: "cap", a: p(308, 47), b: p(342, 47), ra: 16, rb: 14, z: 6, mat: 4, tipFrom: 0.1 },
    { k: "ell", c: p(264, 46), rx: 13, ry: 17, rot, rz: 3, z: 26, mat: 0, blend: 14 },
    { k: "ell", c: p(308, 47), rx: 11, ry: 15, rot, rz: 2, z: 20, mat: 0, blend: 14 },
    // the nail: a low, slightly glossy plate on the last phalanx, a paler free edge
    { k: "ell", c: p(329, 47), rx: 13.5, ry: 9.5, rot, rz: 3, z: 17, mat: 1, over: 4, blend: 2 },
  ];
  const T = [HAND_T[0] - HAND_O[0], HAND_T[1] - HAND_O[1]];
  return ["f09hand2:" + lit, HAND_WH[0], HAND_WH[1], {
    prims, relief: 1.1, aoR: 9, ao: 0.07, res: 0.66,
    mats: [
      { color: "#b97a58", wrap: 0.5, sss: "#ff6a3a", sssK: 0.3, spec: 0.16, shin: 16, pore: 0.18, mott: 0.12, alt: "#c07a62", altF: 0.02, altK: 0.35 },
      { color: "#d8b4a2", wrap: 0.45, spec: 0.35, shin: 60, sss: "#ff6040", sssK: 0.3, tip: "#efdcd0", tipFrom: 0.6, tipK: 0.7, mott: 0.04 },
      { color: "#d0a422", wrap: 0.35, spec: 0.04, shin: 6, weave: 0.18, mott: 0.15, aoK: 1.4 },
      { color: "#c49a20", wrap: 0.35, spec: 0.04, shin: 6, weave: 0.12, mott: 0.1, aoK: 1.6 },
      { color: "#bd7a60", tip: "#c8665a", tipFrom: 0.2, tipK: 0.7, wrap: 0.55, sss: "#ff5a30", sssK: 0.42, spec: 0.2, shin: 18, pore: 0.18, mott: 0.1 },
    ],
    lights: [
      // the monitor wall: a big cool source above and behind the panel
      { dir: [0.1, -0.8, 0.55], color: "#b8dcd2", k: lit ? 0.2 : 0.32 },
      // the button lamp under the fingertip: warm, close, falls off fast
      { pos: [T[0] - 4, T[1] + 6, -10], range: 80, color: "#ffa040", k: lit ? 3.4 : 0.3 },
    ],
    ambient: "#101c1e", ground: lit ? "#2a1606" : "#080c0c",
    rim: { dir: [0.2, -1], color: "#9fffe0", k: 0.22, p: 3 },
  }];
}
function handAt(g, x, y, lit, alpha = 1) {
  // (x, y) = where the fingertip pad is; the sprite was built with the pad at HAND_T
  const ox = x - HAND_T[0] + HAND_O[0], oy = y - HAND_T[1] + HAND_O[1];
  const h0 = handSprite(0), h1 = handSprite(1);
  g.save();
  g.globalAlpha *= alpha;
  g.drawImage(h0, ox, oy, HAND_WH[0], HAND_WH[1]);
  if (lit > 0) { g.globalAlpha *= lit; g.drawImage(h1, ox, oy, HAND_WH[0], HAND_WH[1]); }
  g.restore();
}

// ---- SHOT 2b [17.2-20] insert: your hand on the REWIND button -----------------------------------
function panelBase(g, W, H) {
  // powder-coated steel console: fine orange-peel texture, brushed edge band, screws, toggles
  return K.sprite("f09panel", W + 80, H + 80, (s) => {
    s.translate(40, 40);
    s.fillStyle = "#3e4a50"; s.fillRect(-40, -40, W + 80, H + 80);
    K.texRect(s, "metal", -40, -40, W + 80, H + 80, { scale: 300, alpha: 0.45, tex: { color: "#4a565c", seed: 31 } });
    K.texRect(s, "noise", -40, -40, W + 80, H + 80, { scale: 96, alpha: 0.16, mode: "overlay", tex: { size: 128, seed: 35, amp: 40 } });
    K.texRect(s, "plaster", -40, -40, W + 80, H + 80, { scale: 420, alpha: 0.35, mode: "multiply", tex: { color: "#a0a8aa", grime: "#3a4246", stain: 0.8, seed: 32 } });
    // light from the monitor wall (above, out of frame) falling off down the panel
    const bg = s.createLinearGradient(0, -40, 0, H);
    bg.addColorStop(0, "rgba(30,90,80,0.25)"); bg.addColorStop(0.35, "rgba(5,10,12,0.5)"); bg.addColorStop(1, "rgba(2,4,5,0.86)");
    s.fillStyle = bg; s.fillRect(-40, -40, W + 80, H + 80);
    // panel seam + screws (Phillips heads: a conic metal sheen, the recessed cross, a specular dot)
    s.fillStyle = "rgba(0,0,0,0.6)"; s.fillRect(-40, 22, W + 80, 2.5);
    s.fillStyle = "rgba(170,220,210,0.16)"; s.fillRect(-40, 24.5, W + 80, 1);
    for (const [sx, sy] of [[60, 66], [900, 66], [60, 490], [900, 490], [480, 66]]) {
      s.fillStyle = "rgba(0,0,0,0.5)"; s.beginPath(); s.ellipse(sx + 1.5, sy + 2.5, 10, 9, 0, 0, K.TAU); s.fill();
      const sg = s.createConicGradient ? s.createConicGradient(-0.5, sx, sy) : null;
      if (sg) { ["#8a969c", "#2a3236", "#c8d2d4", "#3a4246", "#8a969c"].forEach((c, i) => sg.addColorStop(i / 4, c)); }
      s.fillStyle = sg || "#5a666a"; s.beginPath(); s.arc(sx, sy, 8.5, 0, K.TAU); s.fill();
      const dg = s.createRadialGradient(sx - 2, sy - 3, 0.5, sx, sy, 9);
      dg.addColorStop(0, "rgba(255,255,255,0.25)"); dg.addColorStop(0.6, "rgba(0,0,0,0)"); dg.addColorStop(1, "rgba(0,0,0,0.45)");
      s.fillStyle = dg; s.beginPath(); s.arc(sx, sy, 8.5, 0, K.TAU); s.fill();
      s.strokeStyle = "rgba(6,9,10,0.9)"; s.lineWidth = 2; s.lineCap = "round";
      s.beginPath(); s.moveTo(sx - 4.5, sy - 1.5); s.lineTo(sx + 4.5, sy + 1.5); s.moveTo(sx - 1.5, sy + 4.5); s.lineTo(sx + 1.5, sy - 4.5); s.stroke();
      s.fillStyle = "rgba(230,255,248,0.7)"; s.beginPath(); s.arc(sx - 3, sy - 4, 1.1, 0, K.TAU); s.fill();
    }
    // a row of bat-handle toggle switches in recessed plates
    for (let i = 0; i < 5; i++) {
      const sx = 120 + i * 70, up = i % 2 === 1;
      s.fillStyle = "rgba(0,0,0,0.55)"; s.fillRect(sx - 15, 118, 32, 56);
      const pg = s.createLinearGradient(0, 118, 0, 172);
      pg.addColorStop(0, "#3a4448"); pg.addColorStop(1, "#141a1c");
      s.fillStyle = pg; s.fillRect(sx - 14, 118, 28, 52);
      s.fillStyle = "#0a0e10"; s.beginPath(); s.ellipse(sx, 144, 7, 6, 0, 0, K.TAU); s.fill();
      const ty = up ? 124 : 150;
      const tg = s.createLinearGradient(sx - 4, 0, sx + 4, 0);
      tg.addColorStop(0, "#5a666a"); tg.addColorStop(0.4, "#dce4e4"); tg.addColorStop(1, "#4a5458");
      s.fillStyle = tg;
      s.beginPath(); s.moveTo(sx - 2.5, 144); s.lineTo(sx - 4, ty + (up ? 2 : 18)); s.arc(sx, ty + (up ? 2 : 18), 4, Math.PI, 0, up); s.lineTo(sx + 2.5, 144); s.closePath(); s.fill();
    }
  });
}
function shotButton(g, t, W, H) {
  const p = K.seg(t, 17.2, 20);
  const press = K.smooth(K.seg(t, 17.75, 18.0)) * (1 - K.smooth(K.seg(t, 18.35, 18.7)));
  const lit = K.smooth(K.seg(t, 17.9, 18.05));
  K.withCamera(g, W, H, { x: 480, y: 270, zoom: 1.04 + p * 0.04, shakeT: t, shakeAmt: 1 + press * 3 }, () => {
    g.drawImage(panelBase(g, W, H), -40, -40, W + 80, H + 80);
    K.lightPool(g, 420, -60, 520, "#7affd8", { intensity: 0.18, flat: 0.6 });
    for (let i = 0; i < 5; i++) {
      const sx = 120 + i * 70, on = K.hash(i, 4) > 0.5;
      g.fillStyle = on ? "#c8fff0" : "#11231f";
      g.beginPath(); g.arc(sx, 192, 4, 0, K.TAU); g.fill();
      if (on) { K.glow(g, sx, 192, 16, TEAL, 0.6); K.lightPool(g, sx, 196, 26, TEAL, { intensity: 0.25, flat: 0.5 }); }
    }
    // label tape: slightly lifted, a soft shadow under it
    g.save(); g.translate(560, 420); g.rotate(-0.03);
    K.shadowBlob(g, 3, 5, 94, 14, { alpha: 0.4, soft: 0.4 });
    K.texRect(g, "plaster", -90, -16, 180, 32, { scale: 120, tex: { color: "#a8a28c", grime: "#5a5446", stain: 0.5, seed: 33 } });
    const lg = g.createLinearGradient(0, -16, 0, 16);
    lg.addColorStop(0, "rgba(0,0,0,0.25)"); lg.addColorStop(0.5, "rgba(0,0,0,0.45)"); lg.addColorStop(1, "rgba(0,0,0,0.6)");
    g.fillStyle = lg; g.fillRect(-90, -16, 180, 32);
    g.font = `700 22px ${MONO}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "rgba(20,20,18,0.85)";
    g.fillText("REWIND", 0, 1);
    g.restore();
    // the button
    const bx = 560, by = 290, br = 92;
    domeButton(g, bx, by, br, "#ff9a10", lit, press * 4, "rewind");
    if (lit > 0) K.lightPool(g, bx, by + 10, 320, AMBER, { intensity: 0.5 * lit, flat: 0.6 });
    // your hand: in from the bottom right; the index pad lands on the cap at 17.9
    const reach = K.ease.out(K.seg(t, 17.2, 17.85));
    const tx = K.lerp(780, HAND_T[0], reach), ty = K.lerp(560, HAND_T[1], reach) + press * 4;
    // the hand's soft shadow on the panel (key = the monitor wall above): offset down, wider, and
    // it closes in on the fingertip as the finger lands
    const shS = reliefShadow("f09hand2:0", handSprite(0), 10);
    g.save();
    g.globalAlpha = 0.55;
    const lift = 1 - reach * 0.6;
    g.translate(tx, ty); g.scale(1.06, 1.1); g.translate(-tx, -ty);
    g.drawImage(shS, tx - HAND_T[0] + HAND_O[0] - shS.pad + 8 * lift, ty - HAND_T[1] + HAND_O[1] - shS.pad + 26 * lift, shS.lw, shS.lh);
    g.restore();
    if (reach > 0.85) {
      // contact: a tight occlusion ring where the pad meets the cap
      g.save(); g.translate(bx - 6, by - 2 + press * 4); g.scale(1, 0.5);
      const cs = g.createRadialGradient(0, 0, 0, 0, 0, 26);
      cs.addColorStop(0, `rgba(30,12,0,${0.35 + press * 0.35})`); cs.addColorStop(1, "rgba(30,12,0,0)");
      g.fillStyle = cs; g.beginPath(); g.arc(0, 0, 26, 0, K.TAU); g.fill();
      g.restore();
    }
    // motion blur on the fast reach: the hand 1/50 s earlier, faint, under the sharp one
    const reach0 = K.ease.out(K.seg(t - 0.02, 17.2, 17.85));
    if (reach - reach0 > 0.004) handAt(g, K.lerp(780, HAND_T[0], reach0), K.lerp(560, HAND_T[1], reach0), 0, 0.4);
    handAt(g, tx, ty, lit);
    // the brass bell on its red string at the wrist (the kit bell, lit by the screens)
    const wx = tx - HAND_T[0] + 862, wy = ty - HAND_T[1] + 476;
    g.strokeStyle = "#8a1c16"; g.lineWidth = 2.4; g.lineCap = "round";
    g.beginPath(); g.moveTo(wx - 34, wy - 46); g.quadraticCurveTo(wx - 10, wy + 4, wx + 30, wy + 22); g.stroke();
    g.strokeStyle = "rgba(255,120,90,0.35)"; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(wx - 34, wy - 47); g.quadraticCurveTo(wx - 10, wy + 3, wx + 30, wy + 21); g.stroke();
    K.drawBell(g, wx - 12, wy + 6, 15, { t, glint: 0.4, string: false });
  });
  K.dust(g, W, H, t, { seed: 93, count: 22, color: "#ffe2a0", size: 1.6, alpha: 0.3 });
}

// ---- SHOT 3 [20-34] the CCTV footage, CAM 07 -----------------------------------------------------
// A real high-corner security camera: mounted top-right at 2.4 m, pitched down ~20 deg, looking
// diagonally down a corridor (world metres: x across -1.8..1.8, y up 0..3, z away 0..22).
// Every projected point goes through a barrel (fisheye) bulge so straight lines bow at the edges.
const CC = (() => {
  const pos = [1.0, 2.75, 0], tgt = [-0.25, 0.2, 7.2];
  let f = [tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]];
  const fl = Math.hypot(f[0], f[1], f[2]);
  f = [f[0] / fl, f[1] / fl, f[2] / fl];
  let r = [f[2], 0, -f[0]];
  const rl = Math.hypot(r[0], r[2]);
  r = [r[0] / rl, 0, r[2] / rl];
  const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
  return { pos, f, r, u, F: 520, roll: 0.035 };
})();
const BARREL = 0.2;
function cproj(x, y, z) {
  const d = [x - CC.pos[0], y - CC.pos[1], z - CC.pos[2]];
  const cz = Math.max(0.12, d[0] * CC.f[0] + d[1] * CC.f[1] + d[2] * CC.f[2]);
  let cx = (d[0] * CC.r[0] + d[1] * CC.r[1] + d[2] * CC.r[2]) / cz;
  let cy = -(d[0] * CC.u[0] + d[1] * CC.u[1] + d[2] * CC.u[2]) / cz;
  // slight camera roll (mounted crooked), then the lens bulge
  const cr = Math.cos(CC.roll), sr = Math.sin(CC.roll);
  [cx, cy] = [cx * cr - cy * sr, cx * sr + cy * cr];
  const sx = cx * CC.F, sy = cy * CC.F;
  const nx = sx / 560, ny = sy / 560, r2 = nx * nx + ny * ny;
  const k = (1 - BARREL * r2) / (1 - BARREL * 0.45);
  return [480 + sx * k, 262 + sy * k, (CC.F / cz) * k, cz];
}
// polygon in world space with each edge subdivided (so the fisheye curves it)
function cpoly(g, pts, sub = 8) {
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    for (let k = 0; k < sub; k++) {
      const u = k / sub;
      const p = cproj(K.lerp(a[0], b[0], u), K.lerp(a[1], b[1], u), K.lerp(a[2], b[2], u));
      if (i === 0 && k === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
    }
  }
  g.closePath();
}
function cline(g, a, b, sub = 10) {
  for (let k = 0; k <= sub; k++) {
    const u = k / sub;
    const p = cproj(K.lerp(a[0], b[0], u), K.lerp(a[1], b[1], u), K.lerp(a[2], b[2], u));
    if (k === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
  }
}
// an affine frame locally tangent to a wall/floor plane: origin o, unit axes ax, ay (world)
function planeXf(g, o, ax, ay) {
  const p0 = cproj(o[0], o[1], o[2]);
  const p1 = cproj(o[0] + ax[0], o[1] + ax[1], o[2] + ax[2]);
  const p2 = cproj(o[0] + ay[0], o[1] + ay[1], o[2] + ay[2]);
  g.transform(p1[0] - p0[0], p1[1] - p0[1], p2[0] - p0[0], p2[1] - p0[1], p0[0], p0[1]);
}
const WX0 = -2.0, WX1 = 2.0, CEIL = 3, ZN = 0.9, ZF = 24;
const LIGHTS_Z = [2.5, 6.5, 10.5, 14.5, 18.5, 22.5];
function corridorPaint(g) {
  g.fillStyle = "#0b1012"; g.fillRect(0, 0, 960, 540);
  // far end wall (dim, a closed fire door)
  cpoly(g, [[WX0, 0, ZF], [WX1, 0, ZF], [WX1, CEIL, ZF], [WX0, CEIL, ZF]], 2);
  g.fillStyle = "#1c2629"; g.fill();
  cpoly(g, [[-0.55, 0, ZF - 0.01], [0.55, 0, ZF - 0.01], [0.55, 2.1, ZF - 0.01], [-0.55, 2.1, ZF - 0.01]], 2);
  g.fillStyle = "#2e3b40"; g.fill();
  // ceiling
  // light falloff along the corridor: each ceiling panel lights a band, the far end sinks into gloom
  const litZ = (z) => { let L = 0.15; for (const zl of LIGHTS_Z) L += 0.55 / (1 + ((z - zl - 0.55) / 1.8) ** 2); return Math.min(1, L) * (1 - 0.55 * z / ZF); };
  const fall = (col, k) => (v0, v1) => K.rgba(col, K.clamp(k * (1 - litZ(ZN + (v0 + v1) / 2 * (ZF - ZN))), 0, 0.9));
  // acoustic ceiling tiles
  texQuad(g, cproj, "plaster", { color: "#4a5254", grime: "#1a2022", stain: 0.4, seed: 41 }, [WX0, CEIL, ZN], [WX1 - WX0, 0, 0], [0, 0, ZF - ZN], 16, [1.2, 1.2], fall("#06090a", 1), 1.6);
  // walls: lit nearer, falling off into the distance (inverse-square-ish on a gradient)
  // (each wall gets its own near-to-far gradient axis)
  for (const [x, c0] of [[WX0, "#7a8a8e"], [WX1, "#6e7e82"]]) {
    // painted block wall: plaster texture, lit in bands by the ceiling panels
    texQuad(g, cproj, "plaster", { color: c0, grime: "#2a3234", stain: 0.55, seed: x < 0 ? 42 : 43 }, [x, 0, ZN], [0, CEIL, 0], [0, 0, ZF - ZN], 20, [1.5, 1.5], fall("#070a0b", 1.05), 1.6);
  }
  // wall dado line + skirting
  g.strokeStyle = "rgba(20,28,30,0.7)"; g.lineWidth = 2;
  g.beginPath(); cline(g, [WX0, 1.0, ZN], [WX0, 1.0, ZF], 16); cline(g, [WX1, 1.0, ZN], [WX1, 1.0, ZF], 16); g.stroke();
  g.fillStyle = "#1a2124";
  cpoly(g, [[WX1, 0, ZN], [WX1, 0.12, ZN], [WX1, 0.12, ZF], [WX1, 0, ZF]], 12); g.fill();
  // right wall: a door, a notice board and a wall light (seen almost edge-on from the corner)
  for (const [z0, z1, y0, y1, col] of [[7.5, 8.5, 0, 2.15, "#2c383b"], [3.4, 4.6, 1.2, 1.9, "#3a4648"], [14, 15, 0, 2.15, "#2c383b"]]) {
    cpoly(g, [[WX1 - 0.005, y0, z0], [WX1 - 0.005, y1, z0], [WX1 - 0.005, y1, z1], [WX1 - 0.005, y0, z1]], 4);
    g.fillStyle = col; g.fill();
    g.strokeStyle = "#141b1d"; g.lineWidth = 2; g.stroke();
  }
  for (let k = 0; k < 5; k++) {
    const z = 3.55 + k * 0.22, y = 1.35 + K.hash(k, 3) * 0.35;
    cpoly(g, [[WX1 - 0.01, y, z], [WX1 - 0.01, y + 0.2, z], [WX1 - 0.01, y + 0.2, z + 0.16], [WX1 - 0.01, y, z + 0.16]], 1);
    g.fillStyle = "rgba(225,232,228,0.55)"; g.fill();
  }
  g.fillStyle = "#1a2124";
  cpoly(g, [[WX0, 0, ZN], [WX0, 0.12, ZN], [WX0, 0.12, ZF], [WX0, 0, ZF]], 12); g.fill();
  // doors + the lab window on the left wall
  for (const z0 of [3.2, 12.4, 19.5]) {
    cpoly(g, [[WX0 + 0.005, 0, z0], [WX0 + 0.005, 2.15, z0], [WX0 + 0.005, 2.15, z0 + 1.0], [WX0 + 0.005, 0, z0 + 1.0]], 3);
    g.fillStyle = "#2a3639"; g.fill();
    g.strokeStyle = "#141b1d"; g.lineWidth = 2.5; g.stroke();
    cpoly(g, [[WX0 + 0.01, 1.2, z0 + 0.3], [WX0 + 0.01, 1.75, z0 + 0.3], [WX0 + 0.01, 1.75, z0 + 0.7], [WX0 + 0.01, 1.2, z0 + 0.7]], 2);
    g.fillStyle = "#16201f"; g.fill();
    const hdl = cproj(WX0 + 0.02, 1.0, z0 + 0.85);
    g.fillStyle = "#c9d2d4"; g.fillRect(hdl[0] - hdl[2] * 0.05, hdl[1] - hdl[2] * 0.012, hdl[2] * 0.1, Math.max(1, hdl[2] * 0.025));
  }
  // lab window: glowing teal, with silhouetted equipment
  cpoly(g, [[WX0 + 0.01, 0.9, 6.2], [WX0 + 0.01, 2.0, 6.2], [WX0 + 0.01, 2.0, 9.6], [WX0 + 0.01, 0.9, 9.6]], 6);
  g.fillStyle = "#1d3c36"; g.fill();
  g.save(); g.clip();
  for (let k = 0; k < 6; k++) {
    const z = 6.5 + k * 0.52, h = 0.25 + K.hash(k, 7) * 0.45;
    cpoly(g, [[WX0 + 0.02, 0.9, z], [WX0 + 0.02, 0.9 + h, z], [WX0 + 0.02, 0.9 + h, z + 0.3], [WX0 + 0.02, 0.9, z + 0.3]], 2);
    g.fillStyle = "#10201d"; g.fill();
  }
  const lw0 = cproj(WX0, 1.5, 7.6);
  K.glow(g, lw0[0], lw0[1], lw0[2] * 1.6, "#7affd0", 0.45);
  g.restore();
  g.strokeStyle = "#11181a"; g.lineWidth = 4;
  cpoly(g, [[WX0 + 0.01, 0.9, 6.2], [WX0 + 0.01, 2.0, 6.2], [WX0 + 0.01, 2.0, 9.6], [WX0 + 0.01, 0.9, 9.6]], 6); g.stroke();
  // stencil "SECTOR 7" painted on the wall, in the wall's own perspective
  g.save();
  planeXf(g, [WX0 + 0.01, 2.45, 10.0], [0, 0, 1], [0, -1, 0]);
  g.font = `800 0.42px ${MONO}`; g.textBaseline = "middle"; g.fillStyle = "rgba(220,232,228,0.5)";
  g.fillText("SECTOR 7", 0, 0);
  g.restore();
  // fire extinguisher + alarm box
  {
    const a = cproj(WX0 + 0.12, 0.35, 5.0), b = cproj(WX0 + 0.12, 0.95, 5.0);
    const w = a[2] * 0.16;
    g.fillStyle = "#8a1e1e"; g.fillRect(a[0] - w / 2, b[1], w, a[1] - b[1]);
    g.fillStyle = "rgba(255,210,200,0.35)"; g.fillRect(a[0] - w * 0.25, b[1] + 2, w * 0.15, a[1] - b[1] - 4);
    g.fillStyle = "#222"; g.fillRect(a[0] - w * 0.3, b[1] - w * 0.4, w * 0.6, w * 0.45);
    const c = cproj(WX0 + 0.01, 1.5, 11.6);
    g.fillStyle = "#c22a2a"; g.fillRect(c[0] - c[2] * 0.08, c[1] - c[2] * 0.1, c[2] * 0.12, c[2] * 0.18);
  }
  // pipe run along the left wall-ceiling edge, shaded as a cylinder
  for (const [py, pr, col] of [[2.72, 0.07, "#6c7b80"], [2.55, 0.045, "#55636a"]]) {
    g.lineCap = "round";
    const p0 = cproj(WX0 + 0.12, py, ZN), p1 = cproj(WX0 + 0.12, py, ZF);
    g.strokeStyle = "#1a2124"; g.lineWidth = Math.max(1, p0[2] * pr * 2.2);
    g.beginPath(); cline(g, [WX0 + 0.12, py, 3.5], [WX0 + 0.12, py, ZF], 20); g.stroke();
    g.strokeStyle = col; g.lineWidth = Math.max(0.8, p0[2] * pr * 1.3);
    g.beginPath(); cline(g, [WX0 + 0.12, py + pr * 0.3, 3.5], [WX0 + 0.12, py + pr * 0.3, ZF], 20); g.stroke();
    void p1;
  }
  // floor: polished concrete, darker far away
  texQuad(g, cproj, "plaster", { color: "#76848a", grime: "#30383a", stain: 0.7, seed: 44 }, [WX0, 0, ZN], [WX1 - WX0, 0, 0], [0, 0, ZF - ZN], 22, [1.8, 1.8], fall("#06090a", 1.0), 1.6);
  // scuffed traffic lane down the middle: the polish is worn duller where people walk
  cpoly(g, [[-0.6, 0.001, ZN], [0.6, 0.001, ZN], [0.6, 0.001, ZF], [-0.6, 0.001, ZF]], 12);
  g.fillStyle = "rgba(20,26,28,0.12)"; g.fill();
  // occlusion along both skirting lines
  for (const x of [WX0, WX1]) { const a = cproj(x, 0, ZN + 0.3), b = cproj(x, 0, ZF); K.aoEdge(g, a[0], a[1], b[0], b[1], { width: 14, alpha: 0.5, side: 0 }); }
  // tile joints converging to the vanishing point (bowed by the lens)
  g.strokeStyle = "rgba(18,24,26,0.42)"; g.lineWidth = 1.3;
  g.beginPath();
  for (let x = -1.2; x <= 1.21; x += 0.6) cline(g, [x, 0, ZN], [x, 0, ZF], 18);
  for (let z = 0; z <= ZF; z += 0.6) cline(g, [WX0, 0, z], [WX1, 0, z], 8);
  g.stroke();
  // yellow/black hazard edge along the left wall
  for (let z = 0; z < ZF; z += 0.5) {
    cpoly(g, [[WX0 + 0.12, 0.001, z], [WX0 + 0.3, 0.001, z + 0.12], [WX0 + 0.3, 0.001, z + 0.37], [WX0 + 0.12, 0.001, z + 0.25]], 1);
    g.fillStyle = "rgba(190,165,50,0.75)"; g.fill();
  }
  // ceiling light panels + the pools they throw + their reflections in the polished floor
  for (const z of LIGHTS_Z) {
    cpoly(g, [[-0.35, CEIL - 0.01, z], [0.35, CEIL - 0.01, z], [0.35, CEIL - 0.01, z + 1.1], [-0.35, CEIL - 0.01, z + 1.1]], 2);
    g.fillStyle = "#f2fffb"; g.fill();
    const c = cproj(0, CEIL - 0.05, z + 0.55);
    K.glow(g, c[0], c[1], c[2] * 0.9, "#dffff4", 0.35);
    const fp = cproj(-0.1, 0, z + 0.55);
    g.save(); g.translate(fp[0], fp[1]); g.scale(1, 0.42);
    K.glow(g, 0, 0, fp[2] * 1.8, "#e6fff6", 0.22);
    g.restore();
    // mirror image of the panel below the floor plane = its reflection
    const rp = cproj(0, -CEIL + 0.05, z + 0.55);
    const rr = cproj(0, -CEIL + 0.05, z + 1.1);
    g.save(); g.translate(rp[0], rp[1]); g.rotate(Math.atan2(rr[1] - rp[1], rr[0] - rp[0]) - Math.PI / 2); g.scale(0.35, 1.4);
    K.glow(g, 0, 0, rp[2] * 0.5, "#e6fff6", 0.18);
    g.restore();
  }
  // atmospheric falloff into the far end
  const fe = cproj(0, 1.2, ZF);
  const ag = g.createRadialGradient(fe[0], fe[1], 4, fe[0], fe[1], 260);
  ag.addColorStop(0, "rgba(10,16,18,0.55)"); ag.addColorStop(1, "rgba(10,16,18,0)");
  g.fillStyle = ag; g.fillRect(0, 0, 960, 540);
}
const PATHS = [
  // Biscuit leads; then the grey kitten, the black cat and the cream cat. Each walks its own line
  // from the far end toward the camera and stops in a staggered, back-to-front group.
  { coat: null, a: [-0.7, 17.5], b: [0.45, 3.6], start: 20.6, size: 0.3 },
  { coat: "grey", a: [-1.0, 19.0], b: [-0.35, 7.4], start: 24.2, size: 0.19 },
  { coat: "black", a: [0.2, 19.5], b: [1.15, 6.0], start: 22.4, size: 0.27 },
  { coat: "cream", a: [-1.4, 20.0], b: [-0.95, 4.5], start: 23.2, size: 0.25 },
];
for (const c of PATHS) c.maxP = cproj(c.b[0], 0, c.b[1])[2]; // projected scale where each cat stops
const CAT_V = 1.75; // m/s, an unhurried walk
function walkS(t, start, dist) {
  // constant speed, then a 1 m deceleration to a stop. Pure in t.
  const tr = Math.max(0, t - start);
  const T1 = Math.max(0, (dist - 1) / CAT_V);
  if (tr <= T1) return Math.min(dist, tr * CAT_V);
  const tt = Math.min(tr - T1, 2 / CAT_V);
  return Math.min(dist, dist - 1 + CAT_V * tt - CAT_V * CAT_V * tt * tt / 4);
}
function cctvState(t) {
  return PATHS.map((c, i) => {
    const dx = c.b[0] - c.a[0], dz = c.b[1] - c.a[1], dist = Math.hypot(dx, dz);
    const s = walkS(t, c.start, dist);
    const u = s / dist;
    const wx = c.a[0] + dx * u, wz = c.a[1] + dz * u;
    const p = cproj(wx, 0, wz);
    const q = cproj(wx + dx / dist * 0.2, 0, wz + dz / dist * 0.2);
    const moving = t > c.start && s < dist - 0.02;
    return { i, c, wx, wz, x: p[0], y: p[1], size: c.size * p[2] * 1.55, cz: p[3], moving, phase: s / 0.62, facing: q[0] >= p[0] ? 1 : -1, s, dist, dirx: dx / dist, dirz: dz / dist };
  });
}
const corridorSprite = () => K.sprite("f09corr2", 384, 216, (s) => { s.scale(0.4, 0.4); corridorPaint(s); });
function cctvScene(g, t) {
  // the tape is low resolution: the whole scene lives in a 0.4-scale layer, upscaled softly
  g.drawImage(corridorSprite(), 0, 0, 384, 216);
  g.save();
  g.scale(0.4, 0.4);
  const st = cctvState(t);
  // Biscuit's damp paw prints on the polished floor (he came in from the wet): faint darker
  // ovals, drying (fading) behind him - a mark on the floor, not a light
  const b = st[0];
  if (b.s > 0.3) {
    g.fillStyle = "#05090a";
    for (let k = 1; k < 30; k++) {
      const sk = b.s - k * 0.36;
      if (sk < 0) break;
      const side = k % 2 ? 0.06 : -0.06;
      const wx = b.c.a[0] + b.dirx * sk - b.dirz * side, wz = b.c.a[1] + b.dirz * sk + b.dirx * side;
      const p = cproj(wx, 0, wz), q = cproj(wx + b.dirx * 0.1, 0, wz + b.dirz * 0.1);
      const r = Math.max(1.5, p[2] * 0.035);
      g.globalAlpha = K.clamp(1 - (k * 0.36) / 6) * 0.22;
      g.beginPath(); g.ellipse(p[0], p[1], r, r * 0.45, Math.atan2(q[1] - p[1], q[0] - p[0]), 0, K.TAU); g.fill();
    }
    g.globalAlpha = 1;
  }
  // where each cat was 1/25 s ago: its motion on the tape (smear + interlace combing)
  const prev = cctvState(t - 0.04);
  const order = st.slice().sort((p, q) => q.cz - p.cz);
  for (const s of order) {
    if (s.s <= 0 && t < s.c.start) continue;
    const i = s.i;
    const coat = s.c.coat ? K.COATS[s.c.coat] : undefined;
    // soft contact shadow under each cat from the ceiling panel above it
    K.shadowBlob(g, s.x + s.size * 0.05, s.y, s.size * 0.85, s.size * 0.16, { alpha: 0.55 });
    const lookUp = i === 0 ? K.smooth(K.seg(t, 32.2, 33.0)) : 0;
    // followers, once stopped: stay standing, heads toward Biscuit, tails idling
    const stopped = !s.moving && t > s.c.start + 1;
    const look = stopped && i ? K.smooth(K.seg(t, s.c.start + s.dist / CAT_V + 0.6, s.c.start + s.dist / CAT_V + 1.4)) : 0;
    const headTo = [0, 0.45, 0.25, 0.6][i];
    const base = { tailUp: i === 0 ? 1 : 0.35, coat, collar: i === 0, bell: false, lod: 0, ground: "#0a1012" };
    if (s.moving) {
      // the walk cycle is pre-rendered: 10 phase frames per cat, scaled to its distance
      const q = Math.floor((((s.phase % 1) + 1) % 1) * 10);
      catSprite(g, i + ":w" + q + ":" + s.facing, s, [s.x - prev[i].x, s.y - prev[i].y], Object.assign({ pose: "walk", phase: q / 10, facing: s.facing, t: 1 + i, tail: 0.3, headTurn: i === 0 ? 0.15 : 0 }, base));
    } else if (i) {
      // standing followers: 3 head-turn steps x 8 tail-sway frames (the tape's low frame rate hides the steps)
      const ls = Math.round(look * 2) / 2;
      const tf = Math.floor(((t + i * 1.7) / 4.488) * 8) % 8;
      catSprite(g, i + ":s" + ls + ":" + tf + ":" + s.facing, s, null, Object.assign({ pose: "stand", facing: s.facing, t: (tf / 8) * 4.488, tail: 0.7, headTurn: ls * headTo, headTilt: ls * (i === 2 ? 0.15 : -0.05) }, base));
    } else {
      // Biscuit, stopped: drawn live (he looks up into the lens and meows)
      K.drawCat(g, s.x, s.y, s.size, Object.assign({
        pose: "stand", facing: s.facing, t, tail: 0.5,
        key: { x: s.x + s.size * 0.4, y: s.y - s.size * 7, color: "#d8eee6", strength: 0.5 }, fill: "#141c1e", ambient: "#2a3638", ambientK: 0.35,
        headTurn: lookUp * 0.85 + 0.15, headTilt: lookUp * 0.4, mouth: K.env(t, 33.5, 34.4, 0.12, 0.2),
      }, base)); // no rim light: invisible at CCTV size, and it doubles the cost
    }
  }
  g.restore();
  return null;
}
// A cat pre-rendered at its largest on-screen size (where it stops), cached, then drawn scaled.
function catSprite(g, key, s, mv, opts) {
  const R = s.c.size * s.c.maxP * 1.55;
  const w = R * 3.6, h = R * 2.1, ay = h - R * 0.3;
  // lit like the tape: a hard overhead panel (top light), a dim grey bounce from the floor; exposed
  // like the corridor around it (a grey-white cat on this tape is light grey, never paper white)
  const lit = Object.assign({ key: { x: w / 2 + R * 0.4, y: ay - R * 7, color: "#d8eee6", strength: 0.5 }, fill: "#141c1e", ambient: "#2a3638", ambientK: 0.35 }, opts);
  const spr = K.sprite("f09cs4:" + key, w * 0.5, h * 0.5, (c) => {
    c.scale(0.5, 0.5); K.drawCat(c, w / 2, ay, R, lit);
    c.globalCompositeOperation = "source-atop"; c.fillStyle = "rgba(10,16,18,0.2)"; c.fillRect(0, 0, w, h);
  });
  const k = s.size / R;
  const x0 = s.x - (w / 2) * k, y0 = s.y - ay * k, dw = w * k, dh = h * k;
  if (mv && (mv[0] || mv[1])) {
    // exposure smear: the cat 1/50 and 1/25 s back, faint, under it
    g.save();
    g.globalAlpha = 0.22; g.drawImage(spr, x0 - mv[0], y0 - mv[1], dw, dh);
    g.globalAlpha = 0.35; g.drawImage(spr, x0 - mv[0] * 0.5, y0 - mv[1] * 0.5, dw, dh);
    g.restore();
    g.drawImage(spr, x0, y0, dw, dh);
    // interlace combing: the odd field was scanned 1/50 s later, so every other line is shifted
    g.save();
    g.beginPath();
    const L = 2.5;                                     // one tape line (the layer is 0.4 scale)
    for (let yy = Math.floor(y0 / (2 * L)) * 2 * L; yy < y0 + dh; yy += 2 * L) g.rect(x0 - 8, yy, dw + 16, L);
    g.clip();
    g.globalAlpha = 0.6; g.drawImage(spr, x0 + mv[0] * 0.5, y0 + mv[1] * 0.5, dw, dh);
    g.restore();
  } else g.drawImage(spr, x0, y0, dw, dh);
}
function cctvGrade(g, W, H, t, o = {}) {
  g.save();
  g.globalCompositeOperation = "saturation";
  g.globalAlpha = o.desat == null ? 0.88 : o.desat;
  g.fillStyle = "#808080"; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "color";
  g.globalAlpha = o.tintA == null ? 0.42 : o.tintA;
  g.fillStyle = o.tint || "#79a88f"; g.fillRect(0, 0, W, H);
  g.restore();
}
function cctvOverlay(g, W, H, t, cam, base, o = {}) {
  // tracking band, scanlines, snow, fisheye vignette, burned-in text
  const by = (((t * 0.11) % 1) * 1.4 - 0.2) * H;
  const bg = g.createLinearGradient(0, by - 30, 0, by + 30);
  bg.addColorStop(0, "rgba(255,255,255,0)"); bg.addColorStop(0.5, "rgba(230,255,240,0.09)"); bg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = bg; g.fillRect(0, by - 30, W, 60);
  snow(g, 0, 0, W, H, t, o.snow == null ? 0.07 : o.snow, 3);
  scanlines(g, 0, 0, W, H, 0.55, 3);
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.98);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(0.7, "rgba(0,8,4,0.35)"); vg.addColorStop(1, "rgba(0,4,2,0.92)");
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  const y0 = H * 0.085 + 34;
  hudText(g, cam, 40, y0, 22);
  hudText(g, clock(base + t), 40, y0 + 28, 22);
  if (Math.floor(t * 1.6) % 2 === 0) {
    g.fillStyle = "#ff3a3a"; g.beginPath(); g.arc(W - 118, y0 - 7, 7, 0, K.TAU); g.fill();
    K.glow(g, W - 118, y0 - 7, 18, "#ff3a3a", 0.6);
  }
  hudText(g, o.right || "REC", W - 100, y0, 22);
  hudText(g, o.bottom || "LAB SEC SYS  PLAY", 40, H - H * 0.085 - 22, 16, "left", "#cfe8d8", 0.75);
}
function shotCCTV(g, t, W, H) {
  const L = K.layer(384, 216, "f09cctv2");
  cctvScene(L.g, t);
  cctvGrade(L.g, 384, 216, t); // graded at tape resolution: fewer pixels to composite
  g.save();
  g.imageSmoothingEnabled = true;
  const jit = K.flash(t, [24.0, 29.3], 0.06) * 6;
  g.drawImage(L.canvas, 0, 0, L.canvas.width, L.canvas.height, jit, 0, W, H);
  g.restore();
  // (grade already applied to the half-res layer above)
  // hit 24: a short glitch as the line appears
  const hit = K.flash(t, [24.0], 0.08);
  if (hit > 0) { snow(g, 0, 0, W, H, t, 0.18 * hit, 5); g.fillStyle = `rgba(220,255,235,${0.15 * hit})`; g.fillRect(0, 0, W, H); }
  cctvOverlay(g, W, H, t, "CAM 07", 2 * 3600 + 14 * 60 + 33 - 20, {});
}

// ---- SHOT 4 [34-44] close on the screen: the paused frame, the bent ear --------------------------
// The famous left ear (screen right, he faces us): drawCat draws the tip as a spike at this head
// turn, so the paused frame cuts the spike off above the crease and paints the fold as its own flap.
function bentEarFix(c) {
  // erase the straight spike above the crease, then paint the folded tip as its own flap
  c.save();
  c.globalCompositeOperation = "destination-out";
  c.beginPath(); c.moveTo(490, 60); c.lineTo(566, 60); c.lineTo(552, 166); c.lineTo(498, 164); c.closePath(); c.fill();
  c.restore();
  const A = [503, 166], B = [539, 169], tip = [574, 190];
  // underside of the flap shadows the ear just below the crease
  const sh = c.createLinearGradient(0, 168, 0, 192);
  sh.addColorStop(0, "rgba(40,16,4,0.55)"); sh.addColorStop(1, "rgba(40,16,4,0)");
  c.save();
  c.beginPath(); c.moveTo(A[0] - 2, A[1]); c.lineTo(B[0] + 4, B[1]); c.lineTo(B[0] + 8, B[1] + 22); c.lineTo(A[0] - 4, A[1] + 22); c.closePath();
  c.globalCompositeOperation = "source-atop"; c.fillStyle = sh; c.fill();
  c.restore();
  const flap = new Path2D();
  // the tip flops forward over the crease: we see its furred back, a rounded ridge on top and a
  // narrow tip hanging down and out (same width as the ear at the crease, not a cap)
  flap.moveTo(A[0], A[1]);
  flap.bezierCurveTo(508, 150, 538, 148, B[0] + 8, B[1] - 6);   // the rounded ridge of the fold
  flap.quadraticCurveTo(566, 170, tip[0], tip[1]);              // the outer edge out and down to the tip
  flap.quadraticCurveTo(546, 186, A[0] + 10, A[1] + 7);         // the inner edge back to the crease
  const fg = c.createLinearGradient(A[0], 168, tip[0], tip[1]);
  fg.addColorStop(0, "#e39a4c"); fg.addColorStop(0.55, "#b8692a"); fg.addColorStop(1, "#6e3410");
  c.fillStyle = fg; c.fill(flap);
  // light from above catches the top edge of the fold
  c.save(); c.clip(flap);
  c.strokeStyle = "rgba(255,236,200,0.75)"; c.lineWidth = 2.2;
  c.beginPath(); c.moveTo(A[0] + 2, A[1] - 2); c.bezierCurveTo(509, 152, 537, 150, B[0] + 7, B[1] - 7); c.stroke();
  // fur strokes on the back of the flap
  c.strokeStyle = "rgba(90,40,10,0.5)"; c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i < 10; i++) { const u = i / 10; const x = K.lerp(A[0] + 8, tip[0] - 4, u), y = K.lerp(166, tip[1] - 6, u); c.moveTo(x, y); c.lineTo(x + 2, y + 6); }
  c.stroke();
  c.restore();
  // the crease: a dark fold line with a thin highlight above it
  c.lineCap = "round";
  c.strokeStyle = "rgba(60,22,6,0.85)"; c.lineWidth = 1.8;
  c.beginPath(); c.moveTo(A[0] + 1, A[1] + 1); c.quadraticCurveTo(523, 173, B[0], B[1]); c.stroke();
  c.strokeStyle = "rgba(255,220,170,0.35)"; c.lineWidth = 1;
  c.beginPath(); c.moveTo(A[0] + 2, A[1] - 1.5); c.quadraticCurveTo(523, 170, B[0] - 1, B[1] - 2); c.stroke();
}
// the IR still is built from the properly shaded kit cat: fur grain (a cached strand texture), the
// IR illuminator falloff from the face down the body, and eyeshine as two hot retro-reflective disks
const PAUSED_EYES = [[434, 294], [523, 286]];
// Biscuit's bent left ear (FILMS.md model sheet): a normal triangular ear whose top third folds
// forward and down. The kit draws a straight spike at this head turn, so the tip above the crease
// is cut away and the folded flap is painted hinged on the crease: its furred back faces up into the
// light, a highlight runs along the crease ridge, and the flap shades the ear just below it.
function foldEar(c) {
  // crease 60% up the ear; the top 40% flops forward and outward, tip hanging down past the crease
  const CL = [512, 176], CR = [541, 172], T2 = [558, 213];
  c.save();
  c.globalCompositeOperation = "destination-out";
  c.beginPath(); c.moveTo(CL[0] - 10, CL[1] + 1); c.lineTo(CR[0] + 10, CR[1] + 1); c.lineTo(552, 100); c.lineTo(500, 100); c.closePath(); c.fill();
  // the flap shades the inner ear just below the crease
  c.globalCompositeOperation = "source-atop";
  const sh = c.createLinearGradient(0, CL[1], 0, CL[1] + 30);
  sh.addColorStop(0, "rgba(24,8,2,0.85)"); sh.addColorStop(1, "rgba(24,8,2,0)");
  c.fillStyle = sh; c.beginPath(); c.moveTo(CL[0] - 6, CL[1]); c.lineTo(CR[0] + 6, CR[1]); c.lineTo(T2[0] + 8, T2[1] + 6); c.lineTo(CL[0] - 2, CL[1] + 28); c.closePath(); c.fill();
  c.restore();
  // soft contact shadow of the flap, offset down-left (key light above)
  c.save();
  c.fillStyle = "#1a0a04";
  for (const [k, a] of [[4, 0.25], [2, 0.35]]) {
    c.globalAlpha = a;
    c.beginPath(); c.moveTo(CL[0] - k * 0.5, CL[1] + k); c.lineTo(CR[0], CR[1] + k); c.lineTo(T2[0] - k * 0.8, T2[1] + k * 1.2); c.closePath(); c.fill();
  }
  c.restore();
  // the flap: the furred BACK of the ear tip, a sharp fold along the top (nearly straight, slightly
  // rounded), edges tapering to the hanging tip, a touch wider than the crease (ear cartilage thins)
  const flap = new Path2D();
  flap.moveTo(CL[0] - 1, CL[1] + 0.5);
  flap.quadraticCurveTo((CL[0] + CR[0]) / 2, CL[1] - 2.6, CR[0] + 1.5, CR[1]);
  flap.quadraticCurveTo(CR[0] + 9, CR[1] + 12, T2[0], T2[1]);
  flap.quadraticCurveTo(CL[0] + 16, CL[1] + 18, CL[0] - 1, CL[1] + 0.5);
  const fg = c.createLinearGradient(CL[0], CL[1] - 2, T2[0] - 6, T2[1]);
  fg.addColorStop(0, "#f0b070"); fg.addColorStop(0.3, "#cf8440"); fg.addColorStop(1, "#7a3e14");
  c.fillStyle = fg; c.fill(flap);
  c.save(); c.clip(flap);
  // fur grain flowing down the flap toward the tip
  const pat = c.createPattern(furStreaks(), "repeat");
  if (pat && pat.setTransform && typeof DOMMatrix !== "undefined") pat.setTransform(new DOMMatrix([0.12, 0.2, -0.22, 0.12, CL[0], CL[1]]));
  c.globalCompositeOperation = "overlay"; c.globalAlpha = 0.55; c.fillStyle = pat; c.fill(flap);
  c.globalCompositeOperation = "source-over"; c.globalAlpha = 1;
  // the inner edge of the flap turns under: a thin darker band
  c.strokeStyle = "rgba(70,30,8,0.6)"; c.lineWidth = 2.2;
  c.beginPath(); c.moveTo(T2[0], T2[1]); c.quadraticCurveTo(CL[0] + 16, CL[1] + 18, CL[0] - 1, CL[1] + 0.5); c.stroke();
  // the crease ridge catches the top light: a bright soft band right on the fold
  const ridge = c.createLinearGradient(0, CL[1] - 3, 0, CL[1] + 5);
  ridge.addColorStop(0, "rgba(255,236,206,0.9)"); ridge.addColorStop(1, "rgba(255,236,206,0)");
  c.fillStyle = ridge; c.fillRect(CL[0] - 4, CL[1] - 4, CR[0] - CL[0] + 10, 9);
  c.restore();
}
function furStreaks() {
  return K.texBake("f09furstreak", 128, 128, (u, v, out) => {
    const n = K.texNoise(u * 48, v * 6, 3, 48, 6) * 0.6 + K.texNoise(u * 96, v * 10, 4, 96, 10) * 0.4;
    const b = 128 + n * 90;
    out[0] = out[1] = out[2] = b; out[3] = 255;
  });
}
function pausedIR(c) {
  foldEar(c);
  c.save();
  c.globalCompositeOperation = "source-atop";
  const pat = c.createPattern(furStreaks(), "repeat");
  if (pat && pat.setTransform && typeof DOMMatrix !== "undefined") pat.setTransform(new DOMMatrix([0.9, 0.15, -0.3, 1.6, 0, 0]));
  // fur grain, restricted to the cat: the strand pattern cut to the cat's alpha, then overlaid
  const fc = K.makeCanvas(c.canvas.width, c.canvas.height), fx = fc.getContext("2d");
  fx.drawImage(c.canvas, 0, 0);
  fx.globalCompositeOperation = "source-in"; fx.fillStyle = pat; fx.fillRect(0, 0, fc.width, fc.height);
  c.globalCompositeOperation = "overlay"; c.globalAlpha = 0.45;
  c.drawImage(fc, 0, 0);
  c.globalCompositeOperation = "source-atop"; c.globalAlpha = 1;
  const fo = c.createRadialGradient(470, 300, 60, 470, 360, 560);
  fo.addColorStop(0, "rgba(0,0,0,0)"); fo.addColorStop(0.55, "rgba(0,4,3,0.35)"); fo.addColorStop(1, "rgba(0,4,3,0.85)");
  c.fillStyle = fo; c.fillRect(0, 0, 960, 540);
  c.restore();
  c.globalCompositeOperation = "lighter";
  for (const [ex, ey] of PAUSED_EYES) {
    K.glow(c, ex, ey, 46, "#f4fff8", 0.55);
    K.glow(c, ex, ey, 18, "#ffffff", 1);
    c.fillStyle = "#ffffff"; c.beginPath(); c.ellipse(ex, ey, 11, 9, -0.1, 0, K.TAU); c.fill();
  }
  c.globalCompositeOperation = "source-over";
}
function pausedSprite() {
  // what CAM 07 holds on pause, digitally zoomed: Biscuit's head looking up into the lens. Static,
  // so it is painted once (cat on its own canvas so the ear can be cut and re-folded cleanly).
  return K.sprite("f09paused7", 640, 360, (g) => {
    g.scale(2 / 3, 2 / 3);
    const wg = g.createLinearGradient(0, 0, 0, 540);
    wg.addColorStop(0, "#1a2221"); wg.addColorStop(1, "#283230");
    g.fillStyle = wg; g.fillRect(0, 0, 960, 540);
    g.fillStyle = "#33434a"; g.fillRect(60, 0, 300, 540);
    g.fillStyle = "#1a2a2c"; g.fillRect(150, 60, 120, 150);
    g.fillStyle = "#2c3539"; g.fillRect(0, 380, 960, 30);
    K.glow(g, 760, 60, 300, "#f0fff8", 0.25);
    const cc = K.makeCanvas(960, 540);
    const c = cc.getContext("2d");
    // night-vision eyes: almond (lids half down), slit pupils, IR eyeshine, no dark liner ring
    // lit by the corridor panel straight above (hard top light, dark underside), IR eyeshine
    K.drawCat(c, 360, 960, 440, { pose: "sit", facing: 1, headTurn: 0.85, headTilt: 0.35, t: 33.2, collar: true, bell: false, tailUp: 1,
      key: { x: 470, y: 60, color: "#f0fff8", strength: 1.05 }, rim: { x: 900, y: 0, color: "#f0fff8", strength: 0.4 }, fill: "#0c1212", ambient: "#2a3638", ambientK: 0.18,
      eyesGlow: 1, pupil: 1, blink: 0.15, coat: { liner: "#5a4a26" } });
    pausedIR(c);
    g.drawImage(cc, 0, 0, 960, 540);
    // what a digital zoom on a compressed recording does: 8 x 8 blocks pulled toward their mean
    // (macro-blocking: a 1/8-size copy stamped back with nearest-neighbour) plus sensor noise.
    // (no getImageData: a canvas readback can stall for seconds on some GPUs)
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    const cv = g.canvas, bw = Math.ceil(cv.width / 8), bh = Math.ceil(cv.height / 8);
    const bc = K.makeCanvas(bw, bh), bg2 = bc.getContext("2d");
    bg2.imageSmoothingEnabled = true;
    bg2.drawImage(cv, 0, 0, bw, bh);
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 0.28;
    g.drawImage(bc, 0, 0, bw, bh, 0, 0, bw * 8, bh * 8);
    g.imageSmoothingEnabled = true;
    g.globalAlpha = 0.1;
    g.globalCompositeOperation = "overlay";
    g.drawImage(K.texture("noise", { size: 128, seed: 9 }), 0, 0, cv.width, cv.height);
    g.restore();
  });
}
const RET = [530, 192];
function shotPaused(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 34, 44));
  const rack = K.smooth(K.seg(t, 35.2, 37.6));
  const sx = 30, sy = 20, sw = 900, sh = 500;
    // once the reticle locks (38.4) the operator zooms in on the ear itself
  const ez = K.ease.inOut(K.seg(t, 38.4, 43.6));
  K.withCamera(g, W, H, { x: 480 + p * 40 + ez * 12, y: 270 - p * 30 - ez * 25, zoom: 1.0 + p * 0.12 + ez * 0.32, shakeT: t, shakeAmt: 0.8 }, () => {
    g.fillStyle = "#050809"; g.fillRect(-60, -60, W + 120, H + 120);
    // the monitor face fills the frame; the bezel peeks in at the edges
    const spr = pausedSprite();
    const blur = K.lerp(7, 0, rack);
    if (blur > 0.3) {
      const B = K.layer(W, H, "f09pausedB");
      B.g.imageSmoothingEnabled = true;
      B.g.drawImage(spr, sx, sy, sw, sh);
      K.dof(g, B.canvas, blur);
    } else {
      g.imageSmoothingEnabled = true;
      g.drawImage(spr, sx, sy, sw, sh);
    }
    g.save(); g.beginPath(); g.rect(sx, sy, sw, sh); g.clip();
    cctvGrade(g, W, H, t, { desat: 0.85, tintA: 0.4 });
    // the scanlines are crisp first, then soften as the focus racks onto the image
    scanlines(g, sx, sy, sw, sh, K.lerp(0.95, 0.4, rack), K.lerp(7, 4, rack));
    snow(g, sx, sy, sw, sh, t, 0.06, 7);
    // the reticle snaps onto the bent ear (his LEFT ear: screen right, he is facing us)
    const ra = K.smooth(K.seg(t, 37.6, 38.4));
    if (ra > 0) {
      const cx = RET[0], cy = RET[1], r = K.lerp(150, 50, K.ease.out(K.seg(t, 37.6, 38.6)));
      g.strokeStyle = K.rgba("#e9fff0", 0.9 * ra); g.lineWidth = 2.5;
      g.beginPath();
      for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        g.moveTo(cx + dx * r, cy + dy * r * 0.8 - dy * 16);
        g.lineTo(cx + dx * r, cy + dy * r * 0.8);
        g.lineTo(cx + dx * r - dx * 16, cy + dy * r * 0.8);
      }
      g.stroke();
      if (t > 38.6) hudText(g, "L EAR  MATCH", cx + r + 10, cy - r * 0.8 + 14, 16, "left", "#e9fff0", K.smooth(K.seg(t, 38.6, 39.2)) * (Math.floor(t * 3) % 2 ? 1 : 0.7));
    }
    const vg = g.createRadialGradient(480, 270, 200, 480, 270, 620);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.75)");
    g.fillStyle = vg; g.fillRect(sx, sy, sw, sh);
    // glass: a broad soft reflection and your hood's silhouette, faintly rim-lit
    const rg = g.createLinearGradient(sx, sy, sx + sw, sy + sh);
    rg.addColorStop(0, "rgba(255,255,255,0.06)"); rg.addColorStop(0.35, "rgba(255,255,255,0)"); rg.addColorStop(0.6, "rgba(255,255,255,0.03)"); rg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = rg; g.fillRect(sx, sy, sw, sh);
    const hx = 760 - p * 20, hy = 470;
    const hood = new Path2D();
    hood.moveTo(hx - 170, sy + sh);
    hood.bezierCurveTo(hx - 160, hy - 120, hx - 120, hy - 250, hx, hy - 260);
    hood.bezierCurveTo(hx + 120, hy - 250, hx + 160, hy - 120, hx + 175, sy + sh);
    hood.closePath();
    // a reflection in glass has no hard edge: the shape stamped a few times, growing, very faint
    const hg = g.createLinearGradient(0, hy - 260, 0, sy + sh);
    hg.addColorStop(0, "rgba(0,6,4,0.05)"); hg.addColorStop(1, "rgba(0,6,4,0.12)");
    g.fillStyle = hg;
    for (const sc of [1, 1.03, 1.06, 1.1]) { g.save(); g.translate(hx, sy + sh); g.scale(sc, sc); g.translate(-hx, -(sy + sh)); g.fill(hood); g.restore(); }
    // dust on the glass: sharp at first, it melts away as focus racks
    const dustBlur = rack;
    g.globalAlpha = 0.5 * (1 - dustBlur * 0.7);
    for (let i = 0; i < 26; i++) {
      const dx = sx + K.hash(i, 31) * sw, dy = sy + K.hash(i, 32) * sh, r = 1 + K.hash(i, 33) * 2 + dustBlur * 5;
      K.glow(g, dx, dy, r, "#d8fff0", 0.6);
    }
    g.globalAlpha = 1;
    g.restore();
    // bezel
    g.fillStyle = "#0b0f11";
    g.fillRect(-60, -60, W + 120, sy + 60); g.fillRect(-60, sy + sh, W + 120, 120);
    g.fillRect(-60, -60, sx + 60, H + 120); g.fillRect(sx + sw, -60, 120, H + 120);
    g.strokeStyle = "rgba(160,220,200,0.22)"; g.lineWidth = 2; g.strokeRect(sx - 1, sy - 1, sw + 2, sh + 2);
  });
  // burned-in OSD text: drawn AFTER the camera move, at fixed screen positions, so the zoom never
  // pushes it off the edge
  const y0 = H * 0.085 + 40;
  hudText(g, "CAM 07", 64, y0, 22);
  hudText(g, clock(2 * 3600 + 14 * 60 + 46), 64, y0 + 28, 22);
  hudText(g, "PAUSE", W - 150, y0, 22);
  g.fillStyle = "#e9f5ec"; g.fillRect(W - 182, y0 - 18, 7, 20); g.fillRect(W - 170, y0 - 18, 7, 20);
}

// ---- SHOT 5 [44-54] another monitor: CAM 22, the meadow barn, infrared ----------------------------
const path2 = (pts) => { const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) p.lineTo(q[0], q[1]); p.closePath(); return p; };
function barnScene(g, t) {
  // static: painted once into a sprite (the IR tape barely moves); only the cats redraw per frame
  const sk = g.createLinearGradient(0, 0, 0, 330);
  sk.addColorStop(0, "#101820"); sk.addColorStop(1, "#33424a");
  g.fillStyle = sk; g.fillRect(0, 0, 960, 540);
  K.stars(g, 960, 540, 22, 0.9, t, { yMax: 260 });
  K.hills(g, 960, 540, { y: 320, amp: 30, color: "#26322c", seed: 4 });
  irTree(g, 120, 362, 1.0, 3);
  irTree(g, 905, 352, 0.82, 8);
  // the barn (gambrel roof), door open on hay
  const bx = 520, by = 400;
  const wall = [[bx - 170, by], [bx - 170, by - 150], [bx - 120, by - 230], [bx, by - 280], [bx + 120, by - 230], [bx + 170, by - 150], [bx + 170, by]];
  poly(g, wall);
  const wg = g.createLinearGradient(bx - 170, 0, bx + 170, 0);
  wg.addColorStop(0, "#5a302a"); wg.addColorStop(0.45, "#74423a"); wg.addColorStop(1, "#4a2622");
  g.fillStyle = wg; g.fill();
  // weathered vertical boards (wood texture turned upright), multiplied over the paint
  K.texFill(g, "wood", path2(wall), { scale: 150, rot: Math.PI / 2, alpha: 0.7, mode: "multiply", tex: { color: "#a07060", dark: "#3a2018", planks: 8, seed: 51 } });
  // vertical board-and-batten planks: each board a slightly different tone, battens catch the IR
  g.save(); poly(g, wall); g.clip();
  const R = K.rng("planks");
  for (let x = bx - 170; x < bx + 170; x += 16) {
    g.fillStyle = `rgba(${R() < 0.5 ? "0,0,0" : "255,230,210"},${0.03 + R() * 0.06})`;
    g.fillRect(x, by - 290, 16, 290);
    g.fillStyle = "rgba(20,8,6,0.35)"; g.fillRect(x, by - 290, 2, 290);
    g.fillStyle = "rgba(255,225,200,0.08)"; g.fillRect(x + 2, by - 290, 1.5, 290);
    // knots + weathering streaks
    if (R() < 0.6) { g.fillStyle = "rgba(20,8,6,0.3)"; g.beginPath(); g.ellipse(x + 8, by - 30 - R() * 200, 1.8, 3, 0, 0, K.TAU); g.fill(); }
  }
  // the eave casts a deep shadow down the top of the wall; dirt splash darkens the base
  const es = g.createLinearGradient(0, by - 236, 0, by - 120);
  es.addColorStop(0, "rgba(8,4,3,0.75)"); es.addColorStop(1, "rgba(8,4,3,0)");
  g.fillStyle = es; g.fillRect(bx - 180, by - 300, 360, 180);
  const ds = g.createLinearGradient(0, by - 40, 0, by);
  ds.addColorStop(0, "rgba(10,6,4,0)"); ds.addColorStop(1, "rgba(10,6,4,0.5)");
  g.fillStyle = ds; g.fillRect(bx - 180, by - 40, 360, 40);
  g.restore();
  // roof: shingle rows with a lit top edge
  const roofO = [[bx - 180, by - 148], [bx - 125, by - 238], [bx, by - 292], [bx + 125, by - 238], [bx + 180, by - 148]];
  const roofI = [[bx + 168, by - 140], [bx + 115, by - 226], [bx, by - 276], [bx - 115, by - 226], [bx - 168, by - 140]];
  poly(g, roofO.concat(roofI));
  g.fillStyle = "#2c201c"; g.fill();
  K.texFill(g, "shingle", path2(roofO.concat(roofI)), { scale: 70, alpha: 0.8, tex: { color: "#4a403c", seed: 52 } });
  g.strokeStyle = "rgba(200,220,210,0.18)"; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(roofO[0][0], roofO[0][1]); for (const p of roofO) g.lineTo(p[0], p[1]); g.stroke();
  // hay loft door
  g.fillStyle = "#1a100c"; g.fillRect(bx - 24, by - 236, 48, 44);
  g.strokeStyle = "rgba(150,130,110,0.35)"; g.lineWidth = 2; g.strokeRect(bx - 24, by - 236, 48, 44);
  // the open doorway: darkness inside, falling off to black at the back
  const dg = g.createLinearGradient(0, by - 150, 0, by);
  dg.addColorStop(0, "#0a0605"); dg.addColorStop(1, "#1c120c");
  g.fillStyle = dg; g.fillRect(bx - 70, by - 150, 140, 150);
  g.strokeStyle = "rgba(140,124,108,0.16)"; g.lineWidth = 2;
  g.strokeRect(bx - 70, by - 150, 140, 150);
  // the two door leaves swung open against the wall: planked, X-braced, muted
  for (const sd of [-1, 1]) {
    const dx0 = bx + sd * 70, dx1 = bx + sd * 128, xl = Math.min(dx0, dx1);
    g.fillStyle = "#552c26"; g.fillRect(xl, by - 150, 58, 150);
    g.fillStyle = "rgba(0,0,0,0.18)";
    for (let k = 0; k < 4; k++) g.fillRect(xl + k * 14.5, by - 150, 1.5, 150);
    g.strokeStyle = "rgba(150,134,118,0.2)"; g.lineWidth = 2;
    g.strokeRect(xl + 1.5, by - 148.5, 55, 147);
    g.beginPath(); g.moveTo(dx0, by - 150); g.lineTo(dx1, by); g.moveTo(dx1, by - 150); g.lineTo(dx0, by); g.stroke();
    // a soft shadow where the leaf stands off the wall
    g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(sd < 0 ? xl - 6 : xl + 58, by - 150, 6, 150);
  }
  // hay piled inside and spilling out of the door
  looseHay(g, bx + 4, by - 1, 120, 26, 2, false);
  g.fillStyle = "rgba(6,4,2,0.55)"; g.fillRect(bx - 70, by - 40, 140, 40);
  // ground
  const gg = g.createLinearGradient(0, 380, 0, 540);
  gg.addColorStop(0, "#2c3a30"); gg.addColorStop(1, "#18221c");
  g.fillStyle = gg; g.fillRect(0, by - 6, 960, 200);
  // trampled turf, receding: big tiles near the camera, small toward the barn
  K.texRect(g, "turf", 0, by - 6, 960, 60, { scale: 110, scaleY: 40, alpha: 0.75, tex: { seed: 53 } });
  K.texRect(g, "turf", 0, by + 54, 960, 150, { scale: 220, scaleY: 90, alpha: 0.75, tex: { seed: 53 } });
  // the barn sits on the ground: occlusion along its base, a long soft shadow from the IR lamp
  K.aoEdge(g, bx - 175, by, bx + 175, by, { width: 22, alpha: 0.6, side: -1 });
  // stray straw scattered on the ground in front of the door
  const S = K.rng("straw");
  g.strokeStyle = "rgba(216,192,112,0.7)"; g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < 70; i++) {
    const sx = bx + (S() - 0.5) * 260, sy = by - 4 + S() * 40 * S(), a = (S() - 0.5) * 2.4, l = 4 + S() * 9;
    g.moveTo(sx, sy); g.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l * 0.4);
  }
  g.stroke();
  K.fence(g, -10, 330, by + 20, 50, { color: "#8a8478" });
  K.grass(g, -10, 970, by + 2, { seed: 5, color: "#3a4a3a", height: 14, t, wind: 0.4, density: 0.6 });
  // the hay bale by the door, and the loose hay spilled at its foot where the kitten is left
  hayBale(g, 690, 452, 128, 46, 38);
  looseHay(g, 585, 424, 190, 24, 1, false);
}
// straw: thin bright fibres at a handful of orientations over dark gaps (non-tiling, used clipped)
function strawTex() {
  const A = [[0.12, 0], [-0.42, 9], [0.85, 21], [1.35, 33], [-1.1, 47]].map(([a, o]) => [Math.cos(a), Math.sin(a), o]);
  return K.texBake("f09straw", 256, 160, (u, v, out, x, y) => {
    let b = 0;
    for (const [ca, sa, o] of A) {
      const al = x * ca + y * sa, ac = -x * sa + y * ca;
      const f = vn(al * 0.035 + o, ac * 0.9 + o * 3.1) * 0.75 + vn(al * 0.09 + o, ac * 1.7) * 0.25;
      const k = f > 0.18 ? Math.min(1, (f - 0.18) * 2.6) : 0;
      b = Math.max(b, k * (0.65 + 0.35 * vn(al * 0.01 + o, ac * 0.05)));
    }
    const d = 0.18 + b * 0.82;
    out[0] = 40 + d * 196; out[1] = 30 + d * 170; out[2] = 12 + d * 92; out[3] = 255;
  });
}
function strawFill(g, path, x, y, sc, alpha = 1) {
  g.save(); g.clip(path); g.globalAlpha *= alpha;
  const T = strawTex();
  g.drawImage(T, x, y, T.width * sc, T.height * sc);
  g.restore();
}
// a tied rectangular bale: front face (facing the camera and its IR lamp: brightest), a slightly
// darker top, rounded and frayed edges, two twine bands, darkening toward the ground (occlusion)
function hayBale(g, cx, by, w, h, dep) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = by - h;
  K.shadowBlob(g, cx + 6, by + 2, w * 0.62, 7, { alpha: 0.7 });
  const top = new Path2D();
  top.moveTo(x0 + 6, y0); top.lineTo(x0 + dep * 0.55, y0 - dep * 0.42); top.lineTo(x1 + dep * 0.5 - 4, y0 - dep * 0.42); top.lineTo(x1 - 2, y0); top.closePath();
  const front = new Path2D();
  front.moveTo(x0 + 3, by); front.lineTo(x0, y0 + 6); front.quadraticCurveTo(x0, y0, x0 + 6, y0); front.lineTo(x1 - 4, y0); front.quadraticCurveTo(x1, y0, x1, y0 + 5); front.lineTo(x1 - 2, by); front.closePath();
  const side = new Path2D();
  side.moveTo(x1 - 2, y0); side.lineTo(x1 + dep * 0.5 - 4, y0 - dep * 0.42); side.lineTo(x1 + dep * 0.5 - 4, by - dep * 0.42); side.lineTo(x1 - 2, by); side.closePath();
  g.fillStyle = "#3a2c14"; g.fill(side); strawFill(g, side, x1 - 4, y0 - dep, 0.5, 0.6);
  g.fillStyle = "rgba(10,6,2,0.55)"; g.fill(side);
  g.fillStyle = "#6a5426"; g.fill(top); strawFill(g, top, x0, y0 - dep, 0.55, 0.9);
  g.fillStyle = "rgba(10,6,2,0.18)"; g.fill(top);
  g.fillStyle = "#7a6230"; g.fill(front); strawFill(g, front, x0 - 10, y0 - 6, 0.6, 1);
  const fg = g.createLinearGradient(0, y0, 0, by);
  fg.addColorStop(0, "rgba(255,240,200,0.12)"); fg.addColorStop(0.6, "rgba(10,6,2,0.05)"); fg.addColorStop(1, "rgba(10,6,2,0.55)");
  g.fillStyle = fg; g.fill(front);
  // twine bands, pressed into the straw (a dark groove with a lit lower lip)
  for (const u of [0.28, 0.72]) {
    const tx = x0 + w * u;
    g.fillStyle = "rgba(14,8,2,0.6)"; g.fillRect(tx - 1.6, y0, 3.2, h);
    g.fillStyle = "rgba(220,200,150,0.35)"; g.fillRect(tx + 1.4, y0, 1, h);
    g.fillStyle = "rgba(14,8,2,0.5)";
    g.beginPath(); g.moveTo(tx - 1.6, y0); g.lineTo(tx + dep * 0.5 - 1.6, y0 - dep * 0.42); g.lineTo(tx + dep * 0.5 + 1.6, y0 - dep * 0.42); g.lineTo(tx + 1.6, y0); g.fill();
  }
  // frayed fibres sticking out of the edges
  const R = K.rng("bale");
  g.lineCap = "round";
  for (const [col, lw, n] of [["rgba(40,28,10,0.55)", 1.1, 40], ["rgba(226,204,140,0.75)", 0.8, 70]]) {
    g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
    for (let i = 0; i < n; i++) {
      const e = R();
      let px, py, a;
      if (e < 0.45) { px = x0 + R() * w; py = y0 + (R() - 0.5) * 3; a = -Math.PI / 2 + (R() - 0.5) * 1.8; }
      else if (e < 0.7) { px = x0 + (R() - 0.5) * 3; py = y0 + R() * h; a = Math.PI + (R() - 0.5) * 1.6; }
      else { px = x1 + (R() - 0.5) * 3; py = y0 + R() * h; a = (R() - 0.5) * 1.6; }
      const l = 3 + R() * 8;
      g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
    }
    g.stroke();
  }
}
// loose hay spilled on the ground: a low lumpy pile, fibres everywhere; front=true is the thin
// layer of strands that lies OVER the kitten (drawn after it)
function looseHay(g, cx, by, w, h, seed, front) {
  const R = K.rng("loose" + seed + (front ? "f" : ""));
  if (!front) {
    const pile = new Path2D();
    pile.moveTo(cx - w / 2, by);
    for (let i = 0; i <= 14; i++) {
      const u = i / 14, xx = cx - w / 2 + u * w;
      const hh = h * Math.sin(u * Math.PI) ** 0.7 * (0.75 + R() * 0.5);
      pile.lineTo(xx, by - hh);
    }
    pile.lineTo(cx + w / 2, by); pile.closePath();
    K.shadowBlob(g, cx, by + 1, w * 0.55, 5, { alpha: 0.6 });
    g.fillStyle = "#5a4620"; g.fill(pile);
    strawFill(g, pile, cx - w / 2 - 20, by - h - 30, 0.7, 0.95);
    const sg = g.createLinearGradient(0, by - h, 0, by);
    sg.addColorStop(0, "rgba(255,240,200,0.06)"); sg.addColorStop(1, "rgba(10,6,2,0.5)");
    g.fillStyle = sg; g.fill(pile);
  }
  g.lineCap = "round";
  const sets = front ? [["rgba(230,210,150,0.85)", 0.9, 26], ["rgba(60,44,16,0.6)", 1, 10]] : [["rgba(40,28,10,0.5)", 1.1, 50], ["rgba(226,204,140,0.7)", 0.8, 110]];
  for (const [col, lw, n] of sets) {
    g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
    for (let i = 0; i < n; i++) {
      const px = cx + (R() - 0.5) * w * (front ? 0.5 : 1.05), py = by - R() * h * (front ? 0.5 : 1.1);
      const a = (R() - 0.5) * (front ? 1.2 : 3.1), l = 4 + R() * (front ? 12 : 9);
      g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l * 0.6);
    }
    g.stroke();
  }
}
// a tree whose crown is built of many leaf clusters (each cluster textured with the kit foliage),
// self-shadowed from below, with gaps of sky between clusters
function irTree(g, x, y, s, seed) {
  const R = K.rng("irtree" + seed);
  // trunk: tapering, forking into two leaders
  const tr = new Path2D();
  tr.moveTo(x - 9 * s, y); tr.quadraticCurveTo(x - 5 * s, y - 70 * s, x - 14 * s, y - 120 * s); tr.lineTo(x - 6 * s, y - 122 * s); tr.quadraticCurveTo(x + 2 * s, y - 90 * s, x + 4 * s, y - 118 * s); tr.lineTo(x + 12 * s, y - 116 * s); tr.quadraticCurveTo(x + 6 * s, y - 60 * s, x + 10 * s, y); tr.closePath();
  g.fillStyle = "#2a2a22"; g.fill(tr);
  K.texFill(g, "bark", tr, { scale: 40 * s, alpha: 0.6, mode: "overlay" });
  const cx = x, cy = y - 165 * s, rx = 95 * s, ry = 72 * s;
  const cl = [];
  for (let i = 0; i < 46; i++) {
    const a = R() * K.TAU, r = Math.sqrt(R());
    cl.push([cx + Math.cos(a) * rx * r * 0.92, cy + Math.sin(a) * ry * r * 0.9, (12 + R() * 16) * s]);
  }
  cl.sort((a, b) => a[1] - b[1]);
  for (const [px, py, r] of cl) {
    const p = new Path2D();
    for (let k = 0; k < 5; k++) { const a = R() * K.TAU, d = r * 0.45 * R(), rr = r * (0.55 + R() * 0.35); p.moveTo(px + Math.cos(a) * d + rr, py + Math.sin(a) * d); p.arc(px + Math.cos(a) * d, py + Math.sin(a) * d, rr, 0, K.TAU); }
    // the lower clusters sit in the crown's own shadow
    const sh = K.clamp((py - (cy - ry)) / (2 * ry));
    g.fillStyle = K.mix("#4a5a48", "#1a221c", sh * 0.8);
    g.fill(p);
    K.texFill(g, "foliage", p, { scale: 70 * s, alpha: 0.75, mode: "overlay", tex: { seed: 61 } });
    const hl = g.createRadialGradient(px - r * 0.3, py - r * 0.4, r * 0.1, px, py, r * 1.1);
    hl.addColorStop(0, `rgba(200,230,200,${0.22 * (1 - sh)})`); hl.addColorStop(1, "rgba(0,0,0,0.25)");
    g.fillStyle = hl; g.fill(p);
  }
}

function barnState(t) {
  // Biscuit leads the kitten to the hay by the barn door (45.4-48.6); the kitten settles into the
  // loose hay at the foot of the bale (49.0); he lowers his head and nudges it (49.7-50.2), looks a
  // moment, then turns and walks away left (50.7-54)
  const b = {}, k = {};
  const inT = K.seg(t, 45.4, 48.6);
  b.x = K.lerp(-60, 506, K.ease.out(inT));
  b.y = K.lerp(464, 446, K.smooth(K.seg(t, 47.4, 48.6))); b.facing = 1;
  b.moving = inT > 0 && inT < 0.98;
  b.pose = b.moving ? "walk" : "stand";
  b.nudge = K.env(t, 49.7, 50.25, 0.18, 0.2);
  // he steps in to nose the kitten, then back
  b.x += 20 * K.smooth(K.seg(t, 49.3, 49.7)) * (1 - K.smooth(K.seg(t, 50.25, 50.65)));
  const out = K.seg(t, 50.7, 54.5);
  if (out > 0) { b.facing = -1; b.y = K.lerp(446, 466, K.smooth(out * 3)); b.x = K.lerp(506, -140, K.ease.in(out) * 0.6 + out * 0.4); b.moving = true; b.pose = "walk"; b.nudge = 0; }
  b.phase = t * 1.4;
  const kin = K.seg(t, 45.9, 49.0);
  // it walks in along the front, then hops up onto the threshold into the hay
  k.x = K.lerp(-150, 584, K.ease.out(kin));
  k.y = K.lerp(458, 420, K.smooth(K.seg(t, 48.2, 49.0)));
  k.moving = kin > 0 && kin < 0.97;
  k.pose = k.moving ? "walk" : "sit";
  k.phase = t * 1.8;
  // the nudge rocks the kitten a little
  k.x += Math.sin(K.seg(t, 49.85, 50.35) * Math.PI) * 4;
  return { b, k };
}
// drawCat painted once at half resolution into a sprite, then stamped (sizes in this shot are fixed)
function cachedCat(g, key, x, y, size, opts) {
  const w = size * 3.6, h = size * 2.1, ay = h - size * 0.3;
  const spr = K.sprite("f09cc:" + key, w * 0.5, h * 0.5, (c) => { c.scale(0.5, 0.5); K.drawCat(c, w / 2, ay, size, opts); });
  g.drawImage(spr, x - w / 2, y - ay, w, h);
}
const IRS = 0.5;
const EYE_K = [-4, -50, 4.6];                        // the sitting kitten's eyes from its ground point (dx, dy, half spacing)                                     // the tape's resolution (of 960 x 540)
const barnSprite = () => K.sprite("f09barn3", 960 * IRS, 540 * IRS, (s) => { s.scale(IRS, IRS); barnScene(s, 46); });
const hayFront = () => K.sprite("f09hayfront", 170, 50, (s) => { s.translate(-500, -383); looseHay(s, 585, 423, 150, 22, 1, true); });
// the IR illuminator: a hot spot on the near ground, falling off steeply (inverse square): the
// barn's interior and the tree line sink to near black. Multiplied over the tape (cached).
const irFalloff = () => K.sprite("f09irfall", 240, 135, (s) => {
  s.scale(0.25, 0.25);
  const fo = s.createRadialGradient(600, 500, 10, 580, 470, 560);
  fo.addColorStop(0, "#ffffff"); fo.addColorStop(0.16, "#eeeeee"); fo.addColorStop(0.32, "#9a9a9a"); fo.addColorStop(0.5, "#444444"); fo.addColorStop(0.75, "#181818"); fo.addColorStop(1, "#0a0a0a");
  s.fillStyle = fo; s.fillRect(0, 0, 960, 540);
});
// sensor noise is strongest where the picture is darkest: the inverse of the falloff as an alpha mask
const irNoiseMask = () => K.sprite("f09irmask", 240, 135, (s) => {
  s.scale(0.25, 0.25);
  const m = s.createRadialGradient(600, 500, 10, 580, 470, 560);
  m.addColorStop(0, "rgba(0,0,0,0.15)"); m.addColorStop(0.4, "rgba(0,0,0,0.5)"); m.addColorStop(1, "rgba(0,0,0,1)");
  s.fillStyle = m; s.fillRect(0, 0, 960, 540);
});
function shotIR(g, t, W, H) {
  const on = K.seg(t, 44.2, 45.4);
  const p = K.ease.inOut(K.seg(t, 44, 54));
  // the operator zooms the feed toward the hay as the cats arrive
  const zi = K.ease.inOut(K.seg(t, 47.2, 49.6));
  K.withCamera(g, W, H, { x: 480 + p * 20 + zi * 40, y: 270 + zi * 40, zoom: 1.03 + p * 0.03 + zi * 0.3, shakeT: t, shakeAmt: 0.9 }, () => {
    g.fillStyle = "#050809"; g.fillRect(-60, -60, W + 120, H + 120);
    const sx = 50, sy = 30, sw = 860, sh = 484;
    g.save(); g.beginPath(); g.rect(sx, sy, sw, sh); g.clip();
    if (on > 0.55) {
      const L = K.layer(960 * IRS, 540 * IRS, "f09ir3");
      L.g.drawImage(barnSprite(), 0, 0, 960 * IRS, 540 * IRS);
      L.g.save(); L.g.globalCompositeOperation = "lighter"; L.g.globalAlpha = 0.7;
      L.g.drawImage(barnSprite(), 0, 0, 960 * IRS, 540 * IRS);
      L.g.restore();
      L.g.scale(IRS, IRS);
      const s = barnState(t);
      const lightIR = { x: 480, y: 620, color: "#d8d8d8", strength: 0.42 };
      // contact shadows (the IR lamp is by the camera: shadows fall straight back, short)
      K.shadowBlob(L.g, s.b.x, s.b.y - 1, 44, 6, { alpha: 0.6 });
      K.shadowBlob(L.g, s.k.x, s.k.y - 1, 26, 4, { alpha: 0.6 });
      // the kitten (behind Biscuit, further from the camera)
      const kOpt = { coat: K.COATS.grey, collar: false, eyesGlow: 1, pupil: 1, light: lightIR, lod: 1 };
      if (s.k.pose === "sit") {
        // sitting up in the hay, facing the lens: ears, round head and two hot IR eyeshine disks
        const bl = K.env(t, 51.6, 52.3, 0.12, 0.15) > 0.5 ? 1 : 0;
        cachedCat(L.g, "ks5:" + bl, s.k.x, s.k.y, 34, Object.assign({ pose: "sit", facing: -1, t: 50, headTurn: 0.95, ears: 0.4, blink: bl, autoBlink: false, tail: 0 }, kOpt));
        if (!bl) {
          L.g.save(); L.g.globalCompositeOperation = "lighter";
          for (const ex of [-1, 1]) { const px = s.k.x + EYE_K[0] + ex * EYE_K[2], py = s.k.y + EYE_K[1]; K.glow(L.g, px, py, 10, "#f4fff0", 1); K.glow(L.g, px, py, 5, "#ffffff", 1); L.g.fillStyle = "#ffffff"; L.g.beginPath(); L.g.arc(px, py, 2.6, 0, K.TAU); L.g.fill(); }
          L.g.restore();
        }
      } else {
        const q = Math.floor((((s.k.phase % 1) + 1) % 1) * 10);
        if (s.k.pose === "walk") cachedCat(L.g, "kw4" + q, s.k.x, s.k.y, 38, Object.assign({ pose: "walk", phase: q / 10, facing: 1, t: 47 }, kOpt));
      }
      // straws lying over the kitten (it is IN the hay, not on it)
      L.g.drawImage(hayFront(), 500, 383, 170, 50);
      // walk-cycle frames and the standing / nudging poses are pre-rendered (lit by the IR lamp)
      const nq = s.b.nudge > 0.66 ? 2 : s.b.nudge > 0.25 ? 1 : 0;
      const qb = s.b.pose === "walk" ? Math.floor((((s.b.phase % 1) + 1) % 1) * 10) : -1;
      cachedCat(L.g, "b4" + s.b.pose + qb + ":" + s.b.facing + ":" + nq, s.b.x, s.b.y, 54, { pose: s.b.pose, phase: qb / 10, facing: s.b.facing, t: 47, tailUp: 0.8, eyesGlow: 1, pupil: 1, dark: true, collar: true, bell: false, light: lightIR, headTurn: s.b.pose === "stand" ? 0.3 - nq * 0.12 : 0, headTilt: -nq * 0.18, lod: 1 });
      // the sensor's gain: fur, straw and leaves reflect IR strongly, so the lit foreground runs hot
      g.imageSmoothingEnabled = true;
      g.drawImage(L.canvas, 0, 0, L.canvas.width, L.canvas.height, sx, sy, sw, sh);
      // infrared look: monochrome, lifted, green-white, eyes blown out
      cctvGrade(g, W, H, t, { desat: 1, tint: "#8dffb8", tintA: 0.85 });
      g.save();
      g.globalCompositeOperation = "multiply";
      g.drawImage(irFalloff(), sx, sy, sw, sh);
      g.globalCompositeOperation = "screen"; g.fillStyle = "rgba(12,30,18,0.3)"; g.fillRect(sx, sy, sw, sh);
      g.restore();
      // sensor noise, strongest in the darks (masked by the inverse falloff), added
      // (the tile at 1:1 on a half-res layer: fine-grained, ~2 px on screen; offset per frame)
      const N = K.layer(480, 270, "f09irnoise");
      const pat = N.g.createPattern(snowTile(Math.floor(t * 24) % 3), "repeat");
      const f = Math.floor(t * 24);
      N.g.save(); N.g.translate(-K.hash(f, 3) * 96, -K.hash(f, 4) * 54); N.g.fillStyle = pat; N.g.fillRect(0, 0, 480 + 96, 270 + 54); N.g.restore();
      N.g.globalCompositeOperation = "destination-in";
      N.g.drawImage(irNoiseMask(), 0, 0, 480, 270);
      g.save(); g.globalCompositeOperation = "screen"; g.globalAlpha = 0.32;
      g.drawImage(N.canvas, 0, 0, N.canvas.width, N.canvas.height, sx, sy, sw, sh);
      g.restore();
    }
    const flick = on < 1 ? (K.hash(Math.floor(t * 20), 3) > 0.5 ? 1 : 0.4) : 0;
    if (on < 1) snow(g, sx, sy, sw, sh, t, 0.9 * flick + (on < 0.55 ? 0.1 : 0), 9);
    if (on <= 0) { g.fillStyle = "#020303"; g.fillRect(sx, sy, sw, sh); }
    // swell 46: the monitor powers up from a bright line
    const pw = K.seg(t, 44, 44.35);
    if (pw < 1) {
      g.fillStyle = "#020303"; g.fillRect(sx, sy, sw, sh * (1 - pw) * 0.5);
      g.fillRect(sx, sy + sh - sh * (1 - pw) * 0.5, sw, sh * (1 - pw) * 0.5);
      if (pw > 0) K.glow(g, 480, sy + sh / 2, 400 * pw, "#d8ffe8", 0.6 * (1 - pw));
    }
    g.restore();
    // bezel: a smaller monitor in the wall, with its neighbours' glow at the edges
    g.fillStyle = "#0b1012";
    g.fillRect(-60, -60, W + 120, sy + 60); g.fillRect(-60, sy + sh, W + 120, 120);
    g.fillRect(-60, -60, sx + 60, H + 120); g.fillRect(sx + sw, -60, 120, H + 120);
    K.glow(g, -10, 270, 120, TEAL, 0.25);
    K.glow(g, W + 10, 200, 120, TEAL, 0.2);
    g.fillStyle = "rgba(160,220,200,0.2)"; g.fillRect(sx - 1, sy - 1, sw + 2, 1); g.fillRect(sx - 1, sy + sh, sw + 2, 1);
    g.fillStyle = on > 0 ? "#3aff9a" : "#3a0a0a";
    g.beginPath(); g.arc(sx + sw - 20, sy + sh + 14, 3, 0, K.TAU); g.fill();
    if (on > 0) K.glow(g, sx + sw - 20, sy + sh + 14, 10, "#3aff9a", 0.6);
  });
  // the burned-in OSD stays put while the image zooms (it is the recorder's overlay, not the camera's)
  if (on > 0) {
    g.save();
    g.beginPath(); g.rect(50, 30, 860, 484); g.clip();
    g.translate(50, 30);
    cctvOverlay(g, 860, 484, t, "CAM 22  MEADOW", 23 * 3600 + 51 * 60 + 7 - 44, { right: "IR", bottom: "NIGHT VISION  PLAY", snow: 0.08 });
    g.restore();
  }
}

// ---- SHOT 6 [54-62] the lab cat, the button, the map -------------------------------------------
// The lab cat: a grey tabby in a tiny lab coat. The coat is painted INTO the cat's own silhouette
// (source-atop on an offscreen layer), so it hugs the body exactly; goggles sit up on the head.
function labCat(g, W, H, x, y, s, t, catOpts, darken = 0) {
  const L = K.layer(W, H, "f09labcat");
  const c = L.g;
  K.drawCat(c, x, y, s, Object.assign({ pose: "sit", facing: -1, t, coat: K.COATS.grey, collar: false, shadow: false }, catOpts));
  const blurOK = K.hasFilter();
  c.save();
  c.globalCompositeOperation = "source-atop";
  // coat body: from the neck down to just above the paws, front legs become sleeves
  const top = y - s * 1.16, bot = y - s * 0.16;
  const coat = new Path2D();
  coat.moveTo(x - s * 0.75, top + s * 0.1);
  coat.quadraticCurveTo(x - s * 0.2, top - s * 0.06, x + s * 0.75, top + s * 0.18);
  coat.lineTo(x + s * 0.75, bot + s * 0.06);
  coat.lineTo(x - s * 0.75, bot);
  coat.closePath();
  // white cotton in a dark room: its albedo is high, but it only gets screen light
  // the fur just above the collar is shaded by it (contact occlusion), before the coat goes on
  const ao = c.createLinearGradient(0, top - s * 0.12, 0, top + s * 0.08);
  ao.addColorStop(0, "rgba(2,6,6,0)"); ao.addColorStop(1, "rgba(2,6,6,0.6)");
  c.fillStyle = ao; c.fillRect(x - s, top - s * 0.12, s * 2, s * 0.2);
  c.fillStyle = "#b4c2be";
  c.fill(coat);
  c.clip(coat);
  K.texFill(c, "fabric", coat, { scale: s * 0.16, alpha: 0.35, mode: "source-atop", tex: { color: "#7a8482", seed: 71 } });
  // form shading: a cylinder lit from below-left (the button) and from behind-right (the screens):
  // the middle of the chest falls into a broad shadow, both edges catch light
  const cyl = c.createLinearGradient(x - s * 0.75, 0, x + s * 0.75, 0);
  cyl.addColorStop(0, "rgba(6,14,14,0.15)"); cyl.addColorStop(0.35, "rgba(6,14,14,0.55)"); cyl.addColorStop(0.7, "rgba(6,14,14,0.62)"); cyl.addColorStop(1, "rgba(6,14,14,0.25)");
  c.fillStyle = cyl; c.fillRect(x - s, top - s * 0.2, s * 2, bot - top + s * 0.4);
  // the chest bulge catches the button light (low, front-left), the haunch catches the screens
  const chest = c.createRadialGradient(x - s * 0.5, y - s * 0.55, s * 0.05, x - s * 0.45, y - s * 0.6, s * 0.6);
  chest.addColorStop(0, "rgba(150,255,190,0.28)"); chest.addColorStop(1, "rgba(150,255,190,0)");
  c.fillStyle = chest; c.fillRect(x - s, top, s * 2, bot - top + s * 0.2);
  const haunch = c.createRadialGradient(x + s * 0.55, y - s * 0.55, s * 0.05, x + s * 0.5, y - s * 0.5, s * 0.5);
  haunch.addColorStop(0, "rgba(150,255,225,0.2)"); haunch.addColorStop(1, "rgba(150,255,225,0)");
  c.fillStyle = haunch; c.fillRect(x - s, top, s * 2, bot - top + s * 0.2);
  const vert = c.createLinearGradient(0, top, 0, bot);
  vert.addColorStop(0, "rgba(4,10,10,0.35)"); vert.addColorStop(0.55, "rgba(4,10,10,0)"); vert.addColorStop(1, "rgba(4,10,10,0.1)");
  c.fillStyle = vert; c.fillRect(x - s, top - s * 0.2, s * 2, bot - top + s * 0.4);
  // fabric folds as shading, not lines: each fold is a soft valley (dark) with a lit ridge beside it
  const folds = [
    [[x - s * 0.18, top + s * 0.05], [x - s * 0.36, top + s * 0.25], [x - s * 0.3, top + s * 0.5]],
    [[x + s * 0.1, top + s * 0.4], [x + s * 0.2, top + s * 0.7], [x + s * 0.12, bot]],
    [[x + s * 0.3, top + s * 0.3], [x + s * 0.42, top + s * 0.6], [x + s * 0.36, bot]],
    [[x - s * 0.55, top + s * 0.55], [x - s * 0.5, top + s * 0.75], [x - s * 0.58, bot]],
  ];
  const fold = (dx, col, a, wk) => {
    c.strokeStyle = K.rgba(col, a); c.lineWidth = s * wk; c.lineCap = "round";
    c.beginPath();
    for (const [p0, p1, p2] of folds) { c.moveTo(p0[0] + dx, p0[1]); c.quadraticCurveTo(p1[0] + dx, p1[1], p2[0] + dx, p2[1]); }
    c.stroke();
  };
  if (blurOK) c.filter = "blur(" + (s * 0.025).toFixed(1) + "px)";
  fold(0, "#020606", blurOK ? 0.55 : 0.25, 0.05);
  c.globalCompositeOperation = "source-atop";
  fold(-s * 0.045, "#7affd0", blurOK ? 0.22 : 0.1, 0.035);
  // the lapel edge: the cloth doubles over, a soft shadow under it
  c.globalCompositeOperation = "source-atop";
  c.fillStyle = "rgba(2,8,8,0.45)";
  c.beginPath(); c.moveTo(x - s * 0.02, top + s * 0.02); c.quadraticCurveTo(x - s * 0.1, top + s * 0.3, x - s * 0.28, top + s * 0.52); c.lineTo(x - s * 0.22, top + s * 0.52); c.quadraticCurveTo(x - s * 0.02, top + s * 0.3, x + s * 0.06, top + s * 0.02); c.fill();
  // the collar: a turned-down band round the neck, its lower edge throwing a soft shadow on the coat
  c.fillStyle = "rgba(2,8,8,0.4)";
  c.beginPath(); c.moveTo(x - s * 0.75, top + s * 0.17); c.quadraticCurveTo(x - s * 0.2, top + s * 0.03, x + s * 0.75, top + s * 0.25); c.lineTo(x + s * 0.75, top + s * 0.3); c.quadraticCurveTo(x - s * 0.2, top + s * 0.1, x - s * 0.75, top + s * 0.23); c.fill();
  c.filter = "none";
  const col = c.createLinearGradient(0, top, 0, top + s * 0.14);
  col.addColorStop(0, "rgba(200,240,230,0.35)"); col.addColorStop(1, "rgba(200,240,230,0)");
  c.fillStyle = col; c.fillRect(x - s, top - s * 0.05, s * 2, s * 0.2);
  // the screens behind (right) put a cool rim down the coat back edge; the button bounce (below left)
  // greens the hem
  const rimG = c.createLinearGradient(x + s * 0.75, 0, x + s * 0.5, 0);
  rimG.addColorStop(0, "rgba(150,255,220,0.42)"); rimG.addColorStop(1, "rgba(150,255,220,0)");
  c.globalCompositeOperation = "source-atop";
  c.fillStyle = rimG; c.fillRect(x + s * 0.4, top, s * 0.4, bot - top + s * 0.1);
  const bounce = c.createRadialGradient(x - s * 1.4, y + s * 0.1, s * 0.1, x - s * 1.4, y + s * 0.1, s * 1.5);
  bounce.addColorStop(0, "rgba(70,230,140,0.28)"); bounce.addColorStop(1, "rgba(40,200,110,0)");
  c.fillStyle = bounce; c.fillRect(x - s, top, s * 2, bot - top + s * 0.2);
  c.globalCompositeOperation = "source-atop";
  // breast pocket (a shallow shadow at its opening) with a pen, three buttons with a specular dot
  c.fillStyle = "rgba(2,8,8,0.3)"; c.fillRect(x + s * 0.02, top + s * 0.55, s * 0.22, s * 0.025);
  c.fillStyle = "#24468a"; c.fillRect(x + s * 0.06, top + s * 0.47, s * 0.028, s * 0.1);
  c.fillStyle = "rgba(170,210,255,0.5)"; c.fillRect(x + s * 0.064, top + s * 0.475, s * 0.008, s * 0.08);
  for (let i = 0; i < 3; i++) {
    const bx = x - s * 0.28 + i * s * 0.02, by = top + s * 0.58 + i * s * 0.14;
    c.fillStyle = "rgba(0,6,6,0.5)"; c.beginPath(); c.arc(bx + s * 0.006, by + s * 0.008, s * 0.024, 0, K.TAU); c.fill();
    c.fillStyle = "#7a8a88"; c.beginPath(); c.arc(bx, by, s * 0.021, 0, K.TAU); c.fill();
    c.fillStyle = "rgba(200,255,235,0.7)"; c.beginPath(); c.arc(bx - s * 0.007, by + s * 0.006, s * 0.006, 0, K.TAU); c.fill();
  }
  c.restore();
  // goggles pushed up on the forehead: a fabric strap round the head, two metal cups, glass lenses
  // that refract the room (an inverted, darkened view of the screens) with a sharp specular glint
  const hx = x - s * 0.25, hy = y - s * 1.7;
  c.save();
  c.globalCompositeOperation = "source-over";
  const strap = c.createLinearGradient(0, hy - s * 0.03, 0, hy + s * 0.03);
  strap.addColorStop(0, "#3a3e44"); strap.addColorStop(0.5, "#22262a"); strap.addColorStop(1, "#0c0e10");
  c.fillStyle = strap;
  c.beginPath(); c.moveTo(hx - s * 0.24, hy + s * 0.02); c.quadraticCurveTo(hx, hy - s * 0.05, hx + s * 0.24, hy + s * 0.02); c.lineTo(hx + s * 0.24, hy + s * 0.055); c.quadraticCurveTo(hx, hy - s * 0.015, hx - s * 0.24, hy + s * 0.055); c.fill();
  for (const d of [-0.085, 0.085]) {
    const lx = hx + d * s, ly = hy, R = s * 0.066;
    c.fillStyle = "rgba(0,0,0,0.45)"; c.beginPath(); c.ellipse(lx + R * 0.15, ly + R * 0.3, R * 1.1, R * 0.95, 0, 0, K.TAU); c.fill();
    const cup = c.createRadialGradient(lx - R * 0.4, ly - R * 0.5, R * 0.1, lx, ly, R * 1.05);
    cup.addColorStop(0, "#8a969a"); cup.addColorStop(0.6, "#3a4246"); cup.addColorStop(1, "#101416");
    c.fillStyle = cup; c.beginPath(); c.arc(lx, ly, R, 0, K.TAU); c.fill();
    const gl = c.createLinearGradient(lx, ly - R * 0.8, lx, ly + R * 0.8);
    gl.addColorStop(0, "#0a1a18"); gl.addColorStop(0.45, "#163a34"); gl.addColorStop(0.62, "#4a9a86"); gl.addColorStop(1, "#0c201c");
    c.fillStyle = gl; c.beginPath(); c.arc(lx, ly, R * 0.76, 0, K.TAU); c.fill();
    c.save(); c.beginPath(); c.arc(lx, ly, R * 0.76, 0, K.TAU); c.clip();
    c.globalCompositeOperation = "lighter";
    c.fillStyle = "rgba(120,255,210,0.35)"; c.fillRect(lx - R * 0.6, ly + R * 0.12, R * 1.2, R * 0.12);
    c.fillStyle = "rgba(120,255,210,0.2)"; c.fillRect(lx - R * 0.5, ly + R * 0.32, R * 1.0, R * 0.08);
    c.restore();
    c.fillStyle = "rgba(240,255,250,0.95)"; c.beginPath(); c.ellipse(lx - R * 0.32, ly - R * 0.36, R * 0.16, R * 0.09, -0.6, 0, K.TAU); c.fill();
    c.fillStyle = "rgba(200,255,240,0.35)"; c.beginPath(); c.ellipse(lx + R * 0.3, ly + R * 0.3, R * 0.1, R * 0.05, -0.6, 0, K.TAU); c.fill();
  }
  c.restore();
  if (darken > 0) {
    c.globalCompositeOperation = "source-atop";
    c.fillStyle = `rgba(3,10,10,${darken})`;
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = "source-over";
  }
  g.drawImage(L.canvas, 0, 0, W, H);
}
function topoMap(g, x, y, w, h, t, reveal) {
  // the grid + contour lines + fixed labels never change: painted once into a sprite
  const st = K.sprite("f09topo", w, h, (s) => topoStatic(s, 0, 0, w, h));
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.drawImage(st, x, y, w, h);
  const cx = x + w * 0.62, cy = y + h * 0.3;
  K.glow(g, cx, cy, w * 0.07, "#ff6a2a", 0.7 + 0.3 * Math.sin(t * 4));
  topoRoute(g, x, y, w, h, t, reveal, cx, cy);
  g.restore();
}
function topoStatic(g, x, y, w, h) {
  g.fillStyle = "#04120e"; g.fillRect(x, y, w, h);
  g.strokeStyle = "rgba(90,255,200,0.12)"; g.lineWidth = 1;
  g.beginPath();
  for (let gx = x; gx < x + w; gx += w / 16) { g.moveTo(gx, y); g.lineTo(gx, y + h); }
  for (let gy = y; gy < y + h; gy += h / 9) { g.moveTo(x, gy); g.lineTo(x + w, gy); }
  g.stroke();
  const cx = x + w * 0.62, cy = y + h * 0.3;
  for (let r = 1; r <= 9; r++) {
    g.strokeStyle = K.rgba(TEAL, 0.25 + (9 - r) * 0.05);
    g.lineWidth = r === 1 ? 2 : 1.2;
    g.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * K.TAU;
      const rr = r * w * 0.045 * (1 + K.noise(a * 1.5 + r * 0.7, 21) * 0.18);
      const px = cx + Math.cos(a) * rr * 1.3, py = cy + Math.sin(a) * rr * 0.9 + r * h * 0.015;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
  }
  // crater
  g.fillStyle = "rgba(255,106,42,0.6)"; g.beginPath(); g.ellipse(cx, cy, w * 0.03, h * 0.025, 0, 0, K.TAU); g.fill();
  hudText(g, "YOU ARE HERE", x + w * 0.16 + 14, y + h * 0.84 + 6, 15);
  hudText(g, "MOUNT HAIRBALL  ROUTE 1", x + 18, y + 30, 17);
  scanlines(g, x, y, w, h, 0.45, 4);
}
function topoRoute(g, x, y, w, h, t, reveal, cx, cy) {
  // the route: base (LAB) to the summit, revealed after the hit
  const route = [x + w * 0.16, y + h * 0.84, x + w * 0.3, y + h * 0.72, x + w * 0.27, y + h * 0.58, x + w * 0.42, y + h * 0.52, x + w * 0.4, y + h * 0.4, x + w * 0.52, y + h * 0.36, cx - 6, cy + 4];
  const S = K.sampleSpline(route, false, 10);
  const n = Math.floor(S.length * reveal);
  g.fillStyle = AMBER;
  for (let i = 0; i < n; i += 2) {
    g.beginPath(); g.arc(S[i][0], S[i][1], 2.6, 0, K.TAU); g.fill();
  }
  if (n > 0) {
    const hd = S[Math.min(S.length - 1, n - 1)];
    K.glow(g, hd[0], hd[1], 26, AMBER, 0.9);
  }
  g.fillStyle = "#e9fff4";
  g.beginPath(); g.arc(x + w * 0.16, y + h * 0.84, 6, 0, K.TAU); g.fill();
  K.glow(g, x + w * 0.16, y + h * 0.84, 22, "#e9fff4", 0.5 + 0.4 * Math.sin(t * 5));
  hudText(g, "SUMMIT CRATER", cx + 30, cy - 10, 16, "left", "#ffd8a0", K.smooth(K.seg(reveal, 0.8, 1)));
}
function shotLabCat(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 54, 56.6));
  K.withCamera(g, W, H, { x: 470 + p * 20, y: 270, zoom: 1.05 + p * 0.03, shakeT: t, shakeAmt: 1 }, () => {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0b1518"); bg.addColorStop(1, "#071012");
    g.fillStyle = bg; g.fillRect(-40, -40, W + 80, H + 80);
    // the big screen (dark, idle) on the left, monitors softly behind
    K.focus(g, W, H, 4, (f) => {
      f.drawImage(wallSprite(t, 520, 230, false), 470, 40, 520, 230);
      f.fillStyle = "#03090a"; f.fillRect(-20, 40, 420, 300);
      f.strokeStyle = "rgba(90,255,200,0.25)"; f.strokeRect(-20, 40, 420, 300);
      hudText(f, "MAP  STANDBY", 20, 80, 18, "left", "#7affd0", 0.6 + 0.4 * Math.sin(t * 3));
    }, "f09lcbg");
    K.glow(g, 700, 150, 360, TEAL, 0.18);
    // desk
    K.texRect(g, "plaster", -40, 400, W + 80, 160, { scale: 260, tex: { color: "#2a3234", grime: "#0a0e10", stain: 0.4, seed: 22 } });
    const dg = g.createLinearGradient(0, 400, 0, 560);
    dg.addColorStop(0, "rgba(4,8,9,0.15)"); dg.addColorStop(0.12, "rgba(4,8,9,0.6)"); dg.addColorStop(1, "rgba(2,4,5,0.95)");
    g.fillStyle = dg; g.fillRect(-40, 400, W + 80, 160);
    g.fillStyle = "rgba(160,255,225,0.25)"; g.fillRect(-40, 400, W + 80, 1.2);
    // the green button on the desk (same fitting as the paw insert), already glowing faintly
    K.lightPool(g, 430, 430, 150, "#2fd68a", { intensity: 0.4, flat: 0.32 });
    domeButton(g, 430, 428, 30, "#22d47a", 0.55, 0, null);
    // the lab cat: grey tabby in a tiny lab coat, goggles up on its head, looks at you
    const lc = { x: 610, y: 432, s: 165 };
    // contact: a broad soft shadow thrown back-right by the button light, a tight AO line under the haunches
    K.shadowBlob(g, lc.x + 34, lc.y + 2, 125, 12, { alpha: 0.6 });
    K.shadowBlob(g, lc.x + 6, lc.y - 1, 86, 5.5, { alpha: 0.85, soft: 0.35 });
    // key = the green button, low and in front-left (warm-green underlight); rim = the monitor wall
    // behind-right (teal on the back and the ear edges); fill = the dark room
    const key = { x: 430, y: 440, color: "#7affa8", strength: 1.05 };
    const rim = { x: 800, y: 90, color: "#8affd8", strength: 1.7 };
    // cached per head-turn step and blink/ear state: the turn is slow, the blink and twitch quick
    const ht = Math.round(K.lerp(0.65, 0.2, K.smooth(K.seg(t, 55.4, 56.2))) * 12) / 12;
    const bq = K.env(t, 54.9, 55.25, 0.08, 0.1) > 0.5 ? 1 : 0;
    const tw = K.env(t, 54.45, 54.62, 0.05, 0.08) > 0.4 || K.env(t, 55.9, 56.05, 0.04, 0.07) > 0.4 ? 1 : 0;
    const spr = labCatSprite(ht, bq, tw, W, H, lc, key, rim);
    // breathing: ~1% swell of the chest, scaled about the ground point
    const br = 1 + 0.01 * Math.sin((t - 54) * K.TAU / 2.7);
    g.save(); g.translate(lc.x, lc.y); g.scale(1 + (br - 1) * 0.6, br); g.translate(-lc.x, -lc.y);
    g.drawImage(spr, 380, 40, 480, 430);
    g.restore();
  });
}
function labCatSprite(ht, bq, tw, W, H, lc, key, rim) {
  return K.sprite("f09lc8:" + ht.toFixed(3) + ":" + bq + ":" + tw, 480, 430, (s) => {
    s.translate(-380, -40);
    labCat(s, W, H, lc.x, lc.y, lc.s, 55, { headTurn: ht, key, rim, fill: "#081012", ambient: "#163430", ambientK: 0.22, blink: bq, autoBlink: false, ears: tw ? -0.55 : 0.15, backlit: 0.5, lod: 2 }, 0.12);
  });
}
// The lab cat's forepaw, relief-rendered: a tapering furred forearm (fur flows along the limb toward
// the toes), four toes with their pink-grey beans peeking out underneath where they press, the
// carpal pad behind the wrist, and the white lab-coat sleeve (soft drape, no rings) off frame.
// Lit by the green button below (bounce on the underside, strong once it lights) and a cool rim
// from the monitor wall behind. Built in screen space at the pressed pose.
const PAW_O = [300, -160], PAW_WH = [600, 600];
const PAW_T = [468, 352];                   // the middle toe beans (contact point)
function pawSpec(lit) {
  const P = (x, y) => [x - PAW_O[0], y - PAW_O[1]];
  const dir = [-0.61, 0.79], n = [0.79, 0.61];
  const front = [474, 336];
  const at = (k, s) => [front[0] + n[0] * k + dir[0] * s, front[1] + n[1] * k + dir[1] * s];
  const ang = Math.atan2(dir[1], dir[0]);
  // toes: a compact arc (the middle two lead), merged into one mitt by wide smooth unions so the
  // fur grooves between them read as soft dips, not separate balls
  const toes = [[-36, -6], [-12, 2], [12, 2], [36, -6]];
  const prims = [
    // the white lab-coat sleeve (soft drape) off frame top right
    { k: "cap", a: P(990, -340), b: P(810, -70), ra: 112, rb: 98, z: 30, sq: 0.6, mat: 2, folds: 10 },
    // forearm: tapers from the elbow to the wrist, then swells into the paw (no rings, no tube)
    { k: "cap", a: P(800, -90), b: P(632, 150), ra: 70, rb: 50, z: 4, sq: 0.8, mat: 0, fringe: 5, blend: 16 },
    // the forearm muscle swells on the outer side just below the elbow, then the limb narrows
    { k: "ell", c: P(735, 10), rx: 92, ry: 58, rot: Math.atan2(240, -168), rz: 30, z: 8, mat: 0, fringe: 5, blend: 22 },
    { k: "cap", a: P(632, 150), b: P(540, 270), ra: 50, rb: 50, z: 2, sq: 0.8, mat: 0, fringe: 4.5, blend: 18 },
    { k: "ell", c: P(...at(0, -34)), rx: 62, ry: 58, rot: ang, rz: 30, z: 2, mat: 0, fringe: 4, blend: 18 },
    // carpal pad: peeking out on the lower edge behind the wrist, where the limb rolls toward the desk
    { k: "ell", c: P(...at(52, -78)), rx: 12, ry: 8, rot: ang + 0.4, rz: 4, z: 0, mat: 1 },
    // the four toe beans, squashed out under the toes where they press on the cap
    ...toes.map(([k, s]) => ({ k: "ell", c: P(...at(k * 1.08, s + 27)), rx: 14.5, ry: 11, rot: ang + k * 0.012, rz: 5, z: 1, mat: 1 })),
    // the furred toes over them
    ...toes.map(([k, s]) => ({ k: "ell", c: P(...at(k, s)), rx: 22, ry: 24, rot: ang + k * 0.01, rz: 19, z: 16, mat: 0, fringe: 2.5, blend: 4 })),
  ];
  const T = [PAW_T[0] - PAW_O[0], PAW_T[1] - PAW_O[1]];
  return ["f09paw3:" + lit, PAW_WH[0], PAW_WH[1], {
    prims, relief: 1, aoR: 9, ao: 0.08, res: 0.62,
    mats: [
      // grey tabby fur: fine strands along each limb, soft clumping, broken leg bars
      { color: "#8e939a", alt: "#5e636c", altF: 0.035, altK: 0.55, altBias: -0.15, bars: 0.22, barsF: 0.055, fur: 0.55, furL: 0.05, furW: 1.6, furV: 0.22, wrap: 0.45, spec: 0.06, shin: 8, rimK: 1.3, mott: 0.08 },
      // toe beans: soft grey-pink skin, a little glossy
      { color: "#9a6066", wrap: 0.3, spec: 0.5, shin: 36, mott: 0.12, rimK: 0.3, sss: "#ff6a6a", sssK: 0.2 },
      { color: "#d4dcda", wrap: 0.3, spec: 0.04, weave: 0.12, mott: 0.06, aoK: 1.3 },
    ],
    lights: [
      // the room: a dim cool overhead
      { dir: [-0.35, -0.7, 0.62], color: "#b4c8c4", k: 0.55 },
      // the button lamp right under the toes: green bounce on the underside, falls off fast
      { pos: [T[0] + 2, T[1] + 30, -26], range: 120, color: "#46ff9c", k: lit ? 2.6 : 0.8 },
    ],
    ambient: "#14222a", ground: lit ? "#0a2c18" : "#08140e",
    // the monitor wall behind: a cool teal rim on the far edge of the limb
    rim: { dir: [-0.55, -0.85], color: "#8affd8", k: 1.3, p: 2.2 },
  }];
}
function pawSprite(lit) { return reliefBake(...pawSpec(lit)); }
function shotPaw(g, t, W, H) {
  const press = K.smooth(K.seg(t, 56.9, 57.15)) * (1 - K.smooth(K.seg(t, 57.5, 57.8)));
  const lit = K.smooth(K.seg(t, 57.1, 57.25));
  K.withCamera(g, W, H, { x: 480, y: 270, zoom: 1.06, shakeT: t, shakeAmt: 1 + press * 2 }, () => {
    // the epoxy desktop, seen close: fine grain, lit only by the button and the far screens
    g.drawImage(K.sprite("f09pawdesk", W + 80, H + 80, (s) => {
      s.translate(40, 40);
      s.fillStyle = "#11191c"; s.fillRect(-40, -40, W + 80, H + 80);
      K.texRect(s, "plaster", -40, -40, W + 80, H + 80, { scale: 360, tex: { color: "#30393c", grime: "#0c1012", stain: 0.5, seed: 23 } });
      const dg = s.createLinearGradient(0, -40, 0, H);
      dg.addColorStop(0, "rgba(4,8,10,0.8)"); dg.addColorStop(0.6, "rgba(4,8,10,0.5)"); dg.addColorStop(1, "rgba(2,4,5,0.88)");
      s.fillStyle = dg; s.fillRect(-40, -40, W + 80, H + 80);
    }), -40, -40, W + 80, H + 80);
    const bx = 470, by = 382, br = 100;
    K.lightPool(g, bx, by, 300, "#2fd68a", { intensity: 0.22 + 0.45 * lit, flat: 0.45 });
    domeButton(g, bx, by, br, "#22d47a", lit, press * 2, null);
    // the glass dome's own green specular: the lamp inside reflected on the inner face of the far rim
    g.save(); g.globalCompositeOperation = "lighter";
    g.translate(bx + br * 0.32, by - br * 0.26 + press * 2); g.rotate(0.18); g.scale(1, 0.32);
    K.glow(g, 0, 0, br * 0.3, "#7affb8", 0.12 + 0.35 * lit);
    g.restore();
    // the lab cat's forepaw comes down from the top right, out of a white lab-coat sleeve
    const dn = K.ease.inOut(K.seg(t, 56.4, 57.0));
    const ox = K.lerp(170, 0, dn), oy = K.lerp(-230, 0, dn) + press * 2;
    const near = K.smooth(K.seg(dn, 0.55, 1));
    // contact shadow of the paw on the cap: wide and faint while it hovers, tight and dark on contact
    const shS = reliefShadow("f09paw3", pawSprite(0), 12);
    g.save();
    g.globalAlpha = 0.35 + 0.3 * near;
    g.beginPath(); g.rect(-40, -40, W + 80, H + 80); g.clip();
    g.drawImage(shS, PAW_O[0] + ox * 0.6 - shS.pad - 14 + (1 - near) * 30, PAW_O[1] + oy * 0.6 - shS.pad + 26 + (1 - near) * 40, shS.lw, shS.lh);
    g.restore();
    if (near > 0) {
      // the AO ring where the four beans meet the cap
      g.save(); g.translate(PAW_T[0] + 4, PAW_T[1] + 10 + press * 2); g.scale(1, 0.42);
      const cs = g.createRadialGradient(0, 0, 10, 0, 0, 70);
      cs.addColorStop(0, `rgba(0,14,6,${0.55 * near})`); cs.addColorStop(0.6, `rgba(0,14,6,${0.3 * near})`); cs.addColorStop(1, "rgba(0,14,6,0)");
      g.fillStyle = cs; g.beginPath(); g.arc(0, 0, 70, 0, K.TAU); g.fill();
      g.restore();
    }
    // motion blur on the fast descent: the paw 1/50 s earlier, faint
    const dn0 = K.ease.inOut(K.seg(t - 0.02, 56.4, 57.0));
    if (dn - dn0 > 0.004) {
      g.save(); g.globalAlpha = 0.35;
      g.drawImage(pawSprite(0), PAW_O[0] + K.lerp(170, 0, dn0), PAW_O[1] + K.lerp(-230, 0, dn0), PAW_WH[0], PAW_WH[1]);
      g.restore();
    }
    g.drawImage(pawSprite(0), PAW_O[0] + ox, PAW_O[1] + oy, PAW_WH[0], PAW_WH[1]);
    if (lit > 0) { g.save(); g.globalAlpha = lit; g.drawImage(pawSprite(1), PAW_O[0] + ox, PAW_O[1] + oy, PAW_WH[0], PAW_WH[1]); g.restore(); }
    // the lit cap throws green light up into the fur right at the contact
    if (lit > 0) K.glow(g, PAW_T[0], PAW_T[1] + 6, 90, "#3aff9a", 0.22 * lit);
  });
}
const labCatMapSprite = (W, H) => K.sprite("f09labcatmap4", W, H, (s) => labCat(s, W, H, 800, 610, 150, 58, { headTurn: -0.2, key: { x: 500, y: 200, color: "#9fffe0", strength: 1.5 }, rim: { x: 420, y: 160, color: "#9fffe0", strength: 1.6 }, fill: "#0a1214" }, 0.55));
function shotMap(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 57.8, 62.2));
  const reveal = K.ease.inOut(K.seg(t, 58.1, 61.2));
  const hit = K.flash(t, [58.0], 0.1);
  K.withCamera(g, W, H, { x: 480, y: 270 - p * 10, zoom: 1.0 + p * 0.06, shakeT: t, shakeAmt: 1 + hit * 4 }, () => {
    g.fillStyle = "#050a0b"; g.fillRect(-40, -40, W + 80, H + 80);
    topoMap(g, 40, 30, 880, 450, t, reveal);
    g.strokeStyle = "rgba(160,255,215,0.3)"; g.lineWidth = 2; g.strokeRect(40, 30, 880, 450);
    K.glow(g, 480, 260, 560, TEAL, 0.22 + hit * 0.3);
    // the lab cat, in front, silhouetted by the map glow
    // static pose: cached once instead of repainting a 150 px fur-detailed cat every frame
    g.drawImage(labCatMapSprite(W, H), 0, 0, W, H);
    if (hit > 0) { g.fillStyle = `rgba(200,255,230,${0.25 * hit})`; g.fillRect(-40, -40, W + 80, H + 80); }
  });
}

// ---- SHOT 7 [62-70] up the internal staircase, red emergency light -----------------------------
function shotStairs(g, t, W, H) {
  const p = K.ease.inOut(K.seg(t, 62, 70));
  // a real steep service stair (rise 0.2 m, run 0.26 m) between two concrete walls, seen from
  // below; a sloped ceiling; the round summit hatch at the top with lava light leaking round it
  // a slow push up the flight, handheld: low-frequency drift plus a faint step bob
  const cam = { x: 0.05 + K.noise(t * 0.6, 31) * 0.025, y: 1.25 + p * 0.6 + K.noise(t * 0.8, 32) * 0.018 + Math.sin(t * 5.2) * 0.004, z: -2.6 + p * 1.2 };
  const th = 0.36, ct = Math.cos(th), st = Math.sin(th), F = 560, CX = 480, CY = 300;
  const P = (x, y, z) => {
    const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
    const zc = Math.max(0.08, dz * ct + dy * st), yc = dy * ct - dz * st;
    const s = F / zc;
    return [CX + dx * s, CY - yc * s, s, zc];
  };
  const N = 30, RISE = 0.2, RUN = 0.26, XW = 0.95, ZTOP = N * RUN, YTOP = N * RISE;
  const ceilY = (z) => 2.7 + Math.max(0, z) * (RISE / RUN);
  // the beacon (top right, under the ceiling) rotates; its beam sweeps the left and right walls
  const sweep = t * 3.2;
  const redL = Math.pow(Math.max(0, -Math.cos(sweep)), 1.4), redR = Math.pow(Math.max(0, Math.cos(sweep)), 1.4);
  const flick = 0.85 + 0.15 * K.noise(t * 9, 4); // lava light through the hatch gap
  const hatchL = (z) => 0.3 + 0.7 * Math.exp(-(ZTOP + 0.4 - z) / 3.2) * flick;
  const shade = (z0, z1, k) => (v0, v1) => K.rgba("#050304", K.clamp(1 - k * hatchL(K.lerp(z0, z1, (v0 + v1) / 2)), 0.05, 0.94));
  g.fillStyle = "#050404"; g.fillRect(0, 0, W, H);
  // end wall above the top landing, with the hatch
  texQuad(g, P, "plaster", { color: "#5a5654", grime: "#2a2220", stain: 0.6, seed: 61 }, [-XW, YTOP, ZTOP + 0.6], [2 * XW, 0, 0], [0, ceilY(ZTOP + 0.6) - YTOP + 0.4, 0], 2, [1.4, 1.4], () => K.rgba("#060303", 0.55));
  // side walls: board-formed concrete, lit by the hatch from the top and the beacon sweep
  for (const sx of [-XW, XW]) {
    texQuad(g, P, "plaster", { color: "#6a6460", grime: "#2a2420", stain: 0.7, seed: sx < 0 ? 62 : 63 }, [sx, -0.2, -2.4], [0, ceilY(ZTOP + 0.6) + 0.2, 0], [0, 0, ZTOP + 3], 14, [1.6, 1.6], shade(-2.4, ZTOP + 0.6, 0.95), 1.4, true);
  }
  // the beacon sweep washes each wall in turn (additive red, strongest up near the beacon)
  for (const [sx, I] of [[-XW, redL], [XW, redR]]) {
    const a = P(sx, 0, -2.4), b = P(sx, ceilY(ZTOP), ZTOP);
    const rg = g.createLinearGradient(a[0], a[1], b[0], b[1]);
    rg.addColorStop(0, K.rgba("#ff2a14", 0.03 + 0.04 * I)); rg.addColorStop(0.7, K.rgba("#ff2a14", 0.05 + 0.12 * I)); rg.addColorStop(1, K.rgba("#ff3a20", 0.08 + 0.25 * I));
    g.save(); g.globalCompositeOperation = "lighter"; g.fillStyle = rg;
    const q = [P(sx, -0.2, -2.4), P(sx, ceilY(-2.4), -2.4), P(sx, ceilY(ZTOP + 0.6), ZTOP + 0.6), P(sx, -0.2, ZTOP + 0.6)];
    g.beginPath(); q.forEach((v, i) => (i ? g.lineTo(v[0], v[1]) : g.moveTo(v[0], v[1]))); g.closePath(); g.fill();
    g.restore();
  }
  // board-formed concrete: rust/water stains running down from the ceiling, form-tie holes in rows
  for (const sx of [-XW, XW]) {
    const R = K.rng("stain" + sx);
    for (let k = 0; k < 9; k++) {
      const z = -1.5 + R() * (ZTOP + 1.5), wdt = 0.08 + R() * 0.22, len = 0.8 + R() * 2.2;
      const y0 = ceilY(z), y1 = Math.max(Math.max(0, z) * (RISE / RUN), y0 - len);
      const a = P(sx, y0, z), b = P(sx, y0, z + wdt), c = P(sx, y1, z + wdt * 0.6), d = P(sx, y1, z + wdt * 0.2);
      const sg = g.createLinearGradient(0, a[1], 0, c[1]);
      sg.addColorStop(0, "rgba(14,6,4,0.45)"); sg.addColorStop(1, "rgba(14,6,4,0)");
      g.fillStyle = sg; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill();
    }
    g.fillStyle = "rgba(6,3,3,0.55)";
    g.beginPath();
    for (let z = -1.8; z < ZTOP; z += 0.9) {
      for (let yy = 0.6; yy < 3; yy += 0.9) {
        const y = Math.max(0, z) * (RISE / RUN) + yy;
        if (y > ceilY(z) - 0.2) continue;
        const h = P(sx, y, z);
        if (h[3] < 0.3) continue;
        const r = Math.max(0.6, h[2] * 0.012);
        g.moveTo(h[0] + r * 0.45, h[1]); g.ellipse(h[0], h[1], r * 0.45, r, 0, 0, K.TAU);
      }
    }
    g.fill();
  }
  // sloped ceiling: dark
  texQuad(g, P, "plaster", { color: "#3a3634", grime: "#141010", stain: 0.5, seed: 64 }, [-XW, 2.7, -2.4], [2 * XW, 0, 0], [0, 0, 2.4], 3, [1.4, 1.4], shade(-2.4, 0, 0.8));
  texQuad(g, P, "plaster", { color: "#3a3634", grime: "#141010", stain: 0.5, seed: 64 }, [-XW, 2.7, 0], [2 * XW, 0, 0], [0, ceilY(ZTOP + 0.6) - 2.7, ZTOP + 0.6], 12, [1.4, 1.4], shade(0, ZTOP + 0.6, 0.8), 1.2);
  // bottom landing floor (concrete) in front of the first step
  texQuad(g, P, "plaster", { color: "#4a4440", grime: "#1a1412", stain: 0.6, seed: 68 }, [-XW, 0, -2.4], [2 * XW, 0, 0], [0, 0, 2.4], 3, [1.2, 1.2], () => "rgba(5,3,3,0.7)");
  // the steps, far to near: steel treads (flat-shaded per step by the hatch light) with a yellow
  // anti-slip nosing and dark risers; ONE chequer-plate texture pass over the whole flight after
  const quad = (a, b, c, d) => { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); };
  for (let k = N - 1; k >= 0; k--) {
    const y = (k + 1) * RISE, z0 = k * RUN, z1 = z0 + RUN;
    if (z1 < cam.z + 0.3) continue;
    const L = hatchL(z0);
    quad(P(-XW, y - RISE, z0), P(XW, y - RISE, z0), P(XW, y, z0), P(-XW, y, z0));
    g.fillStyle = K.mix("#070505", "#3a2a22", K.clamp(L * 0.5)); g.fill();
    quad(P(-XW, y, z0), P(XW, y, z0), P(XW, y, z1), P(-XW, y, z1));
    g.fillStyle = K.mix("#0c0a0a", "#8a7262", K.clamp(L * 0.9)); g.fill();
    // occlusion: the back of each tread, tucked under the next riser
    quad(P(-XW, y, z1 - 0.07), P(XW, y, z1 - 0.07), P(XW, y, z1), P(-XW, y, z1));
    g.fillStyle = "rgba(4,2,2,0.55)"; g.fill();
    // polished wear down the middle of each tread, where every foot lands
    quad(P(-0.45, y, z0 + 0.04), P(0.45, y, z0 + 0.04), P(0.35, y, z1 - 0.08), P(-0.35, y, z1 - 0.08));
    g.fillStyle = K.rgba("#d8b8a0", 0.08 * K.clamp(L)); g.fill();
    quad(P(-XW, y, z0), P(XW, y, z0), P(XW, y, z0 + 0.05), P(-XW, y, z0 + 0.05));
    g.fillStyle = K.rgba(K.mix("#3a3010", "#e8b030", K.clamp(L * 1.2)), 0.9); g.fill();
    // the nosing's worn steel edge catches the hatch light: a thin specular line, scuffed through
    // the paint in the middle
    quad(P(-0.6, y + 0.006, z0), P(0.6, y + 0.006, z0), P(0.6, y + 0.006, z0 + 0.012), P(-0.6, y + 0.006, z0 + 0.012));
    g.fillStyle = K.rgba("#ffe6c0", K.clamp(0.15 + L * 0.5)); g.fill();
  }
  {
    // chequer-plate grain over the flight (overlay keeps each step's shading)
    const pa = P(-XW, 0, 0), pb = P(XW, 0, 0), pc = P(XW, YTOP, ZTOP), pd = P(-XW, YTOP, ZTOP);
    g.save();
    quad(pa, pb, pc, pd); g.clip();
    g.globalCompositeOperation = "overlay"; g.globalAlpha = 0.6;
    texQuad(g, P, "metal", { color: "#8a8480", seed: 66 }, [-XW, 0, 0], [2 * XW, 0, 0], [0, YTOP, ZTOP], 8, [0.6, 0.9], null, 1.3);
    g.restore();
  }
  // wall/stair occlusion lines
  for (const sx of [-XW, XW]) { const a = P(sx, 0, 0), b = P(sx, YTOP, ZTOP); K.aoEdge(g, a[0], a[1], b[0], b[1], { width: 16, alpha: 0.55, side: 0 }); }
  // the hatch: a round steel door; the lava glow leaks through the gap round its rim (a light, so full value)
  const hc = P(0, YTOP + 0.95, ZTOP + 0.58), hr = 0.62 * hc[2];
  K.lightPool(g, hc[0], hc[1] + hr * 0.8, hr * 2.4, "#ff7a2a", { intensity: 0.22 * flick, flat: 0.5 });
  // a heavy steel door frame set into the end wall round the hatch: a square plate with a raised
  // lip, bolt heads, and the stencil above it (the summit exit)
  {
    const fx0 = hc[0] - hr * 1.32, fy0 = hc[1] - hr * 1.3, fw = hr * 2.64, fh = hr * 2.7;
    g.fillStyle = "#1c1c1e"; g.fillRect(fx0, fy0, fw, fh);
    K.texRect(g, "metal", fx0, fy0, fw, fh, { scale: hr * 2, alpha: 0.4, tex: { color: "#5a5250", rust: 0.5, seed: 69 } });
    const fg = g.createLinearGradient(0, fy0, 0, fy0 + fh);
    fg.addColorStop(0, "rgba(8,4,4,0.6)"); fg.addColorStop(0.7, "rgba(8,4,4,0.2)"); fg.addColorStop(1, "rgba(255,120,60,0.12)");
    g.fillStyle = fg; g.fillRect(fx0, fy0, fw, fh);
    g.fillStyle = "rgba(255,190,140,0.18)"; g.fillRect(fx0, fy0 + fh - 2, fw, 2);
    g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(fx0 - 2, fy0, 2, fh); g.fillRect(fx0 + fw, fy0, 2, fh);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * K.TAU, bx = hc[0] + Math.cos(a) * hr * 1.15, by = hc[1] + Math.sin(a) * hr * 1.1;
      g.fillStyle = "#0a0808"; g.beginPath(); g.arc(bx + 0.6, by + 0.8, Math.max(1, hr * 0.045), 0, K.TAU); g.fill();
      g.fillStyle = K.mix("#5a4a42", "#ffb070", K.clamp(Math.sin(a) * 0.5 * flick)); g.beginPath(); g.arc(bx, by, Math.max(0.8, hr * 0.038), 0, K.TAU); g.fill();
    }
    g.save(); g.font = `800 ${Math.max(6, hr * 0.22).toFixed(1)}px ${MONO}`; g.textAlign = "center"; g.fillStyle = "rgba(210,190,150,0.55)";
    g.fillText("SUMMIT  EXIT", hc[0], fy0 - hr * 0.12); g.restore();
  }
  g.fillStyle = "#16181a"; g.beginPath(); g.ellipse(hc[0], hc[1], hr, hr * 0.94, 0, 0, K.TAU); g.fill();
  const hatchPath = new Path2D();
  hatchPath.ellipse(hc[0], hc[1], hr * 0.95, hr * 0.9, 0, 0, K.TAU);
  K.texFill(g, "metal", hatchPath, { scale: hr, alpha: 0.35, tex: { color: "#6a6460", rust: 0.4, seed: 67 } });
  g.strokeStyle = K.rgba("#ffd27a", 0.9 * flick); g.lineWidth = Math.max(1.2, hr * 0.03);
  g.beginPath(); g.ellipse(hc[0], hc[1] + hr * 0.02, hr * 1.005, hr * 0.95, 0, Math.PI * 0.05, Math.PI * 0.95); g.stroke();
  g.strokeStyle = K.rgba("#fff0c0", 0.7 * flick); g.lineWidth = Math.max(0.8, hr * 0.012);
  g.beginPath(); g.ellipse(hc[0], hc[1] + hr * 0.02, hr * 1.005, hr * 0.95, 0, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
  // the locking wheel, catching the warm light from below
  g.strokeStyle = "#4a4442"; g.lineWidth = Math.max(2, hr * 0.06);
  g.beginPath(); g.ellipse(hc[0], hc[1], hr * 0.32, hr * 0.3, 0, 0, K.TAU);
  for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3 + 0.3; g.moveTo(hc[0] + Math.cos(a) * hr * 0.32, hc[1] + Math.sin(a) * hr * 0.3); g.lineTo(hc[0] - Math.cos(a) * hr * 0.32, hc[1] - Math.sin(a) * hr * 0.3); }
  g.stroke();
  g.strokeStyle = K.rgba("#ffb070", 0.35 * flick); g.lineWidth = Math.max(0.8, hr * 0.02);
  g.beginPath(); g.ellipse(hc[0], hc[1] + hr * 0.02, hr * 0.32, hr * 0.3, 0, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  g.fillStyle = "#2a2624"; g.beginPath(); g.arc(hc[0], hc[1], hr * 0.08, 0, K.TAU); g.fill();
  // the hinges on the left edge and the dogging lever on the right
  g.fillStyle = "#2c2826";
  for (const dy of [-0.5, 0.45]) g.fillRect(hc[0] - hr * 1.08, hc[1] + dy * hr - hr * 0.09, hr * 0.2, hr * 0.18);
  g.fillRect(hc[0] + hr * 0.82, hc[1] - hr * 0.05, hr * 0.32, hr * 0.1);
  // warm light spilling down the flight from the hatch gap (through the stairwell dust)
  K.volumetricBeam(g, hc[0], hc[1] + hr * 0.9, Math.PI / 2 + 0.05, 420, 0.9, { color: "#ff9a4a", intensity: 0.32 * flick, t, width0: hr * 1.6 });
  // handrails: steel tubes, a cylinder highlight on top
  for (const sx of [-XW + 0.07, XW - 0.07]) {
    const pts = [];
    for (let z = -1.5; z <= ZTOP; z += 0.5) pts.push(P(sx, Math.max(0, z) * (RISE / RUN) + 0.95, z));
    g.lineCap = "round";
    for (const [col, wk, lift] of [["#141010", 0.05, 0], ["#7a6c66", 0.02, 0.012]]) {
      g.strokeStyle = col;
      for (let i = 1; i < pts.length; i++) {
        g.lineWidth = Math.max(1, pts[i][2] * wk);
        g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1] - pts[i - 1][2] * lift); g.lineTo(pts[i][0], pts[i][1] - pts[i][2] * lift); g.stroke();
      }
    }
  }
  // you, running up the flight away from us (feet on the treads), back-lit by the hatch
  const climb = K.ease.inOut(K.seg(t, 62.2, 69.5));
  const kz = K.lerp(0.5, ZTOP - 0.6, climb), ky = Math.max(0, kz) * (RISE / RUN);
  const kp = P(0.08, ky, kz), kh = 1.32 * kp[2];
  const ph = t * 1.9;
  const bob = -Math.abs(Math.sin(ph * Math.PI * 2)) * kh * 0.025;
  K.shadowBlob(g, kp[0], kp[1], kh * 0.14, kh * 0.02, { alpha: 0.6 });
  kidBack(g, W, H, kp[0], kp[1] + bob, kh, t, { x: hc[0], y: hc[1], color: "#ffb06a", strength: 1.4, z: -0.7 }, { run: true, phase: ph, rimA: 0.8 }, 0.45);
  // the rotating red beacon above the landing, and the beam it throws across the walls
  const bp = P(XW - 0.12, ceilY(ZTOP - 0.6) - 0.25, ZTOP - 0.6);
  // the beam spot travels along the wall as the beacon turns (from near the beacon toward us)
  const u = ((sweep / Math.PI) % 1 + 1) % 1, hz = K.lerp(ZTOP - 0.8, -0.5, u);
  const hit = P(redL > redR ? -XW : XW, Math.max(0, hz) * (RISE / RUN) + 1.4, hz);
  K.lightPool(g, hit[0], hit[1], hit[2] * 1.3, "#ff2a1a", { intensity: 0.7 * Math.max(redL, redR), flat: 1.5 });
  const hitL = hit, hitR = hit;
  const beamTo = redL > redR ? hitL : hitR;
  K.volumetricBeam(g, bp[0], bp[1], Math.atan2(beamTo[1] - bp[1], beamTo[0] - bp[0]), 760, 0.42, { color: "#ff3020", intensity: 0.38 * Math.max(redL, redR), t });
  // the beacon's downward cone falls on the top flight: a red pool sliding across the treads
  {
    const sz = ZTOP - 1.2 - (1 + Math.sin(sweep)) * 0.9, sp = P(Math.cos(sweep) * 0.5, Math.max(0, sz) * (RISE / RUN), sz);
    g.save(); g.translate(sp[0], sp[1]); g.scale(1, 0.45);
    K.lightPool(g, 0, 0, sp[2] * 0.9, "#ff2a1a", { intensity: 0.45, flat: 0.6 });
    g.restore();
  }
  g.fillStyle = "#2a0606"; g.beginPath(); g.ellipse(bp[0], bp[1], 9, 6, 0, 0, K.TAU); g.fill();
  const bl = Math.max(redL, redR);
  g.fillStyle = K.mix("#8a1408", "#fff0e8", bl); g.beginPath(); g.ellipse(bp[0] + Math.cos(sweep) * 3, bp[1] - 1, 4, 3, 0, 0, K.TAU); g.fill();
  K.lightPool(g, bp[0], bp[1], 40, "#ff2a1a", { intensity: 0.5 + bl * 0.5 });
  K.dust(g, W, H, t, { seed: 97, count: 50, color: "#ff9a6a", size: 1.5, alpha: 0.35 });
}

// ---- cache warm-up ---------------------------------------------------------------------------------
// Every heavy cache (textures, feeds, tapes, relief bakes, cat sprites) is built AHEAD of its shot by a
// job queue, in the order the film needs them. Each frame runs jobs for a small time budget (a big
// budget while the opening is still black); relief bakes are resumable, so a 1-2 s bake becomes many
// 3 ms slices; the rest are single sprites or a shot painted into a throwaway 8 x 8 context (which
// builds whatever that moment of the shot needs, at almost no paint cost). Jobs only fill caches and
// never touch the picture, so draw() stays a pure function of t.
let WARM = null, warmI = 0, warmT = -1;
const scratch = () => K.layer(8, 8, "f09warm").g;
function warmList() {
  const J = [];
  const at = (fn, tt) => J.push(() => { fn(scratch(), tt, 960, 540); return true; });
  const one = (fn) => J.push(() => { fn(); return true; });
  const bake = (spec) => J.push((dl) => reliefStep(...spec(), dl));
  one(() => K.texPrewarm([["fabric", { color: "#4a4228", seed: 7 }], ["metal", { color: "#7a7470", seed: 66 }], ["metal", { color: "#8a8480", seed: 66 }]], 400));
  one(corridorSprite); one(barnSprite);
  for (let f = 0; f < 4; f++) for (const [w, h, l] of [[280, 128, false], [880, 380, true], [520, 230, false]]) one(() => wallSprite(f / 8, w, h, l));
  at(shotWall, 10.5);
  one(() => panelBase(null, 960, 540));
  bake(() => handSpec(0)); bake(() => handSpec(1));
  one(() => reliefShadow("f09hand2:0", handSprite(0), 10));
  at(shotButton, 17.3); at(shotButton, 18.2);
  for (let tt = 20; tt < 34; tt += 0.1) at(shotCCTV, tt);
  one(pausedSprite); at(shotPaused, 36);
  one(() => { irFalloff(); irNoiseMask(); hayFront(); });
  for (let tt = 44.5; tt < 54; tt += 0.1) at(shotIR, tt);
  for (let tt = 54; tt < 56.4; tt += 0.04) at(shotLabCat, tt);
  bake(() => pawSpec(0)); bake(() => pawSpec(1));
  one(() => reliefShadow("f09paw3", pawSprite(0), 12));
  at(shotPaw, 57.3); at(shotMap, 58.5); at(shotStairs, 62.5); at(shotStairs, 69);
  return J;
}
function warmStep(t) {
  if (!WARM) WARM = warmList();
  // once per new frame time (a redraw of the same instant is not a new frame)
  if (warmI >= WARM.length || t === warmT) return;
  warmT = t;
  const t0 = performance.now(), budget = t < 1.3 ? 80 : 3;
  while (warmI < WARM.length) {
    if (WARM[warmI](t0 + budget)) warmI++;
    if (performance.now() - t0 > budget) break;
  }
}

// ---- edit -----------------------------------------------------------------------------------------
const SHOTS = [
  [0, 10, shotLab], [10, 17.2, shotWall], [17.2, 20, shotButton], [20, 34, shotCCTV], [34, 44, shotPaused],
  [44, 54, shotIR], [54, 56.4, shotLabCat], [56.4, 57.8, shotPaw], [57.8, 62, shotMap], [62, 70.5, shotStairs],
];
// cross-dissolve lengths at these cuts (short ones read as a soft cut, not a pop)
const XF = { 10: 0.8, 17.2: 0.2, 20: 0.35, 44: 0.4, 54: 0.6, 56.4: 0.2, 57.8: 0.3, 62: 0.6 };
function shotAt(t) {
  for (let i = 0; i < SHOTS.length; i++) if (t < SHOTS[i][1]) return i;
  return SHOTS.length - 1;
}
function render(g, t, W, H) {
  const i = shotAt(t);
  const [a, , fn] = SHOTS[i];
  const xin = XF[a];
  if (xin && t < a + xin && i > 0) {
    const k = K.smooth((t - a) / xin);
    SHOTS[i - 1][2](g, t, W, H);
    const L = K.layer(W, H, "f09xf");
    fn(L.g, t, W, H);
    g.save(); g.globalAlpha = k; g.drawImage(L.canvas, 0, 0, W, H); g.restore();
  } else fn(g, t, W, H);
}

export const film = {
  id: 9,
  title: "Security Footage",
  chapter: "Chapter 9",
  unlockAt: 45,
  duration: D,
  poster: 36,
  tagline: "The cameras saw everything.",
  subs: [
    [6.5, 9.8, "The lab watched everything. Every zone."],
    [12.0, 16.0, "You rewound the tapes."],
    [21.5, 25.5, "There he was. Walking. Not running."],
    [26.0, 31.0, "And behind him, small cats. Following."],
    [35.5, 40.0, "The bent ear. It was him. It was really him."],
    [47.0, 52.5, "He left a kitten in the hay. And walked away."],
    [53.0, 54.0, "Why?"],
    [56.0, 60.5, "The lab cat showed you the way. The summit."],
    [63.0, 68.0, "He was right above you."],
  ],
  voice: [
    [6.5, "The lab watched everything. Every zone.", { rate: 0.92, pitch: 1.0 }],
    [12.0, "You rewound the tapes.", { rate: 0.92, pitch: 1.0 }],
    [21.5, "There he was. Walking. Not running.", { rate: 0.92, pitch: 1.0 }],
    [26.0, "And behind him, small cats. Following.", { rate: 0.92, pitch: 1.0 }],
    [35.5, "The bent ear. It was him. It was really him.", { rate: 0.92, pitch: 1.0 }],
    [47.0, "He left a kitten in the hay. And walked away.", { rate: 0.88, pitch: 0.98 }],
    [53.0, "Why?", { rate: 0.85, pitch: 0.95 }],
    [56.0, "The lab cat showed you the way. The summit.", { rate: 0.92, pitch: 1.0 }],
    [63.0, "He was right above you.", { rate: 0.92, pitch: 1.0 }],
  ],
  // lab: cool teal fluorescent night interior; CCTV: the camera re-photographs a screen, so a
  // flatter, steadier look; stairs: warm red emergency light with hot halation
  grade: { exposure: 0.95, temp: -0.12, contrast: 1.08, lift: [0.004, 0.011, 0.013], gamma: [1, 0.98, 0.98], sat: 0.9, bloom: 0.38, halation: 0.4, streak: 0.06, grain: 0.055, vignette: 0.5, ca: 0.6 },
  gradeAt(t) {
    if (t >= 20 && t < 34) return { weave: 0, temp: 0, sat: 0.85, bloom: 0.25, streak: 0, ca: 0.9, vignette: 0.35, grain: 0.04 };
    if (t >= 34 && t < 54) return { weave: 0.6, temp: -0.05, sat: 0.88, bloom: 0.3, streak: 0, ca: 0.8, vignette: 0.45 };
    if (t >= 62) return { temp: 0.12, contrast: 1.14, lift: [0.012, 0.004, 0.004], sat: 1.0, bloom: 0.45, halation: 0.6, streak: 0.08, vignette: 0.6 };
    return {};
  },
  score: { mood: "mystery", key: "E", bpm: 80, cues: [[8, "drop"], [24, "hit"], [34, "meow"], [46, "swell"], [58, "hit"], [66, "swell"]] },
  draw(g, t, W, H) {
    g.save();
    if (W !== 960 || H !== 540) g.scale(W / 960, H / 540);
    const w = 960, h = 540;
    render(g, t, w, h);
    warmStep(t);
    // all colour, bloom, grain and vignette come from the GPU lens (film.grade / gradeAt)
    K.letterbox(g, w, h, 1);
    // the title is fully gone (5.6 s) before the first narration line (6.5 s)
    K.title(g, w, h, "Security Footage", "Chapter 9", K.env(t, 1.6, 4.6, 0.8, 1.0), { glow: "#7affd0" });
    K.fadeBlack(g, w, h, 1 - K.smooth(K.seg(t, 0, 1.4)));
    K.fadeBlack(g, w, h, K.smooth(K.seg(t, 68.4, 70)));
    g.restore();
  },
};
