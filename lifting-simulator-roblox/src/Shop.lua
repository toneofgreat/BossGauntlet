-- Shop: Buy/Equip/GetState remote handlers, tool construction from item builders,
-- and the ReplicatedStorage display-model clones for client viewports.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shop = {}
local G

local function auraById(id)
	for _, a in ipairs(G.Config.Auras) do
		if a.id == id then return a end
	end
	return nil
end

-- The one title flagged morph=true ("The Rock") gates the Rock Morph.
local function morphTitleName()
	for _, t in ipairs(G.Config.Titles) do
		if t[4] then return t[2] end
	end
	return "The Rock"
end

local REQ_TEXT = {
	r1 = "Requires Rebirth 1",
	r2 = "Requires Rebirth 2",
	r4 = "Requires Rebirth 4",
	space = "Requires the Space World (Rebirth 3)",
	dumbbell = "Requires the Dumbbell World (Rebirth 5)",
	lava = "Requires the Lava Zone (Rebirth 6)",
}

local function reqMet(d, req)
	if req == nil then return true end
	if req == "r1" then return (d.rebirthLevel or 0) >= 1 end
	if req == "r2" then return (d.rebirthLevel or 0) >= 2 end
	if req == "r4" then return (d.rebirthLevel or 0) >= 4 end
	if req == "space" then return d.spaceUnlocked == true end
	if req == "dumbbell" then return d.dumbbellUnlocked == true end
	if req == "lava" then return d.lavaUnlocked == true end
	return false
end

local function buyItem(player, id)
	local item = G.Config.ItemById(id)
	if not item then return false, "Unknown item" end
	local d = G.Data.Get(player)
	if not d then return false, "Still loading, try again!" end
	if d.items and d.items[id] then return false, "Already owned" end
	if not reqMet(d, item.req) then return false, REQ_TEXT[item.req] or "Locked" end
	if not G.Data.SpendPoints(player, item.cost) then return false, "Not enough strength!" end
	if not d.items then d.items = {} end
	d.items[id] = true
	Shop.GiveTool(player, id)
	G.Remotes.Notify:FireClient(player, "Bought " .. item.name .. "!", "green")
	G.Remotes.StateChanged:FireClient(player)
	return true, "Bought " .. item.name .. "!"
end

local function buyAura(player, id)
	local aura = auraById(id)
	if not aura then return false, "Unknown aura" end
	local d = G.Data.Get(player)
	if not d then return false, "Still loading, try again!" end
	if d.auras and d.auras[id] then return false, "Already owned" end
	if not G.Data.SpendPoints(player, aura.cost) then return false, "Not enough strength!" end
	if not d.auras then d.auras = {} end
	d.auras[id] = true
	G.Remotes.Notify:FireClient(player, "Aura unlocked: " .. aura.name .. "!", "green")
	G.Remotes.StateChanged:FireClient(player)
	return true, "Aura unlocked: " .. aura.name .. "!"
end

-- Free fast-travel. Arrival CFrames are read at CALL time because the world
-- modules publish them during their Build step, after Shop.Init has run.
local function teleport(player, id)
	local d = G.Data.Get(player)
	if not d then return false, "Still loading, try again!" end
	local cf
	if id == "gym" then
		cf = G.WorldGym.SpawnCF
	elseif id == "space" then
		if not d.spaceUnlocked then return false, "Unlock the Space World first (Rebirth 3)!" end
		cf = G.WorldSpace.ArrivalCF
	elseif id == "dumbbell" then
		if not d.dumbbellUnlocked then return false, "Unlock the Dumbbell World first (Rebirth 5)!" end
		cf = G.WorldDumbbell.ArrivalCF
	elseif id == "lava" then
		if not d.lavaUnlocked then return false, "Unlock the Lava Zone first (Rebirth 6)!" end
		cf = G.WorldGym.LavaCF
	else
		return false, "Unknown destination"
	end
	if not cf then return false, "Destination not ready yet" end
	local char = player.Character
	if not char or not char.PrimaryPart then return false, "No character" end
	char:PivotTo(cf + Vector3.new(0, 3, 0)) -- small lift so big players don't clip the pad
	return true, "Teleported!"
end

local function handleBuy(player, kind, id)
	if type(id) ~= "string" then return false, "Bad request" end
	if kind == "item" then return buyItem(player, id) end
	if kind == "aura" then return buyAura(player, id) end
	if kind == "rebirth" then return G.Rebirth.Try(player, id) end
	if kind == "teleport" then return teleport(player, id) end
	return false, "Unknown request"
end

local function handleEquip(player, kind, id)
	if type(id) ~= "string" then return false, "Bad request" end
	local d = G.Data.Get(player)
	if not d then return false, "Still loading, try again!" end
	if kind == "title" then
		if id ~= "" and not (d.titles and d.titles[id]) then
			return false, "Title not unlocked yet"
		end
		d.equippedTitle = id
		player:SetAttribute("EquippedTitle", id)
	elseif kind == "aura" then
		if id ~= "" and not (d.auras and d.auras[id]) then
			return false, "Aura not owned yet"
		end
		d.equippedAura = id
		player:SetAttribute("EquippedAura", id)
	elseif kind == "morph" then
		if id == "on" then
			if not (d.titles and d.titles[morphTitleName()]) then
				return false, "Unlock The Rock title first!"
			end
			d.morph = true
		else
			d.morph = false
		end
		player:SetAttribute("Morph", d.morph)
	else
		return false, "Unknown equip kind"
	end
	G.Auras.Apply(player)
	G.Remotes.StateChanged:FireClient(player)
	if id == "" then
		return true, "Unequipped"
	end
	return true, "Equipped"
