-- WorldGym.lua -- the main gym map: outdoors, IRON TEMPLE GYM building + full
-- interior, portal plaza, rebirth shrine and the Lava Zone cavern at (700,0,0).
-- Contract: WorldGym.Build(G) builds everything under one Model "GymWorld".
-- Sets M.SpawnCF (gym spawn) and M.LavaCF (inside lava zone) for Shop teleports.
-- Part budget target <= 1500; rough per-section counts in comments (~700 total
-- plus the 4 scaled lava item display models).

local RunService = game:GetService("RunService")
local Players = game:GetService("Players")

local M = {}
local G = nil

function M.Init(g)
	G = g
end

--------------------------------------------------------------------
-- Small local helpers (all geometry goes through G.Util)
--------------------------------------------------------------------

-- Vertical cylinder: Util cylinders lie along X, so roll 90 deg about Z.
-- Size.X becomes the height, Size.Y/Size.Z the diameter.
local function vcyl(props)
	props.CFrame = props.CFrame * CFrame.Angles(0, 0, math.rad(90))
	return G.Util.cyl(props)
end

-- A layered-canopy tree: trunk + three shrinking leaf balls. (4 parts)
local function tree(root, x, z, scale)
	local U = G.Util
	scale = scale or 1
	local h = 12 * scale
	vcyl({Name = "TreeTrunk", Size = Vector3.new(h, 2.4 * scale, 2.4 * scale),
		CFrame = CFrame.new(x, h / 2, z), Color = "brown", Material = "Wood", Parent = root})
	local dias = {13, 10, 7}
	local ys = {h - 1, h + 3.5, h + 7}
	for i = 1, 3 do
		local d = dias[i] * scale
		U.part({Name = "TreeCanopy", Shape = "Ball", Size = Vector3.new(d, d, d),
			CFrame = CFrame.new(x, ys[i], z), Color = Color3.fromRGB(52, 124, 45),
			Material = "Grass", Parent = root})
	end
end

-- A round bush. (1 part)
local function bush(root, x, z, d)
	d = d or 4
	G.Util.part({Name = "Bush", Shape = "Ball", Size = Vector3.new(d, d * 0.8, d),
		CFrame = CFrame.new(x, d * 0.35, z), Color = Color3.fromRGB(64, 140, 58),
		Material = "Grass", Parent = root})
end

-- A streetlamp with a warm glowing head. (4 parts + light)
local function streetlamp(root, x, z)
	local U = G.Util
	vcyl({Name = "LampBase", Size = Vector3.new(1.6, 2, 2),
		CFrame = CFrame.new(x, 0.8, z), Color = "darkgray", Material = "Metal", Parent = root})
	vcyl({Name = "LampPole", Size = Vector3.new(14, 0.7, 0.7),
		CFrame = CFrame.new(x, 7.6, z), Color = "darkgray", Material = "Metal", Parent = root})
	-- arm reaches toward the road (+Z side)
	U.part({Name = "LampArm", Size = Vector3.new(0.5, 0.5, 4),
		CFrame = CFrame.new(x, 14.4, z + 2), Color = "darkgray", Material = "Metal", Parent = root})
	local head = U.part({Name = "LampHead", Size = Vector3.new(1.2, 0.5, 2.6),
		CFrame = CFrame.new(x, 14.1, z + 4), Color = Color3.fromRGB(255, 235, 180),
		Neon = true, Parent = root})
	local li = Instance.new("PointLight")
	li.Color = Color3.fromRGB(255, 220, 150)
	li.Brightness = 1.2
	li.Range = 32
	li.Parent = head
	return head
end

-- A parked car built from parts, facing local +Z. (15 parts)
local function car(root, cf, bodyColor)
	local U = G.Util
	U.part({Name = "CarBody", Size = Vector3.new(5, 2.2, 11),
		CFrame = cf * CFrame.new(0, 2.6, 0), Color = bodyColor, Material = "Metal", Parent = root})
	-- cabin glass + roof, windshields as wedges front and back
	U.part({Name = "CarCabin", Size = Vector3.new(4.4, 1.6, 4),
		CFrame = cf * CFrame.new(0, 4.5, -0.3), Color = "lightblue",
		Material = "Glass", Transparency = 0.35, Parent = root})
	U.part({Name = "CarWindshield", Shape = "Wedge", Size = Vector3.new(4.4, 1.6, 2),
		CFrame = cf * CFrame.new(0, 4.5, 2.7), Color = "lightblue",
		Material = "Glass", Transparency = 0.35, Parent = root})
	U.part({Name = "CarRearGlass", Shape = "Wedge", Size = Vector3.new(4.4, 1.6, 2),
		CFrame = cf * CFrame.new(0, 4.5, -3.3) * CFrame.Angles(0, math.pi, 0),
		Color = "lightblue", Material = "Glass", Transparency = 0.35, Parent = root})
	U.part({Name = "CarRoof", Size = Vector3.new(4.6, 0.35, 4.4),
		CFrame = cf * CFrame.new(0, 5.4, -0.3), Color = bodyColor, Material = "Metal", Parent = root})
	-- four wheels (cylinder axis already along X = car's side axis)
	local wx = 2.6
	local wz = 3.4
	for _, off in ipairs({Vector3.new(wx, 1.4, wz), Vector3.new(-wx, 1.4, wz),
		Vector3.new(wx, 1.4, -wz), Vector3.new(-wx, 1.4, -wz)}) do
		U.cyl({Name = "CarWheel", Size = Vector3.new(0.9, 2.8, 2.8),
			CFrame = cf * CFrame.new(off), Color = "black", Material = "SmoothPlastic", Parent = root})
	end
	-- lights and bumpers
	U.part({Name = "CarHeadlight", Size = Vector3.new(0.9, 0.5, 0.2),
		CFrame = cf * CFrame.new(1.6, 2.9, 5.6), Color = "white", Neon = true, Parent = root})
	U.part({Name = "CarHeadlight", Size = Vector3.new(0.9, 0.5, 0.2),
		CFrame = cf * CFrame.new(-1.6, 2.9, 5.6), Color = "white", Neon = true, Parent = root})
	U.part({Name = "CarTaillight", Size = Vector3.new(2.2, 0.4, 0.2),
		CFrame = cf * CFrame.new(0, 2.9, -5.6), Color = "red", Neon = true, Parent = root})
	U.part({Name = "CarBumperF", Size = Vector3.new(5.2, 0.7, 0.5),
		CFrame = cf * CFrame.new(0, 1.7, 5.6), Color = "darkgray", Material = "SmoothPlastic", Parent = root})
	U.part({Name = "CarBumperB", Size = Vector3.new(5.2, 0.7, 0.5),
		CFrame = cf * CFrame.new(0, 1.7, -5.6), Color = "darkgray", Material = "SmoothPlastic", Parent = root})
end

-- Smoke emitter on an invisible anchor part.
local function smoker(root, pos, sizeA, sizeB, rate, color)
	local p = G.Util.part({Name = "Smoker", Size = Vector3.new(1, 1, 1),
		CFrame = CFrame.new(pos), Transparency = 1, CanCollide = false, Parent = root})
	local pe = Instance.new("ParticleEmitter")
	pe.Color = ColorSequence.new(color or Color3.fromRGB(90, 90, 90))
	pe.Size = NumberSequence.new({
		NumberSequenceKeypoint.new(0, sizeA or 3),
		NumberSequenceKeypoint.new(1, sizeB or 8),
	})
	pe.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.55),
		NumberSequenceKeypoint.new(1, 1),
	})
	pe.Lifetime = NumberRange.new(2.5, 4)
	pe.Speed = NumberRange.new(3, 5)
	pe.SpreadAngle = Vector2.new(15, 15)
	pe.Acceleration = Vector3.new(0, 2, 0)
	pe.Rate = rate or 6
	pe.Parent = p
	return p
end

--------------------------------------------------------------------
-- OUTDOORS: ground, road, sidewalks, parking lot, trees, lamps
-- (~175 parts)
--------------------------------------------------------------------

