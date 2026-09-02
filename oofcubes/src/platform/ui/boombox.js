// src/platform/ui/boombox.js — the boombox and its code box. Spec 16 owns this.
//
// Carried on your back like everything else you pick up, and it takes a code. Entering
// `123456789` plays the chill track (spec 02 §5.5.10). Anything else says it does not
// know that one, rather than silently doing nothing.
//
// Two deliberate limits, both about not making the platform worse for everyone else:
//
//   1. **Only YOU hear it.** The music is played through your own audio service, and the
//      code is not sent to the room. A boombox that broadcast to twenty people would be
//      a way to force sound onto strangers, and there is no mute-that-player control to
//      go with it.
//   2. **It plays over the Place music rather than replacing it**, and the track is
//      written sparse and quiet for exactly that (spec 02 §5.5.10). Stopping the boombox
//      leaves the Place's own music exactly as it was.

import { el, button } from "./kit.js";

// The one code the owner asked for. A map rather than an `if`, so adding a second song
// later is a line of data.
export const BOOMBOX_CODES = Object.freeze({
  "123456789": { track: "chill", title: "Chill" },
});

export function createBoombox(deps = {}) {
  const { audio, toast, onState } = deps;

  // You have to be HOLDING it. Reported by the owner: the code box played music with
  // no boombox equipped, which made the item pointless — the gear was decoration and
  // the button was the whole feature. `isHolding` is supplied by the shell from the
  // avatar's equipped gear slot, so this is the same fact the world is drawing.
  const holding = () => (typeof deps.isHolding === "function" ? !!deps.isHolding() : true);
  const NOT_HOLDING = "Equip the Boombox first — it is in the Catalog under Gear.";
  let playing = null; // the code currently playing, or null

  function play(code) {
    if (!holding()) return { ok: false, error: NOT_HOLDING };
    const entry = BOOMBOX_CODES[String(code).trim()];
    if (!entry) return { ok: false, error: "No song with that code." };
    if (!audio || typeof audio.playMusic !== "function") {
      return { ok: false, error: "Sound is not available." };
    }
    audio.playMusic(entry.track);
    playing = String(code).trim();
    if (typeof onState === "function") onState({ playing, title: entry.title });
    return { ok: true, title: entry.title };
  }

  function stop(placeTrack) {
    if (!playing) return;
    playing = null;
    // Hand the Place its own music back rather than leaving silence behind.
    if (audio && typeof audio.playMusic === "function") audio.playMusic(placeTrack || null);
    if (typeof onState === "function") onState({ playing: null, title: null });
  }

  function open() {
    const panel = deps.openPanel({ title: "Boombox" });
    const body = panel.bodyEl;

    // Say it up front rather than only when Play is pressed: a panel that looks usable
    // and then refuses reads as broken.
    const blurb = el("div", null, holding()
      ? "Type a song code and press Play."
      : NOT_HOLDING);
    blurb.setAttribute("style", "color:var(--oof-text-dim);font-size:var(--oof-size-sm);margin-bottom:8px");

    const input = el("input", "oof-input");
    input.type = "text";
    input.inputMode = "numeric";
    input.placeholder = "song code";
    input.setAttribute("aria-label", "Song code");
    input.setAttribute("style",
      "width:100%;padding:9px 10px;border-radius:var(--oof-radius-md);"
      + "border:1px solid var(--oof-line);background:var(--oof-bg-2);color:var(--oof-text);font:inherit");
    // The engine ignores keys while an input has focus, but stop them here too so a
    // stray Enter never reaches the chat hotkey either.
    for (const evt of ["keydown", "keyup", "keypress"]) {
      input.addEventListener(evt, (e) => e.stopPropagation());
    }
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go(); } });

    const message = el("div", null, "");
    message.setAttribute("role", "status");
    message.setAttribute("style", "min-height:18px;margin-top:8px;font-size:var(--oof-size-sm)");

    function go() {
      const res = play(input.value);
      if (res.ok) {
        message.style.color = "var(--oof-good,#3ddc84)";
        message.textContent = `Playing “${res.title}”.`;
        if (toast) toast(`Boombox: ${res.title}`);
      } else {
        message.style.color = "var(--oof-danger,#e74c3c)";
        message.textContent = res.error;
      }
    }

    const playBtn = button({ label: "Play", variant: "primary", onClick: go });
    const stopBtn = button({
      label: "Stop",
      variant: "secondary",
      onClick: () => {
        stop(deps.placeTrack ? deps.placeTrack() : null);
        message.style.color = "var(--oof-text-dim)";
        message.textContent = "Stopped.";
      },
    });

    const row = el("div", null);
    row.setAttribute("style", "display:flex;gap:6px;margin-top:10px");
    row.append(playBtn, stopBtn);

    body.append(blurb, input, row, message);
    if (playing) {
      input.value = playing;
      message.style.color = "var(--oof-text-dim)";
      message.textContent = `Playing “${BOOMBOX_CODES[playing].title}”.`;
    }
    input.focus();
    return panel;
  }

  return { open, play, stop, playing: () => playing };
}
