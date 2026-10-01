/* ===========================================================================
   tex.js - every surface in this game is painted at runtime onto a canvas.
   No image files: value noise, a few loops, and for each colour map a second
   canvas that packs three channels at once -
       R = height (bumpMap, and cheap ambient occlusion)
       G = roughness  B = metalness
   which is what stops the castle looking like coloured cardboard. Wet stone
   goes glossy in the streaks, mould goes dead matte, iron goes metal, and the
   mortar sits in shadow because the height channel doubles as AO.

   Everything is grimier and about a third darker than a school ought to be.
   That is the point.
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
function finishData(canvas, repeat) {          // height/roughness/metal is not colour
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
/* height 0..1, roughness 0..1, metal 0..1 into one texel */
function putHRM(d, i, h, r, m) {
  d[i] = Math.max(0, Math.min(255, h * 255));
  d[i + 1] = Math.max(0, Math.min(255, r * 255));
  d[i + 2] = Math.max(0, Math.min(255, (m || 0) * 255));
  d[i + 3] = 255;
}
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* --------------------------------------------------------- stone blocks -- */
function stoneWall(size, opt) {
  opt = opt || {};
  const dark = opt.dark || [54, 52, 58], light = opt.light || [122, 117, 114];
  const rows = opt.rows || 6, cols = opt.cols || 4, mortar = opt.mortar || 0.045;
  const damp = opt.damp === undefined ? 1 : opt.damp;       // how wet and mouldy
  const col = makeCanvas(size), bmp = makeCanvas(size);
  const cx = col.getContext('2d'), bx = bmp.getContext('2d');
  const img = cx.createImageData(size, size), bim = bx.createImageData(size, size);
  const grain = fbm(size, size, opt.seed || 7, 5, 8);
  const blotch = fbm(size, size, (opt.seed || 7) + 400, 3, 2);
  const streak = fbm(size, size, (opt.seed || 7) + 811, 3, 3);     // runs down the wall
  const crackN = fbm(size, size, (opt.seed || 7) + 1307, 4, 5);
  const rnd = mulberry((opt.seed || 7) + 99);
  const shade = new Float32Array(rows * cols);
  for (let i = 0; i < shade.length; i++) shade[i] = 0.74 + rnd() * 0.48;
  for (let y = 0; y < size; y++) {
    const ry = y / size * rows, r = Math.floor(ry), fy = ry - r;
    const off = (r % 2) * 0.5;                          // running bond
    const down = y / size;                              // 0 at the top
    for (let x = 0; x < size; x++) {
      const rx = x / size * cols + off, c = Math.floor(rx), fx = rx - c;
      const i = (y * size + x) * 4;
      const edge = fx < mortar * cols || fx > 1 - mortar * cols || fy < mortar * rows || fy > 1 - mortar * rows;
      const g = grain[y * size + x], bl = blotch[y * size + x];
      // water comes down the wall in ribbons, and takes the light with it
      const ribbon = Math.max(0, 1 - Math.abs(streak[y * size + x] - 0.5) * 7) * damp;
      const wet = sat(ribbon * (0.25 + down * 0.9));
      // mould gathers low down and in the damp
      const mould = sat((bl - 0.52) * 2.6) * sat(down * 1.5 - 0.15) * damp;
      // a crack here and there, where the noise ridges
      const crack = Math.max(0, 1 - Math.abs(crackN[y * size + x] - 0.5) * 30);
      if (edge) {
        const m = 22 + g * 20 - wet * 8;
        let base = [m, m - 1, m - 3];
        base = mix(base, [30, 36, 26], mould * 0.7);
        put(img.data, i, base);
        putHRM(bim.data, i, 0.14 + g * 0.09, sat(0.98 - wet * 0.5 + mould * 0.02), 0);
      } else {
        const s = shade[((r % rows) + rows) % rows * cols + (((c % cols) + cols) % cols)];
        let base = mix(dark, light, g * 0.55 + bl * 0.45);
        base = base.map((v) => Math.max(6, Math.min(250, v * s)));
        // a chipped corner here and there
        const near = Math.min(fx, 1 - fx) * cols + Math.min(fy, 1 - fy) * rows;
        if (near < 0.35 && bl > 0.62) base = base.map((v) => v * 0.74);
        base = base.map((v) => v * (1 - wet * 0.3));                  // damp is darker
        base = mix(base, [42, 52, 38], mould * 0.5);                  // and greener
        if (crack > 0.5) base = base.map((v) => v * 0.42);
        put(img.data, i, base);
        const h = 0.56 + g * 0.3 + (bl - 0.5) * 0.16 - crack * 0.5;
        putHRM(bim.data, i, h, sat(0.96 - wet * 0.62 + (mould > 0.2 ? 0.04 : 0) - g * 0.06), 0);
      }
    }
  }
  cx.putImageData(img, 0, 0); bx.putImageData(bim, 0, 0);
  return { map: col, data: bmp };
}

