// src/games/lifting/scripts/fx.js — spec 09 §4's FX module: §5.14's gain-text and
// particle-burst pools and §5.8's over-head title tag.
//
// These three used to live in board.js. §4's module table names this file and lists
// `init/gainText/burst/titleTag/update/dispose` as its exports, and §5.1's update order
// gives `fx.update` its own slot, so they are here now. Pure move: every number, easing
// and draw call below is the one board.js ran.
//
// Everything hangs off ONE THREE.Group registered with parts.addCustom, so §5.15's
// teardown is a single remove + a single recursive dispose and parts.count() lands back
// exactly where it started (spec 04 §5.5).

import { TITLES, TUNING } from "./config.js";
import { disposeItemGroup } from "./items.js";

// §5.14 gain text. The sprite's world size is not specified; 2.6 x 1.0 keeps the 256x96
// canvas square-pixelled and legible from the default follow distance.
const TEXT_CANVAS = [256, 96];
const TEXT_SPRITE_SCALE = [2.6, 1.0, 1];
const BURST_RADIUS = 0.12;
const BURST_SPEED = 6;
const BURST_GRAVITY = -20;
const BURST_LIFE_S = 0.7;
// §5.8's title tag.
const TAG_CANVAS = [512, 128];
const TAG_SPRITE_SCALE = [4.5, 1.1, 1];

// ---- module closure; dispose() puts every one of these back to null/empty ----
let root = null;       // the single addCustom subtree
let rootId = null;
let texts = [];        // gain-text pool entries
let textNext = 0;
let bursts = [];       // particle pool entries
let burstNext = 0;
let tag = null;        // { sprite, canvas, c2d, tex, drawn }

// ---------------------------------------------------------------------------
// §5.14 FX pools
// ---------------------------------------------------------------------------

function makeTextSprite(THREE) {
  const canvas = document.createElement("canvas");
  canvas.width = TEXT_CANVAS[0];
  canvas.height = TEXT_CANVAS[1];
  const tex = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  // depthTest off: a "+1.2K" that hides behind the very item it was earned on is
  // worse than one that floats over everything.
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(TEXT_SPRITE_SCALE[0], TEXT_SPRITE_SCALE[1], 1);
  sprite.visible = false;
  return { sprite, canvas, c2d: canvas.getContext("2d"), tex, mat, t: Infinity, base: [0, 0, 0] };
}

function paintGainText(entry, text) {
  const g = entry.c2d;
  g.clearRect(0, 0, TEXT_CANVAS[0], TEXT_CANVAS[1]);
  g.font = "bold 56px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 8;
  g.strokeStyle = "#000000";
  g.strokeText(text, TEXT_CANVAS[0] / 2, TEXT_CANVAS[1] / 2, TEXT_CANVAS[0] - 12);
  g.fillStyle = "#f7c948";
  g.fillText(text, TEXT_CANVAS[0] / 2, TEXT_CANVAS[1] / 2, TEXT_CANVAS[0] - 12);
  entry.tex.needsUpdate = true;
}

// §5.14: spawn at the item + [0, 0.8, 0], rise 2.0 units over 0.8 s while fading out.
// Round-robin over the pool, so a fast autoclicker recycles the oldest sprite.
export function gainText(ctx, worldPos, text) {
  if (!texts.length) return;
  const entry = texts[textNext];
  textNext = (textNext + 1) % texts.length;
  paintGainText(entry, text);
  entry.base = [worldPos[0], worldPos[1] + 0.8, worldPos[2]];
  entry.t = 0;
  entry.sprite.position.set(entry.base[0], entry.base[1], entry.base[2]);
  entry.mat.opacity = 1;
  entry.sprite.visible = true;
}

// §5.14: `count` 0.12-unit neon spheres from a shared pool of 40, random unit velocities
// scaled 6, gravity -20, life 0.7 s.
export function burst(ctx, worldPos, color, count) {
  if (!bursts.length) return;
  const n = Math.min(count || 0, bursts.length);
  for (let i = 0; i < n; i++) {
    const p = bursts[burstNext];
    burstNext = (burstNext + 1) % bursts.length;
    const theta = Math.random() * Math.PI * 2;
    const z = Math.random() * 2 - 1;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    p.vel = [Math.cos(theta) * r * BURST_SPEED, Math.abs(z) * BURST_SPEED, Math.sin(theta) * r * BURST_SPEED];
    p.mat.emissive.set(color);
    p.mesh.position.set(worldPos[0], worldPos[1], worldPos[2]);
    p.mesh.visible = true;
    p.t = 0;
  }
}

// ---------------------------------------------------------------------------
// §5.8 title tag
// ---------------------------------------------------------------------------

function paintTag(name, color) {
  const g = tag.c2d;
  const w = TAG_CANVAS[0];
  const h = TAG_CANVAS[1];
  g.clearRect(0, 0, w, h);
  const pad = 10;
  const r = 28;
  g.beginPath();
  g.moveTo(pad + r, pad);
  g.arcTo(w - pad, pad, w - pad, h - pad, r);
  g.arcTo(w - pad, h - pad, pad, h - pad, r);
  g.arcTo(pad, h - pad, pad, pad, r);
  g.arcTo(pad, pad, w - pad, pad, r);
  g.closePath();
  g.globalAlpha = 0.75;
  g.fillStyle = "#0e1018";
  g.fill();
  g.globalAlpha = 1;
  g.lineWidth = 3;
  g.strokeStyle = color;
  g.stroke();
  g.font = "bold 64px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 4;
  g.strokeStyle = "#000000";
  g.strokeText(name, w / 2, h / 2, w - 60);
  g.fillStyle = color;
  g.fillText(name, w / 2, h / 2, w - 60);
  tag.tex.needsUpdate = true;
}

