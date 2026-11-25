// inventory.js - pure inventory functions (CRAFT owns; everyone calls them; API frozen: BONUS.md 5.2). DOM-free.
// inv = { slots: Array(n) of null | { id, n, d? }, sel: 0..8 (hotbar index), ver: integer bumped on every change }
// Slots 0..8 are the hotbar. Tools stack to 1 and carry d = durability left. These functions never emit events;
// callers emit "pickup"/"craft"/... themselves. UIs re-render when inv.ver changes.
//
// Frozen API: createInv invAdd invCount invRemove invHasAll invMissing invTakeAll invSelected invSelect invTool
//             invBestTier invWear invMove invRoom invSave invLoad INV_SLOTS HOTBAR
// CRAFT additions (compatible): invFind invSplit invQuickMove invSort invTakeSlot invEmpty invToolSlots
import { ITEMS, stackOf, toolOf } from "../data/items.js";

export const INV_SLOTS = 36;
export const HOTBAR = 9;

const cnt = (n) => (Number.isFinite(n) ? Math.floor(n) : 0);
const toolDur = (id) => (ITEMS[id] && ITEMS[id].tool ? ITEMS[id].tool.dur : 0);

export function createInv(n = INV_SLOTS) { return { slots: new Array(Math.max(1, n | 0)).fill(null), sel: 0, ver: 0 }; }