/* ------------------------------------------------------------- flagstone -- */
function flagstone(size, opt) {
  opt = opt || {};
  const a = opt.dark || [48, 46, 50], b = opt.light || [108, 103, 101];
  const n = opt.cells || 5;
  const damp = opt.damp === undefined ? 1 : opt.damp;
  const col = makeCanvas(size), bmp = makeCanvas(size);
  const cx = col.getContext('2d'), bx = bmp.getContext('2d');
  const img = cx.createImageData(size, size), bim = bx.createImageData(size, size);
  const grain = fbm(size, size, opt.seed || 21, 5, 10);
  const pool = fbm(size, size, (opt.seed || 21) + 77, 3, 3);       // puddles
  const stain = fbm(size, size, (opt.seed || 21) + 511, 4, 4);     // something spilled
  const crackN = fbm(size, size, (opt.seed || 21) + 913, 4, 6);
  const rnd = mulberry((opt.seed || 21) + 5);
  const jig = [];
  for (let i = 0; i < n * n; i++) jig.push(0.72 + rnd() * 0.52);
  for (let y = 0; y < size; y++) {
    const gy = y / size * n, ry = Math.floor(gy), fy = gy - ry;
    for (let x = 0; x < size; x++) {
      const gx = x / size * n, rx = Math.floor(gx), fx = gx - rx;
      const i = (y * size + x) * 4;
      const g = grain[y * size + x];
      const joint = Math.min(fx, 1 - fx, fy, 1 - fy) < 0.035 + g * 0.02;
      const wet = sat((pool[y * size + x] - 0.56) * 3.4) * damp;
      const dirt = sat((stain[y * size + x] - 0.6) * 2.4);
      const crack = Math.max(0, 1 - Math.abs(crackN[y * size + x] - 0.5) * 34);
      if (joint) {
        const m = 17 + g * 15;
        put(img.data, i, mix([m, m, m + 2], [26, 22, 18], dirt * 0.6));
        putHRM(bim.data, i, 0.1, sat(0.98 - wet * 0.6), 0);
      } else {
        const s = jig[ry * n + rx];
        let base = mix(a, b, g).map((v) => Math.max(6, Math.min(250, v * s)));
        base = mix(base, [38, 31, 26], dirt * 0.42);                 // trodden-in filth
        base = base.map((v) => v * (1 - wet * 0.22));
        if (crack > 0.55) base = base.map((v) => v * 0.5);
        put(img.data, i, base);
        putHRM(bim.data, i, 0.6 + g * 0.26 - crack * 0.45, sat(0.95 - wet * 0.72 - g * 0.05), 0);
      }
    }
  }
  cx.putImageData(img, 0, 0); bx.putImageData(bim, 0, 0);
  return { map: col, data: bmp };
}

/* ------------------------------------------------------------------ wood -- */
function wood(size, opt) {
  opt = opt || {};
  const a = opt.dark || [44, 30, 18], b = opt.light || [106, 75, 40];
  const col = makeCanvas(size), bmp = makeCanvas(size);
  const cx = col.getContext('2d'), bx = bmp.getContext('2d');
  const img = cx.createImageData(size, size), bim = bx.createImageData(size, size);
  const wob = fbm(size, size, opt.seed || 33, 4, 3);
  const fine = fbm(size, size, (opt.seed || 33) + 71, 3, 24);
  const rot = fbm(size, size, (opt.seed || 33) + 401, 3, 2);
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
      // damp rot: grey-green, and dead matte
      const bad = sat((rot[y * size + x] - 0.58) * 2.8) * (opt.rot === undefined ? 1 : opt.rot);
      base = mix(base, [42, 44, 36], bad * 0.6);
      if (gap) base = base.map((v) => v * 0.3);
      put(img.data, i, base);
      putHRM(bim.data, i, gap ? 0.1 : 0.5 + t * 0.32, sat((opt.polish ? 0.55 : 0.86) + bad * 0.12 - t * 0.1), 0);
    }
  }
  cx.putImageData(img, 0, 0); bx.putImageData(bim, 0, 0);
  return { map: col, data: bmp };
}

