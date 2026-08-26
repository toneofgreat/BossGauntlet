// The face painter — spec 05 §5.3: a tiny op-DSL interpreter that paints one of the
// ten OofRig faces onto a FACE_CANVAS_SIZE square 2d context over the head color.
// Pure: no DOM lookups, no three, no platform imports — the caller owns the canvas.

import { AVATAR_TUNING } from "./animator.js";

const SIZE = AVATAR_TUNING.FACE_CANVAS_SIZE;   // §6 — 128 px
const DEG2RAD = Math.PI / 180;

// §5.3 — ink is #1b1b1b unless an op names its own color.
const INK = "#1b1b1b";

// The shared op fragments §5.3 names ("standard eyes", "smile arc as face_smile",
// "grin ops"), written once so the ten rows below stay verbatim-comparable to the spec.
const EYE_LEFT = ["circle", 40, 50, 10, INK];
const EYE_RIGHT = ["circle", 88, 50, 10, INK];
const SMILE_ARC = ["arc", 64, 72, 24, 25, 155, 6, INK];
const GRIN_OPS = [
  ["rrect", 38, 68, 52, 26, 10, INK],
  ["rrect", 42, 72, 44, 10, 4, "#ffffff"],
];

// §5.3's face_hearts row: three ops per eye, mirrored around each eye centre.
function heartOps(cx, cy) {
  return [
    ["circle", cx - 5, cy - 3, 6, "#e0245e"],
    ["circle", cx + 5, cy - 3, 6, "#e0245e"],
    ["rrect", cx - 9, cy - 2, 18, 12, 3, "#e0245e"],
  ];
}

// §5.3 — the ten faces. This table is faces.js's own (not read from catalog-data.js)
// because face_oof must paint on death whether or not its Catalog row ships: the
// SLICE ships one purchasable face, the painter still knows all ten.
export const FACE_OPS = Object.freeze({
  face_smile: [EYE_LEFT, EYE_RIGHT, SMILE_ARC],
  face_oof: [
    ["line", 30, 40, 50, 60, 6, INK],
    ["line", 50, 40, 30, 60, 6, INK],
    ["line", 78, 40, 98, 60, 6, INK],
    ["line", 98, 40, 78, 60, 6, INK],
    ["circle", 64, 88, 13, INK],
    ["circle", 64, 88, 8, "#5c1f1f"],
  ],
  face_grin: [EYE_LEFT, EYE_RIGHT, ...GRIN_OPS],
  face_wink: [EYE_LEFT, ["line", 78, 50, 98, 50, 6, INK], SMILE_ARC],
  face_tongue: [EYE_LEFT, EYE_RIGHT, ...GRIN_OPS, ["rrect", 56, 86, 16, 16, 7, "#e2536b"]],
  face_stern: [
    EYE_LEFT, EYE_RIGHT,
    ["line", 28, 36, 52, 42, 6, INK],
    ["line", 100, 36, 76, 42, 6, INK],
    ["line", 46, 82, 82, 82, 6, INK],
  ],
  face_sleepy: [
    ["arc", 40, 52, 10, 20, 160, 6, INK],
    ["arc", 88, 52, 10, 20, 160, 6, INK],
    ["circle", 64, 84, 5, INK],
    ["text", 106, 26, "z", 22, INK],
  ],
  face_surprised: [
    ["circle", 40, 50, 13, INK],
    ["circle", 88, 50, 13, INK],
    ["arc", 40, 34, 12, 200, 340, 5, INK],
    ["arc", 88, 34, 12, 200, 340, 5, INK],
    ["circle", 64, 86, 10, INK],
  ],
  face_money: [
    ["circle", 40, 50, 12, "#f7c948"],
    ["text", 40, 51, "$", 22, INK],
    ["circle", 88, 50, 12, "#f7c948"],
    ["text", 88, 51, "$", 22, INK],
    ...GRIN_OPS,
  ],
  face_hearts: [...heartOps(40, 50), ...heartOps(88, 50), SMILE_ARC],
});

export const FACE_IDS = Object.freeze(Object.keys(FACE_OPS));

// The default every unknown id resolves to (§3.1: "never crash on unknown ids").
export const DEFAULT_FACE_ID = "face_smile";

function opCircle(c, [, x, y, r, fill]) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}

function opRing(c, [, x, y, r, w, color]) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.lineWidth = w;
  c.strokeStyle = color;
  c.stroke();
}

// Degrees, clockwise, 0° = +x — which is canvas-native (y grows downward), so a
// 25°..155° sweep bulges toward the chin and reads as a smile.
function opArc(c, [, cx, cy, r, startDeg, endDeg, w, color]) {
  c.beginPath();
  c.arc(cx, cy, r, startDeg * DEG2RAD, endDeg * DEG2RAD, false);
  c.lineWidth = w;
  c.strokeStyle = color;
  c.lineCap = "round";
  c.stroke();
}

function opLine(c, [, x1, y1, x2, y2, w, color]) {
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.lineWidth = w;
  c.strokeStyle = color;
  c.lineCap = "round";
  c.stroke();
}

// x,y is the top-left corner (§5.3's rows are centred by construction, e.g. the grin
// mouth spans 38..90 around the 64 px face centre).
function opRrect(c, [, x, y, w, h, r0, fill]) {
  const r = Math.min(r0, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

function opText(c, [, x, y, str, px, color]) {
  c.font = `bold ${px}px monospace`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = color;
  c.fillText(str, x, y);
}

const OPS = {
  circle: opCircle, ring: opRing, arc: opArc, line: opLine, rrect: opRrect, text: opText,
};

// paintFace(ctx2d, faceId, headColorHex) — §5.3: fill the whole canvas with the head
// color (the face texture IS the head's front face, so its background must match the
// other five sides), then run the face's ops in order.
export function paintFace(ctx2d, faceId, headColorHex) {
  if (!ctx2d) return DEFAULT_FACE_ID;
  const id = Object.prototype.hasOwnProperty.call(FACE_OPS, faceId) ? faceId : DEFAULT_FACE_ID;
  ctx2d.save();
  ctx2d.setTransform(1, 0, 0, 1, 0, 0);
  ctx2d.clearRect(0, 0, SIZE, SIZE);
  ctx2d.fillStyle = headColorHex || "#f5cd30";
  ctx2d.fillRect(0, 0, SIZE, SIZE);
  for (const op of FACE_OPS[id]) {
    const draw = OPS[op[0]];
    if (draw) draw(ctx2d, op);
  }
  ctx2d.restore();
  return id;
}
