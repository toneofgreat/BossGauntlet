-- Tycoon.server.lua  —  a fully-scripted Roblox tycoon.
-- Builds each player a plot, reveals buy buttons one at a time (classic gating),
-- runs droppers -> conveyor -> collector -> un-banked cash, lets you BANK at a
-- cash collector, and sends robbers to steal un-banked cash every 20s.
-- Costs scale ~1.5x per floor. Saves with DataStore.

local Players           = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService        = game:GetService("RunService")
local DataStoreService  = game:GetService("DataStoreService")

local Config = require(ReplicatedStorage:WaitForChild("TycoonConfig"))

-- ── Remotes (for the client GUI) ─────────────────────────────────────────
local Remotes = Instance.new("Folder"); Remotes.Name = "Remotes"; Remotes.Parent = ReplicatedStorage
local Notify  = Instance.new("RemoteEvent"); Notify.Name = "Notify"; Notify.Parent = Remotes

-- ── DataStore ────────────────────────────────────────────────────────────
local STORE
pcall(function() STORE = DataStoreService:GetDataStore("RobloxTycoon_v1") end)

-- ── World containers ─────────────────────────────────────────────────────
local PlotsFolder = Instance.new("Folder"); PlotsFolder.Name = "Plots"; PlotsFolder.Parent = workspace
local baseplate = workspace:FindFirstChildWhichIsA("Terrain")  -- keep terrain if any

local plots          = {}   -- [userId] = plot state
local usedPlotIndex  = {}
local activeOre      = {}    -- { {part, value, plot, fs, x, applied={}} }

-- ── Helpers ──────────────────────────────────────────────────────────────
local function part(props, parent)
	local p = Instance.new("Part")
	p.Anchored = true; p.TopSurface = Enum.SurfaceType.Smooth; p.BottomSurface = Enum.SurfaceType.Smooth
	for k,v in pairs(props) do p[k] = v end
	p.Parent = parent
	return p
end

local function billboard(adornee, title, sub, color)
	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.fromOffset(170, 56); bb.StudsOffset = Vector3.new(0, 3.2, 0)
	bb.AlwaysOnTop = true; bb.Adornee = adornee; bb.Parent = adornee
	local t = Instance.new("TextLabel", bb)
	t.Size = UDim2.new(1,0,0.55,0); t.BackgroundTransparency = 1
	t.Font = Enum.Font.GothamBold; t.TextScaled = true; t.TextColor3 = color or Color3.new(1,1,1)
	t.TextStrokeTransparency = 0.3; t.Text = title
	local c = Instance.new("TextLabel", bb)
	c.Size = UDim2.new(1,0,0.45,0); c.Position = UDim2.new(0,0,0.55,0); c.BackgroundTransparency = 1
	c.Font = Enum.Font.GothamBold; c.TextScaled = true; c.TextColor3 = Color3.fromRGB(255,210,80)
	c.TextStrokeTransparency = 0.3; c.Text = sub
	return bb, c
end

local function money(n)
	n = math.floor(n)
	local units = {"","K","M","B","T"}
	local i = 1
	while n >= 1000 and i < #units do n = n/1000; i = i + 1 end
	return (i > 1 and string.format("%.2f", n) or tostring(n)) .. units[i]
end

local function costOf(btn)
	return math.floor(btn.baseCost * (Config.FLOOR_MULT ^ (btn.floor - 1)))
end

