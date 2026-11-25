// builder/publish.js - the publish flow: validate (community limits) -> the author must have cleared this exact
// version from the start -> the AI rater plays it in a Web Worker (progress bar) -> verdict with the 1-10 badge and
// "watch the AI play" -> confirm name + author -> app.online.publishLevel -> share id / link. BUILDER owns.
import { validateLevel, LIMITS, STEP_MS } from "../sim/index.js";
import { esc, el, badge, scaleBar, diffInfo, fmtMs, playHash, reasonText } from "./common.js";

const X = '<svg class="acb-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const PLAY = '<svg class="acb-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>';
let running = null; // { hash, promise, p, msg, t0, listeners:Set } - a rating in flight survives closing the dialog

function verdictText(r) {
  if (!r.beatable) return "The AI could not find a way to the goal. Your level will be published as <b>10 · Impossible</b>. You beat it yourself, so players will know it can be done!";
  const d = r.difficulty, i = diffInfo(d);
  const lines = {
    1: "A relaxing stroll. Great for brand new players.", 2: "Friendly, with a few simple hops.", 3: "A gentle challenge - like the Sunlit Forest.",
    4: "Needs some real platforming skill.", 5: "Hard: running jumps, timing and careful moves.", 6: "Tough - like the top of the Golden Highlands.",
    7: "Very hard. Expect a lot of retries.", 8: "Expert only: tight timing and near-max jumps.", 9: "Insane. Brutal precision, little rest.",
  };
  return `<b>${d} · ${i.label}.</b> ${lines[d] || ""}`;
}

