-- Script: GameServer
-- Handles DataStore persistence, leaderstats, leaderboard, and remotes

local Players             = game:GetService("Players")
local DataStoreService    = game:GetService("DataStoreService")
local ReplicatedStorage   = game:GetService("ReplicatedStorage")

local SAVE_KEY = "PlanetClicker_v1"
local GameStore     = DataStoreService:GetDataStore(SAVE_KEY)
local StrengthLB    = DataStoreService:GetOrderedDataStore("StrengthLB_v1")
local TimeLB        = DataStoreService:GetOrderedDataStore("TimeLB_v1")

-- ── Remotes ──────────────────────────────────────────────────────────
local Remotes = Instance.new("Folder")
Remotes.Name  = "Remotes"
Remotes.Parent = ReplicatedStorage

local function makeEvent(name)
	local e = Instance.new("RemoteEvent"); e.Name = name; e.Parent = Remotes; return e
end
local function makeFunc(name)
	local f = Instance.new("RemoteFunction"); f.Name = name; f.Parent = Remotes; return f
end

local LoadData     = makeEvent("LoadData")
local SaveData     = makeEvent("SaveData")
local GetLB        = makeFunc("GetLB")

-- ── Default data ─────────────────────────────────────────────────────
local function defaultData()
	return {
		coins=0, strength=0, rebirths=0, mult=1,
		heldItem=1, sizeMult=1.0, nextSizeIdx=1, timePlayed=0,
	}
end

-- ── Load / Save ───────────────────────────────────────────────────────
local function loadData(player)
	local ok, result = pcall(function()
		return GameStore:GetAsync(tostring(player.UserId))
	end)
	if ok and result then
		-- merge with defaults in case new fields were added
		local d = defaultData()
		for k,v in pairs(result) do d[k] = v end
		return d
	end
	return defaultData()
end

local function saveData(player, data)
	if not data then return end
	pcall(function()
		GameStore:SetAsync(tostring(player.UserId), data)
	end)
	-- update leaderboards
	pcall(function()
		StrengthLB:SetAsync(tostring(player.UserId), math.floor(data.strength))
	end)
	pcall(function()
		TimeLB:SetAsync(tostring(player.UserId), math.floor(data.timePlayed))
	end)
end

-- ── Leaderstats (shown above head) ───────────────────────────────────
local function setupLeaderstats(player, data)
	local ls = Instance.new("Folder")
	ls.Name = "leaderstats"

	local coins = Instance.new("NumberValue", ls)
	coins.Name = "Coins"; coins.Value = data.coins

	local strength = Instance.new("NumberValue", ls)
	strength.Name = "Strength"; strength.Value = data.strength

	local rb = Instance.new("NumberValue", ls)
	rb.Name = "Rebirths"; rb.Value = data.rebirths

	ls.Parent = player
	return ls
end

-- ── Leaderboard fetch ────────────────────────────────────────────────
local function getTop40(store)
	local results = {}
	local ok, pages = pcall(function()
		return store:GetSortedAsync(false, 40)
	end)
	if not ok then return results end
	local ok2, page = pcall(function() return pages:GetCurrentPage() end)
	if not ok2 then return results end
	for _, entry in ipairs(page) do
		local name = "[unknown]"
		local ok3, plr = pcall(function()
			return Players:GetNameFromUserIdAsync(tonumber(entry.key))
		end)
		if ok3 then name = plr end
		table.insert(results, {name=name, value=entry.value})
	end
	return results
end

GetLB.OnServerInvoke = function(player, lbType)
	if lbType == "strength" then
		return getTop40(StrengthLB)
	elseif lbType == "time" then
		return getTop40(TimeLB)
	end
	return {}
end

-- ── Player lifecycle ─────────────────────────────────────────────────
local playerDataCache = {}

Players.PlayerAdded:Connect(function(player)
	local data = loadData(player)
	playerDataCache[player.UserId] = data

	local ls = setupLeaderstats(player, data)
	LoadData:FireClient(player, data)

	-- Keep leaderstats synced when SaveData fires
	SaveData.OnServerEvent:Connect(function(p, incoming)
		if p ~= player then return end
		playerDataCache[p.UserId] = incoming
		-- update leaderstats display
		local lsFolder = p:FindFirstChild("leaderstats")
		if lsFolder then
			local c = lsFolder:FindFirstChild("Coins")
			if c then c.Value = math.floor(incoming.coins or 0) end
			local s = lsFolder:FindFirstChild("Strength")
			if s then s.Value = math.floor(incoming.strength or 0) end
			local r = lsFolder:FindFirstChild("Rebirths")
			if r then r.Value = incoming.rebirths or 0 end
		end
		saveData(p, incoming)
	end)
end)

Players.PlayerRemoving:Connect(function(player)
	local data = playerDataCache[player.UserId]
	if data then
		saveData(player, data)
		playerDataCache[player.UserId] = nil
	end
end)

-- Auto-save every 60 seconds
while true do
	task.wait(60)
	for userId, data in pairs(playerDataCache) do
		local player = Players:GetPlayerByUserId(userId)
		if player then
			saveData(player, data)
		end
	end
end
