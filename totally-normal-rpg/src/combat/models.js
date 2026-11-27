// models.js - procedural enemy models.
//  * Quadrupeds (rats, golden rat, Rat King, Big Tom): one merged geometry per species with a per-vertex part id
//    and pivot; legs / head / tail / breathing are animated in the vertex shader from per-instance attributes, so a
//    whole herd of rats is ONE draw call. Fur look: strand texture + vertex-colour back/belly gradient + rim sheen.
//  * Humanoid enemies: ENGINE's createHumanoid (CONTRACT 5.9) dressed with weapons, shields, plates and extras.
//    If the engine humanoid is unavailable a compatible fallback humanoid (same API) is used.

const PART = { BODY: 0, HEAD: 1, EYE: 2, LEG0: 3, LEG1: 4, LEG2: 5, LEG3: 6, TAIL: 7 };

// ------------------------------------------------------------------------------------------------ geometry utils
function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function mergeParts(THREE, parts) {
  let nv = 0, ni = 0;
  for (const p of parts) {
    const g = p.geo.index ? p.geo : p.geo; // all builders return indexed geometries
    nv += g.attributes.position.count;
    ni += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
  const part = new Float32Array(nv), piv = new Float32Array(nv * 3);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (const p of parts) {
    const g = p.geo;
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i);
      pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
      nor[(vo + i) * 3] = n.x; nor[(vo + i) * 3 + 1] = n.y; nor[(vo + i) * 3 + 2] = n.z;
      if (U) { uv[(vo + i) * 2] = U.getX(i) * (p.uvScale ? p.uvScale[0] : 1); uv[(vo + i) * 2 + 1] = U.getY(i) * (p.uvScale ? p.uvScale[1] : 1); }
      const c = p.color(v, n);
      col[(vo + i) * 3] = c[0]; col[(vo + i) * 3 + 1] = c[1]; col[(vo + i) * 3 + 2] = c[2];
      part[vo + i] = p.part;
      piv[(vo + i) * 3] = p.pivot[0]; piv[(vo + i) * 3 + 1] = p.pivot[1]; piv[(vo + i) * 3 + 2] = p.pivot[2];
    }
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo; io += g.index.count; }
    else { for (let i = 0; i < P.count; i++) idx[io + i] = vo + i; io += P.count; }
    vo += P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.setAttribute("aPart", new THREE.BufferAttribute(part, 1));
  out.setAttribute("aPivot", new THREE.BufferAttribute(piv, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

function lathe(THREE, prof, seg) {
  const pts = prof.map((p) => new THREE.Vector2(Math.max(0.0005, p[0]), p[1]));
  return new THREE.LatheGeometry(pts, seg);
}

// quadruped species spec -> merged geometry (scale 1, faces +Z, feet at y = 0)
function buildQuadGeometry(THREE, s) {
  const parts = [];
  const C = s.colors;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const furCol = (v, n) => {
    const t = Math.min(1, Math.max(0, (n.y + 0.35) / 0.9));
    let c = mix(C.belly, C.back, t);
    if (s.stripes && n.y > -0.25) {
      const st = Math.sin(v.z * s.stripes + Math.sin(v.x * 30) * 0.8 + hash3(v.x, 0, v.z) * 0.6);
      if (st > 0.35) c = mix(c, C.stripe, 0.75 * Math.min(1, (st - 0.35) * 3));
    }
    const k = 0.88 + hash3(v.x * 9, v.y * 9, v.z * 9) * 0.22;
    return [c[0] * k, c[1] * k, c[2] * k];
  };
  const flat = (c) => () => c;

  // body: lathe along Z, flattened, arched back
  const L = s.bodyLen, R = s.bodyR, z0 = s.bodyZ0;
  const prof = [];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = R * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.55) * (1 - s.taper * t);
    prof.push([r, z0 + t * L]);
  }
  const body = lathe(THREE, prof, 20);
  body.rotateX(Math.PI / 2);
  body.scale(s.bodyW || 1, s.flat, 1);
  {
    const p = body.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i), y = p.getY(i);
      const t = (z - z0) / L;
      const hump = s.hump * Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
      p.setY(i, y + s.bodyY + (y > 0 ? hump : hump * 0.3));
    }
    body.computeVertexNormals();
  }
  parts.push({ geo: body, part: PART.BODY, pivot: [0, s.bodyY, z0 + L * 0.5], color: furCol, uvScale: [6, 3] });

  // head (built in head-local space around the neck pivot, then tilted)
  const hp = s.neck;
  const headM = new THREE.Matrix4().makeRotationX(s.headTilt).premultiply(new THREE.Matrix4().makeTranslation(hp[0], hp[1], hp[2]));
  const headParts = [];
  if (s.headStyle === "snout") {
    const hl = s.headLen, hr = s.headR;
    const hprof = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const r = hr * (t < 0.3 ? 0.75 + 0.25 * Math.sin(t / 0.3 * Math.PI / 2) : Math.pow(1 - (t - 0.3) / 0.7, 0.7) * 0.92 + 0.08 * (1 - t));
      hprof.push([r, -hl * 0.15 + t * hl]);
    }
    const head = lathe(THREE, hprof, 16); head.rotateX(Math.PI / 2); head.scale(1, 0.88, 1);
    headParts.push({ geo: head, part: PART.HEAD, color: furCol, uvScale: [3, 2] });
    const nose = new THREE.SphereGeometry(hr * 0.2, 8, 6); nose.translate(0, -hr * 0.05, hl * 0.86);
    headParts.push({ geo: nose, part: PART.HEAD, color: flat(C.nose) });
    for (const sx of [-1, 1]) {
      const ear = new THREE.SphereGeometry(hr * 0.6, 12, 8); ear.scale(1, 1, 0.28); ear.rotateY(sx * 0.5); ear.rotateZ(sx * -0.3);
      ear.translate(sx * hr * 0.62, hr * 0.85, hl * 0.12);
      headParts.push({ geo: ear, part: PART.HEAD, color: flat(C.ear) });
      const eye = new THREE.SphereGeometry(hr * 0.2, 10, 8); eye.translate(sx * hr * 0.52, hr * 0.32, hl * 0.42);
      headParts.push({ geo: eye, part: PART.EYE, color: flat(C.eye) });
      for (let w = -1; w <= 1; w++) {
        const wh = new THREE.CylinderGeometry(0.0018, 0.0008, hl * 0.75, 3); wh.rotateZ(Math.PI / 2);
        wh.rotateY(sx * (0.25 + w * 0.12)); wh.rotateX(w * 0.12);
        wh.translate(sx * hl * 0.34, -hr * 0.12 + w * 0.01, hl * 0.7);
        headParts.push({ geo: wh, part: PART.HEAD, color: flat(C.whisker) });
      }
    }
  } else {
    // cat: round skull + muzzle + pointy ears
    const hr = s.headR;
    const skull = new THREE.SphereGeometry(hr, 18, 14); skull.scale(1.05, 0.92, 1);
    headParts.push({ geo: skull, part: PART.HEAD, color: furCol, uvScale: [3, 2] });
    const muz = new THREE.SphereGeometry(hr * 0.5, 12, 10); muz.scale(1.25, 0.8, 0.9); muz.translate(0, -hr * 0.3, hr * 0.78);
    headParts.push({ geo: muz, part: PART.HEAD, color: (v, n) => mix(C.belly, C.back, 0.25) });
    const nose = new THREE.SphereGeometry(hr * 0.12, 8, 6); nose.scale(1.3, 0.8, 1); nose.translate(0, -hr * 0.12, hr * 1.12);
    headParts.push({ geo: nose, part: PART.HEAD, color: flat(C.nose) });
    for (const sx of [-1, 1]) {
      const ear = new THREE.ConeGeometry(hr * 0.42, hr * 0.75, 4); ear.scale(1, 1, 0.45); ear.rotateZ(sx * -0.35);
      ear.translate(sx * hr * 0.58, hr * 0.98, -hr * 0.05);
      headParts.push({ geo: ear, part: PART.HEAD, color: (v, n) => (n.z > 0.3 ? C.ear : C.back) });
      const eye = new THREE.SphereGeometry(hr * 0.17, 10, 8); eye.scale(1, 0.75, 0.6); eye.translate(sx * hr * 0.42, hr * 0.12, hr * 0.85);
      headParts.push({ geo: eye, part: PART.EYE, color: flat(C.eye) });
      for (let w = -1; w <= 1; w++) {
        const wh = new THREE.CylinderGeometry(0.002, 0.0008, hr * 1.6, 3); wh.rotateZ(Math.PI / 2);
        wh.rotateY(sx * (0.2 + w * 0.1)); wh.rotateX(w * 0.1);
        wh.translate(sx * hr * 0.9, -hr * 0.32 + w * 0.012, hr * 0.95);
        headParts.push({ geo: wh, part: PART.HEAD, color: flat(C.whisker) });
      }
    }
  }
  for (const hpp of headParts) {
    hpp.geo.applyMatrix4(headM);
    parts.push({ geo: hpp.geo, part: hpp.part, pivot: hp, color: hpp.color, uvScale: hpp.uvScale });
  }

  // legs
  const legs = [
    [s.legX, s.legFrontZ, PART.LEG0, s.frontLegR], [-s.legX, s.legFrontZ, PART.LEG1, s.frontLegR],
    [s.legX, s.legBackZ, PART.LEG2, s.backLegR], [-s.legX, s.legBackZ, PART.LEG3, s.backLegR],
  ];
  for (const lg of legs) {
    const top = s.hipY;
    const leg = new THREE.CylinderGeometry(lg[3] * 1.45, lg[3] * 0.5, top * 1.08, 9, 3);
    leg.translate(lg[0], top / 2, lg[1]);
    parts.push({ geo: leg, part: lg[2], pivot: [lg[0], top, lg[1]], color: furCol, uvScale: [1, 2] });
    const paw = new THREE.SphereGeometry(lg[3] * 0.75, 8, 6); paw.scale(1, 0.55, 1.5); paw.translate(lg[0], lg[3] * 0.35, lg[1] + lg[3] * 0.4);
    parts.push({ geo: paw, part: lg[2], pivot: [lg[0], top, lg[1]], color: flat(C.paw) });
  }

  // tail: tapered tube bent along a curve
  {
    const tl = s.tailLen;
    const tail = new THREE.CylinderGeometry(s.tailR1, s.tailR0, tl, 7, 18);
    tail.translate(0, -tl / 2, 0);   // root at y=0, extends to -tl
    tail.rotateX(-Math.PI / 2);       // -> extends along -Z
    const p = tail.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      const t = -z / tl;
      p.setY(i, p.getY(i) + s.tailCurve(t) * tl);
    }
    tail.computeVertexNormals();
    tail.translate(0, s.tailRoot[1], s.tailRoot[2]);
    parts.push({ geo: tail, part: PART.TAIL, pivot: s.tailRoot, color: s.furTail ? furCol : (v, n) => mix(C.tail, C.tailTip, Math.min(1, Math.max(0, (s.tailRoot[2] - v.z) / tl))), uvScale: [1, 6] });
  }
  return mergeParts(THREE, parts);
}

