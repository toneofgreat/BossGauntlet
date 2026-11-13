// src/games/cats/scripts/zones/z7-kit.js - drawing helpers for zone 7 (The End Of Cats) only.
//
// Zone 7 has a lot of scenery (a theatre, a server room, a temple, a hotel, a maze, a tower and a
// sky full of glitch cubes) and a LOT of text (seat numbers, rack plates, bridge words, AI nodes,
// nonogram clues). Drawn as one kit part or one canvas plane each, that would blow the zone budget
// (60 static draw-call combos, 150 dynamic parts, 40 labels). So:
//
//   createDeco(z)  - every STATIC visual is merged into at most four vertex-coloured meshes (solid /
//                    neon / see-through / see-through neon), using the catkit's shared materials.
//                    Collision is separate: the zone adds invisible kit parts where you can stand.
//   createInst(z)  - things that MOVE or CHANGE COLOUR (glitch cubes, blinking LEDs, the Lights Out
//                    board, the nonogram, the AI core) are instances of a few InstancedMeshes,
//                    animated from one heartbeat. No engine part is promoted for any of them.
//   createAtlas(z) - every piece of text is a quad in one shared canvas atlas (one draw call per
//                    2048 px page), packed once when the zone is built.
//
// None of these touch src/platform; everything goes through z (z.THREE, z.K, z.ctx.engine.parts).
// Each returns dispose(); the zone registers it with z.onLeave so a zone exit frees every geometry,
// texture and material made here (the catkit's shared materials are never disposed here).

const CORNERS = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];

