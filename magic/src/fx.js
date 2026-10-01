/* ===========================================================================
   fx.js - the camera, as opposed to the scene. Nothing in the vendored three
   build does post, so this is the whole chain by hand: render the world into a
   float buffer, pull the bright bits out, blur them, then compose the frame -
   exposure, ACES, a cold grade, a vignette, chromatic aberration at the edges
   and film grain over the lot. That grain and that falloff are most of what
   makes a pile of boxes look photographed instead of drawn.

   FX.dread (0..1) is the fear dial: the picture desaturates, the edges close
   in, the lens starts to split colour and the grain comes up. FX.hurt bleeds
   red in from the corners.
   ========================================================================= */
import * as THREE from '../vendor/three.module.js';

const VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT = `
uniform sampler2D tIn; uniform float thresh; uniform float knee;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tIn, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float w = smoothstep(thresh, thresh + knee, l);
  gl_FragColor = vec4(c * w, 1.0);
}`;

const BLUR = `
uniform sampler2D tIn; uniform vec2 dir;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tIn, vUv).rgb * 0.2270270270;
  s += (texture2D(tIn, vUv + dir * 1.3846153846).rgb + texture2D(tIn, vUv - dir * 1.3846153846).rgb) * 0.3162162162;
  s += (texture2D(tIn, vUv + dir * 3.2307692308).rgb + texture2D(tIn, vUv - dir * 3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(s, 1.0);
}`;

const COMP = `
uniform sampler2D tScene; uniform sampler2D tBloom;
uniform vec2 res;
uniform float exposure, bloom, grain, vig, aber, sat, contrast, time, dread, hurt, flash;
varying vec2 vUv;

vec3 RRT(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 col) {
  const mat3 IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  col = IN * (col / 0.6);
  col = RRT(col);
  return clamp(OUT * col, 0.0, 1.0);
}
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

void main() {
  vec2 uv = vUv;
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);
  // the lens: colour splits towards the corners, and splits harder when afraid
  float k = (aber * 0.0022 + dread * 0.006) * r2 * 4.0;
  vec3 col;
  col.r = texture2D(tScene, uv + d * k).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv - d * k).b;
  col += texture2D(tBloom, uv).rgb * bloom;
  col = aces(col * exposure);

  // grade: cold in the shadows, a little amber left in the highlights
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, max(0.0, sat - dread * 0.4));
  col = mix(col * vec3(0.88, 0.94, 1.14), col, smoothstep(0.0, 0.5, l));
  col += vec3(0.045, 0.018, -0.012) * l * l;
  col = (col - 0.5) * contrast + 0.5;
  col += flash;

  // the frame closes in
  float v = smoothstep(1.05, 0.12, r2 * 2.0);
  col *= mix(1.0, v, clamp(vig + dread * 0.3, 0.0, 1.0));
  col = mix(col, vec3(0.44, 0.015, 0.02), hurt * (1.0 - v) * 0.6);

  // film grain: heaviest in the dark, where a real sensor is noisiest
  float g = hash(uv * res * 0.5 + fract(time) * 137.13);
  col += (g - 0.5) * grain * (0.022 + 0.045 * (1.0 - l) + dread * 0.03);

  col = clamp(col, 0.0, 1.0);
  vec3 lo = col * 12.92;
  vec3 hi = 1.055 * pow(col, vec3(0.4166666667)) - 0.055;
  gl_FragColor = vec4(mix(lo, hi, step(vec3(0.0031308), col)), 1.0);
}`;

function quadMat(frag, uniforms) {
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: frag,
    depthTest: false, depthWrite: false, toneMapped: false
  });
}

