-- ItemsCore.lua -- Boss Tycoon
-- Shared factory for conveyors, droppers, upgraders and collectors.
-- Contract API:
--   ItemsCore.MakeConveyor(G, parent, cframe, length, width, speed, colorName)
--   ItemsCore.MakeDropper(G, plot, opts)   opts = {cframe, colorName, dropValue, interval, manual}
--   ItemsCore.MakeUpgrader(G, plot, opts)  opts = {cframe, mult, add, colorName, name}
--   ItemsCore.MakeCollector(G, plot, opts) opts = {cframe, size}
--   ItemsCore.RestyleCollectors(plot, level) -- 1 = cool, 2 = super cool
-- No require() of siblings; everything reaches other modules through G.

local Debris = game:GetService("Debris")

local M = {}
local G

function M.Init(g)
	G = g
end

---------------------------------------------------------------------------
-- helpers
---------------------------------------------------------------------------

-- Attribute names must be alphanumeric/underscore only.
local function attrName(name)
	return "U_" .. string.gsub(tostring(name or "up"), "%W", "_")
end

-- Drop every itemsFolder wipe kills stale collector entries; prune them.
local function pruneCollectors(plot)
	local live = {}
	local list = plot.collectors or {}
	for i = 1, #list do
		local c = list[i]
		if c.body and c.body.Parent then
			table.insert(live, c)
		end
	end
	plot.collectors = live
end

---------------------------------------------------------------------------
-- MakeConveyor
---------------------------------------------------------------------------
-- Anchored belt; the classic surface-velocity conveyor. The belt part's
-- LookVector must point along the travel direction (the caller orients the
-- cframe); its Size.Z is the run length.
function M.MakeConveyor(G2, parent, cframe, length, width, speed, colorName)
	local Util = G2.Util
	local belt = Util.part({
		Name = "ConveyorBelt",
		Size = Vector3.new(width, 1, length),
		CFrame = cframe,
		Color = "black",
		Material = "SmoothPlastic",
		Anchored = true,
		CanCollide = true,
		Parent = parent,
	})
	belt.AssemblyLinearVelocity = belt.CFrame.LookVector * speed

	-- Neon trim rails down both sides (cosmetic only -- the purchasable
	-- Conveyor Walls are a separate, taller build).
	local railColor = colorName or "yellow"
	for side = -1, 1, 2 do
		Util.part({
			Name = "BeltRail",
			Size = Vector3.new(0.4, 0.6, length),
			CFrame = cframe * CFrame.new(side * (width / 2 + 0.3), 0.3, 0),
			Color = railColor,
			Neon = true,
			CanCollide = false,
			Anchored = true,
			Parent = belt,
		})
	end

	-- Glowing walkway stripes across the top so the belt reads as "moving".
	local stripeCount = math.max(2, math.floor(length / 8))
	local step = length / stripeCount
	for i = 1, stripeCount do
		local z = length / 2 - (i - 0.5) * step
		Util.part({
			Name = "BeltStripe",
			Size = Vector3.new(width * 0.8, 0.1, 0.5),
			CFrame = cframe * CFrame.new(0, 0.53, z),
			Color = railColor,
			Neon = true,
			Transparency = 0.25,
			CanCollide = false,
			Anchored = true,
			Parent = belt,
		})
	end

	return belt
end

