// stage.js - the PLATYPUS TRICKS show arena (level 4). See LEVELS.md B5.
//
// createStage(ctx) -> world { name: "stage", group, heightAt, waterAt, confine, camBounds, env, P, hoops,
//   seats, spots[4], screen, setCue, setEnergy, setHoopFlame, setBeat, reset, update, ... }
//
// Draw calls (no shadow casters): set (vertex colours) 1, floor 1, water 1, glow 1, light beams + floor
// pools + haze 1, halos + flames + motes 1, big screen 1, banners 1  = 8.  Two PointLights (key + fill)
// exist for the whole life of the world; only their intensity / colour / position change.
// Everything animated is closed-form in shaders or a handful of uniform writes: no per-frame allocation.

const STAGE_X = 11, STAGE_Z = 7, CORNER = 4;       // walkable half extents, front corner radius
const ARENA_Y = -0.9;                                // arena floor (the stage is a raised thrust)
const POOL_Z = 3, POOL_HX = 4.5, POOL_HZ = 2.25, POOL_R = 1.0, POOL_DEPTH = 1.65, WATER_Y = -0.05;
const TUN_HW = 1.6, TUN_Z0 = -13, TUN_END = -16, TUN_H = 2.6;
const TOWER = { x0: -9.1, x1: -6.9, z0: -0.1, z1: 2.1, y: 1.6, rx0: -8.8, rx1: -7.2, rz0: -3 };
const POD = { x: 8, z: 0, r: 1.0, r2: 1.5, y: 0.8, y2: 0.4 };
const TRUSS_Y = 8.9, TRUSS_ZB = -5.8, TRUSS_ZM = 1.5, TRUSS_ZF = 7.6, TRUSS_X = 12.5;
const NB = 16;   // light beams: 0..3 follow spots, 4..15 wash beams
const NCH = 14;  // glow channels
const CH = { rim: 0, pool: 1, washA: 2, spot0: 3, house: 7, tunnel: 8, hoop: 9, fire: 10, marquee: 11, washB: 12, trim: 13 };
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// layout maths (pure, no allocation)
// ---------------------------------------------------------------------------------------------
function sdPool(x, z) {
  const qx = Math.abs(x) - (POOL_HX - POOL_R), qz = Math.abs(z - POOL_Z) - (POOL_HZ - POOL_R);
  const ox = qx > 0 ? qx : 0, oz = qz > 0 ? qz : 0;
  const inside = Math.min(Math.max(qx, qz), 0);
  return Math.sqrt(ox * ox + oz * oz) + inside - POOL_R;
}
function inStage(x, z) {
  if (x < -STAGE_X || x > STAGE_X || z < -STAGE_Z || z > STAGE_Z) return false;
  const cx = Math.abs(x) - (STAGE_X - CORNER), cz = z - (STAGE_Z - CORNER);
  return !(cx > 0 && cz > 0 && cx * cx + cz * cz > CORNER * CORNER);
}
function heightAt(x, z) {
  if (z < -STAGE_Z) return 0;                                   // tunnel / backstage
  if (!inStage(x, z)) return ARENA_Y;
  const d = sdPool(x, z);
  if (d < 0) {
    let k = -d / 0.6; if (k > 1) k = 1;
    return -POOL_DEPTH * k * k * (3 - 2 * k);
  }
  if (x < -6.5) {
    if (x >= TOWER.x0 && x <= TOWER.x1 && z >= TOWER.z0 && z <= TOWER.z1) return TOWER.y;
    if (x >= TOWER.rx0 && x <= TOWER.rx1 && z >= TOWER.rz0 && z < TOWER.z0) return (z - TOWER.rz0) / (TOWER.z0 - TOWER.rz0) * TOWER.y;
  } else if (x > 6) {
    const dx = x - POD.x, dz = z - POD.z, r2 = dx * dx + dz * dz;
    if (r2 < POD.r * POD.r) return POD.y;
    if (r2 < POD.r2 * POD.r2) return POD.y2;
  }
  return 0;
}
function waterAt(x, z) { return sdPool(x, z) < 0.02 ? WATER_Y : -Infinity; }
function confine(o, radius) {
  const r = radius || 0;
  let x = o.x, z = o.z;
  const zBack = -STAGE_Z + r;
  if (z < zBack) {
    const w = TUN_HW - r;
    if (x >= -w && x <= w) { if (z < TUN_Z0 + r) z = TUN_Z0 + r; }
    else {
      const dxw = Math.abs(x) - w, dzs = zBack - z;
      if (dxw < dzs || z < -STAGE_Z - 0.6) { x = x < 0 ? -w : w; if (z < TUN_Z0 + r) z = TUN_Z0 + r; }
      else z = zBack;
    }
  }
  const lx = STAGE_X - r;
  if (x < -lx) x = -lx; else if (x > lx) x = lx;
  if (z > STAGE_Z - r) z = STAGE_Z - r;
  const ccx = STAGE_X - CORNER, ccz = STAGE_Z - CORNER;
  const ax = Math.abs(x) - ccx, az = z - ccz;
  if (ax > 0 && az > 0) {
    const d = Math.sqrt(ax * ax + az * az), lim = CORNER - r;
    if (d > lim) { const s = lim / d; x = (x < 0 ? -1 : 1) * (ccx + ax * s); z = ccz + az * s; }
  }
  o.x = x; o.z = z;
}
// stage outline as [x, z] pairs (counter-clockwise seen from above with +z toward the viewer)
function outlinePts() {
  const p = [[-STAGE_X, -STAGE_Z], [STAGE_X, -STAGE_Z], [STAGE_X, STAGE_Z - CORNER]];
  const n = 14;
  for (let i = 1; i <= n; i++) { const a = (i / n) * Math.PI / 2; p.push([STAGE_X - CORNER + Math.cos(a) * CORNER, STAGE_Z - CORNER + Math.sin(a) * CORNER]); }
  for (let i = 0; i <= n; i++) { const a = Math.PI / 2 + (i / n) * Math.PI / 2; p.push([-(STAGE_X - CORNER) + Math.cos(a) * CORNER, STAGE_Z - CORNER + Math.sin(a) * CORNER]); }
  return p;
}
function poolPts(grow) {
  const p = [], hx = POOL_HX - POOL_R, hz = POOL_HZ - POOL_R, r = POOL_R + grow, n = 8;
  const c = [[hx, hz], [-hx, hz], [-hx, -hz], [hx, -hz]];
  for (let q = 0; q < 4; q++) for (let i = 0; i <= n; i++) {
    const a = q * Math.PI / 2 + (i / n) * Math.PI / 2;
    p.push([c[q][0] + Math.cos(a) * r, POOL_Z + c[q][1] + Math.sin(a) * r]);
  }
  return p;
}
function buildSeats() {
  const out = [];
  // front bank: 9 rows facing the stage (-z)
  for (let r = 0; r < 9; r++) {
    const z = 9.75 + 0.85 * r, y = -0.35 + 0.42 * r;
    for (let i = 0; i < 43; i++) {
      const x = -12.6 + i * 0.6;
      if (Math.abs(Math.abs(x) - 4.5) < 0.5) continue;           // two aisles
      out.push(x, y, z, Math.atan2(-x * 0.02, -1));
    }
  }
  // side banks: 7 rows each
  for (let s = -1; s <= 1; s += 2) for (let r = 0; r < 7; r++) {
    const x = s * (14.35 + 0.85 * r), y = -0.35 + 0.42 * r;
    for (let i = 0; i < 23; i++) {
      const z = -5.6 + i * 0.6;
      if (Math.abs(z - 1.0) < 0.35) continue;                      // aisle
      out.push(x, y, z, Math.atan2(-s, -(z - 1) * 0.02));
    }
  }
  return new Float32Array(out);
}

// ---------------------------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------------------------
const GLOW_VERT = /* glsl */ `
uniform vec3 uCh[${NCH}];
attribute vec3 aCh;
varying vec3 vCol;
void main() {
  vCol = uCh[int(aCh.x + 0.5)] * aCh.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const GLOW_FRAG = /* glsl */ `
