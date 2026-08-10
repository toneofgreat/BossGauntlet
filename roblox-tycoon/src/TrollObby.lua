-- TrollObby.lua -- Boss Tycoon (troll agent)
-- The shared TROLL TOWER at (800, 0, 1500). Built ONCE by Main via TrollObby.Build(G).
-- Entry gate only lets through players whose plot purchased "troll_obby"
-- (purchase pad registered via Purchases.RegisterSharedPad).
--
-- LAYOUT: a 16-floor vertical zigzag tower. Odd floors run WEST->EAST (+X),
-- even floors run EAST->WEST. Each floor climbs 20 studs across its run and
-- lands on a "deck" (the start platform of the next floor). Lanes shift in Z
-- every floor so fallers mostly miss the pads below and hit the LAVA kill
-- floor at the base -> death -> respawn at their last CHECKPOINT
-- (checkpoint decks: 1, 5, 9, 13 -- one per ~4-5 floors, per contract).
--
-- TROLL VOCABULARY USED:
--  * FAKE pads:   Transparency 0 but CanCollide FALSE (you fall through).
--  * REAL pads:   Transparency 1, CanCollide TRUE, with a faint sparkle
--                 ParticleEmitter as the SUBTLE tell.
--  * Vanish pads: solid, hide 0.4s after touch, respawn 3s later.
--  * Wrong-way arrows (floors 3 and 13 -- the arrows ALWAYS lie).
--  * Fake FINISH pad on floor 6 -> teleports you down 2 floors + "lol".
--  * Fling trusses (touch = Velocity 120 into the sky).
--  * Spinner + wraparound combos, moving platforms, tiny pads.
--  * Top of first half: the FAKE RESET button (does nothing, opens half 2).
--  * Top of tower: the smacking sign, the REAL reset button
--    (Economy.WipeProgress!) and the nearly-invisible hint + glass win pad
--    that sets flag "troll_won" (which unlocks the NUKE).
--
-- THE GENUINE PATH is described in a comment at the top of every floor block.
-- Estimated part count: ~280 (limit 900).

local Players = game:GetService("Players")

local M = {}
local G = nil

local CENTER = Vector3.new(800, 0, 1500)
local FLOOR_H = 20
local LANES = { 0, 14, 0, -14 }   -- Z lane per floor, cycles every 4 floors
local TOP_Y = 8 + 16 * FLOOR_H    -- 328: top-deck surface height

local model = nil
local deckPos = {}       -- [f] = Vector3, top-center of deck f
local checkpoints = {}   -- [player] = CFrame to respawn at
local pendingRespawn = {}-- [player] = true when they died inside the tower
local hooked = {}        -- [player] = true once CharacterAdded is wired
local lastNote = {}      -- [player] = { [key] = os.clock() } notify throttle

function M.Init(g)
	G = g
end

--------------------------------------------------------------------
-- small helpers
--------------------------------------------------------------------

local function notify(player, text, color)
	if not (player and player.Parent and G and G.Remotes) then return end
	local ev = G.Remotes:FindFirstChild("Notify")
	if ev then
		ev:FireClient(player, text, color or "white")
	end
end

-- throttled notify (per player per message key)
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

-- floor helpers -----------------------------------------------------

local function dirOf(f)
	if f % 2 == 1 then return 1 end
	return -1
end

local function yBase(f)
	return 8 + (f - 1) * FLOOR_H
end

local function laneZ(f)
	return LANES[((f - 1) % 4) + 1]
end

-- fp: floor point. x is the position ALONG the run (-30 = start, +30 = end,
-- mirrored automatically on even floors), dy is height above the floor's
-- base, zo is a sideways offset from the floor's lane.
local function fp(f, x, dy, zo)
	return CENTER + Vector3.new(dirOf(f) * x, yBase(f) + dy, laneZ(f) + (zo or 0))
end

-- pad: part whose TOP surface is at pos.y
local function pad(pos, w, d, props)
	props = props or {}
	local thick = props.Thick or 1
	return G.Util.part({
		Name = props.Name or "TrollPad",
		Size = Vector3.new(w, thick, d),
		CFrame = CFrame.new(pos - Vector3.new(0, thick / 2, 0)),
		Color = props.Color or "purple",
		Neon = props.Neon,
		Material = props.Material,
		Transparency = props.Transparency,
		CanCollide = props.CanCollide,
		Parent = model,
	})
end

local function sparkle(part, rate)
	local pe = Instance.new("ParticleEmitter")
	pe.Rate = rate or 2
	pe.Lifetime = NumberRange.new(0.5, 1.1)
	pe.Speed = NumberRange.new(0.5, 1.5)
	pe.Size = NumberSequence.new(0.18)
	pe.Transparency = NumberSequence.new(0.55)
	pe.LightEmission = 1
	pe.Color = ColorSequence.new(Color3.fromRGB(255, 255, 190))
	pe.Parent = part
	return pe
end

-- a REAL but invisible pad; the faint sparkles are the subtle tell
local function invisPad(f, x, dy, zo, w, d, rate)
	local p = pad(fp(f, x, dy, zo), w or 5, d or 5, { Name = "RealPad", Transparency = 1 })
	sparkle(p, rate or 2.5)
	return p
