// EVENTS monsters: the Hollow (creature / Hollow I / armoured Hollow II / giant Hollow III / clones), shadow rats,
// shadow humans, the girl, and the liquid sword. Procedural geometry + procedural animation, shared geometries and
// materials, no per-frame allocation.
import { clamp, damp, lerp, TAU, vnoise, hash1, wrapAngle } from "./util.js";

// ---------------------------------------------------------------------------------------------------------------
// shared resources (created once per THREE instance)
let R = null;

function radialTexture(THREE, inner, outer) {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(0.25, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function resources(THREE, engine) {
  if (R) return R;
  const limb = new THREE.CylinderGeometry(1, 0.62, 1, 8, 2, false); limb.translate(0, -0.5, 0);
  const limbUp = new THREE.CylinderGeometry(0.8, 1, 1, 8, 2, false); limbUp.translate(0, 0.5, 0);
  const ball = new THREE.SphereGeometry(1, 10, 8);
  const ballLo = new THREE.SphereGeometry(1, 7, 5);
  const finger = new THREE.ConeGeometry(1, 1, 5, 1); finger.rotateX(Math.PI); finger.translate(0, -0.5, 0);
  const mask = new THREE.SphereGeometry(1, 18, 12, Math.PI * 0.5 - 0.95, 1.9, Math.PI * 0.26, Math.PI * 0.5);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cone = new THREE.ConeGeometry(1, 1, 6, 1); cone.translate(0, 0.5, 0);
  const disc = new THREE.CylinderGeometry(1, 1, 1, 20, 1); // shield
  const ring = new THREE.TorusGeometry(1, 0.08, 6, 24);

  // ink: glossy black with a cold rim and a slow surface crawl
  const u = { uTime: { value: 0 }, uRim: { value: new THREE.Color(0.10, 0.07, 0.16) }, uHit: { value: 0 },
    uWob: { value: 0.07 } };
  const ink = new THREE.MeshStandardMaterial({ color: 0x040406, roughness: 0.22, metalness: 0.1 });
  ink.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = u.uTime; sh.uniforms.uRim = u.uRim; sh.uniforms.uHit = u.uHit; sh.uniforms.uWob = u.uWob;
    sh.vertexShader = "uniform float uTime;\nuniform float uWob;\n" + sh.vertexShader.replace("#include <begin_vertex>",
      "#include <begin_vertex>\n  float hw = sin(position.y * 9.0 + uTime * 2.3 + position.x * 5.0) * sin(position.z * 7.0 - uTime * 1.7);\n" +
      "  transformed += normal * hw * uWob;");
    sh.fragmentShader = "uniform vec3 uRim;\nuniform float uHit;\n" + sh.fragmentShader.replace("#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n  float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);\n" +
      "  totalEmissiveRadiance += uRim * rimF + vec3(0.7, 0.05, 0.05) * uHit;");
  };
  ink.customProgramCacheKey = () => "tnrpg-ink-v1";

  const bone = new THREE.MeshStandardMaterial({ color: 0xd9d4c6, roughness: 0.55, metalness: 0.0, emissive: 0x15120e,
    side: THREE.DoubleSide });
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const eyeWhite = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.8, 2.5), toneMapped: false });
  const eyeRed = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 0.25, 0.18), toneMapped: false });
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 0.2, 0.12), toneMapped: false,
    transparent: true, opacity: 1 });
  const haloTexW = radialTexture(THREE, "rgba(255,240,230,1)", "rgba(255,200,180,0)");
  const haloTexR = radialTexture(THREE, "rgba(255,60,40,1)", "rgba(255,0,0,0)");
  const haloW = haloTexW ? new THREE.SpriteMaterial({ map: haloTexW, blending: THREE.AdditiveBlending, depthWrite: false,
    transparent: true, toneMapped: false, opacity: 0.85 }) : null;
  const haloR = haloTexR ? new THREE.SpriteMaterial({ map: haloTexR, blending: THREE.AdditiveBlending, depthWrite: false,
    transparent: true, toneMapped: false, opacity: 0.9 }) : null;
  const getMat = (name, fallback) => {
    try { if (engine && engine.materials) { const m = engine.materials.get(name); if (m) return m; } } catch (e) { /* none */ }
    return new THREE.MeshStandardMaterial({ color: fallback, roughness: 0.5, metalness: name === "gold" || name === "iron" ? 0.8 : 0 });
  };
  const gold = getMat("gold", 0x8a6a22), iron = getMat("iron", 0x5a5c60), wood = getMat("woodDark", 0x3a2a1a);
  const tarnish = new THREE.MeshStandardMaterial({ color: 0x3b3222, roughness: 0.35, metalness: 0.9 });
  R = { limb, limbUp, ball, ballLo, finger, mask, box, cone, disc, ring, ink, inkU: u, bone, holeMat, eyeWhite, eyeRed,
    coreMat, haloW, haloR, gold, iron, wood, tarnish, getMat };
  return R;
}

// ---------------------------------------------------------------------------------------------------------------
// The Hollow
const J = { hips: 0, spine: 1, chest: 2, neck: 3, head: 4, shL: 5, elL: 6, wrL: 7, shR: 8, elR: 9, wrR: 10,
  hipL: 11, knL: 12, anL: 13, hipR: 14, knR: 15, anR: 16 };
const NJ = 17;

export class Hollow {
  /**
   * @param opts { height=2.8, eyes:"white"|"red", armored=false, giant=false, clone=false, shadows=true }
   */
  constructor(THREE, engine, opts = {}) {
    const r = resources(THREE, engine);
    this.THREE = THREE; this.H = opts.height || 2.8; this.opts = opts;
    this.root = new THREE.Group(); this.root.name = "hollow";
    this.body = new THREE.Group(); this.root.add(this.body); // body = rotated for ceiling/crawl
    this.body.scale.setScalar(this.H);
    this.joints = new Array(NJ); this.cur = new Float32Array(NJ * 3); this.tgt = new Float32Array(NJ * 3);
    this.meshes = [];
    const ink = r.ink, sh = opts.shadows !== false;
    const add = (parent, geo, mat, sx, sy, sz, px, py, pz, cast) => {
      const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(px || 0, py || 0, pz || 0);
      m.castShadow = !!(cast && sh); m.receiveShadow = false; parent.add(m); this.meshes.push(m); return m;
    };
    const joint = (i, parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); this.joints[i] = o; return o; };

