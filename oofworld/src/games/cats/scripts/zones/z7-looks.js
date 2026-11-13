// src/games/cats/scripts/zones/z7-looks.js - the looks of cats 85..100 (zone 7, The End Of Cats),
// ported from the original's shared Cats/Z7 module. Pure: each look only uses the catkit K it is
// handed, so the Index can paint them with no zone loaded.

function ear(K, m, cf, w, h, t, color) {
  K.wedge(m, K.v(t, h, w / 2), K.mul(cf, K.cf(w / 4, h / 2, 0), K.rot(0, -90, 0)), color);
  K.wedge(m, K.v(t, h, w / 2), K.mul(cf, K.cf(-w / 4, h / 2, 0), K.rot(0, 90, 0)), color);
}
function eyes(K, m, p, dx, d, white, pupil) {
  for (const side of [-1, 1]) {
    K.ball(m, K.v(d, d * 1.1, d * 0.5), K.add(p, K.v(side * dx, 0, 0)), white || K.C.white, { name: "EyeWhite" });
    K.ball(m, K.v(d * 0.55, d * 0.65, d * 0.3), K.add(p, K.v(side * dx, 0, -d * 0.2)), pupil || K.C.black, { name: "Pupil" });
  }
}
function whiskers(K, m, p, span, color) {
  for (const side of [-1, 1]) {
    for (const tilt of [8, -8]) {
      K.block(m, K.v(span, 0.06, 0.06), K.mul(K.cf(K.add(p, K.v(side * span * 0.55, 0, 0))), K.rot(0, 0, side * tilt)), color || K.C.white, { name: "Whisker" });
    }
  }
}

export const looks = {};

// ------------------------------------------------------------------ EAT MY SHORTS
looks[85] = (K) => {
  const c = K.cat({ color: K.C.white, pattern: "tuxedo", color2: K.C.black, eyes: "closed", mouth: "smile", tail: "long", whiskers: false });
  K.acc.tophat(c, { color: K.C.black, band: K.C.gold });
  K.acc.bowtie(c, { color: K.C.gold });
  K.acc.sign(c, "THE END", { color: K.rgb(20, 20, 24), textColor: K.C.gold, stick: K.C.gold });
  const back = c.attach("back", K.v(0, 0.6, 0.3));
  K.cyl(c.model, 0.3, 1.6, K.mul(back, K.rot(0, 0, 90)), K.rgb(40, 40, 46), { name: "Reel" });
  K.cyl(c.model, 0.34, 0.5, K.mul(back, K.rot(0, 0, 90)), K.C.silver, { name: "ReelHub" });
  return K.finish(c.model);
};

