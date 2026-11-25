// bus.js - tiny synchronous event bus (CORE owns, frozen). DOM-free. Event names + payloads: BONUS.md section 4.
// bus.on(type, fn) -> off();  bus.on("*", fn) gets (type, data) for every event;  bus.emit(type, data)
// Handlers run synchronously inside emit, in subscription order. A throwing handler is logged and skipped.
// bus.log: when set to an array, every emitted event is pushed as {type, data, frame} (tests, debugging).
export function createBus() {
  const map = new Map();
  const bus = {
    log: null,
    frame: 0,
    on(type, fn) {
      let a = map.get(type); if (!a) map.set(type, (a = []));
      a.push(fn);
      return () => bus.off(type, fn);
    },
    off(type, fn) { const a = map.get(type); if (!a) return; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    emit(type, data) {
      if (bus.log) bus.log.push({ type, data, frame: bus.frame });
      const a = map.get(type);
      if (a) for (let i = 0; i < a.length; i++) { try { a[i](data, type); } catch (e) { console.error("bus " + type, e); } }
      const w = map.get("*");
      if (w) for (let i = 0; i < w.length; i++) { try { w[i](type, data); } catch (e) { console.error("bus *", e); } }
    },
    clear() { map.clear(); },
  };
  return bus;
}
