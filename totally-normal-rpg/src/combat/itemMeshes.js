// itemMeshes.js - procedural 3D models for player gear and enemy weapons. All geometry/material cached.
// Hand convention: grip at the origin, the blade / shaft points along local +Z, the cutting edge faces +Y.
// (A relaxed hanging arm holds a sword pointing forward.) GRIP_FIX lets one constant re-orient everything.

export const GRIP_FIX = { x: 0, y: 0, z: 0 };   // extra Euler (radians) applied to every hand item wrapper

// merge a few built-in geometries into one (position/normal/uv), so a multi-part piece stays one draw call
function mergeGeos(list) {
  let n = 0; const flat = list.map((g) => { const q = g.index ? g.toNonIndexed() : g; n += q.attributes.position.count; return q; });
  const P = new Float32Array(n * 3), Nn = new Float32Array(n * 3), U = new Float32Array(n * 2);
  let o = 0;
  for (const q of flat) {
    const c = q.attributes.position.count;
    P.set(q.attributes.position.array, o * 3); Nn.set(q.attributes.normal.array, o * 3);
    if (q.attributes.uv) U.set(q.attributes.uv.array, o * 2);
    o += c;
  }
  const out = new flat[0].constructor();
  out.setAttribute("position", new flat[0].attributes.position.constructor(P, 3));
  out.setAttribute("normal", new flat[0].attributes.position.constructor(Nn, 3));
  out.setAttribute("uv", new flat[0].attributes.position.constructor(U, 2));
  out.computeBoundingSphere();
  return out;
}

