// house/ui.js - the house panel: current level + title, a 20-step progress track, next level preview (drawn by the
// renderer), cost list with have/need + icons, hammer requirement, Upgrade with a build animation, Sleep, House
// chest, Harvest garden, Repair tools, perk chips and a final "Cube Monarch" celebration (HOUSE owns; API frozen:
// BONUS.md 8.4). DOM.
//   const ui = createHouseUI(ctx); ui.frame(dt); ui.destroy()     registers panel "house" (data: { tab?: "repair" })
import { ITEMS, TIERS } from "../data/items.js";
import { houseLevel, houseTitle, HOUSE_MAX, HOUSE_MILESTONES } from "../data/house.js";
import { sun, phase } from "../core/time.js";
import {
  canUpgrade, upgrade, sleep, canSleep, nearHome, harvestGarden, perksAt, have, hasPerk, repairCost, repair, spots,
} from "./index.js";

const CSS = `
.bh-panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(720px,calc(100vw - 32px));max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;
  background:linear-gradient(180deg,rgba(46,36,24,.97),rgba(28,22,15,.97));color:#f6ecd6;border:1px solid rgba(255,220,160,.22);border-radius:16px;padding:14px 16px 16px;pointer-events:auto;font:14px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 14px 50px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,240,210,.08);box-sizing:border-box}
.bh-panel *{box-sizing:border-box}
.bh-panel button{margin:0;min-height:44px;border-radius:11px;padding:8px 14px;font:600 14px system-ui,sans-serif;color:#f6ecd6;background:rgba(255,236,200,.08);border:1px solid rgba(255,230,190,.22);cursor:pointer}
.bh-panel button:hover:not(:disabled){background:rgba(255,236,200,.16)}
.bh-panel button:disabled{opacity:.42;cursor:default}
.bh-head{display:flex;align-items:center;gap:12px;padding-right:52px;min-height:56px}
.bh-medal{flex:0 0 56px;height:56px;border-radius:50%;display:grid;place-items:center;position:relative;font:800 20px system-ui;color:#2b1a05;
  background:conic-gradient(#ffcf5a var(--p),rgba(255,255,255,.12) 0)}
.bh-medal::before{content:"";position:absolute;inset:5px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffe9a8,#e0a23a 70%,#b8771d)}
.bh-medal span{position:relative}
.bh-medal.max::before{background:radial-gradient(circle at 35% 30%,#e9fbff,#8fd8ff 60%,#5b8fe0)}
.bh-name{min-width:0}.bh-name h2{margin:0;font:800 19px system-ui;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bh-name small{display:block;opacity:.78;font-size:12.5px}
.bh-name em{font-style:normal;color:#ffd27a;font-weight:700}
.bh-x{position:absolute;right:12px;top:12px;width:44px;padding:0!important;font-size:20px!important;line-height:1}
.bh-track{display:grid;grid-template-columns:repeat(20,1fr);gap:3px;margin:12px 0 4px}
.bh-track i{height:9px;border-radius:5px;background:rgba(255,255,255,.1);position:relative}
.bh-track i.done{background:linear-gradient(180deg,#ffd77a,#d9962c)}
.bh-track i.ms{height:13px;margin-top:-2px}
.bh-track i.ms.done{background:linear-gradient(180deg,#bff0ff,#59a9e8)}
.bh-track i.next{background:rgba(255,210,122,.35);animation:bhPulse 1.3s ease-in-out infinite}
@keyframes bhPulse{50%{background:rgba(255,210,122,.7)}}
.bh-trackl{display:flex;justify-content:space-between;font-size:11px;opacity:.6;margin-bottom:10px}
.bh-main{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:14px;align-items:start}
@media (max-width:600px){.bh-main{grid-template-columns:1fr}}
.bh-prev{position:relative;border-radius:12px;overflow:hidden;background:#24331f;border:1px solid rgba(255,230,190,.15);aspect-ratio:16/10}
.bh-prev canvas{width:100%;height:100%;display:block}
.bh-seg{position:absolute;left:8px;top:8px;display:flex;background:rgba(0,0,0,.45);border-radius:10px;padding:2px}
.bh-panel .bh-seg button{min-height:30px;padding:3px 10px;font-size:12px;border:0;background:transparent;border-radius:8px}
.bh-panel .bh-seg button.on{background:rgba(255,210,122,.9);color:#2b1a05}
.bh-tag{position:absolute;right:8px;bottom:8px;background:rgba(0,0,0,.5);padding:3px 9px;border-radius:9px;font-size:12px}
.bh-info h3{margin:0 0 2px;font:800 16px system-ui}
.bh-unl{margin:0 0 8px;font-size:13px;color:#d8f0b8}
.bh-costs{display:flex;flex-direction:column;gap:5px;margin:0 0 10px;padding:0;list-style:none}
.bh-costs li{display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:8px;padding:4px 8px 4px 4px;border-radius:9px;background:rgba(255,255,255,.05)}
.bh-costs li canvas{width:30px;height:30px}
.bh-costs li b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bh-costs li span{font:700 13px ui-monospace,monospace;color:#ff9c86;white-space:nowrap}
.bh-costs li.ok span{color:#a7e38a}
.bh-costs li u{grid-column:2/4;height:3px;border-radius:2px;background:rgba(255,255,255,.08);display:block;margin-top:-2px}
.bh-costs li u s{display:block;height:100%;border-radius:2px;background:#e07b5f;text-decoration:none}
.bh-costs li.ok u s{background:#86cf68}
.bh-panel .bh-up{width:100%;min-height:52px;font:800 17px system-ui;color:#2b1a05;border:0;background:linear-gradient(180deg,#ffd57a,#e3922c);box-shadow:0 3px 0 #9b5a12,0 8px 22px rgba(0,0,0,.3)}
.bh-panel .bh-up:hover:not(:disabled){background:linear-gradient(180deg,#ffe29a,#efa040)}
.bh-panel .bh-up:disabled{background:rgba(255,255,255,.12);color:#f6ecd6;box-shadow:none;opacity:.6}
.bh-why{margin:6px 0 0;font-size:12.5px;opacity:.8;min-height:17px}
.bh-acts{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 10px}
.bh-acts button{flex:1 1 140px}
.bh-acts small{display:block;font-weight:500;font-size:11px;opacity:.75}
.bh-perks{display:flex;flex-wrap:wrap;gap:6px;margin:0}
.bh-perks span{font-size:12px;padding:4px 9px;border-radius:20px;background:rgba(140,200,110,.14);border:1px solid rgba(160,220,120,.25);color:#e1f5cf}
.bh-sub{margin:4px 0 8px;font:700 12px system-ui;letter-spacing:.6px;text-transform:uppercase;opacity:.6}
.bh-rep{display:flex;flex-direction:column;gap:6px}
.bh-rep div{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:8px;align-items:center;padding:4px 6px;border-radius:9px;background:rgba(255,255,255,.05)}
.bh-rep canvas{width:34px;height:34px}.bh-rep small{display:block;opacity:.75}
.bh-rep i{display:block;height:4px;border-radius:2px;background:rgba(255,255,255,.1);margin-top:3px}
.bh-rep i s{display:block;height:100%;border-radius:2px;background:#e0a33a}
.bh-done{padding:10px 12px;border-radius:12px;background:linear-gradient(135deg,rgba(140,210,255,.18),rgba(255,210,122,.16));border:1px solid rgba(180,230,255,.3)}
.bh-allbtn{width:100%;margin:0 0 10px}
.bh-gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin:0 0 10px}
@media (max-width:480px){.bh-gal{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}}
.bh-card{position:relative;border-radius:12px;overflow:hidden;background:rgba(255,255,255,.05);border:1px solid rgba(255,230,190,.14);display:flex;flex-direction:column}
.bh-card.built{border-color:rgba(167,227,138,.45)}
.bh-card.next{border-color:rgba(255,210,122,.75);box-shadow:0 0 0 2px rgba(255,210,122,.25)}
.bh-card canvas{width:100%;aspect-ratio:16/10;display:block;background:#24331f}
.bh-card.future canvas{filter:saturate(.75) brightness(.9)}
.bh-card .bh-lvl{position:absolute;left:6px;top:6px;background:rgba(0,0,0,.55);border-radius:8px;padding:2px 8px;font:800 12px system-ui}
.bh-card .bh-st{position:absolute;right:6px;top:6px;border-radius:8px;padding:2px 8px;font:700 11px system-ui;background:rgba(0,0,0,.55)}
.bh-card.built .bh-st{background:rgba(90,160,70,.85)}.bh-card.next .bh-st{background:rgba(227,146,44,.92);color:#2b1a05}
.bh-card .bh-cb{padding:7px 9px 9px;display:flex;flex-direction:column;gap:3px;min-width:0}
.bh-card h4{margin:0;font:800 14px system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bh-card .bh-ct{font-size:11.5px;color:#ffd27a;font-weight:700}
.bh-card p{margin:0;font-size:12px;color:#d8f0b8;line-height:1.3}
.bh-card .bh-cc{font-size:11px;opacity:.72;line-height:1.3}
.bh-cele{position:fixed;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px;padding:20px;border-radius:16px;background:radial-gradient(circle at 50% 40%,rgba(60,70,110,.96),rgba(18,16,30,.98))}
.bh-cele canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.bh-cele h2{position:relative;margin:44px 0 0;font:900 26px system-ui;color:#ffe19a;text-shadow:0 2px 12px rgba(255,200,90,.5)}
.bh-cele p{position:relative;margin:0;max-width:440px;opacity:.9}
.bh-cele .bh-stats{position:relative;display:grid;grid-template-columns:repeat(3,auto);gap:4px 16px;font-size:13px;opacity:.85}
.bh-cele button{position:relative}
`;

