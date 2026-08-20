-- ItemModels2.lua -- celestial lifting items (Space World builders).
-- Registers G.ItemBuilders[id] for: moon, pluto, mars, earth, neptune,
-- jupiter, sun, blackhole. Every builder returns a FRESH Model with
-- PrimaryPart set, all parts Anchored, centred on the origin, and a
-- bounding box of roughly 2-4 studs (hand-holdable).
-- Spheres are Shape="Ball"; surface details are small flat parts slightly
-- embedded in the sphere so they follow the curve.

local M = {}
local G = nil

--------------------------------------------------------------------
-- Geometry helpers
--------------------------------------------------------------------

-- Tangent frame on a sphere: returns a CFrame sitting on the surface of a
-- sphere of radius r centred at `center`, aimed by yaw (spin around world Y)
-- and pitch (tilt up/down). The returned frame's local +Y axis points
-- radially OUTWARD, so a thin part sized (w, thick, h) placed at this CFrame
-- lies flat against the curve like a sticker. `lift` nudges the frame along
-- the radial direction: negative embeds it deeper, positive floats it.
local function onSphere(center, r, yaw, pitch, lift)
	local aim = CFrame.new(center) * CFrame.Angles(0, yaw, 0) * CFrame.Angles(pitch, 0, 0)
	-- aim's local -Z points at the chosen surface spot. Step out r studs,
	-- then rotate -90 deg about X so local +Y becomes the outward normal.
	return aim * CFrame.new(0, 0, -(r + (lift or 0))) * CFrame.Angles(-math.pi / 2, 0, 0)
end

-- Thin disc (cylinder) lying flat on the sphere surface -- craters, polar
-- caps, dark spots. Roblox cylinders lie along their X axis, so we roll the
-- tangent frame 90 deg about Z to point that X axis along the radial.
local function surfDisc(model, center, r, yaw, pitch, d, thick, color, material, lift)
	return G.Util.part({
		Name = "SurfDisc", Shape = "Cylinder",
		Size = Vector3.new(thick, d, d),
		CFrame = onSphere(center, r, yaw, pitch, lift) * CFrame.Angles(0, 0, math.pi / 2),
		Color = color, Material = material or "SmoothPlastic",
		CanCollide = false,
		Parent = model,
	})
end

-- Thin rectangular slab hugging the surface -- continents, cloud wisps,
-- heart lobes. `roll` spins the slab inside the tangent plane for variety.
local function surfSlab(model, center, r, yaw, pitch, w, h, thick, roll, color, material, lift, transparency)
	return G.Util.part({
		Name = "SurfSlab",
		Size = Vector3.new(w, thick, h),
		CFrame = onSphere(center, r, yaw, pitch, lift) * CFrame.Angles(0, roll or 0, 0),
		Color = color, Material = material or "SmoothPlastic",
		Transparency = transparency or 0,
		CanCollide = false,
		Parent = model,
	})
end

-- Latitude band: Roblox Ball parts stretch into ellipsoids when Size is not
-- uniform. A very flat ellipsoid slightly wider than the sphere's circular
-- cross-section at height hOff pokes out of the surface only along that ring,
-- reading as a coloured band wrapped around the globe.
local function band(model, center, r, hOff, height, color, material, extra)
	-- circle radius of the sphere's cross-section at that latitude
	local rr = math.sqrt(math.max(r * r - hOff * hOff, 0.01))
	return G.Util.part({
		Name = "Band", Shape = "Ball",
		Size = Vector3.new(rr * 2 + (extra or 0.06), height, rr * 2 + (extra or 0.06)),
		CFrame = CFrame.new(center + Vector3.new(0, hOff, 0)),
		Color = color, Material = material or "SmoothPlastic",
		CanCollide = false,
		Parent = model,
	})
end

-- Fresh unparented Model with an anchored core sphere as PrimaryPart.
local function newPlanet(name, d, color, material)
	local m = Instance.new("Model")
	m.Name = name
	local core = G.Util.part({
		Name = "Core", Shape = "Ball",
		Size = Vector3.new(d, d, d),
		CFrame = CFrame.new(0, 0, 0),
		Color = color, Material = material,
		Parent = m,
	})
	m.PrimaryPart = core
	return m, core
end

--------------------------------------------------------------------
-- MOON -- gray Slate ball pocked with darker embedded crater discs
--------------------------------------------------------------------

