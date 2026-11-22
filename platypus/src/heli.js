// heli.js - the helicopter and the flight corridor (LEVELS2.md B11). createHeli(ctx) -> { craft, world } (key "heli").
// craft: a small circus utility helicopter with a real, learnable flight model (collective / cyclic / yaw, momentum,
//        lift lost to tilt, ground effect, wind, scrapes and crashes). craft.control IS the ctx.vehicle interface.
// world: "flight" - a corridor 1300 m long running +z, flown from night into dawn: the back lot, fields, power lines,
//        searchlights, a river valley with a stone bridge, a ridge with radio towers and gusts, the jungle, a clearing.
// Everything static is baked into a few vertex-coloured meshes and bucketed InstancedMeshes; update() writes uniforms.

const TAU = Math.PI * 2;
const G = 9.81;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const pt = (x, y, z, yaw) => (yaw === undefined ? { x, y, z } : { x, y, z, yaw });
const camPair = (px, py, pz, lx, ly, lz) => ({ pos: pt(px, py, pz), look: pt(lx, ly, lz) });
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
const mixHex = (a, b, t) => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t));
};

// ------------------------------------------------------------------------------------------------ baker
// Accumulates transformed primitives into one vertex-coloured BufferGeometry (position, normal, color).
function createBaker(THREE) {
  const pos = [], nor = [], col = [];
  const M = new THREE.Matrix4(), B = new THREE.Matrix4(), T = new THREE.Matrix4(), N = new THREE.Matrix3();
  const v = new THREE.Vector3(), c = new THREE.Color(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, "YXZ"), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  const unitBox = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const cyls = {};
  const rnd = mulberry(1234);
  const cyl = (seg, open) => {
    const k = seg + (open ? "o" : "c");
    if (!cyls[k]) cyls[k] = new THREE.CylinderGeometry(1, 1, 1, seg, 1, !!open).toNonIndexed();
    return cyls[k];
  };
  const api = {
    ao: 0.25, jitter: 0.04,
    base(x, y, z, yaw) { B.makeRotationY(yaw || 0); B.setPosition(x || 0, y || 0, z || 0); return api; },
    xf(x, y, z, sx, sy, sz, ry, rx, rz) { e.set(rx || 0, ry || 0, rz || 0); q.setFromEuler(e); M.compose(p.set(x, y, z), q, s.set(sx, sy, sz)); return api; },
    // geo: non-indexed, in unit space. top: radius scale of the +y half. colorFn(x, y, z of the unit vertex) -> hex.
    add(geo, hex, top, colorFn) {
      T.multiplyMatrices(B, M);
      N.getNormalMatrix(T);
      const P = geo.attributes.position, Nn = geo.attributes.normal;
      const j = 1 + (rnd() - 0.5) * 2 * api.jitter;
      c.set(hex);
      let r = c.r * j, g = c.g * j, b = c.b * j;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i);
        const ly = v.y;
        if (colorFn) { c.set(colorFn(v.x, v.y, v.z)); r = c.r; g = c.g; b = c.b; }
        if (top !== undefined && top !== null && ly > 0) { v.x *= top; v.z *= top; }
        v.applyMatrix4(T);
        pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(Nn, i).applyMatrix3(N).normalize();
        nor.push(v.x, v.y, v.z);
        const k = 1 - api.ao * (0.5 - clamp(ly, -0.5, 0.5));
        col.push(r * k, g * k, b * k);
      }
      return api;
    },
    box(hex, x, y, z, sx, sy, sz, ry, rx, rz) { api.xf(x, y, z, sx, sy, sz, ry, rx, rz); return api.add(unitBox, hex); },
    cyl(hex, x, y, z, r1, r0, h, seg, rx, ry, rz, open) { api.xf(x, y, z, r0, h, r0, ry, rx, rz); return api.add(cyl(seg || 8, open), hex, r0 > 0 ? r1 / r0 : 1); },
    beam(hex, x0, y0, z0, x1, y1, z1, r, seg) {
      dir.set(x1 - x0, y1 - y0, z1 - z0);
      const len = dir.length();
      if (len < 1e-5) return api;
      q.setFromUnitVectors(up, dir.divideScalar(len));
      M.compose(p.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), q, s.set(r, len, r));
      return api.add(cyl(seg || 5, true), hex);
    },
    tri(ax, ay, az, bx, by, bz, cx, cy, cz, hexA, hexB, hexC) {
      v.set(ax, ay, az).applyMatrix4(B); pos.push(v.x, v.y, v.z); const Ax = v.x, Ay = v.y, Az = v.z;
      v.set(bx, by, bz).applyMatrix4(B); pos.push(v.x, v.y, v.z); const Bx = v.x, By = v.y, Bz = v.z;
      v.set(cx, cy, cz).applyMatrix4(B); pos.push(v.x, v.y, v.z);
      s.set(Bx - Ax, By - Ay, Bz - Az); p.set(v.x - Ax, v.y - Ay, v.z - Az); s.cross(p).normalize();
      for (let i = 0; i < 3; i++) nor.push(s.x, s.y, s.z);
      c.set(hexA); col.push(c.r, c.g, c.b);
      c.set(hexB === undefined ? hexA : hexB); col.push(c.r, c.g, c.b);
      c.set(hexC === undefined ? hexA : hexC); col.push(c.r, c.g, c.b);
    },
    // a quad whose normal is turned to the side of (ox, oy, oz)
    quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, hex, ox, oy, oz) {
      const nx = (by - ay) * (dz - az) - (bz - az) * (dy - ay), ny = (bz - az) * (dx - ax) - (bx - ax) * (dz - az), nz = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
      if (ox === undefined || nx * ox + ny * oy + nz * oz >= 0) { api.tri(ax, ay, az, bx, by, bz, cx, cy, cz, hex); api.tri(ax, ay, az, cx, cy, cz, dx, dy, dz, hex); }
      else { api.tri(ax, ay, az, dx, dy, dz, cx, cy, cz, hex); api.tri(ax, ay, az, cx, cy, cz, bx, by, bz, hex); }
    },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(nor), 3));
      g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
      g.computeBoundingSphere();
      return g;
    },
  };
  B.identity(); M.identity();
  return api;
}

