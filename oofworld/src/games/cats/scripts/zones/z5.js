/*
	Zone 5: The nil Void   OWNER: zone 5 agent   (cats 58..71)
	Black space, floating islands with neon rims, invisible paths, fake walls, things visible from one spot.

	MAP (zone-local; x east, z south, ground top y = 0; void kill floor at y -60)
	  Spawn Island (x -195..-150)  -> bridge east -> NULL PLAZA (x -110..-30, z -40..40)
	  Null Plaza: north = invisible path to the nil island (58) -> bridge west -> Eye island (61)
	              south = 404 compound (59) -> bridge west -> Sound island (62)
	              west  = Cat.exe dialog (60);  centre = Void Core terminal + caged cat (63)
	  -> bridge east -> Crossroads (x -10..30) -> north: CAPITOL ISLE (64-69) / south: THE FUNHOUSE (70-71)

	SOLUTIONS (every clue is in the zone):
	  58 nil (plain). The path north of Null Plaza is made of invisible tiles. Their neon "shadows" float
	     14 studs below. Walk where the shadows are (route: N, E, E, N, N, W x4, N, N, E, E, N, N, E x3,
	     N x4) to reach the nil island.
	  59 404 Cat Not Found (plain). The compound has three nested walls and no doors. In each ring exactly
	     one wall section has a BLINKING top strip, and you can walk through it: outer ring = east side,
	     south section; middle ring = west side, north section; inner ring = south side, middle section.
	  60 Cat.exe (locked). Six crash-log panels "[23:59:0X] user pressed ..." are scattered: spawn island,
	     the nil island, inside the 404 outer corridor, Crossroads, the Sound island and the Eye island.
	     Sorted by timestamp: RETRY, RETRY, IGNORE, OK, CANCEL, OK. Press the dialog buttons in that order.
	     The result is only checked after 6 presses; a wrong sequence means a 6 s lockout.
	  61 Mr. Transparency (hidden). On the Eye island (reached over the nil island), stand on the pupil of
	     the floor eye, zoom the camera ALL the way in and look north (a little up, over your own head).
	     The floating neon bits line up into the digits 7310. Type 7310 into the Eye terminal; the hidden
	     cat appears. Wrong code = 10 s lockout.
	     (OofWorld port: the camera has no first person - its closest zoom is 4 studs behind the head - so
	     the digits are projected for THAT eye point, 40 degrees above the horizon so the avatar's own head
	     never covers them. Zooming out slides the camera along the line of sight, so on the pupil they
	     still roughly line up; a few steps off the pupil they scramble.)
	  62 Meow.wav (hidden). On the Sound island, click the speaker to hear a 5-note melody. Each of the
	     5 orbs plays one note. Orb pitches (orb 1 = the one nearest the speaker side, going around):
	     1.25, 0.8, 1.6, 1.0, 2.0. The melody is 1.0, 1.6, 0.8, 2.0, 1.25 = orbs 4, 3, 2, 5, 1. Click the
	     orbs in the order of the melody. The answer is checked after 5 clicks; wrong = 5 s lockout.
	  63 Absolutely Nothing (locked). Seven char[i] labels: [1]=N floor tile on the nil island,
	     [2]=O floor tile in the 404 middle corridor, [3]=T plate on the back of the Cat.exe dialog,
	     [4]=H floor tile on the Eye island, [5]=I plate on the back of the Sound speaker, [6]=N plate
	     beside the invisible path, [7]=G floor tile in the south-west corner of Spawn Island.
	     Type NOTHING at the Void Core terminal. Wrong = 15 s lockout.
	  64 Secret Service Cat (hidden). Six agents stand on the red carpet. The dossier: GREY fur, RED tie,
	     earpiece in its OWN LEFT ear (viewer's right), CURLY tail. Counting from the west (dossier) end:
	     1 has its earpiece in its own right ear, 2 is black, 3 has a normal tail, 4 has a blue tie, 5 matches every point, 6 has a
	     blue tie, right ear and puffy tail. Click agent 5. Wrong agent = 10 s lockout.
	  65 Mr. Speechpaws (locked). The teleprompter shows the first letters and lengths of each word. Click the
	     11 floating words in the order MY FELLOW CATS THE ONLY THING TO FEAR IS THE VACUUM (either THE
	     block works for either THE). It is checked after 11 words; wrong = 4 s lockout. (Port: each word
     also has a glowing floor mark under it; standing on it gives an [E] "Say" prompt.)
	  66 Ballot Box Cat (locked). Valid ballots (red X = spoiled): CATNIP 11-2 = 9, LASER 16-2 = 14,
	     NAP 13-1 = 12. Enter 091412 at the Election Office. Wrong = 15 s lockout.
	  67 Classified Cat (locked). Oval-ish office: the desk memo gives the safe combination as stars on the
	     flag (7), socks on the floor (5; the sock hanging on the flagpole is not on the floor), pens on the
	     desk (3), fish in the bowl (4). The north-wall portrait is a fake wall; walk through it to the safe.
	     Enter 7534. Wrong = 15 s lockout.
	  68 Mittens The Honest (locked). Knights-and-knaves debate, vote on stages 1, 2, 3 in order:
	     Stage 1: Mittens (middle). Stage 2: Pickles (east). Stage 3: Clawdia (west). The votes are only
	     checked after the third; a wrong set means back to stage 1 and a 20 s lockout.
	  69 The Cat-In-Chief (locked). Tuna Football code = words in the speech (11) + valid votes of the
	     winning party (LASER 14) + last digit of the safe (4) = 11144. Wrong = 20 s lockout.
	  70 Do Not Press Cat (locked). The red button teleports away whenever you are within 12 studs and
	     FACING it. Walk backwards into it (shift-lock, then hold back) or - on a phone, where there is no
	     shift-lock - circle in sideways so it never sees your face, and step on it while not facing it.
	     That unlocks the cage in the arena centre.
	  71 ROFL Cat (plain). In the Laughing Maze, go through the doorway with exactly one more
	     uppercase HA than the previous one (the entrance = HA, lowercase ha = 0). Room 1: east (HAHA),
	     room 2: west (HAHAHA), room 3: middle (HA ha HA HA HA), room 4: east (HA HA HA HA HA),
	     room 5: west (HAHAHA HAHAHA). In room 6 no doorway has 7. The east-wall graffiti
	     "HAHAHAHAHAHAHA" (7) is a fake wall into the final room with the cat. A wrong doorway's floor is
	     fake (looks the same, not solid), so you fall onto the kill slab and respawn.

	PHYSICS (ARCHITECTURE §5: gravity 196.2, jump 50, walk 16): a jump rises 50^2 / (2 * 196.2) = 6.37
	studs and covers about 8.2 studs flat. Nothing here needs more: stages are 0.75 - 1.5 high, every
	wall that must stop you is >= 10 high, and the maze's wrong lanes are dead-end pockets (a jump over a
	5-stud fake floor lands against the next room's solid near wall and drops you into the pit).

	PERF: decoration that never moves or collides is merged into catkit groups (one draw call per
	group); colliding and clickable things are zone parts. Purely decorative animation (bobbing notes,
	spinning crystals, the orbiting error popups) moves those groups from one heartbeat.
*/

// ---------------------------------------------------------------------------------------------- palette
const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const C = (r, g, b) => "#" + hex2(r) + hex2(g) + hex2(b);

const VOID = C(8, 8, 14);
const VOID2 = C(18, 14, 30);
const PURPLE = C(150, 60, 255);
const CYAN = C(0, 230, 255);
const PINK = C(255, 0, 170);
const GOLD = C(255, 200, 60);
const NAVY = C(16, 22, 58);
const GREEN = C(0, 255, 120);
const RED = C(255, 40, 60);
const WHITE = C(240, 240, 250);
const SIGN_BG = C(10, 10, 20);
const SIGN_TEXT = C(225, 220, 255);
const PAPER = C(255, 235, 170);
const VOID_PURPLE = PURPLE;

// ---------------------------------------------------------------------------------------------- looks
const looks = {};

// 58 nil
looks[58] = (K) => {
  const V = K.v;
  const m = K.model("nil");
  const col = VOID_PURPLE;
  const th = 0.9;
  const bar = (size, at) => K.block(m, size, at, col, { neon: true, name: "Letter" });
  // n (left, viewer's left = -X)
  bar(V(th, 3, th), V(-3.6, 1.5, 0));
  bar(V(th, 2.4, th), V(-1.6, 1.2, 0));
  bar(V(2.9, th, th), V(-2.6, 2.75, 0));
  K.ball(m, V(1.1, 1.1, th), V(-1.75, 2.55, 0), col, { neon: true, name: "Letter" });
  // i (centre): the stem, and the dot is the cat's head
  const body = bar(V(th * 1.1, 3, th * 1.1), V(0.2, 1.5, 0));
  body.name = "Body";
  const hc = V(0.2, 4.55, 0);
  K.ball(m, 1.9, hc, K.C.black, { name: "Head" });
  for (const side of [-1, 1]) {
    K.wedge(m, V(0.25, 0.8, 0.45), K.mul(K.cf(K.add(hc, V(side * 0.42, 0.95, 0))), K.angles(0, side * Math.PI / 2, 0)), K.C.black, { name: "Ear" });
    K.ball(m, V(0.45, 0.5, 0.25), K.add(hc, V(side * 0.4, 0.15, -0.78)), col, { neon: true, name: "Eye" });
    K.block(m, V(0.7, 0.05, 0.05), K.mul(K.cf(K.add(hc, V(side * 0.85, -0.25, -0.7))), K.angles(0, 0, side * K.rad(8))), K.C.white, { name: "Whisker" });
  }
  K.ball(m, V(0.25, 0.18, 0.2), K.add(hc, V(0, -0.15, -0.92)), K.C.pink, { name: "Nose" });
  // l (right)
  bar(V(th, 5, th), V(2.2, 2.5, 0));
  bar(V(1.3, th * 0.8, th), V(2.75, 0.36, 0));
  // paws under the letters
  for (const x of [-3.6, -1.6, 0.2, 2.2]) {
    K.ball(m, V(0.7, 0.4, 0.9), V(x, 0.1, -0.25), K.C.black, { name: "Paw" });
  }
  // tail curling off the l
  K.limb(m, V(2.6, 3.5, 0.3), V(3.6, 4.4, 0.4), 0.35, K.C.black, { name: "Tail" });
  K.limb(m, V(3.6, 4.4, 0.4), V(3.9, 5.4, 0.4), 0.35, K.C.black, { name: "Tail" });
  return K.finish(m, { fit: 8 });
};

// 59 404 Cat Not Found
looks[59] = (K) => {
  const V = K.v;
  const pink = K.rgb(255, 0, 220);
  const c = K.cat({ bodyShape: "cube", color: pink, eyes: "x", mouth: "o", tail: "none", whiskers: false, noseColor: K.C.black });
  const b = c.attach("body");
  const bs = c.bodySize;
  // checkerboard squares
  for (const q of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    K.block(c.model, V(bs.x * 0.52, bs.y * 0.52, bs.z * 0.52), K.mul(b, K.cf(q[0] * bs.x * 0.25, q[1] * bs.y * 0.25, q[0] * q[1] * bs.z * 0.25)), K.C.black, { name: "Checker" });
  }
  const h = c.attach("head");
  const hd = c.headD;
  K.block(c.model, V(hd * 0.52, hd * 0.52, hd * 1.02), K.mul(h, K.cf(hd * 0.25, hd * 0.25, 0)), K.C.black, { name: "Checker" });
  K.block(c.model, V(hd * 0.52, hd * 0.52, hd * 1.02), K.mul(h, K.cf(-hd * 0.25, -hd * 0.25, 0.01)), K.C.black, { name: "Checker" });
  // floating question mark
  const q = c.attach("headTop", V(0, 1.3, 0));
  const qc = K.rgb(255, 255, 255);
  K.block(c.model, V(1.4, 0.35, 0.35), K.mul(q, K.cf(0, 1.0, 0)), qc, { neon: true, name: "Question" });
  K.block(c.model, V(0.35, 0.9, 0.35), K.mul(q, K.cf(-0.55, 0.6, 0)), qc, { neon: true, name: "Question" });
  K.block(c.model, V(0.8, 0.35, 0.35), K.mul(q, K.cf(-0.2, 0.2, 0)), qc, { neon: true, name: "Question" });
  K.block(c.model, V(0.35, 0.6, 0.35), K.mul(q, K.cf(0.05, -0.2, 0)), qc, { neon: true, name: "Question" });
  K.block(c.model, V(0.38, 0.38, 0.38), K.mul(q, K.cf(0.05, -0.85, 0)), qc, { neon: true, name: "Question" });
  return K.finish(c.model);
};

