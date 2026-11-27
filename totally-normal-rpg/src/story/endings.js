// endings.js - the ending state machine (CONTRACT 9.2, DESIGN 9.4 / 9.6).
// Pure data + endingAllowed() are node-testable; createEndings(ctx, story) is the runtime.

export const ENDING_IDS = Object.freeze(["monster", "world", "warrior", "idiot", "winners", "sigma"]);

export const ENDINGS = Object.freeze({
  monster: { title: "MONSTER ENDING", text: "You took the sword. The sword took you. Something always has to be the monster.", sting: "end_monster" },
  world:   { title: "WORLD ENDING", text: "You stepped into the white so that no one would ever hold it. The world let go with you, gently.", sting: "end_world" },
  warrior: { title: "WARRIOR ENDING", text: "You buried their swords, their staff, her ribbon. Warriors don't keep trophies. The black sword rusts alone.", sting: "end_warrior" },
  idiot:   { title: "IDIOT ENDING", text: "You waited ten minutes for the end of the world, and then you lost to it. Idiot.", sting: "end_idiot" },
  winners: { title: "WINNERS ENDING", text: "You beat the end of the world. Probably.", sting: "end_winners" },
  sigma:   { title: "SIGMA ENDING", text: "Twice. Without dying. The Hollow will tell its children about you.", sting: "end_sigma" }
});

const FINAL_OUTCOMES = { idiot: 1, winners: 1, sigma: 1 };

/** may ending `id` be reached from `phase`? */
export function endingAllowed(id, phase) {
  if (!ENDINGS[id]) return false;
  if (phase === "choice") return true;
  if (phase === "finalBoss") return !!FINAL_OUTCOMES[id];
  return false;
}

/** ending-card buttons */
export function endingButtons(id) {
  return id === "winners" ? ["winner", "remember", "startOver", "title"] : ["remember", "startOver", "title"];
}

export function createEndings(ctx, story) {
  let busy = null;   // id of the ending in progress

  async function reach(id, opts) {
    opts = opts || {};
    if (!ENDINGS[id]) { console.warn("[story] unknown ending", id); return false; }
    if (busy) { console.warn("[story] ending already running", busy); return false; }
    const s = ctx.state;
    if (!opts.force && !endingAllowed(id, s.run.phase)) {
      console.warn("[story] ending", id, "not reachable in phase", s.run.phase);
      return false;
    }
    busy = id;
    let button = "title";
    try {
      s.rt.cinematic = true;
      story.objective({ id: null, text: null, target: null });
      story.secret("end_" + id);
      const e = s.profile.endings || (s.profile.endings = {});
      e[id] = (e[id] | 0) + 1;
      story.setPhase("ended");
      ctx.bus.emit("ending", { id });
      try { ctx.save && ctx.save.writeNow && ctx.save.writeNow(); } catch (err) { console.warn("[story]", err); }
      const ev = ctx.events;
      if (ev && ev.playEnding) {
        try { await ev.playEnding(id); } catch (err) { console.warn("[story] playEnding", err); }
      }
      s.rt.cinematic = false;
      if (opts.onCard) { try { opts.onCard(); } catch (err) { /* */ } }
      const ui = ctx.ui;
      if (ui && ui.ending) {
        try { button = await ui.ending(id, { buttons: endingButtons(id) }); } catch (err) { console.warn("[story] ui.ending", err); }
      }
    } finally {
      busy = null;
      s.rt.cinematic = false;
    }
    await handle(button);
    return true;
  }

  async function handle(b) {
    try {
      if (b === "remember") await story.remember();
      else if (b === "startOver") await story.newGame();
      else if (b === "winner") {
        story.setPhase("finalBoss");
        story.objective(null);
        const ev = ctx.events;
        if (ev && ev.startFinal) await ev.startFinal({ rematch: true });
      } else {
        ctx.state.rt.playing = false;
        story.objective(null);
        if (ctx.ui && ctx.ui.showTitle) ctx.ui.showTitle();
      }
    } catch (err) { console.warn("[story] ending button", err); }
  }

  return { reach, get busy() { return busy; } };
}
