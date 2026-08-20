-- ClientUI.client.lua - Weight Lifting Simulator full interface.
-- LocalScript in StarterPlayerScripts. Builds every GUI element in code.
-- Dark modern style: UICorner + UIStroke + subtle UIGradient headers,
-- hover scale 1.05 and press spring on every button.
-- Cannot require server modules: carries its own fmt() and item data copies.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local RE_Notify = Remotes:WaitForChild("Notify")
local RE_StateChanged = Remotes:WaitForChild("StateChanged")
local RF_Buy = Remotes:WaitForChild("Buy")
local RF_Equip = Remotes:WaitForChild("Equip")
local RF_GetState = Remotes:WaitForChild("GetState")

--------------------------------------------------------------------
-- SECTION: number formatting (local copy of Util.fmt - no $ sign,
-- K M B T Q Qi Sx suffixes, one decimal trimming ".0", "0.1" sub-1)
--------------------------------------------------------------------

local FMT_STEPS = {
	{1e21, "Sx"},
	{1e18, "Qi"},
	{1e15, "Q"},
	{1e12, "T"},
	{1e9,  "B"},
	{1e6,  "M"},
	{1e3,  "K"},
}

local function oneDecimal(v)
	v = math.floor(v * 10 + 0.5) / 10
	if v == math.floor(v) then
		return tostring(math.floor(v))
	end
	return string.format("%.1f", v)
end

local function fmt(n)
	n = tonumber(n) or 0
	local neg = n < 0
	local a = math.abs(n)
	local s
	if a < 1e3 then
		s = oneDecimal(a)
		if tonumber(s) >= 1e3 then
			s = "1K"
		end
	else
		local suffix, div = "K", 1e3
		for _, step in ipairs(FMT_STEPS) do
			if a >= step[1] then
				suffix = step[2]
				div = step[1]
				break
			end
		end
		local v = math.floor((a / div) * 10) / 10
		if v == math.floor(v) then
			s = tostring(math.floor(v)) .. suffix
		else
			s = string.format("%.1f", v) .. suffix
		end
	end
	if neg then
		return "-" .. s
	end
	return s
end

--------------------------------------------------------------------
-- SECTION: local data copies (id/name/cost/power/world/req/desc
-- copied EXACTLY from src/Config.lua - keep in sync with Config)
--------------------------------------------------------------------

local ITEMS = {
	{id="pencil", name="Pencil", cost=0, power=1, world="gym", req=nil,
		desc="A real No. 2 pencil - yellow, sharpened, pink eraser. Everyone starts somewhere."},
	{id="rock", name="Rock", cost=50, power=2, world="gym", req=nil,
		desc="A chunky gray rock straight off the ground. Heavier than it looks."},
	{id="book", name="Book", cost=250, power=4, world="gym", req=nil,
		desc="A thick hardcover book. Knowledge is power. Literally, in here."},
	{id="lamp", name="Small Lamp", cost=1250, power=5, world="gym", req=nil,
		desc="A little desk lamp with a warm glowing bulb. Unplugged, probably."},
	{id="candle", name="Candle", cost=10000, power=20, world="gym", req="r1",
		desc="Tiny but literally on fire. Burns you 1 HP per second unless you have 100K strength!"},
	{id="tv", name="TV", cost=35000, power=35, world="gym", req="r1",
		desc="A big flatscreen TV, remote included. Do NOT drop it."},
	{id="house", name="House", cost=1000000, power=50, world="gym", req="r1",
		desc="An entire house. Roof, door, windows, chimney. You lift it."},
	{id="cybertruck", name="Cybertruck", cost=2000000, power=70, world="gym", req="r2",
		desc="A stainless steel triangle truck. Shatterproof windows not included."},
	{id="tree", name="Tree", cost=5000000, power=100, world="gym", req="r2",
		desc="A full-grown tree, roots and all. Nature is heavy."},
	{id="train", name="Train", cost=25000000, power=400, world="gym", req="r2",
		desc="A whole locomotive with a coal car. All aboard the gain train."},
	{id="moon", name="Moon", cost=125000000, power=550, world="space", req="space",
		desc="The actual Moon. Craters, dust and all. One small lift for man..."},
	{id="pluto", name="Pluto", cost=225000000, power=750, world="space", req="space",
		desc="Still a planet in our hearts. Icy, tiny, extremely liftable."},
	{id="mars", name="Mars", cost=350000000, power=1000, world="space", req="space",
		desc="The red planet, polar ice caps included. Rover sold separately."},
	{id="earth", name="Earth", cost=500000000, power=1500, world="space", req="space",
		desc="Home sweet home - oceans, continents, clouds. Careful with it."},
	{id="neptune", name="Neptune", cost=750000000, power=2500, world="space", req="space",
		desc="A deep-blue ice giant with howling winds. Very cold. Very heavy."},
	{id="jupiter", name="Jupiter", cost=1e9, power=4000, world="space", req="space",
		desc="The biggest planet, Great Red Spot and all. 318 Earths of gains."},
	{id="sun", name="Sun", cost=3e9, power=8000, world="space", req="space",
		desc="A blazing ball of plasma. Do not look directly at your dumbbell."},
	{id="blackhole", name="Black Hole", cost=100e12, power=14000, world="space", req="r4",
		desc="Infinite density, swirling accretion disk. It lifts back."},
	{id="protein", name="Protein Bar", cost=0, power=0.1, world="dumbbell", req="dumbbell",
		desc="Chocolate flavored, 20g protein. The humble beginning... again."},
	{id="dumbbell", name="Dumbbell", cost=1000, power=1, world="dumbbell", req="dumbbell",
		desc="A real hex dumbbell. Finally, actual gym equipment."},
	{id="pushups", name="Pushup Bars", cost=100000, power=5, world="dumbbell", req="dumbbell",
		desc="A pair of steel pushup bars. The floor is your enemy now."},
	{id="situps", name="Situp Bench", cost=1e9, power=150, world="dumbbell", req="dumbbell",
		desc="An inclined situp bench with padded rollers. Core of steel."},
	{id="universe", name="The Universe", cost=10e15, power=10000, world="dumbbell", req="dumbbell",
		desc="Every galaxy, star and atom in one swirling ball. Yes, you are also in it."},
	{id="lavaball", name="Lava Ball", cost=10e15, power=15000, world="lava", req="lava",
		desc="A roiling sphere of molten rock. Oven mitts strongly recommended."},
	{id="lavaplanet", name="Lava Planet", cost=1e18, power=125000, world="lava", req="lava",
		desc="An entire world of magma oceans and obsidian crust."},
	{id="lavaeclipse", name="Lava Eclipse", cost=10e18, power=150000, world="lava", req="lava",
		desc="A burning sun eclipsed by a molten moon - a ring of pure fire."},
	{id="gdstar", name="GD Star", cost=1e21, power=450000, world="lava", req="lava",
		desc="The legendary golden star. The final lift. Shines brighter than the sun."},
}

local LADDER = {[0]=1, [1]=3, [2]=15, [3]=125, [4]=50000}

local REBIRTH_ORDER = {"r1", "r2", "r3", "r4", "r5", "r5b", "r6"}
local REBIRTHS = {
	r1  = {name="Rebirth 1", cost=2500,
		blurb="x3 multiplier. Resets your strength and items."},
	r2  = {name="Rebirth 2", cost=1200000,
		blurb="x15 multiplier + unlocks the AUTOCLICKER (auto-lift every 0.2s, forever). Resets strength and items."},
	r3  = {name="Rebirth 3", cost=100e6,
		blurb="x125 multiplier + unlocks the SPACE WORLD (permanent extra x3). Resets strength and items."},
	r4  = {name="Rebirth 4", cost=15e9,
		blurb="x50,000 multiplier (replaces x125). Resets strength and items."},
	r5  = {name="Rebirth 5", cost=1e15,
		blurb="Unlocks the DUMBBELL WORLD... but resets strength, items AND all your rebirths. The ultimate sacrifice."},
	r5b = {name="Rebirth 5 *", cost=1e15,
		blurb="Permanent x50,000 DUMBBELL MULTI. Only takes your strength this time - items and rebirths are safe."},
	r6  = {name="Rebirth 6", cost=50e15,
		blurb="Permanent x40 multi + unlocks the LAVA ZONE gate in the gym world. Takes your strength only."},
}

