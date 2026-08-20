-- ItemModels3.lua -- item builders, part 3: the five Dumbbell World items
-- (protein, dumbbell, pushups, situps, universe) and the four Lava Zone items
-- (lavaball, lavaplanet, lavaeclipse, gdstar).
-- Each builder returns a FRESH anchored Model (~1-5 stud bounding box) with
-- PrimaryPart set; Shop.GiveTool turns the PrimaryPart into the Tool Handle.
-- All cross-module calls go through G (never require siblings).

local M = {}
local G = nil

--------------------------------------------------------------------
-- Small local helpers
--------------------------------------------------------------------

-- Unparented fresh Model (Util.model defaults its parent to workspace,
-- which we do not want for a builder result).
local function newModel(name)
	local m = Instance.new("Model")
	m.Name = name
	return m
end

-- Generic ParticleEmitter factory. Default particle texture only -- the
-- contract bans marketplace asset ids.
local function emitter(parent, opts)
	local pe = Instance.new("ParticleEmitter")
	pe.Color = opts.color
	pe.LightEmission = opts.light or 0
	pe.Lifetime = NumberRange.new(opts.lifeMin or 0.5, opts.lifeMax or 1.2)
	pe.Speed = NumberRange.new(opts.speedMin or 1, opts.speedMax or 3)
	pe.Rate = opts.rate or 10
	pe.SpreadAngle = Vector2.new(opts.spread or 180, opts.spread or 180)
	pe.Size = NumberSequence.new({
		NumberSequenceKeypoint.new(0, opts.size0 or 0.25),
		NumberSequenceKeypoint.new(1, opts.size1 or 0),
	})
	pe.Transparency = NumberSequence.new(opts.transparency or 0.15)
	pe.Acceleration = opts.accel or Vector3.new(0, 0, 0)
	pe.Parent = parent
	return pe
end

-- PointLight factory.
local function light(parent, color, brightness, range)
	local pl = Instance.new("PointLight")
	pl.Color = color
	pl.Brightness = brightness
	pl.Range = range
	pl.Parent = parent
	return pl
end

-- Random point on a sphere of radius r centered at the origin
-- (uniform: pick cos(polar) uniformly in [-1,1], azimuth in [0,2pi)).
local function spherePoint(r)
	local u = math.random() * 2 - 1        -- cos of polar angle
	local th = math.random() * 2 * math.pi -- azimuth
	local s = math.sqrt(1 - u * u)         -- sin of polar angle
	return Vector3.new(s * math.cos(th) * r, u * r, s * math.sin(th) * r)
end

