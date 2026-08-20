-- Auras.lua -- cosmetics: aura particle rigs, title billboard, Rock Morph.
-- Contract: Auras.Apply(player) is idempotent -- it wipes the character's
-- "AuraFX" folder and rebuilds everything from the player's equipped
-- attributes (EquippedAura, EquippedTitle, Morph, SizeMult). Data re-calls
-- Apply on CharacterAdded, so everything here survives respawn for free.
-- No asset ids anywhere: emitters use the default particle texture.

local M = {}
local G = nil

function M.Init(g)
	G = g
end

--------------------------------------------------------------------
-- Small builders
--------------------------------------------------------------------

-- Unanchored, massless, non-colliding part welded onto a character body
-- part, parented under the AuraFX folder so destroying the folder removes
-- it (the WeldConstraint lives on the fx part itself -- Util.weld parents
-- the constraint to its first argument).
local function fxPart(fx, bodyPart, name, size, offsetCF, props)
	props = props or {}
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.CFrame = bodyPart.CFrame * offsetCF
	p.Anchored = false
	p.CanCollide = false
	p.Massless = true
	p.CastShadow = false
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	if props.Shape == "Ball" then
		p.Shape = Enum.PartType.Ball
	elseif props.Shape == "Cylinder" then
		p.Shape = Enum.PartType.Cylinder
	end
	if props.Material then
		p.Material = props.Material
	end
	if props.Color then
		p.Color = props.Color
	end
	p.Transparency = props.Transparency or 1
	p.Parent = fx
	-- NoWeld: caller attaches the part itself (e.g. via a spin Motor6D --
	-- a rigid weld alongside the motor would fight it and kill the spin)
	if not props.NoWeld then
		G.Util.weld(p, bodyPart)
	end
	return p
end

-- ParticleEmitter with the DEFAULT texture (never set .Texture).
local function emitter(parent, props)
	local pe = Instance.new("ParticleEmitter")
	pe.Color = props.Color or ColorSequence.new(Color3.new(1, 1, 1))
	pe.Size = props.Size or NumberSequence.new(1)
	pe.Transparency = props.Transparency or NumberSequence.new(0)
	pe.Lifetime = props.Lifetime or NumberRange.new(1, 2)
	pe.Rate = props.Rate or 20
	pe.Speed = props.Speed or NumberRange.new(2, 4)
	pe.SpreadAngle = props.SpreadAngle or Vector2.new(25, 25)
	pe.Acceleration = props.Acceleration or Vector3.new(0, 0, 0)
	pe.LightEmission = props.LightEmission or 0
	pe.RotSpeed = props.RotSpeed or NumberRange.new(0, 0)
	pe.Rotation = props.Rotation or NumberRange.new(0, 360)
	if props.EmissionDirection then
		pe.EmissionDirection = props.EmissionDirection
	end
	pe.Parent = parent
	return pe
end

-- Continuous spin for welded rigs: a Motor6D between a character part and
-- the rig's center part. A huge DesiredAngle with a small MaxVelocity
-- makes the physics engine rotate it forever, and the motor dies with the
-- folder because it is parented inside it.
local function spinMotor(fx, bodyPart, centerPart, offsetCF, radPerStep)
	local motor = Instance.new("Motor6D")
	motor.Name = "SpinMotor"
	motor.Part0 = bodyPart
	motor.Part1 = centerPart
	motor.C0 = offsetCF
	motor.C1 = CFrame.new()
	-- negative speed = counter-rotation
	if radPerStep < 0 then
		motor.MaxVelocity = -radPerStep
		motor.DesiredAngle = -1e9
	else
		motor.MaxVelocity = radPerStep
		motor.DesiredAngle = 1e9
	end
	motor.Parent = fx
	return motor
end

