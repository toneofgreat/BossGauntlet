# REALISM.md: making Biscuit's Story look photographed

A short field guide for film agents. **The goal:** every frame should read as a photograph or a
Pixar/Disney-realistic CG still: physically motivated light, real materials and real lens behaviour.
A frame that reads as flat vector illustration has missed. Read with `FILMS.md` (story) and the
`scripts/filmkit.js` header (full API, one line each).

Preview constantly: `node tools/film-shots.mjs <id> [t1,t2] [outDir] [--nosubs] [--nolens]`, then Read the PNGs.
Model sheets: `tools/film-kit-sheet.js` (cats, pages 0-8), `tools/film-env-sheet.js` (env scenes),
`tools/.artifacts/people-sheet.js` (kid / hands).

---

## 1. The pipeline (what happens to your frame)

1. `draw(g,t,W,H)` paints a Canvas 2D frame (960x540 logical). It must stay a pure function of `t`.
2. The player uploads that frame to a **GPU lens** (`scripts/filmlens.js`). The lens:
   - expands the near-clipped pixels (lamps, flames, the sun, white-hot cores) into HDR;
   - adds bloom, halation and an optional anamorphic streak;
   - applies white balance, contrast, saturation, ACES tone mapping, lift/gamma/gain and a vignette;
   - adds luminance-weighted grain, edge chromatic aberration, gate weave and handheld drift.
3. Subtitles are drawn over the lens output, so they are never graded or grained.

**What this means for you:**
- **Paint in linear terms.** A light source is 255-white or a saturated amber at full value; a lit
  surface is never pure white.
- **Bloom only comes from lights.** A white wall or a pale sky does not bloom.
- **Don't fake lens effects in 2D.** Leave the glow halos, film grain, vignettes and orange tints to the lens.
- **Post calls become hints.** `K.bloom` / `K.vignette` / `K.grain` / `K.chromatic` on the main
  context are recorded as hints to the lens; they do no 2D work. On other contexts (layers, inset
  photos) they still paint in 2D. `K.letterbox` still paints its bars.

### Lens grade: `film.grade = {...}`, `film.gradeAt(t) => {...subset}` (last wins)

Precedence, lowest first: defaults -> `FILM_LOOKS[id]` -> the film's post hints -> `film.grade` -> `film.gradeAt(t)`.

| field | default | use |
|---|---|---|
| exposure | 0.9 | overall brightness before tone mapping (night 0.8-1.0, a bright void 0.75) |
| hdr | 1 | how hard near-clipped pixels become lights (0 = flat, 1.5 = hot lamps) |
| temp / tint | 0 / 0 | white balance: -1 cool .. +1 warm; magenta .. green |
| lift / gamma / gain | [.008]x3 / [1]x3 / [1]x3 | per-channel blacks, mids and highlights (lift blue for moonlit blacks) |
| sat / contrast | 0.92 / 1 | saturation; contrast around mid grey |
| bloom / threshold | 0.3 / 0.95 | bloom strength; scene-linear threshold (diffuse white = 1) |
| halation | 0.35 | red film glow around hot edges (candles, sun rims) |
| streak | 0 | anamorphic horizontal flare (0.05-0.15 for night lamps) |
| grain / grainSize | 0.05 / 1.35 | film grain, strongest in the mid-tones |
| ca | 0.5 | lateral chromatic aberration at the frame edges |
| vignette / vignetteColor | 0.4 / "#000000" | optical falloff |
| weave | 1 | gate weave plus handheld micro-drift (0 = locked tripod: dream shots, the void) |
| sharpen | 0.15 | light unsharp mask |
| mix | 1 | 0 bypasses the lens (debug only) |

Bloom is exposure-aware: in a bright scene (white room, pastel sky) it is cut back automatically,
so it never veils the subject. You still get a glow around a candle in the dark.

---

## 2. Kit API: the realism parts

### Cats: `drawCat(g,x,y,size,o)`

`size` is the shoulder height. Cats over about 40 device px take the layered photographic path:
fur texture, form shading, ambient occlusion, rim light and a soft fur fringe.

