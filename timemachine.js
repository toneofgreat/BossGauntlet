/* platyfy TIME MACHINE
 *
 * A little clock button in the corner of platyfy. Click it, pick a year, a month and a day,
 * and you are sent to platyfy exactly as it was at the end of that day (or right after any
 * single update). Snapshots live at /tt/<commit-sha>/... and are served by /tt-sw.js; this
 * file is only the GUI and is always the PRESENT-day version (snapshots load it from the root).
 *
 *  - Self-contained, no dependencies. All UI lives in a closed-off shadow DOM so no page's CSS
 *    (old or new) can touch it, and it never touches theirs.
 *  - History comes from /timetravel/history.json (built from git) plus any newer commits from
 *    the GitHub API (unauthenticated, cached in sessionStorage, failure tolerated).
 *  - Days are grouped in the owner's time zone, America/New_York.
 *  - The service worker is only registered when someone actually opens the time machine.
 *
 * Inside a snapshot the SW injects  window.__TT__ = { sha, date, msg, t }  and loads this
 * script with data-tt-sha; we also recognise /tt/<sha>/ in the URL.
 */
(function () {
  'use strict';
  if (window.__platyfyTimeMachine) return;
  window.__platyfyTimeMachine = true;

  var REPO = 'toneofgreat/BossGauntlet';
  var TZ = 'America/New_York';
  var BORN_DEFAULT = '2026-03-10';
  var HUB_SINCE = '2026-03-29'; // before this, index.html was the Boss Gauntlet game itself
  var SW_URL = '/tt-sw.js';
  var RAW_HISTORY = 'https://raw.githubusercontent.com/' + REPO + '/main/timetravel/history.json';
  var SHA_RE = /^\/tt\/([0-9a-f]{40})(?:\/|$)/;

  var script = document.currentScript;
  var TT = window.__TT__ || null;
  var pathMatch = location.pathname.match(SHA_RE);
  // Only a page tt-sw.js actually served (it sets __TT__ and data-tt-sha) is a snapshot. A /tt/ URL
  // alone is not: 404.html shows its "warming up" bootstrap screen at that URL before anything loads.
  var attrSha = script && script.getAttribute('data-tt-sha');
  var snapSha = (TT && TT.sha) || attrSha || null;
  if (snapSha && pathMatch && pathMatch[1] !== snapSha) snapSha = null;
  if (snapSha && !/^[0-9a-f]{40}$/.test(snapSha)) snapSha = null;
  var inSnap = !!snapSha;
  var reduced = false;
  try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  /* ---------------------------------------------------------------- storage (never throws) */
  function sGet(store, k) { try { return window[store].getItem(k); } catch (e) { return null; } }
  function sSet(store, k, v) { try { window[store].setItem(k, v); } catch (e) {} }
  // Inside a snapshot the SW shim sandboxes window.sessionStorage per commit; hand-offs between
  // pages (which day was asked for, "just arrived") must use the REAL one it exposes.
  function realSS() {
    try { return (TT && TT.realStorage && TT.realStorage.session) || window.sessionStorage; } catch (e) { return null; }
  }
  function rGet(k) { try { var s = realSS(); return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function rSet(k, v) { try { var s = realSS(); if (s) { if (v == null) s.removeItem(k); else s.setItem(k, v); } } catch (e) {} }

  /* ---------------------------------------------------------------- dates (New York) */
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var nyFmt = null;
  try {
    nyFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  } catch (e) {}
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ny(date) {
    var o = {};
    if (nyFmt && nyFmt.formatToParts) {
      nyFmt.formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
      var h = +o.hour; if (h === 24) h = 0;
      return { y: +o.year, m: +o.month, d: +o.day, h: h, mi: +o.minute, day: o.year + '-' + o.month + '-' + o.day };
    }
    var u = new Date(date.getTime() - 5 * 3600e3); // crude fallback: EST
    return { y: u.getUTCFullYear(), m: u.getUTCMonth() + 1, d: u.getUTCDate(), h: u.getUTCHours(), mi: u.getUTCMinutes(),
      day: u.getUTCFullYear() + '-' + pad(u.getUTCMonth() + 1) + '-' + pad(u.getUTCDate()) };
  }
  function dayOf(iso) { return ny(new Date(iso)).day; }
  function P(day) { var a = day.split('-'); return { y: +a[0], m: +a[1], d: +a[2] }; }
  function key(y, m, d) { return y + '-' + pad(m) + (d ? '-' + pad(d) : ''); }
  function dow(y, m, d) { return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
  function dim(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function addDays(day, n) { var p = P(day), t = new Date(Date.UTC(p.y, p.m - 1, p.d + n)); return key(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }
  function longDay(day) { var p = P(day); return WEEKDAYS[dow(p.y, p.m, p.d)] + ', ' + MONTHS[p.m - 1] + ' ' + p.d + ', ' + p.y; }
  function midDay(day) { var p = P(day); return MONTHS[p.m - 1] + ' ' + p.d + ', ' + p.y; }
  function shortDay(day) { var p = P(day); return MONTHS[p.m - 1].slice(0, 3) + ' ' + p.d + ', ' + p.y; }
  function stamp(day) { var p = P(day); return MONTHS[p.m - 1].slice(0, 3).toUpperCase() + ' ' + pad(p.d) + ' ' + p.y; }
  function clock(iso) { var t = ny(new Date(iso)), h = t.h % 12 || 12; return h + ':' + pad(t.mi) + (t.h < 12 ? ' AM' : ' PM'); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------------------------------------------------------------- history data */
  var D = null;          // { born, today, commits[], byDay{}, byMonth{}, byYear{}, max }
  var loadP = null;

  function fetchJSON(url, ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl && setTimeout(function () { ctl.abort(); }, ms || 10000);
    return fetch(url, { cache: 'no-cache', signal: ctl ? ctl.signal : undefined, credentials: 'omit' }).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }
  function getHistory() {
    // tt-sw.js never rewrites /timetravel/ into a snapshot, so our own copy works everywhere;
    // the live copy on GitHub is the fallback.
    var urls = ['/timetravel/history.json', RAW_HISTORY];
    var i = 0;
    function next(err) {
      if (i >= urls.length) return Promise.reject(err || new Error('no history'));
      return fetchJSON(urls[i++], 6000).then(function (h) {
        if (!h || !h.commits || !h.commits.length) throw new Error('empty history');
        return h;
      }).catch(next);
    }
    return next();
  }
  function getNewer(sinceIso) {
    var since = new Date(new Date(sinceIso).getTime() + 1000).toISOString().replace(/\.\d+Z$/, 'Z');
    var k = 'tt-api:' + since, cached = sGet('sessionStorage', k);
    if (cached) {
      try { var c = JSON.parse(cached); if (Date.now() - c.at < 5 * 60e3) return Promise.resolve(c.list); } catch (e) {}
    }
    var url = 'https://api.github.com/repos/' + REPO + '/commits?sha=main&per_page=100&since=' + encodeURIComponent(since);
    return fetchJSON(url, 4000).then(function (arr) {
      var list = (Array.isArray(arr) ? arr : []).map(function (x) {
        var t = x.commit && x.commit.author && x.commit.author.date;
        return t && { sha: x.sha, t: t, msg: String(x.commit.message || '').split('\n')[0].trim() };
      }).filter(Boolean);
      sSet('sessionStorage', k, JSON.stringify({ at: Date.now(), list: list }));
      return list;
    }).catch(function () { return []; });
  }
  var onNewer = null; // set by the UI: called after newer commits were merged in
  function load() {
    if (loadP) return loadP;
    if (navigator.onLine === false) { loadOffline = true; return Promise.reject(new Error('offline')); }
    loadOffline = false;
    loadP = getHistory().then(function (h) {
      var commits = h.commits.filter(function (c) { return c && c.sha && c.t; }).map(function (c) {
        return { sha: c.sha, t: c.t, ms: new Date(c.t).getTime(), msg: String(c.msg || '').split('\n')[0].trim(), day: /^\d{4}-\d\d-\d\d$/.test(c.day) ? c.day : dayOf(c.t) };
      });
      commits.sort(function (a, b) { return a.ms - b.ms; });
      var last = commits[commits.length - 1];
      index(commits, h.born);
      // history.json is always one push behind: ask GitHub for anything newer, but never wait for it.
      getNewer(last.t).then(function (extra) {
        var seen = {}, added = 0;
        commits.forEach(function (c) { seen[c.sha] = 1; });
        extra.forEach(function (x) {
          if (seen[x.sha]) return;
          seen[x.sha] = 1; added++;
          commits.push({ sha: x.sha, t: x.t, ms: new Date(x.t).getTime(), msg: x.msg, day: dayOf(x.t) });
        });
        if (!added) return;
        commits.sort(function (a, b) { return a.ms - b.ms; });
        index(commits, h.born);
        if (onNewer) onNewer();
      });
      return D;
    });
    loadP.catch(function () { loadP = null; });
    return loadP;
  }
  var loadOffline = false;
  function index(commits, born) {
    var today = ny(new Date()).day;
    var last = commits[commits.length - 1];
    if (last.day > today) today = last.day; // clock skew guard
    var byDay = {}, byMonth = {}, byYear = {}, max = 0;
    commits.forEach(function (c, i) {
      c.i = i;
      (byDay[c.day] = byDay[c.day] || []).push(c);
      var mk = c.day.slice(0, 7), yk = c.day.slice(0, 4);
      byMonth[mk] = (byMonth[mk] || 0) + 1;
      byYear[yk] = (byYear[yk] || 0) + 1;
    });
    Object.keys(byDay).forEach(function (k) { if (byDay[k].length > max) max = byDay[k].length; });
    born = /^\d{4}-\d\d-\d\d$/.test(born) ? born : commits[0].day;
    if (commits[0].day < born) born = commits[0].day;
    D = { born: born, today: today, commits: commits, byDay: byDay, byMonth: byMonth, byYear: byYear, max: max, head: last };
  }
  // The snapshot that represents the END of a day: the last commit made at or before it.
  function snapFor(day) {
    var c = D.commits, r = null;
    for (var i = 0; i < c.length; i++) { if (c[i].day <= day) r = c[i]; else break; }
    return r;
  }
  function bySha(sha) {
    if (!D || !sha) return null;
    for (var i = 0; i < D.commits.length; i++) if (D.commits[i].sha === sha) return D.commits[i];
    return null;
  }
  function heat(n) { return n <= 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : n <= 10 ? 4 : 5; }
  function isSelectable(day) { return D && day >= D.born && day <= D.today; }

  /* ---------------------------------------------------------------- where are we? */
  // Hand-off from the page that sent us here (real sessionStorage, set just before navigating).
  var arriveFlag = rGet('tt:arrive');
  var arriving = inSnap && arriveFlag === snapSha && isTopDoc();
  var returning = !inSnap && arriveFlag === 'present';
  if (arriving || returning) rSet('tt:arrive', null);
  // The day being viewed. Traveling to an empty day lands on an older commit, so the day asked
  // for is remembered under tt:day:<sha> (the SW shim reads the same key into __TT__.day).
  var DAY_RE = /^\d{4}-\d\d-\d\d$/;
  var snapDay = null;
  if (inSnap) {
    snapDay = [TT && TT.day, rGet('tt:day:' + snapSha), TT && TT.date].filter(function (d) { return d && DAY_RE.test(d); })[0] ||
      (TT && TT.t ? dayOf(TT.t) : null);
  }
  function isTopDoc() { try { return window.top === window; } catch (e) { return false; } }
  var snapMsg = (TT && TT.msg) || '';
  var isHub = /^\/(?:tt\/[0-9a-f]{40}\/)?(?:index\.html)?$/.test(location.pathname);
  var coarse = false;
  try { coarse = matchMedia('(pointer: coarse)').matches; } catch (e) {}
  // On touch game pages (inside snapshots) a corner button sits right on top of on-screen joysticks,
  // so it becomes a slim tab on the left edge, half way down, with no date chip beside it.
  var edge = !isHub && coarse;

  /* ---------------------------------------------------------------- service worker */
  var swP = null;
  var LAST_KEY = 'platyfy-tm-last', STALE_MS = 3 * 864e5;
  function realLS() { try { return (TT && TT.realStorage && TT.realStorage.local) || window.localStorage; } catch (e) { return null; } }
  function noteTrip() { try { var l = realLS(); if (l) l.setItem(LAST_KEY, String(Date.now())); } catch (e) {} }
  // A visitor who opened the time machine once would otherwise have every later platyfy visit
  // dispatched through tt-sw.js. If they haven't travelled for a few days, drop the worker
  // (open() re-registers it and 404.html handles cold /tt/ links, so nothing breaks).
  function dropStaleSW() {
    if (inSnap || !('serviceWorker' in navigator) || !navigator.serviceWorker.getRegistration) return;
    var last = 0; try { var l = realLS(); last = +(l && l.getItem(LAST_KEY)) || 0; } catch (e) {}
    if (Date.now() - last < STALE_MS) return;
    navigator.serviceWorker.getRegistration('/').then(function (r) {
      var w = r && (r.active || r.waiting || r.installing);
      if (!w || !/\/tt-sw\.js$/.test(w.scriptURL) || swP) return;
      return r.unregister().then(function () {
        if (!window.caches) return;
        return caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('tt-') === 0; }).map(function (k) { return caches.delete(k); })); });
      });
    }).catch(function () {});
  }
  function warmSW() {
    if (inSnap) noteTrip();
    if (inSnap || swP) return swP;
    noteTrip();
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return (swP = Promise.resolve(false));
    swP = navigator.serviceWorker.register(SW_URL, { scope: '/' }).then(function () {
      return Promise.race([navigator.serviceWorker.ready.then(function () { return true; }), wait(5000).then(function () { return false; })]);
    }).catch(function () { return false; });
    return swP;
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------------------------------------------------------------- styles */
  var CSS = [
    ':host{all:initial}',
    '*,*::before,*::after{box-sizing:border-box}',
    '.root{position:fixed;inset:0;pointer-events:none;font-family:"Courier New",Courier,ui-monospace,monospace;color:#fff;-webkit-font-smoothing:antialiased;line-height:1.3;font-size:14px;-webkit-tap-highlight-color:transparent}',
    'button{font-family:inherit;color:inherit;touch-action:manipulation}',
    'button:focus{outline:none}',
    'button:focus-visible{outline:3px solid #ffcc22;outline-offset:2px}',
    '.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    '.grad{background:linear-gradient(90deg,#ff6644,#ffcc22,#44ccff,#aa66ff);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}',

    /* dock + button */
    '.dock{position:absolute;display:flex;align-items:center;gap:10px;pointer-events:none;transition:opacity .2s}',
    '.dock>*{pointer-events:auto}',
    '.dock.bl{left:calc(16px + env(safe-area-inset-left));bottom:calc(16px + env(safe-area-inset-bottom))}',
    '.dock.br{right:calc(16px + env(safe-area-inset-right));bottom:calc(16px + env(safe-area-inset-bottom));flex-direction:row-reverse}',
    '.dock.tl{left:calc(16px + env(safe-area-inset-left));top:calc(16px + env(safe-area-inset-top))}',
    '.dock.tr{right:calc(16px + env(safe-area-inset-right));top:calc(16px + env(safe-area-inset-top));flex-direction:row-reverse}',
    '.dock.drag{transition:none}',
    '.dock.edge{left:0;top:50%;bottom:auto;right:auto;transform:translateY(-50%);flex-direction:column}',
    '.dock.edge .tm{width:30px;height:56px;border-radius:0 16px 16px 0;opacity:.78}',
    '.dock.edge .tm::before{border-radius:0 16px 16px 0;animation:none;background:linear-gradient(180deg,#ff6644,#ffcc22,#44ccff,#aa66ff)}',
    '.dock.edge .tm::after{inset:2px 2px 2px 0;border-radius:0 14px 14px 0}',
    '.dock.edge .tm .face{font-size:16px}',
    '.dock.edge .tm .pulse{display:none}',
    '.dock.edge .chip,.dock.edge .tip{display:none}',
    '.panel:focus{outline:none}',
    '.tm{position:relative;width:58px;height:58px;border-radius:50%;border:0;padding:0;background:none;cursor:pointer;isolation:isolate;transition:transform .2s cubic-bezier(.3,1.6,.5,1);touch-action:none;user-select:none;-webkit-user-select:none}',
    '.tm::before{content:"";position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,#ff6644,#ffcc22,#44ccff,#aa66ff,#ff6644);animation:spin 7s linear infinite;z-index:-2;box-shadow:0 8px 26px rgba(0,0,0,.6)}',
    '.tm::after{content:"";position:absolute;inset:3px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#2a2a48,#0c0c16 70%);z-index:-1}',
    '.tm .face{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:27px;line-height:1;transition:transform .3s}',
    '.tm:hover{transform:scale(1.07)}',
    '.tm:hover .face{animation:tick .6s ease-in-out}',
    '.tm.on .face{transform:rotate(-25deg) scale(1.05)}',
    '.tm .pulse{position:absolute;inset:-6px;border-radius:50%;border:2px solid #ffcc22;opacity:0;pointer-events:none}',
    '.tm.snap .pulse{animation:pulse 2.4s ease-out infinite}',
    '.compact .tm{width:44px;height:44px}',
    '.compact .tm .face{font-size:20px}',
    '.compact .tm:not(:hover):not(.on){opacity:.82}',
    '.tip{font-size:11px;letter-spacing:3px;font-weight:bold;background:rgba(10,10,18,.92);border:1px solid #2c2c44;border-radius:999px;padding:7px 12px;white-space:nowrap;opacity:0;transform:translateX(-6px);transition:all .2s;pointer-events:none;box-shadow:0 6px 20px rgba(0,0,0,.4)}',
    '.dock.br .tip,.dock.tr .tip{transform:translateX(6px)}',
    '.dock:not(.snap) .tm:hover+.tip{opacity:1;transform:none}',
    '.chip{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:bold;letter-spacing:1.5px;color:#ffcc22;background:rgba(10,10,18,.94);border:1px solid #3a3420;border-radius:999px;padding:8px 13px 8px 11px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.45);white-space:nowrap}',
    '.chip:hover{border-color:#ffcc22}',
    '.chip .dot{width:8px;height:8px;border-radius:50%;background:#ffcc22;box-shadow:0 0 0 0 rgba(255,204,34,.6);animation:blink 1.6s infinite}',
    '.compact .chip{padding:6px 10px;font-size:11px}',
    '@media (hover:none){.tip{display:none}}',

    /* panel */
    '.panel{position:absolute;pointer-events:auto;width:min(424px,calc(100vw - 32px));max-height:min(680px,calc(100vh - 112px));display:flex;flex-direction:column;background:linear-gradient(165deg,#161628 0%,#0e0e19 55%,#0b0b14 100%);border:1px solid #2a2a42;border-radius:20px;box-shadow:0 30px 90px rgba(0,0,0,.75),0 0 0 1px rgba(255,255,255,.03) inset;overflow:hidden;opacity:0;transform:translateY(12px) scale(.94);transition:opacity .22s ease,transform .28s cubic-bezier(.2,1.3,.4,1);visibility:hidden}',
    '.panel.open{opacity:1;transform:none;visibility:visible}',
    '.panel::before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:linear-gradient(90deg,#ff6644,#ffcc22,#44ccff,#aa66ff)}',
    '.panel.bl{left:calc(16px + env(safe-area-inset-left));bottom:calc(90px + env(safe-area-inset-bottom));transform-origin:0 100%}',
    '.panel.br{right:calc(16px + env(safe-area-inset-right));bottom:calc(90px + env(safe-area-inset-bottom));transform-origin:100% 100%}',
    '.panel.tl{left:calc(16px + env(safe-area-inset-left));top:calc(90px + env(safe-area-inset-top));transform-origin:0 0}',
    '.panel.tr{right:calc(16px + env(safe-area-inset-right));top:calc(90px + env(safe-area-inset-top));transform-origin:100% 0}',
    '.compact~.panel.bl,.compact~.panel.br{bottom:calc(74px + env(safe-area-inset-bottom))}',
    '.compact~.panel.tl,.compact~.panel.tr{top:calc(74px + env(safe-area-inset-top))}',
    '.grab{display:none}',
    '.hd{display:flex;align-items:center;gap:10px;padding:16px 14px 12px}',
    '.ttl{flex:1;min-width:0}',
    '.brand{font-weight:bold;letter-spacing:5px;font-size:15px}',
    '.crumbs{display:flex;align-items:center;gap:2px;margin-top:4px;font-size:11px;letter-spacing:1px;color:#6b6b88;white-space:nowrap;overflow:hidden}',
    '.crumbs button{background:none;border:0;padding:2px 3px;font-size:11px;letter-spacing:1px;color:#8d8dae;cursor:pointer;border-radius:4px}',
    '.crumbs button:hover{color:#fff}',
    '.crumbs .at{color:#ffcc22;padding:2px 3px;overflow:hidden;text-overflow:ellipsis}',
    '.ic{flex:none;width:36px;height:36px;border-radius:11px;border:1px solid #2a2a42;background:#15152a;color:#c8c8e0;font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s,border-color .15s}',
    '.ic:hover{background:#1f1f3a;border-color:#45457a;color:#fff}',
    '.ic[hidden]{display:none}',
    '.view{flex:1;overflow:auto;padding:4px 16px 18px;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#33335a transparent}',
    '.view::-webkit-scrollbar{width:8px}.view::-webkit-scrollbar-thumb{background:#2c2c4c;border-radius:8px}',
    '.step{animation:stepIn .32s cubic-bezier(.2,1,.4,1)}',
    '.step.backward{animation-name:stepBack}',
    '.lead{font-size:12px;color:#8a8aa8;letter-spacing:1px;margin:2px 2px 14px}',
    '.ft{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 14px;border-top:1px solid #20203a;background:linear-gradient(90deg,rgba(255,204,34,.07),rgba(68,204,255,.05))}',
    '.ft[hidden]{display:none}',
    '.where{font-size:11px;color:#a0a0bc;letter-spacing:.5px;min-width:0}',
    '.where b{display:block;color:#ffcc22;font-size:12px;letter-spacing:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.pres{flex:none;border:0;border-radius:11px;padding:10px 13px;font-weight:bold;font-size:12px;letter-spacing:1px;color:#06101a;background:linear-gradient(90deg,#44ccff,#aa66ff);cursor:pointer;box-shadow:0 6px 18px rgba(68,140,255,.3);transition:transform .15s,filter .15s}',
    '.pres:hover{transform:translateY(-1px);filter:brightness(1.1)}',

    /* loading / error */
    '.wait{display:flex;flex-direction:column;align-items:center;gap:14px;padding:46px 10px 40px;color:#8a8aa8;font-size:12px;letter-spacing:2px;text-align:center}',
    '.spin{width:46px;height:46px;border-radius:50%;background:conic-gradient(#ff6644,#ffcc22,#44ccff,#aa66ff,#ff6644);-webkit-mask:radial-gradient(circle,transparent 55%,#000 57%);mask:radial-gradient(circle,transparent 55%,#000 57%);animation:spin 1s linear infinite}',
    '.err{padding:30px 6px;text-align:center;color:#c8c8e0;font-size:13px;line-height:1.6}',

    /* year step */
    '.years{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '.yr{position:relative;overflow:hidden;height:168px;border-radius:16px;border:1px solid #2a2a44;padding:14px;text-align:left;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;transition:transform .2s cubic-bezier(.3,1.5,.5,1),border-color .2s,box-shadow .2s}',
    '.yr:hover{transform:translateY(-3px);box-shadow:0 12px 30px rgba(0,0,0,.45)}',
    '.yr .yn{font-size:36px;font-weight:bold;letter-spacing:2px;position:relative}',
    '.yr .ys{font-size:12px;color:#c9c9e4;letter-spacing:.5px;position:relative;line-height:1.45}',
    '.yr .ys b{font-size:17px;color:#fff}',
    '.yr .art{position:absolute;right:-6px;top:-10px;font-size:70px;opacity:.16;transform:rotate(12deg);pointer-events:none}',
    '.y-old{background:radial-gradient(circle at 85% 15%,#2d2b3e,#14141f 70%)}',
    '.y-old:hover{border-color:#6b6b88}',
    '.y-old .yn{color:#b9b9cc}',
    '.y-live{background:radial-gradient(circle at 90% 0%,rgba(255,102,68,.35),transparent 55%),radial-gradient(circle at 0% 100%,rgba(68,204,255,.28),transparent 55%),linear-gradient(140deg,#2a1240,#141a3a)}',
    '.y-live:hover{border-color:#aa66ff}',
    '.y-live .art{opacity:.22}',
    '.yr.cur{border-color:#ffcc22;box-shadow:0 0 0 1px #ffcc22 inset}',
    '.pill{display:inline-block;font-size:9px;font-weight:bold;letter-spacing:1.5px;padding:3px 6px;border-radius:5px;background:#ffcc22;color:#1a1200;vertical-align:middle}',
    '.pill.c{background:#44ccff;color:#001722}',
    '.yr .pill{position:absolute;right:12px;bottom:14px}',
    '.quick{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}',
    '.qc{border:1px solid #2a2a44;background:#14142a;border-radius:999px;padding:8px 12px;font-size:12px;color:#d8d8ee;cursor:pointer;letter-spacing:.5px;transition:all .15s}',
    '.qc:hover{border-color:#44ccff;color:#fff;background:#18213a}',
    '.qlabel{font-size:10px;letter-spacing:3px;color:#5d5d7c;margin:20px 2px 0}',

    /* 2025: not born yet */
    '.born{text-align:center;padding:10px 4px 6px}',
    '.egg{position:relative;width:120px;height:120px;margin:4px auto 8px;display:flex;align-items:center;justify-content:center}',
    '.egg .e{font-size:76px;line-height:1;animation:wobble 2.6s ease-in-out infinite;transform-origin:50% 90%;filter:drop-shadow(0 10px 18px rgba(0,0,0,.5))}',
    '.egg .s{position:absolute;font-size:16px;animation:twinkle 2s ease-in-out infinite}',
    '.egg::before{content:"";position:absolute;inset:8px;border-radius:50%;background:radial-gradient(circle,rgba(255,204,34,.18),transparent 70%)}',
    '.born h3{margin:0 0 8px;font-size:21px;letter-spacing:1px}',
    '.born p{margin:0 auto 10px;max-width:330px;font-size:12.5px;line-height:1.65;color:#b4b4cf}',
    '.born p b{color:#fff}',
    '.born q{display:block;margin:12px auto 16px;max-width:320px;font-size:12px;color:#ffcc22;border:1px dashed #4a4020;border-radius:10px;padding:8px 10px;quotes:none}',
    '.ghost{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;margin:18px 0 4px}',
    '.ghost span{font-size:10px;letter-spacing:1px;color:#3c3c56;border:1px dashed #262640;border-radius:7px;padding:6px 0;text-align:center}',

    /* month step */
    '.months{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}',
    '.mo{position:relative;border:1px solid #24243c;background:#131324;border-radius:13px;padding:10px 10px 9px;text-align:left;cursor:pointer;transition:transform .18s cubic-bezier(.3,1.5,.5,1),border-color .18s,background .18s}',
    '.mo:hover{transform:translateY(-2px);border-color:#44447a;background:#17172c}',
    '.mo .mn{font-size:15px;font-weight:bold;letter-spacing:2px}',
    '.mo .mc{font-size:11px;color:#9a9ab8;margin-top:3px}',
    '.mo .mc b{color:#fff}',
    '.spark{display:flex;align-items:flex-end;gap:1px;height:24px;margin-top:8px}',
    '.spark i{flex:1;min-height:2px;border-radius:1px;background:#262640}',
    '.mo.cur{border-color:#ffcc22;box-shadow:0 0 0 1px #ffcc22 inset}',
    '.mo .pill{position:absolute;right:8px;top:9px}',
    '.ytotal{display:flex;justify-content:space-between;align-items:baseline;margin:2px 2px 12px;font-size:12px;color:#8a8aa8;letter-spacing:1px}',
    '.ytotal b{font-size:22px;color:#fff;letter-spacing:2px}',

    /* calendar */
    '.calhd{display:flex;align-items:center;gap:10px;margin:2px 0 12px}',
    '.calt{flex:1;text-align:center}',
    '.calt .t{font-size:18px;font-weight:bold;letter-spacing:3px}',
    '.calt .s{font-size:11px;color:#8a8aa8;margin-top:3px;letter-spacing:1px}',
    '.ic:disabled{opacity:.25;cursor:default}',
    '.wk{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-bottom:6px}',
    '.wk span{text-align:center;font-size:10px;letter-spacing:1px;color:#5d5d7c}',
    '.cal{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}',
    '.d{position:relative;aspect-ratio:1/1.06;border-radius:10px;border:1px solid rgba(255,255,255,.05);background:var(--bg,#16162a);color:var(--fg,#fff);padding:0;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;transition:transform .15s cubic-bezier(.3,1.6,.5,1),box-shadow .15s}',
    '.d:hover:not(.off){transform:scale(1.1);z-index:2;box-shadow:0 6px 18px rgba(0,0,0,.5)}',
    '.d .dn{font-size:14px;font-weight:bold}',
    '.d .dc{font-size:9.5px;opacity:.8;letter-spacing:.5px}',
    '.d.off{cursor:not-allowed;background:repeating-linear-gradient(135deg,rgba(255,255,255,.025) 0 4px,transparent 4px 8px);color:#3b3b55;border-color:rgba(255,255,255,.03)}',
    '.d.h0{--bg:#141426;--fg:#8a8aa8}',
    '.d.h1{--bg:#2a2152;--fg:#e6dcff}',
    '.d.h2{--bg:#4a2c8c;--fg:#fff}',
    '.d.h3{--bg:#1f6aa8;--fg:#fff}',
    '.d.h4{--bg:#d9a51c;--fg:#1d1300}',
    '.d.h5{--bg:#ff6644;--fg:#1d0600}',
    '.d.today{border:2px solid #44ccff}',
    '.d .tag{position:absolute;top:-7px;left:50%;transform:translateX(-50%);font-size:7.5px;font-weight:bold;letter-spacing:1px;padding:2px 4px;border-radius:4px;background:#44ccff;color:#001722;white-space:nowrap}',
    '.d.cur{box-shadow:0 0 0 2px #0e0e19,0 0 0 4px #ffcc22}',
    '.d .pin{position:absolute;bottom:-5px;right:-4px;font-size:12px}',
    '.d .cake{position:absolute;top:-8px;right:-5px;font-size:13px}',
    '.legend{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:14px;font-size:10px;color:#6b6b88;letter-spacing:1px;flex-wrap:wrap}',
    '.legend .sw{display:inline-flex;gap:3px;vertical-align:middle;margin:0 5px}',
    '.legend .sw i{width:11px;height:11px;border-radius:3px;display:inline-block}',

    /* day */
    '.dayhd{display:flex;align-items:center;gap:14px;margin:2px 0 12px}',
    '.dbig{font-size:50px;font-weight:bold;line-height:1;min-width:58px;text-align:center}',
    '.dmeta{flex:1;min-width:0}',
    '.dw{font-size:11px;letter-spacing:4px;color:#ffcc22;font-weight:bold}',
    '.dm{font-size:16px;margin-top:3px;letter-spacing:1px}',
    '.dsum{font-size:11px;color:#8a8aa8;margin-top:4px;letter-spacing:1px}',
    '.navd{display:flex;gap:6px}',
    '.note{font-size:12px;line-height:1.55;color:#a9dcff;background:rgba(68,204,255,.07);border:1px dashed rgba(68,204,255,.35);border-radius:11px;padding:9px 11px;margin:0 0 12px}',
    '.note.y{color:#ffe08a;background:rgba(255,204,34,.06);border-color:rgba(255,204,34,.35)}',
    '.travel{position:relative;overflow:hidden;width:100%;border:0;border-radius:14px;padding:15px 14px;font-size:14px;font-weight:bold;letter-spacing:2px;color:#170900;background:linear-gradient(90deg,#ff6644,#ffcc22);cursor:pointer;box-shadow:0 8px 24px rgba(255,130,50,.3);transition:transform .15s,filter .15s}',
    '.travel small{display:block;font-size:10.5px;letter-spacing:1px;font-weight:normal;margin-top:4px;opacity:.75}',
    '.travel:hover{transform:translateY(-2px);filter:brightness(1.07)}',
    '.travel::after{content:"";position:absolute;top:0;bottom:0;width:40%;left:-60%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.45),transparent);animation:shine 3.2s ease-in-out infinite}',
    '.travel.cool{background:linear-gradient(90deg,#44ccff,#aa66ff);color:#06101a;box-shadow:0 8px 24px rgba(90,120,255,.3)}',
    '.uphd{display:flex;justify-content:space-between;align-items:baseline;margin:18px 2px 4px;font-size:10px;letter-spacing:3px;color:#5d5d7c}',
    '.ups{list-style:none;margin:0;padding:0;position:relative}',
    '.ups::before{content:"";position:absolute;left:72px;top:14px;bottom:14px;width:2px;background:linear-gradient(#44ccff,#aa66ff);opacity:.25;border-radius:2px}',
    '.up{position:relative;display:grid;grid-template-columns:62px 1fr auto;gap:22px;align-items:start;padding:10px 6px 10px 0;border-radius:12px}',
    '.up::before{content:"";position:absolute;left:67px;top:14px;width:8px;height:8px;border-radius:50%;background:#0e0e19;border:2px solid #44ccff}',
    '.up:hover{background:rgba(255,255,255,.025)}',
    '.ut{font-size:11.5px;color:#44ccff;padding-top:2px;text-align:right;white-space:nowrap}',
    '.um{font-size:12.5px;line-height:1.5;color:#dadaf0;word-break:break-word;min-width:0}',
    '.um .sha{display:block;font-size:10px;color:#56567a;margin-top:2px;letter-spacing:1px}',
    '.go{border:1px solid #33335a;background:#17172e;color:#ffcc22;border-radius:9px;padding:7px 10px;font-size:11px;font-weight:bold;letter-spacing:1px;cursor:pointer;white-space:nowrap;transition:all .15s}',
    '.go:hover{background:#ffcc22;color:#1a1200;border-color:#ffcc22}',
    '.up.here{background:rgba(255,204,34,.07);box-shadow:0 0 0 1px rgba(255,204,34,.35) inset}',
    '.up.here::before{background:#ffcc22;border-color:#ffcc22;box-shadow:0 0 0 4px rgba(255,204,34,.2)}',
    '.up .pill{margin-left:6px}',
    '.empty{font-size:12px;color:#8a8aa8;line-height:1.6;padding:10px 2px}',

    /* toast */
    '.toast{position:absolute;top:calc(12px + env(safe-area-inset-top));left:50%;transform:translate(-50%,0);width:max-content;max-width:min(760px,calc(100vw - 24px));pointer-events:auto;display:flex;align-items:center;gap:12px;padding:10px 10px 10px 14px;border-radius:15px;background:rgba(12,12,22,.95);border:1px solid #34345a;box-shadow:0 14px 40px rgba(0,0,0,.55);transition:opacity .45s ease,transform .55s cubic-bezier(.5,0,.8,.4)}',
    '.toast::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:3px;background:linear-gradient(#ff6644,#ffcc22,#44ccff,#aa66ff)}',
    '.toast.gone{opacity:0;transform:translate(-50%,-140%);pointer-events:none}',
    '.toast .ti{font-size:22px;flex:none}',
    '.toast .tx{font-size:12.5px;line-height:1.45;color:#d8d8ee;min-width:0}',
    '.toast .tx b{color:#ffcc22}',
    '.toast .tx span{display:block;color:#8a8aa8;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:560px}',
    '.toast .tb{flex:none;display:flex;gap:6px}',
    '.toast .tbtn{border:1px solid #3a3a5e;background:#1a1a30;border-radius:9px;padding:7px 10px;font-size:11px;font-weight:bold;letter-spacing:1px;color:#fff;cursor:pointer;white-space:nowrap}',
    '.toast .tbtn:hover{border-color:#ffcc22;color:#ffcc22}',
    '.toast .x{width:30px;padding:7px 0}',

    /* warp */
    '.warp{position:absolute;inset:0;pointer-events:auto;background:#04030a;overflow:hidden;display:flex;align-items:center;justify-content:center;opacity:0;animation:fadeIn .35s ease forwards}',
    '.warp.out{opacity:1;animation:fadeOut .7s ease .25s forwards}',
    '.tunnel{position:absolute;left:50%;top:50%;width:250vmax;height:250vmax;margin:-125vmax 0 0 -125vmax;background:repeating-conic-gradient(from 0deg,transparent 0deg 5deg,rgba(68,204,255,.55) 5deg 5.6deg,transparent 5.6deg 11deg,rgba(170,102,255,.5) 11deg 11.5deg,transparent 11.5deg 17deg,rgba(255,204,34,.45) 17deg 17.4deg);-webkit-mask:radial-gradient(circle,transparent 0 2%,rgba(0,0,0,.25) 6%,#000 30%);mask:radial-gradient(circle,transparent 0 2%,rgba(0,0,0,.25) 6%,#000 30%);animation:spin 3s linear infinite,zoom 1.4s ease-in infinite alternate}',
    '.glow{position:absolute;left:50%;top:50%;width:70vmin;height:70vmin;margin:-35vmin 0 0 -35vmin;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.85),rgba(255,204,34,.35) 18%,rgba(170,102,255,.18) 40%,transparent 70%);animation:breathe 1.1s ease-in-out infinite alternate}',
    '.rings i{position:absolute;left:50%;top:50%;width:60vmax;height:60vmax;margin:-30vmax 0 0 -30vmax;border-radius:50%;border:2px solid #44ccff;opacity:0;animation:ring 1.5s cubic-bezier(.55,0,1,.45) infinite}',
    '.rings i:nth-child(2){animation-delay:.25s;border-color:#aa66ff}.rings i:nth-child(3){animation-delay:.5s;border-color:#ffcc22}.rings i:nth-child(4){animation-delay:.75s;border-color:#ff6644}.rings i:nth-child(5){animation-delay:1s}.rings i:nth-child(6){animation-delay:1.25s;border-color:#aa66ff}',
    '.wtxt{position:relative;text-align:center;padding:0 20px}',
    '.wl{font-size:12px;letter-spacing:7px;color:#cfcfe8;font-weight:bold;text-shadow:0 2px 10px #000}',
    '.wd{font-size:clamp(34px,9vw,68px);font-weight:bold;letter-spacing:4px;margin:10px 0 8px;color:#fff;text-shadow:0 0 30px rgba(255,204,34,.7),0 0 70px rgba(170,102,255,.6),0 3px 0 #000;font-variant-numeric:tabular-nums}',
    '.ws{font-size:12px;color:#b9b9d6;letter-spacing:1px;max-width:520px;margin:0 auto;line-height:1.5;text-shadow:0 2px 8px #000}',
    '.flash{position:absolute;inset:0;background:radial-gradient(circle,#fff 0%,rgba(255,250,235,.95) 30%,rgba(190,160,255,.75) 100%);opacity:0;pointer-events:none}',
    '.warp.boom .flash{animation:flash .45s ease-in forwards}',
    '.warp.out .flash{opacity:.9;animation:fadeOut .5s ease forwards}',

    '@keyframes spin{to{transform:rotate(360deg)}}',
    '@keyframes zoom{from{scale:1}to{scale:1.35}}',
    '@keyframes breathe{from{transform:scale(.85);opacity:.75}to{transform:scale(1.15);opacity:1}}',
    '@keyframes ring{0%{transform:scale(.03);opacity:0}25%{opacity:.9}100%{transform:scale(2.2);opacity:0}}',
    '@keyframes fadeIn{to{opacity:1}}',
    '@keyframes fadeOut{from{opacity:1}to{opacity:0;visibility:hidden}}',
    '@keyframes flash{to{opacity:1}}',
    '@keyframes tick{0%,100%{transform:rotate(0)}25%{transform:rotate(-14deg)}75%{transform:rotate(14deg)}}',
    '@keyframes pulse{0%{transform:scale(.9);opacity:.9}100%{transform:scale(1.35);opacity:0}}',
    '@keyframes blink{0%{box-shadow:0 0 0 0 rgba(255,204,34,.6)}70%{box-shadow:0 0 0 7px rgba(255,204,34,0)}100%{box-shadow:0 0 0 0 rgba(255,204,34,0)}}',
    '@keyframes stepIn{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}',
    '@keyframes stepBack{from{opacity:0;transform:translateX(-18px)}to{opacity:1;transform:none}}',
    '@keyframes wobble{0%,100%{transform:rotate(0)}10%{transform:rotate(-9deg)}20%{transform:rotate(8deg)}30%{transform:rotate(-5deg)}40%{transform:rotate(3deg)}50%{transform:rotate(0)}}',
    '@keyframes twinkle{0%,100%{opacity:.2;transform:scale(.7)}50%{opacity:1;transform:scale(1.1)}}',
    '@keyframes shine{0%,60%{left:-60%}100%{left:130%}}',

    /* phones: the panel becomes a bottom sheet */
    '@media (max-width:540px){',
    '  .panel,.panel.bl,.panel.br,.panel.tl,.panel.tr{left:0;right:0;bottom:0;top:auto;width:100%;max-height:88vh;max-height:88dvh;border-radius:22px 22px 0 0;transform-origin:50% 100%;transform:translateY(40px);border-bottom:0;padding-bottom:env(safe-area-inset-bottom)}',
    '  .compact~.panel.bl,.compact~.panel.br,.compact~.panel.tl,.compact~.panel.tr{bottom:0;top:auto}',
    '  .panel.open{transform:none}',
    '  .grab{display:block;width:44px;height:5px;border-radius:5px;background:#33335a;margin:9px auto -6px}',
    '  .hd{padding-top:12px}',
    '  .view{padding:4px 12px 16px}',
    '  .cal,.wk{gap:4px}',
    '  .d{border-radius:9px}',
    '  .d .dn{font-size:13px}',
    '  .yr{height:150px}',
    '  .yr .yn{font-size:31px}',
    '  .toast{align-items:flex-start;padding:9px 8px 9px 12px;gap:9px}',
    '  .toast .tx span{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
    '  .toast .tb .tbtn:not(.x){display:none}',
    '  .up{grid-template-columns:54px 1fr auto;gap:24px}',
    '  .ups::before{left:65px}.up::before{left:60px}.ut{font-size:11px}',
    '}',
    '@media (max-width:380px){.months{grid-template-columns:repeat(2,1fr)}.dbig{font-size:40px;min-width:46px}}',
    '@media (prefers-reduced-motion:reduce){',
    '  *,*::before,*::after{animation-duration:.001s!important;animation-iteration-count:1!important;transition-duration:.001s!important}',
    '  .tunnel,.rings{display:none}',
    '  .warp{animation:fadeIn .2s forwards!important}',
    '  .warp.out{animation:fadeOut .3s forwards!important}',
    '}'
  ].join('\n');

  /* ---------------------------------------------------------------- DOM */
  var host = document.createElement('platyfy-time-machine');
  host.setAttribute('style', 'all:initial!important;position:fixed!important;inset:0!important;width:auto!important;height:auto!important;' +
    'pointer-events:none!important;z-index:2147483647!important;display:block!important;contain:layout style!important;visibility:visible!important;opacity:1!important;transform:none!important;filter:none!important');
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : null;
  if (!root) return; // ancient browser: no time travel, page untouched

  var corner = sGet('localStorage', 'platyfy-tm-corner');
  if (!/^(bl|br|tl|tr)$/.test(corner || '')) corner = 'bl';

  root.innerHTML =
    '<style>' + CSS + '</style>' +
    '<div class="root">' +
      '<div class="dock ' + (edge ? 'edge' : corner) + (isHub ? '' : ' compact') + (inSnap ? ' snap' : '') + '">' +
        '<button class="tm' + (inSnap ? ' snap' : '') + '" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Open the platyfy time machine">' +
          '<span class="face" aria-hidden="true">🕰️</span><span class="pulse"></span></button>' +
        (inSnap && !edge ? '<button class="chip" type="button" aria-label="Time machine: viewing a past day"><span class="dot"></span><span class="ct"></span></button>'
                : '<span class="tip" aria-hidden="true">TIME MACHINE</span>') +
      '</div>' +
      '<div class="panel ' + corner + '" role="dialog" aria-modal="false" aria-label="Time machine" tabindex="-1">' +
        '<div class="grab"></div>' +
        '<div class="hd">' +
          '<button class="ic back" type="button" data-act="back" aria-label="Back" hidden>←</button>' +
          '<div class="ttl"><div class="brand grad">TIME MACHINE</div><nav class="crumbs" aria-label="Where you are in the time machine"></nav></div>' +
          '<button class="ic" type="button" data-act="close" aria-label="Close time machine">✕</button>' +
        '</div>' +
        '<div class="view"></div>' +
        '<div class="ft" hidden><div class="where"></div><button class="pres" type="button" data-act="present">Return to the present →</button></div>' +
      '</div>' +
      '<div class="live sr" aria-live="polite"></div>' +
    '</div>';

  var $ = function (s) { return root.querySelector(s); };
  var dock = $('.dock'), btn = $('.tm'), chip = $('.chip'), panel = $('.panel'), view = $('.view'), crumbs = $('.crumbs'),
      backBtn = $('.back'), foot = $('.ft'), live = $('.live'), rootEl = $('.root');

  function mount() {
    if (host.isConnected) return;
    (document.body || document.documentElement).appendChild(host);
  }
  mount();
  // Some games rebuild <body>; put ourselves back if we get removed.
  try {
    new MutationObserver(function () { if (!host.isConnected) mount(); })
      .observe(document.documentElement, { childList: true, subtree: false });
    document.addEventListener('DOMContentLoaded', mount);
    setInterval(mount, 3000);
  } catch (e) {}

  // Keep our clicks and keys away from the page (games listen on window/document).
  ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'touchstart', 'touchmove', 'touchend',
    'keydown', 'keyup', 'keypress', 'wheel'].forEach(function (t) {
    host.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: true });
  });

  /* ---------------------------------------------------------------- state + render */
  var S = { open: false, step: 'year', y: 0, m: 0, day: null, dir: 1 };
  var ORDER = { year: 0, born: 1, months: 1, cal: 2, day: 3 };

  function setChip() {
    if (!chip) return;
    var d = snapDay || (TT && TT.date);
    var c = !d && D ? bySha(snapSha) : null;
    if (c) d = c.day;
    root.querySelector('.ct').textContent = d ? stamp(d) : 'THE PAST';
    chip.setAttribute('aria-label', 'Time machine. You are viewing platyfy on ' + (d ? longDay(d) : 'a past day'));
  }
  setChip();

  function go(step, opts) {
    var prev = ORDER[S.step] || 0;
    S.step = step;
    for (var k in (opts || {})) S[k] = opts[k];
    S.dir = (ORDER[step] || 0) >= prev ? 1 : -1;
    render();
  }

  function crumb(label, act, data) {
    return '<button type="button" data-act="' + act + '"' + (data || '') + '>' + esc(label) + '</button><span aria-hidden="true">›</span>';
  }
  function renderCrumbs() {
    var h = '';
    var st = S.step;
    if (st === 'year') h = '<span class="at">Pick a year</span>';
    else {
      h += crumb('Years', 'years');
      if (st === 'born') h += '<span class="at">2025</span>';
      if (st === 'months') h += '<span class="at">' + S.y + '</span>';
      if (st === 'cal' || st === 'day') h += crumb(String(S.y), 'year', ' data-y="' + S.y + '"');
      if (st === 'cal') h += '<span class="at">' + MONTHS[S.m - 1] + '</span>';
      if (st === 'day') {
        var p = P(S.day);
        h += crumb(MONTHS[p.m - 1].slice(0, 3), 'month', ' data-y="' + p.y + '" data-m="' + p.m + '"');
        h += '<span class="at">' + p.d + '</span>';
      }
    }
    crumbs.innerHTML = h;
    backBtn.hidden = st === 'year';
  }

  function render(quiet) {
    renderCrumbs();
    var html;
    if (!D) html = loadErr
      ? (loadOffline
        ? '<div class="err">📡 You’re offline, so the time machine can’t reach platyfy’s past.<br>It needs the internet to travel. It will try again by itself once you’re back online, or <button class="qc" type="button" data-act="retry">try again</button></div>'
        : '<div class="err">The time machine couldn’t reach the timeline right now.<br>Check your connection and <button class="qc" type="button" data-act="retry">try again</button></div>')
      : '<div class="wait"><div class="spin"></div>WARMING UP THE FLUX CAPACITOR…</div>';
    else if (S.step === 'year') html = vYear();
    else if (S.step === 'born') html = vBorn();
    else if (S.step === 'months') html = vMonths();
    else if (S.step === 'cal') html = vCal();
    else html = vDay();
    view.innerHTML = '<div class="step' + (quiet ? '' : S.dir < 0 ? ' backward' : '') + '"' + (quiet ? ' style="animation:none"' : '') + '>' + html + '</div>';
    if (!quiet) view.scrollTop = 0;
    if (inSnap) {
      foot.hidden = false;
      var d = snapDay || (bySha(snapSha) || {}).day;
      root.querySelector('.where').innerHTML = 'You are visiting<b>' + esc(d ? shortDay(d) : 'the past') + '</b>';
    }
    live.textContent = crumbs.textContent.replace(/›/g, ' ');
  }

  function vYear() {
    var tp = P(D.today), yrs = [];
    for (var y = 2025; y <= Math.max(tp.y, 2026); y++) yrs.push(y);
    var bornY = P(D.born).y;
    var curY = inSnap && snapDay ? P(snapDay).y : 0;
    var h = '<p class="lead">Where to, traveller? Pick a year and platyfy will take you back.</p><div class="years" data-grid data-cols="2">';
    yrs.forEach(function (y) {
      var n = D.byYear[y] || 0;
      if (y < bornY) {
        h += '<button class="yr y-old" type="button" data-nav data-act="year" data-y="' + y + '"><span class="art">🥚</span>' +
          '<span class="yn">' + y + '</span><span class="ys">Before platyfy.<br>Just an egg.</span></button>';
      } else {
        var from = y === bornY ? shortDay(D.born).replace(/, \d+$/, '') : 'Jan 1';
        var to = y === tp.y ? 'today' : 'Dec 31';
        h += '<button class="yr y-live' + (y === curY ? ' cur' : '') + '" type="button" data-nav data-act="year" data-y="' + y + '"><span class="art">🐷</span>' +
          '<span class="yn grad">' + y + '</span><span class="ys"><b>' + n + '</b> updates<br>' + from + ' → ' + to + '</span>' +
          (y === curY ? '<span class="pill">YOU’RE HERE</span>' : (y === tp.y ? '<span class="pill c">NOW</span>' : '')) + '</button>';
      }
    });
    h += '</div>';
    var yest = addDays(D.today, -1), wk = addDays(D.today, -7), mo = addDays(D.today, -30);
    h += '<div class="qlabel">QUICK JUMPS</div><div class="quick">';
    h += '<button class="qc" type="button" data-act="openday" data-day="' + D.born + '">🎂 The very first day</button>';
    if (yest >= D.born) h += '<button class="qc" type="button" data-act="openday" data-day="' + yest + '">⏪ Yesterday</button>';
    if (wk >= D.born) h += '<button class="qc" type="button" data-act="openday" data-day="' + wk + '">📅 A week ago</button>';
    if (mo >= D.born) h += '<button class="qc" type="button" data-act="openday" data-day="' + mo + '">🗓️ A month ago</button>';
    if ((D.byDay[D.today] || []).length) h += '<button class="qc" type="button" data-act="openday" data-day="' + D.today + '">✨ Today’s updates</button>';
    h += '</div>';
    return h;
  }

  function vBorn() {
    var first = D.commits[0];
    var h = '<div class="born">' +
      '<div class="egg" aria-hidden="true"><span class="e">🥚</span>' +
        '<span class="s" style="left:6px;top:14px">✨</span><span class="s" style="right:4px;top:30px;animation-delay:.7s">✨</span>' +
        '<span class="s" style="left:22px;bottom:6px;animation-delay:1.3s;font-size:12px">⭐</span></div>' +
      '<h3 class="grad">platyfy wasn’t born yet!</h3>' +
      '<p>In ' + S.y + ' there were no pigs, no tycoons, no OofWorld — not a single game. Just an egg, sitting very still, waiting.</p>' +
      '<p>It hatched on <b>' + longDay(D.born) + '</b>' + (first && first.day === D.born ? ' at <b>' + clock(first.t) + '</b>' : '') + ' with its very first update:</p>' +
      (first ? '<q>“' + esc(first.msg) + '”</q>' : '') +
      '<button class="travel cool" type="button" data-nav data-act="openday" data-day="' + D.born + '">🐣 Jump to ' + esc(midDay(D.born)) + '<small>the day platyfy was born</small></button>' +
      '<div class="ghost" aria-hidden="true">';
    MONTHS.forEach(function (m) { h += '<span>' + m.slice(0, 3).toUpperCase() + '</span>'; });
    h += '</div><p style="font-size:11px;color:#5d5d7c;margin-top:8px">0 updates in ' + S.y + '. (We checked twice.)</p></div>';
    return h;
  }

  function monthsOf(y) {
    var b = P(D.born), t = P(D.today), list = [];
    for (var m = 1; m <= 12; m++) {
      var k = key(y, m);
      if (k < key(b.y, b.m) || k > key(t.y, t.m)) continue;
      list.push(m);
    }
    return list;
  }
  function vMonths() {
    var y = S.y, t = P(D.today), cur = inSnap && snapDay ? snapDay.slice(0, 7) : '';
    var list = monthsOf(y);
    var h = '<div class="ytotal"><span>' + y + (y === P(D.born).y ? ' · since ' + shortDay(D.born).replace(/, \d+$/, '') : '') + '</span><span><b>' + (D.byYear[y] || 0) + '</b> updates</span></div>' +
      '<div class="months" data-grid data-cols="3">';
    list.forEach(function (m) {
      var k = key(y, m), n = D.byMonth[k] || 0, days = dim(y, m), bars = '', mx = 1;
      for (var d = 1; d <= days; d++) mx = Math.max(mx, (D.byDay[key(y, m, d)] || []).length);
      for (d = 1; d <= days; d++) {
        var dk = key(y, m, d), c = (D.byDay[dk] || []).length;
        var col = !isSelectable(dk) ? '#191928' : ['#2a2a46', '#5a3fb0', '#7a52e0', '#2f8fd8', '#ffcc22', '#ff6644'][heat(c)];
        bars += '<i style="height:' + (c ? Math.max(18, Math.round(c / mx * 100)) : 8) + '%;background:' + col + '"></i>';
      }
      var isNow = y === t.y && m === t.m;
      h += '<button class="mo' + (k === cur ? ' cur' : '') + '" type="button" data-nav data-act="month" data-y="' + y + '" data-m="' + m + '" aria-label="' + MONTHS[m - 1] + ' ' + y + ', ' + plural(n, 'update') + '">' +
        '<div class="mn">' + MONTHS[m - 1].slice(0, 3).toUpperCase() + '</div>' +
        '<div class="mc"><b>' + n + '</b> update' + (n === 1 ? '' : 's') + '</div>' +
        '<div class="spark" aria-hidden="true">' + bars + '</div>' +
        (k === cur ? '<span class="pill">HERE</span>' : isNow ? '<span class="pill c">NOW</span>' : '') + '</button>';
    });
    return h + '</div>';
  }

  function vCal() {
    var y = S.y, m = S.m, days = dim(y, m), lead = dow(y, m, 1);
    var mk = key(y, m), n = D.byMonth[mk] || 0;
    var prevK = m === 1 ? key(y - 1, 12) : key(y, m - 1), nextK = m === 12 ? key(y + 1, 1) : key(y, m + 1);
    var canPrev = prevK >= D.born.slice(0, 7), canNext = nextK <= D.today.slice(0, 7);
    var active = 0;
    for (var i = 1; i <= days; i++) if (D.byDay[key(y, m, i)]) active++;
    var h = '<div class="calhd">' +
      '<button class="ic" type="button" data-act="mstep" data-d="-1" aria-label="Previous month"' + (canPrev ? '' : ' disabled') + '>‹</button>' +
      '<div class="calt"><div class="t">' + MONTHS[m - 1].toUpperCase() + ' ' + y + '</div><div class="s">' + plural(n, 'update') + ' · ' + active + ' busy day' + (active === 1 ? '' : 's') + '</div></div>' +
      '<button class="ic" type="button" data-act="mstep" data-d="1" aria-label="Next month"' + (canNext ? '' : ' disabled') + '>›</button></div>';
    h += '<div class="wk" aria-hidden="true">';
    ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].forEach(function (w) { h += '<span>' + w + '</span>'; });
    h += '</div><div class="cal" data-grid data-cols="7" data-cal role="grid" aria-label="' + MONTHS[m - 1] + ' ' + y + '">';
    for (i = 0; i < lead; i++) h += '<span aria-hidden="true"></span>';
    for (var d = 1; d <= days; d++) {
      var dk = key(y, m, d), c = (D.byDay[dk] || []).length, ok = isSelectable(dk);
      var cls = 'd ' + (ok ? 'h' + heat(c) : 'off') + (dk === D.today ? ' today' : '') + (inSnap && dk === snapDay ? ' cur' : '');
      var why = !ok ? (dk < D.born ? 'before platyfy existed' : 'in the future') : plural(c, 'update');
      h += '<button class="' + cls + '" type="button" data-nav data-act="day" data-day="' + dk + '"' + (ok ? '' : ' aria-disabled="true"') +
        ' aria-label="' + esc(longDay(dk) + ': ' + why + (dk === D.today ? ', today' : '') + (inSnap && dk === snapDay ? ', you are here' : '')) + '"' +
        (ok ? '' : ' title="' + (dk < D.born ? 'platyfy wasn’t born yet' : 'Can’t travel to the future (yet)') + '"') + '>' +
        '<span class="dn">' + d + '</span>' + (ok ? '<span class="dc">' + (c ? c + ' upd' : '·') + '</span>' : '') +
        (dk === D.today ? '<span class="tag">TODAY</span>' : '') +
        (dk === D.born ? '<span class="cake" aria-hidden="true">🎂</span>' : '') +
        (inSnap && dk === snapDay ? '<span class="pin" aria-hidden="true">📍</span>' : '') + '</button>';
    }
    h += '</div><div class="legend"><span>fewer<span class="sw">' +
      ['#141426', '#2a2152', '#4a2c8c', '#1f6aa8', '#d9a51c', '#ff6644'].map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') +
      '</span>more updates</span><span>' + (inSnap ? '📍 you are here' : '🎂 birthday') + '</span></div>';
    return h;
  }

  function vDay() {
    var day = S.day, p = P(day), ups = D.byDay[day] || [], snap = snapFor(day), isToday = day === D.today;
    var prevD = addDays(day, -1), nextD = addDays(day, 1);
    var h = '<div class="dayhd"><div class="dbig grad">' + p.d + '</div><div class="dmeta">' +
      '<div class="dw">' + WEEKDAYS[dow(p.y, p.m, p.d)].toUpperCase() + (isToday ? ' · TODAY' : '') + '</div>' +
      '<div class="dm">' + MONTHS[p.m - 1] + ' ' + p.d + ', ' + p.y + '</div>' +
      '<div class="dsum">' + (ups.length ? plural(ups.length, 'update') + (isToday ? ' so far today' : ' this day') : isToday ? 'no updates yet today' : 'a quiet day — no updates') + '</div></div>' +
      '<div class="navd"><button class="ic" type="button" data-act="openday" data-day="' + prevD + '" aria-label="Previous day"' + (isSelectable(prevD) ? '' : ' disabled') + '>‹</button>' +
      '<button class="ic" type="button" data-act="openday" data-day="' + nextD + '" aria-label="Next day"' + (isSelectable(nextD) ? '' : ' disabled') + '>›</button></div></div>';
    if (day === D.born) h += '<div class="note y">🎂 Happy birthday, platyfy! This is the day it all started.</div>';
    if (day < HUB_SINCE) h += '<div class="note">🐣 Back then platyfy was a single game — <b>Boss Gauntlet</b>. The games hub didn’t arrive until ' + midDay(HUB_SINCE) + '.</div>';
    if (!ups.length && snap) h += isToday
      ? '<div class="note">No updates yet today, so platyfy looks just like it did after its last update on <b>' + shortDay(snap.day) + '</b>.</div>'
      : '<div class="note">Nothing changed that day, so platyfy looked exactly like it did after its last update on <b>' + shortDay(snap.day) + '</b>.</div>';
    if (inSnap && day === snapDay) h += '<div class="note y">📍 You are visiting this day right now.</div>';

    if (isToday) {
      h += inSnap
        ? '<button class="travel cool" type="button" data-nav data-act="present">✨ This is today — go to the present<small>platyfy as it is right now</small></button>'
        : '<button class="travel cool" type="button" data-nav data-act="present">✨ This is today — you’re already here<small>this page is platyfy as it is right now</small></button>';
    } else if (snap) {
      h += '<button class="travel" type="button" data-nav data-act="travel" data-end="1" data-sha="' + snap.sha + '" data-day="' + day + '">🕰️ TRAVEL TO THE END OF THIS DAY<small>' +
        esc(longDay(day)) + ' · 11:59 PM</small></button>';
    }
    if (ups.length) {
      h += '<div class="uphd"><span>EVERY UPDATE THAT DAY</span><span>' + (inSnap ? '' : 'TAP GO TO VISIT') + '</span></div><ol class="ups">';
      ups.forEach(function (c) {
        var here = inSnap && c.sha === snapSha;
        h += '<li class="up' + (here ? ' here' : '') + '"><span class="ut">' + clock(c.t) + '</span>' +
          '<span class="um">' + esc(c.msg || '(no message)') + (here ? '<span class="pill">YOU’RE HERE</span>' : '') +
          '<span class="sha">#' + c.sha.slice(0, 7) + (c.i === 0 ? ' · the very first update' : '') + '</span></span>' +
          '<button class="go" type="button" data-nav data-act="travel" data-sha="' + c.sha + '" data-day="' + day + '" aria-label="Go to platyfy right after: ' + esc(c.msg) + ' (' + clock(c.t) + ')">GO →</button></li>';
      });
      h += '</ol>';
    }
    return h;
  }

  /* ---------------------------------------------------------------- open / close */
  var loadErr = false;
  function open(at) {
    S.open = true;
    warmSW();
    panel.classList.add('open');
    btn.classList.add('on');
    btn.setAttribute('aria-expanded', 'true');
    if (!D) {
      loadErr = false;
      render();
      load().then(function () { setChip(); startAt(at); }, function () { loadErr = true; render(); });
    } else startAt(at);
  }
  // Back online after an offline failure: retry by itself.
  window.addEventListener('online', function () { if (S.open && !D && loadErr) { loadErr = false; open('keep'); } });
  // Newer commits arrived from the GitHub API after we rendered from history.json.
  onNewer = function () {
    setChip(); refreshToast();
    if (!S.open || !D) return;
    var a = root.activeElement, sel = null;
    if (a && a.getAttribute) {
      sel = ['data-act', 'data-day', 'data-y', 'data-m', 'data-sha'].map(function (k) {
        var v = a.getAttribute(k); return v == null ? '' : '[' + k + '="' + v + '"]';
      }).join('');
      if (a.classList.contains('d')) sel = '.d' + sel; else if (a.classList.contains('go')) sel = '.go' + sel;
    }
    var top = view.scrollTop;
    render(true);
    view.scrollTop = top;
    var el = sel && root.querySelector(sel);
    if (el) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
  }
  function startAt(at) {
    if (at === 'here' && inSnap) {
      var d = snapDay || (bySha(snapSha) || {}).day;
      if (d) snapDay = d;
      if (d && isSelectable(d)) { var p = P(d); S.dir = 1; S.step = 'cal'; S.y = p.y; S.m = p.m; render(); focusFirst(); return; }
    }
    if (at === 'keep' && S.step !== 'year') { render(); focusFirst(); return; }
    S.step = 'year'; S.dir = 1; render(); focusFirst();
  }
  function close(refocus) {
    if (!S.open) return;
    S.open = false;
    panel.classList.remove('open');
    btn.classList.remove('on');
    btn.setAttribute('aria-expanded', 'false');
    if (refocus) btn.focus();
  }
  function toggle() { if (S.open) close(true); else open(inSnap ? 'here' : 'keep'); }

  function focusFirst() {
    if (!S.open) return;
    var el = view.querySelector('.d.cur:not(.off),.mo.cur,.yr.cur,.up.here .go') || view.querySelector('.d.today') ||
      view.querySelector('[data-nav]:not([aria-disabled]):not([disabled])') || view.querySelector('button');
    if (!view.querySelector('.d.cur:not(.off),.mo.cur,.yr.cur,.up.here .go')) {
      var tp = D ? P(D.today) : null;
      if (tp && S.step === 'year') el = view.querySelector('.yr[data-y="' + tp.y + '"]') || el;
      if (tp && S.step === 'months') el = view.querySelector('.mo[data-y="' + tp.y + '"][data-m="' + tp.m + '"]') || el;
    }
    if (S.step === 'cal' && !view.querySelector('.d.cur')) {
      // focus the busiest selectable day for keyboard users
      el = view.querySelector('.d.today') || view.querySelector('.d.h5,.d.h4,.d.h3,.d.h2,.d.h1,.d.h0') || el;
    }
    if (el) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
  }

  function openDay(day) {
    if (!isSelectable(day)) return;
    var p = P(day);
    go('day', { day: day, y: p.y, m: p.m });
    focusFirst();
  }
  function back() {
    if (S.step === 'day') go('cal');
    else if (S.step === 'cal') go('months');
    else if (S.step === 'months' || S.step === 'born') go('year');
    focusFirst();
  }

  /* ---------------------------------------------------------------- clicks */
  root.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-act]');
    if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') {
      if (b && b.classList.contains('d')) shake(b);
      return;
    }
    var a = b.getAttribute('data-act');
    var y = +b.getAttribute('data-y'), m = +b.getAttribute('data-m');
    if (a === 'close') close(true);
    else if (a === 'back') back();
    else if (a === 'retry') { loadErr = false; open('keep'); }
    else if (a === 'years') { go('year'); focusFirst(); }
    else if (a === 'year') {
      if (y < P(D.born).y) go('born', { y: y });
      else go('months', { y: y });
      focusFirst();
    }
    else if (a === 'month') { go('cal', { y: y, m: m }); focusFirst(); }
    else if (a === 'mstep') {
      var dd = +b.getAttribute('data-d'), nm = S.m + dd, ny_ = S.y;
      if (nm < 1) { nm = 12; ny_--; } if (nm > 12) { nm = 1; ny_++; }
      S.dir = dd; S.y = ny_; S.m = nm; S.step = 'cal'; render();
      var again = root.querySelector('[data-act="mstep"][data-d="' + dd + '"]:not([disabled])');
      if (again) again.focus(); else focusFirst();
    }
    else if (a === 'day' || a === 'openday') openDay(b.getAttribute('data-day'));
    else if (a === 'travel') travel(b.getAttribute('data-sha'), b.getAttribute('data-day'), b.hasAttribute('data-end'));
    else if (a === 'present') toPresent();
  });

  function shake(el) {
    if (reduced || !el.animate) return;
    el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 260 });
  }

  /* ---------------------------------------------------------------- keyboard */
  document.addEventListener('keydown', function (e) {
    if (S.open && (e.key === 'Escape' || e.key === 'Esc')) { e.preventDefault(); e.stopPropagation(); close(true); }
  }, true);
  root.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (S.open) { e.preventDefault(); close(true); }
      else if (toast && !toast.classList.contains('gone')) hideToast();
      return;
    }
    if (!S.open) return;
    var t = e.target;
    if ((e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) && S.step !== 'year') { e.preventDefault(); back(); return; }
    if (S.step === 'cal' && (e.key === 'PageUp' || e.key === 'PageDown')) {
      e.preventDefault();
      var mb = root.querySelector('[data-act="mstep"][data-d="' + (e.key === 'PageUp' ? -1 : 1) + '"]');
      if (mb && !mb.disabled) mb.click();
      return;
    }
    var grid = t && t.closest && t.closest('[data-grid]');
    var listGo = t && t.classList && t.classList.contains('go');
    var dirs = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: 'up', ArrowDown: 'down', Home: 'home', End: 'end' };
    if (!(e.key in dirs)) return;
    if (listGo || (S.step === 'day' && t === view.querySelector('.travel'))) {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      var gos = Array.prototype.slice.call(view.querySelectorAll('.travel,.go'));
      var gi = gos.indexOf(t) + (e.key === 'ArrowDown' ? 1 : -1);
      if (gos[gi]) { e.preventDefault(); gos[gi].focus(); gos[gi].scrollIntoView({ block: 'nearest' }); }
      return;
    }
    if (!grid) return;
    var items = Array.prototype.slice.call(grid.querySelectorAll('[data-nav]'));
    var i = items.indexOf(t), cols = +grid.getAttribute('data-cols') || 1, n = items.length;
    if (i < 0) return;
    var d = dirs[e.key], j = i;
    if (d === -1 || d === 1) j = i + d;
    else if (d === 'up') j = i - cols;
    else if (d === 'down') j = i + cols;
    else if (d === 'home') j = 0;
    else if (d === 'end') j = n - 1;
    e.preventDefault();
    if (grid.hasAttribute('data-cal') && (j < 0 || j >= n)) {
      // walk into the neighbouring month, keeping the same weekday column
      var step = j < 0 ? -1 : 1, target = addDays(items[i].getAttribute('data-day'), j - i);
      var mb2 = root.querySelector('[data-act="mstep"][data-d="' + step + '"]');
      if (!mb2 || mb2.disabled) return;
      mb2.click();
      var el = root.querySelector('.d[data-day="' + target + '"]');
      if (el) el.focus();
      return;
    }
    j = Math.max(0, Math.min(n - 1, j));
    items[j].focus();
  });

  /* ---------------------------------------------------------------- button: click + drag to any corner */
  (function () {
    var start = null, dragging = false;
    btn.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      dragging = false;
    });
    btn.addEventListener('pointermove', function (e) {
      if (!start || e.pointerId !== start.id) return;
      var dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!dragging && Math.abs(dx) + Math.abs(dy) > 8) {
        dragging = true;
        if (edge) { btn.__justDragged = true; start = null; return; } // a thumb sliding over the tab, not a click
        try { btn.setPointerCapture(e.pointerId); } catch (err) {}
        dock.classList.add('drag');
        if (S.open) close(false);
      }
      if (dragging) dock.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    });
    function end(e) {
      if (!start) return;
      if (dragging) {
        var r = btn.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        corner = (cy < innerHeight / 2 ? 't' : 'b') + (cx < innerWidth / 2 ? 'l' : 'r');
        dock.style.transform = '';
        dock.classList.remove('drag', 'bl', 'br', 'tl', 'tr');
        dock.classList.add(corner);
        panel.classList.remove('bl', 'br', 'tl', 'tr');
        panel.classList.add(corner);
        sSet('localStorage', 'platyfy-tm-corner', corner);
        btn.__justDragged = true;
        setTimeout(function () { btn.__justDragged = false; }, 50);
      }
      start = null;
      dragging = false;
      void e;
    }
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('click', function () { if (!btn.__justDragged) toggle(); btn.__justDragged = false; });
    btn.addEventListener('pointerdown', function () { btn.__justDragged = false; }, true);
    if (chip) chip.addEventListener('click', function () { if (S.open) close(true); else open('here'); });
  })();

  // Click anywhere outside closes the panel.
  document.addEventListener('pointerdown', function (e) {
    if (!S.open) return;
    var path = e.composedPath ? e.composedPath() : [];
    if (path.indexOf(host) < 0) close(false);
  }, true);

  /* ---------------------------------------------------------------- travel */
  var warpEl = null;
  function showWarp(fromDay, toDay, label, sub, mode) {
    if (warpEl) warpEl.remove();
    warpEl = document.createElement('div');
    warpEl.className = 'warp' + (mode === 'out' ? ' out' : '');
    warpEl.setAttribute('aria-hidden', 'true');
    warpEl.innerHTML = '<div class="tunnel"></div><div class="rings"><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="glow"></div>' +
      '<div class="wtxt"><div class="wl">' + esc(label) + '</div><div class="wd">' + (toDay ? stamp(fromDay || toDay) : '') + '</div><div class="ws">' + esc(sub || '') + '</div></div><div class="flash"></div>';
    rootEl.appendChild(warpEl);
    var wd = warpEl.querySelector('.wd');
    if (!toDay) wd.textContent = 'NOW';
    if (mode === 'out') { setTimeout(function () { if (warpEl) { warpEl.remove(); warpEl = null; } }, 1100); return; }
    if (!toDay) return;
    if (!fromDay || reduced) { wd.textContent = stamp(toDay); return; }
    // roll the date counter from "now" to the destination
    var a = Date.UTC(P(fromDay).y, P(fromDay).m - 1, P(fromDay).d), b = Date.UTC(P(toDay).y, P(toDay).m - 1, P(toDay).d), t0 = performance.now(), dur = 1050;
    (function frame(now) {
      var k = Math.min(1, (now - t0) / dur), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      var dt = new Date(a + (b - a) * e);
      wd.textContent = stamp(key(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()));
      if (k < 1 && warpEl) requestAnimationFrame(frame);
    })(t0);
  }
  function nowDay() { return inSnap ? (snapDay || (TT && TT.date) || D.today) : D.today; }

  function travel(sha, day, isEnd) {
    if (!/^[0-9a-f]{40}$/.test(sha || '')) return;
    var c = bySha(sha);
    day = day || (c && c.day);
    close(false);
    rSet('tt:day:' + sha, day || null);
    rSet('tt:go:' + sha, day ? day + '|' + Date.now() : null); // one-shot, read by the tt-sw.js shim
    rSet('tt:arrive', sha);
    showWarp(nowDay(), day, 'TRAVELLING TO', isEnd ? 'platyfy at the end of ' + longDay(day) : c ? 'right after ' + clock(c.t) + ': ' + c.msg : '');
    var minWait = wait(reduced ? 250 : (+window.__TM_WARP_MS || 1350)); // __TM_WARP_MS: test hook
    var sw = inSnap ? Promise.resolve(true) : warmSW() || Promise.resolve(false);
    Promise.all([minWait, Promise.race([sw, wait(5000)])]).then(function () {
      if (warpEl && !reduced) warpEl.classList.add('boom');
      setTimeout(function () {
        location.href = '/tt/' + sha + '/';
      }, reduced ? 0 : 280);
    });
  }
  function toPresent() {
    if (!inSnap) { close(true); return; }
    close(false);
    rSet('tt:arrive', 'present');
    showWarp(nowDay(), D ? D.today : null, 'RETURNING TO THE PRESENT', 'Welcome back, time traveller');
    wait(reduced ? 250 : 1250).then(function () {
      if (warpEl && !reduced) warpEl.classList.add('boom');
      setTimeout(function () {
        // A link with no referrer so the worker never mistakes this for a snapshot page asking for "/".
        var a = document.createElement('a');
        a.href = '/';
        a.rel = 'noreferrer';
        a.referrerPolicy = 'no-referrer';
        rootEl.appendChild(a);
        a.click();
        a.remove();
      }, reduced ? 0 : 280);
    });
  }

  /* ---------------------------------------------------------------- snapshot banner */
  var toast = null, toastTimer = 0;
  function hideToast() {
    if (!toast) return;
    toast.classList.add('gone');
    clearTimeout(toastTimer);
  }
  function showToast() {
    // tt-sw.js injects its own top banner; only show ours when that is missing.
    if (!inSnap || !isTopDoc() || document.getElementById('tt-banner-host')) return;
    var d = snapDay;
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML = '<span class="ti" aria-hidden="true">🕰️</span><div class="tx">You are viewing platyfy on <b class="tdate">' +
      esc(d ? longDay(d) : 'a day in the past') + '</b><span class="tmsg">' + (TT && TT.missing ? 'this page didn’t exist then' : snapMsg ? 'update: ' + esc(snapMsg) : '') + '</span></div>' +
      '<div class="tb"><button class="tbtn" type="button" data-t="open">TIME MACHINE</button><button class="tbtn" type="button" data-t="present">PRESENT →</button>' +
      '<button class="tbtn x" type="button" data-t="x" aria-label="Hide this banner">✕</button></div>';
    rootEl.appendChild(toast);
    toast.addEventListener('click', function (e) {
      var b = e.target.closest('[data-t]');
      if (!b) return;
      var t = b.getAttribute('data-t');
      hideToast();
      if (t === 'open') open('here');
      if (t === 'present') { load().then(toPresent, toPresent); }
    });
    toast.addEventListener('pointerenter', function () { clearTimeout(toastTimer); });
    toast.addEventListener('pointerleave', function () { clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 3000); });
    toastTimer = setTimeout(hideToast, isHub ? 9000 : 6000);
  }
  function refreshToast() {
    if (!toast) return;
    var c = bySha(snapSha);
    if (!snapDay && c) snapDay = c.day;
    if (snapDay) toast.querySelector('.tdate').textContent = longDay(snapDay);
    if (!snapMsg && c && !(TT && TT.missing)) { snapMsg = c.msg; toast.querySelector('.tmsg').textContent = 'update: ' + c.msg; }
  }

  /* ---------------------------------------------------------------- back/forward cache */
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    if (warpEl) { warpEl.remove(); warpEl = null; }
    rSet('tt:arrive', null);
    if (S.open) close(false);
  });

  /* ---------------------------------------------------------------- boot */
  if (!inSnap) dropStaleSW(); else noteTrip();
  if (arriving) showWarp(null, snapDay, 'WELCOME TO', '', 'out');
  if (returning) showWarp(null, null, 'BACK IN THE PRESENT', '', 'out');
  if (inSnap) {
    showToast();
    load().then(function () { setChip(); refreshToast(); }, function () {});
  }
  // debugging / other scripts: window.platyfyTimeMachine.open()
  window.platyfyTimeMachine = { open: function () { open(inSnap ? 'here' : 'keep'); }, close: function () { close(false); }, snapshot: snapSha };
})();