local function buildMoon()
	local c = Vector3.new(0, 0, 0)
	local r = 1.2
	local m = newPlanet("moon", r * 2, Color3.fromRGB(163, 162, 158), "Slate")
	-- craters: {yaw, pitch, diameter, gray shade}. Discs sit at lift -0.03 so
	-- their rims dip under the surface -- they read as shallow impact basins.
	local craters = {
		{0.30,  0.50, 0.62, 116}, {1.40, -0.20, 0.50, 106},
		{2.40,  0.35, 0.42, 122}, {3.40, -0.55, 0.55, 110},
		{4.30,  0.15, 0.34, 102}, {5.20, -0.30, 0.46, 114},
		{0.90, -0.78, 0.30, 108}, {2.90,  0.82, 0.36, 120},
		{5.80,  0.55, 0.28, 112},
	}
	for _, cr in ipairs(craters) do
		surfDisc(m, c, r, cr[1], cr[2], cr[3], 0.1,
			Color3.fromRGB(cr[4], cr[4], cr[4] - 3), "Slate", -0.03)
	end
	return m
end

--------------------------------------------------------------------
-- PLUTO -- tan icy ball with the lighter heart-shaped Tombaugh Regio
--------------------------------------------------------------------

local function buildPluto()
	local c = Vector3.new(0, 0, 0)
	local r = 1.2
	local m = newPlanet("pluto", r * 2, Color3.fromRGB(199, 173, 143), "Ice")
	local heart = Color3.fromRGB(238, 221, 192)
	-- The heart: two round lobes (discs) side by side plus a 45deg-rolled
	-- square whose corner points down -- classic two-circles-and-a-diamond
	-- heart. Small yaw/pitch deltas (about offset/r radians) walk the pieces
	-- across the curved surface instead of off it.
	local hy, hp = 0.5, 0.05 -- heart centre direction on the globe
	surfDisc(m, c, r, hy - 0.16, hp + 0.16, 0.5, 0.08, heart, "Ice", -0.01)
	surfDisc(m, c, r, hy + 0.16, hp + 0.16, 0.5, 0.08, heart, "Ice", -0.01)
	surfSlab(m, c, r, hy, hp - 0.10, 0.52, 0.52, 0.08, math.pi / 4, heart, "Ice", -0.01)
	-- a bit of darker cratered terrain elsewhere (Cthulhu Macula is dark red-brown)
	surfDisc(m, c, r, hy + math.pi, -0.1, 0.55, 0.08, Color3.fromRGB(140, 105, 80), "Slate", -0.02)
	surfDisc(m, c, r, hy + 2.3, 0.55, 0.34, 0.08, Color3.fromRGB(170, 140, 110), "Slate", -0.02)
	return m
end

--------------------------------------------------------------------
-- MARS -- red-orange Sand ball with white polar caps and dark maria
--------------------------------------------------------------------

local function buildMars()
	local c = Vector3.new(0, 0, 0)
	local r = 1.2
	local m = newPlanet("mars", r * 2, Color3.fromRGB(193, 96, 50), "Sand")
	-- polar ice caps: pitch +-1.45 rad is nearly straight up/down
	surfDisc(m, c, r, 0, 1.45, 0.72, 0.12, Color3.fromRGB(245, 243, 238), "Ice", -0.03)
	surfDisc(m, c, r, 0, -1.45, 0.58, 0.12, Color3.fromRGB(240, 238, 232), "Ice", -0.03)
	-- dark volcanic maria patches (Syrtis Major vibes)
	surfDisc(m, c, r, 0.7, 0.15, 0.5, 0.09, Color3.fromRGB(146, 68, 38), "Sand", -0.02)
	surfDisc(m, c, r, 2.5, -0.25, 0.4, 0.09, Color3.fromRGB(155, 74, 40), "Sand", -0.02)
	surfDisc(m, c, r, 4.4, 0.35, 0.32, 0.09, Color3.fromRGB(150, 70, 38), "Sand", -0.02)
	return m
end

--------------------------------------------------------------------
-- EARTH -- blue ball, green continent slabs, white cloud wisps, ice caps
--------------------------------------------------------------------

