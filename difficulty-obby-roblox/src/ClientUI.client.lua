-- Difficulty Chart Obby — stage-select GUI (LocalScript, StarterPlayerScripts)
-- Contract: CONTRACT.md "Runtime contract (client)".
-- Top-center bar:  [<]  [ Stage N — Name  v ]  [>]
-- The center button's down-arrow toggles a scrolling list of all 90 stages.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer

-- Guaranteed by the build (DCOData ships in the place file; DCORemotes is created
-- by Main.server.lua before any player handling), so unbounded WaitForChild is OK.
local dataFolder = ReplicatedStorage:WaitForChild("DCOData")
local StageIndex = require(dataFolder:WaitForChild("StageIndex"))
local remotes = ReplicatedStorage:WaitForChild("DCORemotes")
local teleportEvent = remotes:WaitForChild("TeleportToStage")

local TOTAL = #StageIndex

-- ---------------------------------------------------------------- helpers ----

-- Attributes may not be set yet when the GUI builds (DataStore load in flight):
-- treat nil as 1 everywhere.
local function getBest()
	local v = player:GetAttribute("BestStage")
	if type(v) == "number" then return v end
	return 1
end

local function getCurrent()
	local v = player:GetAttribute("CurrentStage")
	if type(v) == "number" then return v end
	return 1
end

local function stageColor(s)
	local c = s.color
	return Color3.new(c[1], c[2], c[3])
end

-- Pick black or white text for readability on a given background color.
local function textColorFor(bg)
	local lum = 0.299 * bg.R + 0.587 * bg.G + 0.114 * bg.B
	if lum > 0.5 then
		return Color3.fromRGB(20, 20, 20)
	end
	return Color3.fromRGB(245, 245, 245)
end

local function rowLabelText(s)
	local txt = string.format("%d  •  %s", s.n, s.name)
	if s.tower then
		txt = txt .. "  🗼"
	end
	return txt
end

local function mk(className, props, parent)
	local inst = Instance.new(className)
	for k, v in pairs(props) do
		inst[k] = v
	end
	inst.Parent = parent
	return inst
end

local function addCorner(parent, scale, offset)
	return mk("UICorner", { CornerRadius = UDim.new(scale, offset) }, parent)
end

local function addStroke(parent, color, thickness, transparency)
	return mk("UIStroke", {
		Color = color,
		Thickness = thickness,
		Transparency = transparency,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
	}, parent)
end

-- ------------------------------------------------------------------- GUI -----

local DARK = Color3.fromRGB(24, 26, 32)
local DARK_STROKE = Color3.fromRGB(255, 255, 255)
local LOCK_BG = Color3.fromRGB(52, 54, 60)
local LOCK_TEXT = Color3.fromRGB(150, 152, 158)

local gui = mk("ScreenGui", {
	Name = "DCOStageSelect",
	ResetOnSpawn = false,
	IgnoreGuiInset = false,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	DisplayOrder = 10,
}, player:WaitForChild("PlayerGui"))

-- Top-center bar --------------------------------------------------------------
local bar = mk("Frame", {
	Name = "TopBar",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0.012, 0),
	Size = UDim2.new(0.44, 0, 0.055, 0),
	BackgroundTransparency = 1,
}, gui)
mk("UISizeConstraint", { MinSize = Vector2.new(260, 34), MaxSize = Vector2.new(560, 52) }, bar)

local function makeArrow(name, text, anchorX, posScaleX)
	local b = mk("TextButton", {
		Name = name,
		AnchorPoint = Vector2.new(anchorX, 0.5),
		Position = UDim2.new(posScaleX, 0, 0.5, 0),
		Size = UDim2.new(0.115, 0, 1, 0),
		BackgroundColor3 = DARK,
		BackgroundTransparency = 0.25,
		Text = text,
		TextColor3 = Color3.fromRGB(240, 240, 240),
		TextScaled = true,
		Font = Enum.Font.GothamBold,
		AutoButtonColor = false,
	}, bar)
	addCorner(b, 0.25, 0)
	addStroke(b, DARK_STROKE, 1, 0.75)
	mk("UIPadding", {
		PaddingTop = UDim.new(0.18, 0),
		PaddingBottom = UDim.new(0.18, 0),
	}, b)
	return b
end

local leftBtn = makeArrow("PrevStage", "◀", 0, 0)
local rightBtn = makeArrow("NextStage", "▶", 1, 1)