--------------------------------------------------------------------
-- protein -- chocolate protein bar, foil still wrapped over one end,
-- red label band with wrapper text.
--------------------------------------------------------------------
local function buildProtein()
	local U = G.Util
	local m = newModel("protein")

	-- Exposed chocolate half (x > 0) with raised break-apart segment ridges.
	local bar = U.part{Name = "Handle", Size = Vector3.new(1.4, 0.32, 0.9),
		CFrame = CFrame.new(0.45, 0, 0), Color = Color3.fromRGB(88, 55, 30),
		Material = "SmoothPlastic", Parent = m}
	for i = 1, 3 do
		-- three chocolate squares sitting proud of the bar top
		U.part{Name = "Segment", Size = Vector3.new(0.34, 0.1, 0.78),
			CFrame = CFrame.new(-0.05 + i * 0.42, 0.18, 0),
			Color = Color3.fromRGB(100, 63, 35), Material = "SmoothPlastic", Parent = m}
	end

	-- Shiny foil wrapper still covering the other end (x < 0).
	local foil = U.part{Name = "Foil", Size = Vector3.new(1.05, 0.42, 1.0),
		CFrame = CFrame.new(-0.62, 0, 0), Color = Color3.fromRGB(212, 216, 224),
		Material = "Metal", Reflectance = 0.45, Parent = m}
	-- crinkle ridges in the foil
	U.part{Name = "Crinkle1", Size = Vector3.new(0.07, 0.46, 1.02),
		CFrame = CFrame.new(-0.32, 0, 0) * CFrame.Angles(math.rad(4), 0, 0),
		Color = Color3.fromRGB(228, 232, 240), Material = "Metal", Reflectance = 0.6, Parent = m}
	U.part{Name = "Crinkle2", Size = Vector3.new(0.07, 0.46, 1.02),
		CFrame = CFrame.new(-0.9, 0, 0) * CFrame.Angles(math.rad(-5), 0, 0),
		Color = Color3.fromRGB(228, 232, 240), Material = "Metal", Reflectance = 0.6, Parent = m}
	-- torn foil edge: three tiny tilted silver flecks at the seam
	for i = 1, 3 do
		U.part{Name = "Torn", Size = Vector3.new(0.12, 0.12, 0.1),
			CFrame = CFrame.new(-0.1, 0.14, -0.35 + i * 0.24) * CFrame.Angles(0, 0, math.rad(45)),
			Color = Color3.fromRGB(220, 224, 232), Material = "Metal", Reflectance = 0.5, Parent = m}
	end
	-- pinched twisted end of the wrapper
	U.part{Name = "FoilEnd", Size = Vector3.new(0.22, 0.2, 0.5),
		CFrame = CFrame.new(-1.22, 0, 0) * CFrame.Angles(math.rad(20), 0, 0),
		Color = Color3.fromRGB(200, 205, 214), Material = "Metal", Reflectance = 0.4, Parent = m}

	-- Red label band wrapped around the foil, with wrapper text on top.
	local band = U.part{Name = "Band", Size = Vector3.new(0.55, 0.48, 1.06),
		CFrame = CFrame.new(-0.62, 0, 0), Color = "red",
		Material = "SmoothPlastic", Parent = m}
	U.surfaceText(band, "Top", "PROTEIN", "white", nil)

	m.PrimaryPart = bar
	return m
end

--------------------------------------------------------------------
-- dumbbell -- knurled metal handle + black hex plates on both ends.
-- A hexagonal prism is approximated by 3 identical blocks rotated
-- 0/60/120 degrees around the handle (X) axis: for flat-to-flat f the
-- blocks are f tall and f/sqrt(3) wide, which traces a regular hexagon.
--------------------------------------------------------------------
local function buildDumbbell()
	local U = G.Util
	local m = newModel("dumbbell")

	-- steel handle bar running through everything (cylinders lie along X)
	local handle = U.cyl{Name = "Handle", Size = Vector3.new(2.6, 0.32, 0.32),
		CFrame = CFrame.new(0, 0, 0), Color = Color3.fromRGB(150, 152, 158),
		Material = "Metal", Reflectance = 0.15, Parent = m}
	-- knurled grip sleeve in the middle (DiamondPlate reads as knurling)
	U.cyl{Name = "Knurl", Size = Vector3.new(1.1, 0.37, 0.37),
		CFrame = CFrame.new(0, 0, 0), Color = Color3.fromRGB(105, 106, 110),
		Material = "DiamondPlate", Parent = m}

	-- hex plates: f = 1.3 flat-to-flat, side = 1.3 / sqrt(3) = 0.75
	for _, sx in ipairs({-1, 1}) do
		for k = 0, 2 do
			U.part{Name = "HexPlate", Size = Vector3.new(0.45, 1.3, 0.75),
				CFrame = CFrame.new(sx * 1.05, 0, 0) * CFrame.Angles(math.rad(60 * k), 0, 0),
				Color = Color3.fromRGB(28, 28, 30), Material = "SmoothPlastic", Parent = m}
		end
		-- inner collar where the plate meets the bar
		U.cyl{Name = "Collar", Size = Vector3.new(0.1, 0.5, 0.5),
			CFrame = CFrame.new(sx * 0.78, 0, 0), Color = Color3.fromRGB(70, 70, 74),
			Material = "Metal", Parent = m}
		-- polished chrome end cap stamped on the outer face
		U.cyl{Name = "EndCap", Size = Vector3.new(0.08, 0.55, 0.55),
			CFrame = CFrame.new(sx * 1.31, 0, 0), Color = Color3.fromRGB(190, 192, 198),
			Material = "Metal", Reflectance = 0.4, Parent = m}
	end

	m.PrimaryPart = handle
	return m
