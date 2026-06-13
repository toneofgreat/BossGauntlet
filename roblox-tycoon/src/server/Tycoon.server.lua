-- Tycoon.server.lua  —  a fully-scripted Roblox tycoon.
-- Builds each player a plot, reveals buy buttons one at a time (classic gating),
-- runs droppers -> conveyor -> collector -> un-banked cash, lets you BANK at a
-- cash collector, and sends robbers to steal un-banked cash every 20s.
-- Costs scale ~1.5x per floor. Saves with DataStore.

local Players           = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService        = game:GetService("RunService")
local DataStoreService  = game:GetService("DataStoreService")
local InsertService     = game:GetService("InsertService")
local ServerStorage     = game:GetService("ServerStorage")
local Debris            = game:GetService("Debris")

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

local MAX_PLOTS      = 10
local plots          = {}   -- [userId] = plot state
local plotMeta       = {}   -- [0..MAX_PLOTS-1] = {origin, taken, userId, sign}
local activeOre      = {}    -- { {part, value, plot, fs, x, applied={}} }
pcall(function() Players.MaxPlayers = MAX_PLOTS end)

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
	return math.floor(btn.baseCost * (Config.COST_MULT or 1) * (Config.FLOOR_MULT ^ (btn.floor - 1)))
end

-- ── Floor (conveyor + collector + cash collector) ────────────────────────
local function buildFloor(plot, f)
	if plot.floors[f] then return plot.floors[f] end
	local o = plot.origin
	local y = 3 + (f-1) * Config.FLOOR_HEIGHT
	local startX, endX = o.X - 35, o.X + 45
	local z = o.Z + 18   -- the conveyor's z

	-- detailed floor slab(s) + neon trim
	local floorCol = (f==1 and Color3.fromRGB(95,105,120)) or (f==2 and Color3.fromRGB(225,205,140)) or Color3.fromRGB(22,22,30)
	if f == 1 then
		part({Name="Floor1", Size=Vector3.new(110, 1, 90), Position=Vector3.new(o.X+5, y-0.5, o.Z),
			Color=floorCol, Material=Enum.Material.SmoothPlastic}, plot.model)
	else
		-- new floor: slab built with a stairwell hole at (o.X+38, o.Z-22)
		part({Name="Floor"..f.."L", Size=Vector3.new(80,1,90), Position=Vector3.new(o.X-10, y-0.5, o.Z), Color=floorCol, Material=Enum.Material.SmoothPlastic}, plot.model)
		part({Name="Floor"..f.."R", Size=Vector3.new(14,1,90), Position=Vector3.new(o.X+53, y-0.5, o.Z), Color=floorCol, Material=Enum.Material.SmoothPlastic}, plot.model)
		part({Name="Floor"..f.."F", Size=Vector3.new(16,1,15), Position=Vector3.new(o.X+38, y-0.5, o.Z-37.5), Color=floorCol, Material=Enum.Material.SmoothPlastic}, plot.model)
		part({Name="Floor"..f.."B", Size=Vector3.new(16,1,59), Position=Vector3.new(o.X+38, y-0.5, o.Z+15.5), Color=floorCol, Material=Enum.Material.SmoothPlastic}, plot.model)
		-- AUTO staircase up through the hole + a climbable ladder at the back
		local lowerTop, rise, steps = 3 + (f-2)*Config.FLOOR_HEIGHT, Config.FLOOR_HEIGHT, 16
		for s = 1, steps do
			local sy = lowerTop + (rise/steps) * s
			part({Name="Step", Size=Vector3.new(12,1,2.4), Position=Vector3.new(o.X+38, sy-0.5, o.Z-30 + s*(15/steps)),
				Color=Color3.fromRGB(120,122,138), Material=Enum.Material.SmoothPlastic}, plot.model)
		end
		local truss = Instance.new("TrussPart")
		truss.Anchored = true; truss.Size = Vector3.new(2, rise+2, 2)
		truss.Position = Vector3.new(o.X-54, lowerTop + rise/2 + 1, o.Z+40)
		truss.Color = Color3.fromRGB(90,92,104); truss.Parent = plot.model
		part({Name="LadderLanding", Size=Vector3.new(10,1,10), Position=Vector3.new(o.X-50, y-0.5, o.Z+38),
			Color=Color3.fromRGB(110,112,128), Material=Enum.Material.SmoothPlastic}, plot.model)
	end
	part({Name="FloorTrim"..f, Size=Vector3.new(112, 0.4, 92), Position=Vector3.new(o.X+5, y+0.05, o.Z),
		Color=Color3.fromRGB(90,200,255), Material=Enum.Material.Neon, Transparency=0.5, CanCollide=false}, plot.model)

	-- conveyor belt (diamond plate) + end rollers
	part({Name="Belt"..f, Size=Vector3.new(endX-startX, 1, 8),
		Position=Vector3.new((startX+endX)/2, y+0.5, z), Color=Color3.fromRGB(35,35,42),
		Material=Enum.Material.DiamondPlate}, plot.model)
	for _, rx in ipairs({startX, endX}) do
		local roll = part({Name="Roller", Size=Vector3.new(1.6, 9, 1.6), Position=Vector3.new(rx, y+0.6, z),
			Color=Color3.fromRGB(120,120,135), Material=Enum.Material.Metal}, plot.model)
		roll.Shape = Enum.PartType.Cylinder; roll.Orientation = Vector3.new(0, 0, 90)
	end

	-- (Conveyor side walls are now a purchasable "Glass Conveyor Walls" upgrade.)

	-- collector wall at the end of the belt (solid + glowing)
	local collX = endX - 1
	local coll = part({Name="Collector"..f, Size=Vector3.new(4, 13, 12), Position=Vector3.new(collX+3, y+6, z),
		Color=Color3.fromRGB(40,90,140), Material=Enum.Material.Neon, Transparency=0.12}, plot.model)
	local pl = Instance.new("PointLight"); pl.Color = Color3.fromRGB(90,200,255); pl.Range = 16; pl.Parent = coll

	-- cash collector pad (you collect here; other players can steal from it)
	local cashPad = part({Name="CashPad"..f, Size=Vector3.new(11, 1, 11),
		Position=Vector3.new(o.X-30, y+0.6, o.Z-4), Color=Color3.fromRGB(60,200,110),
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

	local fs = {y=y, z=z, startX=startX, endX=endX, collectorX=collX, speed=24,
		collectorMult=1, upgraders={}, dropperCount=0}
	plot.floors[f] = fs
	return fs
end

-- ── Apply a purchased button (also used when re-loading a save) ───────────
local function applyButton(plot, idx, btn)
	local f = btn.floor
	local fs = plot.floors[f] or buildFloor(plot, f)

	if btn.kind == "dropper" then
		local x = fs.startX + 5 + fs.dropperCount * 6.5
		fs.dropperCount += 1
		-- detailed dropper machine: base + funnel + spout + legs + light + sign
		local base = part({Name=btn.name, Size=Vector3.new(5,2,5), Position=Vector3.new(x, fs.y+13, fs.z),
			Color=btn.color, Material=Enum.Material.Metal}, plot.model)
		part({Name="Funnel", Size=Vector3.new(4.2,3,4.2), Position=Vector3.new(x, fs.y+15.2, fs.z),
			Color=btn.color, Material=Enum.Material.SmoothPlastic}, plot.model)
		part({Name="Spout", Size=Vector3.new(1.8,3,1.8), Position=Vector3.new(x, fs.y+11, fs.z),
			Color=Color3.fromRGB(38,38,46), Material=Enum.Material.Metal}, plot.model)
		part({Name="Leg", Size=Vector3.new(0.6,11,0.6), Position=Vector3.new(x-2, fs.y+6.5, fs.z-2),
			Color=Color3.fromRGB(60,62,74), Material=Enum.Material.Metal}, plot.model)
		part({Name="Leg", Size=Vector3.new(0.6,11,0.6), Position=Vector3.new(x+2, fs.y+6.5, fs.z+2),
			Color=Color3.fromRGB(60,62,74), Material=Enum.Material.Metal}, plot.model)
		local lt = Instance.new("PointLight"); lt.Color = btn.color; lt.Range = 11; lt.Parent = base
		billboard(base, btn.name, "$"..money(btn.value).."/drop", btn.color)
		task.spawn(function()
			while base.Parent do
				task.wait(Config.DROP_INTERVAL)
				if #activeOre < 140 then
					local sz = (btn.shape=="heart") and 2.4 or 2.0
					-- ore is REAL physics: unanchored + collidable, so drops collide
					local ore = part({Name="Ore", Size=Vector3.new(sz,sz,sz),
						Position=Vector3.new(x, fs.y+9, fs.z), Color=btn.color,
						Material=(btn.shape=="heart" and Enum.Material.Neon or Enum.Material.Glass),
						Anchored=false, CanCollide=true}, plot.model)
					if btn.shape=="heart" then ore.Shape=Enum.PartType.Ball end
					ore.CustomPhysicalProperties = PhysicalProperties.new(0.7, 0.25, 0.5)
					table.insert(activeOre, {part=ore, value=btn.value, plot=plot, fs=fs, applied={}})
				end
			end
		end)

	elseif btn.kind == "convspeed" then
		fs.speed = fs.speed + (btn.addspeed or 12)
		local sx = plot.origin.X + 12
		part({Name=btn.name, Size=Vector3.new(2.5, 3, 9), Position=Vector3.new(sx, fs.y+1.8, fs.z),
			Color=btn.color or Color3.fromRGB(90,200,255), Material=Enum.Material.Neon,
			Transparency=0.3, CanCollide=false}, plot.model)

	elseif btn.kind == "convwalls" then
		-- translucent glass containment walls along the belt
		for _, dz in ipairs({-1, 1}) do
			part({Name="GlassConvWall", Size=Vector3.new(fs.endX-fs.startX, 12, 0.6),
				Position=Vector3.new((fs.startX+fs.endX)/2, fs.y+6.5, fs.z + dz*4.4),
				Color=(btn.color or Color3.fromRGB(120,200,255)), Material=Enum.Material.Glass,
				Transparency=0.55, Reflectance=0.1, CanCollide=true}, plot.model)
			part({Name="GlassConvWallTop", Size=Vector3.new(fs.endX-fs.startX, 0.5, 1.0),
				Position=Vector3.new((fs.startX+fs.endX)/2, fs.y+12.7, fs.z + dz*4.4),
				Color=Color3.fromRGB(90,200,255), Material=Enum.Material.Neon}, plot.model)
		end

	elseif btn.kind == "bridge" then
		-- builds YOUR half of a bridge toward the neighbor plot. Both you AND the
		-- neighbor must build your facing halves before they meet at the midpoint.
		local o = plot.origin
		local dir = (btn.side == "right") and 1 or -1
		local inner = o.X + dir * 66                       -- ~island edge
		local mid   = o.X + dir * (Config.PLOT_SPACING / 2) -- meeting point between the two plots
		local cx    = (inner + mid) / 2
		local len   = math.abs(mid - inner)
		part({Name="Bridge_"..btn.side, Size=Vector3.new(len, 1, 12), Position=Vector3.new(cx, 2.5, o.Z),
			Color=Color3.fromRGB(120,108,92), Material=Enum.Material.WoodPlanks}, plot.model)
		for _, dz in ipairs({-1, 1}) do
			part({Name="BridgeRail", Size=Vector3.new(len, 3, 0.5), Position=Vector3.new(cx, 4.5, o.Z + dz*5.6),
				Color=Color3.fromRGB(86,76,62), Material=Enum.Material.Wood}, plot.model)
		end

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

-- ── Combat for built-in fallback gear (real Toolbox gear has its own scripts) ──
local function explode(pos, radius, dmg, exclChar)
	local e = Instance.new("Explosion"); e.Position = pos; e.BlastRadius = radius
	e.BlastPressure = 0; e.DestroyJointRadiusPercent = 0; e.Parent = workspace
	for _, pl in ipairs(Players:GetPlayers()) do
		local c = pl.Character
		local h = c and c:FindFirstChildWhichIsA("Humanoid")
		local r = c and c:FindFirstChild("HumanoidRootPart")
		if h and r and c ~= exclChar and (r.Position - pos).Magnitude <= radius then
			h:TakeDamage(dmg)
		end
	end
end

local function wireCombat(tool, key)
	local handle = tool:FindFirstChild("Handle")
	if key == "sword" then
		local active, deb = false, {}
		tool.Activated:Connect(function() active = true; task.delay(0.45, function() active = false end) end)
		if handle then
			handle.Touched:Connect(function(hit)
				if not active then return end
				local ch = hit.Parent
				local hum = ch and ch:FindFirstChildWhichIsA("Humanoid")
				if hum and ch ~= tool.Parent and not deb[ch] then
					deb[ch] = true; hum:TakeDamage(35)
					task.delay(0.6, function() deb[ch] = nil end)
				end
			end)
		end
	elseif key == "laser" then
		tool.Activated:Connect(function()
			local ch = tool.Parent
			local hrp = ch and ch:FindFirstChild("HumanoidRootPart")
			if not hrp then return end
			local params = RaycastParams.new()
			params.FilterDescendantsInstances = {ch}; params.FilterType = Enum.RaycastFilterType.Exclude
			local res = workspace:Raycast(hrp.Position, hrp.CFrame.LookVector * 400, params)
			local hitPos = res and res.Position or (hrp.Position + hrp.CFrame.LookVector * 400)
			local dist = (hrp.Position - hitPos).Magnitude
			local beam = part({Name="Laser", Size=Vector3.new(0.4, 0.4, dist),
				CFrame = CFrame.lookAt(hrp.Position, hitPos) * CFrame.new(0, 0, -dist/2),
				Color = Color3.fromRGB(255,60,60), Material = Enum.Material.Neon, CanCollide=false}, workspace)
			Debris:AddItem(beam, 0.12)
			if res then
				local h = res.Instance.Parent and res.Instance.Parent:FindFirstChildWhichIsA("Humanoid")
				if h and res.Instance.Parent ~= ch then h:TakeDamage(45) end
			end
		end)
	elseif key == "rocket" or key == "grenade" then
		local fuse = (key == "grenade") and 2.5 or 6
		local speed = (key == "rocket") and 130 or 60
		tool.Activated:Connect(function()
			local ch = tool.Parent
			local hrp = ch and ch:FindFirstChild("HumanoidRootPart")
			if not hrp then return end
			local proj = part({Name="Proj", Size=Vector3.new(1.6,1.6,2.6),
				Position = hrp.Position + hrp.CFrame.LookVector*4 + Vector3.new(0,1,0),
				Color = Color3.fromRGB(70,70,80), Material = Enum.Material.Metal, Anchored=false, CanCollide=false}, workspace)
			proj.AssemblyLinearVelocity = hrp.CFrame.LookVector * speed + Vector3.new(0, (key=="grenade") and 28 or 0, 0)
			local done = false
			local function boom(pos) if done then return end; done = true; explode(pos, 18, 70, ch); proj:Destroy() end
			proj.Touched:Connect(function(hit) if hit.Parent ~= ch and not hit:IsDescendantOf(ch) then boom(proj.Position) end end)
			task.delay(fuse, function() if proj.Parent then boom(proj.Position) end end)
		end)
	end
end

-- ── Gear effects (re-applied on respawn) ─────────────────────────────────
function applyGear(plot)
	local char = plot.player.Character
	local hum = char and char:FindFirstChildWhichIsA("Humanoid")
	if hum then
		hum.WalkSpeed   = plot.gear.speed and 34 or 16
		hum.UseJumpPower = true
		hum.JumpPower   = plot.gear.jump and 95 or 50
	end
	local A = Config.gearAssets or {}
	local function grant(key, displayName, assetId, fallbackColor)
		if not plot.gear[key] then return end
		if (plot.player:FindFirstChild("Backpack") and plot.player.Backpack:FindFirstChild(displayName))
			or (char and char:FindFirstChild(displayName)) then return end
		local tool, usedFallback = nil, false
		-- 1) a real Toolbox Tool the user dropped into ServerStorage.GearStorage
		local store = ServerStorage:FindFirstChild("GearStorage")
		if store then
			local t = store:FindFirstChild(displayName)
			if t and t:IsA("Tool") then tool = t:Clone() end
		end
		-- 2) load the real catalog gear by asset id
		if not tool and assetId then
			local ok, model = pcall(function() return InsertService:LoadAsset(assetId) end)
			if ok and model then
				local t = model:FindFirstChildWhichIsA("Tool")
				if t then tool = t:Clone() end
				model:Destroy()
			end
		end
		-- 3) simple built fallback (we add our own combat to these)
		if not tool then
			usedFallback = true
			tool = Instance.new("Tool"); tool.RequiresHandle = true; tool.CanBeDropped = false
			local h = Instance.new("Part"); h.Name="Handle"
			h.Size = (key=="sword") and Vector3.new(1,5,1) or Vector3.new(1.4,1.4,4)
			h.Color = fallbackColor or Color3.fromRGB(200,200,210); h.Material=Enum.Material.Neon; h.Parent=tool
		end
		tool.Name = displayName
		if usedFallback then wireCombat(tool, key) end
		if plot.player:FindFirstChild("Backpack") then tool.Parent = plot.player.Backpack end
	end
	grant("sword",   "Sword",           A.sword,   Color3.fromRGB(200,200,210))
	grant("speed",   "Speed Coil",      A.speed,   Color3.fromRGB(90,200,255))
	grant("gravity", "Gravity Coil",    A.gravity, Color3.fromRGB(150,255,150))
	grant("jump",    "Jump Coil",       A.jump,    Color3.fromRGB(255,230,90))
	grant("carpet",  "Flying Carpet",   A.carpet,  Color3.fromRGB(200,80,80))
	grant("grenade", "Hand Grenade",    A.grenade, Color3.fromRGB(80,120,60))
	grant("laser",   "Laser Gun",       A.laser,   Color3.fromRGB(255,60,60))
	grant("rocket",  "Rocket Launcher", A.rocket,  Color3.fromRGB(120,120,120))
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
	local bz = o.Z - 8 - row*5.5
	-- floor top surface is at y = 3 (the ground floor slab); pads sit ON it
	local b = part({Name="Buy_"..idx, Size=Vector3.new(7,1,7), Position=Vector3.new(bx, 3.6, bz),
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
-- Pre-build 10 floating island plots in a row that players claim on join.
local function buildIslands()
	for i = 0, MAX_PLOTS - 1 do
		local o = Vector3.new(i * Config.PLOT_SPACING, 0, 0)
		part({Name="Island"..i, Size=Vector3.new(132, 4, 104), Position=Vector3.new(o.X+5, 0, o.Z),
			Color=Color3.fromRGB(70,80,100), Material=Enum.Material.Slate}, PlotsFolder)
		part({Name="Rim"..i, Size=Vector3.new(136, 1, 108), Position=Vector3.new(o.X+5, 2.1, o.Z),
			Color=Color3.fromRGB(90,200,255), Material=Enum.Material.Neon, Transparency=0.25}, PlotsFolder)
		-- tapered rock underside + corner pillars (floating-island look)
		part({Name="UnderRock"..i, Size=Vector3.new(96, 22, 72), Position=Vector3.new(o.X+5, -13, o.Z),
			Color=Color3.fromRGB(48,54,68), Material=Enum.Material.Slate}, PlotsFolder)
		part({Name="UnderTip"..i, Size=Vector3.new(40, 24, 28), Position=Vector3.new(o.X+5, -32, o.Z),
			Color=Color3.fromRGB(40,46,58), Material=Enum.Material.Slate}, PlotsFolder)
		for _, c in ipairs({{-58,-44},{72,-44},{-58,44},{72,44}}) do
			part({Name="Pillar", Size=Vector3.new(4, 40, 4), Position=Vector3.new(o.X+c[1], -20, o.Z+c[2]),
				Color=Color3.fromRGB(58,64,80), Material=Enum.Material.Metal}, PlotsFolder)
		end
		-- floating claim sign
		local post = part({Name="Sign"..i, Size=Vector3.new(2, 14, 2), Position=Vector3.new(o.X-48, 9, o.Z-40),
			Color=Color3.fromRGB(55,60,72), Material=Enum.Material.Metal}, PlotsFolder)
		local _, sub = billboard(post, "🏝 PLOT "..(i+1), "OPEN — join to claim", Color3.fromRGB(120,255,170))
		plotMeta[i] = {origin=o, taken=false, userId=nil, sign=sub}
	end
end

local function freeIndex()
	for i = 0, MAX_PLOTS - 1 do
		if plotMeta[i] and not plotMeta[i].taken then return i end
	end
	return nil
end

local function buildPlot(player)
	local index = freeIndex()
	if not index then
		Notify:FireClient(player, "poor", "All 10 plots are taken — you can watch until one frees up!")
		return
	end
	plotMeta[index].taken = true
	plotMeta[index].userId = player.UserId
	plotMeta[index].sign.Text = player.Name .. "'s base"
	local origin = plotMeta[index].origin

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

	-- spawn pad (sits on the ground floor, top surface y=3)
	part({Name="Spawn", Size=Vector3.new(12,1,12), Position=Vector3.new(origin.X-44, 3.1, origin.Z-25),
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
		hrp.CFrame = CFrame.new(origin.X-44, 6, origin.Z-25)
		applyGear(plot)
	end
	if player.Character then onChar(player.Character) end
	player.CharacterAdded:Connect(onChar)
end

-- ── Player lifecycle ─────────────────────────────────────────────────────
buildIslands()
for _, p in ipairs(Players:GetPlayers()) do buildPlot(p) end  -- in case some joined before script ran
Players.PlayerAdded:Connect(buildPlot)
Players.PlayerRemoving:Connect(function(player)
	local plot = plots[player.UserId]
	if plot then
		save(plot)
		local meta = plotMeta[plot.index]
		if meta then
			meta.taken = false; meta.userId = nil
			meta.sign.Text = "OPEN — join to claim"
		end
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
			local pos = p.Position
			-- push along the belt (+X); keep ore centered on the belt's z; preserve gravity (Y)
			local v = p.AssemblyLinearVelocity
			p.AssemblyLinearVelocity = Vector3.new(ore.fs.speed, v.Y, (ore.fs.z - pos.Z) * 3)
			-- upgraders (smasher shrinks, size ray grows) — multiply value once each
			for ui, up in ipairs(ore.fs.upgraders) do
				if not ore.applied[ui] and pos.X >= up.x then
					ore.applied[ui] = true
					ore.value = ore.value * up.mult
					local s = up.grow and 3.6 or 1.2
					p.Size = Vector3.new(s, s, s)
				end
			end
			if pos.X >= ore.fs.collectorX then
				ore.plot.uncollected.Value += math.floor(ore.value * ore.fs.collectorMult)
				p:Destroy(); table.remove(activeOre, i)
			elseif pos.Y < ore.fs.y - 30 then
				p:Destroy(); table.remove(activeOre, i)   -- fell off the belt
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

-- save everyone before the server shuts down (otherwise the last progress is lost)
game:BindToClose(function()
	for _, plot in pairs(plots) do save(plot) end
	task.wait(2)  -- give the DataStore writes time to finish
end)

-- warn players if saving is unavailable (Studio API access off, or unpublished place)
if not STORE then
	Players.PlayerAdded:Connect(function(p)
		task.wait(3)
		Notify:FireClient(p, "robbed", "⚠ Saving is OFF — publish the game & enable Studio API Services to save progress.")
	end)
end
