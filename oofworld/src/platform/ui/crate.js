// src/platform/ui/crate.js — the Troll Crate. Spec 21 §4 owns this.
//
// The one rule that matters here: **the odds you are shown are computed from the table
// that rolls.** Not typed next to it, not rounded into a comment — derived, at render
// time, from the same weights `rollCrate` sums. A crate whose displayed odds can drift
// from its real ones is a lie with a UI on top, and this one advertises a 1-in-4,500,
// which is exactly the kind of number nobody can check by playing.
//
// The weights are integers out of 4,500 so the three stated odds are exact rather than
// nearly right: 1500/4500 is 1 in 3 to the last decimal place, 1125/4500 is 1 in 4.

import { el, button } from "./kit.js";

export const CRATE_TOTAL = 4500;

// Order is display order, best first. `extras` ride along with `item` — the Troll Crown
// arrives WITH the sparkle aura and the balloon, which is what was asked for.
export const CRATE_TABLE = Object.freeze([
  Object.freeze({
    key: "crown", weight: 1, icon: "👑",
    item: "hat_trollcrown",
    extras: Object.freeze(["aura_sparkle", "gear_balloon"]),
    note: "with the Golden Sparkle aura and the Balloon",
  }),
  Object.freeze({
    key: "trollface", weight: 1125, icon: "😈",
    item: "shirt_trollface", extras: Object.freeze([]), note: null,
  }),
  Object.freeze({
    key: "striped", weight: 1500, icon: "👕",
    item: "shirt_striped", extras: Object.freeze([]), note: null,
  }),
  Object.freeze({
    key: "dud", weight: 1874, icon: "🫥",
    item: null, extras: Object.freeze([]), oofbux: 25,
    note: "the troll wins this one",
  }),
]);

// A duplicate pays this instead. Also what the dud pays, so a crate is never nothing.
export const DUPLICATE_OOFBUX = 25;

export function crateWeightTotal() {
  let n = 0;
  for (const row of CRATE_TABLE) n += row.weight;
  return n;
}

// "1 in 3" reads better than "33.3%" for a drop, but only where it is honest — a ratio
// is shown when the weight divides the total evenly, and a percentage otherwise. Both
// come off the weights, so neither can disagree with the roll.
export function oddsText(weight, total = crateWeightTotal()) {
  if (!weight) return "never";
  const ratio = total / weight;
  const rounded = Math.round(ratio);
  // Locale pinned: a bare toLocaleString() renders 4500 as "4.500" on a German machine
  // and "4 500" on a French one, so the advertised odds would read differently per
  // player and neither the validator nor the suite could compare against a fixed string.
  if (Math.abs(ratio - rounded) < 1e-9) return `1 in ${rounded.toLocaleString("en-US")}`;
  const pct = (weight / total) * 100;
  return `${pct < 10 ? pct.toFixed(2) : pct.toFixed(1)}%`;
}

// rollCrate(rand) -> a CRATE_TABLE row. `rand` defaults to Math.random and is injectable
// so the suite can roll a known sequence, and so spec 21 §6's 200,000-trial check can
// run without one.
export function rollCrate(rand = Math.random) {
  const total = crateWeightTotal();
  let n = rand() * total;
  for (const row of CRATE_TABLE) {
    n -= row.weight;
    if (n < 0) return row;
  }
  return CRATE_TABLE[CRATE_TABLE.length - 1]; // rand() === 1, or a float landing exactly
}

