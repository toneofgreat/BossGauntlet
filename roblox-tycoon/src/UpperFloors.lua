-- UpperFloors.lua -- the shared post-lab complex at (0, 700, 1500), built ONCE.
-- Contract: Upper Floors shared zone. Arrival platform + 7 shared purchase pads
-- (giant_obby, top_walls_floor, sword_giver, bookshelf, metal_holder, tv, bench),
-- the GIANT OBBY (66 platforms, y 700 -> ~900, checkpoints every 15), the CODE
-- ROOM ("OBBY CODE: 7259"), the TOP FLOOR at y~910 with all its toys, and THE TOP
-- summit (friendly duck jumpscare + confetti).
-- Plain Lua 5.1 syntax only. Returns M with M.Init(G); world built in M.Build(G).

local Players = game:GetService("Players")

local M = {}
local G = nil
local built = false

--------------------------------------------------------------------
-- Layout constants
--------------------------------------------------------------------

local ARRIVE = Vector3.new(0, 700, 1500)        -- arrival platform TOP surface
local OBBY_CENTER = Vector3.new(0, 0, 1650)     -- spiral axis (XZ only)
local OBBY_RADIUS = 36
local PLATFORM_COUNT = 66                        -- y rises 3/platform: 703 -> 898
local TOPFLOOR_Y = 910                           -- top floor TOP surface
local TOPFLOOR_CENTER = Vector3.new(0, 0, 1650)  -- 60x60 room, z 1620..1680
local SUMMIT_TOP_Y = 934

local ARRIVAL_CF = CFrame.new(0, 703, 1495)      -- teleport-back target
local TOPFLOOR_CF = CFrame.new(0, 912, 1650)     -- beam / express target
local SUMMIT_START_CF = CFrame.new(0, 913, 1683) -- just past the stairway door

local SECRET_BOOK_INDEX = 7                      -- the CRIMSON book
local TV_CODE = "7259"
local TV_COLOR = "CRIMSON"

--------------------------------------------------------------------
-- Per-player obby checkpoint state
--------------------------------------------------------------------

local checkpoints = {}      -- [UserId] = CFrame to respawn at
local pendingRespawn = {}   -- [UserId] = true when they died inside the obby zone

local function inObbyRegion(pos)
	-- Y bound keeps Lab deaths (y ~500, same X/Z envelope) from hijacking a
	-- held obby checkpoint and skipping the lab's death penalty.
	return pos.X > -200 and pos.X < 200 and pos.Z > 1400 and pos.Z < 1900 and pos.Y > 650
end

--------------------------------------------------------------------
-- Small helpers
--------------------------------------------------------------------

local function notify(player, text, colorName)
	if not (player and G and G.Remotes) then return end
	local r = G.Remotes:FindFirstChild("Notify")
	if r then
		r:FireClient(player, text, colorName or "white")
	end
end

local function tp(char, cframe)
	if not char then return end
	pcall(function()
		char:PivotTo(cframe)
	end)
end

-- Has THIS player bought shared item `id`? The purchase engine marks the
-- player's plot.purchased; we also check the Economy save data defensively.
local function ownsShared(player, id)
	if not player then return false end
	local pm = G.PlotManager
	if pm and pm.GetPlotOf then
		local ok, plot = pcall(pm.GetPlotOf, player)
		if ok and plot and type(plot.purchased) == "table" and plot.purchased[id] then
			return true
		end
	end
	local eco = G.Economy
	if eco then
		-- Purchases.onSharedTouch sets the flag as "bought_"..id
		if eco.HasFlag and eco.HasFlag(player, "bought_" .. id) then
			return true
		end
		if eco.GetData then
			local ok, d = pcall(eco.GetData, player)
			if ok and type(d) == "table" and type(d.purchased) == "table" then
				if d.purchased[id] == true then return true end
				for _, pid in pairs(d.purchased) do
					if pid == id then return true end
				end
			end
		end
	end
	return false
end

local function makeKill(part)
	part.Touched:Connect(function(hit)
		local char = hit and hit.Parent
		local hum = char and char:FindFirstChildOfClass("Humanoid")
		if hum and hum.Health > 0 then
			hum.Health = 0
		end
	end)
end

local function addLight(part, colorName, range, brightness)
	local L = Instance.new("PointLight")
	L.Color = G.Util.color(colorName or "white")
	L.Range = range or 18
	L.Brightness = brightness or 1.5
	L.Parent = part
	return L
end

local function addSparkles(part, colorName, rate)
	local pe = Instance.new("ParticleEmitter")
	pe.Color = ColorSequence.new(G.Util.color(colorName or "gold"))
	pe.LightEmission = 1
	pe.Rate = rate or 6
	pe.Lifetime = NumberRange.new(0.8, 1.6)
	pe.Speed = NumberRange.new(2, 5)
	pe.SpreadAngle = Vector2.new(180, 180)
	pe.Size = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.35),
		NumberSequenceKeypoint.new(1, 0),
	})
	pe.Parent = part
	return pe
end

--------------------------------------------------------------------
-- The classic sword Tool (built from parts, no meshes needed)
--------------------------------------------------------------------

