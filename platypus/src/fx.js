// fx.js — water, electro pulse, particles, rings.
//
// Everything here works in WORLD coordinates: keep `fx.group` at the origin with identity transform.
// Budget: 1 draw call per water, 1 for all particles, 1 for all rings, 1 per live electro bolt (max 2),
// one PointLight (intensity 0 when idle). All motion is closed-form in vertex shaders: the CPU only
// writes a few floats when an effect is spawned, and nothing is allocated after construction
// (except in createWater, which is a setup-time call).
// The level 2-5 extensions (see EXTENSIONS below) add at most 4 more draw calls, each hidden while idle.
// The level 6-11 extensions (LEVELS2.md B4) add at most 7 more, again each hidden while idle.

const MAX_PARTICLES = 384;
const P_STRIDE = 20; // 5 x vec4
const MAX_RINGS = 32;
const R_STRIDE = 12; // 3 x vec4
const MAX_RIPPLES = 8;
const MAX_BOLTS = 2;

const PULSE_TRAVEL = 0.35; // seconds from bill to target
const PULSE_LINGER = 0.24; // full-bolt flash fading after arrival

// particle shapes
const SOFT = 0, FIBRE = 1, SPARK = 2, DROP = 3, FLASH = 4;

// ---------------------------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------------------------

const WATER_COMMON = /* glsl */ `
uniform float uTime;
uniform vec4 uRipples[${MAX_RIPPLES}]; // world x, world z, start time, strength

// Sum of four travelling sines. Returns (height, dH/dx, dH/dz).
vec3 waterWaves(vec2 p, float t) {
	vec3 r = vec3(0.0);
	float ph;
	ph = dot(vec2(0.80, 0.60), p) * 3.9 + t * 1.7;
	r += vec3(sin(ph) * 0.0110, cos(ph) * 0.0110 * 3.9 * vec2(0.80, 0.60));
	ph = dot(vec2(-0.50, 0.866), p) * 6.8 - t * 2.3;
	r += vec3(sin(ph) * 0.0060, cos(ph) * 0.0060 * 6.8 * vec2(-0.50, 0.866));
	ph = dot(vec2(0.30, -0.954), p) * 12.5 + t * 3.1;
	r += vec3(sin(ph) * 0.0030, cos(ph) * 0.0030 * 12.5 * vec2(0.30, -0.954));
	ph = dot(vec2(-0.924, -0.383), p) * 21.0 + t * 4.3;
	r += vec3(sin(ph) * 0.0015, cos(ph) * 0.0015 * 21.0 * vec2(-0.924, -0.383));
	return r;
}

// One expanding ring wave. Returns (height, dH/dx, dH/dz).
vec3 waterRipple(vec2 p, vec4 rp, float t) {
	float age = t - rp.z;
	if (rp.w <= 0.0 || age < 0.0 || age > 2.6) return vec3(0.0);
	vec2 d = p - rp.xy;
	float r = length(d) + 1e-4;
	float u = r - age * 1.25;
	float env = rp.w * exp(-age * 1.7) * smoothstep(0.0, 0.1, age) / (1.0 + r * 0.9);
	float g = exp(-9.0 * u * u) * env * 0.02;
	float s = sin(u * 20.0);
	float c = cos(u * 20.0);
	return vec3(g * s, g * (20.0 * c - 18.0 * u * s) * d / r);
}

vec3 waterSurface(vec2 p, float t) {
	vec3 r = waterWaves(p, t);
	for (int i = 0; i < ${MAX_RIPPLES}; i++) {
		r += waterRipple(p, uRipples[i], t);
	}
	return r;
}
`;

const WATER_VERT = /* glsl */ `
${WATER_COMMON}
varying vec3 vWorld;
varying vec2 vLocal;
#include <fog_pars_vertex>
void main() {
	vLocal = position.xz;
	vec4 wp = modelMatrix * vec4(position, 1.0);
	wp.y += waterSurface(wp.xz, uTime).x;
	vWorld = wp.xyz;
	vec4 mvPosition = viewMatrix * wp;
	gl_Position = projectionMatrix * mvPosition;
	#include <fog_vertex>
}
`;

const WATER_FRAG = /* glsl */ `
${WATER_COMMON}
uniform vec2 uHalf;    // half length, half width (local)
uniform float uSoft;   // edge softness in metres
uniform vec3 uSun;     // direction TO the sun, normalised
uniform vec4 uZapA;    // pulse from.xz, to.xz
uniform vec2 uZapP;    // pulse progress 0..1, intensity
varying vec3 vWorld;
varying vec2 vLocal;
#include <fog_pars_fragment>

float sdRoundBox(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
	vec2 p = vWorld.xz;
	float t = uTime;

	// ---- soft, slightly wobbling shoreline
	float wob = sin(p.x * 5.3 + t * 0.9) * sin(p.y * 4.7 - t * 0.7) * 0.05
		+ sin(p.x * 13.0 - t * 1.3 + p.y * 9.0) * 0.015;
	float rad = min(min(uHalf.x, uHalf.y) * 0.6, 0.9);
	float inside = -sdRoundBox(vLocal, uHalf, rad) + wob;
	float edge = smoothstep(0.0, uSoft, inside);
	if (edge <= 0.002) discard;

	// ---- surface normal: analytic waves + ripples + two fine detail trains
	vec3 s = waterSurface(p, t);
	vec2 grad = s.yz;
	float ph1 = dot(vec2(0.62, 0.78), p) * 37.0 + t * 5.6 + sin(p.x * 3.1 + t) * 1.3;
	float ph2 = dot(vec2(-0.86, 0.51), p) * 53.0 - t * 7.1 + sin(p.y * 2.7 - t * 0.8) * 1.7;
	grad += cos(ph1) * 0.030 * vec2(0.62, 0.78) + cos(ph2) * 0.022 * vec2(-0.86, 0.51);
	vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));

	vec3 V = normalize(cameraPosition - vWorld);
	float ndv = max(dot(N, V), 0.0);
	float fres = 0.025 + 0.975 * pow(1.0 - ndv, 5.0);

	// ---- reflected sky: bright milky horizon, soft blue overhead
	vec3 R = reflect(-V, N);
	float up = clamp(R.y, 0.0, 1.0);
	vec3 sky = mix(vec3(0.97, 0.985, 1.0), vec3(0.56, 0.76, 0.97), pow(up, 0.55));

	// ---- body colour: shallow aqua at the shore, deeper teal in the middle
	float depth = smoothstep(0.0, 0.9, inside);
	vec3 body = mix(vec3(0.52, 0.86, 0.88), vec3(0.07, 0.43, 0.60), depth * 0.85 + 0.1);
	// refracted light dancing on the bottom (caustics), distorted by the surface slope
	vec2 cp = p + grad * 0.6;
	float c1 = sin(cp.x * 7.0 + sin(cp.y * 5.0 + t * 1.1) * 1.6 + t * 0.9);
	float c2 = sin(cp.y * 8.0 + sin(cp.x * 6.0 - t * 1.3) * 1.6 - t * 0.7);
	float caus = pow(1.0 - abs(c1 * c2), 6.0);
	body += vec3(0.30, 0.42, 0.40) * caus * (0.35 + 0.65 * depth);

	vec3 col = mix(body, sky, fres);

	// ---- sun glint
	float sp = pow(max(dot(R, uSun), 0.0), 140.0);
	col += vec3(1.0, 0.98, 0.92) * sp * 1.6;

	// ---- thin foam / wet line at the shore
	float foam = smoothstep(uSoft * 1.6, uSoft * 0.5, inside) * (0.55 + 0.45 * sin(p.x * 21.0 + p.y * 17.0 + t * 2.0));
	col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.35);

	float alpha = mix(0.60, 0.97, fres) + sp * 0.5 + caus * 0.06;

	// ---- electromagnetic energy travelling through the water
	if (uZapP.y > 0.001) {
		vec2 A = uZapA.xy;
		vec2 H = mix(A, uZapA.zw, clamp(uZapP.x, 0.0, 1.0));
		vec2 pa = p - A;
		vec2 ba = H - A;
		float hh = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
		float dSeg = length(pa - ba * hh);
		float dHead = length(p - H);
		// flickering web of filaments: zero-lines of a warped sine lattice, re-seeded ~24x a second
		float fr = mod(floor(t * 24.0), 64.0);
		vec2 q = p * 6.5 + grad * 4.0;
		float wa = q.x + sin(q.y * 1.3 + fr * 2.39) * 1.9 + fr * 0.7;
		float wb = q.y + sin(q.x * 1.1 - fr * 1.71) * 1.9 - fr * 1.3;
		float web = pow(1.0 - abs(sin(wa) * sin(wb)), 14.0);
		float wc = q.x * 0.57 - q.y * 0.82 + sin(q.x * 0.9 + fr * 3.1) * 2.3;
		web = max(web, pow(1.0 - abs(sin(wc * 1.7)), 22.0) * 0.8);
		float field = exp(-dSeg * 2.6);
		// field ring racing outward from the head
		float ringR = 0.35 + fract(t * 3.0) * 0.9;
		float fring = exp(-pow((dHead - ringR) * 9.0, 2.0)) * (1.0 - fract(t * 3.0));
		float glow = uZapP.y * (field * 0.35 + web * exp(-dSeg * 1.5) * 1.1 + exp(-dHead * dHead * 5.0) * 1.2 + fring * 0.5);
		vec3 zc = mix(vec3(0.12, 0.45, 1.0), vec3(0.85, 0.97, 1.0), clamp(glow * 0.6, 0.0, 1.0));
		col = mix(col, zc, clamp(glow * 0.75, 0.0, 0.92));
		col += zc * glow * 0.25;
		alpha += glow * 0.35;
	}

	gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0) * edge);
	#include <fog_fragment>
}
`;

const PARTICLE_VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aPos;  // spawn xyz, start time
attribute vec4 aVel;  // velocity xyz, life
attribute vec4 aParm; // size0, size1, gravity, drag
attribute vec4 aCol;  // rgb, additive 0..1
attribute vec4 aMisc; // shape, stretch (or spin for fibres), rotation, alpha
varying vec2 vUv;
varying vec4 vCol;
varying float vA;
varying float vShape;
void main() {
	vUv = position.xy;
	vCol = aCol;
	vShape = aMisc.x;
	vA = 0.0;
	float age = uTime - aPos.w;
	float life = aVel.w;
	float u = age / max(life, 1e-4);
	if (life <= 0.0 || u < 0.0 || u >= 1.0) {
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		return;
	}
	float k = max(aParm.w, 1e-3);
	float dec = exp(-k * age);
	vec3 p = aPos.xyz + aVel.xyz * ((1.0 - dec) / k);
	p.y += 0.5 * aParm.z * age * age;
	vec3 vel = aVel.xyz * dec;
	vel.y += aParm.z * age;

	float ease = 1.0 - (1.0 - u) * (1.0 - u);
	float size = mix(aParm.x, aParm.y, ease);
	vA = aMisc.w * smoothstep(0.0, 0.07, u) * pow(1.0 - u, 1.35);

	vec4 mv = viewMatrix * vec4(p, 1.0);
	vec2 c = position.xy;
	vec2 off;
	if (aMisc.x > 0.5 && aMisc.x < 1.5) {
		float ang = aMisc.z + age * aMisc.y;
		float ca = cos(ang);
		float sa = sin(ang);
		vec2 q = vec2(c.x, c.y * 0.14) * size;
		off = vec2(q.x * ca - q.y * sa, q.x * sa + q.y * ca);
	} else if (aMisc.y > 0.0) {
		vec2 vv = (viewMatrix * vec4(vel, 0.0)).xy;
		float spd = length(vv);
		vec2 ax = spd > 1e-4 ? vv / spd : vec2(1.0, 0.0);
		float len = 1.0 + aMisc.y * spd;
		off = (ax * c.x * len + vec2(-ax.y, ax.x) * c.y) * size;
	} else {
		off = c * size;
	}
	mv.xy += off;
	gl_Position = projectionMatrix * mv;
}
`;

const PARTICLE_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vCol;
varying float vA;
varying float vShape;
void main() {
	float r = length(vUv);
	vec3 col = vCol.rgb;
	float a;
	if (vShape < 0.5) {            // soft mote
		a = smoothstep(1.0, 0.0, r);
		a *= a;
	} else if (vShape < 1.5) {     // fibre
		a = (1.0 - abs(vUv.y)) * smoothstep(1.0, 0.45, abs(vUv.x));
	} else if (vShape < 2.5) {     // spark
		float g = smoothstep(1.0, 0.0, r);
		col = mix(col, vec3(1.0), g * g);
		a = pow(g, 1.4);
	} else if (vShape < 3.5) {     // droplet
		a = smoothstep(1.0, 0.72, r);
		float hl = smoothstep(0.55, 0.0, length(vUv - vec2(-0.3, 0.35)));
		col = col * (0.72 + 0.28 * (1.0 - r)) + vec3(hl * 0.55);
	} else {                       // flash with a faint cross flare
		float g = max(1.0 - r, 0.0);
		float flare = max(0.0, 1.0 - abs(vUv.x) * 9.0) * max(0.0, 1.0 - abs(vUv.y))
			+ max(0.0, 1.0 - abs(vUv.y) * 9.0) * max(0.0, 1.0 - abs(vUv.x));
		a = pow(g, 2.2) + flare * 0.35 * g;
		col = mix(col, vec3(1.0), clamp(pow(g, 3.0) * 1.5, 0.0, 1.0));
	}
	a = clamp(a * vA, 0.0, 1.0);
	if (a < 0.004) discard;
	gl_FragColor = vec4(col * a, a * (1.0 - vCol.a));
}
`;

