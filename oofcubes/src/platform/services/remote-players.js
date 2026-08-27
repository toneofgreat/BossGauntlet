// src/platform/services/remote-players.js — draws the other people in your room.
// Spec 13 §5.4 owns this file.
//
// One real avatar rig per remote player, built through avatar.createRig() with the
// config THEY sent, so the person you see is wearing what they chose rather than a
// generic stand-in. Their motion is interpolated by net.js between the last two samples
// it received; this module only asks where to put them and puts them there.
//
// Two rules from §5.4 that are load-bearing rather than cosmetic:
//
//   1. Remote avatars are NON-COLLIDING. They are Three objects added to the scene, and
//      are never registered with physics — nothing here can push a player, block a jump,
//      or knock anyone off a stage. With an unreliable transport and a relay that is
//      authoritative over nothing, player-vs-player collision would be a grief vector
//      and a desync source at once.
//   2. Nothing is drawn that is not a live person. There is no pooling of "spare"
//      avatars, no fade-out ghost left behind on `bye`, and no placeholder while a
//      player's first `move` is outstanding — a peer with no position yet is simply not
//      drawn (ARCHITECTURE.md §9).

const TAG_HEIGHT = 6.4; // studs above the rig root; clears a 5-unit avatar's head
const TAG_W = 256;
const TAG_H = 64;
const TAG_SCALE = 3.2;

export function createRemotePlayers(deps) {
  const { THREE, scene, net, createRig } = deps;
  const drawn = new Map(); // id -> { rig, root, tag, tagText }

  function makeTag(text) {
    const canvas = document.createElement("canvas");
    canvas.width = TAG_W;
    canvas.height = TAG_H;
    const g = canvas.getContext("2d");
    g.clearRect(0, 0, TAG_W, TAG_H);
    g.fillStyle = "rgba(14,16,24,0.72)";
    g.beginPath();
    // a rounded pill, drawn by hand: no CSS here, it is a texture
    const r = 18;
    g.moveTo(r, 4); g.lineTo(TAG_W - r, 4); g.quadraticCurveTo(TAG_W - 4, 4, TAG_W - 4, 4 + r);
    g.lineTo(TAG_W - 4, TAG_H - 4 - r); g.quadraticCurveTo(TAG_W - 4, TAG_H - 4, TAG_W - 4 - r, TAG_H - 4);
    g.lineTo(r, TAG_H - 4); g.quadraticCurveTo(4, TAG_H - 4, 4, TAG_H - 4 - r);
    g.lineTo(4, 4 + r); g.quadraticCurveTo(4, 4, r, 4);
    g.fill();
    g.fillStyle = "#f2f4fa";
    g.font = "bold 30px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text || "player", TAG_W / 2, TAG_H / 2, TAG_W - 24);
    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(TAG_SCALE, (TAG_SCALE * TAG_H) / TAG_W, 1);
    sprite.position.y = TAG_HEIGHT;
    // Drawn over the world so a name stays readable through a wall — the same choice
    // the obby's stage titles make.
    sprite.renderOrder = 999;
    return { sprite, tex, mat, canvas };
  }

  function spawn(peer) {
    if (drawn.has(peer.id)) return drawn.get(peer.id);
    const rig = createRig(peer.avatar || null);
    // buildRig may or may not have added itself to the scene depending on how it was
    // constructed; adopt its root either way and own it from here.
    const root = rig && (rig.root || rig.group || rig.object3D);
    if (!root) return null;
    if (root.parent !== scene) scene.add(root);
    const tag = makeTag(peer.name);
    root.add(tag.sprite);
    const entry = { rig, root, tag, tagText: peer.name };
    drawn.set(peer.id, entry);
    return entry;
  }

  function despawn(id) {
    const e = drawn.get(id);
    if (!e) return;
    drawn.delete(id);
    if (e.tag) {
      e.root.remove(e.tag.sprite);
      e.tag.mat.dispose();
      e.tag.tex.dispose();
    }
    if (e.root && e.root.parent) e.root.parent.remove(e.root);
    if (e.rig && typeof e.rig.dispose === "function") e.rig.dispose();
  }

  function update(dt) {
    const live = net.roster();
    const seen = new Set();
    for (const peer of live) {
      if (!peer.pos) continue; // §5.4 rule 2: nothing is drawn until they have a position
      seen.add(peer.id);
      let e = drawn.get(peer.id);
      if (!e) { e = spawn(peer); if (!e) continue; }
      const at = net.interpolated(peer) || { pos: peer.pos, yaw: peer.yaw };
      // The rig root sits at the FEET, the same offset the shell applies to the local
      // player — otherwise every remote avatar floats by half its height.
      e.root.position.set(at.pos[0], at.pos[1] - (deps.feetOffset || 0), at.pos[2]);
      e.root.rotation.y = at.yaw;
      if (e.rig && typeof e.rig.setAnimState === "function") {
        e.rig.setAnimState({ mode: peer.anim || "idle", speed: peer.anim === "walk" ? 16 : 0 });
      }
      if (e.rig && typeof e.rig.update === "function") e.rig.update(dt);
      if (peer.name !== e.tagText) {
        e.root.remove(e.tag.sprite);
        e.tag.mat.dispose();
        e.tag.tex.dispose();
        e.tag = makeTag(peer.name);
        e.tagText = peer.name;
        e.root.add(e.tag.sprite);
      }
    }
    for (const id of [...drawn.keys()]) if (!seen.has(id)) despawn(id);
  }

  function dispose() {
    for (const id of [...drawn.keys()]) despawn(id);
    drawn.clear();
  }

  return { update, dispose, count: () => drawn.size, has: (id) => drawn.has(id) };
}
