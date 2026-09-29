// src/games/showdown/scripts/hud.js - Showdown's one game-owned DOM layer. Spec 25 §15
// owns this file and config.js's MODULE CONTRACT fixes its shape:
// create(ctx, handlers) -> { update, prompt, dismissPrompt, toastLocal, dispose }.
//
// WHY A PLACE OWNS DOM AT ALL. Two platform facts, both hard. First,
// input.setActionButtons is not on ctx (the shell exposes getMoveVector / isJumpHeld /
// isDown / onAction and nothing else), so every control past the joystick, jump, E and Q
// has to be a button this Place builds: the swing, the emote, the flight toggle, the
// spectate arrows, the four kiosks, the three vote buttons and the stay-or-join choice.
// Second, a place.json part cannot carry changing text: the `text` behaviour rasterises
// its string ONCE onto a 256x64 canvas at construction and hangs it on the mesh as a
// sprite, there is no setText anywhere on ctx.engine.parts, and setColor replaces the mesh
// material and leaves the sprite alone. So the live vote tally, the phase clock, the alive
// count and the HP number are DOM or they do not exist (§3.1, §16.13).
//
// THE VOTE CONTROL IS LIVE WHEREVER YOU ARE, for as long as view.voteOpen is true,
// including while you are in the obby (§6). That is not a convenience: the obby the Place
// tells you to play while you wait is 600 studs west and 260 studs up with no fast way
// back, and the vote window is only the first 20 s of a 40 s intermission, so a
// plinth-only vote silently cost you your vote every round you spent in it. These buttons
// and the plinths are the same onVote code path, and neither one decides anything.
//
// THE STAY-OR-JOIN PROMPT IS OURS, not ctx.services.ui.dialog (§11.3). dialog queues FIFO
// and never rejects, but it can express neither a visible countdown nor an auto-default,
// and this prompt is nothing but those two things: five seconds of clock on screen and
// JOIN ROUND applied if the player says nothing. The default is the fight, because a round
// with a player standing idle in it is worse than a lost obby attempt.
//
// NO CLOCK BUT THE SIM CLOCK. Every countdown in here is driven by the `dt` handed to
// update, because a Place may name no browser timer and can read no wall clock (§17.1).
// The banner fade and the prompt countdown are both dt accumulators.
//
// TOUCH FIRST, AND IT MUST NOT EAT THE CAMERA. The root is
// position:fixed;inset:0;pointer-events:none, so a drag that starts on it falls through to
// #oof-stage, which is where the engine listens for camera orbit and pinch zoom; only the
// real buttons take pointer-events:auto, and every one is at least TUNE.TOUCH_MIN_PX
// across. The root is appended to document.body rather than into #oof-stage, so a tap on
// one of our buttons never reaches the engine's touch handler at all and therefore cannot
// also spin the camera. Every INTERACTIVE cluster sits on the side of the screen the
// joystick is not: input.js gives the stick a hit zone of 50% of the width by 55% of the
// height in one bottom corner (45% by 65% in landscape) and mirrors it wholesale when the
// player turns on left-handed mode, so we read the same `oof-left-handed` body class and
// mirror with it. Status chips are pointer-events:none and may sit anywhere, because
// touches pass straight through them.
//
// DOM WRITES ARE THROTTLED TO TUNE.HUD_REFRESH_S and every one is guarded by a comparison
// against the last value written (§15), so a 60 Hz sim step touches the DOM four times a
// second at most and usually touches nothing. The one thing the throttle does NOT make wait
// is a change to WHICH controls are on screen: the phase, the vote window, death, spectate,
// the obby and the flight unlock flush the pass on the tick they change (shapeOf), because a
// late number reads late while a late control lies. Writes are per property, never a whole
// style attribute: rewriting the attribute would also rewrite `display` and un-hide a
// control that the visibility pass had just hidden.
//
// Everything mutable lives in the closure create() returns. There is no module-level
// state, so a second create after a dispose starts clean, and dispose removes the single
// root it made; nothing else in the document ever knew we were here.

import { TUNE, MAPS, weaponById, skinById } from "./config.js";

// =====================================================================================
// Geometry and presentation constants. Anything TUNE already holds is read from TUNE;
// what is left is layout, and each line says what it is measured against.
// =====================================================================================

// The bottom band the engine's own touch controls own, measured off input.js's layout
// table: the jump circle is 88 px with its near edge 72 px off the bottom in portrait
// (40 px in landscape), so its top edge lands at 160 px. Our button column and the foot of
// the rail start above that, or a thumb reaching for jump would swing a weapon.
const BOTTOM_CLEAR_PX = 176;

// The platform HUD is a 44 px bar at top 8 plus the safe-area inset, with its stat chips
// wrapping in a left-aligned row beneath it (tokens.js: #oof-hud, #oof-hud-stats). Our
// rail starts under the bar and hugs the far edge, so it lands on neither.
const RAIL_TOP_PX = 60;
const RAIL_W = "min(268px, 64vw)";

// The swing button is deliberately larger than TUNE.TOUCH_MIN_PX: it is pressed a few
// hundred times in a 240 s fight and it is the one control a miss actually costs you.
const SWING_D = 72;
const ACTION_D = 56;   // emote and flight, still comfortably over TOUCH_MIN_PX

