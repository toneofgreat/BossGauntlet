-- PlotManager.lua — Boss Tycoon (plots agent)
-- Creates the 5 tycoon plots, claim pads, owner name signs, plot resets,
-- the NUKE wipe, and the player join/leave hooks.
-- Contract: plot = {index, model, origin, owner, purchased, cf, itemsFolder}
-- Plot i (1..5): angle a=(i-1)*72deg, center (cos(a)*350, 0, sin(a)*350),
-- origin = CFrame.new(center) * CFrame.Angles(0, -a + pi/2, 0)  (local -Z faces lobby)

local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")
local Debris = game:GetService("Debris")
local TweenService = game:GetService("TweenService")

local M = {}
local G = nil
local plots = {}

local PLOT_COUNT = 5
local PLOT_RADIUS = 350

-- one fun accent color per plot (Util color names)
local PLOT_COLORS = { "cyan", "pink", "orange", "purple", "lightblue" }

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

-- big friendly floating text (own billboard so we fully control the style)
local function bigLabel(part, lines, colors, height)
	local bb = Instance.new("BillboardGui")
	bb.Name = "BigLabel"
	bb.Size = UDim2.new(0, 260, 0, height or 80)
	bb.StudsOffset = Vector3.new(0, 4, 0)
	bb.AlwaysOnTop = true
	bb.MaxDistance = 400
	local n = #lines
	for i = 1, n do
		local lbl = Instance.new("TextLabel")
		lbl.Name = "Line" .. i
		lbl.BackgroundTransparency = 1
		lbl.Position = UDim2.new(0, 0, (i - 1) / n, 0)
		lbl.Size = UDim2.new(1, 0, 1 / n, 0)
		lbl.Font = Enum.Font.FredokaOne
		lbl.TextScaled = true
		lbl.TextStrokeTransparency = 0.15
		lbl.TextStrokeColor3 = Color3.fromRGB(0, 0, 0)
		lbl.TextColor3 = colors[i] or Color3.fromRGB(255, 255, 255)
		lbl.Text = lines[i]
		lbl.Parent = bb
	end
	bb.Parent = part
	return bb
end

--------------------------------------------------------------------
-- plot decoration (static — survives resets, parented to plot.model)
--------------------------------------------------------------------

local function decoratePlot(plot)
	local decor = Instance.new("Folder")
	decor.Name = "Decor"
	decor.Parent = plot.model
	local accent = PLOT_COLORS[plot.index]

	-- glowing border strips around the 80x80 base footprint (walk-over, no collide)
	local strips = {
		{ 0, -41, 86, 2 },   -- front edge (-Z)
		{ 0, 41, 86, 2 },    -- back edge (+Z)
	}
	for _, s in ipairs(strips) do
		G.Util.part({
			Name = "Border",
			Size = Vector3.new(s[3], 0.4, s[4]),
			CFrame = plot:cf(s[1], 0.2, s[2]),
			Color = accent,
			Neon = true,
			CanCollide = false,
			Parent = decor,
		})
	end
	for _, x in ipairs({ -41, 41 }) do
		G.Util.part({
			Name = "Border",
			Size = Vector3.new(2, 0.4, 86),
			CFrame = plot:cf(x, 0.2, 0),
			Color = accent,
			Neon = true,
			CanCollide = false,
			Parent = decor,
		})
	end

	-- neon corner pillars
	for _, c in ipairs({ { -41, -41 }, { 41, -41 }, { -41, 41 }, { 41, 41 } }) do
		G.Util.part({
			Name = "CornerPillar",
			Size = Vector3.new(2, 12, 2),
			CFrame = plot:cf(c[1], 6, c[2]),
			Color = "gray",
			Material = "Metal",
			Parent = decor,
		})
		G.Util.part({
			Name = "CornerGem",
			Size = Vector3.new(3, 3, 3),
			Shape = "Ball",
			CFrame = plot:cf(c[1], 13.5, c[2]),
			Color = accent,
			Neon = true,
			CanCollide = false,
			Parent = decor,
		})
	end

	-- floating plot title at the front
	local titlePart = G.Util.part({
		Name = "PlotTitle",
		Size = Vector3.new(1, 1, 1),
		CFrame = plot:cf(0, 26, -44),
		Transparency = 1,
		CanCollide = false,
		Parent = decor,
	})
	bigLabel(titlePart, { "BOSS TYCOON #" .. plot.index }, { Color3.fromRGB(255, 215, 60) }, 40)
