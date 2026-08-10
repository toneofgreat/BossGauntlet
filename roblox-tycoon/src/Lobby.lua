-- Lobby.lua -- ground, plaza, spawn, welcome sign, direction signs, decorations.
-- Contract: ground 3000x3000 grass with top at y=0, 120x120 stone plaza at origin,
-- SpawnLocation, BOSS TYCOON sign, direction signs to the 5 plots + Eternal Tower.

local M = {}
local G = nil

function M.Init(g)
	G = g
end

--------------------------------------------------------------------
-- decoration helpers
--------------------------------------------------------------------

local function makeTree(U, parent, x, z, scale)
	scale = scale or 1
	local trunkH = 9 * scale
	U.part({
		Name = "TreeTrunk",
		Shape = "Cylinder",
		Size = Vector3.new(trunkH, 2.2 * scale, 2.2 * scale),
		CFrame = CFrame.new(x, trunkH / 2, z) * CFrame.Angles(0, 0, math.pi / 2),
		Color = "brown",
		Material = "Wood",
		Parent = parent,
	})
	local leafColors = { "green", "darkgreen", "green" }
	local offsets = {
		Vector3.new(0, trunkH + 2.2 * scale, 0),
		Vector3.new(2.4 * scale, trunkH + 0.6 * scale, 1.2 * scale),
		Vector3.new(-2.2 * scale, trunkH + 1 * scale, -1.6 * scale),
	}
	for i = 1, 3 do
		U.part({
			Name = "TreeLeaves",
			Shape = "Ball",
			Size = Vector3.new(6.5, 6.5, 6.5) * scale,
			CFrame = CFrame.new(Vector3.new(x, 0, z) + offsets[i]),
			Color = leafColors[i],
			Material = "Grass",
			CanCollide = false,
			Parent = parent,
		})
	end
end

local function makeLampPost(U, parent, x, z)
	U.part({
		Name = "LampPole",
		Size = Vector3.new(0.8, 11, 0.8),
		CFrame = CFrame.new(x, 5.5, z),
		Color = "black",
		Material = "Metal",
		Parent = parent,
	})
	local bulb = U.part({
		Name = "LampBulb",
		Shape = "Ball",
		Size = Vector3.new(2.4, 2.4, 2.4),
		CFrame = CFrame.new(x, 12, z),
		Color = "gold",
		Neon = true,
		CanCollide = false,
		Parent = parent,
	})
	local light = Instance.new("PointLight")
	light.Color = U.Colors.gold
	light.Brightness = 1.5
	light.Range = 26
	light.Parent = bulb
end

-- Sign post + double-sided board + chevron arrow pointing along dir.
local function makeDirectionSign(U, parent, pos, dir, text, colorName)
	local look = CFrame.new(pos, pos + dir)
	U.part({
		Name = "SignPost",
		Size = Vector3.new(0.9, 7, 0.9),
		CFrame = CFrame.new(pos.X, 3.5, pos.Z),
		Color = "brown",
		Material = "Wood",
		Parent = parent,
	})
	local board = U.part({
		Name = "SignBoard",
		Size = Vector3.new(11, 3, 0.6),
		CFrame = CFrame.new(pos.X, 6.2, pos.Z) * (look - look.Position),
		Color = colorName,
		Material = "SmoothPlastic",
		Parent = parent,
	})
	U.surfaceText(board, "Front", text, "white")
	U.surfaceText(board, "Back", text, "white")
	-- neon chevron ">" above the board, pointing outward along dir
	local tipPos = Vector3.new(pos.X, 8.4, pos.Z)
	local base = CFrame.new(tipPos, tipPos + dir)
	U.part({
		Name = "ArrowL",
		Size = Vector3.new(0.5, 0.5, 3),
		CFrame = base * CFrame.Angles(0, math.rad(35), 0) * CFrame.new(0, 0, -1.1),
		Color = colorName,
		Neon = true,
		CanCollide = false,
		Parent = parent,
	})
	U.part({
		Name = "ArrowR",
		Size = Vector3.new(0.5, 0.5, 3),
		CFrame = base * CFrame.Angles(0, math.rad(-35), 0) * CFrame.new(0, 0, -1.1),
		Color = colorName,
		Neon = true,
		CanCollide = false,
		Parent = parent,
	})
end

--------------------------------------------------------------------
-- Build
--------------------------------------------------------------------

