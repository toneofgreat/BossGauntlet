-- ClientFX: floating money popups, lift arm animation, grow/burn effects and
-- zone lighting. LocalScript in StarterPlayerScripts. Cannot require server
-- modules - everything here is self-contained.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")
local Lighting = game:GetService("Lighting")
local SoundService = game:GetService("SoundService")
local Workspace = game:GetService("Workspace")

local localPlayer = Players.LocalPlayer
local playerGui = localPlayer:WaitForChild("PlayerGui")

local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local LiftFXEvent = Remotes:WaitForChild("LiftFX")
local GrowFXEvent = Remotes:WaitForChild("GrowFX")
local BurnFXEvent = Remotes:WaitForChild("BurnFX")

--------------------------------------------------------------------------------
-- Own overlay ScreenGui (SIZE UP text + burn vignette live here)
--------------------------------------------------------------------------------

local fxGui = Instance.new("ScreenGui")
fxGui.Name = "LiftFXGui"
fxGui.ResetOnSpawn = false
fxGui.IgnoreGuiInset = true
fxGui.DisplayOrder = 50
fxGui.Parent = playerGui

--------------------------------------------------------------------------------
-- (a) Floating money popups - pooled BillboardGuis, capped at 30 live
--------------------------------------------------------------------------------

local POPUP_CAP = 30
local popupPool = {}   -- free popup records {gui = BillboardGui, label = TextLabel}
local popupLive = 0

-- higher-tier items get a fancier popup color; default is money green
local popupColors = {
	moon = Color3.fromRGB(200, 200, 255), pluto = Color3.fromRGB(200, 200, 255),
	mars = Color3.fromRGB(255, 160, 120), earth = Color3.fromRGB(120, 200, 255),
	neptune = Color3.fromRGB(110, 150, 255), jupiter = Color3.fromRGB(255, 200, 140),
	sun = Color3.fromRGB(255, 230, 90), blackhole = Color3.fromRGB(200, 120, 255),
	universe = Color3.fromRGB(230, 180, 255),
	lavaball = Color3.fromRGB(255, 140, 40), lavaplanet = Color3.fromRGB(255, 140, 40),
	lavaeclipse = Color3.fromRGB(255, 110, 30), gdstar = Color3.fromRGB(255, 215, 0),
}

local function makePopup()
	local gui = Instance.new("BillboardGui")
	gui.Name = "LiftPopup"
	gui.Size = UDim2.new(0, 150, 0, 42)
	gui.AlwaysOnTop = true
	gui.LightInfluence = 0
	gui.MaxDistance = 200
	local label = Instance.new("TextLabel")
	label.Name = "Txt"
	label.BackgroundTransparency = 1
	label.Size = UDim2.new(1, 0, 1, 0)
	label.Font = Enum.Font.GothamBlack
	label.TextScaled = true
	label.TextColor3 = Color3.fromRGB(120, 255, 120)
	label.TextStrokeColor3 = Color3.fromRGB(0, 0, 0)
	label.TextStrokeTransparency = 0.2
	label.Parent = gui
	return {gui = gui, label = label}
end