-- {lifetime points, name, color rgb, has morph}
local TITLES = {
	{1, "Noobie", {170,170,170}, false},
	{1e3, "Starter", {255,255,255}, false},
	{2e3, "Beginner", {170,255,127}, false},
	{3e3, "Rookie", {60,200,60}, false},
	{5e5, "Pro", {0,230,255}, false},
	{150e6, "Hacker", {0,255,70}, false},
	{5e9, "1010101", {0,255,0}, false},
	{125e9, "Bot", {100,140,210}, false},
	{200e9, "Hecker", {255,40,40}, false},
	{100e12, "God", {255,215,0}, false},
	{1e20, "The Rock", {160,160,155}, true},
}

local AURAS = {
	{id="fire", name="Fire Aura", cost=100000,
		desc="Wreathe yourself in real flames and drifting embers."},
	{id="water", name="Water Aura", cost=110000,
		desc="Cool blue droplets and a swirling ring of mist."},
	{id="void", name="Void Aura", cost=1e12,
		desc="Dark purple orbs orbit you. The void stares back."},
	{id="rainbowgod", name="Flying Mythical Rainbow God Aura", cost=1e21,
		desc="Angel wings, a golden halo, and rainbows everywhere. The final flex."},
}

local AURA_GRADS = {
	fire = {Color3.fromRGB(255, 120, 30), Color3.fromRGB(200, 30, 20)},
	water = {Color3.fromRGB(60, 170, 255), Color3.fromRGB(20, 60, 180)},
	void = {Color3.fromRGB(140, 40, 200), Color3.fromRGB(20, 5, 40)},
	rainbowgod = nil, -- special rainbow sequence built below
}

local REQ_TEXT = {
	r1 = "Rebirth 1 required",
	r2 = "Rebirth 2 required",
	r4 = "Rebirth 4 required",
	space = "Space World required",
	dumbbell = "Dumbbell World required",
	lava = "Lava Zone required",
}

local TABS = {
	{id="gym", label="Gym", emoji="\u{1F3CB}", lockText="always open"},
	{id="space", label="Space", emoji="\u{1F680}", lockText="Rebirth 3 required"},
	{id="dumbbell", label="Dumbbell", emoji="\u{1F4AA}", lockText="Rebirth 5 required"},
	{id="lava", label="Lava", emoji="\u{1F30B}", lockText="Rebirth 6 required"},
}

local TELEPORTS = {
	{id="gym", name="Iron Temple Gym", emoji="\u{1F3CB}", lockText=nil},
	{id="space", name="Space World", emoji="\u{1F680}", lockText="Rebirth 3 required"},
	{id="dumbbell", name="Dumbbell World", emoji="\u{1F4AA}", lockText="Rebirth 5 required"},
	{id="lava", name="Lava Zone Gate", emoji="\u{1F30B}", lockText="Rebirth 6 required"},
}

--------------------------------------------------------------------
-- SECTION: palette + tiny UI factory helpers
--------------------------------------------------------------------

local COL = {
	bg      = Color3.fromRGB(24, 26, 32),
	panel   = Color3.fromRGB(32, 34, 43),
	card    = Color3.fromRGB(41, 44, 56),
	cardHi  = Color3.fromRGB(52, 56, 72),
	stroke  = Color3.fromRGB(70, 76, 96),
	text    = Color3.fromRGB(236, 239, 246),
	sub     = Color3.fromRGB(158, 165, 182),
	green   = Color3.fromRGB(70, 200, 110),
	greenDk = Color3.fromRGB(40, 120, 70),
	gold    = Color3.fromRGB(255, 200, 60),
	red     = Color3.fromRGB(225, 70, 70),
	redDk   = Color3.fromRGB(120, 40, 40),
	gray    = Color3.fromRGB(70, 74, 88),
	blue    = Color3.fromRGB(80, 140, 235),
	autoOn  = Color3.fromRGB(90, 255, 140),
}

local NOTIFY_COLORS = {
	green = Color3.fromRGB(70, 200, 110),
	red = Color3.fromRGB(230, 80, 80),
	yellow = Color3.fromRGB(250, 210, 80),
	white = Color3.fromRGB(236, 239, 246),
}

local function mk(class, props, parent)
	local inst = Instance.new(class)
	for k, v in pairs(props) do
		inst[k] = v
	end
	inst.Parent = parent
	return inst
end

local function corner(el, px)
	return mk("UICorner", {CornerRadius = UDim.new(0, px or 10)}, el)
end

local function stroke(el, color, thick, transparency)
	return mk("UIStroke", {
		Color = color or COL.stroke,
		Thickness = thick or 1.5,
		Transparency = transparency or 0,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
	}, el)
end

local function vgrad(el, c1, c2, rotation)
	return mk("UIGradient", {
		Color = ColorSequence.new(c1, c2),
		Rotation = rotation or 90,
	}, el)
end

local function padding(el, px)
	return mk("UIPadding", {
		PaddingTop = UDim.new(0, px), PaddingBottom = UDim.new(0, px),
		PaddingLeft = UDim.new(0, px), PaddingRight = UDim.new(0, px),
	}, el)
end

