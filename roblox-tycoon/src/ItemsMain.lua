-- ItemsMain.lua
-- Boss Tycoon: purchase chain entries 1-24 (BuildGreenFloor .. BuildWalls2).
-- Floor-1 conveyor: along local X at z = -15, x -30 -> +32, belt top y = 3, drops travel +X,
-- collector at x ~ 34.  Floor-2 conveyor: same line at y = 27 (floor-2 slab top y = 24).
-- All geometry through G.Util.part + plot:cf, parented under plot.itemsFolder.
-- Plain Lua 5.1 syntax only.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local M = {}

function M.Init(G)
	M.G = G
end

----------------------------------------------------------------------
-- constants (contract geometry)
----------------------------------------------------------------------

local BELT_Z = -15          -- conveyor line, plot-local z
local BELT1_TOP = 3         -- floor-1 belt top surface y
local BELT2_TOP = 27        -- floor-2 belt top surface y
local FLOOR1_TOP = 1        -- green floor slab top
local FLOOR2_TOP = 24       -- 2nd floor slab top
local BELT_SPEED = 8        -- base conveyor speed (studs/s), doubled by speedy_conveyor
local BELT_LEN = 63         -- covers x -30.5 .. 32.5
local BELT_CX = 1           -- belt center x
local COLLECT_X = 34.5      -- collector position
local WALL_T = 1.5          -- base wall thickness

-- rotation that points a CFrame's LookVector down plot-local +X (belt travel direction)
local ROT_PLUSX = CFrame.Angles(0, -math.pi / 2, 0)
-- LookVector down plot-local -X (collector faces the incoming drops)
local ROT_MINUSX = CFrame.Angles(0, math.pi / 2, 0)

----------------------------------------------------------------------
-- tiny shared spinner (one Heartbeat connection for all cool-collector rings)
----------------------------------------------------------------------

local spinReg = {}
local spinConn = nil
local spinT = 0

local function registerSpin(part, baseCF, speed, postCF)
	table.insert(spinReg, { part = part, base = baseCF, speed = speed, post = postCF or CFrame.new() })
	if not spinConn then
		spinConn = RunService.Heartbeat:Connect(function(dt)
			spinT = spinT + dt
			for i = #spinReg, 1, -1 do
				local e = spinReg[i]
				if e.part and e.part.Parent then
					e.part.CFrame = e.base * CFrame.Angles(0, spinT * e.speed, 0) * e.post
				else
					table.remove(spinReg, i)
				end
			end
		end)
	end
end

----------------------------------------------------------------------
-- balance lookups with safe fallbacks
----------------------------------------------------------------------

local function dropStats(G, key, fallbackValue, fallbackInterval)
	local d = G.Balance and G.Balance.Drops and G.Balance.Drops[key]
	if d then
		return d.value or fallbackValue, d.interval or fallbackInterval
	end
	return fallbackValue, fallbackInterval
end

local function upStats(G, id, fallbackMult, fallbackAdd)
	local u = G.Balance and G.Balance.Ups and G.Balance.Ups[id]
	if u then
		return u.mult or fallbackMult, u.add or fallbackAdd
	end
	return fallbackMult, fallbackAdd
end

----------------------------------------------------------------------
-- small builders
----------------------------------------------------------------------

local function makeSign(G, parent, cframe, text, colorName)
	local s = G.Util.part({
		Name = "Sign", Size = Vector3.new(1.4, 1.4, 1.4), CFrame = cframe,
		Color = colorName or "white", Neon = true, CanCollide = false, Parent = parent,
	})
	G.Util.label(s, text)
	return s
end

-- decorative dropper rig (tank behind the belt + feed pipe + sign) and the
-- functional ItemsCore dropper over the belt.
local function buildDropperRig(G, plot, cfg)
	local Util = G.Util
	local m = Util.model(cfg.name, plot.itemsFolder)
	local dropY = cfg.beltTop + 5

	-- storage tank behind the belt (vertical cylinder)
	Util.part({
		Name = "Tank", Shape = "Cylinder", Size = Vector3.new(7, 4.5, 4.5),
		CFrame = plot:cf(cfg.x, cfg.floorTop + 3.5, BELT_Z - 5) * CFrame.Angles(0, 0, math.pi / 2),
		Color = cfg.color, Material = "Metal", Parent = m,
	})
	Util.part({ -- glowing band around the tank
		Name = "TankBand", Shape = "Cylinder", Size = Vector3.new(1, 4.9, 4.9),
		CFrame = plot:cf(cfg.x, cfg.floorTop + 3.5, BELT_Z - 5) * CFrame.Angles(0, 0, math.pi / 2),
		Color = cfg.color, Neon = true, CanCollide = false, Parent = m,
	})
	Util.part({ -- feed pipe from tank to above the belt
		Name = "Pipe", Size = Vector3.new(1, 1, 6.2),
		CFrame = plot:cf(cfg.x, dropY + 2.4, BELT_Z - 2.6),
		Color = "gray", Material = "Metal", Parent = m,
	})
	Util.part({ -- pipe elbow down toward the spout
		Name = "PipeDown", Size = Vector3.new(1, 1.8, 1),
		CFrame = plot:cf(cfg.x, dropY + 1.4, BELT_Z),
		Color = "gray", Material = "Metal", CanCollide = false, Parent = m,
	})
	makeSign(G, m, plot:cf(cfg.x, cfg.floorTop + 7.6, BELT_Z - 5), cfg.label, cfg.color)

	local value, interval = dropStats(G, cfg.key, cfg.defValue, cfg.defInterval)
	G.ItemsCore.MakeDropper(G, plot, {
		cframe = plot:cf(cfg.x, dropY, BELT_Z) * ROT_PLUSX,
		colorName = cfg.color,
		dropValue = value,
		interval = interval,
		manual = cfg.manual,
	})