// ------------------------------------------------------------------------------------------------ shaders
const ROTOR_VERT = /* glsl */ `
varying vec2 vP;
void main() {
	vP = position.xy;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;
const ROTOR_FRAG = /* glsl */ `
uniform float uAng, uOp, uBlades;
uniform vec3 uCol;
varying vec2 vP;
void main() {
	float r = length( vP );
	float a = atan( vP.y, vP.x ) + uAng;
	float smear = pow( abs( cos( a * uBlades * 0.5 ) ), 5.0 );
	float mask = smoothstep( 1.0, 0.94, r ) * smoothstep( 0.03, 0.1, r );
	float tip = smoothstep( 0.9, 0.97, r ) * smoothstep( 1.0, 0.97, r );
	float al = ( 0.1 + 0.22 * smear + 0.25 * tip ) * mask * uOp;
	gl_FragColor = vec4( mix( uCol, vec3( 0.95, 0.85, 0.3 ), tip ), al );
	#include <colorspace_fragment>
}
`;
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
	vDir = normalize( position );
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;
const SKY_FRAG = /* glsl */ `
uniform float uTime, uStars, uSun;
uniform vec3 uZenith, uHorizon, uGlow, uSunDir, uMoonDir;
varying vec3 vDir;
float hash3( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
void main() {
	vec3 d = normalize( vDir );
	float h = clamp( d.y, 0.0, 1.0 );
	vec3 col = mix( uHorizon, uZenith, pow( h, 0.5 ) );
	// the dawn: a band of warm light low in the east (+z), the sun breaking over the horizon
	vec3 sd = normalize( uSunDir );
	float toSun = max( dot( normalize( vec3( d.x, 0.0, d.z ) + vec3( 0.0, 0.0, 1e-4 ) ), normalize( vec3( sd.x, 0.0, sd.z ) ) ), 0.0 );
	col += uGlow * pow( toSun, 3.0 ) * exp( - h * 7.0 ) * uSun;
	float m = max( dot( d, sd ), 0.0 );
	col += vec3( 1.0, 0.86, 0.6 ) * ( smoothstep( 0.9993, 0.9997, m ) * 2.0 + pow( m, 220.0 ) * 0.9 + pow( m, 18.0 ) * 0.28 ) * uSun;
	// long thin clouds catching the light
	float cl = sin( d.x * 5.0 / ( h + 0.2 ) + 1.3 ) * sin( d.z * 3.0 / ( h + 0.25 ) + d.x * 2.0 );
	cl = smoothstep( 0.55, 0.95, cl ) * smoothstep( 0.02, 0.12, h ) * ( 1.0 - smoothstep( 0.2, 0.5, h ) );
	col = mix( col, col * 0.75 + uGlow * ( 0.25 + 0.6 * toSun ) * ( 0.25 + uSun ), cl * 0.55 );
	// stars and the moon fade with the night
	vec3 p = d * 70.0; vec3 ip = floor( p ); vec3 fp = fract( p ) - 0.5;
	float s = hash3( ip );
	float st = step( 0.972, s ) * ( 1.0 - smoothstep( 0.05, 0.32, length( fp ) ) ) * ( 0.7 + 0.3 * sin( uTime * ( 1.0 + s * 3.0 ) + s * 40.0 ) );
	p = d * 150.0; ip = floor( p ); fp = fract( p ) - 0.5; s = hash3( ip + 9.0 );
	st += step( 0.955, s ) * ( 1.0 - smoothstep( 0.1, 0.42, length( fp ) ) ) * 0.4;
	col += vec3( 0.86, 0.9, 1.0 ) * st * uStars * smoothstep( 0.02, 0.25, d.y );
	float mo = dot( d, normalize( uMoonDir ) );
	col += ( vec3( 0.95, 0.96, 1.0 ) * smoothstep( 0.99925, 0.9995, mo ) * 1.2 + vec3( 0.32, 0.4, 0.62 ) * pow( max( mo, 0.0 ), 48.0 ) * 0.5 ) * ( 0.25 + 0.75 * uStars );
	gl_FragColor = vec4( col, 1.0 );
	#include <colorspace_fragment>
}
`;
const BEAM_VERT = /* glsl */ `
varying float vH;
varying vec3 vN, vV;
void main() {
	vH = - position.y;
	vec4 mv = modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
	vN = normalize( normalMatrix * mat3( instanceMatrix ) * normal );
	vV = normalize( - mv.xyz );
	gl_Position = projectionMatrix * mv;
}
`;
const BEAM_FRAG = /* glsl */ `
uniform float uLevel;
varying float vH;
varying vec3 vN, vV;
void main() {
	float edge = pow( abs( dot( normalize( vN ), normalize( vV ) ) ), 1.2 );
	float a = ( pow( 1.0 - vH, 1.6 ) * 0.8 + 0.1 ) * edge * smoothstep( 1.0, 0.85, vH );
	gl_FragColor = vec4( vec3( 0.85, 0.92, 1.0 ) * a * uLevel * 0.55, 1.0 );
	#include <colorspace_fragment>
}
`;
const MIST_VERT = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vPh;
void main() {
	vUv = uv * 2.0 - 1.0;
	vPh = instanceMatrix[ 3 ].x * 0.37 + instanceMatrix[ 3 ].z * 0.21;
	vec4 wp = instanceMatrix * vec4( position, 1.0 );
	wp.x += sin( uTime * 0.05 + vPh ) * 4.0;
	gl_Position = projectionMatrix * modelViewMatrix * wp;
}
`;
const MIST_FRAG = /* glsl */ `
uniform float uTime, uOp;
uniform vec3 uCol;
varying vec2 vUv;
varying float vPh;
void main() {
	float d = length( vUv );
	float a = ( 1.0 - smoothstep( 0.1, 1.0, d ) ) * uOp * ( 0.7 + 0.3 * sin( uTime * 0.11 + vPh ) );
	gl_FragColor = vec4( uCol, a );
	#include <colorspace_fragment>
}
`;
const WATER_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uCol, uSky;
varying vec3 vW;
void main() {
	float w = sin( vW.x * 0.6 + uTime * 0.7 ) * sin( vW.z * 0.9 - uTime * 0.5 ) + 0.5 * sin( vW.x * 1.7 - vW.z * 1.3 + uTime * 1.1 );
	vec3 col = mix( uCol, uSky, 0.35 + 0.2 * w );
	col += uSky * smoothstep( 1.1, 1.45, w ) * 0.5;
	gl_FragColor = vec4( col, 0.9 );
	#include <colorspace_fragment>
}
`;
const WATER_VERT = /* glsl */ `
varying vec3 vW;
void main() {
	vec4 wp = modelMatrix * vec4( position, 1.0 );
	vW = wp.xyz;
	gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// ================================================================================================ the aircraft
const CRAFT_R = 1.6; // collision sphere, centred CRAFT_CY above the skids
const CRAFT_CY = 1.3;
const MAX_FWD = 20 * DEG, MAX_BACK = 14 * DEG;
const DRAG2 = 0.0037, DRAG1 = 0.06; // top speed 24 m/s at full tilt
const VY_DRAG = 0.06;

function buildCraft(ctx, THREE) {
  const sfx = (name, a, b, c) => { const au = ctx.audio, f = au && au[name]; return typeof f === "function" ? f.call(au, a, b, c) : undefined; };
  const vfx = (name, a, b, c, d, e) => { const fx = ctx.fx, f = fx && fx[name]; return typeof f === "function" ? f.call(fx, a, b, c, d, e) : undefined; };
  const RED = 0xb3261e, CREAM = 0xeadfc4, GOLD = 0xd8a93a, IRON = 0x3a3c42, DARK = 0x1c1c20;
  const group = new THREE.Group();
  group.name = "helicopter";
  group.rotation.order = "YXZ";

  // ---- the airframe: one vertex-coloured mesh
  const b = createBaker(THREE);
  // skids and struts
  for (let s = -1; s <= 1; s += 2) {
    b.beam(IRON, s * 0.9, 0.06, -1.5, s * 0.9, 0.06, 1.45, 0.05, 6).beam(IRON, s * 0.9, 0.06, 1.45, s * 0.9, 0.36, 1.9, 0.05, 6);
    b.beam(IRON, s * 0.9, 0.08, 0.95, s * 0.5, 0.82, 0.85, 0.035, 5).beam(IRON, s * 0.9, 0.08, -0.75, s * 0.5, 0.86, -0.6, 0.035, 5);
  }
  b.beam(IRON, -0.5, 0.82, 0.85, 0.5, 0.82, 0.85, 0.03, 5).beam(IRON, -0.5, 0.86, -0.6, 0.5, 0.86, -0.6, 0.03, 5);
  // the striped pod under the bubble
  const lower = new THREE.SphereGeometry(0.5, 16, 8, 0, TAU, Math.PI / 2, Math.PI / 2).toNonIndexed();
  b.ao = 0.35;
  b.xf(0, 1.36, 0.5, 1.9, 1.32, 2.8).add(lower, RED, null, (x, y, z) => (y > -0.06 ? GOLD : Math.floor((z + 0.5) * 7 + 0.001) % 2 ? CREAM : RED));
  b.ao = 0.25;
  b.box(0x2a2420, 0, 1.0, 0.45, 1.5, 0.05, 2.1);
  // seat, stick, dashboard with dials
  b.box(0x5a3a26, 0, 1.12, -0.05, 0.75, 0.12, 0.6).box(0x5a3a26, 0, 1.5, -0.4, 0.75, 0.8, 0.1, 0, -0.15);
  b.beam(IRON, 0, 1.02, 0.78, 0, 1.5, 0.66, 0.02, 5).cyl(DARK, 0, 1.53, 0.655, 0.035, 0.035, 0.1, 6);
  b.box(DARK, 0, 1.3, 1.28, 0.95, 0.34, 0.2, 0, 0.25);
  for (let i = -1; i <= 1; i++) b.cyl(i ? CREAM : 0xf0d25a, i * 0.26, 1.33, 1.16, 0.085, 0.085, 0.02, 10, Math.PI / 2 + 0.25);
  b.beam(IRON, -0.2, 1.0, 1.25, -0.2, 1.2, 1.3, 0.025, 5).beam(IRON, 0.2, 1.0, 1.25, 0.2, 1.2, 1.3, 0.025, 5);
  // canopy frame: the rim and one rib over the top
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI, a1 = ((i + 1) / 12) * Math.PI;
    b.beam(GOLD, 0, 1.36 + Math.sin(a0) * 1.06, 0.5 + Math.cos(a0) * 1.36, 0, 1.36 + Math.sin(a1) * 1.06, 0.5 + Math.cos(a1) * 1.36, 0.022, 4);
  }
  // engine, fuel tanks, exhaust, mast
  b.box(0x3a3a40, 0, 1.55, -1.0, 0.85, 0.75, 0.8).box(0x2a2a2e, 0, 1.05, -0.95, 0.7, 0.3, 0.9);
  b.cyl(CREAM, 0, 2.12, -0.95, 0.2, 0.2, 1.35, 10, 0, 0, Math.PI / 2).cyl(RED, 0, 2.12, -0.95, 0.205, 0.205, 0.3, 10, 0, 0, Math.PI / 2);
  b.beam(0x6a5a4a, 0.3, 1.5, -1.4, 0.55, 1.35, -1.9, 0.05, 6).beam(0x6a5a4a, -0.3, 1.5, -1.4, -0.55, 1.35, -1.9, 0.05, 6);
  b.cyl(IRON, 0, 2.35, -0.2, 0.05, 0.09, 0.95, 8).beam(IRON, 0, 1.95, -0.6, 0, 2.2, -0.2, 0.03, 5).beam(IRON, -0.4, 1.9, -0.2, 0, 2.3, -0.2, 0.025, 5).beam(IRON, 0.4, 1.9, -0.2, 0, 2.3, -0.2, 0.025, 5);
  // the open-frame tail boom: three longerons and zigzag bracing
  const Z0 = -1.35, Z1 = -5.0, NB = 8;
  const L = [[0, 1.95, 0, 1.78], [-0.36, 1.22, 0, 1.6], [0.36, 1.22, 0, 1.6]]; // x0, y0 at Z0 -> x1, y1 at Z1
  const lp = (l, t, o) => { o[0] = lerp(L[l][0], L[l][2], t); o[1] = lerp(L[l][1], L[l][3], t); o[2] = lerp(Z0, Z1, t); return o; };
  const pa = [0, 0, 0], pb = [0, 0, 0];
  for (let l = 0; l < 3; l++) { lp(l, 0, pa); lp(l, 1, pb); b.beam(CREAM, pa[0], pa[1], pa[2], pb[0], pb[1], pb[2], 0.03, 5); }
  for (let i = 0; i < NB; i++) {
    const t0 = i / NB, t1 = (i + 1) / NB;
    for (let l = 0; l < 3; l++) { lp(l, t0, pa); lp((l + 1) % 3, t1, pb); b.beam(i % 2 ? RED : CREAM, pa[0], pa[1], pa[2], pb[0], pb[1], pb[2], 0.016, 4); }
  }
  // tail: fin with a painted star, stabiliser, skid, gearbox
  b.box(RED, 0, 2.0, -5.0, 0.04, 0.95, 0.55).box(CREAM, 0, 1.5, -4.95, 0.035, 0.4, 0.4).box(CREAM, 0, 1.72, -4.35, 1.15, 0.035, 0.3);
  b.beam(IRON, 0, 1.6, -4.9, 0, 1.15, -5.25, 0.02, 4).cyl(IRON, 0.08, 1.72, -5.05, 0.07, 0.07, 0.2, 6, 0, 0, Math.PI / 2);
  for (let s = -1; s <= 1; s += 2) {
    const sx = s * 0.024;
    for (let i = 0; i < 5; i++) {
      const a0 = (i / 5) * TAU, a1 = ((i + 0.5) / 5) * TAU, a2 = ((i + 1) / 5) * TAU, R = 0.2, r = 0.085, cy = 2.1, cz = -5.0;
      b.base(0, 0, 0, 0);
      const A = [cy + Math.cos(a0) * R, cz + Math.sin(a0) * R], Bp = [cy + Math.cos(a1) * r, cz + Math.sin(a1) * r], C = [cy + Math.cos(a2) * R, cz + Math.sin(a2) * R];
      if (s > 0) { b.tri(sx, cy, cz, sx, A[0], A[1], sx, Bp[0], Bp[1], 0xf0d25a); b.tri(sx, cy, cz, sx, Bp[0], Bp[1], sx, C[0], C[1], 0xf0d25a); }
      else { b.tri(sx, cy, cz, sx, Bp[0], Bp[1], sx, A[0], A[1], 0xf0d25a); b.tri(sx, cy, cz, sx, C[0], C[1], sx, Bp[0], Bp[1], 0xf0d25a); }
    }
  }
  const body = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 }));
  body.castShadow = true;
  group.add(body);
  // the bubble
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xbfe0ee, roughness: 0.06, metalness: 0.4, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
  bubble.position.set(0, 1.36, 0.5); bubble.scale.set(0.95, 1.06, 1.36);
  bubble.renderOrder = 4;
  group.add(bubble);

  // ---- rotors: real blades below 60 % rpm, a translucent disc above
  const HUB_Y = 2.84, HUB_Z = -0.2, ROTOR_R = 3.45;
  const rb = createBaker(THREE);
  rb.ao = 0;
  rb.box(DARK, 1.78, 0, 0, 3.3, 0.035, 0.24).box(DARK, -1.78, 0, 0, 3.3, 0.035, 0.24).box(0xf0d25a, 3.3, 0.002, 0, 0.3, 0.036, 0.245).box(0xf0d25a, -3.3, 0.002, 0, 0.3, 0.036, 0.245);
  rb.cyl(IRON, 0, 0, 0, 0.1, 0.12, 0.16, 8).beam(IRON, 0, 0.1, -0.7, 0, 0.1, 0.7, 0.015, 4).cyl(IRON, 0, 0.1, 0.7, 0.05, 0.05, 0.08, 6).cyl(IRON, 0, 0.1, -0.7, 0.05, 0.05, 0.08, 6);
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 });
  const rotor = new THREE.Mesh(rb.build(), metal);
  rotor.position.set(0, HUB_Y, HUB_Z);
  group.add(rotor);
  const discMat = (blades) => new THREE.ShaderMaterial({
    uniforms: { uAng: { value: 0 }, uOp: { value: 0 }, uBlades: { value: blades }, uCol: { value: new THREE.Color(0x24262c) } },
    vertexShader: ROTOR_VERT, fragmentShader: ROTOR_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const circle = new THREE.CircleGeometry(1, 40);
  const mainDiscMat = discMat(2), tailDiscMat = discMat(2);
  const mainDisc = new THREE.Mesh(circle, mainDiscMat);
  mainDisc.position.set(0, HUB_Y + 0.02, HUB_Z); mainDisc.rotation.x = -Math.PI / 2; mainDisc.scale.setScalar(ROTOR_R);
  mainDisc.renderOrder = 5;
  group.add(mainDisc);
  const tb = createBaker(THREE);
  tb.ao = 0;
  tb.box(DARK, 0, 0.3, 0, 0.025, 0.58, 0.1).box(DARK, 0, -0.3, 0, 0.025, 0.58, 0.1).cyl(IRON, 0, 0, 0, 0.05, 0.05, 0.08, 6, 0, 0, Math.PI / 2);
  const tailRotor = new THREE.Mesh(tb.build(), metal);
  tailRotor.position.set(0.2, 1.72, -5.05);
  group.add(tailRotor);
  const tailDisc = new THREE.Mesh(circle, tailDiscMat);
  tailDisc.position.copy(tailRotor.position); tailDisc.rotation.y = Math.PI / 2; tailDisc.scale.setScalar(0.62);
  tailDisc.renderOrder = 5;
  group.add(tailDisc);
  // where the platypus sits: upright, paws toward the stick
  const seat = new THREE.Object3D();
  seat.position.set(0, 1.2, 0.2); seat.rotation.x = -1.05;
  group.add(seat);

  // ---- state
  let world = null, crashed = false, scrapeT = 0, smokeT = 0, tNow = 0, yawRate = 0, load = 0.3, lastWind = -1, lastWash = -1, rotAng = 0, wreckSpin = 0, driftX = 0, driftZ = 0;
  const windOut = { x: 0, y: 0, z: 0 }, where = { x: 0, y: 0, z: 0, inZone: false }, sparkP = new THREE.Vector3();
  const floorOf = (x, z) => (world ? (world.floorAt ? world.floorAt(x, z) : world.heightAt(x, z)) : 0);

  function crash(cause) {
    if (crashed) return;
    crashed = true;
    craft.crashed = true; craft.locked = true; craft.engineOn = false;
    craft.hull = Math.min(craft.hull, 0);
    wreckSpin = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2);
    craft.vx *= 0.35; craft.vz *= 0.35; if (craft.vy > 0) craft.vy = 0;
    vfx("crashSparks", sparkP.set(craft.x, craft.y + 1.2, craft.z), 30);
    sfx("crash", cause === "wire" ? 0.55 : 0.8);
    if (craft.onCrash) craft.onCrash(cause);
  }
  function scrape(speed, cause) {
    if (scrapeT > 0) return;
    scrapeT = 0.5;
    craft.hull = Math.max(0, craft.hull - (cause === "ground" ? 0.25 : 0.2));
    vfx("crashSparks", sparkP.set(craft.x, craft.y + (cause === "ground" ? 0.1 : 1.3), craft.z), 10);
    sfx("metalScrape", 0);
    if (craft.onScrape) craft.onScrape(speed);
    if (craft.hull <= 0) crash(cause === "ground" ? "ground" : cause === "wire" ? "wire" : "obstacle");
  }

  // closest point on the segment a-b to p; returns squared distance, leaves the point in cp
  const cp = { x: 0, y: 0, z: 0 };
  function segDist2(px, py, pz, o) {
    const ex = o.x2 - o.x, ey = o.y2 - o.y, ez = o.z2 - o.z, l2 = ex * ex + ey * ey + ez * ez;
    const t = l2 > 1e-9 ? clamp(((px - o.x) * ex + (py - o.y) * ey + (pz - o.z) * ez) / l2, 0, 1) : 0;
    cp.x = o.x + ex * t; cp.y = o.y + ey * t; cp.z = o.z + ez * t;
    const dx = px - cp.x, dy = py - cp.y, dz = pz - cp.z;
    return dx * dx + dy * dy + dz * dz;
  }
  function hitObstacles() {
    const obs = world && world.obstacles;
    if (!obs) return;
    const cx = craft.x, cy = craft.y + CRAFT_CY, cz = craft.z;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      if (o.zMin !== undefined) { if (o.zMin > cz + 60) break; if (o.zMax < cz - 60) continue; }
      let d2, rr, nx, ny, nz;
      if (o.x2 !== undefined) {
        rr = (o.r || 0.2) + CRAFT_R;
        d2 = segDist2(cx, cy, cz, o);
        if (d2 >= rr * rr) continue;
        nx = cx - cp.x; ny = cy - cp.y; nz = cz - cp.z;
      } else {
        // an upright capsule from o.y to o.y + o.h
        rr = o.r + CRAFT_R;
        const top = o.y + o.h, py = clamp(cy, o.y, Math.max(o.y, top - o.r * 0.5));
        nx = cx - o.x; ny = cy - py; nz = cz - o.z;
        d2 = nx * nx + ny * ny + nz * nz;
        if (d2 >= rr * rr) continue;
      }
      const d = Math.sqrt(d2) || 1e-3;
      nx /= d; ny /= d; nz /= d;
      const sp = Math.hypot(craft.vx, craft.vy, craft.vz);
      const wire = o.kind === "wire";
      if (sp > 5) { crash(wire ? "wire" : "obstacle"); return; }
      // a brush: pushed off, the velocity turned away
      const push = rr - d + 0.05;
      craft.x += nx * push; craft.y += ny * push; craft.z += nz * push;
      const vn = craft.vx * nx + craft.vy * ny + craft.vz * nz;
      if (vn < 0) { craft.vx -= 1.5 * vn * nx; craft.vy -= 1.5 * vn * ny; craft.vz -= 1.5 * vn * nz; }
      craft.vx += nx * 1.2; craft.vz += nz * 1.2;
      scrape(sp, wire ? "wire" : "obstacle");
      if (crashed) return;
    }
  }

  function control(dt, input) {
    if (!(dt > 0)) return;
    if (scrapeT > 0) scrapeT -= dt;
    // engine
    const lim = clamp(craft.rpmLimit, 0, 1);
    if (craft.engineOn) craft.rpm = craft.rpm > lim ? Math.max(lim, craft.rpm - dt * 0.2) : Math.min(lim, craft.rpm + dt / 3);
    else craft.rpm = Math.max(0, craft.rpm - dt / 4);
    const rpm = craft.rpm;
    let ground = floorOf(craft.x, craft.z);

    if (crashed) {
      // the wreck: falls, spins, stops
      if (craft.y > ground + 0.02) {
        craft.vy = Math.max(-14, craft.vy - G * dt);
        craft.x += craft.vx * dt; craft.y += craft.vy * dt; craft.z += craft.vz * dt;
        craft.yaw += wreckSpin * dt; craft.roll += wreckSpin * 0.4 * dt; craft.pitch += 0.5 * dt;
        ground = floorOf(craft.x, craft.z);
        if (craft.y <= ground) {
          craft.y = ground; craft.vx = craft.vy = craft.vz = 0;
          vfx("crashSparks", sparkP.set(craft.x, craft.y + 0.4, craft.z), 24);
        }
      } else {
        craft.y = ground; craft.roll += (0.5 * Math.sign(craft.roll || 1) - craft.roll) * Math.min(1, dt * 4); craft.pitch += (0.12 - craft.pitch) * Math.min(1, dt * 4);
      }
      smokeT -= dt;
      if (smokeT <= 0) { smokeT = 0.45; vfx("smoke", craft.x, craft.y + 1.4, craft.z, 1, 3); }
      craft.speed = Math.hypot(craft.vx, craft.vz); craft.altitude = Math.max(0, craft.y - ground);
      return;
    }

    const free = !craft.locked;
    const ix = free ? clamp(input.x || 0, -1, 1) : 0, iy = free ? clamp(input.y || 0, -1, 1) : 0;
    const up = free && !!input.up, down = free && !!input.down;
    const assist = clamp(craft.assist, 0, 1);
    const canLift = rpm >= 0.85;
    let alt = craft.y - ground;

    if (craft.grounded) {
      // on the skids: nothing moves until the collective is pulled with the rotor at speed
      craft.y = ground; craft.vx *= Math.max(0, 1 - dt * 6); craft.vz *= Math.max(0, 1 - dt * 6); craft.vy = 0;
      craft.pitch += (0 - craft.pitch) * Math.min(1, dt * 6); craft.roll += (0 - craft.roll) * Math.min(1, dt * 6);
      yawRate += (0 - yawRate) * Math.min(1, dt * 8);
      load = 0.15 + (up ? 0.5 : 0);
      craft.speed = 0; craft.altitude = 0;
      if (up && canLift) { craft.grounded = false; craft.vy = 0.8; }
      else return;
    }

    // yaw: slower at speed; banks into the turn
    let speedH = Math.hypot(craft.vx, craft.vz);
    const maxRate = lerp(1.5, 0.9, clamp(speedH / 24, 0, 1));
    yawRate += (-ix * maxRate - yawRate) * Math.min(1, dt * 4.5);
    craft.yaw = wrapPi(craft.yaw + yawRate * dt);
    const wantRoll = clamp(-yawRate * speedH * 0.045, -30 * DEG, 30 * DEG);
    craft.roll += (wantRoll - craft.roll) * Math.min(1, dt * 3.5);
    // cyclic: the tilt builds over about half a second
    const wantPitch = iy > 0 ? iy * MAX_FWD : iy * MAX_BACK;
    craft.pitch += (wantPitch - craft.pitch) * (1 - Math.exp(-dt / 0.19));
    const tiltFrac = Math.min(1, Math.abs(craft.pitch) / MAX_FWD);

    // collective: thrust along the rotor axis
    const kg = (1.2 + 6 * assist) * (1 - (1 - assist) * 0.9 * tiltFrac);
    let aCmd = up ? 7 : down ? -6 : clamp(-craft.vy * kg, -6, 7);
    if (down && alt < 6) {
      // the last metres: the descent is flared so that a straight-down landing is gentle
      const vLim = -(1.4 + 1.1 * Math.max(0, alt));
      if (craft.vy < vLim) aCmd = clamp((vLim - craft.vy) * 4, -6, 7);
    }
    const maxT = canLift ? G + 7 : G * Math.max(0, 1 - 2.2 * (0.85 - rpm) * (0.85 - rpm)) * (rpm > 0.3 ? 1 : rpm / 0.3);
    const T = clamp(G + aCmd, 0, maxT);
    load = clamp(0.3 + (T / G - 1) * 0.9 + tiltFrac * 0.25 + (canLift ? 0 : 0.3), 0, 1);
    // thrust is tilted: lift falls off with the tilt (the core skill: add collective in forward flight)
    let lift = T * Math.cos(Math.min(1.2, Math.abs(craft.pitch) * 1.6)) * Math.cos(Math.abs(craft.roll) * 0.5);
    if (alt < 2.5) lift *= 1 + 0.25 * (1 - Math.max(0, alt) / 2.5); // ground effect
    craft.vy += (lift - G - VY_DRAG * craft.vy * Math.abs(craft.vy)) * dt;
    craft.vy = clamp(craft.vy, -9, 7);

    // horizontal: accelerate along the nose, the velocity follows the nose with a lag (skids in hard turns)
    const hx = Math.sin(craft.yaw), hz = Math.cos(craft.yaw), lx = hz, lz = -hx;
    let vf = craft.vx * hx + craft.vz * hz, vl = craft.vx * lx + craft.vz * lz;
    vf += G * Math.tan(craft.pitch) * clamp(T / G, 0, 1.25) * dt;
    const vl2 = vl * Math.exp(-dt / 0.6);
    vf += (Math.abs(vl) - Math.abs(vl2)) * 0.6 * (vf >= 0 ? 1 : -1);
    vl = vl2;
    speedH = Math.hypot(vf, vl);
    const hold = iy === 0 && speedH < 6 ? assist * 0.9 : 0; // hover assist: bleeds off the drift when the stick is centred
    const f = Math.max(0, 1 - (DRAG2 * speedH + DRAG1 + hold) * dt);
    vf *= f; vl *= f;
    craft.vx = vf * hx + vl * lx; craft.vz = vf * hz + vl * lz;
    // wind
    if (world && world.windAt) {
      world.windAt(craft.x, craft.z, tNow, windOut);
      const ws = craft.windScale;
      // the air mass itself drifts: a gust carries the craft sideways whatever the nose does, and dies away after it
      driftX += (windOut.x * ws - driftX / 1.6) * dt; driftZ += (windOut.z * ws - driftZ / 1.6) * dt;
      craft.vx += (windOut.wall || 0) * dt; craft.vy += (windOut.y || 0) * ws * dt;
    }

    craft.x += (craft.vx + driftX) * dt; craft.y += craft.vy * dt; craft.z += (craft.vz + driftZ) * dt;
    hitObstacles();
    if (crashed) return;

    // the ground
    ground = floorOf(craft.x, craft.z);
    if (craft.y <= ground) {
      const vDown = -craft.vy;
      speedH = Math.hypot(craft.vx, craft.vz);
      craft.y = ground;
      if (vDown >= 6 || speedH >= 10) { craft.speed = speedH; craft.altitude = 0; crash("ground"); return; }
      if (vDown <= 2.5 && speedH <= 4) {
        craft.grounded = true; driftX = 0; driftZ = 0;
        where.x = craft.x; where.y = craft.y; where.z = craft.z; where.inZone = !!(world && world.inLanding && world.inLanding(craft.x, craft.z));
        const v = craft.vy;
        craft.vy = 0;
        sfx("metalScrape", 0);
        if (craft.onLand) craft.onLand(v, where);
      } else {
        // too hard: a bounce that costs hull
        craft.vy = Math.max(1.2, vDown * 0.45); craft.vx *= 0.7; craft.vz *= 0.7;
        scrapeT = 0;
        scrape(Math.max(vDown, speedH), "ground");
        if (crashed) return;
      }
    }
    alt = craft.y - ground;
    craft.altitude = Math.max(0, alt);
    craft.speed = Math.hypot(craft.vx, craft.vz);
  }

  function update(dt, time) {
    tNow = time;
    const rpm = craft.rpm;
    rotAng += rpm * 39 * dt;
    rotor.rotation.y = rotAng; tailRotor.rotation.x = rotAng * 3.1;
    const blur = sm(0.55, 0.72, rpm);
    rotor.visible = rpm <= 0.66; tailRotor.visible = rpm <= 0.5;
    mainDisc.visible = blur > 0.01; tailDisc.visible = rpm > 0.3;
    mainDiscMat.uniforms.uOp.value = blur; mainDiscMat.uniforms.uAng.value = rotAng * 0.07;
    tailDiscMat.uniforms.uOp.value = sm(0.3, 0.55, rpm); tailDiscMat.uniforms.uAng.value = rotAng * 0.11;
    // a cough shakes the airframe
    const rough = craft.engineOn && !craft.grounded && rpm < 0.85 ? (0.85 - rpm) * 0.5 : 0;
    group.position.set(craft.x + Math.sin(time * 61) * rough * 0.06, craft.y + Math.sin(time * 47) * rough * 0.05 + (crashed ? 0 : Math.sin(time * 33) * 0.004 * rpm), craft.z);
    group.rotation.set(craft.pitch + Math.sin(time * 53) * rough * 0.03, craft.yaw, craft.roll);
    // sound and wash
    const h = ctx.audio && ctx.audio.heli;
    if (h && typeof h.set === "function") h.set(rpm, crashed ? 0 : load, 0);
    const ground = floorOf(craft.x, craft.z), alt = craft.y - ground;
    const wash = !crashed && rpm > 0.5 && alt < 7 ? (1 - alt / 7) * rpm : 0;
    if (wash > 0.03) vfx("rotorWash", craft.x, ground, craft.z, wash);
    if (Math.abs(wash - lastWash) > 0.06 || (wash === 0 && lastWash !== 0)) { lastWash = wash; sfx("rotorWash", wash); }
    const wl = crashed ? 0 : clamp(craft.speed / 26, 0, 1);
    if (Math.abs(wl - lastWind) > 0.05 || (wl === 0 && lastWind !== 0)) { lastWind = wl; sfx("wind", wl); }
  }

  const craft = {
    group, seat,
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, speed: 0, altitude: 0,
    rpm: 0, rpmLimit: 1, hull: 1, engineOn: false, grounded: true, locked: false, crashed: false,
    camDist: 10, camHeight: 1.3, camPitch: 0.26, camLag: 2.2,
    assist: 0.35, windScale: 1, radius: CRAFT_R,
    onCrash: null, onScrape: null, onLand: null,
    get load() { return load; }, get yawRate() { return yawRate; },
    place(x, y, z, yaw) {
      craft.x = x; craft.z = z; craft.yaw = yaw || 0;
      const g = floorOf(x, z);
      craft.y = Math.max(y === undefined ? g : y, g);
      craft.grounded = craft.y <= g + 0.12;
      if (craft.grounded) craft.y = g;
      craft.vx = craft.vy = craft.vz = 0; craft.pitch = 0; craft.roll = 0; yawRate = 0; craft.speed = 0; driftX = 0; driftZ = 0;
      craft.altitude = craft.y - g;
      update(0, tNow);
    },
    // already flying forward at that speed, rotor at full speed, trimmed for it
    launch(speed) {
      const v = speed || 0;
      craft.engineOn = true; craft.rpm = clamp(craft.rpmLimit, 0, 1);
      craft.vx = Math.sin(craft.yaw) * v; craft.vz = Math.cos(craft.yaw) * v; craft.vy = 0; craft.speed = v;
      craft.pitch = v > 0.5 ? Math.min(MAX_FWD, Math.atan((DRAG2 * v * v + DRAG1 * v) / G)) : 0;
      if (v > 0.5) craft.grounded = false;
      update(0, tNow);
    },
    startEngine() { craft.engineOn = true; return 3.0; },
    stopEngine() { craft.engineOn = false; },
    setWorld(w) { world = w || null; },
    control, update,
    crash(cause) { crash(cause || "shot"); },
    damage(amount, cause) { if (crashed) return; craft.hull = Math.max(0, craft.hull - amount); if (craft.hull <= 0) crash(cause || "shot"); },
    reset() {
      crashed = false; craft.crashed = false; craft.locked = false; craft.hull = 1; craft.rpm = 0; craft.rpmLimit = 1; craft.engineOn = false;
      craft.vx = craft.vy = craft.vz = 0; craft.pitch = 0; craft.roll = 0; yawRate = 0; craft.speed = 0; scrapeT = 0; smokeT = 0; load = 0.3; driftX = 0; driftZ = 0;
      craft.grounded = craft.y <= floorOf(craft.x, craft.z) + 0.12;
      if (lastWind !== 0) { lastWind = 0; sfx("wind", 0); }
      if (lastWash !== 0) { lastWash = 0; sfx("rotorWash", 0); }
      update(0, tNow);
    },
  };
  update(0, 0);
  return craft;
}

