-- Purchases.lua — Boss Tycoon (plots agent)
-- The purchase engine + the EXACT 68-entry chain from CONTRACT.md
-- (ids, names, prices verbatim — DO NOT ALTER).
--
-- Chain is strictly linear: pad N appears once N-1 is bought.
-- zone="plot"  : gold 6x1x6 neon pad at padOffset (plot-local, via plot:cf),
--                owner-only, spend -> build(G, plot) -> next pad.
-- zone="shared": pad lives in a shared world zone; the owning module (F/T/E)
--                creates the pad and calls Purchases.RegisterSharedPad(id, pad).
--                ANY player may touch; deducts from the toucher, checks THAT
--                player's chain position + flag prerequisites.
--                giant_obby needs lab_escaped, troll_obby needs tv_solved,
--                nuke needs troll_won (repeatable!), etoh needs nuke_launched.

local Workspace = game:GetService("Workspace")

local M = {}
local G = nil
local indexById = {}

--------------------------------------------------------------------
-- build-function wrappers (no requires — resolve through G at call time)
--------------------------------------------------------------------

local function mainFn(name)
	return function(g, plot)
		return g.ItemsMain[name](g, plot)
	end
end

local function upperFn(name)
	return function(g, plot)
		return g.ItemsUpper[name](g, plot)
	end
end

local function obbyFn(name)
	return function(g, plot)
		return g.Obbies[name](g, plot)
	end
end

--------------------------------------------------------------------
-- THE PURCHASE CHAIN — exact ids/names/prices from the contract table.
-- padOffset = plot-local {x, y, z} for the buy pad:
--   floor-1 pads sit on the green slab (top y=1 -> pad y=1.5),
--   floor-2 + balcony pads at y=25, rainbow-floor pads at y=49,
--   black-floor pads at y=73, outside-zone + obby pads on the ground.
--------------------------------------------------------------------