/* ----------------------------------------------------------------- grass -- */
function grass(size, opt) {
  opt = opt || {};
  const a = opt.dark || [20, 32, 19], b = opt.light || [62, 80, 40];
  const col = makeCanvas(size), bmp = makeCanvas(size);
  const cx = col.getContext('2d'), bx = bmp.getContext('2d');
  const img = cx.createImageData(size, size), bim = bx.createImageData(size, size);
  const broad = fbm(size, size, opt.seed || 5, 4, 3);
  const fine = fbm(size, size, (opt.seed || 5) + 13, 3, 40);
  const dead = fbm(size, size, (opt.seed || 5) + 233, 3, 2);
  for (let i = 0, p = 0; i < size * size; i++, p += 4) {
    const t = broad[i] * 0.6 + fine[i] * 0.4;
    let base = mix(a, b, t);
    const brown = sat((dead[i] - 0.55) * 2.6);
    base = mix(base, [58, 48, 30], brown * 0.75);              // patches of it are dead
    if (fine[i] > 0.82) base = base.map((v) => v * 1.12);
    put(img.data, p, base);
    putHRM(bim.data, p, 0.35 + fine[i] * 0.5, sat(0.96 - broad[i] * 0.06), 0);
  }
  cx.putImageData(img, 0, 0); bx.putImageData(bim, 0, 0);
  return { map: col, data: bmp };
}

/* ------------------------------------------------------------------ dirt -- */
function dirt(size, opt) {
  opt = opt || {};
  const a = opt.dark || [37, 28, 20], b = opt.light || [88, 70, 49];
  const col = makeCanvas(size), bmp = makeCanvas(size);
  const cx = col.getContext('2d'), bx = bmp.getContext('2d');
  const img = cx.createImageData(size, size), bim = bx.createImageData(size, size);
  const n1 = fbm(size, size, opt.seed || 61, 5, 5);
  const n2 = fbm(size, size, (opt.seed || 61) + 31, 3, 30);
  const mud = fbm(size, size, (opt.seed || 61) + 707, 3, 3);
  for (let i = 0, p = 0; i < size * size; i++, p += 4) {
    const t = n1[i] * 0.7 + n2[i] * 0.3;
    let base = mix(a, b, t);
    const wet = sat((mud[i] - 0.58) * 3.2);
    base = base.map((v) => v * (1 - wet * 0.42));
    if (n2[i] > 0.84) base = base.map((v) => v * 1.2);         // grit
    put(img.data, p, base);
    putHRM(bim.data, p, 0.3 + t * 0.55, sat(0.97 - wet * 0.68), 0);
  }
  cx.putImageData(img, 0, 0); bx.putImageData(bim, 0, 0);
  return { map: col, data: bmp };
}

/* ------------------------------------------------------------- cloth/robe -- */
function cloth(size, rgb, opt) {
  opt = opt || {};
  const col = makeCanvas(size), bmp = makeCanvas(size);
  const cx = col.getContext('2d'), bx = bmp.getContext('2d');
  const img = cx.createImageData(size, size), bim = bx.createImageData(size, size);
  const n = fbm(size, size, opt.seed || 91, 3, 6);
  const worn = fbm(size, size, (opt.seed || 91) + 313, 3, 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const weave = (Math.sin(x * 1.6) * 0.5 + 0.5) * 0.5 + (Math.sin(y * 1.6) * 0.5 + 0.5) * 0.5;
      const s = 0.82 + weave * 0.16 + (n[y * size + x] - 0.5) * 0.2;
      const dust = sat((worn[y * size + x] - 0.6) * 2.2) * 0.35;
      let base = rgb.map((v) => Math.max(3, Math.min(252, v * s)));
      base = mix(base, [78, 74, 66], dust);                   // dust in the nap
      put(img.data, i, base);
      putHRM(bim.data, i, 0.45 + weave * 0.3, sat(0.94 + dust * 0.05), 0);
    }
  }
  cx.putImageData(img, 0, 0); bx.putImageData(bim, 0, 0);
  return { map: col, data: bmp };
}