export const SPECIES = {
  rat: {
    bodyLen: 0.48, bodyR: 0.15, bodyZ0: -0.27, bodyY: 0.17, flat: 0.82, taper: 0.42, hump: 0.035, bodyW: 1,
    neck: [0, 0.2, 0.17], headTilt: 0.16, headStyle: "snout", headLen: 0.22, headR: 0.082,
    legX: 0.075, legFrontZ: 0.1, legBackZ: -0.15, hipY: 0.13, frontLegR: 0.022, backLegR: 0.032,
    tailLen: 0.62, tailR0: 0.017, tailR1: 0.004, tailRoot: [0, 0.15, -0.25],
    tailCurve: (t) => -0.2 * Math.sin(Math.min(1, t * 1.6) * Math.PI / 2) + 0.03 * t,
    colors: { back: [0.29, 0.25, 0.21], belly: [0.56, 0.5, 0.43], ear: [0.72, 0.52, 0.5], eye: [0.02, 0.02, 0.025],
      nose: [0.78, 0.5, 0.5], paw: [0.8, 0.6, 0.57], whisker: [0.85, 0.85, 0.8], tail: [0.72, 0.55, 0.52], tailTip: [0.82, 0.64, 0.6] },
  },
  cat: {
    bodyLen: 0.58, bodyR: 0.155, bodyZ0: -0.29, bodyY: 0.27, flat: 0.92, taper: 0.12, hump: 0.015, bodyW: 0.95,
    neck: [0, 0.33, 0.24], headTilt: -0.05, headStyle: "cat", headR: 0.1,
    legX: 0.08, legFrontZ: 0.17, legBackZ: -0.19, hipY: 0.25, frontLegR: 0.032, backLegR: 0.042,
    tailLen: 0.56, tailR0: 0.034, tailR1: 0.026, tailRoot: [0, 0.31, -0.28], furTail: true, stripes: 38,
    tailCurve: (t) => 0.22 * t * t - 0.12 * t,
    colors: { back: [0.42, 0.4, 0.37], belly: [0.78, 0.75, 0.7], stripe: [0.16, 0.15, 0.14], ear: [0.78, 0.6, 0.58],
      eye: [0.72, 0.68, 0.18], nose: [0.7, 0.45, 0.45], paw: [0.82, 0.8, 0.76], whisker: [0.95, 0.95, 0.92] },
  },
};

