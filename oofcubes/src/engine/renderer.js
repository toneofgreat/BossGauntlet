// src/engine/renderer.js
// Three.js scene/renderer setup: hemisphere+directional lighting rig, sky dome, fog,
// quality tiers with SwiftShader auto-detect, and the PERF budgets consumed by
// parts.js (spec 03) and validate.js (spec 04). Spec 02 §5.2.

import * as THREE from "../../assets/vendor/three.module.js";

// Perf budgets, spec 02 §5.2/§6 (the single source for these numbers) — frozen,
// consumed by parts.js instancing policy and validate.js's static-part cap.
export const PERF = Object.freeze({
  maxActiveParts: 3000, // hard cap on live parts per Place (runtime; smoke asserts it)
  maxStaticParts: 1500, // validate.js cap on place.json parts array length
  maxDrawCalls: 300, // smoke.js asserts getPerfSnapshot().drawCalls <= this after spawn
  instancingThreshold: 2, // min batch size for an anchored behavior-less group to instance
  maxLights: 2, // hemisphere + directional only — Places may not add lights (v1)
});

// Per-tier tuning, spec 02 §6. QualityTier is "low" | "med" | "high" (§3.2); "medium"
// and "auto" are accepted only as setQuality()/initialTier input aliases, never stored.
export const QUALITY = Object.freeze({
  low: Object.freeze({
    pixelRatioCap: 1,
    shadows: false,
    shadowMapSize: 0,
    shadowMapType: null,
    shadowHalfExtent: 0,
    fogFar: 300,
    skySegments: 12,
  }),
  med: Object.freeze({
    pixelRatioCap: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    shadowMapType: THREE.PCFShadowMap,
    shadowHalfExtent: 60,
    fogFar: 500,
    skySegments: 24,
  }),
  high: Object.freeze({
    pixelRatioCap: 2,
    shadows: true,
    shadowMapSize: 2048,
    shadowMapType: THREE.PCFSoftShadowMap,
    shadowHalfExtent: 70,
    fogFar: 700,
    skySegments: 32,
  }),
});

// Lighting rig defaults, spec 02 §5.2 "Lighting rig (exact, defaults)" + §6. This is
// what a fresh renderer boots with and what applyLighting({}) / applyLighting(null)
// restores after a Place override (§7 criterion 6).
const LIGHTING_DEFAULTS = Object.freeze({
  skyTop: "#4aa8ff",
  skyHorizon: "#cfe4ff", // fixed internal gradient midpoint stop — not a LightingConfig field (04 §3.3 exposes only skyTop/skyBottom)
  skyBottom: "#87a8c8",
  hemiSky: "#cfe8ff",
  hemiGround: "#5f6f52",
  hemiIntensity: 0.85,
  sunColor: "#fff2dd",
  sunIntensity: 1.15,
  fogColor: "#cfe4ff",
});
// "direction toward sun (−0.45, 1.0, 0.3) normalized" — spec 02 §5.2. This is already
// in toward-sun form; it is the engine's own default and is NOT derived by negating
// any LightingConfig.sunDirection default (that field uses the opposite, travel-from-
// sun convention — see readSunDirection below).
const DEFAULT_SUN_DIR_TOWARD_SUN = new THREE.Vector3(-0.45, 1.0, 0.3).normalize();

const SKY_RADIUS = 850;
const FOG_NEAR_RATIO = 0.55;
const AMBIENT_GROUND_DARKEN = 0.4; // hemiGround = darken(ambient, 0.4), spec 02 §3.3
const SHADOW_GRID_SNAP = 4; // units; shadow target quantization to prevent shimmer
const SHADOW_CAMERA_NEAR = 1;
const SHADOW_CAMERA_FAR = 400;
const SHADOW_BIAS = -0.0006;
const SHADOW_NORMAL_BIAS = 0.02;
const SUN_DISTANCE = 150; // light sits at shadowTarget + towardSunDir * 150
const RESIZE_DEBOUNCE_MS = 100;
const FPS_SAMPLE_WINDOW = 4;
const AUTO_DOWNGRADE_HIGH_FPS = 25; // mean < this on "high" -> downgrade to "med"
const AUTO_DOWNGRADE_MED_FPS = 22; // mean < this on "med" -> downgrade to "low"
const AUTO_DOWNGRADE_COOLDOWN_MS = 8000; // at most one downgrade per 8 s

