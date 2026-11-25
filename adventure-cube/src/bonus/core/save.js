// save.js - versioned save slot in localStorage (CORE owns; frozen). Works with app.storage ({get, set} JSON) or
// any object with the same shape (tests pass a Map-backed fake). One slot: SAVE_KEY = "adventurecube.bonus.v1".
// Format: makeSave(G) in core/game.js -> { v, seed, frame, time, nextId, rng, player, inv, stats, flags, at,
//   world: { mods: [i, code, ...], trees: [...], objects: [...], drops: [...] }, creatures: null, craft: {...},
//   house: { level, chest, garden } }.  A save whose v is newer than SAVE_VERSION is ignored (never overwritten).
import { SAVE_KEY, SAVE_VERSION } from "./const.js";
import { makeSave } from "./game.js";

export function readSave(storage) {
  const s = storage && storage.get(SAVE_KEY, null);
  if (!s || typeof s !== "object" || !s.seed || (s.v | 0) > SAVE_VERSION) return null;
  return s;
}
export function writeSave(storage, G) {
  if (!storage) return false;
  const old = storage.get(SAVE_KEY, null);
  if (old && (old.v | 0) > SAVE_VERSION) return false;
  try { storage.set(SAVE_KEY, makeSave(G)); G.bus.emit("save", { at: Date.now() }); return true; } catch (e) { return false; }
}
export function clearSave(storage) { if (storage) storage.set(SAVE_KEY, null); }
export const hasSave = (storage) => !!readSave(storage);
