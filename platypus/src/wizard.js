// wizard.js — the kindly old tutorial wizard.
// Everything is generated in code: lofted geometry, canvas textures, shader sway.
// 13 draw calls: robe, 4 sleeve segments, 2 hands, head, hair, beard, hat, staff, crystal.
//
// Layout (wizard faces +Z, so his LEFT is +X; the staff is in the left hand, the right hand gestures):
//   group                 <- owned by the integrator (position / rotation / visibility)
//     pivot               <- body yaw (lookAt) + appear() scale
//       bodyRoot          <- idle sway, cheer hop
//         robe, staff (planted on the ground; the left arm is IK-solved onto its grip)
//         chest -> headPivot -> head, hair, hat, jaw -> beard
//               -> armL / armR : shoulder -> elbow -> wrist (two-bone IK, no allocations)

const PI = Math.PI;
const TAU = Math.PI * 2;

function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
function smooth(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function wrapPi(a) { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; }
function gauss(x, y, z, cx, cy, cz, s) {
  const dx = x - cx, dy = y - cy, dz = z - cz;
  return Math.exp(-(dx * dx + dy * dy + dz * dz) / (s * s));
}
// polar radius of an ellipse with half axes a (cos direction) and b (sin direction)
function ell(a, b, phi) {
  const c = Math.cos(phi) * b, s = Math.sin(phi) * a;
  const d = Math.sqrt(c * c + s * s);
  return d > 1e-9 ? (a * b) / d : 0;
}
// Non-uniform Catmull-Rom (cubic Hermite) through keys [[x, c1, c2, ...], ...] keyed on column 0.
function hk(keys, x, c) {
  const n = keys.length;
  if (x <= keys[0][0]) return keys[0][c];
  if (x >= keys[n - 1][0]) return keys[n - 1][c];
  let i = 0;
  while (i < n - 2 && x > keys[i + 1][0]) i++;
  const k0 = keys[i], k1 = keys[i + 1];
  const h = k1[0] - k0[0], t = (x - k0[0]) / h;
  const km = keys[i > 0 ? i - 1 : i], kp = keys[i + 2 < n ? i + 2 : i + 1];
  const m0 = (k1[c] - km[c]) / (k1[0] - km[0]) * h;
  const m1 = (kp[c] - k0[c]) / (kp[0] - k0[0]) * h;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * k0[c] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * k1[c] + (t3 - t2) * m1;
}
function bez3(a, b, c, d, t) {
  const m = 1 - t;
  return m * m * m * a + 3 * m * m * t * b + 3 * m * t * t * c + t * t * t * d;
}
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// Geometry builder: parametric grids with welded seams and averaged poles, merged into one buffer.
// Convention: with u = angle (x = cos, z = sin) and v = "up", the default winding faces outward.
// ---------------------------------------------------------------------------------------------
function createBuilder(THREE, withLid) {
  const P = [], N = [], U = [], C = [], S = [], L = [], I = [];
  const o = { x: 0, y: 0, z: 0, u: 0, v: 0, r: 1, g: 1, b: 1, s: 0, lx: 0, ly: 0, lz: 0, lw: 0 };
  const b = { tris: 0, checks: [] };

  b.grid = function (nu, nv, fn, opts) {
    const closeU = !!(opts && opts.closeU), closeV = !!(opts && opts.closeV), flip = !!(opts && opts.flip);
    const row = nu + 1, count = row * (nv + 1), base = P.length / 3;
    const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3);
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        o.x = o.y = o.z = 0; o.u = i / nu; o.v = j / nv; o.r = o.g = o.b = 1; o.s = 0;
        o.lx = o.ly = o.lz = o.lw = 0;
        fn(i / nu, j / nv, o);
        const k = (j * row + i) * 3;
        pos[k] = o.x; pos[k + 1] = o.y; pos[k + 2] = o.z;
        U.push(o.u, o.v); C.push(o.r, o.g, o.b); S.push(o.s);
        if (withLid) L.push(o.lx, o.ly, o.lz, o.lw);
      }
    }
    const tri = function (a, bb, c) {
      const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
      const e1x = pos[bb * 3] - ax, e1y = pos[bb * 3 + 1] - ay, e1z = pos[bb * 3 + 2] - az;
      const e2x = pos[c * 3] - ax, e2y = pos[c * 3 + 1] - ay, e2z = pos[c * 3 + 2] - az;
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      if (nx * nx + ny * ny + nz * nz < 1e-20) return; // degenerate (pole) triangle
      nrm[a * 3] += nx; nrm[a * 3 + 1] += ny; nrm[a * 3 + 2] += nz;
      nrm[bb * 3] += nx; nrm[bb * 3 + 1] += ny; nrm[bb * 3 + 2] += nz;
      nrm[c * 3] += nx; nrm[c * 3 + 1] += ny; nrm[c * 3 + 2] += nz;
      I.push(base + a, base + bb, base + c);
      b.tris++;
    };
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = j * row + i, bb = a + 1, c = a + row, d = c + 1;
        if (flip) { tri(a, bb, c); tri(bb, d, c); } else { tri(a, c, bb); tri(bb, c, d); }
      }
    }
    const weld = function (p, q) {
      const x = nrm[p * 3] + nrm[q * 3], y = nrm[p * 3 + 1] + nrm[q * 3 + 1], z = nrm[p * 3 + 2] + nrm[q * 3 + 2];
      nrm[p * 3] = nrm[q * 3] = x; nrm[p * 3 + 1] = nrm[q * 3 + 1] = y; nrm[p * 3 + 2] = nrm[q * 3 + 2] = z;
    };
    if (closeU) for (let j = 0; j <= nv; j++) weld(j * row, j * row + nu);
    if (closeV) for (let i = 0; i <= nu; i++) weld(i, nv * row + i);
    // collapsed rows (poles): share one averaged normal
    for (let j = 0; j <= nv; j++) {
      const k0 = j * row * 3;
      let same = true;
      for (let i = 1; i <= nu && same; i++) {
        const k = (j * row + i) * 3;
        if (Math.abs(pos[k] - pos[k0]) + Math.abs(pos[k + 1] - pos[k0 + 1]) + Math.abs(pos[k + 2] - pos[k0 + 2]) > 1e-6) same = false;
      }
      if (same) {
        let x = 0, y = 0, z = 0;
        for (let i = 0; i <= nu; i++) { const k = (j * row + i) * 3; x += nrm[k]; y += nrm[k + 1]; z += nrm[k + 2]; }
        for (let i = 0; i <= nu; i++) { const k = (j * row + i) * 3; nrm[k] = x; nrm[k + 1] = y; nrm[k + 2] = z; }
      }
    }
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < count; k++) { cx += pos[k * 3]; cy += pos[k * 3 + 1]; cz += pos[k * 3 + 2]; }
    cx /= count; cy /= count; cz /= count;
    let check = 0;
    for (let k = 0; k < count; k++) {
      let x = nrm[k * 3], y = nrm[k * 3 + 1], z = nrm[k * 3 + 2];
      const l = Math.sqrt(x * x + y * y + z * z);
      if (l > 1e-12) { x /= l; y /= l; z /= l; } else { x = 0; y = 1; z = 0; }
      P.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
      N.push(x, y, z);
      check += x * (pos[k * 3] - cx) + y * (pos[k * 3 + 1] - cy) + z * (pos[k * 3 + 2] - cz);
    }
    b.checks.push(check / count); // > 0 means normals face away from the piece centroid
  };

  // Tube swept along path(t, out) with radius rad(t, phi). ref is a vector roughly perpendicular to the path.
  const c0 = { x: 0, y: 0, z: 0 }, c1 = { x: 0, y: 0, z: 0 }, c2 = { x: 0, y: 0, z: 0 };
  b.tube = function (nS, nT, path, rad, ref, extra) {
    b.grid(nS, nT, function (u, v, o2) {
      path(v, c0);
      path(Math.min(1, v + 0.002), c1);
      path(Math.max(0, v - 0.002), c2);
      let tx = c1.x - c2.x, ty = c1.y - c2.y, tz = c1.z - c2.z;
      let l = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
      tx /= l; ty /= l; tz /= l;
      const d = ref[0] * tx + ref[1] * ty + ref[2] * tz;
      let ax = ref[0] - tx * d, ay = ref[1] - ty * d, az = ref[2] - tz * d;
      l = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
      ax /= l; ay /= l; az /= l;
      // N2 = N1 x T  (matches the lathe convention so the default winding faces outward)
      const bx = ay * tz - az * ty, by = az * tx - ax * tz, bz = ax * ty - ay * tx;
      const phi = u * TAU, r = Math.max(0, rad(v, phi));
      const cs = Math.cos(phi) * r, sn = Math.sin(phi) * r;
      o2.x = c0.x + ax * cs + bx * sn;
      o2.y = c0.y + ay * cs + by * sn;
      o2.z = c0.z + az * cs + bz * sn;
      if (extra) extra(o2, u, v);
    }, { closeU: true });
  };

  // Ellipsoid with its poles on the Y axis.
  b.ellipsoid = function (cx, cy, cz, rx, ry, rz, nu, nv, extra) {
    b.grid(nu, nv, function (u, v, o2) {
      const phi = u * TAU, th = (v - 0.5) * PI, ct = Math.cos(th);
      o2.x = cx + rx * ct * Math.cos(phi);
      o2.y = cy + ry * Math.sin(th);
      o2.z = cz + rz * ct * Math.sin(phi);
      if (extra) extra(o2, u, v);
    }, { closeU: true });
  };

  b.build = function () {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute("aSway", new THREE.Float32BufferAttribute(S, 1));
    if (withLid) g.setAttribute("aLid", new THREE.Float32BufferAttribute(L, 4));
    g.setIndex(I);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  };
  return b;
}

