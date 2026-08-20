-- Util.lua -- shared helper API for Weight Lifting Simulator (contract: Util section)
-- Plain Lua 5.1 syntax. Returns table M with M.Init(G).
-- Adapted from roblox-tycoon/src/Util.lua; adds weld/cyl, new colors, new fmt.

local RunService = game:GetService("RunService")
local Players = game:GetService("Players")
local Debris = game:GetService("Debris")

local M = {}
local G = nil

function M.Init(g)
	G = g
end

--------------------------------------------------------------------
-- Colors
--------------------------------------------------------------------

M.Colors = {
	green     = Color3.fromRGB(60, 220, 80),
	darkgreen = Color3.fromRGB(25, 115, 45),
	yellow    = Color3.fromRGB(255, 221, 40),
	orange    = Color3.fromRGB(255, 150, 40),
	red       = Color3.fromRGB(235, 45, 45),
	darkred   = Color3.fromRGB(130, 20, 20),
	black     = Color3.fromRGB(16, 16, 16),
	white     = Color3.fromRGB(245, 245, 245),
	gray      = Color3.fromRGB(130, 130, 135),
	darkgray  = Color3.fromRGB(70, 70, 75),
	pink      = Color3.fromRGB(255, 105, 180),
	blue      = Color3.fromRGB(45, 95, 235),
	lightblue = Color3.fromRGB(120, 190, 255),
	purple    = Color3.fromRGB(150, 60, 225),
	gold      = Color3.fromRGB(255, 200, 50),
	brown     = Color3.fromRGB(120, 80, 50),
	tan       = Color3.fromRGB(210, 180, 140),
	cyan      = Color3.fromRGB(60, 220, 220),
	granite   = Color3.fromRGB(140, 138, 133),
}

-- Resolve a color name / Color3 into a Color3.
-- "rainbow" (and nil-ish lookups of it) give a fresh random bright color per call.
function M.color(c)
	if typeof(c) == "Color3" then
		return c
	end
	if c == "rainbow" or c == nil then
		return Color3.fromHSV(math.random(), 1, 1)
	end
	return M.Colors[c] or M.Colors.white
end

--------------------------------------------------------------------
-- Part / model factories
--------------------------------------------------------------------

function M.part(props)
	props = props or {}
	local shape = props.Shape or "Block"
	local p
	if shape == "Wedge" then
		p = Instance.new("WedgePart")
	else
		p = Instance.new("Part")
		if shape == "Ball" then
			p.Shape = Enum.PartType.Ball
		elseif shape == "Cylinder" then
			p.Shape = Enum.PartType.Cylinder
		end
	end
	p.Name = props.Name or "Part"
	p.Size = props.Size or Vector3.new(4, 1, 4)
	p.CFrame = props.CFrame or CFrame.new(0, 5, 0)
	p.Color = M.color(props.Color or "gray")
	if props.Neon then
		p.Material = Enum.Material.Neon
	else
		local matName = props.Material or "SmoothPlastic"
		local ok, mat = pcall(function() return Enum.Material[matName] end)
		p.Material = (ok and mat) or Enum.Material.SmoothPlastic
	end
	p.Anchored = (props.Anchored ~= false)
	p.CanCollide = (props.CanCollide ~= false)
	p.Transparency = props.Transparency or 0
	if props.Reflectance then
		p.Reflectance = props.Reflectance
	end
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = props.Parent or workspace
	return p
end

-- Sugar for cylinders. NOTE: Roblox cylinders lie along their local X axis,
-- so Size.X is the length and Size.Y/Size.Z are the diameter.
function M.cyl(props)
	props = props or {}
	props.Shape = "Cylinder"
	return M.part(props)
end

function M.model(name, parent)
	local m = Instance.new("Model")
	m.Name = name or "Model"
	m.Parent = parent or workspace
	return m
end

-- Rigidly welds part b to part a with a WeldConstraint (parented to a).
function M.weld(a, b)
	local w = Instance.new("WeldConstraint")
	w.Part0 = a
	w.Part1 = b
	w.Parent = a
	return w
end

--------------------------------------------------------------------
-- Text helpers
--------------------------------------------------------------------

