/* ===========================================================================
   tex.js - every surface in this game is painted at runtime onto a canvas.
   No image files: value noise, a few loops, and a matching bump map for each
   one, which is what stops the castle looking like coloured cardboard.
   ========================================================================= */
import * as THREE from '../vendor/three.module.js';

const CACHE = new Map();

/* ---- deterministic noise, so a wall looks the same every time you see it -- */
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function valueNoise(w, h, cells, seed) {
  const rnd = mulberry(seed);
  const gw = cells + 1, grid = new Float32Array(gw * gw);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const out = new Float32Array(w * h);
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) {
    const fy = (y / h) * cells, y0 = Math.floor(fy), ty = sm(fy - y0);
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * cells, x0 = Math.floor(fx), tx = sm(fx - x0);
      const a = grid[(y0 % cells) * gw + (x0 % cells)];
      const b = grid[(y0 % cells) * gw + ((x0 + 1) % cells)];
      const c = grid[((y0 + 1) % cells) * gw + (x0 % cells)];
      const d = grid[((y0 + 1) % cells) * gw + ((x0 + 1) % cells)];
      out[y * w + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}
function fbm(w, h, seed, octaves = 4, base = 4) {
  const out = new Float32Array(w * h);
  let amp = 1, total = 0, cells = base;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(w, h, cells, seed + o * 977);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp; amp *= 0.5; cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}
function finish(canvas, repeat) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  return t;
}
function finishData(canvas, repeat) {          // bump/roughness maps are not colour
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  return t;
}
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function put(d, i, c, a) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a === undefined ? 255 : a; }

/* --------------------------------------------------------- stone blocks -- */
function stoneWall(size, opt) {
  opt = opt || {};
  const dark = opt.dark || [58, 56, 62], light = opt.light || [122, 118, 116];
  const rows = opt.rows || 6, cols = opt.cols || 4, mortar = opt.mortar || 0.045;
  const col = makeCanvas(size), bmp = makeCanvas(size);
  const cx = col.getContext('2d'), bx = bmp.getContext('2d');
  const img = cx.createImageData(size, size), bim = bx.createImageData(size, size);
  const grain = fbm(size, size, opt.seed || 7, 5, 8);
  const blotch = fbm(size, size, (opt.seed || 7) + 400, 3, 2);
  const rnd = mulberry((opt.seed || 7) + 99);
  const shade = new Float32Array(rows * cols);
  for (let i = 0; i < shade.length; i++) shade[i] = 0.72 + rnd() * 0.56;
  for (let y = 0; y < size; y++) {
    const ry = y / size * rows, r = Math.floor(ry), fy = ry - r;
    const off = (r % 2) * 0.5;                          // running bond
    for (let x = 0; x < size; x++) {
      const rx = x / size * cols + off, c = Math.floor(rx), fx = rx - c;
      const i = (y * size + x) * 4;
      const edge = fx < mortar * cols || fx > 1 - mortar * cols || fy < mortar * rows || fy > 1 - mortar * rows;
      const g = grain[y * size + x], bl = blotch[y * size + x];
      if (edge) {
        const m = 26 + g * 22;
        put(img.data, i, [m, m - 1, m - 3]);
        const h = 40 + g * 20; put(bim.data, i, [h, h, h]);
      } else {
        const s = shade[((r % rows) + rows) % rows * cols + (((c % cols) + cols) % cols)];
        let base = mix(dark, light, g * 0.55 + bl * 0.45);
        base = base.map((v) => Math.max(8, Math.min(250, v * s)));
        // a chipped corner here and there
        const near = Math.min(fx, 1 - fx) * cols + Math.min(fy, 1 - fy) * rows;
        if (near < 0.35 && bl > 0.62) base = base.map((v) => v * 0.78);
        put(img.data, i, base);
        const h = 150 + g * 70 + (bl - 0.5) * 40; put(bim.data, i, [h, h, h]);
      }
    }
  }
  cx.putImageData(img, 0, 0); bx.putImageData(bim, 0, 0);
  return { map: col, bump: bmp };
}

