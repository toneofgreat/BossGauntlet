// src/games/trollobby/scripts/layout.js — the course, as data. Spec 21 §3 owns this.
//
// Pure ESM: no DOM, no THREE, no ctx. That is deliberate and load-bearing — it is what
// lets tools/validate.js run the REAL generator and measure the REAL gaps, instead of
// checking a model of the course that can quietly disagree with the course.
//
// The course is unfair on purpose. It is not unfair by being unreachable: every jump
// here is inside the engine's envelope, and the trolling comes from the platform that
// is not there, the one that leaves, and the thing arriving from off-screen. A jump you
// physically cannot make is not a troll, it is a wall.

// The engine's flat-ground jump envelope is 8.733 studs (spec 08 §5.5's measurement).
// Nothing here goes past GAP_MAX; a gap over it would be a bug, not a joke.
export const GAP_MAX = 7.6;

export const KILL_Y = -25;
export const SPAWN = Object.freeze([-8, 10.1, 0]);
export const SPAWN_YAW = 90; // facing +X, down the course

const BASE_Y = 10;      // the top surface of section 1
const PLAT_T = 1;       // platform thickness

// Palette. The troll sections are pink/magenta so the theme reads instantly; the
// "safe-looking" bait is deliberately the friendliest green in the repo.
const C = Object.freeze({
  safe: "#4caf50",
  bait: "#7ee08a",
  stone: "#8d94a1",
  dark: "#3b3f4a",
  troll: "#ff36c8",
  trollDim: "#9c2a7d",
  gold: "#ffd93d",
  danger: "#e74c3c",
  belt: "#4a4f5c",
  arrow: "#ffd93d",
  glass: "#8fd0ff",
});

let seq = 0;
function pid(prefix) {
  seq += 1;
  return `tr-${prefix}-${seq}`;
}

function plat(x, y, z, sx, sz, opts = {}) {
  return {
    id: opts.id || pid(opts.tag || "p"),
    shape: opts.shape || "box",
    size: [sx, opts.thick || PLAT_T, sz],
    position: [x, y - (opts.thick || PLAT_T) / 2, z],
    color: opts.color || C.stone,
    material: opts.material || "plastic",
    ...(opts.transparency ? { transparency: opts.transparency } : {}),
    ...(opts.canCollide === false ? { canCollide: false } : {}),
    ...(opts.rotation ? { rotation: opts.rotation } : {}),
    ...(opts.behaviors ? { behaviors: opts.behaviors } : {}),
  };
}

function block(x, y, z, sx, sy, sz, opts = {}) {
  return {
    id: opts.id || pid(opts.tag || "b"),
    shape: opts.shape || "box",
    size: [sx, sy, sz],
    position: [x, y, z],
    color: opts.color || C.stone,
    material: opts.material || "plastic",
    ...(opts.transparency ? { transparency: opts.transparency } : {}),
    ...(opts.canCollide === false ? { canCollide: false } : {}),
    ...(opts.rotation ? { rotation: opts.rotation } : {}),
    ...(opts.behaviors ? { behaviors: opts.behaviors } : {}),
  };
}

// A touch trigger. Invisible, non-colliding, and wide enough that you cannot slip past
// it — a trigger you can miss makes the section that depends on it look broken.
function trigger(event, x, y, z, sx = 6, sy = 10, sz = 24) {
  return {
    id: pid("trig"),
    size: [sx, sy, sz],
    position: [x, y + sy / 2 - 1, z],
    color: "#ffffff",
    material: "plastic",
    transparency: 1,
    canCollide: false,
    behaviors: [{ type: "touchEvent", event, once: false, cooldownS: 1.5 }],
  };
}

// ---------------------------------------------------------------------------------
// The sections
// ---------------------------------------------------------------------------------
// Each returns { parts, vanish?, decoys?, emitters?, chasers?, dropFloor? } and every
// one names the single unfairness it is built around, so no section is just "more
// platforms".

