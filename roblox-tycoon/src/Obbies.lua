-- Obbies.lua — four per-plot vertical climb obbies in the back zone (plot-local z 45..200)
-- Easy (green, summit y~41) / Medium (yellow, y~61) / Hard (orange-red, y~80) / Intense (black-red, y~100)
-- Genre: VERTICAL, win at the top. Lava spinners, thin wraparound ledges, conveyor jumps,
-- moving platforms (Util.mover), kill bricks. NO puzzles.
-- Every jump: horizontal center steps <= ~7 studs, height steps <= 3.5 studs (well inside
-- the 12-gap / 7-rise human limits). Falls land on grass — walk back to the archway.
-- All parts go under a Model inside plot.itemsFolder (wiped on nuke/reset, rebuilt on reclaim).

local O = {}

function O.Init(g)
	O.G = g
end

-- ========================= shared helpers =========================

local function killOnTouch(part)
	part.Touched:Connect(function(hit)
		local h = hit.Parent and hit.Parent:FindFirstChildOfClass("Humanoid")
		if h and h.Health > 0 then
			h.Health = 0
		end
	end)
end

-- flat platform (y is the CENTER of a 1-thick slab; top = y + 0.5)
local function plat(G, plot, parent, x, y, z, w, d, color, neon)
	return G.Util.part({
		Name = "ObbyPlatform",
		Size = Vector3.new(w, 1, d),
		CFrame = plot:cf(x, y, z),
		Color = color,
		Material = neon and "Neon" or "SmoothPlastic",
		Parent = parent,
	})
end

-- red neon kill brick laid flat on a platform top (y = platform top surface)
local function killTile(G, plot, parent, x, yTop, z, w, d)
	local t = G.Util.part({
		Name = "KillBrick",
		Size = Vector3.new(w, 0.4, d),
		CFrame = plot:cf(x, yTop + 0.2, z),
		Color = "red",
		Neon = true,
		Parent = parent,
	})
	killOnTouch(t)
	return t
end

-- spinning lava blade (kills, does not block) centered on the given plot-local point
local function lavaSpinner(G, plot, parent, x, y, z, length, speed)
	local blade = G.Util.part({
		Name = "LavaSpinner",
		Size = Vector3.new(length, 0.9, 1.8),
		CFrame = plot:cf(x, y, z),
		Color = "red",
		Neon = true,
		CanCollide = false,
		Parent = parent,
	})
	killOnTouch(blade)
	G.Util.spinner(blade, "Y", speed)
	return blade
end

-- ping-pong moving platform between two plot-local points
local function moverPlat(G, plot, parent, x1, y1, z1, x2, y2, z2, w, d, period, color)
	local a = plot:cf(x1, y1, z1)
	local b = plot:cf(x2, y2, z2)
	local p = G.Util.part({
		Name = "MovingPlatform",
		Size = Vector3.new(w, 1, d),
		CFrame = a,
		Color = color,
		Material = "SmoothPlastic",
		Parent = parent,
	})
	G.Util.mover(p, a, b, period)
	return p
end

-- thin ledge wrapped around a tower: placed on a circle of radius r about (cx, cz),
-- at angle aDeg, rotated so its long axis runs along the tangent (wraparound style)
local function towerLedge(G, plot, parent, cx, cz, r, aDeg, y, w, d, color)
	local a = math.rad(aDeg)
	local px = cx + math.cos(a) * r
	local pz = cz + math.sin(a) * r
	return G.Util.part({
		Name = "WrapLedge",
		Size = Vector3.new(w, 0.8, d),
		CFrame = plot:cf(px, y, pz) * CFrame.Angles(0, -a - math.pi / 2, 0),
		Color = color,
		Parent = parent,
	})
end

-- labeled entry archway on the ground at plot-local (x, z)
local function archway(G, plot, parent, x, z, text, pillarColor, trimColor)
	local U = G.Util
	U.part({ Name = "ArchPillarL", Size = Vector3.new(2, 12, 2), CFrame = plot:cf(x - 6, 6, z), Color = pillarColor, Parent = parent })
	U.part({ Name = "ArchPillarR", Size = Vector3.new(2, 12, 2), CFrame = plot:cf(x + 6, 6, z), Color = pillarColor, Parent = parent })
	local beam = U.part({ Name = "ArchBeam", Size = Vector3.new(14, 2, 2), CFrame = plot:cf(x, 13, z), Color = trimColor, Neon = true, Parent = parent })
	U.label(beam, text)
	return beam
end

