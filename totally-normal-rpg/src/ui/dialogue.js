// dialogue.js - the dialogue box (portrait, speaker, typewriter, choices) and confirm dialogs (CONTRACT 12).
//   dlg.open({ speaker, lines, choices?, voice? }) -> Promise<choiceIndex | -1>    (queued if one is already open)
//   dlg.confirm(text, [a, b]) -> Promise<0|1>
// Advancing: click/tap the box, E, Space or Enter. A tap while typing completes the line. Keys used here are swallowed
// in the capture phase so they never also reach the game (no jump/interact while talking).
import { el, clear, makeButtonFactory } from "./dom.js";
import { portrait } from "./icons.js";

const CPS = 52;   // typewriter characters per second

export function createDialogue(ctx, root, hooks) {
  // hooks: { onOpen(speaker), onClose(speaker) }
  const button = makeButtonFactory(ctx);
  const box = el("div.tn-dlg.off", { attrs: { role: "dialog", "aria-live": "polite" } });
  const img = el("img.tn-portrait", { attrs: { alt: "" } });
  const body = el("div.tn-dlgbody");
  const who = el("div.tn-speaker");
  const text = el("div.tn-dlgtext");
  const next = el("div.tn-dlgnext");
  const choices = el("div.tn-choices.tn-hide");
  body.appendChild(who); body.appendChild(text); body.appendChild(choices); body.appendChild(next);
  box.appendChild(img); box.appendChild(body);
  root.appendChild(box);

  let cur = null;              // { opts, i, shown, full, typing, resolve, sel }
  const queue = [];
  let raf = 0, lastT = 0;

  function voice(line) {
    const o = cur && cur.opts;
    try {
      if (o && o.voice && ctx.audio && ctx.audio.voice) ctx.audio.voice(line, o.voice);
    } catch (e) { /* */ }
  }

  function showLine() {
    const o = cur.opts;
    const line = String(o.lines[cur.i] === undefined ? "" : o.lines[cur.i]);
    cur.full = line; cur.shown = 0; cur.typing = true; cur.acc = 0;
    text.textContent = "";
    choices.classList.add("tn-hide"); clear(choices);
    next.textContent = ""; next.classList.remove("blink");
    voice(line);
    lastT = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function tick(now) {
    if (!cur || !cur.typing) return;
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    cur.acc += dt * CPS;
    const n = Math.min(cur.full.length, Math.floor(cur.acc));
    if (n !== cur.shown) {
      // a short pause after punctuation
      const ch = cur.full.charAt(n - 1);
      if ((ch === "." || ch === "!" || ch === "?" || ch === ",") && n < cur.full.length && !cur.paused) { cur.paused = true; cur.acc -= CPS * (ch === "," ? 0.08 : 0.2); }
      else cur.paused = false;
      cur.shown = n;
      text.textContent = cur.full.slice(0, n);
      if (!(cur.opts.voice) && n % 3 === 0) { try { ctx.audio && ctx.audio.sfx && ctx.audio.sfx("type", { vol: 0.25 }); } catch (e) { /* */ } }
    }
    if (cur.shown >= cur.full.length) finishLine();
    else raf = requestAnimationFrame(tick);
  }

  function finishLine() {
    if (!cur) return;
    cur.typing = false;
    cancelAnimationFrame(raf);
    text.textContent = cur.full;
    const last = cur.i >= cur.opts.lines.length - 1;
    const ch = cur.opts.choices;
    if (last && ch && ch.length) {
      clear(choices);
      cur.sel = 0;
      cur.choiceAt = performance.now();
      ch.forEach((label, k) => {
        const b = button(String(label), "", () => pick(k));
        b.dataset.k = String(k);
        choices.appendChild(b);
      });
      choices.classList.remove("tn-hide");
      next.textContent = "";
      markSel();
      const fine = !(ctx.engine && ctx.engine.input && ctx.engine.input.mode === "touch");
      if (fine) setTimeout(() => { try { choices.firstChild && choices.firstChild.focus({ preventScroll: true }); } catch (e) { /* */ } }, 30);
    } else {
      next.textContent = last ? "close ▪" : "next ▸";
      next.classList.add("blink");
    }
  }

  function markSel() {
    const bs = choices.children;
    for (let i = 0; i < bs.length; i++) bs[i].classList.toggle("sel", i === cur.sel);
  }

  function advance() {
    if (!cur) return;
    if (cur.typing) { finishLine(); return; }
    if (cur.opts.choices && cur.opts.choices.length && cur.i >= cur.opts.lines.length - 1) return; // must choose
    try { ctx.audio && ctx.audio.sfx && ctx.audio.sfx("ui_click", { vol: 0.5 }); } catch (e) { /* */ }
    if (cur.i < cur.opts.lines.length - 1) { cur.i++; showLine(); return; }
    end(-1);
  }

  function pick(k) { if (cur && !cur.typing) end(k); }

  function end(result) {
    const c = cur; cur = null;
    cancelAnimationFrame(raf);
    box.classList.add("off");
    try { hooks.onClose && hooks.onClose(c.opts.speaker || ""); } catch (e) { console.warn("[ui]", e); }
    try { c.resolve(result); } catch (e) { /* */ }
    if (queue.length) { const q = queue.shift(); setTimeout(() => start(q.opts, q.resolve), 120); }
  }

  function start(opts, resolve) {
    let lines = Array.isArray(opts.lines) ? opts.lines.filter((l) => l !== null && l !== undefined) : [String(opts.lines || "")];
    if (!lines.length) lines = [""];
    const o = { speaker: opts.speaker || "", lines, choices: Array.isArray(opts.choices) ? opts.choices : null, voice: opts.voice || null };
    cur = { opts: o, i: 0, shown: 0, full: "", typing: false, resolve, sel: 0, acc: 0 };
    who.textContent = o.speaker;
    who.classList.toggle("tn-hide", !o.speaker);
    if (o.speaker) {
      img.src = portrait(o.speaker, { redEyes: (ctx.state.run.cycle | 0) >= 1 });
      img.classList.remove("tn-hide");
    } else img.classList.add("tn-hide");
    box.classList.remove("off");
    try { hooks.onOpen && hooks.onOpen(o.speaker); } catch (e) { console.warn("[ui]", e); }
    showLine();
  }

  function open(opts) {
    return new Promise((resolve) => {
      opts = opts || {};
      if (cur) queue.push({ opts, resolve });
      else start(opts, resolve);
    });
  }

  box.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("button")) return; advance(); });

  // ---- confirm
  const conf = el("div.tn-confirm.tn-hide", { attrs: { role: "alertdialog", "aria-modal": "true" } });
  const cbox = el("div.box"), ctext = el("p"), cbs = el("div.bs");
  cbox.appendChild(ctext); cbox.appendChild(cbs); conf.appendChild(cbox);
  root.appendChild(conf);
  let confCur = null;
  const confQueue = [];

  function confirm(textStr, labels) {
    return new Promise((resolve) => {
      const job = { text: String(textStr || ""), labels: Array.isArray(labels) && labels.length ? labels.slice(0, 2) : ["Yes", "No"], resolve };
      if (confCur) confQueue.push(job); else openConfirm(job);
    });
  }
  function openConfirm(job) {
    confCur = job;
    ctext.textContent = job.text;
    clear(cbs);
    job.labels.forEach((l, k) => {
      const b = button(String(l), "tn-btn" + (k === 0 ? ".tn-primary" : ""), () => closeConfirm(k));
      cbs.appendChild(b);
    });
    conf.classList.remove("tn-hide");
    requestAnimationFrame(() => conf.classList.add("on"));
    setTimeout(() => { try { cbs.firstChild.focus({ preventScroll: true }); } catch (e) { /* */ } }, 40);
    try { hooks.onConfirm && hooks.onConfirm(true); } catch (e) { /* */ }
  }
  function closeConfirm(k) {
    const j = confCur; if (!j) return;
    confCur = null;
    conf.classList.remove("on");
    setTimeout(() => { if (!confCur) conf.classList.add("tn-hide"); }, 300);
    try { hooks.onConfirm && hooks.onConfirm(false); } catch (e) { /* */ }
    j.resolve(k === 1 ? 1 : 0);
    if (confQueue.length) setTimeout(() => openConfirm(confQueue.shift()), 320);
  }

  // ---- keys (capture phase: swallowed before the game sees them)
  function onKey(e) {
    if (confCur) {
      const k = e.key;
      if (k === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); closeConfirm(0); return; }
      if (k === "ArrowLeft" || k === "ArrowRight" || k === "Tab") {
        e.preventDefault(); e.stopImmediatePropagation();
        const bs = cbs.children, a = document.activeElement;
        const i = a === bs[0] ? 1 : 0; try { bs[i] && bs[i].focus(); } catch (er) { /* */ }
        return;
      }
      if (k === " " || k === "Enter" || k === "e" || k === "E") {
        e.preventDefault(); e.stopImmediatePropagation();
        const a = document.activeElement, bs = cbs.children;
        closeConfirm(a === bs[1] ? 1 : 0);
        return;
      }
      // everything else is swallowed too while the dialog is up
      if (!e.ctrlKey && !e.metaKey) e.stopImmediatePropagation();
      return;
    }
    if (!cur) return;
    const k = e.key;
    const ch = cur.opts.choices;
    const choosing = !cur.typing && ch && ch.length && cur.i >= cur.opts.lines.length - 1;
    if (choosing) {
      if (/^[1-9]$/.test(k) && +k <= ch.length) { e.preventDefault(); e.stopImmediatePropagation(); pick(+k - 1); return; }
      if (k === "ArrowLeft" || k === "ArrowUp" || k === "a" || k === "w") { e.preventDefault(); e.stopImmediatePropagation(); cur.sel = (cur.sel + ch.length - 1) % ch.length; markSel(); try { choices.children[cur.sel].focus(); } catch (er) { /* */ } return; }
      if (k === "ArrowRight" || k === "ArrowDown" || k === "d" || k === "s" || k === "Tab") { e.preventDefault(); e.stopImmediatePropagation(); cur.sel = (cur.sel + 1) % ch.length; markSel(); try { choices.children[cur.sel].focus(); } catch (er) { /* */ } return; }
      if (k === "Enter" || k === " " || k === "e" || k === "E") {
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.repeat || performance.now() - (cur.choiceAt || 0) < 350) return;   // a mashed skip key never picks
        const a = document.activeElement;
        const idx = a && a.parentNode === choices ? +a.dataset.k : cur.sel;
        pick(idx);
        return;
      }
      return;
    }
    if (k === "e" || k === "E" || k === " " || k === "Enter" || k === "f" || k === "F") {
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) advance();
    }
  }
  window.addEventListener("keydown", onKey, true);

  return {
    open, confirm,
    get active() { return !!cur; },
    get confirming() { return !!confCur; },
    /** close everything immediately (scripted cuts) */
    closeAll() {
      while (queue.length) { const q = queue.shift(); try { q.resolve(-1); } catch (e) { /* */ } }
      if (cur) end(-1);
    }
  };
}