/* ------------------------------------------------------------- flagstone -- */
function flagstone(size, opt) {
  opt = opt || {};
  const a = opt.dark || [52, 50, 54], b = opt.light || [104, 100, 100];
  const n = opt.cells || 5;
  const col = makeCanvas(size), bmp = makeCanvas(size);
  const cx = col.getContext('2d'), bx = bmp.getContext('2d');
  const img = cx.createImageData(size, size), bim = bx.createImageData(size, size);
  const grain = fbm(size, size, opt.seed || 21, 5, 10);
  const rnd = mulberry((opt.seed || 21) + 5);
  const jig = [];
  for (let i = 0; i < n * n; i++) jig.push(0.7 + rnd() * 0.6);
  for (let y = 0; y < size; y++) {
    const gy = y / size * n, ry = Math.floor(gy), fy = gy - ry;
    for (let x = 0; x < size; x++) {
      const gx = x / size * n, rx = Math.floor(gx), fx = gx - rx;
      const i = (y * size + x) * 4;
      const g = grain[y * size + x];
      const joint = Math.min(fx, 1 - fx, fy, 1 - fy) < 0.035 + g * 0.02;
      if (joint) {
        const m = 22 + g * 20; put(img.data, i, [m, m, m + 2]);
        put(bim.data, i, [30, 30, 30]);
      } else {
        const s = jig[ry * n + rx];
        const base = mix(a, b, g).map((v) => Math.max(8, Math.min(250, v * s)));
        put(img.data, i, base);
        const h = 160 + g * 60; put(bim.data, i, [h, h, h]);
      }
    }
  }
  cx.putImageData(img, 0, 0); bx.putImageData(bim, 0, 0);
  return { map: col, bump: bmp };
}

/* ------------------------------------------------------------------ wood -- */
function wood(size, opt) {
  opt = opt || {};
  const a = opt.dark || [52, 32, 18], b = opt.light || [122, 82, 44];
  const col = makeCanvas(size), bmp = makeCanvas(size);
  const cx = col.getContext('2d'), bx = bmp.getContext('2d');
  const img = cx.createImageData(size, size), bim = bx.createImageData(size, size);
  const wob = fbm(size, size, opt.seed || 33, 4, 3);
  const fine = fbm(size, size, (opt.seed || 33) + 71, 3, 24);
  const planks = opt.planks || 5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const py = y / size * planks, pr = Math.floor(py), fy = py - pr;
      const rings = Math.sin((x / size * 9 + wob[y * size + x] * 3.4 + pr * 1.7) * Math.PI * 2);
      let t = 0.5 + rings * 0.28 + (fine[y * size + x] - 0.5) * 0.3;
      t = Math.max(0, Math.min(1, t));
      let base = mix(a, b, t);
      const gap = fy < 0.018 || fy > 0.982;
      if (gap) base = base.map((v) => v * 0.35);
      put(img.data, i, base);
      const h = gap ? 40 : 130 + t * 80; put(bim.data, i, [h, h, h]);
    }
  }
  cx.putImageData(img, 0, 0); bx.putImageData(bim, 0, 0);
  return { map: col, bump: bmp };
}

/* ----------------------------------------------------------------- grass -- */
function grass(size, opt) {
  opt = opt || {};
  const a = opt.dark || [22, 46, 22], b = opt.light || [74, 108, 44];
  const col = makeCanvas(size), bmp = makeCanvas(size);
  const cx = col.getContext('2d'), bx = bmp.getContext('2d');
  const img = cx.createImageData(size, size), bim = bx.createImageData(size, size);
  const broad = fbm(size, size, opt.seed || 5, 4, 3);
  const fine = fbm(size, size, (opt.seed || 5) + 13, 3, 40);
  for (let i = 0, p = 0; i < size * size; i++, p += 4) {
    const t = broad[i] * 0.6 + fine[i] * 0.4;
    const base = mix(a, b, t);
    if (fine[i] > 0.78) { base[0] += 16; base[1] += 20; }      // dry tufts
    put(img.data, p, base);
    const h = 110 + fine[i] * 110; put(bim.data, p, [h, h, h]);
  }
  cx.putImageData(img, 0, 0); bx.putImageData(bim, 0, 0);
  return { map: col, bump: bmp };
}