// ---------------------------------------------------------------------------------------------
// Textures (drawn once; never redrawn)
// ---------------------------------------------------------------------------------------------
function makeCanvas(w, h) {
  if (typeof document !== "undefined" && document.createElement) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  return null;
}

function starPath(ctx, x, y, R, rot) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + i * PI / 5, r = (i & 1) ? R * 0.44 : R;
    const px = x + Math.sin(a) * r, py = y - Math.cos(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// Cloth atlas (v measured from the bottom of the texture):
//   v 0.00-0.27 : pale inner-robe cloth with soft pleat stripes (+ a leather patch at u < 0.09 for shoes)
//   v 0.285-0.375 : gold embroidered band (hems, cuffs, hat band, belt, piping)
//   v 0.39-1.00 : deep blue outer cloth with embroidered gold stars and moons
function makeClothTexture(THREE) {
  const S = 512, cv = makeCanvas(S, S);
  if (!cv) return null;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const R = rng(7741);
  const BASE = "#2b2d84";
  // outer cloth
  ctx.fillStyle = BASE; ctx.fillRect(0, 0, S, 322);
  for (let i = 0; i < 900; i++) {
    const x = R() * S, y = R() * 322, w = 6 + R() * 26;
    ctx.fillStyle = R() < 0.5 ? "rgba(70,74,170,0.07)" : "rgba(14,14,60,0.08)";
    ctx.fillRect(x, y, w, 1 + R() * 2);
  }
  // long soft drape shading so folds read even in flat light
  for (let i = 0; i < 14; i++) {
    const x = R() * S, w = 14 + R() * 30;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "rgba(10,10,50,0)"); g.addColorStop(0.5, "rgba(10,10,50,0.16)"); g.addColorStop(1, "rgba(10,10,50,0)");
    ctx.fillStyle = g; ctx.fillRect(x, 0, w, 322);
  }
  // stars, moons, dots
  const placed = [];
  ctx.lineJoin = "round";
  let guard = 0;
  while (placed.length < 44 && guard++ < 4000) {
    const r = 6 + R() * R() * 13, x = 14 + r + R() * (S - 28 - 2 * r), y = 8 + r + R() * (300 - 2 * r);
    let ok = true;
    for (let k = 0; k < placed.length; k++) {
      const p = placed[k], dx = p[0] - x, dy = p[1] - y, m = p[2] + r + 9;
      if (dx * dx + dy * dy < m * m) { ok = false; break; }
    }
    if (!ok) continue;
    placed.push([x, y, r]);
    if (placed.length % 8 === 3) {
      // crescent moon
      ctx.fillStyle = "#a57a24"; ctx.beginPath(); ctx.arc(x, y, r + 1.2, 0, TAU); ctx.fill();
      ctx.fillStyle = "#f3d46c"; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      const a = R() * TAU;
      ctx.fillStyle = BASE; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.48, y + Math.sin(a) * r * 0.48, r * 0.86, 0, TAU); ctx.fill();
    } else {
      const rot = R() * TAU;
      starPath(ctx, x, y, r, rot);
      ctx.strokeStyle = "#a57a24"; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.fillStyle = "#f3d46c"; ctx.fill();
      starPath(ctx, x - r * 0.08, y - r * 0.08, r * 0.5, rot);
      ctx.fillStyle = "rgba(255,246,196,0.75)"; ctx.fill();
      // stitch ticks
      ctx.strokeStyle = "rgba(120,84,20,0.55)"; ctx.lineWidth = 0.8;
      for (let i = 0; i < 5; i++) {
        const an = rot + i * TAU / 5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(an) * r * 0.8, y - Math.cos(an) * r * 0.8); ctx.stroke();
      }
    }
  }
  for (let i = 0; i < 90; i++) {
    const x = R() * S, y = 6 + R() * 300;
    ctx.fillStyle = R() < 0.7 ? "rgba(243,212,108,0.85)" : "rgba(210,220,255,0.8)";
    ctx.beginPath(); ctx.arc(x, y, 0.8 + R() * 1.3, 0, TAU); ctx.fill();
  }
  // gold band (canvas y 318..368)
  const gy0 = 318, gy1 = 368;
  const gg = ctx.createLinearGradient(0, gy0, 0, gy1);
  gg.addColorStop(0, "#9c7424"); gg.addColorStop(0.18, "#e2bb50"); gg.addColorStop(0.5, "#f1d473");
  gg.addColorStop(0.82, "#d9ae45"); gg.addColorStop(1, "#8f6a20");
  ctx.fillStyle = gg; ctx.fillRect(0, gy0, S, gy1 - gy0);
  ctx.strokeStyle = "rgba(110,76,16,0.8)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, gy0 + 7); ctx.lineTo(S, gy0 + 7); ctx.moveTo(0, gy1 - 7); ctx.lineTo(S, gy1 - 7); ctx.stroke();
  for (let i = 0; i < 16; i++) {
    const x = (i + 0.5) * (S / 16), y = (gy0 + gy1) / 2;
    ctx.fillStyle = "rgba(122,84,18,0.75)";
    ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 9); ctx.lineTo(x - 8, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fff0b0";
    ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(122,84,18,0.7)";
    ctx.beginPath(); ctx.arc(x + S / 32, y, 1.8, 0, TAU); ctx.fill();
  }
  // inner robe (canvas y 368..512)
  ctx.fillStyle = "#8d8ad8"; ctx.fillRect(0, 368, S, S - 368);
  for (let x = 0; x < S; x += 16) {
    const g = ctx.createLinearGradient(x, 0, x + 16, 0);
    g.addColorStop(0, "rgba(40,36,120,0.20)"); g.addColorStop(0.5, "rgba(200,200,255,0.14)"); g.addColorStop(1, "rgba(40,36,120,0.20)");
    ctx.fillStyle = g; ctx.fillRect(x, 368, 16, S - 368);
  }
  // shoe leather patch
  ctx.fillStyle = "#4b2f1b"; ctx.fillRect(0, 372, 50, S - 372);
  ctx.fillStyle = "rgba(120,80,44,0.5)"; ctx.fillRect(8, 380, 30, S - 392);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return tex;
}