local function buildOutdoors(root)
	local U = G.Util
	local out = U.model("Outdoors", root)

	-- ground: 2000x2000 grass, top surface at y = 0 (1 part)
	U.part({Name = "Ground", Size = Vector3.new(2000, 8, 2000),
		CFrame = CFrame.new(0, -4, 0), Color = Color3.fromRGB(86, 148, 68),
		Material = "Grass", Parent = out})

	-- invisible boundary walls so nobody strolls off the map edge (4 parts)
	for _, w in ipairs({
		{Vector3.new(2000, 120, 4), CFrame.new(0, 60, 1000)},
		{Vector3.new(2000, 120, 4), CFrame.new(0, 60, -1000)},
		{Vector3.new(4, 120, 2000), CFrame.new(1000, 60, 0)},
		{Vector3.new(4, 120, 2000), CFrame.new(-1000, 60, 0)},
	}) do
		U.part({Name = "Boundary", Size = w[1], CFrame = w[2], Transparency = 1, Parent = out})
	end

	-- asphalt road running east-west at z = 120 (1 part)
	U.part({Name = "Road", Size = Vector3.new(2000, 0.3, 24),
		CFrame = CFrame.new(0, 0.15, 120), Color = Color3.fromRGB(45, 45, 48),
		Material = "Asphalt", Parent = out})
	-- dashed white center-line markings over the middle stretch (42 parts)
	for x = -492, 492, 24 do
		U.part({Name = "RoadDash", Size = Vector3.new(6, 0.08, 0.8),
			CFrame = CFrame.new(x, 0.33, 120), Color = "white",
			Material = "SmoothPlastic", Parent = out})
	end

	-- sidewalks on both sides of the road (2 parts)
	U.part({Name = "Sidewalk", Size = Vector3.new(600, 0.35, 7),
		CFrame = CFrame.new(0, 0.17, 105), Color = Color3.fromRGB(160, 160, 155),
		Material = "Concrete", Parent = out})
	U.part({Name = "Sidewalk", Size = Vector3.new(600, 0.35, 7),
		CFrame = CFrame.new(0, 0.17, 135), Color = Color3.fromRGB(160, 160, 155),
		Material = "Concrete", Parent = out})

	-- concrete path from the gym front door to the sidewalk (1 part)
	U.part({Name = "GymPath", Size = Vector3.new(12, 0.3, 118),
		CFrame = CFrame.new(0, 0.15, 44), Color = Color3.fromRGB(170, 170, 165),
		Material = "Concrete", Parent = out})

	-- parking lot east of the path, joined to the road (1 pad + 5 lines)
	U.part({Name = "ParkingLot", Size = Vector3.new(80, 0.3, 46),
		CFrame = CFrame.new(150, 0.15, 85), Color = Color3.fromRGB(52, 52, 55),
		Material = "Asphalt", Parent = out})
	for i = 0, 4 do
		U.part({Name = "StallLine", Size = Vector3.new(0.4, 0.08, 18),
			CFrame = CFrame.new(118 + i * 16, 0.34, 72), Color = "white",
			Material = "SmoothPlastic", Parent = out})
	end
	-- three parked cars nosed toward the gym (45 parts)
	car(out, CFrame.new(126, 0, 74) * CFrame.Angles(0, math.pi, 0), Color3.fromRGB(180, 40, 40))
	car(out, CFrame.new(142, 0, 74) * CFrame.Angles(0, math.pi, 0), Color3.fromRGB(50, 90, 190))
	car(out, CFrame.new(174, 0, 74) * CFrame.Angles(0, math.pi, 0), Color3.fromRGB(230, 230, 235))

	-- trees around the map, clear of the road, lava zone and building (40 parts)
	local treeSpots = {
		{-180, -120, 1.2}, {-120, -180, 1}, {-250, 40, 1.4}, {-95, 70, 0.9},
		{110, -140, 1.1}, {200, -60, 1}, {265, 55, 1.3}, {-260, -60, 1},
		{230, 170, 1.1}, {-160, 175, 1.2},
	}
	for _, t in ipairs(treeSpots) do
		tree(out, t[1], t[2], t[3])
	end

	-- bushes hugging the gym front wall and the path (10 parts)
	for _, b in ipairs({
		{-50, -11}, {-30, -11}, {30, -11}, {50, -11}, {62, -11},
		{-14, 80, 5}, {14, 80, 5}, {-14, 20, 5}, {14, 20, 5}, {-62, -11},
	}) do
		bush(out, b[1], b[2], b[3] or 4.5)
	end

	-- streetlamps along the sidewalk (25 parts)
	for _, x in ipairs({-240, -120, -40, 80, 200}) do
		streetlamp(out, x, 103)
	end
end

--------------------------------------------------------------------
-- THE IRON TEMPLE GYM building shell (~55 parts)
-- Footprint x -70..70, z -105..-15, walls y 0..40, door x -8..8 (24 tall).
--------------------------------------------------------------------

