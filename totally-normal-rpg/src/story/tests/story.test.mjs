// node src/story/tests/story.test.mjs  (from totally-normal-rpg/) - STORY unit + integration tests, no browser.
import assert from "node:assert/strict";
import { validateName, onlineNameFor, onlineRetryName, nameHint, RUDE_HINT } from "../names.js";
import { evaluate, makeFacts, makeOut, defaultNeeds, defaultRecs, fmt } from "../objectives.js";
import { isLegalTransition, normalizeResume, PHASES } from "../phases.js";
import { SECRETS, SECRET_TOTAL, countFound } from "../secrets.js";
import { endingAllowed, endingButtons, ENDING_IDS } from "../endings.js";
import { getDialogue, NPC_IDS, PROPS, TIPS } from "../lines.js";
import * as Story from "../index.js";

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join("\n       ") : e)); }
}

// ------------------------------------------------------------------------------------------------ names
console.log("names");
await test("special names allowed (any case)", () => {
  for (const n of ["idiot", "IDIOT", "Idiot", "  idiot  "]) { const r = validateName(n); assert.equal(r.ok, true, n); assert.equal(r.special, false); }
  for (const n of ["mygranniesamotherfucker", "MyGranniesAMotherFucker", "MYGRANNIESAMOTHERFUCKER"]) {
    const r = validateName(n); assert.equal(r.ok, true, n); assert.equal(r.special, true);
  }
});
await test("near-misses of the special names are rejected as rude", () => {
  for (const n of ["mygranniesamotherfucker2", "my grannie motherfucker", "idiotfuck", "fuck", "motherfucker", "xmygranniesamotherfucker"]) {
    const r = validateName(n); assert.equal(r.ok, false, n); assert.equal(r.reason, "rude", n); assert.equal(r.hint, RUDE_HINT);
  }
});
await test("length 3..24", () => {
  assert.equal(validateName("ab").reason, "short");
  assert.equal(validateName("abc").ok, true);
  assert.equal(validateName("a".repeat(12) + "b".repeat(12)).ok, true);        // 24
  assert.equal(validateName("a".repeat(13) + "b".repeat(12)).reason, "long");  // 25
  assert.equal(validateName("Sir Reginald Pemberton").ok, true);              // 22, has spaces
  assert.equal(nameHint("long"), "3 to 24 letters");
});
await test("chars / letters rules", () => {
  assert.equal(validateName("bob!").reason, "chars");
  assert.equal(validateName("a1234").reason, "letters");
  assert.equal(validateName("  Mary   Jane ").name, "Mary Jane");
  assert.equal(validateName("Brave_Otter-42").ok, true);
});
await test("long names are also rude-checked", () => {
  assert.equal(validateName("TheVeryLongShitheadName").ok, false);
  assert.equal(validateName("ClassyBassPlayerAbcdefg").ok, true);
});
await test("online names", () => {
  assert.equal(onlineNameFor("MyGranniesAMotherFucker"), "MyGrannie");
  assert.equal(onlineNameFor("idiot"), "idiot");
  assert.equal(onlineNameFor("Tester"), "Tester");
  assert.equal(onlineNameFor("Sir Reginald Pemberton"), "Sir Reginald Pem");
  assert.ok(onlineNameFor("Sir Reginald Pemberton").length <= 16);
  const r = onlineRetryName("Sir Reginald Pemberton", () => 0.5);
  assert.ok(r.length <= 16 && /\d\d$/.test(r), r);
});

