// src/platform/hub/game.js — the Hub Place: spawn plaza, portal arches into every
// registered Place, the Catalog storefront door and the Oof Studio workshop door.
// Spec 06 §5.3.4 owns this file.
// It lives in src/platform/ but obeys the Game API contract (ARCHITECTURE §7) exactly
// and touches the platform only through `ctx` — spec 06 criterion 26. The one call that
// cannot (yet) go through ctx is the Oof Studio shelf; see the note above
// STUDIO_SHELF_MODULE for why, and for the seam that would retire it.

import { buildPortals, buildBadgeWall, buildParkour, buildSigns, createTracker } from "./scripts/layout.js";
import { applyAmbience } from "./scripts/ambience.js";
import { buildSpectacle } from "./scripts/spectacle.js";
import { buildBrickClimb } from "./scripts/brickclimb.js";

export const meta = {
  slug: "hub",
  name: "The Hub",
  icon: "🏙️",
  description: "Spawn plaza — portals, Catalog, Oof Studio, badge wall.",
  version: "1.0.0",
};

// place.json carries `spawnYaw: 180`, not 0, and that is simply where the plaza is:
// spawn sits at z 34 and the portal arches at z -70, so the player has to face -Z to
// be looking at anything. A heading of 180 deg is the direction (sin 180, cos 180) =
// -Z, which aims the camera north up the plaza (fountain, statue, arches) and makes
// "forward" walk into the Hub.
//
// This used to be annotated as a workaround for the camera "ending up FACING the
// avatar rather than behind it". There was no such camera seam: the follow camera was
// always behind the avatar, and what looked like a front view was spec 05 §5.1's rig
// being mounted without its half-turn, which drew the face on the back of the head.
// Fixed at the rig; do NOT flip this back to 0, which would spawn the player looking
// at empty grass.

// Tuning constants — spec 06 §6 pins these to this module.
const PORTAL_DEBOUNCE_S = 1.0; // portal & catalog-door retrigger guard

// Oof Studio is a platform surface, not a Place: it has no PLACES registry row, so it
// gets no portal arch (a portal's only exit is `platform:navigate { slug }`, and the
// shell resolves that against PLACES). Spec 11 §5.10 asks the Hub for a "🛠 Oof Studio"
// card that calls `openMyPlacesShelf({ services })`, and in a Hub that is a plaza
// rather than a screen, the card is a building you can walk into — exactly the shape
// spec 06 §5.3.4 step 7 already gave the Catalog. So: a workshop at the plaza's
// north-west corner (place.json's `studio*` rows) whose doorway trigger fires
// `touch:studioDoor`, one door event handled the same debounced way as the other.
//
// DEVIATION, reported with M5-T08: every other platform surface the Hub opens is
// behind a `ctx.services.ui` method (`openCatalog`), which is how criterion 26's
// "the Hub uses ctx only" is kept true. The ui service has no Studio opener and
// src/platform/shell.js belongs to another task, so this one call reaches the Studio
// surface's own documented entry point directly. It is a lazy import inside the
// handler, never a module-scope one: nothing of Oof Studio is fetched, parsed or run
// until a player actually walks through the workshop door, and shelf.js is built for
// exactly this (its own header calls itself "the only Studio module the Hub touches",
// and it defers studio.js — and THREE with it — to a dynamic import of its own).
// Everything the shelf then does still runs on ctx: it is handed ctx.services and
// reaches ui / saves / economy through that alone. The clean fix is a
// `ui.openStudioShelf()` seam beside `openCatalog`, mirroring registerCatalogOpener.
const STUDIO_SHELF_MODULE = "../studio/shelf.js";

// The secret parkour Badge — a static registry row in spec 07's per-place BADGES
// region (`hub.cloudclimber`); there is no runtime badges.define().
const CLOUD_BADGE = "hub.cloudclimber";

// ---- Brick Legend: the one door out of OofWorld (spec 06 §5.3.7) -------------------
// Brick Legend is a sibling game on the same site, not a Place, so this is a RELATIVE
// url resolved against the page: from `/oofworld/` it reaches `/brick-legend.html`.
// ui.openExternal refuses anything that resolves off-origin, so this is also the only
// shape it could take.
const BRICK_BADGE = "hub.brickclimber";
const BRICK_LEGEND_URL = "../brick-legend.html";
const BRICK_BEACON_S = 8; // the finish beacon, long enough to be seen from the plaza
// How hard the plaza's lamps work per ambience preset (spectacle.setNight's 0..1).
const NIGHT_FACTOR = { day: 0, dusk: 0.55, night: 1 };

