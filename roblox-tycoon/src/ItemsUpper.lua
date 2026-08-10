-- ItemsUpper.lua — Boss Tycoon purchase-chain builds #25-58 (BuildBalcony .. BuildPortal)
-- Balcony + fence + balcony conveyor line, outside collector yard, rainbow floor line,
-- black floor, lanterns, and the ancient portal to the Lab.
-- All geometry via G.Util.part + plot:cf, machinery via G.ItemsCore, numbers via G.Balance.
-- Plain Lua 5.1 syntax only.

local M = {}
local G

function M.Init(ctx)
	G = ctx
end

----------------------------------------------------------------------
-- shared constants (plot-local geometry, per CONTRACT.md)
----------------------------------------------------------------------
-- Balcony: x 40..65, z -25..25, floor-2 height (top of slab y = 24)
-- Balcony conveyor: along Z at x = 52, belt top y = 27, travel +Z, collector z ~ 27
-- Floor-2 main belt: along X at z = -15, belt top y = 27, travel +X
-- Outside yard: x -75..-45 on the ground
-- Rainbow floor top y = 48, rainbow belt top y = 51 at z = -15 (x -30..32, +X)
-- Black floor top y = 72, roof y = 96
local RAINBOW_LADDER_X, RAINBOW_LADDER_Z = -34, 35 -- hole in rainbow floor here
local BLACK_LADDER_X, BLACK_LADDER_Z = 34, 35      -- hole in black floor here

local RAINBOW = {
	Color3.fromRGB(255, 60, 60),   -- red
	Color3.fromRGB(255, 150, 40),  -- orange
	Color3.fromRGB(255, 230, 50),  -- yellow
	Color3.fromRGB(80, 255, 90),   -- green
	Color3.fromRGB(60, 220, 255),  -- cyan
	Color3.fromRGB(70, 110, 255),  -- blue
	Color3.fromRGB(160, 70, 255),  -- purple
	Color3.fromRGB(255, 100, 200), -- pink
}

local function dropStats(key, defValue, defInterval)
	local t = (G.Balance and G.Balance.Drops and G.Balance.Drops[key]) or nil
	if t then
		return t.value or defValue, t.interval or defInterval
	end
	return defValue, defInterval
end

local function upStats(id, defMult, defAdd)
	local t = (G.Balance and G.Balance.Ups and G.Balance.Ups[id]) or nil
	if t then
		return t.mult or defMult, t.add or defAdd
	end
	return defMult, defAdd
end

-- travel-direction rotations for plot-local conveyors
local ROT_PLUS_X = CFrame.Angles(0, -math.pi / 2, 0) -- LookVector = +X
local ROT_PLUS_Z = CFrame.Angles(0, math.pi, 0)      -- LookVector = +Z
local ROT_MINUS_X = CFrame.Angles(0, math.pi / 2, 0) -- LookVector = -X

----------------------------------------------------------------------
-- #25 Balcony — platform outside the +X wall at floor-2 height
----------------------------------------------------------------------
function M.BuildBalcony(G, plot)
	local m = G.Util.model("Balcony", plot.itemsFolder)

	-- main slab: x 40..65, z -25..25, top at y = 24
	G.Util.part({
		Name = "BalconySlab", Parent = m,
		Size = Vector3.new(25, 2, 50),
		CFrame = plot:cf(52.5, 23, 0),
		Color = "gray", Material = "Concrete",
	})
	-- neon edge trim so it pops
	G.Util.part({
		Name = "TrimEast", Parent = m, Size = Vector3.new(0.6, 0.6, 50),
		CFrame = plot:cf(64.8, 24.2, 0), Color = "cyan", Neon = true, CanCollide = false,
	})
	G.Util.part({
		Name = "TrimNorth", Parent = m, Size = Vector3.new(25, 0.6, 0.6),
		CFrame = plot:cf(52.5, 24.2, 24.8), Color = "cyan", Neon = true, CanCollide = false,
	})
	G.Util.part({
		Name = "TrimSouth", Parent = m, Size = Vector3.new(25, 0.6, 0.6),
		CFrame = plot:cf(52.5, 24.2, -24.8), Color = "cyan", Neon = true, CanCollide = false,
	})
	-- chunky support pillars down to the ground
	local pillars = { {45, -20}, {45, 20}, {62, -20}, {62, 20} }
	for i = 1, #pillars do
		G.Util.part({
			Name = "BalconyPillar" .. i, Parent = m,
			Size = Vector3.new(3, 22, 3),
			CFrame = plot:cf(pillars[i][1], 11, pillars[i][2]),
			Color = "gray", Material = "Concrete",
		})
	end
	-- doorway arch marker on the wall side so kids know where to walk out
	local arch = G.Util.part({
		Name = "BalconyDoorTrim", Parent = m, Size = Vector3.new(1, 1, 8),
		CFrame = plot:cf(40.5, 32, 0), Color = "gold", Neon = true, CanCollide = false,
	})
	G.Util.label(arch, "BALCONY!", { alwaysOnTop = true })