    // pelvis + legs
    const hips = joint(J.hips, this.body, 0, 0.5, 0);
    add(hips, r.ball, ink, 0.055, 0.035, 0.04, 0, 0, 0, true);
    for (let s = -1; s <= 1; s += 2) {
      const L = s > 0; const hj = joint(L ? J.hipL : J.hipR, hips, 0.045 * s, -0.01, 0);
      add(hj, r.limb, ink, 0.024, 0.25, 0.024, 0, 0, 0, true);
      const kn = joint(L ? J.knL : J.knR, hj, 0, -0.25, 0);
      add(kn, r.ball, ink, 0.018, 0.02, 0.018);
      add(kn, r.limb, ink, 0.017, 0.24, 0.017, 0, 0, 0, true);
      const an = joint(L ? J.anL : J.anR, kn, 0, -0.24, 0);
      add(an, r.box, ink, 0.03, 0.012, 0.085, 0, -0.006, 0.028, true); // long thin foot
      add(an, r.finger, ink, 0.008, 0.05, 0.008, 0.012, -0.004, 0.07).rotation.x = -1.45; // toe claws
      add(an, r.finger, ink, 0.008, 0.05, 0.008, -0.012, -0.004, 0.07).rotation.x = -1.45;
    }
    // spine + chest (ribbed, too thin)
    const spine = joint(J.spine, hips, 0, 0.01, 0);
    add(spine, r.limbUp, ink, 0.022, 0.13, 0.02, 0, 0, 0, true);
    for (let k = 0; k < 4; k++) add(spine, r.ballLo, ink, 0.026 - k * 0.002, 0.008, 0.02, 0, 0.025 + k * 0.026, -0.004);
    const chest = joint(J.chest, spine, 0, 0.13, 0);
    add(chest, r.ball, ink, 0.07, 0.1, 0.045, 0, 0.08, 0, true);
    for (let k = 0; k < 5; k++) add(chest, r.ballLo, ink, 0.074 - k * 0.003, 0.009, 0.048, 0, 0.03 + k * 0.025, 0.003);
    add(chest, r.ball, ink, 0.022, 0.02, 0.02, 0.07, 0.16, 0, true); // shoulder knobs (bony)
    add(chest, r.ball, ink, 0.022, 0.02, 0.02, -0.07, 0.16, 0, true);
    // neck + head + mask
    const neck = joint(J.neck, chest, 0, 0.17, 0.005);
    add(neck, r.limbUp, ink, 0.012, 0.075, 0.012, 0, 0, 0, true);
    const head = joint(J.head, neck, 0, 0.075, 0);
    add(head, r.ball, ink, 0.05, 0.07, 0.055, 0, 0.055, -0.004, true);
    const mask = add(head, r.mask, r.bone, 0.053, 0.078, 0.06, 0, 0.058, 0.004);
    this.mask = mask;
    const eyeMat = opts.eyes === "red" ? r.eyeRed : r.eyeWhite;
    this.eyeMeshes = [];
    for (let s = -1; s <= 1; s += 2) {
      add(head, r.ballLo, r.holeMat, 0.0075, 0.0055, 0.003, 0.018 * s, 0.07, 0.061);
      const e = add(head, r.ballLo, eyeMat, 0.0028, 0.0028, 0.0028, 0.018 * s, 0.07, 0.0635);
      this.eyeMeshes.push(e);
      const halo = opts.eyes === "red" ? r.haloR : r.haloW;
      if (halo) { const sp = new THREE.Sprite(halo); sp.scale.setScalar(0.035); sp.position.set(0.018 * s, 0.07, 0.066); head.add(sp); this.eyeMeshes.push(sp); }
    }
    add(head, r.box, r.holeMat, 0.0016, 0.05, 0.002, 0.006, 0.036, 0.064).rotation.z = 0.12; // the crack in the mask
    // arms (too long) with four needle fingers each
    this.fingers = [];
    for (let s = -1; s <= 1; s += 2) {
      const L = s > 0;
      const shj = joint(L ? J.shL : J.shR, chest, 0.078 * s, 0.155, 0);
      add(shj, r.limb, ink, 0.016, 0.28, 0.016, 0, 0, 0, true);
      const el = joint(L ? J.elL : J.elR, shj, 0, -0.28, 0);
      add(el, r.ball, ink, 0.013, 0.014, 0.013);
      add(el, r.limb, ink, 0.012, 0.27, 0.012, 0, 0, 0, true);
      const wr = joint(L ? J.wrL : J.wrR, el, 0, -0.27, 0);
      add(wr, r.ball, ink, 0.016, 0.028, 0.01, 0, -0.018, 0, true);
      for (let f = 0; f < 4; f++) {
        const fp = new THREE.Object3D(); fp.position.set((f - 1.5) * 0.007, -0.04, 0.002 * (f - 1.5)); wr.add(fp);
        fp.rotation.z = (f - 1.5) * 0.09 * s;
        add(fp, r.finger, ink, 0.0035, 0.1 + (f === 1 || f === 2 ? 0.02 : 0), 0.0035);
        this.fingers.push(fp);
      }
    }
    this.hand = [this.joints[J.wrL], this.joints[J.wrR]];

