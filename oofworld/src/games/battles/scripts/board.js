// src/games/battles/scripts/board.js — Battles. Spec 26 §12: the two lobby leaderboards,
// TOP KILLERS and MOST SWORDS, drawn the way the lifting gym draws its TOP LIFTERS: a
// canvas texture on an unlit box face, repainted only when the rows change. game.js owns
// WHAT the rows are (all-time server rows when signed in, the live room otherwise —
// ARCHITECTURE §9: every name on the board belongs to somebody real); this file only
// builds, paints and disposes.

const TEX_W = 512;
const TEX_H = 640;
const HEADER_H = 110;
const ROW_H = 53;
export const BOARD_ROWS = 10;

const MEDAL = ["#d4af37", "#c8c8cd", "#cd7f32"];

export function createBoards(ctx, spots) {
  const THREE = ctx.engine.THREE;
  const root = new THREE.Group();
  root.name = "bt-boards";
  const boards = [];
  for (const [x, y, z] of spots) {
    const canvas = document.createElement("canvas");
    canvas.width = TEX_W; canvas.height = TEX_H;
    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    const faceMat = new THREE.MeshBasicMaterial({ map: tex }); // unlit: readable in any light
    const sideMat = new THREE.MeshLambertMaterial({ color: "#12101c" });
    const geo = new THREE.BoxGeometry(7, 8.8, 0.25);
    // slots [+x,−x,+y,−y,+z,−z]; the +Z face carries the canvas, yawed to look down +x
    const mesh = new THREE.Mesh(geo, [sideMat, sideMat, sideMat, sideMat, faceMat, sideMat]);
    mesh.position.set(x, y, z);
    mesh.rotation.y = Math.PI / 2;
    root.add(mesh);
    boards.push({ canvas, g: canvas.getContext("2d"), tex, mats: [faceMat, sideMat], geo, lastKey: "" });
  }
  const rootId = ctx.engine.parts.addCustom(root);

  // rows: [{name, value, isPlayer, rank}] — already ranked and capped by the caller.
  function paint(which, title, accent, rows) {
    const b = boards[which];
    if (!b) return;
    const key = title + "|" + rows.map((r) => `${r.rank}:${r.name}:${r.value}:${r.isPlayer ? 1 : 0}`).join(",");
    if (key === b.lastKey) return; // repaint only on change
    b.lastKey = key;
    const g = b.g;
    g.clearRect(0, 0, TEX_W, TEX_H);
    g.fillStyle = "#0e0a18"; g.fillRect(0, 0, TEX_W, TEX_H);
    g.fillStyle = accent;
    g.font = "bold 40px system-ui, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(title, TEX_W / 2, HEADER_H / 2, TEX_W - 24);
    for (let i = 0; i < Math.min(rows.length, BOARD_ROWS); i++) {
      const row = rows[i], y = HEADER_H + i * ROW_H;
      g.fillStyle = i % 2 === 0 ? "#171225" : "#120e1c";
      g.fillRect(0, y, TEX_W, ROW_H);
      g.font = "bold 26px system-ui, sans-serif";
      g.textAlign = "left";
      g.fillStyle = i < MEDAL.length && row.rank <= 3 ? MEDAL[row.rank - 1] : "#9aa3b8";
      g.fillText("#" + row.rank, 14, y + ROW_H / 2);
      g.fillStyle = row.isPlayer ? "#f7c948" : "#f2f4fa";
      g.fillText(row.name, 80, y + ROW_H / 2, 250);
      g.textAlign = "right";
      g.fillText(String(row.value), TEX_W - 14, y + ROW_H / 2, 150);
      if (row.isPlayer) { g.strokeStyle = "#f7c948"; g.lineWidth = 2; g.strokeRect(1, y + 1, TEX_W - 2, ROW_H - 2); }
    }
    if (!rows.length) {
      g.fillStyle = "#6a6180"; g.font = "600 22px system-ui, sans-serif"; g.textAlign = "center";
      g.fillText("nobody yet — go make history", TEX_W / 2, HEADER_H + 80);
    }
    b.tex.needsUpdate = true;
  }

  function dispose() {
    for (const b of boards) { try { b.tex.dispose(); b.mats[0].dispose(); b.mats[1].dispose(); b.geo.dispose(); } catch { /* fine */ } }
    try { ctx.engine.parts.remove(rootId); } catch { /* gone */ }
  }

  return { paint, dispose };
}

// The ranking helper both boards share: sort desc, keep the top BOARD_ROWS, and ALWAYS
// keep the player — past the cut they replace the last row wearing their true rank.
export function rankRows(entries) {
  const rows = entries.slice().sort((a, b) => b.value - a.value);
  const playerRank = rows.findIndex((r) => r.isPlayer) + 1;
  const top = rows.slice(0, BOARD_ROWS).map((r, i) => ({ ...r, rank: i + 1 }));
  if (playerRank > BOARD_ROWS) {
    const me = rows[playerRank - 1];
    top[BOARD_ROWS - 1] = { ...me, rank: playerRank };
  }
  return top;
}
