// src/games/cats/scripts/catkit.js - CatKit, ported from the original Find The Cats (spec 28 §5).
// Builds cats out of primitive "prims" and turns a finished model into ONE THREE.Group of at most
// four merged meshes (solid / neon / see-through / see-through neon) plus a canvas plane per text
// label. The same Group works in the world (zonekit adds it with parts.addCustom) and in the Index
// thumbnail renderer (thumbs.js), which turns a colour render into the black silhouette on a 2D canvas.
//
//   import { createCatKit } from "./catkit.js";
//   const K = createCatKit(ctx.engine.THREE);      // zone files RECEIVE K; they never create one
//
// COORDINATES while building: model-local, ground at y = 0, the cat FACES -Z (head towards -Z),
// +X is the cat's LEFT side as seen from the front (= viewer's right). K.finish recentres it.
// A "cf" below is a THREE.Matrix4 (rotation + position, never scale) - the original's CFrame. Every
// `at` argument accepts a Matrix4, a THREE.Vector3 or an [x, y, z] array (a position).
//
// CFRAME HELPERS (all return NEW objects; nothing mutates its inputs):
//   K.v(x, y, z) -> Vector3            K.cf(x, y, z) | K.cf(vec) -> Matrix4 translation
//   K.rot(xDeg, yDeg, zDeg) -> Matrix4 (= CFrame.Angles in DEGREES, X*Y*Z order like the original)
//   K.angles(xRad, yRad, zRad)         K.rad(deg)
//   K.mul(a, b, c, ...) -> a*b*c       (= the Luau `a * b * c`; Vector3/arrays become translations)
//   K.p(cf) -> Vector3 position        K.lookAt(from, to, up?) -> Matrix4 (-Z faces `to`)
//   K.toCF(at) -> Matrix4              K.add(a, b) / K.sub(a, b) / K.scl(v, s) -> Vector3
//   K.rgb(r, g, b) -> "#rrggbb"        K.lerp(hexA, hexB, t) -> "#rrggbb"     K.C.<name> palette
//
// PRIM HELPERS (each returns the prim, a plain mutable record { name, kind, size:Vector3, cf,
// color, material, transparency } - set .color / .material on it before K.finish, exactly as the
// Lua did `c.parts.LoafTop.Color = crust`). `props` = optional { name, material, neon,
// transparency } (original casing Name/Material/Neon/Transparency is accepted too; Reflectance and
// other Instance properties are ignored). Materials: any engine name (plastic, neon, glass, metal,
// wood, sand, ...) or the original names the cats used (Glass, Foil, Metal, Sand, Slate, Wood, Fabric,
// DiamondPlate, SmoothPlastic, Neon). Neon draws unlit; glass draws see-through.
//   K.block(model, size, at, color, props)            box
//   K.ball(model, size, at, color, props)             size number = sphere, Vector3 = ellipsoid
//   K.cyl(model, length, diameter, at, color, props)  cylinder whose axis is `at`'s UP (Y) vector
//   K.limb(model, p0, p1, diameter, color, props)     cylinder from point p0 to point p1
//   K.wedge(model, size, at, color, props)            original WedgePart (slope rises towards +Z)
//   K.cwedge(model, size, at, color, props)           original CornerWedgePart (approximation: apex at
//                                                     the +X, +Y, +Z corner)
//   K.text(prim, text, { color, bg, both, face })     canvas label on the prim's -Z face (both =
//                                                     also +Z). Drawn in the world AND the Index.
//   K.model(name) -> model                            K.count(model) / K.baseParts(model) -> prims
//   K.bounds(model) -> { center: Vector3, size: Vector3, cf }   K.scale(model, f)
//
// THE CAT: const c = K.cat(spec) - spec exactly as the original (all optional):
//   name, color (fur, orange), color2 (pattern, white), color3 (calico third, black),
//   pattern "plain"|"stripes"|"spots"|"tuxedo"|"calico", scale (1 = ~4.5 studs long),
//   bodyShape "normal"|"loaf"|"long"|"round"|"cube"|"flat"|"tall",
//   eyes "normal"|"big"|"sleepy"|"angry"|"derp"|"closed"|"laser"|"heart"|"x",
//   mouth "smile"|"o"|"w"|"frown"|"teeth"|"none", tail "normal"|"puffy"|"none"|"curly"|"long",
//   eyeColor, eyeWhite, noseColor, earColor, innerEarColor, whiskerColor, mouthColor,
//   innerEars (true), whiskers (true), legs (true), material (fur material),
//   accessories: list of "tophat" | ["sign", "HELLO"] | ["crown", { color }] | (c) => {}
// returns c = { model, head, body, parts: { Body, Head, LoafTop? }, spec, s, headD, bodySize,
//   attach(name, offset?) -> Matrix4, anchors }. Anchor names: head, headTop, face, eyes, nose,
//   mouth, neck, chest, back, body, tail, tailBase, leftEar, rightEar, side, feet, frontLeftPaw,
//   frontRightPaw. Add accessories/props BEFORE K.finish (anchors are pre-finish coordinates).
//
// ACCESSORIES (opts.color, opts.scale, opts.at = Matrix4 override; each returns its prims; they
// also accept { model, headD } + opts.at for non-K.cat models):
//   K.acc.tophat  K.acc.crown  K.acc.sunglasses  K.acc.bowtie  K.acc.cape
//   K.acc.halo    K.acc.horns  K.acc.wings       K.acc.sign(c, text, opts)    K.acc.box
//
// FINISH (always the last line of a look): K.finish(model, { fit }) -> THREE.Group. Recentres the
// bounding box on the origin, optionally scales so the longest side == fit, and THROWS past
// MAX_PARTS (60) prims - the caller (zonekit / thumbs) catches it and shows the fallback cat.
// group.userData = { cat: true, size: Vector3, prims: n }. Free a group with K.disposeGroup(g).
//
// PERFORMANCE: a cat is drawn in <= 4 draw calls however many prims it has (+1 per text label).
// Unit geometries and the shared materials live for the life of the kit; K.dispose() frees them.

export const MAX_PARTS = 60;

const DEG = Math.PI / 180;

// original / engine material name -> how the merged mesh draws it.
const NEON_MATS = new Set(["neon"]);
const GLASS_MATS = new Set(["glass", "forcefield"]);

function normMaterial(m) {
  if (m == null) return "plastic";
  const s = String(m).toLowerCase();
  if (s === "smoothplastic") return "plastic";
  return s;
}