looks[86] = (K) => {
  const V = K.v;
  const m = K.model("Cat");
  const fur = K.C.orange, dark = K.C.ginger;
  K.block(m, V(5, 1.5, 1.5), V(0, 7.25, 0), fur, { name: "Body" });
  const p0 = V(1.9, 6.6, 0), p1 = V(-0.9, 0.4, 0);
  const d = K.sub(p1, p0);
  const mid = K.add(p0, K.scl(d, 0.5));
  const ang = Math.atan(d.x / -d.y);
  K.block(m, V(1.5, d.length() + 0.6, 1.5), K.mul(K.cf(mid), K.angles(0, 0, ang)), fur, { name: "Stroke" });
  for (let i = 1; i <= 3; i++) {
    const p = K.add(p0, K.scl(d, i / 4));
    K.block(m, V(1.56, 0.3, 1.56), K.mul(K.cf(p), K.angles(0, 0, ang)), dark, { name: "Stripe" });
  }
  K.block(m, V(0.3, 1.56, 1.56), V(-1.4, 7.25, 0), dark, { name: "Stripe" });
  K.block(m, V(0.3, 1.56, 1.56), V(-0.4, 7.25, 0), dark, { name: "Stripe" });
  ear(K, m, K.cf(-1.9, 7.95, 0), 1.1, 1.0, 0.3, fur);
  ear(K, m, K.cf(-0.2, 7.95, 0), 1.1, 1.0, 0.3, fur);
  ear(K, m, K.cf(-1.9, 7.98, -0.17), 0.6, 0.6, 0.06, K.C.pink);
  ear(K, m, K.cf(-0.2, 7.98, -0.17), 0.6, 0.6, 0.06, K.C.pink);
  eyes(K, m, V(-1.05, 7.45, -0.78), 0.55, 0.6);
  K.ball(m, V(0.28, 0.2, 0.2), V(-1.05, 7.0, -0.8), K.C.pink, { name: "Nose" });
  whiskers(K, m, V(-1.05, 6.85, -0.8), 1.0);
  K.ball(m, V(0.8, 0.5, 1.0), V(-1.6, 0.25, -0.1), fur, { name: "Paw" });
  K.ball(m, V(0.8, 0.5, 1.0), V(-0.2, 0.25, -0.1), fur, { name: "Paw" });
  K.limb(m, V(-0.3, 0.6, 0.5), V(1.4, 1.3, 0.6), 0.45, fur, { name: "Tail" });
  K.limb(m, V(1.4, 1.3, 0.6), V(1.9, 2.6, 0.6), 0.45, dark, { name: "Tail" });
  return K.finish(m, { fit: 8 });
};

looks[87] = (K) => {
  const V = K.v;
  const c = K.cat({ bodyShape: "tall", color: K.C.cream, eyes: "big", mouth: "o", tail: "puffy", innerEars: false });
  const m = c.model;
  const red = K.rgb(220, 40, 50), white = K.C.white;
  const y = K.p(c.attach("body")).y;
  K.block(m, V(3.6, 0.6, 2.6), V(0, y - 0.1, 0), red, { name: "Shorts" });
  for (const side of [-1, 1]) {
    K.block(m, V(1.75, 1.7, 2.6), V(side * 0.9, y - 1.2, 0), red, { name: "Shorts" });
    K.block(m, V(0.3, 1.72, 2.62), V(side * 1.45, y - 1.2, 0), white, { name: "ShortsStripe" });
  }
  K.block(m, V(3.62, 0.18, 2.62), V(0, y + 0.12, 0), white, { name: "Waistband" });
  K.limb(m, V(-0.2, y - 0.05, -1.32), V(-0.35, y - 0.9, -1.4), 0.1, white, { name: "Drawstring" });
  K.limb(m, V(0.2, y - 0.05, -1.32), V(0.4, y - 0.8, -1.4), 0.1, white, { name: "Drawstring" });
  return K.finish(m);
};

looks[88] = (K) => {
  const c = K.cat({ color: K.rgb(150, 230, 70), pattern: "spots", color2: K.rgb(60, 140, 40), eyes: "normal", mouth: "w", tail: "curly", innerEars: false });
  K.acc.sunglasses(c, { color: K.rgb(10, 10, 14) });
  K.acc.sign(c, "lol no", { color: K.C.yellow });
  return K.finish(c.model);
};

// ------------------------------------------------------------------ GIVE UP
looks[89] = (K) => {
  const V = K.v;
  const c = K.cat({ bodyShape: "round", color: K.C.grey, eyes: "closed", mouth: "frown", tail: "none", whiskers: false });
  const m = c.model;
  const paw = K.p(c.attach("frontLeftPaw"));
  const tip = K.add(paw, V(0.6, 4.2, 0));
  K.limb(m, paw, tip, 0.16, K.C.brown, { name: "FlagPole" });
  K.block(m, V(2.2, 1.4, 0.08), K.mul(K.cf(K.add(tip, V(1.15, -0.75, 0))), K.rot(0, 0, -5)), K.C.white, { name: "Flag" });
  K.block(m, V(0.9, 1.2, 0.08), K.mul(K.cf(K.add(tip, V(2.6, -0.95, 0.15))), K.rot(0, 25, -12)), K.C.white, { name: "Flag" });
  K.ball(m, V(0.3, 0.45, 0.3), K.p(c.attach("head", V(0.8, 0.5, -0.5))), K.rgb(120, 200, 255), { name: "SweatDrop", transparency: 0.2 });
  return K.finish(m);
};

