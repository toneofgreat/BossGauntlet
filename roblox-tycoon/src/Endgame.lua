-- Endgame.lua -- Boss Tycoon (troll agent)
-- Two shared endgame zones, built ONCE by Main via Endgame.Build(G):
--
--  (a) NUKE SILO at (-800, 0, 1500): fenced compound, rocket on a gantry,
--      dramatic launch platform holding purchase pad #67 "nuke"
--      (the engine enforces flag troll_won + $1T + repeatable, then calls
--      G.Endgame.LaunchNuke). LaunchNuke: sirens (Sound attempt + flashing
--      red lights), rocket rises on a smoke column ~5s, NukeAlert to all
--      clients (screen shake is the client's job), then
--      PlotManager.NukeAllExcept(attacker) -- which fires the explosion
--      visuals at every victim plot -- and the rocket quietly resets.
--
--  (b) ETERNAL TOWER OF HELL at (0, 0, -1400): pad #68 "etoh" at the gate
--      (engine enforces nuke_launched + $2T). Ten stacked sections to
--      y ~352, NO checkpoints, kill floor at the base -- fall or die
--      anywhere and you restart at the bottom. Full ToH vocabulary: lava
--      spinners, thin wraparounds into the void, conveyors feeding into
--      wraparounds, moving kill walls, shrinking platforms, and a final
--      near-vertical ladder gauntlet. Every jump is humanly possible
--      (gaps <= 12, rises <= 7); each section's path is described in its
--      comment. The glowing rainbow WIN pad on top: flag game_won,
--      WinGame to all, firework barrage, spinning rainbow crown welded
--      above the winner's head.
--
-- Estimated part count: silo ~45 + tower ~180 = ~225 (limit 1300 combined).

local Players = game:GetService("Players")

local M = {}
local G = nil

local SILO = Vector3.new(-800, 0, 1500)
local TOWER = Vector3.new(0, 0, -1400)
local SEC_H = 34
local LANES = { 0, 18, 0, -18 }
local SUMMIT_Y = 12 + 10 * SEC_H -- 352

local model = nil
local rocketParts = {}  -- { {part, baseCFrame}, ... }
local smoke = nil
local sirenBulbs = {}   -- neon balls that flash during launch
local sirenSound = nil
local launching = false

local towerBaseSpawn = nil -- CFrame: bottom of the tower (deck 1)
local pendingBottom = {}   -- [player] = true -> respawn at tower bottom
local hooked = {}
local lastNote = {}

function M.Init(g)
	G = g
end

--------------------------------------------------------------------
-- helpers
--------------------------------------------------------------------

local function notify(player, text, color)
	if not (player and player.Parent and G and G.Remotes) then return end
	local ev = G.Remotes:FindFirstChild("Notify")
	if ev then
		ev:FireClient(player, text, color or "white")
	end
end

local function notifyT(player, key, seconds, text, color)
	local t = lastNote[player]
	if not t then
		t = {}
		lastNote[player] = t
	end
	local now = os.clock()
	if t[key] and (now - t[key]) < seconds then return end
	t[key] = now
	notify(player, text, color)
end

local function dirOf(s)
	if s % 2 == 1 then return 1 end
	return -1
end

local function yBase(s)
	return 12 + (s - 1) * SEC_H
end

local function laneZ(s)
	return LANES[((s - 1) % 4) + 1]
end

-- tower point: x along the run (-34 start, +34 end; mirrored on even
-- sections), dy above the section base, zo sideways from the lane
local function tp(s, x, dy, zo)
	return TOWER + Vector3.new(dirOf(s) * x, yBase(s) + dy, laneZ(s) + (zo or 0))
end

local function pad(pos, w, d, props)
	props = props or {}
	local thick = props.Thick or 1
	return G.Util.part({
		Name = props.Name or "TowerPad",
		Size = Vector3.new(w, thick, d),
		CFrame = CFrame.new(pos - Vector3.new(0, thick / 2, 0)),
		Color = props.Color or "orange",
		Neon = props.Neon,
		Material = props.Material,
		Transparency = props.Transparency,
		CanCollide = props.CanCollide,
		Parent = model,
	})
end

-- kill on touch; also remembers the victim so they respawn at the bottom
local function makeKill(part)
	part.Touched:Connect(function(hit)
		local char = hit and hit.Parent
		local hum = char and char:FindFirstChildOfClass("Humanoid")
		if hum and hum.Health > 0 then
			local player = Players:GetPlayerFromCharacter(char)
			if player then pendingBottom[player] = true end
			hum.Health = 0
		end
	end)
end

-- multi-arm lava spinner over a platform center
local function lavaSpinner(centerPos, arms, length, speed)
	for k = 0, arms - 1 do
		local arm = G.Util.part({
			Name = "LavaArm",
			Size = Vector3.new(length, 0.5, 1.5),
			CFrame = CFrame.new(centerPos) * CFrame.Angles(0, k * (2 * math.pi / arms), 0),
			Color = "red",
			Neon = true,
			CanCollide = false,
			Parent = model,
		})
		makeKill(arm)
		G.Util.spinner(arm, "Y", speed)
	end
end

-- conveyor belt: anchored, surface velocity along its look vector
local function belt(fromPos, toPos, width, speed, color)
	local mid = (fromPos + toPos) / 2
	local len = (toPos - fromPos).Magnitude
	local b = G.Util.part({
		Name = "Belt",
		Size = Vector3.new(width, 1, len),
		CFrame = CFrame.lookAt(mid - Vector3.new(0, 0.5, 0), toPos - Vector3.new(0, 0.5, 0)),
		Color = color or "gray",
		Material = "DiamondPlate",
		Parent = model,
	})
	b.AssemblyLinearVelocity = b.CFrame.LookVector * speed
	return b
end

-- platform that shrinks away ~1.4s after touch, respawns 3s later
local function shrinkPad(pos, w, d)
	local size0 = Vector3.new(w, 1, d)
	local p = pad(pos, w, d, { Name = "ShrinkPad", Color = "orange", Neon = true })
	local base = p.CFrame
	local busy = false
	p.Touched:Connect(function(hit)
		if busy then return end
		local char = hit and hit.Parent
		if not (char and char:FindFirstChildOfClass("Humanoid")) then return end
		busy = true
		task.spawn(function()
			for i = 1, 8 do
				local k = 1 - i / 9
				p.Size = Vector3.new(size0.X * k, 1, size0.Z * k)
				p.CFrame = base
				task.wait(0.17)
			end
			p.CanCollide = false
			p.Transparency = 1
			task.wait(3)
			p.Size = size0
			p.CFrame = base
			p.CanCollide = true
			p.Transparency = 0
			busy = false
		end)
	end)
	return p
end

local function makeTruss(pos, height, color)
	local t = Instance.new("TrussPart")
	t.Name = "Truss"
	t.Size = Vector3.new(2, height, 2)
	t.CFrame = CFrame.new(pos + Vector3.new(0, height / 2, 0))
	t.Anchored = true
	t.Color = G.Util.color(color or "gray")
	t.Parent = model
	return t
end

local function ownsEtoh(player)
	local ok, has = pcall(G.Economy.HasFlag, player, "bought_etoh")
	if ok and has then return true end
	if G.PlotManager and G.PlotManager.GetPlotOf then
		local plot = G.PlotManager.GetPlotOf(player)
		if plot and plot.purchased and plot.purchased["etoh"] then
			return true
		end
	end
	return false
end

--------------------------------------------------------------------
-- the winner's crown: welded above the head, spins, cycles rainbow
--------------------------------------------------------------------

local function giveCrown(char)
	local head = char and char:FindFirstChild("Head")
	if not head or char:FindFirstChild("VictorCrown") then return end
	local crown = Instance.new("Part")
	crown.Name = "VictorCrown"
	crown.Size = Vector3.new(2.6, 1, 2.6)
	crown.Material = Enum.Material.Neon
	crown.Anchored = false
	crown.CanCollide = false
	crown.Massless = true
	crown.CFrame = head.CFrame * CFrame.new(0, 2.2, 0)
	local weld = Instance.new("Weld")
	weld.Part0 = head
	weld.Part1 = crown
	weld.C0 = CFrame.new(0, 2.2, 0)
	weld.Parent = crown
	crown.Parent = char
	G.Util.label(crown, "ETERNAL CHAMPION", { textColor = "gold", offsetY = 1.8, width = 240 })
	task.spawn(function()
		local t = 0
		while crown.Parent do
			t = t + 0.05
			weld.C0 = CFrame.new(0, 2.2, 0) * CFrame.Angles(0, t * 2.5, 0)
			crown.Color = Color3.fromHSV((t * 0.3) % 1, 1, 1)
			task.wait(0.05)
		end
	end)
end

--------------------------------------------------------------------
-- respawn wiring: any death inside the tower = back to the bottom
--------------------------------------------------------------------

local function hookPlayer(player)
	if hooked[player] then return end
	hooked[player] = true
	player.CharacterAdded:Connect(function(char)
		if pendingBottom[player] and towerBaseSpawn then
			pendingBottom[player] = nil
			task.wait(0.25)
			if char.Parent then
				char:PivotTo(towerBaseSpawn)
			end
		else
			pendingBottom[player] = nil
		end
		local hum = char:WaitForChild("Humanoid", 10)
		if hum then
			hum.Died:Connect(function()
				local hrp = char:FindFirstChild("HumanoidRootPart")
				if hrp then
					local rel = hrp.Position - TOWER
					if math.abs(rel.X) < 65 and math.abs(rel.Z) < 60 and rel.Y > -5 and rel.Y < 420 then
						pendingBottom[player] = true
					end
				end
			end)
		end
	end)
end

--------------------------------------------------------------------
-- (a) THE NUKE SILO
--------------------------------------------------------------------

local function buildSilo(Util)
	-- concrete apron
	pad(SILO + Vector3.new(0, 0.5, 0), 70, 70, { Name = "SiloApron", Color = "gray", Material = "Concrete", Thick = 1 })

	-- perimeter fence with a gate gap on the +X (lobby-facing) side
	local fenceData = {
		{ Vector3.new(0, 5, -45), Vector3.new(94, 10, 2) },              -- back
		{ Vector3.new(0, 5, 45), Vector3.new(94, 10, 2) },               -- front
		{ Vector3.new(-45, 5, 0), Vector3.new(2, 10, 88) },              -- west
		{ Vector3.new(45, 5, -27), Vector3.new(2, 10, 34) },             -- east, south of gap
		{ Vector3.new(45, 5, 27), Vector3.new(2, 10, 34) },              -- east, north of gap
	}
	for _, fd in ipairs(fenceData) do
		Util.part({ Name = "SiloFence", Size = fd[2], CFrame = CFrame.new(SILO + fd[1]),
			Color = "darkred", Material = "DiamondPlate", Transparency = 0.25, Parent = model })
	end
	local gateSign = Util.part({ Name = "SiloGateSign", Size = Vector3.new(12, 4, 0.8),
		CFrame = CFrame.new(SILO + Vector3.new(46, 12, 0)) * CFrame.Angles(0, math.rad(-90), 0),
		Color = "black", Parent = model })
	Util.surfaceText(gateSign, "Front", "!! NUKE SILO !!\nauthorized bosses only", "yellow", "black")
	Util.surfaceText(gateSign, "Back", "!! NUKE SILO !!", "yellow", "black")

	-- THE ROCKET (all parts registered for the launch animation)
	local function rocketPart(props)
		local p = Util.part(props)
		table.insert(rocketParts, { p, p.CFrame })
		return p
	end
	rocketPart({ Name = "RocketBody", Size = Vector3.new(22, 8, 8), Shape = "Cylinder",
		CFrame = CFrame.new(SILO + Vector3.new(0, 15, 0)) * CFrame.Angles(0, 0, math.rad(90)),
		Color = "white", Material = "Metal", Parent = model })
	rocketPart({ Name = "RocketStripe", Size = Vector3.new(2.5, 8.4, 8.4), Shape = "Cylinder",
		CFrame = CFrame.new(SILO + Vector3.new(0, 9, 0)) * CFrame.Angles(0, 0, math.rad(90)),
		Color = "red", Neon = true, Parent = model })
	rocketPart({ Name = "RocketNose", Size = Vector3.new(8, 8, 8), Shape = "Ball",
		CFrame = CFrame.new(SILO + Vector3.new(0, 27, 0)), Color = "red", Material = "Metal", Parent = model })
	rocketPart({ Name = "RocketEngine", Size = Vector3.new(3, 6, 6), Shape = "Cylinder",
		CFrame = CFrame.new(SILO + Vector3.new(0, 2.8, 0)) * CFrame.Angles(0, 0, math.rad(90)),
		Color = "black", Material = "Metal", Parent = model })
	rocketPart({ Name = "RocketWindow", Size = Vector3.new(2, 2, 2), Shape = "Ball",
		CFrame = CFrame.new(SILO + Vector3.new(0, 21, -4)), Color = "lightblue", Neon = true, Parent = model })
	for k = 0, 3 do
		local ang = k * math.pi / 2
		rocketPart({ Name = "RocketFin", Size = Vector3.new(1, 6, 4), Shape = "Wedge",
			CFrame = CFrame.new(SILO + Vector3.new(math.cos(ang) * 5, 6, math.sin(ang) * 5))
				* CFrame.Angles(0, -ang + math.pi / 2, 0),
			Color = "red", Material = "Metal", Parent = model })
	end

	-- smoke emitter at the rocket's base (enabled only during launch)
	local smokePart = Util.part({ Name = "SmokeAnchor", Size = Vector3.new(2, 2, 2),
		CFrame = CFrame.new(SILO + Vector3.new(0, 1.5, 0)), Transparency = 1, CanCollide = false, Parent = model })
	smoke = Instance.new("ParticleEmitter")
	smoke.Color = ColorSequence.new(Color3.fromRGB(200, 200, 200))
	smoke.Size = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 3),
		NumberSequenceKeypoint.new(1, 9),
	})
	smoke.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.2),
		NumberSequenceKeypoint.new(1, 1),
	})
	smoke.Lifetime = NumberRange.new(1.5, 3)
	smoke.Speed = NumberRange.new(15, 30)
	smoke.SpreadAngle = Vector2.new(60, 60)
	smoke.Rate = 120
	smoke.Enabled = false
	smoke.Parent = smokePart

	-- gantry beside the rocket
	Util.part({ Name = "GantryLeg", Size = Vector3.new(2, 34, 2),
		CFrame = CFrame.new(SILO + Vector3.new(-9, 17, -5)), Color = "gray", Material = "Metal", Parent = model })
	Util.part({ Name = "GantryLeg", Size = Vector3.new(2, 34, 2),
		CFrame = CFrame.new(SILO + Vector3.new(-9, 17, 5)), Color = "gray", Material = "Metal", Parent = model })
	for k = 1, 3 do
		Util.part({ Name = "GantryArm", Size = Vector3.new(6, 1.5, 12),
			CFrame = CFrame.new(SILO + Vector3.new(-6, k * 9, 0)), Color = "gray", Material = "Metal", Parent = model })
	end

	-- siren posts at the four corners
	for _, c in ipairs({ { -40, -40 }, { 40, -40 }, { -40, 40 }, { 40, 40 } }) do
		Util.part({ Name = "SirenPost", Size = Vector3.new(1, 12, 1),
			CFrame = CFrame.new(SILO + Vector3.new(c[1], 6, c[2])), Color = "gray", Material = "Metal", Parent = model })
		local bulb = Util.part({ Name = "SirenBulb", Size = Vector3.new(2.5, 2.5, 2.5), Shape = "Ball",
			CFrame = CFrame.new(SILO + Vector3.new(c[1], 13, c[2])), Color = "darkred", Parent = model })
		local light = Instance.new("PointLight")
		light.Color = Color3.fromRGB(255, 40, 40)
		light.Brightness = 8
		light.Range = 40
		light.Enabled = false
		light.Parent = bulb
		table.insert(sirenBulbs, bulb)
	end

	-- siren sound (best effort; if the asset will not load, the flashing
	-- lights alone carry the drama)
	pcall(function()
		sirenSound = Instance.new("Sound")
		sirenSound.Name = "SirenSound"
		sirenSound.SoundId = "rbxassetid://138081500"
		sirenSound.Looped = true
		sirenSound.Volume = 1
		sirenSound.Parent = smokePart
	end)

	-- dramatic launch platform + THE pad (#67). The purchase engine enforces
	-- troll_won + $1T + repeatable and then calls M.LaunchNuke.
	pad(SILO + Vector3.new(24, 4, 0), 16, 16, { Name = "LaunchPlatform", Color = "black", Material = "Slate", Thick = 4 })
	pad(SILO + Vector3.new(33.5, 1.3, 0), 3, 10, { Color = "gray", Material = "Concrete", Thick = 1 })
	pad(SILO + Vector3.new(31.5, 2.6, 0), 3, 10, { Color = "gray", Material = "Concrete", Thick = 1 })
	local ring = Util.part({ Name = "LaunchRing", Size = Vector3.new(0.6, 13, 13), Shape = "Cylinder",
		CFrame = CFrame.new(SILO + Vector3.new(24, 4.1, 0)) * CFrame.Angles(0, 0, math.rad(90)),
		Color = "red", Neon = true, CanCollide = false, Parent = model })
	G.Util.spinner(ring, "X", 0.6)
	local nukePad = Util.part({
		Name = "NukePad",
		Size = Vector3.new(6, 1, 6),
		-- platform top is at y = 4 (pad() puts the 4-thick slab's TOP at 4);
		-- center the 1-thick pad at 4.5 so it rests on the platform.
		CFrame = CFrame.new(SILO + Vector3.new(24, 4.5, 0)),
		Color = "gold",
		Neon = true,
		Parent = model,
	})
	local warn1 = Util.part({ Name = "NukeWarnSign", Size = Vector3.new(10, 5, 0.6),
		CFrame = CFrame.new(SILO + Vector3.new(24, 10, -9)) * CFrame.Angles(0, math.rad(180), 0),
		Color = "black", Parent = model })
	Util.surfaceText(warn1, "Front", "$1T PER LAUNCH\nwipes EVERY other tycoon\n(they keep their savings)", "yellow", "black")
	if G.Purchases and G.Purchases.RegisterSharedPad then
		pcall(G.Purchases.RegisterSharedPad, "nuke", nukePad)
	end
end

--------------------------------------------------------------------
-- LaunchNuke -- called by the purchase engine on every "nuke" purchase.
-- Accepts either the attacking Player or their plot table (the engine
-- passes the plot; we take plot.owner).
--------------------------------------------------------------------

function M.LaunchNuke(_, who)
	local attacker = who
	if typeof(attacker) ~= "Instance" then
		attacker = who and who.owner
	end
	if not (attacker and attacker.Parent) then return end
	pcall(G.Economy.SetFlag, attacker, "nuke_launched")

	if launching then
		-- a launch cinematic is already running; this purchase still nukes
		if G.PlotManager and G.PlotManager.NukeAllExcept then
			task.spawn(G.PlotManager.NukeAllExcept, attacker)
		end
		return
	end
	launching = true

	task.spawn(function()
		-- SIRENS + alert (client handles the screen shake)
		pcall(function()
			G.Remotes.NukeAlert:FireAllClients(attacker.Name)
		end)
		if sirenSound then
			pcall(function() sirenSound:Play() end)
		end
		local flashing = true
		task.spawn(function()
			local on = false
			while flashing do
				on = not on
				for _, bulb in ipairs(sirenBulbs) do
					if on then
						bulb.Material = Enum.Material.Neon
						bulb.Color = G.Util.color("red")
					else
						bulb.Material = Enum.Material.SmoothPlastic
						bulb.Color = G.Util.color("darkred")
					end
					local light = bulb:FindFirstChildOfClass("PointLight")
					if light then light.Enabled = on end
				end
				task.wait(0.35)
			end
		end)

		task.wait(2)

		-- LIFTOFF: ~5 seconds of accelerating climb on a smoke column
		if smoke then smoke.Enabled = true end
		for i = 1, 75 do
			task.wait(0.066)
			local offset = Vector3.new(0, (i * i) * 0.05, 0)
			for _, rp in ipairs(rocketParts) do
				rp[1].CFrame = rp[2] + offset
			end
		end
		if smoke then smoke.Enabled = false end

		-- BOOM: PlotManager fires the explosion visuals at each victim plot,
		-- resets them, and notifies the victims.
		if G.PlotManager and G.PlotManager.NukeAllExcept then
			pcall(G.PlotManager.NukeAllExcept, attacker)
		end
		G.Util.firework(SILO + Vector3.new(0, 60, 0))

		-- quietly wheel a fresh rocket onto the pad
		task.wait(2.5)
		for _, rp in ipairs(rocketParts) do
			rp[1].CFrame = rp[2]
		end
		flashing = false
		if sirenSound then
			pcall(function() sirenSound:Stop() end)
		end
		launching = false
	end)
end

--------------------------------------------------------------------
-- (b) THE ETERNAL TOWER OF HELL
--------------------------------------------------------------------

local function buildTower(Util)
	-- base slab + the kill floor that catches every faller
	pad(TOWER + Vector3.new(0, 0.5, 0), 120, 100, { Name = "TowerBase", Color = "black", Material = "Slate", Thick = 1 })
	local killFloor = pad(TOWER + Vector3.new(0, 1.4, 0), 72, 52, {
		Name = "TowerLava", Color = "red", Neon = true, Transparency = 0.3, CanCollide = false,
	})
	makeKill(killFloor)

	-- perimeter walls (too tall to jump) with the gate gap on the +Z side
	local wallData = {
		{ Vector3.new(0, 10, -48), Vector3.new(114, 20, 2) },
		{ Vector3.new(-55, 10, 0), Vector3.new(2, 20, 98) },
		{ Vector3.new(55, 10, 0), Vector3.new(2, 20, 98) },
		{ Vector3.new(-50.5, 10, 48), Vector3.new(11, 20, 2) },  -- west of gap
		{ Vector3.new(11, 10, 48), Vector3.new(90, 20, 2) },     -- east of gap
	}
	for _, wd in ipairs(wallData) do
		Util.part({ Name = "TowerWall", Size = wd[2], CFrame = CFrame.new(TOWER + wd[1]),
			Color = "black", Material = "Slate", Parent = model })
	end

	-- gate frame + purchase pad (#68) outside it
	Util.part({ Name = "TowerGateColumn", Size = Vector3.new(3, 22, 3),
		CFrame = CFrame.new(TOWER + Vector3.new(-46, 11, 48)), Color = "red", Neon = true, Parent = model })
	Util.part({ Name = "TowerGateColumn", Size = Vector3.new(3, 22, 3),
		CFrame = CFrame.new(TOWER + Vector3.new(-34, 11, 48)), Color = "red", Neon = true, Parent = model })
	local gateBeam = Util.part({ Name = "TowerGateBeam", Size = Vector3.new(15, 3, 3),
		CFrame = CFrame.new(TOWER + Vector3.new(-40, 23.5, 48)), Color = "red", Neon = true, Parent = model })
	Util.label(gateBeam, "ETERNAL TOWER OF HELL -- no checkpoints. no mercy.", { textColor = "red", width = 340 })
	local etohPad = Util.part({
		Name = "EtohPad",
		Size = Vector3.new(6, 1, 6),
		CFrame = CFrame.new(TOWER + Vector3.new(-40, 1.5, 56)),
		Color = "gold",
		Neon = true,
		Parent = model,
	})
	if G.Purchases and G.Purchases.RegisterSharedPad then
		pcall(G.Purchases.RegisterSharedPad, "etoh", etohPad)
	end

	-- decks: the landing slab at the start of each section
	local deckPos = {}
	for s = 1, 10 do
		local zPrev = laneZ(s)
		if s > 1 then zPrev = laneZ(s - 1) end
		local zc = (zPrev + laneZ(s)) / 2
		local depth = math.abs(zPrev - laneZ(s)) + 12
		local pos = TOWER + Vector3.new(dirOf(s) * -40, yBase(s), zc)
		local deck = pad(pos, 12, depth, { Name = "TowerDeck" .. s, Color = "darkred", Material = "Slate", Thick = 2 })
		deckPos[s] = pos
		Util.label(deck, "SECTION " .. s .. " / 10", { textColor = "orange", maxDistance = 100, offsetY = 4 })
	end
	towerBaseSpawn = CFrame.new(deckPos[1] + Vector3.new(0, 4, 0))

	-- entry stairs (walk in along x = -40, safely west of the kill floor)
	pad(TOWER + Vector3.new(-40, 3, 14), 8, 3, { Color = "darkred", Material = "Slate" })
	pad(TOWER + Vector3.new(-40, 6, 10), 8, 3, { Color = "darkred", Material = "Slate" })
	pad(TOWER + Vector3.new(-40, 9, 7), 8, 3, { Color = "darkred", Material = "Slate" })

	----------------------------------------------------------------
	-- SECTION 1 -- warmup. PATH: eight pads, ~8 stud gaps, ~4 stud
	-- rises. The only easy thing the tower will ever give you.
	----------------------------------------------------------------
	for i = 1, 8 do
		pad(tp(1, -26 + (i - 1) * 8, i * 4, ((i % 2 == 0) and 3 or -3)), 4, 4,
			{ Color = "orange", Neon = true })
	end

	----------------------------------------------------------------
	-- SECTION 2 -- lava spinners. PATH: two pads up, cross platform A
	-- (2 arms, 1.5 rad/s) through the gap between arms, jump to platform B
	-- (3 arms, 2.2 rad/s -- keep moving!), then two pads to the deck.
	----------------------------------------------------------------
	pad(tp(2, -26, 4, 0), 4, 4, { Color = "orange", Neon = true })
	pad(tp(2, -18, 8, 0), 4, 4, { Color = "orange", Neon = true })
	pad(tp(2, -6, 14, 0), 14, 14, { Color = "darkred", Material = "Slate" })
	lavaSpinner(tp(2, -6, 15.6, 0), 2, 15, 1.5)
	pad(tp(2, 10, 20, 0), 10, 10, { Color = "darkred", Material = "Slate" })
	lavaSpinner(tp(2, 10, 21.6, 0), 3, 11, 2.2)
	pad(tp(2, 22, 26, 0), 4, 4, { Color = "orange", Neon = true })
	pad(tp(2, 30, 31, 0), 4, 4, { Color = "orange", Neon = true })

	----------------------------------------------------------------
	-- SECTION 3 -- thin wraparounds. PATH: two pads to the core; land the
	-- front ledge (1.8 wide), shimmy to the corner, JUMP AROUND the corner
	-- (void below) onto the side ledge, around the far corner to the back
	-- ledge, drop-jump to the exit pads.
	----------------------------------------------------------------
	pad(tp(3, -26, 5, 0), 4, 4, { Color = "orange", Neon = true })
	pad(tp(3, -18, 10, 0), 4, 4, { Color = "orange", Neon = true })
	Util.part({ Name = "WrapCore", Size = Vector3.new(10, 12, 10),
		CFrame = CFrame.new(tp(3, -2, 19, 0)), Color = "black", Material = "Slate", Parent = model })
	pad(tp(3, -2, 14, -6.5), 14, 1.8, { Color = "orange", Neon = true }) -- front ledge
	pad(tp(3, 4.5, 14, 0), 1.8, 14, { Color = "orange", Neon = true })   -- side ledge
	pad(tp(3, -2, 14, 6.5), 14, 1.8, { Color = "orange", Neon = true })  -- back ledge
	pad(tp(3, 12, 18, 6), 4, 4, { Color = "orange", Neon = true })
	pad(tp(3, 20, 24, 0), 4, 4, { Color = "orange", Neon = true })
	pad(tp(3, 27, 29, 0), 4, 4, { Color = "orange", Neon = true })
	pad(tp(3, 32, 32, 0), 4, 4, { Color = "orange", Neon = true })

	----------------------------------------------------------------
	-- SECTION 4 -- conveyors feeding into wraparounds. PATH: the first belt
	-- runs AGAINST you (sprint it), the second belt shoves you sideways
	-- toward the void while you cross to the wrap ledge -- walk angled
	-- upstream. Wrap the core, exit up the pads.
	----------------------------------------------------------------
	pad(tp(4, -28, 4, 0), 4, 4, { Color = "orange", Neon = true })
	pad(tp(4, -21, 8, 0), 4, 4, { Color = "orange", Neon = true })
	belt(tp(4, -14, 12, 0), tp(4, 0, 12, 0), 5, -12) -- pushes back toward the start
	belt(tp(4, 3, 13, -2), tp(4, 3, 13, 8), 6, 10)   -- shoves you toward the void
	Util.part({ Name = "WrapCore", Size = Vector3.new(8, 10, 8),
		CFrame = CFrame.new(tp(4, 12, 20, 0)), Color = "black", Material = "Slate", Parent = model })
	pad(tp(4, 12, 16, -5.5), 12, 1.8, { Color = "orange", Neon = true })
	pad(tp(4, 17.5, 16, 0), 1.8, 12, { Color = "orange", Neon = true })
	pad(tp(4, 25, 22, 0), 4, 4, { Color = "orange", Neon = true })
	pad(tp(4, 31, 28, 0), 4, 4, { Color = "orange", Neon = true })

	----------------------------------------------------------------
	-- SECTION 5 -- the moving kill wall. PATH: up two pads to the ramp;
	-- the red wall sweeps it end to end every 4s. Step on the moment it
	-- slides away from you, walk right behind it, hop off at the top
	-- before it swings back. Exit pads to the deck.
	----------------------------------------------------------------
	pad(tp(5, -28, 4, 0), 4, 4, { Color = "orange", Neon = true })
	pad(tp(5, -20, 8, 0), 4, 4, { Color = "orange", Neon = true })
	local rampA = tp(5, -12, 12, 0)
	local rampB = tp(5, 12, 20, 0)
	local rampMid = (rampA + rampB) / 2
	Util.part({ Name = "Ramp", Size = Vector3.new(5, 1, (rampB - rampA).Magnitude + 3),
		CFrame = CFrame.lookAt(rampMid - Vector3.new(0, 0.5, 0), rampB - Vector3.new(0, 0.5, 0)),
		Color = "gray", Material = "Slate", Parent = model })
	local wall5 = Util.part({ Name = "KillWall", Size = Vector3.new(5, 7, 1.5),
		CFrame = CFrame.lookAt(rampA + Vector3.new(0, 4, 0), rampB + Vector3.new(0, 4, 0)),
		Color = "red", Neon = true, CanCollide = false, Parent = model })
	makeKill(wall5)
	Util.mover(wall5, rampA + Vector3.new(0, 4, 0), rampB + Vector3.new(0, 4, 0), 4)
	pad(tp(5, 19, 24, 0), 4, 4, { Color = "orange", Neon = true })
	pad(tp(5, 26, 28, 0), 4, 4, { Color = "orange", Neon = true })
	pad(tp(5, 32, 32, 0), 4, 4, { Color = "orange", Neon = true })

	----------------------------------------------------------------
	-- SECTION 6 -- shrinking platforms. PATH: six 6x6 pads; each starts
	-- dissolving ~1.4s after you land. Land, pick your next jump, GO.
	----------------------------------------------------------------
	for i = 1, 6 do
		shrinkPad(tp(6, -24 + (i - 1) * 9.5, i * 5, ((i % 2 == 0) and 4 or -4)), 6, 6)
	end
	pad(tp(6, 31, 32, 0), 4, 4, { Color = "orange", Neon = true })

	----------------------------------------------------------------
	-- SECTION 7 -- spinner + wraparound combo. PATH: ring ledge (1.5 wide)
	-- around the core with TWO arms: a long one at walk height (time it)
	-- and a short counter-spinning one that only reaches the inner half --
	-- hug the OUTER edge of the ledge and keep moving.
	----------------------------------------------------------------
	pad(tp(7, -26, 5, 0), 4, 4, { Color = "orange", Neon = true })
	pad(tp(7, -17, 10, 0), 4, 4, { Color = "orange", Neon = true })
	Util.part({ Name = "WrapCore", Size = Vector3.new(9, 10, 9),
		CFrame = CFrame.new(tp(7, 0, 21, 0)), Color = "black", Material = "Slate", Parent = model })
	pad(tp(7, -6.5, 16, 0), 1.5, 16, { Color = "orange", Neon = true })
	pad(tp(7, 6.5, 16, 0), 1.5, 16, { Color = "orange", Neon = true })
	pad(tp(7, 0, 16, -6.5), 16, 1.5, { Color = "orange", Neon = true })
	pad(tp(7, 0, 16, 6.5), 16, 1.5, { Color = "orange", Neon = true })
	local arm7a = Util.part({ Name = "LavaArm", Size = Vector3.new(17, 0.5, 1.4),
		CFrame = CFrame.new(tp(7, 0, 17.6, 0)), Color = "red", Neon = true, CanCollide = false, Parent = model })
	makeKill(arm7a)
	Util.spinner(arm7a, "Y", 1.6)
	local arm7b = Util.part({ Name = "LavaArm", Size = Vector3.new(9, 0.5, 1.4),
		CFrame = CFrame.new(tp(7, 0, 18.4, 0)) * CFrame.Angles(0, math.pi / 2, 0),
		Color = "red", Neon = true, CanCollide = false, Parent = model })
	makeKill(arm7b)
	Util.spinner(arm7b, "Y", -2.4)
	pad(tp(7, 15, 20, 0), 4, 4, { Color = "orange", Neon = true })
	pad(tp(7, 23, 26, 0), 4, 4, { Color = "orange", Neon = true })
	pad(tp(7, 30, 31, 0), 4, 4, { Color = "orange", Neon = true })

	----------------------------------------------------------------
	-- SECTION 8 -- conveyor into a moving kill wall. PATH: the belt runs
	-- against you at 14 (nearly your walk speed) while the wall sweeps it.
	-- JUMP repeatedly to keep momentum, tuck in behind the wall as it
	-- moves away, ride its wake to the far end.
	----------------------------------------------------------------
	pad(tp(8, -28, 5, 0), 4, 4, { Color = "orange", Neon = true })
	pad(tp(8, -21, 10, 0), 4, 4, { Color = "orange", Neon = true })
	belt(tp(8, -14, 14, 0), tp(8, 12, 14, 0), 6, -14)
	local wall8 = Util.part({ Name = "KillWall", Size = Vector3.new(6, 7, 1.5),
		CFrame = CFrame.lookAt(tp(8, -12, 18, 0), tp(8, 10, 18, 0)),
		Color = "red", Neon = true, CanCollide = false, Parent = model })
	makeKill(wall8)
	Util.mover(wall8, tp(8, -12, 18, 0), tp(8, 10, 18, 0), 4.5)
	pad(tp(8, 18, 19, 0), 4, 4, { Color = "orange", Neon = true })
	pad(tp(8, 25, 25, 0), 4, 4, { Color = "orange", Neon = true })
	pad(tp(8, 31, 30, 0), 4, 4, { Color = "orange", Neon = true })

	----------------------------------------------------------------
	-- SECTION 9 -- the leap of faith row. PATH: eight TINY pads (2x2),
	-- each hop 8 studs along, a 4-stud sideways weave and a 4-stud rise
	-- (~7-stud edge gaps -- at the hard edge of a default jump, but
	-- landable with a running start). Line up every jump before you take
	-- it. Falling here, at section NINE, with no checkpoints... the
	-- tower thanks you for your visit.
	----------------------------------------------------------------
	for i = 1, 8 do
		pad(tp(9, -26 + (i - 1) * 8, i * 4, ((i % 2 == 0) and 2 or -2)), 2, 2,
			{ Color = "orange", Neon = true })
	end
	pad(tp(9, 32, 32, 0), 4, 4, { Color = "orange", Neon = true })

	----------------------------------------------------------------
	-- SECTION 10 -- the final ladder gauntlet. PATH: pads lead to the truss
	-- base. Two red arms orbit the truss at different heights and speeds;
	-- the rest ledges sit OUTSIDE their reach. Climb to a ledge, wait for
	-- the arm above to sweep past, climb through its plane fast, repeat.
	-- The truss tops out exactly at the summit.
	----------------------------------------------------------------
	pad(tp(10, -26, 4, 0), 4, 4, { Color = "orange", Neon = true })
	pad(tp(10, -16, 7, 0), 4, 4, { Color = "orange", Neon = true })
	pad(tp(10, -6, 8, 0), 4, 4, { Color = "orange", Neon = true })
	pad(tp(10, 4, 8, 3), 4, 4, { Color = "orange", Neon = true })
	pad(tp(10, 14, 8, 6), 4, 4, { Color = "orange", Neon = true })
	pad(tp(10, 22, 8, 6), 4, 4, { Color = "orange", Neon = true })
	local finalTruss = makeTruss(tp(10, 24, 8, 6) + Vector3.new(0, 0, 0), 26, "gold")
	pad(tp(10, 30, 17, 6), 3, 3, { Color = "orange", Neon = true }) -- rest ledge 1
	pad(tp(10, 30, 25, 6), 3, 3, { Color = "orange", Neon = true }) -- rest ledge 2
	for k = 0, 1 do
		local arm = Util.part({ Name = "LavaArm", Size = Vector3.new(9, 0.5, 1.2),
			CFrame = CFrame.new(tp(10, 24, 16 + k * 8, 6)) * CFrame.Angles(0, k * math.pi, 0),
			Color = "red", Neon = true, CanCollide = false, Parent = model })
		makeKill(arm)
		Util.spinner(arm, "Y", 2 - k * 3.5)
	end

	----------------------------------------------------------------
	-- THE SUMMIT
	----------------------------------------------------------------
	pad(TOWER + Vector3.new(-18, SUMMIT_Y, 4), 48, 32, { Name = "Summit", Color = "black", Material = "Slate", Thick = 2 })
	local winPad = pad(TOWER + Vector3.new(-18, SUMMIT_Y + 0.8, 4), 8, 8, {
		Name = "WinPad", Color = "rainbow", Neon = true, Thick = 0.8,
	})
	Util.label(winPad, "THE END OF EVERYTHING -- TOUCH TO WIN", { textColor = "gold", width = 320, offsetY = 4 })
	local glow = Instance.new("PointLight")
	glow.Brightness = 6
	glow.Range = 30
	glow.Parent = winPad
	task.spawn(function()
		local t = 0
		while winPad.Parent do
			t = t + 0.08
			local c = Color3.fromHSV(t % 1, 1, 1)
			winPad.Color = c
			glow.Color = c
			task.wait(0.08)
		end
	end)

	Util.touchOnce(winPad, 10, function(player, char)
		pcall(G.Economy.SetFlag, player, "game_won")
		pendingBottom[player] = nil -- champions do not restart at the bottom
		pcall(function()
			G.Remotes.WinGame:FireAllClients(player.Name)
		end)
		pcall(function()
			G.Remotes.Notify:FireAllClients(
				player.Name .. " CONQUERED THE ETERNAL TOWER OF HELL AND WON THE GAME!", "green")
		end)
		giveCrown(char)
		task.spawn(function()
			for i = 1, 16 do
				Util.firework(winPad.Position + Vector3.new(math.random(-22, 22), math.random(6, 28), math.random(-18, 18)))
				task.wait(0.3)
			end
		end)
	end)
end

--------------------------------------------------------------------
-- Build
--------------------------------------------------------------------

function M.Build(g)
	G = g or G
	local Util = G.Util
	model = Util.model("Endgame", workspace)

	buildSilo(Util)
	buildTower(Util)

	-- player hooks (deaths inside the tower restart at the bottom)
	Players.PlayerAdded:Connect(hookPlayer)
	for _, p in ipairs(Players:GetPlayers()) do
		hookPlayer(p)
	end
	Players.PlayerRemoving:Connect(function(p)
		pendingBottom[p] = nil
		hooked[p] = nil
		lastNote[p] = nil
	end)

	-- gate watchdog: the tower gate only admits players whose plot bought
	-- "etoh" (checked live so a nuke-reset owner still gets in via flags)
	task.spawn(function()
		while true do
			task.wait(0.3)
			for _, player in ipairs(Players:GetPlayers()) do
				local char = player.Character
				local hrp = char and char:FindFirstChild("HumanoidRootPart")
				if hrp then
					local rel = hrp.Position - TOWER
					if rel.Y > -2 and rel.Y < 24
						and rel.X > -47 and rel.X < -33
						and rel.Z > 40 and rel.Z < 50 then
						if not ownsEtoh(player) then
							hrp.CFrame = CFrame.new(TOWER + Vector3.new(-40, 4, 58))
							notifyT(player, "etohgate", 3, "Buy the Eternal Tower of Hell pad to enter!", "red")
						end
					end
				end
			end
		end
	end)
end

return M
