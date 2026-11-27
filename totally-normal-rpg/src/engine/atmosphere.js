// atmosphere.js - time-of-day / mood presets (CONTRACT 5.6): sun, hemisphere, sky shader, exponential height fog,
// exposure and colour grade, blended over time. Base preset (WORLD, per zone) + a stack of tagged overrides (EVENTS).
// Cycle >= 1 automatically blends a corrupted grade on top (redder, darker, bruised sky).
// Also installs the global exponential height fog into three's fog shader chunks (every built-in material and every
// ShaderMaterial that merges UniformsLib.fog gets it).

const DEG = Math.PI / 180;

// shared, by-reference fog parameters (plain objects so three's uniform cloning keeps the reference)
export const FOG_PARAMS = { x: 0.012, y: 0, z: 0.5, w: 0.98 };   // falloff, base height, sun scatter, max opacity
export const FOG_SUN_DIR = { x: 0.4, y: 0.6, z: -0.5 };
export const FOG_SUN_COLOR = { x: 1, y: 0.9, z: 0.7 };

export function installHeightFog(THREE) {
  const SC = THREE.ShaderChunk;
  if (SC.__tnrpgFog) return;
  SC.__tnrpgFog = true;
  SC.fog_pars_vertex = "#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying vec3 vFogWorldPos;\n#endif";
  SC.fog_vertex = "#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n\tvFogWorldPos = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );\n#endif";
  SC.fog_pars_fragment = [
    "#ifdef USE_FOG",
    "\tuniform vec3 fogColor;",
    "\tvarying float vFogDepth;",
    "\tvarying vec3 vFogWorldPos;",
    "\tuniform vec4 tnFogA;",
    "\tuniform vec3 tnFogSunDir;",
    "\tuniform vec3 tnFogSunColor;",
    "\t#ifdef FOG_EXP2",
    "\t\tuniform float fogDensity;",
    "\t#else",
    "\t\tuniform float fogNear;",
    "\t\tuniform float fogFar;",
    "\t#endif",
    "#endif"
  ].join("\n");
  SC.fog_fragment = [
    "#ifdef USE_FOG",
    "\tvec3 tnRay = vFogWorldPos - cameraPosition;",
    "\tfloat tnDist = max( length( tnRay ), 1e-4 );",
    "\tvec3 tnDir = tnRay / tnDist;",
    "\t#ifdef FOG_EXP2",
    "\t\tfloat fogFactor;",
    "\t\tif ( tnFogA.x > 0.0 ) {",
    "\t\t\tfloat tnB = tnFogA.x;",
    "\t\t\tfloat tnH = cameraPosition.y - tnFogA.y;",
    "\t\t\tfloat tnT = tnB * tnDir.y * tnDist;",
    "\t\t\ttnT = clamp( tnT, -30.0, 30.0 );",
    "\t\t\tfloat tnFac = abs( tnT ) > 1e-3 ? ( 1.0 - exp( - tnT ) ) / tnT : 1.0;",
    "\t\t\tfloat tnOpt = fogDensity * exp( clamp( - tnB * tnH, -30.0, 30.0 ) ) * tnDist * tnFac;",
    "\t\t\tfogFactor = 1.0 - exp( - max( tnOpt, 0.0 ) );",
    "\t\t} else {",
    "\t\t\tfogFactor = 1.0 - exp( - fogDensity * tnDist );",
    "\t\t}",
    "\t\tfogFactor = min( fogFactor, tnFogA.w > 0.0 ? tnFogA.w : 1.0 );",
    "\t#else",
    "\t\tfloat fogFactor = smoothstep( fogNear, fogFar, vFogDepth );",
    "\t#endif",
    "\tfloat tnSun = pow( max( dot( tnDir, tnFogSunDir ), 0.0 ), 8.0 ) * tnFogA.z;",
    "\tvec3 tnFogCol = mix( fogColor, tnFogSunColor, clamp( tnSun, 0.0, 1.0 ) );",
    "\tgl_FragColor.rgb = mix( gl_FragColor.rgb, tnFogCol, fogFactor );",
    "#endif"
  ].join("\n");
  const extra = {
    tnFogA: { value: FOG_PARAMS },
    tnFogSunDir: { value: FOG_SUN_DIR },
    tnFogSunColor: { value: FOG_SUN_COLOR }
  };
  Object.assign(THREE.UniformsLib.fog, extra);
  const libs = ["basic", "lambert", "phong", "standard", "physical", "toon", "matcap", "points", "dashed", "sprite", "normal"];
  for (const k of libs) {
    const L = THREE.ShaderLib[k];
    if (L && L.uniforms) Object.assign(L.uniforms, extra);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// presets
const BASE = {
  sunElev: 34, sunAz: 215, sunColor: "#fff0dc", sunI: 3.3,
  hemiSky: "#a9c4ea", hemiGround: "#6a5c44", hemiI: 0.75, envI: 1.0,
  fogColor: "#b3c7dc", fogDensity: 0.0014, fogFalloff: 0.012, fogBase: 0, fogSun: 0.55, fogMax: 0.95,
  turbidity: 2.2, rayleigh: 2.1, mie: 0.0035, mieG: 0.8, skyGain: 1, skyTint: [1, 1, 1], skyFog: 0,
  cloud: 0.42, cloudShade: 0.45, stars: 0, night: [0, 0, 0], sunDisc: 1, sunE: 1000,
  exposure: 1.0, saturation: 1.04, contrast: 1.04, tint: [1, 1, 1], vignette: 0.26, grain: 0.03, aberration: 0,
  bloom: 0.12, bloomThreshold: 1.0, shadowI: 0.92
};

const PRESETS = {
  title: { sunElev: -3, sunI: 0.15, hemiI: 0.15, fogColor: "#0c0e12", fogDensity: 0.01, skyGain: 0.15, cloud: 0, exposure: 1 },
  day: {},
  afternoon: { sunElev: 50, sunAz: 245, sunColor: "#fff4e4", sunI: 3.5, cloud: 0.34, fogColor: "#c3d2e0", saturation: 1.06 },
  golden: {
    sunElev: 8, sunAz: 255, sunColor: "#ffb16a", sunI: 2.7, hemiSky: "#8d9cc4", hemiGround: "#6a4830", hemiI: 0.75,
    fogColor: "#e2b48a", fogSun: 0.95, fogDensity: 0.0022, turbidity: 4.5, rayleigh: 2.1, mie: 0.006, mieG: 0.86, envI: 1.1,
    cloud: 0.38, exposure: 1.08, saturation: 1.1, tint: [1.04, 1, 0.94], bloom: 0.2
  },
  kingDark: {
    sunI: 0, hemiSky: "#0b0d14", hemiGround: "#040404", hemiI: 0.05, envI: 0, fogColor: "#000000", fogDensity: 0.03,
    fogFalloff: 0, fogSun: 0, skyGain: 0, skyFog: 1, cloud: 0, exposure: 1.25, saturation: 0.9, vignette: 0.55,
    grain: 0.06, bloom: 0.3, bloomThreshold: 0.6, shadowI: 0
  },
  desertFog: {
    sunElev: 62, sunAz: 200, sunColor: "#fff6ea", sunI: 3.1, hemiSky: "#e8e3da", hemiGround: "#c9b089", hemiI: 0.95,
    fogColor: "#e7dfd2", fogDensity: 0.018, fogFalloff: 0.02, fogSun: 0.3, skyFog: 0.8, cloud: 0, exposure: 0.98,
    saturation: 0.84, contrast: 0.98, bloom: 0.22, envI: 0.6
  },
  desertNight: {
    sunElev: 38, sunAz: 120, sunColor: "#8ea6d6", sunI: 0.35, hemiSky: "#1b2436", hemiGround: "#2a2418", hemiI: 0.28,
    fogColor: "#2a2828", fogDensity: 0.03, fogFalloff: 0.02, fogSun: 0, skyGain: 0.02, skyFog: 0.9, cloud: 0,
    night: [0.004, 0.006, 0.012], exposure: 1.3, saturation: 0.7, vignette: 0.45, grain: 0.06, envI: 0.1, shadowI: 0.6
  },
  forest: {
    sunElev: 30, sunAz: 230, sunColor: "#ffe6c2", sunI: 2.3, hemiSky: "#8ea5a0", hemiGround: "#3a3624", hemiI: 0.48,
    fogColor: "#7c8b84", fogDensity: 0.011, fogFalloff: 0.015, fogSun: 0.6, cloud: 0.62, saturation: 0.9,
    exposure: 1.06, vignette: 0.34, envI: 0.35
  },
  forestNight: {
    sunElev: 50, sunAz: 140, sunColor: "#5d6c9c", sunI: 0.05, hemiSky: "#0a0e18", hemiGround: "#050505", hemiI: 0.13,
    fogColor: "#05070a", fogDensity: 0.03, fogFalloff: 0.01, fogSun: 0, skyGain: 0, skyFog: 0.95,
    night: [0.002, 0.003, 0.006], cloud: 0, exposure: 1.4, saturation: 0.6, vignette: 0.6, grain: 0.08, envI: 0.03,
    shadowI: 0.3
  },
  houseInterior: {
    sunElev: 22, sunAz: 100, sunColor: "#b8c4d0", sunI: 0.45, hemiSky: "#5e5a58", hemiGround: "#3e2e20", hemiI: 0.8,
    fogColor: "#3a3f48", fogDensity: 0.01, fogFalloff: 0.01, fogSun: 0, skyGain: 0.25, cloud: 0.95, cloudShade: 0.8,
    exposure: 1.35, tint: [1.05, 0.98, 0.9], vignette: 0.5, grain: 0.06, envI: 0.3
  },
  collapse: {
    sunElev: 6, sunAz: 180, sunColor: "#ff4a2a", sunI: 2.1, hemiSky: "#4a1a1a", hemiGround: "#1a0808", hemiI: 0.5,
    fogColor: "#3a0c0c", fogDensity: 0.004, fogFalloff: 0.008, fogSun: 0.9, turbidity: 10, rayleigh: 0.5, mie: 0.02,
    skyTint: [1.6, 0.35, 0.3], skyGain: 0.6, cloud: 0.75, cloudShade: 0.9, exposure: 1.1, saturation: 1.1,
    tint: [1.08, 0.9, 0.88], vignette: 0.45, grain: 0.06, envI: 0.3
  },
  throne: {
    sunElev: 40, sunAz: 200, sunColor: "#ffd8a8", sunI: 0.9, hemiSky: "#6a5a48", hemiGround: "#2a2018", hemiI: 0.55,
    fogColor: "#1d1812", fogDensity: 0.008, fogFalloff: 0, fogSun: 0, skyGain: 0.6, exposure: 1.25, vignette: 0.4,
    envI: 0.3
  },
  throneDark: {
    sunElev: 40, sunAz: 200, sunColor: "#5a78b8", sunI: 0.06, hemiSky: "#1a2a48", hemiGround: "#05070c", hemiI: 0.25,
    fogColor: "#04060c", fogDensity: 0.02, fogFalloff: 0, fogSun: 0, skyGain: 0.04, skyFog: 0.8, cloud: 0, exposure: 1.35,
    saturation: 0.8, tint: [0.9, 0.95, 1.1], vignette: 0.55, grain: 0.07, envI: 0.05, shadowI: 0.3
  },
  hollowDesert: {
    sunElev: 55, sunAz: 160, sunColor: "#fffaf0", sunI: 3.6, hemiSky: "#cfd8e8", hemiGround: "#d6c4a0", hemiI: 0.85,
    fogColor: "#dfe3e8", fogDensity: 0.004, fogFalloff: 0.01, turbidity: 6, rayleigh: 0.9, cloud: 0, exposure: 1.0,
    saturation: 0.8, contrast: 1.08, vignette: 0.3, envI: 0.55
  },
  final: {
    sunElev: 70, sunAz: 180, sunColor: "#ffffff", sunI: 3.0, hemiSky: "#ffffff", hemiGround: "#bdbdbd", hemiI: 1.0,
    fogColor: "#f2f2f2", fogDensity: 0.006, fogFalloff: 0, fogSun: 0, skyFog: 1, cloud: 0, exposure: 1.0,
    contrast: 1.12, saturation: 0.75, bloom: 0.25, envI: 0.7
  }
};

const VEC_KEYS = ["sunColor", "hemiSky", "hemiGround", "fogColor", "skyTint", "night", "tint"];
const NUM_KEYS = Object.keys(BASE).filter((k) => VEC_KEYS.indexOf(k) < 0 && k !== "sunElev" && k !== "sunAz");

export function createAtmosphere(THREE, engine, sky, lighting, postfx) {
  const tmpC = new THREE.Color();

  function toLin(v) {
    if (Array.isArray(v)) return [v[0], v[1], v[2]];
    tmpC.set(v); // sRGB hex -> linear working space
    return [tmpC.r, tmpC.g, tmpC.b];
  }

  // compile presets into flat records { num:Float32Array, vec:Float32Array(3*n), dir:[x,y,z] }
  function compile(over) {
    const p = Object.assign({}, BASE, over || {});
    const rec = { num: new Float32Array(NUM_KEYS.length), vec: new Float32Array(VEC_KEYS.length * 3), dir: new Float32Array(3) };
    for (let i = 0; i < NUM_KEYS.length; i++) rec.num[i] = p[NUM_KEYS[i]];
    for (let i = 0; i < VEC_KEYS.length; i++) {
      const c = toLin(p[VEC_KEYS[i]]);
      rec.vec[i * 3] = c[0]; rec.vec[i * 3 + 1] = c[1]; rec.vec[i * 3 + 2] = c[2];
    }
    const el = p.sunElev * DEG, az = p.sunAz * DEG;
    rec.dir[0] = Math.cos(el) * Math.cos(az); rec.dir[1] = Math.sin(el); rec.dir[2] = Math.cos(el) * Math.sin(az);
    return rec;
  }
  const compiled = {};
  for (const k of Object.keys(PRESETS)) compiled[k] = compile(PRESETS[k]);
  const NI = {}; NUM_KEYS.forEach((k, i) => { NI[k] = i; });
  const VI = {}; VEC_KEYS.forEach((k, i) => { VI[k] = i * 3; });

  function cloneRec(r) { return { num: new Float32Array(r.num), vec: new Float32Array(r.vec), dir: new Float32Array(r.dir) }; }
  function copyRec(dst, src) { dst.num.set(src.num); dst.vec.set(src.vec); dst.dir.set(src.dir); }

  // corrupted variant of a record (cycle >= 1): redder, darker, bruised sky
  function corruptInto(dst, src) {
    copyRec(dst, src);
    const v = dst.vec, n = dst.num;
    const mul = (key, r, g, b) => { const o = VI[key]; v[o] *= r; v[o + 1] *= g; v[o + 2] *= b; };
    mul("skyTint", 1.18, 0.7, 0.74);
    mul("fogColor", 1.12, 0.78, 0.78);
    mul("sunColor", 1.05, 0.82, 0.78);
    mul("hemiSky", 1.05, 0.82, 0.86);
    mul("tint", 1.07, 0.93, 0.93);
    n[NI.saturation] *= 0.86;
    n[NI.contrast] *= 1.06;
    n[NI.vignette] += 0.12;
    n[NI.skyGain] *= 0.8;
    n[NI.grain] += 0.015;
    n[NI.cloudShade] = Math.min(1, n[NI.cloudShade] + 0.2);
  }

  const cur = cloneRec(compiled.day);
  const from = cloneRec(compiled.day);
  const target = cloneRec(compiled.day);
  const tmpRec = cloneRec(compiled.day);
  let blendT = 1, blendDur = 0.001;
  let baseId = "day";
  const stack = [];            // { tag, id }
  let corruptAmt = 0;          // eased 0..1 toward (cycle>=1)
  let corruptForced = 0;

  function resolveId(id) {
    if (typeof id !== "string") return { key: "day", corrupt: false };
    let corrupt = false;
    if (id.endsWith("-corrupt")) { corrupt = true; id = id.slice(0, -8); }
    if (!compiled[id]) { console.warn("[atmosphere] unknown preset", id); id = "day"; }
    return { key: id, corrupt };
  }

  function retarget(dur) {
    const top = stack.length ? stack[stack.length - 1].id : baseId;
    const r = resolveId(top);
    copyRec(target, compiled[r.key]);
    corruptForced = r.corrupt ? 1 : 0;
    copyRec(from, cur);
    blendDur = Math.max(0.001, dur == null ? 2 : dur);
    blendT = 0;
    lighting.markEnvDirty();
  }

  function set(id, opts) { baseId = id; retarget(opts && opts.dur != null ? opts.dur : 2); }
  function push(tag, id, opts) {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) stack.splice(i, 1);
    stack.push({ tag, id });
    retarget(opts && opts.dur != null ? opts.dur : 2);
  }
  function pop(tag, opts) {
    let found = false;
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { stack.splice(i, 1); found = true; }
    if (found) retarget(opts && opts.dur != null ? opts.dur : 2);
  }
  function clearOverrides() { stack.length = 0; retarget(0.5); }

  const sunCol = new THREE.Color();
  function apply() {
    const n = cur.num, v = cur.vec;
    // sun
    const d = cur.dir;
    let len = Math.hypot(d[0], d[1], d[2]) || 1;
    lighting.sunDir.set(d[0] / len, d[1] / len, d[2] / len);
    const sunUp = lighting.sunDir.y;
    // fade the direct light out when the sun sinks below the horizon
    const horizonFade = Math.min(1, Math.max(0, (sunUp + 0.02) / 0.08));
    lighting.sun.color.setRGB(v[VI.sunColor], v[VI.sunColor + 1], v[VI.sunColor + 2]);
    lighting.sun.intensity = n[NI.sunI] * horizonFade;
    lighting.sun.shadow.intensity = n[NI.shadowI];
    lighting.hemi.color.setRGB(v[VI.hemiSky], v[VI.hemiSky + 1], v[VI.hemiSky + 2]);
    lighting.hemi.groundColor.setRGB(v[VI.hemiGround], v[VI.hemiGround + 1], v[VI.hemiGround + 2]);
    lighting.hemi.intensity = n[NI.hemiI];
    engine.scene.environmentIntensity = n[NI.envI];
    // keep rendering the shadow map until it exists: a missing map leaves an empty 2D texture on the shadow sampler
    engine.renderer.shadowMap.autoUpdate = lighting.sun.intensity > 0.03 || !lighting.sun.shadow.map;
    // fog
    const fog = engine.scene.fog;
    fog.color.setRGB(v[VI.fogColor], v[VI.fogColor + 1], v[VI.fogColor + 2]);
    fog.density = n[NI.fogDensity];
    FOG_PARAMS.x = n[NI.fogFalloff]; FOG_PARAMS.y = n[NI.fogBase]; FOG_PARAMS.z = n[NI.fogSun]; FOG_PARAMS.w = n[NI.fogMax];
    FOG_SUN_DIR.x = lighting.sunDir.x; FOG_SUN_DIR.y = lighting.sunDir.y; FOG_SUN_DIR.z = lighting.sunDir.z;
    sunCol.setRGB(v[VI.sunColor], v[VI.sunColor + 1], v[VI.sunColor + 2]);
    FOG_SUN_COLOR.x = sunCol.r * 0.9 + fog.color.r * 0.1;
    FOG_SUN_COLOR.y = sunCol.g * 0.9 + fog.color.g * 0.1;
    FOG_SUN_COLOR.z = sunCol.b * 0.9 + fog.color.b * 0.1;
    // keep the scatter colour in the same brightness range as the fog itself
    const fl = Math.max(0.05, fog.color.r + fog.color.g + fog.color.b) / 3;
    const sl = Math.max(0.05, FOG_SUN_COLOR.x + FOG_SUN_COLOR.y + FOG_SUN_COLOR.z) / 3;
    const k = Math.min(1.6, (fl * 1.5) / sl);
    FOG_SUN_COLOR.x *= k; FOG_SUN_COLOR.y *= k; FOG_SUN_COLOR.z *= k;
    // sky
    const U = sky.uniforms;
    U.uSunDir.value.copy(lighting.sunDir);
    U.uTurbidity.value = n[NI.turbidity];
    U.uRayleigh.value = n[NI.rayleigh];
    U.uMie.value = n[NI.mie];
    U.uMieG.value = n[NI.mieG];
    U.uGain.value = n[NI.skyGain];
    U.uSkyFog.value = n[NI.skyFog];
    U.uCloud.value = n[NI.cloud];
    U.uCloudShade.value = n[NI.cloudShade];
    U.uStars.value = n[NI.stars];
    U.uSunDisc.value = n[NI.sunDisc];
    // sun energy follows elevation (Preetham cutoff)
    const zc = Math.max(-1, Math.min(1, sunUp));
    U.uSunE.value = n[NI.sunE] * Math.max(0, 1 - Math.exp(-((1.6110731556870734 - Math.acos(zc)) / 1.5)));
    U.uTint.value.setRGB(v[VI.skyTint], v[VI.skyTint + 1], v[VI.skyTint + 2]);
    U.uNight.value.setRGB(v[VI.night], v[VI.night + 1], v[VI.night + 2]);
    U.uFogColor.value.copy(fog.color);
    U.uCloudLight.value.setRGB(
      (v[VI.sunColor] * 0.55 + v[VI.hemiSky] * 0.45) * Math.max(0.15, n[NI.sunI] / 3.3) * n[NI.skyGain] * 1.35,
      (v[VI.sunColor + 1] * 0.55 + v[VI.hemiSky + 1] * 0.45) * Math.max(0.15, n[NI.sunI] / 3.3) * n[NI.skyGain] * 1.35,
      (v[VI.sunColor + 2] * 0.55 + v[VI.hemiSky + 2] * 0.45) * Math.max(0.15, n[NI.sunI] / 3.3) * n[NI.skyGain] * 1.35
    );
    // grade -> postfx base
    const G = postfx.base;
    G.exposure = n[NI.exposure];
    G.saturation = n[NI.saturation];
    G.contrast = n[NI.contrast];
    G.vignette = n[NI.vignette];
    G.grain = n[NI.grain];
    G.aberration = n[NI.aberration];
    G.bloom = n[NI.bloom];
    G.bloomThreshold = n[NI.bloomThreshold];
    G.tint[0] = v[VI.tint]; G.tint[1] = v[VI.tint + 1]; G.tint[2] = v[VI.tint + 2];
  }

  function update(dt) {
    // corrupted grade amount follows the run cycle
    const want = Math.max(corruptForced, (engine.ctx.state.run.cycle | 0) >= 1 ? 1 : 0);
    let corruptChanged = false;
    if (Math.abs(corruptAmt - want) > 1e-4) {
      corruptAmt += Math.sign(want - corruptAmt) * Math.min(Math.abs(want - corruptAmt), dt / 2.5);
      corruptChanged = true;
    }
    const blending = blendT < 1;
    if (blending) {
      blendT = Math.min(1, blendT + dt / blendDur);
    }
    if (blending || corruptChanged || !applied) {
      const e = blendT * blendT * (3 - 2 * blendT);
      // effective target (with corruption)
      if (corruptAmt > 0) {
        corruptInto(tmpRec, target);
        lerpInto(tmpRec, target, tmpRec, corruptAmt);
      } else copyRec(tmpRec, target);
      lerpInto(cur, from, tmpRec, e);
      apply();
      applied = true;
      if (corruptChanged) lighting.markEnvDirty();
    }
    lighting.updateEnv(dt, sky.envScene, blendT < 1 || corruptChanged);
  }
  let applied = false;

  function lerpInto(dst, a, b, t) {
    for (let i = 0; i < dst.num.length; i++) dst.num[i] = a.num[i] + (b.num[i] - a.num[i]) * t;
    for (let i = 0; i < dst.vec.length; i++) dst.vec[i] = a.vec[i] + (b.vec[i] - a.vec[i]) * t;
    for (let i = 0; i < 3; i++) dst.dir[i] = a.dir[i] + (b.dir[i] - a.dir[i]) * t;
  }

  function snap() { blendT = 1; copyRec(cur, target); applied = false; lighting.markEnvDirty(); }

  return {
    set, push, pop, clearOverrides, update, snap,
    get base() { return baseId; },
    get current() { return stack.length ? stack[stack.length - 1].id : baseId; },
    presets: Object.keys(PRESETS),
    value(key) { return NI[key] != null ? cur.num[NI[key]] : null; }
  };
}