const STATION_NAME = { campfire: "Campfire", workbench: "Workbench", furnace: "Furnace", anvil: "Anvil", smoker: "Smoker", kitchen: "Kitchen" };
const pct = (x) => Math.round(x * 100) + "%";
// human-readable chips for a perk set (cumulative or one level's own)
export function perkChips(P) {
  const out = [];
  if (P.home) out.push("Wake up at home");
  if (P.sleep) out.push(P.sleep === "any" ? "Bed: nap any time" : "Bed: sleep at night");
  if (P.sleepHeal) out.push(P.sleepHeal >= 1 ? "Sleep heals fully" : "Sleep heals " + pct(P.sleepHeal));
  if (P.stations && P.stations.length) out.push("Stations: " + P.stations.map((s) => STATION_NAME[s] || s).join(", "));
  if (P.chest) out.push("Chest: " + P.chest + " slots");
  if (P.maxHp) out.push("+" + P.maxHp + " max health");
  if (P.maxHunger) out.push("+" + P.maxHunger + " max hunger");
  if (P.hungerMul) out.push("Hunger -" + pct(1 - P.hungerMul) + " at home");
  if (P.garden) out.push("Garden: " + P.garden + " beds");
  if (P.lamps) out.push("Lamps keep wolves away");
  if (P.repair) out.push("Repair tools");
  if (P.wearMul) out.push("Tools wear x" + P.wearMul);
  if (P.walls) out.push("Walls keep beasts out");
  if (P.banquet) out.push("Food +" + pct(P.banquet - 1) + " at home");
  if (P.regenMul) out.push("Healing x" + P.regenMul + " at home");
  if (P.crown) out.push("A royal crown");
  return out;
}
const hammerId = (tier) => TIERS[tier] + "_hammer";