-- Ring of neon orbs orbiting the player on a spun hub. All distances are in
-- body units (u = root half-height) so the ring grows with the player.
-- colorFn(i, n) -> Color3 per orb.
local function orbitOrbs(fx, root, n, radiusU, orbSizeU, speed, wobbleU, colorFn)
	local u = root.Size.Y / 2
	local hub = fxPart(fx, root, "OrbitHub", Vector3.new(0.4, 0.4, 0.4),
		CFrame.new(0, 0, 0), {NoWeld = true})
	spinMotor(fx, root, hub, CFrame.new(0, 0, 0), speed)
	for i = 1, n do
		local ang = (i / n) * math.pi * 2
		local orb = Instance.new("Part")
		orb.Name = "OrbitOrb" .. i
		orb.Shape = Enum.PartType.Ball
		local s = u * orbSizeU
		orb.Size = Vector3.new(s, s, s)
		orb.Material = Enum.Material.Neon
		orb.Color = colorFn(i, n)
		orb.Anchored = false
		orb.CanCollide = false
		orb.Massless = true
		orb.CastShadow = false
		-- gentle vertical wobble around the ring so it reads as a swirl
		orb.CFrame = hub.CFrame * CFrame.new(
			math.cos(ang) * u * radiusU,
			math.sin(ang * 2) * u * wobbleU,
			math.sin(ang) * u * radiusU)
		orb.Parent = fx
		G.Util.weld(orb, hub)
	end
	return hub
end

local function rainbowSequence()
	local kps = {}
	for i = 0, 6 do
		table.insert(kps, ColorSequenceKeypoint.new(i / 6, Color3.fromHSV(i / 6, 1, 1)))
	end
	return ColorSequence.new(kps)
end

local function fadeSequence(a, b)
	return NumberSequence.new({
		NumberSequenceKeypoint.new(0, a),
		NumberSequenceKeypoint.new(1, b),
	})
end

local function shrinkSequence(a, b)
	return NumberSequence.new({
		NumberSequenceKeypoint.new(0, a),
		NumberSequenceKeypoint.new(1, b),
	})
end

--------------------------------------------------------------------
-- Aura rigs. `u` is a body-scale unit (root half-height): the character's
-- parts are physically resized by Humanoid scaling, so proportioning off
-- part sizes makes every aura grow with the player automatically.
--------------------------------------------------------------------

local function auraFire(fx, root, torso)
	local u = root.Size.Y / 2
	local core = fxPart(fx, torso, "FireCore",
		Vector3.new(u * 1.6, u * 2.2, u * 1.0), CFrame.new(0, 0, 0))
	-- Body-hugging flames
	emitter(core, {
		Color = ColorSequence.new({
			ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 200, 60)),
			ColorSequenceKeypoint.new(0.5, Color3.fromRGB(255, 120, 20)),
			ColorSequenceKeypoint.new(1, Color3.fromRGB(200, 40, 10)),
		}),
		Size = shrinkSequence(u * 1.1, 0),
		Transparency = fadeSequence(0.15, 1),
		Lifetime = NumberRange.new(0.45, 0.9),
		Rate = 28,
		Speed = NumberRange.new(u * 2.5, u * 4),
		SpreadAngle = Vector2.new(20, 20),
		Acceleration = Vector3.new(0, u * 6, 0),
		LightEmission = 1,
		EmissionDirection = Enum.NormalId.Top,
	})
	-- Popping embers
	emitter(core, {
		Color = ColorSequence.new(Color3.fromRGB(255, 190, 80), Color3.fromRGB(255, 90, 20)),
		Size = shrinkSequence(u * 0.18, 0),
		Transparency = fadeSequence(0, 1),
		Lifetime = NumberRange.new(0.9, 1.6),
		Rate = 14,
		Speed = NumberRange.new(u * 4, u * 8),
		SpreadAngle = Vector2.new(70, 70),
		Acceleration = Vector3.new(0, u * 3, 0),
		LightEmission = 1,
		EmissionDirection = Enum.NormalId.Top,
	})
	-- Faint smoke above the flames
	emitter(core, {
		Color = ColorSequence.new(Color3.fromRGB(60, 55, 50)),
		Size = shrinkSequence(u * 0.9, u * 2.4),
		Transparency = fadeSequence(0.65, 1),
		Lifetime = NumberRange.new(1.4, 2.4),
		Rate = 6,
		Speed = NumberRange.new(u * 1.5, u * 2.5),
		SpreadAngle = Vector2.new(15, 15),
		Acceleration = Vector3.new(0, u * 2, 0),
		RotSpeed = NumberRange.new(-30, 30),
		EmissionDirection = Enum.NormalId.Top,
	})
	local light = Instance.new("PointLight")
	light.Color = Color3.fromRGB(255, 140, 40)
	light.Brightness = 2
	light.Range = 6 + u * 6
	light.Parent = core
	-- Orbiting fireballs, each trailing its own mini flame
	local hub = orbitOrbs(fx, root, 4, 2.3, 0.42, 0.032, 0.45, function(i)
		if i % 2 == 0 then return Color3.fromRGB(255, 150, 40) end
		return Color3.fromRGB(255, 90, 15)
	end)
	emitter(hub, {
		Color = ColorSequence.new(Color3.fromRGB(255, 130, 30)),
		Size = shrinkSequence(u * 0.3, 0),
		Transparency = fadeSequence(0.3, 1),
		Lifetime = NumberRange.new(0.4, 0.8),
		Rate = 10,
		Speed = NumberRange.new(u * 0.5, u * 1),
		SpreadAngle = Vector2.new(180, 180),
		LightEmission = 1,
	})
