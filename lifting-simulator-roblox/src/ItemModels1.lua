-- ItemModels1: gym-world lifting item sculptures (pencil, rock, book, lamp, candle,
-- tv, house, cybertruck, tree, train). Each builder returns a FRESH anchored Model,
-- PrimaryPart set, bounding size roughly 1-5 studs so it reads as a hand-held object.
-- All geometry is many well-proportioned parts with real materials - never one block.
local ItemModels1 = {}
local G -- context from Main
local U -- shortcut to G.Util

-- Vertical-cylinder CFrame helper. Roblox cylinders lie along X, so rotating 90
-- degrees about Z stands the cylinder up (its length runs along world Y).
local function vc(x, y, z)
	return CFrame.new(x, y, z) * CFrame.Angles(0, 0, math.rad(90))
end

-- Set the PrimaryPart and weld every other BasePart to it, so the model survives
-- being unanchored later by Shop.GiveTool (which also welds everything to Handle -
-- a duplicate WeldConstraint between the same pair is harmless).
local function finish(model, primary)
	model.PrimaryPart = primary
	for _, p in ipairs(model:GetDescendants()) do
		if p:IsA("BasePart") and p ~= primary then
			U.weld(primary, p)
		end
	end
	return model
end

----------------------------------------------------------------------------------
-- PENCIL: yellow shaft, sharpened wood + graphite tip, metal ferrule, pink eraser.
-- Built lying along X (natural cylinder axis); about 3.4 studs long.
----------------------------------------------------------------------------------
local function buildPencil()
	local m = U.model("Pencil")
	-- main painted shaft
	local shaft = U.cyl({Name = "Shaft", Size = Vector3.new(2.4, 0.25, 0.25),
		CFrame = CFrame.new(0, 0, 0), Color = "yellow", Parent = m})
	-- exposed sharpened wood cone (approximated by a narrower tan cylinder)
	U.cyl({Name = "WoodTip", Size = Vector3.new(0.3, 0.17, 0.17),
		CFrame = CFrame.new(1.33, 0, 0), Color = "tan", Material = "Wood", Parent = m})
	-- graphite point
	U.cyl({Name = "Graphite", Size = Vector3.new(0.16, 0.08, 0.08),
		CFrame = CFrame.new(1.54, 0, 0), Color = Color3.fromRGB(40, 40, 45), Parent = m})
	-- crimped metal ferrule band (slightly fatter than the shaft, like the real thing)
	U.cyl({Name = "Ferrule", Size = Vector3.new(0.2, 0.28, 0.28),
		CFrame = CFrame.new(-1.28, 0, 0), Color = Color3.fromRGB(200, 205, 210),
		Material = "Metal", Reflectance = 0.2, Parent = m})
	-- pink rubber eraser
	U.cyl({Name = "Eraser", Size = Vector3.new(0.24, 0.24, 0.24),
		CFrame = CFrame.new(-1.48, 0, 0), Color = "pink", Parent = m})
	return finish(m, shaft)
end

----------------------------------------------------------------------------------
-- ROCK: irregular pile of overlapping Slate chunks in varied grays, rotated at odd
-- angles so no clean box edges show. About 1.6 studs across.
----------------------------------------------------------------------------------
local function buildRock()
	local m = U.model("Rock")
	local core = U.part({Name = "Core", Size = Vector3.new(1.3, 0.85, 1.1),
		CFrame = CFrame.new(0, 0.45, 0) * CFrame.Angles(0.15, 0.5, 0.1),
		Color = Color3.fromRGB(108, 108, 112), Material = "Slate", Parent = m})
	-- overlapping side chunks break up the silhouette
	U.part({Name = "Chunk1", Size = Vector3.new(0.9, 0.7, 0.8),
		CFrame = CFrame.new(0.35, 0.4, -0.25) * CFrame.Angles(-0.3, 1.1, 0.25),
		Color = Color3.fromRGB(122, 120, 118), Material = "Slate", Parent = m})
	U.part({Name = "Chunk2", Size = Vector3.new(0.75, 0.6, 0.9),
		CFrame = CFrame.new(-0.38, 0.35, 0.2) * CFrame.Angles(0.4, -0.7, -0.2),
		Color = Color3.fromRGB(96, 97, 100), Material = "Slate", Parent = m})
	-- top knob gives it a lumpy crown
	U.part({Name = "Chunk3", Size = Vector3.new(0.5, 0.45, 0.55),
		CFrame = CFrame.new(0.05, 0.85, 0.1) * CFrame.Angles(0.6, 0.3, 0.5),
		Color = Color3.fromRGB(130, 128, 124), Material = "Slate", Parent = m})
	-- a small pebble stuck to the side
	U.part({Name = "Pebble", Size = Vector3.new(0.3, 0.3, 0.3), Shape = "Ball",
		CFrame = CFrame.new(0.6, 0.2, 0.35),
		Color = Color3.fromRGB(140, 138, 134), Material = "Slate", Parent = m})
	return finish(m, core)