// ------------------------------------------------------------------------------------------------ director
console.log("objective director");
function F(over) {
  const f = makeFacts();
  Object.assign(f, over || {});
  f.needs = defaultNeeds(f.cycle); f.recs = defaultRecs(f.cycle);
  return f;
}
const ev = (over) => evaluate(F(over), makeOut());
await test("cycle 0 progression chain (DESIGN 5.5)", () => {
  let o = ev({});
  assert.equal(o.text, "Cross the bridge"); assert.equal(o.target, "bridgeFar");
  o = ev({ crossed: true, phase: "area1" });
  assert.equal(o.text, "Fight the small rats"); assert.equal(o.target, "ratField");
  o = ev({ crossed: true, phase: "area1", ratKills: 1, level: 2 });
  assert.equal(o.text, "Beat rats to level up (Lv 5 for the Rat King)"); assert.equal(o.tip, null);
  o = ev({ crossed: true, phase: "area1", ratKills: 2, level: 3 });
  assert.equal(o.tip, "tobin");
  o = ev({ crossed: true, phase: "area1", ratKills: 2, level: 3, tobinTalked: true });
  assert.equal(o.tip, null);
  o = ev({ crossed: true, ratKills: 4, level: 5 });
  assert.equal(o.text, "Beat the Rat King at the old mill"); assert.equal(o.target, "ratKingGate");
  o = ev({ crossed: true, ratKills: 4, level: 14, ratKingWins: 1 });
  assert.equal(o.text, "Reach level 50 to open the village gate");
  o = ev({ crossed: true, ratKills: 4, level: 55, ratKingWins: 4 });
  assert.equal(o.text, "Enter the village (Area 2)"); assert.equal(o.target, "gate2");
  o = ev({ crossed: true, ratKills: 4, level: 60, ratKingWins: 4, enteredVillage: true, phase: "area2" });
  assert.equal(o.text, "Fight the villagers (Lv 50)"); assert.equal(o.target, "live:villager"); assert.equal(o.fallback, "villageSquare");
  o = ev({ crossed: true, ratKills: 4, level: 210, enteredVillage: true, phase: "area2" });
  assert.equal(o.text, "Claim the Villager Morph at the Exchange"); assert.equal(o.target, "exchange");
  o = ev({ crossed: true, ratKills: 4, level: 300, enteredVillage: true, ownsMorph: true, phase: "area2" });
  assert.equal(o.text, "Fight the villagers (guards at Lv 500)");
  o = ev({ crossed: true, ratKills: 4, level: 520, enteredVillage: true, ownsMorph: true, phase: "area2" });
  assert.equal(o.text, "Defeat the guards, Fydor and Myles (Lv 500)"); assert.equal(o.target, "guardPost");
  o = ev({ crossed: true, ratKills: 4, level: 1200, enteredVillage: true, ownsIronSword: true, phase: "area2" });
  assert.equal(o.text, "Claim the Iron Armor at the Exchange");
  o = ev({ crossed: true, ratKills: 4, level: 1200, enteredVillage: true, ownsIronSword: true, ownsIronArmor: true, phase: "area2" });
  assert.equal(o.text, "Reach level 50,000 for the castle");
  o = ev({ crossed: true, ratKills: 4, level: 50100, enteredVillage: true, ownsIronSword: true, ownsIronArmor: true });
  assert.equal(o.text, "Climb to the castle (Area 3)"); assert.equal(o.target, "gate3");
  o = ev({ crossed: true, ratKills: 4, level: 50100, enteredVillage: true, enteredCastle: true, ownsIronSword: true, phase: "area3" });
  assert.equal(o.text, "Defeat the Royal Guards (Lv 55,000)"); assert.equal(o.target, "courtyard");
  o = ev({ crossed: true, ratKills: 4, level: 100000, enteredCastle: true, phase: "area3" });
  assert.equal(o.text, "Enter the King's portal"); assert.equal(o.target, "kingPortal");
  o = ev({ crossed: true, ratKills: 4, level: 100000, enteredCastle: true, phase: "area3", zone: "kingDark" });
  assert.equal(o.text, "Defeat the King"); assert.equal(o.target, "live:king");
});
await test("post-King phases", () => {
  assert.equal(ev({ phase: "postKing" }).text, "Something opened behind the Lobby House");
  assert.equal(ev({ phase: "postKing" }).target, "lobbyBack");
  assert.equal(ev({ phase: "postKing", zone: "kingDark", kingWins: 1 }).target, "portal:kingReturn");
  assert.equal(ev({ phase: "desert", zone: "desert" }).text, "Keep walking");
  assert.equal(ev({ phase: "desert", zone: "desert" }).target, null);
  assert.equal(ev({ phase: "forest", zone: "forest" }).text, "Keep walking");
  assert.equal(ev({ phase: "forestHouse" }).text, "Go outside");
  assert.equal(ev({ phase: "chase", zone: "forest" }).text, "RUN");
  assert.equal(ev({ phase: "chase", zone: "forest" }).target, "portal:forestBack");
  assert.equal(ev({ phase: "chase", zone: "desert" }).target, "portal:desertBack");
  assert.equal(ev({ phase: "collapse" }).text, "RUN TO THE CASTLE");
  assert.equal(ev({ phase: "throne" }).text, "Survive");
});
await test("cycle 1", () => {
  let o = ev({ cycle: 1, phase: "ng" });
  assert.equal(o.text, "Cross the bridge. Again.");
  o = ev({ cycle: 1, phase: "ng", crossed: true, ratKills: 3, level: 6 });
  assert.equal(o.text, "Beat rats to level up (Lv 10 for the Rat King)");
  assert.equal(o.tip, null);
  o = ev({ cycle: 1, phase: "ng", crossed: true, ratKills: 3, level: 60, ratKingWins: 2 });
  assert.equal(o.text, "Reach level 100 to open the village gate");
  o = ev({ cycle: 1, phase: "ng", crossed: true, ratKills: 3, level: 250, enteredVillage: true });
  assert.equal(o.text, "Claim the Scarecrow Morph at the Exchange");
  o = ev({ cycle: 1, phase: "ngPostKing" });
  assert.equal(o.text, "The house in the forest"); assert.equal(o.target, "lobbyBack");
  o = ev({ cycle: 1, phase: "ngPostKing", zone: "desert" });
  assert.equal(o.target, "portal:desertExit"); assert.equal(o.fallback, "desertExitNg");
  assert.equal(ev({ cycle: 1, phase: "ngPostKing", zone: "forest" }).target, "forestHouseDoorFront");
  assert.equal(ev({ cycle: 1, phase: "hollowDesert" }).text, "Someone is crying");
  assert.equal(ev({ cycle: 1, phase: "hollowDesert" }).target, "girl");
  assert.equal(ev({ cycle: 1, phase: "hollow2" }).text, "It is here");
  assert.equal(ev({ cycle: 1, phase: "choice" }).text, null);
  assert.equal(ev({ cycle: 1, phase: "choice" }).target, null);
  assert.equal(ev({ cycle: 1, phase: "ended" }).id, null);
});
await test("evaluate reuses the out object", () => {
  const out = makeOut(), f = F({});
  assert.equal(evaluate(f, out), out);
  f.crossed = true; evaluate(f, out);
  assert.equal(out.id, "rats");
  assert.equal(fmt(1234567), "1,234,567");
});

