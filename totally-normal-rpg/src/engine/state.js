// state.js - the shared state default (CONTRACT 4). Pure data, safe to import in node.

export function createState() {
  return {
    v: 1,
    profile: {
      name: "", onlineName: "", secrets: {},
      endings: {},
      runs: 0, playMs: 0, signReads: 0, npcsTalked: {}
    },
    settings: {
      reduceFlashing: false, master: 0.8, music: 0.7, sfx: 0.9, sensitivity: 1, invertY: false,
      pointerLock: true, quality: "auto", showFps: false, hints: true
    },
    run: {
      cycle: 0, level: 0, phase: "intro",
      equip: { sword: "fists", armor: null, morph: null, crown: null, charm: null },
      owned: {},
      kills: {},
      villagerNoWood: 0,
      flags: {},
      buried: {},
      deaths: 0, startedAt: 0, kingWins: 0
    },
    choiceSnapshot: null,
    player: { hp: 100, maxHp: 100, alive: true, invuln: 0, lastHurt: 0, lives: 0 },
    world: { zone: "lobby", region: "main" },
    ui: { screen: "title", modal: false },
    rt: { playing: false, paused: false, timeScale: 1, god: false, fast: 1, cinematic: false, idleLock: false }
  };
}
