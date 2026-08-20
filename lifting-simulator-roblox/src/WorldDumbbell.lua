-- WorldDumbbell.lua -- the Dumbbell World: a gym-themed planet surface centered (5000,0,0).
-- Rubber-floor terrain with soft hills, giant scenery dumbbells, a colossal barbell arch,
-- a protein-bar skyscraper, giant water bottle, vending machines, motivational billboard,
-- pedestal displays of the 5 dumbbell items, arrival pad + return portal, pushup mannequin.
-- Part budget target well under 900. Pure Lua 5.1 syntax.

local M = {}
local G = nil

function M.Init(g)
	G = g
end

-- World center. Ground top sits at y = 0 like the gym world.
local CX, CZ = 5000, 0

-- CFrame at an offset from the world center.
local function at(x, y, z)
	return CFrame.new(CX + x, y, CZ + z)
end

--------------------------------------------------------------------
-- Model scaling: resize every BasePart about the model pivot by s.
-- (Display clones are ~4x the hand-scale builder output.)
--------------------------------------------------------------------
local function scaleModel(model, s)
	local pivot = model:GetPivot()
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("BasePart") then
			local rel = pivot:ToObjectSpace(d.CFrame)
			d.Size = d.Size * s
			-- keep each part's rotation, scale its offset from the pivot
			d.CFrame = pivot * CFrame.new(rel.Position * s) * (rel - rel.Position)
		end
	end
end