end

----------------------------------------------------------------------------------
-- BOOK: two hardcover slabs, white page block, cloth spine, short embossed title
-- on the front cover. Lies flat; about 2.3 x 0.5 x 1.6 studs.
----------------------------------------------------------------------------------
local function buildBook()
	local m = U.model("Book")
	local coverColor = Color3.fromRGB(120, 30, 35) -- deep red cloth hardcover
	-- bottom cover slab
	local bottom = U.part({Name = "BackCover", Size = Vector3.new(2.25, 0.08, 1.6),
		CFrame = CFrame.new(0, 0.04, 0), Color = coverColor, Material = "Fabric", Parent = m})
	-- page block, inset from the three open edges, flush toward the spine (-X)
	U.part({Name = "Pages", Size = Vector3.new(2.1, 0.3, 1.48),
		CFrame = CFrame.new(0.02, 0.23, 0), Color = Color3.fromRGB(245, 242, 230), Parent = m})
	-- top cover slab
	local top = U.part({Name = "FrontCover", Size = Vector3.new(2.25, 0.08, 1.6),
		CFrame = CFrame.new(0, 0.42, 0), Color = coverColor, Material = "Fabric", Parent = m})
	-- rounded cloth spine wrapping the -X edge, spanning both covers
	U.part({Name = "Spine", Size = Vector3.new(0.1, 0.46, 1.6),
		CFrame = CFrame.new(-1.12, 0.23, 0), Color = coverColor, Material = "Fabric", Parent = m})
	-- short gold title embossed on the front cover
	U.surfaceText(top, "Top", "IRON GAINS", Color3.fromRGB(235, 200, 90), coverColor)
	return finish(m, bottom)
end

----------------------------------------------------------------------------------
-- LAMP: weighted metal base, thin stem, fabric drum shade, warm Neon bulb with a
-- real PointLight inside. About 2.3 studs tall.
----------------------------------------------------------------------------------
local function buildLamp()
	local m = U.model("SmallLamp")
	-- weighted disc base
	local base = U.cyl({Name = "Base", Size = Vector3.new(0.2, 1.15, 1.15),
		CFrame = vc(0, 0.1, 0), Color = Color3.fromRGB(60, 62, 66),
		Material = "Metal", Parent = m})
	-- little rotary switch knob on the base edge
	U.cyl({Name = "Switch", Size = Vector3.new(0.12, 0.1, 0.1),
		CFrame = vc(0.45, 0.26, 0), Color = "darkgray", Material = "Metal", Parent = m})
	-- thin stem up the middle
	U.cyl({Name = "Stem", Size = Vector3.new(1.5, 0.12, 0.12),
		CFrame = vc(0, 0.95, 0), Color = Color3.fromRGB(70, 72, 76),
		Material = "Metal", Parent = m})
	-- warm glowing bulb (Neon) tucked up inside the shade
	local bulb = U.part({Name = "Bulb", Size = Vector3.new(0.32, 0.32, 0.32), Shape = "Ball",
		CFrame = CFrame.new(0, 1.72, 0), Color = Color3.fromRGB(255, 222, 150),
		Neon = true, Parent = m})
	local light = Instance.new("PointLight")
	light.Color = Color3.fromRGB(255, 214, 150)
	light.Brightness = 1.2
	light.Range = 8
	light.Parent = bulb
	-- fabric drum shade around the bulb (slightly see-through so the glow reads)
	U.cyl({Name = "Shade", Size = Vector3.new(0.75, 1.35, 1.35),
		CFrame = vc(0, 1.85, 0), Color = Color3.fromRGB(232, 220, 190),
		Material = "Fabric", Transparency = 0.15, Parent = m})
	return finish(m, base)