M.List = {
	{ id = "green_floor", name = "Green Floor", price = 0, zone = "plot", padOffset = { 0, 0.5, -10 }, build = mainFn("BuildGreenFloor") },
	{ id = "conveyor1", name = "Conveyor & Collector", price = 0, zone = "plot", padOffset = { -22, 1.5, -7 }, build = mainFn("BuildConveyor1") },
	{ id = "manual_dropper_g", name = "Manual Green Dropper", price = 0, zone = "plot", padOffset = { -30, 1.5, -7 }, build = mainFn("BuildManualDropperG") },
	{ id = "auto_dropper_g1", name = "Auto Green Dropper", price = 150, zone = "plot", padOffset = { -14, 1.5, -7 }, build = mainFn("BuildAutoDropperG1") },
	{ id = "auto_dropper_g2", name = "Auto Green Dropper 2", price = 150, zone = "plot", padOffset = { -6, 1.5, -7 }, build = mainFn("BuildAutoDropperG2") },
	{ id = "upgrader1", name = "Upgrader", price = 300, zone = "plot", padOffset = { 2, 1.5, -7 }, build = mainFn("BuildUpgrader1") },
	{ id = "green_upgrader", name = "Green Upgrader", price = 450, zone = "plot", padOffset = { 10, 1.5, -7 }, build = mainFn("BuildGreenUpgrader") },
	{ id = "cool_collector", name = "Cool Collector", price = 500, zone = "plot", padOffset = { 32, 1.5, -7 }, build = mainFn("BuildCoolCollector") },
	{ id = "speedy_upgrader", name = "Speedy Upgrader", price = 500, zone = "plot", padOffset = { 18, 1.5, -7 }, build = mainFn("BuildSpeedyUpgrader") },
	{ id = "conveyor_walls1", name = "Conveyor Walls", price = 500, zone = "plot", padOffset = { 26, 1.5, -7 }, build = mainFn("BuildConveyorWalls1") },
	{ id = "base_walls", name = "Base Walls", price = 500, zone = "plot", padOffset = { 0, 1.5, 12 }, build = mainFn("BuildBaseWalls") },
	{ id = "owner_door", name = "Owner Door", price = 500, zone = "plot", padOffset = { -8, 1.5, -32 }, build = mainFn("BuildOwnerDoor") },
	{ id = "yellow_upgrader1", name = "Yellow Upgrader", price = 750, zone = "plot", padOffset = { 8, 1.5, 2 }, build = mainFn("BuildYellowUpgrader1") },
	{ id = "spiral_stairs", name = "Spiral Green Stairs", price = 400, zone = "plot", padOffset = { 30, 1.5, 26 }, build = mainFn("BuildSpiralStairs") },
	{ id = "floor2", name = "2nd Floor", price = 500, zone = "plot", padOffset = { 22, 1.5, 32 }, build = mainFn("BuildFloor2") },
	{ id = "conveyor2", name = "2nd Floor Conveyor & Collector", price = 100, zone = "plot", padOffset = { -22, 25, -7 }, build = mainFn("BuildConveyor2") },
	{ id = "obby_easy", name = "Easy Obby", price = 1000, zone = "plot", padOffset = { -10, 0.5, 44 }, build = obbyFn("BuildEasy") },
	{ id = "manual_dropper_y", name = "Yellow Manual Dropper", price = 500, zone = "plot", padOffset = { -30, 25, -7 }, build = mainFn("BuildManualDropperY") },
	{ id = "dropper_y1", name = "Yellow Dropper", price = 750, zone = "plot", padOffset = { -14, 25, -7 }, build = mainFn("BuildDropperY1") },
	{ id = "dropper_y2", name = "Yellow Dropper 2", price = 900, zone = "plot", padOffset = { -6, 25, -7 }, build = mainFn("BuildDropperY2") },
	{ id = "yellow_upgrader2", name = "Yellow Upgrader 2", price = 1100, zone = "plot", padOffset = { 2, 25, -7 }, build = mainFn("BuildYellowUpgrader2") },
	{ id = "speedy_conveyor", name = "Speedy Conveyor", price = 1000, zone = "plot", padOffset = { 10, 25, -7 }, build = mainFn("BuildSpeedyConveyor") },
	{ id = "conveyor_walls2", name = "2F Conveyor Walls", price = 1300, zone = "plot", padOffset = { 18, 25, -7 }, build = mainFn("BuildConveyorWalls2") },
	{ id = "walls2", name = "2F Walls", price = 1100, zone = "plot", padOffset = { 0, 25, 12 }, build = mainFn("BuildWalls2") },
	{ id = "balcony", name = "Balcony", price = 1100, zone = "plot", padOffset = { 36, 25, 0 }, build = upperFn("BuildBalcony") },
	{ id = "balcony_fence", name = "Balcony Fence", price = 2000, zone = "plot", padOffset = { 44, 25, -18 }, build = upperFn("BuildBalconyFence") },
	{ id = "conveyor3", name = "Balcony Conveyor & Collector", price = 1100, zone = "plot", padOffset = { 44, 25, -8 }, build = upperFn("BuildConveyor3") },
	{ id = "super_collectors", name = "Super Cool Collectors", price = 1500, zone = "plot", padOffset = { 46, 25, 22 }, build = upperFn("BuildSuperCollectors") },
	{ id = "balc_dropper1", name = "Balcony Dropper", price = 1200, zone = "plot", padOffset = { 58, 25, -20 }, build = upperFn("BuildBalcDropper1") },
	{ id = "balc_dropper2", name = "Balcony Dropper 2", price = 1400, zone = "plot", padOffset = { 58, 25, -12 }, build = upperFn("BuildBalcDropper2") },
	{ id = "balc_dropper3", name = "Balcony Dropper 3", price = 1700, zone = "plot", padOffset = { 58, 25, -4 }, build = upperFn("BuildBalcDropper3") },
	{ id = "balc_dropper4", name = "Balcony Dropper 4", price = 2100, zone = "plot", padOffset = { 58, 25, 4 }, build = upperFn("BuildBalcDropper4") },
	{ id = "balc_dropper5", name = "Balcony Dropper 5", price = 2800, zone = "plot", padOffset = { 58, 25, 12 }, build = upperFn("BuildBalcDropper5") },
	{ id = "balc_upgrader", name = "Balcony Upgrader", price = 2000, zone = "plot", padOffset = { 46, 25, 0 }, build = upperFn("BuildBalcUpgrader") },
	{ id = "fence_upgrader", name = "Fence Upgrader", price = 3400, zone = "plot", padOffset = { 46, 25, 8 }, build = upperFn("BuildFenceUpgrader") },
	{ id = "red_upgrader", name = "Red Upgrader", price = 5000, zone = "plot", padOffset = { 46, 25, 15 }, build = upperFn("BuildRedUpgrader") },
	{ id = "obby_medium", name = "Medium Obby", price = 2000, zone = "plot", padOffset = { 0, 0.5, 44 }, build = obbyFn("BuildMedium") },
	{ id = "obby_hard", name = "Hard Obby", price = 15000, zone = "plot", padOffset = { 10, 0.5, 44 }, build = obbyFn("BuildHard") },
	{ id = "obby_intense", name = "Intense Obby", price = 30000, zone = "plot", padOffset = { 20, 0.5, 44 }, build = obbyFn("BuildIntense") },
	{ id = "out_collector1", name = "Outside Collector", price = 40000, zone = "plot", padOffset = { -48, 0.5, -16 }, build = upperFn("BuildOutCollector1") },
	{ id = "out_dropper_red", name = "Red Dropper", price = 50000, zone = "plot", padOffset = { -56, 0.5, -16 }, build = upperFn("BuildOutDropperRed") },
	{ id = "out_red_upgrader", name = "Red Dropper Upgrader", price = 50000, zone = "plot", padOffset = { -64, 0.5, -16 }, build = upperFn("BuildOutRedUpgrader") },
	{ id = "out_collector2", name = "Outside Collector 2", price = 60000, zone = "plot", padOffset = { -48, 0.5, 0 }, build = upperFn("BuildOutCollector2") },
	{ id = "out_dropper_black", name = "Black Dropper", price = 75000, zone = "plot", padOffset = { -56, 0.5, 0 }, build = upperFn("BuildOutDropperBlack") },
	{ id = "out_black_upgrader", name = "Black Dropper Upgrader", price = 100000, zone = "plot", padOffset = { -64, 0.5, 0 }, build = upperFn("BuildOutBlackUpgrader") },
	{ id = "rainbow_ladder", name = "Ladder: Yellow to Rainbow", price = 200000, zone = "plot", padOffset = { -34, 25, 22 }, build = upperFn("BuildRainbowLadder") },
	{ id = "rainbow_conveyor", name = "Rainbow Conveyor & Collector", price = 300000, zone = "plot", padOffset = { -22, 49, -7 }, build = upperFn("BuildRainbowConveyor") },
	{ id = "dropper_pink", name = "Pink Dropper", price = 500000, zone = "plot", padOffset = { -14, 49, -7 }, build = upperFn("BuildDropperPink") },
	{ id = "dropper_blue", name = "Blue Dropper", price = 700000, zone = "plot", padOffset = { -6, 49, -7 }, build = upperFn("BuildDropperBlue") },
	{ id = "dropper_white", name = "White Dropper", price = 900000, zone = "plot", padOffset = { 2, 49, -7 }, build = upperFn("BuildDropperWhite") },
	{ id = "gray_upgrader", name = "Gray Upgrader", price = 1500000, zone = "plot", padOffset = { 10, 49, -7 }, build = upperFn("BuildGrayUpgrader") },
	{ id = "rainbow_walls", name = "Rainbow-to-Black Walls", price = 1000000, zone = "plot", padOffset = { 0, 49, 12 }, build = upperFn("BuildRainbowWalls") },
	{ id = "black_ladder", name = "Rainbow-to-Black Ladder", price = 1200000, zone = "plot", padOffset = { -34, 49, 22 }, build = upperFn("BuildBlackLadder") },
	{ id = "black_floor", name = "Black Floor", price = 10000000, zone = "plot", padOffset = { -26, 49, 28 }, build = upperFn("BuildBlackFloor") },
	{ id = "lanterns", name = "4 Lanterns", price = 4000000, zone = "plot", padOffset = { -10, 73, 0 }, build = upperFn("BuildLanterns") },
	{ id = "black_walls_roof", name = "Pitch Black Walls & Roof", price = 5000000, zone = "plot", padOffset = { 0, 73, 12 }, build = upperFn("BuildBlackWallsRoof") },
	{ id = "portal_frame", name = "Portal Frame", price = 25000000, zone = "plot", padOffset = { 10, 73, 0 }, build = upperFn("BuildPortalFrame") },
	{ id = "portal", name = "Portal", price = 50000000, zone = "plot", padOffset = { 20, 73, 0 }, build = upperFn("BuildPortal") },
	{ id = "giant_obby", name = "The Giant Obby", price = 100000000, zone = "shared", needsFlag = "lab_escaped", flagMsg = "Escape the LAB first!", hint = "Find its pad in the Sky Lobby (go through your Portal + Lab!)" },
	{ id = "top_walls_floor", name = "Walls & Next Floor", price = 10000000, zone = "shared", hint = "Find its pad in the Sky Lobby top floor!" },
	{ id = "sword_giver", name = "Sword Giver", price = 50000000, zone = "shared", hint = "Find its pad on the Sky Lobby top floor!" },
	{ id = "bookshelf", name = "Bookshelf", price = 250000000, zone = "shared", hint = "Find its pad on the Sky Lobby top floor!" },
	{ id = "metal_holder", name = "Metal Holder", price = 75000000, zone = "shared", hint = "Find its pad on the Sky Lobby top floor!" },
	{ id = "tv", name = "TV", price = 80000000, zone = "shared", hint = "Find its pad on the Sky Lobby top floor!" },
	{ id = "bench", name = "Bench", price = 100000000, zone = "shared", hint = "Find its pad on the Sky Lobby top floor!" },
	{ id = "troll_obby", name = "Troll Obby", price = 1000000000, zone = "shared", needsFlag = "tv_solved", flagMsg = "Solve the TV code first!", hint = "Find its pad at the Troll Tower!" },
	{ id = "nuke", name = "NUKE", price = 1000000000000, zone = "shared", repeatable = true, needsFlag = "troll_won", flagMsg = "Beat the Troll Obby first!", hint = "Find its pad at the NUKE silo!" },
	{ id = "etoh", name = "Eternal Tower of Hell", price = 2000000000000, zone = "shared", needsFlag = "nuke_launched", flagMsg = "Launch the NUKE first!", hint = "Find its pad at the final tower!" },
}