let spectacle = null;
let climb = null;
let brickUnlocked = false;
let lastBrickAt = -PORTAL_DEBOUNCE_S;

let subs = [];
let portalSubs = [];
let portals = null;
let parkour = null;
let signs = null;
let badgeWall = null;
let ambience = "day"; // place.json's own lighting IS the day preset (§5.5), so this
                       // is already correct before applyAmbience's first call in init
let lastPortalAt = -PORTAL_DEBOUNCE_S;
let lastDoorAt = -PORTAL_DEBOUNCE_S;
let lastStudioAt = -PORTAL_DEBOUNCE_S;
let shelfMod = null; // set only once the workshop door has actually imported shelf.js

function debounced(now, last) {
  return now - last < PORTAL_DEBOUNCE_S;
}

// The registry never reaches a Place by import, so the shell publishes it on the Place
// emitter as `platform:places` { places, visited, settings } — §5.3.4 step 2's bridge
// (`settings` rides along for the ambience listener below, §5.3.4 step 5). It arrives
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

// A Place cannot await anything the shell is waiting on, so this is fire-and-forget:
// the walk-in already happened, and the shelf opens a frame or two later when the
// module resolves. A build without src/platform/studio/ (the M5 files are optional to
// the rest of the product) lands in the catch and says so instead of throwing into the
// event dispatcher.
function openStudioShelf(ctx) {
  return import(STUDIO_SHELF_MODULE).then(
    (shelf) => {
      // Held so dispose can take the shelf back down: a player can open it and then walk
      // out of the Hub through a portal, which the shelf itself never hears about.
      shelfMod = shelf;
      return shelf.openMyPlacesShelf({ services: ctx.services });
    },
    (err) => {
      console.warn("[oof] Oof Studio is not installed", err);
      ctx.services.ui.toast({ variant: "error", title: "Oof Studio isn't installed yet" });
    }
  );
}

function onStudioDoor(ctx) {
  if (debounced(ctx.time, lastStudioAt)) return;
  lastStudioAt = ctx.time;
  openStudioShelf(ctx);
}

function onCloudTop(ctx) {
  // badges.award is first-award-only, so repeat touches of the cloud do nothing.
  if (ctx.services.badges.award(CLOUD_BADGE) && parkour) parkour.celebrate(ctx.time);
}

// The Hub's own save (`place.hub`) holds exactly one fact: whether the Brick Climb has
// ever been finished on this device. Everything else about the Hub is derived.
function readBrickUnlocked(ctx) {
  const save = ctx.services.saves.load();
  return !!(save && save.brickUnlocked);
}

function openBrickLegend(ctx) {
  return ctx.services.ui.openExternal(BRICK_LEGEND_URL, {
    title: "Brick Legend",
    body: "You earned this. It opens in a new tab — OofWorld stays where it is.",
    confirmLabel: "Play Brick Legend",
  });
}

// The top of the climb: first time, this is what unlocks the gate at the bottom forever.
function onBrickTop(ctx) {
  if (debounced(ctx.time, lastBrickAt)) return;
  lastBrickAt = ctx.time;
  if (!brickUnlocked) {
    brickUnlocked = true;
    const save = ctx.services.saves.load() || {};
    save.brickUnlocked = true;
    ctx.services.saves.save(save);
    ctx.services.badges.award(BRICK_BADGE);
    if (climb) {
      climb.setUnlocked(true);
      climb.celebrate(ctx.time, BRICK_BEACON_S);
    }
    ctx.services.ui.toast({
      variant: "success",
      title: "Brick Climb beaten!",
      body: "The gate at the bottom is open from now on.",
    });
  }
  openBrickLegend(ctx);
}

// The gate at the bottom: the shortcut, once the climb has been beaten once.
function onBrickGate(ctx) {
  if (debounced(ctx.time, lastBrickAt)) return;
  lastBrickAt = ctx.time;
  if (brickUnlocked) {
    openBrickLegend(ctx);
    return;
  }
  ctx.services.ui.toast({
    variant: "info",
    title: "Brick Legend is locked",
    body: "Climb the tower behind this gate and touch the gold star at the top.",
  });
}

