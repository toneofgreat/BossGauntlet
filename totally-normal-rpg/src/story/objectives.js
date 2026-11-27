// objectives.js - the quest / objective director (DESIGN 5.5, CONTRACT 9.1).
// evaluate(facts, out) is PURE (node-testable): it decides { id, text, target, tip } from a facts snapshot.
//   target: a world waypoint name ("bridgeFar"), "portal:<id>" (live portal pos), "live:<kind>" (nearest live
//   enemy of that kind, else the fallback in out.fallback), "collapseEnd", or null (no marker).
// createDirector(ctx, story) is the runtime: gathers facts, resolves targets, calls ui.setObjective, emits objective:set.

export function fmt(n) {
  n = Math.round(Number(n) || 0);
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const NAMES0 = { morph: "Villager Morph", ironArmor: "Iron Armor" };
const NAMES1 = { morph: "Scarecrow Morph", ironArmor: "Rusty Bucket Armor" };

/** default needs / recs per cycle (used when COMBAT is missing) */
export function defaultNeeds(cycle) {
  return cycle >= 1 ? { area2: 100, area3: 100000, kingPortal: 200000 } : { area2: 50, area3: 50000, kingPortal: 100000 };
}
export function defaultRecs(cycle) {
  const m = cycle >= 1 ? 2 : 1;
  return { ratKing: 5 * m, villager: 50 * m, guards: 500 * m, royalGuard: 55000 * m };
}

/** a fresh facts object (shape the director fills) */
export function makeFacts() {
  return {
    cycle: 0, phase: "intro", zone: "lobby", level: 0,
    crossed: false, enteredVillage: false, enteredCastle: false,
    ratKills: 0, ratKingWins: 0, guardsBeaten: false, kingWins: 0,
    ownsIronSword: false, ownsMorph: false, ownsIronArmor: false, tobinTalked: false,
    needs: defaultNeeds(0), recs: defaultRecs(0)
  };
}
export function makeOut() { return { id: null, text: null, target: null, fallback: null, tip: null }; }

function set(out, id, text, target, fallback) {
  out.id = id; out.text = text; out.target = target === undefined ? null : target;
  out.fallback = fallback || null;
  return out;
}

const DESERT_ZONES = { desert: 1 };
const FOREST_ZONES = { forest: 1, forestHouse: 1 };

export function evaluate(f, out) {
  out = out || makeOut();
  out.tip = null;
  const ng = f.cycle >= 1;
  const z = f.zone;
  switch (f.phase) {
    case "postKing":
      if (z === "kingDark") return set(out, "kingReturn", "Go back through the portal", "portal:kingReturn");
      if (DESERT_ZONES[z] || FOREST_ZONES[z]) return set(out, "keepWalking", "Keep walking", null);
      return set(out, "behindHouse", "Something opened behind the Lobby House", "lobbyBack");
    case "desert": case "forest":
      return set(out, "keepWalking", "Keep walking", null);
    case "forestHouse":
      return set(out, "goOutside", "Go outside", "forestHouseDoorOut");
    case "chase":
      if (z === "forest" || z === "forestHouse") return set(out, "run", "RUN", "portal:forestBack");
      if (z === "desert") return set(out, "run", "RUN", "portal:desertBack");
      return set(out, "run", "RUN", null);
    case "collapse":
      return set(out, "runCastle", "RUN TO THE CASTLE", "collapseEnd");
    case "throne":
      return set(out, "survive", "Survive", null);
    case "ngPostKing":
      if (z === "kingDark") return set(out, "kingReturn", "Go back through the portal", "portal:kingReturn");
      if (DESERT_ZONES[z]) return set(out, "forestHouse", "The house in the forest", "portal:desertExit", "desertExitNg");
      if (FOREST_ZONES[z]) return set(out, "forestHouse", "The house in the forest", "forestHouseDoorFront");
      return set(out, "forestHouse", "The house in the forest", "lobbyBack");
    case "hollowDesert": case "girl":
      return set(out, "crying", "Someone is crying", "girl");
    case "hollow2":
      return set(out, "itIsHere", "It is here", "hollowFar");
    case "choice":
      return set(out, "choice", null, null);
    case "finalBoss":
      return set(out, "finalBoss", "The end of the world", null);
    case "ended":
      return set(out, null, null, null);
    default:
      break;   // intro area1 area2 area3 ng: the progression chain below
  }

  const L = f.level || 0, needs = f.needs || defaultNeeds(f.cycle), recs = f.recs || defaultRecs(f.cycle);
  const names = ng ? NAMES1 : NAMES0;

  if (z === "kingDark") {
    if (f.kingWins > 0) return set(out, "kingReturn", "Go back through the portal", "portal:kingReturn");
    return set(out, "king", "Defeat the King", "live:king");
  }
  if (!f.crossed) return set(out, "bridge", ng ? "Cross the bridge. Again." : "Cross the bridge", "bridgeFar");
  if (f.ratKills === 0 && L < recs.ratKing) return set(out, "rats", "Fight the small rats", "ratField");

  if (L >= needs.kingPortal) {
    if (f.kingWins > 0) return set(out, "kingAgain", "Fight the King again, or explore", "kingPortal");
    return set(out, "kingPortal", "Enter the King's portal", "kingPortal");
  }
  if (f.enteredCastle || z === "castle" || z === "throne")
    return set(out, "royals", `Defeat the Royal Guards (Lv ${fmt(recs.royalGuard)})`, "courtyard");
  if (L >= needs.area3) return set(out, "enterCastle", "Climb to the castle (Area 3)", "gate3");
  if (f.ownsIronSword || f.guardsBeaten) {
    if (L >= 1000 && !f.ownsIronArmor) return set(out, "ironArmor", `Claim the ${names.ironArmor} at the Exchange`, "exchange");
    return set(out, "castleLevel", `Reach level ${fmt(needs.area3)} for the castle`, "guardPost");
  }
  if (L >= recs.guards) return set(out, "guards", `Defeat the guards, Fydor and Myles (Lv ${fmt(recs.guards)})`, "guardPost");
  if (L >= 200 && !f.ownsMorph && (f.enteredVillage || L >= needs.area2))
    return set(out, "morph", `Claim the ${names.morph} at the Exchange`, "exchange");
  if (L >= needs.area2 || f.enteredVillage) {
    if (!f.enteredVillage) return set(out, "enterVillage", "Enter the village (Area 2)", "gate2");
    const t = L >= 200 ? `Fight the villagers (guards at Lv ${fmt(recs.guards)})` : `Fight the villagers (Lv ${fmt(recs.villager)})`;
    return set(out, "villagers", t, "live:villager", "villageSquare");
  }
  if (f.ratKingWins > 0) return set(out, "farmRatKing", `Reach level ${fmt(needs.area2)} to open the village gate`, "ratKingGate");
  if (L >= recs.ratKing) return set(out, "ratKing", "Beat the Rat King at the old mill", "ratKingGate");
  set(out, "levelRats", `Beat rats to level up (Lv ${fmt(recs.ratKing)} for the Rat King)`, "ratField");
  if (L >= 3 && !f.tobinTalked && !ng) out.tip = "tobin";
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// runtime
const COLLAPSE_END = { x: 3000, y: 18, z: 600 };

export function createDirector(ctx, story) {
  const facts = makeFacts();
  const out = makeOut();
  let forced = null;            // { id, text, target } or null
  let curId, curText, curTarget, curHas = false;
  let dirty = true;
  const tipsShown = Object.create(null);   // per run
  const wpCache = Object.create(null);

  function waypoint(name) {
    if (name in wpCache) return wpCache[name];
    let p = null;
    try { const w = ctx.world; if (w) p = (w.waypoint ? w.waypoint(name) : null) || (w.point ? w.point(name) : null); }
    catch (e) { p = null; }
    if (p) wpCache[name] = p;   // only cache hits (WORLD may register late)
    return p || null;
  }

  function nearestEnemy(kind) {
    const c = ctx.combat; const list = c && c.enemies; const pl = ctx.engine && ctx.engine.player;
    if (!list || !pl) return null;
    const px = pl.position.x, pz = pl.position.z;
    let best = null, bd = 1e18;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.kind !== kind || !e.alive || !e.pos) continue;
      const dx = e.pos.x - px, dz = e.pos.z - pz, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = e.pos; }
    }
    return best;
  }

  function resolve(target, fallback) {
    if (!target) return null;
    if (typeof target === "object") return target;
    if (target === "collapseEnd") return waypoint("collapseEnd") || COLLAPSE_END;
    if (target.startsWith("portal:")) {
      try {
        const p = ctx.world && ctx.world.portal && ctx.world.portal(target.slice(7));
        if (p && p.pos && (p.active === undefined || p.active)) return p.pos;
      } catch (e) { /* fall through */ }
      return fallback ? waypoint(fallback) : (target === "portal:kingReturn" ? null : waypoint(target.slice(7)));
    }
    if (target.startsWith("live:")) return nearestEnemy(target.slice(5)) || (fallback ? waypoint(fallback) : null);
    return waypoint(target);
  }

  function has(id) {
    const c = ctx.combat;
    try { if (c && c.has) return !!(c.has(id) || c.has("bad_" + id)); } catch (e) { /* */ }
    const o = ctx.state.run.owned || {};
    return !!(o[id] || o["bad_" + id]);
  }

  function gather() {
    const s = ctx.state, run = s.run, fl = run.flags || {}, kills = run.kills || {}, c = ctx.combat;
    facts.cycle = run.cycle | 0;
    facts.phase = run.phase;
    facts.zone = (s.world && s.world.zone) || "lobby";
    let L = run.level || 0;
    try { if (c && c.level) L = c.level(); } catch (e) { /* */ }
    facts.level = L;
    facts.crossed = !!fl["story.crossed"];
    facts.enteredVillage = !!fl["story.village"];
    facts.enteredCastle = !!fl["story.castle"];
    facts.ratKills = (kills.rat | 0) + (kills.goldenRat | 0);
    facts.ratKingWins = kills.ratKing | 0;
    facts.kingWins = run.kingWins | 0;
    facts.ownsIronSword = has("iron_sword");
    facts.guardsBeaten = facts.ownsIronSword || (kills.fydor | 0) > 0 || (kills.myles | 0) > 0;
    facts.ownsMorph = has("villager_morph");
    facts.ownsIronArmor = has("iron_armor");
    facts.tobinTalked = !!(s.profile.npcsTalked && s.profile.npcsTalked.tobin);
    const dn = defaultNeeds(facts.cycle), dr = defaultRecs(facts.cycle);
    const needs = facts.needs, recs = facts.recs;
    needs.area2 = num(c, "need", "area2", dn.area2); needs.area3 = num(c, "need", "area3", dn.area3);
    needs.kingPortal = num(c, "need", "kingPortal", dn.kingPortal);
    recs.ratKing = num(c, "rec", "ratKing", dr.ratKing); recs.villager = num(c, "rec", "villager", dr.villager);
    recs.guards = num(c, "rec", "fydor", dr.guards); recs.royalGuard = num(c, "rec", "royalGuard", dr.royalGuard);
    return facts;
  }
  function num(c, fn, arg, dflt) {
    try { if (c && c[fn]) { const v = c[fn](arg); if (typeof v === "number" && isFinite(v) && v > 0) return v; } }
    catch (e) { /* */ }
    return dflt;
  }

  // targets are stable objects (cached waypoints, live Vector3s the UI tracks itself), so identity is enough
  function apply(id, text, target) {
    if (curHas && id === curId && text === curText && target === curTarget) return;
    curId = id; curText = text; curTarget = target; curHas = true;
    try { if (ctx.ui && ctx.ui.setObjective) ctx.ui.setObjective(text || null, target || null); } catch (e) { console.warn("[story]", e); }
    ctx.bus.emit("objective:set", { id: id || null, text: text || null,
      target: target ? { x: target.x, y: target.y, z: target.z } : null });
  }

  function tip(key) {
    if (!key || tipsShown[key]) return;
    tipsShown[key] = true;
    const st = ctx.state.settings;
    if (st && st.hints === false) return;
    try { story._tip(key); } catch (e) { /* */ }
  }

  function update() {
    dirty = false;
    if (forced) { apply(forced.id, forced.text, resolve(forced.target, forced.fallback)); return; }
    gather();
    evaluate(facts, out);
    apply(out.id, out.text, resolve(out.target, out.fallback));
    if (out.tip) tip(out.tip);
  }

  return {
    facts, out,
    markDirty() { dirty = true; },
    get dirty() { return dirty; },
    update,
    tip,
    /** force an objective; null returns control to the director */
    force(o) {
      if (o === null || o === undefined) forced = null;
      else if (typeof o === "string") forced = FORCED[o] ? FORCED[o] : { id: o, text: o, target: null };
      else forced = { id: o.id || "custom", text: o.text === undefined ? null : o.text, target: o.target || null, fallback: o.fallback || null };
      curHas = false;
      update();
    },
    get forced() { return forced; },
    current() { return { id: curId || null, text: curText || null }; },
    hide() { forced = { id: null, text: null, target: null }; curHas = false; update(); },
    resetRun() {
      forced = null; curHas = false; dirty = true;
      for (const k in tipsShown) delete tipsShown[k];
    },
    clearCache() { for (const k in wpCache) delete wpCache[k]; }
  };
}