--------------------------------------------------------------------
-- helpers
--------------------------------------------------------------------

local function notify(player, text, colorName)
	if player and player.Parent and G and G.Remotes then
		local ev = G.Remotes:FindFirstChild("Notify")
		if ev then
			ev:FireClient(player, text, colorName)
		end
	end
end

local function getPadsFolder(plot)
	if plot.padsFolder and plot.padsFolder.Parent then
		return plot.padsFolder
	end
	local f = plot.model:FindFirstChild("Pads")
	if not f then
		f = Instance.new("Folder")
		f.Name = "Pads"
		f.Parent = plot.model
	end
	plot.padsFolder = f
	return f
end

-- gold pad billboard: item name (white) + price (red, or green FREE!) + optional hint line
local function padBillboard(pad, nameText, price, hintText)
	local rows = 2
	if hintText then
		rows = 3
	end
	local bb = Instance.new("BillboardGui")
	bb.Name = "BuyLabel"
	bb.Size = UDim2.new(0, 210, 0, 26 * rows + 14)
	bb.StudsOffset = Vector3.new(0, 3.4, 0)
	bb.AlwaysOnTop = true
	bb.MaxDistance = 150

	local nameLabel = Instance.new("TextLabel")
	nameLabel.Name = "ItemName"
	nameLabel.BackgroundTransparency = 1
	nameLabel.Size = UDim2.new(1, 0, 1 / rows, 0)
	nameLabel.Font = Enum.Font.FredokaOne
	nameLabel.TextScaled = true
	nameLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
	nameLabel.TextStrokeTransparency = 0.15
	nameLabel.Text = nameText
	nameLabel.Parent = bb

	local priceLabel = Instance.new("TextLabel")
	priceLabel.Name = "Price"
	priceLabel.BackgroundTransparency = 1
	priceLabel.Position = UDim2.new(0, 0, 1 / rows, 0)
	priceLabel.Size = UDim2.new(1, 0, 1 / rows, 0)
	priceLabel.Font = Enum.Font.FredokaOne
	priceLabel.TextScaled = true
	priceLabel.TextStrokeTransparency = 0.15
	if price > 0 then
		priceLabel.TextColor3 = Color3.fromRGB(255, 85, 85)
		priceLabel.Text = G.Util.fmt(price)
	else
		priceLabel.TextColor3 = Color3.fromRGB(90, 255, 130)
		priceLabel.Text = "FREE!"
	end
	priceLabel.Parent = bb

	if hintText then
		local hintLabel = Instance.new("TextLabel")
		hintLabel.Name = "Hint"
		hintLabel.BackgroundTransparency = 1
		hintLabel.Position = UDim2.new(0, 0, 2 / rows, 0)
		hintLabel.Size = UDim2.new(1, 0, 1 / rows, 0)
		hintLabel.Font = Enum.Font.FredokaOne
		hintLabel.TextScaled = true
		hintLabel.TextColor3 = Color3.fromRGB(255, 230, 120)
		hintLabel.TextStrokeTransparency = 0.15
		hintLabel.Text = hintText
		hintLabel.Parent = bb
	end

	bb.Parent = pad
	return bb