-- ── Floor (conveyor + collector + cash collector) ────────────────────────
local function buildFloor(plot, f)
	if plot.floors[f] then return plot.floors[f] end
	local o = plot.origin
	local y = 3 + (f-1) * Config.FLOOR_HEIGHT
	local startX, endX = o.X - 35, o.X + 45
	local z = o.Z

	-- floor slab
	part({Name="Floor"..f, Size=Vector3.new(110, 1, 90), Position=Vector3.new(o.X+5, y-0.5, z),
		Color = (f==1 and Color3.fromRGB(95,105,120)) or (f==2 and Color3.fromRGB(225,205,140)) or Color3.fromRGB(22,22,30),
		Material = Enum.Material.SmoothPlastic}, plot.model)

	-- conveyor
	local belt = part({Name="Belt"..f, Size=Vector3.new(endX-startX, 1, 6),
		Position=Vector3.new((startX+endX)/2, y+0.5, z+18), Color=Color3.fromRGB(45,45,52),
		Material=Enum.Material.Metal}, plot.model)

	-- collector at the end of the belt
	local collX = endX - 2
	part({Name="Collector"..f, Size=Vector3.new(4, 6, 10), Position=Vector3.new(collX+3, y+3, z+18),
		Color=Color3.fromRGB(40,90,140), Material=Enum.Material.Neon}, plot.model)

	-- cash collector pad (step on it to BANK)
	local cashPad = part({Name="CashPad"..f, Size=Vector3.new(10, 1, 10),
		Position=Vector3.new(o.X-30, y+0.5, z-22), Color=Color3.fromRGB(60,200,110),
		Material=Enum.Material.Neon}, plot.model)
	billboard(cashPad, "💰 CASH COLLECTOR", "you collect · others can steal", Color3.fromRGB(120,255,170))
	local bankDeb = false
	local lastSteal = -math.huge
	cashPad.Touched:Connect(function(hit)
		local plr = Players:GetPlayerFromCharacter(hit.Parent)
		if not plr then return end
		if plr.UserId == plot.userId then
			-- OWNER collects their own cash safely
			if bankDeb then return end; bankDeb = true
			local u = plot.uncollected.Value
			if u > 0 then
				plot.cash.Value += u
				plot.uncollected.Value = 0
				Notify:FireClient(plot.player, "banked", "Collected $"..money(u).."!")
			end
			task.wait(0.4); bankDeb = false
		else
			-- ANOTHER PLAYER steals a cut (once per cooldown) — they ARE the robbers
			local now = os.clock()
			if now - lastSteal < Config.STEAL_COOLDOWN then return end
			local u = plot.uncollected.Value
			if u <= 0 then return end
			lastSteal = now
			local stolen = math.max(1, math.floor(u * Config.STEAL_PERCENT))
			plot.uncollected.Value = u - stolen
			local thief = plots[plr.UserId]
			if thief then thief.cash.Value += stolen end
			Notify:FireClient(plot.player, "robbed", "🚨 "..plr.Name.." stole $"..money(stolen).." from you! Collect faster!")
			Notify:FireClient(plr, "banked", "💸 You stole $"..money(stolen).." from "..plot.player.Name.."!")
		end
	end)

	local fs = {y=y, z=z+18, startX=startX, endX=endX, collectorX=collX,
		collectorMult=1, upgraders={}, dropperCount=0}
	plot.floors[f] = fs
	return fs
end

