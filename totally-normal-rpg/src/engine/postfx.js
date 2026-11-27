// postfx.js - HDR scene target -> (bloom-lite at 1/4 res) -> one composite pass:
// exposure + ACES filmic + colour grade (saturation, contrast, tint) + vignette + film grain + chromatic aberration
// + screen flash/fade, output sRGB. CONTRACT 5.6: flash(), set(), reset(). Honours settings.reduceFlashing.

const FS_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold;
vec3 safe3(vec3 v) { v = max(v, vec3(0.0)); return (v.x < 60000.0 && v.y < 60000.0 && v.z < 60000.0) ? v : vec3(0.0); }
void main() {
  // NaN / Inf / negative pixels (bad normals somewhere) must never reach the blur, it would smear them over the screen
  vec3 c = safe3(texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb) + safe3(texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb)
         + safe3(texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb) + safe3(texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb);
  c *= 0.25;
  c = min(c, vec3(30.0));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(uThreshold, uThreshold * 2.2 + 0.2, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;

const BLUR_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc; uniform vec2 uDir;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
  c += texture2D(tSrc, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tSrc, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tSrc, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture2D(tSrc, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const COMP_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene, tBloom;
uniform float uExposure, uBloom, uVignette, uGrain, uAberration, uSaturation, uContrast, uTime, uFlash, uFade;
uniform vec3 uTint, uFlashColor, uFadeColor;
uniform vec2 uRes;
uniform float uUseBloom;

vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 color) {
  const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color = ACESInputMat * color; color = RRTAndODTFit(color); color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
vec3 safe3(vec3 v) { v = max(v, vec3(0.0)); return (v.x < 60000.0 && v.y < 60000.0 && v.z < 60000.0) ? v : vec3(0.0); }
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

void main() {
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  vec3 col;
  if (uAberration > 0.0001) {
    vec2 off = cc * uAberration * 0.012;
    col.r = texture2D(tScene, uv + off).r;
    col.g = texture2D(tScene, uv).g;
    col.b = texture2D(tScene, uv - off).b;
  } else {
    col = texture2D(tScene, uv).rgb;
  }
  col = safe3(col);
  if (uUseBloom > 0.5) col += safe3(texture2D(tBloom, uv).rgb) * uBloom;
  col *= uExposure;
  col = aces(col / 0.6);
  col = toSRGB(col);
  // grade (display space)
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSaturation);
  col = (col - 0.5) * uContrast + 0.5;
  col *= uTint;
  // vignette
  float v = smoothstep(0.85, 0.15, length(cc * vec2(uRes.x / uRes.y, 1.0) * 0.9));
  col *= mix(1.0, v, uVignette);
  // fade + flash
  col = mix(col, uFadeColor, clamp(uFade, 0.0, 1.0));
  col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
  // grain (luma-weighted, animated)
  float g = hash(uv * uRes + fract(uTime * 7.31) * 113.0) - 0.5;
  col += g * uGrain * (1.0 - 0.6 * l);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export function createPostfx(THREE, engine) {
  const renderer = engine.renderer;
  const fsGeo = new THREE.BufferGeometry();
  fsGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function makePass(frag, uniforms) {
    const m = new THREE.ShaderMaterial({ uniforms, vertexShader: FS_VERT, fragmentShader: frag, depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(fsGeo, m);
    mesh.frustumCulled = false;
    const sc = new THREE.Scene();
    sc.add(mesh);
    return { scene: sc, mat: m, uniforms };
  }

  let samples = 0;
  const rtOpts = { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false, samples: 0 };
  let sceneRT = new THREE.WebGLRenderTarget(4, 4, rtOpts);
  sceneRT.texture.generateMipmaps = false;
  const smallOpts = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false };
  const bloomA = new THREE.WebGLRenderTarget(4, 4, smallOpts);
  const bloomB = new THREE.WebGLRenderTarget(4, 4, smallOpts);

  const bright = makePass(BRIGHT_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 } });
  const blur = makePass(BLUR_FRAG, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
  const comp = makePass(COMP_FRAG, {
    tScene: { value: sceneRT.texture }, tBloom: { value: bloomA.texture },
    uExposure: { value: 1 }, uBloom: { value: 0.1 }, uVignette: { value: 0.25 }, uGrain: { value: 0.03 },
    uAberration: { value: 0 }, uSaturation: { value: 1 }, uContrast: { value: 1 }, uTime: { value: 0 },
    uFlash: { value: 0 }, uFade: { value: 0 }, uTint: { value: new THREE.Vector3(1, 1, 1) },
    uFlashColor: { value: new THREE.Color(1, 1, 1) }, uFadeColor: { value: new THREE.Color(0, 0, 0) },
    uRes: { value: new THREE.Vector2(1, 1) }, uUseBloom: { value: 1 }
  });

  // grade from the atmosphere (base) + explicit overrides (EVENTS)
  const base = { exposure: 1, saturation: 1, contrast: 1, vignette: 0.25, grain: 0.03, aberration: 0, bloom: 0.1, bloomThreshold: 1, tint: [1, 1, 1] };
  const over = { exposure: null, saturation: null, contrast: null, vignette: null, grain: null, aberration: null, bloom: null, tint: null };
  const overTint = [1, 1, 1];

  // flashes: envelope state
  const flash = { t: 0, dur: 0, rise: 0.05, peak: 0, color: new THREE.Color(1, 1, 1), lastStart: -10 };
  const fade = { v: 0, from: 0, to: 0, t: 0, dur: 0, color: new THREE.Color(0, 0, 0), resolve: null };

  let useBloom = true;
  let width = 4, height = 4;

  function setSize(w, h, pr) {
    width = Math.max(1, Math.floor(w * pr)); height = Math.max(1, Math.floor(h * pr));
    sceneRT.setSize(width, height);
    const bw = Math.max(1, width >> 2), bh = Math.max(1, height >> 2);
    bloomA.setSize(bw, bh); bloomB.setSize(bw, bh);
    comp.uniforms.uRes.value.set(width, height);
    bright.uniforms.uTexel.value.set(1 / width, 1 / height);
  }

  function setQuality(p) {
    useBloom = !!p.bloom;
    const s = p.samples | 0;
    if (s !== samples) {
      samples = s;
      const w = sceneRT.width, h = sceneRT.height;
      sceneRT.dispose();
      sceneRT = new THREE.WebGLRenderTarget(w, h, Object.assign({}, rtOpts, { samples: s }));
      sceneRT.texture.generateMipmaps = false;
      comp.uniforms.tScene.value = sceneRT.texture;
    }
  }

  function reduce() { return !!(engine.ctx.state.settings && engine.ctx.state.settings.reduceFlashing); }

  const api = {
    base,
    get target() { return sceneRT; },
    flash(opts) {
      const o = opts || {};
      const now = engine.realTime;
      const rf = reduce();
      const c = o.color || "#fff";
      // safety: never more than 3 flashes per second - a flash within 0.34 s of the previous one extends it instead
      if (now - flash.lastStart < 0.34 && flash.t < flash.dur) {
        flash.dur = Math.max(flash.dur, flash.t + (rf ? 1.2 : (o.dur || 1.5)) * 0.6);
        return;
      }
      flash.lastStart = now;
      flash.t = 0;
      if (rf) {
        flash.color.set("#b8b8b8");
        flash.peak = Math.min(0.35, o.peak == null ? 1 : o.peak);
        flash.dur = 1.2; flash.rise = 0.4;
      } else {
        flash.color.set(c);
        flash.peak = Math.max(0, Math.min(1, o.peak == null ? 1 : o.peak));
        flash.dur = Math.max(0.15, o.dur == null ? 1.5 : o.dur);
        flash.rise = Math.min(0.06, flash.dur * 0.2);
      }
    },
    // scene-level fade (independent from UI's DOM fade); returns a promise
    fade(to, dur = 0.8, color = "#000") {
      fade.from = fade.v; fade.to = Math.max(0, Math.min(1, to)); fade.t = 0; fade.dur = Math.max(0.001, dur);
      fade.color.set(color);
      if (fade.resolve) { const r = fade.resolve; fade.resolve = null; r(); }
      return new Promise((res) => { fade.resolve = res; });
    },
    set(p) {
      if (!p) return;
      for (const k of ["exposure", "saturation", "contrast", "vignette", "grain", "aberration", "bloom"]) {
        if (p[k] !== undefined) over[k] = p[k] === null ? null : +p[k];
      }
      if (p.tint !== undefined) {
        if (p.tint === null) over.tint = null;
        else { overTint[0] = +p.tint[0]; overTint[1] = +p.tint[1]; overTint[2] = +p.tint[2]; over.tint = overTint; }
      }
    },
    reset() {
      for (const k in over) over[k] = null;
      flash.t = flash.dur = 0;
    },
    setSize, setQuality,
    update(dt) {
      const U = comp.uniforms;
      U.uExposure.value = over.exposure != null ? over.exposure : base.exposure;
      U.uSaturation.value = over.saturation != null ? over.saturation : base.saturation;
      U.uContrast.value = over.contrast != null ? over.contrast : base.contrast;
      U.uVignette.value = over.vignette != null ? over.vignette : base.vignette;
      U.uGrain.value = over.grain != null ? over.grain : base.grain;
      U.uAberration.value = over.aberration != null ? over.aberration : base.aberration;
      U.uBloom.value = over.bloom != null ? over.bloom : base.bloom;
      const t = over.tint || base.tint;
      U.uTint.value.set(t[0], t[1], t[2]);
      U.uTime.value = engine.realTime;
      bright.uniforms.uThreshold.value = base.bloomThreshold;
      // flash envelope (real time so it works while paused/slow-mo)
      if (flash.t < flash.dur) {
        flash.t += dt;
        const x = flash.t;
        let a;
        if (x < flash.rise) a = x / flash.rise;
        else a = Math.max(0, 1 - (x - flash.rise) / Math.max(0.001, flash.dur - flash.rise));
        a = a * a * (3 - 2 * a);
        U.uFlash.value = a * flash.peak;
        U.uFlashColor.value.copy(flash.color);
      } else U.uFlash.value = 0;
      // fade
      if (fade.t < fade.dur) {
        fade.t = Math.min(fade.dur, fade.t + dt);
        const e = fade.t / fade.dur;
        fade.v = fade.from + (fade.to - fade.from) * (e * e * (3 - 2 * e));
        if (fade.t >= fade.dur && fade.resolve) { const r = fade.resolve; fade.resolve = null; r(); }
      }
      U.uFade.value = fade.v;
      U.uFadeColor.value.copy(fade.color);
    },
    render(scene, camera) {
      renderer.setRenderTarget(sceneRT);
      renderer.clear(true, true, false);
      renderer.render(scene, camera);
      const bl = useBloom && comp.uniforms.uBloom.value > 0.001;
      comp.uniforms.uUseBloom.value = bl ? 1 : 0;
      if (bl) {
        bright.uniforms.tSrc.value = sceneRT.texture;
        renderer.setRenderTarget(bloomA); renderer.render(bright.scene, fsCam);
        blur.uniforms.tSrc.value = bloomA.texture; blur.uniforms.uDir.value.set(1 / bloomA.width, 0);
        renderer.setRenderTarget(bloomB); renderer.render(blur.scene, fsCam);
        blur.uniforms.tSrc.value = bloomB.texture; blur.uniforms.uDir.value.set(0, 1 / bloomA.height);
        renderer.setRenderTarget(bloomA); renderer.render(blur.scene, fsCam);
        // second, wider iteration
        blur.uniforms.tSrc.value = bloomA.texture; blur.uniforms.uDir.value.set(2 / bloomA.width, 0);
        renderer.setRenderTarget(bloomB); renderer.render(blur.scene, fsCam);
        blur.uniforms.tSrc.value = bloomB.texture; blur.uniforms.uDir.value.set(0, 2 / bloomA.height);
        renderer.setRenderTarget(bloomA); renderer.render(blur.scene, fsCam);
      }
      renderer.setRenderTarget(null);
      renderer.render(comp.scene, fsCam);
    },
    get flashing() { return flash.t < flash.dur; }
  };
  return api;
}