/* --------------------------------------------------------------- scales --- */
function scales(size, opt) {
  opt = opt || {};
  const a = opt.dark || [11, 30, 20], b = opt.light || [50, 96, 54];
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
      base = base.map((v) => v * (1 - lip * 0.5));
      put(img.data, i, base);
      putHRM(bim.data, i, 0.3 + dome * 0.6 - lip * 0.25, sat(0.6 - dome * 0.34 + lip * 0.2), 0.12);
    }
  }
  cx.putImageData(img, 0, 0); bx.putImageData(bim, 0, 0);
  return { map: col, data: bmp };
}

/* ------------------------------------------------------------------ rust -- */
function rust(size, opt) {
  opt = opt || {};
  const col = makeCanvas(size), bmp = makeCanvas(size);
  const cx = col.getContext('2d'), bx = bmp.getContext('2d');
  const img = cx.createImageData(size, size), bim = bx.createImageData(size, size);
  const n = fbm(size, size, opt.seed || 131, 5, 5);
  const patch = fbm(size, size, (opt.seed || 131) + 57, 3, 3);
  const steel = opt.steel || [58, 60, 66];
  for (let i = 0, p = 0; i < size * size; i++, p += 4) {
    const bad = sat((patch[i] - 0.44) * 2.3);
    const ox = mix([74, 38, 18], [126, 72, 32], n[i]);
    const base = mix(steel.map((v) => v * (0.8 + n[i] * 0.45)), ox, bad);
    put(img.data, p, base);
    putHRM(bim.data, p, 0.4 + n[i] * 0.4 + bad * 0.15, sat(0.3 + bad * 0.66), 1 - bad * 0.85);
  }
  cx.putImageData(img, 0, 0); bx.putImageData(bim, 0, 0);
  return { map: col, data: bmp };
}

/* --------------------------------------------------------------- cobweb -- */
/* white on transparent: hang it on a plane with transparent:true */
function cobweb(size, opt) {
  opt = opt || {};
  const c = makeCanvas(size), x = c.getContext('2d');
  x.clearRect(0, 0, size, size);
  const rnd = mulberry(opt.seed || 5);
  const cx0 = size * (opt.cx === undefined ? 0.06 : opt.cx);
  const cy0 = size * (opt.cy === undefined ? 0.06 : opt.cy);
  const spokes = opt.spokes || 11, rings = opt.rings || 9;
  const R = size * 1.28;
  x.lineCap = 'round';
  const ang = [];
  for (let i = 0; i < spokes; i++) ang.push((i / (spokes - 1)) * (Math.PI / 2) * 0.98 + 0.01);
  x.strokeStyle = 'rgba(226,226,232,0.5)';
  x.lineWidth = Math.max(1, size / 420);
  ang.forEach((a) => {
    x.beginPath(); x.moveTo(cx0, cy0);
    x.lineTo(cx0 + Math.cos(a) * R, cy0 + Math.sin(a) * R);
    x.stroke();
  });
  // the spiral: each strand sags between its spokes
  for (let r = 1; r <= rings; r++) {
    const rad = R * Math.pow(r / rings, 1.5) * (0.9 + rnd() * 0.2);
    x.strokeStyle = 'rgba(214,216,224,' + (0.42 - r * 0.02) + ')';
    x.beginPath();
    for (let i = 0; i < ang.length - 1; i++) {
      const a0 = ang[i], a1 = ang[i + 1], am = (a0 + a1) / 2;
      const sag = rad * (1 + 0.12 + rnd() * 0.05);
      const x0 = cx0 + Math.cos(a0) * rad, y0 = cy0 + Math.sin(a0) * rad;
      const x1 = cx0 + Math.cos(a1) * rad, y1 = cy0 + Math.sin(a1) * rad;
      const xm = cx0 + Math.cos(am) * sag, ym = cy0 + Math.sin(am) * sag;
      if (i === 0) x.moveTo(x0, y0);
      x.quadraticCurveTo(xm, ym, x1, y1);
    }
    x.stroke();
  }
  // a few torn, trailing threads
  for (let i = 0; i < 7; i++) {
    const a = rnd() * (Math.PI / 2);
    x.strokeStyle = 'rgba(206,208,216,0.3)';
    x.beginPath();
    x.moveTo(cx0 + Math.cos(a) * R * 0.4, cy0 + Math.sin(a) * R * 0.4);
    x.quadraticCurveTo(cx0 + Math.cos(a) * R * 0.7 + 20, cy0 + Math.sin(a) * R * 0.8,
      cx0 + Math.cos(a) * R * 0.95, cy0 + Math.sin(a) * R * 1.2);
    x.stroke();
  }
  return { map: c, noRepeat: true };
}

