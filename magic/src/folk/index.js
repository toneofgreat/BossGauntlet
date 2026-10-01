/* ===========================================================================
   folk/index.js - who you meet, chapter by chapter. The files beside this one
   are pure data: no imports, no geometry, no positions. The engine in
   ../folk.js decides where a person can actually stand.
   ========================================================================= */
import g1 from './g1.js';
import g2 from './g2.js';
import g3 from './g3.js';
import g4 from './g4.js';

export const FOLK = Object.assign({}, g1, g2, g3, g4);
export function castFor(id) { return FOLK[id] || []; }
