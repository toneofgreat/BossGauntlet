// src/platform/services/gear-actions.js — gear you can actually use. Spec 20 owns this.
//
// Until now every gear item was decoration: five things you could hold and none of them
// did anything. This gives each one a use, bound to the same action button the engine
// already exposes (`action1` — E on a keyboard, the ⚡ button on a phone).
//
// The balloon is the one with real mechanics, because it was specified in detail: hold
// it, press use, and a balloon leaves your hand, drifts up, fades and is gone — and while
// it is there it is SOLID, so you can jump on it. One every ten seconds.
//
// Everything here is local to the player who pressed the button. A released balloon is
// not sent to the room, because the parts a Place owns and the parts a player conjures
// are different things and only the first is other people's business (ARCHITECTURE §9 —
// OofTools is the thing that builds for everyone, and it is gated on leading a room).

const BALLOON_COOLDOWN_S = 10;   // the owner's number
const BALLOON_RISE = 1.15;       // studs per second — a drift, not a launch
const BALLOON_LIFE_S = 16;
const BALLOON_FADE_S = 4;        // it spends its last four seconds going transparent
const BALLOON_MAX = 6;           // live at once, so a held button cannot carpet the sky
const BALLOON_COLORS = ["#d94436", "#f5c542", "#3ddc84", "#0f5cc2", "#9b59b6", "#ff36c8"];

const TORCH_COOLDOWN_S = 0.4;
const SWORD_COOLDOWN_S = 0.6;
const FINGER_COOLDOWN_S = 0.8;

