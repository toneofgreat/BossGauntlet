/* Platyfy home-page background: a field of scattered, (attempted) photo-real pigs.
 *
 * The odds are PER VISIT, not per slot: each page view rolls once. 1 in 1000 visits hide a
 * single loaf of bread somewhere in the field, otherwise 1 in 200 visits hide a single dog,
 * and every other visit is all pigs. (Rolling every slot would put a dog on ~half of all
 * desktop visits, since a desktop layout has ~140 slots.) The roll is kept across resizes. The animals are hand-built SVG (gradients, soft shadows,
 * feTurbulence skin / fur / crust texture) - no network images. Each distinct sprite is
 * rasterised ONCE, then everything is stamped into a single fixed <canvas> behind the
 * page, so there is one layer and no live SVG filters while scrolling.
 * New random layout and new random pig mix on every visit.
 */
(function () {
  'use strict';

  var P_BREAD = 1 / 1000;
  var P_DOG = 1 / 200;
  // One uniform roll per VISIT (see init). Bread takes [0, 1/1000); dog takes the next 1/200;
  // everything else is a pig. So P(bread)=0.001, P(dog)=0.005, P(all pigs)=0.994.
  function pickKind(r) {
    if (r < P_BREAD) return 'bread';
    if (r < P_BREAD + P_DOG) return 'dog';
    return 'pig';
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { pickKind: pickKind, P_BREAD: P_BREAD, P_DOG: P_DOG };
  }
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var VW = 260, VH = 180, GROUND = 158;      // every sprite lives in this viewBox
  var RES = 1.3;                             // bake scale: biggest on-screen sprite is ~190 device px wide

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function f1(n) { return Math.round(n * 10) / 10; }

  /* ---------- tiny SVG helpers ---------- */
  function stops(list) {
    return list.map(function (s) {
      return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' +
        (s[2] != null ? ' stop-opacity="' + s[2] + '"' : '') + '/>';
    }).join('');
  }
  function radial(id, cx, cy, r, list, extra) {
    return '<radialGradient id="' + id + '" cx="' + cx + '" cy="' + cy + '" r="' + r + '"' +
      (extra || '') + '>' + stops(list) + '</radialGradient>';
  }
  function linear(id, x1, y1, x2, y2, list, extra) {
    return '<linearGradient id="' + id + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"' +
      (extra || '') + '>' + stops(list) + '</linearGradient>';
  }
  function blurF(id, sd) {
    return '<filter id="' + id + '" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="' + sd + '"/></filter>';
  }
  function svgDoc(defs, body) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + VW + ' ' + VH + '" width="' + Math.round(VW * RES) +
      '" height="' + Math.round(VH * RES) + '"><defs>' + defs + '</defs>' + body + '</svg>';
  }
  // rotate point (x,y) by deg about (cx,cy) - same convention as SVG rotate()
  function rot(x, y, deg, cx, cy) {
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy;
    return [cx + dx * c - dy * s, cy + dx * s + dy * c];
  }

  // Skin texture: fractal noise -> embossed by a distant light -> multiplied onto the
  // artwork, clipped to its own alpha. Gives pores / bumps instead of flat vector fill.
  function skinFilter(id, seed, freq, bump, gain) {
    return '<filter id="' + id + '" filterUnits="userSpaceOnUse" x="0" y="0" width="' + VW + '" height="' + VH + '" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + freq + '" numOctaves="2" seed="' + seed + '" result="n"/>' +
      '<feDiffuseLighting in="n" surfaceScale="' + bump + '" lighting-color="#ffffff" result="l"><feDistantLight azimuth="235" elevation="58"/></feDiffuseLighting>' +
      '<feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="' + gain + '" k2="0" k3="0" k4="0" result="m"/>' +
      '<feComposite in="m" in2="SourceAlpha" operator="in"/>' +
      '</filter>';
  }
  // Fur: edge fuzz (displacement) + directional streak texture (anisotropic noise).
  function furFilter(id, seed) {
    return '<filter id="' + id + '" filterUnits="userSpaceOnUse" x="0" y="0" width="' + VW + '" height="' + VH + '" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="' + seed + '" result="e"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="e" scale="3.2" xChannelSelector="R" yChannelSelector="G" result="d"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.16 1.3" numOctaves="2" seed="' + (seed + 7) + '" result="s"/>' +
      '<feDiffuseLighting in="s" surfaceScale=".9" lighting-color="#ffffff" result="l"><feDistantLight azimuth="250" elevation="52"/></feDiffuseLighting>' +
      '<feComposite in="d" in2="l" operator="arithmetic" k1="1.12" k2="0" k3="0" k4="0" result="m"/>' +
      '<feComposite in="m" in2="d" operator="in"/>' +
      '</filter>';
  }

  /* ================================================================
   *  PIGS
   * ================================================================ */
  // hi/mid/lo/deep = skin tones from lit to shadow. sn = snout disc, ei = inner ear,
  // hf = hoof, ear = 'flop' | 'up', pat = coat pattern
  var BREEDS = {
    largewhite: { hi: '#ffe6df', mid: '#f3bdb2', lo: '#d68f87', deep: '#9d5d5b', sn: '#f2a6a2', ei: '#f08e8e', hf: '#b99583', ear: 'up', pat: null },
    pink:       { hi: '#ffd9d2', mid: '#efa79f', lo: '#cc7c79', deep: '#934a52', sn: '#e98f91', ei: '#e9787f', hf: '#a8826f', ear: 'flop', pat: null },
    oldspot:    { hi: '#ffe1d8', mid: '#f0b6aa', lo: '#d08a83', deep: '#985a58', sn: '#eda19c', ei: '#ec8a88', hf: '#a88672', ear: 'flop', pat: 'spots' },
    berkshire:  { hi: '#5d5862', mid: '#302c33', lo: '#1b181d', deep: '#0b0a0c', sn: '#e6c4bc', ei: '#4a3a40', hf: '#d8cfc8', ear: 'up', pat: 'points' },
    tamworth:   { hi: '#f6b06c', mid: '#cc6e2e', lo: '#9b4b1c', deep: '#5c2a0e', sn: '#d98f74', ei: '#c56a4e', hf: '#5a3a2a', ear: 'up', pat: null },
    hampshire:  { hi: '#5a5560', mid: '#2c282f', lo: '#19161b', deep: '#0a090b', sn: '#5c4c50', ei: '#3a2e33', hf: '#3a3236', ear: 'up', pat: 'belt' },
    duroc:      { hi: '#d98a5c', mid: '#a5532e', lo: '#743519', deep: '#40190a', sn: '#b77562', ei: '#9c5440', hf: '#4a2e22', ear: 'flop', pat: null },
    kunekune:   { hi: '#f6e2c4', mid: '#dcb88e', lo: '#b08860', deep: '#6e5236', sn: '#d9a28c', ei: '#c98a7a', hf: '#6a5240', ear: 'up', pat: 'spots' }
  };
  var BREED_KEYS = Object.keys(BREEDS);
  var LIGHT_BREEDS = ['largewhite', 'pink', 'oldspot', 'kunekune'];

  // body silhouette (standing, facing right)
  // back line -> shoulder -> brisket -> sagging belly -> flank tuck -> ham -> rump
  var PIG_BODY = 'M60 66C82 50 120 44 152 46C174 47 188 58 193 74C197 90 194 106 186 116' +
    'C180 124 168 128 154 130C136 133 116 132 104 127C99 125 94 125 88 127C72 132 52 124 45 106C40 92 46 76 60 66Z';
  var PIG_HEAD = 'M172 60C186 50 206 56 216 70C222 78 230 84 238 88C244 91 245 104 238 107' +
    'C226 112 210 114 198 113C182 112 170 104 168 90C167 78 166 66 172 60Z';
  var NECK = [182, 74];

  // tapered limb (thick forearm/gaskin -> slim pastern) ending in a cloven hoof + dewclaw
  function pigLeg(x, top, bottom, w, lean, fillId, hoof, hoofLo) {
    var wt = w * 1.45, wa = w * 0.62, ank = bottom - 8, dx = lean, mid = top + (ank - top) * 0.55;
    var leg = 'M' + f1(x - wt / 2) + ' ' + top +
      'C' + f1(x - wt * 0.5) + ' ' + f1(mid - 6) + ' ' + f1(x - wa * 0.5 + dx) + ' ' + f1(mid) + ' ' + f1(x - wa / 2 + dx) + ' ' + ank +
      'L' + f1(x + wa / 2 + dx) + ' ' + ank +
      'C' + f1(x + wa * 0.55 + dx) + ' ' + f1(mid + 2) + ' ' + f1(x + wt * 0.5) + ' ' + f1(mid - 8) + ' ' + f1(x + wt / 2) + ' ' + top + 'Z';
    var hx = x + dx;
    var hf = 'M' + f1(hx - wa * 0.55) + ' ' + ank + 'C' + f1(hx - wa * 0.72) + ' ' + (bottom - 2) + ' ' + f1(hx - wa * 0.6) + ' ' + bottom + ' ' + f1(hx - wa * 0.3) + ' ' + bottom +
      'L' + f1(hx + wa * 0.85) + ' ' + bottom + 'C' + f1(hx + wa * 0.95) + ' ' + (bottom - 1.5) + ' ' + f1(hx + wa * 0.75) + ' ' + (ank + 2) + ' ' + f1(hx + wa * 0.5) + ' ' + ank + 'Z';
    return '<path d="' + leg + '" fill="url(#' + fillId + ')"/>' +
      '<ellipse cx="' + f1(hx - wa * 0.6) + '" cy="' + (ank - 2) + '" rx="1.2" ry="1.8" fill="' + hoofLo + '" opacity=".35"/>' +
      '<path d="' + hf + '" fill="' + hoof + '"/>' +
      '<path d="M' + f1(hx + wa * 0.15) + ' ' + (ank + 1.5) + 'L' + f1(hx + wa * 0.3) + ' ' + bottom + '" stroke="' + hoofLo + '" stroke-width="1"/>' +
      '<path d="M' + f1(hx - wa * 0.45) + ' ' + (ank + 1.2) + 'L' + f1(hx + wa * 0.45) + ' ' + (ank + 1.2) + '" stroke="#fff" stroke-opacity=".3" stroke-width="1"/>' +
      '<ellipse cx="' + f1(hx + wa * 0.1) + '" cy="' + (bottom + 0.5) + '" rx="' + f1(wa * 1.1) + '" ry="1.6" fill="#000" opacity=".55" filter="url(#b1)"/>';
  }

  // a leg folded under the body: only the rounded pastern + hoof show, pointing forward
  function tuckedFoot(x, fillId, hoof, hoofLo) {
    var g = GROUND;
    return '<path d="M' + (x - 4) + ' ' + (g - 10) + 'C' + (x + 6) + ' ' + (g - 13) + ' ' + (x + 18) + ' ' + (g - 11) + ' ' + (x + 22) + ' ' + (g - 7) +
      'L' + (x + 22) + ' ' + g + 'L' + (x - 2) + ' ' + g + 'C' + (x - 6) + ' ' + (g - 3) + ' ' + (x - 7) + ' ' + (g - 7) + ' ' + (x - 4) + ' ' + (g - 10) + 'Z" fill="url(#' + fillId + ')"/>' +
      '<path d="M' + (x + 20) + ' ' + (g - 8) + 'C' + (x + 26) + ' ' + (g - 8) + ' ' + (x + 30) + ' ' + (g - 4) + ' ' + (x + 30) + ' ' + g + 'L' + (x + 19) + ' ' + g + 'Z" fill="' + hoof + '"/>' +
      '<path d="M' + (x + 21) + ' ' + (g - 4) + 'L' + (x + 30) + ' ' + (g - 3) + '" stroke="' + hoofLo + '" stroke-width=".9"/>' +
      '<ellipse cx="' + (x + 12) + '" cy="' + (g + 0.5) + '" rx="18" ry="1.8" fill="#000" opacity=".5" filter="url(#b1)"/>';
  }

  function pigEye(x, y, closed, b) {
    if (closed) {
      return '<ellipse cx="' + x + '" cy="' + (y + 0.5) + '" rx="6" ry="3.6" fill="' + b.lo + '" opacity=".55" filter="url(#b1)"/>' +
        '<path d="M' + (x - 4.5) + ' ' + y + 'Q' + x + ' ' + (y + 3) + ' ' + (x + 4.5) + ' ' + (y - 0.5) + '" stroke="' + b.deep + '" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
        '<path d="M' + (x - 2) + ' ' + (y + 1.8) + 'l-1 2.2M' + x + ' ' + (y + 2.2) + 'l-.4 2.4M' + (x + 2) + ' ' + (y + 1.6) + 'l.2 2.3" stroke="' + b.deep + '" stroke-width=".7" opacity=".8"/>';
    }
    return '<ellipse cx="' + x + '" cy="' + y + '" rx="6.2" ry="4.6" fill="' + b.lo + '" opacity=".6" filter="url(#b1)"/>' +
      '<ellipse cx="' + x + '" cy="' + y + '" rx="3.8" ry="3" fill="#f3e6dc"/>' +
      '<circle cx="' + (x + 0.6) + '" cy="' + y + '" r="2.5" fill="url(#gIris)"/>' +
      '<circle cx="' + (x + 0.8) + '" cy="' + y + '" r="1.2" fill="#070403"/>' +
      '<circle cx="' + (x - 0.3) + '" cy="' + (y - 1) + '" r=".75" fill="#fff" opacity=".95"/>' +
      '<path d="M' + (x - 4.5) + ' ' + (y - 1) + 'Q' + x + ' ' + (y - 5.2) + ' ' + (x + 4.6) + ' ' + (y - 0.6) + '" stroke="' + b.deep + '" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
      '<path d="M' + (x - 5) + ' ' + (y - 4) + 'Q' + x + ' ' + (y - 8) + ' ' + (x + 5) + ' ' + (y - 3.8) + '" stroke="' + b.lo + '" stroke-width="1" fill="none" opacity=".7"/>' +
      '<path d="M' + (x - 2) + ' ' + (y - 3.6) + 'l-1.2-2.6M' + x + ' ' + (y - 4.2) + 'l-.3-2.8M' + (x + 2.2) + ' ' + (y - 3.6) + 'l.8-2.6" stroke="' + b.hi + '" stroke-width=".6" opacity=".9"/>' +
      '<path d="M' + (x - 3.6) + ' ' + (y + 2.4) + 'Q' + x + ' ' + (y + 4.6) + ' ' + (x + 3.6) + ' ' + (y + 2.2) + '" stroke="' + b.lo + '" stroke-width=".8" fill="none" opacity=".7"/>';
  }

  function pigEar(kind, far, b) {
    var fill = far ? b.lo : 'url(#gEar)';
    var off = far ? 'translate(-9 3)' : '';
    if (kind === 'up') {
      return '<g transform="' + off + '">' +
        '<path d="M186 64C186 48 193 34 206 27C212 40 211 56 203 68Z" fill="' + fill + '"/>' +
        (far ? '' : '<path d="M190 61C191 49 196 40 204 34C207 45 206 55 201 63Z" fill="url(#gEarIn)"/>' +
          '<path d="M195 58C197 50 200 44 203 39M199 60C201 52 203 47 204 42" stroke="' + b.lo + '" stroke-width=".6" opacity=".5" fill="none"/>' +
          '<path d="M186 64C186 48 193 34 206 27" stroke="' + b.hi + '" stroke-width="1.1" fill="none" opacity=".7"/>') +
        '</g>';
    }
    return '<g transform="' + off + '">' +
      '<path d="M186 62C190 46 210 40 224 47C224 60 216 74 203 82C195 78 188 71 186 62Z" fill="' + fill + '"/>' +
      (far ? '' : '<path d="M188 61C192 48 208 44 220 49" stroke="' + b.hi + '" stroke-width="1.3" fill="none" opacity=".75"/>' +
        '<path d="M224 47C224 60 216 74 203 82" stroke="' + b.deep + '" stroke-width="1.2" fill="none" opacity=".55"/>' +
        '<path d="M196 58C204 56 212 58 218 54M198 66C206 64 212 64 216 60" stroke="' + b.lo + '" stroke-width=".7" fill="none" opacity=".45"/>') +
      '<ellipse cx="206" cy="80" rx="12" ry="3.2" fill="#000" opacity=".22" filter="url(#b2)"/>' +
      '</g>';
  }

  function pigSVG(spec) {
    var b = BREEDS[spec.breed], pose = spec.pose, seed = spec.seed;
    var defs = '';
    defs += radial('gBody', '.36', '.24', '.85', [[0, b.hi], [0.42, b.mid], [0.82, b.lo], [1, b.deep]], ' fx=".3" fy=".18"');
    defs += linear('gBelly', 0, 0, 0, 1, [[0.5, b.deep, 0], [0.84, b.deep, 0.42], [1, b.deep, 0.75]]);
    defs += radial('gHead', '.38', '.3', '.8', [[0, b.hi], [0.5, b.mid], [0.9, b.lo], [1, b.deep]]);
    defs += linear('gLegN', 0, 0, 1, 0, [[0, b.lo], [0.35, b.mid], [0.7, b.mid], [1, b.deep]]);
    defs += linear('gLegF', 0, 0, 1, 0, [[0, b.deep], [0.5, b.lo], [1, b.deep]]);
    defs += radial('gSnout', '.4', '.4', '.7', [[0, '#fff', 0.55], [0.25, b.sn], [0.85, b.sn], [1, b.deep]]);
    defs += linear('gEar', 0, 0, 1, 1, [[0, b.hi], [0.5, b.mid], [1, b.lo]]);
    defs += radial('gEarIn', '.5', '.6', '.6', [[0, b.ei], [0.7, b.ei, 0.75], [1, b.ei, 0]]);
    defs += radial('gIris', '.4', '.4', '.6', [[0, '#7a4e2c'], [0.6, '#3a2212'], [1, '#120a05']]);
    defs += radial('gSpot', '.5', '.5', '.5', [[0, '#1e1a1c'], [0.8, '#1e1a1c', 0.95], [1, '#1e1a1c', 0]]);
    defs += radial('gMud', '.5', '.5', '.5', [[0, '#4e3519', 0.95], [0.7, '#5c4122', 0.85], [1, '#6a4a28', 0]]);
    defs += blurF('b1', 0.9) + blurF('b2', 2) + blurF('b4', 4) + blurF('b6', 6);
    defs += skinFilter('skin', seed, '1.5', '.45', '1.07');
    defs += '<filter id="mud" filterUnits="userSpaceOnUse" x="0" y="0" width="' + VW + '" height="' + VH + '">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="' + (seed + 3) + '" result="t"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="t" scale="14" xChannelSelector="R" yChannelSelector="B"/></filter>';
    defs += '<clipPath id="cBody"><path d="' + PIG_BODY + '"/></clipPath>';
    defs += '<clipPath id="cHead"><path d="' + PIG_HEAD + '"/></clipPath>';

    // pose transforms ------------------------------------------------------
    var bodyT = '', headT = '', closed = false, legs = '', farLegs = '', shadow;
    var hoofLo = b.pat === 'points' ? '#9a908a' : '#2a1e18';
    var dark = BREEDS[spec.breed].pat === 'points' || spec.breed === 'hampshire';
    var hoof = b.hf;
    var hScale = spec.piglet ? 1.2 : 1;
    function headXf(dx, dy, r) {
      return 'translate(' + f1(dx) + ' ' + f1(dy) + ') rotate(' + r + ' ' + NECK[0] + ' ' + NECK[1] + ') ' +
        'translate(' + NECK[0] + ' ' + NECK[1] + ') scale(' + hScale + ') translate(' + (-NECK[0]) + ' ' + (-NECK[1]) + ')';
    }
    var legW = spec.piglet ? 13 : 15;
    var frontLegFill = b.pat === 'belt' ? 'gLegW' : 'gLegN';
    if (b.pat === 'belt' || b.pat === 'points') {
      defs += linear('gLegW', 0, 0, 1, 0, [[0, '#cfc6c2'], [0.4, '#f4eeea'], [1, '#a59b97']]);
    }
    var hindFill = b.pat === 'points' ? 'gLegW' : 'gLegN';
    if (b.pat === 'points') frontLegFill = 'gLegW';

    if (pose === 'stand' || pose === 'walk') {
      var lean = pose === 'walk' ? 5 : 0;
      farLegs = pigLeg(66, 108, GROUND - 2, legW - 1, -lean, 'gLegF', b.lo, hoofLo) +
        pigLeg(158, 106, GROUND - 2, legW - 1, lean, 'gLegF', b.lo, hoofLo);
      legs = pigLeg(82, 112, GROUND, legW, lean, hindFill, hoof, hoofLo) +
        pigLeg(174, 110, GROUND, legW, -lean, frontLegFill, hoof, hoofLo);
      headT = headXf(0, 0, pose === 'walk' ? 4 : 0);
      shadow = '<ellipse cx="128" cy="' + (GROUND + 1) + '" rx="92" ry="9" fill="#000" opacity=".5" filter="url(#b4)"/>';
    } else if (pose === 'sit') {
      var R = -16, C = [70, 130], DY = 26;
      bodyT = 'translate(0 ' + DY + ') rotate(' + R + ' ' + C[0] + ' ' + C[1] + ')';
      var chest = rot(172, 118, R, C[0], C[1]); chest[1] += DY;
      var neck = rot(NECK[0], NECK[1], R, C[0], C[1]); neck[1] += DY;
      headT = headXf(neck[0] - NECK[0], neck[1] - NECK[1], -6);
      farLegs = pigLeg(chest[0] - 12, chest[1] - 6, GROUND - 2, legW - 1, 2, 'gLegF', b.lo, hoofLo);
      legs = pigLeg(chest[0], chest[1] - 6, GROUND, legW, 1, frontLegFill, hoof, hoofLo);
      // folded hind foot poking forward under the haunch
      legs += tuckedFoot(98, hindFill, hoof, hoofLo);
      shadow = '<ellipse cx="112" cy="' + (GROUND + 1) + '" rx="70" ry="9" fill="#000" opacity=".55" filter="url(#b4)"/>';
    } else { // sleep: lying on the belly, legs tucked, chin on the ground
      closed = true;
      bodyT = 'translate(0 30) translate(0 128) scale(1 .9) translate(0 -128)';
      headT = headXf(6, 36, 9);
      legs = tuckedFoot(190, frontLegFill, hoof, hoofLo);
      shadow = '<ellipse cx="134" cy="' + (GROUND + 1) + '" rx="104" ry="8" fill="#000" opacity=".6" filter="url(#b4)"/>';
    }

    // coat pattern inside body / head clips ---------------------------------
    var bodyPat = '', headPat = '';
    if (b.pat === 'spots') {
      var n = 3 + ((Math.random() * 3) | 0);
      for (var i = 0; i < n; i++) {
        var sx = rnd(55, 185), sy = rnd(52, 115), sr = rnd(10, 22);
        bodyPat += '<ellipse cx="' + f1(sx) + '" cy="' + f1(sy) + '" rx="' + f1(sr) + '" ry="' + f1(sr * rnd(0.6, 0.95)) +
          '" transform="rotate(' + f1(rnd(-40, 40)) + ' ' + f1(sx) + ' ' + f1(sy) + ')" fill="url(#gSpot)" opacity="' +
          (spec.breed === 'kunekune' ? '.55' : '.92') + '" filter="url(#mud)"/>';
      }
      if (Math.random() < 0.6) headPat += '<ellipse cx="196" cy="70" rx="14" ry="11" fill="url(#gSpot)" opacity=".9" filter="url(#mud)"/>';
    } else if (b.pat === 'belt') {
      bodyPat += '<path d="M146 30C150 60 152 100 146 140L184 140C190 100 186 60 176 30Z" fill="#efe8e4" opacity=".95" filter="url(#mud)"/>';
    } else if (b.pat === 'points') {
      headPat += '<path d="M222 84C228 88 236 90 244 92L244 108C232 112 222 110 214 106C220 100 222 92 222 84Z" fill="#efe6e0" opacity=".9" filter="url(#b1)"/>';
    }
    if (spec.muddy) {
      bodyPat += '<ellipse cx="' + f1(rnd(70, 110)) + '" cy="124" rx="44" ry="18" fill="url(#gMud)" filter="url(#mud)"/>' +
        '<ellipse cx="' + f1(rnd(140, 175)) + '" cy="120" rx="30" ry="14" fill="url(#gMud)" filter="url(#mud)"/>' +
        '<ellipse cx="' + f1(rnd(80, 160)) + '" cy="' + f1(rnd(60, 90)) + '" rx="9" ry="6" fill="url(#gMud)" opacity=".8" filter="url(#mud)"/>';
      headPat += '<ellipse cx="212" cy="108" rx="16" ry="8" fill="url(#gMud)" filter="url(#mud)"/>';
    }

    // tail ------------------------------------------------------------------
    var tailTip = b.pat === 'points' ? '#eee6e0' : b.mid;
    var tailD = 'M47 80C36 74 28 84 35 90C42 96 47 86 40 84C34 82 30 90 33 96';
    var tail = '<path d="' + tailD + '" stroke="' + b.deep + '" stroke-width="4.2" fill="none" stroke-linecap="round"/>' +
      '<path d="' + tailD + '" stroke="' + b.mid + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      '<path d="M37 88C40 92 33 96 33 96" stroke="' + tailTip + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
      '<path d="M44 79C38 76 32 80 33 84" stroke="' + b.hi + '" stroke-width="1" fill="none" opacity=".7"/>';

    // body ------------------------------------------------------------------
    var body = '<g transform="' + bodyT + '">' + tail +
      '<path d="' + PIG_BODY + '" fill="url(#gBody)"/>' +
      '<g clip-path="url(#cBody)">' + bodyPat +
      '<ellipse cx="80" cy="96" rx="34" ry="28" fill="' + b.hi + '" opacity=".22" filter="url(#b6)"/>' +   // ham
      '<ellipse cx="160" cy="88" rx="24" ry="26" fill="' + b.hi + '" opacity=".14" filter="url(#b6)"/>' + // shoulder
      '<path d="M48 110C80 134 150 136 190 108L196 140L40 140Z" fill="url(#gBelly)"/>' +
      '<ellipse cx="112" cy="54" rx="52" ry="7" fill="#fff" opacity="' + (dark ? '.16' : '.32') + '" filter="url(#b4)"/>' + // top sheen
      '<path d="M58 72C66 50 108 42 150 46C174 48 188 58 192 74" stroke="#fff" stroke-width="1.6" fill="none" opacity="' + (dark ? '.12' : '.28') + '" filter="url(#b1)"/>' +
      '<path d="M178 62C174 76 174 96 180 112M184 66C180 80 181 96 186 108" stroke="' + b.deep + '" stroke-width="1.2" fill="none" opacity=".35" filter="url(#b1)"/>' + // neck folds
      '<path d="M120 126C126 128 132 128 138 126M100 125C104 127 108 127 112 126" stroke="' + b.deep + '" stroke-width="1" opacity=".4" fill="none"/>' + // teats line
      '<path d="M60 74C52 82 50 96 56 108" stroke="' + b.deep + '" stroke-width="2" fill="none" opacity=".35" filter="url(#b2)"/>' +
      '</g>' +
      // sparse bristles along the back
      bristles(b) +
      '</g>';

    // head ------------------------------------------------------------------
    var head = '<g transform="' + headT + '">' +
      pigEar(b.ear, true, b) +
      '<path d="' + PIG_HEAD + '" fill="url(#gHead)"/>' +
      '<g clip-path="url(#cHead)">' + headPat +
      '<ellipse cx="190" cy="104" rx="22" ry="11" fill="' + b.deep + '" opacity=".45" filter="url(#b4)"/>' +   // jowl
      '<ellipse cx="204" cy="66" rx="18" ry="8" fill="#fff" opacity="' + (dark ? '.12' : '.3') + '" filter="url(#b4)"/>' +
      '<path d="M222 80C224 86 224 92 222 98M228 84C230 89 230 94 228 99M216 78C218 84 218 90 216 96" stroke="' + b.lo + '" stroke-width=".9" fill="none" opacity=".55"/>' + // snout wrinkles
      '<path d="M176 64C172 76 172 92 178 104" stroke="' + b.deep + '" stroke-width="2.4" opacity=".45" fill="none" filter="url(#b2)"/>' +
      '</g>' +
      // snout disc
      '<ellipse cx="240" cy="97.5" rx="5.6" ry="10.4" fill="' + b.lo + '"/>' +
      '<ellipse cx="240.6" cy="97.5" rx="4.8" ry="9.6" fill="url(#gSnout)"/>' +
      '<ellipse cx="241.4" cy="93" rx="1.5" ry="2.6" fill="#2a0f12" opacity=".85"/>' +
      '<ellipse cx="241.4" cy="102" rx="1.5" ry="2.6" fill="#2a0f12" opacity=".85"/>' +
      '<ellipse cx="239" cy="89.5" rx="2" ry="1.1" fill="#fff" opacity=".45" filter="url(#b1)"/>' +
      // mouth
      '<path d="M236 107C230 110 222 110 214 108" stroke="' + b.deep + '" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".85"/>' +
      '<path d="M215 108C213 109 211 109 209 108" stroke="' + b.deep + '" stroke-width="1" fill="none" opacity=".6"/>' +
      pigEye(207, 78, closed, b) +
      pigEar(b.ear, false, b) +
      '</g>';

    var art = '<g filter="url(#skin)">' + farLegs + legs + body + head + '</g>';
    return svgDoc(defs, shadow + art);
  }

  function bristles(b) {
    var s = '';
    for (var i = 0; i < 26; i++) {
      var t = i / 25, x = 60 + t * 128, y = 52 - Math.sin(t * Math.PI) * 6 + (t < 0.1 ? 14 * (0.1 - t) * 10 : 0);
      s += 'M' + f1(x) + ' ' + f1(y + 2) + 'l' + f1(rnd(-1.5, 0.5)) + ' ' + f1(-rnd(1.5, 3.2));
    }
    return '<path d="' + s + '" stroke="' + b.hi + '" stroke-width=".5" opacity=".55" fill="none"/>';
  }

  /* ================================================================
   *  DOG  (the 1-in-200)
   * ================================================================ */
  var DOGS = {
    golden:    { hi: '#f8dca4', mid: '#d9a560', lo: '#a8712e', deep: '#5e3a14', nose: '#1c1412' },
    blacklab:  { hi: '#55555c', mid: '#222226', lo: '#121215', deep: '#050506', nose: '#0c0c0e' },
    chocolate: { hi: '#a8774f', mid: '#6d4127', lo: '#47271a', deep: '#22120a', nose: '#2a1712' },
    beagle:    { hi: '#f2ddc0', mid: '#c98a4a', lo: '#8a5424', deep: '#3a220e', nose: '#151110', tri: true }
  };
  function dogSVG(spec) {
    var d = DOGS[spec.coat], seed = spec.seed;
    var defs = radial('gD', '.4', '.25', '.85', [[0, d.hi], [0.45, d.mid], [0.85, d.lo], [1, d.deep]], ' fx=".32" fy=".2"') +
      radial('gDH', '.38', '.3', '.8', [[0, d.hi], [0.5, d.mid], [1, d.lo]], ' fx=".34" fy=".22"') +
      linear('gDL', 0, 0, 1, 0, [[0, d.lo], [0.4, d.mid], [1, d.deep]]) +
      linear('gDF', 0, 0, 1, 0, [[0, d.deep], [0.5, d.lo], [1, d.deep]]) +
      linear('gDB', 0, 0, 0, 1, [[0.45, d.deep, 0], [1, d.deep, 0.7]]) +
      // neck/chest: lit from the upper front, falling off into the brisket
      linear('gDN', 0, 0, 1, 1, [[0, d.lo], [0.45, d.mid], [0.8, d.hi], [1, d.mid]]) +
      linear('gDT', 1, 0, 0, 1, [[0, d.mid], [0.5, d.lo], [1, d.deep]]) +
      radial('gEye', '.4', '.35', '.6', [[0, '#8a5a2a'], [0.55, '#3e220c'], [1, '#0e0703']]) +
      radial('gNose', '.35', '.3', '.7', [[0, '#5a5052'], [0.4, d.nose], [1, '#000']]) +
      blurF('b1', 0.9) + blurF('b2', 2) + blurF('b4', 4) + furFilter('fur', seed);
    var BODY = 'M72 76C92 64 140 62 170 68C190 72 198 90 194 108C192 122 182 130 168 128C140 124 112 122 92 120C74 118 60 108 60 94C60 86 64 80 72 76Z';
    var NECKP = 'M164 76C170 60 182 46 194 42L214 56C210 78 202 98 190 112L166 104Z';
    // skull -> defined stop -> flat, blunt muzzle -> square nose front -> lip/jowl -> throat
    var HEAD = 'M192 42C190 30 200 21 212 21C221 21 227 27 229 34C236 36 245 36 252 37C257 38 260 42 260 47C260 52 258 55 254 57' +
      'C252 62 247 66 240 67C234 68 228 66 222 68C212 71 200 66 195 58C193 53 192 48 192 42Z';
    defs += '<clipPath id="cB"><path d="' + BODY + '"/></clipPath><clipPath id="cH"><path d="' + HEAD + '"/></clipPath>';
    var tri = d.tri ? '<g clip-path="url(#cB)"><path d="M80 66C110 58 150 60 172 70C168 88 140 96 110 94C90 92 76 86 80 66Z" fill="#1a1412" opacity=".92" filter="url(#b2)"/>' +
      '<path d="M60 112C100 132 160 134 200 116L200 140L60 140Z" fill="#f4ece2" opacity=".9" filter="url(#b2)"/></g>' : '';
    function pawFill(far) { return far ? d.lo : (d.tri ? '#f4ece2' : d.mid); }
    // a rounded foot with two toe splits and a pad shadow
    function paw(x, far) {
      return '<path d="M' + (x - 6) + ' ' + (GROUND - 3) + 'C' + (x - 7) + ' ' + (GROUND - 9) + ' ' + (x + 6) + ' ' + (GROUND - 10) + ' ' + (x + 10) + ' ' + (GROUND - 6) +
        'C' + (x + 13) + ' ' + (GROUND - 3) + ' ' + (x + 12) + ' ' + (GROUND + 0.5) + ' ' + (x + 8) + ' ' + (GROUND + 0.5) + 'L' + (x - 4) + ' ' + (GROUND + 0.5) +
        'C' + (x - 6) + ' ' + (GROUND + 0.5) + ' ' + (x - 7) + ' ' + (GROUND - 1) + ' ' + (x - 6) + ' ' + (GROUND - 3) + 'Z" fill="' + pawFill(far) + '"/>' +
        '<path d="M' + (x + 3) + ' ' + (GROUND - 5) + 'l1.2 5M' + (x + 7.5) + ' ' + (GROUND - 5.5) + 'l1.4 5" stroke="' + d.deep + '" stroke-width=".8" opacity=".55" fill="none"/>' +
        '<path d="M' + (x - 5) + ' ' + (GROUND - 1) + 'C' + x + ' ' + (GROUND + 1) + ' ' + (x + 8) + ' ' + (GROUND + 1) + ' ' + (x + 11) + ' ' + (GROUND - 1) + '" stroke="#000" stroke-width="1.2" opacity=".35" fill="none" filter="url(#b1)"/>';
    }
    // front leg: shoulder -> elbow (rear bump) -> straight forearm -> sloped pastern -> paw
    function leg(x, top, w, fill, far) {
      var h = w / 2;
      return '<path d="M' + (x - h) + ' ' + top +
        'C' + (x - h - 2) + ' ' + (top + 10) + ' ' + (x - h - 3) + ' ' + (top + 16) + ' ' + (x - h + 1) + ' ' + (top + 21) +
        'C' + (x - h + 2) + ' ' + (top + 24) + ' ' + (x - h * 0.6) + ' ' + (GROUND - 22) + ' ' + (x - h * 0.55) + ' ' + (GROUND - 14) +
        'C' + (x - h * 0.5) + ' ' + (GROUND - 10) + ' ' + (x - h * 0.4) + ' ' + (GROUND - 7) + ' ' + (x - h * 0.2) + ' ' + (GROUND - 5) +
        'L' + (x + h * 1.1) + ' ' + (GROUND - 6) +
        'C' + (x + h * 0.7) + ' ' + (GROUND - 9) + ' ' + (x + h * 0.55) + ' ' + (GROUND - 12) + ' ' + (x + h * 0.55) + ' ' + (GROUND - 16) +
        'C' + (x + h * 0.6) + ' ' + (top + 28) + ' ' + (x + h + 1) + ' ' + (top + 12) + ' ' + (x + h) + ' ' + top + 'Z" fill="url(#' + fill + ')"/>' +
        // elbow + wrist creases
        '<path d="M' + (x - h + 1) + ' ' + (top + 21) + 'C' + (x - h + 4) + ' ' + (top + 20) + ' ' + x + ' ' + (top + 21) + ' ' + (x + 1) + ' ' + (top + 23) + '" stroke="' + d.deep + '" stroke-width=".9" opacity=".45" fill="none" filter="url(#b1)"/>' +
        '<path d="M' + (x - h * 0.55) + ' ' + (GROUND - 14) + 'C' + x + ' ' + (GROUND - 13) + ' ' + (x + h * 0.4) + ' ' + (GROUND - 14) + ' ' + (x + h * 0.55) + ' ' + (GROUND - 15) + '" stroke="' + d.deep + '" stroke-width=".8" opacity=".4" fill="none"/>' +
        paw(x + 1, far);
    }
    // hind leg: muscled thigh -> stifle (forward) -> gaskin back to a pointed hock -> near-vertical rear pastern -> paw
    function hind(x, fill, far) {
      return '<path d="M' + (x - 12) + ' 94' +
        'C' + (x - 26) + ' 104 ' + (x - 26) + ' 122 ' + (x - 16) + ' 130' +
        'C' + (x - 13) + ' 133 ' + (x - 14) + ' 137 ' + (x - 15) + ' 141' +
        'C' + (x - 15) + ' 146 ' + (x - 12) + ' 150 ' + (x - 10) + ' ' + (GROUND - 5) +
        'L' + (x + 3) + ' ' + (GROUND - 6) +
        'C' + x + ' ' + (GROUND - 10) + ' ' + (x - 3) + ' ' + (GROUND - 16) + ' ' + (x - 4) + ' 138' +
        'C' + (x - 3) + ' 132 ' + (x + 6) + ' 126 ' + (x + 10) + ' 118' +
        'C' + (x + 13) + ' 110 ' + (x + 12) + ' 100 ' + (x + 8) + ' 94Z" fill="url(#' + fill + ')"/>' +
        // thigh muscle highlight + hock shadow
        (far ? '' : '<path d="M' + (x - 16) + ' 104C' + (x - 18) + ' 112 ' + (x - 12) + ' 120 ' + (x - 2) + ' 122" stroke="' + d.hi + '" stroke-width="2" opacity=".35" fill="none" filter="url(#b1)"/>') +
        '<path d="M' + (x - 15) + ' 141C' + (x - 11) + ' 140 ' + (x - 6) + ' 140 ' + (x - 4) + ' 138" stroke="' + d.deep + '" stroke-width="1" opacity=".5" fill="none" filter="url(#b1)"/>' +
        paw(x - 4, far);
    }
    // tail: thick at the root, tapering, with a feathered underside
    var tail = '<path d="M70 78C52 78 38 92 29 118C28 122 31 125 35 123C42 108 52 100 72 98Z" fill="url(#gDT)"/>';
    for (var fi = 0; fi < 7; fi++) {
      var tx = 64 - fi * 4.6, ty = 98 + fi * 3.3;
      tail += '<path d="M' + f1(tx) + ' ' + f1(ty) + 'q' + f1(-2 - fi * 0.3) + ' ' + f1(4 + fi * 0.4) + ' ' + f1(-5 - fi * 0.2) + ' ' + f1(6 + fi * 0.3) + '" stroke="' + (d.tri ? '#f4ece2' : d.lo) +
        '" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".7"/>';
    }
    if (d.tri) tail += '<path d="M29 118C28 122 31 125 35 123L37 114C33 114 31 116 29 118Z" fill="#f4ece2"/>';
    var head = '<path d="' + NECKP + '" fill="url(#gDN)"/>' +
      // chest / throat fluff catching the light
      '<path d="M192 82C200 92 200 106 190 116" stroke="' + (d.tri ? '#f4ece2' : d.hi) + '" stroke-width="5" fill="none" opacity=".45" filter="url(#b2)"/>' +
      '<path d="M190 112C194 104 196 96 194 86" stroke="' + d.deep + '" stroke-width="1" fill="none" opacity=".3"/>' +
      '<path d="' + HEAD + '" fill="url(#gDH)"/>' +
      '<g clip-path="url(#cH)">' +
        // muzzle volume: lighter top plane, darker cheek/jowl underneath
        '<path d="M228 36C238 36 252 37 258 41L258 47C248 46 236 46 228 44Z" fill="' + d.hi + '" opacity=".3" filter="url(#b1)"/>' +
        '<path d="M208 64C220 56 238 56 260 54L260 72L200 72Z" fill="' + d.deep + '" opacity=".45" filter="url(#b2)"/>' +
        // the stop: shadow in the dip between brow and muzzle
        '<ellipse cx="229" cy="35" rx="3" ry="4" fill="' + d.deep + '" opacity=".35" filter="url(#b1)"/>' +
        (d.tri ? '<path d="M226 34C236 38 248 40 262 40L262 70L232 70C230 58 230 44 226 34Z" fill="#f4ece2" opacity=".9" filter="url(#b1)"/>' : '') +
      '</g>' +
      // brow ridge
      '<path d="M213 30C217 28 222 28 226 31" stroke="' + d.hi + '" stroke-width="1.4" fill="none" opacity=".55" filter="url(#b1)"/>' +
      // eye
      '<ellipse cx="219" cy="35.5" rx="4.4" ry="3.5" fill="' + d.deep + '" opacity=".7" filter="url(#b1)"/>' +
      '<ellipse cx="219.4" cy="35.6" rx="2.9" ry="2.5" fill="url(#gEye)"/>' +
      '<circle cx="218.5" cy="34.6" r=".9" fill="#fff"/>' +
      '<path d="M214.6 34C217 31.6 221 31.6 223.8 33.6" stroke="' + d.deep + '" stroke-width="1.1" fill="none"/>' +
      // nose: square front, nostril
      '<path d="M253 38C257 37 261 39 261 43C261 47 259 49 256 49C253 49 251 47 251 44C251 41 251 39 253 38Z" fill="url(#gNose)"/>' +
      '<ellipse cx="256" cy="39.6" rx="2" ry=".9" fill="#fff" opacity=".45"/>' +
      '<path d="M258 45.4C259 46.4 260 46.4 260.6 45.8" stroke="#000" stroke-width=".8" fill="none"/>' +
      // philtrum + lip line hanging into a jowl
      '<path d="M256 49L256 54" stroke="' + d.deep + '" stroke-width=".9" opacity=".7"/>' +
      '<path d="M256 54C254 58 248 60 242 60C236 60 232 62 228 64" stroke="' + d.deep + '" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
      '<path d="M240 61C244 64 248 64 252 61" stroke="' + d.deep + '" stroke-width=".9" fill="none" opacity=".5"/>' +
      // whisker dots
      '<path d="M244 50h.1M247 51h.1M246 48h.1M249 49h.1M250 51.5h.1" stroke="' + d.deep + '" stroke-width="1" stroke-linecap="round" opacity=".6"/>' +
      // drop ear
      '<path d="M200 30C190 32 185 48 188 62C191 72 201 71 205 62C209 50 208 36 200 30Z" fill="' + d.lo + '"/>' +
      '<path d="M200 30C193 34 190 46 191 58" stroke="' + d.hi + '" stroke-width="1.1" fill="none" opacity=".45"/>' +
      '<ellipse cx="197" cy="68" rx="10" ry="3" fill="#000" opacity=".25" filter="url(#b2)"/>';
    var body = '<path d="' + BODY + '" fill="url(#gD)"/>' + tri +
      '<g clip-path="url(#cB)"><path d="M56 108C96 128 160 132 200 112L200 140L56 140Z" fill="url(#gDB)"/>' +
      '<ellipse cx="120" cy="66" rx="50" ry="6" fill="#fff" opacity=".22" filter="url(#b4)"/>' +
      // brisket shading + rib / loin hints
      '<ellipse cx="184" cy="114" rx="14" ry="10" fill="' + d.deep + '" opacity=".35" filter="url(#b2)"/>' +
      '<path d="M150 86C156 100 160 112 164 124M90 86C86 98 88 110 94 118M132 92C136 102 138 112 140 120" stroke="' + d.deep + '" stroke-width="1.6" fill="none" opacity=".3" filter="url(#b1)"/></g>';
    var art = '<g filter="url(#fur)">' + hind(84, 'gDF', true) + leg(176, 108, 11, 'gDF', true) + tail +
      body + hind(98, 'gDL', false) + leg(188, 110, 12, 'gDL', false) + head + '</g>';
    return svgDoc(defs, '<ellipse cx="140" cy="' + (GROUND + 1) + '" rx="88" ry="7" fill="#000" opacity=".5" filter="url(#b4)"/>' + art);
  }

  /* ================================================================
   *  BREAD  (the 1-in-1000)
   * ================================================================ */
  function breadSVG(spec) {
    var seed = spec.seed, boule = spec.shape === 'boule';
    var LOAF = boule ?
      'M54 140C40 118 46 72 92 56C116 48 146 48 170 56C214 72 222 118 206 140C176 152 84 152 54 140Z' :
      'M30 140C20 118 36 84 74 72C108 62 156 62 190 72C226 84 240 118 228 140C204 150 60 152 30 140Z';
    var defs = radial('gC', '.45', '.28', '.8', [[0, '#f0b868'], [0.3, '#d48a3a'], [0.62, '#a85a22'], [0.88, '#6a3212'], [1, '#3e1a08']], ' fx=".42" fy=".2"') +
      linear('gBot', 0, 0, 0, 1, [[0.6, '#2a1206', 0], [1, '#2a1206', 0.8]]) +
      linear('gEarC', 0, 0, 1, 1, [[0, '#f6dfb2'], [0.5, '#e7bc78'], [1, '#c48a44']]) +
      blurF('b1', 0.8) + blurF('b2', 2) + blurF('b4', 4) +
      skinFilter('crust', seed, '0.8', '1.3', '1.12') +
      // flour: thresholded noise -> white speckles, clipped to the loaf
      '<filter id="flour" filterUnits="userSpaceOnUse" x="0" y="0" width="' + VW + '" height="' + VH + '">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="' + (seed + 11) + '" result="t"/>' +
      '<feColorMatrix in="t" type="matrix" values="0 0 0 0 1  0 0 0 0 .98  0 0 0 0 .95  0 0 0 16 -10.2" result="w"/>' +
      '<feComposite in="w" in2="SourceAlpha" operator="in"/></filter>' +
      '<clipPath id="cL"><path d="' + LOAF + '"/></clipPath>';
    var scores = '';
    var cuts = boule ? [[100, 74, 40, -38], [150, 74, 40, 38], [128, 104, 40, 0]] : [[86, 86, 34, -18], [130, 80, 36, -18], [176, 86, 34, -18]];
    cuts.forEach(function (c) {
      var x = c[0], y = c[1], L = c[2], a = c[3];
      scores += '<g transform="rotate(' + a + ' ' + x + ' ' + y + ')">' +
        '<path d="M' + (x - L / 2) + ' ' + y + 'C' + (x - L / 4) + ' ' + (y - 9) + ' ' + (x + L / 4) + ' ' + (y - 9) + ' ' + (x + L / 2) + ' ' + y +
        'C' + (x + L / 4) + ' ' + (y + 5) + ' ' + (x - L / 4) + ' ' + (y + 5) + ' ' + (x - L / 2) + ' ' + y + 'Z" fill="url(#gEarC)"/>' +
        '<path d="M' + (x - L / 2) + ' ' + y + 'C' + (x - L / 4) + ' ' + (y + 5) + ' ' + (x + L / 4) + ' ' + (y + 5) + ' ' + (x + L / 2) + ' ' + y + '" stroke="#5a2a0e" stroke-width="2.2" fill="none" opacity=".75" filter="url(#b1)"/>' +
        '<path d="M' + (x - L / 2 + 3) + ' ' + (y - 2) + 'C' + (x - L / 4) + ' ' + (y - 10) + ' ' + (x + L / 4) + ' ' + (y - 10) + ' ' + (x + L / 2 - 3) + ' ' + (y - 2) + '" stroke="#8a4416" stroke-width="2.4" fill="none" opacity=".85"/>' +
        '<path d="M' + (x - L / 3) + ' ' + (y - 3) + 'C' + (x - L / 6) + ' ' + (y - 6) + ' ' + (x + L / 6) + ' ' + (y - 6) + ' ' + (x + L / 3) + ' ' + (y - 3) + '" stroke="#fff6e0" stroke-width="1.2" fill="none" opacity=".6"/>' +
        '</g>';
    });
    var art = '<g filter="url(#crust)"><path d="' + LOAF + '" fill="url(#gC)"/>' +
      '<g clip-path="url(#cL)">' +
      '<path d="M0 126C80 140 180 140 260 126L260 180L0 180Z" fill="url(#gBot)"/>' +
      '<ellipse cx="124" cy="76" rx="56" ry="10" fill="#ffe0a0" opacity=".3" filter="url(#b4)"/>' +
      scores + '</g></g>' +
      // flour dusting, heavier on top
      '<g clip-path="url(#cL)"><path d="' + LOAF + '" fill="#fff" filter="url(#flour)" opacity=".85"/>' +
      '<ellipse cx="128" cy="' + (boule ? 64 : 74) + '" rx="70" ry="14" fill="#fbf4e6" opacity=".35" filter="url(#b4)"/></g>';
    return svgDoc(defs, '<ellipse cx="130" cy="' + (GROUND - 14) + '" rx="' + (boule ? 86 : 104) + '" ry="8" fill="#000" opacity=".6" filter="url(#b4)"/>' +
      // a little spilled flour on the "table"
      '<ellipse cx="' + (boule ? 196 : 214) + '" cy="' + (GROUND - 12) + '" rx="22" ry="4" fill="#fbf4e6" opacity=".25" filter="url(#b2)"/>' + art);
  }

  /* ================================================================
   *  sprite cache + layout
   * ================================================================ */
  var cache = {};
  function sprite(key, make) {
    if (!cache[key]) {
      cache[key] = new Promise(function (res) {
        var img = new Image();
        img.decoding = 'async';
        img.onload = function () {
          // bake to a bitmap ONCE: drawing an SVG <img> re-runs its filters on every drawImage
          try {
            var c = document.createElement('canvas');
            c.width = Math.round(VW * RES); c.height = Math.round(VH * RES);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            res(c);
          } catch (e) { res(img); }
        };
        img.onerror = function () { res(null); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(make());
      });
    }
    return cache[key];
  }

  // A pool of pig looks per visit, so there is plenty of variety but only ~16 rasterisations.
  var POSES = ['stand', 'stand', 'walk', 'sit', 'sleep'];
  var pigPool = [];
  (function buildPool() {
    var keys = BREED_KEYS.slice().sort(function () { return Math.random() - 0.5; });
    for (var i = 0; i < 16; i++) {
      var breed = keys[i % keys.length];
      var spec = {
        breed: breed,
        pose: pick(POSES),
        piglet: Math.random() < 0.3,
        muddy: LIGHT_BREEDS.indexOf(breed) >= 0 && Math.random() < 0.35,
        seed: 1 + ((Math.random() * 900) | 0)
      };
      spec.key = 'pig:' + i;
      pigPool.push(spec);
    }
  })();

  function slotSprite(kind) {
    if (kind === 'bread') {
      var bs = { shape: Math.random() < 0.5 ? 'boule' : 'batard', seed: 1 + ((Math.random() * 900) | 0) };
      return { scale: 0.75, p: sprite('bread:' + bs.shape, function () { return breadSVG(bs); }) };
    }
    if (kind === 'dog') {
      var ds = { coat: pick(Object.keys(DOGS)), seed: 1 + ((Math.random() * 900) | 0) };
      return { scale: 1.1, p: sprite('dog:' + ds.coat, function () { return dogSVG(ds); }) };
    }
    var ps = pick(pigPool);
    return { scale: ps.piglet ? 0.62 : 1, p: sprite(ps.key, function () { return pigSVG(ps); }) };
  }

  var root, canvas, laidW = 0, laidH = 0, stats = { pig: 0, dog: 0, bread: 0 };
  var special = 'pig', specialSprite = null;   // rolled once per visit in init()
  function layout() {
    var w = window.innerWidth, h = Math.max(window.innerHeight, (window.screen && window.screen.height) || 0);
    laidW = w; laidH = h;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    dpr = Math.min(dpr, Math.sqrt(4.5e6 / (w * h)));
    var cv = document.createElement('canvas');
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var cell = w < 600 ? 88 : 116, slots = [];
    stats = { pig: 0, dog: 0, bread: 0 };
    for (var row = 0, y = -cell * 0.3; y < h + cell * 0.3; y += cell * 0.78, row++) {
      for (var x = (row % 2 ? cell * 0.5 : 0) - cell * 0.3; x < w + cell * 0.3; x += cell) {
        var s = slotSprite('pig'), base = rnd(0.85, 1.3);
        slots.push({
          x: x + rnd(-0.32, 0.32) * cell, y: y + rnd(-0.28, 0.28) * cell,
          base: base, w: cell * base * s.scale, rot: rnd(-16, 16) * Math.PI / 180,
          flip: Math.random() < 0.5, alpha: rnd(0.78, 1), p: s.p, kind: 'pig'
        });
      }
    }
    if (special !== 'pig' && slots.length) {
      // Swap exactly ONE slot for the rare find. Prefer a slot fully on screen and out from
      // under the dark centre veil (where the cards sit), so the visitor can actually spot it.
      var vh = window.innerHeight, ok = slots.filter(function (sl) {
        var m = cell * 0.6, dx = (sl.x - w / 2) / (w * 0.36), dy = (sl.y - vh * 0.45) / (vh * 0.42);
        return sl.x > m && sl.x < w - m && sl.y > m && sl.y < vh - m && dx * dx + dy * dy > 1;
      });
      var tgt = pick(ok.length ? ok : slots);
      tgt.kind = special; tgt.p = specialSprite.p;
      tgt.w = cell * Math.max(tgt.base, 1.05) * specialSprite.scale;
      tgt.rot = rnd(-6, 6) * Math.PI / 180; tgt.alpha = 1;
    }
    slots.forEach(function (sl) { stats[sl.kind]++; });
    slots.sort(function (a, b) {                         // lower = nearer = drawn last
      return (a.kind !== 'pig') - (b.kind !== 'pig') || a.y - b.y;   // the rare find always on top
    });
    return Promise.all(slots.map(function (s) { return s.p; })).then(function (imgs) {
      slots.forEach(function (s, i) {
        var img = imgs[i]; if (!img) return;
        var sw = s.w, sh = sw * VH / VW;
        ctx.save();
        ctx.translate(s.x, s.y); ctx.rotate(s.rot); if (s.flip) ctx.scale(-1, 1);
        ctx.globalAlpha = s.alpha;
        ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
        ctx.restore();
      });
      if (canvas) root.removeChild(canvas);
      canvas = cv; root.insertBefore(cv, root.firstChild);
      // next frame so the fade-in transition actually runs
      requestAnimationFrame(function () { root.className = 'ready'; });
      root.setAttribute('data-counts', JSON.stringify(stats));
    });
  }

  function init() {
    var css = document.createElement('style');
    css.textContent =
      '#pigbg{position:fixed;left:0;top:0;right:0;bottom:0;z-index:-1;pointer-events:none;overflow:hidden}' +
      '#pigbg canvas{position:absolute;left:0;top:0;opacity:0;transition:opacity 1.4s ease;transform-origin:50% 40%}' +
      '#pigbg.ready canvas{opacity:.34}' +
      // dim veil: darker behind the centre column where the cards and title sit
      '#pigbg::after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse 70% 80% at 50% 45%,rgba(10,10,18,.62) 0%,rgba(10,10,18,.35) 60%,rgba(10,10,18,.12) 100%)}' +
      '@media (prefers-reduced-motion:no-preference){#pigbg.ready canvas{animation:pigbgdrift 38s ease-in-out infinite alternate}}' +
      '@keyframes pigbgdrift{from{transform:scale(1.02) translate(0,0)}to{transform:scale(1.05) translate(-.8%,.6%)}}';
    document.head.appendChild(css);
    root = document.createElement('div');
    root.id = 'pigbg';
    root.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(root, document.body.firstChild);
    special = pickKind(Math.random());               // the one per-visit roll
    if (special !== 'pig') specialSprite = slotSprite(special);
    layout();
    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        if (Math.abs(window.innerWidth - laidW) > 60 || window.innerHeight > laidH + 40) layout();
      }, 300);
    });
  }

  // after the page's own card animations have booted
  function later() {
    if (window.requestIdleCallback) requestIdleCallback(init, { timeout: 1200 });
    else setTimeout(init, 200);
  }
  if (document.readyState === 'complete') later();
  else window.addEventListener('load', later);

  // debug/preview hook: platyfyBg.preview('pig'|'dog'|'bread') returns an SVG string
  window.platyfyBg = {
    pickKind: pickKind,
    // which rare find this visit rolled ("pig" = none); force(k) re-lays the field with k, for QA
    special: function () { return special; },
    force: function (k) { special = k; specialSprite = k === "pig" ? null : slotSprite(k); return root ? layout() : null; },
    preview: function (k, o) {
      if (k === 'dog') return dogSVG(o || { coat: 'golden', seed: 5 });
      if (k === 'bread') return breadSVG(o || { shape: 'batard', seed: 5 });
      return pigSVG(o || pigPool[0]);
    },
    breeds: BREED_KEYS, dogs: Object.keys(DOGS)
  };
})();