looks[90] = (K) => {
  const V = K.v;
  const m = K.model("Cat");
  const paper = K.rgb(250, 250, 245), red = K.rgb(220, 50, 60);
  K.block(m, V(4.4, 5, 0.6), V(0, 3, 0), paper, { name: "Body" });
  K.block(m, V(4.6, 0.9, 0.8), V(0, 5.75, 0), red, { name: "Binding" });
  for (const x of [-1.3, 1.3]) K.cyl(m, 0.9, 0.45, K.mul(K.cf(x, 6.2, 0), K.rot(90, 0, 0)), K.C.silver, { name: "Ring" });
  for (let i = 1; i <= 7; i++) {
    const x = -1.8 + (i - 1) * 0.6;
    const tue = i === 2;
    K.block(m, V(tue ? 0.55 : 0.4, tue ? 0.55 : 0.4, 0.1), V(x, 1.35, -0.32), tue ? red : K.C.grey, { name: "Day", neon: tue });
  }
  K.block(m, V(2.2, 0.5, 0.12), V(0, 3.45, -0.34), K.C.black, { name: "T" });
  K.block(m, V(0.5, 1.5, 0.12), V(0, 2.5, -0.34), K.C.black, { name: "T" });
  ear(K, m, K.cf(-1.6, 6.2, 0), 1.1, 1.1, 0.3, paper);
  ear(K, m, K.cf(1.6, 6.2, 0), 1.1, 1.1, 0.3, paper);
  eyes(K, m, V(0, 4.7, -0.36), 0.8, 0.55);
  K.ball(m, V(0.25, 0.18, 0.15), V(0, 4.35, -0.36), K.C.pink, { name: "Nose" });
  whiskers(K, m, V(0, 4.3, -0.36), 1.2, K.C.dark);
  K.ball(m, V(0.9, 0.5, 1.1), V(-1.2, 0.25, -0.2), paper, { name: "Paw" });
  K.ball(m, V(0.9, 0.5, 1.1), V(1.2, 0.25, -0.2), paper, { name: "Paw" });
  K.limb(m, V(1.8, 1.2, 0.4), V(3.0, 1.8, 0.6), 0.4, paper, { name: "Tail" });
  K.limb(m, V(3.0, 1.8, 0.6), V(3.1, 3.2, 0.6), 0.4, red, { name: "Tail" });
  return K.finish(m);
};

looks[91] = (K) => {
  const V = K.v;
  const c = K.cat({ bodyShape: "long", color: K.rgb(70, 72, 84), eyes: "big", mouth: "none", tail: "normal", whiskers: false, innerEars: false });
  const m = c.model;
  const body = c.attach("body");
  const bs = c.bodySize;
  for (const side of [-1, 1]) {
    const x = side * (bs.x / 2 + 0.05);
    K.block(m, V(0.12, 0.7, bs.z * 0.85), K.mul(body, K.cf(x, 0.1, 0)), K.C.white, { name: "BarFrame" });
    K.block(m, V(0.16, 0.5, bs.z * 0.85 * 0.97), K.mul(body, K.cf(x, 0.1, bs.z * 0.85 * 0.015)), K.rgb(60, 230, 90), { name: "BarFill", neon: true });
  }
  const top = c.attach("headTop", V(0, 0.9, 0));
  for (let i = 0; i <= 7; i++) {
    const a = (i / 8) * Math.PI * 2;
    K.ball(m, 0.32, K.mul(top, K.cf(Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0)), K.C.white, { name: "Spinner", neon: true, transparency: i / 9 });
  }
  return K.finish(m);
};