end

-- remember a purchase in the player's persistent save (Economy.GetData)
local function rememberPurchase(player, id)
	local ok, data = pcall(G.Economy.GetData, player)
	if not ok or type(data) ~= "table" then
		return
	end
	if type(data.purchased) ~= "table" then
		data.purchased = {}
	end
	for _, saved in ipairs(data.purchased) do
		if saved == id then
			return
		end
	end
	table.insert(data.purchased, id)
end

--------------------------------------------------------------------
-- the chain engine
--------------------------------------------------------------------

local spawnNext -- forward declaration (spawnPlotPad and spawnNext are mutually recursive)

local function spawnPlotPad(plot, index)
	local entry = M.List[index]
	local off = entry.padOffset or { 0, 0.5, -10 }
	local pads = getPadsFolder(plot)
	local pad = G.Util.part({
		Name = "BuyPad_" .. entry.id,
		Size = Vector3.new(6, 1, 6),
		CFrame = plot:cf(off[1], off[2], off[3]),
		Color = "gold",
		Neon = true,
		Parent = pads,
	})
	padBillboard(pad, entry.name, entry.price)

	-- Util.touchOnce gives the per-player 1s debounce (also throttles red notifies)
	G.Util.touchOnce(pad, 1, function(player)
		if plot.owner ~= player then
			if plot.owner ~= nil then
				notify(player, "Only " .. plot.owner.Name .. " can buy this!", "yellow")
			end
			return
		end
		if plot.purchased[entry.id] then
			pad:Destroy()
			spawnNext(plot)
			return
		end
		if not G.Economy.Spend(player, entry.price) then
			notify(player, "Need " .. G.Util.fmt(entry.price) .. "!", "red")
			return
		end
		plot.purchased[entry.id] = true
		rememberPurchase(player, entry.id)
		pad:Destroy()
		if entry.build then
			local ok, err = pcall(entry.build, G, plot)
			if not ok then
				warn("[Purchases] build failed for " .. entry.id .. ": " .. tostring(err))
			end
		end
		notify(player, "Bought: " .. entry.name, "green")
		spawnNext(plot)
	end)
	return pad