// The local banner's life, in sim seconds, and how long before the end it starts fading.
// Not TUNE values because nothing else reads them: long enough to read a weapon name at a
// glance, short enough that three pickups in a row do not curtain the map during a fight.
const TOAST_S = 2.6;
const TOAST_FADE_S = 0.4;

// The prompt (§11.3). One kind exists; the default is JOIN, applied by this module when
// the countdown reaches zero, and it fires at most once per prompt.
const PROMPT_KIND = "obby-choice";
const PROMPT_DEFAULT = "join";

// input.js mirrors its stick zone and its buttons on this body class (the shell only
// toggles the class and exposes no setter), so we mirror on the same signal.
const LEFT_HAND_CLASS = "oof-left-handed";

// Readable over a bright map is the whole styling brief: the forest ground is lit at sun
// intensity 1.35 under an #a8e08a sky, so light-on-light would be unreadable. Every panel
// is a dark translucent slab with a hairline and a drop shadow, and every glyph carries a
// shadow of its own.
const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const INK = "#f2f4f6";
const INK_DIM = "#aab2ba";
const GOLD = "#f5c542";
const PANEL = "background:rgba(12,14,19,0.74);border:1px solid rgba(255,255,255,0.16);"
  + "border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,0.45);color:" + INK + ";"
  + "text-shadow:0 1px 2px rgba(0,0,0,0.6);box-sizing:border-box;";
const CHIP = PANEL + "min-height:28px;padding:4px 10px;font-size:13px;font-weight:700;"
  + "display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;"
  + "text-overflow:ellipsis;";

// HP colours, read against TUNE.HP_MAX: green while a ground's legendary still needs its
// three connected swings, amber once two would finish you, red once one common might.
const HP_OK = "#3ddc84";
const HP_MID = "#f39c12";
const HP_LOW = "#e74c3c";

// Button fills. The swing is the loud one; flight reads as armed when it is on.
const SWING_BG = "rgba(196,52,40,0.86)";
const SWING_BG_DOWN = "rgba(240,96,80,0.95)";
const ON_BG = "rgba(0,120,200,0.85)";
const OFF_BG = "rgba(12,14,19,0.74)";
const LINE = "rgba(255,255,255,0.16)";
const LINE_BRIGHT = "rgba(255,255,255,0.55)";
const VOTE_BG = "rgba(26,30,38,0.72)";
const VOTE_BG_MINE = "rgba(245,197,66,0.22)";

// The phase names of §4 as the player should read them rather than as round.js spells
// them. `boot` lasts one tick and is only ever seen by a test.
const PHASE_LABEL = Object.freeze({
  boot: "STARTING",
  intermission: "NEXT ROUND IN",
  fight: "FIGHT",
  result: "ROUND OVER",
});

// The four kiosks of §10, in the order §3.1 stands them in the lobby. `id` is what onShop
// is handed, and it matches shops.open's `which`.
const SHOP_ROWS = Object.freeze([
  Object.freeze({ id: "hats", icon: "🎩", label: "Hats" }),
  Object.freeze({ id: "emotes", icon: "😄", label: "Emotes" }),
  Object.freeze({ id: "skins", icon: "🗡️", label: "Skins" }),
  Object.freeze({ id: "vault", icon: "🏆", label: "Vault" }),
]);

// =====================================================================================
// Small pure helpers. No ctx, no state.
// =====================================================================================