-- glowing finish pad: pays Balance.ObbyRewards[key] to WHOEVER finishes (10s debounce),
-- fireworks, then teleports the finisher back to the plot front. yBase = base center height.
local function finishPad(G, plot, parent, x, yBase, z, key, obbyName, padColor)
	local U = G.Util
	U.part({
		Name = "FinishBase",
		Size = Vector3.new(9, 0.6, 9),
		CFrame = plot:cf(x, yBase, z),
		Color = "white",
		Parent = parent,
	})
	local pad = U.part({
		Name = "FinishPad_" .. key,
		Size = Vector3.new(7, 0.6, 7),
		CFrame = plot:cf(x, yBase + 0.6, z),
		Color = padColor,
		Neon = true,
		Parent = parent,
	})
	local light = Instance.new("PointLight")
	light.Color = Color3.fromRGB(255, 255, 255)
	light.Range = 16
	light.Brightness = 2
	light.Parent = pad
	local pe = Instance.new("ParticleEmitter")
	pe.Rate = 8
	pe.Speed = NumberRange.new(3, 6)
	pe.Lifetime = NumberRange.new(0.8, 1.4)
	pe.SpreadAngle = Vector2.new(25, 25)
	pe.LightEmission = 1
	pe.Parent = pad
	local reward = (G.Balance.ObbyRewards and G.Balance.ObbyRewards[key]) or 0
	U.label(pad, "FINISH — " .. U.fmt(reward))
	U.touchOnce(pad, 10, function(player, character)
		G.Economy.Add(player, reward)
		G.Remotes.Notify:FireClient(player, obbyName .. " complete! +" .. U.fmt(reward), "green")
		U.firework(pad.Position)
		local root = character:FindFirstChild("HumanoidRootPart")
		if root then
			root.CFrame = plot:cf(0, 6, -55) -- back to the plot front
		end
	end)
	return pad
end

-- ========================= EASY (green, z 45..90, summit y 41) =========================
-- ~20 chunky 8x8 platforms, gentle 2-stud rises, one fun sliding platform, NO hazards.

function O.BuildEasy(G, plot)
	local U = G.Util
	local m = U.model("Obby_Easy", plot.itemsFolder)
	local reward = (G.Balance.ObbyRewards and G.Balance.ObbyRewards.easy) or 0
	archway(G, plot, m, 0, 47, "EASY OBBY — climb to the top! Prize: " .. U.fmt(reward), "darkgreen", "green")

	local xs = { 0, 6, 12, 6, 0, -6, -12, -6 }
	for i = 1, 18 do
		if i ~= 13 then -- slot 13 is the sliding platform ride
			local x = xs[((i - 1) % 8) + 1]
			local w = 8
			local color = (i % 2 == 0) and "green" or "darkgreen"
			if i == 9 then -- wide white rest stop halfway up
				w = 12
				color = "white"
			end
			plat(G, plot, m, x, 2 + i * 2, 52 + i * 1.7, w, 8, color)
		end
	end
	-- sliding ride bridging slot 13 (between the x=6 and x=-6 platforms)
	moverPlat(G, plot, m, -8, 28, 74.1, 8, 28, 74.1, 6, 6, 4, "lightblue")

	-- summit + flag + finish
	plat(G, plot, m, 0, 41, 93, 14, 12, "white")
	U.part({ Name = "FlagPole", Size = Vector3.new(0.4, 6, 0.4), CFrame = plot:cf(5.5, 44.5, 97), Color = "gray", Material = "Metal", Parent = m })
	U.part({ Name = "Flag", Size = Vector3.new(3, 2, 0.2), CFrame = plot:cf(3.8, 46.4, 97), Color = "green", Neon = true, CanCollide = false, Parent = m })
	finishPad(G, plot, m, 0, 41.8, 93, "easy", "Easy Obby", "gold")
end

-- ========================= MEDIUM (yellow, z 90..131, summit y 61) =========================
-- ~30 tighter 6x6 / 5x5 platforms, 3 lava spinners on white rest pads, one conveyor jump.