end

--------------------------------------------------------------------
-- pushups -- a PAIR of steel pushup bars with foam grips, joined by a
-- thin base plate so the whole thing is one holdable item.
--------------------------------------------------------------------
local function buildPushups()
	local U = G.Util
	local m = newModel("pushups")

	-- thin joining base plate (this is what makes it ONE item)
	local base = U.part{Name = "Handle", Size = Vector3.new(2.4, 0.08, 2.0),
		CFrame = CFrame.new(0, 0.04, 0), Color = Color3.fromRGB(45, 45, 48),
		Material = "Metal", Parent = m}

	-- one bar on each side of the plate
	for _, sx in ipairs({-1, 1}) do
		local x = sx * 0.75
		-- two upright legs (cylinder rotated 90 deg about Z to stand on end)
		for _, sz in ipairs({-1, 1}) do
			U.cyl{Name = "Leg", Size = Vector3.new(0.55, 0.14, 0.14),
				CFrame = CFrame.new(x, 0.35, sz * 0.6) * CFrame.Angles(0, 0, math.rad(90)),
				Color = Color3.fromRGB(160, 162, 168), Material = "Metal",
				Reflectance = 0.2, Parent = m}
			-- rubber foot pad where the leg meets the plate
			U.cyl{Name = "Foot", Size = Vector3.new(0.06, 0.26, 0.26),
				CFrame = CFrame.new(x, 0.1, sz * 0.6) * CFrame.Angles(0, 0, math.rad(90)),
				Color = "black", Material = "SmoothPlastic", Parent = m}
		end
		-- horizontal grip bar bridging the two legs (rotated to lie along Z)
		U.cyl{Name = "GripBar", Size = Vector3.new(1.5, 0.16, 0.16),
			CFrame = CFrame.new(x, 0.64, 0) * CFrame.Angles(0, math.rad(90), 0),
			Color = Color3.fromRGB(160, 162, 168), Material = "Metal",
			Reflectance = 0.2, Parent = m}
		-- squishy foam grip sleeve over the middle of the bar
		U.cyl{Name = "Foam", Size = Vector3.new(0.9, 0.28, 0.28),
			CFrame = CFrame.new(x, 0.64, 0) * CFrame.Angles(0, math.rad(90), 0),
			Color = Color3.fromRGB(25, 25, 28), Material = "Fabric", Parent = m}
	end

	m.PrimaryPart = base
	return m
end