export function createCatKit(THREE) {
  const K = {};
  K.MAX_PARTS = MAX_PARTS;
  K.THREE = THREE;

  // ---- tiny CFrame layer -------------------------------------------------------------------
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  K.v = V;
  K.rad = (d) => d * DEG;
  function toVec(p) {
    if (!p) return V();
    if (p.isVector3) return p.clone();
    if (Array.isArray(p)) return V(p[0] || 0, p[1] || 0, p[2] || 0);
    if (p.isMatrix4) return V().setFromMatrixPosition(p);
    return V();
  }
  K.toVec = toVec;
  function toCF(at) {
    if (at == null) return new THREE.Matrix4();
    if (at.isMatrix4) return at.clone();
    const p = toVec(at);
    return new THREE.Matrix4().makeTranslation(p.x, p.y, p.z);
  }
  K.toCF = toCF;
  K.cf = (x, y, z) => {
    if (x != null && (x.isVector3 || Array.isArray(x))) return toCF(x);
    return new THREE.Matrix4().makeTranslation(x || 0, y || 0, z || 0);
  };
  K.angles = (x = 0, y = 0, z = 0) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, y, z, "XYZ"));
  K.rot = (x = 0, y = 0, z = 0) => K.angles(x * DEG, y * DEG, z * DEG);
  K.mul = (...ms) => {
    const out = new THREE.Matrix4();
    for (const m of ms) out.multiply(toCF(m));
    return out;
  };
  K.p = (cf) => toVec(cf);
  K.lookAt = (from, to, up) => {
    const f = toVec(from);
    const t = toVec(to);
    const m = new THREE.Matrix4().lookAt(f, t, up ? toVec(up) : V(0, 1, 0));
    m.setPosition(f);
    return m;
  };
  K.add = (a, b) => toVec(a).add(toVec(b));
  K.sub = (a, b) => toVec(a).sub(toVec(b));
  K.scl = (a, s) => toVec(a).multiplyScalar(s);

  // ---- colours ----------------------------------------------------------------------------
  const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  K.rgb = (r, g, b) => "#" + hex2(r) + hex2(g) + hex2(b);
  K.lerp = (a, b, t) => {
    const ca = new THREE.Color(colorHex(a));
    const cb = new THREE.Color(colorHex(b));
    return "#" + ca.lerp(cb, t).getHexString();
  };
  function colorHex(c) {
    if (c == null) return "#96969e";
    if (typeof c === "string") return c;
    if (c.isColor) return "#" + c.getHexString();
    return "#96969e";
  }
  K.C = Object.freeze({
    orange: K.rgb(245, 150, 60), ginger: K.rgb(220, 110, 40), cream: K.rgb(250, 230, 190),
    white: K.rgb(245, 245, 245), black: K.rgb(30, 30, 34), dark: K.rgb(60, 55, 55),
    grey: K.rgb(150, 150, 158), brown: K.rgb(130, 85, 50), tan: K.rgb(210, 170, 120),
    pink: K.rgb(255, 150, 180), red: K.rgb(220, 40, 40), blue: K.rgb(60, 120, 255),
    green: K.rgb(70, 200, 90), yellow: K.rgb(255, 220, 60), purple: K.rgb(150, 80, 220),
    gold: K.rgb(255, 200, 40), silver: K.rgb(200, 205, 215),
  });

  // ---- models and prims -------------------------------------------------------------------
  K.model = (name) => ({ isCatModel: true, name: name || "Cat", prims: [] });

  function readProps(props) {
    const p = props || {};
    const pick = (a, b) => (p[a] !== undefined ? p[a] : p[b]);
    let material = pick("material", "Material");
    if (pick("neon", "Neon")) material = "neon";
    return {
      name: pick("name", "Name"),
      material: material !== undefined ? normMaterial(material) : undefined,
      transparency: pick("transparency", "Transparency"),
    };
  }

  function addPrim(model, kind, size, at, color, props, defName) {
    if (!model || !Array.isArray(model.prims)) throw new Error("CatKit: first argument must be a K.model() / c.model");
    const pr = readProps(props);
    const prim = {
      name: pr.name || defName,
      kind,
      size: toVec(size),
      cf: toCF(at),
      color: colorHex(color),
      material: pr.material || "plastic",
      transparency: Number.isFinite(pr.transparency) ? pr.transparency : 0,
      text: null,
    };
    model.prims.push(prim);
    return prim;
  }

  K.part = (props = {}) => {
    const kind = { WedgePart: "wedge", CornerWedgePart: "cwedge" }[props.Class] ||
      ({ Ball: "ball", Cylinder: "cyl" }[props.Shape] || "box");
    return addPrim(props.Parent || props.parent, kind, props.Size || props.size || [1, 1, 1],
      props.CFrame || props.cf || props.Position || props.position, props.Color || props.color, props, kind);
  };
  K.block = (model, size, at, color, props) => addPrim(model, "box", size, at, color || K.C.grey, props, "Block");
  K.ball = (model, size, at, color, props) => {
    const s = typeof size === "number" ? [size, size, size] : size;
    return addPrim(model, "ball", s, at, color || K.C.grey, props, "Ball");
  };
  K.cyl = (model, length, diameter, at, color, props) =>
    addPrim(model, "cyl", [diameter, length, diameter], at, color || K.C.grey, props, "Cyl");
  K.limb = (model, p0, p1, diameter, color, props) => {
    const a = toVec(p0);
    const b = toVec(p1);
    const d = b.clone().sub(a);
    let len = d.length();
    if (len < 0.01) { len = 0.01; d.set(0, 1, 0); }
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
    const cf = new THREE.Matrix4().compose(a.clone().addScaledVector(d, 0.5), q, V(1, 1, 1));
    return addPrim(model, "cyl", [diameter, len, diameter], cf, color || K.C.grey, props, "Limb");
  };
  K.wedge = (model, size, at, color, props) => addPrim(model, "wedge", size, at, color || K.C.grey, props, "Wedge");
  K.cwedge = (model, size, at, color, props) => addPrim(model, "cwedge", size, at, color || K.C.grey, props, "CornerWedge");
  K.text = (prim, text, props = {}) => {
    if (!prim || !prim.kind) return null;
    prim.text = {
      text: String(text == null ? "" : text),
      color: colorHex(props.color || "#000000"),
      bg: props.bg ? colorHex(props.bg) : null,
      both: !!props.both,
      face: String(props.face || "Front").toLowerCase(),
    };
    return prim.text;
  };

  K.baseParts = (model) => (model && model.prims ? model.prims.slice() : []);
  K.count = (model) => (model && model.prims ? model.prims.length : 0);

  function primAabb(p) {
    const e = p.cf.elements; // column-major
    const hx = p.size.x / 2, hy = p.size.y / 2, hz = p.size.z / 2;
    const ex = Math.abs(e[0]) * hx + Math.abs(e[4]) * hy + Math.abs(e[8]) * hz;
    const ey = Math.abs(e[1]) * hx + Math.abs(e[5]) * hy + Math.abs(e[9]) * hz;
    const ez = Math.abs(e[2]) * hx + Math.abs(e[6]) * hy + Math.abs(e[10]) * hz;
    return [e[12] - ex, e[13] - ey, e[14] - ez, e[12] + ex, e[13] + ey, e[14] + ez];
  }
  K.bounds = (model) => {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const p of model.prims) {
      if (p.transparency >= 1) continue;
      const b = primAabb(p);
      x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); z0 = Math.min(z0, b[2]);
      x1 = Math.max(x1, b[3]); y1 = Math.max(y1, b[4]); z1 = Math.max(z1, b[5]);
    }
    if (x0 === Infinity) return { center: V(), size: V(), cf: new THREE.Matrix4() };
    const center = V((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return { center, size: V(x1 - x0, y1 - y0, z1 - z0), cf: K.cf(center) };
  };
  K.scale = (model, f) => {
    if (f === 1) return model;
    for (const p of model.prims) {
      p.size.multiplyScalar(f);
      const e = p.cf.elements;
      e[12] *= f; e[13] *= f; e[14] *= f;
    }
    return model;
  };

  // ---- unit geometries (indexed, position + normal) -----------------------------------------
  const unit = {};
  function wedgeGeometry(corner) {
    // original WedgePart: bottom at y = -0.5, vertical face at +Z, slope from the bottom -Z edge up
    // to the top +Z edge. Flat-shaded: every face has its own vertices.
    const P = corner
      ? { A: [-0.5, -0.5, -0.5], B: [0.5, -0.5, -0.5], C: [0.5, -0.5, 0.5], D: [-0.5, -0.5, 0.5], T: [0.5, 0.5, 0.5] }
      : null;
    const faces = corner
      ? [[P.A, P.C, P.B], [P.A, P.D, P.C], [P.D, P.T, P.C], [P.C, P.T, P.B], [P.A, P.T, P.D], [P.A, P.B, P.T]]
      : (() => {
        const a = [-0.5, -0.5, -0.5], b = [0.5, -0.5, -0.5], c = [0.5, -0.5, 0.5], d = [-0.5, -0.5, 0.5];
        const e = [-0.5, 0.5, 0.5], f = [0.5, 0.5, 0.5];
        return [[a, c, b], [a, d, c], [d, f, c], [d, e, f], [a, b, f], [a, f, e], [a, e, d], [b, c, f]];
      })();
    const pos = [];
    for (const tri of faces) for (const v of tri) pos.push(v[0], v[1], v[2]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const idx = [];
    for (let i = 0; i < pos.length / 3; i++) idx.push(i);
    g.setIndex(idx);
    return g;
  }
  function unitGeometry(kind) {
    if (unit[kind]) return unit[kind];
    let g;
    if (kind === "box") g = new THREE.BoxGeometry(1, 1, 1);
    else if (kind === "ball") g = new THREE.SphereGeometry(0.5, 14, 9);
    else if (kind === "cyl") g = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
    else if (kind === "wedge") g = wedgeGeometry(false);
    else if (kind === "cwedge") g = wedgeGeometry(true);
    else g = new THREE.BoxGeometry(1, 1, 1);
    unit[kind] = g;
    return g;
  }

  // ---- shared materials -----------------------------------------------------------------------
  let mats = null;
  function materials() {
    if (mats) return mats;
    const L = (o) => new THREE.MeshLambertMaterial({ vertexColors: true, ...o });
    const B = (o) => new THREE.MeshBasicMaterial({ vertexColors: true, ...o });
    const see = { transparent: true, depthWrite: false };
    mats = {
      solid: L({}),
      neon: B({}),
      seeSolid: L(see),
      seeNeon: B(see),
      ghost: {
        solid: L({ transparent: true, opacity: 0.32, depthWrite: false }),
        neon: B({ transparent: true, opacity: 0.32, depthWrite: false }),
        seeSolid: L({ transparent: true, opacity: 0.2, depthWrite: false }),
        seeNeon: B({ transparent: true, opacity: 0.2, depthWrite: false }),
      },
      black: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    };
    return mats;
  }
  K.materials = materials;

  // ---- text planes ------------------------------------------------------------------------------
  function textPlane(prim, which) {
    const t = prim.text;
    // the face the label sits on, in prim-local units
    const faces = {
      front: { n: [0, 0, -1], w: prim.size.x, h: prim.size.y, rotY: Math.PI },
      back: { n: [0, 0, 1], w: prim.size.x, h: prim.size.y, rotY: 0 },
      right: { n: [1, 0, 0], w: prim.size.z, h: prim.size.y, rotY: Math.PI / 2 },
      left: { n: [-1, 0, 0], w: prim.size.z, h: prim.size.y, rotY: -Math.PI / 2 },
      top: { n: [0, 1, 0], w: prim.size.x, h: prim.size.z, rotX: -Math.PI / 2 },
    };
    const f = faces[which] || faces.front;
    const w = Math.max(0.05, f.w), h = Math.max(0.05, f.h);
    const pxPer = Math.min(64, 512 / Math.max(w, h));
    const cw = Math.max(16, Math.round(w * pxPer)), ch = Math.max(16, Math.round(h * pxPer));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    drawFitText(canvas, t.text, t.color, t.bg);
    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const geo = new THREE.PlaneGeometry(w, h);
    const mesh = new THREE.Mesh(geo, mat);
    const off = 0.02;
    const half = [prim.size.x / 2, prim.size.y / 2, prim.size.z / 2];
    mesh.position.set(f.n[0] * (half[0] + off), f.n[1] * (half[1] + off), f.n[2] * (half[2] + off));
    if (f.rotY) mesh.rotation.y = f.rotY;
    if (f.rotX) mesh.rotation.x = f.rotX;
    const holder = new THREE.Group();
    holder.matrixAutoUpdate = false;
    holder.matrix.copy(prim.cf);
    holder.add(mesh);
    mesh.userData.ownsResources = true;
    return holder;
  }
  K.drawFitText = drawFitText;

  // ---- finish ----------------------------------------------------------------------------------
  const BUCKETS = ["solid", "neon", "seeSolid", "seeNeon"];
  K.finish = (model, opts = {}) => {
    if (!model || !Array.isArray(model.prims) || model.prims.length === 0) throw new Error("CatKit.finish: model has no parts");
    if (model.prims.length > MAX_PARTS) {
      throw new Error(`CatKit.finish: ${model.name} has ${model.prims.length} parts (max ${MAX_PARTS})`);
    }
    const b = K.bounds(model);
    for (const p of model.prims) {
      const e = p.cf.elements;
      e[12] -= b.center.x; e[13] -= b.center.y; e[14] -= b.center.z;
    }
    let size = b.size.clone();
    if (opts.fit) {
      const longest = Math.max(size.x, size.y, size.z);
      if (longest > 0) {
        K.scale(model, opts.fit / longest);
        size.multiplyScalar(opts.fit / longest);
      }
    }
    return buildGroup(model, size);
  };

  function buildGroup(model, size) {
    const M = materials();
    const acc = {};
    for (const k of BUCKETS) acc[k] = { pos: [], nrm: [], col: [], idx: [], rgba: k.startsWith("see") };
    const m4 = new THREE.Matrix4();
    const nm = new THREE.Matrix3();
    const tmp = new THREE.Vector3();
    const col = new THREE.Color();
    const texts = [];
    for (const p of model.prims) {
      if (p.text) texts.push(p);
      if (p.transparency >= 1) continue;
      const mat = normMaterial(p.material);
      const neon = NEON_MATS.has(mat);
      let alpha = 1 - Math.max(0, Math.min(1, p.transparency || 0));
      if (GLASS_MATS.has(mat)) alpha = Math.min(alpha, 0.55);
      const see = alpha < 0.999;
      const B = acc[see ? (neon ? "seeNeon" : "seeSolid") : (neon ? "neon" : "solid")];
      const g = unitGeometry(p.kind);
      const gp = g.attributes.position.array;
      const gn = g.attributes.normal.array;
      const gi = g.index ? g.index.array : null;
      m4.copy(p.cf).multiply(new THREE.Matrix4().makeScale(p.size.x || 0.001, p.size.y || 0.001, p.size.z || 0.001));
      nm.getNormalMatrix(m4);
      col.set(p.color);
      const base = B.pos.length / 3;
      for (let i = 0; i < gp.length; i += 3) {
        tmp.set(gp[i], gp[i + 1], gp[i + 2]).applyMatrix4(m4);
        B.pos.push(tmp.x, tmp.y, tmp.z);
        tmp.set(gn[i], gn[i + 1], gn[i + 2]).applyMatrix3(nm).normalize();
        B.nrm.push(tmp.x, tmp.y, tmp.z);
        if (B.rgba) B.col.push(col.r, col.g, col.b, alpha);
        else B.col.push(col.r, col.g, col.b);
      }
      if (gi) for (let i = 0; i < gi.length; i++) B.idx.push(base + gi[i]);
      else for (let i = 0; i < gp.length / 3; i++) B.idx.push(base + i);
    }
    const group = new THREE.Group();
    group.name = model.name;
    for (const k of BUCKETS) {
      const B = acc[k];
      if (!B.pos.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(B.pos, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(B.nrm, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(B.col, B.rgba ? 4 : 3));
      geo.setIndex(B.idx.length > 65535 ? new THREE.Uint32BufferAttribute(B.idx, 1) : new THREE.Uint16BufferAttribute(B.idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, M[k]);
      mesh.userData.bucket = k;
      if (k.startsWith("see")) mesh.renderOrder = 2;
      group.add(mesh);
    }
    for (const p of texts) {
      group.add(textPlane(p, p.text.face));
      if (p.text.both) group.add(textPlane(p, p.text.face === "back" ? "front" : "back"));
    }
    group.userData = { cat: true, size, prims: model.prims.length, ghost: false };
    return group;
  }

  // Swap a finished cat between its normal and its ghost (found-already) look.
  K.setGhost = (group, on) => {
    if (!group || !!group.userData.ghost === !!on) return;
    const M = materials();
    group.traverse((o) => {
      if (!o.isMesh || !o.userData.bucket) return;
      o.material = on ? M.ghost[o.userData.bucket] : M[o.userData.bucket];
    });
    group.userData.ghost = !!on;
  };

  K.disposeGroup = (group) => {
    if (!group) return;
    group.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.bucket && o.geometry) o.geometry.dispose();
      if (o.userData.ownsResources) {
        if (o.material && o.material.map) o.material.map.dispose();
        if (o.material) o.material.dispose();
        if (o.geometry) o.geometry.dispose();
      }
    });
    if (group.parent) group.parent.remove(group);
  };

  K.dispose = () => {
    for (const k of Object.keys(unit)) { unit[k].dispose(); delete unit[k]; }
    if (mats) {
      for (const k of BUCKETS) { mats[k].dispose(); mats.ghost[k].dispose(); }
      mats.black.dispose();
      mats = null;
    }
  };

  // ---- the cat ------------------------------------------------------------------------------
  const SHAPES = {
    normal: { leg: 1.0, body: "ellipsoid", bs: [2.1, 1.7, 3.2], bc: [0, 1.75, 0.2], hd: 1.9, hc: [0, 2.95, -1.45], tb: [0, 2.0, 1.7], legX: 0.6, legZ: [-0.9, 1.2] },
    loaf: { leg: 0, body: "loaf", bs: [2.3, 1.9, 3.0], bc: [0, 0.95, 0.2], hd: 1.8, hc: [0, 1.95, -1.35], tb: [0, 0.4, 1.6], legX: 0.55, legZ: [] },
    long: { leg: 1.0, body: "ellipsoid", bs: [2.0, 1.6, 7.5], bc: [0, 1.75, 0.6], hd: 1.8, hc: [0, 2.85, -3.45], tb: [0, 2.0, 4.25], legX: 0.55, legZ: [-2.4, 3.4] },
    round: { leg: 0.5, body: "ball", bs: [3.0, 3.0, 3.0], bc: [0, 1.85, 0.2], hd: 1.9, hc: [0, 3.3, -1.15], tb: [0, 1.8, 1.65], legX: 0.8, legZ: [-0.8, 1.1] },
    cube: { leg: 0.8, body: "block", bs: [2.4, 2.0, 2.8], bc: [0, 1.8, 0.3], hd: 1.9, hc: [0, 3.05, -1.35], tb: [0, 2.3, 1.7], legX: 0.75, legZ: [-0.7, 1.3], cubeHead: true },
    flat: { leg: 0.3, body: "ellipsoid", bs: [3.0, 0.6, 3.6], bc: [0, 0.6, 0.2], hd: 1.6, hc: [0, 0.95, -1.75], tb: [0, 0.6, 2.0], legX: 1.0, legZ: [-1.0, 1.3] },
    tall: { leg: 1.2, body: "ellipsoid", bs: [1.8, 3.2, 1.6], bc: [0, 2.8, 0], hd: 1.9, hc: [0, 5.2, -0.15], tb: [0, 1.8, 0.75], legX: 0.45, legZ: [0.1], upright: true },
  };
  K.SHAPES = SHAPES;

  K.cat = (spec = {}) => {
    const s = spec.scale || 1;
    const sh = SHAPES[spec.bodyShape || "normal"] || SHAPES.normal;
    const col = spec.color || K.C.orange;
    const col2 = spec.color2 || K.C.white;
    const col3 = spec.color3 || K.C.black;
    const pattern = spec.pattern || "plain";
    const fur = spec.material;
    const m = K.model(spec.name || "Cat");
    const parts = {};
    const VS = (x, y, z) => V(x * s, y * s, z * s);
    const furProps = (name) => (fur ? { name, material: fur } : { name });
    const A = K.angles;
    const T = (x, y, z) => K.cf(x, y, z);

    const bs = V(...sh.bs).multiplyScalar(s);
    const bc = V(...sh.bc).multiplyScalar(s);
    let body;
    if (sh.body === "ball") body = K.ball(m, bs.x, bc, col, furProps("Body"));
    else if (sh.body === "block") body = K.block(m, bs, bc, col, furProps("Body"));
    else if (sh.body === "loaf") {
      body = K.block(m, V(bs.x, bs.y * 0.55, bs.z), K.sub(bc, V(0, bs.y * 0.225, 0)), col, furProps("Body"));
      // The original: a cylinder along the body's length (its X axis turned to Z); here a Z-axis cylinder.
      parts.LoafTop = K.cyl(m, bs.z, bs.x, K.mul(K.add(bc, V(0, bs.y * 0.5 - bs.x * 0.5, 0)), A(Math.PI / 2, 0, 0)), col, furProps("LoafTop"));
    } else body = K.ball(m, bs, bc, col, furProps("Body"));
    parts.Body = body;

    const hd = sh.hd * s;
    const hr = hd / 2;
    const hc = V(...sh.hc).multiplyScalar(s);
    const head = sh.cubeHead ? K.block(m, V(hd, hd, hd), hc, col, furProps("Head")) : K.ball(m, hd, hc, col, furProps("Head"));
    parts.Head = head;

    const face = (x, y, inset = 0) => {
      const z = sh.cubeHead ? -hr : -Math.sqrt(Math.max(0, hr * hr - x * x - y * y));
      return K.add(hc, V(x, y, z + inset));
    };

    // ears
    const earColor = spec.earColor || col;
    const ear = (side) => {
      const ex = side * hr * 0.55;
      const ey = sh.cubeHead ? hr : hr * 0.7;
      const base = K.mul(K.add(hc, V(ex, ey - 0.08 * s, sh.cubeHead ? 0 : -0.05 * s)), A(0, 0, -side * 18 * DEG));
      const w = 0.9 * s, h = 0.85 * s, t = 0.22 * s;
      const tri = (cf, ww, hh, tt, c, nm) => {
        K.wedge(m, V(tt, hh, ww / 2), K.mul(cf, T(ww / 4, hh / 2, 0), A(0, -Math.PI / 2, 0)), c, furProps(nm));
        K.wedge(m, V(tt, hh, ww / 2), K.mul(cf, T(-ww / 4, hh / 2, 0), A(0, Math.PI / 2, 0)), c, furProps(nm));
      };
      tri(base, w, h, t, earColor, "Ear");
      if (spec.innerEars !== false) {
        tri(K.mul(base, T(0, 0.05 * s, -t / 2 - 0.02 * s)), w * 0.55, h * 0.65, 0.05 * s, spec.innerEarColor || K.C.pink, "InnerEar");
      }
      return K.mul(base, T(0, h, 0));
    };
    const earR = ear(-1);
    const earL = ear(1);

    // eyes
    const eyes = spec.eyes || "normal";
    const ex = hd * 0.23, ey = hd * 0.08;
    const pupilC = spec.eyeColor || K.C.black;
    const whiteC = spec.eyeWhite || K.C.white;
    const eye = (side) => {
      const x = side * ex;
      const p = face(x, ey, 0.04 * s);
      if (eyes === "closed") {
        K.block(m, V(hd * 0.24, hd * 0.045, 0.06 * s), K.mul(p, A(0, 0, side * -12 * DEG)), pupilC, { name: "Eye" });
        return;
      } else if (eyes === "x") {
        K.block(m, V(hd * 0.24, hd * 0.05, 0.06 * s), K.mul(p, A(0, 0, 45 * DEG)), pupilC, { name: "Eye" });
        K.block(m, V(hd * 0.24, hd * 0.05, 0.06 * s), K.mul(p, A(0, 0, -45 * DEG)), pupilC, { name: "Eye" });
        return;
      } else if (eyes === "heart") {
        const hcol = spec.eyeColor || K.rgb(255, 60, 140);
        const r = hd * 0.11;
        K.ball(m, r * 1.25, K.add(p, V(-r * 0.45, r * 0.3, 0)), hcol, { name: "Eye", neon: true });
        K.ball(m, r * 1.25, K.add(p, V(r * 0.45, r * 0.3, 0)), hcol, { name: "Eye", neon: true });
        K.block(m, V(r * 1.05, r * 1.05, 0.1 * s), K.mul(K.add(p, V(0, -r * 0.15, 0)), A(0, 0, 45 * DEG)), hcol, { name: "Eye", neon: true });
        return;
      } else if (eyes === "laser") {
        const lc = spec.eyeColor || K.rgb(255, 30, 30);
        K.ball(m, hd * 0.2, p, lc, { name: "Eye", neon: true });
        K.limb(m, p, K.add(p, V(side * 0.15 * s, -0.1 * s, -1.4 * s)), hd * 0.07, lc, { name: "Laser", neon: true, transparency: 0.2 });
        return;
      }
      const wsz = eyes === "big" ? hd * 0.36 : hd * 0.26;
      let psz = eyes === "big" ? hd * 0.23 : hd * 0.15;
      K.ball(m, V(wsz, wsz * (eyes === "sleepy" ? 0.9 : 1.1), wsz * 0.6), p, whiteC, { name: "EyeWhite" });
      let poff = V(0, 0, -wsz * 0.22);
      if (eyes === "derp") {
        poff = poff.add(side > 0 ? V(wsz * 0.18, wsz * 0.2, 0) : V(-wsz * 0.15, -wsz * 0.22, 0));
        psz = side > 0 ? psz * 0.7 : psz * 1.15;
      }
      K.ball(m, V(psz, psz * 1.15, psz * 0.5), K.add(p, poff), pupilC, { name: "Pupil" });
      if (eyes === "big") {
        K.ball(m, hd * 0.07, K.add(K.add(p, poff), V(side * psz * 0.2, psz * 0.25, -psz * 0.2)), K.C.white, { name: "Shine", neon: true });
      } else if (eyes === "sleepy") {
        K.block(m, V(wsz * 1.1, wsz * 0.55, wsz * 0.35), K.add(p, V(0, wsz * 0.28, -wsz * 0.12)), col, furProps("Eyelid"));
      } else if (eyes === "angry") {
        K.block(m, V(wsz * 1.2, hd * 0.06, 0.08 * s), K.mul(K.add(p, V(0, wsz * 0.62, -wsz * 0.2)), A(0, 0, side * 22 * DEG)), K.C.black, { name: "Brow" });
      }
    };
    eye(1);
    eye(-1);

    // nose + mouth
    const noseP = face(0, -hd * 0.05, 0.02 * s);
    K.ball(m, V(hd * 0.13, hd * 0.09, hd * 0.09), noseP, spec.noseColor || K.C.pink, { name: "Nose" });
    const mouthP = face(0, -hd * 0.17, 0.03 * s);
    const mouth = spec.mouth || "smile";
    const mc = spec.mouthColor || K.C.black;
    const lw = hd * 0.035;
    if (mouth === "smile" || mouth === "frown") {
      const dir = mouth === "smile" ? 1 : -1;
      for (const side of [-1, 1]) {
        K.block(m, V(hd * 0.17, lw, 0.05 * s), K.mul(K.add(mouthP, V(side * hd * 0.07, 0, 0)), A(0, 0, side * dir * 25 * DEG)), mc, { name: "Mouth" });
      }
    } else if (mouth === "w") {
      [-1, -1, 1, 1].forEach((side, i) => {
        const inner = i === 1 || i === 2;
        const x = side * hd * (inner ? 0.035 : 0.095);
        const ang = (inner ? -1 : 1) * side * 50 * DEG;
        K.block(m, V(hd * 0.08, lw, 0.05 * s), K.mul(K.add(mouthP, V(x, 0, 0)), A(0, 0, ang)), mc, { name: "Mouth" });
      });
    } else if (mouth === "o") {
      K.ball(m, V(hd * 0.13, hd * 0.15, 0.08 * s), K.add(mouthP, V(0, -hd * 0.02, 0)), mc, { name: "Mouth" });
    } else if (mouth === "teeth") {
      K.block(m, V(hd * 0.3, hd * 0.1, 0.05 * s), mouthP, mc, { name: "Mouth" });
      for (const side of [-1, 1]) {
        K.wedge(m, V(hd * 0.06, hd * 0.08, 0.04 * s), K.mul(K.add(mouthP, V(side * hd * 0.08, hd * 0.01, -0.03 * s)), A(Math.PI, 0, 0)), K.C.white, { name: "Fang" });
      }
    }

    // whiskers
    if (spec.whiskers !== false) {
      for (const side of [-1, 1]) {
        for (const tilt of [8, -8]) {
          const base = face(side * hd * 0.22, -hd * 0.1, -0.02 * s);
          K.block(m, V(hd * 0.42, 0.04 * s, 0.04 * s), K.mul(K.add(base, V(side * hd * 0.2, 0, 0)), A(0, side * -10 * DEG, side * tilt * DEG)), spec.whiskerColor || K.C.white, { name: "Whisker" });
        }
      }
    }

    // legs (+ arms for tall cats)
    const legD = 0.55 * s;
    const legLen = sh.leg * s;
    const paws = {};
    if (spec.legs !== false && legLen > 0) {
      const legCol = pattern === "tuxedo" ? col2 : col;
      for (const lz of sh.legZ) {
        for (const side of [-1, 1]) {
          const x = side * sh.legX * s;
          const z = lz * s;
          K.limb(m, V(x, 0, z), V(x, legLen + 0.25 * s, z), legD, legCol, furProps("Leg"));
          if (lz === sh.legZ[0]) paws[side] = V(x, legD / 2, z - legD / 2);
        }
      }
      if (sh.upright) {
        for (const side of [-1, 1]) {
          const sp = K.add(bc, V(side * bs.x * 0.42, bs.y * 0.15, -bs.z * 0.2));
          const hp = K.add(sp, V(side * 0.15 * s, -0.9 * s, -0.7 * s));
          K.limb(m, sp, hp, legD * 0.9, legCol, furProps("Arm"));
          paws[side] = hp;
        }
      }
    }
    if (legLen === 0 && spec.legs !== false) {
      for (const side of [-1, 1]) {
        const p = V(side * sh.legX * s, 0.22 * s, bc.z - bs.z / 2 - 0.1 * s);
        K.ball(m, V(0.5 * s, 0.44 * s, 0.6 * s), p, pattern === "tuxedo" ? col2 : col, furProps("Paw"));
        paws[side] = p;
      }
    }
    paws[1] = paws[1] || V(sh.legX * s, 0.3 * s, bc.z - bs.z / 2);
    paws[-1] = paws[-1] || V(-sh.legX * s, 0.3 * s, bc.z - bs.z / 2);

    // tail
    const tailKind = spec.tail || "normal";
    const tb = V(...sh.tb).multiplyScalar(s);
    let tailTip = tb;
    const td = 0.42 * s;
    const tcol = col;
    if (tailKind === "normal") {
      let a = K.add(tb, VS(0, 0.5, 0.7));
      tailTip = K.add(a, VS(0, 1.1, 0.25));
      if (sh.body === "loaf") {
        a = K.add(tb, VS(0.9, -0.15, 0.3));
        tailTip = K.add(a, VS(0.4, 0, -1.6));
      }
      K.limb(m, tb, a, td, tcol, furProps("Tail"));
      K.limb(m, a, tailTip, td, pattern === "stripes" ? col2 : tcol, furProps("Tail"));
      K.ball(m, td, a, tcol, furProps("Tail"));
    } else if (tailKind === "long") {
      const a = K.add(tb, VS(0, 0.2, 1.4));
      const b = K.add(a, VS(0, 1.4, 0.6));
      tailTip = K.add(b, VS(0, 1.6, -0.2));
      K.limb(m, tb, a, td, tcol, furProps("Tail"));
      K.limb(m, a, b, td, tcol, furProps("Tail"));
      K.limb(m, b, tailTip, td, pattern === "stripes" ? col2 : tcol, furProps("Tail"));
      K.ball(m, td, a, tcol, furProps("Tail"));
      K.ball(m, td, b, tcol, furProps("Tail"));
    } else if (tailKind === "puffy") {
      const a = K.add(tb, VS(0, 0.9, 0.7));
      tailTip = K.add(a, VS(0, 0.9, 0.1));
      K.ball(m, V(0.95 * s, 2.0 * s, 0.95 * s), K.mul(K.add(tb, VS(0, 1.0, 0.55)), A(-25 * DEG, 0, 0)), tcol, furProps("Tail"));
      K.ball(m, 0.75 * s, tailTip, pattern === "plain" ? tcol : col2, furProps("Tail"));
    } else if (tailKind === "curly") {
      const pts = [tb, K.add(tb, VS(0, 0.4, 0.6)), K.add(tb, VS(0, 1.1, 0.75)), K.add(tb, VS(0, 1.5, 0.35)), K.add(tb, VS(0, 1.25, 0.05))];
      for (let i = 0; i < pts.length - 1; i++) {
        K.limb(m, pts[i], pts[i + 1], td, tcol, furProps("Tail"));
        K.ball(m, td, pts[i + 1], tcol, furProps("Tail"));
      }
      tailTip = pts[pts.length - 1];
    }

    // patterns
    const bodySection = (z) => {
      if (sh.body === "ellipsoid" || sh.body === "ball") {
        const t = (z - bc.z) / (bs.z / 2);
        return Math.sqrt(Math.max(0.05, 1 - t * t));
      }
      return 1;
    };
    if (pattern === "stripes") {
      const n = 3;
      for (let i = 1; i <= n; i++) {
        const z = bc.z - bs.z / 2 + bs.z * (i / (n + 1)) + bs.z * 0.05;
        if (sh.upright) {
          const y = bc.y - bs.y / 2 + bs.y * (i / (n + 1));
          const f = Math.sqrt(Math.max(0.05, 1 - ((y - bc.y) / (bs.y / 2)) ** 2));
          K.ball(m, V(bs.x * f * 1.05, 0.28 * s, bs.z * f * 1.05), V(0, y, bc.z), col2, furProps("Stripe"));
        } else if (sh.body === "block" || sh.body === "loaf") {
          K.block(m, V(bs.x * 1.03, bs.y * (sh.body === "loaf" ? 0.6 : 1.03), 0.3 * s), V(0, sh.body === "loaf" ? bc.y + bs.y * 0.12 : bc.y, z), col2, furProps("Stripe"));
        } else {
          const f = bodySection(z);
          K.ball(m, V(bs.x * f * 1.05, bs.y * f * 1.05, 0.3 * s), V(0, bc.y + bs.y * 0.02, z), col2, furProps("Stripe"));
        }
      }
      K.block(m, V(0.14 * s, hd * 0.3, 0.1 * s), face(0, hd * 0.3, 0.04 * s), col2, furProps("Stripe"));
    } else if (pattern === "spots" || pattern === "calico") {
      const spots = [[0.25, 0.42, -0.15, 0.55], [-0.3, 0.35, 0.2, 0.6], [0.42, 0.05, 0.3, 0.5], [-0.42, 0.0, -0.25, 0.45], [0.0, 0.48, 0.35, 0.5]];
      spots.forEach((sp, i0) => {
        const i = i0 + 1;
        const c = pattern === "calico" ? (i % 2 === 0 ? col3 : col2) : col2;
        const p = K.add(bc, V(sp[0] * bs.x, sp[1] * bs.y, sp[2] * bs.z));
        const d = sp[3] * s * (pattern === "calico" ? 1.6 : 1);
        K.ball(m, V(d, d * 0.55, d), K.mul(p, A(0, 0, sp[0] * 1.6)), c, furProps("Spot"));
      });
      if (pattern === "calico") {
        K.ball(m, V(hd * 0.55, hd * 0.5, hd * 0.6), K.add(hc, V(hd * 0.25, hd * 0.25, -hd * 0.12)), col3, furProps("Spot"));
      }
    } else if (pattern === "tuxedo") {
      let chest = V(0, bc.y - bs.y * 0.08, bc.z - bs.z * 0.33);
      if (sh.upright) chest = V(0, bc.y + bs.y * 0.05, bc.z - bs.z * 0.3);
      K.ball(m, V(bs.x * 0.6, bs.y * 0.75, Math.min(bs.z, bs.x) * 0.45), chest, col2, furProps("Chest"));
      K.ball(m, V(hd * 0.55, hd * 0.32, hd * 0.3), face(0, -hd * 0.14, 0.12 * s), col2, furProps("Muzzle"));
    }

    // anchors
    const top = K.add(hc, V(0, sh.cubeHead ? hr : hr * 0.92, 0));
    let backTop = K.add(bc, V(0, sh.body === "loaf" ? bs.y / 2 : (bs.y / 2) * 0.95, sh.upright ? bs.z * 0.1 : 0));
    if (sh.upright) backTop = K.add(bc, V(0, bs.y * 0.1, (bs.z / 2) * 0.95));
    const anchors = {
      head: K.cf(hc), headTop: K.cf(top), face: K.cf(face(0, 0)), eyes: K.cf(face(0, ey, 0)),
      nose: K.cf(noseP), mouth: K.cf(mouthP), neck: K.cf(K.add(hc, V(0, -hr * 0.95, -hr * 0.25))),
      chest: K.cf(K.add(bc, V(0, 0, -bs.z / 2))), back: K.cf(backTop), body: K.cf(bc), tail: K.cf(tailTip),
      tailBase: K.cf(tb), leftEar: earL, rightEar: earR,
      side: K.cf(K.add(bc, V(-bs.x / 2 - 0.3 * s, 0, -bs.z * 0.15))), feet: K.cf(bc.x, 0, bc.z),
      frontLeftPaw: K.cf(paws[1]), frontRightPaw: K.cf(paws[-1]),
    };
    const c = { model: m, head, body, parts, spec, s, headD: hd, bodySize: bs, anchors };
    c.attach = (name, offset) => {
      const cf = anchors[name];
      if (!cf) throw new Error("CatKit attach: unknown anchor '" + name + "'");
      return offset ? K.mul(cf, K.cf(offset)) : cf.clone();
    };
    if (Array.isArray(spec.accessories)) {
      for (const a of spec.accessories) {
        if (typeof a === "function") a(c);
        else if (typeof a === "string") K.acc[a](c);
        else if (Array.isArray(a)) K.acc[a[0]](c, a[1], a[2]);
      }
    }
    return c;
  };

  // ---- accessories ----------------------------------------------------------------------------
  K.acc = {};
  const accBase = (c, opts, anchor) => {
    const o = opts || {};
    let at = o.at;
    if (!at) {
      if (!c.attach) throw new Error("CatKit accessory: pass opts.at for non-K.cat models");
      at = c.attach(anchor);
    }
    const a = (o.scale || 1) * ((c.headD || 1.9) / 1.9);
    return [toCF(at), a, o];
  };
  const A = K.angles;
  const T = (x, y, z) => K.cf(x, y, z);

  K.acc.tophat = (c, opts) => {
    let [at, a, o] = accBase(c, opts, "headTop");
    const col = o.color || K.C.black;
    at = K.mul(at, A(0, 0, -8 * DEG));
    return [
      K.cyl(c.model, 0.12 * a, 1.7 * a, K.mul(at, T(0, 0.02 * a, 0)), col, { name: "HatBrim" }),
      K.cyl(c.model, 1.15 * a, 1.05 * a, K.mul(at, T(0, 0.6 * a, 0)), col, { name: "Hat" }),
      K.cyl(c.model, 0.22 * a, 1.08 * a, K.mul(at, T(0, 0.2 * a, 0)), o.band || K.C.red, { name: "HatBand" }),
    ];
  };
  K.acc.crown = (c, opts) => {
    const [at, a, o] = accBase(c, opts, "headTop");
    const col = o.color || K.C.gold;
    const out = [K.cyl(c.model, 0.35 * a, 1.1 * a, K.mul(at, T(0, 0.12 * a, 0)), col, { name: "Crown", material: "foil" })];
    for (let i = 0; i <= 4; i++) {
      const ang = (i / 5) * Math.PI * 2;
      out.push(K.block(c.model, V(0.28 * a, 0.28 * a, 0.06 * a), K.mul(at, T(Math.sin(ang) * 0.5 * a, 0.36 * a, Math.cos(ang) * 0.5 * a), A(0, ang, 45 * DEG)), col, { name: "CrownPoint", material: "foil" }));
    }
    out.push(K.ball(c.model, 0.2 * a, K.mul(at, T(0, 0.15 * a, -0.55 * a)), o.gem || K.C.red, { name: "Gem", neon: true }));
    return out;
  };
  K.acc.sunglasses = (c, opts) => {
    const [at, a, o] = accBase(c, opts, "eyes");
    const col = o.color || K.rgb(15, 15, 20);
    const out = [];
    const z = -0.12 * a;
    for (const side of [-1, 1]) {
      out.push(K.block(c.model, V(0.62 * a, 0.36 * a, 0.08 * a), K.mul(at, T(side * 0.42 * a, 0, z)), col, { name: "Lens" }));
      out.push(K.block(c.model, V(0.06 * a, 0.06 * a, 0.9 * a), K.mul(at, T(side * 0.76 * a, 0.1 * a, z + 0.45 * a)), col, { name: "GlassesArm" }));
    }
    out.push(K.block(c.model, V(0.26 * a, 0.07 * a, 0.07 * a), K.mul(at, T(0, 0.08 * a, z)), col, { name: "GlassesBridge" }));
    return out;
  };
  K.acc.bowtie = (c, opts) => {
    const [at, a, o] = accBase(c, opts, "neck");
    const col = o.color || K.C.red;
    const out = [];
    for (const side of [-1, 1]) {
      out.push(K.wedge(c.model, V(0.12 * a, 0.42 * a, 0.42 * a), K.mul(at, T(side * 0.22 * a, 0, -0.05 * a), A(0, (side * Math.PI) / 2, 0)), col, { name: "Bow" }));
    }
    out.push(K.block(c.model, V(0.16 * a, 0.18 * a, 0.14 * a), K.mul(at, T(0, 0, -0.08 * a)), col, { name: "BowKnot" }));
    return out;
  };
  K.acc.cape = (c, opts) => {
    const [at, a, o] = accBase(c, opts, "back");
    const col = o.color || K.C.red;
    const bx = c.bodySize ? c.bodySize.x : 2;
    const len = (c.bodySize ? c.bodySize.z : 3) * 0.95;
    return [
      K.block(c.model, V(bx * 1.08, 0.08 * a, len), K.mul(at, T(0, 0.05 * a, 0.1 * a), A(-6 * DEG, 0, 0)), col, { name: "Cape" }),
      K.block(c.model, V(bx * 0.9, 0.25 * a, 0.2 * a), K.mul(at, T(0, 0.1 * a, -len / 2)), o.collar || K.C.gold, { name: "CapeCollar" }),
    ];
  };
  K.acc.halo = (c, opts) => {
    const [at, a, o] = accBase(c, opts, "headTop");
    const col = o.color || K.rgb(255, 240, 120);
    const out = [];
    const r = 0.62 * a;
    for (let i = 0; i <= 7; i++) {
      const ang = (i / 8) * Math.PI * 2;
      out.push(K.block(c.model, V(0.5 * a, 0.09 * a, 0.12 * a), K.mul(at, T(Math.sin(ang) * r, 0.65 * a, Math.cos(ang) * r), A(0, ang + Math.PI / 2, 0)), col, { name: "Halo", neon: true }));
    }
    return out;
  };
  K.acc.horns = (c, opts) => {
    const [at, a, o] = accBase(c, opts, "headTop");
    const col = o.color || K.rgb(200, 30, 30);
    const out = [];
    for (const side of [-1, 1]) {
      const p0 = K.p(K.mul(at, T(side * 0.3 * a, -0.05 * a, -0.15 * a)));
      const p1 = K.add(p0, V(side * 0.25 * a, 0.45 * a, 0));
      const p2 = K.add(p1, V(side * 0.02 * a, 0.35 * a, 0.1 * a));
      out.push(K.limb(c.model, p0, p1, 0.26 * a, col, { name: "Horn" }));
      out.push(K.limb(c.model, p1, p2, 0.15 * a, col, { name: "Horn" }));
    }
    return out;
  };
  K.acc.wings = (c, opts) => {
    const [at, a, o] = accBase(c, opts, "back");
    const col = o.color || K.C.white;
    const out = [];
    for (const side of [-1, 1]) {
      out.push(K.ball(c.model, V(1.9 * a, 0.12 * a, 0.95 * a), K.mul(at, T(side * 1.0 * a, 0.45 * a, 0), A(0, 0, side * 30 * DEG)), col, { name: "Wing" }));
      out.push(K.ball(c.model, V(1.3 * a, 0.12 * a, 0.7 * a), K.mul(at, T(side * 0.9 * a, 0.35 * a, 0.45 * a), A(0, side * -20 * DEG, side * 20 * DEG)), col, { name: "Wing" }));
    }
    return out;
  };
  K.acc.sign = (c, text, opts) => {
    const [at, a, o] = accBase(c, opts, "side");
    const stickTop = K.mul(at, T(-0.2 * a, 1.6 * a, 0));
    const out = [
      K.cyl(c.model, 2.4 * a, 0.14 * a, K.mul(at, T(-0.2 * a, 0.4 * a, 0)), o.stick || K.C.brown, { name: "SignStick" }),
      K.block(c.model, V(2.4 * a, 1.3 * a, 0.12 * a), stickTop, o.color || K.C.white, { name: "Sign" }),
    ];
    K.text(out[1], text || "MEOW", { color: o.textColor || K.C.black, both: true });
    return out;
  };
  K.acc.box = (c, opts = {}) => {
    const col = opts.color || K.rgb(190, 140, 85);
    const out = [];
    const bs = c.bodySize || V(2.2, 1.8, 3.2);
    const body = K.p(c.attach ? c.attach("body") : toCF(opts.at));
    const cs = c.s || 1;
    const w = bs.x + 0.6 * cs, d = bs.z + 0.6 * cs;
    const h = opts.height || bs.y * 0.75 + 0.6 * cs;
    const base = K.cf(body.x, 0, body.z);
    const t = 0.12 * cs;
    out.push(K.block(c.model, V(w, t, d), K.mul(base, T(0, t / 2, 0)), col, { name: "Box" }));
    out.push(K.block(c.model, V(w, h, t), K.mul(base, T(0, h / 2, -d / 2)), col, { name: "Box" }));
    out.push(K.block(c.model, V(w, h, t), K.mul(base, T(0, h / 2, d / 2)), col, { name: "Box" }));
    out.push(K.block(c.model, V(t, h, d), K.mul(base, T(-w / 2, h / 2, 0)), col, { name: "Box" }));
    out.push(K.block(c.model, V(t, h, d), K.mul(base, T(w / 2, h / 2, 0)), col, { name: "Box" }));
    for (const side of [-1, 1]) {
      out.push(K.block(c.model, V(t, w * 0.45, d), K.mul(base, T(side * (w / 2 + w * 0.17), h + w * 0.14, 0), A(0, 0, side * -40 * DEG)), col, { name: "BoxFlap" }));
    }
    return out;
  };

  // The look shown for a cat whose zone file is missing or whose look threw: a plain grey cat
  // holding a "?" sign, so the Index and the world never show a hole.
  K.fallback = (n) => {
    const c = K.cat({ color: K.C.grey, eyes: "derp", mouth: "o" });
    K.acc.sign(c, "#" + n + " ?");
    return K.finish(c.model);
  };

  return K;
}

// Fit `text` into the canvas: wrap on spaces/newlines, shrink the font until it fits.
// Shared by catkit text prims and zonekit labels (exported through K.drawFitText).
export function drawFitText(canvas, text, color, bg, opts = {}) {
  const g = canvas.getContext("2d", { willReadFrequently: true });
  const W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
  }
  const pad = Math.max(2, Math.round(Math.min(W, H) * 0.06));
  const font = opts.font || '"Fredoka One", "Arial Rounded MT Bold", "Segoe UI", system-ui, sans-serif';
  const weight = opts.weight || "bold";
  const paragraphs = String(text).split("\n");
  // Text width scales linearly with font size, so every word is measured ONCE at a reference
  // size and the shrink loop wraps with arithmetic. Re-measuring each candidate line at every
  // size (the old loop) cost ~0.5 s of the Place's init across its labels — long enough that
  // the browser rendered (and compiled every shader) before the Place reported ready.
  const REF = 100;
  g.font = `${weight} ${REF}px ${font}`;
  const space = g.measureText(" ").width / REF;
  const paraWords = paragraphs.map((para) => para.split(" ").map((w) => ({ w, u: g.measureText(w).width / REF })));
  const maxW = W - pad * 2;
  const wrap = (sz) => {
    const out = [];
    for (const words of paraWords) {
      let line = "", lw = 0;
      for (const { w, u } of words) {
        const add = (line ? space : 0) + u;
        if ((lw + add) * sz <= maxW || !line) { line = line ? line + " " + w : w; lw += add; }
        else { out.push({ line, lw }); line = w; lw = u; }
      }
      out.push({ line, lw });
    }
    return out;
  };
  let size = Math.min(opts.maxPx || 200, H - pad * 2);
  let lines = [];
  for (; size >= 6; size = Math.floor(size * 0.88)) {
    const wrapped = wrap(size);
    const widest = Math.max(...wrapped.map((l) => l.lw)) * size;
    lines = wrapped.map((l) => l.line);
    if (lines.length * size * 1.15 <= H - pad * 2 && widest <= maxW) break;
  }
  g.font = `${weight} ${size}px ${font}`;
  // Hinting can make the real width a hair wider than the scaled one; shrink until it fits.
  while (size > 6 && Math.max(...lines.map((l) => g.measureText(l).width)) > maxW) {
    size = Math.max(6, Math.floor(size * 0.94));
    lines = wrap(size).map((l) => l.line);
    g.font = `${weight} ${size}px ${font}`;
  }
  g.fillStyle = color || "#ffffff";
  g.textAlign = opts.align || "center";
  g.textBaseline = "middle";
  if (opts.stroke) {
    g.lineWidth = Math.max(2, size / 8);
    g.strokeStyle = opts.stroke;
  }
  const lh = size * 1.15;
  const y0 = H / 2 - ((lines.length - 1) * lh) / 2;
  const x = g.textAlign === "left" ? pad : W / 2;
  lines.forEach((l, i) => {
    if (opts.stroke) g.strokeText(l, x, y0 + i * lh);
    g.fillText(l, x, y0 + i * lh);
  });
}