// 1 — Welcome. A wide, friendly path whose last platform has no collider. Teaching the
// rule costs a life here and only here, because the spawn is ten seconds behind you.
function sectionWelcome(parts, out) {
  const y = BASE_Y;
  for (let i = 0; i < 4; i++) {
    parts.push(plat(8 + i * 12, y, 0, 8, 7, { color: C.safe, material: "grass", tag: "welcome" }));
  }
  // The decoy: same size, same colour, same everything — and nothing under your feet.
  const decoy = plat(56, y, 0, 8, 7, { color: C.safe, material: "grass", canCollide: false, tag: "decoy" });
  parts.push(decoy);
  out.decoys.push(decoy.id);
  // The platform past the decoy is real, and visible, which is what makes the decoy
  // work: the route looks continuous.
  parts.push(plat(68, y, 0, 8, 7, { color: C.safe, material: "grass", tag: "welcome" }));
  // The real route: a narrow ledge off to the side, reachable from platform 4.
  parts.push(plat(50, y, -8.5, 5, 4, { color: C.stone, tag: "ledge" }));
  parts.push(plat(60, y, -8.5, 5, 4, { color: C.stone, tag: "ledge" }));
  parts.push(block(56, y + 4.5, 0, 8, 0.4, 7, { color: C.troll, material: "neon", canCollide: false, tag: "hint" }));
  parts.push(trigger("tr:section", 4, y, 0));
  return { x: 68, y };
}

// 2 — Disappearing act. Every platform leaves 0.35 s after you land on it, on a stagger,
// so standing still to plan the next hop is itself the mistake.
function sectionVanish(parts, out, from) {
  let x = from.x + 8;
  let y = from.y;
  for (let i = 0; i < 12; i++) {
    const z = i % 2 === 0 ? 0 : (i % 4 === 1 ? 4.5 : -4.5);
    const p = plat(x, y, z, 5.5, 5.5, { color: C.troll, material: "neon", tag: "vanish" });
    parts.push(p);
    out.vanish.push(p.id);
    x += 6.5 + (i % 3) * 0.4;
    y += 0.35;
  }
  parts.push(plat(x + 4, y, 0, 9, 9, { color: C.stone, tag: "rest" }));
  parts.push(trigger("tr:section", from.x + 4, from.y, 0));
  return { x: x + 4, y };
}

// 3 — The popup gauntlet. The platforms are honest here; the screen is not.
function sectionPopups(parts, out, from) {
  let x = from.x + 10;
  let y = from.y;
  for (let i = 0; i < 9; i++) {
    const z = Math.sin(i * 1.1) * 5;
    parts.push(plat(x, y, z, 5, 5, { color: C.stone, tag: "pop" }));
    if (i % 3 === 1) out.popupTriggers.push({ x, y, z, kind: ["win", "error", "ad"][(i / 3) | 0] });
    x += 7.0;
    y += 0.2;
  }
  parts.push(plat(x + 4, y, 0, 9, 9, { color: C.stone, tag: "rest" }));
  parts.push(trigger("tr:section", from.x + 5, from.y, 0));
  return { x: x + 4, y };
}

// 4 — Bait and switch. The lit, wide, obvious path ends over nothing. The way on is the
// dark ledge you have to be suspicious enough to look for.
function sectionBait(parts, out, from) {
  const y = from.y;
  let x = from.x + 10;
  for (let i = 0; i < 5; i++) {
    parts.push(plat(x + i * 11, y, 0, 9, 8, { color: C.bait, material: "neon", tag: "bait" }));
  }
  // Arrows pointing you at the dead end, because of course.
  for (let i = 0; i < 4; i++) {
    parts.push(block(x + 4 + i * 11, y + 0.6, 0, 3, 0.3, 0.7,
      { color: C.gold, material: "neon", canCollide: false, tag: "arrow" }));
  }
  const dead = x + 4 * 11;
  parts.push(block(dead + 9, y + 3, 0, 0.6, 6, 10, { color: C.danger, material: "neon", transparency: 0.5, canCollide: false, tag: "wall" }));
  // The real way: three dim ledges, low and to the left.
  const zr = -12;
  for (let i = 0; i < 4; i++) {
    parts.push(plat(x + 6 + i * 7.2, y - 2.5, zr, 4.5, 4.5, { color: C.dark, tag: "real" }));
  }
  const endX = x + 6 + 3 * 7.2;
  parts.push(plat(endX + 8, y, 0, 10, 10, { color: C.stone, tag: "rest" }));
  parts.push(plat(endX + 4, y - 2.5, zr / 2, 5, 6, { color: C.dark, tag: "real" }));
  parts.push(trigger("tr:section", from.x + 5, y, 0));
  return { x: endX + 8, y };
}