local function buildEarth()
	local c = Vector3.new(0, 0, 0)
	local r = 1.2
	local m = newPlanet("earth", r * 2, Color3.fromRGB(28, 98, 202), "SmoothPlastic")
	local land = Color3.fromRGB(58, 138, 62)
	local land2 = Color3.fromRGB(72, 150, 70)
	-- continents: clusters of overlapping Grass slabs at varied rolls so the
	-- coastlines look irregular rather than like neat rectangles
	surfSlab(m, c, r, 0.30, 0.35, 0.85, 0.55, 0.07, 0.5, land, "Grass", -0.01)   -- big northern landmass
	surfSlab(m, c, r, 0.55, 0.15, 0.55, 0.70, 0.07, -0.4, land2, "Grass", -0.015)
	surfSlab(m, c, r, 0.85, -0.35, 0.45, 0.75, 0.07, 0.2, land, "Grass", -0.01)  -- long southern tail
	surfSlab(m, c, r, 2.60, 0.25, 0.75, 0.60, 0.07, -0.6, land2, "Grass", -0.01) -- second landmass
	surfSlab(m, c, r, 2.95, -0.30, 0.60, 0.50, 0.07, 0.8, land, "Grass", -0.015) -- its southern lobe
	surfSlab(m, c, r, 4.30, 0.05, 0.40, 0.45, 0.07, 0.3, land2, "Grass", -0.01)  -- island continent
	surfSlab(m, c, r, 5.30, 0.55, 0.35, 0.30, 0.07, -0.2, land, "Grass", -0.015) -- small northern isle
	-- polar ice caps
	surfDisc(m, c, r, 0, 1.45, 0.6, 0.1, Color3.fromRGB(240, 245, 248), "Ice", -0.03)
	surfDisc(m, c, r, 0, -1.45, 0.66, 0.1, Color3.fromRGB(236, 242, 246), "Ice", -0.03)
	-- thin white cloud wisps floating just above the surface
	local cloud = Color3.fromRGB(250, 250, 250)
	surfSlab(m, c, r, 1.10, 0.55, 0.80, 0.22, 0.03, 0.9, cloud, "SmoothPlastic", 0.08, 0.35)
	surfSlab(m, c, r, 2.10, -0.15, 0.70, 0.18, 0.03, -0.5, cloud, "SmoothPlastic", 0.08, 0.4)
	surfSlab(m, c, r, 3.60, 0.30, 0.85, 0.20, 0.03, 0.3, cloud, "SmoothPlastic", 0.08, 0.35)
	surfSlab(m, c, r, 5.00, -0.50, 0.60, 0.16, 0.03, 1.2, cloud, "SmoothPlastic", 0.08, 0.4)
	surfSlab(m, c, r, 0.10, -0.05, 0.55, 0.15, 0.03, -1.0, cloud, "SmoothPlastic", 0.08, 0.45)
	return m
end

--------------------------------------------------------------------
-- NEPTUNE -- deep blue Ice giant with faint lighter latitude bands
--------------------------------------------------------------------

local function buildNeptune()
	local c = Vector3.new(0, 0, 0)
	local r = 1.2
	local m = newPlanet("neptune", r * 2, Color3.fromRGB(43, 70, 180), "Ice")
	-- faint lighter bands hugging three latitudes
	band(m, c, r, 0.45, 0.20, Color3.fromRGB(78, 108, 214), "Ice", 0.05)
	band(m, c, r, 0.00, 0.30, Color3.fromRGB(95, 132, 228), "Ice", 0.06)
	band(m, c, r, -0.50, 0.18, Color3.fromRGB(70, 100, 208), "Ice", 0.05)
	-- the Great Dark Spot, a storm slightly south of the equator
	surfDisc(m, c, r, 1.1, -0.25, 0.4, 0.08, Color3.fromRGB(24, 38, 120), "SmoothPlastic", -0.015)
	-- a small bright methane cirrus streak ("Scooter")
	surfSlab(m, c, r, 1.5, -0.05, 0.35, 0.10, 0.03, 0.4, Color3.fromRGB(210, 225, 250), "SmoothPlastic", 0.05, 0.25)
	return m
end

--------------------------------------------------------------------
-- JUPITER -- banded tan/orange/cream giant with the Great Red Spot
--------------------------------------------------------------------

local function buildJupiter()
	local c = Vector3.new(0, 0, 0)
	local r = 1.3
	local m = newPlanet("jupiter", r * 2, Color3.fromRGB(199, 166, 121), "Sand")
	-- alternating cloud belts and zones, top to bottom
	band(m, c, r, 0.66, 0.26, Color3.fromRGB(228, 212, 182), "Sand", 0.05) -- north polar cream zone
	band(m, c, r, 0.34, 0.30, Color3.fromRGB(182, 118, 70), "Sand", 0.06)  -- north equatorial brown belt
	band(m, c, r, 0.00, 0.26, Color3.fromRGB(234, 219, 190), "Sand", 0.06) -- bright equatorial zone
	band(m, c, r, -0.30, 0.28, Color3.fromRGB(170, 108, 64), "Sand", 0.06) -- south equatorial belt
	band(m, c, r, -0.62, 0.24, Color3.fromRGB(222, 203, 172), "Sand", 0.05) -- south cream zone
	-- Great Red Spot: a flattened ellipsoid pressed onto the southern belt.
	-- onSphere's +Y is radial, so the ellipsoid's thin axis points outward.
	G.Util.part({
		Name = "GreatRedSpot", Shape = "Ball",
		Size = Vector3.new(0.56, 0.14, 0.38),
		CFrame = onSphere(c, r, 0.9, -0.30, -0.02),
		Color = Color3.fromRGB(186, 78, 52), Material = "Sand",
		CanCollide = false,
		Parent = m,
	})
	return m