end

----------------------------------------------------------------------------------
-- CANDLE: small white wax cylinder with drip bumps, dark wick, Neon flame with
-- fire particles and a flickering PointLight. About 1.3 studs tall.
----------------------------------------------------------------------------------
local function buildCandle()
	local m = U.model("Candle")
	-- the wax pillar
	local wax = U.cyl({Name = "Wax", Size = Vector3.new(0.9, 0.7, 0.7),
		CFrame = vc(0, 0.45, 0), Color = Color3.fromRGB(248, 244, 232), Parent = m})
	-- melted drip bumps around the top rim
	U.part({Name = "Drip1", Size = Vector3.new(0.16, 0.16, 0.16), Shape = "Ball",
		CFrame = CFrame.new(0.3, 0.85, 0.1), Color = Color3.fromRGB(248, 244, 232), Parent = m})
	U.part({Name = "Drip2", Size = Vector3.new(0.14, 0.14, 0.14), Shape = "Ball",
		CFrame = CFrame.new(-0.25, 0.83, -0.18), Color = Color3.fromRGB(248, 244, 232), Parent = m})
	-- one long drip running down the side
	U.cyl({Name = "Drip3", Size = Vector3.new(0.35, 0.1, 0.1),
		CFrame = vc(0.32, 0.68, -0.08), Color = Color3.fromRGB(250, 247, 238), Parent = m})
	-- charred wick
	U.cyl({Name = "Wick", Size = Vector3.new(0.18, 0.06, 0.06),
		CFrame = vc(0, 0.97, 0), Color = Color3.fromRGB(35, 30, 28), Parent = m})
	-- the flame: neon orange teardrop-ish ball
	local flame = U.part({Name = "Flame", Size = Vector3.new(0.18, 0.18, 0.18), Shape = "Ball",
		CFrame = CFrame.new(0, 1.12, 0), Color = Color3.fromRGB(255, 170, 40),
		Neon = true, CanCollide = false, Parent = m})
	-- rising fire particles (default particle texture only - no asset ids)
	local pe = Instance.new("ParticleEmitter")
	pe.Color = ColorSequence.new(Color3.fromRGB(255, 200, 60), Color3.fromRGB(255, 90, 20))
	pe.Size = NumberSequence.new({NumberSequenceKeypoint.new(0, 0.18), NumberSequenceKeypoint.new(1, 0.02)})
	pe.Transparency = NumberSequence.new({NumberSequenceKeypoint.new(0, 0.2), NumberSequenceKeypoint.new(1, 1)})
	pe.Lifetime = NumberRange.new(0.3, 0.6)
	pe.Rate = 14
	pe.Speed = NumberRange.new(0.8, 1.4)
	pe.SpreadAngle = Vector2.new(8, 8)
	pe.LightEmission = 1
	pe.Parent = flame
	local fire = Instance.new("Fire")
	fire.Size = 2
	fire.Heat = 3
	fire.Parent = flame
	-- flickering warm light: wait until the clone is actually in the game, then
	-- jitter brightness/range; exits cleanly once the model is destroyed.
	local light = Instance.new("PointLight")
	light.Color = Color3.fromRGB(255, 180, 90)
	light.Brightness = 2
	light.Range = 8
	light.Parent = flame
	task.spawn(function()
		local t0 = os.clock()
		while not light:IsDescendantOf(game) do
			if os.clock() - t0 > 120 then return end -- builder result never used; give up
			task.wait(1)
		end
		while light:IsDescendantOf(game) do
			light.Brightness = 1.4 + math.random() * 1.4
			light.Range = 7 + math.random() * 2
			task.wait(0.08 + math.random() * 0.12)
		end
	end)
	return finish(m, wax)
end