--------------------------------------------------------------------
-- situps -- inclined situp bench: red Fabric pad, steel frame legs,
-- foam ankle roller cylinders at the low end.
-- The pad runs along Z, tilted 22 deg about X so the +Z end is LOW
-- (rotation about +X maps local +Z downward), which is where the
-- ankle rollers go.
--------------------------------------------------------------------
local function buildSitups()
	local U = G.Util
	local m = newModel("situps")

	local tilt = CFrame.Angles(math.rad(22), 0, 0)

	-- padded bench top: center at y=1.1, half-length 1.5 so the ends sit
	-- at roughly y=1.66 (head, -Z) and y=0.54 (feet, +Z)
	local padCF = CFrame.new(0, 1.1, 0) * tilt
	local pad = U.part{Name = "Handle", Size = Vector3.new(0.95, 0.2, 3.0),
		CFrame = padCF, Color = Color3.fromRGB(190, 30, 35),
		Material = "Fabric", Parent = m}
	-- stitched seam across the pad + small headrest pad at the high end
	U.part{Name = "Seam", Size = Vector3.new(0.97, 0.06, 0.08),
		CFrame = padCF * CFrame.new(0, 0.09, 0.5),
		Color = Color3.fromRGB(140, 20, 25), Material = "Fabric", Parent = m}
	U.part{Name = "HeadPad", Size = Vector3.new(0.8, 0.14, 0.6),
		CFrame = padCF * CFrame.new(0, 0.16, -1.05),
		Color = Color3.fromRGB(160, 25, 30), Material = "Fabric", Parent = m}

	-- steel spine bolted under the pad
	U.part{Name = "Spine", Size = Vector3.new(0.3, 0.12, 2.8),
		CFrame = padCF * CFrame.new(0, -0.16, 0),
		Color = Color3.fromRGB(120, 122, 126), Material = "Metal", Parent = m}

	-- tall rear legs (under the high end) and short front legs (low end);
	-- pad underside heights there are about 1.5 and 0.65
	for _, sx in ipairs({-1, 1}) do
		U.part{Name = "RearLeg", Size = Vector3.new(0.12, 1.5, 0.12),
			CFrame = CFrame.new(sx * 0.35, 0.75, -1.1),
			Color = Color3.fromRGB(90, 92, 96), Material = "Metal", Parent = m}
		U.part{Name = "FrontLeg", Size = Vector3.new(0.12, 0.62, 0.12),
			CFrame = CFrame.new(sx * 0.35, 0.31, 1.1),
			Color = Color3.fromRGB(90, 92, 96), Material = "Metal", Parent = m}
	end
	-- floor feet bars tying each leg pair together
	U.part{Name = "FootBar", Size = Vector3.new(1.0, 0.08, 0.16),
		CFrame = CFrame.new(0, 0.04, -1.1), Color = Color3.fromRGB(60, 60, 64),
		Material = "Metal", Parent = m}
	U.part{Name = "FootBar", Size = Vector3.new(1.0, 0.08, 0.16),
		CFrame = CFrame.new(0, 0.04, 1.1), Color = Color3.fromRGB(60, 60, 64),
		Material = "Metal", Parent = m}

	-- ankle roller assembly at the low (+Z) end: upright post + two
	-- cross-axles, each axle carrying a pair of foam rollers (cylinders
	-- already lie along X, so no rotation needed)
	U.part{Name = "RollerPost", Size = Vector3.new(0.1, 0.8, 0.1),
		CFrame = CFrame.new(0, 0.44, 1.45), Color = Color3.fromRGB(120, 122, 126),
		Material = "Metal", Parent = m}
	for _, lvl in ipairs({{y = 0.76, z = 1.34}, {y = 0.32, z = 1.52}}) do
		U.cyl{Name = "Axle", Size = Vector3.new(1.1, 0.09, 0.09),
			CFrame = CFrame.new(0, lvl.y, lvl.z), Color = Color3.fromRGB(150, 152, 158),
			Material = "Metal", Reflectance = 0.2, Parent = m}
		for _, sx in ipairs({-1, 1}) do
			U.cyl{Name = "Roller", Size = Vector3.new(0.38, 0.34, 0.34),
				CFrame = CFrame.new(sx * 0.34, lvl.y, lvl.z),
				Color = Color3.fromRGB(20, 20, 24), Material = "Fabric", Parent = m}
		end
	end

	m.PrimaryPart = pad
	return m
end

--------------------------------------------------------------------
-- universe -- near-black sphere speckled with dozens of tiny neon
-- multicolor stars, a faint spiral wisp of pale gas hugging the
-- surface, and a subtle purple-blue glow.
--------------------------------------------------------------------
local function buildUniverse()
	local U = G.Util
	local m = newModel("universe")

	-- the void itself
	local core = U.part{Name = "Handle", Shape = "Ball", Size = Vector3.new(3, 3, 3),
		CFrame = CFrame.new(0, 0, 0), Color = Color3.fromRGB(8, 8, 18),
		Material = "SmoothPlastic", Parent = m}

	-- ~40 tiny star specks half-embedded at the surface (radius 1.5 =
	-- sphere radius, so each cube pokes halfway out), random bright hues
	for i = 1, 40 do
		local s = 0.08 + math.random() * 0.06
		U.part{Name = "Star", Size = Vector3.new(s, s, s),
			CFrame = CFrame.new(spherePoint(1.5)) *
				CFrame.Angles(math.random() * 3, math.random() * 3, math.random() * 3),
			Color = Color3.fromHSV(math.random(), 0.6 + math.random() * 0.4, 1),
			Neon = true, CanCollide = false, Parent = m}
	end

	-- faint spiral wisp: 12 translucent flakes winding from near the north
	-- pole down toward the equator, each turned flat against the sphere
	-- (CFrame.new(pos, target) aims local -Z at the target, so a thin
	-- Z-size lies tangent to the surface)
	for i = 1, 12 do
		local frac = i / 12
		local phi = 0.45 + frac * 1.5      -- polar angle from the top
		local th = i * 1.05                -- winding azimuth
		local r = 1.56
		local pos = Vector3.new(
			math.sin(phi) * math.cos(th) * r,
			math.cos(phi) * r,
			math.sin(phi) * math.sin(th) * r)
		U.part{Name = "Wisp", Size = Vector3.new(0.6, 0.24, 0.06),
			CFrame = CFrame.new(pos, Vector3.new(0, 0, 0)) * CFrame.Angles(0, 0, th),
			Color = Color3.fromRGB(205, 195, 235), Material = "SmoothPlastic",
			Transparency = 0.65, CanCollide = false, Parent = m}
	end

	light(core, Color3.fromRGB(150, 120, 255), 0.7, 9)

	m.PrimaryPart = core
	return m
