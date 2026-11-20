// ui.js - owns every DOM element of the game: start circle, intro, HUD, speech bubble, victory.
// Everything timed is driven from update(dt) so it stays in step with the game loop.

const HEART =
  '<svg viewBox="0 0 24 24"><path d="M12 21s-7.500-4.700-9.600-9.300C.900 8.200 2.800 4.500 6.500 4.500c2.200 0 3.900 1.100 5.500 3.200 1.600-2.100 3.300-3.200 5.500-3.200 3.700 0 5.600 3.700 4.100 7.200C19.500 16.300 12 21 12 21z"/></svg>';

export function createUI() {
  const $ = (id) => document.getElementById(id);
  const el = {
    start: $("start"), levelBtn: $("levelBtn"), startTip: $("startTip"), black: $("black"), white: $("white"), tut: $("tut"),
    hud: $("hud"), hearts: $("hearts"), objective: $("objective"), objText: $("objText"), objKeys: $("objKeys"),
    foe: $("foe"), foeFill: $("foeFill"), bubble: $("bubble"), bubbleTxt: $("bubbleTxt"), bubbleMore: $("bubbleMore"),
    toast: $("toast"), stick: $("stick"), stickKnob: $("stick").firstElementChild,
    btnSting: $("btnSting"), btnZap: $("btnZap"), btnJump: $("btnJump"),
    victory: $("victory"), again: $("again"), hurt: $("hurt"), fatal: $("fatal"),
  };

  let touch = false;
  let startCb = null;
  let againCb = null;

  // ---------- timeline (intro and other delayed UI things) ----------
  const timeline = [];
  function at(delay, fn) { timeline.push({ t: delay, fn }); }

  // ---------- start + intro ----------
  el.levelBtn.addEventListener("click", () => {
    if (el.levelBtn.disabled || !startCb) return;
    const cb = startCb;
    startCb = null;
    cb();
  });
  el.again.addEventListener("click", () => { if (againCb) { const cb = againCb; againCb = null; cb(); } });

  function setReady() {
    el.levelBtn.disabled = false;
    el.startTip.textContent = touch ? "tap the circle" : "click the circle";
  }

  // cbs: { onBlack, onRise, onReveal, onDone }
  function playIntro(cbs) {
    el.start.classList.add("go");
    el.black.classList.add("on");
    if (cbs.onBlack) cbs.onBlack();
    at(0.9, () => el.tut.classList.add("on"));
    at(2.9, () => { el.tut.classList.add("off"); el.tut.classList.remove("on"); });
    at(3.1, () => { el.white.classList.add("on"); if (cbs.onRise) cbs.onRise(1.7); });
    at(4.9, () => {
      el.start.style.display = "none";
      el.black.style.display = "none";
      el.tut.style.display = "none";
      document.body.classList.add("playing");
      if (cbs.onReveal) cbs.onReveal();
    });
    at(5.1, () => { el.white.classList.add("slow"); el.white.classList.remove("on"); });
    at(6.2, () => el.hud.classList.add("on"));
    at(7.4, () => { el.white.classList.remove("slow"); if (cbs.onDone) cbs.onDone(); });
  }

  function whiteFlash(hold, mid) {
    el.white.classList.add("quick", "on");
    at(0.3 + (hold || 0), () => { if (mid) mid(); el.white.classList.remove("on"); });
    at(0.7 + (hold || 0), () => el.white.classList.remove("quick"));
  }

  // ---------- hearts ----------
  let heartCount = -1, heartMax = 0;
  function setHearts(n, max) {
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
      el.hearts.classList.remove("hit");
      void el.hearts.offsetWidth;
      el.hearts.classList.add("hit");
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

  // ---------- cooldowns ----------
  const cdLast = { sting: -1, zap: -1 };
  let zapUsable = null, zapReady = null;
  function setCooldown(which, frac) {
    const q = Math.round(Math.max(0, Math.min(1, frac)) * 40) / 40;
    if (cdLast[which] === q) return;
    cdLast[which] = q;
    (which === "sting" ? el.btnSting : el.btnZap).style.setProperty("--cd", q);
  }
  function setZapUsable(usable, ready) {
    if (usable !== zapUsable) { zapUsable = usable; el.btnZap.classList.toggle("unusable", !usable); }
    if (ready !== zapReady) { zapReady = ready; el.btnZap.classList.toggle("ready", !!ready); }
  }

  // ---------- toast ----------
  let toastT = 0;
  function hint(text, secs) {
    el.toast.textContent = text;
    el.toast.classList.add("on");
    toastT = secs || 2.4;
  }

  // ---------- speech bubble ----------
  const sp = { text: "", shown: 0, pos: 0, typing: false, hold: 0, active: false, blipT: 0, onBlip: null, onTyped: null, onDone: null };
  const CPS = 34;

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
      // room above his hat: classic bubble with a tail
      x = Math.max(bw / 2 + 10, Math.min(vw - bw / 2 - 10, sx));
      y = sy - 16;
      pinned = Math.abs(x - sx) > bw * 0.42;
    } else if (onScreen && vw > bw * 2 + 160) {
      // no room above: sit beside his head so the face stays visible
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

  // ---------- victory ----------
  function showVictory(onAgain) {
    againCb = onAgain;
    clearSpeech();
    el.hud.classList.remove("on");
    el.victory.classList.add("on");
  }
  function hideVictory() {
    if (el.victory.classList.contains("on")) el.hud.classList.add("on");
    el.victory.classList.remove("on");
  }

  // ---------- touch ----------
  function enableTouch() {
    if (touch) return;
    touch = true;
    document.body.classList.add("touch");
    el.bubbleMore.innerHTML = "tap &rsaquo;";
    if (!el.levelBtn.disabled) el.startTip.textContent = "tap the circle";
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
    el, update, setReady, playIntro, whiteFlash, fatal,
    onStart(cb) { startCb = cb; },
    setHearts, setObjective, objectiveDone, setHumanHp, setCooldown, setZapUsable, hint,
    say, advance, clearSpeech, setBubbleAnchor, speaking() { return sp.active; },
    showVictory, hideVictory, enableTouch, setStick,
    get touch() { return touch; },
  };
}
