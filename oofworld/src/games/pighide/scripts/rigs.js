// src/games/pighide/scripts/rigs.js - PIG HIDE's rig plumbing (spec 27 §2.4, §9.0, §9.4, §9.5).
//
// What this module owns:
// - pairing the platform's remote OofRig roots to roster peer ids (remote-players stores no
//   id on a root, so the pairing is by nearest position, sticky once made);
// - parenting a Place-built LOOK (pig model, hunter model) under a rig root, with the rig's
//   own OofRigBody hidden while the look is on, and restoring it afterwards;
// - hiding and restoring the remote name-tag sprites;
// - the through-walls x-ray silhouettes (red for the Pig Detector, yellow for the Pig Radar).
//
// What it NEVER does (§9.4): set a rig root's `.visible` (remote-players owns that every tick,
// and only round.js asks it to hide a peer), touch or dispose a rig's own materials (they
// are the engine's shared cache), or call net.setPeerHidden.
//
// House rules: sim time only (dt), no banned timer identifiers, every object it builds is
// disposed by it.

import { TUNE } from "./config.js";

const SELF_IDS = new Set(["local", "self"]);
const BODY_NAMES = ["OofRigBody", "OofAura"];

function disposeDeep(obj) {
  if (!obj) return;
  if (obj.parent) obj.parent.remove(obj);
  obj.traverse((o) => {
    if (o.geometry && typeof o.geometry.dispose === "function") o.geometry.dispose();
    const m = o.material;
    if (Array.isArray(m)) m.forEach((x) => x && x.dispose && x.dispose());
    else if (m && typeof m.dispose === "function") {
      if (m.map && typeof m.map.dispose === "function") m.map.dispose();
      m.dispose();
    }
  });
}