const VALID_TIERS = new Set(["low", "med", "high"]);
const TIER_ALIASES = { medium: "med" };

function normalizeTierInput(tier) {
  if (tier === "auto") return "auto";
  return Object.prototype.hasOwnProperty.call(TIER_ALIASES, tier) ? TIER_ALIASES[tier] : tier;
}

// ===== color helpers =====

function isValidHex(v) {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

function readColor(value, fallback, fieldName) {
  if (value === undefined) return fallback;
  if (isValidHex(value)) return value.toLowerCase();
  console.warn(`renderer.applyLighting: invalid hex color for "${fieldName}": ${JSON.stringify(value)} — ignored`);
  return fallback;
}

// No exact formula is given by spec 02 §3.3 beyond the name "darken(ambient, 0.4)" —
// implemented as a linear RGB multiply toward black (channel *= 1 - factor); see
// specGaps in the task report.
function darken(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const k = 1 - factor;
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  const toHex = (v) => v.toString(16).padStart(2, "0");
  return `#${toHex(clamp((n >> 16) & 255))}${toHex(clamp((n >> 8) & 255))}${toHex(clamp(n & 255))}`;
}

function readSunDirection(value) {
  if (Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === "number" && Number.isFinite(n))) {
    // LightingConfig.sunDirection is the direction the light TRAVELS (spec 04 §3.3
    // convention, FROM the sun, y < 0) — negate to get the direction TOWARD the sun
    // used to position the light (spec 02 §5.2).
    return new THREE.Vector3(-value[0], -value[1], -value[2]).normalize();
  }
  return DEFAULT_SUN_DIR_TOWARD_SUN.clone();
}

// ===== LightingConfig resolution (spec 04 §3.3 schema; spec 02 §5.2 defaults) =====

function resolveHemi(c) {
  const hemiIntensity = typeof c.ambientIntensity === "number" ? c.ambientIntensity : LIGHTING_DEFAULTS.hemiIntensity;
  if (c.ambient === undefined) {
    return { hemiSky: LIGHTING_DEFAULTS.hemiSky, hemiGround: LIGHTING_DEFAULTS.hemiGround, hemiIntensity };
  }
  if (!isValidHex(c.ambient)) {
    console.warn(`renderer.applyLighting: invalid hex color for "ambient": ${JSON.stringify(c.ambient)} — ignored`);
    return { hemiSky: LIGHTING_DEFAULTS.hemiSky, hemiGround: LIGHTING_DEFAULTS.hemiGround, hemiIntensity };
  }
  const hemiSky = c.ambient.toLowerCase();
  return { hemiSky, hemiGround: darken(hemiSky, AMBIENT_GROUND_DARKEN), hemiIntensity };
}

function resolveSun(c) {
  return {
    sunColor: readColor(c.sunColor, LIGHTING_DEFAULTS.sunColor, "sunColor"),
    sunIntensity: typeof c.sunIntensity === "number" ? c.sunIntensity : LIGHTING_DEFAULTS.sunIntensity,
    sunDir: readSunDirection(c.sunDirection),
  };
}

function resolveSky(c) {
  return {
    skyTop: readColor(c.skyTop, LIGHTING_DEFAULTS.skyTop, "skyTop"),
    skyBottom: readColor(c.skyBottom, LIGHTING_DEFAULTS.skyBottom, "skyBottom"),
  };
}

// fog: {color,near,far} | null per the canonical schema (spec 04 §3.3); "far clamped
// to tier max, null/absent = tier default fog". `near` is intentionally never read
// from cfg — spec 02 §5.2's fixed construction formula is `THREE.Fog(fogColor,
// 0.55*fogFar, fogFar)`, i.e. near is always derived from far. A flat `fogFar` field
// (as literally written in §7 criterion 6's example call) is also accepted as a
// shorthand for `fog: {far}` — see specGaps.
function resolveFog(c, tier) {
  const tierFogMax = QUALITY[tier].fogFar;
  const fogSpec = c.fog !== undefined && c.fog !== null ? c.fog : typeof c.fogFar === "number" ? { far: c.fogFar } : null;
  if (!fogSpec) {
    return { fogColor: LIGHTING_DEFAULTS.fogColor, fogFar: tierFogMax, fogNear: FOG_NEAR_RATIO * tierFogMax };
  }
  const fogColor = readColor(fogSpec.color, LIGHTING_DEFAULTS.fogColor, "fog.color");
  const fogFar = typeof fogSpec.far === "number" ? Math.min(fogSpec.far, tierFogMax) : tierFogMax;
  return { fogColor, fogFar, fogNear: FOG_NEAR_RATIO * fogFar };
}