local function buildBuilding(root)
	local U = G.Util
	local b = U.model("GymBuilding", root)
	local BRICK = Color3.fromRGB(150, 84, 62)
	local GLASS = {Color = "lightblue", Material = "Glass", Transparency = 0.45, Reflectance = 0.15}

	-- FRONT wall (z = -15) with the door opening (11 parts)
	local fz = -15
	U.part({Name = "WallFrontLowerL", Size = Vector3.new(62, 8, 2),
		CFrame = CFrame.new(-39, 4, fz), Color = BRICK, Material = "Brick", Parent = b})
	U.part({Name = "WallFrontLowerR", Size = Vector3.new(62, 8, 2),
		CFrame = CFrame.new(39, 4, fz), Color = BRICK, Material = "Brick", Parent = b})
	U.part({Name = "WallFrontGlassL", Size = Vector3.new(54, 20, 1.6),
		CFrame = CFrame.new(-37, 18, fz), Color = GLASS.Color, Material = "Glass",
		Transparency = GLASS.Transparency, Reflectance = GLASS.Reflectance, Parent = b})
	U.part({Name = "WallFrontGlassR", Size = Vector3.new(54, 20, 1.6),
		CFrame = CFrame.new(37, 18, fz), Color = GLASS.Color, Material = "Glass",
		Transparency = GLASS.Transparency, Reflectance = GLASS.Reflectance, Parent = b})
	U.part({Name = "WallFrontPillarL", Size = Vector3.new(2, 20, 2.2),
		CFrame = CFrame.new(-9, 18, fz), Color = BRICK, Material = "Brick", Parent = b})
	U.part({Name = "WallFrontPillarR", Size = Vector3.new(2, 20, 2.2),
		CFrame = CFrame.new(9, 18, fz), Color = BRICK, Material = "Brick", Parent = b})
	U.part({Name = "WallFrontCornerL", Size = Vector3.new(6, 20, 2),
		CFrame = CFrame.new(-67, 18, fz), Color = BRICK, Material = "Brick", Parent = b})
	U.part({Name = "WallFrontCornerR", Size = Vector3.new(6, 20, 2),
		CFrame = CFrame.new(67, 18, fz), Color = BRICK, Material = "Brick", Parent = b})
	U.part({Name = "WallFrontHeader", Size = Vector3.new(16, 16, 2),
		CFrame = CFrame.new(0, 32, fz), Color = BRICK, Material = "Brick", Parent = b})
	U.part({Name = "WallFrontUpperL", Size = Vector3.new(62, 12, 2),
		CFrame = CFrame.new(-39, 34, fz), Color = BRICK, Material = "Brick", Parent = b})
	U.part({Name = "WallFrontUpperR", Size = Vector3.new(62, 12, 2),
		CFrame = CFrame.new(39, 34, fz), Color = BRICK, Material = "Brick", Parent = b})

	-- glass double door, permanently slid open + metal frame (5 parts)
	U.part({Name = "DoorFrameL", Size = Vector3.new(0.8, 24, 2.4),
		CFrame = CFrame.new(-8.4, 12, fz), Color = "darkgray", Material = "Metal", Parent = b})
	U.part({Name = "DoorFrameR", Size = Vector3.new(0.8, 24, 2.4),
		CFrame = CFrame.new(8.4, 12, fz), Color = "darkgray", Material = "Metal", Parent = b})
	U.part({Name = "DoorFrameTop", Size = Vector3.new(17.6, 0.8, 2.4),
		CFrame = CFrame.new(0, 24.4, fz), Color = "darkgray", Material = "Metal", Parent = b})
	U.part({Name = "DoorPaneL", Size = Vector3.new(7.6, 22, 0.4),
		CFrame = CFrame.new(-12.4, 11, fz - 1.8), Color = "lightblue", Material = "Glass",
		Transparency = 0.4, CanCollide = false, Parent = b})
	U.part({Name = "DoorPaneR", Size = Vector3.new(7.6, 22, 0.4),
		CFrame = CFrame.new(12.4, 11, fz - 1.8), Color = "lightblue", Material = "Glass",
		Transparency = 0.4, CanCollide = false, Parent = b})

	-- SIDE walls with glass bands (x = -70 west, x = 70 east) (14 parts)
	for _, sx in ipairs({-70, 70}) do
		U.part({Name = "WallSideLower", Size = Vector3.new(2, 8, 88),
			CFrame = CFrame.new(sx, 4, -60), Color = BRICK, Material = "Brick", Parent = b})
		U.part({Name = "WallSideGlass", Size = Vector3.new(1.6, 20, 76),
			CFrame = CFrame.new(sx, 18, -60), Color = GLASS.Color, Material = "Glass",
			Transparency = GLASS.Transparency, Reflectance = GLASS.Reflectance, Parent = b})
		U.part({Name = "WallSideCornerA", Size = Vector3.new(2, 20, 6),
			CFrame = CFrame.new(sx, 18, -101), Color = BRICK, Material = "Brick", Parent = b})
		U.part({Name = "WallSideCornerB", Size = Vector3.new(2, 20, 6),
			CFrame = CFrame.new(sx, 18, -19), Color = BRICK, Material = "Brick", Parent = b})
		U.part({Name = "WallSidePillarA", Size = Vector3.new(2.2, 20, 3),
			CFrame = CFrame.new(sx, 18, -85), Color = BRICK, Material = "Brick", Parent = b})
		U.part({Name = "WallSidePillarB", Size = Vector3.new(2.2, 20, 3),
			CFrame = CFrame.new(sx, 18, -35), Color = BRICK, Material = "Brick", Parent = b})
		U.part({Name = "WallSideUpper", Size = Vector3.new(2, 12, 88),
			CFrame = CFrame.new(sx, 34, -60), Color = BRICK, Material = "Brick", Parent = b})
	end

	-- BACK wall solid brick (mirror wall hangs inside it) (1 part)
	U.part({Name = "WallBack", Size = Vector3.new(140, 40, 2),
		CFrame = CFrame.new(0, 20, -105), Color = BRICK, Material = "Brick", Parent = b})

	-- four dark corner columns for depth (4 parts)
	for _, c in ipairs({{-70, -15}, {70, -15}, {-70, -105}, {70, -105}}) do
		U.part({Name = "CornerColumn", Size = Vector3.new(3.4, 40, 3.4),
			CFrame = CFrame.new(c[1], 20, c[2]), Color = Color3.fromRGB(105, 58, 44),
			Material = "Brick", Parent = b})
	end

	-- roof slab + parapet + two AC units (9 parts)
	U.part({Name = "Roof", Size = Vector3.new(144, 2, 94),
		CFrame = CFrame.new(0, 41, -60), Color = Color3.fromRGB(90, 90, 92),
		Material = "Concrete", Parent = b})
	U.part({Name = "ParapetF", Size = Vector3.new(144, 3, 2),
		CFrame = CFrame.new(0, 43.5, -14), Color = BRICK, Material = "Brick", Parent = b})
	U.part({Name = "ParapetB", Size = Vector3.new(144, 3, 2),
		CFrame = CFrame.new(0, 43.5, -106), Color = BRICK, Material = "Brick", Parent = b})
	U.part({Name = "ParapetL", Size = Vector3.new(2, 3, 90),
		CFrame = CFrame.new(-71, 43.5, -60), Color = BRICK, Material = "Brick", Parent = b})
	U.part({Name = "ParapetR", Size = Vector3.new(2, 3, 90),
		CFrame = CFrame.new(71, 43.5, -60), Color = BRICK, Material = "Brick", Parent = b})
	for _, ax in ipairs({-40, 35}) do
		U.part({Name = "RoofAC", Size = Vector3.new(8, 4, 6),
			CFrame = CFrame.new(ax, 44, -80), Color = "gray", Material = "DiamondPlate", Parent = b})
		U.cyl({Name = "RoofACFan", Size = Vector3.new(0.4, 4.5, 4.5),
			CFrame = CFrame.new(ax, 46.2, -80) * CFrame.Angles(0, 0, math.rad(90)),
			Color = "darkgray", Material = "Metal", Parent = b})
	end

	-- big sign over the door + neon trim + entry lamps (5 parts)
	local sign = U.part({Name = "GymSign", Size = Vector3.new(46, 7, 1),
		CFrame = CFrame.new(0, 34.5, -13.8), Color = "black",
		Material = "SmoothPlastic", Parent = b})
	U.surfaceText(sign, "Back", "IRON TEMPLE GYM", "gold", nil)
	U.part({Name = "SignTrimTop", Size = Vector3.new(46, 0.5, 0.6),
		CFrame = CFrame.new(0, 38.4, -13.8), Color = "red", Neon = true, Parent = b})
	U.part({Name = "SignTrimBottom", Size = Vector3.new(46, 0.5, 0.6),
		CFrame = CFrame.new(0, 30.6, -13.8), Color = "red", Neon = true, Parent = b})
	for _, lx in ipairs({-11, 11}) do
		local lamp = U.part({Name = "EntryLamp", Size = Vector3.new(1, 1.6, 0.6),
			CFrame = CFrame.new(lx, 21, -13.9), Color = Color3.fromRGB(255, 235, 180),
			Neon = true, Parent = b})
		local li = Instance.new("PointLight")
		li.Color = Color3.fromRGB(255, 220, 150)
		li.Brightness = 1
		li.Range = 20
		li.Parent = lamp
	end
end

--------------------------------------------------------------------
-- INTERIOR: floor tiles, mirror wall, equipment, desk, clerk,
-- leaderboard, lifting floor, lights, posters (~245 parts)
--------------------------------------------------------------------