- **Pose and life:** `pose` (sit / stand / walk / run / sleep / loaf / look / pounce), `phase`, `facing`,
  `headTurn`, `headTilt`, `t`, `tail`, `tailUp`, `ears`, `mouth`, `gaze`, `blink`, plus
  `autoBlink` (default on) and `breath`.
- **Light:**
  - `key {x,y,color,strength}`: the form light. It sets the shading and the catchlights.
  - `rim {x,y,color,strength}`: the edge or back light.
  - `light`: sets both at once (the v1 behaviour).
  - `fill`: the colour of the shadow side, e.g. "#1c2a48" for night sky, "#6a3a1a" for warm bounce off wood.
  - `ambient` + `ambientK`: a wash over the whole cat (moonlight "#3a4a78", ~0.3).
  - `backlit 0..1`: ear translucency plus a warm subsurface edge.
  - `castShadow 0..1`: soft shadow away from the key. Set `ground` to the floor's dark colour.
- **Material:** `wet 0..1` (darker, clumped, drips), `eyesGlow`, and `pupil` (0 = slit in bright light, 1 = round in the dark).
- **Coats:** `COATS.biscuit|grey|black|cream|siamese|tuxedo|calico|white|ghost`, or your own object
  (`base light dark stripe tip belly white pattern sheen ...`).
- **Detail:** `lod` forces a detail level; `flat:true` takes the cheap path.

### People: `drawPerson(g,x,y,h,o)` / `drawHand(g,x,y,size,o)` / `flashlightBeam(...)`

Never show a face: use `view:'back'` or `'side'`, and use hands for POV.

- **drawPerson light:** `light {x,y,color,strength,z}`, where `z` runs from -1 (light behind the kid) to 1 (from the camera).
  Always pass `ambient` to match the scene. The default fill is about 3:1, so pass a darker fill
  for night (e.g. "#141c30").
- **drawPerson pose and state:** `wet`, `beads`, `hood`, `walk` / `run` + `phase`, `breathe`, `sway`, `sit`, `kneel`, `crouch`, `reach`.
- **Arm targets:** `armL` / `armR: {hand:[x,y]}`. Body units: shoulders at (+-9.5, -77). Hands over the ears: `armL:{hand:[-8,-90]}`.
- **drawHand:** `pose`, `item`, `grip`, `wet`, `light{...z}` (z < 0 makes the skin glow through when backlit), `ambient`, `bell`.
- **flashlightBeam(g,x,y,angle,len,{spread,alpha,t,dust,source,alpha0}):** a volumetric cone. Pass `t` so the dust drifts.

### Environment (filmenv + filmtex)

- **Textures:** `texture(name,o)`, `texRect`, `texFill`, `texPattern`, `texAvg`, `texBake(key,w,h,fn)`.
  - Names: turf soil mud asphalt puddles cobble brick plaster wood bark granite sand lavarock lava
    quilt fabric wallpaper metal shingle siding glassdrops cloud nebula noise foliage macro relief cardboard.
  - `texRect` options: `{scale, scaleY, ox, oy, rot, alpha, tint, tintAlpha, tintMode, mode, tex:{seed,...}}`.
- **groundPlane(g,W,H,{tex,horizon,scale,camX,camZ,fog,fogAmt,wet,sky,puddles,tint,...}):** a perspective
  ground that fades to the texture's mean colour at the horizon. While the camera is static it is
  cached. Do NOT put `t` or other per-frame values in its options unless you pass `cache:false`.
- **Sky and air:**
  - `sky({sun,night,haze,glow})`
  - `clouds({kind:'cumulus'|'stratus', sun})`: volumetric and self-shadowed.
  - `cloudLayer3d`: a perspective cloud deck.
  - `godRays`, `fog`
  - `moon(r,{phase,halo})`, `stars({milky})`
- **Light on surfaces:**
  - `lightPool(x,y,r,color,{intensity,flat})`: inverse-square light on the ground; `flat` about 0.3 for floors.
  - `volumetricBeam(x,y,angle,len,spread,{t,noise})`
  - `shadowBlob(x,y,w,h,{alpha,soft})`: contact shadow.
  - `aoEdge(x0,y0,x1,y1,{width,side})`: occlusion where a wall meets the floor.
  - `reflectStreak`: a light's long reflection on wet ground.
  - `bokehLights({lights:[{x,y,r,color}]})`: out-of-focus lights.
  - `heatShimmer`