function resolveLighting(cfg, tier) {
  const c = cfg || {};
  return { ...resolveHemi(c), ...resolveSun(c), ...resolveSky(c), ...resolveFog(c, tier) };
}

// ===== sky dome =====

function buildSkyTexture(topHex, horizonHex, bottomHex) {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, topHex);
  grad.addColorStop(0.5, horizonHex);
  grad.addColorStop(0.55, horizonHex);
  grad.addColorStop(1.0, bottomHex);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function buildSkyDome(tier) {
  const segments = QUALITY[tier].skySegments;
  const geometry = new THREE.SphereGeometry(SKY_RADIUS, segments, segments);
  const texture = buildSkyTexture(LIGHTING_DEFAULTS.skyTop, LIGHTING_DEFAULTS.skyHorizon, LIGHTING_DEFAULTS.skyBottom);
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -1000;
  return mesh;
}

// ===== quality auto-detect =====

// Probes a throwaway canvas (never the real render target) for WEBGL_debug_renderer_info
// so the tier is known BEFORE the real THREE.WebGLRenderer is constructed — antialias is
// fixed at creation time and depends on the tier (spec 02 §5.2).
// The GPU identity string cannot change within a page session, but probing for it
// costs a full WebGL context create+destroy — measured at ~1.4 s under the SwiftShader
// flags ARCHITECTURE §10 mandates, and it is not free on a real phone either. §5.2 has
// setQuality("auto") "re-run auto-detect", and it genuinely re-runs below; only this
// one immutable probe is remembered.
let cachedRendererStr = null;

function probeRendererString() {
  if (cachedRendererStr !== null) return cachedRendererStr;
  let rendererStr = "";
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") || probe.getContext("webgl");
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      rendererStr = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      // Release the throwaway probe context immediately — setQuality("auto") (§5.2:
      // "re-runs auto-detect") can call detectAutoTier() many times over a session, and
      // an unreleased probe context here is a real WebGL-context leak: on constrained
      // software-GL hosts (SwiftShader) each leaked context makes the NEXT probe (or
      // worse, the real renderer's own context) more likely to fail creation outright,
      // which would silently fall through to the "high" default below — exactly wrong
      // on a software-rendering device.
      const loseExt = gl.getExtension("WEBGL_lose_context");
      if (loseExt) loseExt.loseContext();
    }
  } catch (err) {
    rendererStr = "";
  }
  cachedRendererStr = rendererStr;
  return rendererStr;
}

function detectAutoTier() {
  const rendererStr = probeRendererString();
  if (/SwiftShader|llvmpipe/i.test(rendererStr)) return "low";
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const memoryLow = typeof navigator !== "undefined" && typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4;
  if (coarse && memoryLow) return "med";
  if (coarse) return "med";
  return "high";
}

function pixelRatioForTier(tier) {
  const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  return Math.min(dpr, QUALITY[tier].pixelRatioCap);
}

function resolveInitialTier(initialTier) {
  if (initialTier === undefined || initialTier === null) return detectAutoTier();
  const norm = normalizeTierInput(initialTier);
  if (norm === "auto") return detectAutoTier();
  return VALID_TIERS.has(norm) ? norm : detectAutoTier();
}

