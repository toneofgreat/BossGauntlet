// src/games/cats/scripts/filmlens.js - the GPU "camera lens" for Biscuit's Story: the film's Canvas 2D
// frame is uploaded as a texture and run through a short chain of fragment shaders that make it read
// like photographed footage instead of an illustration.
//
//   createLens() -> lens | null        one WebGL2 (else WebGL1) context on its own canvas; null when
//                                       neither is available (the player then keeps the 2D post path)
//   lens.render(src, P, t, outW?, outH?) -> true | false   src = a 2D canvas, P = lensParams(...)
//   lens.canvas  lens.ok()  lens.isWebGL2  lens.finish() -> ms (blocks; tools only)  lens.dispose()
//   lensParams(film, t, hints) -> P     merges DEFAULTS <- per-film LOOKS <- hints recorded from the
//                                       film's own K.bloom/K.vignette/K.grain/K.chromatic/K.letterbox
//                                       calls (filmpost.js) <- film.grade <- film.gradeAt(t)
//
// film.grade (all optional; film.gradeAt(t) may return any subset per frame):
//   exposure  0.9      linear exposure multiplier before tone mapping
//   hdr       1        how hard bright LDR values are expanded into HDR (0 = none): highlight roll-off
//   temp      0        white balance, -1 (cool/blue) .. +1 (warm/amber)
//   tint      0        -1 (magenta) .. +1 (green)
//   lift      [.008]x3 added to the blacks (display space), e.g. [0.01,0.012,0.02] = lifted blue blacks
//   gamma     [1,1,1]  midtone power per channel (>1 brighter mids)
//   gain      [1,1,1]  highlight multiplier per channel
//   sat       0.92     saturation (0 = grey)
//   contrast  1        contrast around mid grey (log space)
//   bloom     0.3      multi-scale bloom strength           threshold 0.95 (scene-linear; diffuse white = 1, so only real lights bloom)
//   halation  0.35     red film halation around bright edges
//   streak    0        anamorphic horizontal streak on bright points
//   grain     0.05     luminance-dependent animated grain   grainSize 1.35 (px)
//   ca        0.5      chromatic aberration at the frame edges (0..2)
//   vignette  0.4      optical lens falloff                 vignetteColor "#000000"
//   weave     1        gate weave + micro handheld drift (0 = locked off)
//   sharpen   0.15     light unsharp mask
//   mix       1        0 = bypass (debug)
//
// Everything here is a pure function of (src, P, t): seeking renders the same frame again. No timers.
// The GLSL is written in GLSL ES 1.00 so the same shaders compile on WebGL2 and WebGL1.

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
// bloom buffers are 8-bit: store sqrt(v / 8) so values up to 8x white survive with fine shadows
vec3 enc(vec3 c) { return sqrt(clamp(c * 0.125, 0.0, 1.0)); }
vec3 dec(vec3 c) { return c * c * 8.0; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// LDR -> scene-linear with highlight expansion (the canvas only holds 0..1: anything near white was
// "a light", so give it energy for the bloom and the tone curve's shoulder)
vec3 toScene(vec3 c, float hdr) {
  vec3 l = pow(max(c, 0.0), vec3(2.2));
  // only (nearly) clipped pixels were lights: a pale pastel sky or a white wall stays a surface.
  // the max channel also catches saturated lamps (amber 255,200,40) as well as white-hot cores
  float m = max(c.r, max(c.g, c.b));
  float e = smoothstep(0.9, 1.0, m) * (0.35 + 0.65 * smoothstep(0.25, 0.8, luma(l)));
  float k = hdr * e * e * e * 6.0;
  return l * (1.0 + k);
}`;

// bright pass + 2x downsample (4 bilinear taps = 16 texels)
const PREFILTER = HEAD + `
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThr; uniform float uHdr;
vec3 tap(vec2 o) {
  vec3 s = toScene(texture2D(uTex, vUv + o * uTexel).rgb, uHdr);
  float y = luma(s);
  float knee = uThr * 0.6;
  float soft = clamp(y - uThr + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, y - uThr) / max(y, 1e-4);
  return s * w;
}
// exposure context: a camera exposed for a bright scene does not see its pale surfaces as lights.
// The mean brightness of the surroundings (16 taps on two rings) scales the bloom energy down, so a
// white room / pastel sky does not veil everything, while a candle or lamp in the dark keeps its glow.
float ringMax(float r) {
  float a = 0.0;
  for (int i = 0; i < 8; i++) {
    float an = float(i) * 0.785398 + r * 0.013;
    vec3 c = texture2D(uTex, vUv + vec2(cos(an), sin(an)) * r * uTexel).rgb;
    a += max(c.r, max(c.g, c.b));
  }
  return a * 0.125;
}
void main() {
  vec3 c = tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0));
  float sur = ringMax(36.0) * 0.5 + ringMax(110.0) * 0.5;
  c *= 1.0 - 0.85 * smoothstep(0.55, 0.9, sur);
  gl_FragColor = vec4(enc(c * 0.25), 1.0);
}`;

// dual-filter (Kawase) down / up samplers
const DOWN = HEAD + `
uniform sampler2D uTex; uniform vec2 uTexel;
void main() {
  vec3 c = dec(texture2D(uTex, vUv).rgb) * 4.0;
  c += dec(texture2D(uTex, vUv + vec2(-1.0, -1.0) * uTexel).rgb);
  c += dec(texture2D(uTex, vUv + vec2( 1.0, -1.0) * uTexel).rgb);
  c += dec(texture2D(uTex, vUv + vec2(-1.0,  1.0) * uTexel).rgb);
  c += dec(texture2D(uTex, vUv + vec2( 1.0,  1.0) * uTexel).rgb);
  gl_FragColor = vec4(enc(c / 8.0), 1.0);
}`;
const UP = HEAD + `
uniform sampler2D uTex; uniform sampler2D uAdd; uniform vec2 uTexel; uniform float uW;
void main() {
  vec3 c = vec3(0.0);
  c += dec(texture2D(uTex, vUv + vec2(-2.0, 0.0) * uTexel).rgb);
  c += dec(texture2D(uTex, vUv + vec2( 2.0, 0.0) * uTexel).rgb);
  c += dec(texture2D(uTex, vUv + vec2(0.0, -2.0) * uTexel).rgb);
  c += dec(texture2D(uTex, vUv + vec2(0.0,  2.0) * uTexel).rgb);
  c += dec(texture2D(uTex, vUv + vec2(-1.0, -1.0) * uTexel).rgb) * 2.0;
  c += dec(texture2D(uTex, vUv + vec2( 1.0, -1.0) * uTexel).rgb) * 2.0;
  c += dec(texture2D(uTex, vUv + vec2(-1.0,  1.0) * uTexel).rgb) * 2.0;
  c += dec(texture2D(uTex, vUv + vec2( 1.0,  1.0) * uTexel).rgb) * 2.0;
  c = c / 12.0 + dec(texture2D(uAdd, vUv).rgb) * uW;
  gl_FragColor = vec4(enc(c), 1.0);
}`;
// anamorphic streak: wide horizontal blur of the bright pass (run twice with growing spacing)
const STREAK = HEAD + `
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uStep;
void main() {
  vec3 c = dec(texture2D(uTex, vUv).rgb);
  float tot = 1.0;
  for (int i = 1; i <= 6; i++) {
    float fi = float(i);
    float w = exp(-fi * 0.45);
    c += dec(texture2D(uTex, vUv + vec2(fi * uStep * uTexel.x, 0.0)).rgb) * w;
    c += dec(texture2D(uTex, vUv - vec2(fi * uStep * uTexel.x, 0.0)).rgb) * w;
    tot += 2.0 * w;
  }
  gl_FragColor = vec4(enc(c / tot), 1.0);
}`;

const FINAL = HEAD + `
uniform sampler2D uSrc; uniform sampler2D uBloom; uniform sampler2D uHal; uniform sampler2D uStreak;
uniform vec2 uTexel; uniform vec2 uRes; uniform float uAspect;
uniform float uTime; uniform float uFrame;
uniform vec2 uBars;          // letterbox: top, bottom (fraction of the height)
uniform vec4 uWeave;         // dx, dy (uv), rotation (rad), zoom
uniform vec3 uWB; uniform vec3 uLift; uniform vec3 uGamma; uniform vec3 uGain;
uniform float uExposure; uniform float uHdr; uniform float uSat; uniform float uContrast;
uniform float uBloomAmt; uniform float uHalAmt; uniform float uStreakAmt;
uniform float uGrain; uniform float uGrainSize; uniform float uCA; uniform float uVig; uniform vec3 uVigCol;
uniform float uSharpen; uniform float uMix;

