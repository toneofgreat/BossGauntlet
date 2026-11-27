// portals.js - portal visuals (black-glass / violet ring, inward smoke swirl shader, hum) + the portal and gate
// controllers (CONTRACT 6: world.portal(id), world.gate(id)). Distance checks run in WORLD's system: no triggers.

import { PORTALS } from "./zones.js";

const PI = Math.PI;

const SWIRL_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SWIRL_FRAG = `uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform float uFade; varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p); if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float sw = a * 2.0 + r * 5.0 - uTime * 0.9;
    float f = n(vec2(sw, r * 3.0 - uTime * 0.6)) * 0.6 + n(vec2(sw * 2.0, r * 7.0 + uTime * 0.4)) * 0.4;
    float core = smoothstep(0.75, 0.0, r);
    vec3 c = mix(uB, uA, f * (1.0 - core * 0.8));
    c *= 0.35 + 0.9 * smoothstep(1.0, 0.55, r) * (0.6 + 0.4 * f);
    c = mix(c, vec3(0.0), core * 0.85);
    float rim = smoothstep(0.82, 1.0, r);
    c += uA * rim * 0.8;
    gl_FragColor = vec4(c, uFade * (0.92 - rim * 0.3));
  }`;

export function buildPortals(W) {
  const { K, THREE, ctx } = W;
  const M = (n, o) => K.mat(n, o);
  const portals = {};
  const list = [];
  const colors = {
    black: { a: "#3a3a52", b: "#050508", ring: "#0b0b10" },
    violet: { a: "#7a3ac8", b: "#12061e", ring: "#1a1024" },
  };
  for (const id of Object.keys(PORTALS)) {
    const d = PORTALS[id];
    const c = colors[d.color] || colors.violet;
    const root = new THREE.Group();
    root.name = "portal:" + id;
    // ring of black glass with a few jagged shards
    const ringM = K.custom("portalRing" + d.color, () => new THREE.MeshStandardMaterial({ color: c.ring, roughness: 0.08, metalness: 0.7 }));
    const ring = new THREE.Mesh(K.torusGeo(1.55, 0.16, 10, 40), ringM);
    ring.position.y = 1.75; ring.castShadow = true;
    root.add(ring);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * PI * 2;
      const sh = new THREE.Mesh(K.coneGeo(0.08, 0.5 + (i % 3) * 0.2, 4), ringM);
      sh.position.set(Math.cos(a) * 1.72, 1.75 + Math.sin(a) * 1.72, 0);
      sh.rotation.z = a - PI / 2;
      root.add(sh);
    }
    const base = new THREE.Mesh(K.cylGeo(1.0, 1.2, 0.18, 16), ringM);
    base.position.y = 0.09; root.add(base);
    K.bake(root);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: K.timeU, uA: { value: new THREE.Color(c.a) }, uB: { value: new THREE.Color(c.b) }, uFade: { value: 1 } },
      vertexShader: SWIRL_VERT, fragmentShader: SWIRL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const disc = new THREE.Mesh(K.circleGeo(1.5, 40), mat);
    disc.rotation.x = PI / 2;  // circleGeo is horizontal; stand it up
    disc.position.y = 1.75;
    disc.renderOrder = 6;
    root.add(disc);
    // soft ground glow
    const glowM = new THREE.MeshBasicMaterial({ color: c.a, transparent: true, opacity: 0.18, depthWrite: false });
    const gl = new THREE.Mesh(K.circleGeo(2.4, 24), glowM); gl.position.y = 0.03; gl.renderOrder = 5; root.add(gl);
    root.position.set(d.pos[0], d.pos[1], d.pos[2]);
    root.rotation.y = d.yaw || 0;
    W.worldRoot.add(root);
    let hum = null;
    const p = {
      id, root, def: d, mat,
      _active: false, _scale: 0, onEnter: null,
      pos: { x: d.pos[0], y: d.pos[1], z: d.pos[2] },
      get active() { return this._active; },
      setActive(v) {
        v = !!v;
        if (v === this._active) return;
        this._active = v;
        if (v) { root.visible = true; } else if (hum) { try { hum.stop(0.4); } catch (e) { /* */ } hum = null; }
      },
      setPos(q) {
        if (!q) return;
        this.pos.x = q.x; this.pos.z = q.z;
        this.pos.y = q.y != null ? q.y : W.h(q.x, q.z);
        root.position.set(this.pos.x, this.pos.y, this.pos.z);
        if (hum && hum.setPos) try { hum.setPos({ x: this.pos.x, y: this.pos.y + 1.7, z: this.pos.z }); } catch (e) { /* */ }
      },
      // called by WORLD each frame (dt) with camera distance squared
      _tick(dt, camD2) {
        const tgt = this._active ? 1 : 0;
        if (this._scale !== tgt) {
          this._scale += Math.sign(tgt - this._scale) * dt * 1.6;
          this._scale = Math.max(0, Math.min(1, this._scale));
          const s = 0.001 + this._scale;
          root.scale.set(s, s, s);
          mat.uniforms.uFade.value = this._scale;
          if (this._scale <= 0) root.visible = false;
        }
        // hum within 120 m
        const au = ctx.audio;
        if (this._active && camD2 < 120 * 120) {
          if (!hum && au && au.loop) { try { hum = au.loop("portal_hum", { pos: { x: this.pos.x, y: this.pos.y + 1.7, z: this.pos.z }, vol: 0.7 }); } catch (e) { hum = null; } }
        } else if (hum) { try { hum.stop(0.5); } catch (e) { /* */ } hum = null; }
      },
      _reset() { this.onEnter = null; this.setPos({ x: d.pos[0], y: d.pos[1], z: d.pos[2] }); this.setActive(!!d.active); },
    };
    // terrain-snap the default position (desert/forest/hollow pockets have dunes)
    if (d.pos[1] === 0) p.setPos({ x: d.pos[0], z: d.pos[2] });
    p._active = !!d.active;
    p._scale = p._active ? 1 : 0;
    root.visible = p._active;
    root.scale.setScalar(p._active ? 1 : 0.001);
    portals[id] = p;
    list.push(p);
  }
  return { portals, list };
}

// Gate controllers. `vis` = { leaves:[hinge Groups] | lift:Group, col, kind:"swing"|"lift", pos }
export function makeGate(W, id, vis) {
  let isOpen = false, t = 0, target = 0;
  const g = {
    id, vis,
    get isOpen() { return isOpen; },
    open(animated = true) {
      if (isOpen) return;
      isOpen = true; target = 1;
      if (!animated) t = 1, apply();
      W.colEnabled(vis.col, false);
      const au = W.ctx.audio;
      if (animated && au && au.sfx) try { au.sfx("gate_open", { pos: { x: vis.pos.x, y: vis.pos.y + 2, z: vis.pos.z } }); } catch (e) { /* */ }
    },
    close() {
      isOpen = false; target = 0; t = 0; apply();
      W.colEnabled(vis.col, true);
    },
    _tick(dt) {
      if (t === target) return;
      t += Math.sign(target - t) * dt * 0.45;
      t = Math.max(0, Math.min(1, t));
      apply();
    },
  };
  function apply() {
    const e = t * t * (3 - 2 * t);
    if (vis.kind === "swing") for (const hg of vis.leaves) hg.rotation.y = hg.userData.baseYaw + hg.userData.side * 1.35 * e;
    else if (vis.lift) vis.lift.position.y = vis.lift.userData.closedY + (vis.lift.userData.openY - vis.lift.userData.closedY) * e;
  }
  if (vis.leaves) for (const hg of vis.leaves) hg.userData.baseYaw = hg.rotation.y;
  apply();
  return g;
}