// One place decides what an ambience preset means: the renderer lighting (ambience.js)
// AND how hard the plaza's lamps burn. A lamp that stays a pilot light at midnight is
// the whole reason the plaza needed real lights.
function setAmbience(ctx, preset) {
  ambience = applyAmbience(ctx, preset);
  if (spectacle) spectacle.setNight(NIGHT_FACTOR[ambience] !== undefined ? NIGHT_FACTOR[ambience] : 0);
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
  lastStudioAt = -PORTAL_DEBOUNCE_S;

  lastBrickAt = -PORTAL_DEBOUNCE_S;

  signs = buildSigns(ctx);
  badgeWall = buildBadgeWall(ctx);
  parkour = buildParkour(ctx);
  spectacle = buildSpectacle(ctx, createTracker(ctx));
  climb = buildBrickClimb(ctx, createTracker(ctx));
  brickUnlocked = readBrickUnlocked(ctx);
  climb.setUnlocked(brickUnlocked);

  subs.push(ctx.events.on("platform:places", (payload) => onPlaces(ctx, payload)));
  // A Place the player has now seen loses its NEW! ribbon live (§5.3.3 point 6).
  subs.push(ctx.events.on("platform:placeLoaded", (payload) => {
    if (portals && payload && payload.slug) portals.forget(payload.slug);
  }));
  subs.push(ctx.events.on("touch:catalogDoor", () => onCatalogDoor(ctx)));
  subs.push(ctx.events.on("touch:studioDoor", () => onStudioDoor(ctx)));
  subs.push(ctx.events.on("touch:cloudTop", () => onCloudTop(ctx)));
  subs.push(ctx.events.on("touch:brickTop", () => onBrickTop(ctx)));
  subs.push(ctx.events.on("touch:brickGate", () => onBrickGate(ctx)));

  // §5.3.4 step 5: the boot ambience preset comes from profile.settings.ambience, but
  // a Place's ctx has no door to the profile domain (ctx.services.saves is scoped to
  // place.hub only) — the shell rides the value on the same platform:places bridge
  // that already exists to hand the Hub the registry (see shell.js's emit and the
  // report on this gap), so this only ever fires once, right after init returns.
  subs.push(ctx.events.on("platform:places", (payload) => {
    setAmbience(ctx, payload && payload.settings ? payload.settings.ambience : null);
  }));
  // A settings change made while the Hub is loaded re-applies live (§5.5).
  subs.push(ctx.events.on("platform:settingsChanged", (payload) => {
    setAmbience(ctx, payload && payload.settings ? payload.settings.ambience : null);
  }));

  const handle = debugHandle();
  if (handle) {
    handle.hub = {
      partCount: () => ctx.engine.parts.count(),
      portalCount: () => (portals ? portals.count : 0),
      // §5.3.6/§5.3.7 facts, so a smoke scenario can assert on the plaza's lamps and on
      // the Brick Legend gate without reading pixels or poking at private state.
      ambience: () => ambience,
      lampCount: () => (spectacle ? spectacle.lampCount : 0),
      litLights: () => ctx.engine.renderer.lights.activeCount(),
      sparkCount: () => (spectacle ? spectacle.sparkCount() : 0),
      brickUnlocked: () => brickUnlocked,
      climbSteps: () => (climb ? climb.steps : 0),
      climbTopY: () => (climb ? climb.landingY : 0),
      climbBase: () => (climb ? climb.base.slice() : null),
    };
  }
}

export function update(dt, ctx) {
  if (parkour) parkour.update(dt, ctx.time);
  if (spectacle) spectacle.update(dt, ctx.time);
  if (climb) climb.update(ctx.time);
}

export function dispose(ctx) {
  for (const off of subs) off();
  subs = [];
  // A My Places shelf left open when the Hub goes away would outlive it: it is a
  // fixed, full-viewport overlay that would sit over the next Place. Only ever a
  // module the door already imported — dispose imports nothing.
  if (shelfMod && typeof shelfMod.closeMyPlacesShelf === "function") shelfMod.closeMyPlacesShelf();
  teardownPortals(ctx);
  if (parkour) parkour.dispose(ctx);
  if (spectacle) spectacle.dispose(ctx);
  if (climb) climb.dispose(ctx);
  if (signs) signs.dispose(ctx);
  if (badgeWall) badgeWall.dispose(ctx);
  parkour = null;
  spectacle = null;
  climb = null;
  signs = null;
  badgeWall = null;
  // §5.3.4 clears the hub debug facts; the §3.7 field itself stays declared (criterion
  // 6 reads every §3.7 key), so it goes back to the shell's `null`, not deleted.
  const handle = debugHandle();
  if (handle) handle.hub = null;
}
