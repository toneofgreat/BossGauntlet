// src/platform/ui/avatar-thumb.js — a small picture of somebody's character. Spec 15.
//
// Drawn on a 2D canvas from their avatar config rather than rendered in 3D. Twenty
// friends on a scrolling grid would otherwise be twenty WebGL previews, and the thing
// being asked for is "show me their character next to their name", which a blocky
// front-on drawing answers exactly.
//
// The proportions match spec 05's rig so the drawing reads as the same character: a wide
// head, a torso two thirds its width, arms either side, two legs.

const LIMBS = ["head", "torso", "leftArm", "rightArm", "leftLeg", "rightLeg"];
const FALLBACK = Object.freeze({
  head: "#f5cd30", torso: "#0f5cc2", leftArm: "#f5cd30",
  rightArm: "#f5cd30", leftLeg: "#3ddc84", rightLeg: "#3ddc84",
});

// The face glyphs mirror the HUD's, so the same person looks the same in both places.
const FACES = Object.freeze({
  smile: "🙂", happy: "😀", cool: "😎", wink: "😉", sleepy: "😴",
  angry: "😠", surprised: "😮", silly: "😜", neutral: "😐",
});

function colorsOf(config) {
  const raw = (config && config.bodyColors) || {};
  const out = {};
  for (const k of LIMBS) out[k] = typeof raw[k] === "string" ? raw[k] : FALLBACK[k];
  // A config that only carries `headColor` (the HUD's shape) still draws sensibly.
  if (config && typeof config.headColor === "string") out.head = config.headColor;
  return out;
}

function faceOf(config) {
  const id = config && (config.face || (config.equipped && config.equipped.face));
  return FACES[id] || FACES.smile;
}

// Returns a <canvas> sized `size` x `size`, ready to append.
export function avatarThumb(config, size = 72) {
  const canvas = document.createElement("canvas");
  const dpr = Math.min(2, (typeof devicePixelRatio === "number" && devicePixelRatio) || 1);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + "px";
  canvas.style.height = size + "px";
  const g = canvas.getContext("2d");
  if (!g) return canvas;
  g.scale(dpr, dpr);

  const c = colorsOf(config);
  const u = size / 16; // one grid unit

  const box = (x, y, w, h, fill) => {
    g.fillStyle = fill;
    g.fillRect(Math.round(x * u), Math.round(y * u), Math.round(w * u), Math.round(h * u));
  };

  // legs, torso, arms, head — back to front so nothing needs clipping
  box(5.5, 11, 2.2, 4, c.leftLeg);
  box(8.3, 11, 2.2, 4, c.rightLeg);
  box(5.5, 6.5, 5, 4.5, c.torso);
  box(3.2, 6.6, 2, 4.2, c.leftArm);
  box(10.8, 6.6, 2, 4.2, c.rightArm);
  box(4.8, 1.6, 6.4, 4.6, c.head);

  // the face, drawn as the same emoji the HUD uses
  g.font = `${Math.round(u * 3.1)}px system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(faceOf(config), 8 * u, 4 * u);

  return canvas;
}