// add n of id (d = durability for a tool; default full). Fills existing stacks, then the first empty slots
// (hotbar first). Returns the number that did NOT fit (0 = all added).
export function invAdd(inv, id, n = 1, d) {
  n = cnt(n);
  if (!ITEMS[id] || n <= 0) return Math.max(0, n);
  const max = stackOf(id), S = inv.slots, tool = !!ITEMS[id].tool;
  const start = n;
  if (max > 1) {
    for (let i = 0; i < S.length && n > 0; i++) {
      const s = S[i];
      if (s && s.id === id && s.n < max) { const k = Math.min(n, max - s.n); s.n += k; n -= k; }
    }
  }
  for (let i = 0; i < S.length && n > 0; i++) {
    if (S[i]) continue;
    const k = Math.min(n, max);
    S[i] = { id, n: k };
    if (tool) { const full = toolDur(id); S[i].d = d == null || !Number.isFinite(d) ? full : Math.max(1, Math.min(full, Math.round(d))); }
    n -= k;
  }
  if (n !== start) inv.ver++;
  return n;
}
// how many of id are carried
export function invCount(inv, id) {
  let c = 0;
  for (const s of inv.slots) if (s && s.id === id) c += s.n;
  return c;
}
// remove up to n of id (from the LAST slots first so the hotbar keeps its items). Returns how many were removed.
export function invRemove(inv, id, n = 1) {
  n = cnt(n);
  let got = 0;
  const S = inv.slots;
  for (let i = S.length - 1; i >= 0 && got < n; i--) {
    const s = S[i];
    if (!s || s.id !== id) continue;
    const k = Math.min(s.n, n - got);
    s.n -= k; got += k;
    if (s.n <= 0) S[i] = null;
  }
  if (got) inv.ver++;
  return got;
}
// cost = { itemId: n }. -> true when everything is carried
export function invHasAll(inv, cost) {
  for (const id in cost) if (invCount(inv, id) < cost[id]) return false;
  return true;
}
// { itemId: missingCount } for the parts not carried ({} = has all)
export function invMissing(inv, cost) {
  const m = {};
  for (const id in cost) { const k = cost[id] - invCount(inv, id); if (k > 0) m[id] = k; }
  return m;
}
// take a whole cost atomically. -> false (and nothing taken) when anything is missing
export function invTakeAll(inv, cost) {
  if (!invHasAll(inv, cost)) return false;
  for (const id in cost) invRemove(inv, id, cost[id]);
  return true;
}
// the selected hotbar slot (or null)
export const invSelected = (inv) => inv.slots[inv.sel] || null;
export function invSelect(inv, i) { const k = (((i | 0) % HOTBAR) + HOTBAR) % HOTBAR; if (k !== inv.sel) { inv.sel = k; inv.ver++; } }
// the tool stats the player swings with right now (HAND when the selected slot is empty / not a tool)
export function invTool(inv) { const s = invSelected(inv); return s ? toolOf(s.id) : toolOf(null); }
// best tier of a tool type carried anywhere in the inventory (0 = none). e.g. invBestTier(inv, "hammer")
export function invBestTier(inv, type) {
  let t = 0;
  for (const s of inv.slots) if (s && ITEMS[s.id] && ITEMS[s.id].tool && ITEMS[s.id].tool.type === type) t = Math.max(t, ITEMS[s.id].tool.tier);
  return t;
}
// wear the tool in slot i by `amount`. Returns true when it broke (the slot is cleared).
export function invWear(inv, i, amount = 1) {
  const s = inv.slots[i];
  if (!s || s.d == null || !(amount > 0)) return false;
  s.d -= amount; inv.ver++;
  if (s.d <= 0) { inv.slots[i] = null; return true; }
  return false;
}
// swap / merge two slots (drag & drop in the UI). a and b may be in different inventories.
export function invMove(invA, a, invB, b) {
  if (a < 0 || b < 0 || a >= invA.slots.length || b >= invB.slots.length) return;
  if (invA === invB && a === b) return;
  const A = invA.slots[a], B = invB.slots[b];
  if (!A && !B) return;
  if (A && B && A.id === B.id && stackOf(A.id) > 1 && B.n < stackOf(B.id)) {
    const k = Math.min(A.n, stackOf(A.id) - B.n);
    B.n += k; A.n -= k; if (A.n <= 0) invA.slots[a] = null;
  } else { invA.slots[a] = B; invB.slots[b] = A; }
  invA.ver++; if (invB !== invA) invB.ver++;
}
// how many more of id would fit
export function invRoom(inv, id) {
  if (!ITEMS[id]) return 0;
  const max = stackOf(id);
  let r = 0;
  for (const s of inv.slots) r += !s ? max : s.id === id ? max - s.n : 0;
  return r;
}
// JSON-safe copy / restore (save files)
export const invSave = (inv) => ({ sel: inv.sel, slots: inv.slots.map((s) => (s ? (s.d == null ? [s.id, s.n] : [s.id, s.n, s.d]) : 0)) });
export function invLoad(inv, data) {
  if (!data || !Array.isArray(data.slots)) return inv;
  inv.slots = new Array(Math.max(inv.slots.length, Math.min(data.slots.length, INV_SLOTS))).fill(null);
  data.slots.forEach((s, i) => {
    if (i >= inv.slots.length || !Array.isArray(s) || !ITEMS[s[0]]) return;
    const id = s[0];
    inv.slots[i] = { id, n: Math.max(1, Math.min(stackOf(id), cnt(s[1]) || 1)) };
    if (ITEMS[id].tool) { const full = toolDur(id), d = Number(s[2]); inv.slots[i].d = s[2] == null || !Number.isFinite(d) ? full : Math.max(1, Math.min(full, Math.round(d))); }
  });
  inv.sel = Math.max(0, Math.min(HOTBAR - 1, data.sel | 0));
  inv.ver++;
  return inv;
}

