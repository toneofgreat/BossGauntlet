// items.js - COMBAT item catalog (DESIGN 4.2 / 4.7, CONTRACT 8.2). Pure data + helpers, no DOM, no THREE.

export const SLOTS = ["sword", "armor", "morph", "crown", "charm"];

// base (cycle 0) definitions. mult = level multiplier while equipped.
const BASE = [
  { id: "fists", name: "Fists", slot: "sword", mult: 1, dmg: 10, cd: 0.40, reach: 1.9, arc: 70, kind: "punch",
    desc: "The punch ability. Ten damage, honest work." },
  { id: "smelly_sword", name: "Smelly Sword", slot: "sword", mult: 2, dmg: 14, cd: 0.50, reach: 2.6, arc: 100, stink: true,
    desc: "Smells like the rat it came from. Hits leave a 3 s stink." },
  { id: "cheese_sword", name: "Cheese Sword", slot: "sword", mult: 3, dmg: 18, cd: 0.50, reach: 2.7, arc: 100, crumbs: true,
    desc: "Aged forty years in a rat king's cellar. Crumbly." },
  { id: "wooden_sword", name: "Wooden Sword", slot: "sword", mult: 4, dmg: 22, cd: 0.50, reach: 2.8, arc: 100,
    desc: "A villager's practice blade. Surprisingly sharp." },
  { id: "iron_sword", name: "Iron Sword", slot: "sword", mult: 8, dmg: 30, cd: 0.55, reach: 3.0, arc: 100,
    desc: "Guard issue. They only had one spare." },
  { id: "gold_sword", name: "Gold Sword", slot: "sword", mult: 20, dmg: 42, cd: 0.55, reach: 3.1, arc: 100,
    desc: "Royal guard steel, gilded. Heavy and bright." },
  { id: "kings_staff", name: "King's Staff", slot: "sword", mult: 40, dmg: 55, cd: 0.60, reach: 3.0, arc: 100,
    bolt: { dmg: 40, range: 25, speed: 34 }, glow: true,
    desc: "The first King's staff. Hold attack to fire a bolt (25 m)." },
  { id: "cat_claws", name: "Cat Claws", slot: "sword", mult: 8, dmg: 12, cd: 0.25, reach: 2.0, arc: 90, kind: "claw",
    desc: "Big Tom's spare claws. Very fast swipes." },
  { id: "smelly_armor", name: "Smelly Armor", slot: "armor", mult: 1.5, hp: 20, dr: 0.10,
    look: { color: "#6f6a3c", metalness: 0.0, roughness: 0.95, plates: false }, desc: "Rat-hide vest. +20 HP, 10% damage reduction." },
  { id: "cheese_armor", name: "Cheese Armor", slot: "armor", mult: 3, hp: 50, dr: 0.20,
    look: { color: "#e2b440", metalness: 0.0, roughness: 0.7, plates: true }, desc: "Hard cheese rind plates. +50 HP, 20% DR." },
  { id: "iron_armor", name: "Iron Armor", slot: "armor", mult: 6, hp: 100, dr: 0.35,
    look: { color: "#7e848c", metalness: 0.9, roughness: 0.4, plates: true }, desc: "Proper plate. +100 HP, 35% DR." },
  { id: "golden_armor", name: "Golden Armor", slot: "armor", mult: 12, hp: 200, dr: 0.50,
    look: { color: "#b8862c", metalness: 1.0, roughness: 0.34, plates: true }, desc: "Fit for a king's champion. +200 HP, 50% DR." },
  { id: "villager_morph", name: "Villager Morph", slot: "morph", mult: 2, morph: "villager",
    desc: "Look like a villager. They might hesitate." },
  { id: "kings_crown", name: "King's Crown", slot: "crown", mult: 2, hp: 50, glow: true,
    desc: "One million levels of heavy. +50 HP, golden glow." },
  { id: "rookie_badge", name: "Rookie Badge", slot: "charm", mult: 1.1, desc: "\"Participant\". Rookie made it himself." },
  { id: "toms_bell", name: "Tom's Bell", slot: "charm", mult: 1.25, bell: true, desc: "Jingles when you walk. Big Tom's old collar bell." },
  { id: "girls_ribbon", name: "Elsie's Ribbon", slot: "key", mult: 1, desc: "A small red ribbon. It still smells of the sea, somehow." },
  { id: "fydors_locket", name: "Fydor's Locket", slot: "key", mult: 1, desc: "Three children in a tiny painting." },
  { id: "mylesletter", name: "Myles's Letter", slot: "key", mult: 1, desc: "A letter Myles never sent." },
  { id: "shovel", name: "Shovel", slot: "key", mult: 1, desc: "For burying things properly." },
];