export function createRigs(ctx, S) {
  const THREE = ctx.engine.THREE;
  const scene = ctx.engine.scene;
  const parts = ctx.engine.parts;
  const avatar = () => ctx.player.avatar;

  const pairs = new Map();       // peerId -> remote root
  const pairMiss = new Map();    // peerId -> consecutive pairing passes its root sat far from it
  const looks = new Map();       // root -> look object
  const bodyHidden = new Map();  // root -> [nodes we hid]
  const tagHidden = new Set();   // roots whose sprites we hid
  let pairT = 0;
  let disposed = false;

  // x-ray state
  let xr = null;   // { color, t, total, red, entries: [{ target, mesh, parent }], holder, holderId, geo, mat }

  // ---------------------------------------------------------------------------------------
  // Pairing (§9.0)
  // ---------------------------------------------------------------------------------------

  function isSelfId(id) {
    return SELF_IDS.has(id) || (id != null && id === S.selfId);
  }

  function liveRoot(root) {
    return !!root && root.parent === scene;
  }

  function remoteRoots() {
    const me = avatar();
    const out = [];
    for (const o of scene.children) {
      if (o && o.name === "OofRig" && o !== me) out.push(o);
    }
    return out;
  }

  function repair() {
    const roots = remoteRoots();
    const peers = S.peers && typeof S.peers.values === "function" ? Array.from(S.peers.values()) : [];
    const peerIds = new Set(peers.map((p) => p && p.id));

    const peerById = new Map(peers.filter(Boolean).map((p) => [p.id, p]));

    // Drop pairs whose root left the scene or whose peer left the roster. A position-guessed
    // pair (no platform tag) is also re-checked: a root that sits far from its peer for two
    // passes in a row was matched to the wrong person, so it is dropped and re-matched.
    for (const [id, root] of Array.from(pairs)) {
      if (!liveRoot(root) || !peerIds.has(id)) { pairs.delete(id); pairMiss.delete(id); continue; }
      const tag = root.userData && root.userData.peerId;
      if (typeof tag === "string") {
        if (tag !== id) { pairs.delete(id); pairMiss.delete(id); }
        continue;
      }
      const p = peerById.get(id);
      if (!p || !Array.isArray(p.pos)) continue;
      const dx = root.position.x - p.pos[0];
      const dz = root.position.z - p.pos[2];
      if (dx * dx + dz * dz > TUNE.RIG_PAIR_R2 * 4) {
        const n = (pairMiss.get(id) || 0) + 1;
        if (n >= 2) { pairs.delete(id); pairMiss.delete(id); } else pairMiss.set(id, n);
      } else {
        pairMiss.delete(id);
      }
    }
    for (const id of Array.from(pairMiss.keys())) if (!pairs.has(id)) pairMiss.delete(id);
    const usedRoots = new Set(pairs.values());

    // A future platform tag wins outright.
    for (const root of roots) {
      const pid = root.userData && root.userData.peerId;
      if (typeof pid === "string" && peerIds.has(pid) && !usedRoots.has(root)) {
        const prev = pairs.get(pid);
        if (prev && prev !== root) usedRoots.delete(prev);
        pairs.set(pid, root);
        usedRoots.add(root);
      }
    }

    // Greedy nearest-XZ for the rest (untagged roots only).
    const freeRoots = roots.filter((r) => !usedRoots.has(r)
      && !(r.userData && typeof r.userData.peerId === "string"));
    const freePeers = peers.filter((p) => p && Array.isArray(p.pos) && !pairs.has(p.id));
    if (!freeRoots.length || !freePeers.length) return;
    const cand = [];
    for (const r of freeRoots) {
      for (const p of freePeers) {
        const dx = r.position.x - p.pos[0];
        const dz = r.position.z - p.pos[2];
        const d2 = dx * dx + dz * dz;
        if (d2 < TUNE.RIG_PAIR_R2) cand.push({ r, p, d2 });
      }
    }
    cand.sort((a, b) => a.d2 - b.d2);
    // Ambiguous: a root with two candidate peers within 1 stud of each other (two players
    // at the same spawn) is left unpaired this pass and retried once they move apart.
    const ambiguous = new Set();
    for (const r of freeRoots) {
      const mine = cand.filter((c) => c.r === r);
      if (mine.length >= 2) {
        const a = mine[0].p.pos, b = mine[1].p.pos;
        if ((a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2 < 1) ambiguous.add(r);
      }
    }
    const takenR = new Set();
    const takenP = new Set();
    for (const c of cand) {
      if (ambiguous.has(c.r)) continue;
      if (takenR.has(c.r) || takenP.has(c.p.id)) continue;
      takenR.add(c.r);
      takenP.add(c.p.id);
      pairs.set(c.p.id, c.r);
    }
  }

  // A look attached to a root that has left the scene is ours to dispose (§9.0).
  function sweepDeadRoots() {
    const me = avatar();
    for (const [root, look] of Array.from(looks)) {
      if (root === me || liveRoot(root)) continue;
      disposeDeep(look);
      looks.delete(root);
      bodyHidden.delete(root);
    }
    for (const root of Array.from(tagHidden)) {
      if (root !== me && !liveRoot(root)) tagHidden.delete(root);
    }
  }

  function rigFor(id) {
    if (disposed) return null;
    if (isSelfId(id)) return avatar() || null;
    let root = pairs.get(id);
    if (root && !liveRoot(root)) { pairs.delete(id); root = null; }
    return root || null;
  }

  // ---------------------------------------------------------------------------------------
  // Looks
  // ---------------------------------------------------------------------------------------

  function hideBody(root) {
    if (bodyHidden.has(root)) {
      for (const n of bodyHidden.get(root)) n.visible = false;
      return;
    }
    const hidden = [];
    for (const c of root.children) {
      if (BODY_NAMES.includes(c.name) && c.visible) { c.visible = false; hidden.push(c); }
    }
    bodyHidden.set(root, hidden);
  }

  function restoreBody(root) {
    const hidden = bodyHidden.get(root);
    if (hidden) for (const n of hidden) n.visible = true;
    bodyHidden.delete(root);
  }

  function setLook(id, look) {
    if (disposed) { if (look) disposeDeep(look); return; }
    const root = rigFor(id);
    if (!root) return;
    const old = looks.get(root);
    if (old && old !== look) {
      disposeDeep(old);
      looks.delete(root);
    }
    if (look && look.isObject3D) {
      hideBody(root);
      if (look.parent !== root) root.add(look);
      look.traverse((o) => { o.frustumCulled = false; });
      looks.set(root, look);
    } else {
      restoreBody(root);
    }
  }

  function setTagVisible(id, visible) {
    const root = rigFor(id);
    if (!root || root === avatar()) return;
    for (const c of root.children) if (c.isSprite) c.visible = !!visible;
    if (visible) tagHidden.delete(root);
    else tagHidden.add(root);
  }

  // ---------------------------------------------------------------------------------------
  // Clones (where they are drawn)
  // ---------------------------------------------------------------------------------------

  function clonePos(ownerId) {
    let cn = null;
    if (isSelfId(ownerId)) cn = S.pig && S.pig.cn;
    else {
      const v = S.peers && S.peers.get ? S.peers.get(ownerId) : null;
      cn = v && v.st ? v.st.cn : null;
    }
    if (!cn || cn.a !== 1 || !Array.isArray(cn.p)) return null;
    return [cn.p[0], cn.p[1], cn.p[2]];
  }

  // ---------------------------------------------------------------------------------------
  // X-ray (§9.5)
  // ---------------------------------------------------------------------------------------

  function silhouette(geo, mat) {
    const g = new THREE.Group();
    g.name = "PHXray";
    const body = new THREE.Mesh(geo.body, mat);
    body.rotation.x = Math.PI / 2;
    body.position.set(0, TUNE.PIG_CENTER_Y, 0);
    const head = new THREE.Mesh(geo.head, mat);
    head.position.set(0, TUNE.PIG_CENTER_Y + 0.35, 1.45);
    const halo = new THREE.Mesh(geo.ring, mat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(0, 0.1, 0);
    for (const m of [body, head, halo]) {
      m.renderOrder = 1000;
      m.frustumCulled = false;
      g.add(m);
    }
    return g;
  }

  function clearXray() {
    if (!xr) return;
    for (const e of xr.entries) if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
    if (xr.holderId != null) { try { parts.remove(xr.holderId); } catch { /* gone */ } }
    xr.geo.body.dispose();
    xr.geo.head.dispose();
    xr.geo.ring.dispose();
    xr.mat.dispose();
    xr = null;
  }

  function xray(color, seconds, targets) {
    if (disposed) return;
    clearXray();
    const secs = Number.isFinite(seconds) && seconds > 0 ? seconds : 1;
    const geo = {
      body: new THREE.CapsuleGeometry(0.95, 1.5, 4, 10),
      head: new THREE.SphereGeometry(0.8, 12, 10),
      ring: new THREE.RingGeometry(1.6, 2.1, 24),
    };
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false,
    });
    xr = { color, t: secs, total: secs, red: color !== TUNE.XRAY_YELLOW, entries: [], holder: null, holderId: null, geo, mat };
    const seen = new Set();
    for (const t of Array.isArray(targets) ? targets : []) {
      if (typeof t !== "string" || seen.has(t)) continue;
      seen.add(t);
      addTarget(t);
    }
  }

  function ensureHolder() {
    if (xr.holder) return xr.holder;
    const g = new THREE.Group();
    g.name = "PHXrayClones";
    xr.holder = g;
    try { xr.holderId = parts.addCustom(g); } catch { xr.holderId = null; scene.add(g); }
    return g;
  }

  function addTarget(t) {
    const mesh = silhouette(xr.geo, xr.mat);
    if (t.startsWith("clone:")) {
      const owner = t.slice(6);
      const p = clonePos(owner);
      if (!p) return;
      ensureHolder().add(mesh);
      mesh.position.set(p[0], p[1], p[2]);
      xr.entries.push({ target: t, owner, mesh, parent: xr.holder });
      return;
    }
    const root = rigFor(t);
    if (!root) return;
    if (root === avatar()) {
      root.add(mesh);
      xr.entries.push({ target: t, mesh, parent: root });
      return;
    }
    // Not a child of the rig: a Creeper hidden by setPeerHidden (root.visible = false every
    // tick) must still flash through the walls, so this follows the root from the holder.
    ensureHolder().add(mesh);
    mesh.position.copy(root.position);
    mesh.quaternion.copy(root.quaternion);
    xr.entries.push({ target: t, mesh, parent: xr.holder, root });
  }

  function tickXray(dt) {
    if (!xr) return;
    xr.t -= dt;
    if (xr.t <= 0) { clearXray(); return; }
    const age = xr.total - xr.t;
    let op;
    if (xr.red) op = 0.8 + 0.2 * Math.sin(age * Math.PI * 2 * 8);
    else op = 0.9 * Math.min(1, age / 0.3, xr.t / 0.3);
    xr.mat.opacity = Math.max(0.05, op);
    for (let i = xr.entries.length - 1; i >= 0; i--) {
      const e = xr.entries[i];
      if (e.owner !== undefined) {
        const p = clonePos(e.owner);
        if (!p) { e.mesh.parent && e.mesh.parent.remove(e.mesh); xr.entries.splice(i, 1); continue; }
        e.mesh.position.set(p[0], p[1], p[2]);
      } else if (e.root) {
        if (!liveRoot(e.root)) {
          if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
          xr.entries.splice(i, 1);
          continue;
        }
        e.mesh.position.copy(e.root.position);
        e.mesh.quaternion.copy(e.root.quaternion);
      } else if (e.parent !== avatar() && !liveRoot(e.parent)) {
        if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
        xr.entries.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------------------------------

  function update(dt) {
    if (disposed) return;
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    pairT -= step;
    if (pairT <= 0) {
      pairT = TUNE.RIG_PAIR_S;
      repair();
      sweepDeadRoots();
    }
    tickXray(step);
  }

  function dispose() {
    if (disposed) return;
    clearXray();
    for (const [root, look] of looks) {
      disposeDeep(look);
      restoreBody(root);
    }
    looks.clear();
    for (const root of bodyHidden.keys()) restoreBody(root);
    bodyHidden.clear();
    for (const root of tagHidden) for (const c of root.children) if (c.isSprite) c.visible = true;
    tagHidden.clear();
    pairs.clear();
    pairMiss.clear();
    disposed = true;
  }

  return {
    update,
    rigFor,
    setLook,
    setTagVisible,
    xray,
    clonePos,
    dispose,
    // read-only peeks for debugState
    lookCount: () => looks.size,
    xrayLive: () => (xr ? xr.entries.length : 0),
    pairedCount: () => pairs.size,
  };
}