// ================================================================================================ the corridor
const Z_START = -100, Z_END = 1260, STRIP_LEN = 272, N_STRIP = 5, HALF_W = 70;
const WATER_Y = -11.5, POND_Y = -0.45;
const LANDING = { x: 15, y: 0, z: 1190, r: 16 };
const BRIDGE = { x: 0, z: 470, half: 7, top: -2.5, deck: 0.9, thick: 1.5 };
const POWER_Z = 210, STRING_Z = 22;
const TOWERS = [{ x: -26, z: 610 }, { x: 26, z: 610 }];
const ROCKS = [{ x: -28, z: 665, r: 12, h: 30 }, { x: 30, z: 715, r: 12, h: 30 }];
const LIGHTS = [{ x: -28, z: 300, phase: 0 }, { x: 28, z: 352, phase: Math.PI }];
const GUSTS = [{ z0: 575, z1: 650, dir: -1 }, { z0: 660, z1: 745, dir: 1 }]; // dir = sign of the push along x (from the left = toward -x)
const GATES = [
  [0, 10, 36], [0, 12, 82], [10, 13, 126], [0, 17, 172], [0, 21, 210], [-12, 21, 266], [10, 24, 330], [0, 22, 394],
  [0, 11, 440], [0, 9, 470], [0, 16, 540], [0, 32, 606], [18, 32, 662], [-16, 32, 714], [0, 31, 772], [8, 31, 880],
];
const EMERGENTS = [
  [-12, 830], [22, 868], [-7, 920], [15, 960], [-16, 1000], [9, 1040], [-9, 1076],
  [-40, 815], [44, 845], [-34, 890], [46, 930], [-44, 965], [40, 1010], [-38, 1050], [38, 1085], [52, 1130], [-30, 1130], [-22, 1215], [50, 1230],
];