end

local function auraWater(fx, root, torso, humanoid)
	local u = root.Size.Y / 2
	-- Droplets rain off the whole body then fall
	local core = fxPart(fx, torso, "WaterCore",
		Vector3.new(u * 1.8, u * 2.2, u * 1.2), CFrame.new(0, 0, 0))
	emitter(core, {
		Color = ColorSequence.new(Color3.fromRGB(90, 170, 255), Color3.fromRGB(40, 110, 230)),
		Size = shrinkSequence(u * 0.22, u * 0.08),
		Transparency = fadeSequence(0.1, 0.8),
		Lifetime = NumberRange.new(0.8, 1.4),
		Rate = 30,
		Speed = NumberRange.new(u * 3, u * 5),
		SpreadAngle = Vector2.new(80, 80),
		Acceleration = Vector3.new(0, -u * 22, 0),
		LightEmission = 0.3,
		EmissionDirection = Enum.NormalId.Top,
	})
	-- Mist ring swirling at the feet
	local hip = 2
	if humanoid then hip = humanoid.HipHeight end
	local ring = fxPart(fx, root, "MistRing",
		Vector3.new(u * 0.4, u * 3.4, u * 3.4),
		CFrame.new(0, -(root.Size.Y / 2 + hip) + u * 0.3, 0) * CFrame.Angles(0, 0, math.rad(90)),
		{Shape = "Cylinder"})
	emitter(ring, {
		Color = ColorSequence.new(Color3.fromRGB(170, 215, 255)),
		Size = shrinkSequence(u * 1.6, u * 3.2),
		Transparency = fadeSequence(0.7, 1),
		Lifetime = NumberRange.new(1.5, 2.6),
		Rate = 10,
		Speed = NumberRange.new(u * 0.8, u * 1.6),
		SpreadAngle = Vector2.new(180, 40),
		RotSpeed = NumberRange.new(-40, 40),
		LightEmission = 0.15,
	})
	-- Orbiting water orbs + rising bubbles
	orbitOrbs(fx, root, 3, 2.1, 0.38, 0.022, 0.6, function()
		return Color3.fromRGB(70, 160, 255)
	end)
	emitter(core, {
		Color = ColorSequence.new(Color3.fromRGB(190, 230, 255)),
		Size = shrinkSequence(u * 0.1, u * 0.28),
		Transparency = fadeSequence(0.35, 1),
		Lifetime = NumberRange.new(1.2, 2),
		Rate = 12,
		Speed = NumberRange.new(u * 1.5, u * 2.5),
		SpreadAngle = Vector2.new(40, 40),
		Acceleration = Vector3.new(0, u * 3, 0),
		LightEmission = 0.4,
		EmissionDirection = Enum.NormalId.Top,
	})
	local wlight = Instance.new("PointLight")
	wlight.Color = Color3.fromRGB(80, 160, 255)
	wlight.Brightness = 1.5
	wlight.Range = 5 + u * 5
	wlight.Parent = core
end