end

-- decorative pedestals + sign around an ItemsCore upgrader arch
local function buildUpgraderRig(G, plot, cfg)
	local Util = G.Util
	local m = Util.model(cfg.id, plot.itemsFolder)
	local floorTop = cfg.beltTop - 2
	for _, s in ipairs({ -1, 1 }) do
		Util.part({
			Name = "Pedestal", Size = Vector3.new(1.6, 2.4, 1.6),
			CFrame = plot:cf(cfg.x, floorTop + 1.2, BELT_Z + s * 3.8),
			Color = "gray", Material = "Metal", Parent = m,
		})
		Util.part({
			Name = "PedestalGem", Shape = "Ball", Size = Vector3.new(1.2, 1.2, 1.2),
			CFrame = plot:cf(cfg.x, floorTop + 3, BELT_Z + s * 3.8),
			Color = cfg.color, Neon = true, CanCollide = false, Parent = m,
		})
	end
	makeSign(G, m, plot:cf(cfg.x, cfg.beltTop + 6.5, BELT_Z), cfg.label, cfg.color)

	local mult, add = upStats(G, cfg.id, cfg.defMult, cfg.defAdd)
	G.ItemsCore.MakeUpgrader(G, plot, {
		cframe = plot:cf(cfg.x, cfg.beltTop, BELT_Z) * ROT_PLUSX,
		mult = mult, add = add, colorName = cfg.color, name = cfg.id,
	})
	return m, mult
end

-- remember belts so speedy_conveyor can double them later
local function rememberBelt(plot, beltResult)
	plot.mainBelts = plot.mainBelts or {}
	for i = #plot.mainBelts, 1, -1 do
		local e = plot.mainBelts[i]
		if not (e.part and e.part.Parent) then
			table.remove(plot.mainBelts, i)
		end
	end
	if typeof(beltResult) == "Instance" then
		if beltResult:IsA("BasePart") then
			table.insert(plot.mainBelts, { part = beltResult, speed = BELT_SPEED })
		elseif beltResult:IsA("Model") then
			for _, d in ipairs(beltResult:GetDescendants()) do
				if d:IsA("BasePart") and d.AssemblyLinearVelocity.Magnitude > 0.1 then
					table.insert(plot.mainBelts, { part = d, speed = BELT_SPEED })
				end
			end
		end
	end
end

-- one conveyor line (belt + legs); shared by floors 1 and 2
local function buildBeltLine(G, plot, parent, beltTop, floorTop, colorName)
	local Util = G.Util
	local beltCF = plot:cf(BELT_CX, beltTop - 0.5, BELT_Z) * ROT_PLUSX
	local belt = G.ItemsCore.MakeConveyor(G, parent, beltCF, BELT_LEN, 4, BELT_SPEED, colorName)
	rememberBelt(plot, belt)

	-- support legs
	local legH = (beltTop - 1) - floorTop
	if legH < 0.6 then
		legH = 0.6
	end
	for _, lx in ipairs({ -26, 1, 28 }) do
		for _, s in ipairs({ -1, 1 }) do
			Util.part({
				Name = "BeltLeg", Size = Vector3.new(1.1, legH, 1.1),
				CFrame = plot:cf(lx, floorTop + legH / 2, BELT_Z + s * 1.6),
				Color = "black", Material = "Metal", Parent = parent,
			})
		end
	end
	return belt
end

-- collector at the +X end of a belt line
local function buildLineCollector(G, plot, parent, beltTop)
	local Util = G.Util
	G.ItemsCore.MakeCollector(G, plot, {
		cframe = plot:cf(COLLECT_X, beltTop + 2, BELT_Z) * ROT_MINUSX,
		size = Vector3.new(3, 6, 9),
	})
	-- gold guide rails funnelling drops into the bin
	for _, s in ipairs({ -1, 1 }) do
		Util.part({
			Name = "GuideRail", Size = Vector3.new(3.5, 1.6, 0.6),
			CFrame = plot:cf(31, beltTop + 0.8, BELT_Z + s * 2.5) * CFrame.Angles(0, s * 0.25, 0),
			Color = "gold", Material = "Metal", Parent = parent,
		})
	end
	makeSign(G, parent, plot:cf(COLLECT_X, beltTop + 6.5, BELT_Z), "COLLECTOR  ->  $$$", "green")
	-- rebuild-on-reclaim styling is handled inside ItemsCore.MakeCollector,
	-- which re-applies plot.collectorStyle to every new bin automatically.
end

----------------------------------------------------------------------
-- 1. green_floor
----------------------------------------------------------------------