end

----------------------------------------------------------------------
-- #26 Balcony Fence — safety rails around the outer edges
----------------------------------------------------------------------
function M.BuildBalconyFence(G, plot)
	local m = G.Util.model("BalconyFence", plot.itemsFolder)

	local function rail(cx, cz, sx, sz, y)
		G.Util.part({
			Name = "FenceRail", Parent = m,
			Size = Vector3.new(sx, 0.5, sz),
			CFrame = plot:cf(cx, y, cz),
			Color = "lightblue", Neon = true,
		})
	end
	local function post(x, z)
		G.Util.part({
			Name = "FencePost", Parent = m,
			Size = Vector3.new(0.8, 4, 0.8),
			CFrame = plot:cf(x, 26, z),
			Color = "gold", Material = "Metal",
		})
	end

	-- east rail (x = 65), two rail heights
	rail(64.6, 0, 0.5, 50, 25.5)
	rail(64.6, 0, 0.5, 50, 27.5)
	-- south rail (z = -25)
	rail(52.5, -24.6, 25, 0.5, 25.5)
	rail(52.5, -24.6, 25, 0.5, 27.5)
	-- north rail (z = 25) with a gap at x 49..55 where the conveyor passes to its collector
	rail(44.5, 24.6, 9, 0.5, 25.5)
	rail(44.5, 24.6, 9, 0.5, 27.5)
	rail(60, 24.6, 10, 0.5, 25.5)
	rail(60, 24.6, 10, 0.5, 27.5)

	-- posts
	local px = { 40.5, 46, 52, 58, 64 }
	for i = 1, #px do
		post(px[i], -24.6)
		post(px[i], 24.6)
	end
	local pz = { -24, -12, 0, 12, 24 }
	for i = 1, #pz do
		post(64.6, pz[i])
	end
end

----------------------------------------------------------------------
-- #27 Balcony Conveyor & Collector — along Z at x=52, belt top y=27, collector z~27
----------------------------------------------------------------------
function M.BuildConveyor3(G, plot)
	local m = G.Util.model("BalconyConveyor", plot.itemsFolder)

	-- belt runs z -25 -> +25, drops travel +Z into the collector
	G.ItemsCore.MakeConveyor(G, m, plot:cf(52, 26.5, 0) * ROT_PLUS_Z, 50, 6, 8, "lightblue")

	-- side guards so drops stay on
	G.Util.part({
		Name = "BeltGuardW", Parent = m, Size = Vector3.new(0.5, 2, 50),
		CFrame = plot:cf(48.7, 27.5, 0), Color = "blue", Transparency = 0.4, Material = "Glass",
	})
	G.Util.part({
		Name = "BeltGuardE", Parent = m, Size = Vector3.new(0.5, 2, 50),
		CFrame = plot:cf(55.3, 27.5, 0), Color = "blue", Transparency = 0.4, Material = "Glass",
	})

	-- collector bin just past the fence line at z ~ 27, with a support bracket
	G.Util.part({
		Name = "CollectorBracket", Parent = m, Size = Vector3.new(8, 1, 5),
		CFrame = plot:cf(52, 23.5, 27), Color = "gray", Material = "Concrete",
	})
	G.ItemsCore.MakeCollector(G, plot, {
		cframe = plot:cf(52, 26.5, 27.5),
		size = Vector3.new(8, 5, 3),
	})
end

----------------------------------------------------------------------
-- #28 Super Cool Collectors — restyle every collector, level 2
----------------------------------------------------------------------
function M.BuildSuperCollectors(G, plot)
	G.ItemsCore.RestyleCollectors(plot, 2)
end

----------------------------------------------------------------------
-- #29-33 Balcony Droppers 1-5 — over the balcony belt
----------------------------------------------------------------------
local BALC_DROPPER_Z = { -21, -14, -7, 0, 7 }
local BALC_DROPPER_COLOR = { "lightblue", "cyan", "blue", "purple", "gold" }

