// src/games/cats/scripts/ui.js - every screen of Find The Cats (spec 28 §7): the HUD buttons, the
// INDEX (100 cards in tier order, black "UNOBTAINED" silhouettes until found), the DIFFICULTY
// CHART (17 tiers with their animated effects), the zone teleport menu, the found-cat cinematic
// that escalates with the tier, the zone puzzles' text box and the "[E] ..." prompt button.
//
// One game-owned DOM root at the platform's `game` layer (z 50, under the platform HUD at 100);
// the full-screen screens sit at 210 (over platform panels at 200, under toasts at 400). Every
// control answers pointer events, so mouse, pen and touch share one path. NO BROWSER TIMERS
// (rule 04:V6): fades, jingles and auto-dismiss are dt accumulators driven by update(dt).
//
//   createUi(ctx, deps) -> { update(dt), refresh(), setZone(k), prompt(view|null), input(opts),
//                            found(n, reward), openIndex(), openChart(), openZones(), closeAll(),
//                            isOpen() -> "index"|"chart"|"zones"|"popup"|null, dispose() }
//   deps = { CATS, R (roster), thumbs, has(n), count(), zoneUnlocked(k), currentZone(),
//            go(k) (0 = hub), respawn(), interact() }

const UI_Z = 50;
const MODAL_Z = 210;
const POPUP_Z = 230;
const TOP_PX = 108;
const THUMBS_PER_TICK = 1;
const BIG_FRAME_S = 1 / 15;
const POPUP_MIN_S = 0.9;
const HINT_MAX_TIER = 6; // hints are shown for unfound cats of tiers <= Extreme, "???" after
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

const FONT = '"Fredoka One", "Arial Rounded MT Bold", "Segoe UI", Roboto, system-ui, sans-serif';