function M.BuildGreenFloor(G, plot)
	local Util = G.Util
	local m = Util.model("GreenFloor", plot.itemsFolder)
	Util.part({
		Name = "GreenFloor", Size = Vector3.new(80, 1, 80),
		CFrame = plot:cf(0, 0.5, 0), Color = "green", Material = "Grass", Parent = m,
	})
	-- dark green edge trim
	Util.part({ Name = "TrimF", Size = Vector3.new(80, 0.35, 1.4), CFrame = plot:cf(0, 1.1, -39.3), Color = "darkgreen", Parent = m })
	Util.part({ Name = "TrimB", Size = Vector3.new(80, 0.35, 1.4), CFrame = plot:cf(0, 1.1, 39.3), Color = "darkgreen", Parent = m })
	Util.part({ Name = "TrimL", Size = Vector3.new(1.4, 0.35, 80), CFrame = plot:cf(-39.3, 1.1, 0), Color = "darkgreen", Parent = m })
	Util.part({ Name = "TrimR", Size = Vector3.new(1.4, 0.35, 80), CFrame = plot:cf(39.3, 1.1, 0), Color = "darkgreen", Parent = m })
	-- glowing corner studs
	for _, sx in ipairs({ -1, 1 }) do
		for _, sz in ipairs({ -1, 1 }) do
			Util.part({
				Name = "CornerStud", Size = Vector3.new(1.8, 0.7, 1.8),
				CFrame = plot:cf(sx * 37.5, 1.35, sz * 37.5),
				Color = "green", Neon = true, Parent = m,
			})
		end
	end
	-- gold welcome path from the front edge toward the conveyor line
	Util.part({
		Name = "GoldPath", Size = Vector3.new(3.6, 0.14, 22),
		CFrame = plot:cf(0, 1.06, -28), Color = "gold", Material = "Metal", Parent = m,
	})
end

----------------------------------------------------------------------
-- 2. conveyor1 (belt + the floor-1 collector)
----------------------------------------------------------------------

function M.BuildConveyor1(G, plot)
	local m = G.Util.model("Conveyor1", plot.itemsFolder)
	buildBeltLine(G, plot, m, BELT1_TOP, FLOOR1_TOP, "gray")
	buildLineCollector(G, plot, m, BELT1_TOP)
end

----------------------------------------------------------------------
-- 3-5. green droppers (floor 1)
----------------------------------------------------------------------

function M.BuildManualDropperG(G, plot)
	buildDropperRig(G, plot, {
		name = "ManualDropperG", label = "MANUAL DROPPER - CLICK ME!",
		x = -27, floorTop = FLOOR1_TOP, beltTop = BELT1_TOP,
		color = "green", key = "manual_g", manual = true,
		defValue = 5, defInterval = 1,
	})
end

function M.BuildAutoDropperG1(G, plot)
	buildDropperRig(G, plot, {
		name = "AutoDropperG1", label = "AUTO GREEN DROPPER",
		x = -21, floorTop = FLOOR1_TOP, beltTop = BELT1_TOP,
		color = "green", key = "auto_g", manual = false,
		defValue = 8, defInterval = 2.5,
	})
end

function M.BuildAutoDropperG2(G, plot)
	buildDropperRig(G, plot, {
		name = "AutoDropperG2", label = "AUTO GREEN DROPPER 2",
		x = -15, floorTop = FLOOR1_TOP, beltTop = BELT1_TOP,
		color = "darkgreen", key = "auto_g", manual = false,
		defValue = 8, defInterval = 2.5,
	})
end

----------------------------------------------------------------------
-- 6-7, 9, 13. floor-1 upgrader arches (spread along the belt, no overlaps)
----------------------------------------------------------------------

function M.BuildUpgrader1(G, plot)
	buildUpgraderRig(G, plot, {
		id = "upgrader1", label = "UPGRADER", x = -6, beltTop = BELT1_TOP,
		color = "white", defMult = 1.5, defAdd = 2,
	})
end

function M.BuildGreenUpgrader(G, plot)
	buildUpgraderRig(G, plot, {
		id = "green_upgrader", label = "GREEN UPGRADER", x = 2, beltTop = BELT1_TOP,
		color = "green", defMult = 1.6, defAdd = 0,
	})
end

function M.BuildSpeedyUpgrader(G, plot)
	local m = buildUpgraderRig(G, plot, {
		id = "speedy_upgrader", label = "SPEEDY UPGRADER - ZOOM!", x = 10, beltTop = BELT1_TOP,
		color = "cyan", defMult = 1.8, defAdd = 0,
	})
	-- invisible boost zone right after the arch: flings drops down the belt
	local beam = G.Util.part({
		Name = "SpeedZone", Size = Vector3.new(4, 3.5, 4.4),
		CFrame = plot:cf(13, BELT1_TOP + 1.8, BELT_Z),
		Transparency = 1, CanCollide = false, Parent = m,
	})
	beam.Touched:Connect(function(hit)
		if hit and hit.Parent and hit:FindFirstChild("Cash") and not hit:GetAttribute("SpeedBoosted") then
			hit:SetAttribute("SpeedBoosted", true)
			hit.AssemblyLinearVelocity = plot.origin:VectorToWorldSpace(Vector3.new(28, 3, 0))
		end
	end)
