// materials.js - procedural canvas textures (albedo + normal-from-height + roughness) and a shared, cached
// MeshStandardMaterial library (CONTRACT 5.6). Textures are generated lazily on first use, tileable, mipmapped,
// anisotropy 4. Nothing here touches the DOM at import time.

import { tnoise, tfbm, hash2i, rng } from "./noise.js";

const SIZES = { grass: 512, dirt: 512, rock: 512, stoneBrick: 512, woodPlank: 512, cobble: 512, roofTile: 512, sand: 512, bark: 512, plaster: 256 };

// ---- generators: each returns { size, rgb:Float32Array(3*n) sRGB 0..1, h:Float32Array(n), r:Float32Array(n)|null }
function makeBuf(S) { const n = S * S; return { size: S, rgb: new Float32Array(n * 3), h: new Float32Array(n), r: new Float32Array(n) }; }
function setPx(b, i, r, g, bl, h, ro) { b.rgb[i * 3] = r; b.rgb[i * 3 + 1] = g; b.rgb[i * 3 + 2] = bl; b.h[i] = h; b.r[i] = ro; }
function mix(a, b, t) { return a + (b - a) * t; }
function sat(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
function sstep(a, b, x) { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); }

// tileable Worley-ish cell distance (period p cells) -> {d1, d2, id}
const _cell = { d1: 0, d2: 0, id: 0, cx: 0, cy: 0 };
function cells(x, y, p, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0, bx = 0, by = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const cx = ix + ox, cy = iy + oy;
    const wx = ((cx % p) + p) % p, wy = ((cy % p) + p) % p;
    const jx = hash2i(wx, wy, seed), jy = hash2i(wx, wy, seed + 7);
    const px = cx + 0.15 + jx * 0.7, py = cy + 0.15 + jy * 0.7;
    const d = Math.hypot(x - px, y - py);
    if (d < d1) { d2 = d1; d1 = d; id = wx * 131 + wy; bx = px; by = py; } else if (d < d2) d2 = d;
  }
  _cell.d1 = d1; _cell.d2 = d2; _cell.id = id; _cell.cx = bx; _cell.cy = by;
  return _cell;
}

function strokes(b, count, seed, fn) {
  // draws short blade/strand strokes into the buffer via fn(i, t) where t is 0..1 along the stroke
  const S = b.size, R = rng(seed);
  for (let k = 0; k < count; k++) fn(R, S);
}