const CSS = `
.ftc-root{position:fixed;inset:0;pointer-events:none;z-index:${UI_Z};font-family:${FONT};color:#fff}
.ftc-root *{box-sizing:border-box}
.ftc-btns{position:absolute;right:10px;top:${TOP_PX}px;display:flex;flex-direction:column;gap:8px}
.ftc-btn{pointer-events:auto;min-width:56px;min-height:48px;padding:6px 10px;border-radius:14px;border:2px solid rgba(255,255,255,.25);
 background:rgba(30,18,40,.82);color:#fff;font:700 14px ${FONT};cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.4);display:flex;align-items:center;gap:6px;justify-content:center}
.ftc-btn:active{transform:scale(.95)}
.ftc-btn .ftc-ico{font-size:20px}
.ftc-prompt{position:absolute;left:50%;bottom:170px;transform:translateX(-50%);pointer-events:auto;min-height:52px;padding:10px 18px;border-radius:16px;
 background:rgba(20,14,28,.9);border:2px solid #ffd75a;font:700 17px ${FONT};cursor:pointer;display:none;max-width:86vw;text-align:center}
.ftc-prompt .ftc-key{display:inline-block;background:#ffd75a;color:#2a1a00;border-radius:7px;padding:0 7px;margin-right:8px}
.ftc-prompt .ftc-bar{height:5px;margin-top:6px;border-radius:3px;background:#ffd75a;width:0}
.ftc-modal{position:fixed;inset:0;z-index:${MODAL_Z};pointer-events:auto;background:rgba(8,4,14,.72);display:flex;align-items:center;justify-content:center;padding:12px}
.ftc-sheet{width:min(980px,100%);max-height:100%;display:flex;flex-direction:column;background:#1d1328;border:3px solid #ff9ad8;border-radius:20px;box-shadow:0 10px 40px rgba(0,0,0,.6);overflow:hidden}
.ftc-head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:#2b1b3b;flex-wrap:wrap}
.ftc-title{font-size:22px;flex:1;min-width:140px;letter-spacing:.5px}
.ftc-x{pointer-events:auto;width:44px;height:44px;border-radius:12px;border:none;background:#ff5f8f;color:#fff;font:700 20px ${FONT};cursor:pointer}
.ftc-body{overflow-y:auto;padding:12px 14px 18px;-webkit-overflow-scrolling:touch}
.ftc-chip{border:2px solid rgba(255,255,255,.2);background:#3a2750;color:#fff;border-radius:999px;padding:6px 12px;font:700 13px ${FONT};cursor:pointer;min-height:36px}
.ftc-chip.on{background:#ff9ad8;color:#2a0f22;border-color:#fff}
.ftc-prog{height:10px;border-radius:6px;background:rgba(255,255,255,.12);overflow:hidden;flex-basis:100%}
.ftc-prog>i{display:block;height:100%;background:linear-gradient(90deg,#7dff8a,#ffd75a)}
.ftc-tierhead{display:flex;align-items:center;gap:10px;margin:14px 0 8px;padding:8px 12px;border-radius:12px;flex-wrap:wrap}
.ftc-tierhead b{font-size:18px}
.ftc-tierhead span{margin-left:auto;font-size:14px}
.ftc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:10px}
.ftc-card{background:#2a1d38;border:2px solid rgba(255,255,255,.12);border-radius:14px;padding:6px;text-align:center;cursor:pointer;position:relative;min-height:150px}
.ftc-card:active{transform:scale(.97)}
.ftc-card .ftc-img{width:100%;aspect-ratio:1;border-radius:10px;background:radial-gradient(circle at 50% 40%,#4a3560,#221630);display:flex;align-items:center;justify-content:center;font-size:40px;overflow:hidden}
.ftc-card .ftc-img img{width:100%;height:100%;object-fit:contain}
.ftc-card .ftc-n{position:absolute;top:8px;left:10px;font-size:12px;opacity:.85;text-shadow:0 1px 2px #000}
.ftc-card .ftc-name{font-size:12.5px;margin-top:4px;line-height:1.15;min-height:2.3em;word-break:break-word}
.ftc-card.unf .ftc-name{color:#8f8299;letter-spacing:1px}
.ftc-badge{display:inline-block;border-radius:7px;padding:1px 7px;font-size:11px;margin-top:3px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ftc-detail{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}
.ftc-detail canvas{width:min(320px,100%);aspect-ratio:1;border-radius:16px;background:radial-gradient(circle at 50% 40%,#5a4075,#1f142c)}
.ftc-detail .ftc-txt{flex:1;min-width:220px}
.ftc-detail h2{margin:4px 0 4px;font-size:26px}
.ftc-detail p{font:500 16px/1.5 "Segoe UI",Roboto,system-ui,sans-serif;color:#efe6f6}
.ftc-row{display:flex;align-items:center;gap:12px;padding:8px;border-radius:12px;background:#2a1d38;margin-bottom:8px;flex-wrap:wrap}
.ftc-sw{width:min(320px,52%);min-height:44px;border-radius:10px;display:flex;align-items:center;padding:6px 12px;font-size:18px;border:2px solid rgba(255,255,255,.35)}
.ftc-row .ftc-blurb{flex:1;min-width:140px;font:500 14px "Segoe UI",Roboto,system-ui,sans-serif;color:#e8dcf2}
.ftc-row .ftc-cnt{font-size:15px;white-space:nowrap}
.ftc-go{pointer-events:auto;border:none;border-radius:12px;padding:10px 16px;font:700 15px ${FONT};cursor:pointer;min-height:44px}
.ftc-dot{width:22px;height:22px;border-radius:50%;border:2px solid #fff;flex:none}
.ftc-fx-rainbow{background:linear-gradient(90deg,#ff004c,#ff8a00,#ffe600,#2bff5a,#00e5ff,#2f6bff,#c400ff,#ff004c)!important;background-size:400% 100%!important;animation:ftc-rb 2.4s linear infinite}
@keyframes ftc-rb{to{background-position:400% 0}}
.ftc-fx-glow{animation:ftc-glow 1.6s ease-in-out infinite}
@keyframes ftc-glow{0%,100%{box-shadow:0 0 6px 1px var(--c)}50%{box-shadow:0 0 22px 6px var(--c)}}
.ftc-fx-flicker{animation:ftc-flick 1.3s steps(1) infinite}
@keyframes ftc-flick{0%{opacity:1}12%{opacity:.25}16%{opacity:1}48%{opacity:.6}52%{opacity:1}80%{opacity:.15}84%{opacity:1}}
.ftc-fx-void{background:radial-gradient(circle at 50% 50%,#1a1a2e 0%,#000 70%)!important;animation:ftc-void 3s ease-in-out infinite;box-shadow:inset 0 0 18px #000}
@keyframes ftc-void{0%,100%{filter:brightness(1)}50%{filter:brightness(.45)}}
.ftc-fx-glitch{animation:ftc-glitch .45s steps(2) infinite;text-shadow:2px 0 #ff0040,-2px 0 #00ffe1}
@keyframes ftc-glitch{0%{transform:translate(0)}25%{transform:translate(-2px,1px) skewX(6deg)}50%{transform:translate(2px,-1px)}75%{transform:translate(-1px,-2px) skewX(-8deg)}100%{transform:translate(1px,2px)}}
.ftc-pop{position:fixed;inset:0;z-index:${POPUP_Z};pointer-events:auto;display:flex;align-items:center;justify-content:center;background:rgba(5,2,10,.78);overflow:hidden;cursor:pointer}
.ftc-rays{position:absolute;width:220vmax;height:220vmax;left:50%;top:50%;margin:-110vmax 0 0 -110vmax;
 background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.13) 0deg 9deg,rgba(255,255,255,0) 9deg 22deg);animation:ftc-spin 14s linear infinite}
@keyframes ftc-spin{to{transform:rotate(360deg)}}
.ftc-popcard{position:relative;width:min(420px,92vw);padding:16px 16px 18px;border-radius:24px;background:#24162f;border:5px solid var(--c);text-align:center;animation:ftc-in .45s cubic-bezier(.2,1.6,.4,1) both}
@keyframes ftc-in{from{transform:scale(.3) rotate(-8deg);opacity:0}to{transform:scale(1);opacity:1}}
.ftc-popcard.shake{animation:ftc-in .45s cubic-bezier(.2,1.6,.4,1) both,ftc-shake .5s .45s 3}
@keyframes ftc-shake{0%,100%{transform:translate(0)}20%{transform:translate(-9px,4px) rotate(-2deg)}40%{transform:translate(8px,-5px) rotate(2deg)}60%{transform:translate(-6px,-3px)}80%{transform:translate(5px,5px)}}
.ftc-banner{display:inline-block;padding:6px 18px;border-radius:12px;font-size:20px;margin-bottom:6px;border:2px solid rgba(255,255,255,.5)}
.ftc-popcard canvas{width:min(260px,70vw);aspect-ratio:1;display:block;margin:4px auto}
.ftc-you{font-size:18px;opacity:.9;letter-spacing:2px}
.ftc-pname{font-size:28px;line-height:1.1;margin:2px 0 4px}
.ftc-pkind{font:500 15px "Segoe UI",Roboto,system-ui,sans-serif;opacity:.85}
.ftc-reward{margin-top:8px;color:#ffd75a;font-size:17px}
.ftc-tap{margin-top:8px;font-size:12px;opacity:.6}
.ftc-flash{position:absolute;inset:0;background:#fff;pointer-events:none;animation:ftc-flash .7s ease-out forwards}
@keyframes ftc-flash{from{opacity:.95}to{opacity:0}}
.ftc-black{position:absolute;inset:0;background:#000;pointer-events:none;display:flex;align-items:center;justify-content:center;font-size:44px;letter-spacing:12px;color:#888;animation:ftc-unblack .5s 1s ease-in forwards}
@keyframes ftc-unblack{to{opacity:0}}
.ftc-ai{position:absolute;inset:0;pointer-events:none;opacity:.35}
.ftc-aitxt{font-size:30px;margin-top:6px}
.ftc-conf{position:absolute;top:-6vh;width:12px;height:7px;pointer-events:none;animation:ftc-fall var(--d) linear var(--w) both}
@keyframes ftc-fall{to{transform:translate(var(--x),112vh) rotate(var(--r))}}
body.oof-reduced-motion .ftc-root *,body.oof-reduced-motion .ftc-modal *,body.oof-reduced-motion .ftc-pop *{animation:none!important}
@media (max-width:520px){.ftc-title{font-size:18px}.ftc-grid{grid-template-columns:repeat(auto-fill,minmax(96px,1fr))}.ftc-sw{width:100%}}
`;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function tap(node, fn) {
  node.addEventListener("pointerup", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    fn(ev);
  });
  node.addEventListener("pointerdown", (ev) => ev.stopPropagation());
}