end

--------------------------------------------------------------------
-- lavaball -- molten Neon orange sphere with dark Slate crust patches
-- floating on the surface + real fire particles.
--------------------------------------------------------------------
local function buildLavaball()
	local U = G.Util
	local m = newModel("lavaball")

	local core = U.part{Name = "Handle", Shape = "Ball", Size = Vector3.new(2.6, 2.6, 2.6),
		CFrame = CFrame.new(0, 0, 0), Color = Color3.fromRGB(255, 120, 20),
		Neon = true, Parent = m}

	-- cooling crust: dark slate blobs centered just inside the surface
	-- (sphere radius 1.3; patch centers at 1.05-1.15 so they bulge out)
	for i = 1, 9 do
		local d = 0.6 + math.random() * 0.35
		U.part{Name = "Crust", Shape = "Ball", Size = Vector3.new(d, d, d),
			CFrame = CFrame.new(spherePoint(1.05 + math.random() * 0.1)),
			Color = Color3.fromRGB(38, 32, 30), Material = "Slate",
			CanCollide = false, Parent = m}
	end

	-- fire licking off the ball
	emitter(core, {
		color = ColorSequence.new(Color3.fromRGB(255, 170, 40), Color3.fromRGB(220, 40, 10)),
		light = 1, rate = 22, lifeMin = 0.35, lifeMax = 0.8,
		speedMin = 2, speedMax = 4, size0 = 0.55, size1 = 0,
		accel = Vector3.new(0, 4, 0), spread = 180, transparency = 0.1,
	})
	light(core, Color3.fromRGB(255, 130, 30), 1.6, 11)

	m.PrimaryPart = core
	return m
end

--------------------------------------------------------------------
-- lavaplanet -- dark crusted world whose surface is split by glowing
-- Neon orange crack lines (thin slabs embedded through the crust) with
-- a few magma pools showing through + drifting ember particles.
--------------------------------------------------------------------
local function buildLavaplanet()
	local U = G.Util
	local m = newModel("lavaplanet")

	local crust = U.part{Name = "Handle", Shape = "Ball", Size = Vector3.new(3, 3, 3),
		CFrame = CFrame.new(0, 0, 0), Color = Color3.fromRGB(46, 36, 32),
		Material = "Slate", Parent = m}

	-- glowing cracks: thin neon slabs centered slightly under the surface
	-- (radius 1.45 vs sphere 1.5) with radial depth 0.35, so their edges
	-- break through the crust as jagged lit fissures. CFrame.new(pos, 0)
	-- points local -Z at the core, so slab Z = radial; a random roll about
	-- Z scatters the crack directions.
	for i = 1, 12 do
		local pos = spherePoint(1.45)
		U.part{Name = "Crack", Size = Vector3.new(0.6 + math.random() * 0.45, 0.09, 0.35),
			CFrame = CFrame.new(pos, Vector3.new(0, 0, 0)) *
				CFrame.Angles(0, 0, math.random() * math.pi),
			Color = Color3.fromRGB(255, 110, 15), Neon = true,
			CanCollide = false, Parent = m}
	end

	-- three round magma pools where the crust has melted through
	for i = 1, 3 do
		local d = 0.5 + math.random() * 0.2
		U.part{Name = "MagmaPool", Shape = "Ball", Size = Vector3.new(d, d, d),
			CFrame = CFrame.new(spherePoint(1.32)),
			Color = Color3.fromRGB(255, 140, 25), Neon = true,
			CanCollide = false, Parent = m}
	end

	-- slow embers drifting up off the planet
	emitter(crust, {
		color = ColorSequence.new(Color3.fromRGB(255, 150, 40), Color3.fromRGB(180, 40, 10)),
		light = 1, rate = 12, lifeMin = 0.8, lifeMax = 1.6,
		speedMin = 0.8, speedMax = 2, size0 = 0.14, size1 = 0,
		accel = Vector3.new(0, 1.5, 0), spread = 180, transparency = 0.1,
	})
	light(crust, Color3.fromRGB(255, 120, 25), 0.9, 9)

	m.PrimaryPart = crust
	return m
