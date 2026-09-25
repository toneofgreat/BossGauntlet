// src/platform/hub/scripts/spectacle.js — the things that make the Hub plaza a PLACE
// rather than a lobby: lamp posts that actually cast light, neon hoops down the runway,
// a hologram over the fountain, water jets, and fireworks on a timer. Spec 06 §5.3.6
// owns this file (added 2026-09-25 with the lamp pack, spec 03 §5.1b).
//
// Everything here reaches the platform through `ctx` only (spec 06 criterion 26), and
// every part it creates is tracked so `dispose` leaves the Hub exactly as it found it.
//
// Two engine facts shape the whole file:
//
// 1. **Lamps are pooled.** A `light` block asks the renderer for one of a fixed number
//    of point lights — 8 on a fast machine, 2 on a phone — and the nearest ones win
//    (spec 02 §5.2a). So lamps are placed where a player WALKS, in a line, rather than
//    scattered: whichever two are nearest are always the two either side of you. A lamp
//    is never the only thing lighting something important.
// 2. **Neon is not a lamp.** A neon material glows on its own mesh and lights nothing
//    else, which is why the posts carry both: a neon head so you can see the lamp, and a
//    `light` so the lamp can be seen BY.

const LAMP_COLOR = "#ffe6a8";
const POST_METAL = "#6b7280";

// Lamp posts march down the runway the player walks from spawn (z 34) to the portal
// arches (z -70), one pair every 24 studs, 7 studs either side of the paved strip.
const POST_Z = [28, 4, -20, -44, -64];
const POST_X = 9;
const POST_H = 12;
const LAMP_INTENSITY_DAY = 0.35; // a lit lamp in daylight is a pilot light, not a sun
const LAMP_INTENSITY_NIGHT = 3.2;
const LAMP_RANGE = 34;

// The hoops the runway passes through — big neon rings, colours cycling, each one lit.
const HOOP_Z = [16, -8, -32, -56];
const HOOP_COLORS = ["#00a2ff", "#ff36c8", "#3ddc84", "#f5c542"];
const HOOP_D = 26; // outer diameter; the walkway is 8 wide, so this clears it easily

// The hologram over the fountain: a galaxy globe with three rings around it, spinning.
const HOLO_CENTER = [0, 18, 0];
const HOLO_GLOBE_D = 9;

// Fireworks: three mortars around the plaza rim, one volley every FIREWORK_PERIOD_S,
// each volley SHELLS sparks that arc, fade, and are removed. Sim time only — never a
// timer (ARCHITECTURE §5), so a throttled tab and the smoke harness see the same show.
const MORTARS = [[-34, 1, 34], [34, 1, 34], [0, 1, -44]];
const FIREWORK_PERIOD_S = 9;
const FIREWORK_SHELLS = 14;
const FIREWORK_LIFE_S = 2.2;
const FIREWORK_RISE = 26; // studs up to the burst
const FIREWORK_SPREAD = 13; // studs out from the burst point
const FIREWORK_GRAVITY = 26; // gentler than the world's 196: these are sparks, not rocks
const SPARK_COLORS = ["#ff4757", "#ffd23f", "#3ddc84", "#00a2ff", "#ff36c8", "#ffffff"];

function ringColor(i) {
  return HOOP_COLORS[i % HOOP_COLORS.length];
}

