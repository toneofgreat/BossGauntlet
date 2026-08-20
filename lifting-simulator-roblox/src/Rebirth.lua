-- Rebirth: the full gate/cost/effect table for r1..r6.
-- Multi model: Ladder[level] * (space and 3) * (dumbbellMulti and 50000) * (lava and 40).
local Rebirth = {}
local G

function Rebirth.Init(g)
	G = g
end

-- Fire the success dressing: toast, state refresh, firework, size re-check.
-- (Callers recompute the multiplier BEFORE composing their message text.)
local function celebrate(player, text)
	G.Data.RecomputeMulti(player)
	G.Data.SyncAll(player)
	G.Lift.CheckSize(player)
	G.Remotes.Notify:FireClient(player, text, "green")
	G.Remotes.StateChanged:FireClient(player)
	local char = player.Character
	if char then
		local root = char:FindFirstChild("HumanoidRootPart")
		if root then
			G.Util.firework(root.Position)
		end
	end
	-- persist unlocks right away so a crash can't eat a rebirth
	task.spawn(function()
		G.Data.Save(player)
	end)
end

function Rebirth.Try(player, id)
	local d = G.Data.Get(player)
	if not d then return false, "Data not loaded yet - try again in a second." end
	local def = G.Config.Rebirths[id]
	if not def then return false, "Unknown rebirth." end

	-- ---------------------------------------------------------------- gates
	if id == "r1" then
		if d.rebirthLevel >= 1 then return false, "You already have Rebirth 1!" end
	elseif id == "r2" then
		if d.rebirthLevel < 1 then return false, "Requires Rebirth 1 first!" end
		if d.rebirthLevel >= 2 then return false, "You already have Rebirth 2!" end
	elseif id == "r3" then
		if d.rebirthLevel < 2 then return false, "Requires Rebirth 2 first!" end
		if d.rebirthLevel >= 3 then return false, "You already have Rebirth 3!" end
	elseif id == "r4" then
		if d.rebirthLevel < 3 then return false, "Requires Rebirth 3 first!" end
		if d.rebirthLevel >= 4 then return false, "You already have Rebirth 4!" end
	elseif id == "r5" then
		if d.dumbbellUnlocked then return false, "Dumbbell World is already unlocked!" end
		if d.rebirthLevel < 4 then return false, "Requires Rebirth 4 first!" end
	elseif id == "r5b" then
		if not d.dumbbellUnlocked then return false, "Requires Rebirth 5 first!" end
		if d.dumbbellMulti then return false, "You already have the Dumbbell Multi!" end
	elseif id == "r6" then
		if not d.dumbbellMulti then return false, "Requires Rebirth 5 ★ first!" end
		if d.lavaUnlocked then return false, "The Lava Zone is already unlocked!" end
	end

	-- ---------------------------------------------------------------- cost
	if d.points < def.cost then
		return false, "Need " .. G.Util.fmt(def.cost) .. " Strength to " .. def.name .. "!"
	end

	-- ---------------------------------------------------------------- effects
	if id == "r1" then
		G.Data.WipeForRebirth(player, true, false)
		d.rebirthLevel = 1
		G.Data.RecomputeMulti(player)
		celebrate(player, "REBIRTH 1! Multiplier is now x" .. G.Util.fmt(d.multi) .. "!")
		return true, "Rebirth 1 complete!"

	elseif id == "r2" then
		G.Data.WipeForRebirth(player, true, false)
		d.rebirthLevel = 2
		d.autoUnlocked = true -- permanent: survives every later reset
		G.Data.RecomputeMulti(player)
		celebrate(player, "REBIRTH 2! AUTOCLICKER unlocked forever! Multi x" .. G.Util.fmt(d.multi) .. "!")
		return true, "Rebirth 2 complete!"

	elseif id == "r3" then
		G.Data.WipeForRebirth(player, true, false)
		d.rebirthLevel = 3
		d.spaceUnlocked = true -- permanent: adds the x3 space bonus + portal access
		G.Data.RecomputeMulti(player)
		celebrate(player, "REBIRTH 3! SPACE WORLD unlocked! Multi x" .. G.Util.fmt(d.multi) .. "!")
		return true, "Rebirth 3 complete!"

	elseif id == "r4" then
		G.Data.WipeForRebirth(player, true, false)
		d.rebirthLevel = 4
		G.Data.RecomputeMulti(player)
		celebrate(player, "REBIRTH 4! Multiplier is now x" .. G.Util.fmt(d.multi) .. "!")
		return true, "Rebirth 4 complete!"

	elseif id == "r5" then
		-- first time only: unlocks Dumbbell World, wipes points + items AND rebirth level
		G.Data.WipeForRebirth(player, true, true)
		d.dumbbellUnlocked = true
		celebrate(player, "REBIRTH 5! DUMBBELL WORLD unlocked! Your rebirths reset... worth it!")
		return true, "Rebirth 5 complete!"

	elseif id == "r5b" then
		-- one-time: permanent x50000 dumbbell multi; points only, items kept
		G.Data.WipeForRebirth(player, false, false)
		d.dumbbellMulti = true
		G.Data.RecomputeMulti(player)
		celebrate(player, "REBIRTH 5 ★! Permanent x50K DUMBBELL MULTI! Multi x" .. G.Util.fmt(d.multi) .. "!")
		return true, "Rebirth 5 ★ complete!"

	elseif id == "r6" then
		-- one-time: permanent x40 + opens the Lava Zone gate; points only
		G.Data.WipeForRebirth(player, false, false)
		d.lavaUnlocked = true
		G.Data.RecomputeMulti(player)
		celebrate(player, "REBIRTH 6! LAVA ZONE unlocked! Multi x" .. G.Util.fmt(d.multi) .. "!")
		return true, "Rebirth 6 complete!"
	end

	return false, "Unknown rebirth."
end

return Rebirth
