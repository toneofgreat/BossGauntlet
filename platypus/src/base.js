// base.js - the military base of level 10 (LEVELS2.md B13). A jungle-edge base at night.
// Everything static is merged by material into a handful of meshes (vertex colours, a prop atlas, two tiling
// textures); sandbags, tall grass and the tree line are InstancedMeshes. There are NO real lights: every
// material carries one shared shader patch ("baseLight") that reads a baked floodlight map by world x/z and
// adds the two searchlight discs, the alarm beacons' red sweep and the fuel blast analytically, so the whole
// base is lit coherently for one texture fetch. Things that open, break or are taken (gates, the armoury
// door, the fuel dump, the fence gap, the rack items) are "parts": a per-vertex id and a uniform vec4 per
// part (offset xyz, scale w), so they cost no draw calls. update() only writes uniforms and a few transforms.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const pt = (x, y, z, yaw) => (yaw === undefined ? { x, y, z } : { x, y, z, yaw });
const camPair = (px, py, pz, lx, ly, lz) => ({ pos: pt(px, py, pz), look: pt(lx, ly, lz) });

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------------------------------------ layout
const X0 = -46, X1 = 46, Z0 = -12, Z1 = 112;          // the walkable world
const FX = 40, FS = 8, FN = 108, FI = 44;             // fences: sides x = +-40, south z = 8, north z = 108, inner z = 44
const RISE = 2.4;                                     // the jungle edge stands this much above the base
const MEZ = { x0: -14.7, x1: 14.7, z0: 80.5, z1: 84.7, y: 3.2 };
const HANGAR = { x0: -15, x1: 15, z0: 63, z1: 85, a: 15, b: 9, door: 11, doorH: 5.2 };
const ARM = { x0: -35.5, x1: -24.5, z0: 74.5, z1: 87.5, t: 0.5, h: 3.0, dz0: 79, dz1: 81 };
const GH = { x0: 8, x1: 12, z0: 38.5, z1: 41.5 };     // guardhouse
const GAP = { z0: 55.5, z1: 60.5 };                   // the stretch of east fence the fuel dump takes with it
const HOLE = { x: -14, hw: 0.7 };
const HUTS = [23, 30, 37];                            // hut centre z; body x -38.6 .. -30, porch to -27.8
const TRUCKS = [{ x: 20, z: 28, yaw: Math.PI }, { x: 24, z: 28.3, yaw: Math.PI }, { x: 28, z: 27.8, yaw: Math.PI }];
const RINGS = [{ x: -12, z: 52 }, { x: 10, z: 55 }, { x: -2, z: 59 }];
const RING_R = 1.7;
const TOWERS = [{ x: -32, z: 14, sx: 1 }, { x: 32, z: 14, sx: -1 }];
const STACKS = [[-6, 18, 3, 2], [8, 24, 2, 3], [-18, 34, 3, 2], [14, 36, 2, 3], [-10, 68, 3, 2], [10.5, 70, 2, 2], [9.5, 77, 2, 2]];
const BARRIERS = [ // x, z, along ("x" | "z")
  [-10, 62.6, "x"], [-6, 62.6, "x"], [-2, 62.6, "x"], [2, 62.6, "x"], [6, 62.6, "x"], [10, 62.6, "x"],
  [29.6, 58, "z"], [29.6, 62.2, "z"], [33, 55.4, "x"], [-10, 38.6, "x"], [20, 38.5, "x"], [-24, 20, "z"],
];
const PUDDLES = [[-10, 22, 1.6], [3, 33, 2.0], [-2, 27.5, 1.5], [18, 20, 1.8], [26, 35, 1.5], [-22, 29, 1.3], [-3, 12, 1.5], [2.5, 41, 1.2],
  [-14, 14.5, 0.9], [-6, 50, 2.2], [14, 58, 1.8], [-18, 56, 1.5], [4, 47.6, 1.2], [-20, 74, 1.6], [30, 65.5, 1.3], [22, 80, 1.5]];
// flood lamps: lamp head (x, h, z), pool centre (px, pz), pool radius r, strength k, group g (0 = always, 1 = the
// apron floods that slam on with the alarm), pole (0 hanging / none, 1 pole, 2 wall bracket)
const LAMPS = [
  { x: -4.6, z: 9.2, h: 7, px: -2.4, pz: 10.6, r: 6.5, k: 1, g: 0, pole: 1 },
  { x: 6.4, z: 9.0, h: 7, px: 3, pz: 10.4, r: 6.5, k: 1, g: 0, pole: 1 },
  { x: 0, z: 7.6, h: 4.2, px: 0, pz: 4.6, r: 4.6, k: 0.8, g: 0, pole: 0 },
  { x: -2, z: 30.4, h: 7.5, px: -2, pz: 29, r: 7.5, k: 1, g: 0, pole: 1 },
  { x: 31.6, z: 23, h: 7, px: 27, pz: 26.5, r: 6.5, k: 0.95, g: 0, pole: 1 },
  { x: -25.6, z: 30, h: 6, px: -24.4, pz: 30, r: 5, k: 0.7, g: 0, pole: 1 },
  { x: -4.6, z: 42.9, h: 6.5, px: -2.6, pz: 41.4, r: 5, k: 0.9, g: 0, pole: 1 },
  { x: 4.6, z: 42.9, h: 6.5, px: 2.6, pz: 41.4, r: 5, k: 0.9, g: 0, pole: 1 },
  { x: 10, z: 40, h: 2.4, px: 10, pz: 40, r: 2.8, k: 0.9, g: 0, pole: 0 },
  { x: -24.3, z: 80, h: 2.9, px: -22.4, pz: 80, r: 4.2, k: 0.85, g: 0, pole: 2 },
  { x: 37.6, z: 56, h: 6.5, px: 35, pz: 59, r: 5.5, k: 0.9, g: 0, pole: 1 },
  { x: 29, z: 91.2, h: 6, px: 30, pz: 89.4, r: 4.6, k: 0.8, g: 0, pole: 1 },
  { x: 0, z: 67, h: 7.6, px: 0, pz: 67, r: 9, k: 0.5, g: 0, pole: 0 },
  { x: 0, z: 74, h: 7.9, px: 0, pz: 74, r: 9, k: 0.5, g: 0, pole: 0 },
  { x: 0, z: 80.6, h: 7.6, px: 0, pz: 81, r: 8, k: 0.55, g: 0, pole: 0 },
  { x: -30, z: 81, h: 2.8, px: -30, pz: 81, r: 7.5, k: 1, g: 0, pole: 0 },
  { x: -24.6, z: 46.6, h: 9, px: -16.5, pz: 51.5, r: 11.5, k: 1.15, g: 1, pole: 1 },
  { x: 24.6, z: 46.6, h: 9, px: 16.5, pz: 51.5, r: 11.5, k: 1.15, g: 1, pole: 1 },
  { x: -8, z: 62.9, h: 7.2, px: -6.5, pz: 56, r: 10, k: 1.15, g: 1, pole: 2 },
  { x: 8, z: 62.9, h: 7.2, px: 6.5, pz: 56, r: 10, k: 1.15, g: 1, pole: 2 },
];
const BEACONS = [[-32, 9.7, 14, 1], [32, 9.7, 14, -1], [0, 9.6, 62.8, 1], [29, 4.3, 88.4, -1]];   // x, y, z, spin
const roadX = (z) => (z < FS ? -0.045 * (FS - z) * (FS - z) : 0);

const ENVS = {
  night: { background: 0x070b12, fog: [0x0a1019, 28, 135], hemi: [0x8496bd, 0x2b2822, 0.62], sun: [0xa9c0ff, 0.55], sunDir: [-0.45, 0.72, -0.4], far: 240, dark: true },
  predawn: { background: 0x1a2233, fog: [0x232c3d, 30, 150], hemi: [0xa3adc8, 0x3a332c, 0.8], sun: [0xc4cdf0, 0.5], sunDir: [-0.5, 0.6, -0.45], far: 240, dark: true },
};

// part ids (uniform vec4 uPart[]: offset xyz, scale w; scale 0 collapses the part out of sight)
const PT = { GATE: 1, GATE_WRECK: 2, INNER: 3, DOOR: 4, DOOR_DOWN: 5, FUEL: 6, FUEL_WRECK: 7, GAP: 8, GAP_OPEN: 9, SUIT: 10, GLASSES: 11, BLASTER: 12, AMMO: 13, TGT: 16 };
const NPART = 20;
// glow kinds (uniform float uLv[]): 0 floods, 1 apron floods, 2 mast lamp, 3 alarm beacons, 4/5 searchlight lamps, 6 always, 7 truck headlights
const NLV = 8;

// grids baked once: ground (0.25 m: concrete, puddle, wear, grass) and light (0.5 m: floods, apron floods)
const GX = -48, GZ = -16, GWM = 96, GDM = 132;
const GW = 384, GD = 528, LW = 192, LD = 264;

// ------------------------------------------------------------------------------------------------ shaders
const VERT_PARS = /* glsl */ `
varying vec3 vBW;
#ifdef BASE_PARTS
attribute float aPart;
uniform vec4 uPart[ ${NPART} ];
#endif
#ifdef BASE_SWAY
uniform vec4 uShock;
uniform vec4 uFocus;
uniform vec4 uBMisc;
#endif
`;
const VERT_MAIN = /* glsl */ `
#ifdef BASE_PARTS
	vec4 bPart = uPart[ int( aPart + 0.5 ) ];
	transformed = transformed * bPart.w + bPart.xyz;
#endif
#if defined( BASE_SWAY ) && defined( USE_INSTANCING )
	{
		vec3 bRoot = instanceMatrix[ 3 ].xyz;
		float bS2 = dot( instanceMatrix[ 0 ].xyz, instanceMatrix[ 0 ].xyz );
		float bWt = uv.y * uv.y;
		float bPh = bRoot.x * 0.7 + bRoot.z * 0.9;
		vec2 bOff = vec2( sin( uBMisc.w * 1.3 + bPh ), cos( uBMisc.w * 1.05 + bPh * 1.3 ) ) * 0.07;
		vec2 bSd = bRoot.xz - uShock.xy;
		float bSl = length( bSd ) + 0.001;
		bOff += bSd / bSl * uShock.w * ( ( 1.0 - smoothstep( 0.0, 2.5, abs( bSl - uShock.z ) ) ) * 0.9 + step( bSl, uShock.z ) * 0.6 );
		vec2 bPd = bRoot.xz - uFocus.xy;
		float bPl = length( bPd ) + 0.001;
		bOff += bPd / bPl * ( 1.0 - smoothstep( 0.0, 0.95, bPl ) ) * 0.5;
		transformed.x += dot( bOff, instanceMatrix[ 0 ].xz ) / bS2 * bWt;
		transformed.z += dot( bOff, instanceMatrix[ 2 ].xz ) / bS2 * bWt;
		transformed.y -= dot( bOff, bOff ) * bWt * 0.6 / sqrt( bS2 );
	}
#endif
	vec4 bW = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
	bW = instanceMatrix * bW;
#endif
	vBW = ( modelMatrix * bW ).xyz;
`;
const FRAG_PARS = /* glsl */ `
varying vec3 vBW;
uniform sampler2D uBLight;
uniform vec4 uBMap;
uniform vec4 uBLvl;
uniform vec4 uBSL[ 2 ];
uniform vec4 uBBlast;
uniform vec4 uBBeacon[ 4 ];
uniform vec4 uBMisc;
#ifdef BASE_GROUND
uniform sampler2D uGround;
uniform sampler2D uDetail;
uniform vec4 uLamp[ 16 ];
uniform float uLampI[ 16 ];
uniform vec3 uMoon;
#endif
vec3 baseLight( vec3 p ) {
	vec4 lm = texture2D( uBLight, ( p.xz - uBMap.xy ) * uBMap.zw );
	float hf = 1.0 - smoothstep( 3.5, 10.5, p.y );
	vec3 c = vec3( 1.0, 0.6, 0.25 ) * ( ( lm.r * uBLvl.x + lm.g * uBLvl.y ) * 1.5 * hf );
	float low = 1.0 - smoothstep( 2.5, 6.0, p.y );
	for ( int i = 0; i < 2; i ++ ) {
		vec2 d = p.xz - uBSL[ i ].xy;
		float q = dot( d, d ) / ( uBSL[ i ].z * uBSL[ i ].z );
		c += vec3( 0.82, 0.92, 1.0 ) * ( uBSL[ i ].w * low * ( 1.0 - smoothstep( 0.6, 1.0, q ) ) );
		c += vec3( 0.2, 0.9, 1.0 ) * ( uBMisc.z * step( 0.01, uBSL[ i ].w ) * low * ( 1.0 - smoothstep( 0.0, 0.07, abs( sqrt( q ) - 1.0 ) ) ) );
	}
	if ( uBLvl.z > 0.001 ) {
		float a = 0.0;
		for ( int i = 0; i < 4; i ++ ) {
			vec2 d = p.xz - uBBeacon[ i ].xy;
			float dl = length( d ) + 0.001;
			float cs = dot( d / dl, vec2( uBMisc.x, uBMisc.y * uBBeacon[ i ].z ) );
			a += pow( max( cs, 0.0 ), 6.0 ) / ( 1.0 + dl * dl * 0.01 );
		}
		c += vec3( 1.0, 0.07, 0.04 ) * ( uBLvl.z * ( 0.07 + 0.95 * a ) * ( 1.0 - smoothstep( 6.0, 14.0, p.y ) ) );
	}
	if ( uBBlast.w > 0.001 ) {
		vec2 d = p.xz - uBBlast.xy;
		c += vec3( 1.0, 0.5, 0.16 ) * ( uBBlast.w / ( 1.0 + dot( d, d ) / ( uBBlast.z * uBBlast.z ) ) );
	}
	return c;
}
`;
const FRAG_COLOR = /* glsl */ `
#ifdef BASE_GROUND
	vec4 bG = texture2D( uGround, ( vBW.xz - uBMap.xy ) * uBMap.zw );
	float bN1 = texture2D( uDetail, vBW.xz * 0.37 ).r;
	float bN2 = texture2D( uDetail, vBW.xz * 0.043 + 0.37 ).g;
	float bN3 = texture2D( uDetail, vBW.xz * 1.9 ).b;
	vec3 bDirt = mix( vec3( 0.15, 0.115, 0.08 ), vec3( 0.25, 0.2, 0.14 ), bN2 ) * ( 0.7 + 0.6 * bN1 ) * ( 0.85 + 0.3 * bN3 );
	vec3 bConc = mix( vec3( 0.27, 0.27, 0.26 ), vec3( 0.36, 0.35, 0.33 ), bN2 ) * ( 0.8 + 0.4 * bN3 );
	vec2 bJg = abs( fract( vBW.xz / 4.0 ) - 0.5 );
	bConc *= 1.0 - 0.5 * smoothstep( 0.4925, 0.4985, max( bJg.x, bJg.y ) );
	bConc *= 1.0 - 0.25 * smoothstep( 0.62, 0.8, bN1 * bN2 * 2.0 );
	vec3 bGrass = mix( vec3( 0.035, 0.06, 0.025 ), vec3( 0.07, 0.1, 0.04 ), bN1 );
	vec3 bAlb = mix( bDirt, bConc, smoothstep( 0.4, 0.6, bG.r + ( bN1 - 0.5 ) * 0.3 ) );
	bAlb = mix( bAlb, bGrass, smoothstep( 0.3, 0.7, bG.a + ( bN1 - 0.5 ) * 0.5 ) );
	bAlb *= 1.0 - 0.55 * bG.b;
	float bPud = smoothstep( 0.42, 0.58, bG.g + ( bN1 - 0.5 ) * 0.18 );
	bAlb *= 1.0 - 0.6 * bPud;
	bAlb *= 1.0 - 0.3 * smoothstep( 0.15, 0.42, bG.g ) * ( 1.0 - bPud );
	diffuseColor.rgb = bAlb;
#endif
`;
const FRAG_EMIT = /* glsl */ `
	totalEmissiveRadiance += diffuseColor.rgb * baseLight( vBW );
#ifdef BASE_GROUND
	if ( bPud > 0.01 ) {
		vec3 bV = normalize( vBW - cameraPosition );
		vec3 bR = normalize( vec3( bV.x + ( bN1 - 0.5 ) * 0.05, - bV.y, bV.z + ( bN3 - 0.5 ) * 0.05 ) );
		float bFr = 0.12 + 0.88 * pow( 1.0 - clamp( bR.y, 0.0, 1.0 ), 4.0 );
		vec3 bAcc = vec3( 0.02, 0.035, 0.06 ) + vec3( 0.75, 0.82, 1.0 ) * pow( max( dot( bR, uMoon ), 0.0 ), 600.0 ) * 2.0;
		for ( int i = 0; i < 16; i ++ ) {
			vec3 bL = uLamp[ i ].xyz - vBW;
			float bT = max( dot( bL, bR ), 0.0 );
			vec3 bC = bL - bR * bT;
			bAcc += mix( vec3( 1.0, 0.62, 0.28 ), vec3( 0.85, 0.93, 1.0 ), uLamp[ i ].w ) * ( uLampI[ i ] * exp( - dot( bC, bC ) * 2.2 / ( 1.0 + 0.012 * bT * bT ) ) );
		}
		totalEmissiveRadiance += bAcc * bPud * bFr;
	}
#endif
`;
const FRAG_UPN = /* glsl */ `
#ifdef BASE_UPN
	normal = normalize( vNormal );
#endif
`;
const GLOW_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aKind;
uniform float uLv[ ${NLV} ];
uniform float uPx;
varying vec3 vC;
void main() {
	vec4 mv = modelViewMatrix * vec4( position, 1.0 );
	gl_Position = projectionMatrix * mv;
	float lv = uLv[ int( aKind + 0.5 ) ];
	vC = aColor * lv;
	gl_PointSize = clamp( aSize * uPx * projectionMatrix[ 1 ][ 1 ] / max( 0.1, - mv.z ), 0.0, 200.0 ) * step( 0.004, lv );
}`;
const GLOW_FRAG = /* glsl */ `
varying vec3 vC;
void main() {
	vec2 c = gl_PointCoord * 2.0 - 1.0;
	float a = pow( max( 0.0, 1.0 - length( c ) ), 2.4 ) * 0.9 + exp( - abs( c.y ) * 14.0 ) * pow( max( 0.0, 1.0 - abs( c.x ) ), 2.0 ) * 0.28;
	gl_FragColor = vec4( vC * a, 1.0 );
	#include <colorspace_fragment>
}`;
const BULB_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aKind;
uniform float uLv[ ${NLV} ];
varying vec3 vC;
void main() {
	vC = aColor * ( 0.06 + uLv[ int( aKind + 0.5 ) ] );
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;
const BULB_FRAG = /* glsl */ `
varying vec3 vC;
void main() {
	gl_FragColor = vec4( vC, 1.0 );
	#include <colorspace_fragment>
}`;
const CONE_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aKind;
attribute float aT;
uniform float uLv[ ${NLV} ];
varying vec3 vC;
varying vec3 vN;
varying vec3 vV;
void main() {
	vec4 mv = modelViewMatrix * vec4( position, 1.0 );
	vV = mv.xyz;
	vN = normalMatrix * normal;
	vC = aColor * ( uLv[ int( aKind + 0.5 ) ] * mix( 1.0, 0.12, aT ) );
	gl_Position = projectionMatrix * mv;
}`;
const CONE_FRAG = /* glsl */ `
varying vec3 vC;
varying vec3 vN;
varying vec3 vV;
void main() {
	float rim = abs( dot( normalize( vN ), normalize( vV ) ) );
	gl_FragColor = vec4( vC * pow( rim, 1.5 ), 1.0 );
	#include <colorspace_fragment>
}`;
const SKY_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;
const SKY_FRAG = /* glsl */ `
uniform sampler2D uSky;
uniform vec3 uFogC;
uniform float uDawn;
varying vec2 vUv;
void main() {
	vec4 t = texture2D( uSky, vUv );
	float h = clamp( ( vUv.y - 0.087 ) / 0.913, 0.0, 1.0 );
	vec3 c = t.rgb * mix( 1.0, 0.4, uDawn );
	vec3 dawn = mix( vec3( 0.62, 0.33, 0.24 ), vec3( 0.1, 0.16, 0.3 ), smoothstep( 0.0, 0.42, h ) );
	c += dawn * uDawn * 0.8;
	c = mix( uFogC, c, smoothstep( 0.0, 0.16, h ) );
	c = mix( uFogC * 0.45, c, t.a );
	gl_FragColor = vec4( c, 1.0 );
	#include <colorspace_fragment>
}`;

