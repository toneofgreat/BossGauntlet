// src/platform/studio/commands.js — the undo/redo stack and the six commands that are
// the ONLY way anything in Oof Studio mutates a StudioDoc. Spec 11 §5.4.
//
// Every constructor deep-copies its before/after payload at construction time. That is
// the whole trick behind undo safety here: the editor hands live arrays around (a
// gizmo drag writes meshes 60 times a second), and a command that kept a reference to
// one of them would "undo" to whatever that array holds later, not to what it held
// when the command was made.
//
// A command is a plain object { label, do(), undo() } closed over the editor. The
// editor-facing surface each one uses is small and documented in editor.js:
//   ed.doc                       the live StudioDoc
//   ed.insertPart(def, index)    doc.world.parts splice + engine addPart
//   ed.deletePart(id)            doc.world.parts removal + engine removePart
//   ed.writePartFields(id, obj)  write transform/appearance fields + sync the engine
//   ed.writeBehaviors(id, arr)   swap a part's behaviors array + rebuild its badge
//   ed.writeWorld(key, value)    doc.world[key] (or doc.name) + its scene side effect
//   ed.setSelection(ids)         selection, outlines, panels

const MAX_UNDO = 100; // §6 MAX_UNDO — the stack is in-memory only (§10)

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

// createCommandStack(limit) -> stack — §5.4.
export function createCommandStack(limit = MAX_UNDO) {
  const past = [];
  const future = [];
  const listeners = new Set();

  function notify() {
    for (const cb of listeners) {
      try {
        cb();
      } catch (err) {
        console.error("[oof] studio command listener failed", err);
      }
    }
  }

  return {
    push(cmd) {
      cmd.do();
      past.push(cmd);
      future.length = 0; // a new edit truncates the redo branch
      while (past.length > limit) past.shift();
      notify();
    },
    undo() {
      const cmd = past.pop();
      if (!cmd) return false; // caller plays the "error" sfx on false (§5.4)
      cmd.undo();
      future.push(cmd);
      notify();
      return true;
    },
    redo() {
      const cmd = future.pop();
      if (!cmd) return false;
      cmd.do();
      past.push(cmd);
      notify();
      return true;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    clear() {
      past.length = 0;
      future.length = 0;
      notify();
    },
    size: () => past.length,
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

// ===================================================================================
// ===== the six commands — spec 11 §5.4's table =====================================
// ===================================================================================

// cmdAddParts(ed, defs) — defs arrive with their ids already assigned from
// doc.editor.nextPartNum, so redo re-inserts the SAME ids and any teleport pointing at
// one of them still resolves after an undo/redo round trip.
export function cmdAddParts(ed, defs) {
  const payload = copy(defs);
  const ids = payload.map((d) => d.id);
  return {
    label: payload.length === 1 ? "Add part" : "Add " + payload.length + " parts",
    do() {
      for (const def of payload) ed.insertPart(copy(def), ed.doc.world.parts.length);
      ed.setSelection(ids);
    },
    undo() {
      for (const id of ids) ed.deletePart(id);
      ed.setSelection([]);
    },
  };
}

// cmdRemoveParts(ed, ids) — captures each part's def AND its index, so undo puts the
// parts back where they were. Order matters for nothing functional, but a stable part
// list keeps ids/order the same across an undo, which pack.js's row indices rely on.
export function cmdRemoveParts(ed, ids) {
  const captured = ids
    .map((id) => {
      const index = ed.doc.world.parts.findIndex((p) => p.id === id);
      return index === -1 ? null : { index, def: copy(ed.doc.world.parts[index]) };
    })
    .filter((entry) => entry !== null)
    .sort((a, b) => a.index - b.index);

  return {
    label: captured.length === 1 ? "Delete part" : "Delete " + captured.length + " parts",
    do() {
      for (const entry of captured) ed.deletePart(entry.def.id);
      ed.setSelection([]);
    },
    undo() {
      // Ascending index order: each re-insert restores the slot the next one expects.
      for (const entry of captured) ed.insertPart(copy(entry.def), entry.index);
      ed.setSelection(captured.map((entry) => entry.def.id));
    },
  };
}

// cmdTransform(ed, ids, before, after) — one command per gizmo drag or numeric commit.
// `before`/`after` are arrays aligned to `ids`, each { position?, rotation?, size? }.
export function cmdTransform(ed, ids, before, after) {
  const partIds = ids.slice();
  const from = copy(before);
  const to = copy(after);
  const apply = (states) => {
    partIds.forEach((id, i) => ed.writePartFields(id, copy(states[i])));
    ed.setSelection(partIds);
  };
  return {
    label: "Move parts",
    do: () => apply(to),
    undo: () => apply(from),
  };
}

// cmdSetProps(ed, ids, key, before, after) — key is one of color / material /
// transparency / canCollide. `before` is per-id (they may have differed), `after` is
// the one value being applied to all of them.
export function cmdSetProps(ed, ids, key, before, after) {
  const partIds = ids.slice();
  const from = copy(before);
  const to = copy(after);
  const apply = (valueFor) => {
    partIds.forEach((id, i) => ed.writePartFields(id, { [key]: valueFor(i) }));
    ed.setSelection(partIds);
  };
  return {
    label: "Change " + key,
    do: () => apply(() => copy(to)),
    undo: () => apply((i) => copy(from[i])),
  };
}

// cmdSetBehaviors(ed, id, before, after) — whole arrays, never a per-entry patch: a
// behavior form edit rewrites the array it belongs to, so undo is a swap (§5.6.3).
export function cmdSetBehaviors(ed, id, before, after) {
  const from = copy(before) || [];
  const to = copy(after) || [];
  return {
    label: "Change behaviors",
    do() {
      ed.writeBehaviors(id, copy(to));
      ed.setSelection([id]);
    },
    undo() {
      ed.writeBehaviors(id, copy(from));
      ed.setSelection([id]);
    },
  };
}

// cmdSetWorld(ed, key, before, after) — key is one of spawn / spawnYaw / killY /
// lighting / music / name. ed.writeWorld owns the side effect each key needs (moving
// the spawn marker, re-applying lighting, retitling the top bar).
export function cmdSetWorld(ed, key, before, after) {
  const from = copy(before);
  const to = copy(after);
  return {
    label: "Change " + key,
    do: () => ed.writeWorld(key, copy(to)),
    undo: () => ed.writeWorld(key, copy(from)),
  };
}