end

function M.BuildYellowUpgrader1(G, plot)
	buildUpgraderRig(G, plot, {
		id = "yellow_upgrader1", label = "YELLOW UPGRADER", x = 20, beltTop = BELT1_TOP,
		color = "yellow", defMult = 1.7, defAdd = 5,
	})
end

----------------------------------------------------------------------
-- 8. cool_collector — restyles every registered collector
----------------------------------------------------------------------

function M.BuildCoolCollector(G, plot)
	-- ItemsCore owns the collector entry shape ({model, body, level}) and the
	-- restyle logic; level 1 = "cool" (neon body + spinning ring + particles).
	G.ItemsCore.RestyleCollectors(plot, 1)
end

----------------------------------------------------------------------
-- 10 / 23. conveyor walls (glass rails so drops never fall off)
----------------------------------------------------------------------

local function buildConveyorWalls(G, plot, name, beltTop, trimColor)
	local Util = G.Util
	local m = Util.model(name, plot.itemsFolder)
	for _, s in ipairs({ -1, 1 }) do
		local z = BELT_Z + s * 2.85
		Util.part({
			Name = "Rail", Size = Vector3.new(66, 3.6, 0.7),
			CFrame = plot:cf(BELT_CX, beltTop + 1.3, z),
			Color = "lightblue", Material = "Glass", Transparency = 0.45, Parent = m,
		})
		Util.part({
			Name = "RailTrim", Size = Vector3.new(66, 0.4, 0.8),
			CFrame = plot:cf(BELT_CX, beltTop + 3.3, z),
			Color = trimColor, Neon = true, CanCollide = false, Parent = m,
		})
		for _, ex in ipairs({ -31.8, 33.8 }) do
			Util.part({
				Name = "RailPost", Size = Vector3.new(0.9, 4.4, 0.9),
				CFrame = plot:cf(ex, beltTop + 1.2, z),
				Color = "black", Material = "Metal", Parent = m,
			})
		end
	end
end

function M.BuildConveyorWalls1(G, plot)
	buildConveyorWalls(G, plot, "ConveyorWalls1", BELT1_TOP, "green")
end

function M.BuildConveyorWalls2(G, plot)
	buildConveyorWalls(G, plot, "ConveyorWalls2", BELT2_TOP, "yellow")
end

----------------------------------------------------------------------
-- 11. base_walls — floor-1 perimeter with glass window bands + front door gap
----------------------------------------------------------------------

function M.BuildBaseWalls(G, plot)
	local Util = G.Util
	local m = Util.model("BaseWalls", plot.itemsFolder)

	-- side walls (+X / -X): solid band, glass band with pillars, solid top band
	for _, sx in ipairs({ -1, 1 }) do
		local x = sx * 39.25
		Util.part({ Name = "SideLower", Size = Vector3.new(WALL_T, 8, 77), CFrame = plot:cf(x, 5, 0), Color = "white", Material = "Concrete", Parent = m })
		Util.part({ Name = "SideGlass", Size = Vector3.new(WALL_T, 8, 77), CFrame = plot:cf(x, 13, 0), Color = "lightblue", Material = "Glass", Transparency = 0.45, Parent = m })
		for _, pz in ipairs({ -19.25, 0, 19.25 }) do
			Util.part({ Name = "SidePillar", Size = Vector3.new(WALL_T + 0.4, 8, 3.2), CFrame = plot:cf(x, 13, pz), Color = "gray", Material = "Concrete", Parent = m })
		end
		Util.part({ Name = "SideUpper", Size = Vector3.new(WALL_T, 7, 77), CFrame = plot:cf(x, 20.5, 0), Color = "white", Material = "Concrete", Parent = m })
	end

	-- back wall (+Z)
	Util.part({ Name = "BackLower", Size = Vector3.new(80, 8, WALL_T), CFrame = plot:cf(0, 5, 39.25), Color = "white", Material = "Concrete", Parent = m })
	Util.part({ Name = "BackGlass", Size = Vector3.new(80, 8, WALL_T), CFrame = plot:cf(0, 13, 39.25), Color = "lightblue", Material = "Glass", Transparency = 0.45, Parent = m })
	for _, px in ipairs({ -20, 0, 20 }) do
		Util.part({ Name = "BackPillar", Size = Vector3.new(3.2, 8, WALL_T + 0.4), CFrame = plot:cf(px, 13, 39.25), Color = "gray", Material = "Concrete", Parent = m })
	end
	Util.part({ Name = "BackUpper", Size = Vector3.new(80, 7, WALL_T), CFrame = plot:cf(0, 20.5, 39.25), Color = "white", Material = "Concrete", Parent = m })

	-- front wall (-Z) with a door gap x in [-7, 7], height up to y = 13
	for _, sx in ipairs({ -1, 1 }) do
		local cx = sx * 23.5
		Util.part({ Name = "FrontLower", Size = Vector3.new(33, 8, WALL_T), CFrame = plot:cf(cx, 5, -39.25), Color = "white", Material = "Concrete", Parent = m })
		Util.part({ Name = "FrontGlass", Size = Vector3.new(33, 8, WALL_T), CFrame = plot:cf(cx, 13, -39.25), Color = "lightblue", Material = "Glass", Transparency = 0.45, Parent = m })
		for _, px in ipairs({ sx * 16, sx * 31 }) do
			Util.part({ Name = "FrontPillar", Size = Vector3.new(3.2, 8, WALL_T + 0.4), CFrame = plot:cf(px, 13, -39.25), Color = "gray", Material = "Concrete", Parent = m })
		end
	end
	Util.part({ Name = "DoorHeader", Size = Vector3.new(14, 4, WALL_T), CFrame = plot:cf(0, 15, -39.25), Color = "white", Material = "Concrete", Parent = m })
	Util.part({ Name = "FrontUpper", Size = Vector3.new(80, 7, WALL_T), CFrame = plot:cf(0, 20.5, -39.25), Color = "white", Material = "Concrete", Parent = m })

	-- gold door frame
	for _, sx in ipairs({ -1, 1 }) do
		Util.part({ Name = "DoorFrame", Size = Vector3.new(1.4, 12, 2.2), CFrame = plot:cf(sx * 7.7, 7, -39.25), Color = "gold", Neon = true, Parent = m })
	end
	Util.part({ Name = "DoorFrameTop", Size = Vector3.new(16.8, 1.4, 2.2), CFrame = plot:cf(0, 13.6, -39.25), Color = "gold", Neon = true, Parent = m })

	-- dark green corner pillars with gold caps
	for _, sx in ipairs({ -1, 1 }) do
		for _, sz in ipairs({ -1, 1 }) do
			Util.part({ Name = "Corner", Size = Vector3.new(2.6, 23, 2.6), CFrame = plot:cf(sx * 39, 12.5, sz * 39), Color = "darkgreen", Material = "Concrete", Parent = m })
			Util.part({ Name = "CornerCap", Size = Vector3.new(3.2, 1, 3.2), CFrame = plot:cf(sx * 39, 24.5, sz * 39), Color = "gold", Neon = true, Parent = m })
		end
	end

	-- HQ sign over the door
	local hq = Util.part({ Name = "HQSign", Size = Vector3.new(10, 2.4, 0.6), CFrame = plot:cf(0, 16.6, -40.3), Color = "darkgreen", Parent = m })
	G.Util.surfaceText(hq, "Front", "BOSS TYCOON HQ", Color3.fromRGB(255, 230, 90), Color3.fromRGB(20, 60, 25))
