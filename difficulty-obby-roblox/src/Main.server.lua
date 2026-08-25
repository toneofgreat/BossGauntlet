-- Difficulty Chart Obby - server runtime. See CONTRACT.md.
-- Builds the entire world from ReplicatedStorage.DCOData.StageIndex synchronously,
-- then wires up checkpoints, DataStore persistence, remotes, spinners and victory.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local DataStoreService = game:GetService("DataStoreService")
local Lighting = game:GetService("Lighting")

Players.RespawnTime = 2

local STAGE_COUNT = 90

-- ---------------------------------------------------------------------------
-- Stage data
-- ---------------------------------------------------------------------------
local stages = require(ReplicatedStorage.DCOData.StageIndex)
table.sort(stages, function(a, b) return a.n < b.n end)

local stageByN = {}
for i = 1, #stages do
	stageByN[stages[i].n] = stages[i]
end

-- ---------------------------------------------------------------------------
-- Style tables
-- ---------------------------------------------------------------------------
local DIFF_MATERIAL = {
	["The Beginning"] = Enum.Material.SmoothPlastic,
	["Exist"] = Enum.Material.SmoothPlastic,
	["Just Jump"] = Enum.Material.SmoothPlastic,
	["Simply Walk"] = Enum.Material.SmoothPlastic,
	["Walk Around It"] = Enum.Material.SmoothPlastic,
	["Cake Walk"] = Enum.Material.SmoothPlastic,
	["Effortless"] = Enum.Material.SmoothPlastic,
	["Easy"] = Enum.Material.SmoothPlastic,
	["Medium"] = Enum.Material.SmoothPlastic,
	["Hard"] = Enum.Material.Concrete,
	["Difficult"] = Enum.Material.Slate,
	["Challenging"] = Enum.Material.Brick,
	["Intense"] = Enum.Material.Basalt,
	["Remorseless"] = Enum.Material.Granite,
	["Insane"] = Enum.Material.Metal,
	["Extreme"] = Enum.Material.DiamondPlate,
	["Terrifying"] = Enum.Material.Cobblestone,
	["Catastrophic"] = Enum.Material.Neon,
	["NIL"] = Enum.Material.Glass,
	["Megadeath"] = Enum.Material.SmoothPlastic,
	["Dilly Impossible"] = Enum.Material.SmoothPlastic,
}

local GOLD = Color3.fromRGB(255, 200, 50)
local KILL_RED = Color3.fromRGB(255, 40, 40)

local PAD_COLOR_OVERRIDE = {
	["The Beginning"] = GOLD,
	["NIL"] = Color3.fromRGB(175, 175, 190),
	["Megadeath"] = Color3.fromRGB(255, 40, 40),
	["Dilly Impossible"] = Color3.fromRGB(255, 255, 255), -- animated rainbow at runtime
}

local GATE_COLOR_OVERRIDE = {
	["NIL"] = Color3.fromRGB(150, 150, 165),
	["Megadeath"] = Color3.fromRGB(255, 40, 40),
	["Dilly Impossible"] = Color3.fromRGB(255, 255, 255), -- animated rainbow at runtime
}

-- SelectionBox trim color per difficulty (nil = no trim). Dilly is special-cased
-- (rainbow hue cycled per platform index).
local TRIM_COLOR = {
	["The Beginning"] = GOLD,
	["Megadeath"] = Color3.fromRGB(255, 30, 30),
}

local RAINBOW = ColorSequence.new({
	ColorSequenceKeypoint.new(0.00, Color3.fromRGB(255, 0, 0)),
	ColorSequenceKeypoint.new(0.20, Color3.fromRGB(255, 170, 0)),
	ColorSequenceKeypoint.new(0.40, Color3.fromRGB(255, 255, 0)),
	ColorSequenceKeypoint.new(0.60, Color3.fromRGB(0, 220, 60)),
	ColorSequenceKeypoint.new(0.80, Color3.fromRGB(0, 120, 255)),
	ColorSequenceKeypoint.new(1.00, Color3.fromRGB(170, 0, 255)),
})

local CHECKPOINT_SOUND = "rbxasset://sounds/electronicpingshort.wav"
local WINNER_SOUND = "rbxasset://sounds/snap.mp3"

-- ---------------------------------------------------------------------------
-- DataStore layer (DCO_Progress_v1, key u_<UserId>, value {b=best, c=current})
-- ---------------------------------------------------------------------------
local progressStore = nil
do
	local ok, store = pcall(function()
		return DataStoreService:GetDataStore("DCO_Progress_v1")
	end)
	if ok then
		progressStore = store
	end