local function buildInterior(root)
	local U = G.Util
	local inn = U.model("GymInterior", root)

	-- dark rubber tile floor: 12x8 alternating SmoothPlastic shades (96 parts)
	local shadeA = Color3.fromRGB(38, 38, 42)
	local shadeB = Color3.fromRGB(52, 52, 56)
	local x0 = -69
	local z0 = -104
	local tw = 138 / 12
	local td = 88 / 8
	for i = 0, 11 do
		for j = 0, 7 do
			local col = shadeA
			if (i + j) % 2 == 0 then col = shadeB end
			U.part({Name = "FloorTile", Size = Vector3.new(tw, 0.3, td),
				CFrame = CFrame.new(x0 + tw * (i + 0.5), 0.15, z0 + td * (j + 0.5)),
				Color = col, Material = "SmoothPlastic", Parent = inn})
		end
	end

	-- mirrored back wall: 4 glass panels, Reflectance 0.9, framed (11 parts)
	for k = 0, 3 do
		U.part({Name = "MirrorPanel", Size = Vector3.new(31, 20, 0.5),
			CFrame = CFrame.new(-49.5 + k * 33, 11, -103.6),
			Color = Color3.fromRGB(205, 220, 230), Material = "Glass",
			Reflectance = 0.9, Parent = inn})
	end
	for _, mx in ipairs({-66, -33, 0, 33, 66}) do
		U.part({Name = "MirrorTrim", Size = Vector3.new(1, 21, 0.7),
			CFrame = CFrame.new(mx, 11, -103.6), Color = "darkgray", Material = "Metal", Parent = inn})
	end
	U.part({Name = "MirrorTrimTop", Size = Vector3.new(133, 1, 0.7),
		CFrame = CFrame.new(0, 21.5, -103.6), Color = "darkgray", Material = "Metal", Parent = inn})
	U.part({Name = "MirrorTrimBot", Size = Vector3.new(133, 1, 0.7),
		CFrame = CFrame.new(0, 0.8, -103.6), Color = "darkgray", Material = "Metal", Parent = inn})

	-- LIFTING FLOOR: neon-edged ring where players stand (2 parts + text)
	local ringGlow = U.cyl({Name = "LiftRingGlow", Size = Vector3.new(0.22, 27, 27),
		CFrame = CFrame.new(-30, 0.41, -55) * CFrame.Angles(0, 0, math.rad(90)),
		Color = "gold", Neon = true, Parent = inn})
	local ringDisc = U.cyl({Name = "LiftRingDisc", Size = Vector3.new(0.3, 24, 24),
		CFrame = CFrame.new(-30, 0.5, -55) * CFrame.Angles(0, 0, math.rad(90)),
		Color = Color3.fromRGB(30, 30, 34), Material = "SmoothPlastic", Parent = inn})
	-- after the +90 roll about Z the local +X (Right) face points up
	U.surfaceText(ringDisc, "Right", "LIFTING FLOOR", "gold", nil)

	-- dumbbell rack on the west wall: frame + 2 shelves x 5 dumbbells (37 parts)
	local rackX = -66
	U.part({Name = "RackSideA", Size = Vector3.new(3, 5.5, 0.8),
		CFrame = CFrame.new(rackX, 2.75, -62.5), Color = "darkgray", Material = "Metal", Parent = inn})
	U.part({Name = "RackSideB", Size = Vector3.new(3, 5.5, 0.8),
		CFrame = CFrame.new(rackX, 2.75, -47.5), Color = "darkgray", Material = "Metal", Parent = inn})
	U.part({Name = "RackShelfLow", Size = Vector3.new(3, 0.4, 14.5),
		CFrame = CFrame.new(rackX, 2, -55), Color = "gray", Material = "DiamondPlate", Parent = inn})
	U.part({Name = "RackShelfHigh", Size = Vector3.new(3, 0.4, 14.5),
		CFrame = CFrame.new(rackX, 4.2, -55), Color = "gray", Material = "DiamondPlate", Parent = inn})
	U.part({Name = "RackBack", Size = Vector3.new(0.4, 5.5, 14.5),
		CFrame = CFrame.new(rackX - 1.4, 2.75, -55), Color = "darkgray", Material = "Metal", Parent = inn})
	for shelf = 0, 1 do
		local sy = 2.75 + shelf * 2.2
		for d = 0, 4 do
			local dz = -61 + d * 3
			-- little dumbbell: handle along X + two heads (3 parts each)
			U.cyl({Name = "MiniDumbbellBar", Size = Vector3.new(1.4, 0.3, 0.3),
				CFrame = CFrame.new(rackX, sy, dz), Color = "gray", Material = "Metal", Parent = inn})
			U.cyl({Name = "MiniDumbbellHead", Size = Vector3.new(0.5, 1, 1),
				CFrame = CFrame.new(rackX - 0.85, sy, dz), Color = "black",
				Material = "Metal", Parent = inn})
			U.cyl({Name = "MiniDumbbellHead", Size = Vector3.new(0.5, 1, 1),
				CFrame = CFrame.new(rackX + 0.85, sy, dz), Color = "black",
				Material = "Metal", Parent = inn})
		end
	end

	-- two barbell benches with loaded bars (32 parts)
	for _, bx in ipairs({8, 26}) do
		local base = CFrame.new(bx, 0, -80)
		U.part({Name = "BenchPad", Size = Vector3.new(2, 0.7, 6),
			CFrame = base * CFrame.new(0, 2.4, 0), Color = "darkred", Material = "Fabric", Parent = inn})
		U.part({Name = "BenchLegA", Size = Vector3.new(0.5, 2.1, 0.5),
			CFrame = base * CFrame.new(0, 1, 2.2), Color = "black", Material = "Metal", Parent = inn})
		U.part({Name = "BenchLegB", Size = Vector3.new(0.5, 2.1, 0.5),
			CFrame = base * CFrame.new(0, 1, -2.2), Color = "black", Material = "Metal", Parent = inn})
		U.part({Name = "BenchFootA", Size = Vector3.new(2.4, 0.3, 0.7),
			CFrame = base * CFrame.new(0, 0.45, 2.2), Color = "black", Material = "Metal", Parent = inn})
		U.part({Name = "BenchFootB", Size = Vector3.new(2.4, 0.3, 0.7),
			CFrame = base * CFrame.new(0, 0.45, -2.2), Color = "black", Material = "Metal", Parent = inn})
		U.part({Name = "BenchUprightL", Size = Vector3.new(0.7, 4.6, 0.7),
			CFrame = base * CFrame.new(-2.6, 2.3, 2.6), Color = "darkgray", Material = "Metal", Parent = inn})
		U.part({Name = "BenchUprightR", Size = Vector3.new(0.7, 4.6, 0.7),
			CFrame = base * CFrame.new(2.6, 2.3, 2.6), Color = "darkgray", Material = "Metal", Parent = inn})
		-- loaded barbell resting on the uprights
		U.cyl({Name = "Barbell", Size = Vector3.new(8.8, 0.28, 0.28),
			CFrame = base * CFrame.new(0, 4.8, 2.6), Color = "gray", Material = "Metal", Parent = inn})
		U.cyl({Name = "BarPlateBig", Size = Vector3.new(0.5, 2.6, 2.6),
			CFrame = base * CFrame.new(-3.4, 4.8, 2.6), Color = "black", Material = "Metal", Parent = inn})
		U.cyl({Name = "BarPlateBig", Size = Vector3.new(0.5, 2.6, 2.6),
			CFrame = base * CFrame.new(3.4, 4.8, 2.6), Color = "black", Material = "Metal", Parent = inn})
		U.cyl({Name = "BarPlateSmall", Size = Vector3.new(0.35, 1.8, 1.8),
			CFrame = base * CFrame.new(-3.9, 4.8, 2.6), Color = "darkred", Material = "Metal", Parent = inn})
		U.cyl({Name = "BarPlateSmall", Size = Vector3.new(0.35, 1.8, 1.8),
			CFrame = base * CFrame.new(3.9, 4.8, 2.6), Color = "darkred", Material = "Metal", Parent = inn})
		U.cyl({Name = "BarCollar", Size = Vector3.new(0.25, 0.55, 0.55),
			CFrame = base * CFrame.new(-4.2, 4.8, 2.6), Color = "gray", Material = "Metal", Parent = inn})
		U.cyl({Name = "BarCollar", Size = Vector3.new(0.25, 0.55, 0.55),
			CFrame = base * CFrame.new(4.2, 4.8, 2.6), Color = "gray", Material = "Metal", Parent = inn})
	end

	-- two treadmills facing the mirror wall (18 parts)
	for _, tx in ipairs({42, 52}) do
		local base = CFrame.new(tx, 0, -94)
		U.part({Name = "TreadDeck", Size = Vector3.new(3.4, 0.8, 8),
			CFrame = base * CFrame.new(0, 0.7, 0), Color = "darkgray",
			Material = "SmoothPlastic", Parent = inn})
		U.part({Name = "TreadBelt", Size = Vector3.new(2.8, 0.14, 6.6),
			CFrame = base * CFrame.new(0, 1.18, 0.5), Color = "black",
			Material = "SmoothPlastic", Parent = inn})
		U.part({Name = "TreadPostL", Size = Vector3.new(0.35, 3.4, 0.35),
			CFrame = base * CFrame.new(-1.5, 2.6, -3.4), Color = "gray", Material = "Metal", Parent = inn})
		U.part({Name = "TreadPostR", Size = Vector3.new(0.35, 3.4, 0.35),
			CFrame = base * CFrame.new(1.5, 2.6, -3.4), Color = "gray", Material = "Metal", Parent = inn})
		U.part({Name = "TreadRailL", Size = Vector3.new(0.3, 0.3, 3.4),
			CFrame = base * CFrame.new(-1.5, 4.1, -1.8), Color = "gray", Material = "Metal", Parent = inn})
		U.part({Name = "TreadRailR", Size = Vector3.new(0.3, 0.3, 3.4),
			CFrame = base * CFrame.new(1.5, 4.1, -1.8), Color = "gray", Material = "Metal", Parent = inn})
		U.part({Name = "TreadConsole", Size = Vector3.new(3.2, 1.4, 0.6),
			CFrame = base * CFrame.new(0, 4.6, -3.5) * CFrame.Angles(math.rad(-22), 0, 0),
			Color = "black", Material = "SmoothPlastic", Parent = inn})
		U.part({Name = "TreadScreen", Size = Vector3.new(2.2, 0.8, 0.2),
			CFrame = base * CFrame.new(0, 4.75, -3.28) * CFrame.Angles(math.rad(-22), 0, 0),
			Color = "cyan", Neon = true, Parent = inn})
	end

	-- yoga mats in the back-west corner (4 parts)
	local matColors = {"pink", "blue", "purple", "green"}
	for i = 0, 3 do
		U.part({Name = "YogaMat", Size = Vector3.new(4, 0.14, 7),
			CFrame = CFrame.new(-58 + i * 6, 0.37, -92), Color = matColors[i + 1],
			Material = "Fabric", Parent = inn})
	end

	-- water cooler in the front-west corner (5 parts)
	U.part({Name = "CoolerBody", Size = Vector3.new(1.8, 3.6, 1.8),
		CFrame = CFrame.new(-62, 2.1, -21), Color = "white", Material = "SmoothPlastic", Parent = inn})
	vcyl({Name = "CoolerBottle", Size = Vector3.new(1.6, 1.5, 1.5),
		CFrame = CFrame.new(-62, 4.75, -21), Color = "lightblue", Material = "Glass",
		Transparency = 0.35, Parent = inn})
	vcyl({Name = "CoolerCap", Size = Vector3.new(0.3, 0.7, 0.7),
		CFrame = CFrame.new(-62, 5.65, -21), Color = "blue", Material = "SmoothPlastic", Parent = inn})
	U.part({Name = "CoolerTap", Size = Vector3.new(0.25, 0.35, 0.5),
		CFrame = CFrame.new(-62, 2.7, -19.95), Color = "blue", Material = "SmoothPlastic", Parent = inn})
	U.part({Name = "CoolerTray", Size = Vector3.new(1.2, 0.2, 0.5),
		CFrame = CFrame.new(-62, 1.6, -19.95), Color = "gray", Material = "SmoothPlastic", Parent = inn})

	-- front desk + posed clerk mannequin (17 parts)
	local dc = CFrame.new(25, 0, -26)
	U.part({Name = "DeskFront", Size = Vector3.new(9, 3, 0.6),
		CFrame = dc * CFrame.new(0, 1.5, 1.5), Color = "brown", Material = "Wood", Parent = inn})
	U.part({Name = "DeskSideL", Size = Vector3.new(0.6, 3, 3.4),
		CFrame = dc * CFrame.new(-4.2, 1.5, 0), Color = "brown", Material = "Wood", Parent = inn})
	U.part({Name = "DeskSideR", Size = Vector3.new(0.6, 3, 3.4),
		CFrame = dc * CFrame.new(4.2, 1.5, 0), Color = "brown", Material = "Wood", Parent = inn})
	U.part({Name = "DeskTop", Size = Vector3.new(10, 0.4, 4.2),
		CFrame = dc * CFrame.new(0, 3.2, 0), Color = "black", Material = "Granite", Parent = inn})
	U.part({Name = "DeskMonitor", Size = Vector3.new(2.2, 1.5, 0.2),
		CFrame = dc * CFrame.new(-2.5, 4.4, -0.5) * CFrame.Angles(0, math.rad(20), 0),
		Color = "black", Material = "SmoothPlastic", Parent = inn})
	U.part({Name = "DeskScreen", Size = Vector3.new(1.9, 1.2, 0.08),
		CFrame = dc * CFrame.new(-2.5, 4.4, -0.36) * CFrame.Angles(0, math.rad(20), 0),
		Color = "cyan", Neon = true, Parent = inn})
	vcyl({Name = "DeskMonitorStand", Size = Vector3.new(0.7, 0.5, 0.5),
		CFrame = dc * CFrame.new(-2.5, 3.55, -0.5), Color = "darkgray", Material = "Metal", Parent = inn})
	U.part({Name = "DeskBell", Size = Vector3.new(0.5, 0.35, 0.5),
		CFrame = dc * CFrame.new(3, 3.55, 1), Color = "gold", Material = "Metal", Parent = inn})
	-- the clerk stands behind the desk facing the door, one arm raised in a wave
	local cc = dc * CFrame.new(0, 0, -3)
	U.part({Name = "ClerkLegL", Size = Vector3.new(0.9, 2, 0.9),
		CFrame = cc * CFrame.new(-0.55, 1, 0), Color = Color3.fromRGB(40, 45, 70),
		Material = "Fabric", Parent = inn})
	U.part({Name = "ClerkLegR", Size = Vector3.new(0.9, 2, 0.9),
		CFrame = cc * CFrame.new(0.55, 1, 0), Color = Color3.fromRGB(40, 45, 70),
		Material = "Fabric", Parent = inn})
	U.part({Name = "ClerkTorso", Size = Vector3.new(2, 2, 1),
		CFrame = cc * CFrame.new(0, 3, 0), Color = "darkred", Material = "Fabric", Parent = inn})
	U.part({Name = "ClerkArmL", Size = Vector3.new(0.9, 2, 0.9),
		CFrame = cc * CFrame.new(-1.5, 3, 0), Color = "darkred", Material = "Fabric", Parent = inn})
	U.part({Name = "ClerkArmR", Size = Vector3.new(0.9, 2, 0.9),
		CFrame = cc * CFrame.new(1.6, 3.9, 0.4) * CFrame.Angles(math.rad(150), 0, math.rad(-12)),
		Color = "darkred", Material = "Fabric", Parent = inn})
	local head = U.part({Name = "ClerkHead", Size = Vector3.new(1.3, 1.3, 1.3),
		CFrame = cc * CFrame.new(0, 4.7, 0), Color = "tan", Material = "SmoothPlastic", Parent = inn})
	U.part({Name = "ClerkCap", Size = Vector3.new(1.5, 0.35, 1.5),
		CFrame = cc * CFrame.new(0, 5.45, 0), Color = "darkred", Material = "Fabric", Parent = inn})
	U.part({Name = "ClerkCapBrim", Size = Vector3.new(1.5, 0.15, 0.8),
		CFrame = cc * CFrame.new(0, 5.3, 1.05), Color = "darkred", Material = "Fabric", Parent = inn})
	U.label(head, "Staff", {textColor = "white", width = 110, height = 34, offsetY = 1.6})

	-- framed TOP 50 LIFTERS leaderboard on the east wall, facing the room (7 parts)
	local boardCF = CFrame.lookAt(Vector3.new(67.6, 13, -45), Vector3.new(0, 13, -45))
	local board = U.part({Name = "LeaderboardBoard", Size = Vector3.new(26, 20, 0.6),
		CFrame = boardCF, Color = Color3.fromRGB(22, 22, 26), Material = "SmoothPlastic", Parent = inn})
	U.part({Name = "LeaderboardFrameT", Size = Vector3.new(28, 1, 0.8),
		CFrame = boardCF * CFrame.new(0, 10.5, 0), Color = "gold", Material = "Metal", Parent = inn})
	U.part({Name = "LeaderboardFrameB", Size = Vector3.new(28, 1, 0.8),
		CFrame = boardCF * CFrame.new(0, -10.5, 0), Color = "gold", Material = "Metal", Parent = inn})
	U.part({Name = "LeaderboardFrameL", Size = Vector3.new(1, 22, 0.8),
		CFrame = boardCF * CFrame.new(-13.5, 0, 0), Color = "gold", Material = "Metal", Parent = inn})
	U.part({Name = "LeaderboardFrameR", Size = Vector3.new(1, 22, 0.8),
		CFrame = boardCF * CFrame.new(13.5, 0, 0), Color = "gold", Material = "Metal", Parent = inn})
	local header = U.part({Name = "LeaderboardHeader", Size = Vector3.new(26, 3.4, 0.7),
		CFrame = boardCF * CFrame.new(0, 12.8, 0), Color = "black", Material = "SmoothPlastic", Parent = inn})
	U.surfaceText(header, "Front", "TOP 50 LIFTERS", "gold", nil)
	G.Leaderboard.SetBoard(board)

	-- motivational posters (3 parts)
	local pA = U.part({Name = "Poster", Size = Vector3.new(0.4, 8, 14),
		CFrame = CFrame.new(-68.6, 12, -25), Color = "black", Material = "SmoothPlastic", Parent = inn})
	U.surfaceText(pA, "Right", "NO PAIN NO GAIN", "red", "black")
	local pB = U.part({Name = "Poster", Size = Vector3.new(0.4, 8, 14),
		CFrame = CFrame.new(68.6, 12, -80), Color = "black", Material = "SmoothPlastic", Parent = inn})
	U.surfaceText(pB, "Left", "LIFT HEAVY. GROW HUGE.", "gold", "black")
	local pC = U.part({Name = "Poster", Size = Vector3.new(16, 6, 0.4),
		CFrame = CFrame.new(0, 27, -103.5), Color = "black", Material = "SmoothPlastic", Parent = inn})
	U.surfaceText(pC, "Back", "ONE MORE REP", "white", "black")

	-- ceiling light fixtures: 6 housings + panels + lights (12 parts)
	for _, lx in ipairs({-45, 5, 55}) do
		for _, lz in ipairs({-40, -80}) do
			U.part({Name = "LightHousing", Size = Vector3.new(7, 0.5, 2.6),
				CFrame = CFrame.new(lx, 39.5, lz), Color = "darkgray", Material = "Metal", Parent = inn})
			local panel = U.part({Name = "LightPanel", Size = Vector3.new(6.4, 0.2, 2),
				CFrame = CFrame.new(lx, 39.1, lz), Color = "white", Neon = true, Parent = inn})
			local li = Instance.new("PointLight")
			li.Color = Color3.fromRGB(255, 248, 235)
			li.Brightness = 0.8
			li.Range = 42
			li.Parent = panel
		end
	end
