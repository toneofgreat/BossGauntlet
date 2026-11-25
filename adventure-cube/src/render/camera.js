// camera.js - 2D camera shared by play mode and build mode. NO DOM (a guarded matchMedia probe only).
// The API below is frozen (CONTRACT.md section 5.2).
// camera.x / camera.y = WORLD px at the CENTER of the screen. camera.zoom = CSS px per world px.
// Additions (compatible): cam.bottomPad = CSS px covered at the bottom by touch buttons (auto on coarse pointers);
// play-mode framing keeps the player above it, and clamp() lets the view go that far below the level bottom.
// cam.topPad = CSS px covered at the top by the HUD (play mode sets it; 0 = off). follow() then lets the view rise
// above the level top so the player (who can jump above row 0) always stays at least topPad + 1 tile below the edge.
import { T } from "../sim/constants.js";

export const VIEW_TILES = 14; // the shorter screen side shows about this many tiles in play mode

const coarse = () => { try { return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches; } catch (e) { return false; } };

export function createCamera() {
  const cam = {
    x: 0, y: 0, zoom: 1, viewW: 960, viewH: 540, look: 0, lookY: 0, shake: 0,
    bottomPad: coarse() ? 110 : 0, topPad: 0,
    setViewport(w, h) { cam.viewW = w; cam.viewH = h; cam.zoom = cam.fitZoom(); },
    fitZoom() { return Math.max(0.5, Math.min(cam.viewH, cam.viewW) / (VIEW_TILES * T)); },
    // half extents of the view in world px
    get halfW() { return cam.viewW / 2 / cam.zoom; },
    get halfH() { return cam.viewH / 2 / cam.zoom; },
    clamp(level) {
      const W = level.w * T, H = level.h * T, hw = cam.halfW, hh = cam.halfH, pad = cam.bottomPad / cam.zoom;
      cam.x = W <= hw * 2 ? W / 2 : Math.min(Math.max(cam.x, hw), W - hw);
      cam.y = H + pad <= hh * 2 ? H + pad - hh : Math.min(Math.max(cam.y, hh), H + pad - hh);
    },
    // follow the player center (px,py) with velocity vx; dt in seconds
    follow(level, px, py, vx, dt) {
      dt = Math.min(dt, 0.1);
      cam.look += ((vx * 18) - cam.look) * Math.min(1, dt * 2.5);
      // gentle vertical look-ahead: peek down while falling fast
      const vy = cam._py === undefined ? 0 : (py - cam._py) / Math.max(dt, 1e-3);
      cam._py = py;
      const want = vy > 300 ? Math.min(90, (vy - 300) * 0.15) : 0;
      cam.lookY += (want - cam.lookY) * Math.min(1, dt * 3);
      const tx = px + cam.look, ty = py - cam.halfH * 0.15 + cam.lookY + (cam.bottomPad * 0.5) / cam.zoom;
      const k = 1 - Math.exp(-dt * 7);
      cam.x += (tx - cam.x) * k;
      // vertical: a dead zone so small hops do not bob the view, faster catch-up when far away
      const dy = ty - cam.y, dz = cam.halfH * 0.12;
      if (Math.abs(dy) > dz) cam.y += (dy - Math.sign(dy) * dz) * (1 - Math.exp(-dt * (Math.abs(dy) > cam.halfH * 0.6 ? 9 : 4.5)));
      cam.clamp(level);
      headroom(py);
    },
    snap(level, px, py) { cam.look = 0; cam.lookY = 0; cam._py = undefined; cam.x = px; cam.y = py - cam.halfH * 0.15 + (cam.bottomPad * 0.5) / cam.zoom; cam.clamp(level); headroom(py); },
    // build-mode helpers
    pan(dxCss, dyCss) { cam.x -= dxCss / cam.zoom; cam.y -= dyCss / cam.zoom; },
    zoomAt(factor, sx, sy) {
      const wx = cam.x + (sx - cam.viewW / 2) / cam.zoom, wy = cam.y + (sy - cam.viewH / 2) / cam.zoom;
      cam.zoom = Math.max(0.25, Math.min(4, cam.zoom * factor));
      cam.x = wx - (sx - cam.viewW / 2) / cam.zoom; cam.y = wy - (sy - cam.viewH / 2) / cam.zoom;
    },
    screenToWorld(sx, sy) { return { x: cam.x + (sx - cam.viewW / 2) / cam.zoom, y: cam.y + (sy - cam.viewH / 2) / cam.zoom }; },
    worldToScreen(wx, wy) { return { x: (wx - cam.x) * cam.zoom + cam.viewW / 2, y: (wy - cam.y) * cam.zoom + cam.viewH / 2 }; },
  };
  // play mode: after clamping, raise the view (past the level top if needed) so the player's center stays at least
  // topPad css px + 0.6 tile below the top edge, i.e. never under the HUD
  function headroom(py) {
    if (!(cam.topPad > 0)) return;
    cam.y = Math.min(cam.y, py + cam.halfH - cam.topPad / cam.zoom - T * 0.6);
  }
  return cam;
}