-- ── Apply a purchased button (also used when re-loading a save) ───────────
local function applyButton(plot, idx, btn)
	local f = btn.floor
	local fs = plot.floors[f] or buildFloor(plot, f)

	if btn.kind == "dropper" then
		local x = fs.startX + 4 + fs.dropperCount * 6
		fs.dropperCount += 1
		local d = part({Name=btn.name, Size=Vector3.new(4,5,4), Position=Vector3.new(x, fs.y+5, fs.z),
			Color=btn.color, Material=Enum.Material.SmoothPlastic}, plot.model)
		billboard(d, btn.name, "$"..money(btn.value).."/drop", btn.color)
		task.spawn(function()
			while d.Parent do
				task.wait(Config.DROP_INTERVAL)
				if #activeOre < 250 then
					local ore = part({Name="Ore", Size=Vector3.new(2,2,2),
						Position=Vector3.new(x, fs.y+2, fs.z), Color=btn.color,
						Material=(btn.shape=="heart" and Enum.Material.Neon or Enum.Material.SmoothPlastic),
						CanCollide=false}, plot.model)
					if btn.shape=="heart" then ore.Shape=Enum.PartType.Ball end
					table.insert(activeOre, {part=ore, value=btn.value, plot=plot, fs=fs, x=x, applied={}})
				end
			end
		end)

	elseif btn.kind == "upgrader" then
		local k = #fs.upgraders
		local ux = plot.origin.X + 20 + k*8
		fs.upgraders[#fs.upgraders+1] = {x=ux, mult=btn.mult, grow=(btn.name:find("Ray")~=nil)}
		local g = part({Name=btn.name, Size=Vector3.new(3,9,12), Position=Vector3.new(ux, fs.y+4, fs.z),
			Color=btn.color, Material=Enum.Material.Neon, Transparency=0.35, CanCollide=false}, plot.model)
		billboard(g, btn.name, "x"..btn.mult, btn.color)

	elseif btn.kind == "collector" then
		fs.collectorMult = fs.collectorMult * 1.5

	elseif btn.kind == "cashcollector" then
		-- decorative extra cash pad already exists per floor; just a small bonus
		fs.collectorMult = fs.collectorMult * 1.15

	elseif btn.kind == "wall" then
		local o = plot.origin
		part({Name=btn.name, Size=Vector3.new(112, 10, 1), Position=Vector3.new(o.X+5, fs.y+5, fs.z-26),
			Color=btn.color, Material=(btn.glow and Enum.Material.Neon or Enum.Material.Brick)}, plot.model)
		part({Name=btn.name.."2", Size=Vector3.new(1, 10, 90), Position=Vector3.new(o.X-50, fs.y+5, o.Z),
			Color=btn.color, Material=(btn.glow and Enum.Material.Neon or Enum.Material.Brick)}, plot.model)

	elseif btn.kind == "deco" then
		local o = plot.origin
		if btn.shape == "pyramid" then
			part({Name="Pyramid", Size=Vector3.new(14,1,14), Position=Vector3.new(o.X+30, fs.y+0.5, fs.z-12),
				Color=btn.color, Material=Enum.Material.Sand}, plot.model)
			local p2 = part({Name="PyramidTop", Size=Vector3.new(8,8,8), Position=Vector3.new(o.X+30, fs.y+5, fs.z-12),
				Color=btn.color, Material=Enum.Material.Sand}, plot.model)
			p2.Orientation = Vector3.new(0,45,0)
		else
			part({Name=btn.name, Size=Vector3.new(4,8,4), Position=Vector3.new(o.X+38, fs.y+4, fs.z-14),
				Color=btn.color, Material=Enum.Material.SmoothPlastic}, plot.model)
		end

	elseif btn.kind == "floorslab" then
		buildFloor(plot, f+1)  -- the next floor's slab/conveyor appears

	elseif btn.kind == "gear" then
		plot.gear[btn.gear] = true
		applyGear(plot)

	elseif btn.kind == "nuke" then
		Notify:FireClient(plot.player, "nuke", "☢ SERVER MELTDOWN — you win! Rebirthing...")
		task.delay(3, function() rebirth(plot) end)
	end
end

-- ── Gear effects (re-applied on respawn) ─────────────────────────────────
function applyGear(plot)
	local char = plot.player.Character
	local hum = char and char:FindFirstChildWhichIsA("Humanoid")
	if hum then
		hum.WalkSpeed  = plot.gear.speed and 32 or 16
		hum.JumpPower  = plot.gear.jump and 90 or 50
		hum.UseJumpPower = true
	end
	local function giveTool(name, color)
		if plot.player.Backpack:FindFirstChild(name) or (char and char:FindFirstChild(name)) then return end
		local tool = Instance.new("Tool"); tool.Name = name; tool.RequiresHandle = true; tool.CanBeDropped = false
		local h = Instance.new("Part"); h.Name="Handle"; h.Size=Vector3.new(1,5,1); h.Color=color
		h.Material=Enum.Material.Neon; h.Parent=tool
		tool.Parent = plot.player.Backpack
	end
	if plot.gear.sword then giveTool("Sword", Color3.fromRGB(200,200,210)) end
	if plot.gear.laser then giveTool("Laser Gun", Color3.fromRGB(255,60,60)) end
end

-- ── Buy buttons ──────────────────────────────────────────────────────────
local function makeButton(plot, idx)
	local btn = Config.buttons[idx]
	if not btn then return end
	local o = plot.origin
	-- buttons sit in a tidy row in front of the base
	local col = (idx-1) % 6
	local row = math.floor((idx-1) / 6)
	local bx = o.X - 28 + col*11
	local bz = o.Z - 40 - row*9
	local b = part({Name="Buy_"..idx, Size=Vector3.new(7,1,7), Position=Vector3.new(bx, 1, bz),
		Color=Color3.fromRGB(40,200,90), Material=Enum.Material.Neon}, plot.buttonsModel)
	local _, costLabel = billboard(b, btn.name, "$"..money(costOf(btn)), Color3.fromRGB(120,255,160))
	plot.buttonNodes[idx] = b

	local deb = false
	b.Touched:Connect(function(hit)
		local plr = Players:GetPlayerFromCharacter(hit.Parent)
		if not plr or plr.UserId ~= plot.userId then return end
		if idx ~= plot.nextIndex or deb then return end
		deb = true
		local c = costOf(btn)
		if plot.cash.Value >= c then
			plot.cash.Value -= c
			plot.bought[idx] = true
			applyButton(plot, idx, btn)
			b:Destroy()
			plot.nextIndex = idx + 1
			revealNext(plot)
			save(plot)
			Notify:FireClient(plot.player, "buy", "Bought "..btn.name.."!")
		else
			Notify:FireClient(plot.player, "poor", "Need $"..money(c).." for "..btn.name)
		end
		task.wait(0.35); deb = false
	end)
end

function revealNext(plot)
	if plot.buttonNodes[plot.nextIndex] then return end
	if Config.buttons[plot.nextIndex] then makeButton(plot, plot.nextIndex) end
end

-- ── Save / Load ──────────────────────────────────────────────────────────
function save(plot)
	if not STORE then return end
	local boughtList = {}
	for i in pairs(plot.bought) do table.insert(boughtList, i) end
	pcall(function()
		STORE:SetAsync(tostring(plot.userId), {
			cash = plot.cash.Value, unc = plot.uncollected.Value,
			bought = boughtList, nextIndex = plot.nextIndex, rebirths = plot.rebirths.Value,
		})
	end)
end

local function loadData(userId)
	if not STORE then return nil end
	local ok, data = pcall(function() return STORE:GetAsync(tostring(userId)) end)
	if ok then return data end
	return nil
end

-- ── Rebirth (nuke) ───────────────────────────────────────────────────────
function rebirth(plot)
	plot.rebirths.Value += 1
	plot.cash.Value = 0
	plot.uncollected.Value = 0
	plot.bought = {}
	plot.nextIndex = 1
	plot.floors = {}
	plot.gear = {}
	plot.model:ClearAllChildren()
	plot.buttonsModel:ClearAllChildren()
	plot.buttonNodes = {}
	buildFloor(plot, 1)
	revealNext(plot)
	save(plot)
	Notify:FireClient(plot.player, "rebirth", "Rebirth #"..plot.rebirths.Value.." — fresh start!")
end

-- ── Plot creation ────────────────────────────────────────────────────────
local function freeIndex()
	local i = 0
	while usedPlotIndex[i] do i += 1 end
	return i
end

local function buildPlot(player)
	local index = freeIndex(); usedPlotIndex[index] = true
	local origin = Vector3.new(index * Config.PLOT_SPACING, 0, 0)

	local model = Instance.new("Folder"); model.Name = "Plot_"..player.UserId; model.Parent = PlotsFolder
	local buttonsModel = Instance.new("Folder"); buttonsModel.Name = "Buttons"; buttonsModel.Parent = model

	-- leaderstats (banked cash + rebirths shown above head / on board)
	local ls = Instance.new("Folder"); ls.Name = "leaderstats"; ls.Parent = player
	local cash = Instance.new("IntValue"); cash.Name = "Cash"; cash.Parent = ls
	local rebirths = Instance.new("IntValue"); rebirths.Name = "Rebirths"; rebirths.Parent = ls
	-- un-banked cash (replicated to client GUI)
	local uncollected = Instance.new("IntValue"); uncollected.Name = "Uncollected"; uncollected.Parent = player

	local plot = {
		userId=player.UserId, player=player, index=index, origin=origin,
		model=model, buttonsModel=buttonsModel, buttonNodes={},
		cash=cash, rebirths=rebirths, uncollected=uncollected,
		bought={}, nextIndex=1, floors={}, gear={},
	}
	plots[player.UserId] = plot

	-- spawn pad
	part({Name="Spawn", Size=Vector3.new(12,1,12), Position=Vector3.new(origin.X-30, 1, origin.Z-50),
		Color=Color3.fromRGB(80,120,200), Material=Enum.Material.SmoothPlastic}, model)

	-- load save
	local data = loadData(player.UserId)
	buildFloor(plot, 1)
	if data then
		cash.Value = data.cash or 0
		rebirths.Value = data.rebirths or 0
		uncollected.Value = data.unc or 0
		plot.nextIndex = data.nextIndex or 1
		if data.bought then
			-- re-apply purchases in order so floors exist before their machines
			table.sort(data.bought)
			for _, i in ipairs(data.bought) do
				local b = Config.buttons[i]
				if b then plot.bought[i] = true; applyButton(plot, i, b) end
			end
		end
	end
	revealNext(plot)

	-- teleport character to the plot when it spawns
	local function onChar(char)
		local hrp = char:WaitForChild("HumanoidRootPart")
		task.wait(0.1)
		hrp.CFrame = CFrame.new(origin.X-30, 4, origin.Z-50)
		applyGear(plot)
	end
	if player.Character then onChar(player.Character) end
	player.CharacterAdded:Connect(onChar)
end

-- ── Player lifecycle ─────────────────────────────────────────────────────
Players.PlayerAdded:Connect(buildPlot)
Players.PlayerRemoving:Connect(function(player)
	local plot = plots[player.UserId]
	if plot then
		save(plot)
		usedPlotIndex[plot.index] = nil
		if plot.model then plot.model:Destroy() end
		plots[player.UserId] = nil
	end
end)

-- ── Ore movement loop (drives the economy) ───────────────────────────────
RunService.Heartbeat:Connect(function(dt)
	for i = #activeOre, 1, -1 do
		local ore = activeOre[i]
		local p = ore.part
		if not p or not p.Parent then table.remove(activeOre, i)
		else
			ore.x = ore.x + 22 * dt
			p.CFrame = CFrame.new(ore.x, ore.fs.y + 2, ore.fs.z)
			-- upgraders
			for ui, up in ipairs(ore.fs.upgraders) do
				if not ore.applied[ui] and ore.x >= up.x then
					ore.applied[ui] = true
					ore.value = ore.value * up.mult
					local s = up.grow and 3.2 or 1.2
					p.Size = Vector3.new(s,s,s)
				end
			end
			-- reached collector
			if ore.x >= ore.fs.collectorX then
				ore.plot.uncollected.Value += math.floor(ore.value * ore.fs.collectorMult)
				p:Destroy(); table.remove(activeOre, i)
			end
		end
	end
end)

-- (No NPC robbers — other PLAYERS are the robbers: they steal by stepping on
--  your cash collector, handled in buildFloor, on a per-collector 20s cooldown.)

-- periodic autosave
task.spawn(function()
	while true do
		task.wait(45)
		for _, plot in pairs(plots) do save(plot) end
	end
end)