end

--------------------------------------------------------------------
-- PLAZA with the two portals + REBIRTH SHRINE + SpawnLocation
-- (~40 parts)
--------------------------------------------------------------------

local function makePortal(root, cf, fillColor, labelText, labelColor, onTouch)
	local U = G.Util
	-- 12-stud archway: two granite pillars, lintel, glowing fill (4 parts)
	U.part({Name = "PortalPillarA", Size = Vector3.new(3, 12, 3),
		CFrame = cf * CFrame.new(0, 6, -6.5), Color = "granite", Material = "Granite", Parent = root})
	U.part({Name = "PortalPillarB", Size = Vector3.new(3, 12, 3),
		CFrame = cf * CFrame.new(0, 6, 6.5), Color = "granite", Material = "Granite", Parent = root})
	local lintel = U.part({Name = "PortalLintel", Size = Vector3.new(3, 3, 16),
		CFrame = cf * CFrame.new(0, 13.5, 0), Color = "granite", Material = "Granite", Parent = root})
	local fill = U.part({Name = "PortalFill", Size = Vector3.new(0.8, 12, 10),
		CFrame = cf * CFrame.new(0, 6, 0), Color = fillColor, Neon = true,
		Transparency = 0.35, CanCollide = false, Parent = root})
	-- swirling particle fill
	local pe = Instance.new("ParticleEmitter")
	pe.Color = ColorSequence.new(fillColor)
	pe.LightEmission = 0.8
	pe.Lifetime = NumberRange.new(1, 1.8)
	pe.Speed = NumberRange.new(1, 2.5)
	pe.SpreadAngle = Vector2.new(180, 180)
	pe.RotSpeed = NumberRange.new(-120, 120)
	pe.Rate = 22
	pe.Size = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.8),
		NumberSequenceKeypoint.new(1, 0),
	})
	pe.Parent = fill
	local li = Instance.new("PointLight")
	li.Color = fillColor
	li.Brightness = 1.4
	li.Range = 22
	li.Parent = fill
	U.label(lintel, labelText, {textColor = labelColor, width = 300, height = 60, offsetY = 3})
	U.touchOnce(fill, 2, onTouch)