end

--------------------------------------------------------------------
-- SUN -- blazing Neon ball with corona shell, fire particles, PointLight
--------------------------------------------------------------------

local function buildSun()
	local c = Vector3.new(0, 0, 0)
	local r = 1.25
	local m, core = newPlanet("sun", r * 2, Color3.fromRGB(255, 186, 48), "Neon")
	-- translucent outer corona shell, a slightly larger deeper-orange ball
	G.Util.part({
		Name = "Corona", Shape = "Ball",
		Size = Vector3.new(r * 2 + 0.5, r * 2 + 0.5, r * 2 + 0.5),
		CFrame = CFrame.new(c),
		Color = Color3.fromRGB(255, 120, 25), Material = "Neon",
		Transparency = 0.65, CanCollide = false,
		Parent = m,
	})
	-- licking fire particles all over the surface
	local fire = Instance.new("ParticleEmitter")
	fire.Name = "SolarFire"
	fire.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 230, 130)),
		ColorSequenceKeypoint.new(0.5, Color3.fromRGB(255, 150, 40)),
		ColorSequenceKeypoint.new(1, Color3.fromRGB(220, 60, 20)),
	})
	fire.LightEmission = 1
	fire.Lifetime = NumberRange.new(0.35, 0.8)
	fire.Speed = NumberRange.new(1.5, 3.5)
	fire.SpreadAngle = Vector2.new(180, 180)
	fire.Rate = 28
	fire.Size = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.45),
		NumberSequenceKeypoint.new(1, 0),
	})
	fire.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.2),
		NumberSequenceKeypoint.new(1, 1),
	})
	fire.Parent = core
	-- warm bright light so the sun genuinely lights up its surroundings
	local light = Instance.new("PointLight")
	light.Brightness = 4
	light.Range = 22
	light.Color = Color3.fromRGB(255, 195, 95)
	light.Parent = core
	return m
end

--------------------------------------------------------------------
-- BLACK HOLE -- pure black ball, tilted Neon accretion ring, purple light
--------------------------------------------------------------------

local function buildBlackhole()
	local c = Vector3.new(0, 0, 0)
	local m, core = newPlanet("blackhole", 2.0, Color3.fromRGB(5, 5, 8), "SmoothPlastic")
	-- Accretion disk: two thin flattened Neon cylinders sharing a tilted
	-- plane. Cylinders lie along X, so Angles(0,0,90deg) stands the axis up
	-- (disc horizontal), then the whole plane is tilted ~20 deg. The black
	-- event-horizon ball covers the disc centres, so they read as rings.
	local tilt = CFrame.new(c) * CFrame.Angles(math.rad(18), 0, math.rad(24))
	-- the orange inner disc is thicker than the violet one, so its glow
	-- shows above and below where the two overlap -- a hot inner edge
	local ringOrange = G.Util.part({
		Name = "RingInner", Shape = "Cylinder",
		Size = Vector3.new(0.14, 2.7, 2.7),
		CFrame = tilt * CFrame.Angles(0, 0, math.pi / 2),
		Color = Color3.fromRGB(255, 140, 40), Material = "Neon",
		Transparency = 0.1, CanCollide = false,
		Parent = m,
	})
	local ringViolet = G.Util.part({
		Name = "RingOuter", Shape = "Cylinder",
		Size = Vector3.new(0.08, 3.5, 3.5),
		CFrame = tilt * CFrame.Angles(0, 0, math.pi / 2),
		Color = Color3.fromRGB(168, 70, 255), Material = "Neon",
		Transparency = 0.2, CanCollide = false,
		Parent = m,
	})
	-- eerie purple glow from the singularity
	local light = Instance.new("PointLight")
	light.Brightness = 2.5
	light.Range = 16
	light.Color = Color3.fromRGB(165, 70, 255)
	light.Parent = core
	-- the disks swirl: after the 90 deg roll their local X is the ring
	-- normal, so spinning about X rotates them within their own plane
	G.Util.spinner(ringViolet, "X", 1.6)
	G.Util.spinner(ringOrange, "X", 2.6)
	return m
end

--------------------------------------------------------------------
-- Init -- register every builder
--------------------------------------------------------------------

function M.Init(g)
	G = g
	G.ItemBuilders.moon = buildMoon
	G.ItemBuilders.pluto = buildPluto
	G.ItemBuilders.mars = buildMars
	G.ItemBuilders.earth = buildEarth
	G.ItemBuilders.neptune = buildNeptune
	G.ItemBuilders.jupiter = buildJupiter
	G.ItemBuilders.sun = buildSun
	G.ItemBuilders.blackhole = buildBlackhole
end

return M
