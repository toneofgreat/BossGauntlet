-- WorldSpace.lua -- the giant Space World observation platform at (0, 3000, 0).
-- Contract: WorldSpace.Build(G) builds everything under one Model "SpaceWorld".
-- Exposes M.ArrivalCF (set on the arrival pad). Return portal reads
-- G.WorldGym.SpawnCF at touch time. Part budget kept well under 1800.
-- Plain Lua 5.1 syntax only. All cross-module calls go through G.

local Players = game:GetService("Players")

local M = {}
local G = nil

function M.Init(g)
	G = g
end

--------------------------------------------------------------------
-- Layout constants
--------------------------------------------------------------------

local CX, CY, CZ = 0, 3000, 0          -- world center; CY is the MAIN floor top
local MAIN_HALF = 160                  -- main platform is 320 x 320
local OUT_DIST = 300                   -- outer platform center distance from origin
local OUT_HALF = 75                    -- outer platforms are 150 x 150
-- Outer platform floor-top heights (varied heights per contract)
local TOP_N = CY + 12                  -- north: kiosk row 1
local TOP_S = CY + 8                   -- south: kiosk row 2
local TOP_E = CY - 8                   -- east: return portal (sunken deck)
local TOP_W = CY + 6                   -- west: observation deck over Earth

local DARKGLASS = Color3.fromRGB(18, 24, 38)
local STEEL = Color3.fromRGB(95, 100, 110)
local TRIM = Color3.fromRGB(80, 220, 255)  -- cyan neon trim

--------------------------------------------------------------------
-- Small local helpers (all geometry goes through G.Util)
--------------------------------------------------------------------

local function U() return G.Util end

-- Invisible collidable wall.
local function invisWall(parent, cf, size)
	return U().part({Name = "InvisWall", Size = size, CFrame = cf,
		Transparency = 1, Anchored = true, CanCollide = true, Parent = parent})
end

-- One edge of a platform's safety wall. side: "N","S","E","W".
-- hasGap leaves a 24-stud opening centered on that edge (for a walkway).
local function sideWall(parent, cx, cz, half, topY, side, hasGap)
	local h, t = 50, 2
	local y = topY + h / 2
	if side == "N" or side == "S" then
		local z
		if side == "N" then z = cz - half else z = cz + half end
		if hasGap then
			local segLen = half - 12
			local segC = 12 + segLen / 2
			invisWall(parent, CFrame.new(cx - segC, y, z), Vector3.new(segLen, h, t))
			invisWall(parent, CFrame.new(cx + segC, y, z), Vector3.new(segLen, h, t))
		else
			invisWall(parent, CFrame.new(cx, y, z), Vector3.new(half * 2 + t, h, t))
		end
	else
		local x
		if side == "E" then x = cx + half else x = cx - half end
		if hasGap then
			local segLen = half - 12
			local segC = 12 + segLen / 2
			invisWall(parent, CFrame.new(x, y, cz - segC), Vector3.new(t, h, segLen))
			invisWall(parent, CFrame.new(x, y, cz + segC), Vector3.new(t, h, segLen))
		else
			invisWall(parent, CFrame.new(x, y, cz), Vector3.new(t, h, half * 2 + t))
		end
	end
end

-- Glowing walkway (possibly sloped) between two floor-top points a -> b.
-- Deck top is aligned with the two floor tops; neon guard rails both sides.
local function walkway(parent, a, b, width)
	local mid = (a + b) / 2
	local len = (b - a).Magnitude + 6
	local cf = CFrame.lookAt(mid, b)
	-- deck center sits 0.6 below the floor-top line so the deck TOP lines up
	local deck = U().part({Name = "WalkDeck", Size = Vector3.new(width, 1.2, len),
		CFrame = cf * CFrame.new(0, -0.6, 0), Color = STEEL, Material = "Metal",
		Parent = parent})
	-- glowing center stripe
	U().part({Name = "WalkGlow", Size = Vector3.new(width * 0.3, 0.2, len),
		CFrame = cf * CFrame.new(0, 0.05, 0), Color = TRIM, Neon = true,
		CanCollide = false, Parent = parent})
	-- guard rails (collidable so nobody rolls off the bridge)
	local rx = width / 2 - 0.4
	U().part({Name = "WalkRailL", Size = Vector3.new(0.8, 2.6, len),
		CFrame = cf * CFrame.new(-rx, 1.3, 0), Color = TRIM, Neon = true,
		Transparency = 0.25, Parent = parent})
	U().part({Name = "WalkRailR", Size = Vector3.new(0.8, 2.6, len),
		CFrame = cf * CFrame.new(rx, 1.3, 0), Color = TRIM, Neon = true,
		Transparency = 0.25, Parent = parent})
	return deck
end

