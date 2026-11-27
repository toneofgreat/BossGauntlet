// dialogue.js - runs NPC conversations through ui.dialogue (CONTRACT 9, 12). Lines live in lines.js.
import { getDialogue, TALK_KEYS, SPEAKERS } from "./lines.js";
import { phaseIndex } from "./phases.js";
import { fmt, defaultNeeds, defaultRecs } from "./objectives.js";

// talk id -> WORLD body id
export const BODY = Object.freeze({ fydor: "fydorIdle", myles: "mylesIdle" });
const POST_KING = phaseIndex("postKing"), CYCLE1 = phaseIndex("ng");

export function createDialogue(ctx, story) {
  let talking = null;

  function flagKey(id) { return "story.talk." + id; }

  function num(fn, arg, dflt) {
    const c = ctx.combat;
    try { if (c && c[fn]) { const v = c[fn](arg); if (typeof v === "number" && isFinite(v) && v > 0) return v; } }
    catch (e) { /* */ }
    return dflt;
  }

  function context(id) {
    const s = ctx.state, run = s.run, prof = s.profile, kills = run.kills || {}, sec = prof.secrets || {};
    const cycle = run.cycle | 0, pi = phaseIndex(run.phase);
    let level = run.level || 0;
    try { if (ctx.combat && ctx.combat.level) level = ctx.combat.level(); } catch (e) { /* */ }
    const dn = defaultNeeds(cycle), dr = defaultRecs(cycle);
    const has = (iid) => { try { const c = ctx.combat; return !!(c && c.has && (c.has(iid) || c.has("bad_" + iid))); } catch (e) { return false; } };
    const area2Need = num("need", "area2", dn.area2), kingNeed = num("need", "kingPortal", dn.kingPortal);
    const guardRec = num("rec", "fydor", dr.guards);
    return {
      name: prof.name || "traveller", cycle, phase: run.phase, pi,
      post: cycle === 0 && pi >= POST_KING && pi < CYCLE1,
      level, talks: (run.flags && run.flags[flagKey(id)]) | 0,
      guardsBeaten: (kills.fydor | 0) > 0 || (kills.myles | 0) > 0 || has("iron_sword"),
      ratKingBeaten: (kills.ratKing | 0) > 0,
      kingBeaten: (run.kingWins | 0) > 0,
      kittens: !!sec.kittens, catBeaten: (kills.cat | 0) > 0 || !!sec.catBoss,
      rookieBeaten: (kills.rookie | 0) > 0 || !!sec.rookieBoss,
      locket: !!sec.fydorLocket || has("fydors_locket"), letter: !!sec.mylesLetter || has("mylesletter"),
      signReads: prof.signReads | 0,
      area2Need, area2NeedText: fmt(area2Need), kingNeed, kingNeedText: fmt(kingNeed),
      guardRec, guardRecText: "Lv " + fmt(guardRec)
    };
  }

  function bodyOf(id) {
    const w = ctx.world;
    try { return w && w.npc ? w.npc(BODY[id] || id) : null; } catch (e) { return null; }
  }

  function markTalked(id) {
    const s = ctx.state, prof = s.profile;
    const fl = s.run.flags || (s.run.flags = {});
    fl[flagKey(id)] = (fl[flagKey(id)] | 0) + 1;
    if (TALK_KEYS.indexOf(id) >= 0) {
      const t = prof.npcsTalked || (prof.npcsTalked = {});
      t[id] = true;
      let all = true;
      for (let i = 0; i < TALK_KEYS.length; i++) if (!t[TALK_KEYS[i]]) { all = false; break; }
      if (all) story.secret("allNpcs");
    }
  }

  async function doAction(action, choice) {
    const c = ctx.combat, ui = ctx.ui;
    if (action === "shop") { if (ui && ui.openMenu) ui.openMenu("shop"); return; }
    if (action === "fightGuards" && choice === 0) { if (c && c.startFight) c.startFight("guards"); return; }
    if (action === "fightRookie" && choice === 0) { if (c && c.startFight) c.startFight("rookie"); return; }
  }

  /** talk to an NPC (talk ids: bram nessa tobin ilsa pell odo wren fydor myles rookie sign) -> choice index | -1 */
  async function talk(id) {
    if (talking) return -1;
    const ui = ctx.ui;
    if (!ui || !ui.dialogue) return -1;
    talking = id;
    const body = bodyOf(id);
    try {
      if (id === "sign") ctx.state.profile.signReads = (ctx.state.profile.signReads | 0) + 1;
      const c = context(id);
      const d = getDialogue(id, c);
      if (!d) return -1;
      markTalked(id);
      ctx.bus.emit("npc:talk", { npc: id });
      if (body) {
        try { const pl = ctx.engine && ctx.engine.player; if (pl && body.lookAt) body.lookAt(pl.position); if (body.play) body.play("talk"); }
        catch (e) { /* */ }
      }
      let choice = -1;
      try { choice = await ui.dialogue({ speaker: d.speaker, lines: d.lines, choices: d.choices, voice: d.voice }); }
      catch (e) { console.warn("[story] dialogue", e); }
      if (id === "sign" && c.signReads >= 5) story.secret("normalSign");
      if (d.action) await doAction(d.action, choice);
      try { ctx.save && ctx.save.write && ctx.save.write(); } catch (e) { /* */ }
      return typeof choice === "number" ? choice : -1;
    } catch (e) {
      console.warn("[story] talk", id, e);
      return -1;
    } finally {
      if (body) { try { if (body.lookAt) body.lookAt(null); if (body.play) body.play("idle"); } catch (e) { /* */ } }
      talking = null;
    }
  }

  /** a text panel without an NPC (letters, portraits). speaker may be "" */
  async function read(speaker, lines) {
    const ui = ctx.ui;
    if (!ui || !ui.dialogue || talking) return -1;
    talking = "read";
    try { return await ui.dialogue({ speaker: speaker || "", lines, voice: { kind: "blip", pitch: 1 } }); }
    catch (e) { console.warn("[story] read", e); return -1; }
    finally { talking = null; }
  }

  return { talk, read, context, get talking() { return talking; }, speakerName: (id) => SPEAKERS[id] || id };
}
