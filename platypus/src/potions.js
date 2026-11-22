// potions.js - potions, brewing, the transformation and the LIVING POTION (LEVELS2.md B6).
//
//   potions            flask pickups (pool of 8) + thrown flasks (pool of 6): ONE instanced draw call,
//                      plus the flask held in the paw while aiming (1 call while shown)
//   potions.ingredients glowcap / moonpetal / dewdrop (pool of 9): ONE instanced draw call
//   potions.cauldron   pot 1 + liquid and rune stones 1 (+ the spoon while stirring 1)
//   potions.transform  the human -> platypus transformation: a body of light (pool of 6, ONE instanced
//                      draw call) that lifts, shrinks into a ball and unfurls as a platypus, timed with
//                      fx.transformSwirl and audio.transform
//   potions.living     the LIVING POTION: heart-shaped crystal bottle 1, parchment label 1, halo 1
//
// Everything is built once; update() allocates nothing. All meshes live in potions.group (the level
// re-parents it into its world group); positions are world coordinates, so that group must sit at the
// origin with an identity transform (as every world group does).

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a, b, t) => a + (b - a) * t;
const isNum = (v) => typeof v === "number" && v === v;

const MAX_PICKUPS = 8;
const MAX_FLYING = 6;
const MAX_FLASKS = MAX_PICKUPS + MAX_FLYING;
const MAX_INGREDIENTS = 9;
const MAX_TRANSFORMS = 6;

// the timeline of the transformation (seconds; binding, LEVELS2.md B6)
const T_LIFT = 0.5;      // glow from within, lift off the ground
const T_SWAP = 1.4;      // body.transform(): the human shape is gone, a ball of light remains
const T_BLOOM = 1.9;     // the platypus unfurls from the light: onTransform
const T_END = 2.6;       // the light has sunk into its fur
const T_SITUP = 1.6;     // the newborn's sit-up, then it joins: onJoined
const LIFT = 0.35;

const KINDS = ["glowcap", "moonpetal", "dewdrop"];
const KIND_HEX = { glowcap: 0x4aa8ff, moonpetal: 0xd9c8ff, dewdrop: 0x66f0e0 };
const KIND_RGB = [[0.29, 0.66, 1.0], [0.85, 0.78, 1.0], [0.4, 0.94, 0.88]];
const KIND_LIFT = [0, 0, 0.45]; // the dewdrop floats

// ---------------------------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------------------------

// Fog for hand-written colours: the scene's fog colour is linear, ours are display-referred.
const FOG_FRAG = /* glsl */ `
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
	#else
		float fogF = smoothstep(fogNear, fogFar, vFogDepth);
	#endif
	col = mix(col, pow(max(fogColor, vec3(0.0)), vec3(0.4545)), fogF);
#endif
`;

const SOLID_VERT = /* glsl */ `
#include <fog_pars_vertex>
uniform float uTime;
attribute float aPart;
attribute float aGlow;
attribute float aKind;
attribute vec3 color;
#ifdef USE_SEL
attribute float aSel;
#endif
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
varying vec3 vCol;
varying float vPart;
varying float vGlow;
varying float vKind;
void main() {
	vec3 p = position;
	vPart = aPart;
	vGlow = aGlow;
	vKind = aKind;
	vCol = color;
	vL = position;
#ifdef USE_SEL
	// several models share this geometry: an instance keeps only the vertices of its own kind
	if (abs(aKind - aSel) > 0.5) p = vec3(0.0);
#endif
	mat4 m = modelMatrix;
#ifdef USE_INSTANCING
	m = modelMatrix * instanceMatrix;
#endif
	vec4 wp = m * vec4(p, 1.0);
	vN = normalize(mat3(m) * normal);
	vW = wp.xyz;
	vec4 mvPosition = viewMatrix * wp;
	gl_Position = projectionMatrix * mvPosition;
	#include <fog_vertex>
}
`;

// The green-gold flask: glass with glowing liquid, a cork, a gold band.
const FLASK_FRAG = /* glsl */ `
#include <fog_pars_fragment>
uniform float uTime;
uniform vec3 uSun;
uniform float uGlow;
uniform float uLevel;
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
varying vec3 vCol;
varying float vPart;
varying float vGlow;
varying float vKind;
void main() {
	vec3 N = normalize(vN);
	vec3 V = normalize(cameraPosition - vW);
	float ndv = max(dot(N, V), 0.0);
	float ndl = max(dot(N, uSun), 0.0);
	float fres = pow(1.0 - ndv, 2.6);
	float spec = pow(max(dot(N, normalize(uSun + V)), 0.0), 64.0);
	float spec2 = pow(max(dot(N, normalize(vec3(-0.45, 0.7, 0.35) + V)), 0.0), 22.0) * 0.3;
	vec3 col;
	if (vPart < 0.5) {
		float an = atan(vL.z, vL.x);
		float lvl = uLevel + 0.006 * sin(an * 2.0 + uTime * 3.1) + 0.003 * sin(an * 5.0 - uTime * 4.3);
		float inLiq = smoothstep(lvl + 0.004, lvl - 0.004, vL.y);
		float sw = 0.5 + 0.5 * sin(vL.y * 60.0 + an * 3.0 - uTime * 2.2);
		float sw2 = 0.5 + 0.5 * sin(vL.y * 23.0 - an * 2.0 + uTime * 1.3);
		vec3 liq = mix(vec3(0.16, 0.95, 0.46), vec3(1.0, 0.86, 0.32), sw * 0.55 + sw2 * 0.25);
		liq *= 0.62 + 0.7 * ndv;                      // lit from within: brightest face-on
		liq += vec3(0.85, 1.0, 0.75) * pow(ndv, 5.0) * 0.3;
		liq *= (0.86 + 0.14 * sin(uTime * 3.0)) * uGlow;
		vec3 glass = vec3(0.5, 0.74, 0.66) * (0.3 + 0.3 * ndv) + vec3(0.1, 0.3, 0.18) * uGlow * 0.4;
		col = mix(glass, liq, inLiq);
		col += vec3(1.0, 1.0, 0.8) * smoothstep(0.007, 0.0, abs(vL.y - lvl)) * 0.45;
		col += vec3(0.8, 1.0, 0.9) * fres * 0.75 + vec3(1.0) * (spec * 1.3 + spec2);
	} else if (vPart < 1.5) {
		float grain = 0.86 + 0.14 * sin(vL.y * 420.0 + vL.x * 90.0) * sin(vL.z * 130.0);
		col = vCol * grain * (0.48 + 0.6 * ndl) + vec3(0.1, 0.3, 0.16) * uGlow * 0.25;
	} else {
		col = vCol * (0.5 + 0.6 * ndl) + vec3(1.0, 0.92, 0.7) * (spec * 0.9 + fres * 0.35);
	}
	${FOG_FRAG}
	gl_FragColor = vec4(col, 1.0);
}
`;

// Ingredients: lit colour + a breathing glow; kind 2 (the dewdrop) is a bead of water.
const ITEM_FRAG = /* glsl */ `
#include <fog_pars_fragment>
uniform float uTime;
uniform vec3 uSun;
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
varying vec3 vCol;
varying float vPart;
varying float vGlow;
varying float vKind;
void main() {
	vec3 N = normalize(vN);
	vec3 V = normalize(cameraPosition - vW);
	float ndv = max(dot(N, V), 0.0);
	float ndl = max(dot(N, uSun), 0.0);
	float fres = pow(1.0 - ndv, 2.4);
	float spec = pow(max(dot(N, normalize(uSun + V)), 0.0), 48.0);
	float breathe = 0.82 + 0.18 * sin(uTime * 2.3 + vW.x * 1.7 + vW.z * 1.3);
	vec3 col;
	if (vKind > 1.5 && vPart < 0.5) {
		// the bead: clear and bright, sky at the rim, a little lens of light low inside
		vec3 deep = vec3(0.2, 0.62, 0.72);
		col = mix(deep * (0.55 + 0.45 * ndv), vec3(0.86, 1.0, 1.0), fres * 0.9);
		col += vec3(0.5, 1.0, 0.95) * smoothstep(0.3, -0.9, N.y) * 0.35 * breathe;
		col += vec3(1.0) * (spec * 1.4 + pow(max(dot(N, normalize(vec3(-0.4, 0.75, 0.3) + V)), 0.0), 20.0) * 0.35);
	} else {
		col = vCol * (0.42 + 0.62 * ndl);
		// spots on the mushroom cap
		if (vKind < 0.5 && vPart > 0.5) {
			float an = atan(vL.z, vL.x);
			float sp = smoothstep(0.55, 0.9, sin(an * 5.0 + vL.y * 60.0) * sin(vL.y * 95.0 + an * 2.0));
			col = mix(col, vec3(0.86, 0.96, 1.0), sp * 0.6);
		}
		col += vCol * vGlow * breathe * (0.75 + 0.5 * ndv) + vec3(0.8, 0.95, 1.0) * fres * vGlow * 0.6;
		col += vec3(1.0) * spec * 0.25 * vGlow;
	}
	${FOG_FRAG}
	gl_FragColor = vec4(col, 1.0);
}
`;

// The cauldron's liquid (part 0) and its three rune stones (parts 1..3, hovering, facing the camera,
// ordered left to right on screen).
const BREW_VERT = /* glsl */ `
uniform float uTime;
uniform float uLevelY;
uniform float uShow;
attribute float aPart;
varying vec2 vUv;
varying float vPart;
varying float vPop;
void main() {
	vPart = aPart;
	vUv = position.xz;
	vPop = 1.0;
	if (aPart < 0.5) {
		vec3 p = vec3(position.x * 0.47, uLevelY + 0.006 * sin(position.x * 9.0 + uTime * 2.0) * sin(position.z * 8.0 - uTime * 1.6), position.z * 0.47);
		gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
	} else {
		float idx = aPart - 1.0;
		float pop = smoothstep(idx, idx + 0.6, uShow);
		vPop = pop;
		vec4 mv = viewMatrix * modelMatrix * vec4(0.0, 1.32, 0.0, 1.0);
		float bob = 0.025 * sin(uTime * 1.7 + idx * 2.1);
		mv.xy += vec2((idx - 1.0) * 0.44, 0.07 - abs(idx - 1.0) * 0.07 + bob) + position.xz * 0.17 * (0.4 + 0.6 * pop) * (1.0 + 0.25 * sin(min(pop * 3.14159, 3.14159)));
		gl_Position = pop <= 0.001 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
	}
}
`;

