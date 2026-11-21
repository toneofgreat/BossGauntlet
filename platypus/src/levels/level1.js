// level1.js - LEVEL 1, the cushion-world tutorial, as a level module. The script itself is ../game.js.
import { createCushionField } from "../cushions.js";
import { createHuman } from "../actors.js";
import { createGame } from "../game.js";
import { getWizard, getDummy } from "./common.js";

export const meta = { n: 1, title: "TUTORIAL" };

export function createLevel(ctx) {
  const { THREE, renderer, platypus, player, cam, fx, audio, ui, cinema } = ctx;
  const root = new THREE.Group();
  root.name = "level1";
  const colliders = [];
  let cushions, wizard, dummies, human, game, world;

  function build() {
    cushions = createCushionField(THREE, { renderer });
    cushions.fadeColor.set(0xffffff);
    cushions.material.color.set(0xffffff);
    wizard = getWizard(ctx);
    dummies = [getDummy(ctx, 0), getDummy(ctx, 1), getDummy(ctx, 2), getDummy(ctx, 3)];
    human = createHuman(THREE);
    root.add(cushions.group, human.group);
    game = createGame({ THREE, cushions, platypus, wizard, fx, audio, ui, player, dummies, human, colliders, onComplete: () => ctx.complete() });
    world = {
      name: "cushions",
      group: root,
      colliders,
      ownsWater: true, // the script decides when the platypus counts as wading
      heightAt: cushions.heightAt,
      waterAt: game.waterLevelAt,
      update(dt, time, fx0, fz0) { cushions.update(dt, fx0, fz0); },
      onFootstep(wx, wz, strength, i, wet, pan) {
        cushions.press(wx, wz, 0.32 + 0.4 * strength);
        audio.cushionStep(wet ? strength * 0.6 : strength, pan);
        if (wet) fx.rippleAt(wx, wz, 0.5 + strength * 0.5);
        else if (i < 2 || strength > 0.7) fx.cushionPuff(wx, cushions.heightAt(wx, wz) + 0.02, wz, strength * 0.55);
      },
      onJump(x, z, h) {
        cushions.press(x, z, 1.3);
        fx.cushionPuff(x, h + 0.03, z, 1.0);
      },
      onLand(x, z, h, impact, wet) {
        audio.cushionLand(impact);
        cushions.press(x, z, 0.8 + 1.15 * impact);
        if (wet) fx.rippleAt(x, z, 2.5);
        fx.cushionPuff(x, h + 0.03, z, 0.8 + 1.6 * impact);
      },
      // compile the water shader too, behind the black cover
      warm() {
        const w = fx.createWater(0, 0, 2, 1, 0, { surfaceY: -5 });
        return () => w.dispose();
      },
    };
    // handles the art / close-up tools expect
    Object.assign(ctx.debug, { game, cushions, wizard, human, dummies });
  }

  function enter() {
    // shared actors live under whichever level is using them
    root.add(wizard.group);
    for (const d of dummies) root.add(d.group);
    game.reset();
    ctx.setWorld(world);
    ctx.setSpeaker(wizard.group, 2.12);
    ui.setAbilities({ sting: true, zap: true });
    ui.setHearts(5, 5);
    player.teleport(0, 0, 0);
  }

  // black -> TUTORIAL -> white -> the white clears to reveal the world
  function start() {
    ui.setBlack(true, true);
    cinema.fade("clear", 0);
    ui.playIntro({
      onBlack() { audio.introBoom(); },
      onRise(d) { audio.introRise(d); },
      onReveal() {
        player.teleport(0, 0, 0);
        cam.dist = 8.5; cam.pitch = 0.42;
        audio.startAmbience();
      },
      onDone() {
        player.enabled = true;
        game.start();
      },
    });
  }

  function update(dt, time) {
    game.update(dt, time);
    wizard.update(dt, time);
    player.flicker = game.step === "fight";
  }

  function exit() {
    game.reset();
    audio.stopAmbience();
  }

  function onAction(name) {
    if (name === "primary") game.trySting();
    else if (name === "secondary") game.tryZap();
    return false;
  }

  return {
    build, enter, start, update, exit, onAction,
    onJump() { game.onJump(); },
    onLand() { game.onLand(); },
    state() { return game.state(); },
    skipTo(name) { return game.skipTo(name); },
    win() { game.win(); },
    get STEPS() { return game.STEPS; },
  };
}
