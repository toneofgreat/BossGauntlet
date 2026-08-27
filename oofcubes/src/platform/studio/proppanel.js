// src/platform/studio/proppanel.js — the property panel: a selected part's transform,
// look and behaviours. Spec 11 §5.6.3, with every behaviour form GENERATED from
// behaviors-schema.js rather than hand-written twelve times.
//
// Style note: see palette.js's header — §5.6's token names are not the ones the shipped
// UI kit defines, so every colour is var(--spec-11-name, <§5.6 fallback>).

import { BEHAVIOR_PARAM_SCHEMAS } from "./behaviors-schema.js";
import { STUDIO_COLORS } from "./palette.js";

const PANEL = "var(--oof-panel, rgba(20,24,34,.92))";
const PANEL2 = "var(--oof-panel-2, rgba(34,40,54,.92))";
const TEXT = "var(--oof-text, #fff)";
const MUTED = "var(--oof-muted, rgba(255,255,255,.55))";
const ACCENT = "var(--oof-accent, #4aa8ff)";
const LINE = "var(--oof-ui-line, rgba(255,255,255,.18))";
const ON_ACCENT = "#0c0e14";
const DANGER = "#e5484d";

const AXIS_COLORS = ["#e5484d", "#46a758", "#3e63dd"]; // X / Y / Z, §6's gizmo colours
const MATERIALS = ["plastic", "neon", "metal", "grass", "lava", "ice", "glass", "wood"];
const FLAT_THUMBS = { neon: "#7ec8ff", glass: "#cfe4ff" };
const MAX_BEHAVIORS_PER_PART = 3; // §6, mirrors spec 04's per-part cap
const SIZE_MAX = 2048;
const SIZE_MIN = 0.05; // spec 04's size floor
const FLASH_MS = 300;

function el(tag, style, text) {
  const node = document.createElement(tag);
  if (style) node.setAttribute("style", style);
  if (text !== undefined) node.textContent = text;
  return node;
}

const FIELD = "height:32px;border-radius:8px;border:1px solid " + LINE + ";background:" + PANEL2
  + ";color:" + TEXT + ";padding:0 8px;font-family:inherit;font-size:13px;min-width:0;";
const BTN = "height:32px;border-radius:8px;border:1px solid " + LINE + ";background:" + PANEL2
  + ";color:" + TEXT + ";font-family:inherit;font-size:13px;cursor:pointer;padding:0 10px;";
const SECTION_LABEL = "font-size:11px;color:" + MUTED + ";margin:10px 0 4px;letter-spacing:.04em;";

// A field whose committed value was rejected flashes red for 300 ms and snaps back to
// the value the doc still holds — no silent clamping, no half-applied edit (§5.6.3).
// element.animate() rather than a scheduled callback: §7 criterion 21 bans timers in
// Studio, and the Web Animations API is the timer-free way to run a fixed-duration effect.
function flashInvalid(input) {
  if (typeof input.animate !== "function") return;
  input.animate(
    [{ borderColor: DANGER }, { borderColor: DANGER }, { borderColor: LINE }],
    { duration: FLASH_MS, easing: "steps(2, end)" },
  );
}

// numberField(opts) -> { el, read(), write(v) }. Commits on Enter or blur (§5.4's
// "text/number inputs commit on Enter or blur"), never per keystroke — a slider of
// undo steps for one typed number would make undo useless.
function numberField({ value, step, min, max, integer, width, snap, onCommit }) {
  const input = el("input", FIELD + "width:" + (width || "100%") + ";text-align:center;");
  input.type = "text";
  input.inputMode = "decimal";
  input.value = String(value);
  let current = value;

  function commit() {
    const parsed = Number(input.value);
    const bad = !Number.isFinite(parsed)
      || (integer && !Number.isInteger(parsed))
      || (min !== undefined && parsed < min)
      || (max !== undefined && parsed > max);
    if (bad) {
      input.value = String(current);
      flashInvalid(input);
      return;
    }
    // Snap AFTER the range check and BEFORE the commit (§5.6.3: "values always displayed
    // snapped to the §3.4 quanta"). Both range ends of every transform field are
    // themselves on-quantum, so rounding can never push a value that just passed the
    // check back out of range. The input is rewritten unconditionally: a typed 3.33 must
    // not be left on screen when the doc now holds 3.35.
    const next = snap ? snap(parsed) : parsed;
    input.value = String(next);
    if (next === current) return;
    current = next;
    onCommit(next);
  }

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      input.blur();
    }
  });
  input.addEventListener("blur", commit);
  if (step) input.dataset.step = String(step);
  return {
    el: input,
    read: () => current,
    write(v) {
      current = v;
      if (document.activeElement !== input) input.value = String(v);
    },
  };
}