export const FX = {
  on: false, ready: false, bloomOn: true,
  exposure: 1.0, bloom: 0.55, grain: 0.75, vig: 0.6, aber: 1, sat: 0.94, contrast: 1.07,
  dread: 0, hurt: 0, flash: 0, t: 0,
  rt: null, a: null, b: null, scene: null, cam: null, quad: null,
  mBright: null, mBlur: null, mComp: null,

  init(renderer, small) {
    const gl = renderer.getContext();
    const half = !!(gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'));
    const type = half ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.bloomOn = !small;
    const opt = { type, depthBuffer: true, stencilBuffer: false, samples: small ? 0 : 4 };
    try {
      this.rt = new THREE.WebGLRenderTarget(2, 2, opt);
      this.a = new THREE.WebGLRenderTarget(2, 2, { type, depthBuffer: false });
      this.b = new THREE.WebGLRenderTarget(2, 2, { type, depthBuffer: false });
    } catch (e) { this.on = false; return; }
    [this.rt, this.a, this.b].forEach((t) => {
      t.texture.minFilter = THREE.LinearFilter;
      t.texture.magFilter = THREE.LinearFilter;
      t.texture.generateMipmaps = false;
    });
    this.mBright = quadMat(BRIGHT, { tIn: { value: null }, thresh: { value: 0.62 }, knee: { value: 0.45 } });
    this.mBlur = quadMat(BLUR, { tIn: { value: null }, dir: { value: new THREE.Vector2() } });
    this.mComp = quadMat(COMP, {
      tScene: { value: null }, tBloom: { value: null }, res: { value: new THREE.Vector2(1, 1) },
      exposure: { value: 1 }, bloom: { value: 0.55 }, grain: { value: 0.85 }, vig: { value: 0.6 },
      aber: { value: 1 }, sat: { value: 0.94 }, contrast: { value: 1.07 }, time: { value: 0 },
      dread: { value: 0 }, hurt: { value: 0 }, flash: { value: 0 }
    });
    this.scene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mComp);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.ready = true;
    this.on = true;
  },

  setSize(w, h, dpr) {
    if (!this.ready) return;
    const W = Math.max(2, Math.round(w * dpr)), H = Math.max(2, Math.round(h * dpr));
    this.rt.setSize(W, H);
    const bw = Math.max(2, W >> 1), bh = Math.max(2, H >> 1);
    this.a.setSize(bw, bh); this.b.setSize(bw, bh);
    this.mComp.uniforms.res.value.set(W, H);
    this.bw = bw; this.bh = bh;
  },

  pass(renderer, mat, target) {
    this.quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.cam);
  },

  render(renderer, scene, camera, dt) {
    if (!this.ready || !this.on) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
    this.t += dt || 0.016;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, camera);

    if (this.bloomOn) {
      this.mBright.uniforms.tIn.value = this.rt.texture;
      this.pass(renderer, this.mBright, this.a);
      // two widths of blur, so the glow has a soft skirt as well as a core
      for (let i = 1; i <= 2; i++) {
        this.mBlur.uniforms.tIn.value = this.a.texture;
        this.mBlur.uniforms.dir.value.set((1.6 * i) / this.bw, 0);
        this.pass(renderer, this.mBlur, this.b);
        this.mBlur.uniforms.tIn.value = this.b.texture;
        this.mBlur.uniforms.dir.value.set(0, (1.6 * i) / this.bh);
        this.pass(renderer, this.mBlur, this.a);
      }
      this.mComp.uniforms.tBloom.value = this.a.texture;
      this.mComp.uniforms.bloom.value = this.bloom;
    } else {
      this.mComp.uniforms.tBloom.value = this.rt.texture;
      this.mComp.uniforms.bloom.value = 0;
    }

    const u = this.mComp.uniforms;
    u.tScene.value = this.rt.texture;
    u.exposure.value = this.exposure;
    u.grain.value = this.grain;
    u.vig.value = this.vig;
    u.aber.value = this.aber;
    u.sat.value = this.sat;
    u.contrast.value = this.contrast;
    u.dread.value = this.dread;
    u.hurt.value = this.hurt;
    u.flash.value = this.flash;
    u.time.value = this.t;
    this.pass(renderer, this.mComp, null);
    this.quad.material = this.mComp;

    // both fear and pain bleed away on their own
    this.hurt = Math.max(0, this.hurt - (dt || 0.016) * 2.4);
    this.flash = Math.max(0, this.flash - (dt || 0.016) * 3.2);
  },

  /* a chapter sets the mood once; dread is nudged frame by frame */
  mood(o) {
    o = o || {};
    this.exposure = o.exposure === undefined ? 1.0 : o.exposure;
    this.bloom = o.bloom === undefined ? 0.55 : o.bloom;
    this.grain = o.grain === undefined ? 0.85 : o.grain;
    this.vig = o.vig === undefined ? 0.6 : o.vig;
    this.sat = o.sat === undefined ? 0.94 : o.sat;
    this.contrast = o.contrast === undefined ? 1.07 : o.contrast;
    this.aber = o.aber === undefined ? 1 : o.aber;
  },
  bleed(x) { this.hurt = Math.min(1, Math.max(this.hurt, x === undefined ? 0.75 : x)); },
  lightning(x) { this.flash = Math.max(this.flash, x === undefined ? 0.5 : x); }
};