---------------------------------------------------------------------------
-- MakeDropper
---------------------------------------------------------------------------
-- opts.cframe is the center of the dropper HEAD (hang it above the belt).
-- Drops: 1.2-stud neon cubes with a NumberValue "Cash", Debris-cleaned
-- after 30s. Auto droppers loop while the head still exists (Parent check),
-- so a plot wipe or nuke stops them cleanly.
function M.MakeDropper(G2, plot, opts)
	local Util = G2.Util
	local colorName = opts.colorName or "green"
	local model = Util.model("Dropper", plot.itemsFolder)

	local head = Util.part({
		Name = "DropperHead",
		Size = Vector3.new(3, 2.4, 3),
		CFrame = opts.cframe,
		Color = colorName,
		Material = "SmoothPlastic",
		Anchored = true,
		Parent = model,
	})
	-- glowing band around the head
	Util.part({
		Name = "DropperBand",
		Size = Vector3.new(3.2, 0.5, 3.2),
		CFrame = opts.cframe,
		Color = colorName,
		Neon = true,
		CanCollide = false,
		Anchored = true,
		Parent = model,
	})
	-- dark nozzle underneath
	Util.part({
		Name = "DropperNozzle",
		Size = Vector3.new(1.6, 1, 1.6),
		CFrame = opts.cframe * CFrame.new(0, -1.7, 0),
		Color = "black",
		Material = "SmoothPlastic",
		CanCollide = false,
		Anchored = true,
		Parent = model,
	})

	local labelText
	if opts.manual then
		labelText = "CLICK ME! " .. Util.fmt(opts.dropValue)
	else
		labelText = "DROPS " .. Util.fmt(opts.dropValue)
	end
	Util.label(head, labelText)

	local spawnCF = opts.cframe * CFrame.new(0, -2.8, 0)

	local function dropOne()
		local jitterX = math.random(-4, 4) * 0.04
		local jitterZ = math.random(-4, 4) * 0.04
		local drop = Util.part({
			Name = "Drop",
			Size = Vector3.new(1.2, 1.2, 1.2),
			CFrame = spawnCF * CFrame.new(jitterX, 0, jitterZ),
			Color = colorName,
			Neon = true,
			Anchored = false,
			CanCollide = true,
			Parent = plot.itemsFolder,
		})
		local cash = Instance.new("NumberValue")
		cash.Name = "Cash"
		cash.Value = opts.dropValue
		cash.Parent = drop
		Debris:AddItem(drop, 30)
		return drop
	end

	if opts.manual then
		local click = Instance.new("ClickDetector")
		click.MaxActivationDistance = 32
		click.Parent = head
		click.MouseClick:Connect(function(player)
			-- owner-only clicker
			if plot.owner and player == plot.owner and head.Parent then
				dropOne()
			end
		end)
	else
		local interval = opts.interval or 2
		task.spawn(function()
			while head.Parent do
				task.wait(interval)
				if head.Parent then
					dropOne()
				end
			end
		end)
	end

	return model
end

---------------------------------------------------------------------------
-- MakeUpgrader
---------------------------------------------------------------------------
-- A neon arch over the conveyor. A thin, nearly-invisible laser beam inside
-- it retags every drop once (attribute U_<name>) and applies value*mult+add.
-- opts.cframe = center of the conveyor at belt-top height, oriented like the
-- conveyor (LookVector along travel), so local X spans across the belt.
function M.MakeUpgrader(G2, plot, opts)
	local Util = G2.Util
	local colorName = opts.colorName or "blue"
	local mult = opts.mult or 1
	local add = opts.add or 0
	local attr = attrName(opts.name)
	local model = Util.model("Upgrader_" .. tostring(opts.name), plot.itemsFolder)

	for side = -1, 1, 2 do
		Util.part({
			Name = "UpgraderPillar",
			Size = Vector3.new(1.2, 7, 1.2),
			CFrame = opts.cframe * CFrame.new(side * 4.1, 3.5, 0),
			Color = "gray",
			Material = "Metal",
			Anchored = true,
			Parent = model,
		})
	end
	local topbar = Util.part({
		Name = "UpgraderTop",
		Size = Vector3.new(9.4, 1.2, 1.2),
		CFrame = opts.cframe * CFrame.new(0, 7.3, 0),
		Color = colorName,
		Neon = true,
		Anchored = true,
		Parent = model,
	})

	local fx = ""
	if mult ~= 1 then
		fx = "x" .. tostring(mult)
	end
	if add ~= 0 then
		if fx ~= "" then
			fx = fx .. " "
		end
		fx = fx .. "+" .. tostring(add)
	end
	Util.label(topbar, tostring(opts.name) .. "  " .. fx)

	-- the laser
	local beam = Util.part({
		Name = "UpgraderBeam",
		Size = Vector3.new(8, 3, 0.4),
		CFrame = opts.cframe * CFrame.new(0, 1.8, 0),
		Color = colorName,
		Neon = true,
		Transparency = 0.55,
		CanCollide = false,
		Anchored = true,
		Parent = model,
	})

	local sparkle = Instance.new("ParticleEmitter")
	sparkle.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	sparkle.Enabled = false
	sparkle.Lifetime = NumberRange.new(0.4, 0.8)
	sparkle.Speed = NumberRange.new(3, 6)
	sparkle.SpreadAngle = Vector2.new(60, 60)
	sparkle.LightEmission = 1
	sparkle.Parent = beam

	beam.Touched:Connect(function(hit)
		local cash = hit:FindFirstChild("Cash")
		if not cash then
			return
		end
		if hit:GetAttribute(attr) then
			return -- once per drop per upgrader
		end
		hit:SetAttribute(attr, true)
		cash.Value = cash.Value * mult + add
		sparkle:Emit(6)
	end)

	return model
