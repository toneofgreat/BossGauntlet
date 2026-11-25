// time.js - day/night helpers (CORE owns, frozen). DOM-free. G.time = { t (0..DAY_FRAMES-1), day (1..) }.
import { DAY_FRAMES, PHASES } from "./const.js";

export const dayF = (G) => G.time.t / DAY_FRAMES;            // 0..1 through the current day
export function phaseAt(f) {
  let p = PHASES[0][0];
  for (let i = 0; i < PHASES.length; i++) if (f >= PHASES[i][1]) p = PHASES[i][0];
  return p;
}
export const phase = (G) => phaseAt(dayF(G));               // "dawn" | "day" | "dusk" | "night"
export const isNight = (G) => phase(G) === "night";
// sunlight 0.1 (deep night, moonlight) .. 1 (full day): smooth ramps through dawn and dusk
export function sunAt(f) {
  const s = (t) => t * t * (3 - 2 * t);
  if (f < 0.06) return 0.1 + 0.9 * s(f / 0.06);
  if (f < 0.62) return 1;
  if (f < 0.70) return 1 - 0.9 * s((f - 0.62) / 0.08);
  return 0.1;
}
export const sun = (G) => sunAt(dayF(G));
// clock text "Day 3 · 14:20" (dawn at 06:00, the day is 24 game hours)
export function clockText(G) {
  const mins = Math.floor((dayF(G) * 24 * 60 + 6 * 60) % (24 * 60));
  return "Day " + G.time.day + " · " + String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
}
// advance time by n steps; emits "time:phase" on phase changes and "time:day" at each new dawn
export function advanceTime(G, n = 1) {
  const before = phase(G);
  G.time.t += n;
  while (G.time.t >= DAY_FRAMES) { G.time.t -= DAY_FRAMES; G.time.day++; G.bus.emit("time:day", { day: G.time.day }); }
  const after = phase(G);
  if (after !== before) G.bus.emit("time:phase", { phase: after, from: before });
}
// jump to a fraction of the day (tests / sleeping). Crossing midnight-dawn counts as a new day.
export function setDayF(G, f) {
  const t = Math.floor(((f % 1) + 1) % 1 * DAY_FRAMES);
  let n = t - G.time.t; if (n < 0) n += DAY_FRAMES;
  advanceTime(G, n);
}
