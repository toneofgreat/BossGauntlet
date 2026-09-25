// src/platform/ui/tokens.js — the design-token source of truth and the single
// stylesheet every platform/game DOM overlay styles itself from.
// Owner: spec 06 §5.6.1 (token values, verbatim) + §5.6.2 (accessibility rules).

export const TOKENS = Object.freeze({
  color: Object.freeze({
    bg: "#17191c", surface: "#24272b", surface2: "#2f3338", stroke: "#3d4249",
    text: "#f2f4f6", textDim: "#aab2ba",
    primary: "#00a2ff", primaryDown: "#0084d1", accent: "#ff7a1a",
    success: "#3ddc84",
    oofbux: "#f5c542", danger: "#e74c3c", warning: "#f39c12", ribbon: "#ff4757",
    overlay: "rgba(0,0,0,0.6)",
  }),
  font: Object.freeze({
    stack: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    weightBody: 400, weightBold: 600, weightDisplay: 800,
    size: Object.freeze({ sm: 14, md: 16, lg: 20, xl: 28, xxl: 40 }),
  }),
  radius: Object.freeze({ sm: 6, md: 10, lg: 16, pill: 999 }),
  space: Object.freeze([0, 4, 8, 12, 16, 24, 32, 48]),
  z: Object.freeze({ canvas: 0, game: 50, hud: 100, panel: 200, dialog: 300, toast: 400, loading: 500, error: 600 }),
  touch: Object.freeze({ minTarget: 44 }),
});

const STYLE_ID = "oof-tokens";

// #rrggbb -> rgba(r,g,b,a). Used for the alpha-bearing alias variables of §5.6.1
// (--oof-ui-bg at 35%, --oof-accent-dim at 28%) so those alphas stay derived from the
// canonical colors above rather than being second copies of them.
function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// §5.6.1 asks for "one custom property per token, kebab-cased", but §5.6.3/§5.6.4
// name the same token `--oof-textDim`. Both spellings are emitted for the two
// multi-word color tokens (custom properties are case-sensitive, so a consumer that
// picked either spelling resolves).
function rootVars() {
  const c = TOKENS.color;
  const f = TOKENS.font;
  const lines = [
    `--oof-bg:${c.bg}`, `--oof-surface:${c.surface}`, `--oof-surface2:${c.surface2}`,
    `--oof-stroke:${c.stroke}`, `--oof-text:${c.text}`,
    `--oof-text-dim:${c.textDim}`, `--oof-textDim:${c.textDim}`,
    `--oof-primary:${c.primary}`,
    `--oof-primary-down:${c.primaryDown}`, `--oof-primaryDown:${c.primaryDown}`,
    `--oof-accent:${c.accent}`, `--oof-success:${c.success}`, `--oof-oofbux:${c.oofbux}`,
    `--oof-danger:${c.danger}`, `--oof-warning:${c.warning}`, `--oof-ribbon:${c.ribbon}`,
    `--oof-overlay:${c.overlay}`,
    `--oof-font-stack:${f.stack}`,
    `--oof-weight-body:${f.weightBody}`, `--oof-weight-bold:${f.weightBold}`,
    `--oof-weight-display:${f.weightDisplay}`,
  ];
  for (const [k, v] of Object.entries(f.size)) lines.push(`--oof-size-${k}:${v}px`);
  for (const [k, v] of Object.entries(TOKENS.radius)) lines.push(`--oof-radius-${k}:${v}px`);
  TOKENS.space.forEach((v, i) => lines.push(`--oof-space-${i}:${v}px`));
  for (const [k, v] of Object.entries(TOKENS.z)) lines.push(`--oof-z-${k}:${v}`);
  lines.push(`--oof-touch-min:${TOKENS.touch.minTarget}px`);

  // Alias custom properties (§5.6.1) — consumer specs' names, canonical values.
  lines.push(
    `--oof-panel:${c.surface}`, `--oof-panel-2:${c.surface2}`, `--oof-panel-bg:${c.surface}`,
    `--oof-input-bg:${c.bg}`, `--oof-muted:${c.textDim}`,
    `--oof-border:${c.stroke}`, `--oof-ui-line:${c.stroke}`,
    `--oof-ui-bg:${rgba(c.surface, 0.35)}`, `--oof-accent-dim:${rgba(c.accent, 0.28)}`,
    `--oof-accent-text:#0c0e14`, `--oof-radius:${TOKENS.radius.md}px`,
  );
  return lines.join(";") + ";";
}

