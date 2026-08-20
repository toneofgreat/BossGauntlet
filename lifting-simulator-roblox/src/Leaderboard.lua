-- Leaderboard: OrderedDataStore-backed "TOP 50 LIFTERS" board rendered onto the
-- physical board part that WorldGym registers via Leaderboard.SetBoard(part).
-- In Studio (no DataStore) it falls back to live session players so the board
-- never looks broken.
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")

local Leaderboard = {}
local G

local ROWS = 50
local ROW_H = 34

local boardPart
local listFrame
local gui
local nameCache = {}
local ods

local function getStore()
	if ods then return ods end
	pcall(function()
		ods = DataStoreService:GetOrderedDataStore("WeightLiftLB_v1")
	end)
	return ods
end

local function playerLifetime(player)
	local lt = player:GetAttribute("Lifetime")
	if lt == nil then
		pcall(function()
			local d = G.Data.Get(player)
			if d then lt = d.lifetime end
		end)
	end
	return lt or 0
end

local function nameFor(userId)
	local cached = nameCache[userId]
	if cached then return cached end
	local live = Players:GetPlayerByUserId(userId)
	if live then
		nameCache[userId] = live.Name
		return live.Name
	end
	local ok, name = pcall(function()
		return Players:GetNameFromUserIdAsync(userId)
	end)
	if ok and name then
		nameCache[userId] = name
		return name
	end
	return "Lifter#" .. tostring(userId)
end

-- Pick the face on the board's thinnest axis so the gui sits on the big flat side.
local function boardFace(part)
	local s = part.Size
	if s.Z <= s.X and s.Z <= s.Y then return Enum.NormalId.Front end
	if s.X <= s.Y then return Enum.NormalId.Right end
	return Enum.NormalId.Top
end

local function buildGui()
	if not boardPart then return end
	if gui then gui:Destroy() end
	gui = Instance.new("SurfaceGui")
	gui.Name = "LeaderboardGui"
	gui.Face = boardFace(boardPart)
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 25
	gui.LightInfluence = 0
	gui.Parent = boardPart

	local bg = Instance.new("Frame")
	bg.Size = UDim2.new(1, 0, 1, 0)
	bg.BackgroundColor3 = Color3.fromRGB(18, 18, 22)
	bg.BorderSizePixel = 0
	bg.Parent = gui

	local title = Instance.new("TextLabel")
	title.Size = UDim2.new(1, 0, 0.1, 0)
	title.BackgroundColor3 = Color3.fromRGB(10, 10, 12)
	title.BorderSizePixel = 0
	title.Font = Enum.Font.GothamBlack
	title.Text = "TOP 50 LIFTERS"
	title.TextColor3 = Color3.fromRGB(255, 215, 0)
	title.TextScaled = true
	title.Parent = bg

	listFrame = Instance.new("ScrollingFrame")
	listFrame.Position = UDim2.new(0, 0, 0.1, 0)
	listFrame.Size = UDim2.new(1, 0, 0.9, 0)
	listFrame.BackgroundTransparency = 1
	listFrame.BorderSizePixel = 0
	listFrame.ScrollBarThickness = 8
	listFrame.CanvasSize = UDim2.new(0, 0, 0, 0)
	listFrame.Parent = bg

	local layout = Instance.new("UIListLayout")
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Padding = UDim.new(0, 2)
	layout.Parent = listFrame
end

-- entries: array of {userId, name, value} sorted best-first.
local function render(entries)
	if not listFrame then return end
	for _, ch in ipairs(listFrame:GetChildren()) do
		if ch:IsA("Frame") then ch:Destroy() end
	end
	-- gold / silver / bronze row styling for the podium
	local medal = {
		{Color3.fromRGB(212, 175, 55), Color3.new(0, 0, 0)},
		{Color3.fromRGB(200, 200, 205), Color3.new(0, 0, 0)},
		{Color3.fromRGB(205, 127, 50), Color3.new(0, 0, 0)},
	}
	for i, e in ipairs(entries) do
		local row = Instance.new("Frame")
		row.LayoutOrder = i
		row.Size = UDim2.new(1, -12, 0, ROW_H)
		row.BorderSizePixel = 0
		local m = medal[i]
		if m then
			row.BackgroundColor3 = m[1]
		elseif i % 2 == 0 then
			row.BackgroundColor3 = Color3.fromRGB(30, 30, 36)
		else
			row.BackgroundColor3 = Color3.fromRGB(24, 24, 29)
		end
		local txtColor
		if m then txtColor = m[2] else txtColor = Color3.new(1, 1, 1) end
		local function lbl(x, w, text, align, bold)
			local t = Instance.new("TextLabel")
			t.BackgroundTransparency = 1
			t.Position = UDim2.new(x, 0, 0, 0)
			t.Size = UDim2.new(w, 0, 1, 0)
			if bold then t.Font = Enum.Font.GothamBold else t.Font = Enum.Font.Gotham end
			t.Text = text
			t.TextColor3 = txtColor
			t.TextScaled = true
			t.TextXAlignment = align
			t.Parent = row
		end
		lbl(0.02, 0.1, "#" .. i, Enum.TextXAlignment.Left, true)
		lbl(0.14, 0.5, e.name or "?", Enum.TextXAlignment.Left, m ~= nil)
		lbl(0.64, 0.33, G.Util.fmt(e.value or 0), Enum.TextXAlignment.Right, true)
		row.Parent = listFrame
	end
	listFrame.CanvasSize = UDim2.new(0, 0, 0, #entries * (ROW_H + 2))
end

-- Push one player's lifetime score (also callable by Data on save).
function Leaderboard.Save(player)
	local store = getStore()
	if not store then return end
	local v = math.floor(math.min(playerLifetime(player), 9e15))
	if v > 0 then
		pcall(function()
			store:SetAsync(tostring(player.UserId), v)
		end)
	end
end

local function refresh()
	if not boardPart then return end
	-- 1) push every live player's lifetime so the board includes this session
	local store = getStore()
	if store then
		for _, pl in ipairs(Players:GetPlayers()) do
			Leaderboard.Save(pl)
		end
	end
	-- 2) read the global top 50
	local entries = {}
	local ok = false
	if store then
		ok = pcall(function()
			local pages = store:GetSortedAsync(false, ROWS)
			local page = pages:GetCurrentPage()
			for _, e in ipairs(page) do
				entries[#entries + 1] = {userId = tonumber(e.key), value = e.value}
			end
		end)
	end
	-- 3) Studio / offline fallback: live session players sorted by lifetime
	if not ok or #entries == 0 then
		entries = {}
		for _, pl in ipairs(Players:GetPlayers()) do
			entries[#entries + 1] = {
				userId = pl.UserId,
				name = pl.Name,
				value = math.floor(playerLifetime(pl)),
			}
		end
		table.sort(entries, function(a, b) return a.value > b.value end)
		while #entries > ROWS do table.remove(entries) end
	end
	-- 4) resolve usernames (pcall + cache inside nameFor)
	for _, e in ipairs(entries) do
		if not e.name and e.userId then
			e.name = nameFor(e.userId)
		end
	end
	render(entries)
end

function Leaderboard.Init(g)
	G = g
end

-- WorldGym hands us its framed wall board part.
function Leaderboard.SetBoard(part)
	boardPart = part
	buildGui()
end

function Leaderboard.Start(g)
	if g then G = g end
	task.spawn(function()
		task.wait(3) -- let worlds build and first players load
		while true do
			pcall(refresh)
			task.wait(90)
		end
	end)
end

return Leaderboard