varying vec3 vCol;
void main() { gl_FragColor = vec4(min(vCol, vec3(1.0)), 1.0); }`;

// beams: aB = (angle | u, t | v, beam index | channel, kind)   kind 0 cone, 1 floor pool, 3 haze card
const BEAM_VERT = /* glsl */ `
uniform vec3 uSrc[${NB}];
uniform vec3 uDst[${NB}];
uniform vec4 uCol[${NB}];
uniform float uRad[${NB}];
uniform vec3 uHaze;
attribute vec4 aB;
varying vec3 vCol;
varying vec3 vW;
varying float vT;
varying float vEdge;
varying float vKind;
varying vec2 vUv;
void main() {
  vec3 wp = position;
  vKind = aB.w; vT = aB.y; vEdge = 1.0; vUv = aB.xy;
  if (aB.w < 1.5) {
    int i = int(aB.z + 0.5);
    vec3 s = uSrc[i], d = uDst[i];
    vec3 ax = d - s; float L = max(length(ax), 0.001); ax /= L;
    vec4 c = uCol[i];
    if (aB.w < 0.5) {
      vec3 h = abs(ax.x) > 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
      vec3 u = normalize(cross(ax, h)); vec3 v = cross(ax, u);
      vec3 rad = u * cos(aB.x) + v * sin(aB.x);
      wp = s + ax * (L * aB.y) + rad * mix(0.07, uRad[i], aB.y);
      vec3 V = normalize(cameraPosition - wp);
      // soft volumetric read: brightest looking through the middle of the cone, nothing at the silhouette
      vec3 side = normalize(cross(ax, V) + vec3(1e-4));
      vEdge = 1.0 - abs(dot(rad, side));
      vCol = c.rgb;
    } else {
      float len = length(ax.xz);
      vec2 hd = len > 0.001 ? ax.xz / len : vec2(1.0, 0.0);
      float st = 1.0 / max(0.42, -ax.y);
      vec2 q = vec2(cos(aB.x), sin(aB.x)) * aB.y * uRad[i] * 1.12;
      wp = d + vec3(hd.x * q.x * st - hd.y * q.y, 0.035, hd.y * q.x * st + hd.x * q.y);
      vCol = c.rgb * c.a;
    }
  } else {
    vCol = uHaze;
  }
  vW = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const BEAM_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vCol;
varying vec3 vW;
varying float vT;
varying float vEdge;
varying float vKind;
varying vec2 vUv;
void main() {
  float a;
  if (vKind < 0.5) {
    float n = 0.78 + 0.22 * sin(vW.x * 1.7 + uTime * 0.31 + vW.z * 0.9) * sin(vW.y * 2.3 - uTime * 0.47 + vW.z * 1.3);
    float e = vEdge * vEdge * (3.0 - 2.0 * vEdge);
    a = e * mix(0.62, 0.16, vT) * n * smoothstep(0.0, 0.03, vT);
  } else if (vKind < 1.5) {
    float r = 1.0 - vT;
    a = r * r * 0.5;
  } else {
    float n = 0.5 + 0.5 * sin(vW.x * 0.55 + uTime * 0.11 + sin(vW.z * 0.4 + uTime * 0.07) * 2.0) * sin(vW.y * 0.9 + vW.x * 0.3 - uTime * 0.09);
    a = n * sin(vUv.x * 3.14159) * sin(vUv.y * 3.14159);
  }
  gl_FragColor = vec4(vCol * a, 1.0);
}`;

// points: aP = (size metres, channel, kind, phase)  kind 0 halo, 1 flame (position = ring centre), 2 mote
const PT_VERT = /* glsl */ `
uniform vec3 uCh[${NCH}];
uniform float uTime;
uniform float uPx;
uniform float uFlame;
uniform vec4 uRing;
uniform vec3 uMote;
attribute vec4 aP;
varying vec3 vCol;
varying float vKind;
void main() {
  vec3 p = position;
  float size = aP.x;
  vKind = aP.z;
  if (aP.z < 0.5) {
    vCol = uCh[int(aP.y + 0.5)] * aP.w;
  } else if (aP.z < 1.5) {
    float ph = aP.w;
    float u = fract(uTime * (0.9 + 0.5 * fract(ph * 7.31)) + ph);
    float ang = ph * 6.28318 * 13.0;
    float lick = sin(uTime * 5.0 + ph * 40.0) * 0.06 * u;
    p = uRing.xyz + vec3(lick, cos(ang) * uRing.w + u * (0.34 + 0.3 * fract(ph * 3.7)), sin(ang) * uRing.w + lick);
    size = aP.x * (1.0 - u * 0.75) * uFlame;
    vec3 hot = vec3(1.0, 0.86, 0.42), mid = vec3(1.0, 0.42, 0.08), cool = vec3(0.55, 0.08, 0.02);
    vCol = (u < 0.4 ? mix(hot, mid, u / 0.4) : mix(mid, cool, (u - 0.4) / 0.6)) * (1.0 - u) * 0.6 * uFlame;
  } else {
    float ph = aP.w;
    p += vec3(sin(uTime * 0.13 + ph * 20.0), sin(uTime * 0.09 + ph * 33.0) * 0.6, cos(uTime * 0.11 + ph * 27.0)) * 0.9;
    vCol = uMote * (0.35 + 0.65 * abs(sin(uTime * 0.6 + ph * 50.0)));
  }
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(size * uPx * projectionMatrix[1][1] / max(0.1, -mv.z), 0.0, 220.0);
}`;
const PT_FRAG = /* glsl */ `
varying vec3 vCol;
varying float vKind;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = length(c);
  float a = max(0.0, 1.0 - r);
  a = a * a;
  if (vKind < 0.5) a = a * a * 0.9 + a * 0.25 + max(0.0, 1.0 - abs(c.y) * 9.0) * max(0.0, 1.0 - abs(c.x)) * 0.22;
  gl_FragColor = vec4(vCol * a, 1.0);
}`;

const WATER_VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const WATER_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uSky;
uniform vec3 uGlint;
uniform vec4 uRip[4];
varying vec3 vW;
float sdp(vec2 p) {
  vec2 q = abs(p - vec2(0.0, ${POOL_Z.toFixed(1)})) - vec2(${(POOL_HX - POOL_R).toFixed(2)}, ${(POOL_HZ - POOL_R).toFixed(2)});
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - ${POOL_R.toFixed(1)};
}
void main() {
  vec2 p = vW.xz;
  float d = sdp(p);
  if (d > 0.0) discard;
  float t = uTime;
  vec2 g = vec2(
    cos(p.x * 2.1 + t * 1.3) * 0.5 + cos(p.x * 5.3 - p.y * 3.1 + t * 2.1) * 0.28 + cos(p.x * 11.0 + p.y * 7.0 - t * 3.0) * 0.1,
    cos(p.y * 2.7 - t * 1.1) * 0.5 + cos(p.y * 6.1 + p.x * 2.3 + t * 1.7) * 0.28 + cos(p.y * 13.0 - p.x * 5.0 + t * 2.6) * 0.1);
  float ring = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 rp = uRip[i];
    float age = t - rp.z;
    vec2 dv = p - rp.xy; float r = length(dv);
    float w = rp.w * exp(-age * 1.4) * smoothstep(0.0, 0.08, age) * exp(-abs(r - age * 2.2) * 3.0);
    g += (r > 0.001 ? dv / r : vec2(0.0)) * sin((r - age * 2.2) * 14.0) * w * 2.2;
    ring += w;
  }
  vec3 n = normalize(vec3(-g.x * 0.16, 1.0, -g.y * 0.16));
  vec3 V = normalize(cameraPosition - vW);
  float fr = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 R = reflect(-V, n);
  float glint = pow(max(0.0, R.y), 6.0) * (0.5 + 0.5 * sin(R.x * 23.0 + t) * sin(R.z * 19.0 - t * 0.7));
  float spark = pow(max(0.0, sin(p.x * 9.0 + g.x * 3.0) * sin(p.y * 8.0 + g.y * 3.0)), 12.0);
  float ca = max(0.0, sin(p.x * 4.0 + g.y * 2.4 + t * 0.6) * sin(p.y * 4.4 + g.x * 2.4 - t * 0.5));
  vec3 col = uDeep * (0.55 + 0.45 * (1.0 - smoothstep(-0.9, 0.0, d))) + uGlint * ca * ca * 0.22;
  col = mix(col, uSky, clamp(fr * 0.85 + 0.06, 0.0, 1.0));
  col += uGlint * (glint * 0.5 + spark * 0.55 + ring * 0.5);
  col += uGlint * smoothstep(-0.14, 0.0, d) * 0.35;
  gl_FragColor = vec4(col, mix(0.62, 0.96, fr));
}`;

const SCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SCREEN_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uBright;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(uMap, vUv).rgb;
  float px = 0.86 + 0.14 * sin(vUv.x * 1005.3) * sin(vUv.y * 502.6);
  float sweep = max(0.0, 1.0 - abs(fract(uTime * 0.11) * 2.6 - 0.8 - vUv.x - vUv.y * 0.3) * 5.0);
  float breathe = 0.94 + 0.06 * sin(uTime * 1.3);
  c = c * px * breathe + c * sweep * 0.35;
  gl_FragColor = vec4(c * uBright, 1.0);
}`;
const BANNER_VERT = /* glsl */ `
uniform float uTime;
attribute float aSway;
varying vec2 vUv;
varying float vSh;
void main() {
  vUv = uv;
  float hang = 1.0 - uv.y;
  float w = sin(uTime * 0.9 + aSway + uv.y * 3.0) * 0.5 + sin(uTime * 1.7 + aSway * 2.0 + uv.x * 4.0 + uv.y * 5.0) * 0.25;
  vec3 p = position + normal * (w * 0.14 * hang * hang);
  vSh = 0.86 + 0.14 * cos(uTime * 1.7 + aSway * 2.0 + uv.x * 4.0 + uv.y * 5.0) * hang + 0.06 * sin(uv.x * 31.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const BANNER_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uTint;
varying vec2 vUv;
varying float vSh;
void main() { gl_FragColor = vec4(texture2D(uMap, vUv).rgb * uTint * vSh, 1.0); }`;

// ---------------------------------------------------------------------------------------------
// build-time helpers
// ---------------------------------------------------------------------------------------------
function makeBuilder(THREE) {
  const P = [], N = [], C = [];
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3(), e = new THREE.Euler(), q = new THREE.Quaternion();
  const s = new THREE.Vector3(), t = new THREE.Vector3(), v = new THREE.Vector3(), w = new THREE.Vector3(), col = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  const unitBox = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const unitPrism = new THREE.CylinderGeometry(0.7071, 0.7071, 1, 4, 1, true).rotateY(Math.PI / 4).toNonIndexed();
  function rgb(c) { if (Array.isArray(c)) return c; col.setHex(c); return [col.r, col.g, col.b]; }
  function addM(geo, c) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position, n = g.attributes.normal, k = rgb(c);
    nm.getNormalMatrix(m);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m); P.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); N.push(v.x, v.y, v.z);
      C.push(k[0], k[1], k[2]);
    }
  }
  const b = {
    rgb,
    put(geo, c, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
      e.set(rx, ry, rz); q.setFromEuler(e); m.compose(t.set(x, y, z), q, s.set(sx, sy, sz)); addM(geo, c);
    },
    box(x0, y0, z0, x1, y1, z1, c) {
      b.put(unitBox, c, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0, 0, 0, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    },
    beam(ax, ay, az, bx, by, bz, th, c) {
      w.set(bx - ax, by - ay, bz - az); const L = w.length(); if (L < 1e-5) return; w.multiplyScalar(1 / L);
      q.setFromUnitVectors(up, w); m.compose(t.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), q, s.set(th, L, th)); addM(unitPrism, c);
    },
    vtx(x, y, z, nx, ny, nz, r, g, bl) { P.push(x, y, z); N.push(nx, ny, nz); C.push(r, g, bl); },
    // flat quad a,b,c,d (counter-clockwise seen from the front)
    quad(a, bb, c, d, colr) {
      const k = rgb(colr);
      v.set(bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]); w.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); v.cross(w).normalize();
      const pts = [a, bb, c, a, c, d];
      for (let i = 0; i < 6; i++) { P.push(pts[i][0], pts[i][1], pts[i][2]); N.push(v.x, v.y, v.z); C.push(k[0], k[1], k[2]); }
    },
    // a square lattice truss from a to b
    truss(ax, ay, az, bx, by, bz, size, c) {
      const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const ux = dx / L, uy = dy / L, uz = dz / L;
      let px = 0, py = 1, pz = 0;
      if (Math.abs(uy) > 0.9) { px = 1; py = 0; }
      const qx = uy * pz - uz * py, qy = uz * px - ux * pz, qz = ux * py - uy * px;
      const h = size / 2, th = size * 0.11;
      const cx = [-h, h, h, -h], cy = [-h, -h, h, h];
      const corner = (k, d, out) => { out[0] = ax + ux * d + px * cx[k] + qx * cy[k]; out[1] = ay + uy * d + py * cx[k] + qy * cy[k]; out[2] = az + uz * d + pz * cx[k] + qz * cy[k]; };
      const A = [0, 0, 0], B = [0, 0, 0];
      for (let k = 0; k < 4; k++) { corner(k, 0, A); corner(k, L, B); b.beam(A[0], A[1], A[2], B[0], B[1], B[2], th, c); }
      const n = Math.max(1, Math.round(L / (size * 1.6))), seg = L / n;
      for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4, flip = (i + k) % 2;
        corner(flip ? k2 : k, i * seg, A); corner(flip ? k : k2, (i + 1) * seg, B);
        b.beam(A[0], A[1], A[2], B[0], B[1], B[2], th * 0.7, c);
      }
    },
    build(colorName) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(P), 3));
      g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(N), 3));
      g.setAttribute(colorName, new THREE.BufferAttribute(new Float32Array(C), 3));
      g.computeBoundingSphere();
      return g;
    },
  };
  return b;
}

function makeCanvas(w, h) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  return cv;
}
function starPath(g, cx, cy, ro, ri, n, rot) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * TAU, r = i % 2 ? ri : ro;
    if (i) g.lineTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r); else g.moveTo(cx + Math.sin(a) * r, cy - Math.cos(a) * r);
  }
  g.closePath();
}
function fitText(g, text, family, size, maxW) {
  g.font = family.replace("%", size);
  const w = g.measureText(text).width;
  if (w > maxW) { size = Math.floor(size * maxW / w); g.font = family.replace("%", size); }
  return size;
}
const FONT = "900 %px 'Arial Black', Impact, 'Segoe UI', system-ui, sans-serif";

// the show floor: deep glossy midnight lacquer with gold inlay, pale stone round the pool
function paintFloor() {
  const W = 1024, H = 640, cv = makeCanvas(W, H), g = cv.getContext("2d");
  const X = (x) => (x + STAGE_X) / (2 * STAGE_X) * W, Z = (z) => (z + STAGE_Z) / (2 * STAGE_Z) * H, M = W / (2 * STAGE_X);
  const base = g.createRadialGradient(X(0), Z(-1), 20, X(0), Z(0), W * 0.62);
  base.addColorStop(0, "#1b2148"); base.addColorStop(0.55, "#10132c"); base.addColorStop(1, "#080914");
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  // lacquered panels
  for (let x = -STAGE_X; x <= STAGE_X; x += 1.1) { g.fillStyle = "rgba(0,0,0,.3)"; g.fillRect(X(x) - 0.6, 0, 1.2, H); g.fillStyle = "rgba(120,140,255,.05)"; g.fillRect(X(x) + 0.8, 0, 1, H); }
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * W, y = Math.random() * H, l = 20 + Math.random() * 90;
    g.fillStyle = Math.random() < 0.5 ? "rgba(140,160,255,.03)" : "rgba(0,0,0,.08)"; g.fillRect(x, y, 1.2, l);
  }
  // gold emblem under the centre mark
  const cx = X(0), cz = Z(-2.5);
  g.strokeStyle = "#d9b04c"; g.lineWidth = 5; g.beginPath(); g.arc(cx, cz, 3.0 * M, 0, TAU); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(cx, cz, 3.25 * M, 0, TAU); g.stroke();
  g.beginPath(); g.arc(cx, cz, 2.2 * M, 0, TAU); g.stroke();
  const eg = g.createRadialGradient(cx, cz, 0, cx, cz, 3 * M);
  eg.addColorStop(0, "rgba(255,214,120,.55)"); eg.addColorStop(1, "rgba(160,110,30,.18)");
  g.fillStyle = eg; starPath(g, cx, cz, 2.9 * M, 1.1 * M, 8, 0); g.fill();
  g.strokeStyle = "#f3d27a"; g.lineWidth = 2.5; g.stroke();
  g.fillStyle = "#0c0e22"; g.beginPath(); g.arc(cx, cz, 0.62 * M, 0, TAU); g.fill();
  g.strokeStyle = "#f3d27a"; g.lineWidth = 3; g.stroke();
  g.fillStyle = "#f3d27a"; starPath(g, cx, cz, 0.42 * M, 0.18 * M, 5, 0); g.fill();
  // performer marks
  const mark = (x, z, r, c) => {
    g.strokeStyle = c; g.lineWidth = 3; g.beginPath(); g.arc(X(x), Z(z), r * M, 0, TAU); g.stroke();
    g.fillStyle = c; starPath(g, X(x), Z(z), r * M * 0.55, r * M * 0.24, 5, 0); g.fill();
  };
  mark(-4.5, -2.5, 0.55, "#ff6fb5"); mark(4.5, -2.5, 0.55, "#5fd4ff"); mark(0, 5.9, 0.4, "#f3d27a");
  // runway from the tunnel
  const rg = g.createLinearGradient(0, Z(-7), 0, Z(-5.2));
  rg.addColorStop(0, "rgba(243,210,122,.55)"); rg.addColorStop(1, "rgba(243,210,122,0)");
  g.fillStyle = rg; g.fillRect(X(-1.5), Z(-7), 3 * M, 1.8 * M);
  // gold edge following the thrust
  const trace = (pts) => { g.beginPath(); for (let i = 0; i < pts.length; i++) { if (i) g.lineTo(X(pts[i][0]), Z(pts[i][1])); else g.moveTo(X(pts[i][0]), Z(pts[i][1])); } g.closePath(); };
  const o = outlinePts();
  trace(o); g.strokeStyle = "#e6c060"; g.lineWidth = 16; g.stroke();
  g.save(); g.translate(X(0), Z(0)); g.scale(0.965, 0.945); g.translate(-X(0), -Z(0)); trace(o); g.strokeStyle = "rgba(230,192,96,.6)"; g.lineWidth = 2.5; g.stroke(); g.restore();
  // pool surround: pale stone coping with joints
  const pIn = poolPts(-0.05), pMid = poolPts(0.24), pOut = poolPts(0.5);
  g.lineJoin = "round";
  trace(pMid); g.strokeStyle = "#d9dde6"; g.lineWidth = 0.56 * M; g.stroke();
  trace(pOut); g.strokeStyle = "#e6c060"; g.lineWidth = 3; g.stroke();
  g.strokeStyle = "rgba(60,70,95,.55)"; g.lineWidth = 1.5;
  for (let i = 0; i < pIn.length; i += 2) { g.beginPath(); g.moveTo(X(pIn[i][0]), Z(pIn[i][1])); g.lineTo(X(pOut[i][0]), Z(pOut[i][1])); g.stroke(); }
  for (let x = -3.2; x <= 3.3; x += 0.8) for (let s = -1; s <= 1; s += 2) {
    g.beginPath(); g.moveTo(X(x), Z(POOL_Z + s * (POOL_HZ - 0.05))); g.lineTo(X(x), Z(POOL_Z + s * (POOL_HZ + 0.5))); g.stroke();
  }
  // glitter flecks in the lacquer
  for (let i = 0; i < 900; i++) {
    g.fillStyle = "rgba(" + (190 + Math.random() * 65 | 0) + "," + (190 + Math.random() * 65 | 0) + ",255," + (0.08 + Math.random() * 0.3).toFixed(2) + ")";
    g.fillRect(Math.random() * W, Math.random() * H, 1.3, 1.3);
  }
  return cv;
}

function paintScreen(cv, a, b2) {
  const W = cv.width, H = cv.height, g = cv.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#2a0f66"); bg.addColorStop(0.55, "#123a9c"); bg.addColorStop(1, "#08184a");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // sunburst
  g.save(); g.translate(W / 2, H * 0.56);
  for (let i = 0; i < 24; i++) {
    g.rotate(TAU / 24);
    g.fillStyle = i % 2 ? "rgba(255,210,90,.16)" : "rgba(120,200,255,.10)";
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-W * 0.09, -W); g.lineTo(W * 0.09, -W); g.closePath(); g.fill();
  }
  g.restore();
  const glow = g.createRadialGradient(W / 2, H * 0.52, 10, W / 2, H * 0.52, W * 0.5);
  glow.addColorStop(0, "rgba(255,255,255,.34)"); glow.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * W, y = Math.random() * H, r = 3 + Math.random() * 9;
    g.fillStyle = "rgba(255,240,190," + (0.25 + Math.random() * 0.6).toFixed(2) + ")";
    starPath(g, x, y, r, r * 0.38, 4, Math.random()); g.fill();
  }
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  const line = (text, y, size, fill) => {
    text = String(text);
    size = fitText(g, text, FONT, size, W * 0.9);
    g.shadowColor = "rgba(255,200,80,.9)"; g.shadowBlur = 34;
    g.strokeStyle = "#3a0d5c"; g.lineWidth = size * 0.16; g.strokeText(text, W / 2, y);
    g.shadowBlur = 0; g.shadowColor = "rgba(0,0,0,0)";
    g.strokeStyle = "#ffffff"; g.lineWidth = size * 0.05; g.strokeText(text, W / 2, y);
    const tg = g.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
    tg.addColorStop(0, fill[0]); tg.addColorStop(1, fill[1]);
    g.fillStyle = tg; g.fillText(text, W / 2, y);
  };
  if (a && b2) { line(a, H * 0.31, 168, ["#fff6c8", "#ffb52e"]); line(b2, H * 0.71, 200, ["#ffffff", "#7fe3ff"]); }
  else if (a || b2) line(a || b2, H * 0.5, 220, ["#fff6c8", "#ffb52e"]);
  g.strokeStyle = "rgba(0,0,0,.5)"; g.lineWidth = 18; g.strokeRect(0, 0, W, H);
}

function paintBanner() {
  const W = 256, H = 512, cv = makeCanvas(W, H), g = cv.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#c8162e"); bg.addColorStop(0.6, "#9a0f2a"); bg.addColorStop(1, "#5c0a26");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 16) { g.fillStyle = "rgba(0,0,0,.10)"; g.fillRect(x, 0, 6, H); g.fillStyle = "rgba(255,255,255,.05)"; g.fillRect(x + 9, 0, 3, H); }
  g.strokeStyle = "#f3cf6a"; g.lineWidth = 10; g.strokeRect(9, 9, W - 18, H - 18);
  g.lineWidth = 2; g.strokeRect(22, 22, W - 44, H - 44);
  g.fillStyle = "#f3cf6a"; starPath(g, W / 2, 66, 34, 14, 5, 0); g.fill();
  starPath(g, W / 2, H - 60, 24, 10, 5, 0); g.fill();
  // the two words run down the banner
  g.save(); g.translate(W / 2, H / 2 + 4); g.rotate(Math.PI / 2);
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  const word = (text, y, size, fill) => {
    fitText(g, text, FONT, size, H - 190);
    g.strokeStyle = "#3a0612"; g.lineWidth = 12; g.strokeText(text, 0, y);
    g.fillStyle = fill; g.fillText(text, 0, y);
  };
  word("PLATYPUS", -44, 78, "#ffe9a6"); word("TRICKS", 48, 86, "#ffffff");
  g.restore();
  return cv;
}

// ---------------------------------------------------------------------------------------------
// the world
// ---------------------------------------------------------------------------------------------
export function createStage(ctx) {
  const THREE = ctx.THREE, audio = ctx.audio, fx = ctx.fx;
  const group = new THREE.Group();
  group.name = "stage";

  const pt = (x, y, z, yaw) => (yaw === undefined ? { x, y, z } : { x, y, z, yaw });
  const camPt = (px, py, pz, lx, ly, lz) => ({ pos: { x: px, y: py, z: pz }, look: { x: lx, y: ly, z: lz } });
  const P = {
    tunnelStart: pt(0, 0, -12, 0), tunnelMouth: pt(0, 0, -7.5, 0), centre: pt(0, 0, -2.5, 0),
    markL: pt(-4.5, 0, -2.5, 0), markR: pt(4.5, 0, -2.5, 0), friendMark: pt(1.6, 0, -2.5, 0),
    poolEdge: pt(0, 0, 0.4, 0), poolCentre: pt(0, WATER_Y - 0.1, 3, 0),
    towerTop: pt(-8, TOWER.y, 1, Math.PI / 2), rampFoot: pt(-8, 0, -3, 0),
    podium: pt(8, POD.y, 0, 0), bow: pt(0, 0, 5.9, 0),
    cannonL: pt(-9, 0, 6), cannonR: pt(9, 0, 6),
    camWide: camPt(0, 7, 16, 0, 1, 0), camCrane: camPt(-12, 9, -4, 0, 1, -1), camLow: camPt(0, 0.6, -6.5, 0, 1.3, 2),
    camPool: camPt(6, 2.2, 7.5, 0, 0.3, 3), camHero: camPt(0, 1.2, 8.2, 0, 2.2, 3),
  };
  // axis along x (yaw = heading of the ring's axis): you pass through travelling +-x
  const hoops = [
    { x: -2.6, y: 1.3, z: 3, yaw: Math.PI / 2, r: 0.7 },
    { x: 2.6, y: 1.3, z: 3, yaw: Math.PI / 2, r: 0.7 },
    { x: 0, y: 2.3, z: 3, yaw: Math.PI / 2, r: 0.8, flaming: true },
  ];
  const seats = buildSeats();

  // fixtures: follow spots 0..3, wash beams 4..15 (world positions of the lenses)
  const src = new Float32Array(NB * 3);
  const fixtures = [
    [-5.5, TRUSS_ZF], [5.5, TRUSS_ZF], [-6, TRUSS_ZM], [6, TRUSS_ZM],
    [-8, TRUSS_ZB], [-4, TRUSS_ZB], [0, TRUSS_ZB], [4, TRUSS_ZB], [8, TRUSS_ZB],
    [-9.5, TRUSS_ZM], [-2.5, TRUSS_ZM], [2.5, TRUSS_ZM], [9.5, TRUSS_ZM],
    [-9.5, TRUSS_ZF], [0, TRUSS_ZF], [9.5, TRUSS_ZF],
  ];
  for (let i = 0; i < NB; i++) { src[i * 3] = fixtures[i][0]; src[i * 3 + 1] = TRUSS_Y - 0.62; src[i * 3 + 2] = fixtures[i][1]; }

  // ------------------------------------------------------------------ static set (one mesh)
  const S = makeBuilder(THREE), G = makeBuilder(THREE);
  const pts = []; // halo / flame / mote points: x, y, z, size, chan, kind, w
  const halo = (x, y, z, size, chan, gain) => pts.push(x, y, z, size, chan, 0, gain === undefined ? 1 : gain);
  const cyl = (r0, r1, h, seg, open) => new THREE.CylinderGeometry(r0, r1, h, seg, 1, !!open);
  const C = {
    skirt: 0x14162a, gold: 0xd8ae48, arena: 0x0b0c13, tierA: 0x171925, tierB: 0x1e2030, seat: 0x3a1622, wall: 0x0c0e22,
    far: 0x08090f, truss: 0x8b8f9a, fix: 0x14151a, red: 0xc6282e, blue: 0x2358c8, white: 0xf1eee4, conc: 0x30323a, concD: 0x1b1c22,
    iron: 0x26262b, velvet: 0x8c0f22,
  };

  // stage skirt + rim light
  const outline = outlinePts();
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    S.quad([a[0], ARENA_Y, a[1]], [a[0], -0.2, a[1]], [b[0], -0.2, b[1]], [b[0], ARENA_Y, b[1]], C.skirt);
    S.quad([a[0], -0.2, a[1]], [a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], -0.2, b[1]], C.gold);
    const k = 1.004;
    G.quad([a[0] * k, -0.17, a[1] * k], [a[0] * k, -0.07, a[1] * k], [b[0] * k, -0.07, b[1] * k], [b[0] * k, -0.17, b[1] * k], [CH.rim, 1, 0]);
  }

  // pool basin: mosaic tiles, one flat-coloured quad per tile
  {
    const bed = (x, z) => {
      const d = sdPool(x, z);
      if (d >= 0) return -0.02 - d * 0.6;
      let k = -d / 0.6; if (k > 1) k = 1;
      return -POOL_DEPTH * k * k * (3 - 2 * k);
    };
    const tiles = [0x2a9fd0, 0x1f86c2, 0x53c3e6, 0x2a9fd0, 0xdff3ff, 0x1668a8, 0x38b2dc];
    const cell = 0.18, e = 0.03, tc = new THREE.Color(), n = new THREE.Vector3();
    const push = (x, z, r, g, b) => {
      n.set(-(bed(x + e, z) - bed(x - e, z)) / (2 * e), 1, -(bed(x, z + e) - bed(x, z - e)) / (2 * e)).normalize();
      S.vtx(x, bed(x, z), z, n.x, n.y, n.z, r, g, b);
    };
    const nx = Math.round(2 * POOL_HX / cell), nz = Math.round(2 * POOL_HZ / cell);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x0 = -POOL_HX + i * cell, x1 = x0 + cell, z0 = POOL_Z - POOL_HZ + j * cell, z1 = z0 + cell;
      if (Math.min(sdPool(x0, z0), sdPool(x1, z0), sdPool(x0, z1), sdPool(x1, z1)) > 0) continue;
      const hsh = Math.abs(Math.sin(i * 127.1 + j * 311.7) * 43758.5453) % 1;
      const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2, dm = sdPool(xm, zm);
      let hex = tiles[(hsh * tiles.length) | 0];
      if (dm < -0.7 && (Math.abs(Math.abs(xm) - 2.25) < 0.1 || Math.abs(zm - POOL_Z) < 0.1)) hex = 0x123c7a;  // lane lines
      if (dm > -0.22) hex = hsh > 0.5 ? 0xe6c060 : 0xdff3ff;                                                  // gold / white lip
      tc.setHex(hex);
      const sh = 0.72 + 0.28 * hsh - Math.min(0.3, Math.max(0, -bed(xm, zm)) * 0.14);
      const r = tc.r * sh, g = tc.g * sh, b = tc.b * sh;
      push(x0, z0, r, g, b); push(x0, z1, r, g, b); push(x1, z1, r, g, b);
      push(x0, z0, r, g, b); push(x1, z1, r, g, b); push(x1, z0, r, g, b);
    }
    // waterline light strip
    const pr = poolPts(-0.012);
    for (let i = 0; i < pr.length; i++) {
      const a = pr[i], b = pr[(i + 1) % pr.length];
      G.quad([a[0], -0.05, a[1]], [a[0], 0.0, a[1]], [b[0], 0.0, b[1]], [b[0], -0.05, b[1]], [CH.pool, 1, 0]);
    }
  }

  // arena floor, barrier, tiers, outer walls
  S.put(new THREE.PlaneGeometry(46, 30), C.arena, 0, ARENA_Y, 5, -Math.PI / 2);
  S.box(-13.4, ARENA_Y, 8.92, 13.4, 0.12, 9.04, C.skirt);
  S.box(-13.4, 0.12, 8.9, 13.4, 0.2, 9.06, C.gold);
  for (let s = -1; s <= 1; s += 2) { S.box(s * 13.5, ARENA_Y, -6.2, s * 13.62, 0.12, 8.3, C.skirt); S.box(s * 13.48, 0.12, -6.2, s * 13.64, 0.2, 8.3, C.gold); }
  for (let r = 0; r < 9; r++) {
    const z0 = 9.3 + 0.85 * r, y = -0.35 + 0.42 * r;
    S.box(-13.4, ARENA_Y, z0, 13.4, y, z0 + 0.85, r % 2 ? C.tierA : C.tierB);
    S.box(-13.4, y, z0 + 0.77, 13.4, y + 0.5, z0 + 0.85, C.seat);
    for (let s = -1; s <= 1; s += 2) G.box(s * 4.5 - 0.3, y - 0.05, z0 - 0.012, s * 4.5 + 0.3, y - 0.02, z0, [CH.house, 0.55, 0]);
  }
  for (let s = -1; s <= 1; s += 2) for (let r = 0; r < 7; r++) {
    const x0 = s * (13.9 + 0.85 * r), x1 = s * (13.9 + 0.85 * (r + 1)), y = -0.35 + 0.42 * r;
    S.box(x0, ARENA_Y, -6.2, x1, y, 8.3, r % 2 ? C.tierA : C.tierB);
    S.box(s * (13.9 + 0.85 * r + 0.77), y, -6.2, x1, y + 0.5, 8.3, C.seat);
    G.box(x0 - s * 0.012, y - 0.05, 0.75, x0, y - 0.02, 1.25, [CH.house, 0.55, 0]);
  }
  for (let s = -1; s <= 1; s += 2) {
    S.box(s * 13.4, ARENA_Y, 8.3, s * 20.2, 2.7, 17.2, C.concD);               // corner blocks (vomitories)
    G.box(s * 13.39, 1.55, 11.2, s * 13.37, 1.8, 12.0, [CH.trim, 1, 0]);        // exit signs
    S.box(s * 13.39, 0, 11.3, s * 13.37, 1.45, 11.9, 0x05060a);
    S.put(new THREE.PlaneGeometry(26, 13), C.far, s * 20.2, 5.5, 5, 0, -s * Math.PI / 2);
  }
  S.put(new THREE.PlaneGeometry(42, 13), C.far, 0, 5.5, 17.2, 0, Math.PI);
  for (let i = 0; i < 10; i++) halo(-18 + i * 4, 10.4, 16.9, 1.3, CH.house, 0.8);
  for (let s = -1; s <= 1; s += 2) for (let i = 0; i < 5; i++) halo(s * 19.9, 10.4, -4 + i * 4.5, 1.3, CH.house, 0.8);

  // back wall with the tunnel mouth, curtains, portal
  S.put(new THREE.PlaneGeometry(18.6, 12), C.wall, -10.9, 5.1, -7.03);
  S.put(new THREE.PlaneGeometry(18.6, 12), C.wall, 10.9, 5.1, -7.03);
  S.put(new THREE.PlaneGeometry(3.2, 8.5), C.wall, 0, TUN_H + 4.25, -7.03);
  for (let i = 0; i < 70; i++) {  // little star studs on the backdrop
    const x = (Math.random() * 2 - 1) * 12.4, y = 0.6 + Math.random() * 8.4;
    if (Math.abs(x) < 5 && y > 3.2 && y < 8.2) continue;
    if (Math.abs(x) < 7.4 && y < 8.6) continue;
    S.put(new THREE.CircleGeometry(0.035 + Math.random() * 0.05, 4), C.gold, x, y, -7.0, 0, 0, Math.random() * 3);
  }
  const curtain = (xa, xb, y0, y1, z) => {
    const base = S.rgb(C.velvet), step = 0.13, n = Math.round((xb - xa) / step);
    const zf = (x) => z + 0.08 * (Math.sin(x * 8.5) + 0.35 * Math.sin(x * 19 + 1));
    const col = (x, top) => { const sh = (0.42 + 0.58 * (0.5 + 0.5 * Math.sin(x * 8.5))) * (top ? 0.55 : 1); return [base[0] * sh, base[1] * sh, base[2] * sh]; };
    const v = (x, y, top) => {
      const dz = (zf(x + 0.01) - zf(x - 0.01)) / 0.02, l = Math.sqrt(1 + dz * dz), c = col(x, top);
      S.vtx(x, y, zf(x), -dz / l, 0, 1 / l, c[0], c[1], c[2]);
    };
    for (let i = 0; i < n; i++) {
      const x0 = xa + (xb - xa) * (i / n), x1 = xa + (xb - xa) * ((i + 1) / n);
      v(x0, y0, 0); v(x1, y0, 0); v(x1, y1, 1); v(x0, y0, 0); v(x1, y1, 1); v(x0, y1, 1);
    }
  };
  // low swags either side of the portal (they stop under the big screen), tall drapes flanking the screen
  curtain(-7.2, -2.0, 0, 3.3, -6.88); curtain(2.0, 7.2, 0, 3.3, -6.88);
  curtain(-7.2, -4.8, 3.44, 8.3, -6.88); curtain(4.8, 7.2, 3.44, 8.3, -6.88);
  S.box(-7.3, 3.24, -7.0, -2.02, 3.44, -6.72, C.gold); S.box(2.02, 3.24, -7.0, 7.3, 3.44, -6.72, C.gold);   // pelmet
  S.box(-7.3, 8.26, -7.0, 7.3, 8.5, -6.72, C.gold);                                        // valance over the screen
  S.box(-2.02, 0, -7.02, -TUN_HW, 3.0, -6.74, C.gold); S.box(TUN_HW, 0, -7.02, 2.02, 3.0, -6.74, C.gold);
  S.box(-2.02, TUN_H, -7.02, 2.02, 3.0, -6.74, C.gold);
  for (let i = 0; i < 9; i++) { const y = 0.2 + i * 0.33; halo(-1.81, y, -6.7, 0.2, CH.marquee, 1); halo(1.81, y, -6.7, 0.2, CH.marquee, 1); G.box(-1.85, y - 0.04, -6.74, -1.77, y + 0.04, -6.73, [CH.marquee, 1, 0]); G.box(1.77, y - 0.04, -6.74, 1.85, y + 0.04, -6.73, [CH.marquee, 1, 0]); }
  for (let i = 0; i < 11; i++) { const x = -1.6 + i * 0.32; halo(x, 2.8, -6.7, 0.2, CH.marquee, 1); G.box(x - 0.04, 2.76, -6.74, x + 0.04, 2.84, -6.73, [CH.marquee, 1, 0]); }

  // tunnel (inward-facing planes only, so a camera outside sees through)
  {
    const len = -STAGE_Z - TUN_END, zc = (TUN_END - STAGE_Z) / 2;
    S.put(new THREE.PlaneGeometry(len, TUN_H), C.conc, TUN_HW, TUN_H / 2, zc, 0, -Math.PI / 2);
    S.put(new THREE.PlaneGeometry(len, TUN_H), C.conc, -TUN_HW, TUN_H / 2, zc, 0, Math.PI / 2);
    S.put(new THREE.PlaneGeometry(TUN_HW * 2, len), C.concD, 0, TUN_H, zc, Math.PI / 2);
    S.put(new THREE.PlaneGeometry(TUN_HW * 2, len), 0x23252c, 0, 0, zc, -Math.PI / 2);
    S.put(new THREE.PlaneGeometry(TUN_HW * 2, TUN_H), C.concD, 0, TUN_H / 2, TUN_END);
    S.box(-0.75, 0, TUN_END, 0.75, 2.1, TUN_END + 0.06, 0x3a2c22);                      // stage door
    S.box(0.5, 1.0, TUN_END + 0.06, 0.58, 1.1, TUN_END + 0.12, C.gold);
    for (let s = -1; s <= 1; s += 2) {
      S.box(s * 1.2, 0.002, TUN_END, s * 1.28, 0.012, -STAGE_Z, 0xd8b030);            // floor lines
      S.box(s * (TUN_HW - 0.03), 0.9, TUN_END, s * TUN_HW, 1.0, -STAGE_Z, 0x5a5d68);    // wall rail
      S.box(s * (TUN_HW - 0.5), 0, -9.6, s * (TUN_HW - 0.02), 0.62, -8.7, 0x1c1d24);    // flight cases
      S.box(s * (TUN_HW - 0.45), 0.62, -9.5, s * (TUN_HW - 0.04), 1.05, -8.9, 0x2a2c36);
    }
    for (let i = 0; i < 4; i++) {
      const z = -8.4 - i * 2.1;
      G.box(-0.5, TUN_H - 0.05, z - 0.09, 0.5, TUN_H - 0.01, z + 0.09, [CH.tunnel, 1, 0]);
      halo(0, TUN_H - 0.12, z, 1.1, CH.tunnel, 0.5);
    }
    G.box(-0.4, 2.2, TUN_END + 0.02, 0.4, 2.42, TUN_END + 0.05, [CH.trim, 1, 0]);
  }

  // screen frame
  S.box(-4.72, 3.48, -7.0, 4.72, 8.02, -6.88, 0x1a1c28);
  G.box(-4.62, 3.58, -6.88, 4.62, 3.63, -6.86, [CH.marquee, 0.7, 0]); G.box(-4.62, 7.87, -6.88, 4.62, 7.92, -6.86, [CH.marquee, 0.7, 0]);
  G.box(-4.62, 3.58, -6.88, -4.57, 7.92, -6.86, [CH.marquee, 0.7, 0]); G.box(4.57, 3.58, -6.88, 4.62, 7.92, -6.86, [CH.marquee, 0.7, 0]);

  // truss rig
  const TS = 0.5;
  S.truss(-TRUSS_X, TRUSS_Y, TRUSS_ZB, TRUSS_X, TRUSS_Y, TRUSS_ZB, TS, C.truss);
  S.truss(-TRUSS_X, TRUSS_Y, TRUSS_ZM, TRUSS_X, TRUSS_Y, TRUSS_ZM, TS, C.truss);
  S.truss(-TRUSS_X, TRUSS_Y, TRUSS_ZF, TRUSS_X, TRUSS_Y, TRUSS_ZF, TS, C.truss);
  S.truss(-TRUSS_X, TRUSS_Y + 1.1, -2, TRUSS_X, TRUSS_Y + 1.1, -2, TS * 0.8, 0x6d717c);      // upper layer
  S.truss(-TRUSS_X, TRUSS_Y + 1.1, 4.6, TRUSS_X, TRUSS_Y + 1.1, 4.6, TS * 0.8, 0x6d717c);
  for (let s = -1; s <= 1; s += 2) {
    S.truss(s * TRUSS_X, TRUSS_Y, TRUSS_ZB, s * TRUSS_X, TRUSS_Y, TRUSS_ZF, TS, C.truss);
    S.truss(s * TRUSS_X, ARENA_Y, TRUSS_ZB, s * TRUSS_X, TRUSS_Y + 1.35, TRUSS_ZB, TS, C.truss);
    S.truss(s * TRUSS_X, ARENA_Y, TRUSS_ZF, s * TRUSS_X, TRUSS_Y + 1.35, TRUSS_ZF, TS, C.truss);
    S.box(s * TRUSS_X - 0.5, ARENA_Y, TRUSS_ZF - 0.5, s * TRUSS_X + 0.5, ARENA_Y + 0.12, TRUSS_ZF + 0.5, C.fix);
    S.truss(s * 4.2, TRUSS_Y, TRUSS_ZB, s * 4.2, TRUSS_Y + 1.1, -2, TS * 0.6, 0x6d717c);     // diagonal ties
    S.truss(s * 4.2, TRUSS_Y, TRUSS_ZF, s * 4.2, TRUSS_Y + 1.1, 4.6, TS * 0.6, 0x6d717c);
    // line-array speakers
    for (let i = 0; i < 6; i++) {
      const a = i * 0.09;
      S.put(new THREE.BoxGeometry(1.1, 0.34, 0.6), 0x101116, s * 10.8, TRUSS_Y - 0.75 - i * 0.37, TRUSS_ZF - 0.5 - i * i * 0.022, -a, 0, 0);
      S.put(new THREE.PlaneGeometry(0.98, 0.24), 0x2a2c34, s * 10.8, TRUSS_Y - 0.75 - i * 0.37, TRUSS_ZF - 0.5 - i * i * 0.022 + 0.31, -a, 0, 0);
    }
    S.beam(s * 10.8, TRUSS_Y - 0.3, TRUSS_ZF - 0.3, s * 10.8, TRUSS_Y - 0.6, TRUSS_ZF - 0.5, 0.04, C.fix);
  }
  S.beam(-TRUSS_X, TRUSS_Y, POOL_Z, TRUSS_X, TRUSS_Y, POOL_Z, 0.07, 0x4a4d57);              // fly bar over the pool
  // fixtures
  for (let i = 0; i < NB; i++) {
    const x = src[i * 3], y = src[i * 3 + 1], z = src[i * 3 + 2];
    S.box(x - 0.04, y + 0.2, z - 0.04, x + 0.04, TRUSS_Y - 0.22, z + 0.04, C.fix);
    if (i < 4) {
      S.put(new THREE.SphereGeometry(0.27, 12, 8), C.fix, x, y + 0.05, z);
      S.box(x - 0.34, y - 0.05, z - 0.06, x - 0.28, y + 0.3, z + 0.06, 0x2a2c34); S.box(x + 0.28, y - 0.05, z - 0.06, x + 0.34, y + 0.3, z + 0.06, 0x2a2c34);
      S.box(x - 0.34, y + 0.24, z - 0.06, x + 0.34, y + 0.3, z + 0.06, 0x2a2c34);
      G.put(new THREE.SphereGeometry(0.15, 10, 6), [CH.spot0 + i, 1, 0], x, y - 0.14, z);
      halo(x, y - 0.16, z, 1.5, CH.spot0 + i, 1);
    } else {
      const ch = i % 2 ? CH.washB : CH.washA;
      S.put(cyl(0.15, 0.19, 0.34, 10), C.fix, x, y + 0.06, z);
      G.put(new THREE.CircleGeometry(0.17, 10), [ch, 1, 0], x, y - 0.115, z, Math.PI / 2);
      halo(x, y - 0.14, z, 1.0, ch, 0.9);
    }
  }
  // static eye-candy pars along the upper trusses (lens + halo only: no beams)
  for (let i = 0; i < 9; i++) for (let k = 0; k < 2; k++) {
    const x = -10 + i * 2.5, z = k ? 4.6 : -2, ch = (i + k) % 2 ? CH.washA : CH.washB;
    S.put(cyl(0.1, 0.13, 0.24, 8), C.fix, x, TRUSS_Y + 0.72, z);
    G.put(new THREE.CircleGeometry(0.115, 8), [ch, 0.8, 0], x, TRUSS_Y + 0.595, z, Math.PI / 2);
    halo(x, TRUSS_Y + 0.58, z, 0.55, ch, 0.7);
  }

  // jump tower + ramp
  {
    const T = TOWER, xm = (T.rx0 + T.rx1) / 2;
    S.box(T.x0, T.y - 0.12, T.z0, T.x1, T.y, T.z1, C.red);
    S.box(T.x0 - 0.03, T.y - 0.2, T.z0 - 0.03, T.x1 + 0.03, T.y - 0.12, T.z1 + 0.03, C.gold);
    const lx = [T.x0 + 0.1, T.x1 - 0.1], lz = [T.z0 + 0.1, T.z1 - 0.1];
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) S.beam(lx[a], 0, lz[b], lx[a], T.y - 0.2, lz[b], 0.12, C.blue);
    for (let a = 0; a < 2; a++) {
      S.beam(lx[a], 0.1, lz[0], lx[a], T.y - 0.3, lz[1], 0.05, C.gold); S.beam(lx[a], T.y - 0.3, lz[0], lx[a], 0.1, lz[1], 0.05, C.gold);
      S.beam(lx[0], 0.1, lz[a], lx[1], T.y - 0.3, lz[a], 0.05, C.gold); S.beam(lx[1], 0.1, lz[a], lx[0], T.y - 0.3, lz[a], 0.05, C.gold);
    }
    // west and back rails (the east side is the launch edge)
    S.beam(T.x0 + 0.05, T.y + 0.55, T.z0, T.x0 + 0.05, T.y + 0.55, T.z1, 0.05, C.gold);
    for (let i = 0; i < 4; i++) S.beam(T.x0 + 0.05, T.y, T.z0 + 0.05 + i * 0.7, T.x0 + 0.05, T.y + 0.55, T.z0 + 0.05 + i * 0.7, 0.04, C.white);
    S.beam(T.x0, T.y + 0.55, T.z1 - 0.05, T.x1, T.y + 0.55, T.z1 - 0.05, 0.05, C.gold);
    for (let i = 0; i < 4; i++) S.beam(T.x0 + 0.05 + i * 0.7, T.y, T.z1 - 0.05, T.x0 + 0.05 + i * 0.7, T.y + 0.55, T.z1 - 0.05, 0.04, C.white);
    G.box(T.x1 + 0.03, T.y - 0.19, T.z0, T.x1 + 0.045, T.y - 0.13, T.z1, [CH.trim, 1, 0]);
    // striped ramp
    const run = T.z0 - T.rz0, ang = Math.atan2(T.y, run), L = Math.sqrt(run * run + T.y * T.y), n = 8, box = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      S.put(box, i % 2 ? C.white : C.red, xm, f * T.y - 0.04 * Math.cos(ang), T.rz0 + f * run + 0.04 * Math.sin(ang), -ang, 0, 0, T.rx1 - T.rx0, 0.08, L / n);
    }
    for (let s = 0; s < 2; s++) {
      const x = s ? T.rx1 : T.rx0;
      S.beam(x, 0.42, T.rz0, x, T.y + 0.42, T.z0, 0.05, C.gold);
      S.beam(x, 0, T.rz0, x, 0.42, T.rz0, 0.05, C.blue);
      S.beam(x, T.y * 0.5 - 0.06, T.rz0 + run * 0.5, x, T.y * 0.5 + 0.42, T.rz0 + run * 0.5, 0.04, C.blue);
      S.beam(x, 0, T.rz0 + run * 0.5, x, T.y * 0.5 - 0.06, T.rz0 + run * 0.5, 0.07, C.blue);
      S.quad([x, 0, T.rz0], [x, 0, T.z0], [x, T.y - 0.12, T.z0], [x, 0, T.rz0], s ? C.blue : C.blue);
      S.quad([x, 0, T.rz0], [x, T.y - 0.12, T.z0], [x, 0, T.z0], [x, 0, T.rz0], C.blue);
    }
  }
  // podium (drum + step)
  S.put(cyl(POD.r2, POD.r2 + 0.04, POD.y2, 28), C.red, POD.x, POD.y2 / 2, POD.z);
  S.put(cyl(POD.r, POD.r + 0.04, POD.y - POD.y2, 28), C.blue, POD.x, (POD.y + POD.y2) / 2, POD.z);
  S.put(new THREE.TorusGeometry(POD.r, 0.035, 6, 28), C.gold, POD.x, POD.y - 0.02, POD.z, Math.PI / 2);
  S.put(new THREE.TorusGeometry(POD.r2, 0.035, 6, 28), C.gold, POD.x, POD.y2 - 0.02, POD.z, Math.PI / 2);
  S.put(new THREE.CircleGeometry(0.62, 5), C.gold, POD.x, POD.y + 0.012, POD.z, -Math.PI / 2);
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; S.put(new THREE.CircleGeometry(0.13, 4), C.gold, POD.x + Math.sin(a) * (POD.r + 0.03), 0.6, POD.z + Math.cos(a) * (POD.r + 0.03), 0, a, 0); }
  // confetti cannons
  for (let s = -1; s <= 1; s += 2) {
    S.box(s * 9 - 0.26, 0, 5.74, s * 9 + 0.26, 0.22, 6.26, C.fix);
    S.put(cyl(0.2, 0.15, 0.85, 12, true), C.red, s * 9 - s * 0.14, 0.58, 5.9, -0.25, 0, s * 0.42);
    S.put(new THREE.TorusGeometry(0.2, 0.03, 6, 14), C.gold, s * 9 - s * 0.31, 0.95, 5.8, Math.PI / 2 - 0.25, 0, s * 0.42);
  }
  // hoops, hung from the fly bar
  for (let i = 0; i < hoops.length; i++) {
    const h = hoops[i];
    if (h.flaming) {
      S.put(new THREE.TorusGeometry(h.r + 0.06, 0.06, 8, 40), C.iron, h.x, h.y, h.z, 0, Math.PI / 2);
      G.put(new THREE.TorusGeometry(h.r + 0.06, 0.068, 6, 40), [CH.fire, 1, 0], h.x, h.y, h.z, 0, Math.PI / 2);
    } else {
      G.put(new THREE.TorusGeometry(h.r + 0.055, 0.055, 8, 40), [CH.hoop, 1, 0], h.x, h.y, h.z, 0, Math.PI / 2);
      S.put(new THREE.TorusGeometry(h.r + 0.055, 0.02, 5, 40), C.white, h.x - 0.06, h.y, h.z, 0, Math.PI / 2);
      halo(h.x, h.y, h.z, 2.4, CH.hoop, 0.22);
    }
    const top = h.y + h.r + 0.1;
    S.beam(h.x, top, h.z - 0.25, h.x, TRUSS_Y, h.z - 0.02, 0.014, 0x9a9da8);
    S.beam(h.x, top, h.z + 0.25, h.x, TRUSS_Y, h.z + 0.02, 0.014, 0x9a9da8);
  }
  halo(hoops[2].x, hoops[2].y, hoops[2].z, 3.4, CH.fire, 0.3);

  const setMesh = new THREE.Mesh(S.build("color"), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0.08 }));
  setMesh.name = "stage-set"; setMesh.receiveShadow = true; setMesh.frustumCulled = false;
  group.add(setMesh);

  // ------------------------------------------------------------------ the show floor
  {
    const sh = new THREE.Shape(), hole = new THREE.Path(), pp = poolPts(0);
    for (let i = 0; i < outline.length; i++) { if (i) sh.lineTo(outline[i][0], -outline[i][1]); else sh.moveTo(outline[i][0], -outline[i][1]); }
    sh.closePath();
    for (let i = 0; i < pp.length; i++) { if (i) hole.lineTo(pp[i][0], -pp[i][1]); else hole.moveTo(pp[i][0], -pp[i][1]); }
    hole.closePath();
    sh.holes.push(hole);
    const geo = new THREE.ShapeGeometry(sh, 1).rotateX(-Math.PI / 2);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + STAGE_X) / (2 * STAGE_X), 1 - (p.getZ(i) + STAGE_Z) / (2 * STAGE_Z));
    const tex = new THREE.CanvasTexture(paintFloor());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(4, ctx.renderer.capabilities.getMaxAnisotropy());
    const floor = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0.12 }));
    floor.name = "stage-floor"; floor.receiveShadow = true;
    group.add(floor);
  }

  // ------------------------------------------------------------------ glow (emissive, colour by channel)
  const uTime = { value: 0 };
  const chU = new Float32Array(NCH * 3);
  const uCh = { value: chU };
  const glow = new THREE.Mesh(G.build("aCh"), new THREE.ShaderMaterial({
    uniforms: { uCh }, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, side: THREE.DoubleSide, fog: false,
  }));
  glow.name = "stage-glow"; glow.frustumCulled = false;
  group.add(glow);

  // ------------------------------------------------------------------ water
  const ripU = new Float32Array(16);
  for (let i = 0; i < 4; i++) ripU[i * 4 + 2] = -100;
  const wU = { uTime, uDeep: { value: new THREE.Vector3() }, uSky: { value: new THREE.Vector3() }, uGlint: { value: new THREE.Vector3() }, uRip: { value: ripU } };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(POOL_HX * 2, POOL_HZ * 2).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: wU, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false, fog: false,
  }));
  water.position.set(0, WATER_Y, POOL_Z);
  water.name = "stage-water"; water.renderOrder = 1;
  group.add(water);

  // ------------------------------------------------------------------ big screen + banners
  const screenCv = makeCanvas(1024, 512);
  const screenTex = new THREE.CanvasTexture(screenCv);
  const screenU = { uMap: { value: screenTex }, uTime, uBright: { value: 1 } };
  const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 4.3), new THREE.ShaderMaterial({ uniforms: screenU, vertexShader: SCREEN_VERT, fragmentShader: SCREEN_FRAG, fog: false }));
  screenMesh.position.set(0, 5.75, -6.87);
  screenMesh.name = "stage-screen";
  group.add(screenMesh);
  const screen = {
    mesh: screenMesh, a: null, b: null,
    setText(a, b) {
      a = a == null ? "" : String(a); b = b == null ? "" : String(b);
      if (a === screen.a && b === screen.b) return;
      screen.a = a; screen.b = b;
      paintScreen(screenCv, a, b);
      screenTex.needsUpdate = true;
    },
  };
  screen.setText("PLATYPUS", "TRICKS");

  const bannerU = { uMap: { value: new THREE.CanvasTexture(paintBanner()) }, uTime, uTint: { value: new THREE.Vector3(1, 1, 1) } };
  {
    const bp = [], bn = [], bu = [], bs = [], bi = [];
    const banner = (cx, top, cz, w, h, nx, nz, phase) => {
      const tx = nz, tz = -nx, NU = 4, NV = 8, base = bp.length / 3;
      for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
        const u = i / NU, v = j / NV;
        let y = top - h * (1 - v);
        if (j === 0) y -= (1 - Math.abs(2 * u - 1)) * 0.5;          // swallow-tail point
        bp.push(cx + tx * (u - 0.5) * w, y, cz + tz * (u - 0.5) * w); bn.push(nx, 0, nz); bu.push(u, v); bs.push(phase);
      }
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
        const a = base + j * (NU + 1) + i, b = a + 1, c = a + NU + 2, d = a + NU + 1;
        bi.push(a, b, c, a, c, d);
      }
    };
    banner(-8.5, 8.3, -6.8, 2.3, 5.4, 0, 1, 0.0); banner(8.5, 8.3, -6.8, 2.3, 5.4, 0, 1, 1.9);
    for (let s = -1; s <= 1; s += 2) { banner(s * (TRUSS_X - 0.3), 8.5, -2.4, 1.7, 3.7, -s, 0, 3.1 + s); banner(s * (TRUSS_X - 0.3), 8.5, 4.6, 1.7, 3.7, -s, 0, 5.2 + s); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bp), 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(bn), 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(bu), 2));
    geo.setAttribute("aSway", new THREE.BufferAttribute(new Float32Array(bs), 1));
    geo.setIndex(bi);
    const banners = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: bannerU, vertexShader: BANNER_VERT, fragmentShader: BANNER_FRAG, side: THREE.DoubleSide, fog: false }));
    banners.name = "stage-banners"; banners.frustumCulled = false;
    group.add(banners);
  }

  // ------------------------------------------------------------------ beams + floor pools + haze (one additive mesh)
  const dstU = new Float32Array(NB * 3), colU = new Float32Array(NB * 4), radU = new Float32Array(NB);
  const hazeU = new THREE.Vector3();
  {
    const SEG = 18, bp = [], ab = [], bi = [];
    for (let i = 0; i < NB; i++) {
      let base = bp.length / 3;
      for (let s = 0; s <= SEG; s++) { const a = (s / SEG) * TAU; bp.push(0, 0, 0, 0, 0, 0); ab.push(a, 0, i, 0, a, 1, i, 0); }
      for (let s = 0; s < SEG; s++) { const a = base + s * 2; bi.push(a, a + 1, a + 3, a, a + 3, a + 2); }
      base = bp.length / 3;
      bp.push(0, 0, 0); ab.push(0, 0, i, 1);
      for (let s = 0; s <= SEG; s++) { bp.push(0, 0, 0); ab.push((s / SEG) * TAU, 1, i, 1); }
      for (let s = 0; s < SEG; s++) bi.push(base, base + 1 + s, base + 2 + s);
    }
    const card = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) => {
      const base = bp.length / 3;
      bp.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
      ab.push(0, 0, 0, 3, 1, 0, 0, 3, 1, 1, 0, 3, 0, 1, 0, 3);
      bi.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    card(-16, 5.6, -7, 16, 5.6, -7, 16, 5.6, 12, -16, 5.6, 12);
    card(-16, -0.5, -1.5, 16, -0.5, -1.5, 16, 10, -1.5, -16, 10, -1.5);
    card(-16, -0.5, 5.5, 16, -0.5, 5.5, 16, 10, 5.5, -16, 10, 5.5);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bp), 3));
    geo.setAttribute("aB", new THREE.BufferAttribute(new Float32Array(ab), 4));
    geo.setIndex(bi);
    const beams = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uSrc: { value: src }, uDst: { value: dstU }, uCol: { value: colU }, uRad: { value: radU }, uHaze: { value: hazeU }, uTime },
      vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    }));
    beams.name = "stage-beams"; beams.frustumCulled = false; beams.renderOrder = 3;
    group.add(beams);
  }

  // ------------------------------------------------------------------ halos, flames, motes (one additive Points)
  const ringU = new THREE.Vector4(hoops[2].x, hoops[2].y, hoops[2].z, hoops[2].r + 0.06);
  const moteU = new THREE.Vector3();
  const ptU = { uCh, uTime, uPx: { value: 360 }, uFlame: { value: 0 }, uRing: { value: ringU }, uMote: { value: moteU } };
  {
    for (let i = 0; i < 84; i++) pts.push(hoops[2].x, hoops[2].y, hoops[2].z, 0.34 + Math.random() * 0.3, 0, 1, (i + Math.random()) / 84);
    for (let i = 0; i < 120; i++) pts.push((Math.random() * 2 - 1) * 11, 0.5 + Math.random() * 7, -6 + Math.random() * 14, 0.03 + Math.random() * 0.035, 0, 2, Math.random());
    const n = pts.length / 7, pp = new Float32Array(n * 3), ap = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      pp[i * 3] = pts[i * 7]; pp[i * 3 + 1] = pts[i * 7 + 1]; pp[i * 3 + 2] = pts[i * 7 + 2];
      ap[i * 4] = pts[i * 7 + 3]; ap[i * 4 + 1] = pts[i * 7 + 4]; ap[i * 4 + 2] = pts[i * 7 + 5]; ap[i * 4 + 3] = pts[i * 7 + 6];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pp, 3));
    geo.setAttribute("aP", new THREE.BufferAttribute(ap, 4));
    const points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: ptU, vertexShader: PT_VERT, fragmentShader: PT_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    points.name = "stage-points"; points.frustumCulled = false; points.renderOrder = 4;
    group.add(points);
  }

  // ------------------------------------------------------------------ the two real lights (never added / removed)
  const key = new THREE.PointLight(0xffffff, 0, 0, 2), fill = new THREE.PointLight(0xffffff, 0, 0, 2);
  key.position.set(0, 6, -1); fill.position.set(0, 5, 4);
  group.add(key, fill);

  // ------------------------------------------------------------------ cues
  const O = { ch: 0, spot: NCH * 3, wash: NCH * 3 + 16, haze: NCH * 3 + 20, key: NCH * 3 + 23, fill: NCH * 3 + 27, scr: NCH * 3 + 31, water: NCH * 3 + 33 };
  const NS = NCH * 3 + 42;
  const putC = (v, o, hex, gain) => { v[o] = ((hex >> 16) & 255) / 255 * gain; v[o + 1] = ((hex >> 8) & 255) / 255 * gain; v[o + 2] = (hex & 255) / 255 * gain; };
  const BG = 0x04050a;
  const mkEnv = (fog, hemiSky, hemiGround, hemiI, sunC, sunI) => ({ background: BG, fog: [fog, 20, 70], hemi: [hemiSky, hemiGround, hemiI], sun: [sunC, sunI], sunDir: [0.12, 0.93, 0.36], far: 90, dark: true });
  function mkCue(o) {
    const v = new Float32Array(NS);
    const ch = (name, p) => { if (p) putC(v, CH[name] * 3, p[0], p[1]); };
    ch("rim", o.rim); ch("pool", o.pool); ch("washA", o.washA); ch("washB", o.washB); ch("house", o.house); ch("tunnel", o.tunnel);
    ch("hoop", o.hoop); ch("marquee", o.marquee);
    for (let i = 0; i < 4; i++) { const s = o.spots[i]; putC(v, O.spot + i * 4, s[0], 1); v[O.spot + i * 4 + 3] = s[1]; }
    v[O.wash] = o.wash[0]; v[O.wash + 1] = o.wash[1]; v[O.wash + 2] = o.wash[2]; v[O.wash + 3] = o.wash[3];
    putC(v, O.haze, o.haze[0], o.haze[1]);
    putC(v, O.key, o.key[0], 1); v[O.key + 3] = o.key[1];
    putC(v, O.fill, o.fill[0], 1); v[O.fill + 3] = o.fill[1];
    v[O.scr] = o.screen; v[O.scr + 1] = o.banner;
    putC(v, O.water, o.water[0], 1); putC(v, O.water + 3, o.water[1], 1); putC(v, O.water + 6, o.water[2], 1);
    return { v, spotT: o.spots.map((s) => [s[2], s[3]]), sweep: o.sweep, keyAt: o.keyAt, fillAt: o.fillAt, env: o.env };
  }
  const OFF = 0x000000, WHITE = 0xffffff, WARM = 0xffd9a8, GOLD = 0xffc840;
  const CUES = {
    preshow: mkCue({
      rim: [0x2244ff, 0.3], pool: [0x1a3cff, 0.3], washA: [0x1c2f9a, 1], washB: [0x2a1c8a, 1], house: [0x3355cc, 0.22], tunnel: [0xffe2b0, 0.9],
      hoop: [0x3040a0, 0.22], marquee: [0xffc860, 0.4],
      spots: [[WHITE, 0, -0.6, -6.6], [WHITE, 0, 0.6, -6.6], [WHITE, 0, -3, -2], [WHITE, 0, 3, -2]], sweep: 0,
      wash: [0.22, 0.2, 0, 0.12], haze: [0x2038a0, 0.07], key: [0xffe2b0, 7], fill: [0x5070ff, 5], keyAt: [0, 2.3, -10.4], fillAt: [0, 5, 0],
      screen: 0.22, banner: 0.2, water: [0x061040, 0x1a2a6a, 0x4060c0],
      env: mkEnv(0x060a1c, 0x2a3c78, 0x080a14, 0.42, 0x6f86ff, 0.22),
    }),
    entrance: mkCue({
      rim: [0x4466ff, 0.5], pool: [0x2a5cff, 0.4], washA: [0x2238b0, 1], washB: [0x3a2aa0, 1], house: [0x3355cc, 0.15], tunnel: [0xffe2b0, 0.7],
      hoop: [0x4060d0, 0.35], marquee: [0xffd070, 1],
      spots: [[WHITE, 1, -0.55, -6.9], [WHITE, 1, 0.55, -6.9], [WHITE, 0, -3, -2], [WHITE, 0, 3, -2]], sweep: 0,
      wash: [0.2, 0.25, 0, 0.15], haze: [0x8090c0, 0.085], key: [WHITE, 40], fill: [WHITE, 26], keyAt: 0, fillAt: 1,
      screen: 0.9, banner: 0.5, water: [0x082060, 0x3a50a0, 0x90b0ff],
      env: mkEnv(0x080c1e, 0x34467e, 0x0a0c18, 0.4, 0xffffff, 0.5),
    }),
    show: mkCue({
      rim: [0xffd060, 0.9], pool: [0x40c8ff, 0.7], washA: [0xff5aa8, 1], washB: [0x49c8ff, 1], house: [0x3355cc, 0.12], tunnel: [0xffe2b0, 0.4],
      hoop: [0xff3fa0, 0.9], marquee: [0xffd070, 1],
      spots: [[0xff4fa0, 0.8, -4.5, -2.2], [0x4fd0ff, 0.8, 4.5, -2.2], [0xffd04f, 0.8, -1.5, -3], [0x9a6bff, 0.8, 1.5, -1]], sweep: 1,
      wash: [0.6, 0.6, 0, 0.22], haze: [0x8060c0, 0.1], key: [0xfff0d8, 62], fill: [0xa0c8ff, 30], keyAt: [0, 6, -1.2], fillAt: [0, 5, 4],
      screen: 1, banner: 0.9, water: [0x083a78, 0x6a8ad8, 0xbfe8ff],
      env: mkEnv(0x0c0c22, 0x6a78c8, 0x1a1420, 0.78, 0xfff1dc, 1.45),
    }),
    water: mkCue({
      rim: [0x20b0ff, 0.6], pool: [0x60f0ff, 1], washA: [0x1c6cff, 1], washB: [0x22e0e0, 1], house: [0x2255cc, 0.1], tunnel: [0xffe2b0, 0.3],
      hoop: [0x60ffe0, 1], marquee: [0x80e0ff, 0.7],
      spots: [[0x60e8ff, 0.85, -2.6, 3], [0x60e8ff, 0.85, 2.6, 3], [0x3f8cff, 0.7, 0, 1.9], [0xd8ffff, 0.6, 0, 4.1]], sweep: 0.35,
      wash: [0.5, 0.4, 0, 0.18], haze: [0x2070c0, 0.1], key: [0xbfefff, 56], fill: [0x4080ff, 24], keyAt: [0, 5.5, 3], fillAt: [0, 4.2, -1.5],
      screen: 0.75, banner: 0.6, water: [0x0a50a0, 0x7ad0f0, 0xd0ffff],
      env: mkEnv(0x06142a, 0x2f8fd8, 0x081828, 0.72, 0x9fe6ff, 1.05),
    }),
    duet: mkCue({
      rim: [0xff9040, 0.42], pool: [0x3060c0, 0.3], washA: [0x7a3a20, 1], washB: [0x50204a, 1], house: [0x332266, 0.08], tunnel: [0xffe2b0, 0.25],
      hoop: [0xff9060, 0.4], marquee: [0xffc070, 0.5],
      spots: [[WARM, 1, 0, -2.5], [WARM, 1, 1.6, -2.5], [WARM, 0, -3, -2], [WARM, 0, 3, -2]], sweep: 0,
      wash: [0.14, 0.12, 0, 0.1], haze: [0xa06040, 0.06], key: [0xffdcb0, 34], fill: [0xffdcb0, 30], keyAt: 0, fillAt: 1,
      screen: 0.45, banner: 0.4, water: [0x0a1c50, 0x604878, 0xffc890],
      env: mkEnv(0x0c0812, 0x70507a, 0x140c10, 0.42, 0xffd9a8, 0.7),
    }),
    finale: mkCue({
      rim: [0xffd860, 1], pool: [0xffe890, 1], washA: [GOLD, 1], washB: [0xfff0a0, 1], house: [0xffc870, 0.45], tunnel: [0xffe2b0, 0.5],
      hoop: [0xffd040, 1], marquee: [0xffe090, 1],
      spots: [[GOLD, 1, -4, -1.5], [GOLD, 1, 4, -1.5], [0xffffff, 0.9, -1.5, 2.5], [0xffe6a0, 0.9, 1.5, 2.5]], sweep: 1.5,
      wash: [0.9, 1, 1, 0.3], haze: [0xc09030, 0.13], key: [0xffe6b0, 85], fill: [0xffc060, 46], keyAt: [0, 6.5, 0], fillAt: [0, 5, 3.5],
      screen: 1, banner: 1, water: [0x0a3a70, 0xf0c870, 0xfff0b0],
      env: mkEnv(0x14100c, 0xb89a5a, 0x2a1c10, 0.92, 0xffe2a0, 1.75),
    }),
    blackout: mkCue({
      rim: [OFF, 0], pool: [0x1a3cff, 0.04], washA: [OFF, 0], washB: [OFF, 0], house: [0x3355cc, 0.03], tunnel: [0xffe2b0, 0.12],
      hoop: [OFF, 0], marquee: [0xffc860, 0.03],
      spots: [[WHITE, 0, 0, -2.5], [WHITE, 0, 1.6, -2.5], [WHITE, 0, -3, -2], [WHITE, 0, 3, -2]], sweep: 0,
      wash: [0, 0, 0, 0.1], haze: [OFF, 0], key: [WHITE, 0], fill: [WHITE, 0], keyAt: [0, 6, -1], fillAt: [0, 5, 4],
      screen: 0.02, banner: 0.02, water: [0x020410, 0x060a18, 0x101830],
      env: mkEnv(0x020308, 0x1a2240, 0x040408, 0.08, 0x6f86ff, 0),
    }),
    house: mkCue({
      rim: [0xffe0b0, 0.5], pool: [0xbfe8ff, 0.5], washA: [0xffe6c4, 1], washB: [0xfff2dc, 1], house: [0xffe0b0, 1], tunnel: [0xffe2b0, 0.9],
      hoop: [0xffffff, 0.4], marquee: [0xffd070, 0.7],
      spots: [[WHITE, 0, 0, -2.5], [WHITE, 0, 1.6, -2.5], [WHITE, 0, -3, -2], [WHITE, 0, 3, -2]], sweep: 0,
      wash: [0.3, 0, 0, 0.1], haze: [0x806850, 0.045], key: [0xffeed0, 72], fill: [0xffeed0, 44], keyAt: [0, 7, 0], fillAt: [0, 6, 6],
      screen: 0.8, banner: 1, water: [0x0c4484, 0xc8b8a0, 0xfff4e0],
      env: mkEnv(0x1a1612, 0xffe6c4, 0x4a3a2c, 1.1, 0xfff0d8, 1.25),
    }),
  };

  // ------------------------------------------------------------------ live state
  const cur = new Float32Array(NS), from = new Float32Array(NS);
  let cue = CUES.preshow, cueName = "preshow", blendT = 1, blendDur = 1;
  let energy = 0, energyT = 0, flame = 0, flameT = 0, beatExt = null, now = 0, ripCursor = 0;
  const follow = [null, null, null, null];
  const spx = new Float32Array(4), spz = new Float32Array(4);
  const v2 = new THREE.Vector2();
  const camBounds = { minX: -13, maxX: 13, minZ: -6.6, maxZ: 8.6, maxY: 9.5 };
  cur.set(cue.v);
  for (let i = 0; i < 4; i++) { spx[i] = cue.spotT[i][0]; spz[i] = cue.spotT[i][1]; }

  const A = (name, a, b, c) => { const f = audio && audio[name]; if (typeof f === "function") f.call(audio, a, b, c); };
  const F = (name, a, b, c, d, e) => { const f = fx && fx[name]; if (typeof f === "function") f.call(fx, a, b, c, d, e); };
  function ripple(x, z, strength) {
    if (sdPool(x, z) > 0.3) return;
    const o = ripCursor * 4; ripCursor = (ripCursor + 1) % 4;
    ripU[o] = x; ripU[o + 1] = z; ripU[o + 2] = now; ripU[o + 3] = strength;
  }
  const groundAt = (x, z) => { const h = heightAt(x, z), w = waterAt(x, z); return w > h ? w : h; };

  const spots = [0, 1, 2, 3].map((i) => ({
    index: i, target: null,
    follow(t) { follow[i] = t || null; this.target = follow[i]; },
    get x() { return spx[i]; }, get z() { return spz[i]; },
  }));

  function setCue(name, seconds = 1) {
    const c = CUES[name];
    if (!c) return false;
    cue = c; cueName = name;
    world.env = c.env;
    if (seconds > 0) { from.set(cur); blendT = 0; blendDur = seconds; } else { cur.set(c.v); blendT = 1; }
    if (ctx.world === world) ctx.setEnv(c.env, seconds > 0 ? seconds : 0);
    return true;
  }

  function update(dt, time, focusX, focusZ) {
    now = time; uTime.value = time;
    if (blendT < 1) {
      blendT = Math.min(1, blendT + dt / blendDur);
      const k = blendT * blendT * (3 - 2 * blendT), to = cue.v;
      for (let i = 0; i < NS; i++) cur[i] = from[i] + (to[i] - from[i]) * k;
    }
    energy += (energyT - energy) * Math.min(1, dt * 3);
    if (flame < flameT) flame = Math.min(flameT, flame + dt * 1.6); else if (flame > flameT) flame = Math.max(flameT, flame - dt * 2.5);
    // a soft swell on every second beat (about 0.9 Hz at 112 bpm): never a strobe
    const ph = beatExt !== null ? beatExt : time * (112 / 60);
    let pulse = 0.5 + 0.5 * Math.cos(Math.PI * ph); pulse *= pulse; pulse *= pulse;
    const pe = pulse * energy, bright = 0.8 + 0.4 * energy, live = bright * (1 + 0.3 * pe);

    // glow channels
    for (let c = 0; c < NCH; c++) {
      const m = (c === CH.house || c === CH.tunnel) ? 1 : live, o = c * 3;
      chU[o] = cur[o] * m; chU[o + 1] = cur[o + 1] * m; chU[o + 2] = cur[o + 2] * m;
    }
    const fl = flame * (0.86 + 0.14 * Math.sin(time * 3.1));
    chU[CH.fire * 3] = fl; chU[CH.fire * 3 + 1] = 0.5 * fl; chU[CH.fire * 3 + 2] = 0.12 * fl;
    chU[CH.trim * 3] = 0.1; chU[CH.trim * 3 + 1] = 0.8; chU[CH.trim * 3 + 2] = 0.32;
    ptU.uFlame.value = flame;

    // follow spots
    const speed = cur[O.wash + 3] * (0.5 + energy) * TAU;
    const sweep = cue.sweep * (0.45 + 0.55 * energy);
    for (let i = 0; i < 4; i++) {
      const f = follow[i];
      let tx, tz, rate;
      if (f) {
        if (f.isObject3D) { const e = f.matrixWorld.elements; tx = e[12]; tz = e[14]; } else { tx = f.x; tz = f.z; }
        rate = 9;
      } else {
        const b = cue.spotT[i], a = time * speed + i * 1.7;
        tx = b[0] + Math.sin(a) * 2.4 * sweep; tz = b[1] + Math.cos(a * 0.8 + i) * 1.5 * sweep;
        rate = 2.5;
      }
      const k = 1 - Math.exp(-rate * dt);
      spx[i] += (tx - spx[i]) * k; spz[i] += (tz - spz[i]) * k;
      const o3 = i * 3, o4 = i * 4, s = O.spot + o4, inten = cur[s + 3];
      dstU[o3] = spx[i]; dstU[o3 + 1] = groundAt(spx[i], spz[i]); dstU[o3 + 2] = spz[i];
      const g = inten * 0.6 * bright;
      colU[o4] = cur[s] * g; colU[o4 + 1] = cur[s + 1] * g; colU[o4 + 2] = cur[s + 2] * g; colU[o4 + 3] = 1;
      radU[i] = 1.15;
      if (g < 0.004) { dstU[o3] = src[o3]; dstU[o3 + 1] = src[o3 + 1] - 0.01; dstU[o3 + 2] = src[o3 + 2]; radU[i] = 0; }   // dark: no fill cost
      const lens = Math.min(1, inten * 1.3), c3 = (CH.spot0 + i) * 3;
      chU[c3] = cur[s] * lens; chU[c3 + 1] = cur[s + 1] * lens; chU[c3 + 2] = cur[s + 2] * lens;
    }
    // wash beams
    const wI = cur[O.wash] * 0.42 * bright * (1 + 0.35 * pe), wSweep = cur[O.wash + 1] * (0.5 + 0.5 * energy), wUp = cur[O.wash + 2];
    for (let j = 4; j < NB; j++) {
      const o3 = j * 3, o4 = j * 4, sx = src[o3], sz = src[o3 + 2];
      const a = time * speed * 0.7 + j * 0.9;
      const fxx = sx * 0.62 + Math.sin(a) * 2.2 * wSweep, fzz = sz * 0.3 + 0.6 + Math.cos(a * 0.83 + j) * 1.6 * wSweep;
      const up = (j & 1) ? wUp : 0;
      const ax = sx * 1.7 + Math.sin(a * 0.6) * 5, ay = 6.5 + 2.6 * Math.sin(a * 0.5 + j), az = 15;
      dstU[o3] = fxx + (ax - fxx) * up; dstU[o3 + 1] = (1 - up) * groundAt(fxx, fzz) + ay * up; dstU[o3 + 2] = fzz + (az - fzz) * up;
      const c = ((j & 1) ? CH.washB : CH.washA) * 3;
      colU[o4] = cur[c] * wI; colU[o4 + 1] = cur[c + 1] * wI; colU[o4 + 2] = cur[c + 2] * wI; colU[o4 + 3] = 1 - up;
      radU[j] = 0.95 + 0.9 * up;
      if (wI < 0.004) { dstU[o3] = sx; dstU[o3 + 1] = src[o3 + 1] - 0.01; dstU[o3 + 2] = sz; radU[j] = 0; }
    }
    hazeU.set(cur[O.haze], cur[O.haze + 1], cur[O.haze + 2]).multiplyScalar(bright);
    moteU.set(cur[O.haze], cur[O.haze + 1], cur[O.haze + 2]).multiplyScalar(4).addScalar(0.05 * Math.min(1, cur[O.scr] * 4));

    // the two real lights
    const kl = 1 - Math.exp(-4 * dt);
    aimLight(key, cue.keyAt, kl); aimLight(fill, cue.fillAt, kl);
    key.color.setRGB(cur[O.key], cur[O.key + 1], cur[O.key + 2], THREE.SRGBColorSpace); key.intensity = cur[O.key + 3] * bright;
    fill.color.setRGB(cur[O.fill], cur[O.fill + 1], cur[O.fill + 2], THREE.SRGBColorSpace); fill.intensity = cur[O.fill + 3] * bright;

    // water, screen, banners
    wU.uDeep.value.set(cur[O.water], cur[O.water + 1], cur[O.water + 2]);
    wU.uSky.value.set(cur[O.water + 3], cur[O.water + 4], cur[O.water + 5]).multiplyScalar(0.55 * bright);
    wU.uGlint.value.set(cur[O.water + 6], cur[O.water + 7], cur[O.water + 8]).multiplyScalar(bright);
    screenU.uBright.value = cur[O.scr] * (0.92 + 0.08 * pe);
    const bt = cur[O.scr + 1];
    bannerU.uTint.value.set(bt * (0.55 + 0.45 * Math.min(1, cur[O.key] + 0.2)), bt * (0.55 + 0.45 * Math.min(1, cur[O.key + 1] + 0.2)), bt * (0.55 + 0.45 * Math.min(1, cur[O.key + 2] + 0.2)));
    ptU.uPx.value = ctx.renderer.getDrawingBufferSize(v2).y * 0.5;

    // keep the follow camera inside the tunnel while the player is in it, in front of the back wall otherwise
    const inTunnel = focusZ !== undefined && focusZ < -STAGE_Z + 0.4;
    const kb = Math.min(1, dt * 5);
    camBounds.minX += ((inTunnel ? -TUN_HW + 0.35 : -13) - camBounds.minX) * kb;
    camBounds.maxX += ((inTunnel ? TUN_HW - 0.35 : 13) - camBounds.maxX) * kb;
    camBounds.minZ += ((inTunnel ? TUN_END + 0.4 : -STAGE_Z + 0.4) - camBounds.minZ) * kb;
    camBounds.maxY += ((inTunnel ? TUN_H - 0.3 : 9.5) - camBounds.maxY) * kb;
  }
  function aimLight(light, at, k) {
    let x, y, z;
    if (typeof at === "number") { x = spx[at]; z = spz[at] + 1.2; y = dstU[at * 3 + 1] + 4.2; }
    else { x = at[0]; y = at[1]; z = at[2]; }
    const p = light.position;
    p.x += (x - p.x) * k; p.y += (y - p.y) * k; p.z += (z - p.z) * k;
  }

  function reset() {
    for (let i = 0; i < 4; i++) { follow[i] = null; spots[i].target = null; }
    energy = energyT = 0; flame = flameT = 0; beatExt = null;
    for (let i = 0; i < 4; i++) { ripU[i * 4 + 2] = -100; ripU[i * 4 + 3] = 0; }
    setCue("preshow", 0);
    for (let i = 0; i < 4; i++) { spx[i] = cue.spotT[i][0]; spz[i] = cue.spotT[i][1]; }
    key.position.set(cue.keyAt[0], cue.keyAt[1], cue.keyAt[2]); fill.position.set(cue.fillAt[0], cue.fillAt[1], cue.fillAt[2]);
    screen.setText("PLATYPUS", "TRICKS");
    update(0, now, 0, -12);
  }

  const world = {
    name: "stage", group, swim: true, maxStep: 0.5,
    heightAt, waterAt, confine, camBounds,
    depthAt(x, z) { const w = waterAt(x, z); return w === -Infinity ? 0 : Math.max(0, w - heightAt(x, z)); },
    inPool(x, z) { return sdPool(x, z) < 0; },
    surfaceAt(x, z) { return sdPool(x, z) < 0 ? "water" : "stage"; },
    colliders: [{ x: -9, z: 6, r: 0.36, on: true }, { x: 9, z: 6, r: 0.36, on: true }],
    env: cue.env, ENV: {},
    P, hoops, seats, spots, screen, pool: { x: 0, z: POOL_Z, hx: POOL_HX, hz: POOL_HZ, surfaceY: WATER_Y, depth: POOL_DEPTH },
    lights: { key, fill },
    CUES: Object.keys(CUES),
    get cue() { return cueName; },
    get energy() { return energyT; },
    setCue,
    setEnergy(e) { energyT = e < 0 ? 0 : e > 1 ? 1 : +e || 0; },
    setHoopFlame(on) { flameT = on ? 1 : 0; },
    // optional: lock the light swell to the music (pass audio.showMusic.beat() every frame; null = free-run)
    setBeat(beatFloat) { beatExt = typeof beatFloat === "number" && isFinite(beatFloat) ? beatFloat : null; },
    splashAt(x, z, strength = 1) { ripple(x, z, strength); },
    update, reset,
    onFootstep(wx, wz, strength, footIndex, wet, pan) {
      A("step", wet ? "water" : "stage", strength, pan);
      if (wet) ripple(wx, wz, 0.25 * strength);
    },
    onLand(x, z, floorY, impact, wet) {
      if (wet) { A("splash", impact); F("splash", x, WATER_Y, z, impact); ripple(x, z, 0.5 + impact); }
      else { A("step", "stage", Math.min(1, 0.5 + impact * 0.6), 0); F("dust", x, floorY, z, impact * 0.4); }
    },
    onSwim(on, x, z) {
      ripple(x, z, 0.6);
      if (on) { A("splash", 0.35); F("splash", x, WATER_Y, z, 0.35); }
    },
    onDive(under, x, z) {
      A(under ? "diveIn" : "surface"); A("underwater", under);
      F("bubbles", x, WATER_Y - 0.3, z, 8, WATER_Y);
      ripple(x, z, 0.8);
    },
    onEnter() { update(0, now, 0, -12); },
    onLeave() { A("underwater", false); },
  };
  for (const n in CUES) world.ENV[n] = CUES[n].env;
  reset();
  return world;
}