end

-- spawn whatever comes next in the chain for this plot:
--  * next entry is a plot item  -> gold buy pad at its padOffset
--  * next entry is shared       -> floating hologram at the plot front telling
--                                  the owner where in the world to go
--  * nothing left               -> golden TYCOON COMPLETE trophy
spawnNext = function(plot)
	local pads = getPadsFolder(plot)
	local oldHint = pads:FindFirstChild("NextHint")
	if oldHint then
		oldHint:Destroy()
	end

	local nextIndex = nil
	for i, entry in ipairs(M.List) do
		if not plot.purchased[entry.id] then
			nextIndex = i
			break
		end
	end

	if not nextIndex then
		if not pads:FindFirstChild("CompleteTrophy") then
			local trophy = G.Util.part({
				Name = "CompleteTrophy",
				Size = Vector3.new(3, 3, 3),
				Shape = "Ball",
				CFrame = plot:cf(0, 6, -44),
				Color = "gold",
				Neon = true,
				CanCollide = false,
				Parent = pads,
			})
			padBillboard(trophy, "TYCOON 100% COMPLETE!", 0)
		end
		return
	end

	local entry = M.List[nextIndex]
	if entry.zone == "plot" then
		if not pads:FindFirstChild("BuyPad_" .. entry.id) then
			spawnPlotPad(plot, nextIndex)
		end
	else
		local holo = G.Util.part({
			Name = "NextHint",
			Size = Vector3.new(2.5, 2.5, 2.5),
			CFrame = plot:cf(0, 5, -44),
			Color = "gold",
			Neon = true,
			CanCollide = false,
			Parent = pads,
		})
		padBillboard(holo, "NEXT: " .. entry.name, entry.price, entry.hint)
	end
