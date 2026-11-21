// lair.js - the lava cavern (level 5, part D/E). LEVELS.md B6.
//
// A vast dark basalt cavern over a lake of flowing lava. Everything is lit "from below" without real
// lights: every rock / iron material gets an emissive term that depends on its world height above the
// lava and on how much its (normal-mapped) surface faces down, so the glow wraps the undersides and dies
// away into the dark. One PointLight (allowed by the LIGHT RULE) gives the same under-glow to characters.
//
// Draw calls (all static geometry, nothing casts shadows): rock 1, basalt columns 1 (instanced), lava 1,
// lava falls 1, embers 1, cell frame 1, cell bars 1, chains 3 (instanced), timer housing 1, display 1,
// display halo 1  = 13.  About 52k triangles.

const TAU = Math.PI * 2;
const LAVA_Y = -7;
const LEDGE_X = 7, LEDGE_Z = 5;
const CAV_X = 0, CAV_Z = 6; // centre of the cavern in plan

// ------------------------------------------------------------------------------------------------
// small deterministic noise toolkit (build time only)
// ------------------------------------------------------------------------------------------------
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(ix, iy, seed) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
const wrap = (i, p) => ((i % p) + p) % p;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// value noise, periodic with integer period `per` in both axes
function vnoise(x, y, per, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const x0 = wrap(ix, per), x1 = wrap(ix + 1, per), y0 = wrap(iy, per), y1 = wrap(iy + 1, per);
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed), c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
// tileable fbm over the unit square (u, v may leave 0..1; it wraps)
function fbm(u, v, per, oct, seed) {
  let s = 0, amp = 0.5, tot = 0, p = per;
  for (let o = 0; o < oct; o++) {
    s += amp * vnoise(u * p, v * p, p, seed + o * 17);
    tot += amp; amp *= 0.5; p *= 2;
  }
  return s / tot;
}
// tileable Worley: writes F1 / F2 (in cell units) into W
const W = { f1: 0, f2: 0 };
function worley(u, v, K, seed) {
  const x = u * K, y = v * K, ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 9, f2 = 9;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i, cy = iy + j, wx = wrap(cx, K), wy = wrap(cy, K);
      const px = cx + 0.12 + 0.76 * hash2(wx, wy, seed), py = cy + 0.12 + 0.76 * hash2(wx, wy, seed + 91);
      const dx = px - x, dy = py - y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
  }
  W.f1 = f1; W.f2 = f2;
}

// ------------------------------------------------------------------------------------------------
// generated textures
// ------------------------------------------------------------------------------------------------
function dataTex(THREE, data, n, srgb, aniso) {
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (aniso) t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// basalt: albedo (sRGB) + tangent-space normal map from one height field
function makeRockTextures(THREE, aniso) {
  const N = 256, H = new Float32Array(N * N), CR = new Float32Array(N * N), TN = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      const wu = u + 0.05 * (fbm(u, v, 4, 3, 11) - 0.5), wv = v + 0.05 * (fbm(u, v, 4, 3, 57) - 0.5);
      worley(wu, wv, 5, 21);
      const crack = sstep(0.0, 0.09, W.f2 - W.f1); // 0 in the cracks between blocks
      const dome = 1 - Math.min(1, W.f1 * 1.15);
      const base = fbm(u, v, 4, 5, 31), fine = fbm(u, v, 32, 3, 41);
      H[y * N + x] = (0.42 * base + 0.2 * fine + 0.38 * dome) * (0.25 + 0.75 * crack);
      CR[y * N + x] = crack;
      TN[y * N + x] = fbm(u, v, 3, 4, 77);
    }
  }
  const alb = new Uint8Array(N * N * 4), nrm = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x, o = i * 4;
      const hl = H[y * N + wrap(x - 1, N)], hr = H[y * N + wrap(x + 1, N)];
      const hd = H[wrap(y - 1, N) * N + x], hu = H[wrap(y + 1, N) * N + x];
      let nx = -(hr - hl) * 9, ny = -(hu - hd) * 9, nz = 1;
      const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= il; ny *= il; nz *= il;
      nrm[o] = Math.round((nx * 0.5 + 0.5) * 255); nrm[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      nrm[o + 2] = Math.round((nz * 0.5 + 0.5) * 255); nrm[o + 3] = 255;
      const speck = hash2(x, y, 5) > 0.93 ? 1.18 : 1;
      const l = (0.62 + 0.75 * H[i]) * (0.42 + 0.58 * CR[i]) * speck;
      const warm = TN[i]; // rusty / sooty patches
      alb[o] = Math.min(255, Math.round((92 + 26 * warm) * l));
      alb[o + 1] = Math.min(255, Math.round((84 + 10 * warm) * l));
      alb[o + 2] = Math.min(255, Math.round((84 - 8 * warm) * l));
      alb[o + 3] = 255;
    }
  }
  return { map: dataTex(THREE, alb, N, true, aniso), normalMap: dataTex(THREE, nrm, N, false, aniso) };
}

// lava noise: R, G = two fbm fields; B = big crust-plate edge distance; A = fine crackle edge distance
function makeLavaTexture(THREE) {
  const N = 256, d = new Uint8Array(N * N * 4);
  const st = (f) => Math.min(1, Math.max(0, (f - 0.5) * 2.1 + 0.5));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, o = (y * N + x) * 4;
      const r = fbm(u, v, 3, 5, 101), g = fbm(u, v, 4, 5, 202);
      const wu = u + 0.07 * (r - 0.5), wv = v + 0.07 * (g - 0.5);
      worley(wu, wv, 5, 303);
      const big = Math.min(1, (W.f2 - W.f1) * 1.7);
      worley(u + 0.03 * (g - 0.5), v + 0.03 * (r - 0.5), 13, 404);
      const fine = Math.min(1, (W.f2 - W.f1) * 1.9);
      d[o] = Math.round(st(r) * 255); d[o + 1] = Math.round(st(g) * 255);
      d[o + 2] = Math.round(big * 255); d[o + 3] = Math.round(fine * 255);
    }
  }
  return dataTex(THREE, d, N, false, 0);
}

// ------------------------------------------------------------------------------------------------
// shaders
// ------------------------------------------------------------------------------------------------
const LAVA_COL = /* glsl */ `
vec3 lavaCol(float T) {
	vec3 c = vec3(1.0, 0.055, 0.0) * smoothstep(0.02, 0.5, T);
	c += vec3(0.0, 0.46, 0.015) * smoothstep(0.36, 0.92, T);
	c += vec3(0.0, 0.3, 0.26) * smoothstep(0.82, 1.2, T);
	return c;
}`;

const LAVA_VERT = /* glsl */ `
varying vec3 vW;
varying float vFogD;
void main() {
	vec4 wp = modelMatrix * vec4(position, 1.0);
	vW = wp.xyz;
	vec4 mv = viewMatrix * wp;
	vFogD = -mv.z;
	gl_Position = projectionMatrix * mv;
}`;

