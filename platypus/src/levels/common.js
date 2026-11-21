// common.js - things more than one level shares. Always fetch shared actors through these helpers so
// every level gets the SAME instance (one set of GPU resources) however the levels are visited.
import { createWizard } from "../wizard.js";
import { createDummy } from "../actors.js";

// Wizard Wobble (level 1 and level 5). The level must add `wizard.group` to its own world root in enter().
export function getWizard(ctx) {
  return ctx.shared("wizard", () => {
    const THREE = ctx.THREE;
    const wizard = createWizard(THREE);
    // soft glow at the crystal (one sprite, no light)
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const g = cv.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.25, "rgba(190,170,255,.55)");
    gr.addColorStop(1, "rgba(150,120,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.75, fog: false }));
    glow.scale.setScalar(0.42);
    wizard.staffTip.add(glow);
    return wizard;
  });
}

// Training dummies (level 1 uses 0..3, level 5 uses 0). Add `dummy.group` to your world root in enter().
export function getDummy(ctx, i) {
  return ctx.shared("dummy" + i, () => createDummy(ctx.THREE));
}
