-- Lift: manual + auto lifting, candle burn, health regen, and player growth (R15 scaling).
-- Cross-module calls go through G only.
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local Lift = {}
local G

-- Per-player runtime state (cleared on leave)
local rateWindow = {}   -- player -> {t0 = window start clock, n = lifts this window}
local noToolNote = {}   -- player -> clock of last "hold an item" notify (throttle)
local lastBurn = {}     -- player -> clock of last candle burn tick (blocks regen 3 s)

-- Returns the held Tool and its ItemId attribute, or nil if nothing valid is held out.
local function heldItem(player)
	local char = player.Character
	if not char then return nil end
	local tool = char:FindFirstChildOfClass("Tool")
	if not tool then return nil end
	local id = tool:GetAttribute("ItemId")
	if not id then return nil end
	return tool, id
end

-- One lift: gain = item power x player's Multi attribute. Shared by manual + autoclicker.
local function doLift(player)
	local tool, id = heldItem(player)
	if not tool then return false end
	local item = G.Config.ItemById(id)
	if not item then return false end
	local multi = player:GetAttribute("Multi") or 1
	local gain = item.power * multi
	G.Data.AddPoints(player, gain)
	local char = player.Character
	if char then
		G.Remotes.LiftFX:FireAllClients(char, "+" .. G.Util.fmt(gain), id)
	end
	return true
end

-- Live points: prefer the authoritative data table, fall back to the replicated attribute.
local function currentPoints(player)
	local pts
	pcall(function()
		local d = G.Data.Get(player)
		if d then pts = d.points end
	end)
	if pts == nil then pts = player:GetAttribute("Points") end
	return pts or 0
end

function Lift.Init(g)
	G = g
	G.Remotes.Lift.OnServerEvent:Connect(function(player)
		-- Manual rate limit: Config.ManualRateLimit lifts per rolling 1 s window.
		local now = os.clock()
		local w = rateWindow[player]
		if not w or now - w.t0 >= 1 then
			w = {t0 = now, n = 0}
			rateWindow[player] = w
		end
		if w.n >= G.Config.ManualRateLimit then return end
		w.n = w.n + 1
		if not doLift(player) then
			-- No tool held out: red notify, throttled to one every 2 s.
			local last = noToolNote[player] or -10
			if now - last > 2 then
				noToolNote[player] = now
				G.Remotes.Notify:FireClient(player, "Hold a lifting item out first!", "red")
			end
		end
	end)
	Players.PlayerRemoving:Connect(function(player)
		rateWindow[player] = nil
		noToolNote[player] = nil
		lastBurn[player] = nil
	end)
end

function Lift.Start(g)
	if g then G = g end

	-- Autoclicker: players with AutoUnlocked lift automatically while holding an item out.
	task.spawn(function()
		while true do
			task.wait(G.Config.AutoInterval)
			for _, player in ipairs(Players:GetPlayers()) do
				if player:GetAttribute("AutoUnlocked") then
					pcall(doLift, player)
				end
			end
		end
	end)

	-- Candle burn: holding the candle below the safe threshold burns 1 HP/s,
	-- clamped so it can never drop the player below 10 HP.
	task.spawn(function()
		while true do
			task.wait(1)
			for _, player in ipairs(Players:GetPlayers()) do
				pcall(function()
					local tool, id = heldItem(player)
					if tool and id == "candle" and currentPoints(player) < G.Config.CandleSafePoints then
						local char = player.Character
						local hum = char and char:FindFirstChildOfClass("Humanoid")
						if hum and hum.Health > 0 then
							hum.Health = math.max(10, hum.Health - 1) -- hurts, never kills
							lastBurn[player] = os.clock()
							G.Remotes.BurnFX:FireClient(player)
						end
					end
				end)
			end
		end
	end)

	-- Regen: +5 HP/s for anyone not burned in the last 3 s and below max health.
	task.spawn(function()
		while true do
			task.wait(1)
			for _, player in ipairs(Players:GetPlayers()) do
				pcall(function()
					local char = player.Character
					local hum = char and char:FindFirstChildOfClass("Humanoid")
					if hum and hum.Health > 0 and hum.Health < hum.MaxHealth then
						local lb = lastBurn[player]
						if not lb or os.clock() - lb > 3 then
							hum.Health = math.min(hum.MaxHealth, hum.Health + 5)
						end
					end
				end)
			end
		end
	end)
end

-- Scale + how many size thresholds are passed at this many CURRENT points.
local function scaleFor(points)
	local scale, steps = 1, 0
	for _, row in ipairs(G.Config.Sizes) do
		if points >= row[1] then
			scale = row[2]
			steps = steps + 1
		end
	end
	return scale, steps
end

local SCALE_VALUES = {"BodyHeightScale", "BodyWidthScale", "BodyDepthScale", "HeadScale"}

-- Apply a size multiplier to the R15 humanoid scale NumberValues.
-- Each value remembers its avatar-default in a "BaseScale" attribute so the
-- milestone scale MULTIPLIES the default instead of overwriting it.
local function setScales(player, scale, steps, instant)
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if not hum then return end
	for _, name in ipairs(SCALE_VALUES) do
		local v = hum:FindFirstChild(name)
		if v and v:IsA("NumberValue") then -- guard: values missing on R6 / early spawn
			local base = v:GetAttribute("BaseScale")
			if not base then
				base = v.Value
				v:SetAttribute("BaseScale", base)
			end
			local target = base * scale
			if instant then
				v.Value = target
			else
				TweenService:Create(v,
					TweenInfo.new(1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
					{Value = target}):Play()
			end
		end
	end
	-- Mild mobility scaling so giants aren't stuck: +20% per size step, capped at x3.
	local mob = math.min(3, 1 + 0.2 * steps)
	hum.WalkSpeed = 16 * mob
	hum.UseJumpPower = true
	hum.JumpPower = 50 * mob
end

-- Called by Data.AddPoints: grow (or shrink after a wipe) when a threshold is crossed.
function Lift.CheckSize(player)
	local scale, steps = scaleFor(currentPoints(player))
	local current = player:GetAttribute("SizeMult") or 1
	if scale == current then return end
	player:SetAttribute("SizeMult", scale)
	setScales(player, scale, steps, false)
	if scale > current then
		local txt = "x" .. tostring(scale)
		local char = player.Character
		if char then
			G.Remotes.GrowFX:FireAllClients(char, txt)
		end
		G.Remotes.Notify:FireClient(player, "SIZE UP! Now " .. txt .. "!", "yellow")
	end
end

-- Respawn re-application: instant, no celebration FX.
function Lift.ApplySize(player)
	local scale, steps = scaleFor(currentPoints(player))
	player:SetAttribute("SizeMult", scale)
	setScales(player, scale, steps, true)
end

return Lift
