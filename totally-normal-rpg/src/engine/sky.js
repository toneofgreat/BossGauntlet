// sky.js - analytic sky dome: Preetham-style Rayleigh/Mie single scattering + sun disc + drifting clouds + stars,
// blended into the fog colour at the horizon. Drawn LAST among opaques at the far plane (only empty pixels shade).

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
}`;

const FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 uSunDir;
uniform float uRayleigh, uTurbidity, uMie, uMieG, uGain, uSkyFog, uCloud, uCloudShade, uStars, uTime, uSunDisc, uSunE;
uniform vec3 uTint, uFogColor, uCloudLight, uNight;
uniform sampler2D tNoise;

const float PI = 3.141592653589793;
const vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
const vec3 MieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);
const float rayleighZenithLength = 8.4E3;
const float mieZenithLength = 1.25E3;

float rayleighPhase(float c) { return 0.05968310365946075 * (1.0 + c * c); }
float hgPhase(float c, float g) { float g2 = g * g; return 0.07957747154594767 * ((1.0 - g2) / pow(1.0 - 2.0 * g * c + g2, 1.5)); }
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }

void main() {
  vec3 dir = normalize(vDir);
  vec3 sunDir = normalize(uSunDir);
  float sunUp = sunDir.y;
  // ---- scattering (zenith angle clamped at the horizon, ground handled by fog blend)
  float dy = max(dir.y, 0.0);
  float zen = acos(dy);
  float inv = 1.0 / (cos(zen) + 0.15 * pow(max(93.885 - zen * 57.29578, 0.001), -1.253));
  float sR = rayleighZenithLength * inv;
  float sM = mieZenithLength * inv;
  float rayleighCoef = uRayleigh;
  vec3 betaR = totalRayleigh * rayleighCoef;
  vec3 betaM = 0.434 * (0.2 * uTurbidity) * 10E-18 * MieConst * uMie;
  vec3 Fex = exp(-(betaR * sR + betaM * sM));
  float cosT = dot(dir, sunDir);
  vec3 bRT = betaR * rayleighPhase(cosT * 0.5 + 0.5);
  vec3 bMT = betaM * hgPhase(cosT, uMieG);
  vec3 ratio = (bRT + bMT) / (betaR + betaM);
  vec3 Lin = pow(uSunE * ratio * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(uSunE * ratio * Fex, vec3(0.5)), clamp(pow(1.0 - sunUp, 5.0), 0.0, 1.0));
  vec3 L0 = vec3(0.1) * Fex;
  float disc = smoothstep(0.99990 - uSunDisc * 0.00008, 0.99996 - uSunDisc * 0.00002, cosT);
  vec3 sunCol = uSunE * 19000.0 * Fex * disc * step(0.0, dir.y + 0.02);
  vec3 sky = (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);
  sky = max(sky, vec3(0.0)) * 0.07;          // scale the Preetham radiance into the HDR pipeline's range (zenith ~0.5)
  sky = sky * uTint * uGain + uNight * (1.0 - smoothstep(-0.1, 0.2, sunUp));
  vec3 sunAdd = min(sunCol * 0.0006, vec3(40.0)) * uGain;

  // ---- clouds: noise texture projected on a high plane
  vec3 col = sky;
  if (uCloud > 0.001 && dir.y > 0.0) {
    vec2 cp = dir.xz / (dir.y + 0.12) * 0.35 + vec2(uTime * 0.004, uTime * 0.0015);
    float n = texture2D(tNoise, cp * 0.6).r * 0.55 + texture2D(tNoise, cp * 1.7 + 0.31).g * 0.3 + texture2D(tNoise, cp * 4.3).b * 0.15;
    float cover = smoothstep(1.0 - uCloud, 1.0 - uCloud + 0.28, n);
    float thick = smoothstep(1.0 - uCloud, 1.0, n);
    float silver = pow(max(cosT, 0.0), 6.0) * 1.5;
    vec3 cl = uCloudLight * (1.0 - thick * uCloudShade) + uCloudLight * silver * (1.0 - thick) ;
    cl = mix(cl, sky * 1.4, 0.25);
    float fadeH = smoothstep(0.0, 0.25, dir.y);
    col = mix(col, cl, cover * fadeH);
    sunAdd *= 1.0 - cover * fadeH;
  }
  col += sunAdd;
  // ---- stars
  if (uStars > 0.001 && dir.y > 0.0) {
    vec3 sp = dir * 380.0;
    vec3 cell = floor(sp);
    float h = hash3(cell);
    if (h > 0.9965) {
      vec3 f = fract(sp) - 0.5;
      float d = length(f);
      float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
      col += vec3(0.8, 0.85, 1.0) * smoothstep(0.32, 0.0, d) * uStars * tw * smoothstep(0.0, 0.2, dir.y) * 1.5;
    }
  }
  // ---- horizon -> fog colour (and below the horizon all fog)
  float hz = smoothstep(-0.04, 0.22, dir.y);
  float fogMix = max(uSkyFog, 1.0 - hz);
  col = mix(col, uFogColor, clamp(fogMix, 0.0, 1.0));
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}`;

export function createSky(THREE, engine, noiseTex) {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0.4, 0.6, -0.5) },
    uRayleigh: { value: 1.6 },
    uTurbidity: { value: 3.0 },
    uMie: { value: 0.004 },
    uMieG: { value: 0.82 },
    uGain: { value: 1 },
    uSunE: { value: 1000 },
    uSkyFog: { value: 0 },
    uCloud: { value: 0.4 },
    uCloudShade: { value: 0.5 },
    uStars: { value: 0 },
    uTime: { value: 0 },
    uSunDisc: { value: 1 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uFogColor: { value: new THREE.Color(0.6, 0.7, 0.8) },
    uCloudLight: { value: new THREE.Color(1, 1, 1) },
    uNight: { value: new THREE.Color(0, 0, 0) },
    tNoise: { value: noiseTex }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false
  });
  mat.depthFunc = THREE.LessEqualDepth;
  const geo = new THREE.SphereGeometry(100, 32, 16);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "sky";
  mesh.renderOrder = 10000;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = true;

  // a second scene for environment (PMREM) captures
  const envScene = new THREE.Scene();
  const envMesh = new THREE.Mesh(geo, mat);
  envMesh.frustumCulled = false;
  envScene.add(envMesh);

  return {
    mesh, uniforms, material: mat, envScene,
    update(camera, t) {
      mesh.position.copy(camera.position);
      uniforms.uTime.value = t;
    }
  };
}