looks[92] = (K) => {
  const V = K.v;
  const c = K.cat({ bodyShape: "flat", color: K.rgb(235, 90, 50), eyes: "angry", mouth: "teeth", tail: "normal", innerEars: false });
  const m = c.model;
  const front = c.attach("chest", V(0, -0.2, -1.4));
  const kb = K.rgb(40, 40, 48);
  K.block(m, V(1.8, 0.25, 1.1), K.mul(front, K.cf(-1.0, 0, 0), K.rot(0, 0, 14)), kb, { name: "Keyboard" });
  K.block(m, V(1.8, 0.25, 1.1), K.mul(front, K.cf(1.0, 0, 0), K.rot(0, 0, -14)), kb, { name: "Keyboard" });
  for (let i = 1; i <= 4; i++) {
    const side = i <= 2 ? -1 : 1;
    K.block(m, V(0.3, 0.15, 0.3), K.mul(front, K.cf(side * (0.6 + (i % 2) * 0.6), 0.16 + (i % 2) * 0.14, -0.2)), K.C.white, { name: "Key" });
  }
  const head = c.attach("headTop");
  [V(-0.7, 0.4, 0), V(0.7, 0.6, 0), V(0, 1.2, 0.1)].forEach((off, k) => {
    K.ball(m, 0.5 + (k + 1) * 0.12, K.mul(head, K.cf(off)), K.rgb(225, 225, 230), { name: "Steam", transparency: 0.25 });
  });
  return K.finish(m);
};

// ------------------------------------------------------------------ ALEPH NIL
looks[93] = (K) => {
  const V = K.v;
  const m = K.model("Cat");
  const col = K.rgb(230, 250, 255), glow = K.rgb(0, 230, 255);
  const a = 3.2;
  let headP = null;
  for (let i = 0; i <= 21; i++) {
    const t = (i / 22) * Math.PI * 2;
    const s = Math.sin(t);
    const den = 1 + s * s;
    const p = V((a * Math.cos(t)) / den, (a * s * Math.cos(t)) / den + 3, 0);
    if (i === 0) headP = p;
    else K.ball(m, 0.95, p, i % 2 === 0 ? col : glow, { name: i === 11 ? "Body" : "Loop", neon: i % 2 === 1 });
  }
  K.ball(m, 1.8, headP, col, { name: "Head" });
  ear(K, m, K.mul(K.cf(K.add(headP, V(-0.45, 0.6, 0))), K.rot(0, 0, 18)), 0.8, 0.75, 0.2, col);
  ear(K, m, K.mul(K.cf(K.add(headP, V(0.45, 0.6, 0))), K.rot(0, 0, -18)), 0.8, 0.75, 0.2, col);
  eyes(K, m, K.add(headP, V(0, 0.15, -0.75)), 0.4, 0.42, glow, K.C.black);
  K.ball(m, V(0.22, 0.16, 0.16), K.add(headP, V(0, -0.15, -0.88)), K.C.pink, { name: "Nose" });
  whiskers(K, m, K.add(headP, V(0, -0.25, -0.85)), 0.9, glow);
  return K.finish(m);
};

looks[94] = (K) => {
  const V = K.v;
  const c = K.cat({ bodyShape: "round", color: K.C.white, eyes: "derp", mouth: "o", tail: "curly", whiskers: false });
  const m = c.model;
  const body = c.attach("body");
  const r = c.bodySize.x / 2;
  const bits = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1];
  bits.forEach((b, k) => {
    const i = k + 1;
    const ang = (k / bits.length) * Math.PI * 2;
    const cf = K.mul(body, K.angles(0, ang, 0), K.angles(K.rad(((i % 3) - 1) * 25), 0, 0), K.cf(0, 0, -r));
    if (b === 1) K.block(m, V(0.18, 0.7, 0.12), cf, K.C.black, { name: "One" });
    else K.block(m, V(0.5, 0.6, 0.12), cf, K.rgb(0, 200, 255), { name: "Zero", neon: true });
  });
  return K.finish(m);
};