function el(tag, style, text) {
  const node = document.createElement(tag);
  if (style) node.setAttribute("style", style);
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(style, label, aria) {
  const node = el("button", style, label);
  node.type = "button";
  if (aria) node.setAttribute("aria-label", aria);
  return node;
}

// A tappable slab. touch-action:none stops a drag on the button scrolling the page, and
// pointer-events:auto is what lifts it out of the transparent root.
function btnStyle(minH, extra) {
  return PANEL + "min-height:" + minH + "px;min-width:" + TUNE.TOUCH_MIN_PX + "px;"
    + "padding:0 10px;font:700 14px " + FONT + ";display:flex;align-items:center;"
    + "justify-content:center;gap:6px;cursor:pointer;pointer-events:auto;"
    + "touch-action:none;user-select:none;-webkit-user-select:none;"
    + "-webkit-tap-highlight-color:transparent;" + (extra || "");
}

function roundStyle(d, fontPx, extra) {
  return PANEL + "width:" + d + "px;height:" + d + "px;border-radius:50%;padding:0;"
    + "font:700 " + fontPx + "px " + FONT + ";display:flex;align-items:center;"
    + "justify-content:center;cursor:pointer;pointer-events:auto;touch-action:none;"
    + "user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;"
    + (extra || "");
}

// m:ss off a seconds remainder. Ceil, not floor, so a clock with a fraction of a second
// left still reads 0:01 and the player never watches 0:00 for a whole second.
function fmtClock(seconds) {
  const n = Math.max(0, Math.ceil(Number(seconds) || 0));
  return Math.floor(n / 60) + ":" + String(n % 60).padStart(2, "0");
}

// The contract hands us WEAPONS and SKINS rows (combat.heldWeapon returns a row, and the
// fist row when your hands are empty), but a caller passing the published `wp`/`sk` id
// instead is resolved here rather than rendering "undefined" at the player.
function rowOf(value, lookup) {
  if (!value) return null;
  if (typeof value === "string") return lookup(value);
  return typeof value === "object" ? value : null;
}

// `alive` is a count here and a string[] in RoundFacts, so accept both rather than make
// game.js remember which shape this one wanted. Also the safe reader for every number the
// view carries: a missing field draws a 0, never a NaN.
function countOf(value) {
  if (Array.isArray(value)) return value.length;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// Wardens are props and never players (§9.1), so they get their own readout and never
// touch the alive count. `wardens` may be the WardenView[] that wardens.list() returns or
// a plain broken count; both read the same way.
function wardensBroken(value) {
  if (Array.isArray(value)) {
    let n = 0;
    for (const w of value) if (w && w.state === "broken") n += 1;
    return n;
  }
  return countOf(value);
}

function wardensTotal(value) {
  return Array.isArray(value) && value.length > 0 ? value.length : TUNE.WARDEN_COUNT;
}

// =====================================================================================
// create(ctx, handlers) -> Hud
//
// handlers = { onSwing, onEmote, onFly, onSpectateNext, onSpectatePrev, onShop(which),
//              onVote(mapId), onObbyEnter, onObbyLeave }. Every one is optional at the
// call site: a handler with no partner does nothing rather than throwing out of a pointer
// event, which would leave that button dead for the rest of the session.
//
// view (HudView) = { phase, clock, votes, voteOpen, myVote, mapName, hp, weapon, skin,
//                    alive, points, lifetimeWins, dead, spectating, spectateName, canFly,
//                    flying, inObby, stageName, wardens }
// =====================================================================================

export function create(ctx, handlers) {
  const H = handlers || {};

  // ---- closure state. Nothing here survives dispose ---------------------------------
  let liveCtx = ctx || null;        // refreshed each update: the shell hands ctx per tick
  let disposed = false;
  let acc = TUNE.HUD_REFRESH_S;     // start due, so the first update paints immediately
  let painted = null;               // shapeOf() as last painted; null forces the first pass
  let mirrored = null;              // null forces the first layout pass to run
  let swingHeld = false;            // the swing button is being held down
  let inObbyNow = false;            // the last view's inObby, for the one obby button
  let toastLeft = 0;                // sim seconds of banner left
  let live = null;                  // the open prompt: { remain, total, onPick }
  const last = Object.create(null); // last value written per DOM slot (§15's compare)

  function fire(fn, arg) {
    if (typeof fn === "function") fn(arg);
  }

  // THE THROTTLE FLUSHES ON A STATE EDGE, and this is the key it compares. `acc` is a plain
  // sim-time accumulator, and loop.js delivers up to 0.1 s of sim per rendered frame, so on
  // the SwiftShader host one HUD_REFRESH_S is about one wall second and a phase flip that
  // lands between two due passes leaves the panel reading the phase BEFORE it - measured as
  // "NEXT ROUND IN 0:40" and "no ground yet" on a tick where debugState() already said
  // `fight`. Nothing in here is a number: every field decides which controls are on the
  // screen at all. A clock a quarter of a second late reads late; a ⚔️ that is not there
  // yet, a kiosk row that should be gone, or an OBBY button still offering to ENTER the obby
  // you are standing in (refresh() is also what latches inObbyNow, which its tap handler
  // reads) is a control that lies about what pressing it does. So these flush, and the
  // numbers beside them ride along.
  function shapeOf(v) {
    return (typeof v.phase === "string" ? v.phase : "boot")
      + (v.voteOpen ? "V" : "-") + (v.dead ? "D" : "-") + (v.spectating ? "S" : "-")
      + (v.inObby ? "O" : "-") + (v.canFly ? "F" : "-");
  }

  // A tap sound for the UI, from the closed 25-name sfx registry. The swing button is
  // deliberately excluded: combat.js already plays its own whoosh, and two sounds for one
  // press reads as a bug.
  function clickSfx() {
    const audio = liveCtx && liveCtx.engine && liveCtx.engine.audio;
    if (audio && typeof audio.playSfx === "function") audio.playSfx("click", { volume: 0.5 });
  }

  // pointerdown rather than click: one listener covers mouse and touch, it fires on
  // contact instead of on release (which a fighting Place can feel), and preventDefault
  // stops the browser synthesising a second click out of the same tap.
  function onTap(node, fn) {
    node.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      clickSfx();
      fn();
    });
  }

  // ---- the three guarded writers. Nothing else touches the DOM ----------------------
  function setText(node, key, text) {
    if (last[key] === text) return;
    last[key] = text;
    node.textContent = text;
  }

  // One property at a time, never the whole style attribute: an attribute write would
  // also rewrite `display` and un-hide whatever the visibility pass had just hidden.
  function setProp(node, key, prop, value) {
    if (last[key] === value) return;
    last[key] = value;
    node.style[prop] = value;
  }

  function show(node, key, on, mode) {
    const want = on ? (mode || "flex") : "none";
    if (last[key] === want) return;
    last[key] = want;
    node.style.display = want;
  }

  // ---- the root ---------------------------------------------------------------------
  // One element, on document.body, at TUNE.UI_Z (the `game` layer, under the platform HUD
  // at 100, panels at 200 and toasts at 400). pointer-events:none is load bearing: with it
  // set to auto this single div would swallow every camera drag and pinch in the Place.
  const root = el("div", "position:fixed;inset:0;pointer-events:none;z-index:" + TUNE.UI_Z
    + ";font-family:" + FONT + ";color:" + INK + ";");
  root.id = "showdown-ui";

  // ---- the rail: one flex column on the far side of the screen ----------------------
  // Everything informational and every lobby control lives in here, so there is one
  // layout to reason about instead of eight absolute positions to keep from colliding. It
  // stops BOTTOM_CLEAR_PX above the bottom so it can never reach the engine's jump
  // button, and it clips rather than overflowing on a short phone.
  const rail = el("div", "position:fixed;top:calc(env(safe-area-inset-top, 0px) + "
    + RAIL_TOP_PX + "px);bottom:calc(env(safe-area-inset-bottom, 0px) + "
    + BOTTOM_CLEAR_PX + "px);width:" + RAIL_W + ";display:flex;flex-direction:column;"
    + "gap:8px;pointer-events:none;overflow:hidden;");

  // The phase clock (§4). The biggest thing on screen after the HP bar, because every
  // decision in this Place is made against it.
  const clockCard = el("div", PANEL + "padding:6px 12px;display:flex;flex-direction:column;"
    + "align-items:flex-start;");
  const phaseLabel = el("div", "font-size:11px;letter-spacing:0.1em;font-weight:700;color:"
    + INK_DIM + ";", "STARTING");
  const clockText = el("div", "font-size:28px;font-weight:800;line-height:1.05;", "0:00");
  clockCard.append(phaseLabel, clockText);

  // The alive count, the live ground, the Warden tally and, in the obby, the stage you
  // are standing in. A wrapping row, so a narrow phone drops them onto two lines.
  const statRow = el("div", "display:flex;flex-wrap:wrap;gap:6px;");
  const aliveChip = el("div", CHIP, "👥 1 alive");
  const groundChip = el("div", CHIP, "🗺 lobby");
  const wardenChip = el("div", CHIP + "display:none;", "👁 0/3 broken");
  const stageChip = el("div", CHIP + "display:none;", "🪜 obby");
  statRow.append(aliveChip, groundChip, wardenChip, stageChip);

  // HP (§8). A bar plus the number, because "how many swings am I from dead" is a count
  // and not a length: against HP_MAX 100 a ground's legendary takes three.
  const hpCard = el("div", PANEL + "padding:8px 10px;display:none;flex-direction:column;gap:6px;");
  const hpHead = el("div", "display:flex;justify-content:space-between;align-items:center;"
    + "font-size:11px;letter-spacing:0.1em;font-weight:700;color:" + INK_DIM + ";");
  const hpNum = el("div", "font-size:14px;font-weight:800;color:" + INK + ";", "100 / 100");
  hpHead.append(el("div", "", "HP"), hpNum);
  const hpTrack = el("div", "height:12px;border-radius:7px;background:rgba(0,0,0,0.55);"
    + "border:1px solid " + LINE + ";overflow:hidden;");
  const hpFill = el("div", "height:100%;width:100%;background:" + HP_OK
    + ";transition:width 200ms linear;");
  hpTrack.appendChild(hpFill);
  hpCard.append(hpHead, hpTrack);

  // What is in your hands, and the skin dressing it (§10.3). Both ride the wire as wp/sk,
  // so this chip is also how you check a room is seeing what you think it is.
  const weaponChip = el("div", CHIP, "🤜 Bare hands");

  // Fighting Points, and the lifetime record they are never spent out of (§13.1, §14).
  const pointsChip = el("div", CHIP + "white-space:normal;", "🏆 0 Fighting Points");

  // Spectating (§12). The camera cannot be detached from your own rig, so these buttons
  // move YOU: the 🎥 is a marker for that rather than a dead button, because the contract
  // has no third spectate handler for one to call.
  const spectateCard = el("div", PANEL + "padding:6px;display:none;align-items:center;gap:6px;");
  const spectatePrev = button(roundStyle(TUNE.TOUCH_MIN_PX, 16), "◀", "Watch the previous fighter");
  const spectateNext = button(roundStyle(TUNE.TOUCH_MIN_PX, 16), "▶", "Watch the next fighter");
  const spectateName = el("div", "flex:1;min-width:0;font-size:13px;font-weight:700;"
    + "text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;", "🎥 watching");
  spectateCard.append(spectatePrev, spectateName, spectateNext);
  onTap(spectatePrev, () => fire(H.onSpectatePrev));
  onTap(spectateNext, () => fire(H.onSpectateNext));

  // The vote board (§6), built from MAPS so the rows, their order and their icons come
  // from the frozen contract and are never spelled out a second time in here.
  const voteCard = el("div", PANEL + "padding:8px;display:none;flex-direction:column;gap:6px;");
  const voteHead = el("div", "display:flex;align-items:center;justify-content:space-between;"
    + "gap:8px;font-size:11px;letter-spacing:0.08em;font-weight:700;color:" + INK_DIM + ";");
  const voteClock = el("div", "font-size:13px;font-weight:800;color:" + INK + ";", "");
  voteHead.append(el("div", "", "VOTE THE GROUND"), voteClock);
  voteCard.appendChild(voteHead);
  const voteRows = MAPS.map((m) => {
    const btn = button(btnStyle(TUNE.TOUCH_MIN_PX, "width:100%;justify-content:space-between;"
      + "background:" + VOTE_BG + ";"), undefined, "Vote for " + m.name);
    const label = el("span", "flex:1;min-width:0;text-align:left;overflow:hidden;"
      + "text-overflow:ellipsis;white-space:nowrap;", m.icon + " " + m.name);
    const count = el("span", "font-weight:800;min-width:16px;text-align:right;", "0");
    const mark = el("span", "width:14px;text-align:center;color:" + GOLD + ";", "");
    btn.append(label, count, mark);
    onTap(btn, () => fire(H.onVote, m.id));
    voteCard.appendChild(btn);
    return { id: m.id, btn, count, mark };
  });

  // The lobby row: the obby arch and the four kiosks. Gone while a fight runs, both
  // because they are lobby furniture (§3.1, §10) and because every button we hide is a
  // button that cannot eat a camera drag in the middle of a fight.
  const lobbyCard = el("div", PANEL + "padding:8px;display:none;flex-direction:column;gap:6px;");
  const obbyBtn = button(btnStyle(TUNE.TOUCH_MIN_PX, "width:100%;"), "🪜 OBBY",
    "Go to the lobby obby");
  const shopRow = el("div", "display:flex;gap:6px;");
  for (const row of SHOP_ROWS) {
    const btn = button(roundStyle(TUNE.TOUCH_MIN_PX, 18), row.icon, row.label);
    onTap(btn, () => fire(H.onShop, row.id));
    shopRow.appendChild(btn);
  }
  lobbyCard.append(obbyBtn, shopRow);
  // One button, two jobs, because there is only ever one sensible move: you are either in
  // the obby or you are not, and §11.2 hands the checkpoint over either way.
  onTap(obbyBtn, () => {
    if (inObbyNow) fire(H.onObbyLeave);
    else fire(H.onObbyEnter);
  });

  rail.append(clockCard, statRow, hpCard, weaponChip, pointsChip, spectateCard, voteCard,
    lobbyCard);

  // ---- the bottom button column -----------------------------------------------------
  // column-reverse against a bottom anchor, so the first child sits lowest: the swing
  // button is nearest the thumb with the emote and the flight toggle stacked above it.
  const column = el("div", "position:fixed;bottom:calc(env(safe-area-inset-bottom, 0px) + "
    + BOTTOM_CLEAR_PX + "px);display:flex;flex-direction:column-reverse;align-items:center;"
    + "gap:10px;pointer-events:none;");
  const swingBtn = button(roundStyle(SWING_D, 30, "display:none;background:" + SWING_BG
    + ";border-color:" + LINE_BRIGHT + ";"), "⚔️", "Swing");
  const emoteBtn = button(roundStyle(ACTION_D, 22), "😄", "Play your emote");
  const flyBtn = button(roundStyle(ACTION_D, 22, "display:none;"), "🕊", "Toggle flight");
  column.append(swingBtn, emoteBtn, flyBtn);
  onTap(emoteBtn, () => fire(H.onEmote));
  onTap(flyBtn, () => fire(H.onFly));

  // The swing is the one control that repeats while held, which is what a 240 s fight
  // wants from a touch screen; combat.js's per-weapon cooldown is the rate limit, so a
  // held button costs nothing but a refused call. setPointerCapture is what guarantees the
  // matching pointerup lands on this element even when the thumb slides off it: without it
  // a finger dragged off the button would leave swingHeld stuck true and the player
  // swinging for the rest of the round.
  function releaseSwing() {
    swingHeld = false;
    setProp(swingBtn, "swingBg", "background", SWING_BG);
  }
  swingBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    swingHeld = true;
    try {
      swingBtn.setPointerCapture(e.pointerId);
    } catch {
      // Capture can legitimately fail when the pointer was already released. The release
      // listeners below still fire; the worst case is a tap where a hold was wanted.
    }
    setProp(swingBtn, "swingBg", "background", SWING_BG_DOWN);
    fire(H.onSwing);
  });
  swingBtn.addEventListener("pointerup", releaseSwing);
  swingBtn.addEventListener("pointercancel", releaseSwing);
  swingBtn.addEventListener("lostpointercapture", releaseSwing);

  // ---- the local banner -------------------------------------------------------------
  // Not ui.toast: that is the platform's queue at z 400 and the wrong voice for "you
  // picked up a Lead Pipe". Centred at 38% of the height, clear of the platform bars above
  // and every control below, and pointer-events:none throughout.
  const toastEl = el("div", PANEL + "position:fixed;left:50%;top:38%;"
    + "transform:translate(-50%,-50%);max-width:min(340px, 82vw);padding:10px 16px;"
    + "font-size:15px;font-weight:700;text-align:center;opacity:0;pointer-events:none;"
    + "transition:opacity 220ms linear;", "");

  // ---- the stay-or-join prompt (§11.3) ----------------------------------------------
  // Deliberately without a backdrop: a full-screen pointer-events:auto scrim would eat
  // five seconds of camera drag, and this prompt appears while you are mid-jump on a rage
  // obby. Two buttons, both well over TUNE.TOUCH_MIN_PX, and the default is named on the
  // one that will be pressed for you.
  const promptCard = el("div", PANEL + "position:fixed;left:50%;top:50%;"
    + "transform:translate(-50%,-50%);width:min(360px, 92vw);padding:16px;display:none;"
    + "flex-direction:column;gap:10px;text-align:center;pointer-events:auto;"
    + "background:rgba(12,14,19,0.93);");
  const promptCount = el("div", "font-size:34px;font-weight:800;line-height:1;color:"
    + GOLD + ";", String(TUNE.OBBY_CHOICE_S));
  const promptTrack = el("div", "height:8px;border-radius:5px;background:rgba(0,0,0,0.55);"
    + "border:1px solid " + LINE + ";overflow:hidden;");
  const promptFill = el("div", "height:100%;width:100%;background:" + GOLD + ";");
  promptTrack.appendChild(promptFill);
  const promptBtns = el("div", "display:flex;gap:8px;");
  const stayBtn = button(btnStyle(52, "flex:1;"), "STAY IN OBBY", "Stay in the obby");
  const joinBtn = button(btnStyle(52, "flex:1;background:" + ON_BG + ";border-color:"
    + LINE_BRIGHT + ";"), "JOIN ROUND", "Join the round");
  promptBtns.append(stayBtn, joinBtn);
  promptCard.append(
    el("div", "font-size:17px;font-weight:800;", "A ROUND IS STARTING"),
    el("div", "font-size:13px;color:" + INK_DIM + ";",
      "You are up in the obby. Stay and keep climbing, or drop in and fight."),
    promptCount, promptTrack, promptBtns,
    el("div", "font-size:11px;color:" + INK_DIM + ";", "No answer joins the round."),
  );
  onTap(stayBtn, () => resolvePrompt("stay"));
  onTap(joinBtn, () => resolvePrompt(PROMPT_DEFAULT));

  root.append(rail, column, toastEl, promptCard);
  document.body.appendChild(root);
  // Pick a side before the first frame, so nothing is drawn on the joystick's corner for
  // the one tick between create and the first update.
  layoutSide();

  // =====================================================================================
  // Layout: which side of the screen the controls live on.
  // =====================================================================================

  // input.js puts the joystick's hit zone in one bottom corner and mirrors it wholesale on
  // the left-handed body class, so every interactive cluster we own goes on the OTHER
  // side. Reading the class in the throttled pass rather than listening for it costs one
  // classList check four times a second and leaves no listener to leak; the same pass
  // catches an orientation change, because every anchor here is edge-relative.
  function layoutSide() {
    const flip = !!(document.body && document.body.classList.contains(LEFT_HAND_CLASS));
    if (flip === mirrored) return;
    mirrored = flip;
    const near = flip ? "left" : "right";
    const far = flip ? "right" : "left";
    rail.style[far] = "";
    rail.style[near] = "8px";
    rail.style.alignItems = flip ? "flex-start" : "flex-end";
    column.style[far] = "";
    column.style[near] = "12px";
  }

  // =====================================================================================
  // The prompt. One latch, one default, one call to onPick.
  // =====================================================================================

  function paintPrompt() {
    if (!live) return;
    setText(promptCount, "promptCount", String(Math.max(0, Math.ceil(live.remain))));
    const pct = live.total > 0 ? Math.max(0, Math.min(1, live.remain / live.total)) : 0;
    setProp(promptFill, "promptFill", "width", (pct * 100).toFixed(1) + "%");
  }

  // Resolves at most once, whichever way it resolves: the player tapping, the countdown
  // expiring, or game.js applying the default inside the phase flip. §11.3 needs the
  // choice to be unrepeatable, because a second "join" after the flip would re-run §4.1's
  // entry sequence in the middle of a round.
  function resolvePrompt(choice) {
    if (!live) return;
    const pick = live.onPick;
    live = null;
    show(promptCard, "prompt", false);
    fire(pick, choice);
  }

  function prompt(kind, seconds, onPick) {
    if (disposed) return;
    // Only §11.3's prompt exists. An unknown kind is ignored rather than drawn with the
    // wrong buttons, and that is not an undefined state: nothing shows and nothing is
    // picked, so game.js's own resolution at 1 s of clock left still stands.
    if (kind !== PROMPT_KIND) return;
    const total = Number(seconds) > 0 ? Number(seconds) : TUNE.OBBY_CHOICE_S;
    live = { remain: total, total, onPick: typeof onPick === "function" ? onPick : null };
    show(promptCard, "prompt", true, "flex");
    paintPrompt();
  }

  // Called by game.js when it resolved the choice itself (§11.3's "the flip arrives with
  // the prompt unresolved"), and by dispose. It must NOT call onPick: the caller has
  // already applied a choice, and a second one would apply it twice.
  function dismissPrompt() {
    live = null;
    show(promptCard, "prompt", false);
  }

  // =====================================================================================
  // The banner.
  // =====================================================================================

  function toastLocal(text) {
    if (disposed) return;
    const str = text === undefined || text === null ? "" : String(text);
    if (!str) return;
    // A new line replaces the old rather than queueing behind it: in a fight the newest
    // line, which is the weapon now in your hands, is the only one worth reading.
    setText(toastEl, "toast", str);
    toastLeft = TOAST_S;
    setProp(toastEl, "toastFade", "opacity", "1");
  }

  // =====================================================================================
  // update(dt, ctx, view): the sim-clock half runs every tick, the DOM half at most every
  // TUNE.HUD_REFRESH_S (§15).
  // =====================================================================================

  function update(dt, tickCtx, view) {
    if (disposed) return;
    // The contract passes ctx every tick and the shell reassigns its fields, so the live
    // handle is kept rather than the one captured at boot.
    if (tickCtx) liveCtx = tickCtx;
    const step = Number(dt) > 0 ? Number(dt) : 0;

    // --- every tick: the countdowns, because they change state and not just pixels -----
    if (live) {
      live.remain -= step;
      // The auto-default is this module's job (§11.3): the platform dialog cannot express
      // one, and JOIN is the default because an idle player in a round is worse than a
      // lost obby attempt. It fires on the tick it expires rather than waiting for the
      // next DOM refresh, so it can never slip past the 1 s lead the phase flip needs.
      if (live.remain <= 0) resolvePrompt(PROMPT_DEFAULT);
    }
    if (toastLeft > 0) {
      toastLeft = Math.max(0, toastLeft - step);
      if (toastLeft <= TOAST_FADE_S) setProp(toastEl, "toastFade", "opacity", "0");
    }
    // A held swing repeats; combat's cooldown, not the frame rate, sets the pace.
    if (swingHeld) fire(H.onSwing);

    // --- throttled: everything that touches the DOM to say a number changed ------------
    // ...except a shape change, which is not a number and is not made to wait (shapeOf).
    const v = view || {};
    const shape = shapeOf(v);
    acc += step;
    if (acc < TUNE.HUD_REFRESH_S && shape === painted) return;
    acc = 0;
    painted = shape;
    layoutSide();
    paintPrompt();
    refresh(v);
  }

  function refresh(v) {
    const phase = typeof v.phase === "string" ? v.phase : "boot";
    const inFight = phase === "fight";
    const spectating = !!v.spectating;
    // A living fighter: the one state that gets the swing button and the HP bar and loses
    // the kiosks (§4 phase 2). Dead and spectating are not fighting, even inside `fight`.
    const fighting = inFight && !v.dead && !spectating;

    setText(phaseLabel, "phase", PHASE_LABEL[phase] || "SHOWDOWN");
    setText(clockText, "clock", fmtClock(v.clock));

    setText(aliveChip, "alive", "👥 " + countOf(v.alive) + " alive");
    setText(groundChip, "ground", groundLabel(v));

    // The Warden tally means something only inside a fight, and it is the solo win
    // condition (§9.6), so it is worth a chip of its own while one is running.
    show(wardenChip, "wardenShown", inFight, "flex");
    if (inFight) {
      setText(wardenChip, "warden", "👁 " + wardensBroken(v.wardens) + "/"
        + wardensTotal(v.wardens) + " broken");
    }

    inObbyNow = !!v.inObby;
    const stage = typeof v.stageName === "string" ? v.stageName : "";
    show(stageChip, "stageShown", inObbyNow && !!stage, "flex");
    if (inObbyNow && stage) setText(stageChip, "stage", "🪜 " + stage);

    // HP (§8). The bar is up only while you are a living fighter, because outside `fight`
    // nobody has HP at all and a full bar in the lobby would be a lie.
    show(hpCard, "hpShown", fighting, "flex");
    if (fighting) {
      const hp = Math.max(0, Math.min(TUNE.HP_MAX, Math.round(Number(v.hp) || 0)));
      setText(hpNum, "hpNum", hp + " / " + TUNE.HP_MAX);
      const pct = TUNE.HP_MAX > 0 ? hp / TUNE.HP_MAX : 0;
      setProp(hpFill, "hpWidth", "width", (pct * 100).toFixed(1) + "%");
      setProp(hpFill, "hpColour", "background", pct > 0.6 ? HP_OK : pct > 0.25 ? HP_MID : HP_LOW);
    }

    setText(weaponChip, "weapon", weaponLabel(v));
    setText(pointsChip, "points", "🏆 " + countOf(v.points) + " Fighting Points · "
      + countOf(v.lifetimeWins) + " wins");

    // Spectating (§12.7): an empty target list is a real state and says so, rather than
    // leaving arrows that cycle nothing.
    show(spectateCard, "spectateShown", spectating, "flex");
    if (spectating) {
      const name = typeof v.spectateName === "string" && v.spectateName ? v.spectateName : "";
      setText(spectateName, "spectateName", name ? "🎥 " + name : "🎥 no one left to watch");
    }

    // The vote board. Live for exactly as long as round.js says the window is open, from
    // anywhere in the Place including the obby (§6).
    const voteOpen = !!v.voteOpen;
    show(voteCard, "voteShown", voteOpen, "flex");
    if (voteOpen) {
      const votes = v.votes && typeof v.votes === "object" ? v.votes : {};
      const mine = typeof v.myVote === "string" ? v.myVote : null;
      for (const row of voteRows) {
        setText(row.count, "vc:" + row.id, String(countOf(votes[row.id])));
        const isMine = mine === row.id;
        setText(row.mark, "vm:" + row.id, isMine ? "✓" : "");
        setProp(row.btn, "vb:" + row.id, "background", isMine ? VOTE_BG_MINE : VOTE_BG);
        setProp(row.btn, "vl:" + row.id, "borderColor", isMine ? GOLD : LINE);
      }
      // §6's closing countdown, derived from the phase clock rather than timed here: the
      // window is the first VOTE_WINDOW_S of INTERMISSION_S, so it shuts when the clock
      // reads the difference. It turns gold for the last five seconds, which is the
      // countdown the in-world board mirrors.
      const leftS = Math.max(0, Math.ceil((Number(v.clock) || 0)
        - (TUNE.INTERMISSION_S - TUNE.VOTE_WINDOW_S)));
      setText(voteClock, "voteClock", leftS > 0 ? "CLOSES IN " + leftS : "CLOSING");
      setProp(voteClock, "voteClockInk", "color", leftS <= 5 ? GOLD : INK);
    }

    // The kiosks and the obby arch: lobby furniture, so they go away while a fight runs.
    // A dead fighter keeps them, because death drops you out of the round and §12 lets you
    // spend the wait.
    show(lobbyCard, "lobbyShown", !fighting, "flex");
    if (!fighting) setText(obbyBtn, "obbyBtn", inObbyNow ? "🪜 LEAVE OBBY" : "🪜 OBBY");

    // The swing button (§8): up for a living fighter and nobody else. Hiding it also
    // releases a held press, so a death mid-swing cannot leave the repeat latched on.
    show(swingBtn, "swingShown", fighting, "flex");
    if (!fighting && swingHeld) releaseSwing();

    // Emotes are refused while you are a living fighter in `fight`, because three seconds
    // of Supernova hover is a free dodge, and refused while spectate mode is armed,
    // because §12.3 owns the per-tick teleport. game.js owns both refusals and plays the
    // `denied`; the dimming here is an honest hint, so the button still calls the handler.
    show(emoteBtn, "emoteShown", !spectating, "flex");
    setProp(emoteBtn, "emoteDim", "opacity", fighting ? "0.45" : "1");

    // Flight is the 1000-win unlock (§13.2) and Place-local. The button exists only once
    // it is earned, it goes away while spectate mode is armed for the same reason the
    // emote does (§12.3's ghost owns the per-tick teleport and two things fighting over it
    // would tear), and it shows its own on state so the hover never runs invisibly. It is
    // dimmed while a fight or the obby is refusing it: in the obby because a 1000-win
    // player could otherwise hover the column at 26/14 studs a second and touch the
    // `error` stage's pads without playing a stage, which is the one thing the obby gates.
    const canFly = !!v.canFly;
    show(flyBtn, "flyShown", canFly && !spectating, "flex");
    if (canFly && !spectating) {
      setProp(flyBtn, "flyBg", "background", v.flying ? ON_BG : OFF_BG);
      setProp(flyBtn, "flyLine", "borderColor", v.flying ? LINE_BRIGHT : LINE);
      setProp(flyBtn, "flyDim", "opacity", fighting || inObbyNow ? "0.45" : "1");
    }
  }

  function groundLabel(v) {
    const name = typeof v.mapName === "string" && v.mapName ? v.mapName : "";
    if (!name) return "🗺 no ground yet";
    // The view hands over a display name; the icon for it lives in MAPS, so match on
    // either spelling rather than keep a second copy of the three icons in this file.
    const row = MAPS.find((m) => m.name === name || m.id === name);
    return (row && row.icon ? row.icon : "🗺") + " " + name;
  }

  function weaponLabel(v) {
    const w = rowOf(v.weapon, weaponById);
    const s = rowOf(v.skin, skinById);
    // combat.heldWeapon() answers the fist row when your hands are empty (§7.1: nobody is
    // ever defenceless), so a null here means the view had nothing to say yet.
    const icon = w && w.icon ? w.icon : "🤜";
    const name = w && w.name ? w.name : "Bare hands";
    return icon + " " + name + (s && s.name ? " · " + s.name : "");
  }

  // =====================================================================================
  // dispose (§17.4). One root in, one root out.
  // =====================================================================================

  function dispose() {
    if (disposed) return;
    disposed = true;
    // An open prompt is dropped WITHOUT calling onPick: the Place is going away, and a
    // handler firing into a torn-down game.js is the kind of leak dispose exists to stop.
    live = null;
    swingHeld = false;
    toastLeft = 0;
    inObbyNow = false;
    // Every listener this module registered sits on a node inside root, so removing root
    // removes them with it. Nothing was ever added to window or to document.
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  return { update, prompt, dismissPrompt, toastLocal, dispose };
}