function stepperRow(field, step, min, max, onCommit) {
  const row = el("div", "display:flex;gap:4px;align-items:center;");
  const minus = el("button", BTN + "width:32px;padding:0;", "−");
  const plus = el("button", BTN + "width:32px;padding:0;", "＋");
  const nudge = (dir) => {
    let next = Math.round((field.read() + dir * step) * 100) / 100;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    field.write(next);
    onCommit(next);
  };
  minus.addEventListener("click", () => nudge(-1));
  plus.addEventListener("click", () => nudge(1));
  field.el.style.flex = "1";
  row.append(minus, field.el, plus);
  return row;
}

function toggleSwitch(value, onChange) {
  const btn = el("button", BTN + "width:56px;", value ? "On" : "Off");
  btn.style.background = value ? ACCENT : PANEL2;
  btn.style.color = value ? ON_ACCENT : TEXT;
  btn.addEventListener("click", () => {
    const next = btn.textContent !== "On";
    btn.textContent = next ? "On" : "Off";
    btn.style.background = next ? ACCENT : PANEL2;
    btn.style.color = next ? ON_ACCENT : TEXT;
    onChange(next);
  });
  return btn;
}

function segmentedRow(options, active, onPick) {
  const row = el("div", "display:flex;gap:4px;flex-wrap:wrap;");
  for (const option of options) {
    const label = typeof option === "string" ? option : option.label;
    const value = typeof option === "string" ? option : option.value;
    const btn = el("button", BTN, label);
    const on = value === active;
    btn.style.background = on ? ACCENT : PANEL2;
    btn.style.color = on ? ON_ACCENT : TEXT;
    btn.addEventListener("click", () => onPick(value));
    row.appendChild(btn);
  }
  return row;
}

function materialThumb(partsApi, material, color, size) {
  const canvas = el("canvas", "width:" + size + "px;height:" + size + "px;border-radius:6px;");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const flat = FLAT_THUMBS[material];
  ctx.fillStyle = flat || color;
  ctx.fillRect(0, 0, size, size);
  if (!flat) {
    try {
      const mat = partsApi.getMaterial(material, color, 0);
      if (mat && mat.map && mat.map.image && mat.map.image.width) {
        ctx.globalAlpha = 0.85;
        ctx.drawImage(mat.map.image, 0, 0, size, size);
        ctx.globalAlpha = 1;
      }
    } catch (err) {
      console.warn("[oof] material thumbnail unavailable", material, err);
    }
  }
  return canvas;
}