local function auraVoid(fx, root)
	local u = root.Size.Y / 2
	-- Invisible hub spun by a Motor6D; six neon orbs welded to it orbit the player.
	local hub = fxPart(fx, root, "VoidHub", Vector3.new(0.4, 0.4, 0.4), CFrame.new(0, 0, 0),
		{NoWeld = true})
	local motor = spinMotor(fx, root, hub, CFrame.new(0, 0, 0), 0.025)
	motor.Name = "VoidSpin"
	local radius = u * 2.6
	for i = 1, 6 do
		local ang = (i / 6) * math.pi * 2
		local col
		if i % 2 == 0 then
			col = Color3.fromRGB(140, 40, 220) -- purple
		else
			col = Color3.fromRGB(20, 10, 30) -- near-black
		end
		local orb = Instance.new("Part")
		orb.Name = "VoidOrb" .. i
		orb.Shape = Enum.PartType.Ball
		orb.Size = Vector3.new(u * 0.55, u * 0.55, u * 0.55)
		orb.Material = Enum.Material.Neon
		orb.Color = col
		orb.Anchored = false
		orb.CanCollide = false
		orb.Massless = true
		orb.CastShadow = false
		-- Alternate orb heights so the ring looks like a slow swirl, not a halo
		local y = math.sin(ang * 3) * u * 0.5
		orb.CFrame = hub.CFrame * CFrame.new(math.cos(ang) * radius, y, math.sin(ang) * radius)
		orb.Parent = fx
		G.Util.weld(orb, hub)
	end
	local light = Instance.new("PointLight")
	light.Color = Color3.fromRGB(90, 30, 150)
	light.Brightness = 1.6
	light.Range = 6 + u * 7
	light.Parent = hub
	-- Slow black smoke curling off the body
	emitter(hub, {
		Color = ColorSequence.new(Color3.fromRGB(15, 8, 22)),
		Size = shrinkSequence(u * 1.2, u * 2.8),
		Transparency = fadeSequence(0.45, 1),
		Lifetime = NumberRange.new(2, 3.5),
		Rate = 7,
		Speed = NumberRange.new(u * 0.6, u * 1.2),
		SpreadAngle = Vector2.new(180, 180),
		Acceleration = Vector3.new(0, u * 0.8, 0),
		RotSpeed = NumberRange.new(-25, 25),
	})
	-- Spinning dark vortex disc under the feet
	local vortex = fxPart(fx, root, "VoidVortex",
		Vector3.new(u * 0.12, u * 3.6, u * 3.6),
		CFrame.new(0, -u * 2.4, 0) * CFrame.Angles(0, 0, math.rad(90)),
		{Shape = "Cylinder", Material = Enum.Material.Neon,
		 Color = Color3.fromRGB(60, 15, 100), Transparency = 0.45, NoWeld = true})
	spinMotor(fx, root, vortex,
		CFrame.new(0, -u * 2.4, 0) * CFrame.Angles(0, 0, math.rad(90)), 0.05)
	-- Purple star specks drifting upward off the vortex
	emitter(vortex, {
		Color = ColorSequence.new(Color3.fromRGB(170, 90, 255), Color3.fromRGB(90, 30, 160)),
		Size = shrinkSequence(u * 0.14, 0),
		Transparency = fadeSequence(0, 1),
		Lifetime = NumberRange.new(1.2, 2),
		Rate = 16,
		Speed = NumberRange.new(u * 1.5, u * 3),
		SpreadAngle = Vector2.new(25, 25),
		Acceleration = Vector3.new(0, u * 2, 0),
		LightEmission = 1,
	})
end