-- Every button: hover scale 1.05 + press spring (Back/Elastic tweens).
local function hoverify(btn)
	local sc = Instance.new("UIScale")
	sc.Scale = 1
	sc.Parent = btn
	local function tw(scale, t, style)
		TweenService:Create(sc,
			TweenInfo.new(t, style or Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
			{Scale = scale}):Play()
	end
	btn.MouseEnter:Connect(function() tw(1.05, 0.12) end)
	btn.MouseLeave:Connect(function() tw(1, 0.12) end)
	btn.MouseButton1Down:Connect(function() tw(0.92, 0.07) end)
	btn.MouseButton1Up:Connect(function()
		TweenService:Create(sc,
			TweenInfo.new(0.4, Enum.EasingStyle.Elastic, Enum.EasingDirection.Out),
			{Scale = 1.05}):Play()
	end)
	return btn
end

local function makeButton(props, parent)
	local btn = mk("TextButton", {
		BackgroundColor3 = props.color or COL.green,
		Size = props.size or UDim2.new(0, 140, 0, 40),
		Position = props.pos or UDim2.new(0, 0, 0, 0),
		AnchorPoint = props.anchor or Vector2.new(0, 0),
		Text = props.text or "OK",
		Font = props.font or Enum.Font.GothamBold,
		TextSize = props.textSize or 16,
		TextColor3 = props.textColor or Color3.new(1, 1, 1),
		AutoButtonColor = false,
		TextWrapped = true,
		LayoutOrder = props.order or 0,
	}, parent)
	corner(btn, props.radius or 10)
	stroke(btn, props.strokeColor or Color3.fromRGB(255, 255, 255), 1, 0.75)
	hoverify(btn)
	return btn
end

local function clearFrame(f)
	for _, c in ipairs(f:GetChildren()) do
		c:Destroy()
	end
end

--------------------------------------------------------------------
-- SECTION: attribute + remote helpers, server state cache
--------------------------------------------------------------------

local function attrNum(name, def)
	local v = player:GetAttribute(name)
	if type(v) == "number" then
		return v
	end
	return def or 0
end

local function attrBool(name)
	local v = player:GetAttribute(name)
	return v == true
end

-- Owned-state cache; refreshed via GetState on StateChanged.
local state = {
	items = {}, auras = {}, titles = {},
	equippedTitle = "", equippedAura = "", morph = false,
}

local refreshOpenWindow -- forward declared (defined after windows exist)
local toast -- forward declared

local fetching = false
local function refreshState()
	if fetching then
		return
	end
	fetching = true
	task.spawn(function()
		local ok, res = pcall(function()
			return RF_GetState:InvokeServer()
		end)
		fetching = false
		if ok and type(res) == "table" then
			state = res
			state.items = state.items or {}
			state.auras = state.auras or {}
			state.titles = state.titles or {}
			state.equippedTitle = state.equippedTitle or ""
			state.equippedAura = state.equippedAura or ""
			if refreshOpenWindow then
				refreshOpenWindow()
			end
		end
	end)
end

local function doBuy(kind, id)
	task.spawn(function()
		local ok, success, msg = pcall(function()
			return RF_Buy:InvokeServer(kind, id)
		end)
		if ok then
			if msg and msg ~= "" and toast then
				local colorName = "red"
				if success then
					colorName = "green"
				end
				toast(msg, colorName)
			end
			refreshState()
		end
	end)
end

local function doEquip(kind, id)
	task.spawn(function()
		local ok, success, msg = pcall(function()
			return RF_Equip:InvokeServer(kind, id)
		end)
		if ok then
			if msg and msg ~= "" and not success and toast then
				toast(msg, "red")
			end
			refreshState()
		end
	end)
end

local function reqMet(req)
	if req == nil then
		return true
	end
	if req == "r1" then return attrNum("RebirthLevel", 0) >= 1 end
	if req == "r2" then return attrNum("RebirthLevel", 0) >= 2 end
	if req == "r4" then return attrNum("RebirthLevel", 0) >= 4 end
	if req == "space" then return attrBool("SpaceUnlocked") end
	if req == "dumbbell" then return attrBool("DumbbellUnlocked") end
	if req == "lava" then return attrBool("LavaUnlocked") end
	return false
end

local function tabUnlocked(id)
	if id == "gym" then return true end
	if id == "space" then return attrBool("SpaceUnlocked") end
	if id == "dumbbell" then return attrBool("DumbbellUnlocked") end
	if id == "lava" then return attrBool("LavaUnlocked") end
	return false
end

local function equippedTitleName()
	local v = player:GetAttribute("EquippedTitle")
	if type(v) == "string" then
		return v
	end
	return state.equippedTitle or ""
end

local function equippedAuraId()
	local v = player:GetAttribute("EquippedAura")
	if type(v) == "string" then
		return v
	end
	return state.equippedAura or ""
end

local function morphOn()
	local v = player:GetAttribute("Morph")
	if v ~= nil then
		return v == true
	end
	return state.morph == true
end

--------------------------------------------------------------------
-- SECTION: root ScreenGui
--------------------------------------------------------------------

local gui = mk("ScreenGui", {
	Name = "LiftUI",
	ResetOnSpawn = false,
	IgnoreGuiInset = false,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	DisplayOrder = 10,
}, playerGui)

--------------------------------------------------------------------
-- SECTION: HUD - strength counter, multi chip, size chip, AUTO chip
--------------------------------------------------------------------

local hud = mk("Frame", {
	Name = "HUD",
	BackgroundTransparency = 1,
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 6),
	Size = UDim2.new(0, 430, 0, 100),
}, gui)

local counterFrame = mk("Frame", {
	Name = "Counter",
	BackgroundColor3 = COL.panel,
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 0),
	Size = UDim2.new(0, 340, 0, 54),
}, hud)
corner(counterFrame, 14)
stroke(counterFrame, COL.stroke, 1.5, 0.2)
vgrad(counterFrame, Color3.fromRGB(46, 50, 66), Color3.fromRGB(28, 30, 39))

local counterLabel = mk("TextLabel", {
	Name = "Strength",
	BackgroundTransparency = 1,
	Size = UDim2.new(1, -20, 1, 0),
	Position = UDim2.new(0, 10, 0, 0),
	Font = Enum.Font.GothamBlack,
	Text = "\u{1F4AA} 0",
	TextSize = 30,
	TextColor3 = COL.text,
	TextScaled = true,
}, counterFrame)
mk("UITextSizeConstraint", {MaxTextSize = 32, MinTextSize = 14}, counterLabel)

local chipRow = mk("Frame", {
	Name = "Chips",
	BackgroundTransparency = 1,
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 58),
	Size = UDim2.new(1, 0, 0, 30),
}, hud)
mk("UIListLayout", {
	FillDirection = Enum.FillDirection.Horizontal,
	HorizontalAlignment = Enum.HorizontalAlignment.Center,
	VerticalAlignment = Enum.VerticalAlignment.Center,
	Padding = UDim.new(0, 8),
}, chipRow)

local function makeChip(text, textColor, order)
	local chip = mk("TextLabel", {
		BackgroundColor3 = COL.panel,
		Size = UDim2.new(0, 110, 0, 28),
		AutomaticSize = Enum.AutomaticSize.X,
		Font = Enum.Font.GothamBold,
		Text = text,
		TextSize = 15,
		TextColor3 = textColor,
		LayoutOrder = order,
	}, chipRow)
	padding(chip, 6)
	corner(chip, 14)
	stroke(chip, COL.stroke, 1, 0.3)
	return chip
end

local multiChip = makeChip("x1", COL.gold, 1)
local sizeChip = makeChip("Size x1", Color3.fromRGB(140, 220, 255), 2)

-- AUTO chip bottom-right: lights up when AutoUnlocked attribute is on.
local autoChip = mk("TextLabel", {
	Name = "AutoChip",
	BackgroundColor3 = COL.panel,
	AnchorPoint = Vector2.new(1, 1),
	Position = UDim2.new(1, -14, 1, -14),
	Size = UDim2.new(0, 118, 0, 40),
	Font = Enum.Font.GothamBlack,
	Text = "\u{26A1} AUTO",
	TextSize = 18,
	TextColor3 = Color3.fromRGB(110, 114, 128),
}, gui)
corner(autoChip, 12)
local autoStroke = stroke(autoChip, COL.stroke, 2, 0.4)

local function updateAutoChip()
	if attrBool("AutoUnlocked") then
		autoChip.TextColor3 = COL.autoOn
		autoChip.BackgroundColor3 = Color3.fromRGB(30, 48, 38)
		autoStroke.Color = COL.autoOn
		autoStroke.Transparency = 0.1
	else
		autoChip.TextColor3 = Color3.fromRGB(110, 114, 128)
		autoChip.BackgroundColor3 = COL.panel
		autoStroke.Color = COL.stroke
		autoStroke.Transparency = 0.4
	end
end

local function updateChips()
	multiChip.Text = "x" .. fmt(attrNum("Multi", 1))
	sizeChip.Text = "Size x" .. fmt(attrNum("SizeMult", 1))
end

--------------------------------------------------------------------
-- SECTION: toast notifications (slide in top-right, stack, 3s)
--------------------------------------------------------------------

local toastHolder = mk("Frame", {
	Name = "Toasts",
	BackgroundTransparency = 1,
	AnchorPoint = Vector2.new(1, 0),
	Position = UDim2.new(1, -12, 0, 64),
	Size = UDim2.new(0, 300, 1, -140),
	ClipsDescendants = false,
}, gui)
mk("UIListLayout", {
	FillDirection = Enum.FillDirection.Vertical,
	HorizontalAlignment = Enum.HorizontalAlignment.Right,
	VerticalAlignment = Enum.VerticalAlignment.Top,
	Padding = UDim.new(0, 6),
	SortOrder = Enum.SortOrder.LayoutOrder,
}, toastHolder)

