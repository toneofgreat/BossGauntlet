// PLATYPUS — kit3.js: small shared helpers for the level 12-13 modules (volcano, magmor, winddance, woods,
// farlands, babies, house). Build-time only helpers (merging, rock displacement, atlases) plus a few shared
// shader materials. Nothing here allocates per frame.

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
export const sstep = (a, b, x) => smooth((x - a) / (b - a));
export const TAU = Math.PI * 2;
export function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }

// hash value noise (build time: rock shapes, terrain)
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
}
export function fbm2(x, z, oct) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < (oct || 4); i++) { s += a * noise3(x * f, 0.5, z * f); f *= 2.03; a *= 0.5; }
  return s;
}

// displace a geometry's vertices along their direction from `center` (rocks, boulders); shared positions move
// together because the offset is a function of the position only.
export function lumpify(THREE, geo, amt, freq, seed) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  const s = seed || 0;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const l = v.length() || 1;
    const n = noise3(v.x * freq + s, v.y * freq + s * 0.7, v.z * freq - s) * 0.7 + noise3(v.x * freq * 2.7, v.y * freq * 2.7 + 3, v.z * freq * 2.7) * 0.3;
    v.multiplyScalar(1 + (n * amt) / l);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// Merger: many little geometries -> ONE BufferGeometry with position, normal, color and any extra float
// attributes (constant per piece, or a function (x, y, z, i) of the transformed vertex).
export function createMerger(THREE, extraNames) {
  const parts = [];
  const names = extraNames || [];
  const m3 = new THREE.Matrix3(), col = new THREE.Color();
  return {
    add(geo, matrix, color, extras) {
      let g = geo;
      if (!g.attributes.normal) g.computeVertexNormals();
      parts.push({ g, matrix: matrix ? matrix.clone() : null, color: color === undefined || color === null ? 0xffffff : color, extras: extras || {} });
      return parts.length - 1;
    },
    get count() { return parts.length; },
    build() {
      let nv = 0, ni = 0;
      for (const p of parts) { nv += p.g.attributes.position.count; ni += p.g.index ? p.g.index.count : p.g.attributes.position.count; }
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), colA = new Float32Array(nv * 3);
      const ex = names.map(() => new Float32Array(nv));
      const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      const ranges = [];
      let vo = 0, io = 0;
      const v = new THREE.Vector3(), n = new THREE.Vector3();
      for (const p of parts) {
        const P = p.g.attributes.position, N = p.g.attributes.normal, C = p.g.attributes.color;
        if (p.matrix) m3.getNormalMatrix(p.matrix);
        const solid = typeof p.color === "number" || p.color.isColor;
        if (solid) col.set(p.color);
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i);
          if (p.matrix) { v.applyMatrix4(p.matrix); n.applyMatrix3(m3).normalize(); }
          const o = (vo + i) * 3;
          pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z;
          nor[o] = n.x; nor[o + 1] = n.y; nor[o + 2] = n.z;
          if (!solid && typeof p.color === "function") col.set(p.color(v.x, v.y, v.z, i));
          else if (C && p.extras.keepColor) col.setRGB(C.getX(i), C.getY(i), C.getZ(i));
          colA[o] = col.r; colA[o + 1] = col.g; colA[o + 2] = col.b;
          for (let k = 0; k < names.length; k++) {
            const e = p.extras[names[k]];
            ex[k][vo + i] = typeof e === "function" ? e(v.x, v.y, v.z, i) : e || 0;
          }
        }
        if (p.g.index) { const I = p.g.index; for (let i = 0; i < I.count; i++) idx[io + i] = I.getX(i) + vo; io += I.count; }
        else { for (let i = 0; i < P.count; i++) idx[io + i] = vo + i; io += P.count; }
        ranges.push({ start: vo, count: P.count });
        vo += P.count;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
      g.setAttribute("color", new THREE.BufferAttribute(colA, 3));
      names.forEach((nm, k) => g.setAttribute(nm, new THREE.BufferAttribute(ex[k], 1)));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      g.userData.ranges = ranges;
      return g;
    },
  };
}

