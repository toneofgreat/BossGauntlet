-- Main.server.lua -- Boss Tycoon bootstrap (Script "TycoonMain" in ServerScriptService).
-- Creates Remotes, requires all 14 modules, Inits them in contract order,
-- then builds the world. Every stage is pcall'd so one failure never kills the server.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Lighting = game:GetService("Lighting")

--------------------------------------------------------------------
-- Remotes (must exist BEFORE any Init)
--------------------------------------------------------------------

local remotes = Instance.new("Folder")
remotes.Name = "Remotes"

local function makeEvent(name)
	local ev = Instance.new("RemoteEvent")
	ev.Name = name
	ev.Parent = remotes
end

makeEvent("Notify")
makeEvent("Jumpscare")
makeEvent("TVPrompt")
makeEvent("NukeAlert")
makeEvent("WinGame")
makeEvent("LabFog")

local tvSubmit = Instance.new("RemoteFunction")
tvSubmit.Name = "TVSubmit"
tvSubmit.Parent = remotes
-- Safe default so the client never hangs if UpperFloors fails to wire it.
tvSubmit.OnServerInvoke = function()
	return false, "The TV is not ready yet..."
end

remotes.Parent = ReplicatedStorage

--------------------------------------------------------------------
-- Require all modules (with stubs on failure so the server stays up)
--------------------------------------------------------------------

local function stubModule(name)
	warn("[BossTycoon] using STUB for broken module: " .. name)
	return {
		Init = function() end,
		Build = function() end,
		Setup = function() end,
	}
end

local function safeRequire(name)
	local child = script:FindFirstChild(name)
	if not child then
		warn("[BossTycoon] missing module: " .. name)
		return stubModule(name)
	end
	local ok, result = pcall(require, child)
	if ok and type(result) == "table" then
		return result
	end
	warn("[BossTycoon] require failed for " .. name .. ": " .. tostring(result))
	return stubModule(name)
end

local Util = safeRequire("Util")
local Economy = safeRequire("Economy")
local Balance = safeRequire("Balance")
local ItemsCore = safeRequire("ItemsCore")
local ItemsMain = safeRequire("ItemsMain")
local ItemsUpper = safeRequire("ItemsUpper")
local Obbies = safeRequire("Obbies")
local Lab = safeRequire("Lab")
local UpperFloors = safeRequire("UpperFloors")
local TrollObby = safeRequire("TrollObby")
local Endgame = safeRequire("Endgame")
local Purchases = safeRequire("Purchases")
local Lobby = safeRequire("Lobby")
local PlotManager = safeRequire("PlotManager")

--------------------------------------------------------------------
-- Context table + Init in contract order
--------------------------------------------------------------------

local G = {
	Util = Util, Economy = Economy, Balance = Balance,
	ItemsCore = ItemsCore, ItemsMain = ItemsMain, ItemsUpper = ItemsUpper,
	Obbies = Obbies, Lab = Lab, UpperFloors = UpperFloors,
	TrollObby = TrollObby, Endgame = Endgame,
	Purchases = Purchases, Lobby = Lobby, PlotManager = PlotManager,
	Remotes = remotes,
}

local initOrder = {
	"Util", "Economy", "Balance", "ItemsCore", "ItemsMain", "ItemsUpper",
	"Obbies", "Lab", "UpperFloors", "TrollObby", "Endgame",
	"Purchases", "Lobby", "PlotManager",
}

for _, name in ipairs(initOrder) do
	local mod = G[name]
	if type(mod.Init) == "function" then
		local ok, err = pcall(mod.Init, G)
		if not ok then
			warn("[BossTycoon] Init failed for " .. name .. ": " .. tostring(err))
		end
	end
end

--------------------------------------------------------------------
-- Lighting
--------------------------------------------------------------------

Lighting.ClockTime = 14
Lighting.Brightness = 2

--------------------------------------------------------------------
-- World builds (each in pcall; order per contract)
--------------------------------------------------------------------

local builds = {
	{ "Lobby.Build", Lobby.Build },
	{ "Lab.Build", Lab.Build },
	{ "UpperFloors.Build", UpperFloors.Build },
	{ "TrollObby.Build", TrollObby.Build },
	{ "Endgame.Build", Endgame.Build },
	{ "PlotManager.Setup", PlotManager.Setup },
}

for _, entry in ipairs(builds) do
	local label, fn = entry[1], entry[2]
	if type(fn) == "function" then
		local ok, err = pcall(fn, G)
		if not ok then
			warn("[BossTycoon] " .. label .. " failed: " .. tostring(err))
		end
	else
		warn("[BossTycoon] " .. label .. " is missing")
	end
end

print("[BossTycoon] server up -- go get rich, boss!")