function titleColor(name) {
  const row = TITLES.find((t) => t.name === name);
  return row ? row.color : "#ffffff";
}

// Create/update/remove the over-head sprite. Redrawn only when the equipped title
// changes (§5.8) — the per-step work is the position write in update().
export function titleTag(ctx, state) {
  if (!tag) return;
  const name = state.equippedTitle;
  if (!name) {
    tag.sprite.visible = false;
    tag.drawn = "";
    return;
  }
  if (tag.drawn === name) {
    tag.sprite.visible = true;
    return;
  }
  paintTag(name, titleColor(name));
  tag.drawn = name;
  tag.sprite.visible = true;
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

// Idempotent by construction: a re-init without a dispose, or a retry after an init that
// threw partway, must not leave a second set of pooled meshes hanging off a lost root.
// dispose() is the only thing that owns those meshes, so it runs first (it is a no-op on
// a cold module), and the pools are published to the closure only once the build is done.
export function init(ctx) {
  dispose(ctx);
  const THREE = ctx.engine.THREE;
  root = new THREE.Group();
  root.name = "lifting-fx";

  // ---- gain text + particle pools (§5.14) ----
  const nextTexts = [];
  for (let i = 0; i < TUNING.FX_POOL_TEXT; i++) {
    const entry = makeTextSprite(THREE);
    root.add(entry.sprite);
    nextTexts.push(entry);
  }
  const nextBursts = [];
  const burstGeo = new THREE.SphereGeometry(BURST_RADIUS, 8, 6);
  for (let i = 0; i < TUNING.FX_POOL_BURST; i++) {
    // Each particle owns its material so one burst can be gold while another is lava.
    const mat = new THREE.MeshLambertMaterial({ color: "#000000", emissive: "#f7c948", emissiveIntensity: 1 });
    const p = new THREE.Mesh(burstGeo, mat);
    p.visible = false;
    root.add(p);
    nextBursts.push({ mesh: p, mat, vel: [0, 0, 0], t: Infinity });
  }

  // ---- title tag (§5.8) ----
  const tagCanvas = document.createElement("canvas");
  tagCanvas.width = TAG_CANVAS[0];
  tagCanvas.height = TAG_CANVAS[1];
  const tagTex = new THREE.CanvasTexture(tagCanvas);
  if (THREE.SRGBColorSpace) tagTex.colorSpace = THREE.SRGBColorSpace;
  const tagMat = new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthWrite: false });
  const tagSprite = new THREE.Sprite(tagMat);
  tagSprite.scale.set(TAG_SPRITE_SCALE[0], TAG_SPRITE_SCALE[1], 1);
  tagSprite.visible = false;
  root.add(tagSprite);

  rootId = ctx.engine.parts.addCustom(root);
  texts = nextTexts;
  textNext = 0;
  bursts = nextBursts;
  burstNext = 0;
  tag = { sprite: tagSprite, canvas: tagCanvas, c2d: tagCanvas.getContext("2d"), tex: tagTex, drawn: "" };
}

export function update(dt, ctx) {
  if (!root) return;

  // §5.14 gain text: rise GAIN_TEXT_RISE_UNITS over GAIN_TEXT_LIFE_S, fading out.
  for (const entry of texts) {
    if (entry.t === Infinity) continue;
    entry.t += dt;
    const u = entry.t / TUNING.GAIN_TEXT_LIFE_S;
    if (u >= 1) {
      entry.t = Infinity;
      entry.sprite.visible = false;
      continue;
    }
    entry.sprite.position.y = entry.base[1] + TUNING.GAIN_TEXT_RISE_UNITS * u;
    entry.mat.opacity = 1 - u;
  }

  // §5.14 particles: ballistic, then hidden.
  for (const p of bursts) {
    if (p.t === Infinity) continue;
    p.t += dt;
    if (p.t >= BURST_LIFE_S) {
      p.t = Infinity;
      p.mesh.visible = false;
      continue;
    }
    p.vel[1] += BURST_GRAVITY * dt;
    p.mesh.position.x += p.vel[0] * dt;
    p.mesh.position.y += p.vel[1] * dt;
    p.mesh.position.z += p.vel[2] * dt;
  }

  // §5.8: the tag follows the avatar every step; it is only REDRAWN on a title change.
  if (tag && tag.sprite.visible) {
    const feet = ctx.player.position();
    tag.sprite.position.set(feet[0], feet[1] + TUNING.TITLE_TAG_Y, feet[2]);
  }
}

export function dispose(ctx) {
  if (rootId !== null) ctx.engine.parts.remove(rootId);
  disposeItemGroup(root); // recursive: sprites, particles, tag
  root = null;
  rootId = null;
  texts = [];
  bursts = [];
  textNext = 0;
  burstNext = 0;
  tag = null;
}