-- The 1-sextillion aura: rainbow sparkles + trail, golden halo, angel wings,
-- color-cycling light. Deliberately over the top.
local function auraRainbowGod(fx, root, torso, head)
	local u = root.Size.Y / 2

	-- Rainbow color-cycling sparkle emitter around the whole body
	local core = fxPart(fx, torso, "RainbowCore",
		Vector3.new(u * 1.8, u * 2.4, u * 1.2), CFrame.new(0, 0, 0))
	emitter(core, {
		Color = rainbowSequence(),
		Size = shrinkSequence(u * 0.55, 0),
		Transparency = fadeSequence(0, 1),
		Lifetime = NumberRange.new(0.8, 1.4),
		Rate = 70,
		Speed = NumberRange.new(u * 3, u * 6),
		SpreadAngle = Vector2.new(180, 180),
		LightEmission = 1,
	})

	-- Six rainbow orbs counter-orbiting the body, one per hue
	orbitOrbs(fx, root, 6, 2.5, 0.4, -0.03, 0.5, function(i, n)
		return Color3.fromHSV((i - 1) / n, 1, 1)
	end)

	-- Rainbow trail streaming off the torso
	local a0 = Instance.new("Attachment")
	a0.Name = "TrailTop"
	a0.Position = Vector3.new(0, core.Size.Y / 2, 0)
	a0.Parent = core
	local a1 = Instance.new("Attachment")
	a1.Name = "TrailBottom"
	a1.Position = Vector3.new(0, -core.Size.Y / 2, 0)
	a1.Parent = core
	local trail = Instance.new("Trail")
	trail.Attachment0 = a0
	trail.Attachment1 = a1
	trail.Color = rainbowSequence()
	trail.Transparency = fadeSequence(0.25, 1)
	trail.Lifetime = 0.55
	trail.WidthScale = NumberSequence.new(1)
	trail.LightEmission = 1
	trail.FaceCamera = true
	trail.Parent = core

	-- Golden Neon halo: a ring of segments on a slowly spinning hub above the head
	local haloHub = fxPart(fx, head, "HaloHub", Vector3.new(0.4, 0.4, 0.4),
		CFrame.new(0, head.Size.Y * 1.4, 0), {NoWeld = true})
	spinMotor(fx, head, haloHub, CFrame.new(0, head.Size.Y * 1.4, 0), 0.015)
	local hr = head.Size.Y * 0.9 -- halo radius
	local segs = 10
	for i = 1, segs do
		local ang = (i / segs) * math.pi * 2
		local seg = Instance.new("Part")
		seg.Name = "HaloSeg" .. i
		-- Chord length of the ring polygon, slightly overlapped so it reads as solid
		seg.Size = Vector3.new(2 * hr * math.sin(math.pi / segs) * 1.25, hr * 0.14, hr * 0.14)
		seg.Material = Enum.Material.Neon
		seg.Color = Color3.fromRGB(255, 210, 70)
		seg.Anchored = false
		seg.CanCollide = false
		seg.Massless = true
		seg.CastShadow = false
		-- Place on the circle, rotated so the segment lies along the tangent
		seg.CFrame = haloHub.CFrame
			* CFrame.Angles(0, ang, 0)
			* CFrame.new(hr, 0, 0)
			* CFrame.Angles(0, math.rad(90), 0)
		seg.Parent = fx
		G.Util.weld(seg, haloHub)
	end
	local haloLight = Instance.new("PointLight")
	haloLight.Color = Color3.fromRGB(255, 215, 90)
	haloLight.Brightness = 1.4
	haloLight.Range = 4 + u * 4
	haloLight.Parent = haloHub

	-- Two white part-built angel wings on the upper back (character front is -Z,
	-- so the back is +Z). Each wing = 5 fanned feather slabs + a shoulder root.
	for _, side in ipairs({-1, 1}) do
		local shoulder = fxPart(fx, torso, "WingRoot",
			Vector3.new(u * 0.35, u * 0.5, u * 0.35),
			CFrame.new(side * u * 0.55, u * 0.6, u * 0.65),
			{Transparency = 0, Material = Enum.Material.SmoothPlastic, Color = Color3.fromRGB(250, 250, 250)})
		for i = 0, 4 do
			local f = Instance.new("Part")
			f.Name = "Feather"
			f.Size = Vector3.new(u * 0.22, u * (2.6 - i * 0.38), u * 0.7)
			f.Material = Enum.Material.SmoothPlastic
			f.Color = Color3.fromRGB(252, 252, 252)
			f.Anchored = false
			f.CanCollide = false
			f.Massless = true
			f.CastShadow = false
			-- Fan outward and up: farther feathers sit wider, lower and more tilted
			f.CFrame = torso.CFrame
				* CFrame.new(side * u * (0.75 + i * 0.5), u * (1.1 - i * 0.28), u * (0.7 + i * 0.06))
				* CFrame.Angles(math.rad(-8), 0, side * math.rad(-(24 + i * 13)))
			f.Parent = fx
			G.Util.weld(f, torso)
		end
		-- Small covert feathers layered over the base for depth
		for i = 0, 2 do
			local c = Instance.new("Part")
			c.Name = "Covert"
			c.Size = Vector3.new(u * 0.24, u * (1.3 - i * 0.25), u * 0.5)
			c.Material = Enum.Material.SmoothPlastic
			c.Color = Color3.fromRGB(240, 240, 245)
			c.Anchored = false
			c.CanCollide = false
			c.Massless = true
			c.CastShadow = false
			c.CFrame = torso.CFrame
				* CFrame.new(side * u * (0.6 + i * 0.42), u * (0.95 - i * 0.2), u * 0.62)
				* CFrame.Angles(math.rad(-6), 0, side * math.rad(-(18 + i * 12)))
			c.Parent = fx
			G.Util.weld(c, torso)
		end
		shoulder.Name = "WingRoot" .. (side == -1 and "L" or "R")
	end

	-- Rainbow PointLight, hue-cycled by a loop that dies with the folder
	local rl = Instance.new("PointLight")
	rl.Name = "RainbowLight"
	rl.Brightness = 2
	rl.Range = 8 + u * 8
	rl.Color = Color3.fromHSV(0, 0.7, 1)
	rl.Parent = core
	task.spawn(function()
		local h = 0
		while rl.Parent do
			h = (h + 0.04) % 1
			rl.Color = Color3.fromHSV(h, 0.7, 1)
			task.wait(0.1)
		end
	end)