local function buildBalcDropper(plot, n)
	local m = G.Util.model("BalcDropper" .. n, plot.itemsFolder)
	local value, interval = dropStats("balc", 45, 3)
	G.ItemsCore.MakeDropper(G, plot, {
		cframe = plot:cf(52, 33, BALC_DROPPER_Z[n]),
		colorName = BALC_DROPPER_COLOR[n],
		dropValue = value,
		interval = interval,
	})
	-- decorative stilts holding the dropper over the belt
	G.Util.part({
		Name = "DropperLegA", Parent = m, Size = Vector3.new(0.6, 8, 0.6),
		CFrame = plot:cf(48.5, 28, BALC_DROPPER_Z[n]), Color = "gray", Material = "Metal",
	})
	G.Util.part({
		Name = "DropperLegB", Parent = m, Size = Vector3.new(0.6, 8, 0.6),
		CFrame = plot:cf(55.5, 28, BALC_DROPPER_Z[n]), Color = "gray", Material = "Metal",
	})
end

function M.BuildBalcDropper1(G, plot) buildBalcDropper(plot, 1) end
function M.BuildBalcDropper2(G, plot) buildBalcDropper(plot, 2) end
function M.BuildBalcDropper3(G, plot) buildBalcDropper(plot, 3) end
function M.BuildBalcDropper4(G, plot) buildBalcDropper(plot, 4) end
function M.BuildBalcDropper5(G, plot) buildBalcDropper(plot, 5) end

----------------------------------------------------------------------
-- #34 Balcony Upgrader — arch over the balcony belt
----------------------------------------------------------------------
function M.BuildBalcUpgrader(G, plot)
	local mult, add = upStats("balc_upgrader", 2, 0)
	G.ItemsCore.MakeUpgrader(G, plot, {
		cframe = plot:cf(52, 27, 14) * ROT_PLUS_Z,
		mult = mult, add = add,
		colorName = "cyan",
		name = "balc_upgrader",
	})
end

----------------------------------------------------------------------
-- #35 Fence Upgrader — glowing ring in the fence line; drops passing it get boosted
----------------------------------------------------------------------
function M.BuildFenceUpgrader(G, plot)
	local m = G.Util.model("FenceUpgrader", plot.itemsFolder)
	local mult, add = upStats("fence_upgrader", 2.5, 0)

	-- the functional beam sits exactly on the fence line (z = 25)
	G.ItemsCore.MakeUpgrader(G, plot, {
		cframe = plot:cf(52, 27, 25) * ROT_PLUS_Z,
		mult = mult, add = add,
		colorName = "gold",
		name = "fence_upgrader",
	})

	-- glowing golden hoop wrapping the belt where it pierces the fence
	-- (cylinder axis is X; yaw 90 deg points the axis along Z)
	local hoop = G.Util.part({
		Name = "FenceRing", Parent = m, Shape = "Cylinder",
		Size = Vector3.new(0.8, 10, 10),
		CFrame = plot:cf(52, 28, 25) * CFrame.Angles(0, math.pi / 2, 0),
		Color = "gold", Neon = true, CanCollide = false,
	})
	local inner = G.Util.part({
		Name = "FenceRingGlow", Parent = m, Shape = "Cylinder",
		Size = Vector3.new(0.4, 11, 11),
		CFrame = plot:cf(52, 28, 25) * CFrame.Angles(0, math.pi / 2, 0),
		Color = "yellow", Neon = true, CanCollide = false, Transparency = 0.5,
	})
	local light = Instance.new("PointLight")
	light.Color = Color3.fromRGB(255, 220, 90)
	light.Brightness = 2
	light.Range = 14
	light.Parent = hoop
	G.Util.label(inner, "FENCE BOOST x" .. tostring(mult), {})
end

----------------------------------------------------------------------
-- #36 Red Upgrader — on the floor-2 main belt (z = -15, near the collector end)
----------------------------------------------------------------------
function M.BuildRedUpgrader(G, plot)
	local mult, add = upStats("red_upgrader", 3, 0)
	G.ItemsCore.MakeUpgrader(G, plot, {
		cframe = plot:cf(29, 27, -15) * ROT_PLUS_X,
		mult = mult, add = add,
		colorName = "red",
		name = "red_upgrader",
	})
end

----------------------------------------------------------------------
-- Outside yard (x -75..-45, ground level)
-- Two standalone lines: dropper -> short feeder belt -> upgrader arch -> bin.
-- Line 1 (red)  at z = -12, line 2 (black) at z = 12. Feeders travel -X.
----------------------------------------------------------------------
local function buildOutsideLine(plot, folderName, z, accent)
	local m = G.Util.model(folderName, plot.itemsFolder)

	-- raised feeder belt x -48 -> -64, belt top ~ y 3, travel -X
	G.ItemsCore.MakeConveyor(G, m, plot:cf(-56, 2.5, z) * ROT_MINUS_X, 16, 6, 6, accent)

	-- belt legs
	for i = -62, -50, 6 do
		G.Util.part({
			Name = "FeederLeg", Parent = m, Size = Vector3.new(1, 2, 6),
			CFrame = plot:cf(i, 1, z), Color = "gray", Material = "Metal",
		})
	end
	-- pad under the bin so it looks planted
	G.Util.part({
		Name = "BinPad", Parent = m, Size = Vector3.new(8, 0.4, 10),
		CFrame = plot:cf(-66, 0.2, z), Color = accent, Neon = true,
	})

	G.ItemsCore.MakeCollector(G, plot, {
		cframe = plot:cf(-66.5, 3, z),
		size = Vector3.new(3, 6, 8),
	})
	return m
