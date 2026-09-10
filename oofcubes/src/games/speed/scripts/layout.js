// src/games/speed/scripts/layout.js — the avenue, as data. Spec 24 §3. Pure ESM (no
// THREE, no DOM, no ctx) so rule 24:S3 can build the real world and measure it.
//
// One straight avenue along +x: a treadmill plaza at the start, then the six zones in a
// line. Each zone is an entrance pad, a lane, and a crate pedestal at the far end with
// its Keeper waiting in the middle of the lane. Walls keep the run on the lane so the
// chase is a straight sprint, entrance -> pedestal, with the Keeper cutting across.

import { ZONES } from "./config.js";

export const FLOOR_TOP = 4;
export const SPAWN = Object.freeze([18, FLOOR_TOP + 0.2, 0]); // open avenue past the plaza, clear of the belt
export const SPAWN_YAW = 90;      // face +x, down the avenue
export const KILL_Y = -20;

export const LANE_HALF_Z = 9;     // walls at z = ±(LANE_HALF_Z+1)
export const WALL_H = 12;

export const TREAD = Object.freeze({ cx: 0, cz: 0, w: 10, d: 16 }); // the belt footprint
export const UPGRADE_PAD = Object.freeze({ cx: 0, cz: 12 });        // the shop pad

const ZONE_PITCH = 66;            // x between one entrance and the next
const ZONE0_X = 34;               // first entrance x
const LANE_LEN = 48;              // entrance -> pedestal

export function zoneEntranceX(i) { return ZONE0_X + i * ZONE_PITCH; }
export function zonePedestalX(i) { return zoneEntranceX(i) + LANE_LEN; }
export function zoneKeeperHomeX(i) { return zoneEntranceX(i) + LANE_LEN * 0.55; }

const C = Object.freeze({
  plaza: "#3a3f4d", plazaTrim: "#565d70", belt: "#1b1d24", beltStripe: "#2f3340",
  wall: "#4a5165", pad: "#f5c542", pedestal: "#c9d2e4", crate: "#8c5a3c", crateTrim: "#f5c542",
  keeperBody: "#c02a2a", keeperTrim: "#2a2f3a", keeperEye: "#ffd93d", sign: "#12141c",
});

let nextId = 0;
const idFor = (p) => `${p}_${++nextId}`;
const part = (p, def) => ({ id: idFor(p), material: "plastic", canCollide: true, ...def });

// A Keeper: a stack of parts with offsets from a moving root, dragged together with
// setPosition each tick (the trollobby-chaser technique). Deliberately ROBOTIC — a
// single-eyed metal guard with a number, NOT an avatar — because ARCHITECTURE §9 forbids
// anything that reads as a fake player. It is a hazard, like the boss-fight bosses.
function keeperParts(i, zone) {
  const c = C;
  const spec = [
    { key: "body", shape: "box", size: [2.2, 3.2, 1.6], off: [0, 2.4, 0], color: c.keeperBody },
    { key: "chest", shape: "box", size: [2.4, 1.2, 1.7], off: [0, 3.0, -0.05], color: c.keeperTrim },
    { key: "head", shape: "box", size: [1.6, 1.4, 1.6], off: [0, 4.7, 0], color: c.keeperBody },
    { key: "eye", shape: "sphere", size: [0.8, 0.8, 0.8], off: [0, 4.8, -0.8], color: zone.color, material: "neon" },
    { key: "legL", shape: "cylinder", size: [0.7, 1.8, 0.7], off: [-0.6, 0.9, 0], color: c.keeperTrim },
    { key: "legR", shape: "cylinder", size: [0.7, 1.8, 0.7], off: [0.6, 0.9, 0], color: c.keeperTrim },
    { key: "armL", shape: "cylinder", size: [0.55, 2.4, 0.55], off: [-1.5, 2.6, 0], rot: [0, 0, 10], color: c.keeperBody },
    { key: "armR", shape: "cylinder", size: [0.55, 2.4, 0.55], off: [1.5, 2.6, 0], rot: [0, 0, -10], color: c.keeperBody },
    { key: "fin", shape: "wedge", size: [0.6, 1.2, 1.8], off: [0, 5.4, 0.4], color: c.keeperTrim },
  ];
  return spec.map((s) => ({
    key: s.key,
    off: s.off,
    def: part("keeper" + i, {
      shape: s.shape, size: s.size, rotation: s.rot || [0, 0, 0],
      color: s.color, material: s.material || "metal", canCollide: false,
    }),
  }));
}

