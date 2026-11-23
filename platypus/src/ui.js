// ui.js - owns every DOM element of the game (except the cutscene overlays, see cinema.js): level select,
// level-1 intro, HUD (objective, hearts, coins, meters, quests, tricks, action prompt, rhythm track),
// speech bubble, level-complete card. The full API is documented in LEVELS.md.
// Everything timed is driven from update(dt) so it stays in step with the game loop.

const HEART =
  '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.7-9.6-9.3C.9 8.2 2.8 4.5 6.5 4.5c2.2 0 3.9 1.1 5.5 3.2 1.6-2.1 3.3-3.2 5.5-3.2 3.7 0 5.6 3.7 4.1 7.2C19.5 16.3 12 21 12 21z"/></svg>';

export function createUI() {
  const $ = (id) => document.getElementById(id);
  const el = {
    start: $("start"), levelBtn: $("levelBtn"), startTip: $("startTip"), black: $("black"), white: $("white"), tut: $("tut"),
    hud: $("hud"), hearts: $("hearts"), objective: $("objective"), objText: $("objText"), objKeys: $("objKeys"),
    foe: $("foe"), foeFill: $("foeFill"), bubble: $("bubble"), bubbleTxt: $("bubbleTxt"), bubbleMore: $("bubbleMore"),
    toast: $("toast"), stick: $("stick"), stickKnob: $("stick").firstElementChild,
    btnSting: $("btnSting"), btnZap: $("btnZap"), btnJump: $("btnJump"),
    victory: $("victory"), again: $("again"), hurt: $("hurt"), fatal: $("fatal"),
    levels: $("levels"), menuBtn: $("menuBtn"), vicKick: $("vicKick"), vicTitle: $("vicTitle"), vicSub: $("vicSub"),
    coins: $("coins"), coinTxt: $("coinTxt"), friend: $("friend"), friendFill: $("friendFill"), friendLab: $("friendLab"),
    excite: $("excite"), exciteFill: $("exciteFill"), exciteLab: $("exciteLab"), quests: $("quests"), questHead: $("questHead"),
    banner: $("banner"), bannerT: $("bannerT"), bannerS: $("bannerS"), call: $("call"), callT: $("callT"), callS: $("callS"),
    combo: $("combo"), comboX: $("comboX"), comboL: $("comboL"), floats: $("floats"), beat: $("beat"), beatHit: $("beatHit"),
    action: $("action"), actionKey: $("actionKey"), actionTxt: $("actionTxt"), tricks: $("tricks"),
    btnSlap: $("btnSlap"), btnHold: $("btnHold"), who: document.querySelector("#bubble .who"),
    lvl: Array.prototype.slice.call(document.querySelectorAll(".lvl")), trk: [],
  };
  const restart = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };

  let touch = false;
  let againCb = null, againAt = 0; // clicks on Continue are ignored for a moment after the card appears (spammed attacks must not dismiss it)

  // ---------- timeline (intro and other delayed UI things) ----------
  const timeline = [];
  function at(delay, fn) { timeline.push({ t: delay, fn }); }

  // ---------- level select ----------
  let levelCb = null, lockedCb = null, ready = false, menuOpen = true;
  const prog = { unlocked: 1, beaten: el.lvl.map(() => false) };
  function paintMenu(unlockN) {
    for (let i = 0; i < el.lvl.length; i++) {
      const b = el.lvl[i], n = i + 1;
      b.disabled = !ready;
      b.classList.remove("picked", "nope", "unlocking");
      b.classList.toggle("locked", n > prog.unlocked || n === unlockN);
      b.classList.toggle("beaten", !!prog.beaten[i]);
    }
  }
  for (const b of el.lvl) {
    b.addEventListener("click", () => {
      const n = +b.dataset.n;
      if (b.disabled || !menuOpen) return;
      if (b.classList.contains("locked")) {
        restart(b, "nope");
        el.startTip.textContent = "beat level " + (n - 1) + " to unlock level " + n;
        if (lockedCb) lockedCb(n);
        return;
      }
      if (levelCb) levelCb(n);
    });
  }
  el.again.addEventListener("click", () => { if (performance.now() < againAt) return; if (againCb) { const cb = againCb; againCb = null; cb(); } });

  function tipText() { return touch ? "tap a circle" : "click a circle"; }
  function setReady() {
    ready = true;
    for (const b of el.lvl) b.disabled = false;
    el.startTip.textContent = tipText();
  }
  // p: { unlocked: highest playable level, beaten: [bool per level] }
  // o: { unlock: n (play the unlock animation on circle n), fade: bool, onUnlock(n) (the moment the padlock pops) }
  function showMenu(p, o) {
    prog.unlocked = p.unlocked;
    for (let i = 0; i < prog.beaten.length; i++) prog.beaten[i] = !!p.beaten[i];
    const un = (o && o.unlock) || 0;
    menuOpen = true;
    paintMenu(un);
    el.start.classList.remove("go", "hidden", "fadein");
    if (o && o.fade) restart(el.start, "fadein");
    el.startTip.textContent = ready ? tipText() : "loading";
    document.body.classList.remove("playing", "dark", "cine", "nojump");
    el.hud.classList.remove("on");
    if (un) {
      at(0.9, () => {
        const b = el.lvl[un - 1];
        b.classList.remove("locked");
        b.classList.add("unlocking");
        if (o.onUnlock) o.onUnlock(un);
        el.startTip.textContent = "level " + un + " unlocked";
      });
      at(2.6, () => { el.lvl[un - 1].classList.remove("unlocking"); });
    }
  }
  // the picked circle swells and the others fade; the engine then fades to black on top
  function menuGo(n) {
    menuOpen = false;
    el.lvl[n - 1].classList.add("picked");
    el.start.classList.add("go");
  }
  function hideMenu() {
    menuOpen = false;
    el.start.classList.add("hidden");
    document.body.classList.add("playing");
  }
  // the plain black cover used between the menu and a level (cinema has its own fades for in-level use)
  function setBlack(on, instant) {
    el.black.style.transitionDuration = instant ? "0s" : "";
    el.black.classList.toggle("on", !!on);
  }

  // level 1's presentation: TUTORIAL on black, fade to white, the white clears to reveal the world.
  // Assumes the screen is already black (the level manager did that). cbs: { onBlack, onRise, onReveal, onDone }
  function playIntro(cbs) {
    el.tut.classList.remove("on", "off");
    if (cbs.onBlack) cbs.onBlack();
    at(0.35, () => el.tut.classList.add("on"));
    at(2.35, () => { el.tut.classList.add("off"); el.tut.classList.remove("on"); });
    at(2.55, () => { el.white.classList.add("on"); if (cbs.onRise) cbs.onRise(1.7); });
    at(4.35, () => {
      setBlack(false, true);
      el.tut.classList.remove("off");
      if (cbs.onReveal) cbs.onReveal();
    });
    at(4.55, () => { el.white.classList.add("slow"); el.white.classList.remove("on"); });
    at(5.65, () => el.hud.classList.add("on"));
    at(6.85, () => { el.white.classList.remove("slow"); if (cbs.onDone) cbs.onDone(); });
  }

  function whiteFlash(hold, mid) {
    el.white.classList.add("quick", "on");
    at(0.3 + (hold || 0), () => { if (mid) mid(); el.white.classList.remove("on"); });
    at(0.7 + (hold || 0), () => el.white.classList.remove("quick"));
  }

  // ---------- hearts ----------
  let heartCount = -1, heartMax = 0;
  function setHearts(n, max) {
    if (n === null || n === undefined) { if (heartMax) el.hearts.innerHTML = ""; heartMax = 0; heartCount = -1; return; }
    if (max !== heartMax) {
      heartMax = max;
      el.hearts.innerHTML = HEART.repeat(max);
      heartCount = -1;
    }
    if (n === heartCount) return;
    const lost = n < heartCount;
    heartCount = n;
    const kids = el.hearts.children;
    for (let i = 0; i < kids.length; i++) kids[i].classList.toggle("lost", i >= n);
    if (lost) {
      restart(el.hearts, "hit");
      el.hurt.classList.add("on");
      at(0.12, () => el.hurt.classList.remove("on"));
    }
  }

  // ---------- objective ----------
  function setObjective(text, keys) {
    if (!text) { el.objective.classList.remove("on", "done"); return; }
    el.objective.classList.remove("done");
    el.objText.textContent = text;
    el.objKeys.textContent = keys || "";
    el.objective.classList.add("on");
  }
  function objectiveDone() { el.objective.classList.add("done"); }

  // ---------- enemy bar ----------
  let foeFrac = -1;
  function setHumanHp(frac) {
    if (frac === null || frac === undefined) { el.foe.classList.remove("on"); foeFrac = -1; return; }
    const f = Math.max(0, Math.min(1, frac));
    if (f === foeFrac) return;
    foeFrac = f;
    el.foe.classList.add("on");
    el.foeFill.style.transform = "scaleX(" + f.toFixed(3) + ")";
  }

  // ---------- ability buttons + cooldowns ----------
  const cdLast = { sting: -1, zap: -1, slap: -1, hold: -1 };
  const cdEl = { sting: el.btnSting, zap: el.btnZap, slap: el.btnSlap, hold: el.btnHold };
  let zapUsable = null, zapReady = null;
  // which: "sting" | "zap" | "slap" | "hold"; frac 1 = just used .. 0 = ready
  function setCooldown(which, frac) {
    const q = Math.round(Math.max(0, Math.min(1, frac)) * 40) / 40;
    if (cdLast[which] === q) return;
    cdLast[which] = q;
    cdEl[which].style.setProperty("--cd", q);
  }
  function setZapUsable(usable, ready2) {
    if (usable !== zapUsable) { zapUsable = usable; el.btnZap.classList.toggle("unusable", !usable); }
    if (ready2 !== zapReady) { zapReady = ready2; el.btnZap.classList.toggle("ready", !!ready2); }
  }
  // which round buttons this level uses: { sting, zap, slap, hold, jump } (missing = hidden; jump defaults to shown on touch)
  function setAbilities(a) {
    a = a || {};
    el.btnSting.classList.toggle("hide", !a.sting);
    el.btnZap.classList.toggle("hide", !a.zap);
    el.btnSlap.classList.toggle("show", !!a.slap);
    el.btnHold.classList.toggle("show", !!a.hold);
    document.body.classList.toggle("nojump", a.jump === false);
  }
  function setHolding(on) { el.btnHold.classList.toggle("holding", !!on); }

  // ---------- toast ----------
  let toastT = 0;
  function hint(text, secs) {
    el.toast.textContent = text;
    el.toast.classList.add("on");
    toastT = secs || 2.4;
  }

  // ---------- coins ----------
  let coins = 0, coinsOn = false;
  function setCoins(n) {
    if (n === null || n === undefined) { coinsOn = false; el.coins.classList.remove("on"); return; }
    coins = n | 0; coinsOn = true;
    el.coinTxt.textContent = coins;
    el.coins.classList.add("on");
  }
  function addCoins(d) {
    coins += d | 0;
    if (coinsOn) { el.coinTxt.textContent = coins; restart(el.coins, "pop"); }
    return coins;
  }

  // ---------- meters ----------
  function meter(box, fill, lab) {
    let last = -1;
    return (frac, label) => {
      if (frac === null || frac === undefined) { box.classList.remove("on", "full", "hot", "pulse"); last = -1; return; }
      const f = Math.round(Math.max(0, Math.min(1, frac)) * 200) / 200;
      if (label !== undefined && label !== null) lab.textContent = label;
      box.classList.add("on");
      if (f === last) return;
      if (f > last && last >= 0) restart(box, "pulse");
      last = f;
      fill.style.transform = "scaleX(" + f + ")";
      box.classList.toggle("full", f >= 1);
      box.classList.toggle("hot", f >= 0.8);
    };
  }
  const setFriendship = meter(el.friend, el.friendFill, el.friendLab);
  const setExcitement = meter(el.excite, el.exciteFill, el.exciteLab);

  // ---------- quest checklist ----------
  const QMAX = 6;
  const qRows = [], qIds = [];
  for (let i = 0; i < QMAX; i++) {
    const r = document.createElement("div");
    r.className = "q";
    r.innerHTML = "<i></i><span></span>";
    el.quests.appendChild(r);
    qRows.push(r); qIds.push(null);
  }
  // list: [{ id, text, done?, current? }] (max 6) or null to hide; heading defaults to "To do"
  function setQuests(list, heading) {
    if (!list) { el.quests.classList.remove("on"); for (let i = 0; i < QMAX; i++) { qIds[i] = null; qRows[i].className = "q"; } return; }
    el.questHead.textContent = heading || "To do";
    for (let i = 0; i < QMAX; i++) {
      const q = list[i], r = qRows[i];
      qIds[i] = q ? q.id : null;
      r.className = q ? "q on" + (q.done ? " done" : "") + (q.current ? " cur" : "") : "q";
      if (q) r.lastChild.textContent = q.text;
    }
    el.quests.classList.add("on");
  }
  // patch: { text?, done?, current? }
  function setQuest(id, patch) {
    const i = qIds.indexOf(id);
    if (i < 0) return;
    const r = qRows[i];
    if (patch.text !== undefined) r.lastChild.textContent = patch.text;
    if (patch.current !== undefined) r.classList.toggle("cur", !!patch.current);
    if (patch.done !== undefined) {
      if (patch.done && !r.classList.contains("done")) restart(r, "now");
      r.classList.toggle("done", !!patch.done);
      if (patch.done) r.classList.remove("cur");
    }
  }

  // ---------- contextual action prompt ----------
  let actionLabel = null;
  function setAction(label, key) {
    label = label || null;
    if (label === actionLabel) return;
    actionLabel = label;
    if (!label) { el.action.classList.remove("on"); return; }
    el.actionTxt.textContent = label;
    el.actionKey.textContent = touch ? "tap" : (key || "E");
    el.action.classList.add("on");
  }

  // ---------- tricks ----------
  // 8 slots: 1-4 are every show's tricks; 5-8 only appear in Level 4 hard mode
  const TRICK_SLOTS = 8;
  for (let i = 0; i < TRICK_SLOTS; i++) {
    const b = document.createElement("button");
    b.className = "trk l" + i;
    b.innerHTML = '<span class="k">' + (i + 1) + "</span><span></span>";
    el.tricks.appendChild(b);
    el.trk.push(b);
  }
  let tricksOn = false, scatter = false;
  // Level 4 hard mode: the buttons sit at these fixed fractions of the safe area and never move during the show
  const SCATTER = [[0.12, 0.30], [0.88, 0.30], [0.22, 0.55], [0.78, 0.55], [0.35, 0.22], [0.65, 0.22], [0.08, 0.72], [0.92, 0.72]];
  const BTN = 64, half = BTN / 2;
  const overlaps = (x, y, r) => r && r.width > 0 && x + half + 6 > r.left && x - half - 6 < r.right && y + half + 6 > r.top && y - half - 6 < r.bottom;
  function layoutScatter() {
    if (!scatter) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const top = touch ? 64 : 96, bottom = vh - 12;
    const lane = el.beat.classList.contains("on") ? el.beat.getBoundingClientRect() : null;
    const coin = el.coins.classList.contains("on") ? el.coins.getBoundingClientRect() : null;
    const obj = el.objective.classList.contains("on") ? el.objective.getBoundingClientRect() : null;
    // the centre 30 % (the pool show) stays clear
    const mid = { left: vw * 0.35, right: vw * 0.65, top: vh * 0.35, bottom: vh * 0.65, width: 1 };
    const placed = [];
    const clash = (x, y) => { for (const p of placed) if (Math.abs(p.x - x) < BTN + 8 && Math.abs(p.y - y) < BTN + 8) return true; return false; };
    for (let i = 0; i < TRICK_SLOTS; i++) {
      const b = el.trk[i];
      let x = Math.max(half + 8, Math.min(vw - half - 8, SCATTER[i][0] * vw));
      let y = Math.max(top + half, Math.min(bottom - half, top + SCATTER[i][1] * (bottom - top)));
      // nudge up (then sideways) until it clears the lane, the coin counter, the objective and the centre
      for (let k = 0; k < 40 && (overlaps(x, y, lane) || overlaps(x, y, coin) || overlaps(x, y, obj) || overlaps(x, y, mid) || clash(x, y)); k++) {
        if (y - 12 > top + half) y -= 12; else x += x < vw / 2 ? 14 : -14;
      }
      placed.push({ x, y });
      b.style.left = Math.round(x) + "px"; b.style.top = Math.round(y) + "px";
    }
  }
  window.addEventListener("resize", () => { if (scatter) layoutScatter(); });
  // list: up to 8 of { label, enabled? } (index = trick slot = key 1..8; a null entry hides that slot), or null to hide all
  // o: { layout: "scatter" } spreads the buttons over the screen at fixed places (Level 4 hard mode)
  function setTricks(list, o) {
    tricksOn = !!list;
    const sc = !!(list && o && o.layout === "scatter");
    if (sc !== scatter) {
      scatter = sc;
      el.tricks.classList.toggle("scatter", sc);
      if (!sc) for (let i = 0; i < TRICK_SLOTS; i++) { el.trk[i].style.left = ""; el.trk[i].style.top = ""; }
    }
    el.tricks.classList.toggle("on", tricksOn);
    for (let i = 0; i < TRICK_SLOTS; i++) {
      const t = list && list[i], b = el.trk[i];
      b.className = "trk l" + i + (t ? " on" + (t.enabled === false ? " off" : "") : "");
      if (t) b.lastChild.textContent = t.label;
    }
    if (sc) { layoutScatter(); at(0.05, layoutScatter); }
  }
  // st: { enabled?, want? } ("want" = glowing: the trick being asked for)
  function setTrickState(i, st) {
    const b = el.trk[i];
    if (!b) return;
    if (st.enabled !== undefined) b.classList.toggle("off", !st.enabled);
    if (st.want !== undefined) b.classList.toggle("want", !!st.want);
  }
  function flashTrick(i, good) { if (el.trk[i]) restart(el.trk[i], good === false ? "bad" : "good"); }

  let comboN = -1;
  // n < 2 (or null) hides it
  function setCombo(n, label) {
    if (!n || n < 2) { el.combo.classList.remove("on"); comboN = -1; return; }
    if (n === comboN) return;
    comboN = n;
    el.comboX.textContent = "x" + n;
    el.comboL.textContent = label || "combo";
    el.combo.classList.add("on");
    restart(el.combo, "bump");
  }
  // big centre call-out: call("BACKFLIP!", "+12 coins", "perfect" | "good" | "miss" | undefined)
  function call(title, sub, rating) {
    el.callT.textContent = title;
    el.callS.textContent = sub || "";
    el.call.className = rating || "";
    restart(el.call, "on");
  }
  // large calm banner for story moments ("YOU ARE FRIENDS", "DAY 2")
  let bannerT = 0;
  function banner(title, sub, secs) {
    el.bannerT.textContent = title;
    el.bannerS.textContent = sub || "";
    el.banner.classList.add("on");
    bannerT = secs || 3.5;
  }

  // ---------- floating numbers (pooled) ----------
  const FL = [];
  for (let i = 0; i < 10; i++) {
    const d = document.createElement("div");
    d.className = "float";
    el.floats.appendChild(d);
    FL.push({ d, t: 0, x: 0, y: 0 });
  }
  let flNext = 0;
  // kind: "coin" (default, gold) | "heart" | "plain"; sx, sy in CSS pixels (see ctx.project)
  function floatText(text, sx, sy, kind) {
    const f = FL[flNext];
    flNext = (flNext + 1) % FL.length;
    f.d.textContent = text;
    f.d.className = "float" + (kind && kind !== "coin" ? " " + kind : "");
    f.t = 1.1; f.x = sx; f.y = sy;
  }

  // ---------- rhythm track ----------
  const NOTES = [];
  for (let i = 0; i < 16; i++) {
    const d = document.createElement("div");
    d.className = "note";
    el.beat.appendChild(d);
    NOTES.push({ d, on: false, lane: 0, t: 0, lead: 1, gone: 0 });
  }
  let beatW = 440, beatOn = false;
  const beat = {
    show(on) {
      beatOn = !!on;
      el.beat.classList.toggle("on", beatOn);
      if (beatOn) beatW = (el.beat.offsetWidth || 500) - 60;
      else beat.clear();
    },
    // a note that reaches the hit circle in `lead` seconds; returns its id (0..15) or -1 when the pool is full
    spawn(lane, lead, label) {
      for (let i = 0; i < NOTES.length; i++) {
        const n = NOTES[i];
        if (n.on) continue;
        n.on = true; n.lane = lane; n.t = lead; n.lead = lead; n.gone = 0;
        n.d.className = "note on l" + lane;
        n.d.textContent = label === undefined ? String(lane + 1) : label;
        n.d.style.transform = "translate3d(" + beatW + "px,0,0)";
        return i;
      }
      return -1;
    },
    // the level judged this note: ok = hit (pops), false = missed (greys out)
    resolve(id, ok) {
      const n = NOTES[id];
      if (!n || !n.on) return;
      n.gone = 0.3;
      n.d.classList.add(ok ? "hitok" : "missed");
      if (ok) restart(el.beatHit, "flash");
    },
    // seconds until note `id` reaches the hit circle (negative = late), NaN when the id is free
    timeLeft(id) { const n = NOTES[id]; return n && n.on ? n.t : NaN; },
    clear() { for (const n of NOTES) { n.on = false; n.d.className = "note"; } },
  };

  // ---------- speech bubble ----------
  const sp = { text: "", shown: 0, pos: 0, typing: false, hold: 0, active: false, blipT: 0, onBlip: null, onTyped: null, onDone: null };
  const CPS = 34;
  let spWho = "Wizard Wobble";

  // o: { who (speaker name, default "Wizard Wobble"), onBlip(ch), onTyped(), onDone() }
  function say(text, o) {
    sp.text = text;
    sp.pos = 0;
    sp.shown = 0;
    sp.typing = true;
    sp.active = true;
    sp.blipT = 0;
    sp.hold = 1.5 + text.length * 0.04;
    sp.onBlip = (o && o.onBlip) || null;
    sp.onTyped = (o && o.onTyped) || null;
    sp.onDone = (o && o.onDone) || null;
    const who = (o && o.who) || "Wizard Wobble";
    if (who !== spWho) { spWho = who; el.who.textContent = who; }
    el.bubbleTxt.textContent = "";
    el.bubble.classList.add("on");
    el.bubble.classList.remove("waiting");
  }
  function finishTyping() {
    sp.typing = false;
    sp.shown = sp.text.length;
    el.bubbleTxt.textContent = sp.text;
    el.bubble.classList.add("waiting");
    const f = sp.onTyped;
    sp.onTyped = null;
    if (f) f();
  }
  function endLine() {
    const f = sp.onDone;
    sp.onDone = null;
    sp.active = false;
    if (f) f();
    if (!sp.active) el.bubble.classList.remove("on", "waiting");
  }
  function advance() {
    if (!sp.active) return false;
    if (sp.typing) finishTyping();
    else endLine();
    return true;
  }
  function clearSpeech() {
    sp.active = false;
    sp.typing = false;
    sp.onDone = sp.onTyped = sp.onBlip = null;
    el.bubble.classList.remove("on", "waiting");
  }
  el.bubble.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); advance(); });

  let bx = -9999, by = -9999, bPinned = null, bw = 380, bh = 110, measureT = 0;
  let lastTx = NaN, lastTy = NaN;
  function setBubbleAnchor(sx, sy, onScreen, vw, vh) {
    if (!sp.active) return;
    let x, y, pinned;
    // narrow screens: the objective pill sits one row lower (see the max-width: 700px rule)
    const topLimit = (touch ? 64 : 96) + (vw <= 700 ? 40 : 0);
    if (onScreen && sy - bh - 16 >= topLimit && sy < vh - 120) {
      // room above the head: classic bubble with a tail
      x = Math.max(bw / 2 + 10, Math.min(vw - bw / 2 - 10, sx));
      y = sy - 16;
      pinned = Math.abs(x - sx) > bw * 0.42;
    } else if (onScreen && vw > bw * 2 + 160) {
      // no room above: sit beside the head so the face stays visible
      const side = sx > vw * 0.5 ? -1 : 1;
      x = Math.max(bw / 2 + 10, Math.min(vw - bw / 2 - 10, sx + side * (bw / 2 + 90)));
      y = Math.max(topLimit + bh, Math.min(vh - 170, sy + bh + 30));
      pinned = true;
    } else {
      x = vw / 2;
      y = topLimit + bh + 14;
      pinned = true;
    }
    if (bx < -9000) { bx = x; by = y; } else { bx += (x - bx) * 0.25; by += (y - by) * 0.25; }
    const tx = Math.round((bx - bw / 2) * 2) / 2, ty = Math.round((by - bh) * 2) / 2;
    if (tx !== lastTx || ty !== lastTy) {
      lastTx = tx; lastTy = ty;
      el.bubble.style.transform = "translate3d(" + tx + "px," + ty + "px,0)";
    }
    if (pinned !== bPinned) { bPinned = pinned; el.bubble.classList.toggle("pinned", pinned); }
  }

  // ---------- level complete card ----------
  // o: { kicker, title (may contain <br>), sub, button } - every field optional (defaults: level 1's card)
  function showComplete(o, cb) {
    o = o || {};
    el.vicKick.textContent = o.kicker || "TUTORIAL";
    el.vicTitle.innerHTML = o.title || "LEVEL 1<br>COMPLETE";
    el.vicSub.textContent = o.sub === undefined ? "The Cushion Fields are safe again." : o.sub;
    el.again.textContent = o.button || "Continue";
    againCb = cb;
    againAt = performance.now() + 1500;
    el.again.style.opacity = "0.35"; setTimeout(() => { el.again.style.opacity = ""; }, 1500);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    clearSpeech();
    el.hud.classList.remove("on");
    el.victory.classList.add("on");
  }
  function showVictory(cb) { showComplete(null, cb); }
  function hideVictory() {
    if (el.victory.classList.contains("on") && document.body.classList.contains("playing")) el.hud.classList.add("on");
    el.victory.classList.remove("on");
    againCb = null;
  }

  // ---------- whole-HUD helpers ----------
  function showHud(on) { el.hud.classList.toggle("on", !!on); }
  function setDark(on) { document.body.classList.toggle("dark", !!on); }
  // back to a blank HUD: called by the engine whenever a level is entered or left
  function resetHud() {
    timeline.length = 0;
    clearSpeech();
    bx = -9999;
    setObjective(null); setHumanHp(null); setHearts(null); setCoins(null); setFriendship(null); setExcitement(null);
    setQuests(null); setAction(null); setTricks(null); setCombo(0); setAbilities(null); setHolding(false);
    setCooldown("sting", 0); setCooldown("zap", 0); setCooldown("slap", 0); setCooldown("hold", 0);
    setZapUsable(true, false);
    beat.show(false);
    for (const f of FL) { f.t = 0; f.d.style.opacity = "0"; }
    el.banner.classList.remove("on"); bannerT = 0;
    el.call.classList.remove("on");
    el.toast.classList.remove("on"); toastT = 0;
    el.victory.classList.remove("on"); againCb = null;
    el.white.classList.remove("on", "slow", "quick");
    el.tut.classList.remove("on", "off");
    el.hurt.classList.remove("on");
    setDark(false);
    document.body.classList.remove("pickhover", "nojump");
  }

  // ---------- touch ----------
  function enableTouch() {
    if (touch) return;
    touch = true;
    document.body.classList.add("touch");
    el.bubbleMore.innerHTML = "tap &rsaquo;";
    if (ready && menuOpen) el.startTip.textContent = tipText();
  }
  function setStick(active, cx, cy, kx, ky) {
    el.stick.classList.toggle("active", active);
    el.stick.style.transform = "translate3d(" + cx + "px," + cy + "px,0)";
    el.stickKnob.style.transform = "translate3d(" + kx + "px," + ky + "px,0)";
  }

  function fatal(msg) {
    el.fatal.style.display = "grid";
    el.fatal.textContent = msg;
  }

  // ---------- per-frame ----------
  function update(dt) {
    for (let i = 0; i < timeline.length; i++) {
      const e = timeline[i];
      e.t -= dt;
      if (e.t <= 0) {
        timeline.splice(i, 1);
        i--;
        e.fn();
      }
    }
    if (toastT > 0) {
      toastT -= dt;
      if (toastT <= 0) el.toast.classList.remove("on");
    }
    if (bannerT > 0) {
      bannerT -= dt;
      if (bannerT <= 0) el.banner.classList.remove("on");
    }
    for (let i = 0; i < FL.length; i++) {
      const f = FL[i];
      if (f.t <= 0) continue;
      f.t -= dt;
      const k = 1 - Math.max(0, f.t) / 1.1;
      f.d.style.transform = "translate3d(" + Math.round(f.x) + "px," + Math.round(f.y - 20 - k * 54) + "px,0) translate(-50%,-50%) scale(" + (k < 0.15 ? 0.6 + k * 3.3 : 1.1).toFixed(2) + ")";
      f.d.style.opacity = f.t <= 0 ? "0" : (k > 0.7 ? (1 - k) / 0.3 : 1).toFixed(2);
    }
    if (beatOn) {
      for (let i = 0; i < NOTES.length; i++) {
        const n = NOTES[i];
        if (!n.on) continue;
        n.t -= dt;
        if (n.gone > 0) { n.gone -= dt; if (n.gone <= 0) { n.on = false; n.d.className = "note"; } continue; }
        if (n.t < -0.6) { n.on = false; n.d.className = "note"; continue; }
        n.d.style.transform = "translate3d(" + Math.round((n.t / n.lead) * beatW) + "px,0,0)";
      }
    }
    if (sp.active) {
      measureT -= dt;
      if (measureT <= 0) { measureT = 0.4; bw = el.bubble.offsetWidth || bw; bh = el.bubble.offsetHeight || bh; }
      if (sp.typing) {
        sp.pos += dt * CPS;
        const n = Math.min(sp.text.length, sp.pos | 0);
        if (n !== sp.shown) {
          sp.shown = n;
          el.bubbleTxt.textContent = sp.text.slice(0, n);
        }
        sp.blipT -= dt;
        if (sp.blipT <= 0) {
          const ch = sp.text.charAt(Math.max(0, n - 1));
          if (ch !== " " && ch !== "." && ch !== "," && sp.onBlip) sp.onBlip(ch);
          sp.blipT = ch === "." || ch === "!" || ch === "?" ? 0.2 : 0.095;
        }
        if (n >= sp.text.length) finishTyping();
      } else {
        sp.hold -= dt;
        if (sp.hold <= 0) endLine();
      }
    }
  }

  return {
    el, update, fatal, enableTouch, setStick,
    // level select
    setReady, showMenu, hideMenu, menuGo, setBlack,
    onLevel(cb) { levelCb = cb; }, onLocked(cb) { lockedCb = cb; },
    // level 1 presentation
    playIntro, whiteFlash,
    // HUD
    showHud, resetHud, setDark, after: at,
    setHearts, setObjective, objectiveDone, setHumanHp, setCooldown, setZapUsable, setAbilities, setHolding,
    hint, toast: hint, banner,
    say, advance, clearSpeech, setBubbleAnchor, speaking() { return sp.active; },
    setCoins, addCoins, get coins() { return coins; },
    setFriendship, setExcitement, setQuests, setQuest, setAction,
    setTricks, setTrickState, flashTrick, setCombo, call, floatText, beat, layoutTricks: layoutScatter,
    showComplete, showVictory, hideVictory,
    get touch() { return touch; },
    get tricksOn() { return tricksOn; },
    get actionOn() { return actionLabel !== null; },
  };
}