function makeWeaveTexture(THREE) {
  const S = 64, cv = makeCanvas(S, S);
  if (!cv) return null;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(S, S), R = rng(99);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const over = (((x >> 2) + (y >> 2)) & 1) === 0;
      const along = over ? Math.sin(((x & 3) + 0.5) * PI / 4) : Math.sin(((y & 3) + 0.5) * PI / 4);
      const v = 128 + (over ? 34 : -6) * along + (R() - 0.5) * 22;
      const k = (y * S + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = clamp(v, 0, 255) | 0;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  return tex;
}

function makeStrandTexture(THREE, w, h, base, tones, count, seed, knots) {
  const cv = makeCanvas(w, h);
  if (!cv) return null;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const R = rng(seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i++) {
    let x = R() * w;
    const amp = 1 + R() * 3, f = 0.02 + R() * 0.05, ph = R() * TAU;
    ctx.strokeStyle = tones[(R() * tones.length) | 0];
    ctx.globalAlpha = 0.25 + R() * 0.5;
    ctx.lineWidth = 0.6 + R() * 1.6;
    // draw three copies so the strand wraps cleanly across the u seam
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      for (let y = 0; y <= h; y += 8) {
        const px = x + k * w + Math.sin(y * f * TAU * (h / 256) / (h / 256) + ph) * amp;
        if (y === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  if (knots) {
    for (let i = 0; i < knots; i++) {
      const x = R() * w, y = R() * h, rx = 3 + R() * 5, ry = 6 + R() * 10;
      ctx.strokeStyle = "rgba(40,22,10,0.6)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = "rgba(40,22,10,0.35)";
      ctx.beginPath(); ctx.ellipse(x, y, rx * 0.5, ry * 0.5, 0, 0, TAU); ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------------------------------------
// Shader hooks
// ---------------------------------------------------------------------------------------------
// Secondary motion: vertices weighted by aSway are pushed by a CPU spring offset plus a slow flutter.
function addSway(material, THREE, amp) {
  const u = {
    uSwayOff: { value: new THREE.Vector3() },
    uSwayTime: { value: 0 },
    uSwayAmp: { value: amp }
  };
  material.userData.sway = u;
  material.onBeforeCompile = function (shader) {
    shader.uniforms.uSwayOff = u.uSwayOff;
    shader.uniforms.uSwayTime = u.uSwayTime;
    shader.uniforms.uSwayAmp = u.uSwayAmp;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>",
        "#include <common>\nattribute float aSway;\nuniform vec3 uSwayOff;\nuniform float uSwayTime;\nuniform float uSwayAmp;")
      .replace("#include <begin_vertex>",
        "#include <begin_vertex>\n" +
        "transformed.x += aSway * ( uSwayOff.x + sin( uSwayTime * 1.7 + position.y * 6.0 + position.z * 4.0 ) * uSwayAmp );\n" +
        "transformed.z += aSway * ( uSwayOff.z + cos( uSwayTime * 1.3 + position.y * 5.0 + position.x * 4.0 ) * uSwayAmp );\n" +
        "transformed.y += aSway * uSwayOff.y;");
  };
  return u;
}

// Eyelids: vertices flagged in aLid rotate about the eye centre's X axis (blink / happy squint).
function addLids(material) {
  const u = { uBlink: { value: 0 } };
  material.userData.lids = u;
  material.onBeforeCompile = function (shader) {
    shader.uniforms.uBlink = u.uBlink;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 aLid;\nuniform float uBlink;")
      .replace("#include <beginnormal_vertex>",
        "#include <beginnormal_vertex>\n" +
        "if ( aLid.w > 0.5 ) { float lc = cos( uBlink ); float ls = sin( uBlink );\n" +
        "  objectNormal.yz = vec2( objectNormal.y * lc - objectNormal.z * ls, objectNormal.y * ls + objectNormal.z * lc ); }")
      .replace("#include <begin_vertex>",
        "#include <begin_vertex>\n" +
        "if ( aLid.w > 0.5 ) { float lc2 = cos( uBlink ); float ls2 = sin( uBlink );\n" +
        "  vec3 lrel = transformed - aLid.xyz;\n" +
        "  lrel.yz = vec2( lrel.y * lc2 - lrel.z * ls2, lrel.y * ls2 + lrel.z * lc2 );\n" +
        "  transformed = aLid.xyz + lrel; }");
  };
  return u;
}

// ---------------------------------------------------------------------------------------------
// Shape tables
// ---------------------------------------------------------------------------------------------
// inner robe: [y, rx, rz, centre z]
const ROBE = [
  [0.02, 0.330, 0.350, 0.000],
  [0.08, 0.332, 0.352, 0.000],
  [0.30, 0.285, 0.300, 0.000],
  [0.60, 0.235, 0.245, 0.005],
  [0.86, 0.200, 0.205, 0.015],
  [0.98, 0.205, 0.218, 0.030],
  [1.12, 0.210, 0.185, 0.030],
  [1.24, 0.215, 0.150, 0.030],
  [1.31, 0.165, 0.120, 0.035],
  [1.36, 0.078, 0.072, 0.040],
  [1.40, 0.056, 0.056, 0.040]
];
// shoulder capelet: [y, rx, rz, centre z]
const CAPE = [
  [1.150, 0.305, 0.200, 0.030],
  [1.200, 0.300, 0.196, 0.030],
  [1.270, 0.276, 0.176, 0.030],
  [1.325, 0.200, 0.140, 0.035],
  [1.365, 0.102, 0.096, 0.040],
  [1.395, 0.074, 0.074, 0.040]
];
// sleeves: [t, y, radius]
const SLEEVE_UP = [[0, 0.076, 0], [0.07, 0.064, 0.042], [0.2, 0.022, 0.078], [0.42, -0.06, 0.081], [1, -0.275, 0.073]];
const SLEEVE_LO = [[0, 0.072, 0], [0.07, 0.058, 0.042], [0.2, 0.012, 0.075], [0.45, -0.09, 0.075], [0.8, -0.19, 0.096], [1, -0.245, 0.126]];
// beard: [t, y, centre z, rx, rz front, rz back]   (head-centre space)
const BEARD = [
  [0.00, -0.020, 0.045, 0.000, 0.000, 0.000],
  [0.06, -0.036, 0.045, 0.086, 0.060, 0.050],
  [0.16, -0.064, 0.042, 0.113, 0.086, 0.070],
  [0.30, -0.125, 0.055, 0.120, 0.100, 0.060],
  [0.48, -0.225, 0.130, 0.106, 0.088, 0.032],
  [0.68, -0.345, 0.190, 0.082, 0.072, 0.022],
  [0.86, -0.455, 0.225, 0.046, 0.046, 0.016],
  [1.00, -0.535, 0.240, 0.000, 0.000, 0.000]
];
// hat brim: [v, r, y]
const BRIM = [[0, 0.085, 0.0], [0.42, 0.322, -0.004], [0.5, 0.334, 0.003], [0.58, 0.322, 0.010], [1, 0.108, 0.016]];

const L1 = 0.27, L2 = 0.25;          // upper arm, forearm
const GRIP_H = 1.05;                 // height of the grip along the staff
const CRYSTAL_Y = 1.68;
const GEST_DUR = { wave: 2.0, point: 1.8, cast: 1.5, cheer: 2.6 };
// pose channel indices
const RX = 0, RY = 1, RZ = 2, WX = 3, WY = 4, WZ = 5, GX = 6, GY = 7, GZ = 8, SX = 9, SZ = 10, FL = 11, NCH = 12;

function robeSway(y) { return Math.pow(clamp(1 - y / 0.95, 0, 1), 1.6); }

function robePt(phi, y, out) {
  const hemW = 1 - smooth(0.1, 0.95, y);
  const fold = 1 + hemW * (0.045 * Math.sin(phi * 9 + 0.6) + 0.025 * Math.sin(phi * 17 + 2.0));
  const sn = Math.sin(phi);
  out.x = hk(ROBE, y, 1) * Math.cos(phi) * fold;
  out.z = hk(ROBE, y, 3) + hk(ROBE, y, 2) * sn * fold * (sn < 0 ? 0.9 : 1);
  out.y = y;
}
function coatPt(u, y, out) {
  const gap = 0.16 + 0.26 * (1 - smooth(0.1, 1.0, y));
  const phi = PI / 2 + gap + u * (TAU - 2 * gap);
  const hemW = 1 - smooth(0.1, 0.75, y);
  const fold = 1 + hemW * (0.05 * Math.sin(phi * 7 + 1.3) + 0.03 * Math.sin(phi * 13 + 0.4));
  const add = 0.022 + 0.035 * hemW;
  const sn = Math.sin(phi);
  out.x = (hk(ROBE, y, 1) + add) * Math.cos(phi) * fold;
  out.z = hk(ROBE, y, 3) + (hk(ROBE, y, 2) + add) * sn * fold * (sn < 0 ? 0.92 : 1);
  out.y = y;
}
function capePt(phi, y, out) {
  const t = (y - 1.15) / (1.395 - 1.15), wB = Math.pow(1 - clamp(t, 0, 1), 3);
  const rip = 1 + 0.035 * Math.sin(phi * 10 + 0.5) * wB;
  out.x = hk(CAPE, y, 1) * Math.cos(phi) * rip;
  out.z = hk(CAPE, y, 3) + hk(CAPE, y, 2) * Math.sin(phi) * rip;
  out.y = y - 0.022 * Math.abs(Math.sin(phi * 5)) * wB;
}
function staffPath(y, out) {
  out.x = 0.014 * Math.sin(y * 4.2 + 0.5) + 0.006 * Math.sin(y * 11.0);
  out.y = y;
  out.z = 0.012 * Math.sin(y * 3.1 + 2.0);
}

// =============================================================================================
export function createWizard(THREE) {
  const tmpP = { x: 0, y: 0, z: 0 };
  const lin = function (hex) { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
  const setCol = function (o, c, k) { const m = k === undefined ? 1 : k; o.r = c[0] * m; o.g = c[1] * m; o.b = c[2] * m; };
  const mixCol = function (o, a, b, t) {
    o.r = a[0] + (b[0] - a[0]) * t; o.g = a[1] + (b[1] - a[1]) * t; o.b = a[2] + (b[2] - a[2]) * t;
  };

  // ------------------------------------------------------------------ textures & materials
  const clothTex = makeClothTexture(THREE);
  const weaveTex = makeWeaveTexture(THREE);
  const hairTex = makeStrandTexture(THREE, 128, 256, "#f1efe9", ["#ffffff", "#d3d6dd", "#c2c7d0", "#e6e3da"], 240, 311, 0);
  const woodTex = makeStrandTexture(THREE, 64, 256, "#6d4829", ["#4a2e18", "#8a6038", "#573620", "#7a5230"], 110, 517, 5);
  if (hairTex) hairTex.repeat.set(1, 1);

  const robeMat = new THREE.MeshStandardMaterial({
    color: clothTex ? 0xffffff : 0x2b2d84, map: clothTex, bumpMap: weaveTex, bumpScale: 0.9,
    roughness: 0.93, metalness: 0.0, side: THREE.DoubleSide
  });
  const robeSwayU = addSway(robeMat, THREE, 0.006);
  const hatMat = new THREE.MeshStandardMaterial({
    color: clothTex ? 0xffffff : 0x2b2d84, map: clothTex, bumpMap: weaveTex, bumpScale: 0.9,
    roughness: 0.93, metalness: 0.0, side: THREE.DoubleSide
  });
  const hatSwayU = addSway(hatMat, THREE, 0.004);
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: hairTex, bumpMap: hairTex, bumpScale: 1.4, vertexColors: true,
    roughness: 0.82, metalness: 0.0, side: THREE.DoubleSide
  });
  const hairSwayU = addSway(hairMat, THREE, 0.004);
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.62, metalness: 0.0 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.58, metalness: 0.0 });
  const lidU = addLids(headMat);
  const woodMat = new THREE.MeshStandardMaterial({
    color: woodTex ? 0xffffff : 0x6d4829, map: woodTex, bumpMap: woodTex, bumpScale: 1.6, roughness: 0.78, metalness: 0.0
  });
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0xa8dcff, emissive: 0x4fb0ff, emissiveIntensity: 1.3, roughness: 0.12, metalness: 0.0, flatShading: true
  });

  // ------------------------------------------------------------------ hierarchy
  const group = new THREE.Group(); group.name = "wizard";
  const pivot = new THREE.Group();
  const bodyRoot = new THREE.Group();
  const chest = new THREE.Group(); chest.position.set(0, 0.95, 0);
  const headPivot = new THREE.Group(); headPivot.position.set(0, 1.385 - 0.95, 0.04); headPivot.rotation.order = "YXZ";
  const headC = new THREE.Group(); headC.position.set(0, 0.1, 0.015);
  const JAW = [0, -0.03, 0.03];
  const jaw = new THREE.Group(); jaw.position.set(JAW[0], JAW[1], JAW[2]);
  const hatG = new THREE.Group(); hatG.position.set(0, 0.078, -0.006); hatG.rotation.set(-0.13, 0, 0.07);
  const staffG = new THREE.Group();
  const crystalG = new THREE.Group(); crystalG.position.set(0, CRYSTAL_Y, 0);
  const staffTip = new THREE.Object3D(); staffTip.position.set(0, CRYSTAL_Y, 0); staffTip.name = "wizardStaffTip";
  group.add(pivot); pivot.add(bodyRoot); bodyRoot.add(chest); bodyRoot.add(staffG);
  chest.add(headPivot); headPivot.add(headC); headC.add(jaw); headC.add(hatG);
  staffG.add(crystalG); staffG.add(staffTip);

  const meshes = [];
  const addMesh = function (parent, geo, mat, name) {
    const m = new THREE.Mesh(geo, mat);
    m.name = name; m.castShadow = true; m.receiveShadow = false;
    parent.add(m); meshes.push(m);
    return m;
  };
  const stats = { tris: 0, checks: {} };
  const finish = function (b, name) { stats.tris += b.tris; stats.checks[name] = b.checks; return b.build(); };

  // ------------------------------------------------------------------ robe (inner robe, belt, coat, piping, capelet, shoes)
  {
    const b = createBuilder(THREE, false);
    // inner robe
    b.grid(36, 26, function (u, v, o) {
      const y = 0.02 + v * (1.40 - 0.02);
      robePt(u * TAU, y, tmpP);
      o.x = tmpP.x; o.y = tmpP.y; o.z = tmpP.z;
      o.u = 0.12 + 0.88 * u; o.v = 0.015 + 0.24 * v; o.s = robeSway(y);
    }, { closeU: true });
    // belt (gold cord around the waist)
    b.grid(36, 6, function (u, v, o) {
      const psi = PI + v * TAU, y0 = 0.895;
      robePt(u * TAU, y0, tmpP);
      const k = 1 + (0.010 + 0.014 * Math.cos(psi)) / 0.2;
      o.x = tmpP.x * k; o.z = hk(ROBE, y0, 3) + (tmpP.z - hk(ROBE, y0, 3)) * k; o.y = y0 + 0.024 * Math.sin(psi);
      o.u = u * 3; o.v = 0.30 + 0.06 * (0.5 + 0.5 * Math.sin(psi)); o.s = robeSway(y0);
    }, { closeU: true, closeV: true });
    // open-fronted outer coat
    b.grid(32, 22, function (u, v, o) {
      const y = 0.10 + v * (1.33 - 0.10);
      coatPt(u, y, tmpP);
      o.x = tmpP.x; o.y = tmpP.y; o.z = tmpP.z;
      o.u = u; o.v = 0.293 + 0.69 * v; o.s = robeSway(y - 0.08) * 1.2;
    });
    // gold piping down both front edges of the coat
    for (let e = 0; e < 2; e++) {
      b.tube(6, 22, function (t, out) { coatPt(e, 0.10 + t * 1.2, out); },
        function (t) { return 0.012 * Math.sqrt(Math.sin(PI * clamp(0.04 + t * 0.92, 0, 1))) + 0.002; },
        [0, 0, 1],
        function (o, u, v) { o.u = v * 4; o.v = 0.30 + 0.06 * u; o.s = robeSway(0.10 + v * 1.2 - 0.08) * 1.2; });
    }
    // capelet over the shoulders
    b.grid(36, 8, function (u, v, o) {
      const y = 1.15 + v * (1.395 - 1.15);
      capePt(u * TAU, y, tmpP);
      o.x = tmpP.x; o.y = tmpP.y; o.z = tmpP.z;
      o.u = u; o.v = 0.44 + 0.5 * v; o.s = 0.12 * (1 - v) * (1 - v);
    }, { closeU: true });
    // capelet piping
    b.grid(36, 5, function (u, v, o) {
      const psi = PI + v * TAU, phi = u * TAU;
      capePt(phi, 1.15, tmpP);
      const rr = 0.009 * Math.cos(psi);
      o.x = tmpP.x + Math.cos(phi) * rr; o.z = tmpP.z + Math.sin(phi) * rr; o.y = tmpP.y + 0.009 * Math.sin(psi);
      o.u = u * 5; o.v = 0.31 + 0.04 * v; o.s = 0.12;
    }, { closeU: true, closeV: true });
    // pointed shoes peeking from under the hem
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      b.tube(14, 18, function (t, out) {
        out.x = sgn * (0.105 + 0.02 * t); out.y = 0.04 + 0.06 * t * t * t; out.z = 0.17 + 0.29 * t;
      }, function (t, phi) {
        const r = 0.062 * Math.pow(Math.sin(PI * clamp(t, 0, 1)), 0.6) * (1 - 0.6 * t);
        return r * (1 - 0.28 * Math.abs(Math.sin(phi)));
      }, [1, 0, 0], function (o) { o.u = 0.04; o.v = 0.1; });
    }
    addMesh(bodyRoot, finish(b, "robe"), robeMat, "wizardRobe");
  }

  // ------------------------------------------------------------------ sleeves (shared geometry for both arms)
  const sleeveGeo = function (keys, v0, v1, cuff) {
    const b = createBuilder(THREE, false);
    b.tube(14, 12, function (t, out) { out.x = 0; out.y = hk(keys, t, 1); out.z = 0; },
      function (t, phi) {
        let r = hk(keys, t, 2);
        if (cuff) r *= 1 + 0.06 * Math.sin(phi * 3 + 0.7) * t * t * t * t;
        return r;
      }, [1, 0, 0],
      function (o, u, v) { o.u = 0.02 + u * 0.3; o.v = v0 + (v1 - v0) * v; });
    return finish(b, cuff ? "sleeveLo" : "sleeveUp");
  };
  const upperGeo = sleeveGeo(SLEEVE_UP, 0.78, 0.58, false);
  const lowerGeo = sleeveGeo(SLEEVE_LO, 0.58, 0.300, true);

  // ------------------------------------------------------------------ hands
  const SKIN = lin(0xe9b993), SKIN_D = lin(0xd9a07e), ROSY = lin(0xd9806f), NOSE = lin(0xdf987f);
  const palm = function (b, keys) {
    b.tube(12, 10, function (t, out) { out.x = 0; out.y = hk(keys, t, 1); out.z = 0; },
      function (t, phi) { return ell(hk(keys, t, 2), hk(keys, t, 3), phi); }, [1, 0, 0],
      function (o) { setCol(o, SKIN); });
  };
  const fingerRad = function (r0) {
    return function (t) {
      const cap = t > 0.86 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.86) / 0.14, 2))) : 1;
      return r0 * (1 - 0.22 * t) * cap * (1 + 0.07 * Math.sin(t * PI * 3));
    };
  };
  // open, relaxed right hand: wrist at origin, fingers along -Y, palm normal +Z, thumb on -X
  let openHandGeo;
  {
    const b = createBuilder(THREE, false);
    palm(b, [[0, 0.10, 0.026, 0.024], [0.3, 0.0, 0.027, 0.021], [0.52, -0.03, 0.040, 0.017], [0.82, -0.075, 0.043, 0.015], [1, -0.096, 0, 0]]);
    const FX = [-0.031, -0.0105, 0.0105, 0.030], FLn = [0.074, 0.084, 0.078, 0.060], FR = [0.0105, 0.011, 0.0105, 0.0092];
    for (let i = 0; i < 4; i++) {
      const curl = 0.75 + i * 0.12, len = FLn[i], spread = (i - 1.5) * 0.09;
      b.tube(7, 8, function (t, out) {
        const a = curl * t;
        out.x = FX[i] + spread * t * len;
        out.y = -0.074 - len * Math.sin(a) / curl;
        out.z = len * (1 - Math.cos(a)) / curl;
      }, fingerRad(FR[i]), [1, 0, 0], function (o, u, v) { mixCol(o, SKIN, ROSY, 0.25 * v); });
    }
    b.tube(7, 8, function (t, out) {
      out.x = -0.034 - 0.040 * t; out.y = -0.030 - 0.046 * t + 0.012 * t * t; out.z = 0.006 + 0.026 * t;
    }, fingerRad(0.0128), [0, 0, 1], function (o, u, v) { mixCol(o, SKIN, ROSY, 0.25 * v); });
    openHandGeo = finish(b, "handOpen");
  }
  // left fist wrapped around the staff: staff axis along local X through FIST_C, thumb on +X
  const FIST_C = [0, -0.055, 0.038];
  let fistGeo;
  {
    const b = createBuilder(THREE, false);
    palm(b, [[0, 0.10, 0.026, 0.024], [0.3, 0.0, 0.027, 0.021], [0.52, -0.03, 0.040, 0.017], [0.85, -0.07, 0.042, 0.015], [1, -0.088, 0, 0]]);
    const FX = [0.032, 0.011, -0.010, -0.031], RR = 0.034;
    for (let i = 0; i < 4; i++) {
      const b0 = -0.62 + i * 0.03, b1 = 2.15 - i * 0.12;
      b.tube(7, 9, function (t, out) {
        const be = b0 + (b1 - b0) * t;
        out.x = FX[i]; out.y = FIST_C[1] - RR * Math.cos(be); out.z = FIST_C[2] + RR * Math.sin(be);
      }, fingerRad(0.0115 - i * 0.0006), [1, 0, 0], function (o, u, v) { mixCol(o, SKIN, ROSY, 0.3 * Math.sin(v * PI)); });
    }
    b.tube(7, 8, function (t, out) {
      out.x = bez3(0.040, 0.056, 0.046, 0.014, t);
      out.y = bez3(-0.026, -0.040, -0.056, -0.066, t);
      out.z = bez3(0.008, 0.040, 0.070, 0.076, t);
    }, fingerRad(0.0128), [0, 1, 0], function (o, u, v) { mixCol(o, SKIN, ROSY, 0.25 * v); });
    fistGeo = finish(b, "handFist");
  }

  // ------------------------------------------------------------------ arms
  const makeArm = function (side, handGeo, name) {
    const shoulder = new THREE.Group(); shoulder.position.set(side * 0.2, 1.27 - 0.95, 0.03);
    const elbow = new THREE.Group(); elbow.position.set(0, -L1, 0);
    const wrist = new THREE.Group(); wrist.position.set(0, -L2, 0);
    chest.add(shoulder); shoulder.add(elbow); elbow.add(wrist);
    addMesh(shoulder, upperGeo, robeMat, name + "SleeveUpper");
    addMesh(elbow, lowerGeo, robeMat, name + "SleeveLower");
    addMesh(wrist, handGeo, skinMat, name + "Hand");
    return {
      shoulder: shoulder, elbow: elbow, wrist: wrist,
      S: shoulder.position,
      pole: new THREE.Vector3(side * 0.7, -0.35, -0.6).normalize(),
      qU: new THREE.Quaternion(), qF: new THREE.Quaternion()
    };
  };
  const armL = makeArm(1, fistGeo, "wizardL");       // +X : holds the staff
  const armR = makeArm(-1, openHandGeo, "wizardR");  // -X : gestures

  // ------------------------------------------------------------------ head (skin, nose, ears, eyes, lids)
  const EYE_Y = 0.024, EYE_Z = 0.081, EYE_X = 0.042, EYE_R = 0.0165;
  {
    const b = createBuilder(THREE, true);
    b.grid(32, 24, function (u, v, o) {
      const phi = u * TAU, th = (v - 0.5) * PI, ct = Math.cos(th), st = Math.sin(th);
      const dx = ct * Math.cos(phi), dy = st, dz = ct * Math.sin(phi);
      let x = 0.1 * dx, y = 0.128 * dy, z = 0.112 * dz;
      if (y < 0) {
        const j = -y / 0.128;
        x *= 1 - 0.2 * j * j;
        if (z > 0) z += 0.012 * Math.sin(PI * j) * dz;
      }
      let disp = 0.010 * gauss(x, y, z, 0, 0.012, 0.11, 0.022), rosy = 0;
      for (let s = -1; s <= 1; s += 2) {
        disp += 0.012 * gauss(x, y, z, s * 0.04, 0.054, 0.095, 0.034);
        disp -= 0.013 * gauss(x, y, z, s * EYE_X, EYE_Y, 0.1, 0.024);
        disp += 0.013 * gauss(x, y, z, s * 0.056, -0.024, 0.085, 0.032);
        rosy += gauss(x, y, z, s * 0.056, -0.026, 0.09, 0.03);
      }
      o.x = x + dx * disp; o.y = y + dy * disp; o.z = z + dz * disp;
      mixCol(o, SKIN, ROSY, Math.min(1, rosy) * 0.55);
      // a hint of a mouth under the moustache
      const mth = gauss(x, y, z, 0, -0.062, 0.1, 0.016);
      o.r *= 1 - 0.45 * mth; o.g *= 1 - 0.6 * mth; o.b *= 1 - 0.6 * mth;
    }, { closeU: true });
    // bulbous nose
    b.ellipsoid(0, -0.012, 0.117, 0.024, 0.022, 0.030, 12, 8, function (o, u, v) { mixCol(o, NOSE, ROSY, 0.35 * (1 - v)); });
    // ears
    for (let s = -1; s <= 1; s += 2) {
      b.ellipsoid(s * 0.1, 0.0, 0.0, 0.014, 0.032, 0.021, 8, 6, function (o) { mixCol(o, SKIN, ROSY, 0.3); });
    }
    const WHITE = lin(0xf3f0ea), IRIS = lin(0x4f86cf), PUPIL = lin(0x0c0c12), LID = SKIN_D;
    for (let s = -1; s <= 1; s += 2) {
      const cx = s * EYE_X;
      // eyeball, pole towards +Z
      b.grid(14, 12, function (u, v, o) {
        const phi = u * TAU, th = (v - 0.5) * PI, ct = Math.cos(th);
        const sx = ct * Math.cos(phi), sy = Math.sin(th), sz = ct * Math.sin(phi);
        o.x = cx + EYE_R * sx; o.y = EYE_Y - EYE_R * sz; o.z = EYE_Z + EYE_R * sy;
        if (v > 0.9) setCol(o, PUPIL); else if (v > 0.77) setCol(o, IRIS); else setCol(o, WHITE);
      }, { closeU: true });
      // upper eyelid: a shell that the vertex shader swings down over the eye
      b.grid(8, 6, function (u, v, o) {
        const al = 0.78 + u * 1.55, a = (v - 0.5) * 2.3, R = EYE_R * 1.1;
        o.x = cx + R * Math.sin(a); o.y = EYE_Y + R * Math.cos(a) * Math.sin(al); o.z = EYE_Z + R * Math.cos(a) * Math.cos(al);
        setCol(o, LID);
        o.lx = cx; o.ly = EYE_Y; o.lz = EYE_Z; o.lw = 1;
      });
    }
    addMesh(headC, finish(b, "head"), headMat, "wizardHead");
  }

  // ------------------------------------------------------------------ hair (brows, moustache, back hair)
  const HAIR_W = [1, 1, 1], HAIR_G = lin(0xc9ccd4);
  {
    const b = createBuilder(THREE, false);
    for (let s = -1; s <= 1; s += 2) {
      // bushy brow with an upswept outer wisp
      b.tube(8, 10, function (t, out) {
        out.x = s * bez3(0.010, 0.040, 0.078, 0.100, t);
        out.y = bez3(0.050, 0.070, 0.056, 0.074, t);
        out.z = bez3(0.108, 0.108, 0.088, 0.058, t);
      }, function (t, phi) {
        return 0.0125 * Math.pow(Math.sin(PI * clamp(0.06 + t * 0.94, 0, 1)), 0.7) * (1 - 0.45 * t) * (1 + 0.22 * Math.sin(phi * 5 + t * 21));
      }, [0, 1, 0], function (o, u, v) {
        mixCol(o, HAIR_W, HAIR_G, 0.5 + 0.5 * Math.sin(u * TAU * 5)); o.u = u; o.v = v * 0.3;
      });
      // sweeping moustache
      b.tube(8, 12, function (t, out) {
        out.x = s * bez3(0.002, 0.045, 0.090, 0.112, t);
        out.y = bez3(-0.040, -0.046, -0.100, -0.066, t);
        out.z = bez3(0.116, 0.120, 0.098, 0.068, t);
      }, function (t, phi) {
        return 0.0175 * Math.pow(Math.sin(PI * clamp(0.1 + t * 0.9, 0, 1)), 0.75) * (1 - 0.5 * t) * (1 + 0.14 * Math.sin(phi * 4 + t * 12));
      }, [0, 1, 0], function (o, u, v) {
        mixCol(o, HAIR_W, HAIR_G, 0.4 + 0.4 * Math.sin(u * TAU * 4)); o.u = u; o.v = v * 0.5; o.s = 0.25 * v * v;
      });
    }
    // hair falling from under the hat round the sides and back
    b.grid(24, 9, function (u, v, o) {
      const phi = (PI - 0.3) + u * (PI + 0.6), y = 0.07 - v * 0.26, d = v;
      const w = 1 + 0.06 * Math.sin(phi * 11 + y * 40) * d + 0.04 * Math.sin(phi * 5 + 1.0) * d;
      o.x = (0.104 + 0.034 * d) * Math.cos(phi) * w;
      o.z = (0.117 + 0.030 * d) * Math.sin(phi) * w - 0.004;
      o.y = y - 0.02 * Math.abs(Math.sin(phi * 6)) * d;
      mixCol(o, HAIR_W, HAIR_G, 0.35 + 0.35 * Math.sin(phi * 11 + y * 40));
      o.u = u * 2; o.v = 1 - v; o.s = 0.7 * d * d;
    }, { flip: true });
    addMesh(headC, finish(b, "hair"), hairMat, "wizardHair");
  }

  // ------------------------------------------------------------------ beard (hangs from the jaw pivot)
  {
    const b = createBuilder(THREE, false);
    b.grid(30, 26, function (u, v, o) {
      const t = 1 - v, phi = u * TAU;      // v runs upward so the default winding faces outward
      const sn = Math.sin(phi), cs = Math.cos(phi);
      const lump = 1 + (0.075 * Math.sin(phi * 7 + t * 9) * t + 0.04 * Math.sin(phi * 13 - t * 14)) * smooth(0, 0.12, t);
      const rx = Math.max(0, hk(BEARD, t, 3)), rz = Math.max(0, hk(BEARD, t, sn >= 0 ? 4 : 5));
      o.x = rx * cs * lump + 0.016 * Math.sin(t * 8.5) * t * t;
      o.y = hk(BEARD, t, 1) - JAW[1];
      o.z = hk(BEARD, t, 2) + rz * sn * (sn >= 0 ? lump : 1) - JAW[2];
      mixCol(o, HAIR_W, HAIR_G, clamp(0.45 - 4.5 * (lump - 1), 0, 1));
      o.u = u * 3; o.v = t * 2; o.s = Math.pow(smooth(0.22, 1, t), 1.3);
    }, { closeU: true });
    addMesh(jaw, finish(b, "beard"), hairMat, "wizardBeard");
  }

  // ------------------------------------------------------------------ hat (brim, band, crooked cone)
  {
    const b = createBuilder(THREE, false);
    b.grid(36, 12, function (u, v, o) {
      const phi = u * TAU, r = hk(BRIM, v, 1), w = Math.pow(clamp((r - 0.1) / 0.23, 0, 1), 2);
      o.x = r * Math.cos(phi) * 0.96; o.z = r * Math.sin(phi) * 1.03;
      o.y = hk(BRIM, v, 2) + w * (0.022 * Math.sin(2 * phi + 0.7) + 0.012 * Math.sin(3 * phi + 2.0) - 0.022);
      o.u = u; o.v = 0.42 + 0.3 * clamp((r - 0.085) / 0.25, 0, 1); o.s = 0.22 * w;
    }, { closeU: true });
    b.grid(36, 2, function (u, v, o) {
      const phi = u * TAU, r = 0.1135 - 0.0045 * v;
      o.x = r * Math.cos(phi) * 0.96; o.z = r * Math.sin(phi) * 1.03; o.y = 0.012 + 0.04 * v;
      o.u = u * 2; o.v = 0.30 + 0.06 * v;
    }, { closeU: true });
    b.grid(28, 22, function (u, v, o) {
      const phi = u * TAU, h = v;
      const r = 0.107 * Math.pow(1 - h, 0.8) * (1 + 0.05 * Math.sin(h * 19 + 1) * (1 - h)) * (1 + 0.035 * Math.sin(phi * 3 + h * 8) * (1 - h));
      const cx = 0.04 * Math.sin(h * 3.0) * h;
      const cz = -0.19 * Math.pow(h, 2.4) - 0.03 * smooth(0.5, 0.7, h);
      o.x = cx + r * Math.cos(phi) * 0.96; o.z = cz + r * Math.sin(phi) * 1.03;
      o.y = 0.048 + 0.40 * h - 0.07 * h * h * h + 0.012 * Math.sin(phi + 1.0) * smooth(0.45, 0.6, h) * (1 - h);
      o.u = u * 0.46; o.v = 0.40 + 0.585 * h; o.s = h * h;
    }, { closeU: true });
    addMesh(hatG, finish(b, "hat"), hatMat, "wizardHat");
  }

  // ------------------------------------------------------------------ staff + crystal
  {
    const b = createBuilder(THREE, false);
    const TOP = 1.585;
    b.tube(10, 40, function (t, out) { staffPath(t * TOP, out); }, function (t, phi) {
      const y = t * TOP;
      let r = 0.019 + 0.004 * y
        + 0.006 * Math.exp(-Math.pow((y - 0.55) / 0.04, 2))
        + 0.007 * Math.exp(-Math.pow((y - 1.18) / 0.05, 2))
        + 0.013 * smooth(1.40, 1.54, y);
      r *= 1 + 0.05 * Math.sin(phi * 3 + y * 9);
      r *= Math.sqrt(smooth(0, 0.03, t)) * Math.sqrt(smooth(1, 0.975, t));
      return r;
    }, [0, 0, 1], function (o, u, v) { o.u = u; o.v = v * 2.4; });
    for (let k = 0; k < 3; k++) {
      const an = k * TAU / 3 + 0.5, ca = Math.cos(an), sa = Math.sin(an);
      staffPath(1.52, tmpP);
      const bx = tmpP.x, bz = tmpP.z;
      b.tube(6, 12, function (t, out) {
        const rho = bez3(0.008, 0.112, 0.088, 0.024, t);
        out.x = bx * (1 - t) + ca * rho; out.z = bz * (1 - t) + sa * rho; out.y = bez3(1.50, 1.575, 1.745, 1.805, t);
      }, function (t) { return (0.0135 - 0.0075 * t) * Math.sqrt(smooth(1, 0.9, t)) * (1 + 0.1 * Math.sin(t * 14)); },
      [-sa, 0, ca], function (o, u, v) { o.u = u; o.v = v * 0.6; });
    }
    addMesh(staffG, finish(b, "staff"), woodMat, "wizardStaff");

    const c = createBuilder(THREE, false);
    const CR = [[0, -0.088, 0], [0.3, -0.046, 0.030], [0.55, 0.0, 0.046], [0.8, 0.058, 0.033], [1, 0.106, 0]];
    c.grid(6, 4, function (u, v, o) {
      const k = CR[Math.round(v * 4)], phi = u * TAU + (Math.round(v * 4) === 2 ? 0 : 0.0);
      o.x = k[2] * Math.cos(phi); o.y = k[1]; o.z = k[2] * Math.sin(phi);
    }, { closeU: true });
    addMesh(crystalG, finish(c, "crystal"), crystalMat, "wizardCrystal");
  }
  const crystalMesh = meshes[meshes.length - 1];
  crystalMesh.castShadow = false;

  // ------------------------------------------------------------------ animation state
  const gripLocal = new THREE.Vector3();
  staffPath(GRIP_H, tmpP); gripLocal.set(tmpP.x, tmpP.y, tmpP.z);
  const STAFF_BASE = new THREE.Vector3(0.385, 0.0, 0.2);
  const fistC = new THREE.Vector3(FIST_C[0], FIST_C[1], FIST_C[2]);

  const des = new Float32Array(NCH), cur = new Float32Array(NCH);
  let curInit = false;

  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
  const vDir = new THREE.Vector3(), vN = new THREE.Vector3(), vPerp = new THREE.Vector3(), vE = new THREE.Vector3();
  const vY = new THREE.Vector3(), vZ = new THREE.Vector3(), vT = new THREE.Vector3();
  const vAxis = new THREE.Vector3(), vGrip = new THREE.Vector3(), vDown = new THREE.Vector3();
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), qHand = new THREE.Quaternion(), qChestInv = new THREE.Quaternion();
  const m1 = new THREE.Matrix4(), mChestInv = new THREE.Matrix4();
  const e1 = new THREE.Euler();

  const st = {
    t: 0, talking: false, talk: 0,
    gest: null, gT: 0, gDur: 0,
    hasLook: false, lookX: 0, lookZ: 0,
    bodyYaw: 0, headYaw: 0, headPitch: 0.08,
    appearT: -1,
    blinkT: -1, nextBlink: 2.2, seed: 0.37,
    px: 0, pz: 0, hasPrev: false, prevYaw: 0, prevHeadYaw: 0, prevHeadPitch: 0, prevHop: 0
  };
  const sprRobe = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  const sprHair = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  const sprHat = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  const stepSpring = function (s, tx, ty, tz, k, c, dt) {
    s.vx += (k * (tx - s.x) - c * s.vx) * dt; s.x += s.vx * dt;
    s.vy += (k * (ty - s.y) - c * s.vy) * dt; s.y += s.vy * dt;
    s.vz += (k * (tz - s.z) - c * s.vz) * dt; s.z += s.vz * dt;
  };
  const mixCh = function (i, value, w) { des[i] += (value - des[i]) * w; };

  // Two-bone IK. Target (tx,ty,tz) in chest space. Leaves the forearm orientation in arm.qF.
  const solveArm = function (arm, tx, ty, tz) {
    const S = arm.S;
    vDir.set(tx - S.x, ty - S.y, tz - S.z);
    let len = vDir.length();
    if (len < 1e-5) { vDir.set(0, -1, 0); len = 1e-5; } else vDir.multiplyScalar(1 / len);
    const L = clamp(len, 0.08, L1 + L2 - 0.004);
    vN.crossVectors(vDir, arm.pole);
    if (vN.lengthSq() < 1e-8) vN.set(vDir.z, 0, -vDir.x);
    if (vN.lengthSq() < 1e-8) vN.set(1, 0, 0);
    vN.normalize();
    vPerp.crossVectors(vN, vDir);                       // towards the pole (elbow side)
    const a = (L1 * L1 - L2 * L2 + L * L) / (2 * L);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    vE.copy(vDir).multiplyScalar(a).addScaledVector(vPerp, h);          // elbow relative to shoulder
    vT.copy(vDir).multiplyScalar(L).sub(vE);                            // forearm vector
    vY.copy(vE).multiplyScalar(-1).normalize();
    vZ.crossVectors(vN, vY);
    m1.makeBasis(vN, vY, vZ); arm.qU.setFromRotationMatrix(m1);
    vY.copy(vT).multiplyScalar(-1).normalize();
    vZ.crossVectors(vN, vY);
    m1.makeBasis(vN, vY, vZ); arm.qF.setFromRotationMatrix(m1);
    arm.shoulder.quaternion.copy(arm.qU);
    arm.elbow.quaternion.copy(arm.qU).invert().multiply(arm.qF);
  };

  const update = function (dt, time) {
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    st.t += dt;
    const T = (typeof time === "number" && isFinite(time)) ? time : st.t;
    const kFast = 1 - Math.exp(-dt * 14);

    // ---- envelopes
    st.talk += ((st.talking ? 1 : 0) - st.talk) * (1 - Math.exp(-dt * 8));
    let g = 0, gp = 0;
    if (st.gest) {
      st.gT += dt;
      if (st.gT >= st.gDur) st.gest = null;
      else { g = smooth(0, 0.22, st.gT) * (1 - smooth(st.gDur - 0.35, st.gDur, st.gT)); gp = st.gT / st.gDur; }
    }
    const gest = st.gest;
    // syllable-ish mouth flap
    let open = Math.sin(T * 11.0) * 0.6 + Math.sin(T * 17.3 + 1.0) * 0.4 + Math.sin(T * 5.1 + 2.0) * 0.25;
    open = clamp(open, 0, 1) * st.talk;

    // ---- look: body follows slowly outside a dead zone, the head leads
    let yawTarget = 0, pitchTarget = 0.08;
    if (st.hasLook) {
      const dx = st.lookX - group.position.x, dz = st.lookZ - group.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 0.05) {
        const diff = wrapPi(Math.atan2(dx, dz) - group.rotation.y - st.bodyYaw);
        const follow = diff - clamp(diff, -0.12, 0.12);
        st.bodyYaw += follow * (1 - Math.exp(-dt * 3.6));
        yawTarget = clamp(diff, -0.75, 0.75);
        pitchTarget = clamp(Math.atan2(1.2, Math.max(dist, 0.4)) * 0.75, 0, 0.5);
      }
    }
    st.headYaw += (yawTarget - st.headYaw) * (1 - Math.exp(-dt * 7));
    st.headPitch += (pitchTarget - st.headPitch) * (1 - Math.exp(-dt * 6));

    // ---- desired pose: idle
    const sxIdle = 0.05 + 0.010 * Math.sin(T * 0.6) + st.talk * 0.025 * Math.sin(T * 2.1);
    const szIdle = -0.06 + 0.006 * Math.sin(T * 0.47 + 1.0);
    e1.set(sxIdle, 0, szIdle); q1.setFromEuler(e1);
    v1.copy(gripLocal).applyQuaternion(q1).add(STAFF_BASE);
    des[GX] = v1.x; des[GY] = v1.y; des[GZ] = v1.z; des[SX] = sxIdle; des[SZ] = szIdle;
    des[RX] = -0.285 + 0.008 * Math.sin(T * 0.9);
    des[RY] = 0.85 + 0.006 * Math.sin(T * 1.6);
    des[RZ] = 0.10 + 0.012 * Math.sin(T * 0.7 + 1.0);
    des[WX] = 0.15; des[WY] = 0; des[WZ] = 0;
    des[FL] = 0;
    // talking: the free hand draws little circles in front of the chest
    const tk = st.talk * (1 - g);
    if (tk > 0.001) {
      mixCh(RX, -0.20 + 0.05 * Math.sin(T * 2.3), tk);
      mixCh(RY, 1.08 + 0.05 * Math.sin(T * 3.1 + 1.0) + 0.03 * open, tk);
      mixCh(RZ, 0.30 + 0.03 * Math.cos(T * 2.3), tk);
      mixCh(WX, -0.25, tk); mixCh(WY, -0.7 + 0.3 * Math.sin(T * 2.9), tk);
    }
    let hop = 0, squint = 0, chestLean = 0, chestTwist = 0;
    if (gest && g > 0.001) {
      if (gest === "wave") {
        const w = Math.sin(st.gT * 9.5);
        mixCh(RX, -0.37 + 0.10 * w, g); mixCh(RY, 1.60 + 0.02 * Math.cos(st.gT * 9.5), g); mixCh(RZ, 0.14, g);
        mixCh(WX, 0, g); mixCh(WY, -0.9, g); mixCh(WZ, 0.45 * w, g);
        squint = 0.25 * g; chestTwist = -0.03 * g;
      } else if (gest === "point") {
        const jab = 0.03 * Math.sin(st.gT * 12) * Math.exp(-st.gT * 3);
        mixCh(RX, -0.10, g); mixCh(RY, 1.29, g); mixCh(RZ, 0.50 + jab, g);
        mixCh(WX, 0.1, g); mixCh(WY, 0, g); mixCh(WZ, 0, g);
        chestLean = 0.04 * g; chestTwist = 0.05 * g;
      } else if (gest === "cast") {
        const thrust = smooth(0.25, 0.45, gp), wind = smooth(0, 0.2, gp) * (1 - thrust);
        mixCh(GX, 0.27, g); mixCh(GY, 1.30 + 0.10 * thrust, g); mixCh(GZ, 0.20 + 0.18 * thrust - 0.05 * wind, g);
        mixCh(SX, -0.28 * wind + 0.62 * thrust, g); mixCh(SZ, -0.10, g);
        mixCh(RX, -0.42, g); mixCh(RY, 1.36 + 0.08 * thrust, g); mixCh(RZ, 0.10 + 0.14 * thrust, g);
        mixCh(WX, -0.3, g); mixCh(WY, -0.6, g);
        des[FL] = thrust * (1 - smooth(0.7, 1, gp)) * (0.8 + 0.2 * Math.sin(st.gT * 40));
        chestLean = (0.05 * thrust - 0.03 * wind) * g;
      } else if (gest === "cheer") {
        const w = Math.sin(st.gT * 10.5);
        hop = Math.abs(Math.sin(st.gT * PI * 2.3)) * 0.085 * g;
        mixCh(GX, 0.37, g); mixCh(GY, 1.56 + 0.04 * w, g); mixCh(GZ, 0.12, g);
        mixCh(SX, -0.06, g); mixCh(SZ, -0.22 + 0.05 * w, g);
        mixCh(RX, -0.34, g); mixCh(RY, 1.68 + 0.04 * w, g); mixCh(RZ, 0.08, g);
        mixCh(WX, 0, g); mixCh(WY, -0.9, g); mixCh(WZ, 0.4 * w, g);
        des[FL] = 0.35 * g * (0.6 + 0.4 * w);
        squint = 0.45 * g; chestLean = -0.04 * g;
      }
    }
    if (!curInit) { cur.set(des); curInit = true; }
    else for (let i = 0; i < NCH; i++) cur[i] += (des[i] - cur[i]) * kFast;

    // ---- appear puff
    let scl = 1, sclY = 1, spin = 0, flare = cur[FL];
    if (st.appearT >= 0) {
      st.appearT += dt;
      const p = st.appearT / 0.75;
      if (p >= 1.5) st.appearT = -1;
      else {
        scl = Math.max(0.001, 1 - Math.exp(-6 * p) * Math.cos(p * 9));
        const k = clamp(1 - p, 0, 1);
        sclY = scl * (1 + 0.3 * k * k);
        spin = -5.0 * k * k * k;
        flare += k;
      }
    }
    pivot.scale.set(scl, sclY, scl);
    pivot.rotation.y = st.bodyYaw + spin;

    // ---- body, chest, head
    bodyRoot.position.y = hop;
    bodyRoot.rotation.z = Math.sin(T * 0.7) * 0.012;
    bodyRoot.rotation.x = Math.sin(T * 0.53 + 1.0) * 0.010;
    const breath = Math.sin(T * 1.6);
    chest.position.y = 0.95 + 0.004 * breath;
    chest.rotation.x = 0.02 + 0.006 * breath + chestLean + 0.012 * open;
    chest.rotation.y = chestTwist + 0.01 * Math.sin(T * 0.41);
    headPivot.rotation.set(
      st.headPitch + 0.05 * open + 0.02 * Math.sin(T * 0.9 + 0.5) + st.talk * 0.035 * Math.sin(T * 3.3) - 0.12 * squint,
      st.headYaw + st.talk * 0.04 * Math.sin(T * 1.9),
      0.025 * Math.sin(T * 0.6) + st.talk * 0.03 * Math.sin(T * 2.6)
    );
    jaw.rotation.x = open * 0.13;
    jaw.position.y = JAW[1] - open * 0.008;

    // ---- blink
    let blink = 0;
    if (st.blinkT >= 0) {
      st.blinkT += dt;
      if (st.blinkT >= 0.17) st.blinkT = -1; else blink = Math.sin(PI * st.blinkT / 0.17);
    } else {
      st.nextBlink -= dt;
      if (st.nextBlink <= 0) {
        st.blinkT = 0;
        st.seed = (st.seed * 9301.0 + 0.2113) % 1;
        st.nextBlink = 1.6 + st.seed * 3.8;
      }
    }
    lidU.uBlink.value = Math.max(blink, squint) * 1.25;

    // ---- staff: placed from its grip point so the hand can always reach it
    staffG.rotation.set(cur[SX], 0, cur[SZ]);
    v1.copy(gripLocal).applyQuaternion(staffG.quaternion);
    staffG.position.set(cur[GX] - v1.x, cur[GY] - v1.y, cur[GZ] - v1.z);

    // ---- arms (everything converted into chest space)
    chest.updateMatrix();
    mChestInv.copy(chest.matrix).invert();
    qChestInv.copy(chest.quaternion).invert();

    // left: fist wraps the staff
    vGrip.set(cur[GX], cur[GY], cur[GZ]).applyMatrix4(mChestInv);
    vAxis.set(0, 1, 0).applyQuaternion(staffG.quaternion).applyQuaternion(qChestInv).normalize();
    vDown.copy(vGrip).sub(armL.S);
    vDown.addScaledVector(vAxis, -vDown.dot(vAxis));
    if (vDown.lengthSq() < 1e-8) vDown.set(0, 0, 1);
    vDown.normalize();
    v2.copy(vDown).multiplyScalar(-1);                 // hand +Y
    v3.crossVectors(vAxis, v2);                        // hand +Z (palm normal)
    m1.makeBasis(vAxis, v2, v3); qHand.setFromRotationMatrix(m1);
    v4.copy(fistC).applyQuaternion(qHand);
    solveArm(armL, vGrip.x - v4.x, vGrip.y - v4.y, vGrip.z - v4.z);
    armL.wrist.quaternion.copy(armL.qF).invert().multiply(qHand);

    // right: free hand
    v1.set(cur[RX], cur[RY], cur[RZ]).applyMatrix4(mChestInv);
    solveArm(armR, v1.x, v1.y, v1.z);
    e1.set(cur[WX], cur[WY], cur[WZ]);
    armR.wrist.quaternion.setFromEuler(e1);

    // ---- crystal
    const pulse = 0.5 + 0.5 * Math.sin(T * 2.4);
    crystalMat.emissiveIntensity = 0.95 + 0.7 * pulse + 0.15 * Math.sin(T * 5.3) + flare * 2.6 + 0.25 * open;
    const cs = 1 + 0.04 * pulse + flare * 0.22;
    crystalG.scale.set(cs, cs, cs);
    crystalG.rotation.y = T * 0.6;
    crystalG.position.y = CRYSTAL_Y + 0.006 * Math.sin(T * 1.7);

    // ---- secondary motion springs
    let lvx = 0, lvz = 0, yawRate = 0, headYawRate = 0, headPitchRate = 0, hopVel = 0;
    const yawNow = group.rotation.y + st.bodyYaw;
    if (st.hasPrev && dt > 1e-5) {
      const wx = (group.position.x - st.px) / dt, wz = (group.position.z - st.pz) / dt;
      const c = Math.cos(yawNow), s = Math.sin(yawNow);
      lvx = clamp(wx * c - wz * s, -6, 6); lvz = clamp(wx * s + wz * c, -6, 6);
      yawRate = clamp(wrapPi(yawNow - st.prevYaw) / dt, -8, 8);
      headYawRate = clamp((st.headYaw - st.prevHeadYaw) / dt, -8, 8) + yawRate;
      headPitchRate = clamp((st.headPitch - st.prevHeadPitch) / dt, -8, 8);
      hopVel = clamp((hop - st.prevHop) / dt, -3, 3);
    }
    st.px = group.position.x; st.pz = group.position.z; st.hasPrev = true;
    st.prevYaw = yawNow; st.prevHeadYaw = st.headYaw; st.prevHeadPitch = st.headPitch; st.prevHop = hop;

    stepSpring(sprRobe, clamp(-lvx * 0.05 - yawRate * 0.012, -0.14, 0.14), clamp(-hopVel * 0.03, -0.05, 0.08),
      clamp(-lvz * 0.05, -0.14, 0.14), 55, 6, dt);
    stepSpring(sprHair, clamp(-lvx * 0.03 - headYawRate * 0.03, -0.09, 0.09), clamp(-hopVel * 0.02, -0.03, 0.05),
      clamp(-lvz * 0.03 - headPitchRate * 0.02, -0.09, 0.09), 70, 7, dt);
    stepSpring(sprHat, clamp(-lvx * 0.04 - headYawRate * 0.035, -0.1, 0.1), 0,
      clamp(-lvz * 0.04 - headPitchRate * 0.04 - hopVel * 0.02, -0.1, 0.1), 45, 4.5, dt);
    robeSwayU.uSwayOff.value.set(sprRobe.x, sprRobe.y, sprRobe.z);
    hairSwayU.uSwayOff.value.set(sprHair.x, sprHair.y, sprHair.z);
    hatSwayU.uSwayOff.value.set(sprHat.x, 0, sprHat.z);
    robeSwayU.uSwayTime.value = T; hairSwayU.uSwayTime.value = T; hatSwayU.uSwayTime.value = T;
    hatG.rotation.z = 0.07 + sprHat.x * 0.5;
    hatG.rotation.x = -0.13 - sprHat.z * 0.5;
  };

  const api = {
    group: group,
    staffTip: staffTip,
    update: update,
    setTalking: function (on) { st.talking = !!on; },
    gesture: function (name) {
      const d = GEST_DUR[name];
      if (!d) return 0;
      st.gest = name; st.gT = 0; st.gDur = d;
      return d;
    },
    lookAt: function (x, z) {
      if (typeof x !== "number" || typeof z !== "number" || !isFinite(x) || !isFinite(z)) return;
      st.hasLook = true; st.lookX = x; st.lookZ = z;
    },
    appear: function () {
      st.appearT = 0;
      pivot.scale.set(0.001, 0.001, 0.001);
      // face the look target straight away so he does not swivel while popping in
      if (st.hasLook) {
        const dx = st.lookX - group.position.x, dz = st.lookZ - group.position.z;
        if (dx * dx + dz * dz > 0.0025) st.bodyYaw = Math.atan2(dx, dz) - group.rotation.y;
      }
      st.hasPrev = false;
      return 0.75;
    },
    // extras
    get talking() { return st.talking; },
    get gesturing() { return st.gest; },
    height: 1.92,
    radius: 0.45,
    triangles: stats.tris,
    drawCalls: meshes.length,
    _stats: stats,
    dispose: function () {
      const seen = [];
      for (let i = 0; i < meshes.length; i++) {
        const m = meshes[i];
        if (seen.indexOf(m.geometry) < 0) { seen.push(m.geometry); m.geometry.dispose(); }
        if (seen.indexOf(m.material) < 0) { seen.push(m.material); m.material.dispose(); }
      }
      if (clothTex) clothTex.dispose();
      if (weaveTex) weaveTex.dispose();
      if (hairTex) hairTex.dispose();
      if (woodTex) woodTex.dispose();
    }
  };

  update(0, 0); // settle into the idle pose so the first rendered frame is correct
  return api;
}
