// integrate.mjs - INTEGRATE's headless checks: Return home, the fiber retune, and save/load of a finished house.
import { goHome, HOME_HUNGER, respawnPoint } from "../../src/bonus/house/index.js";
import { setLevel } from "../../src/bonus/house/index.js";
import { createGame, makeSave } from "../../src/bonus/core/game.js";
import { OBJECT_DEFS } from "../../src/bonus/data/tiles.js";
import { invCount } from "../../src/bonus/craft/inventory.js";
import * as W from "../../src/bonus/world/index.js";

export default async function (t) {
  t.test("Return home: teleports to the door for a little hunger", () => {
    const G = t.game(1234), p = G.player;
    setLevel(G, 3);
    t.standAt(G, G.world.spawn.x - 120);
    p.hunger = 60;
    let ev = 0; G.bus.on("player:home", () => ev++);
    t.ok(goHome(G), "goHome ok");
    const sp = respawnPoint(G);
    t.eq(p.x, sp.x, "x at the door"); t.eq(p.y, sp.y, "y at the door");
    t.eq(p.hunger, 60 - HOME_HUNGER, "costs hunger");
    t.eq(ev, 1, "player:home emitted");
    t.standAt(G, G.world.spawn.x - 60); p.hunger = 5; goHome(G);
    t.eq(p.hunger, 5, "never drops low hunger further");
    t.run(G, 60);
    t.ok(p.grounded && !p.dead, "lands safely at home");
  });
  t.test("Return home: refused while a wolf is hunting the cube, and while fainted", () => {
    const G = t.game(77), p = G.player;
    t.standAt(G, G.world.spawn.x - 40);
    const tx = Math.floor((p.x + 13) / t.T);
    const before = p.x;
    G.animals.push({ id: G.nextId++, kind: "wolf", x: (tx + 2) * t.T, y: p.y, w: 30, h: 22, vx: 0, vy: 0, hp: 26, maxHp: 26, state: "lunge", aggroT: 100 });
    t.ok(!goHome(G), "refused with a lunging wolf nearby");
    t.eq(p.x, before, "did not move");
    G.animals.length = 0;
    p.dead = true;
    t.ok(!goHome(G), "refused while fainted");
  });
  t.test("tall grass gives 2 fiber (lean-to reachable from the grass near spawn)", () => {
    t.eq(OBJECT_DEFS.tallgrass.drop[1], 2, "fiber per tall grass");
    const G = t.game(1234);
    const g = G.world.objects.find((o) => o.kind === "tallgrass" && Math.abs(o.x - G.world.spawn.x) < 20);
    t.ok(!!g, "tall grass near spawn");
    t.standAt(G, g.x + 1);
    W.breakObject(G, g); t.run(G, 120);
    t.ok(invCount(G.inv, "fiber") >= 2, "picked up 2 fiber (" + invCount(G.inv, "fiber") + ")");
  });
  t.test("a level-20 world saves small and loads back", () => {
    const G = t.game(4321);
    setLevel(G, 20);
    t.run(G, 120);
    const s = JSON.parse(JSON.stringify(makeSave(G)));
    t.ok(JSON.stringify(s).length < 200 * 1024, "save < 200 KB");
    const G2 = createGame({ save: s, headless: true });
    t.eq(G2.house.level, 20, "house level restored");
    t.eq(G2.player.maxHp, G.player.maxHp, "max hp restored with the perks");
  });
}