end

----------------------------------------------------------------------
-- 12. owner_door — walk-through neon door + Heartbeat pushback for non-owners
----------------------------------------------------------------------

function M.BuildOwnerDoor(G, plot)
	local Util = G.Util
	local m = Util.model("OwnerDoor", plot.itemsFolder)

	local door = Util.part({
		Name = "OwnerDoor", Size = Vector3.new(13.8, 11.6, 0.9),
		CFrame = plot:cf(0, 6.9, -39.25),
		Color = "green", Neon = true, Transparency = 0.55, CanCollide = false, Parent = m,
	})
	door:SetAttribute("Locked", false)
	Util.label(door, "OWNER DOOR")

	local light = Instance.new("PointLight")
	light.Range = 14
	light.Brightness = 1.5
	light.Color = Color3.fromRGB(80, 255, 120)
	light.Parent = door

	-- lever
	Util.part({
		Name = "LeverBase", Size = Vector3.new(1.3, 3.6, 1.3),
		CFrame = plot:cf(10.5, 2.8, -36.5), Color = "gray", Material = "Metal", Parent = m,
	})
	local handle = Util.part({
		Name = "LeverHandle", Size = Vector3.new(0.7, 2.4, 0.7),
		CFrame = plot:cf(10.5, 5.4, -36.5) * CFrame.Angles(0.35, 0, 0),
		Color = "red", Neon = true, Parent = m,
	})
	makeSign(G, m, plot:cf(10.5, 8, -36.5), "DOOR LEVER (owner only)", "white")

	local function refresh()
		if door:GetAttribute("Locked") then
			door.Color = Color3.fromRGB(255, 60, 60)
			door.Transparency = 0.35
			light.Color = Color3.fromRGB(255, 60, 60)
		else
			door.Color = Color3.fromRGB(80, 255, 120)
			door.Transparency = 0.6
			light.Color = Color3.fromRGB(80, 255, 120)
		end
	end
	refresh()

	local cd = Instance.new("ClickDetector")
	cd.MaxActivationDistance = 24
	cd.Parent = handle
	cd.MouseClick:Connect(function(player)
		if player == plot.owner and door.Parent then
			door:SetAttribute("Locked", not door:GetAttribute("Locked"))
			refresh()
			local msg = "Owner door UNLOCKED"
			if door:GetAttribute("Locked") then
				msg = "Owner door LOCKED - intruders get pushed out!"
			end
			local notify = G.Remotes and G.Remotes:FindFirstChild("Notify")
			if notify then
				notify:FireClient(player, msg, "yellow")
			end
		end
	end)

	-- pushback loop: when locked, teleport any non-owner inside the doorway box back 6 studs
	local conn
	conn = RunService.Heartbeat:Connect(function()
		if not door.Parent then
			conn:Disconnect()
			return
		end
		if not door:GetAttribute("Locked") then
			return
		end
		for _, pl in ipairs(Players:GetPlayers()) do
			if pl ~= plot.owner then
				local ch = pl.Character
				local hrp = ch and ch:FindFirstChild("HumanoidRootPart")
				if hrp then
					local rel = plot.origin:PointToObjectSpace(hrp.Position)
					if math.abs(rel.X) < 9 and rel.Y > -2 and rel.Y < 15 and math.abs(rel.Z + 39.25) < 3.2 then
						local newZ = -33
						if rel.Z <= -39.25 then
							newZ = -46
						end
						local target = plot.origin * Vector3.new(rel.X, math.max(rel.Y, 4), newZ)
						hrp.CFrame = CFrame.new(target) * hrp.CFrame.Rotation
					end
				end
			end
		end
	end)