end

-- a FAKE pad: looks perfectly solid, is not
local function fakePad(f, x, dy, zo, w, d, color)
	return pad(fp(f, x, dy, zo), w or 5, d or 5, {
		Name = "FakePad", Color = color or "purple", Neon = true, CanCollide = false,
	})
end

-- a normal honest pad
local function visPad(f, x, dy, zo, w, d, color)
	return pad(fp(f, x, dy, zo), w or 4, d or 4, { Color = color or "purple", Neon = true })
end

-- vanishes 0.4s after touch, respawns 3s later
local function vanishPad(f, x, dy, zo, w, d, color)
	local p = pad(fp(f, x, dy, zo), w or 3.5, d or 3.5, { Name = "VanishPad", Color = color or "cyan", Neon = true })
	local active = true
	p.Touched:Connect(function(hit)
		if not active then return end
		local char = hit and hit.Parent
		if not (char and char:FindFirstChildOfClass("Humanoid")) then return end
		active = false
		task.delay(0.4, function()
			p.Transparency = 1
			p.CanCollide = false
			task.delay(3, function()
				p.Transparency = 0
				p.CanCollide = true
				active = true
			end)
		end)
	end)
	return p
end

-- kill on touch, and remember the victim so CharacterAdded sends them back
-- to their checkpoint
local function makeKill(part)
	part.Touched:Connect(function(hit)
		local char = hit and hit.Parent
		local hum = char and char:FindFirstChildOfClass("Humanoid")
		if hum and hum.Health > 0 then
			local player = Players:GetPlayerFromCharacter(char)
			if player then pendingRespawn[player] = true end
			hum.Health = 0
		end
	end)
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

-- touch = get launched. wheee.
local function makeFling(part, power)
	part.Touched:Connect(function(hit)
		local char = hit and hit.Parent
		local hum = char and char:FindFirstChildOfClass("Humanoid")
		local hrp = char and char:FindFirstChild("HumanoidRootPart")
		if hum and hrp and hum.Health > 0 then
			hrp.AssemblyLinearVelocity = Vector3.new(math.random(-40, 40), power or 120, math.random(-40, 40))
			local player = Players:GetPlayerFromCharacter(char)
			if player then
				notifyT(player, "fling", 2, "WHEEE!", "yellow")
			end
		end
	end)
end

-- a lying golden arrow sign
local function arrowSign(pos, yaw, text)
	local board = G.Util.part({
		Name = "ArrowSign",
		Size = Vector3.new(7, 3, 0.6),
		CFrame = CFrame.new(pos) * CFrame.Angles(0, yaw or 0, 0),
		Color = "gold",
		Parent = model,
	})
	G.Util.surfaceText(board, "Front", text, "black", "gold")
	G.Util.surfaceText(board, "Back", text, "black", "gold")
	return board
end

local function ownsTroll(player)
	local ok, has = pcall(G.Economy.HasFlag, player, "bought_troll_obby")
	if ok and has then return true end
	if G.PlotManager and G.PlotManager.GetPlotOf then
		local plot = G.PlotManager.GetPlotOf(player)
		if plot and plot.purchased and plot.purchased["troll_obby"] then
			return true
		end
	end
	return false
end

local function hasHalf2(player)
	local ok, has = pcall(G.Economy.HasFlag, player, "troll_half2")
	return ok and has == true
end

--------------------------------------------------------------------
-- per-player respawn wiring (checkpoints, like UpperFloors does)
--------------------------------------------------------------------

local function hookPlayer(player)
	if hooked[player] then return end
	hooked[player] = true
	player.CharacterAdded:Connect(function(char)
		-- died inside the tower + has a checkpoint -> respawn there
		if pendingRespawn[player] and checkpoints[player] then
			pendingRespawn[player] = nil
			local cp = checkpoints[player]
			task.wait(0.25)
			if char.Parent then
				char:PivotTo(cp)
			end
		else
			pendingRespawn[player] = nil
		end
		local hum = char:WaitForChild("Humanoid", 10)
		if hum then
			hum.Died:Connect(function()
				local hrp = char:FindFirstChild("HumanoidRootPart")
				if hrp then
					local rel = hrp.Position - CENTER
					if math.abs(rel.X) < 70 and math.abs(rel.Z) < 70 and rel.Y > -5 and rel.Y < 420 then
						pendingRespawn[player] = true
					end
				end
			end)
		end
	end)
end

--------------------------------------------------------------------
-- Build
--------------------------------------------------------------------