// ids EVENTS may force by name (DESIGN 5.5 table)
export const FORCED = Object.freeze({
  bridge: { id: "bridge", text: "Cross the bridge", target: "bridgeFar" },
  behindHouse: { id: "behindHouse", text: "Something opened behind the Lobby House", target: "lobbyBack" },
  keepWalking: { id: "keepWalking", text: "Keep walking", target: null },
  goOutside: { id: "goOutside", text: "Go outside", target: "forestHouseDoorOut" },
  run: { id: "run", text: "RUN", target: null },
  runCastle: { id: "runCastle", text: "RUN TO THE CASTLE", target: "collapseEnd" },
  survive: { id: "survive", text: "Survive", target: null },
  bridgeAgain: { id: "bridgeAgain", text: "Cross the bridge. Again.", target: "bridgeFar" },
  forestHouse: { id: "forestHouse", text: "The house in the forest", target: "forestHouseDoorFront" },
  openDoor: { id: "openDoor", text: "Open the door", target: "forestHouseDoorFront" },
  crying: { id: "crying", text: "Someone is crying", target: "girl" },
  itIsHere: { id: "itIsHere", text: "It is here", target: "hollowFar" },
  choice: { id: "choice", text: null, target: null },
  finalBoss: { id: "finalBoss", text: "The end of the world", target: null },
  none: { id: null, text: null, target: null }
});