end

--------------------------------------------------------------------
-- lavaeclipse -- a black disc hanging in front of a larger Neon orange
-- corona ring, offset a touch so the fire blazes unevenly around the
-- rim, with flare spikes and a strong orange light.
-- Cylinders lie along X, so CFrame.Angles(0, 90deg, 0) turns each disc
-- to face along Z (the direction a Tool points).
--------------------------------------------------------------------
local function buildLavaeclipse()
	local U = G.Util
	local m = newModel("lavaeclipse")

	local faceZ = CFrame.Angles(0, math.rad(90), 0)

	-- outer soft glow halo (largest, most transparent, furthest back)
	U.cyl{Name = "Halo", Size = Vector3.new(0.08, 3.6, 3.6),
		CFrame = CFrame.new(0, 0, -0.2) * faceZ,
		Color = Color3.fromRGB(255, 110, 20), Neon = true,
		Transparency = 0.6, CanCollide = false, Parent = m}
	-- main corona disc
	U.cyl{Name = "Corona", Size = Vector3.new(0.16, 3.0, 3.0),
		CFrame = CFrame.new(0, 0, -0.12) * faceZ,
		Color = Color3.fromRGB(255, 120, 25), Neon = true, Parent = m}
	-- white-hot inner ring, mostly hidden behind the black disc so only
	-- a searing sliver shows at the rim
	U.cyl{Name = "InnerFire", Size = Vector3.new(0.18, 2.6, 2.6),
		CFrame = CFrame.new(0, 0, -0.05) * faceZ,
		Color = Color3.fromRGB(255, 205, 90), Neon = true, Parent = m}

	-- the eclipsing black disc, in FRONT and offset off-center so the
	-- corona blazes wider on one side of the rim
	local disc = U.cyl{Name = "Handle", Size = Vector3.new(0.2, 2.2, 2.2),
		CFrame = CFrame.new(0.13, 0.09, 0.1) * faceZ,
		Color = Color3.fromRGB(12, 10, 10), Material = "SmoothPlastic", Parent = m}

	-- six flare spikes radiating from behind the corona
	for k = 0, 5 do
		local a = math.rad(k * 60 + 18)
		U.part{Name = "Flare", Size = Vector3.new(0.12, 0.75, 0.06),
			CFrame = CFrame.new(0, 0, -0.15) * CFrame.Angles(0, 0, a) * CFrame.new(0, 1.7, 0),
			Color = Color3.fromRGB(255, 140, 40), Neon = true,
			Transparency = 0.3, CanCollide = false, Parent = m}
	end

	light(disc, Color3.fromRGB(255, 120, 25), 2.2, 13)

	m.PrimaryPart = disc
	return m
end