end

---------------------------------------------------------------------------
-- MakeCollector
---------------------------------------------------------------------------
-- Bin at the end of a conveyor. Drops that touch it pay plot.owner and get
-- destroyed (with a green "+$" pop). If the plot has no owner, drops are
-- destroyed WITHOUT paying. Registers itself in plot.collectors so
-- RestyleCollectors can upgrade the look of every collector at once.
function M.MakeCollector(G2, plot, opts)
	local Util = G2.Util
	local model = Util.model("Collector", plot.itemsFolder)
	local size = opts.size or Vector3.new(6, 5, 2)

	local body = Util.part({
		Name = "CollectorBody",
		Size = size,
		CFrame = opts.cframe,
		Color = "gold",
		Material = "Metal",
		Anchored = true,
		Parent = model,
	})
	Util.surfaceText(body, "Front", "$ $ $", Color3.fromRGB(60, 255, 100), Color3.fromRGB(25, 25, 25))
	Util.surfaceText(body, "Back", "$ $ $", Color3.fromRGB(60, 255, 100), Color3.fromRGB(25, 25, 25))
	Util.label(body, "COLLECTOR")

	-- "+$" popup gui
	local popupGui = Instance.new("BillboardGui")
	popupGui.Name = "CashPopup"
	popupGui.Size = UDim2.new(0, 130, 0, 42)
	popupGui.StudsOffset = Vector3.new(0, size.Y / 2 + 4.5, 0)
	popupGui.AlwaysOnTop = true
	popupGui.Parent = body
	local popup = Instance.new("TextLabel")
	popup.Size = UDim2.new(1, 0, 1, 0)
	popup.BackgroundTransparency = 1
	popup.Font = Enum.Font.FredokaOne
	popup.TextScaled = true
	popup.TextColor3 = Color3.fromRGB(80, 255, 120)
	popup.TextStrokeTransparency = 0.2
	popup.Text = ""
	popup.Parent = popupGui

	local hideAt = 0
	local function pop(amount)
		popup.Text = "+" .. Util.fmt(amount)
		hideAt = os.clock() + 0.6
		task.delay(0.7, function()
			if os.clock() >= hideAt and popup.Parent then
				popup.Text = ""
			end
		end)
	end

	body.Touched:Connect(function(hit)
		local cash = hit:FindFirstChild("Cash")
		if not cash then
			return -- ignore players / random parts
		end
		if hit:GetAttribute("Collected") then
			return -- per-drop debounce
		end
		hit:SetAttribute("Collected", true)
		local owner = plot.owner
		if owner then
			G.Economy.Add(owner, cash.Value)
			pop(cash.Value)
		end
		-- no owner -> the drop is simply eaten, no payout
		hit:Destroy()
	end)

	pruneCollectors(plot)
	plot.collectors = plot.collectors or {}
	local entry = { model = model, body = body, level = 0 }
	table.insert(plot.collectors, entry)

	-- Collectors bought AFTER a restyle purchase come out already fancy.
	if plot.collectorStyle and plot.collectorStyle >= 1 then
		M.RestyleCollectors(plot, plot.collectorStyle)
	end

	return model
