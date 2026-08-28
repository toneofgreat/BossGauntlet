// src/games/overtime/game.js — Overtime. Spec 14 §5.5 owns this Place.
//
// One point per second of presence, and you lose all of it the moment you leave. There
// is deliberately NO save file: `dispose` throws the score away and `init` starts at
// zero, because a score you keep is a different game from the one that was asked for.
//
// Everyone wears their time above their head. The leader's label is yellow and everyone
// else's is black — which means the label has to be recomputed from the room roster every
// time it repaints, not cached per player.
//
// Alone, you are the leader and your label is yellow. That is not a fake competition; it
// is what a room of one honestly looks like (ARCHITECTURE.md §9).

const POINT_S = 1;            // §6 OVERTIME_POINT_S — seconds per point
const PUBLISH_S = 0.5;        // how often our score goes to the room
const LABEL_S = 0.25;         // how often the head labels are repainted
const LABEL_HEIGHT = 7.4;     // studs above the rig root; clears the name tag
const LABEL_W = 256;
const LABEL_H = 72;
const LABEL_SCALE = 3.0;
const LEADER_COLOR = "#f7c948"; // yellow — the leader
const OTHER_COLOR = "#101216";  // black — everyone else

let state = null;   // { score, publishIn, labelIn }
let root = null;    // THREE.Group holding OUR label
let rootId = null;
let labels = null;  // Map<peerId, {sprite, tex, mat, canvas, text, color}>
let selfLabel = null;
let ui = null;

// M:SS, or H:MM:SS once it has been long enough to deserve it.
export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

export const meta = {
  slug: "overtime",
  name: "Overtime",
  icon: "⏱️",
  description: "A point a second for as long as you stay. Leave and you lose the lot.",
  version: "1.0.0",
};

function makeLabel(THREE, text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_W;
  canvas.height = LABEL_H;
  const g = canvas.getContext("2d");
  paintLabel(g, text, color);
  const tex = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  // Named so a test can tell an Overtime score label from the platform name tag that
  // sits on the same rig -- both are sprites with canvas textures.
  sprite.name = "overtime-label";
  sprite.scale.set(LABEL_SCALE, (LABEL_SCALE * LABEL_H) / LABEL_W, 1);
  sprite.position.y = LABEL_HEIGHT;
  sprite.renderOrder = 1000;
  return { sprite, tex, mat, canvas, ctx: g, text: null, color: null };
}

function paintLabel(g, text, color) {
  g.clearRect(0, 0, LABEL_W, LABEL_H);
  // A pill behind the text so black stays readable against a dark floor and yellow
  // stays readable against a bright one.
  g.fillStyle = color === LEADER_COLOR ? "rgba(20,18,4,0.55)" : "rgba(255,255,255,0.66)";
  const r = 20;
  g.beginPath();
  g.moveTo(r, 6); g.lineTo(LABEL_W - r, 6);
  g.quadraticCurveTo(LABEL_W - 6, 6, LABEL_W - 6, 6 + r);
  g.lineTo(LABEL_W - 6, LABEL_H - 6 - r);
  g.quadraticCurveTo(LABEL_W - 6, LABEL_H - 6, LABEL_W - 6 - r, LABEL_H - 6);
  g.lineTo(r, LABEL_H - 6);
  g.quadraticCurveTo(6, LABEL_H - 6, 6, LABEL_H - 6 - r);
  g.lineTo(6, 6 + r); g.quadraticCurveTo(6, 6, r, 6);
  g.fill();
  g.fillStyle = color;
  g.font = "bold 44px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, LABEL_W / 2, LABEL_H / 2 + 1, LABEL_W - 28);
}

function setLabel(entry, text, color) {
  if (entry.text === text && entry.color === color) return; // no needless canvas work
  entry.text = text;
  entry.color = color;
  paintLabel(entry.ctx, text, color);
  entry.tex.needsUpdate = true;
}

// The leader is whoever has the most points, us included. A tie KEEPS the current
// leader rather than flickering between equals — `>` not `>=`, deliberately.
function leaderIdOf(roster, myScore, myId) {
  let bestId = myId;
  let best = myScore;
  for (const p of roster) {
    const score = p && p.state && Number.isFinite(p.state.score) ? p.state.score : 0;
    if (score > best) { best = score; bestId = p.id; }
  }
  return bestId;
}