// 60 Cat.exe (Not Responding)
looks[60] = (K) => {
  const V = K.v;
  const c = K.cat({ color: K.C.orange, pattern: "stripes", color2: K.C.ginger, eyes: "derp", mouth: "o", tail: "normal" });
  const b = c.attach("body");
  // frozen mid-step: one paw stuck in the air, ice-blue "lag" afterimage outline behind it
  K.ball(c.model, V(0.7, 0.5, 0.8), c.attach("frontLeftPaw", V(0, 1.1, -0.5)), K.C.orange, { name: "RaisedPaw" });
  const bs = c.bodySize;
  const lag = K.rgb(120, 200, 255);
  K.block(c.model, V(bs.x + 0.3, bs.y + 0.3, 0.12), K.mul(b, K.cf(0.45, 0.25, bs.z / 2 + 0.6)), lag, { name: "LagGhost", transparency: 0.6 });
  K.block(c.model, V(bs.x + 0.3, bs.y + 0.3, 0.12), K.mul(b, K.cf(0.9, 0.5, bs.z / 2 + 1.1)), lag, { name: "LagGhost", transparency: 0.8 });
  // hourglass "busy" cursor frozen above its head (it never flips)
  const top = c.attach("headTop", V(0, 1.2, 0));
  const glass = K.rgb(200, 230, 255), sand = K.rgb(255, 200, 80), wood = K.rgb(120, 80, 40);
  K.block(c.model, V(1.1, 0.15, 1.1), K.mul(top, K.cf(0, 0.85, 0)), wood, { name: "GlassCap" });
  K.block(c.model, V(1.1, 0.15, 1.1), K.mul(top, K.cf(0, -0.85, 0)), wood, { name: "GlassCap" });
  K.ball(c.model, V(0.8, 0.75, 0.8), K.mul(top, K.cf(0, 0.42, 0)), glass, { name: "Glass", transparency: 0.55 });
  K.ball(c.model, V(0.8, 0.75, 0.8), K.mul(top, K.cf(0, -0.42, 0)), glass, { name: "Glass", transparency: 0.55 });
  K.ball(c.model, V(0.5, 0.35, 0.5), K.mul(top, K.cf(0, -0.55, 0)), sand, { name: "Sand", neon: true });
  K.ball(c.model, V(0.14, 0.14, 0.14), K.mul(top, K.cf(0, 0.6, 0)), sand, { name: "Sand", neon: true });
  for (const x of [-0.5, 0.5]) {
    K.block(c.model, V(0.08, 1.7, 0.08), K.mul(top, K.cf(x, 0, 0)), wood, { name: "GlassPost" });
  }
  // a third, fainter window-drag copy smeared further behind it
  K.block(c.model, V(bs.x + 0.3, bs.y + 0.3, 0.12), K.mul(b, K.cf(1.35, 0.75, bs.z / 2 + 1.6)), lag, { name: "LagGhost", transparency: 0.9 });
  return K.finish(c.model);
};

// 61 Mr. Transparency
looks[61] = (K) => {
  const c = K.cat({ color: K.rgb(190, 235, 255), material: "Glass", eyes: "big", mouth: "smile", eyeColor: K.rgb(0, 140, 255), whiskers: true });
  const FUR = new Set(["Body", "Head", "Ear", "Leg", "Tail", "Paw", "InnerEar"]);
  for (const p of K.baseParts(c.model)) if (FUR.has(p.name)) p.transparency = 0.78;
  K.acc.tophat(c, { color: K.C.black, band: K.rgb(150, 60, 255) });
  K.acc.bowtie(c, { color: K.rgb(150, 60, 255) });
  K.acc.sunglasses(c);
  return K.finish(c.model);
};

// 62 Meow.wav
looks[62] = (K) => {
  const V = K.v;
  const c = K.cat({ bodyShape: "round", color: K.rgb(45, 45, 60), eyes: "closed", mouth: "o", tail: "curly", noseColor: K.rgb(0, 255, 160) });
  const h = c.attach("head");
  const r = c.headD / 2;
  // headphones
  for (const side of [-1, 1]) {
    K.cyl(c.model, 0.45, 1.0, K.mul(h, K.cf(side * (r + 0.15), 0, 0), K.angles(0, 0, Math.PI / 2)), K.rgb(255, 60, 120), { name: "EarCup" });
  }
  const p0 = K.p(K.mul(h, K.cf(-r - 0.15, 0.4, 0)));
  const p1 = K.p(K.mul(h, K.cf(0, r + 0.55, 0)));
  const p2 = K.p(K.mul(h, K.cf(r + 0.15, 0.4, 0)));
  K.limb(c.model, p0, p1, 0.22, K.rgb(30, 30, 30), { name: "Band" });
  K.limb(c.model, p1, p2, 0.22, K.rgb(30, 30, 30), { name: "Band" });
  // equalizer bars on the back
  const back = c.attach("back");
  const heights = [1.0, 2.2, 1.6, 2.8, 1.2];
  const cols = [K.rgb(0, 255, 120), K.rgb(0, 220, 255), K.rgb(120, 120, 255), K.rgb(255, 80, 220), K.rgb(255, 220, 0)];
  heights.forEach((hh, i0) => {
    const x = (i0 - 2) * 0.5;
    K.block(c.model, V(0.35, hh, 0.35), K.mul(back, K.cf(x, hh / 2 - 0.2, 0.3)), cols[i0], { neon: true, name: "EQ" });
  });
  return K.finish(c.model);
};

// 63 Absolutely Nothing
looks[63] = (K) => {
  const V = K.v;
  const c = K.cat({ color: K.rgb(4, 4, 8), eyes: "big", eyeWhite: K.rgb(220, 200, 255), eyeColor: K.rgb(4, 4, 8), mouth: "none", tail: "long", innerEars: false, whiskerColor: K.rgb(80, 40, 140), noseColor: K.rgb(4, 4, 8) });
  const b = c.attach("body");
  for (let i = 0; i <= 9; i++) {
    const a = i / 10 * Math.PI * 2;
    K.block(c.model, V(0.9, 0.12, 0.25), K.mul(b, K.angles(K.rad(15), 0, 0), K.cf(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6), K.angles(0, -a + Math.PI / 2, 0)), VOID_PURPLE, { neon: true, name: "VoidRing" });
  }
  return K.finish(c.model);
};

// The Secret Service suit, shared by the real cat (64) and the five cardboard decoys on the carpet.
// ear = model-local X side of the earpiece: the cat faces -Z, so -X is its OWN LEFT (viewer's right).
function agentModel(K, a) {
  const V = K.v;
  const c = K.cat({ color: a.color, pattern: "tuxedo", color2: K.C.white, eyes: "angry", mouth: "frown", tail: a.tail, whiskers: a.whiskers !== false, innerEars: a.innerEars !== false });
  K.acc.sunglasses(c);
  const neck = c.attach("neck");
  K.block(c.model, V(0.3, 0.25, 0.2), K.mul(neck, K.cf(0, -0.05, -0.3)), a.tie, { name: "TieKnot" });
  if (a.wedgeTie) {
    K.wedge(c.model, V(0.35, 0.9, 0.12), K.mul(neck, K.cf(0, -0.65, -0.42), K.angles(0, 0, Math.PI), K.angles(0, Math.PI / 2, 0)), a.tie, { name: "Tie" });
  } else {
    K.block(c.model, V(0.32, 0.9, 0.12), K.mul(neck, K.cf(0, -0.6, -0.42)), a.tie, { name: "Tie" });
  }
  const h = c.attach("head");
  const ear = K.mul(h, K.cf(a.ear * c.headD * 0.5, -0.05, 0.05));
  K.ball(c.model, 0.3, ear, K.C.white, { name: "Earpiece" });
  K.limb(c.model, K.p(ear), K.p(K.mul(h, K.cf(a.ear * c.headD * 0.3, -c.headD * 0.6, 0.3))), 0.08, K.C.white, { name: "Wire" });
  return c;
}

// 64 Secret Service Cat
looks[64] = (K) => {
  const c = agentModel(K, { color: K.C.grey, tie: K.C.red, ear: -1, tail: "curly", wedgeTie: true });
  return K.finish(c.model);
};

// 65 The Honorable Mr. Speechpaws
looks[65] = (K) => {
  const V = K.v;
  const c = K.cat({ bodyShape: "tall", color: K.C.cream, pattern: "tuxedo", color2: K.rgb(30, 50, 120), eyes: "normal", mouth: "o", tail: "normal" });
  K.acc.bowtie(c, { color: K.C.red });
  const f = c.attach("feet");
  const pod = K.mul(f, K.cf(0, 1.6, -1.6));
  K.block(c.model, V(2.6, 3.2, 1.2), pod, K.rgb(120, 75, 40), { name: "Podium" });
  K.block(c.model, V(3.0, 0.25, 1.6), K.mul(pod, K.cf(0, 1.7, 0)), K.rgb(90, 55, 30), { name: "PodiumTop" });
  K.cyl(c.model, 0.12, 1.3, K.mul(pod, K.cf(0, 0.2, -0.62), K.angles(K.rad(90), 0, 0)), K.rgb(255, 210, 60), { name: "Seal", neon: true });
  const mic0 = K.p(K.mul(pod, K.cf(0.4, 1.8, -0.2)));
  const mic1 = K.add(mic0, V(-0.1, 1.0, -0.3));
  K.limb(c.model, mic0, mic1, 0.1, K.C.black, { name: "MicStand" });
  K.ball(c.model, 0.35, mic1, K.C.dark, { name: "Mic" });
  return K.finish(c.model);
};

// 66 Ballot Box Cat
looks[66] = (K) => {
  const V = K.v;
  const c = K.cat({ color: K.C.white, pattern: "calico", color2: K.C.orange, color3: K.C.black, eyes: "big", mouth: "w", tail: "puffy" });
  K.acc.box(c, { color: K.rgb(245, 245, 250) });
  const bp = K.p(c.attach("body"));
  const bs = c.bodySize;
  K.block(c.model, V(bs.x + 0.75, 0.45, bs.z + 0.75), K.cf(bp.x, 0.75, bp.z), K.rgb(40, 70, 200), { name: "BoxBand" });
  K.ball(c.model, V(0.7, 0.7, 0.12), c.attach("chest", V(0.35, 0.3, -0.1)), K.C.red, { name: "Sticker", neon: true });
  return K.finish(c.model);
};

// 67 Classified Cat
looks[67] = (K) => {
  const V = K.v;
  const c = K.cat({ bodyShape: "flat", color: K.C.grey, pattern: "stripes", color2: K.C.dark, eyes: "normal", mouth: "smile", tail: "normal" });
  const f = c.attach("feet");
  const folder = K.rgb(225, 190, 120);
  K.block(c.model, V(4.6, 0.12, 5.6), K.mul(f, K.cf(0, -0.08, -0.2)), folder, { name: "Folder" });
  K.block(c.model, V(4.6, 0.12, 5.6), K.mul(f, K.cf(0, 1.55, 2.4), K.angles(K.rad(-65), 0, 0)), folder, { name: "FolderFlap" });
  K.block(c.model, V(4.7, 0.16, 0.6), K.mul(f, K.cf(0, 1.55, 2.38), K.angles(K.rad(-65), 0, 0), K.cf(0, -0.05, 0)), K.C.red, { name: "ClassifiedStripe", neon: true });
  K.limb(c.model, K.p(K.mul(f, K.cf(-1.9, 0.1, -2.6))), K.p(K.mul(f, K.cf(-1.9, 0.1, -1.6))), 0.12, K.C.silver, { name: "Clip" });
  K.block(c.model, V(c.headD * 0.95, c.headD * 0.22, 0.15), c.attach("eyes", V(0, 0, -0.1)), K.rgb(5, 5, 5), { name: "Redacted" });
  return K.finish(c.model);
};

// 68 Mittens The Honest
looks[68] = (K) => {
  const V = K.v;
  const c = K.cat({ color: K.C.white, pattern: "spots", color2: K.rgb(255, 190, 200), eyes: "big", mouth: "smile", tail: "normal", eyeColor: K.rgb(40, 120, 255) });
  K.acc.halo(c);
  for (const name of ["frontLeftPaw", "frontRightPaw"]) {
    K.ball(c.model, V(0.85, 0.75, 0.95), c.attach(name, V(0, 0.2, -0.1)), K.C.red, { name: "Mitten" });
  }
  const pin = c.attach("chest", V(-0.3, 0.4, -0.05));
  K.block(c.model, V(0.5, 0.32, 0.08), pin, K.C.red, { name: "Pin" });
  K.block(c.model, V(0.22, 0.17, 0.1), K.mul(pin, K.cf(-0.13, 0.07, -0.01)), K.rgb(30, 60, 160), { name: "Pin" });
  return K.finish(c.model);
};

// 69 The Cat-In-Chief
looks[69] = (K) => {
  const V = K.v;
  const c = K.cat({ bodyShape: "round", color: K.rgb(255, 235, 200), pattern: "spots", color2: K.C.ginger, eyes: "normal", mouth: "smile", tail: "puffy" });
  K.acc.sunglasses(c);
  K.acc.cape(c, { color: K.rgb(25, 45, 120), collar: K.C.gold });
  const b = c.attach("body");
  const bs = c.bodySize;
  K.block(c.model, V(0.5, bs.y * 1.02, bs.z * 1.02), K.mul(b, K.angles(0, 0, K.rad(35))), K.C.red, { name: "Sash" });
  K.cyl(c.model, 0.12, 0.7, K.mul(c.attach("chest", V(0.4, 0.4, -0.1)), K.angles(K.rad(90), 0, 0)), K.C.gold, { name: "Medal", neon: true });
  // little flag held at its side
  const s = c.attach("side");
  K.cyl(c.model, 3.2, 0.12, K.mul(s, K.cf(-0.2, 1.0, 0)), K.C.silver, { name: "FlagPole" });
  for (let i = 0; i <= 3; i++) {
    K.block(c.model, V(0.08, 0.28, 1.6), K.mul(s, K.cf(-0.2, 2.15 + i * 0.28, 0.85)), i % 2 === 0 ? K.C.red : K.C.white, { name: "FlagStripe" });
  }
  K.block(c.model, V(0.1, 0.56, 0.6), K.mul(s, K.cf(-0.2, 2.85, 0.35)), K.rgb(30, 60, 160), { name: "FlagCanton" });
  return K.finish(c.model);
};