- **Weather:** `rain({light})` (three depth layers), `splashes`, `glassDrops({light,density})`, `dust`, `fireflies`, `leaves`, `lightningBolt`.
- **Set pieces (cached):**
  - `grass({sun,dry})`, `tree({sun,night,kind})`, `hills({tex,sun,rim:colour})`, `stone({wet,lichen})`, `fence`
  - `house({glowColor})`, `room({wallpaper,lamp,window})`, `bed`, `streetlamp({cone,ground:y,flicker})`
  - `cardboardBox({wet})`, `puddleReflection`
- **Prewarm:** `texPrewarm(TEXTURE_NAMES-subset, budgetMs)` while a title card or a black frame is on
  screen, so the first frame of a shot does not stall.

---

## 3. Recipes

**Rainy night exterior (f00, f03, f07)**
- **Grade:** `{temp:-0.15, exposure:0.95, lift:[.004,.009,.022], contrast:1.08, halation:0.5, streak:0.1}`.
- **Background:**
  - `sky({night:true})`, then `stars` hidden by cloud.
  - `groundPlane({tex:'asphalt', wet:1, puddles:0.5, sky:'#1a2438', fog:'#0d1424'})`.
  - Houses with `glowColor:'#ffcf8a'`.
- **Lamps:**
  - `streetlamp({cone:true, ground:groundY})`.
  - A `reflectStreak` under every lamp and lit window. Wet ground mirrors lights as long vertical streaks, not round pools.
- **Cat:** `drawCat(..., {wet:0.8, key:lampPos, rim:{...moon, color:'#9fb4e0'}, fill:'#121a2c', ambientK:0.3, pupil:1})`.
- **Kid:** `drawPerson(..., {wet:1, hood:true, light:{...lamp, z:-0.4}, ambient:'#141c30'})`.
- **Rain and flashlight:**
  - `rain({light:{x,y,r,color}})`: the drops only show where the light is.
  - `splashes`, `glassDrops` on any window.
  - `flashlightBeam(..., {t, dust:true})` plus a `lightPool(..., {flat:0.3})` where the beam lands.

**Golden-hour meadow (f01, f02)**
- **Grade:** `{temp:0.25, gain:[1.04,1,0.93], sat:1.0, halation:0.45, bloom:0.35}`.
- **Sky:** sun low and just out of frame or behind the subject. Use `sky({sun:{x,y,color:'#ffd08a'}, haze:0.6})` and `godRays` from the sun.
- **Ground:**
  - `hills({sun, rim:'#ffe2b0', tex:'turf'})` with atmospheric haze that rises with distance.
  - `grass({sun:{x,y}})` gives back-lit tips. `tree({sun})`.
- **Cat:** `rim:{sun, strength:1.4, color:'#ffc070'}`, `backlit:0.8` (glowing ears), `key` from the sky side
  with a soft cool `fill:'#5a6a88'`, and `castShadow:0.7` toward the camera.
- **Air:** dust motes in the light (`dust`).

**Candle-lit interior (f06, f16)**
- **Grade:** `{temp:0.1, exposure:0.95, halation:0.55, bloom:0.4, contrast:1.06}`.
- **Room:**
  - Walls: `room({lamp:{x,y,color:'#ffb060'}})` or `texRect('plaster'|'wallpaper')` darkened with distance from the flame.
  - Floor: wood with `lightPool(flame, r~260, {flat:0.35})`.
  - `aoEdge` at every wall/floor seam.
- **Flames:** 255-white core inside an amber body (the lens blooms it). Add a flicker from `noise(t)` on both
  the pool intensity and the rim strength.
- **Cat:** `key` = the flame (low, so light comes from below), warm `fill:'#2a1608'`, `ambientK:0.1`,
  `castShadow:0.8` thrown up the wall.