end

local dsAnySuccess = false
local dsAnyFailure = false

local function dsDetectedUnavailable()
	return progressStore == nil or (dsAnyFailure and not dsAnySuccess)
end

-- pcall + 1 retry
local function dsGet(key)
	if not progressStore then
		dsAnyFailure = true
		return false, nil
	end
	for attempt = 1, 2 do
		local ok, result = pcall(function()
			return progressStore:GetAsync(key)
		end)
		if ok then
			dsAnySuccess = true
			return true, result
		end
		dsAnyFailure = true
		if attempt == 1 then
			task.wait(1)
		end
	end
	return false, nil
end

local function dsSet(key, value)
	if not progressStore then
		dsAnyFailure = true
		return false
	end
	for attempt = 1, 2 do
		local ok = pcall(function()
			progressStore:SetAsync(key, value)
		end)
		if ok then
			dsAnySuccess = true
			return true
		end
		dsAnyFailure = true
		if attempt == 1 then
			task.wait(1)
		end
	end
	return false
end

-- Per-player runtime state
local state = {} -- [player] = {loadDone, dirty, saving, lastSave, teleporting}

local function markDirty(player)
	local st = state[player]
	if st then
		st.dirty = true
	end
end

local function clampStage(v, hi)
	v = tonumber(v)
	if v == nil or v ~= v then
		return nil
	end
	v = math.floor(v)
	if v < 1 then
		v = 1
	end
	if v > hi then
		v = hi
	end
	return v
end

local function loadPlayer(player, st)
	local ok, data = dsGet("u_" .. player.UserId)
	if ok and type(data) == "table" then
		local b = clampStage(data.b, STAGE_COUNT) or 1
		local c = clampStage(data.c, STAGE_COUNT) or b
		if c > b then
			c = b
		end
		if player.Parent then
			local curB = player:GetAttribute("BestStage") or 1
			local curC = player:GetAttribute("CurrentStage") or 1
			-- never lose progress made before the load resolved
			if b > curB then
				player:SetAttribute("BestStage", b)
			end
			if curC <= 1 and c > curC then
				player:SetAttribute("CurrentStage", c)
			end
			if curB > b then
				st.dirty = true
			end
		end
	end
	st.loadDone = true
end

local function savePlayer(player, st)
	if not st.dirty or st.saving or not st.loadDone then
		return
	end
	st.saving = true
	local b = clampStage(player:GetAttribute("BestStage"), STAGE_COUNT) or 1
	local c = clampStage(player:GetAttribute("CurrentStage"), STAGE_COUNT) or 1
	if c > b then
		c = b
	end
	st.dirty = false -- optimistic; changes during the yield re-set it
	local ok = dsSet("u_" .. player.UserId, { b = b, c = c })
	if ok then
		st.lastSave = os.clock()
	else
		st.dirty = true
	end
	st.saving = false
end

-- ---------------------------------------------------------------------------
-- World build (fully synchronous)
-- ---------------------------------------------------------------------------
local dcoFolder = Instance.new("Folder")
dcoFolder.Name = "DCO"

local spinnerArms = {} -- {part, x, y, z, base, speed, offset}
local rainbowParts = {} -- hue-cycled every heartbeat (Dilly pads/gates)
local padInfo = {} -- [padPart] = {color, light, sound, n}
local stage90Top = nil -- highest platform of stage 90 (winners area anchor)
local winnerPad = nil

local function stageColor(stage)
	return Color3.new(stage.color[1], stage.color[2], stage.color[3])
end

local function darker(col, f)
	return Color3.new(col.R * f, col.G * f, col.B * f)
end

local function humanoidFromPart(part)
	local m = part and part.Parent
	if not m then
		return nil
	end
	local hum = m:FindFirstChildOfClass("Humanoid")
	if hum then
		return hum
	end
	local m2 = m.Parent
	if m2 then
		return m2:FindFirstChildOfClass("Humanoid")
	end
	return nil
end

-- Shared kill handler for kind 2/6 parts. Health guard only avoids re-processing.
local function onKillTouched(hit)
	local hum = humanoidFromPart(hit)
	if hum and hum.Health > 0 then
		hum.Health = 0
	end
end

local function setKillFlags(part)
	part.CanCollide = false
	part.CanTouch = true
	part.CanQuery = false
	part.Touched:Connect(onKillTouched)
end

local function addTrim(part, color)
	local box = Instance.new("SelectionBox")
	box.Adornee = part
	box.LineThickness = 0.05
	box.Color3 = color
	box.Transparency = 0
	box.Parent = part