// ------------------------------------------------------------------------------------------------ textures (all drawn once)
function tileNoise(n, cells, rnd) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const out = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const fx = (i / n) * cells, fz = (j / n) * cells;
      const ix = Math.floor(fx), iz = Math.floor(fz);
      let tx = fx - ix, tz = fz - iz;
      tx = tx * tx * (3 - 2 * tx); tz = tz * tz * (3 - 2 * tz);
      const a = g[(iz % cells) * cells + (ix % cells)], b = g[(iz % cells) * cells + ((ix + 1) % cells)];
      const c = g[((iz + 1) % cells) * cells + (ix % cells)], d = g[((iz + 1) % cells) * cells + ((ix + 1) % cells)];
      out[j * n + i] = a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
    }
  }
  return out;
}
function dataTex(THREE, n, data, srgb) {
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}
function makeDetailTex(THREE, rnd) {
  const n = 256, a = tileNoise(n, 32, rnd), b = tileNoise(n, 64, rnd), c = tileNoise(n, 4, rnd), d = tileNoise(n, 8, rnd), e = tileNoise(n, 16, rnd);
  const px = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    px[i * 4] = 255 * clamp(a[i] * 0.6 + b[i] * 0.4, 0, 1);
    px[i * 4 + 1] = 255 * clamp(c[i] * 0.6 + d[i] * 0.4, 0, 1);
    px[i * 4 + 2] = 255 * clamp(e[i] * 0.5 + rnd() * 0.5, 0, 1);
    px[i * 4 + 3] = 255;
  }
  return dataTex(THREE, n, px, false);
}
function makeConcreteTex(THREE, rnd) {
  const n = 256, a = tileNoise(n, 8, rnd), b = tileNoise(n, 64, rnd), s = tileNoise(n, 32, rnd);
  const px = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      let v = 0.74 + 0.2 * (a[k] - 0.5) + 0.12 * (b[k] - 0.5);
      if (rnd() < 0.012) v -= 0.22;
      if (j % 128 < 2) v -= 0.13;
      v -= 0.16 * sm(0.55, 0.9, s[i]) * (0.3 + 0.7 * a[k]);
      v = clamp(v, 0, 1);
      px[k * 4] = 255 * v; px[k * 4 + 1] = 252 * v; px[k * 4 + 2] = 243 * v; px[k * 4 + 3] = 255;
    }
  }
  return dataTex(THREE, n, px, true);
}
function makeCorrugatedTex(THREE, rnd) {
  const n = 128, a = tileNoise(n, 8, rnd), b = tileNoise(n, 16, rnd);
  const px = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i, w = Math.sin((i / n) * TAU * 8);
      const ridge = 0.6 + 0.3 * w + 0.1 * Math.max(0, w) * Math.max(0, w);
      const m = a[(j >> 3) * n + i], rust = sm(0.6, 0.88, m * 0.6 + b[k] * 0.5);
      const v = ridge * (0.82 + 0.18 * b[k]);
      px[k * 4] = 255 * clamp(v * (1 - rust) + 0.52 * ridge * rust, 0, 1);
      px[k * 4 + 1] = 255 * clamp(v * (1 - rust) + 0.33 * ridge * rust, 0, 1);
      px[k * 4 + 2] = 255 * clamp(v * (1 - rust) + 0.2 * ridge * rust, 0, 1);
      px[k * 4 + 3] = 255;
    }
  }
  return dataTex(THREE, n, px, true);
}
function mkCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function canvasTex(THREE, c, repeatS) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = repeatS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}
function speckle(g, x, y, w, h, n, rnd, color, a0, a1, s) {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    g.globalAlpha = a0 + (a1 - a0) * rnd();
    const r = (s || 2) * (0.4 + rnd());
    g.fillRect(x + rnd() * w, y + rnd() * h, r, r);
  }
  g.globalAlpha = 1;
}

// the prop atlas: 4 x 4 cells of 256 px
const CELLS = ["crate", "crateTop", "drum", "drumTop", "burlap", "tarp", "target", "ammo", "door", "window", "grille", "pallet", "peg", "steel", "tyre", "plain"];
const CELL = {};
for (let i = 0; i < 16; i++) {
  const cx = i % 4, cy = i >> 2, p = 4 / 1024;
  CELL[CELLS[i]] = [cx / 4 + p, 1 - (cy + 1) / 4 + p, (cx + 1) / 4 - p, 1 - cy / 4 - p];
}
function makeAtlas(THREE, rnd) {
  const c = mkCanvas(1024, 1024), g = c.getContext("2d");
  const cell = (name, fn) => {
    const i = CELLS.indexOf(name);
    g.save(); g.translate((i % 4) * 256, (i >> 2) * 256);
    g.beginPath(); g.rect(0, 0, 256, 256); g.clip();
    fn(); g.restore();
  };
  const planks = (base, dark, nb, vertical) => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    for (let b = 0; b < nb; b++) {
      const o = (b * 256) / nb, w = 256 / nb;
      g.globalAlpha = 0.1 + 0.16 * rnd(); g.fillStyle = rnd() < 0.5 ? "#000" : "#fff";
      if (vertical) g.fillRect(o, 0, w, 256); else g.fillRect(0, o, 256, w);
      g.globalAlpha = 0.35; g.strokeStyle = dark; g.lineWidth = 1;
      for (let k = 0; k < 5; k++) {
        const q = o + 3 + rnd() * (w - 6);
        g.beginPath();
        if (vertical) { g.moveTo(q, 0); g.bezierCurveTo(q + 3, 80, q - 3, 170, q + 1, 256); } else { g.moveTo(0, q); g.bezierCurveTo(80, q + 3, 170, q - 3, 256, q + 1); }
        g.stroke();
      }
      g.globalAlpha = 0.85; g.fillStyle = dark;
      if (vertical) g.fillRect(o - 1.5, 0, 3, 256); else g.fillRect(0, o - 1.5, 256, 3);
    }
    g.globalAlpha = 1;
  };
  const stencil = (txt, x, y, size, color) => { g.font = "bold " + size + "px Impact, Arial Narrow, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = color; g.fillText(txt, x, y); };
  cell("crate", () => {
    planks("#b3a27d", "#3a2f1e", 5, false);
    g.fillStyle = "#9c8a66"; g.fillRect(0, 0, 256, 24); g.fillRect(0, 232, 256, 24); g.fillRect(0, 0, 24, 256); g.fillRect(232, 0, 24, 256);
    g.strokeStyle = "#3a2f1e"; g.lineWidth = 2; g.strokeRect(1, 1, 254, 254); g.strokeRect(24, 24, 208, 208);
    g.save(); g.translate(128, 128); g.rotate(Math.atan2(208, 208)); g.fillStyle = "#a39170"; g.fillRect(-150, -12, 300, 24); g.strokeRect(-150, -12, 300, 24); g.restore();
    g.globalAlpha = 0.8; stencil("B9 - 0417", 128, 70, 30, "#1c1a14"); stencil("THIS SIDE UP", 128, 190, 22, "#1c1a14"); g.globalAlpha = 1;
    g.fillStyle = "#26221a"; for (const [x, y] of [[12, 12], [244, 12], [12, 244], [244, 244]]) { g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); }
    speckle(g, 0, 0, 256, 256, 260, rnd, "#2a2216", 0.05, 0.25, 2);
  });
  cell("crateTop", () => { planks("#ac9b76", "#352b1b", 6, true); g.fillStyle = "#9a8862"; g.fillRect(0, 40, 256, 22); g.fillRect(0, 194, 256, 22); speckle(g, 0, 0, 256, 256, 200, rnd, "#2a2216", 0.05, 0.25, 2); });
  cell("drum", () => {
    g.fillStyle = "#aeb3a4"; g.fillRect(0, 0, 256, 256);
    for (const y of [4, 84, 170, 250]) { g.fillStyle = "#70756a"; g.fillRect(0, y - 5, 256, 10); g.fillStyle = "#d4d8ca"; g.fillRect(0, y - 6, 256, 2); }
    g.fillStyle = "#e9e6da"; g.fillRect(34, 100, 60, 56); g.fillStyle = "#c4281c";
    g.beginPath(); g.moveTo(64, 104); g.lineTo(90, 128); g.lineTo(64, 152); g.lineTo(38, 128); g.closePath(); g.fill();
    stencil("FUEL", 176, 128, 34, "#23261f");
    speckle(g, 0, 190, 256, 66, 220, rnd, "#5a3a22", 0.1, 0.5, 3); speckle(g, 0, 0, 256, 256, 160, rnd, "#30332b", 0.05, 0.3, 2);
  });
  cell("drumTop", () => {
    g.fillStyle = "#777c70"; g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#a4a99b"; g.beginPath(); g.arc(128, 128, 118, 0, TAU); g.fill();
    g.strokeStyle = "#5c6156"; g.lineWidth = 8; g.beginPath(); g.arc(128, 128, 112, 0, TAU); g.stroke();
    g.fillStyle = "#4a4e45"; g.beginPath(); g.arc(178, 96, 14, 0, TAU); g.fill(); g.beginPath(); g.arc(84, 170, 7, 0, TAU); g.fill();
    speckle(g, 20, 20, 216, 216, 120, rnd, "#5a3a22", 0.08, 0.4, 3);
  });
  cell("burlap", () => {
    g.fillStyle = "#a08c62"; g.fillRect(0, 0, 256, 256);
    g.lineWidth = 1;
    for (let i = 0; i < 256; i += 4) { g.globalAlpha = 0.18 + 0.2 * rnd(); g.strokeStyle = rnd() < 0.5 ? "#5e4f32" : "#c9b78a"; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 2, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i + 2); g.stroke(); }
    g.globalAlpha = 1;
    const sh = g.createRadialGradient(128, 128, 60, 128, 128, 190); sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(20,14,6,0.6)");
    g.fillStyle = sh; g.fillRect(0, 0, 256, 256);
    speckle(g, 0, 0, 256, 256, 200, rnd, "#3d321d", 0.08, 0.3, 3);
  });
  cell("tarp", () => {
    g.fillStyle = "#70745a"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 26; i++) {
      const x = rnd() * 256, y = rnd() * 256, l = 40 + rnd() * 120, a = rnd() * TAU;
      const gr = g.createLinearGradient(x, y, x + Math.cos(a + 1.57) * 14, y + Math.sin(a + 1.57) * 14);
      gr.addColorStop(0, "rgba(255,255,230,0.10)"); gr.addColorStop(0.5, "rgba(0,0,0,0.16)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.strokeStyle = gr; g.lineWidth = 12; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    g.strokeStyle = "rgba(30,32,22,0.7)"; g.lineWidth = 2; g.setLineDash([7, 5]);
    for (const q of [64, 192]) { g.beginPath(); g.moveTo(q, 0); g.lineTo(q, 256); g.stroke(); g.beginPath(); g.moveTo(0, q); g.lineTo(256, q); g.stroke(); }
    g.setLineDash([]);
    speckle(g, 0, 0, 256, 256, 300, rnd, "#2c2f22", 0.05, 0.22, 3);
  });
  cell("target", () => {
    g.fillStyle = "#b99b6b"; g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#1b1b1b"; g.beginPath(); g.arc(128, 62, 30, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(52, 256); g.lineTo(60, 128); g.quadraticCurveTo(128, 84, 196, 128); g.lineTo(204, 256); g.closePath(); g.fill();
    g.strokeStyle = "#e9e3d2"; g.lineWidth = 3; for (const r of [16, 34, 52]) { g.beginPath(); g.arc(128, 168, r, 0, TAU); g.stroke(); }
    speckle(g, 0, 0, 256, 256, 120, rnd, "#6e5a3a", 0.1, 0.3, 3);
  });
  cell("ammo", () => {
    g.fillStyle = "#59603e"; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "#2f3422"; g.lineWidth = 6; g.strokeRect(6, 6, 244, 244); g.fillStyle = "#3a4029"; g.fillRect(0, 60, 256, 8);
    stencil("40 RDS", 128, 122, 46, "#d9b53a"); stencil("STUN BOLT", 128, 180, 32, "#d9b53a");
    g.fillStyle = "#23261a"; g.fillRect(104, 18, 48, 26);
    speckle(g, 0, 0, 256, 256, 160, rnd, "#24281a", 0.08, 0.3, 3);
  });
  cell("door", () => {
    planks("#6f7762", "#23271c", 6, true);
    g.strokeStyle = "#2a2e22"; g.lineWidth = 10; g.strokeRect(5, 5, 246, 246);
    g.fillStyle = "#5c6451"; g.fillRect(10, 60, 236, 18); g.fillRect(10, 180, 236, 18);
    g.fillStyle = "#1a1c16"; g.beginPath(); g.arc(214, 132, 9, 0, TAU); g.fill();
  });
  cell("window", () => {
    g.fillStyle = "#5c6350"; g.fillRect(0, 0, 256, 256);
    const gl = g.createLinearGradient(0, 0, 256, 256); gl.addColorStop(0, "#0c1218"); gl.addColorStop(0.5, "#17222c"); gl.addColorStop(1, "#070a0e");
    g.fillStyle = gl; g.fillRect(18, 18, 220, 220);
    g.fillStyle = "rgba(160,190,220,0.10)"; g.beginPath(); g.moveTo(18, 150); g.lineTo(150, 18); g.lineTo(200, 18); g.lineTo(18, 200); g.fill();
    g.fillStyle = "#4b5142"; g.fillRect(122, 18, 12, 220); g.fillRect(18, 122, 220, 12);
  });
  cell("grille", () => {
    g.fillStyle = "#535a3e"; g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#15170f"; g.fillRect(64, 40, 128, 176);
    g.fillStyle = "#3d432d"; for (let y = 52; y < 210; y += 18) g.fillRect(64, y, 128, 6);
    for (const x of [32, 224]) { g.fillStyle = "#22251a"; g.beginPath(); g.arc(x, 120, 26, 0, TAU); g.fill(); g.fillStyle = "#8d8f80"; g.beginPath(); g.arc(x, 120, 19, 0, TAU); g.fill(); }
    speckle(g, 0, 0, 256, 256, 140, rnd, "#23271a", 0.08, 0.3, 3);
  });
  cell("pallet", () => { g.fillStyle = "#0e0c08"; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 6; i++) { g.fillStyle = rnd() < 0.5 ? "#9b8862" : "#8b7954"; g.fillRect(0, i * 43 + 3, 256, 34); } speckle(g, 0, 0, 256, 256, 200, rnd, "#2a2216", 0.08, 0.3, 2); });
  cell("peg", () => {
    g.fillStyle = "#454b4e"; g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#1d2022"; for (let y = 16; y < 256; y += 24) for (let x = 16; x < 256; x += 24) { g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); }
    g.strokeStyle = "#6b7376"; g.lineWidth = 6; g.strokeRect(3, 3, 250, 250);
  });
  cell("steel", () => {
    g.fillStyle = "#6a7072"; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "#3c4042"; g.lineWidth = 8; g.strokeRect(4, 4, 248, 248); g.lineWidth = 3; g.strokeRect(28, 28, 200, 200);
    g.fillStyle = "#34383a"; for (let i = 0; i < 9; i++) for (const [x, y] of [[16 + i * 28, 16], [16 + i * 28, 240], [16, 16 + i * 28], [240, 16 + i * 28]]) { g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.fill(); }
    g.save(); g.beginPath(); g.rect(28, 196, 200, 32); g.clip();
    for (let x = -40; x < 260; x += 36) { g.fillStyle = "#d1a41c"; g.beginPath(); g.moveTo(x, 228); g.lineTo(x + 18, 228); g.lineTo(x + 50, 196); g.lineTo(x + 32, 196); g.fill(); }
    g.restore();
    stencil("ARMOURY", 128, 96, 40, "#e4e0d2"); stencil("AUTHORISED ONLY", 128, 146, 20, "#e4e0d2");
    speckle(g, 0, 0, 256, 256, 260, rnd, "#4a3220", 0.05, 0.3, 3);
  });
  cell("tyre", () => {
    g.fillStyle = "#1a1b1c"; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "#08080a"; g.lineWidth = 7;
    for (let x = 0; x < 256; x += 22) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 11, 128); g.lineTo(x, 256); g.stroke(); }
    speckle(g, 0, 0, 256, 256, 160, rnd, "#4a4338", 0.05, 0.25, 3);
  });
  cell("plain", () => { g.fillStyle = "#ffffff"; g.fillRect(0, 0, 256, 256); });
  return canvasTex(THREE, c, false);
}

// the decal sheet (alpha-tested): signs, stencils, paint. Returns { tex, rect: { name: [u0, v0, u1, v1] } }
function makeDecals(THREE, rnd) {
  const S = 1024, c = mkCanvas(S, S), g = c.getContext("2d"), rect = {};
  let sx = 4, sy = 4, sh = 0;
  const item = (name, w, h, fn) => {
    if (sx + w + 4 > S) { sx = 4; sy += sh + 8; sh = 0; }
    g.save(); g.translate(sx, sy); g.beginPath(); g.rect(0, 0, w, h); g.clip(); fn(w, h); g.restore();
    rect[name] = [(sx + 1) / S, 1 - (sy + h - 1) / S, (sx + w - 1) / S, 1 - (sy + 1) / S];
    sx += w + 8; sh = Math.max(sh, h);
  };
  const text = (t, x, y, size, color) => { g.font = "bold " + size + "px Impact, Arial Narrow, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = color; g.fillText(t, x, y); };
  const wear = (w, h, n) => { g.globalCompositeOperation = "destination-out"; speckle(g, 0, 0, w, h, n, rnd, "#000", 0.7, 1, 4); g.globalCompositeOperation = "source-over"; };
  const plate = (w, h, bg, border) => { g.fillStyle = border; g.fillRect(0, 0, w, h); g.fillStyle = bg; g.fillRect(8, 8, w - 16, h - 16); };
  item("restricted", 320, 180, (w, h) => { plate(w, h, "#e8e4d6", "#b3261c"); text("RESTRICTED AREA", w / 2, 60, 44, "#b3261c"); text("NO ENTRY", w / 2, 122, 50, "#1a1a1a"); });
  item("fuel", 320, 180, (w, h) => { plate(w, h, "#dcae1e", "#1a1a1a"); text("FUEL DUMP", w / 2, 62, 54, "#1a1a1a"); text("NO SMOKING", w / 2, 124, 44, "#b3261c"); });
  item("keepout", 320, 100, (w, h) => { plate(w, h, "#b3261c", "#e8e4d6"); text("KEEP OUT", w / 2, h / 2 + 2, 60, "#f1ede0"); });
  item("armoury", 420, 100, (w, h) => { text("ARMOURY", w / 2, h / 2, 96, "#e6e2d4"); wear(w, h, 110); });
  item("hangar", 420, 120, (w, h) => { text("HANGAR 1", w / 2, h / 2, 108, "#e6e2d4"); wear(w, h, 130); });
  item("motor", 420, 84, (w, h) => { text("MOTOR POOL", w / 2, h / 2, 76, "#e6e2d4"); wear(w, h, 110); });
  for (const n of ["B-1", "B-2", "B-3"]) item(n, 130, 100, (w, h) => { text(n, w / 2, h / 2, 76, "#e6e2d4"); wear(w, h, 40); });
  item("twrW", 200, 84, (w, h) => { text("TWR-W", w / 2, h / 2, 68, "#e6e2d4"); wear(w, h, 50); });
  item("twrE", 200, 84, (w, h) => { text("TWR-E", w / 2, h / 2, 68, "#e6e2d4"); wear(w, h, 50); });
  item("num", 220, 200, (w, h) => { text("07", w / 2, h / 2, 190, "#d6a81e"); wear(w, h, 160); });
  item("stop", 160, 160, (w, h) => {
    g.fillStyle = "#b3261c"; g.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i + 0.5) * TAU / 8; g.lineTo(w / 2 + Math.cos(a) * 78, h / 2 + Math.sin(a) * 78); }
    g.closePath(); g.fill(); g.strokeStyle = "#f1ede0"; g.lineWidth = 6; g.stroke(); text("STOP", w / 2, h / 2 + 2, 54, "#f1ede0");
  });
  item("arrow", 110, 200, (w, h) => { g.fillStyle = "#d6a81e"; g.beginPath(); g.moveTo(w / 2, 4); g.lineTo(w - 6, 80); g.lineTo(w / 2 + 18, 80); g.lineTo(w / 2 + 18, h - 4); g.lineTo(w / 2 - 18, h - 4); g.lineTo(w / 2 - 18, 80); g.lineTo(6, 80); g.closePath(); g.fill(); wear(w, h, 70); });
  item("hazard", 256, 48, (w, h) => { g.fillStyle = "#d6a81e"; g.fillRect(0, 0, w, h); g.fillStyle = "#17171a"; for (let x = -60; x < w + 60; x += 48) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 24, h); g.lineTo(x + 24 + h, 0); g.lineTo(x + h, 0); g.fill(); } });
  item("white", 32, 32, (w, h) => { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); });
  item("line", 256, 32, (w, h) => { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); wear(w, h, 60); });
  const blotch = (w, h, color, n) => {
    g.fillStyle = color;
    for (let i = 0; i < n; i++) { const a = rnd() * TAU, d = Math.pow(rnd(), 0.7) * w * 0.36, r = w * (0.05 + 0.12 * rnd()) * (1 - d / (w * 0.5)); g.beginPath(); g.arc(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, Math.max(2, r), 0, TAU); g.fill(); }
    for (let i = 0; i < 26; i++) { const a = rnd() * TAU, l = w * (0.3 + 0.19 * rnd()); g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.cos(a - 0.05) * l * 0.5, h / 2 + Math.sin(a - 0.05) * l * 0.5); g.lineTo(w / 2 + Math.cos(a) * l, h / 2 + Math.sin(a) * l); g.lineTo(w / 2 + Math.cos(a + 0.05) * l * 0.5, h / 2 + Math.sin(a + 0.05) * l * 0.5); g.fill(); }
  };
  item("scorch", 256, 256, (w, h) => blotch(w, h, "#0a0908", 90));
  item("oil", 128, 128, (w, h) => blotch(w, h, "#12110f", 40));
  const tex = canvasTex(THREE, c, false);
  return { tex, rect };
}