// =====================================================================================================
// extendMenu: the main-screen NAME and TROPHY buttons, the name dialog, the leaderboards panel, the Level 4
// NORMAL / HARD choice, the run clock in the HUD and the run result (LEVELS3.md A2, A3, A5, A7).
// deps: { progress, online, checkName, nameHint, randomName, formatMs, click() }
// =====================================================================================================
const TAB_COLOR = ["#9aa0ad", "#3c8cff", "#3c8cff", "#3c8cff", "#eef1f8", "#2fb466", "#2fb466", "#2fb466", "#e2463c", "#e2463c", "#e8b23a", "#ff6a1a", "#8b4dff"];
const TAB_DARK = [false, false, false, false, true, false, false, false, false, false, true, false, false];
const PLATY_SVG = '<svg viewBox="0 0 104 64" aria-hidden="true"><ellipse cx="52" cy="58" rx="34" ry="4" fill="#ece9f5"/>' +
  '<path d="M20 40c0-12 12-20 30-20s30 6 30 16-10 16-30 16H34c-8 0-14-4-14-12z" fill="#8a6446"/>' +
  '<path d="M78 34c6-2 14-1 20 3 2 2 0 5-3 5-6 0-12-1-17-3z" fill="#3a3540"/><circle cx="72" cy="30" r="2.2" fill="#1d1b22"/>' +
  '<path d="M22 42c-8 2-14 6-16 10 6 1 14-1 20-5z" fill="#6e4e36"/><path d="M36 52l-2 6M60 52l2 6" stroke="#5a3f2c" stroke-width="4" stroke-linecap="round"/></svg>';