// Renderer creation (fixed), spec 02 §5.2: "new THREE.WebGLRenderer({ canvas,
// antialias: tier !== "low", powerPreference: "high-performance" })".
//
// On this project's own dev/test host, under the exact `--use-angle=swiftshader`
// flags ARCHITECTURE §10 mandates for tools/smoke.js, requesting `powerPreference:
// "high-performance"` makes WebGL2 context creation fail outright (there is no real
// high-performance GPU to prefer under forced software rendering). Worse than the
// throw itself: three.module.js's own `onContextCreationError` handler (vendored,
// not ours to edit) unconditionally logs a `console.error` on that failure BEFORE we
// can catch anything — under tools/smoke.js's "any console error fails the scenario"
// rule (spec 12 §5.3.4), that stray log would fail the boot even though the fallback
// below recovers a fully working renderer. The only way to avoid emitting it is to
// never make the failing call at all, so for tier "low" — which auto-detect (below)
// only ever returns for SwiftShader/llvmpipe or an explicit user "low" choice, i.e.
// exactly the case with no real GPU to prefer — powerPreference is omitted up front.
// For "med"/"high" the spec-fixed call is attempted first as written; the catch below
// is defense-in-depth for an equivalent quirk on some other host, not the primary path.
// See specGaps (task M1-T04) for the full report.
function createWebGLRenderer(canvas, antialias, tier) {
  if (tier === "low") return new THREE.WebGLRenderer({ canvas, antialias });
  try {
    return new THREE.WebGLRenderer({ canvas, antialias, powerPreference: "high-performance" });
  } catch (err) {
    console.warn("renderer: WebGL context creation with powerPreference \"high-performance\" failed, retrying without it:", err);
    return new THREE.WebGLRenderer({ canvas, antialias });
  }
}

// ===== createRenderer =====