const GEN = {
  grass(S) {
    const b = makeBuf(S), P = 8;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S * P, v = y / S * P;
      const n = tfbm(u, v, P, 4, 11), m = tfbm(u * 0.5, v * 0.5, P / 2, 3, 12);
      const dry = sstep(0.55, 0.75, m);
      let r = mix(0.19, 0.31, n), g = mix(0.27, 0.38, n), bl = mix(0.10, 0.15, n);
      r = mix(r, 0.40, dry * 0.45); g = mix(g, 0.38, dry * 0.35); bl = mix(bl, 0.19, dry * 0.4);
      setPx(b, y * S + x, r, g, bl, n * 0.3, 0.92);
    }
    // blades
    strokes(b, S * S / 14, 101, (R, S2) => {
      const x0 = R() * S2, y0 = R() * S2, len = 4 + R() * 10, ang = -Math.PI / 2 + (R() - 0.5) * 1.4;
      const shade = R(), dx = Math.cos(ang), dy = Math.sin(ang);
      for (let t = 0; t < len; t++) {
        const xi = ((Math.round(x0 + dx * t) % S2) + S2) % S2, yi = ((Math.round(y0 + dy * t) % S2) + S2) % S2;
        const i = yi * S2 + xi, f = t / len;
        const k = 0.75 + shade * 0.6 + f * 0.25;
        b.rgb[i * 3] = mix(b.rgb[i * 3], 0.23 * k, 0.55); b.rgb[i * 3 + 1] = mix(b.rgb[i * 3 + 1], 0.36 * k, 0.55);
        b.rgb[i * 3 + 2] = mix(b.rgb[i * 3 + 2], 0.12 * k, 0.55);
        b.h[i] = Math.max(b.h[i], 0.4 + f * 0.6 * shade);
      }
    });
    return b;
  },
  dirt(S) {
    const b = makeBuf(S), P = 8;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S * P, v = y / S * P;
      const n = tfbm(u, v, P, 5, 21), c = cells(u * 3, v * 3, P * 3, 22);
      const keepP = hash2i(c.id, 1, 3) > 0.9 ? 1 : 0, prad = 0.12 + hash2i(c.id, 3, 5) * 0.16;
      const peb = sstep(prad, prad * 0.55, c.d1) * keepP;
      const rim = sstep(prad * 1.3, prad, c.d1) * keepP * (1 - peb) * 0.4; // slight shade around a pebble
      const pv = hash2i(c.id, 2, 4);
      const fine = tfbm(u * 6, v * 6, P * 6, 2, 23);
      let r = mix(0.30, 0.41, n) * (0.9 + fine * 0.2), g = mix(0.245, 0.33, n) * (0.9 + fine * 0.2), bl = mix(0.175, 0.235, n) * (0.9 + fine * 0.2);
      r *= 1 - rim * 0.25; g *= 1 - rim * 0.25; bl *= 1 - rim * 0.25;
      r = mix(r, 0.36 + pv * 0.12, peb); g = mix(g, 0.32 + pv * 0.1, peb); bl = mix(bl, 0.27 + pv * 0.08, peb);
      const h = n * 0.5 + fine * 0.15 + peb * 0.5 * (1 - c.d1 / prad * 0.8);
      setPx(b, y * S + x, r, g, bl, h, mix(0.95, 0.85, peb));
    }
    return b;
  },
  rock(S) {
    // natural rock: warped sedimentary strata, a few thin fissures, weathered patches and lichen (no paving cells)
    const b = makeBuf(S), P = 6;
    const TAU = Math.PI * 2;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S * P, v = y / S * P;
      const n = tfbm(u, v, P, 5, 31);
      const w = tfbm(u * 0.5, v * 0.5, P / 2, 3, 34);
      const strata = 0.5 + 0.5 * Math.sin((v / P * 5 + w * 1.4 + n * 0.35) * TAU);
      const fine = 0.5 + 0.5 * Math.sin((v / P * 23 + w * 2.2 + n * 0.8) * TAU);
      const rid = 1 - Math.abs(tfbm(u * 1.5, v * 1.5, P * 1.5, 4, 35) * 2 - 1);
      const fissure = sstep(0.9, 0.985, rid) * sstep(0.45, 0.6, w);
      const c = cells(u, v, P, 32);
      const soft = sstep(0.05, 0.0, c.d2 - c.d1) * 0.12;
      const weather = sstep(0.55, 0.75, tfbm(u * 0.7 + 3.1, v * 0.7, P, 3, 36));
      const lich = sstep(0.62, 0.72, tfbm(u * 2, v * 2, P * 2, 3, 33));
      const base = 0.33 + n * 0.2 + (strata - 0.5) * 0.09 + (fine - 0.5) * 0.035 + weather * 0.06;
      let r = base * 1.02, g = base * 0.98, bl = base * 0.92;
      r = mix(r, 0.42, lich * 0.45); g = mix(g, 0.47, lich * 0.45); bl = mix(bl, 0.3, lich * 0.45);
      const dk = 1 - fissure * 0.45 - soft;
      r *= dk; g *= dk; bl *= dk;
      setPx(b, y * S + x, r, g, bl, n * 0.75 + strata * 0.18 + fine * 0.05 - fissure * 0.35 - soft, mix(0.86, 0.95, fissure) - weather * 0.04);
    }
    return b;
  },
  sand(S) {
    const b = makeBuf(S), P = 8;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S * P, v = y / S * P;
      const n = tfbm(u * 2, v * 2, P * 2, 3, 41), w = tfbm(u * 0.5, v * 0.5, P / 2, 2, 42);
      const rip = 0.5 + 0.5 * Math.sin((v * 2 + w * 3) * Math.PI * 2 / 1);
      const gr = hash2i(x, y, 43);
      const base = 0.72 + n * 0.1 + (gr - 0.5) * 0.08;
      setPx(b, y * S + x, base, base * 0.88, base * 0.68, rip * 0.4 + n * 0.3 + gr * 0.15, 0.96);
    }
    return b;
  },
  bark(S) {
    const b = makeBuf(S), P = 8;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S * P, v = y / S * P;
      const n = tfbm(u * 2, v * 0.4, P * 2, 4, 51);
      const f = 1 - Math.abs(tfbm(u * 1.5, v * 0.25, P * 1.5, 3, 52) * 2 - 1);
      const fiss = sstep(0.82, 0.96, f);
      const base = 0.27 + n * 0.14;
      let r = base * 1.05, g = base * 0.86, bl = base * 0.7;
      r *= 1 - fiss * 0.6; g *= 1 - fiss * 0.6; bl *= 1 - fiss * 0.6;
      setPx(b, y * S + x, r, g, bl, n * 0.5 - fiss * 0.8, 0.93);
    }
    return b;
  },
  birch(S) {
    const b = makeBuf(S), P = 8;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S * P, v = y / S * P;
      const n = tfbm(u * 2, v * 0.6, P * 2, 3, 55);
      const mark = sstep(0.68, 0.74, tfbm(u * 0.8, v * 3.0, P * 0.8 | 1, 2, 56)) * sstep(0.4, 0.6, tnoise(u, v * 6, P * 6 | 0, 57));
      const base = 0.82 + n * 0.1;
      const k = 1 - mark * 0.8;
      setPx(b, y * S + x, base * k, base * 0.98 * k, base * 0.93 * k, n * 0.3 - mark * 0.3, 0.8);
    }
    return b;
  },
  leaves(S) {
    const b = makeBuf(S), P = 8;
    for (let i = 0; i < S * S; i++) setPx(b, i, 0.1, 0.18, 0.06, 0, 0.8);
    const R = rng(61);
    for (let k = 0; k < 900; k++) {
      const cx = R() * S, cy = R() * S, len = 10 + R() * 14, wid = len * 0.42, a = R() * Math.PI * 2;
      const shade = 0.6 + R() * 0.6, hueY = R();
      const ca = Math.cos(a), sa = Math.sin(a);
      for (let yy = -len; yy <= len; yy++) for (let xx = -len; xx <= len; xx++) {
        const lx = xx * ca + yy * sa, ly = -xx * sa + yy * ca;
        const e = (lx * lx) / (len * len * 0.25) + (ly * ly) / (wid * wid * 0.25);
        if (e > 1) continue;
        const px = ((Math.round(cx + xx) % S) + S) % S, py = ((Math.round(cy + yy) % S) + S) % S;
        const i = py * S + px;
        const vein = Math.abs(ly) < 0.8 ? 0.85 : 1;
        b.rgb[i * 3] = (0.16 + hueY * 0.1) * shade * vein; b.rgb[i * 3 + 1] = (0.34 + hueY * 0.08) * shade * vein; b.rgb[i * 3 + 2] = 0.08 * shade * vein;
        b.h[i] = (1 - e) * 0.8 + 0.2;
      }
    }
    return b;
  },
  woodPlank(S, opt) {
    const b = makeBuf(S), P = 4, dark = opt && opt.dark;
    const rows = 4;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = y / S * rows, row = Math.floor(v), fv = v - row;
      const off = hash2i(row, 0, 71) * S;
      const u = ((x + off) % S) / S;
      const plankLen = 0.5;
      const seg = Math.floor(u / plankLen), fu = u / plankLen - seg;
      const id = row * 7 + seg;
      // linear grain running along the plank: slow warp + per-line streaks (no ripples)
      const n = tfbm(u * 4, fv * 1.5 + row * 2, 4, 3, 72);
      const wv = fv + (n - 0.5) * 0.08;
      const ring = 0.5 + 0.5 * Math.sin((wv * 9 + hash2i(id, 3, 73) * 10) * Math.PI * 2);
      const streak = hash2i(Math.floor(wv * 110), id, 77);
      const grain = ring * 0.6 + streak * 0.4;
      const tone = hash2i(id, 4, 74);
      const gap = Math.min(sstep(0.0, 0.03, fv), sstep(1.0, 0.97, fv), sstep(0.0, 0.01, fu), sstep(1.0, 0.99, fu));
      const knot = sstep(0.08, 0.0, Math.hypot((fu - hash2i(id, 5, 75)) * 3, fv - 0.5) - 0.02) * (hash2i(id, 6, 76) > 0.6 ? 1 : 0);
      let base = (dark ? 0.2 : 0.42) + tone * (dark ? 0.08 : 0.14) + grain * 0.07 - knot * 0.15;
      let r = base * 1.0, g = base * (dark ? 0.72 : 0.74), bl = base * (dark ? 0.5 : 0.5);
      r *= 0.35 + gap * 0.65; g *= 0.35 + gap * 0.65; bl *= 0.35 + gap * 0.65;
      setPx(b, y * S + x, r, g, bl, gap * (0.6 + grain * 0.2) - knot * 0.2, mix(0.9, 0.78, grain));
    }
    return b;
  },
  thatch(S, opt) {
    const b = makeBuf(S), loose = opt && opt.loose;
    for (let i = 0; i < S * S; i++) setPx(b, i, 0.3, 0.24, 0.12, 0, 0.95);
    const R = rng(loose ? 82 : 81);
    const n = S * S / (loose ? 40 : 22);
    for (let k = 0; k < n; k++) {
      const x0 = R() * S, y0 = R() * S, len = 16 + R() * 30, a = Math.PI / 2 + (R() - 0.5) * (loose ? 1.6 : 0.35);
      const tone = 0.65 + R() * 0.55, dx = Math.cos(a), dy = Math.sin(a);
      for (let t = 0; t < len; t++) {
        const xi = ((Math.round(x0 + dx * t) % S) + S) % S, yi = ((Math.round(y0 + dy * t) % S) + S) % S;
        const i = yi * S + xi;
        b.rgb[i * 3] = 0.62 * tone; b.rgb[i * 3 + 1] = 0.5 * tone; b.rgb[i * 3 + 2] = 0.26 * tone;
        b.h[i] = 0.5 + 0.5 * tone - t / len * 0.3;
      }
    }
    if (!loose) {
      for (let y = 0; y < S; y++) {
        const fv = (y / S * 6) % 1;
        const sh = sstep(0.0, 0.25, fv);
        for (let x = 0; x < S; x++) { const i = y * S + x; b.rgb[i * 3] *= 0.55 + sh * 0.45; b.rgb[i * 3 + 1] *= 0.55 + sh * 0.45; b.rgb[i * 3 + 2] *= 0.55 + sh * 0.45; b.h[i] += sh * 0.5; }
      }
    }
    return b;
  },
  roofTile(S) {
    const b = makeBuf(S), rows = 8, cols = 8;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = y / S * rows, row = Math.floor(v), fv = v - row;
      const u = x / S * cols + (row % 2) * 0.5, col = Math.floor(u), fu = u - col;
      const id = row * 31 + ((col % cols) + cols) % cols;
      const curve = Math.sin(fu * Math.PI);
      const n = tfbm(x / S * 8, y / S * 8, 8, 3, 91);
      const tone = hash2i(id, 1, 92);
      const lip = sstep(0.75, 1.0, fv);
      let base = 0.42 + tone * 0.12 + n * 0.08;
      let r = base * 1.0, g = base * 0.42, bl = base * 0.3;
      const sh = (0.55 + curve * 0.45) * (1 - lip * 0.45) * (0.4 + 0.6 * sstep(0.0, 0.08, fv));
      const moss = sstep(0.66, 0.78, tfbm(x / S * 4, y / S * 4, 4, 3, 93)) * 0.6;
      r = mix(r * sh, 0.25, moss * 0.5); g = mix(g * sh, 0.3, moss * 0.5); bl = mix(bl * sh, 0.15, moss * 0.5);
      setPx(b, y * S + x, r, g, bl, curve * 0.5 + fv * 0.5 - lip * 0.2, 0.75);
    }
    return b;
  },
  stoneBrick(S) {
    const b = makeBuf(S), rows = 6, cols = 3;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = y / S * rows, row = Math.floor(v), fv = v - row;
      const u = x / S * cols + (row % 2) * 0.5, col = Math.floor(u), fu = u - col;
      const id = row * 17 + ((col % cols) + cols) % cols;
      const n = tfbm(x / S * 8, y / S * 8, 8, 4, 101);
      const edge = Math.min(fv, 1 - fv) * 0.6, edgeU = Math.min(fu, 1 - fu) * 1.2;
      const e = Math.min(edge, edgeU) + (n - 0.5) * 0.06;
      const mortar = sstep(0.035, 0.015, e);
      const tone = hash2i(id, 2, 102);
      let base = 0.42 + tone * 0.16 + n * 0.12;
      let r = base, g = base * 0.96, bl = base * 0.9;
      r = mix(r, 0.5, mortar); g = mix(g, 0.48, mortar); bl = mix(bl, 0.44, mortar);
      setPx(b, y * S + x, r, g, bl, (1 - mortar) * (0.6 + sstep(0, 0.1, e) * 0.3) + n * 0.15, mix(0.85, 0.95, mortar));
    }
    return b;
  },
  cobble(S) {
    const b = makeBuf(S), P = 6;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S * P, v = y / S * P;
      const c = cells(u, v, P, 111);
      const edge = c.d2 - c.d1;
      const stone = sstep(0.04, 0.16, edge);
      const n = tfbm(u * 4, v * 4, P * 4, 3, 112);
      const tone = hash2i(c.id, 1, 113);
      let base = 0.36 + tone * 0.18 + n * 0.08;
      let r = mix(0.22, base, stone), g = mix(0.2, base * 0.97, stone), bl = mix(0.17, base * 0.92, stone);
      setPx(b, y * S + x, r, g, bl, stone * (0.5 + Math.min(edge, 0.4)) + n * 0.1, mix(0.95, 0.72, stone));
    }
    return b;
  },
  plaster(S) {
    const b = makeBuf(S), P = 8;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S * P, v = y / S * P;
      const n = tfbm(u, v, P, 5, 121), st = sstep(0.6, 0.8, tfbm(u * 0.5, v * 0.5, P / 2, 3, 122));
      const base = 0.78 + n * 0.1 - st * 0.12;
      setPx(b, y * S + x, base, base * 0.95, base * 0.86, n * 0.6, 0.93);
    }
    return b;
  },
  cloth(S) {
    const b = makeBuf(S), P = 8;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const wx = Math.sin(x * Math.PI / 2) * 0.5 + 0.5, wy = Math.sin(y * Math.PI / 2) * 0.5 + 0.5;
      const weave = ((x >> 1) + (y >> 1)) % 2 ? wx : wy;
      const n = tfbm(x / S * P, y / S * P, P, 3, 131);
      const base = 0.75 + weave * 0.15 + n * 0.12;
      setPx(b, y * S + x, base, base, base, weave * 0.5 + n * 0.3, 0.95);
    }
    return b;
  },
  leather(S) {
    const b = makeBuf(S), P = 8;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S * P, v = y / S * P;
      const c = cells(u * 3, v * 3, P * 3, 141), n = tfbm(u, v, P, 4, 142);
      const wr = sstep(0.0, 0.12, c.d2 - c.d1);
      const base = 0.3 + n * 0.12;
      setPx(b, y * S + x, base * 1.1 * (0.8 + wr * 0.2), base * 0.72 * (0.8 + wr * 0.2), base * 0.46, wr * 0.5 + n * 0.3, mix(0.6, 0.75, n));
    }
    return b;
  },
  metal(S, opt) {
    const b = makeBuf(S), P = 8;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S * P, v = y / S * P;
      const brush = tfbm(u * 0.25, v * 8, P, 3, 151), n = tfbm(u, v, P, 4, 152);
      const base = 0.85 + brush * 0.1 + n * 0.05;
      setPx(b, y * S + x, base, base, base, brush * 0.1, mix(0.28, 0.5, n));
    }
    const R = rng(153);
    for (let k = 0; k < 60; k++) {
      let x0 = R() * S, y0 = R() * S; const a = R() * Math.PI, len = 10 + R() * 60;
      for (let t = 0; t < len; t++) { const xi = ((Math.round(x0 + Math.cos(a) * t) % S) + S) % S, yi = ((Math.round(y0 + Math.sin(a) * t) % S) + S) % S; b.r[yi * S + xi] = 0.7; b.h[yi * S + xi] -= 0.1; }
    }
    return b;
  },
  cheese(S) {
    const b = makeBuf(S), P = 4;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S * P, v = y / S * P;
      const c = cells(u * 1.5, v * 1.5, P * 1.5, 161);
      const rad = 0.12 + hash2i(c.id, 1, 162) * 0.18;
      const hole = sstep(rad, rad - 0.05, c.d1) * (hash2i(c.id, 2, 163) > 0.45 ? 1 : 0);
      const n = tfbm(u * 2, v * 2, P * 2, 3, 164);
      let r = 0.95 + n * 0.05, g = 0.78 + n * 0.06, bl = 0.3;
      r *= 1 - hole * 0.25; g *= 1 - hole * 0.3; bl *= 1 - hole * 0.3;
      setPx(b, y * S + x, r, g, bl, 1 - hole * (1 - c.d1 / rad), 0.55);
    }
    return b;
  },
  fur(S, opt) {
    const b = makeBuf(S);
    const c1 = opt.c1, c2 = opt.c2;
    for (let i = 0; i < S * S; i++) setPx(b, i, c1[0], c1[1], c1[2], 0.2, 0.9);
    const R = rng(opt.seed || 171);
    for (let k = 0; k < S * S / 6; k++) {
      const x0 = R() * S, y0 = R() * S, len = 3 + R() * 6, a = Math.PI / 2 + (R() - 0.5) * 0.8, t0 = R();
      for (let t = 0; t < len; t++) {
        const xi = ((Math.round(x0 + Math.cos(a) * t) % S) + S) % S, yi = ((Math.round(y0 + Math.sin(a) * t) % S) + S) % S;
        const i = yi * S + xi, f = t / len;
        b.rgb[i * 3] = mix(c1[0], c2[0], t0) * (0.8 + f * 0.4); b.rgb[i * 3 + 1] = mix(c1[1], c2[1], t0) * (0.8 + f * 0.4); b.rgb[i * 3 + 2] = mix(c1[2], c2[2], t0) * (0.8 + f * 0.4);
        b.h[i] = 0.3 + f * 0.7;
      }
    }
    if (opt.stripes) {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const s = sstep(0.55, 0.7, 0.5 + 0.5 * Math.sin((x / S * 6 + tfbm(x / S * 4, y / S * 4, 4, 2, 172) * 1.5) * Math.PI * 2));
        const i = y * S + x; b.rgb[i * 3] *= 1 - s * 0.45; b.rgb[i * 3 + 1] *= 1 - s * 0.5; b.rgb[i * 3 + 2] *= 1 - s * 0.5;
      }
    }
    return b;
  },
  skin(S) {
    const b = makeBuf(S), P = 8;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = tfbm(x / S * P, y / S * P, P, 4, 181), p = hash2i(x, y, 182);
      const base = 0.88 + n * 0.1 + (p - 0.5) * 0.03;
      setPx(b, y * S + x, base, base * 0.93, base * 0.9, n * 0.2 + p * 0.05, 0.6);
    }
    return b;
  },
  hair(S) {
    const b = makeBuf(S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const s = tfbm(x / S * 32, y / S * 1, 32, 3, 191);
      const base = 0.7 + s * 0.4;
      setPx(b, y * S + x, base, base, base, s, 0.55);
    }
    return b;
  },
  flat(S, opt) {
    const b = makeBuf(S), P = 8, c = opt.c;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = tfbm(x / S * P, y / S * P, P, 4, opt.seed || 201);
      const vein = opt.veins ? sstep(0.9, 0.98, 1 - Math.abs(tfbm(x / S * 3, y / S * 3, 3, 4, 202) * 2 - 1)) : 0;
      const k = 1 + (n - 0.5) * (opt.var || 0.1);
      setPx(b, y * S + x, c[0] * k + vein * opt.veins[0], c[1] * k + vein * opt.veins[1], c[2] * k + vein * opt.veins[2], n * (opt.bump || 0.3), sat((opt.rough || 0.5) + (n - 0.5) * (opt.rvar || 0.1)));
    }
    return b;
  },
  portal(S) {
    const b = makeBuf(S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S - 0.5, v = y / S - 0.5;
      const r = Math.hypot(u, v), a = Math.atan2(v, u);
      const sw = 0.5 + 0.5 * Math.sin(a * 3 + r * 22 + tnoise(u * 8 + 4, v * 8 + 4, 64, 211) * 3);
      const k = (1 - sat(r * 2)) * (0.3 + sw * 0.7);
      setPx(b, y * S + x, 0.12 + k * 0.4, 0.02 + k * 0.08, 0.18 + k * 0.55, sw * 0.3, 0.2);
    }
    return b;
  },
  bone(S) {
    const b = makeBuf(S), P = 8;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = tfbm(x / S * P, y / S * P, P, 4, 221), pore = hash2i(x, y, 222) > 0.97 ? 1 : 0;
      const base = 0.8 + n * 0.12 - pore * 0.2;
      setPx(b, y * S + x, base, base * 0.95, base * 0.84, n * 0.4 - pore * 0.3, 0.7);
    }
    return b;
  },
  cactus(S) {
    const b = makeBuf(S), ribs = 10;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S * ribs, fu = u - Math.floor(u);
      const rib = Math.sin(fu * Math.PI);
      const n = tfbm(x / S * 8, y / S * 8, 8, 3, 231);
      const spine = (Math.abs(fu - 0.5) < 0.06 && ((y + Math.floor(u) * 7) % 24) < 2) ? 1 : 0;
      let base = 0.2 + rib * 0.1 + n * 0.06;
      setPx(b, y * S + x, base * 0.85 + spine * 0.6, base * 1.45 + spine * 0.5, base * 0.7 + spine * 0.4, rib * 0.7 + spine * 0.3, 0.7);
    }
    return b;
  },
  paper(S) {
    const b = makeBuf(S), P = 8;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = tfbm(x / S * P, y / S * P, P, 5, 241), f = tfbm(x / S * 32, y / S * 4, 32, 2, 242);
      const base = 0.88 + n * 0.06 + f * 0.04;
      setPx(b, y * S + x, base, base * 0.96, base * 0.86, n * 0.2 + f * 0.1, 0.9);
    }
    return b;
  },
  cardboard(S) {
    const b = makeBuf(S), P = 8;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = tfbm(x / S * P, y / S * P, P, 4, 251), corr = 0.5 + 0.5 * Math.sin(y / S * Math.PI * 2 * 40);
      const base = 0.5 + n * 0.1 + corr * 0.04;
      setPx(b, y * S + x, base, base * 0.76, base * 0.52, corr * 0.3 + n * 0.2, 0.92);
    }
    return b;
  },
  rust(S) {
    const b = makeBuf(S), P = 8;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S * P, v = y / S * P;
      const n = tfbm(u, v, P, 5, 261), m = sstep(0.4, 0.6, tfbm(u * 2, v * 2, P * 2, 3, 262));
      let r = mix(0.3, 0.5, n), g = mix(0.15, 0.24, n), bl = mix(0.08, 0.1, n);
      r = mix(r, 0.36, (1 - m) * 0.4); g = mix(g, 0.3, (1 - m) * 0.4); bl = mix(bl, 0.28, (1 - m) * 0.4);
      setPx(b, y * S + x, r, g, bl, n * 0.8, mix(0.6, 0.95, m));
    }
    return b;
  }
};