// Every component class named in §5.6.1. Classes for surfaces this slice defers
// (.oof-dialog*, .oof-panel*) ship here anyway: §5.6.1 makes injectTokens the single
// source for them, so dialog.js/panel.js (06 §5.6.5/§5.6.7) style themselves without
// adding a second stylesheet.
function componentCss() {
  return `
#oof-hud,.oof-toast,.oof-btn,.oof-pill,.oof-panel,.oof-dialog,.oof-grid-card,
.oof-seg,.oof-slider,.oof-toggle{font-family:var(--oof-font-stack);color:var(--oof-text);
  -webkit-tap-highlight-color:transparent}

/* ---- buttons (§5.6.5) ---- */
.oof-btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--oof-space-2);
  min-height:var(--oof-touch-min);min-width:var(--oof-touch-min);height:44px;
  padding:0 var(--oof-space-4);border:0;border-radius:var(--oof-radius-md);
  font-size:var(--oof-size-md);font-weight:var(--oof-weight-bold);line-height:1;
  cursor:pointer;user-select:none;background:var(--oof-surface2);color:var(--oof-text)}
.oof-btn:hover{filter:brightness(1.1)}
.oof-btn:active{transform:scale(0.97)}
.oof-btn[disabled],.oof-btn.is-disabled{opacity:.45;pointer-events:none}
.oof-btn-primary{background:var(--oof-primary);color:#ffffff}
.oof-btn-primary:active{background:var(--oof-primary-down)}
.oof-btn-secondary{background:var(--oof-surface2);border:1px solid var(--oof-stroke);color:var(--oof-text)}
.oof-btn-danger{background:var(--oof-danger);color:#ffffff}
.oof-btn-ghost{background:transparent;color:var(--oof-text-dim)}
.oof-btn-ghost:hover{color:var(--oof-text)}
.oof-btn-icon{padding:0;width:var(--oof-touch-min);height:var(--oof-touch-min);
  background:var(--oof-surface);font-size:22px}
:focus-visible{outline:2px solid var(--oof-primary);outline-offset:2px}

/* ---- pill (§5.6.3) ---- */
.oof-pill{display:inline-flex;align-items:center;gap:var(--oof-space-2);height:36px;
  padding:0 var(--oof-space-4);border-radius:var(--oof-radius-pill);
  background:rgba(36,39,43,0.85);border:1px solid var(--oof-stroke);
  font-size:var(--oof-size-md);font-weight:var(--oof-weight-bold);white-space:nowrap}
.oof-pill-disc{display:inline-flex;align-items:center;justify-content:center;
  width:22px;height:22px;border-radius:50%;background:var(--oof-oofbux);
  color:var(--oof-bg);font-size:var(--oof-size-sm);font-weight:var(--oof-weight-display)}

/* ---- HUD (§5.6.3) ---- */
#oof-hud{position:fixed;top:calc(8px + env(safe-area-inset-top));left:8px;right:8px;
  height:44px;z-index:var(--oof-z-hud);pointer-events:none;
  display:flex;align-items:center;justify-content:space-between;gap:var(--oof-space-2)}
#oof-hud>*{pointer-events:auto}
.oof-hud-title{max-width:40vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  border:0;font-size:var(--oof-size-sm)}
.oof-hud-right{display:flex;align-items:center;gap:var(--oof-space-2)}
.oof-hud-avatar-face{display:flex;align-items:center;justify-content:center;
  width:28px;height:28px;border-radius:var(--oof-radius-sm);font-size:var(--oof-size-sm);
  color:var(--oof-bg);font-weight:var(--oof-weight-display)}
.oof-hud-pulse{animation:oof-pulse 200ms ease-out}
@keyframes oof-pulse{0%{transform:scale(1)}50%{transform:scale(1.15)}100%{transform:scale(1)}}
/* §5.6.8 HUD stat chips: their own row under the 44px bar, left-aligned, so they
   never collide with the HUD-reserved centre/right strip of §5.6.1. */
#oof-hud-stats{position:fixed;top:calc(60px + env(safe-area-inset-top));left:8px;
  max-width:min(60vw,420px);z-index:var(--oof-z-hud);pointer-events:none;
  display:flex;flex-wrap:wrap;gap:var(--oof-space-2)}
#oof-hud-stats .oof-pill{height:30px;padding:0 var(--oof-space-3);font-size:var(--oof-size-sm)}
.oof-chip-label{color:var(--oof-text-dim);font-weight:var(--oof-weight-body)}

/* ---- toasts (§5.6.4) ---- */
#oof-toasts{position:fixed;top:calc(60px + env(safe-area-inset-top));left:50%;
  transform:translateX(-50%);width:min(360px,calc(100vw - 32px));
  z-index:var(--oof-z-toast);pointer-events:none;
  display:flex;flex-direction:column-reverse;gap:var(--oof-space-2)}
.oof-toast{display:flex;align-items:flex-start;gap:var(--oof-space-3);
  padding:var(--oof-space-3);border-radius:var(--oof-radius-md);
  background:rgba(36,39,43,0.95);border:1px solid var(--oof-stroke);
  transition:opacity 200ms ease,transform 200ms ease;opacity:0;transform:translateY(-16px)}
.oof-toast.is-in{opacity:1;transform:translateY(0)}
.oof-toast-badge{border-color:var(--oof-oofbux)}
.oof-toast-purchase{border-color:var(--oof-accent)}
.oof-toast-error{border-color:var(--oof-danger)}
.oof-toast-icon{font-size:28px;line-height:1.1;flex:0 0 auto}
.oof-toast-title{font-size:var(--oof-size-md);font-weight:var(--oof-weight-bold)}
.oof-toast-body{font-size:var(--oof-size-sm);color:var(--oof-text-dim)}

/* ---- dialogs (§5.6.5) ---- */
.oof-dialog-overlay{position:fixed;inset:0;background:var(--oof-overlay);
  z-index:var(--oof-z-dialog);display:flex;align-items:center;justify-content:center;
  padding:var(--oof-space-4)}
.oof-dialog{width:min(420px,calc(100vw - 32px));max-height:80vh;overflow:auto;
  background:var(--oof-surface);border-radius:var(--oof-radius-lg);padding:var(--oof-space-5)}
.oof-dialog-title{font-size:var(--oof-size-lg);font-weight:var(--oof-weight-display)}
.oof-dialog-body{font-size:var(--oof-size-md);color:var(--oof-text-dim);margin-top:var(--oof-space-2)}
.oof-dialog-buttons{display:flex;justify-content:flex-end;gap:var(--oof-space-2);
  margin-top:var(--oof-space-4);flex-wrap:wrap}

/* ---- panels & shop grid (§5.6.7) ---- */
.oof-panel-scrim{position:fixed;inset:0;background:var(--oof-overlay);z-index:var(--oof-z-panel)}
.oof-panel{position:fixed;z-index:var(--oof-z-panel);background:var(--oof-surface);
  display:flex;flex-direction:column;transition:transform 200ms ease}
.oof-panel-header{display:flex;align-items:center;justify-content:space-between;
  gap:var(--oof-space-3);padding:var(--oof-space-3) var(--oof-space-4);
  border-bottom:1px solid var(--oof-stroke)}
.oof-panel-title{font-size:var(--oof-size-lg);font-weight:var(--oof-weight-display)}
.oof-panel-body{flex:1;overflow-y:auto;padding:var(--oof-space-4);
  display:flex;flex-direction:column;gap:var(--oof-space-3);align-items:stretch}
.oof-panel-body>.oof-btn{align-self:flex-start}
.oof-panel-handle{width:36px;height:5px;border-radius:var(--oof-radius-pill);
  background:var(--oof-stroke);margin:var(--oof-space-2) auto 0}
@media (orientation:landscape){
  .oof-panel{top:0;right:0;bottom:0;width:min(380px,45vw);border-left:1px solid var(--oof-stroke)}
  .oof-panel-handle{display:none}
}
@media (orientation:portrait){
  .oof-panel{left:0;right:0;bottom:0;height:75vh;width:100vw;
    border-radius:var(--oof-radius-lg) var(--oof-radius-lg) 0 0}
}
.oof-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:var(--oof-space-3)}
.oof-grid-card{display:flex;flex-direction:column;gap:var(--oof-space-2);
  padding:var(--oof-space-2);border-radius:var(--oof-radius-md);border:2px solid transparent;
  background:var(--oof-surface2);color:var(--oof-text);cursor:pointer;text-align:left;
  font-family:var(--oof-font-stack)}
.oof-grid-card:active{transform:scale(0.97)}
.oof-grid-card.is-equipped{border-color:var(--oof-primary)}
.oof-grid-icon{aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;
  font-size:40px;background:var(--oof-bg);border-radius:var(--oof-radius-sm)}
.oof-grid-name{font-size:var(--oof-size-sm);font-weight:var(--oof-weight-bold);
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.oof-grid-price{display:flex;align-items:center;gap:var(--oof-space-1);
  font-size:var(--oof-size-sm);color:var(--oof-oofbux)}
.oof-grid-price .oof-pill-disc{width:14px;height:14px;font-size:10px}
.oof-swatch{width:64%;height:64%;border-radius:var(--oof-radius-sm);border:2px solid var(--oof-stroke)}
.oof-grid-owned{font-size:var(--oof-size-sm);font-weight:var(--oof-weight-bold);color:var(--oof-accent)}

/* ---- form controls (§5.6.9 uses these; kit.js builds them) ---- */
.oof-seg{display:inline-flex;border:1px solid var(--oof-stroke);border-radius:var(--oof-radius-md);
  overflow:hidden}
.oof-seg-opt{min-height:var(--oof-touch-min);padding:0 var(--oof-space-3);border:0;
  background:transparent;color:var(--oof-text-dim);font-size:var(--oof-size-sm);
  font-weight:var(--oof-weight-bold);cursor:pointer;font-family:var(--oof-font-stack)}
.oof-seg-opt.is-on{background:var(--oof-primary);color:#ffffff}
.oof-row{display:flex;align-items:center;justify-content:space-between;gap:var(--oof-space-3);
  min-height:var(--oof-touch-min);font-size:var(--oof-size-md)}
.oof-slider{flex:1;min-height:var(--oof-touch-min);accent-color:var(--oof-primary)}
.oof-toggle{position:relative;width:52px;height:var(--oof-touch-min);flex:0 0 auto;
  border:0;background:transparent;cursor:pointer;padding:0}
.oof-toggle-track{position:absolute;top:11px;left:0;width:52px;height:22px;
  border-radius:var(--oof-radius-pill);background:var(--oof-surface2);
  border:1px solid var(--oof-stroke);transition:background 200ms ease}
.oof-toggle-knob{position:absolute;top:13px;left:2px;width:18px;height:18px;border-radius:50%;
  background:var(--oof-text-dim);transition:transform 200ms ease,background 200ms ease}
.oof-toggle.is-on .oof-toggle-track{background:var(--oof-primary)}
.oof-toggle.is-on .oof-toggle-knob{background:#ffffff;transform:translateX(30px)}
.oof-section-label{font-size:var(--oof-size-sm);font-weight:var(--oof-weight-bold);
  color:var(--oof-text-dim);letter-spacing:1px;margin-top:var(--oof-space-2)}
.oof-section-label:first-child{margin-top:0}

/* ---- travel overlay (§5.2.5 step 2) and error screen (§5.2.6) ---- */
#oof-transition{position:fixed;inset:0;z-index:var(--oof-z-loading);background:var(--oof-bg);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:var(--oof-space-4);opacity:0;transition:opacity 300ms ease}
#oof-transition.is-in{opacity:1}
.oof-transition-cube{width:48px;height:48px;perspective:240px}
.oof-transition-cube>div{width:100%;height:100%;border-radius:var(--oof-radius-sm);
  background:var(--oof-primary);box-shadow:inset 0 -12px 0 rgba(0,0,0,0.25);
  animation:oof-cube-spin 1.6s steps(8) infinite}
/* steps(8), not linear: this overlay is on screen for the whole of every Place load,
   and a continuously interpolated transform makes the compositor commit a full-viewport
   frame every tick. Where compositing is software (a phone with no GPU rasterization,
   or SwiftShader under tools/smoke.js) that competes with the load itself — measured
   ~2.5 s off a Hub load. Same quantization as index.html's boot cube. */
@keyframes oof-cube-spin{from{transform:rotateX(-24deg) rotateY(0)}to{transform:rotateX(-24deg) rotateY(360deg)}}
.oof-transition-label{font-size:var(--oof-size-md);color:var(--oof-text-dim)}
#oof-error{position:fixed;inset:0;z-index:var(--oof-z-error);background:var(--oof-bg);
  overflow:auto;display:flex;align-items:center;justify-content:center;padding:var(--oof-space-5)}
.oof-error-card{width:100%;max-width:480px;display:flex;flex-direction:column;gap:var(--oof-space-3)}
.oof-error-title{font-size:var(--oof-size-xl);font-weight:var(--oof-weight-display)}
.oof-error-message{font-size:var(--oof-size-md);color:var(--oof-text-dim);word-break:break-word}
.oof-error-card summary{font-size:var(--oof-size-sm);color:var(--oof-text-dim);cursor:pointer;
  min-height:var(--oof-touch-min);display:flex;align-items:center}
/* 12px is permitted here: stack traces are developer content, exempt from the 14px
   DOM floor of §5.6.2 rule 1. */
.oof-error-stack{max-height:40vh;overflow:auto;font-size:12px;white-space:pre-wrap;
  background:var(--oof-surface);border-radius:var(--oof-radius-md);padding:var(--oof-space-3)}
.oof-error-buttons{display:flex;gap:var(--oof-space-2);flex-wrap:wrap}
.oof-error-copy{width:100%;min-height:120px;font-size:var(--oof-size-sm);
  background:var(--oof-input-bg);color:var(--oof-text);border:1px solid var(--oof-stroke);
  border-radius:var(--oof-radius-md);padding:var(--oof-space-2)}

/* ---- touch controls: COLOURS ONLY (§5.6.1; input.js owns geometry) ---- */
.oof-joystick,#oof-touch-base{background:rgba(47,51,56,0.35);border:2px solid var(--oof-stroke)}
.oof-joystick-knob,#oof-touch-knob{background:rgba(0,162,255,0.7)}
.oof-btn-jump,#oof-touch-jump{background:rgba(47,51,56,0.5);color:var(--oof-text)}

/* ---- accessibility switches (§5.6.2) ---- */
.oof-large-text{--oof-size-sm:16px;--oof-size-md:18px;--oof-size-lg:24px;--oof-size-xl:32px}
.oof-reduced-motion *,.oof-reduced-motion *::before,.oof-reduced-motion *::after{
  animation-duration:0s !important;animation-delay:0s !important;
  transition-duration:0s !important;transition-delay:0s !important}
`;
}

// injectTokens() — idempotent: replaces the existing <style id="oof-tokens"> so a
// re-import (or a hot reload) never stacks two copies of the sheet.
export function injectTokens() {
  const previous = document.getElementById(STYLE_ID);
  if (previous) previous.remove();
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `:root{${rootVars()}}\n${componentCss()}`;
  document.head.appendChild(style);
  return style;
}

function withSeparators(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// One decimal, trailing ".0" trimmed — 123456 -> "123.5K", 250000 -> "250K".
function scaled(n, divisor, unit) {
  const value = Math.round((n / divisor) * 10) / 10;
  return (Number.isInteger(value) ? String(value) : value.toFixed(1)) + unit;
}

// formatOofbux(n) — spec 06 §5.6.1 / §7 criterion 15.
export function formatOofbux(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return "0";
  if (value < 0) return "-" + formatOofbux(-value);
  const whole = Math.trunc(value);
  if (whole < 10000) return withSeparators(String(whole));
  if (whole < 1e6) return scaled(whole, 1000, "K");
  return scaled(whole, 1e6, "M");
}