// 5 — Incoming. Blockable projectiles on a fixed schedule, from emitters you can see.
// Everything about the timing is telegraphed; the annoyance is that the platforms are
// small and the knockback is not survivable.
function sectionIncoming(parts, out, from) {
  let x = from.x + 10;
  const y = from.y;
  for (let i = 0; i < 10; i++) {
    parts.push(plat(x, y, 0, 5.5, 6, { color: C.stone, tag: "inc" }));
    if (i % 2 === 0) {
      const z = i % 4 === 0 ? 16 : -16;
      parts.push(block(x + 2, y + 2.2, z, 2.4, 2.4, 2.4,
        { color: C.trollDim, material: "metal", tag: "emitter", id: pid("emit") }));
      out.emitters.push({
        id: parts[parts.length - 1].id,
        from: [x + 2, y + 2.2, z],
        dir: [0, 0, z > 0 ? -1 : 1],
        period: 2.4 + (i % 3) * 0.35,
        phase: (i * 0.7) % 2.4,
      });
    }
    x += 7.2;
  }
  parts.push(plat(x + 4, y, 0, 9, 9, { color: C.stone, tag: "rest" }));
  parts.push(trigger("tr:section", from.x + 5, y, 0));
  return { x: x + 4, y };
}

// 6 — The conveyor lie. Arrows painted one way, belt running the other.
function sectionConveyor(parts, out, from) {
  let x = from.x + 10;
  const y = from.y;
  for (let i = 0; i < 5; i++) {
    parts.push(plat(x + i * 22, y, 0, 20, 7, {
      color: C.belt, material: "metal", tag: "belt",
      behaviors: [{ type: "conveyor", direction: [-1, 0, 0], speed: 7 + i }],
    }));
    for (let a = 0; a < 3; a++) {
      parts.push(block(x - 6 + i * 22 + a * 6, y + 0.55, 0, 3.4, 0.25, 0.8,
        { color: C.arrow, material: "neon", canCollide: false, tag: "arrow" }));
    }
    if (i < 4) {
      parts.push(plat(x + 11 + i * 22, y, 0, 4, 7, { color: C.stone, tag: "belt-gap" }));
    }
  }
  const endX = x + 4 * 22 + 10;
  parts.push(plat(endX + 6, y, 0, 10, 10, { color: C.stone, tag: "rest" }));
  parts.push(trigger("tr:section", from.x + 5, y, 0));
  return { x: endX + 6, y };
}

// 7 — Chasers. A corridor narrow enough that dodging is not the answer; blocking is.
function sectionChasers(parts, out, from) {
  let x = from.x + 10;
  const y = from.y;
  const len = 96;
  parts.push(plat(x + len / 2, y, 0, len, 9, { color: C.dark, tag: "corridor" }));
  for (const z of [-5.4, 5.4]) {
    parts.push(block(x + len / 2, y + 3, z, len, 6, 0.8, { color: C.trollDim, material: "plastic", tag: "wall" }));
  }
  for (let i = 0; i < 3; i++) {
    out.chasers.push({
      home: [x + 22 + i * 30, y + 2, 0],
      range: 13,
      speed: 7.5 + i * 1.2,
      patrol: 11,
    });
  }
  parts.push(plat(x + len + 6, y, 0, 10, 10, { color: C.stone, tag: "rest" }));
  parts.push(trigger("tr:section", from.x + 5, y, 0));
  return { x: x + len + 6, y };
}

