// src/games/pighide/scripts/shops.js - PIG HIDE's five lobby kiosks (spec 27 §10.2-§10.4).
//
//   pig-skins     Pig Skin Boutique   cosmetic pig skins, Oofbux
//   hunter-skins  Hunter Armory       cosmetic hunter skins, Oofbux
//   pig-lab       Pig Upgrade Lab     the pig ladder (lifetime pig wins, never spent)
//   hunter-range  Hunter Range        the hunter ladder (lifetime hunter wins, never spent)
//   radar         Radar Vault         the 1000-pig-win Pig Radar item
//
// One panel at a time, and closing it is OUR job (the platform never closes a Place's panel
// at teardown). Previews are 96x96 2D canvases, never a second WebGL context, drawn once per
// item and released in dispose. Text goes in via textContent only.
//
// The save is mutated only through the config.js helpers, and only after economy.spend has
// returned true for a purchase. `models.onChange()` lets game.js persist the save.

import {
  PIG_SKINS, HUNTER_SKINS, PIG_CLASSES, HUNTER_CLASSES, PIG_ITEM, REWARDS, AMAZING_TRIM,
  ownsPigSkin, ownsHunterSkin, grantPigSkin, grantHunterSkin, equipPigSkin, equipHunterSkin,
  pigClassUnlocked, hunterClassUnlocked, pigTierUnlockable, hunterTierUnlockable,
  unlockNextPig, unlockNextHunter, equipPig, equipHunter,
  radarClaimable, claimRadar, setRadarEquipped, pigSkin, hunterSkin,
} from "./config.js";
import { KIOSKS } from "./city.js";

const TITLES = {
  "pig-skins": "🐷 Pig Skin Boutique",
  "hunter-skins": "🎯 Hunter Armory",
  "pig-lab": "🧪 Pig Upgrade Lab",
  "hunter-range": "🚀 Hunter Range",
  radar: "📡 Radar Vault",
};

const CARD = "background:var(--oof-surface2, #1d2130);border-radius:12px;padding:10px 12px;margin:0 0 10px;";
const DIM = "var(--oof-text-dim, #9aa3b8)";
const GOLD = "#f2c94c";

function fmt(n) {
  return Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("en-US");
}

function el(tag, style, text) {
  const n = document.createElement(tag);
  if (style) n.style.cssText = style;
  if (text != null) n.textContent = String(text);
  return n;
}

// ---- preview drawing -----------------------------------------------------------------------

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function circle(g, x, y, r, fill) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
}

