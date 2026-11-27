// bus.js - tiny synchronous event bus (CONTRACT 3).
// Handlers run in registration order; a throwing handler is caught and logged so one bad listener
// never breaks the emitter. Emitting while handlers subscribe/unsubscribe is safe (snapshot by length + tombstones).

export function createBus() {
  const map = new Map(); // name -> array of { fn, dead }
  let depth = 0;
  const dirty = new Set();

  function list(name) {
    let a = map.get(name);
    if (!a) { a = []; map.set(name, a); }
    return a;
  }

  function compact(name) {
    const a = map.get(name);
    if (!a) return;
    let w = 0;
    for (let i = 0; i < a.length; i++) if (!a[i].dead) a[w++] = a[i];
    a.length = w;
  }

  function on(name, fn) {
    if (typeof fn !== "function") return () => {};
    const rec = { fn, dead: false };
    list(name).push(rec);
    return () => {
      if (rec.dead) return;
      rec.dead = true;
      if (depth > 0) dirty.add(name); else compact(name);
    };
  }

  function once(name, fn) {
    let off = null;
    off = on(name, (p) => { off(); fn(p); });
    return off;
  }

  function off(name, fn) {
    const a = map.get(name);
    if (!a) return;
    for (let i = 0; i < a.length; i++) {
      if (!a[i].dead && a[i].fn === fn) { a[i].dead = true; break; }
    }
    if (depth > 0) dirty.add(name); else compact(name);
  }

  function emit(name, payload) {
    const a = map.get(name);
    if (!a || a.length === 0) return;
    depth++;
    const n = a.length;
    for (let i = 0; i < n; i++) {
      const rec = a[i];
      if (rec.dead) continue;
      try { rec.fn(payload); } catch (e) {
        console.warn("[bus] handler for '" + name + "' failed:", e);
        try {
          const g = (typeof window !== "undefined") ? window.__tnrpg : null;
          if (g && g.errors) g.errors.push("bus " + name + ": " + (e && e.message ? e.message : String(e)));
        } catch (e2) { /* ignore */ }
      }
    }
    depth--;
    if (depth === 0 && dirty.size) {
      for (const k of dirty) compact(k);
      dirty.clear();
    }
  }

  function count(name) {
    const a = map.get(name);
    if (!a) return 0;
    let c = 0;
    for (let i = 0; i < a.length; i++) if (!a[i].dead) c++;
    return c;
  }

  return { on, once, off, emit, count };
}