// material name -> { gen, opt, size, props }
const LIB = {
  grass: { gen: "grass", rough: 0.95 },
  dirt: { gen: "dirt", rough: 0.95 },
  rock: { gen: "rock", rough: 0.88, normalScale: 1.4 },
  sand: { gen: "sand", rough: 0.97, normalScale: 0.8 },
  bark: { gen: "bark", rough: 0.93, normalScale: 1.6 },
  birchBark: { gen: "birch", rough: 0.8 },
  leaves: { gen: "leaves", rough: 0.8 },
  woodPlank: { gen: "woodPlank", rough: 0.82, normalScale: 1.2 },
  woodDark: { gen: "woodPlank", opt: { dark: true }, rough: 0.8, normalScale: 1.2, key: "woodDark" },
  thatch: { gen: "thatch", rough: 0.96, normalScale: 1.6 },
  roofTile: { gen: "roofTile", rough: 0.75, normalScale: 1.5 },
  stoneBrick: { gen: "stoneBrick", rough: 0.9, normalScale: 1.5 },
  cobble: { gen: "cobble", rough: 0.85, normalScale: 1.6 },
  plaster: { gen: "plaster", rough: 0.94, normalScale: 0.6 },
  clothRed: { gen: "cloth", color: "#8a2a24", rough: 0.95, normalScale: 0.6 },
  clothBlue: { gen: "cloth", color: "#2f4a78", rough: 0.95, normalScale: 0.6 },
  clothWhite: { gen: "cloth", color: "#e6e1d4", rough: 0.95, normalScale: 0.6 },
  clothGreen: { gen: "cloth", color: "#4c6a3a", rough: 0.95, normalScale: 0.6 },
  leather: { gen: "leather", rough: 0.7, normalScale: 0.8 },
  iron: { gen: "metal", color: "#9aa0a6", metal: 1, rough: 0.38, normalScale: 0.3 },
  gold: { gen: "metal", color: "#e0b050", metal: 1, rough: 0.3, normalScale: 0.25 },
  cheese: { gen: "cheese", rough: 0.55, normalScale: 1.2 },
  furRat: { gen: "fur", opt: { c1: [0.28, 0.24, 0.2], c2: [0.45, 0.4, 0.34], seed: 171 }, rough: 0.92, normalScale: 0.8, key: "furRat" },
  furCat: { gen: "fur", opt: { c1: [0.62, 0.36, 0.14], c2: [0.85, 0.6, 0.3], seed: 173, stripes: true }, rough: 0.92, normalScale: 0.8, key: "furCat" },
  skin: { gen: "skin", color: "#e0b090", rough: 0.6, normalScale: 0.2 },
  hair: { gen: "hair", color: "#3a2a1a", rough: 0.55, normalScale: 0.4 },
  obsidian: { gen: "flat", opt: { c: [0.03, 0.025, 0.04], veins: [0.08, 0.02, 0.12], var: 0.2, rough: 0.12, rvar: 0.08, seed: 271 }, rough: 0.12, metal: 0.1, key: "obsidian" },
  ink: { gen: "flat", opt: { c: [0.01, 0.01, 0.012], var: 0.1, rough: 0.2, seed: 272, bump: 0.15 }, rough: 0.2, key: "ink" },
  glassBlack: { gen: "flat", opt: { c: [0.02, 0.02, 0.025], var: 0.05, rough: 0.05, rvar: 0.02, seed: 273, bump: 0.02 }, rough: 0.05, metal: 0.2, key: "glassBlack" },
  portal: { gen: "portal", rough: 0.2, emissive: 0.6 },
  bone: { gen: "bone", rough: 0.72 },
  cactus: { gen: "cactus", rough: 0.7, normalScale: 1.5 },
  straw: { gen: "thatch", opt: { loose: true }, rough: 0.95, normalScale: 1.2, key: "straw" },
  paper: { gen: "paper", rough: 0.9, normalScale: 0.3 },
  cardboard: { gen: "cardboard", rough: 0.92, normalScale: 0.6 },
  rust: { gen: "rust", rough: 0.85, metal: 0.3, normalScale: 1.2 }
};