export function createHouseUI(ctx) {
  const els = [];
  const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st); els.push(st);
  let panel = null, key = "", tab = "next", view = "main", anim = null, cele = null, prevCanvas = null;
  const dpr = () => Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);

  function close() { if (panel) panel.remove(); panel = null; anim = null; cele = null; prevCanvas = null; key = ""; }
  function stateKey() {
    const G = ctx.G, h = G.house;
    return G.inv.ver + "|" + (h.chest ? h.chest.ver : 0) + "|" + h.level + "|" + h.garden.ready + "|" + phase(G) + "|" + nearHome(G) + "|" + tab + "|" + view + "|" + (anim ? (anim.done ? 2 : 1) : 0);
  }
  function icon(c, id, size) {
    const k = dpr(); c.width = c.height = Math.round(size * k);
    const g = c.getContext("2d"); g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, size, size);
    try { ctx.renderer.drawIcon(g, id, 0, 0, size); } catch (e) { /* renderer swap mid-frame */ }
  }

  // ---------------------------------------------------------------------------------------------------------
  function render() {
    const G = ctx.G, h = G.house, lv = h.level, cur = houseLevel(lv), c = canUpgrade(G), near = nearHome(G);
    key = stateKey();
    const isMax = lv >= HOUSE_MAX;
    if (isMax && tab === "next") tab = "now";
    let s = `<button class="bh-x" data-a="close" aria-label="Close">&times;</button>
      <div class="bh-head"><div class="bh-medal${isMax ? " max" : ""}" style="--p:${(lv / HOUSE_MAX) * 100}%"><span>${lv}</span></div>
      <div class="bh-name"><h2>${cur ? cur.name : "Empty house plot"}</h2><small>Level ${lv} of ${HOUSE_MAX} &middot; <em>${houseTitle(lv)}</em></small></div></div>
      <div class="bh-track">${Array.from({ length: HOUSE_MAX }, (_, i) => `<i class="${i < lv ? "done" : i === lv ? "next" : ""}${HOUSE_MILESTONES.includes(i + 1) ? " ms" : ""}" title="${houseLevel(i + 1).name}"></i>`).join("")}</div>
      <div class="bh-trackl"><span>Lean-to</span><span>Cabin</span><span>Cottage</span><span>Manor</span><span>Citadel</span></div>`;
    if (view === "repair") s += repairHtml(G, near);
    else if (view === "all") s += allHtml(lv);
    else {
      s += `<button class="bh-allbtn" data-a="all">See all ${HOUSE_MAX} houses</button>`;
      s += `<div class="bh-main"><div class="bh-prev"><canvas></canvas>
        <div class="bh-seg">${lv > 0 ? `<button data-a="tab" data-t="now" class="${tab === "now" ? "on" : ""}">Now</button>` : ""}${!isMax ? `<button data-a="tab" data-t="next" class="${tab === "next" ? "on" : ""}">Next</button>` : ""}</div>
        <div class="bh-tag">${tab === "now" ? (cur ? "Lv " + lv : "Empty plot") : "Lv " + (lv + 1) + " preview"}</div></div><div class="bh-info">`;
      if (c.next) {
        const P = c.next.perks, chips = perkChips(P);
        s += `<h3>Next: ${c.next.name}</h3><p class="bh-unl">${c.next.perkText}</p><ul class="bh-costs">`;
        for (const id in c.next.cost) {
          const need = c.next.cost[id], got = have(G, id), ok = got >= need;
          s += `<li class="${ok ? "ok" : ""}"><canvas data-icon="${id}"></canvas><b>${ITEMS[id] ? ITEMS[id].name : id}</b><span>${Math.min(got, 9999)} / ${need}</span><u><s style="width:${Math.min(100, (got / need) * 100).toFixed(0)}%"></s></u></li>`;
        }
        if (c.next.hammer) {
          const hid = hammerId(c.next.hammer);
          s += `<li class="${c.hasHammer ? "ok" : ""}"><canvas data-icon="${hid}"></canvas><b>${ITEMS[hid].name} (or better)</b><span>${c.hasHammer ? "carried" : "needed"}</span></li>`;
        }
        s += `</ul>`;
        let why = "";
        if (!near) why = "Go home to build (stand on your plot).";
        else if (!c.hasHammer) why = `Craft a ${ITEMS[hammerId(c.hammer)].name.toLowerCase()} to build this.`;
        else if (!c.ok) { const n = Object.keys(c.missing).length; why = `Still missing ${n} material${n > 1 ? "s" : ""}. The house chest counts too.`; }
        else why = chips.length ? "Unlocks: " + chips.join(" · ") : "";
        s += `<button class="bh-up" data-a="up" ${c.ok && near && !(anim && !anim.done) ? "" : "disabled"}>${anim && !anim.done ? "Building..." : lv === 0 ? "Build it!" : "Upgrade to level " + c.next.lv}</button><p class="bh-why">${why}</p>`;
      } else {
        s += `<div class="bh-done"><h3>Your citadel is complete!</h3><p class="bh-unl">You are the Cube Monarch. Every perk is yours.</p>
          <small>Built on day ${G.flags.houseDone || G.time.day}. ${h.slept | 0} nights slept, ${h.garden.harvested | 0} garden crops.</small></div>`;
      }
      if (anim && anim.done) s += `<button data-a="see" style="width:100%;margin-top:8px">See it in the world</button>`;
      s += `</div></div>`;
      // actions
      const sl = canSleep(G), S = spots(G);
      s += `<div class="bh-acts">`;
      if (lv >= 2) s += `<button data-a="sleep" ${sl.ok && near ? "" : "disabled"}>Sleep<small>${!near ? "at home only" : sl.ok ? (phase(G) === "night" || phase(G) === "dusk" ? "until dawn" : "a short nap") : sl.reason}</small></button>`;
      if (h.chest) s += `<button data-a="chest" ${near ? "" : "disabled"}>House chest<small>${h.chest.slots.filter(Boolean).length} / ${h.chest.slots.length} slots used</small></button>`;
      if (S.garden) s += `<button data-a="garden" ${h.garden.ready && near ? "" : "disabled"}>Harvest garden<small>${h.garden.ready ? h.garden.ready + " beds ripe" : "ripens at dawn"}</small></button>`;
      s += `<button data-a="repair" ${hasPerk(G, "repair") ? "" : "disabled"}>Repair tools<small>${hasPerk(G, "repair") ? damagedTools(G).length + " worn" : "level 13"}</small></button>`;
      s += `</div>`;
      const chips = perkChips(perksAt(lv));
      s += `<p class="bh-sub">Your home gives you</p><div class="bh-perks">${chips.length ? chips.map((x) => `<span>${x}</span>`).join("") : `<span>Nothing yet: build a lean-to with 12 wood and 6 plant fiber.</span>`}</div>`;
    }
    const scroll = panel.scrollTop;
    panel.innerHTML = s;
    panel.scrollTop = scroll;
    panel.querySelectorAll("canvas[data-icon]").forEach((cv) => icon(cv, cv.dataset.icon, cv.closest(".bh-rep") ? 34 : 30));
    prevCanvas = panel.querySelector(".bh-prev canvas");
    if (view === "all") drawGallery();
    drawPreview(0);
    if (cele) panel.appendChild(cele.el);
  }
  // every house, built or not: a picture, its name, title, what it gives and what it costs
  function allHtml(lv) {
    let s = `<p class="bh-sub">Every house you can build &middot; ${lv} of ${HOUSE_MAX} built</p><div class="bh-gal">`;
    for (let i = 1; i <= HOUSE_MAX; i++) {
      const L = houseLevel(i), st = i <= lv ? "built" : i === lv + 1 ? "next" : "future";
      const cost = Object.keys(L.cost).map((id) => L.cost[id] + " " + (ITEMS[id] ? ITEMS[id].name.toLowerCase() : id)).join(", ");
      const ham = L.hammer ? " · needs a " + ITEMS[hammerId(L.hammer)].name.toLowerCase() : "";
      s += `<div class="bh-card ${st}"><canvas data-house="${i}"></canvas><span class="bh-lvl">Lv ${i}</span>
        <span class="bh-st">${st === "built" ? "Built" : st === "next" ? "Next" : "Future"}</span>
        <div class="bh-cb"><h4>${L.name}</h4><span class="bh-ct">${L.title}</span><p>${L.perkText}</p>
        <span class="bh-cc">${st === "built" ? "Done!" : "Costs " + cost + ham}</span></div></div>`;
    }
    return s + `</div><button data-a="back" style="width:100%">Back</button>`;
  }
  function drawGallery() {
    const night = Math.max(0.15, sun(ctx.G)) < 0.5;
    panel.querySelectorAll("canvas[data-house]").forEach((cv) => {
      const k = dpr(), W = cv.clientWidth || 200, H = cv.clientHeight || 125;
      cv.width = Math.round(W * k); cv.height = Math.round(H * k);
      const g = cv.getContext("2d"); g.setTransform(k, 0, 0, k, 0, 0);
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, night ? "#0f1838" : "#6fb3e8"); sky.addColorStop(1, night ? "#2a3560" : "#cfe8f4");
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      g.fillStyle = night ? "#1d2a3a" : "#8fb59a";
      g.beginPath(); g.moveTo(0, H * 0.72); for (let x = 0; x <= W; x += 12) g.lineTo(x, H * 0.66 - Math.sin(x * 0.03) * 6); g.lineTo(W, H); g.lineTo(0, H); g.fill();
      g.fillStyle = night ? "#22351f" : "#5f9a3c"; g.fillRect(0, H * 0.86, W, H * 0.14);
      try { ctx.renderer.drawHouse(g, +cv.dataset.house, 6, 5, W - 12, H * 0.86 - 3, { preview: true, night, time: 0 }); } catch (e) { /* renderer swap */ }
    });
  }
  function damagedTools(G) {
    const out = [];
    G.inv.slots.forEach((sl, i) => { const it = sl && ITEMS[sl.id]; if (it && it.tool && sl.d != null && sl.d < it.tool.dur) out.push(i); });
    return out;
  }
  function repairHtml(G, near) {
    const list = damagedTools(G), ok = hasPerk(G, "repair");
    let s = `<p class="bh-sub">Tool rack &middot; repair tools</p>`;
    if (!ok) s += `<p>Build the Workshop wing (level 13) to repair tools at home.</p>`;
    else if (!list.length) s += `<p>All your tools are in perfect shape.</p>`;
    else {
      s += `<div class="bh-rep">` + list.map((i) => {
        const sl = G.inv.slots[i], it = ITEMS[sl.id], cost = repairCost(G, i) || {};
        const afford = Object.keys(cost).every((id) => have(G, id) >= cost[id]);
        const cs = Object.keys(cost).map((id) => cost[id] + " " + ITEMS[id].name.toLowerCase()).join(", ");
        return `<div><canvas data-icon="${sl.id}"></canvas><span><b>${it.name}</b><small>${sl.d} / ${it.tool.dur} &middot; ${cs || "free"}</small><i><s style="width:${((sl.d / it.tool.dur) * 100).toFixed(0)}%"></s></i></span>
          <button data-a="fix" data-i="${i}" ${afford && near ? "" : "disabled"}>Repair</button></div>`;
      }).join("") + `</div><button data-a="fixall" style="width:100%;margin-top:10px" ${near ? "" : "disabled"}>Repair everything I can afford</button>`;
    }
    s += `<button data-a="back" style="width:100%;margin-top:10px">Back</button>`;
    return s;
  }

  // ---------------------------------------------------------------------------------------------------------
  // preview: a little sky + the renderer's house art; during the build animation the new level rises out of a
  // dust cloud behind scaffolding, then sparkles and a banner
  function drawPreview(dt) {
    const cv = prevCanvas; if (!cv || !ctx.G) return;
    const k = dpr(), W = cv.clientWidth || 320, H = cv.clientHeight || 200;
    if (cv.width !== Math.round(W * k) || cv.height !== Math.round(H * k)) { cv.width = Math.round(W * k); cv.height = Math.round(H * k); }
    const g = cv.getContext("2d"), G = ctx.G;
    g.setTransform(k, 0, 0, k, 0, 0);
    const sv = Math.max(0.15, sun(G)), night = sv < 0.5;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, night ? "#0f1838" : "#6fb3e8"); sky.addColorStop(1, night ? "#2a3560" : "#cfe8f4");
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    if (night) { g.fillStyle = "rgba(255,255,240,.8)"; for (let i = 0; i < 24; i++) { const x = (i * 97.3) % W, y = (i * 41.7) % (H * 0.5); g.fillRect(x, y, 1.5, 1.5); } }
    // distant hills
    g.fillStyle = night ? "#1d2a3a" : "#8fb59a";
    g.beginPath(); g.moveTo(0, H * 0.72); for (let x = 0; x <= W; x += 16) g.lineTo(x, H * 0.66 - Math.sin(x * 0.02) * 10 - Math.sin(x * 0.051) * 6); g.lineTo(W, H); g.lineTo(0, H); g.fill();
    g.fillStyle = night ? "#22351f" : "#5f9a3c"; g.fillRect(0, H * 0.86, W, H * 0.14);
    let lv = tab === "now" ? G.house.level : Math.min(HOUSE_MAX, G.house.level + 1);
    const box = { x: 8, y: 6, w: W - 16, h: H * 0.86 + 2 - 6 };
    let reveal = 1;
    const A = anim && !anim.finished ? anim : null;
    if (A) {
      A.t += dt; lv = A.lv;
      reveal = Math.min(1, anim.t / 1.3);
      if (!A.done && A.t > 1.6) { A.done = true; key = ""; }
    }
    try {
      g.save();
      if (reveal < 1) { const e = 1 - Math.pow(1 - reveal, 3), top = box.y + box.h * (1 - e); g.beginPath(); g.rect(0, top, W, H); g.clip(); }
      ctx.renderer.drawHouse(g, lv, box.x, box.y, box.w, box.h, { preview: true, night, time: A ? A.t : 0 });
      g.restore();
    } catch (e) { g.restore(); }
    if (A) {
      const t = A.t;
      // scaffolding poles while it rises
      if (t < 1.4) {
        g.strokeStyle = `rgba(150,110,60,${Math.min(1, (1.4 - t) * 2)})`; g.lineWidth = 2;
        for (let i = 0; i < 6; i++) { const x = W * (0.2 + i * 0.12); g.beginPath(); g.moveTo(x, H * 0.87); g.lineTo(x, H * 0.25); g.stroke(); }
        for (let j = 0; j < 4; j++) { const y = H * (0.8 - j * 0.15); g.beginPath(); g.moveTo(W * 0.18, y); g.lineTo(W * 0.82, y); g.stroke(); }
      }
      // dust + sparkles (deterministic per particle index so nothing allocates)
      for (let i = 0; i < 40; i++) {
        const a = (i * 2.399) % 6.283, life = (t * 1.3 + i * 0.037) % 1.2;
        if (t > 1.9) break;
        const r = 10 + life * 70, x = W / 2 + Math.cos(a) * r * 1.4, y = H * 0.86 - Math.abs(Math.sin(a)) * r * 0.5;
        g.fillStyle = `rgba(214,190,150,${Math.max(0, 0.45 - life * 0.35)})`;
        g.beginPath(); g.arc(x, y, 6 + life * 10, 0, 6.283); g.fill();
      }
      if (t > 0.9) {
        for (let i = 0; i < 22; i++) {
          const ph = (t * 2 + i * 0.13) % 1, x = W * (0.15 + ((i * 0.618) % 1) * 0.7), y = H * (0.15 + ((i * 0.377) % 1) * 0.6) - ph * 12;
          const s = (1 - Math.abs(ph * 2 - 1)) * 5;
          g.fillStyle = i % 3 ? "#fff3c4" : "#9fe3ff";
          g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.35, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.35, y); g.closePath(); g.fill();
          g.beginPath(); g.moveTo(x - s, y); g.lineTo(x, y + s * 0.35); g.lineTo(x + s, y); g.lineTo(x, y - s * 0.35); g.closePath(); g.fill();
        }
      }
      if (t > 1.2) {
        const a = Math.min(1, (t - 1.2) * 3, (3.2 - t) * 2), sc = 1 + Math.max(0, 0.25 - (t - 1.2));
        g.save(); g.globalAlpha = a; g.translate(W / 2, H * 0.16); g.scale(sc, sc);
        g.font = "900 22px system-ui,sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
        g.lineWidth = 5; g.strokeStyle = "rgba(40,20,0,.75)"; g.strokeText("LEVEL " + A.lv + "!", 0, 0);
        g.fillStyle = "#ffd77a"; g.fillText("LEVEL " + A.lv + "!", 0, 0);
        g.restore();
      }
      if (t > 3.2) A.finished = true;
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  // the final celebration (level 20): confetti + the cube's crown + a few stats
  function celebrate(G) {
    const el = document.createElement("div"); el.className = "bh-cele";
    const st = G.stats || {};
    el.innerHTML = `<canvas></canvas><h2>Cube Monarch!</h2><p>The Crystal Citadel is complete. Twenty levels, from a lean-to of branches to a spire of crystal. Wear your crown with pride.</p>
      <div class="bh-stats"><span>Day ${G.time.day}</span><span>${st.treesFelled | 0} trees felled</span><span>${st.mined | 0} blocks mined</span>
      <span>${st.hunted | 0} animals hunted</span><span>${st.crafted | 0} items crafted</span><span>${st.eaten | 0} meals</span></div>
      <button data-a="hooray" class="bh-up" style="max-width:260px">Hooray!</button>`;
    const parts = [];
    for (let i = 0; i < 120; i++) parts.push({ x: Math.random(), y: -Math.random() * 0.6, vx: (Math.random() - 0.5) * 0.15, vy: 0.12 + Math.random() * 0.25, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 8, c: ["#ffd77a", "#9fe3ff", "#ff8aa8", "#a7e38a", "#ffffff", "#c9a7ff"][i % 6] });
    cele = { el, parts, cv: el.querySelector("canvas"), t: 0 };
  }
  function drawCele(dt) {
    const c = cele, cv = c.cv, k = dpr(), W = cv.clientWidth || 400, H = cv.clientHeight || 400;
    if (cv.width !== Math.round(W * k)) { cv.width = Math.round(W * k); cv.height = Math.round(H * k); }
    const g = cv.getContext("2d"); g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, W, H);
    c.t += dt;
    for (const p of c.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      if (p.y > 1.05) { p.y = -0.05; p.x = Math.random(); }
      g.save(); g.translate(p.x * W, p.y * H); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-4, -2.5, 8, 5); g.restore();
    }
    // a crown over the title
    const h2 = c.el.querySelector("h2"), cx = W / 2, cy = (h2 ? h2.offsetTop - 26 : H / 2 - 120) + Math.sin(c.t * 2) * 3;
    g.fillStyle = "#f2c14e"; g.strokeStyle = "#8a5a12"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx - 28, cy + 14); g.lineTo(cx - 30, cy - 10); g.lineTo(cx - 14, cy + 2); g.lineTo(cx, cy - 16); g.lineTo(cx + 14, cy + 2); g.lineTo(cx + 30, cy - 10); g.lineTo(cx + 28, cy + 14); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#7fd3ff"; g.beginPath(); g.arc(cx, cy + 6, 4, 0, 6.283); g.fill();
    g.fillStyle = "#ff7a9a"; g.beginPath(); g.arc(cx - 16, cy + 8, 3, 0, 6.283); g.arc(cx + 16, cy + 8, 3, 0, 6.283); g.fill();
  }

  // ---------------------------------------------------------------------------------------------------------
  function onClick(e) {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    const G = ctx.G, a = b.dataset.a;
    if (a === "close") { ctx.closePanel(); return; }
    if (a === "tab") { tab = b.dataset.t; render(); return; }
    if (a === "up") {
      if (!nearHome(G)) return;
      const lv = G.house.level + 1;
      if (upgrade(G)) {
        ctx.save();
        anim = { lv, t: 0, done: false };
        tab = "now";
        if (lv === HOUSE_MAX) celebrate(G);
        else { const L = houseLevel(lv); ctx.toast("You are now: " + L.title, 3200); }
        try { ctx.app.audio.sfx("click", { vol: 0.6 }); } catch (err) { /* audio optional */ }
      }
      render(); return;
    }
    if (a === "see") { ctx.closePanel(); return; }
    if (a === "sleep") { const c = canSleep(G); if (c.ok && sleep(G)) { ctx.closePanel(); ctx.save(); ctx.toast(G.house.level >= 5 ? "You wake up rested and healed." : "You wake up feeling a bit better.", 2600); } else render(); return; }
    if (a === "chest") { ctx.openPanel("chest", { house: true }); return; }
    if (a === "garden") { harvestGarden(G); ctx.save(); render(); return; }
    if (a === "repair") { view = "repair"; render(); return; }
    if (a === "all") { view = "all"; panel.scrollTop = 0; render(); panel.scrollTop = 0; return; }
    if (a === "back") { view = "main"; render(); return; }
    if (a === "fix") { if (repair(G, +b.dataset.i)) ctx.toast("Repaired!", 1200); render(); return; }
    if (a === "fixall") { let n = 0; for (const i of damagedTools(G)) if (repair(G, i)) n++; ctx.toast(n ? "Repaired " + n + " tool" + (n > 1 ? "s" : "") : "Not enough materials", 1500); render(); return; }
    if (a === "hooray") { if (cele) { cele.el.remove(); cele = null; } return; }
  }
  function open(data) {
    close();
    view = data && data.tab === "repair" ? "repair" : "main";
    tab = ctx.G.house.level >= HOUSE_MAX ? "now" : "next";
    panel = document.createElement("div"); panel.className = "bh-panel";
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "House");
    panel.addEventListener("click", onClick);
    ctx.root.appendChild(panel);
    render();
  }
  ctx.registerPanel("house", { open, close });

  // outside the panel: a title toast on real upgrades (e.g. built from a debug call / another UI)
  return {
    frame(dt) {
      if (!panel || !ctx.G) return;
      const d = Math.min(0.1, dt || 0.016);
      if (stateKey() !== key) render();
      if (anim && !anim.finished) drawPreview(d);
      if (cele) drawCele(d);
    },
    destroy() { close(); for (const e of els) e.remove(); els.length = 0; },
  };
}