--------------------------------------------------------------------
-- gdstar -- GOLD 3D five-point star built from wedge pairs.
-- Geometry: 5 spikes every 72 deg around a gold hub disc. Each spike is
-- an isosceles triangle made of two right-triangle WedgeParts. A wedge
-- of size (t, L, w) is a right triangle in its Y-Z cross-section with
-- the tip on the top-back edge; rotating one wedge +90 deg and its twin
-- -90 deg about Y (and sliding them half a base apart) lands both tips
-- on the spike centerline, forming the point.
--------------------------------------------------------------------
local function buildGdstar()
	local U = G.Util
	local m = newModel("gdstar")

	local t = 0.42       -- star thickness
	local L = 1.35       -- spike length (radial)
	local w = 0.42       -- spike half-base
	local d = 0.5 + L / 2 -- radial distance to each spike's center
	local goldMetal = Color3.fromRGB(235, 180, 40)
	local goldNeon = Color3.fromRGB(255, 210, 70)

	-- central hub disc (cylinder turned to face along Z)
	local hub = U.cyl{Name = "Handle", Size = Vector3.new(t + 0.04, 1.15, 1.15),
		CFrame = CFrame.new(0, 0, 0) * CFrame.Angles(0, math.rad(90), 0),
		Color = goldMetal, Material = "Metal", Reflectance = 0.35, Parent = m}

	local edgeAng = math.atan2(w, L) -- slope of each spike edge off radial
	local edgeLen = math.sqrt(L * L + w * w)

	for k = 0, 4 do
		-- spike frame: local +Y points radially outward, +Z is star normal
		local spikeCF = CFrame.Angles(0, 0, math.rad(72 * k)) * CFrame.new(0, d, 0)

		-- the two mirrored wedges that form the point
		U.part{Name = "SpikeA", Shape = "Wedge", Size = Vector3.new(t, L, w),
			CFrame = spikeCF * CFrame.new(-w / 2, 0, 0) * CFrame.Angles(0, math.rad(90), 0),
			Color = goldMetal, Material = "Metal", Reflectance = 0.35, Parent = m}
		U.part{Name = "SpikeB", Shape = "Wedge", Size = Vector3.new(t, L, w),
			CFrame = spikeCF * CFrame.new(w / 2, 0, 0) * CFrame.Angles(0, math.rad(-90), 0),
			Color = goldMetal, Material = "Metal", Reflectance = 0.35, Parent = m}

		-- neon trim strips laid along both slanted edges; Z-size is a bit
		-- thicker than the star so the glow shows on both faces
		for _, sx in ipairs({-1, 1}) do
			U.part{Name = "Trim", Size = Vector3.new(0.07, edgeLen, t + 0.1),
				CFrame = spikeCF * CFrame.new(sx * w / 2, 0, 0) *
					CFrame.Angles(0, 0, sx * edgeAng),
				Color = goldNeon, Neon = true, CanCollide = false, Parent = m}
		end

		-- glowing bead capping each tip (tip sits at radius d + L/2)
		U.part{Name = "TipBead", Shape = "Ball", Size = Vector3.new(0.18, 0.18, 0.18),
			CFrame = CFrame.Angles(0, 0, math.rad(72 * k)) * CFrame.new(0, d + L / 2, 0),
			Color = goldNeon, Neon = true, CanCollide = false, Parent = m}
	end

	-- golden sparkles + warm light
	emitter(hub, {
		color = ColorSequence.new(Color3.fromRGB(255, 225, 120), Color3.fromRGB(255, 190, 40)),
		light = 1, rate = 9, lifeMin = 0.6, lifeMax = 1.3,
		speedMin = 1, speedMax = 3, size0 = 0.28, size1 = 0,
		accel = Vector3.new(0, 0.5, 0), spread = 180, transparency = 0.1,
	})
	light(hub, Color3.fromRGB(255, 205, 80), 1.6, 12)

	m.PrimaryPart = hub
	return m
end

--------------------------------------------------------------------
-- Init: register every builder on G.ItemBuilders
--------------------------------------------------------------------
function M.Init(g)
	G = g
	G.ItemBuilders.protein = buildProtein
	G.ItemBuilders.dumbbell = buildDumbbell
	G.ItemBuilders.pushups = buildPushups
	G.ItemBuilders.situps = buildSitups
	G.ItemBuilders.universe = buildUniverse
	G.ItemBuilders.lavaball = buildLavaball
	G.ItemBuilders.lavaplanet = buildLavaplanet
	G.ItemBuilders.lavaeclipse = buildLavaeclipse
	G.ItemBuilders.gdstar = buildGdstar
end

return M
