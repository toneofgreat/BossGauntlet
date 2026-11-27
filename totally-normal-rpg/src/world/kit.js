// kit.js - WORLD's build kit: world-scaled-UV primitives, a per-zone/per-layer/per-material geometry merger,
// instancing, yaw frames shared by geometry + colliders, canvas text textures, shader-driven point systems
// (chimney smoke, torch flames, mist, motes: zero CPU per frame) and the depth "punch" used for cave mouths and
// the trapdoor (terrain is a heightfield; holes are faked by resetting depth inside the opening).
// Everything here runs at init; nothing allocates per frame.

export function createKit(ctx) {
  const THREE = ctx.THREE;
  const engine = ctx.engine || {};
  const TAU = Math.PI * 2;

  // ------------------------------------------------------------------ materials
  const matCache = new Map();
  const fallbackCol = {
    grass: "#5f8a3c", dirt: "#7a5e3e", rock: "#8a8780", sand: "#d8c49a", bark: "#5a4330", leaves: "#476b2e",
    woodPlank: "#9a7449", woodDark: "#4e3826", thatch: "#b89a5a", roofTile: "#8e4a33", stoneBrick: "#8f8a80",
    cobble: "#7d786e", plaster: "#e6dcc6", clothRed: "#9c2a26", clothBlue: "#2c4a7e", clothWhite: "#e8e4da",
    clothGreen: "#3f6a3a", leather: "#6b4a2e", iron: "#7b7f86", gold: "#d4a537", cheese: "#f2c84b", furRat: "#6d5f52",
    furCat: "#8a7a6a", skin: "#e0b090", hair: "#3a2a1a", obsidian: "#0b0b10", ink: "#050507", glassBlack: "#141a20",
    portal: "#1a0f2a", bone: "#e8e0cc", cactus: "#4f7a45", straw: "#d7b866", paper: "#efe6cf", cardboard: "#a58256",
    rust: "#8a4a2a",
  };
  function mat(name, opts) {
    const em = engine.materials;
    if (em && typeof em.get === "function") {
      try {
        const base = em.get(name);
        if (base && !(opts && opts.color != null)) return base;
        if (base) return tinted(name, base, opts.color);
      } catch (e) { console.warn("[world] material", name, e); }
    }
    const key = name + "|" + (opts && opts.color || "");
    let m = matCache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: (opts && opts.color) || fallbackCol[name] || "#888", roughness: 0.85 });
      matCache.set(key, m);
    }
    return m;
  }
  // ENGINE textures carry their own albedo and material.color multiplies it, so a requested colour is turned into a
  // tint relative to the texture's mean colour (the surface then averages to the colour asked for).
  const meanCache = new Map(), tintCache = new Map();
  function texMean(name, base) {
    let c = meanCache.get(name);
    if (c) return c;
    c = new THREE.Color(1, 1, 1);
    try {
      const img = base.map && base.map.image;
      if (img && typeof document !== "undefined") {
        const cv = document.createElement("canvas"); cv.width = cv.height = 8;
        const g = cv.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, 0, 0, 8, 8);
        const d = g.getImageData(0, 0, 8, 8).data;
        let r = 0, gg = 0, b = 0;
        const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        for (let i = 0; i < d.length; i += 4) { r += lin(d[i]); gg += lin(d[i + 1]); b += lin(d[i + 2]); }
        const n = d.length / 4;
        c.setRGB(Math.max(0.03, r / n), Math.max(0.03, gg / n), Math.max(0.03, b / n));
        c.multiply(base.color);
      }
    } catch (e) { /* keep white */ }
    meanCache.set(name, c);
    return c;
  }
  function tinted(name, base, color) {
    const key = name + "|" + color;
    let m = tintCache.get(key);
    if (!m) {
      const want = new THREE.Color(color), mean = texMean(name, base);
      m = base.clone();
      m.color.setRGB(Math.min(4, want.r / mean.r), Math.min(4, want.g / mean.g), Math.min(4, want.b / mean.b));
      m.name = base.name;
      tintCache.set(key, m);
    }
    return m;
  }
  const own = new Map();
  function custom(key, make) { let m = own.get(key); if (!m) { m = make(); own.set(key, m); } return m; }
  const glass = () => custom("glass", () => new THREE.MeshStandardMaterial({ color: "#2a3540", roughness: 0.06, metalness: 0.55, envMapIntensity: 1.2 }));
  const glow = (hex, intensity) => custom("glow" + hex + (intensity || 1), () => {
    const m = new THREE.MeshBasicMaterial({ color: hex, toneMapped: false });
    if (intensity) m.color.multiplyScalar(intensity);
    return m;
  });
  const flat = (hex, rough, metal) => custom("flat" + hex + (rough || "") + (metal || ""), () =>
    new THREE.MeshStandardMaterial({ color: hex, roughness: rough == null ? 0.85 : rough, metalness: metal || 0 }));

  // ------------------------------------------------------------------ geometry
  const geoCache = new Map();
  function cached(key, make) { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; }

  // box whose UVs are in "texture units" (default 1 unit = 2 m) so merged walls tile evenly
  function boxGeo(w, h, d, tex) {
    tex = tex || 2;
    return cached(`b${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${tex}`, () => {
      const g = new THREE.BoxGeometry(w, h, d);
      const uv = g.attributes.uv;
      const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let f = 0; f < 6; f++) {
        for (let i = 0; i < 4; i++) {
          const k = f * 4 + i;
          uv.setXY(k, uv.getX(k) * sizes[f][0] / tex, uv.getY(k) * sizes[f][1] / tex);
        }
      }
      return g;
    });
  }
  function cylGeo(rt, rb, h, seg, tex, open) {
    seg = seg || 12; tex = tex || 2;
    return cached(`c${rt}|${rb}|${h}|${seg}|${tex}|${open ? 1 : 0}`, () => {
      const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!open);
      const uv = g.attributes.uv, circ = TAU * Math.max(rt, rb);
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / tex, uv.getY(i) * h / tex);
      return g;
    });
  }
  const sphereGeo = (r, ws, hs) => cached(`s${r}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws || 12, hs || 8));
  const coneGeo = (r, h, seg) => cached(`k${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg || 12));
  const torusGeo = (r, t, rs, ts, arc) => cached(`t${r}|${t}|${rs}|${ts}|${arc || 0}`, () => new THREE.TorusGeometry(r, t, rs || 8, ts || 24, arc || TAU));
  function latheGeo(key, pts, seg) {
    return cached("l" + key, () => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg || 16));
  }
  // triangular prism (gable): triangle in the XY plane (base w at y=0, apex h at x=0), extruded along Z by d
  function prismGeo(w, h, d, tex) {
    tex = tex || 2;
    return cached(`p${w}|${h}|${d}|${tex}`, () => {
      const hw = w / 2, hd = d / 2;
      const v = [
        // front (+z)
        -hw, 0, hd, hw, 0, hd, 0, h, hd,
        // back (-z)
        hw, 0, -hd, -hw, 0, -hd, 0, h, -hd,
        // left slope
        -hw, 0, -hd, -hw, 0, hd, 0, h, hd, -hw, 0, -hd, 0, h, hd, 0, h, -hd,
        // right slope
        hw, 0, hd, hw, 0, -hd, 0, h, -hd, hw, 0, hd, 0, h, -hd, 0, h, hd,
        // bottom
        -hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, -hd, hw, 0, hd, -hw, 0, hd,
      ];
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
      const uv = [];
      for (let i = 0; i < v.length; i += 3) {
        const x = v[i], y = v[i + 1], z = v[i + 2];
        const face = (i / 9) | 0;
        if (face < 2) uv.push((x + hw) / tex, y / tex);
        else uv.push((z + hd) / tex, (face < 6 ? (Math.abs(x) + y) : x + hw) / tex);
      }
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      return g;
    });
  }
  // lumpy rock: displaced icosahedron, flattened a bit, deterministic per seed
  function rockGeo(seed, detail) {
    return cached(`r${seed}|${detail || 1}`, () => {
      const g = new THREE.IcosahedronGeometry(1, detail || 1);
      const p = g.attributes.position;
      const s1 = seed * 12.9898, s2 = seed * 78.233;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = Math.sin(x * 3.1 + s1) * Math.cos(z * 2.7 + s2) * 0.18 + Math.sin(y * 4.3 + s1 * 0.5) * 0.1
          + Math.sin((x + z) * 7.0 + s2) * 0.04;
        const k = 1 + n;
        p.setXYZ(i, x * k, y * k * 0.72, z * k);
      }
      // weld-free: recompute normals then make it non-indexed-safe by keeping the index
      const ng = g.index ? g : g;
      ng.computeVertexNormals();
      return ng;
    });
  }
  function planeGeo(w, h, tex) {
    tex = tex || 0;
    return cached(`pl${w}|${h}|${tex}`, () => {
      const g = new THREE.PlaneGeometry(w, h);
      if (tex) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tex, uv.getY(i) * h / tex); }
      return g;
    });
  }
  function circleGeo(r, seg, tex) {
    return cached(`ci${r}|${seg}|${tex || 0}`, () => {
      const g = new THREE.CircleGeometry(r, seg || 32);
      g.rotateX(-Math.PI / 2);
      if (tex) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * r / tex, uv.getY(i) * 2 * r / tex); }
      return g;
    });
  }
  function ringGeo(r0, r1, seg, tex) {
    return cached(`rg${r0}|${r1}|${seg}`, () => {
      const g = new THREE.RingGeometry(r0, r1, seg || 48, 1);
      g.rotateX(-Math.PI / 2);
      const uv = g.attributes.uv, p = g.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / (tex || 2), p.getZ(i) / (tex || 2));
      return g;
    });
  }

  // merge [{g, m:Matrix4}] into one indexed BufferGeometry (position, normal, uv)
  const _nm = new THREE.Matrix3(), _v = new THREE.Vector3();
  // Fold colour variants of one look (same textures / roughness) into a single vertex-coloured material:
  // a zone layer then costs one draw call per surface type instead of one per tint.
  const vcMats = new Map(), icMats = new Map();
  function vcKey(m) {
    if (!m || !m.isMeshStandardMaterial || m.transparent || m.vertexColors || m.userData.noMerge) return null;
    if (m.map && !/^mat:/.test(m.name || "")) return null;          // canvas/texMat materials stay as they are
    const e = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0 ? m.emissiveIntensity : 0;
    return [m.map ? m.map.uuid : "-", m.normalMap ? m.normalMap.uuid : "-", m.roughnessMap ? m.roughnessMap.uuid : "-",
      m.roughness.toFixed(2), m.metalness.toFixed(2), e, m.side, m.normalScale ? m.normalScale.x : 1].join("|");
  }
  function consolidate(batches) {
    const out = [], groups = new Map();
    for (const [m, items] of batches) {
      const k = vcKey(m);
      if (!k) { out.push([m, items, false]); continue; }
      let g = groups.get(k);
      if (!g) {
        let vm = vcMats.get(k);
        if (!vm) { vm = m.clone(); vm.vertexColors = true; vm.color.setRGB(1, 1, 1); vm.name = (m.name || "flat") + "+vc"; vcMats.set(k, vm); }
        g = { vm, items: [] }; groups.set(k, g);
      }
      for (const it of items) { it.col = m.color; g.items.push(it); }
    }
    for (const g of groups.values()) out.push([g.vm, g.items, true]);
    return out;
  }
  // Collapse a prop Group's static child meshes into one mesh per (consolidated) material. The Group itself stays
  // (it is the animated pivot); only use on groups whose children nobody references.
  function bake(group) {
    group.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const batches = new Map(), kill = [];
    let cast = false;
    group.traverse((o) => {
      if (!o.isMesh || o.userData.keep || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || o.material.isShaderMaterial || o.renderOrder) return;
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      let b = batches.get(o.material); if (!b) { b = []; batches.set(o.material, b); }
      b.push({ g: o.geometry, m });
      cast = cast || o.castShadow;
      kill.push(o);
    });
    if (kill.length < 2) return group;
    for (const o of kill) o.parent.remove(o);
    for (const [m, items, vc] of consolidate(batches)) {
      const me = new THREE.Mesh(merge(items, vc), m);
      me.castShadow = cast; me.receiveShadow = true;
      group.add(me);
    }
    return group;
  }
  function merge(items, withColor) {
    let nv = 0, ni = 0;
    for (const it of items) {
      const g = it.g;
      nv += g.attributes.position.count;
      ni += g.index ? g.index.count : g.attributes.position.count;
    }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uvs = new Float32Array(nv * 2);
    const cols = withColor ? new Float32Array(nv * 3) : null;
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    for (const it of items) {
      const g = it.g, m = it.m, n = g.attributes.position.count;
      if (!g.attributes.normal) g.computeVertexNormals();
      const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
      _nm.getNormalMatrix(m);
      const flip = m.determinant() < 0;
      for (let i = 0; i < n; i++) {
        _v.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(m);
        pos[(vo + i) * 3] = _v.x; pos[(vo + i) * 3 + 1] = _v.y; pos[(vo + i) * 3 + 2] = _v.z;
        _v.set(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(_nm).normalize();
        nor[(vo + i) * 3] = _v.x; nor[(vo + i) * 3 + 1] = _v.y; nor[(vo + i) * 3 + 2] = _v.z;
        if (U) { uvs[(vo + i) * 2] = U.getX(i) + (it.du || 0); uvs[(vo + i) * 2 + 1] = U.getY(i) + (it.dv || 0); }
        if (cols) { const c = it.col; cols[(vo + i) * 3] = c.r; cols[(vo + i) * 3 + 1] = c.g; cols[(vo + i) * 3 + 2] = c.b; }
      }
      if (g.index) {
        const I = g.index.array;
        for (let i = 0; i < I.length; i += 3) {
          if (flip) { idx[io++] = I[i] + vo; idx[io++] = I[i + 2] + vo; idx[io++] = I[i + 1] + vo; }
          else { idx[io++] = I[i] + vo; idx[io++] = I[i + 1] + vo; idx[io++] = I[i + 2] + vo; }
        }
      } else {
        for (let i = 0; i < n; i += 3) {
          if (flip) { idx[io++] = vo + i; idx[io++] = vo + i + 2; idx[io++] = vo + i + 1; }
          else { idx[io++] = vo + i; idx[io++] = vo + i + 1; idx[io++] = vo + i + 2; }
        }
      }
      vo += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    out.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    if (cols) out.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    out.computeBoundingBox();
    return out;
  }

  // ------------------------------------------------------------------ text / canvas textures
  const texCache = new Map();
  function canvasTex(key, w, h, draw, opts) {
    let t = texCache.get(key);
    if (t) return t;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    draw(g, w, h);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (opts && opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    texCache.set(key, t);
    return t;
  }
  // carved / painted sign board text
  function signTex(lines, o) {
    o = o || {};
    const W = o.w || 512, H = o.h || 256;
    return canvasTex("sign|" + lines.join("|") + "|" + (o.style || "wood") + W + "x" + H, W, H, (g) => {
      const style = o.style || "wood";
      if (style === "wood") {
        g.fillStyle = "#7a5634"; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 40; i++) {
          g.strokeStyle = `rgba(${40 + (i * 7) % 30},${25 + (i * 5) % 20},10,${0.15 + (i % 5) * 0.04})`;
          g.lineWidth = 1 + (i % 3);
          g.beginPath(); const y = (i / 40) * H + Math.sin(i * 3.1) * 4;
          g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + 6, W * 0.6, y - 5, W, y + 3); g.stroke();
        }
        for (let p = 1; p < 3; p++) { g.fillStyle = "rgba(30,18,8,0.5)"; g.fillRect(0, (H * p) / 3 - 2, W, 3); }
        g.strokeStyle = "#3c2814"; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, H - 10);
      } else if (style === "stone") {
        g.fillStyle = "#9a958c"; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${i % 2 ? 60 : 200},${i % 2 ? 58 : 196},${i % 2 ? 55 : 188},0.08)`; g.fillRect((i * 97) % W, (i * 57) % H, 3, 3); }
      } else if (style === "paper") {
        g.fillStyle = "#e9dfc4"; g.fillRect(0, 0, W, H);
        g.fillStyle = "rgba(120,90,40,0.12)"; for (let i = 0; i < 60; i++) g.fillRect((i * 131) % W, (i * 71) % H, 18, 2);
      }
      const n = lines.length;
      const fs = o.size || Math.min(H / (n + 0.8), (W * 1.6) / Math.max(...lines.map((l) => l.length + 1)));
      g.textAlign = "center"; g.textBaseline = "middle";
      g.font = `${o.weight || "bold"} ${fs | 0}px Georgia, "Times New Roman", serif`;
      for (let i = 0; i < n; i++) {
        const y = H / 2 + (i - (n - 1) / 2) * fs * 1.12;
        if (style === "stone") {
          g.fillStyle = "rgba(255,255,255,0.35)"; g.fillText(lines[i], W / 2 + 1.5, y + 1.5);
          g.fillStyle = "#2e2b27"; g.fillText(lines[i], W / 2, y);
        } else if (style === "paper") {
          g.fillStyle = "#2a2218"; g.fillText(lines[i], W / 2, y);
        } else {
          g.fillStyle = "rgba(0,0,0,0.55)"; g.fillText(lines[i], W / 2 + 2, y + 2);
          g.fillStyle = o.fg || "#f1e3c0"; g.fillText(lines[i], W / 2, y);
        }
      }
    });
  }
  const texMat = (key, tex, o) => custom("tm|" + key, () => new THREE.MeshStandardMaterial(Object.assign({ map: tex, roughness: 0.9 }, o || {})));

  // ------------------------------------------------------------------ shader point systems
  // kind: "smoke" | "flame" | "mist" | "mote" | "ember". Each particle = one emitter slot; motion is computed in
  // the vertex shader from (time + seed), so the CPU only updates one uniform per frame.
  const pointSystems = [];
  const timeU = { value: 0 };
  const scaleU = { value: 620 };   // px per metre at distance 1 (updated from the viewport in tick)
  const VERT = `
    uniform float uTime; uniform float uScale; uniform int uKind;
    attribute vec4 aSeed; // x: phase, y: size, z: lifetime, w: spread
    varying float vA; varying float vK;
    void main(){
      vec3 p = position;
      float life = aSeed.z;
      float t = mod(uTime + aSeed.x * life, life) / life;
      float sz = aSeed.y;
      vK = t;
      if (uKind == 0) { // smoke: rises, drifts with wind, grows, fades
        p += vec3(t * 2.2 * aSeed.w + sin(uTime*0.7 + aSeed.x*6.0)*0.25, t * 6.5, t * 1.2 * aSeed.w);
        sz *= 0.6 + t * 2.6; vA = smoothstep(0.0, 0.12, t) * (1.0 - t) * 0.55;
      } else if (uKind == 1) { // flame flicker
        p.y += t * 0.35 * aSeed.w; p.x += sin(uTime*13.0 + aSeed.x*9.0)*0.025; p.z += cos(uTime*11.0 + aSeed.x*7.0)*0.025;
        sz *= (1.0 - t*0.7) * (0.85 + 0.15*sin(uTime*21.0 + aSeed.x*30.0)); vA = (1.0 - t);
      } else if (uKind == 2) { // mist: slow billow around the emitter
        p += vec3(sin(t*6.283 + aSeed.x*4.0)*aSeed.w, t*2.5, cos(t*6.283 + aSeed.x*3.0)*aSeed.w);
        sz *= 0.8 + t*1.6; vA = sin(t*3.14159) * 0.35;
      } else { // motes / embers: slow float
        p += vec3(sin(uTime*0.3 + aSeed.x*5.0)*aSeed.w, sin(uTime*0.2 + aSeed.x*3.0)*aSeed.w*0.5 + t*aSeed.w, cos(uTime*0.25 + aSeed.x*4.0)*aSeed.w);
        vA = sin(t*3.14159) * 0.8;
      }
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = sz * uScale / max(0.5, -mv.z);
    }`;
  const FRAG = `
    uniform vec3 uColor; uniform vec3 uColor2; uniform int uKind; uniform float uOpacity;
    varying float vA; varying float vK;
    void main(){
      vec2 d = gl_PointCoord - 0.5; float r = length(d);
      if (r > 0.5) discard;
      float s = smoothstep(0.5, 0.0, r);
      vec3 c = mix(uColor, uColor2, vK);
      if (uKind == 1) { s = pow(s, 1.6); c = mix(uColor2, uColor, smoothstep(0.35, 0.0, r)); }
      gl_FragColor = vec4(c, s * vA * uOpacity);
    }`;
  function points(kind, opts) {
    opts = opts || {};
    const K = { smoke: 0, flame: 1, mist: 2, mote: 3, ember: 3 }[kind] || 0;
    const pos = [], seed = [];
    const api = {
      kind,
      add(x, y, z, n, size, life, spread) {
        n = n || 1;
        for (let i = 0; i < n; i++) {
          pos.push(x, y, z);
          seed.push(Math.random(), (size || 1) * (0.7 + Math.random() * 0.6), (life || 4) * (0.8 + Math.random() * 0.4), spread == null ? 1 : spread);
        }
      },
      count() { return pos.length / 3; },
      build(parent) {
        if (!pos.length) return null;
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 4));
        g.computeBoundingSphere();
        g.boundingSphere.radius += 10;
        const m = new THREE.ShaderMaterial({
          uniforms: {
            uTime: timeU, uScale: scaleU, uKind: { value: K },
            uColor: { value: new THREE.Color(opts.color || (K === 1 ? "#ffd27a" : "#d8d4cc")) },
            uColor2: { value: new THREE.Color(opts.color2 || (K === 1 ? "#ff5a10" : "#a8a49c")) },
            uOpacity: { value: opts.opacity == null ? 1 : opts.opacity },
          },
          vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
          blending: K === 1 || kind === "ember" ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
        });
        const p = new THREE.Points(g, m);
        p.frustumCulled = true;
        p.renderOrder = 5;
        p.userData.mat = m;
        parent.add(p);
        api.object = p;
        pointSystems.push(p);
        return p;
      },
    };
    return api;
  }

  // ------------------------------------------------------------------ depth punch (fake terrain holes)
  let reversed = false;
  try { reversed = !!(ctx.renderer && ctx.renderer.capabilities && ctx.renderer.capabilities.reversedDepthBuffer); } catch (e) { /* */ }
  const punchMat = custom("punch", () => new THREE.ShaderMaterial({
    vertexShader: "void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `void main(){ gl_FragColor = vec4(0.0); gl_FragDepth = ${reversed ? "0.0" : "1.0"}; }`,
    colorWrite: false, depthWrite: true, side: THREE.DoubleSide,
  }));

  const shadowOnly = custom("shadowOnly", () => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));

  // ------------------------------------------------------------------ zone kit (frames + layers)
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, "YXZ");
  const _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const physics = engine.physics;
  const lodGroups = [];       // { group, anchor:{x,y,z}, dist }
  const cycleGroups = [];     // { group, cycle: 0|1 }

  function zone(id, root) {
    const frames = [{ x: 0, y: 0, z: 0, yaw: 0 }];
    const layers = new Map();
    const colliders = [];
    const tag = "w." + id;
    function F() { return frames[frames.length - 1]; }
    function toWorld(lx, ly, lz, out) {
      const f = F(), c = Math.cos(f.yaw), s = Math.sin(f.yaw);
      out.x = f.x + lx * c + lz * s; out.y = f.y + ly; out.z = f.z - lx * s + lz * c;
      return out;
    }
    const tmp = { x: 0, y: 0, z: 0 };
    function layer(name, o) {
      let L = layers.get(name);
      if (!L) {
        o = o || {};
        const preset = {
          main: { cast: true, receive: true }, flat: { cast: false, receive: true }, small: { cast: false, receive: true, hideDist: 110 },
          detail: { cast: true, receive: true, hideDist: 55 }, signs: { cast: false, receive: true, hideDist: 75 }, glow: { cast: false, receive: false },
          ng: { cast: true, receive: true, cycle: 1 }, c0: { cast: true, receive: true, cycle: 0 },
          ngGlow: { cast: false, receive: false, cycle: 1 },
        }[name] || {};
        o = Object.assign({}, preset, o);
        const group = new THREE.Group();
        group.name = id + ":" + name;
        root.add(group);
        L = { name, o, group, batches: new Map(), inst: new Map() };
        layers.set(name, L);
        if (o.hideDist) lodGroups.push({ group, anchor: o.anchor || null, dist: o.hideDist, zone: id, bounds: null });
        if (o.cycle != null) cycleGroups.push({ group, cycle: o.cycle });
      }
      return L;
    }
    function matrixFor(x, y, z, o) {
      const f = F();
      toWorld(x, y, z, tmp);
      _e.set(o && o.rx || 0, f.yaw + (o && o.ry || 0), o && o.rz || 0, "YXZ");
      _q.setFromEuler(_e);
      _p.set(tmp.x, tmp.y, tmp.z);
      _s.set(o && o.sx || 1, o && o.sy || 1, o && o.sz || 1);
      return new THREE.Matrix4().compose(_p, _q, _s);
    }
    function addGeo(g, m, x, y, z, o) {
      if (!m) return;
      let ln = (o && o.layer) || "main";
      // painted canvas surfaces (signs, boards, posters) only matter up close
      if (ln === "main" && m.map && !/^mat:/.test(m.name || "") && !m.transparent) ln = "signs";
      const L = layer(ln);
      let b = L.batches.get(m);
      if (!b) { b = []; L.batches.set(m, b); }
      b.push({ g, m: matrixFor(x, y, z, o), du: o && o.du, dv: o && o.dv });
    }
    function inst(g, m, x, y, z, o) {
      const L = layer((o && o.layer) || "main");
      const key = g.uuid + "|" + m.uuid;
      let b = L.inst.get(key);
      if (!b) { b = { g, m, list: [] }; L.inst.set(key, b); }
      b.list.push(matrixFor(x, y, z, o));
    }
    function colBox(x, y, z, w, h, d, o) {
      if (!physics || !physics.addBox) return -1;
      toWorld(x, y, z, tmp);
      try {
        const cid = physics.addBox({ center: { x: tmp.x, y: tmp.y, z: tmp.z }, size: { x: w, y: h, z: d }, yaw: F().yaw + (o && o.ry || 0),
          tag: (o && o.tag) || tag, walkable: o && o.walk === false ? false : true, surface: (o && o.surface) || "stone" });
        colliders.push(cid);
        return cid;
      } catch (e) { console.warn("[world] addBox", e); return -1; }
    }
    function colCyl(x, y, z, r, h, o) {
      if (!physics || !physics.addCylinder) return -1;
      toWorld(x, y, z, tmp);
      try {
        const cid = physics.addCylinder({ base: { x: tmp.x, y: tmp.y, z: tmp.z }, radius: r, height: h, tag: (o && o.tag) || tag, surface: (o && o.surface) || "wood" });
        colliders.push(cid);
        return cid;
      } catch (e) { console.warn("[world] addCylinder", e); return -1; }
    }
    function ramp(x0, y0, z0, x1, y1, z1, width, surface) {
      if (!physics || !physics.addRamp) return -1;
      const a = toWorld(x0, y0, z0, { x: 0, y: 0, z: 0 }), b = toWorld(x1, y1, z1, { x: 0, y: 0, z: 0 });
      try { const cid = physics.addRamp({ from: a, to: b, width, surface: surface || "wood" }); colliders.push(cid); return cid; }
      catch (e) { console.warn("[world] addRamp", e); return -1; }
    }
    const z = {
      id, root, tag, colliders,
      frame(x, y, zz, yaw, fn) {
        const w = toWorld(x, y, zz, { x: 0, y: 0, z: 0 });
        frames.push({ x: w.x, y: w.y, z: w.z, yaw: F().yaw + (yaw || 0) });
        try { fn(); } finally { frames.pop(); }
      },
      world(x, y, zz) { return toWorld(x, y, zz, { x: 0, y: 0, z: 0 }); },
      yaw() { return F().yaw; },
      layer,
      // visual box (+ collider when o.col)
      box(m, x, y, zz, w, h, d, o) {
        addGeo(boxGeo(w, h, d, o && o.tex), m, x, y, zz, o);
        if (o && o.col) colBox(x, y, zz, w, h, d, o);
      },
      cyl(m, x, y, zz, rt, rb, h, o) {
        addGeo(cylGeo(rt, rb, h, o && o.seg, o && o.tex, o && o.open), m, x, y, zz, o);
        if (o && o.col) colCyl(x, y - h / 2, zz, Math.max(rt, rb), h, o);
      },
      geo(g, m, x, y, zz, o) { addGeo(g, m, x, y, zz, o); },
      inst(g, m, x, y, zz, o) { inst(g, m, x, y, zz, o); },
      colBox, colCyl, ramp,
      // a loose Object3D placed in this frame (for animated props): returns the object
      object(obj, x, y, zz, ry, parent) {
        toWorld(x, y, zz, tmp);
        obj.position.set(tmp.x, tmp.y, tmp.z);
        obj.rotation.y = F().yaw + (ry || 0);
        (parent || root).add(obj);
        return obj;
      },
      mesh(g, m, x, y, zz, o, parent) {
        const me = new THREE.Mesh(g, m);
        z.object(me, x, y, zz, o && o.ry, parent);
        if (o) { me.rotation.x = o.rx || 0; me.rotation.z = o.rz || 0; if (o.s) me.scale.setScalar(o.s); }
        me.castShadow = !!(o && o.cast); me.receiveShadow = true;
        return me;
      },
      exclude(x, zz, r) {
        const v = engine.vegetation;
        if (v && v.exclude) { toWorld(x, 0, zz, tmp); try { v.exclude(tmp.x, tmp.z, r); } catch (e) { /* */ } }
      },
      excludeRect(x0, z0, x1, z1) {
        const v = engine.vegetation;
        if (v && v.excludeRect) { try { v.excludeRect(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)); } catch (e) { /* */ } }
      },
      // invisible box that only casts shadows (keeps sunlight out of underground rooms)
      shadowLid(x, y, zz, w, h, d, ry) {
        const me = new THREE.Mesh(boxGeo(w, h, d), shadowOnly);
        z.object(me, x, y, zz, ry || 0);
        me.castShadow = true; me.receiveShadow = false;
        return me;
      },
      punch(g, x, y, zz, o) {
        const me = new THREE.Mesh(g, punchMat);
        z.object(me, x, y, zz, o && o.ry);
        if (o) { me.rotation.x = o.rx || 0; me.rotation.z = o.rz || 0; }
        me.renderOrder = 10;
        me.frustumCulled = true;
        return me;
      },
      finish() {
        for (const L of layers.values()) {
          // few-instance batches are cheaper merged; the rest share one InstancedMesh per geometry + look
          const instGroups = new Map();
          for (const b of L.inst.values()) {
            if (b.list.length <= 6) {
              let arr = L.batches.get(b.m); if (!arr) { arr = []; L.batches.set(b.m, arr); }
              for (const mx of b.list) arr.push({ g: b.g, m: mx });
              continue;
            }
            const k = vcKey(b.m);
            const gk = b.g.uuid + "|" + (k || b.m.uuid);
            let gg = instGroups.get(gk);
            if (!gg) {
              let im = b.m;
              if (k) { im = icMats.get(k); if (!im) { im = b.m.clone(); im.color.setRGB(1, 1, 1); im.name = (b.m.name || "flat") + "+ic"; icMats.set(k, im); } }
              gg = { g: b.g, m: im, list: [], cols: k ? [] : null }; instGroups.set(gk, gg);
            }
            for (const mx of b.list) { gg.list.push(mx); if (gg.cols) gg.cols.push(b.m.color); }
          }
          L.inst = instGroups;
          for (const [m, items, vc] of consolidate(L.batches)) {
            // split huge batches to keep culling useful
            const chunks = [];
            let cur = [], verts = 0;
            for (const it of items) {
              const n = it.g.attributes.position.count;
              if (verts + n > 120000 && cur.length) { chunks.push(cur); cur = []; verts = 0; }
              cur.push(it); verts += n;
            }
            if (cur.length) chunks.push(cur);
            for (const ch of chunks) {
              const me = new THREE.Mesh(merge(ch, vc), m);
              me.castShadow = !!L.o.cast; me.receiveShadow = !!L.o.receive;
              if (L.o.renderOrder) me.renderOrder = L.o.renderOrder;
              me.matrixAutoUpdate = false; me.updateMatrix();
              L.group.add(me);
            }
          }
          for (const b of L.inst.values()) {
            const im = new THREE.InstancedMesh(b.g, b.m, b.list.length);
            for (let i = 0; i < b.list.length; i++) { im.setMatrixAt(i, b.list[i]); if (b.cols) im.setColorAt(i, b.cols[i]); }
            if (im.instanceColor) im.instanceColor.needsUpdate = true;
            im.instanceMatrix.needsUpdate = true;
            im.castShadow = !!L.o.cast; im.receiveShadow = !!L.o.receive;
            if (L.o.renderOrder) im.renderOrder = L.o.renderOrder;
            im.computeBoundingSphere();
            im.matrixAutoUpdate = false; im.updateMatrix();
            L.group.add(im);
          }
          L.batches.clear(); L.inst.clear();
          // LOD anchor defaults to the layer's own bounds centre
          for (const lg of lodGroups) {
            if (lg.group === L.group && !lg.anchor) {
              const box = new THREE.Box3().setFromObject(L.group);
              if (!box.isEmpty()) { const c = box.getCenter(new THREE.Vector3()); lg.anchor = { x: c.x, y: c.y, z: c.z }; lg.radius = box.getSize(new THREE.Vector3()).length() / 2; }
              else lg.anchor = { x: 0, y: 0, z: 0 };
            }
          }
        }
      },
    };
    return z;
  }

  // t: seconds; viewH: drawing-buffer height in px; fov: camera vertical fov in degrees
  function tick(t, viewH, fov) {
    timeU.value = t;
    if (viewH > 0 && fov > 0) scaleU.value = (viewH * 0.5) / Math.tan((fov * Math.PI) / 360);
  }

  return {
    THREE, mat, glass, glow, flat, custom, texMat, signTex, canvasTex,
    boxGeo, cylGeo, sphereGeo, coneGeo, torusGeo, latheGeo, prismGeo, rockGeo, planeGeo, circleGeo, ringGeo,
    merge, bake, zone, points, punchMat, timeU, tick, lodGroups, cycleGroups, pointSystems,
  };
}