----------------------------------------------------------------------------------
-- TV: thin black bezel, dark glass screen with a faint neon backlight tint,
-- stand feet, and a tiny remote sitting beside it. About 4 studs wide.
-- Screen faces +Z.
----------------------------------------------------------------------------------
local function buildTV()
	local m = U.model("TV")
	-- slim bezel body
	local bezel = U.part({Name = "Bezel", Size = Vector3.new(3.4, 2.0, 0.12),
		CFrame = CFrame.new(0, 1.55, 0), Color = Color3.fromRGB(22, 22, 24), Parent = m})
	-- faint neon glow layer just in front of the bezel face (the "backlight")
	U.part({Name = "Backlight", Size = Vector3.new(3.05, 1.65, 0.02),
		CFrame = CFrame.new(0, 1.55, 0.075), Color = Color3.fromRGB(30, 55, 95),
		Neon = true, Transparency = 0.6, CanCollide = false, Parent = m})
	-- dark glass panel over the top
	U.part({Name = "Screen", Size = Vector3.new(3.15, 1.75, 0.05),
		CFrame = CFrame.new(0, 1.55, 0.12), Color = Color3.fromRGB(14, 14, 18),
		Material = "Glass", Transparency = 0.25, Reflectance = 0.12,
		CanCollide = false, Parent = m})
	-- small glowing power LED under the screen
	U.part({Name = "LED", Size = Vector3.new(0.08, 0.05, 0.03),
		CFrame = CFrame.new(1.4, 0.62, 0.07), Color = "red", Neon = true,
		CanCollide = false, Parent = m})
	-- two feet: flat pads on the ground plus short risers up to the bezel
	for _, x in ipairs({-1.15, 1.15}) do
		U.part({Name = "FootPad", Size = Vector3.new(0.6, 0.06, 0.55),
			CFrame = CFrame.new(x, 0.03, 0.05), Color = Color3.fromRGB(35, 35, 38),
			Material = "Metal", Parent = m})
		U.part({Name = "FootRiser", Size = Vector3.new(0.12, 0.5, 0.12),
			CFrame = CFrame.new(x, 0.31, 0.02) * CFrame.Angles(math.rad(8), 0, 0),
			Color = Color3.fromRGB(35, 35, 38), Material = "Metal", Parent = m})
	end
	-- tiny remote lying beside the TV, buttons up
	U.part({Name = "Remote", Size = Vector3.new(0.24, 0.08, 0.7),
		CFrame = CFrame.new(1.95, 0.04, 0.15) * CFrame.Angles(0, math.rad(20), 0),
		Color = Color3.fromRGB(28, 28, 30), Parent = m})
	-- remote buttons: power (red) + two channel studs
	U.part({Name = "RBtn1", Size = Vector3.new(0.07, 0.03, 0.07),
		CFrame = CFrame.new(1.87, 0.09, -0.06) * CFrame.Angles(0, math.rad(20), 0),
		Color = "red", Neon = true, CanCollide = false, Parent = m})
	U.part({Name = "RBtn2", Size = Vector3.new(0.07, 0.03, 0.07),
		CFrame = CFrame.new(1.93, 0.09, 0.12) * CFrame.Angles(0, math.rad(20), 0),
		Color = "gray", CanCollide = false, Parent = m})
	U.part({Name = "RBtn3", Size = Vector3.new(0.07, 0.03, 0.07),
		CFrame = CFrame.new(2.0, 0.09, 0.3) * CFrame.Angles(0, math.rad(20), 0),
		Color = "white", CanCollide = false, Parent = m})
	return finish(m, bezel)
end