const ENV_KEYS = [
  { z: 450, bg: 0x070b1a, fog: 0x0c1430, near: 60, far: 300, sky: 0x7388c0, gnd: 0x2e2a26, hemi: 0.95, sunC: 0xa9c1ff, sun: 0.6, dir: [0.42, 0.72, -0.36], zen: 0x05081a, hor: 0x16203c, stars: 1, sunK: 0 },
  { z: 650, bg: 0x1d2440, fog: 0x3a3552, near: 70, far: 308, sky: 0x8d98c8, gnd: 0x3a3230, hemi: 1.0, sunC: 0xd0bcd8, sun: 0.6, dir: [0.34, 0.6, 0.2], zen: 0x162148, hor: 0x5a4460, stars: 0.5, sunK: 0.35 },
  { z: 850, bg: 0xe8b090, fog: 0xe6b092, near: 85, far: 316, sky: 0xffdcc0, gnd: 0x4c4a38, hemi: 1.25, sunC: 0xffc890, sun: 1.65, dir: [0.12, 0.3, 1], zen: 0x5a80c2, hor: 0xf4b88c, stars: 0, sunK: 1 },
];

function terrain(x, z) {
  let h = 1.1 * Math.sin(x * 0.021 + 1.0) * Math.cos(z * 0.017) + 0.7 * Math.sin(z * 0.043 + x * 0.011);
  // the flat lot around the pad
  h *= sm(0, 30, Math.max(Math.abs(x) - 44, -z - 80, z - 26));
  // the river valley: a basin 12 m down with a channel along the flight line
  const v = sm(400, 438, z) * (1 - sm(502, 540, z));
  if (v > 0) h = lerp(h, -10.6 + 0.5 * Math.sin(x * 0.09 + z * 0.05) - 2.6 * (1 - sm(7, 12, Math.abs(x))), v);
  // the hills: a high valley between ridges
  const hm = sm(540, 595, z) * (1 - sm(715, 775, z));
  if (hm > 0) h += hm * (5 + 4 * Math.sin(x * 0.05 + z * 0.013) * Math.sin(z * 0.031 + 0.7) + 26 * sm(48, 98, Math.abs(x)));
  // the jungle floor, the clearing with its pond
  const jm = sm(760, 800, z);
  if (jm > 0) {
    h = lerp(h, 1.4 + 0.8 * Math.sin(x * 0.05) * Math.cos(z * 0.045), jm);
    const dc = Math.hypot(x - LANDING.x, z - LANDING.z);
    if (dc < 30) h = h * sm(15, 27, dc) - 1.1 * (1 - sm(0, 4.5, Math.abs(x - 29))) * (1 - sm(16, 28, dc)) * (1 - sm(22, 27, dc));
  }
  return h;
}
function canopyAt(x, z) {
  const jm = sm(772, 812, z);
  if (jm < 0.04) return -Infinity;
  if (Math.hypot(x - LANDING.x, z - LANDING.z) < 21) return -Infinity;
  return terrain(x, z) + jm * (17.5 + 2.5 * Math.sin(x * 0.07 + 1) * Math.cos(z * 0.05) + 1.2 * Math.sin(x * 0.19 + z * 0.23));
}
function waterAt(x, z) {
  if (z > 398 && z < 542) return WATER_Y;
  if (z > 1150 && z < 1230 && x > 22 && x < 36) return POND_Y;
  return -Infinity;
}
// what an aircraft comes down on: ground, water or the top of the canopy
function floorAt(x, z) {
  let h = terrain(x, z);
  const w = waterAt(x, z);
  if (w > h) h = w;
  const c = canopyAt(x, z);
  return c > h ? c : h;
}
function inLanding(x, z) { const dx = x - LANDING.x, dz = z - LANDING.z; return dx * dx + dz * dz < LANDING.r * LANDING.r; }