// 8 — The fake finish. A gold arch, confetti, and a pad that says YOU WIN. Touching it
// drops the floor. The way on is the ledge behind the arch, which you can only reach if
// you jump the instant it goes.
function sectionFakeFinish(parts, out, from) {
  let x = from.x + 12;
  const y = from.y;
  const floor = [];
  for (let i = 0; i < 4; i++) {
    const p = plat(x + i * 8, y, 0, 8, 12, { color: C.gold, material: "neon", tag: "fakefloor" });
    parts.push(p);
    floor.push(p.id);
  }
  out.dropFloor = floor;
  const mid = x + 12;
  for (const z of [-5.5, 5.5]) {
    parts.push(block(mid, y + 6, z, 1.4, 12, 1.4, { color: C.gold, material: "neon", tag: "arch" }));
  }
  parts.push(block(mid, y + 12, 0, 1.4, 1.4, 12.4, { color: C.gold, material: "neon", tag: "arch" }));
  for (let i = 0; i < 6; i++) {
    parts.push(block(mid - 6 + i * 2.4, y + 9, 0, 0.8, 0.8, 0.8, {
      color: [C.troll, C.gold, C.glass][i % 3], material: "neon", canCollide: false, tag: "confetti",
      behaviors: [{ type: "spinner", axis: [0, 1, 0], speed: 90 + i * 20 }],
    }));
  }
  parts.push(trigger("tr:fakefinish", mid, y, 0, 4, 8, 12));
  // The escape, only reachable in the moment the floor goes.
  parts.push(plat(x + 34, y - 1.5, -9, 6, 6, { color: C.dark, tag: "escape" }));
  parts.push(plat(x + 42, y - 0.5, -4, 6, 6, { color: C.dark, tag: "escape" }));
  parts.push(plat(x + 50, y, 0, 10, 10, { color: C.stone, tag: "rest" }));
  parts.push(trigger("tr:section", from.x + 6, y, 0));
  return { x: x + 50, y };
}

// 9 — The real climb. Everything above, at once, going up.
function sectionClimb(parts, out, from) {
  let x = from.x + 8;
  let y = from.y;
  const cx = x + 20;
  for (let i = 0; i < 18; i++) {
    const a = Math.PI + i * 0.72;
    const px = cx + Math.cos(a) * 16;
    const pz = Math.sin(a) * 16;
    y += 4.0;
    const p = plat(px, y, pz, 5.2, 5.2, {
      color: i % 3 === 2 ? C.troll : C.stone,
      material: i % 3 === 2 ? "neon" : "plastic",
      tag: "climb",
    });
    parts.push(p);
    if (i % 3 === 2) out.vanish.push(p.id);
    if (i % 6 === 4) {
      const ex = cx + Math.cos(a) * 30;
      const ez = Math.sin(a) * 30;
      parts.push(block(ex, y + 2, ez, 2.2, 2.2, 2.2, { color: C.trollDim, material: "metal", tag: "emitter", id: pid("emit") }));
      const d = Math.hypot(cx - ex, -ez) || 1;
      out.emitters.push({
        id: parts[parts.length - 1].id,
        from: [ex, y + 2, ez],
        dir: [(cx - ex) / d, 0, (0 - ez) / d],
        period: 2.8,
        phase: (i * 0.5) % 2.8,
      });
    }
  }
  parts.push(plat(cx, y + 4.5, 0, 14, 14, { color: C.stone, tag: "rest" }));
  parts.push(block(cx, y + 2.5, 0, 3, 4, 3, { color: C.dark, canCollide: false, tag: "pillar" }));
  parts.push(trigger("tr:section", from.x + 4, from.y, 0));
  return { x: cx, y: y + 4.5 };
}

