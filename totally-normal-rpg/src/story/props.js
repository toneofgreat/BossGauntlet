// props.js - STORY's interactables (NPCs, story props, graves, the void edge) and standing-spot secrets.
// Registered once at init through world.addInteractable; run-dependent visuals re-applied by applyRun().
import { PROPS, SHORT, GRAVES, itemName } from "./lines.js";
import { phaseIndex } from "./phases.js";

const CHASE = phaseIndex("chase");

// DESIGN 6 coordinates, used only when WORLD has no such named point
const FALLBACK = {
  spawn: { x: 0, y: 0, z: 10 }, underBridge: { x: -1.5, y: -0.8, z: 60 }, waterfallCave: { x: -78, y: 1, z: 60 },
  rookieShack: { x: -88, y: 1, z: 60 }, basement: { x: 2, y: -3, z: -2 }, portrait: { x: -30, y: 18, z: 465 },
  cactusFlower: { x: 95, y: 0, z: -1950 }, totem: { x: -1900, y: 0, z: 32 }, voidLeap: { x: -37, y: 0, z: -4 },
  well: { x: 0, y: 0, z: 240 }, towerLetter: { x: 14, y: 12, z: 308 }, throneSeat: { x: 0, y: 21, z: 506 },
  graveShovel: { x: 32, y: 0, z: -2 }, barnDoor: { x: -80, y: 0, z: 224 },
  kitten0: { x: -4, y: 7.2, z: -1 }, kitten1: { x: 18, y: 0, z: 108 }, kitten2: { x: 24, y: 8, z: 264 }
};
const VOID_EDGE = { x: -37, y: 0, z: -4 };
const TRAPDOOR = { x: 2, y: 0, z: -2 };
const CHAIR = { x: 3, y: 0, z: 6.5 };
const NPCS = ["bram", "nessa", "tobin", "ilsa", "pell", "odo", "wren", "fydor", "myles"];
const BODY = { fydor: "fydorIdle", myles: "mylesIdle" };