export function createUi(ctx, deps) {
  const { CATS, R, thumbs } = deps;
  const ui = ctx.services.ui;
  const sfx = (name, opts) => { try { ctx.engine.audio.playSfx(name, opts || {}); } catch { /* optional */ } };

  const style = el("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = el("div", "ftc-root");
  root.dataset.ftc = "root";
  document.body.appendChild(root);

  // ---- HUD buttons ----------------------------------------------------------------------------
  const btns = el("div", "ftc-btns");
  root.appendChild(btns);
  const mkBtn = (ico, label, fn) => {
    const b = el("button", "ftc-btn");
    b.type = "button";
    b.append(el("span", "ftc-ico", ico), el("span", "", label));
    b.dataset.ftc = label.toLowerCase();
    tap(b, () => { sfx("ui_open"); fn(); });
    btns.appendChild(b);
    return b;
  };
  mkBtn("📖", "INDEX", () => openIndex());
  mkBtn("📊", "CHART", () => openChart());
  mkBtn("🌀", "ZONES", () => openZones());
  const hubBtn = mkBtn("🏠", "HUB", () => deps.go(0));
  const stuckBtn = mkBtn("🆘", "STUCK", () => deps.respawn());
  hubBtn.style.display = "none";
  stuckBtn.style.display = "none";

  const promptEl = el("div", "ftc-prompt");
  promptEl.dataset.ftc = "prompt";
  const promptText = el("span");
  const promptBar = el("div", "ftc-bar");
  promptEl.append(el("span", "ftc-key", "E"), promptText, promptBar);
  tap(promptEl, () => deps.interact());
  root.appendChild(promptEl);

  // ---- state -------------------------------------------------------------------------------------
  let modal = null;      // { kind, node, cards?: [{n, img, done}], detail?: {n, canvas, mode} }
  let pop = null;        // the popup currently on screen
  const popQueue = [];
  let jingle = [];       // [{ at, pitch }]
  let jingleT = 0;
  let bigT = 0;
  let lastCount = -1;

  const tierOf = (n) => R.TIERS[R.tierOf(n)];
  const tierFx = (t) => (t.effect ? "ftc-fx-" + t.effect : "");
  const countTier = (t) => { let c = 0; for (let n = t.first; n <= t.last; n++) if (deps.has(n)) c++; return c; };
  const countZone = (z) => { let c = 0; for (let n = z.first; n <= z.last; n++) if (deps.has(n)) c++; return c; };
  const tierBadge = (t) => {
    const b = el("span", "ftc-badge " + tierFx(t), t.name);
    b.style.background = t.color;
    b.style.color = t.text;
    b.style.setProperty("--c", t.color);
    return b;
  };

  function refresh() {
    const c = deps.count();
    if (c !== lastCount) {
      lastCount = c;
      ui.setHudStat("cats", { icon: "🐱", label: "Cats", value: `${c}/${R.TOTAL}` });
    }
    if (modal && modal.kind === "chart") renderChart();
    if (modal && modal.kind === "zones") renderZones();
  }

  function setZone(k) {
    hubBtn.style.display = k ? "" : "none";
    stuckBtn.style.display = k ? "" : "none";
    ui.setHudTitle(k ? `🐱 ${R.ZONES[k].name}` : "🐱 Find The Cats");
  }

  function prompt(view) {
    if (!view) { promptEl.style.display = "none"; return; }
    promptEl.style.display = "block";
    promptText.textContent = view.text;
    promptBar.style.width = Math.round(Math.max(0, Math.min(1, view.progress || 0)) * 100) + "%";
  }

  // ---- modals ------------------------------------------------------------------------------------
  function closeModal() {
    if (!modal) return;
    modal.node.remove();
    if (modal.detail) thumbs.releaseBig();
    modal = null;
    sfx("ui_close");
  }
  function sheet(kind, title) {
    closeModal();
    const node = el("div", "ftc-modal");
    node.dataset.ftc = kind;
    const sh = el("div", "ftc-sheet");
    const head = el("div", "ftc-head");
    const tt = el("div", "ftc-title", title);
    const x = el("button", "ftc-x", "✕");
    x.type = "button";
    x.setAttribute("aria-label", "Close");
    tap(x, closeModal);
    head.append(tt, x);
    const body = el("div", "ftc-body");
    sh.append(head, body);
    node.appendChild(sh);
    node.addEventListener("pointerup", (ev) => { if (ev.target === node) closeModal(); });
    node.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    node.addEventListener("wheel", (ev) => ev.stopPropagation(), { passive: true });
    document.body.appendChild(node);
    modal = { kind, node, head, title: tt, body };
    return modal;
  }

  // INDEX
  let filter = "all";
  let zoneFilter = 0;
  function openIndex() {
    const m = sheet("index", `CAT INDEX  ${deps.count()}/${R.TOTAL}`);
    const chips = el("div");
    chips.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;flex-basis:100%";
    const mkChip = (label, on, fn) => {
      const c = el("button", "ftc-chip" + (on ? " on" : ""), label);
      c.type = "button";
      tap(c, fn);
      chips.appendChild(c);
    };
    const redo = () => openIndex();
    mkChip("All", filter === "all", () => { filter = "all"; redo(); });
    mkChip("Found", filter === "found", () => { filter = "found"; redo(); });
    mkChip("Missing", filter === "missing", () => { filter = "missing"; redo(); });
    mkChip("Every zone", zoneFilter === 0, () => { zoneFilter = 0; redo(); });
    for (let k = 1; k < R.ZONES.length; k++) mkChip(`Z${k}`, zoneFilter === k, () => { zoneFilter = k; redo(); });
    const prog = el("div", "ftc-prog");
    const bar = el("i");
    bar.style.width = (deps.count() / R.TOTAL) * 100 + "%";
    prog.appendChild(bar);
    m.head.append(chips, prog);
    m.cards = [];
    for (let t = 1; t < R.TIERS.length; t++) {
      const tier = R.TIERS[t];
      const ns = [];
      for (let n = tier.first; n <= tier.last; n++) {
        if (filter === "found" && !deps.has(n)) continue;
        if (filter === "missing" && deps.has(n)) continue;
        if (zoneFilter && R.zoneOf(n) !== zoneFilter) continue;
        ns.push(n);
      }
      if (!ns.length) continue;
      const th = el("div", "ftc-tierhead " + tierFx(tier));
      th.style.background = tier.color;
      th.style.color = tier.text;
      th.style.setProperty("--c", tier.color);
      th.append(el("b", "", `${t}. ${tier.name}`), el("span", "", `${countTier(tier)}/${tier.count}`));
      m.body.appendChild(th);
      const grid = el("div", "ftc-grid");
      for (const n of ns) grid.appendChild(card(n, m));
      m.body.appendChild(grid);
    }
    if (!m.cards.length) m.body.appendChild(el("p", "", "No cats match this filter yet."));
  }
  function card(n, m) {
    const found = deps.has(n);
    const t = tierOf(n);
    const c = el("div", "ftc-card" + (found ? "" : " unf"));
    c.dataset.n = String(n);
    const imgBox = el("div", "ftc-img", found ? "🐱" : "⬛");
    c.append(imgBox, el("div", "ftc-n", "#" + n), el("div", "ftc-name", found ? CATS[n].name : "UNOBTAINED"), tierBadge(t));
    tap(c, () => openDetail(n));
    m.cards.push({ n, box: imgBox, mode: found ? "found" : "shadow", done: false });
    return c;
  }
  function openDetail(n) {
    if (!modal || modal.kind !== "index") return;
    const m = modal;
    const found = deps.has(n);
    const t = tierOf(n);
    const cat = CATS[n];
    m.body.textContent = "";
    m.title.textContent = found ? `#${n} ${cat.name}` : `#${n} UNOBTAINED`;
    const back = el("button", "ftc-chip", "← Back to the Index");
    back.type = "button";
    tap(back, () => openIndex());
    const wrap = el("div", "ftc-detail");
    const cv = el("canvas");
    cv.width = 320;
    cv.height = 320;
    const txt = el("div", "ftc-txt");
    const z = R.ZONES[R.zoneOf(n)];
    txt.append(tierBadge(t), el("h2", "", found ? cat.name : "UNOBTAINED"));
    if (found) {
      txt.append(el("div", "ftc-pkind", `${cat.kind}  ·  ${z.name}`), el("p", "", cat.lore));
    } else {
      txt.append(el("div", "ftc-pkind", `Somewhere in ${z.name}`));
      txt.append(el("p", "", R.tierOf(n) <= HINT_MAX_TIER ? `Hint: ${cat.hint}` : "Hint: ???"));
    }
    wrap.append(cv, txt);
    m.body.append(back, wrap);
    m.detail = { n, canvas: cv, mode: found ? "found" : "shadow", a: 0 };
    m.cards = [];
    sfx("click");
  }

  // CHART
  function openChart() {
    sheet("chart", "DIFFICULTY CHART");
    renderChart();
  }
  function renderChart() {
    const m = modal;
    m.body.textContent = "";
    for (let t = 1; t < R.TIERS.length; t++) {
      const tier = R.TIERS[t];
      const row = el("div", "ftc-row");
      row.dataset.tier = String(t);
      const sw = el("div", "ftc-sw " + tierFx(tier), `${t}. ${tier.name}`);
      sw.style.background = tier.color;
      sw.style.color = tier.text;
      sw.style.setProperty("--c", tier.color);
      const range = tier.first === tier.last ? `#${tier.first}` : `#${tier.first}-${tier.last}`;
      row.append(sw, el("div", "ftc-blurb", tier.blurb), el("div", "ftc-cnt", `${countTier(tier)}/${tier.count}  ·  ${range}`));
      m.body.appendChild(row);
    }
  }

  // ZONES
  function openZones() {
    sheet("zones", "ZONES");
    renderZones();
  }
  function renderZones() {
    const m = modal;
    m.body.textContent = "";
    const cur = deps.currentZone();
    const hub = el("div", "ftc-row");
    hub.append(el("div", "ftc-dot"), el("div", "ftc-blurb", "🏠 The Cat Plaza (hub)"));
    const hb = el("button", "ftc-go", cur === 0 ? "You are here" : "GO");
    hb.type = "button";
    hb.style.background = "#7dff8a";
    if (cur !== 0) tap(hb, () => { closeModal(); deps.go(0); });
    hub.appendChild(hb);
    m.body.appendChild(hub);
    const have = deps.count();
    for (let k = 1; k < R.ZONES.length; k++) {
      const z = R.ZONES[k];
      const row = el("div", "ftc-row");
      row.dataset.zone = String(k);
      const dot = el("div", "ftc-dot");
      dot.style.background = z.color;
      const name = el("div", "ftc-blurb");
      name.append(el("b", "", `${k}. ${z.name}`), el("br"), document.createTextNode(`Cats #${z.first}-${z.last}  ·  found ${countZone(z)}/${z.last - z.first + 1}`));
      const open = deps.zoneUnlocked(k);
      const b = el("button", "ftc-go", cur === k ? "You are here" : open ? "GO" : `🔒 Need ${z.unlock} (you have ${have})`);
      b.type = "button";
      b.style.background = open ? "#ffd75a" : "#55475f";
      b.style.color = open ? "#2a1a00" : "#ddd";
      if (open && cur !== k) tap(b, () => { closeModal(); deps.go(k); });
      else if (!open) tap(b, () => sfx("denied"));
      row.append(dot, name, b);
      m.body.appendChild(row);
    }
  }

  // ---- the found cinematic -----------------------------------------------------------------------
  function found(n, reward) {
    popQueue.push({ n, reward });
  }
  function jingleFor(ti) {
    const notes = [];
    const len = Math.min(3 + Math.floor(ti / 2), SCALE.length);
    const gap = Math.max(0.045, 0.11 - ti * 0.004);
    let at = 0;
    const add = (semi, g) => { notes.push({ at, pitch: Math.pow(2, semi / 12) }); at += g; };
    for (let i = 0; i < len; i++) add(SCALE[i] - 5, gap);
    if (ti >= 7) {
      for (let i = len - 1; i >= 0; i -= 2) add(SCALE[i] - 5, gap * 0.8);
      for (let i = 0; i < len; i++) add(SCALE[i] - 2, gap * 0.8);
    }
    add(SCALE[len - 1] - 5, 0.05);
    add(SCALE[len - 1] - 1, 0.25);
    return notes;
  }
  function showPopup(job) {
    const { n, reward } = job;
    const ti = R.tierOf(n);
    const t = R.TIERS[ti];
    const cat = CATS[n];
    const node = el("div", "ftc-pop");
    node.dataset.ftc = "popup";
    node.style.setProperty("--c", t.color === "#000000" || t.color === "#121216" ? "#8a7dff" : t.color);
    if (ti === 17) {
      const ai = el("div", "ftc-ai ftc-fx-rainbow");
      node.appendChild(ai);
    }
    node.appendChild(el("div", "ftc-rays"));
    const pc = el("div", "ftc-popcard" + (ti >= 7 ? " shake" : ""));
    const banner = el("div", "ftc-banner " + tierFx(t), t.name);
    banner.style.background = t.color;
    banner.style.color = t.text;
    banner.style.setProperty("--c", t.color);
    const cv = el("canvas");
    cv.width = 320;
    cv.height = 320;
    const nm = el("div", "ftc-pname" + (t.effect === "glitch" ? " ftc-fx-glitch" : ""), cat.name);
    pc.append(banner, el("div", "ftc-you", "YOU FOUND"), cv, nm, el("div", "ftc-pkind", `#${n} · ${cat.kind}`));
    if (reward > 0) pc.appendChild(el("div", "ftc-reward", `+${reward} Oofbux`));
    if (ti === 17) pc.appendChild(el("div", "ftc-aitxt ftc-fx-rainbow", "YOU ARE THE AI NOW"));
    pc.appendChild(el("div", "ftc-tap", "tap to continue"));
    node.appendChild(pc);
    const pieces = Math.min(140, 24 + ti * 7);
    const COLORS = ["#ff8ad8", "#ffe14d", "#7ad7ff", "#7dff8a", "#ffa94d", "#b48cff", "#ffffff", "#ff5a5a"];
    for (let i = 0; i < pieces; i++) {
      const c = el("div", "ftc-conf");
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = i % 3 === 0 ? t.color : COLORS[i % COLORS.length];
      c.style.setProperty("--d", (1.6 + Math.random() * 1.8).toFixed(2) + "s");
      c.style.setProperty("--w", (Math.random() * 0.9).toFixed(2) + "s");
      c.style.setProperty("--x", (Math.random() * 30 - 15).toFixed(1) + "vw");
      c.style.setProperty("--r", Math.round(Math.random() * 900 - 450) + "deg");
      node.appendChild(c);
    }
    if (t.effect === "void") node.appendChild(el("div", "ftc-black", t.name === "#" ? "#" : "n i l"));
    else if (ti >= 5) node.appendChild(el("div", "ftc-flash"));
    document.body.appendChild(node);
    node.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    node.addEventListener("pointerup", (ev) => {
      ev.stopPropagation();
      if (pop && pop.t >= POPUP_MIN_S) closePopup();
    });
    pop = { n, node, canvas: cv, t: 0, life: 3.2 + ti * 0.18, a: 0, mode: "found" };
    jingle = jingleFor(ti);
    jingleT = 0;
    if (ti >= 11) { try { ctx.engine.camera.shake(Math.min(1, 0.25 + ti * 0.03), 0.6); } catch { /* optional */ } }
    sfx(ti >= 9 ? "fanfare" : "sparkle");
  }
  function closePopup() {
    if (!pop) return;
    pop.node.remove();
    pop = null;
    jingle = [];
    thumbs.releaseBig();
  }

  // ---- text input (zone puzzles) ------------------------------------------------------------------
  function input(opts = {}) {
    const box = el("div");
    box.style.cssText = "display:flex;flex-direction:column;gap:8px;margin-top:8px";
    if (opts.hint) {
      const h = el("div", "", String(opts.hint));
      h.style.cssText = "opacity:.8;font-size:14px";
      box.appendChild(h);
    }
    const field = el("input");
    field.type = "text";
    field.maxLength = opts.max || 64;
    field.autocomplete = "off";
    field.spellcheck = false;
    if (opts.kind === "digits") { field.inputMode = "numeric"; field.pattern = "[0-9]*"; }
    field.style.cssText = "font:700 22px monospace;padding:10px 12px;border-radius:10px;border:2px solid #ff9ad8;background:#160d20;color:#fff;text-transform:uppercase;letter-spacing:2px;width:100%";
    field.dataset.ftc = "input";
    box.appendChild(field);
    const p = ui.dialog({
      title: String(opts.title || "Enter the code"),
      bodyEl: box,
      buttons: [{ id: "cancel", label: "Cancel", variant: "secondary" }, { id: "ok", label: "Enter", variant: "primary" }],
    });
    // The [E] keydown that opens this box focuses the field mid-keystroke, so the browser
    // then types that "e" into it, eating one character of maxLength and breaking every
    // exact-match answer. A real keystroke always reaches the field as a keydown first;
    // text that arrives before any keydown/paste/composition is that stray echo and is dropped.
    let armed = false;
    const arm = () => { armed = true; };
    field.addEventListener("keydown", arm);
    field.addEventListener("paste", arm);
    field.addEventListener("compositionstart", arm);
    field.addEventListener("beforeinput", (e) => { if (!armed) e.preventDefault(); });
    field.addEventListener("input", () => { if (!armed) field.value = ""; });
    try { field.focus({ preventScroll: true }); } catch { /* fine */ }
    return Promise.resolve(p).then((id) => (id === "ok" ? field.value : null));
  }

  // ---- per tick -----------------------------------------------------------------------------------
  function update(dt) {
    if (!pop && popQueue.length) showPopup(popQueue.shift());
    if (pop) {
      pop.t += dt;
      if (jingle.length) {
        jingleT += dt;
        while (jingle.length && jingle[0].at <= jingleT) {
          const note = jingle.shift();
          sfx("chime", { pitch: note.pitch, volume: 0.55 });
        }
      }
      pop.a += dt * 1.6;
      bigT += dt;
      if (bigT >= BIG_FRAME_S) { bigT = 0; thumbs.draw(pop.canvas, pop.n, "found", pop.a); }
      if (pop.t >= pop.life + (popQueue.length ? 0 : 1.2)) closePopup();
    } else if (modal && modal.detail) {
      const d = modal.detail;
      d.a += dt * 1.2;
      bigT += dt;
      if (bigT >= BIG_FRAME_S) { bigT = 0; thumbs.draw(d.canvas, d.n, d.mode, d.a); }
    }
    if (modal && modal.cards && modal.cards.length) {
      let asked = 0;
      for (const c of modal.cards) {
        if (c.done) continue;
        const url = thumbs.url(c.n, c.mode);
        if (url) {
          c.done = true;
          c.box.textContent = "";
          const img = el("img");
          img.alt = "";
          img.src = url;
          c.box.appendChild(img);
        } else if (++asked > 24) break;
      }
      thumbs.pump(THUMBS_PER_TICK);
    }
  }

  function onKey(ev) {
    if (ev.key === "Escape") {
      if (pop && pop.t >= POPUP_MIN_S) { closePopup(); ev.stopPropagation(); }
      else if (modal) { closeModal(); ev.stopPropagation(); }
    }
  }
  document.addEventListener("keydown", onKey, true);

  refresh();
  setZone(0);

  return {
    update, refresh, setZone, prompt, input, found, openIndex, openChart, openZones,
    openDetail: (n) => { if (!modal || modal.kind !== "index") openIndex(); openDetail(n); },
    closeAll() { closePopup(); popQueue.length = 0; closeModal(); },
    isOpen: () => (pop ? "popup" : modal ? (modal.detail ? "detail" : modal.kind) : null),
    pendingPopups: () => popQueue.length + (pop ? 1 : 0),
    dispose() {
      document.removeEventListener("keydown", onKey, true);
      closePopup();
      popQueue.length = 0;
      closeModal();
      root.remove();
      style.remove();
      try { ui.removeHudStat("cats"); } catch { /* fine */ }
    },
  };
}