**Void with a single light (f11, f14)**
- **Grade:** `{exposure:0.85, weave:0.4, lift:[0,0,0], grain:0.07, vignette:0.6}`.
- **Background:** pure black. Light falls off with the inverse square: `lightPool` on an implied floor plus
  `volumetricBeam` for the torch. Nothing outside the cone.
- **Subjects:** cats only as `rim` silhouettes plus `eyesGlow:0.6`. The kid gets `light.z:0.6` and `ambient:'#05060a'`.

**Neon dimension (f15)**
- **Grade:** `{sat:1.05, contrast:1.1, bloom:0.55, streak:0.15, halation:0.3, ca:1.2}`.
- **Lights:** saturated light sources at full value, so the lens makes them glow. Add `reflectStreak` on a glossy floor and
  `bokehLights` behind.
- **Lighting:** two-colour rim on every subject (magenta key `rim`, cyan `key`), dark `fill`.

**Sunrise reunion (f20)**
- **Grade:** `gradeAt(t)` pulling from `{temp:-0.05, exposure:0.85}` (pre-dawn blue) to
  `{temp:0.2, exposure:1.0, halation:0.5, bloom:0.4}` as the sun clears the horizon.
- **Sky:** `sky({sun, glow})` low on the horizon, `cloudLayer3d({sun})` with lit undersides, `fog` in the
  valleys, `godRays`.
- **Cat close-up:** `rim` = the sun (strength 1.6, `backlit:1`), `key` = the soft sky, catchlight from the sun,
  and `t` for breathing and blinks. Keep the face sharp and the background soft (`K.focus` / `dof`).

---

## 4. Do / don't

**DO**
- Pick ONE motivated key per shot and put every subject's `key`/`rim` at that light's real position.
- Darken with distance from the light (falloff), and add a contact shadow under everything that touches the ground.
- Use atmospheric perspective: far things are lower in contrast and shifted toward the haze/sky colour.
- Use textures at the right scale for the distance (`texRect` `scale`), and keep detail at three
  scales: shape, texture, grain (the lens adds the grain).
- Use eased camera moves (`K.ease.inOut`) and keep `weave` on (it is handheld). Use `weave:0` only for dreams or the void.
- Use a shallow depth of field on close-ups (`K.focus`/`K.dof`), with the subject's eyes sharp.
- Give characters secondary motion: pass `t` to every cat and person (breathing, blinks, ears, tail lag).

**DON'T**
- Don't use pure-white or flat single-colour shapes for surfaces. Never outline a shape with a stroke.
- Don't light everything evenly from the front. A subject brighter than its light source makes no sense.
- Don't paint your own vignette, grain, CA or full-screen orange tint (the lens does it, and a second copy looks fake).
- Don't put a big pale disc under a character as a "shadow" or a "light". Use `shadowBlob` / `lightPool`.
- Don't make clouds out of overlapping circles, trees out of symmetric triangles, or water out of a flat blue shape with white rings.
  Use the kit's `clouds`, `tree`, `puddleReflection` + `reflectStreak`.
- Never show a human face. No real brand names.

---

## 5. Performance rules (Intel UHD 620 budget: 2D draw <= 16 ms average at 960x540)

- **Cache static art:** build static art once with `K.sprite(key,...)`, `texBake`, or the kit's cached set pieces. A key must
  never contain `t` (check `K.cacheStats()`: a sprite miss on every frame means the key varies).
- **Keep pixel loops out of draw:** per-pixel work (`getImageData`, per-pixel loops) only goes inside sprite/texture builders,
  never per frame. Per-frame pixel effects belong to the lens (`film.grade`).
- **Big cats:** a big layered cat costs about 3-5 ms. Use at most 2-3 per frame.
- **Crowds:** pre-render each pose phase into sprites (see `films/lib1820.js spriteCat` / `warmCats`) and warm
  them during the previous shot.
- **First-frame stall:** the first frame of a new shot builds its textures, which takes 0.1-2 s. Hide this behind black frames, or call
  `texPrewarm` and warm the next shot during the one before (`lib012.js runFilm` does this).
- **Check timings:** after every change run `film-shots <id>` and read the ms column. The `all` table must stay <= 16 ms average.