end

----------------------------------------------------------------------
-- 14. spiral_stairs — climbable spiral up to floor 2, in the +X/+Z corner
----------------------------------------------------------------------

function M.BuildSpiralStairs(G, plot)
	local Util = G.Util
	local m = Util.model("SpiralStairs", plot.itemsFolder)
	local cx, cz = 28, 28
	local radius = 8
	local steps = 20
	local rise = 1.2                       -- 20 * 1.2 = 24 = floor-2 top
	local da = math.rad(31.5)
	local a0 = math.rad(45) - steps * da   -- last step lands at 45 deg (toward the corner)

	for i = 1, steps do
		local ang = a0 + i * da
		local x = cx + math.cos(ang) * radius
		local z = cz + math.sin(ang) * radius
		local topY = i * rise
		local color = "green"
		if i % 2 == 0 then
			color = "darkgreen"
		end
		-- tread
		Util.part({
			Name = "Step" .. i, Size = Vector3.new(6.5, rise, 4.6),
			CFrame = plot:cf(x, topY - rise / 2, z) * CFrame.Angles(0, -ang, 0),
			Color = color, Parent = m,
		})
		-- wedge nosing on the back half, ramping toward the next step
		local ascX, ascZ = -math.sin(ang), math.cos(ang)
		Util.part({
			Name = "StepWedge" .. i, Shape = "Wedge", Size = Vector3.new(6.5, 0.5, 2),
			CFrame = plot:cf(x + ascX * 1.3, topY + 0.25, z + ascZ * 1.3) * CFrame.Angles(0, -ang, 0),
			Color = "green", Neon = (i % 5 == 0), CanCollide = false, Parent = m,
		})
		-- outer railing post + glowing ball every 4th step
		if i % 4 == 0 then
			local rx = cx + math.cos(ang) * 10.8
			local rz = cz + math.sin(ang) * 10.8
			Util.part({
				Name = "RailPost" .. i, Size = Vector3.new(0.7, 3, 0.7),
				CFrame = plot:cf(rx, topY + 1.5, rz), Color = "darkgreen", Parent = m,
			})
			Util.part({
				Name = "RailBall" .. i, Shape = "Ball", Size = Vector3.new(1.1, 1.1, 1.1),
				CFrame = plot:cf(rx, topY + 3.3, rz), Color = "gold", Neon = true, CanCollide = false, Parent = m,
			})
		end
	end

	-- center pole with a gold cap
	Util.part({
		Name = "CenterPole", Shape = "Cylinder", Size = Vector3.new(26, 2.6, 2.6),
		CFrame = plot:cf(cx, 13, cz) * CFrame.Angles(0, 0, math.pi / 2),
		Color = "darkgreen", Material = "Metal", Parent = m,
	})
	Util.part({
		Name = "PoleCap", Shape = "Ball", Size = Vector3.new(2.2, 2.2, 2.2),
		CFrame = plot:cf(cx, 26.6, cz), Color = "gold", Neon = true, CanCollide = false, Parent = m,
	})
	makeSign(G, m, plot:cf(17, 4.5, 30), "SPIRAL STAIRS - up to Floor 2!", "green")
end

----------------------------------------------------------------------
-- 15. floor2 — slab at y = 24 with a hole where the stairs arrive
----------------------------------------------------------------------