/* ------------------------------------------------------------------ dirt -- */
function dirt(size, opt) {
  opt = opt || {};
  const a = opt.dark || [40, 30, 22], b = opt.light || [96, 76, 54];
  const col = makeCanvas(size), bmp = makeCanvas(size);
  const cx = col.getContext('2d'), bx = bmp.getContext('2d');
  const img = cx.createImageData(size, size), bim = bx.createImageData(size, size);
  const n1 = fbm(size, size, opt.seed || 61, 5, 5);
  const n2 = fbm(size, size, (opt.seed || 61) + 31, 3, 30);
  for (let i = 0, p = 0; i < size * size; i++, p += 4) {
    const t = n1[i] * 0.7 + n2[i] * 0.3;
    let base = mix(a, b, t);
    if (n2[i] > 0.82) base = base.map((v) => v * 1.25);         // grit
    put(img.data, p, base);
    const h = 100 + t * 120; put(bim.data, p, [h, h, h]);
  }
  cx.putImageData(img, 0, 0); bx.putImageData(bim, 0, 0);
  return { map: col, bump: bmp };
}

/* ------------------------------------------------------------- cloth/robe -- */
function cloth(size, rgb, opt) {
  opt = opt || {};
  const col = makeCanvas(size), bmp = makeCanvas(size);
  const cx = col.getContext('2d'), bx = bmp.getContext('2d');
  const img = cx.createImageData(size, size), bim = bx.createImageData(size, size);
  const n = fbm(size, size, opt.seed || 91, 3, 6);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const weave = (Math.sin(x * 1.6) * 0.5 + 0.5) * 0.5 + (Math.sin(y * 1.6) * 0.5 + 0.5) * 0.5;
      const s = 0.82 + weave * 0.16 + (n[y * size + x] - 0.5) * 0.18;
      put(img.data, i, rgb.map((v) => Math.max(4, Math.min(252, v * s))));
      const h = 120 + weave * 70; put(bim.data, i, [h, h, h]);
    }
  }
  cx.putImageData(img, 0, 0); bx.putImageData(bim, 0, 0);
  return { map: col, bump: bmp };
}

/* --------------------------------------------------------------- scales --- */
function scales(size, opt) {
  opt = opt || {};
  const a = opt.dark || [14, 40, 26], b = opt.light || [62, 122, 66];
  const col = makeCanvas(size), bmp = makeCanvas(size);
  const cx = col.getContext('2d'), bx = bmp.getContext('2d');
  const img = cx.createImageData(size, size), bim = bx.createImageData(size, size);
  const n = fbm(size, size, opt.seed || 17, 4, 6);
  const rows = opt.rows || 14, cols = opt.cols || 14;
  for (let y = 0; y < size; y++) {
    const ry = y / size * rows, r = Math.floor(ry), fy = ry - r;
    for (let x = 0; x < size; x++) {
      const rx = x / size * cols + (r % 2) * 0.5, c = Math.floor(rx), fx = rx - c;
      const i = (y * size + x) * 4;
      const dx = (fx - 0.5) * 2, dy = (fy - 0.5) * 2;
      const d = Math.sqrt(dx * dx + dy * dy * 0.7);
      const lip = Math.max(0, 1 - Math.abs(d - 0.85) * 6);
      const dome = Math.max(0, 1 - d);
      let base = mix(a, b, n[y * size + x] * 0.5 + dome * 0.6);
      base = base.map((v) => v * (1 - lip * 0.45));
      put(img.data, i, base);
      const h = 90 + dome * 140 - lip * 60; put(bim.data, i, [h, h, h]);
    }
  }
  cx.putImageData(img, 0, 0); bx.putImageData(bim, 0, 0);
  return { map: col, bump: bmp };
}

/* -------------------------------------------------- night sky with stars -- */
function nightSky(size, opt) {
  opt = opt || {};
  const c = makeCanvas(size), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, opt.top || '#05060f');
  g.addColorStop(0.55, opt.mid || '#0d1330');
  g.addColorStop(1, opt.bot || '#1d2444');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const rnd = mulberry(opt.seed || 3);
  // milky band
  x.globalAlpha = 0.10; x.fillStyle = '#9fb4ff';
  for (let i = 0; i < 260; i++) {
    const px = rnd() * size, py = size * 0.38 + (rnd() - 0.5) * size * 0.2;
    x.beginPath(); x.arc(px, py, rnd() * 26 + 6, 0, 7); x.fill();
  }
  x.globalAlpha = 1;
  for (let i = 0; i < 1100; i++) {
    const px = rnd() * size, py = rnd() * size * 0.86;
    const r = rnd() * rnd() * 1.9 + 0.25;
    const b = 160 + rnd() * 95;
    x.fillStyle = 'rgba(' + b + ',' + (b - 8) + ',' + Math.min(255, b + 18) + ',' + (0.35 + rnd() * 0.65) + ')';
    x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
  }
  return { map: c };
}

