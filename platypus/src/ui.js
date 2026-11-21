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
  let againCb = null;

  // ---------- timeline (intro and other delayed UI things) ----------
  const timeline = [];
  function at(delay, fn) { timeline.push({ t: delay, fn }); }

  // ---------- level select ----------
  let levelCb = null, lockedCb = null, ready = false, menuOpen = true;
  const prog = { unlocked: 1, beaten: [false, false, false, false, false] };
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
  el.again.addEventListener("click", () => { if (againCb) { const cb = againCb; againCb = null; cb(); } });

  function tipText() { return touch ? "tap a circle" : "click a circle"; }
  function setReady() {
    ready = true;
    for (const b of el.lvl) b.disabled = false;
    el.startTip.textContent = tipText();
  }
  // p: { unlocked: highest playable level, beaten: [bool x5] }
  // o: { unlock: n (play the unlock animation on circle n), fade: bool, onUnlock(n) (the moment the padlock pops) }
  function showMenu(p, o) {
    prog.unlocked = p.unlocked;
    for (let i = 0; i < 5; i++) prog.beaten[i] = !!p.beaten[i];
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
  for (let i = 0; i < 4; i++) {
    const b = document.createElement("button");
    b.className = "trk l" + i;
    b.innerHTML = '<span class="k">' + (i + 1) + "</span><span></span>";
    el.tricks.appendChild(b);
    el.trk.push(b);
  }
  let tricksOn = false;
  // list: up to 4 of { label, enabled? } (index = trick slot = key 1..4; a null entry hides that slot), or null to hide all
  function setTricks(list) {
    tricksOn = !!list;
    el.tricks.classList.toggle("on", tricksOn);
    for (let i = 0; i < 4; i++) {
      const t = list && list[i], b = el.trk[i];
      b.className = "trk l" + i + (t ? " on" + (t.enabled === false ? " off" : "") : "");
      if (t) b.lastChild.textContent = t.label;
    }
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
    setTricks, setTrickState, flashTrick, setCombo, call, floatText, beat,
    showComplete, showVictory, hideVictory,
    get touch() { return touch; },
    get tricksOn() { return tricksOn; },
    get actionOn() { return actionLabel !== null; },
  };
}