function M.BuildFloor2(G, plot)
	local Util = G.Util
	local m = Util.model("Floor2", plot.itemsFolder)
	-- big slab, minus the stair hole at x in [20, 38.5], z in [20, 38.5]
	Util.part({
		Name = "SlabA", Size = Vector3.new(77, 2, 58.5),
		CFrame = plot:cf(0, 23, -9.25), Color = "gray", Material = "Concrete", Parent = m,
	})
	Util.part({
		Name = "SlabB", Size = Vector3.new(58.5, 2, 18.5),
		CFrame = plot:cf(-9.25, 23, 29.25), Color = "gray", Material = "Concrete", Parent = m,
	})
	-- small landing pad in the hole corner where the top step arrives
	Util.part({
		Name = "StairLanding", Size = Vector3.new(7, 2, 7),
		CFrame = plot:cf(35, 23, 35), Color = "yellow", Material = "Concrete", Parent = m,
	})
	-- glowing safety trim around the stair hole
	Util.part({
		Name = "HoleTrimZ", Size = Vector3.new(19, 0.5, 0.9),
		CFrame = plot:cf(29.25, 24.2, 20.4), Color = "yellow", Neon = true, Parent = m,
	})
	Util.part({
		Name = "HoleTrimX", Size = Vector3.new(0.9, 0.5, 19),
		CFrame = plot:cf(20.4, 24.2, 29.25), Color = "yellow", Neon = true, Parent = m,
	})
	-- gold edge trim on the new floor
	Util.part({ Name = "EdgeF", Size = Vector3.new(77, 0.4, 1), CFrame = plot:cf(0, 24.15, -38), Color = "gold", Parent = m })
	Util.part({ Name = "EdgeB", Size = Vector3.new(58, 0.4, 1), CFrame = plot:cf(-9.5, 24.15, 38), Color = "gold", Parent = m })
	Util.part({ Name = "EdgeL", Size = Vector3.new(1, 0.4, 76), CFrame = plot:cf(-38, 24.15, 0), Color = "gold", Parent = m })
	-- ceiling lights for floor 1 (under the slab)
	for _, p in ipairs({ { 18, -18 }, { -18, -18 }, { -18, 18 } }) do
		Util.part({
			Name = "CeilLight", Size = Vector3.new(2.2, 0.3, 2.2),
			CFrame = plot:cf(p[1], 21.85, p[2]), Color = "white", Neon = true, CanCollide = false, Parent = m,
		})
	end
	makeSign(G, m, plot:cf(0, 28, 0), "FLOOR 2 - yellow zone!", "yellow")
end

----------------------------------------------------------------------
-- 16. conveyor2 — floor-2 belt + collector on the same line at y = 27
----------------------------------------------------------------------

function M.BuildConveyor2(G, plot)
	local m = G.Util.model("Conveyor2", plot.itemsFolder)
	buildBeltLine(G, plot, m, BELT2_TOP, FLOOR2_TOP, "yellow")
	buildLineCollector(G, plot, m, BELT2_TOP)
end

----------------------------------------------------------------------
-- 18-20. yellow droppers (floor 2)
----------------------------------------------------------------------

function M.BuildManualDropperY(G, plot)
	buildDropperRig(G, plot, {
		name = "ManualDropperY", label = "YELLOW MANUAL DROPPER - CLICK!",
		x = -27, floorTop = FLOOR2_TOP, beltTop = BELT2_TOP,
		color = "yellow", key = "yellow_manual", manual = true,
		defValue = 40, defInterval = 1,
	})
end

function M.BuildDropperY1(G, plot)
	buildDropperRig(G, plot, {
		name = "DropperY1", label = "YELLOW DROPPER",
		x = -20, floorTop = FLOOR2_TOP, beltTop = BELT2_TOP,
		color = "yellow", key = "yellow", manual = false,
		defValue = 60, defInterval = 2.5,
	})
end

function M.BuildDropperY2(G, plot)
	buildDropperRig(G, plot, {
		name = "DropperY2", label = "YELLOW DROPPER 2",
		x = -13, floorTop = FLOOR2_TOP, beltTop = BELT2_TOP,
		color = "gold", key = "yellow", manual = false,
		defValue = 60, defInterval = 2.5,
	})
end

----------------------------------------------------------------------
-- 21. yellow_upgrader2 (floor 2)
----------------------------------------------------------------------

function M.BuildYellowUpgrader2(G, plot)
	buildUpgraderRig(G, plot, {
		id = "yellow_upgrader2", label = "YELLOW UPGRADER 2", x = 6, beltTop = BELT2_TOP,
		color = "gold", defMult = 1.9, defAdd = 8,
	})
end

----------------------------------------------------------------------
-- 22. speedy_conveyor — doubles the speed of BOTH belts
----------------------------------------------------------------------

function M.BuildSpeedyConveyor(G, plot)
	local Util = G.Util
	local m = Util.model("SpeedyConveyor", plot.itemsFolder)

	plot.mainBelts = plot.mainBelts or {}
	for i = #plot.mainBelts, 1, -1 do
		local e = plot.mainBelts[i]
		if not (e.part and e.part.Parent) then
			table.remove(plot.mainBelts, i)
		end
	end
	-- fallback: find belt parts by their surface velocity if none were registered
	if #plot.mainBelts == 0 then
		for _, d in ipairs(plot.itemsFolder:GetDescendants()) do
			if d:IsA("BasePart") and d.Anchored and d.AssemblyLinearVelocity.Magnitude > 0.1 then
				table.insert(plot.mainBelts, { part = d, speed = d.AssemblyLinearVelocity.Magnitude })
			end
		end
	end
	for _, e in ipairs(plot.mainBelts) do
		e.speed = e.speed * 2
		e.part.AssemblyLinearVelocity = e.part.AssemblyLinearVelocity * 2
		e.part:SetAttribute("Speedy", true)
	end

	-- glowing speed stripes + signs along both belt lines
	for _, beltTop in ipairs({ BELT1_TOP, BELT2_TOP }) do
		for _, s in ipairs({ -1, 1 }) do
			Util.part({
				Name = "SpeedStripe", Size = Vector3.new(64, 0.25, 0.6),
				CFrame = plot:cf(BELT_CX, beltTop - 0.35, BELT_Z + s * 2.35),
				Color = "cyan", Neon = true, CanCollide = false, Parent = m,
			})
		end
		makeSign(G, m, plot:cf(-24, beltTop + 8, BELT_Z), "SPEEDY CONVEYOR - x2 SPEED!", "cyan")
	end