export function createCrate(deps = {}) {
  const { avatar, economy, toast, openPanel, sfx, getCrates, takeCrate, itemName } = deps;

  const nameOf = (id) => (typeof itemName === "function" && itemName(id)) || id;

  const crates = () => (typeof getCrates === "function" ? Math.max(0, getCrates() | 0) : 0);

  // openOne() -> the awarded outcome, already granted. Returns null when there is nothing
  // to open, so a caller cannot mistake "no crates" for "you rolled the dud".
  function openOne(rand) {
    if (crates() <= 0) return null;
    if (typeof takeCrate === "function" && takeCrate() === false) return null;

    const row = rollCrate(rand);
    const granted = [];
    const duplicates = [];

    if (row.item) {
      for (const id of [row.item, ...row.extras]) {
        const had = avatar && avatar.owns ? avatar.owns(id) : false;
        const res = avatar && avatar.grantItem ? avatar.grantItem(id, "trollobby") : null;
        if (res && res.ok && !had) granted.push(id);
        else if (had) duplicates.push(id);
      }
    }

    // Never nothing: the dud pays, and so does every duplicate. Spec 21 §4 — no silent
    // duplicate, so the count is reported rather than swallowed.
    let bux = row.oofbux || 0;
    bux += duplicates.length * DUPLICATE_OOFBUX;
    if (bux > 0 && economy && economy.award) economy.award(bux, "trollobby:crate");

    return { row, granted, duplicates, oofbux: bux };
  }

  function open() {
    const panel = openPanel({ title: "Troll Crate" });
    const body = panel.bodyEl;

    const blurb = el("div", null,
      "Everything in here, and the real odds. These are read off the same weights the "
      + "roll uses, so they cannot drift.");
    blurb.setAttribute("style",
      "color:var(--oof-text-dim);font-size:var(--oof-size-sm);margin-bottom:10px");

    const list = el("div", null);
    list.setAttribute("style", "display:flex;flex-direction:column;gap:6px");
    const total = crateWeightTotal();
    for (const row of CRATE_TABLE) {
      const line = el("div", null);
      line.setAttribute("style",
        "display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:var(--oof-radius-md);"
        + "background:var(--oof-bg-2);border:1px solid var(--oof-line)");
      const icon = el("span", null, row.icon);
      icon.setAttribute("style", "font-size:20px;line-height:1");
      const label = el("div", null);
      label.setAttribute("style", "flex:1;min-width:0");
      const title = el("div", null, row.item ? nameOf(row.item) : `${row.oofbux} Oofbux`);
      title.setAttribute("style", "font-weight:600");
      label.append(title);
      if (row.note) {
        const sub = el("div", null, row.note);
        sub.setAttribute("style", "color:var(--oof-text-dim);font-size:var(--oof-size-sm)");
        label.append(sub);
      }
      const odds = el("span", null, oddsText(row.weight, total));
      odds.setAttribute("style",
        "font-variant-numeric:tabular-nums;color:var(--oof-text-dim);white-space:nowrap");
      line.append(icon, label, odds);
      list.append(line);
    }

    const result = el("div", null, "");
    result.setAttribute("role", "status");
    result.setAttribute("style",
      "min-height:22px;margin-top:12px;font-size:var(--oof-size-sm);text-align:center");

    const count = el("div", null, "");
    count.setAttribute("style",
      "margin-top:10px;color:var(--oof-text-dim);font-size:var(--oof-size-sm);text-align:center");

    let openBtn = null;
    function repaint() {
      const n = crates();
      count.textContent = n === 1 ? "1 crate" : `${n} crates`;
      if (openBtn) openBtn.disabled = n <= 0;
    }

    openBtn = button({
      label: "Open a crate",
      variant: "primary",
      onClick: () => {
        const got = openOne();
        if (!got) { repaint(); return; }
        if (sfx) sfx(got.row.item ? "chime" : "click");
        if (got.granted.length) {
          result.style.color = "var(--oof-good,#3ddc84)";
          result.textContent = `${got.row.icon} ${got.granted.map(nameOf).join(" + ")}!`;
          if (toast) toast(`Crate: ${got.granted.map(nameOf).join(" + ")}`, { icon: got.row.icon });
        } else if (got.duplicates.length) {
          result.style.color = "var(--oof-text-dim)";
          result.textContent =
            `${got.row.icon} ${got.duplicates.map(nameOf).join(" + ")} — already owned, `
            + `so +${got.oofbux} Oofbux instead.`;
        } else {
          result.style.color = "var(--oof-text-dim)";
          result.textContent = `🫥 Nothing. +${got.oofbux} Oofbux for your trouble.`;
        }
        repaint();
      },
    });
    openBtn.setAttribute("style", "width:100%;margin-top:12px");

    body.append(blurb, list, openBtn, result, count);
    repaint();
    return panel;
  }

  return { open, openOne, table: CRATE_TABLE, oddsText, rollCrate };
}
