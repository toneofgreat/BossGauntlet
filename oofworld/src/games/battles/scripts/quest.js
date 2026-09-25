// src/games/battles/scripts/quest.js — Battles. Spec 26 §11: the Killstreak questline.
//
// The whole secret, end to end: the vine balcony's six-faced CUBE (two puzzles deep),
// the stone door it opens, the hermit's fifteen-page book and the message hiding at the
// start of every thought, the ring the sky keeps and its book of numbers, the hollow
// tree, the telescope and the stars that spell coordinates, the rebirth that trades
// every kill for star metal, the rocket, and the dig at the end of it. Every control is
// a TAP (spec 26 §2.4: no keyboard verb) — arrows, steppers and big buttons throughout.
//
// This module owns its DOM overlays and dynamic parts; game.js forwards touch events
// into onTouch(), ticks update(dt), and calls refreshWorld() after loads/changes so a
// returning save finds its doors already open and its bridges already hung.

import { FLOOR_TOP, RING_CENTER, CLOUD_STEPS, STAR_STEPS, SKY_ISLE, SKY_COORDS, CRATER, LOBBY_SPAWN } from "./layout.js";

const DIGS_NEEDED = 6;

// ---- cube phase 1: six faces of lights-out (3x3; a tap flips the cross) -------------
// Each scramble is the list of taps that DARKENED a solved face — so every face is
// provably solvable by definition. Six faces, six gem colors, six different scrambles.
const FACE_COLORS = ["#ff5a3a", "#ffd23a", "#3ddc84", "#35a3e0", "#a05cff", "#e0245e"];
const FACE_SCRAMBLES = [
  [0, 4, 8], [1, 3, 5, 7], [0, 2, 6, 8, 4], [2, 4, 6], [0, 1, 5, 8], [3, 4, 5, 1],
];
// ---- cube phase 2: six ice-slide mazes (the ball slides until it hits a wall; park it
// EXACTLY on the button ⭘). 7x7 cells, '#' wall, '.' floor, 'S' start, 'O' the button.
const MAZES = [
  ["#######", "#S....#", "#.##..#", "#..#..#", "#..#.##", "#....O#", "#######"],
  ["#######", "#...#O#", "#.#...#", "#.#.#.#", "#...#.#", "#S#...#", "#######"],
  ["#######", "#..#.S#", "#.....#", "##.#.##", "#..#..#", "#O...##", "#######"],
  ["#######", "#S..#.#", "##....#", "#..##.#", "#.#...#", "#...#O#", "#######"],
  ["#######", "#.#..S#", "#.#.#.#", "#.....#", "#.###.#", "#O....#", "#######"],
  ["#######", "#S.#..#", "#..#.##", "#.....#", "###.#.#", "#..#O.#", "#######"],
];