end

function M.BuildOutCollector1(G, plot)
	buildOutsideLine(plot, "OutsideLine1", -12, "red")
end

function M.BuildOutDropperRed(G, plot)
	local m = G.Util.model("OutDropperRed", plot.itemsFolder)
	local value, interval = dropStats("out_red", 400, 4)
	G.ItemsCore.MakeDropper(G, plot, {
		cframe = plot:cf(-49, 9, -12),
		colorName = "red",
		dropValue = value,
		interval = interval,
	})
	G.Util.part({
		Name = "DropperMast", Parent = m, Size = Vector3.new(1, 9, 1),
		CFrame = plot:cf(-45.5, 4.5, -12), Color = "darkred", Material = "Metal",
	})
end

function M.BuildOutRedUpgrader(G, plot)
	local mult, add = upStats("out_red_upgrader", 2, 0)
	G.ItemsCore.MakeUpgrader(G, plot, {
		cframe = plot:cf(-58, 3, -12) * ROT_MINUS_X,
		mult = mult, add = add,
		colorName = "red",
		name = "out_red_upgrader",
	})
end

function M.BuildOutCollector2(G, plot)
	buildOutsideLine(plot, "OutsideLine2", 12, "purple")
end

function M.BuildOutDropperBlack(G, plot)
	local m = G.Util.model("OutDropperBlack", plot.itemsFolder)
	local value, interval = dropStats("out_black", 900, 4)
	G.ItemsCore.MakeDropper(G, plot, {
		cframe = plot:cf(-49, 9, 12),
		colorName = "black",
		dropValue = value,
		interval = interval,
	})
	G.Util.part({
		Name = "DropperMast", Parent = m, Size = Vector3.new(1, 9, 1),
		CFrame = plot:cf(-45.5, 4.5, 12), Color = "black", Material = "Metal",
	})
end

function M.BuildOutBlackUpgrader(G, plot)
	local mult, add = upStats("out_black_upgrader", 2, 0)
	G.ItemsCore.MakeUpgrader(G, plot, {
		cframe = plot:cf(-58, 3, 12) * ROT_MINUS_X,
		mult = mult, add = add,
		colorName = "black",
		name = "out_black_upgrader",
	})
end

----------------------------------------------------------------------
-- #46 Rainbow Ladder — truss from floor 2 (y=24) up through a hole
-- to the rainbow floor (top y=48). Also builds the rainbow floor itself
-- (striped slabs) since the ladder has to lead somewhere glorious.
----------------------------------------------------------------------
function M.BuildRainbowLadder(G, plot)
	local m = G.Util.model("RainbowFloorAndLadder", plot.itemsFolder)

	-- rainbow floor: 8 stripes, each 80 x 2 x 10, top at y = 48 (center y 47)
	-- stripe k spans z in [-40 + 10*(k-1), -40 + 10*k]
	for k = 1, 8 do
		local zc = -40 + 10 * (k - 1) + 5
		if k < 8 then
			G.Util.part({
				Name = "RainbowStripe" .. k, Parent = m,
				Size = Vector3.new(80, 2, 10),
				CFrame = plot:cf(0, 47, zc),
				Color = RAINBOW[k], Material = "SmoothPlastic",
			})
		else
			-- last stripe (z 30..40) split around the ladder hole x -37..-31
			G.Util.part({
				Name = "RainbowStripe8a", Parent = m,
				Size = Vector3.new(3, 2, 10),
				CFrame = plot:cf(-38.5, 47, zc),
				Color = RAINBOW[k], Material = "SmoothPlastic",
			})
			G.Util.part({
				Name = "RainbowStripe8b", Parent = m,
				Size = Vector3.new(71, 2, 10),
				CFrame = plot:cf(4.5, 47, zc),
				Color = RAINBOW[k], Material = "SmoothPlastic",
			})
		end
	end

	-- climbable truss from floor-2 top (y 24) through the hole to above the rainbow floor
	local truss = Instance.new("TrussPart")
	truss.Name = "RainbowLadder"
	truss.Size = Vector3.new(2, 26, 2)
	truss.CFrame = plot:cf(RAINBOW_LADDER_X, 37, RAINBOW_LADDER_Z)
	truss.Anchored = true
	truss.BrickColor = BrickColor.new("Hot pink")
	truss.Material = Enum.Material.Metal
	truss.Parent = m

	-- hole rim glow so the opening is easy to spot from below
	G.Util.part({
		Name = "HoleRim", Parent = m, Size = Vector3.new(8, 0.4, 12),
		CFrame = plot:cf(RAINBOW_LADDER_X, 48.2, RAINBOW_LADDER_Z), Color = "pink",
		Neon = true, CanCollide = false, Transparency = 0.3,
	})
	local sign = G.Util.part({
		Name = "LadderSign", Parent = m, Size = Vector3.new(2.2, 0.4, 2.2),
		CFrame = plot:cf(RAINBOW_LADDER_X, 50.4, RAINBOW_LADDER_Z), Color = "white",
		Neon = true, CanCollide = false, Transparency = 1,
	})
	G.Util.label(sign, "CLIMB TO THE RAINBOW FLOOR!", { alwaysOnTop = true })