----------------------------------------------------------------------------------
-- HOUSE: brick walls, wedge gable roof (ridge along X), wooden door with a gold
-- knob, framed glass windows, brick chimney. About 3 x 2.9 x 2.4 studs.
-- Roblox WedgePart: vertical face at +Z, slope descends toward -Z (thin edge at -Z).
----------------------------------------------------------------------------------
local function buildHouse()
	local m = U.model("House")
	-- main brick shell
	local walls = U.part({Name = "Walls", Size = Vector3.new(2.6, 1.6, 2.0),
		CFrame = CFrame.new(0, 0.8, 0), Color = Color3.fromRGB(155, 88, 70),
		Material = "Brick", Parent = m})
	-- front door (front face is +Z) with a gold knob
	U.part({Name = "Door", Size = Vector3.new(0.55, 1.05, 0.06),
		CFrame = CFrame.new(0, 0.53, 1.02), Color = Color3.fromRGB(95, 60, 35),
		Material = "Wood", Parent = m})
	U.part({Name = "Knob", Size = Vector3.new(0.09, 0.09, 0.09), Shape = "Ball",
		CFrame = CFrame.new(0.18, 0.5, 1.07), Color = "gold", Material = "Metal",
		Reflectance = 0.3, CanCollide = false, Parent = m})
	-- two framed front windows: white frame slab with a glass pane proud of it
	for _, x in ipairs({-0.85, 0.85}) do
		U.part({Name = "WinFrame", Size = Vector3.new(0.62, 0.62, 0.05),
			CFrame = CFrame.new(x, 1.0, 1.01), Color = "white", Parent = m})
		U.part({Name = "WinGlass", Size = Vector3.new(0.5, 0.5, 0.05),
			CFrame = CFrame.new(x, 1.0, 1.04), Color = Color3.fromRGB(150, 200, 230),
			Material = "Glass", Transparency = 0.4, Reflectance = 0.15, Parent = m})
	end
	-- one framed window on each gable-end wall
	for _, x in ipairs({-1.29, 1.29}) do
		U.part({Name = "SideFrame", Size = Vector3.new(0.05, 0.6, 0.6),
			CFrame = CFrame.new(x, 1.0, -0.2), Color = "white", Parent = m})
		U.part({Name = "SideGlass", Size = Vector3.new(0.05, 0.48, 0.48),
			CFrame = CFrame.new(x * 1.02, 1.0, -0.2), Color = Color3.fromRGB(150, 200, 230),
			Material = "Glass", Transparency = 0.4, Parent = m})
	end
	-- gable roof: two dark slate wedges meeting at a ridge that runs along X.
	-- +Z half needs its tall face at the ridge (center), so rotate it 180 about Y;
	-- -Z half works in the default orientation.
	U.part({Name = "RoofSouth", Size = Vector3.new(3.0, 0.85, 1.2), Shape = "Wedge",
		CFrame = CFrame.new(0, 2.03, 0.6) * CFrame.Angles(0, math.rad(180), 0),
		Color = Color3.fromRGB(70, 70, 78), Material = "Slate", Parent = m})
	U.part({Name = "RoofNorth", Size = Vector3.new(3.0, 0.85, 1.2), Shape = "Wedge",
		CFrame = CFrame.new(0, 2.03, -0.6), Color = Color3.fromRGB(70, 70, 78),
		Material = "Slate", Parent = m})
	-- ridge cap beam hides the seam between the two wedges
	U.part({Name = "RidgeCap", Size = Vector3.new(3.0, 0.1, 0.18),
		CFrame = CFrame.new(0, 2.48, 0), Color = Color3.fromRGB(55, 55, 62),
		Material = "Slate", Parent = m})
	-- brick chimney punching through the roof, with a darker cap
	U.part({Name = "Chimney", Size = Vector3.new(0.35, 1.0, 0.35),
		CFrame = CFrame.new(0.85, 2.35, -0.45), Color = Color3.fromRGB(140, 78, 62),
		Material = "Brick", Parent = m})
	U.part({Name = "ChimneyCap", Size = Vector3.new(0.45, 0.08, 0.45),
		CFrame = CFrame.new(0.85, 2.89, -0.45), Color = Color3.fromRGB(90, 90, 95),
		Material = "Concrete", Parent = m})
	return finish(m, walls)
end