/* -------------------------------------------------- night sky with stars -- */
function nightSky(size, opt) {
  opt = opt || {};
  const c = makeCanvas(size), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, opt.top || '#06080f');
  g.addColorStop(0.55, opt.mid || '#0d1228');
  g.addColorStop(1, opt.bot || '#1c2342');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const rnd = mulberry(opt.seed || 3);
  // milky band, faint
  x.globalAlpha = 0.11; x.fillStyle = '#93a8ec';
  for (let i = 0; i < 260; i++) {
    const px = rnd() * size, py = size * 0.38 + (rnd() - 0.5) * size * 0.2;
    x.beginPath(); x.arc(px, py, rnd() * 26 + 6, 0, 7); x.fill();
  }
  x.globalAlpha = 1;
  for (let i = 0; i < 1100; i++) {
    const px = rnd() * size, py = rnd() * size * 0.86;
    const r = rnd() * rnd() * 1.8 + 0.22;
    const b = 150 + rnd() * 95;
    x.fillStyle = 'rgba(' + b + ',' + (b - 6) + ',' + Math.min(255, b + 22) + ',' + (0.3 + rnd() * 0.62) + ')';
    x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
  }
  // a moon, with a sick halo round it
  if (opt.moon !== false) {
    const mx = size * (opt.moonAt ? opt.moonAt[0] : 0.72), my = size * (opt.moonAt ? opt.moonAt[1] : 0.2);
    const halo = x.createRadialGradient(mx, my, 0, mx, my, size * 0.2);
    halo.addColorStop(0, 'rgba(206,214,238,0.5)');
    halo.addColorStop(0.28, 'rgba(150,164,200,0.16)');
    halo.addColorStop(1, 'rgba(120,140,190,0)');
    x.fillStyle = halo; x.beginPath(); x.arc(mx, my, size * 0.2, 0, 7); x.fill();
    x.fillStyle = 'rgba(232,236,246,0.92)';
    x.beginPath(); x.arc(mx, my, size * 0.021, 0, 7); x.fill();
    x.fillStyle = 'rgba(150,158,176,0.35)';
    [[0.4, -0.3, 0.3], [-0.35, 0.25, 0.26], [0.1, 0.5, 0.2]].forEach(([dx, dy, r]) => {
      x.beginPath(); x.arc(mx + dx * size * 0.021, my + dy * size * 0.021, size * 0.021 * r, 0, 7); x.fill();
    });
  }
  // torn cloud, moving nowhere
  x.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 26; i++) {
    const px = rnd() * size, py = size * (0.06 + rnd() * 0.5), w = size * (0.1 + rnd() * 0.3), h = size * (0.012 + rnd() * 0.04);
    const grd = x.createLinearGradient(px, py, px + w, py);
    grd.addColorStop(0, 'rgba(18,22,40,0)');
    grd.addColorStop(0.5, 'rgba(22,26,46,' + (0.35 + rnd() * 0.4) + ')');
    grd.addColorStop(1, 'rgba(18,22,40,0)');
    x.fillStyle = grd;
    x.beginPath(); x.ellipse(px + w / 2, py, w / 2, h, 0, 0, 7); x.fill();
  }
  return { map: c };
}