export function createProps(ctx, story, dlg) {
  const removers = [];
  const spots = [];
  let graves = [];
  let trapPos = null, basementPos = null, chairBody = null;

  const S = () => ctx.state;
  const run = () => ctx.state.run;
  const phase = () => ctx.state.run.phase;
  const player = () => (ctx.engine && ctx.engine.player) || null;

  function pt(name) {
    let p = null;
    try { const w = ctx.world; if (w && w.point) p = w.point(name); } catch (e) { p = null; }
    return p || FALLBACK[name] || null;
  }
  function propPos(id, fallback) {
    try {
      const o = ctx.world && ctx.world.prop ? ctx.world.prop(id) : null;
      if (o && o.getWorldPosition && ctx.THREE) { o.updateWorldMatrix && o.updateWorldMatrix(true, false); return o.getWorldPosition(new ctx.THREE.Vector3()); }
    } catch (e) { /* */ }
    return fallback;
  }
  function has(id) {
    try { const c = ctx.combat; return !!(c && c.has && c.has(id)); } catch (e) { return false; }
  }
  function fightActive() {
    try { const c = ctx.combat; return !!(c && c.fightActive && c.fightActive()); } catch (e) { return false; }
  }
  function toast(text, kind) { try { ctx.ui && ctx.ui.toast && ctx.ui.toast(text, { kind: kind || "info", dur: 3.5 }); } catch (e) { /* */ } }
  function sfx(id, pos) { try { ctx.audio && ctx.audio.sfx && ctx.audio.sfx(id, pos ? { pos } : undefined); } catch (e) { /* */ } }
  function anim(a) { try { const p = player(); p && p.play && p.play(a); } catch (e) { /* */ } }
  function guard(fn) { return () => { try { const r = fn(); if (r && r.catch) r.catch((e) => console.warn("[story]", e)); } catch (e) { console.warn("[story]", e); } }; }

  function add(def) {
    const w = ctx.world;
    if (!w || !w.addInteractable || !def.pos) return;
    try {
      const enabled = def.enabled;
      const r = w.addInteractable({
        id: def.id, pos: def.pos, radius: def.radius || 2.5, label: def.label, priority: def.priority || 0,
        enabled: () => { try { return !enabled || !!enabled(); } catch (e) { return false; } },
        onUse: guard(def.onUse)
      });
      if (typeof r === "function") removers.push(r);
    } catch (e) { console.warn("[story] addInteractable", def.id, e); }
  }
  function setLabel(id, label) { try { ctx.world && ctx.world.setInteractLabel && ctx.world.setInteractLabel(id, label); } catch (e) { /* */ } }

  // -------------------------------------------------------------------------------------------------- NPCs
  function registerNpcs() {
    const w = ctx.world;
    for (const id of NPCS) {
      let body = null;
      try { body = w && w.npc ? w.npc(BODY[id] || id) : null; } catch (e) { body = null; }
      if (!body || !body.pos) continue;
      if (id === "bram") chairBody = body;
      add({ id: "story.npc." + id, pos: body.pos, radius: 2.8, label: "Talk to " + SHORT[id], priority: 2,
        enabled: () => !(body.root && body.root.visible === false) && !(BODY[id] && fightActive()),
        onUse: () => story.talk(id) });
    }
    let sign = null;
    try { sign = w && w.npc ? w.npc("sign") : null; } catch (e) { sign = null; }
    if (sign && sign.pos) add({ id: "story.npc.sign", pos: sign.pos, radius: 2.4, label: "Read the sign", onUse: () => story.talk("sign") });

    // the Rookie, in his shack behind the waterfall
    let rpos = null;
    try { const sp = w && w.spawns ? w.spawns("rookie") : null; if (sp && sp[0] && sp[0].pos) rpos = sp[0].pos; } catch (e) { /* */ }
    rpos = rpos || pt("rookieShack");
    add({ id: "story.npc.rookie", pos: rpos, radius: 3.2, label: "Talk to the stranger", priority: 1,
      enabled: () => !fightActive(), onUse: () => story.talk("rookie") });
  }

  // -------------------------------------------------------------------------------------------------- props
  function registerProps() {
    // well (Fydor's Locket)
    add({ id: "story.well", pos: pt("well"), radius: 2.6, label: "Pull up the bucket", onUse: async () => {
      sfx("well_chain", pt("well"));
      if (!has("fydors_locket")) {
        try { ctx.combat && ctx.combat.give && ctx.combat.give("fydors_locket", { equip: false, silent: true }); } catch (e) { /* */ }
        await dlg.read("", PROPS.wellFirst);
        story.secret("fydorLocket");
      } else await dlg.read("", PROPS.wellAgain);
    } });
    // Myles's letter (watchtower top)
    add({ id: "story.letter", pos: pt("towerLetter"), radius: 2.2, label: "Read the letter", onUse: async () => {
      if (!has("mylesletter")) { try { ctx.combat && ctx.combat.give && ctx.combat.give("mylesletter", { equip: false, silent: true }); } catch (e) { /* */ } }
      await dlg.read("A letter", PROPS.letter);
      story.secret("mylesLetter");
    } });
    // the old portrait
    add({ id: "story.portrait", pos: pt("portrait"), radius: 3, label: "Look at the portrait", onUse: async () => {
      await dlg.read("", PROPS.portrait);
      story.secret("portrait");
    } });
    // the throne (cycle 0 before the chase: secret; cycle 1: a cold line)
    add({ id: "story.throne", pos: pt("throneSeat"), radius: 2.4, label: "Sit on the throne",
      enabled: () => {
        if (fightActive()) return false;
        const r = run(), pi = phaseIndex(r.phase);
        return ((r.cycle | 0) === 0 && pi < CHASE) || r.phase === "ng" || r.phase === "ngPostKing";
      },
      onUse: async () => {
        anim("sit");
        if ((run().cycle | 0) === 0) { await dlg.read("", PROPS.throne); story.secret("throneSeat"); }
        else await dlg.read("", PROPS.throneNg);
        anim("idle");
      } });
    // the blooming cactus
    add({ id: "story.cactus", pos: pt("cactusFlower"), radius: 2.6, label: "Touch the flower", onUse: async () => {
      await dlg.read("", PROPS.cactus);
      story.secret("cactusFlower");
    } });
    // the whispering totem (the secret is for standing still 5 s; reading is flavour)
    add({ id: "story.totem", pos: pt("totem"), radius: 2.6, label: "Listen to the totem", onUse: () => dlg.read("", PROPS.totem) });
    // kittens
    for (let k = 0; k < 3; k++) {
      const pos = pt("kitten" + k);
      add({ id: "story.kitten" + k, pos, radius: 2.2, label: "Pet the kitten", onUse: () => petKitten(k, pos) });
    }
    // the barn bell: re-fight Big Tom after his first defeat
    add({ id: "story.barnBell", pos: pt("barnDoor"), radius: 2.6, label: "Ring the bell",
      enabled: () => !!(S().profile.secrets && S().profile.secrets.catBoss) && !fightActive(),
      onUse: () => {
        sfx("bell", pt("barnDoor"));
        let ok = false;
        try { ok = !!(ctx.combat && ctx.combat.startFight && ctx.combat.startFight("cat")); } catch (e) { ok = false; }
        toast(ok ? PROPS.bell : PROPS.bellLocked);
      } });
    // Bram's empty rocking chair (after the seal breaks)
    add({ id: "story.chair", pos: propPos("lobbyRockingChair", CHAIR), radius: 2.2, label: "Touch the chair",
      enabled: () => !!(chairBody && chairBody.root && chairBody.root.visible === false),
      onUse: () => { sfx("chair_creak", CHAIR); return dlg.read("", PROPS.chair); } });
    // basement trapdoor + the way back up
    trapPos = propPos("trapdoor", TRAPDOOR);
    basementPos = pt("basement");
    add({ id: "story.trapdoor", pos: trapPos, radius: 1.8, label: "Lift the rug",
      enabled: () => { const p = player(); return !p || p.position.y > trapPos.y - 1.2; },
      onUse: goDown });
    add({ id: "story.climb", pos: basementPos, radius: 3, label: "Climb up",
      enabled: () => { const p = player(); return !!p && p.position.y < trapPos.y - 1.2; },
      onUse: climbUp });
    // the void edge: the World ending (choice only, confirmed twice: E, then "Let go")
    add({ id: "story.void", pos: pt("voidLeap"), radius: 2.6, label: "Step into the void", priority: 3,
      enabled: () => phase() === "choice" && !story.endingBusy && !ctx.state.rt.cinematic,
      onUse: leap });
    // graves + shovel
    add({ id: "story.shovel", pos: pt("graveShovel"), radius: 2.2, label: "Pick up the shovel",
      enabled: () => phase() === "choice" && !has("shovel"),
      onUse: () => {
        try { ctx.combat && ctx.combat.give && ctx.combat.give("shovel", { equip: false, silent: true }); } catch (e) { /* */ }
        showShovelProp();
        toast(PROPS.shovel);
        refreshLabels();
      } });
    graves = [];
    try { graves = (ctx.world && ctx.world.graves) || []; } catch (e) { graves = []; }
    for (let i = 0; i < graves.length; i++) {
      const g = graves[i];
      const def = GRAVES.find((d) => d.id === g.id) || GRAVES[i];
      if (!def || !g.pos) continue;
      add({ id: "story." + g.id, pos: g.pos, radius: 1.6, label: graveLabel(def), onUse: () => useGrave(g, def) });
    }
  }

  function petKitten(k, pos) {
    sfx("kitten_purr", pos);
    const fl = run().flags || (run().flags = {});
    const mask = (fl["story.kittens"] | 0) | (1 << k);
    fl["story.kittens"] = mask;
    const n = (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);
    const prof = S().profile;
    if (prof.secrets && prof.secrets.kittens) { toast(PROPS.kitten); return; }
    if (n >= 3) {
      story.secret("kittens");
      story.after(2.5, () => toast(PROPS.kittenAll));
    } else toast(`${PROPS.kitten} (${n}/3)`);
  }

  async function goDown() {
    sfx("creak", trapPos);
    try { const t = ctx.world.prop("trapdoor"); if (t) t.rotation.x = -1.3; } catch (e) { /* */ }
    try { const rug = ctx.world.prop("lobbyRug"); if (rug) rug.visible = false; } catch (e) { /* */ }
    let floor = false;
    try {
      const ph = ctx.engine && ctx.engine.physics;
      if (ph && ph.groundAt && basementPos) {
        const g = ph.groundAt(basementPos.x, basementPos.z, basementPos.y + 1);
        floor = !!g && Math.abs(g.y - basementPos.y) < 1.2;
      }
    } catch (e) { floor = false; }
    const p = player();
    if (floor && p && p.teleport) {
      try { if (ctx.ui && ctx.ui.fade) await ctx.ui.fade(1, 0.4); } catch (e) { /* */ }
      p.teleport({ x: basementPos.x, y: basementPos.y + 0.05, z: basementPos.z + 1 }, p.yaw);
      try { if (ctx.ui && ctx.ui.fade) await ctx.ui.fade(0, 0.5); } catch (e) { /* */ }
      story.secret("basement");
      await dlg.read("", PROPS.basement);
    } else {
      story.secret("basement");
      await dlg.read("", PROPS.basementPeek);
    }
  }
  async function climbUp() {
    const p = player();
    if (!p || !p.teleport) return;
    try { if (ctx.ui && ctx.ui.fade) await ctx.ui.fade(1, 0.3); } catch (e) { /* */ }
    p.teleport({ x: trapPos.x, y: trapPos.y + 0.05, z: trapPos.z + 1.3 }, p.yaw);
    sfx("creak", trapPos);
    try { if (ctx.ui && ctx.ui.fade) await ctx.ui.fade(0, 0.4); } catch (e) { /* */ }
  }

  async function leap() {
    const ui = ctx.ui;
    let c = 0;
    try {
      if (ui && ui.confirm) c = await ui.confirm(PROPS.voidStay, ["Stay", "Let go"]);
      else if (ui && ui.dialogue) c = await ui.dialogue({ speaker: "", lines: [PROPS.voidStay], choices: ["Stay", "Let go"] });
    } catch (e) { c = 0; }
    if (c === 1 && phase() === "choice") await story.reachEnding("world");
  }

  // graves
  function ownedVariant(base) {
    if (has(base)) return base;
    if (has("bad_" + base)) return "bad_" + base;
    return null;
  }
  function graveLabel(def) {
    const r = run();
    if (r.buried && r.buried[def.id]) return def.name + " (buried)";
    if (r.phase === "choice") return (has("shovel") ? "Bury: " : "Grave: ") + def.name;
    return "Read: " + def.name;
  }
  function refreshLabels() {
    for (const d of GRAVES) setLabel("story." + d.id, graveLabel(d));
    const sec = S().profile.secrets || {};
    setLabel("story.npc.rookie", sec.rookieBoss ? "Talk to Rookie" : "Talk to the stranger");
  }
  async function useGrave(g, def) {
    const r = run();
    const buried = r.buried || (r.buried = {});
    if (buried[def.id]) return dlg.read("", PROPS.graveDone(def.name));
    if (r.phase !== "choice") return dlg.read("", (r.cycle | 0) >= 1 ? PROPS.graveNg(def.name) : PROPS.graveFresh(def.name));
    if (!has("shovel")) { toast(PROPS.graveNoShovel, "warn"); return; }
    const item = ownedVariant(def.item);
    if (!item) {
      const alt = def.item === "girls_ribbon" ? "" : itemName("bad_" + def.item);
      toast(PROPS.graveNeed(def.name, itemName(def.item), alt, def.from), "warn");
      return;
    }
    let removed = false;
    try { removed = !!(ctx.combat && ctx.combat.remove && ctx.combat.remove(item)); } catch (e) { removed = false; }
    if (!removed && has(item)) { toast(PROPS.graveNeed(def.name, itemName(def.item), "", def.from), "warn"); return; }
    buried[def.id] = true;
    try { g.setBuried && g.setBuried(true); } catch (e) { /* */ }
    sfx("dig", g.pos);
    anim("dig");
    toast(PROPS.graveBuried(def.name, itemName(item)), "good");
    refreshLabels();
    try { ctx.save && ctx.save.write && ctx.save.write(); } catch (e) { /* */ }
    let all = true;
    for (const d of GRAVES) if (!buried[d.id]) { all = false; break; }
    if (all) story.after(1.6, () => { if (phase() === "choice") story.reachEnding("warrior"); });
  }
  function showShovelProp() {
    try { const s = ctx.world && ctx.world.prop ? ctx.world.prop("shovel") : null; if (s) s.visible = !has("shovel"); } catch (e) { /* */ }
  }

  // -------------------------------------------------------------------------------------------------- spots
  function addSpot(secret, p, r, dy, hold, msgAt, msg) {
    if (!p) return;
    spots.push({ secret, x: p.x, y: p.y, z: p.z, r2: r * r, dy, hold, msgAt: msgAt || 0, msg: msg || null, t: 0, said: false });
  }
  function registerSpots() {
    addSpot("underBridge", pt("underBridge"), 1.9, 1.4, 0.4);
    addSpot("waterfall", pt("waterfallCave"), 3.5, 3, 0);
    addSpot("basement", pt("basement"), 3, 1.5, 0);
    addSpot("portrait", pt("portrait"), 4.5, 3, 0.6);
    addSpot("cactusFlower", pt("cactusFlower"), 3, 4, 0.5);
    addSpot("totem", pt("totem"), 3.5, 3, 5, 1.5, PROPS.totemWhisper);
    addSpot("voidWhisper", VOID_EDGE, 3.5, 3, 30, 12, PROPS.voidHum);
  }
  // called ~5x/s with the elapsed time
  function update(dt) {
    const p = player();
    if (!p) return;
    const px = p.position.x, py = p.position.y, pz = p.position.z;
    const sec = S().profile.secrets || {};
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      if (sec[s.secret]) continue;
      const dx = px - s.x, dz = pz - s.z;
      if (dx * dx + dz * dz <= s.r2 && Math.abs(py - s.y) <= s.dy) {
        s.t += dt;
        if (s.msg && !s.said && s.t >= s.msgAt) { s.said = true; story.say("", s.msg, { dur: 4 }); }
        if (s.t >= s.hold) story.secret(s.secret);
      } else { s.t = 0; s.said = false; }
    }
  }

  function applyRun() {
    const r = run();
    const buried = r.buried || {};
    for (let i = 0; i < graves.length; i++) {
      const g = graves[i];
      try { g.setBuried && g.setBuried(!!buried[g.id]); } catch (e) { /* */ }
    }
    showShovelProp();
    try { const t = ctx.world && ctx.world.prop ? ctx.world.prop("trapdoor") : null; if (t) t.rotation.x = 0; } catch (e) { /* */ }
    try { const rug = ctx.world && ctx.world.prop ? ctx.world.prop("lobbyRug") : null; if (rug) rug.visible = true; } catch (e) { /* */ }
    for (let i = 0; i < spots.length; i++) { spots[i].t = 0; spots[i].said = false; }
    refreshLabels();
  }

  function init() {
    if (!ctx.world) { console.warn("[story] no world: interactables skipped"); registerSpots(); return; }
    registerNpcs();
    registerProps();
    registerSpots();
  }

  return { init, update, applyRun, refreshLabels, resetRun: applyRun, spots, dispose() { for (const r of removers) { try { r(); } catch (e) { /* */ } } } };
}