export function createQuest(deps) {
  const { ctx, getSave, saveNow, toast, sfx, pagedPanel, onUnlockKillstreak, isPanelOpen, setPanelOpen } = deps;

  const Q = {
    overlay: null,          // the one live fullscreen overlay (cube, scope, rocket)
    dynParts: [],           // ids of quest-spawned world parts (clouds, bridge, altar)
    doorGone: false, treeDoorGone: false, cloudsUp: false, bridgeUp: false,
    timers: [],             // {t, fn} — the no-setTimeout queue, ticked by update(dt)
    digs: 0, digCd: 0,
    flight: null,           // {t} — the rocket ride, ticked in update
    spin: 0,
  };
  const save = () => getSave();
  const quest = () => save().quest;
  const later = (t, fn) => Q.timers.push({ t, fn });
  const part = (def) => { try { ctx.engine.parts.create(def); Q.dynParts.push(def.id); } catch { /* fine */ } };

  // ---- shared overlay scaffolding ----------------------------------------------------
  function closeOverlay() {
    if (Q.overlay) { try { Q.overlay.remove(); } catch { /* gone */ } Q.overlay = null; setPanelOpen(false); }
  }
  function openOverlay() {
    if (isPanelOpen()) return null;
    setPanelOpen(true);
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;inset:0;z-index:80;background:rgba(10,7,16,0.92);display:flex;align-items:center;justify-content:center;touch-action:manipulation;";
    document.body.append(el);
    Q.overlay = el;
    return el;
  }
  function bigBtn(label, style) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label;
    b.style.cssText = "font:700 17px system-ui,sans-serif;color:#fff;border:none;border-radius:14px;padding:14px 18px;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.4);touch-action:manipulation;user-select:none;background:#3a2740;" + (style || "");
    return b;
  }

  // ---- THE CUBE, phase 1 --------------------------------------------------------------
  function openCube1() {
    const el = openOverlay(); if (!el) return;
    sfx("warp");
    const solvedFaces = new Array(6).fill(false);
    const grids = FACE_SCRAMBLES.map((taps) => {
      const g = new Array(9).fill(true);
      for (const t of taps) flip(g, t);
      return g;
    });
    function flip(g, i) {
      const r = Math.floor(i / 3), c = i % 3;
      for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < 3 && cc >= 0 && cc < 3) g[rr * 3 + cc] = !g[rr * 3 + cc];
      }
    }
    let face = 0;
    const box = document.createElement("div");
    box.style.cssText = "width:min(92vw,420px);background:#161022;border:3px solid #3a2740;border-radius:20px;padding:18px;text-align:center;transform:scale(0.2);transition:transform .5s;";
    const title = document.createElement("div");
    title.style.cssText = "font:800 19px system-ui;color:#ffe6a0;margin-bottom:4px;";
    title.textContent = "The cube turns to face you.";
    const sub = document.createElement("div");
    sub.style.cssText = "font:400 13px system-ui;color:#c9b8e0;margin-bottom:12px;";
    sub.textContent = "Light every window on every side. A touch flips its neighbours too.";
    const dots = document.createElement("div"); dots.style.cssText = "font:700 16px system-ui;margin-bottom:10px;letter-spacing:4px;";
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:min(70vw,260px);margin:0 auto 12px;";
    const cells = [];
    for (let i = 0; i < 9; i++) {
      const c = bigBtn("", "aspect-ratio:1;border-radius:12px;padding:0;min-height:64px;");
      c.addEventListener("click", () => {
        if (solvedFaces[face]) return;
        flip(grids[face], i); sfx("click"); paint();
        if (grids[face].every(Boolean)) {
          solvedFaces[face] = true; sfx("sparkle"); paint();
          if (solvedFaces.every(Boolean)) cube1Done();
        }
      });
      cells.push(c); grid.append(c);
    }
    const nav = document.createElement("div"); nav.style.cssText = "display:flex;gap:10px;justify-content:center;";
    const left = bigBtn("◀", "width:74px;font-size:22px;");
    const right = bigBtn("▶", "width:74px;font-size:22px;");
    const leave = bigBtn("Step back", "background:#565d70;");
    left.addEventListener("click", () => { face = (face + 5) % 6; sfx("click"); paint(); });
    right.addEventListener("click", () => { face = (face + 1) % 6; sfx("click"); paint(); });
    leave.addEventListener("click", () => { sfx("ui_close"); closeOverlay(); });
    nav.append(left, leave, right);
    box.append(title, sub, dots, grid, nav);
    el.append(box);
    requestAnimationFrameSafe(() => { box.style.transform = "scale(1)"; }); // the "zoom into the cube"
    function paint() {
      dots.innerHTML = solvedFaces.map((s, i) => `<span style="color:${s ? FACE_COLORS[i] : "#3a2740"}">●</span>`).join("");
      const g = grids[face], col = FACE_COLORS[face];
      for (let i = 0; i < 9; i++) {
        cells[i].style.background = g[i] ? col : "#241a2e";
        cells[i].style.boxShadow = g[i] ? `0 0 14px ${col}` : "inset 0 2px 6px rgba(0,0,0,.5)";
      }
      title.textContent = solvedFaces[face] ? "This side burns steady." : `Side ${face + 1} of 6`;
    }
    paint();
    function cube1Done() {
      quest().c1 = true; saveNow();
      title.textContent = "The cube CRACKS —";
      sub.textContent = "— and inside it, a smaller cube. The zoom pulls you closer.";
      sfx("badge");
      box.style.transform = "scale(1.15)";
      later(1.1, () => { closeOverlay(); openCube2(); });
    }
  }

  // ---- THE CUBE, phase 2 --------------------------------------------------------------
  function openCube2() {
    const el = openOverlay(); if (!el) return;
    sfx("warp");
    const solved = new Array(6).fill(false);
    let face = 0, ball = null, moving = false;
    const box = document.createElement("div");
    box.style.cssText = "width:min(92vw,440px);background:#0e0a18;border:3px solid #7c3aed;border-radius:20px;padding:16px;text-align:center;transform:scale(0.3);transition:transform .5s;";
    const title = document.createElement("div"); title.style.cssText = "font:800 18px system-ui;color:#ffe6a0;margin-bottom:4px;";
    const sub = document.createElement("div"); sub.style.cssText = "font:400 13px system-ui;color:#c9b8e0;margin-bottom:10px;";
    sub.textContent = "Roll the bead onto the button ⭘ on every side. It slides until something stops it.";
    const dots = document.createElement("div"); dots.style.cssText = "font:700 16px system-ui;margin-bottom:8px;letter-spacing:4px;";
    const board = document.createElement("div");
    board.style.cssText = "display:grid;grid-template-columns:repeat(7,1fr);gap:3px;width:min(74vw,280px);margin:0 auto 10px;";
    const cellEls = [];
    for (let i = 0; i < 49; i++) { const d = document.createElement("div"); d.style.cssText = "aspect-ratio:1;border-radius:6px;min-height:26px;"; cellEls.push(d); board.append(d); }
    const pad = document.createElement("div");
    pad.style.cssText = "display:grid;grid-template-columns:repeat(3,86px);grid-template-rows:repeat(2,58px);gap:8px;justify-content:center;margin-bottom:10px;";
    const mk = (lab, dr, dc, area) => { const b = bigBtn(lab, "font-size:22px;padding:8px;grid-area:" + area + ";"); b.addEventListener("click", () => slide(dr, dc)); return b; };
    pad.append(mk("⬆", -1, 0, "1/2"), mk("⬅", 0, -1, "2/1"), mk("⬇", 1, 0, "2/2"), mk("➡", 0, 1, "2/3"));
    const nav = document.createElement("div"); nav.style.cssText = "display:flex;gap:8px;justify-content:center;";
    const left = bigBtn("◀", "width:64px;");
    const right = bigBtn("▶", "width:64px;");
    const reset = bigBtn("↺ Reset", "background:#7d1f16;");
    const leave = bigBtn("Step back", "background:#565d70;");
    left.addEventListener("click", () => { face = (face + 5) % 6; enterFace(); });
    right.addEventListener("click", () => { face = (face + 1) % 6; enterFace(); });
    reset.addEventListener("click", () => { sfx("click"); enterFace(); });
    leave.addEventListener("click", () => { sfx("ui_close"); closeOverlay(); });
    nav.append(left, reset, leave, right);
    box.append(title, sub, dots, board, pad, nav);
    el.append(box);
    requestAnimationFrameSafe(() => { box.style.transform = "scale(1)"; });
    const at = (r, c) => MAZES[face][r][c];
    function enterFace() {
      const rows = MAZES[face];
      for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if (rows[r][c] === "S") ball = [r, c];
      moving = false; paint();
    }
    function slide(dr, dc) {
      if (solved[face] || moving) return;
      moving = true; sfx("click");
      let [r, c] = ball;
      while (at(r + dr, c + dc) !== "#") { r += dr; c += dc; }
      ball = [r, c]; moving = false; paint();
      if (at(r, c) === "O") {
        solved[face] = true; sfx("sparkle"); paint();
        if (solved.every(Boolean)) cube2Done();
      }
    }
    function paint() {
      dots.innerHTML = solved.map((s, i) => `<span style="color:${s ? FACE_COLORS[i] : "#241a2e"}">■</span>`).join("");
      title.textContent = solved[face] ? "This side rests." : `Inner side ${face + 1} of 6`;
      const rows = MAZES[face];
      for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
        const d = cellEls[r * 7 + c], ch = rows[r][c];
        const isBall = ball && ball[0] === r && ball[1] === c;
        d.textContent = ch === "O" && !isBall ? "⭘" : "";
        d.style.cssText = "aspect-ratio:1;border-radius:6px;min-height:26px;display:flex;align-items:center;justify-content:center;font:700 15px system-ui;color:#ffd23a;"
          + (ch === "#" ? "background:#3a2740;" : "background:#161022;box-shadow:inset 0 1px 4px rgba(0,0,0,.6);");
        if (isBall) d.style.background = solved[face] ? FACE_COLORS[face] : "#e8e4f0";
      }
    }
    function cube2Done() {
      quest().c2 = true; saveNow();
      title.textContent = "Every side rests. The inner cube dissolves —";
      sub.textContent = "— and far away, you hear stone slide aside. You have no idea what just opened.";
      sfx("badge");
      later(1.6, () => { closeOverlay(); toast("Somewhere, a door that was never a door… moved.", "🚪", 4200); refreshWorld(); });
    }
    enterFace();
  }

  // ---- book one: fifteen pages about a man --------------------------------------------
  // The first letters of the pages spell T-H-E-R-I-N-G-I-N-T-H-E-S-K-Y.
  const BOOK1 = [
    "Time was, a man lived behind the arena wall, and nobody ever learned his name. The fighters called him the Hermit, when they remembered him at all.",
    "He had been a champion once — you can tell from the notches on his old bowl, one for every bout, filed with a winner's neatness.",
    "Every morning he swept the balcony, watered the vines he had planted to hide it, and watched the sand through the green.",
    "Records of his fights are gone. He burned them himself, the night he stopped fighting, and kept only a telescope and this book.",
    "In the margins of his charts he wrote one sentence over and over: WHAT FALLS IS NOT LOST.",
    "Nobody saw what he saw the night the meteor came down. But the vines grew faster after, and he stopped going to the arena at all.",
    "Gulls nested on his balcony. He fed them, and they brought him things: wire, cloth, and once — he underlines this twice — a scrap of metal that was NOT warm, but remembered being.",
    "In his last year he built something in the courtyard, under the old tree. He does not say what. He says it took eleven tries.",
    "Nothing in this room was left by accident. He says that plainly on the first page of his charts: 'I leave a path for one pair of eyes at a time.'",
    "The charts themselves he tore out and hid ABOVE — his word, underlined, with no other direction given.",
    "His last winter was cold. He writes about the tree keeping him company, the only thing in the courtyard older than the arena.",
    "Endings did not frighten him. 'A streak is not broken by dying,' he wrote, 'only paused. The blade I buried knows different, and it is wrong, and it is beautiful.'",
    "Somewhere in the sky, he insists, the rest of this story waits. He is not sorry for the climb it will cost.",
    "Kindness was his last note. 'To whoever reads this: I never wanted the blade found by someone who could not first sit still with a puzzle.'",
    "You close the book. The first letters of every page itch at you, the way the Hermit clearly intended.",
  ];

  // ---- book two: the numbers, and the decode ------------------------------------------
  const BOOK2_NUMBERS = "20-8-5   20-18-5-5\n8-15-12-4-19\n20-8-5   19-20-1-18-19\n3-12-9-13-2   1-14-4   12-15-15-11";
  function openDecode() {
    if (isPanelOpen()) return;
    setPanelOpen(true);
    const panel = ctx.services.ui.openPanel({ title: "📖 The book of numbers", onClose: () => setPanelOpen(false) });
    const body = panel.bodyEl || panel.el;
    const pre = document.createElement("pre");
    pre.style.cssText = "font:700 20px/1.7 ui-monospace,monospace;color:#ffe6a0;text-align:center;white-space:pre-wrap;margin:4px 0 6px;";
    pre.textContent = BOOK2_NUMBERS;
    const hint = document.createElement("div");
    hint.style.cssText = "font:400 13px system-ui;color:#c9b8e0;margin-bottom:10px;text-align:center;";
    hint.textContent = "In the corner, tiny, almost apologetic: “1 = A”.";
    const input = document.createElement("input");
    input.type = "text"; input.placeholder = "what does it say?"; input.autocomplete = "off";
    input.style.cssText = "width:100%;box-sizing:border-box;font:700 17px system-ui;padding:12px;border-radius:12px;border:2px solid #3a2740;background:#161022;color:#fff;margin-bottom:10px;text-align:center;";
    const go = bigBtn("Speak it", "width:100%;background:linear-gradient(180deg,#7c3aed,#4c1d95);");
    const verdict = document.createElement("div");
    verdict.style.cssText = "font:700 14px system-ui;color:#ff5a3a;min-height:20px;margin-top:8px;text-align:center;";
    go.addEventListener("click", () => {
      const said = (input.value || "").toUpperCase();
      if (said.includes("TREE") && (said.includes("STAR") || said.includes("CLIMB") || said.includes("LOOK"))) {
        quest().dec = true; saveNow(); sfx("badge");
        verdict.style.color = "#3ddc84";
        verdict.textContent = "The words settle. Far below, in the courtyard, wood unseals.";
        toast("THE TREE HOLDS THE STARS. Its door will open for you now.", "🌳", 5200);
        later(1.4, () => { try { panel.close(); } catch { /* fine */ } refreshWorld(); });
      } else {
        sfx("denied"); verdict.textContent = "The numbers stay numbers.";
      }
    });
    body.append(pre, hint, input, go, verdict);
  }

  // ---- the telescope: three skies, one constellation ----------------------------------
  // Deterministic starfields (seeded LCG); the SWORD hides in the EAST sky — five blade
  // stars and two guard stars. Tap all seven; one wrong star wipes the attempt.
  const SWORD_STARS = [[0.30, 0.72], [0.38, 0.62], [0.46, 0.52], [0.54, 0.42], [0.62, 0.32], [0.40, 0.44], [0.52, 0.56]];
  function starsFor(panel) {
    let s = 1234 + panel * 999;
    const rnd = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
    const list = [];
    for (let i = 0; i < 26; i++) {
      const x = 0.06 + rnd() * 0.88, y = 0.08 + rnd() * 0.8, r = 2 + rnd() * 2.5;
      // no decoy may crowd a sword star: a tap meant for the constellation must never
      // land on a stranger the player cannot visually separate from it
      if (panel === 2 && SWORD_STARS.some(([kx, ky]) => (kx - x) ** 2 + ((ky - y) * 0.75) ** 2 < 0.006)) continue;
      list.push({ x, y, r, key: false });
    }
    if (panel === 2) for (const [x, y] of SWORD_STARS) list.push({ x, y, r: 3.4, key: true });
    return list;
  }
  function openScope() {
    const el = openOverlay(); if (!el) return;
    sfx("warp");
    const box = document.createElement("div");
    box.style.cssText = "width:min(94vw,460px);background:#05030c;border:3px solid #35a3e0;border-radius:20px;padding:14px;text-align:center;";
    const title = document.createElement("div"); title.style.cssText = "font:800 18px system-ui;color:#7ec8ff;margin-bottom:6px;";
    const canvas = document.createElement("canvas");
    canvas.width = 640; canvas.height = 480;
    canvas.style.cssText = "width:100%;border-radius:12px;background:radial-gradient(ellipse at 50% 120%, #101a33 0%, #05030c 70%);touch-action:manipulation;";
    const sub = document.createElement("div"); sub.style.cssText = "font:400 13px system-ui;color:#c9b8e0;margin:8px 0;";
    sub.textContent = "The Hermit's charts drew a SWORD in the stars. Tap its stars — and only its stars.";
    const nav = document.createElement("div"); nav.style.cssText = "display:flex;gap:8px;justify-content:center;";
    const left = bigBtn("◀ turn", "");
    const right = bigBtn("turn ▶", "");
    const leave = bigBtn("Step back", "background:#565d70;");
    nav.append(left, leave, right);
    box.append(title, canvas, sub, nav);
    el.append(box);
    const NAMES = ["THE WEST SKY", "THE SOUTH SKY", "THE EAST SKY"];
    let panel = 0, picked = new Set(), stars = starsFor(0);
    const g = canvas.getContext("2d");
    function paint() {
      title.textContent = NAMES[panel];
      g.clearRect(0, 0, 640, 480);
      for (let i = 0; i < stars.length; i++) {
        const st = stars[i];
        g.beginPath(); g.arc(st.x * 640, st.y * 480, st.r * (picked.has(i) ? 1.8 : 1), 0, 7);
        g.fillStyle = picked.has(i) ? "#ffd23a" : "#e8ecf7"; g.fill();
        if (picked.has(i)) { g.beginPath(); g.arc(st.x * 640, st.y * 480, st.r * 3.2, 0, 7); g.strokeStyle = "#ffd23a55"; g.stroke(); }
      }
    }
    function turn(d) { panel = (panel + d + 3) % 3; stars = starsFor(panel); picked = new Set(); sfx("click"); paint(); }
    left.addEventListener("click", () => turn(-1));
    right.addEventListener("click", () => turn(1));
    leave.addEventListener("click", () => { sfx("ui_close"); closeOverlay(); });
    canvas.addEventListener("pointerdown", (e) => {
      const r = canvas.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      let hit = -1;
      for (let i = 0; i < stars.length; i++) { const st = stars[i]; if ((st.x - px) ** 2 + ((st.y - py) * 0.75) ** 2 < 0.0016) { hit = i; break; } }
      if (hit < 0) return;
      if (!stars[hit].key) { picked = new Set(); sfx("denied"); sub.textContent = "That star belongs to no sword. The pattern scatters — start again."; paint(); return; }
      picked.add(hit); sfx("click"); paint();
      if (stars.filter((s2) => s2.key).length && stars.every((s2, i) => !s2.key || picked.has(i))) {
        quest().stars = true; saveNow(); sfx("badge");
        sub.textContent = `The sword blazes. Under it, two numbers burn: ${SKY_COORDS[0]} · ${SKY_COORDS[1]}. A bridge of starlight reaches from this very deck.`;
        toast(`The stars spell ${SKY_COORDS[0]} · ${SKY_COORDS[1]} — remember them.`, "✨", 6000);
        refreshWorld();
      }
    });
    paint();
  }

  // ---- rebirth ------------------------------------------------------------------------
  function openRebirth() {
    if (isPanelOpen()) return;
    const s = save();
    setPanelOpen(true);
    const panel = ctx.services.ui.openPanel({ title: "⭐ The fallen star", onClose: () => setPanelOpen(false) });
    const body = panel.bodyEl || panel.el;
    const p = document.createElement("p");
    p.style.cssText = "font:400 15px/1.5 system-ui;color:#e8e0f0;";
    p.textContent = s.kills > 0
      ? `The star metal answers only emptiness. Offer EVERY kill you have — all ${s.kills} of them — and it will let you take a piece. Your swords will lock again behind their numbers. This is a REBIRTH. It cannot be undone.`
      : "The star wants what you carry, and you carry nothing. Come back with kills worth losing.";
    body.append(p);
    if (s.kills > 0) {
      const go = bigBtn(`⭐ Rebirth — give up ${s.kills} kills`, "width:100%;background:linear-gradient(180deg,#c0392b,#7d1f16);margin-top:8px;");
      go.addEventListener("click", () => {
        const s2 = save();
        s2.rebirths += 1; s2.kills = 0;
        if (deps.onRebirth) deps.onRebirth();
        saveNow(); sfx("badge");
        try { panel.close(); } catch { /* fine */ }
        toast("REBORN. A shard of star metal is yours — the rocket kiosk in the courtyard will want it.", "⭐", 6000);
      });
      body.append(go);
    }
  }

  // ---- the rocket ---------------------------------------------------------------------
  function openRocket() {
    if (isPanelOpen()) return;
    const s = save();
    if (!s.quest.rocket && s.rebirths < 1) {
      toast("A half-built rocket. Its empty socket is star-shaped. (It wants a rebirth.)", "🚀", 3600);
      return;
    }
    if (!s.quest.rocket) {
      setPanelOpen(true);
      const panel = ctx.services.ui.openPanel({ title: "🚀 The Hermit's rocket", onClose: () => setPanelOpen(false) });
      const body = panel.bodyEl || panel.el;
      const p = document.createElement("p"); p.style.cssText = "font:400 15px/1.5 system-ui;color:#e8e0f0;";
      p.textContent = `Eleven tries, the book said. It only wants one thing now: a shard of star metal. You have ${s.rebirths} rebirth${s.rebirths === 1 ? "" : "s"}.`;
      const go = bigBtn("⭐ Spend 1 rebirth — finish the rocket", "width:100%;background:linear-gradient(180deg,#7c3aed,#4c1d95);margin-top:8px;");
      go.addEventListener("click", () => {
        const s2 = save(); s2.rebirths -= 1; s2.quest.rocket = true; saveNow(); sfx("badge");
        try { panel.close(); } catch { /* fine */ }
        toast("The rocket hums awake. Touch its pad and press ENTER.", "🚀", 4200);
      });
      body.append(p, go);
      return;
    }
    openCockpit();
  }
  function openCockpit() {
    const el = openOverlay(); if (!el) return;
    sfx("click");
    const box = document.createElement("div");
    box.style.cssText = "width:min(92vw,400px);background:#0e1018;border:3px solid #7ec8ff;border-radius:20px;padding:18px;text-align:center;";
    const title = document.createElement("div"); title.style.cssText = "font:800 19px system-ui;color:#7ec8ff;margin-bottom:6px;"; title.textContent = "🚀 ENTER";
    const sub = document.createElement("div"); sub.style.cssText = "font:400 13px system-ui;color:#c9b8e0;margin-bottom:12px;"; sub.textContent = "Set the sky coordinates. The stars said what they said.";
    const vals = [0, 0];
    const rows = document.createElement("div");
    const readouts = [];
    ["X", "Z"].forEach((axis, k) => {
      const row = document.createElement("div"); row.style.cssText = "display:flex;gap:6px;align-items:center;justify-content:center;margin-bottom:10px;";
      const lab = document.createElement("span"); lab.style.cssText = "font:800 16px system-ui;color:#ffe6a0;width:18px;"; lab.textContent = axis;
      const out = document.createElement("span"); out.style.cssText = "font:800 22px ui-monospace,monospace;color:#fff;min-width:74px;display:inline-block;";
      readouts.push(out);
      const mk = (t, d) => { const b = bigBtn(t, "padding:10px 12px;min-width:52px;"); b.addEventListener("click", () => { vals[k] = Math.max(-99, Math.min(99, vals[k] + d)); sfx("click"); paint(); }); return b; };
      row.append(mk("−10", -10), mk("−1", -1), lab, out, mk("+1", 1), mk("+10", 10));
      rows.append(row);
    });
    const launch = bigBtn("🔥 LAUNCH", "width:100%;background:linear-gradient(180deg,#c0392b,#7d1f16);font-size:19px;");
    const leave = bigBtn("Climb out", "width:100%;background:#565d70;margin-top:8px;");
    launch.addEventListener("click", () => {
      closeOverlay();
      if (vals[0] === SKY_COORDS[0] && vals[1] === SKY_COORDS[1]) {
        sfx("warp");
        toast("IGNITION. Hold on.", "🚀", 2200);
        try { ctx.engine.camera.shake(0.7, 2.2); } catch { /* fine */ }
        Q.flight = { t: 0 };
      } else {
        sfx("denied");
        toast("The rocket sniffs the sky… and settles back down. Nothing lives at those numbers.", "🚀", 3600);
      }
    });
    leave.addEventListener("click", () => { sfx("ui_close"); closeOverlay(); });
    function paint() { readouts[0].textContent = String(vals[0]); readouts[1].textContent = String(vals[1]); }
    box.append(title, sub, rows, launch, leave);
    el.append(box);
    paint();
  }

  // ---- the dig ------------------------------------------------------------------------
  let digBtn = null;
  function showDigButton() {
    if (digBtn || save().ks) return;
    digBtn = bigBtn("⛏ DIG", "position:fixed;left:50%;bottom:140px;transform:translateX(-50%);z-index:70;font-size:22px;padding:18px 34px;background:linear-gradient(180deg,#e8a33a,#8c6a3f);");
    digBtn.addEventListener("click", () => {
      if (Q.digCd > 0) return;
      Q.digCd = 0.35; Q.digs += 1; sfx("land");
      try { ctx.engine.camera.shake(0.25, 0.3); } catch { /* fine */ }
      const me = ctx.player.position();
      for (let k = 0; k < 4; k++) {
        const id = "bt_qdig_" + Q.digs + "_" + k;
        part({ id, shape: "wedge", size: [0.7, 0.7, 0.7], position: [me[0] + Math.cos(k * 1.57) * 1.4, me[1] + 0.6 + k * 0.2, me[2] + Math.sin(k * 1.57) * 1.4], rotation: [0, k * 90, 20], color: "#5a4a38", material: "metal", canCollide: false });
        later(0.5, () => { try { ctx.engine.parts.remove(id); } catch { /* gone */ } });
      }
      digBtn.textContent = `⛏ DIG (${Q.digs}/${DIGS_NEEDED})`;
      if (Q.digs >= DIGS_NEEDED) {
        hideDigButton();
        const s = save(); s.ks = true; saveNow();
        sfx("win");
        toast("Your blade strikes metal. THE KILLSTREAK IS YOURS.", "🩸", 5200);
        if (onUnlockKillstreak) onUnlockKillstreak();
        later(2.2, () => {
          toast("The crater keeps no guests. Starlight takes you home.", "⚡", 3600);
          sfx("warp");
          try { ctx.player.kill("bt:starfall"); } catch { try { ctx.player.teleport([LOBBY_SPAWN[0], LOBBY_SPAWN[1], LOBBY_SPAWN[2]], 90); } catch { /* fine */ } }
        });
      }
    });
    document.body.append(digBtn);
  }
  function hideDigButton() { if (digBtn) { try { digBtn.remove(); } catch { /* fine */ } digBtn = null; } }

  // ---- the world catching up with the save --------------------------------------------
  function refreshWorld() {
    const s = save();
    if (s.quest.c2 && !Q.doorGone) { Q.doorGone = true; try { ctx.engine.parts.remove("bt_door"); } catch { /* gone */ } }
    if (s.quest.dec && !Q.treeDoorGone) { Q.treeDoorGone = true; try { ctx.engine.parts.remove("bt_treedoor"); } catch { /* gone */ } }
    if (s.quest.b1 && !Q.cloudsUp) {
      Q.cloudsUp = true;
      for (let i = 0; i < CLOUD_STEPS.length; i++) {
        const [x, y, z] = CLOUD_STEPS[i];
        part({ id: "bt_qcloud_" + i, size: [3, 0.8, 3], position: [x, y - 0.4, z], color: i % 2 ? "#eef2fa" : "#dfe8f2", material: "plastic", canCollide: true });
      }
      // the altar at the ring's heart, and the book of numbers on it
      part({ id: "bt_qaltar", shape: "cylinder", size: [7, 1, 7], position: [RING_CENTER[0], RING_CENTER[1] - 3.5, RING_CENTER[2]], color: "#dfe8f2", material: "plastic", canCollide: true });
      part({ id: "bt_qaltar2", shape: "cylinder", size: [2.4, 1.6, 2.4], position: [RING_CENTER[0], RING_CENTER[1] - 2.2, RING_CENTER[2]], color: "#8a93a6", material: "metal", canCollide: false }); // walk-through: it stands ON the touch pad
      part({ id: "bt_qbook2", size: [1.7, 0.3, 1.2], position: [RING_CENTER[0], RING_CENTER[1] - 1.2, RING_CENTER[2]], rotation: [0, 30, 6], color: "#2f6fd0", material: "neon", canCollide: false });
      part({ id: "bt_qbook2pad", shape: "cylinder", size: [4.4, 0.3, 4.4], position: [RING_CENTER[0], RING_CENTER[1] - 2.8, RING_CENTER[2]], color: "#7ec8ff", material: "neon", canCollide: false, behaviors: [{ type: "touchEvent", event: "bt_book2", cooldownS: 1.5 }] });
    }
    if (s.quest.stars && !Q.bridgeUp) {
      Q.bridgeUp = true;
      for (let i = 0; i < STAR_STEPS.length; i++) {
        const [x, y, z] = STAR_STEPS[i];
        part({ id: "bt_qstar_" + i, size: [2.6, 0.5, 2.6], position: [x, y - 0.25, z], rotation: [0, i * 22, 0], color: "#ffe6a0", material: "neon", canCollide: true });
      }
    }
  }

  // ---- events in, ticks through -------------------------------------------------------
  function onTouch(event) {
    const s = save();
    switch (event) {
      case "bt_cube":
        if (s.quest.c2) { toast("The cube is spent. Its answer stands open beside you.", "⬛", 3200); return true; }
        if (s.quest.c1) openCube2(); else openCube1();
        return true;
      case "bt_book1":
        if (!s.quest.b1) { s.quest.b1 = true; saveNow(); }
        pagedPanel("📕 The Hermit", BOOK1.map((body, i) => ({ heading: `Page ${i + 1} of 15`, body })), {
          doneLabel: "Close the book",
          onDone: () => { refreshWorld(); toast("Fifteen pages. Those first letters were no accident…", "📕", 4600); },
        });
        return true;
      case "bt_book2":
        if (!s.quest.b2) { s.quest.b2 = true; saveNow(); }
        openDecode();
        return true;
      case "bt_tree":
        if (s.quest.dec) toast("The tree is open. The most annoying climb of your life is inside.", "🌳", 3200);
        else toast("A door with no handle, sealed in bark. Something written might open it.", "🌳", 3200);
        return true;
      case "bt_scope":
        if (!s.quest.dec) { toast("The telescope ignores you. You don't yet know what to look FOR.", "🔭", 3200); return true; }
        openScope();
        return true;
      case "bt_rebirth":
        openRebirth();
        return true;
      case "bt_rocket":
        openRocket();
        return true;
      case "bt_crater":
        if (s.ks) { toast("The crater is empty now. It gave you everything it had.", "🕳️", 3000); return true; }
        showDigButton();
        return true;
      default:
        return false;
    }
  }

  function update(dt) {
    if (Q.digCd > 0) Q.digCd = Math.max(0, Q.digCd - dt);
    for (let i = Q.timers.length - 1; i >= 0; i--) {
      const t = Q.timers[i]; t.t -= dt;
      if (t.t <= 0) { Q.timers.splice(i, 1); try { t.fn(); } catch { /* fine */ } }
    }
    // hide the dig button when its owner wanders off the crater
    if (digBtn) {
      const me = ctx.player.position();
      if ((me[0] - CRATER[0]) ** 2 + (me[2] - CRATER[2]) ** 2 > 36 || me[1] < CRATER[1] - 6) { hideDigButton(); Q.digs = 0; }
    }
    // the rocket ride: up hard for 1.6s, then a swoop to the crater's rim
    if (Q.flight) {
      Q.flight.t += dt;
      const me = ctx.player.position();
      if (Q.flight.t < 1.6) {
        try { ctx.player.teleport([me[0], me[1] + 60 * dt, me[2]], 0); } catch { /* fine */ }
      } else {
        try { ctx.player.teleport([CRATER[0], CRATER[1] + 4, CRATER[2] - 2.5], 0); } catch { /* fine */ }
        toast("Touchdown. This is the spot the stars spelled. Your sword is a shovel now.", "🕳️", 4600);
        sfx("sparkle");
        Q.flight = null;
      }
    }
    // idle spin for the waiting cube (cheap: two parts)
    Q.spin += dt;
    try { ctx.engine.parts.setRotation("bt_cube_body", [0, 25 + Q.spin * 20, 0]); } catch { /* gone */ }
  }

  function dispose() {
    closeOverlay();
    hideDigButton();
    for (const id of Q.dynParts) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
    Q.dynParts.length = 0;
    Q.timers.length = 0;
  }

  // rAF is a forbidden global in game code (04:V6) — a microtask is enough to let the
  // browser apply the pre-transition style before we flip it.
  function requestAnimationFrameSafe(fn) { Promise.resolve().then(fn); }

  return { onTouch, update, refreshWorld, dispose };
}
