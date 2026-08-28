// src/platform/ui/ooftools.js — the builder's panel. Spec 18 §5.3 owns this file.
//
// Only the room's leader can open it (the server refuses build ops from anyone else), so
// this file does not police permission — it just would not be reachable otherwise. What
// it does own is being usable on a phone with one thumb, which is why every control is a
// button or a slider and nothing needs a drag on a 3D gizmo.
//
// Every edit goes out as an op and is drawn when it comes BACK off the socket. That is
// one round trip slower than editing locally, and it is deliberate: the leader sees the
// same thing as everyone else, at the same time, so there is no version of the build that
// only the builder can see.

import { el, button } from "./kit.js";

const SHAPES = ["box", "sphere", "cylinder", "wedge"];
const MATERIALS = ["plastic", "neon", "metal", "wood", "ice", "glass", "grass", "lava"];
const EFFECTS = ["none", "spin", "bob", "pulse"];
const AURAS = ["none", "ring", "glow", "sparks"];
const COLORS = [
  "#e74c3c", "#f5c542", "#3ddc84", "#0f5cc2", "#9b59b6",
  "#ff36c8", "#ffffff", "#2b3242",
];
const NUDGE = [0.5, 1, 4];

export function mountOofTools(body, deps = {}) {
  const { build, playerPos, toast } = deps;
  let selected = null; // the part id being edited, or null for "the next one I place"
  let draft = {
    shape: "box", size: [4, 4, 4], position: [0, 0, 0], rotation: [0, 0, 0],
    color: "#e74c3c", material: "plastic", transparency: 0, canCollide: true,
    text: "", effect: "none", aura: "none",
  };

  const status = el("div", null, "");
  status.setAttribute("style", "font-size:var(--oof-size-sm);color:var(--oof-text-dim);margin-bottom:8px");

  const wrap = el("div", null);
  wrap.setAttribute("style", "display:flex;flex-direction:column;gap:10px;max-height:60vh;overflow-y:auto");
  body.append(status, wrap);

  function section(title) {
    const s = el("div", null);
    s.setAttribute("style", "display:flex;flex-direction:column;gap:5px");
    const h = el("div", null, title);
    h.setAttribute("style",
      "font-size:var(--oof-size-sm);font-weight:800;color:var(--oof-text-dim);letter-spacing:0.04em");
    s.appendChild(h);
    return s;
  }

  function chips(values, current, onPick, render) {
    const row = el("div", null);
    row.setAttribute("style", "display:flex;flex-wrap:wrap;gap:4px");
    for (const v of values) {
      const b = el("button", null, render ? "" : String(v));
      b.type = "button";
      const on = v === current;
      b.setAttribute("style",
        "border-radius:999px;padding:5px 10px;font:inherit;font-size:var(--oof-size-sm);cursor:pointer;"
        + `border:1px solid ${on ? "var(--oof-accent,#f7c948)" : "var(--oof-line)"};`
        + `background:${on ? "var(--oof-accent,#f7c948)" : "var(--oof-bg-2)"};`
        + `color:${on ? "#0e1018" : "var(--oof-text)"}`);
      if (render) render(b, v);
      b.addEventListener("click", () => onPick(v));
      row.appendChild(b);
    }
    return row;
  }

  // The part being edited: the selected one if there is one, otherwise the draft that
  // the next Place button will use.
  function target() {
    if (selected) {
      const p = build.get(selected);
      if (p) return p;
      selected = null; // it was deleted by a clear
    }
    return draft;
  }

  function commit(changes) {
    const t = target();
    const next = { ...t, ...changes };
    if (selected) build.updatePart(selected, next);
    else draft = next;
    render();
  }

  function place() {
    const at = playerPos ? playerPos() : [0, 0, 0];
    // In front of you and at eye height, not inside you: a part spawned at your feet is
    // a part you are standing in.
    const p = {
      ...draft,
      position: [at[0], at[1] + 3, at[2] - 6],
    };
    build.add(p);
    if (toast) toast("Placed");
  }

  function render() {
    const t = target();
    const n = build.count();
    status.textContent = selected
      ? `Editing one part — ${n} in this room`
      : `${n} part${n === 1 ? "" : "s"} in this room. Changes below apply to the NEXT part you place.`;

    wrap.replaceChildren();

    // --- place / select -------------------------------------------------------------
    const top = section("PART");
    const topRow = el("div", null);
    topRow.setAttribute("style", "display:flex;gap:6px;flex-wrap:wrap");
    topRow.appendChild(button({ label: "Place", variant: "primary", onClick: place }));
    if (selected) {
      topRow.appendChild(button({
        label: "Deselect", variant: "secondary", onClick: () => { selected = null; render(); },
      }));
      topRow.appendChild(button({
        label: "Delete", variant: "secondary", onClick: () => { build.remove(selected); selected = null; render(); },
      }));
    } else {
      const ids = build.ids();
      topRow.appendChild(button({
        label: ids.length ? "Edit last" : "Nothing to edit",
        variant: "secondary",
        onClick: () => { if (ids.length) { selected = ids[ids.length - 1]; render(); } },
      }));
    }
    topRow.appendChild(button({
      label: "Clear all",
      variant: "secondary",
      onClick: () => { build.clear(); selected = null; render(); },
    }));
    top.appendChild(topRow);
    wrap.appendChild(top);

    // --- shape / material -----------------------------------------------------------
    const shape = section("SHAPE");
    shape.appendChild(chips(SHAPES, t.shape, (v) => commit({ shape: v })));
    wrap.appendChild(shape);

    const mat = section("MATERIAL");
    mat.appendChild(chips(MATERIALS, t.material, (v) => commit({ material: v })));
    wrap.appendChild(mat);

    const col = section("COLOUR");
    col.appendChild(chips(COLORS, t.color, (v) => commit({ color: v }), (b, v) => {
      b.style.background = v;
      b.style.width = "30px";
      b.style.height = "26px";
      b.style.padding = "0";
    }));
    wrap.appendChild(col);

    // --- move / size / turn ---------------------------------------------------------
    wrap.appendChild(axisRow("MOVE", t.position, (i, d) => {
      const p = t.position.slice();
      p[i] += d;
      commit({ position: p });
    }));
    wrap.appendChild(axisRow("SIZE", t.size, (i, d) => {
      const sz = t.size.slice();
      sz[i] = Math.max(0.5, Math.min(200, sz[i] + d));
      commit({ size: sz });
    }));
    wrap.appendChild(axisRow("TURN", t.rotation, (i, d) => {
      const r = t.rotation.slice();
      r[i] = (r[i] + d * 15) % 360;
      commit({ rotation: r });
    }, true));

    // --- transparency / collision ----------------------------------------------------
    const look = section("SEE THROUGH");
    const slider = el("input", null);
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = String(Math.round((t.transparency || 0) * 100));
    slider.setAttribute("aria-label", "Transparency");
    slider.setAttribute("style", "width:100%");
    for (const e of ["keydown", "keyup", "keypress"]) slider.addEventListener(e, (ev) => ev.stopPropagation());
    slider.addEventListener("change", () => commit({ transparency: Number(slider.value) / 100 }));
    look.appendChild(slider);
    look.appendChild(button({
      label: t.canCollide ? "Solid (tap to make walk-through)" : "Walk-through (tap to make solid)",
      variant: "secondary",
      onClick: () => commit({ canCollide: !t.canCollide }),
    }));
    wrap.appendChild(look);

    // --- text -------------------------------------------------------------------------
    const txt = section("TEXT");
    const input = el("input", "oof-input");
    input.type = "text";
    input.maxLength = 40;
    input.value = t.text || "";
    input.placeholder = "words on the part";
    input.setAttribute("aria-label", "Part text");
    input.setAttribute("style",
      "width:100%;padding:8px 10px;border-radius:var(--oof-radius-md);border:1px solid var(--oof-line);"
      + "background:var(--oof-bg-2);color:var(--oof-text);font:inherit");
    for (const e of ["keydown", "keyup", "keypress"]) input.addEventListener(e, (ev) => ev.stopPropagation());
    input.addEventListener("change", () => commit({ text: input.value }));
    txt.appendChild(input);
    wrap.appendChild(txt);

    // --- effects / auras ---------------------------------------------------------------
    const fx = section("EFFECT");
    fx.appendChild(chips(EFFECTS, t.effect, (v) => commit({ effect: v })));
    wrap.appendChild(fx);

    const aura = section("AURA");
    aura.appendChild(chips(AURAS, t.aura, (v) => commit({ aura: v })));
    wrap.appendChild(aura);
  }

  function axisRow(title, values, onNudge, degrees) {
    const s = section(title);
    for (let i = 0; i < 3; i++) {
      const row = el("div", null);
      row.setAttribute("style", "display:flex;align-items:center;gap:4px");
      const label = el("span", null, ["X", "Y", "Z"][i]);
      label.setAttribute("style", "width:14px;font-weight:800;color:var(--oof-text-dim)");
      const value = el("span", null, degrees ? `${Math.round(values[i])}°` : values[i].toFixed(1));
      value.setAttribute("style",
        "min-width:46px;text-align:right;font-variant-numeric:tabular-nums;font-size:var(--oof-size-sm)");
      row.append(label, value);
      for (const d of NUDGE) {
        row.appendChild(mini(`-${degrees ? d * 15 : d}`, () => onNudge(i, -d)));
      }
      for (const d of NUDGE) {
        row.appendChild(mini(`+${degrees ? d * 15 : d}`, () => onNudge(i, d)));
      }
      s.appendChild(row);
    }
    return s;
  }

  function mini(label, onClick) {
    const b = el("button", null, label);
    b.type = "button";
    b.setAttribute("style",
      "flex:1;min-width:0;border-radius:var(--oof-radius-md);border:1px solid var(--oof-line);"
      + "background:var(--oof-bg-2);color:var(--oof-text);font:inherit;font-size:var(--oof-size-sm);"
      + "padding:5px 0;cursor:pointer");
    b.addEventListener("click", onClick);
    return b;
  }

  build.onChange(render);
  render();
  return { refresh: render, dispose() { build.onChange(null); } };
}