-- Center button: "Stage N — Name  ▼" (THE arrow button at the top of the screen)
local centerBtn = mk("TextButton", {
	Name = "StagePicker",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.new(0.5, 0, 0.5, 0),
	Size = UDim2.new(0.75, 0, 1, 0),
	BackgroundColor3 = DARK,
	BackgroundTransparency = 0.25,
	Text = "",
	AutoButtonColor = false,
}, bar)
addCorner(centerBtn, 0.25, 0)
addStroke(centerBtn, DARK_STROKE, 1, 0.75)

local centerLabel = mk("TextLabel", {
	Name = "Title",
	AnchorPoint = Vector2.new(0, 0.5),
	Position = UDim2.new(0.04, 0, 0.5, 0),
	Size = UDim2.new(0.84, 0, 0.6, 0),
	BackgroundTransparency = 1,
	Text = "Stage 1",
	TextColor3 = Color3.fromRGB(245, 245, 245),
	TextScaled = true,
	Font = Enum.Font.GothamBold,
	TextXAlignment = Enum.TextXAlignment.Center,
	TextTruncate = Enum.TextTruncate.AtEnd,
}, centerBtn)

local caret = mk("TextLabel", {
	Name = "Caret",
	AnchorPoint = Vector2.new(1, 0.5),
	Position = UDim2.new(0.985, 0, 0.5, 0),
	Size = UDim2.new(0.1, 0, 0.5, 0),
	BackgroundTransparency = 1,
	Text = "▼",
	TextColor3 = Color3.fromRGB(210, 210, 215),
	TextScaled = true,
	Font = Enum.Font.GothamBold,
}, centerBtn)

-- Subtle progress label ("23/90") under the bar --------------------------------
local progressLabel = mk("TextLabel", {
	Name = "Progress",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 1.06, 0),
	Size = UDim2.new(0.3, 0, 0.42, 0),
	BackgroundTransparency = 1,
	Text = "1/" .. TOTAL,
	TextColor3 = Color3.fromRGB(235, 235, 235),
	TextTransparency = 0.35,
	TextStrokeColor3 = Color3.fromRGB(0, 0, 0),
	TextStrokeTransparency = 0.7,
	TextScaled = true,
	Font = Enum.Font.Gotham,
}, bar)

-- Stage list panel -------------------------------------------------------------
local panel = mk("Frame", {
	Name = "StagePanel",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0.085, 0),
	Size = UDim2.new(0.38, 0, 0.58, 0),
	BackgroundColor3 = DARK,
	BackgroundTransparency = 0.12,
	Visible = false,
}, gui)
mk("UISizeConstraint", { MinSize = Vector2.new(240, 200), MaxSize = Vector2.new(480, 640) }, panel)
addCorner(panel, 0.03, 0)
addStroke(panel, DARK_STROKE, 1, 0.7)

local scroll = mk("ScrollingFrame", {
	Name = "StageList",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.new(0.5, 0, 0.5, 0),
	Size = UDim2.new(0.96, 0, 0.96, 0),
	BackgroundTransparency = 1,
	BorderSizePixel = 0,
	CanvasSize = UDim2.new(0, 0, 0, 0),
	AutomaticCanvasSize = Enum.AutomaticSize.Y,
	ScrollBarThickness = 6,
	ScrollBarImageColor3 = Color3.fromRGB(200, 200, 205),
	ScrollBarImageTransparency = 0.3,
	ScrollingDirection = Enum.ScrollingDirection.Y,
	ElasticBehavior = Enum.ElasticBehavior.WhenScrollable,
}, panel)

local listLayout = mk("UIListLayout", {
	FillDirection = Enum.FillDirection.Vertical,
	SortOrder = Enum.SortOrder.LayoutOrder,
	Padding = UDim.new(0, 3),
}, scroll)
mk("UIPadding", {
	PaddingTop = UDim.new(0, 4),
	PaddingBottom = UDim.new(0, 4),
	PaddingLeft = UDim.new(0, 4),
	PaddingRight = UDim.new(0, 10),
}, scroll)

-- One row per stage ------------------------------------------------------------
-- rows[n] = { button, label, stroke, stage }
local rows = {}

for i = 1, TOTAL do
	local s = StageIndex[i]
	local bg = stageColor(s)

	local row = mk("TextButton", {
		Name = "Stage" .. s.n,
		LayoutOrder = s.n,
		Size = UDim2.new(1, 0, 0.082, 0),
		BackgroundColor3 = bg,
		BackgroundTransparency = 0.1,
		Text = "",
		AutoButtonColor = false,
	}, scroll)
	mk("UISizeConstraint", { MinSize = Vector2.new(0, 26), MaxSize = Vector2.new(9999, 44) }, row)
	addCorner(row, 0, 6)
	local stroke = addStroke(row, Color3.fromRGB(255, 255, 255), 1, 1)

	local label = mk("TextLabel", {
		Name = "Label",
		AnchorPoint = Vector2.new(0, 0.5),
		Position = UDim2.new(0.035, 0, 0.5, 0),
		Size = UDim2.new(0.93, 0, 0.62, 0),
		BackgroundTransparency = 1,
		Text = rowLabelText(s),
		TextColor3 = textColorFor(bg),
		TextScaled = true,
		Font = Enum.Font.GothamMedium,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextTruncate = Enum.TextTruncate.AtEnd,
	}, row)

	rows[s.n] = { button = row, label = label, stroke = stroke, stage = s }
