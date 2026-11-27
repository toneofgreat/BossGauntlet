// node src/world/dev/test.mjs - pure checks of zones.js (zone table, points, spawns, portals) against ENGINE terrain.
import { ZONE_DEFS, ZONE_IDS, POINTS, buildSpawns, PORTALS, zoneAtPure, villageHouse, GATES } from "../zones.js";
let terrain = null;
try { terrain = await import("../../engine/terrain.js"); } catch (e) { /* optional */ }
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } };
const need = ["lobby", "graves", "voidEdge", "path1", "bridge", "waterfall", "rookieShack", "ratField", "ratKing", "gate2", "village",
  "barn", "guardPost", "gate3", "castle", "throne", "kingDark", "desert", "forest", "forestHouse", "hollowDesert", "finalArena"];
for (const id of need) ok(ZONE_IDS.includes(id), "zone " + id);
for (const z of ZONE_DEFS) {
  const b = z.bounds, s = z.spawn.pos;
  ok(b.x0 < b.x1 && b.z0 < b.z1 && b.y0 < b.y1, "bounds " + z.id);
  ok(zoneAtPure(ZONE_DEFS, s.x, s.y + 0.5, s.z) === z.id, "spawn of " + z.id + " resolves to " + zoneAtPure(ZONE_DEFS, s.x, s.y + 0.5, s.z));
  if (terrain && z.region !== "none") ok(terrain.regionAt(s.x, s.z) === z.region, "region of " + z.id + " = " + terrain.regionAt(s.x, s.z));
}
for (const [n, p] of Object.entries(POINTS)) {
  ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z), "point " + n);
  ok(zoneAtPure(ZONE_DEFS, p.x, (p.t && terrain ? Math.max(terrain.heightAt(p.x, p.z), -50) : p.y) + 0.5, p.z) !== null, "point outside every zone: " + n);
}
const sp = buildSpawns();
const counts = { rat: 12, villager: 8, royalGuard: 6, shadowRat: 8, ratKing: 1, fydor: 1, myles: 1, king: 1, cat: 1, rookie: 1 };
for (const [k, n] of Object.entries(counts)) ok(sp[k] && sp[k].length === n, "spawns " + k + " = " + (sp[k] && sp[k].length));
for (const [id, d] of Object.entries(PORTALS)) {
  ok(ZONE_IDS.includes(d.to), "portal dest " + id);
  ok(POINTS[d.arrive], "portal arrive point " + id + " -> " + d.arrive);
  ok(zoneAtPure(ZONE_DEFS, d.pos[0], d.pos[1] + 0.5, d.pos[2]) !== null, "portal inside a zone " + id);
}
for (let k = 0; k < 8; k++) { const h = villageHouse(k); ok(Math.hypot(h.x, h.z - 240) > 30, "house ring " + k); }
ok(GATES.area2 && GATES.area3, "gates");
console.log(fails ? fails + " failure(s)" : "zones.js: all checks passed");
process.exit(fails ? 1 : 0);