end

---------------------------------------------------------------------------
-- RestyleCollectors
---------------------------------------------------------------------------
-- level 1 "cool":  neon body + spinning neon ring above.
-- level 2 "super cool": everything above PLUS gold trim, sparkle particles
-- and a pulsing golden light. Levels stack; re-applying is a no-op.

local function styleCool(c)
	if c.level >= 1 then
		return
	end
	c.level = 1
	local Util = G.Util
	c.body.Material = Enum.Material.Neon
	local ringCF = c.body.CFrame * CFrame.new(0, c.body.Size.Y / 2 + 3, 0)
	local ring = Util.part({
		Name = "CollectorRing",
		Shape = "Cylinder",
		Size = Vector3.new(0.35, 4.2, 4.2),
		CFrame = ringCF,
		Color = "cyan",
		Neon = true,
		CanCollide = false,
		Anchored = true,
		Parent = c.model,
	})
	Util.spinner(ring, "Y", 2.2)
	c.ring = ring
end

local function styleSuper(c)
	if c.level >= 2 then
		return
	end
	styleCool(c)
	c.level = 2
	local Util = G.Util
	local s = c.body.Size
	local cfr = c.body.CFrame
	-- gold trim crown around the top edge
	local trims = {
		{ Vector3.new(s.X + 0.7, 0.5, 0.7), CFrame.new(0, s.Y / 2 + 0.15, s.Z / 2) },
		{ Vector3.new(s.X + 0.7, 0.5, 0.7), CFrame.new(0, s.Y / 2 + 0.15, -s.Z / 2) },
		{ Vector3.new(0.7, 0.5, s.Z + 0.7), CFrame.new(s.X / 2, s.Y / 2 + 0.15, 0) },
		{ Vector3.new(0.7, 0.5, s.Z + 0.7), CFrame.new(-s.X / 2, s.Y / 2 + 0.15, 0) },
	}
	for i = 1, #trims do
		Util.part({
			Name = "GoldTrim",
			Size = trims[i][1],
			CFrame = cfr * trims[i][2],
			Color = "gold",
			Neon = true,
			CanCollide = false,
			Anchored = true,
			Parent = c.model,
		})
	end
	-- golden sparkles
	local p = Instance.new("ParticleEmitter")
	p.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	p.Rate = 7
	p.Lifetime = NumberRange.new(0.6, 1.2)
	p.Speed = NumberRange.new(2, 4)
	p.SpreadAngle = Vector2.new(40, 40)
	p.LightEmission = 1
	p.Color = ColorSequence.new(Color3.fromRGB(255, 215, 60))
	p.Parent = c.body
	-- pulsing light
	local light = Instance.new("PointLight")
	light.Color = Color3.fromRGB(255, 215, 60)
	light.Range = 14
	light.Brightness = 2
	light.Parent = c.body
	task.spawn(function()
		local t = 0
		while light.Parent do
			local dt = task.wait(0.06)
			t = t + dt
			light.Brightness = 2 + 1.6 * math.sin(t * 5)
		end
	end)
end

function M.RestyleCollectors(plot, level)
	pruneCollectors(plot)
	plot.collectorStyle = math.max(plot.collectorStyle or 0, level)
	local list = plot.collectors or {}
	for i = 1, #list do
		if level >= 2 then
			styleSuper(list[i])
		elseif level >= 1 then
			styleCool(list[i])
		end
	end
end

return M