end

----------------------------------------------------------------------
-- 24. walls2 — floor-2 perimeter (y 24..48) with windows + balcony doorway (+X)
----------------------------------------------------------------------

function M.BuildWalls2(G, plot)
	local Util = G.Util
	local m = Util.model("Walls2", plot.itemsFolder)
	local yLower, yGlass, yUpper = 28, 36, 44

	-- -X wall, front (-Z) wall and back (+Z) wall: full walls with window band
	local x = -39.25
	Util.part({ Name = "WLower", Size = Vector3.new(WALL_T, 8, 77), CFrame = plot:cf(x, yLower, 0), Color = "white", Material = "Concrete", Parent = m })
	Util.part({ Name = "WGlass", Size = Vector3.new(WALL_T, 8, 77), CFrame = plot:cf(x, yGlass, 0), Color = "lightblue", Material = "Glass", Transparency = 0.45, Parent = m })
	for _, pz in ipairs({ -19.25, 0, 19.25 }) do
		Util.part({ Name = "WPillar", Size = Vector3.new(WALL_T + 0.4, 8, 3.2), CFrame = plot:cf(x, yGlass, pz), Color = "gold", Material = "Metal", Parent = m })
	end
	Util.part({ Name = "WUpper", Size = Vector3.new(WALL_T, 8, 77), CFrame = plot:cf(x, yUpper, 0), Color = "white", Material = "Concrete", Parent = m })

	for _, sz in ipairs({ -1, 1 }) do
		local z = sz * 39.25
		Util.part({ Name = "FLower", Size = Vector3.new(80, 8, WALL_T), CFrame = plot:cf(0, yLower, z), Color = "white", Material = "Concrete", Parent = m })
		Util.part({ Name = "FGlass", Size = Vector3.new(80, 8, WALL_T), CFrame = plot:cf(0, yGlass, z), Color = "lightblue", Material = "Glass", Transparency = 0.45, Parent = m })
		for _, px in ipairs({ -20, 0, 20 }) do
			Util.part({ Name = "FPillar", Size = Vector3.new(3.2, 8, WALL_T + 0.4), CFrame = plot:cf(px, yGlass, z), Color = "gold", Material = "Metal", Parent = m })
		end
		Util.part({ Name = "FUpper", Size = Vector3.new(80, 8, WALL_T), CFrame = plot:cf(0, yUpper, z), Color = "white", Material = "Concrete", Parent = m })
	end

	-- +X wall with a doorway (z in [-6, 6], y 24..36) out to the future balcony
	x = 39.25
	for _, sz in ipairs({ -1, 1 }) do
		local cz = sz * 22.25
		Util.part({ Name = "BalcLower", Size = Vector3.new(WALL_T, 8, 32.5), CFrame = plot:cf(x, yLower, cz), Color = "white", Material = "Concrete", Parent = m })
		Util.part({ Name = "BalcGlass", Size = Vector3.new(WALL_T, 8, 32.5), CFrame = plot:cf(x, yGlass, cz), Color = "lightblue", Material = "Glass", Transparency = 0.45, Parent = m })
		Util.part({ Name = "BalcPillar", Size = Vector3.new(WALL_T + 0.4, 8, 3.2), CFrame = plot:cf(x, yGlass, sz * 20), Color = "gold", Material = "Metal", Parent = m })
	end
	Util.part({ Name = "BalcHeader", Size = Vector3.new(WALL_T, 4, 12), CFrame = plot:cf(x, 34, 0), Color = "white", Material = "Concrete", Parent = m })
	Util.part({ Name = "BalcUpper", Size = Vector3.new(WALL_T, 8, 77), CFrame = plot:cf(x, yUpper, 0), Color = "white", Material = "Concrete", Parent = m })
	for _, sz in ipairs({ -1, 1 }) do
		Util.part({ Name = "BalcDoorFrame", Size = Vector3.new(2.2, 12, 1.4), CFrame = plot:cf(x, 30, sz * 6.6), Color = "yellow", Neon = true, Parent = m })
	end
	Util.part({ Name = "BalcDoorTop", Size = Vector3.new(2.2, 1.4, 14.6), CFrame = plot:cf(x, 36.6, 0), Color = "yellow", Neon = true, Parent = m })
	makeSign(G, m, plot:cf(36, 30, 0), "BALCONY THIS WAY! (coming soon)", "yellow")

	-- corner pillars with caps
	for _, sx in ipairs({ -1, 1 }) do
		for _, sz2 in ipairs({ -1, 1 }) do
			Util.part({ Name = "Corner2", Size = Vector3.new(2.6, 24, 2.6), CFrame = plot:cf(sx * 39, 36, sz2 * 39), Color = "darkgreen", Material = "Concrete", Parent = m })
			Util.part({ Name = "Corner2Cap", Size = Vector3.new(3.2, 1, 3.2), CFrame = plot:cf(sx * 39, 48.5, sz2 * 39), Color = "gold", Neon = true, Parent = m })
		end
	end
end

return M
