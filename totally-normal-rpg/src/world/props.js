// props.js - reusable prop builders. Every builder works in the CURRENT frame of a zone kit `z` (local +Z = front,
// ground y = 0), adds merged geometry (and colliders when sensible) and returns useful anchor points.
// Animated / interactive props (kittens, ducks, doors...) are real Object3Ds returned to the caller.

const TAU = Math.PI * 2;

export function createProps(K) {
  const THREE = K.THREE;
  const M = (n, o) => K.mat(n, o);
  const eyesN = K.flat("#0c0a08", 0.3);
  const eyesR = K.glow("#ff1c14", 2.2);
  const eyeMeshes = [];          // swapped to red glow in cycle 1
  const R = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

  // split rect (x0,z0)-(x1,z1) into up to 4 rects around an optional hole {x,z,w,d}
  function holeRects(x0, z0, x1, z1, hole) {
    if (!hole) return [[x0, z0, x1, z1]];
    const hx0 = hole.x - hole.w / 2, hx1 = hole.x + hole.w / 2, hz0 = hole.z - hole.d / 2, hz1 = hole.z + hole.d / 2;
    const out = [];
    if (hz0 > z0) out.push([x0, z0, x1, hz0]);
    if (hz1 < z1) out.push([x0, hz1, x1, z1]);
    if (hx0 > x0) out.push([x0, hz0, hx0, hz1]);
    if (hx1 < x1) out.push([hx1, hz0, x1, hz1]);
    return out;
  }

  // -------------------------------------------------------------------------------------------- houses
  // o: { w, d, h, roof:"thatch"|"tile", pitch(deg), plaster(color), roofColor, interior, doorAngle, chimney,
  //      found (extra foundation depth for slopes), windows, shutter(color), flowers, beams, layer, intLayer,
  //      noCollide }
  function house(z, o) {
    o = Object.assign({ w: 8, d: 6.5, h: 3.0, roof: "thatch", pitch: 42, plaster: "#e6dcc4", interior: false,
      doorAngle: 1.2, chimney: true, found: 1.5, windows: true, shutter: "#5d7a4a", flowers: true, beams: true,
      ov: 0.55, floorY: 0.35, layer: "main", intLayer: "detail", doorX: 0 }, o);
    const { w, d, h } = o;
    const hw = w / 2, hd = d / 2, t = 0.28, fy = o.floorY;
    const L = o.layer;
    const stone = M("stoneBrick"), plaster = M(o.wallMat || "plaster", { color: o.plaster }), beam = M("woodDark");
    const roofM = o.roof === "tile" ? M("roofTile", o.roofColor ? { color: o.roofColor } : undefined) : M("thatch", o.roofColor ? { color: o.roofColor } : undefined);
    // foundation plinth (goes down into slopes)
    const plinthY = fy / 2 - o.found / 2, plinthH = fy + o.found;
    const rects = holeRects(-(w + 0.3) / 2, -(d + 0.3) / 2, (w + 0.3) / 2, (d + 0.3) / 2, o.floorHole);
    for (const [x0, z0, x1, z1] of rects) {
      z.box(stone, (x0 + x1) / 2, plinthY, (z0 + z1) / 2, x1 - x0, plinthH, z1 - z0, { layer: L });
      z.colBox((x0 + x1) / 2, plinthY, (z0 + z1) / 2, x1 - x0, plinthH, z1 - z0, { surface: "wood" });
    }
    if (o.interior) {
      const pm = M("woodPlank", { color: o.floorColor || "#8a6844" });
      for (const [x0, z0, x1, z1] of holeRects(-hw + 0.25, -hd + 0.25, hw - 0.25, hd - 0.25, o.floorHole)) {
        z.box(pm, (x0 + x1) / 2, fy + 0.012, (z0 + z1) / 2, x1 - x0, 0.024, z1 - z0, { layer: "flat", tex: 1.6 });
      }
    }
    // walls
    const wy = fy + h / 2;
    const dw = o.doorW || 1.2, dh = o.doorH || 2.15, dx = o.doorX;
    // back + sides
    z.box(plaster, 0, wy, -hd + t / 2, w, h, t, { layer: L });
    z.box(plaster, -hw + t / 2, wy, 0, t, h, d - 2 * t, { layer: L });
    z.box(plaster, hw - t / 2, wy, 0, t, h, d - 2 * t, { layer: L });
    // front with door gap
    const lw = hw + dx - dw / 2, rw = hw - dx - dw / 2;
    z.box(plaster, -hw + lw / 2, wy, hd - t / 2, lw, h, t, { layer: L });
    z.box(plaster, hw - rw / 2, wy, hd - t / 2, rw, h, t, { layer: L });
    z.box(plaster, dx, fy + dh + (h - dh) / 2, hd - t / 2, dw, h - dh, t, { layer: L });
    if (o.interior) {
      z.colBox(0, wy, -hd + t / 2, w, h, t);
      z.colBox(-hw + t / 2, wy, 0, t, h, d);
      z.colBox(hw - t / 2, wy, 0, t, h, d);
      z.colBox(-hw + lw / 2, wy, hd - t / 2, lw, h, t);
      z.colBox(hw - rw / 2, wy, hd - t / 2, rw, h, t);
      z.colBox(dx, fy + dh + (h - dh) / 2, hd - t / 2, dw, h - dh, t);
      // ceiling (keeps the camera inside)
      if (o.ceiling !== false) z.colBox(0, fy + h + 0.1, 0, w, 0.2, d, { walk: true });
    } else if (!o.noCollide) {
      z.colBox(0, wy, 0, w, h, d);
    }
    // timber frame
    if (o.beams) {
      const bt = 0.16, out = 0.04;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) z.box(beam, sx * (hw - 0.02), wy, sz * (hd - 0.02), 0.24, h, 0.24, { layer: L });
      for (const yy of [fy + 0.08, fy + h - 0.08]) {
        z.box(beam, 0, yy, -hd - out + bt / 2, w, bt, bt, { layer: L });
        z.box(beam, -hw - out + bt / 2, yy, 0, bt, bt, d, { layer: L });
        z.box(beam, hw + out - bt / 2, yy, 0, bt, bt, d, { layer: L });
      }
      z.box(beam, 0, fy + h - 0.08, hd + out - bt / 2, w, bt, bt, { layer: L });
      z.box(beam, -hw + lw / 2, fy + 0.08, hd + out - bt / 2, lw, bt, bt, { layer: L });
      z.box(beam, hw - rw / 2, fy + 0.08, hd + out - bt / 2, rw, bt, bt, { layer: L });
      const my = fy + h * 0.52;
      z.box(beam, 0, my, -hd - out + bt / 2, w, bt * 0.8, bt * 0.8, { layer: L });
      z.box(beam, -hw - out + bt / 2, my, 0, bt * 0.8, bt * 0.8, d, { layer: L });
      z.box(beam, hw + out - bt / 2, my, 0, bt * 0.8, bt * 0.8, d, { layer: L });
      // diagonal braces on the side walls
      const ang = Math.atan2(h * 0.48, d * 0.4);
      const bl = Math.hypot(h * 0.48, d * 0.4);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        z.box(beam, sx * (hw + out - 0.07), fy + h * 0.27, sz * (hd - d * 0.2), 0.12, bl, 0.12, { layer: L, rx: sz * ang * -1 + 0 });
      }
      // door frame
      z.box(beam, dx - dw / 2 - 0.08, fy + dh / 2, hd + 0.02, 0.16, dh, 0.36, { layer: L });
      z.box(beam, dx + dw / 2 + 0.08, fy + dh / 2, hd + 0.02, 0.16, dh, 0.36, { layer: L });
      z.box(beam, dx, fy + dh + 0.08, hd + 0.02, dw + 0.32, 0.18, 0.36, { layer: L });
    }
    // door step
    z.box(stone, dx, fy / 2, hd + 0.45, dw + 0.4, fy, 0.7, { layer: L, col: true });
    // roof
    const th = (o.pitch * Math.PI) / 180;
    const rise = hd * Math.tan(th);
    const ov = o.ov, rt = o.roof === "thatch" ? 0.42 : 0.16;
    const s = hd + ov;
    const slabL = s / Math.cos(th);
    const eaveY = fy + h - ov * Math.tan(th);
    const ridgeY = fy + h + rise;
    for (const sz of [1, -1]) {
      const cz = sz * s / 2, cy = (eaveY + ridgeY) / 2 + rt / 2 / Math.cos(th);
      z.box(roofM, 0, cy, cz, w + 2 * ov, rt, slabL, { layer: L, rx: sz * th, tex: 2.5 });
    }
    // gables
    for (const sx of [-1, 1]) z.geo(K.prismGeo(d, rise, t, 2), plaster, sx * (hw - t / 2), fy + h, 0, { layer: L, ry: Math.PI / 2 });
    if (o.beams) for (const sx of [-1, 1]) {
      z.box(beam, sx * (hw + 0.03), fy + h + rise * 0.45, 0, 0.12, rise * 0.9, 0.16, { layer: L });
    }
    z.box(o.roof === "thatch" ? M("thatch", { color: "#8f7442" }) : M("roofTile", { color: "#6e3a28" }), 0, ridgeY + rt * 0.9, 0, w + 2 * ov + 0.1, 0.3, 0.5, { layer: L });
    if (!o.interior && !o.noCollide) z.colBox(0, fy + h + rise * 0.35, 0, w, rise * 0.7, d * 0.6);
    // door
    const door = new THREE.Group();
    const leaf = new THREE.Mesh(K.boxGeo(dw - 0.06, dh - 0.05, 0.07), M("woodPlank", { color: "#7a5a3a" }));
    leaf.position.set((dw - 0.06) / 2, (dh - 0.05) / 2, 0);
    leaf.castShadow = true; leaf.receiveShadow = true;
    const knob = new THREE.Mesh(K.sphereGeo(0.04, 8, 6), M("iron"));
    knob.position.set(dw - 0.2, 1.0, 0.06);
    door.add(leaf, knob);
    for (const yy of [0.35, 1.7]) {
      const strap = new THREE.Mesh(K.boxGeo(dw * 0.7, 0.06, 0.02), M("iron"));
      strap.position.set(dw * 0.35, yy, 0.045); door.add(strap);
    }
    K.bake(door);
    z.object(door, dx - dw / 2 + 0.03, fy, hd - t / 2, 0);
    door.rotation.y += o.doorAngle;
    door.userData.closedYaw = door.rotation.y - o.doorAngle;
    if (o.noDoor) door.visible = false;
    // windows
    const wins = [];
    if (o.windows) {
      const wyy = fy + h * 0.55;
      if (w >= 6) { wins.push([-hw * 0.55 + dx * 0.3, hd, 0]); wins.push([hw * 0.55 + dx * 0.3, hd, 0]); }
      wins.push([-hw * 0.5, -hd, Math.PI]); wins.push([hw * 0.5, -hd, Math.PI]);
      wins.push([hw, 0, Math.PI / 2]); wins.push([-hw, 0, -Math.PI / 2]);
      for (const [wx, wz, wyaw] of wins) {
        z.frame(wx, 0, wz, wyaw, () => windowUnit(z, 0, wyy, 0.02, { shutter: o.shutter, flowers: o.flowers, layer: L, inside: o.interior, t }));
      }
    }
    // chimney
    let chimneyTop = null;
    if (o.chimney) {
      const cx = hw - 1.1, cz = -hd * 0.35;
      const ch = ridgeY + 1.0 - fy;
      z.box(stone, cx, fy + ch / 2, cz, 0.85, ch, 0.85, { layer: L });
      z.box(stone, cx, fy + ch + 0.1, cz, 1.0, 0.2, 1.0, { layer: L });
      chimneyTop = z.world(cx, fy + ch + 0.3, cz);
    }
    return { chimneyTop, ridgeY, eaveY, rise, door, hd, hw, floorY: fy, th };
  }

  function windowUnit(z, x, y, zz, o) {
    o = o || {};
    const L = o.layer || "main";
    const fr = M("woodDark");
    z.box(fr, x, y, zz + 0.05, 1.0, 1.15, 0.1, { layer: L });
    z.box(K.glass(), x, y, zz + 0.105, 0.84, 0.98, 0.02, { layer: L });
    z.box(fr, x, y, zz + 0.12, 0.05, 0.98, 0.03, { layer: L });
    z.box(fr, x, y + 0.05, zz + 0.12, 0.84, 0.05, 0.03, { layer: L });
    z.box(fr, x, y - 0.62, zz + 0.12, 1.2, 0.08, 0.2, { layer: L });
    if (o.shutter) {
      const sm = M("woodPlank", { color: o.shutter });
      z.box(sm, x - 0.78, y, zz + 0.07, 0.5, 1.12, 0.05, { layer: L, ry: -0.25 });
      z.box(sm, x + 0.78, y, zz + 0.07, 0.5, 1.12, 0.05, { layer: L, ry: 0.25 });
    }
    if (o.flowers) {
      z.box(M("woodPlank", { color: "#6a4a2c" }), x, y - 0.78, zz + 0.25, 1.0, 0.22, 0.26, { layer: L });
      z.box(M("dirt"), x, y - 0.67, zz + 0.25, 0.94, 0.03, 0.2, { layer: "c0" });
      const cols = ["#d8433a", "#f0c23a", "#e88ac0", "#f4f0e8", "#8a6ad8"];
      for (let i = 0; i < 6; i++) {
        z.box(M("leaves"), x - 0.4 + i * 0.16, y - 0.58, zz + 0.25, 0.12, 0.18, 0.12, { layer: "c0" });
        z.geo(K.sphereGeo(0.055, 6, 4), K.flat(cols[(i + Math.abs((x * 7) | 0)) % 5]), x - 0.4 + i * 0.16, y - 0.47, zz + 0.27, { layer: "c0" });
        // cycle 1: withered stalks
        z.box(K.flat("#4a3a26"), x - 0.4 + i * 0.16, y - 0.6, zz + 0.25, 0.03, 0.16, 0.03, { layer: "ng", rz: (i % 2 ? 0.5 : -0.4) });
      }
    }
    if (o.inside) {
      const tt = o.t || 0.28;
      z.box(fr, x, y, zz - tt - 0.04, 1.0, 1.15, 0.06, { layer: "detail" });
      z.box(K.glass(), x, y, zz - tt - 0.075, 0.84, 0.98, 0.02, { layer: "detail" });
    }
  }

  // -------------------------------------------------------------------------------------------- furniture
  function table(z, x, zz, o) {
    o = o || {};
    const L = o.layer || "detail", w = o.w || 1.6, d = o.d || 0.9, y = o.y || 0, wm = M("woodPlank", { color: o.color || "#8a6440" });
    z.frame(x, y, zz, o.ry || 0, () => {
      z.box(wm, 0, 0.76, 0, w, 0.06, d, { layer: L });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) z.box(wm, sx * (w / 2 - 0.08), 0.37, sz * (d / 2 - 0.08), 0.07, 0.74, 0.07, { layer: L });
      if (o.col !== false) z.colBox(0, 0.4, 0, w, 0.8, d);
    });
  }
  function chair(z, x, zz, ry, o) {
    o = o || {};
    const L = o.layer || "detail", y = o.y || 0, wm = M("woodPlank", { color: "#7a5636" });
    z.frame(x, y, zz, ry || 0, () => {
      z.box(wm, 0, 0.45, 0, 0.44, 0.05, 0.44, { layer: L });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) z.box(wm, sx * 0.19, 0.22, sz * 0.19, 0.045, 0.45, 0.045, { layer: L });
      z.box(wm, 0, 0.75, -0.2, 0.44, 0.55, 0.04, { layer: L });
    });
  }
  function bed(z, x, zz, ry, o) {
    o = o || {};
    const L = o.layer || "detail", y = o.y || 0;
    z.frame(x, y, zz, ry || 0, () => {
      const wm = M("woodDark");
      z.box(wm, 0, 0.25, 0, 1.1, 0.3, 2.1, { layer: L, col: true });
      z.box(wm, 0, 0.55, -1.02, 1.1, 0.9, 0.08, { layer: L });
      z.box(M("clothWhite"), 0, 0.46, 0.05, 1.0, 0.14, 1.9, { layer: L });
      z.box(M(o.blanket || "clothRed"), 0, 0.53, 0.35, 1.04, 0.06, 1.25, { layer: L });
      z.box(M("clothWhite"), 0, 0.58, -0.75, 0.7, 0.12, 0.35, { layer: L });
    });
  }
  function shelf(z, x, zz, ry, o) {
    o = o || {};
    const L = o.layer || "detail", y = o.y || 0, wm = M("woodPlank", { color: "#6e4e30" });
    const r = R(o.seed || 3);
    z.frame(x, y, zz, ry || 0, () => {
      z.box(wm, 0, 1.0, 0, 1.4, 2.0, 0.06, { layer: L });
      for (let i = 0; i < 4; i++) z.box(wm, 0, 0.3 + i * 0.5, 0.17, 1.4, 0.04, 0.34, { layer: L });
      for (const sx of [-1, 1]) z.box(wm, sx * 0.68, 1.0, 0.17, 0.04, 2.0, 0.36, { layer: L });
      // jars / books
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        if (r() < 0.3) continue;
        const kind = r();
        const px = -0.55 + j * 0.36 + r() * 0.08, py = 0.33 + i * 0.5;
        if (kind < 0.45) z.cyl(K.flat(["#6e8a9a", "#b0a070", "#8a5a4a", "#c8c0a8"][(r() * 4) | 0], 0.3), px, py + 0.09, 0.15, 0.06, 0.07, 0.18, { layer: L, seg: 8 });
        else for (let b = 0; b < 3; b++) z.box(K.flat(["#6a2a22", "#2a4a6a", "#4a5a2a", "#7a6a3a"][(r() * 4) | 0]), px - 0.08 + b * 0.07, py + 0.12, 0.17, 0.06, 0.22 + r() * 0.04, 0.2, { layer: L });
      }
    });
  }
  function rug(z, x, y, zz, w, d, o) {
    o = o || {};
    const tex = K.canvasTex("rug|" + (o.color || "r"), 256, 256, (g, W, H) => {
      g.fillStyle = o.color || "#7a2a22"; g.fillRect(0, 0, W, H);
      g.strokeStyle = "#d8b46a"; g.lineWidth = 10; g.strokeRect(14, 14, W - 28, H - 28);
      g.strokeStyle = "#2a1a3a"; g.lineWidth = 6; g.strokeRect(34, 34, W - 68, H - 68);
      g.fillStyle = "#c89a4a";
      for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(W / 2, H / 2, 70 - i * 13, 40 - i * 7, 0, 0, TAU); g.globalAlpha = 0.25 + i * 0.12; g.fill(); }
      g.globalAlpha = 1;
      for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
    });
    const m = K.texMat("rug|" + (o.color || "r"), tex, { roughness: 1 });
    return z.mesh(K.boxGeo(w, 0.025, d, 100), m, x, y + 0.0125, zz, o);
  }
  function fireplace(z, x, zz, ry, o, flames) {
    o = o || {};
    const L = o.layer || "detail", y = o.y || 0, st = M("stoneBrick", { color: "#8a8276" });
    z.frame(x, y, zz, ry || 0, () => {
      z.box(st, -0.75, 0.6, 0, 0.4, 1.2, 0.7, { layer: L });
      z.box(st, 0.75, 0.6, 0, 0.4, 1.2, 0.7, { layer: L });
      z.box(st, 0, 1.35, 0, 1.9, 0.3, 0.8, { layer: L });
      z.box(st, 0, 2.2, -0.1, 1.4, 1.5, 0.5, { layer: L });
      z.box(K.flat("#1a1410"), 0, 0.6, -0.28, 1.1, 1.2, 0.1, { layer: L });
      z.box(M("woodDark"), 0, 1.52, 0.1, 2.1, 0.08, 0.5, { layer: L });
      for (let i = 0; i < 3; i++) z.cyl(M("bark"), -0.25 + i * 0.25, 0.12, 0.0, 0.07, 0.07, 0.7, { layer: L, rz: Math.PI / 2, ry: 0.3 * (i - 1), seg: 6 });
      z.colBox(0, 0.9, 0, 1.9, 1.8, 0.8);
      if (flames) { const w = z.world(0, 0.25, 0); flames.add(w.x, w.y, w.z, 7, 0.32, 0.9, 1); }
    });
  }
  function barrel(z, x, zz, o) {
    o = o || {};
    const L = o.layer || "main", y = o.y || 0, h = o.h || 1.0, r = o.r || 0.36;
    const pts = [[0, 0], [r * 0.86, 0], [r, h * 0.25], [r * 1.05, h * 0.5], [r, h * 0.75], [r * 0.86, h], [0, h]];
    z.geo(K.latheGeo("barrel" + r + h, pts, 14), M("woodPlank", { color: o.color || "#7c5a38" }), x, y, zz, { layer: L, ry: o.ry || 0 });
    for (const hy of [0.12, 0.5, 0.88]) z.cyl(M("iron", { color: "#4a4a48" }), x, y + hy * h, zz, r * (hy === 0.5 ? 1.07 : 0.95), r * (hy === 0.5 ? 1.07 : 0.95), 0.05, { layer: L, seg: 14, open: true });
    if (o.col !== false) z.colCyl(x, y, zz, r, h);
    if (o.water) z.cyl(K.flat("#2a3a40", 0.05, 0.3), x, y + h - 0.08, zz, r * 0.82, r * 0.82, 0.02, { layer: L, seg: 14 });
  }
  function crate(z, x, zz, s, o) {
    o = o || {};
    const L = o.layer || "main", y = o.y || 0;
    s = s || 0.8;
    const wm = M("woodPlank", { color: o.color || "#9a7448" }), dk = M("woodDark");
    z.frame(x, y, zz, o.ry || 0, () => {
      z.box(wm, 0, s / 2, 0, s, s, s, { layer: L, tex: 1.2 });
      for (const a of [-1, 1]) for (const b of [-1, 1]) z.box(dk, a * (s / 2 - 0.03), s / 2, b * (s / 2 - 0.03), 0.08, s + 0.01, 0.08, { layer: L });
      if (o.col !== false) z.colBox(0, s / 2, 0, s, s, s, { surface: "wood" });
    });
  }
  function haystack(z, x, zz, r, o) {
    o = o || {};
    const L = o.layer || "main", y = o.y || 0;
    const st = M("straw");
    const h = r * 1.5;
    z.geo(K.latheGeo("hay" + r, [[0, 0], [r, 0], [r * 1.05, h * 0.35], [r * 0.9, h * 0.65], [r * 0.5, h * 0.9], [0.05, h]], 14), st, x, y, zz, { layer: L, ry: o.ry || 0 });
    z.cyl(M("woodDark"), x, y + h + 0.3, zz, 0.04, 0.04, 0.8, { layer: L, seg: 5 });
    if (o.col !== false) z.colCyl(x, y, zz, r * 0.9, h * 0.75, { surface: "dirt" });
    return y + h;
  }
  function hayBale(z, x, y, zz, ry, o) {
    o = o || {};
    const L = o.layer || "main";
    z.box(M("straw"), x, y + 0.25, zz, 1.1, 0.5, 0.55, { layer: L, ry, tex: 0.8 });
    z.box(K.flat("#7a6030"), x, y + 0.25, zz, 0.04, 0.52, 0.57, { layer: L, ry });
    if (o.col !== false) z.colBox(x, y + 0.25, zz, 1.1, 0.5, 0.55, { ry, surface: "dirt" });
  }
  function bench(z, x, zz, ry, o) {
    o = o || {};
    const L = o.layer || "main", wm = M("woodPlank", { color: "#7a5a3a" });
    z.frame(x, o.y || 0, zz, ry || 0, () => {
      z.box(wm, 0, 0.45, 0, 1.8, 0.06, 0.42, { layer: L });
      z.box(wm, 0, 0.8, -0.2, 1.8, 0.3, 0.05, { layer: L, rx: -0.15 });
      for (const sx of [-0.75, 0.75]) { z.box(M("woodDark"), sx, 0.22, 0, 0.08, 0.45, 0.4, { layer: L }); z.box(M("woodDark"), sx, 0.62, -0.18, 0.08, 0.5, 0.06, { layer: L }); }
      z.colBox(0, 0.25, 0, 1.8, 0.5, 0.45);
    });
  }
  function cart(z, x, zz, ry, o) {
    o = o || {};
    const L = o.layer || "main", wm = M("woodPlank", { color: "#8a6a44" }), dk = M("woodDark");
    z.frame(x, o.y || 0, zz, ry || 0, () => {
      z.box(wm, 0, 0.85, 0, 1.6, 0.1, 2.6, { layer: L });
      for (const sx of [-1, 1]) z.box(wm, sx * 0.78, 1.15, 0, 0.06, 0.5, 2.6, { layer: L });
      z.box(wm, 0, 1.15, -1.28, 1.6, 0.5, 0.06, { layer: L });
      for (const sx of [-1, 1]) {
        z.geo(K.torusGeo(0.55, 0.05, 6, 18), dk, sx * 0.9, 0.58, 0.3, { layer: L, ry: Math.PI / 2 });
        for (let s = 0; s < 6; s++) z.box(dk, sx * 0.9, 0.58, 0.3, 0.04, 1.05, 0.04, { layer: L, rx: (s / 6) * Math.PI });
        z.cyl(dk, sx * 0.9, 0.58, 0.3, 0.09, 0.09, 0.12, { layer: L, rz: Math.PI / 2 });
      }
      z.box(dk, 0, 0.58, 0.3, 1.8, 0.06, 0.06, { layer: L });
      for (const sx of [-0.35, 0.35]) z.box(dk, sx, 0.55, 2.2, 0.07, 0.07, 2.2, { layer: L, rx: 0.25 });
      if (o.load === "hay") { z.box(M("straw"), 0, 1.35, -0.1, 1.45, 0.6, 2.3, { layer: L }); }
      if (o.load === "barrels") { barrel(z, -0.4, -0.6, { y: 0.9, h: 0.7, r: 0.26, layer: L, col: false }); barrel(z, 0.35, 0.4, { y: 0.9, h: 0.7, r: 0.26, layer: L, col: false }); }
      z.colBox(0, 0.9, 0.2, 1.8, 1.6, 2.8);
    });
  }
  function well(z, x, zz, o) {
    o = o || {};
    const L = o.layer || "main", st = M("stoneBrick", { color: "#8a8478" }), wm = M("woodDark");
    let bucket = null;
    z.frame(x, o.y || 0, zz, o.ry || 0, () => {
      const ring = K.latheGeo("wellring", [[1.0, 0], [1.25, 0], [1.25, 0.9], [1.3, 0.95], [1.3, 1.02], [1.0, 1.02], [1.0, 0.9]], 20);
      z.geo(ring, st, 0, 0, 0, { layer: L });
      z.geo(K.circleGeo(1.0, 20), K.flat("#0a0c0e", 0.05, 0.2), 0, 0.15, 0, { layer: L });
      for (const sx of [-1, 1]) z.box(wm, sx * 1.12, 1.9, 0, 0.16, 1.9, 0.16, { layer: L });
      z.cyl(wm, 0, 2.55, 0, 0.1, 0.1, 2.4, { layer: L, rz: Math.PI / 2, seg: 8 });
      z.box(M("roofTile", { color: "#7a4632" }), 0, 3.05, 0.45, 2.8, 0.08, 1.15, { layer: L, rx: 0.55 });
      z.box(M("roofTile", { color: "#7a4632" }), 0, 3.05, -0.45, 2.8, 0.08, 1.15, { layer: L, rx: -0.55 });
      z.box(wm, 1.3, 2.55, 0, 0.06, 0.4, 0.06, { layer: L, rz: 0.4 });
      z.colCyl(0, 0, 0, 1.3, 1.02, { surface: "stone" });
      // bucket on a rope (animated prop)
      bucket = new THREE.Group();
      const b = new THREE.Mesh(K.latheGeo("bucket", [[0, 0], [0.18, 0], [0.22, 0.3], [0.2, 0.3], [0.17, 0.03], [0, 0.03]], 12), M("woodPlank", { color: "#6a4a2c" }));
      b.castShadow = true;
      const rope = new THREE.Mesh(K.cylGeo(0.012, 0.012, 1, 4), K.flat("#b8a070"));
      rope.position.y = 0.8; rope.scale.y = 1.0; rope.name = "rope";
      const bail = new THREE.Mesh(K.torusGeo(0.2, 0.01, 4, 12, Math.PI), M("iron"));
      bail.position.y = 0.3;
      bucket.add(b, rope, bail);
      z.object(bucket, 0, 1.55, 0, 0);
      bucket.userData.restY = bucket.position.y;
    });
    return bucket;
  }
  function lamppost(z, x, zz, o, flames) {
    o = o || {};
    const L = o.layer || "main", y = o.y || 0, ir = M("iron", { color: "#2c2c2e" });
    z.cyl(ir, x, y + 1.6, zz, 0.06, 0.09, 3.2, { layer: L, seg: 8 });
    z.cyl(ir, x, y + 0.1, zz, 0.18, 0.22, 0.2, { layer: L, seg: 8 });
    z.box(ir, x, y + 3.3, zz, 0.36, 0.05, 0.36, { layer: L });
    z.geo(K.coneGeo(0.3, 0.25, 4), ir, x, y + 3.62, zz, { layer: L, ry: Math.PI / 4 });
    z.box(K.glow("#ffcf80", 1.4), x, y + 3.45, zz, 0.24, 0.28, 0.24, { layer: "glow" });
    if (flames) { const w = z.world(x, y + 3.45, zz); flames.add(w.x, w.y, w.z, 1, 0.45, 1.2, 0.2); }
    z.colCyl(x, y, zz, 0.15, 3.2);
  }
  function torch(z, x, y, zz, ry, flames, o) {
    o = o || {};
    const L = o.layer || "main";
    z.frame(x, y, zz, ry || 0, () => {
      z.box(M("iron", { color: "#2a2a2a" }), 0, 0, -0.05, 0.1, 0.3, 0.1, { layer: L });
      z.cyl(M("woodDark"), 0, 0.15, 0.12, 0.035, 0.03, 0.55, { layer: L, rx: 0.35, seg: 6 });
      z.cyl(K.flat("#2a1a10"), 0, 0.42, 0.22, 0.06, 0.045, 0.14, { layer: L, rx: 0.35, seg: 6 });
      if (flames) { const w = z.world(0, 0.55, 0.25); flames.add(w.x, w.y, w.z, 5, o.size || 0.32, 0.7, 1); }
    });
  }
  function brazier(z, x, zz, flames, o) {
    o = o || {};
    const L = o.layer || "main", y = o.y || 0, ir = M("iron", { color: "#33302c" });
    z.geo(K.latheGeo("brazier", [[0.05, 0], [0.3, 0.02], [0.08, 0.1], [0.06, 0.8], [0.4, 0.95], [0.48, 1.15], [0.44, 1.15], [0.34, 0.98], [0, 0.98]], 12), ir, x, y, zz, { layer: L });
    z.geo(K.sphereGeo(0.3, 8, 5), K.flat("#2a1a12"), x, y + 1.0, zz, { layer: L, sy: 0.3 });
    if (flames) { const w = z.world(x, y + 1.1, zz); flames.add(w.x, w.y, w.z, 10, 0.55, 0.9, 1.6); }
    z.colCyl(x, y, zz, 0.45, 1.15);
  }
  function banner(z, x, y, zz, w, h, color, o) {
    o = o || {};
    const L = o.layer || "main";
    const key = "ban|" + color + "|" + (o.emblem || "") + "|" + (o.torn ? 1 : 0);
    const tex = K.canvasTex(key, 128, 256, (g, W, H) => {
      g.fillStyle = color; g.fillRect(0, 0, W, H);
      g.fillStyle = "rgba(0,0,0,0.25)"; for (let i = 0; i < W; i += 6) g.fillRect(i, 0, 2, H);
      g.fillStyle = o.trim || "#d8b048"; g.fillRect(0, 10, W, 8); g.fillRect(0, H - 40, W, 6);
      if (o.emblem === "crown") {
        g.fillStyle = o.trim || "#d8b048"; g.beginPath();
        g.moveTo(30, 130); g.lineTo(34, 85); g.lineTo(50, 110); g.lineTo(64, 75); g.lineTo(78, 110); g.lineTo(94, 85); g.lineTo(98, 130); g.closePath(); g.fill();
        g.fillRect(30, 134, 68, 10);
      } else if (o.emblem === "tower") {
        g.fillStyle = o.trim || "#e8e0d0"; g.fillRect(44, 80, 40, 70); for (let i = 0; i < 3; i++) g.fillRect(40 + i * 18, 68, 12, 14);
        g.fillStyle = color; g.fillRect(58, 120, 12, 30);
      } else if (o.emblem === "wheat") {
        g.strokeStyle = o.trim || "#e8c860"; g.lineWidth = 4;
        for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(64 + i * 14, 170); g.quadraticCurveTo(64 + i * 18, 120, 64 + i * 10, 80); g.stroke(); }
      }
      if (o.torn) {
        g.globalCompositeOperation = "destination-out";
        for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(i * 16, H); g.lineTo(i * 16 + 8, H - 30 - (i * 37) % 60); g.lineTo(i * 16 + 16, H); g.fill(); }
        g.globalCompositeOperation = "source-over";
        g.fillStyle = "rgba(20,10,10,0.45)"; g.fillRect(0, 0, W, H);
      } else {
        g.globalCompositeOperation = "destination-out"; g.beginPath(); g.moveTo(0, H); g.lineTo(W / 2, H - 28); g.lineTo(W, H); g.fill();
        g.globalCompositeOperation = "source-over";
      }
    });
    const m = K.custom("banM|" + key, () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, alphaTest: 0.5, side: THREE.DoubleSide }));
    z.geo(K.planeGeo(w, h), m, x, y - h / 2, zz, { layer: L, ry: o.ry || 0 });
    z.cyl(M("woodDark"), x, y + 0.03, zz, 0.03, 0.03, w + 0.2, { layer: L, rz: Math.PI / 2, ry: o.ry || 0, seg: 6 });
  }
  function signpost(z, x, zz, ry, lines, o) {
    o = o || {};
    const L = o.layer || "main";
    const tex = K.signTex(lines, { w: 512, h: 192, style: o.style || "wood" });
    const m = K.texMat("sign|" + lines.join("|") + (o.style || ""), tex, { roughness: 0.85 });
    const bw = o.w || 1.6, bh = bw * (192 / 512);
    const y = o.y || 0;
    z.frame(x, y, zz, ry || 0, () => {
      for (const sx of [-1, 1]) z.box(M("woodDark"), sx * (bw / 2 - 0.08), (o.h || 1.4) / 2 + bh / 2, -0.04, 0.1, (o.h || 1.4) + bh, 0.1, { layer: L });
      z.box(M("woodPlank", { color: "#6a4a2c" }), 0, (o.h || 1.4) + bh / 2, -0.04, bw + 0.08, bh + 0.08, 0.06, { layer: L });
      z.geo(K.planeGeo(bw, bh), m, 0, (o.h || 1.4) + bh / 2, 0.0, { layer: L });
      z.geo(K.planeGeo(bw, bh), m, 0, (o.h || 1.4) + bh / 2, -0.08, { layer: L, ry: Math.PI });
      if (o.col !== false) z.colBox(0, ((o.h || 1.4) + bh) / 2, -0.04, bw, (o.h || 1.4) + bh, 0.2);
    });
  }
  function fenceRun(z, x0, z0, x1, z1, o) {
    o = o || {};
    const L = o.layer || "main";
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const n = Math.max(1, Math.round(len / (o.step || 2.2)));
    const wm = M(o.mat || "woodPlank", { color: o.color || "#7a5a3a" });
    const post = K.boxGeo(0.14, o.h || 1.15, 0.14);
    const railLen = len / n;
    const rail = K.boxGeo(0.07, 0.11, railLen + 0.1);
    const hgt = o.h || 1.15;
    const ground = o.ground || (() => 0);
    for (let i = 0; i <= n; i++) {
      const t = i / n, px = x0 + dx * t, pz = z0 + dz * t;
      const gy = ground(px, pz);
      z.inst(post, wm, px, gy + hgt / 2 - 0.1, pz, { layer: L, ry: yaw + (i % 3 - 1) * 0.04, rz: ((i * 37) % 7 - 3) * 0.008 });
      if (i < n) {
        const mx = x0 + dx * (t + 0.5 / n), mz = z0 + dz * (t + 0.5 / n);
        const my = ground(mx, mz);
        if (!(o.broken && o.broken(i))) {
          z.inst(rail, wm, mx, my + hgt * 0.42, mz, { layer: L, ry: yaw });
          z.inst(rail, wm, mx, my + hgt * 0.8, mz, { layer: L, ry: yaw });
        }
      }
    }
    if (o.col) {
      const cy = ground((x0 + x1) / 2, (z0 + z1) / 2);
      z.colBox((x0 + x1) / 2, cy + 0.6, (z0 + z1) / 2, 0.2, 1.6, len, { ry: yaw, walk: false });
    }
  }
  function picket(z, x0, z0, x1, z1, o) {
    o = o || {};
    const L = o.layer || "main";
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
    const n = Math.max(2, Math.round(len / 0.22));
    const pm = M("plaster", { color: o.color || "#ece6d8" });
    const pk = K.boxGeo(0.09, 0.9, 0.03, 1);
    const tip = K.coneGeo(0.065, 0.12, 4);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      z.inst(pk, pm, x0 + dx * t, 0.45, z0 + dz * t, { layer: L, ry: yaw + Math.PI / 2 });
      z.inst(tip, pm, x0 + dx * t, 0.96, z0 + dz * t, { layer: L, ry: yaw + Math.PI / 4 });
    }
    z.box(pm, (x0 + x1) / 2, 0.3, (z0 + z1) / 2, 0.05, 0.07, len, { layer: L, ry: yaw });
    z.box(pm, (x0 + x1) / 2, 0.72, (z0 + z1) / 2, 0.05, 0.07, len, { layer: L, ry: yaw });
    if (o.col !== false) z.colBox((x0 + x1) / 2, 0.5, (z0 + z1) / 2, 0.15, 1.0, len, { ry: yaw, walk: false });
  }
  function rock(z, x, y, zz, r, seed, o) {
    o = o || {};
    const g = K.rockGeo(seed % 7, o.detail || 1);
    z.inst(g, M(o.mat || "rock", o.color ? { color: o.color } : undefined), x, y + r * 0.35, zz,
      { layer: o.layer || "main", ry: seed * 1.7, sx: r * (o.sx || 1), sy: r * (o.sy || 1), sz: r * (o.sz || 1.1) });
    if (o.col) z.colCyl(x, y - 0.2, zz, r * 0.85, r * 1.0 * (o.sy || 1), { surface: "rock" });
  }
  function woodpile(z, x, zz, ry, o) {
    o = o || {};
    const L = o.layer || "main";
    const bark = M("bark"), cut = M("woodPlank", { color: "#c49a64" });
    const w = o.w || 2.4, rows = o.rows || 4;
    z.frame(x, o.y || 0, zz, ry || 0, () => {
      for (let r = 0; r < rows; r++) {
        const n = Math.floor(w / 0.24) - (r % 2);
        for (let i = 0; i < n; i++) {
          const px = -w / 2 + 0.14 + i * 0.24 + (r % 2) * 0.12;
          z.cyl(bark, px, 0.12 + r * 0.22, 0, 0.11, 0.11, 0.8, { layer: L, rx: Math.PI / 2, seg: 7 });
          z.geo(K.circleGeo(0.1, 7), cut, px, 0.12 + r * 0.22, 0.401, { layer: L, rx: Math.PI / 2 });
        }
      }
      z.box(M("woodDark"), 0, rows * 0.22 + 0.16, 0, w + 0.3, 0.06, 1.1, { layer: L });
      z.colBox(0, (rows * 0.22 + 0.2) / 2, 0, w, rows * 0.22 + 0.2, 0.85, { surface: "wood" });
    });
    return (o.y || 0) + rows * 0.22 + 0.2;
  }
  function stump(z, x, zz, r, o) {
    o = o || {};
    z.cyl(M("bark"), x, (o.y || 0) + 0.25, zz, r * 0.9, r * 1.1, 0.5, { layer: o.layer || "main", seg: 9 });
    z.geo(K.circleGeo(r * 0.88, 9), M("woodPlank", { color: "#b48a58" }), x, (o.y || 0) + 0.505, zz, { layer: o.layer || "main" });
    if (o.col !== false) z.colCyl(x, o.y || 0, zz, r, 0.5);
  }
  function log(z, x, y, zz, len, r, ry, o) {
    o = o || {};
    z.cyl(M("bark"), x, y + r, zz, r, r * 1.05, len, { layer: o.layer || "main", rz: Math.PI / 2, ry, seg: 9 });
    if (o.col !== false) z.colBox(x, y + r, zz, len, r * 2, r * 2, { ry, surface: "wood" });
  }
  function gravestone(z, x, zz, o) {
    o = o || {};
    const L = o.layer || "main", st = M("stoneBrick", { color: o.color || "#9a968c" });
    z.frame(x, o.y || 0, zz, o.ry || 0, () => {
      if (o.cross) {
        z.box(st, 0, 0.6, 0, 0.16, 1.2, 0.14, { layer: L, rz: o.tilt || 0 });
        z.box(st, 0, 0.85, 0, 0.6, 0.15, 0.14, { layer: L, rz: o.tilt || 0 });
      } else {
        z.box(st, 0, 0.5, 0, 0.7, 1.0, 0.16, { layer: L, rz: o.tilt || 0 });
        z.cyl(st, 0, 1.0, 0, 0.35, 0.35, 0.16, { layer: L, rx: Math.PI / 2, rz: o.tilt || 0, seg: 12 });
      }
      z.box(st, 0, 0.05, 0.05, 0.9, 0.1, 0.5, { layer: L });
      if (o.text) {
        const tex = K.signTex(o.text, { w: 256, h: 192, style: "stone" });
        z.geo(K.planeGeo(0.6, 0.45), K.texMat("gs|" + o.text.join("|"), tex), 0, 0.62, 0.082, { layer: L });
      }
    });
  }
  function scarecrow(z, x, zz, ry, o) {
    o = o || {};
    const L = o.layer || "main";
    z.frame(x, o.y || 0, zz, ry || 0, () => {
      z.cyl(M("woodDark"), 0, 1.1, 0, 0.05, 0.06, 2.2, { layer: L, seg: 6 });
      z.cyl(M("woodDark"), 0, 1.55, 0, 0.04, 0.04, 1.7, { layer: L, rz: Math.PI / 2, seg: 6 });
      z.box(M("clothBlue", { color: "#5a6a7a" }), 0, 1.35, 0, 0.6, 0.7, 0.3, { layer: L });
      z.box(M("clothBlue", { color: "#5a6a7a" }), 0, 1.55, 0, 1.3, 0.2, 0.2, { layer: L });
      z.geo(K.sphereGeo(0.2, 10, 8), M("cardboard", { color: "#d8c49a" }), 0, 1.95, 0, { layer: L });
      z.geo(K.coneGeo(0.32, 0.35, 10), M("straw"), 0, 2.2, 0, { layer: L });
      z.cyl(M("straw"), 0, 2.07, 0, 0.36, 0.36, 0.03, { layer: L, seg: 12 });
      for (const sx of [-0.68, 0.68]) z.geo(K.coneGeo(0.06, 0.25, 5), M("straw"), sx, 1.5, 0, { layer: L, rz: sx > 0 ? -1.8 : 1.8 });
      z.geo(K.sphereGeo(0.03, 6, 4), eyesN, -0.07, 1.98, 0.18, { layer: "c0" });
      z.geo(K.sphereGeo(0.03, 6, 4), eyesN, 0.07, 1.98, 0.18, { layer: "c0" });
      z.geo(K.sphereGeo(0.035, 6, 4), eyesR, -0.07, 1.98, 0.18, { layer: "ngGlow" });
      z.geo(K.sphereGeo(0.035, 6, 4), eyesR, 0.07, 1.98, 0.18, { layer: "ngGlow" });
      z.colCyl(0, 0, 0, 0.2, 2.2);
    });
  }
  function dummy(z, x, zz, ry, o) {
    o = o || {};
    const L = o.layer || "main";
    z.frame(x, o.y || 0, zz, ry || 0, () => {
      z.cyl(M("woodDark"), 0, 0.9, 0, 0.07, 0.08, 1.8, { layer: L, seg: 6 });
      z.geo(K.latheGeo("dummy", [[0, 0], [0.25, 0.05], [0.28, 0.4], [0.24, 0.7], [0.1, 0.78], [0, 0.78]], 10), M("straw", { color: "#c8a868" }), 0, 0.9, 0, { layer: L });
      z.geo(K.sphereGeo(0.17, 8, 6), M("cardboard", { color: "#c8a868" }), 0, 1.85, 0, { layer: L });
      z.cyl(M("woodDark"), 0, 1.45, 0, 0.035, 0.035, 1.1, { layer: L, rz: Math.PI / 2, seg: 5 });
      z.cyl(M("leather"), 0, 1.25, 0, 0.27, 0.27, 0.08, { layer: L, seg: 10 });
      z.colCyl(0, 0, 0, 0.3, 2.0);
    });
  }
  function weaponRack(z, x, zz, ry, o) {
    o = o || {};
    const L = o.layer || "main", wm = M("woodDark"), ir = M("iron");
    z.frame(x, o.y || 0, zz, ry || 0, () => {
      for (const sx of [-0.9, 0.9]) z.box(wm, sx, 0.8, 0, 0.1, 1.6, 0.1, { layer: L });
      z.box(wm, 0, 1.4, 0, 1.9, 0.08, 0.12, { layer: L });
      z.box(wm, 0, 0.4, 0.15, 1.9, 0.08, 0.3, { layer: L });
      for (let i = 0; i < 5; i++) {
        const px = -0.7 + i * 0.35;
        z.cyl(wm, px, 1.0, 0.08, 0.02, 0.02, 1.9, { layer: L, rx: -0.12, seg: 5 });
        z.geo(K.coneGeo(0.04, 0.22, 4), ir, px, 2.0, -0.04, { layer: L, rx: -0.12 });
      }
      z.colBox(0, 0.8, 0, 1.9, 1.6, 0.4);
    });
  }
  function stall(z, x, zz, ry, o) {
    o = o || {};
    const L = o.layer || "main", wm = M("woodPlank", { color: "#8a6440" });
    z.frame(x, o.y || 0, zz, ry || 0, () => {
      z.box(wm, 0, 0.5, 0.6, 3.2, 1.0, 0.8, { layer: L, col: true });
      z.box(M("woodPlank", { color: "#a07a4c" }), 0, 1.03, 0.6, 3.4, 0.06, 1.0, { layer: L });
      for (const sx of [-1.6, 1.6]) for (const sz of [-0.8, 1.0]) z.box(M("woodDark"), sx, 1.3, sz, 0.12, 2.6, 0.12, { layer: L });
      // striped awning
      const tex = K.canvasTex("awning|" + (o.color || "r"), 128, 64, (g, W, H) => {
        for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#f0e8d8" : (o.color || "#a83a2a"); g.fillRect(i * 16, 0, 16, H); }
        g.fillStyle = "rgba(0,0,0,0.15)"; g.fillRect(0, H - 6, W, 6);
      });
      const am = K.custom("awnM|" + (o.color || "r"), () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }));
      z.geo(K.planeGeo(3.6, 2.2), am, 0, 2.6, 0.15, { layer: L, rx: -Math.PI / 2 + 0.3 });
      z.box(M("woodDark"), 0, 2.75, -0.85, 3.4, 0.1, 0.1, { layer: L });
      // goods
      const r = R(o.seed || 9);
      for (let i = 0; i < 9; i++) {
        const kind = (o.goods || "mixed") === "cheese" ? 0 : (i % 3);
        const px = -1.3 + i * 0.32, pz = 0.6 + (r() - 0.5) * 0.3;
        if (kind === 0) z.cyl(M("cheese"), px, 1.13, pz, 0.14, 0.14, 0.12, { layer: L, seg: 12 });
        else if (kind === 1) z.geo(K.sphereGeo(0.08, 8, 6), K.flat(["#c8342a", "#e8a030", "#7aa040"][(r() * 3) | 0]), px, 1.13, pz, { layer: L });
        else z.box(M("woodPlank", { color: "#b0884c" }), px, 1.13, pz, 0.24, 0.14, 0.24, { layer: L });
      }
      if (o.sign) {
        const tex2 = K.signTex(o.sign, { w: 512, h: 160 });
        z.geo(K.planeGeo(2.4, 0.75), K.texMat("stallsign|" + o.sign.join("|"), tex2), 0, 3.15, 1.05, { layer: L });
        z.box(M("woodDark"), 0, 3.15, 1.0, 2.5, 0.85, 0.06, { layer: L });
      }
    });
  }
  function bones(z, x, y, zz, seed, o) {
    o = o || {};
    const L = o.layer || "main", bm = M("bone");
    const r = R(seed);
    z.frame(x, y, zz, r() * TAU, () => {
      // rib cage arcs
      for (let i = 0; i < 6; i++) {
        z.geo(K.torusGeo(0.5 - Math.abs(i - 2.5) * 0.05, 0.035, 5, 10, Math.PI * 0.9), bm, -0.6 + i * 0.22, 0.05, 0, { layer: L, ry: Math.PI / 2, rz: 0.2 });
      }
      z.cyl(bm, 0, 0.06, 0, 0.05, 0.05, 1.6, { layer: L, rz: Math.PI / 2, seg: 6 });
      // skull
      z.geo(K.sphereGeo(0.22, 10, 8), bm, 1.1, 0.18, 0.1, { layer: L, sx: 1.3, sy: 0.8 });
      z.geo(K.coneGeo(0.05, 0.5, 6), bm, 1.15, 0.38, 0.32, { layer: L, rx: -1.0, rz: 0.4 });
      z.geo(K.coneGeo(0.05, 0.5, 6), bm, 1.15, 0.38, -0.12, { layer: L, rx: 1.0, rz: 0.4 });
      for (let i = 0; i < 3; i++) z.cyl(bm, -1.4 + r() * 0.6, 0.04, -0.8 + r() * 1.6, 0.03, 0.03, 0.7, { layer: L, rz: Math.PI / 2, ry: r() * 3, seg: 5 });
    });
  }
  function candle(z, x, y, zz, flames, o) {
    o = o || {};
    z.cyl(K.flat("#efe6cf", 0.6), x, y + 0.08, zz, 0.025, 0.028, 0.16, { layer: o.layer || "detail", seg: 8 });
    z.cyl(M("iron", { color: "#6a5a3a" }), x, y + 0.005, zz, 0.06, 0.07, 0.01, { layer: o.layer || "detail", seg: 10 });
    if (flames) { const w = z.world(x, y + 0.19, zz); flames.add(w.x, w.y, w.z, 2, 0.08, 0.6, 0.15); }
  }
  function lantern(z, x, y, zz, flames, o) {
    o = o || {};
    const ir = M("iron", { color: "#2c2a28" }), L = o.layer || "main";
    z.box(ir, x, y, zz, 0.22, 0.03, 0.22, { layer: L });
    z.box(ir, x, y + 0.32, zz, 0.24, 0.03, 0.24, { layer: L });
    z.geo(K.coneGeo(0.17, 0.12, 4), ir, x, y + 0.4, zz, { layer: L, ry: Math.PI / 4 });
    // iron frame (corner posts), faintly tinted glass panes, a candle stub with a small flame inside
    for (const [ox, oz] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) z.box(ir, x + ox, y + 0.16, zz + oz, 0.025, 0.3, 0.025, { layer: L });
    const glass = K.custom("lanternGlass", () => new THREE.MeshStandardMaterial({ color: "#e8dcc0", roughness: 0.08, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false }));
    z.box(glass, x, y + 0.16, zz, 0.19, 0.28, 0.19, { layer: "glow" });
    z.cyl(K.flat("#efe6cf", 0.6), x, y + 0.07, zz, 0.025, 0.028, 0.09, { layer: L, seg: 8 });
    z.geo(K.sphereGeo(0.022, 8, 6), K.glow("#ffc070", 1.6), x, y + 0.145, zz, { layer: "glow", sy: 1.7 });
    if (flames) { const w = z.world(x, y + 0.15, zz); flames.add(w.x, w.y, w.z, 1, 0.12, 0.8, 0.1); }
  }
  function washingLine(z, x0, z0, x1, z1, o) {
    o = o || {};
    const L = o.layer || "main";
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
    for (const [px, pz] of [[x0, z0], [x1, z1]]) z.cyl(M("woodDark"), px, 1.1, pz, 0.05, 0.06, 2.2, { layer: L, seg: 6 });
    z.cyl(K.flat("#d8d0b8"), (x0 + x1) / 2, 2.05, (z0 + z1) / 2, 0.008, 0.008, len, { layer: L, rx: Math.PI / 2, ry: yaw, seg: 3 });
    const cols = ["#e8e4da", "#8aa0c0", "#c86a5a", "#e8d8a0", "#a0b890"];
    const n = Math.floor(len / 0.9);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const cw = 0.45 + (i % 3) * 0.15, chh = 0.55 + (i % 2) * 0.25;
      const cm = K.custom("cloth" + cols[i % 5], () => new THREE.MeshStandardMaterial({ color: cols[i % 5], roughness: 1, side: THREE.DoubleSide }));
      z.geo(K.planeGeo(cw, chh), cm, x0 + dx * t, 2.05 - chh / 2 - 0.02, z0 + dz * t, { layer: L, ry: yaw + Math.PI / 2, rz: ((i * 13) % 5 - 2) * 0.03 });
    }
  }
  function cropRows(z, x, zz, w, d, ry, o) {
    o = o || {};
    const L = o.layer || "small";
    z.frame(x, 0, zz, ry || 0, () => {
      z.box(M("dirt", { color: "#5a4028" }), 0, 0.04, 0, w, 0.1, d, { layer: "flat" });
      const rows = Math.floor(w / 0.7);
      const g = K.coneGeo(0.16, 0.42, 5), dead = K.coneGeo(0.12, 0.3, 4);
      for (let r = 0; r < rows; r++) {
        z.box(M("dirt", { color: "#4a3420" }), -w / 2 + 0.35 + r * 0.7, 0.1, 0, 0.3, 0.1, d - 0.2, { layer: "flat" });
        const n = Math.floor(d / 0.45);
        for (let i = 0; i < n; i++) {
          z.inst(g, M("leaves", { color: o.color || "#5f8a3a" }), -w / 2 + 0.35 + r * 0.7, 0.32, -d / 2 + 0.3 + i * 0.45, { layer: "c0", ry: i + r });
          z.inst(dead, K.flat("#5a4a2a"), -w / 2 + 0.35 + r * 0.7, 0.25, -d / 2 + 0.3 + i * 0.45, { layer: "ng", ry: i + r, rz: 0.4 });
        }
      }
    });
  }
  // a group of eye pairs that only show in cycle 1 (in dark windows, bushes, under bridges...)
  function redEyes(z, x, y, zz, ry, o) {
    o = o || {};
    const g = K.sphereGeo(o.r || 0.035, 6, 4);
    const sp = o.sp || 0.09;
    z.frame(x, y, zz, ry || 0, () => {
      z.inst(g, eyesR, -sp / 2, 0, 0, { layer: "ngGlow" });
      z.inst(g, eyesR, sp / 2, 0, 0, { layer: "ngGlow" });
    });
  }

  // -------------------------------------------------------------------------------------------- animals
  function addEyes(parent, x, y, zz, r, sp) {
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(K.sphereGeo(r, 6, 4), eyesN);
      e.position.set(x + s * sp, y, zz);
      e.userData.keep = true;
      parent.add(e);
      eyeMeshes.push(e);
    }
  }
  function kitten(color) {
    const g = new THREE.Group();
    const fur = M("furCat", { color: color || "#c08a50" });
    const body = new THREE.Mesh(K.sphereGeo(0.14, 10, 8), fur); body.scale.set(0.85, 0.8, 1.35); body.position.y = 0.13;
    const head = new THREE.Mesh(K.sphereGeo(0.095, 10, 8), fur); head.position.set(0, 0.25, 0.17);
    const tail = new THREE.Mesh(K.cylGeo(0.02, 0.028, 0.28, 6), fur); tail.position.set(0, 0.2, -0.2); tail.rotation.x = -0.9;
    g.add(body, head, tail);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(K.coneGeo(0.035, 0.07, 4), fur); ear.position.set(s * 0.05, 0.33, 0.16); ear.rotation.z = -s * 0.2;
      g.add(ear);
      for (const fz of [0.09, -0.1]) { const leg = new THREE.Mesh(K.cylGeo(0.022, 0.022, 0.1, 5), fur); leg.position.set(s * 0.06, 0.05, fz); g.add(leg); }
    }
    const nose = new THREE.Mesh(K.sphereGeo(0.012, 5, 4), K.flat("#d88a8a")); nose.position.set(0, 0.245, 0.262); g.add(nose);
    addEyes(g, 0, 0.27, 0.245, 0.014, 0.035);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.userData.head = head; g.userData.tail = tail;
    head.userData.keep = true; tail.userData.keep = true;
    K.bake(g);
    return g;
  }
  function duck() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(K.sphereGeo(0.16, 10, 8), K.flat("#7a6a4a", 0.7)); body.scale.set(0.8, 0.6, 1.25); body.position.y = 0.05;
    const neck = new THREE.Mesh(K.sphereGeo(0.075, 8, 6), K.flat("#1f5a3a", 0.5)); neck.position.set(0, 0.17, 0.14);
    const bill = new THREE.Mesh(K.boxGeo(0.05, 0.02, 0.08), K.flat("#e0a030")); bill.position.set(0, 0.16, 0.23);
    const tail = new THREE.Mesh(K.coneGeo(0.05, 0.1, 5), K.flat("#3a3024")); tail.position.set(0, 0.1, -0.2); tail.rotation.x = -2.2;
    g.add(body, neck, bill, tail);
    addEyes(g, 0, 0.19, 0.19, 0.012, 0.045);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    K.bake(g);
    return g;
  }
  function chicken(c) {
    const g = new THREE.Group();
    const fm = K.flat(c || "#e8e0d0", 0.9);
    const body = new THREE.Mesh(K.sphereGeo(0.16, 10, 8), fm); body.scale.set(0.8, 0.85, 1.1); body.position.y = 0.3;
    const head = new THREE.Mesh(K.sphereGeo(0.07, 8, 6), fm); head.position.set(0, 0.48, 0.13);
    const comb = new THREE.Mesh(K.boxGeo(0.02, 0.05, 0.07), K.flat("#c8281e")); comb.position.set(0, 0.55, 0.13);
    const beak = new THREE.Mesh(K.coneGeo(0.02, 0.05, 4), K.flat("#e0a030")); beak.position.set(0, 0.47, 0.21); beak.rotation.x = Math.PI / 2;
    const tail = new THREE.Mesh(K.coneGeo(0.08, 0.16, 5), fm); tail.position.set(0, 0.42, -0.16); tail.rotation.x = -0.6;
    g.add(body, head, comb, beak, tail);
    for (const s of [-1, 1]) { const leg = new THREE.Mesh(K.cylGeo(0.01, 0.01, 0.16, 4), K.flat("#d89a30")); leg.position.set(s * 0.05, 0.08, 0); g.add(leg); }
    addEyes(g, 0, 0.5, 0.18, 0.01, 0.04);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.userData.head = head;
    head.userData.keep = true;
    K.bake(g);
    return g;
  }
  function setCycleEyes(cycle) {
    for (const e of eyeMeshes) e.material = cycle >= 1 ? eyesR : eyesN;
  }

  return {
    holeRects, house, windowUnit, table, chair, bed, shelf, rug, fireplace, barrel, crate, haystack, hayBale, bench, cart, well,
    lamppost, torch, brazier, banner, signpost, fenceRun, picket, rock, woodpile, stump, log, gravestone, scarecrow,
    dummy, weaponRack, stall, bones, candle, lantern, washingLine, cropRows, redEyes, kitten, duck, chicken,
    setCycleEyes, eyeMeshes, eyesN, eyesR,
  };
}