looks[95] = (K) => {
  const V = K.v;
  const c = K.cat({ color: K.rgb(130, 70, 200), pattern: "stripes", color2: K.rgb(80, 40, 140), eyes: "normal", mouth: "smile", tail: "normal", innerEars: false });
  const m = c.model;
  const back = c.attach("back", V(0, 0.15, 0));
  K.block(m, V(1.1, 0.25, 3.3), back, K.rgb(110, 70, 40), { name: "PegBoard" });
  const cols = [K.rgb(230, 40, 40), K.rgb(255, 150, 30), K.rgb(255, 230, 40), K.rgb(60, 200, 80), K.rgb(50, 110, 255)];
  for (let i = 0; i < 5; i++) K.ball(m, 0.5, K.mul(back, K.cf(0, 0.3, -1.3 + i * 0.65)), cols[i], { name: "Peg", neon: true });
  const eye = c.attach("eyes", V(0.43, 0, -0.12));
  const ep = K.p(eye);
  K.cyl(m, 0.06, 0.62, K.mul(eye, K.rot(90, 0, 0)), K.C.gold, { name: "Monocle" });
  K.limb(m, K.add(ep, V(0.3, -0.1, 0)), K.add(ep, V(0.5, -1.0, 0.2)), 0.05, K.C.gold, { name: "MonocleChain" });
  return K.finish(m);
};

// ------------------------------------------------------------------ !@#$%^&**&^%$#@!
looks[96] = (K) => {
  const V = K.v;
  const m = K.model("Cat");
  const grey = K.rgb(210, 214, 222), blue = K.rgb(40, 90, 220);
  K.block(m, V(6, 4.2, 0.5), V(0, 3.1, 0), grey, { name: "Body" });
  K.block(m, V(6, 0.8, 0.56), V(0, 5.5, 0), blue, { name: "TitleBar" });
  K.block(m, V(0.6, 0.55, 0.1), V(2.55, 5.5, -0.32), K.rgb(230, 40, 40), { name: "CloseX", neon: true });
  for (const r of [45, -45]) K.block(m, V(0.5, 0.09, 0.05), K.mul(K.cf(2.55, 5.5, -0.38), K.rot(0, 0, r)), K.C.white, { name: "XMark" });
  K.wedge(m, V(0.2, 1.4, 0.8), K.mul(K.cf(-1.75, 3.6, -0.3), K.rot(0, 90, 0)), K.C.yellow, { name: "Warn" });
  K.wedge(m, V(0.2, 1.4, 0.8), K.mul(K.cf(-2.55, 3.6, -0.3), K.rot(0, -90, 0)), K.C.yellow, { name: "Warn" });
  K.block(m, V(0.18, 0.6, 0.06), V(-2.15, 3.65, -0.42), K.C.black, { name: "Bang" });
  K.block(m, V(0.18, 0.18, 0.06), V(-2.15, 3.12, -0.42), K.C.black, { name: "Bang" });
  eyes(K, m, V(0.6, 4.0, -0.3), 0.7, 0.6);
  K.ball(m, V(0.3, 0.2, 0.15), V(0.6, 3.5, -0.3), K.C.pink, { name: "Nose" });
  K.block(m, V(1.6, 0.6, 0.2), V(1.6, 1.6, -0.3), K.rgb(235, 235, 240), { name: "OKButton" });
  K.block(m, V(1.7, 0.7, 0.16), V(1.6, 1.6, -0.25), K.rgb(60, 60, 70), { name: "OKBorder" });
  whiskers(K, m, V(0.6, 3.4, -0.3), 4.2, K.C.dark);
  ear(K, m, K.cf(-1.8, 5.9, 0), 1.3, 1.2, 0.4, blue);
  ear(K, m, K.cf(1.0, 5.9, 0), 1.3, 1.2, 0.4, blue);
  for (const x of [-2, 2]) K.limb(m, V(x, 1, 0), V(x, 0, 0), 0.5, grey, { name: "Leg" });
  K.limb(m, V(3, 2, 0.2), V(4, 3, 0.4), 0.4, grey, { name: "Tail" });
  K.limb(m, V(4, 3, 0.4), V(4.1, 4.3, 0.4), 0.4, blue, { name: "Tail" });
  return K.finish(m);
};

