// npcs.js - NPC bodies (CONTRACT 6: world.npc(id)). Built with ENGINE's createHumanoid when available; a small
// self-contained fallback humanoid keeps WORLD working (and the dev harness rendering) without it.
// Bodies idle-animate, turn toward the player when close (unless a lookAt target is set), get red eyes in cycle 1.

const PI = Math.PI;

export const NPC_DEFS = {
  bram: { pos: [3, 0.3, 6.5], yaw: 0.25, zone: "lobby",
    opts: { height: 1.72, build: "normal", skin: "#d8a888", shirt: "#7a6a4a", pants: "#4a3c2c", hair: "#d8d4cc", beard: true, hat: "straw" } },
  nessa: { pos: [3, 0, 70.6], yaw: PI + 0.4, zone: "bridge",
    opts: { height: 1.68, build: "slim", skin: "#e0b090", shirt: "#6a7a5a", pants: "#4a3c2c", hair: "#6a3a20", hat: "bandana", dress: "#5a4a6a" } },
  tobin: { pos: [-22, 0, 77.2], yaw: PI / 2 - 0.3, zone: "ratField", seat: false,
    opts: { height: 1.25, build: "child", skin: "#e8b898", shirt: "#a83a2a", pants: "#3a4a6a", hair: "#8a5a2a" } },
  ilsa: { pos: [-9, 0, 232], yaw: Math.atan2(9, 8), zone: "village", action: "sit",
    opts: { height: 1.6, build: "slim", skin: "#e8c0a0", shirt: "#4a5a6a", pants: "#3a3a3a", hair: "#e0dcd4", dress: "#4a5a6a" } },
  pell: { pos: [6.8, 0.4, 251.2], yaw: Math.atan2(-6.8, -11.2), zone: "village",
    opts: { height: 1.78, build: "slim", skin: "#d8a070", shirt: "#c8a040", pants: "#5a2a4a", hair: "#3a2a1a", cape: "#6a2a5a", hat: "bandana" } },
  odo: { pos: [12.52, 0, 225.39], yaw: -0.709, zone: "village",
    opts: { height: 1.76, build: "heavy", skin: "#e0a880", shirt: "#c8b890", pants: "#4a3c2c", hair: "#5a3a2a", beard: true } },
  wren: { pos: [-6, 18, 440], yaw: PI, zone: "castle",
    opts: { height: 1.8, build: "slim", skin: "#e0b090", shirt: "#e0d0a0", pants: "#7a1e22", hair: "#2a1a10", cape: "#7a1e22" } },
  fydorIdle: { pos: [-5, 0, 302], yaw: PI, zone: "guardPost", gear: "halberd",
    opts: { height: 2.05, build: "heavy", skin: "#d8a888", shirt: "#5a6a7a", pants: "#3a3a40", hair: "#9a9a98", beard: true, hat: "helmet" } },
  mylesIdle: { pos: [5, 0, 302], yaw: PI, zone: "guardPost", gear: "shield",
    opts: { height: 1.86, build: "slim", skin: "#e0b090", shirt: "#4a5a7a", pants: "#3a3a40", hair: "#6a4a2a", hat: null } },
};

export async function buildNpcs(W) {
  const { K, THREE, ctx } = W;
  let createHumanoid = null;
  try {
    const mod = await import("../engine/humanoid.js");
    createHumanoid = mod && mod.createHumanoid;
  } catch (e) { createHumanoid = null; }
  const npcs = {};
  for (const id of Object.keys(NPC_DEFS)) {
    const d = NPC_DEFS[id];
    let human = null;
    try {
      if (createHumanoid) human = createHumanoid(THREE, ctx.engine, Object.assign({ eyes: "normal" }, d.opts));
    } catch (e) { console.warn("[world] createHumanoid", id, e); human = null; }
    if (!human) human = fallbackHuman(K, d.opts);
    const root = new THREE.Group();
    root.name = "npc:" + id;
    root.add(human.root);
    root.position.set(d.pos[0], d.pos[1], d.pos[2]);
    root.rotation.y = d.yaw;
    if (d.gear) attachGear(K, human, d.gear, root);
    if (d.opts.dress === undefined && id === "mylesIdle") attachScarf(K, root, d.opts.height);
    const zone = W.zones[d.zone];
    (zone ? zone.root : W.worldRoot).add(root);
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const st = { target: null, restYaw: d.yaw, visible: true };
    const npc = {
      id, root, pos: root.position, human,
      lookAt(p) { st.target = p ? { x: p.x, y: p.y, z: p.z } : null; },
      setVisible(v) { st.visible = !!v; root.visible = !!v; },
      play(action, opts) { try { return human.play(action, opts); } catch (e) { return Promise.resolve(); } },
      get visible() { return st.visible; },
      _st: st, _def: d,
    };
    if (d.action) { try { human.play(d.action, { loop: true }); } catch (e) { /* */ } }
    npcs[id] = npc;
  }
  return npcs;
}