const BREW_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uCol;
uniform vec3 uCol2;
uniform float uGlow;
uniform float uSpin;
uniform float uBeat;
uniform vec3 uKinds;
uniform vec3 uState;
uniform vec3 uRune0;
uniform vec3 uRune1;
uniform vec3 uRune2;
varying vec2 vUv;
varying float vPart;
varying float vPop;
float icon(vec2 p, float kind) {
	if (kind < 0.5) {            // glowcap: a cap on a stem
		float cap = (1.0 - smoothstep(0.9, 1.0, length(vec2(p.x / 0.64, (p.y - 0.02) / 0.52)))) * step(0.02, p.y);
		float stem = (1.0 - smoothstep(0.13, 0.17, abs(p.x) - 0.03 * (0.1 - p.y))) * step(-0.6, p.y) * step(p.y, 0.06);
		return max(cap, stem);
	} else if (kind < 1.5) {     // moonpetal: five petals and a heart
		float r = length(p);
		float an = atan(p.y, p.x);
		float pet = 1.0 - smoothstep(-0.03, 0.03, r - (0.28 + 0.36 * abs(cos(an * 2.5 + 0.6))));
		float eye = smoothstep(0.17, 0.13, r);
		return max(pet * (1.0 - eye * 0.6), 0.0);
	}
	// dewdrop
	vec2 q = vec2(p.x, p.y + 0.18);
	float ball = 1.0 - smoothstep(0.36, 0.4, length(q));
	float cone = (1.0 - smoothstep(-0.02, 0.02, abs(p.x) - 0.38 * (1.0 - (q.y) / 0.85))) * step(0.0, q.y) * step(q.y, 0.85);
	return max(ball, cone);
}
void main() {
	vec3 col;
	float a;
	float solid;
	if (vPart < 0.5) {
		float r = length(vUv);
		float an = atan(vUv.y, vUv.x) + uSpin;
		float swirl = 0.5 + 0.5 * sin(an * 3.0 + r * 9.0 - uTime * 1.1);
		float swirl2 = 0.5 + 0.5 * sin(an * 5.0 - r * 14.0 + uTime * 0.7);
		col = mix(uCol * 0.5, uCol2, swirl * 0.55 + swirl2 * 0.2);
		col += uCol2 * smoothstep(0.5, 0.0, r) * 0.35;                       // the bright eye of the whirl
		float glint = pow(max(sin(vUv.x * 41.0 + uTime * 3.0) * sin(vUv.y * 37.0 - uTime * 2.3), 0.0), 9.0);
		col += vec3(1.0) * glint * 0.45;
		// bubbles that swell and wink out
		vec2 g = vUv * 4.0 + vec2(sin(uTime * 0.3), cos(uTime * 0.27)) * 0.4;
		vec2 gi = floor(g);
		float h = fract(sin(dot(gi, vec2(127.1, 311.7))) * 43758.5453);
		float ph = fract(uTime * (0.35 + h * 0.5) + h * 7.0);
		float bub = smoothstep(0.05, 0.0, abs(length(fract(g) - 0.5 - (vec2(h, fract(h * 13.7)) - 0.5) * 0.5) - 0.16 * ph)) * (1.0 - ph) * step(0.45, h);
		col += vec3(1.0) * bub * 0.5;
		if (uBeat >= 0.0) {
			// the stirring cue: a ring closes on the centre and lands exactly on the beat
			float rr = mix(0.92, 0.12, uBeat);
			float ring = smoothstep(0.07, 0.0, abs(r - rr));
			float hit = smoothstep(0.82, 1.0, uBeat) + smoothstep(0.12, 0.0, uBeat);
			col += vec3(1.0, 0.97, 0.8) * (ring * (0.5 + 0.5 * uBeat) + hit * smoothstep(0.3, 0.0, r) * 0.6);
			col += vec3(1.0, 0.95, 0.7) * smoothstep(0.05, 0.0, abs(r - 0.12)) * 0.35;
		}
		col *= uGlow * (1.0 - 0.45 * smoothstep(0.82, 1.0, r));
		a = 1.0;
		solid = 1.0;
	} else {
		float idx = vPart - 1.0;
		float kind = idx < 0.5 ? uKinds.x : (idx < 1.5 ? uKinds.y : uKinds.z);
		float state = idx < 0.5 ? uState.x : (idx < 1.5 ? uState.y : uState.z);
		vec3 rc = idx < 0.5 ? uRune0 : (idx < 1.5 ? uRune1 : uRune2);
		float r = length(vUv);
		float disc = smoothstep(1.0, 0.86, r);
		float rim = smoothstep(0.08, 0.0, abs(r - 0.88));
		float ic = icon(vUv * 1.25, kind);
		float halo = max(1.0 - r, 0.0);
		// state 0 = waiting (dim), 1 = this one next (pulsing), 2 = added (gold-white)
		float next = step(0.5, state) * step(state, 1.5);
		float done = step(1.5, state);
		float bright = 0.34 + next * (0.5 + 0.3 * sin(uTime * 6.0)) + done * 0.75;
		vec3 ink = mix(rc, vec3(1.0, 0.95, 0.72), done * 0.6);
		col = vec3(0.07, 0.08, 0.13) * disc * 0.9 + ink * (ic * bright * 1.25 + rim * bright * 0.8) + ink * halo * halo * 0.22 * bright;
		a = clamp(disc * 0.78 + rim, 0.0, 1.0) * vPop;
		col *= vPop;
		solid = 0.85;
		if (a < 0.01) discard;
		gl_FragColor = vec4(col, a * solid);
		return;
	}
	gl_FragColor = vec4(col * a, a * solid);
}
`;

// The body of light. Each vertex knows where it sits on a lying human, on a ball and on a platypus.
const LIGHT_VERT = /* glsl */ `
uniform float uTime;
attribute vec3 aHuman;
attribute vec3 aPlat;
attribute vec3 aHumanN;
attribute vec3 aPlatN;
attribute vec4 aI0; // x, y (ground), z, yaw
attribute vec4 aI1; // human -> ball, ball -> platypus, alpha, brightness
attribute vec4 aI2; // lift, ball radius, seed, which way the human lies (+1 head toward -z, -1 turned round)
varying vec3 vN;
varying vec3 vW;
varying float vA;
varying float vB;
varying float vBall;
void main() {
	vA = aI1.z;
	vB = aI1.w;
	if (aI1.z <= 0.001) {
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		return;
	}
	float m1 = aI1.x;
	float m2 = aI1.y;
	float wob = 1.0 + 0.06 * sin(uTime * 9.0 + position.y * 7.0 + aI2.z * 6.0) * m1 * (1.0 - m2);
	vec3 ball = position * aI2.y * wob + vec3(0.0, aI2.y, 0.0);
	// the fallen human: laid where combat.js lays it, turned half round when it fell the other way
	vec3 hu = vec3(aHuman.x, aHuman.y, aHuman.z - 0.1);
	hu.xz *= aI2.w;
	vec3 huN = aHumanN;
	huN.xz *= aI2.w;
	vec3 p = mix(hu, ball, m1);
	vec3 n = mix(huN, position, m1);
	// the unfurl overshoots a little, like something stretching awake
	float un = m2 * (1.0 + 0.35 * sin(m2 * 3.14159265));
	p = mix(p, aPlat, clamp(un, 0.0, 1.25));
	n = normalize(mix(n, aPlatN, m2) + vec3(0.0, 1e-4, 0.0));
	vBall = m1 * (1.0 - m2);
	float sy = sin(aI0.w);
	float cy = cos(aI0.w);
	vec3 w = vec3(p.x * cy + p.z * sy, p.y + aI2.x, -p.x * sy + p.z * cy) + aI0.xyz;
	vN = vec3(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy);
	vW = w;
	gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;

const LIGHT_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vN;
varying vec3 vW;
varying float vA;
varying float vB;
varying float vBall;
void main() {
	vec3 N = normalize(vN);
	vec3 V = normalize(cameraPosition - vW);
	float ndv = abs(dot(N, V));
	// light from within: a hot heart, a soft skin
	float core = pow(ndv, 1.6);
	float skin = pow(1.0 - ndv, 2.0);
	float shim = 0.85 + 0.15 * sin(vW.y * 40.0 - uTime * 7.0);
	vec3 green = vec3(0.36, 1.0, 0.6);
	vec3 gold = vec3(1.0, 0.88, 0.46);
	vec3 col = mix(green, gold, clamp(vB * 0.7 + skin * 0.4, 0.0, 1.0));
	col = mix(col, vec3(1.0), clamp(core * vB * 0.9 + vBall * core * 0.5, 0.0, 1.0));
	float a = clamp((0.22 + 0.5 * core + 0.3 * skin) * (0.45 + 0.75 * vB) * shim * vA, 0.0, 1.0);
	if (a < 0.004) discard;
	gl_FragColor = vec4(col * a, a * 0.12);
}
`;

// The LIVING POTION: part 0 heart + neck (crystal with slow rose-gold light), 2 stopper + foot (cut
// crystal and gold), 3 the braided cord.
const LIVING_FRAG = /* glsl */ `
#include <fog_pars_fragment>
uniform float uTime;
uniform vec3 uSun;
uniform float uGlow;
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
varying vec3 vCol;
varying float vPart;
varying float vGlow;
varying float vKind;
void main() {
	vec3 Ns = normalize(vN);
	vec3 V = normalize(cameraPosition - vW);
	// facets: blend the smooth normal with the true face normal so the crystal flashes as it turns
	vec3 Nf = normalize(cross(dFdx(vW), dFdy(vW)));
	if (dot(Nf, Ns) < 0.0) Nf = -Nf;
	vec3 N = normalize(mix(Ns, Nf, vPart < 2.5 ? 0.55 : 0.0));
	float ndv = max(dot(N, V), 0.0);
	float ndl = max(dot(N, uSun), 0.0);
	float fres = pow(1.0 - ndv, 2.4);
	vec3 H = normalize(uSun + V);
	float spec = pow(max(dot(N, H), 0.0), 80.0);
	float spec2 = pow(max(dot(N, normalize(vec3(-0.5, 0.6, 0.4) + V)), 0.0), 30.0) * 0.4;
	// a slow double heartbeat
	float bt = fract(uTime * 0.62);
	float beat = exp(-bt * 9.0) + 0.6 * exp(-max(bt - 0.26, 0.0) * 11.0) * step(0.26, bt);
	vec3 col;
	if (vPart < 0.5) {
		float sw = sin(vL.x * 31.0 + sin(vL.y * 23.0 + uTime * 0.8) * 2.2 + uTime * 0.5);
		float sw2 = sin(vL.y * 37.0 - vL.x * 19.0 - uTime * 0.6 + sin(vL.x * 40.0 - uTime * 0.4) * 1.5);
		float s = 0.5 + 0.25 * sw + 0.25 * sw2;
		vec3 rose = vec3(1.0, 0.46, 0.56);
		vec3 gold = vec3(1.0, 0.84, 0.5);
		vec3 inner = mix(rose, gold, s);
		inner = mix(inner, vec3(1.0, 0.97, 0.92), pow(s, 3.0) * 0.5);
		inner *= (0.55 + 0.75 * ndv) * (0.35 + 0.65 * uGlow) * (1.0 + 0.4 * beat * uGlow);
		vec3 glass = vec3(0.95, 0.8, 0.82) * (0.16 + 0.2 * ndl);
		col = glass + inner;
		col += vec3(1.0, 0.9, 0.92) * fres * 0.7 + vec3(1.0) * (spec * 1.5 + spec2);
	} else if (vPart < 2.5) {
		col = vCol * (0.42 + 0.6 * ndl) + vec3(1.0, 0.9, 0.8) * (fres * 0.6 + spec * 1.4 + spec2);
		col += vec3(1.0, 0.6, 0.6) * uGlow * 0.18 * (1.0 + beat);
	} else {
		float braid = 0.72 + 0.28 * sin(atan(vL.z, vL.x) * 14.0 + vL.y * 260.0);
		col = vCol * braid * (0.45 + 0.6 * ndl) + vec3(1.0, 0.7, 0.6) * uGlow * 0.08;
	}
	${FOG_FRAG}
	gl_FragColor = vec4(col, 1.0);
}
`;

const HALO_VERT = /* glsl */ `
uniform float uSize;
varying vec2 vUv;
void main() {
	vUv = position.xy;
	vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
	mv.xy += position.xy * uSize;
	gl_Position = projectionMatrix * mv;
}
`;
const HALO_FRAG = /* glsl */ `
uniform float uTime;
uniform float uGlow;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
	float r = length(vUv);
	float f = max(1.0 - r, 0.0);
	float bt = fract(uTime * 0.62);
	float beat = exp(-bt * 9.0) + 0.6 * exp(-max(bt - 0.26, 0.0) * 11.0) * step(0.26, bt);
	float an = atan(vUv.y, vUv.x);
	float rays = 0.5 + 0.5 * sin(an * 8.0 + uTime * 0.4) * sin(an * 13.0 - uTime * 0.27);
	float a = (f * f * 0.55 + f * f * f * f * 0.5 + rays * f * f * 0.12) * uGlow * (0.8 + 0.35 * beat);
	if (a < 0.004) discard;
	gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.95, 0.9), f * f * 0.6) * a, 0.0);
}
`;

// ---------------------------------------------------------------------------------------------

function makeCanvas(w, h) {
  if (typeof document !== "undefined" && document.createElement) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  return null;
}

export function createPotions(ctx) {
  const THREE = ctx.THREE;
  const group = new THREE.Group();
  group.name = "potions";
  let world = null;
  let clock = 0;

  // ---------------------------------------------------------------- helpers
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  const _e = new THREE.Euler(), _m = new THREE.Matrix4(), _ax = new THREE.Vector3();
  const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
  const AY = new THREE.Vector3(0, 1, 0);
  const tmp = { x: 0, y: 0, z: 0 };
  const hitList = [];
  const hitDist = [];

  function sfx(name, a, b, c, d) {
    const au = ctx.audio, f = au && au[name];
    if (typeof f === "function") return f.call(au, a, b, c, d);
    return undefined;
  }
  function vfx(name, a, b, c, d, e, f) {
    const o = ctx.fx, fn = o && o[name];
    if (typeof fn === "function") return fn.call(o, a, b, c, d, e, f);
    return undefined;
  }
  function groundAt(x, z) {
    if (world && typeof world.heightAt === "function") {
      let h = world.heightAt(x, z);
      if (typeof world.waterAt === "function") {
        const w = world.waterAt(x, z);
        if (isNum(w) && w > h) h = w;
      }
      if (isNum(h)) return h;
    }
    if (typeof ctx.floorAt === "function") {
      const h = ctx.floorAt(x, z);
      if (isNum(h)) return h;
    }
    return 0;
  }
  function panOf(x, z) {
    const cam = ctx.camera;
    if (!cam) return 0;
    const e = cam.matrixWorld.elements;
    return clamp(((x - e[12]) * e[0] + (z - e[14]) * e[2]) / 9, -1, 1);
  }
  function arcY(y0, y1, apex, k) {
    const ab = ctx.abilities;
    if (ab && typeof ab.arcY === "function") return ab.arcY(y0, y1, apex, k);
    return y0 + (y1 - y0) * k + apex * 4 * k * (1 - k);
  }
  function fire(fn, a, b, c, d) {
    return typeof fn === "function" ? fn(a, b, c, d) : undefined;
  }

  // the scene's sun, for highlights (found lazily; the engine owns exactly one DirectionalLight)
  const uTime = { value: 0 };
  const uSun = { value: new THREE.Vector3(0.38, 0.82, 0.42).normalize() };
  let sunLight = null;
  let sunSearch = 0;
  function trackSun(dt) {
    if (!sunLight) {
      sunSearch -= dt;
      if (sunSearch > 0 || !ctx.scene) return;
      sunSearch = 2;
      const kids = ctx.scene.children;
      for (let i = 0; i < kids.length; i++) if (kids[i].isDirectionalLight) { sunLight = kids[i]; break; }
      if (!sunLight) return;
    }
    const t = sunLight.target ? sunLight.target.position : null;
    _p.copy(sunLight.position);
    if (t) _p.sub(t);
    if (_p.lengthSq() > 1e-6) uSun.value.copy(_p).normalize();
  }

  function fogUniforms() {
    return {
      fogColor: { value: new THREE.Color(0xffffff) },
      fogNear: { value: 1 },
      fogFar: { value: 1000 },
      fogDensity: { value: 0.00025 },
    };
  }
  function solidMaterial(frag, extra, defines) {
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({ uTime, uSun }, fogUniforms(), extra || {}),
      vertexShader: SOLID_VERT,
      fragmentShader: frag,
      defines: defines || {},
      fog: true,
    });
  }

  // ---- tiny geometry kit: parts are transformed, tagged (part / kind / colour / glow) and merged ----
  function xf(geo, px = 0, py = 0, pz = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(px, py, pz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz));
    geo.applyMatrix4(m);
    return geo;
  }
  function lathe(profile, segs) {
    const pts = [];
    for (let i = 0; i < profile.length; i += 2) pts.push(new THREE.Vector2(profile[i], profile[i + 1]));
    return new THREE.LatheGeometry(pts, segs);
  }
  // parts: [{ geo, part = 0, kind = 0, color = [r, g, b], glow = 0 }]
  function merge(parts) {
    let vCount = 0, iCount = 0;
    for (const p of parts) {
      if (!p.geo.index) p.geo = indexed(p.geo);
      if (!p.geo.attributes.normal) p.geo.computeVertexNormals();
      vCount += p.geo.attributes.position.count;
      iCount += p.geo.index.count;
    }
    const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), col = new Float32Array(vCount * 3);
    const part = new Float32Array(vCount), kind = new Float32Array(vCount), glow = new Float32Array(vCount);
    const index = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
    let v = 0, ii = 0;
    for (const p of parts) {
      const g = p.geo, n = g.attributes.position.count;
      pos.set(g.attributes.position.array.subarray(0, n * 3), v * 3);
      nor.set(g.attributes.normal.array.subarray(0, n * 3), v * 3);
      const c = p.color || [1, 1, 1];
      for (let i = 0; i < n; i++) {
        col[(v + i) * 3] = c[0]; col[(v + i) * 3 + 1] = c[1]; col[(v + i) * 3 + 2] = c[2];
        part[v + i] = p.part || 0;
        kind[v + i] = p.kind || 0;
        glow[v + i] = p.glow || 0;
      }
      const ia = g.index.array;
      for (let i = 0; i < ia.length; i++) index[ii++] = ia[i] + v;
      v += n;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    out.setAttribute("color", new THREE.BufferAttribute(col, 3));
    out.setAttribute("aPart", new THREE.BufferAttribute(part, 1));
    out.setAttribute("aKind", new THREE.BufferAttribute(kind, 1));
    out.setAttribute("aGlow", new THREE.BufferAttribute(glow, 1));
    out.setIndex(new THREE.BufferAttribute(index, 1));
    out.computeBoundingSphere();
    return out;
  }
  function indexed(geo) {
    const n = geo.attributes.position.count;
    const idx = new Uint16Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    return geo;
  }

  // =================================================================================================
  // FLASKS: pickups, thrown flasks, the flask in the paw
  // =================================================================================================
  const FLASK_H = 0.262;
  const flaskGeo = merge([
    { geo: lathe([0, 0, 0.05, 0, 0.078, 0.018, 0.092, 0.052, 0.095, 0.088, 0.084, 0.124, 0.058, 0.152, 0.035, 0.168, 0.03, 0.2,
      0.036, 0.214, 0.037, 0.222, 0.027, 0.225, 0, 0.225], 18), part: 0 },
    { geo: lathe([0, 0.21, 0.026, 0.21, 0.031, 0.25, 0.025, FLASK_H, 0, FLASK_H], 10), part: 1, color: [0.63, 0.45, 0.27] },
    { geo: xf(new THREE.TorusGeometry(0.034, 0.0075, 6, 16), 0, 0.178, 0, 1, 1, 1, Math.PI / 2), part: 2, color: [1.0, 0.78, 0.3] },
  ]);
  const uFlaskGlow = { value: 1 };
  const flaskMat = solidMaterial(FLASK_FRAG, { uGlow: uFlaskGlow, uLevel: { value: 0.118 } });
  const flasks = new THREE.InstancedMesh(flaskGeo, flaskMat, MAX_FLASKS);
  flasks.name = "potion-flasks";
  flasks.frustumCulled = false;
  flasks.castShadow = false;
  flasks.receiveShadow = false;
  flasks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < MAX_FLASKS; i++) flasks.setMatrixAt(i, ZERO_M);
  flasks.visible = false;
  group.add(flasks);
  let flasksLive = 0; // pickups + flying flasks showing
  let flasksDirty = false;

  const heldFlask = new THREE.Mesh(flaskGeo, flaskMat);
  heldFlask.name = "potion-held";
  heldFlask.scale.setScalar(0.62);
  heldFlask.position.set(0, -0.03, 0);
  heldFlask.rotation.set(0.25, 0, 0.2);
  heldFlask.castShadow = false;
  heldFlask.visible = false;

  // ---- pickups
  const PICK_SCALE = 1.25;
  const pk = [];
  for (let i = 0; i < MAX_PICKUPS; i++) pk.push({ on: false, x: 0, y: 0, z: 0, t: 0, pop: -1, born: 0, beacon: null, seed: i * 1.7 });
  let pkSerial = 0;

  function pickupOff(i, withMatrix) {
    const p = pk[i];
    if (p.beacon) { p.beacon.remove(); p.beacon = null; }
    if (p.on || p.pop >= 0) flasksLive--;
    p.on = false;
    p.pop = -1;
    if (withMatrix) { flasks.setMatrixAt(i, ZERO_M); flasksDirty = true; }
  }

  // spawn(x, z) -> id (a point { x, z } also works). The pool holds 8; the oldest gives way.
  function spawn(x, z) {
    if (x && typeof x === "object") { z = x.z; x = x.x; }
    let s = -1, oldest = Infinity;
    for (let i = 0; i < MAX_PICKUPS; i++) {
      if (!pk[i].on && pk[i].pop < 0) { s = i; break; }
      // none free: one that is popping away gives way before a flask still lying there does
      const age = pk[i].on ? pk[i].born : pk[i].born - 1e9;
      if (age < oldest) { oldest = age; s = i; }
    }
    pickupOff(s, false);
    const p = pk[s];
    p.on = true;
    p.x = x; p.z = z; p.y = groundAt(x, z);
    p.t = 0;
    p.pop = -1;
    p.born = ++pkSerial;
    p.beacon = vfx("beacon", x, p.y, z, 0x8dffb0) || null;
    flasksLive++;
    flasks.visible = true;
    return s;
  }
  function active(id) {
    return id >= 0 && id < MAX_PICKUPS && pk[id].on;
  }
  function nearest(x, z, maxDist = Infinity) {
    let best = -1, bd = maxDist * maxDist;
    for (let i = 0; i < MAX_PICKUPS; i++) {
      const p = pk[i];
      if (!p.on) continue;
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d <= bd) { bd = d; best = i; }
    }
    return best;
  }
  function pos(id, out) {
    const o = out || {};
    if (id < 0 || id >= MAX_PICKUPS) return null;
    const p = pk[id];
    o.x = p.x; o.y = p.y + 0.38; o.z = p.z;
    return o;
  }
  // collect(id): the pop and the sound. The LEVEL then adds the potion (abilities.potion.add(1)).
  function collect(id) {
    if (!active(id)) return false;
    const p = pk[id];
    p.on = false;
    p.pop = 0;
    if (p.beacon) { p.beacon.remove(); p.beacon = null; }
    tmp.x = p.x; tmp.y = p.y + 0.42; tmp.z = p.z;
    vfx("sparkle", tmp, 0x9dffb4, 12);
    vfx("ring", p.x, p.z, 0x8dffb0, p.y + 0.05);
    sfx("potionPickup");
    return true;
  }
  function clearPickups() {
    for (let i = 0; i < MAX_PICKUPS; i++) pickupOff(i, true);
  }

  // ---- thrown flasks
  const fly = [];
  for (let i = 0; i < MAX_FLYING; i++) {
    fly.push({ on: false, t: 0, T: 1, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, apex: 1, target: null, ax: 1, ay: 0, az: 0, spin: 9, gen: 0 });
  }
  let flyCursor = 0;

  // throw(from, to, seconds, apex, target) -> id   (wire it to abilities.potion.onThrow)
  function throwFlask(from, to, seconds, apex, target) {
    let s = -1;
    for (let i = 0; i < MAX_FLYING; i++) {
      const k = (flyCursor + i) % MAX_FLYING;
      if (!fly[k].on) { s = k; break; }
    }
    if (s < 0) {
      // every flask is in the air: the oldest lands now, so nothing is ever lost
      s = flyCursor;
      landFlask(fly[s]);
    }
    flyCursor = (s + 1) % MAX_FLYING;
    const f = fly[s];
    f.on = true;
    f.t = 0;
    f.T = clamp(isNum(seconds) ? seconds : 0.75, 0.08, 6);
    f.fx = from.x; f.fy = from.y; f.fz = from.z;
    f.tx = to.x; f.ty = isNum(to.y) ? to.y : groundAt(to.x, to.z); f.tz = to.z;
    f.apex = isNum(apex) ? apex : 1.4;
    f.target = target || null;
    // tumble end over end about an axis across the line of flight, with a little skew
    const dx = f.tx - f.fx, dz = f.tz - f.fz;
    const dl = Math.hypot(dx, dz) || 1;
    f.ax = dz / dl; f.ay = (Math.random() - 0.5) * 0.5; f.az = -dx / dl;
    const al = Math.hypot(f.ax, f.ay, f.az);
    f.ax /= al; f.ay /= al; f.az /= al;
    f.spin = 8 + Math.random() * 5;
    f.gen++;
    flasksLive++;
    flasks.visible = true;
    sfx("potionThrow");
    return s + f.gen * MAX_FLYING;
  }

  function landFlask(f) {
    if (!f.on) return;
    f.on = false;
    flasksLive--;
    const x = f.tx, y = f.ty, z = f.tz;
    vfx("potionSplash", x, y, z, 0x6dffa8);
    sfx("potionSmash", panOf(x, z));
    // every un-transformed body within the splash wakes (nearest first, at most 3 per flask)
    hitList.length = 0;
    hitDist.length = 0;
    const bodies = api.bodies;
    const r2 = api.splash * api.splash;
    if (bodies && bodies.length) {
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (!b || b.alive === false || transformingBody(b)) continue;
        const d = (b.x - x) * (b.x - x) + (b.z - z) * (b.z - z);
        if (d > r2) continue;
        // insertion sort into the three nearest
        let j = hitList.length;
        if (j < 3) { hitList.push(b); hitDist.push(d); } else if (d < hitDist[2]) { j = 2; hitList[2] = b; hitDist[2] = d; } else continue;
        while (j > 0 && hitDist[j - 1] > hitDist[j]) {
          const tb = hitList[j - 1]; hitList[j - 1] = hitList[j]; hitList[j] = tb;
          const td = hitDist[j - 1]; hitDist[j - 1] = hitDist[j]; hitDist[j] = td;
          j--;
        }
      }
    }
    let n = 0;
    for (let i = 0; i < hitList.length; i++) if (transform(hitList[i], i * 0.12)) n++;
    fire(api.onSplash, x, z, n, hitList);
    if (n === 0) fire(api.onMiss, x, z);
  }

  function holdFlask(on) {
    const pl = ctx.platypus;
    const anchor = pl && pl.holdAnchor;
    if (on && anchor) {
      if (heldFlask.parent !== anchor) anchor.add(heldFlask);
      heldFlask.visible = true;
    } else {
      heldFlask.visible = false;
      if (!on && heldFlask.parent) heldFlask.parent.remove(heldFlask);
    }
  }

  function updateFlasks(dt) {
    if (flasksLive <= 0) {
      if (flasks.visible) {
        if (flasksDirty) { flasks.instanceMatrix.needsUpdate = true; flasksDirty = false; }
        else flasks.visible = false;
      }
      return;
    }
    const player = ctx.player;
    for (let i = 0; i < MAX_PICKUPS; i++) {
      const p = pk[i];
      if (p.on) {
        p.t += dt;
        const grow = smooth(p.t / 0.35);
        const bob = Math.sin(p.t * 2.1 + p.seed) * 0.05;
        _p.set(p.x, p.y + 0.26 + bob, p.z);
        _e.set(Math.sin(p.t * 1.3 + p.seed) * 0.12, p.t * 1.1 + p.seed, 0.16);
        _q.setFromEuler(_e);
        _s.setScalar(PICK_SCALE * grow * (1 + 0.15 * Math.sin(Math.min(p.t / 0.35, 1) * Math.PI)));
        flasks.setMatrixAt(i, _m.compose(_p, _q, _s));
        if (api.autoCollect && player && p.t > 0.3) {
          const dx = player.x - p.x, dz = player.z - p.z;
          if (dx * dx + dz * dz < 0.49 && Math.abs(player.y - p.y) < 1.4) {
            if (collect(i)) fire(api.onCollect, i);
          }
        }
      } else if (p.pop >= 0) {
        // the pop: jumps toward the collector, swells and is gone
        p.pop += dt;
        const k = p.pop / 0.2;
        if (k >= 1) {
          p.pop = -1;
          flasksLive--;
          flasks.setMatrixAt(i, ZERO_M);
        } else {
          _p.set(p.x, p.y + 0.3 + k * 0.35, p.z);
          _e.set(0, p.t * 1.1 + k * 5, 0.16);
          _q.setFromEuler(_e);
          _s.setScalar(PICK_SCALE * (1 + 0.5 * Math.sin(k * Math.PI)) * (1 - k * k));
          flasks.setMatrixAt(i, _m.compose(_p, _q, _s));
        }
      }
    }
    for (let i = 0; i < MAX_FLYING; i++) {
      const f = fly[i];
      const slot = MAX_PICKUPS + i;
      if (!f.on) continue;
      f.t += dt;
      const k = f.t / f.T;
      if (k >= 1) {
        flasks.setMatrixAt(slot, ZERO_M);
        landFlask(f);
        continue;
      }
      _p.set(lerp(f.fx, f.tx, k), arcY(f.fy, f.ty, f.apex, k), lerp(f.fz, f.tz, k));
      _ax.set(f.ax, f.ay, f.az);
      _q.setFromAxisAngle(_ax, f.t * f.spin);
      _s.setScalar(0.72);
      // spin about the flask's middle, not its base
      _ax.set(0, -FLASK_H * 0.5 * 0.72, 0).applyQuaternion(_q);
      _p.add(_ax);
      flasks.setMatrixAt(slot, _m.compose(_p, _q, _s));
      _p.sub(_ax);
      vfx("potionTrail", _p);
    }
    flasks.instanceMatrix.needsUpdate = true;
    flasksDirty = false;
    if (!flasks.visible) flasks.visible = true;
  }

  // =================================================================================================
  // INGREDIENTS
  // =================================================================================================
  function petal(i, n) {
    const a = (i / n) * TAU;
    const g = new THREE.SphereGeometry(1, 8, 5);
    xf(g, 0, 0, 0.085, 0.04, 0.008, 0.075);       // a flat leaf shape reaching out along +z
    xf(g, 0, 0, 0, 1, 1, 1, -0.5, 0, 0);           // cupped upward
    xf(g, 0, 0.2, 0, 1, 1, 1, 0, a, 0);
    return g;
  }
  const ingParts = [
    // glowcap (kind 0): stem (part 0) + cap (part 1) + two little ones
    { geo: lathe([0, 0, 0.04, 0, 0.034, 0.03, 0.026, 0.1, 0.03, 0.17, 0, 0.17], 10), kind: 0, part: 0, color: [0.8, 0.86, 0.95], glow: 0.25 },
    { geo: lathe([0.0, 0.15, 0.06, 0.145, 0.12, 0.15, 0.135, 0.17, 0.12, 0.205, 0.085, 0.24, 0.04, 0.262, 0, 0.268], 14), kind: 0, part: 1, color: [0.2, 0.55, 1.0], glow: 0.9 },
    { geo: xf(lathe([0, 0, 0.02, 0, 0.015, 0.07, 0, 0.07], 8), 0.12, 0, 0.05), kind: 0, part: 0, color: [0.8, 0.86, 0.95], glow: 0.25 },
    { geo: xf(lathe([0, 0.06, 0.05, 0.062, 0.06, 0.08, 0.035, 0.108, 0, 0.115], 10), 0.12, 0, 0.05), kind: 0, part: 1, color: [0.24, 0.6, 1.0], glow: 0.9 },
    { geo: xf(lathe([0, 0, 0.016, 0, 0.012, 0.05, 0, 0.05], 8), -0.09, 0, -0.08), kind: 0, part: 0, color: [0.8, 0.86, 0.95], glow: 0.25 },
    { geo: xf(lathe([0, 0.042, 0.04, 0.044, 0.046, 0.058, 0.028, 0.08, 0, 0.085], 10), -0.09, 0, -0.08), kind: 0, part: 1, color: [0.22, 0.58, 1.0], glow: 0.9 },
    // moonpetal (kind 1): stem, two leaves, six petals, a bright heart
    { geo: xf(new THREE.CylinderGeometry(0.008, 0.012, 0.2, 6), 0, 0.1, 0), kind: 1, part: 0, color: [0.36, 0.56, 0.42], glow: 0.05 },
    { geo: xf(new THREE.SphereGeometry(1, 8, 5), 0.05, 0.06, 0, 0.055, 0.006, 0.025, 0, 0, 0.5), kind: 1, part: 0, color: [0.34, 0.58, 0.42], glow: 0.05 },
    { geo: xf(new THREE.SphereGeometry(1, 8, 5), -0.05, 0.09, 0.01, 0.05, 0.006, 0.022, 0, 0, -0.5), kind: 1, part: 0, color: [0.34, 0.58, 0.42], glow: 0.05 },
    { geo: xf(new THREE.SphereGeometry(0.028, 10, 8), 0, 0.212, 0), kind: 1, part: 2, color: [1.0, 0.95, 0.7], glow: 1.1 },
    // dewdrop (kind 2): the bead (part 0) and a small bright twin circling it
    { geo: xf(new THREE.SphereGeometry(0.085, 18, 14), 0, 0.1, 0, 1, 1.12, 1), kind: 2, part: 0, color: [0.5, 0.95, 0.9] },
    { geo: xf(new THREE.SphereGeometry(0.02, 8, 6), 0.12, 0.2, 0.02), kind: 2, part: 0, color: [0.5, 0.95, 0.9] },
  ];
  for (let i = 0; i < 6; i++) ingParts.push({ geo: petal(i, 6), kind: 1, part: 1, color: [0.9, 0.9, 1.0], glow: 0.6 });
  const ingGeo = merge(ingParts);
  const ingSel = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INGREDIENTS), 1);
  ingSel.setUsage(THREE.DynamicDrawUsage);
  ingGeo.setAttribute("aSel", ingSel);
  const ingMat = solidMaterial(ITEM_FRAG, null, { USE_SEL: "" });
  const ingMesh = new THREE.InstancedMesh(ingGeo, ingMat, MAX_INGREDIENTS);
  ingMesh.name = "potion-ingredients";
  ingMesh.frustumCulled = false;
  ingMesh.castShadow = false;
  ingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < MAX_INGREDIENTS; i++) ingMesh.setMatrixAt(i, ZERO_M);
  ingMesh.visible = false;
  group.add(ingMesh);
  const ing = [];
  for (let i = 0; i < MAX_INGREDIENTS; i++) ing.push({ on: false, kind: 0, x: 0, y: 0, z: 0, t: 0, pop: -1, seed: i * 2.3, born: 0 });
  let ingLive = 0;
  let ingSerial = 0;
  let ingDirty = false;

  const ingredients = {
    held: [],
    maxHeld: 3,
    autoCollect: false, // true: walking within 0.7 m collects (and fires onCollect(id, kind))
    onCollect: null,
    colors: KIND_HEX,
    // spawn(kind, x, z, lift?) -> id. Also spawn(kind, { x, y, z }, lift?): y = the ground there.
    // lift = height above the ground (the dewdrop floats 0.45 m up unless told otherwise).
    spawn(kind, x, z, lift) {
      let k = KINDS.indexOf(kind);
      if (k < 0) k = 0;
      let y;
      if (x && typeof x === "object") { lift = z; y = x.y; z = x.z; x = x.x; }
      let s = -1, oldest = Infinity;
      for (let i = 0; i < MAX_INGREDIENTS; i++) {
        if (!ing[i].on && ing[i].pop < 0) { s = i; break; }
        const age = ing[i].on ? ing[i].born : ing[i].born - 1e9;
        if (age < oldest) { oldest = age; s = i; }
      }
      const g = ing[s];
      if (!g.on && g.pop < 0) ingLive++;
      g.on = true;
      g.pop = -1;
      g.kind = k;
      g.x = x; g.z = z;
      g.y = (isNum(y) ? y : groundAt(x, z)) + (isNum(lift) ? lift : KIND_LIFT[k]);
      g.t = 0;
      g.born = ++ingSerial;
      ingSel.array[s] = k;
      ingSel.needsUpdate = true;
      ingMesh.visible = true;
      return s;
    },
    active(id) {
      return id >= 0 && id < MAX_INGREDIENTS && ing[id].on;
    },
    kind(id) {
      return ingredients.active(id) ? KINDS[ing[id].kind] : null;
    },
    nearest(x, z, maxDist = Infinity) {
      let best = -1, bd = maxDist * maxDist;
      for (let i = 0; i < MAX_INGREDIENTS; i++) {
        const g = ing[i];
        if (!g.on) continue;
        const d = (g.x - x) * (g.x - x) + (g.z - z) * (g.z - z);
        if (d <= bd) { bd = d; best = i; }
      }
      return best;
    },
    pos(id, out) {
      if (id < 0 || id >= MAX_INGREDIENTS) return null;
      const o = out || {};
      o.x = ing[id].x; o.y = ing[id].y + 0.15; o.z = ing[id].z;
      return o;
    },
    // collect(id) -> kind (and it is carried: pushed onto `held`, at most maxHeld), or null
    collect(id) {
      if (!ingredients.active(id) || ingredients.held.length >= ingredients.maxHeld) return null;
      const g = ing[id];
      g.on = false;
      g.pop = 0;
      const name = KINDS[g.kind];
      ingredients.held.push(name);
      tmp.x = g.x; tmp.y = g.y + 0.2; tmp.z = g.z;
      vfx("sparkle", tmp, KIND_HEX[name], 12);
      sfx("ingredient", g.kind, true);
      return name;
    },
    // take one carried ingredient out of `held` (the first of that kind, or the first at all)
    drop(kind) {
      const h = ingredients.held;
      const i = kind ? h.indexOf(kind) : 0;
      if (i < 0 || !h.length) return null;
      return h.splice(i, 1)[0];
    },
    clear() {
      for (let i = 0; i < MAX_INGREDIENTS; i++) {
        ing[i].on = false;
        ing[i].pop = -1;
        ingMesh.setMatrixAt(i, ZERO_M);
      }
      ingLive = 0;
      ingDirty = true;
      ingredients.held.length = 0;
    },
  };

  function updateIngredients(dt) {
    if (ingLive <= 0) {
      if (ingMesh.visible) {
        if (ingDirty) { ingMesh.instanceMatrix.needsUpdate = true; ingDirty = false; }
        else ingMesh.visible = false;
      }
      return;
    }
    const player = ctx.player;
    for (let i = 0; i < MAX_INGREDIENTS; i++) {
      const g = ing[i];
      if (g.on) {
        g.t += dt;
        const grow = smooth(g.t / 0.4) * (1 + 0.18 * Math.sin(Math.min(g.t / 0.4, 1) * Math.PI));
        let y = g.y, tilt = 0, yaw = g.seed;
        if (g.kind === 2) {
          y += Math.sin(g.t * 1.7 + g.seed) * 0.06;
          yaw += g.t * 1.4;
        } else if (g.kind === 1) {
          tilt = Math.sin(g.t * 1.1 + g.seed) * 0.09;
          yaw += Math.sin(g.t * 0.5) * 0.3;
        } else {
          tilt = Math.sin(g.t * 0.9 + g.seed) * 0.03;
        }
        _p.set(g.x, y, g.z);
        _e.set(tilt, yaw, tilt * 0.6);
        _q.setFromEuler(_e);
        _s.setScalar(1.35 * grow);
        ingMesh.setMatrixAt(i, _m.compose(_p, _q, _s));
        if (ingredients.autoCollect && player && g.t > 0.3) {
          const dx = player.x - g.x, dz = player.z - g.z;
          if (dx * dx + dz * dz < 0.49 && Math.abs(player.y - g.y) < 1.0) {
            const k = ingredients.collect(i);
            if (k) fire(ingredients.onCollect, i, k);
          }
        }
      } else if (g.pop >= 0) {
        g.pop += dt;
        const k = g.pop / 0.25;
        if (k >= 1) {
          g.pop = -1;
          ingLive--;
          ingMesh.setMatrixAt(i, ZERO_M);
        } else {
          _p.set(g.x, g.y + k * 0.5, g.z);
          _e.set(0, g.seed + k * 6, 0);
          _q.setFromEuler(_e);
          _s.setScalar(1.35 * (1 - k) * (1 + 0.4 * Math.sin(k * Math.PI)));
          ingMesh.setMatrixAt(i, _m.compose(_p, _q, _s));
        }
      }
    }
    ingMesh.instanceMatrix.needsUpdate = true;
    ingDirty = false;
  }

  // =================================================================================================
  // THE CAULDRON
  // =================================================================================================
  const cGroup = new THREE.Group();
  cGroup.name = "cauldron";
  cGroup.visible = false;
  group.add(cGroup);
  const IRON = [0.105, 0.11, 0.13], BRASS = [0.5, 0.36, 0.16];
  const potParts = [
    { geo: lathe([0, 0.1, 0.3, 0.1, 0.47, 0.19, 0.57, 0.36, 0.585, 0.5, 0.55, 0.63, 0.5, 0.71, 0.5, 0.735, 0.545, 0.752, 0.565, 0.775,
      0.545, 0.8, 0.5, 0.8, 0.465, 0.76, 0.46, 0.7, 0.5, 0.6, 0.52, 0.45, 0.49, 0.32, 0.38, 0.2, 0, 0.17], 28), color: IRON },
    { geo: xf(new THREE.TorusGeometry(0.585, 0.022, 6, 28), 0, 0.5, 0, 1, 1, 1, Math.PI / 2), color: BRASS },
    { geo: xf(new THREE.TorusGeometry(0.09, 0.018, 6, 12), 0.6, 0.6, 0, 1, 1, 1, 0, Math.PI / 2, 0), color: BRASS },
    { geo: xf(new THREE.TorusGeometry(0.09, 0.018, 6, 12), -0.6, 0.6, 0, 1, 1, 1, 0, Math.PI / 2, 0), color: BRASS },
  ];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    potParts.push({ geo: xf(new THREE.CylinderGeometry(0.06, 0.045, 0.2, 8), Math.cos(a) * 0.36, 0.09, Math.sin(a) * 0.36, 1, 1, 1, Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25), color: IRON });
    potParts.push({ geo: xf(new THREE.SphereGeometry(0.05, 8, 6), Math.cos(a) * 0.38, 0.03, Math.sin(a) * 0.38, 1.2, 0.6, 1.2), color: IRON });
  }
  const potGeo = merge(potParts);
  potGeo.deleteAttribute("aPart"); potGeo.deleteAttribute("aKind"); potGeo.deleteAttribute("aGlow");
  const potMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.35 });
  const pot = new THREE.Mesh(potGeo, potMat);
  pot.name = "cauldron-pot";
  pot.castShadow = false;
  pot.receiveShadow = true;
  cGroup.add(pot);

  // the spoon: only while stirring
  const spoonGeo = merge([
    { geo: xf(new THREE.CylinderGeometry(0.017, 0.022, 0.95, 7), 0, 0.475, 0), color: [0.46, 0.31, 0.17] },
    { geo: xf(new THREE.SphereGeometry(0.07, 10, 6), 0, 0.0, 0, 1, 0.45, 0.8), color: [0.42, 0.28, 0.15] },
  ]);
  spoonGeo.deleteAttribute("aPart"); spoonGeo.deleteAttribute("aKind"); spoonGeo.deleteAttribute("aGlow");
  const spoonPivot = new THREE.Group();
  const spoon = new THREE.Mesh(spoonGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 }));
  spoon.name = "cauldron-spoon";
  spoon.position.set(0.24, 0.42, 0);
  spoon.rotation.z = -0.42;
  spoon.castShadow = false;
  spoonPivot.add(spoon);
  spoonPivot.visible = false;
  cGroup.add(spoonPivot);

  // liquid disc + three rune quads in one mesh
  function buildBrewGeometry() {
    const SEG = 36;
    const vCount = 1 + SEG + 12;
    const posA = new Float32Array(vCount * 3), part = new Float32Array(vCount);
    const idx = [];
    let v = 1;
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * TAU;
      posA[v * 3] = Math.cos(a); posA[v * 3 + 2] = Math.sin(a);
      idx.push(0, 1 + ((i + 1) % SEG), 1 + i);
      v++;
    }
    const Q = [-1, -1, 1, -1, 1, 1, -1, 1];
    for (let r = 0; r < 3; r++) {
      const base = v;
      for (let c = 0; c < 4; c++) {
        posA[v * 3] = Q[c * 2]; posA[v * 3 + 2] = Q[c * 2 + 1];
        part[v] = r + 1;
        v++;
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(posA, 3));
    g.setAttribute("aPart", new THREE.BufferAttribute(part, 1));
    g.setIndex(idx);
    return g;
  }
  const EMPTY_COL = new THREE.Vector3(0.1, 0.15, 0.24), EMPTY_COL2 = new THREE.Vector3(0.22, 0.32, 0.46);
  const DONE_COL = new THREE.Vector3(0.2, 0.95, 0.5), DONE_COL2 = new THREE.Vector3(1.0, 0.88, 0.36);
  const brewU = {
    uTime,
    uLevelY: { value: 0.3 },
    uShow: { value: 0 },
    uCol: { value: EMPTY_COL.clone() },
    uCol2: { value: EMPTY_COL2.clone() },
    uGlow: { value: 0.8 },
    uSpin: { value: 0 },
    uBeat: { value: -1 },
    uKinds: { value: new THREE.Vector3(0, 1, 2) },
    uState: { value: new THREE.Vector3(0, 0, 0) },
    uRune0: { value: new THREE.Vector3() },
    uRune1: { value: new THREE.Vector3() },
    uRune2: { value: new THREE.Vector3() },
  };
  const brew = new THREE.Mesh(buildBrewGeometry(), new THREE.ShaderMaterial({
    uniforms: brewU,
    vertexShader: BREW_VERT,
    fragmentShader: BREW_FRAG,
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  }));
  brew.name = "cauldron-brew";
  brew.frustumCulled = false;
  brew.renderOrder = 3;
  cGroup.add(brew);

  const tgtCol = EMPTY_COL.clone(), tgtCol2 = EMPTY_COL2.clone();
  let tgtLevel = 0.3, tgtGlow = 0.8, showT = 0, showing = false, spinVel = 0.4, bubbleAcc = 0, dip = 0, fireHandle = null;
  const _c = new THREE.Vector3();

  function runeColors() {
    const r = cauldron.recipe;
    const us = [brewU.uRune0.value, brewU.uRune1.value, brewU.uRune2.value];
    for (let i = 0; i < 3; i++) {
      let k = KINDS.indexOf(r && r[i]);
      if (k < 0) k = i;
      brewU.uKinds.value.setComponent(i, k);
      us[i].set(KIND_RGB[k][0], KIND_RGB[k][1], KIND_RGB[k][2]);
    }
  }
  function runeStates() {
    const f = cauldron.filled;
    brewU.uState.value.set(f > 0 ? 2 : (f === 0 && !cauldron.done ? 1 : 0), f > 1 ? 2 : (f === 1 ? 1 : 0), f > 2 ? 2 : (f === 2 ? 1 : 0));
    if (cauldron.done) brewU.uState.value.set(2, 2, 2);
  }
  function liquidTargets() {
    const f = cauldron.filled;
    if (cauldron.done) {
      tgtCol.copy(DONE_COL); tgtCol2.copy(DONE_COL2);
      tgtLevel = 0.64; tgtGlow = 1.35;
    } else if (f === 0) {
      tgtCol.copy(EMPTY_COL); tgtCol2.copy(EMPTY_COL2);
      tgtLevel = 0.3; tgtGlow = 0.8;
    } else {
      // each ingredient tints the brew: the newest leads, the ones before it linger
      const r = cauldron.recipe;
      let k = KINDS.indexOf(r && r[f - 1]);
      if (k < 0) k = f - 1;
      let k0 = KINDS.indexOf(r && r[Math.max(0, f - 2)]);
      if (k0 < 0) k0 = 0;
      tgtCol.set(KIND_RGB[k0][0] * 0.55, KIND_RGB[k0][1] * 0.55, KIND_RGB[k0][2] * 0.6);
      tgtCol2.set(KIND_RGB[k][0], KIND_RGB[k][1], KIND_RGB[k][2]);
      tgtLevel = 0.3 + 0.1 * f; tgtGlow = 0.9 + 0.12 * f;
    }
    sfx("cauldron", showing ? (cauldron.done ? 0.85 : 0.35 + 0.15 * f + (cauldron.stirring ? 0.15 : 0)) : 0);
  }
  function cauldronTop(out, h) {
    out.x = cauldron.x; out.y = cGroup.position.y + h; out.z = cauldron.z;
    return out;
  }

  const cauldron = {
    group: cGroup,
    x: 0,
    z: 0,
    radius: 0.62,       // a collider-sized footprint, for the level
    recipe: KINDS.slice(),
    filled: 0,
    stirring: false,
    stirs: 0,
    done: false,
    ready: false,       // brewed and full (it dips after take() and fills again)
    onDone: null,
    // place(x, z) or place({ x, z })
    place(x, z) {
      if (x && typeof x === "object") { z = x.z; x = x.x; }
      cauldron.x = x; cauldron.z = z;
      cGroup.position.set(x, groundAt(x, z), z);
      return cauldron;
    },
    // show(true): the cauldron appears and its three rune stones light up in the recipe's colours,
    // left to right. show(false) hides it (and stops its sound).
    show(on) {
      showing = !!on;
      cGroup.visible = showing;
      if (showing) {
        runeColors();
        runeStates();
        showT = 0;
        brewU.uShow.value = 0;
        if (!fireHandle) {
          fireHandle = vfx("campfire", cauldron.x, cGroup.position.y, cauldron.z, 0.55) || null;
          if (fireHandle && fireHandle.level) fireHandle.level(0.55);
        }
      } else if (fireHandle) {
        fireHandle.remove();
        fireHandle = null;
      }
      liquidTargets();
      return cauldron;
    },
    // add(kind) -> true if it was the next one of the recipe. Wrong: grey smoke, the cauldron empties.
    add(kind) {
      if (cauldron.done || cauldron.stirring || cauldron.filled >= 3) return false;
      runeColors();
      const want = cauldron.recipe[cauldron.filled];
      const k = Math.max(0, KINDS.indexOf(kind));
      if (kind === want) {
        cauldron.filled++;
        sfx("ingredient", k, true);
        cauldronTop(tmp, brewU.uLevelY.value + 0.05);
        vfx("splash", tmp.x, tmp.y, tmp.z, 0.3);
        tmp.y += 0.35;
        vfx("sparkle", tmp, KIND_HEX[kind] || 0xffffff, 14);
        spinVel = 2.2;
        runeStates();
        liquidTargets();
        return true;
      }
      cauldron.filled = 0;
      sfx("ingredient", k, false);
      sfx("brewFail");
      cauldronTop(tmp, 0.75);
      vfx("smoke", tmp.x, tmp.y, tmp.z, 0.55, 1.6);
      vfx("dust", tmp.x, tmp.y, tmp.z, 0.8);
      runeStates();
      liquidTargets();
      return false;
    },
    startStir() {
      if (cauldron.done) return false;
      cauldron.stirring = true;
      cauldron.stirs = 0;
      spoonPivot.visible = true;
      spinVel = 1.2;
      liquidTargets();
      return true;
    },
    // stir(quality 0..1) -> true if it counted (quality >= 0.5). The fourth good stir finishes the brew.
    stir(quality = 1) {
      if (!cauldron.stirring || cauldron.done) return false;
      const good = (quality === true ? 1 : +quality || 0) >= 0.5;
      sfx("stir", good);
      cauldronTop(tmp, brewU.uLevelY.value + 0.08);
      if (!good) {
        // a bad stir only puffs
        vfx("dust", tmp.x, tmp.y + 0.1, tmp.z, 0.4);
        spinVel = Math.max(spinVel, 1.6);
        return false;
      }
      cauldron.stirs++;
      spinVel = 5 + cauldron.stirs;
      // the brew warms toward green-gold with every good stir
      const k = cauldron.stirs / 4;
      tgtCol.lerp(DONE_COL, k); tgtCol2.lerp(DONE_COL2, k);
      tgtGlow = 1.0 + 0.3 * k;
      vfx("sparkle", tmp, 0xb8ffb0, 8 + cauldron.stirs * 2);
      vfx("bubbles", tmp.x, tmp.y - 0.12, tmp.z, 5, tmp.y - 0.06);
      if (cauldron.stirs >= 4) {
        cauldron.stirring = false;
        cauldron.done = true;
        cauldron.ready = true;
        brewU.uBeat.value = -1;
        runeStates();
        liquidTargets();
        sfx("brewDone");
        tmp.y += 0.3;
        vfx("sparkle", tmp, 0xffe27a, 28);
        vfx("potionSplash", tmp.x, tmp.y - 0.25, tmp.z, 0x8dffb0);
        fire(cauldron.onDone);
      }
      return true;
    },
    // beat(phase 0..1 | null): draws the stirring cue on the liquid (a ring that closes on the beat).
    // Pass ctx.music.beatPhase() every frame while stirring; null turns it off.
    beat(phase) {
      brewU.uBeat.value = isNum(phase) && cauldron.stirring ? clamp(phase, 0, 1) : -1;
    },
    // take() -> 3 potions ladled out (0 until the brew is done). The LEVEL adds them. The liquid dips
    // and fills again by itself, so take() may be called again (level 6 refills every 20 s).
    take() {
      if (!cauldron.done) return 0;
      dip = 1;
      cauldron.ready = false;
      spoonPivot.visible = false;
      sfx("potionPickup");
      cauldronTop(tmp, brewU.uLevelY.value + 0.1);
      vfx("sparkle", tmp, 0x9dffb4, 16);
      return 3;
    },
    reset() {
      cauldron.filled = 0;
      cauldron.stirring = false;
      cauldron.stirs = 0;
      cauldron.done = false;
      cauldron.ready = false;
      dip = 0;
      spinVel = 0.4;
      spoonPivot.visible = false;
      brewU.uBeat.value = -1;
      brewU.uCol.value.copy(EMPTY_COL); brewU.uCol2.value.copy(EMPTY_COL2);
      brewU.uLevelY.value = 0.3;
      brewU.uGlow.value = 0.8;
      runeColors();
      runeStates();
      liquidTargets();
      return cauldron;
    },
  };

  function updateCauldron(dt) {
    if (!showing) return;
    if (showT < 3) {
      showT = Math.min(3, showT + dt * 1.6);
      brewU.uShow.value = showT;
    }
    const k = 1 - Math.exp(-dt * 3.5);
    brewU.uCol.value.lerp(tgtCol, k);
    brewU.uCol2.value.lerp(tgtCol2, k);
    if (dip > 0) {
      dip = Math.max(0, dip - dt / 3.2);
      if (dip === 0 && cauldron.done) cauldron.ready = true;
    }
    const lv = tgtLevel - 0.2 * Math.sin(Math.min(dip, 1) * Math.PI) * (dip > 0 ? 1 : 0);
    brewU.uLevelY.value += (lv - brewU.uLevelY.value) * k;
    brewU.uGlow.value += (tgtGlow - brewU.uGlow.value) * k;
    const rest = cauldron.stirring ? 1.4 : cauldron.done ? 0.9 : 0.35;
    spinVel += (rest - spinVel) * (1 - Math.exp(-dt * 1.8));
    brewU.uSpin.value = (brewU.uSpin.value + spinVel * dt) % TAU;
    if (spoonPivot.visible) {
      spoonPivot.rotation.y = -brewU.uSpin.value * 1.0;
      spoon.position.y = brewU.uLevelY.value + 0.02;
    }
    // bubbles and a wisp of glowing steam
    bubbleAcc += dt * (cauldron.done ? 3.2 : 0.8 + cauldron.filled * 0.7 + (cauldron.stirring ? 1.2 : 0));
    if (bubbleAcc >= 1) {
      bubbleAcc = 0;
      const a = Math.random() * TAU, r = Math.random() * 0.33;
      const sy = cGroup.position.y + brewU.uLevelY.value;
      vfx("bubbles", cauldron.x + Math.cos(a) * r, sy - 0.1, cauldron.z + Math.sin(a) * r, 1, sy);
      if (cauldron.done && Math.random() < 0.6) {
        _c.set(cauldron.x + Math.cos(a) * r, sy + 0.15, cauldron.z + Math.sin(a) * r);
        vfx("sparkle", _c, Math.random() < 0.5 ? 0x8dffb0 : 0xffe27a, 2);
      }
    }
  }

  // =================================================================================================
  // THE TRANSFORMATION
  // =================================================================================================
  // nine blobs of light; [human centre xyz, human radii xyz, platypus centre xyz, platypus radii xyz]
  // The human lies on their back along z (head toward -z); the platypus faces +z.
  const BLOBS = [
    0, 0.13, -0.25, 0.19, 0.12, 0.3, /**/ 0, 0.13, 0.02, 0.17, 0.115, 0.29,          // torso      -> body
    0, 0.12, 0.12, 0.17, 0.11, 0.17, /**/ 0, 0.12, -0.2, 0.155, 0.1, 0.18,           // pelvis     -> rump
    0, 0.15, -0.74, 0.11, 0.12, 0.13, /**/ 0, 0.135, 0.33, 0.1, 0.085, 0.12,         // head       -> head
    -0.3, 0.08, -0.18, 0.06, 0.06, 0.33, /**/ -0.17, 0.045, 0.2, 0.065, 0.03, 0.085, // arm        -> front foot
    0.3, 0.08, -0.18, 0.06, 0.06, 0.33, /**/ 0.17, 0.045, 0.2, 0.065, 0.03, 0.085,
    -0.1, 0.09, 0.56, 0.085, 0.085, 0.42, /**/ -0.17, 0.045, -0.2, 0.07, 0.03, 0.09, // leg        -> hind foot
    0.1, 0.09, 0.56, 0.085, 0.085, 0.42, /**/ 0.17, 0.045, -0.2, 0.07, 0.03, 0.09,
    0, 0.14, -0.46, 0.23, 0.11, 0.12, /**/ 0, 0.105, 0.5, 0.078, 0.03, 0.115,        // shoulders  -> bill
    0, 0.11, 0.3, 0.16, 0.1, 0.14, /**/ 0, 0.085, -0.5, 0.115, 0.035, 0.2,           // hips       -> tail
  ];
  function buildLightGeometry() {
    const U = 10, V = 7, NB = BLOBS.length / 12;
    const per = (U + 1) * (V + 1);
    const posA = new Float32Array(per * NB * 3), hum = new Float32Array(per * NB * 3), plat = new Float32Array(per * NB * 3);
    const humN = new Float32Array(per * NB * 3), platN = new Float32Array(per * NB * 3);
    const index = new Uint16Array(U * V * 6 * NB);
    let v = 0, ii = 0;
    for (let b = 0; b < NB; b++) {
      const o = b * 12, base = v;
      for (let j = 0; j <= V; j++) {
        const el = (j / V - 0.5) * Math.PI;
        for (let i = 0; i <= U; i++) {
          const an = (i / U) * TAU;
          const dx = Math.cos(el) * Math.cos(an), dy = Math.sin(el), dz = Math.cos(el) * Math.sin(an);
          posA[v * 3] = dx; posA[v * 3 + 1] = dy; posA[v * 3 + 2] = dz;
          hum[v * 3] = BLOBS[o] + dx * BLOBS[o + 3]; hum[v * 3 + 1] = BLOBS[o + 1] + dy * BLOBS[o + 4]; hum[v * 3 + 2] = BLOBS[o + 2] + dz * BLOBS[o + 5];
          plat[v * 3] = BLOBS[o + 6] + dx * BLOBS[o + 9]; plat[v * 3 + 1] = BLOBS[o + 7] + dy * BLOBS[o + 10]; plat[v * 3 + 2] = BLOBS[o + 8] + dz * BLOBS[o + 11];
          // ellipsoid normals: direction divided by the radii
          let nx = dx / BLOBS[o + 3], ny = dy / BLOBS[o + 4], nz = dz / BLOBS[o + 5];
          let nl = Math.hypot(nx, ny, nz) || 1;
          humN[v * 3] = nx / nl; humN[v * 3 + 1] = ny / nl; humN[v * 3 + 2] = nz / nl;
          nx = dx / BLOBS[o + 9]; ny = dy / BLOBS[o + 10]; nz = dz / BLOBS[o + 11];
          nl = Math.hypot(nx, ny, nz) || 1;
          platN[v * 3] = nx / nl; platN[v * 3 + 1] = ny / nl; platN[v * 3 + 2] = nz / nl;
          v++;
        }
      }
      for (let j = 0; j < V; j++) {
        for (let i = 0; i < U; i++) {
          const a = base + j * (U + 1) + i, c = a + U + 1;
          index[ii++] = a; index[ii++] = c; index[ii++] = a + 1;
          index[ii++] = a + 1; index[ii++] = c; index[ii++] = c + 1;
        }
      }
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(posA, 3));
    g.setAttribute("aHuman", new THREE.BufferAttribute(hum, 3));
    g.setAttribute("aPlat", new THREE.BufferAttribute(plat, 3));
    g.setAttribute("aHumanN", new THREE.BufferAttribute(humN, 3));
    g.setAttribute("aPlatN", new THREE.BufferAttribute(platN, 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    return g;
  }
  const LI_STRIDE = 12;
  const liData = new Float32Array(MAX_TRANSFORMS * LI_STRIDE);
  const liBuffer = new THREE.InstancedInterleavedBuffer(liData, LI_STRIDE, 1);
  liBuffer.setUsage(THREE.DynamicDrawUsage);
  const liGeo = buildLightGeometry();
  liGeo.setAttribute("aI0", new THREE.InterleavedBufferAttribute(liBuffer, 4, 0));
  liGeo.setAttribute("aI1", new THREE.InterleavedBufferAttribute(liBuffer, 4, 4));
  liGeo.setAttribute("aI2", new THREE.InterleavedBufferAttribute(liBuffer, 4, 8));
  liGeo.instanceCount = MAX_TRANSFORMS;
  const lightBodies = new THREE.Mesh(liGeo, new THREE.ShaderMaterial({
    uniforms: { uTime },
    vertexShader: LIGHT_VERT,
    fragmentShader: LIGHT_FRAG,
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    blending: THREE.NormalBlending,
    side: THREE.FrontSide,
  }));
  lightBodies.name = "potion-lightbodies";
  lightBodies.frustumCulled = false;
  lightBodies.renderOrder = 4;
  lightBodies.castShadow = false;
  lightBodies.visible = false;
  group.add(lightBodies);

  const tf = [];
  for (let i = 0; i < MAX_TRANSFORMS; i++) {
    tf.push({ on: false, t: 0, body: null, ally: null, enemy: null, glow0: 0, theirs: false, x: 0, y: 0, z: 0, yaw: 0, swirled: false, swapped: false, bloomed: false, lit: false });
  }
  let tfLive = 0;

  function transformingBody(b) {
    for (let i = 0; i < MAX_TRANSFORMS; i++) if (tf[i].on && tf[i].body === b) return true;
    return false;
  }

  // transform(body, delay = 0) -> true if it started. `body` is one of combat.bodies (or any
  // { x, y?, z, yaw?, transform()? }). 2.6 s, then the newborn's sit-up, then onJoined.
  function transform(body, delay = 0) {
    if (!body || body.alive === false || transformingBody(body)) return false;
    let s = -1;
    for (let i = 0; i < MAX_TRANSFORMS; i++) if (!tf[i].on) { s = i; break; }
    if (s < 0) return false;
    const t = tf[s];
    t.on = true;
    t.t = -Math.max(0, +delay || 0);
    t.body = body;
    t.ally = null;
    t.x = body.x; t.z = body.z;
    t.y = groundAt(body.x, body.z);
    if (isNum(body.y) && Math.abs(body.y - t.y) < 0.6) t.y = Math.min(t.y, body.y);
    t.yaw = isNum(body.yaw) ? body.yaw : 0;
    t.swirled = t.swapped = t.bloomed = t.lit = t.theirs = false;
    // combat.js draws the fallen human from body.enemy: while the light gathers we lend it the glow and
    // the lift (its own fields: glow = rim light, flash = warm inner light, hop = height off the ground)
    const en = body.enemy;
    t.enemy = en && typeof en === "object" && isNum(en.hop) && isNum(en.glow) ? en : null;
    t.glow0 = t.enemy ? t.enemy.glow : 0;
    tfLive++;
    const o = s * LI_STRIDE;
    liData[o] = t.x; liData[o + 1] = t.y; liData[o + 2] = t.z; liData[o + 3] = t.yaw;
    liData[o + 4] = 0; liData[o + 5] = 0; liData[o + 6] = 0; liData[o + 7] = 0;
    liData[o + 8] = 0; liData[o + 9] = 0.2; liData[o + 10] = Math.random(); liData[o + 11] = en && en.fallSign < 0 ? -1 : 1;
    lightBodies.visible = true;
    return true;
  }

  function findAlly(t, given) {
    if (given && typeof given === "object") return given;
    // otherwise: the newest ally standing where the body lay (set potions.allies = combat.allies)
    const list = api.allies;
    if (list && list.length) {
      for (let i = list.length - 1; i >= 0; i--) {
        const a = list[i];
        if (a && a.alive !== false && (a.x - t.x) * (a.x - t.x) + (a.z - t.z) * (a.z - t.z) < 1.0) return a;
      }
    }
    return null;
  }

  function updateTransforms(dt) {
    if (tfLive <= 0) {
      if (lightBodies.visible) lightBodies.visible = false;
      return;
    }
    let anyLit = false;
    for (let i = 0; i < MAX_TRANSFORMS; i++) {
      const t = tf[i];
      if (!t.on) continue;
      const o = i * LI_STRIDE;
      const before = t.t;
      t.t += dt;
      const tt = t.t;
      if (tt < 0) continue;
      const body = t.body;
      if (before <= 0) {
        // 0 s: the body begins to glow from within
        sfx("transform", T_END);
        t.lit = true;
        tmp.x = t.x; tmp.y = t.y + 0.25; tmp.z = t.z;
        vfx("sparkle", tmp, 0x9dffb4, 6);
      }
      if (tt < T_END) {
        anyLit = true;
        // 0 - 0.5 s lift and glow; 0.5 - 1.4 s shrink into a ball; 1.9 s unfurl as a platypus;
        // 1.9 - 2.6 s the light sinks into the newborn's fur
        const lift = LIFT * smooth(tt / T_LIFT);
        const m1 = smooth((tt - T_LIFT) / (T_SWAP - T_LIFT));
        const m2 = smooth((tt - T_BLOOM) / 0.38);
        const sink = smooth((tt - T_BLOOM) / (T_END - T_BLOOM));
        const ballR = 0.2 + 0.035 * Math.sin(tt * 11) * m1 * (1 - m2) - 0.05 * smooth((tt - T_SWAP) / (T_BLOOM - T_SWAP));
        let alpha = smooth(tt / 0.3);
        let bright = 0.25 + 0.35 * smooth(tt / T_LIFT) + 0.6 * m1;
        if (tt > T_BLOOM) {
          alpha = 1 - sink * sink;
          bright = 1.25 - 0.9 * sink;
        } else if (tt > T_BLOOM - 0.12) {
          bright += 0.6 * (tt - (T_BLOOM - 0.12)) / 0.12; // the flash before the bloom
        }
        liData[o + 4] = m1;
        liData[o + 5] = m2;
        liData[o + 6] = alpha;
        liData[o + 7] = bright;
        liData[o + 8] = lift * (1 - 0.85 * sink);
        liData[o + 9] = ballR;
        // hints for whoever draws the fallen body (combat.js may honour them): 0..1 glow, metres of lift
        const gl = smooth(tt / T_LIFT);
        if (body && !t.swapped) { body.glow = gl; body.lift = lift; }
        const en = t.enemy;
        if (en) {
          if (en.gone || (en.body && en.body !== body)) t.enemy = null; // faded away, or the slot moved on
          else {
            // held every frame (combat lets hop fall and flash decay): the real body glows and floats,
            // and whitens as it shrinks into the ball
            en.hop = lift; en.hopV = 0;
            en.glow = Math.max(t.glow0, gl);
            if (isNum(en.flash)) en.flash = Math.max(en.flash, 0.28 * gl + 0.62 * m1);
            en.still = false;
          }
        }
      } else if (t.lit) {
        t.lit = false;
        liData[o + 6] = 0;
      }
      if (!t.swirled && tt >= T_LIFT) {
        t.swirled = true;
        // its bloom falls at 80 % of its length: started at 0.5 s that is exactly 1.9 s
        vfx("transformSwirl", t.x, t.y, t.z, (T_BLOOM - T_LIFT) / 0.8, 1.9);
      }
      if (!t.swapped && tt >= T_SWAP) {
        t.swapped = true;
        if (body && typeof body.transform === "function") body.transform();
      }
      if (!t.bloomed && tt >= T_BLOOM) {
        t.bloomed = true;
        t.ally = findAlly(t, fire(api.onTransform, body, t.x, t.z));
      }
      if (tt >= T_END + T_SITUP) {
        // the newborn has sat up: it chirps, hearts, and it joins
        if (!t.ally) t.ally = findAlly(t, null);
        const a = t.ally;
        // a combat.js newborn greets by itself when its own sit-up ends (chirp + hearts): wait for that
        // instead of greeting twice (never longer than 1.5 s)
        if (a && a.newborn === true && a.alive !== false && tt < T_END + T_SITUP + 1.5) { t.theirs = true; continue; }
        if (!t.theirs) {
          tmp.x = a && isNum(a.x) ? a.x : t.x;
          tmp.z = a && isNum(a.z) ? a.z : t.z;
          tmp.y = (a && isNum(a.y) ? a.y : t.y) + 0.42;
          sfx("tribeChirp", "greet", 1, panOf(tmp.x, tmp.z), 1.12);
          vfx("hearts", tmp, 3);
        }
        t.on = false;
        t.body = null;
        t.enemy = null;
        tfLive--;
        fire(api.onJoined, a);
        t.ally = null;
      }
    }
    liBuffer.needsUpdate = true;
    const want = anyLit || tfLive > 0;
    if (lightBodies.visible !== want) lightBodies.visible = want;
  }

  function clearTransforms() {
    for (let i = 0; i < MAX_TRANSFORMS; i++) {
      const t = tf[i];
      if (t.on && t.body && !t.swapped) {
        t.body.glow = 0; t.body.lift = 0;
        if (t.enemy && !t.enemy.gone) { t.enemy.hop = 0; t.enemy.hopV = 0; t.enemy.glow = t.glow0; t.enemy.still = false; }
      }
      t.enemy = null;
      t.on = false;
      t.body = null;
      t.ally = null;
      liData[i * LI_STRIDE + 6] = 0;
    }
    tfLive = 0;
    liBuffer.needsUpdate = true;
    lightBodies.visible = false;
  }

  // =================================================================================================
  // THE LIVING POTION
  // =================================================================================================
  const lGroup = new THREE.Group();
  lGroup.name = "living-potion";
  lGroup.visible = false;
  group.add(lGroup);
  const lBody = new THREE.Group(); // tips and rolls inside lGroup
  lGroup.add(lBody);

  function heartGeometry() {
    // an inflated heart: the classic curve in x/y, pillowed in z
    const NT = 44, NP = 10;
    const posA = new Float32Array((NT + 1) * (NP + 1) * 3);
    const idx = [];
    let v = 0;
    for (let j = 0; j <= NP; j++) {
      const ph = (j / NP - 0.5) * Math.PI;
      const c = Math.pow(Math.max(Math.cos(ph), 0), 0.62);
      for (let i = 0; i <= NT; i++) {
        const t = (i / NT) * TAU;
        const st = Math.sin(t);
        const hx = 16 * st * st * st;
        const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        posA[v++] = (hx / 16) * 0.135 * c;
        posA[v++] = ((hy + 2.5) / 14.5) * 0.125 * c;
        posA[v++] = 0.072 * Math.sin(ph);
      }
    }
    for (let j = 0; j < NP; j++) {
      for (let i = 0; i < NT; i++) {
        const a = j * (NT + 1) + i, b = a + NT + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(posA, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  const HEART_Y = 0.17; // centre of the heart above the foot
  const ROSEGOLD = [0.95, 0.66, 0.5];
  const livingGeo = merge([
    { geo: xf(heartGeometry(), 0, HEART_Y, 0), part: 0 },
    { geo: lathe([0.02, 0.215, 0.03, 0.225, 0.027, 0.28, 0.034, 0.296, 0.034, 0.304, 0.024, 0.306, 0, 0.306], 12), part: 0 },
    // foot: a little flared crystal stand under the point of the heart
    { geo: lathe([0, 0, 0.062, 0, 0.066, 0.008, 0.05, 0.02, 0.022, 0.034, 0.016, 0.06, 0, 0.06], 10), part: 2, color: ROSEGOLD },
    // stopper: a cut crystal on a gold collar
    { geo: xf(new THREE.IcosahedronGeometry(0.042, 0), 0, 0.352, 0, 1, 1.15, 1), part: 2, color: [1.0, 0.72, 0.7] },
    { geo: lathe([0, 0.3, 0.03, 0.3, 0.032, 0.316, 0.02, 0.322, 0, 0.322], 10), part: 2, color: ROSEGOLD },
    // the braided cord round the neck and down to the label
    { geo: xf(new THREE.TorusGeometry(0.033, 0.008, 6, 18), 0, 0.262, 0, 1, 1, 1, Math.PI / 2), part: 3, color: [0.62, 0.42, 0.22] },
    { geo: xf(new THREE.CylinderGeometry(0.004, 0.004, 0.085, 5), 0.062, 0.228, 0.04, 1, 1, 1, 0.35, 0, -0.75), part: 3, color: [0.62, 0.42, 0.22] },
  ]);
  const uLivingGlow = { value: 0.6 };
  const livingMat = solidMaterial(LIVING_FRAG, { uGlow: uLivingGlow });
  const bottle = new THREE.Mesh(livingGeo, livingMat);
  bottle.name = "living-bottle";
  bottle.castShadow = true;
  lBody.add(bottle);

  // the parchment label: drawn once
  function labelTexture() {
    const c = makeCanvas(512, 256);
    const g = c && c.getContext ? c.getContext("2d") : null;
    if (!g) return null;
    // parchment
    const grd = g.createLinearGradient(0, 0, 512, 256);
    grd.addColorStop(0, "#f1e2b8"); grd.addColorStop(0.5, "#ecd9a6"); grd.addColorStop(1, "#dcc48c");
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 256);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${90 + rnd() * 60 | 0},${60 + rnd() * 40 | 0},${20 + rnd() * 30 | 0},${0.03 + rnd() * 0.05})`;
      g.fillRect(rnd() * 512, rnd() * 256, 1 + rnd() * 3, 1 + rnd() * 2);
    }
    // worn edge
    g.strokeStyle = "rgba(110,72,30,0.55)";
    g.lineWidth = 10;
    g.strokeRect(5, 5, 502, 246);
    g.strokeStyle = "rgba(70,42,16,0.6)";
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i <= 40; i++) { const x = 18 + i * 11.9; const y = 18 + Math.sin(i * 1.7) * 2.5; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    g.beginPath();
    for (let i = 0; i <= 40; i++) { const x = 18 + i * 11.9; const y = 238 + Math.sin(i * 2.1 + 1) * 2.5; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    // the eyelet where the cord goes through
    g.fillStyle = "#6b4520";
    g.beginPath(); g.arc(34, 128, 13, 0, TAU); g.fill();
    g.fillStyle = "#2a1a0c";
    g.beginPath(); g.arc(34, 128, 7, 0, TAU); g.fill();
    // a hand-drawn heart: the picture the platypus understands
    function heart(cx, cy, s, fill) {
      g.beginPath();
      for (let i = 0; i <= 48; i++) {
        const t = (i / 48) * TAU;
        const st = Math.sin(t);
        const x = cx + 16 * st * st * st * s + Math.sin(i * 2.3) * 0.6;
        const y = cy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s + Math.cos(i * 1.9) * 0.6;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      g.lineWidth = 5; g.strokeStyle = "#5a1420"; g.lineJoin = "round"; g.stroke();
    }
    heart(108, 124, 2.7, "#c8324a");
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.beginPath(); g.ellipse(92, 104, 9, 5, -0.6, 0, TAU); g.fill();
    // LIVING POTION in hand-drawn capitals: each letter a touch crooked, inked twice
    g.textAlign = "center";
    g.textBaseline = "middle";
    function word(text, cx, cy, size, track) {
      g.font = `bold ${size}px "Segoe Print", "Bradley Hand", "Comic Sans MS", "Chalkboard SE", cursive`;
      const w = text.length * track;
      for (let i = 0; i < text.length; i++) {
        const x = cx - w / 2 + track * (i + 0.5) + (rnd() - 0.5) * 4;
        const y = cy + (rnd() - 0.5) * 7;
        g.save();
        g.translate(x, y);
        g.rotate((rnd() - 0.5) * 0.14);
        g.fillStyle = "rgba(60,30,12,0.35)";
        g.fillText(text[i], 2, 2);
        g.fillStyle = "#2b160a";
        g.fillText(text[i], 0, 0);
        g.lineWidth = 1.6; g.strokeStyle = "#2b160a";
        g.strokeText(text[i], 0, 0);
        g.restore();
      }
    }
    word("LIVING", 330, 86, 68, 52);
    word("POTION", 330, 170, 68, 52);
    // a flourish under the words
    g.strokeStyle = "#5a1420"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(196, 220);
    g.bezierCurveTo(260, 206, 300, 236, 330, 220);
    g.bezierCurveTo(360, 204, 410, 234, 468, 216);
    g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }
  const labelTex = labelTexture();
  const labelMat = new THREE.MeshStandardMaterial({
    map: labelTex, color: labelTex ? 0xffffff : 0xe9d7a4, roughness: 0.95, metalness: 0, side: THREE.DoubleSide,
    emissive: 0xffffff, emissiveMap: labelTex, emissiveIntensity: labelTex ? 0.32 : 0,
  });
  const labelPivot = new THREE.Group(); // hangs from the cord and sways
  labelPivot.position.set(0.078, 0.2, 0.052);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), labelMat);
  label.name = "living-label";
  label.position.set(0.085, -0.035, 0.012); // the eyelet end of the label sits at the pivot
  label.castShadow = false;
  labelPivot.rotation.set(0.12, -0.28, -0.2);
  labelPivot.add(label);
  lBody.add(labelPivot);

  const uHaloGlow = { value: 0.6 };
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { uTime, uGlow: uHaloGlow, uSize: { value: 0.5 }, uColor: { value: new THREE.Vector3(1.0, 0.55, 0.5) } },
    vertexShader: HALO_VERT,
    fragmentShader: HALO_FRAG,
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    blending: THREE.NormalBlending,
  }));
  halo.name = "living-halo";
  halo.frustumCulled = false;
  halo.position.set(0, HEART_Y, 0);
  halo.renderOrder = 4;
  lBody.add(halo);

  const pickProxy = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.56, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
  pickProxy.name = "living-pick";
  pickProxy.position.set(0, 0.2, 0);
  lGroup.add(pickProxy);

  const LG = { mode: "hidden", t: 0, vy: 0, vx: 0, vz: 0, bounces: 0, floor: 0, heading: 0, roll: 0, tilt: 0, speed: 0, glowT: 0.6, tumbleX: 0, tumbleZ: 0 };
  lBody.rotation.order = "YXZ";

  function livingHome() {
    if (lGroup.parent !== group) group.add(lGroup);
    lGroup.scale.setScalar(1);
    lGroup.rotation.set(0, 0, 0);
  }
  function livingPose(tilt, roll, heading) {
    // tilt: 0 upright .. PI/2 lying along the heading; roll: spin about the bottle's own axis
    lBody.rotation.set(tilt, heading, roll);
    lBody.position.y = 0.072 * Math.sin(Math.min(Math.abs(tilt), Math.PI / 2));
  }
  function livingSync() {
    living.x = lGroup.position.x; living.y = lGroup.position.y; living.z = lGroup.position.z;
  }

  const living = {
    group: lGroup,
    pick: pickProxy,
    x: 0,
    y: 0,
    z: 0,
    resting: false,
    held: false,
    glow: 0.6,
    onRest: null,
    // place(x, y, z) or place({ x, y, z }): standing upright, at rest. y omitted = the ground there.
    place(x, y, z) {
      if (x && typeof x === "object") { z = x.z; y = x.y; x = x.x; }
      livingHome();
      lGroup.position.set(x, isNum(y) ? y : groundAt(x, z), z);
      lGroup.visible = true;
      LG.mode = "rest";
      LG.heading = 0;
      livingPose(0, 0, 0);
      living.resting = true;
      living.held = false;
      livingSync();
      return living;
    },
    // drop(x, z, fromY = 2.2): falls from fromY above the ground, bounces twice, rolls a little way
    // (toward the player when they are near), tips upright and rests: audio.livingPotion, onRest().
    drop(x, z, fromY = 2.2) {
      if (x && typeof x === "object") { fromY = isNum(z) ? z : 2.2; z = x.z; x = x.x; }
      livingHome();
      LG.floor = groundAt(x, z);
      lGroup.position.set(x, LG.floor + Math.max(0.2, fromY), z);
      lGroup.visible = true;
      LG.mode = "fall";
      LG.t = 0;
      LG.vy = 0;
      LG.bounces = 0;
      const pl = ctx.player;
      let hx = 0.6, hz = 0.8;
      if (pl && isNum(pl.x)) {
        const dx = pl.x - x, dz = pl.z - z, dl = Math.hypot(dx, dz);
        if (dl > 0.8 && dl < 14) { hx = dx / dl; hz = dz / dl; }
      }
      LG.heading = Math.atan2(hx, hz);
      LG.vx = hx * 0.75; LG.vz = hz * 0.75;
      LG.tilt = 0.3;
      LG.roll = 0;
      LG.tumbleX = 5.5; LG.tumbleZ = 3.1;
      living.resting = false;
      living.held = false;
      livingSync();
      return living;
    },
    setGlow(v) {
      living.glow = LG.glowT = clamp(isNum(v) ? v : 0.6, 0, 1.5);
      return living;
    },
    // pickUp(anchor): the bottle sits in the paw (platypus.holdAnchor), small
    pickUp(anchor) {
      if (!anchor) return living;
      anchor.add(lGroup);
      lGroup.position.set(0, -0.05, 0.02);
      lGroup.rotation.set(0.2, 0, 0.12);
      lGroup.scale.setScalar(0.5);
      lGroup.visible = true;
      LG.mode = "held";
      livingPose(0, 0, 0);
      living.resting = false;
      living.held = true;
      return living;
    },
    hide() {
      livingHome();
      lGroup.visible = false;
      LG.mode = "hidden";
      living.resting = false;
      living.held = false;
      return living;
    },
  };

  function updateLiving(dt) {
    if (LG.mode === "hidden") return;
    // the light inside breathes; the label sways on its cord
    const k = 1 - Math.exp(-dt * 3);
    uLivingGlow.value += (LG.glowT - uLivingGlow.value) * k;
    uHaloGlow.value = uLivingGlow.value * (LG.mode === "held" ? 0.45 : 0.75);
    const sway = LG.mode === "fall" || LG.mode === "roll" ? 0.5 : 0.07;
    labelPivot.rotation.z = -0.2 + Math.sin(clock * 1.9) * sway;
    labelPivot.rotation.x = 0.12 + Math.sin(clock * 1.3 + 1) * sway * 0.6;
    if (LG.mode === "fall") {
      LG.t += dt;
      LG.vy -= 13 * dt;
      lGroup.position.y += LG.vy * dt;
      lGroup.position.x += LG.vx * dt;
      lGroup.position.z += LG.vz * dt;
      LG.tilt += LG.tumbleX * dt;
      LG.roll += LG.tumbleZ * dt;
      livingPose(LG.tilt, LG.roll, LG.heading);
      lBody.position.y = 0.08;
      const fl = groundAt(lGroup.position.x, lGroup.position.z);
      if (lGroup.position.y <= fl && LG.vy < 0) {
        lGroup.position.y = fl;
        LG.bounces++;
        const hit = Math.min(1, -LG.vy / 7);
        vfx("dust", lGroup.position.x, fl, lGroup.position.z, 0.25 + 0.4 * hit);
        tmp.x = lGroup.position.x; tmp.y = fl + 0.12; tmp.z = lGroup.position.z;
        vfx("sparkle", tmp, 0xffb0b4, 5 + Math.round(6 * hit));
        if (LG.bounces >= 2) {
          // second touch-down: it stays down and rolls
          LG.mode = "roll";
          LG.t = 0;
          LG.speed = 1.15;
          // settle onto its side: fold the tumble to the nearest lying pose
          LG.tilt = Math.PI / 2;
        } else {
          LG.vy = -LG.vy * 0.42;
          LG.tumbleX *= 0.55; LG.tumbleZ *= 0.6;
        }
      }
    } else if (LG.mode === "roll") {
      LG.t += dt;
      LG.speed = Math.max(0, LG.speed - 1.25 * dt);
      const hx = Math.sin(LG.heading), hz = Math.cos(LG.heading);
      // it rolls sideways: the lying bottle's long axis is across the direction of travel
      lGroup.position.x += hx * LG.speed * dt;
      lGroup.position.z += hz * LG.speed * dt;
      lGroup.position.y = groundAt(lGroup.position.x, lGroup.position.z);
      LG.roll += (LG.speed / 0.075) * dt;
      livingPose(LG.tilt, LG.roll, LG.heading + Math.PI / 2);
      if (LG.speed <= 0.02) {
        LG.mode = "rise";
        LG.t = 0;
        // finish the turn so the label ends up facing the way it rolled (toward the player)
        LG.roll = LG.roll % TAU;
      }
    } else if (LG.mode === "rise") {
      LG.t += dt;
      const u = clamp(LG.t / 0.7, 0, 1);
      const e = smooth(u);
      // tips upright with a little wobble that dies away
      const wob = Math.sin(u * 14) * 0.16 * (1 - u) * (1 - u);
      const roll = LG.roll > Math.PI ? lerp(LG.roll, TAU, e) : lerp(LG.roll, 0, e);
      livingPose((Math.PI / 2) * (1 - e) + wob, roll, lerp(LG.heading + Math.PI / 2, LG.heading, e));
      if (u >= 1) {
        LG.mode = "rest";
        livingPose(0, 0, LG.heading);
        living.resting = true;
        livingSync();
        sfx("livingPotion");
        tmp.x = lGroup.position.x; tmp.y = lGroup.position.y + 0.2; tmp.z = lGroup.position.z;
        vfx("sparkle", tmp, 0xffc0b8, 14);
        vfx("ring", tmp.x, tmp.z, 0xffb0a8, lGroup.position.y + 0.05);
        fire(living.onRest);
      }
    }
    if (LG.mode !== "held") livingSync();
  }

  // =================================================================================================
  // module
  // =================================================================================================
  function setWorld(w) {
    world = w || null;
  }

  function update(dt, time) {
    clock += dt;
    uTime.value = clock;
    trackSun(dt);
    updateFlasks(dt);
    updateIngredients(dt);
    updateCauldron(dt);
    updateTransforms(dt);
    updateLiving(dt);
  }

  // reset(): the freshly-built state; everything transient hidden; callbacks (and `bodies` /
  // `allies`, which are wiring) left as they are.
  function reset() {
    clearPickups();
    for (let i = 0; i < MAX_FLYING; i++) {
      if (fly[i].on) { fly[i].on = false; flasksLive--; }
      flasks.setMatrixAt(MAX_PICKUPS + i, ZERO_M);
    }
    flasksLive = 0;
    flasks.instanceMatrix.needsUpdate = true;
    flasksDirty = false;
    flasks.visible = false;
    holdFlask(false);
    ingredients.clear();
    ingMesh.instanceMatrix.needsUpdate = true;
    ingDirty = false;
    ingMesh.visible = false;
    cauldron.show(false);
    cauldron.reset();
    clearTransforms();
    living.hide();
    living.setGlow(0.6);
    uLivingGlow.value = 0.6;
  }

  const api = {
    group,
    setWorld,
    update,
    reset,
    // pickups
    spawn,
    nearest,
    pos,
    collect,
    active,
    clear: clearPickups,
    autoCollect: true,
    onCollect: null,     // (id)
    get count() {        // flasks lying about (level 11 keeps at most 3 out)
      let n = 0;
      for (let i = 0; i < MAX_PICKUPS; i++) if (pk[i].on) n++;
      return n;
    },
    // brewing
    ingredients,
    cauldron,
    // the throw
    throw: throwFlask,
    holdFlask,
    bodies: null,        // set it: potions.bodies = combat.bodies
    allies: null,        // optional: potions.allies = combat.allies (finds the newborn for onJoined)
    splash: 1.6,
    onSplash: null,      // (x, z, bodiesHit (a count), bodies (the array, reused))
    onMiss: null,        // (x, z)
    // the transformation
    transform,
    onTransform: null,   // (body, x, z) at the bloom; may RETURN the ally made by combat.addAlly
    onJoined: null,      // (ally | null) when the newborn has sat up
    get transforming() {
      return tfLive;
    },
    TRANSFORM_SECONDS: T_END,
    SITUP_SECONDS: T_SITUP,
    // the LIVING POTION
    living,
  };
  return api;
}