end

----------------------------------------------------------------------
-- #47 Rainbow Conveyor & Collector — belt top y=51 at z=-15, x -30..32, travel +X
----------------------------------------------------------------------
function M.BuildRainbowConveyor(G, plot)
	local m = G.Util.model("RainbowConveyor", plot.itemsFolder)

	G.ItemsCore.MakeConveyor(G, m, plot:cf(1, 50.5, -15) * ROT_PLUS_X, 62, 6, 8, "rainbow")

	-- rainbow racing-stripe trim along both sides of the belt
	for k = 1, 8 do
		local xc = -30 + (k - 1) * 8 + 4
		G.Util.part({
			Name = "TrimA" .. k, Parent = m, Size = Vector3.new(8, 0.4, 0.6),
			CFrame = plot:cf(xc, 51.2, -18.6), Color = RAINBOW[k], Neon = true, CanCollide = false,
		})
		G.Util.part({
			Name = "TrimB" .. k, Parent = m, Size = Vector3.new(8, 0.4, 0.6),
			CFrame = plot:cf(xc, 51.2, -11.4), Color = RAINBOW[9 - k], Neon = true, CanCollide = false,
		})
	end

	G.ItemsCore.MakeCollector(G, plot, {
		cframe = plot:cf(34.5, 51, -15),
		size = Vector3.new(3, 6, 8),
	})
end

----------------------------------------------------------------------
-- #48-50 Pink / Blue / White droppers over the rainbow belt
----------------------------------------------------------------------
local function buildRainbowDropper(plot, key, colorName, x, defV, defI)
	local m = G.Util.model("Dropper_" .. key, plot.itemsFolder)
	local value, interval = dropStats(key, defV, defI)
	G.ItemsCore.MakeDropper(G, plot, {
		cframe = plot:cf(x, 57, -15),
		colorName = colorName,
		dropValue = value,
		interval = interval,
	})
	G.Util.part({
		Name = "Gantry", Parent = m, Size = Vector3.new(0.8, 6, 0.8),
		CFrame = plot:cf(x, 54, -19), Color = colorName, Material = "Metal",
	})
	G.Util.part({
		Name = "GantryArm", Parent = m, Size = Vector3.new(0.8, 0.8, 5),
		CFrame = plot:cf(x, 56.8, -17), Color = colorName, Material = "Metal",
	})
end

function M.BuildDropperPink(G, plot)
	buildRainbowDropper(plot, "pink", "pink", -26, 4000, 3)
end

function M.BuildDropperBlue(G, plot)
	buildRainbowDropper(plot, "blue", "blue", -16, 7000, 3)
end

function M.BuildDropperWhite(G, plot)
	buildRainbowDropper(plot, "white", "white", -6, 12000, 3)
end

----------------------------------------------------------------------
-- #51 Gray Upgrader — arch on the rainbow belt
----------------------------------------------------------------------
function M.BuildGrayUpgrader(G, plot)
	local mult, add = upStats("gray_upgrader", 4, 0)
	G.ItemsCore.MakeUpgrader(G, plot, {
		cframe = plot:cf(14, 51, -15) * ROT_PLUS_X,
		mult = mult, add = add,
		colorName = "gray",
		name = "gray_upgrader",
	})
end

