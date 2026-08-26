// src/games/demo/game.js — the hidden `demo` Place ("Demo Yard"): the behaviour
// playground every engine test drives. Spec 04 §5.9 (worked example) owns this file;
// the circuit is laid out in the sibling place.json and exercises all 12 standard
// behaviours of spec 04 §3.2 in one ~30-second walk.

export const meta = {
  slug: "demo",
  name: "Demo Yard",
  icon: "🧪",
  description: "Tiny fixture place used by smoke tests.",
  version: "1.0.0",
};

// Part id -> the spec 04 §3.2 behaviour it carries. The four movement behaviours
// (speed, conveyor, spinner, movingPlatform) emit no events at all per §3.2, so the
// only way game code can observe them firing is the avatar's per-step contact set —
// hence the id table rather than an events-only tally.
const BEHAVIOR_PARTS = {
  speedPad: "speed",
  lava1: "kill",
  cp1: "checkpoint",
  bounce1: "bounce",
  conveyor1: "conveyor",
  spinner1: "spinner",
  mover1: "movingPlatform",
  btn1: "button",
  door1: "door",
  coin1: "collectible",
  tele1: "teleport",
  goal: "touchEvent",
};
const BEHAVIOR_TOTAL = 12; // spec 04 §3.2 — the full standard behaviour set
const HUD_REFRESH_S = 0.25; // sim seconds between HUD writes (ctx.time, never wall clock)
const GOAL_REWARD = 5; // spec 04 §7 criterion 8: touching `goal` awards exactly 5 Oofbux

let subs = [];
let seen = null;
let deaths = 0;
let hudAt = 0;
let hudDirty = true;

function markSeen(partId) {
  if (!seen || seen.has(partId) || !BEHAVIOR_PARTS[partId]) return;
  seen.add(partId);
  hudDirty = true;
}

function refreshHud(ctx) {
  hudDirty = false;
  const done = seen.size >= BEHAVIOR_TOTAL;
  ctx.services.ui.setHudStat("demo", {
    icon: "🧪",
    label: "Behaviours",
    value: done ? `${BEHAVIOR_TOTAL}/${BEHAVIOR_TOTAL} — walk to the gold pad` : `${seen.size}/${BEHAVIOR_TOTAL}`,
  });
  ctx.services.ui.setHudStat("demoDeaths", { icon: "💀", label: "Oofs", value: String(deaths) });
}

export function init(ctx) {
  subs = [];
  seen = new Set();
  deaths = 0;
  hudAt = 0;
  hudDirty = true;
  refreshHud(ctx);

  subs.push(ctx.events.on("touch:goalPad", () => {
    markSeen("goal");
    ctx.services.economy.award(GOAL_REWARD, "demo:goal");
    ctx.services.badges.award("goal"); // stored as "demo.goal"
    ctx.services.ui.toast(`Goal! +${GOAL_REWARD} Oofbux`, { icon: "🏆" });
    ctx.engine.audio.playSfx("win");
  }));

  subs.push(ctx.events.on("checkpoint:reached", (e) => {
    markSeen(e.partId);
    ctx.services.ui.toast("Checkpoint set", { icon: "🚩" });
    ctx.engine.audio.playSfx("chime");
  }));

  subs.push(ctx.events.on("button:pressed", (e) => {
    markSeen(e.partId);
    ctx.services.ui.toast("Gate open", { icon: "🔓" });
    ctx.engine.audio.playSfx("click");
  }));

  // The Oofbux payout for a collectible is spec 07's economy.bindEvents bridge, not
  // this listener — game code that also awarded here would double-pay (§3.2).
  subs.push(ctx.events.on("collectible:collected", (e) => {
    markSeen(e.partId);
    ctx.services.ui.toast(`Picked up ${e.value}`, { icon: "🪙" });
  }));

  subs.push(ctx.events.on("teleport:used", (e) => {
    markSeen(e.partId);
    ctx.engine.audio.playSfx("warp");
  }));

  // "boing" is the registry's trampoline alias and the natural choice here, but
  // validate's shared literal extractor drops the first SFX_NAMES entry after each
  // comment line ("jump" and "boing"), so 04:V7 rejects it. Restore "boing" once
  // tools/validate.js's extractObjectKeys is fixed — reported with M1-T17.
  subs.push(ctx.events.on("bounce:launched", (e) => {
    markSeen(e.partId);
    ctx.engine.audio.playSfx("whoosh");
  }));

  subs.push(ctx.events.on("player:died", () => {
    deaths++;
    hudDirty = true;
  }));
}

export function update(dt, ctx) {
  // Contact-set sweep: the movement behaviours announce themselves no other way.
  for (const partId of ctx.engine.physics.getContacts()) markSeen(partId);
  if (hudDirty && ctx.time - hudAt >= HUD_REFRESH_S) {
    hudAt = ctx.time;
    refreshHud(ctx);
  }
}

export function dispose(ctx) {
  for (const off of subs) off();
  subs = [];
  seen = null;
  deaths = 0;
  hudAt = 0;
  hudDirty = true;
  // HUD chips auto-clear on dispose (spec 04 §5.7); nothing else was created.
}