local toastOrder = 0
toast = function(text, colorName)
	local color = NOTIFY_COLORS[colorName] or NOTIFY_COLORS.white
	toastOrder = toastOrder + 1
	local slot = mk("Frame", {
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 0, 44),
		AutomaticSize = Enum.AutomaticSize.Y,
		LayoutOrder = toastOrder,
		ClipsDescendants = false,
	}, toastHolder)
	local card = mk("TextLabel", {
		BackgroundColor3 = COL.panel,
		Position = UDim2.new(0, 340, 0, 0), -- starts off-screen right
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		Font = Enum.Font.GothamBold,
		Text = text,
		TextSize = 15,
		TextColor3 = color,
		TextWrapped = true,
		TextXAlignment = Enum.TextXAlignment.Left,
	}, slot)
	padding(card, 10)
	corner(card, 10)
	stroke(card, color, 1.5, 0.25)
	TweenService:Create(card,
		TweenInfo.new(0.3, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
		{Position = UDim2.new(0, 0, 0, 0)}):Play()
	task.delay(3, function()
		if card.Parent then
			local out = TweenService:Create(card,
				TweenInfo.new(0.25, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
				{Position = UDim2.new(0, 340, 0, 0)})
			out:Play()
			out.Completed:Wait()
		end
		if slot.Parent then
			slot:Destroy()
		end
	end)
end

RE_Notify.OnClientEvent:Connect(function(text, colorName)
	toast(tostring(text), colorName)
end)

--------------------------------------------------------------------
-- SECTION: window framework + left icon rail
--------------------------------------------------------------------

local holder = mk("Frame", {
	Name = "WindowHolder",
	BackgroundTransparency = 1,
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.new(0.5, 0, 0.5, 10),
	Size = UDim2.new(0.72, 0, 0.76, 0),
	Visible = false,
}, gui)
mk("UISizeConstraint", {
	MaxSize = Vector2.new(780, 560),
	MinSize = Vector2.new(400, 320),
}, holder)

local windows = {} -- name -> {frame=, content=, scale=, refresh=}
local openName = nil

local function makeWindow(name, title, emoji)
	local frame = mk("Frame", {
		Name = name .. "Window",
		BackgroundColor3 = COL.bg,
		Size = UDim2.new(1, 0, 1, 0),
		Visible = false,
	}, holder)
	corner(frame, 16)
	stroke(frame, COL.stroke, 2, 0.15)
	local scale = mk("UIScale", {Scale = 1}, frame)

	-- header with subtle gradient
	local header = mk("Frame", {
		Name = "Header",
		BackgroundColor3 = Color3.fromRGB(44, 48, 63),
		Size = UDim2.new(1, 0, 0, 46),
	}, frame)
	corner(header, 16)
	vgrad(header, Color3.fromRGB(58, 62, 84), Color3.fromRGB(36, 39, 51))
	-- square off the header's bottom corners
	mk("Frame", {
		BackgroundColor3 = Color3.fromRGB(36, 39, 51),
		BorderSizePixel = 0,
		Position = UDim2.new(0, 0, 1, -14),
		Size = UDim2.new(1, 0, 0, 14),
	}, header)

	mk("TextLabel", {
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 16, 0, 0),
		Size = UDim2.new(1, -80, 1, 0),
		Font = Enum.Font.GothamBlack,
		Text = emoji .. "  " .. title,
		TextSize = 20,
		TextColor3 = COL.text,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 2,
	}, header)

	local closeBtn = makeButton({
		text = "\u{2715}",
		color = COL.red,
		size = UDim2.new(0, 34, 0, 34),
		pos = UDim2.new(1, -8, 0.5, 0),
		anchor = Vector2.new(1, 0.5),
		textSize = 16,
	}, header)
	closeBtn.ZIndex = 3

	local content = mk("Frame", {
		Name = "Content",
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 10, 0, 52),
		Size = UDim2.new(1, -20, 1, -62),
	}, frame)

	local w = {frame = frame, content = content, scale = scale, refresh = function() end}
	windows[name] = w

	closeBtn.MouseButton1Click:Connect(function()
		frame.Visible = false
		holder.Visible = false
		openName = nil
	end)
	return w
end

local function openWindow(name)
	if openName == name then
		windows[name].frame.Visible = false
		holder.Visible = false
		openName = nil
		return
	end
	for n, w in pairs(windows) do
		w.frame.Visible = (n == name)
	end
	openName = name
	holder.Visible = true
	windows[name].refresh()
	local sc = windows[name].scale
	sc.Scale = 0.85
	TweenService:Create(sc,
		TweenInfo.new(0.25, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
		{Scale = 1}):Play()
end

refreshOpenWindow = function()
	if openName and windows[openName] then
		windows[openName].refresh()
	end
end

-- Left icon rail
local rail = mk("Frame", {
	Name = "Rail",
	BackgroundTransparency = 1,
	AnchorPoint = Vector2.new(0, 0.5),
	Position = UDim2.new(0, 10, 0.5, 0),
	Size = UDim2.new(0, 74, 0, 5 * 74 + 4 * 8),
}, gui)
mk("UIListLayout", {
	FillDirection = Enum.FillDirection.Vertical,
	Padding = UDim.new(0, 8),
	SortOrder = Enum.SortOrder.LayoutOrder,
}, rail)

local RAIL_DEFS = {
	{name = "Shop", emoji = "\u{1F6D2}", label = "SHOP"},
	{name = "Rebirth", emoji = "\u{1F504}", label = "REBIRTH"},
	{name = "Titles", emoji = "\u{1F3C6}", label = "TITLES"},
	{name = "Auras", emoji = "\u{2728}", label = "AURAS"},
	{name = "Teleport", emoji = "\u{1F300}", label = "TELEPORT"},
}

for i, def in ipairs(RAIL_DEFS) do
	local btn = mk("TextButton", {
		Name = def.name .. "Btn",
		BackgroundColor3 = COL.panel,
		Size = UDim2.new(0, 74, 0, 74),
		Text = "",
		AutoButtonColor = false,
		LayoutOrder = i,
	}, rail)
	corner(btn, 14)
	stroke(btn, COL.stroke, 1.5, 0.25)
	vgrad(btn, Color3.fromRGB(48, 52, 68), Color3.fromRGB(30, 32, 42))
	mk("TextLabel", {
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 0, 0, 6),
		Size = UDim2.new(1, 0, 0, 38),
		Font = Enum.Font.GothamBold,
		Text = def.emoji,
		TextSize = 30,
		TextColor3 = COL.text,
	}, btn)
	mk("TextLabel", {
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 0, 1, -24),
		Size = UDim2.new(1, 0, 0, 18),
		Font = Enum.Font.GothamBold,
		Text = def.label,
		TextSize = 11,
		TextColor3 = COL.sub,
	}, btn)
	hoverify(btn)
	btn.MouseButton1Click:Connect(function()
		openWindow(def.name)
	end)
end

--------------------------------------------------------------------
-- SECTION: affordability watcher (recolor BUY buttons as Points move
-- without rebuilding whole windows every attribute tick)
--------------------------------------------------------------------

local costButtons = {} -- {btn=TextButton, cost=number}

local function updateAffordability()
	local pts = attrNum("Points", 0)
	for i = #costButtons, 1, -1 do
		local e = costButtons[i]
		if not e.btn.Parent then
			table.remove(costButtons, i)
		else
			if pts >= e.cost then
				e.btn.BackgroundColor3 = COL.green
			else
				e.btn.BackgroundColor3 = COL.gray
			end
		end
	end
end

--------------------------------------------------------------------
-- SECTION: viewport machinery - ONE RenderStepped connection drives
-- every visible viewport's camera orbit (plus the HUD count-up).
--------------------------------------------------------------------

local itemModelsFolder = nil
task.spawn(function()
	itemModelsFolder = ReplicatedStorage:WaitForChild("ItemModels", 60)
end)

local spinEntries = {} -- {vp=, cam=, center=, dist=, lift=, angle=}