--------------------------------------------------------------------
-- Build
--------------------------------------------------------------------
function M.Build(g)
	G = g or G
	local U = G.Util
	local world = U.model("DumbbellWorld", workspace)

	----------------------------------------------------------------
	-- TERRAIN: 600x600 dark rubber gym floor + soft hill plateaus
	----------------------------------------------------------------
	local ground = U.model("Terrain", world)
	local rubberDark = Color3.fromRGB(46, 46, 52)
	local rubberMid = Color3.fromRGB(58, 58, 66)

	U.part({Name = "Base", Size = Vector3.new(600, 6, 600), CFrame = at(0, -3, 0),
		Color = rubberDark, Material = "Asphalt", Parent = ground})

	-- central plaza disc (vertical cylinder = rotate so its X axis points up)
	U.cyl({Name = "Plaza", Size = Vector3.new(0.3, 90, 90),
		CFrame = at(0, 0.15, -10) * CFrame.Angles(0, 0, math.pi / 2),
		Color = Color3.fromRGB(40, 46, 60), Material = "SmoothPlastic", Parent = ground})

	-- scattered rubber accent tiles (checker feel around the plaza)
	local tileSpots = {
		{-60, -110}, {60, -110}, {-110, -40}, {110, -40}, {-110, 50},
		{110, 50}, {-60, 110}, {60, 110}, {0, 130}, {0, -140},
	}
	for i, sp in ipairs(tileSpots) do
		local c = rubberMid
		if i % 2 == 0 then c = Color3.fromRGB(52, 60, 84) end
		U.part({Name = "Tile", Size = Vector3.new(20, 0.2, 20), CFrame = at(sp[1], 0.1, sp[2]),
			Color = c, Material = "SmoothPlastic", Parent = ground})
	end

	-- neon guide stripes: arrival pad -> under the arch -> pedestal row
	for i = 0, 2 do
		U.part({Name = "Stripe", Size = Vector3.new(2, 0.15, 14),
			CFrame = at(0, 0.33, -48 + i * 17),
			Color = "lightblue", Neon = true, CanCollide = false, Parent = ground})
	end

	-- soft hills: wedge ramps rise toward their local +Z (tall face at the back),
	-- so each ramp is yawed so local +Z points INTO its plateau.
	local function ramp(x, y, z, w, h, d, yaw)
		local p = U.part({Name = "Ramp", Shape = "Wedge", Size = Vector3.new(w, h, d),
			CFrame = at(x, y, z) * CFrame.Angles(0, yaw, 0),
			Color = rubberDark, Material = "Asphalt", Parent = ground})
		return p
	end

	-- Plateau A (south-west of far field): x -200..-40, z 160..280, top y = 6
	U.part({Name = "HillA", Size = Vector3.new(160, 6, 120), CFrame = at(-120, 3, 220),
		Color = rubberDark, Material = "Asphalt", Parent = ground})
	ramp(-120, 3, 151, 140, 6, 18, 0)              -- south ramp, rises north (+Z)
	ramp(-31, 3, 220, 100, 6, 18, -math.pi / 2)    -- east ramp, rises west (-X)
	-- second tier: a giant blue gym mat mesa
	U.part({Name = "HillAMat", Size = Vector3.new(70, 5, 60), CFrame = at(-140, 8.5, 235),
		Color = Color3.fromRGB(40, 90, 200), Material = "Fabric", Parent = ground})
	ramp(-140, 8.5, 196, 60, 5, 18, 0)             -- mat ramp on its south side

	-- Plateau B (east field): x 130..270, z 130..230, top y = 8
	U.part({Name = "HillB", Size = Vector3.new(140, 8, 100), CFrame = at(200, 4, 180),
		Color = rubberDark, Material = "Asphalt", Parent = ground})
	ramp(200, 4, 119, 110, 8, 22, 0)               -- south ramp
	ramp(119, 4, 180, 80, 8, 22, math.pi / 2)      -- west ramp, rises east (+X)

	-- invisible perimeter walls so nobody strolls off the planet
	local wallData = {
		{0, -300, 604, 2}, {0, 300, 604, 2}, {-300, 0, 2, 604}, {300, 0, 2, 604},
	}
	for _, wd in ipairs(wallData) do
		U.part({Name = "EdgeWall", Size = Vector3.new(wd[3], 90, wd[4]),
			CFrame = at(wd[1], 45, wd[2]), Transparency = 1, Parent = ground})
	end

	----------------------------------------------------------------
	-- GIANT SCENERY DUMBBELLS (~50 studs, lying at angles)
	----------------------------------------------------------------
	local function giantDumbbell(cf, parent)
		local m = U.model("GiantDumbbell", parent)
		local steel = Color3.fromRGB(168, 170, 176)
		local plateBlack = Color3.fromRGB(24, 24, 26)
		-- handle: 50-stud steel bar along local X
		U.cyl({Name = "Handle", Size = Vector3.new(50, 5, 5), CFrame = cf,
			Color = steel, Material = "Metal", Parent = m})
		-- knurled grip zones
		for _, s in ipairs({-1, 1}) do
			U.cyl({Name = "Knurl", Size = Vector3.new(6, 5.4, 5.4),
				CFrame = cf * CFrame.new(s * 6, 0, 0),
				Color = Color3.fromRGB(90, 90, 96), Material = "DiamondPlate", Parent = m})
		end
		-- three black iron plates per side, biggest inboard
		local plates = {{18.5, 24, 4}, {22.5, 20, 3.6}, {25.8, 16, 3}}
		for _, s in ipairs({-1, 1}) do
			for _, pl in ipairs(plates) do
				U.cyl({Name = "Plate", Size = Vector3.new(pl[3], pl[2], pl[2]),
					CFrame = cf * CFrame.new(s * pl[1], 0, 0),
					Color = plateBlack, Material = "Metal", Parent = m})
			end
			-- gold end bolt
			U.cyl({Name = "Bolt", Size = Vector3.new(1.8, 5, 5),
				CFrame = cf * CFrame.new(s * 28.2, 0, 0),
				Color = "gold", Material = "Metal", Parent = m})
		end
		return m
	end

	-- plate radius 12 -> flat rest height y = 12
	giantDumbbell(at(170, 12, -120) * CFrame.Angles(0, 0.5, 0), world)
	giantDumbbell(at(-190, 12, -60) * CFrame.Angles(0, -0.35, 0), world)
	-- this one leans across Plateau A's south edge (slight pitch about its own axis)
	giantDumbbell(at(-100, 14.2, 170) * CFrame.Angles(0, 1.2, 0) * CFrame.Angles(0, 0, 0.12), world)

	----------------------------------------------------------------
	-- COLOSSAL BARBELL ARCH (walk under the bar between the plate stacks)
	----------------------------------------------------------------
	local arch = U.model("BarbellArch", world)
	local archCF = at(0, 22, -35) -- bar axis along world X at y=22
	U.cyl({Name = "Bar", Size = Vector3.new(136, 4.5, 4.5), CFrame = archCF,
		Color = Color3.fromRGB(180, 182, 188), Material = "Metal", Parent = arch})
	for _, s in ipairs({-1, 1}) do
		-- collar
		U.cyl({Name = "Collar", Size = Vector3.new(6, 10, 10),
			CFrame = archCF * CFrame.new(s * 48, 0, 0),
			Color = Color3.fromRGB(120, 122, 128), Material = "Metal", Parent = arch})
		-- plates: biggest (44 dia) touches the ground since bar is at y=22
		local aplates = {{55, 44, 5}, {60, 38, 5}, {65, 32, 5}}
		for _, pl in ipairs(aplates) do
			U.cyl({Name = "ArchPlate", Size = Vector3.new(pl[3], pl[2], pl[2]),
				CFrame = archCF * CFrame.new(s * pl[1], 0, 0),
				Color = Color3.fromRGB(22, 22, 24), Material = "Metal", Parent = arch})
		end
	end
	-- weight stamp on the outer face of each biggest plate
	local stampR = U.part({Name = "StampR", Size = Vector3.new(0.4, 20, 20),
		CFrame = archCF * CFrame.new(57.8, 0, 0), Color = "darkgray",
		Material = "Metal", CanCollide = false, Parent = arch})
	U.surfaceText(stampR, "Right", "2000 KG", "white")
	local stampL = U.part({Name = "StampL", Size = Vector3.new(0.4, 20, 20),
		CFrame = archCF * CFrame.new(-57.8, 0, 0), Color = "darkgray",
		Material = "Metal", CanCollide = false, Parent = arch})
	U.surfaceText(stampL, "Left", "2000 KG", "white")
	-- welcome sign hanging above the bar
	local archSign = U.part({Name = "ArchSign", Size = Vector3.new(30, 5, 0.6),
		CFrame = at(0, 28.5, -35), Color = "black", Material = "SmoothPlastic",
		CanCollide = false, Parent = arch})
	U.surfaceText(archSign, "Front", "DUMBBELL WORLD", "gold", "black")
	U.surfaceText(archSign, "Back", "DUMBBELL WORLD", "gold", "black")

	----------------------------------------------------------------
	-- PROTEIN-BAR SKYSCRAPER (wrapped bar stood on end, foil peeled at the top)
	----------------------------------------------------------------
	local tower = U.model("ProteinTower", world)
	local foilBlue = Color3.fromRGB(35, 70, 160)
	local choc = Color3.fromRGB(88, 55, 32)
	local tx, tz = -180, 120
	-- wrapped body
	U.part({Name = "Wrapper", Size = Vector3.new(26, 88, 26), CFrame = at(tx, 44, tz),
		Color = foilBlue, Material = "Foil", Parent = tower})
	-- red brand band with label text
	local band = U.part({Name = "Band", Size = Vector3.new(27, 18, 27), CFrame = at(tx, 52, tz),
		Color = Color3.fromRGB(200, 40, 40), Material = "Foil", Parent = tower})
	U.surfaceText(band, "Front", "MEGA GAINZ\nPROTEIN BAR", "white")
	U.surfaceText(band, "Back", "MEGA GAINZ\nPROTEIN BAR", "white")
	-- crimped wrapper fins at the base (the squeezed end of the packet)
	U.part({Name = "Crimp", Size = Vector3.new(30, 4, 2), CFrame = at(tx, 2, tz + 13.5) * CFrame.Angles(0.25, 0, 0),
		Color = foilBlue, Material = "Foil", Parent = tower})
	U.part({Name = "Crimp", Size = Vector3.new(30, 4, 2), CFrame = at(tx, 2, tz - 13.5) * CFrame.Angles(-0.25, 0, 0),
		Color = foilBlue, Material = "Foil", Parent = tower})
	-- torn foil ring where the peel starts
	U.part({Name = "TornRing", Size = Vector3.new(27.5, 2.5, 27.5), CFrame = at(tx, 88, tz),
		Color = Color3.fromRGB(200, 205, 215), Material = "Foil", Parent = tower})
	-- exposed chocolate bar top
	U.part({Name = "BarTop", Size = Vector3.new(23, 22, 23), CFrame = at(tx, 100, tz),
		Color = choc, Material = "Slate", Parent = tower})
	-- chocolate break-off squares on the very top
	for ix = -1, 1, 2 do
		for iz = -1, 1, 2 do
			U.part({Name = "ChocSquare", Size = Vector3.new(9.5, 3.5, 9.5),
				CFrame = at(tx + ix * 5.5, 112.7, tz + iz * 5.5),
				Color = Color3.fromRGB(74, 46, 26), Material = "Slate", Parent = tower})
		end
	end
	-- peeled foil flaps curling outward just under the exposed bar
	local flapAng = {0, math.pi / 2, math.pi, -math.pi / 2}
	for _, a in ipairs(flapAng) do
		local dir = CFrame.new(CX + tx, 91, CZ + tz) * CFrame.Angles(0, a, 0)
		U.part({Name = "Flap", Size = Vector3.new(13, 15, 0.8),
			CFrame = dir * CFrame.new(0, 3, -14.5) * CFrame.Angles(-0.62, 0, 0),
			Color = Color3.fromRGB(205, 210, 220), Material = "Foil",
			CanCollide = false, Parent = tower})
	end
	-- little glass lobby door at street level (it IS a skyscraper, after all)
	U.part({Name = "DoorFrame", Size = Vector3.new(9, 11, 1), CFrame = at(tx, 5.5, tz - 13.2),
		Color = "darkgray", Material = "Metal", Parent = tower})
	U.part({Name = "DoorGlass", Size = Vector3.new(7, 9.4, 0.5), CFrame = at(tx, 4.7, tz - 13.4),
		Color = "lightblue", Material = "Glass", Transparency = 0.5, Parent = tower})

	----------------------------------------------------------------
	-- GIANT WATER BOTTLE
	----------------------------------------------------------------
	local bottle = U.model("GiantBottle", world)
	local bx, bz = 120, 60
	local vert = CFrame.Angles(0, 0, math.pi / 2) -- stands a cylinder upright
	U.cyl({Name = "Body", Size = Vector3.new(30, 16, 16), CFrame = at(bx, 15, bz) * vert,
		Color = "lightblue", Material = "Glass", Transparency = 0.5, Parent = bottle})
	U.cyl({Name = "Water", Size = Vector3.new(22, 15, 15), CFrame = at(bx, 11, bz) * vert,
		Color = Color3.fromRGB(40, 120, 230), Material = "Glass", Transparency = 0.35,
		CanCollide = false, Parent = bottle})
	U.part({Name = "Shoulder", Size = Vector3.new(15, 15, 15), Shape = "Ball",
		CFrame = at(bx, 30, bz), Color = "lightblue", Material = "Glass",
		Transparency = 0.5, CanCollide = false, Parent = bottle})
	U.cyl({Name = "Neck", Size = Vector3.new(6, 7, 7), CFrame = at(bx, 38, bz) * vert,
		Color = "lightblue", Material = "Glass", Transparency = 0.4, Parent = bottle})
	U.cyl({Name = "Cap", Size = Vector3.new(4, 8.5, 8.5), CFrame = at(bx, 43, bz) * vert,
		Color = "white", Material = "SmoothPlastic", Parent = bottle})
	U.cyl({Name = "Nozzle", Size = Vector3.new(2.5, 3, 3), CFrame = at(bx, 46.2, bz) * vert,
		Color = "blue", Material = "SmoothPlastic", Parent = bottle})
	local blabel = U.cyl({Name = "BottleLabel", Size = Vector3.new(8, 16.4, 16.4),
		CFrame = at(bx, 17, bz) * vert, Color = "white", Material = "SmoothPlastic",
		CanCollide = false, Parent = bottle})
	U.label(blabel, "HYDRO-GAINS", {offsetY = 18, textColor = "cyan", width = 260})

	----------------------------------------------------------------
	-- VENDING MACHINES
	----------------------------------------------------------------
	local function vendingMachine(x, z, yaw, signText, bodyColor, drinkColors, parent)
		local m = U.model("VendingMachine", parent)
		local root = at(x, 0, z) * CFrame.Angles(0, yaw, 0)
		-- cabinet
		U.part({Name = "Cabinet", Size = Vector3.new(8, 13, 5), CFrame = root * CFrame.new(0, 6.5, 0),
			Color = bodyColor, Material = "Metal", Parent = m})
		-- glass display window (left 2/3 of the front; front is local -Z)
		U.part({Name = "Window", Size = Vector3.new(5, 7.5, 0.35), CFrame = root * CFrame.new(-1, 8.4, -2.55),
			Color = "lightblue", Material = "Glass", Transparency = 0.4, CanCollide = false, Parent = m})
		-- three interior shelves with product rows
		for row = 0, 2 do
			local shelfY = 5.6 + row * 2.4
			U.part({Name = "Shelf", Size = Vector3.new(5, 0.25, 3),
				CFrame = root * CFrame.new(-1, shelfY, -0.8),
				Color = "darkgray", Material = "Metal", CanCollide = false, Parent = m})
			for col = 0, 2 do
				local c = drinkColors[(row + col) % #drinkColors + 1]
				U.cyl({Name = "Drink", Size = Vector3.new(1.7, 0.9, 0.9),
					CFrame = root * CFrame.new(-2.5 + col * 1.5, shelfY + 1.0, -0.9) * CFrame.Angles(0, 0, math.pi / 2),
					Color = c, Material = "SmoothPlastic", CanCollide = false, Parent = m})
			end
		end
		-- keypad + coin slot column on the right of the window
		local pad = U.part({Name = "Keypad", Size = Vector3.new(1.5, 2.2, 0.3),
			CFrame = root * CFrame.new(2.8, 9.5, -2.6), Color = "black",
			Material = "SmoothPlastic", CanCollide = false, Parent = m})
		U.surfaceText(pad, "Front", "1 2 3\n4 5 6\n7 8 9", "green", "black")
		U.part({Name = "CoinSlot", Size = Vector3.new(1.2, 0.6, 0.3),
			CFrame = root * CFrame.new(2.8, 7.6, -2.6), Color = "gold",
			Material = "Metal", CanCollide = false, Parent = m})
		-- dispensing flap
		U.part({Name = "FlapFrame", Size = Vector3.new(5, 1.8, 0.35),
			CFrame = root * CFrame.new(-0.5, 2.2, -2.55), Color = "black",
			Material = "SmoothPlastic", CanCollide = false, Parent = m})
		U.part({Name = "Flap", Size = Vector3.new(4.2, 1.2, 0.2),
			CFrame = root * CFrame.new(-0.5, 2.1, -2.62), Color = "darkgray",
			Material = "Metal", CanCollide = false, Parent = m})
		-- glowing header sign
		local sign = U.part({Name = "Sign", Size = Vector3.new(8, 1.7, 0.7),
			CFrame = root * CFrame.new(0, 13.9, -1), Color = "white", Neon = true, Parent = m})
		U.surfaceText(sign, "Front", signText, "black")
		-- side vents
		for _, s in ipairs({-1, 1}) do
			U.part({Name = "Vent", Size = Vector3.new(0.25, 4, 3),
				CFrame = root * CFrame.new(s * 4.1, 4, 0.5), Color = "darkgray",
				Material = "DiamondPlate", CanCollide = false, Parent = m})
		end
		return m
	end

	vendingMachine(60, 60, math.pi, "PROTEIN SHAKES", Color3.fromRGB(170, 35, 40),
		{U.Colors.white, U.Colors.pink, U.Colors.brown}, world)
	vendingMachine(85, 60, math.pi, "ENERGY BARS", Color3.fromRGB(30, 110, 190),
		{U.Colors.gold, U.Colors.green, U.Colors.orange}, world)

	----------------------------------------------------------------
	-- MOTIVATIONAL BILLBOARD
	----------------------------------------------------------------
	local bb = U.model("Billboard", world)
	local bbCF = at(-100, 0, -140) * CFrame.Angles(0, math.pi, 0) -- panel front faces the plaza
	for _, s in ipairs({-1, 1}) do
		U.cyl({Name = "Leg", Size = Vector3.new(16, 1.6, 1.6),
			CFrame = bbCF * CFrame.new(s * 14, 8, 0) * CFrame.Angles(0, 0, math.pi / 2),
			Color = "darkgray", Material = "Metal", Parent = bb})
	end
	local panel = U.part({Name = "Panel", Size = Vector3.new(36, 14, 0.8),
		CFrame = bbCF * CFrame.new(0, 22, 0), Color = "white",
		Material = "SmoothPlastic", Parent = bb})
	U.surfaceText(panel, "Front", "LIGHT WEIGHT, BABY!\nEVERY REP COUNTS", "yellow", "black")
	-- steel trim frame
	U.part({Name = "Trim", Size = Vector3.new(37, 0.8, 1), CFrame = bbCF * CFrame.new(0, 29.2, 0),
		Color = "gray", Material = "Metal", Parent = bb})
	U.part({Name = "Trim", Size = Vector3.new(37, 0.8, 1), CFrame = bbCF * CFrame.new(0, 14.8, 0),
		Color = "gray", Material = "Metal", Parent = bb})
	U.part({Name = "Trim", Size = Vector3.new(0.8, 14, 1), CFrame = bbCF * CFrame.new(-18.1, 22, 0),
		Color = "gray", Material = "Metal", Parent = bb})
	U.part({Name = "Trim", Size = Vector3.new(0.8, 14, 1), CFrame = bbCF * CFrame.new(18.1, 22, 0),
		Color = "gray", Material = "Metal", Parent = bb})
	-- little neon downlights on the top edge
	for _, s in ipairs({-1, 1}) do
		U.part({Name = "Lamp", Size = Vector3.new(2, 0.6, 1.4),
			CFrame = bbCF * CFrame.new(s * 9, 29.9, -0.5), Color = "yellow",
			Neon = true, CanCollide = false, Parent = bb})
	end

	----------------------------------------------------------------
	-- GIANT KETTLEBELL (bonus scenery)
	----------------------------------------------------------------
	local kb = U.model("GiantKettlebell", world)
	local kx, kz = 100, -150
	U.part({Name = "Bell", Size = Vector3.new(18, 18, 18), Shape = "Ball",
		CFrame = at(kx, 8.6, kz), Color = Color3.fromRGB(26, 26, 30), Material = "Metal", Parent = kb})
	U.cyl({Name = "BellBase", Size = Vector3.new(1, 10, 10), CFrame = at(kx, 0.5, kz) * vert,
		Color = Color3.fromRGB(26, 26, 30), Material = "Metal", Parent = kb})
	for _, s in ipairs({-1, 1}) do
		U.cyl({Name = "HandlePost", Size = Vector3.new(7, 2.6, 2.6),
			CFrame = at(kx + s * 4.2, 18.5, kz) * vert,
			Color = Color3.fromRGB(70, 70, 76), Material = "Metal", Parent = kb})
	end
	U.cyl({Name = "HandleGrip", Size = Vector3.new(11, 2.8, 2.8), CFrame = at(kx, 22, kz),
		Color = Color3.fromRGB(70, 70, 76), Material = "Metal", Parent = kb})

	----------------------------------------------------------------
	-- PEDESTAL DISPLAYS: the 5 dumbbell-world items, scaled 4x, spinning
	----------------------------------------------------------------
	local pedRow = U.model("ItemPedestals", world)
	local displayIds = {"protein", "dumbbell", "pushups", "situps", "universe"}
	for i, id in ipairs(displayIds) do
		local px = -64 + (i - 1) * 32
		local pz = 10
		local ped = U.model("Pedestal_" .. id, pedRow)
		-- marble base on the plaza (plaza top y = 0.3)
		U.part({Name = "Base", Size = Vector3.new(10, 1.2, 10), CFrame = at(px, 0.9, pz),
			Color = "white", Material = "Marble", Parent = ped})
		U.cyl({Name = "Column", Size = Vector3.new(5, 6, 6), CFrame = at(px, 4, pz) * vert,
			Color = Color3.fromRGB(225, 225, 228), Material = "Marble", Parent = ped})
		U.cyl({Name = "TopDisc", Size = Vector3.new(0.8, 8, 8), CFrame = at(px, 6.9, pz) * vert,
			Color = "white", Material = "Marble", Parent = ped})
		-- name / price plaque leaning toward the walkway (south, -Z)
		local item = G.Config.ItemById(id)
		local plaque = U.part({Name = "Plaque", Size = Vector3.new(8, 4.5, 0.6),
			CFrame = at(px, 2.6, pz - 5.4) * CFrame.Angles(-0.3, 0, 0),
			Color = "black", Material = "Slate", Parent = ped})
		if item then
			local costText = "FREE"
			if item.cost > 0 then costText = U.fmt(item.cost) .. " STRENGTH" end
			U.surfaceText(plaque, "Front",
				item.name .. "\n" .. costText .. "\n+" .. U.fmt(item.power) .. " / LIFT",
				"gold", "black")
		end
		-- the display model itself: builder clone scaled 4x, floated, spinning
		local builder = G.ItemBuilders[id]
		if builder then
			local mdl = builder()
			mdl.Name = "Display_" .. id
			mdl.Parent = ped
			scaleModel(mdl, 4)
			-- center the model's bounding box above the pedestal top (y = 7.3)
			local bcf, bsize = mdl:GetBoundingBox()
			local target = Vector3.new(CX + px, 7.3 + bsize.Y / 2 + 0.6, CZ + pz)
			mdl:PivotTo(mdl:GetPivot() + (target - bcf.Position))
			-- invisible anchored hub at the bbox center; weld everything to it and spin it
			local hub = U.part({Name = "SpinHub", Size = Vector3.new(0.5, 0.5, 0.5),
				CFrame = CFrame.new(target), Transparency = 1, CanCollide = false, Parent = mdl})
			for _, d in ipairs(mdl:GetDescendants()) do
				if d:IsA("BasePart") and d ~= hub then
					U.weld(hub, d)
					d.Anchored = false
					d.CanCollide = false
				end
			end
			U.spinner(hub, "Y", 0.7)
		end
	end

	----------------------------------------------------------------
	-- ARRIVAL PAD (gym portal drops players here)
	----------------------------------------------------------------
	local padM = U.model("ArrivalPad", world)
	U.cyl({Name = "PadRing", Size = Vector3.new(0.35, 20, 20), CFrame = at(0, 0.18, -60) * vert,
		Color = "lightblue", Neon = true, Parent = padM})
	local pad = U.cyl({Name = "Pad", Size = Vector3.new(0.9, 17, 17), CFrame = at(0, 0.55, -60) * vert,
		Color = Color3.fromRGB(120, 124, 132), Material = "DiamondPlate", Parent = padM})
	U.cyl({Name = "PadCore", Size = Vector3.new(0.3, 8, 8), CFrame = at(0, 1.1, -60) * vert,
		Color = "cyan", Neon = true, Parent = padM})
	U.label(pad, "DUMBBELL WORLD", {offsetY = 7, textColor = "lightblue", width = 300})
	M.ArrivalCF = at(0, 4, -60)

	----------------------------------------------------------------
	-- RETURN PORTAL: granite archway back to the gym
	----------------------------------------------------------------
	local portal = U.model("ReturnPortal", world)
	local poCF = at(0, 0, -95) -- fill faces north toward the pad
	-- step platform
	U.part({Name = "Steps", Size = Vector3.new(22, 1, 10), CFrame = poCF * CFrame.new(0, 0.5, 0),
		Color = "granite", Material = "Granite", Parent = portal})
	-- two stacked-block columns
	for _, s in ipairs({-1, 1}) do
		U.part({Name = "ColBlock", Size = Vector3.new(3.4, 4.5, 3.4),
			CFrame = poCF * CFrame.new(s * 7.5, 3.25, 0), Color = "granite", Material = "Granite", Parent = portal})
		U.part({Name = "ColBlock", Size = Vector3.new(3.1, 4.5, 3.1),
			CFrame = poCF * CFrame.new(s * 7.5, 7.75, 0), Color = Color3.fromRGB(150, 148, 143),
			Material = "Granite", Parent = portal})
		U.part({Name = "ColBlock", Size = Vector3.new(3.4, 4.5, 3.4),
			CFrame = poCF * CFrame.new(s * 7.5, 12.25, 0), Color = "granite", Material = "Granite", Parent = portal})
		U.part({Name = "Capital", Size = Vector3.new(4.2, 1.2, 4.2),
			CFrame = poCF * CFrame.new(s * 7.5, 15.1, 0), Color = Color3.fromRGB(160, 158, 152),
			Material = "Granite", Parent = portal})
	end
	-- lintel + sign
	U.part({Name = "Lintel", Size = Vector3.new(20, 2.6, 4), CFrame = poCF * CFrame.new(0, 17, 0),
		Color = "granite", Material = "Granite", Parent = portal})
	local psign = U.part({Name = "PortalSign", Size = Vector3.new(14, 2.6, 0.8),
		CFrame = poCF * CFrame.new(0, 19.6, 0), Color = "black", Material = "SmoothPlastic", Parent = portal})
	U.surfaceText(psign, "Front", "BACK TO GYM", "white", "black")
	U.surfaceText(psign, "Back", "BACK TO GYM", "white", "black")
	-- silver swirl fill
	local fill = U.part({Name = "PortalFill", Size = Vector3.new(12.5, 14.6, 0.6),
		CFrame = poCF * CFrame.new(0, 8.3, 0), Color = Color3.fromRGB(210, 212, 220),
		Neon = true, Transparency = 0.35, CanCollide = false, Parent = portal})
	local swirl = Instance.new("ParticleEmitter")
	swirl.Color = ColorSequence.new(Color3.fromRGB(230, 232, 240), Color3.fromRGB(150, 155, 175))
	swirl.LightEmission = 0.8
	swirl.Lifetime = NumberRange.new(0.8, 1.6)
	swirl.Rate = 18
	swirl.Speed = NumberRange.new(1, 3)
	swirl.SpreadAngle = Vector2.new(180, 180)
	swirl.RotSpeed = NumberRange.new(-120, 120)
	swirl.Size = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.8),
		NumberSequenceKeypoint.new(1, 0),
	})
	swirl.Parent = fill
	-- touch: teleport home (SpawnCF is read at touch time; WorldGym builds first)
	U.touchOnce(fill, 2, function(player, char)
		local gym = G.WorldGym
		local cf = gym and gym.SpawnCF
		if cf and char and char.Parent then
			char:PivotTo(cf)
		end
	end)

	----------------------------------------------------------------
	-- PUSHUP MANNEQUIN: plastic training dummy mid-set on a mat
	----------------------------------------------------------------
	local npc = U.model("PushupMannequin", world)
	local nCF = at(40, 0, -70) * CFrame.Angles(0, -0.5, 0) -- head toward local +X
	local skin = Color3.fromRGB(232, 200, 165)
	U.part({Name = "Mat", Size = Vector3.new(10, 0.15, 4.5), CFrame = nCF * CFrame.new(0, 0.08, 0),
		Color = Color3.fromRGB(50, 90, 200), Material = "Fabric", Parent = npc})
	-- torso is the anchored bob root; everything else welds to it
	local torso = U.part({Name = "Torso", Size = Vector3.new(3.2, 1.2, 2), CFrame = nCF * CFrame.new(0.6, 1.7, 0),
		Color = "white", Material = "SmoothPlastic", Parent = npc})
	local pieces = {}
	pieces[1] = U.part({Name = "Head", Size = Vector3.new(1.3, 1.3, 1.3), Shape = "Ball",
		CFrame = nCF * CFrame.new(2.9, 2.1, 0), Color = skin, Material = "SmoothPlastic", Parent = npc})
	pieces[2] = U.part({Name = "Headband", Size = Vector3.new(1.36, 0.35, 1.36),
		CFrame = nCF * CFrame.new(2.9, 2.35, 0), Color = "red", Material = "Fabric",
		CanCollide = false, Parent = npc})
	-- straight arms planted under the shoulders
	for i, s in ipairs({-1, 1}) do
		pieces[2 + i] = U.part({Name = "Arm", Size = Vector3.new(0.8, 1.9, 0.8),
			CFrame = nCF * CFrame.new(1.7, 1.0, s * 1.35), Color = skin,
			Material = "SmoothPlastic", Parent = npc})
		pieces[4 + i] = U.part({Name = "Hand", Size = Vector3.new(1.1, 0.35, 0.9),
			CFrame = nCF * CFrame.new(1.7, 0.25, s * 1.35), Color = skin,
			Material = "SmoothPlastic", Parent = npc})
	end
	-- shorts + straight legs back to the toes
	pieces[7] = U.part({Name = "Shorts", Size = Vector3.new(1.4, 1.1, 2.05),
		CFrame = nCF * CFrame.new(-1.5, 1.55, 0), Color = "darkgray", Material = "Fabric", Parent = npc})
	for i, s in ipairs({-1, 1}) do
		pieces[7 + i] = U.part({Name = "Leg", Size = Vector3.new(3.2, 0.8, 0.85),
			CFrame = nCF * CFrame.new(-3.5, 1.15, s * 0.55) * CFrame.Angles(0, 0, 0.18),
			Color = skin, Material = "SmoothPlastic", Parent = npc})
		pieces[9 + i] = U.part({Name = "Shoe", Size = Vector3.new(0.7, 1.1, 0.9),
			CFrame = nCF * CFrame.new(-5.2, 0.6, s * 0.55), Color = "white",
			Material = "SmoothPlastic", Parent = npc})
	end
	for _, prt in ipairs(pieces) do
		U.weld(torso, prt)
		prt.Anchored = false
		prt.CanCollide = false
	end
	-- the pushup: bob the whole welded body ~1 stud, forever
	U.mover(torso, torso.CFrame, torso.CFrame * CFrame.new(0, 1.05, 0), 1.8)
	U.label(torso, "one million and ONE...", {offsetY = 4, textColor = "white", width = 260, maxDistance = 90})

	return world
end

return M
