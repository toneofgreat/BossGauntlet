// craft/ui-css.js - the stylesheet for craft/ui.js (CRAFT owns). Class prefix bk-. Injected once per UI instance.
// Regions (BONUS.md 8.3): HUD top-left <= 180 px (<= 120 px under 520 px), hotbar bottom-center (touch: top 56 px,
// 9 x 36 px slots inside 358 px), HIT 72 px at right:124 bottom:16, BAG + USE 56 px at right:16 bottom:124.
// style.css gives every <button> margin 4px / min-height 44px / padding 10px 18px: every bk- button resets them.
export const CRAFT_CSS = `
.bk-hud{position:absolute;left:16px;top:12px;width:180px;display:flex;flex-direction:column;gap:5px;pointer-events:none;font:800 11px/1 system-ui,-apple-system,"Segoe UI",sans-serif;color:#fffaf0}
.bk-row{display:flex;align-items:center;gap:6px}
.bk-row svg{width:18px;height:18px;flex:none;filter:drop-shadow(0 1px 1px rgba(0,0,0,.65))}
.bk-bar{flex:1;height:12px;border-radius:7px;background:rgba(12,9,6,.58);box-shadow:inset 0 1px 2px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.16);overflow:hidden;position:relative}
.bk-bar i,.bk-bar s{position:absolute;left:0;top:0;bottom:0;width:100%;transform-origin:left center;border-radius:7px}
.bk-bar s{background:rgba(255,246,220,.6);transition:transform .55s ease .4s}
.bk-bar i{transition:transform .18s ease-out}
.bk-bar i::after{content:"";position:absolute;left:4px;right:4px;top:2px;height:3px;border-radius:2px;background:rgba(255,255,255,.38)}
.bk-bar em{position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 calc(10% - 1px),rgba(0,0,0,.22) calc(10% - 1px) 10%)}
.bk-row.hp i{background:linear-gradient(#ff9b86,#e8463b 55%,#ad2a24)}
.bk-row.hu i{background:linear-gradient(#ffdc8a,#eaa23c 55%,#b47020)}
.bk-num{min-width:26px;text-align:right;text-shadow:0 1px 2px #000,0 0 4px rgba(0,0,0,.6);font-variant-numeric:tabular-nums}
.bk-row.low .bk-bar{animation:bkPulse 1s ease-in-out infinite}
.bk-row.low svg{animation:bkBeat 1s ease-in-out infinite}
.bk-row.hit{animation:bkShake .35s}
.bk-row.gain .bk-bar{box-shadow:inset 0 1px 2px rgba(0,0,0,.7),0 0 0 2px #ffe08a,0 0 10px rgba(255,214,110,.8)}
@keyframes bkPulse{50%{box-shadow:inset 0 1px 2px rgba(0,0,0,.7),0 0 0 2px #ff5a3a,0 0 10px rgba(255,90,58,.9)}}
@keyframes bkBeat{50%{transform:scale(1.18)}}
@keyframes bkShake{20%{transform:translateX(-3px)}40%{transform:translateX(3px)}60%{transform:translateX(-2px)}80%{transform:translateX(1px)}}
.bk-chips{display:flex;gap:3px;flex-wrap:nowrap;white-space:nowrap;width:max-content;max-width:calc(100vw - 32px)}
.bk-chips span{background:rgba(10,8,6,.55);border-radius:8px;padding:3px 5px;font-size:10px;letter-spacing:.02em;box-shadow:0 0 0 1px rgba(255,255,255,.12)}
.bz-touch .bk-chips{position:absolute;left:calc(100% + 6px);top:0;max-width:none}
.bz-touch .bk-chips span{font-size:9.5px;padding:2px 5px}
.bk-row.sick svg{filter:drop-shadow(0 1px 1px rgba(0,0,0,.65)) hue-rotate(70deg) saturate(1.4)}
.bk-chips .sick{color:#c9f08a}.bk-chips .hungry,.bk-chips .starving{color:#ffb38a}.bk-chips .fed{color:#ffe7a0}.bk-chips .home{color:#a8e2ff}

.bk-hint{position:absolute;left:16px;top:84px;max-width:280px;display:flex;gap:8px;align-items:flex-start;padding:8px 8px 8px 10px;border-radius:12px;background:linear-gradient(180deg,rgba(48,38,24,.86),rgba(30,24,16,.86));border:1px solid rgba(255,214,140,.28);box-shadow:0 6px 18px rgba(0,0,0,.3);color:#fff6e2;font:600 12.5px/1.35 system-ui,sans-serif;pointer-events:auto;transition:opacity .35s,transform .35s}
.bk-hint.off{opacity:0;transform:translateY(-6px);pointer-events:none}
.bk-hint.new{animation:bkPop .5s}
.bk-hint p{margin:0;flex:1}
.bk-hn{flex:none;min-width:30px;height:20px;border-radius:10px;background:#f39c34;color:#2a1600;font:800 11px/20px system-ui;text-align:center;padding:0 5px}
.bk-hint button.bk-hx{flex:none;width:22px;height:22px;min-height:0;margin:-2px 0 0;padding:0;border-radius:50%;border:0;background:rgba(255,255,255,.12);color:#fff;font:700 13px/22px system-ui;cursor:pointer}
@keyframes bkPop{0%{transform:scale(.92);opacity:.2}60%{transform:scale(1.03)}100%{transform:none;opacity:1}}
.bz-touch .bk-hint{top:auto;bottom:calc(126px + env(safe-area-inset-bottom));right:96px;max-width:none;font-size:12px}

.bk-hot{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;gap:5px;padding:5px;border-radius:14px;background:rgba(14,11,8,.42);box-shadow:0 6px 20px rgba(0,0,0,.25),inset 0 0 0 1px rgba(255,255,255,.08);pointer-events:auto}
.bk-slot{position:relative;box-sizing:border-box;width:50px;height:50px;min-height:0;margin:0;padding:0;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:radial-gradient(circle at 50% 38%,rgba(70,58,42,.75),rgba(22,18,13,.85));box-shadow:inset 0 2px 5px rgba(0,0,0,.45);cursor:pointer;color:#fff;transition:transform .12s,border-color .12s;touch-action:none}
.bk-slot canvas{position:absolute;left:4px;top:4px;width:calc(100% - 8px);height:calc(100% - 8px);display:block;pointer-events:none}
.bk-slot b{position:absolute;right:4px;bottom:2px;font:800 12px/1 system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000,0 0 3px #000;pointer-events:none}
.bk-slot em{position:absolute;left:4px;top:3px;font:700 9px/1 system-ui;font-style:normal;color:rgba(255,255,255,.55);pointer-events:none}
.bk-slot u{position:absolute;left:6px;right:6px;bottom:4px;height:3px;border-radius:2px;background:rgba(0,0,0,.55);display:none;pointer-events:none;overflow:hidden}
.bk-slot u i{position:absolute;inset:0;transform-origin:left center;border-radius:2px}
.bk-slot.sel{border:2px solid #ffd36a;box-shadow:0 0 0 2px rgba(255,211,106,.28),inset 0 2px 5px rgba(0,0,0,.45),0 0 14px rgba(255,200,90,.35)}
.bk-hot .bk-slot.sel{transform:translateY(-3px)}
.bk-slot.picked{outline:2px dashed #8fd3ff;outline-offset:1px;background:radial-gradient(circle at 50% 38%,rgba(60,90,110,.8),rgba(18,26,32,.9))}
.bk-slot.dropok{border-color:#8fd3ff}
.bk-selname{position:absolute;left:50%;bottom:84px;transform:translateX(-50%);padding:4px 12px;border-radius:10px;background:rgba(14,11,8,.62);color:#fff6e2;font:700 13px system-ui,sans-serif;text-shadow:0 1px 2px #000;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .3s}
.bk-selname.on{opacity:1}
.bz-touch .bk-hot{bottom:auto;top:56px;gap:3px;padding:0;background:none;box-shadow:none}
.bz-touch .bk-hot .bk-slot{width:36px;height:36px;border-radius:8px}
.bz-touch .bk-hot .bk-slot.sel{transform:none}
.bz-touch .bk-hot .bk-slot canvas{left:2px;top:2px;width:calc(100% - 4px);height:calc(100% - 4px)}
.bz-touch .bk-hot .bk-slot b{font-size:10px;right:2px;bottom:1px}
.bz-touch .bk-hot .bk-slot u{left:4px;right:4px;bottom:2px;height:2px}
.bz-touch .bk-selname{display:none}

.bk-touch{position:absolute;right:124px;bottom:calc(16px + env(safe-area-inset-bottom));pointer-events:auto}
.bk-touch2{position:absolute;right:16px;bottom:calc(124px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:10px;pointer-events:auto}
.bk-tb{position:relative;width:56px;height:56px;min-height:0;margin:0;padding:0;border-radius:50%;background:rgba(0,0,0,.3);border:2px solid rgba(255,255,255,.38);color:#fff;font:800 11px/1 system-ui,sans-serif;letter-spacing:.04em;touch-action:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;text-shadow:0 1px 2px #000;box-shadow:0 4px 12px rgba(0,0,0,.25)}
.bk-tb.hit{width:72px;height:72px;font-size:12px}
.bk-tb canvas{width:30px;height:30px;pointer-events:none}
.bk-tb.hit canvas{width:34px;height:34px}
.bk-tb svg{width:24px;height:24px;pointer-events:none}
.bk-tb span{pointer-events:none}
.bk-tb.on{background:rgba(255,211,106,.38);border-color:#ffd36a;transform:scale(.94)}
.bk-tb.use.live{border-color:#8fe07a;background:rgba(60,110,40,.38)}
.bk-hidden{display:none !important}
.bk-invis{visibility:hidden}

.bk-panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);box-sizing:border-box;width:min(720px,calc(100vw - 32px));max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);overflow:auto;background:linear-gradient(180deg,rgba(50,39,26,.97),rgba(27,22,15,.97));color:#f6ecd8;border:1px solid rgba(255,220,160,.2);border-radius:18px;padding:14px;pointer-events:auto;font:14px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 22px 60px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.08);touch-action:pan-y;text-align:left}
.bk-panel h3{margin:4px 0 8px}
.bk-close{position:absolute;right:10px;top:10px;min-width:40px;height:40px;min-height:0;margin:0;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font:700 15px system-ui;cursor:pointer;z-index:2}
.bk-craft,.bk-chest{display:flex;flex-direction:column;overflow:hidden}
.bk-head{display:flex;align-items:center;gap:10px;padding-right:52px;margin-bottom:10px;min-height:40px}
.bk-head h2{margin:0;font:800 19px/1.1 system-ui,sans-serif;letter-spacing:-.01em;color:#fff3da}
.bk-head h2 small{display:block;font:600 11.5px system-ui;color:rgba(255,236,200,.6);margin-top:2px;letter-spacing:0}
.bk-msg{margin-left:auto;padding:4px 10px;border-radius:10px;background:rgba(143,224,122,.18);color:#d9f5c8;font:700 12.5px system-ui;opacity:0;transition:opacity .3s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:45%}
.bk-msg.on{opacity:1;transition:none}
.bk-seg{display:none;margin-left:auto;background:rgba(0,0,0,.3);border-radius:12px;padding:3px}
.bk-seg button{min-height:0;height:38px;margin:0;padding:0 14px;border-radius:9px;border:0;background:none;color:#f6ecd8;font:700 13px system-ui}
.bk-seg button.on{background:#f39c34;color:#2a1600}
.bk-body{display:grid;grid-template-columns:356px minmax(0,1fr);gap:14px;min-height:0;flex:1}
.bk-bag,.bk-cr{min-height:0;display:flex;flex-direction:column}
.bk-bag{overflow:auto}
.bk-sub{display:flex;align-items:center;justify-content:space-between;gap:6px;margin:2px 0 6px;font:800 11px system-ui;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,236,200,.62)}
.bk-grid{display:grid;grid-template-columns:repeat(9,36px);gap:4px;margin-bottom:10px}
.bk-grid .bk-slot{width:36px;height:36px;border-radius:9px}
.bk-grid .bk-slot canvas{left:3px;top:3px;width:calc(100% - 6px);height:calc(100% - 6px)}
.bk-grid.hot{padding:4px;margin:-4px -4px 6px;border-radius:12px;background:rgba(243,156,52,.1);box-shadow:inset 0 0 0 1px rgba(243,156,52,.25)}
.bk-mini{min-height:0;height:30px;margin:0;padding:0 10px;border-radius:9px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.07);color:#f6ecd8;font:700 12px system-ui;letter-spacing:0;text-transform:none;cursor:pointer}
.bk-info{border-radius:12px;background:rgba(0,0,0,.24);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);padding:10px;min-height:86px;display:flex;gap:10px;align-items:flex-start}
.bk-info canvas{width:48px;height:48px;flex:none}
.bk-info .t{flex:1;min-width:0}
.bk-info b{font-size:15px;color:#fff3da}
.bk-info .k{font:700 11px system-ui;color:rgba(255,236,200,.6);text-transform:uppercase;letter-spacing:.06em;margin:2px 0 4px}
.bk-info p{margin:0 0 6px;font-size:12.5px;color:rgba(255,246,226,.85)}
.bk-info .st{display:flex;gap:6px;flex-wrap:wrap;font:700 12px system-ui}
.bk-info .st span{background:rgba(255,255,255,.08);border-radius:7px;padding:2px 7px}
.bk-info .acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.bk-info .acts button,.bk-act{min-height:0;height:34px;margin:0;padding:0 12px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;font:700 12.5px system-ui;cursor:pointer}
.bk-info .acts button.pri,.bk-act.pri{background:#f39c34;border-color:transparent;color:#2a1600}
.bk-info .tip{font-size:12px;color:rgba(255,246,226,.7);margin:0}
.bk-tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px}
.bk-tab{position:relative;min-height:0;height:30px;margin:0;padding:0 8px 0 19px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#f6ecd8;font:700 11.5px system-ui;cursor:pointer;white-space:nowrap}
.bk-tab::before{content:"";position:absolute;left:8px;top:50%;width:7px;height:7px;margin-top:-3.5px;border-radius:50%;background:#6d6458}
.bk-tab.ready::before{background:#8fe07a;box-shadow:0 0 6px #8fe07a}
.bk-tab.all{padding-left:9px}.bk-tab.all::before{display:none}
.bk-tab.on,.bk-tab.on:hover:not(:disabled){background:#f6ecd8;color:#2a1c0c;border-color:transparent}
.bk-panel button.pri:hover:not(:disabled),.bk-seg button.on:hover:not(:disabled){background:#ffb352}
.bk-slot.sel:hover:not(:disabled){border-color:#ffe08a}
.bk-tab i{font-style:normal;margin-left:5px;padding:0 5px;border-radius:7px;background:#f39c34;color:#2a1600;font-size:10.5px}
.bk-tab i:empty{display:none}
.bk-tools{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;font:600 12.5px system-ui;color:rgba(255,246,226,.8)}
.bk-only{display:flex;align-items:center;gap:6px;cursor:pointer;min-height:30px}
.bk-only input{width:18px;height:18px;margin:0;accent-color:#f39c34}
.bk-list{overflow:auto;min-height:0;flex:1;padding-right:4px;touch-action:pan-y;overscroll-behavior:contain}
.bk-grp{margin-bottom:8px}
.bk-gh{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;padding:6px 4px 4px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:4px}
.bk-gh b{font:800 13px system-ui;color:#fff3da}
.bk-gh small{font:600 11.5px system-ui;color:#8fe07a}
.bk-grp.locked .bk-gh small{color:rgba(255,220,170,.7);flex-basis:100%;font-weight:600}
.bk-grp.locked .bk-gh b::before{content:"";display:inline-block;width:9px;height:8px;margin-right:6px;border:2px solid rgba(255,220,170,.7);border-radius:2px;vertical-align:0;box-shadow:0 -4px 0 -2px rgba(255,220,170,.7)}
.bk-grp.fold .bk-rec{display:none}
.bk-rec{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:8px;padding:5px 6px;border-radius:12px;margin-bottom:3px;background:rgba(255,255,255,.035);border:1px solid transparent;cursor:default}
.bk-rec.can{background:rgba(143,224,122,.07);border-color:rgba(143,224,122,.22)}
.bk-rec.no .bk-ic,.bk-rec.no .bk-rn{opacity:.55}
.bk-rec.focus{border-color:#ffd36a;box-shadow:0 0 0 1px #ffd36a}
.bk-rec.done{animation:bkDone .5s}
@keyframes bkDone{0%{background:rgba(255,220,120,.35)}100%{background:rgba(143,224,122,.07)}}
.bk-ic{position:relative;width:44px;height:44px;border-radius:10px;background:radial-gradient(circle at 50% 38%,rgba(70,58,42,.8),rgba(22,18,13,.85))}
.bk-ic canvas{position:absolute;inset:3px;width:38px;height:38px}
.bk-ic b{position:absolute;right:2px;bottom:1px;font:800 11px system-ui;text-shadow:0 1px 2px #000}
.bk-rn{font:700 13.5px system-ui;color:#fff3da;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bk-cost{display:flex;flex-wrap:wrap;gap:3px 5px;margin-top:3px}
.bk-chip{display:inline-flex;align-items:center;gap:2px;padding:1px 6px 1px 2px;border-radius:8px;background:rgba(0,0,0,.28);font:700 11.5px system-ui;color:#d9f5c8;font-variant-numeric:tabular-nums}
.bk-chip canvas{width:18px;height:18px}
.bk-chip em{display:none;font:600 10.5px system-ui;font-style:normal;opacity:.85;margin-left:2px}
.bz-touch .bk-chip em{display:inline}
.bk-chip{cursor:help}
.bk-house{flex:none;width:40px;height:40px;min-height:0;margin:0;padding:0;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font:17px/1 system-ui;cursor:pointer}
.bk-head .bk-seg + .bk-house{margin-left:6px}
.bk-head .bk-msg + .bk-seg + .bk-house{margin-left:6px}
.bk-chip.no{color:#ffb4a0;background:rgba(160,40,20,.25)}
.bk-btns{display:flex;flex-direction:column;gap:3px;align-items:stretch}
.bk-btns .r2{display:flex;gap:3px}
.bk-btns button{min-height:0;height:28px;margin:0;padding:0 9px;white-space:nowrap;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff;font:700 12px system-ui;cursor:pointer}
.bk-btns button.pri{height:30px;background:#f39c34;color:#2a1600;border-color:transparent;box-shadow:0 2px 0 #9b5a12}
.bk-btns .r2 button{flex:1;padding:0 6px;font-size:11px;height:24px}
.bk-btns button:disabled{opacity:.35}
.bk-foot{margin-top:8px;font:600 11.5px system-ui;color:rgba(255,236,200,.55);display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.bk-foot label{display:flex;gap:5px;align-items:center;cursor:pointer}
.bk-foot input{margin:0;accent-color:#f39c34}
.bk-empty{padding:16px 6px;color:rgba(255,236,200,.6);font-size:13px;text-align:center}
.bk-ghost{position:fixed;width:44px;height:44px;pointer-events:none;z-index:50;transform:translate(-50%,-60%) scale(1.15);filter:drop-shadow(0 6px 8px rgba(0,0,0,.5))}
.bk-chest .bk-grid{grid-template-columns:repeat(9,44px)}
.bk-chest .bk-grid .bk-slot{width:44px;height:44px}
.bk-chest .bk-scroll{overflow:auto;min-height:0;touch-action:pan-y}

@media (max-width:640px){
  .bk-panel{padding:10px;border-radius:16px}
  .bk-seg{display:flex}
  .bk-body{grid-template-columns:minmax(0,1fr)}
  .bk-craft[data-view=craft] .bk-bag{display:none}
  .bk-craft[data-view=bag] .bk-cr{display:none}
  .bk-grid,.bk-chest .bk-grid{grid-template-columns:repeat(9,minmax(0,1fr));gap:3px}
  .bk-grid .bk-slot,.bk-chest .bk-grid .bk-slot{width:auto;height:auto;aspect-ratio:1}
  .bk-head h2{font-size:17px}
  .bk-head h2 small{display:none}
  .bk-msg{position:absolute;left:12px;right:12px;top:54px;max-width:none;text-align:center;z-index:3}
  .bk-seg{margin-left:auto}
  .bk-foot{display:none}
  .bk-tab{height:36px}
  .bk-btns button{height:34px}.bk-btns button.pri{height:36px}.bk-btns .r2 button{height:30px}
}
@media (max-width:520px){
  .bk-hud{width:120px}
  .bk-row svg{width:15px;height:15px}
  .bk-num{min-width:22px;font-size:10px}
}
`;