function M.Build(g)
	G = g or G
	local Util = G.Util
	model = Util.model("TrollObby", workspace)

	----------------------------------------------------------------
	-- BASE: lava kill floor + entry gate + purchase pad + stairs
	----------------------------------------------------------------

	-- glowing lava pool under the whole tower: fall anywhere = back to checkpoint
	local lava = pad(CENTER + Vector3.new(0, 0.6, 0), 84, 60, {
		Name = "TrollLava", Color = "red", Neon = true, Transparency = 0.35, CanCollide = false,
	})
	makeKill(lava)

	-- 4 corner spine columns so the tower reads as a tower from far away
	for _, c in ipairs({ { -40, -28 }, { 40, -28 }, { -40, 28 }, { 40, 28 } }) do
		Util.part({
			Name = "TowerSpine",
			Size = Vector3.new(3, TOP_Y + 12, 3),
			CFrame = CFrame.new(CENTER + Vector3.new(c[1], (TOP_Y + 12) / 2, c[2])),
			Color = "purple",
			Material = "Slate",
			Parent = model,
		})
	end

	-- entry gate (west side, facing the world)
	local gateL = Util.part({ Name = "GateColumn", Size = Vector3.new(3, 16, 3),
		CFrame = CFrame.new(CENTER + Vector3.new(-52, 8, -9)), Color = "purple", Neon = true, Parent = model })
	Util.part({ Name = "GateColumn", Size = Vector3.new(3, 16, 3),
		CFrame = CFrame.new(CENTER + Vector3.new(-52, 8, 9)), Color = "purple", Neon = true, Parent = model })
	local beam = Util.part({ Name = "GateBeam", Size = Vector3.new(3, 3, 21),
		CFrame = CFrame.new(CENTER + Vector3.new(-52, 17.5, 0)), Color = "gold", Neon = true, Parent = model })
	Util.label(beam, "TROLL OBBY -- 100% fair, trust us :)", { textColor = "gold", width = 320 })
	local rules = Util.part({ Name = "GateSign", Size = Vector3.new(8, 5, 0.6),
		CFrame = CFrame.new(CENTER + Vector3.new(-52, 6, -16)) * CFrame.Angles(0, math.rad(-90), 0),
		Color = "black", Parent = model })
	Util.surfaceText(rules, "Front", "RULES:\n1. the arrows always help\n2. every pad is real\n3. we never lie", "white", "black")

	-- the shared purchase pad (#66) -- the purchase engine wires the touch
	local buyPad = Util.part({
		Name = "TrollObbyPad",
		Size = Vector3.new(6, 1, 6),
		CFrame = CFrame.new(CENTER + Vector3.new(-60, 1.5, 0)),
		Color = "gold",
		Neon = true,
		Parent = model,
	})
	if G.Purchases and G.Purchases.RegisterSharedPad then
		pcall(G.Purchases.RegisterSharedPad, "troll_obby", buyPad)
	end

	-- entry stairs up to deck 1
	pad(CENTER + Vector3.new(-49, 2.5, 0), 3, 8, { Color = "purple" })
	pad(CENTER + Vector3.new(-46, 5, 0), 3, 8, { Color = "purple" })
	pad(CENTER + Vector3.new(-43, 7.5, 0), 3, 8, { Color = "purple" })

	----------------------------------------------------------------
	-- DECKS (landing platforms; deck f = start of floor f)
	----------------------------------------------------------------

	for f = 1, 16 do
		local zPrev = laneZ(f)
		if f > 1 then zPrev = laneZ(f - 1) end
		local zc = (zPrev + laneZ(f)) / 2
		local depth = math.abs(zPrev - laneZ(f)) + 12
		local pos = CENTER + Vector3.new(dirOf(f) * -36, yBase(f), zc)
		local deck = pad(pos, 12, depth, { Name = "Deck" .. f, Color = "darkgreen", Material = "SmoothPlastic", Thick = 2 })
		deckPos[f] = pos
		Util.label(deck, "FLOOR " .. f, { textColor = "white", maxDistance = 90, offsetY = 4 })
	end

	-- checkpoint pads on decks 1, 5, 9, 13
	for _, f in ipairs({ 1, 5, 9, 13 }) do
		local pos = deckPos[f] + Vector3.new(0, 1, 0)
		local cp = pad(pos, 4, 4, { Name = "Checkpoint", Color = "green", Neon = true, Thick = 0.6 })
		Util.label(cp, "CHECKPOINT", { textColor = "green", maxDistance = 90 })
		local cpCF = CFrame.new(pos + Vector3.new(0, 3, 0))
		Util.touchOnce(cp, 2, function(player)
			local old = checkpoints[player]
			checkpoints[player] = cpCF
			if not old or (old.Position - cpCF.Position).Magnitude > 1 then
				notify(player, "Checkpoint saved! (floor " .. f .. ")", "green")
			end
		end)
	end

	----------------------------------------------------------------
	-- FIRST HALF, floors 1-8
	----------------------------------------------------------------

	-- FLOOR 1 -- REAL PATH: the shiny purple pads are FAKE (you fall through).
	-- The real pads are invisible, 6 studs to the -Z side of each fake one,
	-- marked by faint sparkles. Hop the sparkle trail.
	arrowSign(fp(1, -30, 5, -10), math.rad(90), "step on the\nPURPLE pads!")
	for i, s in ipairs({ { -22, 3 }, { -10, 7 }, { 2, 11 }, { 14, 15 }, { 26, 18 } }) do
		fakePad(1, s[1], s[2], 0, 5, 5)
		invisPad(1, s[1], s[2], -6, 5, 5, 3)
	end

	-- FLOOR 2 -- REAL PATH: all 7 pads are real but each VANISHES 0.4s after
	-- you land on it. Never stop moving; if one is missing, wait 3s.
	for i = 1, 7 do
		vanishPad(2, -24 + (i - 1) * 8, i * 2.5, ((i % 2 == 0) and 2 or -2), 3.5, 3.5)
	end

	-- FLOOR 3 -- REAL PATH: two honest pads, then the fork. The golden arrow
	-- points to the +Z branch: THOSE PADS ARE FAKE. Take the -Z branch.
	visPad(3, -24, 3, 0)
	visPad(3, -16, 6, 0)
	arrowSign(fp(3, -10, 10, 0), 0, "WINNERS GO\nTHIS WAY -->")
	for _, s in ipairs({ { -6, 8 }, { 2, 11 }, { 10, 14 }, { 18, 17 } }) do
		fakePad(3, s[1], s[2], 9, 4.5, 4.5)          -- the advertised (fake) branch
		visPad(3, s[1], s[2], -9, 4.5, 4.5)          -- the real branch
	end
	visPad(3, 26, 18.5, 0)

	-- FLOOR 4 -- REAL PATH: hop onto the thin ring ledge around the core block
	-- and walk AROUND it (either side); the red arm sweeps chest height at
	-- ~1 rev / 5.7s, so move when it is on the far side. Exit off the far edge.
	visPad(4, -24, 4, 0)
	visPad(4, -14, 9, 0)
	Util.part({ Name = "Core", Size = Vector3.new(12, 12, 12),
		CFrame = CFrame.new(fp(4, 0, 17.5, 0)), Color = "black", Material = "Slate", Parent = model })
	pad(fp(4, -7.5, 12, 0), 2, 18, { Color = "purple", Neon = true })
	pad(fp(4, 7.5, 12, 0), 2, 18, { Color = "purple", Neon = true })
	pad(fp(4, 0, 12, -7.5), 18, 2, { Color = "purple", Neon = true })
	pad(fp(4, 0, 12, 7.5), 18, 2, { Color = "purple", Neon = true })
	local arm4 = Util.part({ Name = "LavaArm", Size = Vector3.new(26, 0.5, 1.6),
		CFrame = CFrame.new(fp(4, 0, 13.6, 0)), Color = "red", Neon = true, CanCollide = false, Parent = model })
	makeKill(arm4)
	Util.spinner(arm4, "Y", 1.1)
	visPad(4, 16, 15, 0)
	visPad(4, 24, 18, 0)

	-- FLOOR 5 -- REAL PATH: two trusses lead to the high shelf. The -Z truss
	-- FLINGS you into orbit; the +Z truss (faint sparkles at its base) is safe.
	-- Climb it, cross the shelf, hop down the exit pads. Checkpoint deck here.
	visPad(5, -24, 4, 0)
	visPad(5, -17, 6, 0)
	local trap5 = makeTruss(fp(5, -8, 6, -5), 12, "gold")
	makeFling(trap5, 120)
	local real5 = makeTruss(fp(5, -8, 6, 5), 12, "gold")
	sparkle(real5, 2)
	pad(fp(5, 0, 18, 0), 10, 12, { Color = "purple" })
	visPad(5, 12, 18.5, 0)
	visPad(5, 22, 19, 0)

	-- FLOOR 6 -- REAL PATH: honest pads lead to a giant rainbow FINISH pad.
	-- IT IS A LIE: touching it teleports you down 2 floors (deck 4) with "lol".
	-- The real route: invisible sparkle pads DETOUR at +11 studs Z around the
	-- finish pad, rejoining at the far visible pad.
	visPad(6, -24, 3, 0)
	visPad(6, -16, 6, 0)
	visPad(6, -8, 9, 0)
	local fin = pad(fp(6, 2, 12, 0), 12, 12, { Name = "FakeFinish", Color = "rainbow", Neon = true })
	Util.label(fin, "FINISH!!! (totally real)", { textColor = "gold", width = 260 })
	Util.touchOnce(fin, 2, function(player, char)
		local target = deckPos[4] or (CENTER + Vector3.new(0, 8, 0))
		char:PivotTo(CFrame.new(target + Vector3.new(0, 4, 0)))
		notify(player, "lol", "yellow")
	end)
	invisPad(6, -2, 10, 11, 4.5, 4.5, 2.5)
	invisPad(6, 6, 12, 11, 4.5, 4.5, 2.5)
	invisPad(6, 14, 14, 11, 4.5, 4.5, 2.5)
	invisPad(6, 19, 15, 5, 4.5, 4.5, 2.5) -- bridge the diagonal back to the exit
	visPad(6, 22, 17, 0)

	-- FLOOR 7 -- REAL PATH: alternating vanish pads (visible cyan) and
	-- invisible sparkle pads. The purple pads floating +6 Z are FAKE bait.
	vanishPad(7, -24, 3, 0)
	invisPad(7, -16, 6, 0)
	fakePad(7, -16, 6, 6)
	vanishPad(7, -8, 9, 0)
	invisPad(7, 0, 12, 0)
	fakePad(7, 0, 12, 6)
	vanishPad(7, 8, 15, 0)
	invisPad(7, 16, 17, 0)
	vanishPad(7, 24, 19, 0)

	-- FLOOR 8 -- REAL PATH: ride the two sliding platforms across the big
	-- gaps; hop off at each far end. Then the FAKE RESET deck awaits...
	visPad(8, -26, 3, 0)
	local mvA = pad(fp(8, -18, 6, 0), 5, 5, { Color = "orange", Neon = true })
	Util.mover(mvA, fp(8, -18, 6, 0) - Vector3.new(0, 0.5, 0), fp(8, -2, 10, 0) - Vector3.new(0, 0.5, 0), 6)
	visPad(8, 4, 11, 0)
	local mvB = pad(fp(8, 10, 13, 0), 5, 5, { Color = "orange", Neon = true })
	Util.mover(mvB, fp(8, 10, 13, 0) - Vector3.new(0, 0.5, 0), fp(8, 24, 18, 0) - Vector3.new(0, 0.5, 0), 5)

	----------------------------------------------------------------
	-- TOP OF FIRST HALF: the FAKE RESET button + the second-half door
	----------------------------------------------------------------

	-- annex platform west of deck 9
	pad(CENTER + Vector3.new(-50, yBase(9), -7), 16, 20, { Name = "FakeResetAnnex", Color = "darkred", Thick = 2 })
	local fakePed = pad(CENTER + Vector3.new(-52, yBase(9) + 1, -7), 9, 9, { Color = "black", Material = "Slate" })
	local fakeBtn = Util.part({
		Name = "FakeResetButton",
		Size = Vector3.new(1.4, 6, 6),
		Shape = "Cylinder",
		CFrame = CFrame.new(CENTER + Vector3.new(-52, yBase(9) + 1.7, -7)) * CFrame.Angles(0, 0, math.rad(90)),
		Color = "red",
		Neon = true,
		Parent = model,
	})
	local fakeSign = Util.part({ Name = "FakeResetSign", Size = Vector3.new(10, 5, 0.6),
		CFrame = CFrame.new(CENTER + Vector3.new(-57, yBase(9) + 7, -7)) * CFrame.Angles(0, math.rad(-90), 0),
		Color = "darkred", Parent = model })
	Util.surfaceText(fakeSign, "Front", "!!! DANGER !!!\nif you touch me you reset\nALL of your progress", "white", "darkred")
	Util.touchOnce(fakeBtn, 3, function(player)
		if hasHalf2(player) then
			notify(player, "lol", "yellow")
		else
			pcall(G.Economy.SetFlag, player, "troll_half2")
			notify(player, "lol. nothing happened. ...but the obby continues", "yellow")
			Util.firework(fakeBtn.Position + Vector3.new(0, 5, 0))
		end
	end)

	-- the second-half door: a red energy field across the start of floor 9.
	-- CanCollide false; the watchdog loop bounces anyone without troll_half2.
	local door2 = Util.part({
		Name = "SecondHalfDoor",
		Size = Vector3.new(1.5, 16, 26),
		CFrame = CFrame.new(CENTER + Vector3.new(-28, yBase(9) + 8, -7)),
		Color = "red",
		Neon = true,
		Transparency = 0.55,
		CanCollide = false,
		Parent = model,
	})
	Util.label(door2, "SECOND HALF -- press the big red button to open (wink)", { textColor = "red", width = 300 })

	----------------------------------------------------------------
	-- SECOND HALF, floors 9-16 (harder!)
	----------------------------------------------------------------

	-- FLOOR 9 -- REAL PATH: an invisible bridge grid, 7 columns of 3 slots
	-- (Z -7 / 0 / +7). The solid route is slots: mid, left, left, mid, right,
	-- right, mid. Sparkles are FAINTER here (rate 1). Purple pads are bait.
	local route9 = { 2, 1, 1, 2, 3, 3, 2 }
	local slots9 = { -7, 0, 7 }
	local dys9 = { 3, 6, 9, 12, 14, 16, 18 }
	for i = 1, 7 do
		local x = -24 + (i - 1) * 8
		invisPad(9, x, dys9[i], slots9[route9[i]], 4.5, 4.5, 1)
		local baitSlot = (route9[i] % 3) + 1
		fakePad(9, x, dys9[i], slots9[baitSlot], 4.5, 4.5, "pink")
	end

	-- FLOOR 10 -- REAL PATH: like floor 4 but meaner: thinner ring, THREE red
	-- arms at 2.2 rad/s. Sprint around the core in the gap between arms.
	visPad(10, -24, 4, 0)
	visPad(10, -15, 8, 0)
	Util.part({ Name = "Core", Size = Vector3.new(10, 10, 10),
		CFrame = CFrame.new(fp(10, 0, 17.5, 0)), Color = "black", Material = "Slate", Parent = model })
	pad(fp(10, -6.5, 13, 0), 1.8, 16, { Color = "pink", Neon = true })
	pad(fp(10, 6.5, 13, 0), 1.8, 16, { Color = "pink", Neon = true })
	pad(fp(10, 0, 13, -6.5), 16, 1.8, { Color = "pink", Neon = true })
	pad(fp(10, 0, 13, 6.5), 16, 1.8, { Color = "pink", Neon = true })
	for k = 0, 2 do
		local arm = Util.part({ Name = "LavaArm", Size = Vector3.new(24, 0.5, 1.4),
			CFrame = CFrame.new(fp(10, 0, 14.5, 0)) * CFrame.Angles(0, k * 2.0944, 0),
			Color = "red", Neon = true, CanCollide = false, Parent = model })
		makeKill(arm)
		Util.spinner(arm, "Y", 2.2)
	end
	visPad(10, 15, 16, 0)
	visPad(10, 24, 18, 0)

	-- FLOOR 11 -- REAL PATH: a vanish-pad sprint. Pads are tiny (2.5) with
	-- 8-stud gaps. Chain your jumps; hesitating = falling.
	for i = 1, 7 do
		vanishPad(11, -24 + (i - 1) * 8, i * 2.5, ((i % 2 == 0) and 3 or -3), 2.5, 2.5, "cyan")
	end

	-- FLOOR 12 -- REAL PATH: of the three trusses only the MIDDLE (sparkly)
	-- one is safe -- the others fling. Climb to the shelf, then cross the
	-- bridge TIMED with the sweeping red wall: step on just as it slides away,
	-- follow right behind it, hop off before it swings back.
	visPad(12, -26, 3, 0)
	local trapA = makeTruss(fp(12, -18, 2, -6), 10, "gold")
	makeFling(trapA, 120)
	local realT = makeTruss(fp(12, -18, 2, 0), 10, "gold")
	sparkle(realT, 2)
	local trapB = makeTruss(fp(12, -18, 2, 6), 10, "gold")
	makeFling(trapB, 120)
	pad(fp(12, -12, 12, 0), 8, 8, { Color = "purple" })
	pad(fp(12, 2, 12, 0), 22, 5, { Name = "Bridge", Color = "gray", Material = "Slate" })
	local wall12 = Util.part({ Name = "KillWall", Size = Vector3.new(1.5, 8, 6),
		CFrame = CFrame.new(fp(12, -7, 16, 0)), Color = "red", Neon = true, CanCollide = false, Parent = model })
	makeKill(wall12)
	Util.mover(wall12, fp(12, -7, 16, 0), fp(12, 11, 16, 0), 4)
	visPad(12, 18, 15, 0)
	visPad(12, 26, 18, 0)

	-- FLOOR 13 -- REAL PATH: three forks; every arrow LIES. Real sides in
	-- order: -Z, +Z, -Z (all real pads have very faint sparkles, rate 1.5).
	-- Checkpoint deck here.
	local forks = {
		{ x1 = -20, x2 = -14, dy1 = 4, dy2 = 6, real = -8, text = "SHORTCUT -->" },
		{ x1 = -4, x2 = 2, dy1 = 9, dy2 = 11, real = 8, text = "<-- DEFINITELY\nTHIS WAY" },
		{ x1 = 12, x2 = 18, dy1 = 14, dy2 = 16, real = -8, text = "TRUST ME -->" },
	}
	for _, fk in ipairs(forks) do
		local fakeSide = -fk.real
		local a = visPad(13, fk.x1, fk.dy1, fk.real, 4, 4, "purple")
		sparkle(a, 1.5)
		local b = visPad(13, fk.x2, fk.dy2, fk.real, 4, 4, "purple")
		sparkle(b, 1.5)
		fakePad(13, fk.x1, fk.dy1, fakeSide, 4, 4)
		fakePad(13, fk.x2, fk.dy2, fakeSide, 4, 4)
		arrowSign(fp(13, fk.x1 - 4, fk.dy1 + 5, 0), 0, fk.text)
	end
	visPad(13, 26, 18, 0)

	-- FLOOR 14 -- REAL PATH: seven TINY pads (1.8 wide), 8-stud gaps with a
	-- gentle sideways weave (edge gaps ~7 studs at +3 rise -- hard but within
	-- a default jump). Odd ones are visible; even ones are INVISIBLE with
	-- sparkles. Aim carefully.
	for i = 1, 7 do
		local x = -25 + (i - 1) * 8
		if i % 2 == 1 then
			visPad(14, x, i * 3, ((i % 4 == 1) and -2 or 2), 1.8, 1.8, "pink")
		else
			invisPad(14, x, i * 3, ((i % 4 == 2) and 2 or -2), 1.8, 1.8, 1.5)
		end
	end

	-- FLOOR 15 -- REAL PATH: a ring of six VANISH pads circles the pillar with
	-- a red arm sweeping it. Enter at the west pad, hop clockwise fast (each
	-- pad dies 0.4s after you land), exit off the east pad.
	visPad(15, -26, 3, 0)
	visPad(15, -18, 6, 0)
	visPad(15, -13, 9, 0)
	Util.part({ Name = "Pillar", Size = Vector3.new(4, 10, 4),
		CFrame = CFrame.new(fp(15, 0, 16, 0)), Color = "black", Material = "Slate", Parent = model })
	for k = 0, 5 do
		local ang = k * math.pi / 3
		vanishPad(15, math.cos(ang) * 8, 12, math.sin(ang) * 8, 3.5, 3.5, "cyan")
	end
	local arm15 = Util.part({ Name = "LavaArm", Size = Vector3.new(21, 0.5, 1.4),
		CFrame = CFrame.new(fp(15, 0, 13.6, 0)), Color = "red", Neon = true, CanCollide = false, Parent = model })
	makeKill(arm15)
	Util.spinner(arm15, "Y", 1.8)
	visPad(15, 14, 15, 0)
	visPad(15, 22, 18, 0)

	-- FLOOR 16 -- REAL PATH: pads lead to the hop pad, then the FINAL LADDER:
	-- a tall truss with two red arms orbiting it. Rest on the side ledges
	-- (they sit OUTSIDE the arms' reach), climb past each arm right after it
	-- sweeps by. The truss tops out exactly at the summit deck. No traps here
	-- -- the tower saves those for the summit itself...
	visPad(16, -24, 3, 0)
	visPad(16, -16, 6, 0)
	visPad(16, -8, 8, 0)
	visPad(16, -2, 8, -7, 4, 4)
	local ladder = makeTruss(fp(16, 2, 4, -13), 16, "gold")
	sparkle(ladder, 2)
	pad(fp(16, 8, 9, -13), 3, 3, { Color = "purple", Neon = true })   -- rest ledge 1
	pad(fp(16, 8, 15, -13), 3, 3, { Color = "purple", Neon = true })  -- rest ledge 2
	for k = 0, 1 do
		local arm = Util.part({ Name = "LavaArm", Size = Vector3.new(9, 0.5, 1.2),
			CFrame = CFrame.new(fp(16, 2, 8.5 + k * 6, -13)) * CFrame.Angles(0, k * math.pi, 0),
			Color = "red", Neon = true, CanCollide = false, Parent = model })
		makeKill(arm)
		Util.spinner(arm, "Y", 1.6 - k * 3.2) -- one clockwise, one counter
	end

	----------------------------------------------------------------
	-- SUMMIT DECK: smack sign -> REAL reset button -> secret glass win pad
	----------------------------------------------------------------

	local topDeck = pad(CENTER + Vector3.new(-10, TOP_Y, -9), 52, 30, {
		Name = "SummitDeck", Color = "black", Material = "Slate", Thick = 2,
	})

	-- THE SIGN. It reads like an apology. It is a weapon.
	local pole = Util.part({ Name = "SignPole", Size = Vector3.new(1, 9, 1),
		CFrame = CFrame.new(CENTER + Vector3.new(-26, TOP_Y + 4.5, -9)), Color = "brown", Material = "Wood", Parent = model })
	local signBoard = Util.part({ Name = "SmackSign", Size = Vector3.new(9, 4, 0.8),
		CFrame = CFrame.new(CENTER + Vector3.new(-26, TOP_Y + 8, -9)) * CFrame.Angles(0, math.rad(90), 0),
		Color = "white", Parent = model })
	local signBase = signBoard.CFrame
	Util.surfaceText(signBoard, "Front", "lol that was\njust another troll", "black", "white")
	Util.surfaceText(signBoard, "Back", "lol that was\njust another troll", "black", "white")
	local signPos = pole.Position

	local function swingSign()
		task.spawn(function()
			for i = 1, 6 do
				signBoard.CFrame = signBase * CFrame.Angles(0, math.rad(i * 28), 0)
				task.wait(0.03)
			end
			task.wait(0.12)
			for i = 5, 0, -1 do
				signBoard.CFrame = signBase * CFrame.Angles(0, math.rad(i * 28), 0)
				task.wait(0.04)
			end
			signBoard.CFrame = signBase
		end)
	end

	-- THE REAL RESET BUTTON (bigger, redder) + its warning sign
	pad(CENTER + Vector3.new(0, TOP_Y + 1, -9), 10, 10, { Color = "black", Material = "Slate" })
	local realBtn = Util.part({
		Name = "RealResetButton",
		Size = Vector3.new(1.8, 8, 8),
		Shape = "Cylinder",
		CFrame = CFrame.new(CENTER + Vector3.new(0, TOP_Y + 1.9, -9)) * CFrame.Angles(0, 0, math.rad(90)),
		Color = "darkred",
		Neon = true,
		Parent = model,
	})
	local realSign = Util.part({ Name = "RealResetSign", Size = Vector3.new(11, 6, 0.6),
		CFrame = CFrame.new(CENTER + Vector3.new(0, TOP_Y + 8.5, -3)) * CFrame.Angles(0, math.rad(180), 0),
		Color = "darkred", Parent = model })
	Util.surfaceText(realSign, "Front", "!!! FINAL WARNING !!!\nif you touch me you lose\nALL of your progress\nFOR REAL", "white", "darkred")
	Util.surfaceText(realSign, "Back", "we are not\njoking this time", "white", "darkred")
	Util.touchOnce(realBtn, 5, function(player, char)
		pcall(G.Economy.WipeProgress, player)
		checkpoints[player] = nil
		notify(player, "you really did just lose everything.", "red")
		task.delay(1.5, function()
			if char.Parent then
				char:PivotTo(CFrame.new(0, 6, 0)) -- back to the lobby, empty-handed
			end
		end)
	end)

	-- the 99%-invisible hint, floating 3 studs beside the button
	local hintAnchor = Util.part({ Name = "HintAnchor", Size = Vector3.new(0.5, 0.5, 0.5),
		CFrame = CFrame.new(CENTER + Vector3.new(0, TOP_Y + 4, -14)),
		Transparency = 1, CanCollide = false, Parent = model })
	local hintBB = Instance.new("BillboardGui")
	hintBB.Name = "PsstHint"
	hintBB.Adornee = hintAnchor
	hintBB.Size = UDim2.new(0, 260, 0, 50)
	hintBB.AlwaysOnTop = false
	hintBB.MaxDistance = 40
	local hintText = Instance.new("TextLabel")
	hintText.Size = UDim2.new(1, 0, 1, 0)
	hintText.BackgroundTransparency = 1
	hintText.Font = Enum.Font.FredokaOne
	hintText.TextScaled = true
	hintText.TextColor3 = Color3.fromRGB(255, 255, 255)
	hintText.TextTransparency = 0.99 -- squint. SQUINT.
	hintText.Text = "psst... the tiny glass pad behind the button = win for free"
	hintText.Parent = hintBB
	hintBB.Parent = hintAnchor

	-- the tiny glass WIN pad hiding behind the button
	local winPad = Util.part({
		Name = "TrollWinPad",
		Size = Vector3.new(2, 0.5, 2),
		CFrame = CFrame.new(CENTER + Vector3.new(7, TOP_Y + 0.25, -9)),
		Color = "lightblue",
		Material = "Glass",
		Transparency = 0.5,
		Parent = model,
	})
	Util.touchOnce(winPad, 3, function(player)
		local ok, had = pcall(G.Economy.HasFlag, player, "troll_won")
		pcall(G.Economy.SetFlag, player, "troll_won")
		checkpoints[player] = nil -- done with the tower; die normally now
		if ok and had then
			notify(player, "still a winner. the silo remembers you.", "green")
		else
			notify(player, "YOU BEAT THE TROLL OBBY! The nuke silo is now yours.", "green")
			for i = 1, 4 do
				task.delay(i * 0.3, function()
					Util.firework(winPad.Position + Vector3.new(math.random(-8, 8), 8, math.random(-8, 8)))
				end)
			end
		end
	end)

	-- mercy exit
	local leavePad = pad(CENTER + Vector3.new(12, TOP_Y + 1, -18), 4, 4, { Color = "blue", Neon = true, Thick = 0.6 })
	Util.label(leavePad, "Back to Spawn", { textColor = "lightblue" })
	Util.touchOnce(leavePad, 2, function(player, char)
		checkpoints[player] = nil
		char:PivotTo(CFrame.new(0, 6, 0))
	end)

	----------------------------------------------------------------
	-- player hooks + the tower watchdog loop
	----------------------------------------------------------------

	Players.PlayerAdded:Connect(hookPlayer)
	for _, p in ipairs(Players:GetPlayers()) do
		hookPlayer(p)
	end
	local still = {} -- [player] = {pos, t} for the smacking-sign watchdog
	Players.PlayerRemoving:Connect(function(p)
		checkpoints[p] = nil
		pendingRespawn[p] = nil
		hooked[p] = nil
		lastNote[p] = nil
		still[p] = nil
	end)

	-- One loop handles: (1) the entry gate (no purchase = no entry),
	-- (2) the second-half door (no troll_half2 = bounced back),
	-- (3) the smacking sign (stand still 3s within 15 studs = BONK).
	task.spawn(function()
		while true do
			task.wait(0.3)
			for _, player in ipairs(Players:GetPlayers()) do
				local char = player.Character
				local hrp = char and char:FindFirstChild("HumanoidRootPart")
				if hrp then
					local rel = hrp.Position - CENTER

					-- (1) ground-level gate: inside the tower footprint without
					-- the troll_obby purchase -> escorted out
					if rel.Y > -2 and rel.Y < 24 and rel.X > -44 and rel.X < 46 and math.abs(rel.Z) < 32 then
						if not ownsTroll(player) then
							hrp.CFrame = CFrame.new(CENTER + Vector3.new(-58, 4, 0))
							notifyT(player, "gate", 3, "Buy the Troll Obby pad to enter!", "red")
						end
					end

					-- (2) second-half door plane
					if rel.Y > yBase(9) - 2 and rel.Y < yBase(9) + 16
						and rel.X > -31 and rel.X < -25
						and rel.Z > -21 and rel.Z < 7 then
						if not hasHalf2(player) then
							hrp.CFrame = CFrame.new(CENTER + Vector3.new(-40, yBase(9) + 3, -7))
							notifyT(player, "door2", 3, "The door is sealed. Maybe press the big red button?", "red")
						end
					end

					-- (3) the sign that smacks loiterers
					if (hrp.Position - signPos).Magnitude <= 15 then
						local w = still[player]
						if (not w) or (hrp.Position - w.pos).Magnitude > 1 then
							still[player] = { pos = hrp.Position, t = os.clock() }
						elseif os.clock() - w.t >= 3 then
							still[player] = { pos = hrp.Position, t = os.clock() }
							swingSign()
							local flat = hrp.Position - signPos
							flat = Vector3.new(flat.X, 0, flat.Z)
							if flat.Magnitude < 0.5 then
								flat = Vector3.new(1, 0, 0)
							else
								flat = flat.Unit
							end
							hrp.AssemblyLinearVelocity = flat * 120 + Vector3.new(0, 60, 0)
							notify(player, "BONK", "red")
						end
					else
						still[player] = nil
					end
				end
			end
		end
	end)
end

return M