// 70 Do Not Press Cat
looks[70] = (K) => {
  const V = K.v;
  const m = K.model("DoNotPress");
  const red = K.rgb(235, 20, 30);
  K.cyl(m, 1.0, 5.2, K.cf(0, 0.5, 0), K.rgb(40, 40, 45), { name: "Base" });
  K.cyl(m, 0.3, 5.5, K.cf(0, 1.05, 0), K.C.yellow, { name: "Rim" });
  K.ball(m, V(4.4, 2.8, 4.4), V(0, 1.4, 0), red, { name: "Body" });
  const hc = V(0, 2.2, 0);
  for (const side of [-1, 1]) {
    K.wedge(m, V(0.3, 1.0, 0.6), K.mul(K.cf(side * 1.1, 2.95, -0.2), K.angles(0, side * Math.PI / 2, side * K.rad(-15))), red, { name: "Ear" });
    K.ball(m, V(0.55, 0.65, 0.3), K.add(hc, V(side * 0.6, 0.1, -1.55)), K.C.white, { name: "EyeWhite" });
    K.ball(m, V(0.28, 0.34, 0.2), K.add(hc, V(side * 0.55, 0.15, -1.68)), K.C.black, { name: "Pupil" });
    K.block(m, V(1.1, 0.06, 0.06), K.mul(K.cf(K.add(hc, V(side * 1.5, -0.4, -1.3))), K.angles(0, side * K.rad(-15), side * K.rad(6))), K.C.white, { name: "Whisker" });
    K.ball(m, V(0.7, 0.4, 0.9), V(side * 1.3, 0.2, -2.4), red, { name: "Paw" });
  }
  K.ball(m, V(0.3, 0.2, 0.2), K.add(hc, V(0, -0.25, -1.72)), K.C.pink, { name: "Nose" });
  K.ball(m, V(0.9, 0.45, 0.2), K.add(hc, V(0, -0.65, -1.55)), K.rgb(60, 0, 0), { name: "Mouth" });
  K.limb(m, V(0, 1.2, 2.2), V(0.4, 2.4, 3.0), 0.4, red, { name: "Tail" });
  K.limb(m, V(0.4, 2.4, 3.0), V(0.2, 3.4, 2.7), 0.4, red, { name: "Tail" });
  return K.finish(m);
};

// 71 ROFL Cat
looks[71] = (K) => {
  const V = K.v;
  const c = K.cat({ color: K.rgb(255, 120, 200), pattern: "stripes", color2: K.rgb(255, 230, 90), eyes: "closed", mouth: "teeth", tail: "long", innerEars: false });
  const h = c.attach("eyes");
  for (const side of [-1, 1]) {
    K.ball(c.model, 0.3, K.mul(h, K.cf(side * 0.75, -0.2, -0.1)), K.rgb(120, 200, 255), { name: "Tear", neon: true });
    K.ball(c.model, 0.22, K.mul(h, K.cf(side * 1.2, 0.2, 0)), K.rgb(120, 200, 255), { name: "Tear", neon: true });
  }
  // roll onto its back
  const roll = K.mul(K.cf(0, 2.2, 0), K.angles(0, 0, K.rad(150)));
  for (const p of K.baseParts(c.model)) p.cf = K.mul(roll, p.cf);
  // floating "HA HA"
  const cols = [K.rgb(255, 230, 0), K.rgb(0, 230, 255)];
  for (let i = 0; i <= 1; i++) {
    const o = K.mul(K.cf(-1.9 + i * 3.8, 5.6 + i * 0.5, 0), K.angles(0, 0, K.rad(i === 0 ? 12 : -12)));
    const col = cols[i];
    K.block(c.model, V(0.3, 1.4, 0.3), K.mul(o, K.cf(-1.2, 0, 0)), col, { neon: true, name: "HA" });
    K.block(c.model, V(0.3, 1.4, 0.3), K.mul(o, K.cf(-0.4, 0, 0)), col, { neon: true, name: "HA" });
    K.block(c.model, V(0.6, 0.25, 0.3), K.mul(o, K.cf(-0.8, 0, 0)), col, { neon: true, name: "HA" });
    K.block(c.model, V(0.3, 1.5, 0.3), K.mul(o, K.cf(0.35, 0, 0), K.angles(0, 0, K.rad(-18))), col, { neon: true, name: "HA" });
    K.block(c.model, V(0.3, 1.5, 0.3), K.mul(o, K.cf(0.95, 0, 0), K.angles(0, 0, K.rad(18))), col, { neon: true, name: "HA" });
    K.block(c.model, V(0.55, 0.22, 0.3), K.mul(o, K.cf(0.65, -0.2, 0)), col, { neon: true, name: "HA" });
  }
  return K.finish(c.model);
};

export { looks };