end

--------------------------------------------------------------------
-- Title billboard
--------------------------------------------------------------------

local function titleColor(name)
	for _, t in ipairs(G.Config.Titles) do
		if t[2] == name then
			return Color3.fromRGB(t[3][1], t[3][2], t[3][3])
		end
	end
	return Color3.new(1, 1, 1)
end

local TITLE_EMOJI = {
	["Noobie"] = "\u{1F423}",       -- hatching chick
	["Starter"] = "\u{2B50}",       -- star
	["Beginner"] = "\u{1F331}",     -- seedling
	["Rookie"] = "\u{1F949}",       -- bronze medal
	["Pro"] = "\u{1F3C6}",          -- trophy
	["Hacker"] = "\u{1F4BB}",       -- laptop
	["1010101"] = "\u{1F47E}",      -- space invader
	["Bot"] = "\u{1F916}",          -- robot
	["Hecker"] = "\u{1F608}",       -- smiling imp
	["God"] = "\u{26A1}",           -- lightning
	["The Rock"] = "\u{1F5FF}",     -- moai
}
-- Legendary tiers get a shimmering stroke
local TITLE_LEGEND = { ["God"] = true, ["The Rock"] = true, ["Hecker"] = true }

local function buildTitleTag(fx, head, name, sizeMult)
	local color = titleColor(name)
	local emoji = TITLE_EMOJI[name]
	local text = name
	if emoji then text = emoji .. " " .. name .. " " .. emoji end
	-- Studs-based size (UDim2 scale = studs on a BillboardGui): the tag
	-- physically grows with the player instead of staying a fixed pixel label
	local w = 6.5 * sizeMult
	local h = 1.5 * sizeMult
	local bb = Instance.new("BillboardGui")
	bb.Name = "TitleTag"
	bb.Adornee = head
	bb.Size = UDim2.new(w, 0, h, 0)
	bb.StudsOffset = Vector3.new(0, head.Size.Y * 1.1 + h * 0.75, 0)
	bb.MaxDistance = 120 + 180 * sizeMult -- giants are visible from further away
	bb.LightInfluence = 0

	-- Rounded dark pill behind the text
	local frame = Instance.new("Frame")
	frame.Size = UDim2.new(1, 0, 1, 0)
	frame.BackgroundColor3 = Color3.fromRGB(14, 14, 20)
	frame.BackgroundTransparency = 0.3
	frame.BorderSizePixel = 0
	frame.Parent = bb
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0.5, 0)
	corner.Parent = frame
	local stroke = Instance.new("UIStroke")
	stroke.Color = color
	stroke.Thickness = 2.5
	stroke.Transparency = 0.05
	stroke.Parent = frame
	-- Subtle vertical sheen so the pill doesn't look flat
	local grad = Instance.new("UIGradient")
	grad.Rotation = 90
	grad.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 255, 255)),
		ColorSequenceKeypoint.new(0.45, Color3.fromRGB(150, 150, 160)),
		ColorSequenceKeypoint.new(1, Color3.fromRGB(90, 90, 100)),
	})
	grad.Parent = frame

	local tl = Instance.new("TextLabel")
	tl.Size = UDim2.new(0.92, 0, 0.74, 0)
	tl.Position = UDim2.new(0.04, 0, 0.13, 0)
	tl.BackgroundTransparency = 1
	tl.Font = Enum.Font.GothamBlack -- bold
	tl.Text = text
	tl.TextScaled = true
	tl.TextColor3 = color
	tl.TextStrokeColor3 = Color3.new(0, 0, 0)
	tl.TextStrokeTransparency = 0
	tl.Parent = frame

	-- Legendary titles shimmer: the stroke hue-cycles around the title color
	if TITLE_LEGEND[name] then
		local h0, s0, v0 = Color3.toHSV(color)
		if s0 < 0.2 then s0 = 0.6 end -- gray-ish colors still get a visible cycle
		task.spawn(function()
			local t = 0
			while bb.Parent do
				t = t + 0.08
				stroke.Color = Color3.fromHSV((h0 + math.sin(t) * 0.08) % 1, s0, v0)
				stroke.Transparency = 0.05 + 0.25 * (0.5 + 0.5 * math.sin(t * 2))
				task.wait(0.08)
			end
		end)
	end

	bb.Parent = fx