looks[97] = (K) => {
  const V = K.v;
  const c = K.cat({ color: K.rgb(20, 20, 26), material: "Neon", eyes: "laser", eyeColor: K.rgb(40, 255, 90), mouth: "none", tail: "long", innerEars: false, whiskers: false });
  const m = c.model;
  const body = c.attach("body"), head = c.attach("head");
  const bs = c.bodySize, hd = c.headD;
  const R = K.rgb(255, 0, 90), B = K.rgb(0, 230, 255), G = K.rgb(40, 255, 90), M = K.rgb(255, 0, 200);
  K.ball(m, bs, K.mul(body, K.cf(0.35, 0.05, 0)), R, { name: "GhostR", transparency: 0.55 });
  K.ball(m, bs, K.mul(body, K.cf(-0.35, -0.05, 0)), B, { name: "GhostB", transparency: 0.55 });
  K.ball(m, hd, K.mul(head, K.cf(0.3, 0, 0)), R, { name: "GhostR", transparency: 0.55 });
  K.ball(m, hd, K.mul(head, K.cf(-0.3, 0, 0)), B, { name: "GhostB", transparency: 0.55 });
  [-0.5, 0.1, 0.6].forEach((dy, k) => {
    const i = k + 1;
    K.block(m, V(bs.x * 0.95, 0.18, bs.z * 0.8), K.mul(body, K.cf(i % 2 === 0 ? 0.7 : -0.6, dy, 0)), i % 2 === 0 ? G : M, { name: "Slice", neon: true });
  });
  [V(1.6, 1.2, -1.2), V(-1.7, 0.6, 0.4), V(1.2, -0.4, 1.4), V(-1.1, 1.6, -0.6)].forEach((p, k) => {
    K.block(m, V(0.35, 0.35, 0.35), K.mul(body, K.cf(p)), (k + 1) % 2 === 0 ? M : G, { name: "Pixel", neon: true });
  });
  return K.finish(m);
};

// ------------------------------------------------------------------ #
looks[98] = (K) => {
  const V = K.v;
  const m = K.model("Cat");
  const black = K.rgb(20, 20, 24), white = K.C.white;
  for (const x of [-1.3, 1.3]) {
    K.block(m, V(1, 7.5, 1), K.mul(K.cf(x, 3.75, 0), K.rot(0, 0, -8)), black, { name: x < 0 ? "Body" : "Bar" });
    K.block(m, V(1.05, 7.55, 0.2), K.mul(K.cf(x, 3.75, -0.45), K.rot(0, 0, -8)), white, { name: "Edge", neon: true, transparency: 0.6 });
  }
  for (const y of [2.4, 5.0]) {
    K.block(m, V(6.5, 1, 1), V(0, y, 0), black, { name: "Bar" });
    K.block(m, V(6.55, 0.2, 1.05), V(0, y + 0.45, 0), white, { name: "Edge", neon: true, transparency: 0.6 });
  }
  ear(K, m, K.mul(K.cf(-1.8, 7.4, 0), K.rot(0, 0, 10)), 1.0, 1.0, 0.3, black);
  ear(K, m, K.mul(K.cf(0.8, 7.4, 0), K.rot(0, 0, -10)), 1.0, 1.0, 0.3, black);
  eyes(K, m, V(0, 3.75, -0.2), 0.45, 0.6, K.C.white, K.rgb(0, 0, 0));
  K.ball(m, V(0.2, 0.15, 0.15), V(0, 3.3, -0.2), K.C.pink, { name: "Nose" });
  whiskers(K, m, V(0, 3.2, -0.2), 1.3, white);
  K.limb(m, V(1.2, 0.8, 0.5), V(2.8, 0.6, 0.6), 0.35, black, { name: "Tail" });
  K.limb(m, V(2.8, 0.6, 0.6), V(3.2, 2.0, 0.6), 0.35, black, { name: "Tail" });
  return K.finish(m);
};