// per-frame NPC update (no allocation): idle anim + smooth turning
export function updateNpcs(npcs, list, dt, player, camPos) {
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (!n._st.visible || !n.root.parent || !n.root.parent.visible) continue;
    const dx = camPos.x - n.pos.x, dz = camPos.z - n.pos.z;
    if (dx * dx + dz * dz > 90 * 90) continue;
    let ty = n._st.restYaw;
    const t = n._st.target;
    if (t) ty = Math.atan2(t.x - n.pos.x, t.z - n.pos.z);
    else if (player && !n._def.action) {
      const px = player.x - n.pos.x, pz = player.z - n.pos.z;
      if (px * px + pz * pz < 25) ty = Math.atan2(px, pz);
    }
    let d = ty - n.root.rotation.y;
    while (d > PI) d -= 2 * PI;
    while (d < -PI) d += 2 * PI;
    const turning = Math.abs(d) > 0.05;
    n.root.rotation.y += d * Math.min(1, dt * 4);
    try { n.human.update(dt, turning ? 0.6 : 0, false); } catch (e) { /* keep going */ }
  }
}

function attachGear(K, human, gear, root) {
  const THREE = K.THREE;
  if (gear === "halberd") {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(K.cylGeo(0.03, 0.035, 2.4, 6), K.mat("woodDark")); pole.position.y = 0.4; g.add(pole);
    const blade = new THREE.Mesh(K.boxGeo(0.04, 0.45, 0.35), K.mat("iron")); blade.position.set(0, 1.4, 0.14); g.add(blade);
    const spike = new THREE.Mesh(K.coneGeo(0.04, 0.3, 5), K.mat("iron")); spike.position.y = 1.75; g.add(spike);
    if (human.hand) human.hand.add(g); else { g.position.set(0.35, 0.9, 0.1); root.add(g); }
  } else if (gear === "shield") {
    const sw = new THREE.Group();
    const blade = new THREE.Mesh(K.boxGeo(0.06, 0.9, 0.02), K.mat("iron")); blade.position.y = 0.5; sw.add(blade);
    const guard = new THREE.Mesh(K.boxGeo(0.25, 0.04, 0.05), K.mat("gold")); guard.position.y = 0.05; sw.add(guard);
    if (human.hand) human.hand.add(sw); else { sw.position.set(0.35, 0.9, 0.1); root.add(sw); }
    const sh = new THREE.Mesh(K.cylGeo(0.42, 0.42, 0.06, 18), K.mat("clothBlue", { color: "#2c4a7e" }));
    sh.rotation.z = PI / 2; sh.rotation.y = PI / 2;
    sh.position.set(-0.36, 1.05, 0.12);
    const boss = new THREE.Mesh(K.sphereGeo(0.09, 8, 6), K.mat("iron")); boss.position.set(-0.4, 1.05, 0.12);
    root.add(sh, boss);
  }
}
function attachScarf(K, root, height) {
  const THREE = K.THREE;
  const s = new THREE.Mesh(K.torusGeo(0.12, 0.045, 6, 14), K.mat("clothRed", { color: "#a8642a" }));
  s.rotation.x = PI / 2; s.position.y = height * 0.82;
  const tail = new THREE.Mesh(K.boxGeo(0.1, 0.35, 0.03), K.mat("clothRed", { color: "#a8642a" }));
  tail.position.set(0.07, height * 0.74, 0.12); tail.rotation.z = 0.2;
  root.add(s, tail);
}