    // armour / weapons for the prepared Hollow II
    this.halberd = null; this.shield = null;
    if (opts.armored) {
      const t = r.tarnish;
      add(chest, r.box, t, 0.11, 0.09, 0.06, 0, 0.09, 0.018, true).rotation.x = -0.08;     // fused breastplate
      add(chest, r.ball, r.gold, 0.035, 0.025, 0.035, 0.08, 0.17, 0, true);                  // pauldrons
      add(chest, r.ball, r.gold, 0.035, 0.025, 0.035, -0.08, 0.17, 0, true);
      for (let k = 0; k < 5; k++) {                                                          // the King's crown, fused
        const a = (k / 5) * TAU; const c = add(head, r.cone, r.gold, 0.008, 0.035, 0.008, Math.sin(a) * 0.045, 0.11, Math.cos(a) * 0.045);
        c.rotation.x = Math.cos(a) * 0.4; c.rotation.z = -Math.sin(a) * 0.4;
      }
      // Fydor's halberd (right hand)
      const hb = new THREE.Group(); this.joints[J.wrR].add(hb); hb.position.set(0, -0.03, 0); hb.rotation.x = Math.PI * 0.5;
      add(hb, r.limbUp, r.wood, 0.006, 0.5, 0.006, 0, -0.15, 0, true);
      add(hb, r.box, r.iron, 0.004, 0.06, 0.07, 0, 0.3, 0.035, true);
      add(hb, r.cone, r.iron, 0.007, 0.06, 0.007, 0, 0.35, 0, true);
      this.halberd = hb;
      // Myles's shield (left forearm)
      const shg = new THREE.Group(); this.joints[J.elL].add(shg); shg.position.set(0.012, -0.16, 0.016);
      const d = add(shg, r.disc, r.iron, 0.11, 0.008, 0.11, 0, 0, 0, true); d.rotation.x = Math.PI * 0.5; d.rotation.z = 0;
      const rim = add(shg, r.ring, r.gold, 0.11, 0.11, 0.11, 0, 0, 0.004); rim.rotation.set(0, 0, 0);
      shg.rotation.y = Math.PI * 0.5;
      this.shield = shg;
    }
    // giant weak-point cores (hidden unless glowing)
    this.cores = [];
    if (opts.giant) {
      const mk = (parent, px, py, pz, s, name) => {
        const m = add(parent, r.ball, r.coreMat, s, s, s, px, py, pz);
        m.visible = false; m.renderOrder = 2;
        const c = { name, mesh: m, pos: new THREE.Vector3(), glow: 0 };
        this.cores.push(c); return c;
      };
      mk(this.joints[J.wrL], 0, -0.03, 0.012, 0.016, "handL");
      mk(this.joints[J.wrR], 0, -0.03, 0.012, 0.016, "handR");
      mk(this.joints[J.knL], 0, 0, 0.02, 0.018, "kneeL");
      mk(this.joints[J.head], 0, 0.06, 0.07, 0.02, "face");
    }
    this.root.visible = false;
    // anim state
    this.mode = "idle"; this.act = null; this.actT = 0; this.actDur = 1; this.actSide = 1;
    this.speed = 0; this.phase = 0; this.t = Math.random() * 10;
    this.twitchT = 1 + Math.random() * 2; this.twitchLeft = 0; this.twX = 0; this.twY = 0; this.twZ = 0;
    this.freeze = 0; this.hipsY = 0.5; this.hit = 0; this.melt = 0; this.ceiling = 0; this.lean = 0;
    this.shieldUp = 0; this.eyeGlow = 1;
    this._eyeScale = 1;
    // optional two-bone arm IK (giant palms / sweeps / the forearm ramp): side 1 = left arm, -1 = right arm
    this.ik = { side: -1, target: new THREE.Vector3(), on: false, w: 0 };
    if (!S) initScratch(THREE);
  }
  setIK(side, x, y, z) { this.ik.side = side; this.ik.target.set(x, y, z); this.ik.on = true; }
  clearIK() { this.ik.on = false; }
  _solveIK() {
    const ik = this.ik, L = ik.side > 0;
    const sh = this.joints[L ? J.shL : J.shR], el = this.joints[L ? J.elL : J.elR], chest = this.joints[J.chest];
    this.root.updateMatrixWorld(true);
    const t = S.t.copy(ik.target); chest.worldToLocal(t);
    const d = S.d.subVectors(t, sh.position); const L1 = 0.28, L2 = 0.31;
    const len = clamp(d.length(), 0.02, (L1 + L2) * 0.999); d.normalize();
    const a1 = Math.acos(clamp((L1 * L1 + len * len - L2 * L2) / (2 * L1 * len), -1, 1));
    S.pole.set(ik.side * 0.6, 0.4, -1).normalize();
    const n = S.n.crossVectors(d, S.pole); if (n.lengthSq() < 1e-6) n.set(1, 0, 0); n.normalize();
    const u = S.u.copy(d).applyAxisAngle(n, a1);
    S.q1.setFromUnitVectors(S.down, u);
    const e = S.e.copy(sh.position).addScaledVector(u, L1);
    const f = S.f.subVectors(t, e).normalize();
    S.qi.copy(S.q1).invert(); f.applyQuaternion(S.qi);
    S.q2.setFromUnitVectors(S.down, f);
    sh.quaternion.slerp(S.q1, ik.w); el.quaternion.slerp(S.q2, ik.w);
  }
  get position() { return this.root.position; }
  get yaw() { return this.root.rotation.y; }
  set yaw(v) { this.root.rotation.y = v; }
  setVisible(v) { this.root.visible = v; }
  setHeight(h) { this.H = h; this.body.scale.setScalar(h); }
  /** start a one-shot action ("swipeL","swipeR","slam","scream","raise","throw","bash","kneel","twitch","laugh") */
  play(act, dur = 1) { this.act = act; this.actT = 0; this.actDur = dur; }
  stop() { this.act = null; }
  setEyes(on) { for (const e of this.eyeMeshes) e.visible = on; }
  flashHit() { this.hit = 1; }
  /** world position of a joint (head = 4, wrists 7/10) into out */
  jointWorld(i, out) { this.joints[i].getWorldPosition(out); return out; }
  headWorld(out) { this.joints[J.head].getWorldPosition(out); out.y += 0.06 * this.H; return out; }

  _set(i, x, y, z) { const T = this.tgt; T[i * 3] += x; T[i * 3 + 1] += y; T[i * 3 + 2] += z; }

  update(dt) {
    if (!this.root.visible) return;
    this.t += dt;
    if (this.freeze > 0 && !this.ik.on && this.ik.w < 0.01) { this.freeze -= dt; return; }       // unsettling dead stop
    const T = this.tgt; T.fill(0);
    const sp = this.speed, mode = this.mode;
    const freq = mode === "crawl" || mode === "ceiling" ? 9 : mode === "run" ? 6.5 + sp * 0.12 : 2.2 + sp * 0.5;
    if (sp > 0.05 || mode === "crawl" || mode === "ceiling") this.phase += dt * freq * (mode === "run" ? 1 : clamp(sp / 2 + 0.3, 0.3, 1.6));
    const ph = this.phase, s1 = Math.sin(ph), c1 = Math.cos(ph);
    let hipsY = 0.5;
    // ---- base posture (hunched, head craned up to look at you) ----
    this._set(J.spine, 0.1 + this.lean, 0, 0); this._set(J.chest, 0.24, 0, 0); this._set(J.neck, 0.35, 0, 0);
    this._set(J.head, -0.62 - this.lean * 0.8, 0, 0);
    this._set(J.shL, 0.05, 0, 0.1); this._set(J.shR, 0.05, 0, -0.1);
    this._set(J.elL, -0.18, 0, 0); this._set(J.elR, -0.18, 0, 0);
    const breathe = Math.sin(this.t * 1.3) * 0.03;
    this._set(J.chest, breathe, 0, 0);
    // ---- locomotion ----
    if (mode === "walk" || mode === "run" || (mode === "idle" && sp > 0.05)) {
      const A = mode === "run" ? 0.85 : clamp(0.25 + sp * 0.09, 0.25, 0.6);
      this._set(J.hipL, -s1 * A, 0, 0.02); this._set(J.hipR, s1 * A, 0, -0.02);
      this._set(J.knL, 0.12 + A * 1.3 * Math.max(0, Math.sin(ph + 1.3)), 0, 0);
      this._set(J.knR, 0.12 + A * 1.3 * Math.max(0, Math.sin(ph + 1.3 + Math.PI)), 0, 0);
      this._set(J.anL, s1 * 0.2, 0, 0); this._set(J.anR, -s1 * 0.2, 0, 0);
      hipsY -= Math.abs(c1) * 0.012 + (mode === "run" ? 0.03 : 0);
      if (mode === "run") {
        // lurching sprint: torso low, arms reaching forward and clawing
        this._set(J.spine, 0.45, Math.sin(ph) * 0.08, 0); this._set(J.chest, 0.3, 0, 0); this._set(J.head, -0.85, 0, 0);
        this._set(J.shL, -1.1 + Math.sin(ph * 2) * 0.35, 0, 0.15); this._set(J.shR, -1.1 + Math.sin(ph * 2 + 1.7) * 0.35, 0, -0.15);
        this._set(J.elL, -0.3, 0, 0); this._set(J.elR, -0.3, 0, 0);
      } else {
        // arms barely swing: they dangle and lag, the head stays dead still (counter-rotation)
        this._set(J.shL, Math.sin(ph - 0.6) * 0.13, 0, 0); this._set(J.shR, -Math.sin(ph - 0.6) * 0.13, 0, 0);
        this._set(J.spine, 0, s1 * 0.05, 0); this._set(J.head, 0, -s1 * 0.05, 0);
      }
    } else if (mode === "crawl" || mode === "ceiling") {
      // all fours, spidery: torso horizontal, knees high
      this._set(J.spine, 1.35, 0, Math.sin(ph) * 0.1); this._set(J.chest, 0.1, 0, 0); this._set(J.neck, -0.2, 0, 0);
      this._set(J.head, -0.95, Math.sin(ph * 0.5) * 0.3, 0);
      this._set(J.shL, -1.55 - s1 * 0.6, 0, 0.35); this._set(J.shR, -1.55 + s1 * 0.6, 0, -0.35);
      this._set(J.elL, -0.25 + Math.max(0, s1) * 0.4, 0, 0); this._set(J.elR, -0.25 + Math.max(0, -s1) * 0.4, 0, 0);
      this._set(J.hipL, -1.1 + s1 * 0.5, 0, 0.45); this._set(J.hipR, -1.1 - s1 * 0.5, 0, -0.45);
      this._set(J.knL, 1.9, 0, 0); this._set(J.knR, 1.9, 0, 0);
      hipsY = 0.3;
    } else if (mode === "kneel") {
      this._set(J.hipL, -1.35, 0, 0.05); this._set(J.knL, 1.45, 0, 0); this._set(J.anL, -0.1, 0, 0);
      this._set(J.hipR, 0.2, 0, -0.05); this._set(J.knR, 2.3, 0, 0); this._set(J.anR, 0.6, 0, 0);
      this._set(J.spine, 0.35, 0, 0); this._set(J.head, 0.4, 0, 0.2);
      this._set(J.shL, 0.1, 0, 0.05); this._set(J.shR, 0.1, 0, -0.05);
      hipsY = 0.27;
    } else if (mode === "hang") {
      // dangling limp from nothing (ending / scurry wind-up)
      this._set(J.head, 0.9, 0, 0.5); this._set(J.shL, 0.2, 0, 0.02); this._set(J.shR, 0.2, 0, -0.02);
      this._set(J.hipL, 0.1, 0, 0); this._set(J.hipR, 0.05, 0, 0);
    }
    // ---- one-shot actions ----
    if (this.act) {
      this.actT += dt; const k = clamp(this.actT / this.actDur, 0, 1);
      const a = this.act;
      if (a === "swipeL" || a === "swipeR") {
        const L = a === "swipeL", si = L ? 1 : -1, sh = L ? J.shL : J.shR, el = L ? J.elL : J.elR;
        if (k < 0.6) { const w = k / 0.6; this._set(sh, -2.5 * w, 0, 0.7 * si * w); this._set(el, -0.4 * w, 0, 0); this._set(J.chest, 0, 0.5 * si * w, 0); }
        else { const w = (k - 0.6) / 0.4; this._set(sh, lerp(-2.5, -1.2, w), 0, lerp(0.7, -1.1, Math.min(1, w * 2.2)) * si); this._set(J.chest, 0, lerp(0.5, -0.6, w) * si, 0); this._set(J.spine, 0.2 * w, 0, 0); }
      } else if (a === "slam" || a === "raise") {
        if (k < 0.65 || a === "raise") { const w = Math.min(1, k / 0.65); this._set(J.shL, -2.9 * w, 0, 0.25 * w); this._set(J.shR, -2.9 * w, 0, -0.25 * w); this._set(J.chest, -0.25 * w, 0, 0); this._set(J.head, -0.3 * w, 0, 0); }
        else { const w = Math.min(1, (k - 0.65) / 0.12); this._set(J.shL, lerp(-2.9, -0.9, w), 0, 0.1); this._set(J.shR, lerp(-2.9, -0.9, w), 0, -0.1); this._set(J.spine, 0.55 * w, 0, 0); this._set(J.chest, 0.3 * w, 0, 0); hipsY -= 0.06 * w; }
      } else if (a === "scream") {
        const w = Math.min(1, k * 4);
        this._set(J.head, -0.9 * w, Math.sin(this.t * 60) * 0.06 * w, Math.sin(this.t * 47) * 0.05 * w);
        this._set(J.chest, -0.35 * w, 0, 0); this._set(J.spine, -0.15 * w, 0, 0);
        this._set(J.shL, -0.5 * w, 0, 1.25 * w); this._set(J.shR, -0.5 * w, 0, -1.25 * w);
        this._set(J.elL, -0.3 * w, 0, 0); this._set(J.elR, -0.3 * w, 0, 0);
      } else if (a === "throw") {
        if (k < 0.55) { const w = k / 0.55; this._set(J.shR, -2.8 * w, 0, -0.3 * w); this._set(J.chest, 0, -0.6 * w, 0); }
        else { const w = Math.min(1, (k - 0.55) / 0.15); this._set(J.shR, lerp(-2.8, -0.6, w), 0, -0.1); this._set(J.chest, 0, lerp(-0.6, 0.5, w), 0); }
      } else if (a === "bash" || a === "shield") {
        this._set(J.shL, -1.25, 0.2, 0.3); this._set(J.elL, -1.35, 0, 0); this._set(J.chest, 0, 0.35, 0);
        if (a === "bash") this._set(J.spine, 0.35, 0, 0);
      } else if (a === "stomp") {
        const up = k < 0.5 ? k / 0.5 : Math.max(0, 1 - (k - 0.5) / 0.1);
        this._set(J.hipL, -1.1 * up, 0, 0.1); this._set(J.knL, 1.4 * up, 0, 0); this._set(J.shL, 0, 0, 0.5 * up); this._set(J.shR, 0, 0, -0.5 * up);
      } else if (a === "reach") { // giant: lay right arm across the disc (ramp)
        const w = smoothK(k); this._set(J.spine, 0.75 * w, 0, 0); this._set(J.chest, 0.45 * w, 0, 0); this._set(J.shR, -1.35 * w, 0, -0.05 * w);
        this._set(J.elR, -0.05 * w, 0, 0); this._set(J.head, 0.1 * w, 0, 0); hipsY -= 0.08 * w;
        this._set(J.knL, 0.6 * w, 0, 0); this._set(J.knR, 0.6 * w, 0, 0); this._set(J.hipL, -0.5 * w, 0, 0); this._set(J.hipR, -0.5 * w, 0, 0);
      } else if (a === "palm") { // giant: slam one palm flat on the disc
        const w = k < 0.6 ? smoothK(k / 0.6) * 0.6 : 0.6 + Math.min(1, (k - 0.6) / 0.08) * 0.4;
        this._set(J.spine, 0.8 * w, 0, 0); this._set(J.chest, 0.35 * w, 0, 0); this._set(J.shL, -1.45 * w, 0, 0.15 * w);
        this._set(J.elL, -0.1, 0, 0); this._set(J.knL, 0.9 * w, 0, 0); this._set(J.knR, 0.9 * w, 0, 0);
        this._set(J.hipL, -0.6 * w, 0, 0); this._set(J.hipR, -0.6 * w, 0, 0); hipsY -= 0.12 * w;
      } else if (a === "sweep") { // giant: flat hand sweep across the disc, left to right
        this._set(J.spine, 0.75, 0, 0); this._set(J.chest, 0.3, lerp(0.9, -0.9, k), 0);
        this._set(J.shR, -1.35, 0, lerp(-0.9, 0.7, k)); this._set(J.elR, -0.05, 0, 0); hipsY -= 0.1;
        this._set(J.knL, 0.8, 0, 0); this._set(J.knR, 0.8, 0, 0); this._set(J.hipL, -0.5, 0, 0); this._set(J.hipR, -0.5, 0, 0);
      } else if (a === "laugh") {
        this._set(J.head, -0.5 + Math.sin(this.t * 22) * 0.12, 0, 0); this._set(J.chest, -0.15 + Math.sin(this.t * 22) * 0.06, 0, 0);
        this._set(J.shL, 0, 0, 0.5); this._set(J.shR, 0, 0, -0.5);
      } else if (a === "twitch") {
        this._set(J.head, 0, 0, Math.sin(this.t * 70) * 0.5); this._set(J.chest, 0, Math.sin(this.t * 53) * 0.3, 0);
        this._set(J.shL, Math.sin(this.t * 41) * 0.6, 0, 0.3); this._set(J.shR, Math.sin(this.t * 37) * 0.6, 0, -0.3);
      }
      if (k >= 1 && this.act !== "shield" && this.act !== "raise" && this.act !== "reach") this.act = null;
    }
    if (this.shieldUp > 0 && this.shield) { this._set(J.shL, -1.25 * this.shieldUp, 0.2 * this.shieldUp, 0.3 * this.shieldUp); this._set(J.elL, -1.35 * this.shieldUp, 0, 0); }
    // ---- twitch overlay (snaps, not eased) ----
    this.twitchT -= dt;
    if (this.twitchT <= 0) {
      this.twitchT = 1.2 + hash1(this.t * 3.1) * 3.2; this.twitchLeft = 0.18 + hash1(this.t * 7.7) * 0.45;
      this.twX = (hash1(this.t) - 0.5) * 0.6; this.twY = (hash1(this.t + 9) - 0.5) * 1.1; this.twZ = (hash1(this.t + 3) - 0.5) * 1.5;
      if (hash1(this.t * 1.7) < 0.12) this.freeze = 0.35 + hash1(this.t * 2.3) * 0.5;
    }
    const fing = 0.25 + vnoise(this.t * 1.7) * 0.35;
    // ---- integrate ----
    const C = this.cur, rate = this.act === "swipeL" || this.act === "swipeR" || this.act === "slam" || this.act === "palm" ? 22 : 9;
    for (let i = 0; i < NJ * 3; i++) C[i] = damp(C[i], T[i], rate, dt);
    if (this.twitchLeft > 0) { this.twitchLeft -= dt; C[J.head * 3] += 0; }
    for (let i = 0; i < NJ; i++) {
      const o = this.joints[i];
      if (i === J.head && this.twitchLeft > 0) o.rotation.set(C[i * 3] + this.twX, C[i * 3 + 1] + this.twY, C[i * 3 + 2] + this.twZ);
      else o.rotation.set(C[i * 3], C[i * 3 + 1], C[i * 3 + 2]);
    }
    for (let i = 0; i < this.fingers.length; i++) this.fingers[i].rotation.x = fing + Math.sin(this.t * 3 + i) * 0.15;
    this.hipsY = damp(this.hipsY, hipsY, 10, dt);
    this.joints[J.hips].position.y = this.hipsY;
    // arm IK blend
    this.ik.w = damp(this.ik.w, this.ik.on ? 1 : 0, 5, dt);
    if (this.ik.w > 0.002) this._solveIK();
    // ceiling / melt / hit flash
    this.body.rotation.z = this.ceiling * Math.PI;
    this.body.position.y = this.ceiling * this.H;
    if (this.melt > 0) { this.body.scale.set(this.H * (1 + this.melt * 0.6), this.H * Math.max(0.02, 1 - this.melt), this.H * (1 + this.melt * 0.6)); }
    if (this.hit > 0) this.hit = Math.max(0, this.hit - dt * 5);
    for (const c of this.cores) {
      c.mesh.visible = c.glow > 0.01;
      if (c.mesh.visible) c.mesh.scale.setScalar((0.014 + 0.006 * Math.sin(this.t * 12)) * (0.6 + c.glow * 0.4) * (c.name === "face" ? 1.3 : 1));
      c.mesh.getWorldPosition(c.pos);
    }
  }
}
let S = null;
function initScratch(THREE) {
  S = { t: new THREE.Vector3(), d: new THREE.Vector3(), pole: new THREE.Vector3(), n: new THREE.Vector3(), u: new THREE.Vector3(),
    e: new THREE.Vector3(), f: new THREE.Vector3(), down: new THREE.Vector3(0, -1, 0), q1: new THREE.Quaternion(), q2: new THREE.Quaternion(), qi: new THREE.Quaternion() };
}
function smoothK(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
Hollow.J = J;

/** per-frame shared material animation (call once per frame) */
export function tickShared(dt, hitFlash) {
  if (!R) return;
  R.inkU.uTime.value += dt;
  R.inkU.uHit.value = hitFlash || 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Shadow rat (pooled by the owner)
export class ShadowRat {
  constructor(THREE, engine) {
    const r = resources(THREE, engine);
    this.root = new THREE.Group(); this.root.visible = false;
    const body = new THREE.Mesh(r.ball, r.ink); body.scale.set(0.16, 0.13, 0.3); body.position.y = 0.15; body.castShadow = true;
    const head = new THREE.Mesh(r.cone, r.ink); head.scale.set(0.09, 0.24, 0.09); head.rotation.x = Math.PI * 0.5; head.position.set(0, 0.16, 0.22);
    this.root.add(body, head);
    for (let s = -1; s <= 1; s += 2) {
      const e = new THREE.Mesh(r.ballLo, r.eyeRed); e.scale.setScalar(0.022); e.position.set(0.05 * s, 0.2, 0.3); this.root.add(e);
      const ear = new THREE.Mesh(r.ball, r.ink); ear.scale.set(0.045, 0.05, 0.015); ear.position.set(0.07 * s, 0.27, 0.22); this.root.add(ear);
    }
    this.tail = new THREE.Group(); this.tail.position.set(0, 0.14, -0.28); this.root.add(this.tail);
    const tl = new THREE.Mesh(r.limb, r.ink); tl.scale.set(0.016, 0.5, 0.016); tl.rotation.x = -1.35; this.tail.add(tl);
    this.body = body; this.t = Math.random() * 10;
    // gameplay
    this.alive = false; this.hp = 0; this.pos = this.root.position; this.vel = new THREE.Vector3(); this.cd = 0;
    this.removeHit = null; this.id = "";
  }
  update(dt, speed) {
    this.t += dt * (4 + speed * 2);
    this.body.position.y = 0.15 + Math.abs(Math.sin(this.t * 2)) * 0.03;
    this.tail.rotation.y = Math.sin(this.t * 1.3) * 0.6;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Liquid black sword + puddle
export class LiquidSword {
  constructor(THREE) {
    const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uSolid: { value: 0 }, uRust: { value: 0 }, uDissolve: { value: 0 }, uPulse: { value: 0 },
    }]);
    const vs = `
      attribute float edge;
      uniform float uTime; uniform float uSolid;
      varying vec3 vN; varying vec3 vV; varying float vEdge; varying vec3 vP;
      #include <fog_pars_vertex>
      void main(){
        vec3 p = position;
        float liq = 1.0 - uSolid;
        float w = sin(p.y * 11.0 + uTime * 3.1) * sin(p.x * 13.0 - uTime * 2.3) + sin(p.z * 9.0 + uTime * 1.9) * 0.5;
        p += normal * w * 0.035 * liq;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal); vV = -mvPosition.xyz; vEdge = edge; vP = p;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`;
    const fs = `
      uniform float uTime; uniform float uSolid; uniform float uRust; uniform float uDissolve; uniform float uPulse;
      varying vec3 vN; varying vec3 vV; varying float vEdge; varying vec3 vP;
      #include <fog_pars_fragment>
      float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){
        float dn = n3(vP * 9.0) * 0.6 + n3(vP * 23.0) * 0.4;
        if (uDissolve > 0.0 && dn < uDissolve) discard;
        vec3 n = normalize(vN); vec3 v = normalize(vV);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 l = normalize(vec3(0.4, 0.8, 0.3));
        vec3 h = normalize(l + v);
        float rough = mix(0.04, 0.12, uSolid);
        float spec = pow(max(dot(n, h), 0.0), mix(90.0, 260.0, uSolid)) * mix(1.4, 2.2, uSolid);
        vec3 sky = mix(vec3(0.05, 0.04, 0.07), vec3(0.55, 0.5, 0.6), clamp(reflect(-v, n).y * 0.5 + 0.5, 0.0, 1.0));
        vec3 col = vec3(0.006) + sky * fres * 0.9 + vec3(spec);
        // ripples travelling over the liquid
        col += vec3(0.04, 0.03, 0.06) * (1.0 - uSolid) * sin(vP.y * 30.0 - uTime * 4.0) * fres;
        // faint red edge once solid
        float e = smoothstep(0.72, 1.0, vEdge) * uSolid;
        col += vec3(0.9, 0.04, 0.03) * e * (0.55 + 0.45 * uPulse);
        // rust
        float rn = n3(vP * 14.0);
        vec3 rust = mix(vec3(0.28, 0.12, 0.05), vec3(0.45, 0.22, 0.08), rn);
        col = mix(col, rust * (0.5 + 0.5 * max(dot(n, l), 0.0)), clamp(uRust * 1.4 - (1.0 - rn) * 0.4, 0.0, 1.0));
        if (uDissolve > 0.0) col += vec3(0.8, 0.75, 0.7) * smoothstep(uDissolve + 0.06, uDissolve, dn);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`;
    this.mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: vs, fragmentShader: fs, fog: true });
    this.u = u;
    this.root = new THREE.Group(); this.root.visible = false;
    // blade outline (point down at y = 0), length 1.7 m
    const sh = new THREE.Shape();
    const L = 1.75, w = 0.075;
    sh.moveTo(0, 0); sh.lineTo(w, 0.22); sh.lineTo(w * 0.95, L); sh.lineTo(-w * 0.95, L); sh.lineTo(-w, 0.22); sh.lineTo(0, 0);
    const blade = new THREE.ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, steps: 1 });
    blade.translate(0, 0, -0.009);
    const pa = blade.attributes.position; const edge = new Float32Array(pa.count);
    for (let i = 0; i < pa.count; i++) {
      const y = pa.getY(i), x = Math.abs(pa.getX(i));
      const hw = y < 0.22 ? (y / 0.22) * w : w * 0.95; edge[i] = hw > 0.001 ? clamp(x / (hw + 0.012), 0, 1) : 1;
    }
    blade.setAttribute("edge", new THREE.BufferAttribute(edge, 1)); blade.computeVertexNormals();
    const zeroEdge = (g) => { g.setAttribute("edge", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1)); return g; };
    const guard = zeroEdge(new THREE.BoxGeometry(0.5, 0.06, 0.08)); guard.translate(0, L + 0.03, 0);
    const grip = zeroEdge(new THREE.CylinderGeometry(0.028, 0.032, 0.36, 10)); grip.translate(0, L + 0.24, 0);
    const pommel = zeroEdge(new THREE.SphereGeometry(0.055, 12, 8)); pommel.translate(0, L + 0.46, 0);
    this.sword = new THREE.Group();
    for (const g of [blade, guard, grip, pommel]) { const m = new THREE.Mesh(g, this.mat); m.castShadow = true; this.sword.add(m); }
    this.sword.position.y = -0.25; // sunk into the sand a little
    this.root.add(this.sword);
    const pg = zeroEdge(new THREE.CircleGeometry(1, 40)); pg.rotateX(-Math.PI * 0.5);
    this.puddle = new THREE.Mesh(pg, this.mat); this.puddle.position.y = 0.03; this.root.add(this.puddle);
    this.pos = this.root.position; this.t = 0;
    this.setStage(1, 1);
  }
  /** stage: puddle 0..1 size; form 0..1 sword rise (0 = in the puddle, 1 = standing) */
  setStage(puddle, form) {
    this.puddle.visible = puddle > 0.01; this.puddle.scale.setScalar(Math.max(0.01, puddle) * 2.4);
    this.sword.visible = form > 0.01; this.sword.scale.set(1, Math.max(0.01, form), 1);
    this.sword.position.y = -0.25 - (1 - form) * 0.5;
  }
  update(dt) {
    this.t += dt; this.u.uTime.value = this.t;
    this.u.uPulse.value = 0.5 + 0.5 * Math.sin(this.t * 1.6);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Girl (uses ENGINE humanoid when available, else a small fallback figure)
export function createGirl(THREE, engine, createHumanoid) {
  const r = resources(THREE, engine);
  let h = null;
  if (createHumanoid) {
    try {
      h = createHumanoid(THREE, engine, { height: 1.18, build: "child", skin: "#e8c4a8", shirt: "#f2efe8", pants: "#f2efe8",
        hair: "#3b2a1c", dress: "#f2efe8", eyes: "none" });
    } catch (e) { console.warn("[events] girl humanoid", e); h = null; }
  }
  const root = new THREE.Group(); root.visible = false;
  let head = null, headBone = null, k = 1;
  if (h) {
    root.add(h.root);
    // decorations ride an anchor at the face centre on the real head bone (h.head is the skull-top socket)
    headBone = h.bones ? h.bones[4] : null;
    const P = h.proportions || { headH: 0.16, headR: 0.13 };
    k = P.headR / 0.1;
    head = new THREE.Object3D(); head.position.set(0, P.headH * 0.95, 0.012);
    (headBone || h.head).add(head);
  }
  else {
    const dressM = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.8 });
    const skinM = new THREE.MeshStandardMaterial({ color: 0xe8c4a8, roughness: 0.7 });
    const hairM = new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 0.9 });
    const dress = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 12), dressM); dress.position.y = 0.3; root.add(dress);
    const knees = new THREE.Mesh(r.ball, dressM); knees.scale.set(0.16, 0.12, 0.14); knees.position.set(0, 0.32, 0.12); root.add(knees);
    head = new THREE.Object3D(); head.position.set(0, 0.6, 0.06); root.add(head);
    const hm = new THREE.Mesh(r.ball, skinM); hm.scale.setScalar(0.1); head.add(hm);
    const hair = new THREE.Mesh(r.ball, hairM); hair.scale.set(0.108, 0.105, 0.11); hair.position.set(0, 0.01, -0.012); head.add(hair);
    head.rotation.x = 0.9;
  }
  // red ribbon in her hair
  const ribM = new THREE.MeshStandardMaterial({ color: 0xb01218, roughness: 0.6 });
  const bow = new THREE.Group();
  const b1 = new THREE.Mesh(r.ball, ribM); b1.scale.set(0.05, 0.03, 0.02); b1.position.x = 0.04;
  const b2 = new THREE.Mesh(r.ball, ribM); b2.scale.set(0.05, 0.03, 0.02); b2.position.x = -0.04;
  const knot = new THREE.Mesh(r.ball, ribM); knot.scale.setScalar(0.018);
  bow.add(b1, b2, knot);
  if (head) { bow.position.set(0, 0.1 * k, -0.07 * k); bow.scale.setScalar(k); head.add(bow); }
  // the Hollow's mask hidden on her face (revealed on the turn)
  const mask = new THREE.Mesh(r.mask, r.bone); mask.scale.set(0.09 * k, 0.12 * k, 0.1 * k); mask.position.set(0, -0.02 * k, 0.0); mask.visible = false;
  if (head) head.add(mask);
  const eyes = [];
  for (let s = -1; s <= 1; s += 2) {
    const e = new THREE.Mesh(r.ballLo, r.eyeWhite); e.scale.setScalar(0.007 * k); e.position.set(0.03 * s * k, 0.0, 0.1 * k + 0.01); e.visible = false;
    if (head) head.add(e); eyes.push(e);
  }
  return { root, h, head, headBone, bow, mask, eyes, ribbonMat: ribM };
}

