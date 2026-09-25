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

// A detailed eye: white, iris, pupil, and the glint that makes it read as wet rather
// than printed. `look` nudges the iris so a face can glance sideways.
function eye(cx, cy, r, look = 0, iris = "#3a6ea5") {
  return [
    ["circle", cx, cy, r, "#ffffff"],
    ["circle", cx + look, cy + 1, r * 0.62, iris],
    ["circle", cx + look, cy + 1, r * 0.34, INK],
    ["circle", cx + look - r * 0.28, cy - r * 0.34, r * 0.2, "#ffffff"],
    ["ring", cx, cy, r, 2, INK],
  ];
}

// Blush, for the faces that want it.
function blush(cx, cy) {
  return [["circle", cx, cy, 7, "#ff9aa8"], ["circle", cx, cy, 4, "#ff7d90"]];
}

// §5.3 — the ten faces. **(Amended 2026-09-25: the detail pass.** Every row gained the
// parts that make a face look at you rather than past you — eye whites with an iris and
// a glint, brows, blush, teeth, shading. The ops themselves are unchanged, so the DSL and
// its interpreter are the same; only the tables are richer.**)** This table is faces.js's
// own (not read from catalog-data.js) because face_oof must paint on death whether or not
// its Catalog row ships: the SLICE ships one purchasable face, the painter knows all ten.
export const FACE_OPS = Object.freeze({
  face_smile: [
    ...eye(40, 50, 12), ...eye(88, 50, 12),
    ["arc", 40, 33, 13, 200, 340, 4, INK],
    ["arc", 88, 33, 13, 200, 340, 4, INK],
    SMILE_ARC,
    ["arc", 64, 70, 20, 30, 150, 3, "#ffffff"],
    ...blush(24, 68), ...blush(104, 68),
  ],
  face_oof: [
    ["line", 28, 38, 52, 62, 7, INK],
    ["line", 52, 38, 28, 62, 7, INK],
    ["line", 76, 38, 100, 62, 7, INK],
    ["line", 100, 38, 76, 62, 7, INK],
    ["arc", 40, 28, 14, 200, 340, 4, INK],
    ["arc", 88, 28, 14, 200, 340, 4, INK],
    ["circle", 64, 88, 15, INK],
    ["circle", 64, 88, 10, "#5c1f1f"],
    ["circle", 64, 84, 4, "#ff9aa8"],
    ["line", 18, 74, 26, 82, 4, "#8fc7ff"],
  ],
  face_grin: [
    ...eye(40, 48, 13, 0, "#2f7d4f"), ...eye(88, 48, 13, 0, "#2f7d4f"),
    ["line", 26, 30, 54, 34, 5, INK],
    ["line", 102, 30, 74, 34, 5, INK],
    ...GRIN_OPS,
    ["line", 52, 72, 52, 82, 3, INK],
    ["line", 64, 72, 64, 82, 3, INK],
    ["line", 76, 72, 76, 82, 3, INK],
  ],
  face_wink: [
    ...eye(40, 50, 12, 2),
    ["arc", 88, 52, 12, 200, 340, 6, INK],
    ["line", 76, 40, 100, 36, 5, INK],
    SMILE_ARC,
    ["arc", 64, 70, 20, 30, 150, 3, "#ffffff"],
    ...blush(104, 66),
  ],
  face_tongue: [
    ...eye(40, 48, 13, -2), ...eye(88, 48, 13, 2),
    ["arc", 40, 31, 13, 200, 340, 4, INK],
    ["arc", 88, 31, 13, 200, 340, 4, INK],
    ...GRIN_OPS,
    ["rrect", 54, 84, 20, 22, 9, "#e2536b"],
    ["line", 64, 90, 64, 102, 3, "#b83b52"],
    ...blush(22, 66), ...blush(106, 66),
  ],
  face_stern: [
    ...eye(40, 52, 11, 0, "#5c6478"), ...eye(88, 52, 11, 0, "#5c6478"),
    ["line", 26, 34, 54, 44, 7, INK],
    ["line", 102, 34, 74, 44, 7, INK],
    ["line", 46, 82, 82, 82, 6, INK],
    ["line", 50, 88, 78, 88, 3, "#8d94a3"],
    ["arc", 64, 100, 18, 200, 340, 3, "#8d94a3"],
  ],
  face_sleepy: [
    ["arc", 40, 52, 11, 20, 160, 6, INK],
    ["arc", 88, 52, 11, 20, 160, 6, INK],
    ["line", 28, 38, 52, 42, 4, INK],
    ["line", 100, 38, 76, 42, 4, INK],
    ["arc", 40, 62, 9, 20, 160, 3, "#c9a0a0"],
    ["arc", 88, 62, 9, 20, 160, 3, "#c9a0a0"],
    ["circle", 64, 84, 6, INK],
    ["circle", 64, 86, 3, "#5c1f1f"],
    ["text", 100, 30, "z", 20, INK],
    ["text", 112, 18, "z", 14, "#5c6478"],
  ],
  face_surprised: [
    ["circle", 40, 50, 15, "#ffffff"],
    ["circle", 40, 50, 9, INK],
    ["circle", 37, 47, 3, "#ffffff"],
    ["ring", 40, 50, 15, 2, INK],
    ["circle", 88, 50, 15, "#ffffff"],
    ["circle", 88, 50, 9, INK],
    ["circle", 85, 47, 3, "#ffffff"],
    ["ring", 88, 50, 15, 2, INK],
    ["arc", 40, 30, 14, 200, 340, 5, INK],
    ["arc", 88, 30, 14, 200, 340, 5, INK],
    ["circle", 64, 88, 12, INK],
    ["circle", 64, 88, 8, "#5c1f1f"],
    ...blush(20, 70), ...blush(108, 70),
  ],
  face_money: [
    ["circle", 40, 50, 14, "#f7c948"],
    ["ring", 40, 50, 14, 2, "#8c6a12"],
    ["text", 40, 51, "$", 22, INK],
    ["circle", 88, 50, 14, "#f7c948"],
    ["ring", 88, 50, 14, 2, "#8c6a12"],
    ["text", 88, 51, "$", 22, INK],
    ["arc", 40, 31, 14, 200, 340, 4, "#8c6a12"],
    ["arc", 88, 31, 14, 200, 340, 4, "#8c6a12"],
    ...GRIN_OPS,
    ["line", 52, 72, 52, 82, 3, "#8c6a12"],
    ["line", 76, 72, 76, 82, 3, "#8c6a12"],
    ["text", 108, 100, "$", 16, "#f7c948"],
  ],
  face_hearts: [
    ...heartOps(40, 50), ...heartOps(88, 50),
    ["circle", 36, 45, 3, "#ffffff"],
    ["circle", 84, 45, 3, "#ffffff"],
    SMILE_ARC,
    ["arc", 64, 70, 20, 30, 150, 3, "#ffffff"],
    ...blush(20, 68), ...blush(108, 68),
    ["text", 108, 28, "\u2665", 16, "#e0245e"],
    ["text", 18, 24, "\u2665", 12, "#ff7d90"],
  ],
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