----------------------------------------------------------------------
-- #52 Rainbow-to-Black Walls — y 48..72, 6 bands per wall, rainbow
-- at the bottom fading to near-black at the top
----------------------------------------------------------------------
function M.BuildRainbowWalls(G, plot)
	local m = G.Util.model("RainbowWalls", plot.itemsFolder)
	local bands = { RAINBOW[1], RAINBOW[2], RAINBOW[3], RAINBOW[4], RAINBOW[6], RAINBOW[7] }
	local black = Color3.new(0, 0, 0)

	for i = 1, 6 do
		local col = bands[i]:Lerp(black, (i - 1) / 5 * 0.9)
		local y = 48 + (i - 1) * 4 + 2
		G.Util.part({
			Name = "WallW" .. i, Parent = m, Size = Vector3.new(1, 4, 80),
			CFrame = plot:cf(-39.5, y, 0), Color = col, Material = "SmoothPlastic",
		})
		G.Util.part({
			Name = "WallE" .. i, Parent = m, Size = Vector3.new(1, 4, 80),
			CFrame = plot:cf(39.5, y, 0), Color = col, Material = "SmoothPlastic",
		})
		G.Util.part({
			Name = "WallN" .. i, Parent = m, Size = Vector3.new(78, 4, 1),
			CFrame = plot:cf(0, y, 39.5), Color = col, Material = "SmoothPlastic",
		})
		G.Util.part({
			Name = "WallS" .. i, Parent = m, Size = Vector3.new(78, 4, 1),
			CFrame = plot:cf(0, y, -39.5), Color = col, Material = "SmoothPlastic",
		})
	end
end

----------------------------------------------------------------------
-- #53 Rainbow-to-Black Ladder — dark truss from rainbow floor (y=48) to y=72
----------------------------------------------------------------------
function M.BuildBlackLadder(G, plot)
	local m = G.Util.model("BlackLadder", plot.itemsFolder)

	local truss = Instance.new("TrussPart")
	truss.Name = "BlackLadder"
	truss.Size = Vector3.new(2, 26, 2)
	truss.CFrame = plot:cf(BLACK_LADDER_X, 61, BLACK_LADDER_Z)
	truss.Anchored = true
	truss.BrickColor = BrickColor.new("Really black")
	truss.Material = Enum.Material.DiamondPlate
	truss.Parent = m

	-- eerie purple glow strip so it's findable in the dark
	G.Util.part({
		Name = "LadderGlow", Parent = m, Size = Vector3.new(0.4, 26, 0.4),
		CFrame = plot:cf(BLACK_LADDER_X + 1.4, 61, BLACK_LADDER_Z), Color = "purple",
		Neon = true, CanCollide = false,
	})
	local sign = G.Util.part({
		Name = "LadderSign", Parent = m, Size = Vector3.new(2, 0.4, 2),
		CFrame = plot:cf(BLACK_LADDER_X, 52, BLACK_LADDER_Z - 3), Color = "white",
		Transparency = 1, CanCollide = false,
	})
	G.Util.label(sign, "UP TO THE BLACK FLOOR... IF YOU DARE", { alwaysOnTop = true })
end

----------------------------------------------------------------------
-- #54 Black Floor — 80x80 obsidian slab, top y=72, with the ladder hole
-- and a subtle purple speckle
----------------------------------------------------------------------
function M.BuildBlackFloor(G, plot)
	local m = G.Util.model("BlackFloor", plot.itemsFolder)

	-- slab pieces leaving a 6x10 hole at x 31..37, z 30..40 for the black ladder
	G.Util.part({
		Name = "BlackSlabMain", Parent = m, Size = Vector3.new(71, 2, 80),
		CFrame = plot:cf(-4.5, 71, 0), Color = "black", Material = "Slate",
	})
	G.Util.part({
		Name = "BlackSlabEdge", Parent = m, Size = Vector3.new(3, 2, 80),
		CFrame = plot:cf(38.5, 71, 0), Color = "black", Material = "Slate",
	})
	G.Util.part({
		Name = "BlackSlabSide", Parent = m, Size = Vector3.new(6, 2, 70),
		CFrame = plot:cf(34, 71, -5), Color = "black", Material = "Slate",
	})

	-- subtle purple speckles (kept clear of the ladder hole)
	for i = 1, 16 do
		local sx = math.random(-37, 28)
		local sz = math.random(-37, 37)
		G.Util.part({
			Name = "Speckle" .. i, Parent = m, Size = Vector3.new(1, 0.2, 1),
			CFrame = plot:cf(sx, 72.1, sz) * CFrame.Angles(0, math.random() * math.pi, 0),
			Color = Color3.fromRGB(110, 40, 170), Neon = true,
			CanCollide = false, Transparency = 0.35,
		})
	end
end