-- Rectangular platform: dark glass floor slab, neon trim border, steel girders.
local function outerPlatform(parent, cx, cz, half, topY)
	local w = half * 2
	U().part({Name = "PlatFloor", Size = Vector3.new(w, 3, w),
		CFrame = CFrame.new(cx, topY - 1.5, cz), Color = DARKGLASS,
		Material = "Glass", Transparency = 0.15, Parent = parent})
	-- neon trim border (4 strips, slightly above floor top, walk-through)
	local strips = {
		{Vector3.new(w, 0.3, 1.2), CFrame.new(cx, topY + 0.1, cz - half + 0.6)},
		{Vector3.new(w, 0.3, 1.2), CFrame.new(cx, topY + 0.1, cz + half - 0.6)},
		{Vector3.new(1.2, 0.3, w), CFrame.new(cx - half + 0.6, topY + 0.1, cz)},
		{Vector3.new(1.2, 0.3, w), CFrame.new(cx + half - 0.6, topY + 0.1, cz)},
	}
	for _, s in ipairs(strips) do
		U().part({Name = "PlatTrim", Size = s[1], CFrame = s[2], Color = TRIM,
			Neon = true, CanCollide = false, Parent = parent})
	end
	-- two steel girders underneath
	U().part({Name = "PlatGirder", Size = Vector3.new(w, 3, 4),
		CFrame = CFrame.new(cx, topY - 4.5, cz - half / 2), Color = STEEL,
		Material = "DiamondPlate", Parent = parent})
	U().part({Name = "PlatGirder", Size = Vector3.new(w, 3, 4),
		CFrame = CFrame.new(cx, topY - 4.5, cz + half / 2), Color = STEEL,
		Material = "DiamondPlate", Parent = parent})
end

-- Scales a builder model by `factor` around its PrimaryPart, welds every part
-- to the primary and unanchors the rest so a spinner on the primary carries
-- the whole model. Returns the primary part (or nil).
local function scaleAndPrep(model, factor)
	local prim = model.PrimaryPart
	if not prim then
		prim = model:FindFirstChildWhichIsA("BasePart", true)
		model.PrimaryPart = prim
	end
	if not prim then return nil end
	local pcf = prim.CFrame
	local parts = {}
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("BasePart") then
			table.insert(parts, d)
		end
	end
	for _, p in ipairs(parts) do
		-- position relative to the primary, scaled; keep relative rotation
		local rel = pcf:ToObjectSpace(p.CFrame)
		p.Size = p.Size * factor
		p.CFrame = pcf * CFrame.new(rel.Position * factor) * (rel - rel.Position)
		p.CanCollide = false
	end
	for _, p in ipairs(parts) do
		if p ~= prim then
			U().weld(prim, p)
			p.Anchored = false
			p.Massless = true
		end
	end
	prim.Anchored = true
	return prim
end

-- Hologram shop kiosk: pedestal + floating scaled spinning item + name/price plate.
-- cf: floor-top CFrame, local -Z faces the shopper.
local function buildKiosk(parent, id, cf)
	local it = G.Config.ItemById(id)
	local km = U().model("Kiosk_" .. id, parent)
	-- pedestal base (vertical cylinder: cyl axis is X, roll it upright)
	U().cyl({Name = "KioskBase", Size = Vector3.new(1.2, 10, 10),
		CFrame = cf * CFrame.new(0, 0.6, 0) * CFrame.Angles(0, 0, math.rad(90)),
		Color = STEEL, Material = "Metal", Parent = km})
	U().part({Name = "KioskColumn", Size = Vector3.new(3, 5, 3),
		CFrame = cf * CFrame.new(0, 3.7, 0), Color = Color3.fromRGB(40, 44, 55),
		Material = "Metal", Parent = km})
	local top = U().cyl({Name = "KioskTop", Size = Vector3.new(0.6, 7, 7),
		CFrame = cf * CFrame.new(0, 6.5, 0) * CFrame.Angles(0, 0, math.rad(90)),
		Color = Color3.fromRGB(60, 66, 80), Material = "Metal", Parent = km})
	local lamp = Instance.new("PointLight")
	lamp.Color = TRIM
	lamp.Brightness = 1.5
	lamp.Range = 18
	lamp.Parent = top
	-- hologram beam + slow-spinning holo ring
	U().cyl({Name = "HoloBeam", Size = Vector3.new(8, 5, 5),
		CFrame = cf * CFrame.new(0, 10.8, 0) * CFrame.Angles(0, 0, math.rad(90)),
		Color = TRIM, Neon = true, Transparency = 0.78, CanCollide = false,
		Parent = km})
	local ring = U().cyl({Name = "HoloRing", Size = Vector3.new(0.35, 9, 9),
		CFrame = cf * CFrame.new(0, 7.1, 0) * CFrame.Angles(0, 0, math.rad(90)),
		Color = TRIM, Neon = true, Transparency = 0.45, CanCollide = false,
		Parent = km})
	-- a cylinder is symmetric about its axis, so spinning it is invisible;
	-- a slow vertical bob reads as a hologram scanner instead
	U().mover(ring, ring.CFrame, ring.CFrame + Vector3.new(0, 4.5, 0), 4)
	-- name / price plate on the front of the column
	local plate = U().part({Name = "KioskPlate", Size = Vector3.new(4.4, 2.4, 0.4),
		CFrame = cf * CFrame.new(0, 4.2, -1.8), Color = Color3.fromRGB(12, 14, 20),
		Material = "Metal", Parent = km})
	if it then
		U().label(plate, it.name .. "\n" .. U().fmt(it.cost), {
			width = 240, height = 78, offsetY = 3.2, textColor = "cyan",
			maxDistance = 260})
	end
	-- the item itself: built by its ItemModels builder, scaled ~4x, floating + spinning
	local m = nil
	local builder = G.ItemBuilders[id]
	if builder then
		local ok, res = pcall(builder)
		if ok and typeof(res) == "Instance" then m = res end
	end
	if not m then
		-- defensive fallback so a sibling builder error cannot kill the world build
		m = U().model("Item_" .. id, nil)
		local ball = U().part({Name = "Handle", Size = Vector3.new(2, 2, 2),
			Shape = "Ball", Color = "gray", Material = "Slate", Parent = m})
		m.PrimaryPart = ball
	end
	m.Name = "Display_" .. id
	m.Parent = km
	local prim = scaleAndPrep(m, 4)
	if prim then
		m:PivotTo(cf * CFrame.new(0, 13.5, 0))
		U().spinner(prim, "Y", 0.9)
	end
	return km