export function init(ctx) {
  const THREE = ctx.engine.THREE;
  state = { score: 0, publishIn: 0, labelIn: 0, hadTools: null };
  labels = new Map();

  root = new THREE.Group();
  root.name = "overtime-labels";
  rootId = ctx.engine.parts.addCustom(root);

  // Our own label rides the player's rig, so it follows without any bookkeeping.
  selfLabel = makeLabel(THREE, "0:00", LEADER_COLOR);
  const rig = ctx.player.avatar;
  if (rig) rig.add(selfLabel.sprite);

  ui = ctx.services.ui && typeof ctx.services.ui.setHudStat === "function"
    ? ctx.services.ui
    : null;
  // A label above your OWN head is behind the camera, so the HUD carries it too.
  // The HUD chip takes a {icon,label,value} spec, not a string.
  if (ui) ui.setHudStat("overtime-score", { icon: "⏱️", label: "Time", value: "0:00" });
  if (ctx.services.ui && typeof ctx.services.ui.toast === "function") {
    ctx.services.ui.toast("Every second here is a point. Walk out and you lose them all.");
  }
}

export function update(dt, ctx) {
  if (!state) return;

  // Sim seconds, never wall clock: a throttled tab must not be able to out-earn an
  // attentive one (ARCHITECTURE.md §5).
  state.score += dt / POINT_S;

  const net = ctx.services.net;
  const roster = net && typeof net.roster === "function" ? net.roster() : [];
  const myId = net && typeof net.self === "function" ? net.self().id : null;

  state.publishIn -= dt;
  if (state.publishIn <= 0) {
    state.publishIn = PUBLISH_S;
    // Rounded before publishing: the room compares whole points, and sending 14 decimal
    // places would make every tick a change worth broadcasting.
    if (net && typeof net.publish === "function") {
      net.publish({ score: Math.floor(state.score) });
    }
  }

  state.labelIn -= dt;
  if (state.labelIn > 0) return;
  state.labelIn = LABEL_S;

  const myScore = Math.floor(state.score);
  const leaderId = leaderIdOf(roster, myScore, myId);
  const iLead = leaderId === myId;

  // Spec 18: the yellow number IS the permission. Whoever leads gets OofTools, and
  // loses them the moment somebody passes them — the button appears and disappears
  // with the lead, and the server refuses build ops from anyone who is not leading
  // anyway, so this only decides whether to offer it.
  if (iLead !== state.hadTools) {
    state.hadTools = iLead;
    if (ctx.services.ui && typeof ctx.services.ui.setBuilder === "function") {
      ctx.services.ui.setBuilder(iLead);
    }
    if (iLead && ctx.services.ui && typeof ctx.services.ui.toast === "function") {
      ctx.services.ui.toast("You are leading — OofTools unlocked (🛠)");
    }
  }

  if (selfLabel) setLabel(selfLabel, clock(myScore), iLead ? LEADER_COLOR : OTHER_COLOR);
  if (ui) {
    ui.setHudStat("overtime-score", {
      icon: iLead ? "👑" : "⏱️",
      label: iLead ? "Leading" : "Time",
      value: clock(myScore),
    });
  }

  // One label per remote player, parented to their rig so it follows them. The rigs are
  // built by the platform (spec 13 §5.4); we look them up by the name their record has.
  const seen = new Set();
  for (const p of roster) {
    if (!p.pos) continue;
    seen.add(p.id);
    let entry = labels.get(p.id);
    if (!entry) {
      entry = makeLabel(ctx.engine.THREE, "0:00", OTHER_COLOR);
      labels.set(p.id, entry);
      root.add(entry.sprite);
    }
    const score = p.state && Number.isFinite(p.state.score) ? p.state.score : 0;
    setLabel(entry, clock(score), p.id === leaderId ? LEADER_COLOR : OTHER_COLOR);
    // Parented to the scene rather than their rig, so this Place does not have to reach
    // into the platform's remote-player bookkeeping: put it where they are.
    entry.sprite.position.set(p.pos[0], p.pos[1] + LABEL_HEIGHT, p.pos[2]);
  }
  for (const [id, entry] of labels) {
    if (seen.has(id)) continue;
    root.remove(entry.sprite);
    entry.mat.dispose();
    entry.tex.dispose();
    labels.delete(id);
  }
}

export function dispose(ctx) {
  // The score dies here, on purpose. Nothing is written to saves and nothing is carried
  // to the next visit: that is the whole rule of this Place.
  if (selfLabel) {
    const rig = ctx.player && ctx.player.avatar;
    if (rig) rig.remove(selfLabel.sprite);
    selfLabel.mat.dispose();
    selfLabel.tex.dispose();
    selfLabel = null;
  }
  if (labels) {
    for (const entry of labels.values()) { entry.mat.dispose(); entry.tex.dispose(); }
    labels.clear();
    labels = null;
  }
  if (rootId !== null) ctx.engine.parts.remove(rootId);
  root = null;
  rootId = null;
  if (ui && typeof ui.removeHudStat === "function") ui.removeHudStat("overtime-score");
  ui = null;
  state = null;
}

// Test seam (spec 14 §8): the score without waiting for a repaint.
export function debugScore() {
  return state ? Math.floor(state.score) : null;
}