----------------------------------------------------------------------------------
-- CYBERTRUCK: angular stainless steel wedges forming the iconic triangular
-- silhouette. Length runs along Z with the nose at -Z; wheels are natural
-- X-axis cylinders. About 3.6 studs long.
----------------------------------------------------------------------------------
local function buildCybertruck()
	local m = U.model("Cybertruck")
	local steel = Color3.fromRGB(190, 192, 196)
	local darkGlass = Color3.fromRGB(35, 40, 46)
	-- slab-sided lower body
	local body = U.part({Name = "Body", Size = Vector3.new(1.5, 0.55, 3.6),
		CFrame = CFrame.new(0, 0.65, 0), Color = steel, Material = "Metal",
		Reflectance = 0.15, Parent = m})
	-- flat angular hood rising from the nose toward the windshield (thin edge at -Z
	-- is the WedgePart default, so no rotation needed)
	U.part({Name = "Hood", Size = Vector3.new(1.5, 0.3, 1.1), Shape = "Wedge",
		CFrame = CFrame.new(0, 1.075, -1.25), Color = steel, Material = "Metal",
		Reflectance = 0.15, Parent = m})
	-- dark glass canopy wedge continuing the hood line up to the apex
	U.part({Name = "Canopy", Size = Vector3.new(1.44, 0.52, 0.9), Shape = "Wedge",
		CFrame = CFrame.new(0, 1.485, -0.25), Color = darkGlass, Material = "Glass",
		Transparency = 0.15, Reflectance = 0.1, Parent = m})
	-- stainless bed cover sloping from the apex down to the tail (tall face must sit
	-- at -Z against the canopy apex, so rotate 180 about Y)
	U.part({Name = "BedCover", Size = Vector3.new(1.44, 0.52, 1.7), Shape = "Wedge",
		CFrame = CFrame.new(0, 1.485, 1.05) * CFrame.Angles(0, math.rad(180), 0),
		Color = steel, Material = "Metal", Reflectance = 0.15, Parent = m})
	-- signature full-width light bar across the nose + red tail strip
	U.part({Name = "LightBar", Size = Vector3.new(1.5, 0.06, 0.05),
		CFrame = CFrame.new(0, 0.95, -1.81), Color = "white", Neon = true,
		CanCollide = false, Parent = m})
	U.part({Name = "TailLight", Size = Vector3.new(1.5, 0.06, 0.05),
		CFrame = CFrame.new(0, 0.95, 1.81), Color = "red", Neon = true,
		CanCollide = false, Parent = m})
	-- chunky black wheels (cylinder axis already along X = the axle direction)
	-- with smaller stainless hubcaps poking out of each face
	for _, z in ipairs({-1.15, 1.15}) do
		for _, x in ipairs({-0.78, 0.78}) do
			U.cyl({Name = "Wheel", Size = Vector3.new(0.35, 0.85, 0.85),
				CFrame = CFrame.new(x, 0.43, z), Color = Color3.fromRGB(25, 25, 28), Parent = m})
			local side = 1
			if x < 0 then side = -1 end
			U.cyl({Name = "Hubcap", Size = Vector3.new(0.06, 0.42, 0.42),
				CFrame = CFrame.new(x + side * 0.18, 0.43, z), Color = steel,
				Material = "Metal", Reflectance = 0.25, CanCollide = false, Parent = m})
		end
	end
	return finish(m, body)
end

----------------------------------------------------------------------------------
-- TREE: brown wooden trunk with layered green canopy balls. About 4 studs tall.
----------------------------------------------------------------------------------
local function buildTree()
	local m = U.model("Tree")
	-- trunk (vertical cylinder)
	local trunk = U.cyl({Name = "Trunk", Size = Vector3.new(1.8, 0.45, 0.45),
		CFrame = vc(0, 0.9, 0), Color = Color3.fromRGB(105, 70, 45),
		Material = "Wood", Parent = m})
	-- a root flare at the base sells "roots and all"
	U.cyl({Name = "RootFlare", Size = Vector3.new(0.25, 0.7, 0.7),
		CFrame = vc(0, 0.12, 0), Color = Color3.fromRGB(95, 62, 40),
		Material = "Wood", Parent = m})
	-- layered canopy: big dark base ball, brighter middle, small crown, two side puffs
	U.part({Name = "Canopy1", Size = Vector3.new(1.9, 1.9, 1.9), Shape = "Ball",
		CFrame = CFrame.new(0, 2.35, 0), Color = Color3.fromRGB(45, 110, 45),
		Material = "Grass", Parent = m})
	U.part({Name = "Canopy2", Size = Vector3.new(1.5, 1.5, 1.5), Shape = "Ball",
		CFrame = CFrame.new(0.2, 3.0, 0.1), Color = Color3.fromRGB(60, 135, 55),
		Material = "Grass", Parent = m})
	U.part({Name = "Crown", Size = Vector3.new(1.1, 1.1, 1.1), Shape = "Ball",
		CFrame = CFrame.new(-0.1, 3.5, -0.05), Color = Color3.fromRGB(52, 122, 50),
		Material = "Grass", Parent = m})
	U.part({Name = "Puff1", Size = Vector3.new(1.1, 1.1, 1.1), Shape = "Ball",
		CFrame = CFrame.new(0.75, 2.6, 0.3), Color = Color3.fromRGB(55, 125, 52),
		Material = "Grass", Parent = m})
	U.part({Name = "Puff2", Size = Vector3.new(1.0, 1.0, 1.0), Shape = "Ball",
		CFrame = CFrame.new(-0.7, 2.55, -0.35), Color = Color3.fromRGB(48, 115, 48),
		Material = "Grass", Parent = m})
	return finish(m, trunk)