end

--------------------------------------------------------------------
-- Scenery builders
--------------------------------------------------------------------

-- 300+ tiny neon stars scattered on a spherical shell + nebula wisps.
-- Deterministic: fixed seed, restored afterwards.
local function buildStars(parent)
	math.randomseed(20260819)
	local folder = Instance.new("Folder")
	folder.Name = "StarField"
	folder.Parent = parent
	local center = Vector3.new(CX, CY, CZ)
	for i = 1, 320 do
		-- uniform point on a sphere: z uniform in [-1,1], theta uniform
		local z = math.random() * 2 - 1
		local th = math.random() * math.pi * 2
		local r = 1150 + math.random() * 120
		local s = math.sqrt(math.max(0, 1 - z * z))
		local pos = center + Vector3.new(s * math.cos(th) * r, z * r, s * math.sin(th) * r)
		local sz = 0.5 + math.random() * 0.9
		local roll = math.random()
		local col = "white"
		if roll > 0.88 then
			col = "gold"
		elseif roll > 0.72 then
			col = "lightblue"
		end
		U().part({Name = "Star", Size = Vector3.new(sz, sz, sz),
			CFrame = CFrame.new(pos) * CFrame.Angles(math.random() * 3, math.random() * 3, math.random() * 3),
			Color = col, Neon = true, CanCollide = false, Parent = folder})
	end
	-- nebula wisps: clusters of big soft transparent tinted balls (purple / teal)
	local wisps = {
		{Vector3.new(-700, 380, -650), "purple"},
		{Vector3.new(760, 200, 520), "cyan"},
		{Vector3.new(300, -420, -820), "purple"},
		{Vector3.new(-560, -180, 700), "cyan"},
		{Vector3.new(80, 640, 760), "purple"},
	}
	for _, w in ipairs(wisps) do
		local base = center + w[1]
		for j = 1, 3 do
			local d = 70 + math.random() * 80
			local off = Vector3.new(math.random() * 90 - 45, math.random() * 50 - 25, math.random() * 90 - 45)
			U().part({Name = "Nebula", Size = Vector3.new(d, d, d), Shape = "Ball",
				CFrame = CFrame.new(base + off), Color = w[2], Neon = true,
				Transparency = 0.86, CanCollide = false, Parent = folder})
		end
	end
	math.randomseed(os.time())
end

-- Ringed gas giant: banded ball + two flat tilted rings, all slowly spinning.
local function buildGasGiant(parent)
	local gm = U().model("GasGiant", parent)
	local pos = Vector3.new(CX + 520, CY + 170, CZ - 620)
	local base = CFrame.new(pos) * CFrame.Angles(0, 0, math.rad(18)) -- axial tilt
	local R = 80
	local ball = U().part({Name = "GiantBall", Size = Vector3.new(R * 2, R * 2, R * 2),
		Shape = "Ball", CFrame = base, Color = Color3.fromRGB(214, 178, 130),
		Material = "SmoothPlastic", CanCollide = false, Parent = gm})
	-- cloud bands: thin cylinders slightly wider than the sphere cross-section
	local bands = {
		{-48, Color3.fromRGB(170, 120, 80)},
		{-24, Color3.fromRGB(230, 200, 160)},
		{2, Color3.fromRGB(190, 130, 90)},
		{26, Color3.fromRGB(235, 210, 170)},
		{48, Color3.fromRGB(160, 110, 75)},
	}
	local extras = {}
	for _, b in ipairs(bands) do
		local h = b[1]
		local cross = math.sqrt(math.max(1, R * R - h * h))
		local d = cross * 2 + 2.5
		local band = U().cyl({Name = "GiantBand", Size = Vector3.new(7, d, d),
			CFrame = base * CFrame.new(0, h, 0) * CFrame.Angles(0, 0, math.rad(90)),
			Color = b[2], CanCollide = false, Parent = gm})
		table.insert(extras, band)
	end
	local ring1 = U().cyl({Name = "GiantRing", Size = Vector3.new(1.6, 330, 330),
		CFrame = base * CFrame.Angles(0, 0, math.rad(90)),
		Color = Color3.fromRGB(210, 190, 160), Transparency = 0.35,
		CanCollide = false, Parent = gm})
	local ring2 = U().cyl({Name = "GiantRingInner", Size = Vector3.new(1.8, 215, 215),
		CFrame = base * CFrame.Angles(0, 0, math.rad(90)),
		Color = Color3.fromRGB(150, 130, 105), Transparency = 0.15,
		CanCollide = false, Parent = gm})
	table.insert(extras, ring1)
	table.insert(extras, ring2)
	-- weld bands + rings to the ball so one spinner turns the whole planet
	for _, p in ipairs(extras) do
		U().weld(ball, p)
		p.Anchored = false
		p.Massless = true
	end
	U().spinner(ball, "Y", 0.05)