/** loose ribbon on the sand */
export function createRibbon(THREE, engine, mat) {
  const r = resources(THREE, engine);
  const g = new THREE.Group(); g.visible = false;
  const a = new THREE.Mesh(r.ball, mat); a.scale.set(0.09, 0.012, 0.035); a.position.set(0.05, 0.02, 0); a.rotation.y = 0.4;
  const b = new THREE.Mesh(r.ball, mat); b.scale.set(0.09, 0.012, 0.035); b.position.set(-0.05, 0.02, 0); b.rotation.y = -0.3;
  const t1 = new THREE.Mesh(r.box, mat); t1.scale.set(0.02, 0.006, 0.22); t1.position.set(0.02, 0.012, -0.12); t1.rotation.y = 0.3;
  g.add(a, b, t1);
  return g;
}

/** shadow human (red-eyed silhouette villager / royal guard) built from ENGINE humanoid when available */
export function createShadowHuman(THREE, engine, createHumanoid, kind) {
  const r = resources(THREE, engine);
  let h = null;
  if (createHumanoid) {
    try {
      h = createHumanoid(THREE, engine, { height: kind === "royal" ? 1.95 : 1.8, build: kind === "royal" ? "heavy" : "normal",
        skin: "#060608", shirt: "#08080b", pants: "#050507", hair: null, hat: kind === "royal" ? "helmet" : "straw", eyes: "red" });
      if (h.setEyes) h.setEyes("red");
    } catch (e) { console.warn("[events] shadow humanoid", e); h = null; }
  }
  const root = new THREE.Group(); root.visible = false;
  if (h) root.add(h.root);
  else {
    const b = new THREE.Mesh(r.limbUp, r.ink); b.scale.set(0.22, 1.3, 0.16); root.add(b);
    const hd = new THREE.Mesh(r.ball, r.ink); hd.scale.setScalar(0.14); hd.position.y = 1.55; root.add(hd);
    for (let s = -1; s <= 1; s += 2) { const e = new THREE.Mesh(r.ballLo, r.eyeRed); e.scale.setScalar(0.02); e.position.set(0.05 * s, 1.58, 0.12); root.add(e); }
  }
  return { root, h, kind };
}

export { wrapAngle };
