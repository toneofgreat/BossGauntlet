// harness.js - UI dev harness: a mock ctx (real THREE, bus, state) with fake engine/combat/story/audio/save so the
// UI can be driven alone in a browser. Open /totally-normal-rpg/src/ui/tests/harness.html via any static server.
import * as THREE from "../../engine/three.js";
import { createBus } from "../../engine/bus.js";
import { createState } from "../../engine/state.js";
import * as UI from "../index.js";

const bus = createBus(), state = createState();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(0, 2.6, 5.5); camera.lookAt(0, 1.4, 10);
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
const systems = [];
const player = { position: new THREE.Vector3(0, 0, 10), yaw: 0, setNameTag(t) { log.push("nametag:" + t); } };
const log = [];
const engine = {
  addSystem(name, fn, pr) { systems.push(fn); return () => {}; },
  player, input: { mode: matchMedia("(pointer: coarse)").matches ? "touch" : "keys" },
  touch: { setVisible(v) { log.push("touch:" + v); }, setInteract(l) { log.push("interact:" + l); } },
  quality: { level: 2, applySetting(v) { log.push("quality:" + v); } }
};
let last = performance.now();
function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert(); for (const f of systems) f(dt, now / 1000); requestAnimationFrame(loop); }
requestAnimationFrame(loop);

const owned = { fists: true };
const items = {
  fists: { id: "fists", name: "Fists", slot: "sword", mult: 1, dmg: 10, desc: "The punch ability." },
  smelly_sword: { id: "smelly_sword", name: "Smelly Sword", slot: "sword", mult: 2, dmg: 14, desc: "Stinks. Hits apply a 3 s stink." },
  iron_sword: { id: "iron_sword", name: "Iron Sword", slot: "sword", mult: 8, dmg: 30, desc: "Fydor's spare." },
  bad_iron_sword: { id: "bad_iron_sword", name: "Rust Stick", slot: "sword", mult: 12, dmg: 30, desc: "Leaves orange on your hands." },
  kings_staff: { id: "kings_staff", name: "King's Staff", slot: "sword", mult: 40, dmg: 55, desc: "Heavy attack fires a bolt." },
  cheese_armor: { id: "cheese_armor", name: "Cheese Armor", slot: "armor", mult: 3, hp: 50, dr: 0.2, desc: "Smells of victory." },
  golden_armor: { id: "golden_armor", name: "Golden Armor", slot: "armor", mult: 12, hp: 200, dr: 0.5, desc: "Shiny." },
  villager_morph: { id: "villager_morph", name: "Villager Morph", slot: "morph", mult: 2, desc: "...brother?" },
  kings_crown: { id: "kings_crown", name: "King's Crown", slot: "crown", mult: 2, hp: 50, desc: "Heavy is the head." },
  toms_bell: { id: "toms_bell", name: "Tom's Bell", slot: "charm", mult: 1.25, desc: "Jingles." },
  girls_ribbon: { id: "girls_ribbon", name: "Elsie's Ribbon", slot: "key", mult: 1, desc: "A red ribbon." },
  shovel: { id: "shovel", name: "Shovel", slot: "key", mult: 1, desc: "For graves." }
};
const shopState = { villager_morph: false, iron_armor: false, golden_armor: false };
const enemies = [{ id: "e1", kind: "rat", pos: new THREE.Vector3(1.5, 0, 12) }];
const combat = {
  items, enemies,
  level: () => state.run.level, mult: () => { let m = 1; for (const s in state.run.equip) { const id = state.run.equip[s]; if (id && items[id]) m *= items[id].mult; } return m; },
  inventory: () => Object.values(items).map((d) => ({ id: d.id, name: d.name, slot: d.slot, owned: !!owned[d.id], equipped: state.run.equip[d.slot] === d.id, mult: d.mult, desc: d.desc })),
  equip(id) { const d = items[id]; if (!d) return; state.run.equip[d.slot] = id; bus.emit("item:equip", { slot: d.slot, id }); },
  unequip(slot) { state.run.equip[slot] = slot === "sword" ? "fists" : null; bus.emit("item:equip", { slot, id: state.run.equip[slot] }); },
  weapon: () => items[state.run.equip.sword] || items.fists,
  give(id) { const first = !owned[id]; owned[id] = true; state.run.owned[id] = true; bus.emit("item:get", { id, first }); if (items[id] && items[id].slot !== "key") combat.equip(id); return first; },
  shop: () => [
    { id: "villager_morph", name: "Villager Morph", need: 200 }, { id: "iron_armor", name: "Iron Armor", need: 1000 },
    { id: "area3", name: "Castle Pass", need: 50000 }, { id: "golden_armor", name: "Golden Armor", need: 250000 }
  ].map((r) => ({ ...r, state: shopState[r.id] || (r.id === "area3" && state.run.level >= r.need) ? "claimed" : state.run.level >= r.need ? "claimable" : "locked" })),
  claim(id) { shopState[id] = true; if (items[id]) combat.give(id); return { ok: true }; },
  addLevels(n) { state.run.level += n; bus.emit("level:gain", { amount: n, total: state.run.level, source: "rat" }); return n; }
};
const SECRETS = ["catBoss", "rookieBoss", "kittens", "underBridge", "waterfall", "goldenRat", "basement", "normalSign", "allNpcs", "fydorLocket", "mylesLetter", "portrait", "throneSeat", "kingFlawless", "crown", "cactusFlower", "totem", "voidWhisper", "ngplus", "girlRibbon", "end_monster", "end_world", "end_warrior", "end_idiot", "end_winners", "end_sigma"];
const story = {
  secretCount: () => ({ count: Object.keys(state.profile.secrets).length, total: 26 }),
  get secrets() { return SECRETS.map((id) => ({ id, name: id.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase()), hint: "A vague hint about " + id + ".", found: !!state.profile.secrets[id] })); },
  secret(id) { if (state.profile.secrets[id]) return false; state.profile.secrets[id] = Date.now(); const c = story.secretCount(); bus.emit("secret:found", { id, name: id, count: c.count, total: 26 }); return true; }
};
const audioLog = [];
const audio = new Proxy({ tracks: ["title", "title_ng", "redTitle"] }, { get(t, k) { if (k in t) return t[k]; return (...a) => { audioLog.push(String(k) + ":" + JSON.stringify(a[0] === undefined ? null : a[0])); return null; }; } });
let saved = false;
const save = { has: () => saved, write() { log.push("save"); } };
const ctx = { THREE, bus, state, scene: null, camera, renderer: null, engine, save, audio, ui: null, world: null, combat, story, events: null };
window.__tnrpg = { ctx };
bus.on("ui:play", (p) => { log.push("ui:play:" + p.newGame); setTimeout(() => { state.rt.playing = true; saved = true; bus.emit("game:start", { newGame: p.newGame, cycle: state.run.cycle }); }, 200); });
ctx.ui = await UI.init(ctx);
window.__h = { ctx, log, audioLog, owned, enemies, player, camera, THREE, setSaved(v) { saved = v; } };
window.__hReady = true;