export function openPublish(ctx) {
  const { app, root } = ctx;
  const level = ctx.level, draft = ctx.draft;
  let m = null;
  const close = () => { if (m) { m.remove(); m = null; } };
  function show(html) {
    const old = root.querySelector(".acb-modal"); if (old) old.remove();
    m = el(`<div class="acb-dialog acb-pubd" role="dialog" aria-label="Publish"><div class="acb-dh"><h2>Publish level</h2><button class="acb-ib" data-p="close" title="Close">${X}</button></div>
      <ol class="acb-steps"><li data-st="check">Check</li><li data-st="clear">Beat it</li><li data-st="rate">AI rating</li><li data-st="publish">Publish</li></ol>
      <div class="acb-pbody">${html}</div></div>`, "acb-modal");
    m.addEventListener("pointerdown", (e) => { if (e.target === m) close(); });
    m.addEventListener("click", onClick);
    root.appendChild(m);
    return m;
  }
  function step(name) {
    if (!m) return;
    const order = ["check", "clear", "rate", "publish"], k = order.indexOf(name);
    m.querySelectorAll("[data-st]").forEach((li) => { const i = order.indexOf(li.dataset.st); li.className = i < k ? "done" : i === k ? "cur" : ""; });
  }
  const handlers = {};
  function onClick(e) {
    const b = e.target.closest("[data-p]"); if (!b || b.disabled) return;
    app.audio.sfx("click");
    const fn = handlers[b.dataset.p]; if (fn) fn(b);
    else if (b.dataset.p === "close") close();
  }

  // ---- 1. validation
  const v = validateLevel(level, { community: true });
  if (!v.ok) {
    show(`<p>Fix these before publishing:</p><ul class="acb-errs">${v.errors.slice(0, 8).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <div class="acb-row end"><button class="acb-btn" data-p="close">OK</button></div>`);
    step("check"); return;
  }
  const hash = playHash(level);
  // ---- 2. must be cleared from the start (this exact gameplay version)
  if (!draft || draft.cleared !== hash) {
    show(`<div class="acb-clearbox"><div class="acb-bigico">${PLAY}</div><div><p><b>Beat your level first.</b></p>
      <p class="acb-muted">To publish, play it from the start and reach the goal. ${draft && draft.cleared ? "You changed the level since your last clear, so it needs a new run." : "This proves every level in the community can be finished."}</p></div></div>
      ${v.warnings.length ? `<details class="acb-warn"><summary>${v.warnings.length} warning${v.warnings.length > 1 ? "s" : ""}</summary><ul>${v.warnings.slice(0, 6).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>` : ""}
      <div class="acb-row end"><button class="acb-btn" data-p="close">Later</button><button class="acb-btn primary" data-p="test">${PLAY}<span>Test play now</span></button></div>`);
    handlers.test = () => { close(); ctx.testPlay(); };
    step("clear"); return;
  }
  // ---- 3. AI rating (cached per gameplay hash)
  const cached = draft.rating && draft.rating.hash === hash ? draft.rating : null;
  if (cached) return verdict(cached);
  rate();

  function rate() {
    show(`<p><b>The AI is playing your level...</b></p>
      <div class="acb-prog"><i style="width:0%"></i></div><p class="acb-prog-msg acb-muted">Starting up</p>
      <p class="acb-muted small">It runs in the background so you can keep building. It may take up to ~20 seconds.</p>
      <div class="acb-row end"><button class="acb-btn" data-p="close">Hide</button></div>`);
    step("rate");
    if (!running || running.hash !== hash) {
      const R = { hash, p: 0, msg: "Starting up", t0: performance.now(), listeners: new Set(), done: null };
      running = R;
      R.promise = app.rate(level, {
        onProgress: (p, msg) => { R.p = p; R.msg = msg || ""; for (const f of R.listeners) f(); },
      }).then((res) => {
        const r = { hash, difficulty: Math.max(1, Math.min(10, Math.round(res.difficulty) || 10)), beatable: !!res.beatable, frames: (res.stats && res.stats.frames) || (res.inputs ? res.inputs.length : 0), error: res.stats && res.stats.error ? String(res.stats.error) : "" };
        if (!r.beatable) r.difficulty = 10;
        if (res.inputs && res.inputs.length) ctx.ratingInputs.set(hash, res.inputs instanceof Uint8Array ? res.inputs : Uint8Array.from(res.inputs));
        if (running === R) running = null;
        R.done = r;
        // remember it on the draft whose version it is (even if the dialog was closed meanwhile)
        if (draft.cleared === hash || playHash(ctx.level) === hash) { draft.rating = r; ctx.save(); }
        app.audio.sfx("rate_done");
        for (const f of R.listeners) f();
        return r;
      });
    }
    const R = running;
    const tick = () => {
      if (!m || !m.isConnected) { R.listeners.delete(tick); return; }
      if (R.done) { R.listeners.delete(tick); verdict(R.done); return; }
      const bar = m.querySelector(".acb-prog i"), msg = m.querySelector(".acb-prog-msg");
      if (bar) bar.style.width = Math.round(Math.max(0.02, Math.min(1, R.p)) * 100) + "%";
      if (msg) msg.textContent = (R.msg ? R.msg.charAt(0).toUpperCase() + R.msg.slice(1) : "Thinking") + " · " + Math.round(R.p * 100) + "% · " + ((performance.now() - R.t0) / 1000).toFixed(0) + " s";
    };
    R.listeners.add(tick); tick();
  }

  // ---- 4. verdict + publish form
  async function verdict(r) {
    const inputs = ctx.ratingInputs.get(hash);
    const update = !!draft.publishedId;
    show(`<div class="acb-verdict">${badge(r.difficulty, { big: true })}<div class="acb-vtext"><p>${verdictText(r)}</p>
        ${r.beatable && r.frames ? `<p class="acb-muted small">The AI's run: ${fmtMs(r.frames * STEP_MS)}${draft.clearMs ? ` · yours: ${fmtMs(draft.clearMs)}` : ""}</p>` : ""}
        ${r.error ? `<p class="acb-muted small">(rater note: ${esc(r.error)})</p>` : ""}</div></div>
      ${scaleBar(r.difficulty)}
      <div class="acb-row"><button class="acb-btn" data-p="watch" ${inputs ? "" : "disabled"} title="${inputs ? "Replay the AI's winning run" : r.beatable ? "Re-rate to see the AI's run again" : "The AI never reached the goal"}">${PLAY}<span>Watch the AI play</span></button>
        <button class="acb-btn" data-p="rerate">Rate again</button></div>
      <div class="acb-form">
        <label class="acb-f wide"><span>Level name</span><input class="acb-pn" type="text" maxlength="${LIMITS.nameLen}" value="${esc(level.name)}"></label>
        <label class="acb-f wide"><span>Your name (shown as the author and on leaderboards)</span><input class="acb-pa" type="text" maxlength="16" placeholder="3-16 characters"></label>
        ${update ? `<label class="acb-check"><input type="checkbox" class="acb-asnew"> Publish as a new level instead of updating <code>${esc(draft.publishedId)}</code></label>` : ""}
        <p class="acb-perr" hidden></p>
      </div>
      <div class="acb-row end"><button class="acb-btn" data-p="close">Not now</button><button class="acb-btn primary" data-p="go">${update ? "Update level" : "Publish"}</button></div>`);
    step("publish");
    handlers.watch = () => { if (!inputs) return; close(); ctx.watch(inputs, () => openPublish(ctx)); };
    handlers.rerate = () => { draft.rating = null; ctx.ratingInputs.delete(hash); ctx.save(); rate(); };
    handlers.go = (b) => doPublish(r, b);
    const pa = m.querySelector(".acb-pa");
    const n = await app.online.getName();
    if (pa && !pa.value) pa.value = n || level.author || "";
  }

  async function doPublish(r, btn) {
    const box = m; if (!box) return;
    const err = (t) => { const p = box.querySelector(".acb-perr"); p.hidden = false; p.textContent = t; btn.disabled = false; btn.textContent = draft.publishedId ? "Update level" : "Publish"; };
    const name = (box.querySelector(".acb-pn").value || "").trim().slice(0, LIMITS.nameLen) || "Untitled";
    const author = (box.querySelector(".acb-pa").value || "").trim();
    const asNew = !!(box.querySelector(".acb-asnew") && box.querySelector(".acb-asnew").checked);
    if (author.length < 3) return err("Type a name of at least 3 characters.");
    btn.disabled = true; btn.textContent = "Publishing...";
    // reserve the player's name (shared with every platyfy game); offline -> the publish below fails anyway
    const cur = await app.online.getName(), claimed = await app.online.isClaimed();
    if (!claimed || (cur || "").toLowerCase() !== author.toLowerCase()) {
      const c = await app.online.claimName(author);
      if (!c.ok && (c.reason === "taken" || c.reason === "rude" || c.reason === "invalid")) return err(c.reason === "invalid" ? "Names are 3-16 letters, numbers or spaces." : reasonText(c));
      if (!c.ok && c.reason !== "offline" && c.reason !== "network") return err(reasonText(c));
    }
    if (name !== level.name) ctx.setName(name);
    const res = await app.online.publishLevel(ctx.level, { difficulty: r.difficulty, frames: r.beatable ? r.frames : 0, name, author: (await app.online.getName()) || author, music: ctx.level.music, theme: ctx.level.theme, id: asNew ? undefined : draft.publishedId || undefined });
    if (!m) return;
    if (!res.ok) {
      const off = res.reason === "offline" || res.reason === "network";
      return err((off ? "Can't reach the community server right now. " : reasonText(res) + " ") + (res.errors ? res.errors.join("; ") + ". " : "") + "Your level is safe as a draft on this device - try again later.");
    }
    draft.publishedId = res.id; ctx.level.author = author; ctx.save();
    app.audio.sfx("publish");
    const link = location.origin + location.pathname.replace(/[^/]*$/, "") + "?level=" + res.id;
    show(`<div class="acb-done"><div class="acb-confetti" aria-hidden="true">${"<i></i>".repeat(18)}</div>
      <h3>${res.updated ? "Level updated!" : "Level published!"}</h3>
      <p>${esc(name)} ${badge(r.difficulty)}</p>
      <p class="acb-muted">Level id <code>${esc(res.id)}</code> · Anyone can find it in Community levels.</p>
      <div class="acb-row"><input class="acb-link" readonly value="${esc(link)}"><button class="acb-btn" data-p="copy">Copy link</button></div></div>
      <div class="acb-row end"><button class="acb-btn" data-p="close">Keep building</button><button class="acb-btn primary" data-p="browse">See it in Community</button></div>`);
    m.querySelectorAll("[data-st]").forEach((li) => { li.className = "done"; });
    handlers.copy = async () => { const i = m.querySelector(".acb-link"); i.select(); try { await navigator.clipboard.writeText(link); } catch (_) { try { document.execCommand("copy"); } catch (e) { /* manual */ } } };
    handlers.browse = () => { close(); app.show("browse", { open: res.id }); };
  }
}
