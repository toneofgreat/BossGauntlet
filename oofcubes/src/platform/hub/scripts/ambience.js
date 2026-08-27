// src/platform/hub/scripts/ambience.js — the Hub's day/dusk/night lighting presets.
// Spec 06 §5.5 owns this file: it is aesthetic only, and nothing about visibility or
// gameplay depends on which preset is live.
//
// Applied at hub init from profile.settings.ambience, and again whenever the settings
// panel publishes `platform:settingsChanged { settings }` (§5.5) — the hub listens and
// re-applies, which is what makes criterion 14's "within one frame, without reload"
// true.

// ---------------------------------------------------------------------------
// presets — §5.5's table, verbatim
// ---------------------------------------------------------------------------

// Each `lighting` block is a spec 04 §3.3 LightingConfig, i.e. exactly what
// place.json's `lighting` field holds; `emissive` is that row's lamp/neon boost
// multiplier. The `day` block is character-for-character the one authored into
// src/platform/hub/place.json, so re-selecting Day restores the boot lighting.
export const PRESETS = Object.freeze({
  day: Object.freeze({
    lighting: Object.freeze({
      skyTop: "#4aa8ff",
      skyBottom: "#cfeaff",
      ambient: "#ffffff",
      ambientIntensity: 0.6,
      sunColor: "#fff4d6",
      sunIntensity: 0.9,
      sunDirection: Object.freeze([-0.4, -1, -0.3]),
      fog: Object.freeze({ color: "#cfeaff", near: 260, far: 560 }),
    }),
    emissive: 0.4,
  }),
  dusk: Object.freeze({
    lighting: Object.freeze({
      skyTop: "#5b3f8f",
      skyBottom: "#ff9a5c",
      ambient: "#ffd0a0",
      ambientIntensity: 0.45,
      sunColor: "#ff8c42",
      sunIntensity: 0.6,
      sunDirection: Object.freeze([-0.9, -0.35, 0]),
      fog: Object.freeze({ color: "#5b3f8f", near: 180, far: 420 }),
    }),
    emissive: 1.0,
  }),
  night: Object.freeze({
    lighting: Object.freeze({
      skyTop: "#0a0e1f",
      skyBottom: "#1a2340",
      ambient: "#7080c0",
      ambientIntensity: 0.3,
      sunColor: "#aab8ff",
      sunIntensity: 0.25,
      sunDirection: Object.freeze([0.3, -1, 0.2]),
      fog: Object.freeze({ color: "#0a0e1f", near: 120, far: 300 }),
    }),
    emissive: 1.6,
  }),
});

const DEFAULT_PRESET = "day"; // §3.1's settings default, and the fallback for junk input

// Engine-side constants this module has to agree with when the renderer seam is
// missing (see applyToScene). Both are spec numbers, not engine trivia: the hemisphere
// ground colour is "darken(ambient, 0.4)" (spec 02 §3.3) and fog near is derived
// "0.55 * far" (spec 02 §5.2), never read from the config.
const AMBIENT_GROUND_DARKEN = 0.4;
const FOG_NEAR_RATIO = 0.55;
const SKY_TEXTURE_HEIGHT = 256; // matches the renderer's own gradient resolution
const SKY_RENDER_ORDER = -1000; // how the sky dome identifies itself in the scene

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function darken(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const k = 1 - factor;
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, "0");
  return "#" + ch((n >> 16) & 255) + ch((n >> 8) & 255) + ch(n & 255);
}

function mixHex(a, b, t) {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const ch = (shift) => {
    const va = (na >> shift) & 255;
    const vb = (nb >> shift) & 255;
    return Math.round(va + (vb - va) * t).toString(16).padStart(2, "0");
  };
  return "#" + ch(16) + ch(8) + ch(0);
}

// ---------------------------------------------------------------------------
// lighting — preferred seam first, direct scene write as the fallback
// ---------------------------------------------------------------------------

// §5.5 routes the LightingConfig through "the renderer's applyLighting ... or a
// ctx.engine.renderer.applyLighting seam". Today's ctx (spec 04 §5.7, assembled in
// shell.js) carries engine.THREE/scene/camera/physics/parts/audio/input and no
// renderer, so the seam is probed for and the scene is written directly when it is
// absent. Reported: exposing `renderer.applyLighting` on ctx.engine makes this whole
// fallback dead code, and fixes the two gaps called out in applyToScene.
function applyThroughSeam(ctx, lighting) {
  const renderer = ctx.engine && ctx.engine.renderer;
  if (!renderer || typeof renderer.applyLighting !== "function") return false;
  renderer.applyLighting(lighting);
  return true;
}

function findSceneBits(scene) {
  const bits = { hemi: null, sun: null, sky: null };
  for (const obj of scene.children) {
    if (!bits.hemi && obj.isHemisphereLight) bits.hemi = obj;
    else if (!bits.sun && obj.isDirectionalLight) bits.sun = obj;
    // The sky dome is the one mesh drawn before everything else (spec 02 §5.2 gives it
    // renderOrder -1000); nothing else in a Place may claim that order.
    else if (!bits.sky && obj.isMesh && obj.renderOrder === SKY_RENDER_ORDER) bits.sky = obj;
  }
  return bits;
}

// The renderer clamps fog far to the quality tier's maximum (spec 02 §5.2) and that
// table is not reachable from a Place. It can be INFERRED once, though: the first
// fallback call runs right after the loader applied place.json's lighting, whose fog
// far is the day preset's 560 (§3.3), so anything lower on the scene can only be the
// tier's cap — which is exactly the case on a phone or under software GL. The
// inference goes stale if the player later changes quality tier; the seam path reads
// the real table and has neither problem.
let inferredFogCap = null;