end

local function addSurfaceText(part, face, text, textColor, pixelsPerStud)
	local gui = Instance.new("SurfaceGui")
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = pixelsPerStud or 30
	gui.LightInfluence = 0
	gui.Brightness = 2
	local label = Instance.new("TextLabel")
	label.Size = UDim2.new(1, 0, 1, 0)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.GothamBlack
	label.TextScaled = true
	label.TextWrapped = true
	label.Text = text
	label.TextColor3 = textColor
	label.TextStrokeColor3 = Color3.fromRGB(0, 0, 0)
	label.TextStrokeTransparency = 0.4
	label.Parent = gui
	gui.Parent = part
end

local function addSurfaceTextBoth(part, text, textColor, pixelsPerStud)
	-- put the text on the two wide faces, whichever axis those are on
	if part.Size.X >= part.Size.Z then
		addSurfaceText(part, Enum.NormalId.Front, text, textColor, pixelsPerStud)
		addSurfaceText(part, Enum.NormalId.Back, text, textColor, pixelsPerStud)
	else
		addSurfaceText(part, Enum.NormalId.Left, text, textColor, pixelsPerStud)
		addSurfaceText(part, Enum.NormalId.Right, text, textColor, pixelsPerStud)
	end
end

-- Checkpoint touch feedback ---------------------------------------------------
local padFlashBusy = {}

local function flashPad(pad, info)
	if info.sound then
		info.sound:Play()
	end
	if padFlashBusy[pad] then
		return
	end
	padFlashBusy[pad] = true
	pad.Color = Color3.fromRGB(255, 255, 255)
	if info.light then
		info.light.Brightness = 8
	end
	task.delay(0.18, function()
		if pad.Parent then
			pad.Color = info.color
			if info.light then
				info.light.Brightness = 2
			end
		end
		padFlashBusy[pad] = nil
	end)
end

local touchDebounce = {} -- [userId] = os.clock() of last accepted touch

local function onCheckpointTouched(pad, hit)
	local info = padInfo[pad]
	if not info then
		return
	end
	local char = hit.Parent
	if not char then
		return
	end
	local hum = char:FindFirstChildOfClass("Humanoid")
	if not hum or hum.Health <= 0 then
		return
	end
	local player = Players:GetPlayerFromCharacter(char)
	if not player then
		return
	end
	local st = state[player]
	if not st then
		return
	end
	local now = os.clock()
	local last = touchDebounce[player.UserId]
	if last and now - last < 0.4 then
		return
	end
	touchDebounce[player.UserId] = now
	local n = info.n
	local cur = player:GetAttribute("CurrentStage") or 1
	if cur == n then
		return
	end
	player:SetAttribute("CurrentStage", n)
	local best = player:GetAttribute("BestStage") or 1
	if n > best then
		player:SetAttribute("BestStage", n)
	end
	markDirty(player)
	flashPad(pad, info)
end

-- Spinners --------------------------------------------------------------------
-- Pinned geometry (CONTRACT.md): `arms` box arms, Size = (radius, 0.8, armWidth),
-- extending from the hub center outward along +X, arm k yaw-rotated k*(360/arms)
-- degrees at t=0, arm bottom = y + 0.5 (center y + 0.9), positive speedDeg
-- rotates counterclockwise viewed from above.
local function buildSpinner(folder, p)
	local x, y, z = p[2], p[3], p[4]
	local radius, arms, speedDeg, armWidth = p[5], p[6], p[7], p[8]
	local hub = Instance.new("Part")
	hub.Name = "SpinnerHub"
	hub.Shape = Enum.PartType.Cylinder
	hub.Size = Vector3.new(1, 3, 3)
	hub.CFrame = CFrame.new(x, y + 0.5, z) * CFrame.Angles(0, 0, math.rad(90))
	hub.Anchored = true
	hub.CanCollide = false
	hub.CanTouch = false
	hub.CanQuery = false
	hub.Material = Enum.Material.Metal
	hub.Color = Color3.fromRGB(62, 62, 70)
	hub.TopSurface = Enum.SurfaceType.Smooth
	hub.BottomSurface = Enum.SurfaceType.Smooth
	hub.Parent = folder
	local step = 360 / arms
	for k = 1, arms do
		local arm = Instance.new("Part")
		arm.Name = "SpinnerArm"
		arm.Size = Vector3.new(radius, 0.8, armWidth)
		arm.Anchored = true
		arm.CanCollide = false
		arm.CanTouch = true
		arm.CanQuery = false
		arm.Material = Enum.Material.Neon
		arm.Color = KILL_RED
		arm.TopSurface = Enum.SurfaceType.Smooth
		arm.BottomSurface = Enum.SurfaceType.Smooth
		arm.CFrame = CFrame.new(x, y + 0.9, z)
			* CFrame.Angles(0, math.rad(k * step), 0)
			* CFrame.new(radius / 2, 0, 0)
		arm.Parent = folder
		spinnerArms[#spinnerArms + 1] = {
			part = arm,
			x = x,
			y = y + 0.9,
			z = z,
			base = k * step,
			speed = speedDeg,
			offset = radius / 2,
		}
	end
