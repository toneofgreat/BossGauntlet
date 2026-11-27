// AUDIO - graph.js: the mixing graph shared by the live context and offline renders.
//
//   track dry  -> duck  ---------------------------\
//   track wet  -> duckW -> musicReverb ------------> musicSum -> musicVol -\
//   sting dry  ------------------------------------/                         \
//   sting wet  -> musicReverb                                                  > muffle(lowpass) -> master
//   sfx dry    ---------------------------------------> sfxVol ---------------/                      |
//   sfx wet    -> sfxReverb ---------------------------/ ^                                          limiter
//   voice      ------------------------------------------/                                          (-6 dB)
//   ui         -> uiVol (not muffled: tinnitus + menus stay clear) ---------------------> master     |
//                                                                                            destination
import { gain, filter } from "./synth.js";
import { createReverb } from "./reverb.js";

// lite: shorter impulse responses (phones / quality 0) - the convolvers are the biggest fixed DSP cost
export function createGraph(ac, { limiter = true, lite = false } = {}) {
  const master = gain(ac, 0.8);
  let comp = null;
  if (limiter) {
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.knee.value = 1;
    comp.ratio.value = 20;
    comp.attack.value = 0.002;
    comp.release.value = 0.2;
    const safety = gain(ac, 0.93, ac.destination);
    master.connect(comp);
    comp.connect(safety);
  } else master.connect(ac.destination);

  const muffle = filter(ac, "lowpass", 20000, 0.6, master);
  const musicVol = gain(ac, 0.6, muffle);
  const musicSum = gain(ac, 1, musicVol);
  const duck = gain(ac, 1, musicSum);
  const musicRev = createReverb(ac, lite ? { sec: 2.2, rt60: 2.2, damp: 0.6, pre: 0.02, seed: 3 } : { sec: 3.8, rt60: 3.3, damp: 0.6, pre: 0.02, seed: 3 });
  musicRev.connect(musicSum);
  const duckW = gain(ac, 1, musicRev);
  const stingIn = gain(ac, 1, musicSum);
  const stingWet = gain(ac, 1, musicRev);

  const sfxVol = gain(ac, 0.9, muffle);
  const sfxIn = gain(ac, 1, sfxVol);
  const sfxRev = createReverb(ac, lite ? { sec: 1.2, rt60: 1.1, damp: 0.7, pre: 0.01, seed: 9 } : { sec: 2.2, rt60: 1.6, damp: 0.7, pre: 0.01, seed: 9 });
  sfxRev.connect(sfxVol);
  const sfxRevIn = gain(ac, 1, sfxRev);
  const voiceIn = gain(ac, 1, sfxVol);

  const uiVol = gain(ac, 0.6, master);
  const uiIn = gain(ac, 1, uiVol);

  return { ac, master, comp, muffle, musicVol, musicSum, duck, duckW, musicRev, stingIn, stingWet, sfxVol, sfxIn, sfxRev, sfxRevIn, voiceIn, uiVol, uiIn };
}
