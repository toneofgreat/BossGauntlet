// style.js - the UI stylesheet, injected once as a <style> element (no external assets, system fonts only).
export const CSS = `
#ui{position:fixed;inset:0;z-index:20;pointer-events:none;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  color:#eee;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;
  --serif:"Cormorant Garamond","Cormorant","Garamond","Georgia","Times New Roman",serif;
  --glass:rgba(14,14,18,.62);--glass2:rgba(22,22,28,.86);--line:rgba(255,255,255,.18);--line2:rgba(255,255,255,.34);
  --gold:#e8c66a;--good:#9fd38a;--warn:#e9a55a;--danger:#c0141c;--muted:#9a9a9a;--txt:#ececec;
  --safeT:env(safe-area-inset-top,0px);--safeB:env(safe-area-inset-bottom,0px);--safeL:env(safe-area-inset-left,0px);--safeR:env(safe-area-inset-right,0px)}
#ui *{box-sizing:border-box}
#ui button,#ui input,#ui a,#ui .tn-click{pointer-events:auto}
#ui button{font:inherit;color:inherit;cursor:pointer}
#ui .tn-hide{display:none!important}
#ui .tn-btn{min-height:44px;width:min(280px,80vw);background:transparent;border:1px solid rgba(255,255,255,.7);color:#f2f2f2;
  letter-spacing:.3em;font-size:13px;text-transform:uppercase;padding:0 14px;border-radius:2px;transition:background .25s,color .25s,border-color .25s}
#ui .tn-btn:hover,#ui .tn-btn:focus-visible{background:rgba(255,255,255,.92);color:#0a0a0a;outline:none}
#ui .tn-btn.tn-primary{border-color:#fff}
#ui .tn-btn.sm{width:auto;min-width:96px;letter-spacing:.14em;font-size:12px;min-height:40px}
#ui .tn-link{background:none;border:0;color:#a8a8a8;font-size:12px;text-decoration:underline;text-underline-offset:3px;padding:8px 6px;min-height:32px}
#ui .tn-link:hover{color:#fff}

/* ---------- title ---------- */
.tn-title{position:absolute;inset:0;background:#000;z-index:70;pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;
  transition:opacity 1.2s ease;touch-action:none}
.tn-title.red{background:#0b0000}
.tn-title canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.tn-title .tn-back{position:absolute;left:calc(10px + var(--safeL));top:calc(8px + var(--safeT));font-size:12px;color:#8a8a8a;text-decoration:none;padding:8px;z-index:2;letter-spacing:.05em}
.tn-title .tn-back:hover{color:#fff}
.tn-title .tn-center{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;width:100%;padding:0 16px;transform:translateY(-4vh);transition:transform 1s cubic-bezier(.2,.7,.2,1)}
.tn-title.naming .tn-center{transform:translateY(-14vh)}
.tn-name{font-family:var(--serif);font-weight:300;color:#e8e8e8;letter-spacing:.35em;font-size:clamp(20px,6vw,44px);text-align:center;margin:0;
  padding-left:.35em;opacity:0;transition:opacity 4s ease;line-height:1.3;max-width:100%;overflow-wrap:break-word}
.tn-name.in{opacity:1}
.tn-title.red .tn-name{color:#ff3b3b;text-shadow:0 0 18px rgba(192,20,28,.6)}
.tn-normal{position:relative;display:inline-block}
.tn-normal .tn-ghost{position:absolute;left:0;top:0;opacity:0;color:#bfbfbf;pointer-events:none;white-space:nowrap}
.tn-normal.glitch .tn-ghost{opacity:.85;transform:translate(.08em,-.06em) skewX(-6deg)}
.tn-normal.glitch .tn-real{opacity:.25}
.tn-normal.dip .tn-real{animation:tnDip 1s ease}
@keyframes tnDip{50%{opacity:.35}}
.tn-subt{font-family:var(--serif);font-style:italic;color:#888;font-size:13px;margin:10px 0 0;letter-spacing:.08em;opacity:0;transition:opacity 3s ease 1.6s;text-align:center}
.tn-name.in + .tn-subt{opacity:1}
.tn-menu-col{display:flex;flex-direction:column;align-items:center;gap:12px;margin-top:clamp(28px,7vh,64px);opacity:0;transition:opacity 1.6s ease 1.8s}
.tn-title.ready .tn-menu-col{opacity:1}
.tn-asname{font-size:12px;color:#8b8b8b;text-align:center;max-width:min(320px,86vw);overflow-wrap:anywhere}
.tn-entry{display:flex;flex-direction:column;align-items:center;gap:12px;margin-top:clamp(24px,6vh,48px);width:min(320px,88vw)}
.tn-entry label{font-family:var(--serif);font-size:clamp(17px,4.6vw,22px);color:#ddd;letter-spacing:.06em;text-align:center}
.tn-entry input{width:100%;height:46px;background:rgba(255,255,255,.04);border:0;border-bottom:1px solid rgba(255,255,255,.55);color:#fff;
  font:300 20px var(--serif);text-align:center;letter-spacing:.12em;outline:none;border-radius:0;-webkit-user-select:text;user-select:text}
.tn-entry input:focus{border-bottom-color:#fff;background:rgba(255,255,255,.07)}
.tn-entry input::placeholder{color:#666}
.tn-err{min-height:34px;font-size:12.5px;color:#e7b0a0;text-align:center;line-height:1.4;max-width:100%}
.tn-err.shake{animation:tnShake .35s}
@keyframes tnShake{25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.tn-photo{position:absolute;bottom:calc(14px + var(--safeB));left:50%;transform:translateX(-50%);width:min(360px,calc(100vw - 32px));font-size:11.5px;line-height:1.5;color:#9a9a9a;text-align:center;z-index:1}
.tn-photo .tn-link{font-size:11.5px;padding:4px 2px;min-height:0;color:#c9c9c9}
.tn-sound{position:absolute;top:calc(14px + var(--safeT));left:50%;transform:translateX(-50%);font-size:11px;letter-spacing:.28em;color:#777;text-transform:uppercase;transition:opacity 1.5s;z-index:1;white-space:nowrap}
.tn-title .tn-sound.gone{opacity:0}

/* ---------- HUD ---------- */
.tn-hud{position:absolute;inset:0;transition:opacity .5s}
.tn-hud.off{opacity:0;visibility:hidden}
.tn-stats{position:absolute;left:calc(12px + var(--safeL));top:calc(10px + var(--safeT));width:min(250px,calc(50vw - 20px));text-shadow:0 1px 3px rgba(0,0,0,.8)}
.tn-who{display:flex;align-items:center;gap:6px;font-size:12px;color:rgba(255,255,255,.82);max-width:100%}
.tn-who .n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.tn-pausebtn{width:30px;height:30px;flex:0 0 auto;border-radius:50%;border:1px solid var(--line2)!important;background:rgba(0,0,0,.35)!important;font-size:12px!important;line-height:1;padding:0}
.tn-lvrow{display:flex;align-items:baseline;gap:8px;margin-top:1px;min-width:0}
.tn-lvl{font-family:var(--serif);font-weight:600;font-size:clamp(26px,7vw,38px);line-height:1;color:#fff;letter-spacing:.01em;font-variant-numeric:tabular-nums;transition:color .4s,text-shadow .4s}
.tn-lvl small{font-family:system-ui,sans-serif;font-size:11px;font-weight:600;letter-spacing:.18em;color:rgba(255,255,255,.65);margin-right:4px}
.tn-lvl.pulse{color:var(--gold);text-shadow:0 0 16px rgba(232,198,106,.7)}
.tn-mult{font-size:12px;font-weight:700;color:var(--gold);letter-spacing:.04em}
.tn-gain{position:absolute;left:0;top:100%;margin-top:6px;font-size:12px;font-weight:700;color:var(--gold);text-shadow:0 1px 3px #000;opacity:0;transform:translateY(4px);transition:opacity .25s,transform .25s;white-space:nowrap}
.tn-gain.on{opacity:1;transform:none}
.tn-hp{position:relative;height:9px;margin-top:6px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.28);border-radius:5px;overflow:hidden}
.tn-hp i{position:absolute;left:0;top:0;bottom:0;width:100%;transform-origin:left;background:linear-gradient(90deg,#b8342e,#e2584a);transition:transform .2s}
.tn-hp b{position:absolute;left:0;top:0;bottom:0;width:100%;transform-origin:left;background:rgba(255,255,255,.35);transition:transform .8s .25s}
.tn-hp.low i{animation:tnLow 1.1s infinite}
@keyframes tnLow{50%{filter:brightness(1.5)}}
.tn-hptxt{font-size:10.5px;color:rgba(255,255,255,.72);margin-top:2px;font-variant-numeric:tabular-nums}
.tn-equip{display:flex;gap:4px;margin-top:6px}
.tn-equip .s{width:30px;height:30px;border-radius:6px;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center}
.tn-equip .s img{width:26px;height:26px;display:block}
.tn-equip .s.empty{opacity:.35}
.tn-lives{display:flex;gap:4px;margin-top:6px;font-size:18px;color:#e24a4a;text-shadow:0 0 6px rgba(226,74,74,.6)}
.tn-lives .x{color:rgba(255,255,255,.22);text-shadow:none}
.tn-fps{position:absolute;left:calc(12px + var(--safeL));bottom:calc(6px + var(--safeB));font:11px ui-monospace,Consolas,monospace;color:#9f9;text-shadow:0 1px 2px #000}

.tn-obj{position:absolute;left:50%;top:calc(10px + var(--safeT));transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;width:min(440px,calc(100vw - 32px));pointer-events:none}
.tn-objtxt{font-family:var(--serif);font-size:clamp(15px,4.2vw,19px);color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.9);text-align:center;letter-spacing:.03em;line-height:1.25;
  transition:opacity .45s,transform .45s;max-width:100%;overflow-wrap:break-word}
.tn-objtxt::before{content:"\\203A  ";color:var(--gold)}
.tn-objtxt.chg{opacity:0;transform:translateY(-6px)}
.tn-objtxt.empty{display:none}
.tn-compass{width:min(220px,46vw);height:20px;margin-top:3px;opacity:.85}
.tn-boss{position:absolute;left:50%;top:calc(66px + var(--safeT));transform:translateX(-50%);width:min(520px,calc(100vw - 32px));text-align:center;transition:opacity .5s}
.tn-boss.off{opacity:0;visibility:hidden}
.tn-bossname{font-family:var(--serif);font-size:clamp(14px,4vw,18px);letter-spacing:.22em;text-transform:uppercase;color:#f0e6e6;text-shadow:0 1px 4px #000;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tn-bossbar{position:relative;height:10px;margin-top:4px;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.35);overflow:hidden}
.tn-bossbar i{position:absolute;inset:0;transform-origin:left;background:linear-gradient(90deg,#7d1010,#c0141c 60%,#e0453c);transition:transform .15s}
.tn-bossbar b{position:absolute;inset:0;transform-origin:left;background:rgba(255,240,220,.45);transition:transform .9s .3s}
.tn-bossbar .seg{position:absolute;top:0;bottom:0;width:1px;background:rgba(0,0,0,.75)}
.tn-pips{display:flex;justify-content:center;gap:6px;margin-top:4px;height:8px}
.tn-pips span{width:8px;height:8px;transform:rotate(45deg);border:1px solid rgba(255,255,255,.5)}
.tn-pips span.on{background:#e0453c;border-color:#e0453c}

.tn-marker{position:absolute;left:0;top:0;width:0;height:0;will-change:transform;pointer-events:none}
.tn-marker .d{position:absolute;left:-9px;top:-9px;width:18px;height:18px;border:2px solid var(--gold);transform:rotate(45deg);background:rgba(232,198,106,.18);box-shadow:0 0 10px rgba(232,198,106,.5)}
.tn-marker .a{position:absolute;left:-7px;top:-24px;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:11px solid var(--gold);display:none}
.tn-marker.edge .a{display:block}
.tn-marker .m{position:absolute;left:-40px;top:13px;width:80px;text-align:center;font-size:11px;font-weight:700;color:#fff;text-shadow:0 1px 3px #000;font-variant-numeric:tabular-nums}
.tn-marker.red .d{border-color:#ff4a4a;background:rgba(192,20,28,.25);box-shadow:0 0 10px rgba(255,60,60,.6)}
.tn-marker.red .a{border-bottom-color:#ff4a4a}
.tn-prompt{position:absolute;left:50%;bottom:calc(22% + var(--safeB));transform:translateX(-50%);padding:9px 16px;background:var(--glass);border:1px solid var(--line2);border-radius:22px;
  font-size:14px;color:#fff;white-space:nowrap;max-width:calc(100vw - 32px);overflow:hidden;text-overflow:ellipsis;transition:opacity .2s,transform .2s;backdrop-filter:blur(4px)}
.tn-prompt kbd{display:inline-block;min-width:22px;padding:1px 6px;margin-right:8px;border:1px solid rgba(255,255,255,.6);border-radius:4px;font:700 12px system-ui;text-align:center;background:rgba(255,255,255,.1)}
.tn-prompt.off{opacity:0;transform:translateX(-50%) translateY(8px)}
.tn-toasts{position:absolute;z-index:47;left:calc(12px + var(--safeL));bottom:calc(16px + var(--safeB));display:flex;flex-direction:column-reverse;gap:6px;width:min(320px,calc(100vw - 32px))}
body.tn-touch .tn-toasts{bottom:calc(200px + var(--safeB))}
body.tn-touch.tn-touchui .tn-prompt{display:none}
@media (max-width:600px){
  .tn-title .tn-sound{top:auto;bottom:calc(96px + var(--safeB))}
  .tn-stats{width:min(200px,52vw)}
  .tn-lvl{font-size:26px}
  .tn-equip .s{width:24px;height:24px}.tn-equip .s img{width:20px;height:20px}
  .tn-obj{left:auto;right:calc(10px + var(--safeR));top:calc(50px + var(--safeT));transform:none;width:min(46vw,240px);align-items:flex-end}
  .tn-objtxt{text-align:right;font-size:15px}
  .tn-compass{width:100%}
  .tn-boss{top:calc(190px + var(--safeT))}
  .tn-toasts{width:min(300px,calc(100vw - 32px))}
  .tn-toast{font-size:12.5px;padding:7px 10px}
}
.tn-toast{padding:9px 12px;background:var(--glass2);border-left:3px solid #bbb;border-radius:3px;font-size:13px;line-height:1.35;color:#f2f2f2;
  box-shadow:0 4px 14px rgba(0,0,0,.35);animation:tnIn .35s ease;transition:opacity .4s,transform .4s;overflow-wrap:break-word}
.tn-toast.good{border-left-color:var(--good)} .tn-toast.warn{border-left-color:var(--warn)}
.tn-toast.secret{border-left-color:var(--gold);background:linear-gradient(90deg,rgba(60,48,16,.92),rgba(22,22,28,.9))}
.tn-toast.secret b{color:var(--gold);letter-spacing:.14em;font-size:11px;display:block}
.tn-toast.out{opacity:0;transform:translateX(-14px)}
@keyframes tnIn{from{opacity:0;transform:translateX(-14px)}}
.tn-banner{position:absolute;z-index:46;left:50%;top:34%;transform:translate(-50%,-50%);width:calc(100vw - 32px);max-width:640px;text-align:center;pointer-events:none;opacity:0;transition:opacity .6s,letter-spacing 1.4s}
.tn-banner.on{opacity:1}
.tn-banner h2{margin:0;font:300 clamp(22px,6.4vw,44px) var(--serif);letter-spacing:.22em;color:#fff;text-shadow:0 2px 18px rgba(0,0,0,.8);overflow-wrap:break-word;padding-left:.22em}
.tn-banner p{margin:6px 0 0;font-size:clamp(12px,3.4vw,14px);letter-spacing:.12em;color:#e6dcc0;text-shadow:0 1px 6px #000}
.tn-banner hr{width:min(240px,50vw);border:0;border-top:1px solid rgba(255,255,255,.5);margin:10px auto}
.tn-sub{position:absolute;z-index:67;left:50%;bottom:calc(30% + var(--safeB));transform:translateX(-50%);width:max-content;max-width:min(620px,calc(100vw - 32px));text-align:center;
  font-size:clamp(14px,3.9vw,17px);line-height:1.4;color:#fff;background:rgba(0,0,0,.5);padding:6px 12px;border-radius:3px;transition:opacity .4s;text-shadow:0 1px 2px #000}
.tn-sub.off{opacity:0}
.tn-sub.hollow{font-family:var(--serif);font-style:italic;letter-spacing:.12em;background:rgba(0,0,0,.35);color:#f3e9e9}
.tn-dmg{position:absolute;left:0;top:0;font-weight:800;font-size:16px;color:#fff;text-shadow:0 1px 0 #000,0 0 4px rgba(0,0,0,.8);white-space:nowrap;will-change:transform,opacity;pointer-events:none}
.tn-dmg.crit{color:#ffd84a;font-size:20px}
.tn-dmg.levels{color:var(--gold);font-size:17px;font-family:var(--serif)}
.tn-dmg.hurt{color:#ff5a4e}
.tn-vig{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 45%,rgba(150,0,0,.75) 100%)}
.tn-letter{position:absolute;left:0;right:0;height:11vh;background:#000;transition:transform .6s ease;z-index:45}
.tn-letter.t{top:0;transform:translateY(-101%)} .tn-letter.b{bottom:0;transform:translateY(101%)}
.tn-letter.on{transform:none}

/* ---------- leaderboard ---------- */
.tn-lb{position:absolute;right:calc(10px + var(--safeR));top:calc(10px + var(--safeT));z-index:72;width:auto;max-width:min(220px,46vw);transition:opacity .4s}
.tn-lb.off{opacity:0;visibility:hidden}
/* touch controls show a menu button (42px) in the top-right corner: sit to its left */
#touch.on~#ui .tn-lb,body.tn-touch #ui .tn-lb{right:calc(60px + var(--safeR));max-width:min(220px,calc(100vw - 80px))}
.tn-lbpill{display:flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:16px;background:var(--glass);border:1px solid var(--line2);font-size:12px;color:#eee;
  margin-left:auto;backdrop-filter:blur(6px);white-space:nowrap;letter-spacing:.04em}
.tn-lbpill .st{color:var(--gold)}
.tn-lbpanel{margin-top:6px;width:min(220px,46vw);background:var(--glass);border:1px solid var(--line);border-radius:6px;padding:10px 10px 8px;backdrop-filter:blur(6px);font-size:12px}
.tn-lbpanel h4{margin:0 0 6px;font:600 10.5px system-ui;letter-spacing:.24em;color:#cfcfcf;display:flex;justify-content:space-between;align-items:center}
.tn-lbpanel h4 span{font-weight:400;letter-spacing:.06em;color:#888;font-size:10px}
.tn-lbrow{display:flex;gap:6px;padding:2px 3px;border-radius:3px;line-height:1.5}
.tn-lbrow .r{width:18px;color:#888;text-align:right;flex:0 0 auto;font-variant-numeric:tabular-nums}
.tn-lbrow .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tn-lbrow .v{color:var(--gold);font-variant-numeric:tabular-nums;flex:0 0 auto}
.tn-lbrow.me{background:rgba(232,198,106,.16);color:#fff}
.tn-lbrow.gap{justify-content:center;color:#666;line-height:1}
.tn-lbmine{margin-top:6px;padding-top:6px;border-top:1px solid var(--line);color:#cfcfcf;display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap}
.tn-lbmsg{color:#888;padding:4px 2px}

/* ---------- panels: dialogue, menus, confirm ---------- */
.tn-dlg{position:absolute;left:50%;bottom:calc(14px + var(--safeB));transform:translateX(-50%);width:min(720px,calc(100vw - 24px));z-index:30;pointer-events:auto;
  display:flex;gap:12px;padding:14px 16px 12px;background:linear-gradient(180deg,rgba(18,16,14,.9),rgba(10,9,8,.94));border:1px solid rgba(232,198,106,.35);border-radius:6px;
  box-shadow:0 10px 30px rgba(0,0,0,.5);transition:opacity .25s,transform .25s;cursor:pointer;touch-action:manipulation}
.tn-dlg.off{opacity:0;transform:translateX(-50%) translateY(12px);pointer-events:none}
.tn-portrait{width:72px;height:72px;flex:0 0 auto;border-radius:5px;border:1px solid rgba(255,255,255,.25);background:#222;display:block}
.tn-dlgbody{flex:1;min-width:0}
.tn-speaker{font:600 13px var(--serif);letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:4px;font-size:14px}
.tn-dlgtext{font-size:clamp(14px,3.9vw,16px);line-height:1.45;color:#f4efe6;min-height:2.9em;overflow-wrap:break-word}
.tn-dlgnext{text-align:right;font-size:11px;color:#9b8f74;letter-spacing:.14em;height:14px;margin-top:2px}
.tn-dlgnext.blink{animation:tnBlink 1.1s infinite}
@keyframes tnBlink{50%{opacity:.25}}
.tn-choices{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.tn-choices button{min-height:40px;padding:6px 14px;background:rgba(255,255,255,.06);border:1px solid rgba(232,198,106,.5);border-radius:3px;color:#fff;font-size:14px;flex:1 1 auto;min-width:96px}
.tn-choices button:hover,.tn-choices button:focus-visible,.tn-choices button.sel{background:rgba(232,198,106,.85);color:#111;outline:none}
@media (max-width:520px){.tn-portrait{width:52px;height:52px}.tn-dlg{gap:10px;padding:12px}}

.tn-scrim{position:absolute;inset:0;background:rgba(0,0,0,.55);pointer-events:auto;z-index:40;display:flex;align-items:center;justify-content:center;padding:16px;
  opacity:0;transition:opacity .25s;backdrop-filter:blur(3px)}
.tn-scrim.on{opacity:1}
.tn-panel{width:min(640px,100%);max-height:calc(100% - 8px);display:flex;flex-direction:column;background:var(--glass2);border:1px solid var(--line);border-radius:8px;
  box-shadow:0 20px 50px rgba(0,0,0,.55);overflow:hidden}
.tn-phead{display:flex;align-items:center;gap:8px;padding:10px 10px 0 14px}
.tn-phead h3{margin:0;flex:1;font:300 clamp(18px,5vw,24px) var(--serif);letter-spacing:.16em;text-transform:uppercase;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tn-x{width:40px;height:40px;border:1px solid var(--line)!important;background:transparent;border-radius:50%;font-size:18px!important}
.tn-tabs{display:flex;gap:2px;padding:8px 10px 0;overflow-x:auto;scrollbar-width:none;flex:0 0 auto}
.tn-tabs::-webkit-scrollbar{display:none}
.tn-tabs button{flex:0 0 auto;min-height:36px;padding:0 12px;background:transparent;border:0;border-bottom:2px solid transparent;color:#aaa;font-size:12.5px;letter-spacing:.12em;text-transform:uppercase}
.tn-tabs button.on{color:#fff;border-bottom-color:var(--gold)}
.tn-pbody{padding:12px 14px 14px;overflow-y:auto;-webkit-overflow-scrolling:touch;flex:1;min-height:0;font-size:13.5px;line-height:1.45}
.tn-pbody h5{margin:12px 0 6px;font-size:10.5px;letter-spacing:.24em;color:#9a9a9a;font-weight:600;text-transform:uppercase}
.tn-pbody h5:first-child{margin-top:0}
.tn-col{display:flex;flex-direction:column;gap:10px;align-items:center;padding:6px 0}
.tn-statgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.tn-stat{background:rgba(255,255,255,.05);border:1px solid var(--line);border-radius:5px;padding:6px 8px;min-width:0}
.tn-stat span{display:block;font-size:10px;letter-spacing:.16em;color:#999}
.tn-stat b{display:block;font-size:15px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:420px){.tn-statgrid{grid-template-columns:repeat(2,minmax(0,1fr))}.tn-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));padding:6px 6px 0;overflow:hidden}.tn-tabs button{padding:0 2px;font-size:10px;letter-spacing:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
.tn-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:6px}
.tn-item{position:relative;aspect-ratio:1;min-height:56px;background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:6px;display:flex;align-items:center;justify-content:center;padding:0}
.tn-item img{width:70%;height:70%}
.tn-item.eq{border-color:var(--gold);box-shadow:inset 0 0 0 1px var(--gold)}
.tn-item.eq::after{content:"E";position:absolute;right:3px;top:2px;font-size:9px;font-weight:800;color:var(--gold)}
.tn-item.sel{background:rgba(232,198,106,.18)}
.tn-item.bad{background:rgba(110,140,60,.08)}
.tn-detail{margin-top:10px;padding:10px;border:1px solid var(--line);border-radius:6px;display:flex;gap:10px;align-items:flex-start;min-height:84px}
.tn-detail img{width:52px;height:52px;flex:0 0 auto}
.tn-detail .t{flex:1;min-width:0}
.tn-detail .t b{display:block;font-size:15px}
.tn-detail .t i{display:block;font-style:normal;font-size:11px;color:#aaa;letter-spacing:.1em;text-transform:uppercase;margin:2px 0 4px}
.tn-detail .t p{margin:0 0 4px;color:#d2d2d2;font-size:12.5px}
.tn-detail .t .kv{font-size:12px;color:var(--gold)}
.tn-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)}
.tn-row:last-child{border-bottom:0}
.tn-row img{width:40px;height:40px;flex:0 0 auto}
.tn-row .t{flex:1;min-width:0}
.tn-row .t b{display:block;font-size:14px;overflow-wrap:break-word}
.tn-row .t span{display:block;font-size:12px;color:#aaa}
.tn-row .tn-btn.sm{flex:0 0 auto}
.tn-row .claimed{color:var(--good);font-size:12px;letter-spacing:.12em;flex:0 0 auto}
.tn-row .need{color:#999;font-size:12px;flex:0 0 auto;text-align:right;max-width:40%}
.tn-prog{height:4px;background:rgba(255,255,255,.1);border-radius:2px;margin-top:4px;overflow:hidden}
.tn-prog i{display:block;height:100%;background:var(--gold)}
.tn-set{display:flex;align-items:center;gap:10px;min-height:44px;border-bottom:1px solid rgba(255,255,255,.07);flex-wrap:wrap}
.tn-set label{flex:1;min-width:120px;font-size:13.5px}
.tn-set label small{display:block;color:#8d8d8d;font-size:11px}
.tn-set input[type=range]{width:min(170px,44vw);accent-color:#e8c66a;pointer-events:auto}
.tn-set .val{width:38px;text-align:right;font-size:12px;color:#bbb;font-variant-numeric:tabular-nums}
.tn-tog{min-width:64px;height:32px;border-radius:16px;border:1px solid var(--line2)!important;background:rgba(255,255,255,.06)!important;font-size:12px!important;letter-spacing:.1em}
.tn-tog.on{background:var(--gold)!important;color:#111!important;border-color:var(--gold)!important}
.tn-seg{display:flex;border:1px solid var(--line2);border-radius:16px;overflow:hidden}
.tn-seg button{height:32px;padding:0 9px;background:transparent;border:0;font-size:11.5px;color:#ccc}
.tn-seg button.on{background:var(--gold);color:#111}
.tn-sec{display:flex;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.07);align-items:flex-start}
.tn-sec .ic{width:18px;flex:0 0 auto;text-align:center;color:#555}
.tn-sec.f .ic{color:var(--gold)}
.tn-sec .t{flex:1;min-width:0}
.tn-sec .t b{display:block;font-size:13px;font-weight:600}
.tn-sec .t span{display:block;font-size:11.5px;color:#8f8f8f}
.tn-sec:not(.f) .t b{color:#777}
.tn-muted{color:#999;font-size:12.5px}
.tn-confirm{position:absolute;inset:0;z-index:75;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px;pointer-events:auto;opacity:0;transition:opacity .3s}
.tn-confirm.on{opacity:1}
.tn-confirm .box{width:min(380px,100%);padding:22px 18px 16px;background:rgba(12,12,14,.95);border:1px solid var(--line2);border-radius:6px;text-align:center}
.tn-confirm p{margin:0 0 18px;font:300 clamp(17px,4.8vw,21px)/1.4 var(--serif);letter-spacing:.04em;color:#f0f0f0;overflow-wrap:break-word}
.tn-confirm .bs{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.tn-confirm .bs .tn-btn{width:auto;min-width:120px;flex:1 1 120px;max-width:170px;letter-spacing:.16em}

/* ---------- full screens ---------- */
.tn-fade{position:absolute;inset:0;z-index:65;opacity:0;pointer-events:none;background:#000}
.tn-fade.block{pointer-events:auto}
.tn-death{position:absolute;inset:0;z-index:66;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;text-align:center;opacity:0;transition:opacity 1s;
  background:radial-gradient(ellipse at center,rgba(20,0,0,.35),rgba(0,0,0,.85));-webkit-backdrop-filter:grayscale(1);backdrop-filter:grayscale(1)}
.tn-death.on{opacity:1}
.tn-death h1{margin:0;font:300 clamp(32px,10vw,68px) var(--serif);letter-spacing:.3em;padding-left:.3em;color:#d9c9c9}
.tn-death p{margin:14px 0 0;font-size:13px;color:#a8a0a0;max-width:340px;line-height:1.45}
.tn-ending{position:absolute;inset:0;z-index:68;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;text-align:center;pointer-events:auto;
  opacity:0;transition:opacity 1.4s;overflow:hidden;background:#000}
.tn-ending.on{opacity:1}
.tn-ending canvas{position:absolute;inset:0;width:100%;height:100%}
.tn-ending .in{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;max-width:min(520px,100%)}
.tn-ending .k{font-size:10.5px;letter-spacing:.4em;color:rgba(255,255,255,.5);margin-bottom:12px;padding-left:.4em}
.tn-ending h1{margin:0;font:300 clamp(26px,8vw,52px)/1.15 var(--serif);letter-spacing:.24em;padding-left:.24em;color:#f4f4f4;overflow-wrap:break-word;max-width:100%}
.tn-ending .tx{margin:18px 0 0;font:300 clamp(16px,4.4vw,20px)/1.55 var(--serif);color:#d8d8d8;max-width:420px;opacity:0;transition:opacity 2s ease 1.2s}
.tn-ending.on .tx{opacity:1}
.tn-ending .stats{margin-top:16px;font-size:11.5px;color:rgba(255,255,255,.55);letter-spacing:.1em;opacity:0;transition:opacity 1.5s ease 2.4s}
.tn-ending.on .stats{opacity:1}
.tn-ending .bs{display:flex;flex-direction:column;gap:10px;align-items:center;margin-top:26px;opacity:0;transition:opacity 1.2s ease 3s}
.tn-ending.on .bs{opacity:1}
#ui .tn-ending .tn-btn.win{min-height:58px;font-size:18px;letter-spacing:.4em;border-width:2px;border-color:var(--gold);color:var(--gold);box-shadow:0 0 22px rgba(232,198,106,.35)}
#ui .tn-ending .tn-btn.win:hover{background:var(--gold);color:#111}
.tn-ending.th-world{background:#f4f3ef}
.tn-ending.th-world h1,.tn-ending.th-world .tx{color:#2a2a2a}.tn-ending.th-world .k,.tn-ending.th-world .stats{color:rgba(0,0,0,.45)}
#ui .tn-ending.th-world .tn-btn{border-color:rgba(0,0,0,.6);color:#222}#ui .tn-ending.th-world .tn-btn:hover{background:#222;color:#fff}
.tn-ending.th-monster{background:radial-gradient(ellipse at 50% 60%,#1a0405,#000 70%)}
.tn-ending.th-monster h1{color:#e9d6d6;text-shadow:0 0 24px rgba(192,20,28,.55)}
.tn-ending.th-warrior{background:linear-gradient(180deg,#1b2238 0%,#6b4a5a 55%,#e3a46a 100%)}
.tn-ending.th-idiot{background:#2a2a2c}
.tn-ending.th-idiot h1{color:#cfcfcf}
.tn-ending.th-winners{background:radial-gradient(ellipse at 50% 40%,#3a2e10,#0b0904 75%)}
.tn-ending.th-winners h1{color:#f6dc8c;text-shadow:0 0 28px rgba(232,198,106,.5)}
.tn-ending.th-sigma{background:radial-gradient(ellipse at 50% 40%,#2a1240,#050208 75%)}
.tn-ending.th-sigma h1{color:#efe2ff;text-shadow:0 0 30px rgba(170,110,255,.55)}
.tn-jump{position:absolute;inset:0;z-index:80;pointer-events:none;display:none}
.tn-jump canvas{position:absolute;inset:0;width:100%;height:100%}
.tn-glitch{position:absolute;inset:0;z-index:85;pointer-events:none;display:none;width:100%;height:100%;mix-blend-mode:screen}
.tn-fake{position:absolute;inset:0;z-index:78;display:none;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:16px;pointer-events:auto}
.tn-fake.win{background:radial-gradient(ellipse at 50% 40%,#3a2e10,#0b0904 75%)}
.tn-fake.win .half{position:absolute;left:0;right:0;display:flex;align-items:center;justify-content:center;flex-direction:column;overflow:hidden;transition:transform 1s cubic-bezier(.6,0,.9,.4),opacity 1s}
.tn-fake.win .half.top{top:0;height:50%;justify-content:flex-end;clip-path:polygon(0 0,100% 0,100% 92%,70% 100%,52% 88%,30% 100%,0 94%)}
.tn-fake.win .half.bot{bottom:0;height:50%;justify-content:flex-start}
.tn-fake.win .half h1{margin:0;font:300 clamp(34px,11vw,80px) var(--serif);letter-spacing:.3em;padding-left:.3em;color:#f6dc8c}
.tn-fake.win .half.top h1{transform:translateY(50%)} .tn-fake.win .half.bot h1{transform:translateY(-50%)}
.tn-fake.win.torn .top{transform:translateY(-40%) rotate(-4deg);opacity:0}
.tn-fake.win.torn .bot{transform:translateY(40%) rotate(3deg);opacity:0}
.tn-fake.lost{background:#1b1d22;color:#cfd3da;font-size:15px}
.tn-fake.lost .sp{width:34px;height:34px;border:3px solid rgba(255,255,255,.2);border-top-color:#cfd3da;border-radius:50%;animation:tnSpin .9s linear infinite;margin-bottom:16px}
.tn-fake.lost small{display:block;margin-top:6px;color:#80858f;font-size:12px}
@keyframes tnSpin{to{transform:rotate(360deg)}}
`;