// createSpectacle(ctx, tracker) -> handle. The tracker is layout.js's: one build
// tracker per handle keeps disposal honest, and this module is handed its own.
export function buildSpectacle(ctx, track) {
  const lampIds = [];
  const holo = { globe: null, rings: [] };
  const sparks = []; // { id, pos, vel, born, color }
  let nextVolleyAt = FIREWORK_PERIOD_S;
  let volley = 0;
  let lampIntensity = LAMP_INTENSITY_DAY;

  // ---- lamp posts ------------------------------------------------------------------
  for (let i = 0; i < POST_Z.length; i++) {
    const z = POST_Z[i];
    for (const side of [-1, 1]) {
      const x = side * POST_X;
      track.part({
        id: `hubPost_${i}_${side > 0 ? "e" : "w"}`, shape: "tube", size: [1.6, POST_H, 1.6],
        position: [x, POST_H / 2, z], color: POST_METAL, material: "metal",
      });
      track.part({
        id: `hubPostArm_${i}_${side > 0 ? "e" : "w"}`, shape: "capsule", size: [1.2, 3.2, 1.2],
        position: [x, POST_H + 0.6, z], color: POST_METAL, material: "metal",
      });
      const head = track.part({
        id: `hubPostHead_${i}_${side > 0 ? "e" : "w"}`, shape: "dome", size: [3.4, 2.2, 3.4],
        position: [x, POST_H + 2.2, z], rotation: [180, 0, 0], color: LAMP_COLOR, material: "neon",
        canCollide: false,
        light: { color: LAMP_COLOR, intensity: LAMP_INTENSITY_DAY, range: LAMP_RANGE },
      });
      lampIds.push(head);
    }
  }

  // ---- neon hoops over the runway --------------------------------------------------
  HOOP_Z.forEach((z, i) => {
    const color = ringColor(i);
    // A ring is a PLATE in the XY plane (spec 03 §3.1), so an un-rotated one stands
    // upright across the path — which is exactly the gateway shape wanted here.
    track.part({
      id: "hubHoop_" + i, shape: "ring", size: [HOOP_D, HOOP_D, 1.6],
      position: [0, HOOP_D / 2 + 1, z], color, material: "neon", canCollide: false,
      light: { color, intensity: 1.1, range: 26 },
    });
    for (const side of [-1, 1]) {
      track.part({
        id: `hubHoopFoot_${i}_${side > 0 ? "e" : "w"}`, shape: "prism", size: [3, 2, 3],
        position: [side * (HOOP_D / 2 - 1), 1, z], color: "#3b4252", material: "concrete",
      });
    }
  });

  // ---- the hologram over the fountain ----------------------------------------------
  holo.globe = track.part({
    id: "hubHoloGlobe", shape: "sphere", size: [HOLO_GLOBE_D, HOLO_GLOBE_D, HOLO_GLOBE_D],
    position: HOLO_CENTER.slice(), color: "#8f6aff", material: "galaxy", canCollide: false,
    transparency: 0.15,
    light: { color: "#8f6aff", intensity: 1.6, range: 44 },
  });
  // Three rings on different axes. `spinner` is an engine behavior (spec 04 §3.2), so
  // the spin costs this module nothing per frame.
  const RING_SPECS = [
    { rot: [0, 0, 0], axis: "y", speed: 34, color: "#00e5ff", d: 16 },
    { rot: [90, 0, 0], axis: "y", speed: -26, color: "#ff36c8", d: 19 },
    { rot: [0, 0, 60], axis: "y", speed: 20, color: "#f5c542", d: 22 },
  ];
  RING_SPECS.forEach((spec, i) => {
    holo.rings.push(track.part({
      id: "hubHoloRing_" + i, shape: "ring", size: [spec.d, spec.d, 0.9],
      position: HOLO_CENTER.slice(), rotation: spec.rot, color: spec.color, material: "neon",
      canCollide: false, transparency: 0.25,
      behaviors: [{ type: "spinner", axis: spec.axis, speed: spec.speed }],
    }));
  });

  // ---- fountain jets ---------------------------------------------------------------
  // Four cones of "water" rising out of the basin, plus a glass crown on the column.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    track.part({
      id: "hubJet_" + i, shape: "cone", size: [2.6, 7, 2.6],
      position: [Math.cos(a) * 7, 4.5, Math.sin(a) * 7], color: "#9fd8ff", material: "ice",
      transparency: 0.45, canCollide: false,
    });
  }
  track.part({
    id: "hubFountainCrown", shape: "diamond", size: [4, 6, 4], position: [0, 9.5, 0],
    color: "#bfe3ff", material: "glass", transparency: 0.5, canCollide: false,
    light: { color: "#bfe3ff", intensity: 0.9, range: 24 },
  });

  // ---- fireworks -------------------------------------------------------------------
  function launch(now) {
    const mortar = MORTARS[volley % MORTARS.length];
    volley++;
    const burstY = mortar[1] + FIREWORK_RISE;
    for (let i = 0; i < FIREWORK_SHELLS; i++) {
      // An even sphere of directions (golden-angle spiral), scaled to the spread — an
      // actual random spray clumps visibly at 14 sparks.
      const t = (i + 0.5) / FIREWORK_SHELLS;
      const phi = Math.acos(1 - 2 * t);
      const theta = i * 2.399963;
      const dir = [Math.sin(phi) * Math.cos(theta), Math.cos(phi) * 0.7 + 0.5, Math.sin(phi) * Math.sin(theta)];
      const color = SPARK_COLORS[(volley + i) % SPARK_COLORS.length];
      const id = track.part({
        id: `hubSpark_${volley}_${i}`, shape: "sphere", size: [1.1, 1.1, 1.1],
        position: [mortar[0], burstY, mortar[2]], color, material: "neon", canCollide: false,
      });
      sparks.push({
        id,
        pos: [mortar[0], burstY, mortar[2]],
        vel: [dir[0] * FIREWORK_SPREAD, dir[1] * FIREWORK_SPREAD, dir[2] * FIREWORK_SPREAD],
        born: now,
      });
    }
    // One lamp-bright flash at the burst, riding the volley's first spark: the sparks
    // are neon (they glow but light nothing), so without this a night volley lights up
    // nothing but itself.
    if (sparks.length) {
      ctx.engine.parts.setLight(sparks[0].id, { color: SPARK_COLORS[volley % SPARK_COLORS.length], intensity: 5, range: 60 });
    }
  }

  function stepSparks(dt, now) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      const age = now - s.born;
      if (age >= FIREWORK_LIFE_S) {
        track.drop(s.id);
        sparks.splice(i, 1);
        continue;
      }
      s.vel[1] -= FIREWORK_GRAVITY * dt;
      s.pos[0] += s.vel[0] * dt;
      s.pos[1] += s.vel[1] * dt;
      s.pos[2] += s.vel[2] * dt;
      ctx.engine.parts.setPosition(s.id, s.pos);
      // Fade out over the last 60% of the life, so a spark dies instead of vanishing.
      const fade = Math.max(0, (age - FIREWORK_LIFE_S * 0.4) / (FIREWORK_LIFE_S * 0.6));
      if (fade > 0) ctx.engine.parts.setTransparency(s.id, Math.min(0.95, fade));
    }
  }

  return {
    lampCount: lampIds.length,
    sparkCount: () => sparks.length,

    // The ambience preset (spec 06 §5.5) decides how hard the lamps work: at noon they
    // are decoration, at night they are the reason you can see the path. Called by the
    // Hub whenever the preset changes, which is the only thing that moves this number.
    setNight(factor) {
      lampIntensity = LAMP_INTENSITY_DAY + (LAMP_INTENSITY_NIGHT - LAMP_INTENSITY_DAY) * factor;
      for (const id of lampIds) {
        ctx.engine.parts.setLight(id, { color: LAMP_COLOR, intensity: lampIntensity, range: LAMP_RANGE });
      }
    },

    update(dt, now) {
      if (now >= nextVolleyAt) {
        nextVolleyAt = now + FIREWORK_PERIOD_S;
        launch(now);
      }
      if (sparks.length) stepSparks(dt, now);
    },

    dispose() {
      sparks.length = 0;
      lampIds.length = 0;
      holo.rings.length = 0;
      holo.globe = null;
      track.dispose();
    },
  };
}