end

--------------------------------------------------------------------
-- name sign over a claimed base
--------------------------------------------------------------------

local function buildNameSign(plot)
	if plot.sign then
		plot.sign:Destroy()
		plot.sign = nil
	end
	local owner = plot.owner
	if not owner then
		return
	end
	local sign = G.Util.part({
		Name = "NameSign",
		Size = Vector3.new(1, 1, 1),
		CFrame = plot:cf(0, 55, 0),
		Transparency = 1,
		CanCollide = false,
		Parent = plot.model,
	})
	local displayName = owner.DisplayName or owner.Name
	bigLabel(sign, { displayName .. "'s", "BOSS BASE" }, {
		Color3.fromRGB(120, 255, 160),
		Color3.fromRGB(255, 215, 60),
	}, 70)
	plot.sign = sign
end

--------------------------------------------------------------------
-- claim pads
--------------------------------------------------------------------

local function onClaimTouched(plot, player)
	if plot.owner ~= nil then
		return
	end
	if M.GetPlotOf(player) then
		notify(player, "You already own a tycoon!", "yellow")
		return
	end
	plot.owner = player
	plot.purchased = {}
	if plot.claimPad then
		plot.claimPad:Destroy()
		plot.claimPad = nil
	end
	buildNameSign(plot)
	notify(player, "You claimed BOSS TYCOON #" .. plot.index .. "! Step on the gold pads to build!", "green")
	-- Purchases handles: rebuild any saved purchases for FREE, then spawn the next pad
	if G.Purchases and G.Purchases.BeginFor then
		G.Purchases.BeginFor(plot)
	end
end

local function spawnClaimPad(plot)
	if plot.claimPad and plot.claimPad.Parent then
		return
	end
	local accent = PLOT_COLORS[plot.index]
	local pad = G.Util.part({
		Name = "ClaimPad",
		Size = Vector3.new(10, 1.2, 10),
		CFrame = plot:cf(0, 0.6, -48),
		Color = accent,
		Neon = true,
		Parent = plot.model,
	})
	G.Util.part({
		Name = "ClaimPadCore",
		Size = Vector3.new(5, 1.4, 5),
		CFrame = plot:cf(0, 0.7, -48),
		Color = "gold",
		Neon = true,
		CanCollide = false,
		Parent = pad,
	})
	bigLabel(pad, { "TOUCH TO CLAIM!", "BOSS TYCOON #" .. plot.index }, {
		Color3.fromRGB(255, 255, 255),
		Color3.fromRGB(255, 215, 60),
	}, 60)
	plot.claimPad = pad
	G.Util.touchOnce(pad, 1, function(player)
		onClaimTouched(plot, player)
	end)
end

--------------------------------------------------------------------
-- nuke explosion visuals
--------------------------------------------------------------------

local function nukeBoom(plot)
	local center = plot:cf(0, 6, 0).Position
	-- classic explosion flashes scattered over the base (visual only: no pressure, no joint breaking)
	for i = 1, 7 do
		local ex = Instance.new("Explosion")
		ex.Position = center + Vector3.new(math.random(-30, 30), math.random(0, 18), math.random(-30, 30))
		ex.BlastPressure = 0
		ex.DestroyJointRadiusPercent = 0
		ex.BlastRadius = 14
		ex.Parent = Workspace
	end
	-- rising orange fireball
	local ball = G.Util.part({
		Name = "NukeFireball",
		Size = Vector3.new(10, 10, 10),
		Shape = "Ball",
		CFrame = CFrame.new(center),
		Color = "orange",
		Neon = true,
		CanCollide = false,
		Transparency = 0.1,
		Parent = Workspace,
	})
	Debris:AddItem(ball, 4)
	local tween = TweenService:Create(ball, TweenInfo.new(3.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		Size = Vector3.new(75, 75, 75),
		Transparency = 1,
		CFrame = CFrame.new(center + Vector3.new(0, 45, 0)),
	})
	tween:Play()
	if G.Util.firework then
		pcall(G.Util.firework, center + Vector3.new(0, 20, 0))
	end