export function createGearActions(deps = {}) {
  const { avatar, toast, sfx } = deps;
  let ctx = null;
  let balloons = [];      // { ids:[], y, age, color }
  let cooldowns = {};     // gearId -> seconds remaining
  let torchLit = true;
  let swingT = 0;
  let onCooldownChange = null;

  const equipped = () => {
    if (!avatar || typeof avatar.getState !== "function") return null;
    const st = avatar.getState();
    return (st && st.equipped && st.equipped.gear) || null;
  };

  // ---- the balloon ------------------------------------------------------------------

  // Nine parts (spec 20 §5), because "detailed" was asked for and a sphere on a stick is
  // not a balloon: a body, a highlight that reads as gloss, the knot, a string in three
  // segments so it hangs with a bend rather than as one rigid rod, and three ribbon tails.
  //
  // Only the BODY collides. The string and ribbons must not, or they would catch a player
  // who is trying to land on the balloon — which spec 20 §5 says has to work.
  function balloonParts(x, y, z, color) {
    return [
      { id: `oof-balloon-${x}-${y}-body`, shape: "sphere", size: [2.6, 3.1, 2.6],
        position: [x, y + 2.0, z], color, material: "plastic" },
      { id: `oof-balloon-${x}-${y}-gloss`, shape: "sphere", size: [0.7, 0.8, 0.7],
        position: [x - 0.6, y + 2.7, z - 0.5], color: "#ffffff",
        material: "plastic", transparency: 0.45, canCollide: false },
      { id: `oof-balloon-${x}-${y}-knot`, shape: "cylinder", size: [0.35, 0.4, 0.35],
        position: [x, y + 0.42, z], color, material: "plastic", canCollide: false },
      { id: `oof-balloon-${x}-${y}-s1`, shape: "cylinder", size: [0.07, 0.75, 0.07],
        position: [x, y + 0.05, z], color: "#e8ecf4", material: "plastic", canCollide: false },
      { id: `oof-balloon-${x}-${y}-s2`, shape: "cylinder", size: [0.07, 0.75, 0.07],
        position: [x + 0.12, y - 0.65, z + 0.05], rotation: [0, 0, 9],
        color: "#e8ecf4", material: "plastic", canCollide: false },
      { id: `oof-balloon-${x}-${y}-s3`, shape: "cylinder", size: [0.07, 0.7, 0.07],
        position: [x + 0.3, y - 1.3, z + 0.1], rotation: [0, 0, 16],
        color: "#e8ecf4", material: "plastic", canCollide: false },
      { id: `oof-balloon-${x}-${y}-r1`, shape: "box", size: [0.1, 0.5, 0.04],
        position: [x - 0.22, y + 0.2, z + 0.1], rotation: [0, 0, -28],
        color: "#f7c948", material: "plastic", canCollide: false },
      { id: `oof-balloon-${x}-${y}-r2`, shape: "box", size: [0.1, 0.5, 0.04],
        position: [x + 0.24, y + 0.16, z - 0.12], rotation: [0, 0, 26],
        color: "#f7c948", material: "plastic", canCollide: false },
      { id: `oof-balloon-${x}-${y}-r3`, shape: "box", size: [0.09, 0.44, 0.04],
        position: [x + 0.02, y + 0.1, z + 0.26], rotation: [22, 0, 6],
        color: "#ff36c8", material: "plastic", canCollide: false },
    ];
  }

  function releaseBalloon() {
    if (!ctx) return false;
    if (balloons.length >= BALLOON_MAX) return false;
    const feet = ctx.player.position();
    const yaw = ctx.player.avatar ? ctx.player.avatar.rotation.y : 0;
    // Out of your hand, not out of your chest.
    const x = feet[0] + Math.sin(yaw) * 1.6;
    const z = feet[2] + Math.cos(yaw) * 1.6;
    const y = feet[1] + 2.2;
    const color = BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)];
    const ids = [];
    for (const def of balloonParts(Math.round(x * 100) / 100, Math.round(y * 100) / 100,
      Math.round(z * 100) / 100, color)) {
      try {
        ids.push(ctx.engine.parts.create({
          anchored: true,
          canCollide: def.canCollide !== false,
          transparency: def.transparency || 0,
          rotation: def.rotation || [0, 0, 0],
          ...def,
        }));
      } catch { /* a part that will not build is not worth failing the whole balloon for */ }
    }
    if (!ids.length) return false;
    balloons.push({ ids, base: { x, y, z }, rise: 0, age: 0 });
    if (sfx) sfx("collect");
    return true;
  }

  function dropBalloon(b) {
    if (!ctx) return;
    for (const id of b.ids) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
  }

  // ---- the rest ----------------------------------------------------------------------

  function useTorch() {
    torchLit = !torchLit;
    if (toast) toast(torchLit ? "Torch lit" : "Torch out");
    return true;
  }

  function useSword() {
    swingT = SWORD_COOLDOWN_S;
    if (sfx) sfx("swing");
    return true;
  }

  function useFinger() {
    if (toast) toast("👉 NUMBER ONE");
    if (sfx) sfx("click");
    return true;
  }

  function useBoombox() {
    if (deps.openBoombox) deps.openBoombox();
    return true;
  }

  const USES = {
    gear_balloon: { cooldown: BALLOON_COOLDOWN_S, run: releaseBalloon },
    gear_torch: { cooldown: TORCH_COOLDOWN_S, run: useTorch },
    gear_sword: { cooldown: SWORD_COOLDOWN_S, run: useSword },
    gear_finger: { cooldown: FINGER_COOLDOWN_S, run: useFinger },
    gear_boombox: { cooldown: 0.5, run: useBoombox },
  };

  return {
    attach(nextCtx) {
      ctx = nextCtx;
      balloons = [];
      cooldowns = {};
      swingT = 0;
    },
    detach() {
      for (const b of balloons) dropBalloon(b);
      balloons = [];
      ctx = null;
    },

    // Called when the player presses the action button.
    use() {
      const gear = equipped();
      if (!gear) {
        if (toast) toast("Equip something from the Catalog first");
        return false;
      }
      const entry = USES[gear];
      if (!entry) return false;
      const left = cooldowns[gear] || 0;
      if (left > 0) {
        // Say how long, rather than doing nothing — a button that silently ignores you is
        // indistinguishable from a broken one.
        if (toast) toast(`Ready in ${Math.ceil(left)}s`);
        return false;
      }
      const did = entry.run();
      if (did) {
        cooldowns[gear] = entry.cooldown;
        if (onCooldownChange) onCooldownChange(gear, entry.cooldown);
      }
      return did;
    },

    update(dt) {
      for (const k of Object.keys(cooldowns)) {
        if (cooldowns[k] > 0) {
          cooldowns[k] = Math.max(0, cooldowns[k] - dt);
          if (cooldowns[k] === 0 && onCooldownChange) onCooldownChange(k, 0);
        }
      }
      if (swingT > 0) swingT = Math.max(0, swingT - dt);
      if (!ctx || !balloons.length) return;

      const parts = ctx.engine.parts;
      const still = [];
      for (const b of balloons) {
        b.age += dt;
        b.rise += BALLOON_RISE * dt;
        if (b.age >= BALLOON_LIFE_S) { dropBalloon(b); continue; }
        // The last few seconds fade it out, so it leaves rather than blinking away.
        const fade = b.age > BALLOON_LIFE_S - BALLOON_FADE_S
          ? (b.age - (BALLOON_LIFE_S - BALLOON_FADE_S)) / BALLOON_FADE_S
          : 0;
        const defs = balloonParts(b.base.x, b.base.y, b.base.z, "#000000");
        for (let i = 0; i < b.ids.length; i++) {
          const d = defs[i];
          if (!d) continue;
          try {
            parts.setPosition(b.ids[i], [d.position[0], d.position[1] + b.rise, d.position[2]]);
            if (fade > 0) parts.setTransparency(b.ids[i], Math.min(0.95, (d.transparency || 0) + fade));
          } catch { /* the part went away mid-frame */ }
        }
        still.push(b);
      }
      balloons = still;
    },

    cooldownOf: (gear) => cooldowns[gear] || 0,
    balloonCount: () => balloons.length,
    torchLit: () => torchLit,
    onCooldownChange(fn) { onCooldownChange = fn; },
  };
}