export function createRenderer({ canvas, initialTier } = {}) {
  if (!canvas) throw new Error("renderer: canvas required");

  const startAuto = initialTier === undefined || initialTier === null || normalizeTierInput(initialTier) === "auto";
  const tier0 = resolveInitialTier(initialTier);

  const three = createWebGLRenderer(canvas, tier0 !== "low", tier0);
  three.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  // Fog: THREE.Fog(fogColor, 0.55*fogFar, fogFar), spec 02 §5.2. Scene.fog starts null
  // on a fresh THREE.Scene; must exist before the first applyFogOnly() call (below,
  // via applyLighting({}) at the end of this function) mutates it in place.
  scene.fog = new THREE.Fog(LIGHTING_DEFAULTS.fogColor, FOG_NEAR_RATIO * QUALITY[tier0].fogFar, QUALITY[tier0].fogFar);

  const hemiLight = new THREE.HemisphereLight(0xcfe8ff, 0x5f6f52, 0.85);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfff2dd, 1.15);
  dirLight.shadow.camera.near = SHADOW_CAMERA_NEAR;
  dirLight.shadow.camera.far = SHADOW_CAMERA_FAR;
  dirLight.shadow.bias = SHADOW_BIAS;
  dirLight.shadow.normalBias = SHADOW_NORMAL_BIAS;
  scene.add(dirLight, dirLight.target);

  const domeMesh = buildSkyDome(tier0);
  scene.add(domeMesh);

  const state = {
    tier: tier0,
    autoMode: startAuto,
    lightingCfg: {},
    shadowTarget: new THREE.Vector3(0, 0, 0),
    sunDir: DEFAULT_SUN_DIR_TOWARD_SUN.clone(),
    lastFps: 0,
    lastDowngradeAt: -Infinity,
    fpsSamples: [],
  };
  const qualityListeners = new Set();

  function updateSunPosition() {
    dirLight.position.copy(state.shadowTarget).addScaledVector(state.sunDir, SUN_DISTANCE);
    dirLight.target.position.copy(state.shadowTarget);
    dirLight.target.updateMatrixWorld();
  }

  function setShadowTarget(pos) {
    const snap = (v) => Math.round(v / SHADOW_GRID_SNAP) * SHADOW_GRID_SNAP;
    state.shadowTarget.set(snap(pos.x), snap(pos.y), snap(pos.z));
    updateSunPosition();
  }

  function applyFogOnly(resolved) {
    scene.fog.color.set(resolved.fogColor);
    scene.fog.near = resolved.fogNear;
    scene.fog.far = resolved.fogFar;
  }

  function applyFullLighting(resolved) {
    hemiLight.color.set(resolved.hemiSky);
    hemiLight.groundColor.set(resolved.hemiGround);
    hemiLight.intensity = resolved.hemiIntensity;

    dirLight.color.set(resolved.sunColor);
    dirLight.intensity = resolved.sunIntensity;
    state.sunDir.copy(resolved.sunDir);
    updateSunPosition();

    applyFogOnly(resolved);

    const tex = buildSkyTexture(resolved.skyTop, LIGHTING_DEFAULTS.skyHorizon, resolved.skyBottom);
    if (domeMesh.material.map) domeMesh.material.map.dispose();
    domeMesh.material.map = tex;
    domeMesh.material.needsUpdate = true;
  }

  function applyLighting(cfg) {
    state.lightingCfg = cfg || {};
    applyFullLighting(resolveLighting(state.lightingCfg, state.tier));
  }

  function applyTierStatics(tier) {
    const q = QUALITY[tier];
    three.setPixelRatio(pixelRatioForTier(tier));
    three.shadowMap.enabled = q.shadows;
    if (q.shadowMapType !== null) three.shadowMap.type = q.shadowMapType;
    dirLight.castShadow = q.shadows;
    if (q.shadows) {
      dirLight.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      const he = q.shadowHalfExtent;
      Object.assign(dirLight.shadow.camera, { left: -he, right: he, top: he, bottom: -he });
      dirLight.shadow.camera.updateProjectionMatrix();
    }
    applyFogOnly(resolveLighting(state.lightingCfg, tier));
  }

  function applyTierLive(tier, reason) {
    applyTierStatics(tier);
    const changed = tier !== state.tier;
    state.tier = tier;
    if (changed) {
      for (const cb of qualityListeners) cb(tier, reason);
    }
  }

  function setQuality(tierInput) {
    const norm = normalizeTierInput(tierInput);
    if (norm === "auto") {
      state.autoMode = true;
      applyTierLive(detectAutoTier(), "manual");
      return;
    }
    if (!VALID_TIERS.has(norm)) {
      console.warn(`renderer.setQuality: unknown tier ${JSON.stringify(tierInput)}`);
      return;
    }
    state.autoMode = false;
    applyTierLive(norm, "manual");
  }

  function notifyFps(fps) {
    state.lastFps = fps;
    if (!state.autoMode) return;
    state.fpsSamples.push(fps);
    if (state.fpsSamples.length > FPS_SAMPLE_WINDOW) state.fpsSamples.shift();
    const mean = state.fpsSamples.reduce((a, b) => a + b, 0) / state.fpsSamples.length;
    // Auto-downgrade cooldown/mean-fps gate is inherently about real render performance
    // (frames actually delivered), not gameplay — the ARCHITECTURE §5 sim-clock rule is
    // for gameplay logic, so wall-clock is used here deliberately.
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - state.lastDowngradeAt < AUTO_DOWNGRADE_COOLDOWN_MS) return;
    if (state.tier === "high" && mean < AUTO_DOWNGRADE_HIGH_FPS) {
      state.lastDowngradeAt = now;
      applyTierLive("med", "auto");
    } else if (state.tier === "med" && mean < AUTO_DOWNGRADE_MED_FPS) {
      state.lastDowngradeAt = now;
      applyTierLive("low", "auto");
    }
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    three.setPixelRatio(pixelRatioForTier(state.tier));
    three.setSize(w, h, false);
  }

  let resizeTimer = null;
  function onWindowResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      resize();
    }, RESIZE_DEBOUNCE_MS);
  }
  window.addEventListener("resize", onWindowResize);

  function render(camera) {
    domeMesh.position.set(camera.position.x, 0, camera.position.z);
    three.render(scene, camera);
  }

  function getPerfSnapshot() {
    return { drawCalls: three.info.render.calls, triangles: three.info.render.triangles, fps: state.lastFps };
  }

  function dispose() {
    window.removeEventListener("resize", onWindowResize);
    if (resizeTimer) {
      clearTimeout(resizeTimer);
      resizeTimer = null;
    }
    scene.remove(hemiLight, dirLight, dirLight.target, domeMesh);
    domeMesh.geometry.dispose();
    if (domeMesh.material.map) domeMesh.material.map.dispose();
    domeMesh.material.dispose();
    three.dispose();
  }

  applyTierStatics(tier0);
  applyLighting({});
  resize();

  return {
    three,
    scene,
    render,
    resize,
    setQuality,
    getQuality: () => state.tier,
    onQualityChanged: (cb) => {
      qualityListeners.add(cb);
      return () => qualityListeners.delete(cb);
    },
    applyLighting,
    setShadowTarget,
    notifyFps,
    getPerfSnapshot,
    dispose,
  };
}