// two texture lookups, no loops (LEVELS.md Part D)
const LAVA_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform float uTime;
uniform float uGlow;
uniform vec2 uLedge;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec3 vW;
varying float vFogD;
${LAVA_COL}
void main() {
	vec2 p = vW.xz;
	float t = uTime;
	// lookup 1: the slow, huge convection field (warp, upwellings, giant rifts between rafts)
	vec4 a = texture2D(uTex, p * 0.0135 + vec2(0.0031, 0.0019) * t);
	vec2 warp = a.rg - 0.5;
	// lookup 2: the crust plates, dragged along by the flow and bent by the convection field
	vec2 q = p * 0.052 + warp * 0.42 + vec2(-0.0105, 0.0062) * t;
	vec4 b = texture2D(uTex, q);
	float up = smoothstep(0.5, 0.8, a.g + 0.1 * sin(t * 0.13 + a.r * 9.0));       // hot upwelling: crust melts away
	float w = 0.1 + 0.34 * up + 0.04 * sin(t * 0.31 + a.r * 14.0);                // cracks breathe open and shut
	float crackBig = 1.0 - smoothstep(w * 0.22, w, b.b);
	float crackFine = (1.0 - smoothstep(0.03, 0.15 + 0.25 * up, b.a)) * (0.3 + 0.7 * up);
	float rift = 1.0 - smoothstep(0.015, 0.085, a.b);
	float T = max(max(crackBig, crackFine * 0.8), rift);
	T = max(T, exp(-b.b * 7.5) * 0.3 + up * 0.22);                               // glow bleeding under thin crust
	T *= 0.7 + 0.42 * b.r;                                                        // streaks in the melt
	// hotter where the lake laps the foot of the ledge
	vec2 dl = max(abs(p) - uLedge, 0.0);
	T += 0.34 * exp(-length(dl) * 0.5) * (0.45 + 0.55 * b.r);
	T *= 0.9 + 0.1 * sin(t * 0.7 + a.r * 20.0 + p.x * 0.05);
	T = clamp(T, 0.0, 1.3);
	float crustMask = 1.0 - smoothstep(0.06, 0.45, T);
	vec3 crust = vec3(0.034, 0.024, 0.021) * (0.35 + 1.4 * b.g) * crustMask;
	vec3 col = crust * (0.25 + 0.75 * uGlow) + lavaCol(T) * mix(0.05, 1.0, uGlow);
	float f = smoothstep(fogNear, fogFar, vFogD);
	col = mix(col, fogColor + vec3(0.16, 0.022, 0.0) * uGlow, f * 0.9);            // far lava melts into a red haze
	gl_FragColor = vec4(col, 1.0);
	#include <colorspace_fragment>
}`;

const FALL_VERT = /* glsl */ `
attribute float aSeed;
varying vec2 vUv;
varying float vSeed;
varying float vFogD;
void main() {
	vUv = uv;
	vSeed = aSeed;
	vec4 mv = modelViewMatrix * vec4(position, 1.0);
	vFogD = -mv.z;
	gl_Position = projectionMatrix * mv;
}`;
const FALL_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform float uTime;
uniform float uGlow;
uniform float fogNear;
uniform float fogFar;
varying vec2 vUv;
varying float vSeed;
varying float vFogD;
${LAVA_COL}
void main() {
	float t = uTime;
	vec4 a = texture2D(uTex, vec2(vUv.x * 0.22 + vSeed, vUv.y * 0.9 - t * 0.16));
	vec4 b = texture2D(uTex, vec2(vUv.x * 0.6 + vSeed * 3.1 + (a.r - 0.5) * 0.08, vUv.y * 2.1 - t * 0.31));
	float x = vUv.x + (a.g - 0.5) * 0.22;
	float edge = smoothstep(0.0, 0.34, x) * smoothstep(1.0, 0.66, x);
	float T = 0.5 + 0.55 * a.r + 0.4 * (1.0 - smoothstep(0.0, 0.35, b.b)) - 0.5 * smoothstep(0.45, 0.85, b.g);
	T *= edge * (0.8 + 0.2 * smoothstep(0.0, 0.12, vUv.y));
	vec3 col = lavaCol(clamp(T, 0.0, 1.25)) * edge * smoothstep(0.0, 0.03, vUv.y) * smoothstep(1.0, 0.985, vUv.y);
	col *= uGlow * (1.0 - smoothstep(fogNear, fogFar, vFogD) * 0.85);
	gl_FragColor = vec4(col, 1.0);
	#include <colorspace_fragment>
}`;

const EMBER_VERT = /* glsl */ `
attribute vec4 aSeed;   // phase, 1 / lifetime, sway amplitude, size (m)
attribute float aRise;
uniform float uTime;
uniform float uGlow;
uniform float uPx;
uniform float fogNear;
uniform float fogFar;
varying float vA;
varying float vHot;
void main() {
	float life = fract(aSeed.x + uTime * aSeed.y);
	vec3 p = position;
	p.y = ${LAVA_Y.toFixed(1)} + life * aRise;
	float w = uTime * 0.7 + aSeed.x * 40.0;
	p.x += sin(w + life * 5.0) * aSeed.z + sin(w * 2.3) * 0.15;
	p.z += cos(w * 0.8 + life * 4.0) * aSeed.z;
	vec4 mv = modelViewMatrix * vec4(p, 1.0);
	gl_Position = projectionMatrix * mv;
	float d = max(0.5, -mv.z);
	float flick = 0.65 + 0.35 * sin(uTime * (7.0 + aSeed.w * 90.0) + aSeed.x * 60.0);
	vA = smoothstep(0.0, 0.06, life) * pow(1.0 - life, 1.6) * flick * uGlow * (1.0 - smoothstep(fogNear, fogFar, d));
	vHot = 1.0 - life;
	float s = aSeed.w * uPx / d;
	vA *= min(1.0, s * s * 0.6 + 0.25);       // sub-pixel sparks dim instead of shimmering
	gl_PointSize = clamp(s, 1.5, 22.0);
}`;
const EMBER_FRAG = /* glsl */ `
varying float vA;
varying float vHot;
void main() {
	float d = length(gl_PointCoord - 0.5) * 2.0;
	float a = smoothstep(1.0, 0.0, d);
	a *= a;
	vec3 col = mix(vec3(1.0, 0.1, 0.0), vec3(1.0, 0.6, 0.16), vHot * vHot) * (a * vA * 1.7);
	gl_FragColor = vec4(col, 1.0);
	#include <colorspace_fragment>
}`;

