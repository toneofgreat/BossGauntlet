// src/games/cats/scripts/zones/z7-tower.js - the Monday Tower spiral of zone 7 (cat 90), as pure data.
// It lives apart from z7.js so the layout can be checked numerically (jump gaps, head room) without a
// browser. Zone-local studs; a platform's `y` is its TOP surface. `ry` is the Y rotation in degrees
// (the original's ctx.cf(x, y, z, -theta)).
//
// Port notes (OofWorld physics, ARCHITECTURE §5: gravity 196.2, jump 50, walk 16 -> a 6.37 stud jump
// that carries 8.1 studs on the flat):
//   * stage 4's 18-stud TRUSS climb is six 3-stud steps that keep spiralling (the engine has no
//     climbing);
//   * stage 3's lunch trays carry you, so they are engine moving platforms (out 4 and back, 22 degrees
//     apart: the original's 5 out at 26 degrees left an 8 stud gap whenever both trays were out);
//   * stage 5's laser steps are 4.6 wide (was 4.2) so the safe inner part stays 3.2 wide even with
//     the touch skin round the avatar;
//   * stage 6's long jumps step 24 degrees (was 28): 28 degrees left a 7.6 stud gap against an
//     8.1 stud jump at +1, which only worked with the original character's wider footprint.

export const TOWER = Object.freeze({ CX: 60, CZ: 150, R: 24 });
export const CP_NAMES = Object.freeze([
  "MONDAY 9:00 AM", "MONDAY 9:47 AM (MEETING)", "MONDAY LUNCH (CANCELLED)",
  "MONDAY 3 PM SLUMP", "MONDAY OVERTIME", "MONDAY 11:59 PM",
]);

export function towerLayout() {
  const { CX, CZ, R } = TOWER;
  const out = [];
  let theta = 180, y = 0;
  const at = (r, th) => {
    const a = th * Math.PI / 180;
    return [CX + r * Math.cos(a), CZ + r * Math.sin(a)];
  };
  const plat = (size, kind, extra = {}) => {
    const [x, z] = at(R, theta);
    const e = { kind, x, y, z, size: [size, 1, size], ry: -theta, theta, ...extra };
    out.push(e);
    return e;
  };
  const checkpoint = (i) => plat(8, "checkpoint", { cp: i });

  checkpoint(1);
  for (let k = 0; k < 10; k++) { theta += 17; y += 2.4; plat(5, "step"); }
  theta += 20; y += 2;
  checkpoint(2);
  for (let i = 1; i <= 8; i++) {
    theta += 19; y += 2.2;
    plat(6, "step");
    const side = i % 2 === 0 ? 1 : -1;
    const [x, z] = at(R + side * 1.5, theta);
    out.push({ kind: "strip", x, y: y + 0.3, z, size: [3, 0.3, 6], ry: -theta, theta });
  }
  theta += 20; y += 2;
  checkpoint(3);
  for (let k = 0; k < 5; k++) {
    theta += 22; y += 1.5;
    const a = theta * Math.PI / 180;
    plat(5, "tray", { offset: [Math.cos(a) * 4, 0, Math.sin(a) * 4] });
  }
  theta += 20; y += 2;
  checkpoint(4);
  // the truss, as steps
  for (let k = 0; k < 6; k++) { theta += k === 0 ? 16 : 11; y += 3; plat(4.5, "step"); }
  for (let k = 0; k < 8; k++) { theta += 14; y += 1.5; plat(1.8, "step"); }
  theta += 18; y += 2;
  checkpoint(5);
  for (let i = 1; i <= 10; i++) {
    theta += 16; y += 2.6;
    if (i % 3 === 0) {
      plat(4.6, "step");
      const [x, z] = at(R + 1.6, theta);
      out.push({ kind: "laser", x, y: y + 0.3, z, size: [1.4, 0.3, 4.6], ry: -theta, theta });
    } else plat(2.6, "step");
  }
  theta += 18; y += 2;
  checkpoint(6);
  for (let k = 0; k < 5; k++) { theta += 24; y += 1; plat(4, "tuesday"); }
  {
    const [x, z] = at(18, theta);
    out.push({ kind: "ledge", x, y: y + 0.5, z, size: [3, 1, 3], ry: -theta, theta });
  }
  const topY = y + 1;
  return { items: out, topY };
}