end

--------------------------------------------------------------------
-- public API
--------------------------------------------------------------------

function M.Init(g)
	G = g
	M.Plots = plots
end

function M.GetPlotOf(player)
	for _, plot in ipairs(plots) do
		if plot.owner == player then
			return plot
		end
	end
	return nil
end

-- ResetPlot: wipe built items + purchase pads. keepOwner=true restarts the
-- chain for the current owner; otherwise the plot is unclaimed and the claim
-- pad respawns. NEVER touches the owner's saved data (nuke victims keep their
-- save, so reclaiming rebuilds everything for free).
function M.ResetPlot(plot, keepOwner)
	if plot.itemsFolder then
		plot.itemsFolder:ClearAllChildren()
	end
	plot.purchased = {}
	plot.collectors = {}
	plot.collectorStyle = nil -- next owner must re-buy cool/super collectors
	plot.mainBelts = nil
	if G.Purchases and G.Purchases.ClearPads then
		G.Purchases.ClearPads(plot)
	end
	if keepOwner and plot.owner ~= nil then
		if G.Purchases and G.Purchases.BeginFor then
			G.Purchases.BeginFor(plot)
		end
	else
		plot.owner = nil
		if plot.sign then
			plot.sign:Destroy()
			plot.sign = nil
		end
		spawnClaimPad(plot)
	end
end

-- NukeAllExcept: every OTHER claimed plot goes boom, resets, and unclaims.
-- Victims keep their DataStore save — stepping their claim pad again rebuilds
-- every purchase for free (Purchases.BeginFor handles that).
function M.NukeAllExcept(attacker)
	local attackerPlot = M.GetPlotOf(attacker)
	for _, plot in ipairs(plots) do
		if plot ~= attackerPlot and plot.owner ~= nil then
			local victim = plot.owner
			nukeBoom(plot)
			M.ResetPlot(plot, false)
			notify(victim, attacker.Name .. " NUKED your base! Reclaim a plot to rebuild it for FREE!", "red")
		end
	end
end

--------------------------------------------------------------------
-- Setup: build the 5 plots, hook players
--------------------------------------------------------------------

local function onPlayerAdded(player)
	local ok, err = pcall(G.Economy.SetupPlayer, player)
	if not ok then
		warn("[PlotManager] SetupPlayer failed for " .. player.Name .. ": " .. tostring(err))
	end
end

local function onPlayerRemoving(player)
	pcall(G.Economy.SavePlayer, player)
	local plot = M.GetPlotOf(player)
	if plot then
		-- items do NOT stay: free the plot so someone else can claim it
		M.ResetPlot(plot, false)
	end
end

function M.Setup(g)
	if g then
		G = g
	end
	local root = Instance.new("Folder")
	root.Name = "Plots"
	root.Parent = Workspace

	for i = 1, PLOT_COUNT do
		local a = (i - 1) * math.rad(72)
		local center = Vector3.new(math.cos(a) * PLOT_RADIUS, 0, math.sin(a) * PLOT_RADIUS)
		local origin = CFrame.new(center) * CFrame.Angles(0, -a + math.pi / 2, 0)

		local model = G.Util.model("Plot" .. i, root)
		local itemsFolder = Instance.new("Folder")
		itemsFolder.Name = "Items"
		itemsFolder.Parent = model
		local padsFolder = Instance.new("Folder")
		padsFolder.Name = "Pads"
		padsFolder.Parent = model

		local plot = {
			index = i,
			model = model,
			origin = origin,
			owner = nil,
			purchased = {},
			itemsFolder = itemsFolder,
			padsFolder = padsFolder,
			collectors = {},
			cf = function(self, x, y, z)
				return self.origin * CFrame.new(x, y, z)
			end,
		}
		plots[i] = plot

		decoratePlot(plot)
		spawnClaimPad(plot)
	end

	Players.PlayerAdded:Connect(onPlayerAdded)
	Players.PlayerRemoving:Connect(onPlayerRemoving)
	for _, player in ipairs(Players:GetPlayers()) do
		onPlayerAdded(player)
	end
end

return M