local function giveSword(player)
	local char = player.Character
	if (char and char:FindFirstChild("Classic Sword"))
		or (player:FindFirstChild("Backpack") and player.Backpack:FindFirstChild("Classic Sword")) then
		notify(player, "You already have the Classic Sword!", "yellow")
		return
	end

	local tool = Instance.new("Tool")
	tool.Name = "Classic Sword"
	tool.RequiresHandle = true
	tool.CanBeDropped = false
	tool.ToolTip = "Slash! (20 damage)"
	tool.GripPos = Vector3.new(0, -0.4, 0)

	local handle = Instance.new("Part")
	handle.Name = "Handle"
	handle.Size = Vector3.new(0.5, 1.2, 0.5)
	handle.Color = G.Util.color("brown")
	handle.Material = Enum.Material.Wood
	handle.Anchored = false
	handle.CanCollide = false
	handle.Parent = tool

	local guard = Instance.new("Part")
	guard.Name = "Guard"
	guard.Size = Vector3.new(1.6, 0.3, 0.5)
	guard.Color = G.Util.color("gold")
	guard.Material = Enum.Material.Metal
	guard.Anchored = false
	guard.CanCollide = false
	guard.Massless = true
	guard.CFrame = handle.CFrame * CFrame.new(0, 0.7, 0)
	guard.Parent = tool

	local blade = Instance.new("Part")
	blade.Name = "Blade"
	blade.Size = Vector3.new(0.3, 3.8, 0.8)
	blade.Color = G.Util.color("lightblue")
	blade.Material = Enum.Material.Neon
	blade.Anchored = false
	blade.CanCollide = false
	blade.Massless = true
	blade.CFrame = handle.CFrame * CFrame.new(0, 2.6, 0)
	blade.Parent = tool

	local w1 = Instance.new("WeldConstraint")
	w1.Part0 = handle
	w1.Part1 = guard
	w1.Parent = handle
	local w2 = Instance.new("WeldConstraint")
	w2.Part0 = handle
	w2.Part1 = blade
	w2.Parent = handle

	-- Simple animationless slash damage: blade touch hurts other players.
	local lastHit = {}
	blade.Touched:Connect(function(hit)
		local wielder = tool.Parent
		if not (wielder and wielder:FindFirstChildOfClass("Humanoid")) then return end
		local victimChar = hit and hit.Parent
		if not victimChar or victimChar == wielder then return end
		local vhum = victimChar:FindFirstChildOfClass("Humanoid")
		if not vhum or vhum.Health <= 0 then return end
		local now = os.clock()
		if lastHit[vhum] and (now - lastHit[vhum]) < 0.6 then return end
		lastHit[vhum] = now
		vhum:TakeDamage(20)
	end)

	tool.Parent = player:FindFirstChild("Backpack") or player
	notify(player, "You got the CLASSIC SWORD! Slash away!", "green")
end

--------------------------------------------------------------------
-- Init / Build
--------------------------------------------------------------------

function M.Init(g)
	G = g
end

