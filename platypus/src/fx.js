// fx.js — water, electro pulse, particles, rings.
//
// Everything here works in WORLD coordinates: keep `fx.group` at the origin with identity transform.
// Budget: 1 draw call per water, 1 for all particles, 1 for all rings, 1 per live electro bolt (max 2),
// one PointLight (intensity 0 when idle). All motion is closed-form in vertex shaders: the CPU only
// writes a few floats when an effect is spawned, and nothing is allocated after construction
// (except in createWater, which is a setup-time call).

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

	function clear(removeWater = false) {
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
	};
}