/* --------------------------------------------------- daytime / storm sky -- */
function skyDome(size, stops, opt) {
  opt = opt || {};
  const c = makeCanvas(size), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, size);
  stops.forEach((s) => g.addColorStop(s[0], s[1]));
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const rnd = mulberry(opt.seed || 12);
  // heavy, dirty cloud rather than fluff
  for (let i = 0; i < (opt.clouds === undefined ? 70 : opt.clouds); i++) {
    const px = rnd() * size, py = size * (0.1 + rnd() * 0.6), r = 40 + rnd() * 150;
    const grd = x.createRadialGradient(px, py, 0, px, py, r);
    const dark = opt.dark === undefined ? 0.5 : opt.dark;
    const a = 0.05 + rnd() * 0.16;
    grd.addColorStop(0, 'rgba(' + Math.round(210 - dark * 170) + ',' + Math.round(212 - dark * 168) +
      ',' + Math.round(220 - dark * 160) + ',' + a + ')');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = grd; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
  }
  return { map: c };
}

/* --------------------------------------------------------- paper / book -- */
function paper(size, opt) {
  opt = opt || {};
  const c = makeCanvas(size), x = c.getContext('2d');
  const img = x.createImageData(size, size);
  const n = fbm(size, size, opt.seed || 44, 4, 8);
  const st = fbm(size, size, (opt.seed || 44) + 191, 3, 3);
  const base = opt.rgb || [186, 170, 136];
  for (let i = 0, p = 0; i < size * size; i++, p += 4) {
    const s = 0.8 + n[i] * 0.24;
    const foxing = sat((st[i] - 0.6) * 2.4);                    // age spots
    put(img.data, p, mix(base.map((v) => Math.min(252, v * s)), [124, 96, 58], foxing * 0.5));
  }
  x.putImageData(img, 0, 0);
  // faint ruled writing
  x.strokeStyle = 'rgba(28,20,12,.26)'; x.lineWidth = 1.4;
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
    case 'cloth': return cloth(size, (opt && opt.rgb) || [80, 26, 34], opt);
    case 'scales': return scales(size, opt);
    case 'rust': return rust(size, opt);
    case 'cobweb': return cobweb(size, opt);
    case 'night': return nightSky(size, opt);
    case 'sky': return skyDome(size, (opt && opt.stops) || [[0, '#1c2f4e'], [0.6, '#6a7c8c'], [1, '#9aa096']], opt);
    case 'paper': return paper(size, opt);
    default: throw new Error('no texture called ' + kind);
  }
}

/* material with colour + the packed height/roughness/metal map, cached by key.
   repeat is [u,v]. The height channel is used for bump AND for a cheap ambient
   occlusion, which is what puts the mortar into shadow. */
export function mat(kind, opt) {
  opt = opt || {};
  const key = kind + '|' + JSON.stringify(opt);
  if (CACHE.has(key)) return CACHE.get(key);
  const built = build(kind, opt);
  const p = {
    map: finish(built.map, opt.repeat),
    roughness: opt.roughness === undefined ? 1 : opt.roughness,
    metalness: opt.metalness === undefined ? (built.data ? 1 : 0.02) : opt.metalness
  };
  if (built.data) {
    const d = finishData(built.data, opt.repeat);
    p.bumpMap = d;
    p.bumpScale = opt.bumpScale === undefined ? 0.45 : opt.bumpScale;
    p.roughnessMap = d;
    p.metalnessMap = d;
    if (opt.ao !== false) { p.aoMap = d; p.aoMapIntensity = opt.ao === undefined ? 0.35 : opt.ao; }
  }
  if (opt.color) p.color = new THREE.Color(opt.color);
  if (opt.side) p.side = opt.side;
  if (opt.emissive) { p.emissive = new THREE.Color(opt.emissive); p.emissiveIntensity = opt.emissiveIntensity || 1; }
  const m = new THREE.MeshStandardMaterial(p);
  CACHE.set(key, m);
  return m;
}

/* a plain texture, for skies, books and cobwebs */
export function tex(kind, opt) {
  opt = opt || {};
  const key = 'T' + kind + '|' + JSON.stringify(opt);
  if (CACHE.has(key)) return CACHE.get(key);
  const built = build(kind, opt);
  const t = finish(built.map, opt.repeat);
  if (built.noRepeat) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; }
  CACHE.set(key, t);
  return t;
}

export function clearCache() { CACHE.clear(); }
export { mulberry, fbm };