end

-- ------------------------------------------------------------ state / logic ---

local menuOpen = false

local function setRowState(entry)
	local s = entry.stage
	local unlocked = s.n <= getBest()
	local isCurrent = s.n == getCurrent()

	if unlocked then
		local bg = stageColor(s)
		entry.button.BackgroundColor3 = bg
		entry.button.BackgroundTransparency = 0.1
		entry.label.TextColor3 = textColorFor(bg)
		entry.label.Text = rowLabelText(s)
	else
		entry.button.BackgroundColor3 = LOCK_BG
		entry.button.BackgroundTransparency = 0.35
		entry.label.TextColor3 = LOCK_TEXT
		entry.label.Text = "🔒  " .. rowLabelText(s)
	end

	if isCurrent then
		entry.stroke.Transparency = 0.1
		entry.stroke.Thickness = 2
	else
		entry.stroke.Transparency = 1
		entry.stroke.Thickness = 1
	end
end

local function refresh()
	local best = getBest()
	local cur = getCurrent()

	local s = StageIndex[cur]
	if s then
		local txt = "Stage " .. cur .. " — " .. s.name
		if s.tower then
			txt = txt .. " 🗼"
		end
		centerLabel.Text = txt
	else
		centerLabel.Text = "Stage " .. cur
	end

	progressLabel.Text = best .. "/" .. TOTAL

	-- dim arrows when they can't move anywhere
	leftBtn.TextTransparency = (cur <= 1) and 0.6 or 0
	rightBtn.TextTransparency = (cur >= best) and 0.6 or 0

	for n = 1, TOTAL do
		local entry = rows[n]
		if entry then
			setRowState(entry)
		end
	end
end

local function scrollToStage(n)
	local contentY = listLayout.AbsoluteContentSize.Y
	local viewY = scroll.AbsoluteWindowSize.Y
	if contentY <= viewY then return end
	-- rows are uniform: approximate the row's offset by its index
	local target = contentY * ((n - 1) / TOTAL) - viewY * 0.4
	if target < 0 then target = 0 end
	if target > contentY - viewY then target = contentY - viewY end
	scroll.CanvasPosition = Vector2.new(0, target)
end

local function setMenuOpen(open)
	menuOpen = open
	panel.Visible = open
	caret.Text = open and "▲" or "▼"
	if open then
		refresh()
		scrollToStage(getCurrent())
	end
end

local function requestTeleport(n)
	local best = getBest()
	if n < 1 then n = 1 end
	if n > best then n = best end
	teleportEvent:FireServer(n)
end

-- ---------------------------------------------------------------- wiring ------

centerBtn.Activated:Connect(function()
	setMenuOpen(not menuOpen)
end)

leftBtn.Activated:Connect(function()
	requestTeleport(getCurrent() - 1)
end)

rightBtn.Activated:Connect(function()
	requestTeleport(getCurrent() + 1)
end)

for n = 1, TOTAL do
	local entry = rows[n]
	entry.button.Activated:Connect(function()
		if entry.stage.n <= getBest() then
			requestTeleport(entry.stage.n)
			setMenuOpen(false)
		end
	end)

	-- hover feedback (no-op on touch, harmless)
	entry.button.MouseEnter:Connect(function()
		if entry.stage.n <= getBest() then
			entry.button.BackgroundTransparency = 0
			entry.stroke.Transparency = 0.2
		end
	end)
	entry.button.MouseLeave:Connect(function()
		setRowState(entry)
	end)
end

local function hoverButton(b)
	b.MouseEnter:Connect(function()
		b.BackgroundTransparency = 0.05
	end)
	b.MouseLeave:Connect(function()
		b.BackgroundTransparency = 0.25
	end)
end
hoverButton(leftBtn)
hoverButton(rightBtn)
hoverButton(centerBtn)

-- Live updates: rebuild lock states + bar for BOTH attributes; also covers the
-- attributes first appearing after the DataStore load resolves.
player:GetAttributeChangedSignal("BestStage"):Connect(refresh)
player:GetAttributeChangedSignal("CurrentStage"):Connect(refresh)

refresh()