// ---------------------------------------------------------------------------------------------- build
export function build(z) {
  const K = z.K;
  const THREE = z.THREE;
  const ctx = z.ctx;
  const parts = ctx.engine.parts;
  const V = K.v;
  const T = (x, y, zz) => K.cf(x, y, zz);
  const RA = (x, y, zz) => K.angles(x, y, zz);
  const rad = (d) => d * Math.PI / 180;
  const rnum = (a, b) => z.random(a, b);
  const rint = (a, b) => z.randint(a, b);
  const at = (x, y, zz, ry) => z.cf(x, y, zz, ry);
  // a world CFrame at (x, y, z) whose front (-Z) faces the point (tx, y, tz)
  const facing = (x, y, zz, tx, tz) => K.lookAt(z.pos(x, y, zz), z.pos(tx, y, tz));

  // ---- our own catkit groups (merged decoration, decoy cats, text props) -------------------------
  // Registered first, so a throw anywhere below still lets the kit's teardown free them.
  const groups = [];
  const anims = [];
  const timers = [];
  z.onLeave(() => {
    for (const g of groups) {
      try { parts.remove(g.id); } catch { /* already gone */ }
      K.disposeGroup(g.g);
    }
    groups.length = 0;
    anims.length = 0;
    timers.length = 0;
  });
  function addGroup(g, worldPos, rotY) {
    g.position.copy(worldPos);
    if (rotY) g.rotation.y = rotY;
    const id = parts.addCustom(g);
    groups.push({ g, id });
    return g;
  }
  // Decoration batches: non-colliding, never-mutated pieces in WORLD coordinates, merged per area into
  // groups of <= 56 prims (catkit's cap is 60).
  const batches = new Map();
  let area = "spawn";
  function deco() {
    let m = batches.get(area);
    if (m && m.prims.length >= 56) { flushModel(m); m = null; }
    if (!m) { m = K.model("z5:" + area); batches.set(area, m); }
    return m;
  }
  function flushModel(m) {
    for (const [k, v] of batches) if (v === m) batches.delete(k);
    if (!m.prims.length) return null;
    const b = K.bounds(m);
    return addGroup(K.finish(m), b.center);
  }
  function flushAll() {
    for (const m of [...batches.values()]) flushModel(m);
  }
  const dopts = (o = {}) => ({ neon: !!o.neon, transparency: o.transparency || 0, material: o.material });
  const dbox = (size, cf, color, o) => K.block(deco(), size, cf, color, dopts(o));
  const dball = (d, cf, color, o) => K.ball(deco(), d, cf, color, dopts(o));
  const dcyl = (len, d, cf, color, o) => K.cyl(deco(), len, d, cf, color, dopts(o));
  const dwedge = (size, cf, color, o) => K.wedge(deco(), size, cf, color, dopts(o));
  const neon = (size, cf, color, o = {}) => dbox(size, cf, color, { ...o, neon: true });
  // a decoration prim carrying text (front face by default)
  function dtext(size, cf, color, text, tcolor, o = {}) {
    const p = dbox(size, cf, color, o);
    K.text(p, text, { color: tcolor, both: o.both, face: o.face });
    return p;
  }
  // one stand-alone prop built in its own model space (centred by K.finish), then placed
  function prop(name, fn, worldPos, rotY) {
    const m = K.model(name);
    fn(m);
    const b = K.bounds(m);
    const g = K.finish(m);
    const p = new THREE.Vector3(worldPos[0], worldPos[1], worldPos[2]);
    // K.finish recentred the model on its bounds; keep the authored placement
    p.add(b.center.applyMatrix4(new THREE.Matrix4().makeRotationY(rotY || 0)));
    return addGroup(g, p, rotY);
  }
  function animate(g, o) {
    anims.push({ g, base: g.position.clone(), rot0: g.rotation.y, amp: o.amp || 0, period: o.period || 3, spin: o.spin || 0, phase: o.phase || 0 });
  }
  const after = (s, fn) => { timers.push({ t: z.time() + s, fn }); };
  z.heartbeat((dt, t) => {
    for (let i = timers.length - 1; i >= 0; i--) {
      if (timers[i].t <= t) {
        const fn = timers[i].fn;
        timers.splice(i, 1);
        fn();
      }
    }
    for (const a of anims) {
      if (a.amp) a.g.position.y = a.base.y + Math.sin(((t + a.phase) / a.period) * Math.PI * 2) * a.amp;
      if (a.spin) a.g.rotation.y = a.rot0 + rad(a.spin) * t;
    }
  });

  // ---- zone parts ---------------------------------------------------------------------------------
  const box = (size, cf, color, extra = {}) => z.rpart({ Size: size, CFrame: cf, Color: color, ...extra });
  const zdecor = (size, cf, color, extra = {}) => box(size, cf, color, { ...extra, Decor: true });

  function island(x0, x1, z0, z1, rim, floorColor, top = 0) {
    const w = x1 - x0, d = z1 - z0;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const f = box([w, 4, d], at(cx, top - 2, cz), floorColor || VOID, { Material: "Slate" });
    dbox([w * 0.78, 6, d * 0.78], at(cx, top - 7, cz), VOID2);
    dbox([w * 0.45, 7, d * 0.45], at(cx, top - 13, cz), VOID2);
    neon([w * 0.2, 0.4, d * 0.2], at(cx, top - 16.6, cz), rim, { transparency: 0.2 });
    const t = 0.5;
    neon([w, 0.3, t], at(cx, top + 0.1, z0 + t / 2), rim);
    neon([w, 0.3, t], at(cx, top + 0.1, z1 - t / 2), rim);
    neon([t, 0.3, d], at(x0 + t / 2, top + 0.1, cz), rim);
    neon([t, 0.3, d], at(x1 - t / 2, top + 0.1, cz), rim);
    neon([w + 0.2, 0.3, 0.3], at(cx, top - 4, z0), rim, { transparency: 0.3 });
    neon([w + 0.2, 0.3, 0.3], at(cx, top - 4, z1), rim, { transparency: 0.3 });
    neon([0.3, 0.3, d + 0.2], at(x0, top - 4, cz), rim, { transparency: 0.3 });
    neon([0.3, 0.3, d + 0.2], at(x1, top - 4, cz), rim, { transparency: 0.3 });
    return f;
  }

  function bridge(x0, x1, z0, z1, rim) {
    const w = x1 - x0, d = z1 - z0;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    box([w, 1, d], at(cx, -0.5, cz), VOID2, { Material: "DiamondPlate" });
    if (w > d) {
      neon([w, 0.4, 0.3], at(cx, 0.2, z0 + 0.15), rim);
      neon([w, 0.4, 0.3], at(cx, 0.2, z1 - 0.15), rim);
    } else {
      neon([0.3, 0.4, d], at(x0 + 0.15, 0.2, cz), rim);
      neon([0.3, 0.4, d], at(x1 - 0.15, 0.2, cz), rim);
    }
  }

  // floating sign with a zone label: text on the face that points at (tx, tz)
  function sign(text, x, y, zz, tx, tz, w, h, o = {}) {
    const cf = facing(x, y, zz, tx, tz);
    const p = zdecor([w, h, 0.4], cf, o.bg || SIGN_BG);
    neon([w, 0.25, 0.5], K.mul(cf, T(0, h / 2 + 0.12, 0)), o.rim || PURPLE);
    z.label(p, text, { color: o.color || SIGN_TEXT, both: o.both });
    return p;
  }
  // the same, drawn as a catkit text prop (for the many small text pieces)
  function psign(text, cf, w, h, o = {}) {
    neon([w, 0.25, 0.5], K.mul(cf, T(0, h / 2 + 0.12, 0)), o.rim || PURPLE);
    return dtext([w, h, 0.4], cf, o.bg || SIGN_BG, text, o.color || SIGN_TEXT, { both: o.both });
  }
  // crash-log panel (green on black)
  const logPanel = (text, x, y, zz, tx, tz) => psign(text, facing(x, y, zz, tx, tz), 7, 2.2, { color: GREEN, rim: GREEN, bg: C(0, 8, 0) });

  // char[i] fragment: flat floor tile (label on top) or a small upright plate
  function floorFragment(text, x, zz) {
    const p = zdecor([3.2, 0.12, 3.2], at(x, 0.08, zz), SIGN_BG);
    neon([3.6, 0.08, 3.6], at(x, 0.03, zz), PURPLE, { transparency: 0.4 });
    z.label(p, text, { face: "top", color: C(210, 170, 255) });
    return p;
  }
  function plateFragment(text, cf) {
    const p = zdecor([3, 1.6, 0.2], cf, SIGN_BG);
    z.label(p, text, { color: C(210, 170, 255) });
    return p;
  }

  // terminal kiosk; returns the clickable base
  function kiosk(x, zz, tx, tz, screenText, screenColor) {
    const cf = facing(x, 2, zz, tx, tz);
    const base = box([3, 4, 2], cf, C(22, 22, 34), { Material: "Metal" });
    dtext([2.6, 1.9, 0.2], K.mul(cf, T(0, 0.7, -1.05)), C(0, 12, 6), screenText, screenColor || GREEN);
    neon([3.1, 0.2, 2.1], K.mul(cf, T(0, 2.1, 0)), screenColor || GREEN);
    return base;
  }

  function notLocked(key) {
    const left = z.isLocked(key);
    if (left) {
      z.fail("Rebooting... try again in " + left + " s.");
      return false;
    }
    return true;
  }

  // click (or [E]) a code pad -> text box -> check
  function codePad(part, key, n, o, answer) {
    const go = () => {
      if (z.has(n) || z.isUnlocked(n) || z.isRevealed(n)) {
        z.notify(o.doneText || "Already solved! Go grab the cat.");
        return;
      }
      if (!notLocked(key)) return;
      // +1: room for the stray "E" of the keypress that opened the box (it would otherwise eat a digit)
      z.input({ title: o.title, hint: o.hint, kind: o.kind || "digits", max: (o.max || 8) + 1 }, (raw) => {
        // digit codes ignore anything that is not a digit (a stray space, or the E that opened the box)
        let text = (o.kind || "digits") === "digits" ? String(raw).replace(/[^0-9]/g, "") : String(raw).toUpperCase().replace(/\s+/g, "");
        // the [E] keypress that opened the box can land in it as a leading "E" ("ENOTHING")
        if (text !== answer && text === "E" + answer) text = answer;
        if (text === answer) {
          z.tone(1.5);
          after(0.15, () => z.tone(2.0));
          o.win();
        } else {
          z.lockout(o.lock || 10, key);
          z.fail(o.wrongText || "ACCESS DENIED.");
        }
      });
    };
    z.click(part, go, { distance: 18 });
    z.prompt(part, o.prompt || o.title, go, { distance: 8 });
  }

  function laugh() {
    z.tone(1.8, { volume: 0.6 });
    after(0.12, () => z.tone(2.1, { volume: 0.6 }));
    after(0.24, () => z.tone(2.4, { volume: 0.6 }));
  }

  // a decoy cat model (not collectable) standing at zone-local (x, floorY, zz)
  function decoyCat(model, x, floorY, zz, rotY) {
    const g = K.finish(model);
    const size = g.userData.size;
    return addGroup(g, new THREE.Vector3(...z.pos(x, floorY + size.y / 2 + 0.1, zz)), rotY);
  }

  // ============================================================================================ the void
  area = "void";
  const voidFloor = box([390, 2, 390], at(0, -61, 0), C(25, 0, 45), { Material: "Glass", Transparency: 0.3 });
  z.kill(voidFloor);
  // The engine's sky gradient has a fixed pale horizon stop that a Place cannot recolour, so the void
  // is closed in a dark shell instead: six non-colliding slabs that the zone's near-black fog swallows.
  // They sit 55 studs outside the build area so the follow camera never ends up behind one.
  {
    const S = 250, Y0 = -120, Y1 = 320, YM = (Y0 + Y1) / 2, HY = Y1 - Y0;
    zdecor([2 * S, 1, 2 * S], at(0, Y0, 0), VOID);
    zdecor([2 * S, 1, 2 * S], at(0, Y1, 0), VOID);
    zdecor([1, HY, 2 * S], at(-S, YM, 0), VOID);
    zdecor([1, HY, 2 * S], at(S, YM, 0), VOID);
    zdecor([2 * S, HY, 1], at(0, YM, -S), VOID);
    zdecor([2 * S, HY, 1], at(0, YM, S), VOID);
  }

  // stars and void specks
  const starCols = [WHITE, PURPLE, CYAN, PINK];
  for (let i = 0; i < 150; i++) {
    area = "stars" + (i % 3);
    const x = rnum(-190, 190), zz = rnum(-190, 190);
    let y = rnum(25, 220);
    if (rnum(0, 1) < 0.25) y = rnum(-55, -22);
    const s = rnum(0.3, 1.1);
    neon([s, s, s], at(x, y, zz), starCols[rint(0, starCols.length - 1)]);
  }
  // glitch cubes drifting in the void (each its own little group so it can spin or bob)
  for (let i = 1; i <= 26; i++) {
    const x = rnum(-185, 185), zz = rnum(-185, 185);
    const y = rnum(22, 90);
    const s = rnum(2, 6);
    const tilt = RA(rnum(0, 3), rnum(0, 3), 0);
    const dark = i % 3 === 0;
    const g = prop("GlitchCube", (m) => {
      K.block(m, [s, s, s], tilt, dark ? C(40, 0, 60) : VOID, { transparency: 0.15 });
      K.block(m, [s * 1.05, 0.2, 0.2], K.mul(tilt, T(0, s / 2, s / 2)), dark ? PINK : CYAN, { neon: true });
    }, z.pos(x, y, zz));
    if (i % 2 === 0) animate(g, { spin: rnum(10, 40) });
    else animate(g, { amp: rnum(1, 3), period: rnum(3, 7) });
  }
  // floating error popups in the sky: one ring that slowly orbits the void
  const errs = [
    "attempt to index nil with 'cat'",
    "Segmentation fault (cat dumped)",
    "undefined is not a cat",
    "NaN NaN NaN NaN NaN NaN BATCAT",
    "Error 418: I'm a teapot cat",
    "stack overflow (too many cats)",
    "cat == nil  -->  true",
    "Press F to pet",
  ];
  {
    const m = K.model("ErrorRing");
    errs.forEach((txt, i0) => {
      const i = i0 + 1;
      const a = (i / errs.length) * Math.PI * 2;
      const x = Math.cos(a) * 150, zz = Math.sin(a) * 150;
      const y = 40 + (i % 3) * 18;
      const cf = K.lookAt([x, y, zz], [0, y, 0]);
      const w = K.block(m, [22, 7, 0.5], cf, C(200, 200, 210));
      K.text(w, txt, { color: C(20, 20, 30) });
      K.block(m, [22, 1.3, 0.6], K.mul(cf, T(0, 4.1, 0)), i % 2 === 0 ? C(40, 90, 230) : RED, { neon: true });
    });
    const b = K.bounds(m);
    const g = addGroup(K.finish(m), new THREE.Vector3(...z.pos(b.center.x, b.center.y, b.center.z)));
    animate(g, { spin: 2.5, amp: 2, period: 9 });
  }
  // the giant void eye over everything
  area = "voideye";
  dball(30, at(-20, 150, -60), C(230, 225, 255));
  dball(14, at(-20, 144, -50), PURPLE, { neon: true });
  dball(7, at(-20, 141.5, -46.5), C(0, 0, 0));

  // ============================================================================================ spawn island
  area = "spawn";
  island(-195, -150, -30, 40, PURPLE);
  sign("WELCOME TO THE nil VOID\nNothing here is real. Paths hide. Walls lie.\n\nEAST: Null Plaza (nil cats)\nTHEN NORTH: Capitol Isle (Obama cats)\nTHEN SOUTH: The Funhouse (HAHAHAHA cats)", -162, 6, -22, -185, 0, 16, 8);
  [-26, 36].forEach((zz, i0) => {
    const i = i0 + 1;
    const x = -160 + i * 2;
    box([3, 14, 3], at(x, 7, zz), VOID2, { Material: "Slate" });
    neon([3.4, 0.6, 3.4], at(x, 14.3, zz), PURPLE);
    const g = prop("PillarOrb", (m) => K.ball(m, 2, T(0, 0, 0), CYAN, { neon: true }), z.pos(x, 17, zz));
    animate(g, { amp: 0.8, period: 2.5 + i });
  });
  logPanel("[23:59:01] user pressed RETRY", -157, 3, 34, -170, 10);
  floorFragment("char[7] = 'G'", -192, 37.5);

  bridge(-150, -110, -4, 4, PURPLE);

  // ============================================================================================ null plaza
  area = "plaza";
  island(-110, -30, -40, 40, PURPLE);
  for (let i = -2; i <= 2; i++) {
    neon([80, 0.06, 0.25], at(-70, 0.03, i * 16), PURPLE, { transparency: 0.55 });
    neon([0.25, 0.06, 80], at(-70 + i * 16, 0.03, 0), PURPLE, { transparency: 0.55 });
  }
  // void core (63)
  z.part({ shape: "cylinder", size: [10, 2, 10], at: [-70, 1, 0], color: VOID2, material: "concrete" });
  dcyl(0.3, 11, at(-70, 2.05, 0), PURPLE, { neon: true, transparency: 0.3 });
  {
    const core = prop("VoidCore", (m) => {
      K.block(m, [6, 6, 6], RA(rad(35), 0, rad(45)), C(20, 0, 40), { transparency: 0.25 });
    }, z.pos(-70, 18, 0));
    animate(core, { spin: 30 });
    const heart = prop("VoidCoreHeart", (m) => K.ball(m, 3, T(0, 0, 0), PURPLE, { neon: true }), z.pos(-70, 18, 0));
    animate(heart, { amp: 1, period: 3 });
    for (let i = 0; i <= 5; i++) {
      const a = i / 6 * Math.PI * 2;
      const sh = prop("CoreShard", (m) => K.block(m, [0.6, 3, 0.6], T(0, 0, 0), CYAN, { neon: true }), z.pos(-70 + Math.cos(a) * 7, 16 + (i % 2) * 3, Math.sin(a) * 7));
      animate(sh, { amp: 1.2, period: 2 + i * 0.3 });
    }
    z.part({ size: [0.5, 0.5, 0.5], at: [-70, 12, 0], transparency: 1, decor: true, light: { color: PURPLE, intensity: 2.5, range: 45 } });
  }
  z.cat(63, at(-70, 2, 0, 90), { locked: true });
  const coreTerm = kiosk(-70, 14, -70, 30, "> nil.toString()\n> _", PURPLE);
  sign("nil.toString() CRASHED\nIt dropped its 7 letters all over the void.\nEach one is labelled char[1] ... char[7].\nFind them all, then type the WORD into the terminal.", -80, 4.5, 15, -80, 40, 11, 5);
  codePad(coreTerm, "core", 63, {
    title: "nil.toString() = ?", hint: "7 letters", kind: "text", max: 12, lock: 15, prompt: "Type into the Void Core",
    wrongText: "nil.toString() = \"nope\". Locked 15 s.",
    win: () => {
      z.unlock(63);
      z.notify("nil.toString() = \"NOTHING\". The Void Core opens!");
    },
  }, "NOTHING");

  // Cat.exe dialog (60)
  {
    const dcf = facing(-96, 9, -28, -96, 0);
    box([24, 14, 0.6], dcf, C(205, 205, 212));
    const bar = box([24, 2, 0.8], K.mul(dcf, T(0, 8, 0)), C(40, 90, 220));
    z.label(bar, "Cat.exe", { color: WHITE, align: "left" });
    box([2, 1.6, 0.4], K.mul(dcf, T(-10.8, 8, -0.5)), RED);
    const msg = zdecor([22, 8, 0.1], K.mul(dcf, T(0, 1.8, -0.36)), C(205, 205, 212));
    z.label(msg, "Cat.exe has stopped responding.\n\nTo restart it, replay the CRASH LOG:\npress the buttons in the order of their timestamps.\n6 log entries are scattered across the void.", { color: C(20, 20, 30) });
    plateFragment("char[3] = 'T'", K.mul(dcf, T(-8, -5, 0.45), RA(0, Math.PI, 0)));
    z.cat(60, at(-104, 0, -17, 180), { locked: true });
    const EXE = ["RETRY", "RETRY", "IGNORE", "OK", "CANCEL", "OK"];
    ["OK", "CANCEL", "RETRY", "IGNORE"].forEach((name, i0) => {
      const btn = box([5, 2, 1], K.mul(dcf, T(8.4 - i0 * 5.6, -5, -0.7)), C(225, 225, 232));
      z.label(btn, name, { color: C(20, 20, 30) });
      const press = () => {
        if (z.has(60) || z.isUnlocked(60)) {
          z.notify("Cat.exe is already running. Go get it!");
          return;
        }
        if (!notLocked("exe")) return;
        const seq = (z.flag("exe") || []).slice();
        seq.push(name);
        z.flag("exe", seq);
        z.tone(0.9 + seq.length * 0.15);
        if (seq.length < EXE.length) {
          z.notify(`Pressed ${name} (${seq.length}/${EXE.length})`);
          return;
        }
        z.flag("exe", null);
        for (let j = 0; j < EXE.length; j++) {
          if (seq[j] !== EXE[j]) {
            z.lockout(6, "exe");
            z.fail("Cat.exe has stopped responding (again). Check the crash log order. 6 s.");
            return;
          }
        }
        z.unlock(60);
        z.notify("Cat.exe restarted! The cage is open.");
        z.sound("action_get_up.mp3");
      };
      z.click(btn, press, { distance: 26 });
      z.prompt(btn, "Press " + name, press, { distance: 3 });
    });
  }

  // invisible path north to the nil island (58)
  sign("THE PATH TO nil\nIt is right here. You just can't see it.\nThe void remembers the SHADOW of every step.\nLook down.", -70, 4, -36, -70, 0, 12, 5);
  const PATH = [
    [-70, -42], [-70, -46], [-66, -46], [-62, -46], [-62, -50], [-62, -54], [-66, -54], [-70, -54],
    [-74, -54], [-78, -54], [-78, -58], [-78, -62], [-74, -62], [-70, -62], [-70, -66], [-70, -70],
    [-66, -70], [-62, -70], [-58, -70], [-58, -74], [-58, -78], [-58, -82], [-58, -86],
  ];
  area = "path";
  for (const c of PATH) {
    box([4, 1, 4], at(c[0], -0.5, c[1]), VOID, { Transparency: 1 });
    neon([3.6, 0.3, 3.6], at(c[0], -14, c[1]), PURPLE, { transparency: 0.35 });
  }
  plateFragment("char[6] = 'N'", facing(-81.5, 1.5, -58, -70, -58));

  // ============================================================================================ nil island (58)
  area = "nil";
  island(-95, -45, -120, -86, PURPLE);
  z.cat(58, at(-70, 0, -104, 180), {});
  z.billboard([-70, 16, -112], "nil", { width: 14, height: 6, color: PURPLE, distance: 250 });
  for (const x of [-88, -52]) {
    box([3, 12, 3], at(x, 6, -114), VOID2, { Material: "Slate" });
    const o = prop("NilObeliskTop", (m) => K.block(m, [2, 2, 2], RA(rad(45), 0, rad(45)), PURPLE, { neon: true }), z.pos(x, 13.5, -114));
    animate(o, { spin: 60 });
  }
  logPanel("[23:59:02] user pressed RETRY", -86, 3, -94, -70, -104);
  floorFragment("char[1] = 'N'", -50, -116);
  bridge(-120, -95, -108, -100, CYAN);

  // ============================================================================================ eye island (61)
  area = "eye";
  island(-160, -120, -132, -92, CYAN);
  const E = [-140, 0, -127];
  dcyl(0.1, 6, at(E[0], 0.05, E[2]), WHITE);
  dcyl(0.08, 7, at(E[0], 0.03, E[2]), CYAN, { neon: true, transparency: 0.3 });
  dcyl(0.14, 3.2, at(E[0], 0.08, E[2]), CYAN, { neon: true });
  dcyl(0.16, 1.6, at(E[0], 0.1, E[2]), C(0, 0, 0));
  sign("THE EYE OF THE VOID\nSome things only exist from ONE point of view.\nStand exactly on the pupil, zoom the camera ALL the way in,\nlook north and UP, over your own head.\nType what you see into the terminal.", -128, 4.5, -118, -140, -105, 13, 6, { rim: CYAN });
  // anamorphic digits 7310: they only line up when seen from the camera of an avatar standing on the
  // pupil at the closest zoom (4 studs behind the look target at feet + 4), pitched 15 degrees up; the digits sit 40 degrees up so the avatar's head never covers them.
  {
    area = "eyedigits";
    const PITCH = rad(15);
    const P = [E[0], 4 - 4 * Math.sin(PITCH), E[2] + 4 * Math.cos(PITCH)];
    const D0 = 44;
    const H0 = D0 * Math.tan(rad(40));
    const SEG = {
      a: [0, 4.5, true], b: [2.4, 2.25, false], c: [2.4, -2.25, false], d: [0, -4.5, true],
      e: [-2.4, -2.25, false], f: [-2.4, 2.25, false], g: [0, 0, true],
    };
    const DIGITS = [[-11, "abc"], [-3.7, "abcdg"], [3.7, "bc"], [11, "abcdef"]];
    const fragment = (u, v, sx, sy, col) => {
      const f = rnum(0.75, 1.3);
      const q = [P[0] + u, P[1] + H0 + v, P[2] - D0];
      const p = [P[0] + (q[0] - P[0]) * f, P[1] + (q[1] - P[1]) * f, P[2] + (q[2] - P[2]) * f];
      // face the eye point so every fragment is seen square-on
      const cf = K.lookAt(z.pos(p[0], p[1], p[2]), z.pos(P[0], P[1], P[2]));
      neon([sx * f, sy * f, 0.9 * f], cf, col);
    };
    for (const dg of DIGITS) {
      // a lone "1" (segments b, c only) is centred in its cell so it doesn't hug the next digit
      const shift = dg[1] === "bc" ? -2.4 : 0;
      for (const ch of dg[1]) {
        const s = SEG[ch];
        if (s[2]) fragment(dg[0] + s[0] + shift, s[1], 4.4, 0.95, CYAN);
        else fragment(dg[0] + s[0] + shift, s[1], 0.95, 4.1, CYAN);
      }
    }
    let made = 0;
    while (made < 16) {
      const u = rnum(-24, 24), v = rnum(-11, 12);
      if (Math.abs(u) > 19.5 || Math.abs(v) > 8.5) {
        made++;
        if (made % 2 === 0) fragment(u, v, 2.6, 0.8, PURPLE);
        else fragment(u, v, 0.8, 2.2, PINK);
      }
    }
    area = "eye";
  }
  const eyeTerm = kiosk(-127, -100, -140, -110, "> what did\n  the eye see?", CYAN);
  z.cat(61, at(-152, 0, -100, 90), { hidden: true });
  codePad(eyeTerm, "eye", 61, {
    title: "What did the Eye see?", hint: "4 digits", kind: "digits", max: 4, lock: 10, prompt: "Tell the Eye terminal",
    wrongText: "The eye blinks. Wrong. Locked 10 s.",
    win: () => {
      z.reveal(61);
      z.notify("Mr. Transparency is now... slightly less transparent! (west side of the island)");
    },
  }, "7310");
  floorFragment("char[4] = 'H'", -157, -95);
  logPanel("[23:59:06] user pressed OK", -156, 3, -129, -140, -110);

  // ============================================================================================ 404 compound (59)
  area = "404";
  bridge(-84, -76, 40, 52, PURPLE);
  island(-110, -50, 52, 118, RED);
  sign("ERROR 404: DOOR NOT FOUND\nThis building has no doors.\nReal walls never glitch.", -80, 5.5, 55, -80, 30, 14, 5, { rim: RED });
  {
    const cx = -80, cz = 85, H = 10;
    const rings = [
      { h: 24, fakeSide: "E", fakeSeg: 3 },
      { h: 16, fakeSide: "W", fakeSeg: 1 },
      { h: 8, fakeSide: "S", fakeSeg: 2 },
    ];
    const wallCol = C(28, 24, 40);
    for (const r of rings) {
      const len = 2 * r.h + 1;
      const seg = len / 3;
      for (const side of ["N", "S", "W", "E"]) {
        for (let sgi = 1; sgi <= 3; sgi++) {
          const off = -len / 2 + seg * (sgi - 0.5);
          let x, zz, size;
          if (side === "N" || side === "S") {
            x = cx + off;
            zz = cz + (side === "N" ? -r.h : r.h);
            size = [seg, H, 1];
          } else {
            x = cx + (side === "W" ? -r.h : r.h);
            zz = cz + off;
            size = [1, H, seg];
          }
          const fake = side === r.fakeSide && sgi === r.fakeSeg;
          box(size, at(x, H / 2, zz), wallCol, { Material: "Slate", CanCollide: !fake });
          if (fake) {
            const strip = z.part({ shape: "box", size: [size[0] + 0.1, 0.35, size[2] + 0.1], at: [x, H + 0.15, zz], color: RED, material: "neon", decor: true });
            z.tag(strip, "Blink", { period: 0.45 });
          } else {
            neon([size[0] + 0.1, 0.35, size[2] + 0.1], at(x, H + 0.15, zz), RED);
          }
        }
      }
    }
    z.cat(59, at(cx, 0, cz, 180), {});
    floorFragment("char[2] = 'O'", cx + 4, cz + 12);
    logPanel("[23:59:03] user pressed IGNORE", cx, 4, cz + 20.5, cx, cz);
  }

  // ============================================================================================ sound island (62)
  area = "sound";
  bridge(-122, -110, 77, 85, CYAN);
  island(-162, -122, 62, 100, CYAN);
  {
    const cx = -142, cz = 81;
    const PITCH = [1.25, 0.8, 1.6, 1.0, 2.0];
    const MELODY = [4, 3, 2, 5, 1];
    const ORB_OFF = C(40, 20, 70), ORB_ON = C(200, 120, 255);
    const spk = box([3, 6, 4], at(-157, 3, 81), C(22, 22, 34), { Material: "Metal" });
    dcyl(0.3, 3.2, K.mul(at(-155.4, 3.6, 81), RA(0, 0, Math.PI / 2)), CYAN, { neon: true });
    dcyl(0.3, 1.2, K.mul(at(-155.4, 5.5, 81), RA(0, 0, Math.PI / 2)), PINK, { neon: true });
    plateFragment("char[5] = 'I'", facing(-158.7, 3, 81, -170, 81));
    const orbs = [];
    for (let i = 1; i <= 5; i++) {
      const a = Math.PI + (i - 1) / 5 * Math.PI * 2;
      const x = cx + Math.cos(a) * 9, zz = cz + Math.sin(a) * 9;
      z.part({ shape: "cylinder", size: [2, 3, 2], at: [x, 1.5, zz], color: VOID2, material: "concrete" });
      const orb = z.part({ shape: "sphere", size: [2.6, 2.6, 2.6], at: [x, 4.4, zz], color: ORB_OFF, material: "glass", transparency: 0.1, dynamic: true });
      orbs[i] = orb;
      const hit = () => {
        z.tone(PITCH[i - 1]);
        orb.setColor(ORB_ON);
        after(0.25, () => orb.setColor(ORB_OFF));
        if (z.has(62) || z.isRevealed(62)) return;
        if (!notLocked("wav")) return;
        const seq = (z.flag("wav") || []).slice();
        seq.push(i);
        z.flag("wav", seq);
        if (seq.length < MELODY.length) return;
        z.flag("wav", null);
        for (let j = 0; j < MELODY.length; j++) {
          if (seq[j] !== MELODY[j]) {
            z.lockout(5, "wav");
            z.fail("That's not how Meow.wav goes. (5 s)");
            return;
          }
        }
        z.reveal(62);
        z.notify("Meow.wav restored! It's in the middle of the orbs.");
      };
      z.click(orb, hit, { distance: 22 });
      z.prompt(orb, "Sing orb " + i, hit, { distance: 2.5 });
    }
    let playing = false;
    const listen = () => {
      if (playing) return;
      playing = true;
      z.flag("wav", null);
      MELODY.forEach((oi, j) => after(j * 0.7, () => z.tone(PITCH[oi - 1], { volume: 1 })));
      after(MELODY.length * 0.7, () => { playing = false; });
    };
    z.click(spk, listen, { distance: 24 });
    z.prompt(spk, "Listen to Meow.wav", listen, { distance: 6 });
    sign("Meow.wav IS CORRUPTED\nThe speaker plays the real meow (5 notes).\nEach orb sings ONE note.\nPlay the notes back in the same order.\n(Turn your sound on!)", -130, 4.5, 97, cx, cz, 12, 6, { rim: CYAN });
    z.cat(62, at(cx, 0, cz, 180), { hidden: true });
    logPanel("[23:59:05] user pressed CANCEL", -125, 3, 66, cx, cz);
    for (let i = 1; i <= 6; i++) {
      const col = i % 2 === 0 ? CYAN : PINK;
      const g = prop("FloatingNote", (m) => {
        K.block(m, [0.6, 2.2, 0.6], T(0, 0, 0), col, { neon: true });
        K.ball(m, 1.2, T(-0.4, -1.2, 0), col, { neon: true });
      }, z.pos(cx + Math.cos(i) * 16, 9 + i, cz + Math.sin(i) * 16));
      animate(g, { amp: 1.5, period: 2 + i * 0.4 });
    }
  }

  // ============================================================================================ crossroads
  area = "cross";
  bridge(-30, -10, -4, 4, PURPLE);
  island(-10, 30, -20, 20, GOLD);
  psign("NORTH: CAPITOL ISLE\n(Obama cats)", facing(10, 5, -14, 10, 10), 10, 3.5, { rim: GOLD, color: GOLD });
  psign("SOUTH: THE FUNHOUSE\n(HAHAHAHA cats)", facing(10, 5, 14, 10, -10), 10, 3.5, { rim: PINK, color: PINK });
  logPanel("[23:59:04] user pressed OK", 26, 3, 0, 0, 0);
  bridge(6, 14, -40, -20, GOLD);
  bridge(6, 14, 20, 40, PINK);

  // ============================================================================================ capitol isle (64-69)
  area = "capitol";
  island(-20, 190, -190, -40, GOLD, NAVY);
  dbox([10, 0.1, 140], at(10, 0.05, -111), C(150, 20, 40));
  for (let i = 0; i <= 5; i++) {
    const zz = -55 - i * 25;
    for (const x of [2, 18]) {
      box([0.4, 12, 0.4], at(x, 6, zz), C(200, 200, 210), { Material: "Metal" });
      dball(0.8, at(x, 12.3, zz), GOLD, { neon: true });
      for (let s = 0; s <= 2; s++) dbox([0.15, 1, 4.5], at(x, 10.8 - s, zz + 2.4), s % 2 === 0 ? PURPLE : GOLD);
    }
  }
  z.billboard([10, 16, -48], "CAPITOL ISLE", { width: 18, height: 3.5, color: GOLD, distance: 250 });
  z.part({ size: [0.5, 0.5, 0.5], at: [57, 12, -70], transparency: 1, decor: true, light: { color: GOLD, intensity: 2, range: 50 } });
  // capitol dome backdrop
  {
    area = "dome";
    const dx = 10, dz = -186;
    box([24, 12, 6], at(dx, 6, dz), C(232, 230, 222), { Material: "Marble" });
    for (let i = 0; i <= 5; i++) box([1.6, 10, 1.6], at(dx - 10 + i * 4, 5, dz + 4), C(232, 230, 222), { Material: "Marble" });
    z.part({ shape: "sphere", size: [14, 14, 14], at: [dx, 12, dz], color: C(232, 230, 222), material: "marble" });
    neon([1.2, 5, 1.2], at(dx, 21, dz), GOLD);
    dcyl(0.4, 14.6, at(dx, 12, dz), GOLD, { neon: true, transparency: 0.4 });
  }

  // 64 Secret Service line
  {
    area = "agents";
    dbox([58, 0.12, 10], at(57, 0.06, -62), C(150, 20, 40));
    const AGENTS = [
      { color: "grey", tie: "red", ear: 1, tail: "curly" },    // 1 wrong ear (own right)
      { color: "black", tie: "red", ear: -1, tail: "curly" },  // 2 black
      { color: "grey", tie: "red", ear: -1, tail: "normal" },  // 3 normal tail
      { color: "grey", tie: "blue", ear: -1, tail: "curly" },  // 4 blue tie
      { color: "grey", tie: "red", ear: -1, tail: "curly" },   // 5 REAL
      { color: "grey", tie: "blue", ear: 1, tail: "puffy" },   // 6 everything off
    ];
    const REAL = 5;
    const plates = K.model("AgentPlates");
    AGENTS.forEach((a, i0) => {
      const i = i0 + 1;
      const c = agentModel(K, { color: K.C[a.color], tie: K.C[a.tie], ear: a.ear, tail: a.tail, whiskers: false, innerEars: false });
      const x = 35 + i0 * 9;
      const g = decoyCat(c.model, x, 0, -62, Math.PI);
      const size = g.userData.size;
      const hit = box([size.x + 0.6, size.y + 0.6, size.z + 0.6], at(x, size.y / 2 + 0.1, -62, 180), C(0, 0, 0), { Transparency: 1, CanCollide: false });
      K.text(K.block(plates, [3, 1, 0.3], z.cf(x, 0.8, -57.6, 180), C(20, 20, 30)), "AGENT #" + i, { color: GOLD });
      const pick = () => {
        if (z.has(64) || z.isRevealed(64)) {
          z.notify("You already found the real agent.");
          return;
        }
        if (!notLocked("agent")) return;
        if (i === REAL) {
          z.reveal(64);
          z.notify("\"...You got me.\" Secret Service Cat steps out behind the line!");
          z.tone(1.6);
        } else {
          z.lockout(10, "agent");
          z.fail("That's a cardboard cutout! Read the dossier again. (10 s)");
        }
      };
      z.click(hit, pick, { distance: 30 });
      z.prompt(hit, "Accuse AGENT #" + i, pick, { distance: 2.5 });
    });
    {
      const b = K.bounds(plates);
      addGroup(K.finish(plates), b.center);
    }
    sign("TOP SECRET DOSSIER\nAGENT 'WHISKERS'\n- GREY fur\n- RED tie\n- earpiece in its OWN LEFT ear\n  (your right, when it faces you)\n- CURLY tail\nThe other 5 are cardboard decoys.\nClick the real agent.", 26, 5.5, -64, 57, -64, 9, 9, { rim: GOLD, color: PAPER });
    z.cat(64, at(57, 0, -74, 180), { hidden: true });
    dbox([6, 0.1, 6], at(57, 0.05, -74), C(40, 40, 60));
  }

  // 65 Podium speech
  {
    area = "speech";
    const STAGE_RED = C(120, 20, 35);
    box([36, 1.5, 26], at(112, 0.75, -87), STAGE_RED, { Material: "Fabric" });
    box([10, 0.75, 3], at(112, 0.375, -72.5), STAGE_RED, { Material: "Fabric" });
    neon([36, 0.3, 0.4], at(112, 1.6, -74), GOLD);
    box([4, 4, 2], at(112, 3.5, -85), C(120, 75, 40), { Material: "Wood" });
    dbox([4.6, 0.3, 2.6], at(112, 5.6, -85), C(90, 55, 30));
    dcyl(0.15, 2, K.mul(at(112, 3.8, -83.9), RA(Math.PI / 2, 0, 0)), GOLD, { neon: true });
    sign("TELEPROMPTER (glitched)\n\nM_   F_____   C___ ,   T__   O___   T____   T_   F___   I_   T__   V_____ .\n\nClick the floating words in the order of the speech\n(or stand on the glowing mark under a word and press E).", 112, 7, -97, 112, -60, 18, 6, { rim: GOLD, color: PAPER });
    z.cat(65, at(125, 1.5, -92, 180), { locked: true });
    const WORDS = ["MY", "FELLOW", "CATS", "THE", "ONLY", "THING", "TO", "FEAR", "IS", "THE", "VACUUM"];
    const SLOT = [7, 2, 10, 4, 11, 1, 9, 5, 3, 8, 6]; // word i floats at slot SLOT[i]
    WORDS.forEach((w, i0) => {
      const s = SLOT[i0];
      const x = 94 + (s - 1) * 3.6;
      const y = 3 + ((s * 7) % 5) * 1.4;
      const zz = -66 - ((s * 3) % 4) * 1.5;
      const size = [w.length * 0.75 + 1.6, 1.8, 0.6];
      const hit = box([size[0], size[1] + 0.6, 1], at(x, y, zz, 180), C(0, 0, 0), { Transparency: 1, CanCollide: false });
      const g = prop("Word", (m) => {
        K.text(K.block(m, size, T(0, 0, 0), C(25, 30, 70)), w, { color: GOLD });
      }, z.pos(x, y, zz), Math.PI);
      animate(g, { amp: 0.4, period: 2 + (s % 4) * 0.5 });
      const say = () => {
        if (z.has(65) || z.isUnlocked(65)) {
          z.notify("The speech is already done. Standing ovation!");
          return;
        }
        if (!notLocked("speech")) return;
        const said = (z.flag("speech") || []).slice();
        said.push(w);
        z.flag("speech", said);
        z.tone(0.8 + said.length * 0.1);
        if (said.length < WORDS.length) {
          z.notify("\"" + said.join(" ") + " ...\"");
          return;
        }
        z.flag("speech", null);
        for (let j = 0; j < WORDS.length; j++) {
          if (said[j] !== WORDS[j]) {
            z.lockout(4, "speech");
            z.fail("The crowd is confused. Start the speech again! (4 s)");
            return;
          }
        }
        z.unlock(65);
        z.notify("\"MY FELLOW CATS, THE ONLY THING TO FEAR IS THE VACUUM.\" Standing ovation! Cage open.");
        z.sound("action_get_up.mp3");
      };
      z.click(hit, say, { distance: 40 });
      // [E] as well: stand on the glowing mark under a word (taps on the lower-left of a phone screen
      // land on the joystick, and the words float too high for a prompt on the word itself)
      const mark = box([2.6, 0.2, 2.6], at(x, 0.1, zz), C(0, 0, 0), { Transparency: 1, CanCollide: false });
      dcyl(0.08, 2.4, at(x, 0.05, zz), GOLD, { neon: true, transparency: 0.5 });
      z.prompt(mark, "Say \"" + w + "\"", say, { distance: 3 });
    });
  }

  // 66 Ballot hall
  {
    area = "ballots";
    const TABLES = [
      { name: "CATNIP PARTY", z: -62, total: 11, spoiled: 2, color: GREEN },
      { name: "LASER PARTY", z: -82, total: 16, spoiled: 2, color: RED },
      { name: "NAP PARTY", z: -102, total: 13, spoiled: 1, color: C(80, 140, 255) },
    ];
    for (const t of TABLES) {
      box([26, 0.5, 10], at(167, 2.75, t.z), C(90, 60, 40), { Material: "Wood" });
      for (const lx of [-12, 12]) {
        for (const lz of [-4, 4]) box([0.6, 2.5, 0.6], at(167 + lx, 1.25, t.z + lz), C(90, 60, 40), { Material: "Wood" });
      }
      const m = K.model("Ballots");
      K.block(m, [26.2, 0.2, 0.3], at(167, 2.6, t.z + 5), t.color, { neon: true });
      // party name board at the west end of the table, facing the hall
      const bcf = facing(151.5, 5, t.z, 100, t.z);
      K.block(m, [7, 0.25, 0.5], K.mul(bcf, T(0, 1.37, 0)), t.color, { neon: true });
      K.text(K.block(m, [7, 2.5, 0.4], bcf, SIGN_BG), t.name, { color: t.color });
      // scatter ballots on an 8 x 3 grid (deterministic)
      const slots = [];
      for (let gx = 0; gx <= 7; gx++) for (let gz = 0; gz <= 2; gz++) slots.push([gx, gz]);
      for (let i = slots.length - 1; i >= 1; i--) {
        const j = rint(0, i);
        const tmp = slots[i];
        slots[i] = slots[j];
        slots[j] = tmp;
      }
      for (let b = 0; b < t.total; b++) {
        const s = slots[b];
        const bx = 167 - 10.5 + s[0] * 3 + rnum(-0.4, 0.4);
        const bz = t.z - 3 + s[1] * 3 + rnum(-0.4, 0.4);
        const cf = at(bx, 3.05, bz, rnum(-35, 35));
        K.block(m, [1.4, 0.08, 1.9], cf, WHITE);
        K.block(m, [0.5, 0.09, 0.15], K.mul(cf, T(0.2, 0.01, -0.4)), t.color);
        if (b < t.spoiled) {
          K.block(m, [1.7, 0.1, 0.2], K.mul(cf, T(0, 0.04, 0), RA(0, rad(50), 0)), RED, { neon: true });
          K.block(m, [1.7, 0.1, 0.2], K.mul(cf, T(0, 0.04, 0), RA(0, rad(-50), 0)), RED, { neon: true });
        }
      }
      const b = K.bounds(m);
      addGroup(K.finish(m), b.center);
    }
    const office = kiosk(150, -49, 120, -40, "ELECTION\nOFFICE\n[ results? ]", GOLD);
    sign("ELECTION NIGHT!\nCount the VALID ballots on each table.\nBallots with a red X are spoiled and don't count.\nEnter CATNIP, LASER, NAP as two digits each\n(e.g. 5, 8, 13 -> 050813).", 158, 5, -46, 120, -30, 12, 6, { rim: GOLD, color: PAPER });
    z.cat(66, at(178, 0, -49, 180), { locked: true });
    codePad(office, "votes", 66, {
      title: "Official results", hint: "CATNIP LASER NAP, 2 digits each", kind: "digits", max: 6, lock: 15, prompt: "Certify the results",
      wrongText: "RECOUNT! Those numbers are wrong. (15 s)",
      win: () => {
        z.unlock(66);
        z.notify("Results certified! LASER PARTY wins. Ballot Box Cat's cage is open.");
      },
    }, "091412");
  }

  // 67 Oval-ish office
  {
    area = "office";
    const cx = 50, cz = -140, R = 16, H = 12;
    const cream = C(238, 232, 215);
    const L = 2 * R * Math.tan(rad(22.5)) + 1;
    dcyl(0.1, 2 * R, at(cx, 0.05, cz), C(200, 190, 160));
    dcyl(0.1, 18, at(cx, 0.12, cz + 2), C(30, 50, 130));
    dcyl(0.1, 6, at(cx, 0.15, cz + 2), GOLD, { neon: true, transparency: 0.3 });
    for (let i = 0; i <= 7; i++) {
      const a = rad(i * 45);
      const px = cx + R * Math.cos(a), pz = cz + R * Math.sin(a);
      const wcf = K.lookAt(z.pos(px, H / 2, pz), z.pos(cx, H / 2, cz));
      if (i === 4) {
        // west door
        box([(L - 6) / 2, H, 1], K.mul(wcf, T(-(3 + (L - 6) / 4), 0, 0)), cream, { Material: "SmoothPlastic" });
        box([(L - 6) / 2, H, 1], K.mul(wcf, T(3 + (L - 6) / 4, 0, 0)), cream, { Material: "SmoothPlastic" });
        box([6, 3, 1], K.mul(wcf, T(0, H / 2 - 1.5, 0)), cream, { Material: "SmoothPlastic" });
      } else if (i === 6) {
        // north wall: the portrait is a fake wall
        box([(L - 5) / 2, H, 1], K.mul(wcf, T(-(2.5 + (L - 5) / 4), 0, 0)), cream, { Material: "SmoothPlastic" });
        box([(L - 5) / 2, H, 1], K.mul(wcf, T(2.5 + (L - 5) / 4, 0, 0)), cream, { Material: "SmoothPlastic" });
        box([5, 3, 1], K.mul(wcf, T(0, H / 2 - 1.5, 0)), cream, { Material: "SmoothPlastic" });
        const pcf = K.mul(wcf, T(0, -1.5, 0));
        dbox([5, 9, 1], pcf, C(60, 40, 70));
        neon([5.2, 0.4, 1.1], K.mul(pcf, T(0, 4.5, 0)), GOLD);
        neon([5.2, 0.4, 1.1], K.mul(pcf, T(0, -4.5, 0)), GOLD);
        const face = K.mul(pcf, T(0, 1.2, -0.6));
        const orange = C(245, 150, 60);
        dcyl(0.4, 3, K.mul(face, RA(Math.PI / 2, 0, 0)), orange);
        dwedge([0.4, 1.2, 0.9], K.mul(face, T(-0.9, 1.4, 0), RA(0, Math.PI / 2, 0)), orange);
        dwedge([0.4, 1.2, 0.9], K.mul(face, T(0.9, 1.4, 0), RA(0, -Math.PI / 2, 0)), orange);
        dbox([2.4, 0.5, 0.3], K.mul(face, T(0, 0.25, -0.3)), C(10, 10, 10));
        const cap = zdecor([4.4, 2.6, 0.2], K.mul(pcf, T(0, -2.6, -0.6)), C(40, 25, 50));
        z.label(cap, "THE PRESIDENT\n(there is definitely no safe behind this portrait)", { color: GOLD });
      } else {
        box([L, H, 1], wcf, cream, { Material: "SmoothPlastic" });
      }
      neon([L, 0.3, 1.1], K.mul(wcf, T(0, H / 2, 0)), GOLD);
    }
    sign("THE OVAL-ISH OFFICE\nThe President hid the safe somewhere in here.\nThe combination is on the desk.", cx - R - 3, 5, cz + 9, cx - 40, cz + 9, 10, 4, { rim: GOLD, color: PAPER });
    // desk with legs (a sock hides under it)
    const deskWood = C(110, 65, 35);
    box([8, 0.5, 3.4], at(cx, 3, cz - 10), deskWood, { Material: "Wood" });
    for (const lx of [-3.6, 3.6]) box([0.6, 2.75, 3], at(cx + lx, 1.375, cz - 10), deskWood, { Material: "Wood" });
    box([7, 2.2, 0.3], at(cx, 1.6, cz - 11.5), deskWood, { Material: "Wood" });
    [C(30, 60, 200), C(20, 20, 20), GOLD].forEach((col, i0) => {
      const i = i0 + 1;
      dcyl(1.3, 0.18, K.mul(at(cx - 3 + i * 0.6, 3.35, cz - 9.5 + i * 0.25, 70 + i * 15), RA(0, 0, Math.PI / 2)), col);
    });
    const memo = zdecor([3.6, 2.6, 0.12], K.mul(at(cx + 1.6, 4.5, cz - 10.6), RA(rad(12), 0, 0)), C(255, 250, 220));
    z.label(memo, "SAFE COMBO (shhh!)\n1st: stars on the flag\n2nd: socks on the floor\n3rd: pens on my desk\n4th: fish in the bowl", { color: C(30, 30, 60), face: "back" });
    // flag with 7 stars
    const fx = cx + 9, fz = cz - 7;
    box([0.35, 10, 0.35], at(fx, 5, fz), C(200, 190, 140), { Material: "Metal" });
    dball(0.7, at(fx, 10.2, fz), GOLD, { neon: true });
    for (let s = 0; s <= 4; s++) dbox([5, 0.6, 0.12], at(fx - 2.7, 9.4 - s * 0.6, fz), s % 2 === 0 ? RED : WHITE);
    dbox([2.6, 1.8, 0.16], at(fx - 1.5, 8.8, fz - 0.02), C(30, 50, 140));
    const STARS = [[-0.8, 0.5], [0, 0.5], [0.8, 0.5], [-0.4, 0], [0.4, 0], [-0.8, -0.5], [0.8, -0.5]];
    for (const s of STARS) {
      neon([0.3, 0.3, 0.2], K.mul(at(fx - 1.5 + s[0], 8.8 + s[1], fz + 0.1), RA(0, 0, rad(45))), WHITE);
      neon([0.3, 0.3, 0.2], K.mul(at(fx - 1.5 + s[0], 8.8 + s[1], fz - 0.14), RA(0, 0, rad(45))), WHITE);
    }
    // socks: 5 on the floor + 1 decoy hanging off the flagpole
    const sock = (base, col) => {
      dbox([0.6, 1.4, 0.6], K.mul(base, T(0, 0.7, 0)), col);
      dbox([0.6, 0.5, 1.2], K.mul(base, T(0, 0.25, -0.4)), col);
    };
    sock(at(cx, 0.1, cz - 10, 30), C(255, 120, 200));
    sock(at(cx - 11, 0.1, cz + 4, 0), WHITE);
    sock(at(cx + 8, 0.1, cz + 6, 120), C(60, 200, 90));
    sock(at(cx - 5, 0.1, cz + 12, 200), C(255, 200, 0));
    sock(at(cx + 11, 0.1, cz - 2, 80), C(120, 80, 255));
    sock(K.mul(at(fx + 0.3, 10.6, fz), RA(0, 0, rad(160))), RED);
    // fishbowl with 4 fish
    z.part({ shape: "cylinder", size: [3, 3, 3], at: [cx - 10, 1.5, cz - 6], color: deskWood, material: "wood" });
    dball(3.4, at(cx - 10, 4.7, cz - 6), C(170, 220, 255), { transparency: 0.75 });
    for (const f of [[-0.7, 0.3, 0.2], [0.6, -0.4, -0.3], [0.1, 0.7, 0.5], [-0.2, -0.6, -0.6]]) {
      dball(0.55, at(cx - 10 + f[0], 4.7 + f[1], cz - 6 + f[2]), C(255, 130, 20), { neon: true });
    }
    // couch + bookshelf
    box([8, 1.6, 3], at(cx + 2, 0.8, cz + 10), C(200, 180, 140), { Material: "Fabric" });
    box([8, 2.4, 0.8], at(cx + 2, 2, cz + 11.5), C(200, 180, 140), { Material: "Fabric" });
    box([1.2, 7, 5], at(cx - 13, 3.5, cz + 2), deskWood, { Material: "Wood" });
    for (let b = 0; b <= 5; b++) {
      dbox([0.9, 1.4, 0.4], at(cx - 12.6, 2 + Math.floor(b / 3) * 2.4, cz + 0.4 + (b % 3) * 1.2), [RED, C(30, 60, 160), GOLD][b % 3]);
    }
    // closet behind the portrait: the safe
    const cl = { x0: 43, x1: 57, z0: -170, z1: -156 }; // inside the north wall's span: no side gaps
    box([1, H, cl.z1 - cl.z0], at(cl.x0, H / 2, (cl.z0 + cl.z1) / 2), cream, { Material: "SmoothPlastic" });
    box([1, H, cl.z1 - cl.z0], at(cl.x1, H / 2, (cl.z0 + cl.z1) / 2), cream, { Material: "SmoothPlastic" });
    box([cl.x1 - cl.x0 + 1, H, 1], at(cx, H / 2, cl.z0), cream, { Material: "SmoothPlastic" });
    box([cl.x1 - cl.x0 + 1, 1, cl.z1 - cl.z0 + 1], at(cx, H + 0.5, (cl.z0 + cl.z1) / 2), cream, { Material: "SmoothPlastic" });
    const safe = box([3, 4, 1.5], at(54, 2, -168.8), C(70, 75, 85), { Material: "DiamondPlate" });
    dtext([2.4, 1.8, 0.1], at(54, 2.6, -168), C(20, 20, 25), "SAFE\n[ _ _ _ _ ]", GOLD, { face: "back" });
    neon([0.4, 0.4, 0.2], at(55.1, 0.8, -168), RED);
    z.part({ size: [0.4, 0.4, 0.4], at: [50, 10, -163], transparency: 1, decor: true, light: { color: C(255, 220, 160), intensity: 1.5, range: 18 } });
    z.cat(67, at(46, 0, -164.5, 90), { locked: true });
    codePad(safe, "safe", 67, {
      title: "Presidential Safe", hint: "4 digits", kind: "digits", max: 4, lock: 15, prompt: "Open the safe",
      wrongText: "BZZT. Wrong combination. (15 s)",
      win: () => {
        z.unlock(67);
        z.notify("The safe clicks open. Classified Cat is now... declassified!");
      },
    }, "7534");
  }

  // 68 Debate stages
  {
    area = "debate";
    const STAGES = [
      { z: -125, answer: 2, cands: [
        ["WHISKERS", "\"Mittens is a liar.\"", K.C.grey, "stripes"],
        ["MITTENS", "\"Sir Fluff is a liar.\"", K.C.white, "spots"],
        ["SIR FLUFF", "\"Whiskers and Mittens are BOTH liars.\"", K.C.cream, "plain"],
      ] },
      { z: -145, answer: 3, cands: [
        ["BISCUIT", "\"Noodle and Pickles are BOTH honest.\"", K.C.tan, "plain"],
        ["NOODLE", "\"Pickles is a liar.\"", K.C.black, "tuxedo"],
        ["PICKLES", "\"Biscuit is a liar.\"", C(150, 200, 90), "stripes"],
      ] },
      { z: -165, answer: 1, cands: [
        ["CLAWDIA", "\"Exactly ONE of us three is honest.\"", K.C.white, "calico"],
        ["TUNA", "\"Pawl and Clawdia are BOTH liars.\"", C(110, 130, 160), "plain"],
        ["PAWL", "\"Tuna and Clawdia are the same: both honest or both liars.\"", K.C.brown, "tuxedo"],
      ] },
    ];
    sign("THE GREAT VOID DEBATE\nEvery candidate is either HONEST (always tells the truth)\nor a LIAR (always lies).\nOn each stage, vote for the honest candidate.\nVote stage 1, then 2, then 3. The votes are counted\nafter stage 3. Any mistake: back to stage 1.", 86, 6, -140, 20, -140, 13, 7, { rim: GOLD, color: PAPER });
    STAGES.forEach((st, si0) => {
      const si = si0 + 1;
      box([42, 1.5, 9], at(115, 0.75, st.z), C(30, 40, 90), { Material: "Fabric" });
      neon([42, 0.3, 0.4], at(115, 1.6, st.z + 4.5), GOLD);
      const boards = K.model("DebateBoards");
      {
        const scf = facing(91, 4, st.z, 60, st.z);
        K.block(boards, [5, 0.25, 0.5], K.mul(scf, T(0, 1.12, 0)), GOLD, { neon: true });
        K.text(K.block(boards, [5, 2, 0.4], scf, SIGN_BG), "STAGE " + si, { color: GOLD });
      }
      st.cands.forEach((cd, ci0) => {
        const ci = ci0 + 1;
        const x = 101 + ci0 * 14;
        const c = K.cat({ bodyShape: "tall", color: cd[2], pattern: cd[3], color2: K.C.white, color3: K.C.ginger, eyes: ci === 2 ? "big" : "normal", mouth: "o", whiskers: false, innerEars: false });
        decoyCat(c.model, x, 1.5, st.z - 2, Math.PI);
        box([4, 3.5, 2], at(x, 3.25, st.z + 1.5), C(110, 70, 40), { Material: "Wood" });
        // the quote board above the candidate names them too
        const qcf = facing(x, 10.5, st.z - 3, x, st.z + 20);
        K.block(boards, [12, 0.25, 0.5], K.mul(qcf, T(0, 1.72, 0)), GOLD, { neon: true });
        K.text(K.block(boards, [12, 3.2, 0.4], qcf, SIGN_BG), cd[0] + ": " + cd[1], { color: WHITE });
        const vote = box([2.2, 0.9, 0.5], at(x, 2.5, st.z + 2.6), GREEN, { Material: "Neon" });
        // "VOTE" on the button's audience (south) face, plus the candidate's name plate on the podium
        K.text(K.block(boards, [2.1, 0.8, 0.05], at(x, 2.5, st.z + 2.88, 180), C(0, 200, 90)), "VOTE", { color: C(0, 40, 10) });
        K.text(K.block(boards, [3.6, 1, 0.2], at(x, 4.2, st.z + 2.6, 180), SIGN_BG), cd[0], { color: GOLD });
        const cast = () => {
          if (z.has(68) || z.isUnlocked(68)) {
            z.notify("The election is over. Mittens won!");
            return;
          }
          if (!notLocked("debate")) return;
          const votes = (z.flag("debate") || []).slice();
          if (si !== votes.length + 1) {
            z.fail("Vote on stage " + (votes.length + 1) + " next!");
            return;
          }
          votes[si0] = ci;
          z.flag("debate", votes);
          z.tone(1 + si * 0.2);
          if (si < STAGES.length) {
            z.notify(`Stage ${si}: you voted for ${cd[0]}. Now stage ${si + 1}.`);
            return;
          }
          z.flag("debate", null);
          for (let j = 0; j < STAGES.length; j++) {
            if (votes[j] !== STAGES[j].answer) {
              z.lockout(20, "debate");
              z.fail("A LIAR won one of the stages! Back to stage 1. (20 s)");
              return;
            }
          }
          z.unlock(68);
          z.notify("All three honest candidates elected! Mittens The Honest's cage is open.");
          z.sound("action_get_up.mp3");
        };
        z.click(vote, cast, { distance: 26 });
        z.prompt(vote, `VOTE ${cd[0]} (stage ${si})`, cast, { distance: 3 });
      });
      const b = K.bounds(boards);
      addGroup(K.finish(boards), b.center);
    });
    box([10, 1, 10], at(115, 0.5, -181), GOLD, { Material: "Foil" });
    z.cat(68, at(115, 1, -181, 180), { locked: true });
  }

  // 69 Tuna Football + monument
  {
    area = "monument";
    const mx = 175, mz = -172;
    const marble = C(232, 230, 222);
    box([12, 2, 12], at(mx, 1, mz), marble, { Material: "Marble" });
    box([5, 34, 5], at(mx, 19, mz), marble, { Material: "Marble" });
    const tip = prop("MonumentTip", (m) => K.block(m, [3.6, 3.6, 3.6], RA(rad(45), 0, rad(45)), GOLD, { neon: true }), z.pos(mx, 37.5, mz));
    animate(tip, { spin: 45 });
    for (const o of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) {
      box([0.35, 9, 0.35], at(mx + o[0], 4.5, mz + o[1]), C(200, 200, 210), { Material: "Metal" });
      dbox([0.15, 1.6, 3], at(mx + o[0], 8, mz + o[1] + 1.6), PURPLE);
    }
    box([10, 1, 10], at(mx, 0.5, -151), C(30, 40, 90), { Material: "Fabric" });
    neon([10.4, 0.2, 10.4], at(mx, 1.05, -151), GOLD, { transparency: 0.5 });
    z.cat(69, at(mx, 1, -151, 180), { locked: true });
    box([2, 3, 2], at(158, 1.5, -150), marble, { Material: "Marble" });
    const ccf = at(158, 4, -150, 90);
    const caseP = box([3, 2, 0.9], ccf, C(90, 55, 30), { Material: "Fabric" });
    dbox([0.3, 0.4, 1.4], at(158, 5.2, -150), C(30, 30, 30));
    neon([0.2, 0.4, 0.5], K.mul(ccf, T(0, 0.4, -0.5)), GOLD);
    sign("THE TUNA FOOTBALL\nLaunch code for the Catnip Rocket =\n[number of words in the Speech]\n[valid votes of the WINNING party]\n[the LAST digit of the President's safe]\nNo spaces.", 150, 5.5, -160, 120, -150, 11, 7, { rim: GOLD, color: PAPER });
    codePad(caseP, "football", 69, {
      title: "Catnip Rocket launch code", hint: "digits, no spaces", kind: "digits", max: 8, lock: 20, prompt: "Open the Tuna Football",
      wrongText: "LAUNCH ABORTED. Wrong code. (20 s)",
      win: () => {
        z.unlock(69);
        z.notify("Launch code accepted! The Cat-In-Chief salutes you. Cage open!");
        z.sound("impact_explosion_03.mp3", { volume: 0.4 });
      },
    }, "11144");
    // rocket prop
    const rx = 182, rz = -132;
    z.part({ shape: "cylinder", size: [4, 14, 4], at: [rx, 9, rz], color: WHITE, material: "metal" });
    z.part({ shape: "sphere", size: [4, 4, 4], at: [rx, 16, rz], color: RED });
    for (const a of [0, 90, 180, 270]) dwedge([0.3, 4, 2.5], K.mul(at(rx, 3.5, rz, a), T(0, 0, 2.6)), RED);
  }

  // ============================================================================================ the funhouse (70-71)
  area = "funhouse";
  const FUN_FLOOR = C(24, 4, 26);
  island(-20, 95, 40, 190, PINK, FUN_FLOOR);
  box([30, 4, 10], at(110, -2, 45), FUN_FLOOR, { Material: "Slate" });
  neon([30, 0.3, 0.5], at(110, 0.1, 40.25), PINK);
  z.billboard([10, 18, 48], "THE FUNHOUSE  HAHAHAHA", { width: 22, height: 3.5, color: PINK, distance: 250 });
  z.part({ size: [0.5, 0.5, 0.5], at: [40, 10, 110], transparency: 1, decor: true, light: { color: PINK, intensity: 2, range: 45 } });
  // floating laughing faces
  for (let i = 1; i <= 7; i++) {
    const x = rnum(-10, 90), zz = rnum(50, 185);
    const y = rnum(14, 30);
    const yaw = Math.atan2(x - 10, zz - 40); // turn the face (-Z) towards (10, y, 40)
    const g = prop("LaughFace", (m) => {
      K.ball(m, 5, T(0, 0, 0), C(255, 220, 0), { neon: true });
      K.block(m, [1.2, 0.3, 0.3], K.mul(T(-1, 0.8, -2.4), RA(0, 0, rad(20))), C(30, 0, 30));
      K.block(m, [1.2, 0.3, 0.3], K.mul(T(1, 0.8, -2.4), RA(0, 0, rad(-20))), C(30, 0, 30));
      K.block(m, [2.6, 1.2, 0.4], T(0, -0.9, -2.3), C(120, 0, 40));
    }, z.pos(x, y, zz), yaw);
    animate(g, { amp: 2, period: 3 + i * 0.5 });
  }
  for (let i = 1; i <= 10; i++) {
    const p = z.part({ size: [1.5, 8 + (i % 3) * 4, 1.5], at: [-15 + (i - 1) * 11, 4 + (i % 3) * 2, 186], color: PINK, material: "neon", decor: true });
    z.tag(p, "Rainbow", { period: 3 + i * 0.2 });
  }

  // 70 the shy button
  {
    area = "arena";
    const ax = 40, az = 110;
    const RAD = 14;
    dcyl(0.2, 50, at(ax, 0.1, az), C(50, 10, 50));
    for (let i = 0; i <= 15; i++) {
      const a = i / 16 * Math.PI * 2;
      const pos = [ax + Math.cos(a) * 24, 2.5, az + Math.sin(a) * 24];
      if (i % 4 === 0) {
        const post = z.part({ size: [1, 5, 1], at: pos, color: PINK, material: "neon", decor: true });
        z.tag(post, "Rainbow", { period: 2 });
      } else {
        neon([1, 5, 1], at(...pos), i % 2 === 0 ? PINK : C(255, 220, 0));
      }
    }
    const SPOTS = [];
    for (let i = 0; i <= 7; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8;
      SPOTS.push([ax + Math.cos(a) * RAD, az + Math.sin(a) * RAD]);
      dcyl(0.1, 6, at(SPOTS[i][0], 0.22, SPOTS[i][1]), C(90, 20, 90));
    }
    let cur = 0;
    const spotLocal = (i) => [SPOTS[i][0], 0.6, SPOTS[i][1]];
    const btn = z.part({ shape: "cylinder", size: [5, 1, 5], at: spotLocal(cur), color: C(235, 20, 30), material: "neon", dynamic: true });
    const bl = z.billboard(btn, "DO NOT PRESS", { width: 7, height: 1.6, color: WHITE, distance: 90, offset: [0, 3, 0] });
    let lastRun = -1e9;
    // the avatar faces (sin yaw, cos yaw) - the physics turns it towards its velocity, or the camera in shift-lock
    const lookingAt = () => {
      const p = z.player.pos();
      const tx = SPOTS[cur][0] - p[0], tz = SPOTS[cur][1] - p[2];
      const d = Math.hypot(tx, tz);
      if (d < 0.5) return false;
      const av = ctx.player.avatar;
      if (!av) return false;
      const yaw = av.rotation.y;
      return (Math.sin(yaw) * tx + Math.cos(yaw) * tz) / d > 0.3;
    };
    const runAway = () => {
      const now = z.time();
      if (now - lastRun < 0.5) return;
      lastRun = now;
      const p = z.player.pos();
      let best = cur, bd = -1;
      SPOTS.forEach((s, i) => {
        if (i === cur) return;
        const d = Math.hypot(s[0] - p[0], s[1] - p[2]);
        if (d > bd) { best = i; bd = d; }
      });
      cur = best;
      btn.moveTo(spotLocal(cur));
      bl.setText("HAHAHA!");
      laugh();
      after(1, () => bl.setText("DO NOT PRESS"));
    };
    let acc = 0;
    z.heartbeat((dt) => {
      acc += dt;
      if (acc < 0.1) return;
      acc = 0;
      if (z.has(70) || z.isUnlocked(70)) return;
      const p = z.player.pos();
      if (Math.hypot(SPOTS[cur][0] - p[0], SPOTS[cur][1] - p[2]) < 12 && lookingAt()) runAway();
    });
    z.touch(btn, () => {
      if (z.has(70) || z.isUnlocked(70)) return;
      if (lookingAt()) {
        z.notify("HAHAHA! It saw your FACE!");
        runAway();
        return;
      }
      z.unlock(70);
      z.notify("CLICK. You pressed it! Do Not Press Cat's cage is open. (It's laughing anyway.)");
      z.sound("action_jump_land.mp3");
      laugh();
    }, { cooldown: 0.5 });
    z.cat(70, at(ax, 0, az, 180), { locked: true });
    sign("THE SHY BUTTON\nPress the big red button to free Do Not Press Cat.\nBut it is VERY shy: if it can see your FACE,\nit runs away. HAHAHA.\nIt cannot see your back. (Or your side.)", 14, 5, 92, -10, 60, 12, 6, { rim: PINK, color: C(255, 200, 240) });
  }

  // 71 the laughing maze
  {
    area = "maze";
    const X0 = 100, X1 = 120, XC = 110;
    const LANES = [104, 110, 116];
    const H = 12;
    const wallCol = C(40, 8, 44);
    const ROOMS = [
      { doors: ["HA HA HA", "HA", "HAHA"], correct: 3 },
      { doors: ["HAHAHA", "HAHAHAHA", "hahaha"], correct: 1 },
      { doors: ["HAHAHAHAHA", "HA ha HA HA HA", "haha HAHAHA"], correct: 2 },
      { doors: ["HAHAHAHA haha", "HAHAHAHAHAHA", "HA HA HA HA HA"], correct: 3 },
      { doors: ["HAHAHA HAHAHA", "HAHAHAHAHAHAHA", "HAHAhaHAHAHA"], correct: 1 },
      { doors: ["HAHAHAHAHAHA", "HAHAHAHAHAHAHAHA", "hahahahahahaha"], correct: 0 },
    ];
    const wall = (x0, x1, z0, z1, y0, y1, extra) => box([x1 - x0, y1 - y0, z1 - z0], at((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), wallCol, extra || { Material: "Slate" });
    const curtains = K.model("Curtains");
    const curtainsB = K.model("Curtains2");
    const PINK_CURTAIN = C(255, 60, 190);
    const YELLOW = C(255, 230, 0);
    const curtain = (m, x, zz, text) => K.text(K.block(m, [4, 8, 0.4], at(x, 4, zz), PINK_CURTAIN), text, { color: WHITE });
    let prevLane = null;
    ROOMS.forEach((rm, i0) => {
      const i = i0 + 1;
      const z0 = 50 + i0 * 19;
      const z1 = z0 + 14;
      box([20, 2, 14], at(XC, -1, (z0 + z1) / 2), FUN_FLOOR, { Material: "Slate" });
      neon([18, 0.06, 0.3], at(XC, 0.03, (z0 + z1) / 2), PINK, { transparency: 0.5 });
      // side walls (room + band)
      wall(X0 - 1, X0, z0, z1 + 5, 0, H);
      if (i === 6) {
        // east wall of room 6 hides the fake section z 149..153
        wall(X1, X1 + 1, z0, z0 + 4, 0, H);
        wall(X1, X1 + 1, z0 + 8, z1 + 5, 0, H);
        wall(X1, X1 + 1, z0 + 4, z0 + 8, 8, H);
        const fake = box([0.6, 8, 4], at(X1 + 0.5, 4, z0 + 6), wallCol, { CanCollide: false, Material: "Slate" });
        z.label(fake, "HAHAHAHAHAHAHA", { color: YELLOW, face: "left", stroke: true });
        K.text(K.block(curtainsB, [3.2, 0.1, 2.2], at(XC, 0.06, z0 + 4), C(255, 250, 220)), "no doorway in here laughs 7 times. HAHAHA.\nmaybe a WALL does.", { color: C(60, 0, 40), face: "top" });
      } else {
        wall(X1, X1 + 1, z0, z1 + 5, 0, H);
      }
      // near wall
      const open = i === 1 ? [107, 113] : [prevLane - 2, prevLane + 2];
      wall(X0, open[0], z0 - 0.5, z0 + 0.5, 0, H);
      wall(open[1], X1, z0 - 0.5, z0 + 0.5, 0, H);
      wall(open[0], open[1], z0 - 0.5, z0 + 0.5, 8, H);
      // far wall with 3 doorways (curtains)
      for (const seg of [[100, 102], [106, 108], [112, 114], [118, 120]]) {
        wall(seg[0], seg[1], z1 - 0.5, z1 + 0.5, 0, H);
        // lane dividers through the band
        wall(seg[0], seg[1], z1 + 0.5, z1 + 5, 0, H);
      }
      wall(X0, X1, z1 - 0.5, z1 + 0.5, 8, H);
      dbox([21, 1, 5.5], at(XC, H + 0.5, z1 + 2.75), wallCol);
      LANES.forEach((lx, li0) => {
        curtain(i <= 3 ? curtains : curtainsB, lx, z1, rm.doors[li0]);
        // every lane LOOKS floored (no peeking through the curtain); only the right one is solid
        box([4, 2, 5], at(lx, -1, z1 + 2.5), FUN_FLOOR, { Material: "Slate", CanCollide: rm.correct === li0 + 1 });
      });
      prevLane = rm.correct ? LANES[rm.correct - 1] : null;
      // graffiti on solid side walls (they really are solid)
      if (i === 2) K.text(K.block(curtains, [0.1, 2.5, 6], at(X0 + 0.06, 6, z0 + 7), wallCol), "HAHAHA", { color: YELLOW, face: "right" });
      else if (i === 3) K.text(K.block(curtains, [0.1, 2.5, 6], at(X1 - 0.06, 6, z0 + 7), wallCol), "lol", { color: CYAN, face: "left" });
      else if (i === 4) K.text(K.block(curtainsB, [0.1, 2.5, 6], at(X0 + 0.06, 6, z0 + 7), wallCol), "HAHAHAHAHA", { color: YELLOW, face: "right" });
    });
    // entrance label
    K.text(K.block(curtains, [6, 2, 0.2], at(XC, 9, 49.3), PINK_CURTAIN), "HA", { color: WHITE });
    for (const m of [curtains, curtainsB]) {
      const b = K.bounds(m);
      addGroup(K.finish(m), b.center);
    }
    sign("THE LAUGHING MAZE\nEvery doorway laughs. Walk through the one that laughs\nexactly ONE more \"HA\" than the last one you went through.\nThis entrance laughs: HA\nlowercase \"ha\" is a whisper. Whispers don't count.\nWrong doorway? HAHAHAHA.", 97, 6, 44, 70, 44, 13, 7, { rim: PINK, color: C(255, 200, 240) });
    // kill slab under the maze (wrong lanes have no floor)
    const slab = box([26, 1, 124], at(XC, -12, 115), PINK, { Material: "Neon", Transparency: 0.4 });
    z.kill(slab);
    // final room (east of room 6)
    const fz0 = 50 + 5 * 19 - 2;
    box([21, 2, 18], at(130.5, -1, fz0 + 9), FUN_FLOOR, { Material: "Slate" });
    wall(121, 141, fz0 - 1, fz0, 0, H);
    wall(121, 141, fz0 + 18, fz0 + 19, 0, H);
    wall(141, 142, fz0 - 1, fz0 + 19, 0, H);
    for (let i = 0; i <= 5; i++) {
      const p = z.part({ size: [1, 10, 1], at: [124 + i * 3.2, 5, fz0 + 0.5], color: PINK, material: "neon", decor: true });
      z.tag(p, "Rainbow", { period: 1.5 + i * 0.2 });
    }
    z.cat(71, at(132, 0, fz0 + 9, 90), {});
  }

  flushAll();
}