local function attachModelToViewport(vp, srcModel)
	local model = srcModel:Clone()
	model.Parent = vp
	local cam = Instance.new("Camera")
	cam.FieldOfView = 40
	cam.Parent = vp
	vp.CurrentCamera = cam
	-- Frame the model's bounding box: orbit distance from its diagonal.
	local cf, size = model:GetBoundingBox()
	local center = cf.Position
	local dist = size.Magnitude * 0.9 + 1.5
	local entry = {
		vp = vp, cam = cam, center = center, dist = dist,
		lift = size.Y * 0.25,
		angle = math.random() * 6.28,
	}
	cam.CFrame = CFrame.new(
		center + Vector3.new(math.sin(entry.angle) * dist, entry.lift, math.cos(entry.angle) * dist),
		center)
	table.insert(spinEntries, entry)
end

local function setupViewport(vp, itemId)
	task.spawn(function()
		local folder = itemModelsFolder
		if not folder then
			folder = ReplicatedStorage:WaitForChild("ItemModels", 60)
			itemModelsFolder = folder
		end
		if not folder then
			return
		end
		local src = folder:FindFirstChild(itemId)
		if not src then
			src = folder:WaitForChild(itemId, 15)
		end
		if src and vp.Parent then
			attachModelToViewport(vp, src)
		end
	end)
end

--------------------------------------------------------------------
-- SECTION: Shop window - tabs Gym/Space/Dumbbell/Lava + item list
--------------------------------------------------------------------

local shopWin = makeWindow("Shop", "ITEM SHOP", "\u{1F6D2}")
local currentTab = "gym"

local tabBar = mk("Frame", {
	Name = "TabBar",
	BackgroundTransparency = 1,
	Size = UDim2.new(1, 0, 0, 40),
}, shopWin.content)
mk("UIListLayout", {
	FillDirection = Enum.FillDirection.Horizontal,
	Padding = UDim.new(0, 6),
	SortOrder = Enum.SortOrder.LayoutOrder,
}, tabBar)

local tabButtons = {}
for i, tab in ipairs(TABS) do
	local btn = mk("TextButton", {
		Name = "Tab_" .. tab.id,
		BackgroundColor3 = COL.card,
		Size = UDim2.new(0.25, -5, 1, 0),
		Text = tab.emoji .. " " .. tab.label,
		Font = Enum.Font.GothamBold,
		TextSize = 15,
		TextColor3 = COL.text,
		AutoButtonColor = false,
		LayoutOrder = i,
	}, tabBar)
	corner(btn, 10)
	stroke(btn, COL.stroke, 1.5, 0.35)
	hoverify(btn)
	tabButtons[tab.id] = btn
	btn.MouseButton1Click:Connect(function()
		currentTab = tab.id
		shopWin.refresh()
	end)
end

local itemList = mk("ScrollingFrame", {
	Name = "ItemList",
	BackgroundTransparency = 1,
	Position = UDim2.new(0, 0, 0, 48),
	Size = UDim2.new(1, 0, 1, -48),
	CanvasSize = UDim2.new(0, 0, 0, 0),
	AutomaticCanvasSize = Enum.AutomaticSize.Y,
	ScrollBarThickness = 6,
	ScrollBarImageColor3 = COL.stroke,
	BorderSizePixel = 0,
}, shopWin.content)

local function buildItemRow(it, order, listParent)
	local row = mk("Frame", {
		Name = "Item_" .. it.id,
		BackgroundColor3 = COL.card,
		Size = UDim2.new(1, -8, 0, 104),
		LayoutOrder = order,
	}, listParent)
	corner(row, 12)
	stroke(row, COL.stroke, 1, 0.4)

	-- left: ViewportFrame with the item's ACTUAL model
	local vp = mk("ViewportFrame", {
		Name = "View",
		BackgroundColor3 = Color3.fromRGB(20, 22, 28),
		Position = UDim2.new(0, 8, 0.5, 0),
		AnchorPoint = Vector2.new(0, 0.5),
		Size = UDim2.new(0, 88, 0, 88),
		Ambient = Color3.fromRGB(180, 180, 190),
		LightColor = Color3.fromRGB(255, 250, 240),
		LightDirection = Vector3.new(-1, -1, -0.6),
	}, row)
	corner(vp, 10)
	stroke(vp, COL.stroke, 1, 0.5)
	setupViewport(vp, it.id)

	-- middle: name, desc, +N per lift
	local mid = mk("Frame", {
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 104, 0, 6),
		Size = UDim2.new(1, -104 - 150, 1, -12),
	}, row)
	mk("TextLabel", {
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 0, 20),
		Font = Enum.Font.GothamBlack,
		Text = it.name,
		TextSize = 17,
		TextColor3 = COL.text,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextTruncate = Enum.TextTruncate.AtEnd,
	}, mid)
	mk("TextLabel", {
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 0, 0, 22),
		Size = UDim2.new(1, 0, 0, 46),
		Font = Enum.Font.Gotham,
		Text = it.desc,
		TextSize = 12,
		TextColor3 = COL.sub,
		TextWrapped = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Top,
	}, mid)
	mk("TextLabel", {
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 0, 1, -20),
		Size = UDim2.new(1, 0, 0, 18),
		Font = Enum.Font.GothamBold,
		Text = "+" .. fmt(it.power) .. " per lift",
		TextSize = 14,
		TextColor3 = COL.green,
		TextXAlignment = Enum.TextXAlignment.Left,
	}, mid)

	-- right: price + state-aware button
	local priceText = "FREE"
	if it.cost > 0 then
		priceText = fmt(it.cost)
	end
	mk("TextLabel", {
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -12, 0, 12),
		Size = UDim2.new(0, 130, 0, 22),
		Font = Enum.Font.GothamBlack,
		Text = "\u{1FAD9} " .. priceText,
		TextSize = 17,
		TextColor3 = COL.gold,
		TextXAlignment = Enum.TextXAlignment.Right,
	}, row)

	local owned = state.items[it.id] == true
	local met = reqMet(it.req)
	local btnText, btnColor, clickable
	if owned then
		btnText = "OWNED"
		btnColor = COL.blue
		clickable = false
	elseif not met then
		btnText = "\u{1F512} " .. (REQ_TEXT[it.req] or "Locked")
		btnColor = COL.gray
		clickable = false
	else
		btnText = "BUY"
		btnColor = COL.gray -- affordability watcher turns it green
		clickable = true
	end

	local buy = makeButton({
		text = btnText,
		color = btnColor,
		size = UDim2.new(0, 130, 0, 40),
		pos = UDim2.new(1, -12, 1, -12),
		anchor = Vector2.new(1, 1),
		textSize = 14,
	}, row)
	if clickable then
		table.insert(costButtons, {btn = buy, cost = it.cost})
		buy.MouseButton1Click:Connect(function()
			doBuy("item", it.id)
		end)
	end
end