end

--------------------------------------------------------------------
-- Rock Morph -- full-body granite statue with an ORIGINAL raised-eyebrow
-- rocky head shell. Accessories/face are destroyed; unmorphing restores
-- the real look by reloading the character (Data re-applies on spawn).
--------------------------------------------------------------------

local STONE = Color3.fromRGB(126, 123, 118)
local STONE_LIGHT = Color3.fromRGB(158, 155, 149)
local STONE_DARK = Color3.fromRGB(70, 68, 64)

-- One angular granite slab welded to the head. All offsets are in head-size
-- units so the shell fits any HeadScale. Front of the face is -Z.
local function slab(fx, head, name, sx, sy, sz, ox, oy, oz, rx, ry, rz, color)
	local u = head.Size.Y
	local p = Instance.new("Part")
	p.Name = name
	p.Size = Vector3.new(u * sx, u * sy, u * sz)
	p.Material = Enum.Material.Granite
	p.Color = color or STONE
	p.Anchored = false
	p.CanCollide = false
	p.Massless = true
	p.CastShadow = false
	p.CFrame = head.CFrame
		* CFrame.new(u * ox, u * oy, u * oz)
		* CFrame.Angles(math.rad(rx or 0), math.rad(ry or 0), math.rad(rz or 0))
	p.Parent = fx
	G.Util.weld(p, head)
	return p
end