end

--------------------------------------------------------------------
-- shared-zone purchases (#59-68)
--------------------------------------------------------------------

-- NUKE launch: prefer Endgame's cinematic (Endgame.LaunchNuke(G, plot) if it
-- exists); otherwise run a built-in fallback rocket so the contract behavior
-- (NukeAlert -> NukeAllExcept -> nuke_launched) always happens.
local function doNuke(player, plot)
	pcall(G.Economy.SetFlag, player, "nuke_launched")
	local eg = G.Endgame
	if eg and type(eg.LaunchNuke) == "function" then
		local ok, err = pcall(eg.LaunchNuke, G, plot)
		if ok then
			return
		end
		warn("[Purchases] Endgame.LaunchNuke failed, using fallback: " .. tostring(err))
	end
	pcall(function()
		local ev = G.Remotes:FindFirstChild("NukeAlert")
		if ev then
			ev:FireAllClients(player.Name)
		end
	end)
	task.spawn(function()
		local rocket = G.Util.part({
			Name = "FallbackNukeRocket",
			Size = Vector3.new(6, 18, 6),
			CFrame = CFrame.new(-800, 12, 1500),
			Color = "red",
			Neon = true,
			CanCollide = false,
			Parent = Workspace,
		})
		local tip = G.Util.part({
			Name = "FallbackNukeTip",
			Size = Vector3.new(5, 5, 5),
			Shape = "Ball",
			CFrame = CFrame.new(-800, 23.5, 1500),
			Color = "orange",
			Neon = true,
			CanCollide = false,
			Parent = Workspace,
		})
		for i = 1, 100 do
			task.wait(0.03)
			rocket.CFrame = rocket.CFrame + Vector3.new(0, 4, 0)
			tip.CFrame = tip.CFrame + Vector3.new(0, 4, 0)
		end
		rocket:Destroy()
		tip:Destroy()
		if G.PlotManager and G.PlotManager.NukeAllExcept then
			G.PlotManager.NukeAllExcept(player)
		end
	end)