local function spawnPopup(character, text, itemId)
	if popupLive >= POPUP_CAP then return end
	local head = character:FindFirstChild("Head")
	if not head then head = character:FindFirstChild("HumanoidRootPart") end
	if not head then return end

	local rec = table.remove(popupPool)
	if not rec then rec = makePopup() end
	popupLive = popupLive + 1

	local startOffset = Vector3.new(
		(math.random() - 0.5) * 3.5,
		2.2 + math.random() * 0.8,
		(math.random() - 0.5) * 1.5)
	rec.gui.StudsOffset = startOffset
	rec.gui.Adornee = head
	rec.label.Text = text .. " \240\159\146\170" -- muscle emoji (UTF-8 bytes)
	rec.label.TextColor3 = popupColors[itemId] or Color3.fromRGB(120, 255, 120)
	rec.label.TextTransparency = 0
	rec.label.TextStrokeTransparency = 0.2
	rec.gui.Parent = playerGui

	-- float up ~6 studs while fading over 0.8 s
	TweenService:Create(rec.gui,
		TweenInfo.new(0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
		{StudsOffset = startOffset + Vector3.new(0, 6, 0)}):Play()
	TweenService:Create(rec.label,
		TweenInfo.new(0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
		{TextTransparency = 1, TextStrokeTransparency = 1}):Play()

	task.delay(0.85, function()
		rec.gui.Adornee = nil
		rec.gui.Parent = nil
		popupLive = popupLive - 1
		table.insert(popupPool, rec)
	end)
end

--------------------------------------------------------------------------------
-- (b) Lift arm animation - tween shoulder Motor6D C0s, per-character state
--------------------------------------------------------------------------------

-- weak-keyed so dead characters do not leak state
local armStates = setmetatable({}, {__mode = "k"})

-- collect the shoulder Motor6Ds for a rig. R15: RightShoulder inside
-- RightUpperArm / LeftShoulder inside LeftUpperArm. R6 fallback: the
-- "Right Shoulder" / "Left Shoulder" motors inside Torso.
local function findShoulderMotors(character)
	local motors = {}
	local rua = character:FindFirstChild("RightUpperArm")
	local lua_ = character:FindFirstChild("LeftUpperArm")
	if rua then
		local m = rua:FindFirstChild("RightShoulder")
		if m and m:IsA("Motor6D") then
			table.insert(motors, {motor = m, c0 = m.C0, flip = 1})
		end
	end
	if lua_ then
		local m = lua_:FindFirstChild("LeftShoulder")
		if m and m:IsA("Motor6D") then
			table.insert(motors, {motor = m, c0 = m.C0, flip = -1})
		end
	end
	if #motors == 0 then
		-- R6 rig: shoulder motors live in the Torso
		local torso = character:FindFirstChild("Torso")
		if torso then
			local rm = torso:FindFirstChild("Right Shoulder")
			local lm = torso:FindFirstChild("Left Shoulder")
			if rm and rm:IsA("Motor6D") then
				table.insert(motors, {motor = rm, c0 = rm.C0, flip = 1})
			end
			if lm and lm:IsA("Motor6D") then
				table.insert(motors, {motor = lm, c0 = lm.C0, flip = -1})
			end
		end
	end
	return motors
end

local function playLiftAnim(character)
	local st = armStates[character]
	-- invalidate stale state (respawned rig, destroyed motors)
	if st then
		for _, e in ipairs(st.motors) do
			if e.motor.Parent == nil then
				st = nil
				armStates[character] = nil
				break
			end
		end
	end
	if not st then
		local motors = findShoulderMotors(character)
		if #motors == 0 then return end -- no shoulders found; popup alone is fine
		st = {motors = motors, tweens = {}}
		armStates[character] = st
	end

	-- cancel any running tween and snap back to the ORIGINAL stored pose so
	-- spam-clicking can never accumulate drift or corrupt the C0s
	for _, tw in ipairs(st.tweens) do
		tw:Cancel()
	end
	st.tweens = {}
	for _, e in ipairs(st.motors) do
		e.motor.C0 = e.c0
	end

	-- quick 0.25 s curl: up overhead (0.125 s) then auto-reverse back
	for _, e in ipairs(st.motors) do
		local target = e.c0
			* CFrame.Angles(math.rad(165), 0, math.rad(12 * e.flip))
		local tw = TweenService:Create(e.motor,
			TweenInfo.new(0.125, Enum.EasingStyle.Quad, Enum.EasingDirection.Out, 0, true),
			{C0 = target})
		tw:Play()
		table.insert(st.tweens, tw)
	end
end

--------------------------------------------------------------------------------
-- (c) Own-lift feedback: HUD counter pulse + soft built-in click sound
--------------------------------------------------------------------------------

local clickSound = Instance.new("Sound")
clickSound.Name = "LiftClick"
clickSound.SoundId = "rbxasset://sounds/electronicpingshort.wav" -- built-in only
clickSound.Volume = 0.15
clickSound.PlaybackSpeed = 1.8
clickSound.Parent = SoundService

local hudCounter = nil -- cached TextLabel from ClientUI's ScreenGui
local hudPulseTween = nil

local counterLabelNames = {
	"StrengthLabel", "StrengthCounter", "Counter", "PointsLabel",
	"Strength", "StrengthText", "Points",
}

local function findHudCounter()
	-- still valid?
	if hudCounter and hudCounter.Parent ~= nil and hudCounter:IsDescendantOf(playerGui) then
		return hudCounter
	end
	hudCounter = nil
	for _, gui in ipairs(playerGui:GetChildren()) do
		if gui:IsA("ScreenGui") and gui ~= fxGui then
			for _, name in ipairs(counterLabelNames) do
				local d = gui:FindFirstChild(name, true)
				if d and d:IsA("TextLabel") then
					hudCounter = d
					return hudCounter
				end
			end
		end
	end
	return nil
end

local function pulseHud()
	local label = findHudCounter()
	if not label then return end
	local scale = label:FindFirstChild("FXPulseScale")
	if not scale then
		scale = Instance.new("UIScale")
		scale.Name = "FXPulseScale"
		scale.Parent = label
	end
	if hudPulseTween then hudPulseTween:Cancel() end
	scale.Scale = 1
	hudPulseTween = TweenService:Create(scale,
		TweenInfo.new(0.07, Enum.EasingStyle.Quad, Enum.EasingDirection.Out, 0, true),
		{Scale = 1.14})
	hudPulseTween:Play()
end

--------------------------------------------------------------------------------
-- GrowFX: golden ring burst at the character, SIZE UP text + FOV punch if local
--------------------------------------------------------------------------------

local function goldRingBurst(character)
	local hrp = character:FindFirstChild("HumanoidRootPart")
	if not hrp then return end
	local ring = Instance.new("Part")
	ring.Name = "GrowRing"
	ring.Shape = Enum.PartType.Cylinder
	ring.Anchored = true
	ring.CanCollide = false
	ring.CanQuery = false
	ring.CanTouch = false
	ring.Material = Enum.Material.Neon
	ring.Color = Color3.fromRGB(255, 200, 60)
	ring.Size = Vector3.new(0.4, 2, 2)
	ring.Transparency = 0.1
	-- cylinders lie along X: roll 90 deg about Z so the flat disc is horizontal
	ring.CFrame = CFrame.new(hrp.Position - Vector3.new(0, 2, 0))
		* CFrame.Angles(0, 0, math.rad(90))
	ring.Parent = Workspace

	local att = Instance.new("Attachment")
	att.Parent = ring
	local pe = Instance.new("ParticleEmitter")
	pe.Color = ColorSequence.new(
		Color3.fromRGB(255, 220, 90), Color3.fromRGB(255, 170, 30))
	pe.LightEmission = 1
	pe.Speed = NumberRange.new(14, 24)
	pe.Lifetime = NumberRange.new(0.4, 0.9)
	pe.SpreadAngle = Vector2.new(180, 180)
	pe.Size = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 1.1),
		NumberSequenceKeypoint.new(1, 0),
	})
	pe.Rate = 0
	pe.Parent = att
	pe:Emit(45)

	-- shockwave: expand outward and fade
	TweenService:Create(ring,
		TweenInfo.new(0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
		{Size = Vector3.new(0.4, 36, 36), Transparency = 1}):Play()
	task.delay(1.3, function() ring:Destroy() end)
end

-- big center SIZE UP label (built once, reused)
local sizeLabel = Instance.new("TextLabel")
sizeLabel.Name = "SizeUpLabel"
sizeLabel.AnchorPoint = Vector2.new(0.5, 0.5)
sizeLabel.Position = UDim2.new(0.5, 0, 0.38, 0)
sizeLabel.Size = UDim2.new(0.7, 0, 0.16, 0)
sizeLabel.BackgroundTransparency = 1
sizeLabel.Font = Enum.Font.GothamBlack
sizeLabel.TextScaled = true
sizeLabel.TextColor3 = Color3.fromRGB(255, 210, 60)
sizeLabel.TextStrokeColor3 = Color3.fromRGB(60, 30, 0)
sizeLabel.TextStrokeTransparency = 0.1
sizeLabel.TextTransparency = 1
sizeLabel.Parent = fxGui
local sizeScale = Instance.new("UIScale")
sizeScale.Name = "Scale"
sizeScale.Parent = sizeLabel

local sizeGen = 0
local fovTween = nil

local function sizeUpLocal(multText)
	sizeGen = sizeGen + 1
	local myGen = sizeGen

	sizeLabel.Text = "\240\159\146\170 SIZE UP " .. tostring(multText) .. "!"
	sizeLabel.TextTransparency = 0
	sizeLabel.TextStrokeTransparency = 0.1
	sizeScale.Scale = 0.2
	-- pop in with a springy overshoot, hold, fade out - 1.5 s total
	TweenService:Create(sizeScale,
		TweenInfo.new(0.35, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
		{Scale = 1}):Play()
	task.delay(1.0, function()
		if sizeGen ~= myGen then return end -- a newer SIZE UP took over
		TweenService:Create(sizeLabel,
			TweenInfo.new(0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
			{TextTransparency = 1, TextStrokeTransparency = 1}):Play()
		TweenService:Create(sizeScale,
			TweenInfo.new(0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
			{Scale = 1.35}):Play()
	end)

	-- camera FOV punch 70 -> 78 -> 70
	local cam = Workspace.CurrentCamera
	if cam then
		if fovTween then fovTween:Cancel() end
		fovTween = TweenService:Create(cam,
			TweenInfo.new(0.15, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
			{FieldOfView = 78})
		fovTween:Play()
		task.delay(0.18, function()
			if sizeGen ~= myGen then return end
			if fovTween then fovTween:Cancel() end
			fovTween = TweenService:Create(cam,
				TweenInfo.new(0.55, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
				{FieldOfView = 70})
			fovTween:Play()
		end)
	end
end

--------------------------------------------------------------------------------
-- BurnFX: orange screen-edge vignette flash + fire emoji flicker
--------------------------------------------------------------------------------

-- four edge frames, each with a gradient fading toward the screen center
local vignetteFrames = {}
local function makeEdge(name, pos, size, gradRot)
	local f = Instance.new("Frame")
	f.Name = name
	f.BackgroundColor3 = Color3.fromRGB(255, 110, 20)
	f.BackgroundTransparency = 1
	f.BorderSizePixel = 0
	f.Position = pos
	f.Size = size
	f.ZIndex = 5
	local grad = Instance.new("UIGradient")
	grad.Rotation = gradRot
	grad.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0),
		NumberSequenceKeypoint.new(1, 1),
	})
	grad.Parent = f
	f.Parent = fxGui
	table.insert(vignetteFrames, f)
end
makeEdge("VigTop", UDim2.new(0, 0, 0, 0), UDim2.new(1, 0, 0.25, 0), 90)
makeEdge("VigBottom", UDim2.new(0, 0, 0.75, 0), UDim2.new(1, 0, 0.25, 0), -90)
makeEdge("VigLeft", UDim2.new(0, 0, 0, 0), UDim2.new(0.2, 0, 1, 0), 0)
makeEdge("VigRight", UDim2.new(0.8, 0, 0, 0), UDim2.new(0.2, 0, 1, 0), 180)

local fireLabel = Instance.new("TextLabel")
fireLabel.Name = "BurnFire"
fireLabel.AnchorPoint = Vector2.new(0.5, 0.5)
fireLabel.BackgroundTransparency = 1
fireLabel.Size = UDim2.new(0.12, 0, 0.12, 0)
fireLabel.Font = Enum.Font.GothamBlack
fireLabel.TextScaled = true
fireLabel.Text = "\240\159\148\165" -- fire emoji (UTF-8 bytes)
fireLabel.TextTransparency = 1
fireLabel.ZIndex = 6
fireLabel.Parent = fxGui

local burnGen = 0
local function burnFlash()
	burnGen = burnGen + 1
	local myGen = burnGen
	for _, f in ipairs(vignetteFrames) do
		f.BackgroundTransparency = 0.3
		TweenService:Create(f,
			TweenInfo.new(0.45, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
			{BackgroundTransparency = 1}):Play()
	end
	-- flickering fire emoji near the bottom of the screen
	fireLabel.Position = UDim2.new(0.5 + (math.random() - 0.5) * 0.2, 0, 0.8, 0)
	fireLabel.Rotation = (math.random() - 0.5) * 40
	fireLabel.TextTransparency = 0
	TweenService:Create(fireLabel,
		TweenInfo.new(0.45, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
		{TextTransparency = 1, Position = fireLabel.Position - UDim2.new(0, 0, 0.06, 0)}):Play()
	-- quick double-flicker: briefly re-show mid-fade
	task.delay(0.12, function()
		if burnGen ~= myGen then return end
		fireLabel.TextTransparency = 0.5
	end)
end

--------------------------------------------------------------------------------
-- Remote handlers
--------------------------------------------------------------------------------

LiftFXEvent.OnClientEvent:Connect(function(character, gainedText, itemId)
	if typeof(character) ~= "Instance" or not character.Parent then return end
	spawnPopup(character, tostring(gainedText), itemId)
	playLiftAnim(character)
	if character == localPlayer.Character then
		pulseHud()
		clickSound:Play()
	end
end)

GrowFXEvent.OnClientEvent:Connect(function(character, multText)
	if typeof(character) ~= "Instance" or not character.Parent then return end
	goldRingBurst(character)
	if character == localPlayer.Character then
		sizeUpLocal(multText)
	end
end)

BurnFXEvent.OnClientEvent:Connect(function()
	burnFlash()
end)

--------------------------------------------------------------------------------
-- Zone lighting: smooth lerp toward the profile of whichever zone we stand in
--------------------------------------------------------------------------------

local DAY = {
	clock = 14, brightness = 2,
	fogColor = Color3.fromRGB(192, 192, 192), fogEnd = 100000,
	ambient = Color3.fromRGB(128, 128, 128),
}
local SPACE = {
	clock = 0, brightness = 1,
	fogColor = Color3.fromRGB(6, 6, 16), fogEnd = 800,
	ambient = Color3.fromRGB(40, 40, 65),
}
local LAVA = {
	clock = 14, brightness = 2,
	fogColor = Color3.fromRGB(255, 100, 30), fogEnd = 450,
	ambient = Color3.fromRGB(255, 120, 40),
}

local function lerpNum(a, b, t)
	return a + (b - a) * t
end

RunService.Heartbeat:Connect(function(dt)
	local target = DAY
	local char = localPlayer.Character
	local hrp = char and char:FindFirstChild("HumanoidRootPart")
	if hrp then
		local p = hrp.Position
		if p.Y > 2000 then
			target = SPACE -- Space World floats at y = 3000
		elseif p.X > 550 and p.Y < 500 then
			target = LAVA -- volcanic cavern east of the gym
		end
	end
	-- small-step lerp: frame-rate-friendly smooth transition (~0.5 s to settle)
	local a = math.min(dt * 2.5, 1)
	Lighting.ClockTime = lerpNum(Lighting.ClockTime, target.clock, a)
	Lighting.Brightness = lerpNum(Lighting.Brightness, target.brightness, a)
	Lighting.FogEnd = lerpNum(Lighting.FogEnd, target.fogEnd, a)
	Lighting.FogColor = Lighting.FogColor:Lerp(target.fogColor, a)
	Lighting.OutdoorAmbient = Lighting.OutdoorAmbient:Lerp(target.ambient, a)
end)