----------------------------------------------------------------------
-- #55 Lanterns — 4 glowing lanterns on poles at the black-floor corners.
-- Their PointLights are the ONLY light up here.
----------------------------------------------------------------------
function M.BuildLanterns(G, plot)
	local m = G.Util.model("Lanterns", plot.itemsFolder)
	local corners = { {-36, -36}, {-36, 36}, {36, -36}, {36, 36} }

	for i = 1, 4 do
		local x, z = corners[i][1], corners[i][2]
		G.Util.part({
			Name = "LanternPole" .. i, Parent = m, Size = Vector3.new(0.8, 7, 0.8),
			CFrame = plot:cf(x, 75.5, z), Color = "black", Material = "Metal",
		})
		local lantern = G.Util.part({
			Name = "Lantern" .. i, Parent = m, Size = Vector3.new(2, 2.6, 2),
			CFrame = plot:cf(x, 80, z), Color = "gold", Neon = true,
		})
		G.Util.part({
			Name = "LanternCap" .. i, Parent = m, Size = Vector3.new(2.6, 0.5, 2.6),
			CFrame = plot:cf(x, 81.5, z), Color = "black", Material = "Metal",
		})
		local light = Instance.new("PointLight")
		light.Color = Color3.fromRGB(255, 200, 110)
		light.Brightness = 3
		light.Range = 40
		light.Shadows = true
		light.Parent = lantern
	end
end

----------------------------------------------------------------------
-- #56 Pitch Black Walls & Roof — enclosing y 72..96 (ladder hole stays open)
----------------------------------------------------------------------
function M.BuildBlackWallsRoof(G, plot)
	local m = G.Util.model("BlackWallsRoof", plot.itemsFolder)

	G.Util.part({
		Name = "BWallW", Parent = m, Size = Vector3.new(1, 24, 80),
		CFrame = plot:cf(-39.5, 84, 0), Color = "black", Material = "Slate",
	})
	G.Util.part({
		Name = "BWallE", Parent = m, Size = Vector3.new(1, 24, 80),
		CFrame = plot:cf(39.5, 84, 0), Color = "black", Material = "Slate",
	})
	G.Util.part({
		Name = "BWallN", Parent = m, Size = Vector3.new(78, 24, 1),
		CFrame = plot:cf(0, 84, 39.5), Color = "black", Material = "Slate",
	})
	G.Util.part({
		Name = "BWallS", Parent = m, Size = Vector3.new(78, 24, 1),
		CFrame = plot:cf(0, 84, -39.5), Color = "black", Material = "Slate",
	})
	G.Util.part({
		Name = "BRoof", Parent = m, Size = Vector3.new(80, 2, 80),
		CFrame = plot:cf(0, 97, 0), Color = "black", Material = "Slate",
	})
	-- faint purple baseboards so the room reads as a room, not a void
	G.Util.part({
		Name = "TrimW", Parent = m, Size = Vector3.new(0.4, 0.6, 78),
		CFrame = plot:cf(-38.8, 72.4, 0), Color = "purple", Neon = true,
		CanCollide = false, Transparency = 0.5,
	})
	G.Util.part({
		Name = "TrimE", Parent = m, Size = Vector3.new(0.4, 0.6, 78),
		CFrame = plot:cf(38.8, 72.4, 0), Color = "purple", Neon = true,
		CanCollide = false, Transparency = 0.5,
	})
end