/* --------------------------------------------------- daytime / storm sky -- */
function skyDome(size, stops) {
  const c = makeCanvas(size), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, size);
  stops.forEach((s) => g.addColorStop(s[0], s[1]));
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  // a few soft clouds so the dome is not a plain ramp
  const rnd = mulberry(12);
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 40; i++) {
    const px = rnd() * size, py = size * (0.22 + rnd() * 0.5), r = 30 + rnd() * 90;
    const grd = x.createRadialGradient(px, py, 0, px, py, r);
    grd.addColorStop(0, 'rgba(255,255,255,' + (0.05 + rnd() * 0.08) + ')');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grd; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
  }
  x.globalCompositeOperation = 'source-over';
  return { map: c };
}

/* --------------------------------------------------------- paper / book -- */
function paper(size, opt) {
  opt = opt || {};
  const c = makeCanvas(size), x = c.getContext('2d');
  const img = x.createImageData(size, size);
  const n = fbm(size, size, opt.seed || 44, 4, 8);
  const base = opt.rgb || [214, 198, 162];
  for (let i = 0, p = 0; i < size * size; i++, p += 4) {
    const s = 0.86 + n[i] * 0.22;
    put(img.data, p, base.map((v) => Math.min(252, v * s)));
  }
  x.putImageData(img, 0, 0);
  // faint ruled writing
  x.strokeStyle = 'rgba(40,28,16,.22)'; x.lineWidth = 1.4;
  for (let y = size * 0.16; y < size * 0.9; y += size * 0.062) {
    x.beginPath();
    let px = size * 0.14;
    while (px < size * 0.86) {
      const w = 6 + Math.random() * 26;
      x.moveTo(px, y); x.lineTo(px + w, y + (Math.random() - 0.5) * 2);
      px += w + 5 + Math.random() * 7;
    }
    x.stroke();
  }
  return { map: c };
}

/* ------------------------------------------------------------- the API --- */
function build(kind, opt) {
  const size = (opt && opt.size) || 512;
  switch (kind) {
    case 'stone': return stoneWall(size, opt);
    case 'flag': return flagstone(size, opt);
    case 'wood': return wood(size, opt);
    case 'grass': return grass(size, opt);
    case 'dirt': return dirt(size, opt);
    case 'cloth': return cloth(size, (opt && opt.rgb) || [90, 30, 40], opt);
    case 'scales': return scales(size, opt);
    case 'night': return nightSky(size, opt);
    case 'sky': return skyDome(size, (opt && opt.stops) || [[0, '#2a4c86'], [0.6, '#8fb4d8'], [1, '#d8cba8']]);
    case 'paper': return paper(size, opt);
    default: throw new Error('no texture called ' + kind);
  }
}

/* material with colour + bump, cached by key. repeat is [u,v]. */
export function mat(kind, opt) {
  opt = opt || {};
  const key = kind + '|' + JSON.stringify(opt);
  if (CACHE.has(key)) return CACHE.get(key);
  const built = build(kind, opt);
  const p = {
    map: finish(built.map, opt.repeat),
    roughness: opt.roughness === undefined ? 0.92 : opt.roughness,
    metalness: opt.metalness === undefined ? 0.02 : opt.metalness
  };
  if (built.bump) {
    p.bumpMap = finishData(built.bump, opt.repeat);
    p.bumpScale = opt.bumpScale === undefined ? 0.35 : opt.bumpScale;
  }
  if (opt.color) p.color = new THREE.Color(opt.color);
  if (opt.side) p.side = opt.side;
  if (opt.emissive) { p.emissive = new THREE.Color(opt.emissive); p.emissiveIntensity = opt.emissiveIntensity || 1; }
  const m = new THREE.MeshStandardMaterial(p);
  CACHE.set(key, m);
  return m;
}

/* a plain texture, for skies and books */
export function tex(kind, opt) {
  opt = opt || {};
  const key = 'T' + kind + '|' + JSON.stringify(opt);
  if (CACHE.has(key)) return CACHE.get(key);
  const built = build(kind, opt);
  const t = finish(built.map, opt.repeat);
  CACHE.set(key, t);
  return t;
}

export function clearCache() { CACHE.clear(); }
export { mulberry, fbm };