export const MATERIAL_NAMES = Object.keys(LIB);

export function createMaterials(THREE, engine) {
  const texCache = {};    // key -> { map, normal, rough }
  const matCache = {};    // key -> material
  const maxAniso = Math.min(4, engine.renderer.capabilities.getMaxAnisotropy ? engine.renderer.capabilities.getMaxAnisotropy() : 4);

  function canvasOf(S) {
    const c = document.createElement("canvas"); c.width = S; c.height = S; return c;
  }

  function toTexture(canvas, srgb) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }

  function build(def, name) {
    const key = def.key || def.gen;
    if (texCache[key]) return texCache[key];
    const S = SIZES[name] || SIZES[def.gen] || 256;
    const b = GEN[def.gen](S, def.opt || {});
    const n = S * S;
    const cA = canvasOf(S), cN = canvasOf(S), cR = canvasOf(S);
    const gA = cA.getContext("2d"), gN = cN.getContext("2d"), gR = cR.getContext("2d");
    const iA = gA.createImageData(S, S), iN = gN.createImageData(S, S), iR = gR.createImageData(S, S);
    const A = iA.data, N = iN.data, Rr = iR.data;
    const str = 3.0 * (S / 256);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      A[i * 4] = Math.max(0, Math.min(255, b.rgb[i * 3] * 255));
      A[i * 4 + 1] = Math.max(0, Math.min(255, b.rgb[i * 3 + 1] * 255));
      A[i * 4 + 2] = Math.max(0, Math.min(255, b.rgb[i * 3 + 2] * 255));
      A[i * 4 + 3] = 255;
      const xl = (x - 1 + S) % S, xr = (x + 1) % S, yu = (y - 1 + S) % S, yd = (y + 1) % S;
      const dx = (b.h[y * S + xr] - b.h[y * S + xl]) * str;
      const dy = (b.h[yd * S + x] - b.h[yu * S + x]) * str;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      N[i * 4] = (-dx * inv * 0.5 + 0.5) * 255;
      N[i * 4 + 1] = (dy * inv * 0.5 + 0.5) * 255;
      N[i * 4 + 2] = (inv * 0.5 + 0.5) * 255;
      N[i * 4 + 3] = 255;
      const r = b.r[i];
      Rr[i * 4] = Rr[i * 4 + 1] = Rr[i * 4 + 2] = Math.max(0, Math.min(255, r * 255));
      Rr[i * 4 + 3] = 255;
    }
    gA.putImageData(iA, 0, 0); gN.putImageData(iN, 0, 0); gR.putImageData(iR, 0, 0);
    const out = { map: toTexture(cA, true), normal: toTexture(cN, false), rough: toTexture(cR, false), size: S };
    texCache[key] = out;
    return out;
  }

  function textures(name) {
    const def = LIB[name] || LIB.plaster;
    return build(def, name);
  }

  function get(name, opts) {
    const def = LIB[name];
    if (!def) { console.warn("[materials] unknown material", name); return get("plaster", opts); }
    const color = opts && opts.color != null ? opts.color : null;
    const rep = opts && opts.repeat ? opts.repeat : null;
    const key = name + "|" + (color == null ? "" : String(color)) + "|" + (rep ? rep[0] + "x" + rep[1] : "");
    if (matCache[key]) return matCache[key];
    const t = textures(name);
    let map = t.map, normal = t.normal, rough = t.rough;
    if (rep) {
      map = t.map.clone(); normal = t.normal.clone(); rough = t.rough.clone();
      for (const x of [map, normal, rough]) { x.repeat.set(rep[0], rep[1]); x.needsUpdate = true; }
    }
    const m = new THREE.MeshStandardMaterial({
      map, normalMap: normal, roughnessMap: rough,
      roughness: 1, metalness: def.metal || 0,
      color: color != null ? color : (def.color || 0xffffff)
    });
    m.normalScale.set(def.normalScale || 1, def.normalScale || 1);
    // roughnessMap stores absolute roughness (factor 1)
    m.roughness = 1;
    if (def.emissive) { m.emissive = new THREE.Color(1, 1, 1); m.emissiveMap = map; m.emissiveIntensity = def.emissive; }
    m.name = "mat:" + name;
    matCache[key] = m;
    return m;
  }

  return {
    get,
    texture(name) { return textures(name).map; },
    normalMap(name) { return textures(name).normal; },
    roughnessMap(name) { return textures(name).rough; },
    names: MATERIAL_NAMES,
    // pre-generate a list of textures spread over frames
    async warm(list) {
      for (const n of list) { textures(n); await engine.yieldFrame(); }
    }
  };
}

export const _GEN = GEN; // for tests