end

local function onSharedTouch(player, index)
	local entry = M.List[index]
	local plot = nil
	if G.PlotManager and G.PlotManager.GetPlotOf then
		plot = G.PlotManager.GetPlotOf(player)
	end
	if not plot then
		notify(player, "Claim a tycoon plot first!", "red")
		return
	end
	local already = plot.purchased[entry.id]
	if already and not entry.repeatable then
		notify(player, "You already own " .. entry.name .. "!", "yellow")
		return
	end
	local prev = M.List[index - 1]
	if prev and not plot.purchased[prev.id] then
		notify(player, "Buy '" .. prev.name .. "' first!", "red")
		return
	end
	if entry.needsFlag and not G.Economy.HasFlag(player, entry.needsFlag) then
		notify(player, entry.flagMsg or "You are not ready for this yet!", "red")
		return
	end
	if not G.Economy.Spend(player, entry.price) then
		notify(player, "Need " .. G.Util.fmt(entry.price) .. "!", "red")
		return
	end
	if not already then
		plot.purchased[entry.id] = true
		rememberPurchase(player, entry.id)
	end
	pcall(G.Economy.SetFlag, player, "bought_" .. entry.id)
	notify(player, "Bought: " .. entry.name, "green")
	if entry.id == "nuke" then
		doNuke(player, plot)
	elseif entry.build then
		local ok, err = pcall(entry.build, G, plot)
		if not ok then
			warn("[Purchases] shared build failed for " .. entry.id .. ": " .. tostring(err))
		end
	end
	spawnNext(plot)
end

-- Modules F/T/E create their shared pads during Build(G) and hand them to us.
function M.RegisterSharedPad(id, pad)
	local index = indexById[id]
	if not index then
		warn("[Purchases] RegisterSharedPad: unknown id " .. tostring(id))
		return
	end
	local entry = M.List[index]
	if not pad:FindFirstChildOfClass("BillboardGui") then
		padBillboard(pad, entry.name, entry.price)
	end
	G.Util.touchOnce(pad, 1, function(player)
		onSharedTouch(player, index)
	end)
end

--------------------------------------------------------------------
-- public API for PlotManager
--------------------------------------------------------------------

function M.ClearPads(plot)
	getPadsFolder(plot):ClearAllChildren()
end

-- Called after a claim (or a keep-owner reset): rebuild every SAVED purchase
-- for free in chain order (plot builds re-run; shared items just re-mark —
-- their world visuals are permanent and access gates re-check purchase state
-- and flags), then spawn the next buy pad.
function M.BeginFor(plot)
	M.ClearPads(plot)
	local player = plot.owner
	if not player then
		return
	end
	local saved = {}
	local ok, data = pcall(G.Economy.GetData, player)
	if ok and type(data) == "table" and type(data.purchased) == "table" then
		for _, id in ipairs(data.purchased) do
			saved[id] = true
		end
	end
	local rebuilt = 0
	for _, entry in ipairs(M.List) do
		if saved[entry.id] and not plot.purchased[entry.id] then
			plot.purchased[entry.id] = true
			if entry.zone == "plot" and entry.build then
				local okBuild, err = pcall(entry.build, G, plot)
				if not okBuild then
					warn("[Purchases] rebuild failed for " .. entry.id .. ": " .. tostring(err))
				end
				rebuilt = rebuilt + 1
			end
		end
	end
	if rebuilt > 0 then
		notify(player, "Welcome back! Rebuilt " .. rebuilt .. " saved items for FREE!", "green")
	end
	spawnNext(plot)
end

function M.GetEntry(id)
	local index = indexById[id]
	if index then
		return M.List[index]
	end
	return nil
end

function M.Init(g)
	G = g
	for i, entry in ipairs(M.List) do
		indexById[entry.id] = i
	end
end

return M