end

local function buildPlazaAndShrine(root)
	local U = G.Util
	local pl = U.model("Plaza", root)

	-- stone plaza slab west of the path (1 part)
	U.part({Name = "PlazaSlab", Size = Vector3.new(70, 0.4, 55),
		CFrame = CFrame.new(-58, 0.2, 30), Color = Color3.fromRGB(120, 120, 125),
		Material = "Slate", Parent = pl})

	-- SPACE WORLD portal (purple) -- teleport if SpaceUnlocked, else red Notify
	makePortal(pl, CFrame.new(-78, 0.4, 15), G.Util.Colors.purple, "SPACE WORLD", "purple",
		function(player, char)
			if player:GetAttribute("SpaceUnlocked") then
				local cf = G.WorldSpace and G.WorldSpace.ArrivalCF
				if cf then char:PivotTo(cf) end
			else
				G.Remotes.Notify:FireClient(player,
					"Reach Rebirth 3 to unlock the SPACE WORLD!", "red")
			end
		end)

	-- DUMBBELL WORLD portal (silver) -- teleport if DumbbellUnlocked
	makePortal(pl, CFrame.new(-78, 0.4, 45), Color3.fromRGB(205, 205, 212), "DUMBBELL WORLD", "white",
		function(player, char)
			if player:GetAttribute("DumbbellUnlocked") then
				local cf = G.WorldDumbbell and G.WorldDumbbell.ArrivalCF
				if cf then char:PivotTo(cf) end
			else
				G.Remotes.Notify:FireClient(player,
					"Buy Rebirth 5 to unlock the DUMBBELL WORLD!", "red")
			end
		end)

	-- two stone planters with bushes on the plaza edge (4 parts)
	for _, pz in ipairs({8, 52}) do
		U.part({Name = "Planter", Size = Vector3.new(4, 1.6, 4),
			CFrame = CFrame.new(-30, 0.8, pz), Color = "granite", Material = "Concrete", Parent = pl})
		bush(pl, -30, pz, 4)
	end

	-- REBIRTH SHRINE east of the path: marble pedestal + glowing ring (11 parts)
	local sh = U.model("RebirthShrine", root)
	local sc = CFrame.new(58, 0, 30)
	local ring = U.cyl({Name = "ShrineFloorRing", Size = Vector3.new(0.25, 18, 18),
		CFrame = sc * CFrame.new(0, 0.35, 0) * CFrame.Angles(0, 0, math.rad(90)),
		Color = "gold", Neon = true, Parent = sh})
	vcyl({Name = "ShrineBase", Size = Vector3.new(1.2, 13, 13),
		CFrame = sc * CFrame.new(0, 0.6, 0), Color = "white", Material = "Marble", Parent = sh})
	vcyl({Name = "ShrineStep", Size = Vector3.new(1.2, 10, 10),
		CFrame = sc * CFrame.new(0, 1.8, 0), Color = "white", Material = "Marble", Parent = sh})
	vcyl({Name = "ShrineColumn", Size = Vector3.new(6, 3.4, 3.4),
		CFrame = sc * CFrame.new(0, 5.4, 0), Color = "white", Material = "Marble", Parent = sh})
	local orb = U.part({Name = "ShrineOrb", Shape = "Ball", Size = Vector3.new(3, 3, 3),
		CFrame = sc * CFrame.new(0, 10, 0), Color = "gold", Neon = true, Parent = sh})
	local oli = Instance.new("PointLight")
	oli.Color = Color3.fromRGB(255, 210, 90)
	oli.Brightness = 2
	oli.Range = 30
	oli.Parent = orb
	-- orbiting halo: 4 small neon cubes welded to a spinning invisible pivot
	local pivot = U.part({Name = "ShrineHaloPivot", Size = Vector3.new(0.4, 0.4, 0.4),
		CFrame = sc * CFrame.new(0, 10, 0), Transparency = 1, CanCollide = false, Parent = sh})
	for k = 0, 3 do
		local ang = k * math.pi / 2
		local cube = U.part({Name = "ShrineHaloCube", Size = Vector3.new(0.7, 0.7, 0.7),
			CFrame = sc * CFrame.new(math.cos(ang) * 3.5, 10, math.sin(ang) * 3.5),
			Color = "gold", Neon = true, Anchored = false, CanCollide = false, Parent = sh})
		U.weld(pivot, cube)
	end
	U.spinner(pivot, "Y", 1.2)
	U.label(orb, "REBIRTH SHRINE", {textColor = "gold", width = 280, height = 55, offsetY = 3})
	-- touch hint: rebirthing itself happens in the UI
	U.touchOnce(ring, 4, function(player)
		G.Remotes.Notify:FireClient(player,
			"Open the REBIRTH menu to rebirth for a multiplier!", "yellow")
	end)

	-- SpawnLocation just outside the gym door, facing the entrance (1 + 1 parts)
	local sl = Instance.new("SpawnLocation")
	sl.Name = "GymSpawn"
	sl.Size = Vector3.new(12, 1, 8)
	sl.CFrame = CFrame.new(0, 0.5, -6)
	sl.Anchored = true
	sl.Neutral = true
	sl.Duration = 0
	sl.Color = Color3.fromRGB(140, 140, 145)
	sl.Material = Enum.Material.Concrete
	sl.TopSurface = Enum.SurfaceType.Smooth
	sl.Parent = root
	U.part({Name = "SpawnTrim", Size = Vector3.new(12.6, 0.2, 8.6),
		CFrame = CFrame.new(0, 0.1, -6), Color = "gold", Neon = true, Parent = root})