end

-- Asteroid cluster slowly orbiting an invisible pivot.
local function buildAsteroids(parent)
	local am = U().model("AsteroidBelt", parent)
	local pivot = U().part({Name = "AsteroidPivot", Size = Vector3.new(2, 2, 2),
		CFrame = CFrame.new(CX - 540, CY + 120, CZ + 480), Transparency = 1,
		CanCollide = false, Parent = am})
	math.randomseed(777001)
	for i = 1, 14 do
		local ang = math.random() * math.pi * 2
		local rad = 40 + math.random() * 55
		local yo = math.random() * 30 - 15
		local sz = 3 + math.random() * 6
		local shape = "Block"
		if math.random() > 0.6 then shape = "Ball" end
		local rock = U().part({Name = "Asteroid",
			Size = Vector3.new(sz, sz * (0.7 + math.random() * 0.6), sz * (0.7 + math.random() * 0.6)),
			Shape = shape,
			CFrame = pivot.CFrame * CFrame.new(math.cos(ang) * rad, yo, math.sin(ang) * rad)
				* CFrame.Angles(math.random() * 3, math.random() * 3, math.random() * 3),
			Color = Color3.fromRGB(105 + math.random(0, 30), 100 + math.random(0, 25), 95 + math.random(0, 20)),
			Material = "Slate", CanCollide = false, Parent = am})
		U().weld(pivot, rock)
		rock.Anchored = false
		rock.Massless = true
	end
	math.randomseed(os.time())
	U().spinner(pivot, "Y", 0.08)
end

-- Detailed Earth below the west platform edge: oceans, continents, ice caps, clouds.
local function buildEarth(parent)
	local em = U().model("EarthBelow", parent)
	local pos = Vector3.new(CX - 430, CY - 115, CZ + 10)
	local R = 60
	local globe = U().part({Name = "EarthGlobe", Size = Vector3.new(R * 2, R * 2, R * 2),
		Shape = "Ball", CFrame = CFrame.new(pos) * CFrame.Angles(0, 0, math.rad(12)),
		Color = Color3.fromRGB(30, 90, 190), Material = "SmoothPlastic",
		CanCollide = false, Parent = em})
	local extras = {}
	-- continents: green balls embedded so they bulge from the ocean
	math.randomseed(424242)
	for i = 1, 10 do
		local z = math.random() * 1.6 - 0.8
		local th = math.random() * math.pi * 2
		local s = math.sqrt(math.max(0, 1 - z * z))
		local dir = Vector3.new(s * math.cos(th), z, s * math.sin(th))
		local d = 22 + math.random() * 22
		local land = U().part({Name = "Continent", Size = Vector3.new(d, d, d),
			Shape = "Ball", CFrame = globe.CFrame * CFrame.new(dir * (R - d * 0.42)),
			Color = Color3.fromRGB(52 + math.random(0, 30), 140 + math.random(0, 30), 60),
			Material = "Grass", CanCollide = false, Parent = em})
		table.insert(extras, land)
	end
	-- polar ice caps
	for _, sign in ipairs({1, -1}) do
		local cap = U().part({Name = "IceCap", Size = Vector3.new(34, 34, 34),
			Shape = "Ball", CFrame = globe.CFrame * CFrame.new(0, sign * (R - 10), 0),
			Color = "white", Material = "Ice", CanCollide = false, Parent = em})
		table.insert(extras, cap)
	end
	-- cloud wisps just above the surface
	for i = 1, 6 do
		local z = math.random() * 1.4 - 0.7
		local th = math.random() * math.pi * 2
		local s = math.sqrt(math.max(0, 1 - z * z))
		local dir = Vector3.new(s * math.cos(th), z, s * math.sin(th))
		local cloud = U().part({Name = "Cloud", Size = Vector3.new(18, 18, 18),
			Shape = "Ball", CFrame = globe.CFrame * CFrame.new(dir * (R + 4)),
			Color = "white", Transparency = 0.45, CanCollide = false, Parent = em})
		table.insert(extras, cloud)
	end
	math.randomseed(os.time())
	for _, p in ipairs(extras) do
		U().weld(globe, p)
		p.Anchored = false
		p.Massless = true
	end
	U().spinner(globe, "Y", 0.06)
end

--------------------------------------------------------------------
-- Space-gym props under the central dome
--------------------------------------------------------------------

