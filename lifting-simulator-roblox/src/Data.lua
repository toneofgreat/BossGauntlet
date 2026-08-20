-- Data: player data lifecycle for Weight Lifting Simulator.
-- DataStore "WeightLiftSave_v1" (pcall everywhere, Studio-offline safe),
-- leaderstats, Player attributes, points math, rebirth wipes, player hooks.
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local RunService = game:GetService("RunService")

local Data = {}
local G

local STORE_NAME = "WeightLiftSave_v1"
local AUTOSAVE_INTERVAL = 120

local store = nil          -- the DataStore object (nil if unavailable)
local live = {}            -- [player] = live data table

-- Try to grab the DataStore once; offline Studio throws, so pcall.
local function getStore()
	if store then return store end
	local ok, ds = pcall(function()
		return DataStoreService:GetDataStore(STORE_NAME)
	end)
	if ok then store = ds end
	return store
end

-- Fresh default save. multi is computed, never stored.
local function defaults()
	return {
		points = 0,
		lifetime = 0,
		rebirthLevel = 0,
		spaceUnlocked = false,
		dumbbellUnlocked = false,
		dumbbellMulti = false,
		lavaUnlocked = false,
		autoUnlocked = false,
		mega100k = false,    -- permanent x10 once lifetime ever reaches 100K
		items = {},          -- [itemId] = true
		auras = {},          -- [auraId] = true
		titles = {},         -- [titleName] = true
		equippedTitle = "",
		equippedAura = "",
		morph = false,
		multi = 1,           -- computed field (stripped on save)
	}
end

function Data.Init(g)
	G = g
end

function Data.Get(player)
	return live[player]
end

-- Push every attribute + leaderstats from the live table onto the Player.
function Data.SyncAll(player)
	local d = live[player]
	if not d then return end
	player:SetAttribute("Points", d.points)
	player:SetAttribute("Lifetime", d.lifetime)
	player:SetAttribute("Multi", d.multi)
	player:SetAttribute("RebirthLevel", d.rebirthLevel)
	player:SetAttribute("AutoUnlocked", d.autoUnlocked)
	player:SetAttribute("SpaceUnlocked", d.spaceUnlocked)
	player:SetAttribute("DumbbellUnlocked", d.dumbbellUnlocked)
	player:SetAttribute("DumbbellMulti", d.dumbbellMulti)
	player:SetAttribute("LavaUnlocked", d.lavaUnlocked)
	player:SetAttribute("Mega100k", d.mega100k)
	player:SetAttribute("EquippedTitle", d.equippedTitle)
	player:SetAttribute("EquippedAura", d.equippedAura)
	player:SetAttribute("Morph", d.morph)
	if player:GetAttribute("SizeMult") == nil then
		player:SetAttribute("SizeMult", 1)
	end
	local stats = player:FindFirstChild("leaderstats")
	if stats then
		local s = stats:FindFirstChild("Strength")
		if s then s.Value = G.Util.fmt(d.points) end
		local r = stats:FindFirstChild("Rebirths")
		if r then r.Value = tostring(d.rebirthLevel) end
	end
end

-- Multi = Ladder[level] * (space and 3) * (dumbbellMulti and 50000) * (lava and 40)
function Data.RecomputeMulti(player)
	local d = live[player]
	if not d then return 1 end
	local ladder = G.Config.Ladder[d.rebirthLevel] or 1
	local m = ladder
	if d.spaceUnlocked then m = m * 3 end
	if d.dumbbellMulti then m = m * 50000 end
	if d.lavaUnlocked then m = m * 40 end
	if d.mega100k then m = m * 10 end -- permanent 100K-club bonus
	d.multi = m
	player:SetAttribute("Multi", m)
	return m
end

-- Check LIFETIME thresholds and unlock any newly earned titles.
local function checkTitles(player, d)
	local newAny = false
	for _, t in ipairs(G.Config.Titles) do
		local need, name = t[1], t[2]
		if d.lifetime >= need and not d.titles[name] then
			d.titles[name] = true
			newAny = true
			G.Remotes.Notify:FireClient(player, "Title unlocked: " .. name .. "!", "green")
		end
	end
	if newAny then
		G.Remotes.StateChanged:FireClient(player)
	end
end

function Data.SetPoints(player, n)
	local d = live[player]
	if not d then return end
	d.points = n
	player:SetAttribute("Points", n)
	local stats = player:FindFirstChild("leaderstats")
	if stats then
		local s = stats:FindFirstChild("Strength")
		if s then s.Value = G.Util.fmt(n) end
	end
end

function Data.AddPoints(player, n)
	local d = live[player]
	if not d then return end
	d.lifetime = d.lifetime + n
	player:SetAttribute("Lifetime", d.lifetime)
	Data.SetPoints(player, d.points + n)
	-- reaching 100K strength (ever) grants a permanent x10 on top of everything
	if not d.mega100k and d.lifetime >= 100000 then
		d.mega100k = true
		Data.RecomputeMulti(player)
		player:SetAttribute("Mega100k", true)
		G.Remotes.Notify:FireClient(player, "100K CLUB! Permanent x10 multiplier unlocked!", "green")
		G.Remotes.StateChanged:FireClient(player)
	end
	checkTitles(player, d)
	G.Lift.CheckSize(player)
