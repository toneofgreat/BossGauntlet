// dream.js - the dream worlds of levels 6 and 11 (LEVELS2.md B9).
// ONE world, three scenes, all on the level-1 cushion quilt (the dream remembers the tutorial):
//   "school" - a round island of cushions afloat in a slowly turning nebula (level 6),
//   "void"   - the same quilt without colour under no sky, and one warm light that is always 20 m away (level 11),
//   "echo"   - dawn inside the dream: the quilt rises to a low hill under a huge pale sun, glass pillars in arcs.
// The quilt is createCushionField (read-only: its own instance, its material patched from outside) with a
// world-space height offset added in the vertex shader and mirrored exactly in heightAt(): the pool's bowl,
// the ingredient mounds, the moat, the island's drooping rim, the rise. Everything animated lives in shaders;
// update() only writes uniforms, a few transforms and (on the frame a pillar breaks) one instance matrix.
import { createCushionField } from "./cushions.js";

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
const ISLE_R = 15, WALK_R = 14;
const POOL = { x: -8, z: 3, r: 3.2, y: 0, depth: 0.25 };
const MOAT = { x: 10, z: -6, r: 2.55, half: 0.5, y: -0.1 };
const MOUNDS = [[10, -6], [-10, -6], [0, -12]]; // glowcap, moonpetal, dewdrop
const RISE = { x: 0, z: 12, h: 1.2, r0: 1.4, r1: 10.5 };
const ECHO_C = { x: 0, z: 6, r: 16 };
const PILLAR_N = 12;
const PILLAR_H = 3.0;
const TIER_POWER = [0, 0.6, 0.95]; // near / mid / far: the weakest scream that breaks them
const FAR_REACH = 11; // the far ring only answers a voice from the rise

const ENVS = {
  school: { background: 0x0b0e24, fog: [0x0b0e24, 46, 150], hemi: [0x93a0ff, 0x3b2a63, 0.9], sun: [0xdfe6ff, 0.95], sunDir: [-0.35, 0.8, 0.45], far: 80, dark: true },
  void: { background: 0x000000, fog: [0x000000, 6, 18], hemi: [0x9a9a9a, 0x2a2a2a, 0.62], sun: [0xffffff, 0.3], sunDir: [0.05, 0.95, 0.3], far: 60, dark: true },
  echo: { background: 0x4c3d63, fog: [0x6b5372, 15, 48], hemi: [0xb9b6ee, 0xd79a86, 0.86], sun: [0xffdcb8, 1.25], sunDir: [0, 0.3, 1], far: 90, dark: true },
};