function O.BuildMedium(G, plot)
	local U = G.Util
	local m = U.model("Obby_Medium", plot.itemsFolder)
	local reward = (G.Balance.ObbyRewards and G.Balance.ObbyRewards.medium) or 0
	archway(G, plot, m, 0, 92, "MEDIUM OBBY — spinners ahead! Prize: " .. U.fmt(reward), "gold", "yellow")

	-- section A: 12-platform zigzag up to y ~28
	local xsA = { 0, 7, 14, 7, 0, -7, -14, -7, 0, 7, 14, 7 }
	for i = 1, 12 do
		local w = 6
		local color = (i % 2 == 0) and "yellow" or "gold"
		if i == 6 then
			w = 10
			color = "white"
		end
		plat(G, plot, m, xsA[i], 2 + i * 2.2, 96 + i * 1.4, w, 6, color)
	end
	-- lava spinner sweeping the first rest pad (i = 6: x -7, top y 15.7)
	lavaSpinner(G, plot, m, -7, 16.9, 104.4, 11, 1.4)

	-- conveyor jump: hop on at the east end, ride west, leap off to the landing
	G.ItemsCore.MakeConveyor(G, m, plot:cf(-3, 29.6, 116) * CFrame.Angles(0, math.pi / 2, 0), 16, 4, 10, "yellow")
	plat(G, plot, m, -15, 33, 118.5, 6, 6, "gold")

	-- section B: 10 tighter platforms with two more spinner rest pads at the turnarounds
	local xsB = { -9, -3, 3, 9, 15, 9, 3, -3, -9, -3 }
	for i = 1, 10 do
		local w = 5
		local color = (i % 2 == 0) and "yellow" or "gold"
		if i == 5 or i == 9 then
			w = 9
			color = "white"
		end
		plat(G, plot, m, xsB[i], 33 + i * 2.4, 118 + i * 0.9, w, 5, color)
	end
	lavaSpinner(G, plot, m, 15, 46.9, 122.5, 11, -1.8) -- i=5 pad (top 45.7)
	lavaSpinner(G, plot, m, -9, 56.5, 126.1, 11, 2.2) -- i=9 pad (top 55.3)

	-- summit
	plat(G, plot, m, 0, 61, 132, 12, 10, "white")
	finishPad(G, plot, m, 0, 61.8, 132, "medium", "Medium Obby", "gold")
end

-- ========================= HARD (orange-red, z 130..166, summit y 80) =========================
-- ~40 pieces: 5x5 zigzag with kill bricks, then a tall tower with 20 thin wraparound
-- ledges jutting into the void, swept by 3 full-length lava spinner blades.

function O.BuildHard(G, plot)
	local U = G.Util
	local m = U.model("Obby_Hard", plot.itemsFolder)
	local reward = (G.Balance.ObbyRewards and G.Balance.ObbyRewards.hard) or 0
	archway(G, plot, m, 0, 132, "HARD OBBY — the spinning tower! Prize: " .. U.fmt(reward), "darkred", "orange")

	-- section A: 10-platform zigzag with kill-brick traps on the wide pads
	local xsA = { 0, 6, 12, 6, 0, -6, -12, -6, 0, 6 }
	for i = 1, 10 do
		local w = 5
		local color = (i % 2 == 0) and "orange" or "darkred"
		if i == 5 or i == 9 then
			w = (i == 5) and 9 or 8
			color = "white"
		end
		plat(G, plot, m, xsA[i], 2 + i * 2.5, 136 + i * 1.2, w, w, color)
	end
	-- kill bricks: land on the EDGES of the white pads
	killTile(G, plot, m, 2.8, 15, 144.8, 2.5, 2.5) -- i=5 pad corner (top y 15)
	killTile(G, plot, m, -2.8, 15, 139.2, 2.5, 2.5) -- i=5 pad opposite corner
	killTile(G, plot, m, 0, 25, 146.8, 2.2, 2.2) -- dead center of i=9 pad (top y 25)

	-- transition hop onto the tower ring
	plat(G, plot, m, 0, 29.5, 151.5, 4, 4, "orange")

	-- the tower: dark column, y 20 -> 79.5
	U.part({ Name = "HardTower", Size = Vector3.new(10, 59.5, 10), CFrame = plot:cf(0, 49.75, 157), Color = "darkred", Material = "Slate", Parent = m })

	-- 20 thin wraparound ledges spiraling the column (radius 8, 45° steps, +2.2 per hop)
	for i = 0, 19 do
		local color = (i % 2 == 0) and "orange" or "gold"
		towerLedge(G, plot, m, 0, 157, 8, -90 + i * 45, 31 + i * 2.2, 4.5, 2.8, color)
	end
	-- 3 lava spinner blades threaded through the ledge ring
	lavaSpinner(G, plot, m, 0, 38, 157, 22, 1.2)
	lavaSpinner(G, plot, m, 0, 52, 157, 22, -1.6)
	lavaSpinner(G, plot, m, 0, 66, 157, 22, 2.0)

	-- final steps off the last ledge (y 72.8 at the +X/+Z corner) up to the roof
	plat(G, plot, m, 8.5, 75, 165, 3.5, 3.5, "gold")
	plat(G, plot, m, 7.5, 78, 160, 3.5, 3.5, "gold")

	-- summit on the tower top + torches
	plat(G, plot, m, 0, 80, 157, 12, 12, "white")
	U.part({ Name = "TorchL", Size = Vector3.new(1, 4, 1), CFrame = plot:cf(-5, 82.5, 152), Color = "orange", Neon = true, Parent = m })
	U.part({ Name = "TorchR", Size = Vector3.new(1, 4, 1), CFrame = plot:cf(5, 82.5, 152), Color = "orange", Neon = true, Parent = m })
	finishPad(G, plot, m, 0, 80.8, 157, "hard", "Hard Obby", "orange")
end