// ------------------------------------------------------------------------------------------------ phases / secrets / endings / lines
console.log("phases, secrets, endings, lines");
await test("phase transitions", () => {
  assert.equal(isLegalTransition("intro", "area1"), true);
  assert.equal(isLegalTransition("intro", "area3"), true);
  assert.equal(isLegalTransition("area2", "area1"), false);
  assert.equal(isLegalTransition("throne", "ng"), false);
  assert.equal(isLegalTransition("throne", "ng", { viaCycle: true }), true);
  assert.equal(isLegalTransition("area1", "ended"), true);
  assert.equal(isLegalTransition("ended", "choice"), true);
  assert.equal(isLegalTransition("ended", "finalBoss"), true);
  assert.equal(isLegalTransition("ended", "intro"), true);
  assert.equal(isLegalTransition("finalBoss", "choice"), true);
  assert.equal(isLegalTransition("choice", "finalBoss"), true);
  assert.equal(isLegalTransition("choice", "hollow2"), false);
  assert.equal(PHASES.length, 19);
});
await test("resume normalisation (D4.10)", () => {
  assert.deepEqual(normalizeResume("area2"), { phase: "area2", place: "lobby" });
  assert.deepEqual(normalizeResume("chase"), { phase: "postKing", place: "lobby" });
  assert.deepEqual(normalizeResume("throne"), { phase: "throne", place: "throneDoor" });
  assert.deepEqual(normalizeResume("girl"), { phase: "ngPostKing", place: "lobby" });
  assert.deepEqual(normalizeResume("ended"), { phase: "choice", place: "choice" });
  assert.deepEqual(normalizeResume("garbage"), { phase: "intro", place: "lobby" });
});
await test("secrets registry", () => {
  assert.equal(SECRET_TOTAL, 26);
  assert.equal(new Set(SECRETS.map((s) => s.id)).size, 26);
  for (const e of ENDING_IDS) assert.ok(SECRETS.find((s) => s.id === "end_" + e), e);
  assert.equal(countFound({ catBoss: 1, bogus: 1 }), 1);
});
await test("ending rules", () => {
  assert.equal(endingAllowed("monster", "choice"), true);
  assert.equal(endingAllowed("monster", "finalBoss"), false);
  assert.equal(endingAllowed("sigma", "finalBoss"), true);
  assert.equal(endingAllowed("world", "area1"), false);
  assert.deepEqual(endingButtons("winners"), ["winner", "remember", "startOver", "title"]);
});
await test("every line is short and every NPC answers in every state", () => {
  const strs = [];
  const walk = (v) => { if (typeof v === "string") strs.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") Object.values(v).forEach(walk); else if (typeof v === "function") walk(v("The Royal Guards", "Gold Sword", "Fool's Gold Sword", "A Royal Guard drops it.")); };
  walk(PROPS); walk(TIPS);
  const base = { name: "Abcdefghijklmnopqrstuvwx", level: 0, talks: 0, area2Need: 50, area2NeedText: "50", kingNeed: 100000, kingNeedText: "100,000", guardRec: 500, guardRecText: "Lv 500", signReads: 1 };
  for (const id of NPC_IDS) {
    for (const cycle of [0, 1]) for (const post of [false, true]) for (const talks of [0, 1, 2, 3]) for (const level of [0, 10, 100, 60000])
      for (const flags of [{}, { guardsBeaten: true, ratKingBeaten: true, kittens: true, catBeaten: true, rookieBeaten: true, locket: true, letter: true, kingBeaten: true }]) {
        const d = getDialogue(id, { ...base, ...flags, cycle, post, talks, level, signReads: talks + 1 });
        assert.ok(d && d.lines.length > 0, id);
        walk(d.lines);
      }
  }
  for (const s of strs) assert.ok(s.length <= 160, "too long: " + s);
  const nessa = getDialogue("nessa", { ...base, cycle: 0 });
  assert.equal(nessa.lines[nessa.lines.length - 1], "You will never beat Fydor.");
  const tobin = getDialogue("tobin", { ...base, cycle: 0 });
  assert.equal(tobin.lines[tobin.lines.length - 1], "You'll never beat Myles either.");
  const bram = getDialogue("bram", { ...base, name: "Kit", cycle: 1 });
  assert.ok(bram.lines[0].includes("Again. Again."));
  assert.equal(getDialogue("sign", { ...base, signReads: 5 }).lines[2], "please.");
});

// ------------------------------------------------------------------------------------------------ integration (mock ctx)
console.log("integration (mock ctx)");
function createBus() {
  const m = new Map();
  return {
    on(n, f) { if (!m.has(n)) m.set(n, []); m.get(n).push(f); return () => this.off(n, f); },
    off(n, f) { const a = m.get(n); if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } },
    emit(n, p) { log.push([n, p]); for (const f of (m.get(n) || []).slice()) { try { f(p); } catch (e) { console.warn("bus", n, e); } } }
  };
}
const log = [];
function defaultState() {
  return { v: 1, profile: { name: "", onlineName: "", secrets: {}, endings: {}, runs: 0, playMs: 0, signReads: 0, npcsTalked: {} },
    settings: { reduceFlashing: false, master: 0.8, music: 0.7, sfx: 0.9, sensitivity: 1, invertY: false, pointerLock: true, quality: "auto", showFps: false, hints: true },
    run: { cycle: 0, level: 0, phase: "intro", equip: { sword: "fists", armor: null, morph: null, crown: null, charm: null }, owned: {}, kills: {}, villagerNoWood: 0, flags: {}, buried: {}, deaths: 0, startedAt: 0, kingWins: 0 },
    choiceSnapshot: null, player: { hp: 100, maxHp: 100, alive: true, invuln: 0, lastHurt: 0, lives: 0 },
    world: { zone: "lobby", region: "main" }, ui: { screen: "title", modal: false },
    rt: { playing: false, paused: false, timeScale: 1, god: false, fast: 1, cinematic: false, idleLock: false } };
}
function mockCtx() {
  const state = defaultState();
  const systems = [], timers = [];
  let time = 0;
  const v3 = (x, y, z) => ({ x, y, z });
  const player = { position: v3(0, 0, 10), yaw: 0, anims: [],
    teleport(p, yaw) { this.position.x = p.x; this.position.y = p.y; this.position.z = p.z; if (yaw !== undefined) this.yaw = yaw; },
    play(a) { this.anims.push(a); } };
  const interact = new Map();
  const npcs = {};
  for (const id of ["bram", "nessa", "tobin", "ilsa", "pell", "odo", "wren", "fydorIdle", "mylesIdle", "sign"])
    npcs[id] = { id, pos: v3(1, 0, 1), root: { visible: true }, lookAt() {}, play() {}, setVisible(b) { this.root.visible = b; } };
  const graveNames = ["The Rat King", "The Villagers", "Fydor & Myles", "The Royal Guards", "The King", "Elsie"];
  const graves = graveNames.map((name, i) => ({ id: "grave" + i, name, pos: v3(25 + 2 * i, 0, -8), buried: false, setBuried(b) { this.buried = b; } }));
  const points = { spawn: v3(0, 0, 10), bridgeFar: v3(0, 0, 70), ratField: v3(0, 0, 100), voidLeap: v3(-38, 0, -4),
    graveShovel: v3(32, 0, -2), basement: v3(2, -3, -2), lobbyBack: v3(0, 0, -12), throneDoor: v3(0, 20, 481) };
  const owned = state.run.owned;
  const ctx = {
    THREE: null, bus: createBus(), state, scene: null, camera: null, renderer: null,
    engine: {
      player, time: 0,
      addSystem(name, fn, pri) { systems.push({ name, fn, pri }); return () => {}; },
      after(sec, fn) { timers.push({ t: time + sec, fn }); return () => {}; },
      physics: { groundAt() { return { y: -3, surface: "stone", id: 0 }; } }
    },
    world: {
      zones: { lobby: { spawn: { pos: v3(0, 0, 10), yaw: 0 } } },
      point(n) { return points[n] || null; }, waypoint(n) { return points[n] || null; },
      async goto(zone, o) { player.teleport(o.pos, o.yaw); },
      addInteractable(d) { interact.set(d.id, d); return () => interact.delete(d.id); },
      setInteractLabel(id, label) { const d = interact.get(id); if (d) d.label = label; },
      npc(id) { return npcs[id] || null; }, graves, prop() { return null; },
      portal(id) { return { pos: v3(9, 9, 9), active: true }; }, spawns() { return []; }
    },
    combat: {
      enemies: [], started: [],
      level: () => state.run.level, has: (id) => !!state.run.owned[id],
      give(id) { const first = !state.run.owned[id]; state.run.owned[id] = true; ctx.bus.emit("item:get", { id, first }); return first; },
      remove(id) { if (!state.run.owned[id]) return false; delete state.run.owned[id]; return true; },
      need(id) { const c = state.run.cycle ? 2 : 1; return ({ area2: 50, area3: 50000, kingPortal: 100000 })[id] * c; },
      rec(k) { const c = state.run.cycle ? 2 : 1; return ({ ratKing: 5, villager: 50, fydor: 500, royalGuard: 55000 })[k] * c; },
      startFight(id) { this.started.push(id); return true; }, fightActive: () => false
    },
    ui: {
      objective: null, toasts: [], dialogs: [], choiceQueue: [], confirmQueue: [], endingQueue: [], endings: [], titles: 0,
      setObjective(text, target) { this.objective = { text, target }; },
      toast(t) { this.toasts.push(t); }, subtitle() {}, openMenu(m) { this.menu = m; },
      async dialogue(d) { this.dialogs.push(d); return d.choices ? (this.choiceQueue.length ? this.choiceQueue.shift() : 1) : -1; },
      async confirm() { return this.confirmQueue.length ? this.confirmQueue.shift() : 0; },
      async ending(id) { this.endings.push(id); return this.endingQueue.length ? this.endingQueue.shift() : "title"; },
      showTitle() { this.titles++; }, fade: async () => {}
    },
    audio: { stinger() {}, sfx() {}, voice() {} },
    save: {
      writes: 0, write() { this.writes++; }, writeNow() { this.writes++; }, has: () => false,
      newGame(c) {
        const keep = state.run;
        state.run = defaultState().run; state.run.cycle = c; void keep;
      },
      snapshotChoice() { state.choiceSnapshot = JSON.parse(JSON.stringify(state.run)); },
      restoreChoice() { if (!state.choiceSnapshot) return false; state.run = JSON.parse(JSON.stringify(state.choiceSnapshot)); return true; }
    },
    events: { choices: 0, endingsPlayed: [], active: null,
      enterChoice() { this.choices++; }, async playEnding(id) { this.endingsPlayed.push(id); },
      trigger() {}, async startFinal() {} }
  };
  void owned;
  const tick = (dt) => {
    time += dt;
    for (const s of systems) s.fn(dt, time);
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].t <= time) { const t = timers.splice(i, 1)[0]; t.fn(); }
  };
  const run = async (sec) => { for (let t = 0; t < sec; t += 0.05) { tick(0.05); await flush(); } };
  return { ctx, interact, tick, run, player, graves, npcs };
}
const flush = () => new Promise((r) => setImmediate(r));