const DISPLAY_VERT = /* glsl */ `
varying vec2 vUv;
varying float vFogD;
void main() {
	vUv = uv;
	vec4 mv = modelViewMatrix * vec4(position, 1.0);
	vFogD = -mv.z;
	gl_Position = projectionMatrix * mv;
}`;
// LED dot matrix. uTex texel: R = lit, G = this dot pulses (colon / dot / heartbeat)
const DISPLAY_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uGrid;
uniform float uTime;
uniform float uBright;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
varying vec2 vUv;
varying float vFogD;
void main() {
	vec2 g = vUv * uGrid;
	vec2 cell = floor(g);
	vec2 f = fract(g) - 0.5;
	vec4 d = texture2D(uTex, (cell + 0.5) / vec2(64.0, 16.0));
	float r = length(f);
	float dotM = smoothstep(0.47, 0.33, r);
	float pulse = smoothstep(0.15, 0.85, 0.5 + 0.5 * sin(uTime * 3.14159));        // one calm beat every two seconds
	float on = step(0.5, d.r) * mix(1.0, 0.12 + 0.88 * pulse, step(0.5, d.g));
	float dip = step(0.985, fract(sin(floor(uTime * 7.0) * 12.9898) * 43758.5453)); // a rare tired flicker
	float flick = (0.95 + 0.05 * sin(uTime * 21.0 + cell.y * 1.7)) * (1.0 - 0.22 * dip);
	vec3 lit = vec3(1.0, 0.085, 0.03) + vec3(0.55, 0.3, 0.16) * smoothstep(0.3, 0.0, r);
	vec3 col = vec3(0.010, 0.007, 0.007);
	col += (vec3(0.075, 0.005, 0.003) + on * lit * flick * uBright) * dotM;
	col += vec3(0.16, 0.012, 0.004) * on * uBright * (1.0 - dotM);                 // spill between lit dots
	col = mix(col, fogColor, smoothstep(fogNear, fogFar, vFogD));
	gl_FragColor = vec4(col, 1.0);
	#include <colorspace_fragment>
}`;
const HALO_FRAG = /* glsl */ `
uniform vec2 uHalf;
uniform vec2 uSize;
uniform float uTime;
uniform float uBright;
uniform float fogNear;
uniform float fogFar;
varying vec2 vUv;
varying float vFogD;
void main() {
	vec2 p = (vUv - 0.5) * uSize;
	float d = length(max(abs(p) - uHalf, 0.0));
	float a = exp(-d * 2.4) * 0.24 + exp(-d * 0.9) * 0.05;
	a *= smoothstep(0.5, 0.42, abs(vUv.x - 0.5)) * smoothstep(0.5, 0.36, abs(vUv.y - 0.5));
	a *= uBright * (0.9 + 0.1 * sin(uTime * 3.14159)) * (1.0 - smoothstep(fogNear, fogFar, vFogD));
	gl_FragColor = vec4(vec3(1.0, 0.1, 0.03) * a, 1.0);
	#include <colorspace_fragment>
}`;

// 5 x 7 dot-matrix font, rows top to bottom, bit 4 = left column
const FONT = {
  "0": [14, 17, 19, 21, 25, 17, 14], "1": [4, 12, 4, 4, 4, 4, 14], "2": [14, 17, 1, 2, 4, 8, 31],
  "3": [31, 2, 4, 2, 1, 17, 14], "4": [2, 6, 10, 18, 31, 2, 2], "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14], "7": [31, 1, 2, 4, 8, 8, 8], "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
  A: [14, 17, 17, 17, 31, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [28, 18, 17, 17, 17, 18, 28], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 17, 10, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  ":": [0, 12, 12, 0, 12, 12, 0], ".": [0, 0, 0, 0, 0, 12, 12], "-": [0, 0, 0, 31, 0, 0, 0],
  "!": [4, 4, 4, 4, 4, 0, 4], "?": [14, 17, 1, 2, 4, 0, 4], " ": [0, 0, 0, 0, 0, 0, 0],
};

// ------------------------------------------------------------------------------------------------
export function createLair(ctx) {
  const THREE = ctx.THREE;
  const audio = ctx.audio, fx = ctx.fx;
  const rnd = mulberry(90210);
  const rr = (a, b) => a + (b - a) * rnd();

  const group = new THREE.Group();
  group.name = "lair";
  const root = new THREE.Group(); // everything of the place itself: setVoid hides this, not what the level adds
  root.name = "lair-root";
  group.add(root);

  // shared uniforms
  const uTime = { value: 0 };
  const uGlow = { value: 1 };
  const fogU = () => ({ fogColor: { value: new THREE.Color(0) }, fogNear: { value: 1 }, fogFar: { value: 1000 } });

  // ---- the under-glow patch: emissive falloff by height above the lava and by how far the surface faces down ----
  function glowify(mat, amp, colScale) {
    const uAmp = { value: amp };
    mat.userData.uAmp = uAmp;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uLairGlow = uGlow;
      sh.uniforms.uLairTime = uTime;
      sh.uniforms.uLairAmp = uAmp;
      let vs = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vLairPos;");
      vs = vs.replace("#include <project_vertex>", `#include <project_vertex>
	vec4 lairWp = vec4( transformed, 1.0 );
	#ifdef USE_INSTANCING
		lairWp = instanceMatrix * lairWp;
	#endif
	vLairPos = ( modelMatrix * lairWp ).xyz;`);
      if (colScale) {
        vs = vs.replace("#include <uv_vertex>", `#include <uv_vertex>
	#if defined( USE_MAP ) && defined( USE_INSTANCING )
		vMapUv.y *= max( 1.0, length( instanceMatrix[ 1 ].xyz ) * 0.3 );
		vMapUv.x *= max( 1.0, length( instanceMatrix[ 0 ].xyz ) * 1.8 );
	#endif`);
      }
      sh.vertexShader = vs;
      let fs = sh.fragmentShader.replace("#include <common>", `#include <common>
varying vec3 vLairPos;
uniform float uLairGlow;
uniform float uLairTime;
uniform float uLairAmp;`);
      fs = fs.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
	{
		vec3 lairN = inverseTransformDirection( normal, viewMatrix );
		float lairH = max( vLairPos.y - ( ${LAVA_Y.toFixed(1)} ), 0.0 );
		float lairF = pow( clamp( 0.5 - 0.5 * lairN.y, 0.0, 1.0 ), 1.25 );
		float lairK = exp( - lairH * 0.085 );
		float lairW = 0.9 + 0.1 * sin( uLairTime * 1.7 + vLairPos.x * 0.21 + vLairPos.z * 0.17 ) * sin( uLairTime * 0.9 + vLairPos.z * 0.13 + 1.0 );
		vec3 lairC = mix( vec3( 1.0, 0.13, 0.015 ), vec3( 1.0, 0.4, 0.07 ), exp( - lairH * 0.3 ) );
		totalEmissiveRadiance += diffuseColor.rgb * lairC * ( uLairGlow * uLairAmp * lairF * lairK * lairW );
	}`);
      sh.fragmentShader = fs;
    };
    mat.customProgramCacheKey = () => "lair-glow-" + (colScale ? 1 : 0);
    return mat;
  }

  // ---- materials ----
  const aniso = Math.min(4, ctx.renderer && ctx.renderer.capabilities ? ctx.renderer.capabilities.getMaxAnisotropy() : 1);
  const rockTex = makeRockTextures(THREE, aniso);
  const rockMat = glowify(new THREE.MeshStandardMaterial({
    map: rockTex.map, normalMap: rockTex.normalMap, normalScale: new THREE.Vector2(1.25, 1.25),
    roughness: 0.94, metalness: 0, vertexColors: true, side: THREE.DoubleSide,
  }), 3.3, false);
  const columnMat = glowify(new THREE.MeshStandardMaterial({
    map: rockTex.map, roughness: 0.9, metalness: 0, flatShading: true,
  }), 3.5, true);
  const ironMat = glowify(new THREE.MeshStandardMaterial({
    color: 0x54463f, roughness: 0.5, metalness: 0.45,
  }), 2.6, false);
  const lavaTex = makeLavaTexture(THREE);

  // ------------------------------------------------------------------------------------------------
  // rock: cavern shell, the ledge mesa, stalactites, spires - ONE geometry
  // ------------------------------------------------------------------------------------------------
  const P = [], U = [], C = [], I = [];
  let nv = 0;
  function vtx(x, y, z, u, v, c) {
    P.push(x, y, z); U.push(u, v); C.push(c, c * 0.975, c * 0.95);
    return nv++;
  }
  function quads(base, nu, nrows) { // vertices row-major, (nu + 1) per row
    for (let j = 0; j < nrows; j++) {
      for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
        I.push(a, c, b, b, c, d);
      }
    }
  }

  // cavern wall radius (before the plan ellipse) at angle th and height y
  function wallR(th, y) {
    const u = wrap(th / TAU, 1), v = (y + 9) / 260;
    const f = fbm(u, v, 10, 5, 7);
    const lob = fbm(u, 0.31, 4, 2, 9);
    return 39 + 10 * (lob - 0.5) + 15 * (f - 0.5);
  }
  const wp = { x: 0, y: 0, z: 0 };
  function wallPoint(th, y, inset) {
    const r = wallR(th, y) - (inset || 0);
    wp.x = CAV_X + Math.sin(th) * r * 1.08; wp.y = y; wp.z = CAV_Z + Math.cos(th) * r * 0.96;
    return wp;
  }
  const ceilingAt = (x, z) => {
    const d = Math.hypot((x - CAV_X) / 1.08, (z - CAV_Z) / 0.96);
    return 10 + 19 * Math.sin(Math.acos(Math.min(1, d / 40)));
  };

  // shell
  {
    const NI = 112, NLOW = 12, NDOME = 18, base = nv;
    for (let j = 0; j <= NLOW + NDOME; j++) {
      let y, k = 1, lift = 0;
      if (j <= NLOW) y = -9 + 19 * (j / NLOW);
      else { const ph = ((j - NLOW) / NDOME) * Math.PI * 0.5; y = 10 + 19 * Math.sin(ph); k = Math.cos(ph); lift = Math.sin(ph); }
      for (let i = 0; i <= NI; i++) {
        const th = (i / NI) * TAU, u = wrap(i / NI, 1), v = (y + 9) / 260;
        const f = fbm(u, v, 10, 5, 7);
        const r = wallR(th, y) * k;
        const bump = (fbm(u, v * 3 + 0.5, 20, 3, 13) - 0.5) * 6 * lift;
        const c = (0.72 + 0.6 * f) * (0.92 + 0.08 * Math.sin(y * 1.3 + f * 9));
        vtx(CAV_X + Math.sin(th) * r * 1.08, y + bump, CAV_Z + Math.cos(th) * r * 0.96, (i / NI) * 44, y / 5.5, c);
      }
    }
    quads(base, NI, NLOW + NDOME);
  }

  // a tapering spike (stalagmite up / stalactite down)
  function spike(x, y0, z, R, H, seed) {
    const NS = 8, NR = 5, base = nv, lx = (hash2(seed, 1, 3) - 0.5) * R * 1.4, lz = (hash2(seed, 2, 3) - 0.5) * R * 1.4;
    for (let j = 0; j <= NR; j++) {
      const t = j / NR, taper = Math.pow(1 - t, 0.85) * 0.97 + 0.03;
      for (let i = 0; i <= NS; i++) {
        const a = (i / NS) * TAU, n = 0.7 + 0.6 * hash2(i % NS, j, seed);
        const r = R * taper * (j === NR ? 0.12 : n);
        vtx(x + Math.cos(a) * r + lx * t * t, y0 + H * t, z + Math.sin(a) * r + lz * t * t, (i / NS) * R * 1.8, (H * t) / 4, 0.8 + 0.3 * n);
      }
    }
    quads(base, NS, NR);
  }
  // stalactites (kept away from the chains above the cell and the timer)
  for (let n = 0, tries = 0; n < 46 && tries < 400; tries++) {
    const a = rnd() * TAU, d = 4 + 30 * Math.sqrt(rnd());
    const x = CAV_X + Math.sin(a) * d, z = CAV_Z + Math.cos(a) * d;
    if (Math.abs(x) < 6 && Math.abs(z - 13) < 5) continue;
    const big = rnd() < 0.25;
    spike(x, ceilingAt(x, z) + 1.5, z, big ? rr(1.3, 2.3) : rr(0.5, 1.2), -(big ? rr(8, 13) : rr(3, 8)), 500 + n);
    n++;
  }
  // rock spires standing in the lava (background silhouettes; none in front of the cell)
  const SPIRES = [[-21, 25, 3.2, 15], [19, 31, 3.6, 19], [9, 36, 2.6, 12], [28, 12, 3.4, 16], [-30, 9, 3.8, 18],
    [-25, -9, 3.2, 14], [24, -11, 3.6, 17], [-7, -21, 3, 13], [11, -24, 3.4, 15], [-13, 34, 2.4, 9]];
  for (let n = 0; n < SPIRES.length; n++) { const s = SPIRES[n]; spike(s[0], -9, s[1], s[2], s[3] + 2, 900 + n); }

  // the ledge: rounded-rectangle mesa. Outline by perimeter so detail is even all the way round.
  const MX = 7.6, MZ = 5.6, MRC = 1.0;
  const SX = 2 * (MX - MRC), SZ = 2 * (MZ - MRC), ARC = Math.PI * 0.5 * MRC, PERIM = 2 * SX + 2 * SZ + 4 * ARC;
  const op = { x: 0, z: 0, nx: 0, nz: 0 };
  function outline(t) {
    let d = wrap(t, 1) * PERIM;
    const cx = MX - MRC, cz = MZ - MRC;
    const arc = (ax, az, a0) => { const a = a0 + (d / ARC) * Math.PI * 0.5; op.nx = Math.cos(a); op.nz = Math.sin(a); op.x = ax + op.nx * MRC; op.z = az + op.nz * MRC; return op; };
    if (d < SZ) { op.x = MX; op.z = -cz + d; op.nx = 1; op.nz = 0; return op; }
    d -= SZ; if (d < ARC) return arc(cx, cz, 0);
    d -= ARC; if (d < SX) { op.x = cx - d; op.z = MZ; op.nx = 0; op.nz = 1; return op; }
    d -= SX; if (d < ARC) return arc(-cx, cz, Math.PI * 0.5);
    d -= ARC; if (d < SZ) { op.x = -MX; op.z = cz - d; op.nx = -1; op.nz = 0; return op; }
    d -= SZ; if (d < ARC) return arc(-cx, -cz, Math.PI);
    d -= ARC; if (d < SX) { op.x = -cx + d; op.z = -MZ; op.nx = 0; op.nz = -1; return op; }
    d -= SX; return arc(cx, -cz, Math.PI * 1.5);
  }
  {
    const NI = 128;
    const PROF = [[0, -0.12], [-0.1, 0], [-0.45, 0.1], [-1.1, 0.02], [-2.1, 0.3], [-3.3, 0.55], [-4.6, 0.8], [-5.8, 1.2], [-6.8, 1.7], [-7.6, 2.2], [-8.6, 2.8]];
    const base = nv;
    for (let k = 0; k < PROF.length; k++) {
      for (let i = 0; i <= NI; i++) {
        const t = i / NI, o = outline(t);
        const n = k < 2 ? 0 : (fbm(t, k / 16, 16, 4, 61) - 0.5) * Math.min(1.5, 0.5 + k * 0.14);
        const off = PROF[k][1] + n;
        vtx(o.x + o.nx * off, PROF[k][0], o.z + o.nz * off, (t * PERIM) / 3.5, PROF[k][0] / 3.5, k < 2 ? 1.05 : 0.86 + 0.5 * (n + 0.3));
      }
    }
    quads(base, NI, PROF.length - 1);
    // the flat top (y = 0 exactly: characters stand on it), concentric rings
    const RINGS = [1, 0.955, 0.84, 0.6, 0.32], tb = nv;
    for (let k = 0; k < RINGS.length; k++) {
      for (let i = 0; i <= NI; i++) {
        const t = i / NI, o = outline(t);
        const x = (o.x - o.nx * 0.12) * RINGS[k], z = (o.z - o.nz * 0.12) * RINGS[k];
        const c = (k === 0 ? 0.95 : 1.18) + 0.22 * (fbm(x / 16 + 0.5, z / 16 + 0.5, 4, 3, 71) - 0.5);
        vtx(x, 0, z, x / 3.5, z / 3.5, c);
      }
    }
    quads(tb, NI, RINGS.length - 1);
    const cen = vtx(0, 0, 0, 0, 0, 1.18), last = tb + (RINGS.length - 1) * (NI + 1);
    for (let i = 0; i < NI; i++) I.push(last + i, cen, last + i + 1);
  }

  const rockGeo = new THREE.BufferGeometry();
  rockGeo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  rockGeo.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
  rockGeo.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
  rockGeo.setIndex(I);
  rockGeo.computeVertexNormals();
  rockGeo.computeBoundingSphere();
  const rock = new THREE.Mesh(rockGeo, rockMat);
  rock.receiveShadow = true;
  rock.frustumCulled = false; // the camera is always inside it
  root.add(rock);

  // ------------------------------------------------------------------------------------------------
  // basalt columns (one InstancedMesh of hexagonal prisms; origin at the top, unit height downward)
  // ------------------------------------------------------------------------------------------------
  const colliders = [];
  {
    const p = [], uv = [], idx = [];
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * TAU, c = Math.cos(a), s = Math.sin(a);
      p.push(c * 0.93, 0, s * 0.93, c, -1, s);
      uv.push(i / 6, 1, i / 6, 0);
    }
    for (let i = 0; i < 6; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
    const cb = p.length / 3;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; p.push(Math.cos(a) * 0.93, 0, Math.sin(a) * 0.93); uv.push(0.5 + Math.cos(a) * 0.4, 0.5 + Math.sin(a) * 0.4); }
    p.push(0, 0.05, 0); uv.push(0.5, 0.5);
    for (let i = 0; i < 6; i++) idx.push(cb + i, cb + 6, cb + ((i + 1) % 6));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();

    const cols = []; // x, top, z, radius, bottom
    const add = (x, top, z, r, bottom) => { cols.push(x, top, z, r, bottom === undefined ? -9 : bottom); };
    // hugging the mesa: an organ-pipe skirt of columns stepping down into the lava
    for (let n = 0; n < 250; n++) {
      const t = rnd(), o = outline(t);
      const front = o.z > 5 && o.x > -6 && o.x < 9;
      const d = rr(0.25, front ? 2.4 : 3.4);
      const r = rr(0.36, 0.68);
      add(o.x + o.nx * d, -0.45 - d * 1.9 - rnd() * rnd() * 2.6, o.z + o.nz * d, r);
    }
    // islands of columns in the lake
    const ISLES = [[-17, 14, 4.6, 6], [16.5, 23, 4.2, 8], [-9.5, 28, 3.6, 5], [22, 3, 5, 9], [-23, -3, 5, 8.5],
      [9, -19, 5, 7.5], [-12, -18, 4.2, 6], [27, 30, 4, 7], [-28, 24, 4.4, 8], [-17, 1, 2.6, 3.2], [15, 11, 2.4, 2.6]];
    for (let n = 0; n < ISLES.length; n++) {
      const s = ISLES[n], cnt = Math.round(s[2] * s[2] * 1.7);
      for (let k = 0; k < cnt; k++) {
        const a = rnd() * TAU, d = Math.sqrt(rnd()) * s[2];
        const top = LAVA_Y + s[3] * (1 - (d / s[2]) * (d / s[2])) * rr(0.72, 1.08) - 0.2;
        if (top < LAVA_Y + 0.25) continue;
        add(s[0] + Math.cos(a) * d, top, s[1] + Math.sin(a) * d, rr(0.42, 0.8));
      }
    }
    // buttresses of columns against the cavern wall
    for (let n = 0; n < 12; n++) {
      const th = (n + rr(0.15, 0.85)) / 12 * TAU, hgt = rr(6, 15);
      for (let k = 0; k < 18; k++) {
        const a = th + rr(-0.07, 0.07), ins = rr(0.5, 5.5);
        const q = wallPoint(a, -6, ins);
        add(q.x, LAVA_Y + hgt * (1 - ins / 7) * rr(0.6, 1.05), q.z, rr(0.55, 1.05));
      }
    }
    // two stumps of broken columns on the back corners of the ledge (solid: colliders)
    const STUMPS = [[-6.25, -4.35], [6.25, -4.35]];
    for (let n = 0; n < STUMPS.length; n++) {
      const s = STUMPS[n];
      colliders.push({ x: s[0], z: s[1], r: 0.82, on: true });
      const HS = [2.3, 1.5, 1.05, 0.55, 1.8, 0.3];
      for (let k = 0; k < HS.length; k++) {
        const a = (k / HS.length) * TAU + n, d = k === 0 ? 0 : 0.5;
        add(s[0] + Math.cos(a) * d, HS[k], s[1] + Math.sin(a) * d, k === 0 ? 0.36 : 0.3, -0.6);
      }
    }
    const count = cols.length / 5;
    const mesh = new THREE.InstancedMesh(g, columnMat, count);
    const o = new THREE.Object3D(), col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const x = cols[i * 5], top = cols[i * 5 + 1], z = cols[i * 5 + 2], r = cols[i * 5 + 3], bot = cols[i * 5 + 4];
      o.position.set(x, top, z);
      o.rotation.set(rr(-0.035, 0.035), rnd() * TAU, rr(-0.035, 0.035));
      o.scale.set(r, top - bot, r);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      const l = rr(0.74, 1.2), w = rr(-0.04, 0.04);
      col.setRGB(l * (1 + w), l, l * (1 - w));
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    root.add(mesh);
  }

  // ------------------------------------------------------------------------------------------------
  // lava lake + lava falls
  // ------------------------------------------------------------------------------------------------
  const lavaMat = new THREE.ShaderMaterial({
    uniforms: Object.assign({ uTex: { value: lavaTex }, uTime, uGlow, uLedge: { value: new THREE.Vector2(MX + 1.9, MZ + 1.9) } }, fogU()),
    vertexShader: LAVA_VERT, fragmentShader: LAVA_FRAG, fog: true,
  });
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(240, 240).rotateX(-Math.PI / 2), lavaMat);
  lava.position.set(CAV_X, LAVA_Y, CAV_Z);
  lava.frustumCulled = false;
  root.add(lava);

  {
    const FALLS = [[-0.62, 13, 3.2], [0.95, 17, 2.4], [2.55, 11, 3.6], [-2.2, 15, 2.6]]; // angle (0 = +z), top y, width
    const p = [], uv = [], sd = [], idx = [];
    let b = 0;
    const NS = 14;
    for (let n = 0; n < FALLS.length; n++) {
      const f = FALLS[n], th = f[0];
      const top = wallPoint(th, f[1], 0.7), tx = top.x, tz = top.z;
      const inx = -Math.sin(th), inz = -Math.cos(th), sx = Math.cos(th), sz = -Math.sin(th);
      const len = f[1] - (LAVA_Y - 0.3);
      for (let j = 0; j <= NS; j++) {
        const k = j / NS, y = f[1] - len * k, push = 0.3 + 2.6 * Math.sqrt(k), hw = f[2] * 0.5 * (0.8 + 0.35 * k);
        const cx = tx + inx * push, cz = tz + inz * push;
        p.push(cx - sx * hw, y, cz - sz * hw, cx + sx * hw, y, cz + sz * hw);
        uv.push(0, k, 1, k);
        sd.push(n * 0.37 + 0.11, n * 0.37 + 0.11);
      }
      for (let j = 0; j < NS; j++) { const a = b + j * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      b += (NS + 1) * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(sd, 1));
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uTex: { value: lavaTex }, uTime, uGlow }, fogU()),
      vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, fog: true,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const falls = new THREE.Mesh(g, m);
    falls.frustumCulled = false;
    falls.renderOrder = 2;
    root.add(falls);
  }

  // ------------------------------------------------------------------------------------------------
  // embers: one Points cloud, closed-form motion in the vertex shader
  // ------------------------------------------------------------------------------------------------
  const emberMat = new THREE.ShaderMaterial({
    uniforms: Object.assign({ uTime, uGlow, uPx: { value: 600 } }, fogU()),
    vertexShader: EMBER_VERT, fragmentShader: EMBER_FRAG, fog: true,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  {
    const N = 320, p = new Float32Array(N * 3), s = new Float32Array(N * 4), r = new Float32Array(N);
    for (let i = 0; i < N;) {
      const near = i < N * 0.6;
      const a = rnd() * TAU, d = near ? rr(6, 17) : rr(12, 34);
      const x = CAV_X + Math.sin(a) * d, z = (near ? 3 : CAV_Z) + Math.cos(a) * d;
      if (Math.abs(x) < MX + 1.7 && Math.abs(z) < MZ + 1.7) continue; // never up through the ledge
      p[i * 3] = x; p[i * 3 + 1] = LAVA_Y; p[i * 3 + 2] = z;
      s[i * 4] = rnd(); s[i * 4 + 1] = 1 / rr(6, 15); s[i * 4 + 2] = rr(0.25, 1.1); s[i * 4 + 3] = rr(0.035, 0.085);
      r[i] = rr(8, 26);
      i++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(s, 4));
    g.setAttribute("aRise", new THREE.BufferAttribute(r, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(CAV_X, 4, CAV_Z), 60);
    const pts = new THREE.Points(g, emberMat);
    pts.frustumCulled = false;
    pts.renderOrder = 3;
    root.add(pts);
  }

  // ------------------------------------------------------------------------------------------------
  // iron: the hanging rig (timer housing + big chains) and, under it, the cell on its own pivot
  // ------------------------------------------------------------------------------------------------
  function mergeGeos(list) {
    let n = 0;
    const parts = [];
    for (let i = 0; i < list.length; i++) { const g = list[i].index ? list[i].toNonIndexed() : list[i]; parts.push(g); n += g.attributes.position.count; }
    const p = new Float32Array(n * 3), nr = new Float32Array(n * 3);
    let o = 0;
    for (let i = 0; i < parts.length; i++) {
      p.set(parts[i].attributes.position.array, o * 3);
      nr.set(parts[i].attributes.normal.array, o * 3);
      o += parts[i].attributes.position.count;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nr, 3));
    return g;
  }
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const ring = (r, tube, x, y, z, ry) => { const g = new THREE.TorusGeometry(r, tube, 6, 12); if (ry) g.rotateY(ry); return g.translate(x, y, z); };

  // chain links: an oval torus, long axis = +Y; instances alternate a quarter turn
  const linkGeo = new THREE.TorusGeometry(0.5, 0.15, 4, 8).scale(1, 1.5, 1);
  linkGeo.computeVertexNormals();
  const LINK_PITCH = 1.2;
  const cA = new THREE.Vector3(), cB = new THREE.Vector3(), cD = new THREE.Vector3(), cUp = new THREE.Vector3(0, 1, 0);
  const cQ = new THREE.Quaternion(), cQ2 = new THREE.Quaternion(), cS = new THREE.Vector3(), cM = new THREE.Matrix4(), cP = new THREE.Vector3();
  function addChain(list, ax, ay, az, bx, by, bz, s, sag) {
    cA.set(ax, ay, az); cB.set(bx, by, bz);
    const len = cA.distanceTo(cB), n = Math.max(1, Math.round(len / (LINK_PITCH * s))), ph = rnd() * 3;
    sag = sag || 0;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      cP.lerpVectors(cA, cB, t); cP.y -= sag * 4 * t * (1 - t);
      cD.subVectors(cB, cA); cD.y -= sag * 4 * (1 - 2 * t); cD.normalize();
      cQ.setFromUnitVectors(cUp, cD);
      cQ2.setFromAxisAngle(cUp, ph + (i % 2) * Math.PI * 0.5);
      cQ.multiply(cQ2);
      cS.set(s, (len / n / LINK_PITCH), s); // stretch the pitch to fit the span exactly
      cM.compose(cP, cQ, cS);
      list.push(cM.clone());
    }
  }
  function chainMesh(list) {
    const m = new THREE.InstancedMesh(linkGeo, ironMat, list.length);
    for (let i = 0; i < list.length; i++) m.setMatrixAt(i, list[i]);
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;
    return m;
  }

  const RIG_Y = 30, HOOK_Y = 6.25, CELL_X = 0, CELL_Z = 13;
  const rig = new THREE.Group();
  rig.position.set(CELL_X, RIG_Y, CELL_Z);
  root.add(rig);
  const cellPivot = new THREE.Group();
  cellPivot.position.set(0, HOOK_Y - RIG_Y, 0);
  rig.add(cellPivot);

  // -- timer housing (rig-local; centre at world (0, 7.2, 13)) --
  const HY = 7.2 - RIG_Y;
  {
    const parts = [
      box(5.6, 1.8, 0.4, 0, HY, 0.02),
      box(5.72, 0.17, 0.12, 0, HY + 0.83, -0.22), box(5.72, 0.17, 0.12, 0, HY - 0.83, -0.22),
      box(0.17, 1.83, 0.12, -2.775, HY, -0.22), box(0.17, 1.83, 0.12, 2.775, HY, -0.22),
      box(5.3, 0.1, 0.5, 0, HY + 0.93, 0.02), box(5.3, 0.1, 0.5, 0, HY - 0.93, 0.02),
      box(0.3, 0.3, 0.22, -2.1, HY + 1.08, 0.02), box(0.3, 0.3, 0.22, 2.1, HY + 1.08, 0.02),
      ring(0.2, 0.05, -2.1, HY + 1.36, 0.02, 0), ring(0.2, 0.05, 2.1, HY + 1.36, 0.02, 0),
      box(0.2, 0.2, 0.2, 0, HY - 1.02, 0), ring(0.11, 0.035, 0, HY - 1.2, 0, Math.PI / 2),
    ];
    for (let i = -2; i <= 2; i++) { // rivets along the bezel
      parts.push(box(0.07, 0.07, 0.05, i * 1.25, HY + 0.83, -0.29), box(0.07, 0.07, 0.05, i * 1.25, HY - 0.83, -0.29));
    }
    rig.add(new THREE.Mesh(mergeGeos(parts), ironMat));
  }
  // -- big chains from the housing up into the dark, and the short link down to the cell's ring --
  {
    const L = [];
    addChain(L, -2.1, HY + 1.45, 0.02, -2.5, 2.5, 0.02, 0.5);
    addChain(L, 2.1, HY + 1.45, 0.02, 2.5, 2.5, 0.02, 0.5);
    addChain(L, 0, HY - 1.2, 0, 0, HOOK_Y - RIG_Y + 0.1, 0, 0.17);
    rig.add(chainMesh(L));
  }

  // -- the display --
  const TW = 64, TH = 16, timerData = new Uint8Array(TW * TH * 4);
  const timerTex = new THREE.DataTexture(timerData, TW, TH, THREE.RGBAFormat, THREE.UnsignedByteType);
  timerTex.magFilter = timerTex.minFilter = THREE.NearestFilter;
  timerTex.generateMipmaps = false;
  const DISP_W = 5.0, DISP_H = 1.25;
  const displayMat = new THREE.ShaderMaterial({
    uniforms: Object.assign({ uTex: { value: timerTex }, uGrid: { value: new THREE.Vector2(40, 10) }, uTime, uBright: { value: 1 } }, fogU()),
    vertexShader: DISPLAY_VERT, fragmentShader: DISPLAY_FRAG, fog: true,
  });
  const display = new THREE.Mesh(new THREE.PlaneGeometry(DISP_W, DISP_H), displayMat);
  display.position.set(0, HY, -0.185);
  display.rotation.y = Math.PI; // faces -z; u still runs left to right for a viewer on the ledge
  rig.add(display);
  const haloMat = new THREE.ShaderMaterial({
    uniforms: Object.assign({ uHalf: { value: new THREE.Vector2(2.2, 0.45) }, uSize: { value: new THREE.Vector2(7.4, 3.4) }, uTime, uBright: displayMat.uniforms.uBright }, fogU()),
    vertexShader: DISPLAY_VERT, fragmentShader: HALO_FRAG, fog: true,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 3.4), haloMat);
  halo.position.set(0, HY, -0.34);
  halo.rotation.y = Math.PI;
  halo.renderOrder = 4;
  rig.add(halo);

  const timer = {
    text: "",
    object: display,
    // Redraws the dot matrix (only here). Up to 10 characters; the dots shrink to fit long texts.
    setText(text) {
      const str = String(text === undefined || text === null ? "" : text).toUpperCase().slice(0, 10);
      timer.text = str;
      const n = str.length, textCols = Math.max(0, n * 6 - 1);
      const cols = Math.min(TW, Math.max(40, textCols + 4)), rows = Math.min(TH, Math.max(9, Math.round(cols / 4)));
      timerData.fill(0);
      const c0 = Math.floor((cols - textCols) / 2), r0 = Math.floor((rows - 7) / 2);
      const set = (c, r, pulse) => {
        if (c < 0 || c >= cols || r < 0 || r >= rows) return;
        const o = ((rows - 1 - r) * TW + c) * 4;
        timerData[o] = 255; timerData[o + 1] = pulse ? 255 : 0; timerData[o + 3] = 255;
      };
      for (let i = 0; i < n; i++) {
        const ch = str[i], gl = FONT[ch] || FONT["?"], pulse = ch === ":" || ch === ".";
        for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (gl[r] & (16 >> c)) set(c0 + i * 6 + c, r0 + r, pulse);
      }
      set(cols - 2, rows - 2, true); // the heartbeat dot: the clock is running
      displayMat.uniforms.uGrid.value.set(cols, rows);
      haloMat.uniforms.uHalf.value.set(Math.max(0.3, (textCols / cols) * DISP_W * 0.5), (3.5 / rows) * DISP_H);
      timerTex.needsUpdate = true;
    },
  };

  // -- the cell (cellPivot-local: the hook ring is the origin, the floor top is 3.05 below it) --
  const FLOOR = 3.2 - HOOK_Y, TOP = FLOOR + 2.2, MID = (FLOOR + TOP) * 0.5, HALF = 1.1;
  {
    const parts = [
      box(2.36, 0.14, 2.36, 0, FLOOR - 0.07, 0),
      box(2.4, 0.1, 0.1, 0, FLOOR - 0.19, -1.13), box(2.4, 0.1, 0.1, 0, FLOOR - 0.19, 1.13),
      box(0.1, 0.1, 2.4, -1.13, FLOOR - 0.19, 0), box(0.1, 0.1, 2.4, 1.13, FLOOR - 0.19, 0),
      box(2.36, 0.12, 0.12, 0, TOP, -HALF), box(2.36, 0.12, 0.12, 0, TOP, HALF),
      box(0.12, 0.12, 2.36, -HALF, TOP, 0), box(0.12, 0.12, 2.36, HALF, TOP, 0),
      box(2.2, 0.08, 0.08, 0, TOP, 0), box(0.08, 0.08, 2.2, 0, TOP, 0),
      box(2.3, 0.05, 0.07, 0, MID, -HALF), box(2.3, 0.05, 0.07, 0, MID, HALF),
      box(0.07, 0.05, 2.3, -HALF, MID, 0), box(0.07, 0.05, 2.3, HALF, MID, 0),
      // door on the side that faces the ledge, with a heavy padlock
      box(0.09, 2.2, 0.09, -0.45, MID, -HALF), box(0.09, 2.2, 0.09, 0.45, MID, -HALF),
      box(0.18, 0.2, 0.09, 0.45, MID - 0.05, -HALF - 0.08), ring(0.06, 0.02, 0.45, MID + 0.09, -HALF - 0.08, 0),
      // the ring the chains gather into
      ring(0.2, 0.045, 0, -0.05, 0, 0), box(0.14, 0.14, 0.14, 0, TOP + 0.08, 0),
    ];
    for (let sx = -1; sx <= 1; sx += 2) {
      for (let sz = -1; sz <= 1; sz += 2) {
        parts.push(box(0.11, 2.2, 0.11, sx * HALF, MID, sz * HALF));
        parts.push(ring(0.07, 0.022, sx * 1.02, TOP + 0.1, sz * 1.02, sx * sz > 0 ? -Math.PI / 4 : Math.PI / 4));
      }
    }
    cellPivot.add(new THREE.Mesh(mergeGeos(parts), ironMat));

    // bars
    const barGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    const spots = [];
    for (let i = 0; i < 10; i++) {
      const a = -0.9 + i * 0.2;
      if (Math.abs(Math.abs(a) - 0.45) > 0.08) spots.push(a, -HALF); // the door posts stand in for two bars
      spots.push(a, HALF, -HALF, a, HALF, a);
    }
    const bars = new THREE.InstancedMesh(barGeo, ironMat, spots.length / 2);
    const o = new THREE.Object3D();
    for (let i = 0; i < spots.length / 2; i++) {
      o.position.set(spots[i * 2], MID, spots[i * 2 + 1]);
      o.scale.set(0.028, 2.2, 0.028);
      o.updateMatrix();
      bars.setMatrixAt(i, o.matrix);
    }
    bars.instanceMatrix.needsUpdate = true;
    bars.frustumCulled = false;
    cellPivot.add(bars);

    // four short chains from the top corners to the ring
    const L = [];
    for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2) addChain(L, sx * 1.02, TOP + 0.14, sz * 1.02, sx * 0.07, -0.2, sz * 0.07, 0.15);
    cellPivot.add(chainMesh(L));
  }
  const cellFloor = new THREE.Object3D();
  cellFloor.name = "cell-floor";
  cellFloor.position.set(0, FLOOR, 0);
  cellPivot.add(cellFloor);

  // -- old chains hanging about the cavern (static) --
  {
    const L = [];
    const HANG = [[-10, 20, 5.5, 0.55], [11.5, 18.5, 9, 0.55], [-16, 7, 2.5, 0.6], [15, 1, 6, 0.6], [-5.5, 25, 0.5, 0.55], [7, 27, 4, 0.6]];
    for (let n = 0; n < HANG.length; n++) {
      const h = HANG[n], top = Math.min(27, ceilingAt(h[0], h[1]) + 0.5);
      addChain(L, h[0], top, h[1], h[0] + rr(-0.3, 0.3), h[2], h[1] + rr(-0.3, 0.3), h[3]);
    }
    addChain(L, -10, 9.5, 20, -5.5, 8, 25, 0.5, 2.6); // one slung between two of them
    root.add(chainMesh(L));
  }

  // ------------------------------------------------------------------------------------------------
  // the one light: lava under-glow on the characters (never toggled, only its intensity moves)
  // ------------------------------------------------------------------------------------------------
  const LIGHT_I = 30;
  const light = new THREE.PointLight(0xff5a1a, LIGHT_I, 0, 1);
  light.position.set(0, -3, 10);
  light.castShadow = false;
  group.add(light); // outside `root`: hiding a light would change the light count and recompile everything

  // ------------------------------------------------------------------------------------------------
  // state: glow, void, sway, environment
  // ------------------------------------------------------------------------------------------------
  let glow = 1, glowFrom = 1, glowTo = 1, glowT = 1, glowDur = 0;
  let isVoid = false, t = 0, kick = 0, emberT = 1.5;
  const heat = [];
  const c1 = new THREE.Color(), c2 = new THREE.Color();
  const mixHex = (a, b, k) => c1.set(a).lerp(c2.set(b), k).getHex();
  const env = { background: 0, fog: [0, 18, 85], hemi: [0, 0, 1], sun: [0, 1], sunDir: [-0.25, 0.9, -0.35], far: 130, dark: true };
  function writeEnv(g) {
    if (isVoid) {
      env.background = 0x000000;
      env.fog[0] = 0x000000; env.fog[1] = 7; env.fog[2] = 34;
      env.hemi[0] = 0x2a2a44; env.hemi[1] = 0x06060c; env.hemi[2] = 0.5;
      env.sun[0] = 0xa9baff; env.sun[1] = 0.7;
    } else {
      env.background = mixHex(0x000000, 0x150302, g);
      env.fog[0] = mixHex(0x000000, 0x220603, g); env.fog[1] = 18; env.fog[2] = 85;
      env.hemi[0] = mixHex(0x20202e, 0x42323c, g); env.hemi[1] = mixHex(0x08080c, 0xff5a1c, g); env.hemi[2] = 0.7 + 0.6 * g;
      env.sun[0] = mixHex(0xb9c6ff, 0xffe6cf, g); env.sun[1] = 1.5 + 1.0 * g; // a pale shaft from a crack far above
    }
    return env;
  }
  function pushEnv(seconds) {
    writeEnv(glowTo);
    if (ctx.world === world) ctx.setEnv(env, seconds || 0);
  }
  function applyGlow() {
    uGlow.value = glow;
    displayMat.uniforms.uBright.value = 0.4 + 0.6 * glow;
  }
  function dropHeat() {
    for (let i = 0; i < heat.length; i++) { try { heat[i].remove(); } catch (e) { /* already cleared by fx.clear */ } }
    heat.length = 0;
  }
  function makeHeat() {
    if (!fx || typeof fx.heat !== "function") return;
    const h1 = fx.heat(-4.6, -4.7, 8.6, 4, 3.2), h2 = fx.heat(5.6, -4.7, 10.4, 4, 3.2), h3 = fx.heat(0, -4.4, 13, 3.4, 3.6);
    if (h1) heat.push(h1); if (h2) heat.push(h2); if (h3) heat.push(h3);
  }

  function setGlow(g, seconds) {
    g = Math.min(1, Math.max(0, +g || 0));
    glowFrom = glow; glowTo = g;
    if (seconds > 0) { glowT = 0; glowDur = seconds; } else { glowT = 1; glow = g; applyGlow(); }
    pushEnv(seconds);
  }
  function setVoid(on) {
    on = !!on;
    if (on === isVoid) return;
    isVoid = on;
    root.visible = !on;
    if (on) { dropHeat(); light.intensity = 0; }
    pushEnv(0);
  }
  function reset() {
    isVoid = false; root.visible = true;
    glow = glowFrom = glowTo = 1; glowT = 1; applyGlow();
    kick = 0; emberT = 1.5;
    rig.rotation.set(0, 0, 0); cellPivot.rotation.set(0, 0, 0);
    if (timer.text !== "8 DAYS") timer.setText("8 DAYS");
    dropHeat();
    pushEnv(0);
  }

  function update(dt, time) {
    t += dt;
    uTime.value = t;
    if (glowT < 1) {
      glowT = Math.min(1, glowT + dt / glowDur);
      const k = glowT * glowT * (3 - 2 * glowT);
      glow = glowFrom + (glowTo - glowFrom) * k;
      applyGlow();
    }
    // ember sprite scale: metres -> pixels at 1 m
    const cv = ctx.renderer.domElement;
    emberMat.uniforms.uPx.value = cv.height * 0.5 * ctx.camera.projectionMatrix.elements[5];

    // the long slow pendulum of the whole rig, and the cell's own smaller swing and twist under the hook
    kick *= Math.exp(-dt / 5);
    const a = 0.004 + kick * 0.016, b = 0.014 + kick * 0.075;
    rig.rotation.x = Math.sin(t * 0.61) * a + Math.sin(t * 0.83 + 1.3) * a * 0.35;
    rig.rotation.z = Math.sin(t * 0.52 + 0.7) * a * 0.8;
    cellPivot.rotation.x = Math.sin(t * 0.93 + 0.4) * b;
    cellPivot.rotation.z = Math.cos(t * 0.77) * b * 0.8;
    cellPivot.rotation.y = Math.sin(t * 0.23) * (0.03 + kick * 0.09);

    if (isVoid) { light.intensity = 0; return; }
    light.intensity = LIGHT_I * glow * (0.9 + 0.07 * Math.sin(t * 2.3) + 0.05 * Math.sin(t * 5.1 + 1));

    const hot = glow > 0.25;
    if (hot && heat.length === 0) makeHeat();
    else if (!hot && heat.length) dropHeat();
    emberT -= dt;
    if (emberT <= 0) {
      emberT = 0.6 + Math.random() * 1.1;
      if (hot && fx && typeof fx.embers === "function") {
        // a spatter of sparks where a bubble bursts, somewhere around the foot of the ledge
        const side = Math.random();
        let x, z;
        if (side < 0.55) { x = (Math.random() * 2 - 1) * 9; z = 6.6 + Math.random() * 6; }
        else if (side < 0.8) { x = -9 - Math.random() * 4; z = (Math.random() * 2 - 1) * 6; }
        else { x = 9 + Math.random() * 4; z = (Math.random() * 2 - 1) * 6; }
        fx.embers(x, LAVA_Y + 0.3, z, 1.1, 5 + ((Math.random() * 5) | 0));
      }
    }
  }

  // ------------------------------------------------------------------------------------------------
  // the world object
  // ------------------------------------------------------------------------------------------------
  const pt = (x, y, z) => ({ x, y, z });
  const camPair = (px, py, pz, lx, ly, lz) => ({ pos: pt(px, py, pz), look: pt(lx, ly, lz) });
  const stepSound = (s, pan) => {
    if (!audio) return;
    if (typeof audio.step === "function") audio.step("rock", s, pan);
    else if (typeof audio.cushionStep === "function") audio.cushionStep(s * 0.3, pan);
  };

  const world = {
    name: "lair",
    group,
    root,
    heightAt(x, z) { return x > -7.3 && x < 7.3 && z > -5.3 && z < 5.3 ? 0 : LAVA_Y; },
    maxStep: 0.45,
    colliders,
    confine(obj, radius) {
      const r = radius || 0;
      if (obj.x < -LEDGE_X + r) obj.x = -LEDGE_X + r; else if (obj.x > LEDGE_X - r) obj.x = LEDGE_X - r;
      if (obj.z < -LEDGE_Z + r) obj.z = -LEDGE_Z + r; else if (obj.z > LEDGE_Z - r) obj.z = LEDGE_Z - r;
    },
    camBounds: { minX: -11, maxX: 11, minZ: -10.5, maxZ: 9, maxY: 9 },
    env,
    update,
    onFootstep(wx, wz, strength, footIndex, wet, pan) {
      stepSound(strength, pan);
      if (strength > 0.75 && fx && typeof fx.dust === "function") fx.dust(wx, 0.02, wz, strength * 0.4);
    },
    onLand(x, z, floorY, impact) {
      stepSound(Math.min(1, 0.55 + impact * 0.6), 0);
      if (fx && typeof fx.dust === "function") fx.dust(x, floorY + 0.02, z, 0.4 + impact * 0.6);
    },
    warm() {
      // let the heat cards and embers of fx compile behind black too
      makeHeat();
      if (fx && typeof fx.embers === "function") fx.embers(0, LAVA_Y + 0.3, 9, 1, 4);
      return dropHeat;
    },
    onLeave() { dropHeat(); },

    P: {
      spawn: { x: 0, y: 0, z: -3, yaw: 0 },
      wizard: { x: -2.2, y: 0, z: 1.6, yaw: Math.atan2(2.2, -4.6) },
      dummy: { x: 3, y: 0, z: 0.5, yaw: Math.atan2(-3, -3.5) },
      cushion: { x: -3.2, y: 0, z: -0.6 },
      dropRing: { x: 0, y: 0, z: 1.5 },
      cell: pt(0, 3.2, 13),
      timer: pt(0, 7.2, 13),
      camWizard: camPair(-0.9, 1.5, -1.2, -2.2, 1.6, 1.6),
      camRise0: camPair(0, 1.2, 2, 0, 1.5, 13),
      camTimer: camPair(0, 7.6, 4.5, 0, 7.2, 13),
      camCell: camPair(2.2, 3.9, 9.4, 0, 3.7, 13),
      camLava: camPair(5, -3, 9, 0, 3.2, 13),
      camTrain: camPair(0, 2.4, -6.5, 0, 0.5, 0),
    },

    timer,
    cell: {
      floor: cellFloor,
      group: cellPivot,
      // amount 0..1: gives the cell a push; it swings wider and settles over a few seconds
      sway(amount) { kick = Math.max(kick, Math.min(1, Math.max(0, +amount || 0))); },
    },
    light,
    setVoid,
    setGlow,
    reset,
    get glow() { return glow; },
    get isVoid() { return isVoid; },
  };

  timer.setText("8 DAYS");
  writeEnv(1);
  applyGlow();
  return world;
}