function fogCap(scene) {
  if (inferredFogCap === null) {
    const seen = scene.fog ? scene.fog.far : 0;
    inferredFogCap = seen > 0 && seen < PRESETS.day.lighting.fog.far ? seen : Infinity;
  }
  return inferredFogCap;
}

function repaintSky(THREE, dome, skyTop, skyBottom) {
  if (!dome || !dome.material) return;
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = SKY_TEXTURE_HEIGHT;
  const c2d = canvas.getContext("2d");
  const grad = c2d.createLinearGradient(0, 0, 0, SKY_TEXTURE_HEIGHT);
  // The renderer's gradient has a third, fixed horizon stop that §5.5's table does not
  // give a value for; the midpoint blend of the two preset colours is used instead, so
  // dusk and night get a horizon in their own palette rather than a daylight band.
  const horizon = mixHex(skyTop, skyBottom, 0.5);
  grad.addColorStop(0.0, skyTop);
  grad.addColorStop(0.5, horizon);
  grad.addColorStop(0.55, horizon);
  grad.addColorStop(1.0, skyBottom);
  c2d.fillStyle = grad;
  c2d.fillRect(0, 0, 2, SKY_TEXTURE_HEIGHT);

  const tex = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const old = dome.material.map;
  dome.material.map = tex;
  dome.material.needsUpdate = true;
  if (old) old.dispose();
}

function applyToScene(ctx, lighting) {
  const scene = ctx.engine && ctx.engine.scene;
  const THREE = ctx.engine && ctx.engine.THREE;
  if (!scene || !THREE || !Array.isArray(scene.children)) return false;
  const bits = findSceneBits(scene);

  if (bits.hemi) {
    bits.hemi.color.set(lighting.ambient);
    bits.hemi.groundColor.set(darken(lighting.ambient, AMBIENT_GROUND_DARKEN));
    bits.hemi.intensity = lighting.ambientIntensity;
  }
  if (bits.sun) {
    bits.sun.color.set(lighting.sunColor);
    bits.sun.intensity = lighting.sunIntensity;
    // GAP (reported): sunDirection cannot be honoured here. The renderer re-derives the
    // sun's position from its own stored direction inside setShadowTarget, which the
    // shell calls every frame, so any position written here is overwritten before it
    // renders. Colour and intensity survive — the visible half of the change — and the
    // seam path applies the direction properly.
  }
  if (scene.fog && lighting.fog) {
    // `near` is never read from the config, by either path: spec 02 §5.2 fixes it at
    // 0.55 * far, so the preset table's `near` column is documentation only.
    const far = Math.min(lighting.fog.far, fogCap(scene));
    scene.fog.color.set(lighting.fog.color);
    scene.fog.far = far;
    scene.fog.near = FOG_NEAR_RATIO * far;
    // GAP (reported): a later renderer.setQuality() re-resolves fog from the PLACE's
    // own lighting config, which reverts this fog until the next applyAmbience call.
    // Only the seam can update the config the renderer re-reads.
  }
  repaintSky(THREE, bits.sky, lighting.skyTop, lighting.skyBottom);
  return true;
}

// ---------------------------------------------------------------------------
// lamp / neon boost — §5.5's last row
// ---------------------------------------------------------------------------

// §5.5 has the lamps and portal planes read the boost via
// `ctx.engine.parts.setEmissiveIntensity(id, mult)` (spec 03 §4.2). That call is not on
// ctx, and it would throw for the four lamp heads even if it were: place.json's five
// identical anchored neon spheres are batched into one InstancedMesh (spec 03 §5.3) and
// the engine refuses to mutate instanced parts. So the boost is applied at the material
// level over the live scene, which also picks up the procedural portal planes without
// this module having to know layout.js's part ids.
//
// Clone-on-write, exactly as parts.setEmissiveIntensity does it: materials come from a
// shared cache keyed by material|colour|transparency, so the multiplier must never be
// written through to the cached instance. The untouched base intensity is remembered on
// the mesh so repeated preset changes scale from the original, not from each other.
function boostEmissives(ctx, mult) {
  const scene = ctx.engine && ctx.engine.scene;
  if (!scene || typeof scene.traverse !== "function") return 0;
  let touched = 0;
  scene.traverse((obj) => {
    if (!obj.isMesh || !obj.material || Array.isArray(obj.material)) return;
    const mat = obj.material;
    if (!mat.emissive || typeof mat.emissiveIntensity !== "number") return;
    // A black emissive channel is a non-glowing material (plastic, wood, grass...);
    // only neon and lava carry a colour there (spec 03 §5.1).
    if (mat.emissive.r === 0 && mat.emissive.g === 0 && mat.emissive.b === 0) return;
    let held = obj.userData.oofAmbience;
    if (!held) {
      held = { base: mat.emissiveIntensity };
      obj.material = mat.clone();
      obj.userData.oofAmbience = held;
    }
    obj.material.emissiveIntensity = held.base * mult;
    touched++;
  });
  return touched;
}

// ---------------------------------------------------------------------------
// public API — §4's module table
// ---------------------------------------------------------------------------

// `preset` is profile.settings.ambience ("day" | "dusk" | "night"). Anything else falls
// back to day rather than throwing: §3.1 says missing/invalid profile fields are
// replaced by their defaults on read, never raised. Returns the preset key actually
// applied, so a caller can record what the world is currently wearing.
export function applyAmbience(ctx, preset) {
  const key = Object.prototype.hasOwnProperty.call(PRESETS, preset) ? preset : DEFAULT_PRESET;
  const chosen = PRESETS[key];
  if (!ctx || !ctx.engine) return key;
  if (!applyThroughSeam(ctx, chosen.lighting)) applyToScene(ctx, chosen.lighting);
  boostEmissives(ctx, chosen.emissive);
  return key;
}