shopWin.refresh = function()
	-- tab visuals
	for _, tab in ipairs(TABS) do
		local btn = tabButtons[tab.id]
		local unlocked = tabUnlocked(tab.id)
		local label = tab.emoji .. " " .. tab.label
		if not unlocked then
			label = "\u{1F512} " .. tab.label
		end
		btn.Text = label
		if tab.id == currentTab then
			btn.BackgroundColor3 = COL.cardHi
			btn.TextColor3 = COL.text
		else
			btn.BackgroundColor3 = COL.card
			if unlocked then
				btn.TextColor3 = COL.sub
			else
				btn.TextColor3 = Color3.fromRGB(110, 114, 128)
			end
		end
	end

	clearFrame(itemList)
	mk("UIListLayout", {
		FillDirection = Enum.FillDirection.Vertical,
		Padding = UDim.new(0, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, itemList)
	mk("UIPadding", {
		PaddingTop = UDim.new(0, 4), PaddingLeft = UDim.new(0, 2),
		PaddingRight = UDim.new(0, 2), PaddingBottom = UDim.new(0, 4),
	}, itemList)

	if not tabUnlocked(currentTab) then
		-- locked tab: big lock + requirement
		local lockText = "\u{1F512}"
		for _, tab in ipairs(TABS) do
			if tab.id == currentTab then
				lockText = "\u{1F512}  " .. tab.lockText
			end
		end
		local lockCard = mk("Frame", {
			BackgroundColor3 = COL.card,
			Size = UDim2.new(1, -8, 0, 120),
			LayoutOrder = 1,
		}, itemList)
		corner(lockCard, 12)
		stroke(lockCard, COL.stroke, 1, 0.4)
		mk("TextLabel", {
			BackgroundTransparency = 1,
			Size = UDim2.new(1, -20, 1, 0),
			Position = UDim2.new(0, 10, 0, 0),
			Font = Enum.Font.GothamBlack,
			Text = lockText,
			TextSize = 22,
			TextColor3 = COL.sub,
			TextWrapped = true,
		}, lockCard)
		return
	end

	local order = 0
	for _, it in ipairs(ITEMS) do
		if it.world == currentTab then
			order = order + 1
			buildItemRow(it, order, itemList)
		end
	end
	updateAffordability()
end

--------------------------------------------------------------------
-- SECTION: Rebirth window - 7 cards + live multi breakdown
--------------------------------------------------------------------

local rebirthWin = makeWindow("Rebirth", "REBIRTH", "\u{1F504}")

local breakdownLabel = mk("TextLabel", {
	Name = "Breakdown",
	BackgroundColor3 = COL.card,
	Size = UDim2.new(1, 0, 0, 34),
	Font = Enum.Font.GothamBold,
	Text = "",
	TextSize = 14,
	TextColor3 = COL.gold,
	TextWrapped = true,
}, rebirthWin.content)
corner(breakdownLabel, 10)
stroke(breakdownLabel, COL.stroke, 1, 0.4)

local rebirthList = mk("ScrollingFrame", {
	Name = "RebirthList",
	BackgroundTransparency = 1,
	Position = UDim2.new(0, 0, 0, 42),
	Size = UDim2.new(1, 0, 1, -42),
	CanvasSize = UDim2.new(0, 0, 0, 0),
	AutomaticCanvasSize = Enum.AutomaticSize.Y,
	ScrollBarThickness = 6,
	ScrollBarImageColor3 = COL.stroke,
	BorderSizePixel = 0,
}, rebirthWin.content)

local function updateBreakdown()
	local lvl = attrNum("RebirthLevel", 0)
	local ladder = LADDER[lvl] or 1
	local spaceM = 1
	if attrBool("SpaceUnlocked") then spaceM = 3 end
	local dumbM = 1
	if attrBool("DumbbellMulti") then dumbM = 50000 end
	local lavaM = 1
	if attrBool("LavaUnlocked") then lavaM = 40 end
	local megaM = 1
	if attrBool("Mega100k") then megaM = 10 end
	breakdownLabel.Text = "Multi: x" .. fmt(ladder) .. " ladder  \u{00D7}  x" .. fmt(spaceM)
		.. " space  \u{00D7}  x" .. fmt(dumbM) .. " dumbbell  \u{00D7}  x" .. fmt(lavaM)
		.. " lava  \u{00D7}  x" .. fmt(megaM) .. " 100K club  =  x" .. fmt(attrNum("Multi", 1))
end

-- Availability gate for each rebirth card, mirroring the server rules.
-- Returns: available(bool), lockText(string or nil), done(bool)
local function rebirthGate(id)
	local lvl = attrNum("RebirthLevel", 0)
	local du = attrBool("DumbbellUnlocked")
	local dm = attrBool("DumbbellMulti")
	local lu = attrBool("LavaUnlocked")
	if id == "r1" then
		if lvl >= 1 then return false, nil, true end
		return true, nil, false
	elseif id == "r2" then
		if lvl >= 2 then return false, nil, true end
		if lvl >= 1 then return true, nil, false end
		return false, "Requires Rebirth 1", false
	elseif id == "r3" then
		if lvl >= 3 then return false, nil, true end
		if lvl >= 2 then return true, nil, false end
		return false, "Requires Rebirth 2", false
	elseif id == "r4" then
		if lvl >= 4 then return false, nil, true end
		if lvl >= 3 then return true, nil, false end
		return false, "Requires Rebirth 3", false
	elseif id == "r5" then
		if du then return false, nil, true end
		if lvl >= 4 then return true, nil, false end
		return false, "Requires Rebirth 4", false
	elseif id == "r5b" then
		if dm then return false, nil, true end
		if du then return true, nil, false end
		return false, "Requires Rebirth 5", false
	elseif id == "r6" then
		if lu then return false, nil, true end
		if dm then return true, nil, false end
		return false, "Requires Rebirth 5 \u{2605}", false
	end
	return false, "?", false
end

rebirthWin.refresh = function()
	updateBreakdown()
	clearFrame(rebirthList)
	mk("UIListLayout", {
		FillDirection = Enum.FillDirection.Vertical,
		Padding = UDim.new(0, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, rebirthList)
	mk("UIPadding", {
		PaddingTop = UDim.new(0, 4), PaddingLeft = UDim.new(0, 2),
		PaddingRight = UDim.new(0, 2), PaddingBottom = UDim.new(0, 4),
	}, rebirthList)

	for i, id in ipairs(REBIRTH_ORDER) do
		local def = REBIRTHS[id]
		local available, lockText, done = rebirthGate(id)

		local card = mk("Frame", {
			Name = "Rebirth_" .. id,
			BackgroundColor3 = COL.card,
			Size = UDim2.new(1, -8, 0, 96),
			LayoutOrder = i,
		}, rebirthList)
		corner(card, 12)
		stroke(card, COL.stroke, 1, 0.4)

		mk("TextLabel", {
			BackgroundTransparency = 1,
			Position = UDim2.new(0, 12, 0, 8),
			Size = UDim2.new(0.5, 0, 0, 22),
			Font = Enum.Font.GothamBlack,
			Text = def.name,
			TextSize = 18,
			TextColor3 = COL.text,
			TextXAlignment = Enum.TextXAlignment.Left,
		}, card)
		mk("TextLabel", {
			BackgroundTransparency = 1,
			Position = UDim2.new(0, 12, 0, 30),
			Size = UDim2.new(1, -180, 1, -38),
			Font = Enum.Font.Gotham,
			Text = def.blurb,
			TextSize = 12,
			TextColor3 = COL.sub,
			TextWrapped = true,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextYAlignment = Enum.TextYAlignment.Top,
		}, card)
		mk("TextLabel", {
			BackgroundTransparency = 1,
			AnchorPoint = Vector2.new(1, 0),
			Position = UDim2.new(1, -12, 0, 8),
			Size = UDim2.new(0, 150, 0, 20),
			Font = Enum.Font.GothamBlack,
			Text = "\u{1FAD9} " .. fmt(def.cost),
			TextSize = 16,
			TextColor3 = COL.gold,
			TextXAlignment = Enum.TextXAlignment.Right,
		}, card)

		local btnText, btnColor
		if done then
			btnText = "\u{2714} DONE"
			btnColor = COL.gray
		elseif available then
			btnText = "REBIRTH"
			btnColor = COL.red
		else
			btnText = "\u{1F512} " .. lockText
			btnColor = COL.gray
		end
		local btn = makeButton({
			text = btnText,
			color = btnColor,
			size = UDim2.new(0, 150, 0, 42),
			pos = UDim2.new(1, -12, 1, -10),
			anchor = Vector2.new(1, 1),
			textSize = 14,
		}, card)
		if available then
			-- double-click ARE-YOU-SURE confirm
			local pending = false
			btn.MouseButton1Click:Connect(function()
				if pending then
					pending = false
					btn.Text = "REBIRTH"
					doBuy("rebirth", id)
				else
					pending = true
					btn.Text = "ARE YOU SURE?"
					btn.BackgroundColor3 = COL.gold
					btn.TextColor3 = Color3.fromRGB(40, 30, 0)
					task.delay(3, function()
						if pending and btn.Parent then
							pending = false
							btn.Text = "REBIRTH"
							btn.BackgroundColor3 = COL.red
							btn.TextColor3 = Color3.new(1, 1, 1)
						end
					end)
				end
			end)
		end
	end
end

--------------------------------------------------------------------
-- SECTION: Titles window - grid of colored title cards
--------------------------------------------------------------------

local titlesWin = makeWindow("Titles", "TITLES", "\u{1F3C6}")

local titlesGridHolder = mk("ScrollingFrame", {
	Name = "TitlesGrid",
	BackgroundTransparency = 1,
	Size = UDim2.new(1, 0, 1, 0),
	CanvasSize = UDim2.new(0, 0, 0, 0),
	AutomaticCanvasSize = Enum.AutomaticSize.Y,
	ScrollBarThickness = 6,
	ScrollBarImageColor3 = COL.stroke,
	BorderSizePixel = 0,
}, titlesWin.content)

titlesWin.refresh = function()
	clearFrame(titlesGridHolder)
	mk("UIGridLayout", {
		CellSize = UDim2.new(0.333, -8, 0, 120),
		CellPadding = UDim2.new(0, 8, 0, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
		HorizontalAlignment = Enum.HorizontalAlignment.Left,
	}, titlesGridHolder)
	mk("UIPadding", {
		PaddingTop = UDim.new(0, 4), PaddingLeft = UDim.new(0, 2),
		PaddingRight = UDim.new(0, 2), PaddingBottom = UDim.new(0, 4),
	}, titlesGridHolder)

	local equipped = equippedTitleName()
	for i, t in ipairs(TITLES) do
		local threshold = t[1]
		local name = t[2]
		local rgb = t[3]
		local hasMorph = t[4]
		local titleColor = Color3.fromRGB(rgb[1], rgb[2], rgb[3])
		local unlocked = state.titles[name] == true

		local card = mk("Frame", {
			Name = "Title_" .. i,
			BackgroundColor3 = COL.card,
			LayoutOrder = i,
		}, titlesGridHolder)
		corner(card, 12)
		local cardStroke = stroke(card, COL.stroke, 1.5, 0.35)
		if unlocked then
			cardStroke.Color = titleColor
			cardStroke.Transparency = 0.25
		end

		mk("TextLabel", {
			BackgroundTransparency = 1,
			Position = UDim2.new(0, 6, 0, 8),
			Size = UDim2.new(1, -12, 0, 24),
			Font = Enum.Font.GothamBlack,
			Text = name,
			TextSize = 16,
			TextColor3 = titleColor,
			TextTruncate = Enum.TextTruncate.AtEnd,
		}, card)

		if unlocked then
			local isEq = (equipped == name)
			local eqText = "EQUIP"
			local eqColor = COL.green
			if isEq then
				eqText = "UNEQUIP"
				eqColor = COL.gray
			end
			local btnH = 30
			local btnY = UDim2.new(0.5, 0, 1, -8)
			if hasMorph then
				btnY = UDim2.new(0.5, 0, 1, -44)
			end
			local eqBtn = makeButton({
				text = eqText,
				color = eqColor,
				size = UDim2.new(1, -16, 0, btnH),
				pos = btnY,
				anchor = Vector2.new(0.5, 1),
				textSize = 13,
			}, card)
			eqBtn.MouseButton1Click:Connect(function()
				if isEq then
					doEquip("title", "")
				else
					doEquip("title", name)
				end
			end)
			if hasMorph then
				-- The Rock: extra MORPH ON/OFF toggle
				local mOn = morphOn()
				local mText = "MORPH: OFF"
				local mColor = COL.gray
				if mOn then
					mText = "MORPH: ON"
					mColor = Color3.fromRGB(120, 120, 115)
				end
				local mBtn = makeButton({
					text = mText,
					color = mColor,
					size = UDim2.new(1, -16, 0, 30),
					pos = UDim2.new(0.5, 0, 1, -8),
					anchor = Vector2.new(0.5, 1),
					textSize = 13,
				}, card)
				mBtn.MouseButton1Click:Connect(function()
					if mOn then
						doEquip("morph", "")
					else
						doEquip("morph", "on")
					end
				end)
			end
		else
			mk("TextLabel", {
				BackgroundTransparency = 1,
				AnchorPoint = Vector2.new(0.5, 1),
				Position = UDim2.new(0.5, 0, 1, -10),
				Size = UDim2.new(1, -12, 0, 44),
				Font = Enum.Font.GothamBold,
				Text = "\u{1F512} reach " .. fmt(threshold) .. " lifetime",
				TextSize = 13,
				TextColor3 = COL.sub,
				TextWrapped = true,
			}, card)
		end
	end
end

--------------------------------------------------------------------
-- SECTION: Auras window - 4 flashy gradient cards
--------------------------------------------------------------------

local aurasWin = makeWindow("Auras", "AURAS", "\u{2728}")

local aurasList = mk("ScrollingFrame", {
	Name = "AurasList",
	BackgroundTransparency = 1,
	Size = UDim2.new(1, 0, 1, 0),
	CanvasSize = UDim2.new(0, 0, 0, 0),
	AutomaticCanvasSize = Enum.AutomaticSize.Y,
	ScrollBarThickness = 6,
	ScrollBarImageColor3 = COL.stroke,
	BorderSizePixel = 0,
}, aurasWin.content)

local auraGradients = {} -- animated: {grad=UIGradient}

local RAINBOW_SEQ = ColorSequence.new({
	ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 60, 60)),
	ColorSequenceKeypoint.new(0.2, Color3.fromRGB(255, 200, 40)),
	ColorSequenceKeypoint.new(0.4, Color3.fromRGB(70, 230, 90)),
	ColorSequenceKeypoint.new(0.6, Color3.fromRGB(60, 170, 255)),
	ColorSequenceKeypoint.new(0.8, Color3.fromRGB(160, 80, 255)),
	ColorSequenceKeypoint.new(1, Color3.fromRGB(255, 60, 60)),
})

aurasWin.refresh = function()
	clearFrame(aurasList)
	for i = #auraGradients, 1, -1 do
		table.remove(auraGradients, i)
	end
	mk("UIListLayout", {
		FillDirection = Enum.FillDirection.Vertical,
		Padding = UDim.new(0, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, aurasList)
	mk("UIPadding", {
		PaddingTop = UDim.new(0, 4), PaddingLeft = UDim.new(0, 2),
		PaddingRight = UDim.new(0, 2), PaddingBottom = UDim.new(0, 4),
	}, aurasList)

	local equipped = equippedAuraId()
	for i, aura in ipairs(AURAS) do
		local owned = state.auras[aura.id] == true
		local card = mk("Frame", {
			Name = "Aura_" .. aura.id,
			BackgroundColor3 = COL.card,
			Size = UDim2.new(1, -8, 0, 108),
			LayoutOrder = i,
			ClipsDescendants = true,
		}, aurasList)
		corner(card, 12)
		stroke(card, COL.stroke, 1, 0.4)

		-- flashy gradient header strip
		local strip = mk("Frame", {
			Name = "Strip",
			BackgroundColor3 = Color3.new(1, 1, 1),
			Size = UDim2.new(1, 0, 0, 34),
		}, card)
		corner(strip, 12)
		local grad
		if aura.id == "rainbowgod" then
			grad = mk("UIGradient", {Color = RAINBOW_SEQ, Rotation = 0}, strip)
		else
			local pair = AURA_GRADS[aura.id]
			grad = mk("UIGradient", {
				Color = ColorSequence.new(pair[1], pair[2]),
				Rotation = 0,
			}, strip)
		end
		table.insert(auraGradients, {grad = grad})
		mk("TextLabel", {
			BackgroundTransparency = 1,
			Size = UDim2.new(1, -16, 1, 0),
			Position = UDim2.new(0, 8, 0, 0),
			Font = Enum.Font.GothamBlack,
			Text = aura.name,
			TextSize = 16,
			TextColor3 = Color3.new(1, 1, 1),
			TextStrokeTransparency = 0.4,
			TextStrokeColor3 = Color3.new(0, 0, 0),
			TextXAlignment = Enum.TextXAlignment.Left,
			TextTruncate = Enum.TextTruncate.AtEnd,
			ZIndex = 2,
		}, strip)

		mk("TextLabel", {
			BackgroundTransparency = 1,
			Position = UDim2.new(0, 10, 0, 40),
			Size = UDim2.new(1, -180, 1, -48),
			Font = Enum.Font.Gotham,
			Text = aura.desc,
			TextSize = 13,
			TextColor3 = COL.sub,
			TextWrapped = true,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextYAlignment = Enum.TextYAlignment.Top,
		}, card)

		if owned then
			local isEq = (equipped == aura.id)
			local eqText = "EQUIP"
			local eqColor = COL.green
			if isEq then
				eqText = "UNEQUIP"
				eqColor = COL.gray
			end
			local btn = makeButton({
				text = eqText,
				color = eqColor,
				size = UDim2.new(0, 150, 0, 40),
				pos = UDim2.new(1, -12, 1, -12),
				anchor = Vector2.new(1, 1),
				textSize = 14,
			}, card)
			btn.MouseButton1Click:Connect(function()
				if isEq then
					doEquip("aura", "")
				else
					doEquip("aura", aura.id)
				end
			end)
		else
			mk("TextLabel", {
				BackgroundTransparency = 1,
				AnchorPoint = Vector2.new(1, 1),
				Position = UDim2.new(1, -12, 1, -56),
				Size = UDim2.new(0, 150, 0, 20),
				Font = Enum.Font.GothamBlack,
				Text = "\u{1FAD9} " .. fmt(aura.cost),
				TextSize = 15,
				TextColor3 = COL.gold,
				TextXAlignment = Enum.TextXAlignment.Right,
			}, card)
			local btn = makeButton({
				text = "BUY",
				color = COL.gray,
				size = UDim2.new(0, 150, 0, 40),
				pos = UDim2.new(1, -12, 1, -12),
				anchor = Vector2.new(1, 1),
				textSize = 14,
			}, card)
			table.insert(costButtons, {btn = btn, cost = aura.cost})
			btn.MouseButton1Click:Connect(function()
				doBuy("aura", aura.id)
			end)
		end
	end
	updateAffordability()
end

--------------------------------------------------------------------
-- SECTION: Teleport window - 4 destination buttons
--------------------------------------------------------------------

local teleWin = makeWindow("Teleport", "TELEPORT", "\u{1F300}")

local teleList = mk("Frame", {
	Name = "TeleList",
	BackgroundTransparency = 1,
	Size = UDim2.new(1, 0, 1, 0),
}, teleWin.content)

teleWin.refresh = function()
	clearFrame(teleList)
	mk("UIListLayout", {
		FillDirection = Enum.FillDirection.Vertical,
		Padding = UDim.new(0, 10),
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		VerticalAlignment = Enum.VerticalAlignment.Center,
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, teleList)

	for i, dest in ipairs(TELEPORTS) do
		local unlocked = tabUnlocked(dest.id)
		local text = dest.emoji .. "  " .. dest.name
		local color = COL.blue
		if not unlocked then
			text = "\u{1F512} " .. dest.name .. "  -  " .. dest.lockText
			color = COL.gray
		end
		local btn = makeButton({
			text = text,
			color = color,
			size = UDim2.new(0.85, 0, 0, 56),
			textSize = 18,
			order = i,
			radius = 14,
		}, teleList)
		if unlocked then
			btn.MouseButton1Click:Connect(function()
				doBuy("teleport", dest.id)
			end)
		end
	end
end

--------------------------------------------------------------------
-- SECTION: attribute wiring + state refresh triggers
--------------------------------------------------------------------

-- Count-up target for the HUD strength counter.
local displayPoints = attrNum("Points", 0)

player:GetAttributeChangedSignal("Multi"):Connect(function()
	updateChips()
	if openName == "Rebirth" then
		updateBreakdown()
	end
end)
player:GetAttributeChangedSignal("SizeMult"):Connect(updateChips)
player:GetAttributeChangedSignal("AutoUnlocked"):Connect(function()
	updateAutoChip()
end)

-- Unlock-flag / equip-state attributes: refresh whatever window is open
-- so locks, DONE states and EQUIP labels stay correct.
local REFRESH_ATTRS = {
	"RebirthLevel", "SpaceUnlocked", "DumbbellUnlocked",
	"DumbbellMulti", "LavaUnlocked", "EquippedTitle", "EquippedAura", "Morph",
}
for _, attrName in ipairs(REFRESH_ATTRS) do
	player:GetAttributeChangedSignal(attrName):Connect(function()
		refreshOpenWindow()
	end)
end

RE_StateChanged.OnClientEvent:Connect(function()
	refreshState()
end)

--------------------------------------------------------------------
-- SECTION: the single render loop - HUD count-up, affordability
-- recolor (throttled), viewport orbit + animated aura gradients
--------------------------------------------------------------------

local affordClock = 0
local gradClock = 0

RunService.RenderStepped:Connect(function(dt)
	-- animated count-up toward the Points attribute
	local target = attrNum("Points", 0)
	local diff = target - displayPoints
	if math.abs(diff) < 1 then
		displayPoints = target
	else
		local step = diff * math.min(dt * 8, 1)
		-- always move at least 1 so tiny gains still animate to completion
		if step > 0 and step < 1 then step = 1 end
		if step < 0 and step > -1 then step = -1 end
		displayPoints = displayPoints + step
	end
	counterLabel.Text = "\u{1F4AA} " .. fmt(displayPoints)

	-- throttled BUY button affordability recolor
	affordClock = affordClock + dt
	if affordClock >= 0.25 then
		affordClock = 0
		if holder.Visible then
			updateAffordability()
		end
	end

	-- viewport spin: only while the shop window is actually visible
	if openName == "Shop" and holder.Visible then
		for i = #spinEntries, 1, -1 do
			local e = spinEntries[i]
			if not e.vp.Parent then
				table.remove(spinEntries, i)
			else
				e.angle = e.angle + dt * 0.9
				e.cam.CFrame = CFrame.new(
					e.center + Vector3.new(
						math.sin(e.angle) * e.dist, e.lift, math.cos(e.angle) * e.dist),
					e.center)
			end
		end
	else
		-- prune destroyed viewports even while hidden so the list stays small
		for i = #spinEntries, 1, -1 do
			if not spinEntries[i].vp.Parent then
				table.remove(spinEntries, i)
			end
		end
	end

	-- animated aura gradient headers
	if openName == "Auras" and holder.Visible then
		gradClock = gradClock + dt * 60
		for i = #auraGradients, 1, -1 do
			local g = auraGradients[i]
			if not g.grad.Parent then
				table.remove(auraGradients, i)
			else
				g.grad.Rotation = gradClock % 360
			end
		end
	end
end)

--------------------------------------------------------------------
-- SECTION: startup
--------------------------------------------------------------------

updateChips()
updateAutoChip()
refreshState()

-- Retry initial state fetch a few times in case the server is still booting.
task.spawn(function()
	for _ = 1, 5 do
		task.wait(2)
		if state and next(state.items or {}) ~= nil then
			break
		end
		refreshState()
	end
end)