-- ========================= INTENSE (black-red, z 165..200, summit y 100) =========================
-- ~50 pieces of pain: tiny 4x4 platforms with center kill bricks, a conveyor-into-the-void
-- gauntlet with a sliding platform, then a fast-spinner wraparound tower to y 100.

function O.BuildIntense(G, plot)
	local U = G.Util
	local m = U.model("Obby_Intense", plot.itemsFolder)
	local reward = (G.Balance.ObbyRewards and G.Balance.ObbyRewards.intense) or 0
	archway(G, plot, m, 0, 167, "INTENSE OBBY — only legends finish. Prize: " .. U.fmt(reward), "black", "red")

	-- section A: 10 tiny platforms; two are 6x6 with a kill brick DEAD CENTER (land on the rim)
	local xsA = { 0, 6.5, 13, 6.5, 0, -6.5, -13, -6.5, 0, 6.5 }
	for i = 1, 10 do
		local w = 4
		local color = (i % 2 == 0) and "black" or "darkred"
		if i == 4 or i == 8 then
			w = 6
			color = "gray"
		end
		plat(G, plot, m, xsA[i], 2 + i * 2.6, 170 + i, w, w, color)
	end
	killTile(G, plot, m, 6.5, 12.9, 174, 2, 2) -- i=4 pad center (top y 12.9)
	killTile(G, plot, m, -6.5, 23.3, 178, 2, 2) -- i=8 pad center (top y 23.3)

	-- section B: conveyor gauntlet
	-- belt 1 carries you WEST — jump off the end before the void
	G.ItemsCore.MakeConveyor(G, m, plot:cf(0, 29.4, 181) * CFrame.Angles(0, math.pi / 2, 0), 16, 4, 12, "darkred")
	plat(G, plot, m, -12.5, 32.5, 183.5, 4, 4, "black")
	-- sliding platform ferry
	moverPlat(G, plot, m, -5, 35.5, 184.5, 5, 35.5, 184.5, 5, 5, 3, "white")
	plat(G, plot, m, 11.5, 38.5, 184.5, 4, 4, "darkred")
	-- belt 2 pushes you EAST into the void — fight it all the way west
	G.ItemsCore.MakeConveyor(G, m, plot:cf(2, 41.5, 181) * CFrame.Angles(0, -math.pi / 2, 0), 16, 3.5, 8, "darkred")
	plat(G, plot, m, -11, 44.5, 184, 4, 4, "black")
	plat(G, plot, m, -9, 46, 188, 3.5, 3.5, "gray")

	-- section C: the black tower, ground to y 99.5, with red warning stripes
	U.part({ Name = "IntenseTower", Size = Vector3.new(9, 99.5, 9), CFrame = plot:cf(0, 49.75, 192), Color = "black", Material = "Slate", Parent = m })
	U.part({ Name = "TowerStripeL", Size = Vector3.new(0.6, 99.5, 0.3), CFrame = plot:cf(-3.5, 49.75, 187.2), Color = "red", Neon = true, CanCollide = false, Parent = m })
	U.part({ Name = "TowerStripeR", Size = Vector3.new(0.6, 99.5, 0.3), CFrame = plot:cf(3.5, 49.75, 187.2), Color = "red", Neon = true, CanCollide = false, Parent = m })

	-- 18 razor-thin wraparound ledges (radius 7, 45° steps, +2.6 per hop), 3 FAST blades
	for i = 0, 17 do
		local color = (i % 2 == 0) and "darkred" or "gray"
		towerLedge(G, plot, m, 0, 192, 7, 180 + i * 45, 48.5 + i * 2.6, 4, 2.2, color)
	end
	lavaSpinner(G, plot, m, 0, 57, 192, 20, 2.4)
	lavaSpinner(G, plot, m, 0, 71, 192, 20, -2.8)
	lavaSpinner(G, plot, m, 0, 85, 192, 20, 3.2)

	-- final steps off the last ledge (y 92.7 at the -X/-Z corner)
	plat(G, plot, m, -8, 95, 185.5, 3, 3, "gray")
	plat(G, plot, m, -8.5, 97.5, 190, 3, 3, "gray")

	-- summit: champion platform, victory beacon, rainbow finish
	plat(G, plot, m, 0, 100, 192, 11, 11, "white")
	U.part({ Name = "VictoryBeacon", Size = Vector3.new(1, 30, 1), CFrame = plot:cf(0, 116, 192), Color = "red", Neon = true, CanCollide = false, Transparency = 0.4, Parent = m })
	local crown = U.part({ Name = "ChampionSign", Size = Vector3.new(4, 0.5, 4), CFrame = plot:cf(4, 100.8, 196), Color = "gold", Neon = true, Parent = m })
	U.label(crown, "INTENSE CHAMPION!")
	finishPad(G, plot, m, 0, 100.8, 192, "intense", "Intense Obby", "rainbow")
end

return O