export function extendMenu(ui, deps) {
  const { progress, online, checkName, nameHint, randomName, formatMs } = deps;
  const click = () => { try { if (deps.click) deps.click(); } catch (e) { /* ignore */ } };
  const $ = (id) => document.getElementById(id);
  const start = $("start");
  const mk = (parent, tag, attrs, html) => {
    const d = document.createElement(tag);
    if (attrs) for (const k in attrs) { if (k === "cls") d.className = attrs[k]; else d.setAttribute(k, attrs[k]); }
    if (html !== undefined) d.innerHTML = html;
    if (parent) parent.appendChild(d);
    return d;
  };
  const ENT = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ENT[c]);

  // ---------- settings (per device) ----------
  const SET_KEY = "platypus.settings.v1";
  const settings = { showTimer: true };
  try { const o = JSON.parse(window.localStorage.getItem(SET_KEY) || "null"); if (o && o.showTimer === false) settings.showTimer = false; } catch (e) { /* ignore */ }
  function saveSettings() { try { window.localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } }

  // ---------- main-screen buttons ----------
  const nameBtn = mk(start, "button", { id: "nameBtn", cls: "mbtn", type: "button", "aria-label": "Your name" }, '<span class="ico" aria-hidden="true">&#9998;</span><span class="nm"></span>');
  const trophyBtn = mk(start, "button", { id: "trophyBtn", cls: "mbtn", type: "button", "aria-label": "Leaderboards" }, '<span class="ico" aria-hidden="true">&#127942;</span><span class="lab">Leaderboards</span>');
  const nameBtnTxt = nameBtn.querySelector(".nm");
  function refresh() {
    const n = online.name;
    nameBtnTxt.textContent = n || "Pick a name";
    nameBtn.classList.toggle("empty", !n);
    const l4 = ui.el.lvl[3];
    if (l4) l4.classList.toggle("hardOn", !!progress.l4hardUnlocked);
  }
  nameBtn.addEventListener("click", (e) => { e.stopPropagation(); click(); openNameDialog(); });
  trophyBtn.addEventListener("click", (e) => { e.stopPropagation(); click(); openBoards(); });
  const showMenu0 = ui.showMenu;
  ui.showMenu = (p, o) => { showMenu0(p, o); refresh(); closePick(); };

  // ---------- the name dialog ----------
  const nameDlg = mk(document.body, "div", { id: "nameDlg", cls: "modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "nameTtl" },
    '<div class="mcard"><h2 id="nameTtl">YOUR NAME</h2><p class="sub" id="nameSub">This is how you show up on the leaderboards.</p>' +
    '<div class="nrow"><input id="nameIn" type="text" maxlength="16" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done" aria-describedby="nameHint" placeholder="Your name">' +
    '<button id="nameDice" type="button" aria-label="Random name">&#127922;</button></div>' +
    '<div id="nameHint" aria-live="polite">3 to 16 letters</div>' +
    '<div class="mbtns"><button class="sec" id="nameCancel" type="button">Cancel</button><button class="pri" id="nameSave" type="button">Save</button></div></div>');
  const nameIn = $("nameIn"), nameHintEl = $("nameHint"), nameSave = $("nameSave"), nameSub = $("nameSub");
  let nameCb = null, nameBusy = false, nameFocusBack = null;
  function hintName(text, kind) {
    nameHintEl.textContent = text;
    nameHintEl.className = kind || "";
    nameIn.classList.toggle("bad", kind === "bad");
  }
  function liveCheck() {
    const v = nameIn.value;
    if (!v.trim()) { hintName("3 to 16 letters", ""); nameSave.disabled = true; return null; }
    const c = checkName(v);
    if (c.ok) { hintName("Looks good!", "good"); nameSave.disabled = false; return c; }
    hintName(nameHint(c.reason), c.reason === "short" ? "" : "bad");
    nameSave.disabled = true;
    return null;
  }
  // o: { message (a line in the hint, red), onDone(name | null) }
  function openNameDialog(o) {
    nameCb = (o && o.onDone) || null;
    nameFocusBack = document.activeElement;
    nameSub.textContent = online.enabled ? "This is how you show up on the leaderboards. You can change it any time." : "Saved on this device. You can change it any time.";
    nameIn.value = online.name || "";
    nameBusy = false;
    nameDlg.classList.add("on");
    liveCheck();
    if (o && o.message) hintName(o.message, "bad");
    setTimeout(() => { try { nameIn.focus(); nameIn.select(); } catch (e) { /* ignore */ } }, 30);
  }
  function closeName(res) {
    if (!nameDlg.classList.contains("on")) return;
    nameDlg.classList.remove("on");
    nameBusy = false;
    refresh();
    const cb = nameCb; nameCb = null;
    try { if (nameFocusBack && nameFocusBack.focus) nameFocusBack.focus(); } catch (e) { /* ignore */ }
    if (cb) cb(res || null);
  }
  async function saveName() {
    if (nameBusy) return;
    const c = liveCheck();
    if (!c) return;
    click();
    if (!online.enabled) { online.setLocalName(c.name); closeName(c.name); return; }
    nameBusy = true; nameSave.disabled = true;
    hintName("Checking...", "");
    const r = await online.claimName(c.name);
    nameBusy = false;
    if (!nameDlg.classList.contains("on")) return;
    if (r.ok) { hintName("Saved!", "good"); setTimeout(() => closeName(r.name), 350); return; }
    nameSave.disabled = false;
    if (r.reason === "taken") hintName("Someone already has that name - try another", "bad");
    else if (r.reason === "rude") hintName("Let's pick a kinder name", "bad");
    else if (r.reason === "slow") hintName("Wait a few seconds, then try again", "bad");
    else if (r.reason === "network" || r.reason === "offline") { hintName("Saved on this device - we'll try again later", "good"); setTimeout(() => closeName(c.name), 1600); }
    else hintName("3 to 16 letters", "bad");
  }
  nameIn.addEventListener("input", liveCheck);
  nameIn.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); saveName(); }
    else if (e.key === "Escape") { e.preventDefault(); closeName(null); }
  });
  nameIn.addEventListener("keyup", (e) => e.stopPropagation());
  $("nameDice").addEventListener("click", () => { click(); nameIn.value = randomName(); liveCheck(); nameIn.focus(); });
  nameSave.addEventListener("click", saveName);
  $("nameCancel").addEventListener("click", () => { click(); closeName(null); });
  nameDlg.addEventListener("pointerdown", (e) => { if (e.target === nameDlg) closeName(null); });

  // ---------- the leaderboards ----------
  const boards = mk(document.body, "div", { id: "boards", cls: "modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "boardsTtl" },
    '<div class="mcard"><div class="hd"><h2 id="boardsTtl">LEADERBOARDS</h2><button class="close" type="button" aria-label="Close">&#10005;</button></div>' +
    '<div class="btabs" role="tablist"></div><div class="bbody" role="tabpanel"></div>' +
    '<div class="bfoot"><span class="mine"></span><label><input type="checkbox" class="showT"> Show timer in levels</label></div></div>');
  const tabsEl = boards.querySelector(".btabs"), body = boards.querySelector(".bbody"), mine = boards.querySelector(".bfoot .mine"), showT = boards.querySelector(".showT");
  const tabs = [];
  for (let n = 1; n <= 13; n++) {
    const b = mk(tabsEl, "button", { cls: "btab" + (TAB_DARK[n - 1] ? " dk" : ""), type: "button", role: "tab", "aria-label": n === 4 ? "Level 4 coins" : "Level " + n }, n === 4 ? "&#129689;4" : String(n));
    b.style.setProperty("--tc", TAB_COLOR[n - 1]);
    b.dataset.n = n;
    b.addEventListener("click", () => { click(); showTab(n); });
    tabs.push(b);
  }
  tabsEl.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault(); e.stopPropagation();
    const n = Math.max(1, Math.min(13, curTab + (e.key === "ArrowRight" ? 1 : -1)));
    showTab(n); tabs[n - 1].focus();
  });
  boards.querySelector(".close").addEventListener("click", () => { click(); closeBoards(); });
  boards.addEventListener("pointerdown", (e) => { if (e.target === boards) closeBoards(); });
  showT.addEventListener("change", () => { settings.showTimer = !!showT.checked; saveSettings(); });

  const cache = Object.create(null);
  let curTab = 1, loadGen = 0, boardsFocusBack = null;
  function myBest(n) {
    if (n === 4) {
      const a = progress.l4bestCoins, h = progress.l4bestHardCoins;
      if (!a && !h) return "Your best: no show yet";
      return "Your best: " + Math.max(a, h) + " coins" + (h > a ? " (hard)" : "");
    }
    const b = progress.best(n);
    return b ? "Your best: " + formatMs(b) : "Your best: not finished yet";
  }
  function skeleton() {
    let h = '<table class="btable"><tbody>';
    for (let i = 0; i < 8; i++) h += '<tr class="sk"><td style="width:42px"><span></span></td><td><span style="width:' + (50 + ((i * 37) % 40)) + '%"></span></td><td style="width:90px"><span></span></td></tr>';
    return h + "</tbody></table>";
  }
  function rankDisc(r) { return '<span class="rk' + (r <= 3 ? " g" + r : "") + '">' + r + "</span>"; }
  function renderRows(n, d) {
    const coinsTab = n === 4;
    const myName = (online.name || "").toLowerCase();
    if (!d.rows.length) return '<div class="bnote">' + PLATY_SVG + "<b>" + (coinsTab ? "No shows yet" : "No times yet") + "</b>Be the first!</div>";
    let h = '<table class="btable"><thead><tr><th>#</th><th>NAME</th><th class="r">' + (coinsTab ? "COINS" : "TIME") + "</th></tr></thead><tbody>";
    let meShown = false;
    for (const r of d.rows) {
      const isMe = !!myName && r.name.toLowerCase() === myName;
      if (isMe) meShown = true;
      h += "<tr" + (isMe ? ' class="me"' : "") + "><td>" + rankDisc(r.rank) + '</td><td class="nm">' + esc(r.name) + (isMe ? " (you)" : "") + '</td><td class="r">' +
        (coinsTab ? r.coins + (r.hard ? '<span class="hardb">HARD</span>' : "") : formatMs(r.ms)) + "</td></tr>";
    }
    if (d.me && !meShown) {
      h += '<tr class="me pin"><td>' + rankDisc(d.me.rank) + '</td><td class="nm">You</td><td class="r">' +
        (coinsTab ? d.me.coins + (d.me.hard ? '<span class="hardb">HARD</span>' : "") : formatMs(d.me.ms)) + "</td></tr>";
    }
    return h + "</tbody></table>";
  }
  async function showTab(n) {
    curTab = n;
    for (const t of tabs) { const on = +t.dataset.n === n; t.classList.toggle("on", on); t.setAttribute("aria-selected", on ? "true" : "false"); }
    try { tabs[n - 1].scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) { /* ignore */ }
    mine.textContent = myBest(n);
    const title = '<div class="btitle">' + (n === 4 ? "Level 4: most coins in one show" : "Level " + n + ": fastest times") + "</div>";
    if (!online.enabled) {
      body.innerHTML = title + '<div class="bnote off">' + PLATY_SVG + "<b>Leaderboards coming soon</b>Your own best is saved below.</div>";
      return;
    }
    const c = cache[n];
    if (c && performance.now() - c.t < 60000) { body.innerHTML = title + renderRows(n, c.d); return; }
    const g = ++loadGen;
    body.innerHTML = title + skeleton();
    const d = n === 4 ? await online.topCoins() : await online.topTimes(n);
    if (g !== loadGen || !boards.classList.contains("on")) return;
    if (!d.ok) {
      body.innerHTML = title + '<div class="bnote err">' + PLATY_SVG + "<b>Couldn&#39;t load - try again</b>Check the internet connection.<br><button class=\"bbtn retry\" type=\"button\">Try again</button></div>";
      const rb = body.querySelector(".retry");
      if (rb) rb.addEventListener("click", () => { click(); showTab(n); });
      return;
    }
    cache[n] = { t: performance.now(), d };
    body.innerHTML = title + renderRows(n, d);
  }
  function openBoards(n) {
    boardsFocusBack = document.activeElement;
    showT.checked = settings.showTimer;
    boards.classList.add("on");
    showTab(n >= 1 && n <= 13 ? n : curTab || 1);
    setTimeout(() => { try { tabs[curTab - 1].focus(); } catch (e) { /* ignore */ } }, 30);
  }
  function closeBoards() {
    if (!boards.classList.contains("on")) return;
    boards.classList.remove("on");
    loadGen++;
    try { if (boardsFocusBack && boardsFocusBack.focus) boardsFocusBack.focus(); } catch (e) { /* ignore */ }
  }
  function invalidate(n) { if (n) delete cache[n]; else for (const k in cache) delete cache[k]; }

  // ---------- Level 4: NORMAL or HARD ----------
  const pick = mk(document.body, "div", { id: "l4pick", role: "group", "aria-label": "Level 4 mode" },
    '<button class="nrm" type="button"><span class="k">1</span>NORMAL</button><button class="hrd" type="button"><span class="k">2</span>HARD &#128293;</button>');
  let pickCb = null;
  function closePick() { pick.classList.remove("on"); pickCb = null; }
  function choosePick(hard) { const cb = pickCb; closePick(); if (cb) { click(); cb(hard); } }
  pick.firstChild.addEventListener("click", (e) => { e.stopPropagation(); choosePick(false); });
  pick.lastChild.addEventListener("click", (e) => { e.stopPropagation(); choosePick(true); });
  // cb(hard: bool) once a mode is picked (never called when it is closed instead)
  function chooseL4(cb) {
    const r = ui.el.lvl[3].getBoundingClientRect();
    pickCb = cb;
    pick.classList.add("on");
    const w = pick.offsetWidth || 220;
    const x = Math.max(w / 2 + 8, Math.min(window.innerWidth - w / 2 - 8, r.left + r.width / 2));
    let y = r.bottom + 18;
    if (y + 56 > window.innerHeight) y = r.top - 66;
    pick.style.left = x + "px"; pick.style.top = y + "px";
    setTimeout(() => { try { pick.firstChild.focus(); } catch (e) { /* ignore */ } }, 30);
  }
  window.addEventListener("keydown", (e) => {
    if (pick.classList.contains("on")) {
      if (e.code === "Digit1" || e.code === "Numpad1") { e.preventDefault(); e.stopPropagation(); choosePick(false); }
      else if (e.code === "Digit2" || e.code === "Numpad2") { e.preventDefault(); e.stopPropagation(); choosePick(true); }
      else if (e.key === "Escape") { e.preventDefault(); closePick(); }
    } else if (e.key === "Escape") {
      if (boards.classList.contains("on")) closeBoards();
      else if (nameDlg.classList.contains("on")) closeName(null);
    }
  }, true);
  window.addEventListener("pointerdown", (e) => { if (pick.classList.contains("on") && !pick.contains(e.target) && e.target !== ui.el.lvl[3]) closePick(); }, true);

  // ---------- the run clock (HUD, top centre); zero allocations per frame ----------
  const clock = mk(null, "div", { id: "runClock", "aria-hidden": "true" }, '<span class="t"><span class="m">0</span>:<span>0</span><span>0</span>.<span>0</span><span>0</span></span><span class="pb"></span>');
  const topmid = $("topmid");
  if (topmid) topmid.insertBefore(clock, topmid.firstChild);
  const cm = clock.querySelector(".m"), cd = clock.querySelectorAll(".t > span:not(.m)"), cpb = clock.querySelector(".pb");
  const DIG = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const shown = [-1, -1, -1, -1];
  let shownMin = -1, clockOn = false;
  function setRunClock(ms) {
    if (!clockOn) return;
    ms = ms > 0 ? ms : 0;
    const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, c = Math.floor(ms / 10) % 100;
    if (m !== shownMin) { shownMin = m; cm.textContent = String(m); }
    const d0 = (s / 10) | 0, d1 = s % 10, d2 = (c / 10) | 0, d3 = c % 10;
    if (d0 !== shown[0]) { shown[0] = d0; cd[0].textContent = DIG[d0]; }
    if (d1 !== shown[1]) { shown[1] = d1; cd[1].textContent = DIG[d1]; }
    if (d2 !== shown[2]) { shown[2] = d2; cd[2].textContent = DIG[d2]; }
    if (d3 !== shown[3]) { shown[3] = d3; cd[3].textContent = DIG[d3]; }
  }
  // on: bool; pbMs: personal best (0 = none)
  function showRunClock(on, pbMs) {
    on = !!on && settings.showTimer;
    if (on) cpb.textContent = pbMs > 0 ? "PB " + formatMs(pbMs) : "";
    if (on !== clockOn) { clockOn = on; clock.classList.toggle("on", on); }
  }

  // ---------- the run result: on the end card (when the level shows one) and on the main screen ----------
  const vicRun = mk(null, "div", { cls: "runres", id: "vicRun" });
  const vicSub = $("vicSub");
  if (vicSub && vicSub.parentNode) vicSub.parentNode.insertBefore(vicRun, vicSub.nextSibling);
  const runCard = mk(start, "div", { id: "runCard", role: "status" }, '<button class="x" type="button" aria-label="Close">&#10005;</button><div class="ttl"></div><div class="runres"></div>');
  const runCardTtl = runCard.querySelector(".ttl"), runCardRes = runCard.querySelector(".runres");
  runCard.querySelector(".x").addEventListener("click", (e) => { e.stopPropagation(); click(); showRunCard(false); });
  let result = null, cardT = 0;
  function resultHtml(r) {
    let h = "";
    if (r.l4) h += '<div class="tm">' + r.coins + " COINS" + (r.hard ? ' <span class="hardb">HARD</span>' : "") + "</div>";
    else h += '<div class="tm">TIME ' + formatMs(r.ms) + "</div>";
    if (r.practice) h += '<div class="prac">(practice - not saved)</div>';
    else {
      if (r.pb) h += '<div class="pb">NEW BEST!</div>';
      if (r.rank === undefined) h += '<div class="wr"><span class="spin"></span></div>';
      else if (r.rank) h += '<div class="wr">#' + r.rank + " in the world</div>";
    }
    if (r.hardUnlocked) h += '<div class="hardun">HARD MODE UNLOCKED &#128293;</div>';
    if (online.enabled && !r.practice) h += '<button class="lnk" type="button">See leaderboard</button>';
    return h;
  }
  function paintResult() {
    const h = result ? resultHtml(result) : "";
    vicRun.innerHTML = h;
    runCardRes.innerHTML = h;
    const links = [vicRun.querySelector(".lnk"), runCardRes.querySelector(".lnk")];
    for (const b of links) if (b) b.addEventListener("click", (e) => { e.stopPropagation(); click(); openBoards(result ? result.level : 1); });
  }
  // r: { level, ms, pb, practice, rank (undefined = waiting, 0 = none), l4, coins, hard, hardUnlocked } or null
  function setRunResult(r) { result = r; paintResult(); }
  function patchRunResult(p) { if (!result) return; for (const k in p) result[k] = p[k]; paintResult(); }
  function showRunCard(on, secs) {
    if (on && result) {
      runCardTtl.textContent = "LEVEL " + result.level + (result.l4 && result.hard ? " HARD" : "");
      runCard.classList.add("on");
      cardT = secs || 10;
    } else { runCard.classList.remove("on"); cardT = 0; }
  }
  const update0 = ui.update;
  ui.update = (dt) => {
    update0(dt);
    if (cardT > 0) { cardT -= dt; if (cardT <= 0) runCard.classList.remove("on"); }
  };

  refresh();
  Object.assign(ui, {
    openNameDialog, closeNameDialog: () => closeName(null), openBoards, closeBoards, invalidateBoards: invalidate, chooseL4, closePick,
    setRunClock, showRunClock, setRunResult, patchRunResult, showRunCard, refreshMenu: refresh, settings,
  });
  Object.defineProperty(ui, "nameOpen", { get: () => nameDlg.classList.contains("on") });
  Object.defineProperty(ui, "boardsOpen", { get: () => boards.classList.contains("on") });
  Object.defineProperty(ui, "pickOpen", { get: () => pick.classList.contains("on") });
  return ui;
}