// chain-link: 256 px = 1.5 m along, the lower 84 % is the mesh, the top band is three strands of barbed wire
function makeFenceTex(THREE, rnd) {
  const c = mkCanvas(256, 512), g = c.getContext("2d");
  const y0 = 82, P = (512 - y0) / 22;
  g.lineWidth = 2.3; g.lineCap = "round";
  for (let r = 0; r < 22; r++) {
    for (let k = 0; k < 16; k++) {
      const v = 150 + Math.floor(rnd() * 50);
      g.strokeStyle = "rgb(" + v + "," + (v + 6) + "," + (v + 8) + ")";
      const x = k * 16, y = y0 + r * P;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8, y + P / 2); g.lineTo(x + 16, y); g.stroke();
      g.beginPath(); g.moveTo(x, y + P); g.lineTo(x + 8, y + P / 2); g.lineTo(x + 16, y + P); g.stroke();
    }
  }
  g.strokeStyle = "#aab2b5"; g.lineWidth = 5; g.beginPath(); g.moveTo(0, y0 + 2); g.lineTo(256, y0 + 2); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.moveTo(0, 509); g.lineTo(256, 509); g.stroke();
  for (const y of [12, 38, 64]) {
    g.strokeStyle = "#9aa2a4"; g.lineWidth = 2.6; g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke();
    g.lineWidth = 2;
    for (let x = 10; x < 256; x += 21.33) { g.beginPath(); g.moveTo(x - 5, y - 6); g.lineTo(x + 5, y + 6); g.moveTo(x + 5, y - 6); g.lineTo(x - 5, y + 6); g.stroke(); }
  }
  return canvasTex(THREE, c, true);
}
function makeGrassTex(THREE, rnd) {
  const c = mkCanvas(128, 128), g = c.getContext("2d");
  g.lineCap = "round";
  for (let i = 0; i < 30; i++) {
    const x = 8 + rnd() * 112, h = 50 + rnd() * 74, lean = (rnd() - 0.5) * 50, v = 60 + Math.floor(rnd() * 70);
    g.strokeStyle = "rgb(" + Math.floor(v * 0.55) + "," + v + "," + Math.floor(v * 0.36) + ")";
    for (let s = 0; s < 3; s++) {
      g.lineWidth = 5 - s * 1.6;
      g.beginPath(); g.moveTo(x, 128 - (h * s) / 3); g.quadraticCurveTo(x + lean * 0.2, 128 - h * 0.6, x + lean * ((s + 1) / 3), 128 - (h * (s + 1)) / 3 - 0.01); g.stroke();
    }
  }
  return canvasTex(THREE, c, false);
}
function makeTreeTex(THREE, rnd) {
  const W = 512, H = 256, c = mkCanvas(W, H), g = c.getContext("2d");
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < 9; i++) {
      const x = 20 + ((i + rnd() * 0.6) / 9) * (W - 40), top = 20 + rnd() * 90 + layer * 30, v = 20 + layer * 12 + Math.floor(rnd() * 12);
      g.fillStyle = "rgb(" + Math.floor(v * 0.6) + "," + Math.floor(v * 0.5) + "," + Math.floor(v * 0.35) + ")";
      g.fillRect(x - 3, top + 20, 6 + rnd() * 5, H - top);
      g.fillStyle = "rgb(" + Math.floor(v * 0.55) + "," + v + "," + Math.floor(v * 0.5) + ")";
      for (let k = 0; k < 16; k++) { g.beginPath(); g.ellipse(x + (rnd() - 0.5) * 80, top + rnd() * 70, 14 + rnd() * 26, 9 + rnd() * 16, 0, 0, TAU); g.fill(); }
    }
  }
  g.fillStyle = "rgb(12,20,11)";
  for (let i = 0; i < 90; i++) { g.beginPath(); g.ellipse(rnd() * W, H - 10 - rnd() * 70, 16 + rnd() * 30, 10 + rnd() * 22, 0, 0, TAU); g.fill(); }
  g.fillRect(0, H - 16, W, 16);
  return canvasTex(THREE, c, false);
}
function makeSkyTex(THREE, rnd, moonU, moonV, moonSin) {
  const W = 2048, H = 512, c = mkCanvas(W, H), g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, "#04060d"); gr.addColorStop(0.55, "#0a1220"); gr.addColorStop(0.92, "#16202f"); gr.addColorStop(1, "#16202f");
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1500; i++) {
    const band = i < 500, x = rnd() * W;
    const y = band ? clamp(150 + Math.sin((x / W) * TAU) * 90 + (rnd() - 0.5) * 110, 0, 440) : Math.pow(rnd(), 1.3) * 450;
    const b = rnd();
    g.globalAlpha = (band ? 0.25 : 0.35) + 0.6 * b * b;
    g.fillStyle = b > 0.9 ? "#ffe9c8" : b > 0.8 ? "#cfe0ff" : "#ffffff";
    const s = b > 0.96 ? 2.2 : b > 0.7 ? 1.4 : 1;
    g.fillRect(x, y, s, s);
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 14; i++) {
    const x = rnd() * W, y = 300 + rnd() * 130, w = 120 + rnd() * 260;
    const cg = g.createRadialGradient(x, y, 2, x, y, w);
    cg.addColorStop(0, "rgba(70,84,110,0.2)"); cg.addColorStop(1, "rgba(70,84,110,0)");
    g.save(); g.translate(x, y); g.scale(1, 0.14); g.translate(-x, -y); g.fillStyle = cg; g.fillRect(x - w, y - w, w * 2, w * 2); g.restore();
  }
  const mx = moonU * W, my = (1 - moonV) * H;
  for (const ox of [-W, 0, W]) {
    const halo = g.createRadialGradient(mx + ox, my, 6, mx + ox, my, 120);
    halo.addColorStop(0, "rgba(190,205,255,0.5)"); halo.addColorStop(0.2, "rgba(150,170,230,0.16)"); halo.addColorStop(1, "rgba(120,140,200,0)");
    g.fillStyle = halo; g.fillRect(mx + ox - 120, my - 120, 240, 240);
    g.save(); g.translate(mx + ox, my); g.scale(1.09 / Math.max(0.3, moonSin || 1), 1);
    g.fillStyle = "#eef1ff"; g.beginPath(); g.arc(0, 0, 13, 0, TAU); g.fill();
    g.fillStyle = "rgba(150,160,190,0.5)"; g.beginPath(); g.arc(-4, -3, 3.4, 0, TAU); g.fill(); g.beginPath(); g.arc(4, 4, 2.6, 0, TAU); g.fill(); g.beginPath(); g.arc(3, -6, 1.8, 0, TAU); g.fill();
    g.restore();
  }
  // the jungle on the horizon: cut out (alpha 0), the shader paints it with the fog colour
  g.globalCompositeOperation = "destination-out"; g.fillStyle = "#000";
  g.beginPath(); g.moveTo(0, H);
  let y = 440;
  for (let x = 0; x <= W; x += 6) {
    y += (rnd() - 0.5) * 7; y = clamp(y, 424, 456);
    const yy = x > W - 120 ? y + (440 - y) * ((x - (W - 120)) / 120) : y;
    g.lineTo(x, yy - (rnd() < 0.06 ? 6 + rnd() * 10 : 0));
  }
  g.lineTo(W, H); g.closePath(); g.fill();
  g.globalCompositeOperation = "source-over";
  const t = canvasTex(THREE, c, true);
  t.anisotropy = 1;
  return t;
}