end

-- Checkpoint pads -------------------------------------------------------------
local function buildCheckpoint(stage, folder)
	local cp = stage.cp
	local col = PAD_COLOR_OVERRIDE[stage.diff] or stageColor(stage)
	local pad = Instance.new("Part")
	pad.Name = "Checkpoint" .. stage.n
	pad.Size = Vector3.new(6, 1, 6)
	pad.CFrame = CFrame.new(cp[1], cp[2] - 0.5, cp[3]) * CFrame.Angles(0, math.rad(cp[4] or 0), 0)
	pad.Anchored = true
	pad.CanCollide = true
	pad.Material = Enum.Material.Neon
	pad.Color = col
	pad.TopSurface = Enum.SurfaceType.Smooth
	pad.BottomSurface = Enum.SurfaceType.Smooth
	pad:SetAttribute("Stage", stage.n)

	local light = Instance.new("PointLight")
	light.Color = col
	light.Brightness = 2
	light.Range = 12
	light.Parent = pad

	local sound = Instance.new("Sound")
	sound.SoundId = CHECKPOINT_SOUND
	sound.Volume = 0.7
	sound.Parent = pad

	local billboard = Instance.new("BillboardGui")
	billboard.Name = "StageNumber"
	billboard.Size = UDim2.new(0, 56, 0, 24)
	billboard.StudsOffset = Vector3.new(0, 2.4, 0)
	billboard.MaxDistance = 90
	billboard.LightInfluence = 0
	local numLabel = Instance.new("TextLabel")
	numLabel.Size = UDim2.new(1, 0, 1, 0)
	numLabel.BackgroundTransparency = 1
	numLabel.Font = Enum.Font.GothamBlack
	numLabel.TextScaled = true
	numLabel.Text = tostring(stage.n)
	numLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
	numLabel.TextStrokeTransparency = 0.3
	numLabel.Parent = billboard
	billboard.Parent = pad

	padInfo[pad] = { color = col, light = light, sound = sound, n = stage.n }
	pad.Touched:Connect(function(hit)
		onCheckpointTouched(pad, hit)
	end)
	pad.Parent = folder

	if stage.diff == "Dilly Impossible" then
		rainbowParts[#rainbowParts + 1] = pad
	end
	return pad
end

-- Stage geometry --------------------------------------------------------------
local function buildStage(stage)
	local folder = Instance.new("Folder")
	folder.Name = "Stage" .. stage.n
	local col = stageColor(stage)
	local mat = DIFF_MATERIAL[stage.diff] or Enum.Material.SmoothPlastic
	local diff = stage.diff
	local isNil = diff == "NIL"
	local isDilly = diff == "Dilly Impossible"
	local trimColor = TRIM_COLOR[diff]
	local gateCrossbar = nil
	local gateCrossbarSx = -1
	local parts = stage.parts
	local platIndex = 0

	for i = 1, #parts do
		local p = parts[i]
		local kind = p[1]
		if kind == 9 then
			buildSpinner(folder, p)
		else
			local part = Instance.new("Part")
			part.Anchored = true
			part.TopSurface = Enum.SurfaceType.Smooth
			part.BottomSurface = Enum.SurfaceType.Smooth
			part.Size = Vector3.new(p[5], p[6], p[7])
			part.CFrame = CFrame.new(p[2], p[3], p[4]) * CFrame.Angles(0, math.rad(p[8] or 0), 0)

			if kind == 1 then
				platIndex = platIndex + 1
				part.Name = "Platform"
				part.Color = col
				part.Material = mat
				if isNil then
					part.Transparency = 0.3
					part.Reflectance = 0.15
				end
				if trimColor then
					addTrim(part, trimColor)
				elseif isDilly then
					addTrim(part, Color3.fromHSV((platIndex % 12) / 12, 1, 1))
				end
				if stage.n == 90 then
					local topY = p[3] + p[6] / 2
					if not stage90Top or topY > stage90Top.top then
						stage90Top = { x = p[2], z = p[4], top = topY }
					end
				end
			elseif kind == 2 then
				part.Name = "KillPart"
				part.Color = KILL_RED
				part.Material = Enum.Material.Neon
				setKillFlags(part)
			elseif kind == 3 then
				part.Name = "Deco"
				if stage.n == 1 then
					-- grassy floating island under the welcome plaza
					part.Color = Color3.fromRGB(88, 158, 66)
					part.Material = Enum.Material.Grass
				else
					part.Color = darker(col, 0.55)
					part.Material = mat
					if isNil then
						part.Transparency = 0.3
					end
				end
			elseif kind == 4 then
				part.Name = "Wall"
				part.Color = darker(col, 0.45)
				part.Material = mat
				if isNil then
					part.Transparency = 0.25
				end
			elseif kind == 6 then
				part.Name = "KillFloor"
				part.Transparency = 1
				setKillFlags(part)
			elseif kind == 7 then
				part.Name = "GatePart"
				part.Color = GATE_COLOR_OVERRIDE[diff] or col
				part.Material = Enum.Material.Neon
				if p[5] > gateCrossbarSx then
					gateCrossbarSx = p[5]
					gateCrossbar = part
				end
				if trimColor then
					addTrim(part, trimColor)
				end
				if isDilly then
					rainbowParts[#rainbowParts + 1] = part
				end
			elseif kind == 8 then
				part.Name = "StageSign"
				part.Color = Color3.fromRGB(35, 35, 42)
				part.Material = Enum.Material.SmoothPlastic
				addSurfaceTextBoth(part, "STAGE " .. stage.n .. "\n" .. stage.name, Color3.fromRGB(255, 255, 255), 40)
			else
				part.Name = "Deco"
				part.Color = darker(col, 0.55)
				part.Material = mat
			end
			part.Parent = folder
		end
	end

	-- Difficulty gate label: the kind-7 part with the largest sx is the crossbar.
	if gateCrossbar then
		local textColor = Color3.fromRGB(255, 255, 255)
		if diff == "Catastrophic" then
			textColor = Color3.fromRGB(20, 20, 20)
		end
		addSurfaceTextBoth(gateCrossbar, string.upper(diff), textColor, 25)
	end

	buildCheckpoint(stage, folder)
	folder.Parent = dcoFolder
end

for i = 1, #stages do
	buildStage(stages[i])
end

-- Invisible SpawnLocation at stage 1 so the engine never spawns anyone at the
-- void origin (CharacterAdded still pivots to the real checkpoint afterwards).
do
	local s1 = stageByN[1]
	if s1 then
		local spawnLoc = Instance.new("SpawnLocation")
		spawnLoc.Name = "DCOSpawn"
		spawnLoc.Size = Vector3.new(6, 1, 6)
		spawnLoc.CFrame = CFrame.new(s1.cp[1], s1.cp[2] - 0.5, s1.cp[3])
		spawnLoc.Anchored = true
		spawnLoc.CanCollide = false
		spawnLoc.CanQuery = false
		spawnLoc.Transparency = 1
		spawnLoc.Neutral = true
		spawnLoc.Duration = 0
		spawnLoc.Parent = dcoFolder
	end
end

-- Winners area ----------------------------------------------------------------
-- The data schema has no winner-pad kind, so the server builds the Winners area
-- on the top platform of stage 90's tower (inside the tower shell): gold pad +
-- floating gold deco, "YOU BEAT THE OBBY!" sign, confetti emitters.
local function addConfetti(parent, rate)
	local em = Instance.new("ParticleEmitter")
	em.Name = "Confetti"
	em.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	em.Color = RAINBOW
	em.Rate = rate
	em.Lifetime = NumberRange.new(1.5, 3)
	em.Speed = NumberRange.new(5, 9)
	em.SpreadAngle = Vector2.new(70, 70)
	em.EmissionDirection = Enum.NormalId.Top
	em.Size = NumberSequence.new(0.35)
	em.RotSpeed = NumberRange.new(-120, 120)
	em.LightEmission = 0.8
	em.Parent = parent
	return em
end

local winnerConfetti = {}
local winnerSound = nil

if stage90Top then
	local wf = Instance.new("Folder")
	wf.Name = "Winners"

	winnerPad = Instance.new("Part")
	winnerPad.Name = "WinnerPad"
	winnerPad.Size = Vector3.new(5, 0.5, 5)
	winnerPad.CFrame = CFrame.new(stage90Top.x, stage90Top.top + 0.25, stage90Top.z)
	winnerPad.Anchored = true
	winnerPad.CanCollide = true
	winnerPad.Material = Enum.Material.Neon
	winnerPad.Color = GOLD
	winnerPad.TopSurface = Enum.SurfaceType.Smooth
	winnerPad.BottomSurface = Enum.SurfaceType.Smooth
	local wLight = Instance.new("PointLight")
	wLight.Color = GOLD
	wLight.Brightness = 3
	wLight.Range = 16
	wLight.Parent = winnerPad
	winnerConfetti[#winnerConfetti + 1] = addConfetti(winnerPad, 15)
	winnerSound = Instance.new("Sound")
	winnerSound.SoundId = WINNER_SOUND
	winnerSound.Volume = 1
	winnerSound.Parent = winnerPad
	winnerPad.Parent = wf

	local sign = Instance.new("Part")
	sign.Name = "WinnerSign"
	sign.Size = Vector3.new(14, 5, 1)
	sign.CFrame = CFrame.new(stage90Top.x, stage90Top.top + 9, stage90Top.z)
	sign.Anchored = true
	sign.CanCollide = false
	sign.CanQuery = false
	sign.Material = Enum.Material.SmoothPlastic
	sign.Color = Color3.fromRGB(25, 25, 30)
	addTrim(sign, GOLD)
	addSurfaceTextBoth(sign, "YOU BEAT THE OBBY!", GOLD, 30)
	winnerConfetti[#winnerConfetti + 1] = addConfetti(sign, 12)
	sign.Parent = wf

	-- floating gold accent platforms (decorative, non-colliding)
	local corners = { { 6, 6 }, { 6, -6 }, { -6, 6 }, { -6, -6 } }
	for i = 1, #corners do
		local deco = Instance.new("Part")
		deco.Name = "WinnerDeco"
		deco.Size = Vector3.new(2, 0.5, 2)
		deco.CFrame = CFrame.new(stage90Top.x + corners[i][1], stage90Top.top + 7, stage90Top.z + corners[i][2])
		deco.Anchored = true
		deco.CanCollide = false
		deco.CanQuery = false
		deco.Material = Enum.Material.Neon
		deco.Color = GOLD
		deco.Parent = wf
	end

	wf.Parent = dcoFolder
end

-- Winner aura + billboard ------------------------------------------------------
local function applyWinnerAura(character)
	local hrp = character:FindFirstChild("HumanoidRootPart")
	if hrp and not hrp:FindFirstChild("DCOWinnerAura") then
		local em = Instance.new("ParticleEmitter")
		em.Name = "DCOWinnerAura"
		em.Texture = "rbxasset://textures/particles/sparkles_main.dds"
		em.Color = RAINBOW
		em.Rate = 24
		em.Lifetime = NumberRange.new(0.8, 1.6)
		em.Speed = NumberRange.new(1, 3)
		em.SpreadAngle = Vector2.new(180, 180)
		em.Size = NumberSequence.new(0.45)
		em.LightEmission = 1
		em.Parent = hrp
	end
	local head = character:FindFirstChild("Head") or hrp
	if head and not head:FindFirstChild("DCOWinnerBillboard") then
		local billboard = Instance.new("BillboardGui")
		billboard.Name = "DCOWinnerBillboard"
		billboard.Size = UDim2.new(0, 130, 0, 34)
		billboard.StudsOffset = Vector3.new(0, 2.2, 0)
		billboard.AlwaysOnTop = true
		billboard.LightInfluence = 0
		local label = Instance.new("TextLabel")
		label.Size = UDim2.new(1, 0, 1, 0)
		label.BackgroundTransparency = 1
		label.Font = Enum.Font.GothamBlack
		label.TextScaled = true
		label.Text = "WINNER"
		label.TextColor3 = Color3.fromRGB(255, 255, 255)
		label.TextStrokeTransparency = 0.2
		local gradient = Instance.new("UIGradient")
		gradient.Color = RAINBOW
		gradient.Parent = label
		label.Parent = billboard
		billboard.Parent = head
	end
end

if winnerPad then
	winnerPad.Touched:Connect(function(hit)
		local char = hit.Parent
		if not char then
			return
		end
		local hum = char:FindFirstChildOfClass("Humanoid")
		if not hum or hum.Health <= 0 then
			return
		end
		local player = Players:GetPlayerFromCharacter(char)
		if not player then
			return
		end
		if not player:GetAttribute("DCOWinner") then
			player:SetAttribute("DCOWinner", true)
			if winnerSound then
				winnerSound:Play()
			end
			for i = 1, #winnerConfetti do
				winnerConfetti[i]:Emit(80)
			end
		end
		applyWinnerAura(char)
	end)
end

-- Lighting --------------------------------------------------------------------
Lighting.Brightness = 2.2
Lighting.ClockTime = 14.2
Lighting.GeographicLatitude = 30
Lighting.Ambient = Color3.fromRGB(70, 70, 82)
Lighting.OutdoorAmbient = Color3.fromRGB(128, 130, 142)
Lighting.ShadowSoftness = 0.2

local sky = Instance.new("Sky")
sky.Name = "DCOSky"
sky.SunAngularSize = 14
sky.MoonAngularSize = 9
sky.StarCount = 3000
sky.Parent = Lighting

local atmosphere = Instance.new("Atmosphere")
atmosphere.Density = 0.28
atmosphere.Offset = 0.6
atmosphere.Color = Color3.fromRGB(199, 199, 214)
atmosphere.Decay = Color3.fromRGB(92, 105, 120)
atmosphere.Glare = 0.2
atmosphere.Haze = 1.2
atmosphere.Parent = Lighting

local bloom = Instance.new("BloomEffect")
bloom.Intensity = 0.4
bloom.Size = 24
bloom.Threshold = 1.6
bloom.Parent = Lighting

local sunRays = Instance.new("SunRaysEffect")
sunRays.Intensity = 0.08
sunRays.Spread = 0.6
sunRays.Parent = Lighting

-- Parent the finished world (synchronous build complete)
dcoFolder.Parent = workspace

-- ---------------------------------------------------------------------------
-- Heartbeat loop: spinner rotation + arm kills + rainbow accents
-- ---------------------------------------------------------------------------
local overlapParams = OverlapParams.new()
overlapParams.FilterType = Enum.RaycastFilterType.Exclude
overlapParams.FilterDescendantsInstances = { dcoFolder }

local spinStart = os.clock()
RunService.Heartbeat:Connect(function()
	local t = os.clock() - spinStart
	for i = 1, #spinnerArms do
		local a = spinnerArms[i]
		local ang = (a.base + a.speed * t) % 360
		a.part.CFrame = CFrame.new(a.x, a.y, a.z)
			* CFrame.Angles(0, math.rad(ang), 0)
			* CFrame.new(a.offset, 0, 0)
		-- Touched does not fire reliably for CFrame-moved anchored parts:
		-- kill via overlap query in this same loop.
		local hits = workspace:GetPartsInPart(a.part, overlapParams)
		for j = 1, #hits do
			local hum = humanoidFromPart(hits[j])
			if hum and hum.Health > 0 then
				hum.Health = 0
			end
		end
	end
	local hue = (t * 0.25) % 1
	for i = 1, #rainbowParts do
		rainbowParts[i].Color = Color3.fromHSV((hue + i * 0.13) % 1, 1, 1)
	end
end)

-- ---------------------------------------------------------------------------
-- Remotes (created only after the world build completed)
-- ---------------------------------------------------------------------------
local remotesFolder = Instance.new("Folder")
remotesFolder.Name = "DCORemotes"
local teleportRemote = Instance.new("RemoteEvent")
teleportRemote.Name = "TeleportToStage"
teleportRemote.Parent = remotesFolder
remotesFolder.Parent = ReplicatedStorage

-- ---------------------------------------------------------------------------
-- Spawning / teleporting (StreamingEnabled-safe pivots)
-- ---------------------------------------------------------------------------
local function pivotToStage(player, character, n)
	local stage = stageByN[n] or stageByN[1]
	if not stage then
		return nil
	end
	local cp = stage.cp
	local pos = Vector3.new(cp[1], cp[2], cp[3])
	local hrp = character:FindFirstChild("HumanoidRootPart")
	if not hrp then
		return nil
	end
	-- Anchor during the stream-in wait so the client-owned character cannot
	-- fall through unstreamed geometry, then pivot and release.
	hrp.Anchored = true
	pcall(function()
		player:RequestStreamAroundAsync(pos, 5)
	end)
	local target = CFrame.new(cp[1], cp[2] + 4, cp[3]) * CFrame.Angles(0, math.rad(cp[4] or 0), 0)
	if character.Parent then
		character:PivotTo(target)
	end
	hrp.Anchored = false
	return target
end

local function onCharacterAdded(player, character)
	task.spawn(function()
		local hrp = character:WaitForChild("HumanoidRootPart", 10)
		if not hrp then
			return
		end
		local t0 = os.clock()
		while not character:IsDescendantOf(workspace) and os.clock() - t0 < 10 do
			task.wait(0.05)
		end
		-- Bounded wait for the DataStore load so a returning player's first
		-- spawn goes to their saved stage.
		while os.clock() - t0 < 10 do
			local st = state[player]
			if not st or st.loadDone then
				break
			end
			task.wait(0.1)
		end
		task.wait() -- defer one step past engine spawn placement
		if not character.Parent then
			return
		end
		local n = player:GetAttribute("CurrentStage") or 1
		local target = pivotToStage(player, character, n)
		if target then
			task.delay(0.2, function()
				-- the engine's own spawn placement can overwrite the first pivot
				if character.Parent and hrp.Parent and (hrp.Position - target.Position).Magnitude > 10 then
					pivotToStage(player, character, player:GetAttribute("CurrentStage") or 1)
				end
			end)
		end
		if player:GetAttribute("DCOWinner") then
			applyWinnerAura(character)
		end
	end)
end

teleportRemote.OnServerEvent:Connect(function(player, n)
	if type(n) ~= "number" then
		return
	end
	if n ~= n or n % 1 ~= 0 then
		return
	end
	if n < 1 or n > STAGE_COUNT then
		return
	end
	local best = player:GetAttribute("BestStage") or 1
	if n > best then
		return
	end
	local st = state[player]
	if not st or st.teleporting then
		return
	end
	local character = player.Character
	if not character then
		return
	end
	local hum = character:FindFirstChildOfClass("Humanoid")
	if not hum or hum.Health <= 0 then
		return
	end
	st.teleporting = true
	player:SetAttribute("CurrentStage", n)
	markDirty(player)
	task.spawn(function()
		pivotToStage(player, character, n)
		st.teleporting = false
	end)
end)

-- ---------------------------------------------------------------------------
-- Player lifecycle
-- ---------------------------------------------------------------------------
local function onPlayerAdded(player)
	if state[player] then
		return
	end
	local st = {
		loadDone = false,
		dirty = false,
		saving = false,
		lastSave = 0,
		teleporting = false,
	}
	state[player] = st

	player:SetAttribute("BestStage", 1)
	player:SetAttribute("CurrentStage", 1)

	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"
	local stageValue = Instance.new("IntValue")
	stageValue.Name = "Stage"
	stageValue.Value = 1
	stageValue.Parent = leaderstats
	leaderstats.Parent = player

	player:GetAttributeChangedSignal("BestStage"):Connect(function()
		stageValue.Value = player:GetAttribute("BestStage") or 1
	end)

	player.CharacterAdded:Connect(function(character)
		onCharacterAdded(player, character)
	end)

	task.spawn(loadPlayer, player, st)
end

Players.PlayerAdded:Connect(onPlayerAdded)

Players.PlayerRemoving:Connect(function(player)
	local st = state[player]
	touchDebounce[player.UserId] = nil
	if st then
		state[player] = nil
		if st.dirty then
			task.spawn(savePlayer, player, st)
		end
	end
end)

-- Anyone who joined before the connections above were made
do
	local existing = Players:GetPlayers()
	for i = 1, #existing do
		local player = existing[i]
		onPlayerAdded(player)
		if player.Character then
			onCharacterAdded(player, player.Character)
		end
	end
end

-- Debounced autosave (>= 10 s per player, only when dirty)
task.spawn(function()
	while true do
		task.wait(2)
		local list = Players:GetPlayers()
		for i = 1, #list do
			local player = list[i]
			local st = state[player]
			if st and st.loadDone and st.dirty and not st.saving and os.clock() - st.lastSave >= 10 then
				task.spawn(savePlayer, player, st)
			end
		end
	end
end)

game:BindToClose(function()
	if dsDetectedUnavailable() then
		return
	end
	local pending = {}
	for player, st in pairs(state) do
		if st.dirty and st.loadDone then
			pending[#pending + 1] = { player = player, st = st }
		end
	end
	if #pending == 0 then
		return
	end
	local remaining = #pending
	for i = 1, #pending do
		local entry = pending[i]
		task.spawn(function()
			-- bypass the debounce; wait out any in-flight save first
			local waitUntil = os.clock() + 5
			while entry.st.saving and os.clock() < waitUntil do
				task.wait(0.1)
			end
			savePlayer(entry.player, entry.st)
			remaining = remaining - 1
		end)
	end
	local deadline = os.clock() + 20
	while remaining > 0 and os.clock() < deadline do
		task.wait(0.1)
	end
end)