end

local function getState(player)
	local d
	pcall(function() d = G.Data.Get(player) end)
	d = d or {}
	return {
		points = d.points or 0,
		lifetime = d.lifetime or 0,
		multi = player:GetAttribute("Multi") or d.multi or 1,
		rebirthLevel = d.rebirthLevel or 0,
		spaceUnlocked = d.spaceUnlocked == true,
		dumbbellUnlocked = d.dumbbellUnlocked == true,
		dumbbellMulti = d.dumbbellMulti == true,
		lavaUnlocked = d.lavaUnlocked == true,
		autoUnlocked = d.autoUnlocked == true,
		items = d.items or {},
		auras = d.auras or {},
		titles = d.titles or {},
		equippedTitle = d.equippedTitle or "",
		equippedAura = d.equippedAura or "",
		morph = d.morph == true,
	}
end

function Shop.Init(g)
	G = g
	G.Remotes.Buy.OnServerInvoke = function(player, kind, id)
		local ok, a, b = pcall(handleBuy, player, kind, id)
		if not ok then
			warn("[Shop] Buy failed: " .. tostring(a))
			return false, "Server error"
		end
		return a, b
	end
	G.Remotes.Equip.OnServerInvoke = function(player, kind, id)
		local ok, a, b = pcall(handleEquip, player, kind, id)
		if not ok then
			warn("[Shop] Equip failed: " .. tostring(a))
			return false, "Server error"
		end
		return a, b
	end
	G.Remotes.GetState.OnServerInvoke = function(player)
		return getState(player)
	end
end

-- Build a carryable Tool from the item's part-built model.
function Shop.GiveTool(player, id)
	local item = G.Config.ItemById(id)
	local builder = G.ItemBuilders[id]
	if not item or not builder then
		warn("[Shop] GiveTool: no item/builder for " .. tostring(id))
		return
	end
	local backpack = player:FindFirstChildOfClass("Backpack")
	if not backpack then return end
	-- Skip if the player already carries this item (backpack or hands).
	local function has(container)
		if not container then return false end
		for _, t in ipairs(container:GetChildren()) do
			if t:IsA("Tool") and t:GetAttribute("ItemId") == id then return true end
		end
		return false
	end
	if has(backpack) or has(player.Character) then return end

	local ok, model = pcall(builder)
	if not ok or not model or not model.PrimaryPart then
		warn("[Shop] GiveTool: builder failed for " .. tostring(id))
		if ok and model then model:Destroy() end
		return
	end

	local tool = Instance.new("Tool")
	tool.Name = item.name
	tool.ToolTip = item.name
	tool.RequiresHandle = true
	tool.CanBeDropped = false
	tool:SetAttribute("ItemId", id)

	-- PrimaryPart becomes the Handle; everything else welds to it.
	local handle = model.PrimaryPart
	handle.Name = "Handle"
	for _, p in ipairs(model:GetDescendants()) do
		if p:IsA("BasePart") then
			p.Anchored = false
			p.CanCollide = false
			p.Massless = true
			if p ~= handle then
				local w = Instance.new("WeldConstraint")
				w.Part0 = handle
				w.Part1 = p
				w.Parent = handle
			end
		end
	end
	-- The Handle must be a DIRECT child of the Tool; bring the rest across too
	-- (WeldConstraints keep relative placement regardless of hierarchy).
	handle.Parent = tool
	for _, ch in ipairs(model:GetChildren()) do
		ch.Parent = tool
	end
	model:Destroy()

	-- Grip: hold the item slightly below and in front of the palm so it reads
	-- as carried rather than buried inside the hand.
	tool.GripRight = Vector3.new(1, 0, 0)
	tool.GripUp = Vector3.new(0, 1, 0)
	tool.GripForward = Vector3.new(0, 0, -1)
	tool.GripPos = Vector3.new(0, -0.2, -0.6)

	tool.Parent = backpack
end

-- One anchored display clone of every item into ReplicatedStorage.ItemModels
-- for the client shop's ViewportFrames.
function Shop.BuildDisplayModels(g)
	if g then G = g end
	local folder = ReplicatedStorage:FindFirstChild("ItemModels")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "ItemModels"
		folder.Parent = ReplicatedStorage
	end
	for _, item in ipairs(G.Config.Items) do
		local builder = G.ItemBuilders[item.id]
		if builder then
			local ok, model = pcall(builder)
			if ok and model then
				model.Name = item.id
				for _, p in ipairs(model:GetDescendants()) do
					if p:IsA("BasePart") then
						p.Anchored = true
						p.CanCollide = false
					end
				end
				model.Parent = folder
			else
				warn("[Shop] display builder failed for " .. item.id)
			end
		else
			warn("[Shop] no builder registered for " .. item.id)
		end
	end
end

return Shop