// ------------------------------------------------------------------------------------------------ shaders
const QUILT_PARS = /* glsl */ `
uniform vec4 uDBump[6];
uniform float uDBumpH[6];
uniform vec4 uDRing;
uniform vec2 uDRingW;
uniform vec4 uDIsle;
float dreamOff( vec2 p ) {
	float o = 0.0;
	for ( int i = 0; i < 6; i ++ ) {
		o += uDBumpH[ i ] * ( 1.0 - smoothstep( uDBump[ i ].z, uDBump[ i ].w, distance( p, uDBump[ i ].xy ) ) );
	}
	o += uDRing.w * ( 1.0 - smoothstep( uDRingW.x, uDRingW.y, abs( distance( p, uDRing.xy ) - uDRing.z ) ) );
	float dr = smoothstep( uDIsle.y, uDIsle.z, length( p ) );
	o += uDIsle.w * dr * dr;
	return o;
}
`;
const QUILT_PROJECT = /* glsl */ `
vec4 dWP = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
	dWP = instanceMatrix * dWP;
#endif
dWP = modelMatrix * dWP;
#ifdef USE_INSTANCING
	transformed.y += dreamOff( dWP.xz ) / length( instanceMatrix[ 1 ].xyz );
#else
	transformed.y += dreamOff( dWP.xz );
#endif
#include <project_vertex>
#ifdef USE_INSTANCING
	// the island: whole cushions beyond the rim are simply not there
	if ( uDIsle.x > 0.0 && length( ( modelMatrix * vec4( instanceMatrix[ 3 ].xyz, 1.0 ) ).xz ) > uDIsle.x ) gl_Position = vec4( 0.0, 0.0, - 2.0, 1.0 );
#endif
`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
	vDir = normalize( position );
	vec4 mv = modelViewMatrix * vec4( position, 1.0 );
	gl_Position = projectionMatrix * mv;
}
`;
const NEBULA_FRAG = /* glsl */ `
uniform sampler2D uNeb;
uniform float uTime, uGlow, uFade;
uniform vec3 uDeep, uViolet, uTeal, uRose;
varying vec3 vDir;
vec2 eq( vec3 d ) { return vec2( atan( d.z, d.x ) * 0.15915494 + 0.5, acos( clamp( d.y, - 1.0, 1.0 ) ) * 0.31830989 ); }
float hash1( float n ) { return fract( sin( n * 91.3458 ) * 47453.5453 ); }
float shoot( vec3 d, float seed ) {
	float T = uTime * 0.085 + seed * 3.71;
	float c = floor( T ), f = fract( T ) / 0.11;
	if ( f > 1.0 ) return 0.0;
	float h1 = hash1( c + seed ), h2 = hash1( c * 1.7 + seed + 3.1 ), h3 = hash1( c * 2.3 + seed + 7.7 );
	vec3 p0 = normalize( vec3( h1 * 2.0 - 1.0, 0.25 + 0.7 * h2, h3 * 2.0 - 1.0 ) );
	vec3 t = normalize( cross( p0, vec3( h2 - 0.5, 1.0, h1 - 0.5 ) ) );
	vec3 head = normalize( p0 + t * ( f * 0.55 ) );
	vec3 v = d - head;
	float along = - dot( v, t );
	float perp = length( v + t * along );
	float tail = ( 1.0 - smoothstep( 0.0, 0.2, along ) ) * step( 0.0, along );
	return ( 1.0 - smoothstep( 0.0, 0.0045, perp ) ) * tail * sin( f * 3.14159 );
}
void main() {
	vec3 d = normalize( vDir );
	float a1 = uTime * 0.0045, a2 = - uTime * 0.0065 + 2.0;
	vec3 dA = vec3( d.x * cos( a1 ) - d.z * sin( a1 ), d.y, d.x * sin( a1 ) + d.z * cos( a1 ) );
	vec3 q = vec3( d.y, d.z, d.x );
	vec3 dB = vec3( q.x * cos( a2 ) - q.z * sin( a2 ), q.y, q.x * sin( a2 ) + q.z * cos( a2 ) );
	vec4 a = texture2D( uNeb, eq( dA ) );
	vec4 b = texture2D( uNeb, eq( dB ) );
	float n1 = a.r * ( 0.55 + 0.9 * b.b );
	float n2 = b.g * ( 0.55 + 0.9 * a.a );
	vec3 col = uDeep * ( 0.75 + 0.35 * d.y );
	col += uViolet * ( n1 * n1 * 1.55 ) + uTeal * ( n2 * n2 * 1.25 ) + uRose * ( n1 * n2 * 2.3 );
	col *= 1.0 - 0.42 * a.b * b.a;
	// a soft breathing in the brightest knots
	col += uRose * ( pow( n1 * n2, 2.0 ) * ( 0.35 + 0.25 * sin( uTime * 0.31 + d.x * 4.0 ) ) );
	col *= uGlow;
	col += vec3( 0.95, 0.97, 1.0 ) * ( shoot( d, 1.0 ) + shoot( d, 5.3 ) + shoot( d, 9.1 ) ) * ( 0.25 + 0.75 * uGlow );
	gl_FragColor = vec4( col * uFade, 1.0 );
	#include <colorspace_fragment>
}
`;
const DAWN_FRAG = /* glsl */ `
uniform float uTime, uSun, uSunY, uFlare, uFade;
uniform vec3 uHorizon, uZenith, uSunCol, uGlowCol;
varying vec3 vDir;
void main() {
	vec3 d = normalize( vDir );
	float h = d.y;
	vec3 col = mix( uHorizon, uZenith, pow( clamp( h, 0.0, 1.0 ), 0.5 ) );
	col = mix( col, uHorizon * 0.82, ( 1.0 - smoothstep( - 0.3, 0.0, h ) ) );
	vec3 sd = normalize( vec3( 0.0, uSunY, 1.0 ) );
	float ang = acos( clamp( dot( d, sd ), - 1.0, 1.0 ) );
	float disc = ( 1.0 - smoothstep( 0.19, 0.205, ang ) );
	float halo = exp( - ang * 2.6 );
	float corona = exp( - ang * 9.0 );
	// long thin dawn clouds lying across the sun
	float band = sin( h * 46.0 + sin( d.x * 3.0 + uTime * 0.02 ) * 1.6 ) * 0.5 + 0.5;
	band = smoothstep( 0.72, 1.0, band ) * ( 1.0 - smoothstep( 0.02, 0.34, abs( h - 0.12 ) ) ) * ( 0.55 + 0.45 * sin( d.x * 7.0 + 1.3 ) );
	float sun = uSun * ( 1.0 + uFlare );
	col += uGlowCol * ( halo * 0.6 * sun ) + uSunCol * ( corona * 0.3 * sun );
	col = mix( col, uSunCol, clamp( disc * ( 0.9 * uSun + uFlare ), 0.0, 1.0 ) );
	col = mix( col, col * 0.78 + uGlowCol * 0.22 * sun, band * 0.7 );
	col += vec3( 1.0, 0.96, 0.9 ) * uFlare * exp( - ang * 1.3 ) * 0.7;
	gl_FragColor = vec4( col * uFade, 1.0 );
	#include <colorspace_fragment>
}
`;

const STAR_VERT = /* glsl */ `
attribute vec3 aS; // phase, size (px), twinkle speed
attribute vec3 aCol;
uniform float uTime, uDpr;
varying vec3 vCol;
void main() {
	vec4 mv = modelViewMatrix * vec4( position, 1.0 );
	gl_Position = projectionMatrix * mv;
	float tw = 0.62 + 0.38 * sin( uTime * aS.z + aS.x );
	tw *= 0.85 + 0.15 * sin( uTime * aS.z * 2.7 + aS.x * 3.1 );
	gl_PointSize = aS.y * uDpr * ( 0.8 + 0.2 * tw );
	vCol = aCol * tw;
}
`;
const STAR_FRAG = /* glsl */ `
uniform float uAlpha;
varying vec3 vCol;
void main() {
	vec2 c = gl_PointCoord - 0.5;
	float r = length( c ) * 2.0;
	float k = ( 1.0 - smoothstep( 0.0, 1.0, r ) );
	gl_FragColor = vec4( vCol * ( k * k ) * uAlpha, 1.0 );
	#include <colorspace_fragment>
}
`;

const LAMP_PARS = /* glsl */ `
attribute vec4 aL; // phase, hang (0 at the knots .. 1 at the belly of the string), size (m), kind
uniform float uTime;
vec3 lampSway( vec3 p ) {
	float s = aL.y;
	p.x += sin( uTime * 0.7 + aL.x ) * 0.16 * s;
	p.z += cos( uTime * 0.53 + aL.x * 1.3 ) * 0.16 * s;
	p.y += sin( uTime * 0.9 + aL.x * 2.1 ) * 0.05 * s;
	return p;
}
`;
const LAMP_VERT = /* glsl */ `
${LAMP_PARS}
attribute vec3 aCol;
uniform float uPx;
varying vec3 vCol;
void main() {
	vec4 mv = modelViewMatrix * vec4( lampSway( position ), 1.0 );
	gl_Position = projectionMatrix * mv;
	gl_PointSize = clamp( aL.z * uPx / max( 0.1, - mv.z ), 1.5, 96.0 );
	vCol = aCol * ( 0.78 + 0.22 * sin( uTime * 2.1 + aL.x * 5.0 ) );
}
`;
const LAMP_FRAG = /* glsl */ `
uniform float uAlpha;
varying vec3 vCol;
void main() {
	vec2 c = gl_PointCoord - 0.5;
	float r = length( c ) * 2.0;
	float core = ( 1.0 - smoothstep( 0.0, 0.34, r ) );
	float halo = pow( max( 0.0, 1.0 - r ), 2.4 );
	gl_FragColor = vec4( ( vCol * ( halo * 0.6 ) + vec3( 1.0 ) * core * 0.55 + vCol * core * 0.6 ) * uAlpha, 1.0 );
	#include <colorspace_fragment>
}
`;
const STRING_VERT = /* glsl */ `
${LAMP_PARS}
void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( lampSway( position ), 1.0 );
}
`;
const STRING_FRAG = /* glsl */ `
uniform float uAlpha;
uniform vec3 uCol;
void main() {
	gl_FragColor = vec4( uCol * uAlpha, 1.0 );
	#include <colorspace_fragment>
}
`;

const WATER_VERT = /* glsl */ `
attribute float aEdge;
varying vec2 vW;
varying float vEdge;
varying vec3 vView;
void main() {
	vec4 wp = modelMatrix * vec4( position, 1.0 );
	vW = wp.xz;
	vEdge = aEdge;
	vView = cameraPosition - wp.xyz;
	gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const WATER_FRAG = /* glsl */ `
uniform float uTime, uAlpha, uGlow;
uniform vec4 uRip[4];
uniform vec3 uColA, uColB, uColC;
varying vec2 vW;
varying float vEdge;
varying vec3 vView;
void main() {
	vec2 p = vW;
	float t = uTime;
	float n = sin( p.x * 3.1 + t * 0.9 ) * sin( p.y * 2.7 - t * 0.7 ) + 0.5 * sin( ( p.x + p.y ) * 5.3 + t * 1.6 ) + 0.35 * sin( ( p.x - p.y ) * 8.1 - t * 2.1 );
	float caust = pow( 0.5 + 0.5 * sin( n * 2.4 + t * 0.5 ), 3.0 );
	float rip = 0.0;
	for ( int i = 0; i < 4; i ++ ) {
		float age = t - uRip[ i ].z;
		float dd = distance( p, uRip[ i ].xy );
		float front = age * 1.9;
		rip += uRip[ i ].w * sin( ( dd - front ) * 11.0 ) * exp( - age * 1.7 ) * ( 1.0 - smoothstep( front - 0.1, front + 0.35, dd ) ) * step( 0.0, age );
	}
	float fres = pow( 1.0 - clamp( normalize( vView ).y, 0.0, 1.0 ), 3.0 );
	vec3 col = mix( uColA, uColB, caust ) + uColC * ( fres * 0.55 + max( 0.0, rip ) * 0.8 );
	col *= 0.45 + 0.55 * uGlow;
	float alpha = smoothstep( 0.0, 1.0, vEdge ) * ( 0.74 + 0.2 * caust + 0.2 * abs( rip ) ) * uAlpha;
	gl_FragColor = vec4( col, clamp( alpha, 0.0, 1.0 ) );
	#include <colorspace_fragment>
}
`;

const GLASS_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main() {
	vec4 lp = vec4( position, 1.0 );
	vec3 n = normal;
	#ifdef USE_INSTANCING
		lp = instanceMatrix * lp;
		n = mat3( instanceMatrix ) * n;
	#endif
	vec4 wp = modelMatrix * lp;
	vN = normalize( mat3( modelMatrix ) * n );
	vV = cameraPosition - wp.xyz;
	vY = position.y;
	gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const GLASS_FRAG = /* glsl */ `
uniform float uTime, uAlpha, uSun;
uniform vec3 uTint, uSunCol;
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main() {
	vec3 n = normalize( vN );
	vec3 v = normalize( vV );
	float f = pow( 1.0 - abs( dot( n, v ) ), 2.2 );
	vec3 sd = normalize( vec3( 0.0, 0.3, 1.0 ) );
	float glint = pow( max( 0.0, dot( reflect( - v, n ), sd ) ), 24.0 );
	float through = pow( max( 0.0, dot( - v, sd ) ), 6.0 ); // the sun seen through the glass
	float inner = 0.5 + 0.5 * sin( vY * 5.0 - uTime * 0.8 + n.x * 3.0 );
	vec3 col = uTint * ( 0.22 + 0.2 * inner + 0.35 * vY / 3.0 ) + vec3( 0.92, 0.96, 1.0 ) * f * 0.85;
	col += uSunCol * ( glint * 1.1 + through * 0.55 ) * uSun;
	float alpha = clamp( 0.3 + f * 0.6 + glint + through * 0.3, 0.0, 0.96 ) * uAlpha;
	gl_FragColor = vec4( col, alpha );
	#include <colorspace_fragment>
}
`;

// ------------------------------------------------------------------------------------------------ geometry
// a pillow: superellipse plan, domed top, shallow bowl underneath (for the small drifting islands)
function buildPillow(THREE, segs, top, bot) {
  const pos = [], col = [], idx = [];
  const rows = top + bot + 1;
  const nExp = 4.5;
  for (let j = 0; j < rows; j++) {
    // j = 0 crown ... top = seam ... rows-1 = underside centre
    let rr, y, shade;
    if (j <= top) {
      const k = j / top;
      rr = Math.pow(Math.sin(k * Math.PI * 0.5), 0.62);
      y = -0.36 + 0.38 * Math.pow(Math.max(0, 1 - Math.pow(rr, 2.4)), 0.7);
      shade = 0.82 + 0.18 * (1 - k);
    } else {
      const k = (j - top) / bot;
      rr = Math.pow(Math.cos(k * Math.PI * 0.5), 0.7);
      y = -0.36 - 0.3 * Math.pow(Math.max(0, 1 - Math.pow(rr, 2.2)), 0.62);
      shade = 0.62 - 0.3 * k;
    }
    for (let i = 0; i <= segs; i++) {
      const th = (i / segs) * TAU;
      const c = Math.cos(th), s = Math.sin(th);
      const b = Math.pow(Math.pow(Math.abs(c), nExp) + Math.pow(Math.abs(s), nExp), -1 / nExp) * 1.47;
      // a tuft pull in the middle of the crown, and four soft corner pinches
      const pinch = 1 - 0.1 * Math.pow(Math.abs(Math.sin(2 * th)), 2) * rr;
      pos.push(c * b * rr, (y + (j <= top ? -0.05 * Math.exp(-rr * rr * 30) : 0)) * pinch + 0.36, s * b * rr);
      col.push(shade, shade * 0.985, shade * 1.0);
    }
  }
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i, b = a + 1, c = a + segs + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 3D value noise on the unit sphere -> an equirect RGBA data texture (no seam, no DOM)
function buildNebulaTexture(THREE) {
  const W = 512, H = 256;
  const rnd = mulberry(90210);
  const lat = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) lat[i] = rnd();
  const at = (x, y, z) => lat[((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) & 4095];
  function noise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let fx = x - xi, fy = y - yi, fz = z - zi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    const a = at(xi, yi, zi), b = at(xi + 1, yi, zi), c = at(xi, yi + 1, zi), d = at(xi + 1, yi + 1, zi);
    const e = at(xi, yi, zi + 1), f = at(xi + 1, yi, zi + 1), g = at(xi, yi + 1, zi + 1), h = at(xi + 1, yi + 1, zi + 1);
    const ab = a + (b - a) * fx, cd = c + (d - c) * fx, ef = e + (f - e) * fx, gh = g + (h - g) * fx;
    const lo = ab + (cd - ab) * fy, hi = ef + (gh - ef) * fy;
    return lo + (hi - lo) * fz;
  }
  function fbm(x, y, z, oct) {
    let s = 0, a = 0.5, n = 0;
    for (let o = 0; o < oct; o++) { s += a * noise(x, y, z); n += a; x = x * 2.03 + 11.3; y = y * 2.03 + 5.7; z = z * 2.03 + 3.1; a *= 0.5; }
    return s / n;
  }
  const data = new Uint8Array(W * H * 4);
  // two great-circle bands (like two milky ways crossing) carry most of the cloud
  const n1 = [0.31, 0.9, 0.3], n2 = [-0.55, 0.42, 0.72];
  for (let j = 0; j < H; j++) {
    const phi = ((j + 0.5) / H) * Math.PI;
    const sy = Math.cos(phi), sr = Math.sin(phi);
    for (let i = 0; i < W; i++) {
      const th = ((i + 0.5) / W - 0.5) * TAU;
      const x = Math.cos(th) * sr, z = Math.sin(th) * sr, y = sy;
      const wx = fbm(x * 1.4 + 7, y * 1.4, z * 1.4, 3) - 0.5, wz = fbm(x * 1.4, y * 1.4 + 9, z * 1.4, 3) - 0.5;
      const b1 = Math.exp(-Math.pow(x * n1[0] + y * n1[1] + z * n1[2], 2) * 5.5);
      const b2 = Math.exp(-Math.pow(x * n2[0] + y * n2[1] + z * n2[2], 2) * 6.5);
      const A = fbm(x * 2.3 + wx * 2.2, y * 2.3 + 3.3, z * 2.3 + wz * 2.2, 4);
      const B = fbm(x * 2.0 + 17 + wz * 2.4, y * 2.0 + wx * 2.4, z * 2.0 + 5, 4);
      const o = (j * W + i) * 4;
      data[o] = 255 * sm(0.4, 0.86, A * 0.72 + b1 * 0.36);
      data[o + 1] = 255 * sm(0.42, 0.88, B * 0.72 + b2 * 0.36);
      data[o + 2] = 255 * sm(0.3, 0.75, fbm(x * 5.2 + 2, y * 5.2, z * 5.2 + 8, 3));
      data[o + 3] = 255 * sm(0.3, 0.75, fbm(x * 9 + 4, y * 9 + 1, z * 9, 2));
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildGlowTexture(THREE) {
  const S = 64;
  const data = new Uint8Array(S * S * 4);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const r = Math.hypot(i - 31.5, j - 31.5) / 31.5;
      const k = Math.pow(Math.max(0, 1 - r), 2.2) * 0.75 + Math.max(0, 1 - r * 3.2) * 0.25;
      const o = (j * S + i) * 4;
      data[o] = data[o + 1] = data[o + 2] = 255;
      data[o + 3] = 255 * clamp(k, 0, 1);
    }
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------------------------------------------ factory
export function createDream(ctx) {
  const THREE = ctx.THREE;
  const P = ctx.player;
  const group = new THREE.Group();
  group.name = "dream";

  let scene = "";
  let T = 0; // the dream's own clock (shader time)
  const tU = { value: 0 };

  // ---------------------------------------------------------------- the quilt
  const field = createCushionField(THREE, { renderer: ctx.renderer || null, gridSize: 15 }); // 15: the island (r 15) is still covered; 64 fewer far cushions keep the scene under 250k triangles
  group.add(field.group);
  const gapFloor = field.group.getObjectByName("cushionGapFloor") || null;
  const quiltBase = new THREE.Color(0xffffff);
  const quiltMat = field.material;

  const bumpV = [], bumpH = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 6; i++) bumpV.push(new THREE.Vector4(0, 0, 0, 1));
  const ringV = new THREE.Vector4(0, 0, 0, 0), ringW = new THREE.Vector2(0.25, 0.7);
  const isleV = new THREE.Vector4(0, 13, 16, 0); // clip radius (0 = endless), droop from, droop to, droop height
  {
    const orig = quiltMat.onBeforeCompile;
    quiltMat.onBeforeCompile = (shader, renderer) => {
      if (orig) orig(shader, renderer);
      shader.uniforms.uDBump = { value: bumpV };
      shader.uniforms.uDBumpH = { value: bumpH };
      shader.uniforms.uDRing = { value: ringV };
      shader.uniforms.uDRingW = { value: ringW };
      shader.uniforms.uDIsle = { value: isleV };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\n" + QUILT_PARS)
        .replace("#include <project_vertex>", QUILT_PROJECT);
    };
    quiltMat.customProgramCacheKey = () => "platy-cushion-dream-v1";
    quiltMat.needsUpdate = true;
  }
  function setBump(i, x, z, r0, r1, h) { bumpV[i].set(x, z, r0, r1); bumpH[i] = h; }
  function clearBumps() {
    for (let i = 0; i < 6; i++) setBump(i, 0, 0, 0, 1, 0);
    ringV.set(0, 0, 0, 0);
    isleV.set(0, 13, 16, 0);
  }
  // the exact mirror of dreamOff() in the vertex shader
  function offsetAt(x, z) {
    let o = 0;
    for (let i = 0; i < 6; i++) {
      const h = bumpH[i];
      if (h === 0) continue;
      const b = bumpV[i];
      o += h * (1 - sm(b.z, b.w, Math.hypot(x - b.x, z - b.y)));
    }
    if (ringV.w !== 0) o += ringV.w * (1 - sm(ringW.x, ringW.y, Math.abs(Math.hypot(x - ringV.x, z - ringV.y) - ringV.z)));
    if (isleV.w !== 0) { const d = sm(isleV.y, isleV.z, Math.hypot(x, z)); o += isleV.w * d * d; }
    return o;
  }
  const heightAt = (x, z) => field.heightAt(x, z) + offsetAt(x, z);
  function waterAt(x, z) {
    if (scene !== "school") return -Infinity;
    const dx = x - POOL.x, dz = z - POOL.z;
    if (dx * dx + dz * dz <= POOL.r * POOL.r) return POOL.y;
    const d = Math.hypot(x - MOAT.x, z - MOAT.z) - MOAT.r;
    if (d < MOAT.half && d > -MOAT.half) return MOAT.y;
    return -Infinity;
  }
  const inPool = (x, z) => { const dx = x - POOL.x, dz = z - POOL.z; return scene === "school" && dx * dx + dz * dz <= POOL.r * POOL.r; };
  const inMoat = (x, z) => scene === "school" && Math.abs(Math.hypot(x - MOAT.x, z - MOAT.z) - MOAT.r) < MOAT.half;

  // ---------------------------------------------------------------- fades and glow (tweened in update)
  const CH = ["sky", "stars", "islands", "lanterns", "pool", "quilt", "light", "sun", "pillars"];
  const chV = new Float32Array(CH.length).fill(1), chT = new Float32Array(CH.length).fill(1), chR = new Float32Array(CH.length);
  let glow = 1, glowT = 1, glowR = 0;
  const chan = (name) => chV[CH.indexOf(name)];
  function fade(what, v, seconds) {
    v = clamp(+v || 0, 0, 1);
    for (let i = 0; i < CH.length; i++) {
      if (what !== "all" && what !== CH[i]) continue;
      chT[i] = v;
      if (seconds > 0) chR[i] = Math.abs(v - chV[i]) / seconds;
      else { chV[i] = v; chR[i] = 0; }
    }
  }
  const envNow = { background: 0, fog: [0, 1, 2], hemi: [0, 0, 1], sun: [0, 1], sunDir: [0, 1, 0], far: 80, dark: true };
  function writeEnv(g) {
    const e = ENVS[scene] || ENVS.school;
    envNow.background = e.background;
    envNow.fog[0] = e.fog[0]; envNow.fog[1] = e.fog[1]; envNow.fog[2] = e.fog[2];
    envNow.hemi[0] = e.hemi[0]; envNow.hemi[1] = e.hemi[1]; envNow.hemi[2] = e.hemi[2] * (0.38 + 0.62 * g);
    envNow.sun[0] = e.sun[0]; envNow.sun[1] = e.sun[1] * (0.15 + 0.85 * g);
    envNow.sunDir[0] = e.sunDir[0]; envNow.sunDir[1] = e.sunDir[1]; envNow.sunDir[2] = e.sunDir[2];
    envNow.far = e.far; envNow.dark = true;
  }
  function setGlow(v, seconds) {
    v = clamp(+v || 0, 0, 1);
    glowT = v;
    if (seconds > 0) glowR = Math.abs(v - glow) / seconds;
    else { glow = v; glowR = 0; }
    writeEnv(v);
    if (ctx.world === world && typeof ctx.setEnv === "function") ctx.setEnv(envNow, seconds > 0 ? seconds : 0);
  }

  // ---------------------------------------------------------------- SCHOOL: sky, stars, islands, lanterns, pool
  const school = new THREE.Group();
  school.name = "dreamSchool";
  group.add(school);
  const skyTurn = new THREE.Group(); // the whole heaven turns very slowly
  school.add(skyTurn);

  const lin = (hex) => new THREE.Color(hex);
  const nebU = {
    uNeb: { value: buildNebulaTexture(THREE) }, uTime: tU, uGlow: { value: 1 }, uFade: { value: 1 },
    uDeep: { value: lin(0x0d1030) }, uViolet: { value: lin(0x8a4dff) }, uTeal: { value: lin(0x2fd6c4) }, uRose: { value: lin(0xff6fae) },
  };
  const domeGeo = new THREE.SphereGeometry(72, 40, 24);
  const nebula = new THREE.Mesh(domeGeo, new THREE.ShaderMaterial({ uniforms: nebU, vertexShader: SKY_VERT, fragmentShader: NEBULA_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }));
  nebula.name = "dreamNebula";
  nebula.frustumCulled = false;
  nebula.renderOrder = -10;
  skyTurn.add(nebula);

  const starU = { uTime: tU, uDpr: { value: 1 }, uAlpha: { value: 1 } };
  {
    const rnd = mulberry(4242);
    const N = 760;
    const pos = new Float32Array(N * 3), aS = new Float32Array(N * 3), aCol = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = rnd() * 2 - 1, th = rnd() * TAU, s = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(th) * s * 70; pos[i * 3 + 1] = u * 70; pos[i * 3 + 2] = Math.sin(th) * s * 70;
      const big = rnd();
      aS[i * 3] = rnd() * TAU; aS[i * 3 + 1] = big > 0.96 ? 5.2 : big > 0.8 ? 3.3 : 1.9 + rnd() * 0.8; aS[i * 3 + 2] = 0.6 + rnd() * 2.6;
      const tone = rnd(), b = 0.45 + rnd() * 0.55;
      aCol[i * 3] = b * (tone < 0.25 ? 1.0 : tone < 0.5 ? 0.78 : 0.95);
      aCol[i * 3 + 1] = b * (tone < 0.25 ? 0.86 : tone < 0.5 ? 0.86 : 0.95);
      aCol[i * 3 + 2] = b * (tone < 0.25 ? 0.74 : 1.0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aS", new THREE.BufferAttribute(aS, 3));
    g.setAttribute("aCol", new THREE.BufferAttribute(aCol, 3));
    const stars = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: starU, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    stars.name = "dreamStars";
    stars.frustumCulled = false;
    stars.renderOrder = -9;
    skyTurn.add(stars);
  }

  // the island's body: the floor under the quilt and a long soft teardrop hanging below it
  {
    const droop = (r) => { const d = sm(13, 16, r); return -0.5 * d * d; };
    const prof = [];
    for (let i = 0; i <= 8; i++) { const r = (i / 8) * 16.6; prof.push([r, -0.705 + droop(r), 0]); }
    const under = [[16.9, -1.5, 1], [16.2, -2.6, 1], [14.2, -4.2, 1], [11, -6.2, 1], [7.4, -8.6, 1], [4.2, -11.2, 1], [1.9, -13.6, 1], [0.6, -15.4, 1], [0, -16.2, 1]];
    for (const u of under) prof.push(u);
    const SEG = 56;
    const pos = [], col = [], idx = [];
    const rnd = mulberry(77);
    for (let j = 0; j < prof.length; j++) {
      for (let i = 0; i <= SEG; i++) {
        const th = (i / SEG) * TAU;
        const lump = prof[j][2] ? 1 + 0.07 * Math.sin(th * 5 + j * 1.3) + 0.04 * Math.sin(th * 11 - j) : 1;
        pos.push(Math.cos(th) * prof[j][0] * lump, prof[j][1], Math.sin(th) * prof[j][0] * lump);
        if (!prof[j][2]) col.push(0.085, 0.08, 0.14);
        else { const k = clamp((prof[j][1] + 16) / 15, 0, 1), n = 0.9 + 0.2 * rnd(); col.push((0.1 + 0.2 * k) * n, (0.08 + 0.15 * k) * n, (0.2 + 0.26 * k) * n); }
      }
    }
    for (let j = 0; j < prof.length - 1; j++) {
      for (let i = 0; i < SEG; i++) {
        const a = j * (SEG + 1) + i, b = a + 1, c = a + SEG + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, emissive: 0x1a1238, emissiveIntensity: 0.6, side: THREE.DoubleSide }));
    m.name = "dreamIsleBody";
    m.receiveShadow = false;
    school.add(m);
  }

  // smaller cushion islands drifting around and below (one InstancedMesh; they bob in the vertex shader)
  const driftU = { uDTime: tU, uDShow: { value: 1 } };
  const drift = new THREE.Group();
  school.add(drift);
  {
    const geo = buildPillow(THREE, 12, 4, 2); // far away: a lighter pillow
    const rnd = mulberry(1311);
    const list = [];
    const ISLANDS = 15;
    for (let k = 0; k < ISLANDS; k++) {
      const ang = (k / ISLANDS) * TAU + rnd() * 0.3;
      const rad = 23 + rnd() * 30;
      const cy = k % 3 === 0 ? 3 + rnd() * 9 : -4 - rnd() * 15;
      const sc = 0.45 + rnd() * 0.6;
      const yaw = rnd() * TAU;
      const n = 2 + Math.floor(rnd() * 5);
      const phase = rnd() * TAU, amp = 0.25 + rnd() * 0.5;
      // grow the cluster cell by cell on a little grid so the cushions sit side by side
      const cells = [[0, 0]];
      let guard = 0;
      while (cells.length < n && guard++ < 40) {
        const b = cells[Math.floor(rnd() * cells.length)];
        const d = Math.floor(rnd() * 4);
        const c = [b[0] + (d === 0 ? 1 : d === 1 ? -1 : 0), b[1] + (d === 2 ? 1 : d === 3 ? -1 : 0)];
        if (!cells.some((q) => q[0] === c[0] && q[1] === c[1])) cells.push(c);
      }
      for (const c of cells) {
        const lx = c[0] * 3.05 * sc, lz = c[1] * 3.05 * sc;
        list.push({
          x: Math.cos(ang) * rad + lx * Math.cos(yaw) + lz * Math.sin(yaw), y: cy + (rnd() - 0.5) * 0.12,
          z: Math.sin(ang) * rad - lx * Math.sin(yaw) + lz * Math.cos(yaw), yaw: yaw + Math.floor(rnd() * 4) * Math.PI * 0.5, sc, phase, amp: amp / sc, tint: rnd(),
        });
      }
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0xe6e2ff, vertexColors: true, roughness: 1, metalness: 0, emissive: 0x2a2060, emissiveIntensity: 0.35 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uDTime = driftU.uDTime;
      shader.uniforms.uDShow = driftU.uDShow;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 aBob;\nuniform float uDTime;\nuniform float uDShow;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed *= uDShow;\ntransformed.y += aBob.y * sin( uDTime * 0.42 + aBob.x );");
    };
    mat.customProgramCacheKey = () => "platy-dream-drift-v1";
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    im.name = "dreamDrift";
    im.frustumCulled = false;
    im.castShadow = false;
    im.receiveShadow = false;
    const bob = new Float32Array(list.length * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      q.setFromAxisAngle(up, o.yaw);
      m4.compose(v.set(o.x, o.y, o.z), q, s.set(o.sc, o.sc, o.sc));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, c.setRGB(1 - 0.06 * o.tint, 0.97 - 0.03 * o.tint, 0.94 + 0.06 * o.tint));
      bob[i * 2] = o.phase; bob[i * 2 + 1] = o.amp;
    }
    geo.setAttribute("aBob", new THREE.InstancedBufferAttribute(bob, 2));
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    drift.add(im);
  }

  // strings of soft lantern-stars: garlands hung in the air over the island, a ring of low lights round the
  // sparring circle, a few round the pool. Points + one LineSegments for the strings, same sway in both.
  const lampU = { uTime: tU, uPx: { value: 600 }, uAlpha: { value: 1 } };
  const stringU = { uTime: tU, uAlpha: { value: 0.5 }, uCol: { value: lin(0x7d74c8) } };
  {
    const rnd = mulberry(606);
    const pos = [], aL = [], aCol = [], lpos = [], lL = [];
    const PAL = [[1.0, 0.82, 0.5], [1.0, 0.62, 0.78], [0.62, 0.84, 1.0], [0.72, 1.0, 0.86], [0.86, 0.72, 1.0]];
    const lamp = (x, y, z, hang, size, ci, ph) => { const c = PAL[ci % PAL.length]; pos.push(x, y, z); aL.push(ph, hang, size, 0); aCol.push(c[0], c[1], c[2]); };
    // garlands between knots that float over the rim (each knot is itself a brighter lantern)
    const KN = 7, knots = [];
    for (let k = 0; k < KN; k++) { const a = (k / KN) * TAU + 0.4; knots.push([Math.cos(a) * 13.2, 5.6 + (k % 2) * 1.1, Math.sin(a) * 13.2]); }
    const spans = [];
    for (let k = 0; k < KN; k++) spans.push([knots[k], knots[(k + 1) % KN], 1.5]);
    spans.push([knots[0], knots[3], 2.4], [knots[2], knots[5], 2.6], [knots[4], knots[6], 2.2]);
    for (const sp of spans) {
      const A = sp[0], B = sp[1], sag = sp[2];
      const n = 15;
      const ph = rnd() * TAU;
      let px = 0, py = 0, pz = 0, ph0 = 0;
      for (let i = 0; i <= n; i++) {
        const t = i / n, hang = 4 * t * (1 - t);
        const x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t - sag * hang, z = A[2] + (B[2] - A[2]) * t;
        if (i > 0 && i < n) lamp(x, y - 0.12, z, hang, 0.2 + rnd() * 0.08, Math.floor(rnd() * 5), ph + t * 2.2);
        if (i > 0) { lpos.push(px, py, pz, x, y, z); lL.push(ph + (t - 1 / n) * 2.2, ph0, 0, 0, ph + t * 2.2, hang, 0, 0); }
        px = x; py = y; pz = z; ph0 = hang;
      }
    }
    for (const k of knots) lamp(k[0], k[1], k[2], 0, 0.42, 0, rnd() * TAU);
    // the sparring circle: 20 low lights at r 5
    for (let i = 0; i < 20; i++) { const a = (i / 20) * TAU; lamp(Math.cos(a) * 5, 0.42, Math.sin(a) * 5, 0.25, 0.13, i % 2 ? 2 : 4, rnd() * TAU); }
    // round the pool: nine teal ones just outside the water
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + 0.2; lamp(POOL.x + Math.cos(a) * 3.75, 0.38, POOL.z + Math.sin(a) * 3.75, 0.25, 0.12, 3, rnd() * TAU); }
    // the potion field: five pale green ones in a loose arc
    for (let i = 0; i < 7; i++) { const a = 0.35 + (i / 6) * 2.45; lamp(Math.cos(a) * 4.6, 0.4, 10 + Math.sin(a) * 3.9, 0.25, 0.11, 3, rnd() * TAU); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aL", new THREE.Float32BufferAttribute(aL, 4));
    g.setAttribute("aCol", new THREE.Float32BufferAttribute(aCol, 3));
    const lamps = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: lampU, vertexShader: LAMP_VERT, fragmentShader: LAMP_FRAG, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    lamps.name = "dreamLanterns";
    lamps.frustumCulled = false;
    school.add(lamps);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(lpos, 3));
    lg.setAttribute("aL", new THREE.Float32BufferAttribute(lL, 4));
    const strings = new THREE.LineSegments(lg, new THREE.ShaderMaterial({ uniforms: stringU, vertexShader: STRING_VERT, fragmentShader: STRING_FRAG, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    strings.name = "dreamStrings";
    strings.frustumCulled = false;
    school.add(strings);
  }

  // the dream pool and the glowcap's moat: one mesh, one glowing shader
  const ripV = [];
  for (let i = 0; i < 4; i++) ripV.push(new THREE.Vector4(0, 0, -100, 0));
  let ripN = 0;
  const waterU = { uTime: tU, uAlpha: { value: 1 }, uGlow: { value: 1 }, uRip: { value: ripV }, uColA: { value: lin(0x1b5f8f) }, uColB: { value: lin(0x7df0e0) }, uColC: { value: lin(0xc9b8ff) } };
  {
    const pos = [], edge = [], idx = [];
    const SEG = 48;
    // disc: centre, a full ring, a soft rim
    const base0 = 0;
    pos.push(POOL.x, POOL.y, POOL.z); edge.push(1);
    const radii = [1.6, 2.85, 3.38], ev = [1, 1, 0];
    for (let r = 0; r < 3; r++) for (let i = 0; i < SEG; i++) { const a = (i / SEG) * TAU; pos.push(POOL.x + Math.cos(a) * radii[r], POOL.y, POOL.z + Math.sin(a) * radii[r]); edge.push(ev[r]); }
    for (let i = 0; i < SEG; i++) idx.push(base0, 1 + ((i + 1) % SEG), 1 + i);
    for (let r = 0; r < 2; r++) for (let i = 0; i < SEG; i++) {
      const a = 1 + r * SEG + i, b = 1 + r * SEG + ((i + 1) % SEG), c = a + SEG, d = b + SEG;
      idx.push(a, b, c, b, d, c);
    }
    // moat: four rings (soft, full, full, soft)
    const base1 = pos.length / 3;
    const mr = [MOAT.r - 0.66, MOAT.r - 0.36, MOAT.r + 0.36, MOAT.r + 0.66], me = [0, 1, 1, 0];
    for (let r = 0; r < 4; r++) for (let i = 0; i < SEG; i++) { const a = (i / SEG) * TAU; pos.push(MOAT.x + Math.cos(a) * mr[r], MOAT.y, MOAT.z + Math.sin(a) * mr[r]); edge.push(me[r]); }
    for (let r = 0; r < 3; r++) for (let i = 0; i < SEG; i++) {
      const a = base1 + r * SEG + i, b = base1 + r * SEG + ((i + 1) % SEG), c = a + SEG, d = b + SEG;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aEdge", new THREE.Float32BufferAttribute(edge, 1));
    g.setIndex(idx);
    const water = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: waterU, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    water.name = "dreamPool";
    water.frustumCulled = false;
    water.renderOrder = 2;
    school.add(water);
  }
  function rippleAt(x, z, strength) {
    const v = ripV[ripN];
    ripN = (ripN + 1) & 3;
    v.set(x, z, T, clamp(strength === undefined ? 1 : strength, 0, 3) * 0.5);
  }

  // ---------------------------------------------------------------- VOID: the light that is always 20 m away
  const voidG = new THREE.Group();
  voidG.name = "dreamVoid";
  group.add(voidG);
  const glowTex = buildGlowTexture(THREE);
  const light = new THREE.Group();
  light.name = "dreamLight";
  const lightCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1cf, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
  const lightHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb060, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.5 }));
  const lightGround = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff9a4a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.22 }));
  lightGround.position.y = -0.95;
  light.add(lightHalo, lightCore, lightGround);
  voidG.add(light);
  // dist: how far ahead it keeps (m); flicker 0..1; swell: size multiplier; on 0..1 brightness. setLight() glides them.
  const L = { dist: 20, flicker: 0, swell: 1, on: 1 };
  const LT = { dist: 20, flicker: 0, swell: 1, on: 1 };
  const LR = { dist: 0, flicker: 0, swell: 0, on: 0 };
  function setLight(o, seconds) {
    if (!o) return;
    for (const k in LT) {
      if (typeof o[k] !== "number") continue;
      LT[k] = o[k];
      if (seconds > 0) LR[k] = Math.abs(o[k] - L[k]) / seconds;
      else { L[k] = o[k]; LR[k] = 0; }
    }
  }
  // footsteps come back from the dark
  const ecT = new Float32Array(6), ecS = new Float32Array(6), ecP = new Float32Array(6);
  function queueEcho(delay, strength, pan) {
    for (let i = 0; i < 6; i++) if (ecS[i] <= 0) { ecT[i] = delay; ecS[i] = strength; ecP[i] = pan; return; }
  }

  // ---------------------------------------------------------------- ECHO: dawn, the sun, the glass pillars
  const echo = new THREE.Group();
  echo.name = "dreamEcho";
  group.add(echo);
  const dawnU = {
    uTime: tU, uSun: { value: 1 }, uSunY: { value: 0.1 }, uFlare: { value: 0 }, uFade: { value: 1 },
    uHorizon: { value: lin(0xe9a98f) }, uZenith: { value: lin(0x2c2a5a) }, uSunCol: { value: lin(0xfff3df) }, uGlowCol: { value: lin(0xffb47a) },
  };
  const dawn = new THREE.Mesh(domeGeo, new THREE.ShaderMaterial({ uniforms: dawnU, vertexShader: SKY_VERT, fragmentShader: DAWN_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }));
  dawn.name = "dreamDawn";
  dawn.frustumCulled = false;
  dawn.renderOrder = -10;
  echo.add(dawn);
  let flare = 0;

  const glassU = { uTime: tU, uAlpha: { value: 1 }, uSun: { value: 1 }, uTint: { value: lin(0x9fd2ff) }, uSunCol: { value: lin(0xffe6c4) } };
  const pillarGeo = new THREE.LatheGeometry([new THREE.Vector2(0.46, 0), new THREE.Vector2(0.4, 0.14), new THREE.Vector2(0.33, PILLAR_H - 0.55), new THREE.Vector2(0.0, PILLAR_H)], 6);
  {
    // flat facets: a crystal, not a candle
    const ng = pillarGeo.toNonIndexed();
    ng.computeVertexNormals();
    pillarGeo.copy(ng);
  }
  const pillarMesh = new THREE.InstancedMesh(pillarGeo, new THREE.ShaderMaterial({ uniforms: glassU, vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }), PILLAR_N);
  pillarMesh.name = "dreamPillars";
  pillarMesh.frustumCulled = false;
  pillarMesh.castShadow = false;
  pillarMesh.renderOrder = 3;
  echo.add(pillarMesh);

  const pX = new Float32Array(PILLAR_N), pZ = new Float32Array(PILLAR_N), pY = new Float32Array(PILLAR_N), pYaw = new Float32Array(PILLAR_N), pS = new Float32Array(PILLAR_N);
  const pTier = new Uint8Array(PILLAR_N), pUp = new Uint8Array(PILLAR_N), pShown = new Uint8Array(PILLAR_N);
  const pBreakT = new Float32Array(PILLAR_N).fill(-1), pDirX = new Float32Array(PILLAR_N), pDirZ = new Float32Array(PILLAR_N);
  const pCol = [];
  {
    const deg = Math.PI / 180;
    const arcs = [[4, [5, 35, 65]], [8, [-50, -27, 12, 31, 50]], [13, [-48, -20, 20, 48]]];
    const rnd = mulberry(1212);
    let i = 0;
    for (let t = 0; t < 3; t++) {
      for (const a of arcs[t][1]) {
        pX[i] = Math.sin(a * deg) * arcs[t][0];
        pZ[i] = Math.cos(a * deg) * arcs[t][0];
        pYaw[i] = rnd() * TAU;
        pS[i] = (t === 0 ? 0.82 : t === 1 ? 1 : 1.22) * (0.94 + rnd() * 0.12);
        pTier[i] = t;
        pCol.push({ x: pX[i], z: pZ[i], r: 0.5, on: false });
        i++;
      }
    }
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  function writePillar(i) {
    const up = pShown[i] === 1;
    _e.set(Math.sin(i * 2.1) * 0.035, pYaw[i], Math.cos(i * 1.7) * 0.035);
    _q.setFromEuler(_e);
    _p.set(pX[i], pY[i] - 0.06, pZ[i]);
    _s.set(pS[i] * (up ? 1 : 1.08), pS[i] * (up ? 1 : 0.085), pS[i] * (up ? 1 : 1.08));
    _m.compose(_p, _q, _s);
    pillarMesh.setMatrixAt(i, _m);
    pillarMesh.instanceMatrix.needsUpdate = true;
  }
  function placePillars() {
    for (let i = 0; i < PILLAR_N; i++) { pY[i] = heightAt(pX[i], pZ[i]); writePillar(i); }
  }
  const outV = { x: 0, y: 0, z: 0 };
  const pillars = {
    count: PILLAR_N,
    near: [0, 1, 2], mid: [3, 4, 5, 6, 7], far: [8, 9, 10, 11],
    height: PILLAR_H,
    get left() { let n = 0; for (let i = 0; i < PILLAR_N; i++) n += pUp[i]; return n; },
    pos(i, out) { out = out || outV; out.x = pX[i]; out.y = pY[i]; out.z = pZ[i]; return out; },
    standing(i) { return pUp[i] === 1; },
    tier(i) { return pTier[i]; },
    reset() {
      for (let i = 0; i < PILLAR_N; i++) { pUp[i] = 1; pShown[i] = 1; pBreakT[i] = -1; pCol[i].on = scene === "echo"; }
      placePillars();
      flare = 0;
    },
    // every standing pillar inside `radius` of (x, z) that this much voice can break shatters as the wave
    // reaches it (24 m/s). near: any power; mid: power >= 0.6; far: power >= 0.95 AND from within 11 m (the rise).
    blast(x, z, radius, power) {
      if (scene !== "echo") return 0;
      power = power === undefined ? 1 : power;
      let n = 0;
      for (let i = 0; i < PILLAR_N; i++) {
        if (!pUp[i]) continue;
        const dx = pX[i] - x, dz = pZ[i] - z, d = Math.hypot(dx, dz);
        const t = pTier[i];
        if (d > radius || power < TIER_POWER[t] - 0.02 || (t === 2 && d > FAR_REACH)) continue;
        pUp[i] = 0;
        pCol[i].on = false;
        pBreakT[i] = d / 24;
        pDirX[i] = d > 1e-3 ? dx / d : 0; pDirZ[i] = d > 1e-3 ? dz / d : 1;
        n++;
      }
      if (n > 0 && pillars.left === 0) flare = Math.max(flare, 1);
      return n;
    },
  };
  function breakNow(i, count) {
    pShown[i] = 0;
    writePillar(i);
    const fx = ctx.fx, au = ctx.audio;
    if (fx && typeof fx.glassShards === "function") fx.glassShards(pX[i], pY[i] + PILLAR_H * pS[i] * 0.5, pZ[i], pDirX[i], pDirZ[i], 46, pY[i]);
    if (au && typeof au.pillarShatter === "function") au.pillarShatter(count);
  }

  // ---------------------------------------------------------------- named points
  function yOf(p) { p.y = heightAt(p.x, p.z); return p; }
  function buildPoints(name) {
    if (name === "void") return { spawn: yOf(pt(0, 0, 0, 0)), ahead: pt(0, 1.1, 20) };
    if (name === "echo") {
      const soldiers = [];
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.39; const x = Math.sin(a) * 10.5, z = 5 + Math.cos(a) * 10.5; soldiers.push(yOf(pt(x, 0, z, Math.atan2(-x, 2 - z)))); }
      const ry = heightAt(RISE.x, RISE.z);
      return {
        spawn: yOf(pt(0, 0, 0, 0)),
        wizard: yOf(pt(-3, 0, 4, Math.atan2(3, -4))),
        rise: pt(RISE.x, ry, RISE.z, Math.PI),
        wizardRise: yOf(pt(1.7, 0, 12.8, Math.atan2(-1.7, -0.8))),
        soldiers,
        camWide: camPair(-9.5, 5.2, -7.5, 0, 1.1, 7),
        camSun: camPair(0.9, 0.85, -4.6, -0.4, 1.9, 14),
        camWizard: camPair(-0.6, 1.2, 1.4, -3, 1.5, 4),
        camRise: camPair(5.5, 3.6, 5.2, 0, ry + 0.6, 12),
      };
    }
    const soldiers = [], poolSpots = [], poolBank = [], fallen = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; const x = Math.sin(a) * 4.5, z = Math.cos(a) * 4.5; soldiers.push(yOf(pt(x, 0, z, Math.atan2(-x, -z)))); }
    for (const s of [[-8.9, 3.9], [-7.1, 3.8], [-8.0, 2.0]]) poolSpots.push(yOf(pt(s[0], 0, s[1], Math.atan2(0 - s[0], 0 - s[1]))));
    for (const s of [[-4.6, 0.2], [-3.8, 3.2], [-4.9, 6.2]]) poolBank.push(yOf(pt(s[0], 0, s[1], Math.atan2(POOL.x - s[0], POOL.z - s[1]))));
    for (const s of [[-2.6, 9.2, 0.6], [-1.4, 9.2, -2.2], [1.9, 8.6, 1.9], [2.9, 11.2, -0.9], [-0.6, 12.2, 2.8]]) fallen.push(yOf(pt(s[0], 0, s[1], s[2])));
    return {
      spawn: yOf(pt(0, 0, -8, 0)),
      wizard: yOf(pt(0, 0, 6, Math.PI)),
      ring: { x: 0, y: 0, z: 0, r: 5 },
      soldiers,
      pool: { x: POOL.x, y: POOL.y, z: POOL.z, r: POOL.r, depth: POOL.depth },
      poolSpots, poolBank,
      poolEdge: yOf(pt(-5.4, 0, 1.8, Math.atan2(POOL.x + 5.4, POOL.z - 1.8))),
      cauldron: yOf(pt(8, 0, 2, -Math.PI / 2)),
      wizardCauldron: yOf(pt(9.6, 0, 3.4, Math.atan2(-9.6, -3.4))),
      ingredients: { glowcap: yOf(pt(MOUNDS[0][0], 0, MOUNDS[0][1])), moonpetal: yOf(pt(MOUNDS[1][0], 0, MOUNDS[1][1])), dewdrop: yOf(pt(MOUNDS[2][0], 0, MOUNDS[2][1])) },
      moat: { x: MOAT.x, y: MOAT.y, z: MOAT.z, r: MOAT.r, half: MOAT.half },
      potionField: { x: 0, y: 0, z: 10, r: 5 },
      fallen,
      camWide: camPair(-12, 7, -14, 0, 1, 2),
      camWizard: camPair(1.7, 1.45, 2.4, 0, 1.5, 6),
      camPool: camPair(-3.4, 2.3, -0.9, -8, 0.1, 3),
      camCauldron: camPair(4.6, 1.9, -1.4, 8, 0.9, 2),
      camField: camPair(6, 2.2, 15, 0, 0.4, 10),
      camSky: camPair(0, 2.4, -11.5, 0, 24, 9),
      camWake: camPair(1.7, 1.0, -10.5, 0, 0.25, -8),
    };
  }

  // ---------------------------------------------------------------- scenes
  const colliders = [];
  function setScene(name) {
    if (name !== "school" && name !== "void" && name !== "echo") name = "school";
    scene = name;
    world.scene = name;
    school.visible = name === "school";
    voidG.visible = name === "void";
    echo.visible = name === "echo";
    clearBumps();
    colliders.length = 0;
    for (let i = 0; i < 6; i++) ecS[i] = 0;
    if (name === "school") {
      isleV.set(ISLE_R, 13, 16, -0.5);
      setBump(0, POOL.x, POOL.z, 3.0, 3.9, -0.27);
      for (let i = 0; i < 3; i++) setBump(1 + i, MOUNDS[i][0], MOUNDS[i][1], 0.5, 1.9, 0.45);
      ringV.set(MOAT.x, MOAT.z, MOAT.r, -0.34); ringW.set(0.25, 0.72);
      quiltBase.setHex(0xdcd8ff);
      quiltMat.emissive.setHex(0x1b1640);
      field.fadeColor.setHex(0x0b0e24);
      field.setFade(field.fieldRadius - 1.2, field.fieldRadius);
      if (gapFloor) gapFloor.visible = false;
    } else if (name === "void") {
      quiltBase.setHex(0x8f8f8f);
      quiltMat.emissive.setHex(0x000000);
      field.fadeColor.setHex(0x000000);
      field.setFade(field.fadeStart, field.fadeEnd);
      if (gapFloor) { gapFloor.visible = true; gapFloor.material.color.setHex(0x060606); }
    } else {
      setBump(0, RISE.x, RISE.z, RISE.r0, RISE.r1, RISE.h);
      quiltBase.setHex(0xffe4d6);
      quiltMat.emissive.setHex(0x1a0f18);
      field.fadeColor.setHex(0x6b5372);
      field.setFade(15, field.fieldRadius);
      if (gapFloor) { gapFloor.visible = true; gapFloor.material.color.setHex(0x30263f); }
      for (let i = 0; i < PILLAR_N; i++) colliders.push(pCol[i]);
    }
    for (let i = 0; i < CH.length; i++) { chV[i] = chT[i] = 1; chR[i] = 0; }
    glow = glowT = 1; glowR = 0;
    L.dist = LT.dist = 20; L.flicker = LT.flicker = 0; L.swell = LT.swell = 1; L.on = LT.on = 1;
    flare = 0;
    pillars.reset();
    world.P = buildPoints(name);
    writeEnv(1);
    Object.assign(world.env, envNow, { fog: envNow.fog.slice(), hemi: envNow.hemi.slice(), sun: envNow.sun.slice(), sunDir: envNow.sunDir.slice() });
    if (ctx.world === world && typeof ctx.setEnv === "function") ctx.setEnv(world.env, 0);
    lastFX = NaN;
    apply(0);
  }

  function confine(obj, radius) {
    const r = radius || 0;
    if (scene === "school") {
      const d = Math.hypot(obj.x, obj.z), m = WALK_R - r;
      if (d > m) { obj.x *= m / d; obj.z *= m / d; }
    } else if (scene === "echo") {
      const dx = obj.x - ECHO_C.x, dz = obj.z - ECHO_C.z, d = Math.hypot(dx, dz), m = ECHO_C.r - r;
      if (d > m) { obj.x = ECHO_C.x + (dx * m) / d; obj.z = ECHO_C.z + (dz * m) / d; }
    }
  }

  // ---------------------------------------------------------------- per frame
  const _v2 = new THREE.Vector2();
  let lastFX = NaN, lastFZ = NaN;
  function apply(dt) {
    // channels
    for (let i = 0; i < CH.length; i++) {
      if (chV[i] !== chT[i]) { const d = chT[i] - chV[i], st = chR[i] * dt; chV[i] = Math.abs(d) <= st || chR[i] === 0 ? chT[i] : chV[i] + Math.sign(d) * st; }
    }
    if (glow !== glowT) { const d = glowT - glow, st = glowR * dt; glow = Math.abs(d) <= st || glowR === 0 ? glowT : glow + Math.sign(d) * st; }
    const g = glow;
    const kQ = chan("quilt") * (scene === "void" ? 1 : 0.55 + 0.45 * g);
    quiltMat.color.copy(quiltBase).multiplyScalar(kQ);
    quiltMat.emissiveIntensity = 0.5 * g * chan("quilt");
    if (scene === "school") {
      nebU.uGlow.value = 0.04 + 0.96 * g;
      nebU.uFade.value = chan("sky");
      starU.uAlpha.value = chan("stars") * (0.3 + 0.7 * g);
      driftU.uDShow.value = chan("islands");
      lampU.uAlpha.value = chan("lanterns") * (0.2 + 0.8 * g);
      stringU.uAlpha.value = 0.5 * chan("lanterns") * g;
      waterU.uAlpha.value = chan("pool");
      waterU.uGlow.value = g;
    } else if (scene === "echo") {
      // the glow is the sun: at 0 it has set
      const sunK = g * chan("sun");
      dawnU.uSun.value = sunK;
      dawnU.uSunY.value = -0.2 + 0.3 * sm(0, 1, g);
      dawnU.uFlare.value = flare;
      dawnU.uFade.value = chan("sky") * (0.3 + 0.7 * g);
      glassU.uAlpha.value = chan("pillars");
      glassU.uSun.value = sunK * (1 + flare);
    }
  }

  function update(dt, time, fx0, fz0) {
    if (!(dt > 0)) dt = 0;
    T += dt;
    if (T > 3600) { T -= 3600; for (let i = 0; i < 4; i++) ripV[i].z -= 3600; }
    tU.value = T;
    if (!Number.isFinite(fx0)) fx0 = P ? P.x : 0;
    if (!Number.isFinite(fz0)) fz0 = P ? P.z : 0;

    // where the quilt keeps its fine cushions: on the player, but never so far out that the island runs out
    let qx = fx0, qz = fz0;
    if (scene === "school") { const d = Math.hypot(qx, qz); if (d > 6.5) { qx *= 6.5 / d; qz *= 6.5 / d; } }
    else if (scene === "echo") { const dx = qx - ECHO_C.x, dz = qz - ECHO_C.z, d = Math.hypot(dx, dz); if (d > 6) { qx = ECHO_C.x + (dx * 6) / d; qz = ECHO_C.z + (dz * 6) / d; } }
    field.update(dt, qx, qz);

    apply(dt);

    const r = ctx.renderer, cam = ctx.camera;
    if (r && cam && typeof r.getDrawingBufferSize === "function") {
      r.getDrawingBufferSize(_v2);
      lampU.uPx.value = (_v2.y * 0.5) / Math.tan(((cam.fov || 50) * Math.PI) / 360);
      starU.uDpr.value = clamp(_v2.y / 720, 0.75, 2.2);
    }

    // the heavens are a sky box: they travel with the camera so the far side never leaves the frustum
    if (cam && cam.position) { skyTurn.position.copy(cam.position); dawn.position.copy(cam.position); }
    if (scene === "school") {
      skyTurn.rotation.y = T * 0.006;
      skyTurn.rotation.x = Math.sin(T * 0.004) * 0.05;
      drift.rotation.y = T * 0.011;
    } else if (scene === "void") {
      for (const k in LT) {
        if (L[k] !== LT[k]) { const d = LT[k] - L[k], st = LR[k] * dt; L[k] = Math.abs(d) <= st || LR[k] === 0 ? LT[k] : L[k] + Math.sign(d) * st; }
      }
      // always ahead (+Z), always `dist` away: it recedes exactly as fast as you come
      if (fx0 !== lastFX || fz0 !== lastFZ || dt > 0) {
        light.position.set(fx0, 1.15 + Math.sin(T * 0.8) * 0.06, fz0 + L.dist);
        lastFX = fx0; lastFZ = fz0;
        const a = world.P && world.P.ahead;
        if (a) { a.x = fx0; a.z = fz0 + L.dist; }
      }
      const fl = L.flicker > 0 ? 1 - L.flicker * (0.5 + 0.5 * Math.sin(T * 31) * Math.sin(T * 17.3 + 1.1)) * (Math.sin(T * 7.1) > -0.2 ? 1 : 0.2) : 1;
      const on = L.on * chan("light") * clamp(fl, 0, 1);
      const breathe = 1 + Math.sin(T * 1.7) * 0.05;
      lightCore.scale.setScalar(0.85 * L.swell * breathe);
      lightHalo.scale.setScalar(3.4 * L.swell * breathe);
      lightGround.scale.set(7 * L.swell, 1.1 * L.swell, 1);
      lightCore.material.opacity = on;
      lightHalo.material.opacity = 0.5 * on;
      lightGround.material.opacity = 0.2 * on;
      // the returning footsteps
      for (let i = 0; i < 6; i++) {
        if (ecS[i] <= 0) continue;
        ecT[i] -= dt;
        if (ecT[i] <= 0) {
          const au = ctx.audio;
          if (au && typeof au.cushionStep === "function") au.cushionStep(ecS[i], ecP[i]);
          ecS[i] = 0;
        }
      }
    } else if (scene === "echo") {
      if (flare > 0) flare = Math.max(0, flare - dt * 0.45);
      let broke = 0;
      for (let i = 0; i < PILLAR_N; i++) {
        if (pBreakT[i] < 0) continue;
        pBreakT[i] -= dt;
        if (pBreakT[i] <= 0) { pBreakT[i] = -1; broke++; breakNow(i, broke); }
      }
    }
  }

  // ---------------------------------------------------------------- the world object
  const sfx = (name, a, b, c) => { const au = ctx.audio; if (au && typeof au[name] === "function") au[name](a, b, c); };
  const vfx = (name, a, b, c, d, e) => { const f = ctx.fx; if (f && typeof f[name] === "function") return f[name](a, b, c, d, e); return undefined; };

  const world = {
    name: "dream",
    scene: "",
    group,
    swim: false,
    maxStep: 0.5,
    env: { background: 0x0b0e24, fog: [0x0b0e24, 46, 150], hemi: [0x93a0ff, 0x3b2a63, 0.9], sun: [0xdfe6ff, 0.95], sunDir: [-0.35, 0.8, 0.45], far: 80, dark: true },
    ENV: ENVS,
    P: null,
    colliders,
    cover: [],
    routes: {},
    field, // the cushion field (press / heightAt), for levels that want to squash it
    light,
    lightState: L,
    setLight,
    pillars,
    setScene,
    setGlow,
    fade,
    get glow() { return glow; },
    flare(k) { flare = Math.max(flare, k === undefined ? 1 : k); },
    heightAt,
    waterAt,
    inPool,
    inMoat,
    rippleAt,
    press(x, z, force) { field.press(x, z, force); },
    surfaceAt(x, z) { return waterAt(x, z) > heightAt(x, z) + 0.02 ? "water" : "cushion"; },
    sight() { return true; },
    hidden() { return false; },
    lit() { return 0.5; },
    confine,
    update,
    onFootstep(wx, wz, strength, i, wet, pan) {
      field.press(wx, wz, 0.32 + 0.4 * strength);
      sfx("cushionStep", wet ? strength * 0.6 : strength, pan);
      if (wet) rippleAt(wx, wz, 0.5 + strength * 0.5);
      else if (i < 2 || strength > 0.7) vfx("cushionPuff", wx, heightAt(wx, wz) + 0.02, wz, strength * (scene === "void" ? 0.3 : 0.55));
      if (scene === "void" && (i & 1) === 0) { queueEcho(0.31, strength * 0.34, -pan * 0.8); queueEcho(0.66, strength * 0.15, pan * 0.5); }
    },
    onJump(x, z, h) {
      field.press(x, z, 1.3);
      vfx("cushionPuff", x, h + 0.03, z, 1.0);
    },
    onLand(x, z, h, impact, wet) {
      sfx("cushionLand", impact);
      field.press(x, z, 0.8 + 1.15 * impact);
      if (wet || waterAt(x, z) > h) rippleAt(x, z, 2.5);
      vfx("cushionPuff", x, h + 0.03, z, 0.8 + 1.6 * impact);
      if (scene === "void") queueEcho(0.36, 0.3 + 0.3 * impact, 0);
    },
    onEnter() { vfx("dreamMotes", true, 14, scene === "echo" ? 0xffe2c8 : scene === "void" ? 0x9a9a9a : 0xcfd6ff); },
    onLeave() { vfx("dreamMotes", false); },
    reset() {
      setScene(scene || "school");
    },
  };

  setScene("school");
  return world;
}