end

----------------------------------------------------------------------------------
-- TRAIN: dark green/black steam locomotive with boiler, smokestack, cab,
-- cowcatcher, gold trim, driver wheels, plus a small coal tender behind.
-- Length runs along X with the nose at +X. About 4.8 studs long.
----------------------------------------------------------------------------------
local function buildTrain()
	local m = U.model("Train")
	local loco = Color3.fromRGB(28, 70, 45) -- dark racing green
	-- black frame/chassis running the length of the locomotive
	local chassis = U.part({Name = "Chassis", Size = Vector3.new(3.0, 0.15, 0.9),
		CFrame = CFrame.new(0, 0.55, 0), Color = "black", Material = "Metal", Parent = m})
	-- main boiler barrel (natural X-axis cylinder)
	U.cyl({Name = "Boiler", Size = Vector3.new(1.9, 0.95, 0.95),
		CFrame = CFrame.new(0.35, 1.1, 0), Color = loco, Material = "Metal", Parent = m})
	-- black smokebox nose section
	U.cyl({Name = "Smokebox", Size = Vector3.new(0.35, 1.0, 1.0),
		CFrame = CFrame.new(1.48, 1.1, 0), Color = Color3.fromRGB(25, 25, 27),
		Material = "Metal", Parent = m})
	-- gold boiler bands + a gold ring where the smokebox meets the boiler
	U.cyl({Name = "Band1", Size = Vector3.new(0.08, 1.0, 1.0),
		CFrame = CFrame.new(-0.1, 1.1, 0), Color = "gold", Material = "Metal",
		Reflectance = 0.3, CanCollide = false, Parent = m})
	U.cyl({Name = "Band2", Size = Vector3.new(0.08, 1.0, 1.0),
		CFrame = CFrame.new(0.75, 1.1, 0), Color = "gold", Material = "Metal",
		Reflectance = 0.3, CanCollide = false, Parent = m})
	U.cyl({Name = "NoseRing", Size = Vector3.new(0.07, 1.04, 1.04),
		CFrame = CFrame.new(1.3, 1.1, 0), Color = "gold", Material = "Metal",
		Reflectance = 0.3, CanCollide = false, Parent = m})
	-- smokestack with a flared crown, up front on the smokebox
	U.cyl({Name = "Stack", Size = Vector3.new(0.55, 0.3, 0.3),
		CFrame = vc(1.4, 1.85, 0), Color = "black", Material = "Metal", Parent = m})
	U.cyl({Name = "StackCrown", Size = Vector3.new(0.12, 0.44, 0.44),
		CFrame = vc(1.4, 2.16, 0), Color = "black", Material = "Metal", Parent = m})
	-- steam dome on the boiler top
	U.part({Name = "Dome", Size = Vector3.new(0.42, 0.42, 0.42), Shape = "Ball",
		CFrame = CFrame.new(0.55, 1.62, 0), Color = loco, Material = "Metal", Parent = m})
	-- cowcatcher: wedge rotated -90 about Y so its thin edge points forward (+X)
	U.part({Name = "Cowcatcher", Size = Vector3.new(0.9, 0.5, 0.55), Shape = "Wedge",
		CFrame = CFrame.new(1.85, 0.35, 0) * CFrame.Angles(0, math.rad(-90), 0),
		Color = "darkred", Material = "Metal", Parent = m})
	-- driver's cab at the rear with side windows and a black roof
	U.part({Name = "Cab", Size = Vector3.new(0.9, 0.95, 1.05),
		CFrame = CFrame.new(-1.0, 1.15, 0), Color = loco, Material = "Metal", Parent = m})
	for _, z in ipairs({-0.54, 0.54}) do
		U.part({Name = "CabWindow", Size = Vector3.new(0.4, 0.35, 0.04),
			CFrame = CFrame.new(-1.0, 1.35, z), Color = Color3.fromRGB(160, 200, 225),
			Material = "Glass", Transparency = 0.35, CanCollide = false, Parent = m})
	end
	U.part({Name = "CabRoof", Size = Vector3.new(1.05, 0.08, 1.2),
		CFrame = CFrame.new(-1.0, 1.68, 0), Color = "black", Material = "Metal", Parent = m})
	-- headlamp on the smokebox front
	U.part({Name = "Headlamp", Size = Vector3.new(0.16, 0.22, 0.22),
		CFrame = CFrame.new(1.68, 1.45, 0), Color = Color3.fromRGB(255, 235, 170),
		Neon = true, CanCollide = false, Parent = m})
	-- three big driver wheels per side: cylinders rotated 90 about Y so the axle
	-- runs along Z, each with a small gold hub
	for _, z in ipairs({-0.52, 0.52}) do
		for _, x in ipairs({1.0, 0.3, -0.4}) do
			U.cyl({Name = "Driver", Size = Vector3.new(0.14, 0.55, 0.55),
				CFrame = CFrame.new(x, 0.35, z) * CFrame.Angles(0, math.rad(90), 0),
				Color = Color3.fromRGB(20, 20, 22), Parent = m})
			local side = 1
			if z < 0 then side = -1 end
			U.cyl({Name = "Hub", Size = Vector3.new(0.05, 0.2, 0.2),
				CFrame = CFrame.new(x, 0.35, z + side * 0.08) * CFrame.Angles(0, math.rad(90), 0),
				Color = "gold", Material = "Metal", Reflectance = 0.3,
				CanCollide = false, Parent = m})
		end
	end
	-- coal tender: green-sided black bin heaped with rough coal lumps
	U.part({Name = "TenderBody", Size = Vector3.new(1.1, 0.6, 0.95),
		CFrame = CFrame.new(-2.05, 0.95, 0), Color = loco, Material = "Metal", Parent = m})
	U.part({Name = "TenderFrame", Size = Vector3.new(1.15, 0.12, 0.9),
		CFrame = CFrame.new(-2.05, 0.6, 0), Color = "black", Material = "Metal", Parent = m})
	-- coal heap: overlapping rotated slate-black lumps above the bin
	U.part({Name = "Coal1", Size = Vector3.new(0.75, 0.3, 0.6),
		CFrame = CFrame.new(-2.05, 1.3, 0) * CFrame.Angles(0.2, 0.4, 0.1),
		Color = Color3.fromRGB(20, 20, 20), Material = "Slate", Parent = m})
	U.part({Name = "Coal2", Size = Vector3.new(0.45, 0.28, 0.4),
		CFrame = CFrame.new(-1.85, 1.42, 0.12) * CFrame.Angles(-0.3, 1.0, 0.2),
		Color = Color3.fromRGB(28, 28, 30), Material = "Slate", Parent = m})
	U.part({Name = "Coal3", Size = Vector3.new(0.4, 0.25, 0.38),
		CFrame = CFrame.new(-2.25, 1.4, -0.14) * CFrame.Angles(0.4, -0.6, -0.2),
		Color = Color3.fromRGB(16, 16, 18), Material = "Slate", Parent = m})
	-- two smaller wheels per side under the tender
	for _, z in ipairs({-0.5, 0.5}) do
		for _, x in ipairs({-1.8, -2.3}) do
			U.cyl({Name = "TenderWheel", Size = Vector3.new(0.12, 0.4, 0.4),
				CFrame = CFrame.new(x, 0.3, z) * CFrame.Angles(0, math.rad(90), 0),
				Color = Color3.fromRGB(20, 20, 22), Parent = m})
		end
	end
	return finish(m, chassis)
end

----------------------------------------------------------------------------------
-- Init: store G and register every builder. Builders are called fresh per clone.
----------------------------------------------------------------------------------
function ItemModels1.Init(g)
	G = g
	U = G.Util
	G.ItemBuilders.pencil = buildPencil
	G.ItemBuilders.rock = buildRock
	G.ItemBuilders.book = buildBook
	G.ItemBuilders.lamp = buildLamp
	G.ItemBuilders.candle = buildCandle
	G.ItemBuilders.tv = buildTV
	G.ItemBuilders.house = buildHouse
	G.ItemBuilders.cybertruck = buildCybertruck
	G.ItemBuilders.tree = buildTree
	G.ItemBuilders.train = buildTrain
end

return ItemModels1