float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = h21(i), b = h21(i + vec2(1.0, 0.0)), c = h21(i + vec2(0.0, 1.0)), d = h21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

void main() {
  float yTop = 1.0 - vUv.y;
  if (yTop < uBars.x || yTop > 1.0 - uBars.y) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  // gate weave + handheld micro drift: rotate / zoom about the centre, then offset
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float cr = cos(uWeave.z), sr = sin(uWeave.z);
  p = vec2(cr * p.x - sr * p.y, sr * p.x + cr * p.y) / uWeave.w;
  vec2 uv = p / vec2(uAspect, 1.0) + 0.5 + uWeave.xy;
  // never pull the letterbox bars into the picture
  uv.y = clamp(uv.y, uBars.y + uTexel.y, 1.0 - uBars.x - uTexel.y);

  // chromatic aberration grows toward the edges (lateral CA), red out / blue in
  vec2 d = uv - 0.5;
  float r2 = dot(d * vec2(uAspect, 1.0), d * vec2(uAspect, 1.0));
  vec2 ca = d * r2 * uCA * 0.005;
  vec3 c0 = texture2D(uSrc, uv).rgb;
  vec3 c;
  c.r = texture2D(uSrc, uv + ca).r;
  c.g = c0.g;
  c.b = texture2D(uSrc, uv - ca).b;
  // light sharpening (unsharp mask from the 4 neighbours)
  vec3 nb = texture2D(uSrc, uv + vec2(uTexel.x, 0.0)).rgb + texture2D(uSrc, uv - vec2(uTexel.x, 0.0)).rgb
          + texture2D(uSrc, uv + vec2(0.0, uTexel.y)).rgb + texture2D(uSrc, uv - vec2(0.0, uTexel.y)).rgb;
  c = clamp(c + (c0 - nb * 0.25) * uSharpen, 0.0, 1.0);
  vec3 orig = c;

  vec3 s = toScene(c, uHdr) * uWB;
  // lens: bloom (energy-conserving-ish: a touch of the image itself is spread out), halation, streak
  vec3 bl = dec(texture2D(uBloom, uv).rgb);
  vec3 hl = dec(texture2D(uHal, uv).rgb);
  vec3 st = dec(texture2D(uStreak, uv).rgb);
  // bloom spills light INTO darker surroundings; over an already bright area it only veils it
  // (the milky look of a bright day scene), so its weight falls with the pixel's own brightness
  s = s * (1.0 - 0.04 * uBloomAmt) + bl * uBloomAmt * 0.28 * (1.0 - 0.7 * smoothstep(0.12, 0.9, luma(s)));
  float self = luma(s);
  s += hl * vec3(1.0, 0.28, 0.08) * uHalAmt * 1.6 * (1.0 - smoothstep(0.35, 1.6, self));
  s += st * vec3(0.55, 0.72, 1.0) * uStreakAmt;
  // optical vignette (natural falloff), colour-able
  vec2 vq = d * vec2(uAspect * 0.78, 1.0) * 1.62;
  float vf = smoothstep(0.35, 1.35, dot(vq, vq)) * uVig;
  s = mix(s, uVigCol, clamp(vf, 0.0, 1.0));
  // exposure + contrast (log space around mid grey) + saturation, then filmic tone map
  s *= uExposure;
  s = max(s, 0.0);
  vec3 lg = log2(s + 1e-5) - log2(0.18);
  s = exp2(lg * uContrast + log2(0.18));
  float y = luma(s);
  s = max(mix(vec3(y), s, uSat), 0.0);
  // ACES per channel bleaches saturated highlights to white (photographic, but it eats golden light):
  // blend with a hue-preserving version that tone-maps luminance only
  vec3 tm = aces(s);
  float ty = aces(vec3(y)).x;
  vec3 hp = s * (ty / max(y, 1e-4));
  hp = hp / max(1.0, max(hp.r, max(hp.g, hp.b)));
  tm = mix(tm, hp, 0.45);
  vec3 o = pow(tm, vec3(1.0 / 2.2));
  // lift / gamma / gain (display space)
  o = o * uGain + uLift * (1.0 - o);
  o = pow(max(o, 0.0), 1.0 / uGamma);
  // film grain: strongest in the mid-tones, faint in deep blacks and clipped whites, a little chroma
  vec2 gp = gl_FragCoord.xy / uGrainSize + vec2(uFrame * 17.31, uFrame * 9.77);
  float n = vnoise(gp) + vnoise(gp * 1.93 + 7.1) * 0.6 - 0.8;
  float L = luma(o);
  float amp = uGrain * (0.28 + 3.0 * L * (1.0 - L)) * 1.4;
  vec3 gn = vec3(n) + (vec3(vnoise(gp + 3.3), vnoise(gp + 5.7), vnoise(gp + 9.1)) - 0.5) * 0.35;
  o += gn * amp;
  // dither against banding in dark gradients
  o += (h21(gl_FragCoord.xy + uFrame) - 0.5) / 255.0;
  o = mix(orig, o, uMix);
  gl_FragColor = vec4(clamp(o, 0.0, 1.0), 1.0);
}`;


// ---- parameters ------------------------------------------------------------------------------------------
export const GRADE_DEFAULTS = Object.freeze({
  exposure: 0.9, hdr: 1, temp: 0, tint: 0, lift: [0.008, 0.008, 0.008], gamma: [1, 1, 1], gain: [1, 1, 1], sat: 0.92, contrast: 1,
  bloom: 0.3, threshold: 0.95, halation: 0.35, streak: 0, grain: 0.05, grainSize: 1.35, ca: 0.5,
  vignette: 0.4, vignetteColor: "#000000", weave: 1, sharpen: 0.15, mix: 1,
});

// A starting "look" per film (FILMS.md moods). A film's own film.grade / gradeAt(t) wins over these.
export const FILM_LOOKS = Object.freeze({
  0: { temp: -0.12, lift: [0.006, 0.01, 0.022], sat: 0.92, contrast: 1.06, halation: 0.5, streak: 0.12 }, // storm night
  1: { temp: -0.05, lift: [0.008, 0.008, 0.016], sat: 0.95 },
  2: { temp: 0.22, gain: [1.03, 1, 0.95], sat: 1.02, halation: 0.45, streak: 0.08 }, // golden memory
  3: { temp: -0.08, lift: [0.006, 0.01, 0.02], sat: 0.92, contrast: 1.05 },
  4: { temp: -0.06, sat: 0.94 },
  5: { temp: -0.05, sat: 0.95, halation: 0.45 },
  6: { temp: 0.05, sat: 0.95 },
  7: { temp: -0.14, lift: [0.004, 0.009, 0.022], sat: 0.9, contrast: 1.08, halation: 0.5 }, // thunder
  8: { temp: 0.18, sat: 1.0, halation: 0.45 },
  9: { temp: 0.08 },
  10: { temp: 0.16, halation: 0.45 },
  11: { temp: -0.1, lift: [0.006, 0.008, 0.02], contrast: 1.05 },
  12: { temp: -0.04, sat: 0.95 },
  13: { temp: -0.12, lift: [0.004, 0.008, 0.02], streak: 0.15 },
  14: { temp: -0.06, streak: 0.1 },
  15: { temp: 0.02 },
  16: { temp: 0.04, sat: 0.96, halation: 0.4 },
  17: { temp: 0.12, sat: 0.94 },
  18: { temp: 0.06 },
  19: { temp: 0.1, halation: 0.45 },
  20: { temp: 0.14, gain: [1.02, 1, 0.97], sat: 0.98, halation: 0.45, streak: 0.06 }, // home, golden
});

const toNum = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const toVec = (v, d) => (Array.isArray(v) && v.length >= 3 ? [toNum(v[0], d[0]), toNum(v[1], d[1]), toNum(v[2], d[2])] : d);
function hexLin(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || ""));
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.pow(v / 255, 2.2));
}
function apply(P, o) {
  if (!o || typeof o !== "object") return;
  for (const k of Object.keys(GRADE_DEFAULTS)) {
    if (o[k] == null) continue;
    const d = GRADE_DEFAULTS[k];
    if (Array.isArray(d)) P[k] = toVec(o[k], P[k]);
    else if (typeof d === "string") P[k] = String(o[k]);
    else P[k] = toNum(o[k], P[k]);
  }
}

// lensParams(film, t, hints) -> a full parameter set. hints come from filmpost.takeLensHints(): what the
// film asked the 2D post stack for this frame, translated to the lens's own scale.
export function lensParams(film, t, hints) {
  const P = {};
  for (const k of Object.keys(GRADE_DEFAULTS)) { const d = GRADE_DEFAULTS[k]; P[k] = Array.isArray(d) ? d.slice() : d; }
  const id = film && Number.isInteger(film.id) ? film.id : -1;
  apply(P, FILM_LOOKS[id]);
  if (hints) {
    if (hints.bloom != null) { P.bloom = Math.min(1.2, 0.15 + hints.bloom * 0.9); /* the 2D threshold is a brightness() factor with another meaning: lens keeps its own */ }
    if (hints.vignette != null) { P.vignette = Math.min(0.95, hints.vignette * 0.85); if (hints.vignetteColor) P.vignetteColor = hints.vignetteColor; }
    if (hints.grain != null) P.grain = Math.min(0.16, hints.grain * 0.85);
    if (hints.ca != null) P.ca = Math.max(P.ca, Math.min(2.5, 0.5 + hints.ca));
    P.bars = [hints.barTop || 0, hints.barBottom || 0];
  }
  try { apply(P, film && film.grade); } catch { /* a bad grade is ignored */ }
  try { if (film && typeof film.gradeAt === "function") apply(P, film.gradeAt(t)); } catch { /* ignored */ }
  if (!P.bars) P.bars = [0, 0];
  return P;
}

// white balance multipliers for temp/tint (a cheap Kelvin-ish approximation in linear light)
function wb(temp, tint) {
  const r = 1 + 0.22 * temp - 0.04 * tint, g = 1 + 0.1 * tint, b = 1 - 0.26 * temp - 0.04 * tint;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [r / y, g / y, b / y];
}

// smooth 1D value noise for the handheld drift (a pure function of t)
function hh(x, seed) {
  const h = (n) => { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); };
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return (h(i) * (1 - u) + h(i + 1) * u) * 2 - 1;
}

// ---- the lens ----------------------------------------------------------------------------------------------
export function createLens() {
  let cv;
  try { cv = document.createElement("canvas"); } catch { return null; }
  cv.width = 960;
  cv.height = 540;
  const attrs = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "default" };
  let gl = null, gl2 = false;
  try { gl = cv.getContext("webgl2", attrs); gl2 = !!gl; } catch { gl = null; }
  if (!gl) { try { gl = cv.getContext("webgl", attrs) || cv.getContext("experimental-webgl", attrs); } catch { gl = null; } }
  if (!gl) return null;
  let lost = false;
  let disposed = false;
  const onLost = (ev) => { try { ev.preventDefault(); } catch { /* fine */ } lost = true; };
  cv.addEventListener("webglcontextlost", onLost);

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error("lens shader: " + gl.getShaderInfoLog(s));
    return s;
  }
  const vs = (() => { try { return shader(gl.VERTEX_SHADER, VERT); } catch { return null; } })();
  if (!vs) { release(); return null; }
  function program(fsrc) {
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fsrc));
    gl.bindAttribLocation(p, 0, "aPos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error("lens link: " + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); if (info) u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  let PR;
  try {
    PR = { pre: program(PREFILTER), down: program(DOWN), up: program(UP), streak: program(STREAK), fin: program(FINAL) };
  } catch {
    release();
    return null;
  }
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);

  function tex(w, h) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }
  function target(w, h) {
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    const t = tex(w, h);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, f, w, h };
  }
  const srcTex = tex(0, 0);
  let T = null; // render targets for the current size
  let size = "";
  function freeTargets() {
    if (!T) return;
    for (const r of T.all) { gl.deleteTexture(r.t); gl.deleteFramebuffer(r.f); }
    T = null;
  }
  function ensure(w, h) {
    const key = w + "x" + h;
    if (key === size && T) return;
    freeTargets();
    size = key;
    const half = target(w / 2, h / 2);
    const down = [];
    let dw = w / 2, dh = h / 2;
    for (let i = 0; i < 5; i++) { dw = Math.max(1, Math.ceil(dw / 2)); dh = Math.max(1, Math.ceil(dh / 2)); down.push(target(dw, dh)); }
    const up = [];
    for (let i = 0; i < 4; i++) up.push(target(down[i].w, down[i].h)); // up[i] matches down[i]
    const upHalf = target(half.w, half.h);
    const st = [target(Math.ceil(w / 4), Math.ceil(h / 16)), target(Math.ceil(w / 4), Math.ceil(h / 16))];
    T = { half, down, up, upHalf, st, all: [half, ...down, ...up, upHalf, ...st] };
  }
  function pass(prog, dst, setup) {
    gl.useProgram(prog.p);
    if (dst) { gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f); gl.viewport(0, 0, dst.w, dst.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cv.width, cv.height); }
    setup(prog.u);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function bind(unit, t, loc) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (loc) gl.uniform1i(loc, unit);
  }
  const blackTex = tex(1, 1);

  function render(src, P, t = 0, outW, outH) {
    if (disposed || lost || !gl || gl.isContextLost()) { lost = true; return false; }
    const w = src.width | 0, h = src.height | 0;
    if (w < 2 || h < 2) return false;
    const ow = outW || w, oh = outH || h;
    if (cv.width !== ow) cv.width = ow;
    if (cv.height !== oh) cv.height = oh;
    ensure(w, h);
    // upload the 2D frame
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    const wantBloom = P.bloom > 0.001 || P.halation > 0.001 || P.streak > 0.001;
    if (wantBloom) {
      pass(PR.pre, T.half, (u) => { bind(0, srcTex, u.uTex); gl.uniform2f(u.uTexel, 1 / w, 1 / h); gl.uniform1f(u.uThr, P.threshold); gl.uniform1f(u.uHdr, P.hdr); });
      let prev = T.half;
      for (const d of T.down) {
        const s = prev;
        pass(PR.down, d, (u) => { bind(0, s.t, u.uTex); gl.uniform2f(u.uTexel, 1 / s.w, 1 / s.h); });
        prev = d;
      }
      // up chain: up[3] = down[4] blurred + down[3]; ...; upHalf = up[0] + half (the tight level weighted less)
      let low = T.down[4];
      for (let i = 3; i >= 0; i--) {
        const lo = low, dst = T.up[i];
        pass(PR.up, dst, (u) => { bind(0, lo.t, u.uTex); bind(1, T.down[i].t, u.uAdd); gl.uniform2f(u.uTexel, 0.5 / lo.w, 0.5 / lo.h); gl.uniform1f(u.uW, 1); });
        low = dst;
      }
      pass(PR.up, T.upHalf, (u) => { bind(0, low.t, u.uTex); bind(1, T.half.t, u.uAdd); gl.uniform2f(u.uTexel, 0.5 / low.w, 0.5 / low.h); gl.uniform1f(u.uW, 0.35); });
      if (P.streak > 0.001) {
        const a = T.st[0], b = T.st[1];
        pass(PR.streak, a, (u) => { bind(0, T.down[0].t, u.uTex); gl.uniform2f(u.uTexel, 1 / a.w, 1 / a.h); gl.uniform1f(u.uStep, 2); });
        pass(PR.streak, b, (u) => { bind(0, a.t, u.uTex); gl.uniform2f(u.uTexel, 1 / b.w, 1 / b.h); gl.uniform1f(u.uStep, 9); });
      }
    }

    const frame = Math.floor(t * 24);
    // gate weave: a sub-pixel per-frame jitter; handheld: a slow wandering drift + roll
    const wv = P.weave;
    const jx = (hh(frame * 0.5, 1) * 0.25) / w, jy = (hh(frame * 0.5, 2) * 0.35) / h;
    const dx = ((hh(t * 0.35, 3) * 0.7 + hh(t * 1.1, 4) * 0.3) * 1.6) / w;
    const dy = ((hh(t * 0.3, 5) * 0.7 + hh(t * 0.9, 6) * 0.3) * 1.3) / h;
    const rot = hh(t * 0.25, 7) * 0.0007;
    const W = wb(P.temp, P.tint);
    const vc = hexLin(P.vignetteColor);
    const bars = P.bars || [0, 0];
    pass(PR.fin, null, (u) => {
      bind(0, srcTex, u.uSrc);
      bind(1, wantBloom ? T.upHalf.t : blackTex, u.uBloom);
      bind(2, wantBloom ? T.down[1].t : blackTex, u.uHal);
      bind(3, wantBloom && P.streak > 0.001 ? T.st[1].t : blackTex, u.uStreak);
      gl.uniform2f(u.uTexel, 1 / w, 1 / h);
      gl.uniform2f(u.uRes, ow, oh);
      gl.uniform1f(u.uAspect, w / h);
      gl.uniform1f(u.uTime, t);
      gl.uniform1f(u.uFrame, frame % 997);
      gl.uniform2f(u.uBars, bars[0], bars[1]);
      gl.uniform4f(u.uWeave, (jx + dx) * wv, (jy + dy) * wv, rot * wv, 1 + 0.004 * Math.min(1, wv));
      gl.uniform3f(u.uWB, W[0], W[1], W[2]);
      gl.uniform3f(u.uLift, P.lift[0], P.lift[1], P.lift[2]);
      gl.uniform3f(u.uGamma, Math.max(0.2, P.gamma[0]), Math.max(0.2, P.gamma[1]), Math.max(0.2, P.gamma[2]));
      gl.uniform3f(u.uGain, P.gain[0], P.gain[1], P.gain[2]);
      gl.uniform1f(u.uExposure, P.exposure);
      gl.uniform1f(u.uHdr, P.hdr);
      gl.uniform1f(u.uSat, P.sat);
      gl.uniform1f(u.uContrast, P.contrast);
      gl.uniform1f(u.uBloomAmt, P.bloom);
      gl.uniform1f(u.uHalAmt, P.halation);
      gl.uniform1f(u.uStreakAmt, P.streak);
      gl.uniform1f(u.uGrain, P.grain);
      gl.uniform1f(u.uGrainSize, Math.max(0.5, P.grainSize * (oh / 540)));
      gl.uniform1f(u.uCA, P.ca);
      gl.uniform1f(u.uVig, P.vignette);
      gl.uniform3f(u.uVigCol, vc[0], vc[1], vc[2]);
      gl.uniform1f(u.uSharpen, P.sharpen);
      gl.uniform1f(u.uMix, P.mix);
    });
    if (gl.isContextLost()) { lost = true; return false; }
    return true;
  }

  function release() {
    try { const ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); } catch { /* fine */ }
    try { cv.removeEventListener("webglcontextlost", onLost); } catch { /* fine */ }
    try { cv.remove(); } catch { /* fine */ }
    try { cv.width = 1; cv.height = 1; } catch { /* fine */ }
  }

  return {
    canvas: cv,
    isWebGL2: gl2,
    render,
    ok: () => !disposed && !lost && !!gl && !gl.isContextLost(),
    // blocks until the GPU is done: only for tools that measure the lens cost
    finish() { if (!gl) return 0; const t0 = performance.now(); gl.finish(); return performance.now() - t0; },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        if (!gl.isContextLost()) {
          freeTargets();
          gl.deleteTexture(srcTex);
          gl.deleteTexture(blackTex);
          gl.deleteBuffer(quad);
          for (const k of Object.keys(PR)) gl.deleteProgram(PR[k].p);
        }
      } catch { /* fine */ }
      release();
      gl = null;
    },
  };
}
