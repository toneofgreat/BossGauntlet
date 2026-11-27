// format.js - number formatting for the HUD and popups (DESIGN 4.4, 14). Pure.
const UNITS = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

/** 1234567 -> "1,234,567" (integers; negatives keep the sign) */
export function commas(n) {
  n = Math.round(Number(n) || 0);
  const neg = n < 0; let s = String(Math.abs(n));
  if (s.indexOf("e") >= 0) return (neg ? "-" : "") + s;
  let out = "";
  while (s.length > 3) { out = "," + s.slice(-3) + out; s = s.slice(0, -3); }
  return (neg ? "-" : "") + s + out;
}

/** abbreviate with `dec` decimals: 1400000 -> "1.40M" (dec 2) */
export function abbrev(n, dec) {
  n = Number(n) || 0;
  const neg = n < 0; let a = Math.abs(n);
  let u = 0;
  while (a >= 1000 && u < UNITS.length - 1) { a /= 1000; u++; }
  if (u === 0) return commas(n);
  // rounding can roll 999.95 -> 1000.0: bump the unit
  if (Number(a.toFixed(dec)) >= 1000 && u < UNITS.length - 1) { a /= 1000; u++; }
  return (neg ? "-" : "") + a.toFixed(dec) + UNITS[u];
}

/** HUD level: comma-formatted, abbreviated >= 10M as "12.4M" (3 significant digits) */
export function fmtLevel(n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  if (n < 1e7) return commas(n);
  let a = n, u = 0;
  while (a >= 1000 && u < UNITS.length - 1) { a /= 1000; u++; }
  const dec = a >= 100 ? 0 : a >= 10 ? 1 : 2;
  return a.toFixed(dec) + UNITS[u];
}

/** popups ("+1,234 LV"): abbreviated >= 1e6 as "1.40M" */
export function fmtPopup(n) {
  n = Math.round(Number(n) || 0);
  return Math.abs(n) >= 1e6 ? abbrev(n, 2) : commas(n);
}

/** multiplier: 96 -> "x96", 1.5 -> "x1.5", 1.25 -> "x1.25", 3456 -> "x3,456" */
export function fmtMult(m) {
  m = Number(m) || 1;
  if (m >= 1e6) return "x" + abbrev(m, 2);
  if (m >= 100) return "x" + commas(m);
  const r = Math.round(m * 100) / 100;
  return "x" + String(r);
}

/** play time ms -> "1h 05m" / "12m" */
export function fmtTime(ms) {
  const m = Math.floor((Number(ms) || 0) / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? h + "h " + String(m % 60).padStart(2, "0") + "m" : m + "m";
}