export function buildWorld() {
  nextId = 0;
  const parts = [];
  const lastX = zonePedestalX(ZONES.length - 1);

  // ---- the avenue floor + walls, one slab the whole length ----
  const floorLen = lastX + 30;
  parts.push(part("ground", { size: [floorLen, 4, LANE_HALF_Z * 2 + 4], position: [floorLen / 2 - 20, FLOOR_TOP - 2, 0], color: C.plaza }));
  for (const side of [-1, 1]) {
    parts.push(part("wall", { size: [floorLen, WALL_H, 2], position: [floorLen / 2 - 20, FLOOR_TOP + WALL_H / 2, side * (LANE_HALF_Z + 1)], color: C.wall }));
  }
  parts.push(part("wallback", { size: [2, WALL_H, LANE_HALF_Z * 2 + 4], position: [-21, FLOOR_TOP + WALL_H / 2, 0], color: C.wall }));

  // ---- treadmill plaza ----
  parts.push(part("plaza", { shape: "cylinder", size: [26, 0.3, 26], position: [0, FLOOR_TOP + 0.12, 0], color: C.plazaTrim, canCollide: false }));
  // the belt: a dark platform with stripe rungs, sitting flush with the floor
  const beltId = idFor("belt");
  parts.push({ id: beltId, shape: "box", size: [TREAD.w, 0.5, TREAD.d], position: [TREAD.cx, FLOOR_TOP + 0.26, TREAD.cz], color: C.belt, material: "metal", canCollide: true });
  for (let s = 0; s < 7; s++) {
    parts.push(part("stripe", { size: [TREAD.w - 1, 0.12, 0.8], position: [TREAD.cx, FLOOR_TOP + 0.54, TREAD.cz - TREAD.d / 2 + 1.4 + s * 2.1], color: C.beltStripe, canCollide: false }));
  }
  parts.push(part("railL", { shape: "cylinder", size: [0.4, TREAD.d, 0.4], position: [TREAD.cx - TREAD.w / 2 - 0.4, FLOOR_TOP + 1.4, TREAD.cz], rotation: [90, 0, 0], color: C.plazaTrim, canCollide: false }));
  parts.push(part("railR", { shape: "cylinder", size: [0.4, TREAD.d, 0.4], position: [TREAD.cx + TREAD.w / 2 + 0.4, FLOOR_TOP + 1.4, TREAD.cz], rotation: [90, 0, 0], color: C.plazaTrim, canCollide: false }));
  // the upgrade pad
  const upgradeId = idFor("upgradepad");
  parts.push({ id: upgradeId, shape: "cylinder", size: [6, 0.4, 6], position: [UPGRADE_PAD.cx, FLOOR_TOP + 0.2, UPGRADE_PAD.cz], color: C.pad, material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "sp_upgrade", cooldownS: 1.5 }] });
  parts.push(part("upgradepost", { shape: "cylinder", size: [0.8, 4, 0.8], position: [UPGRADE_PAD.cx - 3.5, FLOOR_TOP + 2, UPGRADE_PAD.cz], color: C.plazaTrim }));

  // ---- the six zones ----
  const zones = [];
  for (let i = 0; i < ZONES.length; i++) {
    const zone = ZONES[i];
    const ex = zoneEntranceX(i);
    const px = zonePedestalX(i);
    // a coloured floor skin over this zone's stretch
    parts.push(part("zonefloor", { size: [LANE_LEN + 8, 0.22, LANE_HALF_Z * 2], position: [(ex + px) / 2, FLOOR_TOP + 0.11, 0], color: zone.color, canCollide: false }));
    // entrance pad (arms the keeper)
    const entranceId = idFor("entrance" + i);
    parts.push({ id: entranceId, size: [3, 0.4, LANE_HALF_Z * 2 - 2], position: [ex, FLOOR_TOP + 0.2, 0], color: "#f2f4fa", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "sp_zone" + i, cooldownS: 0.5 }] });
    // a gate arch marking the entrance, with the zone name over it
    for (const side of [-1, 1]) {
      parts.push(part("gatepost" + i, { size: [1.2, 9, 1.2], position: [ex, FLOOR_TOP + 4.5, side * (LANE_HALF_Z - 0.5)], color: zone.color }));
    }
    parts.push(part("gatetop" + i, { size: [2, 1.4, LANE_HALF_Z * 2], position: [ex, FLOOR_TOP + 9, 0], color: zone.color, material: "neon", canCollide: false }));
    // sign block (the game writes the keeper speed onto it via a text label part is not
    // possible from pure data; the HUD carries the number instead — the sign is decor)
    parts.push(part("sign" + i, { size: [5, 2.4, 0.4], position: [ex, FLOOR_TOP + 6.6, LANE_HALF_Z - 0.6], color: C.sign, canCollide: false }));
    // pedestal + crate at the far end
    parts.push(part("pedestal" + i, { shape: "cylinder", size: [5, 2.2, 5], position: [px, FLOOR_TOP + 1.1, 0], color: C.pedestal, material: "metal" }));
    const crateId = idFor("crate" + i);
    parts.push({ id: crateId, size: [3, 3, 3], position: [px, FLOOR_TOP + 3.7, 0], color: C.crate, material: "wood", canCollide: false, behaviors: [{ type: "touchEvent", event: "sp_crate" + i, cooldownS: 0.4 }] });
    parts.push(part("cratelid" + i, { size: [3.3, 0.5, 3.3], position: [px, FLOOR_TOP + 5.3, 0], color: C.crateTrim, material: "neon", canCollide: false }));
    parts.push(part("crateband" + i, { size: [3.2, 0.5, 3.2], position: [px, FLOOR_TOP + 3.7, 0], color: C.crateTrim, canCollide: false }));

    const keeper = keeperParts(i, zone);
    for (const k of keeper) parts.push(k.def);

    zones.push({
      key: zone.key,
      entranceId, crateId,
      entranceX: ex, pedestalX: px,
      keeperHomeX: zoneKeeperHomeX(i),
      keeper: keeper.map((k) => ({ id: k.def.id, off: k.off })),
    });
  }

  return { parts, beltId, upgradeId, zones, floorLen };
}
