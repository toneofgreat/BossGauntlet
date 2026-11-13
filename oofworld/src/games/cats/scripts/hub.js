// src/games/cats/scripts/hub.js - the runtime half of the Cat Plaza (spec 28 §4). place.json holds
// every static part of the hub (floor, fountain, portals, walls, decor) and gets instanced; this
// file adds what place.json cannot: the giant cat statue (a catkit Group), and every piece of
// TEXT - the plaque, each portal's name and "Found 3/14" / "LOCKED: need 6" line, the difficulty
// chart wall, the how-to board and your own progress board - as canvas planes redrawn only when
// your cat count changes. Nothing here invents a player: the progress board is yours alone.
//
//   createHub(ctx, K, deps) -> { refresh(), update(dt), tap(x, y) -> bool, dispose() }
//   deps = { has(n), count(), zoneUnlocked(k) }

import * as R from "./roster.js";

const DEG = Math.PI / 180;

export function createHub(ctx, K, deps) {
  const THREE = ctx.engine.THREE;
  const parts = ctx.engine.parts;
  const ids = [];
  const disposables = [];
  const boards = [];

  // a canvas plane with its own texture; matrix = world placement of the plane centre
  function board(wStud, hStud, matrix, pps, draw) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(wStud * pps);
    canvas.height = Math.round(hStud * pps);
    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const geo = new THREE.PlaneGeometry(wStud, hStud);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(matrix);
    mesh.matrixWorldNeedsUpdate = true;
    ids.push(parts.addCustom(mesh));
    disposables.push(tex, mat, geo);
    const b = {
      canvas,
      redraw() {
        const g = canvas.getContext("2d", { willReadFrequently: true });
        g.clearRect(0, 0, canvas.width, canvas.height);
        draw(g, canvas.width, canvas.height);
        tex.needsUpdate = true;
      },
    };
    b.redraw();
    boards.push(b);
    return b;
  }
  // the plane faces -Z of a fixture whose centre is `pos`, rotated yawDeg about Y
  function frontOf(pos, size, yawDeg) {
    const m = new THREE.Matrix4().makeRotationY((yawDeg || 0) * DEG);
    m.setPosition(pos[0], pos[1], pos[2]);
    const off = new THREE.Matrix4().makeTranslation(0, 0, -size[2] / 2 - 0.05);
    const flip = new THREE.Matrix4().makeRotationY(Math.PI); // PlaneGeometry faces +Z
    return m.multiply(off).multiply(flip);
  }

  const fit = (g, text, x, y, w, h, color, opts = {}) => {
    const c = document.createElement("canvas");
    c.width = Math.max(8, Math.round(w));
    c.height = Math.max(8, Math.round(h));
    K.drawFitText(c, text, color, null, opts);
    g.drawImage(c, x, y);
  };

  // ---- the statue ------------------------------------------------------------------------------
  const c = K.cat({ name: "Statue", color: K.rgb(255, 160, 70), pattern: "stripes", color2: K.rgb(255, 225, 170), eyes: "big", mouth: "w", tail: "puffy" });
  K.acc.crown(c);
  K.acc.cape(c, { color: K.rgb(170, 30, 60) });
  const statue = K.finish(c.model, { fit: 24 });
  const ss = statue.userData.size;
  statue.position.set(0, R.HUB.statueTop + ss.y / 2, 0);
  statue.rotation.y = Math.PI; // faces the spawn (+Z)
  ids.push(parts.addCustom(statue));
  const statueCol = parts.create({
    shape: "box", size: [ss.x * 0.8, ss.y, ss.z * 0.8], position: [0, R.HUB.statueTop + ss.y / 2, 0],
    transparency: 1, canCollide: true,
  });
  ids.push(statueCol);
  let statueT = 0;

  const P = R.HUB.plaque;
  board(P.size[0], P.size[1], frontOf(P.pos, P.size, 180), 40, (g, w, h) => {
    fit(g, "SIR WHISKERS THE FIRST\nFounder of Cat Plaza", 0, 0, w, h, "#503200");
  });

  // ---- portals ----------------------------------------------------------------------------------
  const portalBoards = [];
  for (let k = 1; k < R.ZONES.length; k++) {
    const z = R.ZONES[k];
    const d = R.portalDir(k);
    const base = [d[0] * R.PORTAL_DIST, 0, d[2] * R.PORTAL_DIST];
    const yaw = R.portalYaw(k);
    const at = (local) => {
      const v = new THREE.Vector3(...local).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw * DEG);
      return [base[0] + v.x, base[1] + v.y, base[2] + v.z];
    };
    const S = R.HUB.signLocal;
    board(S.size[0], S.size[1], frontOf(at(S.pos), S.size, yaw), 24, (g, w, h) => {
      fit(g, `${k}. ${z.name}`, 0, 0, w, h * 0.6, z.color === "#191923" ? "#9d9dff" : z.color, { stroke: "#000000" });
      fit(g, z.unlock > 0 ? `Requires ${z.unlock} cats  |  Cats #${z.first}-${z.last}` : `Free!  |  Cats #${z.first}-${z.last}`, 0, h * 0.6, w, h * 0.4, "#ffffff");
    });
    const D = R.HUB.doorLocal;
    const progress = board(D.size[0], D.size[1] * 0.3, frontOf(at([D.pos[0], D.pos[1] - D.size[1] * 0.3, D.pos[2]]), D.size, yaw), 24, (g, w, h) => {
      let found = 0;
      for (let n = z.first; n <= z.last; n++) if (deps.has(n)) found++;
      const total = z.last - z.first + 1;
      const open = deps.zoneUnlocked(k);
      const text = open ? (found >= total ? `ALL ${total} FOUND!` : `Found ${found}/${total}`) : `LOCKED: need ${z.unlock}`;
      fit(g, text, 0, 0, w, h, open ? "#ffffff" : "#ffdddd", { stroke: "#000000" });
    });
    portalBoards.push(progress);
  }

  // ---- the difficulty chart wall --------------------------------------------------------------------
  const C = R.HUB.chart;
  const chart = board(C.size[0], C.size[1], frontOf(C.pos, C.size, 0), 15, (g, w, h) => {
    g.fillStyle = "#19162a";
    g.fillRect(0, 0, w, h);
    fit(g, "DIFFICULTY CHART", 0, h * 0.005, w, h * 0.075, "#ffdc78");
    const n = R.TIERS.length - 1;
    const top = h * 0.09, rowH = (h * 0.9) / n;
    for (let t = 1; t <= n; t++) {
      const tier = R.TIERS[t];
      const y = top + (t - 1) * rowH;
      g.fillStyle = "#282438";
      g.fillRect(w * 0.02, y, w * 0.96, rowH * 0.92);
      g.fillStyle = tier.color;
      g.fillRect(w * 0.02, y, w * 0.34, rowH * 0.92);
      g.strokeStyle = "rgba(255,255,255,0.4)";
      g.lineWidth = 2;
      g.strokeRect(w * 0.02, y, w * 0.34, rowH * 0.92);
      fit(g, `${t}. ${tier.name}`, w * 0.025, y, w * 0.33, rowH * 0.92, tier.text);
      fit(g, tier.blurb, w * 0.37, y, w * 0.43, rowH * 0.92, "#ffffff", { align: "left" });
      let f = 0;
      for (let m = tier.first; m <= tier.last; m++) if (deps.has(m)) f++;
      const range = tier.first === tier.last ? `#${tier.first}` : `#${tier.first}-${tier.last}`;
      fit(g, `${range}  ${f}/${tier.count}`, w * 0.8, y, w * 0.17, rowH * 0.92, f >= tier.count ? "#7dff8a" : "#c8c8d2");
    }
  });

  // ---- boards ---------------------------------------------------------------------------------------
  const H = R.HUB.howto;
  board(H.size[0], H.size[1], frontOf(H.pos, H.size, R.yawToward(-H.pos[0], -H.pos[2]) + 180), 20, (g, w, h) => {
    g.fillStyle = "#461e3c";
    g.fillRect(0, 0, w, h);
    fit(g, "FIND THE CATS!", 0, 0, w, h * 0.15, "#ffb4e6");
    fit(g, "100 cats are hiding in 7 zones.\nTouch or tap a cat to collect it.\nFind cats to unlock new portals.\nCaged cats need a puzzle solved first.\nSome cats are invisible... until they aren't.\nINDEX = your cats.  CHART = difficulties.", w * 0.04, h * 0.17, w * 0.92, h * 0.8, "#ffffff");
  });
  const PR = R.HUB.progress;
  const progressBoard = board(PR.size[0], PR.size[1], frontOf(PR.pos, PR.size, R.yawToward(-PR.pos[0], -PR.pos[2]) + 180), 20, (g, w, h) => {
    g.fillStyle = "#1e2846";
    g.fillRect(0, 0, w, h);
    fit(g, `YOUR CATS: ${deps.count()}/${R.TOTAL}`, 0, 0, w, h * 0.14, "#ffdc78");
    const rows = R.ZONES.length - 1;
    for (let k = 1; k <= rows; k++) {
      const z = R.ZONES[k];
      let f = 0;
      for (let n = z.first; n <= z.last; n++) if (deps.has(n)) f++;
      const lock = deps.zoneUnlocked(k) ? "" : " 🔒";
      fit(g, `${k}. ${z.name}${lock}   ${f}/${z.last - z.first + 1}`, w * 0.05, h * (0.16 + (k - 1) * 0.12), w * 0.9, h * 0.1, "#ffffff", { align: "left" });
    }
  });

  return {
    refresh() {
      for (const b of portalBoards) b.redraw();
      chart.redraw();
      progressBoard.redraw();
    },
    update(dt) {
      statueT += dt;
      statue.rotation.y = Math.PI + Math.sin(statueT * 0.4) * 0.25;
    },
    // tapping the statue: it meows
    tap(x, y) {
      const p = ctx.engine.camera.worldToScreen([0, R.HUB.statueTop + ss.y / 2, 0]);
      const q = ctx.engine.camera.worldToScreen([0, R.HUB.statueTop + ss.y, 0]);
      if (!p || !q) return false;
      const r = Math.max(30, Math.hypot(q[0] - p[0], q[1] - p[1]));
      if (Math.hypot(x - p[0], y - p[1]) > r) return false;
      try { ctx.engine.audio.playSfx("chime", { pitch: 1.5 }); } catch { /* optional */ }
      try { ctx.services.ui.toast("MEOW. (Sir Whiskers approves.)", { icon: "🐱" }); } catch { /* optional */ }
      return true;
    },
    dispose() {
      for (const id of ids) { try { parts.remove(id); } catch { /* gone */ } }
      K.disposeGroup(statue);
      for (const d of disposables) { try { d.dispose(); } catch { /* fine */ } }
      ids.length = 0;
    },
  };
}