end

--------------------------------------------------------------------
-- LAVA ZONE at (700, 0, 0): obsidian cavern, lava pools + falls,
-- basalt columns, smoke, embers, item pedestals, sliding gate
-- (~120 parts + 4 scaled item display models)
--------------------------------------------------------------------

-- Pedestal display of one shop item, scaled ~4x and slowly spinning.
local function displayItem(root, id, x, z)
	local U = G.Util
	local it = G.Config.ItemById(id)
	local base = U.part({Name = "PedestalBase", Size = Vector3.new(9, 2, 9),
		CFrame = CFrame.new(x, 1, z), Color = "black", Material = "Granite", Parent = root})
	U.part({Name = "PedestalColumn", Size = Vector3.new(6.5, 4, 6.5),
		CFrame = CFrame.new(x, 4, z), Color = Color3.fromRGB(55, 50, 52),
		Material = "Basalt", Parent = root})
	U.part({Name = "PedestalTrim", Size = Vector3.new(7.2, 0.4, 7.2),
		CFrame = CFrame.new(x, 6.2, z), Color = "orange", Neon = true, Parent = root})
	local plateName = "???"
	if it then plateName = it.name end
	U.label(base, plateName, {textColor = "gold", width = 260, height = 50, offsetY = 2})
	local builder = G.ItemBuilders and G.ItemBuilders[id]
	if not builder then return end
	local ok, model = pcall(builder)
	if not ok or typeof(model) ~= "Instance" then return end
	model.Name = id .. "Display"
	pcall(function() model:ScaleTo(4) end)
	local ext = model:GetExtentsSize()
	local hoverY = 6.4 + ext.Y / 2 + 1
	model:PivotTo(CFrame.new(x, hoverY, z))
	-- spin trick: weld every part to an invisible anchored pivot, spin the pivot
	local pivot = U.part({Name = "DisplayPivot", Size = Vector3.new(0.4, 0.4, 0.4),
		CFrame = CFrame.new(x, hoverY, z), Transparency = 1, CanCollide = false, Parent = root})
	model.Parent = root
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("BasePart") then
			d.Anchored = false
			d.CanCollide = false
			U.weld(pivot, d)
		end
	end
	U.spinner(pivot, "Y", 0.7)
end