const M = mockCtx();
const { ctx } = M;
const story = await Story.init(ctx);
ctx.story = story;
const use = async (id) => { const d = M.interact.get(id); assert.ok(d, "no interactable " + id); assert.ok(d.enabled(), id + " disabled"); d.onUse(); await flush(); await flush(); await flush(); };

await test("ui:play starts a run, emits game:start and the first objective", async () => {
  ctx.state.profile.name = "Kit";
  ctx.bus.emit("ui:play", { newGame: true });
  await flush(); await flush();
  assert.equal(ctx.state.rt.playing, true);
  assert.ok(log.find((e) => e[0] === "game:start" && e[1].newGame === true && e[1].cycle === 0));
  assert.ok(log.find((e) => e[0] === "run:reset"));
  assert.equal(ctx.state.profile.runs, 1);
  await M.run(0.6);
  assert.equal(ctx.ui.objective.text, "Cross the bridge");
  assert.deepEqual(ctx.ui.objective.target, { x: 0, y: 0, z: 70 });
  const os = log.filter((e) => e[0] === "objective:set").pop();
  assert.equal(os[1].id, "bridge");
});
await test("crossing the bridge -> area1 + rats objective", async () => {
  M.player.position.z = 72;
  await M.run(0.6);
  assert.equal(ctx.state.run.phase, "area1");
  assert.equal(ctx.ui.objective.text, "Fight the small rats");
  ctx.state.run.kills.rat = 1; ctx.state.run.level = 3;
  ctx.bus.emit("level:gain", { amount: 1, total: 3, source: "rat" });
  await M.run(0.1);
  assert.equal(ctx.ui.objective.text, "Beat rats to level up (Lv 5 for the Rat King)");
  assert.ok(ctx.ui.toasts.some((t) => t.includes("Tobin")), "tobin tip");
});
await test("talking: legends, npcsTalked, allNpcs, shop, guards fight choice", async () => {
  await story.talk("nessa");
  const d = ctx.ui.dialogs.pop();
  assert.equal(d.speaker, "Nessa");
  assert.equal(d.lines[d.lines.length - 1], "You will never beat Fydor.");
  assert.ok(ctx.ui.dialogs.length === 0);
  for (const id of ["bram", "tobin", "ilsa", "pell", "odo", "wren"]) await story.talk(id);
  assert.equal(ctx.ui.menu, "shop");
  assert.ok(!ctx.state.profile.secrets.allNpcs);
  ctx.ui.choiceQueue.push(0);
  await story.talk("fydor");
  assert.ok(ctx.state.profile.secrets.allNpcs, "allNpcs");
  assert.deepEqual(ctx.combat.started, ["guards"]);
  assert.ok(ctx.ui.dialogs.find((x) => x.speaker === "Old Bram").lines[0].includes("Morning, Kit."));
});
await test("sign x5 -> Please secret; interactable path", async () => {
  for (let i = 0; i < 5; i++) await use("story.npc.sign");
  assert.ok(ctx.state.profile.secrets.normalSign);
  assert.ok(log.find((e) => e[0] === "secret:found" && e[1].id === "normalSign" && e[1].total === 26));
});
await test("zone phases + waterfall/rookie secret + standing spot", async () => {
  ctx.bus.emit("zone:enter", { id: "village", prev: "gate2" });
  assert.equal(ctx.state.run.phase, "area2");
  ctx.bus.emit("zone:enter", { id: "rookieShack", prev: "waterfall" });
  assert.ok(ctx.state.profile.secrets.waterfall);
  M.player.teleport({ x: -1.5, y: -0.8, z: 60 });
  await M.run(0.8);
  assert.ok(ctx.state.profile.secrets.underBridge, "underBridge");
  M.player.teleport({ x: -37, y: 0, z: -4 });
  await M.run(10);
  assert.ok(!ctx.state.profile.secrets.voidWhisper);
  await M.run(21);
  assert.ok(ctx.state.profile.secrets.voidWhisper, "voidWhisper after 30 s");
});
await test("illegal phase moves are ignored, endings blocked outside choice", async () => {
  assert.equal(story.setPhase("intro"), false);
  assert.equal(ctx.state.run.phase, "area2");
  assert.equal(await story.reachEnding("monster"), false);
  assert.equal(M.interact.get("story.void").enabled(), false);
});
await test("warrior ending: shovel + 6 graves, then Remember the choice", async () => {
  story.setPhase("choice", { force: true });
  for (const id of ["cheese_sword", "bad_wooden_sword", "iron_sword", "gold_sword", "kings_staff", "girls_ribbon"]) ctx.state.run.owned[id] = true;
  ctx.save.snapshotChoice();
  ctx.ui.toasts.length = 0;
  await use("story.grave0");
  assert.ok(ctx.ui.toasts.pop().includes("shovel"));
  await use("story.shovel");
  assert.ok(ctx.state.run.owned.shovel);
  assert.equal(M.interact.get("story.grave3").label, "Bury: The Royal Guards");
  for (let i = 0; i < 6; i++) await use("story.grave" + i);
  assert.ok(M.graves.every((g) => g.buried));
  assert.ok(!ctx.state.run.owned.kings_staff && !ctx.state.run.owned.bad_wooden_sword);
  ctx.ui.endingQueue.push("remember");
  await M.run(2);
  await flush(); await flush(); await flush();
  assert.deepEqual(ctx.ui.endings, ["warrior"]);
  assert.ok(ctx.state.profile.secrets.end_warrior);
  assert.equal(ctx.state.profile.endings.warrior, 1);
  assert.equal(ctx.state.run.phase, "choice", "remembered");
  assert.equal(ctx.events.choices, 1);
  assert.ok(ctx.state.run.owned.kings_staff, "snapshot restored the staff");
  assert.ok(M.graves.every((g) => !g.buried), "graves un-buried");
});
await test("world ending: void leap needs choice + Let go", async () => {
  ctx.ui.confirmQueue.push(0);
  await use("story.void");
  assert.equal(ctx.ui.endings.length, 1, "Stay keeps playing");
  ctx.ui.confirmQueue.push(1);
  ctx.ui.endingQueue.push("title");
  await use("story.void");
  await flush(); await flush();
  assert.deepEqual(ctx.ui.endings, ["warrior", "world"]);
  assert.ok(ctx.state.profile.secrets.end_world);
  assert.equal(ctx.state.run.phase, "ended");
  assert.equal(ctx.state.rt.playing, false);
  assert.equal(ctx.ui.titles, 1);
});
await test("CONTINUE from ended resumes at the choice", async () => {
  ctx.save.has = () => true;
  ctx.bus.emit("ui:play", { newGame: false });
  await flush(); await flush(); await flush();
  assert.equal(ctx.state.run.phase, "choice");
  assert.equal(ctx.events.choices, 2);
  assert.equal(ctx.state.rt.playing, true);
});
await test("winners -> Winner button -> finalBoss phase; sigma from finalBoss", async () => {
  ctx.ui.endingQueue.push("winner");
  await story.reachEnding("winners");
  assert.equal(ctx.state.run.phase, "finalBoss");
  ctx.ui.endingQueue.push("title");
  await story.reachEnding("sigma");
  assert.ok(ctx.state.profile.secrets.end_sigma);
});
await test("startCycle(1): NG+ secret, cycle-1 objective and corrupted lines", async () => {
  await story.startCycle(1);
  assert.equal(ctx.state.run.cycle, 1);
  assert.equal(ctx.state.run.phase, "ng");
  assert.ok(ctx.state.profile.secrets.ngplus);
  await M.run(0.6);
  assert.equal(ctx.ui.objective.text, "Cross the bridge. Again.");
  await story.talk("bram");
  assert.ok(ctx.ui.dialogs.pop().lines[0].includes("Again. Again."));
  assert.equal(story.secretCount().total, 26);
  assert.ok(story.secrets.length === 26 && story.secrets.filter((s) => s.found).length === story.secretCount().count);
});
await test("forced objectives (EVENTS) override and release", async () => {
  story.objective("run");
  assert.equal(ctx.ui.objective.text, "RUN");
  story.objective({ text: "Hold on", target: { x: 1, y: 2, z: 3 } });
  assert.equal(ctx.ui.objective.text, "Hold on");
  story.objective(null);
  assert.equal(ctx.ui.objective.text, "Cross the bridge. Again.");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