// ------------------------------------------------------------------ CRAFT additions (compatible)
// first slot index matching pred(slot, i) in [from, to) (-1 = none)
export function invFind(inv, pred, from = 0, to = inv.slots.length) {
  for (let i = Math.max(0, from); i < Math.min(to, inv.slots.length); i++) if (pred(inv.slots[i], i)) return i;
  return -1;
}
// first empty slot in [from, to) or -1
export const invEmpty = (inv, from = 0, to = inv.slots.length) => invFind(inv, (s) => !s, from, to);
// split a stack: half (rounded down) moves into the first empty slot. -> the new slot index or -1
export function invSplit(inv, i) {
  const s = inv.slots[i];
  if (!s || s.n < 2) return -1;
  let j = invEmpty(inv, HOTBAR);
  if (j < 0) j = invEmpty(inv);
  if (j < 0) return -1;
  const k = Math.floor(s.n / 2);
  s.n -= k; inv.slots[j] = { id: s.id, n: k };
  inv.ver++;
  return j;
}
// shift-click: move the whole stack in from[i] into `to` (merging first, then empty slots inside [lo, hi)).
// from and to may be the same inventory (hotbar <-> backpack). -> how many could NOT be moved
export function invQuickMove(from, i, to, lo = 0, hi = to.slots.length) {
  const s = from.slots[i];
  if (!s) return 0;
  const max = stackOf(s.id);
  let n = s.n;
  if (max > 1) {
    for (let j = lo; j < hi && n > 0; j++) {
      if (from === to && j === i) continue;
      const t = to.slots[j];
      if (t && t.id === s.id && t.n < max) { const k = Math.min(n, max - t.n); t.n += k; n -= k; }
    }
  }
  for (let j = lo; j < hi && n > 0; j++) {
    if (from === to && j === i) continue;
    if (to.slots[j]) continue;
    const k = Math.min(n, max);
    to.slots[j] = { id: s.id, n: k };
    if (s.d != null) to.slots[j].d = s.d;
    n -= k;
  }
  if (n === s.n) return n;
  if (n <= 0) from.slots[i] = null; else s.n = n;
  from.ver++; if (to !== from) to.ver++;
  return n;
}
// tidy slots [from, to): merge partial stacks and sort by kind, then name. The hotbar (default) stays untouched.
const KIND_ORDER = { tool: 0, ammo: 1, food: 2, place: 3, block: 4, resource: 5 };
export function invSort(inv, from = HOTBAR, to = inv.slots.length) {
  const items = [];
  for (let i = from; i < to; i++) if (inv.slots[i]) items.push(inv.slots[i]);
  // merge
  const merged = [];
  for (const s of items) {
    const max = stackOf(s.id);
    let left = s.n;
    if (max > 1) for (const m of merged) if (m.id === s.id && m.n < max && left > 0) { const k = Math.min(left, max - m.n); m.n += k; left -= k; }
    if (left > 0) merged.push(s.d == null ? { id: s.id, n: left } : { id: s.id, n: left, d: s.d });
  }
  const ord = (s) => { const it = ITEMS[s.id]; return KIND_ORDER[it.kind] == null ? 9 : KIND_ORDER[it.kind]; };
  merged.sort((a, b) => ord(a) - ord(b) || (ITEMS[a.id].tool && ITEMS[b.id].tool ? ITEMS[b.id].tool.tier - ITEMS[a.id].tool.tier : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) || b.n - a.n);
  for (let i = from; i < to; i++) inv.slots[i] = merged[i - from] || null;
  inv.ver++;
}
// take up to n items out of slot i -> { id, n, d? } | null
export function invTakeSlot(inv, i, n) {
  const s = inv.slots[i];
  if (!s) return null;
  const k = Math.max(1, Math.min(s.n, n == null ? s.n : cnt(n)));
  const out = s.d == null ? { id: s.id, n: k } : { id: s.id, n: k, d: s.d };
  s.n -= k; if (s.n <= 0) inv.slots[i] = null;
  inv.ver++;
  return out;
}
// indexes of every tool of `type`, best tier first then most durability
export function invToolSlots(inv, type) {
  const out = [];
  inv.slots.forEach((s, i) => { const t = s && ITEMS[s.id] && ITEMS[s.id].tool; if (t && t.type === type) out.push(i); });
  out.sort((a, b) => ITEMS[inv.slots[b].id].tool.tier - ITEMS[inv.slots[a].id].tool.tier || inv.slots[b].d - inv.slots[a].d);
  return out;
}