-- Floating billboard label above a part.
-- opts: {offsetY, width, height, textColor, alwaysOnTop, maxDistance}
function M.label(part, text, opts)
	opts = opts or {}
	local bb = Instance.new("BillboardGui")
	bb.Name = "Label"
	bb.Adornee = part
	bb.Size = UDim2.new(0, opts.width or 220, 0, opts.height or 60)
	bb.StudsOffset = Vector3.new(0, opts.offsetY or (part.Size.Y / 2 + 2.5), 0)
	bb.AlwaysOnTop = opts.alwaysOnTop and true or false
	bb.MaxDistance = opts.maxDistance or 200
	bb.LightInfluence = 0
	local tl = Instance.new("TextLabel")
	tl.Name = "Text"
	tl.Size = UDim2.new(1, 0, 1, 0)
	tl.BackgroundTransparency = 1
	tl.Font = Enum.Font.FredokaOne
	tl.Text = text or ""
	tl.TextScaled = true
	tl.TextColor3 = M.color(opts.textColor or "white")
	tl.TextStrokeColor3 = Color3.new(0, 0, 0)
	tl.TextStrokeTransparency = 0
	tl.Parent = bb
	bb.Parent = part
	return bb
end

-- Flat sign text on one face of a part.
function M.surfaceText(part, face, text, textColor, bgColor)
	local sg = Instance.new("SurfaceGui")
	sg.Name = "SurfaceText"
	if typeof(face) == "EnumItem" then
		sg.Face = face
	else
		local ok, f = pcall(function() return Enum.NormalId[face or "Front"] end)
		sg.Face = (ok and f) or Enum.NormalId.Front
	end
	sg.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	sg.PixelsPerStud = 50
	sg.LightInfluence = 0
	local tl = Instance.new("TextLabel")
	tl.Name = "Text"
	tl.Size = UDim2.new(1, 0, 1, 0)
	if bgColor then
		tl.BackgroundTransparency = 0
		tl.BackgroundColor3 = M.color(bgColor)
		tl.BorderSizePixel = 0
	else
		tl.BackgroundTransparency = 1
	end
	tl.Font = Enum.Font.FredokaOne
	tl.Text = text or ""
	tl.TextScaled = true
	tl.TextColor3 = M.color(textColor or "white")
	tl.TextStrokeColor3 = Color3.new(0, 0, 0)
	tl.TextStrokeTransparency = 0.4
	tl.Parent = sg
	sg.Parent = part
	return sg
end

--------------------------------------------------------------------
-- Number formatting: "0.1", "999", "1.5K", "25M", "1B", "2T",
-- "1Q" (1e15), "1Qi" (1e18), "1Sx" (1e21), "10Sx". No dollar sign.
-- One decimal max, trims ".0".
--------------------------------------------------------------------

local FMT_STEPS = {
	{1e21, "Sx"},
	{1e18, "Qi"},
	{1e15, "Q"},
	{1e12, "T"},
	{1e9,  "B"},
	{1e6,  "M"},
	{1e3,  "K"},
}

-- Round v to one decimal, then render trimming a trailing ".0".
local function oneDecimal(v)
	v = math.floor(v * 10 + 0.5) / 10
	if v == math.floor(v) then
		return tostring(math.floor(v))
	end
	return string.format("%.1f", v)
end

function M.fmt(n)
	n = tonumber(n) or 0
	local neg = n < 0
	local a = math.abs(n)
	local s
	if a < 1e3 then
		-- Small numbers keep sub-integer precision: 0 -> "0", 0.1 -> "0.1", 2.5 -> "2.5".
		s = oneDecimal(a)
		-- Rounding 999.99 up would cross into K territory; handle that edge.
		if tonumber(s) >= 1e3 then
			s = "1K"
		end
	else
		local suffix, div = "K", 1e3
		for _, step in ipairs(FMT_STEPS) do
			if a >= step[1] then
				suffix = step[2]
				div = step[1]
				break
			end
		end
		-- Floor (not round) the scaled value so we never show "1000K" etc.
		local v = math.floor((a / div) * 10) / 10
		if v == math.floor(v) then
			s = tostring(math.floor(v)) .. suffix
		else
			s = string.format("%.1f", v) .. suffix
		end
	end
	if neg then
		return "-" .. s
	end
	return s
