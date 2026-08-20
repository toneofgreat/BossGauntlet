-- Weight Lifting Simulator - server entry point. Wires every module through G (no sibling requires).
local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- Remotes must exist before any Init
local Remotes = Instance.new("Folder")
Remotes.Name = "Remotes"
Remotes.Parent = ReplicatedStorage
local function re(name)
	local r = Instance.new("RemoteEvent")
	r.Name = name
	r.Parent = Remotes
end
local function rf(name)
	local r = Instance.new("RemoteFunction")
	r.Name = name
	r.Parent = Remotes
end
re("Lift"); re("LiftFX"); re("GrowFX"); re("BurnFX"); re("Notify"); re("StateChanged")
rf("Buy"); rf("Equip"); rf("GetState")

local Util = require(script.Util)
local Config = require(script.Config)
local Data = require(script.Data)
local ItemModels1 = require(script.ItemModels1)
local ItemModels2 = require(script.ItemModels2)
local ItemModels3 = require(script.ItemModels3)
local Shop = require(script.Shop)
local Lift = require(script.Lift)
local Rebirth = require(script.Rebirth)
local Auras = require(script.Auras)
local Leaderboard = require(script.Leaderboard)
local WorldGym = require(script.WorldGym)
local WorldSpace = require(script.WorldSpace)
local WorldDumbbell = require(script.WorldDumbbell)

local G = {
	Util = Util, Config = Config, Data = Data, Shop = Shop, Lift = Lift,
	Rebirth = Rebirth, Auras = Auras, Leaderboard = Leaderboard,
	WorldGym = WorldGym, WorldSpace = WorldSpace, WorldDumbbell = WorldDumbbell,
	Remotes = Remotes, ItemBuilders = {},
}

Util.Init(G); Config.Init(G); Data.Init(G)
ItemModels1.Init(G); ItemModels2.Init(G); ItemModels3.Init(G)
Shop.Init(G); Lift.Init(G); Rebirth.Init(G); Auras.Init(G); Leaderboard.Init(G)
WorldGym.Init(G); WorldSpace.Init(G); WorldDumbbell.Init(G)

WorldGym.Build(G)
WorldSpace.Build(G)
WorldDumbbell.Build(G)
Shop.BuildDisplayModels(G)
Leaderboard.Start(G)
Lift.Start(G)
Data.HookPlayers(G)

print("[WeightLiftSim] server ready - " .. #Config.Items .. " items loaded")