export function createItemMeshes(ctx) {
  const THREE = ctx.THREE;
  const engine = ctx.engine;
  const geoCache = new Map();
  const matCache = new Map();

  function geo(key, fn) { let g = geoCache.get(key); if (!g) { g = fn(); geoCache.set(key, g); } return g; }
  function mat(key, fn) { let m = matCache.get(key); if (!m) { m = fn(); matCache.set(key, m); } return m; }
  function engMat(name, fallback) {
    return mat("e:" + name, () => {
      try { if (engine.materials && engine.materials.get) { const m = engine.materials.get(name); if (m) return m; } } catch (e) { /* fall back */ }
      return new THREE.MeshStandardMaterial(fallback);
    });
  }
  function std(key, o) { return mat("s:" + key, () => new THREE.MeshStandardMaterial(o)); }

  const M = {
    iron: () => engMat("iron", { color: 0x9aa0a8, metalness: 0.9, roughness: 0.32 }),
    steel: () => std("steel", { color: 0xc4c9cf, metalness: 1, roughness: 0.22 }),
    gold: () => engMat("gold", { color: 0xd8aa48, metalness: 1, roughness: 0.25 }),
    wood: () => engMat("woodPlank", { color: 0x8a6440, roughness: 0.85 }),
    woodDark: () => engMat("woodDark", { color: 0x4a3322, roughness: 0.9 }),
    leather: () => engMat("leather", { color: 0x5a3a24, roughness: 0.8 }),
    cheese: () => engMat("cheese", { color: 0xf0c048, roughness: 0.65 }),
    rust: () => engMat("rust", { color: 0x8a4422, metalness: 0.4, roughness: 0.9 }),
    cardboard: () => engMat("cardboard", { color: 0x9a7a4e, roughness: 1 }),
    paper: () => engMat("paper", { color: 0xeee6d0, roughness: 0.95 }),
    bark: () => engMat("bark", { color: 0x5a4a38, roughness: 1 }),
    cloth: () => engMat("clothWhite", { color: 0xe8e4da, roughness: 0.9 }),
    clothBlue: () => engMat("clothBlue", { color: 0x2a3a6a, roughness: 0.9 }),
    obsidian: () => engMat("obsidian", { color: 0x0b0a10, metalness: 0.3, roughness: 0.15 }),
    smellyBlade: () => std("smellyBlade", { color: 0x7d7a52, metalness: 0.55, roughness: 0.7 }),
    mold: () => std("mold", { color: 0x5f8a34, roughness: 0.95 }),
    sock: () => std("sock", { color: 0xd8d2bc, roughness: 1 }),
    sockStripe: () => std("sockStripe", { color: 0x4a6a8a, roughness: 1 }),
    milk: () => std("milk", { color: 0xf2efe2, roughness: 0.4 }),
    hair: () => std("hairball", { color: 0x7a6a58, roughness: 1 }),
    claw: () => std("claw", { color: 0xe8e0cc, roughness: 0.35 }),
    gem: () => std("gem", { color: 0x2a6ad8, metalness: 0.2, roughness: 0.1, emissive: 0x0a1a50 }),
    gemRed: () => std("gemRed", { color: 0x8a1a2a, metalness: 0.2, roughness: 0.1, emissive: 0x200408 }),
    orb: () => mat("orb", () => new THREE.MeshBasicMaterial({ color: 0xdff2ff })),
    badOrb: () => mat("badOrb", () => new THREE.MeshBasicMaterial({ color: 0xb8d090 })),
    shieldWood: () => std("shieldWood", { color: 0x6a4a2e, roughness: 0.85 }),
    royalWhite: () => std("royalWhite", { color: 0xe9e4d6, metalness: 0.5, roughness: 0.35 }),
    shadow: () => std("shadowMetal", { color: 0x050408, metalness: 0.6, roughness: 0.2, emissive: 0x08020c }),
  };

  // ---- shared geometry helpers
  function bladeGeo(key, len, w, thick, opts = {}) {
    return geo("blade:" + key, () => {
      const s = new THREE.Shape();
      const tip = opts.round ? 0 : len * 0.12;
      s.moveTo(-w / 2, 0);
      if (opts.notch) {
        s.lineTo(-w / 2, len * 0.3); s.lineTo(-w / 2 + w * 0.18, len * 0.34); s.lineTo(-w / 2, len * 0.4);
        s.lineTo(-w / 2, len * 0.62); s.lineTo(-w / 2 + w * 0.12, len * 0.66); s.lineTo(-w / 2, len * 0.7);
      }
      s.lineTo(-w / 2, len - tip);
      if (opts.round) s.quadraticCurveTo(-w / 2, len + w * 0.45, 0, len + w * 0.45), s.quadraticCurveTo(w / 2, len + w * 0.45, w / 2, len - tip);
      else s.lineTo(0, len), s.lineTo(w / 2, len - tip);
      if (opts.notch) { s.lineTo(w / 2, len * 0.5); s.lineTo(w / 2 - w * 0.2, len * 0.46); s.lineTo(w / 2, len * 0.42); }
      s.lineTo(w / 2, 0);
      s.lineTo(-w / 2, 0);
      if (opts.holes) {
        for (const h of opts.holes) {
          const p = new THREE.Path();
          p.absarc(h[0] * w, h[1] * len, h[2] * w, 0, Math.PI * 2, true);
          s.holes.push(p);
        }
      }
      const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.5,
        bevelSize: Math.min(w * 0.18, 0.012), bevelSegments: 2, curveSegments: 10 });
      g.translate(0, 0, -thick / 2);
      g.rotateX(Math.PI / 2);   // shape Y -> +Z (length forward)
      g.rotateZ(Math.PI / 2);   // width along Y (edge up), flat faces to the sides
      g.computeVertexNormals();
      return g;
    });
  }
  const boxG = (w, h, d) => geo(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
  const cylZ = (r0, r1, len, seg = 12) => geo(`cylz:${r0}:${r1}:${len}:${seg}`, () => {
    const g = new THREE.CylinderGeometry(r1, r0, len, seg); g.rotateX(Math.PI / 2); g.translate(0, 0, len / 2); return g;
  });
  const sph = (r, ws = 12, hs = 10) => geo(`sph:${r}:${ws}`, () => new THREE.SphereGeometry(r, ws, hs));
  const cone = (r, h, seg = 8) => geo(`cone:${r}:${h}:${seg}`, () => new THREE.ConeGeometry(r, h, seg));

  function mesh(g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
    o.castShadow = true;
    return o;
  }
  function wrap(inner) {
    const g = new THREE.Group();
    g.rotation.set(GRIP_FIX.x, GRIP_FIX.y, GRIP_FIX.z);
    g.add(inner);
    return g;
  }

  // classic sword: grip (behind origin), guard, blade along +Z
  function sword(o) {
    const g = new THREE.Group();
    const gripLen = o.grip || 0.18;
    g.add(mesh(cylZ(0.019, 0.017, gripLen, 10), o.gripMat, 0, 0, -gripLen * 0.55));
    g.add(mesh(sph(o.pommel || 0.03), o.pommelMat || o.guardMat, 0, 0, -gripLen * 0.6 - 0.02));
    if (o.guardW) g.add(mesh(boxG(0.035, o.guardW, 0.035), o.guardMat, 0, 0, gripLen * 0.45 - 0.02));
    const b = mesh(bladeGeo(o.key, o.len, o.w, o.thick || 0.012, o), o.bladeMat, 0, 0, gripLen * 0.45);
    g.add(b);
    g.userData.tip = gripLen * 0.45 + o.len;
    return g;
  }

  const builders = {
    smelly_sword: () => sword({ key: "smelly", len: 0.78, w: 0.06, bladeMat: M.smellyBlade(), guardMat: M.rust(), gripMat: M.leather(), notch: true }),
    cheese_sword: () => sword({ key: "cheese", len: 0.82, w: 0.1, thick: 0.03, bladeMat: M.cheese(), guardMat: M.cheese(), gripMat: M.woodDark(),
      holes: [[0, 0.25, 0.18], [-0.12, 0.45, 0.12], [0.1, 0.62, 0.14], [-0.05, 0.8, 0.1]] }),
    wooden_sword: () => sword({ key: "wooden", len: 0.85, w: 0.075, thick: 0.022, round: true, bladeMat: M.wood(), guardMat: M.woodDark(), gripMat: M.leather() }),
    iron_sword: () => sword({ key: "iron", len: 0.92, w: 0.055, bladeMat: M.steel(), guardMat: M.iron(), gripMat: M.leather(), guardW: 0.22 }),
    gold_sword: () => sword({ key: "gold", len: 0.98, w: 0.06, bladeMat: M.gold(), guardMat: M.gold(), gripMat: M.clothBlue(), guardW: 0.26, pommel: 0.036 }),
    kings_staff: () => staff(false),
    cat_claws: () => claws(false),
    bad_smelly_sword: () => sockSword(),
    bad_cheese_sword: () => {
      const g = sword({ key: "moldy", len: 0.8, w: 0.1, thick: 0.03, bladeMat: M.cheese(), guardMat: M.mold(), gripMat: M.woodDark(),
        holes: [[0.05, 0.3, 0.16], [-0.1, 0.55, 0.14]] });
      const spots = [[0.02, 0.2], [-0.03, 0.42], [0.03, 0.66], [0, 0.78], [-0.035, 0.12]];
      for (const s of spots) g.add(mesh(sph(0.03, 8, 6), M.mold(), 0.018, s[0], 0.1 + s[1] * 0.8));
      return g;
    },
    bad_wooden_sword: () => sword({ key: "termite", len: 0.86, w: 0.09, thick: 0.03, bladeMat: M.woodDark(), guardMat: M.woodDark(), gripMat: M.bark(),
      holes: [[0.1, 0.15, 0.08], [-0.15, 0.3, 0.1], [0.12, 0.47, 0.07], [-0.08, 0.6, 0.09], [0.14, 0.75, 0.06], [-0.1, 0.86, 0.06]] }),
    bad_iron_sword: () => {
      const g = new THREE.Group();
      const rod = geo("rustStick", () => {
        const pts = [];
        for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector3(Math.sin(i * 0.9) * 0.02, Math.sin(i * 0.5) * 0.03, i * 0.11));
        return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.016, 6, false);
      });
      g.add(mesh(rod, M.rust(), 0, 0, -0.06));
      g.add(mesh(cylZ(0.02, 0.02, 0.14, 8), M.cloth(), 0, 0, -0.1));
      return g;
    },
    bad_gold_sword: () => {
      const g = new THREE.Group();
      g.add(mesh(cylZ(0.017, 0.017, 0.5, 8), M.wood(), 0, 0, -0.22));
      g.add(mesh(bladeGeo("foolsgold", 0.7, 0.07, 0.01), M.gold(), 0, 0, 0.25));
      for (let i = 0; i < 5; i++) g.add(mesh(boxG(0.024, 0.02, 0.03), M.wood(), 0.002 * (i % 2 ? 1 : -1) + 0.008, (i % 2 ? 0.012 : -0.014), 0.35 + i * 0.11));
      return g;
    },
    bad_kings_staff: () => staff(true),
    bad_cat_claws: () => claws(true),
  };

  function sockSword() {
    const g = new THREE.Group();
    g.add(mesh(cylZ(0.013, 0.013, 0.75, 8), M.wood(), 0, 0, -0.15));
    const sockG = geo("sock", () => {
      const pts = [];
      const N = 14;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const r = 0.045 + Math.sin(t * Math.PI) * 0.012 + (t > 0.8 ? -0.03 * (t - 0.8) / 0.2 : 0);
        pts.push(new THREE.Vector2(Math.max(0.004, r), t * 0.42));
      }
      const l = new THREE.LatheGeometry(pts, 14);
      l.rotateX(Math.PI / 2);
      return l;
    });
    const s1 = mesh(sockG, M.sock(), 0, 0, 0.32);
    const toe = mesh(sph(0.05, 10, 8), M.sock(), 0, 0.04, 0.76); toe.scale.set(1, 1.3, 1.5);
    g.add(s1, toe);
    for (let i = 0; i < 3; i++) { const st = mesh(geo("sockStripe", () => { const t = new THREE.TorusGeometry(0.051, 0.008, 6, 16); return t; }), M.sockStripe(), 0, 0, 0.36 + i * 0.045); g.add(st); }
    return g;
  }

  function staff(bad) {
    const g = new THREE.Group();
    if (!bad) {
      g.add(mesh(cylZ(0.028, 0.022, 1.65, 10), M.woodDark(), 0, 0, -0.55));
      for (let i = 0; i < 4; i++) g.add(mesh(geo("band", () => { const t = new THREE.TorusGeometry(0.03, 0.007, 6, 16); return t; }), M.gold(), 0, 0, -0.4 + i * 0.4));
      // head: four gold claws around an orb
      const head = new THREE.Group(); head.position.set(0, 0, 1.12);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        const c = mesh(geo("staffClaw", () => { const cg = new THREE.ConeGeometry(0.018, 0.2, 6); cg.translate(0, 0.1, 0); return cg; }), M.gold(),
          Math.cos(a) * 0.05, Math.sin(a) * 0.05, -0.04);
        c.rotation.set(Math.PI / 2 + Math.sin(a) * -0.5, 0, 0); c.rotation.y = Math.cos(a) * 0.5;
        c.lookAt(Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0.18); c.rotateX(Math.PI / 2);
        head.add(c);
      }
      const orb = mesh(sph(0.065, 16, 12), M.orb(), 0, 0, 0.06); orb.castShadow = false; orb.name = "orb";
      head.add(orb);
      g.add(head);
      g.userData.orb = orb;
      g.userData.tip = 1.2;
    } else {
      const twig = geo("twig", () => {
        const pts = [];
        for (let i = 0; i <= 10; i++) pts.push(new THREE.Vector3(Math.sin(i * 1.3) * 0.05 + (i > 6 ? (i - 6) * 0.03 : 0), Math.cos(i * 0.9) * 0.03, -0.5 + i * 0.16));
        return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.02, 6, false);
      });
      g.add(mesh(twig, M.bark()));
      const orb = mesh(sph(0.05, 10, 8), M.badOrb(), 0.12, 0.0, 1.12); orb.castShadow = false; orb.name = "orb";
      g.add(orb);
      g.userData.orb = orb;
      g.userData.tip = 1.15;
    }
    return g;
  }

  function claws(bad) {
    const g = new THREE.Group();
    g.add(mesh(geo("clawBand", () => new THREE.TorusGeometry(0.05, 0.016, 8, 16)), bad ? M.hair() : M.leather(), 0, 0, 0));
    const clawG = geo("clawCurve", () => {
      const pts = [];
      for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(0, Math.sin(t * 1.2) * 0.06, t * 0.2)); }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tg = new THREE.TubeGeometry(curve, 10, 0.012, 6, false);
      // taper: scale radius toward the tip
      const p = tg.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const t = Math.min(1, Math.max(0, v.z / 0.2));
        const c = curve.getPoint(t);
        v.sub(c).multiplyScalar(1 - t * 0.85).add(c);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      tg.computeVertexNormals();
      return tg;
    });
    for (let i = -1; i <= 1; i++) g.add(mesh(clawG, M.claw(), i * 0.03, 0.02, 0.03));
    if (bad) { const hb = mesh(sph(0.06, 8, 6), M.hair(), 0, 0.04, 0.02); hb.scale.set(1.2, 0.8, 1); g.add(hb); }
    return g;
  }

  // ---- body attachments (armor detail + charms). Body frame: chest centre, +Z forward, +Y up.
  function armorBody(id) {
    const g = new THREE.Group();
    const pauld = (m, s = 1) => {
      // layered plate pauldron: a cap + three overlapping lames stepping down the arm, each with a rolled edge
      const pg = geo("pauldron2", () => {
        const parts = [];
        const cap = new THREE.SphereGeometry(0.12, 16, 5, 0, Math.PI * 2, 0, 0.75); cap.scale(1, 0.62, 1.12); parts.push(cap);
        for (let i = 0; i < 3; i++) {
          const r = 0.125 + i * 0.012, t0 = 0.62 + i * 0.26;
          const l = new THREE.SphereGeometry(r, 16, 2, 0, Math.PI * 2, t0, 0.34); l.scale(1, 0.62, 1.12); l.translate(0, -i * 0.012, 0); parts.push(l);
          const rim = new THREE.TorusGeometry(r * Math.sin(t0 + 0.34), 0.007, 4, 16); rim.rotateX(Math.PI / 2); rim.scale(1, 1, 1.12);
          rim.translate(0, r * Math.cos(t0 + 0.34) * 0.62 - i * 0.012, 0); parts.push(rim);
        }
        return mergeGeos(parts);
      });
      g.add(mesh(pg, m, 0.23 * s, 0.17, 0, 0, 0, -0.35));
      g.add(mesh(pg, m, -0.23 * s, 0.17, 0, 0, 0, 0.35));
    };
    const belt = (m) => g.add(mesh(geo("belt", () => { const t = new THREE.TorusGeometry(0.19, 0.025, 6, 24); t.rotateX(Math.PI / 2); t.scale(1, 1, 0.75); return t; }), m, 0, -0.3, 0));
    switch (id) {
      case "smelly_armor":
        belt(M.leather());
        g.add(mesh(boxG(0.05, 0.5, 0.02), M.leather(), 0.08, 0, 0.16, 0, 0, 0.5));
        g.add(mesh(boxG(0.05, 0.5, 0.02), M.leather(), -0.08, 0, 0.16, 0, 0, -0.5));
        break;
      case "cheese_armor":
        pauld(M.cheese()); belt(M.woodDark());
        break;
      case "iron_armor":
        pauld(M.iron()); belt(M.leather());
        g.add(mesh(geo("gorget", () => { const t = new THREE.TorusGeometry(0.1, 0.03, 6, 20); t.rotateX(Math.PI / 2); return t; }), M.iron(), 0, 0.3, 0));
        break;
      case "golden_armor":
        pauld(M.gold(), 1.08); belt(M.gold());
        g.add(mesh(geo("gorget", () => { const t = new THREE.TorusGeometry(0.1, 0.03, 6, 20); t.rotateX(Math.PI / 2); return t; }), M.gold(), 0, 0.3, 0));
        g.add(mesh(sph(0.03, 10, 8), M.gemRed(), 0, 0.12, 0.17));
        break;
      case "bad_smelly_armor": {
        const b = mesh(boxG(0.46, 0.5, 0.34), M.cardboard(), 0, -0.02, 0); b.scale.set(1, 1, 1); g.add(b);
        g.add(mesh(boxG(0.2, 0.02, 0.36), M.cardboard(), 0.12, 0.24, 0, 0, 0, 0.3));
        break;
      }
      case "bad_cheese_armor":
        pauld(M.milk());
        for (let i = 0; i < 6; i++) g.add(mesh(cone(0.015, 0.08, 6), M.milk(), -0.15 + i * 0.06, -0.33, 0.15, Math.PI, 0, 0));
        break;
      case "bad_iron_armor": {
        const bk = geo("bucket", () => { const c = new THREE.CylinderGeometry(0.24, 0.2, 0.42, 16, 1, true); return c; });
        const m = mesh(bk, M.rust(), 0, -0.05, 0); m.material = M.rust(); g.add(m);
        const hb = mesh(geo("bucketHandle", () => new THREE.TorusGeometry(0.2, 0.008, 4, 20, Math.PI)), M.rust(), 0, 0.18, 0, 0, Math.PI / 2, 0);
        g.add(hb);
        break;
      }
      case "bad_golden_armor": {
        const lid = mesh(geo("binLid", () => { const c = new THREE.CylinderGeometry(0.27, 0.27, 0.025, 24); c.rotateX(Math.PI / 2); return c; }), M.gold(), 0, 0, 0.2);
        g.add(lid);
        g.add(mesh(geo("lidHandle", () => new THREE.TorusGeometry(0.06, 0.01, 4, 12, Math.PI)), M.iron(), 0, 0, 0.22));
        pauld(M.gold());
        break;
      }
      default: break;
    }
    return g;
  }

  function charmMesh(id) {
    const g = new THREE.Group();
    if (id === "toms_bell") {
      const bell = mesh(geo("bell", () => {
        const pts = [new THREE.Vector2(0.001, 0.05), new THREE.Vector2(0.02, 0.045), new THREE.Vector2(0.03, 0.02), new THREE.Vector2(0.036, -0.01), new THREE.Vector2(0.04, -0.02)];
        return new THREE.LatheGeometry(pts, 14);
      }), M.gold(), 0.12, -0.32, 0.17);
      g.add(bell);
      g.userData.bell = bell;
    } else if (id === "rookie_badge") {
      g.add(mesh(geo("badge", () => { const c = new THREE.CylinderGeometry(0.04, 0.04, 0.01, 16); c.rotateX(Math.PI / 2); return c; }), M.gold(), -0.1, 0.12, 0.18));
    }
    return g;
  }

  function crown(id) {
    const g = new THREE.Group();
    if (id === "kings_crown") {
      g.add(mesh(geo("crownBand", () => new THREE.CylinderGeometry(0.115, 0.11, 0.07, 20, 1, true)), M.gold(), 0, 0.03, 0));
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        g.add(mesh(cone(0.022, 0.08, 5), M.gold(), Math.sin(a) * 0.112, 0.1, Math.cos(a) * 0.112));
        if (i % 2 === 0) g.add(mesh(sph(0.014, 8, 6), i % 4 ? M.gem() : M.gemRed(), Math.sin(a) * 0.117, 0.035, Math.cos(a) * 0.117));
      }
      g.userData.glow = true;
    } else {
      const pz = geo("paperCrown", () => {
        const c = new THREE.CylinderGeometry(0.12, 0.115, 0.1, 16, 2, true);
        const p = c.attributes.position;
        for (let i = 0; i < p.count; i++) {
          if (p.getY(i) > 0.04) { const a = Math.atan2(p.getX(i), p.getZ(i)); p.setY(i, 0.05 + 0.045 * Math.abs(Math.sin(a * 4))); }
        }
        c.computeVertexNormals();
        return c;
      });
      const m = mesh(pz, M.paper(), 0, 0.04, 0); m.material = mat("paperDS", () => { const pm = M.paper().clone(); pm.side = THREE.DoubleSide; return pm; });
      g.add(m);
    }
    return g;
  }

  // ---- enemy weapons (same hand convention)
  const enemyBuilders = {
    pitchfork: () => {
      const g = new THREE.Group();
      g.add(mesh(cylZ(0.02, 0.018, 1.7, 8), M.wood(), 0, 0, -0.6));
      g.add(mesh(boxG(0.03, 0.26, 0.03), M.iron(), 0, 0, 1.1));
      for (let i = -1; i <= 1; i++) g.add(mesh(cylZ(0.009, 0.004, 0.3, 5), M.iron(), 0, i * 0.12, 1.1));
      return g;
    },
    halberd: () => {
      const g = new THREE.Group();
      g.add(mesh(cylZ(0.026, 0.024, 2.3, 8), M.woodDark(), 0, 0, -0.9));
      const ax = geo("halberdAxe", () => {
        const s = new THREE.Shape();
        s.moveTo(0, -0.1); s.quadraticCurveTo(0.34, -0.2, 0.36, 0.05); s.quadraticCurveTo(0.34, 0.28, 0, 0.18); s.lineTo(0, -0.1);
        const e = new THREE.ExtrudeGeometry(s, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 });
        e.translate(0, 0, -0.007);
        e.rotateY(Math.PI / 2);
        e.rotateX(-Math.PI / 2);
        return e;
      });
      const axm = mesh(ax, M.steel(), 0, 0.02, 1.2); axm.rotation.z = Math.PI / 2; g.add(axm);
      g.add(mesh(cone(0.03, 0.3, 6), M.steel(), 0, 0, 1.55, Math.PI / 2, 0, 0));
      g.add(mesh(cone(0.02, 0.16, 5), M.steel(), 0, -0.1, 1.25, 0, 0, Math.PI));
      return g;
    },
    guardSword: () => sword({ key: "guard", len: 0.85, w: 0.052, bladeMat: M.steel(), guardMat: M.iron(), gripMat: M.leather(), guardW: 0.2 }),
    spear: () => {
      const g = new THREE.Group();
      g.add(mesh(cylZ(0.02, 0.02, 2.2, 8), M.woodDark(), 0, 0, -0.8));
      g.add(mesh(bladeGeo("spearTip", 0.32, 0.07, 0.012), M.steel(), 0, 0, 1.38));
      g.add(mesh(geo("spearRing", () => new THREE.TorusGeometry(0.026, 0.008, 5, 12)), M.gold(), 0, 0, 1.36));
      return g;
    },
    shadowSpear: () => {
      const g = new THREE.Group();
      g.add(mesh(cylZ(0.02, 0.02, 2.0, 6), M.shadow(), 0, 0, -0.7));
      g.add(mesh(bladeGeo("shadowTip", 0.4, 0.08, 0.012), M.shadow(), 0, 0, 1.28));
      return g;
    },
    kingStaff: () => { const s = staff(false); s.scale.setScalar(1.15); return s; },
    rookieSword: () => sword({ key: "rookie", len: 0.7, w: 0.07, thick: 0.02, round: true, bladeMat: M.wood(), guardMat: M.wood(), gripMat: M.cloth() }),
    torch: () => {
      const g = new THREE.Group();
      g.add(mesh(cylZ(0.025, 0.035, 0.6, 8), M.woodDark(), 0, 0, -0.1));
      const fl = new THREE.Mesh(sph(0.06, 8, 6), mat("flame", () => new THREE.MeshBasicMaterial({ color: 0xffa040 })));
      fl.position.set(0, 0, 0.55); fl.scale.set(1, 1, 1.6); g.add(fl);
      return g;
    },
  };

  function shield(kind) {
    const g = new THREE.Group();
    if (kind === "round") {
      g.add(mesh(geo("roundShield", () => { const c = new THREE.CylinderGeometry(0.36, 0.36, 0.04, 28); c.rotateX(Math.PI / 2); return c; }), M.shieldWood()));
      g.add(mesh(geo("roundRim", () => new THREE.TorusGeometry(0.36, 0.018, 6, 32)), M.iron(), 0, 0, 0.0));
      g.add(mesh(geo("boss", () => new THREE.SphereGeometry(0.08, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2)), M.iron(), 0, 0, 0.02));
      const glint = new THREE.Sprite(mat("glintMat", () => new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending, map: glowTexture() })));
      glint.scale.set(0.5, 0.5, 0.5); glint.position.set(0.12, 0.15, 0.06);
      g.add(glint); g.userData.glint = glint;
    } else if (kind === "kite" || kind === "shadowKite") {
      const kg = geo("kiteShield", () => {
        const s = new THREE.Shape();
        s.moveTo(0, 0.42); s.quadraticCurveTo(0.3, 0.42, 0.3, 0.2); s.quadraticCurveTo(0.28, -0.2, 0, -0.5);
        s.quadraticCurveTo(-0.28, -0.2, -0.3, 0.2); s.quadraticCurveTo(-0.3, 0.42, 0, 0.42);
        const e = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 });
        e.translate(0, 0, -0.017);
        return e;
      });
      g.add(mesh(kg, kind === "kite" ? M.royalWhite() : M.shadow()));
      if (kind === "kite") {
        g.add(mesh(boxG(0.05, 0.75, 0.02), M.gold(), 0, -0.04, 0.035));
        g.add(mesh(boxG(0.42, 0.05, 0.02), M.gold(), 0, 0.18, 0.035));
      }
    }
    return g;
  }

  let glowT = null;
  function glowTexture() {
    if (glowT || typeof document === "undefined") return glowT;
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d");
    const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.3, "rgba(255,255,255,0.4)"); grd.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
    // star streaks
    x.globalCompositeOperation = "lighter"; x.fillStyle = "rgba(255,255,255,0.6)";
    x.fillRect(31, 0, 2, 64); x.fillRect(0, 31, 64, 2);
    glowT = new THREE.CanvasTexture(c); glowT.colorSpace = THREE.SRGBColorSpace;
    return glowT;
  }

  function handItem(id) {
    const b = builders[id];
    if (!b) return null;
    const inner = b();
    const w = wrap(inner);
    w.userData = inner.userData;
    w.name = "item:" + id;
    return w;
  }
  function enemyWeapon(kind) {
    const b = enemyBuilders[kind];
    if (!b) return null;
    const inner = b();
    const w = wrap(inner);
    w.userData = inner.userData;
    return w;
  }

  return { handItem, enemyWeapon, armorBody, charmMesh, crown, shield, glowTexture, materials: M };
}