const RING_VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aRing;  // centre xyz, start time
attribute vec4 aRing2; // life, r0, r1, thickness (fraction of radius)
attribute vec4 aRCol;  // rgb, additive
varying vec2 vUv;
varying vec4 vCol;
varying float vFade;
varying float vThick;
void main() {
	vUv = position.xy * 1.25;
	vCol = aRCol;
	vThick = aRing2.w;
	vFade = 0.0;
	float age = uTime - aRing.w;
	float u = age / max(aRing2.x, 1e-4);
	if (aRing2.x <= 0.0 || u < 0.0 || u >= 1.0) {
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		return;
	}
	float e = 1.0 - (1.0 - u) * (1.0 - u);
	float rad = mix(aRing2.y, aRing2.z, e);
	vFade = smoothstep(0.0, 0.08, u) * pow(1.0 - u, 1.4);
	vec3 p = aRing.xyz + vec3(position.x, 0.0, position.y) * rad * 1.25;
	gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const RING_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vCol;
varying float vFade;
varying float vThick;
void main() {
	float r = length(vUv);
	float band = smoothstep(1.0, 0.0, abs(r - 1.0) / vThick);
	band = band * band * (3.0 - 2.0 * band);
	float inner = r < 1.0 ? 0.16 * r * r * r : 0.0;
	float echo = smoothstep(1.0, 0.0, abs(r - 0.62) / (vThick * 0.6)) * 0.3;
	float a = clamp((band + inner + echo) * vFade, 0.0, 1.0);
	if (a < 0.004) discard;
	vec3 col = mix(vCol.rgb, vec3(1.0), band * band * 0.45);
	gl_FragColor = vec4(col * a, a * (1.0 - vCol.a));
}
`;

const BOLT_VERT = /* glsl */ `
uniform vec3 uFrom;
uniform vec3 uTo;
uniform float uSurfY;
uniform float uHead;   // 0..1 position of the pulse head along the path
uniform float uFade;   // overall fade
uniform float uFlash;  // 1 after arrival: whole bolt lights up
uniform float uTime;
uniform float uSeed;
attribute float aT;      // 0..1 along this strand
attribute float aSide;   // -1 / +1 across the ribbon
attribute vec4 aStrand;  // t0 on the main path (<0 = main strand), yaw angle, length in metres, seed
attribute vec4 aKind;    // half width, y offset, brightness, wander
varying float vSide;
varying float vInt;
varying float vDeep;

float hash1(float n) { return fract(sin(n) * 43758.5453123); }
float noise1(float x) {
	float i = floor(x);
	float f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	return mix(hash1(i), hash1(i + 1.0), f) * 2.0 - 1.0;
}
float jag(float t, float s) {
	return noise1(t * 4.0 + s) * 0.55 + noise1(t * 11.0 + s * 1.7 + 3.1) * 0.30 + noise1(t * 27.0 + s * 2.3 + 7.7) * 0.15;
}
// straight line that dives from the bill to the water surface, runs along it, then climbs the target
vec3 basePath(float t) {
	vec3 p = mix(uFrom, uTo, t);
	float y = mix(uFrom.y, uSurfY, smoothstep(0.0, 0.14, t));
	p.y = mix(y, uTo.y, smoothstep(0.86, 1.0, t));
	return p;
}
vec3 mainPos(float t, float seed, float wander, float yOff, vec3 perp, float L) {
	float frame = mod(floor(uTime * 26.0 + seed * 5.0), 64.0);
	float s = uSeed * 13.0 + seed * 31.7 + frame * 9.13;
	float tc = clamp(t, 0.0, 1.0);
	float env = sin(3.14159265 * tc);
	float amp = (0.05 + 0.065 * min(L, 3.0)) * wander;
	float f = tc * max(L, 1.0) * 1.5;
	vec3 p = basePath(tc);
	p += perp * (jag(f, s) * amp * env);
	p.y += yOff * smoothstep(0.0, 0.16, tc) * (1.0 - smoothstep(0.84, 1.0, tc)) + jag(f * 1.7 + 5.0, s + 40.0) * 0.022 * env;
	return p;
}
vec3 strandPos(float sT) {
	vec3 dir = uTo - uFrom;
	dir.y = 0.0;
	float L = length(dir);
	dir = L > 1e-4 ? dir / L : vec3(0.0, 0.0, 1.0);
	vec3 perp = vec3(-dir.z, 0.0, dir.x);
	if (aStrand.x < 0.0) {
		return mainPos(sT, aStrand.w, aKind.w, aKind.y, perp, L);
	}
	// branch: rooted on main strand 0 (seed 0, wander 1, no y offset)
	vec3 root = mainPos(aStrand.x, 0.0, 1.0, 0.0, perp, L);
	float ca = cos(aStrand.y);
	float sa = sin(aStrand.y);
	vec3 bd = dir * ca + perp * sa;
	vec3 bp = vec3(-bd.z, 0.0, bd.x);
	float frame = mod(floor(uTime * 20.0 + aStrand.w * 7.0), 64.0);
	float sd = uSeed * 13.0 + aStrand.w * 31.7 + frame * 5.71;
	float sc = max(sT, 0.0);
	vec3 p = root + bd * (sc * aStrand.z) + bp * (jag(sc * 3.0, sd) * 0.22 * aStrand.z * min(sc * 3.0, 1.0));
	p.y += aKind.y * sc + jag(sc * 4.0 + 2.0, sd + 11.0) * 0.02 * sc;
	return p;
}
void main() {
	vSide = aSide;
	vDeep = aKind.y < -0.001 ? 1.0 : 0.0;
	vInt = 0.0;
	bool isMain = aStrand.x < 0.0;
	float tm = isMain ? aT : aStrand.x + aT * 0.10;
	float vis = step(tm, uHead);
	float behind = max(uHead - tm, 0.0);
	float trail = exp(-behind * 4.5);
	float inten;
	float width = aKind.x;
	if (isMain) {
		float fl = 0.72 + 0.28 * hash1(aStrand.w * 3.0 + mod(floor(uTime * 40.0), 113.0));
		inten = max(mix(0.30, 1.0, trail), uFlash) * fl;
		width *= (0.55 + 0.45 * max(trail, uFlash)) * smoothstep(0.0, 0.05, aT) * (1.0 - 0.6 * smoothstep(0.95, 1.0, aT));
		width *= 1.0 + 1.3 * exp(-behind * behind * 500.0) * (1.0 - uFlash);
	} else {
		float on = step(0.38, hash1(aStrand.w * 5.3 + mod(floor(uTime * 16.0), 97.0)));
		inten = max(trail, uFlash * 0.75) * on * (1.0 - aT * 0.7);
		width *= (1.0 - aT * 0.85);
	}
	inten *= vis * uFade * aKind.z;
	if (inten <= 0.002) {
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		return;
	}
	vInt = inten;
	vec3 P = strandPos(aT);
	vec3 Q = strandPos(aT + 0.03);
	vec3 tng = Q - P;
	vec3 view = cameraPosition - P;
	vec3 sd = cross(tng, view);
	float sl = length(sd);
	sd = sl > 1e-6 ? sd / sl : vec3(1.0, 0.0, 0.0);
	P += sd * (aSide * width);
	gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
}
`;

const BOLT_FRAG = /* glsl */ `
varying float vSide;
varying float vInt;
varying float vDeep;
void main() {
	float v = abs(vSide);
	float glow = pow(max(1.0 - v, 0.0), 1.6);
	float core = smoothstep(0.42, 0.06, v);
	vec3 halo = mix(vec3(0.10, 0.30, 1.0), vec3(0.05, 0.70, 0.95), vDeep);
	vec3 col = mix(halo, vec3(0.93, 0.98, 1.0), core * (1.0 - vDeep * 0.45));
	float a = clamp((glow * 0.85 + core * 0.55) * vInt, 0.0, 1.0);
	if (a < 0.004) discard;
	gl_FragColor = vec4(col * a, a * 0.72);
}
`;

// ---------------------------------------------------------------------------------------------
// EXTENSIONS (levels 2-5): four more pooled draw calls, all closed-form in the vertex shader.
//   fx-xparticles : billboards with real linear drag (terminal velocity), a "stop time" (land / reach the
//                   surface), wobble, delayed start, and more shapes (bubble, heart, z, star, ember ...)
//   fx-flakes     : true 3D tumbling quads / triangles: glass shards and confetti (land, skip, lie flat)
//   fx-xrings     : oriented rings (horizontal or upright, stretched; foam / impact / sense styles)
//   fx-ambient    : heat shimmer cards + the drifting motes of spotDust
// Each is hidden (no draw call) while it has nothing alive.
// ---------------------------------------------------------------------------------------------

const MAX_XP = 1536;
const XP_STRIDE = 24; // 6 x vec4
const MAX_CONFETTI = 300;
const MAX_SHARDS = 128;
const MAX_FLAKES = MAX_CONFETTI + MAX_SHARDS;
const FL_STRIDE = 24; // 6 x vec4
const MAX_XRINGS = 64;
const XR_STRIDE = 20; // 5 x vec4
const MAX_HEAT = 8;
const MAX_MOTES = 256;
const AMB_STRIDE = 8; // 2 x vec4
const FLAKE_HOP = 0.26; // seconds a shard skips after its first touch-down
const NEVER = 1e9;

// extended particle shapes
const X_SOFT = 0, X_DROP = 1, X_BUBBLE = 2, X_HEART = 3, X_ZED = 4, X_STAR = 5, X_EMBER = 6, X_SHEET = 7,
	X_GRAIN = 8, X_FOAM = 9;
// extended ring styles
const R_CLEAN = 0, R_FOAM = 1, R_IMPACT = 2, R_SENSE = 3, R_FROTH = 4, R_HALO = 5;

const XP_VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aPos;  // spawn xyz, start time (may be in the future: delayed start)
attribute vec4 aVel;  // velocity xyz, life
attribute vec4 aParm; // size0, size1, gravity, drag (linear: terminal velocity = gravity / drag)
attribute vec4 aCol;  // rgb, additive 0..1
attribute vec4 aMisc; // shape, stretch | spin | sway, rotation, alpha
attribute vec4 aExt;  // stop time (motion freezes at this age), wobble amplitude, wobble frequency, seed
varying vec2 vUv;
varying vec4 vCol;
varying float vA;
varying float vShape;
varying float vSeed;
void main() {
	vUv = position.xy;
	vCol = aCol;
	vShape = aMisc.x;
	vSeed = aExt.w;
	vA = 0.0;
	float age = uTime - aPos.w;
	float life = aVel.w;
	float u = age / max(life, 1e-4);
	if (life <= 0.0 || u < 0.0 || u >= 1.0) {
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		return;
	}
	float shape = aMisc.x;
	float tm = min(age, aExt.x);
	float k = max(aParm.w, 0.05);
	float dec = exp(-k * tm);
	vec3 vt = vec3(0.0, aParm.z / k, 0.0);
	vec3 p = aPos.xyz + (aVel.xyz - vt) * ((1.0 - dec) / k) + vt * tm;
	vec3 vel = (aVel.xyz - vt) * dec + vt;

	float ph = aExt.w * 6.2831853;
	float wob = aExt.y * min(tm * 2.5, 1.0);
	vec2 wd = vec2(cos(ph * 5.0), sin(ph * 5.0));
	float wa = sin(tm * aExt.z + ph);
	float wb = cos(tm * aExt.z * 0.63 + ph * 2.0) * 0.5;
	p.xz += (wd * wa + vec2(-wd.y, wd.x) * wb) * wob;

	float ease = 1.0 - (1.0 - u) * (1.0 - u);
	float size = mix(aParm.x, aParm.y, ease);
	float a = aMisc.w;
	vec3 col = aCol.rgb;
	float ang = aMisc.z;
	float stretch = 0.0;
	if (shape < 0.5) {            // soft mote
		a *= smoothstep(0.0, 0.1, u) * pow(1.0 - u, 1.35);
	} else if (shape < 1.5) {     // droplet
		a *= smoothstep(0.0, 0.03, u) * (1.0 - smoothstep(0.9, 1.0, u));
		stretch = aMisc.y;
	} else if (shape < 2.5) {     // bubble: wobbles, swells and pops at the very end
		size = mix(aParm.x, aParm.y, u) * (1.0 + 0.07 * sin(age * 9.0 + ph)) * (1.0 + 0.9 * smoothstep(0.955, 1.0, u));
		a *= smoothstep(0.0, 0.03, u) * (1.0 - smoothstep(0.965, 1.0, u));
	} else if (shape < 3.5) {     // heart: pops in, sways
		size *= 1.0 + 0.3 * sin(min(u * 7.0, 1.0) * 3.14159265);
		a *= smoothstep(0.0, 0.06, u) * (1.0 - smoothstep(0.6, 1.0, u));
		ang += sin(age * 2.3 + ph) * aMisc.y;
	} else if (shape < 4.5) {     // z
		a *= smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.55, 1.0, u));
		ang += sin(age * 1.7 + ph) * aMisc.y;
	} else if (shape < 5.5) {     // twinkling star
		float tw = 0.55 + 0.45 * sin(age * (14.0 + 10.0 * aExt.w) + ph * 3.0);
		a *= pow(max(sin(3.14159265 * u), 0.0), 0.6) * tw;
		ang += age * aMisc.y;
	} else if (shape < 6.5) {     // ember: flickers and cools
		float fl = 0.62 + 0.38 * sin(age * (17.0 + 13.0 * aExt.w) + ph * 4.0);
		a *= smoothstep(0.0, 0.08, u) * pow(1.0 - u, 0.8) * fl;
		col = mix(col, vec3(0.78, 0.10, 0.02), smoothstep(0.25, 1.0, u));
		stretch = aMisc.y;
	} else if (shape < 7.5) {     // water sheet / streak
		a *= smoothstep(0.0, 0.05, u) * (1.0 - smoothstep(0.82, 1.0, u));
		stretch = aMisc.y;
	} else if (shape < 8.5) {     // grain / chip: tumbles until it lands
		a *= 1.0 - smoothstep(0.72, 1.0, u);
		ang += tm * aMisc.y;
	} else {                      // foam blob
		a *= smoothstep(0.0, 0.08, u) * pow(1.0 - u, 1.2);
	}
	vA = a;
	vCol = vec4(col, aCol.a);

	vec4 mv = viewMatrix * vec4(p, 1.0);
	vec2 c = position.xy;
	vec2 off;
	if (stretch > 0.0) {
		vec2 vv = (viewMatrix * vec4(vel, 0.0)).xy;
		float spd = age > aExt.x ? 0.0 : length(vv);
		vec2 ax = spd > 1e-4 ? vv / spd : vec2(1.0, 0.0);
		float len = 1.0 + stretch * spd;
		off = (ax * c.x * len + vec2(-ax.y, ax.x) * c.y) * size;
	} else {
		float ca = cos(ang);
		float sa = sin(ang);
		off = vec2(c.x * ca - c.y * sa, c.x * sa + c.y * ca) * size;
	}
	mv.xy += off;
	gl_Position = projectionMatrix * mv;
}
`;

const XP_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vCol;
varying float vA;
varying float vShape;
varying float vSeed;
void main() {
	float r = length(vUv);
	vec3 col = vCol.rgb;
	float a;
	if (vShape < 0.5) {            // soft mote
		a = smoothstep(1.0, 0.0, r);
		a *= a;
	} else if (vShape < 1.5) {     // droplet: darker refracting rim, bright body, hot highlight
		a = smoothstep(1.0, 0.78, r);
		float hl = smoothstep(0.5, 0.0, length(vUv - vec2(-0.28, 0.36)));
		float rim = smoothstep(0.45, 0.95, r);
		col = col * (1.0 - 0.3 * rim) + vec3(hl * 0.7) + vec3(0.12) * smoothstep(0.6, 0.0, length(vUv - vec2(0.3, -0.4)));
	} else if (vShape < 2.5) {     // bubble: thin bright film, two highlights
		float rim = smoothstep(0.62, 0.9, r) * smoothstep(1.0, 0.9, r);
		float hl = smoothstep(0.34, 0.0, length(vUv - vec2(-0.36, 0.4)));
		float hl2 = smoothstep(0.22, 0.0, length(vUv - vec2(0.42, -0.46))) * 0.5;
		float film = smoothstep(1.0, 0.9, r) * 0.13;
		a = clamp(rim * 0.8 + film + hl + hl2, 0.0, 1.0);
		col = mix(col, vec3(1.0), clamp(hl + hl2 + rim * 0.35, 0.0, 1.0));
	} else if (vShape < 3.5) {     // heart
		vec2 q = vec2(vUv.x * 1.25, vUv.y * 1.25 + 0.15);
		float d2 = dot(q, q) - 1.0;
		float f = d2 * d2 * d2 - q.x * q.x * q.y * q.y * q.y;
		a = smoothstep(0.07, -0.07, f);
		float hl = smoothstep(0.42, 0.0, length(vUv - vec2(-0.36, 0.34)));
		col = col * (0.82 + 0.18 * smoothstep(-0.8, 0.6, vUv.y)) + vec3(hl * 0.5);
		col = mix(col * 0.72, col, smoothstep(-0.02, -0.5, f));
	} else if (vShape < 4.5) {     // the letter z, with a soft dark halo so it reads on any background
		float bar = max(smoothstep(0.21, 0.13, abs(vUv.y - 0.6)), smoothstep(0.21, 0.13, abs(vUv.y + 0.6)))
			* smoothstep(0.72, 0.62, abs(vUv.x));
		float dg = smoothstep(0.2, 0.12, abs(vUv.x - vUv.y) * 0.7071) * smoothstep(0.78, 0.68, abs(vUv.y))
			* smoothstep(0.72, 0.62, abs(vUv.x));
		float z = max(bar, dg);
		float halo = smoothstep(1.0, 0.25, r) * 0.2;
		col = mix(vec3(0.16, 0.2, 0.45), col, z);
		a = max(z, halo);
	} else if (vShape < 5.5) {     // four-point star
		float g = max(1.0 - r, 0.0);
		float ax = abs(vUv.x);
		float ay = abs(vUv.y);
		float flare = max(0.0, 1.0 - ax * 7.0) * max(0.0, 1.0 - ay) + max(0.0, 1.0 - ay * 7.0) * max(0.0, 1.0 - ax);
		a = g * g * g * 1.4 + flare * flare * 0.9;
		col = mix(col, vec3(1.0), clamp(g * g * 1.6 + flare * 0.3, 0.0, 1.0));
	} else if (vShape < 6.5) {     // ember
		float g = smoothstep(1.0, 0.0, r);
		col = mix(col, vec3(1.0, 0.95, 0.75), g * g * 0.8);
		a = pow(g, 1.3);
	} else if (vShape < 7.5) {     // water sheet: long, thin-edged, bright spine
		float spine = pow(max(1.0 - abs(vUv.y), 0.0), 1.6);
		a = spine * smoothstep(1.0, 0.35, abs(vUv.x)) * 0.9;
		col = mix(col * 0.88, vec3(1.0), spine * spine * 0.7);
	} else if (vShape < 8.5) {     // grain / chip: hard, slightly angular, shaded
		float d = max(abs(vUv.x) * 0.8 + abs(vUv.y) * 0.45, r * 0.9);
		a = smoothstep(1.0, 0.8, d);
		col *= 0.78 + 0.3 * smoothstep(-0.6, 0.7, vUv.y - vUv.x * 0.3);
	} else {                       // foam blob with a lumpy edge
		float an = atan(vUv.y, vUv.x);
		float lump = sin(an * 5.0 + vSeed * 40.0) * 0.1 + sin(an * 9.0 - vSeed * 70.0) * 0.06;
		a = smoothstep(0.95, 0.5, r + lump);
		a *= 0.75 + 0.25 * smoothstep(0.9, 0.2, r);
	}
	a = clamp(a * vA, 0.0, 1.0);
	if (a < 0.004) discard;
	gl_FragColor = vec4(col * a, a * (1.0 - vCol.a));
}
`;

const FLAKE_VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aPos;  // spawn xyz, start time
attribute vec4 aVel;  // velocity xyz, life
attribute vec4 aPhys; // gravity, drag, landing time, hop height (0 = settles softly, no skip)
attribute vec4 aRot;  // spin-axis azimuth, spin-axis y, spin rate, start angle
attribute vec4 aCol;  // rgb, kind (0 glass, 1 paper, 2 foil)
attribute vec4 aShp;  // half size x, half size y, seed, flutter amplitude
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
varying vec4 vCol;
varying float vA;

float fh(float n) { return fract(sin(n) * 43758.5453123); }
vec3 rod(vec3 v, vec3 ax, float c, float s) {
	return v * c + cross(ax, v) * s + ax * (dot(ax, v) * (1.0 - c));
}
// ragged outline of a shard: every corner pulled in / pushed sideways by its own hash
vec2 shardCorner(vec2 c, float seed) {
	float cid = (c.x * 0.5 + 0.5) + (c.y + 1.0);
	vec2 d = c * (0.42 + 0.58 * fh(seed * 91.7 + cid * 17.3));
	d.x += (fh(seed * 37.1 + cid * 5.1) - 0.5) * 0.55;
	return d;
}
void main() {
	vUv = position.xy;
	vCol = aCol;
	vA = 0.0;
	vN = vec3(0.0, 1.0, 0.0);
	vW = vec3(0.0);
	float age = uTime - aPos.w;
	float life = aVel.w;
	if (life <= 0.0 || age < 0.0 || age >= life) {
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		return;
	}
	float seed = aShp.z;
	float tL = aPhys.z;
	float hopH = aPhys.w;
	float hops = step(0.0005, hopH);
	float tm = min(age, tL);
	float k = max(aPhys.y, 0.05);
	float dec = exp(-k * tm);
	vec3 vt = vec3(0.0, aPhys.x / k, 0.0);
	vec3 p = aPos.xyz + (aVel.xyz - vt) * ((1.0 - dec) / k) + vt * tm;
	vec3 vel = (aVel.xyz - vt) * dec + vt;

	// paper flutter: a sideways sway that builds up as the piece slows down
	float ph = seed * 6.2831853;
	float fe = aShp.w * (1.0 - exp(-1.5 * tm));
	float ff = 3.0 + 4.0 * fh(seed + 1.3);
	vec2 fd = vec2(cos(ph * 7.0), sin(ph * 7.0));
	p.xz += fd * (sin(tm * ff + ph) * fe) + vec2(-fd.y, fd.x) * (sin(tm * ff * 0.57 + ph * 3.0) * fe * 0.6);

	// after touch-down: one small skip and a short slide, then rest
	float post = max(age - tL, 0.0);
	float s = clamp(post / ${FLAKE_HOP.toFixed(2)}, 0.0, 1.0);
	p.y += hopH * 4.0 * s * (1.0 - s);
	p.xz += vel.xz * (hopH * 1.3) * (1.0 - exp(-post * 6.0));

	// outline
	vec2 c = position.xy;
	vec2 d = c;
	if (aCol.w < 0.5) {
		d = shardCorner(c, seed);
		if (c.x > 0.0 && c.y > 0.0 && fh(seed * 13.7) > 0.4) {
			d = shardCorner(vec2(1.0, -1.0), seed); // collapse a corner: this one is a triangle
			vUv = vec2(1.0, -1.0);
		}
	}
	vec3 l = vec3(d.x * aShp.x, 0.0, d.y * aShp.y);

	// tumble about a fixed axis; when it lands it turns flat
	float el = clamp(aRot.y, -0.98, 0.98);
	float er = sqrt(1.0 - el * el);
	vec3 axis = vec3(er * cos(aRot.x), el, er * sin(aRot.x));
	float ang = aRot.w + aRot.z * min(age, tL + ${FLAKE_HOP.toFixed(2)} * hops);
	ang += sin(tm * ff * 1.3 + ph * 2.0) * aShp.w * 6.0;
	float ca = cos(ang);
	float sa = sin(ang);
	vec3 lt = rod(l, axis, ca, sa);
	vec3 nt = rod(vec3(0.0, 1.0, 0.0), axis, ca, sa);
	float cy = cos(ph * 3.0);
	float sy = sin(ph * 3.0);
	vec3 lf = vec3(l.x * cy + l.z * sy, 0.004 + 0.004 * fh(seed * 7.0), -l.x * sy + l.z * cy);
	float lay0 = mix(0.0, ${(FLAKE_HOP * 0.55).toFixed(3)}, hops);
	float lay1 = mix(0.14, ${FLAKE_HOP.toFixed(2)}, hops);
	float f = smoothstep(lay0, lay1, post);
	vec3 lw = mix(lt, lf, f);
	vN = normalize(mix(nt, vec3(0.0, 1.0, 0.0), f) + vec3(1e-4, 0.0, 0.0));
	p += lw;
	vW = p;

	float fadeDur = min(0.9, life * 0.4);
	vA = 1.0 - smoothstep(life - fadeDur, life, age);
	gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const FLAKE_FRAG = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uGlint;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
varying vec4 vCol;
varying float vA;
void main() {
	vec3 N = normalize(vN);
	vec3 V = normalize(cameraPosition - vW);
	float ndv = abs(dot(N, V));
	vec3 H1 = normalize(uSun + V);
	float nh1 = abs(dot(N, H1));
	vec3 col;
	float a;
	if (vCol.w < 0.5) {
		// glass: nearly clear face-on, bright at grazing angles and along the cut edges,
		// and it FLASHES when the face swings through a mirror angle (sun + an overhead lamp)
		float edge = 1.0 - max(abs(vUv.x), abs(vUv.y));
		float rim = smoothstep(0.2, 0.0, edge);
		float fres = pow(max(1.0 - ndv, 0.0), 3.0);
		vec3 H2 = normalize(vec3(0.22, 0.93, 0.28) + V);
		float nh2 = abs(dot(N, H2));
		float glint = pow(nh1, 90.0) * 2.4 + pow(nh2, 48.0) * 1.1;
		float sheen = pow(nh1, 7.0) * 0.2 + pow(nh2, 5.0) * 0.1;
		a = 0.13 + 0.4 * fres + rim * 0.42 + sheen;
		col = vCol.rgb * (0.4 + 0.6 * fres) + vec3(0.78, 1.0, 0.96) * rim * 0.55 + vec3(sheen);
		col = col * a + uGlint * glint;
		a = clamp(a + glint * 0.5, 0.0, 1.0);
		gl_FragColor = vec4(col * vA, a * vA);
	} else {
		// paper / foil confetti: two-sided, soft wrap lighting, foil pieces sparkle
		float back = dot(N, V) < 0.0 ? 0.8 : 1.0;
		float lam = 0.6 + 0.4 * abs(dot(N, uSun));
		col = vCol.rgb * lam * back;
		float foil = step(1.5, vCol.w);
		col += uGlint * (pow(nh1, 22.0) * 1.3 + (1.0 - ndv) * (1.0 - ndv) * 0.25) * foil;
		col += vec3(0.12) * pow(nh1, 6.0) * (1.0 - foil);
		gl_FragColor = vec4(col * vA, vA);
	}
}
`;

const XRING_VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aRing;  // centre xyz, start time (may be in the future)
attribute vec4 aRing2; // life, r0, r1, thickness (fraction of radius)
attribute vec4 aRCol;  // rgb, additive
attribute vec4 aRExt;  // yaw, stretch along the forward axis, style, alpha
attribute vec4 aRExt2; // upright 0/1, seed, hold 0/1, unused
varying vec2 vUv;
varying vec4 vCol;
varying float vFade;
varying float vThick;
varying float vStyle;
varying float vSeed;
varying float vU;
void main() {
	vUv = position.xy * 1.3;
	vCol = aRCol;
	vThick = aRing2.w;
	vStyle = aRExt.z;
	vSeed = aRExt2.y;
	vFade = 0.0;
	vU = 0.0;
	float age = uTime - aRing.w;
	float u = age / max(aRing2.x, 1e-4);
	if (aRing2.x <= 0.0 || u < 0.0 || u >= 1.0) {
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		return;
	}
	vU = u;
	float e = 1.0 - (1.0 - u) * (1.0 - u);
	float rad = mix(aRing2.y, aRing2.z, e);
	float fadeA = smoothstep(0.0, 0.08, u) * pow(1.0 - u, 1.4);
	float fadeB = smoothstep(0.0, 0.1, u) * (1.0 - smoothstep(0.8, 1.0, u)) * (0.8 + 0.2 * sin(age * 3.0 + aRExt2.y * 6.0));
	vFade = mix(fadeA, fadeB, aRExt2.z) * aRExt.w;
	float sy = sin(aRExt.x);
	float cy = cos(aRExt.x);
	vec3 fwd = vec3(sy, 0.0, cy);
	vec3 side = vec3(cy, 0.0, -sy);
	float st = max(aRExt.y, 0.05);
	vec3 p;
	if (aRExt2.x > 0.5) {
		// upright ring whose axis is the forward direction
		p = aRing.xyz + (side * position.x + vec3(0.0, position.y, 0.0)) * rad * 1.3;
	} else {
		// flat ring; stretching keeps the rear edge where it was, so it reaches FORWARD
		p = aRing.xyz + (fwd * (position.x * st * 1.3 + (st - 1.0)) + side * (position.y * 1.3)) * rad;
	}
	gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const XRING_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vCol;
varying float vFade;
varying float vThick;
varying float vStyle;
varying float vSeed;
varying float vU;
void main() {
	float r = length(vUv);
	float an = atan(vUv.y, vUv.x);
	vec3 col = vCol.rgb;
	float a;
	if (vStyle < 0.5) {            // clean ripple ring
		float band = smoothstep(1.0, 0.0, abs(r - 1.0) / vThick);
		band = band * band * (3.0 - 2.0 * band);
		float echo = smoothstep(1.0, 0.0, abs(r - 0.66) / (vThick * 0.7)) * 0.28;
		a = band + echo;
		col = mix(col, vec3(1.0), band * band * 0.4);
	} else if (vStyle < 1.5) {     // foam ring: lumpy, broken, lacy
		float s = vSeed * 6.2831853;
		float n1 = sin(an * 7.0 + s) * 0.5 + sin(an * 13.0 - s * 1.7 + r * 3.0) * 0.3 + sin(an * 29.0 + s * 2.3) * 0.2;
		float n2 = sin(an * 5.0 - s * 0.7) * 0.6 + sin(an * 17.0 + s * 3.1 + vU * 4.0) * 0.4;
		float rr = r - n1 * 0.035;
		float band = smoothstep(1.0, 0.0, abs(rr - 1.0) / (vThick * (0.75 + 0.35 * n2)));
		float gaps = smoothstep(-0.75, 0.1, n2 + (1.0 - vU) * 0.8);
		float lace = smoothstep(1.0, 0.0, abs(rr - 0.8) / (vThick * 0.5)) * 0.35 * smoothstep(-0.2, 0.6, n1);
		a = band * gaps + lace;
	} else if (vStyle < 2.5) {     // impact: razor ring, radial streaks, a flash that dies fast
		float band = smoothstep(1.0, 0.0, abs(r - 1.0) / vThick);
		band *= band;
		float spk = pow(max(sin(an * 9.0 + vSeed * 20.0), 0.0), 10.0) + pow(max(sin(an * 5.0 - vSeed * 31.0), 0.0), 16.0) * 0.7;
		float streak = spk * smoothstep(0.35, 0.95, r) * smoothstep(1.28, 1.0, r);
		float flash = smoothstep(0.9, 0.0, r) * max(1.0 - vU * 3.5, 0.0) * 0.8;
		a = band + streak * 0.9 + flash;
		col = mix(col, vec3(1.0), clamp(band * 0.6 + flash, 0.0, 1.0));
	} else if (vStyle < 3.5) {     // electro-sense: nested arcs, strongest toward the forward (+x) side
		float dash = 0.72 + 0.28 * sin(an * 38.0 + vSeed * 9.0 - vU * 14.0);
		float b1 = smoothstep(1.0, 0.0, abs(r - 1.0) / vThick);
		float b2 = smoothstep(1.0, 0.0, abs(r - 0.72) / (vThick * 0.8)) * 0.55;
		float b3 = smoothstep(1.0, 0.0, abs(r - 0.44) / (vThick * 0.7)) * 0.3;
		float fw = 0.3 + 0.7 * smoothstep(-0.7, 0.85, vUv.x / max(r, 1e-3));
		a = (b1 * b1 + b2 + b3) * dash * fw + 0.05 * smoothstep(1.0, 0.2, r) * fw;
		col = mix(col, vec3(1.0), b1 * b1 * 0.55);
	} else if (vStyle < 4.5) {     // froth: a churned white disc
		float s = vSeed * 6.2831853;
		float lump = sin(an * 6.0 + s) * 0.07 + sin(an * 11.0 - s * 2.0) * 0.05;
		float body = smoothstep(1.0, 0.72, r + lump);
		float cells = 0.62 + 0.38 * sin(vUv.x * 9.0 + s) * sin(vUv.y * 9.0 - s * 1.3);
		a = body * cells * (0.55 + 0.45 * smoothstep(0.2, 0.9, r));
	} else {                       // halo: soft steady hoop
		float band = smoothstep(1.0, 0.0, abs(r - 1.0) / vThick);
		a = band * band * (0.8 + 0.2 * sin(an * 3.0 + vSeed * 6.0 + vU * 20.0));
		col = mix(col, vec3(1.0), band * band * 0.3);
	}
	a = clamp(a * vFade, 0.0, 1.0);
	if (a < 0.004) discard;
	gl_FragColor = vec4(col * a, a * (1.0 - vCol.a));
}
`;

const AMB_VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
uniform float uMote;
attribute vec4 aA; // heat: centre xyz, 0     | mote: seed xyz (0..1), 1
attribute vec4 aB; // heat: w, h, seed, alpha | mote: size, rate, phase, alpha
varying vec2 vUv;
varying float vKind;
varying float vA;
varying float vSeed;
float ah(float n) { return fract(sin(n) * 43758.5453123); }
void main() {
	vUv = position.xy;
	vKind = aA.w;
	vSeed = aB.z;
	vA = 0.0;
	if (aA.w < 0.5) {
		if (aB.w <= 0.0) {
			gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
			return;
		}
		// upright card that turns about Y to face the camera
		vec3 toCam = cameraPosition - aA.xyz;
		toCam.y = 0.0;
		float l = length(toCam);
		vec3 right = l > 1e-4 ? vec3(toCam.z, 0.0, -toCam.x) / l : vec3(1.0, 0.0, 0.0);
		vec3 p = aA.xyz + right * (position.x * aB.x * 0.5) + vec3(0.0, position.y * aB.y * 0.5, 0.0);
		vA = aB.w;
		gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
	} else {
		if (uMote <= 0.002) {
			gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
			return;
		}
		// a mote drifts on its own slow heading and wraps inside the box (faded at the faces)
		vec3 vel = (vec3(ah(aB.z * 3.1 + 0.2), ah(aB.z * 7.7 + 1.1), ah(aB.z * 5.3 + 2.4)) - 0.5) * vec3(0.11, 0.05, 0.11);
		vel.y += 0.012;
		vec3 q = aA.xyz + vel * uTime / max(uBoxSize, vec3(0.5));
		q.x += sin(uTime * 0.31 + aB.z * 20.0) * 0.012;
		q.z += cos(uTime * 0.27 + aB.z * 31.0) * 0.012;
		q = fract(q);
		vec3 ef = smoothstep(vec3(0.0), vec3(0.09), q) * (1.0 - smoothstep(vec3(0.91), vec3(1.0), q));
		float tw = 0.5 + 0.5 * sin(uTime * (0.5 + aB.y * 1.9) + aB.z * 40.0);
		vA = aB.w * ef.x * ef.y * ef.z * (0.35 + 0.65 * tw * tw) * uMote;
		vec4 mv = viewMatrix * vec4(uBoxMin + q * uBoxSize, 1.0);
		mv.xy += position.xy * aB.x;
		gl_Position = projectionMatrix * mv;
	}
}
`;

const AMB_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vKind;
varying float vA;
varying float vSeed;
void main() {
	if (vKind < 0.5) {
		// heat shimmer without refraction: thin wavering streaks of warm light climbing the card
		float y01 = vUv.y * 0.5 + 0.5;
		float t = uTime;
		float w1 = sin(vUv.x * 9.0 + sin(vUv.y * 5.0 - t * 2.6 + vSeed) * 1.7 + vSeed * 3.0);
		float w2 = sin(vUv.x * 17.0 - sin(vUv.y * 8.0 - t * 3.7 + vSeed * 2.0) * 1.3 + t * 0.6);
		float s1 = 1.0 - abs(w1);
		float s2 = 1.0 - abs(w2);
		s1 *= s1;
		s1 *= s1 * s1;
		s2 *= s2;
		s2 *= s2;
		s2 *= s2;
		float env = 1.0 - vUv.x * vUv.x;
		env *= env * smoothstep(0.0, 0.14, y01) * pow(max(1.0 - y01, 0.0), 1.3);
		float a = (s1 * 0.6 + s2 * 0.4 + 0.12) * env * vA;
		if (a < 0.003) discard;
		vec3 col = mix(vec3(1.0, 0.42, 0.10), vec3(1.0, 0.80, 0.52), y01);
		gl_FragColor = vec4(col * a, 0.0);
	} else {
		float r = length(vUv);
		float a = smoothstep(1.0, 0.0, r);
		a = a * a * vA;
		if (a < 0.003) discard;
		gl_FragColor = vec4(vec3(1.0, 0.96, 0.86) * a, a * 0.15);
	}
}
`;

// ---------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------
// EXTENSIONS (levels 6-11, LEVELS2.md B4): seven more pooled draw calls, each hidden while idle.
//   fx-lines  : camera-facing ribbons between two world points (bullet tracers, aim telegraphs)
//   fx-ground : flat ground decals (danger zones, crack decals, travelling dust / scream rings, glow and
//               mist discs)
//   fx-cards  : upright cards (beacon pillars, guide gates, light shafts, mist, flames, halos)
//   fx-scream : the two air-distortion shells of the scream
//   fx-swirl  : the counter-rotating light ribbons of the transformation
//   fx-air    : things that live in the air around the camera (dream motes, fireflies, wind streaks)
//   fx-birds  : a flock of flapping chevrons
// Everything else in B4 is built from the existing pooled particles, rings and flakes.
// ---------------------------------------------------------------------------------------------

const MAX_TRACERS = 32;
const MAX_TELEGRAPHS = 8;
const MAX_LINES = MAX_TRACERS + MAX_TELEGRAPHS;
const LN_STRIDE = 16; // 4 x vec4
const L_TRACER = 0, L_TELEGRAPH = 1;

const GD_STRIDE = 20; // 5 x vec4
const MAX_DANGER = 8;
const MAX_CRACKS = 6;
const MAX_SHOCKRINGS = 6;
const MAX_GLOWS = 22; // persistent glow discs: 6 camp fires + 8 beacons + 8 spare
const MAX_GTRANS = 22; // transient discs / rings, round robin
const GD_DANGER0 = 0;
const GD_CRACK0 = GD_DANGER0 + MAX_DANGER;
const GD_SHOCK0 = GD_CRACK0 + MAX_CRACKS;
const GD_GLOW0 = GD_SHOCK0 + MAX_SHOCKRINGS;
const GD_TRANS0 = GD_GLOW0 + MAX_GLOWS;
const MAX_GROUND = GD_TRANS0 + MAX_GTRANS;
// ground styles
const G_CIRCLE = 0, G_CONE = 1, G_LINE = 2, G_RING = 3, G_CRACK = 4, G_DUST = 5, G_GLOW = 6, G_MIST = 7, G_SCREAM = 8;
const DANGER_FLASH = 0.1; // seconds of white flash after a danger zone has filled

const CD_STRIDE = 16; // 4 x vec4
const MAX_BEACONS = 8;
const MAX_GATES = 16;
const MAX_SHAFTS = 8;
const MAX_MIST = 10;
const MAX_CAMPFIRES = 6;
const CAMP_CARDS = 5;
const MAX_TORCHES = 8;
const TORCH_CARDS = 3; // two flames + a halo
const CD_BEACON0 = 0;
const CD_GATE0 = CD_BEACON0 + MAX_BEACONS;
const CD_SHAFT0 = CD_GATE0 + MAX_GATES;
const CD_MIST0 = CD_SHAFT0 + MAX_SHAFTS;
const CD_CAMP0 = CD_MIST0 + MAX_MIST;
const CD_TORCH0 = CD_CAMP0 + MAX_CAMPFIRES * CAMP_CARDS;
const MAX_CARDS = CD_TORCH0 + MAX_TORCHES * TORCH_CARDS;
// card styles
const C_PILLAR = 0, C_GATE = 1, C_SHAFT = 2, C_MIST = 3, C_FLAME = 4, C_HALO = 5;
const GATE_BURST = 0.6; // seconds a guide ring takes to burst after pass()

const MAX_SWIRLS = 6;
const SW_STRIDE = 8;
const SWIRL_SEGS = 56;

const AIR_DREAM = 160;
const AIR_FLIES = 64;
const AIR_WIND = 48;
const AIR_COUNT = AIR_DREAM + AIR_FLIES + AIR_WIND;
const AIR_STRIDE = 8;

const MAX_BIRDS = 48;
const BD_STRIDE = 12;

const MAX_GLOBS = 8;
const SCREAM_SPEED = 24; // m/s, the ground ring of the scream
const SHOCK_RECOVER = 3; // seconds the flattened foliage takes to spring back

const LINE_VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aA; // from xyz, start time
attribute vec4 aB; // to xyz, life
attribute vec4 aC; // rgb, style (0 tracer, 1 telegraph)
attribute vec4 aD; // half width, speed, seed, alpha
varying vec2 vUv;
varying vec4 vCol;
varying float vA;
varying float vLen;
varying float vU;
void main() {
	vUv = position.xy;
	vCol = aC;
	vA = 0.0;
	vLen = 1.0;
	vU = 0.0;
	float age = uTime - aA.w;
	float life = aB.w;
	if (life <= 0.0 || age < 0.0 || age >= life) {
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		return;
	}
	vec3 d = aB.xyz - aA.xyz;
	float dist = max(length(d), 1e-3);
	vec3 dir = d / dist;
	float u = age / life;
	float a0 = 0.0;
	float a1 = dist;
	float al = aD.w;
	if (aC.w < 0.5) {
		// a streak whose head travels the segment at aD.y m/s
		float sl = clamp(aD.y * 0.045, 0.8, 5.0);
		float hd = aD.y * age;
		a1 = min(hd, dist);
		a0 = clamp(hd - sl, 0.0, dist);
		al *= smoothstep(0.0, 0.3, (a1 - a0) / sl + 0.04);
	} else {
		// the aim line: blinks faster and brighter as the shot comes
		float ph = 6.2831853 * (2.2 * age + 5.5 * age * u);
		float blink = 0.5 + 0.5 * sin(ph);
		al *= mix(0.3, 1.0, u) * mix(0.35 + 0.65 * blink, 1.0, smoothstep(0.9, 1.0, u)) * smoothstep(0.0, 0.07, age);
	}
	vU = u;
	vLen = a1 - a0;
	float s = position.x * 0.5 + 0.5;
	vec3 p = aA.xyz + dir * mix(a0, a1, s);
	vec3 toCam = cameraPosition - p;
	vec3 side = cross(dir, toCam);
	float sl2 = length(side);
	side = sl2 > 1e-5 ? side / sl2 : vec3(1.0, 0.0, 0.0);
	float w = max(aD.x, length(toCam) * 0.0019); // never thinner than about a pixel and a half
	p += side * (position.y * w);
	vA = al;
	gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const LINE_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec4 vCol;
varying float vA;
varying float vLen;
varying float vU;
void main() {
	float across = max(1.0 - abs(vUv.y), 0.0);
	float core = across * across;
	float s = vUv.x * 0.5 + 0.5;
	vec3 col = vCol.rgb;
	float a;
	float solid;
	if (vCol.w < 0.5) {
		float taper = s * s;
		float tip = smoothstep(1.0, 0.9, s);
		a = (core * 1.2 + across * 0.25) * taper * tip;
		col = mix(col, vec3(1.0), clamp(core * s * 1.2, 0.0, 1.0));
		solid = 0.25;
	} else {
		float dash = 0.62 + 0.38 * step(0.5, fract(s * vLen * 2.2 - uTime * 2.5));
		float ends = smoothstep(0.0, 0.03, s);
		a = (core + across * 0.3) * dash * ends;
		col = mix(col, vec3(1.0, 0.85, 0.8), core * core * (0.35 + 0.45 * vU));
		solid = 0.6;
	}
	a = clamp(a * vA, 0.0, 1.0);
	if (a < 0.004) discard;
	gl_FragColor = vec4(col * a, a * solid);
}
`;

const GROUND_VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aA; // centre xyz, start time
attribute vec4 aB; // life, half extent of the quad (m), yaw, style
attribute vec4 aC; // rgb, alpha
attribute vec4 aD; // style parameters (see the fragment shader)
attribute vec4 aE; // seed, fill seconds | fade-in seconds, additive 0..1, spare
varying vec2 vP;
varying vec4 vCol;
varying vec4 vD;
varying vec4 vE;
varying float vStyle;
varying float vAge;
varying float vU;
void main() {
	vP = position.xy * aB.y;
	vCol = aC;
	vD = aD;
	vE = aE;
	vStyle = aB.w;
	vAge = 0.0;
	vU = 0.0;
	float age = uTime - aA.w;
	float life = aB.x;
	if (life <= 0.0 || age < 0.0 || age >= life || aC.w <= 0.0) {
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		return;
	}
	vAge = age;
	vU = age / life;
	float sy = sin(aB.z);
	float cy = cos(aB.z);
	// local +y is "forward" (sin yaw, cos yaw), local +x is its right-hand side
	vec3 p = aA.xyz + vec3(sy, 0.0, cy) * vP.y + vec3(cy, 0.0, -sy) * vP.x;
	gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const GROUND_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vP;
varying vec4 vCol;
varying vec4 vD;
varying vec4 vE;
varying float vStyle;
varying float vAge;
varying float vU;
float gh(float n) { return fract(sin(n) * 43758.5453123); }
void main() {
	float r = length(vP);
	float an = atan(vP.x, vP.y); // 0 = forward
	float seed = vE.x;
	vec3 col = vCol.rgb;
	float a = 0.0;
	float add = vE.z;
	if (vStyle < 3.5) {
		// ---- danger zones: D = (radius, half arc, length, width). The fill sweeps over vE.y seconds,
		// then the whole shape flashes white for a moment.
		float fillT = max(vE.y, 1e-3);
		float k = clamp(vAge / fillT, 0.0, 1.0);
		float flash = step(fillT, vAge);
		float inside;
		float edge;
		float fill;
		float e = 0.035 + 0.012 * vD.x;
		if (vStyle < 0.5) {            // circle
			inside = smoothstep(vD.x, vD.x - 0.03, r);
			edge = smoothstep(e, 0.0, abs(r - vD.x + e * 0.5));
			fill = smoothstep(vD.x * k, vD.x * k - 0.06, r) * inside;
			edge += smoothstep(0.05, 0.0, abs(r - vD.x * k)) * inside * 0.6;
		} else if (vStyle < 1.5) {     // cone, apex at the centre
			float da = (vD.y - abs(an)) * max(r, 0.05); // metres to the nearest side
			inside = smoothstep(0.0, 0.03, da) * smoothstep(vD.x, vD.x - 0.03, r);
			edge = max(smoothstep(e, 0.0, abs(da - e * 0.5)) * step(r, vD.x), smoothstep(e, 0.0, abs(r - vD.x + e * 0.5)) * step(0.0, da));
			fill = smoothstep(vD.x * k, vD.x * k - 0.06, r) * inside;
			edge += smoothstep(0.05, 0.0, abs(r - vD.x * k)) * inside * 0.6;
		} else if (vStyle < 2.5) {     // line: a lane from the centre forward
			float hw = vD.w * 0.5;
			float dx = hw - abs(vP.x);
			float dy = min(vP.y, vD.z - vP.y);
			float dd = min(dx, dy);
			inside = smoothstep(0.0, 0.03, dd);
			edge = smoothstep(e, 0.0, abs(dd - e * 0.5)) * step(0.0, dd);
			fill = smoothstep(vD.z * k, vD.z * k - 0.08, vP.y) * inside;
			edge += smoothstep(0.05, 0.0, abs(vP.y - vD.z * k)) * inside * 0.6;
			// chevrons running down the lane
			fill *= 0.8 + 0.2 * step(0.5, fract((vP.y + abs(vP.x) * 0.8) * 0.9 - uTime * 1.6));
		} else {                       // ring (annulus): radius D.x, width D.w
			float hw = vD.w * 0.5;
			float dd = hw - abs(r - vD.x);
			inside = smoothstep(0.0, 0.03, dd);
			edge = smoothstep(e, 0.0, abs(dd - e * 0.5)) * step(0.0, dd);
			float fr = vD.x - hw + vD.w * k;
			fill = smoothstep(fr, fr - 0.06, r) * inside;
			edge += smoothstep(0.05, 0.0, abs(r - fr)) * inside * 0.6;
		}
		float pulse = 0.85 + 0.15 * sin(uTime * 9.0 + k * 9.0);
		a = inside * 0.14 + fill * (0.3 + 0.22 * k) * pulse + edge * (0.65 + 0.35 * k);
		float fl = flash * inside;
		col = mix(col, vec3(1.0), clamp(edge * 0.25 + fl, 0.0, 1.0));
		a = mix(a, 0.95, fl);
		a *= vCol.a;
		add = 0.35;
	} else if (vStyle < 4.5) {       // ---- crack decal: D.x = radius
		float R = vD.x;
		float a2 = an + sin(r * 5.0 / R + seed * 20.0) * 0.1 + sin(r * 14.0 / R + seed * 5.0) * 0.04;
		float nk = 9.0;
		float cell = a2 * nk / 6.2831853 + seed + 0.5;
		float id = floor(cell);
		float c = abs(fract(cell) - 0.5);                 // 0 = on a crack (the middle of its cell)
		float dm = c * (6.2831853 / nk) * r;              // metres to the crack
		float len = R * (0.5 + 0.5 * gh(id * 7.31 + seed * 3.0));
		float wdt = 0.012 + 0.03 * (1.0 - r / R);
		float line = smoothstep(wdt, wdt * 0.25, dm) * smoothstep(len, len * 0.55, r);
		float rr = R * (0.36 + 0.07 * sin(an * 5.0 + seed * 9.0));
		float hoop = smoothstep(0.03, 0.0, abs(r - rr)) * step(0.45, gh(id * 3.7 + seed));
		float soot = smoothstep(R * 0.8, 0.0, r);
		a = clamp(line * 0.8 + hoop * 0.45 + soot * 0.2, 0.0, 1.0);
		a *= vCol.a * smoothstep(0.0, 0.02, vU) * (1.0 - smoothstep(0.65, 1.0, vU));
		add = 0.0;
	} else if (vStyle < 5.5) {       // ---- travelling dust ring: D = (speed, max radius, band width, start radius)
		float R = min(vD.w + vD.x * vAge, vD.y);
		float x = r - R;
		float lump = sin(an * 9.0 + seed * 30.0) * 0.5 + sin(an * 23.0 - seed * 50.0 + vAge * 2.0) * 0.3 + sin(an * 41.0 + seed * 9.0) * 0.2;
		float band = smoothstep(0.3, 0.0, x - lump * 0.12) * smoothstep(-vD.z, -vD.z * 0.15, x + lump * 0.25);
		float front = smoothstep(0.22, 0.0, abs(x - lump * 0.1));
		a = band * (0.5 + 0.3 * lump) + front * 0.5;
		float endF = 1.0 - smoothstep(vD.y * 0.93, vD.y, R);
		a *= vCol.a * smoothstep(0.0, 0.08, vAge) * endF;
		col = mix(col, vec3(1.0), front * 0.35);
	} else if (vStyle < 6.5) {       // ---- glow disc: D = (radius, flicker amount, flicker rate)
		float f = max(1.0 - r / vD.x, 0.0);
		float fl = 1.0 - vD.y * (0.5 + 0.3 * sin(uTime * vD.z + seed * 40.0) + 0.2 * sin(uTime * vD.z * 2.7 + seed * 11.0));
		a = f * f * fl * vCol.a * smoothstep(0.0, max(vE.y, 1e-3), vAge);
		col = mix(col, vec3(1.0), f * f * f * 0.35);
	} else if (vStyle < 7.5) {       // ---- low glowing mist: D.x = radius
		float f = smoothstep(vD.x, vD.x * 0.25, r);
		float sw = sin(an * 3.0 + r * 4.5 - vAge * 1.6 + seed * 6.0) * sin(an * 5.0 - r * 2.0 + vAge * 0.9 + seed * 17.0);
		float grow = smoothstep(0.0, 0.12, vU);
		a = f * (0.55 + 0.45 * sw) * grow * pow(1.0 - vU, 1.3) * vCol.a;
		a *= smoothstep(vD.x * grow + 0.05, vD.x * grow * 0.6, r);
		col = mix(col, vec3(1.0), f * f * 0.25 * (1.0 - vU));
	} else {                         // ---- scream ring: D = (speed, max radius, power, 0)
		float R = min(vD.x * vAge, vD.y);
		float x = r - R;
		float band = smoothstep(0.35, 0.0, abs(x));
		band *= band;
		float spk = pow(max(sin(an * 31.0 + seed * 20.0), 0.0), 6.0) + pow(max(sin(an * 13.0 - seed * 31.0), 0.0), 9.0) * 0.8;
		float wake = smoothstep(-7.0, 0.0, x) * step(x, 0.0);
		float streak = spk * wake * wake * 0.55;
		float haze = wake * 0.12;
		float flash = smoothstep(vD.y * 0.6, 0.0, r) * max(1.0 - vAge * 4.0, 0.0);
		float endF = 1.0 - smoothstep(vD.y * 0.7, vD.y, R);
		a = (band * 1.3 + streak + haze) * endF + flash;
		a *= vCol.a;
		col = mix(col, vec3(1.0), clamp(band + flash, 0.0, 1.0));
	}
	a = clamp(a, 0.0, 1.0);
	if (a < 0.004) discard;
	gl_FragColor = vec4(col * a, a * (1.0 - add));
}
`;

const CARD_VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aA; // anchor xyz, style
attribute vec4 aB; // width, height, yaw, tilt
attribute vec4 aC; // rgb, alpha
attribute vec4 aD; // start time, seed, level, pass time (gates; 0 = not passed)
varying vec2 vUv;
varying vec4 vCol;
varying float vStyle;
varying float vSeed;
varying float vLevel;
varying float vA;
varying float vK;
void main() {
	vUv = position.xy;
	vCol = aC;
	vStyle = aA.w;
	vSeed = aD.y;
	vLevel = aD.z;
	vA = 0.0;
	vK = 0.0;
	if (aC.w <= 0.0) {
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		return;
	}
	float age = uTime - aD.x;
	float style = aA.w;
	vec3 toCam = cameraPosition - aA.xyz;
	float camD = length(toCam);
	vec3 flatv = vec3(toCam.x, 0.0, toCam.z);
	float fl = length(flatv);
	vec3 bright = fl > 1e-4 ? vec3(flatv.z, 0.0, -flatv.x) / fl : vec3(1.0, 0.0, 0.0);
	float sy = sin(aB.z);
	float cy = cos(aB.z);
	vec3 fright = vec3(cy, 0.0, -sy);
	vec3 up = vec3(0.0, 1.0, 0.0);
	float y01 = position.y * 0.5 + 0.5;
	float fadeIn = smoothstep(0.0, 0.45, age);
	vec3 p;
	if (style < 0.5) {            // beacon pillar: stands on its anchor, turns to the camera
		p = aA.xyz + bright * (position.x * aB.x * 0.5) + up * (y01 * aB.y);
		vA = aC.w * fadeIn * smoothstep(0.6, 2.2, camD);
	} else if (style < 1.5) {     // guide ring in a fixed vertical plane; bursts when passed
		float k = aD.w > 0.0 ? clamp((uTime - aD.w) / ${GATE_BURST.toFixed(2)}, 0.0, 1.0) : 0.0;
		vK = k;
		float sc = aB.x * 0.5 * 1.18 * (1.0 + 0.9 * k);
		p = aA.xyz + (fright * position.x + up * position.y) * sc;
		vA = aC.w * fadeIn * (aD.w > 0.0 ? (1.0 - k) * (1.0 - k) * 1.8 : 1.0);
	} else if (style < 2.5) {     // light shaft: fixed plane, leaning by tilt
		float st = sin(aB.w);
		float ct = cos(aB.w);
		p = aA.xyz + fright * (position.x * aB.x * 0.5) + (fright * st + up * ct) * (y01 * aB.y);
		// a shaft seen edge-on is a line: let it fade there
		vec3 nrm = vec3(sy, 0.0, cy);
		float facing = abs(dot(nrm, toCam)) / max(camD, 1e-3);
		vA = aC.w * fadeIn * smoothstep(0.08, 0.45, facing) * smoothstep(0.8, 3.0, camD);
	} else if (style < 3.5) {     // mist card: big, soft, turns to the camera, drifts a little
		vec3 c = aA.xyz + vec3(sin(uTime * 0.07 + aD.y * 20.0), 0.0, cos(uTime * 0.05 + aD.y * 31.0)) * 0.6;
		p = c + bright * (position.x * aB.x * 0.5) + up * (position.y * aB.y * 0.5);
		vA = aC.w * fadeIn * smoothstep(1.5, 7.0, camD);
	} else if (style < 4.5) {     // flame: stands on its anchor, turns to the camera
		p = aA.xyz + bright * (position.x * aB.x * 0.5) + up * (y01 * aB.y);
		vA = aC.w;
	} else {                      // halo: a soft ball of light, faces the camera
		vec4 mvh = viewMatrix * vec4(aA.xyz, 1.0);
		mvh.xy += position.xy * aB.x * 0.5;
		vA = aC.w;
		gl_Position = projectionMatrix * mvh;
		return;
	}
	gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const CARD_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec4 vCol;
varying float vStyle;
varying float vSeed;
varying float vLevel;
varying float vA;
varying float vK;
float ch(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
void main() {
	float y01 = vUv.y * 0.5 + 0.5;
	float ax = abs(vUv.x);
	float t = uTime;
	float s = vSeed * 6.2831853;
	vec3 col = vCol.rgb;
	float a;
	float solid = 0.0;
	if (vStyle < 0.5) {            // beacon pillar
		float beam = max(1.0 - ax, 0.0);
		float core = pow(beam, 6.0);
		float soft = beam * beam;
		float rise = 0.75 + 0.25 * sin(y01 * 16.0 - t * 2.4 + s);
		float hgt = pow(max(1.0 - y01, 0.0), 1.6) * smoothstep(0.0, 0.04, y01);
		float breathe = 0.8 + 0.2 * sin(t * 2.1 + s);
		a = (soft * 0.42 * rise + core * 0.75) * hgt * breathe;
		col = mix(col, vec3(1.0), core * 0.6);
	} else if (vStyle < 1.5) {     // guide ring
		float r = length(vUv) * 1.18;
		float an = atan(vUv.y, vUv.x);
		float band = smoothstep(0.075, 0.0, abs(r - 1.0));
		float halo = smoothstep(0.34, 0.0, abs(r - 1.0));
		float dash = 0.7 + 0.3 * sin(an * 14.0 - t * 2.2 + s);
		float inner = smoothstep(1.0, 0.2, r) * 0.05;
		a = band * band * dash + halo * halo * 0.3 + inner;
		a *= 0.85 + 0.15 * sin(t * 3.0 + s);
		col = mix(col, vec3(1.0), clamp(band * band * 0.6 + vK, 0.0, 1.0));
	} else if (vStyle < 2.5) {     // light shaft with slow dust in it
		float edge = smoothstep(1.0, 0.25, ax);
		float rays = 0.72 + 0.28 * sin(vUv.x * 7.0 + s * 3.0 + sin(t * 0.17 + s) * 1.2) * sin(vUv.x * 17.0 - s * 5.0 + t * 0.09);
		float hgt = smoothstep(0.0, 0.16, y01) * smoothstep(1.0, 0.55, y01);
		vec2 g = vec2(vUv.x * 5.0 + s, y01 * 16.0 - t * 0.06);
		vec2 gi = floor(g);
		vec2 gf = fract(g) - 0.5;
		float h1 = ch(gi + vSeed * 13.0);
		vec2 o = (vec2(h1, ch(gi + 7.7)) - 0.5) * 0.6 + vec2(sin(t * 0.4 + h1 * 30.0), cos(t * 0.33 + h1 * 17.0)) * 0.08;
		float speck = smoothstep(0.11, 0.0, length(gf - o)) * step(0.55, h1) * (0.5 + 0.5 * sin(t * (1.0 + h1 * 2.0) + h1 * 40.0));
		a = edge * edge * rays * hgt * 0.6 + speck * edge * hgt * 0.55;
	} else if (vStyle < 3.5) {     // mist
		float r2 = dot(vUv, vUv);
		float body = max(1.0 - r2, 0.0);
		float n = sin(vUv.x * 3.1 + t * 0.11 + s) * sin(vUv.y * 4.3 - t * 0.07 + s * 2.0) * 0.5
			+ sin(vUv.x * 6.7 - t * 0.09 + s * 3.0) * sin(vUv.y * 2.1 + s) * 0.3;
		a = body * body * (0.7 + 0.3 * n) * smoothstep(-1.0, -0.55, vUv.y);
		solid = 1.0;
	} else if (vStyle < 4.5) {     // flame
		float lv = max(vLevel, 0.0);
		float top = lv * (0.82 + 0.18 * sin(t * 11.0 + s * 3.0) * sin(t * 6.3 + s));
		float yy = y01 / max(top, 1e-3);
		float sway = sin(y01 * 5.0 - t * 7.0 + s * 2.0) * 0.2 + sin(y01 * 11.0 - t * 13.0 + s * 5.0) * 0.08;
		float wd = pow(max(1.0 - yy, 0.0), 0.65) * (0.62 + 0.14 * sin(y01 * 9.0 - t * 10.0 + s)) + 0.02;
		float d = abs(vUv.x - sway * y01) / wd;
		float body = smoothstep(1.0, 0.25, d) * smoothstep(0.0, 0.05, y01) * step(yy, 1.0);
		float lick = smoothstep(0.55, 0.0, abs(fract(y01 * 2.3 - t * 2.1 + vSeed) - 0.5)) * 0.25 + 0.75;
		float heat = body * (1.0 - yy * 0.75) * lick;
		col = mix(vec3(1.0, 0.2, 0.02), vec3(1.0, 0.58, 0.1), smoothstep(0.1, 0.55, heat));
		col = mix(col, vec3(1.0, 0.94, 0.7), smoothstep(0.55, 0.95, heat));
		col *= vCol.rgb;
		a = body * (0.45 + 0.55 * heat) * min(lv * 3.0, 1.0);
	} else {                       // halo
		float f = max(1.0 - length(vUv), 0.0);
		a = f * f * (0.85 + 0.15 * sin(t * 13.0 + s) * sin(t * 7.1 + s * 2.0)) * (0.3 + 0.7 * vLevel);
	}
	a = clamp(a * vA, 0.0, 1.0);
	if (a < 0.004) discard;
	gl_FragColor = vec4(col * a, a * solid);
}
`;

const SCREAM_VERT = /* glsl */ `
uniform vec4 uC; // centre xyz, radius of the outer shell
uniform vec4 uP; // power, age, fade, max radius
attribute float aShell;
varying vec3 vDir;
varying vec3 vW;
varying float vShell;
void main() {
	vDir = position;
	vShell = aShell;
	float rad = uC.w * (aShell < 0.5 ? 1.0 : 0.74);
	vec3 p = uC.xyz + vec3(position.x, position.y * 0.62, position.z) * rad;
	vW = p;
	gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const SCREAM_FRAG = /* glsl */ `
uniform vec4 uC;
uniform vec4 uP;
varying vec3 vDir;
varying vec3 vW;
varying float vShell;
void main() {
	vec3 N = normalize(vec3(vDir.x, vDir.y / 0.62, vDir.z));
	vec3 V = normalize(cameraPosition - vW);
	float ndv = abs(dot(N, V));
	float fres = pow(1.0 - ndv, 2.2);
	float an = atan(vDir.z, vDir.x);
	float el = vDir.y;
	// radial streaks whose pattern scrolls up the wall and round it: reads as bending air
	float sc = uP.y * (vShell < 0.5 ? 9.0 : -6.0);
	float s1 = sin(an * 37.0 + sin(el * 9.0 - sc) * 1.6 + vShell * 2.0);
	float s2 = sin(an * 71.0 - el * 13.0 + sc * 1.7);
	float streak = pow(max(s1, 0.0), 5.0) * 0.7 + pow(max(s2, 0.0), 9.0) * 0.5;
	float bands = 0.5 + 0.5 * sin(el * 26.0 - sc * 2.0 + an * 3.0);
	float foot = smoothstep(0.0, 0.1, el) * (1.0 - smoothstep(0.55, 1.0, el));
	float a = (fres * (0.5 + 0.5 * bands) + streak * (0.25 + 0.75 * fres)) * foot;
	a += fres * fres * 0.5 * smoothstep(0.0, 0.1, el);
	a *= uP.z * (vShell < 0.5 ? 1.0 : 0.6);
	a = clamp(a, 0.0, 1.0);
	if (a < 0.004) discard;
	vec3 col = mix(vec3(0.72, 0.86, 1.0), vec3(1.0), clamp(fres * 0.8 + streak * 0.4, 0.0, 1.0));
	gl_FragColor = vec4(col * a, a * 0.06);
}
`;

const SWIRL_VERT = /* glsl */ `
uniform float uTime;
attribute float aT;    // 0 (tail) .. 1 (head) along the ribbon
attribute float aSide; // -1 | +1
attribute float aDir;  // -1 | +1: the two ribbons turn against each other
attribute vec4 aS;     // centre xyz, start time
attribute vec4 aS2;    // seconds, height, seed, radius
varying float vT;
varying float vSide;
varying float vDirv;
varying float vA;
vec3 helix(float t, float u, float age) {
	float rise = smoothstep(0.0, 0.5, u);
	float lift = smoothstep(0.5, 0.92, u);
	float hv = mix(lift, rise, t);
	float turns = 2.4;
	float ang = aDir * (hv * turns * 6.2831853 + age * (4.5 + 5.0 * u)) + (aDir > 0.0 ? 0.0 : 3.14159265) + aS2.z * 6.2831853;
	float R = aS2.w * mix(1.0, 0.3, smoothstep(0.08, 0.8, u)) * (1.0 - 0.5 * hv);
	R *= 1.0 + 1.3 * smoothstep(0.8, 1.0, u);
	return aS.xyz + vec3(cos(ang) * R, hv * aS2.y, sin(ang) * R);
}
void main() {
	vT = aT;
	vSide = aSide;
	vDirv = aDir;
	vA = 0.0;
	float age = uTime - aS.w;
	float secs = aS2.x;
	float u = age / max(secs, 1e-3);
	if (secs <= 0.0 || u < 0.0 || u >= 1.0) {
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		return;
	}
	vec3 p = helix(aT, u, age);
	vec3 p2 = helix(aT + 0.012, u, age);
	vec3 tg = p2 - p;
	vec3 toCam = cameraPosition - p;
	vec3 side = cross(tg, toCam);
	float sl = length(side);
	side = sl > 1e-6 ? side / sl : vec3(0.0, 1.0, 0.0);
	float w = (0.035 + 0.075 * aS2.w) * sqrt(max(sin(aT * 3.14159265), 0.0)) * (1.0 - 0.35 * u);
	p += side * (aSide * w);
	vA = smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.8, 1.0, u)) * mix(0.3, 1.0, aT) * (1.0 + 1.2 * smoothstep(0.7, 0.8, u));
	gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const SWIRL_FRAG = /* glsl */ `
uniform float uTime;
varying float vT;
varying float vSide;
varying float vDirv;
varying float vA;
void main() {
	float across = max(1.0 - abs(vSide), 0.0);
	float core = across * across * across;
	float shimmer = 0.72 + 0.28 * sin(vT * 46.0 - uTime * 13.0 * vDirv);
	vec3 green = vec3(0.36, 1.0, 0.62);
	vec3 gold = vec3(1.0, 0.86, 0.42);
	vec3 col = mix(vDirv > 0.0 ? green : gold, vDirv > 0.0 ? gold : green, vT * 0.6);
	col = mix(col, vec3(1.0), core * 0.85);
	float a = clamp((across * 0.55 * shimmer + core * 0.9) * vA, 0.0, 1.0);
	if (a < 0.004) discard;
	gl_FragColor = vec4(col * a, 0.0);
}
`;

const AIR_VERT = /* glsl */ `
uniform float uTime;
uniform vec4 uDream;   // strength, radius, 0, 0
uniform vec3 uDreamCol;
uniform vec4 uFly;     // strength, centre x, centre z, radius
uniform vec2 uFlyY;    // base height, fraction of the swarm that is out
uniform vec4 uWind;    // dir x, dir z, strength, speed
attribute vec4 aA; // seed xyz (0..1), kind (0 dream mote, 1 firefly, 2 wind streak)
attribute vec4 aB; // size, rate, phase / rank, alpha
varying vec2 vUv;
varying vec3 vCol;
varying float vA;
varying float vKind;
float ah2(float n) { return fract(sin(n) * 43758.5453123); }
void main() {
	vUv = position.xy;
	vKind = aA.w;
	vA = 0.0;
	vCol = vec3(1.0);
	gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
	if (aA.w < 0.5) {
		if (uDream.x <= 0.002) return;
		vec3 S = vec3(uDream.y * 2.0, min(uDream.y, 9.0), uDream.y * 2.0);
		vec3 vel = (vec3(ah2(aB.z * 3.1 + 0.2), ah2(aB.z * 7.7 + 1.1), ah2(aB.z * 5.3 + 2.4)) - 0.5) * vec3(0.16, 0.07, 0.16);
		vel.y += 0.03;
		vec3 q = aA.xyz + vel * uTime / S - cameraPosition / S;
		q.x += sin(uTime * 0.23 + aB.z * 20.0) * 0.01;
		q.z += cos(uTime * 0.19 + aB.z * 31.0) * 0.01;
		q = fract(q);
		vec3 ef = smoothstep(vec3(0.0), vec3(0.12), q) * (1.0 - smoothstep(vec3(0.88), vec3(1.0), q));
		float tw = 0.5 + 0.5 * sin(uTime * (0.4 + aB.y * 1.6) + aB.z * 40.0);
		vA = aB.w * ef.x * ef.y * ef.z * (0.3 + 0.7 * tw * tw) * uDream.x;
		vCol = mix(uDreamCol, vec3(1.0), ah2(aB.z * 11.0) * 0.4);
		vec4 mv = viewMatrix * vec4(cameraPosition + (q - 0.5) * S, 1.0);
		mv.xy += position.xy * aB.x * (1.0 + 0.5 * tw);
		gl_Position = projectionMatrix * mv;
	} else if (aA.w < 1.5) {
		if (uFly.x <= 0.002 || aB.z >= uFlyY.y) return;
		float ang = aA.x * 6.2831853;
		float rr = sqrt(aA.y) * uFly.w;
		float ph = aB.z * 40.0;
		float rt = 0.25 + aB.y * 0.35;
		vec3 c = vec3(uFly.y + cos(ang) * rr, uFlyY.x + 0.35 + aA.z * 2.3, uFly.z + sin(ang) * rr);
		c += vec3(sin(uTime * rt + ph) + 0.5 * sin(uTime * rt * 2.3 + ph * 1.7), 0.35 * sin(uTime * rt * 1.7 + ph * 0.6),
			cos(uTime * rt * 0.9 + ph * 1.3) + 0.5 * cos(uTime * rt * 2.1 + ph)) * 0.9;
		float bl = max(sin(uTime * (0.7 + aB.y * 0.9) + ph), 0.0);
		bl = bl * bl * bl;
		vA = aB.w * (0.06 + 0.94 * bl) * uFly.x;
		vCol = vec3(0.78, 1.0, 0.32);
		vec4 mv = viewMatrix * vec4(c, 1.0);
		mv.xy += position.xy * aB.x * (0.6 + 0.8 * bl);
		gl_Position = projectionMatrix * mv;
	} else {
		if (uWind.z <= 0.002) return;
		vec3 S = vec3(26.0, 9.0, 26.0);
		vec3 dir = vec3(uWind.x, 0.0, uWind.y);
		vec3 q = aA.xyz + dir * (uWind.w * (0.75 + 0.5 * aB.y) * uTime) / S - cameraPosition / S;
		q.y += sin(uTime * 0.6 + aB.z * 30.0) * 0.02;
		q = fract(q);
		vec3 ef = smoothstep(vec3(0.0), vec3(0.14), q) * (1.0 - smoothstep(vec3(0.86), vec3(1.0), q));
		vec3 p = cameraPosition + (q - 0.5) * S;
		float len = (1.1 + 1.9 * aB.y) * (0.6 + 0.4 * uWind.z);
		p += dir * (position.x * len);
		vec3 toCam = cameraPosition - p;
		vec3 side = cross(dir, toCam);
		float sl = length(side);
		side = sl > 1e-5 ? side / sl : vec3(0.0, 1.0, 0.0);
		p += side * (position.y * max(aB.x, length(toCam) * 0.0016));
		vA = aB.w * ef.x * ef.y * ef.z * uWind.z;
		gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
	}
}
`;

const AIR_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
varying float vA;
varying float vKind;
void main() {
	float a;
	float solid;
	if (vKind < 1.5) {
		float f = max(1.0 - length(vUv), 0.0);
		a = f * f * f + (vKind > 0.5 ? smoothstep(0.75, 1.0, f) : 0.0);
		solid = vKind < 0.5 ? 0.12 : 0.0;
	} else {
		float across = max(1.0 - abs(vUv.y), 0.0);
		float along = max(1.0 - vUv.x * vUv.x, 0.0);
		a = across * across * along * along;
		solid = 0.55;
	}
	a = clamp(a * vA, 0.0, 1.0);
	if (a < 0.004) discard;
	gl_FragColor = vec4(vCol * a, a * solid);
}
`;

const BIRD_VERT = /* glsl */ `
uniform float uTime;
attribute float aWing; // 0 at the body .. 1 at the wing tip
attribute vec4 aA; // start xyz, start time
attribute vec4 aB; // velocity xyz, life
attribute vec4 aC; // seed, size, flap rate, tone
varying float vA;
varying float vShade;
varying float vTone;
void main() {
	vA = 0.0;
	vShade = 1.0;
	vTone = aC.w;
	float age = uTime - aA.w;
	float life = aB.w;
	if (life <= 0.0 || age < 0.0 || age >= life) {
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		return;
	}
	float u = age / life;
	float ph = aC.x * 6.2831853;
	// a startled leap, then the flock strings out and climbs away
	float go = age + 0.35 * age * age;
	vec3 c = aA.xyz + vec3(aB.x, 0.0, aB.z) * go + vec3(0.0, aB.y * age + 1.4 * (1.0 - exp(-age * 2.5)), 0.0);
	vec2 hd = vec2(aB.x, aB.z);
	float hl = length(hd);
	hd = hl > 1e-4 ? hd / hl : vec2(0.0, 1.0);
	vec3 fwd = vec3(hd.x, 0.0, hd.y);
	vec3 right = vec3(hd.y, 0.0, -hd.x);
	c += right * (sin(age * 2.1 + ph) * 0.35) + vec3(0.0, sin(age * 3.3 + ph * 2.0) * 0.12, 0.0);
	// flap: fast and deep at first, then long glides between bursts
	float burst = 0.45 + 0.55 * smoothstep(-0.2, 0.4, sin(age * 1.3 + ph * 3.0));
	float fa = age * aC.z + ph;
	float flap = sin(fa) * aWing + step(0.75, aWing) * 0.45 * sin(fa - 0.9);
	float bank = sin(age * 2.1 + ph) * 0.3;
	vec3 l = position * aC.y;
	float wy = flap * 0.55 * burst * aC.y + position.x * bank * aC.y;
	l.x *= 1.0 - 0.25 * abs(sin(fa)) * aWing;
	vec3 p = c + right * l.x + vec3(0.0, wy + 0.12 * aC.y * sin(fa + 1.57) * (1.0 - aWing), 0.0) + fwd * l.z;
	vShade = 0.75 + 0.25 * flap;
	vec4 mv = viewMatrix * vec4(p, 1.0);
	vA = smoothstep(0.0, 0.05, u) * (1.0 - smoothstep(0.7, 1.0, u));
	gl_Position = projectionMatrix * mv;
}
`;

const BIRD_FRAG = /* glsl */ `
varying float vA;
varying float vShade;
varying float vTone;
void main() {
	if (vA < 0.01) discard;
	vec3 col = mix(vec3(0.07, 0.065, 0.06), vec3(0.3, 0.24, 0.18), vTone) * vShade;
	gl_FragColor = vec4(col * vA, vA);
}
`;

// ---------------------------------------------------------------------------------------------

export function createFx(THREE) {
	const group = new THREE.Group();
	group.name = "fx";

	let now = 0;
	const uTime = { value: 0 };

	// ------------------------------------------------------------------ shared water uniforms
	const uSun = { value: new THREE.Vector3(0.38, 0.82, 0.42).normalize() };
	const uZapA = { value: new THREE.Vector4(0, 0, 0, 0) };
	const uZapP = { value: new THREE.Vector2(0, 0) };
	const waters = [];
	let zapGlow = 0; // water glow intensity, decays after arrival
	let zapHold = false;

	// ------------------------------------------------------------------ particles
	const quad = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
	const quadIndex = [0, 1, 2, 0, 2, 3];

	const pData = new Float32Array(MAX_PARTICLES * P_STRIDE);
	const pBuffer = new THREE.InstancedInterleavedBuffer(pData, P_STRIDE, 1);
	pBuffer.setUsage(THREE.DynamicDrawUsage);
	const pGeo = new THREE.InstancedBufferGeometry();
	pGeo.setAttribute("position", new THREE.BufferAttribute(quad, 3));
	pGeo.setIndex(quadIndex);
	pGeo.setAttribute("aPos", new THREE.InterleavedBufferAttribute(pBuffer, 4, 0));
	pGeo.setAttribute("aVel", new THREE.InterleavedBufferAttribute(pBuffer, 4, 4));
	pGeo.setAttribute("aParm", new THREE.InterleavedBufferAttribute(pBuffer, 4, 8));
	pGeo.setAttribute("aCol", new THREE.InterleavedBufferAttribute(pBuffer, 4, 12));
	pGeo.setAttribute("aMisc", new THREE.InterleavedBufferAttribute(pBuffer, 4, 16));
	pGeo.instanceCount = MAX_PARTICLES;
	const pMat = new THREE.ShaderMaterial({
		uniforms: { uTime },
		vertexShader: PARTICLE_VERT,
		fragmentShader: PARTICLE_FRAG,
		transparent: true,
		depthWrite: false,
		premultipliedAlpha: true,
		blending: THREE.NormalBlending,
		side: THREE.DoubleSide,
	});
	const particles = new THREE.Mesh(pGeo, pMat);
	particles.name = "fx-particles";
	particles.frustumCulled = false;
	particles.renderOrder = 4;
	particles.visible = false;
	particles.castShadow = false;
	particles.receiveShadow = false;
	group.add(particles);
	let pCursor = 0;
	let pDirty = false;
	let pAliveUntil = -1;

	function spawn(x, y, z, vx, vy, vz, life, size0, size1, gravity, drag, r, g, b, additive, shape, stretch, rot, alpha) {
		const o = pCursor * P_STRIDE;
		pCursor = (pCursor + 1) % MAX_PARTICLES;
		pData[o] = x; pData[o + 1] = y; pData[o + 2] = z; pData[o + 3] = now;
		pData[o + 4] = vx; pData[o + 5] = vy; pData[o + 6] = vz; pData[o + 7] = life;
		pData[o + 8] = size0; pData[o + 9] = size1; pData[o + 10] = gravity; pData[o + 11] = drag;
		pData[o + 12] = r; pData[o + 13] = g; pData[o + 14] = b; pData[o + 15] = additive;
		pData[o + 16] = shape; pData[o + 17] = stretch; pData[o + 18] = rot; pData[o + 19] = alpha;
		pDirty = true;
		if (now + life > pAliveUntil) pAliveUntil = now + life;
		particles.visible = true;
	}

	// ------------------------------------------------------------------ rings
	const rData = new Float32Array(MAX_RINGS * R_STRIDE);
	const rBuffer = new THREE.InstancedInterleavedBuffer(rData, R_STRIDE, 1);
	rBuffer.setUsage(THREE.DynamicDrawUsage);
	const rGeo = new THREE.InstancedBufferGeometry();
	rGeo.setAttribute("position", new THREE.BufferAttribute(quad, 3));
	rGeo.setIndex(quadIndex);
	rGeo.setAttribute("aRing", new THREE.InterleavedBufferAttribute(rBuffer, 4, 0));
	rGeo.setAttribute("aRing2", new THREE.InterleavedBufferAttribute(rBuffer, 4, 4));
	rGeo.setAttribute("aRCol", new THREE.InterleavedBufferAttribute(rBuffer, 4, 8));
	rGeo.instanceCount = MAX_RINGS;
	const rMat = new THREE.ShaderMaterial({
		uniforms: { uTime },
		vertexShader: RING_VERT,
		fragmentShader: RING_FRAG,
		transparent: true,
		depthWrite: false,
		premultipliedAlpha: true,
		blending: THREE.NormalBlending,
		side: THREE.DoubleSide,
	});
	const rings = new THREE.Mesh(rGeo, rMat);
	rings.name = "fx-rings";
	rings.frustumCulled = false;
	rings.renderOrder = 2;
	rings.visible = false;
	group.add(rings);
	let rCursor = 0;
	let rDirty = false;
	let rAliveUntil = -1;

	function spawnRing(x, y, z, life, r0, r1, thick, r, g, b, additive) {
		const o = rCursor * R_STRIDE;
		rCursor = (rCursor + 1) % MAX_RINGS;
		rData[o] = x; rData[o + 1] = y; rData[o + 2] = z; rData[o + 3] = now;
		rData[o + 4] = life; rData[o + 5] = r0; rData[o + 6] = r1; rData[o + 7] = thick;
		rData[o + 8] = r; rData[o + 9] = g; rData[o + 10] = b; rData[o + 11] = additive;
		rDirty = true;
		if (now + life > rAliveUntil) rAliveUntil = now + life;
		rings.visible = true;
	}

	// ------------------------------------------------------------------ light flash
	// (no scene light: a permanent PointLight costs a second direct BRDF on every lit fragment.
	// The flash is faked with large additive SOFT particles in electroPulse / arriveBurst.)

	// ------------------------------------------------------------------ electro bolts
	function buildBoltGeometry() {
		// strand list: [t0, angle, length, seed, halfWidth, yOff, bright, wander, segments]
		const strands = [];
		strands.push([-1, 0, 1, 0.0, 0.085, 0.012, 1.0, 1.0, 44]);   // core, on the surface
		strands.push([-1, 0, 1, 1.37, 0.05, 0.02, 0.8, 1.7, 36]);    // companion
		strands.push([-1, 0, 1, 2.71, 0.042, 0.016, 0.7, 2.3, 36]);  // companion
		strands.push([-1, 0, 1, 4.19, 0.075, -0.07, 0.62, 2.0, 30]); // under the surface
		strands.push([-1, 0, 1, 5.83, 0.06, -0.11, 0.5, 2.8, 30]);   // deeper
		const NB = 12;
		for (let i = 0; i < NB; i++) {
			const t0 = 0.16 + (i / (NB - 1)) * 0.72;
			const sign = i % 2 === 0 ? 1 : -1;
			const h = Math.abs(Math.sin(i * 12.9898 + 4.1) * 43758.5453) % 1;
			const h2 = Math.abs(Math.sin(i * 78.233 + 1.7) * 12543.853) % 1;
			const angle = sign * (0.45 + h * 0.75);
			const len = 0.35 + h2 * 0.6;
			const deep = i % 3 === 2;
			strands.push([t0, angle, len, 7.0 + i * 1.618, 0.04, deep ? -0.09 : 0.03, deep ? 0.55 : 0.85, 1.0, 10]);
		}
		let vCount = 0;
		let iCount = 0;
		for (let s = 0; s < strands.length; s++) {
			vCount += (strands[s][8] + 1) * 2;
			iCount += strands[s][8] * 6;
		}
		const aT = new Float32Array(vCount);
		const aSide = new Float32Array(vCount);
		const aStrand = new Float32Array(vCount * 4);
		const aKind = new Float32Array(vCount * 4);
		const pos = new Float32Array(vCount * 3); // unused by the shader, present for three's bookkeeping
		const index = new Uint16Array(iCount);
		let v = 0;
		let ii = 0;
		for (let s = 0; s < strands.length; s++) {
			const st = strands[s];
			const segs = st[8];
			const base = v;
			for (let j = 0; j <= segs; j++) {
				for (let k = 0; k < 2; k++) {
					aT[v] = j / segs;
					aSide[v] = k === 0 ? -1 : 1;
					aStrand[v * 4] = st[0]; aStrand[v * 4 + 1] = st[1]; aStrand[v * 4 + 2] = st[2]; aStrand[v * 4 + 3] = st[3];
					aKind[v * 4] = st[4]; aKind[v * 4 + 1] = st[5]; aKind[v * 4 + 2] = st[6]; aKind[v * 4 + 3] = st[7];
					v++;
				}
			}
			for (let j = 0; j < segs; j++) {
				const a = base + j * 2;
				index[ii++] = a; index[ii++] = a + 1; index[ii++] = a + 2;
				index[ii++] = a + 1; index[ii++] = a + 3; index[ii++] = a + 2;
			}
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
		geo.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
		geo.setAttribute("aSide", new THREE.BufferAttribute(aSide, 1));
		geo.setAttribute("aStrand", new THREE.BufferAttribute(aStrand, 4));
		geo.setAttribute("aKind", new THREE.BufferAttribute(aKind, 4));
		geo.setIndex(new THREE.BufferAttribute(index, 1));
		return geo;
	}
	const boltGeo = buildBoltGeometry();
	const bolts = [];
	for (let i = 0; i < MAX_BOLTS; i++) {
		const mat = new THREE.ShaderMaterial({
			uniforms: {
				uTime,
				uFrom: { value: new THREE.Vector3() },
				uTo: { value: new THREE.Vector3() },
				uSurfY: { value: 0 },
				uHead: { value: 0 },
				uFade: { value: 0 },
				uFlash: { value: 0 },
				uSeed: { value: i * 3.7 },
			},
			vertexShader: BOLT_VERT,
			fragmentShader: BOLT_FRAG,
			transparent: true,
			depthWrite: false,
			premultipliedAlpha: true,
			blending: THREE.NormalBlending,
			side: THREE.DoubleSide,
		});
		const mesh = new THREE.Mesh(boltGeo, mat);
		mesh.name = "fx-bolt";
		mesh.frustumCulled = false;
		mesh.renderOrder = 3;
		mesh.visible = false;
		group.add(mesh);
		bolts.push({
			active: false,
			t: 0,
			arrived: false,
			cb: null,
			mesh,
			u: mat.uniforms,
			from: mat.uniforms.uFrom.value,
			to: mat.uniforms.uTo.value,
			surfY: 0,
			emitAcc: 0,
			ringAcc: 0,
			inWater: false,
		});
	}
	let boltCursor = 0;
	let lastBolt = null; // the bolt driving the light + water glow

	// ------------------------------------------------------------------ water
	function findWater(x, z, margin) {
		for (let i = 0; i < waters.length; i++) {
			if (waters[i]._near(x, z, margin)) return waters[i];
		}
		return null;
	}

	function createWater(x, z, length, width, yawRad = 0, opts) {
		const level = opts && typeof opts.surfaceY === "number" ? opts.surfaceY : -0.14;
		const halfL = length * 0.5;
		const halfW = width * 0.5;
		const nx = Math.max(8, Math.min(72, Math.ceil(length / 0.2)));
		const nz = Math.max(6, Math.min(40, Math.ceil(width / 0.2)));
		const vCount = (nx + 1) * (nz + 1);
		const pos = new Float32Array(vCount * 3);
		const index = new Uint16Array(nx * nz * 6);
		let v = 0;
		for (let j = 0; j <= nz; j++) {
			for (let i = 0; i <= nx; i++) {
				pos[v++] = -halfL + (i / nx) * length;
				pos[v++] = 0;
				pos[v++] = -halfW + (j / nz) * width;
			}
		}
		let ii = 0;
		for (let j = 0; j < nz; j++) {
			for (let i = 0; i < nx; i++) {
				const a = j * (nx + 1) + i;
				const b = a + 1;
				const c = a + nx + 1;
				const d = c + 1;
				index[ii++] = a; index[ii++] = c; index[ii++] = b;
				index[ii++] = b; index[ii++] = c; index[ii++] = d;
			}
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
		geo.setIndex(new THREE.BufferAttribute(index, 1));
		geo.computeBoundingSphere();
		geo.computeBoundingBox();

		const ripples = [];
		for (let i = 0; i < MAX_RIPPLES; i++) ripples.push(new THREE.Vector4(0, 0, -100, 0));
		const mat = new THREE.ShaderMaterial({
			uniforms: {
				uTime,
				uSun,
				uZapA,
				uZapP,
				uRipples: { value: ripples },
				uHalf: { value: new THREE.Vector2(halfL, halfW) },
				uSoft: { value: Math.max(0.12, Math.min(0.4, Math.min(halfL, halfW) * 0.3)) },
				fogColor: { value: new THREE.Color(0xffffff) },
				fogNear: { value: 1 },
				fogFar: { value: 1000 },
				fogDensity: { value: 0.00025 },
			},
			vertexShader: WATER_VERT,
			fragmentShader: WATER_FRAG,
			transparent: true,
			depthWrite: false,
			fog: true,
			side: THREE.FrontSide,
		});
		const mesh = new THREE.Mesh(geo, mat);
		mesh.name = "fx-water";
		mesh.position.set(x, level, z);
		mesh.rotation.y = yawRad;
		mesh.renderOrder = 1;
		mesh.castShadow = false;
		mesh.receiveShadow = false;
		group.add(mesh);

		const cs = Math.cos(yawRad);
		const sn = Math.sin(yawRad);
		let rippleCursor = 0;

		function near(px, pz, margin) {
			const dx = px - x;
			const dz = pz - z;
			const lx = dx * cs - dz * sn;
			const lz = dx * sn + dz * cs;
			return Math.abs(lx) <= halfL + margin && Math.abs(lz) <= halfW + margin;
		}

		const water = {
			mesh,
			length,
			width,
			surfaceY: level,
			contains(px, pz) {
				return near(px, pz, 0);
			},
			ripple(px, pz, strength = 1) {
				const r = ripples[rippleCursor];
				rippleCursor = (rippleCursor + 1) % MAX_RIPPLES;
				r.set(px, pz, now, Math.max(0, Math.min(3, strength)));
			},
			setLevel(y) {
				water.surfaceY = y;
				mesh.position.y = y;
			},
			dispose() {
				const i = waters.indexOf(water);
				if (i >= 0) waters.splice(i, 1);
				group.remove(mesh);
				geo.dispose();
				mat.dispose();
			},
			_near: near,
			_ripples: ripples,
		};
		waters.push(water);
		return water;
	}

	function rippleAt(x, z, strength = 1) {
		let hit = false;
		for (let i = 0; i < waters.length; i++) {
			const w = waters[i];
			if (w._near(x, z, 0.25)) {
				w.ripple(x, z, strength);
				hit = true;
			}
		}
		return hit;
	}

	// ------------------------------------------------------------------ helpers
	function rnd(a, b) {
		return a + Math.random() * (b - a);
	}

	// point on the un-jagged pulse path (mirrors basePath() in the bolt shader)
	function smooth(e0, e1, v) {
		let t = (v - e0) / (e1 - e0);
		t = t < 0 ? 0 : t > 1 ? 1 : t;
		return t * t * (3 - 2 * t);
	}
	const head = new THREE.Vector3();
	function pathPoint(b, t, out) {
		const f = b.from;
		const to = b.to;
		let y = f.y + (b.surfY - f.y) * smooth(0, 0.14, t);
		y = y + (to.y - y) * smooth(0.86, 1, t);
		out.set(f.x + (to.x - f.x) * t, y, f.z + (to.z - f.z) * t);
		return out;
	}

	// ------------------------------------------------------------------ effects
	function electroPulse(from, to, onArrive) {
		const b = bolts[boltCursor];
		boltCursor = (boltCursor + 1) % MAX_BOLTS;
		// if we are recycling a bolt that has not delivered yet, deliver now so game logic never stalls
		if (b.active && !b.arrived && b.cb) {
			const cb = b.cb;
			b.cb = null;
			cb();
		}
		b.from.copy(from);
		b.to.copy(to);
		const w = findWater(from.x, from.z, 0.3) || findWater(to.x, to.z, 0.3)
			|| findWater((from.x + to.x) * 0.5, (from.z + to.z) * 0.5, 0.3);
		b.inWater = !!w;
		b.surfY = w ? w.surfaceY + 0.015 : Math.min(from.y, to.y);
		b.u.uSurfY.value = b.surfY;
		b.u.uHead.value = 0;
		b.u.uFade.value = 1;
		b.u.uFlash.value = 0;
		b.u.uSeed.value = Math.random() * 50;
		b.t = 0;
		b.arrived = false;
		b.active = true;
		b.cb = typeof onArrive === "function" ? onArrive : null;
		b.emitAcc = 0;
		b.ringAcc = 0.05;
		b.mesh.visible = true;
		lastBolt = b;

		uZapA.value.set(from.x, from.z, to.x, to.z);
		uZapP.value.set(0, 1);
		zapGlow = 1;
		zapHold = true;

		// launch flash at the bill
		spawn(from.x, from.y, from.z, 0, 0, 0, 0.22, 0.12, 0.5, 0, 0, 0.45, 0.75, 1.0, 0.55, FLASH, 0, 0, 1.0);
		spawnRing(from.x, b.surfY + 0.01, from.z, 0.45, 0.08, 0.75, 0.16, 0.25, 0.6, 1.0, 0.4);
		for (let i = 0; i < 6; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(0.8, 2.2);
			spawn(from.x, from.y, from.z, Math.cos(a) * sp, rnd(0.4, 1.6), Math.sin(a) * sp,
				rnd(0.16, 0.3), 0.035, 0.012, -5, 2.5, 0.55, 0.82, 1.0, 0.5, SPARK, 0.12, 0, 1.0);
		}
		if (w) rippleAt(from.x, from.z, 1.0);
		spawn(from.x, from.y + 0.2, from.z, 0, 0, 0, 0.32, 0.9, 1.7, 0, 0, 0.35, 0.62, 1.0, 1.0, SOFT, 0, 0, 0.28);
	}

	function arriveBurst(b) {
		const x = b.to.x;
		const y = b.to.y;
		const z = b.to.z;
		spawn(x, y + 0.1, z, 0, 0, 0, 0.3, 0.25, 1.15, 0, 0, 0.5, 0.78, 1.0, 0.6, FLASH, 0, 0, 1.0);
		spawn(x, y + 0.1, z, 0, 0, 0, 0.5, 0.2, 0.9, 0, 0, 0.2, 0.5, 1.0, 0.2, SOFT, 0, 0, 0.55);
		for (let i = 0; i < 20; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(1.2, 4.2);
			const white = Math.random() < 0.4;
			spawn(x, y + rnd(0, 0.4), z, Math.cos(a) * sp, rnd(0.6, 3.6), Math.sin(a) * sp,
				rnd(0.22, 0.5), rnd(0.03, 0.05), 0.01, -7.5, 2.2,
				white ? 0.9 : 0.3, white ? 0.97 : 0.65, 1.0, 0.5, SPARK, 0.1, 0, 1.0);
		}
		// water thrown up by the discharge
		if (b.inWater) {
			for (let i = 0; i < 8; i++) {
				const a = Math.random() * Math.PI * 2;
				const sp = rnd(0.5, 1.6);
				spawn(x + Math.cos(a) * 0.1, b.surfY, z + Math.sin(a) * 0.1, Math.cos(a) * sp, rnd(1.6, 3.4), Math.sin(a) * sp,
					rnd(0.4, 0.65), rnd(0.022, 0.04), 0.012, -9.8, 0.4, 0.62, 0.86, 0.95, 0.1, DROP, 0.05, 0, 0.9);
			}
			rippleAt(x, z, 2.2);
		}
		spawnRing(x, b.surfY + 0.012, z, 0.55, 0.12, 1.25, 0.14, 0.25, 0.6, 1.0, 0.4);
		spawnRing(x, b.surfY + 0.014, z, 0.8, 0.08, 1.9, 0.09, 0.45, 0.8, 1.0, 0.3);
		spawn(x, y + 0.35, z, 0, 0, 0, 0.45, 1.3, 2.6, 0, 0, 0.35, 0.62, 1.0, 1.0, SOFT, 0, 0, 0.36);
	}

	function stingBurst(pos) {
		const x = pos.x;
		const y = pos.y;
		const z = pos.z;
		// spark at the spur
		spawn(x, y, z, 0, 0, 0, 0.18, 0.08, 0.42, 0, 0, 0.82, 1.0, 0.45, 0.6, FLASH, 0, 0, 1.0);
		// venom splash
		for (let i = 0; i < 14; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(0.5, 2.3);
			const lime = Math.random();
			spawn(x, y, z, Math.cos(a) * sp, rnd(0.8, 3.0), Math.sin(a) * sp,
				rnd(0.35, 0.65), rnd(0.022, 0.048), 0.014, -9.8, 0.6,
				0.25 + lime * 0.3, 0.78 + lime * 0.17, 0.12 + lime * 0.1, 0.05, DROP, 0.06, 0, 0.95);
		}
		// hot streaks
		for (let i = 0; i < 7; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(2.0, 4.5);
			spawn(x, y, z, Math.cos(a) * sp, rnd(0.2, 2.4), Math.sin(a) * sp,
				rnd(0.12, 0.24), 0.03, 0.008, -4, 4.0, 0.95, 1.0, 0.6, 0.55, SPARK, 0.13, 0, 1.0);
		}
		// lingering venom mist
		for (let i = 0; i < 4; i++) {
			spawn(x + rnd(-0.08, 0.08), y + rnd(0, 0.1), z + rnd(-0.08, 0.08), rnd(-0.3, 0.3), rnd(0.2, 0.6), rnd(-0.3, 0.3),
				rnd(0.5, 0.85), 0.08, 0.3, 0.15, 2.0, 0.35, 0.8, 0.2, 0.0, SOFT, 0, 0, 0.4);
		}
		spawnRing(x, y - 0.02, z, 0.4, 0.06, 0.55, 0.16, 0.3, 0.85, 0.2, 0.15);
	}

	function hitBurst(pos, colorHex = 0xffffff) {
		const r = ((colorHex >> 16) & 255) / 255;
		const g = ((colorHex >> 8) & 255) / 255;
		const b = (colorHex & 255) / 255;
		const x = pos.x;
		const y = pos.y;
		const z = pos.z;
		spawn(x, y, z, 0, 0, 0, 0.2, 0.12, 0.6, 0, 0, r, g, b, 0.5, FLASH, 0, 0, 1.0);
		for (let i = 0; i < 12; i++) {
			const a = Math.random() * Math.PI * 2;
			const el = rnd(-0.3, 1.1);
			const sp = rnd(1.8, 4.6);
			const ce = Math.cos(el);
			spawn(x, y, z, Math.cos(a) * ce * sp, Math.sin(el) * sp + 0.6, Math.sin(a) * ce * sp,
				rnd(0.16, 0.34), rnd(0.028, 0.045), 0.008, -6, 3.5, r, g, b, 0.45, SPARK, 0.12, 0, 1.0);
		}
		// a little debris/dust so the hit reads on a white background too
		for (let i = 0; i < 4; i++) {
			spawn(x, y, z, rnd(-0.8, 0.8), rnd(0.2, 1.0), rnd(-0.8, 0.8),
				rnd(0.35, 0.6), 0.07, 0.26, -0.3, 2.6, r * 0.75, g * 0.75, b * 0.75, 0.0, SOFT, 0, 0, 0.4);
		}
		spawnRing(x, y, z, 0.32, 0.05, 0.6, 0.14, r, g, b, 0.3);
	}

	function cushionPuff(x, y, z, strength = 0.6) {
		const s = strength < 0 ? 0 : strength > 3 ? 3 : strength;
		const k = Math.min(1.6, 0.5 + s * 0.5);
		// soft dust motes: cool grey-white so they read against white cushions
		const motes = 3 + Math.round(Math.min(s, 2) * 3);
		for (let i = 0; i < motes; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(0.25, 0.75) * k;
			const tone = rnd(0.80, 0.93);
			spawn(x + Math.cos(a) * 0.05, y + 0.02, z + Math.sin(a) * 0.05,
				Math.cos(a) * sp, rnd(0.25, 0.7) * k, Math.sin(a) * sp,
				rnd(0.5, 0.95), rnd(0.035, 0.06) * k, rnd(0.13, 0.22) * k, 0.12, 3.2,
				tone, tone, tone + 0.05, 0.0, SOFT, 0, 0, rnd(0.3, 0.5));
		}
		// loose stuffing fibres, tumbling and drifting down
		const fibres = 2 + Math.round(Math.min(s, 2.5) * 2);
		for (let i = 0; i < fibres; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(0.3, 1.0) * k;
			const tone = rnd(0.84, 0.97);
			spawn(x + Math.cos(a) * 0.06, y + 0.03, z + Math.sin(a) * 0.06,
				Math.cos(a) * sp, rnd(0.7, 1.6) * k, Math.sin(a) * sp,
				rnd(0.7, 1.3), rnd(0.03, 0.055), rnd(0.03, 0.055), -1.6, 2.4,
				tone, tone, tone * 0.99 + 0.02, 0.0, FIBRE, rnd(-7, 7), rnd(0, 6.28), rnd(0.55, 0.85));
		}
		// tiny bright specks catching the light
		if (s > 0.9) {
			for (let i = 0; i < 4; i++) {
				const a = Math.random() * Math.PI * 2;
				const sp = rnd(0.4, 1.3);
				spawn(x, y + 0.03, z, Math.cos(a) * sp, rnd(0.8, 1.8), Math.sin(a) * sp,
					rnd(0.6, 1.1), 0.014, 0.01, -2.2, 1.8, 0.9, 0.9, 0.95, 0.0, SOFT, 0, 0, 0.8);
			}
		}
	}

	function ring(x, z, colorHex = 0xffffff, y) {
		const r = ((colorHex >> 16) & 255) / 255;
		const g = ((colorHex >> 8) & 255) / 255;
		const b = (colorHex & 255) / 255;
		let yy = y;
		if (typeof yy !== "number") {
			const w = findWater(x, z, 0);
			yy = w ? w.surfaceY + 0.03 : 0.06;
		}
		spawnRing(x, yy, z, 0.95, 0.22, 0.95, 0.13, r, g, b, 0.15);
		spawnRing(x, yy + 0.004, z, 0.7, 0.1, 0.55, 0.18, r, g, b, 0.15);
	}

	// =============================================================================================
	// EXTENSIONS (levels 2-5)
	// =============================================================================================

	function clampN(n, def, lo, hi) {
		let v = typeof n === "number" && n === n ? Math.round(n) : def;
		if (v < lo) v = lo;
		if (v > hi) v = hi;
		return v;
	}
	function clampF(v, def, lo, hi) {
		const f = typeof v === "number" && v === v ? v : def;
		return f < lo ? lo : f > hi ? hi : f;
	}
	let cR = 1, cG = 1, cB = 1;
	function hexRGB(hex, def) {
		const h = typeof hex === "number" && hex === hex ? hex : def;
		cR = ((h >> 16) & 255) / 255;
		cG = ((h >> 8) & 255) / 255;
		cB = (h & 255) / 255;
	}

	// ------------------------------------------------------------------ ground (optional)
	// Where falling bits come to rest. Unset: each effect uses its own sensible floor (documented per effect).
	let groundFn = null;
	let waterFn = null;
	let groundY = null;
	function setGround(ground, water) {
		groundFn = typeof ground === "function" ? ground : null;
		groundY = typeof ground === "number" && ground === ground ? ground : null;
		waterFn = typeof water === "function" ? water : null;
	}
	function floorAt(x, z, fallback) {
		let f = fallback;
		if (groundFn) {
			const h = groundFn(x, z);
			if (typeof h === "number" && h === h) f = h;
		} else if (groundY !== null) {
			f = groundY;
		}
		if (waterFn) {
			const wy = waterFn(x, z);
			if (typeof wy === "number" && wy === wy && wy > f) f = wy;
		}
		if (waters.length) {
			const w = findWater(x, z, 0);
			if (w && w.surfaceY > f) f = w.surfaceY;
		}
		return f;
	}

	// Same closed form as the shaders: linear drag k, gravity g, terminal velocity g / k.
	function yAt(y0, vy, grav, k, t) {
		const vt = grav / k;
		return y0 + (vy - vt) * (1 - Math.exp(-k * t)) / k + vt * t;
	}
	// First time the height crosses `target` going down (dir -1) or up (dir +1). `maxT` if it never does.
	function timeToY(y0, vy, grav, k, target, dir, maxT) {
		let t = 0;
		let prev = (y0 - target) * -dir;
		let step = 0.03;
		let everAbove = prev > 0;
		for (let i = 0; i < 44; i++) {
			const t2 = t + step;
			const cur = (yAt(y0, vy, grav, k, t2) - target) * -dir;
			if (prev > 0 && cur <= 0) {
				let lo = t;
				let hi = t2;
				for (let j = 0; j < 14; j++) {
					const mid = (lo + hi) * 0.5;
					if ((yAt(y0, vy, grav, k, mid) - target) * -dir > 0) lo = mid;
					else hi = mid;
				}
				return hi > maxT ? maxT : hi;
			}
			if (cur > 0) everAbove = true;
			prev = cur;
			t = t2;
			if (t > maxT) break;
			step *= 1.18;
		}
		return everAbove ? maxT : 0;
	}
	let landT = 0, landX = 0, landY = 0, landZ = 0;
	function solveLand(x, y, z, vx, vy, vz, grav, k, floor0, useGround, maxT) {
		let f = floor0;
		let t = timeToY(y, vy, grav, k, f, -1, maxT);
		let e = (1 - Math.exp(-k * t)) / k;
		if (useGround && (groundFn || waterFn || waters.length) && t < maxT) {
			f = floorAt(x + vx * e, z + vz * e, floor0);
			t = timeToY(y, vy, grav, k, f, -1, maxT);
			e = (1 - Math.exp(-k * t)) / k;
		}
		landT = t;
		landX = x + vx * e;
		landZ = z + vz * e;
		landY = f;
		return t;
	}

	// ------------------------------------------------------------------ extended particles (1 draw call)
	const xData = new Float32Array(MAX_XP * XP_STRIDE);
	const xBuffer = new THREE.InstancedInterleavedBuffer(xData, XP_STRIDE, 1);
	xBuffer.setUsage(THREE.DynamicDrawUsage);
	const xGeo = new THREE.InstancedBufferGeometry();
	xGeo.setAttribute("position", new THREE.BufferAttribute(quad, 3));
	xGeo.setIndex(quadIndex);
	xGeo.setAttribute("aPos", new THREE.InterleavedBufferAttribute(xBuffer, 4, 0));
	xGeo.setAttribute("aVel", new THREE.InterleavedBufferAttribute(xBuffer, 4, 4));
	xGeo.setAttribute("aParm", new THREE.InterleavedBufferAttribute(xBuffer, 4, 8));
	xGeo.setAttribute("aCol", new THREE.InterleavedBufferAttribute(xBuffer, 4, 12));
	xGeo.setAttribute("aMisc", new THREE.InterleavedBufferAttribute(xBuffer, 4, 16));
	xGeo.setAttribute("aExt", new THREE.InterleavedBufferAttribute(xBuffer, 4, 20));
	xGeo.instanceCount = MAX_XP;
	const xMat = new THREE.ShaderMaterial({
		uniforms: { uTime },
		vertexShader: XP_VERT,
		fragmentShader: XP_FRAG,
		transparent: true,
		depthWrite: false,
		premultipliedAlpha: true,
		blending: THREE.NormalBlending,
		side: THREE.DoubleSide,
	});
	const xparticles = new THREE.Mesh(xGeo, xMat);
	xparticles.name = "fx-xparticles";
	xparticles.frustumCulled = false;
	xparticles.renderOrder = 4;
	xparticles.visible = false;
	xparticles.castShadow = false;
	xparticles.receiveShadow = false;
	group.add(xparticles);
	let xCursor = 0;
	let xAliveUntil = -1;
	// dirty span (instances) since the last upload; a reused range object keeps the upload small
	let xLo = MAX_XP;
	let xHi = -1;
	let xWrapped = false;
	const xRange = { start: 0, count: 0 };
	let xPending = false; // an upload was requested and has not reached the GPU yet
	xBuffer.onUpload(() => {
		xPending = false;
	});

	// stop: age at which motion freezes (NEVER = keeps moving). delay: seconds before it appears.
	function xs(x, y, z, vx, vy, vz, life, size0, size1, grav, drag, r, g, b, additive, shape, stretch, rot, alpha,
		stop, wobAmp, wobFreq, delay) {
		const i = xCursor;
		const o = i * XP_STRIDE;
		xCursor = xCursor + 1;
		if (xCursor >= MAX_XP) {
			xCursor = 0;
			xWrapped = true;
		}
		const t0 = now + delay;
		xData[o] = x; xData[o + 1] = y; xData[o + 2] = z; xData[o + 3] = t0;
		xData[o + 4] = vx; xData[o + 5] = vy; xData[o + 6] = vz; xData[o + 7] = life;
		xData[o + 8] = size0; xData[o + 9] = size1; xData[o + 10] = grav; xData[o + 11] = drag;
		xData[o + 12] = r; xData[o + 13] = g; xData[o + 14] = b; xData[o + 15] = additive;
		xData[o + 16] = shape; xData[o + 17] = stretch; xData[o + 18] = rot; xData[o + 19] = alpha;
		xData[o + 20] = stop; xData[o + 21] = wobAmp; xData[o + 22] = wobFreq; xData[o + 23] = Math.random();
		if (i < xLo) xLo = i;
		if (i > xHi) xHi = i;
		if (t0 + life > xAliveUntil) xAliveUntil = t0 + life;
		xparticles.visible = true;
	}

	// ------------------------------------------------------------------ flakes: shards + confetti (1 draw call)
	const fData = new Float32Array(MAX_FLAKES * FL_STRIDE);
	const fBuffer = new THREE.InstancedInterleavedBuffer(fData, FL_STRIDE, 1);
	fBuffer.setUsage(THREE.DynamicDrawUsage);
	const fGeo = new THREE.InstancedBufferGeometry();
	fGeo.setAttribute("position", new THREE.BufferAttribute(quad, 3));
	fGeo.setIndex(quadIndex);
	fGeo.setAttribute("aPos", new THREE.InterleavedBufferAttribute(fBuffer, 4, 0));
	fGeo.setAttribute("aVel", new THREE.InterleavedBufferAttribute(fBuffer, 4, 4));
	fGeo.setAttribute("aPhys", new THREE.InterleavedBufferAttribute(fBuffer, 4, 8));
	fGeo.setAttribute("aRot", new THREE.InterleavedBufferAttribute(fBuffer, 4, 12));
	fGeo.setAttribute("aCol", new THREE.InterleavedBufferAttribute(fBuffer, 4, 16));
	fGeo.setAttribute("aShp", new THREE.InterleavedBufferAttribute(fBuffer, 4, 20));
	fGeo.instanceCount = MAX_FLAKES;
	const uGlint = { value: new THREE.Vector3(1.0, 0.98, 0.95) };
	const fMat = new THREE.ShaderMaterial({
		uniforms: { uTime, uSun, uGlint },
		vertexShader: FLAKE_VERT,
		fragmentShader: FLAKE_FRAG,
		transparent: true,
		depthWrite: false,
		premultipliedAlpha: true,
		blending: THREE.NormalBlending,
		side: THREE.DoubleSide,
	});
	const flakes = new THREE.Mesh(fGeo, fMat);
	flakes.name = "fx-flakes";
	flakes.frustumCulled = false;
	flakes.renderOrder = 3;
	flakes.visible = false;
	flakes.castShadow = false;
	flakes.receiveShadow = false;
	group.add(flakes);
	let confCursor = 0; // instances [0, MAX_CONFETTI)
	let shardCursor = 0; // instances [MAX_CONFETTI, MAX_FLAKES)
	let fDirty = false;
	let fAliveUntil = -1;

	function flake(i, x, y, z, vx, vy, vz, life, grav, drag, tLand, hop, axAz, axY, spin, rot0, r, g, b, kind, hx, hy, flutter) {
		const o = i * FL_STRIDE;
		fData[o] = x; fData[o + 1] = y; fData[o + 2] = z; fData[o + 3] = now;
		fData[o + 4] = vx; fData[o + 5] = vy; fData[o + 6] = vz; fData[o + 7] = life;
		fData[o + 8] = grav; fData[o + 9] = drag; fData[o + 10] = tLand; fData[o + 11] = hop;
		fData[o + 12] = axAz; fData[o + 13] = axY; fData[o + 14] = spin; fData[o + 15] = rot0;
		fData[o + 16] = r; fData[o + 17] = g; fData[o + 18] = b; fData[o + 19] = kind;
		fData[o + 20] = hx; fData[o + 21] = hy; fData[o + 22] = Math.random(); fData[o + 23] = flutter;
		fDirty = true;
		if (now + life > fAliveUntil) fAliveUntil = now + life;
		flakes.visible = true;
	}

	// ------------------------------------------------------------------ extended rings (1 draw call)
	const xrData = new Float32Array(MAX_XRINGS * XR_STRIDE);
	const xrBuffer = new THREE.InstancedInterleavedBuffer(xrData, XR_STRIDE, 1);
	xrBuffer.setUsage(THREE.DynamicDrawUsage);
	const xrGeo = new THREE.InstancedBufferGeometry();
	xrGeo.setAttribute("position", new THREE.BufferAttribute(quad, 3));
	xrGeo.setIndex(quadIndex);
	xrGeo.setAttribute("aRing", new THREE.InterleavedBufferAttribute(xrBuffer, 4, 0));
	xrGeo.setAttribute("aRing2", new THREE.InterleavedBufferAttribute(xrBuffer, 4, 4));
	xrGeo.setAttribute("aRCol", new THREE.InterleavedBufferAttribute(xrBuffer, 4, 8));
	xrGeo.setAttribute("aRExt", new THREE.InterleavedBufferAttribute(xrBuffer, 4, 12));
	xrGeo.setAttribute("aRExt2", new THREE.InterleavedBufferAttribute(xrBuffer, 4, 16));
	xrGeo.instanceCount = MAX_XRINGS;
	const xrMat = new THREE.ShaderMaterial({
		uniforms: { uTime },
		vertexShader: XRING_VERT,
		fragmentShader: XRING_FRAG,
		transparent: true,
		depthWrite: false,
		premultipliedAlpha: true,
		blending: THREE.NormalBlending,
		side: THREE.DoubleSide,
	});
	const xrings = new THREE.Mesh(xrGeo, xrMat);
	xrings.name = "fx-xrings";
	xrings.frustumCulled = false;
	xrings.renderOrder = 2;
	xrings.visible = false;
	xrings.castShadow = false;
	xrings.receiveShadow = false;
	group.add(xrings);
	let xrCursor = 0;
	let xrDirty = false;
	let xrAliveUntil = -1;

	function xring(x, y, z, life, r0, r1, thick, r, g, b, additive, style, yaw, stretch, alpha, upright, hold, delay) {
		const o = xrCursor * XR_STRIDE;
		xrCursor = (xrCursor + 1) % MAX_XRINGS;
		const t0 = now + delay;
		xrData[o] = x; xrData[o + 1] = y; xrData[o + 2] = z; xrData[o + 3] = t0;
		xrData[o + 4] = life; xrData[o + 5] = r0; xrData[o + 6] = r1; xrData[o + 7] = thick;
		xrData[o + 8] = r; xrData[o + 9] = g; xrData[o + 10] = b; xrData[o + 11] = additive;
		xrData[o + 12] = yaw; xrData[o + 13] = stretch; xrData[o + 14] = style; xrData[o + 15] = alpha;
		xrData[o + 16] = upright; xrData[o + 17] = Math.random(); xrData[o + 18] = hold; xrData[o + 19] = 0;
		xrDirty = true;
		if (t0 + life > xrAliveUntil) xrAliveUntil = t0 + life;
		xrings.visible = true;
	}

	// ------------------------------------------------------------------ ambient: heat cards + motes (1 draw call)
	const AMB_COUNT = MAX_HEAT + MAX_MOTES;
	const aData = new Float32Array(AMB_COUNT * AMB_STRIDE);
	for (let i = 0; i < MAX_MOTES; i++) {
		const o = (MAX_HEAT + i) * AMB_STRIDE;
		aData[o] = Math.random(); aData[o + 1] = Math.random(); aData[o + 2] = Math.random(); aData[o + 3] = 1;
		const big = Math.random() < 0.12;
		aData[o + 4] = big ? rnd(0.03, 0.05) : rnd(0.011, 0.024); // size (m)
		aData[o + 5] = Math.random();                              // twinkle rate
		aData[o + 6] = Math.random();                              // phase / heading seed
		aData[o + 7] = big ? rnd(0.1, 0.18) : rnd(0.28, 0.6);      // alpha
	}
	const aBuffer = new THREE.InstancedInterleavedBuffer(aData, AMB_STRIDE, 1);
	aBuffer.setUsage(THREE.DynamicDrawUsage);
	const aGeo = new THREE.InstancedBufferGeometry();
	aGeo.setAttribute("position", new THREE.BufferAttribute(quad, 3));
	aGeo.setIndex(quadIndex);
	aGeo.setAttribute("aA", new THREE.InterleavedBufferAttribute(aBuffer, 4, 0));
	aGeo.setAttribute("aB", new THREE.InterleavedBufferAttribute(aBuffer, 4, 4));
	aGeo.instanceCount = AMB_COUNT;
	const uBoxMin = { value: new THREE.Vector3(-8, 0.3, -8) };
	const uBoxSize = { value: new THREE.Vector3(16, 7, 16) };
	const uMote = { value: 0 };
	const aMat = new THREE.ShaderMaterial({
		uniforms: { uTime, uBoxMin, uBoxSize, uMote },
		vertexShader: AMB_VERT,
		fragmentShader: AMB_FRAG,
		transparent: true,
		depthWrite: false,
		premultipliedAlpha: true,
		blending: THREE.NormalBlending,
		side: THREE.DoubleSide,
	});
	const ambient = new THREE.Mesh(aGeo, aMat);
	ambient.name = "fx-ambient";
	ambient.frustumCulled = false;
	ambient.renderOrder = 5;
	ambient.visible = false;
	ambient.castShadow = false;
	ambient.receiveShadow = false;
	group.add(ambient);
	let aDirty = false;
	let heatLive = 0;
	let heatCursor = 0;
	let moteTarget = 0;
	let moteFade = 0;
	const heatHandles = [];
	for (let i = 0; i < MAX_HEAT; i++) {
		const h = {
			active: false,
			index: i,
			remove() {
				if (!h.active) return;
				h.active = false;
				aData[i * AMB_STRIDE + 7] = 0;
				aDirty = true;
				heatLive--;
			},
			// extras: retune a live card without re-creating it
			set(x, y, z, w, hh) {
				if (!h.active) return h;
				const o = i * AMB_STRIDE;
				aData[o] = x; aData[o + 1] = y; aData[o + 2] = z;
				if (typeof w === "number") aData[o + 4] = w;
				if (typeof hh === "number") aData[o + 5] = hh;
				aDirty = true;
				return h;
			},
			setStrength(s) {
				if (!h.active) return h;
				aData[i * AMB_STRIDE + 7] = Math.max(0.001, s) * 0.2;
				aDirty = true;
				return h;
			},
		};
		heatHandles.push(h);
	}

	// ------------------------------------------------------------------ water effects
	// splash(x, y, z, size): y is the water surface. The showpiece: froth disc + foam ring + ripples on
	// the surface, a crown of sheets tipped with beads, a late central jet, spray whose drops ring the
	// water where they come down, and a breath of mist.
	function splash(x, y, z, size = 0.5) {
		const s = clampF(size, 0.5, 0.05, 1.25);
		const S = 0.4 + 0.6 * s;
		const sy = y + 0.012;
		rippleAt(x, z, 0.8 + 2.0 * s);

		xring(x, sy, z, 0.45 + 0.25 * s, 0.04, 0.16 + 0.34 * s, 0.5, 1, 1, 1, 0.12, R_FROTH, rnd(0, 6.28), 1, 0.8, 0, 0, 0);
		xring(x, sy + 0.002, z, 0.8 + 0.5 * s, 0.08, 0.5 + 1.0 * s, 0.2, 0.96, 0.99, 1, 0.18, R_FOAM, rnd(0, 6.28), 1, 0.9, 0, 0, 0);
		xring(x, sy + 0.001, z, 1.2 + 0.5 * s, 0.1, 0.9 + 1.5 * s, 0.07, 0.9, 0.97, 1, 0.35, R_CLEAN, 0, 1, 0.55, 0, 0, 0.1);
		xring(x, sy + 0.001, z, 1.1 + 0.4 * s, 0.06, 0.6 + 1.1 * s, 0.08, 0.9, 0.97, 1, 0.35, R_CLEAN, 0, 1, 0.4, 0, 0, 0.3);

		// crown
		const nc = 9 + Math.round(11 * s);
		const r0 = 0.05 + 0.09 * s;
		for (let i = 0; i < nc; i++) {
			const a = ((i + rnd(-0.3, 0.3)) / nc) * Math.PI * 2;
			const ca = Math.cos(a);
			const sa = Math.sin(a);
			const out = rnd(0.55, 1.0) * (0.5 + 0.9 * s);
			const up = rnd(1.9, 2.7) * (0.55 + 0.75 * s);
			let tl = timeToY(y + 0.01, up, -9.8, 0.5, y, -1, 3);
			xs(x + ca * r0, y + 0.01, z + sa * r0, ca * out, up, sa * out, tl, rnd(0.024, 0.036) * S, rnd(0.014, 0.02) * S,
				-9.8, 0.5, 0.86, 0.95, 1.0, 0.3, X_SHEET, 0.42, 0, 0.8, NEVER, 0, 0, 0);
			tl = timeToY(y + 0.01, up * 1.14, -9.8, 0.4, y, -1, 3);
			xs(x + ca * r0, y + 0.01, z + sa * r0, ca * out * 1.2, up * 1.14, sa * out * 1.2, tl, rnd(0.013, 0.024) * S, rnd(0.01, 0.016) * S,
				-9.8, 0.4, 0.8, 0.93, 0.99, 0.12, X_DROP, 0.03, 0, 0.95, NEVER, 0, 0, 0);
		}
		// the jet that rebounds out of the closing cavity
		if (s > 0.25) {
			const nj = 3 + Math.round(3 * s);
			const jd = 0.12 + 0.06 * s;
			for (let j = 0; j < nj; j++) {
				const vy = (2.4 + 2.6 * s) * (1 - j * 0.13);
				const tl = timeToY(y + 0.01, vy, -9.8, 0.4, y, -1, 3);
				xs(x + rnd(-0.01, 0.01), y + 0.01, z + rnd(-0.01, 0.01), rnd(-0.12, 0.12), vy, rnd(-0.12, 0.12), tl,
					(j === 0 ? 0.022 : 0.034) * S, 0.016 * S, -9.8, 0.4, 0.86, 0.95, 1.0, j === 0 ? 0.12 : 0.3,
					j === 0 ? X_DROP : X_SHEET, j === 0 ? 0.03 : 0.5, 0, 0.9, NEVER, 0, 0, jd);
			}
		}
		// spray; every third drop rings the surface where it lands
		const nd = 6 + Math.round(20 * s);
		for (let i = 0; i < nd; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(0.5, 2.8) * (0.5 + 0.7 * s);
			const vx = Math.cos(a) * sp;
			const vz = Math.sin(a) * sp;
			const vy = rnd(1.2, 4.2) * (0.45 + 0.7 * s);
			const tl = timeToY(y + 0.02, vy, -9.8, 0.8, y, -1, 3);
			xs(x, y + 0.02, z, vx, vy, vz, tl, rnd(0.008, 0.02) * S + 0.004, 0.008, -9.8, 0.8,
				0.8, 0.93, 0.99, 0.12, X_DROP, 0.03, 0, 0.95, NEVER, 0, 0, 0);
			if (i % 3 === 0) {
				const e = (1 - Math.exp(-0.8 * tl)) / 0.8;
				xring(x + vx * e, sy, z + vz * e, 0.45, 0.012, 0.13, 0.16, 0.92, 0.98, 1, 0.3, R_CLEAN, 0, 1, 0.55, 0, 0, tl);
			}
		}
		// mist + churned foam at the foot
		const nm = 3 + Math.round(5 * s);
		for (let i = 0; i < nm; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(0.1, 0.5) * S;
			xs(x + Math.cos(a) * 0.06, y + rnd(0.03, 0.12), z + Math.sin(a) * 0.06, Math.cos(a) * sp, rnd(0.3, 0.9) * S, Math.sin(a) * sp,
				rnd(0.5, 0.9), 0.07 * S, rnd(0.22, 0.34) * S, 0.2, 3.0, 0.95, 0.98, 1.0, 0.35, X_SOFT, 0, 0, 0.22, NEVER, 0, 0, 0);
		}
		const nf = 3 + Math.round(3 * s);
		for (let i = 0; i < nf; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(0.2, 0.7) * S;
			xs(x + Math.cos(a) * r0, y + 0.02, z + Math.sin(a) * r0, Math.cos(a) * sp, rnd(0.0, 0.25), Math.sin(a) * sp,
				rnd(0.45, 0.8), 0.03 * S, rnd(0.05, 0.08) * S, -0.4, 3.5, 1, 1, 1, 0.1, X_FOAM, 0, rnd(0, 6.28), 0.7, NEVER, 0, 0, 0);
		}
	}

	// droplets(vec3, n): water shaken off / dripping from a point. They fall to the ground (setGround), a
	// water surface under them, or simply fade after a short fall when no ground is known.
	function droplets(pos, n = 8) {
		const cnt = clampN(n, 8, 1, 48);
		const x = pos.x;
		const y = pos.y;
		const z = pos.z;
		const known = !!(groundFn || waterFn || groundY !== null || (waters.length && findWater(x, z, 0.3)));
		for (let i = 0; i < cnt; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(0.3, 1.7);
			const vx = Math.cos(a) * sp;
			const vz = Math.sin(a) * sp;
			const vy = rnd(0.4, 2.3);
			let life = rnd(0.45, 0.8);
			if (known) {
				solveLand(x, y, z, vx, vy, vz, -9.8, 0.7, floorAt(x, z, y - 0.6), true, 2.5);
				life = Math.max(0.08, landT);
				if (i % 3 === 0 && landT < 2.5) {
					xring(landX, landY + 0.012, landZ, 0.4, 0.01, 0.1, 0.18, 0.9, 0.97, 1, 0.3, R_CLEAN, 0, 1, 0.45, 0, 0, landT);
				}
			}
			xs(x + rnd(-0.03, 0.03), y + rnd(-0.02, 0.03), z + rnd(-0.03, 0.03), vx, vy, vz, life, rnd(0.008, 0.02), 0.007,
				-9.8, 0.7, 0.8, 0.93, 0.99, 0.12, X_DROP, 0.035, 0, 0.95, NEVER, 0, 0, 0);
		}
	}

	// bubbles(x, y, z, n, surfaceY): rise wobbling and pop exactly at the surface (with a tiny ring for some).
	// Without surfaceY they rise for a couple of seconds and pop.
	function bubbles(x, y, z, n = 6, surfaceY) {
		const cnt = clampN(n, 6, 1, 40);
		const hasSurf = typeof surfaceY === "number" && surfaceY === surfaceY;
		for (let i = 0; i < cnt; i++) {
			const a = Math.random() * Math.PI * 2;
			const rr = rnd(0, 0.07);
			const big = Math.random() < 0.2;
			const size = big ? rnd(0.028, 0.042) : rnd(0.009, 0.022);
			const k = 2.6;
			const rise = (big ? rnd(0.55, 0.8) : rnd(0.3, 0.6)) * k; // buoyancy: terminal rise = this / k
			const bx = x + Math.cos(a) * rr;
			const by = y + rnd(-0.03, 0.03);
			const bz = z + Math.sin(a) * rr;
			const vx = Math.cos(a) * rnd(0, 0.25);
			const vz = Math.sin(a) * rnd(0, 0.25);
			const vy = rnd(0.1, 0.7);
			const delay = i * rnd(0.01, 0.045);
			let life;
			if (hasSurf) {
				life = by >= surfaceY ? 0.12 : timeToY(by, vy, rise, k, surfaceY - size * 0.5, 1, 7);
				if (life < 0.1) life = 0.1;
				if (i % 3 === 0 && life < 7) {
					const e = (1 - Math.exp(-k * life)) / k;
					xring(bx + vx * e, surfaceY + 0.012, bz + vz * e, 0.4, 0.008, 0.05 + size * 2.2, 0.2, 0.92, 0.98, 1, 0.3,
						R_CLEAN, 0, 1, 0.5, 0, 0, delay + life);
				}
			} else {
				life = rnd(1.4, 2.4);
			}
			xs(bx, by, bz, vx, vy, vz, life, size * 0.8, size * 1.15, rise, k, 0.82, 0.95, 1.0, 0.35, X_BUBBLE, 0, 0, 0.9,
				NEVER, rnd(0.012, 0.035), rnd(5, 9), delay);
		}
	}

	// bubbleRing(x, y, z, yaw, r): an upright hoop of bubbles facing along yaw; hangs ~6 s, then the
	// bubbles pop one after another. A faint halo makes it read as something to swim through.
	function bubbleRing(x, y, z, yaw = 0, r = 0.6) {
		const rad = clampF(r, 0.6, 0.15, 3);
		const cy = Math.cos(yaw);
		const sy = Math.sin(yaw);
		const nb = clampN((Math.PI * 2 * rad) / 0.15, 20, 12, 30);
		for (let i = 0; i < nb; i++) {
			const a = ((i + rnd(-0.25, 0.25)) / nb) * Math.PI * 2;
			const rr = rad * rnd(0.96, 1.04);
			const ox = Math.cos(a) * rr;
			const size = rnd(0.02, 0.042);
			xs(x + cy * ox, y + Math.sin(a) * rr, z - sy * ox, 0, 0, 0, rnd(5.5, 6.5), size * 0.6, size, 0.012, 0.6,
				0.82, 0.95, 1.0, 0.35, X_BUBBLE, 0, 0, 0.92, NEVER, rnd(0.006, 0.016), rnd(1.5, 3.2), i * 0.012);
		}
		// a few loose ones that slip away upward
		for (let i = 0; i < 6; i++) {
			const a = Math.random() * Math.PI * 2;
			const ox = Math.cos(a) * rad;
			xs(x + cy * ox, y + Math.sin(a) * rad, z - sy * ox, 0, rnd(0.05, 0.2), 0, rnd(0.9, 1.6), 0.008, 0.014, 0.9, 2.6,
				0.82, 0.95, 1.0, 0.35, X_BUBBLE, 0, 0, 0.8, NEVER, 0.02, rnd(5, 8), rnd(0.1, 0.8));
		}
		xring(x, y, z, 6.2, rad, rad, 0.09, 0.55, 0.9, 1.0, 0.6, R_HALO, yaw, 1, 0.3, 1, 1, 0);
		xring(x, y, z, 0.6, rad * 0.5, rad * 1.15, 0.1, 0.8, 0.96, 1.0, 0.5, R_CLEAN, yaw, 1, 0.5, 1, 0, 0);
	}

	// wake(x, z, surfaceY, strength): call while swimming (every frame is fine: it meters itself per
	// swimmer). Leaves a trail of foam rings stretched along the heading, plus a little foam and spray.
	const WAKES = 4;
	const wakeX = new Float32Array(WAKES);
	const wakeZ = new Float32Array(WAKES);
	const wakeT = new Float32Array(WAKES).fill(-100);
	function wake(x, z, surfaceY, strength = 0.6) {
		const s = clampF(strength, 0.6, 0, 1.5);
		if (s <= 0.01) return;
		const y = typeof surfaceY === "number" && surfaceY === surfaceY ? surfaceY : floorAt(x, z, 0);
		// which swimmer is this? the tracked one nearest (within 0.7 m of its last ring), else the stalest slot
		let slot = -1;
		let best = 0.49;
		let oldest = 0;
		for (let i = 0; i < WAKES; i++) {
			if (wakeT[i] < wakeT[oldest]) oldest = i;
			if (now - wakeT[i] > 1.5) continue;
			const dx = x - wakeX[i];
			const dz = z - wakeZ[i];
			const d2 = dx * dx + dz * dz;
			if (d2 < best) {
				best = d2;
				slot = i;
			}
		}
		let dx = 0;
		let dz = 0;
		if (slot < 0) {
			slot = oldest;
		} else {
			dx = x - wakeX[slot];
			dz = z - wakeZ[slot];
			const moved = Math.sqrt(dx * dx + dz * dz);
			if (now - wakeT[slot] < 0.09) return;
			if (moved < 0.02 && now - wakeT[slot] < 0.5) return; // treading water: slow pulses only
		}
		wakeX[slot] = x;
		wakeZ[slot] = z;
		wakeT[slot] = now;
		const dl = Math.sqrt(dx * dx + dz * dz);
		const yaw = dl > 1e-3 ? Math.atan2(-dx, -dz) : 0; // rings trail BEHIND the swimmer
		const st = dl > 1e-3 ? 1.35 : 1;
		rippleAt(x, z, 0.3 + 0.5 * s);
		xring(x, y + 0.012, z, 0.7 + 0.5 * s, 0.07, 0.3 + 0.45 * s, 0.2, 0.95, 0.99, 1, 0.2, R_FOAM, yaw, st, 0.3 + 0.4 * Math.min(s, 1), 0, 0, 0);
		if (s > 0.35) {
			const px = dl > 1e-3 ? -dz / dl : 1;
			const pz = dl > 1e-3 ? dx / dl : 0;
			for (let i = 0; i < 2; i++) {
				const side = i === 0 ? 1 : -1;
				const sp = rnd(0.25, 0.6) * s * side;
				xs(x + px * 0.08 * side, y + 0.015, z + pz * 0.08 * side, px * sp, 0, pz * sp, rnd(0.45, 0.8), 0.02, rnd(0.04, 0.06),
					0, 3.0, 1, 1, 1, 0.1, X_FOAM, 0, rnd(0, 6.28), 0.55, NEVER, 0, 0, 0);
			}
		}
		if (s > 0.7) {
			const nd = s > 1.1 ? 3 : 2;
			for (let i = 0; i < nd; i++) {
				const a = Math.random() * Math.PI * 2;
				const sp = rnd(0.3, 1.0);
				const vy = rnd(0.8, 1.9) * s;
				const tl = timeToY(y + 0.02, vy, -9.8, 0.8, y, -1, 2);
				xs(x, y + 0.02, z, Math.cos(a) * sp, vy, Math.sin(a) * sp, tl, rnd(0.008, 0.015), 0.007, -9.8, 0.8,
					0.8, 0.93, 0.99, 0.12, X_DROP, 0.03, 0, 0.9, NEVER, 0, 0, 0);
			}
		}
	}

	// ------------------------------------------------------------------ small joys
	function coinSparkle(pos) {
		const x = pos.x;
		const y = pos.y;
		const z = pos.z;
		xs(x, y, z, 0, 0, 0, 0.36, 0.05, 0.26, 0, 1, 1.0, 0.86, 0.35, 0.7, X_STAR, 0.8, rnd(0, 1.5), 1.0, NEVER, 0, 0, 0);
		for (let i = 0; i < 8; i++) {
			const a = Math.random() * Math.PI * 2;
			const el = rnd(-0.2, 1.2);
			const sp = rnd(0.5, 1.6);
			const ce = Math.cos(el);
			const pale = Math.random() < 0.35;
			xs(x, y, z, Math.cos(a) * ce * sp, Math.sin(el) * sp + 0.4, Math.sin(a) * ce * sp, rnd(0.4, 0.75), rnd(0.022, 0.04), 0.012,
				-1.6, 2.6, 1.0, pale ? 0.97 : 0.82, pale ? 0.75 : 0.25, 0.65, X_STAR, rnd(-3, 3), rnd(0, 1.5), 1.0, NEVER, 0, 0, 0);
		}
		xring(x, y, z, 0.38, 0.03, 0.3, 0.14, 1.0, 0.85, 0.3, 0.5, R_CLEAN, 0, 1, 0.7, 0, 0, 0);
	}

	function hearts(pos, n = 3) {
		const cnt = clampN(n, 3, 1, 12);
		for (let i = 0; i < cnt; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(0.15, 0.5);
			const k = 1.6;
			const tone = Math.random();
			xs(pos.x + rnd(-0.05, 0.05), pos.y + rnd(-0.02, 0.05), pos.z + rnd(-0.05, 0.05),
				Math.cos(a) * sp, rnd(0.5, 1.0), Math.sin(a) * sp, rnd(1.2, 1.7), 0.028, rnd(0.055, 0.085),
				rnd(0.3, 0.5) * k, k, 1.0, 0.3 + tone * 0.2, 0.46 + tone * 0.18, 0.0, X_HEART, rnd(0.18, 0.35), rnd(-0.25, 0.25), 0.96,
				NEVER, rnd(0.03, 0.07), rnd(2.2, 3.6), i * 0.09);
		}
	}

	function sparkle(pos, colorHex = 0xfff2a8, n = 8) {
		const cnt = clampN(n, 8, 1, 32);
		hexRGB(colorHex, 0xfff2a8);
		const x = pos.x;
		const y = pos.y;
		const z = pos.z;
		xs(x, y, z, 0, 0, 0, 0.3, 0.04, 0.2, 0, 1, cR, cG, cB, 0.7, X_STAR, 0.6, rnd(0, 1.5), 0.9, NEVER, 0, 0, 0);
		for (let i = 0; i < cnt; i++) {
			const a = Math.random() * Math.PI * 2;
			const el = rnd(-0.6, 1.3);
			const sp = rnd(0.3, 1.5);
			const ce = Math.cos(el);
			const w = Math.random() < 0.3 ? 0.5 : 0; // some paler
			xs(x + rnd(-0.03, 0.03), y + rnd(-0.03, 0.03), z + rnd(-0.03, 0.03),
				Math.cos(a) * ce * sp, Math.sin(el) * sp + 0.25, Math.sin(a) * ce * sp, rnd(0.45, 0.95), rnd(0.018, 0.04), 0.01,
				-0.9, 2.8, cR + (1 - cR) * w, cG + (1 - cG) * w, cB + (1 - cB) * w, 0.65, X_STAR, rnd(-3, 3), rnd(0, 1.5), 1.0,
				NEVER, 0.01, rnd(2, 5), i * 0.012);
		}
	}

	// crumbs(vec3): bits dropping from a munching mouth; they land (setGround, else ~0.1 below) and stay a moment.
	function crumbs(pos) {
		const x = pos.x;
		const y = pos.y;
		const z = pos.z;
		const f0 = floorAt(x, z, y - 0.1);
		for (let i = 0; i < 7; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(0.15, 0.7);
			const vx = Math.cos(a) * sp;
			const vz = Math.sin(a) * sp;
			const vy = rnd(0.3, 1.2);
			solveLand(x, y, z, vx, vy, vz, -9.8, 0.8, f0 + 0.008, true, 2);
			const t = Math.random();
			const pink = Math.random() < 0.3;
			xs(x, y, z, vx, vy, vz, landT + rnd(0.7, 1.2), rnd(0.008, 0.014), rnd(0.007, 0.011), -9.8, 0.8,
				pink ? 0.85 : 0.5 + t * 0.25, pink ? 0.55 : 0.36 + t * 0.2, pink ? 0.5 : 0.2 + t * 0.12, 0.0,
				X_GRAIN, rnd(-14, 14), rnd(0, 6.28), 1.0, landT, 0, 0, i * 0.015);
		}
		xs(x, y, z, 0, 0.15, 0, 0.45, 0.02, 0.07, 0.1, 3, 0.8, 0.7, 0.55, 0.0, X_SOFT, 0, 0, 0.3, NEVER, 0, 0, 0);
	}

	function sandPuff(x, y, z, strength = 0.6) {
		noteY(y);
		const s = clampF(strength, 0.6, 0, 2);
		const k = 0.55 + 0.45 * s;
		const nm = 4 + Math.round(5 * Math.min(s, 1.5));
		for (let i = 0; i < nm; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(0.3, 1.0) * k;
			const tone = rnd(0.0, 1.0);
			xs(x + Math.cos(a) * 0.04, y + 0.03, z + Math.sin(a) * 0.04, Math.cos(a) * sp, rnd(0.25, 0.9) * k, Math.sin(a) * sp,
				rnd(0.55, 1.0), rnd(0.04, 0.07) * k, rnd(0.15, 0.26) * k, 0.12, 3.0,
				0.86 + tone * 0.08, 0.76 + tone * 0.08, 0.56 + tone * 0.1, 0.0, X_SOFT, 0, 0, rnd(0.3, 0.48), NEVER, 0, 0, 0);
		}
		const ng = 6 + Math.round(9 * Math.min(s, 1.5));
		for (let i = 0; i < ng; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(0.4, 1.6) * k;
			const vx = Math.cos(a) * sp;
			const vz = Math.sin(a) * sp;
			const vy = rnd(0.9, 2.6) * k;
			solveLand(x, y + 0.02, z, vx, vy, vz, -9.8, 0.9, y + 0.006, true, 2);
			const tone = rnd(0.0, 1.0);
			xs(x, y + 0.02, z, vx, vy, vz, landT + rnd(0.4, 0.9), rnd(0.006, 0.012), 0.006, -9.8, 0.9,
				0.78 + tone * 0.14, 0.66 + tone * 0.14, 0.44 + tone * 0.14, 0.0, X_GRAIN, rnd(-16, 16), rnd(0, 6.28), 1.0,
				landT, 0, 0, 0);
		}
	}

	function dust(x, y, z, strength = 0.5) {
		noteY(y);
		const s = clampF(strength, 0.5, 0, 2);
		const k = 0.5 + 0.5 * s;
		const nm = 4 + Math.round(6 * Math.min(s, 1.5));
		const a0 = Math.random() * Math.PI * 2;
		for (let i = 0; i < nm; i++) {
			const a = a0 + ((i + rnd(-0.3, 0.3)) / nm) * Math.PI * 2;
			const sp = rnd(0.5, 1.3) * k;
			const tone = rnd(0.0, 1.0);
			xs(x + Math.cos(a) * 0.05, y + 0.04, z + Math.sin(a) * 0.05, Math.cos(a) * sp, rnd(0.08, 0.4) * k, Math.sin(a) * sp,
				rnd(0.6, 1.1), rnd(0.05, 0.08) * k, rnd(0.2, 0.34) * k, 0.1, 3.4,
				0.62 + tone * 0.12, 0.58 + tone * 0.11, 0.52 + tone * 0.1, 0.0, X_SOFT, 0, 0, rnd(0.22, 0.36), NEVER, 0, 0, 0);
		}
		if (s > 0.45) {
			for (let i = 0; i < 4; i++) {
				const a = Math.random() * Math.PI * 2;
				const sp = rnd(0.4, 1.3) * k;
				const vx = Math.cos(a) * sp;
				const vz = Math.sin(a) * sp;
				const vy = rnd(0.8, 1.9) * k;
				solveLand(x, y + 0.02, z, vx, vy, vz, -9.8, 0.9, y + 0.006, true, 2);
				xs(x, y + 0.02, z, vx, vy, vz, landT + rnd(0.3, 0.6), rnd(0.006, 0.01), 0.005, -9.8, 0.9,
					0.5, 0.47, 0.43, 0.0, X_GRAIN, rnd(-16, 16), rnd(0, 6.28), 0.9, landT, 0, 0, 0);
			}
		}
	}

	// ------------------------------------------------------------------ confetti
	const CONFETTI = [
		1.0, 0.24, 0.33, 1.0, 0.72, 0.1, 1.0, 0.92, 0.22, 0.25, 0.82, 0.42,
		0.18, 0.68, 1.0, 0.62, 0.4, 1.0, 1.0, 0.45, 0.78, 1.0, 1.0, 1.0,
	];
	// confetti(vec3, dirVec3 | null, n, floorY?): dir = a cannon shot along it (its length scales the
	// speed when it is longer than 1.5), null = a popper burst upward. At most 300 pieces alive. Pieces
	// flutter down at ~1 m/s, settle flat (setGround, else floorY, else y = 0 or 2.5 m below) and fade.
	function confetti(pos, dir, n = 60, floorY) {
		const cnt = clampN(n, 60, 1, MAX_CONFETTI);
		const x = pos.x;
		const y = pos.y;
		const z = pos.z;
		let dx = 0;
		let dy = 1;
		let dz = 0;
		let power = 1;
		let cone = 0.75;
		if (dir && (dir.x || dir.y || dir.z)) {
			const l = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
			dx = dir.x / l; dy = dir.y / l; dz = dir.z / l;
			power = l > 1.5 ? Math.min(l / 8, 2) : 1.25;
			cone = 0.36;
		}
		// two axes perpendicular to the shot
		let ax = -dz;
		let ay = 0;
		let az = dx;
		let al = Math.sqrt(ax * ax + az * az);
		if (al < 1e-3) { ax = 1; az = 0; al = 1; }
		ax /= al; az /= al;
		const bx = dy * az - dz * ay;
		const by = dz * ax - dx * az;
		const bz = dx * ay - dy * ax;
		const fallback = typeof floorY === "number" && floorY === floorY ? floorY : (y > 0.2 ? 0 : y - 2.5);
		for (let i = 0; i < cnt; i++) {
			const a = Math.random() * Math.PI * 2;
			const off = Math.tan(cone * Math.sqrt(Math.random()));
			const ca = Math.cos(a) * off;
			const sa = Math.sin(a) * off;
			let vx = dx + ax * ca + bx * sa;
			let vy = dy + ay * ca + by * sa;
			let vz = dz + az * ca + bz * sa;
			const vl = Math.sqrt(vx * vx + vy * vy + vz * vz);
			const sp = rnd(3.2, 9.5) * power / vl;
			vx *= sp; vy *= sp; vz *= sp;
			const k = rnd(1.5, 2.4);
			const grav = -rnd(0.75, 1.3) * k; // terminal fall 0.75 .. 1.3 m/s
			solveLand(x, y, z, vx, vy, vz, grav, k, fallback + 0.004, true, 10);
			const linger = rnd(2.5, 4.5);
			const ci = ((Math.random() * 8) | 0) * 3;
			const foil = Math.random() < 0.3;
			const hx = rnd(0.016, 0.028);
			const idx = confCursor;
			confCursor = (confCursor + 1) % MAX_CONFETTI;
			flake(idx, x + rnd(-0.05, 0.05), y + rnd(-0.05, 0.05), z + rnd(-0.05, 0.05), vx, vy, vz, landT + linger,
				grav, k, landT, 0, rnd(0, 6.28), rnd(-0.5, 0.5), rnd(5, 15) * (Math.random() < 0.5 ? -1 : 1), rnd(0, 6.28),
				CONFETTI[ci], CONFETTI[ci + 1], CONFETTI[ci + 2], foil ? 2 : 1, hx, hx * rnd(1.2, 2.0), rnd(0.05, 0.16));
		}
		// the pop
		xs(x, y, z, 0, 0, 0, 0.22, 0.08, 0.4, 0, 1, 1, 0.95, 0.8, 0.7, X_STAR, 0.5, rnd(0, 1.5), 0.7, NEVER, 0, 0, 0);
		for (let i = 0; i < 5; i++) {
			xs(x, y, z, dx * rnd(0.5, 2) + rnd(-0.4, 0.4), dy * rnd(0.5, 2) + rnd(-0.2, 0.5), dz * rnd(0.5, 2) + rnd(-0.4, 0.4),
				rnd(0.5, 0.9), 0.08, rnd(0.25, 0.4), 0.15, 2.4, 0.95, 0.95, 0.95, 0.0, X_SOFT, 0, 0, 0.22, NEVER, 0, 0, 0);
		}
	}

	// spotDust(on, box): slow motes hanging in the arena air. box: THREE.Box3 / { min, max } /
	// { x0, x1, y0, y1, z0, z1 } / { x, y, z, w, h, d } (centre + size) / [x0, y0, z0, x1, y1, z1].
	// Omit the box to keep the last one (default: 16 x 7 x 16 m around the origin).
	function spotDust(on, box) {
		if (box) {
			let x0, y0, z0, x1, y1, z1;
			if (box.min && box.max) {
				x0 = box.min.x; y0 = box.min.y; z0 = box.min.z; x1 = box.max.x; y1 = box.max.y; z1 = box.max.z;
			} else if (typeof box.length === "number" && box.length >= 6) {
				x0 = box[0]; y0 = box[1]; z0 = box[2]; x1 = box[3]; y1 = box[4]; z1 = box[5];
			} else if (typeof box.x0 === "number") {
				x0 = box.x0; x1 = box.x1; z0 = box.z0; z1 = box.z1;
				y0 = typeof box.y0 === "number" ? box.y0 : 0.3;
				y1 = typeof box.y1 === "number" ? box.y1 : y0 + 7;
			} else if (typeof box.x === "number") {
				const w = box.w || box.width || 16;
				const hh = box.h || box.height || 7;
				const d = box.d || box.depth || w;
				x0 = box.x - w * 0.5; x1 = box.x + w * 0.5;
				y0 = (box.y || 0) - hh * 0.5; y1 = (box.y || 0) + hh * 0.5;
				z0 = (box.z || 0) - d * 0.5; z1 = (box.z || 0) + d * 0.5;
			}
			const span = x1 - x0 + (y1 - y0) + (z1 - z0); // NaN if any bound is missing or not a number
			if (typeof span === "number" && span === span) {
				uBoxMin.value.set(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1));
				uBoxSize.value.set(Math.max(Math.abs(x1 - x0), 0.5), Math.max(Math.abs(y1 - y0), 0.5), Math.max(Math.abs(z1 - z0), 0.5));
			}
		}
		moteTarget = on ? 1 : 0;
		if (on) ambient.visible = true;
	}

	// ------------------------------------------------------------------ glass
	// glassShards(x, y, z, dirX, dirZ, n = 60, floorY?): the pane at (x, y, z) bursts toward (dirX, dirZ).
	// Small fast splinters from the point of impact, bigger slower plates from the rim of the hole; every
	// piece tumbles on its own axis and flashes as it swings through the light, lands (setGround, else
	// floorY, else y = 0), skips once, turns flat and fades. All of it rides the scaled dt, so in slow
	// motion the glints sweep slowly across the faces.
	function glassShards(x, y, z, dirX, dirZ, n = 60, floorY) {
		const cnt = clampN(n, 60, 1, MAX_SHARDS);
		let dx = typeof dirX === "number" ? dirX : 0;
		let dz = typeof dirZ === "number" ? dirZ : 0;
		const dl = Math.sqrt(dx * dx + dz * dz);
		if (dl < 1e-4) { dx = 0; dz = 1; } else { dx /= dl; dz /= dl; }
		const px = -dz; // across the pane
		const pz = dx;
		const fallback = typeof floorY === "number" && floorY === floorY ? floorY : (y > 0.2 ? 0 : y - 1.2);
		const f0 = floorAt(x, z, fallback);
		const R = 1.1;
		for (let i = 0; i < cnt; i++) {
			const rr = Math.pow(Math.random(), 0.7) * R;
			const a = Math.random() * Math.PI * 2;
			const ca = Math.cos(a);
			const sa = Math.sin(a);
			const c = 1 - rr / R; // 1 at the point of impact
			const sx = x + px * ca * rr;
			const sz = z + pz * ca * rr;
			let sy = y + sa * rr * 0.95;
			if (sy < f0 + 0.06) sy = f0 + 0.06 + Math.random() * 0.2;
			const out = 0.7 + 6.2 * c * c * rnd(0.55, 1.0) + rnd(0, 1.3);
			const radial = rnd(0.3, 1.9) * (0.4 + 0.6 * c);
			const vx = dx * out + px * ca * radial + rnd(-0.35, 0.35);
			const vz = dz * out + pz * ca * radial + rnd(-0.35, 0.35);
			const vy = sa * radial * 0.8 + rnd(-0.2, 1.7) * c + 0.25;
			const hx = rnd(0.022, 0.05) + (1 - c) * rnd(0.0, 0.085);
			const hy = hx * rnd(0.55, 1.5);
			const k = 0.2 + 0.012 / hx;
			solveLand(sx, sy, sz, vx, vy, vz, -9.8, k, fallback + 0.004, true, 6);
			const idx = MAX_CONFETTI + shardCursor;
			shardCursor = (shardCursor + 1) % MAX_SHARDS;
			const tone = Math.random();
			flake(idx, sx, sy, sz, vx, vy, vz, landT + FLAKE_HOP + rnd(2.2, 3.8), -9.8, k, landT, rnd(0.025, 0.09),
				rnd(0, 6.28), rnd(-0.8, 0.8), rnd(3.5, 15) * (Math.random() < 0.5 ? -1 : 1), rnd(0, 6.28),
				0.6 + tone * 0.12, 0.84 + tone * 0.08, 0.88 + tone * 0.08, 0, hx, hy, 0);
		}
		// glass dust: twinkling specks carried along with the burst
		const ns = Math.min(28, 8 + (cnt >> 1));
		for (let i = 0; i < ns; i++) {
			const a = Math.random() * Math.PI * 2;
			const rr = Math.random() * 0.7;
			const out = rnd(0.8, 5.5);
			const vx = dx * out + rnd(-0.9, 0.9);
			const vz = dz * out + rnd(-0.9, 0.9);
			const vy = rnd(-0.3, 2.2);
			const sx = x + px * Math.cos(a) * rr;
			const sz = z + pz * Math.cos(a) * rr;
			const sy = Math.max(f0 + 0.05, y + Math.sin(a) * rr);
			solveLand(sx, sy, sz, vx, vy, vz, -6.5, 1.4, fallback + 0.004, true, 4);
			xs(sx, sy, sz, vx, vy, vz, Math.max(0.2, landT), rnd(0.012, 0.026), 0.008, -6.5, 1.4,
				0.85, 0.97, 1.0, 0.7, X_STAR, rnd(-4, 4), rnd(0, 1.5), 1.0, NEVER, 0, 0, 0);
		}
		// grit that rattles onto the floor and stays a while
		const ng = Math.min(16, 4 + (cnt >> 2));
		for (let i = 0; i < ng; i++) {
			const a = Math.random() * Math.PI * 2;
			const rr = Math.random() * 0.6;
			const out = rnd(0.5, 4.5);
			const vx = dx * out + rnd(-0.7, 0.7);
			const vz = dz * out + rnd(-0.7, 0.7);
			const vy = rnd(-0.2, 1.6);
			const sx = x + px * Math.cos(a) * rr;
			const sz = z + pz * Math.cos(a) * rr;
			const sy = Math.max(f0 + 0.05, y + Math.sin(a) * rr);
			solveLand(sx, sy, sz, vx, vy, vz, -9.8, 0.6, fallback + 0.006, true, 4);
			xs(sx, sy, sz, vx, vy, vz, landT + rnd(1.5, 2.6), rnd(0.006, 0.012), 0.006, -9.8, 0.6,
				0.82, 0.95, 0.97, 0.25, X_GRAIN, rnd(-18, 18), rnd(0, 6.28), 0.9, landT, 0, 0, 0);
		}
		// the breath of powdered glass + one hard flash at the point of impact
		for (let i = 0; i < 7; i++) {
			const out = rnd(0.4, 2.2);
			xs(x + px * rnd(-0.5, 0.5), y + rnd(-0.4, 0.4), z + pz * rnd(-0.5, 0.5), dx * out + rnd(-0.3, 0.3), rnd(-0.1, 0.4), dz * out + rnd(-0.3, 0.3),
				rnd(0.7, 1.3), 0.12, rnd(0.4, 0.65), -0.15, 1.8, 0.86, 0.95, 0.98, 0.45, X_SOFT, 0, 0, 0.16, NEVER, 0, 0, 0);
		}
		xs(x, y, z, 0, 0, 0, 0.2, 0.2, 0.85, 0, 1, 0.9, 0.98, 1.0, 0.8, X_STAR, 0.4, rnd(0, 1.5), 0.6, NEVER, 0, 0, 0);
		xring(x, y, z, 0.3, 0.1, 1.15, 0.07, 0.9, 0.98, 1.0, 0.6, R_IMPACT, Math.atan2(dx, dz), 1, 0.55, 1, 0, 0);
	}

	// ------------------------------------------------------------------ fire and heat
	function embers(x, y, z, spread = 0.5, n = 5) {
		const cnt = clampN(n, 5, 1, 24);
		const sprd = clampF(spread, 0.5, 0, 8);
		for (let i = 0; i < cnt; i++) {
			const a = Math.random() * Math.PI * 2;
			const rr = Math.sqrt(Math.random()) * sprd;
			const k = rnd(0.9, 1.5);
			const hot = Math.random();
			xs(x + Math.cos(a) * rr, y + rnd(0, 0.1), z + Math.sin(a) * rr, rnd(-0.35, 0.35), rnd(0.5, 2.2), rnd(-0.35, 0.35),
				rnd(1.2, 2.9), rnd(0.012, 0.028), 0.005, rnd(0.45, 1.3) * k, k,
				1.0, 0.55 + hot * 0.3, 0.14 + hot * 0.2, 0.88, X_EMBER, 0.035, 0, 1.0,
				NEVER, rnd(0.05, 0.16), rnd(1.6, 4.5), i * 0.03);
		}
	}

	// heat(x, y, z, w, h) -> { remove() }: (x, y, z) is the CENTRE of an upright card w wide, h tall.
	function heat(x, y, z, w = 2, h = 2) {
		let hd = null;
		for (let i = 0; i < MAX_HEAT; i++) {
			if (!heatHandles[i].active) {
				hd = heatHandles[i];
				break;
			}
		}
		if (!hd) {
			// all eight in use: recycle round-robin (the old owner's remove() will then drop this card early)
			hd = heatHandles[heatCursor];
			heatCursor = (heatCursor + 1) % MAX_HEAT;
			heatLive--;
		}
		hd.active = true;
		heatLive++;
		const o = hd.index * AMB_STRIDE;
		aData[o] = x; aData[o + 1] = y; aData[o + 2] = z; aData[o + 3] = 0;
		aData[o + 4] = Math.max(0.05, w); aData[o + 5] = Math.max(0.05, h); aData[o + 6] = Math.random() * 20; aData[o + 7] = 0.2;
		aDirty = true;
		ambient.visible = true;
		return hd;
	}

	// ------------------------------------------------------------------ level 5
	// slapRing(x, y, z, yaw): yaw = the way the slapper faces; the shock ring stands upright across it.
	function slapRing(x, y, z, yaw = 0) {
		const fx_ = Math.sin(yaw);
		const fz_ = Math.cos(yaw);
		xring(x, y, z, 0.26, 0.06, 0.62, 0.06, 1.0, 0.95, 0.8, 0.55, R_IMPACT, yaw, 1, 1.0, 1, 0, 0);
		xring(x, y, z, 0.42, 0.04, 0.9, 0.045, 1.0, 0.9, 0.7, 0.45, R_CLEAN, yaw, 1, 0.5, 1, 0, 0.04);
		xs(x, y, z, 0, 0, 0, 0.16, 0.1, 0.45, 0, 1, 1.0, 0.95, 0.8, 0.75, X_STAR, 0.5, rnd(0, 1.5), 0.9, NEVER, 0, 0, 0);
		const f0 = floorAt(x, z, y - 0.6);
		// wood chips, thrown back toward the slapper and out to the sides
		for (let i = 0; i < 10; i++) {
			const a = Math.random() * Math.PI * 2;
			const side = Math.cos(a) * rnd(1.2, 3.4);
			const vy = Math.sin(a) * rnd(0.8, 2.6) + 1.2;
			const back = rnd(0.3, 2.2);
			const vx = fz_ * side - fx_ * back;
			const vz = -fx_ * side - fz_ * back;
			solveLand(x, y, z, vx, vy, vz, -9.8, 0.9, f0 + 0.008, true, 2);
			const tone = Math.random();
			xs(x, y, z, vx, vy, vz, landT + rnd(0.4, 0.8), rnd(0.009, 0.018), 0.008, -9.8, 0.9,
				0.7 + tone * 0.22, 0.5 + tone * 0.2, 0.26 + tone * 0.14, 0.0, X_GRAIN, rnd(-22, 22), rnd(0, 6.28), 1.0, landT, 0, 0, 0);
		}
		// hot sparks
		for (let i = 0; i < 7; i++) {
			const a = Math.random() * Math.PI * 2;
			const side = Math.cos(a) * rnd(2.0, 5.0);
			const back = rnd(0, 1.5);
			xs(x, y, z, fz_ * side - fx_ * back, Math.sin(a) * rnd(1.5, 4.0) + 0.5, -fx_ * side - fz_ * back,
				rnd(0.14, 0.3), rnd(0.02, 0.032), 0.006, -6 * 3.5, 3.5, 1.0, 0.9, 0.55, 0.7, X_EMBER, 0.1, 0, 1.0, NEVER, 0, 0, 0);
		}
		for (let i = 0; i < 3; i++) {
			xs(x, y, z, rnd(-0.6, 0.6), rnd(0.1, 0.6), rnd(-0.6, 0.6), rnd(0.4, 0.7), 0.06, rnd(0.2, 0.3), 0.1, 3,
				0.8, 0.72, 0.6, 0.0, X_SOFT, 0, 0, 0.3, NEVER, 0, 0, 0);
		}
	}

	// zzz(vec3): one soft "z" drifting up and away; successive calls alternate small / big.
	let zCount = 0;
	function zzz(pos) {
		const big = zCount % 3;
		zCount++;
		const s = 0.75 + big * 0.22;
		xs(pos.x, pos.y, pos.z, rnd(0.03, 0.09), 0.2, rnd(-0.03, 0.03), 1.9, 0.03 * s, 0.075 * s, 0.24, 1.0,
			0.84, 0.9, 1.0, 0.0, X_ZED, 0.22, rnd(-0.1, 0.25), 0.92, NEVER, 0.035, 1.6, 0);
	}

	// sadMotes(vec3, n): a few slow pale motes sinking around the point. Subtle on purpose.
	function sadMotes(pos, n = 6) {
		const cnt = clampN(n, 6, 1, 16);
		for (let i = 0; i < cnt; i++) {
			const k = 1.0;
			xs(pos.x + rnd(-0.55, 0.55), pos.y + rnd(0.1, 0.8), pos.z + rnd(-0.55, 0.55), 0, 0, 0, rnd(3.0, 4.6),
				rnd(0.01, 0.016), rnd(0.014, 0.024), -rnd(0.05, 0.12) * k, k, 0.8, 0.86, 1.0, 0.5, X_SOFT, 0, 0, rnd(0.25, 0.42),
				NEVER, rnd(0.02, 0.05), rnd(0.5, 1.1), i * rnd(0.05, 0.25));
		}
	}

	// senseRing(x, y, z, dirX, dirZ): the electro-sense ping. With a direction it reaches toward it
	// (the longer the vector, up to 1, the further it stretches); with (0, 0) it is a plain round ping.
	function senseRing(x, y, z, dirX, dirZ) {
		const dx = typeof dirX === "number" ? dirX : 0;
		const dz = typeof dirZ === "number" ? dirZ : 0;
		const dl = Math.sqrt(dx * dx + dz * dz);
		const has = dl > 1e-3;
		const yaw = has ? Math.atan2(dx, dz) : 0;
		const st = has ? 1.5 + 0.9 * Math.min(dl, 1) : 1;
		xring(x, y, z, 0.75, 0.08, 0.7, 0.1, 0.4, 0.86, 1.0, 0.6, R_SENSE, yaw, st, 0.9, 0, 0, 0);
		xring(x, y + 0.003, z, 0.6, 0.05, 0.42, 0.13, 0.55, 0.92, 1.0, 0.6, R_SENSE, yaw, st, 0.6, 0, 0, 0.14);
		xs(x, y + 0.02, z, 0, 0, 0, 0.25, 0.03, 0.14, 0, 1, 0.6, 0.92, 1.0, 0.8, X_STAR, 0.5, rnd(0, 1.5), 0.7, NEVER, 0, 0, 0);
		if (has) {
			const ux = dx / dl;
			const uz = dz / dl;
			for (let i = 0; i < 4; i++) {
				const sp = rnd(1.2, 3.0);
				xs(x + ux * 0.1, y + 0.03, z + uz * 0.1, ux * sp + rnd(-0.35, 0.35), rnd(0.0, 0.3), uz * sp + rnd(-0.35, 0.35),
					rnd(0.35, 0.6), rnd(0.014, 0.024), 0.008, 0, 3.2, 0.6, 0.92, 1.0, 0.75, X_STAR, rnd(-3, 3), rnd(0, 1.5), 0.9,
					NEVER, 0, 0, i * 0.04);
			}
		}
	}

	// tint of the mirror flashes on glass and foil (default warm white), e.g. red under the alarm light
	function setGlint(colorHex) {
		hexRGB(colorHex, 0xfffaf2);
		uGlint.value.set(cR, cG, cB);
	}

	function clearExt() {
		for (let i = 0; i < MAX_XP; i++) xData[i * XP_STRIDE + 7] = 0;
		xWrapped = true; // force a whole-buffer upload
		xAliveUntil = -1;
		for (let i = 0; i < MAX_FLAKES; i++) fData[i * FL_STRIDE + 7] = 0;
		fDirty = true;
		fAliveUntil = -1;
		for (let i = 0; i < MAX_XRINGS; i++) xrData[i * XR_STRIDE + 4] = 0;
		xrDirty = true;
		xrAliveUntil = -1;
		for (let i = 0; i < MAX_HEAT; i++) {
			heatHandles[i].active = false;
			aData[i * AMB_STRIDE + 7] = 0;
		}
		heatLive = 0;
		aDirty = true;
		moteTarget = 0;
		moteFade = 0;
		uMote.value = 0;
		for (let i = 0; i < WAKES; i++) wakeT[i] = -100;
	}

	function updateExt(dt) {
		if (xHi >= 0 || xWrapped) {
			// Upload only the span written since the last frame (one reused range object). If the last
			// request never reached the GPU (the pool was not drawn), or the cursor wrapped: whole buffer.
			const ranges = xBuffer.updateRanges;
			if (ranges) {
				ranges.length = 0;
				if (!xWrapped && !xPending && xHi >= xLo) {
					xRange.start = xLo * XP_STRIDE;
					xRange.count = (xHi - xLo + 1) * XP_STRIDE;
					ranges.push(xRange);
				}
			}
			xBuffer.needsUpdate = true;
			xPending = true;
			xLo = MAX_XP;
			xHi = -1;
			xWrapped = false;
		}
		if (xparticles.visible && now > xAliveUntil) xparticles.visible = false;
		if (fDirty) {
			fBuffer.needsUpdate = true;
			fDirty = false;
		}
		if (flakes.visible && now > fAliveUntil) flakes.visible = false;
		if (xrDirty) {
			xrBuffer.needsUpdate = true;
			xrDirty = false;
		}
		if (xrings.visible && now > xrAliveUntil) xrings.visible = false;

		if (moteFade !== moteTarget) {
			const stepM = dt * 0.8;
			moteFade = moteFade < moteTarget ? Math.min(moteTarget, moteFade + stepM) : Math.max(moteTarget, moteFade - stepM);
			uMote.value = moteFade * moteFade * (3 - 2 * moteFade);
		}
		if (aDirty) {
			aBuffer.needsUpdate = true;
			aDirty = false;
		}
		const ambOn = heatLive > 0 || moteFade > 0 || moteTarget > 0;
		if (ambient.visible !== ambOn) ambient.visible = ambOn;
	}

	// =============================================================================================
	// EXTENSIONS (levels 6-11, LEVELS2.md B4)
	// =============================================================================================
	// Seven pooled draw calls (lines, ground decals, cards, scream shells, swirl ribbons, air, birds),
	// each hidden while it has nothing to show; everything else reuses the particle / ring / flake pools.
	// Handles and ids go stale on clear(): calling a stale handle or cancelling a stale id does nothing.

	let fxEpoch = 0; // bumped by clear(): invalidates every handle and id given out before it
	// Ground height for effects that are not told one: setGround() if a level called it, else the height
	// most recently named by a caller (a footstep, a splash ...), else 0.
	let hintY = null;
	function noteY(y) {
		if (typeof y === "number" && y === y) hintY = y;
	}
	function groundAt(x, z, y) {
		if (typeof y === "number" && y === y) return y;
		return floorAt(x, z, hintY !== null ? hintY : 0);
	}
	function num(v, def) {
		return typeof v === "number" && v === v ? v : def;
	}
	const tmpPos = { x: 0, y: 0, z: 0 };

	// ------------------------------------------------------------------ lines: tracers + telegraphs (1 draw call)
	const lnData = new Float32Array(MAX_LINES * LN_STRIDE);
	const lnBuffer = new THREE.InstancedInterleavedBuffer(lnData, LN_STRIDE, 1);
	lnBuffer.setUsage(THREE.DynamicDrawUsage);
	const lnGeo = new THREE.InstancedBufferGeometry();
	lnGeo.setAttribute("position", new THREE.BufferAttribute(quad, 3));
	lnGeo.setIndex(quadIndex);
	lnGeo.setAttribute("aA", new THREE.InterleavedBufferAttribute(lnBuffer, 4, 0));
	lnGeo.setAttribute("aB", new THREE.InterleavedBufferAttribute(lnBuffer, 4, 4));
	lnGeo.setAttribute("aC", new THREE.InterleavedBufferAttribute(lnBuffer, 4, 8));
	lnGeo.setAttribute("aD", new THREE.InterleavedBufferAttribute(lnBuffer, 4, 12));
	lnGeo.instanceCount = MAX_LINES;
	const lnMat = new THREE.ShaderMaterial({
		uniforms: { uTime },
		vertexShader: LINE_VERT,
		fragmentShader: LINE_FRAG,
		transparent: true,
		depthWrite: false,
		premultipliedAlpha: true,
		blending: THREE.NormalBlending,
		side: THREE.DoubleSide,
	});
	const lines = new THREE.Mesh(lnGeo, lnMat);
	lines.name = "fx-lines";
	lines.frustumCulled = false;
	lines.renderOrder = 4;
	lines.visible = false;
	lines.castShadow = false;
	lines.receiveShadow = false;
	group.add(lines);
	let lnDirty = false;
	let lnAliveUntil = -1;
	let tracerCursor = 0;
	const tgEnd = new Float64Array(MAX_TELEGRAPHS).fill(-1);
	const tgGen = new Int32Array(MAX_TELEGRAPHS);

	function lineSet(i, ax, ay, az, bx, by, bz, life, r, g, b, style, halfW, speed, alpha) {
		const o = i * LN_STRIDE;
		lnData[o] = ax; lnData[o + 1] = ay; lnData[o + 2] = az; lnData[o + 3] = now;
		lnData[o + 4] = bx; lnData[o + 5] = by; lnData[o + 6] = bz; lnData[o + 7] = life;
		lnData[o + 8] = r; lnData[o + 9] = g; lnData[o + 10] = b; lnData[o + 11] = style;
		lnData[o + 12] = halfW; lnData[o + 13] = speed; lnData[o + 14] = Math.random(); lnData[o + 15] = alpha;
		lnDirty = true;
		if (now + life > lnAliveUntil) lnAliveUntil = now + life;
		lines.visible = true;
	}

	// tracer(from, to, speed = 90, colorHex) -> seconds until the streak's head reaches `to`
	function tracer(from, to, speed = 90, colorHex = 0xffe9a0) {
		const sp = clampF(speed, 90, 5, 600);
		hexRGB(colorHex, 0xffe9a0);
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const dz = to.z - from.z;
		const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
		const flight = dist / sp;
		const streak = Math.min(Math.max(sp * 0.045, 0.8), 5);
		const i = tracerCursor;
		tracerCursor = (tracerCursor + 1) % MAX_TRACERS;
		lineSet(i, from.x, from.y, from.z, to.x, to.y, to.z, flight + streak / sp, cR, cG, cB, L_TRACER, 0.022, sp, 1);
		return flight;
	}

	function telegraphSlot(id) {
		if (typeof id !== "number" || id < 0) return -1;
		const s = id % MAX_TELEGRAPHS;
		if (tgGen[s] !== (id - s) / MAX_TELEGRAPHS || tgEnd[s] <= now) return -1;
		return s;
	}
	// telegraph(from, to, seconds, colorHex) -> id. The aim line: blinks faster and brightens, then goes.
	function telegraph(from, to, seconds = 0.75, colorHex = 0xff3020) {
		const secs = clampF(seconds, 0.75, 0.05, 30);
		hexRGB(colorHex, 0xff3020);
		let s = 0;
		let best = Infinity;
		for (let i = 0; i < MAX_TELEGRAPHS; i++) {
			if (tgEnd[i] <= now) { s = i; break; }
			if (tgEnd[i] < best) { best = tgEnd[i]; s = i; }
		}
		tgGen[s]++;
		tgEnd[s] = now + secs;
		lineSet(MAX_TRACERS + s, from.x, from.y, from.z, to.x, to.y, to.z, secs, cR, cG, cB, L_TELEGRAPH, 0.014, 0, 1);
		return s + tgGen[s] * MAX_TELEGRAPHS;
	}
	function telegraphMove(id, from, to) {
		const s = telegraphSlot(id);
		if (s < 0) return false;
		const o = (MAX_TRACERS + s) * LN_STRIDE;
		if (from) { lnData[o] = from.x; lnData[o + 1] = from.y; lnData[o + 2] = from.z; }
		if (to) { lnData[o + 4] = to.x; lnData[o + 5] = to.y; lnData[o + 6] = to.z; }
		lnDirty = true;
		return true;
	}
	function telegraphCancel(id) {
		const s = telegraphSlot(id);
		if (s < 0) return false;
		lnData[(MAX_TRACERS + s) * LN_STRIDE + 7] = 0;
		tgEnd[s] = -1;
		lnDirty = true;
		return true;
	}

	// ------------------------------------------------------------------ ground decals (1 draw call)
	const gdData = new Float32Array(MAX_GROUND * GD_STRIDE);
	const gdBuffer = new THREE.InstancedInterleavedBuffer(gdData, GD_STRIDE, 1);
	gdBuffer.setUsage(THREE.DynamicDrawUsage);
	const gdGeo = new THREE.InstancedBufferGeometry();
	gdGeo.setAttribute("position", new THREE.BufferAttribute(quad, 3));
	gdGeo.setIndex(quadIndex);
	gdGeo.setAttribute("aA", new THREE.InterleavedBufferAttribute(gdBuffer, 4, 0));
	gdGeo.setAttribute("aB", new THREE.InterleavedBufferAttribute(gdBuffer, 4, 4));
	gdGeo.setAttribute("aC", new THREE.InterleavedBufferAttribute(gdBuffer, 4, 8));
	gdGeo.setAttribute("aD", new THREE.InterleavedBufferAttribute(gdBuffer, 4, 12));
	gdGeo.setAttribute("aE", new THREE.InterleavedBufferAttribute(gdBuffer, 4, 16));
	gdGeo.instanceCount = MAX_GROUND;
	const gdMat = new THREE.ShaderMaterial({
		uniforms: { uTime },
		vertexShader: GROUND_VERT,
		fragmentShader: GROUND_FRAG,
		transparent: true,
		depthWrite: false,
		premultipliedAlpha: true,
		blending: THREE.NormalBlending,
		side: THREE.DoubleSide,
		polygonOffset: true,
		polygonOffsetFactor: -2,
		polygonOffsetUnits: -4,
	});
	const ground = new THREE.Mesh(gdGeo, gdMat);
	ground.name = "fx-ground";
	ground.frustumCulled = false;
	ground.renderOrder = 2;
	ground.visible = false;
	ground.castShadow = false;
	ground.receiveShadow = false;
	group.add(ground);
	let gdDirty = false;
	let gdAliveUntil = -1;
	let gdLive = 0; // persistent glow discs showing
	let gdTransCursor = 0;
	let crackCursor = 0;

	function gdSet(i, x, y, z, life, ext, yaw, style, r, g, b, alpha, d0, d1, d2, d3, e1, add, delay) {
		const o = i * GD_STRIDE;
		const t0 = now + delay;
		gdData[o] = x; gdData[o + 1] = y; gdData[o + 2] = z; gdData[o + 3] = t0;
		gdData[o + 4] = life; gdData[o + 5] = ext; gdData[o + 6] = yaw; gdData[o + 7] = style;
		gdData[o + 8] = r; gdData[o + 9] = g; gdData[o + 10] = b; gdData[o + 11] = alpha;
		gdData[o + 12] = d0; gdData[o + 13] = d1; gdData[o + 14] = d2; gdData[o + 15] = d3;
		gdData[o + 16] = Math.random(); gdData[o + 17] = e1; gdData[o + 18] = add; gdData[o + 19] = 0;
		gdDirty = true;
		if (life < NEVER * 0.5 && t0 + life > gdAliveUntil) gdAliveUntil = t0 + life;
		ground.visible = true;
	}
	function gdTrans(x, y, z, life, ext, style, r, g, b, alpha, d0, d1, d2, d3, e1, add, delay) {
		const i = GD_TRANS0 + gdTransCursor;
		gdTransCursor = (gdTransCursor + 1) % MAX_GTRANS;
		gdSet(i, x, y, z, life, ext, Math.random() * 6.28, style, r, g, b, alpha, d0, d1, d2, d3, e1, add, delay);
	}
	// persistent glow discs: slot g (0 .. MAX_GLOWS - 1)
	function glowOn(g, x, y, z, radius, r, gg, b, alpha, flicker, rate) {
		const i = GD_GLOW0 + g;
		const o = i * GD_STRIDE;
		if (!(gdData[o + 4] > 0)) gdLive++;
		gdSet(i, x, y, z, NEVER, radius, 0, G_GLOW, r, gg, b, Math.max(alpha, 0.0005), radius, flicker, rate, 0, 0.4, 1, 0);
	}
	function glowOff(g) {
		const o = (GD_GLOW0 + g) * GD_STRIDE;
		if (gdData[o + 4] > 0) {
			gdData[o + 4] = 0;
			gdLive--;
			gdDirty = true;
		}
	}
	function glowAlpha(g, alpha) {
		const o = (GD_GLOW0 + g) * GD_STRIDE;
		if (gdData[o + 4] > 0) {
			gdData[o + 11] = Math.max(alpha, 0.0005);
			gdDirty = true;
		}
	}
	function glowMove(g, x, y, z) {
		const o = (GD_GLOW0 + g) * GD_STRIDE;
		if (gdData[o + 4] > 0) {
			gdData[o] = x; gdData[o + 1] = y; gdData[o + 2] = z;
			gdDirty = true;
		}
	}

	// ---- danger zones
	const dzEnd = new Float64Array(MAX_DANGER).fill(-1);
	const dzGen = new Int32Array(MAX_DANGER);
	// dangerZone({ shape, x, z, y?, r, yaw, arc, len, width, seconds, colorHex }) -> id
	//   circle: radius r | cone: apex (x, z), heading yaw, full angle arc (rad), reach r
	//   line: a lane from (x, z) along yaw, len long, width wide | ring: radius r, band `width` wide
	// The fill sweeps to full over `seconds` (that is the moment of the hit), then a white flash.
	function dangerZone(o) {
		if (!o) return -1;
		const shape = o.shape === "cone" ? G_CONE : o.shape === "line" ? G_LINE : o.shape === "ring" ? G_RING : G_CIRCLE;
		const x = num(o.x, 0);
		const z = num(o.z, 0);
		const r = clampF(o.r, 1.5, 0.1, 60);
		const yaw = num(o.yaw, 0);
		const arc = clampF(o.arc, Math.PI * 0.5, 0.05, Math.PI * 2);
		const len = clampF(o.len, 6, 0.2, 80);
		const width = clampF(o.width, shape === G_RING ? 1 : 1.2, 0.05, 40);
		const secs = clampF(o.seconds, 1, 0.05, 30);
		hexRGB(o.colorHex, 0xff3020);
		let s = 0;
		let best = Infinity;
		for (let i = 0; i < MAX_DANGER; i++) {
			if (dzEnd[i] <= now) { s = i; break; }
			if (dzEnd[i] < best) { best = dzEnd[i]; s = i; }
		}
		dzGen[s]++;
		dzEnd[s] = now + secs + DANGER_FLASH;
		const ext = shape === G_LINE ? Math.max(len, width * 0.5) + 0.15 : shape === G_RING ? r + width * 0.5 + 0.15 : r * 1.06 + 0.15;
		gdSet(GD_DANGER0 + s, x, groundAt(x, z, o.y) + 0.06, z, secs + DANGER_FLASH, ext, yaw, shape, cR, cG, cB, 1,
			r, arc * 0.5, len, width, secs, 0.35, 0);
		return s + dzGen[s] * MAX_DANGER;
	}
	function dangerCancel(id) {
		if (typeof id !== "number" || id < 0) return false;
		const s = id % MAX_DANGER;
		if (dzGen[s] !== (id - s) / MAX_DANGER || dzEnd[s] <= now) return false;
		gdData[(GD_DANGER0 + s) * GD_STRIDE + 4] = 0;
		dzEnd[s] = -1;
		gdDirty = true;
		return true;
	}

	// ---- slam: impact burst + dust ring + crack decal. slam(x, z, radius, colorHex, y?)
	function slam(x, z, radius = 2.4, colorHex = 0xffd9a0, y) {
		const R = clampF(radius, 2.4, 0.3, 12);
		const gy = groundAt(x, z, y);
		hexRGB(colorHex, 0xffd9a0);
		const r = cR;
		const g = cG;
		const b = cB;
		spawn(x, gy + 0.25, z, 0, 0, 0, 0.22, 0.3 * R, 1.3 * R, 0, 0, r, g, b, 0.6, FLASH, 0, 0, 0.9);
		xring(x, gy + 0.07, z, 0.42, 0.2, R * 1.15, 0.1, r, g, b, 0.6, R_IMPACT, rnd(0, 6.28), 1, 0.95, 0, 0, 0);
		xring(x, gy + 0.06, z, 0.7, 0.1, R * 1.6, 0.07, 1, 0.97, 0.9, 0.5, R_CLEAN, 0, 1, 0.5, 0, 0, 0.05);
		gdTrans(x, gy + 0.05, z, R * 1.7 / (R * 3.2) + 0.25, R * 2, G_DUST, 0.72, 0.66, 0.56, 0.55, R * 3.2, R * 1.7, 0.9, R * 0.25, 0, 0, 0);
		const ci = GD_CRACK0 + crackCursor;
		crackCursor = (crackCursor + 1) % MAX_CRACKS;
		gdSet(ci, x, gy + 0.03, z, 9, R, Math.random() * 6.28, G_CRACK, 0.08, 0.06, 0.05, 0.85, R * 0.95, 0, 0, 0, 0, 0, 0);
		const nd = 10 + Math.round(R * 4);
		for (let i = 0; i < nd; i++) {
			const a = ((i + rnd(-0.4, 0.4)) / nd) * Math.PI * 2;
			const ca = Math.cos(a);
			const sa = Math.sin(a);
			const rr = R * rnd(0.25, 0.7);
			const sp = rnd(1.6, 4.2) * (0.6 + 0.2 * R);
			const tone = Math.random();
			xs(x + ca * rr, gy + 0.08, z + sa * rr, ca * sp, rnd(0.5, 1.8), sa * sp, rnd(0.8, 1.5), rnd(0.14, 0.24), rnd(0.5, 0.9),
				0.15, 2.6, 0.68 + tone * 0.1, 0.62 + tone * 0.1, 0.52 + tone * 0.1, 0.0, X_SOFT, 0, 0, rnd(0.3, 0.45), NEVER, 0, 0, 0);
		}
		const nc = 8 + Math.round(R * 3);
		for (let i = 0; i < nc; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(1.5, 4.5);
			const vx = Math.cos(a) * sp;
			const vz = Math.sin(a) * sp;
			const vy = rnd(2.5, 6.5);
			solveLand(x, gy + 0.1, z, vx, vy, vz, -9.8, 0.5, gy + 0.01, true, 3);
			const tone = Math.random();
			xs(x + Math.cos(a) * R * 0.3, gy + 0.1, z + Math.sin(a) * R * 0.3, vx, vy, vz, landT + rnd(0.6, 1.4), rnd(0.014, 0.032), 0.012,
				-9.8, 0.5, 0.36 + tone * 0.14, 0.32 + tone * 0.12, 0.27 + tone * 0.1, 0.0, X_GRAIN, rnd(-14, 14), rnd(0, 6.28), 1.0, landT, 0, 0, 0);
		}
	}

	// ---- shock rings: a travelling ring of dust the boss tests the player against
	const srT0 = new Float64Array(MAX_SHOCKRINGS).fill(-1);
	const srSpeed = new Float32Array(MAX_SHOCKRINGS);
	const srMax = new Float32Array(MAX_SHOCKRINGS);
	const srX = new Float32Array(MAX_SHOCKRINGS);
	const srY = new Float32Array(MAX_SHOCKRINGS);
	const srZ = new Float32Array(MAX_SHOCKRINGS);
	const srAcc = new Float32Array(MAX_SHOCKRINGS);
	const srGen = new Int32Array(MAX_SHOCKRINGS);
	let srCursor = 0;
	let srLive = 0;
	function shockRing(x, z, speed = 9, maxRadius = 12, colorHex = 0xd8c8a6, y) {
		const sp = clampF(speed, 9, 0.5, 60);
		const mr = clampF(maxRadius, 12, 0.5, 60);
		hexRGB(colorHex, 0xd8c8a6);
		let s = -1;
		for (let i = 0; i < MAX_SHOCKRINGS; i++) {
			const k = (srCursor + i) % MAX_SHOCKRINGS;
			if (srT0[k] < 0) { s = k; break; }
		}
		if (s < 0) { s = srCursor; srLive--; }
		srCursor = (s + 1) % MAX_SHOCKRINGS;
		const gy = groundAt(x, z, y);
		srGen[s]++;
		srT0[s] = now;
		srSpeed[s] = sp;
		srMax[s] = mr;
		srX[s] = x; srY[s] = gy; srZ[s] = z;
		srAcc[s] = 0;
		srLive++;
		gdSet(GD_SHOCK0 + s, x, gy + 0.07, z, mr / sp + 0.05, mr + 0.6, Math.random() * 6.28, G_DUST, cR, cG, cB, 0.9,
			sp, mr, 1.25, 0, 0, 0.1, 0);
		xring(x, gy + 0.08, z, 0.35, 0.1, Math.min(mr, 2.2), 0.12, 1, 0.96, 0.86, 0.5, R_IMPACT, rnd(0, 6.28), 1, 0.7, 0, 0, 0);
		return s + srGen[s] * MAX_SHOCKRINGS;
	}
	// current radius of a shock ring, or -1 once it has run out (or the id is stale)
	function shockRadius(id) {
		if (typeof id !== "number" || id < 0) return -1;
		const s = id % MAX_SHOCKRINGS;
		if (srGen[s] !== (id - s) / MAX_SHOCKRINGS || srT0[s] < 0) return -1;
		const r = srSpeed[s] * (now - srT0[s]);
		return r >= srMax[s] ? -1 : r;
	}

	// ------------------------------------------------------------------ cards (1 draw call)
	const cdData = new Float32Array(MAX_CARDS * CD_STRIDE);
	const cdBuffer = new THREE.InstancedInterleavedBuffer(cdData, CD_STRIDE, 1);
	cdBuffer.setUsage(THREE.DynamicDrawUsage);
	const cdGeo = new THREE.InstancedBufferGeometry();
	cdGeo.setAttribute("position", new THREE.BufferAttribute(quad, 3));
	cdGeo.setIndex(quadIndex);
	cdGeo.setAttribute("aA", new THREE.InterleavedBufferAttribute(cdBuffer, 4, 0));
	cdGeo.setAttribute("aB", new THREE.InterleavedBufferAttribute(cdBuffer, 4, 4));
	cdGeo.setAttribute("aC", new THREE.InterleavedBufferAttribute(cdBuffer, 4, 8));
	cdGeo.setAttribute("aD", new THREE.InterleavedBufferAttribute(cdBuffer, 4, 12));
	cdGeo.instanceCount = MAX_CARDS;
	const cdMat = new THREE.ShaderMaterial({
		uniforms: { uTime },
		vertexShader: CARD_VERT,
		fragmentShader: CARD_FRAG,
		transparent: true,
		depthWrite: false,
		premultipliedAlpha: true,
		blending: THREE.NormalBlending,
		side: THREE.DoubleSide,
	});
	const cards = new THREE.Mesh(cdGeo, cdMat);
	cards.name = "fx-cards";
	cards.frustumCulled = false;
	cards.renderOrder = 5;
	cards.visible = false;
	cards.castShadow = false;
	cards.receiveShadow = false;
	group.add(cards);
	let cdDirty = false;
	let cdLive = 0;

	function cardSet(i, x, y, z, style, w, h, yaw, tilt, r, g, b, alpha, level) {
		const o = i * CD_STRIDE;
		if (!(cdData[o + 11] > 0)) cdLive++;
		cdData[o] = x; cdData[o + 1] = y; cdData[o + 2] = z; cdData[o + 3] = style;
		cdData[o + 4] = w; cdData[o + 5] = h; cdData[o + 6] = yaw; cdData[o + 7] = tilt;
		cdData[o + 8] = r; cdData[o + 9] = g; cdData[o + 10] = b; cdData[o + 11] = Math.max(alpha, 0.0005);
		cdData[o + 12] = now; cdData[o + 13] = Math.random(); cdData[o + 14] = level; cdData[o + 15] = 0;
		cdDirty = true;
		cards.visible = true;
	}
	function cardOff(i) {
		const o = i * CD_STRIDE;
		if (cdData[o + 11] > 0) {
			cdData[o + 11] = 0;
			cdLive--;
			cdDirty = true;
		}
	}
	function cardMove(i, x, y, z) {
		const o = i * CD_STRIDE;
		cdData[o] = x; cdData[o + 1] = y; cdData[o + 2] = z;
		cdDirty = true;
	}

	// ---- beacons: beacon(x, y, z, colorHex) -> { set(x, y, z), remove() }. Pool of 8 (the oldest is
	// taken over when all are out). y is the ground under the thing being marked.
	const bcSerial = new Int32Array(MAX_BEACONS);
	const bcOn = new Uint8Array(MAX_BEACONS);
	let bcCursor = 0;
	function beacon(x, y, z, colorHex = 0xffe08a) {
		hexRGB(colorHex, 0xffe08a);
		let s = -1;
		for (let i = 0; i < MAX_BEACONS; i++) {
			const k = (bcCursor + i) % MAX_BEACONS;
			if (!bcOn[k]) { s = k; break; }
		}
		if (s < 0) s = bcCursor;
		bcCursor = (s + 1) % MAX_BEACONS;
		const serial = ++bcSerial[s];
		const epoch = fxEpoch;
		bcOn[s] = 1;
		const by = num(y, groundAt(x, z));
		noteY(by);
		cardSet(CD_BEACON0 + s, x, by, z, C_PILLAR, 0.62, 3.4, 0, 0, cR, cG, cB, 0.8, 1);
		glowOn(MAX_CAMPFIRES + s, x, by + 0.05, z, 0.85, cR, cG, cB, 0.6, 0.35, 2.3);
		const live = () => epoch === fxEpoch && bcSerial[s] === serial && bcOn[s] === 1;
		const h = {
			set(nx, ny, nz) {
				if (!live()) return h;
				const o = (CD_BEACON0 + s) * CD_STRIDE;
				const yy = num(ny, cdData[o + 1]);
				cardMove(CD_BEACON0 + s, nx, yy, nz);
				glowMove(MAX_CAMPFIRES + s, nx, yy + 0.05, nz);
				return h;
			},
			remove() {
				if (!live()) return;
				bcOn[s] = 0;
				cardOff(CD_BEACON0 + s);
				glowOff(MAX_CAMPFIRES + s);
			},
		};
		return h;
	}

	// ---- guide rings: ringGate(x, y, z, yaw, r, colorHex) -> { pass(), set(x, y, z, yaw, r), remove() }
	// A hoop of light standing in the air, its axis along yaw. pass() bursts it and frees it.
	const gtSerial = new Int32Array(MAX_GATES);
	const gtState = new Uint8Array(MAX_GATES); // 0 free, 1 showing, 2 bursting
	const gtEnd = new Float64Array(MAX_GATES);
	let gtCursor = 0;
	let gtBursting = 0;
	function ringGate(x, y, z, yaw = 0, r = 4, colorHex = 0x8fe9ff) {
		hexRGB(colorHex, 0x8fe9ff);
		const cr = cR;
		const cg = cG;
		const cb = cB;
		let s = -1;
		for (let i = 0; i < MAX_GATES; i++) {
			const k = (gtCursor + i) % MAX_GATES;
			if (gtState[k] === 0) { s = k; break; }
		}
		if (s < 0) {
			s = gtCursor;
			if (gtState[s] === 2) gtBursting--;
		}
		gtCursor = (s + 1) % MAX_GATES;
		const serial = ++gtSerial[s];
		const epoch = fxEpoch;
		gtState[s] = 1;
		const ci = CD_GATE0 + s;
		cardSet(ci, x, y, z, C_GATE, clampF(r, 4, 0.2, 60) * 2, 0, num(yaw, 0), 0, cr, cg, cb, 0.9, 1);
		const live = () => epoch === fxEpoch && gtSerial[s] === serial && gtState[s] === 1;
		const h = {
			pass() {
				if (!live()) return;
				const o = ci * CD_STRIDE;
				gtState[s] = 2;
				gtBursting++;
				gtEnd[s] = now + GATE_BURST;
				cdData[o + 15] = Math.max(now, 1e-4);
				cdDirty = true;
				const rad = cdData[o + 4] * 0.5;
				const yw = cdData[o + 6];
				const rx = Math.cos(yw);
				const rz = -Math.sin(yw);
				for (let i = 0; i < 18; i++) {
					const a = (i / 18) * Math.PI * 2 + rnd(-0.1, 0.1);
					const ca = Math.cos(a);
					const sa = Math.sin(a);
					const sp = rnd(1.5, 4.5);
					xs(cdData[o] + rx * ca * rad, cdData[o + 1] + sa * rad, cdData[o + 2] + rz * ca * rad,
						rx * ca * sp, sa * sp, rz * ca * sp, rnd(0.45, 0.9), rnd(0.05, 0.12) * (0.6 + rad * 0.12), 0.02, -0.6, 2.2,
						cr + (1 - cr) * 0.4, cg + (1 - cg) * 0.4, cb + (1 - cb) * 0.4, 0.75, X_STAR, rnd(-3, 3), rnd(0, 1.5), 1.0, NEVER, 0, 0, 0);
				}
			},
			set(nx, ny, nz, nyaw, nr) {
				if (!live()) return h;
				const o = ci * CD_STRIDE;
				cdData[o] = num(nx, cdData[o]); cdData[o + 1] = num(ny, cdData[o + 1]); cdData[o + 2] = num(nz, cdData[o + 2]);
				cdData[o + 6] = num(nyaw, cdData[o + 6]);
				if (typeof nr === "number" && nr > 0) cdData[o + 4] = nr * 2;
				cdDirty = true;
				return h;
			},
			remove() {
				if (!live()) return;
				gtState[s] = 0;
				cardOff(ci);
			},
		};
		return h;
	}

	// ---- light shafts: lightShafts(list | null, colorHex, strength). Each { x, y, z, yaw, w, h, tilt }:
	// (x, y, z) is the middle of the shaft's foot (where the light lands), the card stands in the plane
	// facing yaw, w wide and h tall, leaning sideways by tilt radians.
	function lightShafts(list, colorHex = 0xfff2c0, strength = 0.5) {
		hexRGB(colorHex, 0xfff2c0);
		const st = clampF(strength, 0.5, 0, 2);
		const n = list && list.length ? Math.min(list.length, MAX_SHAFTS) : 0;
		for (let i = 0; i < MAX_SHAFTS; i++) {
			if (i < n && list[i] && st > 0) {
				const s = list[i];
				const sx = num(s.x, 0);
				const sz = num(s.z, 0);
				cardSet(CD_SHAFT0 + i, sx, num(s.y, groundAt(sx, sz)), sz, C_SHAFT, clampF(s.w, 2.4, 0.1, 40), clampF(s.h, 12, 0.5, 80),
					num(s.yaw, 0), clampF(s.tilt, 0.3, -1.3, 1.3), cR, cG, cB, st, 1);
			} else {
				cardOff(CD_SHAFT0 + i);
			}
		}
	}
	// ---- mist: mistCards(list | null, colorHex, opacity). Each { x, y, z, w, h }: centre and size.
	function mistCards(list, colorHex = 0xdfe9e4, opacity = 0.3) {
		hexRGB(colorHex, 0xdfe9e4);
		const op = clampF(opacity, 0.3, 0, 1);
		const n = list && list.length ? Math.min(list.length, MAX_MIST) : 0;
		for (let i = 0; i < MAX_MIST; i++) {
			if (i < n && list[i] && op > 0) {
				const s = list[i];
				cardSet(CD_MIST0 + i, num(s.x, 0), num(s.y, 1.2), num(s.z, 0), C_MIST, clampF(s.w, 10, 0.5, 80), clampF(s.h, 3.5, 0.3, 40),
					0, 0, cR, cG, cB, op, 1);
			} else {
				cardOff(CD_MIST0 + i);
			}
		}
	}

	// ---- fire: campfire(x, y, z, size) -> { level(0..1), set(x, y, z), remove() } (pool of 6);
	// torch(x, y, z) -> the same handle shape (pool of 8). Flame cards + embers + glow, no light.
	const cfOn = new Uint8Array(MAX_CAMPFIRES);
	const cfSerial = new Int32Array(MAX_CAMPFIRES);
	const cfX = new Float32Array(MAX_CAMPFIRES);
	const cfY = new Float32Array(MAX_CAMPFIRES);
	const cfZ = new Float32Array(MAX_CAMPFIRES);
	const cfSize = new Float32Array(MAX_CAMPFIRES);
	const cfLevel = new Float32Array(MAX_CAMPFIRES);
	const cfAcc = new Float32Array(MAX_CAMPFIRES);
	let cfCursor = 0;
	let fireLive = 0;
	// flame card layout: dx, dz, width, height, tint (per unit of size)
	const CAMP_LAYOUT = [0, 0, 0.62, 1.25, 1.0, 0.17, 0.06, 0.46, 0.95, 0.92, -0.15, 0.1, 0.42, 0.85, 0.9,
		0.04, -0.17, 0.4, 0.75, 0.85, -0.05, 0.02, 0.9, 0.62, 0.7];
	function campPlace(s) {
		const sz = cfSize[s];
		const lv = cfLevel[s];
		for (let j = 0; j < CAMP_CARDS; j++) {
			const L = j * 5;
			const t = CAMP_LAYOUT[L + 4];
			cardSet(CD_CAMP0 + s * CAMP_CARDS + j, cfX[s] + CAMP_LAYOUT[L] * sz, cfY[s] + 0.02, cfZ[s] + CAMP_LAYOUT[L + 1] * sz, C_FLAME,
				CAMP_LAYOUT[L + 2] * sz, CAMP_LAYOUT[L + 3] * sz, 0, 0, t, t, t, j === 4 ? 0.55 : 0.9, lv);
		}
		glowOn(s, cfX[s], cfY[s] + 0.05, cfZ[s], 3.0 * sz, 1.0, 0.5, 0.14, 0.5 * lv, 0.4, 9);
	}
	function campLevel(s, v) {
		cfLevel[s] = v;
		for (let j = 0; j < CAMP_CARDS; j++) cdData[(CD_CAMP0 + s * CAMP_CARDS + j) * CD_STRIDE + 14] = v;
		cdDirty = true;
		glowAlpha(s, 0.5 * v);
	}
	function campfire(x, y, z, size = 1) {
		let s = -1;
		for (let i = 0; i < MAX_CAMPFIRES; i++) {
			const k = (cfCursor + i) % MAX_CAMPFIRES;
			if (!cfOn[k]) { s = k; break; }
		}
		if (s < 0) { s = cfCursor; fireLive--; }
		cfCursor = (s + 1) % MAX_CAMPFIRES;
		const serial = ++cfSerial[s];
		const epoch = fxEpoch;
		cfOn[s] = 1;
		fireLive++;
		cfX[s] = x; cfY[s] = num(y, groundAt(x, z)); cfZ[s] = z;
		cfSize[s] = clampF(size, 1, 0.2, 5);
		cfLevel[s] = 1;
		cfAcc[s] = 0;
		campPlace(s);
		const live = () => epoch === fxEpoch && cfSerial[s] === serial && cfOn[s] === 1;
		const h = {
			level(v) {
				if (live()) campLevel(s, clampF(v, 1, 0, 1));
				return h;
			},
			set(nx, ny, nz) {
				if (!live()) return h;
				cfX[s] = num(nx, cfX[s]); cfY[s] = num(ny, cfY[s]); cfZ[s] = num(nz, cfZ[s]);
				const lv = cfLevel[s];
				campPlace(s);
				campLevel(s, lv);
				return h;
			},
			remove() {
				if (!live()) return;
				cfOn[s] = 0;
				fireLive--;
				for (let j = 0; j < CAMP_CARDS; j++) cardOff(CD_CAMP0 + s * CAMP_CARDS + j);
				glowOff(s);
			},
		};
		return h;
	}
	const tcOn = new Uint8Array(MAX_TORCHES);
	const tcSerial = new Int32Array(MAX_TORCHES);
	const tcX = new Float32Array(MAX_TORCHES);
	const tcY = new Float32Array(MAX_TORCHES);
	const tcZ = new Float32Array(MAX_TORCHES);
	const tcLevel = new Float32Array(MAX_TORCHES);
	const tcAcc = new Float32Array(MAX_TORCHES);
	let tcCursor = 0;
	function torchPlace(s) {
		const b = CD_TORCH0 + s * TORCH_CARDS;
		const lv = tcLevel[s];
		cardSet(b, tcX[s], tcY[s], tcZ[s], C_FLAME, 0.24, 0.52, 0, 0, 1, 1, 1, 0.95, lv);
		cardSet(b + 1, tcX[s] + 0.02, tcY[s], tcZ[s] - 0.02, C_FLAME, 0.16, 0.36, 0, 0, 0.9, 0.9, 0.9, 0.8, lv);
		cardSet(b + 2, tcX[s], tcY[s] + 0.16, tcZ[s], C_HALO, 1.7, 0, 0, 0, 1.0, 0.55, 0.18, 0.32, lv);
	}
	function torch(x, y, z) {
		let s = -1;
		for (let i = 0; i < MAX_TORCHES; i++) {
			const k = (tcCursor + i) % MAX_TORCHES;
			if (!tcOn[k]) { s = k; break; }
		}
		if (s < 0) { s = tcCursor; fireLive--; }
		tcCursor = (s + 1) % MAX_TORCHES;
		const serial = ++tcSerial[s];
		const epoch = fxEpoch;
		tcOn[s] = 1;
		fireLive++;
		tcX[s] = x; tcY[s] = num(y, 1.6); tcZ[s] = z;
		tcLevel[s] = 1;
		tcAcc[s] = 0;
		torchPlace(s);
		const live = () => epoch === fxEpoch && tcSerial[s] === serial && tcOn[s] === 1;
		const h = {
			level(v) {
				if (!live()) return h;
				tcLevel[s] = clampF(v, 1, 0, 1);
				for (let j = 0; j < TORCH_CARDS; j++) cdData[(CD_TORCH0 + s * TORCH_CARDS + j) * CD_STRIDE + 14] = tcLevel[s];
				cdDirty = true;
				return h;
			},
			set(nx, ny, nz) {
				if (!live()) return h;
				tcX[s] = num(nx, tcX[s]); tcY[s] = num(ny, tcY[s]); tcZ[s] = num(nz, tcZ[s]);
				const b = CD_TORCH0 + s * TORCH_CARDS;
				cardMove(b, tcX[s], tcY[s], tcZ[s]);
				cardMove(b + 1, tcX[s] + 0.02, tcY[s], tcZ[s] - 0.02);
				cardMove(b + 2, tcX[s], tcY[s] + 0.16, tcZ[s]);
				return h;
			},
			remove() {
				if (!live()) return;
				tcOn[s] = 0;
				fireLive--;
				for (let j = 0; j < TORCH_CARDS; j++) cardOff(CD_TORCH0 + s * TORCH_CARDS + j);
			},
		};
		return h;
	}

	// ------------------------------------------------------------------ the scream (1 draw call)
	function buildScreamGeometry() {
		const LON = 48;
		const LAT = 9;
		const per = (LON + 1) * (LAT + 1);
		const pos = new Float32Array(per * 2 * 3);
		const shell = new Float32Array(per * 2);
		const index = new Uint16Array(LON * LAT * 6 * 2);
		let v = 0;
		let ii = 0;
		for (let s = 0; s < 2; s++) {
			const base = v;
			for (let j = 0; j <= LAT; j++) {
				const el = (j / LAT) * Math.PI * 0.5;
				for (let i = 0; i <= LON; i++) {
					const an = (i / LON) * Math.PI * 2;
					pos[v * 3] = Math.cos(el) * Math.cos(an);
					pos[v * 3 + 1] = Math.sin(el);
					pos[v * 3 + 2] = Math.cos(el) * Math.sin(an);
					shell[v] = s;
					v++;
				}
			}
			for (let j = 0; j < LAT; j++) {
				for (let i = 0; i < LON; i++) {
					const a = base + j * (LON + 1) + i;
					const b = a + 1;
					const c = a + LON + 1;
					const d = c + 1;
					index[ii++] = a; index[ii++] = c; index[ii++] = b;
					index[ii++] = b; index[ii++] = c; index[ii++] = d;
				}
			}
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
		geo.setAttribute("aShell", new THREE.BufferAttribute(shell, 1));
		geo.setIndex(new THREE.BufferAttribute(index, 1));
		return geo;
	}
	const uScreamC = { value: new THREE.Vector4(0, 0, 0, 0) };
	const uScreamP = { value: new THREE.Vector4(0, 0, 0, 1) };
	const scMat = new THREE.ShaderMaterial({
		uniforms: { uC: uScreamC, uP: uScreamP },
		vertexShader: SCREAM_VERT,
		fragmentShader: SCREAM_FRAG,
		transparent: true,
		depthWrite: false,
		premultipliedAlpha: true,
		blending: THREE.NormalBlending,
		side: THREE.DoubleSide,
	});
	const screamMesh = new THREE.Mesh(buildScreamGeometry(), scMat);
	screamMesh.name = "fx-scream";
	screamMesh.frustumCulled = false;
	screamMesh.renderOrder = 6;
	screamMesh.visible = false;
	screamMesh.castShadow = false;
	screamMesh.receiveShadow = false;
	group.add(screamMesh);

	// fx.shock: ALWAYS present. Worlds bind shock.uniform in their foliage shaders.
	const shock = {
		uniform: { value: new THREE.Vector4(0, 0, 0, 0) }, // x, z, radius, strength
		x: 0,
		z: 0,
		radius: 0,
		strength: 0,
		active: false,
	};
	const scr = { phase: 0, t: 0, x: 0, y: 0, z: 0, power: 1, maxR: 22, acc: 0, leaf: 0 };
	function shockWrite() {
		shock.uniform.value.set(shock.x, shock.z, shock.radius, shock.strength);
	}
	const LEAF_TONES = [0.2, 0.42, 0.12, 0.3, 0.5, 0.14, 0.42, 0.52, 0.16, 0.16, 0.33, 0.1, 0.5, 0.44, 0.14, 0.36, 0.26, 0.1];

	function leafFlake(x, y, z, vx, vy, vz, floorY, r, g, b, big) {
		const k = rnd(1.5, 2.4);
		const grav = -rnd(0.8, 1.5) * k;
		solveLand(x, y, z, vx, vy, vz, grav, k, floorY + 0.004, true, 9);
		const hx = rnd(0.022, 0.045) * big;
		const idx = confCursor;
		confCursor = (confCursor + 1) % MAX_CONFETTI;
		flake(idx, x, y, z, vx, vy, vz, landT + rnd(2.5, 4.5), grav, k, landT, 0, rnd(0, 6.28), rnd(-0.5, 0.5),
			rnd(4, 12) * (Math.random() < 0.5 ? -1 : 1), rnd(0, 6.28), r, g, b, 1, hx, hx * rnd(1.5, 2.3), rnd(0.06, 0.2));
	}

	// screamWave(x, y, z, power = 1) -> seconds the ground ring takes to reach its full radius.
	// (x, y, z) = the screamer's mouth; the ground is taken as setGround / y - 0.25.
	function screamWave(x, y, z, power = 1) {
		const p = clampF(power, 1, 0.05, 1.5);
		const maxR = 8 + 14 * p;
		const gy = floorAt(x, z, num(y, 0.25) - 0.25);
		noteY(gy);
		scr.phase = 1;
		scr.t = 0;
		scr.x = x; scr.y = gy; scr.z = z;
		scr.power = p;
		scr.maxR = maxR;
		scr.acc = 0;
		scr.leaf = 0;
		shock.x = x;
		shock.z = z;
		shock.radius = 0;
		shock.strength = p;
		shock.active = true;
		shockWrite();
		uScreamC.value.set(x, gy, z, 0.01);
		uScreamP.value.set(p, 0, Math.min(p * 1.1, 1.2), maxR);
		screamMesh.visible = true;

		const my = num(y, gy + 0.25);
		// white-hot core
		spawn(x, my, z, 0, 0, 0, 0.3, 0.4, 3.2 + 3.5 * p, 0, 0, 1, 1, 1, 0.75, FLASH, 0, 0, 1.0);
		spawn(x, my, z, 0, 0, 0, 0.55, 1.2, 5 + 5 * p, 0, 0, 0.82, 0.92, 1.0, 1.0, SOFT, 0, 0, 0.5 * p + 0.2);
		xs(x, my, z, 0, 0, 0, 0.38, 0.3, 2.2 + 2.4 * p, 0, 1, 1, 1, 1, 0.9, X_STAR, 0.4, rnd(0, 1.5), 1.0, NEVER, 0, 0, 0);
		// the ground ring racing out, and a second, slower, lower one
		gdTrans(x, gy + 0.09, z, maxR / SCREAM_SPEED + 0.12, maxR + 0.5, G_SCREAM, 0.86, 0.94, 1.0, Math.min(0.55 + 0.45 * p, 1),
			SCREAM_SPEED, maxR, p, 0, 0, 0.9, 0);
		gdTrans(x, gy + 0.07, z, (maxR * 0.7) / 10 + 0.12, maxR * 0.7 + 0.5, G_DUST, 0.84, 0.8, 0.72, 0.6,
			10, maxR * 0.7, 2.2, 0, 0, 0.15, 0.1);
		xring(x, gy + 0.1, z, 0.5, 0.3, 4 + 3 * p, 0.09, 1, 1, 1, 0.8, R_IMPACT, rnd(0, 6.28), 1, 0.9, 0, 0, 0);
		// bits torn loose at the centre
		const nb = 10 + Math.round(14 * p);
		for (let i = 0; i < nb; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(5, 13) * (0.5 + 0.5 * p);
			xs(x + Math.cos(a) * 0.3, gy + 0.1, z + Math.sin(a) * 0.3, Math.cos(a) * sp, rnd(1.5, 5), Math.sin(a) * sp,
				rnd(0.5, 1.0), rnd(0.02, 0.04), 0.012, -6, 1.6, 1, 0.98, 0.9, 0.7, X_EMBER, 0.05, 0, 1.0, NEVER, 0, 0, 0);
		}
		return maxR / SCREAM_SPEED;
	}

	function screamUpdate(dt) {
		if (scr.phase === 0) return;
		scr.t += dt;
		if (scr.phase === 1) {
			let R = SCREAM_SPEED * scr.t;
			const done = R >= scr.maxR;
			if (done) R = scr.maxR;
			const k = R / scr.maxR;
			shock.radius = R;
			shock.strength = scr.power;
			uScreamC.value.w = Math.max(R, 0.01);
			uScreamP.value.y = scr.t;
			uScreamP.value.z = Math.min(scr.power * 1.1, 1.2) * Math.pow(1 - k, 0.75);
			// the wall of dust and torn leaves riding just behind the front
			scr.acc += dt;
			let guard = 0;
			while (scr.acc > 0.016 && guard++ < 4 && !done) {
				scr.acc -= 0.016;
				const per = 3 + Math.round(3 * scr.power);
				for (let i = 0; i < per; i++) {
					const a = Math.random() * Math.PI * 2;
					const ca = Math.cos(a);
					const sa = Math.sin(a);
					const rr = Math.max(R - rnd(0.2, 1.2), 0.2);
					const px = scr.x + ca * rr;
					const pz = scr.z + sa * rr;
					const fy = floorAt(px, pz, scr.y);
					const sp = rnd(3, 8);
					const tone = Math.random();
					xs(px, fy + rnd(0.05, 0.5), pz, ca * sp, rnd(0.6, 3.2), sa * sp, rnd(0.8, 1.7), rnd(0.2, 0.4), rnd(0.8, 1.5),
						0.2, 2.2, 0.72 + tone * 0.12, 0.67 + tone * 0.11, 0.57 + tone * 0.1, 0.0, X_SOFT, 0, 0,
						rnd(0.22, 0.4) * (1 - 0.5 * k), NEVER, 0, 0, 0);
				}
				scr.leaf++;
				const nl = scr.leaf % 2 === 0 ? 2 : 3;
				for (let i = 0; i < nl; i++) {
					const a = Math.random() * Math.PI * 2;
					const ca = Math.cos(a);
					const sa = Math.sin(a);
					const px = scr.x + ca * R;
					const pz = scr.z + sa * R;
					const fy = floorAt(px, pz, scr.y);
					const sp = rnd(5, 12);
					const li = ((Math.random() * 6) | 0) * 3;
					leafFlake(px, fy + rnd(0.1, 1.6), pz, ca * sp + rnd(-1.5, 1.5), rnd(1.5, 6.5), sa * sp + rnd(-1.5, 1.5), fy,
						LEAF_TONES[li], LEAF_TONES[li + 1], LEAF_TONES[li + 2], 1.15);
				}
			}
			if (scr.acc > 0.05) scr.acc = 0;
			if (done) {
				scr.phase = 2;
				scr.t = 0;
				screamMesh.visible = false;
			}
		} else {
			// everything lies flat behind the wave, then springs back
			const k = scr.t / SHOCK_RECOVER;
			if (k >= 1) {
				scr.phase = 0;
				shock.strength = 0;
				shock.active = false;
			} else {
				const e = 1 - k;
				shock.strength = scr.power * e * e * (3 - 2 * e);
			}
		}
		shockWrite();
	}

	// ------------------------------------------------------------------ transformation swirl (1 draw call)
	function buildSwirlGeometry() {
		const per = (SWIRL_SEGS + 1) * 2;
		const pos = new Float32Array(per * 2 * 3);
		const aT = new Float32Array(per * 2);
		const aSide = new Float32Array(per * 2);
		const aDir = new Float32Array(per * 2);
		const index = new Uint16Array(SWIRL_SEGS * 6 * 2);
		let v = 0;
		let ii = 0;
		for (let rb = 0; rb < 2; rb++) {
			const base = v;
			for (let j = 0; j <= SWIRL_SEGS; j++) {
				for (let k = 0; k < 2; k++) {
					aT[v] = j / SWIRL_SEGS;
					aSide[v] = k === 0 ? -1 : 1;
					aDir[v] = rb === 0 ? 1 : -1;
					v++;
				}
			}
			for (let j = 0; j < SWIRL_SEGS; j++) {
				const a = base + j * 2;
				index[ii++] = a; index[ii++] = a + 1; index[ii++] = a + 2;
				index[ii++] = a + 1; index[ii++] = a + 3; index[ii++] = a + 2;
			}
		}
		const geo = new THREE.InstancedBufferGeometry();
		geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
		geo.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
		geo.setAttribute("aSide", new THREE.BufferAttribute(aSide, 1));
		geo.setAttribute("aDir", new THREE.BufferAttribute(aDir, 1));
		geo.setIndex(new THREE.BufferAttribute(index, 1));
		return geo;
	}
	const swData = new Float32Array(MAX_SWIRLS * SW_STRIDE);
	const swBuffer = new THREE.InstancedInterleavedBuffer(swData, SW_STRIDE, 1);
	swBuffer.setUsage(THREE.DynamicDrawUsage);
	const swGeo = buildSwirlGeometry();
	swGeo.setAttribute("aS", new THREE.InterleavedBufferAttribute(swBuffer, 4, 0));
	swGeo.setAttribute("aS2", new THREE.InterleavedBufferAttribute(swBuffer, 4, 4));
	swGeo.instanceCount = MAX_SWIRLS;
	const swMat = new THREE.ShaderMaterial({
		uniforms: { uTime },
		vertexShader: SWIRL_VERT,
		fragmentShader: SWIRL_FRAG,
		transparent: true,
		depthWrite: false,
		premultipliedAlpha: true,
		blending: THREE.NormalBlending,
		side: THREE.DoubleSide,
	});
	const swirl = new THREE.Mesh(swGeo, swMat);
	swirl.name = "fx-swirl";
	swirl.frustumCulled = false;
	swirl.renderOrder = 5;
	swirl.visible = false;
	swirl.castShadow = false;
	swirl.receiveShadow = false;
	group.add(swirl);
	let swCursor = 0;
	let swDirty = false;
	let swAliveUntil = -1;

	// transformSwirl(x, y, z, seconds = 2.6, height = 1.9): (x, y, z) = the ground under the body.
	// Two counter-rotating ribbons wind up and tighten, a column of sparkles climbs inside them, a soft
	// bloom at 80 %, then glints rain down.
	function transformSwirl(x, y, z, seconds = 2.6, height = 1.9) {
		const secs = clampF(seconds, 2.6, 0.3, 12);
		const hgt = clampF(height, 1.9, 0.3, 8);
		const gy = num(y, groundAt(x, z));
		noteY(gy);
		const o = swCursor * SW_STRIDE;
		swCursor = (swCursor + 1) % MAX_SWIRLS;
		const rad = 0.42 + 0.26 * hgt;
		swData[o] = x; swData[o + 1] = gy + 0.04; swData[o + 2] = z; swData[o + 3] = now;
		swData[o + 4] = secs; swData[o + 5] = hgt; swData[o + 6] = Math.random(); swData[o + 7] = rad;
		swDirty = true;
		if (now + secs > swAliveUntil) swAliveUntil = now + secs;
		swirl.visible = true;

		const tb = secs * 0.8; // the bloom
		const by = gy + 0.42;  // where the ball of light hangs
		// pool of light on the ground
		gdTrans(x, gy + 0.05, z, secs * 1.05, rad * 1.5, G_MIST, 0.55, 1.0, 0.62, 0.55, rad * 1.5, 0, 0, 0, 0, 0.85, 0);
		xring(x, gy + 0.06, z, 0.7, 0.1, rad * 1.5, 0.08, 0.6, 1.0, 0.7, 0.7, R_CLEAN, 0, 1, 0.7, 0, 0, 0);
		// column of sparkles: drawn in from the rim, climbing
		for (let i = 0; i < 38; i++) {
			const a = Math.random() * Math.PI * 2;
			const rr = rad * rnd(0.3, 1.0);
			const gold = Math.random() < 0.45;
			const life = rnd(0.7, 1.3);
			xs(x + Math.cos(a) * rr, gy + rnd(0.02, 0.3), z + Math.sin(a) * rr, -Math.cos(a) * rr * 0.7, rnd(0.6, 1.5) * hgt * 0.6, -Math.sin(a) * rr * 0.7,
				life, rnd(0.02, 0.045), 0.012, 0.3, 1.1, gold ? 1.0 : 0.5, gold ? 0.9 : 1.0, gold ? 0.5 : 0.7, 0.8, X_STAR, rnd(-3, 3), rnd(0, 1.5), 1.0,
				NEVER, rnd(0.02, 0.07), rnd(3, 6), rnd(0.05, 0.72) * secs);
		}
		// soft motes breathing off the body while it lifts
		for (let i = 0; i < 10; i++) {
			const a = Math.random() * Math.PI * 2;
			const rr = rad * rnd(0.1, 0.7);
			xs(x + Math.cos(a) * rr, gy + rnd(0.1, 0.5), z + Math.sin(a) * rr, 0, rnd(0.15, 0.45), 0, rnd(0.9, 1.5), 0.08, rnd(0.2, 0.34),
				0.1, 1.5, 0.5, 1.0, 0.65, 0.9, X_SOFT, 0, 0, 0.22, NEVER, 0.05, 1.5, rnd(0, 0.5) * secs);
		}
		// the bloom
		xs(x, by, z, 0, 0, 0, 0.6, 0.25, 1.7, 0, 1, 0.75, 1.0, 0.8, 1.0, X_SOFT, 0, 0, 0.85, NEVER, 0, 0, tb - 0.06);
		xs(x, by, z, 0, 0, 0, 0.45, 0.2, 1.25, 0, 1, 1.0, 0.97, 0.8, 0.9, X_STAR, 0.35, rnd(0, 1.5), 1.0, NEVER, 0, 0, tb - 0.03);
		xs(x, by, z, 0, 0, 0, 0.9, 0.5, 2.6, 0, 1, 0.45, 1.0, 0.65, 1.0, X_SOFT, 0, 0, 0.3, NEVER, 0, 0, tb);
		xring(x, gy + 0.07, z, 0.8, 0.15, rad * 2.6, 0.06, 1.0, 0.95, 0.7, 0.8, R_CLEAN, 0, 1, 0.8, 0, 0, tb);
		xring(x, by, z, 0.55, 0.1, 1.1, 0.07, 0.7, 1.0, 0.8, 0.9, R_HALO, rnd(0, 6.28), 1, 0.7, 1, 0, tb);
		// glints thrown out by the bloom, sinking back down onto the newborn
		for (let i = 0; i < 26; i++) {
			const a = Math.random() * Math.PI * 2;
			const el = rnd(0.1, 1.3);
			const sp = rnd(0.5, 1.7);
			const vx = Math.cos(a) * Math.cos(el) * sp;
			const vz = Math.sin(a) * Math.cos(el) * sp;
			const vy = Math.sin(el) * sp + 0.4;
			const tl = timeToY(by, vy, -2.4, 1.6, gy + 0.05, -1, 2.2);
			const gold = Math.random() < 0.6;
			xs(x, by, z, vx, vy, vz, Math.min(tl + 0.25, secs * 0.2 + 1.1), rnd(0.018, 0.04), 0.01, -2.4, 1.6,
				gold ? 1.0 : 0.6, gold ? 0.92 : 1.0, gold ? 0.55 : 0.75, 0.8, X_STAR, rnd(-3, 3), rnd(0, 1.5), 1.0,
				tl, 0.02, rnd(2, 5), tb + rnd(0, 0.12));
		}
	}

	// ------------------------------------------------------------------ air: dream motes, fireflies, wind (1 draw call)
	const airData = new Float32Array(AIR_COUNT * AIR_STRIDE);
	for (let i = 0; i < AIR_COUNT; i++) {
		const o = i * AIR_STRIDE;
		airData[o] = Math.random(); airData[o + 1] = Math.random(); airData[o + 2] = Math.random();
		airData[o + 5] = Math.random();
		airData[o + 6] = Math.random();
		if (i < AIR_DREAM) {
			const big = Math.random() < 0.1;
			airData[o + 3] = 0;
			airData[o + 4] = big ? rnd(0.07, 0.12) : rnd(0.018, 0.045);
			airData[o + 7] = big ? rnd(0.12, 0.22) : rnd(0.35, 0.8);
		} else if (i < AIR_DREAM + AIR_FLIES) {
			airData[o + 3] = 1;
			airData[o + 4] = rnd(0.035, 0.06);
			airData[o + 6] = (i - AIR_DREAM) / AIR_FLIES; // rank: the first n are out
			airData[o + 7] = 1;
		} else {
			airData[o + 3] = 2;
			airData[o + 4] = rnd(0.006, 0.012);
			airData[o + 7] = rnd(0.25, 0.55);
		}
	}
	const airBuffer = new THREE.InstancedInterleavedBuffer(airData, AIR_STRIDE, 1);
	const airGeo = new THREE.InstancedBufferGeometry();
	airGeo.setAttribute("position", new THREE.BufferAttribute(quad, 3));
	airGeo.setIndex(quadIndex);
	airGeo.setAttribute("aA", new THREE.InterleavedBufferAttribute(airBuffer, 4, 0));
	airGeo.setAttribute("aB", new THREE.InterleavedBufferAttribute(airBuffer, 4, 4));
	airGeo.instanceCount = AIR_COUNT;
	const uDream = { value: new THREE.Vector4(0, 14, 0, 0) };
	const uDreamCol = { value: new THREE.Vector3(0.81, 0.84, 1.0) };
	const uFly = { value: new THREE.Vector4(0, 0, 0, 14) };
	const uFlyY = { value: new THREE.Vector2(0, 0.6) };
	const uWind = { value: new THREE.Vector4(1, 0, 0, 16) };
	const airMat = new THREE.ShaderMaterial({
		uniforms: { uTime, uDream, uDreamCol, uFly, uFlyY, uWind },
		vertexShader: AIR_VERT,
		fragmentShader: AIR_FRAG,
		transparent: true,
		depthWrite: false,
		premultipliedAlpha: true,
		blending: THREE.NormalBlending,
		side: THREE.DoubleSide,
	});
	const air = new THREE.Mesh(airGeo, airMat);
	air.name = "fx-air";
	air.frustumCulled = false;
	air.renderOrder = 5;
	air.visible = false;
	air.castShadow = false;
	air.receiveShadow = false;
	group.add(air);
	let dreamTarget = 0, dreamFade = 0, flyTarget = 0, flyFade = 0, windTarget = 0, windFade = 0, windStrength = 0;

	function dreamMotes(on, radius = 14, colorHex = 0xcfd6ff) {
		dreamTarget = on ? 1 : 0;
		if (on) {
			uDream.value.y = clampF(radius, 14, 3, 60);
			hexRGB(colorHex, 0xcfd6ff);
			uDreamCol.value.set(cR, cG, cB);
			air.visible = true;
		}
	}
	function fireflies(on, cx, cz, radius = 14, n = 40) {
		flyTarget = on ? 1 : 0;
		if (on) {
			const x = num(cx, 0);
			const z = num(cz, 0);
			uFly.value.y = x;
			uFly.value.z = z;
			uFly.value.w = clampF(radius, 14, 1, 80);
			uFlyY.value.set(groundAt(x, z), clampN(n, 40, 1, AIR_FLIES) / AIR_FLIES + 1e-4);
			air.visible = true;
		}
	}
	// windStreaks(on, dirX, dirZ, strength 0..1): thin streaks crossing the air around the camera
	function windStreaks(on, dirX, dirZ, strength = 0.6) {
		windTarget = on ? 1 : 0;
		if (on) {
			let dx = num(dirX, 1);
			let dz = num(dirZ, 0);
			const l = Math.sqrt(dx * dx + dz * dz);
			if (l < 1e-4) { dx = 1; dz = 0; } else { dx /= l; dz /= l; }
			windStrength = clampF(strength, 0.6, 0.05, 1.5);
			uWind.value.x = dx;
			uWind.value.y = dz;
			uWind.value.w = 12 + 16 * windStrength;
			air.visible = true;
		}
	}

	// ------------------------------------------------------------------ birds (1 draw call)
	function buildBirdGeometry() {
		// two wings of two panels each; aWing = 0 at the body .. 1 at the tip
		const P = [
			0, 0, 0.3, 0, 0, -0.3,
			0.5, 0, 0.2, 0.5, 0, -0.26, 1, 0, -0.12,
			-0.5, 0, 0.2, -0.5, 0, -0.26, -1, 0, -0.12,
		];
		const W = [0, 0, 0.5, 0.5, 1, 0.5, 0.5, 1];
		const I = [0, 1, 2, 1, 3, 2, 2, 3, 4, 0, 5, 1, 1, 5, 6, 5, 7, 6];
		const geo = new THREE.InstancedBufferGeometry();
		geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(P), 3));
		geo.setAttribute("aWing", new THREE.BufferAttribute(new Float32Array(W), 1));
		geo.setIndex(I);
		return geo;
	}
	const bdData = new Float32Array(MAX_BIRDS * BD_STRIDE);
	const bdBuffer = new THREE.InstancedInterleavedBuffer(bdData, BD_STRIDE, 1);
	bdBuffer.setUsage(THREE.DynamicDrawUsage);
	const bdGeo = buildBirdGeometry();
	bdGeo.setAttribute("aA", new THREE.InterleavedBufferAttribute(bdBuffer, 4, 0));
	bdGeo.setAttribute("aB", new THREE.InterleavedBufferAttribute(bdBuffer, 4, 4));
	bdGeo.setAttribute("aC", new THREE.InterleavedBufferAttribute(bdBuffer, 4, 8));
	bdGeo.instanceCount = MAX_BIRDS;
	const bdMat = new THREE.ShaderMaterial({
		uniforms: { uTime },
		vertexShader: BIRD_VERT,
		fragmentShader: BIRD_FRAG,
		transparent: true,
		depthWrite: false,
		premultipliedAlpha: true,
		blending: THREE.NormalBlending,
		side: THREE.DoubleSide,
	});
	const birdMesh = new THREE.Mesh(bdGeo, bdMat);
	birdMesh.name = "fx-birds";
	birdMesh.frustumCulled = false;
	birdMesh.renderOrder = 3;
	birdMesh.visible = false;
	birdMesh.castShadow = false;
	birdMesh.receiveShadow = false;
	group.add(birdMesh);
	let bdCursor = 0;
	let bdDirty = false;
	let bdAliveUntil = -1;

	// birds(x, y, z, n = 12, dirX = 0, dirZ = 0): a flock bursting up and away (toward dir, or scattering)
	function birds(x, y, z, n = 12, dirX = 0, dirZ = 0) {
		const cnt = clampN(n, 12, 1, MAX_BIRDS);
		let dx = num(dirX, 0);
		let dz = num(dirZ, 0);
		const dl = Math.sqrt(dx * dx + dz * dz);
		const aimed = dl > 1e-3;
		if (aimed) { dx /= dl; dz /= dl; }
		const a0 = Math.random() * Math.PI * 2;
		for (let i = 0; i < cnt; i++) {
			const o = bdCursor * BD_STRIDE;
			bdCursor = (bdCursor + 1) % MAX_BIRDS;
			let hx;
			let hz;
			if (aimed) {
				const sprd = rnd(-0.55, 0.55);
				const c = Math.cos(sprd);
				const s = Math.sin(sprd);
				hx = dx * c - dz * s;
				hz = dx * s + dz * c;
			} else {
				const a = a0 + rnd(-1.1, 1.1);
				hx = Math.cos(a);
				hz = Math.sin(a);
			}
			const sp = rnd(3.2, 5.6);
			const life = rnd(3.4, 4.3);
			const t0 = now + rnd(0, 0.35);
			bdData[o] = x + rnd(-1.6, 1.6); bdData[o + 1] = num(y, 2) + rnd(-0.5, 0.8); bdData[o + 2] = z + rnd(-1.6, 1.6); bdData[o + 3] = t0;
			bdData[o + 4] = hx * sp; bdData[o + 5] = rnd(1.4, 3.0); bdData[o + 6] = hz * sp; bdData[o + 7] = life;
			bdData[o + 8] = Math.random(); bdData[o + 9] = rnd(0.2, 0.34); bdData[o + 10] = rnd(15, 22); bdData[o + 11] = Math.random() * 0.6;
			if (t0 + life > bdAliveUntil) bdAliveUntil = t0 + life;
		}
		bdDirty = true;
		birdMesh.visible = true;
	}

	// ------------------------------------------------------------------ guns
	function muzzleFlash(pos, dirX, dirZ, size = 1) {
		const s = clampF(size, 1, 0.2, 4);
		let dx = num(dirX, 0);
		let dz = num(dirZ, 1);
		const dl = Math.sqrt(dx * dx + dz * dz);
		if (dl < 1e-4) { dx = 0; dz = 1; } else { dx /= dl; dz /= dl; }
		const x = pos.x;
		const y = pos.y;
		const z = pos.z;
		spawn(x + dx * 0.1 * s, y, z + dz * 0.1 * s, 0, 0, 0, 0.07, 0.12 * s, 0.42 * s, 0, 0, 1.0, 0.86, 0.5, 0.8, FLASH, 0, 0, 1.0);
		xs(x + dx * 0.16 * s, y, z + dz * 0.16 * s, 0, 0, 0, 0.08, 0.16 * s, 0.34 * s, 0, 1, 1.0, 0.93, 0.7, 0.9, X_STAR, 0.2, rnd(0, 1.5), 1.0, NEVER, 0, 0, 0);
		spawn(x, y, z, 0, 0, 0, 0.1, 0.5 * s, 1.1 * s, 0, 0, 1.0, 0.75, 0.4, 1.0, SOFT, 0, 0, 0.3);
		for (let i = 0; i < 5; i++) {
			const sp = rnd(7, 16) * s;
			xs(x, y, z, dx * sp + rnd(-1.6, 1.6), rnd(-1.2, 1.6), dz * sp + rnd(-1.6, 1.6), rnd(0.06, 0.13), rnd(0.02, 0.035) * s, 0.008,
				-3, 4, 1.0, 0.85, 0.45, 0.85, X_EMBER, 0.06, 0, 1.0, NEVER, 0, 0, 0);
		}
		xs(x + dx * 0.15, y + 0.02, z + dz * 0.15, dx * 0.8, 0.35, dz * 0.8, rnd(0.5, 0.8), 0.05 * s, 0.24 * s, 0.2, 2.4, 0.6, 0.6, 0.6, 0.0,
			X_SOFT, 0, 0, 0.22, NEVER, 0, 0, 0.02);
	}

	function bulletImpact(pos, surface = "dirt") {
		const x = pos.x;
		const y = pos.y;
		const z = pos.z;
		if (surface === "metal") {
			spawn(x, y, z, 0, 0, 0, 0.08, 0.05, 0.3, 0, 0, 1.0, 0.92, 0.7, 0.8, FLASH, 0, 0, 1.0);
			for (let i = 0; i < 9; i++) {
				const a = Math.random() * Math.PI * 2;
				const el = rnd(-0.2, 1.2);
				const sp = rnd(2.5, 8);
				xs(x, y, z, Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + 0.5, Math.sin(a) * Math.cos(el) * sp, rnd(0.18, 0.45),
					rnd(0.012, 0.024), 0.006, -9.8, 1.0, 1.0, 0.82, 0.42, 0.85, X_EMBER, 0.09, 0, 1.0, NEVER, 0, 0, 0);
			}
			xs(x, y, z, 0, 0.2, 0, 0.35, 0.04, 0.16, 0.1, 3, 0.75, 0.75, 0.78, 0.0, X_SOFT, 0, 0, 0.25, NEVER, 0, 0, 0);
			return;
		}
		if (surface === "leaves") {
			const f = floorAt(x, z, hintY !== null ? hintY : y - 1.5);
			for (let i = 0; i < 4; i++) {
				const li = ((Math.random() * 6) | 0) * 3;
				leafFlake(x, y, z, rnd(-1.6, 1.6), rnd(0.3, 2.2), rnd(-1.6, 1.6), f, LEAF_TONES[li], LEAF_TONES[li + 1], LEAF_TONES[li + 2], 0.8);
			}
			xs(x, y, z, 0, 0.2, 0, 0.4, 0.05, 0.2, 0.1, 3, 0.5, 0.62, 0.4, 0.0, X_SOFT, 0, 0, 0.22, NEVER, 0, 0, 0);
			return;
		}
		// dirt / wood / concrete: a puff and chips, in the colour of the stuff
		let r = 0.5, g = 0.4, b = 0.29, pale = 0.16, chips = 6, puff = 3;
		if (surface === "wood") { r = 0.66; g = 0.5; b = 0.3; pale = 0.2; chips = 7; puff = 2; }
		else if (surface === "concrete") { r = 0.66; g = 0.65; b = 0.63; pale = 0.14; chips = 5; puff = 4; }
		for (let i = 0; i < puff; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(0.2, 0.9);
			xs(x, y, z, Math.cos(a) * sp, rnd(0.3, 1.1), Math.sin(a) * sp, rnd(0.45, 0.85), 0.05, rnd(0.2, 0.34), 0.12, 3.0,
				r + pale, g + pale, b + pale, 0.0, X_SOFT, 0, 0, rnd(0.28, 0.42), NEVER, 0, 0, 0);
		}
		const f0 = floorAt(x, z, hintY !== null ? Math.min(hintY, y) : y - 0.8);
		for (let i = 0; i < chips; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(0.6, 2.6);
			const vx = Math.cos(a) * sp;
			const vz = Math.sin(a) * sp;
			const vy = rnd(0.8, 3.2);
			solveLand(x, y, z, vx, vy, vz, -9.8, 0.8, f0 + 0.006, true, 2);
			const tone = Math.random() * 0.14;
			xs(x, y, z, vx, vy, vz, landT + rnd(0.4, 0.9), rnd(0.008, 0.018), 0.007, -9.8, 0.8, r + tone, g + tone, b + tone, 0.0,
				X_GRAIN, rnd(-16, 16), rnd(0, 6.28), 1.0, landT, 0, 0, 0);
		}
	}

	// ------------------------------------------------------------------ potions
	let trailT = -1;
	// potionTrail(pos): call every frame on the flying flask
	function potionTrail(pos) {
		if (now - trailT < 0.011) return;
		trailT = now;
		const gold = Math.random() < 0.45;
		xs(pos.x + rnd(-0.03, 0.03), pos.y + rnd(-0.03, 0.03), pos.z + rnd(-0.03, 0.03), rnd(-0.25, 0.25), rnd(-0.1, 0.35), rnd(-0.25, 0.25),
			rnd(0.35, 0.7), rnd(0.022, 0.04), 0.008, -0.5, 2.2, gold ? 1.0 : 0.45, gold ? 0.88 : 1.0, gold ? 0.42 : 0.66, 0.8,
			X_STAR, rnd(-3, 3), rnd(0, 1.5), 1.0, NEVER, 0.012, rnd(3, 6), 0);
		if (Math.random() < 0.5) {
			xs(pos.x, pos.y, pos.z, 0, 0.05, 0, rnd(0.3, 0.5), 0.07, 0.16, 0, 2, 0.45, 1.0, 0.65, 0.9, X_SOFT, 0, 0, 0.2, NEVER, 0, 0, 0);
		}
	}

	// potionSplash(x, y, z, colorHex): y = the ground where the flask lands
	function potionSplash(x, y, z, colorHex = 0x6dffa8) {
		hexRGB(colorHex, 0x6dffa8);
		const r = cR;
		const g = cG;
		const b = cB;
		const gy = num(y, groundAt(x, z));
		noteY(gy);
		spawn(x, gy + 0.12, z, 0, 0, 0, 0.22, 0.14, 0.95, 0, 0, r, g, b, 0.7, FLASH, 0, 0, 1.0);
		spawn(x, gy + 0.2, z, 0, 0, 0, 0.4, 0.5, 1.8, 0, 0, r, g, b, 1.0, SOFT, 0, 0, 0.3);
		// glass
		for (let i = 0; i < 10; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(0.8, 3.0);
			const vx = Math.cos(a) * sp;
			const vz = Math.sin(a) * sp;
			const vy = rnd(1.0, 3.4);
			const hx = rnd(0.012, 0.03);
			const k = 0.2 + 0.012 / hx;
			solveLand(x, gy + 0.08, z, vx, vy, vz, -9.8, k, gy + 0.004, true, 4);
			const idx = MAX_CONFETTI + shardCursor;
			shardCursor = (shardCursor + 1) % MAX_SHARDS;
			flake(idx, x, gy + 0.08, z, vx, vy, vz, landT + FLAKE_HOP + rnd(1.2, 2.2), -9.8, k, landT, rnd(0.02, 0.06),
				rnd(0, 6.28), rnd(-0.8, 0.8), rnd(5, 16) * (Math.random() < 0.5 ? -1 : 1), rnd(0, 6.28),
				0.55 + r * 0.25, 0.8 + g * 0.15, 0.7 + b * 0.2, 0, hx, hx * rnd(0.6, 1.4), 0);
		}
		// liquid crown
		const nc = 13;
		for (let i = 0; i < nc; i++) {
			const a = ((i + rnd(-0.3, 0.3)) / nc) * Math.PI * 2;
			const ca = Math.cos(a);
			const sa = Math.sin(a);
			const out = rnd(0.7, 1.3);
			const up = rnd(1.8, 2.9);
			let tl = timeToY(gy + 0.02, up, -9.8, 0.5, gy, -1, 3);
			xs(x + ca * 0.07, gy + 0.02, z + sa * 0.07, ca * out, up, sa * out, tl, rnd(0.022, 0.034), 0.014, -9.8, 0.5,
				r + (1 - r) * 0.35, g, b + (1 - b) * 0.2, 0.55, X_SHEET, 0.4, 0, 0.85, NEVER, 0, 0, 0);
			tl = timeToY(gy + 0.02, up * 1.15, -9.8, 0.4, gy, -1, 3);
			const gold = i % 3 === 0;
			xs(x + ca * 0.07, gy + 0.02, z + sa * 0.07, ca * out * 1.25, up * 1.15, sa * out * 1.25, tl, rnd(0.014, 0.024), 0.01, -9.8, 0.4,
				gold ? 1.0 : r, gold ? 0.9 : g, gold ? 0.5 : b, 0.45, X_DROP, 0.03, 0, 0.95, NEVER, 0, 0, 0);
		}
		// low glowing mist that spreads to the splash radius and lingers
		gdTrans(x, gy + 0.06, z, 2.6, 1.25, G_MIST, r, g, b, 0.75, 1.1, 0, 0, 0, 0, 0.85, 0);
		for (let i = 0; i < 7; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(0.35, 1.0);
			xs(x + Math.cos(a) * 0.1, gy + rnd(0.05, 0.18), z + Math.sin(a) * 0.1, Math.cos(a) * sp, rnd(0.02, 0.2), Math.sin(a) * sp,
				rnd(1.0, 1.9), 0.12, rnd(0.34, 0.5), 0.04, 1.8, r, g, b, 0.75, X_SOFT, 0, 0, 0.2, NEVER, 0, 0, 0);
		}
		xring(x, gy + 0.07, z, 0.6, 0.08, 1.1, 0.1, r + (1 - r) * 0.3, g, b, 0.7, R_CLEAN, 0, 1, 0.85, 0, 0, 0);
		xring(x, gy + 0.065, z, 0.5, 0.04, 0.4, 0.5, r + (1 - r) * 0.5, g, b + (1 - b) * 0.3, 0.5, R_FROTH, rnd(0, 6.28), 1, 0.7, 0, 0, 0);
		for (let i = 0; i < 9; i++) {
			const a = Math.random() * Math.PI * 2;
			const rr = rnd(0.1, 0.9);
			xs(x + Math.cos(a) * rr, gy + rnd(0.05, 0.2), z + Math.sin(a) * rr, 0, rnd(0.3, 0.9), 0, rnd(0.6, 1.2), rnd(0.02, 0.04), 0.01,
				0.2, 1.4, 1.0, 0.92, 0.55, 0.8, X_STAR, rnd(-3, 3), rnd(0, 1.5), 1.0, NEVER, 0.03, rnd(2, 5), rnd(0.05, 0.6));
		}
	}

	// dissolve(x, y, z, height, colorHex, n): a body-shaped column of mist that drifts up and thins.
	// (x, y, z) = its foot.
	function dissolve(x, y, z, height = 1.8, colorHex = 0xbfd0ff, n = 40) {
		const cnt = clampN(n, 40, 4, 120);
		const hgt = clampF(height, 1.8, 0.2, 8);
		hexRGB(colorHex, 0xbfd0ff);
		const r = cR;
		const g = cG;
		const b = cB;
		const gy = num(y, groundAt(x, z));
		for (let i = 0; i < cnt; i++) {
			const hf = Math.random();
			const wide = 0.14 + 0.2 * Math.sin(Math.PI * Math.min(hf * 1.15, 1)); // broad at the shoulders
			const a = Math.random() * Math.PI * 2;
			const rr = Math.sqrt(Math.random()) * wide;
			xs(x + Math.cos(a) * rr, gy + hf * hgt, z + Math.sin(a) * rr, Math.cos(a) * rnd(0.02, 0.2), rnd(0.2, 0.7), Math.sin(a) * rnd(0.02, 0.2),
				rnd(1.2, 2.4), rnd(0.07, 0.12), rnd(0.24, 0.4), 0.22, 1.1, r, g, b, 0.7, X_SOFT, 0, 0, rnd(0.25, 0.45),
				NEVER, rnd(0.04, 0.12), rnd(1.2, 2.6), (1 - hf) * 0.55 + rnd(0, 0.12));
		}
		const ns = Math.min(12, 4 + (cnt >> 3));
		for (let i = 0; i < ns; i++) {
			const a = Math.random() * Math.PI * 2;
			const rr = rnd(0.05, 0.3);
			const sy = gy + rnd(0.3, 1) * hgt;
			const tl = timeToY(sy, 0.2, -1.6, 1.4, gy + 0.03, -1, 3);
			xs(x + Math.cos(a) * rr, sy, z + Math.sin(a) * rr, rnd(-0.2, 0.2), 0.2, rnd(-0.2, 0.2), Math.min(tl + 0.2, 2.6), rnd(0.018, 0.034), 0.008,
				-1.6, 1.4, r + (1 - r) * 0.5, g + (1 - g) * 0.5, b + (1 - b) * 0.5, 0.8, X_STAR, rnd(-3, 3), rnd(0, 1.5), 1.0,
				tl, 0.03, rnd(2, 5), rnd(0, 0.7));
		}
	}

	// ------------------------------------------------------------------ helicopter
	let washT = -1;
	let washRingT = -1;
	// rotorWash(x, groundY, z, strength): call every frame while the rotor is near the ground
	function rotorWash(x, gy, z, strength = 1) {
		const s = clampF(strength, 1, 0, 1.5);
		if (s <= 0.02 || now - washT < 0.03) return;
		washT = now;
		const y = num(gy, groundAt(x, z));
		noteY(y);
		const n = s > 0.6 ? 4 : 3;
		for (let i = 0; i < n; i++) {
			const a = Math.random() * Math.PI * 2;
			const ca = Math.cos(a);
			const sa = Math.sin(a);
			const rr = rnd(1.2, 3.6);
			const sp = rnd(5, 10) * (0.4 + 0.6 * s);
			const tone = Math.random();
			xs(x + ca * rr, y + rnd(0.05, 0.25), z + sa * rr, ca * sp, rnd(0.2, 1.5), sa * sp, rnd(0.6, 1.2), rnd(0.2, 0.34), rnd(0.8, 1.4),
				0.25, 2.4, 0.7 + tone * 0.1, 0.64 + tone * 0.1, 0.54 + tone * 0.1, 0.0, X_SOFT, 0, 0, rnd(0.14, 0.26) * s, NEVER, 0, 0, 0);
		}
		if (Math.random() < 0.35) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(4, 9);
			xs(x + Math.cos(a) * 2, y + 0.05, z + Math.sin(a) * 2, Math.cos(a) * sp, rnd(0.6, 2), Math.sin(a) * sp, rnd(0.5, 0.9), rnd(0.01, 0.018), 0.008,
				-6, 1.2, 0.5, 0.45, 0.36, 0.0, X_GRAIN, rnd(-16, 16), rnd(0, 6.28), 1.0, NEVER, 0, 0, 0);
		}
		if (now - washRingT > 0.28) {
			washRingT = now;
			gdTrans(x, y + 0.05, z, 0.9, 8, G_DUST, 0.78, 0.73, 0.63, 0.3 * s, 8, 7, 1.6, 1.0, 0, 0.1, 0);
		}
	}

	function crashSparks(pos, n = 30) {
		const cnt = clampN(n, 30, 1, 120);
		const x = pos.x;
		const y = pos.y;
		const z = pos.z;
		spawn(x, y, z, 0, 0, 0, 0.16, 0.3, 1.8, 0, 0, 1.0, 0.85, 0.5, 0.8, FLASH, 0, 0, 1.0);
		spawn(x, y, z, 0, 0, 0, 0.3, 1.0, 3.5, 0, 0, 1.0, 0.7, 0.35, 1.0, SOFT, 0, 0, 0.35);
		const f0 = floorAt(x, z, hintY !== null ? Math.min(hintY, y) : y - 1.5);
		for (let i = 0; i < cnt; i++) {
			const a = Math.random() * Math.PI * 2;
			const el = rnd(-0.3, 1.3);
			const sp = rnd(2.5, 10);
			const vx = Math.cos(a) * Math.cos(el) * sp;
			const vz = Math.sin(a) * Math.cos(el) * sp;
			const vy = Math.sin(el) * sp + 1;
			const tl = timeToY(y, vy, -9.8, 0.7, f0 + 0.02, -1, 2.2);
			const hot = Math.random() < 0.4;
			xs(x, y, z, vx, vy, vz, Math.max(0.25, Math.min(tl + rnd(0.1, 0.5), 2.4)), rnd(0.014, 0.03), 0.008, -9.8, 0.7,
				1.0, hot ? 0.93 : 0.72, hot ? 0.7 : 0.3, 0.85, X_EMBER, 0.07, 0, 1.0, tl, 0, 0, i * 0.003);
		}
		smoke(x, y, z, 0.8, 2.5);
	}

	// smoke(x, y, z, size, seconds): one dark puff column; call again (every ~0.5 s) to sustain it
	function smoke(x, y, z, size = 1, seconds = 6) {
		const s = clampF(size, 1, 0.1, 6);
		const secs = clampF(seconds, 6, 0.5, 20);
		for (let i = 0; i < 7; i++) {
			const tone = rnd(0.07, 0.2);
			xs(x + rnd(-0.15, 0.15) * s, y + rnd(0, 0.2) * s, z + rnd(-0.15, 0.15) * s, rnd(-0.25, 0.25), rnd(0.7, 1.4), rnd(-0.25, 0.25),
				secs * rnd(0.6, 1.0), rnd(0.2, 0.32) * s, rnd(1.2, 1.9) * s, 0.55, 0.75, tone, tone, tone * 1.05, 0.0, X_SOFT, 0, 0,
				rnd(0.4, 0.58), NEVER, 0.12 * s, rnd(0.6, 1.3), i * 0.11);
		}
		// a lick of glow at the root
		xs(x, y + 0.05 * s, z, 0, 0.5, 0, 0.5, 0.2 * s, 0.5 * s, 0.2, 2, 1.0, 0.45, 0.12, 0.9, X_SOFT, 0, 0, 0.25, NEVER, 0, 0, 0);
	}

	// ------------------------------------------------------------------ life
	// leaves(x, y, z, n, colorHex): a tumbling leaf burst (mixed greens when no colour is given)
	function leaves(x, y, z, n = 20, colorHex) {
		const cnt = clampN(n, 20, 1, 120);
		const own = typeof colorHex === "number" && colorHex === colorHex;
		if (own) hexRGB(colorHex, 0x3f7a2a);
		const r = cR;
		const g = cG;
		const b = cB;
		const f = floorAt(x, z, hintY !== null ? hintY : (y > 0.2 ? 0 : y - 2.5));
		for (let i = 0; i < cnt; i++) {
			const a = Math.random() * Math.PI * 2;
			const el = rnd(-0.2, 1.3);
			const sp = rnd(0.8, 3.6);
			const li = ((Math.random() * 6) | 0) * 3;
			const sh = rnd(0.8, 1.15);
			leafFlake(x + rnd(-0.25, 0.25), y + rnd(-0.2, 0.3), z + rnd(-0.25, 0.25), Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + 0.5,
				Math.sin(a) * Math.cos(el) * sp, f, own ? r * sh : LEAF_TONES[li], own ? g * sh : LEAF_TONES[li + 1], own ? b * sh : LEAF_TONES[li + 2], 1);
		}
	}

	function footDust(x, y, z, strength = 0.5, colorHex = 0x9c8c72) {
		const s = clampF(strength, 0.5, 0, 2);
		noteY(y);
		if (s <= 0.01) return;
		hexRGB(colorHex, 0x9c8c72);
		const k = 0.5 + 0.5 * s;
		const nm = 2 + Math.round(3 * Math.min(s, 1.5));
		for (let i = 0; i < nm; i++) {
			const a = Math.random() * Math.PI * 2;
			const sp = rnd(0.25, 0.8) * k;
			const tone = rnd(-0.05, 0.08);
			xs(x + Math.cos(a) * 0.04, y + 0.03, z + Math.sin(a) * 0.04, Math.cos(a) * sp, rnd(0.1, 0.45) * k, Math.sin(a) * sp,
				rnd(0.45, 0.9), rnd(0.04, 0.06) * k, rnd(0.14, 0.24) * k, 0.1, 3.2, cR + tone, cG + tone, cB + tone, 0.0,
				X_SOFT, 0, 0, rnd(0.2, 0.34), NEVER, 0, 0, 0);
		}
		if (s > 0.8) {
			for (let i = 0; i < 3; i++) {
				const a = Math.random() * Math.PI * 2;
				const sp = rnd(0.4, 1.2);
				const vx = Math.cos(a) * sp;
				const vz = Math.sin(a) * sp;
				const vy = rnd(0.7, 1.7);
				solveLand(x, y + 0.02, z, vx, vy, vz, -9.8, 0.9, y + 0.006, true, 2);
				xs(x, y + 0.02, z, vx, vy, vz, landT + rnd(0.3, 0.6), rnd(0.006, 0.011), 0.005, -9.8, 0.9, cR * 0.8, cG * 0.8, cB * 0.8, 0.0,
					X_GRAIN, rnd(-16, 16), rnd(0, 6.28), 0.9, landT, 0, 0, 0);
			}
		}
	}

	// ------------------------------------------------------------------ boss / items
	const globT = new Float64Array(MAX_GLOBS).fill(-1);
	const globX = new Float32Array(MAX_GLOBS);
	const globY = new Float32Array(MAX_GLOBS);
	const globZ = new Float32Array(MAX_GLOBS);
	const globGen = new Int32Array(MAX_GLOBS);
	let globCursor = 0;
	let globLive = 0;
	// venomGlob(from, to, seconds) -> id: an arcing green glob that lands with a stingBurst
	function venomGlob(from, to, seconds = 0.8) {
		const T = clampF(seconds, 0.8, 0.08, 6);
		const k = 0.05;
		const gacc = -9.8;
		const vt = gacc / k;
		const e = (1 - Math.exp(-k * T)) / k;
		const vx = (to.x - from.x) / e;
		const vz = (to.z - from.z) / e;
		const vy = vt + (to.y - from.y - vt * T) / e;
		const s = globCursor;
		globCursor = (globCursor + 1) % MAX_GLOBS;
		if (globT[s] < 0) globLive++;
		globGen[s]++;
		globT[s] = now + T;
		globX[s] = to.x; globY[s] = to.y; globZ[s] = to.z;
		xs(from.x, from.y, from.z, vx, vy, vz, T, 0.1, 0.085, gacc, k, 0.42, 0.95, 0.2, 0.15, X_DROP, 0.02, 0, 1.0, NEVER, 0, 0, 0);
		xs(from.x, from.y, from.z, vx, vy, vz, T, 0.26, 0.2, gacc, k, 0.4, 1.0, 0.25, 1.0, X_SOFT, 0, 0, 0.4, NEVER, 0, 0, 0);
		for (let i = 1; i <= 6; i++) {
			const d = i * 0.028;
			if (d >= T) break;
			xs(from.x, from.y, from.z, vx, vy, vz, T - d * 0.5, 0.06 - i * 0.006, 0.02, gacc, k, 0.36, 0.86, 0.18, 0.2, X_DROP, 0.03, 0, 0.85,
				NEVER, 0.02, 9, d);
		}
		spawn(from.x, from.y, from.z, 0, 0, 0, 0.16, 0.08, 0.4, 0, 0, 0.6, 1.0, 0.35, 0.7, FLASH, 0, 0, 0.9);
		return s + globGen[s] * MAX_GLOBS;
	}

	function crownSpark(pos) {
		const x = pos.x;
		const y = pos.y;
		const z = pos.z;
		xs(x, y, z, 0, 0, 0, 0.32, 0.08, 0.42, 0, 1, 1.0, 0.9, 0.5, 0.9, X_STAR, 0.5, rnd(0, 1.5), 1.0, NEVER, 0, 0, 0);
		for (let i = 0; i < 10; i++) {
			const a = Math.random() * Math.PI * 2;
			const el = rnd(-0.1, 1.3);
			const sp = rnd(0.8, 3.0);
			const pale = Math.random() < 0.35;
			xs(x, y, z, Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + 0.5, Math.sin(a) * Math.cos(el) * sp, rnd(0.4, 0.85), rnd(0.02, 0.042), 0.01,
				-4, 2.0, 1.0, pale ? 0.97 : 0.8, pale ? 0.8 : 0.28, 0.75, X_STAR, rnd(-4, 4), rnd(0, 1.5), 1.0, NEVER, 0, 0, i * 0.008);
		}
		xring(x, y, z, 0.4, 0.04, 0.5, 0.12, 1.0, 0.86, 0.36, 0.7, R_HALO, rnd(0, 6.28), 1, 0.8, 1, 0, 0);
	}

	function paperGlint(pos) {
		const x = pos.x;
		const y = pos.y;
		const z = pos.z;
		xs(x, y, z, 0, 0.04, 0, 0.9, 0.05, 0.2, 0, 1, 1.0, 0.97, 0.86, 0.8, X_STAR, 0.7, rnd(0, 1.5), 0.9, NEVER, 0, 0, 0);
		for (let i = 0; i < 3; i++) {
			xs(x + rnd(-0.12, 0.12), y + rnd(-0.05, 0.1), z + rnd(-0.12, 0.12), 0, rnd(0.05, 0.2), 0, rnd(0.6, 1.0), 0.02, 0.012,
				0.05, 1.5, 1.0, 0.95, 0.8, 0.8, X_STAR, rnd(-2, 2), rnd(0, 1.5), 0.9, NEVER, 0.02, rnd(2, 4), 0.15 + i * 0.18);
		}
	}

	// ------------------------------------------------------------------ housekeeping for the level 6-11 pools
	function clearL2() {
		fxEpoch++;
		hintY = null;
		for (let i = 0; i < MAX_LINES; i++) lnData[i * LN_STRIDE + 7] = 0;
		lnDirty = true;
		lnAliveUntil = -1;
		tgEnd.fill(-1);
		for (let i = 0; i < MAX_GROUND; i++) gdData[i * GD_STRIDE + 4] = 0;
		gdDirty = true;
		gdAliveUntil = -1;
		gdLive = 0;
		dzEnd.fill(-1);
		srT0.fill(-1);
		srLive = 0;
		for (let i = 0; i < MAX_CARDS; i++) cdData[i * CD_STRIDE + 11] = 0;
		cdDirty = true;
		cdLive = 0;
		bcOn.fill(0);
		gtState.fill(0);
		gtBursting = 0;
		cfOn.fill(0);
		tcOn.fill(0);
		fireLive = 0;
		scr.phase = 0;
		screamMesh.visible = false;
		shock.radius = 0;
		shock.strength = 0;
		shock.active = false;
		shockWrite();
		for (let i = 0; i < MAX_SWIRLS; i++) swData[i * SW_STRIDE + 4] = 0;
		swDirty = true;
		swAliveUntil = -1;
		for (let i = 0; i < MAX_BIRDS; i++) bdData[i * BD_STRIDE + 7] = 0;
		bdDirty = true;
		bdAliveUntil = -1;
		dreamTarget = dreamFade = flyTarget = flyFade = windTarget = windFade = 0;
		uDream.value.x = 0;
		uFly.value.x = 0;
		uWind.value.z = 0;
		air.visible = false;
		globT.fill(-1);
		globLive = 0;
	}

	function approach(v, target, step) {
		return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
	}

	function updateL2(dt) {
		screamUpdate(dt);

		// shock rings shed dust along their front; they retire when they reach their radius
		if (srLive > 0) {
			for (let s = 0; s < MAX_SHOCKRINGS; s++) {
				if (srT0[s] < 0) continue;
				const R = srSpeed[s] * (now - srT0[s]);
				if (R >= srMax[s]) {
					srT0[s] = -1;
					srLive--;
					continue;
				}
				srAcc[s] += dt;
				if (srAcc[s] > 0.045) {
					srAcc[s] = 0;
					const n = R > 6 ? 4 : 3;
					for (let i = 0; i < n; i++) {
						const a = Math.random() * Math.PI * 2;
						const ca = Math.cos(a);
						const sa = Math.sin(a);
						const px = srX[s] + ca * R;
						const pz = srZ[s] + sa * R;
						const tone = Math.random();
						xs(px, floorAt(px, pz, srY[s]) + 0.08, pz, ca * srSpeed[s] * 0.35, rnd(0.5, 1.6), sa * srSpeed[s] * 0.35, rnd(0.5, 0.95),
							rnd(0.12, 0.2), rnd(0.4, 0.7), 0.15, 2.8, 0.74 + tone * 0.1, 0.68 + tone * 0.1, 0.58 + tone * 0.1, 0.0,
							X_SOFT, 0, 0, rnd(0.25, 0.4), NEVER, 0, 0, 0);
					}
				}
			}
		}

		// venom globs landing
		if (globLive > 0) {
			for (let s = 0; s < MAX_GLOBS; s++) {
				if (globT[s] < 0 || now < globT[s]) continue;
				globT[s] = -1;
				globLive--;
				tmpPos.x = globX[s]; tmpPos.y = globY[s]; tmpPos.z = globZ[s];
				stingBurst(tmpPos);
			}
		}

		// guide rings that finished bursting
		if (gtBursting > 0) {
			for (let s = 0; s < MAX_GATES; s++) {
				if (gtState[s] === 2 && now >= gtEnd[s]) {
					gtState[s] = 0;
					gtBursting--;
					cardOff(CD_GATE0 + s);
				}
			}
		}

		// embers off the fires
		if (fireLive > 0) {
			for (let s = 0; s < MAX_CAMPFIRES; s++) {
				if (!cfOn[s] || cfLevel[s] < 0.08) continue;
				cfAcc[s] += dt * (2 + 7 * cfLevel[s]);
				while (cfAcc[s] >= 1) {
					cfAcc[s] -= 1;
					const sz = cfSize[s];
					xs(cfX[s] + rnd(-0.2, 0.2) * sz, cfY[s] + rnd(0.2, 0.7) * sz, cfZ[s] + rnd(-0.2, 0.2) * sz, rnd(-0.25, 0.25), rnd(0.8, 1.9), rnd(-0.25, 0.25),
						rnd(0.9, 1.9), rnd(0.012, 0.022), 0.006, 0.7, 1.1, 1.0, rnd(0.5, 0.75), 0.15, 0.9, X_EMBER, 0.04, 0, 1.0,
						NEVER, rnd(0.04, 0.12), rnd(2, 4.5), 0);
				}
			}
			for (let s = 0; s < MAX_TORCHES; s++) {
				if (!tcOn[s] || tcLevel[s] < 0.08) continue;
				tcAcc[s] += dt * 1.6 * tcLevel[s];
				while (tcAcc[s] >= 1) {
					tcAcc[s] -= 1;
					xs(tcX[s] + rnd(-0.04, 0.04), tcY[s] + rnd(0.2, 0.4), tcZ[s] + rnd(-0.04, 0.04), rnd(-0.15, 0.15), rnd(0.5, 1.1), rnd(-0.15, 0.15),
						rnd(0.6, 1.2), rnd(0.008, 0.014), 0.005, 0.5, 1.2, 1.0, rnd(0.5, 0.7), 0.15, 0.9, X_EMBER, 0.04, 0, 1.0,
						NEVER, rnd(0.03, 0.08), rnd(2, 4.5), 0);
				}
			}
		}

		// air: fade in / out
		if (dreamFade !== dreamTarget) {
			dreamFade = approach(dreamFade, dreamTarget, dt * 0.7);
			uDream.value.x = dreamFade * dreamFade * (3 - 2 * dreamFade);
		}
		if (flyFade !== flyTarget) {
			flyFade = approach(flyFade, flyTarget, dt * 0.6);
			uFly.value.x = flyFade;
		}
		const wt = windTarget * windStrength;
		if (windFade !== wt) {
			windFade = approach(windFade, wt, dt * 2.5);
			uWind.value.z = windFade;
		}
		const airOn = dreamFade > 0 || dreamTarget > 0 || flyFade > 0 || flyTarget > 0 || windFade > 0 || windTarget > 0;
		if (air.visible !== airOn) air.visible = airOn;

		// uploads + hiding idle pools
		if (lnDirty) { lnBuffer.needsUpdate = true; lnDirty = false; }
		if (lines.visible && now > lnAliveUntil) lines.visible = false;
		if (gdDirty) { gdBuffer.needsUpdate = true; gdDirty = false; }
		const gdOn = gdLive > 0 || now <= gdAliveUntil;
		if (ground.visible !== gdOn) ground.visible = gdOn;
		if (cdDirty) { cdBuffer.needsUpdate = true; cdDirty = false; }
		const cdOn = cdLive > 0;
		if (cards.visible !== cdOn) cards.visible = cdOn;
		if (swDirty) { swBuffer.needsUpdate = true; swDirty = false; }
		if (swirl.visible && now > swAliveUntil) swirl.visible = false;
		if (bdDirty) { bdBuffer.needsUpdate = true; bdDirty = false; }
		if (birdMesh.visible && now > bdAliveUntil) birdMesh.visible = false;
	}

	function clear(removeWater = false) {
		clearExt();
		clearL2();
		for (let i = 0; i < MAX_PARTICLES; i++) pData[i * P_STRIDE + 7] = 0;
		pDirty = true;
		pAliveUntil = -1;
		for (let i = 0; i < MAX_RINGS; i++) rData[i * R_STRIDE + 4] = 0;
		rDirty = true;
		rAliveUntil = -1;
		for (let i = 0; i < bolts.length; i++) {
			const b = bolts[i];
			b.active = false;
			b.cb = null;
			b.mesh.visible = false;
			b.u.uFade.value = 0;
		}
		lastBolt = null;
		zapGlow = 0;
		zapHold = false;
		uZapP.value.set(0, 0);
		for (let i = 0; i < waters.length; i++) {
			const rp = waters[i]._ripples;
			for (let j = 0; j < rp.length; j++) rp[j].set(0, 0, -100, 0);
		}
		if (removeWater) {
			while (waters.length) waters[waters.length - 1].dispose();
		}
	}

	// ------------------------------------------------------------------ per-frame
	function update(dt) {
		now += dt;
		uTime.value = now;

		// bolts
		zapHold = false;
		for (let i = 0; i < bolts.length; i++) {
			const b = bolts[i];
			if (!b.active) continue;
			b.t += dt;
			if (!b.arrived) {
				const p = b.t / PULSE_TRAVEL;
				const pc = p > 1 ? 1 : p;
				b.u.uHead.value = pc;
				pathPoint(b, pc, head);
				if (b === lastBolt) {
					uZapP.value.x = pc;
					zapHold = true;
				}
				// crackle shed by the head
				b.emitAcc += dt;
				while (b.emitAcc > 0.014) {
					b.emitAcc -= 0.014;
					const a = Math.random() * Math.PI * 2;
					const sp = rnd(0.4, 1.6);
					spawn(head.x, head.y + 0.02, head.z, Math.cos(a) * sp, rnd(0.3, 1.8), Math.sin(a) * sp,
						rnd(0.14, 0.3), rnd(0.02, 0.04), 0.008, -5, 3.0,
						0.5, 0.82, 1.0, 0.5, SPARK, 0.14, 0, 1.0);
				}
				// field rings + wake on the surface
				b.ringAcc += dt;
				if (b.ringAcc > 0.065) {
					b.ringAcc = 0;
					spawnRing(head.x, b.surfY + 0.01, head.z, 0.42, 0.06, 0.6, 0.15, 0.3, 0.65, 1.0, 0.4);
					if (b.inWater) rippleAt(head.x, head.z, 0.7);
				}
				if (p >= 1) {
					b.arrived = true;
					b.t = 0;
					b.u.uHead.value = 1;
					b.u.uFlash.value = 1;
					arriveBurst(b);
					const cb = b.cb;
					b.cb = null;
					if (cb) cb();
				}
			} else {
				const f = 1 - b.t / PULSE_LINGER;
				if (f <= 0) {
					b.active = false;
					b.mesh.visible = false;
					b.u.uFade.value = 0;
					if (b === lastBolt) lastBolt = null;
				} else {
					b.u.uFade.value = f * f;
				}
			}
		}

		// water glow follows the pulse, then drains away
		if (zapGlow > 0) {
			if (!zapHold) {
				zapGlow -= dt * 2.6;
				if (zapGlow < 0) zapGlow = 0;
			}
			uZapP.value.y = zapGlow * zapGlow * (zapHold ? 1 : 1.25);
		}

		// upload spawned instances (one buffer each), hide pools when nothing is alive
		if (pDirty) {
			pBuffer.needsUpdate = true;
			pDirty = false;
		}
		if (particles.visible && now > pAliveUntil) particles.visible = false;
		if (rDirty) {
			rBuffer.needsUpdate = true;
			rDirty = false;
		}
		if (rings.visible && now > rAliveUntil) rings.visible = false;

		updateExt(dt);
		updateL2(dt);
	}

	function setSun(x, y, z) {
		uSun.value.set(x, y, z).normalize();
	}

	return {
		group,
		update,
		createWater,
		rippleAt,
		electroPulse,
		stingBurst,
		hitBurst,
		cushionPuff,
		ring,
		clear,
		// extras
		setSun,
		waters,
		PULSE_TRAVEL,
		// extensions (LEVELS.md B9)
		splash,
		droplets,
		bubbles,
		bubbleRing,
		wake,
		coinSparkle,
		hearts,
		sparkle,
		crumbs,
		sandPuff,
		dust,
		confetti,
		spotDust,
		glassShards,
		embers,
		heat,
		slapRing,
		zzz,
		sadMotes,
		senseRing,
		// extension extras
		setGround,
		setGlint,
		// extensions (LEVELS2.md B4)
		muzzleFlash,
		tracer,
		bulletImpact,
		telegraph,
		telegraphMove,
		telegraphCancel,
		dangerZone,
		dangerCancel,
		slam,
		shockRing,
		shockRadius,
		screamWave,
		shock,
		potionTrail,
		potionSplash,
		transformSwirl,
		dissolve,
		beacon,
		rotorWash,
		crashSparks,
		smoke,
		windStreaks,
		ringGate,
		campfire,
		torch,
		fireflies,
		lightShafts,
		dreamMotes,
		mistCards,
		birds,
		leaves,
		footDust,
		venomGlob,
		crownSpark,
		paperGlint,
	};
}
