// player/index.js - wires input, touch, the character controller and the follow camera into the engine.
// Called by engine/index.js during Engine.init (the player is part of ctx.engine: engine.input / touch / player / camera3p).

import { createInput } from "./input.js";
import { createTouch } from "./touch.js";
import { createController } from "./controller.js";
import { createCamera3p } from "./camera.js";

export function initPlayer(ctx, engine) {
  const input = createInput(ctx, engine);
  engine.input = input;
  const touch = createTouch(ctx, engine, input);
  engine.touch = touch;
  const player = createController(ctx, engine);
  engine.player = player;
  const camera3p = createCamera3p(ctx, engine);
  engine.camera3p = camera3p;

  // input latch happens once per frame before any system (loop.onFrameStart)
  const prevStart = engine.loop.onFrameStart;
  engine.loop.onFrameStart = (rdt) => {
    if (prevStart) prevStart(rdt);
    input.frameLatch();
    engine.physics.nextFrame();
  };
  engine.addSystem("input", () => {}, 0);
  engine.addSystem("player", (dt) => {
    try { player.update(dt); } catch (e) { console.warn("[player]", e); }
  }, 40);
  engine.addSystem("camera", (dt, t) => {
    try { camera3p.update(dt, t); } catch (e) { console.warn("[camera]", e); }
  }, 60);

  ctx.bus.on("run:reset", () => {
    try {
      player.speedMul = 1; player.jumpMul = 1; player.gravityMul = 1;
      player.setControl(true); player.setLook(true);
      input.setEnabled(true);
      input.invert(0);
      player.setMorph("human");
      player.setArmorLook(null);
      player.avatar.setVisible(true);
      player.avatar.play("idle");
    } catch (e) { console.warn("[player]", e); }
  });
  ctx.bus.on("game:start", () => {
    try { player.setControl(true); player.setLook(true); touch.setVisible(ctx.state.ui.screen === "game"); } catch (e) { console.warn("[player]", e); }
  });
  return { input, touch, player, camera3p };
}
