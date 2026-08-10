-- Economy.lua -- money ledger, leaderstats, DataStore save/load for Boss Tycoon
-- Contract: Economy (module API) section. DataStore "BossTycoonSave_v1",
-- key tostring(UserId), value {money=n, purchased={id,...}, flags={name=true,...}}.
-- Every DataStore call is pcall'd so the game runs fine offline in Studio.

local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local RunService = game:GetService("RunService")

local M = {}
local G = nil

local store = nil          -- DataStore or nil (offline)
local data = {}            -- [player] = {money=n, purchased={id,...}, flags={name=true}}
local AUTOSAVE_SECONDS = 120

--------------------------------------------------------------------
-- internals
--------------------------------------------------------------------

local function keyFor(player)
	return tostring(player.UserId)
end

local function updateLeaderstats(player)
	local d = data[player]
	if not d then return end
	local ls = player:FindFirstChild("leaderstats")
	if not ls then return end
	local mv = ls:FindFirstChild("Money")
	if mv then
		mv.Value = G.Util.fmt(d.money)
	end
end

local function loadData(player)
	local loaded = nil
	if store then
		local ok, result = pcall(function()
			return store:GetAsync(keyFor(player))
		end)
		if ok and type(result) == "table" then
			loaded = result
		elseif not ok then
			warn("[Economy] load failed for " .. player.Name .. ": " .. tostring(result))
		end
	end
	local d = {
		money = 0,
		purchased = {},
		flags = {},
	}
	if loaded then
		d.money = tonumber(loaded.money) or 0
		if type(loaded.purchased) == "table" then
			for _, id in ipairs(loaded.purchased) do
				table.insert(d.purchased, id)
			end
		end
		if type(loaded.flags) == "table" then
			for name, v in pairs(loaded.flags) do
				if v then d.flags[name] = true end
			end
		end
	end
	return d
end

--------------------------------------------------------------------
-- public API
--------------------------------------------------------------------

local loading = {} -- [player] = true while a GetAsync is in flight

function M.SetupPlayer(player)
	if data[player] then return data[player] end
	-- Both Economy.Init's PlayerAdded hook and PlotManager call SetupPlayer;
	-- loadData yields on GetAsync, so without a sentinel two concurrent calls
	-- would both load and the second would clobber the first table (losing any
	-- mutations made in between). Second caller waits for the first load.
	if loading[player] then
		while loading[player] and player.Parent do
			task.wait(0.1)
		end
		if data[player] then return data[player] end
	end
	loading[player] = true
	local ok, loaded = pcall(loadData, player)
	loading[player] = nil
	if not data[player] then
		if ok and type(loaded) == "table" then
			data[player] = loaded
		else
			data[player] = { money = 0, purchased = {}, flags = {} }
		end
	end

	local ls = player:FindFirstChild("leaderstats")
	if not ls then
		ls = Instance.new("Folder")
		ls.Name = "leaderstats"
		ls.Parent = player
	end
	local mv = ls:FindFirstChild("Money")
	if not mv then
		mv = Instance.new("StringValue")
		mv.Name = "Money"
		mv.Parent = ls
	end
	updateLeaderstats(player)
	return data[player]
end

function M.SavePlayer(player)
	local d = data[player]
	if not d or not store then return end
	local payload = {
		money = d.money,
		purchased = d.purchased,
		flags = d.flags,
	}
	local ok, err = pcall(function()
		store:SetAsync(keyFor(player), payload)
	end)
	if not ok then
		warn("[Economy] save failed for " .. player.Name .. ": " .. tostring(err))
	end
end

function M.Get(player)
	local d = data[player]
	if d then return d.money end
	return 0
end

function M.Add(player, amount)
	local d = data[player] or M.SetupPlayer(player)
	d.money = d.money + (tonumber(amount) or 0)
	updateLeaderstats(player)
end

function M.Spend(player, amount)
	amount = tonumber(amount) or 0
	local d = data[player] or M.SetupPlayer(player)
	if d.money < amount then
		return false
	end
	d.money = d.money - amount
	updateLeaderstats(player)
	return true
end

-- Live data table; PlotManager reads .purchased / .flags for rebuild-on-reclaim.
function M.GetData(player)
	return data[player] or M.SetupPlayer(player)
end

function M.SetFlag(player, name)
	local d = data[player] or M.SetupPlayer(player)
	d.flags[name] = true
end

function M.HasFlag(player, name)
	local d = data[player]
	if not d then return false end
	return d.flags[name] == true
end

-- The troll obby's REAL reset button. Money, purchases, flags -- all gone.
-- Clears the live tables IN PLACE so any module holding a reference sees it too.
function M.WipeProgress(player)
	local d = data[player] or M.SetupPlayer(player)
	d.money = 0
	for i = #d.purchased, 1, -1 do
		table.remove(d.purchased, i)
	end
	for name in pairs(d.flags) do
		d.flags[name] = nil
	end
	updateLeaderstats(player)
	pcall(function()
		local plot = G.PlotManager.GetPlotOf(player)
		if plot then
			G.PlotManager.ResetPlot(plot, true)
		end
	end)
	M.SavePlayer(player)
end

--------------------------------------------------------------------
-- Init: hooks + autosave + shutdown save
--------------------------------------------------------------------

function M.Init(g)
	G = g

	local ok, result = pcall(function()
		return DataStoreService:GetDataStore("BossTycoonSave_v1")
	end)
	if ok then
		store = result
	else
		warn("[Economy] DataStore unavailable (offline mode): " .. tostring(result))
	end

	Players.PlayerAdded:Connect(function(player)
		M.SetupPlayer(player)
	end)
	for _, player in ipairs(Players:GetPlayers()) do
		task.spawn(function() M.SetupPlayer(player) end)
	end

	Players.PlayerRemoving:Connect(function(player)
		M.SavePlayer(player)
		-- give other Removing handlers (PlotManager) a moment before dropping data
		task.delay(5, function()
			data[player] = nil
		end)
	end)

	-- autosave every 120s
	task.spawn(function()
		while true do
			task.wait(AUTOSAVE_SECONDS)
			for _, player in ipairs(Players:GetPlayers()) do
				M.SavePlayer(player)
				task.wait(0.5)
			end
		end
	end)

	game:BindToClose(function()
		if RunService:IsStudio() and not store then return end
		for _, player in ipairs(Players:GetPlayers()) do
			M.SavePlayer(player)
		end
	end)
end

return M
