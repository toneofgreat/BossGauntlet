-- Lab.lua — Boss Tycoon: ZORP'S ALIEN LAB (shared zone, built once)
-- Dark foggy alien lab floating at (0, 500, 1500), ~200x200 enclosed complex.
-- Entrance gap in the front wall at (0, 500, 1400).
--
-- DESIGN CHOICES (per contract allowances):
--  * Doors open PHYSICALLY FOR EVERYONE once ANY player enters the correct
--    keypad code (simpler + multiplayer-friendly). Progress that matters is
--    per-player via Economy flags: lab_entered, lab_key1/2/3, lab_escaped.
--  * Keypad digit buffers are shared per keypad (one display per door).
--  * The ESCAPE keypad only accepts 6420 from a player holding all 3 key flags.
--  * Codes (fixed constants per contract): door codes 4915 / 2077 / 8341,
--    escape code 6420 (shown in thirds inside the three key rooms).
--  * On death inside the lab (Zorp or otherwise) the player respawns at the
--    LAB ENTRANCE interior with the fog re-applied (contract: "touch =
--    character death -> respawn at lab entrance"); flags are kept. A one-way
--    "RETURN TO LAB" pad on the lobby plaza additionally teleports anyone
--    with flag lab_entered back to the lab entrance if they left on foot.
--
-- Layout (local coords, x right / z toward the back; floor top = y 0 = abs 500):
--   Entrance z=-100 -> entry hall (x -10..10) -> HUB (x/z -20..20)
--   West corridor -> DOOR 1 (code 4915) -> key room 1 (key1 + "first digit 6")
--   East corridor -> DOOR 2 (code 2077) -> key room 2 (key2 + "middle 4 2")
--   North corridor -> DOOR 3 (code 8341) -> key room 3 (key3 + "last digit 0"
--        + ESCAPE DOOR keypad) -> ESCAPE DOOR (6420 + 3 keys) -> bright
--        antechamber -> EXIT tunnel (z 100..140) -> teleport to (0, 700, 1500)
--   Code signs hidden in side rooms: room A (off entry hall, code for door 1),
--   room B (off west corridor, code for door 2), room C (off east corridor,
--   code for door 3) — so you must explore before you can open anything.
--
-- Part budget: roughly 250 parts (well under the 800 cap).

local M = {}
local G

function M.Init(g)
	G = g
end

-- absolute center of the lab
local CX, CY, CZ = 0, 500, 1500

local DOOR_CODE_1 = "4915"
local DOOR_CODE_2 = "2077"
local DOOR_CODE_3 = "8341"
local ESCAPE_CODE = "6420"

function M.Build(g)
	G = g or G
	local Util = G.Util
	local Economy = G.Economy
	local Remotes = G.Remotes
	local Players = game:GetService("Players")

	local model = Util.model("AlienLab", workspace)
	local flickers = {} -- PointLights that flicker
	local spinKeys = {} -- {part, pos, phase}

	-- abs position / cframe helpers (y is relative to lab floor top)
	local function V(x, y, z)
		return Vector3.new(CX + x, CY + y, CZ + z)
	end
	local function L(x, y, z)
		return CFrame.new(CX + x, CY + y, CZ + z)
	end

	local function notify(player, text, color)
		Remotes.Notify:FireClient(player, text, color)
	end

	-- Contract: dying inside the lab respawns you at the LAB ENTRANCE (fog back
	-- on), not the lobby. Same pattern as UpperFloors/TrollObby pendingRespawn.
	local pendingLabRespawn = {} -- [UserId] = true when the player died inside the lab
	local LAB_ENTRANCE_CF = CFrame.new(CX, CY + 4, CZ - 92) * CFrame.Angles(0, math.pi, 0)
	local function hookLabRespawn(player)
		player.CharacterAdded:Connect(function(char)
			if not pendingLabRespawn[player.UserId] then return end
			pendingLabRespawn[player.UserId] = nil
			task.spawn(function()
				char:WaitForChild("HumanoidRootPart", 8)
				task.wait(0.2)
				if char.Parent then
					pcall(function()
						char:PivotTo(LAB_ENTRANCE_CF)
					end)
					pcall(function()
						Remotes.LabFog:FireClient(player, true)
					end)
				end
			end)
		end)
	end
	Players.PlayerAdded:Connect(hookLabRespawn)
	for _, p in ipairs(Players:GetPlayers()) do
		hookLabRespawn(p)
	end
	Players.PlayerRemoving:Connect(function(p)
		pendingLabRespawn[p.UserId] = nil
	end)

	-- local surface-sign helper: returns part, textLabel (we need the label
	-- back so keypad displays can update their text live)
	local function makeSign(size, cframe, faceId, text, txtColor, partColor, neon)
		local p = Util.part({
			Name = "LabSign", Size = size, CFrame = cframe,
			Color = partColor or "black", Material = "SmoothPlastic",
			Parent = model, Neon = neon and true or false,
		})
		local gui = Instance.new("SurfaceGui")
		gui.Face = faceId
		gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
		gui.PixelsPerStud = 30
		gui.Parent = p
		local lbl = Instance.new("TextLabel")
		lbl.Size = UDim2.new(1, 0, 1, 0)
		lbl.BackgroundTransparency = 1
		lbl.Font = Enum.Font.SourceSansBold
		lbl.TextScaled = true
		lbl.TextWrapped = true
		lbl.TextColor3 = txtColor or Color3.fromRGB(90, 255, 120)
		lbl.Text = text
		lbl.Parent = gui
		return p, lbl
	end

	local function makeSound(parent, id, vol, speed)
		local s = Instance.new("Sound")
		s.SoundId = id
		s.Volume = vol or 0.8
		s.PlaybackSpeed = speed or 1
		s.Parent = parent
		return s
	end

	local function wall(size, cframe)
		return Util.part({
			Name = "LabWall", Size = size, CFrame = cframe,
			Color = Color3.fromRGB(38, 42, 45), Material = "DiamondPlate",
			Parent = model,
		})
	end

	----------------------------------------------------------------
	-- SHELL: floating platform, outer walls, ceiling
	----------------------------------------------------------------
	Util.part({
		Name = "LabPlatform", Size = Vector3.new(240, 4, 260), CFrame = L(0, -2, 15),
		Color = Color3.fromRGB(28, 30, 33), Material = "Slate", Parent = model,
	})
	-- front wall (entrance gap x -8..8)
	wall(Vector3.new(92, 16, 2), L(-54, 8, -100))
	wall(Vector3.new(92, 16, 2), L(54, 8, -100))
	-- back wall (exit tunnel gap x -8..8)
	wall(Vector3.new(92, 16, 2), L(-54, 8, 100))
	wall(Vector3.new(92, 16, 2), L(54, 8, 100))
	-- side walls
	wall(Vector3.new(2, 16, 200), L(-100, 8, 0))
	wall(Vector3.new(2, 16, 200), L(100, 8, 0))
	-- ceiling (keeps it pitch dark inside; client fog does the rest)
	Util.part({
		Name = "LabCeiling", Size = Vector3.new(204, 2, 204), CFrame = L(0, 17, 0),
		Color = Color3.fromRGB(20, 22, 24), Material = "Slate", Parent = model,
	})

	----------------------------------------------------------------
	-- INTERIOR WALLS
	----------------------------------------------------------------
	-- entry hall (x -10..10, z -100..-20); east wall has the gap into room A
	wall(Vector3.new(2, 16, 80), L(-10, 8, -60))
	wall(Vector3.new(2, 16, 26), L(10, 8, -87)) -- z -100..-74
	wall(Vector3.new(2, 16, 46), L(10, 8, -43)) -- z -66..-20 (gap z -74..-66)
	-- hub (x/z -20..20): south segments beside the entry hall mouth
	wall(Vector3.new(10, 16, 2), L(-15, 8, -20))
	wall(Vector3.new(10, 16, 2), L(15, 8, -20))
	-- hub west wall (corridor gap z -6..6)
	wall(Vector3.new(2, 16, 14), L(-20, 8, -13))
	wall(Vector3.new(2, 16, 14), L(-20, 8, 13))
	-- hub east wall
	wall(Vector3.new(2, 16, 14), L(20, 8, -13))
	wall(Vector3.new(2, 16, 14), L(20, 8, 13))
	-- hub north wall (corridor gap x -10..10)
	wall(Vector3.new(10, 16, 2), L(-15, 8, 20))
	wall(Vector3.new(10, 16, 2), L(15, 8, 20))
	-- west corridor (x -60..-20): north wall full, south wall gapped for room B
	wall(Vector3.new(40, 16, 2), L(-40, 8, 6))
	wall(Vector3.new(12, 16, 2), L(-54, 8, -6)) -- x -60..-48
	wall(Vector3.new(20, 16, 2), L(-30, 8, -6)) -- x -40..-20 (gap x -48..-40)
	-- east corridor (x 20..60): south wall full, north wall gapped for room C
	wall(Vector3.new(40, 16, 2), L(40, 8, -6))
	wall(Vector3.new(20, 16, 2), L(30, 8, 6)) -- x 20..40
	wall(Vector3.new(12, 16, 2), L(54, 8, 6)) -- x 48..60 (gap x 40..48)
	-- north corridor (z 20..55)
	wall(Vector3.new(2, 16, 35), L(-10, 8, 37.5))
	wall(Vector3.new(2, 16, 35), L(10, 8, 37.5))
	-- key room 1 (x -90..-60, z -15..15)
	wall(Vector3.new(2, 16, 30), L(-90, 8, 0))
	wall(Vector3.new(30, 16, 2), L(-75, 8, -15))
	wall(Vector3.new(30, 16, 2), L(-75, 8, 15))
	wall(Vector3.new(2, 16, 9), L(-60, 8, -10.5)) -- door 1 frame fillers
	wall(Vector3.new(2, 16, 9), L(-60, 8, 10.5))
	wall(Vector3.new(2, 4, 12), L(-60, 14, 0)) -- header over door 1
	-- key room 2 (x 60..90, z -15..15)
	wall(Vector3.new(2, 16, 30), L(90, 8, 0))
	wall(Vector3.new(30, 16, 2), L(75, 8, -15))
	wall(Vector3.new(30, 16, 2), L(75, 8, 15))
	wall(Vector3.new(2, 16, 9), L(60, 8, -10.5))
	wall(Vector3.new(2, 16, 9), L(60, 8, 10.5))
	wall(Vector3.new(2, 4, 12), L(60, 14, 0))
	-- key room 3 (x -20..20, z 55..80)
	wall(Vector3.new(2, 16, 25), L(-20, 8, 67.5))
	wall(Vector3.new(2, 16, 25), L(20, 8, 67.5))
	wall(Vector3.new(14, 16, 2), L(-13, 8, 55)) -- door 3 frame fillers
	wall(Vector3.new(14, 16, 2), L(13, 8, 55))
	wall(Vector3.new(12, 4, 2), L(0, 14, 55))
	-- escape wall (z=80) + bright antechamber (z 80..100)
	wall(Vector3.new(14, 16, 2), L(-13, 8, 80))
	wall(Vector3.new(14, 16, 2), L(13, 8, 80))
	wall(Vector3.new(12, 4, 2), L(0, 14, 80))
	wall(Vector3.new(2, 16, 20), L(-20, 8, 90))
	wall(Vector3.new(2, 16, 20), L(20, 8, 90))
	-- side room A (code for door 1) x 10..35, z -80..-58
	wall(Vector3.new(2, 16, 24), L(35, 8, -69))
	wall(Vector3.new(26, 16, 2), L(23, 8, -58))
	wall(Vector3.new(26, 16, 2), L(23, 8, -80))
	-- side room B (code for door 2) x -50..-30, z -30..-6
	wall(Vector3.new(2, 16, 24), L(-50, 8, -18))
	wall(Vector3.new(2, 16, 24), L(-30, 8, -18))
	wall(Vector3.new(22, 16, 2), L(-40, 8, -30))
	-- side room C (code for door 3) x 30..50, z 6..30
	wall(Vector3.new(2, 16, 24), L(30, 8, 18))
	wall(Vector3.new(2, 16, 24), L(50, 8, 18))
	wall(Vector3.new(22, 16, 2), L(40, 8, 30))

	----------------------------------------------------------------
	-- ENTRANCE dressing + instruction sign
	----------------------------------------------------------------
	makeSign(Vector3.new(26, 6, 1), L(0, 19, -100), Enum.NormalId.Front,
		"ZORP'S ALIEN LAB", Color3.fromRGB(120, 255, 140), "black", false)
	Util.part({
		Name = "EntranceColumn", Size = Vector3.new(2, 16, 2), CFrame = L(-9, 8, -101),
		Color = "green", Neon = true, Parent = model,
	})
	Util.part({
		Name = "EntranceColumn", Size = Vector3.new(2, 16, 2), CFrame = L(9, 8, -101),
		Color = "green", Neon = true, Parent = model,
	})
	makeSign(Vector3.new(0.4, 7, 12), L(8.8, 8, -88), Enum.NormalId.Left,
		"FIND 3 CODES...\nOPEN 3 DOORS...\nGRAB 3 KEYS...\nTHEN ESCAPE!",
		Color3.fromRGB(140, 255, 160), "black", false)

	-- glowing floor arrows guiding new arrivals toward the hub
	local arrowZ = { -92, -80, -68, -52, -36 }
	for i = 1, #arrowZ do
		Util.part({
			Name = "FloorArrow", Size = Vector3.new(1.4, 0.12, 4), CFrame = L(0, 0.08, arrowZ[i]),
			Color = "green", Neon = true, CanCollide = false, Parent = model,
		})
	end

	----------------------------------------------------------------
	-- HIDDEN CODE SIGNS (side rooms)
	----------------------------------------------------------------
	makeSign(Vector3.new(0.4, 6, 14), L(33.8, 7, -69), Enum.NormalId.Left,
		"TOP SECRET!\nWEST DOOR\nCODE: " .. DOOR_CODE_1,
		Color3.fromRGB(140, 255, 160), "black", false)
	makeSign(Vector3.new(14, 6, 0.4), L(-40, 7, -28.8), Enum.NormalId.Back,
		"SSHHH...\nEAST DOOR\nCODE: " .. DOOR_CODE_2,
		Color3.fromRGB(140, 255, 160), "black", false)
	makeSign(Vector3.new(14, 6, 0.4), L(40, 7, 29), Enum.NormalId.Front,
		"DO NOT READ!\nNORTH DOOR\nCODE: " .. DOOR_CODE_3,
		Color3.fromRGB(140, 255, 160), "black", false)

	----------------------------------------------------------------
	-- ESCAPE CODE THIRDS (inside the three key rooms)  escape = 6420
	----------------------------------------------------------------
	makeSign(Vector3.new(0.4, 5, 14), L(-89.2, 7, 0), Enum.NormalId.Right,
		"ESCAPE CODE 1/3\n6 _ _ _\n(FIRST DIGIT = 6)",
		Color3.fromRGB(255, 230, 90), "black", false)
	makeSign(Vector3.new(0.4, 5, 14), L(89.2, 7, 0), Enum.NormalId.Left,
		"ESCAPE CODE 2/3\n_ 4 2 _\n(MIDDLE = 4 2)",
		Color3.fromRGB(255, 230, 90), "black", false)
	makeSign(Vector3.new(0.4, 5, 10), L(-19.2, 7, 67), Enum.NormalId.Right,
		"ESCAPE CODE 3/3\n_ _ _ 0\n(LAST DIGIT = 0)",
		Color3.fromRGB(255, 230, 90), "black", false)

	----------------------------------------------------------------
	-- DOORS (slide up when opened; open for EVERYONE once opened)
	----------------------------------------------------------------
	local function makeDoor(name, cframe, size)
		local door = Util.part({
			Name = name, Size = size, CFrame = cframe,
			Color = Color3.fromRGB(30, 90, 45), Material = "Metal", Parent = model,
		})
		Util.label(door, name, {})
		local state = { part = door, opened = false }
		state.open = function()
			if state.opened then return end
			state.opened = true
			door.Color = Color3.fromRGB(90, 255, 120)
			door.Material = Enum.Material.Neon
			task.spawn(function()
				local start = door.CFrame
				for i = 1, 26 do
					door.CFrame = start * CFrame.new(0, i * 0.5, 0)
					task.wait(0.04)
				end
				door.CanCollide = false
				door.Transparency = 0.5
			end)
		end
		return state
	end

	local door1 = makeDoor("WEST DOOR", L(-60, 6, 0), Vector3.new(2, 12, 12))
	local door2 = makeDoor("EAST DOOR", L(60, 6, 0), Vector3.new(2, 12, 12))
	local door3 = makeDoor("NORTH DOOR", L(0, 6, 55), Vector3.new(12, 12, 2))
	local escDoor = makeDoor("ESCAPE DOOR", L(0, 6, 80), Vector3.new(12, 12, 2))

	----------------------------------------------------------------
	-- KEYPADS: step-pads 0..9 on the floor + live display above the door.
	-- Shared digit buffer per keypad; wrong code buzzes and resets.
	----------------------------------------------------------------
	local function fmtBuffer(buffer)
		local t = {}
		for i = 1, 4 do
			if i <= string.len(buffer) then
				t[i] = string.sub(buffer, i, i)
			else
				t[i] = "_"
			end
		end
		return table.concat(t, " ")
	end

	-- opts: code, padCenter (Vector3 abs, floor level), rowDir, colDir,
	--       displaySize, displayCFrame, displayFace, title,
	--       onCorrect(player), requireFn(player) -> ok, failMsg
	local function makeKeypad(opts)
		local dispPart, dispLbl = makeSign(opts.displaySize, opts.displayCFrame,
			opts.displayFace, opts.title .. "\nENTER CODE",
			Color3.fromRGB(120, 255, 140), "black", false)
		local ping = makeSound(dispPart, "rbxasset://sounds/electronicpingshort.wav", 0.9, 1)
		local good = makeSound(dispPart, "rbxasset://sounds/electronicpingshort.wav", 1, 1.6)
		local buzz = makeSound(dispPart, "rbxasset://sounds/uuhhh.mp3", 1, 0.7)
		local buffer = ""
		local locked = false
		local function setText(t, c)
			dispLbl.Text = t
			if c then dispLbl.TextColor3 = c end
		end
		local function reset(msg)
			task.delay(1.2, function()
				buffer = ""
				locked = false
				setText(opts.title .. "\nENTER CODE", Color3.fromRGB(120, 255, 140))
			end)
			if msg then setText(msg, Color3.fromRGB(255, 90, 90)) end
		end
		-- phone-style layout: 1 2 3 / 4 5 6 / 7 8 9 / . 0 .
		local layout = { { 1, 2, 3 }, { 4, 5, 6 }, { 7, 8, 9 }, { -1, 0, -1 } }
		for r = 1, 4 do
			for c = 1, 3 do
				local digit = layout[r][c]
				if digit >= 0 then
					local pos = opts.padCenter
						+ opts.rowDir * ((r - 2.5) * 3)
						+ opts.colDir * ((c - 2) * 3.4)
					local pad = Util.part({
						Name = "Keypad" .. digit,
						Size = Vector3.new(2.6, 0.5, 2.6),
						CFrame = CFrame.new(pos + Vector3.new(0, 0.25, 0)),
						Color = Color3.fromRGB(60, 65, 70), Material = "Metal",
						Parent = model,
					})
					local gui = Instance.new("SurfaceGui")
					gui.Face = Enum.NormalId.Top
					gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
					gui.PixelsPerStud = 40
					gui.Parent = pad
					local lbl = Instance.new("TextLabel")
					lbl.Size = UDim2.new(1, 0, 1, 0)
					lbl.BackgroundTransparency = 1
					lbl.Font = Enum.Font.SourceSansBold
					lbl.TextScaled = true
					lbl.TextColor3 = Color3.fromRGB(140, 255, 160)
					lbl.Text = tostring(digit)
					lbl.Parent = gui
					Util.touchOnce(pad, 0.5, function(player)
						if locked then return end
						if string.len(buffer) >= 4 then return end
						buffer = buffer .. tostring(digit)
						ping:Play()
						-- flash the pad
						pad.Material = Enum.Material.Neon
						task.delay(0.25, function()
							pad.Material = Enum.Material.Metal
						end)
						setText(opts.title .. "\n" .. fmtBuffer(buffer), Color3.fromRGB(120, 255, 140))
						if string.len(buffer) == 4 then
							locked = true
							local entered = buffer
							task.delay(0.4, function()
								if entered == opts.code then
									local ok, failMsg = true, nil
									if opts.requireFn then
										ok, failMsg = opts.requireFn(player)
									end
									if ok then
										good:Play()
										setText(opts.title .. "\nOPEN!", Color3.fromRGB(120, 255, 140))
										opts.onCorrect(player)
										-- stays locked: door is open forever
									else
										buzz:Play()
										notify(player, failMsg or "Locked!", "red")
										reset(failMsg or "LOCKED")
									end
								else
									buzz:Play()
									reset("WRONG!\nX X X X")
								end
							end)
						end
					end)
				end
			end
		end
	end

	makeKeypad({
		code = DOOR_CODE_1, title = "WEST DOOR",
		padCenter = V(-51.5, 0, 0),
		rowDir = Vector3.new(1, 0, 0), colDir = Vector3.new(0, 0, 1),
		displaySize = Vector3.new(0.6, 4, 11), displayCFrame = L(-58.7, 13.5, 0),
		displayFace = Enum.NormalId.Right,
		onCorrect = function(player)
			door1.open()
			notify(player, "ACCESS GRANTED! West door open!", "green")
		end,
	})
	makeKeypad({
		code = DOOR_CODE_2, title = "EAST DOOR",
		padCenter = V(51.5, 0, 0),
		rowDir = Vector3.new(-1, 0, 0), colDir = Vector3.new(0, 0, 1),
		displaySize = Vector3.new(0.6, 4, 11), displayCFrame = L(58.7, 13.5, 0),
		displayFace = Enum.NormalId.Left,
		onCorrect = function(player)
			door2.open()
			notify(player, "ACCESS GRANTED! East door open!", "green")
		end,
	})
	makeKeypad({
		code = DOOR_CODE_3, title = "NORTH DOOR",
		padCenter = V(0, 0, 46.5),
		rowDir = Vector3.new(0, 0, -1), colDir = Vector3.new(1, 0, 0),
		displaySize = Vector3.new(11, 4, 0.6), displayCFrame = L(0, 13.5, 53.7),
		displayFace = Enum.NormalId.Front,
		onCorrect = function(player)
			door3.open()
			notify(player, "ACCESS GRANTED! North door open!", "green")
		end,
	})
	makeKeypad({
		code = ESCAPE_CODE, title = "ESCAPE DOOR",
		padCenter = V(0, 0, 71.5),
		rowDir = Vector3.new(0, 0, -1), colDir = Vector3.new(1, 0, 0),
		displaySize = Vector3.new(11, 4, 0.6), displayCFrame = L(0, 13.5, 78.7),
		displayFace = Enum.NormalId.Front,
		requireFn = function(player)
			if Economy.HasFlag(player, "lab_key1")
				and Economy.HasFlag(player, "lab_key2")
				and Economy.HasFlag(player, "lab_key3") then
				return true
			end
			return false, "NEED ALL 3 KEYS!"
		end,
		onCorrect = function(player)
			escDoor.open()
			notify(player, "ESCAPE DOOR OPEN! RUN FOR IT!", "green")
		end,
	})

	----------------------------------------------------------------
	-- KEYS (per-player via flags; the key part stays for other players)
	----------------------------------------------------------------
	local function countKeys(player)
		local n = 0
		for i = 1, 3 do
			if Economy.HasFlag(player, "lab_key" .. i) then n = n + 1 end
		end
		return n
	end

	local function makeKey(idx, x, z)
		Util.part({ -- pedestal
			Name = "KeyPedestal", Size = Vector3.new(2.5, 2.5, 2.5), CFrame = L(x, 1.25, z),
			Color = "gray", Material = "Slate", Parent = model,
		})
		local pos = V(x, 4.6, z)
		local key = Util.part({
			Name = "AlienKey" .. idx, Size = Vector3.new(2.2, 2.2, 0.6),
			CFrame = CFrame.new(pos), Color = "gold", Neon = true,
			CanCollide = false, Parent = model,
		})
		Util.label(key, "KEY " .. idx, {})
		local sparkle = Instance.new("Sparkles")
		sparkle.SparkleColor = Color3.fromRGB(255, 220, 90)
		sparkle.Parent = key
		spinKeys[#spinKeys + 1] = { part = key, pos = pos, phase = idx * 2.1 }
		Util.touchOnce(key, 1, function(player)
			local flag = "lab_key" .. idx
			if not Economy.HasFlag(player, flag) then
				Economy.SetFlag(player, flag)
				notify(player, "ALIEN KEY " .. idx .. " collected! (" .. countKeys(player) .. "/3)", "green")
			end
		end)
	end

	makeKey(1, -75, 0)  -- key room 1
	makeKey(2, 75, 0)   -- key room 2
	makeKey(3, -14, 62) -- key room 3 (beside the escape keypad)

	-- floating key bob + spin loop (also handles nothing else; cheap)
	task.spawn(function()
		local t = 0
		while true do
			local dt = task.wait(0.05)
			t = t + (dt or 0.05)
			for i = 1, #spinKeys do
				local k = spinKeys[i]
				if k.part.Parent then
					k.part.CFrame = CFrame.new(k.pos + Vector3.new(0, math.sin(t * 2 + k.phase) * 0.4, 0))
						* CFrame.Angles(0, t * 2 + k.phase, 0)
				end
			end
		end
	end)

	----------------------------------------------------------------
	-- ESCAPE ANTECHAMBER + EXIT TUNNEL (bright + friendly)
	----------------------------------------------------------------
	Util.part({
		Name = "AntechamberFloor", Size = Vector3.new(38, 0.2, 18), CFrame = L(0, 0.11, 90),
		Color = "white", Material = "SmoothPlastic", Parent = model,
	})
	local antePanel = Util.part({
		Name = "AntechamberLightPanel", Size = Vector3.new(30, 0.4, 14), CFrame = L(0, 15.7, 90),
		Color = "white", Neon = true, Parent = model,
	})
	local anteLight = Instance.new("PointLight")
	anteLight.Color = Color3.fromRGB(255, 255, 255)
	anteLight.Brightness = 2
	anteLight.Range = 34
	anteLight.Parent = antePanel

	-- tunnel z 100..140
	wall(Vector3.new(2, 12, 40), L(-8, 6, 120))
	wall(Vector3.new(2, 12, 40), L(8, 6, 120))
	wall(Vector3.new(18, 2, 40), L(0, 13, 120))
	wall(Vector3.new(18, 15, 2), L(0, 7.5, 141)) -- end cap
	for side = -1, 1, 2 do
		local strip = Util.part({
			Name = "TunnelStrip", Size = Vector3.new(0.3, 0.6, 40), CFrame = L(side * 6.8, 9, 120),
			Color = "white", Neon = true, CanCollide = false, Parent = model,
		})
		local sl = Instance.new("PointLight")
		sl.Color = Color3.fromRGB(200, 255, 255)
		sl.Brightness = 1.5
		sl.Range = 16
		sl.Parent = strip
	end
	Util.part({
		Name = "TunnelFloorGlow", Size = Vector3.new(2, 0.12, 40), CFrame = L(0, 0.08, 120),
		Color = "cyan", Neon = true, CanCollide = false, Parent = model,
	})
	makeSign(Vector3.new(14, 6, 0.5), L(0, 8, 139.7), Enum.NormalId.Front,
		"YOU ESCAPED!\nUP TO THE\nUPPER FLOORS!", Color3.fromRGB(120, 220, 255), "black", false)

	-- escape trigger: crossing it = escaped the lab
	local escapeTrigger = Util.part({
		Name = "EscapeTrigger", Size = Vector3.new(16, 12, 2), CFrame = L(0, 6, 136),
		Transparency = 1, CanCollide = false, Parent = model,
	})
	Util.touchOnce(escapeTrigger, 4, function(player, char)
		Economy.SetFlag(player, "lab_escaped")
		Remotes.LabFog:FireClient(player, false)
		notify(player, "YOU ESCAPED ZORP'S LAB! Welcome to the Upper Floors!", "green")
		if char then
			char:PivotTo(CFrame.new(0, 705, 1500))
		end
		Util.firework(Vector3.new(0, 708, 1500))
	end)

	----------------------------------------------------------------
	-- ENTRY TRIGGER (front gap) + lobby RETURN-TO-LAB pad
	----------------------------------------------------------------
	local entryTrigger = Util.part({
		Name = "LabEntryTrigger", Size = Vector3.new(16, 12, 2), CFrame = L(0, 6, -96),
		Transparency = 1, CanCollide = false, Parent = model,
	})
	Util.touchOnce(entryTrigger, 3, function(player)
		Economy.SetFlag(player, "lab_entered")
		Remotes.LabFog:FireClient(player, true)
	end)

	-- one-way re-entry pad on the lobby plaza (usable once lab_entered is set,
	-- so dying to Zorp never strands you — respawn at lobby, step here, back in)
	local returnPad = Util.part({
		Name = "ReturnToLabPad", Size = Vector3.new(6, 1, 6), CFrame = CFrame.new(45, 0.5, 45),
		Color = "purple", Neon = true, Parent = model,
	})
	Util.label(returnPad, "RETURN TO LAB", {})
	Util.touchOnce(returnPad, 2, function(player, char)
		if Economy.HasFlag(player, "lab_entered") then
			if char then
				-- entrance interior, facing into the lab (+Z)
				char:PivotTo(CFrame.new(CX, CY + 4, CZ - 92) * CFrame.Angles(0, math.pi, 0))
			end
			Remotes.LabFog:FireClient(player, true)
			notify(player, "Back into the lab... watch out for ZORP!", "yellow")
		else
			notify(player, "You have not found the lab yet! Buy the Portal first.", "red")
		end
	end)

	----------------------------------------------------------------
	-- SPOOKY DRESSING: flickering sconces, pipes, goo, barrels
	----------------------------------------------------------------
	local function sconce(x, y, z, colorName)
		local p = Util.part({
			Name = "Sconce", Size = Vector3.new(0.6, 1.6, 0.6), CFrame = L(x, y, z),
			Color = colorName or "green", Neon = true, CanCollide = false, Parent = model,
		})
		local li = Instance.new("PointLight")
		if colorName == "red" then
			li.Color = Color3.fromRGB(255, 70, 70)
		else
			li.Color = Color3.fromRGB(110, 255, 130)
		end
		li.Brightness = 1.4
		li.Range = 15
		li.Parent = p
		flickers[#flickers + 1] = li
		return p
	end

	sconce(-8.6, 8, -85); sconce(8.6, 8, -45) -- entry hall
	sconce(-18, 8, -18); sconce(18, 8, -18)   -- hub south corners
	sconce(-18, 8, 18); sconce(18, 8, 18)     -- hub north corners
	sconce(-35, 8, 4.6); sconce(-50, 8, -4.6) -- west corridor
	sconce(35, 8, -4.6); sconce(50, 8, 4.6)   -- east corridor
	sconce(-8.6, 8, 30); sconce(8.6, 8, 45)   -- north corridor
	sconce(-75, 8, 13.4); sconce(75, 8, 13.4) -- key rooms 1 + 2
	sconce(18.4, 8, 67)                       -- key room 3
	sconce(22, 8, -70); sconce(-40, 8, -27.5); sconce(40, 8, 27.5) -- side rooms
	sconce(0, 15.5, 0, "red")                 -- hub ceiling alarm light

	-- pipes (cylinders; native axis is X)
	local function pipe(size, cframe)
		return Util.part({
			Name = "LabPipe", Shape = "Cylinder", Size = size, CFrame = cframe,
			Color = Color3.fromRGB(70, 78, 82), Material = "Metal",
			CanCollide = false, Parent = model,
		})
	end
	pipe(Vector3.new(78, 1.2, 1.2), L(7, 15, -60) * CFrame.Angles(0, math.pi / 2, 0)) -- entry hall, along Z
	pipe(Vector3.new(38, 1.4, 1.4), L(0, 14.5, -18)) -- hub, along X
	pipe(Vector3.new(38, 1.4, 1.4), L(0, 15.2, 18))
	pipe(Vector3.new(38, 1, 1), L(-40, 15, 4.8))     -- west corridor
	pipe(Vector3.new(38, 1, 1), L(40, 15, -4.8))     -- east corridor
	pipe(Vector3.new(33, 1, 1), L(8.8, 15, 37) * CFrame.Angles(0, math.pi / 2, 0)) -- north corridor
	pipe(Vector3.new(28, 1.2, 1.2), L(-75, 15, -13.5)) -- key rooms
	pipe(Vector3.new(28, 1.2, 1.2), L(75, 15, -13.5))
	-- vertical corner pipes in the hub
	for sx = -1, 1, 2 do
		for sz = -1, 1, 2 do
			pipe(Vector3.new(16, 1.5, 1.5), L(sx * 18.5, 8, sz * 18.5) * CFrame.Angles(0, 0, math.pi / 2))
		end
	end
	-- valve wheels
	local function valve(x, y, z)
		Util.part({
			Name = "Valve", Shape = "Cylinder", Size = Vector3.new(0.4, 2, 2),
			CFrame = L(x, y, z) * CFrame.Angles(0, 0, math.pi / 2),
			Color = "red", Material = "Metal", CanCollide = false, Parent = model,
		})
	end
	valve(7, 13.8, -75); valve(-40, 13.8, 4.8); valve(40, 13.8, -4.8); valve(0, 13.2, -18)

	-- glowing goo puddles (flattened cylinders, axis rotated to Y)
	local gooSpots = {
		{ 3, -75, 5 }, { -8, 5, 6 }, { 8, -8, 4 }, { -45, -2, 5 }, { 46, 2, 4 },
		{ 20, -70, 6 }, { -42, -20, 4 }, { 42, 20, 4 }, { -80, -6, 5 }, { 80, 6, 5 },
		{ -5, 65, 4 }, { 4, 34, 3 },
	}
	for i = 1, #gooSpots do
		local s = gooSpots[i]
		Util.part({
			Name = "AlienGoo", Shape = "Cylinder", Size = Vector3.new(0.25, s[3], s[3]),
			CFrame = L(s[1], 0.13, s[2]) * CFrame.Angles(0, 0, math.pi / 2),
			Color = "green", Neon = true, Transparency = 0.15,
			CanCollide = false, Parent = model,
		})
	end
	-- goo drips running down walls
	local dripSpots = {
		{ -9, -70, 0.35 }, { 19, -10, 0.35 }, { -19, 8, 0.35 }, { 9, 40, 0.35 },
		{ -59, 8, 0.4 }, { 59, -8, 0.4 },
	}
	for i = 1, #dripSpots do
		local d = dripSpots[i]
		Util.part({
			Name = "GooDrip", Size = Vector3.new(0.3, 6, 1.6),
			CFrame = L(d[1], 6, d[2]),
			Color = "green", Neon = true, Transparency = 0.25,
			CanCollide = false, Parent = model,
		})
	end
	-- toxic barrels (some with green fire)
	local barrelSpots = {
		{ 30, -75, true }, { -17, -17, false }, { -46, -26, true },
		{ 46, 26, false }, { -85, 11, true }, { 85, -11, false }, { 16, 74, true },
	}
	for i = 1, #barrelSpots do
		local b = barrelSpots[i]
		local barrel = Util.part({
			Name = "ToxicBarrel", Shape = "Cylinder", Size = Vector3.new(3.4, 2.6, 2.6),
			CFrame = L(b[1], 1.7, b[2]) * CFrame.Angles(0, 0, math.pi / 2),
			Color = "darkgreen", Material = "Metal", Parent = model,
		})
		if b[3] then
			local fire = Instance.new("Fire")
			fire.Color = Color3.fromRGB(90, 255, 100)
			fire.SecondaryColor = Color3.fromRGB(30, 120, 50)
			fire.Heat = 3
			fire.Size = 3
			fire.Parent = barrel
		end
	end

	-- flicker loop: one task drives every sconce light (creepy strobe)
	task.spawn(function()
		local rng = Random.new()
		while true do
			task.wait(rng:NextNumber(0.07, 0.25))
			local n = #flickers
			if n > 0 then
				local li = flickers[rng:NextInteger(1, n)]
				if rng:NextNumber() < 0.3 then
					li.Enabled = not li.Enabled
				else
					li.Enabled = true
					li.Brightness = rng:NextNumber(0.3, 2.2)
				end
			end
		end
	end)

	----------------------------------------------------------------
	-- ZORP THE ALIEN: glowing green humanoid, patrols + chases + kills
	----------------------------------------------------------------
	local alien = Instance.new("Model")
	alien.Name = "Zorp"

	local function alienPart(name, size, cf, props)
		local p = Util.part({
			Name = name, Size = size, CFrame = cf,
			Color = props.color or Color3.fromRGB(90, 230, 110),
			Material = props.material or "SmoothPlastic",
			Anchored = false, CanCollide = props.collide or false,
			Shape = props.shape, Neon = props.neon, Parent = alien,
		})
		return p
	end

	local hrp = alienPart("HumanoidRootPart", Vector3.new(2, 2, 1), L(0, 3.2, 0), {})
	hrp.Transparency = 1
	local torso = alienPart("Torso", Vector3.new(2, 2.4, 1.2), L(0, 3.2, 0),
		{ collide = true, neon = true, color = Color3.fromRGB(70, 220, 100) })
	local head = alienPart("Head", Vector3.new(1.8, 1.8, 1.8), L(0, 5, 0),
		{ shape = "Ball", neon = true, color = Color3.fromRGB(110, 255, 130) })
	local eyeL = alienPart("EyeL", Vector3.new(0.4, 0.55, 0.3), L(-0.38, 5.2, -0.72),
		{ color = Color3.fromRGB(10, 10, 10) })
	local eyeR = alienPart("EyeR", Vector3.new(0.4, 0.55, 0.3), L(0.38, 5.2, -0.72),
		{ color = Color3.fromRGB(10, 10, 10) })
	local armL = alienPart("ArmL", Vector3.new(0.7, 2.2, 0.7), L(-1.45, 3.3, 0),
		{ neon = true, color = Color3.fromRGB(70, 220, 100) })
	local armR = alienPart("ArmR", Vector3.new(0.7, 2.2, 0.7), L(1.45, 3.3, 0),
		{ neon = true, color = Color3.fromRGB(70, 220, 100) })
	local legL = alienPart("LegL", Vector3.new(0.9, 2, 0.9), L(-0.55, 1, 0),
		{ color = Color3.fromRGB(50, 170, 80) })
	local legR = alienPart("LegR", Vector3.new(0.9, 2, 0.9), L(0.55, 1, 0),
		{ color = Color3.fromRGB(50, 170, 80) })
	local antTip1 = alienPart("AntennaTip1", Vector3.new(0.45, 0.45, 0.45), L(-0.5, 6.4, 0),
		{ shape = "Ball", neon = true, color = Color3.fromRGB(160, 255, 170) })
	local antTip2 = alienPart("AntennaTip2", Vector3.new(0.45, 0.45, 0.45), L(0.5, 6.4, 0),
		{ shape = "Ball", neon = true, color = Color3.fromRGB(160, 255, 170) })

	local bodyParts = { torso, head, eyeL, eyeR, armL, armR, legL, legR, antTip1, antTip2 }
	for i = 1, #bodyParts do
		local w = Instance.new("WeldConstraint")
		w.Part0 = hrp
		w.Part1 = bodyParts[i]
		w.Parent = hrp
	end

	local glow = Instance.new("PointLight")
	glow.Color = Color3.fromRGB(90, 255, 110)
	glow.Brightness = 2
	glow.Range = 14
	glow.Parent = torso
	Util.label(head, "ZORP", {})

	local hum = Instance.new("Humanoid")
	hum.MaxHealth = 10000
	hum.Health = 10000
	hum.WalkSpeed = 8
	hum.HipHeight = 2.2
	hum.RequiresNeck = false
	hum.BreakJointsOnDeath = false
	hum.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
	hum.Parent = alien
	local ff = Instance.new("ForceField")
	ff.Visible = false
	ff.Parent = alien

	alien.PrimaryPart = hrp
	alien.Parent = model
	pcall(function()
		hum:SetStateEnabled(Enum.HumanoidStateType.FallingDown, false)
		hum:SetStateEnabled(Enum.HumanoidStateType.Ragdoll, false)
		hrp:SetNetworkOwner(nil)
	end)

	-- touching Zorp = instant doom (respawn at the lab entrance)
	local function onZorpTouch(hit)
		local char = hit and hit.Parent
		if not char or char == alien then return end
		local player = Players:GetPlayerFromCharacter(char)
		if not player then return end
		local phum = char:FindFirstChildOfClass("Humanoid")
		if phum and phum.Health > 0 then
			pendingLabRespawn[player.UserId] = true
			phum.Health = 0
			notify(player, "ZORP GOT YOU! Back to the entrance with you...", "red")
		end
	end
	torso.Touched:Connect(onZorpTouch)
	armL.Touched:Connect(onZorpTouch)
	armR.Touched:Connect(onZorpTouch)
	head.Touched:Connect(onZorpTouch)

	-- is a world position inside the lab proper (tunnel + porch excluded)?
	local function inLab(pos)
		return math.abs(pos.X - CX) <= 108
			and pos.Z >= CZ - 108 and pos.Z <= CZ + 100
			and pos.Y >= CY - 8 and pos.Y <= CY + 30
	end

	-- patrol route: hub <-> corridors (local coords)
	local waypoints = {
		V(-40, 0, 0), V(0, 0, 0), V(40, 0, 0), V(0, 0, 0),
		V(0, 0, 37), V(0, 0, 0), V(0, 0, -60), V(0, 0, -30),
	}

	task.spawn(function()
		local wpIndex = 1
		local wpTimer = 0
		while true do
			task.wait(0.15)
			if hrp.Parent then
				-- fell off somehow? plop back into the hub
				if hrp.Position.Y < CY - 30 then
					alien:PivotTo(L(0, 3.4, 0))
				end
				-- find nearest living player inside the lab
				local nearest, nearestDist
				local players = Players:GetPlayers()
				for i = 1, #players do
					local p = players[i]
					local char = p.Character
					local root = char and char:FindFirstChild("HumanoidRootPart")
					local phum = char and char:FindFirstChildOfClass("Humanoid")
					if root and phum and phum.Health > 0 and inLab(root.Position) then
						-- anyone inside the lab counts as having entered it
						if not Economy.HasFlag(p, "lab_entered") then
							Economy.SetFlag(p, "lab_entered")
						end
						-- deaths inside the lab: clear the fog for the death
						-- screen and flag a respawn at the lab entrance
						if not phum:GetAttribute("LabDiedHooked") then
							phum:SetAttribute("LabDiedHooked", true)
							phum.Died:Connect(function()
								local c = phum.Parent
								local root2 = c and c:FindFirstChild("HumanoidRootPart")
								if root2 and inLab(root2.Position) then
									pendingLabRespawn[p.UserId] = true
								end
								Remotes.LabFog:FireClient(p, false)
							end)
						end
						local d = (root.Position - hrp.Position).Magnitude
						if not nearestDist or d < nearestDist then
							nearest = root
							nearestDist = d
						end
					end
				end
				if nearest then
					-- CHASE (15 < default 16 walkspeed: scary but outrunnable)
					hum.WalkSpeed = 15
					hum:MoveTo(nearest.Position)
				else
					-- PATROL
					hum.WalkSpeed = 8
					local wp = waypoints[wpIndex]
					hum:MoveTo(wp)
					wpTimer = wpTimer + 0.15
					local flat = Vector3.new(hrp.Position.X - wp.X, 0, hrp.Position.Z - wp.Z)
					if flat.Magnitude < 6 or wpTimer > 7 then
						wpIndex = wpIndex % #waypoints + 1
						wpTimer = 0
					end
				end
			end
		end
	end)
end

return M