function drawPig(g, colors, pattern, classId) {
  const c = colors;
  // backdrop glow
  const grad = g.createRadialGradient(48, 52, 6, 48, 52, 48);
  grad.addColorStop(0, "rgba(255,255,255,0.18)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 96, 96);
  // legs
  g.fillStyle = c.body;
  for (const x of [26, 38, 56, 68]) { rr(g, x - 4, 60, 9, 18, 3); g.fill(); }
  g.fillStyle = c.hoof;
  for (const x of [26, 38, 56, 68]) { rr(g, x - 4, 74, 9, 6, 2); g.fill(); }
  // tail
  g.strokeStyle = c.snout; g.lineWidth = 3;
  g.beginPath(); g.arc(17, 44, 5, 0, Math.PI * 1.6); g.stroke();
  // body
  const wide = classId === "strong" ? 1.18 : 1;
  g.fillStyle = c.body;
  g.beginPath(); g.ellipse(46, 52, 28 * wide, 19, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = c.belly;
  g.beginPath(); g.ellipse(46, 60, 20 * wide, 9, 0, 0, Math.PI * 2); g.fill();
  // pattern
  if (pattern === "spots") {
    for (const [x, y, r] of [[34, 45, 5], [52, 42, 4], [60, 54, 5], [40, 56, 3]]) circle(g, x, y, r, c.accent);
  } else if (pattern === "stripes") {
    g.fillStyle = c.accent;
    for (const x of [32, 44, 56]) { rr(g, x, 35, 5, 30, 2); g.fill(); }
  } else if (pattern === "sparkle" || pattern === "galaxy") {
    g.fillStyle = pattern === "galaxy" ? "#ffffff" : c.accent;
    for (const [x, y] of [[30, 44], [48, 38], [60, 50], [40, 60], [55, 62], [36, 52]]) {
      g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill();
    }
  } else if (pattern === "rainbow") {
    const cols = ["#ff5a5a", "#ffb21a", "#f2c94c", "#5bd16a", "#4f8fd9", "#b98aff"];
    cols.forEach((col, i) => { g.fillStyle = col; g.globalAlpha = 0.55; rr(g, 26 + i * 7, 38, 6, 26, 2); g.fill(); });
    g.globalAlpha = 1;
  }
  // head
  circle(g, 72, 40, 15, c.body);
  // ears
  g.fillStyle = c.ear;
  g.beginPath(); g.moveTo(63, 28); g.lineTo(66, 16); g.lineTo(72, 27); g.fill();
  g.beginPath(); g.moveTo(74, 26); g.lineTo(82, 16); g.lineTo(82, 30); g.fill();
  // snout
  g.fillStyle = c.snout;
  g.beginPath(); g.ellipse(84, 45, 7, 6, 0, 0, Math.PI * 2); g.fill();
  circle(g, 82, 45, 1.5, c.hoof);
  circle(g, 86.5, 45, 1.5, c.hoof);
  // eye
  circle(g, 72, 36, 3, "#ffffff");
  circle(g, 73, 36, 1.6, "#1a1a1a");
  // class accessory
  if (classId === "speedy") {
    g.fillStyle = "#f2c94c";
    g.beginPath(); g.moveTo(40, 40); g.lineTo(34, 52); g.lineTo(40, 51); g.lineTo(36, 62); g.lineTo(47, 47); g.lineTo(41, 48); g.fill();
  } else if (classId === "creeper") {
    g.fillStyle = "#1a1a24"; rr(g, 60, 33, 26, 6, 2); g.fill();
  } else if (classId === "flying") {
    g.fillStyle = "#7a4a2a"; g.beginPath(); g.ellipse(72, 27, 12, 6, 0, Math.PI, 0); g.fill();
    g.fillStyle = "#ffffff"; g.beginPath(); g.ellipse(36, 34, 14, 6, -0.4, 0, Math.PI * 2); g.fill();
  } else if (classId === "casoh") {
    g.fillStyle = "#5d626c";
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(60 + i * 5, 52); g.lineTo(62 + i * 5, 46); g.lineTo(64 + i * 5, 52); g.fill(); }
  } else if (classId === "boar") {
    g.fillStyle = "#3a2a1a";
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(30 + i * 7, 35); g.lineTo(33 + i * 7, 27); g.lineTo(36 + i * 7, 35); g.fill(); }
    g.fillStyle = "#f7efe2"; g.beginPath(); g.moveTo(80, 50); g.lineTo(78, 58); g.lineTo(83, 51); g.fill();
  } else if (classId === "scientist") {
    g.fillStyle = "#ffffff"; rr(g, 28, 46, 38, 16, 4); g.fill();
    circle(g, 70, 28, 5, "#ffffff"); circle(g, 77, 25, 5, "#ffffff");
    g.fillStyle = "#5bd16a"; rr(g, 24, 28, 7, 12, 2); g.fill();
  } else if (classId === "strong") {
    g.fillStyle = "#d94f4f"; rr(g, 60, 30, 24, 4, 2); g.fill();
  }
}

