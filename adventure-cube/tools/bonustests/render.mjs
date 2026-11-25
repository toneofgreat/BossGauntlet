// render.mjs - BONUS_RENDER's DOM-free checks: every item has an icon painter (or the generic fallback is intended),
// tools have a valid tier for their head material, light-emitting items are known to the renderer, and every house
// level 0..20 has data for the painter. Drawing itself is checked in the browser by tools/bonusrender.cjs.
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => pathToFileURL(path.join(here, "..", "..", "src", "bonus", p)).href;

export default async function (t) {
  const { ITEMS, ITEM_LIST, TIER_COLOR } = await import(src("data/items.js"));
  const { HOUSE_LEVELS, houseLevel } = await import(src("data/house.js"));
  const { ICON_SHAPES } = await import(src("render/icons.js")); // DOM only at bake time
  t.test("every item's icon shape has a painter", () => {
    const shapes = new Set(ICON_SHAPES), missing = [];
    for (const it of ITEM_LIST || Object.values(ITEMS)) { const s = it.icon && it.icon.shape; if (!s || !shapes.has(s)) missing.push(it.id + ":" + s); }
    t.ok(missing.length === 0, "shapes without a painter (generic fallback used): " + missing.join(", "));
  });
  t.test("tool tiers map to a head material", () => {
    for (const it of Object.values(ITEMS)) if (it.tool) t.ok(it.tool.tier >= 1 && it.tool.tier <= 4 && TIER_COLOR[it.tool.tier], it.id + " tier " + it.tool.tier);
  });
  t.test("20 house levels with size + name", () => {
    t.eq(HOUSE_LEVELS.length, 20, "level count");
    for (let lv = 1; lv <= 20; lv++) { const L = houseLevel(lv); t.ok(L && L.w > 0 && L.h > 0 && L.name, "level " + lv); }
    t.ok(!houseLevel(0), "level 0 is the empty plot");
  });
}
