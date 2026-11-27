// water.js - the river under the bridge (and its upper course on the waterfall plateau), the waterfall sheet and its
// mist. Shader: two scrolling noise normals, Schlick fresnel sky reflection, sun glint, depth tint from the baked
// riverbed depth, shore foam, height fog. CONTRACT 5.6: water.setVisible(bool), water.levelAt(x,z).

import { RIVER, WATERFALL, waterLevelAt } from "./terrain.js";

const WATER_VERT = /* glsl */`
attribute float depth;
varying vec3 vW;
varying float vDepth;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vDepth = depth;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const WATER_FRAG = /* glsl */`
uniform sampler2D tNoise;
uniform float uTime, uFlow, uFoamX;
uniform vec3 uSunDir, uSunCol, uSkyZen, uSkyHor, uDeep, uShallow, uAmb;
varying vec3 vW;
varying float vDepth;
#include <fog_pars_fragment>
void main() {
  vec2 p = vW.xz;
  vec4 a = texture2D(tNoise, p * 0.045 + vec2(uTime * 0.022 * uFlow, uTime * 0.004));
  vec4 b = texture2D(tNoise, p * 0.13 + vec2(uTime * 0.05 * uFlow, -uTime * 0.012));
  vec4 c = texture2D(tNoise, p * 0.41 + vec2(uTime * 0.11 * uFlow, uTime * 0.02));
  vec2 g = (a.rg - 0.5) * 0.22 + (b.gb - 0.5) * 0.16 + (c.ba - 0.5) * 0.12;
  // ripples flatten with distance (mip-like) so the far river reads as a calm mirror, not noise
  float wd = length(cameraPosition - vW);
  g *= mix(1.0, 0.35, smoothstep(8.0, 60.0, wd));
  vec3 n = normalize(vec3(g.x, 1.0, g.y));
  vec3 V = normalize(cameraPosition - vW);
  float ndv = max(dot(n, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, n);
  vec3 sky = mix(uSkyHor, uSkyZen, smoothstep(0.0, 0.6, R.y));
  float spec = pow(max(dot(R, normalize(uSunDir)), 0.0), 420.0) * 22.0 + pow(max(dot(R, normalize(uSunDir)), 0.0), 40.0) * 0.25;
  float d = max(vDepth, 0.0);
  float df = 1.0 - exp(-d * 1.1);
  vec3 body = mix(uShallow, uDeep, df) * uAmb;
  // subsurface-ish scatter of sunlight in the shallows
  body += uShallow * uSunCol * 0.08 * (1.0 - df) * max(uSunDir.y, 0.0);
  vec3 col = mix(body, sky, fres) + uSunCol * spec;
  float alpha = clamp(df * 0.88 + fres * 0.6 + 0.12, 0.0, 1.0) * smoothstep(0.0, 0.08, d);
  // foam: shoreline + plunge pool
  float fn = texture2D(tNoise, p * 0.6 + vec2(uTime * 0.15 * uFlow, 0.0)).r * 0.6 + c.r * 0.4;
  float shore = (1.0 - smoothstep(0.0, 0.3, d)) * smoothstep(0.35, 0.65, fn);
  float pool = smoothstep(uFoamX + 9.0, uFoamX, vW.x) * step(uFoamX - 0.5, vW.x) * smoothstep(0.3, 0.7, fn + 0.25);
  float foam = clamp(shore * 0.8 + pool, 0.0, 1.0);
  vec3 foamCol = (uAmb * 0.9 + uSunCol * 0.25 * max(uSunDir.y, 0.0)) * 0.95;
  col = mix(col, foamCol, foam * 0.85);
  alpha = max(alpha, foam * 0.85 * smoothstep(0.0, 0.05, d));
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}`;

const FALL_VERT = /* glsl */`
varying vec2 vUv;
varying vec3 vW;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FALL_FRAG = /* glsl */`
uniform sampler2D tNoise;
uniform float uTime;
uniform vec3 uAmb, uSunCol;
varying vec2 vUv;
varying vec3 vW;
#include <fog_pars_fragment>
void main() {
  float s1 = texture2D(tNoise, vec2(vUv.x * 2.3, vUv.y * 0.35 + uTime * 0.55)).r;
  float s2 = texture2D(tNoise, vec2(vUv.x * 5.1 + 0.3, vUv.y * 0.8 + uTime * 0.9)).g;
  float s3 = texture2D(tNoise, vec2(vUv.x * 11.0 + 0.7, vUv.y * 1.6 + uTime * 1.4)).b;
  float streak = s1 * 0.5 + s2 * 0.32 + s3 * 0.18;
  float bottom = 1.0 - smoothstep(0.0, 0.22, vUv.y);
  float top = smoothstep(1.0, 0.93, vUv.y);
  float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
  float a = (0.35 + streak * 0.75) * edge * top;
  a = clamp(a + bottom * 0.5, 0.0, 0.95);
  vec3 col = mix(vec3(0.42, 0.55, 0.58), vec3(0.92, 0.96, 0.98), smoothstep(0.35, 0.85, streak) * 0.8 + bottom * 0.5) * (uAmb * 1.1 + uSunCol * 0.18);
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}`;

const MIST_VERT = /* glsl */`
attribute vec4 seed;
uniform float uTime;
varying float vA;
#include <fog_pars_vertex>
void main() {
  float t = fract(uTime * (0.12 + seed.w * 0.1) + seed.w);
  vec3 p = position;
  p.x += t * (3.0 + seed.x * 4.0);
  p.y += t * (2.0 + seed.y * 3.5);
  p.z += (seed.z - 0.5) * t * 3.0;
  vA = sin(t * 3.14159) * 0.55;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (180.0 + seed.y * 220.0) * (1.0 + t) / max(-mvPosition.z, 0.5);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const MIST_FRAG = /* glsl */`
uniform vec3 uAmb;
varying float vA;
#include <fog_pars_fragment>
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(c)) * vA;
  gl_FragColor = vec4(uAmb * 1.2 + 0.05, a * 0.5);
  #include <fog_fragment>
}`;

export function createWater(THREE, engine) {
  const group = new THREE.Group();
  group.name = "water";
  engine.scene.add(group);
  const T = engine.terrain;
  const common = {
    uTime: { value: 0 }, tNoise: { value: engine.noiseTexture },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
    uSkyZen: { value: new THREE.Color(0.3, 0.45, 0.7) }, uSkyHor: { value: new THREE.Color(0.7, 0.78, 0.85) },
    uDeep: { value: new THREE.Color(0.012, 0.035, 0.04) }, uShallow: { value: new THREE.Color(0.06, 0.12, 0.1) },
    uAmb: { value: new THREE.Color(1, 1, 1) }
  };

  function makeStrip(x0, x1, y, flow, foamX) {
    const segX = Math.max(4, Math.round((x1 - x0) / 2)), segZ = 10;
    const z0 = RIVER.z - 9, z1 = RIVER.z + 9;
    const pos = [], dep = [], idx = [];
    for (let j = 0; j <= segZ; j++) for (let i = 0; i <= segX; i++) {
      const x = x0 + (x1 - x0) * i / segX, z = z0 + (z1 - z0) * j / segZ;
      pos.push(x, y, z);
      const h = T.heightAt(x, z);
      dep.push(h < -1e8 ? 3 : y - h);
    }
    for (let j = 0; j < segZ; j++) for (let i = 0; i < segX; i++) {
      const a = j * (segX + 1) + i, b = a + 1, c = a + segX + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("depth", new THREE.Float32BufferAttribute(dep, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uFlow: { value: flow }, uFoamX: { value: foamX } }]);
    Object.assign(u, common);
    const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false, fog: true });
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 2;
    mesh.name = "river";
    group.add(mesh);
    return mesh;
  }

  let built = false;
  let fallMat = null, mistMat = null;
  function build() {
    if (built) return;
    built = true;
    makeStrip(WATERFALL.x, 222, RIVER.surface, 1.0, WATERFALL.x + 0.4);
    makeStrip(-222, WATERFALL.x + 0.6, WATERFALL.top, 1.3, -1000);
    // waterfall sheet: bulges out at the lip
    const segY = 24, segZ = 12, zA = RIVER.z - 5.6, zB = RIVER.z + 5.6;
    const pos = [], uv = [], idx = [];
    const H = WATERFALL.top - RIVER.surface;
    for (let j = 0; j <= segY; j++) {
      const t = j / segY; // 0 bottom .. 1 top
      const y = RIVER.surface - 0.2 + (H + 0.25) * t;
      const out = Math.pow(1 - t, 0.5) * 1.4 + 0.15 - (t > 0.95 ? (t - 0.95) * 10 : 0);
      for (let i = 0; i <= segZ; i++) {
        const z = zA + (zB - zA) * i / segZ;
        pos.push(WATERFALL.x + out * (0.4 + 0.6 * (1 - t)), y, z);
        uv.push(i / segZ, t);
      }
    }
    for (let j = 0; j < segY; j++) for (let i = 0; i < segZ; i++) {
      const a = j * (segZ + 1) + i, b = a + 1, c = a + segZ + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    fg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    fg.setIndex(idx); fg.computeBoundingSphere();
    const fu = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]);
    Object.assign(fu, common);
    fallMat = new THREE.ShaderMaterial({ uniforms: fu, vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const fall = new THREE.Mesh(fg, fallMat);
    fall.renderOrder = 3; fall.name = "waterfall";
    group.add(fall);
    // mist
    const N = 70;
    const mp = new Float32Array(N * 3), ms = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      mp[i * 3] = WATERFALL.x + 0.5 + Math.random() * 1.5; mp[i * 3 + 1] = RIVER.surface + Math.random() * 0.8; mp[i * 3 + 2] = zA + Math.random() * (zB - zA);
      ms[i * 4] = Math.random(); ms[i * 4 + 1] = Math.random(); ms[i * 4 + 2] = Math.random(); ms[i * 4 + 3] = Math.random();
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute("position", new THREE.BufferAttribute(mp, 3));
    mg.setAttribute("seed", new THREE.BufferAttribute(ms, 4));
    mg.boundingSphere = new THREE.Sphere(new THREE.Vector3(WATERFALL.x + 3, 2, RIVER.z), 14);
    const mu = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]);
    Object.assign(mu, common);
    mistMat = new THREE.ShaderMaterial({ uniforms: mu, vertexShader: MIST_VERT, fragmentShader: MIST_FRAG, transparent: true, depthWrite: false, fog: true });
    const mist = new THREE.Points(mg, mistMat);
    mist.renderOrder = 4; mist.name = "mist";
    group.add(mist);
  }

  return {
    group, build, hasWaterfall: true,
    setVisible(v) { group.visible = !!v; },
    levelAt(x, z) { return waterLevelAt(x, z); },
    update(dt, t) {
      if (!group.visible) return;
      common.uTime.value = t;
      const L = engine.lighting;
      common.uSunDir.value.copy(L.sunDir);
      common.uSunCol.value.copy(L.sun.color).multiplyScalar(L.sun.intensity / 3.3);
      const fog = engine.scene.fog;
      common.uSkyHor.value.copy(fog.color);
      common.uSkyZen.value.copy(L.hemi.color).multiplyScalar(L.hemi.intensity * 0.9);
      const amb = L.hemi.intensity * 0.55 + L.sun.intensity * Math.max(0, L.sunDir.y) * 0.12;
      common.uAmb.value.setRGB(L.hemi.color.r * amb, L.hemi.color.g * amb, L.hemi.color.b * amb);
    }
  };
}