local function buildDomeGym(parent)
	local dm = U().model("DomeGym", parent)
	-- glass dome shell (walk-through) + neon base ring
	local dome = U().part({Name = "Dome", Size = Vector3.new(110, 110, 110),
		Shape = "Ball", CFrame = CFrame.new(CX, CY, CZ), Color = Color3.fromRGB(150, 200, 255),
		Material = "Glass", Transparency = 0.62, CanCollide = false, Parent = dm})
	U().cyl({Name = "DomeRing", Size = Vector3.new(0.6, 112, 112),
		CFrame = CFrame.new(CX, CY + 0.15, CZ) * CFrame.Angles(0, 0, math.rad(90)),
		Color = TRIM, Neon = true, Transparency = 0.3, CanCollide = false, Parent = dm})
	-- dome name sign
	local signAnchor = U().part({Name = "DomeSignAnchor", Size = Vector3.new(1, 1, 1),
		CFrame = CFrame.new(CX, CY + 58, CZ), Transparency = 1, CanCollide = false,
		Parent = dm})
	U().label(signAnchor, "ORBITAL GYM", {width = 320, height = 70, offsetY = 0,
		textColor = "cyan", maxDistance = 500})

	-- FLOATING WEIGHT RACK: frame + 6 detailed dumbbells, gently bobbing.
	-- rackCore is the anchored root; everything else is welded to it, so the
	-- Util.mover on rackCore carries the whole rack up and down.
	local rackCF = CFrame.new(CX - 26, CY + 3.5, CZ - 4) * CFrame.Angles(0, math.rad(35), 0)
	local rackCore = U().part({Name = "RackShelfLow", Size = Vector3.new(12, 0.8, 3),
		CFrame = rackCF * CFrame.new(0, -1.2, 0), Color = STEEL, Material = "Metal",
		CanCollide = false, Parent = dm})
	local rackParts = {}
	table.insert(rackParts, U().part({Name = "RackShelfHigh", Size = Vector3.new(12, 0.8, 3),
		CFrame = rackCF * CFrame.new(0, 1.6, -0.8), Color = STEEL, Material = "Metal",
		CanCollide = false, Parent = dm}))
	table.insert(rackParts, U().part({Name = "RackSideL", Size = Vector3.new(0.8, 5, 3.6),
		CFrame = rackCF * CFrame.new(-6.2, 0.4, -0.4), Color = Color3.fromRGB(40, 44, 55),
		Material = "Metal", CanCollide = false, Parent = dm}))
	table.insert(rackParts, U().part({Name = "RackSideR", Size = Vector3.new(0.8, 5, 3.6),
		CFrame = rackCF * CFrame.new(6.2, 0.4, -0.4), Color = Color3.fromRGB(40, 44, 55),
		Material = "Metal", CanCollide = false, Parent = dm}))
	table.insert(rackParts, U().part({Name = "RackGlow", Size = Vector3.new(12, 0.25, 0.4),
		CFrame = rackCF * CFrame.new(0, -1.7, 1.4), Color = TRIM, Neon = true,
		CanCollide = false, Parent = dm}))
	-- six dumbbells: handle cylinder + two heads (cyl axis already along X)
	for row = 0, 1 do
		for col = 0, 2 do
			local dcf = rackCF * CFrame.new(-4 + col * 4, -0.4 + row * 2.8, -0.8 * row)
			local handle = U().cyl({Name = "DbHandle", Size = Vector3.new(2.4, 0.5, 0.5),
				CFrame = dcf, Color = Color3.fromRGB(180, 185, 195), Material = "Metal",
				CanCollide = false, Parent = dm})
			table.insert(rackParts, handle)
			for _, sx in ipairs({-1.25, 1.25}) do
				table.insert(rackParts, U().cyl({Name = "DbHead", Size = Vector3.new(0.9, 1.6, 1.6),
					CFrame = dcf * CFrame.new(sx, 0, 0), Color = Color3.fromRGB(35, 35, 40),
					Material = "Metal", CanCollide = false, Parent = dm}))
			end
		end
	end
	for _, p in ipairs(rackParts) do
		U().weld(rackCore, p)
		p.Anchored = false
		p.Massless = true
	end
	U().mover(rackCore, rackCore.CFrame, rackCore.CFrame + Vector3.new(0, 1.4, 0), 6)

	-- flat bench (static, solid)
	local bcf = CFrame.new(CX + 2, CY, CZ - 22) * CFrame.Angles(0, math.rad(-15), 0)
	U().part({Name = "BenchLegA", Size = Vector3.new(1, 1.6, 2.4),
		CFrame = bcf * CFrame.new(-2.6, 0.8, 0), Color = "darkgray", Material = "Metal", Parent = dm})
	U().part({Name = "BenchLegB", Size = Vector3.new(1, 1.6, 2.4),
		CFrame = bcf * CFrame.new(2.6, 0.8, 0), Color = "darkgray", Material = "Metal", Parent = dm})
	U().part({Name = "BenchPad", Size = Vector3.new(7.5, 0.7, 2.6),
		CFrame = bcf * CFrame.new(0, 1.95, 0), Color = Color3.fromRGB(160, 30, 40),
		Material = "Fabric", Parent = dm})
	-- barbell resting on two stands
	local stcf = CFrame.new(CX + 22, CY, CZ + 8) * CFrame.Angles(0, math.rad(60), 0)
	for _, sx in ipairs({-3.4, 3.4}) do
		U().part({Name = "BarStand", Size = Vector3.new(1.2, 4.4, 2),
			CFrame = stcf * CFrame.new(sx, 2.2, 0), Color = Color3.fromRGB(40, 44, 55),
			Material = "Metal", Parent = dm})
	end
	local bar = U().cyl({Name = "BarbellBar", Size = Vector3.new(11, 0.5, 0.5),
		CFrame = stcf * CFrame.new(0, 4.6, 0), Color = Color3.fromRGB(190, 195, 205),
		Material = "Metal", Parent = dm})
	for _, sx in ipairs({-4.2, -3.5, 3.5, 4.2}) do
		local d = 3.4
		if sx == -3.5 or sx == 3.5 then d = 2.6 end
		U().cyl({Name = "BarPlate", Size = Vector3.new(0.55, d, d),
			CFrame = bar.CFrame * CFrame.new(sx, 0, 0), Color = "black",
			Material = "Metal", Parent = dm})
	end
	-- neon lifting circle on the floor
	U().cyl({Name = "LiftCircle", Size = Vector3.new(0.2, 16, 16),
		CFrame = CFrame.new(CX, CY + 0.12, CZ + 22) * CFrame.Angles(0, 0, math.rad(90)),
		Color = "gold", Neon = true, Transparency = 0.35, CanCollide = false, Parent = dm})
