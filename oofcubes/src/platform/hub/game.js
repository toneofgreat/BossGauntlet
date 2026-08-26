// src/platform/hub/game.js — the Hub Place: spawn plaza, portal arches into every
// registered Place, and the Catalog storefront door. Spec 06 §5.3.4 owns this file.
// It lives in src/platform/ but obeys the Game API contract (ARCHITECTURE §7) exactly
// and touches the platform only through `ctx` — spec 06 criterion 26.

import { buildPortals, buildBadgeWall, buildParkour, buildSigns } from "./scripts/layout.js";

export const meta = {
  slug: "hub",
  name: "The Hub",
  icon: "🏙️",
  description: "Spawn plaza — portals, Catalog, badge wall.",
  version: "1.0.0",
};

// place.json carries `spawnYaw: 180`, not 0: the shell sets the follow camera's yaw
// from spawnYaw and the camera currently ends up FACING the avatar rather than behind
// it, so yaw 0 spawns the player looking south at empty grass with the whole plaza
// behind the lens. 180 aims the camera north up the plaza (fountain, statue, arches)
// and makes "forward" walk into the Hub. Flip it back to 0 when that camera seam is
// fixed — reported with this task.

// Tuning constants — spec 06 §6 pins these to this module.
const PORTAL_DEBOUNCE_S = 1.0; // portal & catalog-door retrigger guard
// SLICE: ghost wanderers (06 §5.4, hub/scripts/ghosts.js + names.js) are out of the
// slice, so GHOST_COUNT is 0 here instead of §6's 8. The debug hook keeps §3.7's
// `ghostCount` and §8's `ghostPositions()` so the hub smoke scenario reads the same
// shape either way.
const GHOST_COUNT = 0;

// The secret parkour Badge — a static registry row in spec 07's per-place BADGES
// region (`hub.cloudclimber`); there is no runtime badges.define().
const CLOUD_BADGE = "hub.cloudclimber";

let subs = [];
let portalSubs = [];
let portals = null;
let parkour = null;
let signs = null;
let badgeWall = null;
let lastPortalAt = -PORTAL_DEBOUNCE_S;
let lastDoorAt = -PORTAL_DEBOUNCE_S;

function debounced(now, last) {
  return now - last < PORTAL_DEBOUNCE_S;
}

// The registry never reaches a Place by import, so the shell publishes it on the Place
// emitter as `platform:places` { places, visited } — §5.3.4 step 2's bridge. It arrives
// just AFTER init returns (shell.js), which is why this is a subscription, not a read.
function onPlaces(ctx, payload) {
  if (!payload || !Array.isArray(payload.places)) return;
  teardownPortals(ctx);
  portals = buildPortals(ctx, payload.places, payload.visited || []);
  for (const slug of portals.slugs) {
    portalSubs.push(ctx.events.on("touch:portal-" + slug, () => onPortalTouch(ctx, slug)));
  }
}

function onPortalTouch(ctx, slug) {
  if (debounced(ctx.time, lastPortalAt)) return; // one navigation per walk-through
  lastPortalAt = ctx.time;
  // Spec 06 §5.3.3 routes Place travel this way; spec 04 §5.1 reserves the `platform:`
  // prefix for platform emits, so the emitter logs one "game emitted reserved event"
  // warning here. Reported as a spec conflict — the shell offers no other seam.
  ctx.events.emit("platform:navigate", { slug });
}

function onCatalogDoor(ctx) {
  if (debounced(ctx.time, lastDoorAt)) return;
  lastDoorAt = ctx.time;
  ctx.services.ui.openCatalog();
}

function onCloudTop(ctx) {
  // badges.award is first-award-only, so repeat touches of the cloud do nothing.
  if (ctx.services.badges.award(CLOUD_BADGE) && parkour) parkour.celebrate(ctx.time);
}

function teardownPortals(ctx) {
  for (const off of portalSubs) off();
  portalSubs = [];
  if (portals) portals.dispose(ctx);
  portals = null;
}

// Spec 06 §3.7/§5.3.4 step 7: the Hub hangs its own debug facts off the shell's single
// sanctioned window handle (spec 12 §5.7.3 rule 6) while it is loaded.
function debugHandle() {
  return typeof window !== "undefined" && window.__oof ? window.__oof : null;
}

export function init(ctx) {
  subs = [];
  portalSubs = [];
  lastPortalAt = -PORTAL_DEBOUNCE_S;
  lastDoorAt = -PORTAL_DEBOUNCE_S;

  signs = buildSigns(ctx);
  badgeWall = buildBadgeWall(ctx);
  parkour = buildParkour(ctx);

  subs.push(ctx.events.on("platform:places", (payload) => onPlaces(ctx, payload)));
  // A Place the player has now seen loses its NEW! ribbon live (§5.3.3 point 6).
  subs.push(ctx.events.on("platform:placeLoaded", (payload) => {
    if (portals && payload && payload.slug) portals.forget(payload.slug);
  }));
  subs.push(ctx.events.on("touch:catalogDoor", () => onCatalogDoor(ctx)));
  subs.push(ctx.events.on("touch:cloudTop", () => onCloudTop(ctx)));

  // SLICE: (5) applyAmbience(ctx, profile.settings.ambience) — 06 §5.5,
  // hub/scripts/ambience.js — and (6) spawnGhosts(ctx, GHOST_COUNT) — 06 §5.4 — are
  // out of the slice. The `day` preset of §5.5 is authored into place.json's lighting
  // (§3.3), so the plaza still boots lit exactly as the day row specifies.

  const handle = debugHandle();
  if (handle) {
    handle.hub = {
      ghostCount: GHOST_COUNT,
      ghostPositions: () => [],
      partCount: () => ctx.engine.parts.count(),
      portalCount: () => (portals ? portals.count : 0),
    };
  }
}

export function update(dt, ctx) {
  if (parkour) parkour.update(dt, ctx.time);
}

export function dispose(ctx) {
  for (const off of subs) off();
  subs = [];
  teardownPortals(ctx);
  if (parkour) parkour.dispose(ctx);
  if (signs) signs.dispose(ctx);
  if (badgeWall) badgeWall.dispose(ctx);
  parkour = null;
  signs = null;
  badgeWall = null;
  // §5.3.4 clears the hub debug facts; the §3.7 field itself stays declared (criterion
  // 6 reads every §3.7 key), so it goes back to the shell's `null`, not deleted.
  const handle = debugHandle();
  if (handle) handle.hub = null;
}