// cycle-1 horrible variants: same combat numbers, x1.5 multiplier, funny downside
const BAD = {
  smelly_sword: { name: "Rotten Sock Sword", downside: "flies", desc: "A sock on a stick. Flies love it." },
  cheese_sword: { name: "Moldy Cheese Sword", downside: "mold", desc: "Green, fuzzy, and somehow stronger." },
  wooden_sword: { name: "Termite Plank", downside: "termites", desc: "More holes than wood. Crunches when it hits." },
  iron_sword: { name: "Rust Stick", downside: "rust", desc: "It was a sword once. Now it is mostly orange." },
  gold_sword: { name: "Fool's Gold Sword", downside: "flaking", desc: "Gold paint on a broom handle. Flakes everywhere." },
  kings_staff: { name: "Bent Twig Staff", downside: "crooked", desc: "A bent twig. Bolts come out a bit crooked." },
  cat_claws: { name: "Hairball Claws", downside: "hairball", desc: "Damp. Do not ask." },
  smelly_armor: { name: "Wet Cardboard Armor", downside: "soggy", desc: "Squelches. Still somehow protective." },
  cheese_armor: { name: "Sour Milk Armor", downside: "sour", desc: "Drips. Everyone can smell you coming." },
  iron_armor: { name: "Rusty Bucket Armor", downside: "bucket", desc: "Buckets, strapped together with hope." },
  golden_armor: { name: "Gold-Painted Bin Lid", downside: "clang", desc: "Clangs on every single step." },
  villager_morph: { name: "Scarecrow Morph", downside: "straw", desc: "Straw everywhere. Crows follow you." },
  kings_crown: { name: "Paper Crown", downside: "windy", desc: "Blows off in the wind once a minute. Floats back." },
};
const BAD_LOOK = {
  smelly_armor: { color: "#8a7350", metalness: 0, roughness: 1, plates: false },
  cheese_armor: { color: "#e9e6d6", metalness: 0, roughness: 0.6, plates: false },
  iron_armor: { color: "#7a4a2a", metalness: 0.6, roughness: 0.8, plates: true },
  golden_armor: { color: "#b8922e", metalness: 0.7, roughness: 0.55, plates: true },
};

export const BAD_MULT = 1.5;

function build() {
  const cat = {};
  for (const b of BASE) {
    cat[b.id] = Object.assign({ hp: 0, dr: 0, dmg: 0, cd: 0, reach: 0, arc: 100, bad: false, base: b.id }, b);
  }
  for (const id of Object.keys(BAD)) {
    const b = cat[id];
    const v = BAD[id];
    const d = Object.assign({}, b, {
      id: "bad_" + id, name: v.name, desc: v.desc, bad: true, base: id, downside: v.downside,
      mult: Math.round(b.mult * BAD_MULT * 1000) / 1000,
    });
    if (b.look) d.look = BAD_LOOK[id] || b.look;
    if (id === "villager_morph") d.morph = "scarecrow";
    if (id === "kings_crown") d.glow = false;
    cat[d.id] = d;
  }
  return cat;
}

export const CATALOG = build();

export function item(id) { return CATALOG[id] || null; }

// the id a base item takes in a given cycle (cycle >= 1 -> bad_ variant when one exists)
export function variant(baseId, cycle) {
  if (cycle >= 1 && CATALOG["bad_" + baseId]) return "bad_" + baseId;
  return baseId;
}

export function baseOf(id) { const d = CATALOG[id]; return d ? d.base : id; }

// do we own either variant of a base id?
export function ownsAny(owned, baseId) {
  return !!(owned && (owned[baseId] || owned["bad_" + baseId]));
}

// MULT = product of equipped multipliers
export function computeMult(equip) {
  let m = 1;
  if (!equip) return m;
  for (let i = 0; i < SLOTS.length; i++) {
    const id = equip[SLOTS[i]];
    if (!id) continue;
    const d = CATALOG[id];
    if (d) m *= d.mult;
  }
  return m;
}

export function equippedDefs(equip) {
  const out = [];
  if (!equip) return out;
  for (const s of SLOTS) { const d = equip[s] && CATALOG[equip[s]]; if (d) out.push(d); }
  return out;
}

export function maxHpFor(equip) {
  let hp = 100;
  for (const d of equippedDefs(equip)) hp += d.hp || 0;
  return hp;
}

export function drFor(equip) {
  const a = equip && equip.armor && CATALOG[equip.armor];
  return a ? a.dr || 0 : 0;
}

// rank for "best owned item of a slot": mult first, then damage
function rank(d) { return d.mult * 1000 + (d.dmg || 0) + (d.hp || 0) * 0.01; }

export function bestOwned(owned, slot) {
  let best = null;
  for (const id in owned) {
    if (!owned[id]) continue;
    const d = CATALOG[id];
    if (!d || d.slot !== slot) continue;
    if (!best || rank(d) > rank(best)) best = d;
  }
  if (!best && slot === "sword") return CATALOG.fists;
  return best;
}

// should a newly obtained item replace what is equipped in its slot?
export function isUpgrade(newId, equip) {
  const d = CATALOG[newId];
  if (!d || d.slot === "key") return false;
  const cur = equip && equip[d.slot] ? CATALOG[equip[d.slot]] : null;
  if (!cur) return true;
  return rank(d) > rank(cur);
}

export function fmtMult(m) {
  if (m >= 100) return "x" + Math.round(m).toLocaleString("en-US");
  if (Math.abs(m - Math.round(m)) < 1e-6) return "x" + Math.round(m);
  return "x" + (Math.round(m * 100) / 100);
}