end

--------------------------------------------------------------------
-- Touch with per-player debounce
--------------------------------------------------------------------

-- fn(player, character) fires only for alive real players, at most once
-- per `seconds` per player.
function M.touchOnce(part, seconds, fn)
	seconds = seconds or 1
	local last = {}
	local conn = part.Touched:Connect(function(hit)
		local char = hit and hit.Parent
		if not char then return end
		local hum = char:FindFirstChildOfClass("Humanoid")
		if not hum or hum.Health <= 0 then return end
		local player = Players:GetPlayerFromCharacter(char)
		if not player then return end
		local now = os.clock()
		if last[player] and (now - last[player]) < seconds then return end
		last[player] = now
		fn(player, char)
	end)
	return conn
end

--------------------------------------------------------------------
-- Spinners and movers -- ONE shared Heartbeat connection for all
--------------------------------------------------------------------

local anims = {}
local animConn = nil

local function ensureAnimLoop()
	if animConn then return end
	animConn = RunService.Heartbeat:Connect(function(dt)
		for i = #anims, 1, -1 do
			local a = anims[i]
			local part = a.part
			if (not part) or (not part.Parent) then
				table.remove(anims, i)
			else
				a.t = a.t + dt
				if a.kind == "spin" then
					local ang = a.t * a.speed
					local rot
					if a.axis == "X" then
						rot = CFrame.Angles(ang, 0, 0)
					elseif a.axis == "Z" then
						rot = CFrame.Angles(0, 0, ang)
					else
						rot = CFrame.Angles(0, ang, 0)
					end
					part.CFrame = a.base * rot
				else -- mover: cosine ping-pong between the two CFrames
					local alpha = 0.5 - 0.5 * math.cos((a.t / a.period) * math.pi * 2)
					part.CFrame = a.from:Lerp(a.to, alpha)
				end
			end
		end
	end)
end

-- Continuously rotates `part` around local axis ("X","Y","Z") at `speed` rad/s.
function M.spinner(part, axis, speed)
	table.insert(anims, {
		kind = "spin",
		part = part,
		base = part.CFrame,
		axis = string.upper(tostring(axis or "Y")),
		speed = speed or 2,
		t = 0,
	})
	ensureAnimLoop()
end

-- Ping-pong lerps `part` between `from` and `to` (CFrames or Vector3s) over
-- `period` seconds for a full out-and-back cycle.
function M.mover(part, from, to, period)
	local rot = part.CFrame - part.CFrame.Position
	if typeof(from) == "Vector3" then from = rot + from end
	if typeof(to) == "Vector3" then to = rot + to end
	table.insert(anims, {
		kind = "move",
		part = part,
		from = from,
		to = to,
		period = period or 4,
		t = 0,
	})
	ensureAnimLoop()
end

--------------------------------------------------------------------
-- Fireworks
--------------------------------------------------------------------

function M.firework(position)
	local holder = Instance.new("Part")
	holder.Name = "Firework"
	holder.Size = Vector3.new(1, 1, 1)
	holder.CFrame = CFrame.new(position)
	holder.Transparency = 1
	holder.Anchored = true
	holder.CanCollide = false
	holder.Parent = workspace

	local light = Instance.new("PointLight")
	light.Brightness = 6
	light.Range = 40
	light.Color = Color3.fromHSV(math.random(), 0.6, 1)
	light.Parent = holder

	for i = 1, 3 do
		local pe = Instance.new("ParticleEmitter")
		pe.Color = ColorSequence.new(Color3.fromHSV(math.random(), 1, 1))
		pe.LightEmission = 1
		pe.Lifetime = NumberRange.new(0.6, 1.4)
		pe.Speed = NumberRange.new(18, 42)
		pe.SpreadAngle = Vector2.new(180, 180)
		pe.Size = NumberSequence.new({
			NumberSequenceKeypoint.new(0, 0.9),
			NumberSequenceKeypoint.new(1, 0),
		})
		pe.Acceleration = Vector3.new(0, -14, 0)
		pe.Enabled = false
		pe.Parent = holder
		pe:Emit(35)
	end

	Debris:AddItem(holder, 3)
	return holder
end

return M