local function buildLavaZone(root)
	local U = G.Util
	local lz = U.model("LavaZone", root)
	-- cavern footprint x 600..800, z -100..100

	-- basalt floor (1 part)
	U.part({Name = "LavaFloor", Size = Vector3.new(200, 1, 200),
		CFrame = CFrame.new(700, 0, 0), Color = Color3.fromRGB(48, 42, 44),
		Material = "Basalt", Parent = lz})

	-- jagged perimeter wall blocks, alternating Basalt/Slate, with a gap for
	-- the gate on the west side at z -14..14 (~30 parts)
	local function wallBlock(x, z, rotY)
		local h = 42 + math.random(0, 14)
		local mat = "Basalt"
		if math.random() < 0.5 then mat = "Slate" end
		U.part({Name = "CavernWall", Size = Vector3.new(26, h, 12),
			CFrame = CFrame.new(x, h / 2, z) * CFrame.Angles(0, rotY + (math.random() - 0.5) * 0.12, 0),
			Color = Color3.fromRGB(38, 34, 36), Material = mat, Parent = lz})
	end
	for i = 0, 7 do -- north and south edges
		local wx = 612 + i * 25
		wallBlock(wx, 97, 0)
		wallBlock(wx, -97, 0)
	end
	for i = 0, 7 do -- east edge (solid) and west edge (skip the gate gap)
		local wz = -88 + i * 25
		wallBlock(797, wz, math.rad(90))
		if wz < -16 or wz > 16 then
			wallBlock(603, wz, math.rad(90))
		end
	end

	-- cavern ceiling slab (1 part)
	U.part({Name = "CavernCeiling", Size = Vector3.new(210, 3, 210),
		CFrame = CFrame.new(700, 57, 0), Color = Color3.fromRGB(30, 27, 29),
		Material = "Slate", Parent = lz})

	-- glowing lava pools sunk into the floor + lights (10 parts, 5 lights)
	local pools = {{660, -40, 30}, {735, -55, 22}, {760, 30, 34}, {665, 50, 20}, {710, 0, 26}}
	for _, pool in ipairs(pools) do
		local px = pool[1]
		local pz = pool[2]
		local dia = pool[3]
		local lava = U.cyl({Name = "LavaPool", Size = Vector3.new(0.35, dia, dia),
			CFrame = CFrame.new(px, 0.55, pz) * CFrame.Angles(0, 0, math.rad(90)),
			Color = Color3.fromRGB(255, 120, 20), Neon = true, Parent = lz})
		U.cyl({Name = "LavaPoolRim", Size = Vector3.new(0.3, dia + 3, dia + 3),
			CFrame = CFrame.new(px, 0.42, pz) * CFrame.Angles(0, 0, math.rad(90)),
			Color = Color3.fromRGB(25, 22, 24), Material = "Basalt", Parent = lz})
		local li = Instance.new("PointLight")
		li.Color = Color3.fromRGB(255, 130, 30)
		li.Brightness = 1.6
		li.Range = 34
		li.Parent = lava
		-- rising embers out of each pool
		local pe = Instance.new("ParticleEmitter")
		pe.Color = ColorSequence.new(Color3.fromRGB(255, 140, 40), Color3.fromRGB(180, 40, 10))
		pe.LightEmission = 1
		pe.Lifetime = NumberRange.new(1, 2)
		pe.Speed = NumberRange.new(4, 9)
		pe.SpreadAngle = Vector2.new(12, 12)
		pe.Rate = 8
		pe.Size = NumberSequence.new({
			NumberSequenceKeypoint.new(0, 0.5),
			NumberSequenceKeypoint.new(1, 0),
		})
		pe.Parent = lava
	end

	-- two lava-falls pouring down the east wall into splash pools (6 parts)
	for _, fz in ipairs({-45, 35}) do
		U.part({Name = "LavaFall", Size = Vector3.new(2, 44, 9),
			CFrame = CFrame.new(788, 22.5, fz), Color = Color3.fromRGB(255, 110, 15),
			Neon = true, Parent = lz})
		U.part({Name = "LavaFallLip", Size = Vector3.new(4, 2, 11),
			CFrame = CFrame.new(788, 45, fz), Color = Color3.fromRGB(30, 27, 29),
			Material = "Basalt", Parent = lz})
		local splash = U.cyl({Name = "LavaSplash", Size = Vector3.new(0.4, 15, 15),
			CFrame = CFrame.new(785, 0.55, fz) * CFrame.Angles(0, 0, math.rad(90)),
			Color = Color3.fromRGB(255, 120, 20), Neon = true, Parent = lz})
		local pe = Instance.new("ParticleEmitter")
		pe.Color = ColorSequence.new(Color3.fromRGB(255, 150, 50))
		pe.LightEmission = 1
		pe.Lifetime = NumberRange.new(0.6, 1.2)
		pe.Speed = NumberRange.new(6, 12)
		pe.SpreadAngle = Vector2.new(35, 35)
		pe.Rate = 14
		pe.Size = NumberSequence.new({
			NumberSequenceKeypoint.new(0, 0.7),
			NumberSequenceKeypoint.new(1, 0),
		})
		pe.Parent = splash
	end

	-- basalt columns: two stacked drums each (12 parts)
	local cols = {{630, -70}, {680, -85}, {755, -80}, {775, 65}, {700, 70}, {635, 75}}
	for _, c in ipairs(cols) do
		vcyl({Name = "BasaltColumnLow", Size = Vector3.new(22, 9, 9),
			CFrame = CFrame.new(c[1], 11, c[2]), Color = Color3.fromRGB(42, 38, 40),
			Material = "Basalt", Parent = lz})
		vcyl({Name = "BasaltColumnHigh", Size = Vector3.new(18, 6.5, 6.5),
			CFrame = CFrame.new(c[1], 31, c[2]), Color = Color3.fromRGB(50, 45, 47),
			Material = "Basalt", Parent = lz})
	end

	-- smoke plumes over the biggest pools (4 parts)
	smoker(lz, Vector3.new(660, 4, -40), 4, 10, 5, Color3.fromRGB(70, 65, 66))
	smoker(lz, Vector3.new(760, 4, 30), 4, 10, 5, Color3.fromRGB(70, 65, 66))
	smoker(lz, Vector3.new(788, 40, -45), 3, 7, 4, Color3.fromRGB(90, 70, 60))
	smoker(lz, Vector3.new(788, 40, 35), 3, 7, 4, Color3.fromRGB(90, 70, 60))

	-- spinning ember orbiters: neon shards welded to a spinning pivot (6 parts)
	local emberPivot = U.part({Name = "EmberPivot", Size = Vector3.new(0.4, 0.4, 0.4),
		CFrame = CFrame.new(710, 16, 0), Transparency = 1, CanCollide = false, Parent = lz})
	for k = 0, 4 do
		local ang = k * (math.pi * 2 / 5)
		local shard = U.part({Name = "EmberShard", Size = Vector3.new(1, 1.4, 1),
			CFrame = CFrame.new(710 + math.cos(ang) * 14, 16 + math.sin(ang * 2) * 2, math.sin(ang) * 14)
				* CFrame.Angles(math.random(), math.random(), math.random()),
			Color = Color3.fromRGB(255, 150, 40), Neon = true,
			Anchored = false, CanCollide = false, Parent = lz})
		U.weld(emberPivot, shard)
		local pe = Instance.new("ParticleEmitter")
		pe.Color = ColorSequence.new(Color3.fromRGB(255, 160, 60))
		pe.LightEmission = 1
		pe.Lifetime = NumberRange.new(0.4, 0.9)
		pe.Speed = NumberRange.new(1, 3)
		pe.Rate = 6
		pe.Size = NumberSequence.new({
			NumberSequenceKeypoint.new(0, 0.35),
			NumberSequenceKeypoint.new(1, 0),
		})
		pe.Parent = shard
	end
	U.spinner(emberPivot, "Y", 0.8)

	-- pedestal displays of the 4 lava items along the north side (12 parts + models)
	displayItem(lz, "lavaball", 640, 75)
	displayItem(lz, "lavaplanet", 690, 82)
	displayItem(lz, "lavaeclipse", 740, 82)
	displayItem(lz, "gdstar", 780, 72)

	-- guide path from the gym to the gate, with ember marker posts (7 parts)
	U.part({Name = "LavaPath", Size = Vector3.new(510, 0.3, 10),
		CFrame = CFrame.new(335, 0.15, 0), Color = Color3.fromRGB(80, 76, 78),
		Material = "Cobblestone", Parent = lz})
	for i = 0, 5 do
		local mx = 130 + i * 90
		U.part({Name = "PathMarker", Size = Vector3.new(1.2, 3.5, 1.2),
			CFrame = CFrame.new(mx, 1.75, 7), Color = Color3.fromRGB(42, 38, 40),
			Material = "Basalt", Parent = lz})
	end

	-- THE OBSIDIAN GATE (west wall, x = 600): frame + sliding slab (4 parts)
	U.part({Name = "GatePillarA", Size = Vector3.new(7, 38, 9),
		CFrame = CFrame.new(600, 19, -18), Color = Color3.fromRGB(20, 16, 22),
		Material = "Granite", Parent = lz})
	U.part({Name = "GatePillarB", Size = Vector3.new(7, 38, 9),
		CFrame = CFrame.new(600, 19, 18), Color = Color3.fromRGB(20, 16, 22),
		Material = "Granite", Parent = lz})
	local lintel = U.part({Name = "GateLintel", Size = Vector3.new(7, 9, 45),
		CFrame = CFrame.new(600, 42.5, 0), Color = Color3.fromRGB(20, 16, 22),
		Material = "Granite", Parent = lz})
	U.label(lintel, "LAVA ZONE", {textColor = "orange", width = 320, height = 70, offsetY = 4})
	local slab = U.part({Name = "LavaGateSlab", Size = Vector3.new(2.5, 38, 27),
		CFrame = CFrame.new(600, 19, 0), Color = Color3.fromRGB(15, 12, 18),
		Material = "Granite", Parent = lz})
	-- outward (gym-facing) face is local -X = Left; inner face Right
	U.surfaceText(slab, "Left", "REBIRTH 6 REQUIRED", "red", nil)
	U.surfaceText(slab, "Right", "REBIRTH 6 REQUIRED", "red", nil)

	-- locked players who bump the gate get told why
	U.touchOnce(slab, 3, function(player)
		if not player:GetAttribute("LavaUnlocked") then
			G.Remotes.Notify:FireClient(player,
				"REBIRTH 6 REQUIRED to enter the Lava Zone!", "red")
		end
	end)

	-- Heartbeat proximity loop: the slab slides down into the ground only while
	-- a LavaUnlocked player is within 60 studs; solid for everyone else.
	local gateClosed = slab.CFrame
	local gateOpen = gateClosed * CFrame.new(0, -35, 0)
	local gatePos = gateClosed.Position
	local openAlpha = 0
	RunService.Heartbeat:Connect(function(dt)
		local want = false
		for _, pl in ipairs(Players:GetPlayers()) do
			if pl:GetAttribute("LavaUnlocked") then
				local ch = pl.Character
				local hrp = ch and ch:FindFirstChild("HumanoidRootPart")
				if hrp and (hrp.Position - gatePos).Magnitude < 60 then
					want = true
					break
				end
			end
		end
		local target = 0
		if want then target = 1 end
		if openAlpha ~= target then
			if want then
				openAlpha = math.min(1, openAlpha + dt / 1.5)
			else
				openAlpha = math.max(0, openAlpha - dt / 1.5)
			end
			slab.CFrame = gateClosed:Lerp(gateOpen, openAlpha)
			slab.CanCollide = openAlpha < 0.5
		end
	end)
end

--------------------------------------------------------------------
-- Build
--------------------------------------------------------------------

function M.Build(g)
	G = g or G
	local root = G.Util.model("GymWorld", workspace)

	-- Shop teleport targets (set first so they exist even mid-build)
	M.SpawnCF = CFrame.lookAt(Vector3.new(0, 3.5, -6), Vector3.new(0, 3.5, -30))
	M.LavaCF = CFrame.lookAt(Vector3.new(618, 3.5, 0), Vector3.new(700, 3.5, 0))

	buildOutdoors(root)         -- ~175 parts
	buildBuilding(root)         -- ~55 parts
	buildInterior(root)         -- ~245 parts
	buildPlazaAndShrine(root)   -- ~40 parts
	buildLavaZone(root)         -- ~120 parts + 4 scaled item models
	-- rough total ~640 parts + item display models: comfortably under the 1500 budget
end

return M