local function applyRockMorph(char, fx, head)
	-- Strip accessories, clothing textures and the face decal: nothing but stone
	for _, obj in ipairs(char:GetChildren()) do
		if obj:IsA("Accessory") or obj:IsA("Shirt") or obj:IsA("Pants") or obj:IsA("ShirtGraphic") then
			obj:Destroy()
		end
	end
	if head and head.Name == "Head" then
		for _, d in ipairs(head:GetChildren()) do
			if d:IsA("Decal") then d:Destroy() end
		end
	end
	-- Every body part becomes granite stone-gray (skip fx rig parts and tools)
	for _, p in ipairs(char:GetDescendants()) do
		if p:IsA("BasePart") and not p:IsDescendantOf(fx)
			and not p:FindFirstAncestorOfClass("Tool") then
			p.Material = Enum.Material.Granite
			p.Color = STONE
		end
	end

	if not head or head.Name ~= "Head" then return end -- no head to decorate

	-- Blocky rocky head shell: heavy brow, one raised eyebrow, square jaw,
	-- chipped cranium -- the funniest granite statue we can build from slabs.
	slab(fx, head, "Cranium",    1.15, 0.30, 0.95,  0,     0.52,  0.02,  0, 4, 0)
	slab(fx, head, "CraniumChip",0.45, 0.22, 0.45,  0.28,  0.66, -0.10,  8, 20, -6, STONE_LIGHT)
	slab(fx, head, "BrowRidge",  1.10, 0.26, 0.42,  0,     0.30, -0.38,  12, 0, 0)
	-- Left eyebrow: flat and stern
	slab(fx, head, "BrowL",      0.46, 0.13, 0.16, -0.27,  0.40, -0.55,  0, 0, 4)
	-- Right eyebrow: RAISED -- lifted higher and cocked, the signature look
	slab(fx, head, "BrowR",      0.46, 0.13, 0.16,  0.27,  0.55, -0.55,  0, 0, -20)
	-- Stone eyes: light sclera slab + dark pupil chip under each brow
	slab(fx, head, "EyeL",       0.28, 0.14, 0.06, -0.26,  0.24, -0.545, 0, 0, 0, STONE_LIGHT)
	slab(fx, head, "EyeR",       0.28, 0.16, 0.06,  0.26,  0.30, -0.545, 0, 0, -6, STONE_LIGHT)
	slab(fx, head, "PupilL",     0.10, 0.10, 0.05, -0.24,  0.24, -0.56,  0, 0, 0, STONE_DARK)
	slab(fx, head, "PupilR",     0.10, 0.10, 0.05,  0.28,  0.30, -0.56,  0, 0, 0, STONE_DARK)
	-- Chiselled nose and cheekbones
	slab(fx, head, "Nose",       0.20, 0.36, 0.22,  0,     0.02, -0.56,  6, 0, 0)
	slab(fx, head, "CheekL",     0.28, 0.24, 0.28, -0.44,  0.02, -0.40,  0, -12, 6)
	slab(fx, head, "CheekR",     0.28, 0.24, 0.28,  0.44,  0.02, -0.40,  0, 12, -6)
	-- Massive square jaw and chin
	slab(fx, head, "Jaw",        1.02, 0.36, 0.55,  0,    -0.36, -0.12,  -6, 0, 0)
	slab(fx, head, "Chin",       0.52, 0.24, 0.30,  0,    -0.50, -0.42,  0, 0, 0)
	-- A thin lopsided smirk, tilted toward the raised brow
	slab(fx, head, "Smirk",      0.48, 0.07, 0.08,  0.06, -0.24, -0.55,  0, 0, -7, STONE_DARK)
	-- Blocky granite ears
	slab(fx, head, "EarL",       0.12, 0.30, 0.24, -0.60,  0.05,  0,     0, 0, 6)
	slab(fx, head, "EarR",       0.12, 0.30, 0.24,  0.60,  0.05,  0,     0, 0, -6)

	char:SetAttribute("RockMorphed", true)
end

--------------------------------------------------------------------
-- Public API
--------------------------------------------------------------------

function M.Apply(player)
	local char = player.Character
	if not char or not char.Parent then return end

	-- Idempotent: nuke the previous rig entirely, then rebuild from attributes
	local old = char:FindFirstChild("AuraFX")
	if old then old:Destroy() end

	local root = char:FindFirstChild("HumanoidRootPart")
	if not root then
		root = char:WaitForChild("HumanoidRootPart", 5)
	end
	if not root then return end
	-- Graceful R15 fallbacks: any missing part falls back toward the root
	local head = char:FindFirstChild("Head") or root
	local torso = char:FindFirstChild("UpperTorso") or head
	local humanoid = char:FindFirstChildOfClass("Humanoid")

	local fx = Instance.new("Folder")
	fx.Name = "AuraFX"
	fx.Parent = char

	-- 1) Rock Morph first, so the granite recolor never touches aura parts
	local morph = player:GetAttribute("Morph")
	if morph then
		applyRockMorph(char, fx, head)
	elseif char:GetAttribute("RockMorphed") then
		-- Unmorph: the stone look destroyed accessories/face, so restore the
		-- real avatar with a respawn; Data.HookPlayers re-applies everything.
		char:SetAttribute("RockMorphed", nil)
		task.defer(function()
			if player.Parent and player.Character == char then
				player:LoadCharacter()
			end
		end)
		return
	end

	-- 2) Equipped aura rig
	local aura = player:GetAttribute("EquippedAura") or ""
	if aura == "fire" then
		auraFire(fx, root, torso)
	elseif aura == "water" then
		auraWater(fx, root, torso, humanoid)
	elseif aura == "void" then
		auraVoid(fx, root)
	elseif aura == "rainbowgod" then
		auraRainbowGod(fx, root, torso, head)
	end

	-- 3) Title billboard
	local title = player:GetAttribute("EquippedTitle") or ""
	if title ~= "" then
		local sizeMult = player:GetAttribute("SizeMult") or 1
		buildTitleTag(fx, head, title, sizeMult)
	end
end

return M