// ================================================================================================ the world
export function createBase(ctx) {
  const THREE = ctx.THREE;
  const audio = ctx.audio || {}, fx = ctx.fx || {};
  const rnd = mulberry(90210);
  const R = (a, b) => a + (b - a) * rnd();
  const group = new THREE.Group();
  group.name = "base";

  // ---------------------------------------------------------------------------------------------- registries
  // walls: axis-aligned boxes nobody walks through (confine); sight = also blocks eyes; small = a platypus fits
  // through / under (the fence hole, the trucks). cover: circles that stop bullets (combat.js).
  const walls = [], sightBoxes = [], cover = [], colliders = [], coverPoints = [], hideRects = [], sneakRects = [];
  function coverBox(x0, x1, z0, z1, h, surface) {
    const w = x1 - x0, d = z1 - z0, t = Math.min(w, d) / 2, r = t + 0.3, L = Math.max(w, d);
    const s = Math.max(0.5, 2 * Math.sqrt(r * r - t * t) * 0.9);
    const n = Math.max(1, Math.ceil((L - 2 * t) / s) + 1), out = [];
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? L / 2 : t + ((L - 2 * t) * i) / (n - 1);
      const c = { x: w >= d ? x0 + f : (x0 + x1) / 2, z: w >= d ? (z0 + z1) / 2 : z0 + f, r, h, surface: surface || "concrete", on: true };
      cover.push(c); out.push(c);
    }
    return out;
  }
  function wall(x0, x1, z0, z1, o) {
    o = o || {};
    const w = { x0, x1, z0, z1, on: true, small: !!o.small, sight: !!o.sight, covers: null };
    walls.push(w);
    if (o.sight) sightBoxes.push(w);
    if (o.h && o.cover !== false) w.covers = coverBox(x0, x1, z0, z1, o.h, o.surface);
    return w;
  }
  function setWall(w, on) {
    w.on = on;
    if (w.covers) for (let i = 0; i < w.covers.length; i++) w.covers[i].on = on;
  }
  // cover points on the chosen sides of a box; facing = the yaw that looks over the cover
  function coverPts(x, z, hw, hd, sides) {
    if (sides.indexOf("s") >= 0) coverPoints.push({ x, z: z - hd - 0.75, facing: 0 });
    if (sides.indexOf("n") >= 0) coverPoints.push({ x, z: z + hd + 0.75, facing: Math.PI });
    if (sides.indexOf("w") >= 0) coverPoints.push({ x: x - hw - 0.75, z, facing: Math.PI / 2 });
    if (sides.indexOf("e") >= 0) coverPoints.push({ x: x + hw + 0.75, z, facing: -Math.PI / 2 });
  }

  // ---------------------------------------------------------------------------------------------- baked grids
  const lg0 = new Float32Array(LW * LD), lg1 = new Float32Array(LW * LD);
  for (const L of LAMPS) {
    const g = L.g ? lg1 : lg0;
    const i0 = Math.max(0, Math.floor((L.px - L.r - GX) * 2)), i1 = Math.min(LW - 1, Math.ceil((L.px + L.r - GX) * 2));
    const j0 = Math.max(0, Math.floor((L.pz - L.r - GZ) * 2)), j1 = Math.min(LD - 1, Math.ceil((L.pz + L.r - GZ) * 2));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = GX + (i + 0.5) * 0.5 - L.px, dz = GZ + (j + 0.5) * 0.5 - L.pz, q = 1 - (dx * dx + dz * dz) / (L.r * L.r);
        if (q > 0) g[j * LW + i] += L.k * Math.pow(q, 1.5);
      }
    }
  }
  const lightPx = new Uint8Array(LW * LD * 4);
  for (let k = 0; k < LW * LD; k++) { lightPx[k * 4] = Math.min(255, lg0[k] * 170); lightPx[k * 4 + 1] = Math.min(255, lg1[k] * 170); lightPx[k * 4 + 3] = 255; }
  const gridTex = (px, w, h) => {
    const t = new THREE.DataTexture(px, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  const lightTex = gridTex(lightPx, LW, LD);

  const groundPx = new Uint8Array(GW * GD * 4);
  const CONC = [[-24, 24, 46, 62], [-15, 15, 62, 85], [ARM.x0, -21, ARM.z0, ARM.z1], [17, 31, 23.4, 33], [-3, 3, 44, 46.2], [GH.x0, GH.x1, GH.z0, GH.z1], [30.5, 37.6, 56.6, 63.4], [25.5, 34, 85.8, 90.6]];
  for (let j = 0; j < GD; j++) {
    for (let i = 0; i < GW; i++) {
      const x = GX + (i + 0.5) * 0.25, z = GZ + (j + 0.5) * 0.25, k = (j * GW + i) * 4, ax = Math.abs(x);
      let a = 0;
      if (z < 5.4) a = sm(2.2, 3.3, Math.abs(x - roadX(z))) * (ax < FX + 0.6 ? 1 - 0.5 * sm(4.2, 5.4, z) : 1);
      else if (ax > FX + 0.5 || z > FN + 0.5) a = 1;
      else a = 0.62 * (1 - sm(0.2, 1.5, Math.min(z - FS, FX - ax, FN - z, Math.abs(z - FI))));
      const hd = Math.hypot(x - HOLE.x, z - FS);
      a *= sm(0.9, 1.7, hd);
      groundPx[k + 2] = 220 * (1 - sm(0.5, 1.3, hd));
      for (const c of CONC) if (x > c[0] && x < c[1] && z > c[2] && z < c[3]) { groundPx[k] = 255; a = 0; }
      groundPx[k + 3] = 255 * a;
    }
  }
  const stamp = (cx, cz, rad, ch, fn) => {
    const i0 = Math.max(0, Math.floor((cx - rad - GX) * 4)), i1 = Math.min(GW - 1, Math.ceil((cx + rad - GX) * 4));
    const j0 = Math.max(0, Math.floor((cz - rad - GZ) * 4)), j1 = Math.min(GD - 1, Math.ceil((cz + rad - GZ) * 4));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = (j * GW + i) * 4 + ch, v = 255 * fn(GX + (i + 0.5) * 0.25, GZ + (j + 0.5) * 0.25);
      if (v > groundPx[k]) groundPx[k] = Math.min(255, v);
    }
  };
  const TRACKS = [[], [[0, 18], [10, 21], [24, 22.4], [24, 25]], [[0, 46], [10, 50], [24, 54.5], [31, 58]], [[0, 30], [-12, 40], [-20, 43]]];
  for (let z = -16; z <= FS; z += 2) TRACKS[0].push([roadX(z), z]);
  TRACKS[0].push([0, 20], [0, 44], [0, 62], [0, 69]);
  for (const line of TRACKS) {
    for (let s = 0; s + 1 < line.length; s++) {
      const ax = line[s][0], az = line[s][1], bx = line[s + 1][0], bz = line[s + 1][1], L2 = (bx - ax) * (bx - ax) + (bz - az) * (bz - az) || 1;
      stamp((ax + bx) / 2, (az + bz) / 2, Math.sqrt(L2) / 2 + 2.6, 2, (x, z) => {
        const u = clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / L2, 0, 1), d = Math.hypot(x - ax - (bx - ax) * u, z - az - (bz - az) * u);
        return (1 - sm(0.1, 0.27, Math.abs(d - 0.85))) * 0.62 + (1 - sm(0.3, 2.5, d)) * 0.2;
      });
    }
  }
  for (const t of TRUCKS) stamp(t.x, t.z - 2.2, 1.1, 2, (x, z) => 0.8 * (1 - sm(0.3, 1.0, Math.hypot(x - t.x, z - t.z + 2.2))));
  for (const p of PUDDLES) {
    const o = [[0, 0, 1], [R(-0.6, 0.6) * p[2], R(-0.6, 0.6) * p[2], 0.7], [R(-0.7, 0.7) * p[2], R(-0.7, 0.7) * p[2], 0.55]];
    stamp(p[0], p[1], p[2] * 1.8, 1, (x, z) => {
      let v = 0;
      for (const q of o) v += Math.max(0, 1 - ((x - p[0] - q[0]) * (x - p[0] - q[0]) + (z - p[1] - q[1]) * (z - p[1] - q[1])) / (p[2] * p[2] * q[2] * q[2]));
      return Math.min(1, v * 0.9);
    });
  }
  const groundTex = gridTex(groundPx, GW, GD);

  // ---------------------------------------------------------------------------------------------- uniforms, materials
  const V4 = (x, y, z, w) => new THREE.Vector4(x, y, z, w);
  const moonDir = new THREE.Vector3().fromArray(ENVS.night.sunDir).normalize();
  const U = {
    uBLight: { value: lightTex },
    uBMap: { value: V4(GX, GZ, 1 / GWM, 1 / GDM) },
    uBLvl: { value: V4(0.85, 0.04, 0, 0) },                       // floods, apron floods, alarm, -
    uBSL: { value: [V4(0, 0, 3.5, 0), V4(0, 0, 3.5, 0)] },        // searchlight discs: x, z, r, intensity
    uBBlast: { value: V4(34, 60, 9, 0) },
    uBBeacon: { value: BEACONS.map((b) => V4(b[0], b[2], b[3], 0)) },
    uBMisc: { value: V4(1, 0, 0, 0) },                            // beacon cos, sin, visor outline, time
    uPart: { value: [] },
    uShock: fx.shock && fx.shock.uniform ? fx.shock.uniform : { value: V4(0, 0, 0, 0) },
    uFocus: { value: V4(0, 0, 0, 0) },
    uGround: { value: groundTex },
    uDetail: { value: makeDetailTex(THREE, rnd) },
    uLamp: { value: [] },
    uLampI: { value: new Float32Array(16) },
    uMoon: { value: moonDir },
  };
  for (let i = 0; i < NPART; i++) U.uPart.value.push(V4(0, 0, 0, 1));
  const parts = U.uPart.value;
  const LV = { uLv: { value: new Float32Array(NLV) }, uPx: { value: 360 } };
  const lv = LV.uLv.value;

  function patch(mat, f) {
    const key = "base" + (f.parts ? "P" : "") + (f.ground ? "G" : "") + (f.sway ? "S" : "") + (f.upN ? "N" : "");
    const head = (f.parts ? "#define BASE_PARTS\n" : "") + (f.ground ? "#define BASE_GROUND\n" : "") + (f.sway ? "#define BASE_SWAY\n" : "") + (f.upN ? "#define BASE_UPN\n" : "");
    mat.customProgramCacheKey = () => key;
    mat.onBeforeCompile = (sh) => {
      for (const k in U) sh.uniforms[k] = U[k];
      sh.vertexShader = head + VERT_PARS + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n" + VERT_MAIN);
      sh.fragmentShader = head + FRAG_PARS + sh.fragmentShader
        .replace("#include <color_fragment>", "#include <color_fragment>\n" + FRAG_COLOR)
        .replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\n" + FRAG_UPN)
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n" + FRAG_EMIT);
    };
    return mat;
  }
  const atlasTex = makeAtlas(THREE, rnd);
  const decals = makeDecals(THREE, rnd);
  const DC = decals.rect;
  const M = {
    ground: patch(new THREE.MeshLambertMaterial({ color: 0xffffff }), { ground: true }),
    concrete: patch(new THREE.MeshLambertMaterial({ map: makeConcreteTex(THREE, rnd), vertexColors: true }), { parts: true }),
    metal: patch(new THREE.MeshLambertMaterial({ map: makeCorrugatedTex(THREE, rnd), vertexColors: true }), { parts: true }),
    paint: patch(new THREE.MeshLambertMaterial({ vertexColors: true }), { parts: true }),
    atlas: patch(new THREE.MeshLambertMaterial({ map: atlasTex, vertexColors: true }), { parts: true }),
    bags: patch(new THREE.MeshLambertMaterial({ map: atlasTex }), {}),
    fence: patch(new THREE.MeshLambertMaterial({ map: makeFenceTex(THREE, rnd), vertexColors: true, alphaTest: 0.35, side: THREE.DoubleSide }), { parts: true, upN: true }),
    decal: patch(new THREE.MeshLambertMaterial({ map: decals.tex, vertexColors: true, alphaTest: 0.45, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), { parts: true }),
    grass: patch(new THREE.MeshLambertMaterial({ map: makeGrassTex(THREE, rnd), alphaTest: 0.4, side: THREE.DoubleSide }), { sway: true, upN: true }),
    trees: patch(new THREE.MeshLambertMaterial({ map: makeTreeTex(THREE, rnd), alphaTest: 0.4, side: THREE.DoubleSide }), { upN: true }),
  };
  const addMat = (vs, fs) => new THREE.ShaderMaterial({ uniforms: LV, vertexShader: vs, fragmentShader: fs, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  M.glow = addMat(GLOW_VERT, GLOW_FRAG);
  M.cone = addMat(CONE_VERT, CONE_FRAG);
  M.bulb = new THREE.ShaderMaterial({ uniforms: LV, vertexShader: BULB_VERT, fragmentShader: BULB_FRAG });

  // ---------------------------------------------------------------------------------------------- the builder
  // Buckets of merged geometry, one per material. A part id > 0 sends paint / atlas geometry to a second,
  // non-shadow-casting mesh of the same material (the depth pass does not know about parts).
  const B = {};
  const DYN = { paint: 1, atlas: 1, concrete: 1, metal: 1 };
  const bucket = (name) => B[name] || (B[name] = { p: [], n: [], u: [], c: [], a: [], i: [] });
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const _v = new THREE.Vector3(), _nv = new THREE.Vector3(), _d = new THREE.Vector3(), _n3 = new THREE.Matrix3(), _c = new THREE.Color();
  const UP = new THREE.Vector3(0, 1, 0), NO = {};
  const parent = new THREE.Matrix4();
  let hasParent = false;
  function at(x, y, z, yaw) { parent.makeRotationY(yaw || 0).setPosition(x, y, z); hasParent = true; }
  function atEnd() { hasParent = false; }
  function xf(x, y, z, sx, sy, sz, rx, ry, rz) {
    _e.set(rx || 0, ry || 0, rz || 0, "YXZ");
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz));
    if (hasParent) _m.premultiply(parent);
    return _m;
  }
  // o: { part, cell, cap (cell for faces looking up / down), box (world box-mapping, texels per metre), ao: false }
  function add(name, geo, m, hex, o) {
    o = o || NO;
    const part = o.part | 0, b = bucket(part && DYN[name] ? name + "Dyn" : name);
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv, idx = geo.index, base = b.p.length / 3;
    _n3.getNormalMatrix(m);
    _c.setHex(hex);
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(m);
      _nv.fromBufferAttribute(nor, i).applyMatrix3(_n3).normalize();
      b.p.push(_v.x, _v.y, _v.z); b.n.push(_nv.x, _nv.y, _nv.z);
      let uu = uv ? uv.getX(i) : 0, vv = uv ? uv.getY(i) : 0;
      if (o.box) {
        const ax = Math.abs(_nv.x), ay = Math.abs(_nv.y), az = Math.abs(_nv.z);
        if (ay > 0.7) { uu = _v.x * o.box; vv = _v.z * o.box; } else if (ax > az) { uu = _v.z * o.box; vv = _v.y * o.box; } else { uu = _v.x * o.box; vv = _v.y * o.box; }
      } else if (o.cell) {
        const c = o.cap && Math.abs(_nv.y) > 0.9 ? o.cap : o.cell;
        uu = c[0] + (c[2] - c[0]) * uu; vv = c[1] + (c[3] - c[1]) * vv;
      }
      b.u.push(uu, vv);
      const k = o.ao === false ? 1 : 0.68 + 0.32 * clamp(_v.y / 1.5, 0, 1);
      b.c.push(_c.r * k, _c.g * k, _c.b * k);
      b.a.push(part);
    }
    if (idx) for (let j = 0; j < idx.count; j++) b.i.push(base + idx.getX(j));
    else for (let j = 0; j < pos.count; j++) b.i.push(base + j);
  }
  const UNIT = new THREE.BoxGeometry(1, 1, 1);
  const TAPER = new THREE.BoxGeometry(1, 1, 1);
  { const p = TAPER.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setZ(i, p.getZ(i) * 0.4); TAPER.computeVertexNormals(); }
  const cylCache = {};
  // box by centre; slab by extents; cyl standing on y (or centred with o.center and rotated by o.rx / o.rz); beam between two points
  const box = (name, x, y, z, sx, sy, sz, hex, o) => add(name, UNIT, xf(x, y, z, sx, sy, sz, o && o.rx, o && o.ry, o && o.rz), hex, o);
  const slab = (name, x0, x1, y0, y1, z0, z1, hex, o) => add(name, UNIT, xf((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0), hex, o);
  function cyl(name, x, y, z, r, h, seg, hex, o) {
    o = o || NO;
    const key = seg + "|" + (o.top === undefined ? 1 : o.top) + "|" + (o.open ? 1 : 0);
    const g = cylCache[key] || (cylCache[key] = new THREE.CylinderGeometry(o.top === undefined ? 1 : o.top, 1, 1, seg, 1, !!o.open));
    add(name, g, xf(x, o.center ? y : y + h / 2, z, r, h, r, o.rx, o.ry, o.rz), hex, o);
  }
  function beam(name, ax, ay, az, bx, by, bz, t, hex, o) {
    _d.set(bx - ax, by - ay, bz - az);
    const L = _d.length();
    _q.setFromUnitVectors(UP, _d.multiplyScalar(1 / L));
    _m.compose(_p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s.set(t, L, (o && o.t2) || t));
    if (hasParent) _m.premultiply(parent);
    add(name, UNIT, _m, hex, o);
  }
  // a quad a-b-c-d (counter-clockwise seen from the front; a = bottom left), uv rect o.uv = [u0, v0, u1, v1]
  function quad(name, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, hex, o) {
    o = o || NO;
    const part = o.part | 0, b = bucket(part && DYN[name] ? name + "Dyn" : name), base = b.p.length / 3, uv = o.uv || o.cell || [0, 0, 1, 1];
    const P = [ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz], UV = [uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]];
    _c.setHex(hex);
    if (o.n) _nv.set(o.n[0], o.n[1], o.n[2]); else _nv.set(bx - ax, by - ay, bz - az).cross(_d.set(dx - ax, dy - ay, dz - az)).normalize();
    if (hasParent) _nv.transformDirection(parent);
    for (let i = 0; i < 4; i++) {
      _v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      if (hasParent) _v.applyMatrix4(parent);
      b.p.push(_v.x, _v.y, _v.z); b.n.push(_nv.x, _nv.y, _nv.z); b.u.push(UV[i * 2], UV[i * 2 + 1]);
      const k = o.ao === false ? 1 : 0.68 + 0.32 * clamp(_v.y / 1.5, 0, 1);
      b.c.push(_c.r * k, _c.g * k, _c.b * k); b.a.push(part);
    }
    b.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // a flat mark on the ground, readable from the south (yaw turns it), and a mark on a wall facing (nx, nz)
  function flat(name, cell, cx, cz, w, d, yaw, hex, o) {
    const c = Math.cos(yaw || 0), s = Math.sin(yaw || 0), y = (o && o.y) || 0.02;
    const X = (lx, lz) => cx + lx * c + lz * s, Z = (lx, lz) => cz - lx * s + lz * c;
    quad(name, X(w / 2, -d / 2), y, Z(w / 2, -d / 2), X(-w / 2, -d / 2), y, Z(-w / 2, -d / 2), X(-w / 2, d / 2), y, Z(-w / 2, d / 2), X(w / 2, d / 2), y, Z(w / 2, d / 2),
      hex, Object.assign({ uv: cell, ao: false }, o));
  }
  function onWall(name, cell, cx, cy, cz, nx, nz, w, h, hex, o) {
    const rx = nz * w / 2, rz = -nx * w / 2;
    quad(name, cx - rx, cy - h / 2, cz - rz, cx + rx, cy - h / 2, cz + rz, cx + rx, cy + h / 2, cz + rz, cx - rx, cy + h / 2, cz - rz, hex, Object.assign({ uv: cell }, o));
  }
  function meshOf(name, mat, cast, receive) {
    const b = B[name];
    if (!b || !b.i.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(b.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(b.n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(b.u, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(b.c, 3));
    g.setAttribute("aPart", new THREE.Float32BufferAttribute(b.a, 1));
    g.setIndex(b.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(b.i, 1) : new THREE.Uint16BufferAttribute(b.i, 1));
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = "base." + name;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = !!cast;
    mesh.receiveShadow = !!receive;
    group.add(mesh);
    tris += b.i.length / 3;
    delete B[name];
    return mesh;
  }
  let tris = 0;

  // colours
  const C = { olive: 0x4d5338, oliveD: 0x353a28, steel: 0x5d6468, steelD: 0x2b2f33, conc: 0xb9b6ad, white: 0xbdb9a8, rust: 0x6b4a32, wood: 0x7d6442, pine: 0xcdb98c,
    rubber: 0x141516, canvas: 0x5e6145, galv: 0x9aa3a6, yellow: 0xc9a11e, red: 0xb3261c, glass: 0x0b1116, dirt: 0x4a3c2a, tin: 0x8f958f };

  // ---------------------------------------------------------------------------------------------- lights as geometry
  const glowA = { p: [], c: [], s: [], k: [] };
  function glow(x, y, z, hex, size, kind) {
    _c.setHex(hex);
    glowA.p.push(x, y, z); glowA.c.push(_c.r, _c.g, _c.b); glowA.s.push(size); glowA.k.push(kind);
  }
  const bulb = (x, y, z, sx, sy, sz, hex, kind) => box("bulb", x, y, z, sx, sy, sz, hex, { part: kind, ao: false });
  const _ca = new THREE.Vector3(), _cu = new THREE.Vector3(), _cv = new THREE.Vector3();
  // an open cone of light from (lx, ly, lz) to (tx, ty, tz); arrays { p, n, c, k, t, i }
  function cone(A, lx, ly, lz, tx, ty, tz, r0, r1, seg, hex, strength, kind) {
    _ca.set(tx - lx, ty - ly, tz - lz).normalize();
    _cu.set(1, 0, 0);
    if (Math.abs(_ca.x) > 0.9) _cu.set(0, 0, 1);
    _cu.cross(_ca).normalize();
    _cv.crossVectors(_ca, _cu);
    _c.setHex(hex);
    const base = A.p.length / 3;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * TAU, dx = _cu.x * Math.cos(a) + _cv.x * Math.sin(a), dy = _cu.y * Math.cos(a) + _cv.y * Math.sin(a), dz = _cu.z * Math.cos(a) + _cv.z * Math.sin(a);
      A.p.push(lx + dx * r0, ly + dy * r0, lz + dz * r0, tx + dx * r1, ty + dy * r1, tz + dz * r1);
      A.n.push(dx, dy, dz, dx, dy, dz);
      A.c.push(_c.r * strength, _c.g * strength, _c.b * strength, _c.r * strength, _c.g * strength, _c.b * strength);
      A.k.push(kind, kind); A.t.push(0, 1);
      if (j < seg) { const q = base + j * 2; A.i.push(q, q + 1, q + 3, q, q + 3, q + 2); }
    }
  }
  function coneGeo(A) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(A.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(A.n, 3));
    g.setAttribute("aColor", new THREE.Float32BufferAttribute(A.c, 3));
    g.setAttribute("aKind", new THREE.Float32BufferAttribute(A.k, 1));
    g.setAttribute("aT", new THREE.Float32BufferAttribute(A.t, 1));
    g.setIndex(A.i);
    return g;
  }
  const newCone = () => ({ p: [], n: [], c: [], k: [], t: [], i: [] });
  const floodCones = newCone();
  const lampKind = [];
  const SODIUM = 0xffb054;
  for (const L of LAMPS) {
    const dx = L.px - L.x, dz = L.pz - L.z, dl = Math.hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl;
    let hx = L.x, hz = L.z;
    if (L.pole === 1) {
      cyl("paint", L.x, 0, L.z, 0.085, L.h, 6, C.steel, { open: true, top: 0.6 });
      hx = L.x + ux * 0.9; hz = L.z + uz * 0.9;
      beam("paint", L.x, L.h - 0.05, L.z, hx, L.h + 0.12, hz, 0.07, C.steel);
      colliders.push({ x: L.x, z: L.z, r: 0.14, on: true });
    }
    if (L.pole) {
      box("paint", hx, L.h + 0.12, hz, 0.5, 0.16, 0.34, C.steelD, { ry: Math.atan2(ux, uz) + Math.PI / 2, ao: false });
      bulb(hx, L.h + 0.02, hz, 0.36, 0.05, 0.22, SODIUM, L.g);
      glow(hx, L.h - 0.02, hz, SODIUM, L.g ? 3.2 : 2.3, L.g);
      cone(floodCones, hx, L.h, hz, L.px, 0, L.pz, 0.2, L.r * 0.5, 14, SODIUM, 0.085, L.g);
      if (U.uLamp.value.length < 14) { U.uLamp.value.push(V4(hx, L.h, hz, 0)); lampKind.push(L.g); }
    } else {
      beam("paint", L.x, L.h + 0.1, L.z, L.x, L.h + 0.7, L.z, 0.025, C.steelD, { ao: false });
      cyl("paint", L.x, L.h + 0.04, L.z, 0.2, 0.1, 8, C.steelD, { top: 0.3, ao: false });
      bulb(L.x, L.h, L.z, 0.12, 0.08, 0.12, 0xffc878, 6);
      glow(L.x, L.h - 0.05, L.z, 0xffc070, 1.5, 6);
    }
  }
  for (const b of BEACONS) { bulb(b[0], b[1], b[2], 0.24, 0.2, 0.24, 0xff2a14, 3); glow(b[0], b[1], b[2], 0xff2a14, 2.4, 3); }

  // ---------------------------------------------------------------------------------------------- fences and gates
  function fenceRun(x0, z0, x1, z1, ox, oz, part) {
    const L = Math.hypot(x1 - x0, z1 - z0), o = { uv: [0, 0, L / 1.5, 0.84], part, ao: false };
    quad("fence", x0, 0.03, z0, x1, 0.03, z1, x1, 2.25, z1, x0, 2.25, z0, C.galv, o);
    quad("fence", x0, 2.25, z0, x1, 2.25, z1, x1 + ox * 0.3, 2.62, z1 + oz * 0.3, x0 + ox * 0.3, 2.62, z0 + oz * 0.3, C.galv, { uv: [0, 0.845, L / 1.5, 1], part, ao: false });
    const n = Math.max(1, Math.round(L / 3));
    for (let i = 0; i <= n; i++) {
      const px = x0 + ((x1 - x0) * i) / n, pz = z0 + ((z1 - z0) * i) / n;
      cyl("paint", px, 0, pz, 0.045, 2.3, 5, C.galv, { open: true, part });
      beam("paint", px, 2.25, pz, px + ox * 0.3, 2.64, pz + oz * 0.3, 0.04, C.galv, { part, ao: false });
    }
    beam("paint", x0, 2.25, z0, x1, 2.25, z1, 0.035, C.galv, { part, ao: false });
  }
  const FT = 0.08;
  fenceRun(-FX, FS, HOLE.x - HOLE.hw, FS, 0, -1, 0); wall(-FX, HOLE.x - HOLE.hw, FS - FT, FS + FT);
  fenceRun(HOLE.x + HOLE.hw, FS, -3.2, FS, 0, -1, 0); wall(HOLE.x + HOLE.hw, -3, FS - FT, FS + FT);
  fenceRun(3.2, FS, FX, FS, 0, -1, 0); wall(3, FX, FS - FT, FS + FT);
  fenceRun(-FX, FI, -3.2, FI, 0, -1, 0); wall(-FX, -3, FI - FT, FI + FT);
  fenceRun(3.2, FI, FX, FI, 0, -1, 0); wall(3, FX, FI - FT, FI + FT);
  fenceRun(-FX, FS, -FX, FN, -1, 0, 0); wall(-FX - FT, -FX + FT, FS, FN);
  fenceRun(FX, FS, FX, GAP.z0, 1, 0, 0); wall(FX - FT, FX + FT, FS, GAP.z0);
  fenceRun(FX, GAP.z1, FX, FN, 1, 0, 0); wall(FX - FT, FX + FT, GAP.z1, FN);
  fenceRun(-FX, FN, FX, FN, 0, 1, 0); wall(-FX, FX, FN - FT, FN + FT);
  fenceRun(FX, GAP.z0, FX, GAP.z1, 1, 0, PT.GAP);
  const gapWall = wall(FX - FT, FX + FT, GAP.z0, GAP.z1);
  // the gap after the blast: posts thrown outward, the mesh on the ground
  for (const z of [GAP.z0 + 0.3, 58, GAP.z1 - 0.3]) beam("paint", FX, 0, z, FX + 1.9, 0.5 + 0.3 * Math.sin(z), z + 0.4, 0.05, 0x3a3a38, { part: PT.GAP_OPEN, ao: false });
  quad("fence", FX + 0.3, 0.07, GAP.z0 + 0.2, FX + 0.3, 0.07, GAP.z1 - 0.2, FX + 2.5, 0.12, GAP.z1 - 0.6, FX + 2.4, 0.3, GAP.z0 + 0.5, 0x6a6a66, { uv: [0, 0, 3.3, 0.84], part: PT.GAP_OPEN, ao: false });
  quad("fence", FX, 0.03, GAP.z0, FX, 0.03, GAP.z0 + 0.9, FX + 0.5, 1.5, GAP.z0 + 0.7, FX + 0.2, 2.1, GAP.z0, 0x6a6a66, { uv: [0, 0, 0.6, 0.84], part: PT.GAP_OPEN, ao: false });
  // the dug hole under the wire: the mesh is cut and curled outward, two mounds of spoil
  quad("fence", HOLE.x - HOLE.hw, 0.62, FS, HOLE.x + HOLE.hw, 0.62, FS, HOLE.x + HOLE.hw, 2.25, FS, HOLE.x - HOLE.hw, 2.25, FS, C.galv, { uv: [0, 0.23, 0.93, 0.84], ao: false });
  quad("fence", HOLE.x - HOLE.hw, 0.62, FS, HOLE.x + HOLE.hw, 0.62, FS, HOLE.x + HOLE.hw - 0.1, 0.34, FS - 0.5, HOLE.x - HOLE.hw + 0.1, 0.3, FS - 0.55, C.galv, { uv: [0, 0, 0.93, 0.23], ao: false });
  beam("paint", HOLE.x - HOLE.hw, 2.25, FS, HOLE.x + HOLE.hw, 2.25, FS, 0.035, C.galv, { ao: false });
  cyl("paint", HOLE.x - 1.15, 0, FS - 0.6, 0.6, 0.3, 7, C.dirt, { top: 0.3, ao: false });
  cyl("paint", HOLE.x + 1.1, 0, FS + 0.7, 0.5, 0.24, 7, C.dirt, { top: 0.3, ao: false });
  wall(HOLE.x - HOLE.hw, HOLE.x + HOLE.hw, FS - FT, FS + FT, { small: true });

  function gateLeaf(z, part, sign) {
    quad("fence", -3.1, 0.12, z, 3.1, 0.12, z, 3.1, 2.3, z, -3.1, 2.3, z, C.galv, { uv: [0, 0.05, 4.13, 0.84], part, ao: false });
    for (const y of [0.12, 2.3]) beam("paint", -3.1, y, z, 3.1, y, z, 0.07, C.steel, { part, ao: false });
    for (const x of [-3.1, 0, 3.1]) beam("paint", x, 0.12, z, x, 2.3, z, 0.07, C.steel, { part, ao: false });
    beam("paint", -3.1, 0.12, z, 0, 2.3, z, 0.05, C.steel, { part, ao: false });
    beam("paint", 0, 2.3, z, 3.1, 0.12, z, 0.05, C.steel, { part, ao: false });
    for (const x of [-2.6, 2.6]) cyl("paint", x, 0.1, z, 0.1, 0.06, 8, C.steelD, { center: true, rx: Math.PI / 2, part, ao: false });
    onWall("decal", DC[sign], -1.55, 1.3, z - 0.05, 0, -1, sign === "stop" ? 0.9 : 1.6, 0.9, 0xffffff, { part });
  }
  gateLeaf(FS + 0.2, PT.GATE, "restricted");
  gateLeaf(FI - 0.2, PT.INNER, "stop");
  for (const z of [FS, FI]) for (const x of [-3.25, 3.25]) box("paint", x, 1.35, z, 0.2, 2.7, 0.2, C.steelD);
  beam("paint", -3.2, 0.04, FS + 0.2, 9.6, 0.04, FS + 0.2, 0.06, C.steelD, { ao: false });     // the rails the gates roll on
  beam("paint", -9.6, 0.04, FI - 0.2, 3.2, 0.04, FI - 0.2, 0.06, C.steelD, { ao: false });
  const gateWalls = { main: wall(-3, 3, FS - 0.1, FS + 0.3), inner: wall(-3, 3, FI - 0.3, FI + 0.1) };
  // the main gate after Rok's charges: the leaf thrown into the yard
  at(1.4, 0.06, 12.8, 0.5);
  quad("fence", -3.1, 0, -1.1, 3.1, 0.05, -1.1, 3.1, 0.2, 1.1, -3.1, 0.02, 1.1, 0x77776f, { uv: [0, 0.05, 4.13, 0.84], part: PT.GATE_WRECK, ao: false });
  for (const zz of [-1.1, 1.1]) beam("paint", -3.1, 0.05, zz, 3.1, 0.14, zz, 0.07, 0x3c3c3a, { part: PT.GATE_WRECK, ao: false });
  for (const xx of [-3.1, 0.2, 3.1]) beam("paint", xx, 0.05, -1.1, xx + 0.2, 0.16, 1.1, 0.07, 0x3c3c3a, { part: PT.GATE_WRECK, ao: false });
  atEnd();
  flat("decal", DC.scorch, 0, FS + 0.6, 6, 6, 0.4, 0xffffff, { part: PT.GATE_WRECK });
  onWall("decal", DC.restricted, -7, 1.45, FS - 0.06, 0, -1, 1.7, 0.95, 0xffffff);
  onWall("decal", DC.restricted, 7.5, 1.45, FS - 0.06, 0, -1, 1.7, 0.95, 0xffffff);
  onWall("decal", DC.keepout, -6.5, 1.45, FI - 0.06, 0, -1, 1.7, 0.55, 0xffffff);
  onWall("decal", DC.keepout, FX - 0.06, 1.45, 52, -1, 0, 1.7, 0.55, 0xffffff);
  // the sentry box by the main gate
  slab("paint", 4.2, 5.6, 0, 2.3, 9.2, 10.6, C.olive);
  onWall("paint", null, 4.19, 1.2, 9.9, -1, 0, 0.9, 1.9, 0x0c0e0a);
  box("metal", 4.9, 2.42, 9.9, 1.8, 0.06, 1.8, C.tin, { rz: 0.12, box: 1.25, ao: false });
  wall(4.2, 5.6, 9.2, 10.6, { sight: true, h: 2.3, surface: "wood" });

  // ---------------------------------------------------------------------------------------------- barracks
  HUTS.forEach((zc, i) => {
    const xa = -38.6, xb = -30;
    slab("concrete", xa, xb, 0, 2.5, zc - 2.4, zc + 2.4, C.white, { box: 0.5 });
    quad("concrete", xb, 2.5, zc + 2.4, xb, 2.5, zc - 2.4, xb, 3.5, zc, xb, 3.5, zc, C.white, { uv: [0, 1.25, 2.4, 1.75], ao: false });
    quad("concrete", xa, 2.5, zc - 2.4, xa, 2.5, zc + 2.4, xa, 3.5, zc, xa, 3.5, zc, C.white, { uv: [0, 1.25, 2.4, 1.75], ao: false });
    for (const s of [-1, 1]) box("metal", -33.4, 2.94, zc + s * 1.375, 11.2, 0.06, 3.0, i === 1 ? 0x9a8d7c : C.tin, { rx: s * 0.395, box: 1.25, ao: false });
    beam("paint", -39.0, 3.55, zc, -27.8, 3.55, zc, 0.1, C.steelD, { ao: false });
    slab("paint", xb, -27.8, 0, 0.04, zc - 2.4, zc + 2.4, C.wood, { ao: false });
    for (const s of [-1, 1]) cyl("paint", -27.95, 0, zc + s * 2.2, 0.06, 2.42, 5, C.wood, { open: true });
    onWall("atlas", CELL.door, xb + 0.03, 1.05, zc, 1, 0, 1.0, 2.1, 0xffffff);
    onWall("decal", DC["B-" + (i + 1)], xb + 0.04, 2.72, zc, 1, 0, 0.9, 0.6, 0xffffff);
    for (const x of [-36.8, -34.3, -31.8]) { onWall("atlas", CELL.window, x, 1.5, zc - 2.43, 0, -1, 0.9, 0.9, 0xffffff); onWall("atlas", CELL.window, x, 1.5, zc + 2.43, 0, 1, 0.9, 0.9, 0xffffff); }
    cyl("paint", -36, 2.9, zc + 0.9, 0.09, 1.1, 6, C.steelD, { ao: false });
    wall(xa, xb, zc - 2.4, zc + 2.4, { sight: true, h: 3, surface: "concrete" });
    hideRects.push([xb, -27.8, zc - 2.4, zc + 2.4]);
    coverPoints.push({ x: -29.3, z: zc - 3.1, facing: -Math.PI / 2 }, { x: -29.3, z: zc + 3.1, facing: -Math.PI / 2 });
  });

  // ---------------------------------------------------------------------------------------------- watchtowers
  const slLamp = [];
  TOWERS.forEach((T, ti) => {
    at(T.x, 0, T.z, 0);
    const hw = (y) => 1.5 - (0.3 * y) / 7;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam("paint", sx * 1.5, 0, sz * 1.5, sx * 1.2, 7, sz * 1.2, 0.16, C.steelD);
    for (let tier = 0; tier < 2; tier++) {
      const y0 = tier * 3.5, y1 = y0 + 3.5, a = hw(y0), b = hw(y1);
      for (const s of [-1, 1]) {
        beam("paint", -a, y0, s * a, b, y1, s * b, 0.07, C.steelD); beam("paint", a, y0, s * a, -b, y1, s * b, 0.07, C.steelD);
        beam("paint", s * a, y0, -a, s * b, y1, b, 0.07, C.steelD); beam("paint", s * a, y0, a, s * b, y1, -b, 0.07, C.steelD);
      }
    }
    box("paint", 0, 7.08, 0, 3.4, 0.16, 3.4, C.wood, { ao: false });
    for (const s of [-1, 1]) { box("paint", 0, 7.66, s * 1.66, 3.4, 1.0, 0.08, C.olive, { ao: false }); box("paint", s * 1.66, 7.66, 0, 0.08, 1.0, 3.4, C.olive, { ao: false }); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam("paint", sx * 1.62, 7.16, sz * 1.62, sx * 1.62, 9.25, sz * 1.62, 0.09, C.steelD, { ao: false });
    box("metal", 0, 9.32, 0, 4.0, 0.07, 4.0, C.tin, { rx: 0.07, box: 1.25, ao: false });
    for (const s of [-0.25, 0.25]) beam("paint", s, 0, -1.95, s, 7.1, -1.5, 0.05, C.steel);
    for (let r = 1; r < 14; r++) beam("paint", -0.25, r * 0.5, -1.95 + 0.032 * r, 0.25, r * 0.5, -1.95 + 0.032 * r, 0.035, C.steel, { ao: false });
    onWall("decal", ti ? DC.twrE : DC.twrW, 0, 7.66, 1.71, 0, 1, 1.6, 0.66, 0xffffff);
    const lx = T.sx * 1.4, lz = 1.4;
    cyl("paint", lx, 8.05, lz, 0.05, 0.3, 5, C.steelD, { open: true, ao: false });
    cyl("paint", lx, 8.55, lz, 0.3, 0.42, 10, C.steelD, { center: true, rx: 0.9, rz: -T.sx * 0.6, ao: false });
    atEnd();
    slLamp.push({ x: T.x + lx, y: 8.55, z: T.z + lz });
    bulb(T.x + lx + T.sx * 0.12, 8.42, T.z + lz + 0.16, 0.3, 0.3, 0.3, 0xdfeaff, 4 + ti);
    glow(T.x + lx + T.sx * 0.12, 8.42, T.z + lz + 0.16, 0xcfe0ff, 3.4, 4 + ti);
    U.uLamp.value.push(V4(T.x + lx, 8.5, T.z + lz, 1)); lampKind.push(4 + ti);
    wall(T.x - 1.45, T.x + 1.45, T.z - 1.45, T.z + 1.45);
    coverPoints.push({ x: T.x - T.sx * 2.4, z: T.z + 1, facing: T.sx * Math.PI / 2 }, { x: T.x + T.sx * 0.5, z: T.z + 2.4, facing: Math.PI });
  });
  while (U.uLamp.value.length < 16) { U.uLamp.value.push(V4(0, -50, 0, 0)); lampKind.push(-1); }

  // ---------------------------------------------------------------------------------------------- crates, drums, barriers
  const CRATE_TINT = [0xffffff, 0xd8d0b0, 0x8f9a6c, 0xbfb694];
  const drum = (x, z, hex, part) => cyl("atlas", x, 0, z, 0.29, 0.88, 10, hex, { cell: CELL.drum, cap: CELL.drumTop, part, ry: R(0, TAU) });
  STACKS.forEach((S, si) => {
    const cx = S[0], cz = S[1], w = S[2], d = S[3];
    for (let ix = 0; ix < w; ix++) for (let iz = 0; iz < d; iz++) {
      const x = cx - w / 2 + 0.5 + ix, z = cz - d / 2 + 0.5 + iz;
      let lv2 = 1 + (rnd() < 0.75 ? 1 : 0);
      if (lv2 === 2 && rnd() < 0.25) lv2 = 3;
      for (let l = 0; l < lv2; l++) box("atlas", x + R(-0.03, 0.03), 0.48 + l * 0.96, z + R(-0.03, 0.03), 0.96, 0.96, 0.96, CRATE_TINT[Math.floor(rnd() * 4)], { cell: CELL.crate, cap: CELL.crateTop, ry: R(-0.06, 0.06) });
    }
    wall(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, { sight: true, h: 1.9, surface: "wood" });
    coverPts(cx, cz, w / 2, d / 2, si < 4 ? "nsew" : "s");
    const dx = cx + (w / 2 + 0.45) * (si % 2 ? 1 : -1), dz = cz + R(-0.4, 0.4);
    drum(dx, dz, 0x9aa37a, 0); colliders.push({ x: dx, z: dz, r: 0.32, on: true });
  });
  for (const p of [[27.2, 34.6], [27.9, 34.5], [27.5, 35.2], [16.2, 30], [-13.6, 66], [13.2, 78.6]]) { drum(p[0], p[1], rnd() < 0.5 ? 0x9aa37a : 0x8b6a5a, 0); colliders.push({ x: p[0], z: p[1], r: 0.32, on: true }); }
  for (const b of BARRIERS) {
    const az = b[2] === "z", hx = az ? 0.31 : 1.5, hz = az ? 1.5 : 0.31;
    add("concrete", TAPER, xf(b[0], 0.45, b[1], 3.0, 0.9, 0.62, 0, az ? Math.PI / 2 : 0, 0), C.conc, { box: 0.5 });
    wall(b[0] - hx, b[0] + hx, b[1] - hz, b[1] + hz, { h: 0.95, surface: "concrete" });
    coverPts(b[0], b[1], hx, hz, az ? "ew" : "ns");
    sneakRects.push([b[0] - hx - 0.85, b[0] + hx + 0.85, b[1] - hz - 0.85, b[1] + hz + 0.85]);
  }

  // ---------------------------------------------------------------------------------------------- sandbags (instanced)
  const bags = [];
  function bagLine(x0, z0, x1, z1, rows) {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 0.6)), yaw = Math.atan2(-(z1 - z0), x1 - x0);
    for (let r = 0; r < rows; r++) for (let i = 0; i < n - (r % 2); i++) {
      const f = (i + 0.5 + (r % 2) * 0.5) / n;
      bags.push({ x: x0 + (x1 - x0) * f + R(-0.02, 0.02), y: 0.1 + r * 0.19, z: z0 + (z1 - z0) * f + R(-0.02, 0.02), yaw: yaw + R(-0.08, 0.08) });
    }
  }
  function bagArc(cx, cz, rad, a0, a1, rows) {
    const n = Math.max(2, Math.round(((a1 - a0) * rad) / 0.6));
    for (let r = 0; r < rows; r++) for (let i = 0; i < n - (r % 2); i++) {
      const a = a0 + ((a1 - a0) * (i + 0.5 + (r % 2) * 0.5)) / n;
      bags.push({ x: cx + Math.cos(a) * rad, y: 0.1 + r * 0.19, z: cz + Math.sin(a) * rad, yaw: -a + Math.PI / 2 + R(-0.08, 0.08) });
    }
  }
  const rings = RINGS.map((q) => {
    const a0 = -0.35, a1 = Math.PI + 0.35;
    bagArc(q.x, q.z, RING_R, a0, a1, 4);
    for (let a = a0 + 0.1; a <= a1 - 0.05; a += 0.27) colliders.push({ x: q.x + Math.cos(a) * RING_R, z: q.z + Math.sin(a) * RING_R, r: 0.3, on: true });
    cover.push({ x: q.x, z: q.z, r: 1.9, h: 0.85, surface: "dirt", on: true, ring: true });
    coverPoints.push({ x: q.x, z: q.z + 0.3, facing: Math.PI });
    return { x: q.x, z: q.z, r: 1.3 };
  });
  function bagWall(x0, x1, z, rows, hideSouth) {
    bagLine(x0, z, x1, z, rows);
    wall(x0, x1, z - 0.25, z + 0.25, { h: 0.2 + rows * 0.19, surface: "dirt" });
    sneakRects.push(hideSouth ? [x0 - 0.3, x1 + 0.3, z - 1.5, z - 0.25] : [x0 - 0.3, x1 + 0.3, z + 0.25, z + 1.5]);
    coverPts((x0 + x1) / 2, z, 0, 0.25, "ns");
  }
  bagWall(-16, -12, 12.3, 4, true);
  bagWall(-9, -6, 12.6, 3, false);
  bagWall(-21.5, -18.5, 72.6, 3, false);
  bagWall(18, 21, 50, 3, true);

  // ---------------------------------------------------------------------------------------------- trucks
  const trucks = TRUCKS.map((t, ti) => {
    at(t.x, 0, t.z, t.yaw);
    const body = ti === 1 ? 0x454b33 : C.olive;
    box("paint", 0, 0.86, -0.2, 0.9, 0.22, 6.2, C.steelD, { ao: false });
    for (const z of [2.0, -1.3, -2.4]) for (const s of [-1, 1]) {
      cyl("atlas", s * 1.02, 0.52, z, 0.52, 0.34, 12, 0xffffff, { center: true, rz: Math.PI / 2, cell: CELL.tyre, ao: false });
      cyl("paint", s * 1.03, 0.52, z, 0.22, 0.37, 8, body, { center: true, rz: Math.PI / 2, ao: false });
    }
    box("paint", 0, 0.78, 3.22, 2.3, 0.22, 0.14, C.steelD, { ao: false });
    box("paint", 0, 1.42, 2.55, 1.9, 0.72, 1.3, body, { ao: false });
    onWall("atlas", CELL.grille, 0, 1.42, 3.205, 0, 1, 1.86, 0.7, 0xffffff, { ao: false });
    for (const s of [-1, 1]) box("paint", s * 1.05, 1.1, 2.0, 0.42, 0.07, 1.25, body, { ao: false });
    box("paint", 0, 1.95, 1.15, 2.3, 1.75, 1.5, body, { ao: false });
    box("paint", 0, 2.32, 1.92, 2.0, 0.68, 0.04, C.glass, { ao: false });
    for (const s of [-1, 1]) box("paint", s * 1.16, 2.3, 1.2, 0.03, 0.6, 0.9, C.glass, { ao: false });
    box("paint", 0, 1.2, -1.75, 2.4, 0.14, 3.9, C.wood, { ao: false });
    for (const s of [-1, 1]) box("paint", s * 1.17, 1.55, -1.75, 0.06, 0.6, 3.9, body, { ao: false });
    box("paint", 0, 1.55, -3.68, 2.4, 0.6, 0.06, body, { ao: false });
    // the canvas tilt: a five-sided arch
    const prof = [[1.2, 1.85], [1.2, 2.55], [0.75, 3.0], [-0.75, 3.0], [-1.2, 2.55], [-1.2, 1.85]];
    for (let k = 0; k < 5; k++) {
      const a = prof[k], b = prof[k + 1];
      quad("atlas", a[0], a[1], 0.2, a[0], a[1], -3.7, b[0], b[1], -3.7, b[0], b[1], 0.2, 0xd8d6c4, { uv: CELL.tarp, ao: false });
    }
    quad("atlas", -1.2, 1.85, 0.2, 1.2, 1.85, 0.2, 0.75, 3.0, 0.2, -0.75, 3.0, 0.2, 0xc9c7b4, { uv: CELL.tarp, ao: false });
    quad("paint", 1.2, 1.85, -3.7, -1.2, 1.85, -3.7, -0.75, 3.0, -3.7, 0.75, 3.0, -3.7, 0x0b0c08, { ao: false });
    atEnd();
    const c = Math.cos(t.yaw), s = Math.sin(t.yaw);
    for (const sx of [-0.75, 0.75]) {
      const hx = t.x + sx * c + 3.23 * s, hz = t.z - sx * s + 3.23 * c;
      bulb(hx, 1.42, hz, 0.2, 0.2, 0.06, 0xfff0c0, 7); glow(hx, 1.42, hz, 0xfff0c0, 2.2, 7);
    }
    wall(t.x - 1.25, t.x + 1.25, t.z - 3.4, t.z + 3.4, { small: true, sight: true });
    for (const o of [-2.1, 0, 2.1]) cover.push({ x: t.x, z: t.z + o, r: 1.3, h: 2.6, surface: "metal", on: true });
    hideRects.push([t.x - 1.1, t.x + 1.1, t.z - 3.1, t.z + 3.1]);
    coverPts(t.x, t.z, 1.25, 3.4, "ns");
    return { x: t.x, z: t.z, yaw: t.yaw, r: 2.6, honk() { honkT = 0.7; } };
  });
  let honkT = 0;

  // ---------------------------------------------------------------------------------------------- guardhouse and lever
  {
    const g = GH, hex = C.white, o = { box: 0.5 };
    slab("concrete", g.x0, g.x1, 0, 2.6, g.z1 - 0.2, g.z1, hex, o);
    slab("concrete", g.x1 - 0.2, g.x1, 0, 2.6, g.z0, g.z1, hex, o);
    slab("concrete", g.x0, g.x0 + 0.2, 0, 2.6, g.z0, 39.3, hex, o);
    slab("concrete", g.x0, g.x0 + 0.2, 0, 2.6, 40.7, g.z1, hex, o);
    slab("concrete", g.x0, g.x0 + 0.2, 2.1, 2.6, 39.3, 40.7, hex, o);
    slab("concrete", g.x0, g.x1, 0, 1.0, g.z0, g.z0 + 0.2, hex, o);
    slab("concrete", g.x0, g.x1, 2.1, 2.6, g.z0, g.z0 + 0.2, hex, o);
    slab("concrete", g.x0, 9, 1.0, 2.1, g.z0, g.z0 + 0.2, hex, o);
    slab("concrete", 11, g.x1, 1.0, 2.1, g.z0, g.z0 + 0.2, hex, o);
    slab("concrete", g.x0 - 0.3, g.x1 + 0.3, 2.6, 2.76, g.z0 - 0.3, g.z1 + 0.3, C.conc, o);
    box("paint", 9.6, 0.4, 39.25, 1.5, 0.8, 0.6, C.wood);
    box("paint", 11.0, 1.0, 41.24, 0.34, 0.7, 0.1, C.steelD, { ao: false });
    box("paint", 11.0, 1.0, 41.18, 0.08, 0.5, 0.03, 0x0a0a0a, { ao: false });
    onWall("decal", DC.hazard, 11.0, 1.48, 41.29, 0, -1, 0.6, 0.12, 0xffffff);
    wall(g.x0, g.x1, g.z1 - 0.2, g.z1, { sight: true, h: 2.6 });
    wall(g.x1 - 0.2, g.x1, g.z0, g.z1, { sight: true, h: 2.6 });
    wall(g.x0, g.x0 + 0.2, g.z0, 39.3, { sight: true, h: 2.6 });
    wall(g.x0, g.x0 + 0.2, 40.7, g.z1, { sight: true, h: 2.6 });
    wall(g.x0, 9, g.z0, g.z0 + 0.2, { sight: true, h: 2.6 });
    wall(9, 11, g.z0, g.z0 + 0.2, { h: 1.0 });
    wall(11, g.x1, g.z0, g.z0 + 0.2, { sight: true, h: 2.6 });
    coverPoints.push({ x: 7.2, z: 38.0, facing: Math.PI }, { x: 12.8, z: 38.0, facing: Math.PI });
  }

  // ---------------------------------------------------------------------------------------------- the hangar
  function tarpH(x, z) {       // the aircraft under its tarpaulin: nose at z = -5, tail at +5
    const ax = Math.abs(x);
    const top = 1.55 + 0.75 * sm(-5, -3.6, z) * (1 - sm(-1.2, 4.6, z) * 0.45) + 0.4 * sm(-3.8, -2.8, z) * (1 - sm(-2.2, -1.0, z));
    let h = top * (1 - sm(0.45, 1.9, ax));
    h = Math.max(h, 1.15 * (1 - sm(5.5, 6.3, ax)) * sm(-2.4, -1.6, z) * (1 - sm(0.5, 1.3, z)));
    h = Math.max(h, 1.35 * (1 - sm(1.9, 2.6, ax)) * sm(3.2, 3.8, z) * (1 - sm(4.5, 5.0, z)));
    h = Math.max(h, 3.0 * (1 - sm(0.06, 0.75, ax)) * sm(2.9, 4.0, z) * (1 - sm(4.5, 5.0, z)));
    h *= 1 - sm(4.9, 5.5, Math.abs(z));
    if (h > 0.1) h += 0.035 * Math.sin(x * 5 + z * 3) * Math.sin(z * 7 - x * 2);
    return Math.max(0.03, h);
  }
  {
    const H = HANGAR, n = 20, xs = [], ys = [], ss = [0], skin = 0x8d948c, inner = 0x50554f, k = 1.25;
    for (let i = 0; i <= n; i++) {
      xs.push(H.a * Math.cos((Math.PI * i) / n)); ys.push(H.b * Math.sin((Math.PI * i) / n));
      if (i) ss.push(ss[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
    }
    for (let i = 0; i < n; i++) {
      const x0 = xs[i], y0 = ys[i], x1 = xs[i + 1], y1 = ys[i + 1], uv = [H.z1 * k, ss[i] * k, H.z0 * k, ss[i + 1] * k];
      quad("metal", x0, y0, H.z1, x0, y0, H.z0, x1, y1, H.z0, x1, y1, H.z1, skin, { uv, ao: false });
      quad("metal", x0, y0, H.z0, x0, y0, H.z1, x1, y1, H.z1, x1, y1, H.z0, inner, { uv, ao: false });
      quad("metal", x0, 0, H.z1 - 0.02, x1, 0, H.z1 - 0.02, x1, y1, H.z1 - 0.02, x0, y0, H.z1 - 0.02, inner, { n: [0, 0, -1], uv: [x0 * k, 0, x1 * k, Math.max(y0, y1) * k], ao: false });
      const lo = Math.abs((x0 + x1) / 2) < H.door ? H.doorH : 0;
      if (Math.max(y0, y1) > lo + 0.05) {
        const ya = Math.max(y0, lo), yb = Math.max(y1, lo), fu = [x0 * k, lo * k, x1 * k, Math.max(ya, yb) * k];
        quad("metal", x0, lo, H.z0, x1, lo, H.z0, x1, yb, H.z0, x0, ya, H.z0, skin, { n: [0, 0, -1], uv: fu, ao: false });
        quad("metal", x1, lo, H.z0 + 0.02, x0, lo, H.z0 + 0.02, x0, ya, H.z0 + 0.02, x1, yb, H.z0 + 0.02, inner, { n: [0, 0, 1], uv: fu, ao: false });
      }
    }
    for (const s of [-1, 1]) {
      slab("metal", s > 0 ? 10.7 : -16.6, s > 0 ? 16.6 : -10.7, 0, H.doorH, H.z0 - 0.38, H.z0 - 0.26, 0x7d847c, { box: k });   // the doors, rolled open
      wall(s > 0 ? 10.6 : -16.6, s > 0 ? 16.6 : -10.6, H.z0 - 0.4, H.z0 + 0.2, { sight: true, h: 5, surface: "metal" });
      wall(s > 0 ? 14.7 : -15.3, s > 0 ? 15.3 : -14.7, H.z0, H.z1, { sight: true, h: 6, surface: "metal" });
      beam("paint", s * 10.65, 0, H.z0 - 0.1, s * 10.65, H.doorH, H.z0 - 0.1, 0.22, C.yellow);
    }
    beam("paint", -16.6, H.doorH + 0.1, H.z0 - 0.32, 16.6, H.doorH + 0.1, H.z0 - 0.32, 0.14, C.steelD, { ao: false });
    wall(H.x0, H.x1, H.z1 - 0.3, H.z1 + 0.3, { sight: true });
    onWall("decal", DC.hangar, 0, 6.75, H.z0 - 0.04, 0, -1, 7, 2, 0xffffff);
    // the mezzanine: store rooms below, a railed gallery above (heightAt returns MEZ.y on it)
    slab("concrete", MEZ.x0, MEZ.x1, 0, MEZ.y, MEZ.z0, H.z1 - 0.05, 0x9c9a92, { box: 0.5 });
    for (const x of [-9, 0, 9]) onWall("atlas", CELL.door, x, 1.05, MEZ.z0 - 0.03, 0, -1, 1.0, 2.1, 0xffffff);
    for (const x of [-4.5, 4.5]) onWall("atlas", CELL.window, x, 1.6, MEZ.z0 - 0.03, 0, -1, 1.4, 0.9, 0xffffff);
    for (const y of [MEZ.y + 0.55, MEZ.y + 1.0]) beam("paint", MEZ.x0, y, MEZ.z0 + 0.08, MEZ.x1, y, MEZ.z0 + 0.08, 0.05, C.yellow, { ao: false });
    for (let i = 0; i <= 12; i++) { const x = MEZ.x0 + ((MEZ.x1 - MEZ.x0) * i) / 12; beam("paint", x, MEZ.y, MEZ.z0 + 0.08, x, MEZ.y + 1.0, MEZ.z0 + 0.08, 0.05, C.yellow, { ao: false }); }
    for (const s of [-0.25, 0.25]) beam("paint", 13.2 + s, 0, MEZ.z0 - 0.5, 13.2 + s, MEZ.y + 0.9, MEZ.z0 - 0.12, 0.05, C.steel);
    for (let r = 1; r < 9; r++) beam("paint", 12.95, r * 0.4, MEZ.z0 - 0.5 + 0.047 * r, 13.45, r * 0.4, MEZ.z0 - 0.5 + 0.047 * r, 0.035, C.steel, { ao: false });
    wall(MEZ.x0, MEZ.x1, MEZ.z0 - 0.15, MEZ.z0 + 0.15);
    const tg = new THREE.PlaneGeometry(13.4, 11.6, 28, 26), tp = tg.attributes.position;
    for (let i = 0; i < tp.count; i++) { const x = tp.getX(i), z = -tp.getY(i); tp.setXYZ(i, x, tarpH(x, z), z); }
    tg.computeVertexNormals();
    add("atlas", tg, xf(0, 0, 74.3, 1, 1, 1), 0xe4e2d0, { cell: CELL.tarp, ao: false });
    for (const z of [70, 72, 74, 76, 78]) { colliders.push({ x: 0, z, r: 1.15, on: true }); cover.push({ x: 0, z, r: 1.3, h: 1.7, surface: "wood", on: true }); }
    for (const x of [-4.6, -2.6, 2.6, 4.6]) colliders.push({ x, z: 73.9, r: 1.05, on: true });
    for (const x of [-6, 6]) for (const z of [64.5, 79.5]) flat("decal", DC.line, x, (64.5 + 79.5) / 2, 0.14, 15, 0, C.yellow);
  }

  // ---------------------------------------------------------------------------------------------- the armoury
  const AMMO_P = [[-26.2, 77], [-27.7, 75.9], [-26.2, 85.7]];
  const TGT_P = [[-32, 75.25], [-29.6, 75.25]];
  const RACK = { suit: { x: -33, z: 78, ix: -34.45, iy: 0.8, iz: 78 }, glasses: { x: -33, z: 82, ix: -34.45, iy: 0.86, iz: 82 }, blaster: { x: -30, z: 85, ix: -30, iy: 0.84, iz: 86.5 } };
  let doorWall = null;
  {
    const A = ARM, hex = 0x8f8d86, o = { box: 0.5 }, xi0 = A.x0 + A.t, xi1 = A.x1 - A.t, zi0 = A.z0 + A.t, zi1 = A.z1 - A.t;
    slab("concrete", A.x0, xi0, 0, A.h, A.z0, A.z1, hex, o);
    slab("concrete", xi0, xi1, 0, A.h, A.z0, zi0, hex, o);
    slab("concrete", xi0, xi1, 0, A.h, zi1, A.z1, hex, o);
    slab("concrete", xi1, A.x1, 0, A.h, A.z0, A.dz0, hex, o);
    slab("concrete", xi1, A.x1, 0, A.h, A.dz1, A.z1, hex, o);
    slab("concrete", xi1, A.x1, 2.3, A.h, A.dz0, A.dz1, hex, o);
    slab("concrete", A.x0 - 0.3, A.x1 + 0.3, A.h, A.h + 0.4, A.z0 - 0.3, A.z1 + 0.3, 0x7d7b74, o);
    wall(A.x0, xi0, A.z0, A.z1, { sight: true, h: 3 }); wall(xi0, xi1, A.z0, zi0, { sight: true, h: 3 }); wall(xi0, xi1, zi1, A.z1, { sight: true, h: 3 });
    wall(xi1, A.x1, A.z0, A.dz0, { sight: true, h: 3 }); wall(xi1, A.x1, A.dz1, A.z1, { sight: true, h: 3 });
    doorWall = wall(xi1, A.x1, A.dz0, A.dz1, { sight: true, h: 2.3, surface: "metal" });
    // the steel door (hinged at z = 79) and where it lands
    slab("atlas", A.x1 - 0.2, A.x1 - 0.08, 0, 2.3, A.dz0, A.dz1, 0xffffff, { cell: CELL.steel, part: PT.DOOR, ao: false });
    for (const y of [0.4, 1.9]) box("paint", A.x1 - 0.05, y, A.dz0 + 0.06, 0.1, 0.22, 0.12, C.steelD, { part: PT.DOOR, ao: false });
    slab("atlas", -27.5, -25.2, 0.02, 0.13, A.dz0 - 0.1, A.dz1 - 0.1, 0xd0d0d0, { cell: CELL.steel, part: PT.DOOR_DOWN, ao: false });
    onWall("decal", DC.armoury, A.x1 + 0.03, 2.05, 84.2, 1, 0, 3.4, 0.8, 0xffffff);
    onWall("decal", DC.keepout, A.x1 + 0.03, 1.5, 77, 1, 0, 1.6, 0.5, 0xffffff);
    onWall("decal", DC.hazard, A.x1 + 0.03, 2.42, 80, 1, 0, 2.2, 0.2, 0xffffff);
    // racks: a pegboard, a shelf, a strip light
    const rack = (r, nx, nz) => {
      const wx = r.ix - nx * 0.5, wz = r.iz - nz * 0.5;
      onWall("atlas", CELL.peg, wx + nx * 0.03, 1.1, wz + nz * 0.03, nx, nz, 1.7, 1.7, 0xffffff, { ao: false });
      box("paint", wx + nx * 0.3, 0.5, wz + nz * 0.3, nx ? 0.6 : 1.7, 0.06, nx ? 1.7 : 0.6, C.steel, { ao: false });
      for (const s of [-0.8, 0.8]) box("paint", wx + nx * 0.3 + nz * s, 0.25, wz + nz * 0.3 + nx * s, 0.06, 0.5, 0.06, C.steelD);
      bulb(wx + nx * 0.25, 2.2, wz + nz * 0.25, nx ? 0.1 : 1.3, 0.06, nx ? 1.3 : 0.1, 0xe8f2ff, 6);
      glow(wx + nx * 0.3, 2.15, wz + nz * 0.3, 0xd8e8ff, 1.3, 6);
      wall(Math.min(wx, wx + nx * 0.6) - Math.abs(nz) * 0.85, Math.max(wx, wx + nx * 0.6) + Math.abs(nz) * 0.85, Math.min(wz, wz + nz * 0.6) - Math.abs(nx) * 0.85, Math.max(wz, wz + nz * 0.6) + Math.abs(nx) * 0.85);
    };
    rack(RACK.suit, 1, 0); rack(RACK.glasses, 1, 0); rack(RACK.blaster, 0, -1);
    // the suit: a small plated harness on a stand
    let p = { part: PT.SUIT, ao: false }, r = RACK.suit;
    box("paint", r.ix, 0.6, r.iz, 0.05, 0.3, 0.05, C.steelD, { ao: false });
    box("paint", r.ix, 0.84, r.iz, 0.2, 0.2, 0.56, 0x2d3338, p);
    box("paint", r.ix + 0.02, 0.96, r.iz, 0.24, 0.05, 0.4, 0x3d454b, p);
    for (const s of [-0.2, 0, 0.2]) box("paint", r.ix + 0.1, 0.84, r.iz + s, 0.03, 0.16, 0.14, 0x4b565d, p);
    for (const s of [-0.3, 0.3]) box("paint", r.ix, 0.86, r.iz + s, 0.22, 0.08, 0.04, C.olive, p);
    // the glasses: a visor band on a head-form
    p = { part: PT.GLASSES, ao: false }; r = RACK.glasses;
    cyl("paint", r.ix, 0.53, r.iz, 0.09, 0.26, 8, 0x8a8478, { ao: false });
    box("paint", r.ix + 0.09, 0.86, r.iz, 0.05, 0.08, 0.3, 0x19b7c9, p);
    box("paint", r.ix + 0.07, 0.86, r.iz, 0.06, 0.11, 0.34, 0x1b1e21, p);
    for (const s of [-0.17, 0.17]) box("paint", r.ix - 0.02, 0.86, r.iz + s, 0.2, 0.04, 0.02, 0x1b1e21, p);
    // the blaster: a stubby launcher
    p = { part: PT.BLASTER, ao: false }; r = RACK.blaster;
    cyl("paint", r.ix + 0.12, r.iy, r.iz, 0.055, 0.6, 8, C.steelD, { center: true, rz: Math.PI / 2, part: PT.BLASTER, ao: false });
    box("paint", r.ix - 0.14, r.iy, r.iz, 0.34, 0.16, 0.14, 0x3a4147, p);
    box("paint", r.ix - 0.2, r.iy - 0.14, r.iz, 0.08, 0.16, 0.08, 0x23272a, p);
    cyl("paint", r.ix + 0.42, r.iy, r.iz, 0.075, 0.07, 8, 0xd6791c, { center: true, rz: Math.PI / 2, part: PT.BLASTER, ao: false });
    box("paint", r.ix - 0.05, r.iy + 0.11, r.iz, 0.2, 0.05, 0.05, 0x19b7c9, p);
    // ammo crates and the tins in them, cardboard targets, lockers
    AMMO_P.forEach((a, i) => {
      box("atlas", a[0], 0.2, a[1], 0.8, 0.4, 0.55, 0xffffff, { cell: CELL.crate, cap: CELL.pallet, ry: 0.3 * (i - 1) });
      for (const s of [-0.18, 0.18]) box("atlas", a[0] + s, 0.48, a[1], 0.3, 0.2, 0.42, 0xffffff, { cell: CELL.ammo, ry: 0.3 * (i - 1), part: PT.AMMO + i, ao: false });
      colliders.push({ x: a[0], z: a[1], r: 0.42, on: true });
    });
    TGT_P.forEach((t, i) => {
      beam("paint", t[0], 0, t[1], t[0], 0.5, t[1], 0.05, C.wood);
      onWall("atlas", CELL.target, t[0], 0.9, t[1] + 0.03, 0, 1, 0.7, 1.3, 0xffffff, { part: PT.TGT + i * 2, ao: false });
      flat("atlas", CELL.target, t[0], t[1] + 0.85, 0.7, 1.3, 0, 0xc8c8c8, { part: PT.TGT + i * 2 + 1, y: 0.03 });
    });
    for (let i = 0; i < 4; i++) box("paint", xi1 - 0.3, 1.0, 82.4 + i * 0.62, 0.5, 2.0, 0.58, i % 2 ? 0x4a5257 : 0x525b60);
    wall(xi1 - 0.6, xi1, 82.1, 84.6);
    box("paint", -30.6, 0.42, 76.0, 2.2, 0.08, 0.7, C.wood, { ao: false });
    for (const s of [-1, 1]) box("paint", -30.6 + s, 0.2, 76.0, 0.08, 0.4, 0.6, C.steelD);
  }

  // ---------------------------------------------------------------------------------------------- the fuel dump
  const fuelCol = { x: 34, z: 60, r: 1.9, on: true };
  colliders.push(fuelCol);
  {
    const tint = [0x9aa37a, 0x9aa37a, 0xb0574a, 0x9aa37a, 0x8e9aa3];
    for (const px of [33.35, 34.65]) box("atlas", px, 0.07, 60, 1.25, 0.14, 1.9, 0xffffff, { cell: CELL.pallet, part: PT.FUEL, ao: false });
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      cyl("atlas", 33.05 + i * 0.63, 0.14, 59.37 + j * 0.63, 0.29, 0.88, 10, tint[(i * 3 + j) % 5], { cell: CELL.drum, cap: CELL.drumTop, part: PT.FUEL, ry: R(0, TAU) });
    }
    cyl("atlas", 35.9, 0.3, 60.9, 0.29, 0.88, 10, 0x9aa37a, { cell: CELL.drum, cap: CELL.drumTop, part: PT.FUEL, center: true, rz: Math.PI / 2, ry: 0.4 });
    for (let i = 0; i < 4; i++) box("paint", 32.3 + i * 0.22, 0.24, 61.75, 0.16, 0.48, 0.34, i % 2 ? C.olive : 0x7a2a22, { part: PT.FUEL });
    for (let i = 0; i < 7; i++) {
      const a = R(0, TAU), d = R(0.4, 3.6);
      cyl("atlas", 34 + Math.cos(a) * d, 0.3, 60 + Math.sin(a) * d, 0.29, 0.88, 8, 0x2a2420, { cell: CELL.drum, cap: CELL.drumTop, part: PT.FUEL_WRECK, center: true, rx: R(0.9, 1.6), rz: R(-0.5, 0.5), ry: a, ao: false });
    }
    flat("decal", DC.scorch, 34, 60, 9.5, 9.5, 0.7, 0xffffff, { part: PT.FUEL_WRECK });
    beam("paint", 31.2, 0, 56.9, 31.2, 2.2, 56.9, 0.07, C.steelD);
    onWall("decal", DC.fuel, 31.2, 1.75, 56.86, 0, -1, 1.6, 0.9, 0xffffff);
  }

  // ---------------------------------------------------------------------------------------------- the radio mast
  {
    const mx = 32, mz = 88, H = 26, hw = (y) => 0.8 - (0.65 * y) / H;
    for (let k = 0; k < 9; k++) {
      const y0 = (k * H) / 9, y1 = ((k + 1) * H) / 9, a = hw(y0), b = hw(y1), hex = k % 2 ? 0xc9c8c0 : 0x9c2a20;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam("paint", mx + sx * a, y0, mz + sz * a, mx + sx * b, y1, mz + sz * b, 0.09, hex, { ao: false });
      for (const s of [-1, 1]) {
        beam("paint", mx - b, y1, mz + s * b, mx + b, y1, mz + s * b, 0.05, hex, { ao: false }); beam("paint", mx + s * b, y1, mz - b, mx + s * b, y1, mz + b, 0.05, hex, { ao: false });
        beam("paint", mx - a, y0, mz + s * a, mx + b, y1, mz + s * b, 0.045, hex, { ao: false }); beam("paint", mx + s * a, y0, mz - a, mx + s * b, y1, mz + b, 0.045, hex, { ao: false });
      }
    }
    beam("paint", mx, H, mz, mx, H + 3.2, mz, 0.04, C.steelD, { ao: false });
    cyl("paint", mx + 0.5, 19, mz, 0.55, 0.14, 10, 0xc9c8c0, { center: true, rz: Math.PI / 2, ao: false });
    for (let i = 0; i < 3; i++) { const a = 0.6 + (i * TAU) / 3; beam("paint", mx, 20, mz, mx + Math.cos(a) * 7, 0, mz + Math.sin(a) * 7, 0.03, C.steelD, { ao: false }); }
    bulb(mx, H + 0.25, mz, 0.26, 0.3, 0.26, 0xff2a14, 2); glow(mx, H + 0.25, mz, 0xff2a14, 3.0, 2);
    wall(mx - 0.9, mx + 0.9, mz - 0.9, mz + 0.9);
    slab("concrete", 26, 30, 0, 2.6, 86.5, 90, C.white, { box: 0.5 });
    box("metal", 28, 2.72, 88.25, 4.6, 0.07, 4.1, C.tin, { rx: -0.06, box: 1.25, ao: false });
    onWall("atlas", CELL.door, 28, 1.05, 86.47, 0, -1, 1.0, 2.1, 0xffffff);
    onWall("atlas", CELL.window, 26.9, 1.5, 86.47, 0, -1, 0.8, 0.8, 0xffffff);
    beam("paint", 29, 2.7, 88.4, 29, 4.2, 88.4, 0.06, C.steelD, { ao: false });
    cyl("paint", 27, 3.0, 87.2, 0.26, 0.5, 8, C.steel, { center: true, rx: Math.PI / 2, top: 0.35, ao: false });
    wall(26, 30, 86.5, 90, { sight: true, h: 2.6 });
  }

  // ---------------------------------------------------------------------------------------------- paint on the ground
  flat("decal", DC.line, 0, 54, 0.22, 15, 0, C.yellow);
  flat("decal", DC.line, 0, 46.8, 44, 0.22, 0, C.yellow);
  flat("decal", DC.line, 0, 61.6, 44, 0.22, 0, C.yellow);
  flat("decal", DC.num, 13, 51.5, 5, 4.5, 0, 0xffffff);
  flat("decal", DC.arrow, -15, 50, 1.6, 3, Math.PI / 2, 0xffffff);
  flat("decal", DC.arrow, 0, 40, 1.3, 2.5, 0, 0xffffff);
  flat("decal", DC.motor, 24, 22.2, 6, 1.2, 0, 0xffffff);
  for (const x of [18, 22, 26, 30]) flat("decal", DC.line, x, 28, 0.14, 7.4, 0, 0xd8d8d0);
  for (const p of [[21, 30.5, 1.6], [25, 25, 1.3], [6, 53, 2.2], [-9, 57, 1.6], [3, 70, 1.8], [-4, 16, 1.4], [28.2, 26, 1.2]]) flat("decal", DC.oil, p[0], p[1], p[2], p[2], R(0, TAU), 0xffffff, { y: 0.015 });

  // ---------------------------------------------------------------------------------------------- ground, sky, grass, trees
  const groundH = (z) => (z < 2 ? RISE * sm(2, -11, z) : 0);
  {
    const nx = 10, nz = 80, p = [], idx = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const z = -30 + j * 2; p.push(-70 + i * 14, groundH(z), z); }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + nx + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.ground);
    m.name = "base.ground"; m.receiveShadow = true; m.frustumCulled = false; m.matrixAutoUpdate = false;
    group.add(m);
    tris += idx.length / 3;
  }
  const SKY_SPAN = Math.PI / 2 + 0.15;
  const skyU = { uSky: { value: null }, uFogC: { value: new THREE.Color(ENVS.night.fog[0]) }, uDawn: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 10, 0, TAU, 0, SKY_SPAN),
    new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }));
  {
    const th = Math.acos(clamp(moonDir.y, -1, 1));
    let u = Math.atan2(moonDir.z, -moonDir.x) / TAU;
    if (u < 0) u += 1;
    skyU.uSky.value = makeSkyTex(THREE, rnd, u, 1 - th / SKY_SPAN, Math.sin(th));
    sky.name = "base.sky"; sky.renderOrder = -10; sky.frustumCulled = false;
    group.add(sky);
    tris += 640;
  }
  const dummy = new THREE.Object3D();
  let grassMesh = null;
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0, 0, 0, -0.5, 0, 0, 0.5, 0, 1, 0.5, 0, 1, -0.5], 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    const spots = [];
    const tryAt = (x, z) => {
      if (z < 5.3 ? Math.abs(x - roadX(z)) < 2.9 : Math.abs(x) < FX + 0.7) return;
      if (Math.hypot(x - HOLE.x, z - FS) < 1.5) return;
      spots.push(x, z);
    };
    for (let i = 0; i < 2500; i++) tryAt(R(-47.5, 47.5), R(-13.5, 5.2));
    for (let i = 0; i < 1100; i++) tryAt((rnd() < 0.5 ? -1 : 1) * R(FX + 0.8, 47.5), R(5.2, FN));
    const n = spots.length / 2;
    grassMesh = new THREE.InstancedMesh(g, M.grass, n);
    for (let i = 0; i < n; i++) {
      const x = spots[i * 2], z = spots[i * 2 + 1], s = R(0.8, 1.35);
      dummy.position.set(x, groundH(z) - 0.03, z); dummy.rotation.set(0, R(0, TAU), 0); dummy.scale.set(s, s, s); dummy.updateMatrix();
      grassMesh.setMatrixAt(i, dummy.matrix);
      const v = R(0.5, 1.0);
      grassMesh.setColorAt(i, _c.setRGB(0.5 * v, 0.62 * v, 0.34 * v));
    }
    grassMesh.name = "base.grass"; grassMesh.frustumCulled = false; grassMesh.matrixAutoUpdate = false;
    group.add(grassMesh);
    tris += n * 4;
  }
  {
    const g = new THREE.PlaneGeometry(1, 1);
    g.translate(0, 0.5, 0);
    const list = [];
    for (let x = -66; x <= 66; x += 19) { list.push([x + R(-3, 3), -16.5, 0, R(15, 20)], [x + 9 + R(-3, 3), -22, 0, R(20, 26)], [x + R(-3, 3), 117, Math.PI, R(15, 21)]); }
    for (let z = -10; z <= 120; z += 19) { list.push([-50.5, z + R(-3, 3), Math.PI / 2, R(15, 21)], [50.5, z + R(-3, 3), -Math.PI / 2, R(15, 21)]); }
    const tm = new THREE.InstancedMesh(g, M.trees, list.length);
    list.forEach((t, i) => {
      dummy.position.set(t[0], groundH(t[1]) - 0.4, t[1]); dummy.rotation.set(0, t[2], 0); dummy.scale.set(30, t[3], 1); dummy.updateMatrix();
      tm.setMatrixAt(i, dummy.matrix);
      const v = R(0.55, 0.9);
      tm.setColorAt(i, _c.setRGB(v, v, v));
    });
    tm.name = "base.trees"; tm.frustumCulled = false; tm.matrixAutoUpdate = false;
    group.add(tm);
    tris += list.length * 2;
  }
  {
    // one sandbag: a box puffed toward an ellipsoid
    const g = new THREE.BoxGeometry(1, 1, 1, 3, 1, 2), p = g.attributes.position, nr = g.attributes.normal, uv = g.attributes.uv, c = CELL.burlap;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) * 2, y = p.getY(i) * 2, z = p.getZ(i) * 2;
      const qx = x * Math.sqrt(1 - (y * y) / 2 - (z * z) / 2 + (y * y * z * z) / 3), qy = y * Math.sqrt(1 - (x * x) / 2 - (z * z) / 2 + (x * x * z * z) / 3), qz = z * Math.sqrt(1 - (x * x) / 2 - (y * y) / 2 + (x * x * y * y) / 3);
      const fx2 = x + (qx - x) * 0.7, fy = y + (qy - y) * 0.7, fz = z + (qz - z) * 0.7;
      p.setXYZ(i, fx2 * 0.33, fy * 0.105, fz * 0.19);
      _v.set(fx2 / 0.33, fy / 0.105 * 0.6, fz / 0.19).normalize();
      nr.setXYZ(i, _v.x, _v.y, _v.z);
      uv.setXY(i, c[0] + (c[2] - c[0]) * uv.getX(i), c[1] + (c[3] - c[1]) * uv.getY(i));
    }
    const bm = new THREE.InstancedMesh(g, M.bags, bags.length);
    bags.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z); dummy.rotation.set(R(-0.05, 0.05), b.yaw, R(-0.05, 0.05)); dummy.scale.set(R(0.94, 1.04), R(0.92, 1.05), R(0.94, 1.04)); dummy.updateMatrix();
      bm.setMatrixAt(i, dummy.matrix);
      const v = R(0.62, 0.92);
      bm.setColorAt(i, _c.setRGB(v, v * 0.97, v * 0.88));
    });
    bm.name = "base.bags"; bm.frustumCulled = false; bm.matrixAutoUpdate = false; bm.receiveShadow = true;
    group.add(bm);
    tris += bags.length * 44;
  }

  // ---------------------------------------------------------------------------------------------- the lever (its own small mesh: it swings)
  const LEVER = { x: 11.0, y: 1.0, z: 41.16 };
  box("lever", 0, 0.22, 0, 0.04, 0.5, 0.04, C.steel, { ao: false });
  box("lever", 0, 0.5, 0, 0.09, 0.12, 0.09, 0xc4281c, { ao: false });

  // ---------------------------------------------------------------------------------------------- meshes
  meshOf("concrete", M.concrete, true, true);
  meshOf("concreteDyn", M.concrete, false, true);
  meshOf("metal", M.metal, true, true);
  meshOf("metalDyn", M.metal, false, false);
  meshOf("paint", M.paint, true, false);
  meshOf("paintDyn", M.paint, false, false);
  meshOf("atlas", M.atlas, true, true);
  meshOf("atlasDyn", M.atlas, false, false);
  meshOf("fence", M.fence, false, false);
  meshOf("decal", M.decal, false, false);
  const leverMesh = meshOf("lever", M.paint, false, false);
  leverMesh.matrixAutoUpdate = true;
  leverMesh.position.set(LEVER.x, LEVER.y, LEVER.z);
  leverMesh.rotation.x = 0.7;
  {
    const b = B.bulb, g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(b.p, 3));
    g.setAttribute("aColor", new THREE.Float32BufferAttribute(b.c, 3));
    g.setAttribute("aKind", new THREE.Float32BufferAttribute(b.a, 1));
    g.setIndex(b.i);
    const m = new THREE.Mesh(g, M.bulb);
    m.name = "base.bulbs"; m.frustumCulled = false; m.matrixAutoUpdate = false;
    group.add(m);
    tris += b.i.length / 3;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.Float32BufferAttribute(glowA.p, 3));
    pg.setAttribute("aColor", new THREE.Float32BufferAttribute(glowA.c, 3));
    pg.setAttribute("aSize", new THREE.Float32BufferAttribute(glowA.s, 1));
    pg.setAttribute("aKind", new THREE.Float32BufferAttribute(glowA.k, 1));
    const pm = new THREE.Points(pg, M.glow);
    pm.name = "base.glow"; pm.frustumCulled = false; pm.matrixAutoUpdate = false; pm.renderOrder = 6;
    group.add(pm);
    const fm = new THREE.Mesh(coneGeo(floodCones), M.cone);
    fm.name = "base.floodCones"; fm.frustumCulled = false; fm.matrixAutoUpdate = false; fm.renderOrder = 4;
    group.add(fm);
    tris += floodCones.i.length / 3;
  }
  const slCones = [0, 1].map((i) => {
    const A = newCone();
    cone(A, 0, 0, 0, 0, 0, 1, 0.07, 1, 24, 0xd6e6ff, 0.2, 4 + i);
    const m = new THREE.Mesh(coneGeo(A), M.cone);
    m.name = "base.searchlight" + i; m.frustumCulled = false; m.renderOrder = 5;
    m.position.set(slLamp[i].x, slLamp[i].y, slLamp[i].z);
    group.add(m);
    tris += 48;
    return m;
  });
  const fireball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  fireball.name = "base.fireball"; fireball.visible = false; fireball.renderOrder = 7;
  group.add(fireball);

  // ================================================================================================ queries
  function heightAt(x, z) {
    if (z > MEZ.z0 && z < HANGAR.z1 && x > MEZ.x0 && x < MEZ.x1) return MEZ.y;
    return z < 2 ? RISE * sm(2, -11, z) : 0;
  }
  function gAt(x, z, ch) {
    const i = clamp(((x - GX) * 4) | 0, 0, GW - 1), j = clamp(((z - GZ) * 4) | 0, 0, GD - 1);
    return groundPx[(j * GW + i) * 4 + ch];
  }
  function surfaceAt(x, z) {
    const conc = gAt(x, z, 0) > 127;
    if (gAt(x, z, 1) > 140) return conc ? "concrete" : "mud";
    if (conc) return "concrete";
    return gAt(x, z, 3) > 110 ? "grass" : "dirt";
  }
  // true = a clear line at eye height (buildings, crate stacks, trucks and the shut armoury door block; fences do not)
  function sight(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    for (let i = 0; i < sightBoxes.length; i++) {
      const w = sightBoxes[i];
      if (!w.on) continue;
      let t0 = 0, t1 = 1;
      if (Math.abs(dx) < 1e-9) { if (ax < w.x0 || ax > w.x1) continue; } else {
        let a = (w.x0 - ax) / dx, b = (w.x1 - ax) / dx;
        if (a > b) { const t = a; a = b; b = t; }
        if (a > t0) t0 = a;
        if (b < t1) t1 = b;
        if (t0 > t1) continue;
      }
      if (Math.abs(dz) < 1e-9) { if (az < w.z0 || az > w.z1) continue; } else {
        let a = (w.z0 - az) / dz, b = (w.z1 - az) / dz;
        if (a > b) { const t = a; a = b; b = t; }
        if (a > t0) t0 = a;
        if (b < t1) t1 = b;
        if (t0 > t1) continue;
      }
      return false;
    }
    return true;
  }
  const inRects = (list, x, z) => { for (let i = 0; i < list.length; i++) { const r = list[i]; if (x > r[0] && x < r[1] && z > r[2] && z < r[3]) return true; } return false; };
  const inGrass = (x, z) => (z < 5.2 ? Math.abs(x - roadX(z)) > 2.9 : Math.abs(x) > FX + 0.7 && z < FN);
  const hideSpot = (x, z) => inGrass(x, z) || inRects(hideRects, x, z);       // tall grass, under a truck, a hut porch
  const sneaking = () => !!(ctx.input && ctx.input.held && ctx.input.held("down"));
  function hidden(x, z) {
    if (hideSpot(x, z)) return true;
    if (!sneaking()) return false;                                            // low cover hides only a sneaking platypus
    for (let i = 0; i < rings.length; i++) { const q = rings[i]; if ((x - q.x) * (x - q.x) + (z - q.z) * (z - q.z) < q.r * q.r) return true; }
    return inRects(sneakRects, x, z);
  }
  let alarm = false, alarmK = 0;
  function poolAt(x, z) {
    const i = ((x - GX) * 2) | 0, j = ((z - GZ) * 2) | 0;
    if (i < 0 || j < 0 || i >= LW || j >= LD) return 0;
    return lg0[j * LW + i] * lv[0] + lg1[j * LW + i] * lv[1];
  }
  function lit(x, z) {
    for (let i = 0; i < 2; i++) if (lights[i].inBeam(x, z)) return 1;
    let v = 0.2 + 0.55 * clamp(poolAt(x, z) * 1.3, 0, 1);
    if (alarm && v < 0.6 && !hideSpot(x, z)) v = 0.6;
    return v;
  }
  function confine(o, radius) {
    const r = radius === undefined ? 0.35 : radius;
    if (o.x < X0 + 0.5) o.x = X0 + 0.5; else if (o.x > X1 - 0.5) o.x = X1 - 0.5;
    if (o.z < Z0 + 0.5) o.z = Z0 + 0.5; else if (o.z > Z1 - 0.5) o.z = Z1 - 0.5;
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (!w.on || (w.small && r <= 0.4)) continue;
      const a = o.x - (w.x0 - r), b = w.x1 + r - o.x;
      if (a <= 0 || b <= 0) continue;
      const c = o.z - (w.z0 - r), d = w.z1 + r - o.z;
      if (c <= 0 || d <= 0) continue;
      if (Math.min(a, b) < Math.min(c, d)) o.x = a < b ? w.x0 - r : w.x1 + r;
      else o.z = c < d ? w.z0 - r : w.z1 + r;
    }
  }

  // ================================================================================================ things that change
  const sfx = (name, a, b, c) => { const f = audio[name]; if (typeof f === "function") { try { return f.call(audio, a, b, c); } catch (e) { /* sound is never fatal */ } } };
  const has = (name) => typeof fx[name] === "function";
  const _fv = new THREE.Vector3();
  let blastK = 0, fireT = 0, smokeT = 0, ballT = -1, tNow = 0, outline = 0;
  function flash(x, z, k) { U.uBBlast.value.x = x; U.uBBlast.value.y = z; blastK = k; }

  // the two searchlights
  const SWEEP = [(t, o) => { o.x = -14 + 9 * Math.cos(t * TAU); o.z = 18 + 10.5 * Math.sin(t * TAU); }, (t, o) => { o.x = 14 + 14 * Math.cos(t * TAU); o.z = 24 + 9 * Math.sin(t * 2 * TAU); }];
  const _sw = { x: 0, z: 0 };
  const lights = [0, 1].map((i) => {
    const L = {
      i, x: 0, z: 0, r: 3.5, on: true, blinded: false, period: i ? 11 : 8, phase: i ? 0.3 : 0.55, caught: 0, spotted: false, target: null, level: 1,
      lamp: slLamp[i], tower: TOWERS[i], targetable: true,
      inBeam(x, z) { return this.on && !this.blinded && (x - this.x) * (x - this.x) + (z - this.z) * (z - this.z) < this.r * this.r; },
      track(o) { this.target = o || null; },                 // follow { x, z } with a 1.5 s lag; null = back to the sweep
      blind() { if (this.blinded) return false; this.blinded = true; this.targetable = false; if (has("crashSparks")) fx.crashSparks(this.lamp, 16); return true; },
      hit() { return this.blind(); },                        // a stun bolt on the lamp
    };
    SWEEP[i](L.phase, L);
    return L;
  });

  function makeGate(name, part, dir, z) {
    return {
      name, x: 0, z, opened: false, blown: false, t: 0,
      open() { if (this.opened) return false; this.opened = true; return true; },
      close() { this.opened = false; this.blown = false; parts[part].w = 1; if (part === PT.GATE) parts[PT.GATE_WRECK].w = 0; },
      // the main gate only: thrown off its rail (the level plays audio.explosion)
      blow() {
        if (this.blown || part !== PT.GATE) return false;
        this.blown = this.opened = true; this.t = 1;
        parts[part].w = 0; parts[PT.GATE_WRECK].w = 1;
        setWall(gateWalls.main, false);
        flash(0, z, 2.4);
        if (has("slam")) fx.slam(0, z + 0.5, 4.5, 0xffb060, 0);
        if (has("crashSparks")) fx.crashSparks(_fv.set(0, 1.2, z), 40);
        if (has("smoke")) fx.smoke(0, 0.4, z + 0.5, 1.6, 5);
        return true;
      },
      _part: part, _dir: dir, _wall: gateWalls[name],
    };
  }
  const gates = { main: makeGate("main", PT.GATE, 1, FS), inner: makeGate("inner", PT.INNER, -1, FI) };

  const doors = {
    armoury: {
      x: ARM.x1 - 0.5, z: 80, hinge: pt(ARM.x1 - 0.05, 1.1, ARM.dz0 + 0.06), hits: 0, opened: false, shake: 0,
      // one Tail Slap on the hinge: the door jumps; true once it has taken three (then call open())
      hit() {
        if (this.opened) return true;
        this.hits++; this.shake = 0.4;
        if (has("crashSparks")) fx.crashSparks(this.hinge, 6 + this.hits * 4);
        return this.hits >= 3;
      },
      open() {
        if (this.opened) return false;
        this.opened = true; this.hits = Math.max(this.hits, 3);
        parts[PT.DOOR].w = 0; parts[PT.DOOR_DOWN].w = 1;
        setWall(doorWall, false);
        if (has("slam")) fx.slam(-26.3, 80, 1.8, 0xcfc8b8, 0);
        return true;
      },
      close() { this.opened = false; this.hits = 0; this.shake = 0; parts[PT.DOOR].set(0, 0, 0, 1); parts[PT.DOOR_DOWN].w = 0; setWall(doorWall, true); },
    },
  };
  const lever = {
    x: LEVER.x, y: LEVER.y, z: 40.9, pulled: false,
    // thrown: the handle drops and the inner gate rolls open (the level plays audio.gateOpen)
    pull() { if (this.pulled) return false; this.pulled = true; sfx("leverPull"); gates.inner.open(); return true; },
    reset() { this.pulled = false; },
  };
  const makeTake = (x, z, part, item) => ({
    x, z, y: 0, item, taken: false,
    take() { if (this.taken) return false; this.taken = true; parts[part].w = 0; return true; },
    reset() { this.taken = false; parts[part].w = 1; },
  });
  const racks = {
    suit: makeTake(RACK.suit.x, RACK.suit.z, PT.SUIT, pt(RACK.suit.ix, RACK.suit.iy, RACK.suit.iz)),
    glasses: makeTake(RACK.glasses.x, RACK.glasses.z, PT.GLASSES, pt(RACK.glasses.ix, RACK.glasses.iy, RACK.glasses.iz)),
    blaster: makeTake(RACK.blaster.x, RACK.blaster.z, PT.BLASTER, pt(RACK.blaster.ix, RACK.blaster.iy, RACK.blaster.iz)),
  };
  const ammo = AMMO_P.map((a, i) => makeTake(a[0], a[1], PT.AMMO + i, pt(a[0], 0.5, a[1])));
  // the two cardboard targets of the firing-range moment: pass them to ctx.abilities.shoot as targets
  const targets = TGT_P.map((t, i) => ({
    x: t[0], y: 0.9, z: t[1], r: 0.5, hp: 1, alive: true, targetable: true, kind: "target",
    hit() {
      if (!this.alive) return false;
      this.alive = this.targetable = false;
      parts[PT.TGT + i * 2].w = 0; parts[PT.TGT + i * 2 + 1].w = 1;
      if (has("hitBurst")) fx.hitBurst(_fv.set(this.x, 0.9, this.z), 0xd9c39a);
      return true;
    },
    reset() { this.alive = this.targetable = true; parts[PT.TGT + i * 2].w = 1; parts[PT.TGT + i * 2 + 1].w = 0; },
  }));
  const fuel = {
    x: 34, y: 0.6, z: 60, r: 1.9, exploded: false, alive: true, targetable: true, kind: "fuel", onExplode: null,
    // the drums go up: fireball, the east fence torn open (eastGap), audio.explosion. The level knocks the soldiers down.
    explode() {
      if (this.exploded) return false;
      this.exploded = true; this.alive = this.targetable = false;
      parts[PT.FUEL].w = 0; parts[PT.FUEL_WRECK].w = 1; parts[PT.GAP].w = 0; parts[PT.GAP_OPEN].w = 1;
      fuelCol.on = false;
      setWall(gapWall, false);
      flash(34, 60, 3.2); fireT = 24; smokeT = 0; ballT = 0;
      const p = ctx.player;
      sfx("explosion", p ? clamp(Math.hypot(p.x - 34, p.z - 60) / 70, 0, 1) : 0);
      if (has("slam")) fx.slam(34, 60, 7, 0xffb060, 0);
      if (has("shockRing")) fx.shockRing(34, 60, 16, 15, 0xd8b890, 0);
      if (has("crashSparks")) fx.crashSparks(_fv.set(34, 1.2, 60), 60);
      if (has("smoke")) { fx.smoke(34, 0.6, 60, 2.6, 8); fx.smoke(38.5, 0.4, 58, 1.4, 6); }
      if (typeof this.onExplode === "function") this.onExplode();
      return true;
    },
    hit() { return this.explode(); },
    reset() {
      this.exploded = false; this.alive = this.targetable = true;
      parts[PT.FUEL].w = 1; parts[PT.FUEL_WRECK].w = 0; parts[PT.GAP].w = 1; parts[PT.GAP_OPEN].w = 0;
      fuelCol.on = true; setWall(gapWall, true); fireT = 0; ballT = -1; fireball.visible = false;
    },
  };

  let timeName = "night", dawn = 0, dawnTo = 0, dawnRate = 1, apronT = 9;
  function setAlarm(on) {
    on = !!on;
    if (on && !alarm) apronT = 0;
    alarm = on;
  }
  function setTime(name, seconds) {
    if (!ENVS[name]) name = "night";
    timeName = name;
    world.env = ENVS[name];
    dawnTo = name === "predawn" ? 1 : 0;
    if (seconds > 0) dawnRate = 1 / seconds; else { dawnRate = 1; dawn = dawnTo; skyU.uDawn.value = dawn; }
    if (ctx.world === world && typeof ctx.setEnv === "function") ctx.setEnv(ENVS[name], seconds || 0);
  }
  function setHunt(on, who) {
    const t = on ? who || ctx.player || null : null;
    lights[0].track(t); lights[1].track(t);
  }

  // ================================================================================================ per frame
  const CAM_ALL = [X0 + 0.5, X1 - 0.5, Z0 + 0.2, Z1 - 0.5, 14];
  const CAM_ARM = [ARM.x0 + 0.9, ARM.x1 - 0.9, ARM.z0 + 0.9, ARM.z1 - 0.9, 2.7];
  const CAM_HAN = [HANGAR.x0 + 0.8, HANGAR.x1 - 0.8, 40, MEZ.z0 - 0.4, 7.2];
  const camBounds = { minX: CAM_ALL[0], maxX: CAM_ALL[1], minZ: CAM_ALL[2], maxZ: CAM_ALL[3], maxY: CAM_ALL[4] };
  const _size = new THREE.Vector2();
  let pxT = 0;
  function update(dt, time, fcx, fcz) {
    tNow += dt;
    const p = ctx.player || null;
    if (fcx === undefined) { fcx = p ? p.x : 0; fcz = p ? p.z : 0; }
    const ease = Math.min(1, dt * 6);

    // light levels
    alarmK += ((alarm ? 1 : 0) - alarmK) * Math.min(1, dt * 5);
    apronT += dt;
    lv[0] += ((alarm ? 1.2 : 0.85) - lv[0]) * ease;
    // the apron floods strike like sodium lamps: two stutters, then full
    lv[1] = alarm ? (apronT < 0.07 ? 1 : apronT < 0.16 ? 0.1 : apronT < 0.24 ? 0.8 : apronT < 0.32 ? 0.25 : 1) : lv[1] + (0.04 - lv[1]) * Math.min(1, dt * 3);
    lv[2] = tNow % 1.6 < 0.28 ? 1 : 0.04;
    lv[3] = alarmK * (0.6 + 0.4 * Math.sin(tNow * 9));
    lv[6] = 1;
    if (honkT > 0) honkT -= dt;
    lv[7] = honkT > 0 && (honkT > 0.45 || honkT < 0.3) ? 1 : 0;
    const bl = U.uBLvl.value;
    bl.x = lv[0]; bl.y = lv[1]; bl.z = alarmK;
    const mi = U.uBMisc.value;
    mi.x = Math.cos(tNow * 3.4); mi.y = Math.sin(tNow * 3.4); mi.z = outline; mi.w = tNow;
    U.uFocus.value.set(p ? p.x : fcx, p ? p.z : fcz, 0, 0);

    // searchlights
    for (let i = 0; i < 2; i++) {
      const L = lights[i], T = L.tower;
      L.phase += (dt * (alarm ? 1.25 : 1)) / L.period;
      if (L.phase > 1) L.phase -= 1;
      let k;
      if (L.target) {
        _sw.x = L.target.x; _sw.z = L.target.z;
        const dx = _sw.x - T.x, dz = _sw.z - T.z, d = Math.hypot(dx, dz);
        if (d > 36) { _sw.x = T.x + (dx / d) * 36; _sw.z = T.z + (dz / d) * 36; }
        k = 1 - Math.exp(-dt / 0.75);
      } else { SWEEP[i](L.phase, _sw); k = 1 - Math.exp(-dt / 0.12); }
      L.x += (_sw.x - L.x) * k; L.z += (_sw.z - L.z) * k;
      const want = L.on && !L.blinded ? 1 : 0;
      L.level += (want - L.level) * Math.min(1, dt * 8);
      lv[4 + i] = L.level;
      U.uBSL.value[i].set(L.x, L.z, L.r, L.level * 1.5);
      const m = slCones[i];
      m.visible = L.level > 0.02;
      if (m.visible) {
        m.lookAt(L.x, 0, L.z);
        m.scale.set(L.r, L.r, Math.hypot(L.x - L.lamp.x, L.lamp.y, L.z - L.lamp.z));
      }
      if (p && want && L.inBeam(p.x, p.z) && !hidden(p.x, p.z)) {
        L.caught += dt;
        if (L.caught >= 0.8 && !L.spotted) { L.spotted = true; if (typeof world.onSpotted === "function") world.onSpotted(i, L); }
      } else { L.caught = 0; L.spotted = false; }
    }
    const li = U.uLampI.value;
    for (let i = 0; i < 16; i++) { const kd = lampKind[i]; li[i] = kd < 0 ? 0 : kd >= 4 ? lv[kd] * 1.6 : lv[kd]; }

    // gates, door, lever
    for (const name in gates) {
      const g = gates[name];
      if (g.blown) continue;
      const to = g.opened ? 1 : 0;
      if (g.t !== to) g.t = to > g.t ? Math.min(to, g.t + dt / 2.4) : Math.max(to, g.t - dt / 2.4);
      const e = g.t * g.t * (3 - 2 * g.t);
      parts[g._part].x = g._dir * 6.2 * e + (g.t > 0 && g.t < 1 ? Math.sin(tNow * 70) * 0.006 : 0);
      const shut = g.t < 0.45;
      if (g._wall.on !== shut) setWall(g._wall, shut);
    }
    const dr = doors.armoury;
    if (dr.shake > 0) {
      dr.shake = Math.max(0, dr.shake - dt);
      if (!dr.opened) { parts[PT.DOOR].x = Math.sin(tNow * 80) * 0.035 * (dr.shake / 0.4) - 0.02 * dr.hits; parts[PT.DOOR].z = Math.sin(tNow * 57) * 0.012 * (dr.shake / 0.4); }
    }
    const la = lever.pulled ? -2.2 : -0.9;
    leverMesh.rotation.x += (la - leverMesh.rotation.x) * Math.min(1, dt * 12);

    // the blast light, the fuel fire, the fireball
    blastK *= Math.exp(-dt * 3.2);
    let fire = 0;
    if (fireT > 0) {
      fireT -= dt;
      fire = Math.min(1, fireT / 6) * (0.3 + 0.12 * Math.sin(tNow * 23) + 0.08 * Math.sin(tNow * 37.7));
      smokeT -= dt;
      if (smokeT <= 0 && has("smoke")) { smokeT = 1.3; fx.smoke(34 + Math.sin(tNow * 3) * 0.8, 0.5, 60 + Math.cos(tNow * 2.3) * 0.8, 1.2 + Math.min(1, fireT / 10), 5); }
      if (fire > blastK) { U.uBBlast.value.x = 34; U.uBBlast.value.y = 60; }
    }
    U.uBBlast.value.w = Math.max(blastK, fire);
    if (ballT >= 0) {
      ballT += dt;
      const f = ballT / 1.1;
      if (f >= 1) { ballT = -1; fireball.visible = false; } else {
        fireball.visible = true;
        const s = 1 + 6.5 * (1 - (1 - f) * (1 - f));
        fireball.position.set(34, 1.2 + 3.2 * f, 60);
        fireball.scale.set(s, s * 0.9, s);
        fireball.material.opacity = (1 - f) * (1 - f) * 0.95;
        fireball.material.color.setRGB(1, 0.62 - 0.4 * f, 0.25 - 0.22 * f);
      }
    }

    // sky follows the focus (it must stay inside the far plane); the dawn blend
    sky.position.set(fcx, -4, fcz);
    if (dawn !== dawnTo) { dawn = dawnTo > dawn ? Math.min(dawnTo, dawn + dt * dawnRate) : Math.max(dawnTo, dawn - dt * dawnRate); skyU.uDawn.value = dawn; }

    // the follow camera stays inside whichever room the player is in
    const b = p && p.x > ARM.x0 + 0.5 && p.x < ARM.x1 - 0.45 && p.z > ARM.z0 + 0.5 && p.z < ARM.z1 - 0.5 ? CAM_ARM
      : p && Math.abs(p.x) < 14.7 && p.z > HANGAR.z0 && p.z < MEZ.z0 ? CAM_HAN : CAM_ALL;
    camBounds.minX += (b[0] - camBounds.minX) * ease; camBounds.maxX += (b[1] - camBounds.maxX) * ease;
    camBounds.minZ += (b[2] - camBounds.minZ) * ease; camBounds.maxZ += (b[3] - camBounds.maxZ) * ease;
    camBounds.maxY += (b[4] - camBounds.maxY) * ease;

    pxT -= dt;
    if (pxT <= 0 && ctx.renderer && ctx.renderer.getDrawingBufferSize) { pxT = 0.5; LV.uPx.value = ctx.renderer.getDrawingBufferSize(_size).y / 2; }
  }

  function reset() {
    alarm = false; alarmK = 0; apronT = 9; honkT = 0; blastK = 0; outline = 0;
    lv[0] = 0.85; lv[1] = 0.04;
    for (const name in gates) { const g = gates[name]; g.close(); g.t = 0; parts[g._part].set(0, 0, 0, 1); setWall(g._wall, true); }
    parts[PT.GATE_WRECK].w = 0;
    doors.armoury.close();
    lever.reset(); leverMesh.rotation.x = -0.9;
    for (const k in racks) racks[k].reset();
    for (let i = 0; i < ammo.length; i++) ammo[i].reset();
    for (let i = 0; i < targets.length; i++) targets[i].reset();
    fuel.reset();
    for (let i = 0; i < 2; i++) { const L = lights[i]; L.on = true; L.blinded = false; L.targetable = true; L.target = null; L.caught = 0; L.spotted = false; L.level = 1; L.phase = i ? 0.3 : 0.55; SWEEP[i](L.phase, L); }
    camBounds.minX = CAM_ALL[0]; camBounds.maxX = CAM_ALL[1]; camBounds.minZ = CAM_ALL[2]; camBounds.maxZ = CAM_ALL[3]; camBounds.maxY = CAM_ALL[4];
    setTime("night", 0);
    update(0, 0);
  }

  // ================================================================================================ names
  const P = {};
  const name = (k, x, z, yaw) => { P[k] = pt(x, heightAt(x, z), z, yaw === undefined ? 0 : yaw); };
  name("start", 0, -8); name("overlook", 6, -4); name("exit", 20, -8, Math.PI);
  name("mainGate", 0, 8); name("fenceHole", HOLE.x, FS); name("holeOut", HOLE.x, 6.6); name("cp1", -14, 11);
  name("towerW", -32, 14); name("towerE", 32, 14); name("barracks", -32, 30); name("motorPool", 24, 28); name("truckUnload", 24, 34.5);
  name("innerGate", 0, 44); name("guardhouse", 10, 40); name("guardDoor", 7.2, 40, Math.PI / 2); name("lever", lever.x, lever.z); name("cp2", 0, 46.5);
  name("apron", 0, 54); name("ring0", RINGS[0].x, RINGS[0].z); name("ring1", RINGS[1].x, RINGS[1].z); name("ring2", RINGS[2].x, RINGS[2].z);
  name("hangar", 0, 74); name("hangarDoor", 0, 63); name("cp5", 0, 50, Math.PI);
  name("armoury", -30, 80); name("door", -25, 80); name("doorOut", -23.6, 80, -Math.PI / 2); name("wall", -23.4, 77.4); name("cp3", -22, 78); name("cp4", -30, 82, Math.PI);
  name("rackSuit", -33, 78); name("rackGlasses", -33, 82); name("rackBlaster", -30, 85); name("range", -30.8, 78.5, Math.PI);
  name("fuel", 34, 60); name("radio", 32, 88); name("eastGap", 40, 58); name("eastOut", 43.2, 58, Math.PI); name("eastRun", 43.2, 4, Math.PI);
  name("cp6", 0, 12, Math.PI);
  const R2 = (list) => list.map((q) => (q[2] ? { x: q[0], z: q[1], wait: q[2] } : { x: q[0], z: q[1] }));
  const routes = {
    gatePost: R2([[-26, 14.6, 2], [-9, 14.6], [-3, 13.2, 3], [-9, 14.6]]),
    yardA: R2([[-12, 16.5], [-12, 30, 1.5], [-22, 30], [-22, 18, 2]]),
    yardB: R2([[4, 20], [16, 20, 2], [16, 32], [4, 36, 2], [4, 28]]),
    towerSquadW: R2([[-30, 18], [-27.5, 12.5], [-35, 17.5], [-26, 16.5]]),
    towerSquadE: R2([[30, 18], [27.5, 12.5], [35, 17.5], [26, 16.5]]),
    apronLine: R2([[-10, 63.7], [-6, 63.7], [-2, 63.7], [2, 63.7], [6, 63.7], [10, 63.7]]),
    mezzanine: R2([[-5, 81.4], [5, 81.4]]),
    armouryPost: R2([[-22, 76, 3], [-22, 84.5, 3]]),
    reinforceMain: R2([[6, 34], [3, 22], [0, 14.5], [-9, 14]]),
    reinforceNorth: R2([[0, 61], [0, 50], [0, 45.5], [0, 38], [-2, 28]]),
    pursuit: R2([[0, 30], [0, 14], [0, 6], [8, -2], [18, -7]]),
    // extras
    fuelSquad: R2([[30.5, 57.6], [30.5, 62.4], [33, 54.5], [27, 60], [36, 54.6], [28.4, 64.6]]),
    guardhouse: R2([[10, 39.7]]),
    gateSentries: R2([[-2.2, 9.8], [2.2, 9.8]]),
    truckUnload: R2([[24, 34.5], [22, 35.6], [26, 35.6], [24, 36.9]]),
    eastEscape: R2([[38.5, 58], [43.2, 58], [43.2, 30], [43.2, 4], [30, -4], [20, -8]]),
  };
  const cams = {
    camOverlook: camPair(11, 7.2, -11.5, -3, 0.8, 42),
    camApron: camPair(0, 11.5, 61.5, 0, 0, 49),
    camArmoury: camPair(-16.5, 3.4, 73.5, -25, 1.3, 80),
    camRacks: camPair(-26.6, 2.1, 79.4, -34, 0.9, 81),
    camGate: camPair(5.5, 3.2, 21, 0, 1.4, 8),
    camInnerGate: camPair(-6, 3.4, 33, 1, 1.3, 44),
    camFuel: camPair(24, 5, 50, 34.5, 1, 60),
    camTower: camPair(-20, 2.2, 5, -31.5, 8.4, 14.5),
  };

  // ================================================================================================ the world object
  const stepOf = (x, z) => surfaceAt(x, z);
  const world = {
    name: "base",
    group,
    env: ENVS.night,
    ENV: ENVS,
    maxStep: 0.45,
    colliders,
    cover,
    coverPoints,
    camBounds,
    bounds: { minX: X0, maxX: X1, minZ: Z0, maxZ: Z1 },
    P,
    routes,
    heightAt,
    surfaceAt,
    sight,
    hidden,
    lit,
    confine,
    update,
    reset,
    lights,
    gates,
    doors,
    lever,
    racks,
    ammo,
    targets,
    fuel,
    trucks,
    rings,
    towers: TOWERS,
    lamps: LAMPS.map((L) => ({ x: L.px, z: L.pz, r: L.r, group: L.g })),
    puddles: PUDDLES.map((q) => ({ x: q[0], z: q[1], r: q[2] })),
    onSpotted: null,                 // (i, light): a searchlight has held the player for 0.8 s
    setAlarm,
    get alarm() { return alarm; },
    setTime,
    get time() { return timeName; },
    setHunt,
    outlineLights(on) { outline = on ? 1 : 0; },   // the visor: the searchlight discs get a cyan rim
    truckAt(x, z, range) { const r = range === undefined ? 1.5 : range; for (let i = 0; i < trucks.length; i++) { const t = trucks[i]; if (Math.abs(x - t.x) < 1.25 + r && Math.abs(z - t.z) < 3.4 + r) return t; } return null; },
    cams,
    stats: { triangles: Math.round(tris), cover: cover.length, walls: walls.length },
    onFootstep(wx, wz, strength, i, wet, pan) {
      const s = stepOf(wx, wz);
      sfx("step", s, strength, pan);
      if (s === "dirt" && i < 2 && strength > 0.45 && has("footDust")) fx.footDust(wx, heightAt(wx, wz) + 0.02, wz, strength * 0.5, 0x8a7a62);
    },
    onLand(x, z, floorY, impact) {
      const s = stepOf(x, z);
      sfx("step", s, Math.min(1.3, 0.75 + impact), 0);
      if ((s === "dirt" || s === "grass") && has("footDust")) fx.footDust(x, floorY + 0.02, z, 0.6 + impact, 0x8a7a62);
    },
    onEnv(o) { if (o && o.fog && o.fog.isColor) skyU.uFogC.value.copy(o.fog); },
  };
  for (const k in cams) world[k] = cams[k];
  reset();
  return world;
}