export const mat4 = (THREE, x, y, z, rx, ry, rz, sx, sy, sz) => {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, "YXZ"));
  return m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx === undefined ? 1 : sx, sy === undefined ? (sx === undefined ? 1 : sx) : sy, sz === undefined ? (sx === undefined ? 1 : sx) : sz));
};

// a height grid mesh (vertex coloured) from h(x, z) and c(x, z, y, slope) -> hex; returns { mesh geometry, heightAt }
export function heightGrid(THREE, o) {
  const { x0, z0, nx, nz, pitch } = o;
  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = o.h(x0 + i * pitch, z0 + j * pitch);
  const g = new THREE.PlaneGeometry((nx - 1) * pitch, (nz - 1) * pitch, nx - 1, nz - 1);
  g.rotateX(-Math.PI / 2);
  g.translate(x0 + ((nx - 1) * pitch) / 2, 0, z0 + ((nz - 1) * pitch) / 2);
  const P = g.attributes.position;
  // PlaneGeometry rotated: rows run from -z (j = 0 at the far edge after rotation) -> map by position
  for (let k = 0; k < P.count; k++) {
    const i = Math.round((P.getX(k) - x0) / pitch), j = Math.round((P.getZ(k) - z0) / pitch);
    P.setY(k, H[j * nx + i]);
  }
  g.computeVertexNormals();
  const N = g.attributes.normal, cols = new Float32Array(P.count * 3), glow = new Float32Array(P.count), c = new THREE.Color();
  for (let k = 0; k < P.count; k++) {
    const r = o.c(P.getX(k), P.getZ(k), P.getY(k), 1 - N.getY(k));
    c.set(r.hex !== undefined ? r.hex : r);
    cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
    glow[k] = r.glow || 0;
  }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  g.setAttribute("aGlow", new THREE.BufferAttribute(glow, 1));
  const x1 = x0 + (nx - 1) * pitch, z1 = z0 + (nz - 1) * pitch;
  function heightAt(x, z) {
    const fx = clamp((x - x0) / pitch, 0, nx - 1.0001), fz = clamp((z - z0) / pitch, 0, nz - 1.0001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, b = j * nx + i;
    return (H[b] * (1 - u) + H[b + 1] * u) * (1 - v) + (H[b + nx] * (1 - u) + H[b + nx + 1] * u) * v;
  }
  return { geometry: g, heightAt, H, x1, z1 };
}

// ------------------------------------------------------------------------------------------ shaders

export const GLSL_NOISE = `
float k3h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float k3n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(k3h(i), k3h(i + vec2(1, 0)), u.x), mix(k3h(i + vec2(0, 1)), k3h(i + vec2(1, 1)), u.x), u.y); }
float k3f(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * k3n(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
float k3cell(vec2 p){ vec2 i = floor(p), f = fract(p); float d = 1.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){ vec2 g = vec2(float(x), float(y)); vec2 o = vec2(k3h(i + g), k3h(i + g + 17.0));
    d = min(d, length(g + o - f)); } return d; }
`;

// vertex-coloured standard material whose `aGlow` attribute glows (lava streaks in rock, embers in cracks).
// uniforms (shared by every material made with the same `U`): uTime, uGlow (0..1), uGlowCol.
export function glowRockMaterial(THREE, U, o) {
  o = o || {};
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.roughness === undefined ? 0.92 : o.roughness, metalness: 0, flatShading: !!o.flat });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uGlow = U.uGlow; sh.uniforms.uGlowCol = U.uGlowCol;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aGlow;\nvarying float vGlow;\nvarying vec3 vWP;")
      .replace("#include <fog_vertex>", "#include <fog_vertex>\nvGlow = aGlow;\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uTime, uGlow;\nuniform vec3 uGlowCol;\nvarying float vGlow;\nvarying vec3 vWP;\n" + GLSL_NOISE)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        { float fl = k3n(vWP.xz * 0.35 + vec2(0.0, -uTime * 0.6)) * 0.6 + 0.6;
          float g = vGlow * uGlow * fl;
          totalEmissiveRadiance += uGlowCol * g * g * 2.2;
          diffuseColor.rgb *= 1.0 - min(g, 1.0) * 0.7; }`);
  };
  m.customProgramCacheKey = () => "k3glowrock" + (o.flat ? 1 : 0);
  return m;
}

// a tileable noise texture, built once: R = fbm value noise, G = a second fbm (offset), B = cell edges (Worley F2 - F1,
// 0 on the seams), A = cell id. Sampling it is far cheaper on small GPUs than procedural noise per pixel.
let NOISE_TEX = null;
export function noiseTexture(THREE) {
  if (NOISE_TEX) return NOISE_TEX;
  const N = 256, data = new Uint8Array(N * N * 4), R = mulberry(1234);
  const lat = (L) => { const g = new Float32Array(L * L); for (let i = 0; i < g.length; i++) g[i] = R(); return g; };
  const octs = [8, 16, 32, 64].map((L) => ({ L, g: lat(L) })), octs2 = [8, 16, 32, 64].map((L) => ({ L, g: lat(L) }));
  const vn = (o, x, y) => { const L = o.L, fx = x * L, fy = y * L, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const s = (a, b) => o.g[((b % L + L) % L) * L + ((a % L + L) % L)]; const uu = u * u * (3 - 2 * u), vv = v * v * (3 - 2 * v);
    return (s(i, j) * (1 - uu) + s(i + 1, j) * uu) * (1 - vv) + (s(i, j + 1) * (1 - uu) + s(i + 1, j + 1) * uu) * vv; };
  const C = 10, pts = []; for (let i = 0; i < C * C; i++) pts.push([R(), R()]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    let f = 0, f2 = 0, a = 0.5;
    for (let o = 0; o < 4; o++) { f += vn(octs[o], u, v) * a; f2 += vn(octs2[o], u, v) * a; a *= 0.5; }
    const cx = Math.floor(u * C), cy = Math.floor(v * C);
    let d1 = 9, d2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j, w = ((gy % C + C) % C) * C + ((gx % C + C) % C), p = pts[w];
      const dx = (gx + p[0]) / C - u, dy = (gy + p[1]) / C - v, d = Math.sqrt(dx * dx + dy * dy) * C;
      if (d < d1) { d2 = d1; d1 = d; id = w; } else if (d < d2) d2 = d;
    }
    const o = (y * N + x) * 4;
    data[o] = clamp(f / 0.94, 0, 1) * 255; data[o + 1] = clamp(f2 / 0.94, 0, 1) * 255; data[o + 2] = clamp((d2 - d1) * 1.4, 0, 1) * 255; data[o + 3] = (id * 37) % 256;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  NOISE_TEX = t;
  return t;
}

// flowing lava: crust plates drifting on the melt, bright seams, thin crust glowing dull red, a slow pulse; uCool 0..1
// cools it to dark stone. One texture fetch set per pixel (noiseTexture), shared uniforms.
export function lavaMaterial(THREE, U, o) {
  o = o || {};
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uFlow: { value: new THREE.Vector2(o.flowX || 0, o.flowZ === undefined ? 0.3 : o.flowZ) }, uScale: { value: o.scale || 0.22 } }]);
  uniforms.uTime = U.uTime; uniforms.uGlow = U.uGlow; uniforms.uCool = U.uCool; uniforms.tNoise = { value: noiseTexture(THREE) };
  return new THREE.ShaderMaterial({
    uniforms, fog: true,
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vWP;
      uniform float uTime;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += sin(wp.x * 0.4 + uTime * 1.3) * cos(wp.z * 0.37 - uTime) * 0.04;
        vWP = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime, uGlow, uCool, uScale;
      uniform vec2 uFlow;
      uniform sampler2D tNoise;
      varying vec3 vWP;
      void main(){
        vec2 p = vWP.xz * uScale * 0.12 + uFlow * uTime * 0.012;
        vec4 w = texture2D(tNoise, p * 0.5 + vec2(uTime * 0.004, -uTime * 0.003));
        vec2 q = p + (w.rg - 0.5) * 0.08;
        vec4 a = texture2D(tNoise, q);
        vec4 b = texture2D(tNoise, q * 3.1 + 0.37);
        float seam = smoothstep(0.1, 0.0, a.b) ;                     // big plate seams
        float fine = smoothstep(0.07, 0.0, b.b) * 0.55;               // small cracks inside plates
        float thin = smoothstep(0.62, 0.3, a.r);                      // thin crust shows a dull red
        float pulse = 0.82 + 0.18 * sin(uTime * 1.6 + a.g * 12.0);
        vec3 crust = mix(vec3(0.02, 0.014, 0.012), vec3(0.06, 0.04, 0.035), b.r) * (0.7 + 0.6 * a.g);
        vec3 col = crust;
        col += vec3(0.55, 0.07, 0.01) * thin * thin * 0.7 * pulse * uGlow;
        float c = max(seam, fine * (1.0 - thin * 0.5));
        col = mix(col, mix(vec3(0.95, 0.22, 0.02), vec3(1.0, 0.72, 0.22), seam * seam) * (1.0 + 0.4 * seam), c * pulse * uGlow);
        vec3 cold = mix(vec3(0.025, 0.024, 0.023), vec3(0.07, 0.066, 0.063), b.r) * (0.75 + 0.5 * a.g);
        cold += vec3(0.45, 0.09, 0.02) * seam * 0.2 * (1.0 - uCool);
        col = mix(col, cold, uCool);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

// a sky dome that follows the camera: vertical gradient + a glow toward a direction + optional moon / stars.
export function skyDome(THREE, o) {
  const u = {
    uTop: { value: new THREE.Color(o.top) }, uHor: { value: new THREE.Color(o.horizon) }, uBot: { value: new THREE.Color(o.bottom || o.horizon) },
    uGlowCol: { value: new THREE.Color(o.glowCol || 0x000000) }, uGlowDir: { value: new THREE.Vector3().fromArray(o.glowDir || [0, 0, 1]).normalize() },
    uGlowK: { value: o.glowK || 0 }, uMoonDir: { value: new THREE.Vector3().fromArray(o.moonDir || [0, 1, 0]).normalize() }, uMoon: { value: o.moon || 0 },
    uStars: { value: o.stars || 0 }, uTime: o.uTime || { value: 0 }, uClouds: { value: o.clouds || 0 }, uCloudCol: { value: new THREE.Color(o.cloudCol || 0x444444) },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u, depthWrite: false, side: THREE.BackSide, fog: false,
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 uTop, uHor, uBot, uGlowCol, uGlowDir, uMoonDir, uCloudCol; uniform float uGlowK, uMoon, uStars, uTime, uClouds;
      varying vec3 vD;
      ${GLSL_NOISE}
      void main(){
        vec3 d = normalize(vD);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHor, uBot, clamp(-h * 3.0, 0.0, 1.0));
        float g = max(dot(d, uGlowDir), 0.0);
        col += uGlowCol * (pow(g, 6.0) * 0.8 + pow(g, 40.0) * 0.6) * uGlowK;
        col += uGlowCol * 0.35 * uGlowK * exp(-abs(h) * 9.0);
        if (uMoon > 0.0) {
          float m = dot(d, uMoonDir);
          col += vec3(0.85, 0.9, 1.0) * smoothstep(0.9993, 0.9996, m) * uMoon;
          col += vec3(0.25, 0.32, 0.45) * pow(max(m, 0.0), 60.0) * uMoon * 0.6;
        }
        if (uStars > 0.0 && h > 0.0) {
          vec2 sp = d.xz / (d.y + 0.35) * 160.0;
          float s = k3h(floor(sp));
          float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 60.0);
          col += vec3(smoothstep(0.985, 1.0, s) * smoothstep(0.35, 0.0, length(fract(sp) - 0.5)) * tw * uStars * smoothstep(0.0, 0.25, h));
        }
        if (uClouds > 0.0) {
          vec2 cp = d.xz / (abs(d.y) + 0.2) * 1.6 + vec2(uTime * 0.01, 0.0);
          float c = smoothstep(0.45, 0.85, k3f(cp)) * smoothstep(-0.05, 0.25, h) * uClouds;
          col = mix(col, uCloudCol, c);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = "sky";
  return { mesh, u };
}

// a camera-following particle cloud (ash falling / embers rising / fireflies / dust) in ONE draw call; all motion
// in the vertex shader. kinds: 0 ash, 1 ember, 2 firefly, 3 mote. setOn(k) fades it.
export function particleCloud(THREE, U, o) {
  const n = o.count || 600, box = o.box || 30, kind = o.kind || 0;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  const R = mulberry(o.seed || 7);
  for (let i = 0; i < n; i++) { pos[i * 3] = R() * box; pos[i * 3 + 1] = R() * box; pos[i * 3 + 2] = R() * box; seed[i] = R(); }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const u = { uTime: U.uTime, uCam: { value: new THREE.Vector3() }, uBox: { value: box }, uOn: { value: 1 }, uCol: { value: new THREE.Color(o.color || 0xffffff) }, uSize: { value: o.size || 0.1 }, uScale: { value: 400 }, uY0: { value: o.y0 === undefined ? -1e4 : o.y0 } };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: kind === 0 ? THREE.NormalBlending : THREE.AdditiveBlending, fog: false,
    vertexShader: `
      uniform float uTime, uBox, uOn, uSize, uScale, uY0; uniform vec3 uCam; attribute float aSeed; varying float vA; varying float vS;
      void main(){
        vec3 p = position;
        float t = uTime;
        ${kind === 0 ? "p.y -= t * (0.6 + aSeed * 0.5); p.x += sin(t * 0.7 + aSeed * 30.0) * 0.8 + t * 0.3; p.z += cos(t * 0.5 + aSeed * 20.0) * 0.8;" : ""}
        ${kind === 1 ? "p.y += t * (1.2 + aSeed * 1.6); p.x += sin(t * 2.0 + aSeed * 40.0) * 0.6; p.z += cos(t * 1.7 + aSeed * 33.0) * 0.6;" : ""}
        ${kind === 2 ? "p.y += sin(t * 0.4 + aSeed * 20.0) * 1.2; p.x += sin(t * 0.3 + aSeed * 50.0) * 2.0; p.z += cos(t * 0.27 + aSeed * 70.0) * 2.0;" : ""}
        ${kind === 3 ? "p.y += sin(t * 0.2 + aSeed * 20.0) * 0.6 + t * 0.05; p.x += t * 0.08; p.z += sin(t * 0.13 + aSeed * 9.0);" : ""}
        vec3 w = uCam + mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
        vec4 mv = modelViewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = length(w - uCam) / (uBox * 0.5);
        vA = uOn * (1.0 - smoothstep(0.6, 1.0, d)) * step(uY0, w.y);
        ${kind === 1 ? "vA *= 0.55 + 0.45 * sin(t * 9.0 + aSeed * 80.0);" : ""}
        ${kind === 2 ? "vA *= smoothstep(0.2, 1.0, sin(t * 1.4 + aSeed * 61.0));" : ""}
        vS = aSeed;
        gl_PointSize = uSize * (0.6 + aSeed * 0.8) * uScale / max(-mv.z, 0.5);
      }`,
    fragmentShader: `
      uniform vec3 uCol; varying float vA; varying float vS;
      void main(){
        vec2 c = gl_PointCoord - 0.5; float r = length(c);
        float a = smoothstep(0.5, ${kind === 0 ? "0.2" : "0.0"}, r) * vA;
        if (a < 0.01) discard;
        vec3 col = uCol${kind === 1 ? " * (1.0 + 0.6 * (0.5 - r))" : ""};
        gl_FragColor = vec4(col, a${kind === 0 ? " * 0.7" : ""});
        #include <colorspace_fragment>
      }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.name = o.name || "particles";
  return {
    points: pts, u,
    follow(cam) { u.uCam.value.copy(cam.position); },
    setOn(k) { u.uOn.value = k; pts.visible = k > 0.001; },
  };
}

// text into a canvas texture (build time only)
export function textTexture(THREE, lines, o) {
  o = o || {};
  const w = o.w || 1024, h = o.h || 256;
  const cv = typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (!cv) return null;
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d");
  g.fillStyle = o.bg || "rgba(0,0,0,0)"; g.fillRect(0, 0, w, h);
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = o.color || "#fff";
  g.font = o.font || "bold 120px Georgia, serif";
  const lh = h / lines.length;
  lines.forEach((l, i) => g.fillText(l, w / 2, lh * (i + 0.5)));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