end

function Data.SpendPoints(player, n)
	local d = live[player]
	if not d then return false end
	if d.points < n then return false end
	Data.SetPoints(player, d.points - n)
	G.Lift.CheckSize(player)
	return true
end

-- Remove every Tool the player is holding or carrying.
local function stripTools(player)
	local backpack = player:FindFirstChild("Backpack")
	if backpack then
		for _, t in ipairs(backpack:GetChildren()) do
			if t:IsA("Tool") then t:Destroy() end
		end
	end
	local char = player.Character
	if char then
		for _, t in ipairs(char:GetChildren()) do
			if t:IsA("Tool") then t:Destroy() end
		end
	end
end

function Data.WipeForRebirth(player, wipeItems, wipeLevel)
	local d = live[player]
	if not d then return end
	d.points = 0
	if wipeItems then
		d.items = {}
		stripTools(player)
	end
	if wipeLevel then
		d.rebirthLevel = 0
	end
	Data.SyncAll(player)
end

-- ---------------------------------------------------------------- persistence

local function serialize(d)
	-- everything except the computed multi
	return {
		points = d.points,
		lifetime = d.lifetime,
		rebirthLevel = d.rebirthLevel,
		spaceUnlocked = d.spaceUnlocked,
		dumbbellUnlocked = d.dumbbellUnlocked,
		dumbbellMulti = d.dumbbellMulti,
		lavaUnlocked = d.lavaUnlocked,
		autoUnlocked = d.autoUnlocked,
		mega100k = d.mega100k,
		items = d.items,
		auras = d.auras,
		titles = d.titles,
		equippedTitle = d.equippedTitle,
		equippedAura = d.equippedAura,
		morph = d.morph,
	}
end

function Data.Save(player)
	local d = live[player]
	if not d then return end
	local ds = getStore()
	if not ds then return end
	local payload = serialize(d)
	pcall(function()
		ds:SetAsync(tostring(player.UserId), payload)
	end)
end

function Data.Setup(player)
	if live[player] then return live[player] end
	local d = defaults()
	live[player] = d

	-- leaderstats first so the playerlist fills in even while loading
	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"
	local strength = Instance.new("StringValue")
	strength.Name = "Strength"
	strength.Value = "0"
	strength.Parent = stats
	local rebirths = Instance.new("StringValue")
	rebirths.Name = "Rebirths"
	rebirths.Value = "0"
	rebirths.Parent = stats
	stats.Parent = player

	-- load (yields; pcall so offline Studio just keeps defaults)
	local ds = getStore()
	if ds then
		local ok, saved = pcall(function()
			return ds:GetAsync(tostring(player.UserId))
		end)
		if ok and type(saved) == "table" then
			for k, v in pairs(defaults()) do
				if k ~= "multi" and saved[k] ~= nil then
					d[k] = saved[k]
				end
			end
			-- guard: DataStore JSON turns empty tables into arrays; force tables
			if type(d.items) ~= "table" then d.items = {} end
			if type(d.auras) ~= "table" then d.auras = {} end
			if type(d.titles) ~= "table" then d.titles = {} end
		end
	end

	if not live[player] then return nil end -- left while loading
	Data.RecomputeMulti(player)
	Data.SyncAll(player)
	checkTitles(player, d)
	d.ready = true -- not serialized; gates CharacterAdded re-application
	return d
end

-- ---------------------------------------------------------------- hooks

local function onCharacter(player, char)
	local humanoid = char:WaitForChild("Humanoid", 15)
	if not humanoid then return end
	-- wait until Setup finished loading (it runs in the PlayerAdded thread)
	local waited = 0
	while (not live[player] or not live[player].ready) and waited < 15 do
		waited = waited + task.wait(0.1)
	end
	local d = live[player]
	if not d then return end
	G.Lift.ApplySize(player)
	G.Auras.Apply(player)
	for id in pairs(d.items) do
		G.Shop.GiveTool(player, id)
	end
end

function Data.HookPlayers(g)
	local function onPlayer(player)
		player.CharacterAdded:Connect(function(char)
			onCharacter(player, char)
		end)
		local existing = player.Character
		Data.Setup(player)
		if existing then
			task.spawn(onCharacter, player, existing)
		end
	end

	Players.PlayerAdded:Connect(onPlayer)
	for _, p in ipairs(Players:GetPlayers()) do
		task.spawn(onPlayer, p)
	end

	Players.PlayerRemoving:Connect(function(player)
		Data.Save(player)
		live[player] = nil
	end)

	-- autosave every 120 s
	task.spawn(function()
		while true do
			task.wait(AUTOSAVE_INTERVAL)
			for _, p in ipairs(Players:GetPlayers()) do
				if live[p] then Data.Save(p) end
			end
		end
	end)

	-- final flush on shutdown (pcall-wrapped saves; harmless in Studio)
	game:BindToClose(function()
		if RunService:IsStudio() then
			task.wait(1)
			return
		end
		for _, p in ipairs(Players:GetPlayers()) do
			if live[p] then Data.Save(p) end
		end
	end)
end

return Data