function drawHunter(g, colors, classId) {
  const c = colors;
  const amazing = classId === "amazing";
  const trim = amazing ? AMAZING_TRIM : c.trim;
  const grad = g.createRadialGradient(48, 50, 6, 48, 50, 48);
  grad.addColorStop(0, "rgba(255,255,255,0.15)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 96, 96);
  if (amazing) { g.strokeStyle = GOLD; g.lineWidth = 2; g.beginPath(); g.ellipse(48, 86, 24, 5, 0, 0, Math.PI * 2); g.stroke(); }
  // cape
  g.fillStyle = c.cape;
  g.beginPath(); g.moveTo(32, 34); g.lineTo(64, 34); g.lineTo(70, 80); g.lineTo(26, 80); g.fill();
  // legs
  g.fillStyle = c.suit;
  rr(g, 36, 60, 10, 22, 3); g.fill();
  rr(g, 50, 60, 10, 22, 3); g.fill();
  g.fillStyle = c.armor;
  rr(g, 34, 78, 13, 6, 2); g.fill();
  rr(g, 49, 78, 13, 6, 2); g.fill();
  // torso
  g.fillStyle = c.suit; rr(g, 32, 34, 32, 30, 6); g.fill();
  g.fillStyle = c.armor; rr(g, 37, 38, 22, 16, 4); g.fill();
  circle(g, 48, 46, 3.5, c.glow);
  g.fillStyle = trim; rr(g, 32, 58, 32, 4, 1); g.fill();
  // shoulders
  circle(g, 31, 38, 6, c.armor);
  circle(g, 65, 38, 6, c.armor);
  // arms
  g.fillStyle = c.suit;
  rr(g, 24, 38, 8, 22, 3); g.fill();
  rr(g, 64, 38, 8, 22, 3); g.fill();
  // helmet + visor
  g.fillStyle = c.armor; rr(g, 36, 12, 24, 22, 8); g.fill();
  g.fillStyle = c.visor; rr(g, 38, 19, 20, 8, 3); g.fill();
  g.fillStyle = c.glow; rr(g, 40, 21, 16, 3, 1.5); g.fill();
  g.strokeStyle = trim; g.lineWidth = 2; g.beginPath(); g.moveTo(56, 12); g.lineTo(60, 4); g.stroke();
  circle(g, 60, 4, 2, c.glow);
  // weapon
  const w = classId;
  if (w === "basic") { circle(g, 68, 62, 4, trim); }
  else if (w === "sword") { g.fillStyle = "#b98a52"; rr(g, 68, 34, 4, 28, 1); g.fill(); g.fillStyle = "#7a4a2a"; rr(g, 64, 60, 12, 3, 1); g.fill(); }
  else if (w === "glock" || w === "glock-speed") {
    g.fillStyle = c.trim; rr(g, 66, 54, 16, 7, 2); g.fill(); g.fillStyle = "#ffb21a"; rr(g, 80, 54, 4, 7, 1); g.fill();
    if (w === "glock-speed") { g.fillStyle = c.glow; g.beginPath(); g.moveTo(34, 84); g.lineTo(24, 88); g.lineTo(34, 80); g.fill(); }
  } else if (w === "bomber") { circle(g, 72, 62, 6, "#2b2b2b"); circle(g, 75, 55, 2, "#ffd36f"); }
  else { g.fillStyle = "#5d626c"; rr(g, 56, 26, 30, 7, 3); g.fill(); g.fillStyle = "#d94f4f"; rr(g, 84, 26, 5, 7, 2); g.fill(); }
  if (w === "detector" || amazing) { g.strokeStyle = "#ff1a1a"; g.lineWidth = 2; g.beginPath(); g.arc(30, 22, 7, Math.PI * 0.9, Math.PI * 2.1); g.stroke(); }
  if (amazing) { g.fillStyle = "#fff4b0"; g.beginPath(); g.moveTo(40, 16); g.lineTo(18, 6); g.lineTo(18, 26); g.fill(); }
}

function drawRadar(g, claimed) {
  const grad = g.createRadialGradient(48, 48, 4, 48, 48, 46);
  grad.addColorStop(0, "rgba(255,255,0,0.35)");
  grad.addColorStop(1, "rgba(255,255,0,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 96, 96);
  g.strokeStyle = "#ffff00"; g.lineWidth = 3;
  for (const r of [12, 24, 36]) { g.beginPath(); g.arc(48, 70, r, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
  g.fillStyle = "#d4a428"; rr(g, 40, 66, 16, 18, 3); g.fill();
  circle(g, 48, 64, 6, claimed ? "#ffff00" : "#5d626c");
}

function lockOverlay(g) {
  g.fillStyle = "rgba(10,10,20,0.55)";
  g.fillRect(0, 0, 96, 96);
  g.fillStyle = "#f2f4fa";
  rr(g, 38, 46, 20, 16, 3); g.fill();
  g.strokeStyle = "#f2f4fa"; g.lineWidth = 3;
  g.beginPath(); g.arc(48, 46, 6, Math.PI, 0); g.stroke();
}

// =====================================================================================

export function createShops(ctx, S, models) {
  const ui = ctx.services.ui;
  const cache = new Map();   // key -> canvas
  let cur = null;            // { id, handle, body }
  const M = models || {};

  function canvas(key, draw) {
    let c = cache.get(key);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = 96; c.height = 96;
    c.style.cssText = "width:100%;height:100%;";
    const g = c.getContext("2d");
    if (g) { try { draw(g); } catch { /* preview only */ } }
    cache.set(key, c);
    return c;
  }

  function sfx(name) {
    try { ctx.engine.audio.playSfx(name, { volume: 0.8 }); } catch { /* optional */ }
  }
  function toast(text, icon) {
    try { ui.toast(text, { icon, duration: 2.6 }); } catch { /* optional */ }
  }
  function changed() {
    if (typeof M.onChange === "function") { try { M.onChange(); } catch { /* game.js toasts */ } }
  }
  function inRound() { return S.phase !== "lobby"; }

  function nearest(pos) {
    if (!Array.isArray(pos)) return null;
    let best = null, bestD = Infinity;
    for (const k of KIOSKS) {
      const dx = pos[0] - k.pos[0], dz = pos[2] - k.pos[2];
      const d = Math.hypot(dx, dz);
      if (d <= k.radius && d < bestD && Math.abs(pos[1] - k.pos[1]) < 8) { best = k; bestD = d; }
    }
    return best;
  }

  // ---- items per kiosk ---------------------------------------------------------------------

  function pigSkinItems() {
    const cls = S.save.pigClass;
    return PIG_SKINS.map((s) => ({
      id: s.id, name: s.name, price: s.price,
      owned: ownsPigSkin(S.save, s.id), equipped: S.save.pigSkin === s.id,
      iconCanvas: canvas("ps:" + s.id + ":" + cls, (g) => drawPig(g, s.colors, s.pattern, cls)),
    }));
  }

  function hunterSkinItems() {
    const cls = S.save.hunterClass;
    return HUNTER_SKINS.map((s) => ({
      id: s.id, name: s.name, price: s.price,
      owned: ownsHunterSkin(S.save, s.id), equipped: S.save.hunterSkin === s.id,
      iconCanvas: canvas("hs:" + s.id + ":" + cls, (g) => drawHunter(g, s.colors, cls)),
    }));
  }

  function pigLabItems() {
    const sk = pigSkin(S.save.pigSkin);
    return PIG_CLASSES.map((c) => {
      const unlocked = pigClassUnlocked(S.save, c.id);
      return {
        id: c.id,
        name: c.icon + " " + c.name,
        tag: unlocked ? null : (pigTierUnlockable(S.save) && pigTierUnlockable(S.save).id === c.id ? "⬆ Upgrade free!" : "🔒 " + fmt(c.need) + " pig wins"),
        price: 0, owned: unlocked, equipped: S.save.pigClass === c.id,
        iconCanvas: canvas("pl:" + c.id + ":" + sk.id + ":" + (unlocked ? 1 : 0), (g) => {
          drawPig(g, sk.colors, sk.pattern, c.id);
          if (!unlocked) lockOverlay(g);
        }),
      };
    });
  }

  function hunterRangeItems() {
    const sk = hunterSkin(S.save.hunterSkin);
    return HUNTER_CLASSES.map((c) => {
      const unlocked = hunterClassUnlocked(S.save, c.id);
      return {
        id: c.id,
        name: c.icon + " " + c.name,
        tag: unlocked ? null : (hunterTierUnlockable(S.save) && hunterTierUnlockable(S.save).id === c.id ? "⬆ Upgrade free!" : "🔒 " + fmt(c.need) + " hunter wins"),
        price: 0, owned: unlocked, equipped: S.save.hunterClass === c.id,
        iconCanvas: canvas("hr:" + c.id + ":" + sk.id + ":" + (unlocked ? 1 : 0), (g) => {
          drawHunter(g, sk.colors, c.id);
          if (!unlocked) lockOverlay(g);
        }),
      };
    });
  }

  function radarItems() {
    const claimed = !!S.save.radarClaimed;
    return [{
      id: PIG_ITEM.id,
      name: PIG_ITEM.icon + " " + PIG_ITEM.name,
      tag: claimed ? null : radarClaimable(S.save) ? "⬆ Claim it!" : "🔒 " + fmt(PIG_ITEM.need) + " pig wins",
      price: 0, owned: claimed, equipped: claimed && !!S.save.radarEquipped,
      iconCanvas: canvas("rd:" + (claimed ? 1 : 0), (g) => { drawRadar(g, claimed); if (!claimed) lockOverlay(g); }),
    }];
  }

  // ---- selection ---------------------------------------------------------------------------

  function laterNote() {
    if (inRound()) toast("Takes effect next round", "⏳");
  }

  function selectSkin(kind, item) {
    const owns = kind === "pig" ? ownsPigSkin : ownsHunterSkin;
    const equip = kind === "pig" ? equipPigSkin : equipHunterSkin;
    const grant = kind === "pig" ? grantPigSkin : grantHunterSkin;
    const list = kind === "pig" ? PIG_SKINS : HUNTER_SKINS;
    const row = list.find((s) => s.id === item.id);
    if (!row) return;
    if (owns(S.save, row.id)) {
      equip(S.save, row.id);
      sfx("click");
      toast("Equipped " + row.name, row.icon);
      laterNote();
      changed();
      return;
    }
    let paid = false;
    try { paid = row.price <= 0 || ctx.services.economy.spend(row.price, REWARDS.reasonSkin); } catch { paid = false; }
    if (!paid) {
      sfx("denied");
      toast("Not enough Oofbux", "💸");
      return;
    }
    grant(S.save, row.id);
    sfx("purchase");
    try { ctx.services.badges.award("new-look"); } catch { /* optional */ }
    toast("New look: " + row.name + "!", row.icon);
    laterNote();
    changed();
  }

  function selectClass(kind, item) {
    const isPig = kind === "pig";
    const list = isPig ? PIG_CLASSES : HUNTER_CLASSES;
    const row = list.find((c) => c.id === item.id);
    if (!row) return;
    const unlocked = isPig ? pigClassUnlocked(S.save, row.id) : hunterClassUnlocked(S.save, row.id);
    if (unlocked) {
      (isPig ? equipPig : equipHunter)(S.save, row.id);
      sfx("click");
      toast("Equipped " + row.name, row.icon);
      laterNote();
      changed();
      return;
    }
    const next = isPig ? pigTierUnlockable(S.save) : hunterTierUnlockable(S.save);
    if (next && next.id === row.id) {
      (isPig ? unlockNextPig : unlockNextHunter)(S.save);
      sfx("fanfare");
      toast("⬆ Upgraded to " + row.name + "!", row.icon);
      laterNote();
      changed();
      return;
    }
    const have = isPig ? S.save.pigWins : S.save.hunterWins;
    sfx("denied");
    const i = list.indexOf(row);
    const tier = isPig ? S.save.pigTier : S.save.hunterTier;
    if (i > tier + 1 && have >= row.need) toast("Unlock the rungs below it first", "🔒");
    else toast("Need " + fmt(row.need) + " " + kind + " wins (you have " + fmt(have) + ")", "🔒");
  }

  function selectRadar() {
    if (radarClaimable(S.save)) {
      claimRadar(S.save);
      sfx("fanfare");
      toast("You claimed the Pig Radar! Press T as a pig.", PIG_ITEM.icon);
      changed();
      return;
    }
    if (S.save.radarClaimed) {
      setRadarEquipped(S.save, !S.save.radarEquipped);
      sfx("click");
      toast(S.save.radarEquipped ? "Pig Radar equipped" : "Pig Radar put away", PIG_ITEM.icon);
      changed();
      return;
    }
    sfx("denied");
    toast("Need " + fmt(PIG_ITEM.need) + " pig wins (you have " + fmt(S.save.pigWins) + ")", "🔒");
  }

  // ---- painting ----------------------------------------------------------------------------

  function header(body, lines) {
    const card = el("div", CARD);
    for (const [text, style] of lines) card.appendChild(el("div", style || "", text));
    body.appendChild(card);
  }

  function blurbs(body, list, unlockedFn) {
    const card = el("div", CARD + "font-size:13px;line-height:1.45;");
    for (const c of list) {
      const row = el("div", "margin:2px 0;color:" + (unlockedFn(c) ? "inherit" : DIM));
      row.appendChild(el("b", "", c.icon + " " + c.name + " "));
      row.appendChild(el("span", "", "(" + fmt(c.need) + ") — " + c.blurb));
      card.appendChild(row);
    }
    body.appendChild(card);
  }

  function render() {
    if (!cur) return;
    const body = cur.body;
    while (body.firstChild) body.removeChild(body.firstChild);
    const save = S.save;
    let items = [];
    let onSelect = () => {};
    const bal = (() => { try { return ctx.services.economy.balance(); } catch { return 0; } })();
    switch (cur.id) {
      case "pig-skins":
        header(body, [["Skins are just for looks. Your pig keeps its class and powers.", "color:" + DIM],
          ["You have " + fmt(bal) + " Oofbux", "font-weight:700;margin-top:4px;"]]);
        items = pigSkinItems();
        onSelect = (it) => selectSkin("pig", it);
        break;
      case "hunter-skins":
        header(body, [["Suit up! Skins change your hunter's armor colours.", "color:" + DIM],
          ["You have " + fmt(bal) + " Oofbux", "font-weight:700;margin-top:4px;"]]);
        items = hunterSkinItems();
        onSelect = (it) => selectSkin("hunter", it);
        break;
      case "pig-lab": {
        const next = pigTierUnlockable(save);
        header(body, [["🐷 Pig wins: " + fmt(save.pigWins), "font-weight:700;font-size:16px;"],
          [next ? "⬆ " + next.name + " is ready! Tap it to upgrade (free)." : "Win as a pig to unlock the next pig. Wins are never spent.",
            "margin-top:4px;color:" + (next ? GOLD : DIM)]]);
        items = pigLabItems();
        onSelect = (it) => selectClass("pig", it);
        break;
      }
      case "hunter-range": {
        const next = hunterTierUnlockable(save);
        header(body, [["🎯 Hunter wins: " + fmt(save.hunterWins), "font-weight:700;font-size:16px;"],
          [next ? "⬆ " + next.name + " is ready! Tap it to upgrade (free)." : "Catch every pig to win as the hunter. Wins are never spent.",
            "margin-top:4px;color:" + (next ? GOLD : DIM)]]);
        items = hunterRangeItems();
        onSelect = (it) => selectClass("hunter", it);
        break;
      }
      case "radar":
        header(body, [[PIG_ITEM.blurb, "color:" + DIM],
          ["🐷 Pig wins: " + fmt(save.pigWins) + " / " + fmt(PIG_ITEM.need), "font-weight:700;margin-top:4px;"]]);
        items = radarItems();
        onSelect = () => selectRadar();
        break;
      default:
        return;
    }
    const grid = ui.shopGrid({
      items,
      onSelect: (it) => { onSelect(it); render(); },
    });
    // Ladder rungs and the radar are not bought: swap the Oofbux price line on a locked
    // card for what it actually needs (wins), so nothing reads as "costs 0".
    const cards = grid && grid.children ? Array.from(grid.children) : [];
    items.forEach((it, i) => {
      if (!it.tag || !cards[i]) return;
      const price = cards[i].querySelector(".oof-grid-price");
      if (!price) return;
      while (price.firstChild) price.removeChild(price.firstChild);
      price.appendChild(el("span", "font-size:12px;color:" + (it.tag.startsWith("⬆") ? GOLD : DIM), it.tag));
    });
    body.appendChild(grid);
    if (cur.id === "pig-lab") blurbs(body, PIG_CLASSES, (c) => pigClassUnlocked(save, c.id));
    if (cur.id === "hunter-range") blurbs(body, HUNTER_CLASSES, (c) => hunterClassUnlocked(save, c.id));
  }

  function open(kioskId) {
    if (!TITLES[kioskId]) return;
    close();
    const handle = ui.openPanel({
      title: TITLES[kioskId],
      onClose: () => { if (cur && cur.handle === handle) cur = null; },
    });
    const body = handle && (handle.bodyEl || handle.el);
    if (!body) {
      if (handle && typeof handle.close === "function") { try { handle.close(); } catch { /* fine */ } }
      return;
    }
    cur = { id: kioskId, handle, body };
    try { ctx.engine.audio.playSfx("ui_open", { volume: 0.6 }); } catch { /* optional */ }
    render();
  }

  function close() {
    const h = cur ? cur.handle : null;
    cur = null;
    if (h && typeof h.close === "function") { try { h.close(); } catch { /* gone */ } }
  }

  function dispose() {
    close();
    for (const c of cache.values()) { c.width = 0; c.height = 0; }
    cache.clear();
  }

  return {
    nearest,
    open,
    isOpen: () => cur !== null,
    openId: () => (cur ? cur.id : null),
    close,
    refresh: render,
    dispose,
  };
}