function buildFlightWorld(ctx, THREE) {
  const sfx = (name, a, b, c) => { const au = ctx.audio, f = au && au[name]; return typeof f === "function" ? f.call(au, a, b, c) : undefined; };
  const vfx = (name, a, b, c, d, e) => { const fx = ctx.fx, f = fx && fx[name]; return typeof f === "function" ? f.call(fx, a, b, c, d, e) : undefined; };
  const rnd = mulberry(7071);
  const group = new THREE.Group();
  group.name = "flight";
  const U = { uTime: { value: 0 } };

  // ---------------------------------------------------------------------------------------------- obstacles
  const obstacles = [];
  const upright = (kind, x, z, r, h, sink) => { const y = terrain(x, z) - (sink || 0); const o = { kind, x, y, z, r, h: h + (sink || 0), zMin: z - r, zMax: z + r }; obstacles.push(o); return o; };
  const segment = (kind, x, y, z, x2, y2, z2, r) => { const o = { kind, x, y, z, r, h: 0, x2, y2, z2, zMin: Math.min(z, z2) - r, zMax: Math.max(z, z2) + r }; obstacles.push(o); return o; };
  // the stand-in circus behind the pad, the lamp strings across the lane
  upright("rock", 0, -38, 15, 11.5);
  upright("pole", -5, -38, 0.4, 14.3); upright("pole", 5, -38, 0.4, 14.3);
  upright("pole", -30, STRING_Z, 0.3, 6.6); upright("pole", 30, STRING_Z, 0.3, 6.6);
  segment("wire", -30, 6, STRING_Z, 30, 6, STRING_Z, 0.2);
  // power lines: four pylons, three wires
  const PYLON_X = [-60, -20, 20, 60];
  for (let i = 0; i < 4; i++) upright("pole", PYLON_X[i], POWER_Z, 1.3, 14.5);
  for (let k = 0; k < 3; k++) segment("wire", -110, 11 + k, POWER_Z, 110, 11 + k, POWER_Z, 0.2);
  // the bridge: a wall across the valley with one arch
  segment("bridge", -130, BRIDGE.top + 2.1, BRIDGE.z, 130, BRIDGE.top + 2.1, BRIDGE.z, 1.9);
  for (let y = BRIDGE.top - 1.7; y > WATER_Y - 3; y -= 3.2) {
    segment("bridge", -130, y, BRIDGE.z, -BRIDGE.half - 1.9, y, BRIDGE.z, 1.9);
    segment("bridge", BRIDGE.half + 1.9, y, BRIDGE.z, 130, y, BRIDGE.z, 1.9);
  }
  // the haunches of the arch (it is an arch, not a doorway)
  segment("bridge", -BRIDGE.half, BRIDGE.top - 4.2, BRIDGE.z, -3.4, BRIDGE.top - 0.6, BRIDGE.z, 0.6);
  segment("bridge", BRIDGE.half, BRIDGE.top - 4.2, BRIDGE.z, 3.4, BRIDGE.top - 0.6, BRIDGE.z, 0.6);
  // radio towers with guy wires, rock shoulders
  const guys = [];
  for (let i = 0; i < 2; i++) {
    const t = TOWERS[i], s = t.x < 0 ? -1 : 1, o = upright("tower", t.x, t.z, 1.5, 46), top = o.y + 41;
    const A = [[t.x + s * 19, t.z], [t.x - s * 6, t.z - 17], [t.x - s * 6, t.z + 17]];
    for (let k = 0; k < 3; k++) { const gy = terrain(A[k][0], A[k][1]); segment("wire", t.x, top, t.z, A[k][0], gy, A[k][1], 0.2); guys.push(t.x, top, t.z, A[k][0], gy, A[k][1]); }
    t.y = o.y; t.h = 46;
  }
  for (let i = 0; i < ROCKS.length; i++) upright("rock", ROCKS[i].x, ROCKS[i].z, ROCKS[i].r, ROCKS[i].h, 3);
  // emergent giants above the canopy
  const emergents = [];
  for (let i = 0; i < EMERGENTS.length; i++) {
    const e = EMERGENTS[i], h = 34 + rnd() * 7;
    emergents.push({ x: e[0], z: e[1], h, r: 4.6, y: terrain(e[0], e[1]) });
    upright("tree", e[0], e[1], 4.6, h);
  }
  // field and hill trees (every drawn tree is also an obstacle)
  const gateX = (z) => {
    for (let i = 0; i < GATES.length - 1; i++) if (z <= GATES[i + 1][2]) { const a = GATES[i], b = GATES[i + 1]; return z <= a[2] ? a[0] : lerp(a[0], b[0], (z - a[2]) / (b[2] - a[2])); }
    return GATES[GATES.length - 1][0];
  };
  const trees = [];
  for (let z = 46; z < 760; z += 9) {
    if ((z > 196 && z < 226) || (z > 396 && z < 546)) continue;
    const hills = z > 560;
    const x = (rnd() * 2 - 1) * 105;
    if (Math.abs(x - gateX(z)) < (hills ? 26 : 16)) continue;
    let bad = false;
    for (let i = 0; i < 2; i++) { if (Math.hypot(x - TOWERS[i].x, z - TOWERS[i].z) < 24 || Math.hypot(x - ROCKS[i].x, z - ROCKS[i].z) < 16 || Math.hypot(x - LIGHTS[i].x, z - LIGHTS[i].z) < 8) bad = true; }
    if (bad) continue;
    const h = hills ? 9 + rnd() * 5 : 6.5 + rnd() * 4, r = hills ? 2.2 + rnd() : 2.6 + rnd() * 1.4;
    trees.push({ x, z, y: terrain(x, z), h, r, pine: hills, tint: rnd() });
    upright("tree", x, z, r * 0.85, h);
  }
  obstacles.sort((a, b) => a.zMin - b.zMin);

  const gates = GATES.map((g, i) => {
    const n = GATES[Math.min(GATES.length - 1, i + 1)], p = GATES[Math.max(0, i - 1)];
    return { x: g[0], y: g[1], z: g[2], yaw: Math.atan2(n[0] - p[0], n[2] - p[2]), r: i === 0 ? 6 : 7 };
  });
  const checkpoints = [
    { id: "pad", x: 0, y: 0.05, z: 0, yaw: 0, speed: 0 }, { id: "fields", x: 0, y: 14, z: 150, yaw: 0, speed: 14 },
    { id: "valley", x: 0, y: 20, z: 400, yaw: 0, speed: 16 }, { id: "jungle", x: 0, y: 30, z: 760, yaw: 0, speed: 16 },
  ];

  // ---------------------------------------------------------------------------------------------- sky
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: U.uTime, uStars: { value: 1 }, uSun: { value: 0 }, uZenith: { value: new THREE.Color(0x05081a) }, uHorizon: { value: new THREE.Color(0x16203c) },
      uGlow: { value: new THREE.Color(0xff9a50) }, uSunDir: { value: new THREE.Vector3(0.1, 0.07, 1).normalize() }, uMoonDir: { value: new THREE.Vector3(0.42, 0.72, -0.36).normalize() },
    },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(305, 28, 14), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  group.add(sky);

  // ---------------------------------------------------------------------------------------------- terrain strips
  const fieldCol = (x, z) => {
    const cx = Math.floor((x + 300) / 46), cz = Math.floor(z / 52), k = hash2(cx, cz);
    return k < 0.3 ? 0x5a6e38 : k < 0.55 ? 0x6f7a3c : k < 0.75 ? 0x8a8448 : k < 0.9 ? 0x4c6434 : 0x7a6a44;
  };
  function groundCol(x, z, h) {
    let c = fieldCol(x, z);
    // the lot, the lane, the two roads
    if (z < 30 && Math.abs(x) < 46 && z > -82) c = 0x5d5a42;
    if (Math.abs(z - (POWER_Z - 9)) < 4.5 || (z > 240 && z < 400 && Math.abs(x) < 5) || (z < 240 && z > 26 && Math.abs(x + 26) < 3)) c = 0x6a6258;
    const v = sm(400, 438, z) * (1 - sm(502, 540, z));
    if (v > 0.02) c = mixHex(c, h < WATER_Y + 0.8 ? 0x4a4a40 : 0x4f6238, Math.min(1, v * 1.4));
    const hm = sm(540, 595, z) * (1 - sm(715, 775, z));
    if (hm > 0.02) c = mixHex(c, mixHex(0x5a6a3c, 0x7a756c, sm(12, 30, h)), hm);
    const jm = sm(760, 800, z);
    if (jm > 0.02) c = mixHex(c, Math.hypot(x - LANDING.x, z - LANDING.z) < 24 ? 0x6c7a40 : 0x2a4424, jm);
    return mixHex(c, 0x202418, 0.12 * hash2(x * 0.37, z * 0.41));
  }
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const canopyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  const strips = [];
  const tc = new THREE.Color();
  for (let i = 0; i < N_STRIP; i++) {
    const z0 = Z_START + i * STRIP_LEN, zc = z0 + STRIP_LEN / 2;
    const g = new THREE.PlaneGeometry(440, STRIP_LEN, 44, 54).rotateX(-Math.PI / 2).translate(0, 0, zc);
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), z = p.getZ(k), h = terrain(x, z);
      p.setY(k, h);
      tc.set(groundCol(x, z, h));
      col[k * 3] = tc.r; col[k * 3 + 1] = tc.g; col[k * 3 + 2] = tc.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, terrainMat);
    m.receiveShadow = true; m.matrixAutoUpdate = false; m.frustumCulled = false;
    group.add(m);
    const strip = { z0, z1: z0 + STRIP_LEN, mesh: m, canopy: null };
    // the sea of canopy over the jungle strips: a bumpy faceted sheet
    if (z0 + STRIP_LEN > 772) {
      const cg = new THREE.PlaneGeometry(250, STRIP_LEN, 50, 54).rotateX(-Math.PI / 2).translate(0, 0, zc).toNonIndexed();
      const cp2 = cg.attributes.position, cc = new Float32Array(cp2.count * 3);
      for (let k = 0; k < cp2.count; k++) {
        const x = cp2.getX(k), z = cp2.getZ(k), c = canopyAt(x, z), n = hash2(x * 0.71, z * 0.53);
        cp2.setY(k, c === -Infinity ? terrain(x, z) - 3 : c - 0.4 + (n - 0.5) * 3.2);
        tc.set(mixHex(mixHex(0x2f5a2a, 0x4f7a34, n), 0x16301a, 0.5 * hash2(x * 0.13, z * 0.17)));
        cc[k * 3] = tc.r; cc[k * 3 + 1] = tc.g; cc[k * 3 + 2] = tc.b;
      }
      cg.setAttribute("color", new THREE.BufferAttribute(cc, 3));
      cg.computeVertexNormals();
      const cm = new THREE.Mesh(cg, canopyMat);
      cm.matrixAutoUpdate = false; cm.frustumCulled = false;
      group.add(cm);
      strip.canopy = cm;
    }
    strips.push(strip);
  }
  // water: the valley river and the clearing's pond
  const waterMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uCol: { value: new THREE.Color(0x1c2c3a) }, uSky: { value: new THREE.Color(0x3a4a6a) } },
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, fog: false,
  });
  {
    const pos = [], quad = (x0, x1, z0, z1, y) => pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
    quad(-16, 16, 400, 540, WATER_Y); quad(21, 37, 1150, 1230, POND_Y);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    const m = new THREE.Mesh(g, waterMat);
    m.matrixAutoUpdate = false; m.frustumCulled = false;
    group.add(m);
  }

  // ---------------------------------------------------------------------------------------------- baked props
  const P = createBaker(THREE);
  const RED = 0xb3261e, CREAM = 0xeadfc4, GOLD = 0xd8a93a, WOOD = 0x6b5038, IRON = 0x4a4c52, STONE = 0x8a857a, LEAF = 0x2f5a2a;
  const lights = []; // x, y, z, size, hex
  const wires = [];
  const ico = new THREE.IcosahedronGeometry(0.5, 1);
  // the pad and the stand-in circus (flight z = circus z - 46)
  P.cyl(0x7d7f80, 0, 0.02, 0, 5.3, 5.3, 0.06, 28).box(0xf2efe6, -1.3, 0.06, 0, 0.5, 0.02, 4).box(0xf2efe6, 1.3, 0.06, 0, 0.5, 0.02, 4).box(0xf2efe6, 0, 0.06, 0, 2.6, 0.02, 0.5);
  for (let i = 0; i < 4; i++) { const x = i & 1 ? 4.3 : -4.3, z = i & 2 ? 4.3 : -4.3; P.cyl(IRON, x, 0.22, z, 0.06, 0.1, 0.44, 6); lights.push(x, 0.52, z, 0.2, 0xffb040); }
  P.box(WOOD, 0, 1.05, -76, 80, 2.1, 0.1).box(WOOD, -40, 1.05, -35, 0.1, 2.1, 82).box(WOOD, 40, 1.05, -35, 0.1, 2.1, 82).box(WOOD, -22, 1.05, 6, 36, 2.1, 0.1).box(WOOD, 22, 1.05, 6, 36, 2.1, 0.1).box(WOOD, -20.8, 1.05, -7, 38.4, 2.1, 0.1).box(WOOD, 20.8, 1.05, -7, 38.4, 2.1, 0.1);
  {
    // the big top from above: striped roof and wall, two king poles with pennants
    const cx = 0, cz = -38, R = 17, NG = 28, a = [0, 0, 0], bb = [0, 0, 0], c = [0, 0, 0], d = [0, 0, 0];
    const rp = (th, t, o) => { const ex = cx + Math.cos(th) * R, ez = cz + Math.sin(th) * R, ax = clamp(ex, -5, 5); o[0] = lerp(ex, ax, t); o[1] = lerp(3.6, 13.2, t) - 1.25 * Math.sin(Math.PI * t) + 0.55 * Math.exp(-((t - 0.36) * (t - 0.36)) / 0.012); o[2] = lerp(ez, cz, t); return o; };
    P.base(0, 0, 0, 0);
    for (let i = 0; i < NG; i++) {
      const th0 = (i / NG) * TAU, th1 = ((i + 1) / NG) * TAU, hex = i % 2 ? CREAM : RED, om = (th0 + th1) / 2;
      for (let k = 0; k < 6; k++) { rp(th0, k / 6, a); rp(th1, k / 6, bb); rp(th1, (k + 1) / 6, c); rp(th0, (k + 1) / 6, d); P.quad(a[0], a[1], a[2], bb[0], bb[1], bb[2], c[0], c[1], c[2], d[0], d[1], d[2], hex, Math.cos(om) * 0.3, 1, Math.sin(om) * 0.3); }
      rp(th0, 0, a); rp(th1, 0, bb);
      P.quad(a[0], 0, a[2], bb[0], 0, bb[2], bb[0], 3.6, bb[2], a[0], 3.6, a[2], i % 2 ? RED : CREAM, Math.cos(om), 0, Math.sin(om));
      if (i % 2 === 0) lights.push(cx + Math.cos(th0) * (R + 0.2), 3.7, cz + Math.sin(th0) * (R + 0.2), 0.22, 0xffd9a0);
    }
    for (let s = -1; s <= 1; s += 2) {
      P.cyl(0xe8e0cc, s * 5, 7.15, cz, 0.14, 0.19, 14.3, 8);
      P.tri(s * 5, 14.3, cz, s * 5 + 1.8, 14.0, cz + 0.3, s * 5, 13.6, cz, RED); P.tri(s * 5, 14.3, cz, s * 5, 13.6, cz, s * 5 + 1.8, 14.0, cz + 0.3, RED);
      lights.push(s * 5, 14.5, cz, 0.3, 0xffd9a0);
    }
    // wagons, stalls, the truck: blocks of colour with a lit window here and there
    const W = [[-20, -66.4], [-12.5, -66.5], [-5.5, -66.3], [-23, -61.8], [-15.5, -61.6], [-8, -61.7], [12, -15], [-30, -66]];
    const WC = [0x8e1f1c, 0x1e4d6b, 0x27543a, 0x1e4d6b, 0x8e1f1c, 0xb0792a, 0x6a2a6e, 0x7a1a18];
    for (let i = 0; i < W.length; i++) { P.box(WC[i], W[i][0], 1.9, W[i][1], i === 7 ? 3.2 : 4.9, 2.2, 2.1).box(0x2a2a30, W[i][0], 3.1, W[i][1], i === 7 ? 3.4 : 5.1, 0.14, 2.4); if (i % 3 === 1) lights.push(W[i][0] + 2.5, 2.2, W[i][1], 0.3, 0xffc070); }
    for (let i = 0; i < 4; i++) { P.box([0x1e4d6b, 0x8e1f1c, 0x27543a, 0xb0792a][i], 34, 1.4, -60 + i * 10, 2.3, 2.8, 3.3); lights.push(32.6, 2.4, -60 + i * 10, 0.28, 0xffd9a0); }
    P.box(0x3f5a3a, -12, 1.5, -11.2, 2.2, 1.6, 1.6).box(0x8a8468, -12, 1.9, -14, 2.3, 1.8, 3.9);
    P.box(0x8e1f1c, 22, 1.15, -52, 1.8, 2.3, 1.8).cyl(0x27543a, 22, 2.75, -52, 0.08, 1.6, 0.9, 4, 0, Math.PI / 4);
    // lantern-carrying guards are the level's; a few lamp posts glow
    const LP = [[0, -58], [27, -58], [27, -42], [0, -13], [-3.6, -8.4], [3.6, -8.4]];
    for (let i = 0; i < LP.length; i++) { P.cyl(IRON, LP[i][0], 2.1, LP[i][1], 0.05, 0.08, 4.2, 5); lights.push(LP[i][0], 4.25, LP[i][1], 0.45, 0xffd9a0); }
  }
  // the lamp strings across the lane at z 22
  P.cyl(WOOD, -30, 3.3, STRING_Z, 0.1, 0.14, 6.6, 6).cyl(WOOD, 30, 3.3, STRING_Z, 0.1, 0.14, 6.6, 6);
  for (let i = 0; i < 30; i++) {
    const x0 = -30 + i * 2, x1 = x0 + 2, s0 = 4 * (i / 30) * (1 - i / 30), s1 = 4 * ((i + 1) / 30) * (1 - (i + 1) / 30);
    wires.push(x0, 6.3 - s0 * 0.5, STRING_Z, x1, 6.3 - s1 * 0.5, STRING_Z);
    lights.push(x0 + 1, 6.18 - (s0 + s1) * 0.25, STRING_Z, 0.3, [0xffd9a0, 0xff6a4a, 0xffc040, 0x7fd0ff][i % 4]);
  }
  // hedgerows and a farmhouse in the fields
  for (let z = 60; z < 400; z += 52) {
    if (Math.abs(z - POWER_Z) < 30) continue;
    for (let x = -100; x < 100; x += 6) { if (Math.abs(x + 26) < 5 || hash2(x, z) < 0.18) continue; P.base(x + 3, terrain(x + 3, z), z, 0).box(0x2c4a26, 0, 0.9, 0, 6.2, 1.8 + hash2(z, x) * 0.6, 1.4); }
  }
  {
    const x = 48, z = 118, y = terrain(x, z);
    P.base(x, y, z, 0.4).box(0xb8b0a0, 0, 1.6, 0, 9, 3.2, 6);
    P.quad(-4.7, 3.2, -3.2, 4.7, 3.2, -3.2, 4.7, 5.2, 0, -4.7, 5.2, 0, 0x6a3a2a, 0, 1, -1); P.quad(-4.7, 3.2, 3.2, 4.7, 3.2, 3.2, 4.7, 5.2, 0, -4.7, 5.2, 0, 0x6a3a2a, 0, 1, 1);
    P.box(0x8a3a2a, 2.5, 5.0, 1, 0.8, 1.6, 0.8).base(x - 9, terrain(x - 9, z + 9), z + 9, 0.4).box(0x7a2a22, 0, 2.2, 0, 7, 4.4, 10);
    lights.push(x - 3.6, y + 1.7, z - 1.6, 0.4, 0xffc070, x - 2.4, y + 1.7, z - 3.9, 0.4, 0xffc070);
  }
  // pylons
  for (let i = 0; i < 4; i++) {
    const x = PYLON_X[i], y = terrain(x, POWER_Z);
    P.base(x, y, POWER_Z, 0);
    for (let k = 0; k < 4; k++) { const sx = k & 1 ? 1 : -1, sz = k & 2 ? 1 : -1; P.beam(IRON, sx * 1.5, 0, sz * 1.5, sx * 0.35, 14.5, sz * 0.35, 0.07, 4).beam(IRON, sx * 1.5, 0, sz * 1.5, -sx * 0.9, 7, sz * 0.9, 0.04, 4).beam(IRON, sx * 0.9, 7, sz * 0.9, -sx * 0.35, 14.5, sz * 0.35, 0.04, 4); }
    for (let k = 0; k < 3; k++) P.box(IRON, 0, 11.2 + k * 1.0 - y, 0, 0.14, 0.14, 5.5 - k * 0.8);
    lights.push(x, y + 14.8, POWER_Z, 0.35, 0xff3020);
  }
  for (let k = 0; k < 3; k++) {
    for (let s = -110; s < 110; s += 10) {
      const sag = (x) => { let n = -110; for (let i = 0; i < 4; i++) if (Math.abs(x - PYLON_X[i]) < Math.abs(x - n)) n = PYLON_X[i]; return 0.45 * (1 - Math.cos(((x - n) / 40) * TAU)) * 0.5; };
      wires.push(s, 11.15 + k - sag(s), POWER_Z, s + 10, 11.15 + k - sag(s + 10), POWER_Z);
    }
  }
  // the checkpoint on the road: two searchlight trucks, a hut and a barrier
  for (let i = 0; i < 2; i++) {
    const l = LIGHTS[i], y = terrain(l.x, l.z);
    P.base(l.x, y, l.z, 0).box(0x3f4a3a, 0, 1.0, 0, 2.4, 1.4, 4.6).box(0x2a302a, 0, 2.0, 1.4, 2.2, 1.0, 1.6).cyl(0x2a2a2e, 0, 2.5, -0.8, 0.9, 0.7, 1.0, 10);
    lights.push(l.x, y + 3.1, l.z - 0.8, 0.9, 0xdfeaff);
    l.y = y + 3.0;
  }
  P.base(6, terrain(6, 326), 326, 0).box(0x6a6a5a, 0, 1.3, 0, 3, 2.6, 3).box(0x3a3a34, 0, 2.7, 0, 3.4, 0.2, 3.4).box(0xc4352a, -5, 1.0, 2.2, 8, 0.14, 0.14);
  lights.push(4.4, terrain(6, 326) + 1.6, 326, 0.35, 0xffc070);
  // the stone bridge: deck, parapets, the great arch and blind arches
  {
    const z = BRIDGE.z, t = BRIDGE.thick;
    P.base(0, 0, 0, 0);
    P.box(STONE, 0, BRIDGE.deck - 0.5, z, 264, 1.0, t * 2 + 0.6).box(0x9a958a, 0, BRIDGE.deck + 0.45, z - t - 0.1, 264, 0.9, 0.35).box(0x9a958a, 0, BRIDGE.deck + 0.45, z + t + 0.1, 264, 0.9, 0.35);
    for (let s = -1; s <= 1; s += 2) {
      P.box(STONE, s * (BRIDGE.half + 61.5), (BRIDGE.deck - 1 - 14.5) / 2, z, 123, BRIDGE.deck - 1 + 14.5, t * 2);
      P.box(0x7a756c, s * (BRIDGE.half + 1.2), -6.5, z, 2.4, 15, t * 2 + 0.8);
      for (let k = 1; k < 5; k++) P.box(0x6a665e, s * (BRIDGE.half + 4 + k * 22), -7.8, z, 9, 9, t * 2 + 0.2).cyl(0x6a665e, s * (BRIDGE.half + 4 + k * 22), -3.3, z, 4.5, 4.5, t * 2 + 0.2, 12, Math.PI / 2);
    }
    // the arch ring over the opening
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI, a1 = ((i + 1) / 12) * Math.PI, R0 = BRIDGE.half, yc = BRIDGE.top - 4.2, ry = 4.2;
      const x0 = Math.cos(a0) * R0, y0 = yc + Math.sin(a0) * ry, x1 = Math.cos(a1) * R0, y1 = yc + Math.sin(a1) * ry;
      P.beam(0xa8a296, x0, y0, z - t - 0.1, x1, y1, z - t - 0.1, 0.4, 4).beam(0xa8a296, x0, y0, z + t + 0.1, x1, y1, z + t + 0.1, 0.4, 4);
      // fill between the arch and the deck
      const xm = (x0 + x1) / 2, ym = Math.max(y0, y1);
      P.box(STONE, xm, (ym + BRIDGE.deck - 1) / 2, z, Math.abs(x1 - x0) + 0.02, BRIDGE.deck - 1 - ym, t * 2);
    }
    for (let x = -120; x <= 120; x += 30) lights.push(x, BRIDGE.deck + 1.6, z, 0.3, 0xffc070);
  }
  // radio towers
  for (let i = 0; i < 2; i++) {
    const t = TOWERS[i];
    P.base(t.x, t.y, t.z, 0);
    for (let k = 0; k < 4; k++) { const sx = k & 1 ? 1 : -1, sz = k & 2 ? 1 : -1; P.beam(k % 2 ? RED : 0xe8e8e8, sx * 1.2, 0, sz * 1.2, sx * 0.4, 44, sz * 0.4, 0.09, 4); }
    for (let k = 0; k < 11; k++) { const y0 = k * 4, w0 = lerp(1.2, 0.4, y0 / 44), w1 = lerp(1.2, 0.4, (y0 + 4) / 44), c = k % 2 ? RED : 0xe8e8e8; P.beam(c, -w0, y0, -w0, w1, y0 + 4, -w1, 0.04, 4).beam(c, w0, y0, w0, -w1, y0 + 4, w1, 0.04, 4).beam(c, w0, y0, -w0, -w1, y0 + 4, -w1, 0.04, 4).beam(c, -w0, y0, w0, w1, y0 + 4, w1, 0.04, 4); }
    P.cyl(IRON, 0, 45, 0, 0.05, 0.1, 2.4, 5);
    lights.push(t.x, t.y + 46.3, t.z, 0.6, 0xff3020, t.x, t.y + 24, t.z, 0.45, 0xff3020);
  }
  for (let i = 0; i < guys.length; i += 6) wires.push(guys[i], guys[i + 1], guys[i + 2], guys[i + 3], guys[i + 4], guys[i + 5]);
  // rock shoulders
  P.ao = 0.4;
  for (let i = 0; i < ROCKS.length; i++) {
    const r = ROCKS[i], y = terrain(r.x, r.z);
    P.base(r.x, y, r.z, i * 1.3);
    P.xf(0, r.h * 0.42, 0, r.r * 2.0, r.h * 1.15, r.r * 1.9, 0.3, 0.06, 0.05).add(ico, 0x77726a);
    P.xf(r.r * 0.6, r.h * 0.2, r.r * 0.5, r.r * 1.3, r.h * 0.7, r.r * 1.2, 1, 0.1, -0.08).add(ico, 0x6a665e);
    P.xf(-r.r * 0.7, r.h * 0.12, -r.r * 0.3, r.r * 1.1, r.h * 0.45, r.r * 1.2, 2, 0, 0.1).add(ico, 0x827c72);
  }
  // emergent giants
  for (let i = 0; i < emergents.length; i++) {
    const e = emergents[i];
    P.base(e.x, e.y, e.z, i * 0.9);
    P.ao = 0.25;
    P.cyl(0x5a4634, 0, e.h * 0.42, 0, 0.7, 1.3, e.h * 0.84, 7);
    P.ao = 0.5;
    P.xf(0, e.h - 4, 0, 13.5, 8.5, 13.5, 0, 0, 0).add(ico, mixHex(LEAF, 0x4f7a34, hash2(i, 3)));
    P.xf(3.2, e.h - 7.5, 2.4, 8, 5.5, 8, 1, 0, 0).add(ico, 0x3a6a2e).xf(-3.4, e.h - 6.8, -2, 8.5, 5, 8, 2, 0, 0).add(ico, 0x2a5226);
  }
  P.ao = 0.25;
  // a ring of trees round the clearing so that it reads from the air
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU, x = LANDING.x + Math.cos(a) * 23.5, z = LANDING.z + Math.sin(a) * 23.5, y = terrain(x, z);
    P.base(x, y, z, a).cyl(0x5a4634, 0, 8, 0, 0.4, 0.7, 16, 6);
  }
  const propsMesh = new THREE.Mesh(P.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  propsMesh.castShadow = false; propsMesh.receiveShadow = true; propsMesh.matrixAutoUpdate = false; propsMesh.frustumCulled = false;
  group.add(propsMesh);
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(wires), 3));
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1a1a1e }));
    m.matrixAutoUpdate = false; m.frustumCulled = false;
    group.add(m);
  }

  // ---------------------------------------------------------------------------------------------- instanced scenery in z-buckets
  const dummy = new THREE.Object3D(), ic = new THREE.Color();
  const BUCKET = 340, buckets = [];
  // items: [{ z, ... }]; place(item, dummy) -> hex tint
  function bucketed(geo, mat, items, place) {
    for (let z0 = Z_START; z0 < Z_END; z0 += BUCKET) {
      const list = items.filter((it) => it.z >= z0 && it.z < z0 + BUCKET);
      if (!list.length) continue;
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      for (let i = 0; i < list.length; i++) {
        dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
        const hex = place(list[i], dummy);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        m.setColorAt(i, ic.set(hex));
      }
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.frustumCulled = false; m.matrixAutoUpdate = false;
      group.add(m);
      buckets.push({ z0, z1: z0 + BUCKET, mesh: m });
    }
  }
  const flatMat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true });
  const trunkGeo = new THREE.CylinderGeometry(0.6, 1, 1, 6, 1, true).translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const pineGeo = new THREE.ConeGeometry(1, 1, 7, 2, false).translate(0, 0.5, 0);
  bucketed(trunkGeo, flatMat, trees, (t, d) => { d.position.set(t.x, t.y - 0.3, t.z); d.scale.set(0.32, t.h * 0.62, 0.32); return 0x5a4634; });
  bucketed(crownGeo, flatMat, trees.filter((t) => !t.pine), (t, d) => { d.position.set(t.x, t.y + t.h - t.r * 0.8, t.z); d.rotation.set(0, t.tint * 6, 0); d.scale.set(t.r, t.r * 0.85, t.r); return mixHex(0x3a6a2e, 0x6a8a3a, t.tint); });
  bucketed(pineGeo, flatMat, trees.filter((t) => t.pine), (t, d) => { d.position.set(t.x, t.y + t.h * 0.22, t.z); d.rotation.set(0, t.tint * 6, 0); d.scale.set(t.r, t.h * 0.8, t.r); return mixHex(0x24482c, 0x3a5a34, t.tint); });
  // rounded crowns riding on the canopy sheet
  {
    const clumps = [];
    for (let i = 0; i < 230; i++) {
      const x = (rnd() * 2 - 1) * 115, z = 790 + rnd() * 465, c = canopyAt(x, z);
      if (c === -Infinity) continue;
      clumps.push({ x, z, y: c, s: 5 + rnd() * 4.5, tint: rnd() });
    }
    bucketed(crownGeo, flatMat, clumps, (t, d) => { d.position.set(t.x, t.y - t.s * 0.35, t.z); d.rotation.set(0, t.tint * 6, 0); d.scale.set(t.s, t.s * 0.62, t.s); return mixHex(0x2f5a2a, 0x5a8236, t.tint); });
  }
  // lights: one InstancedMesh of small glowing octahedra
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  {
    const n = lights.length / 5, m = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5, 1), lightMat, n);
    for (let i = 0; i < n; i++) {
      dummy.position.set(lights[i * 5], lights[i * 5 + 1], lights[i * 5 + 2]); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(lights[i * 5 + 3]); dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, ic.set(lights[i * 5 + 4]));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false; m.matrixAutoUpdate = false;
    group.add(m);
  }
  // searchlight beams (two instances of one additive cone) and mist cards
  const beamMat = new THREE.ShaderMaterial({ uniforms: { uLevel: { value: 1 } }, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const beamMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 20, 1, true).translate(0, -0.5, 0), beamMat, 2);
  beamMesh.frustumCulled = false; beamMesh.renderOrder = 3;
  beamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(beamMesh);
  const mistMat = new THREE.ShaderMaterial({ uniforms: { uTime: U.uTime, uOp: { value: 0.16 }, uCol: { value: new THREE.Color(0x9fb2d6) } }, vertexShader: MIST_VERT, fragmentShader: MIST_FRAG, transparent: true, depthWrite: false, fog: false });
  {
    const M = [[0, WATER_Y + 1.5, 425, 60, 22], [-30, WATER_Y + 2.2, 455, 70, 20], [35, WATER_Y + 2, 490, 70, 24], [0, WATER_Y + 1.2, 515, 60, 20], [-60, WATER_Y + 2.5, 500, 60, 24], [60, WATER_Y + 2.4, 440, 60, 22],
      [-30, 21, 840, 80, 30], [40, 22, 930, 90, 34], [-45, 21.5, 1030, 90, 30], [30, 6, 1190, 40, 26], [-10, 22, 1120, 80, 30]];
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), mistMat, M.length);
    for (let i = 0; i < M.length; i++) { dummy.position.set(M[i][0], M[i][1], M[i][2]); dummy.rotation.set(0, 0, 0); dummy.scale.set(M[i][3], 1, M[i][4]); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); }
    m.frustumCulled = false; m.renderOrder = 2; m.matrixAutoUpdate = false;
    group.add(m);
  }

  // ---------------------------------------------------------------------------------------------- searchlights
  const vA = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0);
  let clock = 0;
  const searchlights = LIGHTS.map((l) => {
    const s = {
      x: l.x, z: l.z, y: l.y, bx: 0, bz: l.z, r: 9, phase: l.phase, ceiling: 30,
      // a craft is caught when it is inside the beam's circle and less than 30 m above the ground
      inBeam(x, y, z) { const dx = x - s.bx, dz = z - s.bz; return dx * dx + dz * dz < s.r * s.r && y - terrain(x, z) < s.ceiling; },
    };
    return s;
  });
  function moveLights() {
    for (let i = 0; i < 2; i++) {
      const s = searchlights[i], a = (clock * TAU) / 7 + s.phase;
      s.bx = 36 * Math.sin(a); s.bz = s.z + 12 * Math.sin(a * 2) * 0.5;
      const ty = terrain(s.bx, s.bz) + 34;
      vA.set(s.bx - s.x, ty - s.y, s.bz - s.z);
      const len = vA.length();
      dummy.position.set(s.x, s.y, s.z);
      dummy.quaternion.setFromUnitVectors(DOWN, vA.divideScalar(len));
      dummy.scale.set(s.r * 1.05, len, s.r * 1.05); dummy.updateMatrix();
      beamMesh.setMatrixAt(i, dummy.matrix);
    }
    beamMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------------------------- wind
  const gust = { zone: -1, t: 0, push: 0, dir: 0, phase: "none" }; // phase: "none" | "warn" | "push" | "rest"
  function stepGusts(dt, fz) {
    let zi = -1;
    for (let i = 0; i < GUSTS.length; i++) if (fz >= GUSTS[i].z0 && fz <= GUSTS[i].z1) zi = i;
    if (zi !== gust.zone) {
      gust.zone = zi; gust.t = 0; gust.push = 0;
      if (zi < 0) { if (gust.phase !== "none") vfx("windStreaks", false, 0, 0, 0); gust.phase = "none"; return; }
      gust.phase = "none";
    }
    if (zi < 0) return;
    const g = GUSTS[zi];
    gust.dir = g.dir;
    gust.t += dt;
    const c = gust.t % 5;
    const ph = c < 1.5 ? "warn" : c < 3.5 ? "push" : "rest";
    if (ph !== gust.phase) {
      gust.phase = ph;
      if (ph === "warn") { vfx("windStreaks", true, g.dir, 0, 0.85); sfx("gust", 0.85, g.dir); }
      else if (ph === "rest") vfx("windStreaks", false, 0, 0, 0);
    }
    gust.push = ph === "push" ? g.dir * 3 * Math.min(1, (c - 1.5) / 0.3, (3.5 - c) / 0.3) : 0;
  }
  function windAt(x, z, time, out) {
    out.x = 0; out.y = 0; out.z = 0; out.wall = 0;
    if (z > 40) out.x = 0.3 * Math.sin(time * 0.37 + z * 0.011);
    if (z > 800) { out.x += 0.45 * Math.sin(time * 0.9 + z * 0.05); out.y = 0.35 * Math.sin(time * 1.3 + x * 0.07); }
    if (gust.zone >= 0 && z >= GUSTS[gust.zone].z0 - 5 && z <= GUSTS[gust.zone].z1 + 5) out.x += gust.push;
    // the soft walls of the corridor: a steady wind that pushes back in (not scaled by the assist)
    const ax = Math.abs(x);
    if (ax > HALF_W) out.wall = -(x < 0 ? -1 : 1) * Math.min(12, 3 + 0.5 * (ax - HALF_W));
    return out;
  }

  // ---------------------------------------------------------------------------------------------- the cockpit warning
  function inArch(x, y, z) { return Math.abs(z - BRIDGE.z) < 3.5 && Math.abs(x - BRIDGE.x) < BRIDGE.half && y + CRAFT_CY < BRIDGE.top; }
  function warning(c) {
    if (!c || c.crashed) return null;
    const x = c.x, y = c.y, z = c.z;
    if (Math.abs(x) > HALF_W) return "TURN BACK";
    if (z > 240 && z < 420 && (searchlights[0].inBeam(x, y, z) || searchlights[1].inBeam(x, y, z))) return "SEARCHLIGHT";
    // wires ahead, at a height that would meet them
    if (z > -6 && z < STRING_Z + 2 && y > 2.2 && y < 8.4 && c.vz > -1) return "WIRES";
    if (z > 170 && z < POWER_Z + 2 && y > 7.4 && y < 15.2) return "WIRES";
    if (z > 565 && z < 628 && y < 50 && Math.abs(x) > 15 && Math.abs(x) < 47) return "WIRES";
    const landing = z > 1080;
    if (!c.grounded) {
      const alt = c.altitude;
      if (landing && alt < 14 && (c.speed > 9 || c.vy < -4.5)) return "TOO FAST";
      // sinking into the ground, or the ground rising ahead
      if ((c.vy < -2.5 && alt + c.vy * 2.2 < 0) || (alt > 0.5 && c.speed > 4 && floorAt(x + c.vx * 2, z + c.vz * 2) > y - 1.5 && !(landing && inLanding(x + c.vx * 2, z + c.vz * 2)))) return "PULL UP";
    }
    if (z > 1000 && !c.grounded) return "LAND HERE";
    return null;
  }

  // ---------------------------------------------------------------------------------------------- night into dawn
  const envNow = { background: 0, fog: [0, 60, 300], hemi: [0, 0, 1], sun: [0, 1], sunDir: [0, 1, 0], far: 320, dark: true };
  let lastK = -1, dawn = 0;
  const cA = new THREE.Color(), cB = new THREE.Color();
  function setEnvAt(fz, force) {
    const K = ENV_KEYS;
    const kk = fz <= K[0].z ? 0 : fz >= K[2].z ? 2 : fz < K[1].z ? (fz - K[0].z) / (K[1].z - K[0].z) : 1 + (fz - K[1].z) / (K[2].z - K[1].z);
    if (!force && Math.abs(kk - lastK) < 0.004) return;
    lastK = kk;
    const a = K[Math.min(1, Math.floor(kk))], b = K[Math.min(1, Math.floor(kk)) + 1], t = kk - Math.min(1, Math.floor(kk));
    envNow.background = mixHex(a.bg, b.bg, t);
    envNow.fog[0] = mixHex(a.fog, b.fog, t); envNow.fog[1] = lerp(a.near, b.near, t); envNow.fog[2] = lerp(a.far, b.far, t);
    envNow.hemi[0] = mixHex(a.sky, b.sky, t); envNow.hemi[1] = mixHex(a.gnd, b.gnd, t); envNow.hemi[2] = lerp(a.hemi, b.hemi, t);
    envNow.sun[0] = mixHex(a.sunC, b.sunC, t); envNow.sun[1] = lerp(a.sun, b.sun, t);
    for (let i = 0; i < 3; i++) envNow.sunDir[i] = lerp(a.dir[i], b.dir[i], t);
    envNow.dark = kk < 1.6;
    dawn = lerp(a.sunK, b.sunK, t);
    const u = skyMat.uniforms;
    u.uZenith.value.copy(cA.set(a.zen)).lerp(cB.set(b.zen), t);
    u.uHorizon.value.copy(cA.set(a.hor)).lerp(cB.set(b.hor), t);
    u.uStars.value = lerp(a.stars, b.stars, t); u.uSun.value = dawn;
    waterMat.uniforms.uSky.value.copy(u.uHorizon.value).lerp(u.uZenith.value, 0.35);
    mistMat.uniforms.uCol.value.copy(cA.set(0x9fb2d6)).lerp(cB.set(0xffe2c8), dawn);
    mistMat.uniforms.uOp.value = 0.14 + 0.1 * dawn;
    lightMat.color.setScalar(1 - 0.7 * dawn);
    beamMat.uniforms.uLevel.value = 1 - 0.6 * dawn;
    if (ctx.world === world && ctx.setEnv) ctx.setEnv(envNow, 0);
  }

  // ---------------------------------------------------------------------------------------------- update
  function update(dt, time, fx, fz) {
    U.uTime.value = time;
    clock += dt;
    if (fx === undefined) { fx = 0; fz = 0; }
    for (let i = 0; i < strips.length; i++) {
      const s = strips[i], on = s.z1 > fz - 70 && s.z0 < fz + 325;
      s.mesh.visible = on;
      if (s.canopy) s.canopy.visible = on;
    }
    for (let i = 0; i < buckets.length; i++) { const b = buckets[i]; b.mesh.visible = b.z1 > fz - 70 && b.z0 < fz + 325; }
    sky.position.set(fx, 0, fz);
    beamMesh.visible = fz > -40 && fz < 700;
    if (beamMesh.visible) moveLights();
    stepGusts(dt, fz);
    setEnvAt(fz, false);
  }
  function reset() {
    clock = 0;
    if (gust.phase !== "none") vfx("windStreaks", false, 0, 0, 0);
    gust.zone = -1; gust.t = 0; gust.push = 0; gust.phase = "none";
    lastK = -1;
    moveLights();
  }

  const world = {
    name: "flight", group, env: envNow, maxStep: 0.6,
    heightAt: terrain, floorAt, canopyAt, waterLevelAt: waterAt, surfaceAt(x, z) { return x * x + z * z < 28 ? "concrete" : z > 790 ? "leaves" : "grass"; },
    sight() { return true; }, hidden() { return false; }, lit() { return 0.5; }, cover: [], colliders: [],
    obstacles, windAt, warning, update, reset,
    gates, checkpoints, searchlights, gust, gustZones: GUSTS,
    landing: LANDING, inLanding, bridge: BRIDGE, inArch, halfWidth: HALF_W, length: Z_END,
    resetLights() { clock = 0; moveLights(); },
    P: {
      pad: pt(0, 0.05, 0, 0), landing: pt(LANDING.x, 0, LANDING.z, 0),
      camTakeoff: camPair(9.5, 2.4, -7.5, 0, 2.2, 0.5),
      camFlyby1: camPair(-34, 5, 226, 0, 13, 204),
      camDawn: camPair(32, 36, 800, 0, 30, 870),
    },
    routes: {},
    onEnter() { lastK = -1; },
    onFootstep(wx, wz, strength, footIndex, wet, pan) { sfx("step", world.surfaceAt(wx, wz), strength, pan); },
    onLand(x, z, floorY, impact) { sfx("step", world.surfaceAt(x, z), 0.75 + 0.5 * impact, 0); },
  };
  setEnvAt(0, true);
  moveLights();
  update(0, 0, 0, 0);
  return world;
}

// ================================================================================================ the module
export function createHeli(ctx) {
  const THREE = ctx.THREE;
  const world = buildFlightWorld(ctx, THREE);
  const craft = buildCraft(ctx, THREE);
  craft.setWorld(world);
  return {
    craft, world, group: craft.group,
    update(dt, time) { craft.update(dt, time); },
    reset() { craft.reset(); world.reset(); },
  };
}