// procedural fur strand texture (greyscale, multiplied with vertex colours)
let furTexCache = null;
function furTexture(THREE) {
  if (furTexCache || typeof document === "undefined") return furTexCache;
  const S = 256;
  const c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d");
  g.fillStyle = "#c8c8c8"; g.fillRect(0, 0, S, S);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 5200; i++) {
    const x = rnd() * S, y = rnd() * S, l = 4 + rnd() * 9, a = -Math.PI / 2 + (rnd() - 0.5) * 0.5;
    const v = Math.floor(140 + rnd() * 115);
    g.strokeStyle = `rgba(${v},${v},${v},${0.35 + rnd() * 0.5})`;
    g.lineWidth = 0.6 + rnd() * 0.9;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    // wrap
    if (y < 14) { g.beginPath(); g.moveTo(x, y + S); g.lineTo(x + Math.cos(a) * l, y + S + Math.sin(a) * l); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  furTexCache = t;
  return t;
}

function patchQuadMaterial(THREE, mat, opts) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>
        attribute float aPart; attribute vec3 aPivot; attribute vec4 aAnim; attribute vec4 aAnim2;
        varying float vEye; varying float vFlash; varying float vGlow;
        mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
        mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
        mat3 rotZ(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }`)
      .replace("#include <beginnormal_vertex>", `
        mat3 pR = mat3(1.0); vec3 pT = vec3(0.0);
        float phase = aAnim.x, gait = aAnim.y, tm = aAnim.z;
        vEye = step(1.5, aPart) * step(aPart, 2.5);
        vFlash = aAnim.w; vGlow = aAnim2.w;
        if (aPart < 0.5) {
          float br = 1.0 + sin(tm * 3.1) * 0.025 + gait * sin(phase * 2.0) * 0.02;
          pR = mat3(1.0, 0.0, 0.0, 0.0, br, 0.0, 0.0, 0.0, 1.0);
          pT.y = gait * abs(sin(phase)) * ${opts.bounce.toFixed(4)};
        } else if (aPart < 2.5) {
          float bob = sin(phase * 2.0) * 0.06 * gait + sin(tm * 1.7) * 0.03;
          pR = rotY(aAnim2.x) * rotX(aAnim2.y + bob);
          pT.y = gait * abs(sin(phase)) * ${opts.bounce.toFixed(4)};
        } else if (aPart < 6.5) {
          float off = (aPart < 3.5 || aPart > 5.5) ? 0.0 : 3.14159;
          float sw = sin(phase + off) * 0.75 * gait + sin(tm * 38.0 + aPart) * 0.45 * aAnim2.z;
          pR = rotX(sw);
          pT.y = gait * abs(sin(phase)) * ${opts.bounce.toFixed(4)} * 0.5;
        } else {
          float d = length(position - aPivot);
          float w = sin(tm * ${opts.tailSpeed.toFixed(3)} - d * 6.0) * (0.35 + gait * 0.5) * d;
          pT = vec3(w * ${opts.tailAmp.toFixed(3)}, sin(tm * 2.3 - d * 4.0) * 0.08 * d, 0.0);
          pR = rotY(sin(tm * 1.3) * 0.25);
          pT.y += gait * abs(sin(phase)) * ${opts.bounce.toFixed(4)};
        }
        vec3 objectNormal = pR * vec3(normal);
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`)
      .replace("#include <begin_vertex>", `vec3 transformed = pR * (vec3(position) - aPivot) + aPivot + pT;`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        varying float vEye; varying float vFlash; varying float vGlow;`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        {
          float rim = 1.0 - abs(dot(normal, normalize(vViewPosition)));
          totalEmissiveRadiance += diffuseColor.rgb * pow(rim, 2.5) * ${opts.rim.toFixed(3)} * (1.0 - vEye);
          totalEmissiveRadiance += vec3(1.0, 0.92, 0.85) * vFlash * 0.9;
          totalEmissiveRadiance += vEye * vGlow * vec3(1.6, 0.05, 0.06);
          totalEmissiveRadiance += vEye * ${opts.eyeShine.toFixed(3)} * vec3(0.6, 0.6, 0.4);
        }`);
  };
  mat.customProgramCacheKey = () => "tnrpg-quad-" + opts.key;
}

// A herd = one InstancedMesh for N quadrupeds of a species.
export function createQuadHerd(THREE, species, max, opts = {}) {
  const spec = SPECIES[species];
  const geo = buildQuadGeometry(THREE, spec);
  const a1 = new Float32Array(max * 4), a2 = new Float32Array(max * 4);
  const attr1 = new THREE.InstancedBufferAttribute(a1, 4); attr1.setUsage(THREE.DynamicDrawUsage);
  const attr2 = new THREE.InstancedBufferAttribute(a2, 4); attr2.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aAnim", attr1);
  geo.setAttribute("aAnim2", attr2);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, map: furTexture(THREE), roughness: opts.roughness != null ? opts.roughness : 0.88,
    metalness: opts.metalness || 0, color: opts.tint != null ? opts.tint : 0xffffff,
    emissive: opts.emissive != null ? opts.emissive : 0x000000,
  });
  patchQuadMaterial(THREE, mat, { key: species + (opts.key || ""), bounce: spec.hipY * 0.12, tailSpeed: species === "cat" ? 1.6 : 5.0,
    tailAmp: species === "cat" ? 0.6 : 1.0, rim: opts.rim != null ? opts.rim : 0.45, eyeShine: species === "cat" ? 0.35 : 0.05 });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.count = max;
  const used = new Uint8Array(max);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, "YXZ"), P = new THREE.Vector3(), S = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < max; i++) mesh.setMatrixAt(i, zero);
  let dirty = true;
  return {
    mesh, spec, max,
    alloc() { for (let i = 0; i < max; i++) if (!used[i]) { used[i] = 1; return i; } return -1; },
    free(i) { if (i < 0) return; used[i] = 0; mesh.setMatrixAt(i, zero); dirty = true; },
    hide(i) { mesh.setMatrixAt(i, zero); dirty = true; },
    set(i, x, y, z, yaw, pitch, roll, s, sy = 1, sxz = 1) {
      E.set(pitch, yaw, roll, "YXZ"); Q.setFromEuler(E); P.set(x, y, z); S.set(s * sxz, s * sy, s * sxz);
      M4.compose(P, Q, S); mesh.setMatrixAt(i, M4); dirty = true;
    },
    anim(i, phase, gait, time, flash, headYaw, headPitch, twitch, eyeGlow) {
      const k = i * 4;
      a1[k] = phase; a1[k + 1] = gait; a1[k + 2] = time; a1[k + 3] = flash;
      a2[k] = headYaw; a2[k + 1] = headPitch; a2[k + 2] = twitch; a2[k + 3] = eyeGlow;
      dirty = true;
    },
    commit() {
      if (!dirty) return;
      dirty = false;
      mesh.instanceMatrix.needsUpdate = true;
      attr1.needsUpdate = true; attr2.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------------------------------------ fallback humanoid
// Same API as ENGINE's createHumanoid (CONTRACT 5.9), used only when the engine one cannot be imported.
const ACTION_DUR = { punch: 0.35, slash: 0.45, heavy: 0.7, block: 0.5, hurt: 0.32, die: 1.2, jump: 0.4, fall: 0.5, sit: 0.6,
  kneel: 0.6, dig: 0.8, wave: 1.2, talk: 1.2, cry: 1.5, scared: 1.0, take: 0.6, idle: 0.5, walk: 0.5, run: 0.5 };

export function createFallbackHumanoid(THREE, engine, o = {}) {
  const H = o.height || 1.8, s = H / 1.8;
  const w = o.build === "heavy" ? 1.28 : o.build === "slim" ? 0.86 : o.build === "child" ? 0.8 : 1;
  const matC = createFallbackHumanoid._mats || (createFallbackHumanoid._mats = new Map());
  const M = (c, rough = 0.85, metal = 0) => {
    const k = c + ":" + rough + ":" + metal;
    let m = matC.get(k);
    if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }); matC.set(k, m); }
    return m;
  };
  const geoC = createFallbackHumanoid._geos || (createFallbackHumanoid._geos = new Map());
  const G = (k, fn) => { let g = geoC.get(k); if (!g) { g = fn(); geoC.set(k, g); } return g; };
  const cap = (r, l) => G(`cap:${r}:${l}`, () => { const g = new THREE.CapsuleGeometry(r, l, 4, 10); g.translate(0, -l / 2 - r * 0.6, 0); return g; });
  let skinM = M(o.skin || "#e0b090", 0.7), shirtM = M(o.shirt || "#6b7d5a"), pantsM = M(o.pants || "#4a3c2c"), hairM = M(o.hair || "#3a2a1a", 0.9);
  const eyeNormal = M("#1a1410", 0.3);
  const eyeRed = new THREE.MeshBasicMaterial({ color: 0xff2020 });
  const root = new THREE.Group();
  const meshes = [];
  const add = (parent, g, m, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.castShadow = true; parent.add(me); meshes.push(me); return me; };
  const hips = new THREE.Group(); hips.position.y = 0.95 * s; root.add(hips);
  const torso = new THREE.Group(); hips.add(torso);
  const torsoM = add(torso, G(`torso:${w}`, () => { const g = new THREE.CapsuleGeometry(0.16 * w, 0.36, 4, 12); g.scale(1, 1, 0.72); g.translate(0, 0.33, 0); return g; }), shirtM);
  torsoM.scale.setScalar(s);
  const pelvis = add(hips, G(`pelvis:${w}`, () => { const g = new THREE.SphereGeometry(0.17 * w, 12, 8); g.scale(1, 0.7, 0.75); return g; }), pantsM);
  pelvis.scale.setScalar(s);
  const neck = new THREE.Group(); neck.position.y = 0.66 * s; torso.add(neck);
  const head = new THREE.Group(); head.position.y = 0.12 * s; neck.add(head);
  add(head, G("head", () => { const g = new THREE.SphereGeometry(0.115, 16, 12); g.scale(0.92, 1.05, 1); return g; }), skinM).scale.setScalar(s);
  const eyes = [];
  for (const sx of [-1, 1]) { const e = add(head, G("eye", () => new THREE.SphereGeometry(0.016, 8, 6)), eyeNormal, sx * 0.04 * s, 0.02 * s, 0.1 * s); eyes.push(e); }
  add(head, G("nose", () => new THREE.ConeGeometry(0.018, 0.04, 6).rotateX(Math.PI / 2)), skinM, 0, -0.01 * s, 0.115 * s);
  let hairMesh = null;
  if (o.hair !== null) hairMesh = add(head, G("hair", () => new THREE.SphereGeometry(0.122, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).rotateX(-0.25)), hairM, 0, 0.01 * s, -0.01 * s);
  if (hairMesh) hairMesh.scale.setScalar(s);
  if (o.beard) add(head, G("beard", () => { const g = new THREE.SphereGeometry(0.09, 12, 8); g.scale(1, 1.1, 0.7); return g; }), hairM, 0, -0.09 * s, 0.05 * s).scale.setScalar(s);
  const hat = new THREE.Group(); head.add(hat);
  if (o.hat === "straw") { add(hat, G("brim", () => new THREE.CylinderGeometry(0.24, 0.25, 0.015, 20)), M("#d8b868", 1), 0, 0.09 * s); add(hat, G("crownStraw", () => new THREE.CylinderGeometry(0.09, 0.12, 0.1, 14)), M("#d8b868", 1), 0, 0.14 * s); }
  if (o.hat === "helmet" || o.hat === "royalHelmet") {
    add(hat, G("helm", () => new THREE.SphereGeometry(0.135, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6)), o.hat === "royalHelmet" ? M("#e6e0d0", 0.35, 0.6) : M("#8a9098", 0.35, 0.9), 0, 0.01 * s);
    if (o.hat === "royalHelmet") add(hat, G("plume", () => { const g = new THREE.SphereGeometry(0.05, 8, 6); g.scale(0.6, 1, 2.6); return g; }), M("#d8b050", 0.8), 0, 0.15 * s, -0.04 * s);
  }
  if (o.hat === "crown") {
    add(hat, G("fcrown", () => new THREE.CylinderGeometry(0.12, 0.11, 0.08, 16, 1, true)), M("#d8aa48", 0.3, 1), 0, 0.12 * s);
  }
  if (o.hat === "hood") add(hat, G("hood", () => new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62)), shirtM, 0, 0.0, -0.01 * s);
  if (o.hat === "bandana") add(hat, G("band", () => new THREE.TorusGeometry(0.115, 0.02, 6, 16).rotateX(Math.PI / 2)), M("#6a4a8a", 0.9), 0, 0.05 * s);

  function limb(parent, x, y, r, l1, l2, m1, m2) {
    const sh = new THREE.Group(); sh.position.set(x, y, 0); parent.add(sh);
    add(sh, cap(r, l1), m1).scale.setScalar(s);
    const el = new THREE.Group(); el.position.y = -(l1 + r * 1.2) * s; sh.add(el);
    add(el, cap(r * 0.85, l2), m2).scale.setScalar(s);
    const end = new THREE.Group(); end.position.y = -(l2 + r) * s; el.add(end);
    return { sh, el, end };
  }
  const armR = limb(torso, -0.22 * w * s, 0.56 * s, 0.05 * w, 0.22, 0.2, shirtM, skinM);
  const armL = limb(torso, 0.22 * w * s, 0.56 * s, 0.05 * w, 0.22, 0.2, shirtM, skinM);
  add(armR.end, G("hand", () => new THREE.SphereGeometry(0.045, 8, 6)), skinM).scale.setScalar(s);
  add(armL.end, G("hand", () => new THREE.SphereGeometry(0.045, 8, 6)), skinM).scale.setScalar(s);
  const legR = limb(hips, -0.09 * w * s, -0.02 * s, 0.065 * w, 0.36, 0.34, pantsM, pantsM);
  const legL = limb(hips, 0.09 * w * s, -0.02 * s, 0.065 * w, 0.36, 0.34, pantsM, pantsM);
  for (const lg of [legR, legL]) add(lg.end, G("boot", () => { const g = new THREE.BoxGeometry(0.1, 0.07, 0.22); g.translate(0, 0.0, 0.05); return g; }), M("#2a2018", 0.8)).scale.setScalar(s);
  if (o.cape) {
    const capeM = new THREE.MeshStandardMaterial({ color: o.cape, roughness: 0.9, side: THREE.DoubleSide });
    const cg = G("cape", () => { const g = new THREE.PlaneGeometry(0.46, 1.0, 1, 6); g.translate(0, -0.5, 0); return g; });
    const cm = add(torso, cg, capeM, 0, 0.6 * s, -0.13 * s); cm.scale.setScalar(s * w); cm.rotation.x = 0.12;
  }
  if (o.dress) {
    add(hips, G("dress", () => new THREE.CylinderGeometry(0.17, 0.32, 0.75, 16, 1, true).translate(0, -0.3, 0)), new THREE.MeshStandardMaterial({ color: o.dress, roughness: 0.9, side: THREE.DoubleSide }), 0, 0.05 * s).scale.set(s * w, s, s * w);
  }
  const hand = new THREE.Object3D(); armR.end.add(hand);
  root.traverse((c) => { c.matrixAutoUpdate = true; });

  let walkPhase = 0, tBreath = 0;
  let action = null, actT = 0, actDur = 0, actLoop = false, actResolve = null, dead = false;
  function play(name, opt = {}) {
    if (actResolve) { const r = actResolve; actResolve = null; r(); }
    action = name; actT = 0; actDur = (ACTION_DUR[name] || 0.5) / (opt.speed || 1); actLoop = !!opt.loop;
    dead = name === "die";
    if (name !== "die") root.rotation.x = 0;
    return new Promise((res) => { actResolve = res; });
  }
  function pose(name, t) {
    const e = Math.sin(Math.min(1, t) * Math.PI);
    switch (name) {
      case "punch": armR.sh.rotation.x = -1.55 * e; armR.el.rotation.x = -0.4 * (1 - e); torso.rotation.y = -0.35 * e; break;
      case "slash": { const k = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65; armR.sh.rotation.x = -2.6 * k + (t > 0.35 ? -0.6 * (1 - k) : 0); armR.sh.rotation.z = -0.6 * k; torso.rotation.y = t < 0.35 ? 0.4 * k : -0.5 * (1 - k); break; }
      case "heavy": { const k = t < 0.55 ? t / 0.55 : 1 - (t - 0.55) / 0.45; armR.sh.rotation.x = -3.0 * k; armL.sh.rotation.x = -2.4 * k; torso.rotation.x = t < 0.55 ? -0.2 * k : 0.35 * (1 - k); break; }
      case "block": armR.sh.rotation.x = -1.3; armL.sh.rotation.x = -1.4; armL.el.rotation.x = -1.0; break;
      case "hurt": torso.rotation.x = -0.35 * e; head.rotation.x = -0.3 * e; break;
      case "die": { const k = Math.min(1, t * 1.25); root.rotation.x = -1.45 * k * k; hips.position.y = (0.95 - 0.7 * k) * s; armR.sh.rotation.z = -0.8 * k; armL.sh.rotation.z = 0.8 * k; break; }
      case "kneel": case "sit": legR.sh.rotation.x = -1.4 * Math.min(1, t * 2); legR.el.rotation.x = 1.5 * Math.min(1, t * 2); hips.position.y = (0.95 - 0.4 * Math.min(1, t * 2)) * s; break;
      case "wave": armR.sh.rotation.z = -2.6; armR.el.rotation.z = Math.sin(t * 18) * 0.5; break;
      case "scared": armR.sh.rotation.x = -1.8; armL.sh.rotation.x = -1.8; torso.rotation.x = -0.25; break;
      case "talk": armR.sh.rotation.x = -0.5 + Math.sin(t * 9) * 0.2; break;
      case "dig": torso.rotation.x = 0.4 * e; armR.sh.rotation.x = -1.0 * e; armL.sh.rotation.x = -1.0 * e; break;
      case "take": armR.sh.rotation.x = -1.2 * e; torso.rotation.x = 0.3 * e; break;
      case "cry": head.rotation.x = 0.5; armR.sh.rotation.x = -2.2; armL.sh.rotation.x = -2.2; armR.el.rotation.x = -1.6; armL.el.rotation.x = -1.6; break;
      default: break;
    }
  }
  function update(dt, speed = 0, airborne = false) {
    tBreath += dt;
    const sp = Math.min(1.6, speed / 5);
    walkPhase += dt * (3 + speed * 1.6);
    if (dead && action === "die") { actT += dt; pose("die", Math.min(1, actT / actDur)); if (actT >= actDur && actResolve) { const r = actResolve; actResolve = null; r(); } return; }
    // base locomotion
    const sw = Math.sin(walkPhase) * 0.7 * sp;
    torso.rotation.set(0.04 * sp, 0, 0); head.rotation.set(0, 0, 0); hips.position.y = (0.95 + Math.abs(Math.cos(walkPhase)) * 0.03 * sp + Math.sin(tBreath * 2) * 0.004) * s;
    legR.sh.rotation.set(airborne ? -0.6 : sw, 0, 0); legL.sh.rotation.set(airborne ? 0.3 : -sw, 0, 0);
    legR.el.rotation.set(airborne ? 0.8 : Math.max(0, -Math.cos(walkPhase)) * 0.9 * sp, 0, 0);
    legL.el.rotation.set(airborne ? 0.5 : Math.max(0, Math.cos(walkPhase)) * 0.9 * sp, 0, 0);
    armR.sh.rotation.set(-sw * 0.8, 0, -0.08); armL.sh.rotation.set(sw * 0.8, 0, 0.08);
    armR.el.rotation.set(-0.25 - 0.3 * sp, 0, 0); armL.el.rotation.set(-0.25 - 0.3 * sp, 0, 0);
    torso.rotation.y = 0;
    if (action) {
      actT += dt;
      const t = actDur > 0 ? actT / actDur : 1;
      pose(action, actLoop ? t % 1 : Math.min(1, t));
      if (!actLoop && actT >= actDur) {
        action = null;
        if (actResolve) { const r = actResolve; actResolve = null; r(); }
      }
    }
  }
  return {
    root, hand, head, update, play,
    setEyes(mode) { for (const e of eyes) { e.material = mode === "red" || mode === "glow" ? eyeRed : eyeNormal; e.visible = mode !== "none"; } },
    setColors(c) { if (c.shirt) shirtM = M(c.shirt); if (c.skin) skinM = M(c.skin, 0.7); },
    setVisible(v) { root.visible = v; },
    dispose() { if (root.parent) root.parent.remove(root); },
    reset() { dead = false; action = null; root.rotation.x = 0; hips.position.y = 0.95 * s; },
  };
}

// ------------------------------------------------------------------------------------------------ humanoid enemies
const SKINS = ["#e3b48f", "#c99572", "#a8724f", "#8a5a3c", "#f0c8a8", "#d4a07a"];
const SHIRTS = ["#8a7a5a", "#6b7d5a", "#7a5a4a", "#5a6a7a", "#9a8a6a", "#6a5a4a", "#7a6a8a", "#8a6a4a"];
const HAIRS = ["#3a2a1a", "#6a4a2a", "#1a1410", "#8a6a3a", "#a8a49c", "#4a3020"];

export function outfitFor(kind, variant = 0) {
  switch (kind) {
    case "villager": {
      const v = variant | 0;
      return { height: 1.72 + (v % 3) * 0.06, build: v % 4 === 1 ? "heavy" : v % 4 === 3 ? "slim" : "normal",
        skin: SKINS[v % SKINS.length], shirt: SHIRTS[v % SHIRTS.length], pants: v % 2 ? "#4a3c2c" : "#3c3a34",
        hair: HAIRS[(v * 3) % HAIRS.length], beard: v % 3 === 0, hat: v % 2 === 0 ? "straw" : (v % 4 === 3 ? "bandana" : null),
        weapon: "pitchfork" };
    }
    case "fydor": return { height: 2.08, build: "heavy", skin: "#d6a682", shirt: "#566070", pants: "#3a3630", hair: "#a6a49e", beard: true,
      hat: "helmet", cape: "#2a3a5a", weapon: "halberd", plates: "iron" };
    case "myles": return { height: 1.86, build: "slim", skin: "#d8aa86", shirt: "#4e5a66", pants: "#38342e", hair: "#4a3424", beard: false,
      hat: null, weapon: "guardSword", shield: "round", scarf: "#7a4a2a", plates: "light" };
    case "royalGuard": return { height: 1.92, build: "normal", skin: "#d8aa86", shirt: "#e8e4d8", pants: "#cdb984", hair: null, beard: false,
      hat: "royalHelmet", cape: "#e8e2d2", weapon: "spear", shield: "kite", plates: "royal" };
    case "shadowGuard": return { height: 1.95, build: "normal", skin: "#0a0a10", shirt: "#0c0b12", pants: "#08070c", hair: null, beard: false,
      hat: "helmet", weapon: "shadowSpear", shield: "shadowKite", plates: "shadow", eyes: "glow" };
    case "king": return { height: 1.98, build: "heavy", skin: "#d4a684", shirt: "#3a1a3a", pants: "#24142a", hair: "#d8d4cc", beard: true,
      hat: null, cape: "#4a0f1c", dress: "#2a1230", weapon: "kingStaff", plates: "king", eyes: "glow" };
    case "rookie": return { height: 1.7, build: "slim", skin: "#f0c8a8", shirt: "#4a7a3a", pants: "#6a5a3a", hair: "#c89a4a", beard: false,
      hat: null, cape: "#3a5aa8", weapon: "rookieSword", plates: "rookie" };
    default: return { height: 1.8 };
  }
}

export function createModelFactory(ctx, items, createHumanoidFn) {
  const THREE = ctx.THREE;
  const engine = ctx.engine;
  const M = items.materials;
  const scratch = new THREE.Vector3();

  function humanoid(o) {
    const opts = { height: o.height, build: o.build, skin: o.skin, shirt: o.shirt, pants: o.pants, hair: o.hair === undefined ? "#3a2a1a" : o.hair,
      beard: !!o.beard, hat: o.hat || null, cape: o.cape || null, dress: o.dress || null, eyes: o.eyes || "normal" };
    if (createHumanoidFn) {
      try { return createHumanoidFn(THREE, engine, opts); } catch (e) { console.warn("[combat] createHumanoid failed, using fallback", e); }
    }
    return createFallbackHumanoid(THREE, engine, opts);
  }

  function plateMesh(g, m, x, y, z, sx = 1, sy = 1, sz = 1) {
    const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.scale.set(sx, sy, sz); me.castShadow = true; return me;
  }
  const G = {
    breast: (() => { const g = new THREE.SphereGeometry(0.2, 18, 10, 0, Math.PI, Math.PI * 0.28, Math.PI * 0.5); g.scale(1, 1.35, 1); return g; })(),
    pauld: (() => { const g = new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.7, 1.1); return g; })(),
    scarf: (() => { const t = new THREE.TorusGeometry(0.1, 0.04, 8, 18); t.rotateX(Math.PI / 2); return t; })(),
    scarfTail: (() => { const g = new THREE.BoxGeometry(0.08, 0.32, 0.02); g.translate(0, -0.16, 0); return g; })(),
    bigHelm: new THREE.SphereGeometry(0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
    eyeGlow: new THREE.SphereGeometry(0.018, 8, 6),
  };

  // returns { root, body, h, weapon, shield, extras, update, play, setEyes, glints }
  function buildHumanoidEnemy(kind, variant = 0) {
    const o = outfitFor(kind, variant);
    const root = new THREE.Group(); root.name = "enemy:" + kind;
    const body = new THREE.Group(); root.add(body);
    const h = humanoid(o);
    body.add(h.root);
    const s = (o.height || 1.8) / 1.8;
    const extras = new THREE.Group(); body.add(extras);
    let weapon = null, shield = null;
    if (o.weapon) {
      weapon = items.enemyWeapon(o.weapon);
      if (weapon && h.hand) h.hand.add(weapon);
    }
    if (o.shield) {
      shield = items.shield(o.shield);
      if (shield) { body.add(shield); shield.position.set(0.34 * s, 1.0 * s, 0.12 * s); shield.rotation.set(0, Math.PI / 2 - 0.2, 0); }
    }
    const chestY = 1.28 * s;
    const wide = o.build === "heavy" ? 1.25 : o.build === "slim" ? 0.88 : 1;
    if (o.plates === "iron" || o.plates === "royal" || o.plates === "shadow" || o.plates === "king") {
      const pm = o.plates === "royal" ? M.royalWhite() : o.plates === "shadow" ? M.shadow() : o.plates === "king" ? M.gold() : M.iron();
      if (o.plates !== "king") extras.add(plateMesh(G.breast, pm, 0, chestY + 0.02 * s, 0.0, wide * s * 0.95, s, s * 0.78));
      const pr = plateMesh(G.pauld, pm, 0.22 * wide * s, 1.43 * s, 0, s * 0.95, s * 0.95, s * 0.95); pr.rotation.z = -0.45; extras.add(pr);
      const pl = plateMesh(G.pauld, pm, -0.22 * wide * s, 1.43 * s, 0, s * 0.95, s * 0.95, s * 0.95); pl.rotation.z = 0.45; extras.add(pl);
      if (o.plates === "royal") extras.add(plateMesh(new THREE.TorusGeometry(0.17, 0.018, 6, 20).rotateX(Math.PI / 2), M.gold(), 0, chestY - 0.32 * s, 0, wide * s, s, s * 0.75));
    }
    if (o.scarf) {
      const sm = new THREE.MeshStandardMaterial({ color: o.scarf, roughness: 0.95 });
      extras.add(plateMesh(G.scarf, sm, 0, 1.53 * s, 0.0, s, s, s * 0.85));
      const tail = plateMesh(G.scarfTail, sm, 0.06 * s, 1.52 * s, -0.12 * s, s, s, s); tail.rotation.x = 0.35; tail.name = "scarfTail";
      extras.add(tail);
    }
    if (o.plates === "rookie" && h.head) {
      const helm = plateMesh(G.bigHelm, M.iron(), 0, 0.02, 0, 1.35, 1.35, 1.35); helm.rotation.x = 0.25; helm.name = "rookieHelm";
      h.head.add(helm);
    }
    // the King's glints: crown + eyes live in a separate group that stays visible when the body goes dark
    let glints = null;
    if (kind === "king") {
      glints = new THREE.Group();
      const crown = items.crown("kings_crown"); crown.scale.setScalar(1.25);
      crown.position.set(0, 1.86 * s, 0.0);
      glints.add(crown);
      const em = new THREE.MeshBasicMaterial({ color: 0xbfe0ff });
      for (const sx of [-1, 1]) { const e = new THREE.Mesh(G.eyeGlow, em); e.position.set(sx * 0.045 * s, 1.74 * s, 0.11 * s); glints.add(e); }
      glints.userData.eyeMat = em;
      body.add(glints);
    }
    const eyeMode = o.eyes || "normal";
    try { if (h.setEyes) h.setEyes(eyeMode); } catch (e) { /* ignore */ }
    root.traverse((c) => { if (c.isMesh) c.castShadow = true; });
    return {
      kind, root, body, h, weapon, shield, extras, glints, height: o.height || 1.8, scale: s, outfit: o,
      update(dt, speed, airborne) { try { h.update(dt, speed, airborne); } catch (e) { /* engine humanoid issue */ } },
      play(name, opt) { try { return h.play(name, opt) || Promise.resolve(); } catch (e) { return Promise.resolve(); } },
      setEyes(mode) { try { h.setEyes(mode); } catch (e) { /* ignore */ } },
      shieldPose(up) {
        if (!shield) return;
        // lerp between resting on the left arm and raised in front of the chest
        const k = up;
        shield.position.set((0.34 - 0.2 * k) * s, (1.0 + 0.22 * k) * s, (0.12 + 0.3 * k) * s);
        shield.rotation.set(0, (Math.PI / 2 - 0.2) * (1 - k), 0);
      },
      dispose() { if (root.parent) root.parent.remove(root); try { h.dispose && h.dispose(); } catch (e) { /* ignore */ } },
    };
  }

  // Rat King: a cow-sized rat (single-instance herd) + bottle-cap crown + cheese-rind cape
  function buildRatKing(eyesRed) {
    const herd = createQuadHerd(THREE, "rat", 1, { key: "king", rim: 0.5 });
    herd.set(0, 0, 0, 0, 0, 0, 0, 1);
    const root = new THREE.Group(); root.name = "enemy:ratKing";
    const body = new THREE.Group(); root.add(body);
    body.add(herd.mesh);
    const headPivot = new THREE.Group(); headPivot.position.set(0, 0.2, 0.17); body.add(headPivot);
    const cap = new THREE.Group();
    const capG = (() => {
      const g = new THREE.CylinderGeometry(0.06, 0.062, 0.02, 21, 1, false);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), r = Math.sqrt(x * x + z * z);
        if (r > 0.05) { const a = Math.atan2(z, x); const k = 1 + 0.12 * (Math.sin(a * 21) > 0 ? 1 : 0); p.setX(i, x * k); p.setZ(i, z * k); if (p.getY(i) < 0) p.setY(i, p.getY(i) - 0.006); }
      }
      g.computeVertexNormals();
      return g;
    })();
    const capMat = new THREE.MeshStandardMaterial({ color: 0xd8b040, metalness: 0.9, roughness: 0.3 });
    const capM = new THREE.Mesh(capG, capMat); capM.castShadow = true; cap.add(capM);
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.022, 16), new THREE.MeshStandardMaterial({ color: 0x8a1a1a, roughness: 0.5 }));
    cap.add(dot);
    cap.position.set(0, 0.085, 0.06); cap.rotation.set(-0.2, 0, 0.12);
    headPivot.add(cap);
    // cheese-rind cape draped over the back
    const capeG = (() => {
      const g = new THREE.CylinderGeometry(0.15, 0.2, 0.36, 18, 5, true, Math.PI / 2 - 0.45, Math.PI + 0.9);
      g.rotateX(Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const z = p.getZ(i), x = p.getX(i);
        // ragged hem at the back + a little sag
        const back = (0.18 - z) / 0.36;
        p.setY(i, p.getY(i) * 0.86 - back * 0.03 + Math.sin(x * 40) * 0.004 * back);
      }
      g.computeVertexNormals();
      g.translate(0, 0.175, -0.06);
      return g;
    })();
    let cheeseMap = null;
    try { cheeseMap = engine.materials && engine.materials.texture ? engine.materials.texture("cheese") : null; } catch (e) { cheeseMap = null; }
    const capeMat = new THREE.MeshStandardMaterial({ color: 0xe0a83a, roughness: 0.75, side: THREE.DoubleSide, map: cheeseMap || null });
    const cape = new THREE.Mesh(capeG, capeMat); cape.castShadow = true; body.add(cape);
    return { kind: "ratKing", root, body, herd, headPivot, cape, eyesRed };
  }

  function buildCat() {
    const herd = createQuadHerd(THREE, "cat", 1, { key: "tom", rim: 0.55 });
    herd.set(0, 0, 0, 0, 0, 0, 0, 1);
    const root = new THREE.Group(); root.name = "enemy:cat";
    const body = new THREE.Group(); root.add(body);
    body.add(herd.mesh);
    const headPivot = new THREE.Group(); headPivot.position.set(0, 0.36, 0.23); body.add(headPivot);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 20), new THREE.MeshStandardMaterial({ color: 0x3a2a5a, roughness: 0.8 }));
    collar.rotation.x = Math.PI / 2 - 0.5; collar.position.set(0, -0.04, -0.03);
    headPivot.add(collar);
    const bell = items.charmMesh("toms_bell");
    bell.scale.setScalar(0.6); bell.position.set(-0.07, 0.15, -0.07);
    headPivot.add(bell);
    return { kind: "cat", root, body, herd, headPivot, bell };
  }

  return { buildHumanoidEnemy, buildRatKing, buildCat, humanoid, createQuadHerd: (sp, max, o) => createQuadHerd(THREE, sp, max, o), scratch };
}