// 10 — The boss arena. A flat ring of tiles the boss drops out from under you in phase
// two, and the boss itself at the far end.
function sectionBoss(parts, out, from) {
  const y = from.y;
  const x0 = from.x + 16;
  parts.push(plat(x0, y, 0, 12, 14, { color: C.stone, tag: "bossbridge" }));
  const cx = x0 + 28;
  const tiles = [];
  for (let ix = -3; ix <= 3; ix++) {
    for (let iz = -3; iz <= 3; iz++) {
      const p = plat(cx + ix * 7, y, iz * 7, 6.6, 6.6, {
        color: (ix + iz) % 2 === 0 ? C.dark : C.trollDim, tag: "tile",
      });
      parts.push(p);
      tiles.push(p.id);
    }
  }
  out.bossTiles = tiles;
  // The boss: a trollface the size of a house. Built from parts so it can be moved and
  // recoloured per phase without an asset file (ARCHITECTURE §11 rule 4).
  const bx = cx + 30;
  const by = y + 9;
  const face = [];
  const push = (p) => { parts.push(p); face.push(p.id); return p.id; };
  const headId = push(block(bx, by, 0, 4, 16, 16, { color: "#f2f2f2", material: "neon", tag: "boss" }));
  push(block(bx - 2.2, by - 4.2, 0, 0.8, 1.6, 11, { color: "#141414", material: "plastic", tag: "boss" }));
  push(block(bx - 2.2, by - 1.6, -5.6, 0.8, 3.2, 1.8, { color: "#141414", material: "plastic", rotation: [28, 0, 0], tag: "boss" }));
  push(block(bx - 2.2, by - 1.6, 5.6, 0.8, 3.2, 1.8, { color: "#141414", material: "plastic", rotation: [-28, 0, 0], tag: "boss" }));
  const eyeL = push(block(bx - 2.2, by + 3.4, -3.4, 0.8, 2.6, 2.2, { shape: "sphere", color: "#141414", material: "plastic", tag: "boss" }));
  const eyeR = push(block(bx - 2.2, by + 3.4, 3.4, 0.8, 2.6, 2.2, { shape: "sphere", color: "#141414", material: "plastic", tag: "boss" }));
  push(block(bx - 2.2, by + 6.2, 0, 0.8, 0.7, 6, { color: "#141414", material: "plastic", tag: "boss" }));
  push(block(bx + 2.4, by, 0, 1.2, 17, 17, { color: C.trollDim, material: "neon", tag: "boss" }));

  out.boss = {
    parts: face,
    headId,
    eyes: [eyeL, eyeR],
    muzzle: [bx - 3, by, 0],
    center: [cx, y, 0],
    arenaHalf: 24,
  };
  // The real finish is BEHIND the boss, and the three stones that reach it only become
  // solid when the boss dies. They are ordinary landables in the layout on purpose: the
  // reachability audit then measures a route that really exists, and the gating is a
  // runtime state rather than a hole in the course that no audit can tell apart from a
  // mistake.
  const bridge = [];
  for (let i = 0; i < 3; i++) {
    const p = plat(cx + 27 + i * 6, y, 0, 6, 6, { color: C.gold, material: "neon", tag: "span" });
    parts.push(p);
    bridge.push(p.id);
  }
  out.finishBridge = bridge;
  parts.push(plat(bx + 14, y, 0, 12, 12, { color: C.gold, material: "neon", tag: "finish" }));
  parts.push(trigger("tr:finish", bx + 14, y, 0, 8, 8, 12));
  parts.push(trigger("tr:boss", cx - 22, y, 0, 4, 10, 26));
  parts.push(trigger("tr:section", x0, y, 0, 6, 10, 14));
  return { x: bx + 14, y };
}

// ---------------------------------------------------------------------------------

export const SECTION_NAMES = Object.freeze([
  "Welcome!",
  "Disappearing Act",
  "The Popup Gauntlet",
  "Bait and Switch",
  "Incoming",
  "The Conveyor Lie",
  "Chasers",
  "The Fake Finish",
  "The Real Climb",
  "The Boss",
]);

export function buildCourse() {
  seq = 0;
  const parts = [];
  const out = {
    vanish: [], decoys: [], emitters: [], chasers: [],
    popupTriggers: [], dropFloor: [], bossTiles: [], finishBridge: [], boss: null,
  };

  // The spawn plaza. Deliberately pleasant.
  parts.push(plat(-8, BASE_Y, 0, 20, 18, { color: C.safe, material: "grass", tag: "spawn" }));
  parts.push(block(-16, BASE_Y + 4, 0, 1, 8, 18, { color: C.trollDim, material: "neon", tag: "spawnwall" }));

  let cur = sectionWelcome(parts, out);
  cur = sectionVanish(parts, out, cur);
  cur = sectionPopups(parts, out, cur);
  cur = sectionBait(parts, out, cur);
  cur = sectionIncoming(parts, out, cur);
  cur = sectionConveyor(parts, out, cur);
  cur = sectionChasers(parts, out, cur);
  cur = sectionFakeFinish(parts, out, cur);
  cur = sectionClimb(parts, out, cur);
  cur = sectionBoss(parts, out, cur);

  return {
    parts,
    spawn: SPAWN,
    spawnYaw: SPAWN_YAW,
    killY: KILL_Y,
    sectionNames: SECTION_NAMES,
    end: cur,
    ...out,
  };
}

// Every colliding platform's footprint, for the gap audit in validate.js. Triggers,
// decoys and decoration are excluded: you cannot land on them, so a "gap" measured to
// one is not a jump anybody makes.
export function landables(course) {
  const decoy = new Set(course.decoys);
  return course.parts.filter((p) =>
    p.canCollide !== false && !decoy.has(p.id) && p.size[0] >= 3 && p.size[2] >= 3 && p.size[1] <= 2);
}
