// cases for modtest-l12.cjs: [name, page js, wait ms]. In the js: d = __platy, ctx, M = a scratch object.
const V = "const V = M.V || (M.V = ctx.shared('volcano', () => M.mod.createVolcano(ctx)));";
const loadV = "M.mod = M.mod || await import('/src/volcano.js');" + V;
const shot = (pos, look) => "ctx.cinema.shot({ pos: [" + pos + "], look: [" + look + "] });";
module.exports = {
  dbg: [
    ["a", loadV + "ctx.setWorld(V); V.setScene('arena'); d.tp(0,-16,0);" + shot("-12, 3, -20", "-18, -1, -10") + "M.r = JSON.stringify({cool: V.group.getObjectByName('lake').material.uniforms.uCool.value, glow: V.group.getObjectByName('lake').material.uniforms.uGlow.value, fog: ctx.scene ? 1 : 0}); console.log('[m] ' + M.r);", 1500],
    ["b", "const L = M.V.group.getObjectByName('lake'); L.material.fog = false; L.material.needsUpdate = true;", 1200],
  ],
  volcano: [
    ["slope", loadV + "ctx.setWorld(V); V.setScene('slope'); const p = V.P.spawn; d.tp(p.x, p.z + 18, 0);" + shot("V.pathX(4)+3, V.heightAt(3,4)+3.2, 4", "V.pathX(40), V.heightAt(V.pathX(40),40)+1, 40"), 2500],
    ["slope-side", loadV + "d.tp(V.pathX(50), 47, 0);" + shot("V.pathX(44)+6, V.heightAt(0,44)+4, 44", "V.pathX(58)-6, V.heightAt(0,58)+0.5, 58"), 1800],
    ["shrine", loadV + "const p = V.P.shrine; d.tp(p.x, p.z, 0); V.runes.light(0, true); V.runes.light(2, true);" + shot("p.x+5, p.y+3.5, p.z-5", "V.P.bed.x, V.P.bed.y+0.5, V.P.bed.z"), 1800],
    ["cone", loadV + shot("V.pathX(90), V.heightAt(0,90)+2, 90", "0, 120, 250"), 1500],
    ["cell", loadV + "V.setScene('cell'); const p = V.P.rim; d.tp(p.x, p.z, 0);" + shot("6, 5, -60", "0, 2, 0"), 2200],
    ["cell-cage", loadV + "V.cageWalk.rise(0); V.cage.lower(1, 0); d.tp(0, -20, 0);" + shot("5, 4, -12", "0, 2, 0"), 1800],
    ["arena", loadV + "V.setScene('arena'); V.resetArena(); const p = V.P.arenaStart; d.tp(p.x, p.z, 0);" + shot("0, 7, -26", "0, 2, 0") + "V.erupt(0, 4, 1);", 1500],
    ["lava-close", loadV + shot("-12, 3, -20", "-18, -1, -10"), 1200],
    ["arena-ring", loadV + "V.setRing(1, 0); V.setLava(0.4, 0); for (let i = 0; i < 4; i++) V.setUpdraft(i, true); d.tp(V.islands[0].x, V.islands[0].z, 0);" + shot("0, 14, -34", "0, 3, 6"), 2000],
    ["cool", loadV + "V.setScene('cool'); V.setRing(0, 0); V.setLava(0, 0); d.tp(V.islands[0].x, V.islands[0].z, 0);" + shot("0, 8, -28", "0, 2, 4"), 2200],
  ],
};
const loadB = "M.mod = M.mod || await import('/src/volcano.js'); M.mg = M.mg || await import('/src/magmor.js');" + V + "const B = M.B || (M.B = ctx.shared('magmor', () => M.mg.createMagmor(ctx, V))); if (!M.tick) { M.tick = 1; const f = () => { B.update(1/60); requestAnimationFrame(f); }; f(); }";
module.exports.magmor = [
  ["stand", loadB + "ctx.setWorld(V); V.setScene('arena'); B.reset(0); B.group.visible = true; d.tp(V.islands[0].x, V.islands[0].z, 0);" + shot("0, 6, -30", "0, 14, 8"), 2500],
  ["slam", loadB + "B.start(0);" + shot("14, 9, -24", "0, 8, 0"), 3200],
  ["close", loadB + shot("6, 10, -8", "0, 18, 8"), 1500],
  ["phase2", loadB + "B.reset(1); B.start(1);" + shot("-10, 10, -30", "0, 10, 6"), 5000],
  ["phase3", loadB + "B.reset(2); B.start(2); d.tp(V.islands[3].x, V.islands[3].z, 0); B.openCore(5);" + shot("-6, 16, -14", "0, 14, 8"), 3500],
  ["cool", loadB + "B.coolDown(3);" + shot("4, 8, -30", "0, 10, 8"), 7000],
];