function M.Build(g)
	local U = G.Util
	local lobby = U.model("Lobby", workspace)

	-- Ground: 3000x3000 grass, TOP surface at y = 0.
	U.part({
		Name = "Ground",
		Size = Vector3.new(3000, 4, 3000),
		CFrame = CFrame.new(0, -2, 0),
		Color = "darkgreen",
		Material = "Grass",
		Parent = lobby,
	})

	-- Stone plaza, 120x120 at origin (thin slab sitting on the grass).
	U.part({
		Name = "Plaza",
		Size = Vector3.new(120, 1, 120),
		CFrame = CFrame.new(0, -0.4, 0),
		Color = "gray",
		Material = "Slate",
		Parent = lobby,
	})
	-- gold trim around the plaza edge
	local trims = {
		{ Vector3.new(120, 0.4, 1.5), CFrame.new(0, 0.15, 60) },
		{ Vector3.new(120, 0.4, 1.5), CFrame.new(0, 0.15, -60) },
		{ Vector3.new(1.5, 0.4, 120), CFrame.new(60, 0.15, 0) },
		{ Vector3.new(1.5, 0.4, 120), CFrame.new(-60, 0.15, 0) },
	}
	for _, t in ipairs(trims) do
		U.part({
			Name = "PlazaTrim",
			Size = t[1],
			CFrame = t[2],
			Color = "gold",
			Neon = true,
			CanCollide = false,
			Parent = lobby,
		})
	end

	-- Spawn
	local spawnLoc = Instance.new("SpawnLocation")
	spawnLoc.Name = "LobbySpawn"
	spawnLoc.Size = Vector3.new(12, 1, 12)
	spawnLoc.CFrame = CFrame.new(0, 0.6, 0)
	spawnLoc.Anchored = true
	spawnLoc.Neutral = true
	spawnLoc.Duration = 0
	spawnLoc.Color = U.Colors.lightblue
	spawnLoc.Material = Enum.Material.Neon
	spawnLoc.TopSurface = Enum.SurfaceType.Smooth
	spawnLoc.Parent = lobby
	U.label(spawnLoc, "SPAWN", { textColor = "lightblue", offsetY = 3 })

	-- Rainbow ring of pads around the spawn.
	for i = 1, 10 do
		local a = (i - 1) / 10 * math.pi * 2
		U.part({
			Name = "RainbowPad",
			Size = Vector3.new(4, 0.4, 4),
			CFrame = CFrame.new(math.cos(a) * 14, 0.3, math.sin(a) * 14) * CFrame.Angles(0, -a, 0),
			Color = Color3.fromHSV((i - 1) / 10, 1, 1),
			Neon = true,
			CanCollide = false,
			Parent = lobby,
		})
	end

	-- Big BOSS TYCOON welcome sign on the plaza edge, facing the spawn.
	local signPos = CFrame.new(0, 0, 48)
	for _, x in ipairs({ -21, 21 }) do
		U.part({
			Name = "SignPillar",
			Shape = "Cylinder",
			Size = Vector3.new(18, 2.6, 2.6),
			CFrame = signPos * CFrame.new(x, 9, 0) * CFrame.Angles(0, 0, math.pi / 2),
			Color = "gold",
			Material = "Metal",
			Parent = lobby,
		})
	end
	local board = U.part({
		Name = "WelcomeBoard",
		Size = Vector3.new(46, 12, 2),
		CFrame = signPos * CFrame.new(0, 15, 0),
		Color = "blue",
		Material = "SmoothPlastic",
		Parent = lobby,
	})
	U.surfaceText(board, "Back", "BOSS TYCOON", "gold", "black")
	U.surfaceText(board, "Front", "BOSS TYCOON", "gold", "black")
	local subBoard = U.part({
		Name = "WelcomeSub",
		Size = Vector3.new(34, 3.4, 1),
		CFrame = signPos * CFrame.new(0, 7.5, -0.8),
		Color = "black",
		Material = "SmoothPlastic",
		Parent = lobby,
	})
	U.surfaceText(subBoard, "Front", "Claim a plot -- get RICH -- launch the NUKE!", "cyan")
	-- spinning rainbow star on top of the sign
	local star = U.part({
		Name = "SignStar",
		Size = Vector3.new(5, 5, 1.2),
		CFrame = signPos * CFrame.new(0, 24.5, 0) * CFrame.Angles(0, 0, math.rad(45)),
		Color = "rainbow",
		Neon = true,
		CanCollide = false,
		Parent = lobby,
	})
	U.spinner(star, "Z", 1.2)
	local star2 = U.part({
		Name = "SignStar2",
		Size = Vector3.new(3.4, 3.4, 1.4),
		CFrame = signPos * CFrame.new(0, 24.5, 0),
		Color = "gold",
		Neon = true,
		CanCollide = false,
		Parent = lobby,
	})
	U.spinner(star2, "Z", -0.8)

	-- Direction signs: one per plot (plots sit at angle (i-1)*72 deg, radius 350).
	local plotColors = { "green", "yellow", "red", "lightblue", "purple" }
	for i = 1, 5 do
		local a = (i - 1) * math.rad(72)
		local dir = Vector3.new(math.cos(a), 0, math.sin(a))
		local pos = dir * 64
		makeDirectionSign(U, lobby, pos, dir, "PLOT " .. i .. "  >>>", plotColors[i])
	end
	-- Eternal Tower of Hell lives at (0,0,-1400).
	makeDirectionSign(U, lobby, Vector3.new(8, 0, -64), Vector3.new(0, 0, -1),
		"ETERNAL TOWER >>>", "darkred")

	-- Lamp posts at the plaza corners.
	makeLampPost(U, lobby, 55, 55)
	makeLampPost(U, lobby, -55, 55)
	makeLampPost(U, lobby, 55, -55)
	makeLampPost(U, lobby, -55, -55)

	-- Trees scattered between the plot directions (angle gaps at 36 deg offsets).
	for i = 1, 5 do
		local a = (i - 1) * math.rad(72) + math.rad(36)
		makeTree(U, lobby, math.cos(a) * 95, math.sin(a) * 95, 1.2)
		makeTree(U, lobby, math.cos(a + 0.18) * 130, math.sin(a + 0.18) * 130, 0.9)
	end

	-- Welcome fireworks so the plaza pops on server start.
	task.spawn(function()
		task.wait(2)
		U.firework(Vector3.new(0, 30, 20))
		task.wait(0.5)
		U.firework(Vector3.new(15, 34, -10))
		task.wait(0.5)
		U.firework(Vector3.new(-15, 32, 0))
	end)
end

return M