// A modest stand-in when ENGINE's humanoid isn't available: capsule body, head, eyes, arms, legs + simple idle.
export function fallbackHuman(K, o) {
  const THREE = K.THREE;
  o = o || {};
  const H = o.height || 1.8;
  const s = H / 1.8;
  const bw = o.build === "heavy" ? 1.25 : o.build === "slim" ? 0.88 : 1;
  const root = new THREE.Group();
  const skin = K.flat(o.skin || "#e0b090", 0.7), shirt = K.flat(o.shirt || "#6b7d5a", 0.9), pants = K.flat(o.pants || "#4a3c2c", 0.9);
  const mk = (g, m, x, y, z) => { const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.castShadow = true; root.add(me); return me; };
  const legL = mk(K.cylGeo(0.07 * bw, 0.06, 0.82 * s, 8), pants, -0.1 * bw, 0.41 * s, 0);
  const legR = mk(K.cylGeo(0.07 * bw, 0.06, 0.82 * s, 8), pants, 0.1 * bw, 0.41 * s, 0);
  const torso = mk(K.cylGeo(0.17 * bw, 0.15 * bw, 0.62 * s, 10), shirt, 0, 1.12 * s, 0);
  if (o.dress) mk(K.cylGeo(0.17 * bw, 0.3 * bw, 0.7 * s, 12), K.flat(o.dress, 0.95), 0, 0.62 * s, 0);
  const armL = mk(K.cylGeo(0.05, 0.045, 0.62 * s, 6), shirt, -0.23 * bw, 1.1 * s, 0);
  const armR = mk(K.cylGeo(0.05, 0.045, 0.62 * s, 6), shirt, 0.23 * bw, 1.1 * s, 0);
  const head = mk(K.sphereGeo(0.12 * s, 12, 10), skin, 0, 1.58 * s, 0);
  if (o.hair) mk(K.sphereGeo(0.125 * s, 12, 8), K.flat(o.hair, 0.95), 0, 1.62 * s, -0.02);
  if (o.beard) mk(K.sphereGeo(0.09 * s, 10, 8), K.flat(o.hair || "#888", 0.95), 0, 1.5 * s, 0.07);
  if (o.hat === "straw") { mk(K.cylGeo(0.26 * s, 0.26 * s, 0.02, 14), K.mat("straw"), 0, 1.7 * s, 0); mk(K.cylGeo(0.1 * s, 0.12 * s, 0.1, 12), K.mat("straw"), 0, 1.75 * s, 0); }
  if (o.hat === "helmet") mk(K.sphereGeo(0.135 * s, 12, 8), K.mat("iron"), 0, 1.63 * s, 0);
  if (o.cape) { const c = mk(K.boxGeo(0.4 * bw, 0.9 * s, 0.03), K.flat(o.cape, 0.95), 0, 1.0 * s, -0.17 * bw); c.rotation.x = 0.08; }
  const eyes = [];
  const eyeN = K.flat("#0c0a08", 0.3), eyeR = K.glow("#ff1c14", 2.2);
  for (const sx of [-1, 1]) eyes.push(mk(K.sphereGeo(0.016 * s, 6, 4), eyeN, sx * 0.045 * s, 1.6 * s, 0.11 * s));
  const hand = new THREE.Object3D(); hand.position.set(0.25 * bw, 0.8 * s, 0.05); root.add(hand);
  let t = Math.random() * 10, mode = "idle";
  return {
    root, hand, head,
    update(dt, speed) {
      t += dt;
      const sw = speed > 0.1 ? Math.sin(t * 6) * 0.4 : 0;
      legL.rotation.x = sw; legR.rotation.x = -sw;
      armL.rotation.x = -sw * 0.8 + (mode === "sit" ? -1.2 : 0); armR.rotation.x = sw * 0.8;
      torso.scale.y = 1 + Math.sin(t * 1.6) * 0.01;
      if (mode === "sit") { legL.rotation.x = legR.rotation.x = -1.45; root.position.y = -0.4 * s; }
      else root.position.y = 0;
    },
    play(action, op) { mode = action === "sit" ? "sit" : "idle"; return new Promise((r) => setTimeout(r, op && op.loop ? 0 : 600)); },
    setEyes(m) { for (const e of eyes) e.material = m === "red" || m === "glow" ? eyeR : eyeN; for (const e of eyes) e.visible = m !== "none"; },
    setColors() {}, setVisible(v) { root.visible = !!v; }, dispose() {},
  };
}