end

--------------------------------------------------------------------
-- Build
--------------------------------------------------------------------

function M.Build(g)
	G = g or G
	local world = U().model("SpaceWorld", workspace)

	----------------------------------------------------------------
	-- MAIN PLATFORM: 5x5 dark glass panels + neon seams + girders
	----------------------------------------------------------------
	local mainM = U().model("MainPlatform", world)
	for ix = 0, 4 do
		for iz = 0, 4 do
			local px = CX - 128 + ix * 64
			local pz = CZ - 128 + iz * 64
			local col = DARKGLASS
			if (ix + iz) % 2 == 0 then
				col = Color3.fromRGB(24, 32, 48) -- subtle checker
			end
			U().part({Name = "MainPanel", Size = Vector3.new(64, 3, 64),
				CFrame = CFrame.new(px, CY - 1.5, pz), Color = col,
				Material = "Glass", Transparency = 0.12, Parent = mainM})
		end
	end
	-- neon seam grid: 6 lines each direction (panel boundaries + borders)
	for i = 0, 5 do
		local o = -160 + i * 64
		U().part({Name = "SeamX", Size = Vector3.new(322, 0.3, 1.2),
			CFrame = CFrame.new(CX, CY + 0.08, CZ + o), Color = TRIM, Neon = true,
			Transparency = 0.2, CanCollide = false, Parent = mainM})
		U().part({Name = "SeamZ", Size = Vector3.new(1.2, 0.3, 322),
			CFrame = CFrame.new(CX + o, CY + 0.08, CZ), Color = TRIM, Neon = true,
			Transparency = 0.2, CanCollide = false, Parent = mainM})
	end
	-- steel girders under the glass
	for i = 0, 4 do
		U().part({Name = "MainGirder", Size = Vector3.new(320, 4, 5),
			CFrame = CFrame.new(CX, CY - 5, CZ - 128 + i * 64), Color = STEEL,
			Material = "DiamondPlate", Parent = mainM})
	end
	-- central support spire hanging into space with glowing rings
	U().cyl({Name = "Spire", Size = Vector3.new(90, 10, 10),
		CFrame = CFrame.new(CX, CY - 52, CZ) * CFrame.Angles(0, 0, math.rad(90)),
		Color = STEEL, Material = "Metal", Parent = mainM})
	for i = 1, 3 do
		U().cyl({Name = "SpireRing", Size = Vector3.new(1, 13, 13),
			CFrame = CFrame.new(CX, CY - 20 - i * 22, CZ) * CFrame.Angles(0, 0, math.rad(90)),
			Color = TRIM, Neon = true, CanCollide = false, Parent = mainM})
	end
	-- corner light pylons
	for _, c in ipairs({{-1, -1}, {1, -1}, {-1, 1}, {1, 1}}) do
		local px = CX + c[1] * 145
		local pz = CZ + c[2] * 145
		U().part({Name = "Pylon", Size = Vector3.new(1.6, 12, 1.6),
			CFrame = CFrame.new(px, CY + 6, pz), Color = Color3.fromRGB(40, 44, 55),
			Material = "Metal", Parent = mainM})
		local head = U().part({Name = "PylonHead", Size = Vector3.new(2.4, 2.4, 2.4),
			CFrame = CFrame.new(px, CY + 13, pz), Color = TRIM, Neon = true, Parent = mainM})
		local pl = Instance.new("PointLight")
		pl.Color = TRIM
		pl.Brightness = 2
		pl.Range = 45
		pl.Parent = head
	end

	----------------------------------------------------------------
	-- OUTER PLATFORMS (varied heights) + sloped glowing walkways
	----------------------------------------------------------------
	local outM = U().model("OuterPlatforms", world)
	outerPlatform(outM, CX, CZ - OUT_DIST, OUT_HALF, TOP_N)
	outerPlatform(outM, CX, CZ + OUT_DIST, OUT_HALF, TOP_S)
	outerPlatform(outM, CX + OUT_DIST, CZ, OUT_HALF, TOP_E)
	outerPlatform(outM, CX - OUT_DIST, CZ, OUT_HALF, TOP_W)
	local walkM = U().model("Walkways", world)
	walkway(walkM, Vector3.new(CX, CY, CZ - MAIN_HALF), Vector3.new(CX, TOP_N, CZ - (OUT_DIST - OUT_HALF)), 20)
	walkway(walkM, Vector3.new(CX, CY, CZ + MAIN_HALF), Vector3.new(CX, TOP_S, CZ + (OUT_DIST - OUT_HALF)), 20)
	walkway(walkM, Vector3.new(CX + MAIN_HALF, CY, CZ), Vector3.new(CX + (OUT_DIST - OUT_HALF), TOP_E, CZ), 20)
	walkway(walkM, Vector3.new(CX - MAIN_HALF, CY, CZ), Vector3.new(CX - (OUT_DIST - OUT_HALF), TOP_W, CZ), 20)

	----------------------------------------------------------------
	-- ARRIVAL PAD (south half of the main platform)
	----------------------------------------------------------------
	local padM = U().model("ArrivalPad", world)
	local pad = U().cyl({Name = "ArrivalPad", Size = Vector3.new(0.6, 18, 18),
		CFrame = CFrame.new(CX, CY + 0.3, CZ + 100) * CFrame.Angles(0, 0, math.rad(90)),
		Color = Color3.fromRGB(30, 34, 44), Material = "Metal", Parent = padM})
	U().cyl({Name = "ArrivalRing", Size = Vector3.new(0.3, 20, 20),
		CFrame = CFrame.new(CX, CY + 0.62, CZ + 100) * CFrame.Angles(0, 0, math.rad(90)),
		Color = TRIM, Neon = true, Transparency = 0.2, CanCollide = false, Parent = padM})
	U().cyl({Name = "ArrivalCore", Size = Vector3.new(0.2, 6, 6),
		CFrame = CFrame.new(CX, CY + 0.72, CZ + 100) * CFrame.Angles(0, 0, math.rad(90)),
		Color = "white", Neon = true, CanCollide = false, Parent = padM})
	local padLight = Instance.new("PointLight")
	padLight.Color = TRIM
	padLight.Brightness = 2
	padLight.Range = 30
	padLight.Parent = pad
	U().label(pad, "SPACE WORLD", {width = 300, height = 70, offsetY = 9,
		textColor = "cyan", maxDistance = 400})
	M.ArrivalCF = CFrame.new(CX, CY + 4, CZ + 100)

	----------------------------------------------------------------
	-- RETURN PORTAL to the gym (east platform)
	----------------------------------------------------------------
	local portM = U().model("ReturnPortal", world)
	local pcf = CFrame.new(CX + OUT_DIST + 40, TOP_E, CZ) * CFrame.Angles(0, math.rad(90), 0)
	for _, sx in ipairs({-6.5, 6.5}) do
		U().part({Name = "PortalPillar", Size = Vector3.new(3, 15, 3),
			CFrame = pcf * CFrame.new(sx, 7.5, 0), Color = "granite",
			Material = "Granite", Parent = portM})
		U().part({Name = "PortalPillarCap", Size = Vector3.new(3.8, 1.2, 3.8),
			CFrame = pcf * CFrame.new(sx, 15.6, 0), Color = Color3.fromRGB(60, 66, 80),
			Material = "Metal", Parent = portM})
	end
	local lintel = U().part({Name = "PortalLintel", Size = Vector3.new(17, 3, 3),
		CFrame = pcf * CFrame.new(0, 17.7, 0), Color = "granite",
		Material = "Granite", Parent = portM})
	U().label(lintel, "BACK TO GYM", {width = 260, height = 60, offsetY = 3,
		textColor = "gold", maxDistance = 300})
	local swirl = U().part({Name = "PortalSwirl", Size = Vector3.new(10, 15, 1),
		CFrame = pcf * CFrame.new(0, 7.5, 0), Color = "purple", Neon = true,
		Transparency = 0.35, CanCollide = false, Parent = portM})
	local pe = Instance.new("ParticleEmitter")
	pe.Color = ColorSequence.new(Color3.fromRGB(180, 90, 255), Color3.fromRGB(90, 40, 180))
	pe.LightEmission = 1
	pe.Rate = 18
	pe.Lifetime = NumberRange.new(0.8, 1.6)
	pe.Speed = NumberRange.new(1, 3)
	pe.SpreadAngle = Vector2.new(180, 180)
	pe.Size = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.8),
		NumberSequenceKeypoint.new(1, 0),
	})
	pe.Parent = swirl
	U().touchOnce(swirl, 1.5, function(player, char)
		-- read the gym spawn at TOUCH time (WorldGym sets SpawnCF in its Build)
		local cf = G.WorldGym and G.WorldGym.SpawnCF
		if not cf then cf = CFrame.new(0, 10, 0) end
		char:PivotTo(cf + Vector3.new(0, 6, 0))
	end)

	----------------------------------------------------------------
	-- HOLOGRAM SHOP KIOSKS: all 8 space items on the N + S platforms
	----------------------------------------------------------------
	local kioskM = U().model("Kiosks", world)
	local northIds = {"moon", "pluto", "mars", "earth"}
	local southIds = {"neptune", "jupiter", "sun", "blackhole"}
	for i, id in ipairs(northIds) do
		local x = CX - 51 + (i - 1) * 34
		-- default forward is -Z; rotate 180 so the kiosk faces the center (+Z)
		buildKiosk(kioskM, id, CFrame.new(x, TOP_N, CZ - OUT_DIST - 45) * CFrame.Angles(0, math.rad(180), 0))
	end
	for i, id in ipairs(southIds) do
		local x = CX - 51 + (i - 1) * 34
		buildKiosk(kioskM, id, CFrame.new(x, TOP_S, CZ + OUT_DIST + 45))
	end

	----------------------------------------------------------------
	-- WEST OBSERVATION DECK: telescope + bench over the Earth below
	----------------------------------------------------------------
	local obsM = U().model("ObservationDeck", world)
	local ocf = CFrame.new(CX - OUT_DIST - 50, TOP_W, CZ) * CFrame.Angles(0, math.rad(-90), 0)
	-- tripod telescope aimed down toward Earth
	for _, leg in ipairs({{-1.4, 0.9}, {1.4, 0.9}, {0, -1.5}}) do
		U().part({Name = "ScopeLeg", Size = Vector3.new(0.5, 4.6, 0.5),
			CFrame = ocf * CFrame.new(leg[1], 2.2, leg[2]) * CFrame.Angles(math.rad(12), 0, leg[1] * math.rad(-8)),
			Color = Color3.fromRGB(70, 55, 40), Material = "Metal", Parent = obsM})
	end
	U().cyl({Name = "ScopeTube", Size = Vector3.new(5, 1.3, 1.3),
		CFrame = ocf * CFrame.new(0, 5, 0) * CFrame.Angles(0, math.rad(90), math.rad(-25)),
		Color = Color3.fromRGB(180, 150, 60), Material = "Metal", Parent = obsM})
	U().cyl({Name = "ScopeLens", Size = Vector3.new(0.3, 1.5, 1.5),
		CFrame = ocf * CFrame.new(0, 3.9, -2.35) * CFrame.Angles(0, math.rad(90), math.rad(-25)),
		Color = "lightblue", Material = "Glass", Reflectance = 0.4, Parent = obsM})
	-- viewing bench
	U().part({Name = "ObsBench", Size = Vector3.new(8, 0.6, 2),
		CFrame = ocf * CFrame.new(0, 1.6, 6), Color = "brown", Material = "Wood", Parent = obsM})
	for _, sx in ipairs({-3.2, 3.2}) do
		U().part({Name = "ObsBenchLeg", Size = Vector3.new(0.8, 1.3, 1.8),
			CFrame = ocf * CFrame.new(sx, 0.65, 6), Color = "darkgray",
			Material = "Metal", Parent = obsM})
	end
	local obsSign = U().part({Name = "ObsSignPost", Size = Vector3.new(0.6, 7, 0.6),
		CFrame = ocf * CFrame.new(-12, 3.5, 0), Color = Color3.fromRGB(40, 44, 55),
		Material = "Metal", Parent = obsM})
	U().label(obsSign, "EARTH VIEWPOINT", {width = 260, height = 55, offsetY = 4.2,
		textColor = "lightblue", maxDistance = 250})

	----------------------------------------------------------------
	-- Scenery: stars, nebulas, gas giant, asteroids, Earth, dome gym
	----------------------------------------------------------------
	buildStars(world)
	buildGasGiant(world)
	buildAsteroids(world)
	buildEarth(world)
	buildDomeGym(world)

	----------------------------------------------------------------
	-- SAFETY: invisible edge walls + catch floor 150 studs below
	----------------------------------------------------------------
	local safeM = U().model("Safety", world)
	-- main platform: walkway gap on all four sides
	sideWall(safeM, CX, CZ, MAIN_HALF, CY, "N", true)
	sideWall(safeM, CX, CZ, MAIN_HALF, CY, "S", true)
	sideWall(safeM, CX, CZ, MAIN_HALF, CY, "E", true)
	sideWall(safeM, CX, CZ, MAIN_HALF, CY, "W", true)
	-- outer platforms: gap only on the side facing the center
	sideWall(safeM, CX, CZ - OUT_DIST, OUT_HALF, TOP_N, "N", false)
	sideWall(safeM, CX, CZ - OUT_DIST, OUT_HALF, TOP_N, "E", false)
	sideWall(safeM, CX, CZ - OUT_DIST, OUT_HALF, TOP_N, "W", false)
	sideWall(safeM, CX, CZ - OUT_DIST, OUT_HALF, TOP_N, "S", true)
	sideWall(safeM, CX, CZ + OUT_DIST, OUT_HALF, TOP_S, "S", false)
	sideWall(safeM, CX, CZ + OUT_DIST, OUT_HALF, TOP_S, "E", false)
	sideWall(safeM, CX, CZ + OUT_DIST, OUT_HALF, TOP_S, "W", false)
	sideWall(safeM, CX, CZ + OUT_DIST, OUT_HALF, TOP_S, "N", true)
	sideWall(safeM, CX + OUT_DIST, CZ, OUT_HALF, TOP_E, "E", false)
	sideWall(safeM, CX + OUT_DIST, CZ, OUT_HALF, TOP_E, "N", false)
	sideWall(safeM, CX + OUT_DIST, CZ, OUT_HALF, TOP_E, "S", false)
	sideWall(safeM, CX + OUT_DIST, CZ, OUT_HALF, TOP_E, "W", true)
	sideWall(safeM, CX - OUT_DIST, CZ, OUT_HALF, TOP_W, "W", false)
	sideWall(safeM, CX - OUT_DIST, CZ, OUT_HALF, TOP_W, "N", false)
	sideWall(safeM, CX - OUT_DIST, CZ, OUT_HALF, TOP_W, "S", false)
	sideWall(safeM, CX - OUT_DIST, CZ, OUT_HALF, TOP_W, "E", true)
	-- big catch floor 150 studs below: anyone who slips through gets sent back
	local catcher = U().part({Name = "CatchFloor", Size = Vector3.new(1100, 4, 1100),
		CFrame = CFrame.new(CX, CY - 150, CZ), Transparency = 1,
		CanCollide = false, Parent = safeM})
	U().touchOnce(catcher, 2, function(player, char)
		char:PivotTo(M.ArrivalCF)
		local notify = G.Remotes and G.Remotes:FindFirstChild("Notify")
		if notify then
			notify:FireClient(player, "The void almost got you! Back to the pad.", "yellow")
		end
	end)

	return world
end

return M