function M.Build(g)
	if g then G = g end
	if built then return end
	built = true

	local U = G.Util
	local model = U.model("UpperFloors", workspace)

	----------------------------------------------------------------
	-- Player respawn hooks (per-player obby checkpoints)
	----------------------------------------------------------------

	local function hookPlayer(player)
		player.CharacterAdded:Connect(function(char)
			local uid = player.UserId
			if pendingRespawn[uid] and checkpoints[uid] then
				pendingRespawn[uid] = nil
				task.spawn(function()
					char:WaitForChild("HumanoidRootPart", 8)
					task.wait(0.2)
					local cp = checkpoints[uid]
					if cp and char.Parent then
						tp(char, cp)
					end
				end)
			else
				pendingRespawn[uid] = nil
			end
			task.spawn(function()
				local hum = char:WaitForChild("Humanoid", 10)
				if not hum then return end
				hum.Died:Connect(function()
					if not checkpoints[player.UserId] then return end
					local hrp = char:FindFirstChild("HumanoidRootPart")
					if hrp and inObbyRegion(hrp.Position) then
						pendingRespawn[player.UserId] = true
					end
				end)
			end)
		end)
	end
	Players.PlayerAdded:Connect(hookPlayer)
	for _, p in ipairs(Players:GetPlayers()) do
		hookPlayer(p)
	end
	Players.PlayerRemoving:Connect(function(p)
		checkpoints[p.UserId] = nil
		pendingRespawn[p.UserId] = nil
	end)

	----------------------------------------------------------------
	-- ARRIVAL PLATFORM (top at y = 700)
	----------------------------------------------------------------

	U.part({ Name = "ArrivalFloor", Size = Vector3.new(70, 4, 70),
		CFrame = CFrame.new(0, 698, 1500), Color = "white", Material = "Marble", Parent = model })
	-- neon gold trim
	U.part({ Name = "TrimN", Size = Vector3.new(70, 0.6, 1), CFrame = CFrame.new(0, 700.3, 1534.5), Color = "gold", Neon = true, Parent = model })
	U.part({ Name = "TrimS", Size = Vector3.new(70, 0.6, 1), CFrame = CFrame.new(0, 700.3, 1465.5), Color = "gold", Neon = true, Parent = model })
	U.part({ Name = "TrimE", Size = Vector3.new(1, 0.6, 70), CFrame = CFrame.new(34.5, 700.3, 1500), Color = "gold", Neon = true, Parent = model })
	U.part({ Name = "TrimW", Size = Vector3.new(1, 0.6, 70), CFrame = CFrame.new(-34.5, 700.3, 1500), Color = "gold", Neon = true, Parent = model })

	local bigSign = U.part({ Name = "ArrivalSign", Size = Vector3.new(26, 10, 1.5),
		CFrame = CFrame.new(-22, 707, 1528), Color = "black", Material = "SmoothPlastic", Parent = model })
	U.surfaceText(bigSign, "Front", "UPPER FLOORS\nYou escaped the lab!\nBeat the GIANT OBBY to find the CODE", "gold")
	U.label(bigSign, "UPPER FLOORS", { textColor = "gold", width = 260 })
	addLight(bigSign, "gold", 24, 2)

	-- two lamp posts
	for _, x in ipairs({ -30, 30 }) do
		local post = U.part({ Name = "LampPost", Size = Vector3.new(1, 10, 1),
			CFrame = CFrame.new(x, 705, 1470), Color = "gray", Material = "Metal", Parent = model })
		local bulb = U.part({ Name = "LampBulb", Size = Vector3.new(2, 2, 2), Shape = "Ball",
			CFrame = CFrame.new(x, 710.5, 1470), Color = "yellow", Neon = true, Parent = model })
		addLight(bulb, "yellow", 26, 2)
	end

	----------------------------------------------------------------
	-- SHARED PURCHASE PADS (engine wires touch logic + billboards)
	----------------------------------------------------------------

	local padIds = { "giant_obby", "top_walls_floor", "sword_giver", "bookshelf", "metal_holder", "tv", "bench" }
	for k, id in ipairs(padIds) do
		local x = -30 + (k - 1) * 10
		local pad = U.part({ Name = "SharedPad_" .. id, Size = Vector3.new(6, 1, 6),
			CFrame = CFrame.new(x, 700.5, 1486), Color = "gold", Neon = true, Parent = model })
		G.Purchases.RegisterSharedPad(id, pad)
	end

	----------------------------------------------------------------
	-- TOP FLOOR EXPRESS pad (skip the climb once you own the floor)
	----------------------------------------------------------------

	local express = U.part({ Name = "TopFloorExpress", Size = Vector3.new(6, 1, 6),
		CFrame = CFrame.new(24, 700.5, 1516), Color = "cyan", Neon = true, Parent = model })
	U.label(express, "TOP FLOOR EXPRESS", { textColor = "cyan" })
	addSparkles(express, "cyan", 4)
	U.touchOnce(express, 2, function(player, char)
		if ownsShared(player, "top_walls_floor") then
			tp(char, TOPFLOOR_CF)
			notify(player, "Zooooop! Welcome to the top floor.", "green")
		else
			notify(player, "Buy 'Walls & Next Floor' to ride the express!", "red")
		end
	end)

	----------------------------------------------------------------
	-- GIANT OBBY GATE (door checks purchase, teleports you past)
	----------------------------------------------------------------

	U.part({ Name = "GatePillarL", Size = Vector3.new(3, 16, 3), CFrame = CFrame.new(-7, 708, 1534), Color = "gray", Material = "Marble", Parent = model })
	U.part({ Name = "GatePillarR", Size = Vector3.new(3, 16, 3), CFrame = CFrame.new(7, 708, 1534), Color = "gray", Material = "Marble", Parent = model })
	local header = U.part({ Name = "GateHeader", Size = Vector3.new(20, 3, 3), CFrame = CFrame.new(0, 717, 1534), Color = "gold", Neon = true, Parent = model })
	U.label(header, "THE GIANT OBBY", { textColor = "gold", width = 260 })

	local gateDoor = U.part({ Name = "GiantObbyDoor", Size = Vector3.new(11, 13, 1),
		CFrame = CFrame.new(0, 706.5, 1534), Color = "green", Neon = true, Transparency = 0.35, Parent = model })
	U.surfaceText(gateDoor, "Front", "GIANT OBBY\nowners only!", "white")

	----------------------------------------------------------------
	-- THE GIANT OBBY -- 66-platform spiral, y 703 -> 898
	----------------------------------------------------------------

	-- central column + deco rings (ToH tower feel)
	U.part({ Name = "ObbyColumn", Size = Vector3.new(10, 205, 10),
		CFrame = CFrame.new(OBBY_CENTER.X, 800, OBBY_CENTER.Z), Color = "gray", Material = "Slate", Parent = model })
	for _, ry in ipairs({ 740, 790, 840 }) do
		local ring = U.part({ Name = "DecoRing", Size = Vector3.new(1, 18, 18), Shape = "Cylinder",
			CFrame = CFrame.new(OBBY_CENTER.X, ry, OBBY_CENTER.Z) * CFrame.Angles(0, 0, math.pi / 2),
			Color = "purple", Neon = true, Transparency = 0.5, CanCollide = false, Parent = model })
		U.spinner(ring, "X", 0.8)
	end

	-- kill plane under the whole climb (fast respawn-at-checkpoint)
	local killPlane = U.part({ Name = "ObbyKillPlane", Size = Vector3.new(260, 1, 350),
		CFrame = CFrame.new(0, 682, 1645), Transparency = 1, CanCollide = false, Parent = model })
	makeKill(killPlane)

	local positions = {}
	for i = 1, PLATFORM_COUNT do
		local a = -math.pi / 2 + 0.36 * (i - 1)
		positions[i] = Vector3.new(
			OBBY_CENTER.X + math.cos(a) * OBBY_RADIUS,
			700 + 3 * i,
			OBBY_CENTER.Z + math.sin(a) * OBBY_RADIUS
		)
	end

	local palette = { "green", "cyan", "lightblue", "purple", "pink", "orange", "yellow" }
	local startCF = CFrame.new(positions[1] + Vector3.new(0, 4, 0))

	for i = 1, PLATFORM_COUNT do
		local pos = positions[i]
		local nextPos
		if i < PLATFORM_COUNT then
			nextPos = positions[i + 1]
		else
			nextPos = pos + (pos - positions[i - 1])
		end
		local cf = CFrame.lookAt(
			Vector3.new(pos.X, pos.Y - 0.5, pos.Z),
			Vector3.new(nextPos.X, pos.Y - 0.5, nextPos.Z)
		)
		local isCheckpoint = (i == 1) or (i % 15 == 0 and i <= 60)

		if isCheckpoint then
			local plat = U.part({ Name = "ObbyCheckpointPlat" .. i, Size = Vector3.new(12, 1, 12),
				CFrame = cf, Color = "white", Material = "Marble", Parent = model })
			local pad = U.part({ Name = "ObbyCheckpointPad" .. i, Size = Vector3.new(5, 0.4, 5),
				CFrame = cf * CFrame.new(0, 0.7, 0), Color = "lightblue", Neon = true, Parent = model })
			local labelText = "CHECKPOINT"
			if i == 1 then labelText = "START" end
			U.label(pad, labelText, { textColor = "lightblue" })
			addLight(pad, "lightblue", 16, 1.5)
			local cpCF = CFrame.new(pos + Vector3.new(0, 4, 0))
			U.touchOnce(pad, 2, function(player)
				if checkpoints[player.UserId] ~= cpCF then
					checkpoints[player.UserId] = cpCF
					notify(player, "Checkpoint saved!", "green")
				end
			end)
		elseif i % 9 == 4 then
			-- spinner platform: duck under / jump the neon blade
			U.part({ Name = "ObbySpinPlat" .. i, Size = Vector3.new(12, 1, 12),
				CFrame = cf, Color = palette[(i % #palette) + 1], Material = "SmoothPlastic", Parent = model })
			local hub = U.part({ Name = "ObbySpinHub" .. i, Size = Vector3.new(1.5, 1.4, 1.5),
				CFrame = cf * CFrame.new(0, 1.2, 0), Color = "darkred", Material = "Metal", Parent = model })
			local blade = U.part({ Name = "ObbySpinBlade" .. i, Size = Vector3.new(11, 0.4, 1.2),
				CFrame = cf * CFrame.new(0, 1.6, 0), Color = "red", Neon = true, Parent = model })
			U.spinner(blade, "Y", 1.8 + (i % 3) * 0.5)
			makeKill(blade)
		elseif i % 13 == 6 then
			-- conveyor pushing you backward -- run for it!
			local belt = U.part({ Name = "ObbyConveyor" .. i, Size = Vector3.new(4, 1, 14),
				CFrame = cf, Color = "cyan", Material = "DiamondPlate", Parent = model })
			belt.AssemblyLinearVelocity = cf.LookVector * -9
			U.label(belt, "RUN!", { textColor = "cyan", maxDistance = 80 })
		elseif i % 5 == 2 then
			-- thin wraparound ledge jutting into the void
			U.part({ Name = "ObbyLedge" .. i, Size = Vector3.new(2.2, 1, 16),
				CFrame = cf, Color = palette[(i % #palette) + 1], Material = "SmoothPlastic", Parent = model })
		else
			U.part({ Name = "ObbyPlat" .. i, Size = Vector3.new(8, 1, 8),
				CFrame = cf, Color = palette[(i % #palette) + 1], Material = "SmoothPlastic", Parent = model })
		end
	end

	-- gate door logic (needs startCF)
	U.touchOnce(gateDoor, 1.5, function(player, char)
		if ownsShared(player, "giant_obby") then
			checkpoints[player.UserId] = startCF
			tp(char, startCF)
			notify(player, "Welcome to the GIANT OBBY! Climb to the top!", "green")
		else
			notify(player, "You need The Giant Obby! Buy it on the gold pad.", "red")
		end
	end)

	----------------------------------------------------------------
	-- CODE ROOM (top of the climb, floor at y = 898)
	----------------------------------------------------------------

	local aEnd = -math.pi / 2 + 0.36 * (PLATFORM_COUNT - 1)
	local dirEnd = Vector3.new(math.cos(aEnd), 0, math.sin(aEnd))
	local roomCenter = Vector3.new(
		OBBY_CENTER.X + dirEnd.X * 54, 898, OBBY_CENTER.Z + dirEnd.Z * 54)
	local roomCF = CFrame.lookAt(roomCenter,
		Vector3.new(OBBY_CENTER.X, 898, OBBY_CENTER.Z))

	-- bridge from platform 66 to the room
	local bridgePos = Vector3.new(
		OBBY_CENTER.X + dirEnd.X * 45, 897.5, OBBY_CENTER.Z + dirEnd.Z * 45)
	U.part({ Name = "CodeBridge", Size = Vector3.new(6, 1, 14),
		CFrame = CFrame.lookAt(bridgePos, Vector3.new(roomCenter.X, 897.5, roomCenter.Z)),
		Color = "gold", Material = "Marble", Parent = model })

	U.part({ Name = "CodeRoomFloor", Size = Vector3.new(26, 1, 26),
		CFrame = roomCF * CFrame.new(0, -0.5, 0), Color = "black", Material = "Marble", Parent = model })
	U.part({ Name = "CodeRoomWallBack", Size = Vector3.new(26, 10, 1),
		CFrame = roomCF * CFrame.new(0, 5, 13), Color = "purple", Material = "Marble", Parent = model })
	U.part({ Name = "CodeRoomWallL", Size = Vector3.new(1, 10, 26),
		CFrame = roomCF * CFrame.new(-13, 5, 0), Color = "purple", Material = "Marble", Parent = model })
	U.part({ Name = "CodeRoomWallR", Size = Vector3.new(1, 10, 26),
		CFrame = roomCF * CFrame.new(13, 5, 0), Color = "purple", Material = "Marble", Parent = model })
	U.part({ Name = "CodeRoomStubL", Size = Vector3.new(8, 10, 1),
		CFrame = roomCF * CFrame.new(-9, 5, -13), Color = "purple", Material = "Marble", Parent = model })
	U.part({ Name = "CodeRoomStubR", Size = Vector3.new(8, 10, 1),
		CFrame = roomCF * CFrame.new(9, 5, -13), Color = "purple", Material = "Marble", Parent = model })

	local codeSign = U.part({ Name = "CodeSign", Size = Vector3.new(18, 8, 0.5),
		CFrame = roomCF * CFrame.new(0, 6, 12.4), Color = "black", Parent = model })
	U.surfaceText(codeSign, "Front", "OBBY CODE:\n7259", "yellow")
	addLight(codeSign, "yellow", 24, 2)
	local star = U.part({ Name = "CodeStar", Size = Vector3.new(2, 2, 2),
		CFrame = roomCF * CFrame.new(0, 10.5, 0), Color = "gold", Neon = true, CanCollide = false, Parent = model })
	U.spinner(star, "Y", 2)
	addSparkles(star, "gold", 10)

	-- finish pad: repeatable reward, 30s per-player debounce
	local finishPad = U.part({ Name = "GiantObbyFinish", Size = Vector3.new(8, 0.6, 8),
		CFrame = roomCF * CFrame.new(0, 0.3, 3), Color = "green", Neon = true, Parent = model })
	U.label(finishPad, "FINISH!", { textColor = "green" })
	addSparkles(finishPad, "green", 8)
	U.touchOnce(finishPad, 30, function(player)
		local reward = 2000000
		if G.Balance and G.Balance.ObbyRewards and G.Balance.ObbyRewards.giant then
			reward = G.Balance.ObbyRewards.giant
		end
		G.Economy.Add(player, reward)
		G.Economy.SetFlag(player, "obby_code_seen")
		notify(player, "GIANT OBBY complete! +" .. U.fmt(reward) .. " (remember that code!)", "green")
		U.firework(finishPad.Position + Vector3.new(0, 6, 0))
	end)

	-- teleport pad back to arrival (clears your checkpoint)
	local backPad = U.part({ Name = "CodeRoomBackPad", Size = Vector3.new(5, 0.6, 5),
		CFrame = roomCF * CFrame.new(-8, 0.3, -6), Color = "orange", Neon = true, Parent = model })
	U.label(backPad, "Back to Arrival", { textColor = "orange" })
	U.touchOnce(backPad, 2, function(player, char)
		checkpoints[player.UserId] = nil
		tp(char, ARRIVAL_CF)
		notify(player, "Back to the arrival platform!", "white")
	end)

	-- beam up to the top floor (needs top_walls_floor purchased)
	local beamPad = U.part({ Name = "CodeRoomBeamPad", Size = Vector3.new(5, 0.6, 5),
		CFrame = roomCF * CFrame.new(8, 0.3, -6), Color = "cyan", Neon = true, Parent = model })
	U.label(beamPad, "TOP FLOOR BEAM", { textColor = "cyan" })
	local beam = U.part({ Name = "CodeRoomBeam", Size = Vector3.new(0.2, 14, 4), Shape = "Cylinder",
		CFrame = roomCF * CFrame.new(8, 7.5, -6) * CFrame.Angles(0, 0, math.pi / 2),
		Color = "cyan", Neon = true, Transparency = 0.6, CanCollide = false, Parent = model })
	U.touchOnce(beamPad, 2, function(player, char)
		if ownsShared(player, "top_walls_floor") then
			checkpoints[player.UserId] = nil
			tp(char, TOPFLOOR_CF)
			notify(player, "Beaming up to the TOP FLOOR!", "green")
		else
			notify(player, "Buy 'Walls & Next Floor' to beam up!", "red")
		end
	end)

	----------------------------------------------------------------
	-- TOP FLOOR (60x60 room, floor top at y = 910, z 1620..1680)
	----------------------------------------------------------------

	local fx, fz = TOPFLOOR_CENTER.X, TOPFLOOR_CENTER.Z
	U.part({ Name = "TopFloorSlab", Size = Vector3.new(60, 2, 60),
		CFrame = CFrame.new(fx, 909, fz), Color = "white", Material = "Marble", Parent = model })
	local rug = U.part({ Name = "TopFloorRug", Size = Vector3.new(0.2, 16, 16), Shape = "Cylinder",
		CFrame = CFrame.new(fx, 910.1, fz) * CFrame.Angles(0, 0, math.pi / 2),
		Color = "purple", Neon = true, CanCollide = false, Parent = model })

	-- walls (12 high) with a viewing doorway (-Z) and the summit doorway (+Z)
	U.part({ Name = "TopWallW", Size = Vector3.new(1, 12, 60), CFrame = CFrame.new(fx - 29.5, 916, fz), Color = "lightblue", Material = "Brick", Parent = model })
	U.part({ Name = "TopWallE", Size = Vector3.new(1, 12, 60), CFrame = CFrame.new(fx + 29.5, 916, fz), Color = "lightblue", Material = "Brick", Parent = model })
	U.part({ Name = "TopWallS_A", Size = Vector3.new(24, 12, 1), CFrame = CFrame.new(fx - 18, 916, fz - 29.5), Color = "lightblue", Material = "Brick", Parent = model })
	U.part({ Name = "TopWallS_B", Size = Vector3.new(24, 12, 1), CFrame = CFrame.new(fx + 18, 916, fz - 29.5), Color = "lightblue", Material = "Brick", Parent = model })
	U.part({ Name = "TopWallS_Header", Size = Vector3.new(12, 4, 1), CFrame = CFrame.new(fx, 920, fz - 29.5), Color = "lightblue", Material = "Brick", Parent = model })
	U.part({ Name = "TopWallN_A", Size = Vector3.new(25, 12, 1), CFrame = CFrame.new(fx - 17.5, 916, fz + 29.5), Color = "lightblue", Material = "Brick", Parent = model })
	U.part({ Name = "TopWallN_B", Size = Vector3.new(25, 12, 1), CFrame = CFrame.new(fx + 17.5, 916, fz + 29.5), Color = "lightblue", Material = "Brick", Parent = model })
	U.part({ Name = "TopWallN_Header", Size = Vector3.new(10, 4, 1), CFrame = CFrame.new(fx, 920, fz + 29.5), Color = "lightblue", Material = "Brick", Parent = model })
	-- gold trim along wall tops
	U.part({ Name = "TopTrimW", Size = Vector3.new(1.2, 0.6, 60), CFrame = CFrame.new(fx - 29.5, 922.3, fz), Color = "gold", Neon = true, Parent = model })
	U.part({ Name = "TopTrimE", Size = Vector3.new(1.2, 0.6, 60), CFrame = CFrame.new(fx + 29.5, 922.3, fz), Color = "gold", Neon = true, Parent = model })
	U.part({ Name = "TopTrimS", Size = Vector3.new(60, 0.6, 1.2), CFrame = CFrame.new(fx, 922.3, fz - 29.5), Color = "gold", Neon = true, Parent = model })
	U.part({ Name = "TopTrimN", Size = Vector3.new(60, 0.6, 1.2), CFrame = CFrame.new(fx, 922.3, fz + 29.5), Color = "gold", Neon = true, Parent = model })

	-- corner torches
	for _, c in ipairs({ { -26, -26 }, { 26, -26 }, { -26, 26 }, { 26, 26 } }) do
		local torch = U.part({ Name = "TopTorch", Size = Vector3.new(1, 3, 1),
			CFrame = CFrame.new(fx + c[1], 912.5, fz + c[2]), Color = "orange", Neon = true, Parent = model })
		addLight(torch, "orange", 22, 1.8)
	end

	-- balcony outside the -Z doorway (look back at where you came from)
	U.part({ Name = "TopBalcony", Size = Vector3.new(16, 1, 12),
		CFrame = CFrame.new(fx, 909.5, fz - 36), Color = "white", Material = "Marble", Parent = model })
	U.part({ Name = "TopBalconyRailF", Size = Vector3.new(16, 3, 0.5), CFrame = CFrame.new(fx, 911.5, fz - 41.75), Color = "gold", Material = "Metal", Parent = model })
	U.part({ Name = "TopBalconyRailL", Size = Vector3.new(0.5, 3, 12), CFrame = CFrame.new(fx - 7.75, 911.5, fz - 36), Color = "gold", Material = "Metal", Parent = model })
	U.part({ Name = "TopBalconyRailR", Size = Vector3.new(0.5, 3, 12), CFrame = CFrame.new(fx + 7.75, 911.5, fz - 36), Color = "gold", Material = "Metal", Parent = model })

	-- back-down pad
	local downPad = U.part({ Name = "TopFloorDownPad", Size = Vector3.new(4, 0.6, 4),
		CFrame = CFrame.new(fx - 12, 910.3, fz - 24), Color = "orange", Neon = true, Parent = model })
	U.label(downPad, "Back to Arrival", { textColor = "orange" })
	U.touchOnce(downPad, 2, function(player, char)
		checkpoints[player.UserId] = nil
		tp(char, ARRIVAL_CF)
	end)

	----------------------------------------------------------------
	-- SWORD GIVER -- glowing pedestal
	----------------------------------------------------------------

	local pedBase = U.part({ Name = "SwordPedBase", Size = Vector3.new(5, 1, 5),
		CFrame = CFrame.new(fx - 18, 910.5, fz + 15), Color = "gold", Material = "Marble", Parent = model })
	U.part({ Name = "SwordPedColumn", Size = Vector3.new(3, 2, 3),
		CFrame = CFrame.new(fx - 18, 912, fz + 15), Color = "gold", Material = "Marble", Parent = model })
	local pedTop = U.part({ Name = "SwordPedTop", Size = Vector3.new(4, 0.5, 4),
		CFrame = CFrame.new(fx - 18, 913.25, fz + 15), Color = "gold", Neon = true, Parent = model })
	local displayBlade = U.part({ Name = "SwordDisplay", Size = Vector3.new(0.4, 4, 1),
		CFrame = CFrame.new(fx - 18, 916, fz + 15), Color = "lightblue", Neon = true, CanCollide = false, Parent = model })
	U.spinner(displayBlade, "Y", 1.5)
	addLight(displayBlade, "lightblue", 20, 2)
	addSparkles(pedTop, "lightblue", 6)
	U.label(pedTop, "SWORD GIVER", { textColor = "lightblue", offsetY = 6 })
	U.touchOnce(pedBase, 2, function(player)
		if ownsShared(player, "sword_giver") then
			giveSword(player)
		else
			notify(player, "Buy the Sword Giver to claim the blade!", "red")
		end
	end)

	----------------------------------------------------------------
	-- BOOKSHELF -- 12 clickable books, one holds the COLOR WORD
	----------------------------------------------------------------

	U.part({ Name = "BookcaseBack", Size = Vector3.new(0.6, 10, 18),
		CFrame = CFrame.new(fx + 28.6, 915, fz - 10), Color = "brown", Material = "Wood", Parent = model })
	local shelfYs = { 911.5, 914.5, 917.5 }
	for _, sy in ipairs(shelfYs) do
		U.part({ Name = "ShelfBoard", Size = Vector3.new(2.4, 0.4, 18),
			CFrame = CFrame.new(fx + 27.9, sy, fz - 10), Color = "brown", Material = "Wood", Parent = model })
	end
	local caseTop = U.part({ Name = "BookcaseTop", Size = Vector3.new(2.8, 0.5, 18.6),
		CFrame = CFrame.new(fx + 27.9, 920.2, fz - 10), Color = "brown", Material = "Wood", Parent = model })
	U.label(caseTop, "BOOKSHELF (click a book!)", { textColor = "yellow", width = 260 })

	local funnyTitles = {
		"Diary of a Wimpy Noob",
		"How to Speedrun Bedtime",
		"1000 Ways to Cook a Brick",
		"Harry Obby and the Chamber of Lava",
		"Duck Facts, Volume 3",
		"Why Is There a Book Up Here?",
		"the dusty red one",  -- placeholder; index 7 is the secret book
		"The Very Hungry Zombie",
		"Obby Physics for Babies",
		"50 Shades of Green Bricks",
		"Lord of the Onion Rings",
		"Chess for Ducks",
	}
	local bookColors = { "red", "blue", "green", "purple", "orange", "cyan", "darkred", "pink", "yellow", "lightblue", "gray", "gold" }
	for k = 1, 12 do
		local row = math.ceil(k / 4)
		local col = (k - 1) % 4
		local by = shelfYs[row] + 1.4
		local bz = fz - 10 - 6 + col * 4
		local isSecret = (k == SECRET_BOOK_INDEX)
		local book = U.part({ Name = "Book" .. k, Size = Vector3.new(0.9, 2.4, 1.6),
			CFrame = CFrame.new(fx + 27.9, by, bz), Color = bookColors[k], Material = "SmoothPlastic", Parent = model })
		local cd = Instance.new("ClickDetector")
		cd.MaxActivationDistance = 24
		cd.Parent = book
		cd.MouseClick:Connect(function(player)
			if not ownsShared(player, "bookshelf") then
				notify(player, "Buy the Bookshelf to read the books!", "red")
				return
			end
			if isSecret then
				G.Economy.SetFlag(player, "book_color_seen")
				notify(player, "Secret page! Your COLOR WORD is: CRIMSON", "green")
			else
				notify(player, "You read '" .. funnyTitles[k] .. "'. Riveting stuff.", "white")
			end
		end)
	end

	----------------------------------------------------------------
	-- METAL HOLDER + TV (wall-mounted, click for the code prompt)
	----------------------------------------------------------------

	U.part({ Name = "TVWallPlate", Size = Vector3.new(3, 3, 0.5),
		CFrame = CFrame.new(fx + 14, 916, fz + 28.75), Color = "gray", Material = "DiamondPlate", Parent = model })
	U.part({ Name = "TVArmL", Size = Vector3.new(0.6, 0.6, 1.6),
		CFrame = CFrame.new(fx + 13, 916, fz + 28), Color = "gray", Material = "Metal", Parent = model })
	U.part({ Name = "TVArmR", Size = Vector3.new(0.6, 0.6, 1.6),
		CFrame = CFrame.new(fx + 15, 916, fz + 28), Color = "gray", Material = "Metal", Parent = model })
	U.part({ Name = "TVFrame", Size = Vector3.new(11, 6.5, 0.8),
		CFrame = CFrame.new(fx + 14, 916, fz + 27.4), Color = "black", Material = "Metal", Parent = model })
	local tvScreen = U.part({ Name = "TVScreen", Size = Vector3.new(9.8, 5.4, 0.3),
		CFrame = CFrame.new(fx + 14, 916, fz + 26.9), Color = "lightblue", Neon = true, Parent = model })
	U.surfaceText(tvScreen, "Front", "* STATIC *\nclick me", "white", "black")
	U.label(tvScreen, "TV (on its trusty metal holder)", { textColor = "white", width = 280 })
	addLight(tvScreen, "lightblue", 16, 1.2)
	local tvClick = Instance.new("ClickDetector")
	tvClick.MaxActivationDistance = 28
	tvClick.Parent = tvScreen
	tvClick.MouseClick:Connect(function(player)
		if ownsShared(player, "tv") then
			local prompt = G.Remotes:FindFirstChild("TVPrompt")
			if prompt then
				prompt:FireClient(player)
			end
		else
			notify(player, "Buy the TV to switch it on!", "red")
		end
	end)

	----------------------------------------------------------------
	-- BENCH (a sittable Seat, cuz why not) -- front row for the TV
	----------------------------------------------------------------

	local seat = Instance.new("Seat")
	seat.Name = "Bench"
	seat.Size = Vector3.new(8, 1, 2.5)
	-- rotate so the Seat's front faces +Z (toward the TV)
	seat.CFrame = CFrame.new(fx + 14, 911.1, fz + 12) * CFrame.Angles(0, math.pi, 0)
	seat.Color = G.Util.color("brown")
	seat.Material = Enum.Material.Wood
	seat.Anchored = true
	seat.TopSurface = Enum.SurfaceType.Smooth
	seat.Parent = model
	U.part({ Name = "BenchLegL", Size = Vector3.new(0.8, 1.1, 2.5), CFrame = CFrame.new(fx + 10.6, 910.05, fz + 12), Color = "brown", Material = "Wood", Parent = model })
	U.part({ Name = "BenchLegR", Size = Vector3.new(0.8, 1.1, 2.5), CFrame = CFrame.new(fx + 17.4, 910.05, fz + 12), Color = "brown", Material = "Wood", Parent = model })
	U.part({ Name = "BenchBack", Size = Vector3.new(8, 2.5, 0.6), CFrame = CFrame.new(fx + 14, 912.4, fz + 10.9), Color = "brown", Material = "Wood", Parent = model })
	U.label(seat, "cuz why not", { textColor = "white" })

	----------------------------------------------------------------
	-- GLOWING STAIRWAY TO THE TOP (door checks tv_solved)
	----------------------------------------------------------------

	local stairDoor = U.part({ Name = "SummitDoor", Size = Vector3.new(10, 8, 1),
		CFrame = CFrame.new(fx, 914, fz + 29.5), Color = "gold", Neon = true, Transparency = 0.4, Parent = model })
	U.surfaceText(stairDoor, "Front", "THE TOP\nsolve the TV to enter", "white")
	U.label(stairDoor, "STAIRWAY TO THE TOP", { textColor = "gold", width = 260 })
	U.touchOnce(stairDoor, 1.5, function(player, char)
		if G.Economy.HasFlag(player, "tv_solved") then
			tp(char, SUMMIT_START_CF)
			notify(player, "The stairway welcomes you. Climb!", "green")
		else
			notify(player, "The TV knows a code and a color... solve it first!", "red")
		end
	end)

	-- the glowing stairway itself: 24 floating neon steps up to the summit
	for k = 1, 24 do
		local stepColor = "gold"
		if k % 2 == 0 then stepColor = "white" end
		local step = U.part({ Name = "SummitStep" .. k, Size = Vector3.new(10, 1, 1.6),
			CFrame = CFrame.new(fx, 909.5 + k, fz + 30 + 1.4 * k),
			Color = stepColor, Neon = true, Transparency = 0.15, Parent = model })
		if k % 6 == 0 then
			addLight(step, "gold", 14, 1.2)
		end
	end

	----------------------------------------------------------------
	-- THE TOP -- summit platform, duck jumpscare + confetti
	----------------------------------------------------------------

	U.part({ Name = "SummitFloor", Size = Vector3.new(20, 2, 20),
		CFrame = CFrame.new(fx, SUMMIT_TOP_Y - 1, fz + 73), Color = "white", Material = "Marble", Parent = model })
	U.part({ Name = "SummitRailN", Size = Vector3.new(20, 3, 0.5), CFrame = CFrame.new(fx, SUMMIT_TOP_Y + 1.5, fz + 82.75), Color = "gold", Material = "Metal", Parent = model })
	U.part({ Name = "SummitRailE", Size = Vector3.new(0.5, 3, 20), CFrame = CFrame.new(fx + 9.75, SUMMIT_TOP_Y + 1.5, fz + 73), Color = "gold", Material = "Metal", Parent = model })
	U.part({ Name = "SummitRailW", Size = Vector3.new(0.5, 3, 20), CFrame = CFrame.new(fx - 9.75, SUMMIT_TOP_Y + 1.5, fz + 73), Color = "gold", Material = "Metal", Parent = model })

	local summitPad = U.part({ Name = "SummitPad", Size = Vector3.new(6, 0.6, 6),
		CFrame = CFrame.new(fx, SUMMIT_TOP_Y + 0.3, fz + 73), Color = "rainbow", Neon = true, Parent = model })
	U.label(summitPad, "THE TOP", { textColor = "gold", alwaysOnTop = true })
	addSparkles(summitPad, "pink", 12)
	addLight(summitPad, "white", 24, 2)
	U.touchOnce(summitPad, 6, function(player, char)
		if not G.Economy.HasFlag(player, "tv_solved") then
			notify(player, "How did you even get up here? Solve the TV!", "red")
			return
		end
		local js = G.Remotes:FindFirstChild("Jumpscare")
		if js then
			js:FireClient(player)
		end
		U.firework(summitPad.Position + Vector3.new(0, 5, 0))
		U.firework(summitPad.Position + Vector3.new(6, 8, 4))
		U.firework(summitPad.Position + Vector3.new(-6, 8, -4))
		notify(player, "QUACK :) You reached THE TOP of Boss Tycoon!", "green")
	end)

	local summitDown = U.part({ Name = "SummitDownPad", Size = Vector3.new(4, 0.6, 4),
		CFrame = CFrame.new(fx + 7, SUMMIT_TOP_Y + 0.3, fz + 79), Color = "orange", Neon = true, Parent = model })
	U.label(summitDown, "Down to Arrival", { textColor = "orange" })
	U.touchOnce(summitDown, 2, function(player, char)
		checkpoints[player.UserId] = nil
		tp(char, ARRIVAL_CF)
	end)

	----------------------------------------------------------------
	-- TVSubmit: the code + color puzzle (THIS module owns the wire)
	----------------------------------------------------------------

	local tvSubmit = G.Remotes:FindFirstChild("TVSubmit")
	if tvSubmit then
		tvSubmit.OnServerInvoke = function(player, code, color)
			if not player then return false, "Who are you?" end
			if not ownsShared(player, "tv") then
				return false, "You need to buy the TV first!"
			end
			code = string.gsub(tostring(code or ""), "%s", "")
			color = string.gsub(tostring(color or ""), "%s", "")
			if code == TV_CODE and string.upper(color) == TV_COLOR then
				G.Economy.SetFlag(player, "tv_solved")
				notify(player, "The TV crackles... the glowing stairway to THE TOP is open!", "green")
				U.firework(stairDoor.Position + Vector3.new(0, 6, -3))
				return true, "CORRECT! The stairway to THE TOP is open!"
			end
			return false, "The TV buzzes angrily. Wrong code or color."
		end
	end
end

return M