// createPropPanel(container, opts) -> panel — §5.6.3.
// opts: { editor, partsApi, narrow }
export function createPropPanel(container, opts = {}) {
  const ed = opts.editor;
  const partsApi = opts.partsApi;
  let narrow = !!opts.narrow;
  let collapsed = false;
  let signature = null;
  const bindings = []; // { write() } — value-only refresh for a panel already on screen

  const root = el("div", "");
  root.id = "oof-studio-props";
  container.appendChild(root);

  const tab = el("button", "position:absolute;right:8px;top:56px;width:44px;height:44px;"
    + "border-radius:12px;border:1px solid " + LINE + ";background:" + PANEL + ";color:" + TEXT
    + ";font-size:18px;cursor:pointer;pointer-events:auto;display:none;", "☰");
  tab.addEventListener("click", () => {
    collapsed = false;
    render();
  });
  container.appendChild(tab);

  function applyLayout() {
    root.setAttribute("style", narrow
      ? "position:absolute;left:0;right:0;bottom:0;height:45vh;background:" + PANEL
        + ";border-top:1px solid " + LINE + ";border-radius:12px 12px 0 0;padding:10px;"
        + "overflow-y:auto;pointer-events:auto;"
      : "position:absolute;right:8px;top:56px;bottom:8px;width:280px;background:" + PANEL
        + ";border-radius:12px;padding:10px;overflow-y:auto;pointer-events:auto;");
  }

  function commitProp(key, value) {
    ed.applyProps(ed.selection(), key, value);
  }

  // Spec 04 §3.4 rejects a sphere whose three extents differ and a cylinder whose x and
  // z differ, and a Place that fails validatePlaceData can be neither tested nor shared.
  // editor.js applies exactly this constraint to a scale-gizmo drag; the numeric SIZE
  // fields have to agree, or typing one number into a sphere silently makes the whole
  // creation unexportable with an error message that names a field nobody touched.
  function constrainSize(shape, size, changedAxis) {
    if (shape === "sphere") {
      const v = size[changedAxis];
      return [v, v, v];
    }
    if (shape === "cylinder" && changedAxis !== 1) {
      const v = size[changedAxis];
      return [v, size[1], v];
    }
    return size.slice();
  }

  // ---- transform rows -------------------------------------------------------------
  // A gizmo drag and a placed part both leave the doc on §3.4's quanta because they go
  // through editor.snapTo; a TYPED number used to skip that entirely. 3.33 studs is in
  // range, so it stayed in the doc and rendered where it was typed — but packPlace
  // rounds it to 3.35, so the shared Place quietly stood 0.02 studs from the built one,
  // and a part typed flush against another was no longer flush. Both panels round
  // through editor.snapToQuantum now.
  function transformRow(label, key, part, step, min, max) {
    const quantum = key === "rotation" ? ed.quanta.degrees : ed.quanta.coord;
    const wrap = el("div", "margin-bottom:6px;");
    wrap.appendChild(el("div", SECTION_LABEL, label));
    const row = el("div", "display:flex;gap:4px;");
    for (let axis = 0; axis < 3; axis++) {
      const cell = el("div", "flex:1;display:flex;flex-direction:column;gap:2px;min-width:0;");
      cell.appendChild(el("div", "font-size:10px;color:" + AXIS_COLORS[axis] + ";text-align:center;",
        ["X", "Y", "Z"][axis]));
      const field = numberField({
        value: part[key][axis], step, min, max,
        snap: (v) => ed.snapToQuantum(v, quantum),
        onCommit(value) {
          const live = ed.partOf(part.id) || part;
          const after = { position: live.position.slice(), rotation: live.rotation.slice(), size: live.size.slice() };
          after[key][axis] = value;
          if (key === "size") after.size = constrainSize(live.shape, after.size, axis);
          ed.applyTransform([part.id], [after]);
        },
      });
      bindings.push({ write: () => field.write(ed.partOf(part.id) ? ed.partOf(part.id)[key][axis] : 0) });
      cell.appendChild(field.el);
      row.appendChild(cell);
    }
    wrap.appendChild(row);
    return wrap;
  }

  // ---- colour + material + transparency + collide ---------------------------------
  function colorSection(current) {
    const wrap = el("div", "");
    wrap.appendChild(el("div", SECTION_LABEL, "COLOUR"));
    const grid = el("div", "display:grid;grid-template-columns:repeat(6,1fr);gap:4px;");
    for (const hex of STUDIO_COLORS) {
      const swatch = el("button", "height:28px;border-radius:6px;cursor:pointer;background:" + hex
        + ";border:2px solid " + (hex === current ? TEXT : "transparent") + ";");
      swatch.title = hex;
      swatch.addEventListener("click", () => commitProp("color", hex));
      grid.appendChild(swatch);
    }
    wrap.appendChild(grid);
    const hex = el("input", FIELD + "width:100%;margin-top:6px;font-family:monospace;");
    hex.value = current;
    hex.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") hex.blur();
    });
    hex.addEventListener("blur", () => {
      const text = hex.value.trim().toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(text)) {
        hex.value = current;
        flashInvalid(hex);
        return;
      }
      commitProp("color", text);
    });
    wrap.appendChild(hex);
    return wrap;
  }

  function materialSection(current, color) {
    const wrap = el("div", "");
    wrap.appendChild(el("div", SECTION_LABEL, "MATERIAL"));
    const grid = el("div", "display:grid;grid-template-columns:repeat(4,1fr);gap:4px;");
    for (const name of MATERIALS) {
      const cell = el("button", BTN + "height:auto;padding:4px;display:flex;flex-direction:column;"
        + "align-items:center;gap:2px;border-color:" + (name === current ? ACCENT : LINE) + ";");
      cell.appendChild(materialThumb(partsApi, name, color, 32));
      cell.appendChild(el("div", "font-size:9px;color:" + MUTED + ";", name));
      cell.addEventListener("click", () => commitProp("material", name));
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  function transparencySection(current) {
    const wrap = el("div", "");
    wrap.appendChild(el("div", SECTION_LABEL, "TRANSPARENCY"));
    const row = el("div", "display:flex;gap:8px;align-items:center;");
    const slider = el("input", "flex:1;");
    slider.type = "range";
    slider.min = "0";
    slider.max = "1";
    slider.step = "0.05";
    slider.value = String(current);
    const readout = el("div", "font-size:12px;color:" + MUTED + ";width:36px;text-align:right;",
      current.toFixed(2));
    slider.addEventListener("input", () => {
      readout.textContent = Number(slider.value).toFixed(2);
    });
    // One command per commit, on release (§5.4) — dragging a slider must not fill the
    // undo stack with twenty intermediate values.
    const commit = () => commitProp("transparency", Number(slider.value));
    slider.addEventListener("change", commit);
    row.append(slider, readout);
    wrap.appendChild(row);
    return wrap;
  }

  function collideSection(current) {
    const wrap = el("div", "display:flex;align-items:center;justify-content:space-between;margin-top:10px;");
    wrap.appendChild(el("div", "font-size:13px;color:" + TEXT + ";", "Can collide"));
    wrap.appendChild(toggleSwitch(current, (v) => commitProp("canCollide", v)));
    return wrap;
  }

  // ===================================================================================
  // ===== generated behaviour forms (§5.6.3, from BEHAVIOR_PARAM_SCHEMAS) =============
  // ===================================================================================

  const expanded = new Set(); // behaviour types whose form is open, kept across renders

  function defaultsFor(type, part) {
    const schema = BEHAVIOR_PARAM_SCHEMAS[type];
    const behavior = { type };
    for (const param of schema.params) {
      if (param.type === "waypoints") {
        // Two rows minimum, and the first is where the part already is — a moving
        // platform that starts anywhere else jumps the moment you press Test.
        behavior[param.key] = [
          part.position.slice(),
          [part.position[0], part.position[1], part.position[2] + 6],
        ];
      } else if (param.default !== undefined) {
        behavior[param.key] = Array.isArray(param.default) ? param.default.slice() : param.default;
      }
    }
    return behavior;
  }

  function paramVisible(param, behavior) {
    if (!param.requiredIf) return true;
    return behavior[param.requiredIf.key] === param.requiredIf.equals;
  }

  function paramMissing(param, behavior) {
    const required = param.required || (param.requiredIf && paramVisible(param, behavior));
    return !!required && (behavior[param.key] === undefined || behavior[param.key] === "");
  }

  function paramControl(param, behavior, part, commit) {
    const write = (value) => {
      const next = { ...behavior };
      if (value === undefined) delete next[param.key];
      else next[param.key] = value;
      commit(next);
    };

    if (param.type === "bool") return toggleSwitch(behavior[param.key] === true, write);

    if (param.type === "enum") {
      return segmentedRow(param.options, behavior[param.key], (value) => {
        const next = { ...behavior, [param.key]: value };
        // A conditional field stops being legal the moment its condition stops holding
        // (spec 04 rejects collectible.event on a non-event collectible), so it is
        // dropped here rather than left behind to fail validation later.
        for (const other of BEHAVIOR_PARAM_SCHEMAS[behavior.type].params) {
          if (other.requiredIf && next[other.requiredIf.key] !== other.requiredIf.equals) {
            delete next[other.key];
          }
        }
        commit(next);
      });
    }

    if (param.type === "int" || param.type === "number") {
      const isInt = param.type === "int";
      const field = numberField({
        value: behavior[param.key] !== undefined ? behavior[param.key] : (param.default || 0),
        min: param.min, max: param.max, integer: isInt,
        onCommit: write,
      });
      return stepperRow(field, isInt ? 1 : 0.5, param.min, param.max, write);
    }

    if (param.type === "string") {
      const input = el("input", FIELD + "width:100%;");
      input.value = behavior[param.key] === undefined ? "" : String(behavior[param.key]);
      if (paramMissing(param, behavior)) input.style.borderColor = DANGER;
      const re = param.pattern ? new RegExp(param.pattern) : null;
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") input.blur();
      });
      input.addEventListener("blur", () => {
        const text = input.value.trim();
        if (text === "") {
          write(undefined);
          return;
        }
        if (re && !re.test(text)) {
          flashInvalid(input);
          input.value = behavior[param.key] === undefined ? "" : String(behavior[param.key]);
          return;
        }
        write(text);
      });
      return input;
    }

    if (param.type === "vec3") {
      const current = Array.isArray(behavior[param.key]) ? behavior[param.key] : (param.default || [0, 0, 0]);
      const row = el("div", "display:flex;gap:4px;");
      for (let axis = 0; axis < 3; axis++) {
        const field = numberField({
          value: current[axis],
          onCommit(value) {
            const next = current.slice();
            next[axis] = value;
            write(next);
          },
        });
        field.el.style.color = AXIS_COLORS[axis];
        row.appendChild(field.el);
      }
      return row;
    }

    if (param.type === "partId") {
      const btn = el("button", BTN + "width:100%;", behavior[param.key] || "Pick part…");
      if (paramMissing(param, behavior)) btn.style.borderColor = DANGER;
      btn.addEventListener("click", () => {
        btn.textContent = "Tap a part…";
        ed.beginPickPart().then((id) => {
          if (id) write(id);
          else btn.textContent = behavior[param.key] || "Pick part…";
        });
      });
      return btn;
    }

    if (param.type === "waypoints") {
      return waypointsControl(param, behavior, part, write);
    }

    return el("div", "font-size:11px;color:" + MUTED + ";", "unsupported field");
  }

  function waypointsControl(param, behavior, part, write) {
    const list = Array.isArray(behavior[param.key]) ? behavior[param.key].map((w) => w.slice()) : [];
    const wrap = el("div", "display:flex;flex-direction:column;gap:4px;");
    list.forEach((point, index) => {
      const row = el("div", "display:flex;gap:4px;align-items:center;");
      row.appendChild(el("div", "font-size:11px;color:" + MUTED + ";width:16px;", String(index + 1)));
      for (let axis = 0; axis < 3; axis++) {
        const field = numberField({
          value: point[axis],
          onCommit(value) {
            const next = list.map((w) => w.slice());
            next[index][axis] = value;
            write(next);
          },
        });
        field.el.style.color = AXIS_COLORS[axis];
        row.appendChild(field.el);
      }
      const here = el("button", BTN + "padding:0 6px;font-size:11px;", "Set");
      here.title = "Set waypoint " + (index + 1) + " to this part's position";
      here.addEventListener("click", () => {
        const next = list.map((w) => w.slice());
        next[index] = part.position.slice();
        write(next);
      });
      row.appendChild(here);
      if (list.length > param.min) {
        const remove = el("button", BTN + "width:28px;padding:0;", "✕");
        remove.addEventListener("click", () => write(list.filter((_, i) => i !== index)));
        row.appendChild(remove);
      }
      wrap.appendChild(row);
    });
    if (list.length < param.max) {
      const add = el("button", BTN + "width:100%;", "＋ Add waypoint");
      add.addEventListener("click", () => {
        const last = list[list.length - 1] || part.position;
        write(list.concat([[last[0], last[1], last[2] + 6]]));
      });
      wrap.appendChild(add);
    }
    return wrap;
  }

  function behaviorSection(part) {
    const wrap = el("div", "margin-top:12px;");
    wrap.appendChild(el("div", SECTION_LABEL, "BEHAVIOURS"));
    const behaviors = Array.isArray(part.behaviors) ? part.behaviors : [];

    const commitList = (next) => ed.applyBehaviors(part.id, next);

    behaviors.forEach((behavior, index) => {
      const schema = BEHAVIOR_PARAM_SCHEMAS[behavior.type];
      if (!schema) return;
      const card = el("div", "border:1px solid " + LINE + ";border-radius:10px;padding:6px;margin-bottom:6px;");
      const head = el("div", "display:flex;gap:6px;align-items:center;");
      head.appendChild(el("div", "font-size:16px;", schema.icon));
      head.appendChild(el("div", "flex:1;font-size:13px;color:" + TEXT + ";", schema.label));
      const toggle = el("button", BTN + "width:28px;padding:0;", expanded.has(behavior.type) ? "▴" : "▾");
      toggle.addEventListener("click", () => {
        if (expanded.has(behavior.type)) expanded.delete(behavior.type);
        else expanded.add(behavior.type);
        render(true);
      });
      const remove = el("button", BTN + "width:28px;padding:0;", "✕");
      remove.addEventListener("click", () => commitList(behaviors.filter((_, i) => i !== index)));
      head.append(toggle, remove);
      card.appendChild(head);

      if (expanded.has(behavior.type)) {
        for (const param of schema.params) {
          if (!paramVisible(param, behavior)) continue;
          const field = el("div", "margin-top:6px;");
          field.appendChild(el("div", SECTION_LABEL + "margin:0 0 2px;", param.key));
          field.appendChild(paramControl(param, behavior, part, (nextBehavior) => {
            const next = behaviors.map((b, i) => (i === index ? nextBehavior : b));
            commitList(next);
          }));
          if (param.help) field.appendChild(el("div", "font-size:10px;color:" + MUTED + ";", param.help));
          card.appendChild(field);
        }
      }
      wrap.appendChild(card);
    });

    // ---- the add-behaviour menu ----------------------------------------------------
    const present = new Set(behaviors.map((b) => b.type));
    if (behaviors.length >= MAX_BEHAVIORS_PER_PART) {
      const full = el("button", BTN + "width:100%;opacity:.35;", "＋ Add behaviour");
      full.disabled = true;
      wrap.appendChild(full);
      wrap.appendChild(el("div", "font-size:10px;color:" + MUTED + ";", "Max " + MAX_BEHAVIORS_PER_PART));
      return wrap;
    }

    const addBtn = el("button", BTN + "width:100%;", "＋ Add behaviour");
    const menu = el("div", "display:none;flex-direction:column;gap:4px;margin-top:6px;");
    addBtn.addEventListener("click", () => {
      menu.style.display = menu.style.display === "none" ? "flex" : "none";
    });
    // Advanced types sort last (§3.5): touchEvent only matters to a Place with scripts,
    // and Studio Places have none.
    const types = Object.keys(BEHAVIOR_PARAM_SCHEMAS)
      .filter((type) => !present.has(type))
      .sort((a, b) => (BEHAVIOR_PARAM_SCHEMAS[a].advanced ? 1 : 0) - (BEHAVIOR_PARAM_SCHEMAS[b].advanced ? 1 : 0));
    for (const type of types) {
      const schema = BEHAVIOR_PARAM_SCHEMAS[type];
      const row = el("button", BTN + "width:100%;text-align:left;height:auto;padding:6px 8px;"
        + "display:flex;gap:6px;align-items:center;");
      row.appendChild(el("div", "font-size:15px;", schema.icon));
      const text = el("div", "display:flex;flex-direction:column;");
      text.appendChild(el("div", "font-size:13px;", schema.label));
      const help = schema.advanced
        ? "Fires an event — only useful with game scripts"
        : (schema.params[0] && schema.params[0].help) || "";
      if (help) text.appendChild(el("div", "font-size:10px;color:" + MUTED + ";", help));
      row.appendChild(text);
      row.addEventListener("click", () => {
        expanded.add(type);
        commitList(behaviors.concat([defaultsFor(type, part)]));
      });
      menu.appendChild(row);
    }
    wrap.append(addBtn, menu);
    return wrap;
  }

  // ===================================================================================
  // ===== render =====================================================================
  // ===================================================================================

  function currentSignature() {
    const ids = ed.selection();
    const parts = ed.selectedParts();
    return JSON.stringify([
      ids, narrow, collapsed, ed.isSpawnSelected(),
      parts.map((p) => (p.behaviors || []).map((b) => b.type)),
      parts.map((p) => p.material + p.color),
      [...expanded],
    ]);
  }

  function render(force) {
    const next = currentSignature();
    if (!force && next === signature) {
      // Same shape of panel: only the numbers moved (a gizmo drag, an undo). Rewriting
      // the DOM here would steal focus from a field the builder is typing into.
      for (const binding of bindings) binding.write();
      return;
    }
    signature = next;
    bindings.length = 0;
    root.textContent = "";
    applyLayout();

    const ids = ed.selection();
    if (ids.length === 0) {
      root.style.display = "none";
      tab.style.display = "none";
      return;
    }
    if (collapsed) {
      root.style.display = "none";
      tab.style.display = "block";
      return;
    }
    root.style.display = "block";
    tab.style.display = "none";

    const header = el("div", "display:flex;align-items:center;gap:6px;");
    const title = el("div", "flex:1;");
    if (ed.isSpawnSelected()) {
      title.appendChild(el("div", "font-size:11px;color:" + MUTED + ";", "spawn"));
      title.appendChild(el("div", "font-size:14px;font-weight:700;color:" + TEXT + ";", "Spawn pad"));
    } else if (ids.length > 1) {
      title.appendChild(el("div", "font-size:14px;font-weight:700;color:" + TEXT + ";", ids.length + " parts"));
    } else {
      const part = ed.partOf(ids[0]);
      title.appendChild(el("div", "font-size:11px;color:" + MUTED + ";", ids[0]));
      title.appendChild(el("div", "font-size:14px;font-weight:700;color:" + TEXT + ";", part ? part.shape : ""));
    }
    header.appendChild(title);
    const close = el("button", BTN + "width:32px;padding:0;", "✕");
    close.addEventListener("click", () => {
      collapsed = true;
      render(true);
    });
    header.appendChild(close);
    root.appendChild(header);

    if (ed.isSpawnSelected()) {
      root.appendChild(el("div", "font-size:12px;color:" + MUTED + ";margin-top:10px;",
        "Drag the green pad to set where players start. The arrow is the way they face."));
      return;
    }

    const parts = ed.selectedParts();
    if (parts.length === 0) return;
    const first = parts[0];

    if (parts.length === 1) {
      root.appendChild(transformRow("POSITION", "position", first, ed.getGrid(), -10000, 10000));
      root.appendChild(transformRow("ROTATION", "rotation", first, 15, -360, 360));
      root.appendChild(transformRow("SIZE", "size", first, ed.getGrid(), SIZE_MIN, SIZE_MAX));
    }

    root.appendChild(colorSection(first.color));
    root.appendChild(materialSection(first.material, first.color));
    root.appendChild(transparencySection(first.transparency));
    root.appendChild(collideSection(first.canCollide !== false));

    // Behaviours are single-selection only (§5.6.3): there is no sane "apply these
    // three behaviours to eleven parts" gesture, and a wrong one is expensive to undo.
    if (parts.length === 1) root.appendChild(behaviorSection(first));
  }

  render(true);

  return {
    el: root,
    refresh: (force) => render(!!force),
    setNarrow(value) {
      narrow = !!value;
      render(true);
    },
    dispose() {
      root.remove();
      tab.remove();
    },
  };
}