// ---------------------------------------------------------------------------------------- deco
export function createDeco(z) {
  const THREE = z.THREE;
  const parts = z.ctx.engine.parts;
  const M = z.K.materials();
  const units = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 18),
    ball: new THREE.SphereGeometry(0.5, 14, 9),
    torus: new THREE.TorusGeometry(0.5, 0.06, 8, 28),
  };
  const BUCKETS = ["solid", "neon", "seeSolid", "seeNeon"];
  const acc = {};
  for (const k of BUCKETS) acc[k] = { pos: [], nrm: [], col: [], idx: [], rgba: k.startsWith("see") };
  const made = [];
  const m4 = new THREE.Matrix4();
  const sc = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const tmp = new THREE.Vector3();
  const col = new THREE.Color();
  let count = 0;

  // add(kind, [sx, sy, sz], worldMatrix, "#rrggbb", { neon, transparency, glass })
  function add(kind, size, m, color, o = {}) {
    const g = units[kind] || units.box;
    let alpha = 1 - Math.max(0, Math.min(1, o.transparency || 0));
    if (o.glass) alpha = Math.min(alpha, 0.45);
    if (alpha <= 0.001) return;
    const see = alpha < 0.999;
    const B = acc[see ? (o.neon ? "seeNeon" : "seeSolid") : (o.neon ? "neon" : "solid")];
    m4.copy(m).multiply(sc.makeScale(Math.max(0.01, size[0]), Math.max(0.01, size[1]), Math.max(0.01, size[2])));
    nm.getNormalMatrix(m4);
    col.set(color);
    const gp = g.attributes.position.array;
    const gn = g.attributes.normal.array;
    const gi = g.index.array;
    const base = B.pos.length / 3;
    for (let i = 0; i < gp.length; i += 3) {
      tmp.set(gp[i], gp[i + 1], gp[i + 2]).applyMatrix4(m4);
      B.pos.push(tmp.x, tmp.y, tmp.z);
      tmp.set(gn[i], gn[i + 1], gn[i + 2]).applyMatrix3(nm).normalize();
      B.nrm.push(tmp.x, tmp.y, tmp.z);
      if (B.rgba) B.col.push(col.r, col.g, col.b, alpha);
      else B.col.push(col.r, col.g, col.b);
    }
    for (let i = 0; i < gi.length; i++) B.idx.push(base + gi[i]);
    count++;
  }

  function commit() {
    for (const k of BUCKETS) {
      const B = acc[k];
      if (!B.pos.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(B.pos, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(B.nrm, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(B.col, B.rgba ? 4 : 3));
      geo.setIndex(B.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(B.idx, 1) : new THREE.Uint16BufferAttribute(B.idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, M[k]);
      mesh.frustumCulled = false;
      if (k.startsWith("see")) mesh.renderOrder = 2;
      made.push({ geo, id: parts.addCustom(mesh) });
      B.pos = B.nrm = B.col = B.idx = null;
    }
  }

  function dispose() {
    for (const r of made) {
      try { parts.remove(r.id); } catch { /* already gone */ }
      try { r.geo.dispose(); } catch { /* fine */ }
    }
    made.length = 0;
    for (const g of Object.values(units)) g.dispose();
  }

  return { add, commit, dispose, count: () => count, meshes: () => made.length };
}

// ---------------------------------------------------------------------------------------- instances
// add(kind, size, matrix, color, { neon, anim }) -> handle { setColor, setVisible, setMatrix, base }
// anim: { kind: "spin", axis, speed (deg/s) } | { kind: "bob", amp, period } | { kind: "blink", period }
//       | { kind: "rainbow", period, s, v }   (several may be given as an array)
export function createInst(z) {
  const THREE = z.THREE;
  const parts = z.ctx.engine.parts;
  const geos = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
    ball: new THREE.SphereGeometry(0.5, 16, 11),
    torus: new THREE.TorusGeometry(0.5, 0.045, 8, 40),
  };
  const groups = new Map();
  const animated = [];
  const made = [];
  const tmpM = new THREE.Matrix4();
  const rotM = new THREE.Matrix4();
  const sclM = new THREE.Matrix4();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const col = new THREE.Color();
  let fxT = 0;

  function hsv(h, s, v) {
    const f = (n) => {
      const k = (n + h * 6) % 6;
      return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return col.setRGB(f(5), f(3), f(1), THREE.SRGBColorSpace || undefined);
  }

  function add(kind, size, m, color, o = {}) {
    const key = `${geos[kind] ? kind : "box"}|${o.neon ? 1 : 0}`;
    let g = groups.get(key);
    if (!g) { g = { kind: geos[kind] ? kind : "box", neon: !!o.neon, items: [], mesh: null }; groups.set(key, g); }
    const it = {
      g, i: g.items.length, size: size.slice(), m: m.clone(), color, visible: true,
      anims: o.anim ? (Array.isArray(o.anim) ? o.anim : [o.anim]) : [], phase: o.phase || 0,
    };
    g.items.push(it);
    if (it.anims.length) animated.push(it);
    const h = {
      setColor(hex) { it.color = hex; if (g.mesh) { g.mesh.setColorAt(it.i, col.set(hex)); g.mesh.instanceColor.needsUpdate = true; } return h; },
      setVisible(b) { it.visible = !!b; write(it, it.m); return h; },
      setMatrix(mm) { it.m.copy(mm); write(it, it.m); return h; },
      get m() { return it.m; },
      it,
    };
    return h;
  }

  function write(it, m) {
    const mesh = it.g.mesh;
    if (!mesh) return;
    if (!it.visible) mesh.setMatrixAt(it.i, ZERO);
    else mesh.setMatrixAt(it.i, tmpM.copy(m).multiply(sclM.makeScale(it.size[0], it.size[1], it.size[2])));
    mesh.instanceMatrix.needsUpdate = true;
  }

  function commit() {
    for (const g of groups.values()) {
      const mat = g.neon ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : new THREE.MeshLambertMaterial({ color: 0xffffff });
      const mesh = new THREE.InstancedMesh(geos[g.kind], mat, g.items.length);
      mesh.frustumCulled = false;
      g.mesh = mesh;
      for (const it of g.items) {
        mesh.setColorAt(it.i, col.set(it.color));
        write(it, it.m);
      }
      mesh.instanceColor.needsUpdate = true;
      made.push({ mat, id: parts.addCustom(mesh), mesh });
    }
  }

  function tick(dt, t) {
    fxT += dt;
    const colourStep = fxT >= 0.1;
    if (colourStep) fxT = 0;
    for (const it of animated) {
      let m = it.m;
      let visible = it.visible;
      for (const a of it.anims) {
        if (a.kind === "spin") {
          const ang = ((a.speed != null ? a.speed : 90) * Math.PI / 180) * t + it.phase;
          const ax = String(a.axis || "y").toLowerCase();
          if (ax === "x") rotM.makeRotationX(ang); else if (ax === "z") rotM.makeRotationZ(ang); else rotM.makeRotationY(ang);
          m = m.clone().multiply(rotM);
        } else if (a.kind === "bob") {
          m = m.clone();
          m.elements[13] += Math.sin(((t / (a.period || 2)) + it.phase) * Math.PI * 2) * (a.amp != null ? a.amp : 1);
        } else if (a.kind === "blink") {
          const p = a.period || 1;
          visible = visible && ((t + it.phase * p) % p) < p / 2;
        } else if (a.kind === "rainbow" && colourStep && it.g.mesh) {
          const p = a.period || 3;
          const h = Math.floor((((t / p) + it.phase) % 1) * 24) / 24;
          it.g.mesh.setColorAt(it.i, hsv(h, a.s != null ? a.s : 0.85, a.v != null ? a.v : 1));
          it.g.mesh.instanceColor.needsUpdate = true;
        }
      }
      const mesh = it.g.mesh;
      if (!mesh) continue;
      if (!visible) mesh.setMatrixAt(it.i, ZERO);
      else mesh.setMatrixAt(it.i, tmpM.copy(m).multiply(sclM.makeScale(it.size[0], it.size[1], it.size[2])));
      mesh.instanceMatrix.needsUpdate = true;
      it.cur = m;
    }
  }

  function dispose() {
    for (const r of made) {
      try { parts.remove(r.id); } catch { /* already gone */ }
      try { r.mesh.dispose(); } catch { /* fine */ }
      try { r.mat.dispose(); } catch { /* fine */ }
    }
    made.length = 0;
    for (const g of Object.values(geos)) g.dispose();
  }

  return { add, commit, tick, dispose, stats: () => ({ meshes: groups.size, animated: animated.length }) };
}

// ---------------------------------------------------------------------------------------- text atlas
// face(cf, size, faceName, text, opts) puts text on a face of a box whose WORLD matrix is cf.
// opts: { color, both, pps, maxPx, font ("code" = monospace), align, stroke, w, h, fill }
export function createAtlas(z) {
  const THREE = z.THREE;
  const K = z.K;
  const parts = z.ctx.engine.parts;
  const PAGE = 2048;
  const PAD = 4;
  const MONO = '"Courier New", ui-monospace, Menlo, Consolas, monospace';
  const items = [];
  const pages = [];
  const v = new THREE.Vector3();
  const FACE = {
    front: { n: [0, 0, -1], wi: 0, hi: 1, r: () => new THREE.Matrix4().makeRotationY(Math.PI) },
    back: { n: [0, 0, 1], wi: 0, hi: 1, r: () => new THREE.Matrix4() },
    right: { n: [1, 0, 0], wi: 2, hi: 1, r: () => new THREE.Matrix4().makeRotationY(Math.PI / 2) },
    left: { n: [-1, 0, 0], wi: 2, hi: 1, r: () => new THREE.Matrix4().makeRotationY(-Math.PI / 2) },
    top: { n: [0, 1, 0], wi: 0, hi: 2, r: () => new THREE.Matrix4().makeRotationX(-Math.PI / 2) },
  };
  const OPP = { front: "back", back: "front", left: "right", right: "left", top: "top" };

  function addItem(text, w, h, m, o = {}) {
    const it = {
      text: String(text), w, h, m: m.clone(), color: o.color || "#ffffff", stroke: o.stroke ? "#000000" : null,
      align: o.align, font: o.font === "code" ? MONO : null, pps: o.pps || 20, maxPx: o.maxPx || 384,
      page: null, base: 0, x: 0, y: 0, pw: 0, ph: 0, local: null,
    };
    items.push(it);
    return it;
  }
  function faceLocal(size, name, lift = 0.04) {
    const f = FACE[name] || FACE.front;
    const t = new THREE.Matrix4().makeTranslation(f.n[0] * (size[0] / 2 + lift), f.n[1] * (size[1] / 2 + lift), f.n[2] * (size[2] / 2 + lift));
    return { local: t.multiply(f.r()), w: size[f.wi], h: size[f.hi] };
  }
  function face(cf, size, name, text, o = {}) {
    const names = o.both ? [name, OPP[name]] : [name];
    return names.map((nm) => {
      const f = faceLocal(size, nm, o.lift);
      const w = (o.w || f.w) * (o.fill || 0.94), h = (o.h || f.h) * (o.fill || 0.94);
      const it = addItem(text, w, h, cf.clone().multiply(f.local), o);
      it.local = f.local;
      return it;
    });
  }
  function write(it) {
    if (!it.page) return;
    const pos = it.page.pos;
    for (let k = 0; k < 4; k++) {
      v.set(CORNERS[k][0] * it.w, CORNERS[k][1] * it.h, 0).applyMatrix4(it.m);
      pos.setXYZ(it.base + k, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
  }
  // move an item so it sits on the same face of a box now at world matrix cf
  function follow(it, cf) {
    it.m.multiplyMatrices(cf, it.local);
    write(it);
  }

  function commit() {
    for (const it of items) {
      const s = Math.min(it.pps, it.maxPx / Math.max(it.w, it.h, 0.1));
      it.pw = Math.max(8, Math.min(PAGE, Math.round(it.w * s)));
      it.ph = Math.max(8, Math.min(PAGE, Math.round(it.h * s)));
    }
    const order = items.slice().sort((a, b) => b.ph - a.ph);
    let page = null, x = 0, y = 0, shelf = 0;
    const newPage = () => { page = { items: [], used: 0 }; pages.push(page); x = 0; y = 0; shelf = 0; };
    newPage();
    for (const it of order) {
      if (x + it.pw > PAGE) { y += shelf + PAD; x = 0; shelf = 0; }
      if (y + it.ph > PAGE) newPage();
      it.x = x; it.y = y;
      x += it.pw + PAD;
      shelf = Math.max(shelf, it.ph);
      page.used = Math.max(page.used, y + it.ph);
      page.items.push(it);
    }
    const tmp = document.createElement("canvas");
    for (const pg of pages) {
      if (!pg.items.length) continue;
      const W = PAGE, H = Math.min(PAGE, Math.ceil((pg.used + PAD) / 4) * 4);
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const g = canvas.getContext("2d", { willReadFrequently: true });
      const n = pg.items.length;
      const pos = new THREE.BufferAttribute(new Float32Array(n * 12), 3);
      const uv = new Float32Array(n * 8);
      const idx = [];
      pg.pos = pos;
      pg.items.forEach((it, i) => {
        tmp.width = it.pw;
        tmp.height = it.ph;
        K.drawFitText(tmp, it.text, it.color, null, { stroke: it.stroke, align: it.align, font: it.font || undefined });
        g.drawImage(tmp, it.x, it.y);
        const u0 = (it.x + 0.5) / W, u1 = (it.x + it.pw - 0.5) / W;
        const vT = 1 - (it.y + 0.5) / H, vB = 1 - (it.y + it.ph - 0.5) / H;
        uv.set([u0, vB, u1, vB, u1, vT, u0, vT], i * 8);
        idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
        it.page = pg;
        it.base = i * 4;
        write(it);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", pos);
      geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const tex = new THREE.CanvasTexture(canvas);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.FrontSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      pg.geo = geo; pg.mat = mat; pg.tex = tex;
      pg.id = parts.addCustom(mesh);
    }
  }
  function dispose() {
    for (const pg of pages) {
      if (pg.id != null) { try { parts.remove(pg.id); } catch { /* already gone */ } }
      for (const r of [pg.geo, pg.mat, pg.tex]) { if (r) { try { r.dispose(); } catch { /* fine */ } } }
    }
    pages.length = 0;
    items.length = 0;
  }
  return { face, follow, commit, dispose, stats: () => ({ items: items.length, pages: pages.length }) };
}