----------------------------------------------------------------------
-- #57 Portal Frame — ancient stone arch with runes + purple trim
----------------------------------------------------------------------
function M.BuildPortalFrame(G, plot)
	local m = G.Util.model("PortalFrame", plot.itemsFolder)
	-- arch stands at z = -10 on the black floor, opening faces +Z (toward the ladder)

	-- base step
	G.Util.part({
		Name = "PortalStep", Parent = m, Size = Vector3.new(22, 1, 8),
		CFrame = plot:cf(0, 72.5, -10), Color = "gray", Material = "Slate",
	})
	-- pillars
	G.Util.part({
		Name = "PillarL", Parent = m, Size = Vector3.new(3, 16, 3),
		CFrame = plot:cf(-7, 81, -10), Color = "gray", Material = "Slate",
	})
	G.Util.part({
		Name = "PillarR", Parent = m, Size = Vector3.new(3, 16, 3),
		CFrame = plot:cf(7, 81, -10), Color = "gray", Material = "Slate",
	})
	-- lintel across the top
	local lintel = G.Util.part({
		Name = "Lintel", Parent = m, Size = Vector3.new(19, 3, 3),
		CFrame = plot:cf(0, 90.5, -10), Color = "gray", Material = "Slate",
	})
	G.Util.surfaceText(lintel, "Front", "\\ V | X | O | I | X | V /", Color3.fromRGB(190, 120, 255), Color3.fromRGB(25, 15, 35))

	-- purple trim lines
	G.Util.part({
		Name = "TrimL", Parent = m, Size = Vector3.new(0.5, 16, 0.5),
		CFrame = plot:cf(-5.4, 81, -10), Color = "purple", Neon = true, CanCollide = false,
	})
	G.Util.part({
		Name = "TrimR", Parent = m, Size = Vector3.new(0.5, 16, 0.5),
		CFrame = plot:cf(5.4, 81, -10), Color = "purple", Neon = true, CanCollide = false,
	})
	G.Util.part({
		Name = "TrimTop", Parent = m, Size = Vector3.new(11, 0.5, 0.5),
		CFrame = plot:cf(0, 88.8, -10), Color = "purple", Neon = true, CanCollide = false,
	})

	-- glowing rune stones on the pillars
	local runeY = { 76, 80, 84 }
	for i = 1, 3 do
		for side = -1, 1, 2 do
			local rune = G.Util.part({
				Name = "Rune", Parent = m, Size = Vector3.new(0.9, 0.9, 0.6),
				CFrame = plot:cf(7 * side, runeY[i], -8.2) * CFrame.Angles(0, 0, math.pi / 4),
				Color = "purple", Neon = true, CanCollide = false,
			})
			local light = Instance.new("PointLight")
			light.Color = Color3.fromRGB(160, 70, 255)
			light.Brightness = 1.2
			light.Range = 8
			light.Parent = rune
		end
	end

	local sign = G.Util.part({
		Name = "FrameSign", Parent = m, Size = Vector3.new(2, 0.4, 2),
		CFrame = plot:cf(0, 93, -10), Color = "white", Transparency = 1, CanCollide = false,
	})
	G.Util.label(sign, "ANCIENT PORTAL FRAME", { alwaysOnTop = true })
end

----------------------------------------------------------------------
-- #58 Portal — swirling neon surface inside the frame; touch teleports
-- players whose OWN plot bought the portal to the Lab entrance
----------------------------------------------------------------------
function M.BuildPortal(G, plot)
	local m = G.Util.model("Portal", plot.itemsFolder)

	-- swirling surface filling the arch (between the pillars, under the lintel)
	local surface = G.Util.part({
		Name = "PortalSurface", Parent = m, Size = Vector3.new(11, 14, 1),
		CFrame = plot:cf(0, 81, -10),
		Color = "purple", Neon = true, CanCollide = false, Transparency = 0.25,
	})
	-- dark inner sheet for the black-hole look
	G.Util.part({
		Name = "PortalDark", Parent = m, Size = Vector3.new(8, 11, 0.4),
		CFrame = plot:cf(0, 81, -10),
		Color = "black", Neon = true, CanCollide = false, Transparency = 0.1,
	})

	-- swirl particles, purple fading to black
	local emitter = Instance.new("ParticleEmitter")
	emitter.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, Color3.fromRGB(190, 110, 255)),
		ColorSequenceKeypoint.new(0.5, Color3.fromRGB(110, 40, 200)),
		ColorSequenceKeypoint.new(1, Color3.fromRGB(10, 5, 20)),
	})
	emitter.Size = NumberSequence.new(1.2)
	emitter.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.2),
		NumberSequenceKeypoint.new(1, 1),
	})
	emitter.Lifetime = NumberRange.new(1, 2)
	emitter.Rate = 30
	emitter.Speed = NumberRange.new(1, 3)
	emitter.RotSpeed = NumberRange.new(-180, 180)
	emitter.SpreadAngle = Vector2.new(180, 180)
	emitter.LightEmission = 0.8
	emitter.Parent = surface

	local light = Instance.new("PointLight")
	light.Color = Color3.fromRGB(160, 70, 255)
	light.Brightness = 4
	light.Range = 25
	light.Parent = surface

	local sign = G.Util.part({
		Name = "PortalSign", Parent = m, Size = Vector3.new(2, 0.4, 2),
		CFrame = plot:cf(0, 89.5, -8), Color = "white", Transparency = 1, CanCollide = false,
	})
	G.Util.label(sign, "STEP THROUGH... THE LAB AWAITS", { alwaysOnTop = true })

	-- touch: anyone whose OWN plot purchased the portal gets teleported to the lab
	G.Util.touchOnce(surface, 2, function(player, character)
		local theirPlot = G.PlotManager.GetPlotOf(player)
		if not (theirPlot and theirPlot.purchased and theirPlot.purchased.portal) then
			return
		end
		-- lab entrance at (0, 500, 1400), facing the lab (which is centered at z 1500)
		character:PivotTo(CFrame.new(Vector3.new(0, 503, 1400), Vector3.new(0, 503, 1500)))
		G.Remotes.LabFog:FireClient(player, true)
	end)
end

return M