looks[99] = (K) => {
  const V = K.v;
  const c = K.cat({ color: K.rgb(255, 160, 200), eyes: "heart", mouth: "smile", tail: "puffy", whiskers: false });
  const m = c.model;
  const paw = K.p(c.attach("frontRightPaw"));
  const headP = K.p(c.attach("head"));
  const stickTop = K.add(paw, V(-1.2, 2.6, -1.6));
  K.limb(m, paw, stickTop, 0.14, K.C.dark, { name: "SelfieStick" });
  K.block(m, V(0.9, 1.5, 0.15), K.lookAt(stickTop, headP), K.rgb(20, 20, 24), { name: "Phone" });
  const ringC = K.mul(K.cf(K.add(stickTop, V(0, 0, -0.3))), K.lookAt(V(), K.sub(headP, stickTop)));
  for (let i = 0; i <= 7; i++) {
    const a = (i / 8) * Math.PI * 2;
    K.block(m, V(0.62, 0.16, 0.16), K.mul(ringC, K.cf(Math.cos(a) * 1.25, Math.sin(a) * 1.25, 0.1), K.angles(0, 0, a + Math.PI / 2)), K.C.white, { name: "RingLight", neon: true });
  }
  K.acc.crown(c, { color: K.rgb(255, 210, 230), gem: K.rgb(255, 60, 160), scale: 0.8 });
  return K.finish(m);
};

// ------------------------------------------------------------------ YOU HAVE TO BE AI TO DO THIS
looks[100] = (K) => {
  const V = K.v;
  const c = K.cat({ bodyShape: "cube", color: K.C.silver, material: "Metal", eyes: "laser", eyeColor: K.rgb(0, 220, 255), mouth: "none", tail: "long", innerEars: false, whiskers: false });
  const m = c.model;
  const body = c.attach("body");
  const bs = c.bodySize;
  const cyan = K.rgb(0, 220, 255);
  for (const side of [-1, 1]) {
    const x = side * (bs.x / 2 + 0.03);
    K.block(m, V(0.08, 0.12, bs.z * 0.8), K.mul(body, K.cf(x, 0.3, 0)), cyan, { name: "Circuit", neon: true });
    K.block(m, V(0.08, bs.y * 0.5, 0.12), K.mul(body, K.cf(x, 0.05, -0.6)), cyan, { name: "Circuit", neon: true });
    K.block(m, V(0.08, 0.12, bs.z * 0.4), K.mul(body, K.cf(x, -0.3, 0.4)), cyan, { name: "Circuit", neon: true });
  }
  const top = c.attach("headTop");
  const tp = K.p(top);
  K.ball(m, 1.3, K.mul(top, K.cf(0, 0.35, 0)), K.rgb(180, 230, 255), { name: "Dome", material: "Glass", transparency: 0.6 });
  K.ball(m, V(0.9, 0.6, 0.8), K.mul(top, K.cf(0, 0.3, 0)), K.rgb(255, 130, 190), { name: "Brain", neon: true });
  K.limb(m, K.add(tp, V(0.5, 0, 0.2)), K.add(tp, V(0.9, 1.4, 0.3)), 0.08, K.C.dark, { name: "Antenna" });
  K.ball(m, 0.3, K.add(tp, V(0.9, 1.5, 0.3)), K.rgb(255, 50, 50), { name: "AntennaTip", neon: true });
  return K.finish(m);
};
